-- ============================================================
-- FUNZIONI CHE FANNO TUTTO (a mano)
-- Come in Formazione il livello alto comprende quelli sotto: un Supervisor
-- puo' fare anche cassa, sala, accoglienza. La regola vale per la scrittura
-- manuale, il validatore, i cambi turno e le coperture; la bozza automatica
-- continua a seguire le regole del settore (es. SUP solo turni Z lun-gio).
-- ============================================================
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'funzioni_fanno_tutto', 'SUP,RESP', 'HARD', 0, true,
  'Funzioni che a mano possono fare qualsiasi turno (il livello alto comprende quelli sotto, come in Formazione); la bozza automatica segue le regole del settore'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'funzioni_fanno_tutto');
