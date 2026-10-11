-- ============================================================
-- CHIUSURE FINALI DELLA REVISIONE DI SICUREZZA (controllo dell 11/10/2026, ondata 3)
--
-- Come per la 20260911: falle "solo nella pagina" che dalla console del browser, con una
-- sessione da operatore qualsiasi, il database lasciava passare. Ognuna e provata in
-- strumenti/qa/permessi_operatore.js (riprodotta, chiusa, azioni legittime ancora buone).
--
-- 1) PIANO DI UN ALTRO SETTORE DAL PERCORSO DEL DIARIO (N2). Chi non scrive il piano (o
--    chi lo scrive, fuori dai propri settori) poteva, con due modifiche di fila
--    ({codice:'M', commento:'Ex S1'} e poi {codice:'S1'}), scrivere qualsiasi sigla in
--    qualsiasi cella, piu protetto, motivo del blocco, settore e prima_malattia a piacere.
--    Ora, sulle celle che si toccano solo come "Diario" (malattia e ND), decide il
--    database (trigger piano_diario_trg):
--    - settore, protetto, generato e motivo del blocco non si scrivono: mettendo M o ND la
--      cella diventa protetta, non della bozza, senza blocco; la colonna prima_malattia
--      (com era la cella sotto) la scrive il DATABASE dalla cella vera, non il browser;
--    - togliendo la malattia torna SOLO la sigla che c era davvero: prima_malattia scritta
--      dal database; per le malattie scritte prima di questa colonna, lo storico del piano
--      (piano_storico, scritto dal database: la cella com era prima di diventare M/ND);
--      solo per le celle mai toccate da quando c e lo storico (01/09/2026) vale ancora la
--      nota "Ex <sigla>" (scritta allora dal programma). Una nota cambiata dal browser non
--      conta piu nulla: ogni modifica entra nello storico.
--    - una M o ND che copre una sigla non si cancella dal percorso del Diario (si toglie
--      rimettendo la sigla); una sigla non si cambia in un altra.
--    La malattia dal Diario resta possibile a TUTTI, in ogni settore (la malattia
--    prevale), come prima: il programma non cambia.
-- 2) RAPPORTO (N5). Il programma scrive rapporti_giornalieri con secure_insert /
--    secure_update (non con upsert_rapporto): ora serve la pagina Rapporto anche li, e
--    anche per leggerlo (senza la pagina la lettura e vuota, niente errore: la Consegna
--    perde solo il suggerimento del supervisore). L autore e sempre chi e collegato.
-- 3) AUTORE = SESSIONE. Nelle tabelle dove il programma scrive sempre getOperatore()
--    (registrazioni, moduli, rapporti, consegne, punti, HR, inventario, Maison, piano e
--    tabelle del piano, piano_bulk_upsert) chi non e amministratore non puo piu scrivere
--    a nome di un collega: l operatore lo mette il database. Restano liberi: promemoria
--    (creato_da: la ripetizione del promemoria ricrea quello del collega) e
--    chat_group_members (operatore = il membro). Annulla di una cancellazione rimette la
--    riga con l autore = chi annulla (e chi l ha rimessa).
--    Modifica di registrazioni e moduli: la chiave "operatore" e ammessa solo se uguale
--    all autore attuale (la modifica di un modulo la manda sempre: prima per un operatore
--    era un errore "autore non si modifica").
-- 4) PUNTI. Senza "Punti e premi" gli incentivi automatici (copertura, cambio turno,
--    disponibilita negata) hanno sempre un motivo, una sola volta per collaboratore +
--    azione + motivo (il doppio accredito consapevole lo fa chi ha Punti e premi) e al
--    massimo 5 in 24 ore per collaboratore e azione. I punti configurati: gia dalla 20260911.
-- 5) CHAT. chat_get_or_create_group: i gruppi Tutti / Tutti Slots / Tutti Tavoli sono uno
--    per tipo (chi li chiede riceve quello che c e), con il loro codice riservato; un
--    gruppo "custom" non puo usare i codici riservati. secure_insert su chat_groups: solo
--    gruppi custom (gli altri li crea la funzione).
-- 6) SESSIONI. Il rinnovo a catena era illimitato: un token rubato (o un PC lasciato
--    acceso) restava buono per sempre rinnovandosi ogni 24 ore. Ora la catena dura al
--    massimo 30 giorni dall accesso con la password (colonna operator_sessions.catena_inizio):
--    chi lavora e rientra almeno una volta al mese non se ne accorge; il PC sempre acceso
--    chiede la password una volta al mese. Le sessioni aperte contano da adesso.
-- 7) is_default_master_pwd diceva "password di fabbrica" quando password_hash (vecchia
--    SHA-256) e vuota, cioe dopo la 20260911 SEMPRE. Ora e "di fabbrica" solo se non c e
--    la password nuova (bcrypt) e la vecchia e vuota o e quella di fabbrica (come
--    setup_master_pwd).
-- 8) COLLABORATORI "entrambi". La pagina mostra all operatore anche i collaboratori di
--    tutti i settori ("entrambi"), ma la modifica toccava 0 righe senza errore. Regola: chi
--    ha il permesso nel proprio settore modifica anche chi lavora in tutti i settori (vale
--    anche per il Diario di quelle persone, come per i reparti extra).
-- 9) NIENTE SUCCESSI FINTI. secure_update per numero (id = ...) su una riga che i
--    permessi escludono (settore, autore, piano, chat, notifiche) toccava 0 righe e
--    rispondeva "fatto": ora e un errore "Permesso mancante". Una riga che non
--    corrisponde al filtro di valore (es. promemoria completata = false gia fatto da un
--    collega) resta 0 righe senza errore.
-- 10) _verify_admin_session riconosce anche la sessione amministratore rinnovata e quella
--    di un secondo PC: prima solo l ultima entrata con la password (admin_sessions), e
--    dopo un rinnovo o un accesso da un altro PC "Nuovo operatore" e "Reimposta password"
--    rispondevano "Non autorizzato".
--
-- Effetti per gli utenti: nessuno nel lavoro normale. Un PC lasciato collegato per piu di
-- 30 giorni chiede la password. Chi non ha la pagina Rapporto non vede piu il Rapporto
-- (ne il suggerimento del supervisore nella Consegna) e, cancellando dal Diario una
-- malattia nata dal Rapporto, il Rapporto non si aggiorna (lo fa chi ha la pagina).
-- Si puo rilanciare.
-- ============================================================

-- ------------------------------------------------------------
-- 6) SESSIONI: inizio della catena dei rinnovi
-- ------------------------------------------------------------
ALTER TABLE public.operator_sessions ADD COLUMN IF NOT EXISTS catena_inizio TIMESTAMPTZ;
ALTER TABLE public.operator_sessions ALTER COLUMN catena_inizio SET DEFAULT now();
-- le sessioni aperte contano da adesso (nessuno viene scollegato dalla migrazione)
UPDATE public.operator_sessions SET catena_inizio = now() WHERE catena_inizio IS NULL;

-- 10) amministratore: anche la sessione rinnovata (o di un altro PC) vale
CREATE OR REPLACE FUNCTION public._verify_admin_session(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM admin_sessions WHERE token = p_token AND expires_at > now())
      OR EXISTS (SELECT 1 FROM operator_sessions WHERE token = p_token AND is_admin AND expires_at > now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.renew_op_session(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_scade TIMESTAMPTZ;
  v_rinnovato TEXT;
  v_inizio TIMESTAMPTZ;
  v_new TEXT;
BEGIN
  SELECT operatore, is_admin, expires_at, rinnovato_in, COALESCE(catena_inizio, created_at, now())
    INTO v_op, v_admin, v_scade, v_rinnovato, v_inizio
    FROM operator_sessions
    WHERE token = p_token AND expires_at > now() - interval '12 hours'
    LIMIT 1
    FOR UPDATE;
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260911: un token gia rinnovato non ne crea altri. Nei 2 minuti dopo il rinnovo
  -- restituisce lo stesso token nuovo (la prima risposta si era persa per strada)
  IF v_rinnovato IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM operator_sessions WHERE token = v_rinnovato AND expires_at > now()
                 AND created_at > now() - interval '2 minutes') THEN
      RETURN json_build_object('session_token', v_rinnovato, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
    END IF;
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260913: la catena dei rinnovi dura al massimo 30 giorni dall accesso con la password
  -- (il programma, alla parola "Sessione non valida", chiede di rientrare)
  IF v_inizio < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Sessione non valida: durata massima di 30 giorni, rientra con la password';
  END IF;
  -- v407: un operatore rimosso non rinnova piu (prima la sessione durava per sempre);
  -- l amministratore entra con la password principale (operatore "Admin")
  IF NOT (COALESCE(v_admin, false) AND v_op = 'Admin') AND NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = v_op) THEN
    DELETE FROM operator_sessions WHERE token = p_token;
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_new := _create_op_session(v_op, COALESCE(v_admin, false));
  -- la sessione nuova eredita l inizio della catena e non va oltre i 30 giorni
  UPDATE operator_sessions SET catena_inizio = v_inizio,
                               expires_at = LEAST(expires_at, v_inizio + interval '30 days')
   WHERE token = v_new;
  -- v411: il token vecchio si chiude fra 2 minuti, non subito (richieste in viaggio)
  UPDATE operator_sessions SET expires_at = LEAST(expires_at, now() + interval '2 minutes'), rinnovato_in = v_new
   WHERE token = p_token;
  RETURN json_build_object('session_token', v_new, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$function$;

-- ------------------------------------------------------------
-- 7) password di fabbrica: solo senza password nuova (bcrypt), come setup_master_pwd
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_default_master_pwd(p_default_hash text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  RETURN json_build_object('is_default',
    COALESCE(stored_v2, '') = '' AND (COALESCE(stored, '') = '' OR _pwd_verifica(p_default_hash, stored)));
END;
$function$;

-- ------------------------------------------------------------
-- 8) collaboratori di tutti i settori ("entrambi"): lavorano anche nel mio
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ambito_collaboratori(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_set TEXT[] := _settori_operatore(p_token, false);
BEGIN
  IF v_set IS NULL THEN RETURN ''; END IF;
  RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
      || ' OR lower(reparto_dip) = ''entrambi'''
      || ' OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(reparti_extra, '''')), '','')) x'
      || ' WHERE btrim(x) = ANY(' || quote_literal(v_set::text) || '::text[])))';
END;
$function$;

CREATE OR REPLACE FUNCTION public._ambito_registrazioni(p_token text)
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
  -- collaboratori del settore, di tutti i settori ("entrambi") o che vi lavorano (reparti
  -- extra): le loro registrazioni servono anche dove lavorano (piano, malattie, schede)
  SELECT COALESCE(array_agg(DISTINCT lower(c.nome)), ARRAY[]::text[]) INTO v_nomi
    FROM collaboratori c
   WHERE lower(COALESCE(c.reparto_dip, 'slots')) = ANY(v_set)
      OR lower(c.reparto_dip) = 'entrambi'
      OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(c.reparti_extra, '')), ',')) x
                  WHERE btrim(x) = ANY(v_set));
  RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
      || ' OR lower(nome) = ANY(' || quote_literal(v_nomi::text) || '::text[]))';
END;
$function$;

-- ------------------------------------------------------------
-- 1) PIANO: le scritture del Diario le controlla il database
-- ------------------------------------------------------------
-- Chi scrive e con quali settori, per il trigger (solo dentro secure_insert / secure_update
-- / secure_delete sul piano; vuoto = scrittura di una funzione del server, nessun controllo):
--   '*' = tutto (amministratore, o chi scrive il piano in tutti i settori)
--   'slots,tavoli' = chi scrive il piano in questi settori (altrove: come il Diario)
--   '-' = solo le scritture del Diario (malattia e ND)
CREATE OR REPLACE FUNCTION public._piano_imposta_ambito(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_val TEXT;
  v_set TEXT[];
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN
    v_val := '*';
  ELSIF NOT _piano_scrittura_piena(p_token) THEN
    v_val := '-';
  ELSE
    v_set := _settori_operatore(p_token, true);
    v_val := CASE WHEN v_set IS NULL THEN '*' ELSE COALESCE(NULLIF(array_to_string(v_set, ','), ''), '-') END;
  END IF;
  PERFORM set_config('diario.piano_scrittura', v_val, true);
END;
$function$;

-- com era la cella sotto la malattia o la ND, secondo il DATABASE (mai secondo il browser):
-- 1) prima_malattia; 2) lo storico del piano (ultima volta che la cella e diventata M/ND da
-- un altra sigla); 3) solo per celle mai toccate da quando c e lo storico: la nota
-- "Ex <sigla>" scritta allora dal programma. NULL = sotto non c era niente (si cancella).
CREATE OR REPLACE FUNCTION public._piano_sotto_malattia(r public.piano)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v JSONB;
  v_sigla TEXT;
BEGIN
  IF jsonb_typeof(r.prima_malattia) = 'object' AND COALESCE(r.prima_malattia ->> 'codice', '') <> '' THEN
    RETURN r.prima_malattia;
  END IF;
  IF r.id IS NULL THEN RETURN NULL; END IF;
  SELECT s.prima INTO v
    FROM piano_storico s
   WHERE s.piano_id = r.id AND s.azione = 'modifica'
     AND upper(COALESCE(s.dopo ->> 'codice', '')) IN ('M', 'M1', 'ND')
     AND upper(COALESCE(s.prima ->> 'codice', '')) NOT IN ('M', 'M1', 'ND', '')
   ORDER BY s.id DESC
   LIMIT 1;
  IF v IS NOT NULL THEN
    RETURN jsonb_build_object('codice', v ->> 'codice', 'protetto', COALESCE(v -> 'protetto', 'false'::jsonb),
      'generato', COALESCE(v -> 'generato', 'false'::jsonb), 'commento', v -> 'commento',
      'motivo_blocco', v -> 'motivo_blocco')
      || CASE WHEN jsonb_typeof(v -> 'prima_malattia') = 'object'
              THEN jsonb_build_object('prima_malattia', v -> 'prima_malattia') ELSE '{}'::jsonb END;
  END IF;
  IF EXISTS (SELECT 1 FROM piano_storico s WHERE s.piano_id = r.id) THEN
    RETURN NULL; -- la cella e nata M/ND (o la nota e stata scritta dopo): sotto niente
  END IF;
  v_sigla := substring(COALESCE(r.commento, '') FROM '^(?:Ex|Malattia dal Diario . era) ([A-Z0-9]+)');
  IF v_sigla IS NULL OR upper(v_sigla) IN ('M', 'M1', 'ND') THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('codice', v_sigla, 'protetto', v_sigla IN ('V', 'V1', 'CGF'),
    'generato', COALESCE(r.commento, '') ~ '\(bozza\)', 'commento', NULL, 'motivo_blocco', NULL);
END;
$function$;

-- il controllo, cella per cella, delle scritture che passano come "Diario"
CREATE OR REPLACE FUNCTION public._piano_controllo_diario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, extensions
AS $function$
DECLARE
  v_amb TEXT := NULLIF(current_setting('diario.piano_scrittura', true), '');
  v_rep TEXT;
  v_mal_old BOOLEAN;
  v_mal_new BOOLEAN;
  v_sotto JSONB;
BEGIN
  IF v_amb IS NULL OR v_amb = '*' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_rep := lower(COALESCE(CASE WHEN TG_OP = 'INSERT' THEN NEW.reparto_dip ELSE OLD.reparto_dip END, 'slots'));
  IF v_amb <> '-' AND v_rep = ANY(string_to_array(v_amb, ',')) THEN
    -- cella di un settore proprio: una cella spostata va in un settore proprio (la malattia prevale)
    IF TG_OP = 'UPDATE' AND lower(COALESCE(NEW.reparto_dip, 'slots')) <> v_rep
       AND NOT (lower(COALESCE(NEW.reparto_dip, 'slots')) = ANY(string_to_array(v_amb, ',')))
       AND upper(COALESCE(NEW.codice, '')) NOT IN ('M', 'ND') THEN
      RAISE EXCEPTION 'Piano di un altro settore: %', NEW.reparto_dip;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- PERCORSO DEL DIARIO: malattia (M, M1) e non disponibilita (ND)
  IF TG_OP = 'INSERT' THEN
    IF upper(COALESCE(NEW.codice, '')) NOT IN ('M', 'ND') THEN
      RAISE EXCEPTION 'Permesso mancante: modificare il piano';
    END IF;
    NEW.protetto := true;
    NEW.generato := false;
    NEW.motivo_blocco := NULL;
    NEW.prima_malattia := NULL; -- sotto non c era niente
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF upper(COALESCE(OLD.codice, '')) NOT IN ('M', 'M1', 'ND') THEN
      RAISE EXCEPTION 'Permesso mancante: modificare il piano';
    END IF;
    v_sotto := _piano_sotto_malattia(OLD);
    IF v_sotto IS NOT NULL THEN
      RAISE EXCEPTION 'Permesso mancante: la % copre la sigla % (si toglie rimettendo la sigla)', OLD.codice, v_sotto ->> 'codice';
    END IF;
    RETURN OLD;
  END IF;

  -- modifica
  IF NEW.reparto_dip IS DISTINCT FROM OLD.reparto_dip OR NEW.collaboratore IS DISTINCT FROM OLD.collaboratore
     OR NEW.data IS DISTINCT FROM OLD.data THEN
    RAISE EXCEPTION 'Permesso mancante: settore, persona e giorno della cella non si cambiano';
  END IF;
  v_mal_old := upper(COALESCE(OLD.codice, '')) IN ('M', 'M1', 'ND');
  v_mal_new := upper(COALESCE(NEW.codice, '')) IN ('M', 'M1', 'ND');
  IF v_mal_new AND (NOT v_mal_old OR (upper(OLD.codice) = 'ND' AND upper(NEW.codice) IN ('M', 'M1'))) THEN
    -- la malattia (o la ND) copre la cella: com era la scrive il database
    NEW.prima_malattia := jsonb_build_object('codice', OLD.codice, 'protetto', COALESCE(OLD.protetto, false),
      'generato', COALESCE(OLD.generato, false), 'commento', OLD.commento, 'motivo_blocco', OLD.motivo_blocco)
      || CASE WHEN jsonb_typeof(OLD.prima_malattia) = 'object'
              THEN jsonb_build_object('prima_malattia', OLD.prima_malattia) ELSE '{}'::jsonb END;
    NEW.protetto := true;
    NEW.generato := false;
    NEW.motivo_blocco := NULL;
  ELSIF v_mal_new THEN
    -- resta malattia / ND (anche M <-> M1, M -> ND): sotto resta quello di prima
    NEW.prima_malattia := OLD.prima_malattia;
    NEW.protetto := OLD.protetto;
    NEW.generato := OLD.generato;
    NEW.motivo_blocco := OLD.motivo_blocco;
  ELSIF v_mal_old THEN
    -- la malattia si toglie: torna SOLO la sigla di prima, com era
    v_sotto := _piano_sotto_malattia(OLD);
    IF v_sotto IS NULL OR upper(v_sotto ->> 'codice') IS DISTINCT FROM upper(NEW.codice) THEN
      RAISE EXCEPTION 'Permesso mancante: togliendo la malattia torna solo la sigla di prima (%)',
        COALESCE(v_sotto ->> 'codice', 'nessuna: la cella si cancella');
    END IF;
    NEW.codice := v_sotto ->> 'codice';
    NEW.protetto := COALESCE((v_sotto ->> 'protetto')::boolean, false);
    NEW.generato := COALESCE((v_sotto ->> 'generato')::boolean, false);
    NEW.commento := NULLIF(v_sotto ->> 'commento', '');
    NEW.motivo_blocco := NULLIF(v_sotto ->> 'motivo_blocco', '');
    NEW.prima_malattia := CASE WHEN jsonb_typeof(v_sotto -> 'prima_malattia') = 'object' THEN v_sotto -> 'prima_malattia' END;
  ELSE
    RAISE EXCEPTION 'Permesso mancante: modificare il piano';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS piano_diario_trg ON public.piano;
CREATE TRIGGER piano_diario_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.piano
  FOR EACH ROW EXECUTE FUNCTION public._piano_controllo_diario();

-- la parte "Diario" del filtro: settore, protetto, blocco, prima_malattia non sono piu
-- dati del browser (protetto, generato, motivo_blocco e prima_malattia sono ammessi perche
-- il programma li manda, ma il valore lo decide il trigger); il ritorno della sigla lo
-- controlla il trigger (non piu la nota scritta dal browser)
CREATE OR REPLACE FUNCTION public._piano_ambito_solo_diario(p_azione text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public, extensions
AS $function$
DECLARE
  v_cod TEXT;
  v_chiave TEXT;
BEGIN
  IF p_azione = 'delete' THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'')';
  END IF;
  FOR v_chiave IN SELECT jsonb_object_keys(COALESCE(p_data, '{}'::jsonb)) LOOP
    IF v_chiave NOT IN ('codice', 'protetto', 'generato', 'motivo_blocco', 'commento', 'operatore', 'updated_at',
                        'prima_malattia') THEN
      RAISE EXCEPTION 'Permesso mancante: modificare il piano (%)', v_chiave;
    END IF;
  END LOOP;
  IF NOT (p_data ? 'codice') THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'')';
  END IF;
  v_cod := upper(btrim(p_data ->> 'codice'));
  IF v_cod IN ('M', 'ND') THEN
    RETURN ''; -- la malattia e la non disponibilita prevalgono su qualsiasi sigla
  END IF;
  IF v_cod !~ '^[A-Z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il piano';
  END IF;
  -- togliendo la malattia torna la sigla di prima: quale, lo decide il trigger
  RETURN ' AND codice IN (''M'', ''M1'', ''ND'')';
END;
$function$;

-- ------------------------------------------------------------
-- 5) CHAT: un solo gruppo Tutti / Tutti Slots / Tutti Tavoli
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_get_or_create_group(p_token text, p_tipo text, p_legacy_gid text, p_nome text, p_members text[])
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_group_id BIGINT;
  v_member TEXT;
  v_set TEXT[];
  v_riservato TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- 20260913: tipi previsti; i gruppi di tutti hanno il loro codice riservato
  IF COALESCE(p_tipo, '') NOT IN ('custom', 'slots', 'tavoli', 'tutti') THEN
    RAISE EXCEPTION 'Tipo di gruppo non valido: %', p_tipo;
  END IF;
  v_riservato := CASE p_tipo WHEN 'tutti' THEN '__gruppo_tutti' WHEN 'slots' THEN '__gruppo_slots'
                             WHEN 'tavoli' THEN '__gruppo_tavoli' END;
  IF v_riservato IS NOT NULL AND p_legacy_gid IS DISTINCT FROM v_riservato THEN
    RAISE EXCEPTION 'Gruppo % riservato: codice %', p_tipo, v_riservato;
  END IF;
  IF p_tipo = 'custom' AND p_legacy_gid IN ('__gruppo_tutti', '__gruppo_slots', '__gruppo_tavoli') THEN
    RAISE EXCEPTION 'Codice di gruppo riservato';
  END IF;
  -- due PC che creano lo stesso gruppo nello stesso momento: uno aspetta l altro
  PERFORM pg_advisory_xact_lock(hashtext('chat_gruppo|' || COALESCE(v_riservato, p_legacy_gid, '')));

  -- Cerca per legacy_gid (riusa gruppo esistente)
  SELECT id INTO v_group_id FROM chat_groups WHERE legacy_gid = p_legacy_gid ORDER BY id LIMIT 1;
  -- gruppi di tutti: uno per tipo (anche se scritto con un altro codice)
  IF v_group_id IS NULL AND v_riservato IS NOT NULL THEN
    SELECT id INTO v_group_id FROM chat_groups WHERE tipo = p_tipo ORDER BY id LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    -- 20260911: un gruppo di settore lo crea chi e del settore
    IF p_tipo IN ('slots', 'tavoli') THEN
      v_set := _settori_operatore(p_token, false);
      IF v_set IS NOT NULL AND NOT (p_tipo = ANY(v_set)) THEN
        RAISE EXCEPTION 'Gruppo di un altro settore';
      END IF;
    END IF;
    -- Crea nuovo
    INSERT INTO chat_groups(nome, tipo, legacy_gid, creato_da)
    VALUES (p_nome, p_tipo, p_legacy_gid, v_op)
    RETURNING id INTO v_group_id;

    -- Aggiungi membri
    IF p_members IS NOT NULL THEN
      FOREACH v_member IN ARRAY p_members LOOP
        INSERT INTO chat_group_members(group_id, operatore)
        VALUES (v_group_id, v_member)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN v_group_id;
END;
$function$;

-- ------------------------------------------------------------
-- 2) 3) 4) 5) CONTROLLI DI SCRITTURA: Rapporto, punti automatici, gruppi della chat
--    (come 20260911, con le aggiunte segnate 20260913)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
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
        v_conf := NULLIF(v_cfg -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric;
      ELSE
        SELECT NULLIF(a ->> 'punti', '')::numeric INTO v_conf
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg -> 'azioni') = 'array' THEN v_cfg -> 'azioni' ELSE '[]'::jsonb END) a
         WHERE a ->> 'key' = v_az LIMIT 1;
      END IF;
      IF v_conf IS NULL OR v_pt IS DISTINCT FROM v_conf THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi (solo gli incentivi configurati)';
      END IF;
      IF v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata') THEN
        -- popup della copertura dopo una malattia: chiunque, ma (20260913) con un motivo,
        -- una volta sola per collaboratore + azione + motivo (il doppio accredito
        -- consapevole lo fa chi ha Punti e premi) e al massimo 5 in 24 ore
        IF btrim(COALESCE(p_data ->> 'descrizione', '')) = '' THEN
          RAISE EXCEPTION 'Permesso mancante: punti automatici senza motivo (Punti e premi)';
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
    ELSIF p_azione = 'insert' AND (p_data ->> 'tipo') IN ('assunzione', 'cessazione', 'giubileo', 'congedo_np')
          AND NOT _hr_modifica(p_token) THEN
      RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare)';
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


-- 2) lettura del Rapporto solo con la pagina
CREATE OR REPLACE FUNCTION public.secure_read(p_token text, p_table text, p_filter text DEFAULT ''::text, p_order text DEFAULT ''::text, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
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
          || ' WHERE data_nascita IS NOT NULL) maison_budget';
      ELSE
        v_from := '(SELECT * FROM maison_budget WHERE false) maison_budget';
      END IF;
    ELSIF p_table = 'registrazioni' THEN
      v_amb := _ambito_registrazioni(p_token);
      IF v_amb <> '' THEN
        v_from := '(SELECT * FROM registrazioni WHERE TRUE' || v_amb || ') registrazioni';
      END IF;
    ELSIF p_table = 'push_subscriptions' THEN
      v_from := '(SELECT * FROM push_subscriptions WHERE operatore = ' || quote_literal(v_op) || ') push_subscriptions';
    -- 20260913: il Rapporto lo legge chi ha la pagina Rapporto (gli altri: vuoto, niente errore)
    ELSIF p_table = 'rapporti_giornalieri' AND NOT _pagina_visibile(p_token, 'rapporto') THEN
      v_from := '(SELECT * FROM rapporti_giornalieri WHERE false) rapporti_giornalieri';
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


-- 1) 3) autore = sessione; il piano passa dal trigger
CREATE OR REPLACE FUNCTION public.secure_insert(p_token text, p_table text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_result JSON;
  v_cols TEXT := '';
  v_vals TEXT := '';
  v_key TEXT;
  v_val JSONB;
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
    ELSIF p_table = 'log_attivita' AND p_data ? 'operatore' THEN
      p_data := jsonb_set(p_data, '{operatore}', to_jsonb(v_op));
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
  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ') VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;
  IF p_table = 'piano' THEN
    PERFORM set_config('diario.piano_scrittura', '', true);
  END IF;

  RETURN v_result;
END;
$function$;


-- ------------------------------------------------------------
-- 9) secure_update: una riga chiesta per numero ma esclusa dai permessi e un ERRORE
--    (prima 0 righe e "fatto"); autore = sessione (Rapporto); autore di registrazioni e
--    moduli: ammesso solo uguale a quello di prima; il piano passa dal trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.secure_update(p_token text, p_table text, p_filter text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
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

-- 1) cancellazioni del piano: dal trigger
CREATE OR REPLACE FUNCTION public.secure_delete(p_token text, p_table text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_ambito TEXT := '';
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
    v_ambito := v_ambito || ' AND (azione IN (''copertura'', ''cambio_turno'', ''disponibilita_negata'')'
      || CASE WHEN _sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                   OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione = ''competenza'' OR azione ~ ''^livello_[0-9]+$''' ELSE '' END
      || CASE WHEN _sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')
              THEN ' OR azione IN (''sessione_formativa'', ''formatore'')' ELSE '' END
      || ')';
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


-- 3) piano in blocco: autore = sessione
CREATE OR REPLACE FUNCTION public.piano_bulk_upsert(p_token text, p_rows jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_ins INT := 0;
  r JSONB;
  v_rep TEXT;
  v_da DATE;
  v_a DATE;
  v_set TEXT[];
  v_admin BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
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
  -- 20260911: le celle dei propri settori (accessi extra con modifica compresi)
  v_set := _settori_operatore(p_token, true);
  IF v_set IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_rows) x
        WHERE NOT (lower(COALESCE(x ->> 'reparto_dip', 'slots')) = ANY(v_set))
          AND upper(COALESCE(x ->> 'codice', '')) NOT IN ('M', 'ND')) THEN
    RAISE EXCEPTION 'Piano di un altro settore: si scrivono solo le celle dei propri settori';
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
      -- 20260913: autore = chi e collegato (l amministratore puo riportare quello di prima)
      CASE WHEN v_admin THEN COALESCE(NULLIF(r->>'operatore', ''), v_op) ELSE v_op END,
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


-- ------------------------------------------------------------
-- DIRITTI
-- ------------------------------------------------------------
-- funzioni interne: mai eseguibili da fuori
REVOKE EXECUTE ON FUNCTION public._verify_admin_session(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ambito_collaboratori(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ambito_registrazioni(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_imposta_ambito(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_sotto_malattia(public.piano) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_controllo_diario() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_ambito_solo_diario(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._controlla_permessi_scrittura(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
-- funzioni del programma: eseguibili con la chiave pubblica (il controllo e dentro)
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.secure_read(text, text, text, text, integer, integer)', 'public.secure_insert(text, text, jsonb)',
    'public.secure_update(text, text, text, jsonb)', 'public.secure_delete(text, text, text)',
    'public.piano_bulk_upsert(text, jsonb)', 'public.chat_get_or_create_group(text, text, text, text, text[])',
    'public.is_default_master_pwd(text)', 'public.renew_op_session(text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END
$$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260913_chiusure_finali')
ON CONFLICT (nome) DO NOTHING;

-- PostgREST rilegge l elenco delle funzioni e delle colonne (operator_sessions.catena_inizio)
NOTIFY pgrst, 'reload schema';
