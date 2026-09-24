-- ============================================================
-- SESSIONI E ACCESSO BIOMETRICO SICURI
-- 1) Piu' sessioni per operatore: prima ogni rinnovo cancellava le sessioni
--    dell'operatore su tutti i dispositivi (il telefono buttava fuori il PC).
-- 2) Rinnovo con il token esistente (renew_op_session): nessun rinnovo
--    "a nome", che chiunque poteva chiamare con la sola chiave pubblica.
-- 3) Accesso biometrico verificato dal server: il dispositivo conserva un
--    segreto casuale creato all'attivazione, il server ne conserva l'impronta.
--    create_bio_session(nome, impronta) rilascia la sessione solo se coincide.
--    La vecchia create_bio_session(nome) viene eliminata.
-- 4) Impostazioni di configurazione (visibilita', profili, settori, punti,
--    soglie...) modificabili solo da una sessione amministratore.
-- 5) Cancellazione del registro attivita' solo da amministratore.
-- ============================================================

-- 1) sessioni multiple: si tolgono solo quelle scadute e si tiene un tetto
CREATE OR REPLACE FUNCTION _create_op_session(p_operatore TEXT, p_is_admin BOOLEAN DEFAULT false)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  DELETE FROM operator_sessions WHERE operatore = p_operatore AND expires_at < now() - interval '7 days';
  -- massimo 8 sessioni vive per operatore: oltre, via la piu' vecchia
  DELETE FROM operator_sessions WHERE token IN (
    SELECT token FROM operator_sessions WHERE operatore = p_operatore
    ORDER BY created_at DESC OFFSET 7
  );
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO operator_sessions (token, operatore, is_admin, expires_at)
  VALUES (v_token, p_operatore, p_is_admin, now() + interval '24 hours');
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) rinnovo: serve il token di una sessione esistente (scaduta da meno di 7 giorni)
CREATE OR REPLACE FUNCTION renew_op_session(p_token TEXT)
RETURNS JSON AS $$
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
  v_new := _create_op_session(v_op, COALESCE(v_admin, false));
  DELETE FROM operator_sessions WHERE token = p_token;
  RETURN json_build_object('session_token', v_new, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) dispositivi biometrici
CREATE TABLE IF NOT EXISTS bio_dispositivi (
  id BIGSERIAL PRIMARY KEY,
  operatore TEXT NOT NULL,
  impronta TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  nome_dispositivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  ultimo_uso TIMESTAMPTZ,
  UNIQUE (operatore, impronta)
);
ALTER TABLE bio_dispositivi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON bio_dispositivi;
CREATE POLICY deny_all_anon ON bio_dispositivi FOR ALL TO anon USING (false) WITH CHECK (false);

-- registrazione: solo da una sessione valida (l'operatore e' gia' dentro)
CREATE OR REPLACE FUNCTION set_bio_device(p_token TEXT, p_impronta TEXT, p_nome_dispositivo TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_impronta IS NULL OR length(p_impronta) < 32 THEN
    RAISE EXCEPTION 'Impronta non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  INSERT INTO bio_dispositivi (operatore, impronta, is_admin, nome_dispositivo)
  VALUES (v_op, p_impronta, COALESCE(v_admin, false), left(p_nome_dispositivo, 80))
  ON CONFLICT (operatore, impronta) DO UPDATE SET nome_dispositivo = EXCLUDED.nome_dispositivo, is_admin = EXCLUDED.is_admin;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION remove_bio_device(p_token TEXT, p_impronta TEXT)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  DELETE FROM bio_dispositivi WHERE operatore = v_op AND impronta = p_impronta;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- accesso: nome + impronta del dispositivo, con lo stesso limite tentativi del login
DROP FUNCTION IF EXISTS create_bio_session(TEXT);
CREATE OR REPLACE FUNCTION create_bio_session(p_nome TEXT, p_impronta TEXT)
RETURNS JSON AS $$
DECLARE
  v_admin BOOLEAN;
  v_session TEXT;
BEGIN
  IF NOT _check_rate_limit(p_nome) THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT is_admin INTO v_admin FROM bio_dispositivi
    WHERE operatore = p_nome AND impronta = p_impronta LIMIT 1;
  IF v_admin IS NULL THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('error', 'Dispositivo non riconosciuto');
  END IF;
  PERFORM _record_attempt(p_nome, true);
  UPDATE bio_dispositivi SET ultimo_uso = now() WHERE operatore = p_nome AND impronta = p_impronta;
  v_session := _create_op_session(p_nome, v_admin);
  RETURN json_build_object('session_token', v_session, 'is_admin', v_admin);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) impostazioni di configurazione: solo amministratore
CREATE OR REPLACE FUNCTION upsert_impostazione(p_token TEXT, p_chiave TEXT, p_valore TEXT)
RETURNS JSON AS $$
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
    'visibilita', 'profili_operatori', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'moduli_responsabili',
    'conservazione_anni', 'conservazione_giorni_grazia', 'backup_auto_giorni',
    'tipi_personalizzati', 'tipi_nascosti', 'tipi_ordine', 'tipi_rinominati', 'colori_override',
    'campi_label_override', 'campi_nascosti', 'campi_ordine', 'campi_rapporto_extra', 'campi_rapporto_reparti',
    'buono_valori', 'inventario_categorie_extra',
    'piano_cd_config', 'piano_pause_cfg', 'piano_funzioni', 'piano_ore_settimanali', 'piano_max_cambi_mese',
    'piano_giorni_weekend', 'piano_giorni_formazione', 'piano_corsi_lista', 'piano_corsi_orari', 'piano_competenze_gruppi'
  ) THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) cancellare il registro attivita' (e le tabelle di autenticazione) solo da amministratore
DO $$
DECLARE d TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'secure_delete' LIMIT 1;
  IF d IS NOT NULL AND position('registro riservato' IN d) = 0 THEN
    EXECUTE replace(d,
      E'RAISE EXCEPTION ''Sessione non valida'';\n  END IF;',
      E'RAISE EXCEPTION ''Sessione non valida'';\n  END IF;\n  IF p_table IN (''log_attivita'') AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN\n    RAISE EXCEPTION ''registro riservato all amministratore'';\n  END IF;');
  END IF;
END $$;
