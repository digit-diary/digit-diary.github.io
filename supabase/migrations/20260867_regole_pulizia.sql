-- ============================================================
-- REGOLE DEL PIANO: pulizia e descrizioni oneste
-- Sei regole erano scritte nella tabella ma nessun punto del programma le
-- leggeva (retaggio del solver Turnivo) oppure erano doppioni delle regole di
-- gruppo: si tolgono, cosi' la scheda Regole mostra solo cio' che agisce.
-- Le descrizioni degli scaglioni vacanze dicevano "cumulativi": il calcolo
-- (e il regolamento) usa lo scaglione piu' alto raggiunto, non la somma.
-- ============================================================
DELETE FROM piano_regole WHERE nome IN (
  'accoglienza_preferenze',   -- doppione della regola di gruppo richiede_campo ACCOGLIENZA
  'pattern_dn_abilitato',     -- solo solver
  'pattern_riposo',           -- solo solver
  'usa_solver_globale',       -- solo solver
  'sup_max_bo_giorno',        -- doppione di limite_funzione_giorno BO SUP:1
  'sup_max_bo_mese'           -- doppione di limite_funzione_mese BO SUP:1
);
UPDATE piano_regole SET descrizione = 'Giorni in piu dopo 10 anni di servizio (in tutto: lo scaglione piu alto sostituisce il precedente)' WHERE nome = 'vacanze_bonus_10anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu dopo 15 anni di servizio (in tutto, non si somma al precedente)' WHERE nome = 'vacanze_bonus_15anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu dopo 20 anni di servizio (in tutto, non si somma al precedente)' WHERE nome = 'vacanze_bonus_20anni';
UPDATE piano_regole SET descrizione = 'Giorni in piu dopo 25 anni di servizio (in tutto, non si somma al precedente)' WHERE nome = 'vacanze_bonus_25anni';
UPDATE piano_regole SET descrizione = 'Preferisci blocchi di lavoro e riposo compatti (ordine dei candidati nella bozza)' WHERE nome = 'blocchi_compatti';
UPDATE piano_regole SET descrizione = 'Lunghezza ideale di un blocco di lavoro, in giorni (bozza, con blocchi compatti)' WHERE nome = 'pattern_lavoro';
UPDATE piano_regole SET descrizione = 'Evita il riposo di un giorno solo fra due blocchi di lavoro (bozza)' WHERE nome = 'penalita_riposo_isolato';
UPDATE piano_regole SET descrizione = 'Evita la sequenza notte, un riposo, turno del mattino (bozza)' WHERE nome = 'no_notte_riposo_presto';
UPDATE piano_regole SET descrizione = 'Distribuisci i turni notturni in modo equo fra le persone (bozza)' WHERE nome = 'equilibrio_notti';
UPDATE piano_regole SET descrizione = 'Equilibra diurni e notturni per ogni persona (bozza)' WHERE nome = 'equilibrio_diurni_notturni';
UPDATE piano_regole SET descrizione = 'Metti i congedi C (e i WD) attorno alle settimane di vacanza; No = solo le V' WHERE nome = 'c_prima_dopo_vacanza';
INSERT INTO piano_regole (nome, valore, tipo, peso, attivo, descrizione)
SELECT 'vacanze_giorni_anno', '20', 'SOFT', 0, true, 'Giorni di vacanza usati dall indice di benessere per il confronto'
WHERE NOT EXISTS (SELECT 1 FROM piano_regole WHERE nome = 'vacanze_giorni_anno');
