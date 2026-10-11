-- ============================================================
-- PERMESSI DEGLI OPERATORI NEL DATABASE, PASSWORD, SESSIONI E DIRITTI DI BASE
-- (controllo di sicurezza dell 11/10/2026, ondata 1)
--
-- Le falle chiuse qui erano tutte "solo nella pagina": dalla console del browser, con
-- una sessione da operatore qualsiasi, il database le lasciava passare.
--
-- 1) CANCELLAZIONI E MODIFICHE LARGHE. secure_delete e secure_update accettavano
--    qualunque filtro: un operatore cancellava DEFINITIVAMENTE registrazioni altrui o
--    svuotava tabelle con un filtro largo (es. created_at > '2000-01-01').
--    Ora, per chi non e amministratore:
--    - registrazioni e moduli (le tabelle con il Cestino): nessuna cancellazione vera,
--      si cestinano (eliminato = true) come oggi; la cancellazione definitiva e
--      dell amministratore (decisione del titolare). Modifiche solo per numero (id),
--      autore, numero e data di creazione non si cambiano.
--    - le altre tabelle che il programma fa cancellare agli operatori (promemoria,
--      consegne, chat, Maison, inventario, punti, ...): solo con il filtro per numero
--      (id = / id IN), oppure con le sole forme che il programma usa davvero (un giorno
--      Maison del proprio settore, la pulizia Maison oltre i giorni di conservazione,
--      la nota fissata di una registrazione, l uscita da un gruppo della chat);
--    - piano e configurazione del piano: restano le regole dei permessi del piano.
-- 2) PERMESSI DELLE PAGINE ANCHE NEL DATABASE (stessa regola di isVis in settings.js:
--    pagina non configurata = tutti, Piano non configurato = amministratore):
--    - Consegna: scrive chi vede la pagina (chi la riceve puo sempre segnarla letta);
--    - Maison (costi, spese extra, regali, note clienti, budget): legge e scrive chi
--      vede la pagina; i compleanni dei clienti (avviso "Compleanni maison") restano a
--      chi ha l avviso, con nome e data di nascita soltanto;
--    - Registro attivita (log_attivita): intero solo a chi vede il Registro; gli altri
--      ricevono le proprie righe, quelle del piano (storico, cambi) e l ultimo accesso
--      dei colleghi (per "attivo X min fa" della chat), senza azione e dettaglio;
--    - punti incentivo: chi non ha "Punti e premi" scrive solo gli incentivi
--      automatici del programma (copertura, cambio, rifiuto da chiunque; competenze,
--      livelli, formazioni con i loro permessi) e solo con i punti configurati;
--    - Diario per SETTORE: chi ha un solo settore legge e modifica le registrazioni
--      del suo settore (e di quelli degli accessi extra) piu quelle dei collaboratori
--      che lavorano anche nel suo settore (reparti extra); "entrambi" e amministratore
--      tutto, come prima;
--    - parse_assenze_transactional (assenze dal Rapporto) passa dagli stessi controlli
--      di secure_insert/secure_update/secure_delete.
-- 3) CHAT: i membri dei gruppi non si spostano (nessuna modifica di chat_group_members
--    per gli operatori); si scrive solo nei gruppi di cui si e membri, nei gruppi creati
--    o nei gruppi Tutti / del proprio settore; letti e nascosti solo per se stessi;
--    un messaggio non cambia gruppo o destinatario; nei gruppi di settore si aggiungono
--    solo colleghi del settore.
-- 4) PIANO PER SETTORE: chi scrive il piano scrive le celle dei propri settori (e degli
--    accessi extra con modifica). Le scritture del Diario (M e ND, e il ritorno della
--    sigla di prima) valgono come prima in ogni settore: la malattia prevale.
-- 5) COLLABORATORI: un operatore crea collaboratori solo nei propri settori e solo con
--    i dati che il programma usa (nome, settore, percentuale, funzione, Jolly, turni
--    bloccati); modifica solo collaboratori dei propri settori (o che vi lavorano).
-- 6) NOTIFICHE PUSH: ognuno legge e modifica solo le proprie iscrizioni.
-- 7) PASSWORD: l impronta della password calcolata nel browser (PBKDF2) era salvata
--    cosi com era: chi leggeva il database (copia, chiavetta) poteva entrare usandola
--    al posto della password. Ora nel database c e crypt(impronta) con bcrypt
--    (pgcrypto): vale per operatori, password principale, codice di recupero e per la
--    vecchia impronta SHA-256 (che si cancella al primo accesso riuscito). Le righe
--    esistenti si convertono qui; il login non cambia per nessuno.
--    Il browser invia la vecchia impronta solo se il database la chiede (serve_legacy).
-- 8) SESSIONI: il rinnovo vale fino a 12 ore dopo la scadenza (prima 7 giorni: un
--    computer lasciato acceso dopo il turno o un token copiato restavano buoni una
--    settimana; 12 ore coprono la pausa fra due turni) e una sola volta per token
--    (ripetuto entro 2 minuti restituisce lo stesso token nuovo: risposta persa per
--    strada). Il recupero della password principale chiude le sessioni amministratore.
-- 9) DIRITTI DI BASE: anon e authenticated avevano tutti i diritti su tutte le tabelle
--    (diritti predefiniti di Supabase); reggeva solo la RLS. Il programma legge e
--    scrive SOLO con le funzioni (secure_*, verify_login, ...): i diritti diretti si
--    tolgono, anche per le tabelle future.
-- 10) check_deve_cambiare risponde solo alla sessione della persona stessa (prima
--    chiunque sapeva chi aveva una password provvisoria). list_operators resta aperta:
--    il login ha bisogno dell elenco dei nomi.
--
-- Effetti per gli operatori: niente "Elimina definitivamente" (era gia solo
-- dell amministratore nella pagina); niente letture del Registro completo dalla console.
-- Dopo la migrazione NON serve che le persone rientrino: password e sessioni restano
-- valide (le impronte si convertono, il login le riconosce).
-- Per tornare indietro sui diritti di base (punto 9):
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
-- Si puo rilanciare.
-- ============================================================

ALTER TABLE public.operator_sessions ADD COLUMN IF NOT EXISTS rinnovato_in TEXT;

-- ------------------------------------------------------------
-- AIUTI
-- ------------------------------------------------------------

-- pagina visibile all operatore della sessione: stessa regola di isVis (settings.js)
CREATE OR REPLACE FUNCTION public._pagina_visibile(p_token text, p_chiave text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_cfg JSONB;
  v_extra JSONB;
  v JSONB;
  e JSONB;
BEGIN
  SELECT operatore, COALESCE(is_admin, false) INTO v_op, v_admin
    FROM operator_sessions WHERE token = p_token AND expires_at > now() LIMIT 1;
  IF v_op IS NULL THEN RETURN false; END IF;
  IF v_admin THEN RETURN true; END IF;
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'visibilita';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  v := v_cfg -> p_chiave;
  IF v IS NULL OR v = 'null'::jsonb THEN
    RETURN p_chiave <> 'piano'; -- non configurata: tutti (il Piano: solo amministratore)
  END IF;
  IF jsonb_typeof(v) = 'string' AND (v #>> '{}') = 'nascosto' THEN RETURN false; END IF;
  -- accesso extra che concede proprio questa pagina: vince sulle regole (non su "nascosto")
  BEGIN
    SELECT valore::jsonb -> v_op INTO v_extra FROM impostazioni WHERE chiave = 'operatori_accessi_extra';
  EXCEPTION WHEN others THEN
    v_extra := NULL;
  END;
  IF jsonb_typeof(v_extra) = 'object' THEN
    FOR e IN SELECT x.value FROM jsonb_each(v_extra) x LOOP
      IF (jsonb_typeof(e) = 'array' AND e ? p_chiave)
         OR (jsonb_typeof(e) = 'object' AND jsonb_typeof(e -> 'pagine') = 'array' AND (e -> 'pagine') ? p_chiave) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(v) = 'string' THEN
    RETURN (v #>> '{}') <> 'admin';
  END IF;
  IF jsonb_typeof(v) = 'object' AND v ->> 'tipo' = 'selezionati' THEN
    RETURN COALESCE((v -> 'operatori') ? v_op, false);
  END IF;
  RETURN true;
END;
$function$;

-- settori dell operatore della sessione: NULL = tutti (amministratore, "entrambi" o
-- operatore senza settore). p_scrittura: degli accessi extra solo quelli con "modifica"
CREATE OR REPLACE FUNCTION public._settori_operatore(p_token text, p_scrittura boolean)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_proprio TEXT;
  v_extra JSONB;
  v_out TEXT[];
  k TEXT;
  e JSONB;
BEGIN
  SELECT operatore, COALESCE(is_admin, false) INTO v_op, v_admin
    FROM operator_sessions WHERE token = p_token AND expires_at > now() LIMIT 1;
  IF v_op IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  IF v_admin THEN RETURN NULL; END IF;
  BEGIN
    SELECT lower(btrim(valore::jsonb ->> v_op)) INTO v_proprio FROM impostazioni WHERE chiave = 'operatori_reparto';
  EXCEPTION WHEN others THEN
    v_proprio := NULL;
  END;
  IF v_proprio IS NULL OR v_proprio IN ('', 'entrambi') THEN RETURN NULL; END IF;
  v_out := ARRAY[v_proprio];
  BEGIN
    SELECT valore::jsonb -> v_op INTO v_extra FROM impostazioni WHERE chiave = 'operatori_accessi_extra';
  EXCEPTION WHEN others THEN
    v_extra := NULL;
  END;
  IF jsonb_typeof(v_extra) = 'object' THEN
    FOR k, e IN SELECT x.key, x.value FROM jsonb_each(v_extra) x LOOP
      IF NOT p_scrittura OR (jsonb_typeof(e) = 'object' AND COALESCE(e ->> 'modifica', '') = 'true') THEN
        v_out := v_out || lower(k);
      END IF;
    END LOOP;
  END IF;
  RETURN v_out;
END;
$function$;

-- filtro "per numero": comincia con id = '...' oppure id IN ('...', ...)
CREATE OR REPLACE FUNCTION public._filtro_per_id(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_lit TEXT := $r$'(?:[^']|'')*'$r$;
BEGIN
  IF p IS NULL THEN RETURN false; END IF;
  RETURN p ~ ('^id (= ' || v_lit || '|IN \(' || v_lit || '(, ' || v_lit || ')*\))( AND .*)?$');
END;
$function$;

-- condizione SQL delle registrazioni del Diario visibili all operatore (vuota = tutte)
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
  -- collaboratori del settore o che vi lavorano (reparti extra): le loro registrazioni
  -- servono anche dove lavorano (piano, malattie, schede)
  SELECT COALESCE(array_agg(DISTINCT lower(c.nome)), ARRAY[]::text[]) INTO v_nomi
    FROM collaboratori c
   WHERE lower(COALESCE(c.reparto_dip, 'slots')) = ANY(v_set)
      OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(c.reparti_extra, '')), ',')) x
                  WHERE btrim(x) = ANY(v_set));
  RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
      || ' OR lower(nome) = ANY(' || quote_literal(v_nomi::text) || '::text[]))';
END;
$function$;

-- condizione SQL dei collaboratori dei settori dell operatore (vuota = tutti)
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
      || ' OR EXISTS (SELECT 1 FROM unnest(string_to_array(lower(COALESCE(reparti_extra, '''')), '','')) x'
      || ' WHERE btrim(x) = ANY(' || quote_literal(v_set::text) || '::text[])))';
END;
$function$;

-- lettura ridotta: le colonne scelte, le altre vuote (NULL dello stesso tipo)
CREATE OR REPLACE FUNCTION public._proiezione(p_table text, p_colonne text[])
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path = public, extensions
AS $function$
  SELECT 'SELECT ' || string_agg(
           CASE WHEN a.attname = ANY(p_colonne) THEN quote_ident(a.attname)
                ELSE 'NULL::' || format_type(a.atttypid, a.atttypmod) || ' AS ' || quote_ident(a.attname) END,
           ', ' ORDER BY a.attnum)
         || ' FROM ' || quote_ident(p_table)
    FROM pg_attribute a
   WHERE a.attrelid = ('public.' || quote_ident(p_table))::regclass AND a.attnum > 0 AND NOT a.attisdropped;
$function$;

-- PIANO: la parte "Diario" (M e ND, ritorno della sigla scritta nella nota). Pura: non
-- guarda i permessi. Era il corpo di _piano_ambito_diario per chi non scrive il piano.
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
    IF v_chiave NOT IN ('codice', 'protetto', 'generato', 'motivo_blocco', 'commento', 'operatore', 'updated_at', 'reparto_dip') THEN
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
  -- togliendo la malattia torna SOLO la sigla scritta nella nota della M o della ND
  RETURN ' AND codice IN (''M'', ''M1'', ''ND'') AND commento ~ '
    || quote_literal('^(Ex|Malattia dal Diario . era) ' || v_cod || '( |$)');
END;
$function$;

-- PIANO: ambito delle modifiche e cancellazioni. Chi scrive il piano: le celle dei suoi
-- settori (accessi extra con modifica compresi); in ogni settore valgono comunque le
-- scritture del Diario (M, ND, ritorno della sigla). Gli altri: solo quelle del Diario.
CREATE OR REPLACE FUNCTION public._piano_ambito_diario(p_token text, p_azione text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_set TEXT[];
  v_dia TEXT;
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN RETURN ''; END IF;
  IF NOT _piano_scrittura_piena(p_token) THEN
    RETURN _piano_ambito_solo_diario(p_azione, p_data);
  END IF;
  v_set := _settori_operatore(p_token, true);
  IF v_set IS NULL THEN RETURN ''; END IF;
  BEGIN
    v_dia := _piano_ambito_solo_diario(p_azione, p_data);
  EXCEPTION WHEN others THEN
    v_dia := NULL; -- non e una scrittura del Diario: solo i propri settori
  END;
  RETURN ' AND (lower(COALESCE(reparto_dip, ''slots'')) = ANY(' || quote_literal(v_set::text) || '::text[])'
    || CASE WHEN v_dia IS NULL THEN '' ELSE ' OR (TRUE' || v_dia || ')' END || ')';
END;
$function$;

-- ------------------------------------------------------------
-- CONTROLLI DI SCRITTURA (per tabella, sui dati)
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
        NULL; -- popup della copertura dopo una malattia: chiunque
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

-- ------------------------------------------------------------
-- FILTRI DELLE CANCELLAZIONI E MODIFICHE (forme ammesse per chi non e amministratore)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._controlla_filtro_scrittura(p_token text, p_table text, p_azione text, p_filter text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_lit TEXT := $r$'(?:[^']|'')*'$r$;
  v_giorni INT;
  v_data DATE;
  v_rep TEXT;
  v_set TEXT[];
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN RETURN; END IF;
  IF _filtro_per_id(p_filter) THEN RETURN; END IF;
  -- tabelle dove si lavora sempre per riga (id)
  IF p_table IN ('registrazioni', 'moduli', 'promemoria', 'consegne_turno', 'chat_messages', 'chat_groups',
                 'note_colleghi', 'scadenze', 'maison_budget', 'inventario', 'punti_eventi', 'valutazioni',
                 'push_subscriptions', 'collaboratori', 'log_attivita', 'hr_eventi', 'hr_allegati')
     OR (p_table IN ('regali_maison', 'note_clienti') AND p_azione = 'delete') THEN
    RAISE EXCEPTION 'Modifica o cancellazione consentita solo per singole righe (id) su %', p_table;
  END IF;
  -- nota fissata della registrazione
  IF p_table = 'note_fissate' THEN
    IF p_filter ~ ('^registrazione_id (= ' || v_lit || '|IN \(' || v_lit || '(, ' || v_lit || ')*\))$') THEN RETURN; END IF;
    RAISE EXCEPTION 'Filtro non consentito su %', p_table;
  END IF;
  -- uscita da un gruppo (o membro tolto da chi ha creato il gruppo): una riga
  IF p_table = 'chat_group_members' THEN
    IF p_azione = 'delete' AND p_filter ~ ('^group_id = ' || v_lit || ' AND operatore = ' || v_lit || '$') THEN RETURN; END IF;
    RAISE EXCEPTION 'Filtro non consentito su %', p_table;
  END IF;
  -- rapporto del giorno: data, turno e settore
  IF p_table = 'rapporti_giornalieri' THEN
    IF p_filter ~ ('^data_rapporto = ' || v_lit || ' AND turno = ' || v_lit || ' AND reparto_dip = ' || v_lit || '$') THEN RETURN; END IF;
    RAISE EXCEPTION 'Filtro non consentito su %', p_table;
  END IF;
  -- MAISON: rinomina di un cliente nel proprio settore (modifica)
  IF p_table IN ('costi_maison', 'regali_maison', 'note_clienti') AND p_azione = 'update' THEN
    IF p_filter ~ ('^nome = ' || v_lit || ' AND reparto_dip (= ' || v_lit || '|IS NULL)$') THEN RETURN; END IF;
    RAISE EXCEPTION 'Filtro non consentito su %', p_table;
  END IF;
  IF p_table = 'spese_extra' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Modifica consentita solo per singole righe (id) su %', p_table;
  END IF;
  -- MAISON: un giorno del proprio settore (import: sostituzione del giorno e righe vecchie
  -- senza settore) e pulizia oltre i giorni di conservazione
  IF p_table IN ('costi_maison', 'spese_extra') AND p_azione = 'delete' THEN
    IF _filtro_sostituzione_ok(p_table, p_filter) THEN
      v_rep := COALESCE(substring(p_filter FROM 'reparto_dip = ''([^'']*)''$'), 'slots');
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NULL OR lower(v_rep) = ANY(v_set) THEN RETURN; END IF;
      RAISE EXCEPTION 'Maison di un altro settore: %', v_rep;
    END IF;
    IF p_table = 'costi_maison' AND p_filter ~ ('^data_giornata < ''[0-9]{4}-[0-9]{2}-[0-9]{2}''$') THEN
      v_data := substring(p_filter FROM '([0-9]{4}-[0-9]{2}-[0-9]{2})')::date;
      BEGIN
        SELECT NULLIF(valore, '')::int INTO v_giorni FROM impostazioni WHERE chiave = 'maison_auto_delete_giorni';
      EXCEPTION WHEN others THEN
        v_giorni := NULL;
      END;
      IF COALESCE(v_giorni, 0) > 0 AND v_data <= (now() AT TIME ZONE 'Europe/Zurich')::date - (v_giorni - 1) THEN
        RETURN;
      END IF;
    END IF;
    RAISE EXCEPTION 'Cancellazione in blocco Maison: solo amministratore';
  END IF;
  -- tutte le altre tabelle (piano e configurazione del piano): restano le regole dei permessi
END;
$function$;

-- un giorno Maison (import): costi del giorno, spese del Seven del giorno, di un settore
CREATE OR REPLACE FUNCTION public._filtro_sostituzione_ok(p_table text, p_filter text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_lit TEXT := $r$'(?:[^']|'')*'$r$;
BEGIN
  IF p_table = 'spese_extra' THEN
    RETURN p_filter ~ ('^data_spesa = ' || v_lit || ' AND luogo = ''Ristorante Seven'' AND reparto_dip (= ' || v_lit || '|IS NULL)$');
  END IF;
  IF p_table = 'costi_maison' THEN
    RETURN p_filter ~ ('^data_giornata = ' || v_lit || ' AND reparto_dip (= ' || v_lit || '|IS NULL)$');
  END IF;
  RETURN false;
END;
$function$;

-- ------------------------------------------------------------
-- CANALE SICURO
-- ------------------------------------------------------------
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

  EXECUTE 'INSERT INTO ' || quote_ident(p_table) || ' (' || v_cols || ') VALUES (' || v_vals || ') RETURNING row_to_json(' || quote_ident(p_table) || '.*)'
    INTO v_result;

  RETURN v_result;
END;
$function$;

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
      EXECUTE 'UPDATE chat_messages SET ' || v_set || ' WHERE (' || p_filter || ') AND (da_operatore = '
        || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op)
        || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
    ELSE
      EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ') AND da_operatore = ' || quote_literal(v_op);
    END IF;
    RETURN;
  END IF;
  -- v434: piano e chat con il loro ambito; 20260911: Diario e collaboratori per settore,
  -- notifiche e letture solo proprie, password mai da qui
  IF p_table = 'piano' THEN
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
  EXECUTE 'UPDATE ' || quote_ident(p_table) || ' SET ' || v_set || ' WHERE (' || p_filter || ')' || v_ambito;
END;
$function$;

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
  EXECUTE 'DELETE FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter || ')' || v_ambito;
END;
$function$;

-- ASSENZE DAL RAPPORTO: stessi controlli del canale sicuro (prima scriveva le
-- registrazioni senza nessun controllo di permesso), sempre tutto o niente
CREATE OR REPLACE FUNCTION public.parse_assenze_transactional(p_token text, p_ops jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_action TEXT;
  v_payload JSONB;
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_ins JSON;
  v_created INT := 0;
  v_updated INT := 0;
  v_deleted INT := 0;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF jsonb_typeof(p_ops) <> 'array' THEN
    RAISE EXCEPTION 'Le operazioni devono essere un array JSON';
  END IF;
  FOR v_payload IN SELECT * FROM jsonb_array_elements(p_ops)
  LOOP
    v_action := v_payload->>'action';
    IF v_action = 'create' THEN
      v_ins := secure_insert(p_token, 'registrazioni', v_payload->'data');
      v_ids := array_append(v_ids, (v_ins::jsonb ->> 'id')::BIGINT);
      v_created := v_created + 1;
    ELSIF v_action = 'update' THEN
      PERFORM secure_update(p_token, 'registrazioni', 'id = ' || quote_literal((v_payload->>'id')::BIGINT::text), v_payload->'data');
      v_updated := v_updated + 1;
    ELSIF v_action = 'delete' THEN
      PERFORM secure_delete(p_token, 'registrazioni', 'id = ' || quote_literal((v_payload->>'id')::BIGINT::text));
      v_deleted := v_deleted + 1;
    ELSE
      RAISE EXCEPTION 'Azione non valida: %', v_action;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('created_ids', to_jsonb(v_ids), 'created', v_created,
                            'updated', v_updated, 'deleted', v_deleted);
END;
$function$;

-- PIANO in blocco (bozza, vacanze, import): anche qui solo le celle dei propri settori
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

-- impostazioni: password e codice di recupero mai da qui (hanno le loro funzioni)
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_impostazione(text, text, text)'::regprocedure) INTO v_def;
  IF position('20260911' IN v_def) = 0 THEN
    v_def := replace(v_def,
      E'  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;\n',
      E'  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;\n'
      || E'  -- 20260911: password e codice di recupero solo con le loro funzioni\n'
      || E'  IF p_chiave IN (''password_hash'', ''password_hash_v2'', ''recovery_code'') THEN\n'
      || E'    RAISE EXCEPTION ''Password: si cambia solo con la funzione apposita'';\n'
      || E'  END IF;\n');
    IF position('20260911' IN v_def) = 0 THEN
      RAISE EXCEPTION 'upsert_impostazione: punto di inserimento non trovato';
    END IF;
    EXECUTE v_def;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- CHAT: gruppi nuovi solo dei tipi previsti; chi crea un gruppo di settore e del settore
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
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;

  -- Cerca per legacy_gid (riusa gruppo esistente)
  SELECT id INTO v_group_id FROM chat_groups WHERE legacy_gid = p_legacy_gid LIMIT 1;

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
-- PASSWORD: bcrypt (pgcrypto) sopra l impronta del browser
-- ------------------------------------------------------------
-- cifra sempre (scritture nuove)
CREATE OR REPLACE FUNCTION public._pwd_cifra(p text)
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SET search_path = public, extensions
AS $function$
  SELECT CASE WHEN p IS NULL OR p = '' THEN NULL ELSE extensions.crypt(p, extensions.gen_salt('bf', 10)) END;
$function$;

-- confronta: salvato con bcrypt -> crypt; formato vecchio (non ancora convertito, es.
-- un backup reimportato) -> uguaglianza, e chi chiama lo riscrive cifrato
CREATE OR REPLACE FUNCTION public._pwd_verifica(p_dato text, p_salvato text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = public, extensions
AS $function$
BEGIN
  IF p_dato IS NULL OR p_dato = '' OR p_salvato IS NULL OR p_salvato = '' THEN RETURN false; END IF;
  IF p_salvato LIKE '$2_$%' THEN
    RETURN extensions.crypt(p_dato, p_salvato) = p_salvato;
  END IF;
  RETURN p_salvato = p_dato;
END;
$function$;

-- converte tutte le impronte salvate in chiaro (migrazione e dopo un import di backup:
-- IT/migrazione/import_backup.py la richiama)
CREATE OR REPLACE FUNCTION public._password_proteggi_tutte()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  n INT := 0;
  k INT;
BEGIN
  UPDATE operatori_auth SET pwd_hash_v2 = _pwd_cifra(pwd_hash_v2)
   WHERE pwd_hash_v2 IS NOT NULL AND pwd_hash_v2 <> '' AND pwd_hash_v2 NOT LIKE '$2_$%';
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  UPDATE operatori_auth SET pwd_hash = _pwd_cifra(pwd_hash)
   WHERE pwd_hash IS NOT NULL AND pwd_hash <> '' AND pwd_hash NOT LIKE '$2_$%';
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  UPDATE impostazioni SET valore = _pwd_cifra(valore)
   WHERE chiave IN ('password_hash', 'password_hash_v2', 'recovery_code')
     AND valore IS NOT NULL AND valore <> '' AND valore NOT LIKE '$2_$%';
  GET DIAGNOSTICS k = ROW_COUNT; n := n + k;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_login(p_nome text, p_hash text, p_legacy_hash text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_stored_v2 TEXT;
  v_stored_v1 TEXT;
  v_deve_cambiare BOOLEAN;
  v_ruolo TEXT;
  v_session TEXT;
  v_ok BOOLEAN := false;
  v_upgraded BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit(p_nome) THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT pwd_hash_v2, pwd_hash, deve_cambiare_pwd, ruolo
    INTO v_stored_v2, v_stored_v1, v_deve_cambiare, v_ruolo
    FROM operatori_auth WHERE nome = p_nome;
  IF NOT FOUND THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('valid', false, 'found', false);
  END IF;
  IF COALESCE(v_stored_v2, '') <> '' AND _pwd_verifica(p_hash, v_stored_v2) THEN
    v_ok := true;
    -- formato vecchio o impronta SHA-256 ancora presente: si riscrive e si cancella
    IF v_stored_v2 NOT LIKE '$2_$%' OR v_stored_v1 IS NOT NULL THEN
      UPDATE operatori_auth SET pwd_hash_v2 = CASE WHEN v_stored_v2 LIKE '$2_$%' THEN v_stored_v2 ELSE _pwd_cifra(p_hash) END,
                                pwd_hash = NULL
       WHERE nome = p_nome;
    END IF;
  ELSIF COALESCE(v_stored_v1, '') <> '' THEN
    IF p_legacy_hash IS NULL OR p_legacy_hash = '' THEN
      -- serve la vecchia impronta: il browser la manda solo adesso. Se c era anche quella
      -- nuova ed era sbagliata, il tentativo conta (niente tentativi gratis)
      IF COALESCE(v_stored_v2, '') <> '' THEN
        PERFORM _record_attempt(p_nome, false);
      END IF;
      RETURN json_build_object('valid', false, 'found', true, 'serve_legacy', true);
    END IF;
    IF _pwd_verifica(p_legacy_hash, v_stored_v1) THEN
      v_ok := true;
      v_upgraded := true;
      UPDATE operatori_auth SET pwd_hash_v2 = _pwd_cifra(p_hash), pwd_hash = NULL WHERE nome = p_nome;
    END IF;
  END IF;
  IF NOT v_ok THEN
    PERFORM _record_attempt(p_nome, false);
    RETURN json_build_object('valid', false, 'found', true);
  END IF;
  PERFORM _record_attempt(p_nome, true);
  v_session := _create_op_session(p_nome, false);
  RETURN json_build_object('valid', true, 'found', true, 'ruolo', v_ruolo,
    'deve_cambiare_pwd', COALESCE(v_deve_cambiare, false),
    'session_token', v_session, 'upgraded', v_upgraded);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_master_pwd(p_hash text, p_legacy_hash text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_stored_v2 TEXT;
  v_stored TEXT;
  v_token TEXT;
  v_ok BOOLEAN := false;
BEGIN
  IF NOT _check_rate_limit('__master__') THEN
    RETURN json_build_object('locked', true);
  END IF;
  SELECT valore INTO v_stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  SELECT valore INTO v_stored FROM impostazioni WHERE chiave = 'password_hash';
  IF COALESCE(v_stored, '') = '' AND COALESCE(v_stored_v2, '') = '' THEN
    RETURN json_build_object('valid', false);
  END IF;
  IF COALESCE(v_stored_v2, '') <> '' AND _pwd_verifica(p_hash, v_stored_v2) THEN
    v_ok := true;
    IF v_stored_v2 NOT LIKE '$2_$%' THEN
      UPDATE impostazioni SET valore = _pwd_cifra(p_hash) WHERE chiave = 'password_hash_v2';
    END IF;
    IF COALESCE(v_stored, '') <> '' THEN
      UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
    END IF;
  ELSIF COALESCE(v_stored, '') <> '' THEN
    IF p_legacy_hash IS NULL OR p_legacy_hash = '' THEN
      IF COALESCE(v_stored_v2, '') <> '' THEN
        PERFORM _record_attempt('__master__', false);
      END IF;
      RETURN json_build_object('valid', false, 'serve_legacy', true);
    END IF;
    IF _pwd_verifica(p_legacy_hash, v_stored) THEN
      v_ok := true;
      IF p_hash IS NOT NULL AND p_hash <> '' THEN
        INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', _pwd_cifra(p_hash))
          ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
        UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
      END IF;
    END IF;
  END IF;
  IF NOT v_ok THEN
    PERFORM _record_attempt('__master__', false);
    RETURN json_build_object('valid', false);
  END IF;
  PERFORM _record_attempt('__master__', true);
  v_token := _create_op_session('Admin', true);
  -- Mantieni anche admin_sessions per compatibilita
  DELETE FROM admin_sessions WHERE operatore = '__master__';
  INSERT INTO admin_sessions (token, operatore, expires_at) VALUES (v_token, '__master__', now() + interval '24 hours');
  RETURN json_build_object('valid', true, 'session_token', v_token);
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_master_pwd(p_old_hash text, p_new_hash text, p_new_recovery text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
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

CREATE OR REPLACE FUNCTION public.change_op_pwd(p_nome text, p_old_hash text, p_new_hash text, p_old_legacy_hash text DEFAULT NULL::text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
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
 SET search_path = public, extensions
AS $function$
DECLARE
  should_change BOOLEAN;
BEGIN
  IF COALESCE(p_new_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password nuova mancante');
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

CREATE OR REPLACE FUNCTION public.add_operator(p_nome text, p_hash text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RETURN json_build_object('success', false, 'error', 'Non autorizzato');
  END IF;
  IF COALESCE(p_hash, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Password mancante');
  END IF;
  INSERT INTO operatori_auth (nome, pwd_hash_v2, deve_cambiare_pwd) VALUES (p_nome, _pwd_cifra(p_hash), true);
  RETURN json_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'error', 'Operatore esistente');
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_default_master_pwd(p_default_hash text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  stored TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  RETURN json_build_object('is_default', COALESCE(stored, '') = '' OR _pwd_verifica(p_default_hash, stored));
END;
$function$;

CREATE OR REPLACE FUNCTION public.setup_master_pwd(p_default_hash text, p_new_hash text, p_new_recovery text, p_new_hash_v2 text DEFAULT NULL::text)
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
  -- Blocca se esiste una password (v1 diversa dal default OPPURE v2 impostata)
  IF (COALESCE(stored, '') <> '' AND NOT _pwd_verifica(p_default_hash, stored)) OR COALESCE(stored_v2, '') <> '' THEN
    RETURN json_build_object('success', false);
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
 SET search_path = public, extensions
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

-- ------------------------------------------------------------
-- SESSIONI: rinnovo entro 12 ore dalla scadenza, una volta sola per token
-- ------------------------------------------------------------
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
  v_new TEXT;
BEGIN
  SELECT operatore, is_admin, expires_at, rinnovato_in INTO v_op, v_admin, v_scade, v_rinnovato
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
  -- v407: un operatore rimosso non rinnova piu (prima la sessione durava per sempre);
  -- l amministratore entra con la password principale (operatore "Admin")
  IF NOT (COALESCE(v_admin, false) AND v_op = 'Admin') AND NOT EXISTS (SELECT 1 FROM operatori_auth WHERE nome = v_op) THEN
    DELETE FROM operator_sessions WHERE token = p_token;
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_new := _create_op_session(v_op, COALESCE(v_admin, false));
  -- v411: il token vecchio si chiude fra 2 minuti, non subito (richieste in viaggio)
  UPDATE operator_sessions SET expires_at = LEAST(expires_at, now() + interval '2 minutes'), rinnovato_in = v_new
   WHERE token = p_token;
  RETURN json_build_object('session_token', v_new, 'operatore', v_op, 'is_admin', COALESCE(v_admin, false));
END;
$function$;

-- ------------------------------------------------------------
-- check_deve_cambiare: solo per la sessione della persona (o dell amministratore)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.check_deve_cambiare(text);
CREATE OR REPLACE FUNCTION public.check_deve_cambiare(p_nome text, p_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  flag BOOLEAN;
  v_op TEXT;
BEGIN
  v_op := CASE WHEN COALESCE(p_token, '') = '' THEN NULL ELSE _validate_op_session(p_token) END;
  IF v_op IS NULL OR (v_op IS DISTINCT FROM p_nome AND NOT _sessione_admin(p_token)) THEN
    RETURN json_build_object('deve_cambiare_pwd', false);
  END IF;
  SELECT deve_cambiare_pwd INTO flag FROM operatori_auth WHERE nome = p_nome;
  RETURN json_build_object('deve_cambiare_pwd', COALESCE(flag, false));
END;
$function$;

-- ------------------------------------------------------------
-- DIRITTI
-- ------------------------------------------------------------
-- funzioni interne: mai eseguibili da fuori
REVOKE EXECUTE ON FUNCTION public._pagina_visibile(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._settori_operatore(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._filtro_per_id(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ambito_registrazioni(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ambito_collaboratori(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._proiezione(text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_ambito_solo_diario(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._piano_ambito_diario(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._controlla_permessi_scrittura(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._controlla_filtro_scrittura(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._filtro_sostituzione_ok(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pwd_cifra(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pwd_verifica(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._password_proteggi_tutte() FROM PUBLIC, anon, authenticated;
-- funzioni del programma: eseguibili con la chiave pubblica (il controllo e dentro)
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.secure_read(text, text, text, text, integer, integer)', 'public.secure_insert(text, text, jsonb)',
    'public.secure_update(text, text, text, jsonb)', 'public.secure_delete(text, text, text)',
    'public.secure_sostituisci(text, text, text, jsonb)', 'public.parse_assenze_transactional(text, jsonb)',
    'public.piano_bulk_upsert(text, jsonb)', 'public.chat_get_or_create_group(text, text, text, text, text[])',
    'public.verify_login(text, text, text)', 'public.verify_master_pwd(text, text)',
    'public.change_master_pwd(text, text, text, text, text)', 'public.change_op_pwd(text, text, text, text, text)',
    'public.force_change_pwd(text, text, boolean, text)', 'public.add_operator(text, text, text)',
    'public.is_default_master_pwd(text)', 'public.setup_master_pwd(text, text, text, text)',
    'public.recovery_master_pwd(text, text, text, text)', 'public.renew_op_session(text)',
    'public.check_deve_cambiare(text, text)', 'public.upsert_impostazione(text, text, text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END
$$;

-- 7) impronte delle password: da chiaro a bcrypt (si puo rilanciare: le gia cifrate restano)
SELECT public._password_proteggi_tutte();

-- 9) diritti diretti sulle tabelle: il programma passa solo dalle funzioni
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- su Supabase anche le tabelle create dal ruolo di servizio della piattaforma (se si puo)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    BEGIN
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'diritti predefiniti di supabase_admin non modificabili da questo ruolo (nessun effetto sul programma)';
    END;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- RAPPORTO GIORNALIERO: serve la pagina Rapporto; l operatore e quello della sessione
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_rapporto(p_token text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_result JSON;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  -- il Rapporto lo scrive solo chi ha la pagina Rapporto (come Consegna e Maison sopra)
  IF NOT _pagina_visibile(p_token, 'rapporto') THEN
    RAISE EXCEPTION 'Non hai il permesso per il Rapporto';
  END IF;

  INSERT INTO rapporti_giornalieri (
    data_rapporto, turno, operatore, updated_at, reparto_dip,
    sup_note, cassa_note, sala_note, n_assegni, prelievi, assenze, note_extra
  ) VALUES (
    (p_data->>'data_rapporto'),
    (p_data->>'turno'),
    v_op, -- chi salva e la persona collegata, non quello scritto nella richiesta
    (p_data->>'updated_at'),
    COALESCE(p_data->>'reparto_dip', 'slots'),
    (p_data->>'sup_note'),
    (p_data->>'cassa_note'),
    (p_data->>'sala_note'),
    (p_data->>'n_assegni'),
    (p_data->>'prelievi'),
    (p_data->>'assenze'),
    CASE WHEN p_data ? 'note_extra' THEN (p_data->>'note_extra')::jsonb ELSE '{}'::jsonb END
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
$function$;

-- il servizio REST rilegge l elenco delle funzioni (check_deve_cambiare ha una firma nuova)
NOTIFY pgrst, 'reload schema';

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260911_permessi_operatori_password')
ON CONFLICT (nome) DO NOTHING;
