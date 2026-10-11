-- ============================================================
-- SCRITTURE DEL PIANO SICURE CON PIU PC SULLO STESSO MESE (controllo del 11/10/2026)
--
-- 1) piano_scrivi_celle(token, operazioni): scrive una o piu celle del piano in UNA
--    transazione (tutto o niente) e SOLO se ogni cella e ancora come la vedeva chi
--    scrive ("atteso": codice, protetto, motivo del blocco... oppure cella vuota).
--    Se un collega l ha cambiata nel frattempo non scrive niente e restituisce le
--    celle cambiate (come sono ora, con chi le ha cambiate): il programma lo dice e
--    ricarica. Prima la modifica per numero di riga non guardava il valore: la
--    scrittura si perdeva (o sovrascriveva una V protetta messa da un collega) e il
--    Registro diceva "Piano modificato". Scambi, cerca cambio, copertura malattia e
--    Annulla facevano 2-4 scritture in fila: un errore a meta lasciava uno solo dei
--    due con il turno scambiato. I permessi sono quelli di sempre: ogni scrittura
--    passa da secure_insert / secure_update / secure_delete (piano, settori, scritture
--    del Diario) e una scrittura che il canale scarta in silenzio (fuori ambito) qui
--    e un errore e annulla tutto.
-- 2) Lo storico del piano annota anche la SESSIONE che scrive (impronta md5 del token,
--    mai il token): Annulla del Piano rimette solo le celle che questo PC ha toccato
--    nell operazione (piano_mie_modifiche), dal valore registrato dal database, non
--    dalla fotografia in memoria. piano_ora() da l ora del database (finestre di tempo
--    delle operazioni senza scarti di orologio fra PC e server).
-- 3) piano.prima_malattia: la malattia scritta sopra una sigla conserva com era la cella
--    (sigla, protetto, generato, commento, blocco); togliendo la malattia la cella torna
--    tale e quale. Prima tornava "scritta a mano" (generato = false, commento vuoto) e
--    la generazione automatica non la toccava piu. Le scritture del Diario (operatori
--    senza il permesso di scrivere il piano) possono scrivere anche questa colonna.
-- Si puo rilanciare.
-- ============================================================

ALTER TABLE public.piano ADD COLUMN IF NOT EXISTS prima_malattia JSONB;
ALTER TABLE public.piano_storico ADD COLUMN IF NOT EXISTS sessione TEXT;
CREATE INDEX IF NOT EXISTS piano_storico_sessione_idx ON public.piano_storico (sessione, quando)
  WHERE sessione IS NOT NULL;

-- la sessione valida annota operatore e impronta della sessione per la transazione
CREATE OR REPLACE FUNCTION public._validate_op_session(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
BEGIN
  SELECT s.operatore INTO v_op FROM operator_sessions s
  WHERE s.token = p_token AND s.expires_at > now()
    AND (s.is_admin OR EXISTS (SELECT 1 FROM operatori_auth o WHERE o.nome = s.operatore))
  LIMIT 1;
  IF v_op IS NOT NULL THEN
    PERFORM set_config('diario.operatore', v_op, true);
    PERFORM set_config('diario.sessione', md5(p_token), true);
  END IF;
  RETURN v_op;
END;
$function$;

CREATE OR REPLACE FUNCTION public._piano_storico_registra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT := NULLIF(current_setting('diario.operatore', true), '');
  v_sess TEXT := NULLIF(current_setting('diario.sessione', true), '');
  v_prima JSONB;
  v_dopo JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_prima := to_jsonb(OLD);
    v_dopo := to_jsonb(NEW);
    IF (v_prima - 'updated_at' - 'operatore') = (v_dopo - 'updated_at' - 'operatore') THEN
      RETURN NEW;
    END IF;
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore, sessione)
    VALUES (NEW.id, NEW.collaboratore, NEW.data, NEW.reparto_dip, 'modifica', v_prima, v_dopo, COALESCE(v_op, NEW.operatore), v_sess);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore, sessione)
    VALUES (NEW.id, NEW.collaboratore, NEW.data, NEW.reparto_dip, 'nuova', NULL, to_jsonb(NEW), COALESCE(v_op, NEW.operatore), v_sess);
    RETURN NEW;
  ELSE
    INSERT INTO piano_storico (piano_id, collaboratore, data, reparto_dip, azione, prima, dopo, operatore, sessione)
    VALUES (OLD.id, OLD.collaboratore, OLD.data, OLD.reparto_dip, 'cancellata', to_jsonb(OLD), NULL, COALESCE(v_op, OLD.operatore), v_sess);
    RETURN OLD;
  END IF;
END;
$function$;

-- PIANO: la parte "Diario" (M e ND, ritorno della sigla scritta nella nota). Come in
-- 20260911, con in piu la colonna prima_malattia (com era la cella sotto la malattia)
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
                        'reparto_dip', 'prima_malattia') THEN
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

-- valore di una colonna per il confronto: vuoto, falso, null e lista vuota sono "niente"
CREATE OR REPLACE FUNCTION public._piano_norm(v jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN v IS NULL OR v IN ('null'::jsonb, 'false'::jsonb, '[]'::jsonb, '{}'::jsonb) THEN 'null'::jsonb
    WHEN jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '' THEN 'null'::jsonb
    ELSE v
  END;
$function$;

-- ora del database (finestre di tempo delle operazioni del Piano per Annulla)
CREATE OR REPLACE FUNCTION public.piano_ora()
 RETURNS timestamptz
 LANGUAGE sql
 VOLATILE
AS $function$
  SELECT clock_timestamp();
$function$;

-- ------------------------------------------------------------
-- SCRITTURA CONDIZIONATA E IN UN COLPO SOLO
-- p_ops: [{ collaboratore, data, atteso, dati }]
--   atteso: assente = nessun controllo; null = la cella NON deve esistere;
--           oggetto = la cella deve esistere con questi valori (codice, protetto, ...)
--   dati:   null = cancella la cella; oggetto = modifica (se c e) o inserisce (se no)
-- Esito: { ok: true, righe: [cella dopo o null, nell ordine], inizio, fine }
--        { ok: false, conflitti: [{ collaboratore, data, attuale }] } (niente scritto)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.piano_scrivi_celle(p_token text, p_ops jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
 SET standard_conforming_strings = on
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT[];
  v_inizio TIMESTAMPTZ := clock_timestamp();
  o JSONB;
  v_row piano%ROWTYPE;
  v_trovata BOOLEAN;
  v_conf JSONB := '[]'::jsonb;
  v_out JSONB := '[]'::jsonb;
  v_att JSONB;
  v_dati JSONB;
  v_k TEXT;
  v_xmin TEXT;
  v_coll TEXT;
  v_data DATE;
  v_cod TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  IF jsonb_typeof(COALESCE(p_ops, 'null'::jsonb)) <> 'array' OR jsonb_array_length(p_ops) > 3000 THEN
    RAISE EXCEPTION 'Operazioni non valide (max 3000)';
  END IF;
  IF jsonb_array_length(p_ops) = 0 THEN
    RETURN json_build_object('ok', true, 'righe', '[]'::json, 'inizio', v_inizio, 'fine', clock_timestamp());
  END IF;
  -- forma delle operazioni e celle ripetute
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_ops) x
              WHERE jsonb_typeof(x) <> 'object' OR COALESCE(x ->> 'collaboratore', '') = ''
                 OR COALESCE(x ->> 'data', '') !~ '^\d{4}-\d{2}-\d{2}'
                 OR NOT (x ? 'dati') OR jsonb_typeof(x -> 'dati') NOT IN ('object', 'null')
                 OR (x ? 'atteso' AND jsonb_typeof(x -> 'atteso') NOT IN ('object', 'null'))) THEN
    RAISE EXCEPTION 'Operazione sul piano non valida';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_ops) x)
     <> (SELECT count(DISTINCT (x ->> 'collaboratore', left(x ->> 'data', 10))) FROM jsonb_array_elements(p_ops) x) THEN
    RAISE EXCEPTION 'La stessa cella compare due volte';
  END IF;
  -- celle che esistono: bloccate tutte insieme, in ordine (niente stallo fra due PC)
  PERFORM 1 FROM piano p
    WHERE (p.collaboratore, p.data) IN (SELECT x ->> 'collaboratore', left(x ->> 'data', 10)::date
                                          FROM jsonb_array_elements(p_ops) x)
    ORDER BY p.collaboratore, p.data
    FOR UPDATE;

  -- 1. CONTROLLO: ogni cella e ancora come la vedeva chi scrive?
  FOR o IN SELECT x FROM jsonb_array_elements(p_ops) x LOOP
    IF NOT (o ? 'atteso') THEN CONTINUE; END IF;
    SELECT * INTO v_row FROM piano WHERE collaboratore = o ->> 'collaboratore' AND data = left(o ->> 'data', 10)::date;
    v_trovata := FOUND;
    v_att := o -> 'atteso';
    IF jsonb_typeof(v_att) = 'null' THEN
      IF v_trovata THEN
        v_conf := v_conf || jsonb_build_array(jsonb_build_object('collaboratore', o ->> 'collaboratore',
                    'data', left(o ->> 'data', 10), 'attuale', to_jsonb(v_row)));
      END IF;
    ELSIF NOT v_trovata THEN
      v_conf := v_conf || jsonb_build_array(jsonb_build_object('collaboratore', o ->> 'collaboratore',
                  'data', left(o ->> 'data', 10), 'attuale', NULL));
    ELSE
      FOR v_k IN SELECT jsonb_object_keys(v_att) LOOP
        IF NOT (to_jsonb(v_row) ? v_k) THEN
          RAISE EXCEPTION 'Colonna sconosciuta nel piano: %', v_k;
        END IF;
        IF _piano_norm(to_jsonb(v_row) -> v_k) IS DISTINCT FROM _piano_norm(v_att -> v_k) THEN
          v_conf := v_conf || jsonb_build_array(jsonb_build_object('collaboratore', o ->> 'collaboratore',
                      'data', left(o ->> 'data', 10), 'attuale', to_jsonb(v_row)));
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF jsonb_array_length(v_conf) > 0 THEN
    RETURN json_build_object('ok', false, 'conflitti', v_conf);
  END IF;

  -- 2. SCRITTURA, con i permessi del canale sicuro; tutto o niente
  IF NOT v_admin AND _piano_scrittura_piena(p_token) THEN
    v_set := _settori_operatore(p_token, true);
  END IF;
  BEGIN
    FOR o IN SELECT x FROM jsonb_array_elements(p_ops) x LOOP
      v_coll := o ->> 'collaboratore';
      v_data := left(o ->> 'data', 10)::date;
      SELECT * INTO v_row FROM piano WHERE collaboratore = v_coll AND data = v_data;
      v_trovata := FOUND;
      IF jsonb_typeof(o -> 'dati') = 'null' THEN
        IF v_trovata THEN
          PERFORM secure_delete(p_token, 'piano', 'id = ' || quote_literal(v_row.id::text));
          IF EXISTS (SELECT 1 FROM piano WHERE id = v_row.id) THEN
            RAISE EXCEPTION 'Permesso mancante: cella di % il % (settore %)', v_coll, v_data, v_row.reparto_dip;
          END IF;
        END IF;
        CONTINUE;
      END IF;
      v_dati := (o -> 'dati') - 'id' - 'collaboratore' - 'data' - 'created_at';
      v_cod := upper(COALESCE(v_dati ->> 'codice', v_row.codice, ''));
      -- cella spostata in un altro settore: solo nei propri (la malattia prevale)
      IF v_set IS NOT NULL AND v_dati ? 'reparto_dip' AND v_cod NOT IN ('M', 'ND')
         AND NOT (lower(COALESCE(v_dati ->> 'reparto_dip', 'slots')) = ANY(v_set)) THEN
        RAISE EXCEPTION 'Piano di un altro settore: %', COALESCE(v_dati ->> 'reparto_dip', 'slots');
      END IF;
      IF v_trovata THEN
        IF v_dati = '{}'::jsonb THEN CONTINUE; END IF;
        SELECT xmin::text INTO v_xmin FROM piano WHERE id = v_row.id;
        PERFORM secure_update(p_token, 'piano', 'id = ' || quote_literal(v_row.id::text), v_dati);
        IF (SELECT xmin::text FROM piano WHERE id = v_row.id) IS NOT DISTINCT FROM v_xmin THEN
          RAISE EXCEPTION 'Permesso mancante: cella di % il % (settore %)', v_coll, v_data, v_row.reparto_dip;
        END IF;
      ELSE
        PERFORM secure_insert(p_token, 'piano',
          v_dati || jsonb_build_object('collaboratore', v_coll, 'data', to_char(v_data, 'YYYY-MM-DD')));
      END IF;
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    -- un collega ha creato la cella fra il controllo e la scrittura: niente scritto
    SELECT * INTO v_row FROM piano WHERE collaboratore = v_coll AND data = v_data;
    RETURN json_build_object('ok', false, 'conflitti', jsonb_build_array(jsonb_build_object(
      'collaboratore', v_coll, 'data', to_char(v_data, 'YYYY-MM-DD'),
      'attuale', CASE WHEN FOUND THEN to_jsonb(v_row) END)));
  END;

  FOR o IN SELECT x FROM jsonb_array_elements(p_ops) x LOOP
    SELECT * INTO v_row FROM piano WHERE collaboratore = o ->> 'collaboratore' AND data = left(o ->> 'data', 10)::date;
    v_out := v_out || jsonb_build_array(CASE WHEN FOUND THEN to_jsonb(v_row) ELSE 'null'::jsonb END);
  END LOOP;
  RETURN json_build_object('ok', true, 'righe', v_out, 'inizio', v_inizio, 'fine', clock_timestamp());
END;
$function$;

-- ------------------------------------------------------------
-- LE MIE MODIFICHE (Annulla del Piano): celle scritte da QUESTA sessione (anche dopo un
-- rinnovo del token) fra p_dal e p_al, con com erano prima della prima modifica e come
-- le ha lasciate l ultima. Filtri facoltativi: settore e giorni (Annulla tutto del mese).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.piano_mie_modifiche(p_token text, p_dal timestamptz, p_al timestamptz DEFAULT NULL,
  p_reparto text DEFAULT NULL, p_da date DEFAULT NULL, p_a date DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_sess TEXT[];
  v_out JSON;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_dal IS NULL THEN
    RAISE EXCEPTION 'Inizio mancante';
  END IF;
  -- la sessione e i token da cui e nata con i rinnovi
  WITH RECURSIVE catena(tok, n) AS (
    SELECT p_token, 0
    UNION ALL
    SELECT s.token, c.n + 1 FROM operator_sessions s JOIN catena c ON s.rinnovato_in = c.tok WHERE c.n < 200
  )
  SELECT array_agg(DISTINCT md5(tok)) INTO v_sess FROM catena;
  SELECT COALESCE(json_agg(json_build_object('collaboratore', x.collaboratore, 'data', x.data,
           'prima', x.prima, 'dopo', x.dopo) ORDER BY x.collaboratore, x.data), '[]'::json)
    INTO v_out
    FROM (
      SELECT s.collaboratore, s.data,
             (array_agg(s.prima ORDER BY s.id))[1] AS prima,
             (array_agg(s.dopo ORDER BY s.id DESC))[1] AS dopo
        FROM piano_storico s
       WHERE s.sessione = ANY(v_sess) AND s.quando >= p_dal AND (p_al IS NULL OR s.quando < p_al)
         AND (p_reparto IS NULL OR s.reparto_dip = p_reparto)
         AND (p_da IS NULL OR s.data >= p_da) AND (p_a IS NULL OR s.data <= p_a)
       GROUP BY s.collaboratore, s.data
    ) x;
  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.piano_scrivi_celle(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_scrivi_celle(text, jsonb) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.piano_mie_modifiche(text, timestamptz, timestamptz, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_mie_modifiche(text, timestamptz, timestamptz, text, date, date)
  TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.piano_ora() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.piano_ora() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._piano_norm(jsonb) FROM PUBLIC;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260912_piano_scritture_sicure')
ON CONFLICT (nome) DO NOTHING;

-- PostgREST rilegge l elenco delle funzioni (piano_scrivi_celle, piano_mie_modifiche, piano_ora)
NOTIFY pgrst, 'reload schema';
