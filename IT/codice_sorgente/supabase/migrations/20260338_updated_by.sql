-- Aggiunge tracciamento "chi ha modificato" su maison_budget
ALTER TABLE maison_budget ADD COLUMN IF NOT EXISTS aggiornato_da TEXT DEFAULT NULL;
ALTER TABLE maison_budget ADD COLUMN IF NOT EXISTS aggiornato_at TIMESTAMPTZ DEFAULT NULL;
