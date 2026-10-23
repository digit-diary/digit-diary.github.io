-- ============================================================
-- DATA "VALIDA DAL" DELLE SCELTE DEI COLLABORATORI, MODIFICABILE (23/10/2026)
-- Lo storico delle scelte (collab_scelte_storico, migrazione 20260923) lo scrive solo il
-- trigger, con la data del salvataggio. Una scelta inserita oggi ma valida da prima (es. una
-- persona che lavora solo venerdi e sabato da sempre, scelta scritta l 08.10) faceva giudicare
-- i mesi passati con la scelta sbagliata (domeniche e ore contate come per tutti).
-- Qui una funzione dedicata cambia la data di inizio della scelta di OGGI:
--   scelte_storico_imposta_dal(p_token, p_collaboratore_id, p_campo, p_data)
--     p_data NULL = "da sempre": le righe di quella scelta si tolgono (vale la colonna di oggi
--                   in ogni giorno, come per chi non ha mai cambiato);
--     p_data data = l ultimo cambio della scelta vale da quel giorno (le righe dell ultimo
--                   giorno di cambio si spostano); senza righe se ne crea una ("prima" = nessuna
--                   scelta, o il contrario della spunta).
--   Permessi: amministratore, oppure chi modifica le preferenze del piano (Piano o Storico HR
--   modificare, come _controlla_permessi_scrittura) per un collaboratore del suo settore.
--   Controlli: data non nel futuro, non prima del cambio precedente della stessa scelta.
--   Riga nel registro (log_attivita "Piano: scelta valida dal").
-- Funzioni nuove: 1. Rilanciabile.
-- ============================================================
BEGIN;

-- origine 'correzione' = data cambiata a mano con questa funzione
ALTER TABLE public.collab_scelte_storico DROP CONSTRAINT IF EXISTS collab_scelte_storico_origine_check;
ALTER TABLE public.collab_scelte_storico
  ADD CONSTRAINT collab_scelte_storico_origine_check CHECK (origine IN ('salvataggio', 'registro', 'correzione'));

CREATE OR REPLACE FUNCTION public.scelte_storico_imposta_dal(p_token text, p_collaboratore_id bigint, p_campo text,
                                                            p_data date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_admin BOOLEAN;
  v_op TEXT;
  v_ok BOOLEAN;
  v_c RECORD;
  v_oggi DATE := (now() AT TIME ZONE 'Europe/Zurich')::date;
  v_ultimo DATE;
  v_prec DATE;
  v_val TEXT;
  v_n INT;
  v_det TEXT;
BEGIN
  IF _validate_op_session(p_token) IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  IF p_campo NOT IN ('solo_notti', 'solo_diurni', 'giorni_lavoro', 'giorni_settimana', 'turni_solo_a_mano') THEN
    RAISE EXCEPTION 'Scelta sconosciuta: %', p_campo;
  END IF;
  SELECT is_admin, operatore INTO v_admin, v_op FROM operator_sessions WHERE token = p_token LIMIT 1;
  v_admin := COALESCE(v_admin, false);
  IF NOT v_admin AND NOT (_sessione_permesso(p_token, 'gestione_piano') OR _hr_modifica(p_token)) THEN
    RAISE EXCEPTION 'Permesso mancante: preferenze del piano';
  END IF;
  -- il collaboratore deve essere fra quelli che l operatore vede (stesso ambito della lista)
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM collaboratori WHERE id = $1' || _ambito_collaboratori(p_token) || ')'
    INTO v_ok USING p_collaboratore_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Permesso mancante: collaboratore di un altro settore';
  END IF;
  SELECT * INTO v_c FROM collaboratori WHERE id = p_collaboratore_id;
  IF p_data IS NOT NULL AND p_data > v_oggi THEN
    RAISE EXCEPTION 'La data non puo essere nel futuro';
  END IF;
  SELECT max(valido_dal) INTO v_ultimo FROM collab_scelte_storico
   WHERE collaboratore_id = p_collaboratore_id AND campo = p_campo;
  SELECT max(valido_dal) INTO v_prec FROM collab_scelte_storico
   WHERE collaboratore_id = p_collaboratore_id AND campo = p_campo AND valido_dal < v_ultimo;
  IF p_data IS NULL THEN
    DELETE FROM collab_scelte_storico WHERE collaboratore_id = p_collaboratore_id AND campo = p_campo;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_det := v_c.nome || ' ' || p_campo || ': da sempre'
      || CASE WHEN v_ultimo IS NOT NULL THEN ' (prima dal ' || to_char(v_ultimo, 'DD.MM.YYYY') || ', ' || v_n
              || ' cambi tolti)' ELSE '' END;
  ELSIF v_ultimo IS NULL THEN
    -- nessun cambio registrato (vale da sempre): una riga con la scelta di oggi da quel giorno
    v_val := CASE p_campo
      WHEN 'solo_notti' THEN COALESCE(v_c.solo_notti, false)::text
      WHEN 'solo_diurni' THEN COALESCE(v_c.solo_diurni, false)::text
      WHEN 'turni_solo_a_mano' THEN COALESCE(v_c.turni_solo_a_mano, false)::text
      WHEN 'giorni_lavoro' THEN replace(COALESCE(v_c.giorni_lavoro, ''), ' ', '')
      ELSE COALESCE(NULLIF(v_c.giorni_settimana, 0)::text, '') END;
    INSERT INTO collab_scelte_storico (collaboratore_id, collaboratore, campo, valore, valore_prima, valido_dal,
                                       operatore, origine)
    VALUES (p_collaboratore_id, v_c.nome, p_campo, v_val,
            CASE WHEN p_campo IN ('solo_notti', 'solo_diurni', 'turni_solo_a_mano')
                 THEN (NOT v_val::boolean)::text ELSE '' END,
            p_data, v_op, 'correzione');
    v_det := v_c.nome || ' ' || p_campo || ': dal ' || to_char(p_data, 'DD.MM.YYYY') || ' (prima da sempre)';
  ELSE
    IF v_prec IS NOT NULL AND p_data < v_prec THEN
      RAISE EXCEPTION 'La data e prima del cambio precedente della stessa scelta (%)', to_char(v_prec, 'DD.MM.YYYY');
    END IF;
    UPDATE collab_scelte_storico SET valido_dal = p_data, origine = 'correzione'
     WHERE collaboratore_id = p_collaboratore_id AND campo = p_campo AND valido_dal = v_ultimo;
    v_det := v_c.nome || ' ' || p_campo || ': dal ' || to_char(p_data, 'DD.MM.YYYY')
      || ' (prima dal ' || to_char(v_ultimo, 'DD.MM.YYYY') || ')';
  END IF;
  INSERT INTO log_attivita (operatore, azione, dettaglio, reparto_dip)
  VALUES (COALESCE(v_op, ''), 'Piano: scelta valida dal', v_det, v_c.reparto_dip);
  RETURN json_build_object('collaboratore_id', p_collaboratore_id, 'campo', p_campo, 'dal', p_data);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.scelte_storico_imposta_dal(text, bigint, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scelte_storico_imposta_dal(text, bigint, text, date) TO anon, authenticated, service_role;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260927_scelte_valida_dal')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
