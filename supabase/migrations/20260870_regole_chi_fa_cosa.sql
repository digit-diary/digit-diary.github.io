-- ============================================================
-- REGOLE "CHI FA COSA" PER SETTORE
-- Le tre regole fisse degli Slots (L1/9 solo BO e SUP; SUP solo turni Z da
-- lunedi a giovedi; SUP turni Z e S venerdi e sabato) erano scritte nel
-- programma con le sigle dentro: impossibili da adattare ai Tavoli, al Valet
-- o a sigle nuove. Diventano regole di gruppo con due tipi nuovi, create e
-- modificate dalla scheda Regole di gruppo di ogni settore:
--   turni_solo_funzioni   'L1,9:BO,SUP,RESP'
--   funzione_turni_giorni 'SUP:Z*,L1,9:0,1,2,3'  (giorni: 0=lun ... 6=dom)
-- Le regole fisse vengono tolte da piano_regole.
-- ============================================================
INSERT INTO piano_regole_gruppo (gruppo, tipo_regola, valore, attivo, reparto_dip)
SELECT '*', 'turni_solo_funzioni', 'L1,9:BO,SUP,RESP', true, 'slots'
WHERE EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'l1_solo_bo_sup' AND upper(valore) = 'TRUE' AND attivo)
  AND NOT EXISTS (SELECT 1 FROM piano_regole_gruppo WHERE tipo_regola = 'turni_solo_funzioni' AND reparto_dip = 'slots');
INSERT INTO piano_regole_gruppo (gruppo, tipo_regola, valore, attivo, reparto_dip)
SELECT '*', 'funzione_turni_giorni', 'SUP:Z*,L1,9:0,1,2,3', true, 'slots'
WHERE EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'sup_solo_z_settimana' AND upper(valore) = 'TRUE' AND attivo)
  AND NOT EXISTS (SELECT 1 FROM piano_regole_gruppo WHERE tipo_regola = 'funzione_turni_giorni' AND reparto_dip = 'slots' AND valore LIKE 'SUP:%:0,1,2,3');
INSERT INTO piano_regole_gruppo (gruppo, tipo_regola, valore, attivo, reparto_dip)
SELECT '*', 'funzione_turni_giorni', 'SUP:Z*,S*,L1,9:4,5', true, 'slots'
WHERE EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'sup_ven_sab_z_e_s' AND upper(valore) = 'TRUE' AND attivo)
  AND NOT EXISTS (SELECT 1 FROM piano_regole_gruppo WHERE tipo_regola = 'funzione_turni_giorni' AND reparto_dip = 'slots' AND valore LIKE 'SUP:%:4,5');
DELETE FROM piano_regole WHERE nome IN ('l1_solo_bo_sup', 'sup_solo_z_settimana', 'sup_ven_sab_z_e_s');
