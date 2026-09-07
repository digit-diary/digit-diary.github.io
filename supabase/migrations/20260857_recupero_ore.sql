-- RECUPERO ORE (griglia giornaliera, come il foglio Excel di slots e tavoli)
--
-- Ogni giorno chi gestisce il piano segna gli scostamenti dal turno previsto:
-- -1 se il collaboratore ha fatto un'ora in meno, +3 se ne ha fatte tre in
-- piu'. Il totale del mese entra nel saldo ore, cosi' il conteggio e' sempre
-- aggiornato senza aspettare la fine del mese.
--
-- Diversa da piano_ore_mese, che registra il totale REALE di un mese chiuso:
-- questa e' la registrazione quotidiana, l'altra la rettifica complessiva.
--
-- Idempotente: si puo' rieseguire senza effetti.

CREATE TABLE IF NOT EXISTS piano_recupero_ore (
  id            BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  data          DATE NOT NULL,
  ore           NUMERIC(5,2) NOT NULL,   -- negativo = ore in meno, positivo = ore in piu'
  nota          TEXT,
  reparto_dip   TEXT,
  operatore     TEXT,
  creato_il     TIMESTAMPTZ DEFAULT now(),
  modificato_il TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS piano_recupero_ore_uniq ON piano_recupero_ore (collaboratore, data);
CREATE INDEX IF NOT EXISTS piano_recupero_ore_data ON piano_recupero_ore (data);

COMMENT ON TABLE piano_recupero_ore IS
  'Scostamenti giornalieri dalle ore del turno (-1 ora in meno, +3 ore in piu). Il totale del mese entra nel saldo ore. Registrazione quotidiana, diversa dalla rettifica mensile di piano_ore_mese.';

ALTER TABLE piano_recupero_ore ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON piano_recupero_ore;
CREATE POLICY deny_all_anon ON piano_recupero_ore FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''piano_recupero_ore''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''piano_recupero_ore''');
    END IF;
  END LOOP;
END $$;
