CREATE TABLE IF NOT EXISTS rapporti_giornalieri (
  id              BIGSERIAL PRIMARY KEY,
  data_rapporto   DATE NOT NULL,
  turno           TEXT NOT NULL CHECK (turno IN ('PRESTO', 'NOTTE')),
  sup_note        TEXT DEFAULT '',
  cassa_note      TEXT DEFAULT '',
  sala_note       TEXT DEFAULT '',
  n_assegni       INTEGER DEFAULT 0,
  prelievi        INTEGER DEFAULT 0,
  assenze         TEXT DEFAULT '',
  operatore       TEXT DEFAULT '',
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (data_rapporto, turno)
);
ALTER TABLE rapporti_giornalieri ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_rg" ON rapporti_giornalieri FOR SELECT USING (true);
CREATE POLICY "anon_insert_rg" ON rapporti_giornalieri FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_rg" ON rapporti_giornalieri FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_rg" ON rapporti_giornalieri FOR DELETE USING (true);
CREATE INDEX idx_rapporti_data ON rapporti_giornalieri (data_rapporto DESC);

CREATE TABLE IF NOT EXISTS note_fissate (
  registrazione_id BIGINT PRIMARY KEY REFERENCES registrazioni(id) ON DELETE CASCADE,
  fissata_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE note_fissate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_nf" ON note_fissate FOR SELECT USING (true);
CREATE POLICY "anon_insert_nf" ON note_fissate FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_delete_nf" ON note_fissate FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS scadenze (
  id               BIGSERIAL PRIMARY KEY,
  registrazione_id BIGINT REFERENCES registrazioni(id) ON DELETE SET NULL,
  titolo           TEXT NOT NULL,
  descrizione      TEXT DEFAULT '',
  data_scadenza    DATE NOT NULL,
  completata       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE scadenze ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_sc" ON scadenze FOR SELECT USING (true);
CREATE POLICY "anon_insert_sc" ON scadenze FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_sc" ON scadenze FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_sc" ON scadenze FOR DELETE USING (true);
CREATE INDEX idx_scadenze_data ON scadenze (data_scadenza);

ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS operatore TEXT DEFAULT '';
