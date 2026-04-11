-- ============================================================
-- MIGRAZIONE SICUREZZA - Diario Collaboratori
-- Eseguire su Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. RPC: Verifica login operatore (pwd_hash mai inviato al client)
CREATE OR REPLACE FUNCTION verify_login(p_nome TEXT, p_hash TEXT)
RETURNS JSON AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT nome, pwd_hash, ruolo, deve_cambiare_pwd INTO rec
  FROM operatori_auth WHERE nome = p_nome;
  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'found', false);
  END IF;
  IF rec.pwd_hash = p_hash THEN
    RETURN json_build_object('valid', true, 'found', true, 'ruolo', rec.ruolo, 'deve_cambiare_pwd', rec.deve_cambiare_pwd);
  ELSE
    RETURN json_build_object('valid', false, 'found', true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC: Verifica password master
CREATE OR REPLACE FUNCTION verify_master_pwd(p_hash TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  IF stored IS NULL THEN
    RETURN json_build_object('valid', false);
  END IF;
  RETURN json_build_object('valid', stored = p_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Cambia password master (verifica vecchia server-side)
CREATE OR REPLACE FUNCTION change_master_pwd(p_old_hash TEXT, p_new_hash TEXT, p_new_recovery TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  IF stored IS NULL OR stored != p_old_hash THEN
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Setup primo password master (solo se ancora default)
CREATE OR REPLACE FUNCTION setup_master_pwd(p_default_hash TEXT, p_new_hash TEXT, p_new_recovery TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  IF stored IS NOT NULL AND stored != p_default_hash THEN
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Recupero password con codice
CREATE OR REPLACE FUNCTION recovery_master_pwd(p_code TEXT, p_new_hash TEXT, p_new_recovery TEXT)
RETURNS JSON AS $$
DECLARE
  stored_code TEXT;
BEGIN
  SELECT valore INTO stored_code FROM impostazioni WHERE chiave = 'recovery_code';
  IF stored_code IS NULL OR stored_code != p_code THEN
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Controlla se recovery_code esiste
CREATE OR REPLACE FUNCTION has_recovery_code()
RETURNS JSON AS $$
DECLARE
  code TEXT;
BEGIN
  SELECT valore INTO code FROM impostazioni WHERE chiave = 'recovery_code';
  RETURN json_build_object('exists', code IS NOT NULL AND code != '');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Controlla se master pwd e ancora default
CREATE OR REPLACE FUNCTION is_default_master_pwd(p_default_hash TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  RETURN json_build_object('is_default', stored IS NULL OR stored = p_default_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: Cambia password operatore (verifica vecchia server-side)
CREATE OR REPLACE FUNCTION change_op_pwd(p_nome TEXT, p_old_hash TEXT, p_new_hash TEXT)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
BEGIN
  SELECT pwd_hash INTO stored FROM operatori_auth WHERE nome = p_nome;
  IF stored IS NULL OR stored != p_old_hash THEN
    RETURN json_build_object('success', false);
  END IF;
  UPDATE operatori_auth SET pwd_hash = p_new_hash WHERE nome = p_nome;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: Forza cambio password (admin, no verifica vecchia)
CREATE OR REPLACE FUNCTION force_change_pwd(p_nome TEXT, p_new_hash TEXT, p_deve_cambiare BOOLEAN)
RETURNS JSON AS $$
BEGIN
  UPDATE operatori_auth SET pwd_hash = p_new_hash, deve_cambiare_pwd = p_deve_cambiare WHERE nome = p_nome;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false);
  END IF;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: Aggiungi operatore
CREATE OR REPLACE FUNCTION add_operator(p_nome TEXT, p_hash TEXT)
RETURNS JSON AS $$
BEGIN
  INSERT INTO operatori_auth (nome, pwd_hash, deve_cambiare_pwd) VALUES (p_nome, p_hash, true);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Operatore esistente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC: Rimuovi operatore
CREATE OR REPLACE FUNCTION remove_operator(p_nome TEXT)
RETURNS JSON AS $$
BEGIN
  DELETE FROM operatori_auth WHERE nome = p_nome;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. RPC: Lista operatori (solo nome e ruolo, NO pwd_hash)
CREATE OR REPLACE FUNCTION list_operators()
RETURNS JSON AS $$
BEGIN
  RETURN (SELECT COALESCE(json_agg(json_build_object('nome', nome, 'ruolo', ruolo)), '[]'::json) FROM operatori_auth);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. RPC: Controlla deve_cambiare_pwd
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
-- FINE MIGRAZIONE
-- ============================================================
