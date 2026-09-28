-- AI CONFIGURABILE (v294): piu fornitori compatibili (Groq, Ollama/Llama sul server
-- interno, LM Studio, altri), uno attivo e uno di riserva.
--
-- 1) Le chiavi dei fornitori stanno in una tabella propria, NON nelle impostazioni:
--    nessuna lettura diretta (RLS senza regole), solo tramite le funzioni qui sotto.
-- 2) CORREZIONE DI SICUREZZA: get_groq_key restituiva la chiave anche senza sessione
--    (chiunque conoscesse l indirizzo del database poteva leggerla). Ora serve una
--    sessione valida, come per tutto il resto.
-- 3) L elenco dei fornitori e il fornitore attivo sono impostazioni riservate
--    all amministratore.

CREATE TABLE IF NOT EXISTS ai_chiavi (
  fornitore TEXT PRIMARY KEY,
  chiave TEXT,
  aggiornato_at TIMESTAMPTZ DEFAULT now(),
  aggiornato_da TEXT
);
ALTER TABLE ai_chiavi ENABLE ROW LEVEL SECURITY;
-- nessuna policy: lettura e scrittura solo dalle funzioni SECURITY DEFINER

-- la chiave Groq gia salvata diventa la chiave del fornitore "groq"
INSERT INTO ai_chiavi (fornitore, chiave, aggiornato_da)
SELECT 'groq', valore, 'migrazione 20260875' FROM impostazioni
WHERE chiave = 'groq_api_key' AND COALESCE(valore, '') <> ''
ON CONFLICT (fornitore) DO NOTHING;

-- sessione valida: operatore o amministratore
CREATE OR REPLACE FUNCTION _sessione_valida(p_token TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(p_token, '') <> '' AND (
    _validate_op_session(p_token) IS NOT NULL OR _verify_admin_session(p_token)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- sessione di amministratore (password master o operatore con sessione admin)
CREATE OR REPLACE FUNCTION _sessione_admin(p_token TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(p_token, '') <> '' AND (
    _verify_admin_session(p_token)
    OR EXISTS (SELECT 1 FROM operator_sessions WHERE token = p_token AND is_admin AND expires_at > now())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_ai_key(p_token TEXT, p_fornitore TEXT)
RETURNS JSON AS $$
DECLARE
  k TEXT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT chiave INTO k FROM ai_chiavi WHERE fornitore = p_fornitore;
  -- dati importati da prima di questa migrazione: la chiave Groq era nelle impostazioni
  IF k IS NULL AND p_fornitore = 'groq' THEN
    SELECT valore INTO k FROM impostazioni WHERE chiave = 'groq_api_key';
  END IF;
  RETURN json_build_object('key', k);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_ai_key(p_token TEXT, p_fornitore TEXT, p_chiave TEXT)
RETURNS JSON AS $$
BEGIN
  IF NOT _sessione_admin(p_token) THEN
    RAISE EXCEPTION 'Riservato all amministratore';
  END IF;
  IF p_fornitore !~ '^[a-z0-9_-]{1,40}$' THEN
    RAISE EXCEPTION 'Nome fornitore non valido';
  END IF;
  IF COALESCE(p_chiave, '') = '' THEN
    DELETE FROM ai_chiavi WHERE fornitore = p_fornitore;
  ELSE
    INSERT INTO ai_chiavi (fornitore, chiave, aggiornato_at, aggiornato_da)
    VALUES (p_fornitore, p_chiave, now(), COALESCE(_validate_op_session(p_token), 'Admin'))
    ON CONFLICT (fornitore) DO UPDATE
      SET chiave = EXCLUDED.chiave, aggiornato_at = now(), aggiornato_da = EXCLUDED.aggiornato_da;
  END IF;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- correzione: prima bastava chiamarla, senza nessuna sessione
CREATE OR REPLACE FUNCTION get_groq_key(p_token TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  k TEXT;
BEGIN
  IF NOT _sessione_valida(p_token) THEN
    RAISE EXCEPTION 'Sessione non valida';
  END IF;
  SELECT chiave INTO k FROM ai_chiavi WHERE fornitore = 'groq';
  IF k IS NULL THEN
    SELECT valore INTO k FROM impostazioni WHERE chiave = 'groq_api_key';
  END IF;
  RETURN json_build_object('key', k);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- impostazioni: elenco e scelta dei fornitori riservati all amministratore
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
    'ai_fornitori', 'ai_fornitore_attivo', 'ai_fornitore_riserva',
    'visibilita', 'profili_operatori', 'profili_custom', 'operatori_reparto', 'operatori_accessi_extra', 'operatori_lista',
    'reparti_config', 'reparti_pagine', 'competenze_config', 'punti_config', 'formazione_livelli_nomi', 'equita_mesi',
    'soglie_alert', 'soglie_disciplinari', 'giubileo_config', 'giubileo_preavviso', 'valutatori_config', 'moduli_responsabili',
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
