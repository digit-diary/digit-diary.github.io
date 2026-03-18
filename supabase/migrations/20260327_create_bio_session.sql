-- Crea sessione per login biometrico (non richiede password)
-- Il biometrico è già stato verificato lato client tramite WebAuthn
CREATE OR REPLACE FUNCTION create_bio_session(p_nome TEXT)
RETURNS JSON AS $$
DECLARE
  v_session TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Verifica che l'operatore esista
  SELECT EXISTS(SELECT 1 FROM operatori_auth WHERE nome = p_nome) INTO v_exists;
  IF NOT v_exists THEN
    RETURN json_build_object('error', 'Operatore non trovato');
  END IF;

  v_session := _create_op_session(p_nome, false);
  RETURN json_build_object('session_token', v_session);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
