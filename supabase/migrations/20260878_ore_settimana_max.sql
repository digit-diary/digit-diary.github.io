-- ============================================================
-- ORE LAVORATE MASSIME NELLA SETTIMANA (lunedi-domenica)
-- Avviso quando un collaboratore supera 45.1 ore lavorate in una settimana:
-- solo turni e celle con orario (JG), da orologio SENZA il 10% notturno; un turno
-- che passa la mezzanotte conta nella settimana in cui inizia. Validatore, avviso
-- alla scrittura della cella, bozza automatica, scheda Avvisi del piano.
-- ============================================================
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'ore_settimana_max', '45.1', 'HARD', 0, true,
  'Ore lavorate massime nella settimana lunedi-domenica (da orologio, senza il 10% notturno; il turno conta nella settimana in cui inizia)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'ore_settimana_max');
