# Diario Collaboratori — Struttura JavaScript (22 file)

## Ordine di caricamento (IMPORTANTE)
I file devono essere caricati nell'ordine elencato in index.html.

## File per area funzionale

| # | File | Righe | Funzioni | Descrizione |
|---|---|---|---|---|
| 1 | config.js | 81 | 2 | Costanti, API keys, variabili globali |
| 2 | crypto.js | 90 | 4 | Cifratura AES-GCM messaggi chat |
| 3 | chat-core.js | 236 | 13 | Schema enterprise: cache, helpers, wrapper |
| 4 | realtime.js | 566 | 32 | WebSocket Supabase, polling fallback |
| 5 | api.js | 176 | 1 | secGet/Post/Patch/Del, loadAll, healthCheck |
| 6 | utils.js | 431 | 25 | toast, escP, fmtCHF, capitalizzaNome, helpers |
| 7 | auth.js | 597 | 24 | Login, password, sessioni, biometrico |
| 8 | cestino-core.js | 335 | 7 | Soft delete, ripristino, DB stats |
| 9 | settings.js | 630 | 31 | Visibilità, operatori, temi, campi rapporto |
| 10 | app.js | 361 | 11 | Routing pagine, init, renderPostLogin |
| 11 | diario.js | 861 | 20 | Registrazioni: salva, modifica, elimina |
| 12 | alerts.js | 589 | 16 | Alert cassa, rischio, ammonimenti |
| 13 | search.js | 733 | 5 | Ricerca globale, riepilogo mensile PDF |
| 14 | chat-ui.js | 3138 | 77 | Interfaccia chat stile WhatsApp |
| 15 | moduli.js | 2095 | 56 | Moduli disciplinari, generazione PDF, AI |
| 16 | rapporto.js | 998 | 19 | Rapporto giornaliero, parser assenze/cassa |
| 17 | stats.js | 499 | 7 | Statistiche, grafici Chart.js |
| 18 | consegna.js | 1521 | 24 | Consegne turno, dashboard |
| 19 | promemoria.js | 1006 | 16 | Promemoria, scadenze, push |
| 20 | maison-core.js | 3014 | 47 | Maison: dashboard, costi, form manuale |
| 21 | maison-budget.js | 1150 | 12 | Maison: budget, categorie, profilo |
| 22 | maison-helpers.js | 2862 | 74 | Maison: import Excel, parser nomi |

**Totale: 22 file, ~21.000 righe formattate, 523 funzioni**
