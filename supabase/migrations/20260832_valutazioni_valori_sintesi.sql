-- ============================================================
-- Valutazioni: colonna D "Valore" (ponderazione ufficiale per area)
-- e riga "Sintesi" della scheda HR — servono per riprodurre il PDF
-- identico al documento originale (Totale = Punteggio x Valore / 100,
-- Conseguito = somma Totale / somma Punteggio)
-- ============================================================

ALTER TABLE valutazioni ADD COLUMN IF NOT EXISTS aree_valori JSONB;
ALTER TABLE valutazioni ADD COLUMN IF NOT EXISTS sintesi TEXT;
