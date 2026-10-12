-- ============================================================
-- PERSONALIZZAZIONI DALLE SCHERMATE, SECONDO RILASCIO (v453, 12/10/2026)
-- Due cose che prima richiedevano di modificare il codice ora si cambiano dalle schermate:
--
-- 1) MODELLI DEI DOCUMENTI: i testi fissi (titoli, frasi standard, diciture, firme,
--    distribuzione) dei moduli disciplinari (allineamento, apprezzamento, RDI), della lista
--    di non disponibilita 1187, della notifica d assenza 827, del foglio di cambio turno e
--    del formulario di cambio vacanza. I campi compilati dall utente nel modulo non cambiano;
--    l impaginazione del PDF resta quella di sempre. Senza testi salvati (o con la tabella
--    vuota) il programma usa i testi originali: i PDF restano identici a prima.
--    Tabella dedicata modelli_documenti, una riga per documento: testi = solo i testi
--    cambiati {chiave: testo}, con chi e quando (li scrive il database). Perche una tabella e
--    non impostazioni:
--    - si scrive SOLO con salva_modello_documento, che controlla il permesso: con
--      impostazioni la chiave sarebbe "riservata all amministratore" e il permesso
--      delegabile non si potrebbe dare;
--    - ogni salvataggio conserva la versione di prima e quella nuova
--      (modelli_documenti_versioni, le ultime 30 per documento): si rimette una versione
--      precedente dalla finestra dei modelli;
--    - due persone che modificano insieme: chi salva per secondo riceve "modificato nel
--      frattempo" invece di cancellare il testo dell altro (p_atteso = ora letta);
--    - il Registro attivita riceve ogni testo cambiato, prima e dopo.
--    Funzioni (sessione valida, il controllo e dentro):
--      leggi_modelli_documenti(token)                       -> [{tipo, testi, aggiornato_da, aggiornato_il}]
--        (tutti quelli che accedono: servono per stampare i documenti)
--      salva_modello_documento(token, tipo, testi, atteso)  -> {tipo, aggiornato_da, aggiornato_il}
--      leggi_versioni_modello(token, tipo)                  -> [{id, testi_prima, testi_dopo, autore, quando}]
--    Chi scrive (e vede le versioni): l amministratore, oppure chi ha il permesso delegabile
--    "Modelli dei documenti: modificare" (gestione_modelli, Impostazioni > Visibilita e
--    permessi; predefinito: solo amministratore).
-- 2) IMPORT DEL PIANO DA EXCEL CON LE COLONNE A SCELTA: la mappatura delle colonne di un
--    file di formato diverso si salva per settore nell impostazione
--    piano_import_colonne_<settore> (un oggetto JSON piccolo). La scrive chi puo importare il
--    piano da file (gestione_piano e "Importare da file"), solo per i SUOI settori.
--
-- Effetti per gli utenti: nessuno finche nessuno cambia un modello o salva una mappatura.
-- Si puo rilanciare.
-- ============================================================

-- ------------------------------------------------------------
-- 1) MODELLI DEI DOCUMENTI
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modelli_documenti (
  tipo TEXT PRIMARY KEY,
  testi JSONB NOT NULL DEFAULT '{}'::jsonb,
  aggiornato_da TEXT,
  aggiornato_il TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.modelli_documenti IS
  'Testi fissi dei documenti stampati (solo quelli cambiati, {chiave: testo}). Si legge e si scrive solo con leggi_modelli_documenti / salva_modello_documento.';
CREATE TABLE IF NOT EXISTS public.modelli_documenti_versioni (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,
  testi_prima JSONB NOT NULL DEFAULT '{}'::jsonb,
  testi_dopo JSONB NOT NULL DEFAULT '{}'::jsonb,
  autore TEXT,
  quando TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS modelli_documenti_versioni_tipo_idx ON public.modelli_documenti_versioni (tipo, quando DESC);
COMMENT ON TABLE public.modelli_documenti_versioni IS
  'Storico dei modelli dei documenti: a ogni salvataggio i testi di prima e quelli nuovi (le ultime 30 versioni per documento).';
-- nessun accesso diretto: solo attraverso le funzioni (RLS senza regole, nessun diritto)
ALTER TABLE public.modelli_documenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelli_documenti_versioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.modelli_documenti FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.modelli_documenti_versioni FROM PUBLIC, anon, authenticated;

-- chi puo modificare i modelli: amministratore o permesso gestione_modelli
CREATE OR REPLACE FUNCTION public._modelli_permesso(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  IF COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token AND expires_at > now()), false) THEN
    RETURN true;
  END IF;
  RETURN _sessione_permesso(p_token, 'gestione_modelli');
END;
$function$;

-- testi validi: oggetto {chiave: testo}, chiavi semplici, testi corti
CREATE OR REPLACE FUNCTION public._modelli_testi_validi(p_testi jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public, extensions
AS $function$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  IF p_testi IS NULL OR jsonb_typeof(p_testi) <> 'object' THEN
    RETURN 'i testi devono essere un elenco {chiave: testo}';
  END IF;
  IF length(p_testi::text) > 40000 THEN
    RETURN 'testi troppo lunghi (massimo 40000 caratteri in tutto)';
  END IF;
  FOR r IN SELECT key, value FROM jsonb_each(p_testi) LOOP
    n := n + 1;
    IF r.key !~ '^[a-z0-9_]{1,40}$' THEN
      RETURN 'chiave non valida: ' || left(r.key, 40);
    END IF;
    IF jsonb_typeof(r.value) <> 'string' THEN
      RETURN 'il testo di ' || r.key || ' non e un testo';
    END IF;
    IF length(r.value #>> '{}') > 3000 THEN
      RETURN 'testo di ' || r.key || ' troppo lungo (massimo 3000 caratteri)';
    END IF;
  END LOOP;
  IF n > 80 THEN
    RETURN 'troppi testi (massimo 80)';
  END IF;
  RETURN NULL;
END;
$function$;

-- lettura: tutti quelli con una sessione valida (i testi servono per stampare)
CREATE OR REPLACE FUNCTION public.leggi_modelli_documenti(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object('tipo', m.tipo, 'testi', m.testi,
                                      'aggiornato_da', m.aggiornato_da, 'aggiornato_il', m.aggiornato_il)
                    ORDER BY m.tipo)
      FROM modelli_documenti m), '[]'::json);
END;
$function$;

-- scrittura: amministratore o permesso gestione_modelli. p_testi = SOLO i testi diversi
-- dall originale ({} = tutto originale). p_atteso = ora dell ultima modifica letta (NULL =
-- non c era una riga): se nel frattempo qualcuno ha salvato, errore invece di sovrascrivere.
CREATE OR REPLACE FUNCTION public.salva_modello_documento(p_token text, p_tipo text, p_testi jsonb,
                                                          p_atteso timestamptz DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_op TEXT;
  v_tipo TEXT := lower(btrim(COALESCE(p_tipo, '')));
  v_testi JSONB := COALESCE(p_testi, '{}'::jsonb);
  v_err TEXT;
  v_prima public.modelli_documenti%ROWTYPE;
  v_prima_testi JSONB;
  v_esisteva BOOLEAN;
  v_ora TIMESTAMPTZ := clock_timestamp();
  v_det TEXT := '';
  k TEXT;
  v_a TEXT;
  v_b TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF NOT _modelli_permesso(p_token) THEN
    RAISE EXCEPTION 'Permesso mancante: modelli dei documenti';
  END IF;
  IF v_tipo !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Documento non valido: %', p_tipo;
  END IF;
  v_err := _modelli_testi_validi(v_testi);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'Modello non salvato: %', v_err;
  END IF;
  SELECT * INTO v_prima FROM modelli_documenti WHERE tipo = v_tipo FOR UPDATE;
  v_esisteva := FOUND;
  IF (v_esisteva AND v_prima.aggiornato_il IS DISTINCT FROM p_atteso) OR (NOT v_esisteva AND p_atteso IS NOT NULL) THEN
    RAISE EXCEPTION 'Modello modificato nel frattempo da % (%): riapri e salva di nuovo',
      COALESCE(v_prima.aggiornato_da, 'un collega'),
      COALESCE(to_char(v_prima.aggiornato_il AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI'), 'tolto');
  END IF;
  v_prima_testi := CASE WHEN v_esisteva THEN v_prima.testi ELSE '{}'::jsonb END;
  IF v_prima_testi = v_testi THEN
    RETURN json_build_object('tipo', v_tipo, 'aggiornato_da', v_prima.aggiornato_da,
                             'aggiornato_il', v_prima.aggiornato_il, 'invariato', true);
  END IF;
  INSERT INTO modelli_documenti (tipo, testi, aggiornato_da, aggiornato_il)
  VALUES (v_tipo, v_testi, v_op, v_ora)
  ON CONFLICT (tipo) DO UPDATE
    SET testi = EXCLUDED.testi, aggiornato_da = EXCLUDED.aggiornato_da, aggiornato_il = EXCLUDED.aggiornato_il;
  INSERT INTO modelli_documenti_versioni (tipo, testi_prima, testi_dopo, autore, quando)
  VALUES (v_tipo, v_prima_testi, v_testi, v_op, v_ora);
  -- si tengono le ultime 30 versioni di ogni documento
  DELETE FROM modelli_documenti_versioni
   WHERE tipo = v_tipo
     AND id NOT IN (SELECT id FROM modelli_documenti_versioni WHERE tipo = v_tipo ORDER BY quando DESC, id DESC LIMIT 30);
  -- nel Registro: ogni testo cambiato, prima e dopo ("(originale)" = testo del programma)
  FOR k IN SELECT x FROM (SELECT jsonb_object_keys(v_prima_testi) AS x UNION SELECT jsonb_object_keys(v_testi)) u ORDER BY x LOOP
    v_a := v_prima_testi ->> k;
    v_b := v_testi ->> k;
    IF v_a IS DISTINCT FROM v_b THEN
      v_det := v_det || CASE WHEN v_det = '' THEN '' ELSE ' · ' END || k || ': '
               || COALESCE('"' || v_a || '"', '(originale)') || ' -> ' || COALESCE('"' || v_b || '"', '(originale)');
    END IF;
  END LOOP;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (v_op, 'Modello del documento modificato', left(v_tipo || ' · ' || v_det, 8000), NULL);
  RETURN json_build_object('tipo', v_tipo, 'aggiornato_da', v_op, 'aggiornato_il', v_ora);
END;
$function$;

-- versioni conservate di un documento (per rimettere un testo di prima): solo chi puo modificare
CREATE OR REPLACE FUNCTION public.leggi_versioni_modello(p_token text, p_tipo text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF NOT _modelli_permesso(p_token) THEN
    RAISE EXCEPTION 'Permesso mancante: modelli dei documenti';
  END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object('id', v.id, 'testi_prima', v.testi_prima, 'testi_dopo', v.testi_dopo,
                                      'autore', v.autore, 'quando', v.quando)
                    ORDER BY v.quando DESC, v.id DESC)
      FROM modelli_documenti_versioni v WHERE v.tipo = lower(btrim(COALESCE(p_tipo, '')))), '[]'::json);
END;
$function$;

-- ------------------------------------------------------------
-- 2) IMPOSTAZIONI: mappatura delle colonne dell import del piano (piano_import_colonne_<settore>)
-- Stessa funzione della 20260914 con un ramo in piu.
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
  -- 20260915: colonne dell import del piano, un oggetto JSON per settore (vuoto = nessuna)
  IF p_chiave LIKE 'piano\_import\_colonne\_%' THEN
    v_sett := substr(p_chiave, 22);
    IF v_sett !~ '^[a-z0-9_-]{1,40}$' OR NOT _settore_esiste(v_sett) THEN
      RAISE EXCEPTION 'Settore non valido: %', v_sett;
    END IF;
    IF COALESCE(p_valore, '') <> '' THEN
      BEGIN
        IF jsonb_typeof(p_valore::jsonb) <> 'object' OR length(p_valore) > 2000 THEN
          RAISE EXCEPTION 'x';
        END IF;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Colonne dell import: valore non valido';
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
    ELSIF p_chiave LIKE 'piano\_import\_colonne\_%' THEN
      -- chi importa il piano da file (come nel programma: piano e "Importare da file"),
      -- solo nei propri settori
      IF NOT (_sessione_permesso(p_token, 'gestione_piano') AND _permesso_piano_auto(p_token, 'piano_auto_import')) THEN
        RAISE EXCEPTION 'Permesso mancante: importare il piano da file';
      END IF;
      v_set := _settori_operatore(p_token, true);
      IF v_set IS NOT NULL AND NOT (v_sett = ANY(v_set)) THEN
        RAISE EXCEPTION 'Permesso mancante: import del settore % (non e uno dei tuoi settori)', v_sett;
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
REVOKE EXECUTE ON FUNCTION public._modelli_permesso(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._modelli_testi_validi(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.leggi_modelli_documenti(text)', 'public.salva_modello_documento(text, text, jsonb, timestamptz)',
    'public.leggi_versioni_modello(text, text)', 'public.upsert_impostazione(text, text, text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END
$$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260915_modelli_documenti_import')
ON CONFLICT (nome) DO NOTHING;

-- PostgREST rilegge l elenco delle funzioni
NOTIFY pgrst, 'reload schema';
