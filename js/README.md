# Diario Collaboratori — Struttura JavaScript (40 file)

## Ordine di caricamento (IMPORTANTE)

I file devono essere caricati nell'ordine elencato in index.html.
Dipendenze chiave: `realtime.js` dichiara i globals/cache; `api.js` li popola (loadAll);
`settings.js` definisce `isAdmin`/`isVis`/`puoModificare` usati da tutti i moduli successivi;
`maison-helpers.js` (ultimo) contiene i filtri per reparto `getXxxReparto()` usati anche
da formazione/valutazioni (chiamati solo a runtime, dopo il caricamento completo).

## File per area funzionale

Ordine = ordine di caricamento in index.html. Il Piano di lavoro e diviso in dieci file `piano-*.js` che si caricano in sequenza e condividono lo stesso ambito globale: ogni file e una scheda o un area (nucleo, generatore, configurazione, gestione, cambi, schede, impostazioni, celle, briefing, extra). Una modifica al Piano si fa nel file della sua area; l ordine di caricamento non va cambiato.

| # | File | Righe | Descrizione |
| --- | --- | --- | --- |
| 1 | config.js | 81 | Costanti, chiavi offuscate (XOR), variabili base |
| 2 | finestre.js | 98 | Finestre del programma al posto di quelle del browser: chiediConferma, chiediTesto, mostraAvviso (Invio/Esc, una alla volta, pulsante rosso per le eliminazioni) |
| 3 | crypto.js | 90 | Cifratura AES-GCM messaggi chat |
| 4 | chat-core.js | 256 | Schema chat enterprise: cache, helpers, wrapper |
| 5 | annulla.js | 437 | ANNULLA / RIPRISTINA generale: diario delle scritture della sessione (prima/dopo), gruppi per azione, conflitti, barretta e Ctrl+Z; fabbrica pura testabile (test/annulla.test.js) |
| 6 | realtime.js | 702 | WebSocket Supabase, polling fallback, GLOBALS/cache; canale sicuro secGet/secPatch/secDel/setImp con rinnovo sessione e filtri PostgREST convertiti in SQL |
| 7 | api.js | 352 | loadAll, healthCheck, caricamento impostazioni |
| 8 | utils.js | 795 | toast/toastErrore, escP, fmtCHF, salvaImp, settori (REPARTI_BASE), ordineCollabPiano, helpers |
| 9 | auth.js | 669 | Login, password, sessioni a token, sblocco biometrico v4 |
| 10 | cestino-core.js | 1107 | Soft delete, ripristino, conservazione dati, controllo salute, DB stats |
| 11 | settings.js | 2397 | Visibilita e permessi, profili fissi e personalizzati, operatori (creazione con posizione/copia accessi), settori, scheda permessi stampabile, backup, Impostazioni a schede |
| 12 | app.js | 472 | Routing pagine, init, renderPostLogin, tipi di evento |
| 13 | diario.js | 992 | Registrazioni; malattie a periodo sincronizzate nel Piano |
| 14 | alerts.js | 701 | Alert cassa/rischio/ammonimenti, soglie personalizzabili |
| 15 | search.js | 734 | Ricerca globale, riepilogo mensile PDF |
| 16 | chat-ui.js | 4044 | Chat + scheda collaboratore (KPI, cronologia, PDF, congedi, riga Crediti) |
| 17 | ai.js | 457 | Intelligenza artificiale configurabile: fornitori compatibili (Groq, Ollama/Llama, LM Studio), in uso e riserva, chiavi nel database (get_ai_key/set_ai_key), prova collegamento, aiChat/aiModello/aiPronta |
| 18 | moduli.js | 2846 | Moduli disciplinari, PDF, AI senza dati personali, anagrafica collaboratori |
| 19 | formazione.js | 3073 | Multidisciplinarita: matrice competenze, livelli, punti/premi, Report Incentivi |
| 20 | valutazioni.js | 1177 | Valutazione annuale: aree, import Excel, PDF HR |
| 21 | rapporto.js | 1096 | Rapporto giornaliero, parser assenze/cassa |
| 22 | stats.js | 983 | Statistiche, grafici |
| 23 | consegna.js | 1650 | Consegne turno, dashboard |
| 24 | promemoria.js | 1124 | Promemoria, scadenze, push |
| 25 | maison-core.js | 3230 | Maison: dashboard, costi, form manuale, auto-pulizia |
| 26 | maison-budget.js | 1190 | Maison: budget, categorie, profilo |
| 27 | maison-helpers.js | 3926 | Maison import Excel/parser + filtri per settore + inventario; giubilei e anzianita con congedi non pagati |
| 28 | guida.js | 545 | Guida in linea per capitoli, filtrata per permessi |
| 29 | piano-regole.js | 611 | MOTORE REGOLE del piano in funzioni pure (UMD, testabile con Node): riposi, consecutivi, idoneita, vacanze spettanti, chiusure, giorni chiusi |
| 30 | piano-core.js | 2258 | PIANO · nucleo: stato, helpers, sincronizzazione malattie, barra schede, rendering della griglia (primo dei file piano-*.js) |
| 31 | piano-genera.js | 1193 | PIANO · validatore regole e generatore della bozza (prenotazioni, passata di riparazione) |
| 32 | piano-config.js | 1764 | PIANO · scheda Regole (per settore, guida, controlli), fabbisogni, turni, codici, festivi |
| 33 | piano-gestione.js | 3073 | PIANO · benessere e domeniche, settore, festivi automatici, recupero ore, festivita e chiusure, CGF (RAP 4.3), congedi non pagati |
| 34 | piano-cambi.js | 2341 | PIANO · copia Excel, stampa PDF, cambi turno (scambio, esigenze, cerca cambio), copertura malattia |
| 35 | piano-schede.js | 2950 | PIANO · timbrature, statistiche, import vacanze, saldo ore dell anno, esportazione formato HR |
| 36 | piano-impostazioni.js | 1550 | PIANO · mappature e impostazioni, solver esterno, formulari, card congedi non pagati |
| 37 | piano-celle.js | 1051 | PIANO · stampa singolo collaboratore, menu tasto destro, modifica rapida delle celle |
| 38 | piano-briefing-ui.js | 1773 | PIANO · scheda Briefing (compilazione, numeri cassa, formato, Annulla/Ripristina del giorno) e corsi |
| 39 | piano-extra.js | 2278 | PIANO · copia/incolla a blocchi, annulla/ripristina, selezione sparsa, trova, migliora ore, formazione, scheda Crediti |
| 40 | pause-controlli.js | 531 | PAUSE · controlli del foglio Slots in funzioni pure (test/pause-controlli.test.js): pause di ogni persona, regola delle ore, distanza, sala mai vuota, righe senza nessuno |
| 41 | pause-engine.js | 4563 | PAUSE del briefing: schemi Slots (porting Excel), completamento delle pause mancanti, bigliettino del mattino, pausa e cambio collegati, motore algoritmico Valet/altri, regole pause per settore, PDF |

**Totale: 41 file, 61.813 righe (prettier --single-quote --print-width 120, solo JS).**

## Test automatici

- `node test/piano-regole.test.js` — regole del piano (115 controlli)
- `node test/pause-regole.test.js` — regole pause (39 controlli)
- `node test/pause-controlli.test.js` — controlli del foglio pause (29 controlli)
- `node test/annulla.test.js` — Annulla/Ripristina generale (38 controlli)
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
