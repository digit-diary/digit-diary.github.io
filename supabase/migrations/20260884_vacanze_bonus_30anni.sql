-- v339 · Giorni di vacanza in piu per anzianita: nuovo scaglione dei 30 anni,
-- +5 giorni UNA VOLTA SOLA nell anno dell anniversario (decisione del titolare
-- 01.10.2026), come 10 anni +1, 15 +2, 20 +3, 25 +4.
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'vacanze_bonus_30anni', '5', 'HARD', 0, true,
  'Giorni in piu nell anno dei 30 anni di servizio (una volta sola)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'vacanze_bonus_30anni');
