-- ============================================================
-- INVENTARIO PER SETTORE E CLIENTI MAISON CON CATEGORIA E CESTINO (21/10/2026)
-- 1) INVENTARIO E MAISON: secure_read dava a ogni operatore i movimenti di inventario e i
--    costi Maison (con i buoni) di TUTTI i settori: arrivavano nel programma, lo schermo li
--    filtrava, il database no. Ora, come il Diario (_ambito_registrazioni): chi non e
--    amministratore legge inventario, costi, spese extra, regali, note e clienti Maison dei
--    suoi settori (il suo e gli accessi extra); i movimenti dell inventario li
--    scrive (aggiunge, modifica, cancella, sposta) solo dove puo scrivere (accessi extra
--    con "modifica"). Un movimento di un altro settore chiesto per numero e un errore.
--    Chi ha tutti i settori (entrambi) e l amministratore: come prima.
-- 2) CLIENTI MAISON (maison_budget): categoria anche CG, WL e ogni tipo di buono
--    configurato (sigla in minuscolo, la stessa regola delle sigle dei costi), e vuota
--    ammessa (prima "salva senza categoria" falliva sul vincolo); Togli = nel Cestino
--    (eliminato, eliminato_da, eliminato_at): i compleanni non mostrano i clienti tolti.
-- Funzioni nuove: 1 (_ambito_settore). Cambiate: 5 (secure_read, secure_update,
-- secure_delete, _controlla_permessi_scrittura, get_today_birthdays). Rilanciabile.
-- ============================================================
BEGIN;

ALTER TABLE public.maison_budget ADD COLUMN IF NOT EXISTS eliminato boolean NOT NULL DEFAULT false;
ALTER TABLE public.maison_budget ADD COLUMN IF NOT EXISTS eliminato_da text;
ALTER TABLE public.maison_budget ADD COLUMN IF NOT EXISTS eliminato_at timestamptz;
ALTER TABLE public.maison_budget DROP CONSTRAINT IF EXISTS maison_budget_categoria_check;
ALTER TABLE public.maison_budget ADD CONSTRAINT maison_budget_categoria_check CHECK (
  categoria IS NULL OR categoria = '' OR categoria = 'full_maison' OR categoria ~ '^[a-z][a-z0-9]{1,5}$'
);

CREATE OR REPLACE FUNCTION public._ambito_settore(p_token text, p_scrittura boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, p_scrittura);
BEGIN
  IF v_set IS NULL THEN RETURN ''; END IF;
  RETURN ' AND lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])';
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public._ambito_settore(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ambito_settore(text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.secure_read(p_token text, p_table text, p_filter text DEFAULT ''::text, p_order text DEFAULT ''::text, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_query TEXT;
  v_from TEXT;
  v_amb TEXT := '';
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF NOT _ordine_sicuro(p_order) THEN
    RAISE EXCEPTION 'Ordinamento non valido';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati',
    'piano', 'piano_turni', 'piano_codici', 'piano_fabbisogni', 'piano_regole', 'piano_festivi', 'piano_timbrature', 'piano_mappature', 'piano_vacanze', 'piano_regole_gruppo', 'piano_formulari', 'piano_briefing', 'collab_congedi_np', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_festivita', 'piano_ore_mese'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  -- 20260911: cosa legge chi non e amministratore (la tabella diventa una vista ristretta
  -- con lo stesso nome, cosi filtro e ordinamento restano quelli di sempre)
  v_from := quote_ident(p_table);
  IF NOT v_admin THEN
    IF p_table = 'log_attivita' AND NOT _pagina_visibile(p_token, 'registro') THEN
      -- proprie righe, righe del piano (storico, cambi) e ultimo accesso dei colleghi
      v_from := '(SELECT id, operatore, azione, dettaglio, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore = ' || quote_literal(v_op) || ' OR azione ILIKE ''%piano%'''
        || ' UNION ALL SELECT u.id, u.operatore, ''''::text, ''''::text, u.created_at, u.reparto_dip FROM'
        || ' (SELECT DISTINCT ON (operatore) id, operatore, azione, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore IS DISTINCT FROM ' || quote_literal(v_op) || ' ORDER BY operatore, created_at DESC) u'
        || ' WHERE u.azione NOT ILIKE ''%piano%'') log_attivita';
    ELSIF p_table IN ('costi_maison', 'spese_extra', 'regali_maison', 'note_clienti')
          AND NOT _pagina_visibile(p_token, 'maison') THEN
      v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE false) ' || quote_ident(p_table);
    ELSIF p_table = 'maison_budget' AND NOT _pagina_visibile(p_token, 'maison') THEN
      IF _pagina_visibile(p_token, 'alert_compleanni') THEN
        v_from := '(' || _proiezione('maison_budget', ARRAY['id', 'nome', 'data_nascita', 'reparto_dip'])
          || ' WHERE data_nascita IS NOT NULL AND eliminato IS NOT TRUE' || _ambito_settore(p_token, false) || ') maison_budget';
      ELSE
        v_from := '(SELECT * FROM maison_budget WHERE false) maison_budget';
      END IF;
    ELSIF p_table = 'registrazioni' THEN
      v_amb := _ambito_registrazioni(p_token);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM registrazioni WHERE TRUE' || v_amb || ') registrazioni';
      END IF;
    -- 20260926: INVENTARIO E MAISON PER SETTORE (come il Diario): solo le righe dei settori
    -- dell operatore (il suo e gli accessi extra); chi ha tutti i settori legge tutto
    ELSIF p_table IN ('inventario', 'costi_maison', 'spese_extra', 'regali_maison', 'note_clienti', 'maison_budget') THEN
      v_amb := _ambito_settore(p_token, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE TRUE' || v_amb || ') ' || quote_ident(p_table);
      END IF;
    ELSIF p_table = 'push_subscriptions' THEN
      v_from := '(SELECT * FROM push_subscriptions WHERE operatore = ' || quote_literal(v_op) || ') push_subscriptions';
    -- 20260913: il Rapporto lo legge chi ha la pagina Rapporto (gli altri: vuoto, niente errore)
    ELSIF p_table = 'rapporti_giornalieri' AND NOT _pagina_visibile(p_token, 'rapporto') THEN
      v_from := '(SELECT * FROM rapporti_giornalieri WHERE false) rapporti_giornalieri';
    END IF;
  END IF;

  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || v_from;

  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
    -- costi dell organico (v354): solo chi vede la scheda Organico
    IF NOT _sessione_permesso(p_token, 'ptab_organico') THEN
      v_query := v_query || ' AND chiave <> ''piano_organico_costi''';
    END IF;
    IF p_filter != '' THEN
      v_query := v_query || ' AND (' || p_filter || ')';
    END IF;
  ELSIF p_table = 'chat_messages' THEN
    v_query := v_query || ' WHERE id NOT IN (SELECT message_id FROM chat_message_hidden WHERE operatore = ' || quote_literal(v_op) || ') AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op) || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
  -- DATI HR RISERVATI (v348): chi non ha il permesso non li riceve proprio
  ELSIF p_table = 'valutazioni' AND NOT (_sessione_permesso(p_token, 'vista_valutazioni') OR _sessione_permesso(p_token, 'gestione_valutazioni')) THEN
    v_query := v_query || ' WHERE false';
  ELSIF p_table = 'hr_eventi' AND NOT _hr_vede(p_token) THEN
    -- chi registra le formazioni vede solo formazioni, livelli e premi
    IF _sessione_permesso(p_token, 'gestione_formazioni') THEN
      v_query := v_query || ' WHERE tipo IN (''formazione'', ''livello'', ''premio'')';
      IF p_filter != '' THEN
        v_query := v_query || ' AND (' || p_filter || ')';
      END IF;
    ELSE
      v_query := v_query || ' WHERE false';
    END IF;
  ELSIF p_table = 'hr_allegati' AND NOT (_hr_vede(p_token) OR _sessione_permesso(p_token, 'gestione_formazioni')) THEN
    v_query := v_query || ' WHERE false';
  ELSIF p_filter != '' THEN
    v_query := v_query || ' WHERE ' || p_filter;
  END IF;

  IF p_order != '' THEN
    v_query := v_query || ' ORDER BY ' || p_order;
  END IF;

  v_query := v_query || ' LIMIT ' || GREATEST(1, LEAST(p_limit, 10000)) || ' OFFSET ' || GREATEST(0, COALESCE(p_offset, 0)) || ') t';

  EXECUTE v_query INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.secure_update(p_token text, p_table text, p_filter text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT := '';
  v_key TEXT;
  v_val JSONB;
  v_ambito TEXT := '';
  v_autore TEXT;
  v_con_autore BOOLEAN := false;
  v_fuori BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF p_table = 'impostazioni' AND NOT v_admin THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;
  IF jsonb_typeof(COALESCE(p_data, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Dati non validi';
  END IF;

  -- 20260913: registrazioni e moduli: l autore si puo rimandare uguale (la modifica di un
  -- modulo lo manda sempre), non cambiare. Rapporto: l autore e chi salva.
  IF NOT v_admin AND p_table IN ('registrazioni', 'moduli') AND p_data ? 'operatore' THEN
    v_autore := p_data ->> 'operatore';
    v_con_autore := true;
    p_data := p_data - 'operatore';
  END IF;
  IF NOT v_admin AND p_table = 'rapporti_giornalieri' AND p_data ? 'operatore' THEN
    p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'update', p_data);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Modifica senza filtro: mai su tutta la tabella';
  END IF;
  -- 20260911: forme di filtro ammesse per chi non e amministratore
  PERFORM _controlla_filtro_scrittura(p_token, p_table, 'update', p_filter);

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati',
    'piano', 'piano_turni', 'piano_codici', 'piano_fabbisogni', 'piano_regole', 'piano_festivi', 'piano_timbrature', 'piano_mappature', 'piano_vacanze', 'piano_regole_gruppo', 'piano_formulari', 'piano_briefing', 'collab_congedi_np', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_festivita', 'piano_ore_mese'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  IF v_con_autore THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
      || ') AND operatore IS DISTINCT FROM ' || quote_nullable(v_autore) || ')' INTO v_fuori;
    IF v_fuori THEN
      RAISE EXCEPTION 'Numero, data di creazione e autore non si modificano';
    END IF;
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  -- v434: l autore di messaggi e note non si cambia (resta chi l ha scritto)
  IF p_table IN ('chat_messages', 'note_colleghi') AND p_data ? 'da_operatore' AND NOT v_admin THEN
    p_data := p_data - 'da_operatore';
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_set != '' THEN v_set := v_set || ', '; END IF;
    IF v_val = 'null'::jsonb THEN
      v_set := v_set || quote_ident(v_key) || ' = NULL';
    ELSIF jsonb_typeof(v_val) = 'string' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'boolean' THEN
      v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
    ELSE
      v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val::text);
    END IF;
  END LOOP;

  -- v407: messaggi e note dei colleghi si modificano solo se propri; le reazioni le
  -- aggiunge chi partecipa alla conversazione; l amministratore tutto
  IF p_table IN ('chat_messages', 'note_colleghi') AND NOT v_admin THEN
    IF p_table = 'chat_messages' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k <> 'reazioni') THEN
      v_ambito := ' AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op)
        || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
    ELSE
      v_ambito := ' AND da_operatore = ' || quote_literal(v_op);
    END IF;
  -- v434: piano e chat con il loro ambito; 20260911: Diario e collaboratori per settore,
  -- notifiche e letture solo proprie, password mai da qui
  ELSIF p_table = 'piano' THEN
    v_ambito := _piano_ambito_diario(p_token, 'update', p_data);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := _chat_ambito(p_token, p_table);
  ELSIF NOT v_admin AND p_table = 'registrazioni' THEN
    v_ambito := _ambito_registrazioni(p_token);
  ELSIF NOT v_admin AND p_table = 'collaboratori' THEN
    v_ambito := _ambito_collaboratori(p_token);
  -- 20260926: movimenti dell inventario dei settori dove l operatore scrive
  ELSIF NOT v_admin AND p_table = 'inventario' THEN
    v_ambito := _ambito_settore(p_token, true);
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op);
  ELSIF p_table = 'impostazioni' THEN
    v_ambito := ' AND chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'')';
  END IF;

  -- 20260913: riga chiesta per numero ma esclusa dai permessi: errore, non "fatto" con 0
  -- righe. Una riga che non corrisponde al filtro di valore (es. completata = false) non
  -- e esclusa dai permessi: 0 righe senza errore, come sempre.
  IF NOT v_admin AND v_ambito <> '' AND _filtro_per_id(p_filter) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
      || ') AND NOT COALESCE((TRUE' || v_ambito || '), false))' INTO v_fuori;
    IF v_fuori THEN
      RAISE EXCEPTION 'Permesso mancante: % fuori dai tuoi permessi (settore, autore o gruppo)', p_table;
    END IF;
  END IF;

  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ')' || v_ambito;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_ambito TEXT := '';
  v_amb_inv TEXT := '';
  v_fuori BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF p_table IN ('log_attivita') AND NOT v_admin THEN
    RAISE EXCEPTION 'registro riservato all amministratore';
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'delete', NULL);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Cancellazione senza filtro: mai su tutta la tabella';
  END IF;
  -- 20260911: forme di filtro ammesse per chi non e amministratore
  PERFORM _controlla_filtro_scrittura(p_token, p_table, 'delete', p_filter);
  IF p_filter !~ '^id (= ''[^'']*''|IN \(''[^'']*''(, ''[^'']*'')*\))$' THEN
    IF p_table = 'piano' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_genera')
         OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      SELECT l.reparto, l.da, l.a INTO v_rep, v_da, v_a FROM _piano_auto_lasciapassare(p_token) l;
      IF v_rep IS NULL THEN
        RAISE EXCEPTION 'Permesso mancante: azioni automatiche del piano';
      END IF;
      v_ambito := ' AND data BETWEEN ' || quote_literal(v_da) || ' AND ' || quote_literal(v_a)
        || ' AND reparto_dip = ' || quote_literal(v_rep) || ' AND generato = true';
    END IF;
    IF p_table = 'piano_vacanze' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_vacanze')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      RAISE EXCEPTION 'Permesso mancante: vacanze automatiche';
    END IF;
    IF p_table = 'piano_fabbisogni' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
         OR _permesso_piano_auto(p_token, 'piano_auto_import') OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      RAISE EXCEPTION 'Permesso mancante: piano';
    END IF;
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati',
    'piano', 'piano_turni', 'piano_codici', 'piano_fabbisogni', 'piano_regole', 'piano_festivi', 'piano_timbrature', 'piano_mappature', 'piano_vacanze', 'piano_regole_gruppo', 'piano_formulari', 'piano_briefing', 'collab_congedi_np', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_festivita', 'piano_ore_mese'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  IF p_table IN ('chat_messages', 'note_colleghi') AND NOT v_admin THEN
    v_ambito := v_ambito || ' AND da_operatore = ' || quote_literal(v_op);
  END IF;
  -- v434: piano (percorso del Diario per chi non scrive il piano) e chat
  IF p_table = 'piano' THEN
    v_ambito := v_ambito || _piano_ambito_diario(p_token, 'delete', NULL);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := v_ambito || _chat_ambito(p_token, p_table);
  -- 20260911: solo le proprie letture e notifiche; punti solo degli incentivi permessi
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := v_ambito || ' AND operatore = ' || quote_literal(v_op);
  ELSIF NOT v_admin AND p_table = 'punti_eventi' AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    v_ambito := v_ambito || ' AND (azione IN (''copertura'', ''cambio_turno'', ''disponibilita_negata'')'
      || CASE WHEN _sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                   OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione = ''competenza'' OR azione ~ ''^livello_[0-9]+$''' ELSE '' END
      || CASE WHEN _sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione IN (''sessione_formativa'', ''formatore'')' ELSE '' END
      || ')';
  END IF;
  -- 20260926: movimenti dell inventario solo dei settori dove l operatore scrive; una riga
  -- chiesta per numero ma di un altro settore e un errore (prima: cancellata)
  IF NOT v_admin AND p_table = 'inventario' THEN
    v_amb_inv := _ambito_settore(p_token, true);
    IF v_amb_inv <> '' THEN
      IF _filtro_per_id(p_filter) THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM inventario WHERE (' || p_filter
          || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
        IF v_fuori THEN
          RAISE EXCEPTION 'Permesso mancante: inventario di un altro settore';
        END IF;
      END IF;
      v_ambito := v_ambito || v_amb_inv;
    END IF;
  END IF;
  -- 20260913: il piano passa dal controllo delle scritture del Diario (trigger)
  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_admin BOOLEAN := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  v_op TEXT := (SELECT operatore FROM operator_sessions WHERE token = p_token LIMIT 1);
  v_rep TEXT;
  v_set TEXT[];
  v_gid BIGINT;
  v_az TEXT;
  v_pt NUMERIC;
  v_cfg JSONB;
  v_conf NUMERIC;
  v_n INT;
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
  END IF;
  -- 20260911: tabelle con il Cestino: la cancellazione definitiva e dell amministratore
  IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'delete' THEN
    RAISE EXCEPTION 'Eliminazione definitiva riservata all amministratore: si usa il Cestino';
  END IF;
  IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN
    RAISE EXCEPTION 'Numero, data di creazione e autore non si modificano';
  END IF;
  -- 20260911: Diario per settore (nuove registrazioni nei propri settori)
  IF p_table = 'registrazioni' AND p_azione = 'insert' THEN
    v_set := _settori_operatore(p_token, false);
    IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
      RAISE EXCEPTION 'Settore non tuo: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
    END IF;
  END IF;
  -- 20260926: inventario per settore: movimenti nuovi (anche ricreati da Annulla) e
  -- spostati solo nei settori dove l operatore scrive
  IF p_table = 'inventario' AND (p_azione = 'insert' OR (p_azione = 'update' AND p_data ? 'reparto_dip')) THEN
    v_set := _settori_operatore(p_token, true);
    IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
      RAISE EXCEPTION 'Inventario di un altro settore: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
    END IF;
  END IF;
  -- 20260911: pagine
  IF p_table = 'consegne_turno' AND NOT _pagina_visibile(p_token, 'consegna') THEN
    -- chi riceve una consegna la segna letta anche senza la pagina (avviso all accesso)
    IF NOT (p_azione = 'update' AND p_data IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('letto_da', 'letto_at'))
            AND COALESCE(p_data ->> 'letto_da', v_op) = v_op) THEN
      RAISE EXCEPTION 'Permesso mancante: Consegna turno';
    END IF;
  END IF;
  IF p_table IN ('costi_maison', 'spese_extra', 'regali_maison', 'note_clienti', 'maison_budget')
     AND NOT _pagina_visibile(p_token, 'maison') THEN
    RAISE EXCEPTION 'Permesso mancante: Maison';
  END IF;
  -- 20260913: il Rapporto lo scrive solo chi ha la pagina Rapporto (il programma scrive con
  -- secure_insert / secure_update, non con upsert_rapporto)
  IF p_table = 'rapporti_giornalieri' AND NOT _pagina_visibile(p_token, 'rapporto') THEN
    RAISE EXCEPTION 'Permesso mancante: Rapporto';
  END IF;
  -- 20260911: punti incentivo
  IF p_table = 'punti_eventi' AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    IF p_azione = 'update' THEN
      RAISE EXCEPTION 'Permesso mancante: punti e premi';
    END IF;
    IF p_azione = 'insert' THEN
      v_az := COALESCE(p_data ->> 'azione', '');
      BEGIN
        v_pt := (p_data ->> 'punti')::numeric;
        SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END;
      IF v_az ~ '^livello_[0-9]+$' THEN
        v_conf := NULLIF(v_cfg -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric;
      ELSE
        SELECT NULLIF(a ->> 'punti', '')::numeric INTO v_conf
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg -> 'azioni') = 'array' THEN v_cfg -> 'azioni' ELSE '[]'::jsonb END) a
         WHERE a ->> 'key' = v_az LIMIT 1;
      END IF;
      IF v_conf IS NULL OR v_pt IS DISTINCT FROM v_conf THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi (solo gli incentivi configurati)';
      END IF;
      IF v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata') THEN
        -- popup della copertura dopo una malattia: chiunque, ma (20260913) con un motivo,
        -- una volta sola per collaboratore + azione + motivo (il doppio accredito
        -- consapevole lo fa chi ha Punti e premi) e al massimo 5 in 24 ore
        IF btrim(COALESCE(p_data ->> 'descrizione', '')) = '' THEN
          RAISE EXCEPTION 'Permesso mancante: punti automatici senza motivo (Punti e premi)';
        END IF;
        IF EXISTS (SELECT 1 FROM punti_eventi
                    WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
                      AND btrim(COALESCE(descrizione, '')) = btrim(p_data ->> 'descrizione')) THEN
          RAISE EXCEPTION 'Permesso mancante: punti gia assegnati per lo stesso motivo (il secondo accredito lo fa chi ha Punti e premi)';
        END IF;
        SELECT count(*) INTO v_n FROM punti_eventi
         WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
           AND created_at > now() - interval '24 hours';
        IF v_n >= 5 THEN
          RAISE EXCEPTION 'Permesso mancante: troppi punti "%" a % nelle ultime 24 ore (Punti e premi)', v_az, p_data ->> 'collaboratore';
        END IF;
      ELSIF v_az = 'competenza' OR v_az ~ '^livello_[0-9]+$' THEN
        IF NOT (_sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
          RAISE EXCEPTION 'Permesso mancante: competenze';
        END IF;
      ELSIF v_az IN ('sessione_formativa', 'formatore') THEN
        IF NOT (_sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
          RAISE EXCEPTION 'Permesso mancante: formazioni';
        END IF;
      ELSE
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END IF;
    END IF;
  END IF;
  -- v359: il fabbisogno lo vedono tutti, lo scrive solo chi ha il permesso
  IF p_table = 'piano_fabbisogni' AND NOT _permesso_piano_auto(p_token, 'piano_fabbisogno') THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il fabbisogno';
  END IF;
  IF p_table = 'valutazioni' AND NOT _sessione_permesso(p_token, 'gestione_valutazioni') THEN
    RAISE EXCEPTION 'Permesso mancante: valutazioni';
  END IF;
  IF p_table = 'collab_congedi_np' AND NOT _hr_modifica(p_token) THEN
    RAISE EXCEPTION 'Permesso mancante: congedi non pagati (Storico HR, modificare)';
  END IF;
  IF p_table = 'hr_eventi' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Eventi HR: si eliminano solo come amministratore';
    ELSIF p_azione = 'update' AND NOT _hr_modifica(p_token) THEN
      RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare)';
    ELSIF p_azione = 'insert' AND (p_data ->> 'tipo') IN ('assunzione', 'cessazione', 'giubileo', 'congedo_np')
          AND NOT _hr_modifica(p_token) THEN
      RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare)';
    END IF;
  END IF;
  IF p_table = 'hr_allegati' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Allegati HR: si eliminano solo come amministratore';
    ELSIF NOT (_hr_modifica(p_token) OR _sessione_permesso(p_token, 'gestione_formazioni')) THEN
      RAISE EXCEPTION 'Permesso mancante: allegati HR';
    END IF;
  END IF;

  -- v434: COLLABORATORI
  IF p_table = 'collaboratori' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Collaboratori: si eliminano solo come amministratore';
    END IF;
    -- 20260911: un operatore crea collaboratori nei propri settori, con i soli dati che il
    -- programma scrive alla creazione (Diario, moduli, formazioni, turni orfani, import)
    IF p_azione = 'insert' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(COALESCE(p_data, '{}'::jsonb)) k
                  WHERE k NOT IN ('nome', 'attivo', 'reparto_dip', 'percentuale', 'funzione', 'is_jolly', 'turni_bloccati')) THEN
        RAISE EXCEPTION 'Collaboratore nuovo: dati riservati all amministratore';
      END IF;
      IF COALESCE(p_data ->> 'attivo', 'true') <> 'true' THEN
        RAISE EXCEPTION 'Collaboratore nuovo: solo attivo';
      END IF;
      v_set := _settori_operatore(p_token, false);
      IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Settore non tuo: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
      END IF;
    END IF;
    IF p_data IS NOT NULL THEN
      IF ((p_azione = 'update' AND p_data ?| ARRAY['data_assunzione', 'data_fine_rapporto', 'mesi_congedo_non_pagato', 'data_nascita'])
          OR (p_azione = 'insert' AND (
                COALESCE(p_data -> 'data_assunzione', 'null'::jsonb) <> 'null'::jsonb
             OR COALESCE(p_data -> 'data_fine_rapporto', 'null'::jsonb) <> 'null'::jsonb
             OR COALESCE(p_data -> 'data_nascita', 'null'::jsonb) <> 'null'::jsonb)))
         AND NOT _hr_modifica(p_token) THEN
        RAISE EXCEPTION 'Permesso mancante: dati del contratto e data di nascita (Storico HR, modificare)';
      END IF;
      IF p_data ? 'categoria' AND NOT (_sessione_permesso(p_token, 'gestione_categorie') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: categorie';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['funzione', 'percentuale', 'lingue', 'impiego', 'is_jolly']
         AND NOT (_sessione_permesso(p_token, 'gestione_impiego') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: impiego (funzione, percentuale, lingue, Jolly/Fisso)';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['nome', 'reparto_dip', 'reparti_extra', 'copertura_reparti', 'attivo', 'id', 'created_at'] THEN
        RAISE EXCEPTION 'Nome, settore, coperture e attivo: solo amministratore';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['competenze', 'livello']
         AND NOT (_sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                  OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
        RAISE EXCEPTION 'Permesso mancante: competenze';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['solo_diurni', 'solo_notti', 'turni_solo_a_mano', 'turni_bloccati',
           'turni_consentiti', 'prefers_l1', 'accoglienza', 'accompagnamento_settori', 'giorni_lavoro',
           'giorni_settimana', 'settori_piano']
         AND NOT (_sessione_permesso(p_token, 'gestione_piano') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: preferenze del piano';
      END IF;
    END IF;
  END IF;

  -- v434: PIANO (celle). Modifiche e cancellazioni: _piano_ambito_diario nel canale sicuro
  IF p_table = 'piano' AND p_azione = 'insert' THEN
    IF upper(COALESCE(p_data ->> 'codice', '')) NOT IN ('M', 'ND') THEN
      IF NOT _piano_scrittura_piena(p_token) THEN
        RAISE EXCEPTION 'Permesso mancante: modificare il piano';
      END IF;
      -- 20260911: le celle dei propri settori
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Piano di un altro settore: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
      END IF;
    END IF;
  END IF;

  -- v434: CONFIGURAZIONE DEL PIANO (stesse regole della pagina)
  IF p_table IN ('piano_codici', 'piano_regole', 'piano_regole_gruppo', 'piano_mappature', 'piano_festivi') THEN
    RAISE EXCEPTION 'Configurazione del piano: solo amministratore';
  END IF;
  IF p_table = 'piano_turni' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_import')
       OR _permesso_piano_auto(p_token, 'piano_fabbisogno')) THEN
    RAISE EXCEPTION 'Turni del piano: solo amministratore';
  END IF;
  IF p_table = 'piano_festivita' AND NOT _sessione_permesso(p_token, 'gestione_festivi') THEN
    RAISE EXCEPTION 'Permesso mancante: Festivi e CGF';
  END IF;
  IF p_table = 'piano_cgf_riporto' AND NOT (_sessione_permesso(p_token, 'gestione_festivi')
       OR _sessione_permesso(p_token, 'gestione_piano')) THEN
    RAISE EXCEPTION 'Permesso mancante: Festivi e CGF';
  END IF;
  IF p_table IN ('piano_ore_mese', 'piano_recupero_ore', 'piano_formulari', 'piano_saldo_iniziale')
     AND NOT _sessione_permesso(p_token, 'gestione_piano') THEN
    RAISE EXCEPTION 'Permesso mancante: piano';
  END IF;
  IF p_table = 'piano_timbrature' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
       OR _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
    RAISE EXCEPTION 'Permesso mancante: timbrature';
  END IF;
  IF p_table = 'piano_vacanze' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
       OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
    SELECT l.reparto INTO v_rep FROM _piano_auto_lasciapassare(p_token) l;
    IF v_rep IS NULL THEN
      RAISE EXCEPTION 'Permesso mancante: vacanze';
    END IF;
  END IF;
  IF p_table = 'piano_briefing' AND NOT (_sessione_permesso(p_token, 'gestione_briefing')
       OR _sessione_permesso(p_token, 'gestione_piano')) THEN
    RAISE EXCEPTION 'Permesso mancante: briefing';
  END IF;

  -- CHAT
  IF p_table = 'chat_group_members' THEN
    IF p_azione = 'update' THEN
      -- 20260911: la propria riga non si sposta in un altro gruppo
      RAISE EXCEPTION 'Membri dei gruppi: non si modificano';
    END IF;
    IF p_azione = 'insert' THEN
      -- gruppi personalizzati: aggiunge chi li ha creati; gruppo Tutti: chiunque; gruppi di
      -- settore: colleghi del settore, aggiunti da chi e del settore (20260911)
      v_gid := NULLIF(p_data ->> 'group_id', '')::bigint;
      v_set := _settori_operatore(p_token, false);
      SELECT lower(btrim(valore::jsonb ->> (p_data ->> 'operatore'))) INTO v_rep
        FROM impostazioni WHERE chiave = 'operatori_reparto';
      IF NOT EXISTS (
        SELECT 1 FROM chat_groups g
        WHERE g.id = v_gid
          AND (g.creato_da = v_op
               OR g.tipo = 'tutti'
               OR (g.tipo IN ('slots', 'tavoli')
                   AND (v_set IS NULL OR g.tipo = ANY(v_set))
                   AND (v_rep IS NULL OR v_rep IN ('', 'entrambi') OR v_rep = g.tipo)))
      ) THEN
        RAISE EXCEPTION 'Solo chi ha creato il gruppo aggiunge i membri';
      END IF;
    END IF;
  END IF;
  -- 20260913: gruppi Tutti e di settore solo con chat_get_or_create_group (uno per tipo)
  IF p_table = 'chat_groups' AND p_azione = 'insert'
     AND (COALESCE(p_data ->> 'tipo', '') <> 'custom'
          OR COALESCE(p_data ->> 'legacy_gid', '') IN ('__gruppo_tutti', '__gruppo_slots', '__gruppo_tavoli')) THEN
    RAISE EXCEPTION 'Gruppi Tutti e di settore: si creano solo dalla chat';
  END IF;
  IF p_table = 'chat_groups' AND p_azione = 'update' AND p_data IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k <> 'nome') THEN
    RAISE EXCEPTION 'Gruppi della chat: si cambia solo il nome';
  END IF;
  IF p_table = 'chat_messages' THEN
    IF p_azione = 'update' AND p_data ?| ARRAY['group_id', 'a_operatore', 'id', 'created_at'] THEN
      RAISE EXCEPTION 'Un messaggio non cambia gruppo o destinatario';
    END IF;
    IF p_azione = 'insert' THEN
      v_gid := NULLIF(p_data ->> 'group_id', '')::bigint;
      IF v_gid IS NOT NULL THEN
        v_set := _settori_operatore(p_token, false);
        IF NOT EXISTS (SELECT 1 FROM chat_group_members m WHERE m.group_id = v_gid AND m.operatore = v_op)
           AND NOT EXISTS (SELECT 1 FROM chat_groups g WHERE g.id = v_gid
                             AND (g.creato_da = v_op OR g.tipo = 'tutti'
                                  OR (g.tipo IN ('slots', 'tavoli') AND (v_set IS NULL OR g.tipo = ANY(v_set))))) THEN
          RAISE EXCEPTION 'Si scrive solo nei gruppi di cui si fa parte';
        END IF;
      END IF;
    END IF;
  END IF;
  IF p_table IN ('chat_message_letti', 'chat_message_hidden') AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Letture della chat: non si modificano';
  END IF;
  IF p_table = 'push_subscriptions' AND p_azione = 'update' AND p_data ? 'operatore' THEN
    RAISE EXCEPTION 'Notifiche: l operatore non si cambia';
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_today_birthdays()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_result JSON;
  v_today_day INT := EXTRACT(DAY FROM now());
  v_today_month INT := EXTRACT(MONTH FROM now());
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'nome', nome,
    'tipo', tipo,
    'reparto_dip', reparto_dip
  )), '[]'::json)
  INTO v_result
  FROM (
    -- Compleanni clienti Maison (con reparto)
    SELECT nome, 'maison' AS tipo, COALESCE(reparto_dip, 'slots') AS reparto_dip
    FROM maison_budget
    WHERE data_nascita IS NOT NULL AND eliminato IS NOT TRUE
      AND EXTRACT(DAY FROM data_nascita::date) = v_today_day
      AND EXTRACT(MONTH FROM data_nascita::date) = v_today_month
    UNION
    -- Compleanni collaboratori (senza reparto specifico)
    SELECT nome, 'collaboratore' AS tipo, 'tutti' AS reparto_dip
    FROM collaboratori
    WHERE data_nascita IS NOT NULL
      AND attivo = true
      AND EXTRACT(DAY FROM data_nascita::date) = v_today_day
      AND EXTRACT(MONTH FROM data_nascita::date) = v_today_month
  ) t;

  RETURN v_result;
END;
$function$
;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260926_inventario_settore_clienti_maison')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

-- PostgREST rilegge l elenco delle funzioni e le colonne nuove
NOTIFY pgrst, 'reload schema';
