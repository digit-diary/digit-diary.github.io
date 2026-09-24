# Diario Collaboratori — Struttura JavaScript (28 file)

## Ordine di caricamento (IMPORTANTE)

I file devono essere caricati nell'ordine elencato in index.html.
Dipendenze chiave: `realtime.js` dichiara i globals/cache; `api.js` li popola (loadAll);
`settings.js` definisce `isAdmin`/`isVis`/`puoModificare` usati da tutti i moduli successivi;
`maison-helpers.js` (ultimo) contiene i filtri per reparto `getXxxReparto()` usati anche
da formazione/valutazioni (chiamati solo a runtime, dopo il caricamento completo).

## File per area funzionale

Ordine = ordine di caricamento in index.html.

| # | File | Righe | Descrizione |
| --- | --- | --- | --- |
| 1 | config.js | 81 | Costanti, chiavi offuscate (XOR), variabili base |
| 2 | crypto.js | 90 | Cifratura AES-GCM messaggi chat |
| 3 | chat-core.js | 256 | Schema chat enterprise: cache, helpers, wrapper |
| 4 | realtime.js | 677 | WebSocket Supabase, polling fallback, GLOBALS/cache; canale sicuro secGet/secPatch/secDel/setImp con rinnovo sessione (renew_op_session) e filtri PostgREST convertiti in SQL |
| 5 | api.js | 352 | loadAll, healthCheck, caricamento impostazioni |
| 6 | utils.js | 794 | toast/toastErrore, escP, fmtCHF, salvaImp, settori (REPARTI_BASE), ordineCollabPiano, helpers |
| 7 | auth.js | 663 | Login, password, sessioni a token, sblocco biometrico v4 (segreto per dispositivo) |
| 8 | cestino-core.js | 1110 | Soft delete, ripristino, conservazione dati, controllo salute, DB stats |
| 9 | settings.js | 2300 | Visibilita e permessi, PROFILI fissi (matrice) e PERSONALIZZATI, operatori (creazione con posizione/copia accessi), settori, scheda permessi stampabile, backup, Impostazioni a schede |
| 10 | app.js | 474 | Routing pagine, init, renderPostLogin, tipi di evento |
| 11 | diario.js | 992 | Registrazioni: salva, modifica, elimina; malattie a periodo sincronizzate nel Piano |
| 12 | alerts.js | 701 | Alert cassa/rischio/ammonimenti, soglie personalizzabili |
| 13 | search.js | 733 | Ricerca globale, riepilogo mensile PDF |
| 14 | chat-ui.js | 4031 | Chat + SCHEDA COLLABORATORE (KPI, cronologia, PDF, congedi, riga Crediti) |
| 15 | moduli.js | 2906 | Moduli disciplinari, PDF, AI (senza dati personali), anagrafica collaboratori |
| 16 | formazione.js | 3060 | Multidisciplinarita: matrice competenze, livelli, punti/premi, Report Incentivi |
| 17 | valutazioni.js | 1161 | Valutazione annuale: aree, import Excel, PDF HR |
| 18 | rapporto.js | 1096 | Rapporto giornaliero, parser assenze/cassa |
| 19 | stats.js | 975 | Statistiche, grafici |
| 20 | consegna.js | 1640 | Consegne turno, dashboard |
| 21 | promemoria.js | 1116 | Promemoria, scadenze, push |
| 22 | maison-core.js | 3195 | Maison: dashboard, costi, form manuale, auto-pulizia |
| 23 | maison-budget.js | 1181 | Maison: budget, categorie, profilo |
| 24 | maison-helpers.js | 3908 | Maison import Excel/parser + filtri per settore + inventario; giubilei e anzianita con congedi non pagati |
| 25 | guida.js | 542 | Guida in linea per capitoli, filtrata per permessi |
| 26 | piano-regole.js | 611 | MOTORE REGOLE del piano in funzioni pure (UMD, testabile con node test/piano-regole.test.js): riposi, consecutivi, idoneita, vacanze spettanti, chiusure, giorni chiusi |
| 27 | piano.js | 19976 | PIANO DI LAVORO: calendario, generatore bozza (prenotazioni compleanni/CGF, passata di riparazione, solver esterno opzionale), cambi turno e coperture, CGF (RAP 4.3), briefing, vacanze, saldo, recupero ore, crediti, timbrature, statistiche, regole per settore, festivi, congedi non pagati, guida |
| 28 | pause-engine.js | 3791 | PAUSE del briefing: schemi Slots (porting Excel), motore algoritmico Valet/altri, REGOLE PAUSE per settore (durata/turno/distanza/fascia/insieme/nota, giorni), verifica, PDF |

**Totale: 28 file, 58.412 righe (formattazione prettier --single-quote --print-width 120, solo JS).**

## Test automatici

- `node test/piano-regole.test.js` — regole del piano (115 controlli)
- `node test/pause-regole.test.js` — regole pause (33 controlli)
- `node strumenti/verifica_crediti.js` — verifica incrociata Crediti/Vacanze/Festivi/Saldo con il codice vero sopra i dati esportati (`strumenti/esporta_dati_verifica.py`)

## Settori (dinamici, personalizzabili da admin)

Slots e Tavoli sono fissi (REPARTI_BASE in utils.js); gli altri (default Valet, Cleaning)
vivono in impostazioni `reparti_config` e si gestiscono da Impostazioni → Settori
(aggiungi/rinomina/colore/disattiva). Tutti i dati passano dai filtri `getXxxReparto()`
e salvano `reparto_dip: currentReparto`. Config per settore: competenze
(competenze_config[key]), categorie inventario (inventario_categorie_extra per settore,
Buoni/Sigarette solo Slots/Tavoli), pagine visibili (`reparti_pagine`, es. niente Maison
nel Valet — applicata da isVis). Config condivise: punti/premi, soglie alert/disciplinari,
valori buoni. Il select del login usa la cache localStorage `_cache_reparti`.

## Permessi di modifica (settings.js)

Default solo admin, delegabili a operatori selezionati (es. HR, supervisor) da Visibilità:
`gestione_punti`, `gestione_impiego`, `gestione_categorie`, `vista_categorie`,
`gestione_competenze`, `gestione_valutazioni`, `gestione_formazioni`, `storico_hr`.
Chi non è abilitato vede tutto in sola lettura.

## Allegati Storico HR (hr_allegati)

Schede originali (PDF/Excel/immagine, max 2 MB, base64 nel DB) caricate dalla scheda
collaboratore o da Registra formazione; l'import Excel valutazione salva anche il file
originale. La tabella NON è in loadAll: lettura on-demand (caricaAllegatiCollab).
Visibili a admin + `storico_hr` + `gestione_formazioni`. L'import legge anche il foglio
"Autovalutazione" del workbook ufficiale (colonna auto_aree, mostrata accanto ai valori).
