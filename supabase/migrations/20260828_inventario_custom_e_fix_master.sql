-- ============================================================
-- 1) Inventario: categorie personalizzabili (rimuove il vincolo
--    che limitava a 'buono'/'sigaretta' — la lista è ora gestita
--    da admin in impostazioni.inventario_categorie_extra)
-- 2) Fix sicurezza: setup_master_pwd non deve permettere il reset
--    della password master quando esiste già l'hash v2
--    (il vecchio controllo guardava solo il v1, azzerato dopo l'upgrade)
-- ============================================================

ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_categoria_check;

CREATE OR REPLACE FUNCTION setup_master_pwd(p_default_hash TEXT, p_new_hash TEXT, p_new_recovery TEXT, p_new_hash_v2 TEXT DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  stored TEXT;
  stored_v2 TEXT;
BEGIN
  SELECT valore INTO stored FROM impostazioni WHERE chiave = 'password_hash';
  SELECT valore INTO stored_v2 FROM impostazioni WHERE chiave = 'password_hash_v2';
  -- Blocca se esiste una password (v1 diversa dal default OPPURE v2 impostata)
  IF (stored IS NOT NULL AND stored != p_default_hash) OR (stored_v2 IS NOT NULL AND stored_v2 != '') THEN
    RETURN json_build_object('success', false);
  END IF;
  IF p_new_hash_v2 IS NOT NULL THEN
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash_v2', p_new_hash_v2)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash_v2;
    UPDATE impostazioni SET valore = NULL WHERE chiave = 'password_hash';
  ELSE
    INSERT INTO impostazioni (chiave, valore) VALUES ('password_hash', p_new_hash)
      ON CONFLICT (chiave) DO UPDATE SET valore = p_new_hash;
  END IF;
  INSERT INTO impostazioni (chiave, valore) VALUES ('recovery_code', p_new_recovery)
    ON CONFLICT (chiave) DO UPDATE SET valore = p_new_recovery;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
