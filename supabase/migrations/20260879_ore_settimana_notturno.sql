-- ============================================================
-- ORE SETTIMANALI: CON O SENZA IL 10% NOTTURNO
-- Il massimo della settimana (ore_settimana_max, 45.1) si confronta con il totale
-- CON il supplemento del 10% sulle ore notturne (TRUE, indicazione del titolare
-- del 30.09) oppure con le sole ore da orologio (FALSE). Le tre cifre (da orologio,
-- 10% notturno, totale) si mostrano sempre.
-- ============================================================
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'ore_settimana_con_notturno', 'TRUE', 'HARD', 0, true,
  'Il massimo di ore della settimana si confronta con il totale compreso il 10% notturno (TRUE) o con le sole ore da orologio (FALSE)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'ore_settimana_con_notturno');
