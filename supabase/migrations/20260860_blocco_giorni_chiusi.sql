-- BLOCCO DEI GIORNI CHIUSI
--
-- Passata la giornata di gioco (piu' il margine fino all'ora limite del giorno
-- dopo), il piano di quel giorno diventa un documento: non si modifica piu' per
-- distrazione. Chi ha il permesso dedicato "sblocco_piano_chiuso" puo' aprire
-- il giorno per dieci minuti scrivendo il motivo, che finisce nel registro.
--
-- Due regole configurabili:
--   blocco_giorni_chiusi  TRUE/FALSE  interruttore generale
--   blocco_ora_limite     12          ora del giorno dopo oltre la quale
--                                     il giorno precedente e' chiuso
--
-- Idempotente: si puo' rieseguire senza effetti.

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione, settori)
SELECT 'blocco_giorni_chiusi', 'TRUE', 'testo', 0, true,
  'Blocca la modifica dei giorni passati del piano dopo la chiusura della giornata di gioco. FALSE = blocco spento.', NULL
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'blocco_giorni_chiusi');

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione, settori)
SELECT 'blocco_ora_limite', '12', 'testo', 0, true,
  'Ora del giorno DOPO oltre la quale il giorno precedente e chiuso (12 = fino a mezzogiorno si sistema la giornata appena finita senza sblocco).', NULL
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'blocco_ora_limite');
