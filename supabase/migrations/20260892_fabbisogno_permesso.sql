-- v359 · FABBISOGNO: visibile a tutti, modificabile solo con il permesso
-- piano_fabbisogno (celle, incolla, copia dal mese prima, import, svuota). Vale per
-- ogni scrittura (inserimento, modifica, cancellazione) di piano_fabbisogni.
-- Richiede la 20260891 (_permesso_piano_auto). Corpo identico a quello in
-- produzione (20260887) piu le righe segnate v359; la voce nuova prende il valore
-- di piano_azioni_auto (Responsabile e Sostituto).

CREATE OR REPLACE FUNCTION public._controlla_permessi_scrittura(p_token text, p_table text, p_azione text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_admin BOOLEAN := COALESCE((SELECT is_admin FROM operator_sessions WHERE token = p_token), false);
BEGIN
  IF v_admin THEN RETURN; END IF;
  -- v359: il fabbisogno lo vedono tutti, lo scrive solo chi ha il permesso
  -- (voce nuova se c e, altrimenti quella di prima: _permesso_piano_auto)
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
    ELSIF p_azione = 'insert' AND (p_data ->> 'tipo') IN ('assunzione', 'cessazione', 'giubileo', 'congedo_np')
          AND NOT _hr_modifica(p_token) THEN
      -- gli altri eventi (formazione, livello, impiego, categoria...) sono il registro
      -- automatico di azioni gia permesse da altri permessi
      RAISE EXCEPTION 'Permesso mancante: Storico HR (modificare)';
    END IF;
  END IF;
  IF p_table = 'hr_allegati' THEN
    IF p_azione = 'delete' THEN
      RAISE EXCEPTION 'Allegati HR: si eliminano solo come amministratore';
    ELSIF NOT (_hr_modifica(p_token) OR _sessione_permesso(p_token, 'gestione_formazioni')) THEN
      RAISE EXCEPTION 'Permesso mancante: allegati HR';
    END IF;
  END IF;
  IF p_table = 'collaboratori' AND p_azione IN ('insert', 'update') AND p_data IS NOT NULL THEN
    -- in modifica basta che il campo ci sia (anche per cancellarlo); in un
    -- collaboratore nuovo conta solo se ha un valore
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
    -- funzione, percentuale, lingue e Jolly/Fisso di un collaboratore esistente
    -- (la percentuale cambia le ore dovute): chi gestisce l impiego o lo Storico HR
    IF p_azione = 'update' AND p_data ?| ARRAY['funzione', 'percentuale', 'lingue', 'impiego', 'is_jolly']
       AND NOT (_sessione_permesso(p_token, 'gestione_impiego') OR _hr_modifica(p_token)) THEN
      RAISE EXCEPTION 'Permesso mancante: impiego (funzione, percentuale, lingue, Jolly/Fisso)';
    END IF;
  END IF;
END;
$function$;

DO $$
DECLARE
  v_vis JSONB;
BEGIN
  SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  IF v_vis IS NULL OR v_vis ? 'piano_fabbisogno' THEN RETURN; END IF;
  UPDATE impostazioni SET valore = (v_vis || jsonb_build_object('piano_fabbisogno',
    COALESCE(v_vis -> 'piano_azioni_auto', '"admin"'::jsonb)))::text WHERE chiave = 'visibilita';
END $$;

NOTIFY pgrst, 'reload schema';
