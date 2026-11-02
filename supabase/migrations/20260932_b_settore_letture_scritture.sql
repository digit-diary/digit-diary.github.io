-- 01/11/2026 · OGNI OPERATORE SOLO NEL SUO SETTORE, ANCHE CHIAMANDO IL SERVIZIO DIRETTAMENTE
-- (prova del settore nuovo Sicurezza & Sorveglianza, decisioni del titolare). Con la sessione di
-- un operatore limitato a un settore si potevano, passando dal servizio e non dal programma:
--   SCRIVERE: turni, fabbisogno, briefing di un altro settore; vacanze, timbrature, ore, saldi
--             di persone di un altro settore (difetto 6);
--   LEGGERE:  vacanze, saldi iniziali, recupero ore, briefing, registro del piano, promemoria,
--             impostazioni con i nomi (ordine del piano, giubilei) e i collaboratori di tutti i
--             settori (difetto 7).
-- Ora, per chi ha un settore (chi ha «Tutti i settori» e l amministratore: come prima):
--   * _ambito_tabella: configurazione del piano dei settori collegati alle sue persone (turni,
--     fabbisogno, turni per funzione, regole di gruppo: servono per le celle di chi copre),
--     briefing/formulari/promemoria dei suoi settori, dati delle sue persone; scadenze e note
--     fissate delle registrazioni che legge. Vale per secure_read, secure_update, secure_delete;
--   * _controlla_settore_dati: valori nuovi (insert e update) solo nei suoi settori e per le sue
--     persone;
--   * collaboratori: solo quelli dei suoi settori e chi vi lavora (reparti extra, tutti i
--     settori); prima gli altri arrivavano senza i dati HR;
--   * chat: gruppi di cui fa parte o che ha creato, Tutti e i gruppi dei suoi settori;
--   * registro: righe del piano dei suoi settori, ultimo accesso dei colleghi dei suoi settori;
--     registro_leggi solo dei suoi settori;
--   * impostazioni: ordine del piano, giubilei avvisati, colori del recupero, colonne del
--     briefing e dell import, testi degli altri operatori solo per la sua parte; quando salva
--     ordine o giubilei la parte degli altri settori resta (_impostazione_unisci);
--   * categorie dell inventario: le cambia chi ha la pagina Inventario, solo per i suoi settori.
-- Coperture fra settori: chi copre ha il settore nei reparti extra e resta visibile in entrambi.
-- Idempotente. Dopo 20260932_a_v1_non_vacanza.sql.

BEGIN;

-- NOMI DEI COLLABORATORI NELL AMBITO di chi e collegato: del suo settore (lettura: anche gli
-- accessi extra; scrittura: quelli con la modifica), di tutti i settori, o che vi lavorano
-- (reparti extra). NULL = tutti (amministratore, operatore di tutti i settori).
CREATE OR REPLACE FUNCTION public._nomi_ambito(p_token text, p_scrittura boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, p_scrittura);
  v_nomi TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(DISTINCT lower(c.nome)), ARRAY[]::text[]) INTO v_nomi
    FROM collaboratori c
   WHERE lower(COALESCE(c.reparto_dip, 'slots')) = ANY(v_set)
      OR lower(c.reparto_dip) = 'entrambi'
      OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(c.reparti_extra, '')), ',')) x
                  WHERE btrim(x) = ANY(v_set));
  RETURN v_nomi;
END;
$function$;

-- SETTORI COLLEGATI (lettura della configurazione del piano): i suoi settori e quelli delle
-- persone che vede (il settore di chi viene a lavorare da lui e i settori dove i suoi vanno a
-- coprire): servono per orari e regole delle celle di quelle persone. NULL = tutti.
CREATE OR REPLACE FUNCTION public._settori_collegati(p_token text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
  v_out TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN NULL; END IF;
  WITH persone AS (
    SELECT lower(COALESCE(c.reparto_dip, 'slots')) AS rep, lower(COALESCE(c.reparti_extra, '')) AS extra
      FROM collaboratori c
     WHERE lower(COALESCE(c.reparto_dip, 'slots')) = ANY(v_set)
        OR lower(c.reparto_dip) = 'entrambi'
        OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(c.reparti_extra, '')), ',')) x
                    WHERE btrim(x) = ANY(v_set))
  )
  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::text[]) INTO v_out FROM (
    SELECT unnest(v_set) AS s
    UNION SELECT rep FROM persone
    UNION SELECT btrim(x) FROM persone, unnest(string_to_array(extra, ',')) x
  ) t WHERE s <> '' AND s <> 'entrambi';
  RETURN v_out;
END;
$function$;

-- OPERATORI DEI SUOI SETTORI (ultimo accesso dei colleghi nel registro): quelli del suo settore
-- o di tutti i settori. '' = nessun limite.
CREATE OR REPLACE FUNCTION public._ambito_operatori(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
  v_ops TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN ''; END IF;
  BEGIN
    SELECT COALESCE(array_agg(e.key), ARRAY[]::text[]) INTO v_ops
      FROM impostazioni i, jsonb_each_text(i.valore::jsonb) e
     WHERE i.chiave = 'operatori_reparto'
       AND (lower(btrim(e.value)) = ANY(v_set) OR lower(btrim(e.value)) IN ('', 'entrambi'));
  EXCEPTION WHEN others THEN
    v_ops := ARRAY[]::text[];
  END;
  RETURN ' AND operatore = ANY(' || quote_literal(COALESCE(v_ops, ARRAY[]::text[])::text) || '::text[])';
END;
$function$;

-- AMBITO DI UNA TABELLA del piano o delle persone per chi ha un settore (condizione SQL da
-- aggiungere al filtro; '' = nessun limite). p_scrittura: i settori dove scrive.
CREATE OR REPLACE FUNCTION public._ambito_tabella(p_token text, p_table text, p_scrittura boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[];
  v_nomi TEXT[];
  v_amb TEXT;
BEGIN
  IF p_table IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo') THEN
    IF p_scrittura THEN RETURN _ambito_settore(p_token, true); END IF;
    v_set := _settori_collegati(p_token);
    IF v_set IS NULL THEN RETURN ''; END IF;
    RETURN ' AND lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])';
  ELSIF p_table IN ('piano_briefing', 'piano_formulari', 'promemoria') THEN
    RETURN _ambito_settore(p_token, p_scrittura);
  ELSIF p_table IN ('piano_timbrature', 'piano_ore_mese', 'piano_recupero_ore', 'piano_saldo_iniziale',
                    'piano_cgf_riporto', 'collab_congedi_np') THEN
    v_set := _settori_operatore(p_token, p_scrittura);
    IF v_set IS NULL THEN RETURN ''; END IF;
    v_nomi := _nomi_ambito(p_token, p_scrittura);
    RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
      || ' OR lower(collaboratore) = ANY(' || quote_literal(v_nomi::text) || '::text[]))';
  ELSIF p_table = 'piano_vacanze' THEN
    v_nomi := _nomi_ambito(p_token, p_scrittura);
    IF v_nomi IS NULL THEN RETURN ''; END IF;
    RETURN ' AND lower(collaboratore) = ANY(' || quote_literal(v_nomi::text) || '::text[])';
  ELSIF p_table IN ('scadenze', 'note_fissate') THEN
    v_amb := _ambito_registrazioni(p_token);
    IF v_amb = '' THEN RETURN ''; END IF;
    RETURN ' AND registrazione_id IN (SELECT id FROM registrazioni WHERE TRUE' || v_amb || ')';
  END IF;
  RETURN '';
END;
$function$;

-- VALORI NUOVI (insert, update) delle tabelle con settore o persona: solo nei settori e per le
-- persone dove l operatore scrive. Amministratore e operatore di tutti i settori: niente.
CREATE OR REPLACE FUNCTION public._controlla_settore_dati(p_token text, p_table text, p_data jsonb, p_nuova boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[];
  v_rep TEXT;
  v_col TEXT;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RETURN; END IF;
  IF p_table NOT IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo', 'piano_briefing',
                     'piano_formulari', 'piano_timbrature', 'piano_ore_mese', 'piano_recupero_ore',
                     'piano_saldo_iniziale', 'piano_cgf_riporto', 'collab_congedi_np', 'piano_vacanze') THEN
    RETURN;
  END IF;
  v_set := _settori_operatore(p_token, true);
  IF v_set IS NULL THEN RETURN; END IF;
  v_rep := lower(btrim(COALESCE(p_data ->> 'reparto_dip', '')));
  v_col := lower(btrim(COALESCE(p_data ->> 'collaboratore', '')));
  IF p_table IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo', 'piano_briefing',
                 'piano_formulari') THEN
    IF NOT p_nuova AND NOT (p_data ? 'reparto_dip') THEN RETURN; END IF;
    IF NOT (COALESCE(NULLIF(v_rep, ''), 'slots') = ANY(v_set)) THEN
      RAISE EXCEPTION 'Permesso mancante: % di un altro settore (%)', p_table, COALESCE(NULLIF(v_rep, ''), 'slots');
    END IF;
    RETURN;
  END IF;
  -- persone: una delle sue persone, oppure (righe con settore) una riga del suo settore
  IF v_rep = '' AND v_col = '' THEN RETURN; END IF;
  IF v_col <> '' AND v_col = ANY(_nomi_ambito(p_token, true)) THEN RETURN; END IF;
  IF p_table <> 'piano_vacanze' AND v_rep <> '' AND v_rep = ANY(v_set) THEN RETURN; END IF;
  RAISE EXCEPTION 'Permesso mancante: % di una persona di un altro settore', p_table;
END;
$function$;

-- IMPOSTAZIONI CON DATI DI PIU SETTORI, per chi ha un settore: solo la sua parte (NULL = la
-- riga non arriva): ordine del piano e giubilei delle sue persone, colori/colonne dei suoi
-- settori, il suo testo, operatori e permessi dei colleghi dei suoi settori e di tutti i
-- settori. Le altre impostazioni arrivano come sono. Le impostazioni degli operatori le scrive
-- solo l amministratore, che le legge intere.
CREATE OR REPLACE FUNCTION public._impostazione_ambito(p_token text, p_chiave text, p_valore text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
  v_op TEXT;
  v_rep TEXT;
  v JSONB;
  v_nomi TEXT[];
  v_ops TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN p_valore; END IF;
  IF p_chiave LIKE 'testo\_operatore\_%' THEN
    SELECT operatore INTO v_op FROM operator_sessions WHERE token = p_token LIMIT 1;
    RETURN CASE WHEN p_chiave = 'testo_operatore_' || v_op THEN p_valore END;
  END IF;
  v_rep := CASE
    WHEN p_chiave LIKE 'recupero\_colori\_%' THEN substring(p_chiave FROM '^recupero_colori_(.+)_[0-9]{4}-[0-9]{2}$')
    WHEN p_chiave LIKE 'brief\_colonne\_%' THEN substr(p_chiave, 15)
    WHEN p_chiave LIKE 'piano\_import\_colonne\_%' THEN substr(p_chiave, 22)
  END;
  IF v_rep IS NOT NULL THEN
    RETURN CASE WHEN lower(v_rep) = ANY(v_set) THEN p_valore END;
  END IF;
  IF p_chiave NOT IN ('piano_ordine_collab', 'giubileo_notificati', 'operatori_lista', 'operatori_reparto',
                      'profili_operatori', 'visibilita') THEN
    RETURN p_valore;
  END IF;
  BEGIN
    v := p_valore::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  -- OPERATORI: solo i colleghi dei suoi settori e quelli di tutti i settori (e se stesso)
  IF p_chiave IN ('operatori_lista', 'operatori_reparto', 'profili_operatori', 'visibilita') THEN
    SELECT operatore INTO v_op FROM operator_sessions WHERE token = p_token LIMIT 1;
    BEGIN
      SELECT COALESCE(array_agg(e.key), ARRAY[]::text[]) INTO v_ops
        FROM impostazioni i, jsonb_each_text(i.valore::jsonb) e
       WHERE i.chiave = 'operatori_reparto'
         AND (lower(btrim(e.value)) = ANY(v_set) OR lower(btrim(e.value)) IN ('', 'entrambi'));
    EXCEPTION WHEN others THEN
      v_ops := ARRAY[]::text[];
    END;
    v_ops := COALESCE(v_ops, ARRAY[]::text[]) || v_op;
    IF p_chiave = 'operatori_lista' THEN
      IF jsonb_typeof(v) <> 'array' THEN RETURN p_valore; END IF;
      RETURN COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v) x WHERE (x #>> '{}') = ANY(v_ops)), '[]'::jsonb)::text;
    END IF;
    IF jsonb_typeof(v) <> 'object' THEN RETURN p_valore; END IF;
    IF p_chiave IN ('operatori_reparto', 'profili_operatori') THEN
      RETURN COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(v) e WHERE e.key = ANY(v_ops)), '{}'::jsonb)::text;
    END IF;
    -- visibilita: in ogni voce «operatori selezionati» restano solo quei colleghi
    RETURN COALESCE((SELECT jsonb_object_agg(e.key,
              CASE WHEN jsonb_typeof(e.value) = 'object' AND jsonb_typeof(e.value -> 'operatori') = 'array'
                   THEN jsonb_set(e.value, '{operatori}', COALESCE((SELECT jsonb_agg(o) FROM jsonb_array_elements(e.value -> 'operatori') o
                                                                     WHERE (o #>> '{}') = ANY(v_ops)), '[]'::jsonb))
                   ELSE e.value END)
              FROM jsonb_each(v) e), '{}'::jsonb)::text;
  END IF;
  IF p_chiave = 'piano_ordine_collab' THEN
    IF jsonb_typeof(v) = 'object' THEN
      RETURN COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(v) e WHERE lower(e.key) = ANY(v_set)),
                      '{}'::jsonb)::text;
    END IF;
    RETURN CASE WHEN 'slots' = ANY(v_set) THEN p_valore ELSE '[]' END;
  END IF;
  -- giubileo_notificati: ["Nome Cognome|anni", ...]
  IF jsonb_typeof(v) <> 'array' THEN RETURN '[]'; END IF;
  v_nomi := _nomi_ambito(p_token, false);
  RETURN COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v) x
                    WHERE lower(split_part(x #>> '{}', '|', 1)) = ANY(v_nomi)), '[]'::jsonb)::text;
END;
$function$;

-- SALVATAGGIO DI UNA DI QUELLE IMPOSTAZIONI da chi ne legge solo la sua parte: quello che manda
-- sostituisce la sua parte, la parte degli altri settori resta com e.
CREATE OR REPLACE FUNCTION public._impostazione_unisci(p_token text, p_chiave text, p_valore text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
  v_vecchio JSONB;
  v_nuovo JSONB;
  v_nomi TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN p_valore; END IF;
  BEGIN
    v_nuovo := COALESCE(NULLIF(p_valore, ''), 'null')::jsonb;
    SELECT valore::jsonb INTO v_vecchio FROM impostazioni WHERE chiave = p_chiave;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Impostazione %: valore non valido', p_chiave;
  END;
  IF p_chiave = 'piano_ordine_collab' THEN
    IF jsonb_typeof(v_nuovo) <> 'object' THEN
      RAISE EXCEPTION 'Ordine del piano: valore non valido';
    END IF;
    IF jsonb_typeof(v_vecchio) <> 'object' THEN v_vecchio := '{}'::jsonb; END IF;
    RETURN (COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(v_vecchio) e
                       WHERE NOT (lower(e.key) = ANY(v_set))), '{}'::jsonb)
         || COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(v_nuovo) e
                       WHERE lower(e.key) = ANY(v_set)), '{}'::jsonb))::text;
  END IF;
  -- giubileo_notificati: le voci delle sue persone dal valore nuovo, le altre restano
  IF jsonb_typeof(v_nuovo) <> 'array' THEN
    RAISE EXCEPTION 'Giubilei avvisati: valore non valido';
  END IF;
  IF jsonb_typeof(v_vecchio) <> 'array' THEN v_vecchio := '[]'::jsonb; END IF;
  v_nomi := _nomi_ambito(p_token, false);
  RETURN (COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v_vecchio) x
                     WHERE NOT (lower(split_part(x #>> '{}', '|', 1)) = ANY(v_nomi))), '[]'::jsonb)
       || COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v_nuovo) x
                     WHERE lower(split_part(x #>> '{}', '|', 1)) = ANY(v_nomi)), '[]'::jsonb))::text;
END;
$function$;

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
      -- proprie righe, righe del piano (storico, cambi) e ultimo accesso dei colleghi;
      -- 20260932_b: del piano solo i suoi settori, ultimo accesso solo dei colleghi dei suoi settori
      v_amb := _ambito_settore(p_token, false);
      v_from := '(SELECT id, operatore, azione, dettaglio, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore = ' || quote_literal(v_op) || ' OR (azione ILIKE ''%piano%''' || v_amb || ')'
        || ' UNION ALL SELECT u.id, u.operatore, ''''::text, ''''::text, u.created_at, u.reparto_dip FROM'
        || ' (SELECT DISTINCT ON (operatore) id, operatore, azione, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore IS DISTINCT FROM ' || quote_literal(v_op) || _ambito_operatori(p_token)
        || ' ORDER BY operatore, created_at DESC) u'
        || ' WHERE u.azione NOT ILIKE ''%piano%'') log_attivita';
    -- 20260932_b: con il Registro, solo le righe dei suoi settori
    ELSIF p_table = 'log_attivita' THEN
      v_amb := _ambito_settore(p_token, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM log_attivita WHERE TRUE' || v_amb || ') log_attivita';
      END IF;
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
    -- 20260928 (C7): DATI DELLE PERSONE PER SETTORE (come il Diario): Storico HR, allegati,
    -- valutazioni, moduli, punti e piano solo dei settori dell operatore (il suo e gli accessi
    -- extra) e delle persone che vi lavorano (di tutti i settori o con reparti extra); il
    -- Rapporto solo dei suoi settori; chi ha tutti i settori legge tutto
    ELSIF p_table IN ('hr_eventi', 'hr_allegati', 'valutazioni', 'moduli', 'punti_eventi', 'piano') THEN
      v_amb := _ambito_persone(p_token, 'collaboratore');
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE TRUE' || v_amb || ') ' || quote_ident(p_table);
      END IF;
    ELSIF p_table = 'rapporti_giornalieri' THEN
      v_amb := _ambito_settore(p_token, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM rapporti_giornalieri WHERE TRUE' || v_amb || ') rapporti_giornalieri';
      END IF;
    -- 20260928 (C5): CONSEGNE: senza la pagina Consegna solo quelle per chi e collegato (tutti
    -- o il suo nome fra i destinatari: servono per l avviso all accesso); sempre dei suoi settori
    ELSIF p_table = 'consegne_turno' THEN
      v_amb := _ambito_settore(p_token, false);
      IF NOT _pagina_visibile(p_token, 'consegna') THEN
        v_amb := v_amb || ' AND (lower(btrim(COALESCE(destinatario, ''''))) = ''tutti'' OR '
          || quote_literal(v_op) || ' = ANY(SELECT btrim(x) FROM unnest(string_to_array(COALESCE(destinatario, ''''), '','')) x))';
      END IF;
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM consegne_turno WHERE TRUE' || v_amb || ') consegne_turno';
      END IF;
    -- 20260928 (C7): collaboratori di altri settori: la riga resta (nomi per chat, coperture,
    -- cambi, ricerca) ma senza i dati HR: data di nascita, inizio contratto, categoria, mesi
    -- di congedo non pagato
    -- 20260932_b (decisione del titolare 01/11/2026): chi ha un settore vede SOLO i collaboratori
    -- dei suoi settori e chi vi lavora (reparti extra, di tutti i settori); gli altri non arrivano
    -- proprio (prima arrivavano senza i dati HR)
    ELSIF p_table = 'collaboratori' THEN
      v_amb := _ambito_collaboratori(p_token);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM collaboratori WHERE TRUE' || v_amb || ') collaboratori';
      END IF;
    -- 20260932_b: configurazione e dati del piano, promemoria e scadenze per settore e persona
    -- (_ambito_tabella): turni, fabbisogno, turni per funzione e regole di gruppo dei settori
    -- collegati alle sue persone; briefing e formulari dei suoi settori; vacanze, timbrature,
    -- ore, saldi, CGF e congedi delle sue persone
    ELSIF p_table IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo', 'piano_briefing', 'piano_formulari', 'piano_timbrature', 'piano_ore_mese', 'piano_recupero_ore', 'piano_saldo_iniziale', 'piano_cgf_riporto', 'collab_congedi_np', 'piano_vacanze', 'scadenze', 'note_fissate', 'promemoria') THEN
      v_amb := _ambito_tabella(p_token, p_table, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE TRUE' || v_amb || ') ' || quote_ident(p_table);
      END IF;
    -- 20260932_b: chat: i gruppi di cui fa parte o che ha creato, Tutti e i gruppi dei suoi
    -- settori (prima arrivavano anche i gruppi e i membri degli altri settori)
    ELSIF p_table IN ('chat_groups', 'chat_group_members') AND _settori_operatore(p_token, false) IS NOT NULL THEN
      v_amb := '(creato_da = ' || quote_literal(v_op) || ' OR lower(COALESCE(tipo, '''')) = ''tutti'''
        || ' OR lower(COALESCE(tipo, '''')) = ANY(' || quote_literal(_settori_operatore(p_token, false)::text) || '::text[])'
        || ' OR id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
      v_from := CASE WHEN p_table = 'chat_groups'
                     THEN '(SELECT * FROM chat_groups WHERE ' || v_amb || ') chat_groups'
                     ELSE '(SELECT * FROM chat_group_members WHERE group_id IN (SELECT id FROM chat_groups WHERE '
                          || v_amb || ')) chat_group_members' END;
    -- 20260932_b: impostazioni con nomi o dati di altri settori (ordine del piano, giubilei
    -- avvisati, colori, colonne, testi degli altri operatori) solo per la sua parte
    ELSIF p_table = 'impostazioni' AND _settori_operatore(p_token, false) IS NOT NULL THEN
      v_from := '(SELECT i.chiave, f.v AS valore FROM impostazioni i CROSS JOIN LATERAL (SELECT _impostazione_ambito('
        || quote_literal(p_token) || ', i.chiave, i.valore) AS v) f WHERE f.v IS NOT NULL) impostazioni';
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
$function$;

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
  -- 20260931_b (A-R3): l autore di una consegna non si cambia (si puo rimandare uguale)
  IF NOT v_admin AND p_table = 'consegne_turno' AND p_data ? 'operatore' THEN
    IF (p_data ->> 'operatore') IS DISTINCT FROM v_op THEN
      RAISE EXCEPTION 'Consegna: l autore non si cambia';
    END IF;
    p_data := p_data - 'operatore';
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;
  -- 20260931_c (D2/M1): promemoria. L autore non si cambia; chi non e l autore (destinatario)
  -- scrive solo il «Fatto» (completata, completata_da = chi e collegato, completata_at) e
  -- push_sent_at; tutto il resto solo l autore
  IF NOT v_admin AND p_table = 'promemoria' THEN
    IF p_data ? 'creato_da' THEN
      IF (p_data ->> 'creato_da') IS DISTINCT FROM v_op THEN
        RAISE EXCEPTION 'Promemoria: l autore non si cambia';
      END IF;
      p_data := p_data - 'creato_da';
    END IF;
    IF COALESCE(p_data ->> 'completata_da', '') <> '' THEN
      p_data := jsonb_set(p_data, '{completata_da}', to_jsonb(v_op));
    END IF;
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;
  IF NOT v_admin AND p_table = 'rapporti_giornalieri' AND p_data ? 'operatore' THEN
    p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'update', p_data);
  -- 20260932_b: settore e persona dei valori nuovi (spostare una riga in un altro settore)
  PERFORM _controlla_settore_dati(p_token, p_table, p_data, false);

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
  -- 20260928: moduli (Cestino, correzioni) solo dei settori e delle persone che l operatore legge
  ELSIF NOT v_admin AND p_table = 'moduli' THEN
    v_ambito := _ambito_persone(p_token, 'collaboratore');
  -- 20260926: movimenti dell inventario dei settori dove l operatore scrive
  ELSIF NOT v_admin AND p_table = 'inventario' THEN
    v_ambito := _ambito_settore(p_token, true);
  -- 20260931_b (A-R3): consegne solo proprie e non ancora lette; (A-R4) promemoria solo
  -- dell autore o dei destinatari (Fatto, Riattiva); l amministratore tutto
  ELSIF NOT v_admin AND p_table = 'consegne_turno' THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') = ''''';
  ELSIF NOT v_admin AND p_table = 'promemoria' THEN
    v_ambito := CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k
                                       WHERE k NOT IN ('completata', 'completata_da', 'completata_at', 'push_sent_at'))
                     THEN _ambito_promemoria(p_token, v_op)
                     ELSE ' AND creato_da = ' || quote_literal(v_op) END;
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op);
  ELSIF p_table = 'impostazioni' THEN
    v_ambito := ' AND chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'')';
  -- 20260932_b: righe del piano e delle persone solo dei settori dove l operatore scrive
  ELSIF NOT v_admin AND p_table IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo', 'piano_briefing', 'piano_formulari', 'piano_timbrature', 'piano_ore_mese', 'piano_recupero_ore', 'piano_saldo_iniziale', 'piano_cgf_riporto', 'collab_congedi_np', 'piano_vacanze', 'scadenze', 'note_fissate') THEN
    v_ambito := _ambito_tabella(p_token, p_table, true);
  END IF;

  -- 20260913: riga chiesta per numero ma esclusa dai permessi: errore, non "fatto" con 0
  -- righe. Una riga che non corrisponde al filtro di valore (es. completata = false) non
  -- e esclusa dai permessi: 0 righe senza errore, come sempre.
  -- 20260931_c (D4): consegna gia letta: chi l ha letta, non un errore tecnico
  IF NOT v_admin AND p_table = 'consegne_turno' AND _filtro_per_id(p_filter) THEN
    EXECUTE 'SELECT string_agg(DISTINCT letto_da, '', '') FROM consegne_turno WHERE (' || p_filter
      || ') AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') <> ''''' INTO v_autore;
    IF v_autore IS NOT NULL THEN
      RAISE EXCEPTION 'Consegna gia letta da %: non si modifica piu', v_autore;
    END IF;
  END IF;
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
$function$;

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
    -- 20260928 (C2): senza Punti e premi i punti automatici si tolgono solo se li ha scritti
    -- chi e collegato nell ultima ora (Annulla, Rimuovi del popup); quelli degli altri o piu
    -- vecchi li toglie chi ha Punti e premi. Una riga chiesta per numero e fuori: errore.
    v_amb_inv := ' AND ((azione IN (''copertura'', ''cambio_turno'', ''disponibilita_negata'')'
      || ' AND operatore = ' || quote_literal(v_op) || ' AND created_at > now() - interval ''60 minutes'')'
      || CASE WHEN _sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                   OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione = ''competenza'' OR azione ~ ''^livello_[0-9]+$''' ELSE '' END
      || CASE WHEN _sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione IN (''sessione_formativa'', ''formatore'')' ELSE '' END
      || ')';
    IF _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM punti_eventi WHERE (' || p_filter
        || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
      IF v_fuori THEN
        RAISE EXCEPTION 'Permesso mancante: punti scritti da un altro operatore o da piu di un ora (Punti e premi)';
      END IF;
    END IF;
    v_ambito := v_ambito || v_amb_inv;
    v_amb_inv := '';
  END IF;
  -- 20260931_b (A-R3, A-R4): consegne proprie non lette, promemoria dell autore o dei destinatari
  IF NOT v_admin AND p_table IN ('consegne_turno', 'promemoria') THEN
    v_amb_inv := CASE WHEN p_table = 'consegne_turno'
                      THEN ' AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') = '''''
                      ELSE ' AND creato_da = ' || quote_literal(v_op) END;
    -- 20260931_c (D4): consegna gia letta: chi l ha letta, non un errore tecnico
    IF p_table = 'consegne_turno' AND _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT string_agg(DISTINCT letto_da, '', '') FROM consegne_turno WHERE (' || p_filter
        || ') AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') <> ''''' INTO v_rep;
      IF v_rep IS NOT NULL THEN
        RAISE EXCEPTION 'Consegna gia letta da %: non si annulla piu', v_rep;
      END IF;
    END IF;
    IF _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
        || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
      IF v_fuori THEN
        RAISE EXCEPTION 'Permesso mancante: % di un altro operatore (si cancella solo il proprio)', p_table;
      END IF;
    END IF;
    v_ambito := v_ambito || v_amb_inv;
    v_amb_inv := '';
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
  -- 20260932_b: righe del piano e delle persone solo dei settori dove l operatore scrive; una
  -- riga chiesta per numero ma di un altro settore e un errore
  IF NOT v_admin AND p_table IN ('piano_turni', 'piano_fabbisogni', 'piano_mappature', 'piano_regole_gruppo', 'piano_briefing', 'piano_formulari', 'piano_timbrature', 'piano_ore_mese', 'piano_recupero_ore', 'piano_saldo_iniziale', 'piano_cgf_riporto', 'collab_congedi_np', 'piano_vacanze', 'scadenze', 'note_fissate') THEN
    v_amb_inv := _ambito_tabella(p_token, p_table, true);
    IF v_amb_inv <> '' THEN
      IF _filtro_per_id(p_filter) THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
          || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
        IF v_fuori THEN
          RAISE EXCEPTION 'Permesso mancante: % di un altro settore', p_table;
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
$function$;

CREATE OR REPLACE FUNCTION public.secure_insert(p_token text, p_table text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_cols TEXT := '';
  v_vals TEXT := '';
  v_key TEXT;
  v_val JSONB;
  v_sopra TEXT := '';
  v_sempre BOOLEAN;
  v_seq TEXT;
  v_ultimo BIGINT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF p_table = 'impostazioni' AND NOT v_admin THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;
  -- 20260911: password e codice di recupero solo con le loro funzioni (anche l amministratore)
  IF p_table = 'impostazioni' AND (p_data ->> 'chiave') IN ('password_hash', 'password_hash_v2', 'recovery_code') THEN
    RAISE EXCEPTION 'Password: si cambia solo con la funzione apposita';
  END IF;
  IF jsonb_typeof(COALESCE(p_data, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Dati non validi';
  END IF;

  -- v434: l autore e sempre chi e collegato (prima si poteva scrivere a nome di un collega)
  IF NOT v_admin THEN
    IF p_table IN ('chat_messages', 'note_colleghi') THEN
      p_data := jsonb_set(p_data, '{da_operatore}', to_jsonb(v_op));
    -- 20260911: letture, messaggi nascosti e notifiche sono sempre di chi e collegato
    ELSIF p_table IN ('chat_message_letti', 'chat_message_hidden', 'push_subscriptions') THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
    ELSIF p_table = 'chat_groups' THEN
      p_data := jsonb_set(p_data, '{creato_da}', to_jsonb(v_op));
    -- 20260913: autore = chi e collegato dove il programma scrive sempre getOperatore()
    -- 20260931_c (riverifica 3 D2/M1): anche il promemoria e di chi lo crea (la ripetizione
    -- nasce da chi segna fatto il precedente); «fatto da» e sempre chi e collegato
    ELSIF p_table = 'promemoria' THEN
      p_data := jsonb_set(p_data, '{creato_da}', to_jsonb(v_op));
      IF COALESCE(p_data ->> 'completata_da', '') <> '' THEN
        p_data := jsonb_set(p_data, '{completata_da}', to_jsonb(v_op));
      END IF;
    ELSIF p_table IN ('registrazioni', 'moduli', 'rapporti_giornalieri', 'consegne_turno', 'punti_eventi',
                      'hr_eventi', 'hr_allegati', 'inventario', 'costi_maison', 'spese_extra', 'regali_maison',
                      'note_clienti', 'collab_congedi_np', 'piano', 'piano_vacanze', 'piano_timbrature',
                      'piano_briefing', 'piano_festivita', 'piano_formulari', 'piano_ore_mese',
                      'piano_recupero_ore', 'piano_saldo_iniziale', 'piano_cgf_riporto') THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
    END IF;
  END IF;

  -- 20260931 (C-N1): per chi non e amministratore il database da le date di creazione e di
  -- modifica su TUTTE le tabelle (prima solo nel Registro): un created_at scelto da chi scrive
  -- aggirava i limiti "nelle ultime 24 ore" (punti di copertura senza fine). Chi ha letto una
  -- consegna e chi ha modificato una registrazione o un modulo non si scrivono creando la riga.
  -- Il numero di riga: solo uno gia dato dal database (Annulla / Ripristina ricreano la riga
  -- con il suo numero); un numero oltre l ultimo dato si ignora (prima bloccava con una chiave
  -- doppia le scritture seguenti). Le registrazioni del Diario restano numerate dal programma.
  IF NOT v_admin THEN
    p_data := p_data - 'created_at' - 'updated_at' - 'creato_il' - 'modificato_il';
    IF p_table = 'consegne_turno' THEN
      p_data := p_data - 'letto_da' - 'letto_at';
    ELSIF p_table IN ('registrazioni', 'moduli') THEN
      p_data := p_data - 'modificato_da';
    END IF;
    IF p_table IN ('registrazioni', 'moduli', 'valutazioni', 'maison_budget')
       AND COALESCE(p_data ->> 'eliminato_da', '') <> '' THEN
      p_data := jsonb_set(p_data, '{eliminato_da}', to_jsonb(v_op));
    END IF;
    IF p_data ? 'id' AND p_table <> 'registrazioni' THEN
      v_seq := pg_get_serial_sequence(quote_ident(p_table), 'id');
      IF v_seq IS NULL OR jsonb_typeof(p_data -> 'id') NOT IN ('number', 'string')
         OR NOT ((p_data ->> 'id') ~ '^[0-9]+$') THEN
        p_data := p_data - 'id';
      ELSE
        EXECUTE 'SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ' || v_seq INTO v_ultimo;
        IF (p_data ->> 'id')::numeric < 1 OR (p_data ->> 'id')::numeric > v_ultimo THEN
          p_data := p_data - 'id';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 20260928 (C4): il Registro attivita lo scrive il server: autore = chi e collegato (anche
  -- senza la chiave "operatore", che prima restava vuota) e ora = adesso, per tutti
  -- (amministratore compreso); il numero lo da il database
  IF p_table = 'log_attivita' THEN
    p_data := jsonb_set(p_data - 'id' - 'created_at', '{operatore}', to_jsonb(v_op));
  END IF;
  -- 20260928 (C3): i punti automatici (copertura, cambio turno, rifiuto) scritti senza Punti e
  -- premi hanno la data di oggi (il fatto a cui si riferiscono e in rif_assente / rif_data)
  IF NOT v_admin AND p_table = 'punti_eventi'
     AND COALESCE(p_data ->> 'azione', '') IN ('copertura', 'cambio_turno', 'disponibilita_negata')
     AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    p_data := jsonb_set(p_data, '{data_evento}', to_jsonb((now() AT TIME ZONE 'Europe/Zurich')::date));
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'insert', p_data);
  -- 20260932_b: righe nuove solo nei settori e per le persone dove l operatore scrive
  PERFORM _controlla_settore_dati(p_token, p_table, p_data, true);

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

  -- 20260913: il piano passa dal controllo delle scritture del Diario (trigger)
  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  -- 20260919 RIGA RICREATA CON IL SUO NUMERO (Annulla di un eliminazione, Ripristina di
  -- un aggiunta): nelle tabelle con il numero "generated always" (storico HR, allegati HR,
  -- inventario, tabelle del piano) l inserimento con l id dava "cannot insert a non-DEFAULT
  -- value into column id" e la riga non tornava. Si accetta solo un numero GIA DATO dal
  -- database (non oltre l ultimo della sua sequenza): cosi i numeri futuri non si scontrano;
  -- una riga che esiste ancora con lo stesso numero la ferma la chiave primaria.
  IF p_data ? 'id' THEN
    SELECT a.attidentity = 'a' INTO v_sempre
      FROM pg_attribute a
     WHERE a.attrelid = quote_ident(p_table)::regclass AND a.attname = 'id' AND NOT a.attisdropped;
    IF COALESCE(v_sempre, false) THEN
      IF jsonb_typeof(p_data -> 'id') <> 'number' AND NOT ((p_data ->> 'id') ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'Numero di riga non valido';
      END IF;
      v_seq := pg_get_serial_sequence(quote_ident(p_table), 'id');
      EXECUTE 'SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ' || v_seq INTO v_ultimo;
      IF (p_data ->> 'id')::bigint < 1 OR (p_data ->> 'id')::bigint > v_ultimo THEN
        RAISE EXCEPTION 'Numero di riga non valido: si ricrea solo una riga che esisteva';
      END IF;
      v_sopra := ' OVERRIDING SYSTEM VALUE';
    END IF;
  END IF;
  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ')' || v_sopra || ' VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registro_leggi(p_token text, p_dal date DEFAULT NULL::date, p_al date DEFAULT NULL::date, p_operatore text DEFAULT ''::text, p_categoria text DEFAULT ''::text, p_cerca text DEFAULT ''::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op text;
  v_admin boolean;
  v_da timestamptz;
  v_a timestamptz;
  v_cerca text;
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 5000);
  v_off int := GREATEST(COALESCE(p_offset, 0), 0);
  v_righe json;
  v_tot bigint;
  v_ops json;
  v_set text[];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF NOT v_admin AND NOT _pagina_visibile(p_token, 'registro') THEN
    RAISE EXCEPTION 'Permesso mancante: Registro attivita';
  END IF;
  v_set := CASE WHEN v_admin THEN NULL ELSE _settori_operatore(p_token, false) END;
  IF COALESCE(p_categoria, '') <> '' AND p_categoria <> 'altro'
     AND NOT EXISTS (SELECT 1 FROM _registro_categorie() c WHERE c.chiave = p_categoria) THEN
    RAISE EXCEPTION 'Categoria del registro sconosciuta: %', p_categoria;
  END IF;
  v_da := CASE WHEN p_dal IS NULL THEN NULL ELSE (p_dal::timestamp AT TIME ZONE 'Europe/Zurich') END;
  v_a := CASE WHEN p_al IS NULL THEN NULL ELSE ((p_al + 1)::timestamp AT TIME ZONE 'Europe/Zurich') END;
  v_cerca := NULLIF(btrim(COALESCE(p_cerca, '')), '');
  IF v_cerca IS NOT NULL THEN
    v_cerca := '%' || replace(replace(replace(v_cerca, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  -- righe del periodo con categoria e ricerca; l operatore si filtra dopo, cosi la lista dei
  -- nomi resta quella del periodo e non solo il nome scelto
  WITH periodo AS (
    SELECT l.id, l.operatore, l.azione, l.dettaglio, l.created_at, l.reparto_dip
    FROM log_attivita l
    WHERE (v_da IS NULL OR l.created_at >= v_da)
      AND (v_a IS NULL OR l.created_at < v_a)
      AND (COALESCE(p_categoria, '') = '' OR _registro_categoria(l.azione) = p_categoria)
      AND (v_cerca IS NULL OR l.azione ILIKE v_cerca OR COALESCE(l.dettaglio, '') ILIKE v_cerca
           OR COALESCE(l.operatore, '') ILIKE v_cerca)
      -- 20260932_b: chi ha un settore legge solo le righe dei suoi settori
      AND (v_set IS NULL OR lower(COALESCE(l.reparto_dip, 'slots')) = ANY(v_set))
  ),
  scelte AS (
    SELECT * FROM periodo WHERE COALESCE(p_operatore, '') = '' OR COALESCE(operatore, '') = p_operatore
  ),
  pagina AS (
    SELECT s.*, _registro_categoria(s.azione) AS categoria FROM scelte s
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT v_lim OFFSET v_off
  )
  SELECT
    (SELECT COALESCE(json_agg(p ORDER BY p.created_at DESC, p.id DESC), '[]'::json) FROM pagina p),
    (SELECT count(*) FROM scelte),
    (SELECT COALESCE(json_agg(o ORDER BY o), '[]'::json) FROM (SELECT DISTINCT COALESCE(operatore, '') AS o FROM periodo) x)
  INTO v_righe, v_tot, v_ops;

  RETURN json_build_object(
    'righe', v_righe,
    'totale', v_tot,
    'operatori', v_ops,
    'categorie', (SELECT json_agg(json_build_object('chiave', c.chiave, 'etichetta', c.etichetta) ORDER BY c.ordine)
                  FROM _registro_categorie() c));
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_piano BOOLEAN;
  v_set TEXT[];
  v_sett TEXT;
  v_vecchio JSONB;
  v_nuovo JSONB;
  v_nomi TEXT[];
  k TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  -- 20260911: password e codice di recupero solo con le loro funzioni
  IF p_chiave IN ('password_hash', 'password_hash_v2', 'recovery_code') THEN
    RAISE EXCEPTION 'Password: si cambia solo con la funzione apposita';
  END IF;
  -- 20260914: colonne del briefing, un elenco JSON per settore (vuoto = predefinite)
  IF p_chiave LIKE 'brief\_colonne\_%' THEN
    v_sett := substr(p_chiave, 15);
    IF v_sett !~ '^[a-z0-9_-]{1,40}$' OR NOT _settore_esiste(v_sett) THEN
      RAISE EXCEPTION 'Settore non valido: %', v_sett;
    END IF;
    IF COALESCE(p_valore, '') <> '' THEN
      BEGIN
        IF jsonb_typeof(p_valore::jsonb) <> 'array' OR jsonb_array_length(p_valore::jsonb) > 30
           OR length(p_valore) > 8000 THEN
          RAISE EXCEPTION 'x';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Colonne del briefing: valore non valido';
      END;
    END IF;
  END IF;
  -- 20260915: colonne dell import del piano, un oggetto JSON per settore (vuoto = nessuna)
  IF p_chiave LIKE 'piano\_import\_colonne\_%' THEN
    v_sett := substr(p_chiave, 22);
    IF v_sett !~ '^[a-z0-9_-]{1,40}$' OR NOT _settore_esiste(v_sett) THEN
      RAISE EXCEPTION 'Settore non valido: %', v_sett;
    END IF;
    IF COALESCE(p_valore, '') <> '' THEN
      BEGIN
        IF jsonb_typeof(p_valore::jsonb) <> 'object' OR length(p_valore) > 2000 THEN
          RAISE EXCEPTION 'x';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Colonne dell import: valore non valido';
      END;
    END IF;
  END IF;
  IF NOT COALESCE(v_admin, false) THEN
    v_piano := _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_formazioni')
      OR _sessione_permesso(p_token, 'gestione_corsi') OR _sessione_permesso(p_token, 'gestione_briefing')
      OR _permesso_piano_auto(p_token, 'piano_auto_vacanze')
      OR _permesso_piano_auto(p_token, 'piano_auto_genera') OR _permesso_piano_auto(p_token, 'piano_auto_import');
    IF p_chiave IN ('backup_ultimo', 'giubileo_notificati') THEN
      NULL; -- registri automatici del programma
    -- 20260932_b (decisione del titolare 01/11/2026): categorie dell inventario del proprio
    -- settore per chi ha la pagina Inventario; cambiano solo le voci dei suoi settori
    -- (Buoni e Sigarette, la parte _base, restano dell amministratore)
    ELSIF p_chiave = 'inventario_categorie_extra' THEN
      IF NOT _pagina_visibile(p_token, 'inventario') THEN
        RAISE EXCEPTION 'Permesso mancante: inventario';
      END IF;
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL THEN
        BEGIN
          SELECT valore::jsonb INTO v_vecchio FROM impostazioni WHERE chiave = p_chiave;
          v_nuovo := COALESCE(NULLIF(p_valore, ''), '{}')::jsonb;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'Categorie dell inventario: valore non valido';
        END;
        v_vecchio := COALESCE(v_vecchio, '{}'::jsonb);
        IF jsonb_typeof(v_vecchio) <> 'object' OR jsonb_typeof(v_nuovo) <> 'object' THEN
          RAISE EXCEPTION 'Categorie dell inventario nel formato di prima: le cambia l amministratore';
        END IF;
        IF (v_vecchio -> '_base') IS DISTINCT FROM (v_nuovo -> '_base') THEN
          RAISE EXCEPTION 'Buoni e Sigarette dell inventario: solo amministratore';
        END IF;
        FOR k IN SELECT x FROM jsonb_object_keys(v_vecchio) x UNION SELECT y FROM jsonb_object_keys(v_nuovo) y LOOP
          IF k <> '_base' AND (v_vecchio -> k) IS DISTINCT FROM (v_nuovo -> k) AND NOT (lower(k) = ANY(v_set)) THEN
            RAISE EXCEPTION 'Permesso mancante: categorie dell inventario del settore % (non e uno dei tuoi settori)', k;
          END IF;
        END LOOP;
      END IF;
    ELSIF p_chiave = 'punti_config' THEN
      IF NOT _sessione_permesso(p_token, 'gestione_punti') THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END IF;
    ELSIF p_chiave = 'piano_corsi_orari' THEN
      IF NOT (_sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_corsi')) THEN
        RAISE EXCEPTION 'Permesso mancante: corsi';
      END IF;
    ELSIF p_chiave IN ('brief_evidenziazioni', 'piano_giorno_marker', 'piano_ordine_collab', 'piano_vacanze_ok',
                       'piano_formazione_modelli') OR p_chiave LIKE 'recupero\_colori\_%' THEN
      IF NOT v_piano THEN
        RAISE EXCEPTION 'Permesso mancante: piano';
      END IF;
    ELSIF p_chiave LIKE 'brief\_colonne\_%' THEN
      -- chi compila il briefing (come la tabella piano_briefing), solo nei propri settori
      IF NOT (_sessione_permesso(p_token, 'gestione_briefing') OR _sessione_permesso(p_token, 'gestione_piano')) THEN
        RAISE EXCEPTION 'Permesso mancante: briefing';
      END IF;
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (v_sett = ANY(v_set)) THEN
        RAISE EXCEPTION 'Permesso mancante: briefing del settore % (non e uno dei tuoi settori)', v_sett;
      END IF;
    ELSIF p_chiave LIKE 'piano\_import\_colonne\_%' THEN
      -- chi importa il piano da file (come nel programma: piano e "Importare da file"),
      -- solo nei propri settori
      IF NOT (_sessione_permesso(p_token, 'gestione_piano') AND _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
        RAISE EXCEPTION 'Permesso mancante: importare il piano da file';
      END IF;
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (v_sett = ANY(v_set)) THEN
        RAISE EXCEPTION 'Permesso mancante: import del settore % (non e uno dei tuoi settori)', v_sett;
      END IF;
    ELSE
      -- tutte le altre, compresa piano_regole_fonte (riferimenti normativi delle regole)
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  -- 20260932_b: chi ha un settore legge solo la sua parte di queste impostazioni
  -- (_impostazione_ambito): quello che manda si unisce alla parte degli altri settori, che resta
  IF NOT COALESCE(v_admin, false) AND _settori_operatore(p_token, false) IS NOT NULL
     AND p_chiave IN ('piano_ordine_collab', 'giubileo_notificati') THEN
    p_valore := _impostazione_unisci(p_token, p_chiave, p_valore);
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;


DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['_nomi_ambito(text, boolean)', '_settori_collegati(text)', '_ambito_operatori(text)',
                           '_ambito_tabella(text, text, boolean)', '_controlla_settore_dati(text, text, jsonb, boolean)',
                           '_impostazione_ambito(text, text, text)', '_impostazione_unisci(text, text, text)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM anon, authenticated';
    END IF;
  END LOOP;
END $$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260932_b_settore_letture_scritture')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
