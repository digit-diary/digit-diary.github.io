-- ============================================================
-- VACANZE: giorni precisi (dal / al) e nota (05/10/2026, richiesta del titolare)
-- Nel file vacanze le assenze che non durano una settimana intera (PC, MI, MT...)
-- hanno le date in un commento della cella ("27-28 APRILE PC", "PROTEZIONE CIVILE
-- 31.03-13.04", "24-27.06 CONGEDO MATRIMONIO"), e le note dicono cambi e conferme.
-- dal / al: se presenti, nel piano vanno solo i giorni della settimana fra dal e al
-- (vuoti = tutta la settimana). Si leggono dal commento all import e si correggono
-- dalla scheda Vacanze (Modifica). nota: il commento della cella.
-- ============================================================
ALTER TABLE piano_vacanze ADD COLUMN IF NOT EXISTS dal DATE;
ALTER TABLE piano_vacanze ADD COLUMN IF NOT EXISTS al DATE;
ALTER TABLE piano_vacanze ADD COLUMN IF NOT EXISTS nota TEXT;

NOTIFY pgrst, 'reload schema';
