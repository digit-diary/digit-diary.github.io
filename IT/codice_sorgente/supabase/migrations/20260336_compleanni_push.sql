-- RPC: trova compleanni di oggi (per push notification)
CREATE OR REPLACE FUNCTION get_today_birthdays()
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_today_day INT := EXTRACT(DAY FROM now());
  v_today_month INT := EXTRACT(MONTH FROM now());
BEGIN
  SELECT COALESCE(json_agg(json_build_object('nome', nome, 'tipo', 'maison')), '[]'::json)
  INTO v_result
  FROM (
    -- Compleanni clienti Maison
    SELECT nome FROM maison_budget
    WHERE data_nascita IS NOT NULL
      AND EXTRACT(DAY FROM data_nascita::date) = v_today_day
      AND EXTRACT(MONTH FROM data_nascita::date) = v_today_month
    UNION
    -- Compleanni collaboratori
    SELECT nome FROM collaboratori
    WHERE data_nascita IS NOT NULL
      AND attivo = true
      AND EXTRACT(DAY FROM data_nascita::date) = v_today_day
      AND EXTRACT(MONTH FROM data_nascita::date) = v_today_month
  ) t;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
