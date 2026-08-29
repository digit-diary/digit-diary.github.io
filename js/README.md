# Diario Collaboratori — Struttura JavaScript (24 file)

## Ordine di caricamento (IMPORTANTE)
I file devono essere caricati nell'ordine elencato in index.html.
Dipendenze chiave: `realtime.js` dichiara i globals/cache; `api.js` li popola (loadAll);
`settings.js` definisce `isAdmin`/`isVis`/`puoModificare` usati da tutti i moduli successivi;
`maison-helpers.js` (ultimo) contiene i filtri per reparto `getXxxReparto()` usati anche
da formazione/valutazioni (chiamati solo a runtime, dopo il caricamento completo).

## File per area funzionale

| # | File | Righe | Descrizione |
|---|---|---|---|
| 1 | config.js | 81 | Costanti, chiavi offuscate (XOR), variabili base |
| 2 | crypto.js | 90 | Cifratura AES-GCM messaggi chat |
| 3 | chat-core.js | 236 | Schema chat enterprise: cache, helpers, wrapper |
| 4 | realtime.js | 668 | WebSocket Supabase, polling fallback, GLOBALS/cache (incl. valutazioni, punti, soglie alert, categorie inventario) |
| 5 | api.js | 269 | secGet/Post/Patch/Del, loadAll, healthCheck |
| 6 | utils.js | 534 | toast, escP, fmtCHF, capitalizzaNome, helpers |
| 7 | auth.js | 597 | Login, password, sessioni, biometrico |
| 8 | cestino-core.js | 335 | Soft delete, ripristino, DB stats |
| 9 | settings.js | 1085 | Visibilità pagine/funzioni, PERMESSI DI MODIFICA (puoModificare: punti, categorie, competenze, valutazioni), operatori, temi |
| 10 | app.js | 445 | Routing pagine, init, renderPostLogin |
| 11 | diario.js | 942 | Registrazioni: salva, modifica, elimina; hook popup copertura malattie |
| 12 | alerts.js | 701 | Alert cassa/rischio/ammonimenti, soglie personalizzabili (getSoglieAlert) |
| 13 | search.js | 733 | Ricerca globale, riepilogo mensile PDF |
| 14 | chat-ui.js | 3790 | Chat WhatsApp + SCHEDA COLLABORATORE (KPI cliccabili, cronologia con anteprima voci/PDF modulo, PDF scheda, push) |
| 15 | moduli.js | 2357 | Moduli disciplinari, PDF, AI, gestione collaboratori (reparto, impiego Jolly/Fisso, categoria 5ª-1ª) |
| 16 | formazione.js | 1709 | MULTIDISCIPLINARITÀ: matrice competenze, livelli L1-L3, punti/premi, popup copertura, notifiche incentivi, Report Incentivi PDF |
| 17 | valutazioni.js | 1151 | VALUTAZIONE ANNUALE: 11 aree (9 HR + Versatilità + Affidabilità e disponibilità), editor multi-scheda, import Excel scheda ufficiale, PDF formato HR |
| 18 | rapporto.js | 1012 | Rapporto giornaliero, parser assenze/cassa |
| 19 | stats.js | 824 | Statistiche, grafici Chart.js |
| 20 | consegna.js | 1526 | Consegne turno, dashboard |
| 21 | promemoria.js | 1021 | Promemoria, scadenze, push |
| 22 | maison-core.js | 3224 | Maison: dashboard, costi, form manuale, auto-pulizia GD |
| 23 | maison-budget.js | 1152 | Maison: budget, categorie, profilo |
| 24 | maison-helpers.js | 3810 | Maison import Excel/parser nomi + FILTRI REPARTO (getCollaboratoriReparto, getValutazioniReparto, getPuntiReparto, getInventarioReparto) + inventario con categorie personalizzabili |

**Totale: 24 file. ~28.292 righe formattate**

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
