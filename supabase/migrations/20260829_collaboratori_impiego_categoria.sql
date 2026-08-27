-- ============================================================
-- Collaboratori: tipo di impiego (jolly / fisso 100%) e
-- categoria professionale (5ª = ingresso ... 1ª = massima),
-- valide sia per Slots che per Tavoli
-- ============================================================

ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS impiego TEXT;
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS categoria INTEGER;
