-- ============================================================
-- PERMESSI NEL DATABASE: PIANO, CONFIGURAZIONE DEL PIANO, COLLABORATORI, CHAT
-- (v434, controllo completo del 09/10/2026, fase 1 "sicurezza")
-- Fino a qui questi permessi esistevano solo nella pagina: chi conosce la console del
-- browser poteva, con una sessione qualsiasi, scrivere il piano, cambiare turni, regole e
-- mappature, le competenze e il settore dei collaboratori, scrivere a nome di un collega
-- o entrare in un gruppo della chat. Da qui li controlla anche il database, con le STESSE
-- regole della pagina (nessuna azione permessa oggi viene bloccata):
-- 1) PIANO (celle): scrive chi gestisce il piano, il briefing, le azioni automatiche
--    (genera, vacanze, import, cancellazioni, formazioni) o ha il lasciapassare della
--    generazione automatica. Tutti gli altri solo cio che fa il Diario quando registra o
--    toglie una malattia o una non disponibilita: scrivere M o ND, rimettere la sigla di
--    prima scritta nella nota ("Ex C0 - ..."), togliere una M o una ND.
-- 2) CONFIGURAZIONE DEL PIANO: turni, codici, regole, regole di gruppo, mappature e festivi
--    solo amministratore (turni anche import e ordine dal fabbisogno); festivita con il
--    permesso Festivi; ore del mese, recupero ore, formulari, saldo iniziale, timbrature,
--    vacanze, briefing e riporto CGF con i permessi delle loro schede.
-- 3) COLLABORATORI: nome, settore, reparti extra, coperture e attivo solo amministratore
--    (la rinomina ha la sua funzione); competenze e livello con Competenze, Formazioni o
--    pianificazione formazioni; preferenze del piano con Piano o Storico HR (modificare);
--    eliminare solo amministratore.
-- 4) CHAT: l autore di messaggi, note e registro e sempre chi e collegato; i membri di un
--    gruppo personalizzato li cambia chi l ha creato (si puo sempre uscire da soli); i
--    gruppi di settore accolgono i colleghi del settore.
-- Si puo rilanciare.
-- ============================================================

-- chi puo scrivere qualsiasi cella del piano
CREATE OR REPLACE FUNCTION public._piano_scrittura_piena(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_rep TEXT;
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN RETURN true; END IF;
  IF _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_briefing')
     OR _permesso_piano_auto(p_token, 'piano_auto_genera') OR _permesso_piano_auto(p_token, 'piano_auto_vacanze')
     OR _permesso_piano_auto(p_token, 'piano_auto_import') OR _permesso_piano_auto(p_token, 'piano_auto_cancella')
     OR _permesso_piano_auto(p_token, 'piano_formazioni') THEN
    RETURN true;
  END IF;
  SELECT l.reparto INTO v_rep FROM _piano_auto_lasciapassare(p_token) l;
  RETURN v_rep IS NOT NULL;
END;
$function$;

-- condizione in piu per modifiche e cancellazioni del piano di chi NON ha la scrittura
-- piena: solo il percorso del Diario (malattia e non disponibilita)
CREATE OR REPLACE FUNCTION public._piano_ambito_diario(p_token text, p_azione text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_cod TEXT;
  v_chiave TEXT;
BEGIN
  IF _piano_scrittura_piena(p_token) THEN RETURN ''; END IF;
  IF p_azione = 'delete' THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'')';
  END IF;
  FOR v_chiave IN SELECT jsonb_object_keys(COALESCE(p_data, '{}'::jsonb)) LOOP
    IF v_chiave NOT IN ('codice', 'protetto', 'generato', 'motivo_blocco', 'commento', 'operatore', 'updated_at', 'reparto_dip') THEN
      RAISE EXCEPTION 'Permesso mancante: modificare il piano (%)', v_chiave;
    END IF;
  END LOOP;
  IF NOT (p_data ? 'codice') THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'')';
  END IF;
  v_cod := upper(btrim(p_data ->> 'codice'));
  IF v_cod IN ('M', 'ND') THEN
    RETURN ''; -- la malattia e la non disponibilita prevalgono su qualsiasi sigla
  END IF;
  IF v_cod !~ '^[A-Z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il piano';
  END IF;
  -- togliendo la malattia torna SOLO la sigla scritta nella nota della M o della ND
  RETURN ' AND codice IN (''M'', ''M1'', ''ND'') AND commento ~ '
    || quote_literal('^(Ex|Malattia dal Diario . era) ' || v_cod || '( |$)');
END;
$function$;

CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_admin BOOLEAN := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  v_op TEXT := (SELECT operatore FROM operator_sessions WHERE token = p_token LIMIT 1);
  v_rep TEXT;
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
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
      IF p_azione = 'update' AND p_data ?| ARRAY['nome', 'reparto_dip', 'reparti_extra', 'copertura_reparti', 'attivo'] THEN
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
  IF p_table = 'piano' AND p_azione = 'insert' AND NOT _piano_scrittura_piena(p_token)
     AND upper(COALESCE(p_data ->> 'codice', '')) NOT IN ('M', 'ND') THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il piano';
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

  -- v434: CHAT. Gruppi personalizzati: membri e nome li cambia chi ha creato il gruppo
  -- (uscire da soli e sempre possibile); i gruppi di settore accolgono i colleghi
  IF p_table = 'chat_group_members' AND p_azione = 'insert' THEN
    IF NOT EXISTS (
      SELECT 1 FROM chat_groups g
      WHERE g.id = NULLIF(p_data ->> 'group_id', '')::bigint
        AND (g.creato_da = v_op OR g.tipo IN ('slots', 'tavoli', 'tutti'))
    ) THEN
      RAISE EXCEPTION 'Solo chi ha creato il gruppo aggiunge i membri';
    END IF;
  END IF;
  IF p_table = 'chat_groups' AND p_azione IN ('update', 'delete') THEN
    NULL; -- limitato a chi l ha creato: condizione nel canale sicuro
  END IF;
END;
$function$;

-- condizione in piu per la chat (modifiche e cancellazioni di gruppi e membri)
CREATE OR REPLACE FUNCTION public._chat_ambito(p_token text, p_table text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT := (SELECT operatore FROM operator_sessions WHERE token = p_token LIMIT 1);
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN RETURN ''; END IF;
  IF p_table = 'chat_groups' THEN
    RETURN ' AND creato_da = ' || quote_literal(v_op);
  END IF;
  IF p_table = 'chat_group_members' THEN
    RETURN ' AND (operatore = ' || quote_literal(v_op)
      || ' OR group_id IN (SELECT id FROM chat_groups WHERE creato_da = ' || quote_literal(v_op) || '))';
  END IF;
  RETURN '';
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_insert(p_token text, p_table text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_cols TEXT := '';
  v_vals TEXT := '';
  v_key TEXT;
  v_val JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF p_table = 'impostazioni' AND NOT v_admin THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;

  -- v434: l autore e sempre chi e collegato (prima si poteva scrivere a nome di un collega)
  IF NOT v_admin THEN
    IF p_table IN ('chat_messages', 'note_colleghi') THEN
      p_data := jsonb_set(p_data, '{da_operatore}', to_jsonb(v_op));
    ELSIF p_table = 'log_attivita' AND p_data ? 'operatore' THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
    END IF;
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'insert', p_data);

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

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_cols != '' THEN v_cols := v_cols || ', '; v_vals := v_vals || ', '; END IF;
    v_cols := v_cols || quote_ident(v_key);
    IF v_val = 'null'::jsonb THEN
      v_vals := v_vals || 'NULL';
    ELSIF jsonb_typeof(v_val) = 'string' THEN
      v_vals := v_vals || quote_literal(v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'number' THEN
      v_vals := v_vals || (v_val #>> '{}');
    ELSIF jsonb_typeof(v_val) = 'boolean' THEN
      v_vals := v_vals || (v_val #>> '{}');
    ELSE
      v_vals := v_vals || quote_literal(v_val::text);
    END IF;
  END LOOP;

  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ') VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_update(p_token text, p_table text, p_filter text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_op TEXT;
  v_set TEXT := '';
  v_key TEXT;
  v_val JSONB;
  v_ambito TEXT := '';
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table = 'impostazioni' AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'update', p_data);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Modifica senza filtro: mai su tutta la tabella';
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

  -- v434: l autore di messaggi e note non si cambia (resta chi l ha scritto)
  IF p_table IN ('chat_messages', 'note_colleghi') AND p_data ? 'da_operatore'
     AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
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
  IF p_table IN ('chat_messages', 'note_colleghi')
     AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    IF p_table = 'chat_messages' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k <> 'reazioni') THEN
      EXECUTE 'UPDATE chat_messages SET ' || v_set || ' WHERE (' || p_filter || ') AND (da_operatore = '
        || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op)
        || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
    ELSE
      EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ') AND da_operatore = ' || quote_literal(v_op);
    END IF;
    RETURN;
  END IF;
  -- v434: piano e chat con il loro ambito
  IF p_table = 'piano' THEN
    v_ambito := _piano_ambito_diario(p_token, 'update', p_data);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := _chat_ambito(p_token, p_table);
  END IF;
  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ')' || v_ambito;
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_op TEXT;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_ambito TEXT := '';
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_table IN ('log_attivita') AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    RAISE EXCEPTION 'registro riservato all amministratore';
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'delete', NULL);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Cancellazione senza filtro: mai su tutta la tabella';
  END IF;
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

  IF p_table IN ('chat_messages', 'note_colleghi')
     AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    v_ambito := v_ambito || ' AND da_operatore = ' || quote_literal(v_op);
  END IF;
  -- v434: piano (percorso del Diario per chi non scrive il piano) e chat
  IF p_table = 'piano' THEN
    v_ambito := v_ambito || _piano_ambito_diario(p_token, 'delete', NULL);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := v_ambito || _chat_ambito(p_token, p_table);
  END IF;
  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
END;
$function$;

-- funzioni interne: mai eseguibili da fuori (anche dove i diritti predefiniti le concedono)
REVOKE EXECUTE ON FUNCTION public._piano_scrittura_piena(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_ambito_diario(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._chat_ambito(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._controlla_permessi_scrittura(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.secure_insert(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_insert(text, text, jsonb) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.secure_update(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_update(text, text, text, jsonb) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.secure_delete(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_delete(text, text, text) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260908_permessi_piano_chat_collaboratori')
ON CONFLICT (nome) DO NOTHING;
