-- CONGEDO NON PAGATO E ANZIANITA' DI SERVIZIO
--
-- Chi resta fermo per uno o piu' mesi interi (congedo non pagato) non matura
-- anzianita' in quel periodo: il giubileo si sposta in avanti di altrettanto.
--
-- Il piano digitale copre solo gli anni recenti, quindi un congedo del 2015 non
-- e' ricostruibile dai dati: il valore si tiene in un campo esplicito, che il
-- programma sa PROPORRE leggendo i mesi di sola "C" trovati nel piano, ma che
-- resta correggibile a mano da chi gestisce lo storico HR.
--
-- Idempotente: si puo' rieseguire senza effetti.

ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS mesi_congedo_non_pagato INTEGER DEFAULT 0;

COMMENT ON COLUMN collaboratori.mesi_congedo_non_pagato IS
  'Mesi interi di congedo non pagato (nessun turno, nessuna assenza retribuita): non maturano anzianita, quindi spostano in avanti le date dei giubilei. Il programma propone il valore leggendo il piano, ma resta modificabile a mano perche i periodi piu vecchi del piano digitale non sono ricostruibili.';
