-- ORE REALI DEL MESE (rettifica manuale del saldo)
--
-- Finche' il programma non e' collegato alla timbratrice, le ore effettive di
-- un mese possono differire dal piano: chi finisce prima, chi resta oltre. Qui
-- si registra il totale REALE delle ore del mese, scritto a mano da chi
-- gestisce il piano. Dove esiste una riga, il saldo del mese, l'YTD e le
-- statistiche usano questo totale al posto delle ore pianificate.
--
-- Si tiene traccia di chi ha scritto e quando: fra sei mesi si deve poter
-- capire da dove viene un saldo corretto a mano. Quando arrivera' la
-- timbratrice il confronto restera' possibile, perche' le due fonti sono
-- separate (piano_timbrature per giorno, questa per mese).
--
-- Idempotente: si puo' rieseguire senza effetti.

CREATE TABLE IF NOT EXISTS piano_ore_mese (
  id           BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  anno_mese    TEXT NOT NULL,              -- 'YYYY-MM'
  ore_reali    NUMERIC(7,2) NOT NULL,
  nota         TEXT,
  operatore    TEXT,
  reparto_dip  TEXT,
  creato_il    TIMESTAMPTZ DEFAULT now(),
  modificato_il TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS piano_ore_mese_uniq
  ON piano_ore_mese (collaboratore, anno_mese);
CREATE INDEX IF NOT EXISTS piano_ore_mese_periodo ON piano_ore_mese (anno_mese);

COMMENT ON TABLE piano_ore_mese IS
  'Ore realmente lavorate nel mese, scritte a mano quando la timbratrice non e collegata. Dove c e una riga, saldo del mese e YTD usano questo totale invece delle ore pianificate.';
COMMENT ON COLUMN piano_ore_mese.ore_reali IS 'Totale ore effettive del mese, comprese le assenze retribuite come da busta paga';

ALTER TABLE piano_ore_mese ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON piano_ore_mese;
CREATE POLICY deny_all_anon ON piano_ore_mese FOR ALL TO anon USING (false) WITH CHECK (false);

-- Whitelist secure_*: si aggiunge la tabella nuova alle quattro funzioni senza
-- riscriverne la definizione, cosi' la migrazione resta corta e non rischia di
-- perdere per strada tabelle aggiunte da altre migrazioni.
DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''piano_ore_mese''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''piano_ore_mese''');
    END IF;
  END LOOP;
END $$;
