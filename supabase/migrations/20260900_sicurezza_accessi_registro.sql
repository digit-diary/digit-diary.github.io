-- ============================================================
-- SICUREZZA DEGLI ACCESSI E DEL REGISTRO (v407, check generale del 07-08/10/2026)
-- 1) Operatore rimosso: si chiudono subito sessioni e dispositivi biometrici, e il
--    rinnovo della sessione non funziona piu per chi non esiste (prima restava dentro).
-- 2) Cambio password (operatore, obbligato, principale): si chiudono le altre sessioni
--    e i dispositivi biometrici di quella persona; resta solo la sessione di chi cambia.
-- 3) Biometria: un dispositivo vale 90 giorni dalla registrazione e non da mai i diritti
--    da amministratore (l amministratore entra con la password principale). Il programma
--    non usa piu la biometria per rinnovare la sessione senza un gesto della persona.
-- 4) Registro attivita: non si modifica (solo aggiunte; cancellazione solo amministratore).
--    Messaggi della chat e note dei colleghi: modifica e cancellazione solo dei propri.
-- 5) Impostazioni: ELENCO DELLE CHIAVI CONSENTITE a chi non e amministratore (prima un
--    elenco di quelle vietate: una chiave nuova dimenticata restava aperta). Le chiavi del
--    piano a chi gestisce piano, formazioni o corsi; i punti (inventario dei premi) a chi
--    gestisce i punti.
-- 6) Accesso: oltre a 5 errori in 30 secondi, al massimo 20 errori in un ora per nome.
-- 7) Funzioni con privilegi (SECURITY DEFINER): search_path fisso (public, extensions);
--    le funzioni del canale sicuro con standard_conforming_strings attivo (i filtri si
--    leggono sempre nello stesso modo).
-- 8) rinomina_collaboratore: rinomina in tutte le tabelle in una sola transazione (prima
--    dal programma, tabella per tabella: un errore a meta lasciava i dati divisi).
-- Si puo rilanciare. Le funzioni nuove sono concesse esplicitamente (dalla 20260895 una
-- funzione non concessa non e eseguibile).
-- ============================================================

-- 1) rimozione operatore
CREATE OR REPLACE FUNCTION public.remove_operator(p_nome text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  DELETE FROM operatori_auth WHERE nome = p_nome;
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.renew_op_session(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_new TEXT;
BEGIN
  SELECT operatore, is_admin INTO v_op, v_admin
    FROM operator_sessions
    WHERE token = p_token AND expires_at > now() - interval '7 days'
    LIMIT 1;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- v407: un operatore rimosso non rinnova piu (prima la sessione durava per sempre);
  -- l amministratore entra con la password principale (operatore "Admin")
  IF NOT (COALESCE(v_admin, false) AND v_op = 'Admin') AND NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = v_op) THEN
    DELETE FROM operator_sessions WHERE token = p_token;
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_new := _create_op_session(v_op, COALESCE(v_admin, false));
  DELETE FROM operator_sessions WHERE token = p_token;
  RETURN json_build_object('session_token', v_new, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$function$;

-- 2) cambio password: le altre sessioni e la biometria della persona si chiudono
DROP FUNCTION IF EXISTS public.change_op_pwd(text, text, text, text);
CREATE OR REPLACE FUNCTION public.change_op_pwd(p_nome text, p_old_hash text, p_new_hash text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
  valid BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit('__op_change_' || p_nome) THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;
  SELECT pwd_hash, pwd_hash_v2 INTO stored, stored_v2 FROM operatori_auth WHERE nome = p_nome;
  IF stored IS NULL AND stored_v2 IS NULL THEN
    PERFORM _record_attempt('__op_change_' || p_nome, false);
    RETURN json_build_object('success', false);
  END IF;
  IF stored_v2 IS NOT NULL AND stored_v2 = p_old_hash THEN valid := true;
  ELSIF p_old_legacy_hash IS NOT NULL AND stored IS NOT NULL AND stored = p_old_legacy_hash THEN valid := true;
  ELSIF stored IS NOT NULL AND stored = p_old_hash THEN valid := true;
  END IF;
  IF NOT valid THEN
    PERFORM _record_attempt('__op_change_' || p_nome, false);
    RETURN json_build_object('success', false);
  END IF;
  UPDATE operatori_auth SET pwd_hash_v2 = p_new_hash, pwd_hash = NULL, deve_cambiare_pwd = false WHERE nome = p_nome;
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin AND token IS DISTINCT FROM p_token;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  PERFORM _record_attempt('__op_change_' || p_nome, true);
  RETURN json_build_object('success', true);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.change_op_pwd(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_op_pwd(text, text, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.force_change_pwd(p_nome text, p_new_hash text, p_deve_cambiare boolean, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  should_change BOOLEAN;
BEGIN
  IF p_token IS NOT NULL AND _verify_admin_session(p_token) THEN
    UPDATE operatori_auth SET pwd_hash_v2 = p_new_hash, pwd_hash = NULL, deve_cambiare_pwd = p_deve_cambiare WHERE nome = p_nome;
  ELSE
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
  -- password nuova: le sessioni e i dispositivi di prima della persona si chiudono
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin AND token IS DISTINCT FROM p_token;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_master_pwd(p_old_hash text, p_new_hash text, p_new_recovery text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
  valid BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit('__master_change__') THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  IF stored_v2 IS NOT NULL AND stored_v2 = p_old_hash THEN valid := true;
  ELSIF p_old_legacy_hash IS NOT NULL AND stored IS NOT NULL AND stored = p_old_legacy_hash THEN valid := true;
  ELSIF stored IS NOT NULL AND stored = p_old_hash THEN valid := true;
  END IF;
  IF NOT valid THEN
    PERFORM _record_attempt('__master_change__', false);
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_new_hash)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  -- le altre sessioni da amministratore si chiudono (resta quella di chi cambia)
  DELETE FROM operator_sessions WHERE is_admin AND token IS DISTINCT FROM p_token;
  PERFORM _record_attempt('__master_change__', true);
  RETURN json_build_object('success', true);
END;
$function$;

-- 3) biometria: 90 giorni, mai amministratore
CREATE OR REPLACE FUNCTION public.set_bio_device(p_token text, p_impronta text, p_nome_dispositivo text DEFAULT NULL::text)
 RETURNS json
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
  IF p_impronta IS NULL OR length(p_impronta) < 32 THEN
    RAISE EXCEPTION 'Impronta non valida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = v_op) THEN
    RAISE EXCEPTION 'La biometria vale per gli operatori (l amministratore entra con la password principale)';
  END IF;
  -- registrare di nuovo lo stesso dispositivo riparte da oggi (90 giorni)
  INSERT INTO bio_dispositivi (operatore, impronta, is_admin, nome_dispositivo)
  VALUES (v_op, p_impronta, false, left(p_nome_dispositivo, 80))
  ON CONFLICT (operatore, impronta) DO UPDATE
    SET nome_dispositivo = EXCLUDED.nome_dispositivo, is_admin = false, created_at = now();
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_bio_session(p_nome text, p_impronta text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_creato TIMESTAMPTZ;
  v_session TEXT;
BEGIN
  IF NOT _check_rate_limit(p_nome) THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT created_at INTO v_creato FROM bio_dispositivi
    WHERE operatore = p_nome AND impronta = p_impronta LIMIT 1;
  IF v_creato IS NULL OR NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = p_nome) THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('error', 'Dispositivo non riconosciuto');
  END IF;
  IF v_creato < now() - interval '90 days' THEN
    DELETE FROM bio_dispositivi WHERE operatore = p_nome AND impronta = p_impronta;
    RETURN json_build_object('error', 'Dispositivo scaduto (90 giorni): entra con la password e riattiva la biometria');
  END IF;
  PERFORM _record_attempt(p_nome, true);
  UPDATE bio_dispositivi SET ultimo_uso = now() WHERE operatore = p_nome AND impronta = p_impronta;
  v_session := _create_op_session(p_nome, false);
  RETURN json_build_object('session_token', v_session, 'is_admin', false);
END;
$function$;
-- dispositivi registrati da amministratore: da oggi valgono come operatore (se lo e)
UPDATE bio_dispositivi SET is_admin = false WHERE is_admin;
DELETE FROM bio_dispositivi b WHERE NOT EXISTS (SELECT 1 FROM operatori_auth o WHERE o.nome = b.operatore);

-- 4) registro solo in aggiunta; messaggi e note solo propri
CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_admin BOOLEAN := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
  END IF;
  -- v359: il fabbisogno lo vedono tutti, lo scrive solo chi ha il permesso
  -- (voce nuova se c e, altrimenti quella di prima: _permesso_piano_auto)
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
      -- gli altri eventi (formazione, livello, impiego, categoria...) sono il registro
      -- automatico di azioni gia permesse da altri permessi
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
  IF p_table = 'collaboratori' AND p_azione IN ('insert', 'update') AND p_data IS NOT NULL THEN
    -- in modifica basta che il campo ci sia (anche per cancellarlo); in un
    -- collaboratore nuovo conta solo se ha un valore
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
    -- funzione, percentuale, lingue e Jolly/Fisso di un collaboratore esistente
    -- (la percentuale cambia le ore dovute): chi gestisce l impiego o lo Storico HR
    IF p_azione = 'update' AND p_data ?| ARRAY['funzione', 'percentuale', 'lingue', 'impiego', 'is_jolly']
       AND NOT (_sessione_permesso(p_token, 'gestione_impiego') OR _hr_modifica(p_token)) THEN
      RAISE EXCEPTION 'Permesso mancante: impiego (funzione, percentuale, lingue, Jolly/Fisso)';
    END IF;
  END IF;
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

  -- v407: messaggi e note dei colleghi si modificano solo se propri (prima chiunque
  -- poteva cambiare quelli degli altri dalla console); le REAZIONI a un messaggio le
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
  -- cancellare a intervallo nel piano (un mese, un settore, una persona) e un azione
  -- automatica; una o piu righe scelte per id restano a chi modifica il piano
  -- v356: quattro permessi (genera, vacanze, import, cancella) al posto di uno;
  -- il fabbisogno a intervallo anche a chi modifica il piano (copia e incolla liberi)
  IF p_filter !~ '^id (= ''[^'']*''|IN \(''[^'']*''(, ''[^'']*'')*\))$' THEN
    IF p_table = 'piano' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_genera')
         OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      -- v364: generazione automatica in corso da questa sessione = lasciapassare
      -- limitato al mese e al settore prenotati, e solo celle scritte dal programma
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

  -- v407: messaggi e note dei colleghi si cancellano solo se propri (l amministratore tutti)
  IF p_table IN ('chat_messages', 'note_colleghi')
     AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    v_ambito := v_ambito || ' AND da_operatore = ' || quote_literal(v_op);
  END IF;
  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
END;
$function$;

-- 5) impostazioni: elenco delle chiavi consentite a chi non e amministratore
CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_piano BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF NOT COALESCE(v_admin, false) THEN
    v_piano := _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_formazioni')
      OR _sessione_permesso(p_token, 'gestione_corsi') OR _sessione_permesso(p_token, 'gestione_briefing')
      OR _permesso_piano_auto(p_token, 'piano_auto_vacanze')
      OR _permesso_piano_auto(p_token, 'piano_auto_genera') OR _permesso_piano_auto(p_token, 'piano_auto_import');
    IF p_chiave IN ('backup_ultimo', 'giubileo_notificati') THEN
      NULL; -- registri automatici del programma
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
    ELSE
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;

-- 6) accesso: al massimo 20 errori in un ora per nome (oltre ai 5 in 30 secondi)
CREATE OR REPLACE FUNCTION public._check_rate_limit(p_nome text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  cnt INT;
  cnt_ora INT;
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < (clock_timestamp() - interval '1 hour');
  SELECT COUNT(*) FILTER (WHERE attempted_at > (clock_timestamp() - interval '30 seconds')), COUNT(*)
    INTO cnt, cnt_ora
    FROM login_attempts WHERE nome = p_nome AND success = false;
  RETURN cnt < 5 AND cnt_ora < 20;
END;
$function$;

-- 8) rinomina atomica di un collaboratore (solo amministratore)
CREATE OR REPLACE FUNCTION public.rinomina_collaboratore(p_token text, p_vecchio text, p_nuovo text, p_chat boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_n INT;
  v_tot JSONB := '{}'::jsonb;
  v_tab TEXT;
  v_col TEXT;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Rinomina riservata all amministratore';
  END IF;
  p_nuovo := btrim(COALESCE(p_nuovo, ''));
  IF p_nuovo = '' OR p_nuovo = p_vecchio THEN
    RAISE EXCEPTION 'Nome nuovo non valido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM collaboratori WHERE nome = p_vecchio) THEN
    RAISE EXCEPTION 'Collaboratore non trovato: %', p_vecchio;
  END IF;
  IF EXISTS (SELECT 1 FROM collaboratori WHERE lower(nome) = lower(p_nuovo) AND nome <> p_vecchio) THEN
    RAISE EXCEPTION 'Esiste gia un collaboratore con il nome %', p_nuovo;
  END IF;
  UPDATE collaboratori SET nome = p_nuovo WHERE nome = p_vecchio;
  UPDATE registrazioni SET nome = p_nuovo WHERE nome = p_vecchio;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_tot := v_tot || jsonb_build_object('registrazioni', v_n);
  FOREACH v_tab IN ARRAY ARRAY['moduli', 'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati', 'piano',
    'piano_vacanze', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_timbrature',
    'piano_ore_mese', 'collab_congedi_np']
  LOOP
    EXECUTE format('UPDATE %I SET collaboratore = $1 WHERE collaboratore = $2', v_tab) USING p_nuovo, p_vecchio;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_tot := v_tot || jsonb_build_object(v_tab, v_n); END IF;
  END LOOP;
  -- chat e note: legate al nome di accesso; si spostano solo se la persona non e anche un
  -- operatore del programma (lo decide chi chiama con p_chat)
  IF p_chat THEN
    FOR v_tab, v_col IN SELECT a, b FROM (VALUES ('chat_messages', 'da_operatore'), ('chat_messages', 'a_operatore'),
      ('chat_group_members', 'operatore'), ('chat_message_letti', 'operatore'), ('chat_message_hidden', 'operatore'),
      ('note_colleghi', 'da_operatore'), ('note_colleghi', 'a_operatore')) t(a, b)
    LOOP
      EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = $2', v_tab, v_col, v_col) USING p_nuovo, p_vecchio;
    END LOOP;
  END IF;
  RETURN json_build_object('success', true, 'righe', v_tot);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.rinomina_collaboratore(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rinomina_collaboratore(text, text, text, boolean) TO anon, authenticated, service_role;

-- 7) search_path fisso per le funzioni con privilegi dello schema public; i filtri del
--    canale sicuro si leggono sempre con standard_conforming_strings
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', f.firma);
  END LOOP;
END
$$;
ALTER FUNCTION public.secure_read(text, text, text, text, integer, integer) SET standard_conforming_strings = on;
ALTER FUNCTION public.secure_update(text, text, text, jsonb) SET standard_conforming_strings = on;
ALTER FUNCTION public.secure_delete(text, text, text) SET standard_conforming_strings = on;
-- le funzioni interne nuove o ricreate restano chiuse (come nella 20260895)
REVOKE EXECUTE ON FUNCTION public._check_rate_limit(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._controlla_permessi_scrittura(text, text, text, jsonb) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- 1 bis) la sessione vale solo se la persona e ancora un operatore (o e l amministratore):
-- un operatore tolto non usa piu nemmeno la sessione gia aperta
CREATE OR REPLACE FUNCTION public._validate_op_session(p_token text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
  SELECT s.operatore FROM operator_sessions s
  WHERE s.token = p_token AND s.expires_at > now()
    AND (s.is_admin OR EXISTS (SELECT 1 FROM operatori_auth o WHERE o.nome = s.operatore))
  LIMIT 1;
$function$;
REVOKE EXECUTE ON FUNCTION public._validate_op_session(text) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
