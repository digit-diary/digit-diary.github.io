-- ============================================================
-- RIPOSO SETTIMANALE ATTORNO ALLA DOMENICA
-- Ore consecutive dalla fine dell ultimo turno prima del riposo all inizio del
-- turno successivo:
--  - domenica libera: almeno 35 ore (11 + 24) che comprendano l intervallo dalle
--    23 del sabato alle 23 della domenica (LL art. 18-20a, OLL 1 art. 21);
--  - domenica lavorata: nella settimana almeno 47 ore consecutive (36 di riposo
--    settimanale + 11 di riposo giornaliero), case da gioco (OLL 2 art. 12 cpv. 2).
-- Domenica lavorata: le 47 ore si cercano nella settimana PRIMA (lunedi-sabato)
-- oppure in quella DOPO (lunedi-sabato), come confermato dal titolare il 30.09.
-- ============================================================
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'riposo_domenica_libera_ore', '35', 'HARD', 0, true,
  'Domenica libera: ore consecutive minime di riposo, comprese le 23 del sabato - 23 della domenica (LL art. 18-20a, OLL 1 art. 21)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'riposo_domenica_libera_ore');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'riposo_domenica_lavorata_ore', '47', 'HARD', 0, true,
  'Domenica lavorata: ore consecutive minime di riposo nella settimana prima oppure in quella dopo (lunedi-sabato), 36 + 11 (OLL 2 art. 12 cpv. 2, case da gioco)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'riposo_domenica_lavorata_ore');
