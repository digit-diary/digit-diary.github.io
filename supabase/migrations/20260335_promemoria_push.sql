-- Aggiunge campo per tracciare se la push è stata inviata
ALTER TABLE promemoria ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ DEFAULT NULL;

-- RPC: trova promemoria da notificare (chiamata dal cron ogni ora)
CREATE OR REPLACE FUNCTION get_due_promemoria()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_now TIMESTAMPTZ := now();
  v_today TEXT := to_char(v_now, 'YYYY-MM-DD');
  v_hour TEXT := to_char(v_now, 'HH24') || ':00';
BEGIN
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  INTO v_result
  FROM (
    SELECT p.id, p.titolo, p.descrizione, p.data_scadenza, p.assegnato_a, p.creato_da
    FROM promemoria p
    WHERE p.completata = false
      AND p.push_sent_at IS NULL
      AND (
        -- Scadenza oggi o passata (scaduto)
        p.data_scadenza <= v_today
        OR
        -- Reminder: parse "X giorno/i prima alle HH:00" dalla descrizione
        (p.descrizione LIKE '%il giorno stesso alle ' || v_hour || '%'
         AND p.data_scadenza = v_today)
        OR
        (p.descrizione LIKE '%1 giorno/i prima alle ' || v_hour || '%'
         AND p.data_scadenza = (v_today::date + interval '1 day')::text)
        OR
        (p.descrizione LIKE '%3 giorno/i prima alle ' || v_hour || '%'
         AND p.data_scadenza = (v_today::date + interval '3 days')::text)
        OR
        (p.descrizione LIKE '%7 giorno/i prima alle ' || v_hour || '%'
         AND p.data_scadenza = (v_today::date + interval '7 days')::text)
      )
  ) t;

  -- Marca come inviati
  UPDATE promemoria SET push_sent_at = v_now
  WHERE completata = false
    AND push_sent_at IS NULL
    AND id IN (
      SELECT p2.id FROM promemoria p2
      WHERE p2.completata = false AND p2.push_sent_at IS NULL
        AND (p2.data_scadenza <= v_today
          OR (p2.descrizione LIKE '%alle ' || v_hour || '%'
              AND p2.data_scadenza >= v_today
              AND p2.data_scadenza <= (v_today::date + interval '7 days')::text))
    );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
