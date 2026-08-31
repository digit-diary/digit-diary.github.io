-- 20260844_piano_orario_jg.sql
-- Codici con ORARIO personalizzato (es. JG "giornata garantita"): quando si
-- inserisce nel piano si chiede inizio e fine, le ore contano di conseguenza
-- (piano, saldi, timbrature). Il flag richiede_orario è configurabile nella
-- card Codici speciali.

ALTER TABLE piano ADD COLUMN IF NOT EXISTS ora_inizio TEXT;
ALTER TABLE piano ADD COLUMN IF NOT EXISTS ora_fine TEXT;
ALTER TABLE piano_codici ADD COLUMN IF NOT EXISTS richiede_orario BOOLEAN DEFAULT FALSE;
UPDATE piano_codici SET richiede_orario = true WHERE codice = 'JG';
