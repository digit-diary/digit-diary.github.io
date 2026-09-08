-- AUSILIARI E GENERAZIONE DEL PIANO
--
-- Un jolly non ha ore dovute da contratto, quindi nel saldo il suo obiettivo e'
-- zero. Nella GENERAZIONE del piano pero' serve un bersaglio, altrimenti il
-- programma non sa quanti turni proporgli: di norma un ausiliario fa circa l'80%
-- di un tempo pieno. Questa regola dice quella percentuale, e vale solo li'.
-- Le ore dovute restano zero e le assenze continuano a contare per intero.
-- Lasciando il valore vuoto si torna al vecchio range assoluto
-- jolly_ore_min / jolly_ore_max.
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'jolly_percentuale_piano', '0.8', 'SOFT', 0, true,
       'Ausiliari: percentuale di riferimento usata SOLO per generare il piano (0.8 = 80%). Vuoto = usa jolly_ore_min/max'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'jolly_percentuale_piano');
