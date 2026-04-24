-- RPC per mostrare dimensione database e conteggi tabelle (solo admin)
CREATE OR REPLACE FUNCTION get_db_stats(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_size TEXT;
  v_result JSON;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF NOT COALESCE(v_admin, false) THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;

  SELECT pg_size_pretty(pg_database_size(current_database())) INTO v_size;

  SELECT json_build_object(
    'db_size', v_size,
    'registrazioni', (SELECT count(*) FROM registrazioni),
    'costi_maison', (SELECT count(*) FROM costi_maison),
    'moduli', (SELECT count(*) FROM moduli),
    'note_colleghi', (SELECT count(*) FROM note_colleghi),
    'consegne', (SELECT count(*) FROM consegne_turno),
    'promemoria', (SELECT count(*) FROM promemoria),
    'spese_extra', (SELECT count(*) FROM spese_extra),
    'log_attivita', (SELECT count(*) FROM log_attivita),
    'operatori', (SELECT count(*) FROM operatori_auth),
    'sessioni_attive', (SELECT count(*) FROM operator_sessions WHERE expires_at > now())
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
