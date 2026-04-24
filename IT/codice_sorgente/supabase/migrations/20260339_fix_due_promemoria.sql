-- Fix: cast espliciti per evitare errore date <= text
CREATE OR REPLACE FUNCTION get_due_promemoria()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_now TIMESTAMPTZ := now();
  v_today TEXT := to_char(v_now, 'YYYY-MM-DD');
  v_hour TEXT := to_char(v_now, 'HH24') || ':00';
  v_tomorrow TEXT := to_char(v_now + interval '1 day', 'YYYY-MM-DD');
  v_in3days TEXT := to_char(v_now + interval '3 days', 'YYYY-MM-DD');
  v_in7days TEXT := to_char(v_now + interval '7 days', 'YYYY-MM-DD');
BEGIN
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO v_result
  FROM (
    SELECT p.id, p.titolo, p.descrizione, p.data_scadenza::text AS data_scadenza, p.assegnato_a, p.creato_da
    FROM promemoria p
    WHERE p.completata = false
      AND p.push_sent_at IS NULL
      AND (
        p.data_scadenza::text <= v_today
        OR (p.descrizione LIKE '%il giorno stesso alle ' || v_hour || '%'
            AND p.data_scadenza::text = v_today)
        OR (p.descrizione LIKE '%1 giorno/i prima alle ' || v_hour || '%'
            AND p.data_scadenza::text = v_tomorrow)
        OR (p.descrizione LIKE '%3 giorno/i prima alle ' || v_hour || '%'
            AND p.data_scadenza::text = v_in3days)
        OR (p.descrizione LIKE '%7 giorno/i prima alle ' || v_hour || '%'
            AND p.data_scadenza::text = v_in7days)
      )
  ) t;

  UPDATE promemoria SET push_sent_at = v_now
  WHERE completata = false
    AND push_sent_at IS NULL
    AND (
      data_scadenza::text <= v_today
      OR (descrizione LIKE '%alle ' || v_hour || '%'
          AND data_scadenza::text >= v_today
          AND data_scadenza::text <= v_in7days)
    );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
