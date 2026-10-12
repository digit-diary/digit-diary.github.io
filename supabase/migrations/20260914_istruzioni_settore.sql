-- ============================================================
-- PERSONALIZZAZIONI DALLE SCHERMATE (v452, 12/10/2026)
-- Tre cose che prima richiedevano di modificare il codice ora le cambiano i responsabili:
--
-- 1) ISTRUZIONI DEL SETTORE (Guida del programma, in cima). Ogni settore ha il suo testo
--    (titoli, elenchi, grassetto: si scrive in Markdown ridotto, la pagina lo mostra sempre
--    come testo, mai come HTML). Tabella dedicata istruzioni_settore, una riga per settore,
--    con chi e quando l ha modificata l ultima volta (li scrive il database, non il browser).
--    Perche una tabella e non impostazioni:
--    - il permesso e PER SETTORE: la lettura restituisce solo i settori di chi legge e la
--      scrittura controlla il settore (un responsabile Slots non scrive quelle dei Tavoli);
--      con impostazioni (letta da tutti, intera, all avvio) servirebbe una chiave per settore
--      e l autore/ora li scriverebbe il browser;
--    - autore e ora sono colonne vere, scritte dal database: non si falsificano;
--    - due responsabili che modificano insieme: chi salva per secondo riceve "modificate nel
--      frattempo" invece di cancellare il testo dell altro (p_atteso = ora letta);
--    - impostazioni resta piccola: si carica intera a ogni avvio su ogni PC.
--    Funzioni (sessione valida, il controllo e dentro):
--      leggi_istruzioni_settore(token)                     -> [{settore, testo, aggiornato_da, aggiornato_il}]
--      salva_istruzioni_settore(token, settore, testo, atteso) -> {settore, aggiornato_da, aggiornato_il}
--    Chi scrive: l amministratore, oppure chi ha il permesso delegabile "Istruzioni del
--    settore: modificare" (gestione_istruzioni, Impostazioni > Visibilita e permessi;
--    predefinito: solo amministratore) nei SUOI settori (settore proprio e accessi extra con
--    modifica; chi lavora in tutti i settori: tutti). Ogni salvataggio va nel Registro attivita.
-- 2) RIFERIMENTI NORMATIVI DELLE REGOLE (Piano > Regole): impostazione piano_regole_fonte
--    {nome regola: testo}. Solo amministratore: e gia la regola di upsert_impostazione per le
--    chiavi non elencate (nessuna modifica qui, solo la nota).
-- 3) COLONNE DEL BRIEFING PER SETTORE: impostazioni brief_colonne_<settore> (elenco delle
--    colonne: quali, in che ordine, con che intestazione). Le scrive chi compila il briefing
--    (gestione_briefing o gestione_piano), solo per i SUOI settori; il valore deve essere un
--    elenco JSON (vuoto = colonne predefinite).
--
-- Effetti per gli utenti: nessuno finche nessuno scrive istruzioni, fonti o colonne (tutto
-- resta com era). Si puo rilanciare.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ISTRUZIONI DEL SETTORE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.istruzioni_settore (
  settore TEXT PRIMARY KEY,
  testo TEXT NOT NULL DEFAULT '',
  aggiornato_da TEXT,
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.istruzioni_settore IS
  'Istruzioni interne di ogni settore (Guida del programma). Markdown ridotto, mostrato sempre come testo. Si legge e si scrive solo con leggi_istruzioni_settore / salva_istruzioni_settore.';
-- nessun accesso diretto: solo attraverso le funzioni (RLS senza regole, nessun diritto)
ALTER TABLE public.istruzioni_settore ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.istruzioni_settore FROM PUBLIC, anon, authenticated;

-- settore esistente: Slots e Tavoli fissi, gli altri da Impostazioni > Settori
-- (reparti_config; senza configurazione: Valet e Cleaning, come il programma)
CREATE OR REPLACE FUNCTION public._settore_esiste(p_settore text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_cfg JSONB;
BEGIN
  IF p_settore IN ('slots', 'tavoli') THEN RETURN true; END IF;
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'reparti_config';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'array' THEN
    v_cfg := '[{"key": "valet"}, {"key": "cleaning"}]'::jsonb;
  END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(v_cfg) x WHERE x ->> 'key' = p_settore);
END;
$function$;

-- lettura: le istruzioni dei settori di chi legge (amministratore e chi lavora in tutti i
-- settori: tutte; accessi extra compresi, anche in sola lettura)
CREATE OR REPLACE FUNCTION public.leggi_istruzioni_settore(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_set TEXT[];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_set := _settori_operatore(p_token, false);
  RETURN COALESCE((
    SELECT json_agg(json_build_object('settore', i.settore, 'testo', i.testo,
                                      'aggiornato_da', i.aggiornato_da, 'aggiornato_il', i.aggiornato_il)
                    ORDER BY i.settore)
      FROM istruzioni_settore i
     WHERE v_set IS NULL OR i.settore = ANY(v_set)), '[]'::json);
END;
$function$;

-- scrittura: amministratore, o permesso gestione_istruzioni nei propri settori.
-- p_atteso = ora dell ultima modifica letta dal programma (NULL = non c erano istruzioni):
-- se nel frattempo qualcuno ha salvato, errore invece di sovrascrivere il suo testo.
CREATE OR REPLACE FUNCTION public.salva_istruzioni_settore(p_token text, p_settore text, p_testo text,
                                                           p_atteso timestamptz DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_set TEXT[];
  v_sett TEXT := lower(btrim(COALESCE(p_settore, '')));
  v_testo TEXT := COALESCE(p_testo, '');
  v_prima public.istruzioni_settore%ROWTYPE;
  v_esisteva BOOLEAN;
  v_ora TIMESTAMPTZ := clock_timestamp();
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT COALESCE(is_admin, false) INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF v_sett !~ '^[a-z0-9_-]{1,40}$' OR NOT _settore_esiste(v_sett) THEN
    RAISE EXCEPTION 'Settore non valido: %', p_settore;
  END IF;
  IF length(v_testo) > 20000 THEN
    RAISE EXCEPTION 'Testo troppo lungo: massimo 20000 caratteri (ora %)', length(v_testo);
  END IF;
  IF NOT v_admin THEN
    IF NOT _sessione_permesso(p_token, 'gestione_istruzioni') THEN
      RAISE EXCEPTION 'Permesso mancante: istruzioni del settore';
    END IF;
    v_set := _settori_operatore(p_token, true);
    IF v_set IS NOT NULL AND NOT (v_sett = ANY(v_set)) THEN
      RAISE EXCEPTION 'Permesso mancante: istruzioni del settore % (non e uno dei tuoi settori)', v_sett;
    END IF;
  END IF;
  SELECT * INTO v_prima FROM istruzioni_settore WHERE settore = v_sett FOR UPDATE;
  v_esisteva := FOUND;
  IF (v_esisteva AND v_prima.aggiornato_il IS DISTINCT FROM p_atteso) OR (NOT v_esisteva AND p_atteso IS NOT NULL) THEN
    RAISE EXCEPTION 'Istruzioni modificate nel frattempo da % (%): riapri e salva di nuovo',
      COALESCE(v_prima.aggiornato_da, 'un collega'),
      COALESCE(to_char(v_prima.aggiornato_il AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI'), 'cancellate');
  END IF;
  IF v_esisteva AND v_prima.testo = v_testo THEN
    -- niente da cambiare: resta l ultima modifica vera
    RETURN json_build_object('settore', v_sett, 'aggiornato_da', v_prima.aggiornato_da,
                             'aggiornato_il', v_prima.aggiornato_il, 'invariato', true);
  END IF;
  INSERT INTO istruzioni_settore (settore, testo, aggiornato_da, aggiornato_il)
  VALUES (v_sett, v_testo, v_op, v_ora)
  ON CONFLICT (settore) DO UPDATE
    SET testo = EXCLUDED.testo, aggiornato_da = EXCLUDED.aggiornato_da, aggiornato_il = EXCLUDED.aggiornato_il;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (v_op, 'Istruzioni del settore modificate',
          v_sett || ': ' || CASE WHEN v_testo = '' THEN 'testo svuotato'
                                 ELSE length(v_testo) || ' caratteri (prima ' || COALESCE(length(v_prima.testo), 0) || ')' END,
          v_sett);
  RETURN json_build_object('settore', v_sett, 'aggiornato_da', v_op, 'aggiornato_il', v_ora);
END;
$function$;

-- ------------------------------------------------------------
-- 3) IMPOSTAZIONI: colonne del briefing per settore (brief_colonne_<settore>)
-- Stessa funzione della 20260900/20260911 con un ramo in piu.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_piano BOOLEAN;
  v_set TEXT[];
  v_sett TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  -- 20260911: password e codice di recupero solo con le loro funzioni
  IF p_chiave IN ('password_hash', 'password_hash_v2', 'recovery_code') THEN
    RAISE EXCEPTION 'Password: si cambia solo con la funzione apposita';
  END IF;
  -- 20260914: colonne del briefing, un elenco JSON per settore (vuoto = predefinite)
  IF p_chiave LIKE 'brief\_colonne\_%' THEN
    v_sett := substr(p_chiave, 15);
    IF v_sett !~ '^[a-z0-9_-]{1,40}$' OR NOT _settore_esiste(v_sett) THEN
      RAISE EXCEPTION 'Settore non valido: %', v_sett;
    END IF;
    IF COALESCE(p_valore, '') <> '' THEN
      BEGIN
        IF jsonb_typeof(p_valore::jsonb) <> 'array' OR jsonb_array_length(p_valore::jsonb) > 30
           OR length(p_valore) > 8000 THEN
          RAISE EXCEPTION 'x';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Colonne del briefing: valore non valido';
      END;
    END IF;
  END IF;
  IF NOT COALESCE(v_admin, false) THEN
    v_piano := _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_formazioni')
      OR _sessione_permesso(p_token, 'gestione_corsi') OR _sessione_permesso(p_token, 'gestione_briefing')
      OR _permesso_piano_auto(p_token, 'piano_auto_vacanze')
      OR _permesso_piano_auto(p_token, 'piano_auto_genera') OR _permesso_piano_auto(p_token, 'piano_auto_import');
    IF p_chiave IN ('backup_ultimo', 'giubileo_notificati') THEN
      NULL; -- registri automatici del programma
    ELSIF p_chiave = 'punti_config' THEN
      IF NOT _sessione_permesso(p_token, 'gestione_punti') THEN
        RAISE EXCEPTION 'Permesso mancante: punti e premi';
      END IF;
    ELSIF p_chiave = 'piano_corsi_orari' THEN
      IF NOT (_sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_corsi')) THEN
        RAISE EXCEPTION 'Permesso mancante: corsi';
      END IF;
    ELSIF p_chiave IN ('brief_evidenziazioni', 'piano_giorno_marker', 'piano_ordine_collab', 'piano_vacanze_ok',
                       'piano_formazione_modelli') OR p_chiave LIKE 'recupero\_colori\_%' THEN
      IF NOT v_piano THEN
        RAISE EXCEPTION 'Permesso mancante: piano';
      END IF;
    ELSIF p_chiave LIKE 'brief\_colonne\_%' THEN
      -- chi compila il briefing (come la tabella piano_briefing), solo nei propri settori
      IF NOT (_sessione_permesso(p_token, 'gestione_briefing') OR _sessione_permesso(p_token, 'gestione_piano')) THEN
        RAISE EXCEPTION 'Permesso mancante: briefing';
      END IF;
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (v_sett = ANY(v_set)) THEN
        RAISE EXCEPTION 'Permesso mancante: briefing del settore % (non e uno dei tuoi settori)', v_sett;
      END IF;
    ELSE
      -- tutte le altre, compresa piano_regole_fonte (riferimenti normativi delle regole)
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;

-- ------------------------------------------------------------
-- DIRITTI: le funzioni interne restano chiuse, quelle del programma si chiamano con la
-- chiave pubblica (il controllo e dentro)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._settore_esiste(text) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.leggi_istruzioni_settore(text)', 'public.salva_istruzioni_settore(text, text, text, timestamptz)',
    'public.upsert_impostazione(text, text, text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END
$$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260914_istruzioni_settore')
ON CONFLICT (nome) DO NOTHING;

-- PostgREST rilegge l elenco delle funzioni
NOTIFY pgrst, 'reload schema';
