-- ARROTONDAMENTO DEI GIORNI DI VACANZA AL GIORNO PIENO
--
-- Regola aziendale: nel pro-rata dell'anno di passaggio (28 -> 35) i decimali
-- dalla soglia in su diventano un giorno pieno, a favore del collaboratore:
-- 32.67 -> 33, 32.37 -> 33; sotto la soglia resta il giorno intero: 32.3 -> 32.
-- Soglia 0.35, modificabile dalla scheda Regole (0.33 farebbe salire anche i
-- .33, che nei pro-rata mensili sono frequenti; vuoto = nessun arrotondamento).
--
-- Idempotente: si puo' rieseguire senza effetti.

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione, settori)
SELECT 'vacanze_arrotonda_da', '0.35', 'testo', 0, true,
  'Da questa frazione in su i giorni di vacanza si arrotondano al giorno pieno (32.37 -> 33); sotto restano interi (32.3 -> 32). Vuoto = nessun arrotondamento.', NULL
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'vacanze_arrotonda_da');
