-- 23/10/2026 · PUNTI AUTOMATICI DAL PIANO, CONSEGNE E PROMEMORIA (riverifica 2: G1, G2, A-R3, A-R4)
-- PUNTI (alla radice): con 20260931_a i punti di copertura si gonfiavano ancora via REST con
-- spazi in fondo al nome dell assente (G1) o con una malattia inventata nel Diario (G2). Ora
-- chi non ha Punti e premi non scrive piu punti_eventi: li crea solo punti_auto_assegna, che
--   - riconosce collaboratore e assente nell anagrafica (btrim, lower, solo attivi) e scrive
--     i nomi come sono li;
--   - copertura: la cella del sostituto quel giorno ha la nota «copre <assente> (» e
--     l assente ha M, M1 o ASS nel piano (la sola registrazione del Diario non basta);
--     una volta sola per sostituto e giorno;
--   - rifiuto: l assente ha M/M1/ASS quel giorno (una volta per persona e assenza) oppure il
--     cambio turno di quel giorno; cambio turno: la cella cambiata nel piano negli ultimi 7
--     giorni, una volta per persona e giorno;
--   - competenze, livelli e formazioni con i permessi di sempre;
--   - punti dalla configurazione, incentivi accesi, autore e data dal server.
-- CONSEGNE (A-R3): modifica e cancellazione solo dell autore (o amministratore) e solo se
--   nessuno l ha letta; l autore non si cambia; «letta» solo con consegna_segna_letta, con la
--   pagina Consegna e da un destinatario.
-- PROMEMORIA (A-R4): modifica e cancellazione solo dell autore, dei destinatari (Fatto,
--   Riattiva) o dell amministratore. La ripetizione resta: la crea chi lo segna fatto.
-- PIANO: updated_at con valore predefinito now() (righe nuove con la data di modifica).
-- Idempotente. Dopo 20260931_a_punti_copertura_sicuri.sql.

BEGIN;

-- promemoria che un operatore puo modificare o cancellare: scritti da lui o destinati a lui
-- (assegnato_a = 'tutti' o un elenco con il suo nome): Fatto, Riattiva, Annulla
CREATE OR REPLACE FUNCTION public._ambito_promemoria(p_op text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT ' AND (creato_da = ' || quote_literal(p_op) || ' OR COALESCE(assegnato_a, '''') = ''tutti'' OR '
    || quote_literal(p_op) || ' = ANY (SELECT btrim(x) FROM unnest(string_to_array(COALESCE(assegnato_a, ''''), '','')) x))'
$f$;
REVOKE ALL ON FUNCTION public._ambito_promemoria(text) FROM PUBLIC;

-- PUNTI DEGLI INCENTIVI ASSEGNATI DAL PROGRAMMA (chi non ha Punti e premi passa solo da qui)
-- p_azione: copertura, cambio_turno, disponibilita_negata, competenza, livello_N,
--           sessione_formativa, formatore
-- p_collaboratore: chi riceve i punti; p_assente: chi era assente (o a chi e cambiato il turno)
-- p_data: il giorno del fatto (copertura: dal primo giorno dell assenza si prende il primo
--         turno coperto dal sostituto non ancora premiato)
CREATE OR REPLACE FUNCTION public.punti_auto_assegna(p_token text, p_azione text, p_collaboratore text,
                                                     p_assente text, p_data date, p_descrizione text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
  v_az TEXT := lower(btrim(COALESCE(p_azione, '')));
  v_cfg JSONB;
  v_pt NUMERIC;
  v_nome TEXT;
  v_rep TEXT;
  v_ass TEXT;
  v_n INT;
  v_desc TEXT := left(btrim(COALESCE(p_descrizione, '')), 300);
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_giorno DATE;
  v_inizio DATE;
  v_fine DATE;
  v_auto BOOLEAN;
  v_riga JSON;
  c_ass CONSTANT TEXT[] := ARRAY['M', 'M1', 'ASS'];
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  v_admin := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
  v_auto := v_az IN ('copertura', 'cambio_turno', 'disponibilita_negata');
  IF NOT (v_auto OR v_az IN ('competenza', 'sessione_formativa', 'formatore') OR v_az ~ '^livello_[0-9]+$') THEN
    RAISE EXCEPTION 'Permesso mancante: punti "%" solo da chi ha Punti e premi', v_az;
  END IF;
  IF v_desc = '' THEN
    RAISE EXCEPTION 'Punti senza motivo';
  END IF;
  -- incentivi accesi (tutti e l azione)
  BEGIN
    SELECT valore::jsonb INTO v_cfg FROM impostazioni WHERE chiave = 'punti_config';
  EXCEPTION WHEN others THEN
    v_cfg := NULL;
  END;
  IF v_cfg IS NULL OR COALESCE(v_cfg ->> 'attivo', 'true') = 'false' THEN
    RAISE EXCEPTION 'Incentivi spenti: nessun punto';
  END IF;
  -- chi riceve i punti: collaboratore attivo, il nome come e nell anagrafica
  SELECT count(*), min(nome), min(lower(COALESCE(reparto_dip, 'slots'))) INTO v_n, v_nome, v_rep
    FROM collaboratori WHERE lower(btrim(nome)) = lower(btrim(COALESCE(p_collaboratore, ''))) AND attivo IS NOT FALSE;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Punti: "%" non e un collaboratore attivo', btrim(COALESCE(p_collaboratore, ''));
  END IF;
  -- una richiesta alla volta per persona (due PC insieme non passano entrambi i controlli)
  PERFORM pg_advisory_xact_lock(hashtext('punti_auto|' || lower(v_nome)));

  -- valore dalla configurazione
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

    IF v_az = 'copertura' THEN
      -- l assenza che comincia (o e in corso) quel giorno: giorni di fila con M, M1 o ASS
      IF NOT EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data
                        AND upper(COALESCE(codice, '')) = ANY (c_ass)) THEN
        RAISE EXCEPTION 'Nessuna malattia o assenza di % il % nel piano', v_ass, to_char(p_data, 'DD.MM.YYYY');
      END IF;
      v_fine := p_data;
      WHILE EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = v_fine + 1
                       AND upper(COALESCE(codice, '')) = ANY (c_ass)) AND v_fine < p_data + 92 LOOP
        v_fine := v_fine + 1;
      END LOOP;
      -- il primo turno di quell assenza coperto dal sostituto (nota «copre <assente> (») non
      -- ancora premiato
      SELECT s.data INTO v_giorno
        FROM piano s
        JOIN piano a ON lower(btrim(a.collaboratore)) = lower(v_ass) AND a.data = s.data
                    AND upper(COALESCE(a.codice, '')) = ANY (c_ass)
       WHERE lower(btrim(s.collaboratore)) = lower(v_nome)
         AND s.data BETWEEN p_data AND v_fine
         AND position(lower(' - copre ' || v_ass || ' (') IN lower(COALESCE(s.commento, ''))) > 0
         AND NOT EXISTS (SELECT 1 FROM punti_eventi p
                          WHERE lower(btrim(p.collaboratore)) = lower(v_nome) AND p.azione = 'copertura'
                            AND p.rif_data = s.data)
       ORDER BY s.data LIMIT 1;
      IF v_giorno IS NULL THEN
        RAISE EXCEPTION 'Nessun turno coperto da % per l assenza di % del % nel piano (o gia premiato): prima si copre il turno',
          v_nome, v_ass, to_char(p_data, 'DD.MM.YYYY');
      END IF;
    ELSIF v_az = 'cambio_turno' THEN
      IF NOT EXISTS (SELECT 1 FROM piano_storico
                      WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data
                        AND quando > now() - interval '7 days') THEN
        RAISE EXCEPTION 'Nessun cambio turno di % il % nel piano', v_ass, to_char(p_data, 'DD.MM.YYYY');
      END IF;
      IF EXISTS (SELECT 1 FROM punti_eventi WHERE lower(btrim(collaboratore)) = lower(v_nome)
                    AND azione = 'cambio_turno' AND rif_data = p_data) THEN
        RAISE EXCEPTION 'Punti del cambio turno del % gia assegnati a %', to_char(p_data, 'DD.MM.YYYY'), v_nome;
      END IF;
      v_giorno := p_data;
    ELSE -- disponibilita_negata
      IF EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data
                    AND upper(COALESCE(codice, '')) = ANY (c_ass)) THEN
        -- l assenza intera (giorni di fila): un rifiuto per persona e assenza
        v_inizio := p_data;
        WHILE EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = v_inizio - 1
                         AND upper(COALESCE(codice, '')) = ANY (c_ass)) AND v_inizio > p_data - 92 LOOP
          v_inizio := v_inizio - 1;
        END LOOP;
        v_fine := p_data;
        WHILE EXISTS (SELECT 1 FROM piano WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = v_fine + 1
                         AND upper(COALESCE(codice, '')) = ANY (c_ass)) AND v_fine < p_data + 92 LOOP
          v_fine := v_fine + 1;
        END LOOP;
      ELSIF EXISTS (SELECT 1 FROM piano_storico WHERE lower(btrim(collaboratore)) = lower(v_ass) AND data = p_data
                       AND quando > now() - interval '7 days') THEN
        v_inizio := p_data;
        v_fine := p_data;
      ELSE
        RAISE EXCEPTION 'Nessuna assenza di % il % nel piano (e nessun cambio turno)', v_ass, to_char(p_data, 'DD.MM.YYYY');
      END IF;
      IF EXISTS (SELECT 1 FROM punti_eventi WHERE lower(btrim(collaboratore)) = lower(v_nome)
                    AND azione = 'disponibilita_negata' AND lower(btrim(rif_assente)) = lower(v_ass)
                    AND rif_data BETWEEN v_inizio AND v_fine) THEN
        RAISE EXCEPTION 'Rifiuto di % per l assenza di % gia registrato', v_nome, v_ass;
      END IF;
      v_giorno := p_data;
    END IF;
  ELSE
    -- competenze, livelli, formazioni: i permessi di sempre
    IF NOT v_admin AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
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
    IF EXISTS (SELECT 1 FROM punti_eventi WHERE lower(btrim(collaboratore)) = lower(v_nome) AND azione = v_az
                  AND btrim(COALESCE(descrizione, '')) = v_desc) THEN
      RAISE EXCEPTION 'Punti gia assegnati a % per lo stesso motivo', v_nome;
    END IF;
  END IF;

  INSERT INTO punti_eventi (collaboratore, punti, azione, descrizione, data_evento, operatore, reparto_dip,
                            rif_assente, rif_data)
  VALUES (v_nome, v_pt, v_az, v_desc, v_oggi, v_op, v_rep, v_ass, v_giorno)
  RETURNING row_to_json(punti_eventi.*) INTO v_riga;
  RETURN v_riga;
END;
$function$;

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
  v_giorni INT;
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v407: il registro delle attivita non si modifica (solo aggiunte)
  IF p_table = 'log_attivita' AND p_azione = 'update' THEN
    RAISE EXCEPTION 'Il registro delle attivita non si modifica';
  END IF;
  -- 20260911: tabelle con il Cestino: la cancellazione definitiva e dell amministratore
  IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'delete' THEN
    RAISE EXCEPTION 'Eliminazione definitiva riservata all amministratore: si usa il Cestino';
  END IF;
  IF p_table IN ('registrazioni', 'moduli', 'valutazioni') AND p_azione = 'update' AND p_data ?| ARRAY['id', 'created_at', 'operatore'] THEN
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
  -- 20260931_b (A-R3): Consegna solo con la pagina; «letta» solo con consegna_segna_letta
  IF p_table = 'consegne_turno' AND NOT _pagina_visibile(p_token, 'consegna') THEN
    RAISE EXCEPTION 'Permesso mancante: Consegna turno';
  END IF;
  IF p_table = 'consegne_turno' AND p_azione = 'update' AND p_data ?| ARRAY['letto_da', 'letto_at'] THEN
    RAISE EXCEPTION 'Consegna: si segna letta solo aprendola (consegna_segna_letta)';
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
  -- 20260931_b (riverifica 2, G1/G2): senza Punti e premi i punti non si scrivono piu
  -- direttamente. Li crea solo punti_auto_assegna, che ricava il fatto dal PIANO (copertura,
  -- assenza, cambio turno) e da nome, punti, autore e data. Chi ha Punti e premi resta libero.
  IF p_table = 'punti_eventi' AND NOT _sessione_permesso(p_token, 'gestione_punti') THEN
    IF p_azione IN ('insert', 'update') THEN
      RAISE EXCEPTION 'Permesso mancante: punti e premi (i punti automatici li assegna il programma dal piano)';
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
    v_ambito := _ambito_promemoria(v_op);
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
                      ELSE _ambito_promemoria(v_op) END;
    IF _filtro_per_id(p_filter) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM ' || quote_ident(p_table) || ' WHERE (' || p_filter
        || ') AND NOT COALESCE((TRUE' || v_amb_inv || '), false))' INTO v_fuori;
      IF v_fuori THEN
        RAISE EXCEPTION 'Permesso mancante: % di un altro operatore (o consegna gia letta)', p_table;
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
  IF NOT (COALESCE(v_c.destinatario, '') = 'tutti'
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

ALTER TABLE public.piano ALTER COLUMN updated_at SET DEFAULT now();

DO $g$
BEGIN
  REVOKE ALL ON FUNCTION public.punti_auto_assegna(text, text, text, text, date, text) FROM PUBLIC;
  BEGIN
    GRANT EXECUTE ON FUNCTION public.punti_auto_assegna(text, text, text, text, date, text) TO anon, authenticated, service_role;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $g$;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260931_b_punti_dal_piano_consegne_promemoria')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
