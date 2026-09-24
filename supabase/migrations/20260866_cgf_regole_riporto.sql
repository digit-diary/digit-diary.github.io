-- ============================================================
-- RECUPERI FESTIVI (CGF): regole e riporto dall'anno precedente
-- Il programma maturava un CGF su tutti i 14 festivi cantonali; il foglio
-- Excel (e l'Allegato 1 del RAP) conta solo i nove festivi parificati alla
-- domenica. Da qui: regola cgf_solo_parificati (modificabile), un massimo di
-- CGF automatici al mese, distanza minima fra due CGF, niente CGF attaccati
-- alle vacanze (RAP 4.3: "non cumulabili con le vacanze") e il riporto dei
-- recuperi maturati l'anno prima (colonna "riporto" del foglio CGF).
-- ============================================================

INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'cgf_solo_parificati', 'TRUE', 'HARD', 0, true,
  'CGF solo sui festivi parificati alla domenica (RAP Allegato 1: Capodanno, Epifania, Lunedi di Pasqua, Ascensione, 1 agosto, Assunzione, Ognissanti, Natale, S. Stefano), come nel foglio Excel. FALSE = tutti i festivi con il flag CGF'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'cgf_solo_parificati');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'cgf_max_mese', '2', 'SOFT', 0, true,
  'Massimo di recuperi festivi (CGF) che la bozza e "Assegna i CGF" danno alla stessa persona in un mese'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'cgf_max_mese');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'cgf_distanza_giorni', '5', 'SOFT', 0, true,
  'Giorni minimi fra due CGF automatici della stessa persona (evita i recuperi tutti di fila)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'cgf_distanza_giorni');
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'cgf_non_con_vacanze', 'TRUE', 'HARD', 0, true,
  'Un CGF automatico non viene messo il giorno prima o dopo una vacanza (RAP 4.3: i recuperi non sono cumulabili con le vacanze)'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'cgf_non_con_vacanze');

CREATE TABLE IF NOT EXISTS piano_cgf_riporto (
  id BIGSERIAL PRIMARY KEY,
  collaboratore TEXT NOT NULL,
  reparto_dip TEXT NOT NULL DEFAULT 'slots',
  anno INTEGER NOT NULL,
  riporto INTEGER NOT NULL DEFAULT 0,
  nota TEXT,
  operatore TEXT,
  modificato_il TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (collaboratore, reparto_dip, anno)
);
COMMENT ON TABLE piano_cgf_riporto IS 'Recuperi festivi (CGF) con cui un collaboratore entra nell anno: si sommano ai festivi lavorati dell anno. Come la colonna riporto del foglio CGF in Excel.';
ALTER TABLE piano_cgf_riporto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON piano_cgf_riporto;
CREATE POLICY deny_all_anon ON piano_cgf_riporto FOR ALL TO anon USING (false) WITH CHECK (false);

DO $$
DECLARE f TEXT; d TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['secure_read','secure_insert','secure_update','secure_delete'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f LIMIT 1;
    IF d IS NOT NULL AND position('''piano_cgf_riporto''' IN d) = 0 THEN
      EXECUTE replace(d, '''piano_briefing''', '''piano_briefing'', ''piano_cgf_riporto''');
    END IF;
  END LOOP;
END $$;
