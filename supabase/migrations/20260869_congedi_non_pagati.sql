-- ============================================================
-- CONGEDI NON PAGATI (RAP 5.14)
-- Un periodo con date, motivo e chi lo ha autorizzato. Effetti, tutti con
-- soglie modificabili dalle Regole:
--   - nel piano i giorni ricevono il codice CNP (0 ore, protetto) e non
--     contano fra le ore dovute del mese;
--   - oltre congedo_np_giorni_vacanze (10) il diritto alle vacanze dell'anno
--     si riduce in proporzione ai giorni di congedo ("decade per tutta la
--     durata del congedo");
--   - oltre congedo_np_mesi_anzianita (6) l'anzianita' di servizio si sposta
--     in avanti di tutta la durata (giubilei e scaglioni vacanze); sotto,
--     "non comporta interruzione degli anni effettivi di servizio".
-- Sostituisce il vecchio conteggio "mesi interi di sola C".
-- ============================================================
CREATE TABLE IF NOT EXISTS collab_congedi_np (
  id BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  reparto_dip TEXT NOT NULL DEFAULT 'slots',
  dal DATE NOT NULL,
  al DATE NOT NULL,
  motivo TEXT,
  autorizzato_da TEXT,
  nota TEXT,
  operatore TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (al >= dal)
);
CREATE INDEX IF NOT EXISTS idx_congedi_np_collab ON collab_congedi_np (collaboratore, dal);
COMMENT ON TABLE collab_congedi_np IS 'Congedi non pagati concessi (RAP 5.14): periodo, motivo, autorizzazione. Effetti su piano, vacanze e anzianita secondo le regole congedo_np_*.';
ALTER TABLE collab_congedi_np ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON collab_congedi_np;
CREATE POLICY deny_all_anon ON collab_congedi_np FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''collab_congedi_np''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''collab_congedi_np''');
    END IF;
  END LOOP;
END $$;

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'congedo_np_giorni_vacanze', '10', 'HARD', 0, true,
  'Congedo non pagato: oltre questi giorni il diritto alle vacanze dell anno si riduce in proporzione alla durata (RAP 5.14)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'congedo_np_giorni_vacanze');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'congedo_np_mesi_anzianita', '6', 'HARD', 0, true,
  'Congedo non pagato: oltre questi mesi l anzianita di servizio si sposta in avanti di tutta la durata; fino a questi mesi non si interrompe (RAP 5.14)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'congedo_np_mesi_anzianita');

INSERT INTO piano_codici (codice, descrizione, ore, formula, scala_percentuale, protetto, is_riposo, attivo, richiede_orario)
SELECT 'CNP', 'Congedo non pagato', 0, '0', false, true, false, true, false
WHERE NOT EXISTS (SELECT 1 FROM piano_codici WHERE upper(codice) = 'CNP');
