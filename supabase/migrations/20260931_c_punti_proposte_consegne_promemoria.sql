-- 23/10/2026 · PUNTI AUTOMATICI COME PROPOSTE, CONSEGNE PER SETTORE, PROMEMORIA (riverifica 3)
-- Decisione del titolare: chi non ha «Punti e premi» non crea piu punti validi. Coperture,
-- cambi turno, rifiuti, competenze, livelli e formazioni diventano PROPOSTE (tabella
-- punti_proposte, stato «da_approvare»): non contano in totali, livelli, premi e statistiche
-- finche chi ha «Punti e premi» (o l amministratore) non le approva in Formazione. Il fatto nel
-- piano non si deve piu fabbricare (G3): si mostra solo a chi approva («verifica»). Restano il
-- controllo dei doppioni (persona, azione, assente, giorno) e i nomi riconosciuti
-- nell anagrafica. Con gli incentivi spenti niente proposte. Approvare, rifiutare e riaprire
-- (Annulla) solo con il permesso, controllato qui, con una riga nel Registro.
-- punti_auto_assegna (20260931_b) si toglie: al suo posto punti_proponi.
-- CONSEGNE (D1): consegna_segna_letta solo per le consegne dei propri settori (come
-- secure_read) e «tutti» con lower(btrim). (D4) Modifica o Annulla di una consegna gia letta:
-- «Consegna gia letta da ...» invece di un errore tecnico.
-- PROMEMORIA (D2, M1): autore = chi e collegato alla creazione e non si cambia; chi non e
-- l autore scrive solo il «Fatto» (completata, completata_da = chi e collegato, completata_at)
-- e push_sent_at; cancellare solo l autore (o l amministratore).
-- Idempotente. Dopo 20260931_b_punti_dal_piano_consegne_promemoria.sql.

BEGIN;

-- PROPOSTE DI PUNTI: una tabella a parte (e non una colonna «stato» in punti_eventi) perche
-- tutto quello che conta i punti (totali, livelli, premi, statistiche, schede, PDF, programma e
-- database) legge punti_eventi: una proposta li non deve mai finire nemmeno per sbaglio. Con
-- una colonna andava aggiunto «e approvata» in ogni lettura, presente e futura.
CREATE TABLE IF NOT EXISTS public.punti_proposte (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  proposto_da text NOT NULL,
  azione text NOT NULL,
  collaboratore text NOT NULL,
  rif_assente text,
  rif_data date,
  punti numeric NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  reparto_dip text,
  verifica text NOT NULL DEFAULT '',
  stato text NOT NULL DEFAULT 'da_approvare',
  deciso_da text,
  deciso_at timestamptz,
  punti_evento_id bigint
);
DO $c$
BEGIN
  ALTER TABLE public.punti_proposte ADD CONSTRAINT punti_proposte_stato_chk
    CHECK (stato IN ('da_approvare', 'approvata', 'rifiutata', 'ritirata'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $c$;
CREATE INDEX IF NOT EXISTS punti_proposte_stato_idx ON public.punti_proposte (stato, created_at);
ALTER TABLE public.punti_proposte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.punti_proposte FROM PUBLIC;
DO $g$
BEGIN
  EXECUTE 'REVOKE ALL ON public.punti_proposte FROM anon, authenticated';
  EXECUTE 'REVOKE ALL ON SEQUENCE public.punti_proposte_id_seq FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $g$;

-- la vecchia funzione che dava punti validi a tutti (20260931_b) non serve piu
DROP FUNCTION IF EXISTS public.punti_auto_assegna(text, text, text, text, date, text);

-- chi puo decidere sulle proposte: amministratore o «Punti e premi»
CREATE OR REPLACE FUNCTION public._punti_approvatore(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $f$
  SELECT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false)
      OR _sessione_permesso(p_token, 'gestione_punti')
$f$;
REVOKE ALL ON FUNCTION public._punti_approvatore(text) FROM PUBLIC;

-- PROPONI: chiunque sia collegato (con gli incentivi accesi). Nomi riconosciuti nell anagrafica
-- (btrim, lower, solo attivi), punti dalla configurazione, autore e ora dal server. Doppione
-- (stessa persona, azione, assente e giorno; per competenze e livelli stesso motivo) gia
-- proposto o gia assegnato = rifiutato. Il fatto nel piano non blocca: si scrive in «verifica»
-- per chi approva.
CREATE OR REPLACE FUNCTION public.punti_proponi(p_token text, p_azione text, p_collaboratore text,
                                                p_assente text, p_data date, p_descrizione text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_az TEXT := lower(btrim(COALESCE(p_azione, '')));
  v_cfg JSONB;
  v_pt NUMERIC;
  v_nome TEXT;
  v_rep TEXT;
  v_ass TEXT;
  v_n INT;
  v_desc TEXT := left(btrim(COALESCE(p_descrizione, '')), 300);
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_auto BOOLEAN;
  v_ver TEXT := '';
  v_riga JSON;
  c_ass CONSTANT TEXT[] := ARRAY['M', 'M1', 'ASS'];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_auto := v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata');
  IF NOT (v_auto OR v_az IN ('competenza', 'sessione_formativa', 'formatore') OR v_az ~ '^livello_[0-9]+$') THEN
    RAISE EXCEPTION 'Punti "%": solo chi ha Punti e premi li assegna', v_az;
  END IF;
  IF v_desc = '' THEN
    RAISE EXCEPTION 'Punti senza motivo';
  END IF;
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  IF v_cfg IS NULL OR COALESCE(v_cfg ->> 'attivo', 'true') = 'false' THEN
    RAISE EXCEPTION 'Incentivi spenti: nessuna proposta di punti';
  END IF;
  SELECT count(*), min(nome), min(lower(COALESCE(reparto_dip, 'slots'))) INTO v_n, v_nome, v_rep
    FROM collaboratori WHERE lower(btrim(nome)) = lower(btrim(COALESCE(p_collaboratore, ''))) AND attivo IS NOT FALSE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Punti: "%" non e un collaboratore attivo', btrim(COALESCE(p_collaboratore, ''));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('punti_proposte|' || lower(v_nome)));
  IF v_az ~ '^livello_[0-9]+$' THEN
    v_pt := NULLIF(v_cfg -> 'per_settore' -> v_rep -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric;
    IF v_pt IS NULL THEN
      v_pt := NULLIF(v_cfg -> 'punti_livello' ->> substring(v_az FROM 9), '')::numeric;
    END IF;
  ELSE
    SELECT NULLIF(a ->> 'punti', '')::numeric INTO v_pt
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_cfg -> 'azioni') = 'array' THEN v_cfg -> 'azioni' ELSE '[]'::jsonb END) a
     WHERE a ->> 'key' = v_az AND COALESCE(a ->> 'attiva', 'true') <> 'false' LIMIT 1;
  END IF;
  IF v_pt IS NULL OR v_pt = 0 THEN
    RAISE EXCEPTION 'Incentivo "%" spento o non configurato', v_az;
  END IF;

  IF v_auto THEN
    IF p_data IS NULL OR p_data < v_oggi - 92 OR p_data > v_oggi + 31 THEN
      RAISE EXCEPTION 'Punti "%": giorno mancante o troppo lontano', v_az;
    END IF;
    SELECT count(*), min(nome) INTO v_n, v_ass
      FROM collaboratori WHERE lower(btrim(nome)) = lower(btrim(COALESCE(p_assente, ''))) AND attivo IS NOT FALSE;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Punti: "%" non e un collaboratore attivo', btrim(COALESCE(p_assente, ''));
    END IF;
    IF v_az <> 'cambio_turno' AND v_ass = v_nome THEN
      RAISE EXCEPTION 'Chi era assente non riceve questi punti';
    END IF;
    -- doppione: stessa persona, azione, assente e giorno, proposto o assegnato
    IF EXISTS (SELECT 1 FROM punti_proposte
                WHERE lower(btrim(collaboratore)) = lower(v_nome) AND azione = v_az
                  AND lower(btrim(COALESCE(rif_assente, ''))) = lower(v_ass) AND rif_data = p_data
                  AND stato IN ('da_approvare', 'approvata'))
       OR EXISTS (SELECT 1 FROM punti_eventi
                   WHERE lower(btrim(collaboratore)) = lower(v_nome) AND azione = v_az
                     AND lower(btrim(COALESCE(rif_assente, ''))) = lower(v_ass) AND rif_data = p_data) THEN
      RAISE EXCEPTION 'Punti "%" a % per % del % gia proposti o assegnati', v_az, v_nome, v_ass, to_char(p_data, 'DD.MM.YYYY');
    END IF;
    -- cosa dice il piano (solo per chi approva, non blocca)
    IF v_az = 'copertura' THEN
      v_ver := CASE WHEN EXISTS (
                 SELECT 1 FROM piano s JOIN piano a ON lower(btrim(a.collaboratore)) = lower(v_ass) AND a.data = s.data
                                                   AND upper(COALESCE(a.codice, '')) = ANY (c_ass)
                  WHERE lower(btrim(s.collaboratore)) = lower(v_nome) AND s.data BETWEEN p_data AND p_data + 31
                    AND position(lower(' - copre ' || v_ass || ' (') IN lower(COALESCE(s.commento, ''))) > 0)
               THEN '' ELSE 'Nel piano non risulta un turno di ' || v_nome || ' che copre ' || v_ass || ' dal ' || to_char(p_data, 'DD.MM.YYYY') END;
    ELSIF v_az = 'disponibilita_negata' THEN
      v_ver := CASE WHEN EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data
                                    AND upper(COALESCE(codice, '')) = ANY (c_ass))
                      OR EXISTS (SELECT 1 FROM piano_storico WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data)
               THEN '' ELSE 'Nel piano ' || v_ass || ' non risulta assente il ' || to_char(p_data, 'DD.MM.YYYY') END;
    ELSE
      v_ver := CASE WHEN EXISTS (SELECT 1 FROM piano_storico WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data)
               THEN '' ELSE 'Nel piano non risulta un cambio di turno di ' || v_ass || ' il ' || to_char(p_data, 'DD.MM.YYYY') END;
    END IF;
  ELSE
    v_ass := NULL;
    -- competenze, livelli e formazioni: si propongono con i permessi di sempre
    IF NOT _punti_approvatore(p_token) THEN
      IF (v_az = 'competenza' OR v_az ~ '^livello_[0-9]+$')
         AND NOT (_sessione_permesso(p_token, 'gestione_competenze') OR _sessione_permesso(p_token, 'gestione_formazioni')
                  OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
        RAISE EXCEPTION 'Permesso mancante: competenze';
      END IF;
      IF v_az IN ('sessione_formativa', 'formatore')
         AND NOT (_sessione_permesso(p_token, 'gestione_formazioni') OR _permesso_piano_auto(p_token, 'piano_formazioni')) THEN
        RAISE EXCEPTION 'Permesso mancante: formazioni';
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM punti_proposte WHERE lower(btrim(collaboratore)) = lower(v_nome) AND azione = v_az
                  AND btrim(descrizione) = v_desc AND stato IN ('da_approvare', 'approvata'))
       OR EXISTS (SELECT 1 FROM punti_eventi WHERE lower(btrim(collaboratore)) = lower(v_nome) AND azione = v_az
                     AND btrim(COALESCE(descrizione, '')) = v_desc) THEN
      RAISE EXCEPTION 'Punti gia proposti o assegnati a % per lo stesso motivo', v_nome;
    END IF;
  END IF;

  INSERT INTO punti_proposte (proposto_da, azione, collaboratore, rif_assente, rif_data, punti, descrizione, reparto_dip, verifica)
  VALUES (v_op, v_az, v_nome, v_ass, CASE WHEN v_auto THEN p_data END, v_pt, v_desc, v_rep, v_ver)
  RETURNING row_to_json(punti_proposte.*) INTO v_riga;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (v_op, 'Punti proposti', v_nome || ' ' || CASE WHEN v_pt > 0 THEN '+' ELSE '' END || v_pt || ' (' || v_az || ')'
          || COALESCE(' per ' || v_ass, '') || ': da approvare', v_rep);
  RETURN v_riga;
END;
$function$;

-- LEGGI: chi approva vede quelle dei suoi settori (tutte con p_stato vuoto, altrimenti quello
-- stato); gli altri solo le proprie
CREATE OR REPLACE FUNCTION public.punti_proposte_leggi(p_token text, p_stato text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT := _validate_op_session(p_token);
  v_set TEXT[];
  v_app BOOLEAN;
BEGIN
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_app := _punti_approvatore(p_token);
  v_set := CASE WHEN COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN NULL
                ELSE _settori_operatore(p_token, false) END;
  RETURN COALESCE((
    SELECT json_agg(row_to_json(x.*) ORDER BY x.created_at DESC)
      FROM (SELECT * FROM punti_proposte p
             WHERE (NULLIF(btrim(COALESCE(p_stato, '')), '') IS NULL OR p.stato = btrim(p_stato))
               AND (CASE WHEN v_app THEN (v_set IS NULL OR lower(COALESCE(p.reparto_dip, 'slots')) = ANY (v_set))
                         ELSE p.proposto_da = v_op END)
             ORDER BY p.created_at DESC LIMIT 1000) x), '[]'::json);
END;
$function$;

-- DECIDI: approva / rifiuta (chi approva), riapri (Annulla di chi approva: torna da approvare
-- e i punti assegnati si tolgono), ritira / ripresenta (chi l ha proposta, finche e da
-- approvare: Annulla e Ripristina della proposta). Una riga nel Registro per ogni decisione.
CREATE OR REPLACE FUNCTION public.punti_proposte_decidi(p_token text, p_ids bigint[], p_decisione text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT := _validate_op_session(p_token);
  v_dec TEXT := lower(btrim(COALESCE(p_decisione, '')));
  v_app BOOLEAN;
  v_set TEXT[];
  v_cfg JSONB;
  p punti_proposte%ROWTYPE;
  v_id BIGINT;
  v_fatte JSON[] := ARRAY[]::json[];
  v_saltate TEXT[] := ARRAY[]::text[];
  v_riga JSON;
BEGIN
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF v_dec NOT IN ('approva', 'rifiuta', 'riapri', 'ritira', 'ripresenta') THEN
    RAISE EXCEPTION 'Decisione non valida: %', v_dec;
  END IF;
  v_app := _punti_approvatore(p_token);
  IF v_dec IN ('approva', 'rifiuta', 'riapri') AND NOT v_app THEN
    RAISE EXCEPTION 'Permesso mancante: approvare i punti (Punti e premi)';
  END IF;
  v_set := CASE WHEN COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false) THEN NULL
                ELSE _settori_operatore(p_token, false) END;
  IF v_dec = 'approva' THEN
    BEGIN
      SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
    EXCEPTION WHEN others THEN
      v_cfg := NULL;
    END;
    IF v_cfg IS NULL OR COALESCE(v_cfg ->> 'attivo', 'true') = 'false' THEN
      RAISE EXCEPTION 'Incentivi spenti: niente da approvare';
    END IF;
  END IF;
  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::bigint[]) LOOP
    SELECT * INTO p FROM punti_proposte WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      v_saltate := v_saltate || ('n. ' || v_id || ': non trovata');
      CONTINUE;
    END IF;
    IF v_app AND v_set IS NOT NULL AND NOT (lower(COALESCE(p.reparto_dip, 'slots')) = ANY (v_set)) THEN
      RAISE EXCEPTION 'Permesso mancante: proposta di un altro settore';
    END IF;
    IF v_dec IN ('ritira', 'ripresenta') AND NOT v_app AND p.proposto_da IS DISTINCT FROM v_op THEN
      RAISE EXCEPTION 'Permesso mancante: la proposta e di %', p.proposto_da;
    END IF;
    IF v_dec = 'approva' THEN
      IF p.stato <> 'da_approvare' THEN
        v_saltate := v_saltate || (p.collaboratore || ': gia ' || p.stato);
        CONTINUE;
      END IF;
      IF p.rif_data IS NOT NULL AND EXISTS (
           SELECT 1 FROM punti_eventi WHERE lower(btrim(collaboratore)) = lower(btrim(p.collaboratore)) AND azione = p.azione
              AND lower(btrim(COALESCE(rif_assente, ''))) = lower(btrim(COALESCE(p.rif_assente, ''))) AND rif_data = p.rif_data) THEN
        v_saltate := v_saltate || (p.collaboratore || ': punti gia assegnati per lo stesso fatto');
        CONTINUE;
      END IF;
      INSERT INTO punti_eventi (collaboratore, punti, azione, descrizione, data_evento, operatore, reparto_dip, rif_assente, rif_data)
      VALUES (p.collaboratore, p.punti, p.azione, p.descrizione, (now() AT TIME ZONE 'Europe/Zurich')::date, v_op,
              p.reparto_dip, p.rif_assente, p.rif_data)
      RETURNING id INTO p.punti_evento_id;
      UPDATE punti_proposte SET stato = 'approvata', deciso_da = v_op, deciso_at = now(), punti_evento_id = p.punti_evento_id
       WHERE id = v_id;
    ELSIF v_dec = 'rifiuta' THEN
      IF p.stato <> 'da_approvare' THEN
        v_saltate := v_saltate || (p.collaboratore || ': gia ' || p.stato);
        CONTINUE;
      END IF;
      UPDATE punti_proposte SET stato = 'rifiutata', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
    ELSIF v_dec = 'riapri' THEN
      IF p.stato NOT IN ('approvata', 'rifiutata') THEN
        CONTINUE;
      END IF;
      IF p.stato = 'approvata' AND p.punti_evento_id IS NOT NULL THEN
        DELETE FROM punti_eventi WHERE id = p.punti_evento_id;
      END IF;
      UPDATE punti_proposte SET stato = 'da_approvare', deciso_da = NULL, deciso_at = NULL, punti_evento_id = NULL WHERE id = v_id;
    ELSIF v_dec = 'ritira' THEN
      IF p.stato <> 'da_approvare' THEN
        RAISE EXCEPTION 'Proposta gia decisa (%): non si ritira piu', p.stato;
      END IF;
      UPDATE punti_proposte SET stato = 'ritirata', deciso_da = v_op, deciso_at = now() WHERE id = v_id;
    ELSE -- ripresenta
      IF p.stato <> 'ritirata' THEN
        CONTINUE;
      END IF;
      UPDATE punti_proposte SET stato = 'da_approvare', deciso_da = NULL, deciso_at = NULL WHERE id = v_id;
    END IF;
    SELECT row_to_json(x.*) INTO v_riga FROM punti_proposte x WHERE id = v_id;
    v_fatte := v_fatte || v_riga;
    INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
    VALUES (v_op,
            CASE v_dec WHEN 'approva' THEN 'Punti approvati' WHEN 'rifiuta' THEN 'Punti rifiutati'
                       WHEN 'riapri' THEN 'Punti di nuovo da approvare' WHEN 'ritira' THEN 'Proposta di punti ritirata'
                       ELSE 'Proposta di punti ripresentata' END,
            p.collaboratore || ' ' || CASE WHEN p.punti > 0 THEN '+' ELSE '' END || p.punti || ' (' || p.azione || ')'
              || COALESCE(' per ' || p.rif_assente, '') || ' · proposta da ' || p.proposto_da,
            p.reparto_dip);
  END LOOP;
  RETURN json_build_object('fatte', to_json(v_fatte), 'saltate', to_json(v_saltate));
END;
$function$;

DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['punti_proponi(text, text, text, text, date, text)', 'punti_proposte_leggi(text, text)',
                           'punti_proposte_decidi(text, bigint[], text)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || f || ' FROM PUBLIC';
    BEGIN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || f || ' TO anon, authenticated, service_role';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $g$;

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
    -- 20260931_c (riverifica 3 D2/M1): anche il promemoria e di chi lo crea (la ripetizione
    -- nasce da chi segna fatto il precedente); «fatto da» e sempre chi e collegato
    ELSIF p_table = 'promemoria' THEN
      p_data := jsonb_set(p_data, '{creato_da}', to_jsonb(v_op));
      IF COALESCE(p_data ->> 'completata_da', '') <> '' THEN
        p_data := jsonb_set(p_data, '{completata_da}', to_jsonb(v_op));
      END IF;
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
  -- 20260931_b (A-R3): l autore di una consegna non si cambia (si puo rimandare uguale)
  IF NOT v_admin AND p_table = 'consegne_turno' AND p_data ? 'operatore' THEN
    IF (p_data ->> 'operatore') IS DISTINCT FROM v_op THEN
      RAISE EXCEPTION 'Consegna: l autore non si cambia';
    END IF;
    p_data := p_data - 'operatore';
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
  END IF;
  -- 20260931_c (D2/M1): promemoria. L autore non si cambia; chi non e l autore (destinatario)
  -- scrive solo il «Fatto» (completata, completata_da = chi e collegato, completata_at) e
  -- push_sent_at; tutto il resto solo l autore
  IF NOT v_admin AND p_table = 'promemoria' THEN
    IF p_data ? 'creato_da' THEN
      IF (p_data ->> 'creato_da') IS DISTINCT FROM v_op THEN
        RAISE EXCEPTION 'Promemoria: l autore non si cambia';
      END IF;
      p_data := p_data - 'creato_da';
    END IF;
    IF COALESCE(p_data ->> 'completata_da', '') <> '' THEN
      p_data := jsonb_set(p_data, '{completata_da}', to_jsonb(v_op));
    END IF;
    IF p_data = '{}'::jsonb THEN RETURN; END IF;
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
  -- 20260931_b (A-R3): consegne solo proprie e non ancora lette; (A-R4) promemoria solo
  -- dell autore o dei destinatari (Fatto, Riattiva); l amministratore tutto
  ELSIF NOT v_admin AND p_table = 'consegne_turno' THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') = ''''';
  ELSIF NOT v_admin AND p_table = 'promemoria' THEN
    v_ambito := CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_data) k
                                       WHERE k NOT IN ('completata', 'completata_da', 'completata_at', 'push_sent_at'))
                     THEN _ambito_promemoria(v_op)
                     ELSE ' AND creato_da = ' || quote_literal(v_op) END;
  ELSIF NOT v_admin AND p_table IN ('push_subscriptions', 'chat_message_letti', 'chat_message_hidden') THEN
    v_ambito := ' AND operatore = ' || quote_literal(v_op);
  ELSIF p_table = 'impostazioni' THEN
    v_ambito := ' AND chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'')';
  END IF;

  -- 20260913: riga chiesta per numero ma esclusa dai permessi: errore, non "fatto" con 0
  -- righe. Una riga che non corrisponde al filtro di valore (es. completata = false) non
  -- e esclusa dai permessi: 0 righe senza errore, come sempre.
  -- 20260931_c (D4): consegna gia letta: chi l ha letta, non un errore tecnico
  IF NOT v_admin AND p_table = 'consegne_turno' AND _filtro_per_id(p_filter) THEN
    EXECUTE 'SELECT string_agg(DISTINCT letto_da, '', '') FROM consegne_turno WHERE (' || p_filter
      || ') AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') <> ''''' INTO v_autore;
    IF v_autore IS NOT NULL THEN
      RAISE EXCEPTION 'Consegna gia letta da %: non si modifica piu', v_autore;
    END IF;
  END IF;
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
  -- 20260931_b (A-R3, A-R4): consegne proprie non lette, promemoria dell autore o dei destinatari
  IF NOT v_admin AND p_table IN ('consegne_turno', 'promemoria') THEN
    v_amb_inv := CASE WHEN p_table = 'consegne_turno'
                      THEN ' AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') = '''''
                      ELSE ' AND creato_da = ' || quote_literal(v_op) END;
    -- 20260931_c (D4): consegna gia letta: chi l ha letta, non un errore tecnico
    IF p_table = 'consegne_turno' AND _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT string_agg(DISTINCT letto_da, '', '') FROM consegne_turno WHERE (' || p_filter
        || ') AND operatore = ' || quote_literal(v_op) || ' AND COALESCE(letto_da, '''') <> ''''' INTO v_rep;
      IF v_rep IS NOT NULL THEN
        RAISE EXCEPTION 'Consegna gia letta da %: non si annulla piu', v_rep;
      END IF;
    END IF;
    IF _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
        || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
      IF v_fuori THEN
        RAISE EXCEPTION 'Permesso mancante: % di un altro operatore (si cancella solo il proprio)', p_table;
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

CREATE OR REPLACE FUNCTION public.consegna_segna_letta(p_token text, p_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op TEXT;
  v_c consegne_turno%ROWTYPE;
  v_elenco TEXT[];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT * INTO v_c FROM consegne_turno WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consegna non trovata';
  END IF;
  -- 20260931_b (A-R3, come A-N2 nel programma): senza la pagina Consegna non si segna letta
  IF NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false)
     AND NOT _pagina_visibile(p_token, 'consegna') THEN
    RAISE EXCEPTION 'Permesso mancante: Consegna turno';
  END IF;
  IF v_c.operatore = v_op THEN
    RAISE EXCEPTION 'La propria consegna non si segna letta';
  END IF;
  -- 20260931_c (riverifica 3 D1): solo le consegne dei propri settori, come secure_read (prima
  -- un operatore dei Tavoli segnava letta, e bloccava, una consegna degli Slots); «tutti» come
  -- lo legge secure_read (maiuscole e spazi)
  IF NOT COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false)
     AND _settori_operatore(p_token, false) IS NOT NULL
     AND NOT (lower(COALESCE(v_c.reparto_dip, 'slots')) = ANY (_settori_operatore(p_token, false))) THEN
    RAISE EXCEPTION 'Consegna non trovata';
  END IF;
  IF NOT (lower(btrim(COALESCE(v_c.destinatario, ''))) = 'tutti'
          OR v_op = ANY (SELECT btrim(x) FROM unnest(string_to_array(COALESCE(v_c.destinatario, ''), ',')) x)) THEN
    RAISE EXCEPTION 'Consegna non destinata a te';
  END IF;
  v_elenco := ARRAY(SELECT btrim(x) FROM unnest(string_to_array(COALESCE(v_c.letto_da, ''), ',')) x
                    WHERE btrim(x) <> '');
  IF NOT (v_op = ANY (v_elenco)) THEN
    v_elenco := v_elenco || v_op;
    UPDATE consegne_turno
       SET letto_da = array_to_string(v_elenco, ', '),
           letto_at = now()
     WHERE id = p_id;
  END IF;
  RETURN json_build_object('letto_da', array_to_string(v_elenco, ', '),
                           'letto_at', (SELECT letto_at FROM consegne_turno WHERE id = p_id));
END;
$function$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260931_c_punti_proposte_consegne_promemoria')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
