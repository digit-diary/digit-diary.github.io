-- ============================================================
-- GENERAZIONE AUTOMATICA: mese in ritardo e tentativi (controllo completo 05/10/2026)
-- 1) Prima si generava solo il mese DOPO quello in corso: con "ultimo del mese" (o se
--    nessun PC si accendeva fra il giorno scelto e la fine del mese) dall 1 toccava gia
--    al mese successivo e il mese saltato non si generava piu, senza avviso. Ora, se il
--    mese in corso del settore non e stato generato (riga non fatta, oppure nessuna
--    riga e mese ancora vuoto), si genera quello, dai giorni ancora aperti.
-- 2) Una sessione fermata a meta (PC spento) lasciava "in_corso" scaduto e si
--    riprendeva senza limite: ora al massimo 5 volte, poi errore e avviso.
-- I diritti restano quelli concessi (CREATE OR REPLACE li conserva).
-- ============================================================
CREATE OR REPLACE FUNCTION public.piano_auto_prenota(p_token text, p_reparto text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_cfg JSONB;
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_mese TEXT;
  v_corrente TEXT := to_char(v_oggi, 'YYYY-MM');
  v_ritardo BOOLEAN := false;
  v_anno INT;
  v_giorno INT;
  v_soglia DATE;
  v_ultimo INT;
  e piano_auto_esecuzioni%ROWTYPE;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_cfg := _piano_auto_config(p_reparto);
  IF v_cfg IS NULL OR NOT COALESCE((v_cfg ->> 'attivo')::boolean, false) THEN
    RETURN json_build_object('esito', 'spenta');
  END IF;
  v_mese := to_char(v_oggi + interval '1 month', 'YYYY-MM');
  -- MESE IN RITARDO (controllo 05.10): se il mese in corso non e stato generato
  -- (nessun PC acceso fra il giorno scelto e la fine del mese prima, oppure vacanze
  -- importate dopo, oppure errore) si genera adesso, dai giorni ancora aperti, prima
  -- del mese dopo. Senza riga: solo se il mese in corso del settore e ancora vuoto.
  SELECT * INTO e FROM piano_auto_esecuzioni WHERE reparto_dip = p_reparto AND mese = v_corrente;
  IF (FOUND AND e.stato NOT IN ('fatta', 'saltata'))
     OR (NOT FOUND AND NOT EXISTS (
       SELECT 1 FROM piano WHERE reparto_dip = p_reparto
          AND data BETWEEN date_trunc('month', v_oggi)::date
                       AND (date_trunc('month', v_oggi) + interval '1 month' - interval '1 day')::date)) THEN
    v_mese := v_corrente;
    v_ritardo := true;
  END IF;
  v_anno := substring(v_mese, 1, 4)::int;
  v_ultimo := extract(day FROM (date_trunc('month', v_oggi) + interval '1 month' - interval '1 day'))::int;
  v_giorno := COALESCE(NULLIF(v_cfg ->> 'giorno', '')::int, 5);
  IF v_giorno <= 0 OR v_giorno > 28 THEN
    v_giorno := v_ultimo; -- 0 = ultimo giorno del mese
  END IF;
  v_soglia := date_trunc('month', v_oggi)::date + (v_giorno - 1);
  IF v_oggi < v_soglia AND NOT v_ritardo THEN
    RETURN json_build_object('esito', 'non_ancora', 'mese', v_mese, 'dal', v_soglia);
  END IF;

  INSERT INTO piano_auto_esecuzioni (reparto_dip, mese, stato, tentativi, iniziata)
  VALUES (p_reparto, v_mese, 'attesa_vacanze', 0, now() - interval '1 day')
  ON CONFLICT (reparto_dip, mese) DO NOTHING;
  SELECT * INTO e FROM piano_auto_esecuzioni WHERE reparto_dip = p_reparto AND mese = v_mese FOR UPDATE;

  IF e.stato IN ('fatta', 'saltata') THEN
    RETURN json_build_object('esito', 'fatta', 'mese', v_mese, 'stato', e.stato);
  END IF;
  IF e.stato = 'in_corso' AND e.scade > now() THEN
    RETURN json_build_object('esito', 'in_corso_altrove', 'mese', v_mese, 'da', e.avviata_da);
  END IF;
  -- una sessione che si e fermata a meta lascia "in_corso" scaduto: si riprende, ma al
  -- massimo 5 volte come dopo un errore (poi serve "Riprova")
  IF e.stato = 'in_corso' AND e.tentativi >= 5 THEN
    UPDATE piano_auto_esecuzioni SET stato = 'errore', token = NULL, scade = NULL,
      esito = jsonb_build_object('errore', 'interrotta 5 volte senza finire') WHERE id = e.id;
    PERFORM _piano_auto_avvisa('Generazione automatica del piano ' || v_mese || ' (' || p_reparto
      || '): interrotta 5 volte senza finire. Usa "Riprova" in Piano > Impostazioni.', true);
    RETURN json_build_object('esito', 'attendi', 'mese', v_mese, 'stato', 'errore');
  END IF;
  -- dopo un errore si riprova ogni 2 ore, al massimo 5 volte (poi serve "Riprova")
  IF e.stato = 'errore' AND (e.tentativi >= 5 OR e.iniziata > now() - interval '2 hours') THEN
    RETURN json_build_object('esito', 'attendi', 'mese', v_mese, 'stato', e.stato);
  END IF;

  -- le vacanze dell anno del mese da generare devono essere importate
  IF NOT EXISTS (
    SELECT 1 FROM piano_vacanze v JOIN collaboratori c ON c.nome = v.collaboratore
     WHERE v.anno = v_anno AND COALESCE(c.attivo, true)
       AND (COALESCE(c.reparto_dip, 'slots') = p_reparto
            OR (',' || lower(replace(COALESCE(c.reparti_extra, ''), ' ', '')) || ',') LIKE ('%,' || p_reparto || ',%'))
  ) THEN
    -- si avvisa una volta sola, la prima volta che si aspetta
    IF e.esito IS NULL THEN
      PERFORM _piano_auto_avvisa('Generazione automatica del piano ' || v_mese || ' (' || p_reparto
        || '): in attesa. Le vacanze ' || v_anno || ' non sono ancora importate (Piano > Vacanze). '
        || 'Appena ci sono, il piano si genera da solo.', true);
    END IF;
    UPDATE piano_auto_esecuzioni SET stato = 'attesa_vacanze', token = NULL, scade = NULL,
      esito = jsonb_build_object('messaggio', 'Vacanze ' || v_anno || ' non ancora importate (Piano > Vacanze)')
     WHERE id = e.id;
    RETURN json_build_object('esito', 'attesa_vacanze', 'mese', v_mese, 'anno', v_anno);
  END IF;

  UPDATE piano_auto_esecuzioni
     SET stato = 'in_corso', token = p_token, avviata_da = v_op, scade = now() + interval '30 minutes',
         iniziata = now(), finita = NULL, tentativi = e.tentativi + 1
   WHERE id = e.id;
  RETURN json_build_object('esito', 'prenotata', 'mese', v_mese, 'ritardo', v_ritardo,
    'minuti', LEAST(GREATEST(COALESCE(NULLIF(v_cfg ->> 'minuti', '')::int, 3), 0), 10));
END;
$function$;

NOTIFY pgrst, 'reload schema';
