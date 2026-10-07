-- ============================================================
-- PREFERENZE DEL PIANO: solo notturni, giorni di lavoro, giorni a settimana, turni consentiti
-- (07/10/2026, richieste del titolare)
-- solo_notti: come solo_diurni, ma solo turni notturni.
-- giorni_lavoro: giorni della settimana in cui il collaboratore puo lavorare
-- (numeri di JavaScript: 0 domenica, 1 lunedi ... 6 sabato, separati da virgola, come
-- li salvano le caselle; per la domenica vale anche 7; vuoto = tutti).
-- giorni_settimana: quanti giorni di lavoro al massimo nella settimana lunedi-domenica
-- (1-6; vuoto = nessun limite). Con piu giorni spuntati che giorni a settimana (es.
-- giovedi-domenica e 3) il programma sceglie ogni settimana quali, e puo lasciare
-- libere delle domeniche.
-- Fuori da questi limiti non viene mai proposto (bozza, Migliora, generazione
-- automatica, cerca cambio, copertura malattia); scritto a mano riceve un avviso e
-- Valida regole lo segnala.
-- Si puo rilanciare: le colonne si aggiungono solo se mancano.
-- ============================================================
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS solo_notti BOOLEAN DEFAULT FALSE;
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS giorni_lavoro TEXT;
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS giorni_settimana INT;
-- turni_consentiti: eccezioni alle regole "Turni per livello" (piano_regole_gruppo,
-- tipo livello_turni): sigle che la persona fa anche senza il livello richiesto (CSV)
ALTER TABLE collaboratori ADD COLUMN IF NOT EXISTS turni_consentiti TEXT;

NOTIFY pgrst, 'reload schema';
