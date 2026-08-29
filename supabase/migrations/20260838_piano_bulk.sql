-- ============================================================
-- PIANO — inserimento massivo per la bozza automatica
-- Una sola chiamata RPC invece di centinaia di insert singoli.
-- Valida la sessione come le altre secure_*; ON CONFLICT ignora
-- le celle già esistenti (mai sovrascrive V/malattie/protette).
-- ============================================================

CREATE OR REPLACE FUNCTION piano_bulk_upsert(p_token TEXT, p_rows JSONB)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_ins INT := 0;
  r JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF jsonb_typeof(p_rows) != 'array' OR jsonb_array_length(p_rows) > 3000 THEN
    RAISE EXCEPTION 'Righe non valide (max 3000)';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO piano (collaboratore, data, codice, protetto, generato, commento, reparto_dip, operatore)
    VALUES (
      r->>'collaboratore',
      (r->>'data')::DATE,
      r->>'codice',
      COALESCE((r->>'protetto')::BOOLEAN, FALSE),
      COALESCE((r->>'generato')::BOOLEAN, TRUE),
      NULLIF(r->>'commento', ''),
      COALESCE(r->>'reparto_dip', 'slots'),
      v_op
    )
    ON CONFLICT (collaboratore, data) DO NOTHING;
    IF FOUND THEN v_ins := v_ins + 1; END IF;
  END LOOP;

  RETURN json_build_object('inserite', v_ins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
