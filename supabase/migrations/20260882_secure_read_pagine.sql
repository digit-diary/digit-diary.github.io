-- v335 · secure_read legge anche le pagine successive (p_offset). Prima ogni
-- lettura si fermava a 5000 righe e le altre sparivano senza avviso: ora il
-- programma, se una lettura arriva al limite, chiede la pagina dopo.
-- Corpo identico a quello in produzione al 01.10.2026 piu OFFSET (e un tetto
-- di 10000 righe per pagina). Le chiamate senza p_offset restano identiche.
DROP FUNCTION IF EXISTS public.secure_read(text, text, text, text, integer);
-- rieseguibile: si toglie anche la versione con p_offset se c e gia
DROP FUNCTION IF EXISTS public.secure_read(text, text, text, text, integer, integer);
CREATE FUNCTION public.secure_read(p_token text, p_table text, p_filter text DEFAULT ''::text, p_order text DEFAULT ''::text, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_result JSON;
  v_query TEXT;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
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

  v_query := 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (SELECT * FROM ' || quote_ident(p_table);

  IF p_table = 'note_colleghi' THEN
    v_query := v_query || ' WHERE (da_operatore = ' || quote_literal(v_op) || ' AND (nascosta_mitt IS NOT TRUE)) OR (a_operatore = ' || quote_literal(v_op) || ' AND (nascosta_dest IS NOT TRUE))';
  ELSIF p_table = 'impostazioni' THEN
    v_query := v_query || ' WHERE chiave NOT IN (''password_hash'', ''password_hash_v2'', ''recovery_code'', ''groq_api_key'')';
    IF p_filter != '' THEN
      v_query := v_query || ' AND ' || p_filter;
    END IF;
  ELSIF p_table = 'chat_messages' THEN
    v_query := v_query || ' WHERE id NOT IN (SELECT message_id FROM chat_message_hidden WHERE operatore = ' || quote_literal(v_op) || ') AND (da_operatore = ' || quote_literal(v_op) || ' OR a_operatore = ' || quote_literal(v_op) || ' OR group_id IN (SELECT group_id FROM chat_group_members WHERE operatore = ' || quote_literal(v_op) || '))';
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
NOTIFY pgrst, 'reload schema';
