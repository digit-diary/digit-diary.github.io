-- ============================================================
-- TURNI PER FUNZIONE (mappature) PER SETTORE
-- Le mappature funzione -> turno erano uniche per tutto il programma e
-- citavano solo sigle degli Slots: un Supervisor dei Tavoli non risultava
-- idoneo a nessun turno dei Tavoli. Ogni settore ha ora le sue mappature
-- (le esistenti restano agli Slots).
-- ============================================================
ALTER TABLE piano_mappature ADD COLUMN IF NOT EXISTS reparto_dip TEXT NOT NULL DEFAULT 'slots';
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'piano_mappature'::regclass AND contype = 'u' LOOP
    EXECUTE 'ALTER TABLE piano_mappature DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS piano_mappature_unica ON piano_mappature (reparto_dip, funzione, turno_codice);
