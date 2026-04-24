-- Aggiunge campo modificato_da alla tabella moduli
ALTER TABLE moduli ADD COLUMN IF NOT EXISTS modificato_da TEXT DEFAULT NULL;
