# DIARIO COLLABORATORI · Rapporto delle modifiche v258 → v259 (24/09/2026)

Per ogni voce: **Prima** (come si comportava, con un esempio reale), **Dopo** (come si comporta
ora, con lo stesso esempio). Le sigle [V] indicano che il difetto e' stato verificato sul
codice o sui dati di produzione prima di correggerlo.

Rilascio: GitHub Pages v259, cinque migrazioni applicate al database
(20260865 → 20260869), pacchetto IT e USB aggiornati. Test motore regole: 102 su 102.
Sintassi: 28 file su 28. **Non e' stato possibile provare l'app nel browser da qui**
(estensione non collegata, creazione di sessioni di prova bloccata dal filtro di
sicurezza): i passi di prova per te sono in fondo.

---

## 1 · Salvataggi che dicevano "fatto" senza fare

**[V] Errori del database invisibili**
Prima: se il database rifiutava una scrittura (token scaduto, filtro sbagliato, tabella non
consentita) la funzione tornava `null` in silenzio e l'app mostrava "Registrazione
modificata", "Eliminato", "Salvato". Esempio: telefono e PC aperti insieme, il telefono
rinnova la sessione e butta fuori il PC; sul PC ogni modifica per ore sembrava salvata e non lo era.
Dopo: ogni scrittura protetta (`secPatch`, `secDel`, `setImp`, letture `secGet`) lancia un
errore con il testo del database, che arriva come avviso rosso. Se il token e' scaduto si
rinnova una volta e si riprova; altrimenti "Sessione scaduta: esci e rientra".

**[V] Filtri non tradotti che cancellavano piu' del voluto**
Prima: il traduttore dei filtri conosceva solo `eq, neq, like, lt, lte, gt, gte`; un filtro
`in.(V,C,WD)` o `or=(...)` veniva **scartato** e la query girava senza. "Applica vacanze al
piano" cancellava cosi' TUTTA la bozza generata del mese (turni, CGF, C), anche da "Scambia settimane".
Dopo: `in.(...)` e `is.` sono supportati; qualsiasi altro operatore e' un errore esplicito.
"Applica vacanze" cancella solo V, C e WD generati. Lo storico del piano, che usava `or=`, ora
legge con `ilike` e mostra solo le azioni del piano.

**[V] Bozza: "Bozza generata: 400 turni" a zero righe**
Prima: il numero nel messaggio era quello calcolato, non quello scritto; con la sessione
scaduta le C generate erano gia' state cancellate e il mese restava vuoto. Rispondendo
"Annulla" alla conferma, le C e le vacanze erano gia' state riscritte.
Dopo: il messaggio riporta le celle scritte davvero e segnala quelle gia' esistenti; se il
database non scrive nulla e' un errore; con "Annulla" il mese torna com'era (ripristino
automatico dell'istantanea).

**[V] Annulla / Ripristina perdevano colori, orari e motivi di blocco**
Prima: il ripristino cancellava il mese e lo reinseriva con una funzione che scriveva solo 8
colonne: spariti colori, orari dei JG e dei corsi, motivi di blocco; l'operatore diventava chi
premeva Annulla; se la sessione scadeva fra i due passi il mese restava vuoto.
Dopo: nuova versione della funzione massiva con tutte le colonne; prima di cancellare si
verifica che la sessione sia valida; se il conteggio reinserito non torna, avviso.

**[V] Riporto del saldo ore con data nell'anno precedente**
Prima: un riporto datato 31.12.2025 (la data proposta dal programma) faceva risultare tutti i
mesi del 2026 "gia' compresi nel riporto": saldo 2026 = solo il riporto.
Dopo: il mese conta se finisce dopo la data del riporto, per qualsiasi anno.

**[V] Riposo minimo sbagliato per i turni "oltre le 23" che finiscono prima di mezzanotte**
Prima: un turno 15:00-23:30 aveva il flag "oltre le 23" e veniva trattato come se finisse il
giorno dopo: riposo calcolato −13.5 ore, violazione falsa, la bozza non assegnava mai il giorno accanto.
Dopo: il giorno dopo si aggiunge solo se il turno finisce dopo la mezzanotte (fine ≤ inizio),
in tutti gli 8 punti che replicavano la formula e nel motore regole.

---

## 2 · CGF (recuperi festivi)

**[V] Maturazione su 14 festivi invece di 9**
Prima: ogni festivo cantonale non domenicale dava un recupero. Il foglio Excel conta solo i
nove parificati alla domenica (RAP Allegato 1). Esempio: Bushi Musa 9 maturati nel programma,
6 nell'Excel; Sassi Lucas 6 contro 1. La bozza di novembre aveva 68 CGF automatici di fila (01-02-03).
Dopo: regola `cgf_solo_parificati` (Si, modificabile): San Giuseppe, 1 Maggio, Pentecoste,
Corpus Domini, SS. Pietro e Paolo, Immacolata non danno recupero. La scheda Festivi lo dice
giorno per giorno ("senza CGF: non parificato" / "domenica").

**[V] Recuperi tutti di fila**
Prima: i crediti arretrati andavano nel primo buco, dal giorno 1.
Dopo: regole `cgf_max_mese` (2 per persona al mese), `cgf_distanza_giorni` (5 giorni fra due
recuperi), `cgf_non_con_vacanze` (mai accanto a una V, RAP 4.3); i recuperi del mese vanno nei
giorni dopo il festivo; i crediti arretrati nei giorni con meno fabbisogno. Mai sul compleanno
e mai nei giorni chiusi.

**[V] CGF in malattia contato come goduto**
Prima: il calendario diceva "resta a credito", ma bozza e "Chi ha diritto" lo contavano goduto.
Dopo: una sola contabilita' per bozza, Assegna CGF, Chi ha diritto, Statistiche: riporto +
maturati − goduti, con i CGF in malattia a credito.

**Riporto dall'anno precedente (nuovo)**
Prima: la colonna "riporto 2025" del foglio Excel non esisteva nel programma.
Dopo: scheda Festivi → "Riporto CGF dall'anno precedente": un numero per persona; con il
riporto registrato non si conta piu' l'anno prima.

---

## 3 · Compleanno

**[V]** Prima: la C con nota "Compleanno" la metteva solo il generatore nell'ultimo passaggio,
se la cella era ancora vuota; chi lavorava in due settori non la riceveva mai. Esempio: Tepelus
Simona, 2 novembre 2026, CGF generato sul compleanno senza nota.
Dopo: il compleanno viene prenotato PRIMA di distribuire turni e recuperi, per tutti (anche
multi-settore: la cella e' una sola e si vede in entrambi i piani). Il congedo ha la nota "Compleanno".
Restano da inserire le date di nascita mancanti (Slots 15, Tavoli 60, Cleaning 4).

---

## 4 · Lucchetto e celle protette

**[V]** Prima: le celle importate da Excel erano tutte "protette" (settembre Slots: 1.380 su
1.380) e il menu mostrava "Sblocca questa cella" su celle senza alcun blocco; nessuna cella
mostrava un lucchetto.
Dopo: due concetti distinti. "Bloccata con motivo" = lucchetto rosso SVG nella cella, motivo
visibile al passaggio, "Sblocca" solo li'; scambi turno, cerca cambio e copertura malattia
saltano queste celle. "Protetta" (importazione, vacanze) = nessun lucchetto, si sovrascrive con conferma.

---

## 5 · Cambi turno, coperture, restituzioni

**[V] Restituzione nel mese dopo mai applicata**
Prima: le celle del giorno di restituzione si cercavano solo nel mese aperto; registro, avviso
e PDF dicevano "restituzione programmata", i turni non cambiavano. Esempio: scambio del 28/09
con restituzione il 03/10.
Dopo: le celle si leggono dal database, cross-mese. Chi non aveva nulla riceve C. Se una cella
appartiene a un altro settore o e' bloccata, l'operazione si ferma con la spiegazione.

**Scambio e cerca cambio con i coprenti multi-settore**
Prima: "Cambia turno con..." proponeva anche le celle dell'altro settore dei coprenti; "Cerca
cambio, giorno libero" considerava libero chi lavorava nell'altro settore e ne sovrascriveva la
cella (il settore di origine perdeva la copertura).
Dopo: solo colleghi dello stesso settore; le celle di tutti i settori vengono lette, chi ha
una cella altrove non e' libero; la scrittura si rifiuta se la riga e' di un altro settore.

**Copertura malattia**: la mossa a catena sul giorno prima resta dentro il mese (prima con
il malato al giorno 1 generava la data `2026-09-00` o applicava la catena a meta'); le celle
bloccate con motivo sono escluse; istantanea per Annulla.

**Cambio per esigenze**: rispetta i giorni chiusi e chiede conferma sulle celle bloccate.

**Scambio settimane di vacanza**: controlla i giorni chiusi PRIMA di cancellare le V (prima
cancellava e poi falliva sul reinserimento, lasciando il piano senza vacanze e il programma sul
mese sbagliato); in caso di errore torna al mese di partenza.

**Deroga oltre limite cambi**: registrata solo a scambio fatto (prima anche se poi si annullava).

---

## 6 · Regole del piano

**Scheda Regole in linguaggio semplice**
Prima: righe con nome tecnico, tipo HARD/SOFT/PIPELINE, peso, e 13 regole che nessun punto del
programma leggeva (retaggio del solver) mostrate come attive, mentre regole vere (vacanze,
chiusure, giorni chiusi, CGF) risultavano "non attive, Solver Fase 3".
Dopo: nome in italiano, raggruppate per tema (riposo, domeniche, ore, festivi, vacanze,
ausiliari, funzioni, chiusure, giorni chiusi, congedi), Si/No per gli interruttori, colonna
"Dove agisce", fonte normativa sotto il nome, guida in sei punti dentro la scheda. Le 6 regole
senza effetto sono state tolte; 6 regole di preferenza (blocchi compatti, riposo isolato,
notte-riposo-mattino, equilibrio notti, equilibrio diurni/notturni, congedi attorno alle
vacanze) ora agiscono davvero nella bozza. Descrizioni degli scaglioni vacanze corrette ("in
tutto", non "cumulativi": il calcolo era gia' giusto).

**Per settore**
Prima: "Eccezione per un settore" con due finestre di testo.
Dopo: menu del settore in alto; si cambia il numero nella riga e nasce l'eccezione; "Torna al
generale" la toglie; nella vista generale ogni riga elenca le eccezioni esistenti.

**Controlli prima di salvare (nuovo)**
Prima: qualsiasi valore veniva accettato (anche "abc" o 40 giorni consecutivi).
Dopo: Si/No dove serve, numeri entro limiti di buon senso, liste nel formato giusto; e
controllo di contesto per settore: "L1 e 9 solo a BO e SUP" ai Tavoli (dove L1 e 9 non
esistono) viene rifiutata con la spiegazione; le regole di gruppo verificano gruppo, funzioni e
formato del valore sul settore. Lo stesso per turni (sigla, orari hh:mm, durata 0.5-14),
codici speciali (sigla unica anche rispetto ai turni, ore 0-24), festivi (data valida e non
doppia, ora di chiusura 0-12), impostazioni del piano (ore settimanali 1-60, cambi 0-31,
giorni formazione 1-30, funzioni ancora assegnate a qualcuno chiedono conferma).

**Regola di gruppo "funzioni ammesse"**
Prima: la funzione ammessa non dava mai il permesso (la riga finale bloccava comunque chi non
aveva il gruppo fra i settori).
Dopo: chi ha la funzione fa i turni del gruppo anche senza averlo fra i settori; chi non ce
l'ha deve avere il gruppo fra i settori. Descrizione nella scheda allineata.

---

## 7 · Congedi non pagati (RAP 5.14)

Prima: campo "mesi di congedo non pagato" alimentato dal rilevamento "mese intero di sole C",
che spostava giubilei e scaglioni vacanze anche per congedi brevi: contrario al regolamento
(fino a 6 mesi concordati l'anzianita' non si interrompe) e senza il taglio delle vacanze
oltre 10 giorni.
Dopo: riquadro "Congedi non pagati" nella scheda Collaboratori del Piano: dal/al, motivo,
autorizzato da; controlli su date, sovrapposizioni, motivo; nel piano i giorni diventano
`CNP` (0 ore, protetti) e non contano fra le ore dovute (saldo mese, saldo anno, statistiche,
bozza, YTD); oltre `congedo_np_giorni_vacanze` (10) il diritto vacanze si riduce in
proporzione; oltre `congedo_np_mesi_anzianita` (6) giubilei e scaglioni si spostano di tutta
la durata. Compare anche nella scheda del collaboratore. Il vecchio rilevamento automatico non
registra piu' nulla da solo (solo segnalazione informativa).

---

## 8 · Sicurezza

**[V] Sessione ottenibile con il solo nome**
Prima: `create_bio_session(nome)` rilasciava una sessione (anche admin) a chiunque avesse la
chiave pubblica del sito; il rinnovo automatico usava la stessa strada.
Dopo: rinnovo con il token esistente (`renew_op_session`); accesso biometrico con un segreto
del dispositivo creato all'attivazione e verificato dal server (impronta), con limite
tentativi; la vecchia funzione e' stata eliminata. **Lo sblocco biometrico va riattivato una
volta** dalle Impostazioni su ogni dispositivo.

**[V] Una sola sessione per operatore**
Prima: ogni rinnovo cancellava le sessioni dell'operatore su tutti i dispositivi.
Dopo: piu' sessioni (fino a 8), si tolgono solo quelle scadute.

**[V] Permessi solo nel browser**
Prima: chi impostava `is_admin` nella console salvava visibilita', profili, settori, punti.
Dopo: il server accetta le impostazioni di configurazione solo da una sessione amministratore
(elenco di 40 chiavi); cancellare il registro attivita' e' solo admin; in piu' 30 funzioni
JS di HR, formazione, Maison, cestino e impostazioni controllano il permesso prima di scrivere.

**[V] Dati personali all'AI (Groq)**
Prima: nome del collaboratore nel prompt e foto allegata.
Dopo: i nomi dell'anagrafica diventano `[COLLABORATORE]` prima dell'invio e tornano nella
risposta; la foto non viene piu' inviata ("resta locale").

**Iniezioni negli attributi**: `escP` converte anche virgolette e apostrofi; i bottoni con
dati inline (verifica nome, follow-up) usano handler veri: un nome con apostrofo (D'Amico) non
blocca piu' il salvataggio del Diario.

---

## 9 · Piano: altre correzioni

- Bozza: i giorni chiusi non vengono toccati; V, M, CGF contano ore anche per la bozza (chi
  ha 10 giorni di V non riceve turni fino all'obiettivo pieno).
- Domeniche libere: un solo criterio (vacanza e malattia fuori dal conteggio) in validatore,
  tabella Domeniche e Benessere; il mese conta per la persona solo se ha un piano in quel mese.
- Recupero ore: filtrato per settore (prima sommava tutti i settori e poteva troncare a 5.000
  righe) e bloccato sui mesi chiusi come il saldo.
- Statistiche anno e confronto timbrature: ore effettive con chiusure tardi e orari
  personalizzati, come Calendario e Saldo (prima durata fissa del turno).
- Malattia corretta "il X (1 giorno)" dal Diario: ora il piano la capisce (un solo parser);
  accorciare una registrazione di un range non cancella le M coperte dalle altre.
- Corso inserito nel piano: vede le celle di tutti i settori, non si interrompe a meta',
  rispetta i giorni chiusi.
- Incolla, cancella selezione, nota rapida: rispettano i giorni chiusi.
- Briefing: il salvataggio resta agganciato al giorno delle righe (cambiando giorno subito
  dopo una modifica non finiva sul giorno sbagliato); i numeri cassa scritti a mano non vengono
  piu' sovrascritti dalla rotazione (il flag viene salvato); nel foglio pause i numeri cassa
  delle coppie seguono le impostazioni, non 3/4 e 2/7 fissi.
- Festivita': il campo "Chiusura" scritto nella scheda ora ha effetto sull'orario della vigilia.
- "Elimina tutte le vacanze" cancella solo il settore aperto.
- Date "oggi" in ora locale (il 1 del mese fra mezzanotte e le 2 apriva il mese prima).
- Cancella piano: conteggio senza le celle degli altri settori.
- Sigla sbagliata nella cella: avviso rosso con la sigla piu' vicina e cella che lampeggia (v258).

## 10 · HR, Maison, nucleo (dettaglio nelle sezioni dei revisori)

HR: ristampa PDF con firme (attesa reale del caricamento), anteprima moduli in cronologia e
"Recidiva" (leggono i campi dentro `dati`), giubilei ≥ 1'000 CHF contati (apostrofo
tipografico), livelli oltre L3 in tutti i contatori, Versatilita' sulla scala del settore,
malattie in giorni ovunque, scheda = PDF = grafico, riattiva collaboratore con record vero,
premio con incentivi spenti non registrato, popup copertura con data fine, admin gruppi chat.
Maison: ripartizione costo/buoni corretta (Aili 40 e Bertaggia 320 su 360, non 360 e 0),
budget "questo mese" uguale in quattro schermate, cache rapporto per settore, pareggio buoni
uno a uno, consegne lette solo con "Letta", "Fatto" senza doppioni, righe legacy senza
settore, scheda cliente senza filtri ereditati, parser assenze per nome con plurali, import
compleanni senza sovrascritture, CSV categorie, ripetitivi di fine mese, escape degli onclick.
Nucleo: caricamento dati con errore visibile e cache conservate, `operatori_reparto` scritta
solo da admin e solo da server, biometrico con credenziale verificata, uscita che attende
l'invalidazione, banner scadenze di oggi, controllo salute con nomi vuoti, CSS dinamico sicuro.

---

## 11 · Cosa provare tu (in questo ordine)

1. Apri il programma, esci e rientra con la password (nuove sessioni). Attiva di nuovo lo
   sblocco biometrico da Impostazioni e prova ad accedere con quello.
2. Piano → Regole: scegli "Tavoli" nel menu, prova a mettere Si a "I turni L1 e 9 solo a Back
   Office e Supervisor": deve rifiutare con l'avviso. Cambia "Ore minime di riposo" a 12 per
   Tavoli: deve comparire "eccezione"; "Torna al generale" la toglie.
3. Piano → Festivi: controlla che i sei festivi non parificati dicano "senza CGF"; premi "Chi ha
   diritto a un recupero" e confronta con il foglio Excel; inserisci i riporti 2026 (Sapio −2,
   Peraino +1).
4. Calendario novembre 2026 (Slots): "Cancella piano" (solo generate) e "Genera bozza": i CGF
   non devono piu' essere di fila e non piu' di 2 a persona; Tepelus il 2/11 deve avere C
   "Compleanno".
5. Tasto destro su una cella importata: deve dire "Blocca questa cella (con motivo)"; bloccala
   con "visita medica": lucchetto rosso; "Cambia turno con..." su quella cella deve rifiutare.
6. Scambio turno con restituzione nel mese dopo: controlla le due celle di ottobre.
7. Collaboratori → Congedi non pagati: registra un congedo di 3 giorni a un collaboratore di
   prova, guarda le celle CNP nel piano e il saldo del mese, poi eliminalo.
8. Scrivi una sigla sbagliata in una cella: avviso rosso e cella che lampeggia.
9. Da operatore non admin: prova a cambiare una visibilita' dalla console (deve fallire con
   "riservata all amministratore") e a salvare una regola.
10. Maison: importa una riga "A BL / B" da 360 CHF e controlla le quote.

Se una prova non torna, scrivimi cosa hai visto: il Registro attivita' e gli avvisi rossi
riportano il testo dell'errore del database, che serve per la diagnosi.
