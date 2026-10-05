-- ============================================================
-- PROMEMORIA: notifiche push all ora giusta (controllo completo 05/10/2026)
-- 1) Ora e giorno si calcolavano nel fuso del database (sul cloud UTC): un
--    promemoria "alle 08:00" partiva alle 09:00 o alle 10:00 svizzere, e fra
--    mezzanotte e le 02:00 il "giorno stesso" era ancora il giorno prima. Ora si
--    usa sempre l ora di Lugano (Europe/Zurich).
-- 2) Si segnavano come inviati anche promemoria NON restituiti: un "1 giorno prima
--    alle 08:00" con scadenza fra 5 giorni veniva marcato alle 08:00 di oggi e poi
--    non partiva piu. Ora si segnano solo quelli restituiti (stessi id).
-- 3) Nuova ora 00:00 (mezzanotte) nel programma: funziona come le altre.
-- I diritti restano quelli della migrazione 20260895 (solo service_role).
-- ============================================================
CREATE OR REPLACE FUNCTION get_due_promemoria()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_ids BIGINT[];
  v_loc TIMESTAMP := now() AT TIME ZONE 'Europe/Zurich';
  v_today TEXT := to_char(v_loc, 'YYYY-MM-DD');
  v_hour TEXT := to_char(v_loc, 'HH24') || ':00';
  v_tomorrow TEXT := to_char(v_loc + interval '1 day', 'YYYY-MM-DD');
  v_in3days TEXT := to_char(v_loc + interval '3 days', 'YYYY-MM-DD');
  v_in7days TEXT := to_char(v_loc + interval '7 days', 'YYYY-MM-DD');
BEGIN
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json), array_agg(t.id)
  INTO v_result, v_ids
  FROM (
    SELECT p.id, p.titolo, p.descrizione, p.data_scadenza::text AS data_scadenza, p.assegnato_a, p.creato_da
    FROM promemoria p
    WHERE p.completata = false
      AND p.push_sent_at IS NULL
      AND (
        -- scaduti: data nel passato
        p.data_scadenza::text < v_today
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

  IF v_ids IS NOT NULL THEN
    UPDATE promemoria SET push_sent_at = now() WHERE id = ANY (v_ids);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
