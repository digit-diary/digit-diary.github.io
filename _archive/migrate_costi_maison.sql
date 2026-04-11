-- ============================================================
-- MIGRAZIONE: Costi Maison - Diario Collaboratori
-- Eseguire su Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Tabella costi maison (una riga per cliente per giorno, nomi già splittati)
CREATE TABLE IF NOT EXISTS costi_maison (
  id BIGSERIAL PRIMARY KEY,
  data_giornata DATE NOT NULL,
  nome TEXT NOT NULL,
  px INTEGER DEFAULT 1,
  costo DECIMAL(10,2) DEFAULT 0,
  tipo_buono TEXT CHECK (tipo_buono IN ('BU', 'BL') OR tipo_buono IS NULL),
  note TEXT DEFAULT '',
  gruppo TEXT DEFAULT '',
  operatore TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE costi_maison ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_cm" ON costi_maison FOR SELECT USING (true);
CREATE POLICY "anon_insert_cm" ON costi_maison FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_cm" ON costi_maison FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_cm" ON costi_maison FOR DELETE USING (true);
CREATE INDEX idx_costi_maison_data ON costi_maison (data_giornata DESC);
CREATE INDEX idx_costi_maison_nome ON costi_maison (nome);

-- 2. Tabella budget (opzionale, per cliente)
CREATE TABLE IF NOT EXISTS maison_budget (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  budget_chf DECIMAL(10,2),
  budget_bu INTEGER,
  budget_bl INTEGER,
  periodo TEXT DEFAULT 'mensile' CHECK (periodo IN ('mensile', 'annuale')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE maison_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_mb" ON maison_budget FOR SELECT USING (true);
CREATE POLICY "anon_insert_mb" ON maison_budget FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_mb" ON maison_budget FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_mb" ON maison_budget FOR DELETE USING (true);

-- ============================================================
-- FINE MIGRAZIONE
-- ============================================================
