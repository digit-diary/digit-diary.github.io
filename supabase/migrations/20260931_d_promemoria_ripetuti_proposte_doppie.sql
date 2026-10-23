-- 23/10/2026 · RIVERIFICA 4: RIPETIZIONE DEI PROMEMORIA, SETTORE DEI PROMEMORIA, DOPPIONI E
-- SCHEDE TOLTE NELLE PROPOSTE DI PUNTI
--   N1: la ripetizione di un promemoria la crea il database (promemoria_ripeti) con l autore
--       della volta prima, dopo il controllo dei permessi; 'togli' per Annulla del Fatto.
--   Nota A: _ambito_promemoria guarda anche il settore per i destinatari (come le consegne).
--   L1: approva e ripresenta rifanno lo stesso controllo dei doppioni di punti_proponi (anche
--       per il motivo); le copie doppie si chiudono come «doppione» (anche quelle gia rimaste).
--   L2: si approva solo per collaboratori attivi; collaboratori_unisci sposta anche le proposte.
-- Idempotente. Dopo 20260931_c_punti_proposte_consegne_promemoria.sql.

BEGIN;

-- PROMEMORIA: settore anche per i destinatari (come le consegne). Chi l ha scritto lo tocca
-- sempre; un destinatario («tutti» o il suo nome) solo nei suoi settori (i promemoria vecchi
-- senza settore valgono ovunque, come nel programma)
CREATE OR REPLACE FUNCTION public._ambito_promemoria(p_token text, p_op text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $f$
DECLARE
  v_set TEXT[] := CASE WHEN COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN NULL
                       ELSE _settori_operatore(p_token, false) END;
BEGIN
  RETURN ' AND (creato_da = ' || quote_literal(p_op) || ' OR ((lower(btrim(COALESCE(assegnato_a, ''''))) = ''tutti'' OR '
    || quote_literal(p_op) || ' = ANY (SELECT btrim(x) FROM unnest(string_to_array(COALESCE(assegnato_a, ''''), '','')) x))'
    || CASE WHEN v_set IS NULL THEN ''
            ELSE ' AND (reparto_dip IS NULL OR lower(reparto_dip) = ANY(' || quote_literal(v_set::text) || '::text[]))' END
    || '))';
END;
$f$;
REVOKE ALL ON FUNCTION public._ambito_promemoria(text, text) FROM PUBLIC;


-- RIPETIZIONE DEL PROMEMORIA (riverifica 4 N1): la crea il database con l autore della volta
-- prima (prima nasceva a nome di chi lo segnava fatto e l autore vero non lo controllava piu).
-- p_azione 'crea': il promemoria p_id e fatto e ripetitivo; chi chiama puo segnarlo fatto
-- (autore, destinatario dei suoi settori o amministratore); se c e gia il prossimo aperto non se
-- ne crea un altro. 'togli': Annulla del Fatto, toglie il prossimo nato da p_id se ancora aperto.
ALTER TABLE public.promemoria ADD COLUMN IF NOT EXISTS ripetuto_da bigint;
CREATE OR REPLACE FUNCTION public.promemoria_ripeti(p_token text, p_id bigint, p_data date, p_azione text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT := _validate_op_session(p_token);
  v_admin BOOLEAN;
  v_ok BOOLEAN;
  s promemoria%ROWTYPE;
  v_riga JSON;
  v_n INT;
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
BEGIN
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  SELECT * INTO s FROM promemoria WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promemoria non trovato';
  END IF;
  IF NOT v_admin THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM promemoria WHERE id = $1' || _ambito_promemoria(p_token, v_op) || ')' INTO v_ok USING p_id;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Permesso mancante: promemoria non tuo';
    END IF;
  END IF;
  IF lower(COALESCE(p_azione, '')) = 'togli' THEN
    DELETE FROM promemoria WHERE ripetuto_da = p_id AND completata IS NOT TRUE;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN json_build_object('tolti', v_n);
  END IF;
  IF lower(COALESCE(p_azione, '')) <> 'crea' THEN
    RAISE EXCEPTION 'Azione non valida';
  END IF;
  IF s.completata IS NOT TRUE OR NULLIF(btrim(COALESCE(s.ripetizione, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Il promemoria non e fatto o non si ripete';
  END IF;
  IF p_data IS NULL OR p_data <= s.data_scadenza OR p_data < v_oggi - 1 OR p_data > v_oggi + 400 THEN
    RAISE EXCEPTION 'Data della ripetizione non valida';
  END IF;
  SELECT row_to_json(x.*) INTO v_riga FROM promemoria x
   WHERE x.titolo = s.titolo AND x.ripetizione = s.ripetizione AND x.completata IS NOT TRUE
     AND x.data_scadenza >= p_data AND x.reparto_dip IS NOT DISTINCT FROM s.reparto_dip
     AND x.assegnato_a IS NOT DISTINCT FROM s.assegnato_a
   ORDER BY x.data_scadenza LIMIT 1;
  IF v_riga IS NOT NULL THEN
    RETURN json_build_object('gia', v_riga);
  END IF;
  INSERT INTO promemoria (titolo, descrizione, data_scadenza, assegnato_a, creato_da, ripetizione, reparto_dip, ripetuto_da)
  VALUES (s.titolo, s.descrizione, p_data, s.assegnato_a, s.creato_da, s.ripetizione, s.reparto_dip, p_id)
  RETURNING row_to_json(promemoria.*) INTO v_riga;
  RETURN json_build_object('nuovo', v_riga);
END;
$function$;
DO $g$
BEGIN
  REVOKE ALL ON FUNCTION public.promemoria_ripeti(text, bigint, date, text) FROM PUBLIC;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.promemoria_ripeti(text, bigint, date, text) TO anon, authenticated, service_role;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $g$;

-- PROPOSTE DI PUNTI: stato «doppione» (riverifica 4 L1) e controllo comune dei doppioni
DO $c$
BEGIN
  ALTER TABLE public.punti_proposte DROP CONSTRAINT IF EXISTS punti_proposte_stato_chk;
  ALTER TABLE public.punti_proposte ADD CONSTRAINT punti_proposte_stato_chk
    CHECK (stato IN ('da_approvare', 'approvata', 'rifiutata', 'ritirata', 'doppione'));
END $c$;
-- stesso fatto gia premiato o gia proposto: coperture, cambi e rifiuti per persona, azione,
-- assente e giorno; competenze e livelli per persona, azione e motivo. p_anche_aperte: conta
-- anche le altre proposte da approvare (per ripresenta e per proporre)
CREATE OR REPLACE FUNCTION public._punti_proposta_doppia(p_id bigint, p_coll text, p_az text, p_ass text, p_data date,
                                                         p_desc text, p_anche_aperte boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $f$
  SELECT CASE WHEN p_data IS NOT NULL THEN
    EXISTS (SELECT 1 FROM punti_proposte q WHERE q.id IS DISTINCT FROM p_id
               AND lower(btrim(q.collaboratore)) = lower(btrim(p_coll)) AND q.azione = p_az
               AND lower(btrim(COALESCE(q.rif_assente, ''))) = lower(btrim(COALESCE(p_ass, ''))) AND q.rif_data = p_data
               AND (q.stato = 'approvata' OR (p_anche_aperte AND q.stato = 'da_approvare')))
    OR EXISTS (SELECT 1 FROM punti_eventi e WHERE lower(btrim(e.collaboratore)) = lower(btrim(p_coll)) AND e.azione = p_az
                  AND lower(btrim(COALESCE(e.rif_assente, ''))) = lower(btrim(COALESCE(p_ass, ''))) AND e.rif_data = p_data)
  ELSE
    EXISTS (SELECT 1 FROM punti_proposte q WHERE q.id IS DISTINCT FROM p_id
               AND lower(btrim(q.collaboratore)) = lower(btrim(p_coll)) AND q.azione = p_az
               AND btrim(q.descrizione) = btrim(COALESCE(p_desc, ''))
               AND (q.stato = 'approvata' OR (p_anche_aperte AND q.stato = 'da_approvare')))
    OR EXISTS (SELECT 1 FROM punti_eventi e WHERE lower(btrim(e.collaboratore)) = lower(btrim(p_coll)) AND e.azione = p_az
                  AND btrim(COALESCE(e.descrizione, '')) = btrim(COALESCE(p_desc, '')))
  END
$f$;
REVOKE ALL ON FUNCTION public._punti_proposta_doppia(bigint, text, text, text, date, text, boolean) FROM PUBLIC;

-- copie doppie rimaste: si chiudono come «doppione» (resta la piu vecchia da approvare)
UPDATE public.punti_proposte p SET stato = 'doppione', deciso_da = 'sistema', deciso_at = now()
 WHERE p.stato = 'da_approvare'
   AND (_punti_proposta_doppia(p.id, p.collaboratore, p.azione, p.rif_assente, p.rif_data, p.descrizione, false)
        OR EXISTS (SELECT 1 FROM punti_proposte q WHERE q.id < p.id AND q.stato = 'da_approvare'
                     AND lower(btrim(q.collaboratore)) = lower(btrim(p.collaboratore)) AND q.azione = p.azione
                     AND (CASE WHEN p.rif_data IS NOT NULL
                               THEN lower(btrim(COALESCE(q.rif_assente, ''))) = lower(btrim(COALESCE(p.rif_assente, '')))
                                    AND q.rif_data = p.rif_data
                               ELSE q.rif_data IS NULL AND btrim(q.descrizione) = btrim(p.descrizione) END)));

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

DROP FUNCTION IF EXISTS public._ambito_promemoria(text);

CREATE OR REPLACE FUNCTION public.punti_proposte_decidi(p_token text, p_ids bigint[], p_decisione text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT := _validate_op_session(p_token);
  v_dec TEXT := lower(btrim(COALESCE(p_decisione, '')));
  v_app BOOLEAN;
  v_set TEXT[];
  v_cfg JSONB;
  p punti_proposte%ROWTYPE;
  v_id BIGINT;
  v_fatte JSON[] := ARRAY[]::json[];
  v_saltate TEXT[] := ARRAY[]::text[];
  v_riga JSON;
BEGIN
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF v_dec NOT IN ('approva', 'rifiuta', 'riapri', 'ritira', 'ripresenta') THEN
    RAISE EXCEPTION 'Decisione non valida: %', v_dec;
  END IF;
  v_app := _punti_approvatore(p_token);
  IF v_dec IN ('approva', 'rifiuta', 'riapri') AND NOT v_app THEN
    RAISE EXCEPTION 'Permesso mancante: approvare i punti (Punti e premi)';
  END IF;
  v_set := CASE WHEN COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN NULL
                ELSE _settori_operatore(p_token, false) END;
  IF v_dec = 'approva' THEN
    BEGIN
      SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
    EXCEPTION WHEN others THEN
      v_cfg := NULL;
    END;
    IF v_cfg IS NULL OR COALESCE(v_cfg ->> 'attivo', 'true') = 'false' THEN
      RAISE EXCEPTION 'Incentivi spenti: niente da approvare';
    END IF;
  END IF;
  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::bigint[]) LOOP
    SELECT * INTO p FROM punti_proposte WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      v_saltate := v_saltate || ('n. ' || v_id || ': non trovata');
      CONTINUE;
    END IF;
    IF v_app AND v_set IS NOT NULL AND NOT (lower(COALESCE(p.reparto_dip, 'slots')) = ANY (v_set)) THEN
      RAISE EXCEPTION 'Permesso mancante: proposta di un altro settore';
    END IF;
    IF v_dec IN ('ritira', 'ripresenta') AND NOT v_app AND p.proposto_da IS DISTINCT FROM v_op THEN
      RAISE EXCEPTION 'Permesso mancante: la proposta e di %', p.proposto_da;
    END IF;
    IF v_dec = 'approva' THEN
      IF p.stato <> 'da_approvare' THEN
        v_saltate := v_saltate || (p.collaboratore || ': gia ' || p.stato);
        CONTINUE;
      END IF;
      -- 20260931_d (L2): solo per collaboratori ancora attivi (scheda tolta o unita: no)
      IF NOT EXISTS (SELECT 1 FROM collaboratori WHERE lower(btrim(nome)) = lower(btrim(p.collaboratore)) AND attivo IS NOT FALSE) THEN
        v_saltate := v_saltate || (p.collaboratore || ': non e un collaboratore attivo');
        CONTINUE;
      END IF;
      -- 20260931_d (L1): stesso controllo dei doppioni di punti_proponi (anche per il motivo);
      -- la copia doppia si chiude come «doppione»
      IF _punti_proposta_doppia(p.id, p.collaboratore, p.azione, p.rif_assente, p.rif_data, p.descrizione, false) THEN
        UPDATE punti_proposte SET stato = 'doppione', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
        v_saltate := v_saltate || (p.collaboratore || ': doppione (punti gia assegnati per lo stesso fatto o motivo)');
        CONTINUE;
      END IF;
      INSERT INTO punti_eventi (collaboratore, punti, azione, descrizione, data_evento, operatore, reparto_dip, rif_assente, rif_data)
      VALUES (p.collaboratore, p.punti, p.azione, p.descrizione, (now() AT TIME ZONE 'Europe/Zurich')::date, v_op,
              p.reparto_dip, p.rif_assente, p.rif_data)
      RETURNING id INTO p.punti_evento_id;
      UPDATE punti_proposte SET stato = 'approvata', deciso_da = v_op, deciso_at = now(), punti_evento_id = p.punti_evento_id
       WHERE id = v_id;
    ELSIF v_dec = 'rifiuta' THEN
      IF p.stato <> 'da_approvare' THEN
        v_saltate := v_saltate || (p.collaboratore || ': gia ' || p.stato);
        CONTINUE;
      END IF;
      UPDATE punti_proposte SET stato = 'rifiutata', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
    ELSIF v_dec = 'riapri' THEN
      IF p.stato NOT IN ('approvata', 'rifiutata') THEN
        CONTINUE;
      END IF;
      IF p.stato = 'approvata' AND p.punti_evento_id IS NOT NULL THEN
        DELETE FROM punti_eventi WHERE id = p.punti_evento_id;
      END IF;
      UPDATE punti_proposte SET stato = 'da_approvare', deciso_da = NULL, deciso_at = NULL, punti_evento_id = NULL WHERE id = v_id;
    ELSIF v_dec = 'ritira' THEN
      IF p.stato <> 'da_approvare' THEN
        RAISE EXCEPTION 'Proposta gia decisa (%): non si ritira piu', p.stato;
      END IF;
      UPDATE punti_proposte SET stato = 'ritirata', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
    ELSE -- ripresenta
      IF p.stato <> 'ritirata' THEN
        CONTINUE;
      END IF;
      -- 20260931_d (L1): nel frattempo la stessa proposta e stata rifatta o premiata: doppione
      IF _punti_proposta_doppia(p.id, p.collaboratore, p.azione, p.rif_assente, p.rif_data, p.descrizione, true) THEN
        UPDATE punti_proposte SET stato = 'doppione', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
        v_saltate := v_saltate || (p.collaboratore || ': doppione (la stessa proposta c e gia)');
        CONTINUE;
      END IF;
      UPDATE punti_proposte SET stato = 'da_approvare', deciso_da = NULL, deciso_at = NULL WHERE id = v_id;
    END IF;
    SELECT row_to_json(x.*) INTO v_riga FROM punti_proposte x WHERE id = v_id;
    v_fatte := v_fatte || v_riga;
    INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
    VALUES (v_op,
            CASE v_dec WHEN 'approva' THEN 'Punti approvati' WHEN 'rifiuta' THEN 'Punti rifiutati'
                       WHEN 'riapri' THEN 'Punti di nuovo da approvare' WHEN 'ritira' THEN 'Proposta di punti ritirata'
                       ELSE 'Proposta di punti ripresentata' END,
            p.collaboratore || ' ' || CASE WHEN p.punti > 0 THEN '+' ELSE '' END || p.punti || ' (' || p.azione || ')'
              || COALESCE(' per ' || p.rif_assente, '') || ' · proposta da ' || p.proposto_da,
            p.reparto_dip);
  END LOOP;
  RETURN json_build_object('fatte', to_json(v_fatte), 'saltate', to_json(v_saltate));
END;
$function$;

CREATE OR REPLACE FUNCTION public.collaboratori_unisci(p_token text, p_tieni bigint, p_togli bigint, p_firma text, p_completa boolean DEFAULT false, p_conferma_doppie boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_calc JSONB;
  v_tn TEXT;
  v_xn TEXT;
  v_scheda JSONB;
  r RECORD;
  v_on TEXT;
  v_righe JSONB;
  v_tolte JSONB := '{}'::jsonb;
  v_spost JSONB := '{}'::jsonb;
  v_n INT;
  v_ndop INT := 0;
  v_c JSONB;
  v_completati TEXT[] := ARRAY[]::text[];
  v_txt TEXT;
  v_j JSONB;
  v_det TEXT;
  v_cid BIGINT;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Unire due schede: solo amministratore';
  END IF;
  v_op := _validate_op_session(p_token);
  -- le due schede ferme fino alla fine (un altro PC non le cambia a meta)
  PERFORM 1 FROM collaboratori WHERE id IN (p_tieni, p_togli) ORDER BY id FOR UPDATE;
  v_calc := _collab_unisci_calcola(p_tieni, p_togli);
  IF COALESCE(p_firma, '') <> (v_calc ->> 'firma') THEN
    RAISE EXCEPTION 'Nel frattempo i dati delle due schede sono cambiati: rifai l anteprima (niente e stato unito)';
  END IF;
  SELECT COALESCE(sum((e.value ->> 'doppie')::int), 0) INTO v_ndop FROM jsonb_each(v_calc -> 'tabelle') e;
  IF v_ndop > 0 AND NOT p_conferma_doppie THEN
    RAISE EXCEPTION 'Ci sono % righe doppie: conferma che resta quella della scheda da tenere', v_ndop;
  END IF;
  v_tn := v_calc #>> '{tieni,nome}';
  v_xn := v_calc #>> '{togli,nome}';
  SELECT to_jsonb(c) INTO v_scheda FROM collaboratori c WHERE c.id = p_togli;
  PERFORM set_config('diario.operatore', COALESCE(v_op, 'Admin'), true);

  -- 1. CAMPI VUOTI della scheda da tenere (solo se richiesto; quelli pieni non si toccano)
  IF p_completa THEN
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_calc -> 'campi') x WHERE x ->> 'azione' = 'completa' LOOP
      EXECUTE format('UPDATE collaboratori SET %1$I = (SELECT %1$I FROM collaboratori WHERE id = $2) WHERE id = $1',
                     v_c ->> 'campo') USING p_tieni, p_togli;
      v_completati := v_completati || (v_c ->> 'campo');
    END LOOP;
  END IF;

  -- 2. STORICO prima del piano: la storia della scheda tolta passa a quella tenuta; le celle
  --    doppie tolte qui sotto restano nello storico con il nome di prima
  UPDATE piano_storico SET collaboratore = v_tn WHERE collaboratore = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_spost := v_spost || jsonb_build_object('piano_storico', v_n);
  UPDATE collab_scelte_storico SET collaboratore = v_tn, collaboratore_id = p_tieni WHERE collaboratore_id = p_togli OR collaboratore = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_spost := v_spost || jsonb_build_object('collab_scelte_storico', v_n);

  -- 3. TABELLE: le righe doppie della scheda tolta vanno nel Cestino con la scheda (non si
  --    sovrascrive quella tenuta), le altre passano alla scheda tenuta
  FOR r IN SELECT * FROM _collab_unisci_tabelle() WHERE tab NOT IN ('piano_storico', 'collab_scelte_storico') LOOP
    IF r.chiavi IS NOT NULL THEN
      v_on := (SELECT string_agg(format('k.%1$I IS NOT DISTINCT FROM x.%1$I', c), ' AND ') FROM unnest(r.chiavi) c);
      EXECUTE format($q$
        WITH d AS (DELETE FROM %1$I x USING %1$I k
                    WHERE x.collaboratore = $2 AND k.collaboratore = $1 AND %2$s %3$s
                    RETURNING to_jsonb(x) AS riga)
        SELECT COALESCE(jsonb_agg(riga ORDER BY (riga ->> 'id')::bigint), '[]'::jsonb) FROM d$q$, r.tab, v_on, r.extra)
        INTO v_righe USING v_tn, v_xn;
      IF jsonb_array_length(v_righe) > 0 THEN v_tolte := v_tolte || jsonb_build_object(r.tab, v_righe); END IF;
    END IF;
    EXECUTE format('UPDATE %I SET collaboratore = $1 WHERE collaboratore = $2', r.tab) USING v_tn, v_xn;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object(r.tab, v_n); END IF;
  END LOOP;
  UPDATE registrazioni SET nome = v_tn WHERE nome = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('registrazioni', v_n); END IF;
  UPDATE punti_eventi SET rif_assente = v_tn WHERE rif_assente = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('punti_eventi.rif_assente', v_n); END IF;
  -- 20260931_d (L2): anche le proposte di punti passano alla scheda tenuta
  UPDATE punti_proposte SET collaboratore = v_tn WHERE lower(btrim(collaboratore)) = lower(btrim(v_xn));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('punti_proposte', v_n); END IF;
  UPDATE punti_proposte SET rif_assente = v_tn WHERE lower(btrim(rif_assente)) = lower(btrim(v_xn));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('punti_proposte.rif_assente', v_n); END IF;

  -- 4. PREFERENZE E PERMESSI: impostazioni, regole del piano, briefing da oggi in poi
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_ordine_collab';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'object' AND EXISTS (SELECT 1 FROM jsonb_each(v_j) e
                                                WHERE jsonb_typeof(e.value) = 'array' AND e.value ? v_xn) THEN
    SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) = 'array' AND e.value ? v_xn THEN
             (SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY pos), '[]'::jsonb)
                FROM (SELECT n, min(o) AS pos
                        FROM (SELECT CASE WHEN a.v = v_xn THEN v_tn ELSE a.v END AS n, a.o
                                FROM jsonb_array_elements_text(e.value) WITH ORDINALITY a(v, o)) s
                       GROUP BY n) t)
           ELSE e.value END)
      INTO v_j FROM jsonb_each(v_j) e;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'piano_ordine_collab';
  END IF;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'giubileo_notificati';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_j) a WHERE a LIKE v_xn || '|%') THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY pos), '[]'::jsonb) INTO v_j
      FROM (SELECT n, min(o) AS pos
              FROM (SELECT CASE WHEN a.v LIKE v_xn || '|%' THEN v_tn || substr(a.v, length(v_xn) + 1) ELSE a.v END AS n, a.o
                      FROM jsonb_array_elements_text(v_j) WITH ORDINALITY a(v, o)) s
             GROUP BY n) t;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'giubileo_notificati';
  END IF;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_vacanze_ok';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(v_j) k WHERE k LIKE v_xn || '|%') THEN
    -- a pari chiave vale quella della scheda tenuta (aggregata per ultima)
    SELECT jsonb_object_agg(CASE WHEN e.key LIKE v_xn || '|%' THEN v_tn || substr(e.key, length(v_xn) + 1) ELSE e.key END,
                            e.value ORDER BY (e.key LIKE v_xn || '|%') DESC)
      INTO v_j FROM jsonb_each(v_j) e;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'piano_vacanze_ok';
  END IF;
  UPDATE piano_regole_gruppo g
     SET valore = CASE WHEN lower(g.tipo_regola) = 'coordinatori'
                       THEN substring(g.valore FROM '^(.*\|)') || _collab_unisci_lista(substring(g.valore FROM '([^|]*)$'), v_xn, v_tn)
                       ELSE substring(g.valore FROM '^([^:]*:)') || _collab_unisci_lista(substring(g.valore FROM ':(.*)$'), v_xn, v_tn) END
   WHERE lower(COALESCE(g.tipo_regola, '')) IN ('coordinatori', 'turni_solo_collaboratori')
     AND ((lower(g.tipo_regola) = 'coordinatori' AND g.valore ~ '\|')
          OR (lower(g.tipo_regola) = 'turni_solo_collaboratori' AND g.valore ~ ':'))
     AND EXISTS (SELECT 1 FROM unnest(string_to_array(regexp_replace(COALESCE(g.valore, ''), '^.*[|:]', ''), ';')) t
                  WHERE lower(btrim(t)) = lower(v_xn));
  UPDATE piano_briefing b
     SET contenuto = jsonb_set(b.contenuto, '{righe}',
           (SELECT jsonb_agg(CASE WHEN e ->> 'nomeFull' = v_xn
                                  THEN e || jsonb_build_object('nomeFull', v_tn)
                                         || CASE WHEN e ->> 'nome' = _collab_breve(v_xn)
                                                 THEN jsonb_build_object('nome', _collab_breve(v_tn)) ELSE '{}'::jsonb END
                                  ELSE e END ORDER BY o)
              FROM jsonb_array_elements(b.contenuto -> 'righe') WITH ORDINALITY a(e, o)))
   WHERE b.data >= (now() AT TIME ZONE 'Europe/Zurich')::date
     AND jsonb_typeof(b.contenuto -> 'righe') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.contenuto -> 'righe') e WHERE e ->> 'nomeFull' = v_xn);

  -- 5. LA SCHEDA TOLTA nel Cestino (si ripristina da li), poi fuori dall elenco
  INSERT INTO collaboratori_cestino (collaboratore_id, nome, scheda, unito_in, unito_in_id, righe_tolte, riepilogo, eliminato_da)
  VALUES (p_togli, v_xn, v_scheda, v_tn, p_tieni, v_tolte,
          jsonb_build_object('spostate', v_spost, 'campi_completati', to_jsonb(v_completati), 'doppie', v_ndop),
          COALESCE(v_op, 'Admin'))
  RETURNING id INTO v_cid;
  DELETE FROM collaboratori WHERE id = p_togli;

  -- 6. REGISTRO
  SELECT string_agg(e.key || ' ' || e.value, ', ' ORDER BY e.key) INTO v_det FROM jsonb_each_text(v_spost) e WHERE e.value <> '0';
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (COALESCE(v_op, 'Admin'), 'Schede collaboratore unite',
          left('«' || v_xn || '» unita in «' || v_tn || '»: spostate ' || COALESCE(v_det, 'nessuna riga')
               || '; righe doppie nel Cestino ' || v_ndop
               || CASE WHEN cardinality(v_completati) > 0 THEN '; campi completati ' || array_to_string(v_completati, ', ') ELSE '' END
               || ' (Cestino n. ' || v_cid || ')', 2000),
          v_calc #>> '{tieni,reparto_dip}');

  RETURN json_build_object('ok', true, 'tieni', v_tn, 'togli', v_xn, 'spostate', v_spost, 'doppie', v_ndop,
                           'campi_completati', to_jsonb(v_completati), 'cestino_id', v_cid);
END;
$function$;

CREATE OR REPLACE FUNCTION public._collab_unisci_calcola(p_tieni bigint, p_togli bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_t JSONB;
  v_x JSONB;
  v_tn TEXT;
  v_xn TEXT;
  v_escl TEXT[] := ARRAY['id', 'collaboratore', 'collaboratore_id', 'created_at', 'updated_at', 'operatore',
                         'creato_il', 'modificato_il', 'quando'];
  r RECORD;
  v_on TEXT;
  v_ch TEXT;
  v_n INT;
  v_nd INT;
  v_lista JSONB;
  v_tabelle JSONB := '{}'::jsonb;
  v_doppie JSONB := '{}'::jsonb;
  v_campi JSONB := '[]'::jsonb;
  v_k TEXT;
  v_vt JSONB;
  v_vx JSONB;
  v_vuoto_t BOOLEAN;
  v_vuoto_x BOOLEAN;
  v_imp JSONB := '{}'::jsonb;
  v_txt TEXT;
  v_j JSONB;
  v_out JSONB;
  v_oper BOOLEAN := false;
BEGIN
  SELECT to_jsonb(c) INTO v_t FROM collaboratori c WHERE c.id = p_tieni;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Scheda da tenere non trovata (numero %)', p_tieni; END IF;
  SELECT to_jsonb(c) INTO v_x FROM collaboratori c WHERE c.id = p_togli;
  IF v_x IS NULL THEN RAISE EXCEPTION 'Scheda da togliere non trovata (numero %)', p_togli; END IF;
  IF p_tieni = p_togli THEN RAISE EXCEPTION 'Scegli due schede diverse'; END IF;
  v_tn := v_t ->> 'nome';
  v_xn := v_x ->> 'nome';

  -- DIARIO
  SELECT count(*) INTO v_n FROM registrazioni WHERE nome = v_xn;
  v_tabelle := v_tabelle || jsonb_build_object('registrazioni', jsonb_build_object('gruppo', 'diario', 'righe', v_n, 'doppie', 0));
  -- stesso giorno e stesso tipo in tutte e due (si spostano lo stesso: nessuna si cancella)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('giorno', g, 'tipo', tipo) ORDER BY g, tipo), '[]'::jsonb) INTO v_lista
    FROM (SELECT DISTINCT (x.data AT TIME ZONE 'Europe/Zurich')::date AS g, x.tipo
            FROM registrazioni x JOIN registrazioni k
              ON k.nome = v_tn AND k.tipo = x.tipo AND k.eliminato IS NOT TRUE
             AND (k.data AT TIME ZONE 'Europe/Zurich')::date = (x.data AT TIME ZONE 'Europe/Zurich')::date
           WHERE x.nome = v_xn AND x.eliminato IS NOT TRUE) s;
  v_doppie := v_doppie || jsonb_build_object('registrazioni', v_lista);
  SELECT count(*) INTO v_n FROM punti_eventi WHERE rif_assente = v_xn;
  v_tabelle := v_tabelle || jsonb_build_object('punti_eventi.rif_assente', jsonb_build_object('gruppo', 'punti', 'righe', v_n, 'doppie', 0));
  SELECT count(*) INTO v_n FROM punti_proposte WHERE lower(btrim(collaboratore)) = lower(btrim(v_xn)) OR lower(btrim(rif_assente)) = lower(btrim(v_xn));
  v_tabelle := v_tabelle || jsonb_build_object('punti_proposte', jsonb_build_object('gruppo', 'punti', 'righe', v_n, 'doppie', 0));

  -- TABELLE CON IL NOME
  FOR r IN SELECT * FROM _collab_unisci_tabelle() LOOP
    IF r.chiavi IS NULL THEN
      EXECUTE format('SELECT count(*)::int FROM %I WHERE collaboratore = $1', r.tab) INTO v_n USING v_xn;
      v_nd := 0;
    ELSE
      v_on := (SELECT string_agg(format('k.%1$I IS NOT DISTINCT FROM x.%1$I', c), ' AND ') FROM unnest(r.chiavi) c);
      v_ch := 'jsonb_build_object(' || (SELECT string_agg(format('%L, x.%I', c, c), ', ') FROM unnest(r.chiavi) c) || ')';
      EXECUTE format($q$
        SELECT count(*)::int, count(k.id)::int,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'chiave', %3$s,
                 'tieni', to_jsonb(k) - $3, 'togli', to_jsonb(x) - $3,
                 'diversi', (SELECT COALESCE(jsonb_agg(e.key ORDER BY e.key), '[]'::jsonb)
                               FROM jsonb_each(to_jsonb(x) - $3) e
                              WHERE (to_jsonb(k) - $3) -> e.key IS DISTINCT FROM e.value))
                 ORDER BY %3$s::text) FILTER (WHERE k.id IS NOT NULL), '[]'::jsonb)
          FROM %1$I x LEFT JOIN %1$I k ON k.collaboratore = $1 AND %2$s %4$s
         WHERE x.collaboratore = $2$q$, r.tab, v_on, v_ch, r.extra)
        INTO v_n, v_nd, v_lista USING v_tn, v_xn, v_escl;
      IF v_nd > 0 THEN v_doppie := v_doppie || jsonb_build_object(r.tab, v_lista); END IF;
    END IF;
    v_tabelle := v_tabelle || jsonb_build_object(r.tab, jsonb_build_object('gruppo', r.gruppo, 'righe', v_n, 'doppie', v_nd));
  END LOOP;

  -- CAMPI DELLA SCHEDA: uguali (fuori), vuoti nella scheda da tenere (si possono completare),
  -- diversi (resta quello della scheda da tenere)
  FOR v_k IN SELECT jsonb_object_keys(v_t) LOOP
    IF v_k IN ('id', 'nome', 'created_at') THEN CONTINUE; END IF;
    v_vt := v_t -> v_k;
    v_vx := v_x -> v_k;
    IF v_vt IS NOT DISTINCT FROM v_vx THEN CONTINUE; END IF;
    v_vuoto_t := v_vt IS NULL OR v_vt = 'null'::jsonb OR v_vt = '""'::jsonb OR v_vt = '{}'::jsonb OR v_vt = '[]'::jsonb;
    v_vuoto_x := v_vx IS NULL OR v_vx = 'null'::jsonb OR v_vx = '""'::jsonb OR v_vx = '{}'::jsonb OR v_vx = '[]'::jsonb;
    IF v_vuoto_x THEN CONTINUE; END IF;
    v_campi := v_campi || jsonb_build_array(jsonb_build_object('campo', v_k, 'tieni', v_vt, 'togli', v_vx,
                 'azione', CASE WHEN v_vuoto_t AND v_k NOT IN ('attivo', 'reparto_dip') THEN 'completa' ELSE 'diverso' END));
  END LOOP;

  -- PREFERENZE E PERMESSI: impostazioni con il nome, regole del piano, briefing futuri
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_ordine_collab';
    v_j := v_txt::jsonb;
    IF jsonb_typeof(v_j) = 'object' THEN
      SELECT count(*) INTO v_n FROM jsonb_each(v_j) e WHERE jsonb_typeof(e.value) = 'array' AND e.value ? v_xn;
      IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('piano_ordine_collab', v_n); END IF;
    END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'giubileo_notificati';
    SELECT count(*) INTO v_n FROM jsonb_array_elements_text(v_txt::jsonb) a WHERE a LIKE v_xn || '|%';
    IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('giubileo_notificati', v_n); END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_vacanze_ok';
    SELECT count(*) INTO v_n FROM jsonb_object_keys(v_txt::jsonb) k WHERE k LIKE v_xn || '|%';
    IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('piano_vacanze_ok', v_n); END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM piano_regole_gruppo g
   WHERE lower(COALESCE(g.tipo_regola, '')) IN ('coordinatori', 'turni_solo_collaboratori')
     AND EXISTS (SELECT 1 FROM unnest(string_to_array(regexp_replace(COALESCE(g.valore, ''), '^.*[|:]', ''), ';')) t
                  WHERE lower(btrim(t)) = lower(v_xn));
  IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('regole_piano', v_n); END IF;
  SELECT count(*) INTO v_n FROM piano_briefing b
   WHERE b.data >= (now() AT TIME ZONE 'Europe/Zurich')::date
     AND jsonb_typeof(b.contenuto -> 'righe') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.contenuto -> 'righe') e WHERE e ->> 'nomeFull' = v_xn);
  IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('briefing_futuri', v_n); END IF;

  BEGIN
    SELECT COALESCE(valore::jsonb ? v_xn, false) INTO v_oper FROM impostazioni WHERE chiave = 'operatori_lista';
  EXCEPTION WHEN others THEN v_oper := false;
  END;
  v_out := jsonb_build_object(
    'tieni', jsonb_build_object('id', p_tieni, 'nome', v_tn, 'attivo', v_t -> 'attivo', 'reparto_dip', v_t -> 'reparto_dip'),
    'togli', jsonb_build_object('id', p_togli, 'nome', v_xn, 'attivo', v_x -> 'attivo', 'reparto_dip', v_x -> 'reparto_dip'),
    'tabelle', v_tabelle,
    'doppie', v_doppie,
    'campi', v_campi,
    'impostazioni', v_imp,
    'operatore', COALESCE(v_oper, false));
  RETURN v_out || jsonb_build_object('firma', md5(v_out::text));
END;
$function$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260931_d_promemoria_ripetuti_proposte_doppie')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
