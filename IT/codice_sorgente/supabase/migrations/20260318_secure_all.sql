-- ============================================================
-- MIGRAZIONE: SICUREZZA TOTALE - Token sessione per tutti
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabella sessioni operatore (estende admin_sessions a tutti)
CREATE TABLE IF NOT EXISTS operator_sessions (
  token TEXT PRIMARY KEY DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  operatore TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
-- Nessuna policy = nessun accesso diretto via REST API

CREATE INDEX IF NOT EXISTS idx_op_sessions_operatore ON operator_sessions (operatore);
CREATE INDEX IF NOT EXISTS idx_op_sessions_expires ON operator_sessions (expires_at);

-- 2. Helper: valida sessione operatore (restituisce nome o NULL)
CREATE OR REPLACE FUNCTION _validate_op_session(p_token TEXT)
RETURNS TEXT AS $$
  SELECT operatore FROM operator_sessions
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Helper: crea sessione operatore (chiamata dopo login valido)
CREATE OR REPLACE FUNCTION _create_op_session(p_operatore TEXT, p_is_admin BOOLEAN DEFAULT false)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Rimuovi sessioni vecchie di questo operatore
  DELETE FROM operator_sessions WHERE operatore = p_operatore;
  -- Crea nuova sessione
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO operator_sessions (token, operatore, is_admin, expires_at)
  VALUES (v_token, p_operatore, p_is_admin, now() + interval '24 hours');
  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Aggiorna verify_login per restituire anche session_token
CREATE OR REPLACE FUNCTION verify_login(p_nome TEXT, p_hash TEXT, p_legacy_hash TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_stored_v2 TEXT;
  v_stored_v1 TEXT;
  v_deve_cambiare BOOLEAN;
  v_ruolo TEXT;
  v_session TEXT;
BEGIN
  IF NOT _check_rate_limit(p_nome) THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT pwd_hash_v2, pwd_hash, deve_cambiare_pwd, ruolo
    INTO v_stored_v2, v_stored_v1, v_deve_cambiare, v_ruolo
    FROM operatori_auth WHERE nome = p_nome;
  IF NOT FOUND THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('valid', false, 'found', false);
  END IF;
  -- Check v2 hash first, then legacy
  IF v_stored_v2 IS NOT NULL AND v_stored_v2 = p_hash THEN
    PERFORM _record_attempt(p_nome, true);
    v_session := _create_op_session(p_nome, false);
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', v_ruolo,
      'deve_cambiare_pwd', COALESCE(v_deve_cambiare, false),
      'session_token', v_session);
  END IF;
  IF v_stored_v1 IS NOT NULL AND p_legacy_hash IS NOT NULL AND v_stored_v1 = p_legacy_hash THEN
    -- Auto-upgrade to v2
    UPDATE operatori_auth SET pwd_hash_v2 = p_hash WHERE nome = p_nome;
    PERFORM _record_attempt(p_nome, true);
    v_session := _create_op_session(p_nome, false);
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', v_ruolo,
      'deve_cambiare_pwd', COALESCE(v_deve_cambiare, false),
      'session_token', v_session, 'upgraded', true);
  END IF;
  PERFORM _record_attempt(p_nome, false);
  RETURN json_build_object('valid', false, 'found', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Aggiorna verify_master_pwd per usare operator_sessions
CREATE OR REPLACE FUNCTION verify_master_pwd(p_hash TEXT, p_legacy_hash TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_stored_v2 TEXT;
  v_stored TEXT;
  v_token TEXT;
BEGIN
  IF NOT _check_rate_limit('__master__') THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT valore INTO v_stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  SELECT valore INTO v_stored FROM impostazioni WHERE chiave = 'password_hash';
  IF v_stored IS NULL AND v_stored_v2 IS NULL THEN
    RETURN json_build_object('valid', false);
  END IF;
  IF v_stored_v2 IS NOT NULL AND v_stored_v2 = p_hash THEN
    PERFORM _record_attempt('__master__', true);
    v_token := _create_op_session('Admin', true);
    -- Mantieni anche admin_sessions per compatibilità
    DELETE FROM admin_sessions WHERE operatore = '__master__';
    INSERT INTO admin_sessions (token, operatore, expires_at) VALUES (v_token, '__master__', now() + interval '24 hours');
    RETURN json_build_object('valid', true, 'session_token', v_token);
  END IF;
  IF v_stored IS NOT NULL AND p_legacy_hash IS NOT NULL AND v_stored = p_legacy_hash THEN
    IF p_hash IS NOT NULL THEN
      INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_hash)
        ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
    END IF;
    PERFORM _record_attempt('__master__', true);
    v_token := _create_op_session('Admin', true);
    DELETE FROM admin_sessions WHERE operatore = '__master__';
    INSERT INTO admin_sessions (token, operatore, expires_at) VALUES (v_token, '__master__', now() + interval '24 hours');
    RETURN json_build_object('valid', true, 'session_token', v_token);
  END IF;
  PERFORM _record_attempt('__master__', false);
  RETURN json_build_object('valid', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC SICURE PER LETTURA DATI
-- Ogni funzione valida il token prima di restituire dati.
-- SECURITY DEFINER bypassa RLS, quindi le letture funzionano.

CREATE OR REPLACE FUNCTION secure_read(p_token TEXT, p_table TEXT, p_filter TEXT DEFAULT '', p_order TEXT DEFAULT '', p_limit INT DEFAULT 5000)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_result JSON;
  v_query TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  -- Whitelist di tabelle consentite (previene SQL injection)
  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  -- Costruisci query con parametri sicuri
  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || quote_ident(p_table);

  -- Filtro speciale per note_colleghi: solo le proprie
  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  -- Filtro per impostazioni: blocca campi sensibili
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
    IF p_filter != '' THEN
      v_query := v_query || ' AND ' || p_filter;
    END IF;
  ELSIF p_filter != '' THEN
    v_query := v_query || ' WHERE ' || p_filter;
  END IF;

  IF p_order != '' THEN
    v_query := v_query || ' ORDER BY ' || p_order;
  END IF;

  v_query := v_query || ' LIMIT ' || p_limit || ') t';

  EXECUTE v_query INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC SICURA PER SCRITTURA (INSERT)
CREATE OR REPLACE FUNCTION secure_insert(p_token TEXT, p_table TEXT, p_data JSONB)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
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

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  -- Costruisci INSERT da JSONB
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC SICURA PER UPDATE
CREATE OR REPLACE FUNCTION secure_update(p_token TEXT, p_table TEXT, p_filter TEXT, p_data JSONB)
RETURNS VOID AS $$
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

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions'
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC SICURA PER DELETE
CREATE OR REPLACE FUNCTION secure_delete(p_token TEXT, p_table TEXT, p_filter TEXT)
RETURNS VOID AS $$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'push_subscriptions'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE ' || p_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Invalidate operator session (logout)
CREATE OR REPLACE FUNCTION invalidate_op_session(p_token TEXT)
RETURNS JSON AS $$
BEGIN
  DELETE FROM operator_sessions WHERE token = p_token;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Validate operator session
CREATE OR REPLACE FUNCTION validate_op_session(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
BEGIN
  SELECT operatore, is_admin INTO v_op, v_admin
  FROM operator_sessions WHERE token = p_token AND expires_at > now();
  IF v_op IS NULL THEN
    RETURN json_build_object('valid', false);
  END IF;
  RETURN json_build_object('valid', true, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 12. Pulizia automatica sessioni scadute e log vecchi
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS JSON AS $$
DECLARE
  v_sessions INT;
  v_logs INT;
BEGIN
  DELETE FROM operator_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM admin_sessions WHERE expires_at < now();

  DELETE FROM log_attivita WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  RETURN json_build_object('sessions_cleaned', v_sessions, 'logs_cleaned', v_logs);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. RLS SU TUTTE LE TABELLE SENSIBILI
-- Blocca accesso diretto via REST con chiave anon.
-- Tutte le letture/scritture passano da secure_read/insert/update/delete (SECURITY DEFINER).

-- NOTA: Eseguire SOLO dopo aver deployato il nuovo index.html!
-- Altrimenti l'app smetterà di funzionare.
-- Per sicurezza, queste policy sono commentate.
-- Decommentare e eseguire DOPO aver verificato che il nuovo codice funziona.

/*
-- registrazioni
ALTER TABLE registrazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_select ON registrazioni;
DROP POLICY IF EXISTS anon_insert ON registrazioni;
DROP POLICY IF EXISTS anon_update ON registrazioni;
DROP POLICY IF EXISTS anon_delete ON registrazioni;
CREATE POLICY "deny_all_anon" ON registrazioni FOR ALL TO anon USING (false) WITH CHECK (false);

-- moduli
ALTER TABLE moduli ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON moduli FOR ALL TO anon USING (false) WITH CHECK (false);

-- log_attivita
ALTER TABLE log_attivita ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON log_attivita FOR ALL TO anon USING (false) WITH CHECK (false);

-- costi_maison
ALTER TABLE costi_maison ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON costi_maison FOR ALL TO anon USING (false) WITH CHECK (false);

-- maison_budget
ALTER TABLE maison_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON maison_budget FOR ALL TO anon USING (false) WITH CHECK (false);

-- promemoria
ALTER TABLE promemoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON promemoria FOR ALL TO anon USING (false) WITH CHECK (false);

-- consegne_turno
ALTER TABLE consegne_turno ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON consegne_turno FOR ALL TO anon USING (false) WITH CHECK (false);

-- spese_extra
ALTER TABLE spese_extra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON spese_extra FOR ALL TO anon USING (false) WITH CHECK (false);

-- regali_maison
ALTER TABLE regali_maison ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON regali_maison FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_clienti
ALTER TABLE note_clienti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON note_clienti FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_fissate
ALTER TABLE note_fissate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON note_fissate FOR ALL TO anon USING (false) WITH CHECK (false);

-- scadenze
ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON scadenze FOR ALL TO anon USING (false) WITH CHECK (false);

-- collaboratori
ALTER TABLE collaboratori ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON collaboratori FOR ALL TO anon USING (false) WITH CHECK (false);

-- rapporti_giornalieri
ALTER TABLE rapporti_giornalieri ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON rapporti_giornalieri FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_colleghi (già ha RLS da migrate_realtime_encryption.sql, aggiorna policy)
DROP POLICY IF EXISTS "note_insert_only" ON note_colleghi;
DROP POLICY IF EXISTS "note_update_own" ON note_colleghi;
DROP POLICY IF EXISTS "note_delete_own" ON note_colleghi;
DROP POLICY IF EXISTS "note_select_via_rpc" ON note_colleghi;
CREATE POLICY "deny_all_anon" ON note_colleghi FOR ALL TO anon USING (false) WITH CHECK (false);
*/

-- NOTA IMPORTANTE:
-- 1. Esegui questo SQL su Supabase
-- 2. Deploya il nuovo index.html
-- 3. Verifica che tutto funzioni
-- 4. Poi torna qui e esegui la sezione RLS (decommentata)
-- 5. Verifica di nuovo
