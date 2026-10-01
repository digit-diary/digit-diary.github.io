-- v341 · FINE RAPPORTO e congedi non pagati (decisioni del titolare 01.10.2026)
-- 1) collaboratori.data_fine_rapporto: ultimo giorno di lavoro. Dal giorno dopo
--    il collaboratore non e piu operativo nel Piano (calendario dei mesi dopo,
--    bozza, coperture, cambi, ore dovute); Diario, schede, storico, vacanze e
--    CGF restano consultabili. Togliendo la data torna operativo.
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS data_fine_rapporto DATE;
-- 2) ogni giorno di congedo non pagato riduce in proporzione anche il diritto
--    alle vacanze dell anno (come anzianita e giubilei): soglia 10 -> 0 giorni.
UPDATE piano_regole SET valore = '0',
  descrizione = 'Congedo non pagato: giorni oltre i quali il diritto vacanze si riduce (0 = ogni giorno di congedo lo riduce)'
WHERE nome = 'congedo_np_giorni_vacanze';
