-- BLOCCO DI UNA SINGOLA CELLA DEL PIANO, CON MOTIVO
--
-- Il contrassegno "protetto" esisteva gia' e tutto il programma lo rispetta
-- (bozza, cancella mese, scambi turno, ricerca coperture, conferma prima di
-- cancellare), ma lo metteva solo il programma da solo: vacanze, assenze
-- confermate, scambi. Chi pianifica non poteva bloccare a mano un giorno che
-- non si deve toccare, per esempio una visita medica.
--
-- Qui si aggiunge il MOTIVO del blocco. Non e' un dettaglio: chi domani prova
-- a spostare quel turno non vede solo un divieto, legge perche'. Il motivo
-- compare nel suggerimento della cella e dentro la finestra di conferma.
ALTER TABLE piano ADD COLUMN IF NOT EXISTS motivo_blocco TEXT;
COMMENT ON COLUMN piano.motivo_blocco IS 'Perche la cella e bloccata (es. visita medica). Scritto da chi mette il blocco a mano dal menu della cella; chi ha bloccato e quando restano nel Registro attivita.';
