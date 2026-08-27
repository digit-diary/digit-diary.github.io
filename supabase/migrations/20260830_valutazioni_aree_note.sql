-- ============================================================
-- Valutazioni: note per area (colonna I della scheda Excel HR)
-- {chiave_area: "commento del valutatore"}
-- ============================================================

ALTER TABLE valutazioni ADD COLUMN IF NOT EXISTS aree_note JSONB;
