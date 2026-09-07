-- VACANZE DEGLI AUSILIARI (JOLLY): ZERO ORE
--
-- Per il personale ausiliario l'indennita' di vacanza e' gia' compresa e pagata
-- nel salario orario dei giorni lavorati (RAP Allegato 1: 8.33% con quattro
-- settimane, 10.65% con cinque). Un giorno "V" nel piano di un jolly e' quindi
-- solo un segnaposto di assenza, non una giornata pagata a parte: valorizzarlo
-- in ore farebbe risultare la vacanza due volte.
--
-- L'elenco dei codici trattati cosi' resta modificabile dalla scheda Regole,
-- senza toccare il programma.
--
-- Idempotente: si puo' rieseguire senza effetti.

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione, settori)
SELECT 'jolly_codici_gia_pagati', 'V,V1', 'testo', 0, true,
       'Codici che per gli ausiliari (jolly) valgono zero ore: l''indennita'' e'' gia'' compresa e pagata nel salario orario dei giorni lavorati (RAP Allegato 1). Elenco separato da virgole.',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'jolly_codici_gia_pagati');

-- Scaglione dei 25 anni: 4 giorni in piu', non 5
UPDATE piano_regole SET valore = '4' WHERE nome = 'vacanze_bonus_25anni' AND valore = '5';
