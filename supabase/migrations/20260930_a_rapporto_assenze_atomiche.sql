-- 23/10/2026 · ASSENZE DEL RAPPORTO IN UN'UNICA TRANSAZIONE (controllo QA audit D, D12)
-- Il Rapporto scriveva le assenze una per una (REST): le registrazioni del Diario e poi, a
-- parte, le M/ASS del Piano. Un errore a meta lasciava il Diario scritto e il Piano no (o una
-- registrazione si e l altra no). Ora una sola funzione scrive TUTTO O NIENTE:
--   1. le registrazioni del Diario (nuove, testo corretto, staccate dal Rapporto) con i
--      controlli di sempre (secure_insert / secure_update -> _controlla_permessi_scrittura,
--      settori dell operatore);
--   2. le celle del Piano con piano_scrivi_celle (cella ancora come la vedeva chi scrive,
--      ambito del Diario e del settore, giorni chiusi, ASS/M solo con i permessi).
-- Una cella cambiata da un collega (o una registrazione corretta nel frattempo) = niente
-- scritto, si risponde con i conflitti. Ogni altro errore annulla tutta la transazione.
-- Idempotente: si puo applicare piu volte. Richiede 20260912_piano_scritture_sicure.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.rapporto_assenze_scrivi(p_token text, p_reg jsonb, p_piano jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  o JSONB;
  v_az TEXT;
  v_id BIGINT;
  v_ins JSON;
  v_ids BIGINT[] := ARRAY[]::bigint[];
  v_righe JSONB := '[]'::jsonb;  -- registrazioni create, come sono nel database
  v_prima JSONB := '[]'::jsonb;  -- registrazioni corrette, come erano prima
  v_dopo JSONB := '[]'::jsonb;   -- registrazioni corrette, come sono ora
  v_r JSONB;
  v_piano JSONB;
  v_conf JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  p_reg := COALESCE(p_reg, '[]'::jsonb);
  p_piano := COALESCE(p_piano, '[]'::jsonb);
  IF jsonb_typeof(p_reg) <> 'array' OR jsonb_typeof(p_piano) <> 'array' THEN
    RAISE EXCEPTION 'Operazioni non valide';
  END IF;
  IF jsonb_array_length(p_reg) > 200 THEN
    RAISE EXCEPTION 'Troppe registrazioni in una volta (max 200)';
  END IF;

  BEGIN
    -- 1. DIARIO
    FOR o IN SELECT x FROM jsonb_array_elements(p_reg) x LOOP
      v_az := o ->> 'action';
      IF v_az = 'create' THEN
        IF jsonb_typeof(o -> 'data') <> 'object' THEN
          RAISE EXCEPTION 'Registrazione non valida';
        END IF;
        v_ins := secure_insert(p_token, 'registrazioni', o -> 'data');
        v_ids := array_append(v_ids, (v_ins::jsonb ->> 'id')::bigint);
        v_righe := v_righe || jsonb_build_array(v_ins::jsonb);
      ELSIF v_az = 'update' THEN
        IF COALESCE(o ->> 'id', '') !~ '^[0-9]+$' OR jsonb_typeof(o -> 'data') <> 'object'
           OR EXISTS (SELECT 1 FROM jsonb_object_keys(o -> 'data') k WHERE k NOT IN ('testo', 'origine')) THEN
          RAISE EXCEPTION 'Correzione di una registrazione non valida';
        END IF;
        v_id := (o ->> 'id')::bigint;
        SELECT to_jsonb(r) INTO v_r FROM registrazioni r WHERE r.id = v_id FOR UPDATE;
        IF v_r IS NULL THEN
          v_conf := jsonb_build_array(jsonb_build_object('registrazione', v_id, 'attuale', NULL));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'conflitto';
        END IF;
        -- registrazione corretta da un collega dopo la lettura: niente scritto
        IF o ? 'atteso_testo' AND (v_r ->> 'testo') IS DISTINCT FROM (o ->> 'atteso_testo') THEN
          v_conf := jsonb_build_array(jsonb_build_object('registrazione', v_id, 'attuale', v_r));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'conflitto';
        END IF;
        PERFORM secure_update(p_token, 'registrazioni', 'id = ' || quote_literal(v_id::text), o -> 'data');
        v_prima := v_prima || jsonb_build_array(v_r);
        SELECT to_jsonb(r) INTO v_r FROM registrazioni r WHERE r.id = v_id;
        v_dopo := v_dopo || jsonb_build_array(v_r);
      ELSE
        RAISE EXCEPTION 'Azione non valida: %', COALESCE(v_az, '(vuota)');
      END IF;
    END LOOP;

    -- 2. PIANO, nella stessa transazione
    IF jsonb_array_length(p_piano) > 0 THEN
      v_piano := piano_scrivi_celle(p_token, p_piano)::jsonb;
      IF NOT COALESCE((v_piano ->> 'ok')::boolean, false) THEN
        v_conf := COALESCE(v_piano -> 'conflitti', '[]'::jsonb);
        RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'conflitto';
      END IF;
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0R01' THEN
    -- tutto annullato (Diario e Piano): si dice cosa e cambiato
    RETURN json_build_object('ok', false, 'conflitti', COALESCE(v_conf, '[]'::jsonb));
  END;

  RETURN json_build_object(
    'ok', true,
    'created_ids', to_jsonb(v_ids),
    'righe', v_righe,
    'prima', v_prima,
    'dopo', v_dopo,
    'piano', COALESCE(v_piano -> 'righe', '[]'::jsonb),
    'fine', v_piano -> 'fine');
END;
$function$;

REVOKE ALL ON FUNCTION public.rapporto_assenze_scrivi(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rapporto_assenze_scrivi(text, jsonb, jsonb) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260930_a_rapporto_assenze_atomiche')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
