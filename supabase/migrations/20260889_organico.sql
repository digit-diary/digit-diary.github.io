-- v350 · ANALISI DELL ORGANICO (scheda Piano > Organico)
-- L interruttore piano_organico_attivo lo cambia solo l amministratore; la scheda
-- la vede chi ha il permesso ptab_organico: all inizio Direzione, Responsabile,
-- Sostituto e HR (dai profili assegnati), modificabile in Visibilita e permessi.
-- upsert_impostazione: corpo identico a quello in produzione (v349) piu la chiave.

CREATE OR REPLACE FUNCTION public.upsert_impostazione(p_token text, p_chiave text, p_valore text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_op TEXT;
  v_admin BOOLEAN;
BEGIN
  v_op := _validate_op_session(p_token);
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT is_admin INTO v_admin FROM operator_sessions WHERE token = p_token;
  IF p_chiave IN (
    'password_hash', 'password_hash_v2', 'recovery_code', 'groq_api_key', 'groq_modelli',
    'ai_fornitori', 'ai_fornitore_attivo', 'ai_fornitore_riserva', 'reparti_nomi_documenti',
    'visibilita', 'profili_operatori', 'profili_custom', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'valutatori_config', 'moduli_responsabili',
    'conservazione_anni', 'conservazione_giorni_grazia', 'backup_auto_giorni',
    'tipi_personalizzati', 'tipi_nascosti', 'tipi_ordine', 'tipi_rinominati', 'colori_override',
    'campi_label_override', 'campi_nascosti', 'campi_ordine', 'campi_rapporto_extra', 'campi_rapporto_reparti',
    'buono_valori', 'inventario_categorie_extra',
    'piano_cd_config', 'piano_pause_cfg', 'piano_funzioni', 'piano_ore_settimanali', 'piano_max_cambi_mese',
    'piano_giorni_weekend', 'piano_giorni_formazione', 'piano_corsi_lista', 'piano_competenze_gruppi',
    'piano_solver_url', 'maison_auto_delete_giorni', 'piano_organico_attivo'
  ) THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  -- orari dei corsi: chi gestisce il piano o i corsi
  IF p_chiave = 'piano_corsi_orari' AND NOT (COALESCE(v_admin, false)
       OR _sessione_permesso(p_token, 'gestione_piano') OR _sessione_permesso(p_token, 'gestione_corsi')) THEN
    RAISE EXCEPTION 'Permesso mancante: corsi';
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$function$;

DO $$
DECLARE
  v_vis JSONB;
  v_prof JSONB;
  v_lista JSONB;
BEGIN
  SELECT valore::jsonb INTO v_vis FROM impostazioni WHERE chiave = 'visibilita';
  SELECT valore::jsonb INTO v_prof FROM impostazioni WHERE chiave = 'profili_operatori';
  IF v_vis IS NULL OR v_prof IS NULL OR v_vis ? 'ptab_organico' THEN RETURN; END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) INTO v_lista FROM jsonb_each_text(v_prof) WHERE value IN ('direzione', 'resp', 'sost', 'hr');
  UPDATE impostazioni SET valore = (v_vis || jsonb_build_object('ptab_organico', jsonb_build_object('tipo', 'selezionati', 'operatori', v_lista)))::text
   WHERE chiave = 'visibilita';
END $$;

NOTIFY pgrst, 'reload schema';
