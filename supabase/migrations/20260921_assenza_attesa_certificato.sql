-- ============================================================
-- ASS = ASSENZA IN ATTESA DI CERTIFICATO (decisione del titolare 15/10/2026)
--
-- Quando un collaboratore chiama per malattia non si mette ancora la M: serve il
-- certificato, che porta poi all HR. La registrazione di base (Diario e Rapporto) e
-- «Assenza (attesa certificato)»: nel Piano diventa ASS SOLO nei giorni con un turno
-- (nei giorni liberi niente). ASS vale 0 ore e non e malattia. Il turno resta scoperto
-- come con la M (Copertura, Avvisi). Con «Certificato ricevuto» (solo chi ha Storico HR
-- · modificare, o l amministratore) le ASS del periodo del certificato diventano M e i
-- giorni liberi del periodo MC, come una malattia registrata oggi.
--
-- 1) Codice ASS nel catalogo (piano_codici): c era gia, importato dagli Excel come
--    «Assenza generica» (0 ore). Stessa sigla, stesso valore in ore (0): ora si chiama
--    «Assenza (attesa certificato)», protetta, non riposo, non scala la percentuale.
-- 2) Regola «ass_giorni_regolarizzare» (predefinita 3): dopo quanti giorni un ASS senza
--    certificato compare negli Avvisi del mese («ASS da regolarizzare»); regola
--    «ass_regolarizzare_dal» = giorno in cui si applica questa migrazione: solo le ASS da
--    quel giorno in poi sono da regolarizzare (le vecchie ASS degli Excel no).
-- 3) Percorso del Diario nel database (trigger piano_diario_trg, migrazione 20260913):
--    ASS e una cella "di assenza" come M e ND:
--    - si scrive solo sopra un TURNO (sigla di piano_turni), mai sopra un riposo, una
--      vacanza o una cella vuota; com era la cella la scrive il database (prima_malattia);
--    - togliendo l assenza torna solo la sigla di prima; ASS <-> M tiene la cella sotto;
--    - ASS -> M (o M1) solo con Storico HR · modificare o da amministratore, anche per chi
--      scrive il piano (impostazione di transazione diario.piano_hr, scritta da
--      _piano_imposta_ambito). Le scritture fuori dal canale sicuro (generazione, import)
--      non passano da qui, come prima.
-- Rilanciabile.
-- ============================================================
BEGIN;

-- 1) il codice
INSERT INTO piano_codici (codice, descrizione, ore, formula, scala_percentuale, protetto, is_riposo, attivo, richiede_orario)
VALUES ('ASS', 'Assenza (attesa certificato)', 0, '0', false, true, false, true, false)
ON CONFLICT (codice) DO UPDATE
   SET descrizione = 'Assenza (attesa certificato)',
       ore = 0,
       formula = '0',
       scala_percentuale = false,
       protetto = true,
       is_riposo = false,
       attivo = true,
       richiede_orario = false;

-- 2) la regola degli avvisi
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'ass_giorni_regolarizzare', '3', 'SOFT', 0, true,
       'Giorni dopo i quali un assenza in attesa di certificato (ASS) compare negli Avvisi da regolarizzare'
 WHERE NOT EXISTS (SELECT 1 FROM piano_regole
                    WHERE nome = 'ass_giorni_regolarizzare' AND coalesce(trim(settori), '') = '');

-- 2b) da quale giorno valgono gli avvisi «ASS da regolarizzare»: il giorno in cui la
--     migrazione si applica (= il rilascio). Le ASS dei mesi prima (importate dagli Excel come
--     «Assenza generica») restano assenze a 0 ore ma non sono da regolarizzare. Rilanciando
--     la migrazione la data resta quella della prima volta.
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'ass_regolarizzare_dal', to_char(current_date, 'YYYY-MM-DD'), 'SOFT', 0, true,
       'Giorno da cui le ASS (assenze in attesa di certificato) possono comparire negli Avvisi da regolarizzare (le ASS di prima no)'
 WHERE NOT EXISTS (SELECT 1 FROM piano_regole
                    WHERE nome = 'ass_regolarizzare_dal' AND coalesce(trim(settori), '') = '');

-- 3a) chi scrive: settori (come prima) e, in piu, se puo trasformare ASS in malattia
CREATE OR REPLACE FUNCTION public._piano_imposta_ambito(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
  -- 20260921: certificato ricevuto (ASS -> M) solo con Storico HR · modificare (admin compreso)
  PERFORM set_config('diario.piano_hr', CASE WHEN _hr_modifica(p_token) THEN '1' ELSE '' END, true);
END;
$function$;

-- 3b) com era la cella sotto la malattia, la ND o l ASS
CREATE OR REPLACE FUNCTION public._piano_sotto_malattia(r public.piano)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
     AND upper(COALESCE(s.dopo ->> 'codice', '')) IN ('M', 'M1', 'ND', 'ASS')
     AND upper(COALESCE(s.prima ->> 'codice', '')) NOT IN ('M', 'M1', 'ND', 'ASS', '')
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
  IF v_sigla IS NULL OR upper(v_sigla) IN ('M', 'M1', 'ND', 'ASS') THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('codice', v_sigla, 'protetto', v_sigla IN ('V', 'V1', 'CGF'),
    'generato', COALESCE(r.commento, '') ~ '\(bozza\)', 'commento', NULL, 'motivo_blocco', NULL);
END;
$function$;

-- 3c) il controllo delle scritture che passano come "Diario"
CREATE OR REPLACE FUNCTION public._piano_controllo_diario()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_amb TEXT := NULLIF(current_setting('diario.piano_scrittura', true), '');
  v_rep TEXT;
  v_mal_old BOOLEAN;
  v_mal_new BOOLEAN;
  v_sotto JSONB;
BEGIN
  -- 20260921: l ASS diventa malattia solo con il certificato (Storico HR · modificare), anche
  -- per chi scrive il piano; l amministratore ('*') ha sempre il permesso
  IF TG_OP = 'UPDATE' AND v_amb IS NOT NULL AND v_amb <> '*'
     AND upper(COALESCE(OLD.codice, '')) = 'ASS' AND upper(COALESCE(NEW.codice, '')) IN ('M', 'M1')
     AND COALESCE(current_setting('diario.piano_hr', true), '') <> '1' THEN
    RAISE EXCEPTION 'Permesso mancante: l ASS diventa malattia solo con Certificato ricevuto (Storico HR · modificare)';
  END IF;
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

  -- PERCORSO DEL DIARIO: malattia (M, M1), non disponibilita (ND), assenza (ASS)
  IF TG_OP = 'INSERT' THEN
    -- l ASS non nasce su una cella vuota: si scrive solo sopra un turno
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
    IF upper(COALESCE(OLD.codice, '')) NOT IN ('M', 'M1', 'ND', 'ASS') THEN
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
  v_mal_old := upper(COALESCE(OLD.codice, '')) IN ('M', 'M1', 'ND', 'ASS');
  v_mal_new := upper(COALESCE(NEW.codice, '')) IN ('M', 'M1', 'ND', 'ASS');
  -- l ASS copre solo un turno (mai riposi, vacanze, CGF, JG...)
  IF NOT v_mal_old AND upper(COALESCE(NEW.codice, '')) = 'ASS'
     AND NOT EXISTS (SELECT 1 FROM piano_turni t WHERE upper(t.codice) = upper(COALESCE(OLD.codice, ''))) THEN
    RAISE EXCEPTION 'Permesso mancante: l ASS si scrive solo sopra un turno (qui %)', OLD.codice;
  END IF;
  IF v_mal_new AND (NOT v_mal_old OR (upper(OLD.codice) = 'ND' AND upper(NEW.codice) IN ('M', 'M1'))) THEN
    -- la malattia (o la ND, o l ASS) copre la cella: com era la scrive il database
    NEW.prima_malattia := jsonb_build_object('codice', OLD.codice, 'protetto', COALESCE(OLD.protetto, false),
      'generato', COALESCE(OLD.generato, false), 'commento', OLD.commento, 'motivo_blocco', OLD.motivo_blocco)
      || CASE WHEN jsonb_typeof(OLD.prima_malattia) = 'object'
              THEN jsonb_build_object('prima_malattia', OLD.prima_malattia) ELSE '{}'::jsonb END;
    NEW.protetto := true;
    NEW.generato := false;
    NEW.motivo_blocco := NULL;
  ELSIF v_mal_new THEN
    -- resta malattia / ND / ASS (anche M <-> M1, ASS <-> M): sotto resta quello di prima
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

-- 3d) la parte "Diario" del filtro: ASS come M e ND
CREATE OR REPLACE FUNCTION public._piano_ambito_solo_diario(p_azione text, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_cod TEXT;
  v_chiave TEXT;
BEGIN
  IF p_azione = 'delete' THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'', ''ASS'')';
  END IF;
  FOR v_chiave IN SELECT jsonb_object_keys(COALESCE(p_data, '{}'::jsonb)) LOOP
    IF v_chiave NOT IN ('codice', 'protetto', 'generato', 'motivo_blocco', 'commento', 'operatore', 'updated_at',
                        'prima_malattia') THEN
      RAISE EXCEPTION 'Permesso mancante: modificare il piano (%)', v_chiave;
    END IF;
  END LOOP;
  IF NOT (p_data ? 'codice') THEN
    RETURN ' AND codice IN (''M'', ''M1'', ''ND'', ''ASS'')';
  END IF;
  v_cod := upper(btrim(p_data ->> 'codice'));
  IF v_cod IN ('M', 'ND', 'ASS') THEN
    RETURN ''; -- la malattia, la non disponibilita e l assenza prevalgono (l ASS solo su un turno: trigger)
  END IF;
  IF v_cod !~ '^[A-Z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'Permesso mancante: modificare il piano';
  END IF;
  -- togliendo la malattia torna la sigla di prima: quale, lo decide il trigger
  RETURN ' AND codice IN (''M'', ''M1'', ''ND'', ''ASS'')';
END;
$function$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260921_assenza_attesa_certificato')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
