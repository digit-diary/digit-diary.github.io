-- RPC per upsert rapporto giornaliero (INSERT ON CONFLICT UPDATE)
CREATE OR REPLACE FUNCTION upsert_rapporto(p_token TEXT, p_data JSONB)
RETURNS JSON AS $$
DECLARE
  v_op TEXT;
  v_result JSON;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  INSERT INTO rapporti_giornalieri (
    data_rapporto, turno, operatore, updated_at, reparto_dip,
    sup_note, cassa_note, sala_note, n_assegni, prelievi, assenze, note_extra
  ) VALUES (
    (p_data->>'data_rapporto'),
    (p_data->>'turno'),
    (p_data->>'operatore'),
    (p_data->>'updated_at'),
    (p_data->>'reparto_dip'),
    (p_data->>'sup_note'),
    (p_data->>'cassa_note'),
    (p_data->>'sala_note'),
    (p_data->>'n_assegni'),
    (p_data->>'prelievi'),
    (p_data->>'assenze'),
    (p_data->>'note_extra')
  )
  ON CONFLICT (data_rapporto, turno, reparto_dip) DO UPDATE SET
    operatore = EXCLUDED.operatore,
    updated_at = EXCLUDED.updated_at,
    sup_note = EXCLUDED.sup_note,
    cassa_note = EXCLUDED.cassa_note,
    sala_note = EXCLUDED.sala_note,
    n_assegni = EXCLUDED.n_assegni,
    prelievi = EXCLUDED.prelievi,
    assenze = EXCLUDED.assenze,
    note_extra = EXCLUDED.note_extra
  RETURNING row_to_json(rapporti_giornalieri.*) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
