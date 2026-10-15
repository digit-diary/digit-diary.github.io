-- ============================================================
-- ANNULLA E RIPRISTINA RICREANO LA RIGA COM ERA (15/10/2026)
--
-- Problema: Ripristina di un aggiunta e Annulla di un eliminazione rimettono la riga con il
-- suo numero (id), perche altre righe la richiamano. Nelle tabelle con l id "generated
-- always" (hr_eventi, hr_allegati, inventario, piano, piano_turni, piano_codici,
-- piano_fabbisogni, piano_regole, piano_regole_gruppo, piano_festivi, piano_timbrature,
-- piano_mappature, piano_vacanze, piano_formulari, piano_briefing...) secure_insert falliva:
-- "cannot insert a non-DEFAULT value into column id". Esempio: storico HR aggiunto,
-- Annulla, Ripristina = errore e la riga persa; storico HR eliminato, Annulla = errore.
-- Correzione: secure_insert usa OVERRIDING SYSTEM VALUE quando l id arriva ed e un numero
-- gia dato dalla sequenza della tabella (mai oltre: i numeri futuri restano liberi).
-- Le altre tabelle (id con sequenza normale) non cambiano. Rilanciabile.
-- ============================================================
BEGIN;
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

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260919_annulla_ricrea_righe')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
