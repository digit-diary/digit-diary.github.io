-- 01/11/2026 · V1 NON E UNA VACANZA (decisione del titolare): la vacanza e solo V. Il codice
-- speciale V1 «Vacanza (variante)» non e mai stato usato (0 celle nel piano, nello storico,
-- nelle vacanze e nei turni: controllo sui dati veri del 15/10) e occupava la sigla V1, che
-- serve come turno 12:15-21:00 al settore Sicurezza & Sorveglianza.
--   1. si toglie il codice speciale V1 (solo se nessuna cella lo usa: altrimenti resta e si
--      avvisa, cosi nessun dato cambia significato);
--   2. la regola jolly_codici_gia_pagati «V,V1» (quella di partenza) diventa «V»;
--   3. _piano_sotto_malattia: protetta sotto la malattia solo V e CGF.
-- Idempotente. Dopo 20260931_d_promemoria_ripetuti_proposte_doppie.sql.

BEGIN;

DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM piano WHERE upper(codice) = 'V1';
  n := n + (SELECT count(*) FROM piano_vacanze WHERE upper(COALESCE(codice, '')) = 'V1');
  IF n = 0 THEN
    DELETE FROM piano_codici WHERE upper(codice) = 'V1';
  ELSE
    RAISE NOTICE 'V1 usato in % celle o vacanze: il codice speciale resta', n;
  END IF;
END $$;

UPDATE piano_regole SET valore = 'V'
 WHERE nome = 'jolly_codici_gia_pagati' AND replace(upper(COALESCE(valore, '')), ' ', '') = 'V,V1';

CREATE OR REPLACE FUNCTION public._piano_sotto_malattia(r piano)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v JSONB;
  v_sigla TEXT;
BEGIN
  IF jsonb_typeof(r.prima_malattia) = 'object' AND COALESCE(r.prima_malattia ->> 'codice', '') <> '' THEN
    RETURN r.prima_malattia;
  END IF;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  SELECT s.prima INTO v
    FROM piano_storico s
   WHERE s.piano_id = r.id AND s.azione = 'modifica'
     AND upper(COALESCE(s.dopo ->> 'codice', '')) IN ('M', 'M1', 'ND', 'ASS')
     AND upper(COALESCE(s.prima ->> 'codice', '')) NOT IN ('M', 'M1', 'ND', 'ASS', '')
   ORDER BY s.id DESC
   LIMIT 1;
  IF v IS NOT NULL THEN
    RETURN jsonb_build_object('codice', v ->> 'codice', 'protetto', COALESCE(v -> 'protetto', 'false'::jsonb),
      'generato', COALESCE(v -> 'generato', 'false'::jsonb), 'commento', v -> 'commento',
      'motivo_blocco', v -> 'motivo_blocco')
      || CASE WHEN jsonb_typeof(v -> 'prima_malattia') = 'object'
              THEN jsonb_build_object('prima_malattia', v -> 'prima_malattia') ELSE '{}'::jsonb END;
  END IF;
  IF EXISTS (SELECT 1 FROM piano_storico s WHERE s.piano_id = r.id) THEN
    RETURN NULL; -- la cella e nata M/ND (o la nota e stata scritta dopo): sotto niente
  END IF;
  v_sigla := substring(COALESCE(r.commento, '') FROM '^(?:Ex|Malattia dal Diario . era) ([A-Z0-9]+)');
  IF v_sigla IS NULL OR upper(v_sigla) IN ('M', 'M1', 'ND', 'ASS') THEN RETURN NULL; END IF;
  -- 20260932: V1 non e una vacanza (solo V)
  RETURN jsonb_build_object('codice', v_sigla, 'protetto', v_sigla IN ('V', 'CGF'),
    'generato', COALESCE(r.commento, '') ~ '\(bozza\)', 'commento', NULL, 'motivo_blocco', NULL);
END;
$function$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260932_a_v1_non_vacanza')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
