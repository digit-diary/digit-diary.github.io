-- RPC per upsert sicuro su impostazioni (INSERT ON CONFLICT UPDATE)
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

  -- Chiavi sensibili: solo admin
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF p_chiave IN ('password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key') THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Operazione riservata admin';
    END IF;
  END IF;

  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
