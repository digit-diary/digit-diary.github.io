-- ============================================================
-- PREFERENZE DEL PIANO: solo notturni e giorni di lavoro (07/10/2026, richiesta del titolare)
-- solo_notti: come solo_diurni, ma solo turni notturni.
-- giorni_lavoro: giorni della settimana in cui il collaboratore lavora (numeri di
-- JavaScript: 0 domenica, 1 lunedi ... 6 sabato, separati da virgola; vuoto = tutti).
-- Negli altri giorni non viene mai proposto (bozza, Migliora, generazione automatica,
-- cerca cambio, copertura malattia, formazioni); scritto a mano riceve un avviso.
-- ============================================================
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS solo_notti BOOLEAN DEFAULT FALSE;
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS giorni_lavoro TEXT;

NOTIFY pgrst, 'reload schema';
