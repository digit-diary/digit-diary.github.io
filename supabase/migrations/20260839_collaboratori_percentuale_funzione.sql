-- ============================================================
-- Anagrafica per il Piano di lavoro (ereditata da Turnivo):
-- percentuale d'impiego (1.0 = 100%) e funzione (RESP/SUP/BO/HOST)
-- Sbloccano: saldo ore, scaling codici CCL, regole SUP del solver
-- ============================================================

ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS percentuale NUMERIC DEFAULT 1.0;
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS funzione TEXT;
