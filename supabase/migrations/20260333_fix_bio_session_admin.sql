-- Fix: create_bio_session deve preservare is_admin
-- Se il nome è "Admin" o se la sessione precedente era admin, mantieni is_admin=true
CREATE OR REPLACE FUNCTION create_bio_session(p_nome TEXT)
RETURNS JSON AS $$
DECLARE
  v_session TEXT;
  v_exists BOOLEAN;
  v_is_admin BOOLEAN := false;
BEGIN
  -- Verifica che l'operatore esista
  SELECT EXISTS(SELECT 1 FROM operatori_auth WHERE nome = p_nome) INTO v_exists;
  IF NOT v_exists THEN
    -- Potrebbe essere "Admin" (login master, non in operatori_auth)
    IF p_nome = 'Admin' THEN
      v_is_admin := true;
    ELSE
      RETURN json_build_object('error', 'Operatore non trovato');
    END IF;
  END IF;

  -- Controlla se aveva una sessione admin attiva
  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM operator_sessions
      WHERE operatore = p_nome AND is_admin = true AND expires_at > now()
    ) INTO v_is_admin;
  END IF;

  v_session := _create_op_session(p_nome, v_is_admin);
  RETURN json_build_object('session_token', v_session);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
