-- VACANZE CON SIGLA (v297): nel file delle vacanze accanto alla X si possono
-- scrivere le sigle del Piano (PC = Protezione Civile, MT = Matrimonio, ...).
-- codice vuoto o 'V' = vacanza (conta nei giorni di vacanza); altra sigla =
-- altra assenza della settimana (non conta come vacanza, va nel piano con la sua sigla).
ALTER TABLE piano_vacanze ADD COLUMN IF NOT EXISTS codice TEXT;
