-- v364 · GENERAZIONE AUTOMATICA DEL PIANO (Piano > Impostazioni, solo admin)
-- Per ogni settore l amministratore sceglie un giorno del mese (1-28 o l ultimo):
-- da quel giorno in poi il primo PC con il programma aperto genera la bozza del
-- mese dopo. Il database tiene UNA riga per settore e mese: due PC non la fanno
-- mai due volte, e se il PC si accende il giorno dopo la fa lo stesso.
--
-- LASCIAPASSARE: la sessione resta quella dell operatore che ha il programma
-- aperto. Solo mentre la sua sessione tiene la prenotazione (al massimo 30 minuti)
-- il database gli permette in piu le due scritture "a intervallo" della bozza
-- (piano_bulk_upsert e le cancellazioni a intervallo del piano), limitate al mese
-- e al settore prenotati e alle sole celle scritte dal programma (generato=true).
-- Inserimenti a mano, vacanze protette, malattie e altri mesi restano fuori.
--
-- Prima di prenotare il database controlla che le vacanze dell anno siano
-- importate (Piano > Vacanze): se mancano la generazione aspetta e si riprova.
-- Alla fine un avviso (note tra colleghi, mittente "Sistema") va a chi ha il
-- permesso "Genera bozza" (piano_auto_genera, o piano_azioni_auto di prima).
--
-- Corpi di secure_delete e piano_bulk_upsert identici alla 20260891, di
-- upsert_impostazione alla 20260890, piu le righe segnate v364.
-- Riservata all amministratore anche piano_turni_bloccati_nuovi (v365: turni bloccati
-- di partenza dei collaboratori nuovi, per settore).
-- Richiede 20260890 e 20260891.

CREATE TABLE IF NOT EXISTS piano_auto_esecuzioni (
  id          BIGSERIAL PRIMARY KEY,
  reparto_dip TEXT NOT NULL,
  mese        TEXT NOT NULL,                 -- 'YYYY-MM' del piano generato
  stato       TEXT NOT NULL CHECK (stato IN ('in_corso', 'fatta', 'saltata', 'attesa_vacanze', 'errore')),
  avviata_da  TEXT,
  token       TEXT,                          -- sessione che tiene la prenotazione (solo in_corso)
  scade       TIMESTAMPTZ,
  iniziata    TIMESTAMPTZ DEFAULT now(),
  finita      TIMESTAMPTZ,
  tentativi   INT NOT NULL DEFAULT 0,
  esito       JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS piano_auto_esecuzioni_uniq ON piano_auto_esecuzioni (reparto_dip, mese);
CREATE INDEX IF NOT EXISTS piano_auto_esecuzioni_token ON piano_auto_esecuzioni (token) WHERE token IS NOT NULL;
COMMENT ON TABLE piano_auto_esecuzioni IS
  'Generazioni automatiche del piano: una riga per settore e mese. Si legge e si scrive solo con le funzioni piano_auto_*.';
ALTER TABLE piano_auto_esecuzioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON piano_auto_esecuzioni;
CREATE POLICY deny_all_anon ON piano_auto_esecuzioni FOR ALL TO anon USING (false) WITH CHECK (false);

-- il lasciapassare di una sessione: settore e giorni del mese prenotato (vuoto se non c e)
CREATE OR REPLACE FUNCTION public._piano_auto_lasciapassare(p_token text, OUT reparto text, OUT da date, OUT a date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_mese TEXT;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN; END IF;
  SELECT e.reparto_dip, e.mese INTO reparto, v_mese
    FROM piano_auto_esecuzioni e
   WHERE e.token = p_token AND e.stato = 'in_corso' AND e.scade > now()
     AND EXISTS (SELECT 1 FROM operator_sessions s WHERE s.token = p_token AND s.expires_at > now())
   LIMIT 1;
  IF reparto IS NULL THEN RETURN; END IF;
  da := (v_mese || '-01')::date;
  a := (da + interval '1 month' - interval '1 day')::date;
END;
$function$;

-- la configurazione di un settore: {attivo, giorno (1-28, 0 = ultimo del mese), minuti}
CREATE OR REPLACE FUNCTION public._piano_auto_config(p_reparto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v JSONB;
BEGIN
  BEGIN
    SELECT valore::jsonb -> p_reparto INTO v FROM impostazioni WHERE chiave = 'piano_auto_generazione';
  EXCEPTION WHEN others THEN
    v := NULL;
  END;
  RETURN v;
END;
$function$;

-- STATO (per la scheda in Impostazioni e per il controllo del programma): la
-- configurazione, il mese che tocca oggi e le ultime esecuzioni. Lo legge ogni
-- sessione valida: non contiene dati personali.
CREATE OR REPLACE FUNCTION public.piano_auto_stato(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_cfg JSONB;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'piano_auto_generazione';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  RETURN json_build_object(
    'oggi', v_oggi,
    'mese_prossimo', to_char(v_oggi + interval '1 month', 'YYYY-MM'),
    'config', COALESCE(v_cfg, '{}'::jsonb),
    'esecuzioni', COALESCE((SELECT json_agg(x ORDER BY x.mese DESC, x.reparto_dip) FROM (
        SELECT reparto_dip, mese, stato, avviata_da, iniziata, finita, tentativi, esito,
               (stato = 'in_corso' AND scade > now()) AS attiva
          FROM piano_auto_esecuzioni
         WHERE mese >= to_char(v_oggi - interval '6 months', 'YYYY-MM')) x), '[]'::json)
  );
END;
$function$;

-- AVVISO a chi ha il permesso "Genera bozza" (voce nuova se c e, altrimenti
-- quella di prima): una nota tra colleghi con mittente "Sistema"
CREATE OR REPLACE FUNCTION public._piano_auto_avvisa(p_msg text, p_importante boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_vis JSONB;
  v JSONB;
  n INT := 0;
  d TEXT;
BEGIN
  BEGIN
    SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  EXCEPTION WHEN others THEN
    v_vis := NULL;
  END;
  v := CASE WHEN v_vis ? 'piano_auto_genera' THEN v_vis -> 'piano_auto_genera' ELSE v_vis -> 'piano_azioni_auto' END;
  IF v IS NULL OR jsonb_typeof(v) <> 'object' OR v ->> 'tipo' <> 'selezionati' THEN
    RETURN 0;
  END IF;
  FOR d IN SELECT jsonb_array_elements_text(v -> 'operatori') LOOP
    INSERT INTO note_colleghi (da_operatore, a_operatore, messaggio, letta, importante)
    VALUES ('Sistema', d, left(p_msg, 3000), false, p_importante);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

-- PRENOTA: chiamata dal programma all avvio e ogni mezz ora. Decide se oggi tocca
-- generare il mese dopo per quel settore e, se si, lo prenota per questa sessione
-- (una sola alla volta: la riga si blocca durante la decisione).
-- esiti: spenta, non_ancora, fatta, in_corso_altrove, attendi, attesa_vacanze, prenotata
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
  v_anno := substring(v_mese, 1, 4)::int;
  v_ultimo := extract(day FROM (date_trunc('month', v_oggi) + interval '1 month' - interval '1 day'))::int;
  v_giorno := COALESCE(NULLIF(v_cfg ->> 'giorno', '')::int, 5);
  IF v_giorno <= 0 OR v_giorno > 28 THEN
    v_giorno := v_ultimo; -- 0 = ultimo giorno del mese
  END IF;
  v_soglia := date_trunc('month', v_oggi)::date + (v_giorno - 1);
  IF v_oggi < v_soglia THEN
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
  RETURN json_build_object('esito', 'prenotata', 'mese', v_mese,
    'minuti', LEAST(GREATEST(COALESCE(NULLIF(v_cfg ->> 'minuti', '')::int, 3), 0), 10));
END;
$function$;

-- CHIUDI: solo la sessione che tiene la prenotazione. Toglie il lasciapassare,
-- salva il risultato e manda l avviso a chi ha il permesso "Genera bozza".
-- p_stato: fatta | saltata | errore
CREATE OR REPLACE FUNCTION public.piano_auto_chiudi(p_token text, p_reparto text, p_mese text, p_stato text, p_esito jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_id BIGINT;
  v_n INT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_stato NOT IN ('fatta', 'saltata', 'errore') THEN
    RAISE EXCEPTION 'Stato non valido: %', p_stato;
  END IF;
  SELECT id INTO v_id FROM piano_auto_esecuzioni
   WHERE reparto_dip = p_reparto AND mese = p_mese AND stato = 'in_corso' AND token = p_token
   FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna generazione automatica prenotata da questa sessione';
  END IF;
  UPDATE piano_auto_esecuzioni
     SET stato = p_stato, token = NULL, scade = NULL, finita = now(), esito = p_esito
   WHERE id = v_id;

  v_n := _piano_auto_avvisa(COALESCE(p_esito ->> 'messaggio',
    'Generazione automatica del piano ' || p_mese || ' (' || p_reparto || '): ' || p_stato), p_stato <> 'fatta');
  RETURN json_build_object('success', true, 'avvisati', v_n);
END;
$function$;

-- RIPROVA: rimette da fare la generazione di un mese (dopo un errore, o per
-- rigenerarla). Amministratore o chi ha "Genera bozza"; mai mentre e in corso.
CREATE OR REPLACE FUNCTION public.piano_auto_riprova(p_token text, p_reparto text, p_mese text)
 RETURNS json
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
  IF NOT _permesso_piano_auto(p_token, 'piano_auto_genera') THEN
    RAISE EXCEPTION 'Permesso mancante: genera bozza';
  END IF;
  DELETE FROM piano_auto_esecuzioni
   WHERE reparto_dip = p_reparto AND mese = p_mese AND NOT (stato = 'in_corso' AND scade > now());
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_ambito TEXT := '';
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
      -- v364: generazione automatica in corso da questa sessione = lasciapassare
      -- limitato al mese e al settore prenotati, e solo celle scritte dal programma
      SELECT l.reparto, l.da, l.a INTO v_rep, v_da, v_a FROM _piano_auto_lasciapassare(p_token) l;
      IF v_rep IS NULL THEN
        RAISE EXCEPTION 'Permesso mancante: azioni automatiche del piano';
      END IF;
      v_ambito := ' AND data BETWEEN ' || quote_literal(v_da) || ' AND ' || quote_literal(v_a)
        || ' AND reparto_dip = ' || quote_literal(v_rep) || ' AND generato = true';
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

  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
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
                       ora_inizio, ora_fine, colore, motivo_blocco)
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
      NULLIF(r->>'motivo_blocco', '')
    )
    ON CONFLICT (collaboratore, data) DO NOTHING;
    IF FOUND THEN v_ins := v_ins + 1; END IF;
  END LOOP;

  RETURN json_build_object('inserite', v_ins);
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF p_chiave IN (
    'password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key', 'groq_modelli',
    'ai_fornitori', 'ai_fornitore_attivo', 'ai_fornitore_riserva', 'reparti_nomi_documenti',
    'visibilita', 'profili_operatori', 'profili_custom', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'valutatori_config', 'moduli_responsabili',
    'conservazione_anni', 'conservazione_giorni_grazia', 'backup_auto_giorni',
    'tipi_personalizzati', 'tipi_nascosti', 'tipi_ordine', 'tipi_rinominati', 'colori_override',
    'campi_label_override', 'campi_nascosti', 'campi_ordine', 'campi_rapporto_extra', 'campi_rapporto_reparti',
    'buono_valori', 'inventario_categorie_extra',
    'piano_cd_config', 'piano_pause_cfg', 'piano_funzioni', 'piano_ore_settimanali', 'piano_max_cambi_mese',
    'piano_giorni_weekend', 'piano_giorni_formazione', 'piano_corsi_lista', 'piano_competenze_gruppi',
    'piano_solver_url', 'maison_auto_delete_giorni', 'piano_organico_attivo', 'piano_organico_costi',
    'piano_auto_generazione', 'piano_turni_bloccati_nuovi'
  ) THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  -- orari dei corsi: chi gestisce il piano o i corsi
  IF p_chiave = 'piano_corsi_orari' AND NOT (COALESCE(v_admin, false)
       OR _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_corsi')) THEN
    RAISE EXCEPTION 'Permesso mancante: corsi';
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';
