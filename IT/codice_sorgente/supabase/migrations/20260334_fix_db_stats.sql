-- Fix: relname ambiguo nella query get_db_stats
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
    'tables', (
      SELECT json_agg(row_to_json(t) ORDER BY t.bytes DESC)
      FROM (
        SELECT
          c.relname AS nome,
          COALESCE(s.n_live_tup, 0) AS righe,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS dimensione,
          pg_total_relation_size(c.oid) AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname IN (
            'registrazioni','costi_maison','moduli','note_colleghi',
            'consegne_turno','promemoria','spese_extra','log_attivita',
            'operatori_auth','operator_sessions','impostazioni',
            'maison_budget','regali_maison','note_clienti',
            'rapporti_giornalieri','collaboratori','scadenze',
            'note_fissate','push_subscriptions','login_attempts'
          )
      ) t
    ),
    'sessioni_attive', (SELECT count(*) FROM operator_sessions WHERE expires_at > now())
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
