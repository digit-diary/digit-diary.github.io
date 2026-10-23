-- 23/10/2026 · COPIA DEL FABBISOGNO IN UN'UNICA SCRITTURA (controllo QA audit D, D23)
-- "Copia dal mese precedente" e "Prepara più mesi" scrivevano il fabbisogno a gruppi di 10
-- (REST): un errore a meta lasciava una copia parziale. Ora il programma calcola le celle come
-- prima (_pianoFabbisognoCopiaCalcola, per tipo di giornata) e il database le scrive TUTTE O
-- NESSUNA, con:
--   - permesso "Modificare il fabbisogno" (o amministratore), come secure_insert;
--   - SETTORE: solo nei settori in cui l operatore scrive (prima il database non lo guardava
--     per il fabbisogno: un operatore poteva riempire il mese di un altro settore);
--   - celle del mese e del settore indicati, una sola volta ciascuna;
--   - cella gia impostata (da un altro PC nel frattempo) = niente scritto, si dice quale.
-- Le righe scritte tornano indietro: il programma le mette nell Annulla (un passo).
-- Idempotente: si puo applicare piu volte.

BEGIN;

CREATE OR REPLACE FUNCTION public.piano_fabbisogno_copia(p_token text, p_ym text, p_rep text, p_righe jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT[];
  v_da DATE;
  v_a DATE;
  o JSONB;
  v_ins JSON;
  v_out JSONB := '[]'::jsonb;
  v_conf JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF NOT v_admin AND NOT _permesso_piano_auto(p_token, 'piano_fabbisogno') THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il fabbisogno';
  END IF;
  p_rep := lower(btrim(COALESCE(p_rep, '')));
  IF p_rep = '' THEN
    RAISE EXCEPTION 'Settore mancante';
  END IF;
  IF NOT v_admin THEN
    v_set := _settori_operatore(p_token, true);
    IF v_set IS NOT NULL AND NOT (p_rep = ANY(v_set)) THEN
      RAISE EXCEPTION 'Fabbisogno di un altro settore: %', p_rep;
    END IF;
  END IF;
  IF COALESCE(p_ym, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mese non valido: %', COALESCE(p_ym, '');
  END IF;
  v_da := (p_ym || '-01')::date;
  v_a := (v_da + interval '1 month' - interval '1 day')::date;
  IF jsonb_typeof(COALESCE(p_righe, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_righe) > 3000 THEN
    RAISE EXCEPTION 'Celle del fabbisogno non valide (max 3000)';
  END IF;
  IF jsonb_array_length(p_righe) = 0 THEN
    RETURN json_build_object('ok', true, 'righe', '[]'::json);
  END IF;
  -- forma: solo celle di questo mese e settore, quantita intera >= 0
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_righe) x
              WHERE jsonb_typeof(x) <> 'object'
                 OR EXISTS (SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('data', 'turno_codice', 'quantita', 'reparto_dip'))
                 OR COALESCE(x ->> 'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
                 OR (x ->> 'data')::date NOT BETWEEN v_da AND v_a
                 OR btrim(COALESCE(x ->> 'turno_codice', '')) = ''
                 OR COALESCE(x ->> 'quantita', '') !~ '^[0-9]+$'
                 OR lower(COALESCE(x ->> 'reparto_dip', '')) <> p_rep) THEN
    RAISE EXCEPTION 'Cella del fabbisogno fuori dal mese % o dal settore %', p_ym, p_rep;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_righe))
     <> (SELECT count(DISTINCT (x ->> 'data', x ->> 'turno_codice')) FROM jsonb_array_elements(p_righe) x) THEN
    RAISE EXCEPTION 'La stessa cella del fabbisogno compare due volte';
  END IF;
  -- due copie dello stesso mese e settore insieme (due PC): una alla volta
  PERFORM pg_advisory_xact_lock(hashtext('piano_fabbisogno_copia|' || p_rep || '|' || p_ym));
  -- celle gia impostate: niente scritto
  SELECT jsonb_agg(jsonb_build_object('data', f.data, 'turno_codice', f.turno_codice, 'quantita', f.quantita)
                   ORDER BY f.data, f.turno_codice)
    INTO v_conf
    FROM piano_fabbisogni f
    JOIN jsonb_array_elements(p_righe) x
      ON f.data = (x ->> 'data')::date AND f.turno_codice = x ->> 'turno_codice' AND f.reparto_dip = p_rep;
  IF v_conf IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'conflitti', v_conf);
  END IF;
  -- scrittura con il canale sicuro (permessi), tutto o niente
  FOR o IN SELECT x FROM jsonb_array_elements(p_righe) x ORDER BY x ->> 'data', x ->> 'turno_codice' LOOP
    v_ins := secure_insert(p_token, 'piano_fabbisogni',
               jsonb_build_object('data', o ->> 'data', 'turno_codice', o ->> 'turno_codice',
                                  'quantita', (o ->> 'quantita')::int, 'reparto_dip', p_rep));
    v_out := v_out || jsonb_build_array(v_ins::jsonb);
  END LOOP;
  RETURN json_build_object('ok', true, 'righe', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.piano_fabbisogno_copia(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_fabbisogno_copia(text, text, text, jsonb) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260930_b_fabbisogno_copia_atomica')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
