# Diario Collaboratori — Struttura JavaScript (38 file)

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
| 2 | crypto.js | 90 | Cifratura AES-GCM messaggi chat |
| 3 | chat-core.js | 256 | Schema chat enterprise: cache, helpers, wrapper |
| 4 | annulla.js | 423 | ANNULLA / RIPRISTINA generale: diario delle scritture della sessione (prima/dopo), gruppi per azione, conflitti, barretta e Ctrl+Z; fabbrica pura testabile (test/annulla.test.js) |
| 5 | realtime.js | 702 | WebSocket Supabase, polling fallback, GLOBALS/cache; canale sicuro secGet/secPatch/secDel/setImp con rinnovo sessione e filtri PostgREST convertiti in SQL |
| 6 | api.js | 352 | loadAll, healthCheck, caricamento impostazioni |
| 7 | utils.js | 794 | toast/toastErrore, escP, fmtCHF, salvaImp, settori (REPARTI_BASE), ordineCollabPiano, helpers |
| 8 | auth.js | 663 | Login, password, sessioni a token, sblocco biometrico v4 |
| 9 | cestino-core.js | 1110 | Soft delete, ripristino, conservazione dati, controllo salute, DB stats |
| 10 | settings.js | 2307 | Visibilita e permessi, profili fissi e personalizzati, operatori (creazione con posizione/copia accessi), settori, scheda permessi stampabile, backup, Impostazioni a schede |
| 11 | app.js | 474 | Routing pagine, init, renderPostLogin, tipi di evento |
| 12 | diario.js | 992 | Registrazioni; malattie a periodo sincronizzate nel Piano |
| 13 | alerts.js | 701 | Alert cassa/rischio/ammonimenti, soglie personalizzabili |
| 14 | search.js | 733 | Ricerca globale, riepilogo mensile PDF |
| 15 | chat-ui.js | 4031 | Chat + scheda collaboratore (KPI, cronologia, PDF, congedi, riga Crediti) |
| 16 | moduli.js | 2935 | Moduli disciplinari, PDF, AI senza dati personali, anagrafica collaboratori |
| 17 | formazione.js | 3060 | Multidisciplinarita: matrice competenze, livelli, punti/premi, Report Incentivi |
| 18 | valutazioni.js | 1161 | Valutazione annuale: aree, import Excel, PDF HR |
| 19 | rapporto.js | 1096 | Rapporto giornaliero, parser assenze/cassa |
| 20 | stats.js | 975 | Statistiche, grafici |
| 21 | consegna.js | 1640 | Consegne turno, dashboard |
| 22 | promemoria.js | 1116 | Promemoria, scadenze, push |
| 23 | maison-core.js | 3195 | Maison: dashboard, costi, form manuale, auto-pulizia |
| 24 | maison-budget.js | 1181 | Maison: budget, categorie, profilo |
| 25 | maison-helpers.js | 3908 | Maison import Excel/parser + filtri per settore + inventario; giubilei e anzianita con congedi non pagati |
| 26 | guida.js | 544 | Guida in linea per capitoli, filtrata per permessi |
| 27 | piano-regole.js | 611 | MOTORE REGOLE del piano in funzioni pure (UMD, testabile con Node): riposi, consecutivi, idoneita, vacanze spettanti, chiusure, giorni chiusi |
| 28 | piano-core.js | 2248 | PIANO · nucleo: stato, helpers, sincronizzazione malattie, barra schede, rendering della griglia (primo dei file piano-*.js) |
| 29 | piano-genera.js | 1191 | PIANO · validatore regole e generatore della bozza (prenotazioni, passata di riparazione) |
| 30 | piano-config.js | 1758 | PIANO · scheda Regole (per settore, guida, controlli), fabbisogni, turni, codici, festivi |
| 31 | piano-gestione.js | 3067 | PIANO · benessere e domeniche, settore, festivi automatici, recupero ore, festivita e chiusure, CGF (RAP 4.3), congedi non pagati |
| 32 | piano-cambi.js | 2338 | PIANO · copia Excel, stampa PDF, cambi turno (scambio, esigenze, cerca cambio), copertura malattia |
| 33 | piano-schede.js | 2922 | PIANO · timbrature, statistiche, import vacanze, saldo ore dell anno, esportazione formato HR |
| 34 | piano-impostazioni.js | 1547 | PIANO · mappature e impostazioni, solver esterno, formulari, card congedi non pagati |
| 35 | piano-celle.js | 1047 | PIANO · stampa singolo collaboratore, menu tasto destro, modifica rapida delle celle |
| 36 | piano-briefing-ui.js | 1628 | PIANO · scheda Briefing (compilazione, numeri cassa, formato) e corsi |
| 37 | piano-extra.js | 2276 | PIANO · copia/incolla a blocchi, annulla/ripristina, selezione sparsa, trova, migliora ore, formazione, scheda Crediti |
| 38 | pause-engine.js | 3791 | PAUSE del briefing: schemi Slots (porting Excel), motore algoritmico Valet/altri, regole pause per settore, verifica, PDF |

**Totale: 38 file, 58.944 righe (prettier --single-quote --print-width 120, solo JS).**

## Test automatici

- `node test/piano-regole.test.js` — regole del piano (115 controlli)
- `node test/pause-regole.test.js` — regole pause (33 controlli)
- `node test/annulla.test.js` — Annulla/Ripristina generale (26 controlli)
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
