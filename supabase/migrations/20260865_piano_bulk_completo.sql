-- ============================================================
-- PIANO — inserimento massivo con TUTTE le colonne della cella
-- La versione precedente scriveva solo 8 colonne: "Annulla" e "Ripristina"
-- (che cancellano il mese e lo reinseriscono) perdevano colori, orari dei
-- JG/corsi, motivi di blocco e l'operatore originale. Stessa firma, stesso
-- ON CONFLICT (mai sovrascrive una cella esistente), in piu':
-- ora_inizio, ora_fine, colore, motivo_blocco e operatore (se presente).
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
    INSERT INTO piano (collaboratore, data, codice, protetto, generato, commento, reparto_dip, operatore,
                       ora_inizio, ora_fine, colore, motivo_blocco)
    VALUES (
      r->>'collaboratore',
      (r->>'data')::DATE,
      r->>'codice',
      COALESCE((r->>'protetto')::BOOLEAN, FALSE),
      COALESCE((r->>'generato')::BOOLEAN, TRUE),
      NULLIF(r->>'commento', ''),
      COALESCE(r->>'reparto_dip', 'slots'),
      COALESCE(NULLIF(r->>'operatore', ''), v_op),
      NULLIF(r->>'ora_inizio', ''),
      NULLIF(r->>'ora_fine', ''),
      NULLIF(r->>'colore', ''),
      NULLIF(r->>'motivo_blocco', '')
    )
    ON CONFLICT (collaboratore, data) DO NOTHING;
    IF FOUND THEN v_ins := v_ins + 1; END IF;
  END LOOP;

  RETURN json_build_object('inserite', v_ins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
