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

---

## 12 · Aggiunte v260 e v261 (24/09 sera)

**CGF: solo passato e mese aperto, festivo in malattia, recuperi in piu' tolti (v260)**
Prima: i CGF gia' pianificati nei mesi futuri contavano come goduti; un festivo con turno in
cella ma malattia quel giorno contava come lavorato; un recupero dato in anticipo per un
festivo poi saltato restava.
Dopo: bozza, "Assegna i CGF", "Chi ha diritto" e Statistiche contano solo fino alla fine del
mese aperto; il festivo matura solo se lavorato davvero (turno e nessuna malattia); i CGF
automatici in piu' tornano C con la nota "CGF tolto: festivo non lavorato" (dalla bozza, da
"Assegna i CGF" con conferma, dalla correzione della malattia nel Diario e scrivendo M nella
cella). Esempio: Mario lavora il 25 ottobre, la bozza gli mette il CGF dopo il 25; se il 25
si ammala, il CGF diventa C.

**Blocco su cella vuota e sblocco con la malattia (v260)**
Prima: "Blocca" chiedeva di scrivere prima un turno; il blocco restava anche se la persona si
ammalava.
Dopo: bloccare un giorno vuoto crea un congedo C bloccato (lucchetto, motivo visibile,
saltato da scambi e coperture); la M scritta nella cella o arrivata dal Diario scioglie il
blocco.

**Regole "chi fa cosa" per settore (v260)**
Prima: tre regole con le sigle degli Slots scritte fisse nel programma (L1/9 solo BO e SUP,
SUP solo Z lun-gio, Z e S ven-sab), inutilizzabili altrove.
Dopo: due tipi nuovi di regola di gruppo, creabili per ogni settore con le proprie sigle:
"Turni riservati a certe funzioni" (`L1,9:BO,SUP,RESP`) e "Una funzione fa solo certi turni,
per giorno" (`SUP:Z*,L1,9:0,1,2,3`). Le tre regole degli Slots sono state convertite in
automatico. Valgono nel validatore, nella bozza, nei cambi e come avviso nella scrittura
manuale; gruppo, funzioni e sigle vengono verificati sul settore; la scheda ha la guida con
gli esempi e i tipi hanno nomi in italiano. Test motore: 112.

**Restyle (v261)**
Impostazioni: indice fisso in cima con i gruppi Registrazioni, Persone e accessi, Maison,
Personale, Sistema; etichette di gruppo fra le sezioni; salto alla sezione con evidenziazione.
Briefing: barra dei comandi in tre gruppi (Giorno, Azioni, Formato) con etichette, frecce
coerenti. Nessun cambiamento di comportamento.

**Funzioni che fanno tutto (v262)**
Prima: la regola "SUP solo turni Z da lunedi a giovedi" bloccava (o avvisava) anche chi
scriveva a mano un turno di cassa a un Supervisor.
Dopo: regola `funzioni_fanno_tutto` (predefinita SUP,RESP, scheda Regole, gruppo Funzioni e
turni): a mano queste funzioni sono idonee a ogni gruppo e a ogni turno, come in Formazione il
livello alto comprende quelli sotto; niente avvisi nel validatore, nei cambi e nelle
coperture. Le preferenze personali (solo diurni, turni bloccati) restano. La bozza automatica
continua a rispettare le regole del settore. Test motore: 115.

**Bozza: passata di riparazione (v263)**
Prima: la bozza decideva un giorno alla volta senza tornare indietro: un posto restava scoperto
anche quando bastava spostare un turno.
Dopo: per ogni scoperto la bozza cerca A (assegnato da questa bozza lo stesso giorno, idoneo al
posto scoperto) e B (libero, idoneo al turno di A): A passa al posto scoperto, B prende il turno
di A, con tutte le regole controllate per entrambi. Il messaggio di conferma dice quanti scoperti
sono stati risolti cosi'. Il controllo di idoneita' della bozza e' ora una funzione unica.

**Solver esterno pronto da collegare (v263)**
Prima: il solver OR-Tools esisteva solo come script da lanciare a mano sul server.
Dopo: `IT/solver/server_solver.py` (servizio HTTP con verifica del token di sessione sul
database) e il pulsante "Genera con il solver" nel Piano, che compare quando in Piano ·
Impostazioni c'e' l'indirizzo del servizio. Istruzioni per l'IT in `IT/solver/README_SOLVER.md`.
Senza servizio resta la bozza integrata.

**Questionario di verifica e scheda permessi (v263)**
`QUESTIONARIO_VERIFICA_REGOLE_v262.html`: 400 voci Vero / Falso / Non so con nota, in quattro
blocchi (HR e paghe; Responsabile e Supervisor; Compliance con matrice 60 voci e tabella dei dati
personali; formazione, disciplinari, Maison, sicurezza), compilabile senza internet, salva il file
delle risposte, stampabile. Generato da `strumenti/genera_questionario.py` dai dati reali.
`SCHEDA_PERMESSI_ATTUALI.html` e il pulsante "Stampa scheda permessi" in Impostazioni: lo stato
reale dei permessi, operatore per operatore.

**Malattia dal Diario allinea subito il piano (v264)**
Prima: una malattia registrata dal Diario mostrava la M automatica solo nelle celle vuote; dove
c era un turno la cella restava con il turno e le sue ore finche qualcuno non usava "Copertura
malattia" o scriveva M; l allineamento scattava solo correggendo la registrazione, e in quel caso
trasformava in M anche le C.
Dopo: alla registrazione (un giorno o un periodo) e alla correzione, i giorni con un turno
diventano M protetta (8.787 ore, nota "era C0"), i giorni C restano C e si vedono come MC
(0 ore), i CGF restano a credito (MCG), i recuperi automatici in piu tornano C. Esempio:
malattia 1-10 con turni 1-7 e C 8-10: sette M, tre MC, la scheda conta 10 giorni.
Questionario rigenerato (v264, 399 voci) senza le voci su accesso da telefono e biometrico.

**Turni per funzione (mappature) per settore (v265)**
Prima: le mappature funzione → turno erano uniche per tutto il programma e citavano solo sigle
degli Slots; un Supervisor dei Tavoli non risultava idoneo a nessun turno dei Tavoli.
Dopo: ogni settore ha le sue mappature (le 26 esistenti restano agli Slots); il turno si sceglie
da una tendina con le sigle del settore; una sigla inesistente o una mappatura doppia viene
rifiutata con avviso; ogni modifica finisce nell elenco delle modifiche e nel Registro.

## v269 · Restyle Impostazioni, barra calendario, briefing, documenti da firmare

### Impostazioni (nessun cambio di comportamento: stessi id, stesse funzioni)
- **Prima**: ogni sezione aveva un aspetto diverso (pulsanti con stili scritti a mano, descrizioni lunghe dentro le liste, form disallineati, "Pwd" e "Rimuovi" con colori diversi da sezione a sezione).
- **Dopo**: tutte le 17 sezioni usano gli stessi componenti: intestazione con titolo e descrizione breve, elenco a righe uguali, modulo di inserimento su sfondo chiaro con etichette allineate, tre soli tipi di pulsante (principale scuro, secondario chiaro, "Rimuovi" in rosso). La sezione Visibilita e permessi usa un menu a tendina per voce al posto dei quattro pallini, con i nomi degli operatori che compaiono solo con "Operatori selezionati". Il campo modello "Foto" dell assistente AI e nascosto (le foto non vengono inviate).
- Esempio: Operatori: la riga "Mario Rossi · Slots · Con password · Accessi extra · [settore] · Nuova password · Rimuovi" ha ora lo stesso aspetto della riga dei Tipi di evento.

### Piano · Calendario
- **Prima**: due righe di pulsanti tutti uguali, senza distinzione fra cio che pianifica, controlla o esporta.
- **Dopo**: riga 1 = navigazione (mese, settore, annulla/ripristina, salvataggio automatico, ricerca). Riga 2 = quattro gruppi etichettati come nel menu delle schede: Pianifica (Genera bozza, Genera con il solver, Completa con coperture, Migliora ore), Controlla (Valida regole, Copertura malattia), Strumenti (Ordine predefinito, Colora, Cancella piano in rosso), Esporta (Copia per Excel, Stampa PDF, Importa piano). Stessi pulsanti, stesse funzioni.

### Piano · Briefing
- Pulsanti della barra tutti della stessa misura; "Compila dal piano" evidenziato come azione principale; "Aggiorna numeri cassa" spostato dentro il gruppo Azioni (prima era fuori dai gruppi).

### Questionario e scheda permessi
- Le caselle Nome e Data si toccavano (nella scheda mancava la regola di dimensionamento dei campi): corretto in entrambi i documenti, con piu spazio fra le caselle e i pulsanti "Cancella firma" e "Togli firmatario" sotto la firma invece che sopra.
- Stampa rivista: formato A4 verticale per il questionario e A4 orizzontale per la scheda (tabella larga), colori delle risposte mantenuti, intestazioni delle tabelle ripetute su ogni pagina, blocchi firma mai spezzati fra due pagine, note lunghe stampate per intero, la voce "scegli" non viene stampata se non si e scelto il firmatario.
- Il questionario ha gia un blocco firme alla fine di ogni blocco (HR, Responsabile/Supervisor, Compliance, Tutti) piu uno per le osservazioni generali; la scheda permessi ha tre blocchi firme (Compliance, HR, Direzione/Responsabile).

### Privacy del repository pubblico
- Il questionario, la scheda permessi (con i nomi degli operatori) e i dati esportati erano finiti nel repository GitHub, che e pubblico. Da questa versione sono esclusi dal repository (restano in locale, su USB e nella cartella IT). Sono ancora nella cronologia git delle versioni precedenti: per toglierli del tutto serve riscrivere la cronologia, da decidere.

## v270 · Regole pause create e modificate per settore

- **Prima**: sotto le pause del briefing c erano solo caselle fisse (minuti per fascia 6-7/7-9/9+ ore, composizione per turno, e solo per il Valet distanza minima, fascia di punta e nota). Nessuna regola nuova possibile, nessuna guida.
- **Dopo**: pannello "Regole pause · settore" con l elenco delle regole in parole semplici, Modifica ed Elimina, Nuova regola con sei tipi: pause per durata del turno, pause di un turno preciso, distanza minima, fascia senza pause, persone in pausa insieme, nota in fondo al foglio. Le regole per durata e per turno possono valere solo in certi giorni (Lun-Gio, Ven-Sab, Dom, con pulsanti rapidi): la regola con i giorni vince su quella senza, e la regola per turno vince su quella per durata.
- Le regole attuali di Slots e Valet compaiono gia come righe (ricavate dai vecchi valori): finche non si tocca nulla le pause escono identiche a prima. "Ripristina regole di partenza" riporta il settore alle regole iniziali.
- Ogni regola viene controllata al salvataggio: sigla inesistente nel settore, ore invertite, orario scritto male, numero fuori scala bloccano; sovrapposizioni fra regole e regole che negli Slots possono solo segnalare (fascia, persone insieme) avvisano prima di salvare.
- La tabella "turni, orari e pause che risultano" mostra per il giorno del briefing le pause di ogni turno e da quale regola vengono.
- Slots: gli schemi di copertura (BG1, Q2, BG3) restano identici; le regole decidono quante pause e quanto lunghe e la distanza minima nelle pause automatiche. Fascia, distanza e persone insieme vengono verificate sul foglio generato e le violazioni elencate in giallo sotto le pause. Valet e altri settori: le regole guidano direttamente la generazione (fasce per giorno, massimo N insieme, distanza).
- Esempio: regola "Turni da 7 a 9 ore, venerdi-sabato: 30+15+15" e "Turno S3, domenica: 15+15" → mercoledi S3 fa 30+15, sabato 30+15+15, domenica 15+15.
- Test automatici: `node test/pause-regole.test.js` (31 controlli).

## v271 · Profili personalizzati (Visibilita e permessi)

- **Prima**: cinque profili fissi nel codice (Direzione, Responsabile FoBoSlot, Sostituto, Supervisor, HR). Per una figura diversa, per esempio Compliance, bisognava lasciare "Nessun profilo" e regolare le voci una per una.
- **Dopo**: blocco "Profili personalizzati" sotto i profili: nome del nuovo profilo, "Parti da una copia di" (uno dei cinque fissi, un altro personalizzato, oppure tutto a No), poi la tabella con tutte le voci del programma divise per gruppo (Pagine, Funzioni, Piano schede visibili, Piano schede modificabili, Permessi) e per ognuna Modifica, Vede o No. Dove la sola vista non ha senso (modifica delle schede del Piano, permessi di modifica) le scelte sono solo Modifica o No.
- Il profilo salvato compare nel menu di ogni operatore con la dicitura "(personalizzato)", "Applica i profili" lo tratta come gli altri, la scheda permessi stampata dal programma e quella generata per la firma lo mostrano con il suo nome. I cinque profili del documento firmato restano intoccabili.
- Eliminando un profilo assegnato a qualcuno, il programma lo dice e toglie l assegnazione: i permessi attuali di quelle persone non cambiano finche non si preme "Applica i profili".
- Controlli: nome obbligatorio e unico; un profilo che non concede nulla chiede conferma.
- Sicurezza: la nuova impostazione `profili_custom` si salva solo da sessione amministratore (migrazione 20260873, applicata).
- Esempio: "Compliance" partendo da HR, poi Storico HR = Vede, Moduli = Vede, Piano = No. Assegnato all operatore X, Applica i profili → X vede Storico HR e Moduli in sola lettura e non vede il Piano.

## v272 · Nuovo operatore: posizione, copia accessi da un collega, nuovo profilo

- **Prima**: si creava l operatore con nome, password e settore; poi bisognava andare in Visibilita e permessi, assegnare il profilo e premere "Applica i profili", oppure spuntarlo voce per voce.
- **Dopo**: nel modulo di creazione c e la casella "Posizione e permessi" con tre possibilita:
  - un profilo (fisso o personalizzato): viene assegnato e applicato subito, solo a quell operatore, senza toccare gli altri;
  - "Come [collega]": copia profilo, accessi extra e presenza in tutte le voci "Operatori selezionati" del collega; se il settore e lasciato su "Tutti i settori" prende quello del collega;
  - "Nuovo profilo personalizzato": crea l operatore, apre subito la tabella del profilo e, al salvataggio, lo assegna e lo applica all operatore appena creato.
- Il pulsante "Applica i profili" ora usa lo stesso nucleo (applicazione a un elenco di operatori): comportamento invariato per chi lo usava.
- Esempio: nuovo operatore "Neri", Posizione = "Come Rossi" → Neri ha lo stesso settore, profilo, accessi extra e voci di Rossi. Oppure Posizione = "Supervisor" → Neri riceve subito i permessi del profilo Supervisor.

## v273 · Impostazioni a schede

- **Prima**: tutte le 17 sezioni una sotto l altra, con un indice di chip che faceva solo saltare alla sezione.
- **Dopo**: cinque schede in testa (Registrazioni, Persone e accessi, Maison, Personale, Sistema) con il numero di sezioni; si vede solo il gruppo scelto, sotto le schede restano le chip delle sue sezioni. Il programma ricorda l ultima scheda aperta. I collegamenti interni (per esempio "Nuovo profilo personalizzato" dalla creazione di un operatore) aprono da soli la scheda giusta. Un operatore non admin vede solo le schede con sezioni a lui accessibili.

## v274 · Tabella del profilo personalizzato: "Parti da una copia di"
- Nella tabella del profilo (anche quando si apre dalla creazione di un operatore) una casella "Parti da una copia di" con i profili fissi e personalizzati e i permessi reali di ogni operatore ("Come Rossi"). "Riempi la tabella" compila le caselle; poi si cambia quello che serve e si salva. I permessi reali di un operatore diventano Modifica dove ha accesso, Vede per le viste riservate, No altrove.

## v275 · Regola di partenza delle pause corretta
- Slots: la regola di partenza per durata e ora 6 ore = 15+15, 7 ore = 30+15, da 8 ore in su = 30+15+15 (prima i turni di 8 ore risultavano 30+15 nelle pause extra e nella tabella; gli schemi fissi dell Excel avevano gia le pause giuste e non sono cambiati). Valet invariato (era gia cosi).
- Dicitura delle fasce senza ambiguita: "Turni di 7 ore", "Turni da 8 ore in su", "Turni da 6 a meno di 8 ore". Nel modulo: "Turni da almeno X ore e meno di Y ore".

## v276 · La malattia prevale su ogni sigla (V, CGF, JG, C)

- **Prima**: la malattia registrata nel Diario trasformava in M solo i giorni con un turno. V restava V (e contava come vacanza goduta), C e CGF restavano e si vedevano come MC e MCG.
- **Dopo**: ogni cella del periodo di malattia diventa M protetta, qualunque sigla avesse (turno, V, CGF, JG, C, cella bloccata con motivo). La sigla coperta resta nel commento ("Malattia dal Diario · era V"). Effetti: il giorno di vacanza torna disponibile, il CGF resta a credito, il turno perso conta come malattia (8.787 ore).
- **Se la malattia viene tolta o accorciata dal Diario**, la sigla coperta torna al suo posto (prima la cella veniva semplicemente cancellata e il turno andava perso).
- **Scheda Vacanze**: nuova colonna "Restituite per malattia" e "Restano" la tiene conto (spettanti - pianificate + restituite).
- Regola di riferimento: CO art. 329c e prassi dei RAP (malattia con certificato durante le vacanze: i giorni non contano come vacanza). Il programma non chiede il certificato: e la registrazione della malattia nel Diario a fare fede.
- Questionario rigenerato (v276) con le tre voci aggiornate.

## v277 · Scheda Crediti, riepilogo nella scheda collaboratore, compleanno e celle bloccate riservate

- **Scheda Crediti** (Piano, gruppo Gestione): una riga per collaboratore del settore con vacanze spettanti, pianificate, restituite per malattia e quante restano; CGF riporto, maturati, goduti e quanti restano (fino alla fine del mese aperto); saldo ore dell anno (pulsante Calcola, come nella scheda Saldo); recupero ore del mese aperto; giorni di congedo non pagato. Clic sulla riga = dettaglio con la provenienza di ogni numero; Stampa = foglio A4 orizzontale. Stessi numeri delle schede Vacanze, Festivi, Saldo e Recupero ore: nessun calcolo nuovo.
- **Permesso** "Piano · Crediti" in Visibilita e permessi (matrice: Direzione vede, Responsabile e Sostituto modificano, Supervisor vede, HR modifica). Chi non ce l ha non vede la scheda ne la riga nella scheda del collaboratore.
- **Scheda collaboratore**: riga "Crediti: vacanze restano N, CGF restano N, saldo ore, congedo non pagato" in fondo ai dati personali.
- **Compleanno e celle bloccate riservate**: il congedo del compleanno (C con commento Compleanno) e le celle bloccate con motivo non vengono piu proposti come sostituti nella copertura malattia, negli scambi con restituzione, nella catena sul giorno prima ne nel cambio per esigenze. Prima il compleanno contava come giorno libero qualsiasi.
- Questionario rigenerato (v277, 404 voci) e scheda permessi rigenerata con la voce Piano · Crediti; guida aggiornata (capitolo "Piano: crediti").

## v278 · Verifica incrociata della scheda Crediti (fatta con codice e dati veri)
- Nuovo banco di prova `strumenti/verifica_crediti.js` (con `strumenti/esporta_dati_verifica.py`): carica il codice vero del Piano in Node sopra i dati veri esportati dal database e confronta, per ogni settore e collaboratore, la scheda Crediti con le schede Vacanze, Festivi e Saldo. Risultato del 25/09/2026: 224 confronti uguali, 0 differenze (Slots 45, Tavoli 61, Valet 10, Cleaning 5 collaboratori).
- Correzione trovata dalla verifica: due collaboratori Slots con impiego "fisso" ma vecchio contrassegno "jolly" attivo comparivano nella scheda Vacanze ma non nei Crediti. Ora Crediti usa lo stesso criterio della scheda Vacanze (vale il campo impiego).
- Rilevato per il titolare: nessun collaboratore di Tavoli e Valet ha la data di assunzione nella scheda, quindi vacanze spettanti non calcolabili per quei settori; due schede Slots (impiego fisso + contrassegno jolly) sono incoerenti e Saldo e Recupero ore le trattano ancora da ausiliari.

## v279 · Backup completo con tutte le tabelle del Piano; pacchetto IT rifatto
- **Backup**: il backup completo (Impostazioni > Sistema) non includeva sei tabelle nate a settembre: piano_ore_mese, piano_festivita, piano_recupero_ore, piano_saldo_iniziale, piano_cgf_riporto, collab_congedi_np. Ora ci sono, e lo script di import del pacchetto IT le conosce. Trovato controllando il pacchetto IT.
- **Pacchetto IT (cartella IT)** rimesso in ordine: LEGGIMI del 25/09 con la mappa di tutto il contenuto e "da dove cominciare"; AGGIORNAMENTO_DA_APRILE con l elenco completo delle migrazioni fino alla 20260873; nuovo NOVITA_SETTEMBRE_2026.txt (elenco tecnico: migrazioni, chiavi, moduli, sicurezza, solver, test); Guida_Migrazione con la sezione Novita e i numeri aggiornati; Documentazione_Tecnica_Sicurezza con la sezione "Aggiornamento settembre 2026"; backup del 25/09 (46 tabelle); js/README.md rigenerato (28 moduli con righe reali); documenti (questionario v277, scheda permessi, profili) nella cartella Documenti con le versioni vecchie in archivio; tolti file di lavoro, cache Python, copie stantie e il documento di passaggio fra sessioni.

## v280 · Piano di lavoro diviso in dieci file
- `js/piano.js` (19.976 righe) e stato diviso, senza cambiare una riga di logica, in dieci file che si caricano in sequenza nello stesso ordine di prima: piano-core (nucleo e griglia), piano-genera (validatore e bozza), piano-config (regole, fabbisogni, turni, codici, festivi), piano-gestione (benessere, settore, recupero ore, chiusure, CGF, congedi), piano-cambi (Excel, PDF, cambi turno, copertura malattia), piano-schede (timbrature, statistiche, vacanze, saldo, export HR), piano-impostazioni (mappature, solver, formulari), piano-celle (menu tasto destro, modifica rapida, stampa singolo), piano-briefing-ui (briefing e corsi), piano-extra (copia/incolla, annulla, trova, migliora ore, formazione, crediti).
- Verifica: sintassi di ogni file, 115 + 33 test automatici, verifica incrociata Crediti/Vacanze/Festivi/Saldo con i dieci file caricati nell ordine di index.html sopra i dati veri (224 confronti, 0 differenze). Service worker e pacchetto IT aggiornati; per chi aggiorna un installazione esistente il vecchio js/piano.js va tolto.
- Le modifiche future al Piano si fanno nel file dell area interessata; il README dei moduli descrive ognuno.

## v281 · Moduli: un modulo nuovo non sovrascrive piu quello aperto prima
- **Difetto** (presente anche nel vecchio Diario in uso al casino): con un modulo salvato aperto a video, per esempio un allineamento, premere "Nuovo RDI" senza prima Annulla lasciava il programma in modalita modifica: il PDF dell RDI veniva generato, ma il contenuto veniva salvato sopra l allineamento, che restava di tipo allineamento.
- **Correzione alla radice**: ogni apertura di un modulo nuovo azzera lo stato di modifica (id, snapshot, file importato, foto). Seconda barriera al salvataggio: un modulo esistente si aggiorna solo se e dello stesso tipo di quello a video, altrimenti si crea un record nuovo.
- Guida e questionario (v281, 405 voci) aggiornati.
- Esempio: allineamento del 3.9 aperto dall elenco, poi Nuovo RDI compilato e generato: in elenco restano l allineamento del 3.9 intatto e un RDI nuovo.
