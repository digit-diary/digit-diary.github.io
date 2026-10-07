-- ============================================================
-- STORICO DEL PIANO (v408, richiesta del titolare 08/10/2026: "tornare al giorno X
-- all ora Y", fatto per il server interno dell IT)
-- Ogni cambio di una cella del piano (nuova, modificata, cancellata) viene registrato
-- dal database stesso con un trigger: com era prima, com e dopo, chi e quando. Vale per
-- qualsiasi strada (a mano, incolla, bozza, Migliora, import, vacanze, generazione
-- automatica, Annulla), da qualsiasi PC, anche dopo aver chiuso il programma.
-- Il programma lo legge con tre funzioni (sessione valida):
--   piano_storico_momenti(token, settore, mese)  i momenti di modifica del mese (per
--                                                minuto e operatore, con il numero di celle)
--   piano_storico_al(token, settore, mese, istante) il mese com era in quell istante
--   piano_storico_cella(token, nome, giorno)     tutte le modifiche di una cella
-- Il ripristino lo fa il programma con le scritture normali (anche lui registrato e
-- annullabile). Il chi: l operatore della sessione (_validate_op_session lo annota per
-- la transazione in diario.operatore); senza sessione, la colonna operatore della riga.
-- Conservazione: 13 mesi (cleanup_old_data). Tabella senza accesso diretto (RLS senza
-- regole): solo attraverso le funzioni. Export/import della migrazione: la tabella e
-- nel backup come le altre; import_backup.py disattiva i trigger durante l import, quindi
-- l import non riempie lo storico.
-- Si puo rilanciare.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.piano_storico (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  piano_id BIGINT,
  collaboratore TEXT,
  data DATE,
  reparto_dip TEXT,
  azione TEXT NOT NULL,
  prima JSONB,
  dopo JSONB,
  operatore TEXT,
  quando TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS piano_storico_mese_idx ON public.piano_storico (reparto_dip, data, quando);
CREATE INDEX IF NOT EXISTS piano_storico_riga_idx ON public.piano_storico (piano_id, quando);
CREATE INDEX IF NOT EXISTS piano_storico_cella_idx ON public.piano_storico (collaboratore, data);
CREATE INDEX IF NOT EXISTS piano_storico_quando_idx ON public.piano_storico (quando);
ALTER TABLE public.piano_storico ENABLE ROW LEVEL SECURITY;

-- chi scrive: la sessione valida annota l operatore per la transazione in corso
CREATE OR REPLACE FUNCTION public._validate_op_session(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
BEGIN
  SELECT s.operatore INTO v_op FROM operator_sessions s
  WHERE s.token = p_token AND s.expires_at > now()
    AND (s.is_admin OR EXISTS (SELECT 1 FROM operatori_auth o WHERE o.nome = s.operatore))
  LIMIT 1;
  IF v_op IS NOT NULL THEN
    PERFORM set_config('diario.operatore', v_op, true);
  END IF;
  RETURN v_op;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._validate_op_session(text) FROM PUBLIC;

-- il trigger: una riga per ogni cella cambiata (le modifiche che non cambiano niente di
-- visibile, solo l ora o l operatore, non si registrano)
CREATE OR REPLACE FUNCTION public._piano_storico_registra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT := NULLIF(current_setting('diario.operatore', true), '');
  v_prima JSONB;
  v_dopo JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_prima := to_jsonb(OLD);
    v_dopo := to_jsonb(NEW);
    IF (v_prima - 'updated_at' - 'operatore') = (v_dopo - 'updated_at' - 'operatore') THEN
      RETURN NEW;
    END IF;
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore)
    VALUES (NEW.id, NEW.collaboratore, NEW.data, NEW.reparto_dip, 'modifica', v_prima, v_dopo, COALESCE(v_op, NEW.operatore));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore)
    VALUES (NEW.id, NEW.collaboratore, NEW.data, NEW.reparto_dip, 'nuova', NULL, to_jsonb(NEW), COALESCE(v_op, NEW.operatore));
    RETURN NEW;
  ELSE
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore)
    VALUES (OLD.id, OLD.collaboratore, OLD.data, OLD.reparto_dip, 'cancellata', to_jsonb(OLD), NULL, COALESCE(v_op, OLD.operatore));
    RETURN OLD;
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._piano_storico_registra() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public._piano_storico_registra() FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public._validate_op_session(text) FROM anon, authenticated';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS piano_storico_trg ON public.piano;
CREATE TRIGGER piano_storico_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.piano
  FOR EACH ROW EXECUTE FUNCTION public._piano_storico_registra();

-- momenti di modifica di un mese e di un settore (i piu recenti prima)
CREATE OR REPLACE FUNCTION public.piano_storico_momenti(p_token text, p_reparto text, p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_da DATE := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_out JSON;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- per minuto e operatore: una cella conta una volta (com era al primo cambio e com e
  -- all ultimo; il ripristino cancella e riscrive, sono due righe ma un cambio solo) e le
  -- celle tornate uguali non contano
  WITH ev AS (
    SELECT date_trunc('minute', quando) AS minuto, COALESCE(operatore, '') AS operatore, collaboratore, data,
           (array_agg(prima ORDER BY quando, id))[1] AS prima,
           (array_agg(dopo ORDER BY quando DESC, id DESC))[1] AS dopo,
           min(quando) AS primo, max(quando) AS ultimo
      FROM piano_storico
     WHERE COALESCE(reparto_dip, 'slots') = p_reparto
       AND data >= v_da AND data < (v_da + interval '1 month')
     GROUP BY 1, 2, 3, 4
  ), cambi AS (
    SELECT * FROM ev
     WHERE (prima - 'id' - 'updated_at' - 'operatore' - 'created_at') IS DISTINCT FROM
           (dopo - 'id' - 'updated_at' - 'operatore' - 'created_at')
  )
  SELECT COALESCE(json_agg(x ORDER BY x.minuto DESC), '[]'::json) INTO v_out FROM (
    SELECT minuto, min(primo) AS primo, max(ultimo) AS ultimo, operatore, count(*) AS celle,
           count(*) FILTER (WHERE prima IS NULL) AS nuove,
           count(*) FILTER (WHERE prima IS NOT NULL AND dopo IS NOT NULL) AS modificate,
           count(*) FILTER (WHERE dopo IS NULL) AS cancellate,
           (array_agg(collaboratore || ' ' || to_char(data, 'DD.MM') || ': ' ||
              COALESCE(prima ->> 'codice', 'vuota') || ' > ' || COALESCE(dopo ->> 'codice', 'vuota') ORDER BY primo))[1:4] AS esempi
      FROM cambi
     GROUP BY minuto, operatore
     ORDER BY minuto DESC
     LIMIT 400
  ) x;
  RETURN v_out;
END;
$function$;

-- il mese di un settore com era in un istante: per ogni riga del piano la prima modifica
-- DOPO l istante dice com era (nessuna = com e oggi; "nuova" dopo l istante = non c era)
CREATE OR REPLACE FUNCTION public.piano_storico_al(p_token text, p_reparto text, p_ym text, p_quando timestamptz)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_da DATE := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_a DATE := (to_date(p_ym || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_out JSON;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  WITH dopo AS (
    SELECT DISTINCT ON (piano_id) piano_id, prima
      FROM piano_storico
     WHERE quando > p_quando AND piano_id IS NOT NULL
       AND data BETWEEN v_da - 1 AND v_a + 1
     ORDER BY piano_id, quando ASC
  ), stato AS (
    SELECT to_jsonb(p) AS r FROM piano p
     WHERE p.data BETWEEN v_da AND v_a AND NOT EXISTS (SELECT 1 FROM dopo d WHERE d.piano_id = p.id)
    UNION ALL
    SELECT prima FROM dopo WHERE prima IS NOT NULL
  )
  SELECT COALESCE(json_agg(r), '[]'::json) INTO v_out FROM stato
   WHERE (r ->> 'data')::date BETWEEN v_da AND v_a AND COALESCE(r ->> 'reparto_dip', 'slots') = p_reparto;
  RETURN v_out;
END;
$function$;

-- tutte le modifiche di una cella (persona e giorno), le piu recenti prima
CREATE OR REPLACE FUNCTION public.piano_storico_cella(p_token text, p_collaboratore text, p_data date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_out JSON;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.quando DESC), '[]'::json) INTO v_out FROM (
    SELECT quando, azione, operatore, reparto_dip,
           prima ->> 'codice' AS da, dopo ->> 'codice' AS a,
           COALESCE(dopo ->> 'commento', prima ->> 'commento') AS commento,
           dopo ->> 'motivo_blocco' AS motivo_blocco,
           dopo ->> 'ora_inizio' AS ora_inizio, dopo ->> 'ora_fine' AS ora_fine
      FROM piano_storico
     WHERE collaboratore = p_collaboratore AND data = p_data
     ORDER BY quando DESC
     LIMIT 200
  ) x;
  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.piano_storico_momenti(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.piano_storico_al(text, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.piano_storico_cella(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_storico_momenti(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.piano_storico_al(text, text, text, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.piano_storico_cella(text, text, date) TO anon, authenticated, service_role;

-- conservazione: 13 mesi di storico del piano (oltre al registro di 12 mesi)
CREATE OR REPLACE FUNCTION public.cleanup_old_data(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_sessions INT;
  v_logs INT;
  v_storico INT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  DELETE FROM operator_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  DELETE FROM admin_sessions WHERE expires_at < now();
  DELETE FROM log_attivita WHERE created_at < now() - interval '12 months';
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM piano_storico WHERE quando < now() - interval '13 months';
  GET DIAGNOSTICS v_storico = ROW_COUNT;
  RETURN json_build_object('sessions_cleaned', v_sessions, 'logs_cleaned', v_logs, 'storico_cleaned', v_storico);
END;
$function$;

NOTIFY pgrst, 'reload schema';
