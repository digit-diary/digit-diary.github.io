-- ============================================================
-- ATTIVAZIONE RLS SU TUTTE LE TABELLE SENSIBILI
-- Blocca accesso diretto via REST con chiave anon.
-- Tutte le letture/scritture passano da secure_read/insert/update/delete (SECURITY DEFINER).
-- ============================================================

-- registrazioni
ALTER TABLE registrazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_select ON registrazioni;
DROP POLICY IF EXISTS anon_insert ON registrazioni;
DROP POLICY IF EXISTS anon_update ON registrazioni;
DROP POLICY IF EXISTS anon_delete ON registrazioni;
DROP POLICY IF EXISTS "deny_all_anon" ON registrazioni;
CREATE POLICY "deny_all_anon" ON registrazioni FOR ALL TO anon USING (false) WITH CHECK (false);

-- moduli
ALTER TABLE moduli ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON moduli;
CREATE POLICY "deny_all_anon" ON moduli FOR ALL TO anon USING (false) WITH CHECK (false);

-- log_attivita
ALTER TABLE log_attivita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON log_attivita;
CREATE POLICY "deny_all_anon" ON log_attivita FOR ALL TO anon USING (false) WITH CHECK (false);

-- costi_maison
ALTER TABLE costi_maison ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON costi_maison;
CREATE POLICY "deny_all_anon" ON costi_maison FOR ALL TO anon USING (false) WITH CHECK (false);

-- maison_budget
ALTER TABLE maison_budget ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON maison_budget;
CREATE POLICY "deny_all_anon" ON maison_budget FOR ALL TO anon USING (false) WITH CHECK (false);

-- promemoria
ALTER TABLE promemoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON promemoria;
CREATE POLICY "deny_all_anon" ON promemoria FOR ALL TO anon USING (false) WITH CHECK (false);

-- consegne_turno
ALTER TABLE consegne_turno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON consegne_turno;
CREATE POLICY "deny_all_anon" ON consegne_turno FOR ALL TO anon USING (false) WITH CHECK (false);

-- spese_extra
ALTER TABLE spese_extra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON spese_extra;
CREATE POLICY "deny_all_anon" ON spese_extra FOR ALL TO anon USING (false) WITH CHECK (false);

-- regali_maison
ALTER TABLE regali_maison ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON regali_maison;
CREATE POLICY "deny_all_anon" ON regali_maison FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_clienti
ALTER TABLE note_clienti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON note_clienti;
CREATE POLICY "deny_all_anon" ON note_clienti FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_fissate
ALTER TABLE note_fissate ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON note_fissate;
CREATE POLICY "deny_all_anon" ON note_fissate FOR ALL TO anon USING (false) WITH CHECK (false);

-- scadenze
ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON scadenze;
CREATE POLICY "deny_all_anon" ON scadenze FOR ALL TO anon USING (false) WITH CHECK (false);

-- collaboratori
ALTER TABLE collaboratori ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON collaboratori;
CREATE POLICY "deny_all_anon" ON collaboratori FOR ALL TO anon USING (false) WITH CHECK (false);

-- rapporti_giornalieri
ALTER TABLE rapporti_giornalieri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_anon" ON rapporti_giornalieri;
CREATE POLICY "deny_all_anon" ON rapporti_giornalieri FOR ALL TO anon USING (false) WITH CHECK (false);

-- note_colleghi (aggiorna policy esistenti)
DROP POLICY IF EXISTS "note_insert_only" ON note_colleghi;
DROP POLICY IF EXISTS "note_update_own" ON note_colleghi;
DROP POLICY IF EXISTS "note_delete_own" ON note_colleghi;
DROP POLICY IF EXISTS "note_select_via_rpc" ON note_colleghi;
DROP POLICY IF EXISTS "deny_all_anon" ON note_colleghi;
CREATE POLICY "deny_all_anon" ON note_colleghi FOR ALL TO anon USING (false) WITH CHECK (false);

-- impostazioni (mantieni accesso lettura per chiavi non sensibili, blocca resto)
-- NOTA: impostazioni ha gia RLS da migrate_security_v2.sql, aggiorniamo
DROP POLICY IF EXISTS "imp_read_safe" ON impostazioni;
DROP POLICY IF EXISTS "imp_write" ON impostazioni;
DROP POLICY IF EXISTS "deny_all_anon" ON impostazioni;
ALTER TABLE impostazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_anon" ON impostazioni FOR ALL TO anon USING (false) WITH CHECK (false);
