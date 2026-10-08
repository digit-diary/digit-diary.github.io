-- ============================================================
-- VACANZE, WD E TOLLERANZA ORE (v418, decisioni del titolare 08/10/2026)
-- * Jolly: una C prima e UNA C dopo la vacanza (prima: 2 prima e dopo secondo la
--   percentuale come i fissi). Nuova regola c_dopo_jolly; c_prima_jolly portata a 1
--   solo se era ancora il valore predefinito 2 (un valore scelto a mano resta).
-- * Giorni di lavoro obbligatori (WD) anche DOPO le C del rientro: wd_dopo_vacanza = 1.
-- * Fissi: margine ore del mese +/-20 (tolleranza_ore da 15 a 20, solo se era 15).
-- Le regole restano modificabili nella scheda Regole. Si puo rilanciare.
-- ============================================================
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'c_dopo_jolly', '1', 'SOFT', 0, true, 'Ausiliari: giorni di congedo C dopo la vacanza'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'c_dopo_jolly');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'wd_dopo_vacanza', '1', 'SOFT', 0, true, 'Giorni di lavoro (WD) dopo i congedi del rientro dalla vacanza'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'wd_dopo_vacanza');
UPDATE piano_regole SET valore = '1' WHERE nome = 'c_prima_jolly' AND valore = '2';
UPDATE piano_regole SET valore = '20' WHERE nome = 'tolleranza_ore' AND valore = '15';
