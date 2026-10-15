-- ============================================================
-- ASSENZA NON GIUSTIFICATA: PERMESSO NEL DATABASE (15/10/2026)
-- "Certificato non ricevuto" segna la cella ASS con la nota "· non giustificata". Finora il
-- permesso (Storico HR · modificare, o amministratore) era controllato solo nel programma.
-- Ora anche il trigger del piano (_piano_controllo_diario): senza Storico HR non si segna,
-- non si toglie e non si cambia una cella ASS non giustificata, nemmeno da chi scrive il
-- piano. Le scritture fuori dal canale sicuro (generazione, import: diario.piano_scrittura
-- vuota) non passano da qui, come prima. Nessuna funzione nuova (101). Rilanciabile.
-- ============================================================
BEGIN;

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
  -- 20260922: ASSENZA NON GIUSTIFICATA (certificato non ricevuto) = cella ASS con la nota che
  -- finisce con "· non giustificata". Segnarla, toglierla o cambiare quella cella solo con
  -- Storico HR · modificare (l amministratore '*' sempre), anche per chi scrive il piano.
  IF v_amb IS NOT NULL AND v_amb <> '*' AND COALESCE(current_setting('diario.piano_hr', true), '') <> '1' THEN
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND upper(COALESCE(OLD.codice, '')) = 'ASS' AND COALESCE(OLD.commento, '') ~* '·\s*non giustificata\s*$'
       AND (TG_OP = 'DELETE' OR upper(COALESCE(NEW.codice, '')) <> 'ASS'
            OR COALESCE(NEW.commento, '') !~* '·\s*non giustificata\s*$') THEN
      RAISE EXCEPTION 'Permesso mancante: l assenza non giustificata la cambia solo chi ha Storico HR · modificare';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND upper(COALESCE(NEW.codice, '')) = 'ASS' AND COALESCE(NEW.commento, '') ~* '·\s*non giustificata\s*$'
       AND (TG_OP = 'INSERT' OR upper(COALESCE(OLD.codice, '')) <> 'ASS'
            OR COALESCE(OLD.commento, '') !~* '·\s*non giustificata\s*$') THEN
      RAISE EXCEPTION 'Permesso mancante: l assenza non giustificata la segna solo chi ha Storico HR · modificare';
    END IF;
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

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260922_assenza_non_giustificata_permesso')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
