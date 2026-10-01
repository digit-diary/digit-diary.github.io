-- v338 · Giorni di vacanza in piu per anzianita: UNA VOLTA SOLA, nell anno in cui
-- cade l anniversario (10, 15, 20, 25 anni); l anno dopo si torna a 35.
-- Regola confermata dal titolare il 01.10.2026. Cambiano solo le descrizioni:
-- i valori (+1, +2, +3, +4) restano.
UPDATE piano_regole SET descrizione = 'Giorni in piu nell anno dei 10 anni di servizio (una volta sola)' WHERE nome = 'vacanze_bonus_10anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu nell anno dei 15 anni di servizio (una volta sola)' WHERE nome = 'vacanze_bonus_15anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu nell anno dei 20 anni di servizio (una volta sola)' WHERE nome = 'vacanze_bonus_20anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu nell anno dei 25 anni di servizio (una volta sola)' WHERE nome = 'vacanze_bonus_25anni';
