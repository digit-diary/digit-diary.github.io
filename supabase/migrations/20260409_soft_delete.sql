-- Soft delete: cestino per moduli e registrazioni
ALTER TABLE moduli ADD COLUMN IF NOT EXISTS eliminato BOOLEAN DEFAULT FALSE;
ALTER TABLE moduli ADD COLUMN IF NOT EXISTS eliminato_da TEXT;
ALTER TABLE moduli ADD COLUMN IF NOT EXISTS eliminato_at TIMESTAMPTZ;

ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS eliminato BOOLEAN DEFAULT FALSE;
ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS eliminato_da TEXT;
ALTER TABLE registrazioni ADD COLUMN IF NOT EXISTS eliminato_at TIMESTAMPTZ;

-- Index per filtrare rapidamente
CREATE INDEX IF NOT EXISTS idx_moduli_eliminato ON moduli(eliminato);
CREATE INDEX IF NOT EXISTS idx_registrazioni_eliminato ON registrazioni(eliminato);
