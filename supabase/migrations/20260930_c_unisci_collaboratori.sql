-- 23/10/2026 · UNISCI DUE SCHEDE COLLABORATORE (richiesta del titolare: «Tonati» e «Tonati
-- Edoardo» sono la stessa persona, 181 giorni uguali nel piano)
-- Controlla il sistema > Coerenza Diario/Piano > «Unisci schede», solo amministratore.
--   collaboratori_unisci_anteprima: cosa si sposta (piano, diario, moduli, punti, HR, storico,
--     preferenze, permessi), le celle doppie nello stesso giorno, i campi della scheda diversi;
--     con una "firma" dei dati letti.
--   collaboratori_unisci: UNA transazione, tutto o niente. Se la firma non torna (dati cambiati
--     dopo l anteprima) non scrive niente. Le celle doppie NON si sovrascrivono: resta quella
--     della scheda da tenere e quella dell altra va nel Cestino con la scheda (si ripristina).
--     I campi vuoti della scheda da tenere si completano solo se richiesto; quelli pieni non
--     si toccano. Una riga nel Registro attivita.
--   La scheda tolta finisce nel Cestino (collaboratori_cestino), non e cancellata:
--   collaboratori_cestino_leggi / _ripristina / _elimina (definitivo), solo amministratore.
-- Idempotente: si puo applicare piu volte.

BEGIN;

CREATE TABLE IF NOT EXISTS public.collaboratori_cestino (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collaboratore_id bigint NOT NULL,
  nome text NOT NULL,
  scheda jsonb NOT NULL,
  unito_in text,
  unito_in_id bigint,
  righe_tolte jsonb NOT NULL DEFAULT '{}'::jsonb,
  riepilogo jsonb NOT NULL DEFAULT '{}'::jsonb,
  eliminato_da text,
  eliminato_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.collaboratori_cestino ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collaboratori_cestino FROM PUBLIC;
DO $g$ BEGIN
  EXECUTE 'REVOKE ALL ON public.collaboratori_cestino FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $g$;

-- cognome breve del briefing (come _rinominaBriefingFuturi: tutte le parole tranne l ultima)
CREATE OR REPLACE FUNCTION public._collab_breve(p_nome text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE WHEN cardinality(p) > 1 THEN upper(array_to_string(p[1:cardinality(p) - 1], ' ')) ELSE upper(p[1]) END
    FROM (SELECT regexp_split_to_array(btrim(COALESCE(p_nome, '')), '\s+') AS p) s
$function$;

-- elenco di nomi separati da ";" (regole del piano): il nome tolto diventa quello tenuto
-- (maiuscolo, come le scrive il programma), senza doppioni
CREATE OR REPLACE FUNCTION public._collab_unisci_lista(p_lista text, p_togli text, p_tieni text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  SELECT string_agg(n, ';' ORDER BY pos)
    FROM (SELECT DISTINCT ON (lower(btrim(n))) n, pos
            FROM (SELECT CASE WHEN lower(btrim(t)) = lower(p_togli) THEN upper(p_tieni) ELSE t END AS n, o AS pos
                    FROM unnest(string_to_array(p_lista, ';')) WITH ORDINALITY u(t, o)) a
           ORDER BY lower(btrim(n)), pos) b
$function$;

-- tabelle con il nome del collaboratore. Con chiave unica (una riga per giorno, settimana,
-- anno...): le righe che si scontrano sono le "doppie"
CREATE OR REPLACE FUNCTION public._collab_unisci_tabelle()
 RETURNS TABLE(tab text, gruppo text, chiavi text[], extra text)
 LANGUAGE sql IMMUTABLE
AS $function$
  VALUES ('piano', 'piano', ARRAY['data'], ''),
         ('piano_timbrature', 'piano', ARRAY['data'], ''),
         ('piano_vacanze', 'piano', ARRAY['settimana', 'anno'], ''),
         ('piano_ore_mese', 'piano', ARRAY['anno_mese'], ''),
         ('piano_recupero_ore', 'piano', ARRAY['data'], ''),
         ('piano_saldo_iniziale', 'piano', ARRAY['reparto_dip', 'anno'], ''),
         ('piano_cgf_riporto', 'piano', ARRAY['reparto_dip', 'anno'], ''),
         ('collab_congedi_np', 'piano', NULL::text[], ''),
         ('moduli', 'moduli', NULL::text[], ''),
         ('punti_eventi', 'punti', NULL::text[], ''),
         ('hr_eventi', 'hr', NULL::text[], ''),
         ('hr_allegati', 'hr', NULL::text[], ''),
         ('valutazioni', 'hr', ARRAY['anno', 'tipo', 'reparto_dip'], ' AND k.eliminato IS NOT TRUE AND x.eliminato IS NOT TRUE'),
         ('piano_storico', 'storico', NULL::text[], ''),
         ('collab_scelte_storico', 'storico', NULL::text[], '')
$function$;

-- CALCOLO (anteprima ed esecuzione leggono la stessa cosa)
CREATE OR REPLACE FUNCTION public._collab_unisci_calcola(p_tieni bigint, p_togli bigint)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_t JSONB;
  v_x JSONB;
  v_tn TEXT;
  v_xn TEXT;
  v_escl TEXT[] := ARRAY['id', 'collaboratore', 'collaboratore_id', 'created_at', 'updated_at', 'operatore',
                         'creato_il', 'modificato_il', 'quando'];
  r RECORD;
  v_on TEXT;
  v_ch TEXT;
  v_n INT;
  v_nd INT;
  v_lista JSONB;
  v_tabelle JSONB := '{}'::jsonb;
  v_doppie JSONB := '{}'::jsonb;
  v_campi JSONB := '[]'::jsonb;
  v_k TEXT;
  v_vt JSONB;
  v_vx JSONB;
  v_vuoto_t BOOLEAN;
  v_vuoto_x BOOLEAN;
  v_imp JSONB := '{}'::jsonb;
  v_txt TEXT;
  v_j JSONB;
  v_out JSONB;
  v_oper BOOLEAN := false;
BEGIN
  SELECT to_jsonb(c) INTO v_t FROM collaboratori c WHERE c.id = p_tieni;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Scheda da tenere non trovata (numero %)', p_tieni; END IF;
  SELECT to_jsonb(c) INTO v_x FROM collaboratori c WHERE c.id = p_togli;
  IF v_x IS NULL THEN RAISE EXCEPTION 'Scheda da togliere non trovata (numero %)', p_togli; END IF;
  IF p_tieni = p_togli THEN RAISE EXCEPTION 'Scegli due schede diverse'; END IF;
  v_tn := v_t ->> 'nome';
  v_xn := v_x ->> 'nome';

  -- DIARIO
  SELECT count(*) INTO v_n FROM registrazioni WHERE nome = v_xn;
  v_tabelle := v_tabelle || jsonb_build_object('registrazioni', jsonb_build_object('gruppo', 'diario', 'righe', v_n, 'doppie', 0));
  -- stesso giorno e stesso tipo in tutte e due (si spostano lo stesso: nessuna si cancella)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('giorno', g, 'tipo', tipo) ORDER BY g, tipo), '[]'::jsonb) INTO v_lista
    FROM (SELECT DISTINCT (x.data AT TIME ZONE 'Europe/Zurich')::date AS g, x.tipo
            FROM registrazioni x JOIN registrazioni k
              ON k.nome = v_tn AND k.tipo = x.tipo AND k.eliminato IS NOT TRUE
             AND (k.data AT TIME ZONE 'Europe/Zurich')::date = (x.data AT TIME ZONE 'Europe/Zurich')::date
           WHERE x.nome = v_xn AND x.eliminato IS NOT TRUE) s;
  v_doppie := v_doppie || jsonb_build_object('registrazioni', v_lista);
  SELECT count(*) INTO v_n FROM punti_eventi WHERE rif_assente = v_xn;
  v_tabelle := v_tabelle || jsonb_build_object('punti_eventi.rif_assente', jsonb_build_object('gruppo', 'punti', 'righe', v_n, 'doppie', 0));

  -- TABELLE CON IL NOME
  FOR r IN SELECT * FROM _collab_unisci_tabelle() LOOP
    IF r.chiavi IS NULL THEN
      EXECUTE format('SELECT count(*)::int FROM %I WHERE collaboratore = $1', r.tab) INTO v_n USING v_xn;
      v_nd := 0;
    ELSE
      v_on := (SELECT string_agg(format('k.%1$I IS NOT DISTINCT FROM x.%1$I', c), ' AND ') FROM unnest(r.chiavi) c);
      v_ch := 'jsonb_build_object(' || (SELECT string_agg(format('%L, x.%I', c, c), ', ') FROM unnest(r.chiavi) c) || ')';
      EXECUTE format($q$
        SELECT count(*)::int, count(k.id)::int,
               COALESCE(jsonb_agg(jsonb_build_object(
                 'chiave', %3$s,
                 'tieni', to_jsonb(k) - $3, 'togli', to_jsonb(x) - $3,
                 'diversi', (SELECT COALESCE(jsonb_agg(e.key ORDER BY e.key), '[]'::jsonb)
                               FROM jsonb_each(to_jsonb(x) - $3) e
                              WHERE (to_jsonb(k) - $3) -> e.key IS DISTINCT FROM e.value))
                 ORDER BY %3$s::text) FILTER (WHERE k.id IS NOT NULL), '[]'::jsonb)
          FROM %1$I x LEFT JOIN %1$I k ON k.collaboratore = $1 AND %2$s %4$s
         WHERE x.collaboratore = $2$q$, r.tab, v_on, v_ch, r.extra)
        INTO v_n, v_nd, v_lista USING v_tn, v_xn, v_escl;
      IF v_nd > 0 THEN v_doppie := v_doppie || jsonb_build_object(r.tab, v_lista); END IF;
    END IF;
    v_tabelle := v_tabelle || jsonb_build_object(r.tab, jsonb_build_object('gruppo', r.gruppo, 'righe', v_n, 'doppie', v_nd));
  END LOOP;

  -- CAMPI DELLA SCHEDA: uguali (fuori), vuoti nella scheda da tenere (si possono completare),
  -- diversi (resta quello della scheda da tenere)
  FOR v_k IN SELECT jsonb_object_keys(v_t) LOOP
    IF v_k IN ('id', 'nome', 'created_at') THEN CONTINUE; END IF;
    v_vt := v_t -> v_k;
    v_vx := v_x -> v_k;
    IF v_vt IS NOT DISTINCT FROM v_vx THEN CONTINUE; END IF;
    v_vuoto_t := v_vt IS NULL OR v_vt = 'null'::jsonb OR v_vt = '""'::jsonb OR v_vt = '{}'::jsonb OR v_vt = '[]'::jsonb;
    v_vuoto_x := v_vx IS NULL OR v_vx = 'null'::jsonb OR v_vx = '""'::jsonb OR v_vx = '{}'::jsonb OR v_vx = '[]'::jsonb;
    IF v_vuoto_x THEN CONTINUE; END IF;
    v_campi := v_campi || jsonb_build_array(jsonb_build_object('campo', v_k, 'tieni', v_vt, 'togli', v_vx,
                 'azione', CASE WHEN v_vuoto_t AND v_k NOT IN ('attivo', 'reparto_dip') THEN 'completa' ELSE 'diverso' END));
  END LOOP;

  -- PREFERENZE E PERMESSI: impostazioni con il nome, regole del piano, briefing futuri
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_ordine_collab';
    v_j := v_txt::jsonb;
    IF jsonb_typeof(v_j) = 'object' THEN
      SELECT count(*) INTO v_n FROM jsonb_each(v_j) e WHERE jsonb_typeof(e.value) = 'array' AND e.value ? v_xn;
      IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('piano_ordine_collab', v_n); END IF;
    END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'giubileo_notificati';
    SELECT count(*) INTO v_n FROM jsonb_array_elements_text(v_txt::jsonb) a WHERE a LIKE v_xn || '|%';
    IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('giubileo_notificati', v_n); END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_vacanze_ok';
    SELECT count(*) INTO v_n FROM jsonb_object_keys(v_txt::jsonb) k WHERE k LIKE v_xn || '|%';
    IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('piano_vacanze_ok', v_n); END IF;
  EXCEPTION WHEN others THEN NULL;
  END;
  SELECT count(*) INTO v_n FROM piano_regole_gruppo g
   WHERE lower(COALESCE(g.tipo_regola, '')) IN ('coordinatori', 'turni_solo_collaboratori')
     AND EXISTS (SELECT 1 FROM unnest(string_to_array(regexp_replace(COALESCE(g.valore, ''), '^.*[|:]', ''), ';')) t
                  WHERE lower(btrim(t)) = lower(v_xn));
  IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('regole_piano', v_n); END IF;
  SELECT count(*) INTO v_n FROM piano_briefing b
   WHERE b.data >= (now() AT TIME ZONE 'Europe/Zurich')::date
     AND jsonb_typeof(b.contenuto -> 'righe') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.contenuto -> 'righe') e WHERE e ->> 'nomeFull' = v_xn);
  IF v_n > 0 THEN v_imp := v_imp || jsonb_build_object('briefing_futuri', v_n); END IF;

  BEGIN
    SELECT COALESCE(valore::jsonb ? v_xn, false) INTO v_oper FROM impostazioni WHERE chiave = 'operatori_lista';
  EXCEPTION WHEN others THEN v_oper := false;
  END;
  v_out := jsonb_build_object(
    'tieni', jsonb_build_object('id', p_tieni, 'nome', v_tn, 'attivo', v_t -> 'attivo', 'reparto_dip', v_t -> 'reparto_dip'),
    'togli', jsonb_build_object('id', p_togli, 'nome', v_xn, 'attivo', v_x -> 'attivo', 'reparto_dip', v_x -> 'reparto_dip'),
    'tabelle', v_tabelle,
    'doppie', v_doppie,
    'campi', v_campi,
    'impostazioni', v_imp,
    'operatore', COALESCE(v_oper, false));
  RETURN v_out || jsonb_build_object('firma', md5(v_out::text));
END;
$function$;
REVOKE ALL ON FUNCTION public._collab_unisci_calcola(bigint, bigint) FROM PUBLIC;
DO $g$ BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public._collab_unisci_calcola(bigint, bigint) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $g$;

CREATE OR REPLACE FUNCTION public.collaboratori_unisci_anteprima(p_token text, p_tieni bigint, p_togli bigint)
 RETURNS json
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Unire due schede: solo amministratore';
  END IF;
  RETURN _collab_unisci_calcola(p_tieni, p_togli)::json;
END;
$function$;

-- ESECUZIONE: tutto o niente
CREATE OR REPLACE FUNCTION public.collaboratori_unisci(p_token text, p_tieni bigint, p_togli bigint, p_firma text,
                                                       p_completa boolean DEFAULT false,
                                                       p_conferma_doppie boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_calc JSONB;
  v_tn TEXT;
  v_xn TEXT;
  v_scheda JSONB;
  r RECORD;
  v_on TEXT;
  v_righe JSONB;
  v_tolte JSONB := '{}'::jsonb;
  v_spost JSONB := '{}'::jsonb;
  v_n INT;
  v_ndop INT := 0;
  v_c JSONB;
  v_completati TEXT[] := ARRAY[]::text[];
  v_txt TEXT;
  v_j JSONB;
  v_det TEXT;
  v_cid BIGINT;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Unire due schede: solo amministratore';
  END IF;
  v_op := _validate_op_session(p_token);
  -- le due schede ferme fino alla fine (un altro PC non le cambia a meta)
  PERFORM 1 FROM collaboratori WHERE id IN (p_tieni, p_togli) ORDER BY id FOR UPDATE;
  v_calc := _collab_unisci_calcola(p_tieni, p_togli);
  IF COALESCE(p_firma, '') <> (v_calc ->> 'firma') THEN
    RAISE EXCEPTION 'Nel frattempo i dati delle due schede sono cambiati: rifai l anteprima (niente e stato unito)';
  END IF;
  SELECT COALESCE(sum((e.value ->> 'doppie')::int), 0) INTO v_ndop FROM jsonb_each(v_calc -> 'tabelle') e;
  IF v_ndop > 0 AND NOT p_conferma_doppie THEN
    RAISE EXCEPTION 'Ci sono % righe doppie: conferma che resta quella della scheda da tenere', v_ndop;
  END IF;
  v_tn := v_calc #>> '{tieni,nome}';
  v_xn := v_calc #>> '{togli,nome}';
  SELECT to_jsonb(c) INTO v_scheda FROM collaboratori c WHERE c.id = p_togli;
  PERFORM set_config('diario.operatore', COALESCE(v_op, 'Admin'), true);

  -- 1. CAMPI VUOTI della scheda da tenere (solo se richiesto; quelli pieni non si toccano)
  IF p_completa THEN
    FOR v_c IN SELECT x FROM jsonb_array_elements(v_calc -> 'campi') x WHERE x ->> 'azione' = 'completa' LOOP
      EXECUTE format('UPDATE collaboratori SET %1$I = (SELECT %1$I FROM collaboratori WHERE id = $2) WHERE id = $1',
                     v_c ->> 'campo') USING p_tieni, p_togli;
      v_completati := v_completati || (v_c ->> 'campo');
    END LOOP;
  END IF;

  -- 2. STORICO prima del piano: la storia della scheda tolta passa a quella tenuta; le celle
  --    doppie tolte qui sotto restano nello storico con il nome di prima
  UPDATE piano_storico SET collaboratore = v_tn WHERE collaboratore = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_spost := v_spost || jsonb_build_object('piano_storico', v_n);
  UPDATE collab_scelte_storico SET collaboratore = v_tn, collaboratore_id = p_tieni WHERE collaboratore_id = p_togli OR collaboratore = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_spost := v_spost || jsonb_build_object('collab_scelte_storico', v_n);

  -- 3. TABELLE: le righe doppie della scheda tolta vanno nel Cestino con la scheda (non si
  --    sovrascrive quella tenuta), le altre passano alla scheda tenuta
  FOR r IN SELECT * FROM _collab_unisci_tabelle() WHERE tab NOT IN ('piano_storico', 'collab_scelte_storico') LOOP
    IF r.chiavi IS NOT NULL THEN
      v_on := (SELECT string_agg(format('k.%1$I IS NOT DISTINCT FROM x.%1$I', c), ' AND ') FROM unnest(r.chiavi) c);
      EXECUTE format($q$
        WITH d AS (DELETE FROM %1$I x USING %1$I k
                    WHERE x.collaboratore = $2 AND k.collaboratore = $1 AND %2$s %3$s
                    RETURNING to_jsonb(x) AS riga)
        SELECT COALESCE(jsonb_agg(riga ORDER BY (riga ->> 'id')::bigint), '[]'::jsonb) FROM d$q$, r.tab, v_on, r.extra)
        INTO v_righe USING v_tn, v_xn;
      IF jsonb_array_length(v_righe) > 0 THEN v_tolte := v_tolte || jsonb_build_object(r.tab, v_righe); END IF;
    END IF;
    EXECUTE format('UPDATE %I SET collaboratore = $1 WHERE collaboratore = $2', r.tab) USING v_tn, v_xn;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object(r.tab, v_n); END IF;
  END LOOP;
  UPDATE registrazioni SET nome = v_tn WHERE nome = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('registrazioni', v_n); END IF;
  UPDATE punti_eventi SET rif_assente = v_tn WHERE rif_assente = v_xn;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN v_spost := v_spost || jsonb_build_object('punti_eventi.rif_assente', v_n); END IF;

  -- 4. PREFERENZE E PERMESSI: impostazioni, regole del piano, briefing da oggi in poi
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_ordine_collab';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'object' AND EXISTS (SELECT 1 FROM jsonb_each(v_j) e
                                                WHERE jsonb_typeof(e.value) = 'array' AND e.value ? v_xn) THEN
    SELECT jsonb_object_agg(e.key, CASE WHEN jsonb_typeof(e.value) = 'array' AND e.value ? v_xn THEN
             (SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY pos), '[]'::jsonb)
                FROM (SELECT n, min(o) AS pos
                        FROM (SELECT CASE WHEN a.v = v_xn THEN v_tn ELSE a.v END AS n, a.o
                                FROM jsonb_array_elements_text(e.value) WITH ORDINALITY a(v, o)) s
                       GROUP BY n) t)
           ELSE e.value END)
      INTO v_j FROM jsonb_each(v_j) e;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'piano_ordine_collab';
  END IF;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'giubileo_notificati';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_j) a WHERE a LIKE v_xn || '|%') THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY pos), '[]'::jsonb) INTO v_j
      FROM (SELECT n, min(o) AS pos
              FROM (SELECT CASE WHEN a.v LIKE v_xn || '|%' THEN v_tn || substr(a.v, length(v_xn) + 1) ELSE a.v END AS n, a.o
                      FROM jsonb_array_elements_text(v_j) WITH ORDINALITY a(v, o)) s
             GROUP BY n) t;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'giubileo_notificati';
  END IF;
  BEGIN
    SELECT valore INTO v_txt FROM impostazioni WHERE chiave = 'piano_vacanze_ok';
    v_j := v_txt::jsonb;
  EXCEPTION WHEN others THEN v_j := NULL;
  END;
  IF jsonb_typeof(v_j) = 'object' AND EXISTS (SELECT 1 FROM jsonb_object_keys(v_j) k WHERE k LIKE v_xn || '|%') THEN
    -- a pari chiave vale quella della scheda tenuta (aggregata per ultima)
    SELECT jsonb_object_agg(CASE WHEN e.key LIKE v_xn || '|%' THEN v_tn || substr(e.key, length(v_xn) + 1) ELSE e.key END,
                            e.value ORDER BY (e.key LIKE v_xn || '|%') DESC)
      INTO v_j FROM jsonb_each(v_j) e;
    UPDATE impostazioni SET valore = v_j::text WHERE chiave = 'piano_vacanze_ok';
  END IF;
  UPDATE piano_regole_gruppo g
     SET valore = CASE WHEN lower(g.tipo_regola) = 'coordinatori'
                       THEN substring(g.valore FROM '^(.*\|)') || _collab_unisci_lista(substring(g.valore FROM '([^|]*)$'), v_xn, v_tn)
                       ELSE substring(g.valore FROM '^([^:]*:)') || _collab_unisci_lista(substring(g.valore FROM ':(.*)$'), v_xn, v_tn) END
   WHERE lower(COALESCE(g.tipo_regola, '')) IN ('coordinatori', 'turni_solo_collaboratori')
     AND ((lower(g.tipo_regola) = 'coordinatori' AND g.valore ~ '\|')
          OR (lower(g.tipo_regola) = 'turni_solo_collaboratori' AND g.valore ~ ':'))
     AND EXISTS (SELECT 1 FROM unnest(string_to_array(regexp_replace(COALESCE(g.valore, ''), '^.*[|:]', ''), ';')) t
                  WHERE lower(btrim(t)) = lower(v_xn));
  UPDATE piano_briefing b
     SET contenuto = jsonb_set(b.contenuto, '{righe}',
           (SELECT jsonb_agg(CASE WHEN e ->> 'nomeFull' = v_xn
                                  THEN e || jsonb_build_object('nomeFull', v_tn)
                                         || CASE WHEN e ->> 'nome' = _collab_breve(v_xn)
                                                 THEN jsonb_build_object('nome', _collab_breve(v_tn)) ELSE '{}'::jsonb END
                                  ELSE e END ORDER BY o)
              FROM jsonb_array_elements(b.contenuto -> 'righe') WITH ORDINALITY a(e, o)))
   WHERE b.data >= (now() AT TIME ZONE 'Europe/Zurich')::date
     AND jsonb_typeof(b.contenuto -> 'righe') = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.contenuto -> 'righe') e WHERE e ->> 'nomeFull' = v_xn);

  -- 5. LA SCHEDA TOLTA nel Cestino (si ripristina da li), poi fuori dall elenco
  INSERT INTO collaboratori_cestino (collaboratore_id, nome, scheda, unito_in, unito_in_id, righe_tolte, riepilogo, eliminato_da)
  VALUES (p_togli, v_xn, v_scheda, v_tn, p_tieni, v_tolte,
          jsonb_build_object('spostate', v_spost, 'campi_completati', to_jsonb(v_completati), 'doppie', v_ndop),
          COALESCE(v_op, 'Admin'))
  RETURNING id INTO v_cid;
  DELETE FROM collaboratori WHERE id = p_togli;

  -- 6. REGISTRO
  SELECT string_agg(e.key || ' ' || e.value, ', ' ORDER BY e.key) INTO v_det FROM jsonb_each_text(v_spost) e WHERE e.value <> '0';
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (COALESCE(v_op, 'Admin'), 'Schede collaboratore unite',
          left('«' || v_xn || '» unita in «' || v_tn || '»: spostate ' || COALESCE(v_det, 'nessuna riga')
               || '; righe doppie nel Cestino ' || v_ndop
               || CASE WHEN cardinality(v_completati) > 0 THEN '; campi completati ' || array_to_string(v_completati, ', ') ELSE '' END
               || ' (Cestino n. ' || v_cid || ')', 2000),
          v_calc #>> '{tieni,reparto_dip}');

  RETURN json_build_object('ok', true, 'tieni', v_tn, 'togli', v_xn, 'spostate', v_spost, 'doppie', v_ndop,
                           'campi_completati', to_jsonb(v_completati), 'cestino_id', v_cid);
END;
$function$;

-- CESTINO DELLE SCHEDE
CREATE OR REPLACE FUNCTION public.collaboratori_cestino_leggi(p_token text)
 RETURNS json
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Schede nel Cestino: solo amministratore';
  END IF;
  RETURN COALESCE((SELECT json_agg(json_build_object(
            'id', c.id, 'collaboratore_id', c.collaboratore_id, 'nome', c.nome, 'unito_in', c.unito_in,
            'reparto_dip', c.scheda ->> 'reparto_dip', 'riepilogo', c.riepilogo,
            'righe_tolte', (SELECT COALESCE(sum(jsonb_array_length(e.value)), 0) FROM jsonb_each(c.righe_tolte) e),
            'eliminato_da', c.eliminato_da, 'eliminato_at', c.eliminato_at) ORDER BY c.eliminato_at DESC)
            FROM collaboratori_cestino c), '[]'::json);
END;
$function$;

-- RIPRISTINA: la scheda torna (stesso numero) con le righe doppie tolte; le righe spostate
-- restano alla scheda tenuta
CREATE OR REPLACE FUNCTION public.collaboratori_cestino_ripristina(p_token text, p_id bigint)
 RETURNS json
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  c collaboratori_cestino%ROWTYPE;
  e RECORD;
  v_r JSONB;
  v_n INT := 0;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Ripristino della scheda: solo amministratore';
  END IF;
  v_op := _validate_op_session(p_token);
  SELECT * INTO c FROM collaboratori_cestino WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scheda non piu nel Cestino'; END IF;
  IF EXISTS (SELECT 1 FROM collaboratori WHERE lower(nome) = lower(c.nome) OR id = c.collaboratore_id) THEN
    RAISE EXCEPTION 'Esiste gia una scheda «%» (o con lo stesso numero): rinominala prima di ripristinare', c.nome;
  END IF;
  PERFORM set_config('diario.operatore', COALESCE(v_op, 'Admin'), true);
  INSERT INTO collaboratori SELECT * FROM jsonb_populate_record(NULL::collaboratori, c.scheda);
  FOR e IN SELECT key, value FROM jsonb_each(c.righe_tolte) LOOP
    IF e.key NOT IN (SELECT tab FROM _collab_unisci_tabelle()) THEN
      RAISE EXCEPTION 'Tabella non prevista nel Cestino: %', e.key;
    END IF;
    FOR v_r IN SELECT x FROM jsonb_array_elements(e.value) x LOOP
      EXECUTE format('INSERT INTO %1$I OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_record(NULL::%1$I, $1)', e.key)
        USING v_r;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  DELETE FROM collaboratori_cestino WHERE id = p_id;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (COALESCE(v_op, 'Admin'), 'Scheda collaboratore ripristinata',
          '«' || c.nome || '» tornata dal Cestino con ' || v_n || ' righe doppie; i dati spostati restano in «'
          || COALESCE(c.unito_in, '') || '»', c.scheda ->> 'reparto_dip');
  RETURN json_build_object('ok', true, 'nome', c.nome, 'righe', v_n);
END;
$function$;

CREATE OR REPLACE FUNCTION public.collaboratori_cestino_elimina(p_token text, p_id bigint)
 RETURNS json
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  c collaboratori_cestino%ROWTYPE;
BEGIN
  IF NOT _verify_admin_session(COALESCE(p_token, '')) THEN
    RAISE EXCEPTION 'Eliminazione definitiva: solo amministratore';
  END IF;
  v_op := _validate_op_session(p_token);
  DELETE FROM collaboratori_cestino WHERE id = p_id RETURNING * INTO c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scheda non piu nel Cestino'; END IF;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (COALESCE(v_op, 'Admin'), 'Scheda collaboratore eliminata definitivamente',
          '«' || c.nome || '» (unita in «' || COALESCE(c.unito_in, '') || '»)', c.scheda ->> 'reparto_dip');
  RETURN json_build_object('ok', true);
END;
$function$;

DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['collaboratori_unisci_anteprima(text, bigint, bigint)',
                           'collaboratori_unisci(text, bigint, bigint, text, boolean, boolean)',
                           'collaboratori_cestino_leggi(text)', 'collaboratori_cestino_ripristina(text, bigint)',
                           'collaboratori_cestino_elimina(text, bigint)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM PUBLIC';
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || f || ' TO anon, authenticated, service_role';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $g$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260930_c_unisci_collaboratori')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
