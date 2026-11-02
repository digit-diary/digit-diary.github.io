-- 01/11/2026 · PROMEMORIA SENZA SETTORE -> SLOTS (decisione del titolare). I promemoria scritti
-- prima che il settore si salvasse non ne hanno uno e valevano per tutti i settori: erano tutti
-- delle Slots. Da ora ogni promemoria ha il suo settore e chi ha un settore legge solo i suoi
-- (20260932_b). Idempotente. Dopo 20260932_b_settore_letture_scritture.sql.

BEGIN;

UPDATE promemoria SET reparto_dip = 'slots' WHERE reparto_dip IS NULL OR btrim(reparto_dip) = '';

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260932_c_promemoria_senza_settore')
ON CONFLICT (nome) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
