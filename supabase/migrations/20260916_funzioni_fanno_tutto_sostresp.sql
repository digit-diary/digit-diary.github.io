-- ============================================================
-- FUNZIONI CHE FANNO TUTTO: SOSTRESP nella regola
-- Fino alla v452 SUP, SOSTRESP e RESP erano esenti dall'avviso "non formato"
-- anche per una lista scritta nel programma. Dalla v453 decide solo la regola
-- funzioni_fanno_tutto: per non cambiare il comportamento si aggiunge SOSTRESP
-- solo se la regola ha ancora il valore iniziale (mai modificato dal titolare).
-- ============================================================
UPDATE piano_regole SET valore = 'SUP,SOSTRESP,RESP'
WHERE nome = 'funzioni_fanno_tutto' AND replace(valore, ' ', '') = 'SUP,RESP';

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260916_funzioni_fanno_tutto_sostresp')
ON CONFLICT (nome) DO NOTHING;
