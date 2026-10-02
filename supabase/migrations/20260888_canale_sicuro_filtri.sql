-- v349 · SICUREZZA DEL CANALE SICURO
-- 1) FILTRI E ORDINAMENTI: secure_read/update/delete mettevano il filtro scritto
--    dalla pagina direttamente nella query. Dalla console del browser una sessione
--    qualsiasi poteva leggere le password cifrate (impostazioni) o cancellare una
--    tabella intera. Ora il database accetta solo la grammatica che la pagina
--    produce (_filtroSqlClausola in realtime.js): colonna operatore valore, IN (...),
--    IS TRUE/FALSE/NULL, unite da AND; ordinamento: colonne con ASC/DESC.
-- 2) AZIONI AUTOMATICHE DEL PIANO: cancellare a intervallo (mese, settore, nome)
--    in piano, piano_fabbisogni e piano_vacanze richiede il permesso
--    piano_azioni_auto; piano_bulk_upsert richiede gestione_piano o piano_azioni_auto.
-- 3) CAMBIO PASSWORD OBBLIGATO: solo con la sessione della persona stessa (prima
--    chiunque poteva impostare la password di un utente appena azzerato).
-- 4) IMPOSTAZIONI: piano_solver_url (riceve il token di chi lancia il solver) e
--    maison_auto_delete_giorni (pulizia automatica dei costi Maison) solo admin;
--    piano_corsi_orari anche a chi gestisce piano o corsi (prima falliva per loro).
-- Corpi identici a quelli in produzione al 02.10.2026 piu i controlli.

CREATE OR REPLACE FUNCTION public._filtro_sicuro(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  s TEXT;
  v_lit TEXT := '(L|TRUE|FALSE|NULL)';
  v_id TEXT := '[A-Za-z_][A-Za-z0-9_]*';
  v_cl TEXT;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN true; END IF;
  -- i valori tra apici (con '' all interno) diventano L; poi non deve restare nessun apice
  s := regexp_replace(p, '''(?:[^'']|'''')*''', 'L', 'g');
  IF position('''' IN s) > 0 THEN RETURN false; END IF;
  v_cl := '(' || v_id || ' (=|!=|>|>=|<|<=|LIKE|ILIKE) ' || v_lit
       || '|' || v_id || ' IS (TRUE|FALSE|NULL)'
       || '|' || v_id || ' IN \(' || v_lit || '(, ' || v_lit || ')*\))';
  RETURN s ~ ('^' || v_cl || '( AND ' || v_cl || ')*$');
END;
$function$;

CREATE OR REPLACE FUNCTION public._ordine_sicuro(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p IS NULL OR btrim(p) = '' OR p ~* '^[a-z_][a-z0-9_]*( (asc|desc))?( nulls (first|last))?(, [a-z_][a-z0-9_]*( (asc|desc))?( nulls (first|last))?)*$';
$function$;

CREATE OR REPLACE FUNCTION public.secure_read(p_token text, p_table text, p_filter text DEFAULT ''::text, p_order text DEFAULT ''::text, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_result JSON;
  v_query TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

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

  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || quote_ident(p_table);

  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
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
AS $function$
DECLARE
  v_op TEXT;
  v_set TEXT := '';
  v_key TEXT;
  v_val JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  -- IMPOSTAZIONI (v332): si scrivono con upsert_impostazione, che protegge le
  -- chiavi riservate all amministratore. Per questa strada generica le scrive
  -- solo l amministratore: prima un operatore poteva cambiare profili e
  -- visibilita dalla console del browser saltando il controllo.
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

  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE ' || p_filter;
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
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
  -- cancellare a intervallo nel piano (un mese, un settore, una persona) e un azione
  -- automatica; una o piu righe scelte per id restano a chi modifica il piano
  IF p_table IN ('piano', 'piano_fabbisogni', 'piano_vacanze')
     AND p_filter !~ '^id (= ''[^'']*''|IN \(''[^'']*''(, ''[^'']*'')*\))$'
     AND NOT _sessione_permesso(p_token, 'piano_azioni_auto') THEN
    RAISE EXCEPTION 'Permesso mancante: azioni automatiche del piano';
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

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE ' || p_filter;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piano_bulk_upsert(p_token text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_ins INT := 0;
  r JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF NOT (_sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'piano_azioni_auto')) THEN
    RAISE EXCEPTION 'Permesso mancante: piano';
  END IF;
  IF jsonb_typeof(p_rows) != 'array' OR jsonb_array_length(p_rows) > 3000 THEN
    RAISE EXCEPTION 'Righe non valide (max 3000)';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO piano (collaboratore, data, codice, protetto, generato, commento, reparto_dip, operatore,
                       ora_inizio, ora_fine, colore, motivo_blocco)
    VALUES (
      r->>'collaboratore',
      (r->>'data')::DATE,
      r->>'codice',
      COALESCE((r->>'protetto')::BOOLEAN, FALSE),
      COALESCE((r->>'generato')::BOOLEAN, TRUE),
      NULLIF(r->>'commento', ''),
      COALESCE(r->>'reparto_dip', 'slots'),
      COALESCE(NULLIF(r->>'operatore', ''), v_op),
      NULLIF(r->>'ora_inizio', ''),
      NULLIF(r->>'ora_fine', ''),
      NULLIF(r->>'colore', ''),
      NULLIF(r->>'motivo_blocco', '')
    )
    ON CONFLICT (collaboratore, data) DO NOTHING;
    IF FOUND THEN v_ins := v_ins + 1; END IF;
  END LOOP;

  RETURN json_build_object('inserite', v_ins);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF p_chiave IN (
    'password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key', 'groq_modelli',
    'ai_fornitori', 'ai_fornitore_attivo', 'ai_fornitore_riserva', 'reparti_nomi_documenti',
    'visibilita', 'profili_operatori', 'profili_custom', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'valutatori_config', 'moduli_responsabili',
    'conservazione_anni', 'conservazione_giorni_grazia', 'backup_auto_giorni',
    'tipi_personalizzati', 'tipi_nascosti', 'tipi_ordine', 'tipi_rinominati', 'colori_override',
    'campi_label_override', 'campi_nascosti', 'campi_ordine', 'campi_rapporto_extra', 'campi_rapporto_reparti',
    'buono_valori', 'inventario_categorie_extra',
    'piano_cd_config', 'piano_pause_cfg', 'piano_funzioni', 'piano_ore_settimanali', 'piano_max_cambi_mese',
    'piano_giorni_weekend', 'piano_giorni_formazione', 'piano_corsi_lista', 'piano_competenze_gruppi',
    'piano_solver_url', 'maison_auto_delete_giorni'
  ) THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  -- orari dei corsi: chi gestisce il piano o i corsi
  IF p_chiave = 'piano_corsi_orari' AND NOT (COALESCE(v_admin, false)
       OR _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_corsi')) THEN
    RAISE EXCEPTION 'Permesso mancante: corsi';
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.force_change_pwd(p_nome text, p_new_hash text, p_deve_cambiare boolean, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  should_change BOOLEAN;
BEGIN
  IF p_token IS NOT NULL AND _verify_admin_session(p_token) THEN
    -- Admin autorizzato: puo cambiare per chiunque
    UPDATE operatori_auth SET pwd_hash_v2 = p_new_hash, pwd_hash = NULL, deve_cambiare_pwd = p_deve_cambiare WHERE nome = p_nome;
  ELSE
    -- Cambio obbligato: solo la persona stessa, appena entrata con la password
    -- provvisoria (sessione valida a suo nome), e solo se deve cambiarla
    IF p_token IS NULL OR _validate_op_session(p_token) IS DISTINCT FROM p_nome THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    SELECT deve_cambiare_pwd INTO should_change FROM operatori_auth WHERE nome = p_nome;
    IF NOT FOUND OR NOT COALESCE(should_change, false) THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    IF p_deve_cambiare != false THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    UPDATE operatori_auth SET pwd_hash_v2 = p_new_hash, pwd_hash = NULL, deve_cambiare_pwd = false WHERE nome = p_nome;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false);
  END IF;
  RETURN json_build_object('success', true);
END;
$function$
;

-- permesso iniziale: Responsabile e Sostituto (dai profili assegnati), se non c e gia
DO $$
DECLARE
  v_vis JSONB;
  v_prof JSONB;
  v_lista JSONB;
BEGIN
  SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  SELECT valore::jsonb INTO v_prof FROM impostazioni WHERE chiave = 'profili_operatori';
  IF v_vis IS NULL OR v_prof IS NULL OR v_vis ? 'piano_azioni_auto' THEN RETURN; END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) INTO v_lista FROM jsonb_each_text(v_prof) WHERE value IN ('resp', 'sost');
  UPDATE impostazioni SET valore = (v_vis || jsonb_build_object('piano_azioni_auto', jsonb_build_object('tipo', 'selezionati', 'operatori', v_lista)))::text
   WHERE chiave = 'visibilita';
END $$;

NOTIFY pgrst, 'reload schema';
