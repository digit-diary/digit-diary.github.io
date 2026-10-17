-- ============================================================
-- SCRITTURE GRANDI DEL PIANO SENZA RALLENTARE (17/10/2026)
-- piano_scrivi_celle costruiva la risposta (le celle scritte) e l elenco dei conflitti
-- aggiungendo un pezzo alla volta a un JSON: a ogni cella il database ricopiava tutto
-- quello che c era gia. Il tempo cresceva col QUADRATO delle celle (misure sulla copia
-- locale, una scrittura di celle nuove): 763 celle 208 ms, 1500 celle 655 ms, 2896 celle
-- 2178 ms, vicino al limite di 3 secondi che il cloud (Supabase) da a ogni istruzione del
-- programma; sul cloud, piu lento, il limite arriva prima e la scrittura si annulla tutta
-- ("il database ha impiegato troppo"). Interessa le scritture grandi: Versioni del mese,
-- Annulla e Annulla tutto di uno Svuota o di una bozza, Migliora la bozza, import.
-- Ora: conflitti in una lista (aggiunta senza ricopiare) e celle scritte lette tutte
-- insieme alla fine. Stesso risultato, stesso controllo, sempre tutto o niente; il tempo
-- cresce in proporzione alle celle: 763 celle 72 ms, 1500 celle 141 ms, 2896 celle 263 ms.
-- Funzioni cambiate: 1 (piano_scrivi_celle). Nessuna funzione nuova. Rilanciabile.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.piano_scrivi_celle(p_token text, p_ops jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT[];
  v_inizio TIMESTAMPTZ := clock_timestamp();
  o JSONB;
  v_row piano%ROWTYPE;
  v_trovata BOOLEAN;
  v_conf JSONB[] := ARRAY[]::jsonb[];
  v_out JSONB;
  v_att JSONB;
  v_dati JSONB;
  v_k TEXT;
  v_xmin TEXT;
  v_coll TEXT;
  v_data DATE;
  v_cod TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF jsonb_typeof(COALESCE(p_ops, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_ops) > 3000 THEN
    RAISE EXCEPTION 'Operazioni non valide (max 3000)';
  END IF;
  IF jsonb_array_length(p_ops) = 0 THEN
    RETURN json_build_object('ok', true, 'righe', '[]'::json, 'inizio', v_inizio, 'fine', clock_timestamp());
  END IF;
  -- forma delle operazioni e celle ripetute
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_ops) x
              WHERE jsonb_typeof(x) <> 'object' OR COALESCE(x ->> 'collaboratore', '') = ''
                 OR COALESCE(x ->> 'data', '') !~ '^\d{4}-\d{2}-\d{2}'
                 OR NOT (x ? 'dati') OR jsonb_typeof(x -> 'dati') NOT IN ('object', 'null')
                 OR (x ? 'atteso' AND jsonb_typeof(x -> 'atteso') NOT IN ('object', 'null'))) THEN
    RAISE EXCEPTION 'Operazione sul piano non valida';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_ops) x)
     <> (SELECT count(DISTINCT (x ->> 'collaboratore', left(x ->> 'data', 10))) FROM jsonb_array_elements(p_ops) x) THEN
    RAISE EXCEPTION 'La stessa cella compare due volte';
  END IF;
  -- celle che esistono: bloccate tutte insieme, in ordine (niente stallo fra due PC)
  PERFORM 1 FROM piano p
    WHERE (p.collaboratore, p.data) IN (SELECT x ->> 'collaboratore', left(x ->> 'data', 10)::date
                                          FROM jsonb_array_elements(p_ops) x)
    ORDER BY p.collaboratore, p.data
    FOR UPDATE;

  -- 1. CONTROLLO: ogni cella e ancora come la vedeva chi scrive?
  FOR o IN SELECT x FROM jsonb_array_elements(p_ops) x LOOP
    IF NOT (o ? 'atteso') THEN CONTINUE; END IF;
    SELECT * INTO v_row FROM piano WHERE collaboratore = o ->> 'collaboratore' AND data = left(o ->> 'data', 10)::date;
    v_trovata := FOUND;
    v_att := o -> 'atteso';
    IF jsonb_typeof(v_att) = 'null' THEN
      IF v_trovata THEN
        v_conf := array_append(v_conf, jsonb_build_object('collaboratore', o ->> 'collaboratore',
                    'data', left(o ->> 'data', 10), 'attuale', to_jsonb(v_row)));
      END IF;
    ELSIF NOT v_trovata THEN
      v_conf := array_append(v_conf, jsonb_build_object('collaboratore', o ->> 'collaboratore',
                  'data', left(o ->> 'data', 10), 'attuale', NULL));
    ELSE
      FOR v_k IN SELECT jsonb_object_keys(v_att) LOOP
        IF NOT (to_jsonb(v_row) ? v_k) THEN
          RAISE EXCEPTION 'Colonna sconosciuta nel piano: %', v_k;
        END IF;
        IF _piano_norm(to_jsonb(v_row) -> v_k) IS DISTINCT FROM _piano_norm(v_att -> v_k) THEN
          v_conf := array_append(v_conf, jsonb_build_object('collaboratore', o ->> 'collaboratore',
                      'data', left(o ->> 'data', 10), 'attuale', to_jsonb(v_row)));
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF cardinality(v_conf) > 0 THEN
    RETURN json_build_object('ok', false, 'conflitti', to_jsonb(v_conf));
  END IF;

  -- 2. SCRITTURA, con i permessi del canale sicuro; tutto o niente
  IF NOT v_admin AND _piano_scrittura_piena(p_token) THEN
    v_set := _settori_operatore(p_token, true);
  END IF;
  BEGIN
    FOR o IN SELECT x FROM jsonb_array_elements(p_ops) x LOOP
      v_coll := o ->> 'collaboratore';
      v_data := left(o ->> 'data', 10)::date;
      SELECT * INTO v_row FROM piano WHERE collaboratore = v_coll AND data = v_data;
      v_trovata := FOUND;
      IF jsonb_typeof(o -> 'dati') = 'null' THEN
        IF v_trovata THEN
          PERFORM secure_delete(p_token, 'piano', 'id = ' || quote_literal(v_row.id::text));
          IF EXISTS (SELECT 1 FROM piano WHERE id = v_row.id) THEN
            RAISE EXCEPTION 'Permesso mancante: cella di % il % (settore %)', v_coll, v_data, v_row.reparto_dip;
          END IF;
        END IF;
        CONTINUE;
      END IF;
      v_dati := (o -> 'dati') - 'id' - 'collaboratore' - 'data' - 'created_at';
      v_cod := upper(COALESCE(v_dati ->> 'codice', v_row.codice, ''));
      -- cella spostata in un altro settore: solo nei propri (la malattia prevale)
      IF v_set IS NOT NULL AND v_dati ? 'reparto_dip' AND v_cod NOT IN ('M', 'ND')
         AND NOT (lower(COALESCE(v_dati ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Piano di un altro settore: %', COALESCE(v_dati ->> 'reparto_dip', 'slots');
      END IF;
      IF v_trovata THEN
        IF v_dati = '{}'::jsonb THEN CONTINUE; END IF;
        SELECT xmin::text INTO v_xmin FROM piano WHERE id = v_row.id;
        PERFORM secure_update(p_token, 'piano', 'id = ' || quote_literal(v_row.id::text), v_dati);
        IF (SELECT xmin::text FROM piano WHERE id = v_row.id) IS NOT DISTINCT FROM v_xmin THEN
          RAISE EXCEPTION 'Permesso mancante: cella di % il % (settore %)', v_coll, v_data, v_row.reparto_dip;
        END IF;
      ELSE
        PERFORM secure_insert(p_token, 'piano',
          v_dati || jsonb_build_object('collaboratore', v_coll, 'data', to_char(v_data, 'YYYY-MM-DD')));
      END IF;
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    -- un collega ha creato la cella fra il controllo e la scrittura: niente scritto
    SELECT * INTO v_row FROM piano WHERE collaboratore = v_coll AND data = v_data;
    RETURN json_build_object('ok', false, 'conflitti', jsonb_build_array(jsonb_build_object(
      'collaboratore', v_coll, 'data', to_char(v_data, 'YYYY-MM-DD'),
      'attuale', CASE WHEN FOUND THEN to_jsonb(v_row) END)));
  END;

  -- le celle come sono ora, nell ordine delle operazioni (null = cancellata), in UNA lettura
  SELECT COALESCE(jsonb_agg(CASE WHEN p.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(p) END ORDER BY x.n), '[]'::jsonb)
    INTO v_out
    FROM jsonb_array_elements(p_ops) WITH ORDINALITY x(o, n)
    LEFT JOIN piano p ON p.collaboratore = x.o ->> 'collaboratore' AND p.data = left(x.o ->> 'data', 10)::date;
  RETURN json_build_object('ok', true, 'righe', v_out, 'inizio', v_inizio, 'fine', clock_timestamp());
END;
$function$

;

REVOKE EXECUTE ON FUNCTION public.piano_scrivi_celle(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_scrivi_celle(text, jsonb) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260925_piano_scrivi_celle_veloce')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

-- PostgREST rilegge l elenco delle funzioni
NOTIFY pgrst, 'reload schema';
