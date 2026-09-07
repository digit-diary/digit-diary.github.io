-- TURNI CON ORARIO PROLUNGATO NEI GIORNI DI CHIUSURA TARDI
--
-- Alcuni turni finiscono piu' tardi quando il casino chiude alle 05:00 invece
-- che alle 04:00 (venerdi, sabato, vigilie di festivita', 31 dicembre).
-- Il caso noto e' Z0: finisce alle 19:45 nei giorni normali e alle 20:30 nei
-- giorni di chiusura tardi.
--
-- Invece di creare una seconda sigla, che l'operatore dovrebbe ricordarsi di
-- usare nel giorno giusto, il turno porta con se' l'orario alternativo: nel
-- piano resta una sola sigla e il programma calcola da solo le ore del giorno.
--
-- Idempotente: si puo' rieseguire senza effetti.

ALTER TABLE piano_turni ADD COLUMN IF NOT EXISTS ora_fine_tardi TIME;
ALTER TABLE piano_turni ADD COLUMN IF NOT EXISTS durata_ore_tardi NUMERIC(5,2);

COMMENT ON COLUMN piano_turni.ora_fine_tardi IS
  'Ora di fine nei giorni in cui il casino chiude tardi (venerdi, sabato, vigilie di festivita, 31 dicembre). Vuoto = il turno finisce sempre alla stessa ora.';
COMMENT ON COLUMN piano_turni.durata_ore_tardi IS
  'Durata in ore decimali nei giorni di chiusura tardi. Vuoto = si calcola dagli orari.';
