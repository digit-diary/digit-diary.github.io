-- ============================================================
-- SICUREZZA: PERMESSI E DATI (controllo C, 23/10/2026)
-- Difetti confermati con chiamate REST dirette (operatore di un solo settore, operatore
-- senza i permessi): correzione nel database, con lo stesso principio delle 20260911/12/13 e
-- 20260926 (ogni scrittura e lettura sensibile passa dai permessi e dall ambito del settore).
--  C1  Storico HR: senza "Storico HR, modificare" solo le righe dei flussi del programma, con
--      il loro permesso (formazione/livello: Competenze o Formazioni; premio: Punti e premi;
--      categoria: Categorie; impiego e nota della percentuale: Impiego), nel proprio settore.
--  C2  Punti automatici (copertura, cambio turno, rifiuto) tolti senza Punti e premi: solo
--      quelli scritti da chi e collegato nell ultima ora (Annulla, Rimuovi del popup).
--  C3  Punti automatici legati a un fatto vero: colonne nuove rif_assente + rif_data
--      (malattia/assenza nel piano o nel Diario, o cella cambiata nel piano), una volta per
--      collaboratore e fatto, coperture per fatto al massimo quante le giornate (min. 2),
--      data della riga = oggi. Le righe di prima ricevono il riferimento dal testo.
--  C4  Registro: autore e ora sempre dal server (anche senza la chiave "operatore").
--  C5  Consegne senza la pagina: solo quelle per chi e collegato; sempre del suo settore.
--  C6  Chiavi AI solo con la pagina Assistente o "Intelligenza artificiale nei moduli".
--  C7  Per settore anche Storico HR, allegati, valutazioni, moduli (anche in modifica), punti,
--      piano, Rapporto e versioni del piano; collaboratori di altri settori senza data di
--      nascita, inizio contratto, categoria, mesi di congedo.
--  C9  Password: il database accetta solo un impronta PBKDF2 (64 cifre esadecimali); la regola
--      (10 caratteri, lettere e numeri) e nel programma, che solo vede la password.
--  C15 Punti di livello "propri del settore" accettati.
--  C17 Pulizia automatica: Registro e storico del piano oltre gli anni di conservazione delle
--      Impostazioni (5), solo amministratore o server.
--  C18 Backup: leggi_backup_extra (storico del piano, esecuzioni automatiche) per l amministratore.
--  C20 Percentuale tra 0 e 1 (vincolo della tabella); collaboratore nuovo con funzione,
--      percentuale o Jolly solo con Impiego o dai flussi del piano; RESP/SOSTRESP solo Impiego.
-- Funzioni nuove: 5 (_ambito_persone, _proiezione_ambito, _pwd_impronta_valida,
-- _operatore_togli, leggi_backup_extra). Rilanciabile.
-- ============================================================
BEGIN;

-- C3: riferimento dei punti automatici
ALTER TABLE public.punti_eventi ADD COLUMN IF NOT EXISTS rif_assente text;
ALTER TABLE public.punti_eventi ADD COLUMN IF NOT EXISTS rif_data date;
CREATE INDEX IF NOT EXISTS punti_eventi_rif_idx ON public.punti_eventi (lower(rif_assente), rif_data);

-- C20: percentuale d impiego 0-1 (1 = 100%). NOT VALID + verifica: se nel cloud ci fosse gia un
-- valore fuori regola il vincolo vale comunque per le scritture nuove (e lo si dice)
ALTER TABLE public.collaboratori DROP CONSTRAINT IF EXISTS collaboratori_percentuale_check;
ALTER TABLE public.collaboratori
  ADD CONSTRAINT collaboratori_percentuale_check CHECK (percentuale IS NULL OR (percentuale > 0 AND percentuale <= 1)) NOT VALID;
DO $$
BEGIN
  ALTER TABLE public.collaboratori VALIDATE CONSTRAINT collaboratori_percentuale_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'collaboratori: percentuale fuori 0-1 in righe esistenti (da correggere): %',
    (SELECT string_agg(nome || '=' || percentuale, ', ') FROM public.collaboratori WHERE percentuale <= 0 OR percentuale > 1);
END $$;

-- ---------------------------------------------------------------------------------------
-- FUNZIONI NUOVE
-- ---------------------------------------------------------------------------------------
-- ambito delle persone (C7): righe dei settori dell operatore e delle persone che vi lavorano
-- (collaboratori del settore, di tutti i settori, con reparti extra), come il Diario
-- (_ambito_registrazioni) ma con la colonna del nome a scelta. '' = nessun limite.
CREATE OR REPLACE FUNCTION public._ambito_persone(p_token text, p_col text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
  v_nomi TEXT[];
BEGIN
  IF v_set IS NULL THEN RETURN ''; END IF;
  IF p_col NOT IN ('nome', 'collaboratore') THEN
    RAISE EXCEPTION 'Colonna non valida';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT lower(c.nome)), ARRAY[]::text[]) INTO v_nomi
    FROM collaboratori c
   WHERE lower(COALESCE(c.reparto_dip, 'slots')) = ANY(v_set)
      OR lower(c.reparto_dip) = 'entrambi'
      OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(c.reparti_extra, '')), ',')) x
                  WHERE btrim(x) = ANY(v_set));
  RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
      || ' OR lower(' || p_col || ') = ANY(' || quote_literal(v_nomi::text) || '::text[]))';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._ambito_persone(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ambito_persone(text, text) TO service_role;

-- proiezione con colonne riservate (C7): le colonne in p_riservate valgono solo dove p_cond
-- (condizione scritta dal database, mai dal programma) e vera, altrimenti NULL
CREATE OR REPLACE FUNCTION public._proiezione_ambito(p_table text, p_riservate text[], p_cond text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path = public, extensions
AS $function$
  SELECT 'SELECT ' || string_agg(
           CASE WHEN a.attname = ANY(p_riservate)
                THEN 'CASE WHEN ' || p_cond || ' THEN ' || quote_ident(a.attname) || ' END AS ' || quote_ident(a.attname)
                ELSE quote_ident(a.attname) END,
           ', ' ORDER BY a.attnum)
         || ' FROM ' || quote_ident(p_table)
    FROM pg_attribute a
   WHERE a.attrelid = ('public.' || quote_ident(p_table))::regclass AND a.attnum > 0 AND NOT a.attisdropped;
$function$;
REVOKE EXECUTE ON FUNCTION public._proiezione_ambito(text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._proiezione_ambito(text, text[], text) TO service_role;

-- impronta della password (C9): il programma manda solo l impronta PBKDF2-SHA256 (32 byte in
-- esadecimale). Il database non vede la password e non ne puo misurare la lunghezza.
CREATE OR REPLACE FUNCTION public._pwd_impronta_valida(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public, extensions
AS $function$
  SELECT COALESCE(p, '') ~ '^[0-9a-f]{64}$';
$function$;
REVOKE EXECUTE ON FUNCTION public._pwd_impronta_valida(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._pwd_impronta_valida(text) TO service_role;

-- OPERATORE TOLTO DALLE IMPOSTAZIONI (C8): il nome esce da ogni voce "Operatori selezionati"
-- di Visibilita, dal profilo, dagli accessi extra, dal settore, dall elenco degli operatori,
-- dal testo personale; le sue notifiche si cancellano. Un nuovo operatore con lo stesso nome
-- parte da zero. Restituisce il numero di voci tolte.
CREATE OR REPLACE FUNCTION public._operatore_togli(p_nome text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_n INT := 0;
  v_m INT;
  v_vis JSONB;
  v_nuovo JSONB;
BEGIN
  IF COALESCE(btrim(p_nome), '') = '' OR p_nome = 'Admin' THEN RETURN 0; END IF;
  -- Visibilita: tolto da ogni elenco di operatori selezionati (l elenco resta, anche vuoto)
  BEGIN
    SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  EXCEPTION WHEN others THEN
    v_vis := NULL;
  END;
  IF jsonb_typeof(v_vis) = 'object' THEN
    SELECT count(*) INTO v_m FROM jsonb_each(v_vis) x
     WHERE jsonb_typeof(x.value) = 'object' AND jsonb_typeof(x.value -> 'operatori') = 'array' AND (x.value -> 'operatori') ? p_nome;
    IF v_m > 0 THEN
      SELECT jsonb_object_agg(x.key,
               CASE WHEN jsonb_typeof(x.value) = 'object' AND jsonb_typeof(x.value -> 'operatori') = 'array'
                    THEN jsonb_set(x.value, '{operatori}', COALESCE((SELECT jsonb_agg(o) FROM jsonb_array_elements(x.value -> 'operatori') o
                                                                       WHERE o <> to_jsonb(p_nome)), '[]'::jsonb))
                    ELSE x.value END)
        INTO v_nuovo FROM jsonb_each(v_vis) x;
      UPDATE impostazioni SET valore = v_nuovo::text WHERE chiave = 'visibilita';
      v_n := v_n + v_m;
    END IF;
  END IF;
  -- profilo, accessi extra, settore: chiave con il nome
  UPDATE impostazioni SET valore = (valore::jsonb - p_nome)::text
   WHERE chiave IN ('profili_operatori', 'operatori_accessi_extra', 'operatori_reparto')
     AND CASE WHEN valore ~ '^\s*\{' THEN valore::jsonb ? p_nome ELSE false END;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  v_n := v_n + v_m;
  -- elenco degli operatori
  UPDATE impostazioni SET valore = COALESCE((SELECT jsonb_agg(o) FROM jsonb_array_elements(valore::jsonb) o WHERE o <> to_jsonb(p_nome)), '[]'::jsonb)::text
   WHERE chiave = 'operatori_lista' AND CASE WHEN valore ~ '^\s*\[' THEN valore::jsonb ? p_nome ELSE false END;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  v_n := v_n + v_m;
  DELETE FROM impostazioni WHERE chiave = 'testo_operatore_' || p_nome;
  GET DIAGNOSTICS v_m = ROW_COUNT;
  v_n := v_n + v_m;
  DELETE FROM push_subscriptions WHERE operatore = p_nome;
  RETURN v_n;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._operatore_togli(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._operatore_togli(text) TO service_role;

-- BACKUP (C18): le tabelle che il canale sicuro non legge, solo per l amministratore e a
-- pagine: piano_storico (versioni del piano, dalle piu recenti) dal giorno p_dal e
-- piano_auto_esecuzioni (senza il lasciapassare). operatori_auth (password) resta fuori: c e
-- il backup del server.
CREATE OR REPLACE FUNCTION public.leggi_backup_extra(p_token text, p_tabella text, p_dal timestamp with time zone DEFAULT NULL,
                                                     p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_out JSON;
  v_lim INT := GREATEST(1, LEAST(COALESCE(p_limit, 5000), 10000));
  v_off INT := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  IF NOT _verify_admin_session(p_token) THEN
    RAISE EXCEPTION 'Backup riservato all amministratore';
  END IF;
  IF p_tabella = 'piano_storico' THEN
    -- dalle versioni piu recenti (il programma si ferma al suo tetto di righe)
    SELECT COALESCE(json_agg(x ORDER BY x.id DESC), '[]'::json) INTO v_out FROM (
      SELECT * FROM piano_storico WHERE p_dal IS NULL OR quando >= p_dal ORDER BY id DESC LIMIT v_lim OFFSET v_off) x;
  ELSIF p_tabella = 'piano_auto_esecuzioni' THEN
    SELECT COALESCE(json_agg(x ORDER BY x.id), '[]'::json) INTO v_out FROM (
      SELECT id, reparto_dip, mese, stato, avviata_da, scade, iniziata, finita, tentativi, esito
        FROM piano_auto_esecuzioni WHERE p_dal IS NULL OR iniziata >= p_dal ORDER BY id LIMIT v_lim OFFSET v_off) x;
  ELSE
    RAISE EXCEPTION 'Tabella non consentita: %', p_tabella;
  END IF;
  RETURN v_out;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.leggi_backup_extra(text, text, timestamp with time zone, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leggi_backup_extra(text, text, timestamp with time zone, integer, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- OPERATORE RIMOSSO (C8): accesso, sessioni, impronte E permessi/profilo/settore
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_operator(p_nome text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_voci INT;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  DELETE FROM operatori_auth WHERE nome = p_nome;
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  -- 20260928: anche permessi, profilo, accessi extra, settore ed elenco (prima restavano e un
  -- nuovo operatore con lo stesso nome li ereditava)
  v_voci := _operatore_togli(p_nome);
  INSERT INTO log_attivita (operatore, azione, dettaglio)
  VALUES (COALESCE(_validate_op_session(p_token), 'Admin'), 'Operatore rimosso: permessi tolti', p_nome || ' (' || v_voci || ' voci)');
  RETURN json_build_object('success', true, 'voci_tolte', v_voci);
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- PULIZIA AUTOMATICA (C17): conservazione dall impostazione, solo amministratore o server
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_data(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_server BOOLEAN;
  v_anni INT;
  v_sessions INT;
  v_logs INT := 0;
  v_storico INT := 0;
BEGIN
  -- server: collegamento diretto al database (manutenzione, cron) o chiave di servizio; dal
  -- programma solo l amministratore (prima: qualsiasi sessione)
  v_server := session_user NOT IN ('authenticator', 'anon', 'authenticated')
              OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  IF NOT v_server AND NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Pulizia riservata all amministratore';
  END IF;
  DELETE FROM operator_sessions WHERE expires_at < now();
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  DELETE FROM admin_sessions WHERE expires_at < now();
  -- Registro e storico del piano: gli anni di conservazione delle Impostazioni (5 se non
  -- impostati, come nel programma); 0 = protezione spenta: nessuna cancellazione automatica
  BEGIN
    SELECT NULLIF(btrim(valore), '')::int INTO v_anni FROM impostazioni WHERE chiave = 'conservazione_anni';
  EXCEPTION WHEN others THEN
    v_anni := NULL;
  END;
  v_anni := COALESCE(v_anni, 5);
  IF v_anni > 0 THEN
    DELETE FROM log_attivita WHERE created_at < now() - make_interval(years => v_anni);
    GET DIAGNOSTICS v_logs = ROW_COUNT;
    DELETE FROM piano_storico WHERE quando < now() - make_interval(years => v_anni);
    GET DIAGNOSTICS v_storico = ROW_COUNT;
    IF v_logs + v_storico > 0 THEN
      INSERT INTO log_attivita (operatore, azione, dettaglio)
      VALUES (CASE WHEN v_server THEN 'Sistema (manutenzione)' ELSE COALESCE(_validate_op_session(p_token), 'Admin') END,
              'Pulizia automatica', 'oltre ' || v_anni || ' anni: ' || v_logs || ' righe del Registro, ' || v_storico || ' versioni del piano');
    END IF;
  END IF;
  RETURN json_build_object('sessions_cleaned', v_sessions, 'logs_cleaned', v_logs, 'storico_cleaned', v_storico, 'anni', v_anni);
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- FUNZIONI CAMBIATE
-- ---------------------------------------------------------------------------------------
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
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
  END IF;
  -- 20260911: tabelle con il Cestino: la cancellazione definitiva e dell amministratore
  IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'delete' THEN
    RAISE EXCEPTION 'Eliminazione definitiva riservata all amministratore: si usa il Cestino';
  END IF;
  IF p_table IN ('registrazioni', 'moduli') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN
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
        IF v_az IN ('copertura', 'disponibilita_negata') THEN
          SELECT count(*) INTO v_n FROM piano
           WHERE lower(collaboratore) = lower(v_ass) AND upper(codice) IN ('M', 'M1', 'ASS', 'I')
             AND data BETWEEN v_rdata AND v_rdata + 31;
          v_vero := v_n > 0 OR EXISTS (
            SELECT 1 FROM registrazioni r
             WHERE lower(r.nome) = lower(v_ass) AND r.eliminato IS NOT TRUE
               AND (lower(r.tipo) LIKE '%malatt%' OR lower(r.tipo) LIKE '%assenz%' OR lower(r.tipo) LIKE '%infortun%')
               AND ((r.data AT TIME ZONE 'Europe/Zurich')::date BETWEEN v_rdata - 1 AND v_rdata + 1
                    OR COALESCE(r.testo, '') ~ ('dal 0?' || extract(day FROM v_rdata)::int || '/0?' || extract(month FROM v_rdata)::int
                                                || '/' || extract(year FROM v_rdata)::int || '([^0-9]|$)')));
        END IF;
        IF NOT v_vero AND v_az IN ('cambio_turno', 'disponibilita_negata') THEN
          v_vero := EXISTS (SELECT 1 FROM piano_storico
                             WHERE lower(collaboratore) = lower(v_ass) AND data = v_rdata
                               AND quando > now() - interval '7 days');
        END IF;
        IF NOT v_vero THEN
          RAISE EXCEPTION 'Permesso mancante: nessuna assenza o cambio turno di % il % (i punti senza un fatto li da chi ha Punti e premi)',
            v_ass, to_char(v_rdata, 'DD.MM.YYYY');
        END IF;
        IF EXISTS (SELECT 1 FROM punti_eventi
                    WHERE lower(collaboratore) = lower(p_data ->> 'collaboratore') AND azione = v_az
                      AND lower(rif_assente) = lower(v_ass) AND rif_data = v_rdata) THEN
          RAISE EXCEPTION 'Permesso mancante: punti "%" gia assegnati a % per lo stesso fatto (il secondo accredito lo fa chi ha Punti e premi)',
            v_az, p_data ->> 'collaboratore';
        END IF;
        IF v_az IN ('copertura', 'cambio_turno') THEN
          v_max := GREATEST(COALESCE(v_n, 0), 2);
          SELECT count(*) INTO v_n FROM punti_eventi
           WHERE azione = v_az AND lower(rif_assente) = lower(v_ass) AND rif_data = v_rdata;
          IF v_n >= v_max THEN
            RAISE EXCEPTION 'Permesso mancante: gia % coperture per l assenza di % del % (Punti e premi)', v_n, v_ass, to_char(v_rdata, 'DD.MM.YYYY');
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

CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_ambito TEXT := '';
  v_amb_inv TEXT := '';
  v_fuori BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF p_table IN ('log_attivita') AND NOT v_admin THEN
    RAISE EXCEPTION 'registro riservato all amministratore';
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'delete', NULL);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Cancellazione senza filtro: mai su tutta la tabella';
  END IF;
  -- 20260911: forme di filtro ammesse per chi non e amministratore
  PERFORM _controlla_filtro_scrittura(p_token, p_table, 'delete', p_filter);
  IF p_filter !~ '^id (= ''[^'']*''|IN \(''[^'']*''(, ''[^'']*'')*\))$' THEN
    IF p_table = 'piano' AND NOT (_permesso_piano_auto(p_token, 'piano_auto_genera')
         OR _permesso_piano_auto(p_token, 'piano_auto_vacanze') OR _permesso_piano_auto(p_token, 'piano_auto_import')
         OR _permesso_piano_auto(p_token, 'piano_auto_cancella')) THEN
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

  IF p_table IN ('chat_messages', 'note_colleghi') AND NOT v_admin THEN
    v_ambito := v_ambito || ' AND da_operatore = ' || quote_literal(v_op);
  END IF;
  -- v434: piano (percorso del Diario per chi non scrive il piano) e chat
  IF p_table = 'piano' THEN
    v_ambito := v_ambito || _piano_ambito_diario(p_token, 'delete', NULL);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := v_ambito || _chat_ambito(p_token, p_table);
  -- 20260911: solo le proprie letture e notifiche; punti solo degli incentivi permessi
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := v_ambito || ' AND operatore = ' || quote_literal(v_op);
  ELSIF NOT v_admin AND p_table = 'punti_eventi' AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    -- 20260928 (C2): senza Punti e premi i punti automatici si tolgono solo se li ha scritti
    -- chi e collegato nell ultima ora (Annulla, Rimuovi del popup); quelli degli altri o piu
    -- vecchi li toglie chi ha Punti e premi. Una riga chiesta per numero e fuori: errore.
    v_amb_inv := ' AND ((azione IN (''copertura'', ''cambio_turno'', ''disponibilita_negata'')'
      || ' AND operatore = ' || quote_literal(v_op) || ' AND created_at > now() - interval ''60 minutes'')'
      || CASE WHEN _sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                   OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione = ''competenza'' OR azione ~ ''^livello_[0-9]+$''' ELSE '' END
      || CASE WHEN _sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione IN (''sessione_formativa'', ''formatore'')' ELSE '' END
      || ')';
    IF _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM punti_eventi WHERE (' || p_filter
        || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
      IF v_fuori THEN
        RAISE EXCEPTION 'Permesso mancante: punti scritti da un altro operatore o da piu di un ora (Punti e premi)';
      END IF;
    END IF;
    v_ambito := v_ambito || v_amb_inv;
    v_amb_inv := '';
  END IF;
  -- 20260926: movimenti dell inventario solo dei settori dove l operatore scrive; una riga
  -- chiesta per numero ma di un altro settore e un errore (prima: cancellata)
  IF NOT v_admin AND p_table = 'inventario' THEN
    v_amb_inv := _ambito_settore(p_token, true);
    IF v_amb_inv <> '' THEN
      IF _filtro_per_id(p_filter) THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM inventario WHERE (' || p_filter
          || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
        IF v_fuori THEN
          RAISE EXCEPTION 'Permesso mancante: inventario di un altro settore';
        END IF;
      END IF;
      v_ambito := v_ambito || v_amb_inv;
    END IF;
  END IF;
  -- 20260913: il piano passa dal controllo delle scritture del Diario (trigger)
  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_update(p_token text, p_table text, p_filter text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT := '';
  v_key TEXT;
  v_val JSONB;
  v_ambito TEXT := '';
  v_autore TEXT;
  v_con_autore BOOLEAN := false;
  v_fuori BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF p_table = 'impostazioni' AND NOT v_admin THEN
    RAISE EXCEPTION 'Impostazioni riservate: salvataggio consentito solo con la funzione protetta';
  END IF;
  IF jsonb_typeof(COALESCE(p_data, 'null'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Dati non validi';
  END IF;

  -- 20260913: registrazioni e moduli: l autore si puo rimandare uguale (la modifica di un
  -- modulo lo manda sempre), non cambiare. Rapporto: l autore e chi salva.
  IF NOT v_admin AND p_table IN ('registrazioni', 'moduli') AND p_data ? 'operatore' THEN
    v_autore := p_data ->> 'operatore';
    v_con_autore := true;
    p_data := p_data - 'operatore';
  END IF;
  IF NOT v_admin AND p_table = 'rapporti_giornalieri' AND p_data ? 'operatore' THEN
    p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
  END IF;

  PERFORM _controlla_permessi_scrittura(p_token, p_table, 'update', p_data);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF p_filter IS NULL OR btrim(p_filter) = '' THEN
    RAISE EXCEPTION 'Modifica senza filtro: mai su tutta la tabella';
  END IF;
  -- 20260911: forme di filtro ammesse per chi non e amministratore
  PERFORM _controlla_filtro_scrittura(p_token, p_table, 'update', p_filter);

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

  IF v_con_autore THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
      || ') AND operatore IS DISTINCT FROM ' || quote_nullable(v_autore) || ')' INTO v_fuori;
    IF v_fuori THEN
      RAISE EXCEPTION 'Numero, data di creazione e autore non si modificano';
    END IF;
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  -- v434: l autore di messaggi e note non si cambia (resta chi l ha scritto)
  IF p_table IN ('chat_messages', 'note_colleghi') AND p_data ? 'da_operatore' AND NOT v_admin THEN
    p_data := p_data - 'da_operatore';
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
  LOOP
    IF v_set != '' THEN v_set := v_set || ', '; END IF;
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

  -- v407: messaggi e note dei colleghi si modificano solo se propri; le reazioni le
  -- aggiunge chi partecipa alla conversazione; l amministratore tutto
  IF p_table IN ('chat_messages', 'note_colleghi') AND NOT v_admin THEN
    IF p_table = 'chat_messages' AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k <> 'reazioni') THEN
      v_ambito := ' AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op)
        || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
    ELSE
      v_ambito := ' AND da_operatore = ' || quote_literal(v_op);
    END IF;
  -- v434: piano e chat con il loro ambito; 20260911: Diario e collaboratori per settore,
  -- notifiche e letture solo proprie, password mai da qui
  ELSIF p_table = 'piano' THEN
    v_ambito := _piano_ambito_diario(p_token, 'update', p_data);
  ELSIF p_table IN ('chat_groups', 'chat_group_members') THEN
    v_ambito := _chat_ambito(p_token, p_table);
  ELSIF NOT v_admin AND p_table = 'registrazioni' THEN
    v_ambito := _ambito_registrazioni(p_token);
  ELSIF NOT v_admin AND p_table = 'collaboratori' THEN
    v_ambito := _ambito_collaboratori(p_token);
  -- 20260928: moduli (Cestino, correzioni) solo dei settori e delle persone che l operatore legge
  ELSIF NOT v_admin AND p_table = 'moduli' THEN
    v_ambito := _ambito_persone(p_token, 'collaboratore');
  -- 20260926: movimenti dell inventario dei settori dove l operatore scrive
  ELSIF NOT v_admin AND p_table = 'inventario' THEN
    v_ambito := _ambito_settore(p_token, true);
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op);
  ELSIF p_table = 'impostazioni' THEN
    v_ambito := ' AND chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'')';
  END IF;

  -- 20260913: riga chiesta per numero ma esclusa dai permessi: errore, non "fatto" con 0
  -- righe. Una riga che non corrisponde al filtro di valore (es. completata = false) non
  -- e esclusa dai permessi: 0 righe senza errore, come sempre.
  IF NOT v_admin AND v_ambito <> '' AND _filtro_per_id(p_filter) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
      || ') AND NOT COALESCE((TRUE' || v_ambito || '), false))' INTO v_fuori;
    IF v_fuori THEN
      RAISE EXCEPTION 'Permesso mancante: % fuori dai tuoi permessi (settore, autore o gruppo)', p_table;
    END IF;
  END IF;

  IF p_table = 'piano' THEN
    PERFORM _piano_imposta_ambito(p_token);
  END IF;
  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ')' || v_ambito;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_read(p_token text, p_table text, p_filter text DEFAULT ''::text, p_order text DEFAULT ''::text, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET standard_conforming_strings TO 'on'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_query TEXT;
  v_from TEXT;
  v_amb TEXT := '';
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);

  IF NOT _filtro_sicuro(p_filter) THEN
    RAISE EXCEPTION 'Filtro non valido';
  END IF;
  IF NOT _ordine_sicuro(p_order) THEN
    RAISE EXCEPTION 'Ordinamento non valido';
  END IF;

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

  -- 20260911: cosa legge chi non e amministratore (la tabella diventa una vista ristretta
  -- con lo stesso nome, cosi filtro e ordinamento restano quelli di sempre)
  v_from := quote_ident(p_table);
  IF NOT v_admin THEN
    IF p_table = 'log_attivita' AND NOT _pagina_visibile(p_token, 'registro') THEN
      -- proprie righe, righe del piano (storico, cambi) e ultimo accesso dei colleghi
      v_from := '(SELECT id, operatore, azione, dettaglio, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore = ' || quote_literal(v_op) || ' OR azione ILIKE ''%piano%'''
        || ' UNION ALL SELECT u.id, u.operatore, ''''::text, ''''::text, u.created_at, u.reparto_dip FROM'
        || ' (SELECT DISTINCT ON (operatore) id, operatore, azione, created_at, reparto_dip FROM log_attivita'
        || ' WHERE operatore IS DISTINCT FROM ' || quote_literal(v_op) || ' ORDER BY operatore, created_at DESC) u'
        || ' WHERE u.azione NOT ILIKE ''%piano%'') log_attivita';
    ELSIF p_table IN ('costi_maison', 'spese_extra', 'regali_maison', 'note_clienti')
          AND NOT _pagina_visibile(p_token, 'maison') THEN
      v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE false) ' || quote_ident(p_table);
    ELSIF p_table = 'maison_budget' AND NOT _pagina_visibile(p_token, 'maison') THEN
      IF _pagina_visibile(p_token, 'alert_compleanni') THEN
        v_from := '(' || _proiezione('maison_budget', ARRAY['id', 'nome', 'data_nascita', 'reparto_dip'])
          || ' WHERE data_nascita IS NOT NULL AND eliminato IS NOT TRUE' || _ambito_settore(p_token, false) || ') maison_budget';
      ELSE
        v_from := '(SELECT * FROM maison_budget WHERE false) maison_budget';
      END IF;
    ELSIF p_table = 'registrazioni' THEN
      v_amb := _ambito_registrazioni(p_token);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM registrazioni WHERE TRUE' || v_amb || ') registrazioni';
      END IF;
    -- 20260926: INVENTARIO E MAISON PER SETTORE (come il Diario): solo le righe dei settori
    -- dell operatore (il suo e gli accessi extra); chi ha tutti i settori legge tutto
    ELSIF p_table IN ('inventario', 'costi_maison', 'spese_extra', 'regali_maison', 'note_clienti', 'maison_budget') THEN
      v_amb := _ambito_settore(p_token, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE TRUE' || v_amb || ') ' || quote_ident(p_table);
      END IF;
    ELSIF p_table = 'push_subscriptions' THEN
      v_from := '(SELECT * FROM push_subscriptions WHERE operatore = ' || quote_literal(v_op) || ') push_subscriptions';
    -- 20260913: il Rapporto lo legge chi ha la pagina Rapporto (gli altri: vuoto, niente errore)
    ELSIF p_table = 'rapporti_giornalieri' AND NOT _pagina_visibile(p_token, 'rapporto') THEN
      v_from := '(SELECT * FROM rapporti_giornalieri WHERE false) rapporti_giornalieri';
    -- 20260928 (C7): DATI DELLE PERSONE PER SETTORE (come il Diario): Storico HR, allegati,
    -- valutazioni, moduli, punti e piano solo dei settori dell operatore (il suo e gli accessi
    -- extra) e delle persone che vi lavorano (di tutti i settori o con reparti extra); il
    -- Rapporto solo dei suoi settori; chi ha tutti i settori legge tutto
    ELSIF p_table IN ('hr_eventi', 'hr_allegati', 'valutazioni', 'moduli', 'punti_eventi', 'piano') THEN
      v_amb := _ambito_persone(p_token, 'collaboratore');
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM ' || quote_ident(p_table) || ' WHERE TRUE' || v_amb || ') ' || quote_ident(p_table);
      END IF;
    ELSIF p_table = 'rapporti_giornalieri' THEN
      v_amb := _ambito_settore(p_token, false);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM rapporti_giornalieri WHERE TRUE' || v_amb || ') rapporti_giornalieri';
      END IF;
    -- 20260928 (C5): CONSEGNE: senza la pagina Consegna solo quelle per chi e collegato (tutti
    -- o il suo nome fra i destinatari: servono per l avviso all accesso); sempre dei suoi settori
    ELSIF p_table = 'consegne_turno' THEN
      v_amb := _ambito_settore(p_token, false);
      IF NOT _pagina_visibile(p_token, 'consegna') THEN
        v_amb := v_amb || ' AND (lower(btrim(COALESCE(destinatario, ''''))) = ''tutti'' OR '
          || quote_literal(v_op) || ' = ANY(SELECT btrim(x) FROM unnest(string_to_array(COALESCE(destinatario, ''''), '','')) x))';
      END IF;
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM consegne_turno WHERE TRUE' || v_amb || ') consegne_turno';
      END IF;
    -- 20260928 (C7): collaboratori di altri settori: la riga resta (nomi per chat, coperture,
    -- cambi, ricerca) ma senza i dati HR: data di nascita, inizio contratto, categoria, mesi
    -- di congedo non pagato
    ELSIF p_table = 'collaboratori' THEN
      v_amb := _ambito_collaboratori(p_token);
      IF v_amb <> '' THEN
        v_from := '(' || _proiezione_ambito('collaboratori',
            ARRAY['data_nascita', 'data_assunzione', 'categoria', 'mesi_congedo_non_pagato'], '(TRUE' || v_amb || ')')
          || ') collaboratori';
      END IF;
    END IF;
  END IF;

  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || v_from;

  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
    -- costi dell organico (v354): solo chi vede la scheda Organico
    IF NOT _sessione_permesso(p_token, 'ptab_organico') THEN
      v_query := v_query || ' AND chiave <> ''piano_organico_costi''';
    END IF;
    IF p_filter != '' THEN
      v_query := v_query || ' AND (' || p_filter || ')';
    END IF;
  ELSIF p_table = 'chat_messages' THEN
    v_query := v_query || ' WHERE id NOT IN (SELECT message_id FROM chat_message_hidden WHERE operatore = ' || quote_literal(v_op) || ') AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op) || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
  -- DATI HR RISERVATI (v348): chi non ha il permesso non li riceve proprio
  ELSIF p_table = 'valutazioni' AND NOT (_sessione_permesso(p_token, 'vista_valutazioni') OR _sessione_permesso(p_token, 'gestione_valutazioni')) THEN
    v_query := v_query || ' WHERE false';
  ELSIF p_table = 'hr_eventi' AND NOT _hr_vede(p_token) THEN
    -- chi registra le formazioni vede solo formazioni, livelli e premi
    IF _sessione_permesso(p_token, 'gestione_formazioni') THEN
      v_query := v_query || ' WHERE tipo IN (''formazione'', ''livello'', ''premio'')';
      IF p_filter != '' THEN
        v_query := v_query || ' AND (' || p_filter || ')';
      END IF;
    ELSE
      v_query := v_query || ' WHERE false';
    END IF;
  ELSIF p_table = 'hr_allegati' AND NOT (_hr_vede(p_token) OR _sessione_permesso(p_token, 'gestione_formazioni')) THEN
    v_query := v_query || ' WHERE false';
  ELSIF p_filter != '' THEN
    v_query := v_query || ' WHERE ' || p_filter;
  END IF;

  IF p_order != '' THEN
    v_query := v_query || ' ORDER BY ' || p_order;
  END IF;

  v_query := v_query || ' LIMIT ' || GREATEST(1, LEAST(p_limit, 10000)) || ' OFFSET ' || GREATEST(0, COALESCE(p_offset, 0)) || ') t';

  EXECUTE v_query INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ai_key(p_token text, p_fornitore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  k TEXT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260928 (C6): la chiave solo a chi usa l intelligenza artificiale: pagina Assistente o
  -- "Intelligenza artificiale nei moduli" (l amministratore sempre)
  IF NOT (_verify_admin_session(p_token) OR _pagina_visibile(p_token, 'assistente') OR _pagina_visibile(p_token, 'ai_moduli')) THEN
    RAISE EXCEPTION 'Permesso mancante: Assistente o Intelligenza artificiale nei moduli';
  END IF;
  SELECT chiave INTO k FROM ai_chiavi WHERE fornitore = p_fornitore;
  -- dati importati da prima di questa migrazione: la chiave Groq era nelle impostazioni
  IF k IS NULL AND p_fornitore = 'groq' THEN
    SELECT valore INTO k FROM impostazioni WHERE chiave = 'groq_api_key';
  END IF;
  RETURN json_build_object('key', k);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_groq_key(p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  k TEXT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260928 (C6): come get_ai_key
  IF NOT (_verify_admin_session(p_token) OR _pagina_visibile(p_token, 'assistente') OR _pagina_visibile(p_token, 'ai_moduli')) THEN
    RAISE EXCEPTION 'Permesso mancante: Assistente o Intelligenza artificiale nei moduli';
  END IF;
  SELECT chiave INTO k FROM ai_chiavi WHERE fornitore = 'groq';
  IF k IS NULL THEN
    SELECT valore INTO k FROM impostazioni WHERE chiave = 'groq_api_key';
  END IF;
  RETURN json_build_object('key', k);
END;
$function$;

CREATE OR REPLACE FUNCTION public.piano_storico_al(p_token text, p_reparto text, p_ym text, p_quando timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_da DATE := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_a DATE := (to_date(p_ym || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_out JSON;
  v_set TEXT[];
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260928 (C7): le versioni del piano solo dei settori dell operatore
  v_set := _settori_operatore(p_token, false);
  IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_reparto, 'slots')) = ANY(v_set)) THEN
    RAISE EXCEPTION 'Piano di un altro settore: %', p_reparto;
  END IF;
  WITH dopo AS (
    SELECT DISTINCT ON (piano_id) piano_id, prima
      FROM piano_storico
     WHERE quando > p_quando AND piano_id IS NOT NULL
       AND data BETWEEN v_da - 1 AND v_a + 1
     ORDER BY piano_id, quando ASC
  ), stato AS (
    SELECT to_jsonb(p) AS r FROM piano p
     WHERE p.data BETWEEN v_da AND v_a AND NOT EXISTS (SELECT 1 FROM dopo d WHERE d.piano_id = p.id)
    UNION ALL
    SELECT prima FROM dopo WHERE prima IS NOT NULL
  )
  SELECT COALESCE(json_agg(r), '[]'::json) INTO v_out FROM stato
   WHERE (r ->> 'data')::date BETWEEN v_da AND v_a AND COALESCE(r ->> 'reparto_dip', 'slots') = p_reparto;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piano_storico_momenti(p_token text, p_reparto text, p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_da DATE := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_out JSON;
  v_set TEXT[];
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260928 (C7): le versioni del piano solo dei settori dell operatore
  v_set := _settori_operatore(p_token, false);
  IF v_set IS NOT NULL AND NOT (lower(COALESCE(p_reparto, 'slots')) = ANY(v_set)) THEN
    RAISE EXCEPTION 'Piano di un altro settore: %', p_reparto;
  END IF;
  -- per minuto e operatore: una cella conta una volta (com era al primo cambio e com e
  -- all ultimo; il ripristino cancella e riscrive, sono due righe ma un cambio solo) e le
  -- celle tornate uguali non contano
  WITH ev AS (
    SELECT date_trunc('minute', quando) AS minuto, COALESCE(operatore, '') AS operatore, collaboratore, data,
           (array_agg(prima ORDER BY quando, id))[1] AS prima,
           (array_agg(dopo ORDER BY quando DESC, id DESC))[1] AS dopo,
           min(quando) AS primo, max(quando) AS ultimo
      FROM piano_storico
     WHERE COALESCE(reparto_dip, 'slots') = p_reparto
       AND data >= v_da AND data < (v_da + interval '1 month')
     GROUP BY 1, 2, 3, 4
  ), cambi AS (
    SELECT * FROM ev
     WHERE (prima - 'id' - 'updated_at' - 'operatore' - 'created_at') IS DISTINCT FROM
           (dopo - 'id' - 'updated_at' - 'operatore' - 'created_at')
  )
  SELECT COALESCE(json_agg(x ORDER BY x.minuto DESC), '[]'::json) INTO v_out FROM (
    SELECT minuto, min(primo) AS primo, max(ultimo) AS ultimo, operatore, count(*) AS celle,
           count(*) FILTER (WHERE prima IS NULL) AS nuove,
           count(*) FILTER (WHERE prima IS NOT NULL AND dopo IS NOT NULL) AS modificate,
           count(*) FILTER (WHERE dopo IS NULL) AS cancellate,
           (array_agg(collaboratore || ' ' || to_char(data, 'DD.MM') || ': ' ||
              COALESCE(prima ->> 'codice', 'vuota') || ' > ' || COALESCE(dopo ->> 'codice', 'vuota') ORDER BY primo))[1:4] AS esempi
      FROM cambi
     GROUP BY minuto, operatore
     ORDER BY minuto DESC
     LIMIT 400
  ) x;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.piano_storico_cella(p_token text, p_collaboratore text, p_data date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_out JSON;
  v_amb TEXT;
  v_ok BOOLEAN;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260928 (C7): la storia di una cella solo per le persone dei settori dell operatore
  v_amb := _ambito_persone(p_token, 'collaboratore');
  IF v_amb <> '' THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM (SELECT ' || quote_literal(p_collaboratore) || '::text AS collaboratore, NULL::text AS reparto_dip'
      || ' UNION ALL SELECT collaboratore, reparto_dip FROM piano_storico WHERE collaboratore = ' || quote_literal(p_collaboratore)
      || ' AND data = ' || quote_literal(p_data) || ') x WHERE TRUE' || replace(v_amb, 'COALESCE(reparto_dip, ''slots'')', 'COALESCE(reparto_dip, ''-'')') || ')'
      INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Piano di un altro settore: %', p_collaboratore;
    END IF;
  END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.quando DESC), '[]'::json) INTO v_out FROM (
    SELECT quando, azione, operatore, reparto_dip,
           prima ->> 'codice' AS da, dopo ->> 'codice' AS a,
           COALESCE(dopo ->> 'commento', prima ->> 'commento') AS commento,
           dopo ->> 'motivo_blocco' AS motivo_blocco,
           dopo ->> 'ora_inizio' AS ora_inizio, dopo ->> 'ora_fine' AS ora_fine
      FROM piano_storico
     WHERE collaboratore = p_collaboratore AND data = p_data
     ORDER BY quando DESC
     LIMIT 200
  ) x;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_operator(p_nome text, p_hash text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  IF COALESCE(p_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password mancante');
  END IF;
  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(p_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  INSERT INTO operatori_auth (nome, pwd_hash_v2, deve_cambiare_pwd) VALUES (p_nome, _pwd_cifra(p_hash), true);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Operatore esistente');
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_op_pwd(p_nome text, p_old_hash text, p_new_hash text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
  valid BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit('__op_change_' || p_nome) THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;
  IF COALESCE(p_new_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password nuova mancante');
  END IF;
  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(p_new_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  SELECT pwd_hash, pwd_hash_v2 INTO stored, stored_v2 FROM operatori_auth WHERE nome = p_nome;
  IF stored IS NULL AND stored_v2 IS NULL THEN
    PERFORM _record_attempt('__op_change_' || p_nome, false);
    RETURN json_build_object('success', false);
  END IF;
  IF _pwd_verifica(p_old_hash, stored_v2) THEN valid := true;
  ELSIF _pwd_verifica(p_old_legacy_hash, stored) THEN valid := true;
  ELSIF _pwd_verifica(p_old_hash, stored) THEN valid := true;
  END IF;
  IF NOT valid THEN
    PERFORM _record_attempt('__op_change_' || p_nome, false);
    RETURN json_build_object('success', false);
  END IF;
  UPDATE operatori_auth SET pwd_hash_v2 = _pwd_cifra(p_new_hash), pwd_hash = NULL, deve_cambiare_pwd = false WHERE nome = p_nome;
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin AND token IS DISTINCT FROM p_token;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  PERFORM _record_attempt('__op_change_' || p_nome, true);
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_change_pwd(p_nome text, p_new_hash text, p_deve_cambiare boolean, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  should_change BOOLEAN;
BEGIN
  IF COALESCE(p_new_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password nuova mancante');
  END IF;
  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(p_new_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  IF p_token IS NOT NULL AND _verify_admin_session(p_token) THEN
    UPDATE operatori_auth SET pwd_hash_v2 = _pwd_cifra(p_new_hash), pwd_hash = NULL, deve_cambiare_pwd = p_deve_cambiare WHERE nome = p_nome;
  ELSE
    IF p_token IS NULL OR _validate_op_session(p_token) IS DISTINCT FROM p_nome THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    SELECT deve_cambiare_pwd INTO should_change FROM operatori_auth WHERE nome = p_nome;
    IF NOT FOUND OR NOT COALESCE(should_change, false) THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    IF p_deve_cambiare != false THEN
      RETURN json_build_object('success', false, 'error', 'Non autorizzato');
    END IF;
    UPDATE operatori_auth SET pwd_hash_v2 = _pwd_cifra(p_new_hash), pwd_hash = NULL, deve_cambiare_pwd = false WHERE nome = p_nome;
  END IF;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false);
  END IF;
  -- password nuova: le sessioni e i dispositivi di prima della persona si chiudono
  DELETE FROM operator_sessions WHERE operatore = p_nome AND NOT is_admin AND token IS DISTINCT FROM p_token;
  DELETE FROM bio_dispositivi WHERE operatore = p_nome;
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_master_pwd(p_old_hash text, p_new_hash text, p_new_recovery text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
  valid BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit('__master_change__') THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;
  IF COALESCE(p_new_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password nuova mancante');
  END IF;
  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(p_new_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  IF _pwd_verifica(p_old_hash, stored_v2) THEN valid := true;
  ELSIF _pwd_verifica(p_old_legacy_hash, stored) THEN valid := true;
  ELSIF _pwd_verifica(p_old_hash, stored) THEN valid := true;
  END IF;
  IF NOT valid THEN
    PERFORM _record_attempt('__master_change__', false);
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', _pwd_cifra(p_new_hash))
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', _pwd_cifra(p_new_recovery))
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  -- le altre sessioni da amministratore si chiudono (resta quella di chi cambia)
  DELETE FROM operator_sessions WHERE is_admin AND token IS DISTINCT FROM p_token;
  DELETE FROM admin_sessions WHERE token IS DISTINCT FROM p_token;
  PERFORM _record_attempt('__master_change__', true);
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.setup_master_pwd(p_default_hash text, p_new_hash text, p_new_recovery text, p_new_hash_v2 text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  -- Blocca se esiste una password (v1 diversa dal default OPPURE v2 impostata)
  IF (COALESCE(stored, '') <> '' AND NOT _pwd_verifica(p_default_hash, stored)) OR COALESCE(stored_v2, '') <> '' THEN
    RETURN json_build_object('success', false);
  END IF;
  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(COALESCE(NULLIF(p_new_hash_v2, ''), p_new_hash)) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  IF COALESCE(p_new_hash_v2, '') <> '' THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', _pwd_cifra(p_new_hash_v2))
      ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  ELSIF COALESCE(p_new_hash, '') <> '' THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', _pwd_cifra(p_new_hash))
      ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  ELSE
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', _pwd_cifra(p_new_recovery))
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.recovery_master_pwd(p_code text, p_new_hash text, p_new_recovery text, p_new_hash_v2 text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  stored_code TEXT;
BEGIN
  IF NOT _check_rate_limit('__recovery__') THEN
    RETURN json_build_object('success', false, 'locked', true);
  END IF;

  SELECT valore INTO stored_code FROM impostazioni WHERE chiave = 'recovery_code';
  IF NOT _pwd_verifica(p_code, stored_code) THEN
    PERFORM _record_attempt('__recovery__', false);
    RETURN json_build_object('success', false);
  END IF;

  -- 20260928 (C9): arriva solo l impronta PBKDF2 calcolata dal programma (64 cifre esadecimali),
  -- mai la password: qui si rifiuta tutto cio che non e un impronta (testo in chiaro, vuoto,
  -- impronte troncate). La regola della password (almeno 10 caratteri, lettere e numeri) la
  -- controlla il programma prima di calcolare l impronta.
  IF NOT _pwd_impronta_valida(COALESCE(NULLIF(p_new_hash_v2, ''), p_new_hash)) THEN
    RETURN json_build_object('success', false, 'error', 'Password non valida: almeno 10 caratteri, con lettere e numeri');
  END IF;
  IF COALESCE(p_new_hash_v2, '') <> '' THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', _pwd_cifra(p_new_hash_v2))
      ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  ELSIF COALESCE(p_new_hash, '') <> '' THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', _pwd_cifra(p_new_hash))
      ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  ELSE
    RETURN json_build_object('success', false);
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', _pwd_cifra(p_new_recovery))
    ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  -- 20260911: password principale nuova, le sessioni da amministratore aperte si chiudono
  DELETE FROM operator_sessions WHERE is_admin;
  DELETE FROM admin_sessions;

  PERFORM _record_attempt('__recovery__', true);
  RETURN json_build_object('success', true);
END;
$function$;

-- C3: riferimento delle righe di prima, dal testo che il programma scrive
--   "Copertura per X del 08/09/2026", "Copertura malattia di X del 08/09/2026 (giorni ...)",
--   "Disponibilita negata per assenza di X del 08/09/2026"
DO $$
DECLARE
  r RECORD;
  m TEXT[];
BEGIN
  FOR r IN SELECT id, descrizione FROM public.punti_eventi
            WHERE rif_assente IS NULL AND azione IN ('copertura', 'disponibilita_negata') LOOP
    m := regexp_match(r.descrizione, '^(?:Copertura per|Copertura malattia di|Disponibilit. negata per assenza di) (.+?) del ([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})');
    IF m IS NOT NULL THEN
      BEGIN
        UPDATE public.punti_eventi SET rif_assente = m[1], rif_data = make_date(m[4]::int, m[3]::int, m[2]::int) WHERE id = r.id;
      EXCEPTION WHEN others THEN
        NULL; -- data impossibile nel testo: la riga resta senza riferimento
      END;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260928_sicurezza_permessi_dati')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
