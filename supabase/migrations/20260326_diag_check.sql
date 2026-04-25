-- Funzione diagnostica temporanea per verificare stato DB
CREATE OR REPLACE FUNCTION _diag_check()
RETURNS JSON AS $$
DECLARE
  v_reg_count INT;
  v_maison_count INT;
  v_imp_count INT;
  v_sessions INT;
  v_op_reparto TEXT;
  v_visibilita TEXT;
BEGIN
  SELECT count(*) INTO v_reg_count FROM registrazioni;
  SELECT count(*) INTO v_maison_count FROM costi_maison;
  SELECT count(*) INTO v_imp_count FROM impostazioni;
  SELECT count(*) INTO v_sessions FROM operator_sessions WHERE expires_at > now();
  SELECT valore INTO v_op_reparto FROM impostazioni WHERE chiave = 'operatori_reparto';
  SELECT valore INTO v_visibilita FROM impostazioni WHERE chiave = 'visibilita';
  RETURN json_build_object(
    'registrazioni', v_reg_count,
    'costi_maison', v_maison_count,
    'impostazioni_count', v_imp_count,
    'active_sessions', v_sessions,
    'operatori_reparto', v_op_reparto,
    'visibilita', v_visibilita
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
