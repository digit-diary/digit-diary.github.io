-- D1: Campo origine su registrazioni per distinguere record manuali, da rapporto e da import
-- Default 'manual' per non rompere flusso esistente

ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS origine TEXT DEFAULT 'manual';

-- Backfill: marca i record creati dal vecchio parser malattie come 'rapporto'
-- Riconoscibili dal pattern "da rapporto PRESTO" o "da rapporto NOTTE" nel testo
UPDATE registrazioni
SET origine = 'rapporto'
WHERE tipo IN ('Malattia', 'malattia')
  AND testo ~ 'da rapporto (PRESTO|NOTTE)'
  AND (origine IS NULL OR origine = 'manual');

-- Index per filtrare velocemente i record per origine
CREATE INDEX IF NOT EXISTS idx_registrazioni_origine ON registrazioni(origine);

-- D6: Function transazionale per parser assenze rapporto
-- Esegue creates/updates/deletes in una singola transazione PL/pgSQL
-- Input: token sessione + array di operazioni
-- Output: JSON con id assegnati ai record creati e contatori

CREATE OR REPLACE FUNCTION parse_assenze_transactional(
  p_token TEXT,
  p_ops JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_op TEXT;
  v_action TEXT;
  v_payload JSONB;
  v_filter TEXT;
  v_ids INTEGER[] := ARRAY[]::INTEGER[];
  v_new_id BIGINT;
  v_result JSONB;
  v_created INT := 0;
  v_updated INT := 0;
  v_deleted INT := 0;
  v_cols TEXT;
  v_vals TEXT;
  v_set TEXT;
  v_key TEXT;
  v_val JSONB;
  v_ops_array JSONB;
BEGIN
  -- Valida sessione operatore
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  v_ops_array := p_ops;
  IF jsonb_typeof(v_ops_array) <> 'array' THEN
    RAISE EXCEPTION 'Le operazioni devono essere un array JSON';
  END IF;

  -- Itera operazioni
  FOR v_payload IN SELECT * FROM jsonb_array_elements(v_ops_array)
  LOOP
    v_action := v_payload->>'action';

    IF v_action = 'create' THEN
      -- Build dynamic INSERT
      v_cols := '';
      v_vals := '';
      FOR v_key, v_val IN SELECT * FROM jsonb_each(v_payload->'data')
      LOOP
        IF v_cols <> '' THEN
          v_cols := v_cols || ', ';
          v_vals := v_vals || ', ';
        END IF;
        v_cols := v_cols || quote_ident(v_key);
        IF v_val = 'null'::jsonb THEN
          v_vals := v_vals || 'NULL';
        ELSIF jsonb_typeof(v_val) = 'string' THEN
          v_vals := v_vals || quote_literal(v_val #>> '{}');
        ELSIF jsonb_typeof(v_val) = 'number' THEN
          v_vals := v_vals || (v_val #>> '{}');
        ELSIF jsonb_typeof(v_val) = 'boolean' THEN
          v_vals := v_vals || (v_val #>> '{}');
        ELSE
          v_vals := v_vals || quote_literal(v_val::text);
        END IF;
      END LOOP;
      EXECUTE 'INSERT INTO registrazioni (' || v_cols || ') VALUES (' || v_vals || ') RETURNING id'
        INTO v_new_id;
      v_ids := array_append(v_ids, v_new_id::INTEGER);
      v_created := v_created + 1;

    ELSIF v_action = 'update' THEN
      v_set := '';
      FOR v_key, v_val IN SELECT * FROM jsonb_each(v_payload->'data')
      LOOP
        IF v_set <> '' THEN v_set := v_set || ', '; END IF;
        IF v_val = 'null'::jsonb THEN
          v_set := v_set || quote_ident(v_key) || ' = NULL';
        ELSIF jsonb_typeof(v_val) = 'string' THEN
          v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val #>> '{}');
        ELSIF jsonb_typeof(v_val) = 'number' THEN
          v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
        ELSIF jsonb_typeof(v_val) = 'boolean' THEN
          v_set := v_set || quote_ident(v_key) || ' = ' || (v_val #>> '{}');
        ELSE
          v_set := v_set || quote_ident(v_key) || ' = ' || quote_literal(v_val::text);
        END IF;
      END LOOP;
      EXECUTE 'UPDATE registrazioni SET ' || v_set || ' WHERE id = ' || (v_payload->>'id')::BIGINT;
      v_updated := v_updated + 1;

    ELSIF v_action = 'delete' THEN
      EXECUTE 'DELETE FROM registrazioni WHERE id = ' || (v_payload->>'id')::BIGINT;
      v_deleted := v_deleted + 1;

    ELSE
      RAISE EXCEPTION 'Azione non valida: %', v_action;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'created_ids', to_jsonb(v_ids),
    'created', v_created,
    'updated', v_updated,
    'deleted', v_deleted
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
