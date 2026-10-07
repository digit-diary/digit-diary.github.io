-- ============================================================
-- JG CON PIU FASCE NELLO STESSO GIORNO (v409, richiesta del titolare 08/10/2026)
-- Un JG puo lavorare dalle 10 alle 12 e poi dalle 19 alle 3. La cella tiene le fasce in
-- piano.fasce (JSON: [{"da":"10:00","a":"12:00"},{"da":"19:00","a":"03:00"}]);
-- ora_inizio e ora_fine restano l inizio della prima e la fine dell ultima (il riposo
-- minimo si conta dalla fine dell ultima fascia; l intervallo fra le fasce non e riposo).
-- Ore e notturno si sommano fascia per fascia (nel programma). Con una fascia sola la
-- colonna resta vuota come prima. piano_bulk_upsert scrive anche le fasce (bozza, import,
-- Annulla, versioni del mese).
-- Si puo rilanciare.
-- ============================================================
ALTER TABLE public.piano ADD COLUMN IF NOT EXISTS fasce JSONB;

CREATE OR REPLACE FUNCTION public.piano_bulk_upsert(p_token text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_ins INT := 0;
  r JSONB;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF NOT (_sessione_permesso(p_token, 'gestione_piano') OR _permesso_piano_auto(p_token, 'piano_auto_genera')
          OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
    -- v364: lasciapassare della generazione automatica (mese e settore prenotati)
    SELECT l.reparto, l.da, l.a INTO v_rep, v_da, v_a FROM _piano_auto_lasciapassare(p_token) l;
    IF v_rep IS NULL THEN
      RAISE EXCEPTION 'Permesso mancante: piano';
    END IF;
  END IF;
  IF jsonb_typeof(p_rows) != 'array' OR jsonb_array_length(p_rows) > 3000 THEN
    RAISE EXCEPTION 'Righe non valide (max 3000)';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- con il lasciapassare: fuori dal mese o dal settore prenotati non si scrive
    IF v_rep IS NOT NULL AND (COALESCE(r->>'reparto_dip', 'slots') <> v_rep
        OR (r->>'data')::DATE NOT BETWEEN v_da AND v_a) THEN
      CONTINUE;
    END IF;
    INSERT INTO piano (collaboratore, data, codice, protetto, generato, commento, reparto_dip, operatore,
                       ora_inizio, ora_fine, colore, motivo_blocco, fasce)
    VALUES (
      r->>'collaboratore',
      (r->>'data')::DATE,
      r->>'codice',
      COALESCE((r->>'protetto')::BOOLEAN, FALSE),
      CASE WHEN v_rep IS NOT NULL THEN TRUE ELSE COALESCE((r->>'generato')::BOOLEAN, TRUE) END,
      NULLIF(r->>'commento', ''),
      COALESCE(r->>'reparto_dip', 'slots'),
      COALESCE(NULLIF(r->>'operatore', ''), v_op),
      NULLIF(r->>'ora_inizio', ''),
      NULLIF(r->>'ora_fine', ''),
      NULLIF(r->>'colore', ''),
      NULLIF(r->>'motivo_blocco', ''),
      CASE WHEN jsonb_typeof(r->'fasce') = 'array' AND jsonb_array_length(r->'fasce') > 1 THEN r->'fasce' END
    )
    ON CONFLICT (collaboratore, data) DO NOTHING;
    IF FOUND THEN v_ins := v_ins + 1; END IF;
  END LOOP;

  RETURN json_build_object('inserite', v_ins);
END;
$function$;

NOTIFY pgrst, 'reload schema';
