-- Fix: aggiorna constraint unico per includere reparto_dip
-- Il vecchio constraint era (data_rapporto, turno), serve (data_rapporto, turno, reparto_dip)

-- Prima rimuovi il vecchio constraint
DO $$ BEGIN
  -- Trova e rimuovi tutti i constraint UNIQUE su rapporti_giornalieri
  PERFORM 1 FROM pg_constraint
  WHERE conrelid = 'rapporti_giornalieri'::regclass AND contype = 'u';
  IF FOUND THEN
    EXECUTE (
      SELECT string_agg('ALTER TABLE rapporti_giornalieri DROP CONSTRAINT IF EXISTS ' || quote_ident(conname), '; ')
      FROM pg_constraint WHERE conrelid = 'rapporti_giornalieri'::regclass AND contype = 'u'
    );
  END IF;
END $$;

-- Aggiungi il nuovo constraint con reparto_dip (default 'slots' per righe vecchie)
UPDATE rapporti_giornalieri SET reparto_dip = 'slots' WHERE reparto_dip IS NULL;
ALTER TABLE rapporti_giornalieri ADD CONSTRAINT rapporti_giornalieri_unique
  UNIQUE (data_rapporto, turno, reparto_dip);
