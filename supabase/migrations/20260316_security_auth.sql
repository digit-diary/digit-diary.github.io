-- ============================================================
-- SECURITY / AUTH — Diario Collaboratori
-- Funzioni di autenticazione e RLS ricostruite da
-- _archive/migrate_security.sql + _archive/migrate_security_v2.sql.
-- Delle funzioni v1 sono incluse solo quelle NON ridefinite in v2
-- (le versioni v1 con firma diversa creerebbero overload ambigui).
-- gen_random_bytes qualificato con schema extensions (pgcrypto).
-- ============================================================

CREATE OR REPLACE FUNCTION has_recovery_code()
RETURNS JSON AS $$
DECLARE
  code TEXT;
BEGIN
  SELECT valore INTO code FROM impostazioni WHERE chiave = 'recovery_code';
  RETURN json_build_object('exists', code IS NOT NULL AND code != '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_default_master_pwd(p_default_hash TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  RETURN json_build_object('is_default', stored IS NULL OR stored = p_default_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION list_operators()
RETURNS JSON AS $$
BEGIN
  RETURN (SELECT COALESCE(json_agg(json_build_object('nome', nome, 'ruolo', ruolo)), '[]'::json) FROM operatori_auth);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_deve_cambiare(p_nome TEXT)
RETURNS JSON AS $$
DECLARE
  flag BOOLEAN;
BEGIN
  SELECT deve_cambiare_pwd INTO flag FROM operatori_auth WHERE nome = p_nome;
  RETURN json_build_object('deve_cambiare_pwd', COALESCE(flag, false));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- BLOCCO ACCESSO DIRETTO a operatori_auth
-- ============================================================

-- Rimuovi tutte le policy esistenti
DROP POLICY IF EXISTS "anon_select" ON operatori_auth;
DROP POLICY IF EXISTS "anon_insert" ON operatori_auth;
DROP POLICY IF EXISTS "anon_update" ON operatori_auth;
DROP POLICY IF EXISTS "anon_delete" ON operatori_auth;
DROP POLICY IF EXISTS "anon_all" ON operatori_auth;
DROP POLICY IF EXISTS "allow_all" ON operatori_auth;
DROP POLICY IF EXISTS "operatori_select" ON operatori_auth;
DROP POLICY IF EXISTS "operatori_insert" ON operatori_auth;
DROP POLICY IF EXISTS "operatori_update" ON operatori_auth;
DROP POLICY IF EXISTS "operatori_delete" ON operatori_auth;

-- Assicurati che RLS sia abilitato
ALTER TABLE operatori_auth ENABLE ROW LEVEL SECURITY;

-- NESSUNA policy = nessun accesso diretto via REST API
-- Tutte le operazioni passano per le RPC functions (SECURITY DEFINER)

-- ============================================================
-- BLOCCO ACCESSO a password_hash e recovery_code in impostazioni
-- ============================================================

-- Rimuovi policy esistenti
DROP POLICY IF EXISTS "anon_select" ON impostazioni;
DROP POLICY IF EXISTS "anon_insert" ON impostazioni;
DROP POLICY IF EXISTS "anon_update" ON impostazioni;
DROP POLICY IF EXISTS "anon_all" ON impostazioni;
DROP POLICY IF EXISTS "allow_all" ON impostazioni;
DROP POLICY IF EXISTS "impostazioni_select" ON impostazioni;
DROP POLICY IF EXISTS "impostazioni_insert" ON impostazioni;
DROP POLICY IF EXISTS "impostazioni_update" ON impostazioni;

-- Abilita RLS
ALTER TABLE impostazioni ENABLE ROW LEVEL SECURITY;

-- SELECT: blocca password_hash e recovery_code
CREATE POLICY "safe_select" ON impostazioni
  FOR SELECT USING (chiave NOT IN ('password_hash', 'recovery_code'));

-- INSERT: blocca scrittura diretta di password_hash e recovery_code
CREATE POLICY "safe_insert" ON impostazioni
  FOR INSERT WITH CHECK (chiave NOT IN ('password_hash', 'recovery_code'));

-- UPDATE: blocca modifica diretta di password_hash e recovery_code
CREATE POLICY "safe_update" ON impostazioni
  FOR UPDATE USING (chiave NOT IN ('password_hash', 'recovery_code'))
  WITH CHECK (chiave NOT IN ('password_hash', 'recovery_code'));

-- DELETE: permetti (per pulizia impostazioni non sensibili)
CREATE POLICY "safe_delete" ON impostazioni
  FOR DELETE USING (chiave NOT IN ('password_hash', 'recovery_code'));

-- ============================================================


-- ============================================================
-- SECURITY V2 (integrale)
-- ============================================================

-- MIGRAZIONE SICUREZZA V2 - Diario Collaboratori
-- Eseguire su Supabase Dashboard > SQL Editor
-- PRIMA di aggiornare index.html

-- 1. Tabella tentativi login (rate limiting)
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT clock_timestamp()
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
-- Nessuna policy = nessun accesso diretto via REST
CREATE INDEX IF NOT EXISTS idx_login_attempts_nome_at ON login_attempts (nome, attempted_at DESC);

-- 2. Tabella sessioni admin
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  operatore TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
-- Nessuna policy = nessun accesso diretto via REST

-- 3. Colonna pwd_hash_v2 (PBKDF2) su operatori_auth + permetti NULL su pwd_hash
ALTER TABLE operatori_auth ADD COLUMN IF NOT EXISTS pwd_hash_v2 TEXT;
ALTER TABLE operatori_auth ALTER COLUMN pwd_hash DROP NOT NULL;

-- FUNZIONI HELPER (interne, usate dalle RPC)

-- Helper: controlla rate limit (max 5 fallimenti per minuto per nome)
CREATE OR REPLACE FUNCTION _check_rate_limit(p_nome TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  cnt INT;
BEGIN
  -- Pulizia vecchi tentativi (>1 ora)
  DELETE FROM login_attempts WHERE attempted_at < (clock_timestamp() - interval '1 hour');
  SELECT COUNT(*) INTO cnt FROM login_attempts
    WHERE nome = p_nome AND success = false
    AND attempted_at > (clock_timestamp() - interval '30 seconds');
  RETURN cnt < 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: registra tentativo (su successo, cancella fallimenti precedenti)
CREATE OR REPLACE FUNCTION _record_attempt(p_nome TEXT, p_success BOOLEAN)
RETURNS VOID AS $$
BEGIN
  INSERT INTO login_attempts (nome, success, attempted_at) VALUES (p_nome, p_success, clock_timestamp());
  IF p_success THEN DELETE FROM login_attempts WHERE nome = p_nome AND success = false; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: verifica sessione admin
CREATE OR REPLACE FUNCTION _verify_admin_session(p_token TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM admin_sessions WHERE token = p_token AND expires_at > now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC AGGIORNATE

-- 1. verify_login: + rate limiting + dual hash (PBKDF2/SHA-256) + auto-upgrade
CREATE OR REPLACE FUNCTION verify_login(p_nome TEXT, p_hash TEXT, p_legacy_hash TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Rate limit
  IF NOT _check_rate_limit(p_nome) THEN
    RETURN json_build_object('valid', false, 'found', true, 'locked', true);
  END IF;

  SELECT nome, pwd_hash, pwd_hash_v2, ruolo, deve_cambiare_pwd INTO rec
  FROM operatori_auth WHERE nome = p_nome;

  IF NOT FOUND THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('valid', false, 'found', false);
  END IF;

  -- Check v2 (PBKDF2) first
  IF rec.pwd_hash_v2 IS NOT NULL AND rec.pwd_hash_v2 = p_hash THEN
    PERFORM _record_attempt(p_nome, true);
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', rec.ruolo, 'deve_cambiare_pwd', rec.deve_cambiare_pwd);
  END IF;

  -- Fallback v1 (SHA-256) - auto-upgrade e cancella v1
  IF p_legacy_hash IS NOT NULL AND rec.pwd_hash IS NOT NULL AND rec.pwd_hash = p_legacy_hash THEN
    UPDATE operatori_auth SET pwd_hash_v2 = p_hash, pwd_hash = NULL WHERE nome = p_nome;
    PERFORM _record_attempt(p_nome, true);
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', rec.ruolo, 'deve_cambiare_pwd', rec.deve_cambiare_pwd, 'upgraded', true);
  END IF;

  -- Fallback: p_hash contro pwd_hash (client vecchio senza PBKDF2)
  IF rec.pwd_hash IS NOT NULL AND rec.pwd_hash = p_hash THEN
    PERFORM _record_attempt(p_nome, true);
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', rec.ruolo, 'deve_cambiare_pwd', rec.deve_cambiare_pwd);
  END IF;

  PERFORM _record_attempt(p_nome, false);
  RETURN json_build_object('valid', false, 'found', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. verify_master_pwd: + rate limiting + dual hash + session token
CREATE OR REPLACE FUNCTION verify_master_pwd(p_hash TEXT, p_legacy_hash TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
  new_token TEXT;
BEGIN
  IF NOT _check_rate_limit('__master__') THEN
    RETURN json_build_object('valid', false, 'locked', true);
  END IF;

  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';

  IF stored IS NULL AND stored_v2 IS NULL THEN
    PERFORM _record_attempt('__master__', false);
    RETURN json_build_object('valid', false);
  END IF;

  -- Check v2 (PBKDF2) first
  IF stored_v2 IS NOT NULL AND stored_v2 = p_hash THEN
    new_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO admin_sessions (token, operatore) VALUES (new_token, 'Admin');
    DELETE FROM admin_sessions WHERE expires_at < now();
    PERFORM _record_attempt('__master__', true);
    RETURN json_build_object('valid', true, 'session_token', new_token);
  END IF;

  -- Fallback v1 (SHA-256) - auto-upgrade e cancella v1
  IF p_legacy_hash IS NOT NULL AND stored IS NOT NULL AND stored = p_legacy_hash THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_hash)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_hash;
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
    new_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO admin_sessions (token, operatore) VALUES (new_token, 'Admin');
    DELETE FROM admin_sessions WHERE expires_at < now();
    PERFORM _record_attempt('__master__', true);
    RETURN json_build_object('valid', true, 'session_token', new_token, 'upgraded', true);
  END IF;

  -- Fallback: p_hash contro stored v1 (client vecchio senza PBKDF2)
  IF stored IS NOT NULL AND stored = p_hash THEN
    new_token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO admin_sessions (token, operatore) VALUES (new_token, 'Admin');
    DELETE FROM admin_sessions WHERE expires_at < now();
    PERFORM _record_attempt('__master__', true);
    RETURN json_build_object('valid', true, 'session_token', new_token);
  END IF;

  PERFORM _record_attempt('__master__', false);
  RETURN json_build_object('valid', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. change_master_pwd: + dual hash per old + token admin
CREATE OR REPLACE FUNCTION change_master_pwd(p_old_hash TEXT, p_new_hash TEXT, p_new_recovery TEXT, p_old_legacy_hash TEXT DEFAULT NULL, p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
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

  -- Verifica vecchia password (v2 o v1)
  IF stored_v2 IS NOT NULL AND stored_v2 = p_old_hash THEN valid := true;
  ELSIF p_old_legacy_hash IS NOT NULL AND stored IS NOT NULL AND stored = p_old_legacy_hash THEN valid := true;
  ELSIF stored IS NOT NULL AND stored = p_old_hash THEN valid := true;
  END IF;

  IF NOT valid THEN
    PERFORM _record_attempt('__master_change__', false);
    RETURN json_build_object('success', false);
  END IF;

  -- Salva nuovo hash v2
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_new_hash)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  -- Cancella vecchio v1
  UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  -- Nuovo recovery code
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;

  PERFORM _record_attempt('__master_change__', true);
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. setup_master_pwd: salva sia v1 che v2 (per backward compat)
CREATE OR REPLACE FUNCTION setup_master_pwd(p_default_hash TEXT, p_new_hash TEXT, p_new_recovery TEXT, p_new_hash_v2 TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  IF stored IS NOT NULL AND stored != p_default_hash THEN
    RETURN json_build_object('success', false);
  END IF;
  -- Salva v2 se fornito
  IF p_new_hash_v2 IS NOT NULL THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_new_hash_v2)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash_v2;
    -- Non serve salvare v1 se abbiamo v2
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  ELSE
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. recovery_master_pwd: + rate limiting + salva v2
CREATE OR REPLACE FUNCTION recovery_master_pwd(p_code TEXT, p_new_hash TEXT, p_new_recovery TEXT, p_new_hash_v2 TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  stored_code TEXT;
BEGIN
  IF NOT _check_rate_limit('__recovery__') THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;

  SELECT valore INTO stored_code FROM impostazioni WHERE chiave = 'recovery_code';
  IF stored_code IS NULL OR stored_code != p_code THEN
    PERFORM _record_attempt('__recovery__', false);
    RETURN json_build_object('success', false);
  END IF;

  IF p_new_hash_v2 IS NOT NULL THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_new_hash_v2)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash_v2;
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  ELSE
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;

  PERFORM _record_attempt('__recovery__', true);
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. change_op_pwd: + rate limiting + dual hash per old + salva v2
CREATE OR REPLACE FUNCTION change_op_pwd(p_nome TEXT, p_old_hash TEXT, p_new_hash TEXT, p_old_legacy_hash TEXT DEFAULT NULL)
RETURNS JSON AS $$
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
  PERFORM _record_attempt('__op_change_' || p_nome, true);
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. force_change_pwd: richiede token admin OPPURE deve_cambiare_pwd=true (primo accesso)
CREATE OR REPLACE FUNCTION force_change_pwd(p_nome TEXT, p_new_hash TEXT, p_deve_cambiare BOOLEAN, p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  should_change BOOLEAN;
BEGIN
  IF p_token IS NOT NULL AND _verify_admin_session(p_token) THEN
    -- Admin autorizzato: puo cambiare per chiunque
    UPDATE operatori_auth SET pwd_hash_v2 = p_new_hash, pwd_hash = NULL, deve_cambiare_pwd = p_deve_cambiare WHERE nome = p_nome;
  ELSE
    -- Senza token: solo se deve_cambiare_pwd=true E p_deve_cambiare=false
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. add_operator: richiede token admin
CREATE OR REPLACE FUNCTION add_operator(p_nome TEXT, p_hash TEXT, p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  INSERT INTO operatori_auth (nome, pwd_hash_v2, deve_cambiare_pwd) VALUES (p_nome, p_hash, true);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Operatore esistente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. remove_operator: richiede token admin
CREATE OR REPLACE FUNCTION remove_operator(p_nome TEXT, p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  DELETE FROM operatori_auth WHERE nome = p_nome;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Validazione sessione admin
CREATE OR REPLACE FUNCTION validate_admin_session(p_token TEXT)
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object('valid', _verify_admin_session(p_token));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Invalidazione sessione admin (logout)
CREATE OR REPLACE FUNCTION invalidate_admin_session(p_token TEXT)
RETURNS JSON AS $$
BEGIN
  DELETE FROM admin_sessions WHERE token = p_token;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: bloccare groq_api_key e password_hash_v2

-- Aggiorna policy SELECT su impostazioni
DROP POLICY IF EXISTS "safe_select" ON impostazioni;
CREATE POLICY "safe_select" ON impostazioni
  FOR SELECT USING (chiave NOT IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key'));

-- Aggiorna policy INSERT su impostazioni
DROP POLICY IF EXISTS "safe_insert" ON impostazioni;
CREATE POLICY "safe_insert" ON impostazioni
  FOR INSERT WITH CHECK (chiave NOT IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key'));

-- Aggiorna policy UPDATE su impostazioni
DROP POLICY IF EXISTS "safe_update" ON impostazioni;
CREATE POLICY "safe_update" ON impostazioni
  FOR UPDATE USING (chiave NOT IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key'))
  WITH CHECK (chiave NOT IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key'));

-- Aggiorna policy DELETE su impostazioni
DROP POLICY IF EXISTS "safe_delete" ON impostazioni;
CREATE POLICY "safe_delete" ON impostazioni
  FOR DELETE USING (chiave NOT IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key'));

-- RPC per Groq API key (accesso solo via RPC SECURITY DEFINER)

CREATE OR REPLACE FUNCTION get_groq_key(p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  k TEXT;
BEGIN
  -- Chiunque autenticato (admin o operatore) puo leggere la chiave
  -- perche serve per le funzionalita AI
  SELECT valore INTO k FROM impostazioni WHERE chiave = 'groq_api_key';
  RETURN json_build_object('key', k);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_groq_key(p_key TEXT, p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
BEGIN
  -- Solo admin puo impostare la chiave
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('groq_api_key', p_key)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_key;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FINE MIGRAZIONE V2
