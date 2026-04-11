-- ============================================
-- Diario Collaboratori – Schema Supabase
-- ============================================
-- Esegui questo SQL nell'SQL Editor di Supabase
-- (Dashboard → SQL Editor → New Query → Run)

-- 1. Crea la tabella
CREATE TABLE registrazioni (
  id         BIGINT PRIMARY KEY,
  nome       TEXT NOT NULL,
  tipo       TEXT NOT NULL,
  testo      TEXT NOT NULL,
  data       TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Abilita Row Level Security
ALTER TABLE registrazioni ENABLE ROW LEVEL SECURITY;

-- 3. Policy: chiunque con la anon key può leggere
CREATE POLICY "anon_select" ON registrazioni
  FOR SELECT
  USING (true);

-- 4. Policy: chiunque con la anon key può inserire
CREATE POLICY "anon_insert" ON registrazioni
  FOR INSERT
  WITH CHECK (true);

-- 5. Policy: chiunque con la anon key può aggiornare (cambio tipo)
CREATE POLICY "anon_update" ON registrazioni
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 6. Policy: chiunque con la anon key può eliminare
CREATE POLICY "anon_delete" ON registrazioni
  FOR DELETE
  USING (true);

-- 7. Indici utili per i filtri
CREATE INDEX idx_registrazioni_nome ON registrazioni (nome);
CREATE INDEX idx_registrazioni_tipo ON registrazioni (tipo);
CREATE INDEX idx_registrazioni_data ON registrazioni (data DESC);
