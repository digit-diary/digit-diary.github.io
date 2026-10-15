-- ============================================================
-- I CORSI CONTANO COME LAVORO (decisione del titolare 15/10/2026)
--
-- Dove si decide: un codice che non e un turno conta come lavoro (riposo minimo 11 ore,
-- giorni di fila, 4+1+1, ore della settimana, domenica non libera) se e nella regola
-- "codici_lavoro" (sigle separate da virgola). Senza la riga vale l elenco fisso del
-- programma: JG,U,US,CS,LRD,F,1F. ANTINCENDIO, che e nella lista dei corsi (Piano › Turni ›
-- Corsi), non c era: un corso antincendio dopo una notte non dava nessun avviso e non
-- contava ore. piano_codici NON ha un campo "conta come lavoro": il punto di verita e
-- la regola (modificabile nella scheda Regole).
--
-- 1) La regola diventa una riga vera (generale, tutti i settori): l elenco attuale (o
--    quello fisso del programma) piu TUTTI i corsi della lista dei corsi
--    (impostazioni.piano_corsi_lista; senza, la lista predefinita CS,LRD,ANTINCENDIO).
--    Da qui in avanti il programma aggiunge da solo alla regola ogni corso nuovo.
-- 2) I corsi chiedono l orario quando si scrivono a mano (richiede_orario): con l orario
--    il programma conta le ore vere e il riposo prima e dopo.
-- Rilanciabile: non toglie niente, aggiunge solo le sigle che mancano.
-- ============================================================
BEGIN;

-- la riga generale, se manca
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'codici_lavoro', 'JG,U,US,CS,LRD,F,1F', 'HARD', 0, true,
       'Codici di lavoro che non sono turni (JG, ufficio, corsi, formazione): contano come lavoro per riposo, giorni di fila e ore'
 WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'codici_lavoro' AND coalesce(trim(settori), '') = '');

-- i corsi della lista che mancano nella regola (generale e di settore)
UPDATE piano_regole r
   SET valore = r.valore || ',' || m.agg
  FROM (
    SELECT p.id, string_agg(c.c, ',' ORDER BY c.c) AS agg
      FROM piano_regole p
      CROSS JOIN (
        SELECT DISTINCT upper(trim(x)) AS c
          FROM regexp_split_to_table(
                 coalesce((SELECT valore FROM impostazioni WHERE chiave = 'piano_corsi_lista'), 'CS,LRD,ANTINCENDIO'),
                 ',') AS x
         WHERE trim(x) <> ''
      ) c
     WHERE p.nome = 'codici_lavoro'
       AND c.c <> ALL (string_to_array(upper(replace(coalesce(p.valore, ''), ' ', '')), ','))
     GROUP BY p.id
  ) m
 WHERE r.id = m.id;

-- i corsi chiedono l orario (le ore vere e il riposo prima e dopo)
UPDATE piano_codici
   SET richiede_orario = true
 WHERE upper(codice) IN (
         SELECT DISTINCT upper(trim(x))
           FROM regexp_split_to_table(
                  coalesce((SELECT valore FROM impostazioni WHERE chiave = 'piano_corsi_lista'), 'CS,LRD,ANTINCENDIO'),
                  ',') AS x
          WHERE trim(x) <> '')
   AND coalesce(richiede_orario, false) = false;

INSERT INTO public.migrazioni_applicate (nome) VALUES ('20260918_corsi_contano_come_lavoro')
ON CONFLICT (nome) DO NOTHING;

COMMIT;
