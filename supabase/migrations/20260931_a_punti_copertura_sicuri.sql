-- 23/10/2026 · PUNTI DI COPERTURA E SCRITTURE DEGLI OPERATORI (riverifica C, C-N1 e C-N3)
-- Un operatore senza Punti e premi accreditava punti di copertura senza limite con chiamate
-- REST dirette: sceglieva created_at (aggirando "al massimo 5 in 24 ore") e spostava rif_data
-- (bastava un assenza nel mese dopo: una vera assenza di 3 giorni dava 6+ coperture).
--   secure_insert: per chi non e amministratore, created_at / updated_at / creato_il /
--     modificato_il li da il database su tutte le tabelle; letto_da (consegne) e
--     modificato_da (registrazioni, moduli) non si scrivono creando la riga; eliminato_da e
--     chi e collegato; un numero di riga si accetta solo se gia dato dal database (Annulla),
--     altrimenti si ignora (le registrazioni del Diario restano numerate dal programma).
--   _controlla_permessi_scrittura (punti senza Punti e premi):
--     rif_data deve essere il PRIMO giorno vero dell assenza (piano: M/M1/ASS/I quel giorno e
--     non il giorno prima; oppure registrazione del Diario che comincia quel giorno);
--     coperture e rifiuti per la stessa assenza al massimo quante le sue giornate (min. 2);
--     incentivi spenti (tutti o l azione) = nessun punto (C-N3).
-- Idempotente: si puo applicare piu volte. Dopo 20260930_c_unisci_collaboratori.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.secure_insert(p_token text, p_table text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_cols TEXT := '';
  v_vals TEXT := '';
  v_key TEXT;
  v_val JSONB;
  v_sopra TEXT := '';
  v_sempre BOOLEAN;
  v_seq TEXT;
  v_ultimo BIGINT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF p_table = 'impostazioni' AND NOT v_admin THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;
  -- 20260911: password e codice di recupero solo con le loro funzioni (anche l amministratore)
  IF p_table = 'impostazioni' AND (p_data ->> 'chiave') IN ('password_hash', 'password_hash_v2', 'recovery_code') THEN
    RAISE EXCEPTION 'Password: si cambia solo con la funzione apposita';
  END IF;
  IF jsonb_typeof(COALESCE(p_data, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Dati non validi';
  END IF;

  -- v434: l autore e sempre chi e collegato (prima si poteva scrivere a nome di un collega)
  IF NOT v_admin THEN
    IF p_table IN ('chat_messages', 'note_colleghi') THEN
      p_data := jsonb_set(p_data, '{da_operatore}', to_jsonb(v_op));
    -- 20260911: letture, messaggi nascosti e notifiche sono sempre di chi e collegato
    ELSIF p_table IN ('chat_message_letti', 'chat_message_hidden', 'push_subscriptions') THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
    ELSIF p_table = 'chat_groups' THEN
      p_data := jsonb_set(p_data, '{creato_da}', to_jsonb(v_op));
    -- 20260913: autore = chi e collegato dove il programma scrive sempre getOperatore()
    -- (promemoria.creato_da resta libero: la ripetizione ricrea quello del collega)
    ELSIF p_table IN ('registrazioni', 'moduli', 'rapporti_giornalieri', 'consegne_turno', 'punti_eventi',
                      'hr_eventi', 'hr_allegati', 'inventario', 'costi_maison', 'spese_extra', 'regali_maison',
                      'note_clienti', 'collab_congedi_np', 'piano', 'piano_vacanze', 'piano_timbrature',
                      'piano_briefing', 'piano_festivita', 'piano_formulari', 'piano_ore_mese',
                      'piano_recupero_ore', 'piano_saldo_iniziale', 'piano_cgf_riporto') THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
    END IF;
  END IF;

  -- 20260931 (C-N1): per chi non e amministratore il database da le date di creazione e di
  -- modifica su TUTTE le tabelle (prima solo nel Registro): un created_at scelto da chi scrive
  -- aggirava i limiti "nelle ultime 24 ore" (punti di copertura senza fine). Chi ha letto una
  -- consegna e chi ha modificato una registrazione o un modulo non si scrivono creando la riga.
  -- Il numero di riga: solo uno gia dato dal database (Annulla / Ripristina ricreano la riga
  -- con il suo numero); un numero oltre l ultimo dato si ignora (prima bloccava con una chiave
  -- doppia le scritture seguenti). Le registrazioni del Diario restano numerate dal programma.
  IF NOT v_admin THEN
    p_data := p_data - 'created_at' - 'updated_at' - 'creato_il' - 'modificato_il';
    IF p_table = 'consegne_turno' THEN
      p_data := p_data - 'letto_da' - 'letto_at';
    ELSIF p_table IN ('registrazioni', 'moduli') THEN
      p_data := p_data - 'modificato_da';
    END IF;
    IF p_table IN ('registrazioni', 'moduli', 'valutazioni', 'maison_budget')
       AND COALESCE(p_data ->> 'eliminato_da', '') <> '' THEN
      p_data := jsonb_set(p_data, '{eliminato_da}', to_jsonb(v_op));
    END IF;
    IF p_data ? 'id' AND p_table <> 'registrazioni' THEN
      v_seq := pg_get_serial_sequence(quote_ident(p_table), 'id');
      IF v_seq IS NULL OR jsonb_typeof(p_data -> 'id') NOT IN ('number', 'string')
         OR NOT ((p_data ->> 'id') ~ '^[0-9]+$') THEN
        p_data := p_data - 'id';
      ELSE
        EXECUTE 'SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ' || v_seq INTO v_ultimo;
        IF (p_data ->> 'id')::numeric < 1 OR (p_data ->> 'id')::numeric > v_ultimo THEN
          p_data := p_data - 'id';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 20260928 (C4): il Registro attivita lo scrive il server: autore = chi e collegato (anche
  -- senza la chiave "operatore", che prima restava vuota) e ora = adesso, per tutti
  -- (amministratore compreso); il numero lo da il database
  IF p_table = 'log_attivita' THEN
    p_data := jsonb_set(p_data - 'id' - 'created_at', '{operatore}', to_jsonb(v_op));
  END IF;
  -- 20260928 (C3): i punti automatici (copertura, cambio turno, rifiuto) scritti senza Punti e
  -- premi hanno la data di oggi (il fatto a cui si riferiscono e in rif_assente / rif_data)
  IF NOT v_admin AND p_table = 'punti_eventi'
     AND COALESCE(p_data ->> 'azione', '') IN ('copertura', 'cambio_turno', 'disponibilita_negata')
     AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    p_data := jsonb_set(p_data, '{data_evento}', to_jsonb((now() AT TIME ZONE 'Europe/Zurich')::date));
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'insert', p_data);

  IF p_table NOT IN (
    'registrazioni', 'note_fissate', 'scadenze', 'note_colleghi',
    'collaboratori', 'moduli', 'log_attivita', 'costi_maison',
    'maison_budget', 'promemoria', 'consegne_turno', 'spese_extra',
    'regali_maison', 'note_clienti', 'rapporti_giornalieri',
    'impostazioni', 'push_subscriptions', 'inventario',
    'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_letti', 'chat_message_hidden',
    'valutazioni', 'punti_eventi', 'hr_eventi', 'hr_allegati',
    'piano', 'piano_turni', 'piano_codici', 'piano_fabbisogni', 'piano_regole', 'piano_festivi', 'piano_timbrature', 'piano_mappature', 'piano_vacanze', 'piano_regole_gruppo', 'piano_formulari', 'piano_briefing', 'collab_congedi_np', 'piano_cgf_riporto', 'piano_saldo_iniziale', 'piano_recupero_ore', 'piano_festivita', 'piano_ore_mese'
  ) THEN
    RAISE EXCEPTION 'Tabella non consentita: %', p_table;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_cols != '' THEN v_cols := v_cols || ', '; v_vals := v_vals || ', '; END IF;
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

  -- 20260913: il piano passa dal controllo delle scritture del Diario (trigger)
  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  -- 20260919 RIGA RICREATA CON IL SUO NUMERO (Annulla di un eliminazione, Ripristina di
  -- un aggiunta): nelle tabelle con il numero "generated always" (storico HR, allegati HR,
  -- inventario, tabelle del piano) l inserimento con l id dava "cannot insert a non-DEFAULT
  -- value into column id" e la riga non tornava. Si accetta solo un numero GIA DATO dal
  -- database (non oltre l ultimo della sua sequenza): cosi i numeri futuri non si scontrano;
  -- una riga che esiste ancora con lo stesso numero la ferma la chiave primaria.
  IF p_data ? 'id' THEN
    SELECT a.attidentity = 'a' INTO v_sempre
      FROM pg_attribute a
     WHERE a.attrelid = quote_ident(p_table)::regclass AND a.attname = 'id' AND NOT a.attisdropped;
    IF COALESCE(v_sempre, false) THEN
      IF jsonb_typeof(p_data -> 'id') <> 'number' AND NOT ((p_data ->> 'id') ~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'Numero di riga non valido';
      END IF;
      v_seq := pg_get_serial_sequence(quote_ident(p_table), 'id');
      EXECUTE 'SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ' || v_seq INTO v_ultimo;
      IF (p_data ->> 'id')::bigint < 1 OR (p_data ->> 'id')::bigint > v_ultimo THEN
        RAISE EXCEPTION 'Numero di riga non valido: si ricrea solo una riga che esisteva';
      END IF;
      v_sopra := ' OVERRIDING SYSTEM VALUE';
    END IF;
  END IF;
  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ')' || v_sopra || ' VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_admin BOOLEAN := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  v_op TEXT := (SELECT operatore FROM operator_sessions WHERE token = p_token LIMIT 1);
  v_rep TEXT;
  v_set TEXT[];
  v_gid BIGINT;
  v_az TEXT;
  v_pt NUMERIC;
  v_cfg JSONB;
  v_conf NUMERIC;
  v_n INT;
  v_tipo TEXT;
  v_desc TEXT;
  v_comp BOOLEAN;
  v_ass TEXT;
  v_rdata DATE;
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_vero BOOLEAN;
  v_max INT;
  v_giorni INT;
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
  END IF;
  -- 20260911: tabelle con il Cestino: la cancellazione definitiva e dell amministratore
  IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'delete' THEN
    RAISE EXCEPTION 'Eliminazione definitiva riservata all amministratore: si usa il Cestino';
  END IF;
  IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN
    RAISE EXCEPTION 'Numero, data di creazione e autore non si modificano';
  END IF;
  -- 20260911: Diario per settore (nuove registrazioni nei propri settori)
  IF p_table = 'registrazioni' AND p_azione = 'insert' THEN
    v_set := _settori_operatore(p_token, false);
    IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
      RAISE EXCEPTION 'Settore non tuo: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
    END IF;
  END IF;
  -- 20260926: inventario per settore: movimenti nuovi (anche ricreati da Annulla) e
  -- spostati solo nei settori dove l operatore scrive
  IF p_table = 'inventario' AND (p_azione = 'insert' OR (p_azione = 'update' AND p_data ? 'reparto_dip')) THEN
    v_set := _settori_operatore(p_token, true);
    IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
      RAISE EXCEPTION 'Inventario di un altro settore: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
    END IF;
  END IF;
  -- 20260911: pagine
  IF p_table = 'consegne_turno' AND NOT _pagina_visibile(p_token, 'consegna') THEN
    -- chi riceve una consegna la segna letta anche senza la pagina (avviso all accesso)
    IF NOT (p_azione = 'update' AND p_data IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN ('letto_da', 'letto_at'))
            AND COALESCE(p_data ->> 'letto_da', v_op) = v_op) THEN
      RAISE EXCEPTION 'Permesso mancante: Consegna turno';
    END IF;
  END IF;
  IF p_table IN ('costi_maison', 'spese_extra', 'regali_maison', 'note_clienti', 'maison_budget')
     AND NOT _pagina_visibile(p_token, 'maison') THEN
    RAISE EXCEPTION 'Permesso mancante: Maison';
  END IF;
  -- 20260913: il Rapporto lo scrive solo chi ha la pagina Rapporto (il programma scrive con
  -- secure_insert / secure_update, non con upsert_rapporto)
  IF p_table = 'rapporti_giornalieri' AND NOT _pagina_visibile(p_token, 'rapporto') THEN
    RAISE EXCEPTION 'Permesso mancante: Rapporto';
  END IF;
  -- 20260911: punti incentivo
  IF p_table = 'punti_eventi' AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    IF p_azione = 'update' THEN
      RAISE EXCEPTION 'Permesso mancante: punti e premi';
    END IF;
    IF p_azione = 'insert' THEN
      v_az := COALESCE(p_data ->> 'azione', '');
      BEGIN
        v_pt := (p_data ->> 'punti')::numeric;
        SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END;
      -- 20260931 (C-N3): incentivi spenti dalla direzione (tutti o quell azione): nessun punto
      -- da chi non ha Punti e premi, come fa il programma (incentiviAttivi)
      IF COALESCE(v_cfg ->> 'attivo', 'true') = 'false' OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg -> 'azioni') = 'array' THEN v_cfg -> 'azioni' ELSE '[]'::jsonb END) a
            WHERE a ->> 'key' = v_az AND COALESCE(a ->> 'attiva', 'true') = 'false') THEN
        RAISE EXCEPTION 'Permesso mancante: incentivi spenti, nessun punto "%" (Punti e premi)', v_az;
      END IF;
      IF v_az ~ '^livello_[0-9]+$' THEN
        -- 20260928 (C15): valori propri del settore (per_settore.<settore>.punti_livello) prima
        -- dei valori di tutti i settori, come puntiLivelloDi nel programma; vale il settore della
        -- riga o quello del collaboratore
        SELECT NULLIF(v_cfg -> 'per_settore' -> s.rep -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric
          INTO v_conf
          FROM (SELECT lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) AS rep, 1 AS o
                UNION ALL
                SELECT lower(COALESCE(c.reparto_dip, 'slots')), 2 FROM collaboratori c
                 WHERE lower(c.nome) = lower(p_data ->> 'collaboratore')) s
         WHERE v_cfg -> 'per_settore' -> s.rep -> 'punti_livello' ? substring(v_az FROM 9)
           AND NULLIF(v_cfg -> 'per_settore' -> s.rep -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric = v_pt
         ORDER BY s.o LIMIT 1;
        IF v_conf IS NULL THEN
          v_conf := NULLIF(v_cfg -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric;
        END IF;
      ELSE
        SELECT NULLIF(a ->> 'punti', '')::numeric INTO v_conf
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg -> 'azioni') = 'array' THEN v_cfg -> 'azioni' ELSE '[]'::jsonb END) a
         WHERE a ->> 'key' = v_az LIMIT 1;
      END IF;
      IF v_conf IS NULL OR v_pt IS DISTINCT FROM v_conf THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi (solo gli incentivi configurati)';
      END IF;
      IF v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata') THEN
        -- popup della copertura dopo una malattia (o del cambio turno): chiunque, ma (20260913)
        -- con un motivo, una volta sola per collaboratore + azione + motivo e al massimo 5 in
        -- 24 ore; 20260928 (C3): legato a un fatto VERO, scritto nella riga
        --   rif_assente + rif_data = chi era assente (o a chi e cambiato il turno) e da quando;
        --   copertura / rifiuto: malattia o assenza di quella persona nel piano (M, M1, ASS, I)
        --     nel mese dopo rif_data, oppure registrata nel Diario quel giorno;
        --   cambio turno / rifiuto del cambio: la cella di quella persona in quel giorno
        --     cambiata nel piano negli ultimi 7 giorni (storico del piano);
        --   una volta sola per collaboratore + azione + assenza, chi copre non e l assente,
        --   coperture per la stessa assenza al massimo quante sono le giornate (min. 2);
        --   rif_data negli ultimi 92 giorni (fino a 31 nel futuro).
        -- Il doppio accredito consapevole e i punti senza un fatto li da chi ha Punti e premi.
        IF btrim(COALESCE(p_data ->> 'descrizione', '')) = '' THEN
          RAISE EXCEPTION 'Permesso mancante: punti automatici senza motivo (Punti e premi)';
        END IF;
        v_ass := NULLIF(btrim(COALESCE(p_data ->> 'rif_assente', '')), '');
        BEGIN
          v_rdata := NULLIF(p_data ->> 'rif_data', '')::date;
        EXCEPTION WHEN others THEN
          v_rdata := NULL;
        END;
        IF v_ass IS NULL OR v_rdata IS NULL THEN
          RAISE EXCEPTION 'Permesso mancante: punti "%" senza l assenza o il cambio a cui si riferiscono (Punti e premi)', v_az;
        END IF;
        IF v_rdata < v_oggi - 92 OR v_rdata > v_oggi + 31 THEN
          RAISE EXCEPTION 'Permesso mancante: punti "%" per un fatto del % (troppo lontano: Punti e premi)', v_az, to_char(v_rdata, 'DD.MM.YYYY');
        END IF;
        IF v_az = 'copertura' AND lower(v_ass) = lower(COALESCE(p_data ->> 'collaboratore', '')) THEN
          RAISE EXCEPTION 'Permesso mancante: chi era assente non riceve i punti della copertura';
        END IF;
        v_vero := false;
        v_n := 0;
        IF v_az IN ('copertura', 'disponibilita_negata') THEN
          -- 20260931 (C-N1): rif_data = il PRIMO giorno vero dell assenza (prima bastava
          -- un assenza nel mese dopo rif_data: spostando la data la stessa assenza dava punti
          -- senza fine). Nel piano: M, M1, ASS o I quel giorno e non il giorno prima; le
          -- giornate sono le celle di fila fino al primo turno con un altro codice.
          IF EXISTS (SELECT 1 FROM piano WHERE lower(collaboratore) = lower(v_ass) AND data = v_rdata
                        AND upper(codice) IN ('M', 'M1', 'ASS', 'I'))
             AND NOT EXISTS (SELECT 1 FROM piano WHERE lower(collaboratore) = lower(v_ass) AND data = v_rdata - 1
                                AND upper(codice) IN ('M', 'M1', 'ASS', 'I')) THEN
            v_vero := true;
            SELECT count(*) INTO v_n FROM piano p
             WHERE lower(p.collaboratore) = lower(v_ass) AND upper(p.codice) IN ('M', 'M1', 'ASS', 'I')
               AND p.data >= v_rdata
               AND p.data < COALESCE((SELECT min(q.data) FROM piano q
                                       WHERE lower(q.collaboratore) = lower(v_ass) AND q.data > v_rdata
                                         AND btrim(COALESCE(q.codice, '')) <> ''
                                         AND upper(q.codice) NOT IN ('M', 'M1', 'ASS', 'I')), v_rdata + 32);
          END IF;
          -- nel Diario: malattia, assenza o infortunio che COMINCIA quel giorno ("dal ..." nel
          -- testo, altrimenti il giorno della registrazione); giornate dal ... al ...
          BEGIN
            SELECT max(x.al - x.dal + 1) INTO v_giorni FROM (
              SELECT COALESCE(make_date(t.md[3]::int, t.md[2]::int, t.md[1]::int), (r.data AT TIME ZONE 'Europe/Zurich')::date) AS dal,
                     COALESCE(make_date(t.ma[3]::int, t.ma[2]::int, t.ma[1]::int),
                              make_date(t.md[3]::int, t.md[2]::int, t.md[1]::int), (r.data AT TIME ZONE 'Europe/Zurich')::date) AS al
                FROM registrazioni r
                CROSS JOIN LATERAL (SELECT regexp_match(COALESCE(r.testo, ''), '\mdal (\d{1,2})/(\d{1,2})/(\d{4})') AS md,
                                           regexp_match(COALESCE(r.testo, ''), '\mal (\d{1,2})/(\d{1,2})/(\d{4})') AS ma) t
               WHERE lower(r.nome) = lower(v_ass) AND r.eliminato IS NOT TRUE
                 AND (lower(r.tipo) LIKE '%malatt%' OR lower(r.tipo) LIKE '%assenz%' OR lower(r.tipo) LIKE '%infortun%')) x
             WHERE x.dal = v_rdata AND x.al >= x.dal;
          EXCEPTION WHEN others THEN
            v_giorni := NULL;
          END;
          IF v_giorni IS NOT NULL THEN
            v_vero := true;
            v_n := GREATEST(v_n, LEAST(v_giorni, 92));
          END IF;
        END IF;
        IF NOT v_vero AND v_az IN ('cambio_turno', 'disponibilita_negata') THEN
          v_vero := EXISTS (SELECT 1 FROM piano_storico
                             WHERE lower(collaboratore) = lower(v_ass) AND data = v_rdata
                               AND quando > now() - interval '7 days');
        END IF;
        IF NOT v_vero THEN
          RAISE EXCEPTION 'Permesso mancante: nessuna assenza di % che comincia il % e nessun suo cambio turno quel giorno (i punti senza un fatto li da chi ha Punti e premi)',
            v_ass, to_char(v_rdata, 'DD.MM.YYYY');
        END IF;
        IF EXISTS (SELECT 1 FROM punti_eventi
                    WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
                      AND lower(rif_assente) = lower(v_ass) AND rif_data = v_rdata) THEN
          RAISE EXCEPTION 'Permesso mancante: punti "%" gia assegnati a % per lo stesso fatto (il secondo accredito lo fa chi ha Punti e premi)',
            v_az, p_data ->> 'collaboratore';
        END IF;
        -- 20260931 (C-N1): coperture (e rifiuti) per la stessa assenza al massimo quante sono
        -- le sue giornate (min. 2): rif_data e il primo giorno, quindi il conto e per assenza
        IF v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata') THEN
          v_max := GREATEST(COALESCE(v_n, 0), 2);
          SELECT count(*) INTO v_n FROM punti_eventi
           WHERE azione = v_az AND lower(rif_assente) = lower(v_ass) AND rif_data = v_rdata;
          IF v_n >= v_max THEN
            RAISE EXCEPTION 'Permesso mancante: gia % punti "%" per l assenza di % del % (Punti e premi)', v_n, v_az, v_ass, to_char(v_rdata, 'DD.MM.YYYY');
          END IF;
        END IF;
        IF EXISTS (SELECT 1 FROM punti_eventi
                    WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
                      AND btrim(COALESCE(descrizione, '')) = btrim(p_data ->> 'descrizione')) THEN
          RAISE EXCEPTION 'Permesso mancante: punti gia assegnati per lo stesso motivo (il secondo accredito lo fa chi ha Punti e premi)';
        END IF;
        SELECT count(*) INTO v_n FROM punti_eventi
         WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
           AND created_at > now() - interval '24 hours';
        IF v_n >= 5 THEN
          RAISE EXCEPTION 'Permesso mancante: troppi punti "%" a % nelle ultime 24 ore (Punti e premi)', v_az, p_data ->> 'collaboratore';
        END IF;
      ELSIF v_az = 'competenza' OR v_az ~ '^livello_[0-9]+$' THEN
        IF NOT (_sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
          RAISE EXCEPTION 'Permesso mancante: competenze';
        END IF;
      ELSIF v_az IN ('sessione_formativa', 'formatore') THEN
        IF NOT (_sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
          RAISE EXCEPTION 'Permesso mancante: formazioni';
        END IF;
      ELSE
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END IF;
    END IF;
  END IF;
  -- v359: il fabbisogno lo vedono tutti, lo scrive solo chi ha il permesso
  IF p_table = 'piano_fabbisogni' AND NOT _permesso_piano_auto(p_token, 'piano_fabbisogno') THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il fabbisogno';
  END IF;
  IF p_table = 'valutazioni' AND NOT _sessione_permesso(p_token, 'gestione_valutazioni') THEN
    RAISE EXCEPTION 'Permesso mancante: valutazioni';
  END IF;
  IF p_table = 'collab_congedi_np' AND NOT _hr_modifica(p_token) THEN
    RAISE EXCEPTION 'Permesso mancante: congedi non pagati (Storico HR, modificare)';
  END IF;
  IF p_table = 'hr_eventi' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Eventi HR: si eliminano solo come amministratore';
    ELSIF p_azione = 'update' AND NOT _hr_modifica(p_token) THEN
      RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare)';
    ELSIF p_azione = 'insert' AND NOT _hr_modifica(p_token) THEN
      -- 20260928 (C1): lo Storico HR lo scrive chi ha "Storico HR, modificare"; senza, solo le
      -- righe che il programma aggiunge da solo nei flussi con il loro permesso:
      --   formazione, livello: Competenze, Formazioni o Piano > formazioni;
      --   premio: Punti e premi;  categoria: Categorie;
      --   impiego: Impiego (o la proposta di contratto fisso dopo l ultimo livello, Competenze);
      --   nota: la percentuale d impiego (Impiego).
      -- Nel proprio settore (come il Diario).
      v_tipo := COALESCE(p_data ->> 'tipo', '');
      v_desc := COALESCE(p_data ->> 'descrizione', '');
      v_comp := _sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                OR _permesso_piano_auto(p_token, 'piano_formazioni');
      IF NOT ((v_tipo IN ('formazione', 'livello') AND v_comp)
              OR (v_tipo = 'premio' AND _sessione_permesso(p_token, 'gestione_punti'))
              OR (v_tipo = 'categoria' AND _sessione_permesso(p_token, 'gestione_categorie'))
              OR (v_tipo = 'impiego' AND (_sessione_permesso(p_token, 'gestione_impiego')
                                          OR (v_comp AND v_desc LIKE 'Tutti i livelli completati%')))
              OR (v_tipo = 'nota' AND _sessione_permesso(p_token, 'gestione_impiego') AND v_desc LIKE 'Percentuale impiego:%')) THEN
        RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare) per una riga "%"', v_tipo;
      END IF;
      v_set := _settori_operatore(p_token, false);
      IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Settore non tuo: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
      END IF;
    END IF;
  END IF;
  IF p_table = 'hr_allegati' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Allegati HR: si eliminano solo come amministratore';
    ELSIF NOT (_hr_modifica(p_token) OR _sessione_permesso(p_token, 'gestione_formazioni')) THEN
      RAISE EXCEPTION 'Permesso mancante: allegati HR';
    END IF;
  END IF;

  -- v434: COLLABORATORI
  IF p_table = 'collaboratori' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Collaboratori: si eliminano solo come amministratore';
    END IF;
    -- 20260911: un operatore crea collaboratori nei propri settori, con i soli dati che il
    -- programma scrive alla creazione (Diario, moduli, formazioni, turni orfani, import)
    IF p_azione = 'insert' THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(COALESCE(p_data, '{}'::jsonb)) k
                  WHERE k NOT IN ('nome', 'attivo', 'reparto_dip', 'percentuale', 'funzione', 'is_jolly', 'turni_bloccati')) THEN
        RAISE EXCEPTION 'Collaboratore nuovo: dati riservati all amministratore';
      END IF;
      IF COALESCE(p_data ->> 'attivo', 'true') <> 'true' THEN
        RAISE EXCEPTION 'Collaboratore nuovo: solo attivo';
      END IF;
      v_set := _settori_operatore(p_token, false);
      IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Settore non tuo: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
      END IF;
      -- 20260928 (C20): funzione, percentuale diversa da 100% e Jolly alla creazione solo con
      -- Impiego (o Storico HR modificare) oppure nei flussi del piano che li leggono dal file
      -- o dal corso (Importare il piano da file, Piano > formazioni); RESP e SOSTRESP solo
      -- con Impiego. La percentuale e tra 0 e 1 (1 = 100%) per tutti: vincolo della tabella.
      IF NOT (_sessione_permesso(p_token, 'gestione_impiego') OR _hr_modifica(p_token)) THEN
        IF upper(COALESCE(p_data ->> 'funzione', '')) IN ('RESP', 'SOSTRESP') THEN
          RAISE EXCEPTION 'Permesso mancante: funzione % (Impiego)', upper(p_data ->> 'funzione');
        END IF;
        IF (COALESCE(p_data ->> 'funzione', '') <> '' OR COALESCE(p_data ->> 'is_jolly', 'false') = 'true'
            OR COALESCE(NULLIF(p_data ->> 'percentuale', '')::numeric, 1) <> 1)
           AND NOT (_permesso_piano_auto(p_token, 'piano_auto_import') OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
          RAISE EXCEPTION 'Permesso mancante: funzione, percentuale e Jolly del collaboratore nuovo (Impiego)';
        END IF;
      END IF;
    END IF;
    IF p_data IS NOT NULL THEN
      IF ((p_azione = 'update' AND p_data ?| ARRAY['data_assunzione', 'data_fine_rapporto', 'mesi_congedo_non_pagato', 'data_nascita'])
          OR (p_azione = 'insert' AND (
                COALESCE(p_data -> 'data_assunzione', 'null'::jsonb) <> 'null'::jsonb
             OR COALESCE(p_data -> 'data_fine_rapporto', 'null'::jsonb) <> 'null'::jsonb
             OR COALESCE(p_data -> 'data_nascita', 'null'::jsonb) <> 'null'::jsonb)))
         AND NOT _hr_modifica(p_token) THEN
        RAISE EXCEPTION 'Permesso mancante: dati del contratto e data di nascita (Storico HR, modificare)';
      END IF;
      IF p_data ? 'categoria' AND NOT (_sessione_permesso(p_token, 'gestione_categorie') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: categorie';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['funzione', 'percentuale', 'lingue', 'impiego', 'is_jolly']
         AND NOT (_sessione_permesso(p_token, 'gestione_impiego') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: impiego (funzione, percentuale, lingue, Jolly/Fisso)';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['nome', 'reparto_dip', 'reparti_extra', 'copertura_reparti', 'attivo', 'id', 'created_at'] THEN
        RAISE EXCEPTION 'Nome, settore, coperture e attivo: solo amministratore';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['competenze', 'livello']
         AND NOT (_sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                  OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
        RAISE EXCEPTION 'Permesso mancante: competenze';
      END IF;
      IF p_azione = 'update' AND p_data ?| ARRAY['solo_diurni', 'solo_notti', 'turni_solo_a_mano', 'turni_bloccati',
           'turni_consentiti', 'prefers_l1', 'accoglienza', 'accompagnamento_settori', 'giorni_lavoro',
           'giorni_settimana', 'settori_piano']
         AND NOT (_sessione_permesso(p_token, 'gestione_piano') OR _hr_modifica(p_token)) THEN
        RAISE EXCEPTION 'Permesso mancante: preferenze del piano';
      END IF;
    END IF;
  END IF;

  -- v434: PIANO (celle). Modifiche e cancellazioni: _piano_ambito_diario nel canale sicuro
  IF p_table = 'piano' AND p_azione = 'insert' THEN
    IF upper(COALESCE(p_data ->> 'codice', '')) NOT IN ('M', 'ND') THEN
      IF NOT _piano_scrittura_piena(p_token) THEN
        RAISE EXCEPTION 'Permesso mancante: modificare il piano';
      END IF;
      -- 20260911: le celle dei propri settori
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_data ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Piano di un altro settore: %', COALESCE(p_data ->> 'reparto_dip', 'slots');
      END IF;
    END IF;
  END IF;

  -- v434: CONFIGURAZIONE DEL PIANO (stesse regole della pagina)
  IF p_table IN ('piano_codici', 'piano_regole', 'piano_regole_gruppo', 'piano_mappature', 'piano_festivi') THEN
    RAISE EXCEPTION 'Configurazione del piano: solo amministratore';
  END IF;
  IF p_table = 'piano_turni' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_import')
       OR _permesso_piano_auto(p_token, 'piano_fabbisogno')) THEN
    RAISE EXCEPTION 'Turni del piano: solo amministratore';
  END IF;
  IF p_table = 'piano_festivita' AND NOT _sessione_permesso(p_token, 'gestione_festivi') THEN
    RAISE EXCEPTION 'Permesso mancante: Festivi e CGF';
  END IF;
  IF p_table = 'piano_cgf_riporto' AND NOT (_sessione_permesso(p_token, 'gestione_festivi')
       OR _sessione_permesso(p_token, 'gestione_piano')) THEN
    RAISE EXCEPTION 'Permesso mancante: Festivi e CGF';
  END IF;
  IF p_table IN ('piano_ore_mese', 'piano_recupero_ore', 'piano_formulari', 'piano_saldo_iniziale')
     AND NOT _sessione_permesso(p_token, 'gestione_piano') THEN
    RAISE EXCEPTION 'Permesso mancante: piano';
  END IF;
  IF p_table = 'piano_timbrature' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
       OR _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
    RAISE EXCEPTION 'Permesso mancante: timbrature';
  END IF;
  IF p_table = 'piano_vacanze' AND NOT (_sessione_permesso(p_token, 'gestione_piano')
       OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
    SELECT l.reparto INTO v_rep FROM _piano_auto_lasciapassare(p_token) l;
    IF v_rep IS NULL THEN
      RAISE EXCEPTION 'Permesso mancante: vacanze';
    END IF;
  END IF;
  IF p_table = 'piano_briefing' AND NOT (_sessione_permesso(p_token, 'gestione_briefing')
       OR _sessione_permesso(p_token, 'gestione_piano')) THEN
    RAISE EXCEPTION 'Permesso mancante: briefing';
  END IF;

  -- CHAT
  IF p_table = 'chat_group_members' THEN
    IF p_azione = 'update' THEN
      -- 20260911: la propria riga non si sposta in un altro gruppo
      RAISE EXCEPTION 'Membri dei gruppi: non si modificano';
    END IF;
    IF p_azione = 'insert' THEN
      -- gruppi personalizzati: aggiunge chi li ha creati; gruppo Tutti: chiunque; gruppi di
      -- settore: colleghi del settore, aggiunti da chi e del settore (20260911)
      v_gid := NULLIF(p_data ->> 'group_id', '')::bigint;
      v_set := _settori_operatore(p_token, false);
      SELECT lower(btrim(valore::jsonb ->> (p_data ->> 'operatore'))) INTO v_rep
        FROM impostazioni WHERE chiave = 'operatori_reparto';
      IF NOT EXISTS (
        SELECT 1 FROM chat_groups g
        WHERE g.id = v_gid
          AND (g.creato_da = v_op
               OR g.tipo = 'tutti'
               OR (g.tipo IN ('slots', 'tavoli')
                   AND (v_set IS NULL OR g.tipo = ANY(v_set))
                   AND (v_rep IS NULL OR v_rep IN ('', 'entrambi') OR v_rep = g.tipo)))
      ) THEN
        RAISE EXCEPTION 'Solo chi ha creato il gruppo aggiunge i membri';
      END IF;
    END IF;
  END IF;
  -- 20260913: gruppi Tutti e di settore solo con chat_get_or_create_group (uno per tipo)
  IF p_table = 'chat_groups' AND p_azione = 'insert'
     AND (COALESCE(p_data ->> 'tipo', '') <> 'custom'
          OR COALESCE(p_data ->> 'legacy_gid', '') IN ('__gruppo_tutti', '__gruppo_slots', '__gruppo_tavoli')) THEN
    RAISE EXCEPTION 'Gruppi Tutti e di settore: si creano solo dalla chat';
  END IF;
  IF p_table = 'chat_groups' AND p_azione = 'update' AND p_data IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k <> 'nome') THEN
    RAISE EXCEPTION 'Gruppi della chat: si cambia solo il nome';
  END IF;
  IF p_table = 'chat_messages' THEN
    IF p_azione = 'update' AND p_data ?| ARRAY['group_id', 'a_operatore', 'id', 'created_at'] THEN
      RAISE EXCEPTION 'Un messaggio non cambia gruppo o destinatario';
    END IF;
    IF p_azione = 'insert' THEN
      v_gid := NULLIF(p_data ->> 'group_id', '')::bigint;
      IF v_gid IS NOT NULL THEN
        v_set := _settori_operatore(p_token, false);
        IF NOT EXISTS (SELECT 1 FROM chat_group_members m WHERE m.group_id = v_gid AND m.operatore = v_op)
           AND NOT EXISTS (SELECT 1 FROM chat_groups g WHERE g.id = v_gid
                             AND (g.creato_da = v_op OR g.tipo = 'tutti'
                                  OR (g.tipo IN ('slots', 'tavoli') AND (v_set IS NULL OR g.tipo = ANY(v_set))))) THEN
          RAISE EXCEPTION 'Si scrive solo nei gruppi di cui si fa parte';
        END IF;
      END IF;
    END IF;
  END IF;
  IF p_table IN ('chat_message_letti', 'chat_message_hidden') AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Letture della chat: non si modificano';
  END IF;
  IF p_table = 'push_subscriptions' AND p_azione = 'update' AND p_data ? 'operatore' THEN
    RAISE EXCEPTION 'Notifiche: l operatore non si cambia';
  END IF;
END;
$function$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260931_a_punti_copertura_sicuri')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
