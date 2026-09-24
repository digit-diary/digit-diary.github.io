-- Profili personalizzati (impostazione profili_custom): solo l amministratore puo salvarli,
-- come visibilita e profili_operatori.
CREATE OR REPLACE FUNCTION upsert_impostazione(p_token TEXT, p_chiave TEXT, p_valore TEXT)
RETURNS JSON AS $$
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
    'visibilita', 'profili_operatori', 'profili_custom', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'moduli_responsabili',
    'conservazione_anni', 'conservazione_giorni_grazia', 'backup_auto_giorni',
    'tipi_personalizzati', 'tipi_nascosti', 'tipi_ordine', 'tipi_rinominati', 'colori_override',
    'campi_label_override', 'campi_nascosti', 'campi_ordine', 'campi_rapporto_extra', 'campi_rapporto_reparti',
    'buono_valori', 'inventario_categorie_extra',
    'piano_cd_config', 'piano_pause_cfg', 'piano_funzioni', 'piano_ore_settimanali', 'piano_max_cambi_mese',
    'piano_giorni_weekend', 'piano_giorni_formazione', 'piano_corsi_lista', 'piano_corsi_orari', 'piano_competenze_gruppi'
  ) THEN
    IF NOT COALESCE(v_admin, false) THEN
      RAISE EXCEPTION 'Impostazione riservata all amministratore: %', p_chiave;
    END IF;
  END IF;
  INSERT INTO impostazioni (chiave, valore)
  VALUES (p_chiave, p_valore)
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
