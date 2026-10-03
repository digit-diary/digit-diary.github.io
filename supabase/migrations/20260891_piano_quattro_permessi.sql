-- v356 · AZIONI AUTOMATICHE DEL PIANO IN QUATTRO PERMESSI
-- piano_auto_genera   genera bozza, solver, coperture, migliora ore, cancella la bozza
-- piano_auto_vacanze  importa e applica vacanze, metti V, assegna CGF
-- piano_auto_import   importa piano, fabbisogno e timbrature da file
-- piano_auto_cancella cancella il piano intero, tutte le vacanze, il fabbisogno del mese
-- Copiare e incollare il fabbisogno restano a chi modifica il piano.
-- Finche una voce nuova non c e in "visibilita" vale quella di prima
-- (piano_azioni_auto); all applicazione le quattro voci prendono il valore di
-- piano_azioni_auto (Responsabile e Sostituto). Corpi identici a quelli in
-- produzione (20260888) piu le righe segnate v356.

CREATE OR REPLACE FUNCTION public._permesso_piano_auto(p_token text, p_chiave text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_cfg JSONB;
BEGIN
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'visibilita';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  IF v_cfg IS NOT NULL AND v_cfg ? p_chiave THEN
    RETURN _sessione_permesso(p_token, p_chiave);
  END IF;
  RETURN _sessione_permesso(p_token, 'piano_azioni_auto');
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_table IN ('log_attivita') AND NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    RAISE EXCEPTION 'registro riservato all amministratore';
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'delete', NULL);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Cancellazione senza filtro: mai su tutta la tabella';
  END IF;
  -- cancellare a intervallo nel piano (un mese, un settore, una persona) e un azione
  -- automatica; una o piu righe scelte per id restano a chi modifica il piano
  -- v356: quattro permessi (genera, vacanze, import, cancella) al posto di uno;
  -- il fabbisogno a intervallo anche a chi modifica il piano (copia e incolla liberi)
  IF p_filter !~ '^id (= ''[^'']*''|IN \(''[^'']*''(, ''[^'']*'')*\))$' THEN
    IF p_table = 'piano' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_genera')
         OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      RAISE EXCEPTION 'Permesso mancante: azioni automatiche del piano';
    END IF;
    IF p_table = 'piano_vacanze' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_vacanze')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      RAISE EXCEPTION 'Permesso mancante: vacanze automatiche';
    END IF;
    IF p_table = 'piano_fabbisogni' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
         OR _permesso_piano_auto(p_token, 'piano_auto_import') OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
      RAISE EXCEPTION 'Permesso mancante: piano';
    END IF;
  END IF;

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati',
    'piano', 'piano_turni', 'piano_codici', 'piano_fabbisogni', 'piano_regole', 'piano_festivi', 'piano_timbrature', 'piano_mappature', 'piano_vacanze', 'piano_regole_gruppo', 'piano_formulari', 'piano_briefing', 'collab_congedi_np', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_festivita', 'piano_ore_mese'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE ' || p_filter;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piano_bulk_upsert(p_token text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_ins INT := 0;
  r JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF NOT (_sessione_permesso(p_token, 'gestione_piano') OR _permesso_piano_auto(p_token, 'piano_auto_genera')
          OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
    RAISE EXCEPTION 'Permesso mancante: piano';
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
$function$;

DO $$
DECLARE
  v_vis JSONB;
  v_vecchio JSONB;
  k TEXT;
BEGIN
  SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  IF v_vis IS NULL THEN RETURN; END IF;
  v_vecchio := COALESCE(v_vis -> 'piano_azioni_auto', '"admin"'::jsonb);
  FOREACH k IN ARRAY ARRAY['piano_auto_genera', 'piano_auto_vacanze', 'piano_auto_import', 'piano_auto_cancella'] LOOP
    IF NOT v_vis ? k THEN
      v_vis := v_vis || jsonb_build_object(k, v_vecchio);
    END IF;
  END LOOP;
  UPDATE impostazioni SET valore = v_vis::text WHERE chiave = 'visibilita';
END $$;

NOTIFY pgrst, 'reload schema';
