-- FESTIVITA' E ORARI DI CHIUSURA
--
-- Il casino chiude alle 04:00 nei giorni feriali e alle 05:00 il venerdi' e il
-- sabato. Nei giorni di festivita' (in particolare quelle italiane, per la
-- clientela di frontiera) si chiude alle 05:00 anche in mezzo alla settimana,
-- e il 31 dicembre alle 07:00.
--
-- Sapere in anticipo quali sono quei giorni serve a mettere piu' personale a
-- lavorare: il piano di lavoro segna quei giorni con un marcatore (CH5, CH7).
--
-- Tabella separata dai festivi cantonali (piano_festivi), che servono a un
-- altro scopo: il recupero CGF e il supplemento del 50% degli ausiliari.
--
-- Idempotente: si puo' rieseguire senza effetti.

CREATE TABLE IF NOT EXISTS piano_festivita (
  id          BIGSERIAL PRIMARY KEY,
  data        DATE NOT NULL,
  nome        TEXT NOT NULL,
  paese       TEXT DEFAULT 'IT',
  ora_chiusura NUMERIC(4,2),          -- vuoto = usa la regola generale (5)
  attivo      BOOLEAN DEFAULT true,
  nota        TEXT,
  operatore   TEXT,
  creato_il   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS piano_festivita_uniq ON piano_festivita (data, nome);
CREATE INDEX IF NOT EXISTS piano_festivita_data ON piano_festivita (data);

COMMENT ON TABLE piano_festivita IS
  'Giorni di festivita che cambiano l orario di chiusura (e quindi il fabbisogno di personale). Diversi dai festivi cantonali di piano_festivi, che servono a CGF e supplemento 50%.';

ALTER TABLE piano_festivita ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON piano_festivita;
CREATE POLICY deny_all_anon ON piano_festivita FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''piano_festivita''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''piano_festivita''');
    END IF;
  END LOOP;
END $$;
