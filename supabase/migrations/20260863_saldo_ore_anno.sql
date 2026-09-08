-- SALDO ORE DELL'ANNO, come il foglio "Saldo Ore" del piano Excel.
--
-- Nel foglio il saldo finale di una persona e' il RIPORTO a una certa data piu'
-- la somma dei saldi di ogni mese dell'anno, e vale "ok" solo se resta dentro
-- una banda (oggi da -15 a +15 ore). I mesi futuri gia' pianificati entrano nel
-- conto, quindi si vede in anticipo chi andra' fuori soglia e chi deve
-- recuperare: e' questo che rende il foglio utile, non la fotografia del
-- passato.
--
-- Il programma calcolava gia' il saldo del mese allo stesso modo (ore piano
-- meno ore dovute piu' gli scostamenti del recupero ore). Mancava solo il
-- riporto iniziale, che qui prende una tabella sua per non perdere ne' la data
-- a cui si riferisce ne' chi lo ha scritto.
CREATE TABLE IF NOT EXISTS piano_saldo_iniziale (
  id BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  reparto_dip TEXT NOT NULL DEFAULT 'slots',
  anno INTEGER NOT NULL,
  ore NUMERIC(7,2) NOT NULL DEFAULT 0,
  data_riferimento DATE,
  nota TEXT,
  operatore TEXT,
  modificato_il TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (collaboratore, reparto_dip, anno)
);
COMMENT ON TABLE piano_saldo_iniziale IS 'Riporto delle ore con cui un collaboratore entra nell anno: si somma ai saldi mensili per ottenere il saldo annuale.';
COMMENT ON COLUMN piano_saldo_iniziale.data_riferimento IS 'A quando e aggiornato il riporto (nel foglio Excel era il 31.08.2026).';

ALTER TABLE piano_saldo_iniziale ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "piano_saldo_iniziale_all" ON piano_saldo_iniziale;
CREATE POLICY "piano_saldo_iniziale_all" ON piano_saldo_iniziale FOR ALL USING (true) WITH CHECK (true);

-- La banda entro cui il saldo e' considerato in ordine. Sono regole come le
-- altre, quindi si cambiano dalla scheda Regole senza toccare il programma.
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'saldo_ore_max', '15', 'SOFT', 0, true, 'Saldo ore annuale: massimo accettato prima di segnalare (ore in piu)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'saldo_ore_max');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'saldo_ore_min', '-15', 'SOFT', 0, true, 'Saldo ore annuale: minimo accettato prima di segnalare (ore in meno)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'saldo_ore_min');

-- La tabella deve essere raggiungibile dalle funzioni sicure, altrimenti il
-- programma la vede ma non ci puo' scrivere. Si aggiunge alla whitelist senza
-- riscrivere le funzioni, come per piano_ore_mese.
DROP POLICY IF EXISTS "piano_saldo_iniziale_all" ON piano_saldo_iniziale;
DROP POLICY IF EXISTS deny_all_anon ON piano_saldo_iniziale;
CREATE POLICY deny_all_anon ON piano_saldo_iniziale FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''piano_saldo_iniziale''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''piano_saldo_iniziale''');
    END IF;
  END LOOP;
END $$;
