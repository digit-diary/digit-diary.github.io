-- ============================================================
-- Valutazioni: dati personali ufficiali della scheda HR
-- {valutato_id, settore, funzione, valutatore_id, valutatore_settore, valutatore_funzione}
-- Conservati dall'import Excel perche' la scheda e' un documento ufficiale
-- ============================================================

ALTER TABLE valutazioni ADD COLUMN IF NOT EXISTS dati_personali JSONB;
