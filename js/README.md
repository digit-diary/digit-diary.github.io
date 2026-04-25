# Diario Collaboratori — Struttura Codice JavaScript

## Panoramica
Il codice JavaScript dell'app è organizzato in 13 file, caricati in ordine da `index.html`.
Ogni file gestisce un'area funzionale specifica dell'applicazione.

## Ordine di caricamento (importante!)
I file devono essere caricati nell'ordine elencato perché ogni file può dipendere da funzioni/variabili definite nei file precedenti.

## File e contenuto

### 1. `config.js` — Configurazione e costanti
- Chiavi API Supabase (offuscate con XOR)
- Costanti: `SB_URL`, `SB_KEY`, `VAPID_PUBLIC_KEY`
- Tipi default (`TIPI_DEFAULT`), colori, mesi, giorni
- Variabili globali di stato (cache, filtri, selezioni)
- Cache enterprise chat: `chatMessagesCache`, `chatGroupsCache`, etc.

### 2. `crypto.js` — Cifratura messaggi (AES-GCM)
- `encryptNota(testo)` — cifra un messaggio
- `decryptNota(data)` — decifra un messaggio
- `decryptNoteCache()` / `decryptChatMessagesCache()` — decifra batch

### 3. `chat-core.js` — Schema enterprise chat (logica)
- Helpers: `_chatGetGroupById`, `_chatGetGroupMembers`, `_chatLetti`, `_chatIsHidden`
- `_chatToSyntheticNotes(msg)` — converte chat_messages in formato legacy
- `_chatBuildNoteCache()` — rigenera noteColleghiCache da chatMessagesCache
- Wrapper: `_chatPatchMessage`, `_chatDeleteMessage`, `_chatInsertMessage`

### 4. `realtime.js` — WebSocket e polling
- `_initNoteRealtime()` — subscribe a chat_messages via Supabase Realtime
- Gestione errori con retry e backoff crescente
- Fallback a polling ogni 30s se WebSocket non disponibile
- `_resyncNote()` — risincronizzazione completa delle cache

### 5. `api.js` — Comunicazione con il database
- `secGet(path)` / `secPost(table, data)` / `secPatch(...)` / `secDel(...)`
- Tutte le chiamate passano per funzioni PL/pgSQL `secure_*` con token sessione
- Fallback a REST diretto se le RPC falliscono
- `loadAll()` — caricamento parallelo di tutte le tabelle al login

### 6. `cestino.js` — Modulo principale (da refactorare ulteriormente)
Questo file contiene diverse funzionalità che in futuro andrebbero separate:
- **Cestino**: soft delete, ripristino, svuotamento
- **Autenticazione**: login, password, sessioni, biometrico (Face ID/Touch ID)
- **Gestione operatori**: aggiunta, rimozione, cambio password, reparti
- **Impostazioni**: visibilità sezioni, temi, configurazione campi rapporto
- **Diario**: salvataggio registrazioni, modifica, eliminazione, filtri
- **Collaboratori**: lista, scheda dettaglio, KPI, grafico trend
- **Scadenze**: gestione scadenze associabili a registrazioni
- **Alert disciplinari**: cassa, rischio (allineamento/RDI), ammonimenti
- **Parser differenze cassa**: auto-registra errori cassa dal rapporto
- **Utilità generali**: toast, escP, fmtCHF, capitalizzaNome, matchCollaboratore
- **Ricerca globale**: cerca in tutte le sezioni dell'app
- **Riepilogo mensile PDF**: generazione report PDF completo

### 7. `chat-ui.js` — Interfaccia chat (stile WhatsApp)
- `renderNoteCollega()` — lista conversazioni (gruppi + singoli, unificata)
- `renderNoteChat(partner)` — messaggi nella chat aperta
- `apriConversazione(partner)` — apre una chat e marca come letta
- `inviaNotaChat()` — invia messaggio (1 riga in chat_messages)
- Gestione gruppi: crea, rinomina, aggiungi/rimuovi membri
- Reazioni emoji, messaggi importanti, urgenti
- Modifica, elimina, inoltra messaggi
- Ricerca dentro chat e nella lista conversazioni

### 8. `moduli.js` — Moduli disciplinari (PDF)
- Form: Allineamento, Apprezzamento, RDI di I° e II° livello
- `generaModuloPDF(tipo)` — genera PDF formato A4 con logo, firme, QR code
- Ristampa senza segnare come modificato
- AI: generazione automatica dei campi con Groq/Llama
- Lista moduli generati con filtri

### 9. `rapporto.js` — Rapporto giornaliero
- Calendario mensile con stato compilato/da compilare
- Form per turno (PRESTO/NOTTE) con autosalvataggio ogni 1.2 secondi
- Parser assenze: `_analizzaAssenzeRapporto` + `_eseguiAssenzeOps`
  - Riconosce: "Tonati assente", "dal 10.04 al 23.04", "domani", "fino a lunedì"
  - Dedup cross-rapporto, validazione date, audit log
- Esportazione CSV e PDF del rapporto

### 10. `stats.js` — Statistiche e grafici
- KPI generali: errori, malattie, costi
- Grafici Chart.js: trend mensile, distribuzione tipi, top collaboratori
- Filtri per periodo (dal/al)
- Confronto mese su mese con badge differenza

### 11. `consegna.js` — Consegne turno e dashboard
- Passaggio consegne tra turni con multi-destinatario
- Dashboard con widget: azioni rapide, stato rapporti, alert
- Badge consegne non lette
- Compleanni del giorno con notifica

### 12. `promemoria.js` — Promemoria e scadenze
- Creazione promemoria con scadenza, ripetizione, assegnatari multipli
- Notifiche push automatiche (cron GitHub Actions ogni ora)
- Filtri per stato (attivi, scaduti, completati)
- Promemoria ripetitivi (giornaliero, settimanale, mensile, annuale)

### 13. `maison.js` — Gestione clienti VIP Maison
- Costi giornalieri per cliente con buoni (BU, BL, CG, WL)
- Budget mensile per categoria con alert sforamento
- Import da Excel (file Maison del Casino)
- Import compleanni da Excel
- Parser intelligente nomi (correzione typo, divisione gruppi con /)
- Auto-detect categoria dal budget per splitting costi
- Regali Maison, spese extra, note clienti
- Scheda profilo cliente con storico completo
- Esportazione CSV e PDF

## Schema database
Le migration SQL sono in `supabase/migrations/` (30 file in ordine cronologico).
Tabelle principali: `registrazioni`, `chat_messages`, `chat_groups`, `costi_maison`, `rapporti_giornalieri`.
Vedere `Documentazione_Tecnica_Sicurezza.docx` per i dettagli completi.
