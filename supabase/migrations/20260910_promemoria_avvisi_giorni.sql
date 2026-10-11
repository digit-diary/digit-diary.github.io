-- ============================================================
-- PROMEMORIA: avvisi "1, 3, 7 giorni prima" di nuovo puntuali (controllo del 11/10/2026)
-- Dal 09/10/2026 (v439) il programma scrive "1 giorno prima alle 08:00" / "3 giorni prima
-- alle 08:00" invece di "1 giorno/i prima": la notifica cercava solo il vecchio testo e
-- partiva soltanto a promemoria scaduto. Ora valgono tutte e due le scritture.
-- Stessa funzione della 20260896, cambia solo il confronto del testo. I diritti restano
-- quelli della migrazione 20260895 (solo service_role). Si puo rilanciare.
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
        -- "1 giorno prima" (dal 09/10/2026) e "1 giorno/i prima" (prima)
        OR ((p.descrizione LIKE '%1 giorno prima alle ' || v_hour || '%'
             OR p.descrizione LIKE '%1 giorno/i prima alle ' || v_hour || '%')
            AND p.data_scadenza::text = v_tomorrow)
        OR ((p.descrizione LIKE '%3 giorni prima alle ' || v_hour || '%'
             OR p.descrizione LIKE '%3 giorno/i prima alle ' || v_hour || '%')
            AND p.data_scadenza::text = v_in3days)
        OR ((p.descrizione LIKE '%7 giorni prima alle ' || v_hour || '%'
             OR p.descrizione LIKE '%7 giorno/i prima alle ' || v_hour || '%')
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

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260910_promemoria_avvisi_giorni')
ON CONFLICT (nome) DO NOTHING;
