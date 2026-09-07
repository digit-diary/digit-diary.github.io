-- TURNO CHE SI PROLUNGA QUANDO NE ARRIVA UN ALTRO
--
-- Z0 finisce alle 20:30 (invece che alle 19:45) nei giorni in cui e' previsto
-- Z12, che inizia alle 20:30 e gli da' il cambio. Sono gli stessi giorni in cui
-- il casino chiude alle 05:00, ma questa e' la verifica operativa: se nel piano
-- di quel giorno c'e' il turno che da' il cambio, il primo si prolunga.
--
-- Il programma usa i due criteri INSIEME: giorno di chiusura tardi oppure
-- presenza del turno indicato qui. Cosi' il conteggio resta giusto anche in un
-- giorno fuori dal solito.
--
-- Idempotente: si puo' rieseguire senza effetti.

ALTER TABLE piano_turni ADD COLUMN IF NOT EXISTS prolunga_se_turno TEXT;

COMMENT ON COLUMN piano_turni.prolunga_se_turno IS
  'Sigla del turno che, se presente nel piano dello stesso giorno, fa finire questo turno all ora_fine_tardi (es. Z0 si prolunga quando c e Z12).';
