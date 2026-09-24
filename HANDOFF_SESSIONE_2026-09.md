# DIARIO COLLABORATORI · passaggio di consegne

**Aggiornato al 24/09/2026** · versione in produzione **v257** · ultimo commit `55041d0`

Questo documento serve ad aprire una sessione nuova senza perdere niente.
Contiene: dove sono i file, cosa è stato fatto, cosa resta aperto, come si rilascia,
com'è fatto il pacchetto per l'IT e cosa va sistemato prima di consegnarlo.

---

## 1 · DOVE SONO LE COSE

### Il progetto
```
/Users/bushi/Desktop/DiarioCollaboratori/          ← cartella di lavoro (git)
├── index.html                    la pagina (~1.100 righe, solo struttura)
├── sw.js                         service worker · CACHE_NAME = versione (oggi v257)
├── manifest.json, icon-*.png     PWA
├── css/style.css
├── js/                           28 file · 54.301 righe · ordine in js/README.md
├── libs/                         librerie locali (Excel, PDF, grafici, QR)
├── supabase/
│   ├── migrations/               71 file .sql in ordine cronologico
│   └── functions/send-push/      Edge Function notifiche push
├── test/piano-regole.test.js     97 test del motore regole (node test/...)
├── IT/                           PACCHETTO PER L'IT (gitignored, vedi §6)
├── backups/                      7 backup JSON di aprile 2026 (storici)
├── _archive/                     8 .sql vecchi pre-migrazioni (storici)
├── _dati_turnivo/                39 script di lavoro usati per importare i dati
├── index.html.backup_pre_split   IL VECCHIO DIARIO MONOLITICO (826 KB, 25/04/2026)
├── CREDENZIALI_LOCALI.md         password e chiavi (NON nel git)
└── .supabase_db_password.txt     password database (NON nel git)
```

### I file vecchi del Diario
- **`index.html.backup_pre_split`** — il Diario com'era **prima dello split di aprile**:
  tutto in un unico file da ~8.200 righe. Conservato apposta.
- **`_archive/`** — gli 8 script SQL usati prima che esistessero le migrazioni
  (`migrate.sql`, `schema.sql`, `migrate_security*.sql`...). Servirono a ricostruire
  lo schema dopo la cancellazione del vecchio progetto Supabase.
- **`backups/`** — 7 backup JSON di aprile 2026, incluso
  `backup_PRE_REFACTOR_2026-04-11_01-18-47.json`.

### Documenti di lavoro (fuori dal progetto) — POSIZIONI NUOVE

⚠️ **Il 21/09 le cartelle sono state riordinate.** `PIANI CASINO` non esiste più sul
Desktop: ora è `Casino Lugano/Piani casino`. Registro completo degli spostamenti in
`Desktop/_Registro pulizia Desktop 2026-09-21.csv` (cercare la riga `sposta;PIANI CASINO;...`).

Tutto quello che riguarda il casinò sta sotto **`/Users/bushi/Desktop/Casino Lugano/`**:

```
Casino Lugano/
├── Documenti/                        (10 file)
│   ├── PIANO SLOTS 2026.xlsx              ← IL PIANO EXCEL DI RIFERIMENTO (4,4 MB)
│   │                                        fogli: 12 mesi + 12 REC ORE + Saldo Ore +
│   │                                        VACANZE + CGF + DOMENICHE + ASSENZE + SAB…
│   ├── diario_backup_2026-09-09.json      backup del 09/09 (18 MB) · più recente di
│   │                                        quello nel pacchetto IT
│   ├── Note_Incontro_Direttore.pdf
│   ├── Progetto_Multidisciplinarita_Direttore.pdf
│   ├── ACCOGLIENZA LEONE.xlsx, Relazione carico kiosk.docx
│   └── immagini (cl.webp, Gold_Coast_Slot_Map.jpg…)
│
├── Piani casino/                     (82 file) ← ex "PIANI CASINO"
│   ├── PIANO SLOTS 2025.XLSX, PIANO AUTO.xlsm
│   ├── CONTROLLO PIANO SLOT AUTO NEW.xlsm, CONTROLLO PIANO VALET AUTO NEW.xlsm
│   ├── Maison slots.xlsx, LISTA MAISON.xlsx, COMPLEANNI MAISON.xlsx
│   ├── BRIEFING 2024.xlsx, PAUSE.xlsx, S22.xlsx, Marzo 2026.xlsx
│   ├── FORMULARIO RISTORANTE GENNAIO/FEBBRAIO/MARZO 26.xlsx
│   ├── Casino_Lugano_Manuale_Regole.pdf, Turnivo_Manuale_Programma.pdf
│   ├── FORMULARI FORMAZIONE SALA, CASSA, REC/
│   ├── template Casino Lugano/            casino_lugano_completo/slots/valet.json
│   ├── VALUTAZIONI/Valutazioni 2026/      schede HR .xlsx per collaboratore +
│   │                                      "2024-Scheda di valutazione Foboslot_DEF.xlsx"
│   │                                      (il formato ufficiale) + PROPOSTA 2026 con
│   │                                      Versatilità e Affidabilità
│   └── WORKSHOP STRATEGICO 2026-29/
│       ├── Modello per proposta di obiettivi strategici (.docx + .pdf)
│       ├── SWOT Terrestre / SWOT Online / Quote di mercato Verband CH /
│       │   Ticino quote 2003-2025 / S4W Snapshot mercato online /
│       │   workshop_casino_lugano_COMPLETO.pdf
│       ├── Secondo corso/
│       │   ├── Brief Workshop 26.05-09.06.pptx      ruoli PM e Portfolio Manager
│       │   ├── Template Progetti Semplici.pptx      modelli vuoti
│       │   ├── Template Progetti Complessi.pptx
│       │   ├── 000 - Strategia CLSA - Portafoglio progettuale.pdf
│       │   └── Template completati/                 ← I TUOI, COMPILATI
│       │       ├── Template Semplice Bushiv CLSA.pptx
│       │       ├── Template Complesso Bushi CLSA.pptx
│       │       ├── Progetto Multidisciplinarita per Paolo.pdf
│       │       └── Note Incontro Direttore.pdf
│       └── Presentazione Hr e aggiunte It/
│           ├── 1_Diario_Collaboratori_panoramica.pdf
│           ├── 2_Accessi_HR_da_definire.pdf
│           ├── 3_Nuove_voci_valutazione.pdf
│           ├── 4_Aggiunte_recenti_per_IT.pdf
│           ├── COMPLEANNI/       Lista compleanni-Foboslot & VP 2025.xlsx
│           ├── INIZIO ATTIVITA COLLABOTRATORI/
│           │   ├── 07Hlavo - Foboslot-LUGLIO.xlsx   date assunzione Slot
│           │   └── 07Hlavo - Pulizie.xlsx           date assunzione Cleaning (importate)
│           ├── ORE HTEO 2026/    07Hlavo - Foboslot-LUGLIO.xlsx
│           ├── RAP E REGOLAMENTO/
│           │   ├── RAP versione 3.0_01.01.2022.pdf
│           │   ├── 16-007_ Piani di lavoro.pdf
│           │   ├── 1_Tempi di lavoro e riposo_it.pdf
│           │   └── 3_Disposizioni speciali Case da gioco (2).pdf
│           ├── SIGLE E TURNI/
│           │   ├── SLOT VALET.xlsx
│           │   └── TAVOLA_ORARI_SESSANTESIMI_CORRETTA.xlsx
│           └── VACANZE/          4 xlsx CONFERMATA (slot/tavoli/valet/cleaning) + PDF
│                                 ⚠️ i PDF sono più vecchi: fanno fede gli .xlsx
│
├── Fogli HR/                        copia dei 4 PDF per HR
├── Progetto Casino Lugano/          copie dei template + Sigle Progetto.docx
├── Art Cash Statistic/              CHF/ e EUR/
└── Foto carte/                      53 immagini
```

**Altre cartelle collegate sul Desktop**
- `Desktop/turni-app/` — studio del solver turni (Flask + OR-Tools), fermo da febbraio
- `Desktop/Statistiche/` — app giocate clienti (progetto separato)
- `Desktop/USB BAckup/CASINO LUGANO/` — copia di appoggio su disco

### Backup su USB
```
/Volumes/DISK_IMG/CASINO LUGANO/DiarioCollaboratori/
```
Copia completa del progetto, **IT/ compresa**. Verificata il 24/09: **allineata**
(js, IT, index.html, sw.js identici al locale).
Sulla stessa USB: `Statistiche/`, `Turnivo/`, `turni-app/`, `template Casino Lugano/`.

⚠️ **Mai usare `rsync --delete` verso l'USB**: a settembre ha già cancellato una cartella
presente solo lì. Il comando giusto è senza `--delete`.

---

## 2 · COM'È FATTO IL SISTEMA

- **Frontend**: HTML + JavaScript puro, nessun framework. GitHub Pages.
  - Sito: **https://digit-diary.github.io**
  - Repo: `digit-diary/digit-diary.github.io`
  - ⚠️ prima di ogni push: **`gh auth switch --user digit-diary`** (ci sono più account)
- **Database**: Supabase cloud `brdhxzgegxhjbcgxcnfd` (eu-central-1, Francoforte).
  Il vecchio progetto `bdxqtzehoapilwzqlgnv` è stato **cancellato**, non esiste più.
- **Sicurezza**: RLS `deny_all_anon` su tutte le tabelle; si passa solo dalle funzioni
  `secure_read/insert/update/delete` (whitelist di tabelle); sessioni a token;
  chat cifrata AES-GCM.
- **43 tabelle** nel backup + 4 create dopo (vedi §6).

### Le pagine
Home, Diario, Rapporto, Note colleghi, Statistiche, Consegna, Promemoria, Maison,
Inventario, Guida, Registro, Moduli, Formazione, **Piano di lavoro**, Assistente, Impostazioni.

### Il Piano di lavoro (15 schede)
Calendario · Briefing · Vacanze · Saldo · Recupero ore · Timbrature · Statistiche ·
Benessere · Storico · Formulari · Turni · Regole · Festivi · Impostazioni · Guida

---

## 3 · COSA È STATO FATTO IN QUESTA SESSIONE (v248 → v257)

### Profili e permessi (v249)
- Motore **MATRICE_PROFILI** in `js/settings.js`: 60 voci × 5 figure
  (Direzione, Responsabile FoBoSlot, Sostituto, Supervisor, HR), presa dal documento
  firmato `IT/Documenti/Profili_e_permessi_COMPLETO.html`.
- Si assegna un profilo a ogni operatore, poi **"Applica i profili"** riscrive tutte
  le righe di Visibilità e permessi. Chi resta senza profilo non viene toccato.
- Correzioni a penna recepite: Formazione SUP = V; Registro attività solo admin;
  Storico modifiche non a Direzione/HR; **HR ha anche `gestione_regole` = M**;
  Categorie vedere = V per Resp e Sost.
- ⚠️ **NON ancora applicato**: il pulsante lo deve premere l'utente.

### Statistiche del Piano (v249)
I mesi erano una navigazione (cambiavano il mese del calendario e ricaricavano tutto,
mostrando sempre i totali dell'anno). Ora sono un **filtro in memoria**: niente ricarica,
niente sfarfallio, intestazione che dice il periodo, pulsante "Anno intero".

### Saldo ore (v249, v253)
- Si modifica **solo dalla colonna "Saldo mese"** (prima il collegamento esisteva solo
  nel Calendario col doppio clic e nella scheda Saldo non succedeva nulla).
- **Saldo ore dell'anno** come il foglio Excel: riga per collaboratore, colonna per mese,
  riporto iniziale, totale, semaforo ok/no. I mesi futuri già pianificati contano,
  quindi si vede in anticipo chi andrà fuori soglia.
- **Riporto con la sua data**: contiene già i mesi fino a lì, che restano grigi con un
  punto e non si contano due volte. Importati i 26 riporti del foglio (rif. 31.08.2026).
- Banda ok/no da regole `saldo_ore_max` / `saldo_ore_min` (+15 / −15), modificabili.
- Gli **ausiliari** mostrano un trattino: non hanno ore dovute, il saldo non si applica.

### Vacanze (v249)
"Pianificati" e "Restano" contavano solo le V del mese aperto. Ora contano le settimane
registrate per tutto l'anno (1 settimana = 7 giornate) e c'è la colonna **"V nel calendario"**
per vedere dove manca "Applica al piano".

### Formazione (v250, v256)
- **Accoglienza** inserita come **L4** negli Slot (Back Office → L5, Supervisor → L6).
  Gli 8 che avevano già BO o SUP hanno ricevuto Accoglienza per non perdere il livello.
- Livelli **non più fissi**: nomi, tendina e premi/punti seguono la scala più lunga fra i
  settori. Ogni settore ha la sua scala indipendente.

### Durate dei turni (v252)
- **29 turni corretti** alla regola unica: orario da orologio + 10% delle ore fra le 23 e le 6.
  Esempio: **Z8 19:45-04:30 era 9.75 (9h45), ora è 9.30 (9h18)**.
- Copia di sicurezza dei valori precedenti: **`IT/backup_durate_turni.json`**.
- Il controllo durate ora segnala da **mezzo minuto** (prima ignorava tutto sotto i 3 minuti).

### Memoria delle modifiche nel Piano (v252)
Turni, Regole, Impostazioni e Saldo si salvano da soli: ora in cima alla scheda resta
l'elenco di cosa hai toccato (valore prima → dopo, con l'ora), chiudibile. Tutto anche
nel Registro attività. Nei Turni le ore/minuti si aggiornano **mentre scrivi**.

### Blocco cella con motivo (v251)
Tasto destro su una cella → **"Blocca questa cella (con motivo)"**. Motivo obbligatorio,
visibile passando sopra e nelle conferme. Nuova colonna `piano.motivo_blocco`.
⚠️ I mesi importati da Excel hanno **il 100% delle celle già protette** (l'importazione
mette `protetto: true`): lì la voce che appare è "Sblocca".

### Fabbisogno (v255)
"Copia dal mese precedente" copiava il giorno 7 sul giorno 7, spostando i venerdì sui lunedì.
Ora copia **per tipo di giornata**: lunedì-giovedì distinti, venerdì/sabato/vigilie insieme
(chiusura alle 5), domeniche e festivi insieme. Il festivo prende l'assetto della domenica,
la vigilia quello del sabato.

### Ausiliari (v254)
Regola `jolly_percentuale_piano` = 0.8: nella **generazione** del piano un jolly punta
all'80% di un tempo pieno. Le ore dovute restano zero e le assenze contano per intero.

### Domeniche libere (v256)
Card nella scheda **Benessere**: per mese le domeniche libere, poi Libere / Lavorate /
Diritto (12, regola `domeniche_libere_anno`) / Restano. Rosso con **!** se le domeniche
rimaste nell'anno non bastano più per arrivare al diritto.

### Moduli disciplinari (v257) — l'ultimo lavoro fatto
- **Bug della scadenza ripetuta**: il termine finiva in due punti del PDF (sotto "Scadenza"
  e dentro "Chiediamo che, *valore*, venga raggiunto..."), quindi chi ci scriveva una frase
  se la ritrovava due volte. Ora **compare una volta sola** e la frase è fissa:
  *"Chiediamo che, entro il termine sopra indicato, venga raggiunto l'obiettivo di cui sopra."*
  Campo vuoto → "A partire da subito"; campo scritto → quello che ha scritto l'operatore.
- **Testo che usciva dal foglio**: scadenza e frase non andavano a capo, un termine lungo
  veniva tagliato al bordo destro. Risolto.
- **Allineamento e RDI** ora si comportano allo stesso modo (stessa funzione).
- **Documento vuoto**: se mancano "Non conformità" o "Obiettivo" il programma chiede
  conferma invece di stampare in silenzio un documento ufficiale vuoto.
- **Responsabile di settore** non più scritto fisso: si imposta per ogni settore in
  Impostazioni → *"Moduli · responsabile di settore"*. Slots parte con "Sig.ra Fertitta Lara".
- Sotto il campo Scadenza tre esempi cliccabili + la nota "è un termine, non una frase".

### Dati corretti / importati in questa sessione
| Cosa | Dettaglio |
|---|---|
| Recupero ore ago+set | 33 scostamenti importati da `PIANO SLOTS 2026.xlsx`, verificati due volte al centesimo (agosto −10.35, settembre 0) |
| Riporti saldo | 26 riporti dal foglio "Saldo Ore", riferimento 31.08.2026 |
| Festività | tolte le 4 non aziendali (8/3, 24/8, 1/10, 4/10). Restano le **12** dell'elenco |
| Giubilei passati | **49** marcati "regolato prima dell'adozione del Diario" (45 + 4 del Cleaning): si calcola solo dal futuro |
| Cleaning | date di inizio attività: Rotundo 01.01.2021, Fertitta Massimo 11.12.2023, Ramos 01.01.2010, Devito 01.06.2026 |
| Devito Roberta | portata all'**80%** come da file HR |
| Balliu Bledar | 3 settembre: `C5` → `C` come nel piano Excel (nessuna timbratura né assenza quel giorno) |
| Durate turni | 29 corrette (vedi sopra) |

### Migrazioni create in questa sessione
`20260862_blocco_cella_motivo.sql` · `20260863_saldo_ore_anno.sql` ·
`20260864_jolly_percentuale_piano.sql`
(la 20260863 crea la tabella `piano_saldo_iniziale` **e** la aggiunge alla whitelist
delle funzioni `secure_*`: senza quel pezzo l'app vede la tabella ma non ci scrive)

---

## 4 · COSA RESTA APERTO

### Decisioni dell'utente
1. **Applicare i profili permessi**: il motore è pronto, va premuto il pulsante.
2. **Responsabili di Tavoli, Valet, Cleaning** nei moduli: i campi sono vuoti, mancano i nomi.
3. **Protezione delle celle importate**: oggi l'import mette `protetto: true` su tutto,
   quindi l'avviso "cella protetta" esce a ogni modifica. Si può cambiare in modo che
   protegga solo vacanze, malattie e scambi.
4. **RDI senza frase di chiusura**: l'allineamento ce l'ha, l'RDI no (è così nel modulo
   originale, non l'ho inventata). Da decidere se aggiungerla.
5. **CS 3h vs LRD 2h**: l'Excel conta 2h per entrambi i corsi, il programma dà 3h a CS.
   L'utente ha detto di lasciare com'è, personalizzabile.

### Problemi nei file Excel dell'utente (non nel programma)
- **Fogli REC ORE da settembre a dicembre**: hanno ancora **Pisano Pamela** in riga 12
  (è uscita) dove i fogli mese hanno **Sapio Mattia**, e Sapio è doppio in riga 21.
  La formula `AM12` pesca per numero di riga, quindi i recuperi finiscono sulla persona
  sbagliata. **Da correggere a mano**: A12 → SAPIO MATTIA, svuotare A21.
  (Fino ad agosto i fogli erano allineati, per questo l'importazione era corretta.)
- **Pasqua nel foglio Excel**: c'è 20-21.04, che sono le date del **2025**.
  Nel 2026 è **5-6 aprile**. Nel programma è giusta.

### Dati incompleti
- Collaboratori senza data di inizio attività (ne restano parecchi negli Slot):
  senza quella non si calcolano vacanze e giubilei.
- Nomi da sistemare in anagrafica: `Xxxxxxxxx`, `Jolly`, `New Arena Ioo`, `Babacar`,
  `Tonati` (vs `Tonati Edoardo`).
- Turni con durata zero usati nel piano: `63` (62 usi), `8C` (40), `CLB3` (1).
- Persone nel piano futuro ma non in anagrafica: De Solis Daniele, New Arena Ioo, Xxxxxxxxx.

### Idee non ancora fatte
- Premi/punti livello: fatti dinamici, ma si potrebbe rivedere la dicitura
  "completamento di tutti i livelli".
- "Cambia turno con...": mostrare per primi i colleghi formati.

---

## 5 · COME SI RILASCIA (procedura esatta)

```bash
cd /Users/bushi/Desktop/DiarioCollaboratori

# 1. verifica
node --check js/<file modificati>.js
node test/piano-regole.test.js            # devono passare 97 test
npx prettier --single-quote --print-width 120 --write js/<file>.js

# 2. alza la versione del service worker (OBBLIGATORIO, altrimenti la cache resta vecchia)
#    sw.js riga 1: const CACHE_NAME = 'diario-cl-vNNN';

# 3. copia nel pacchetto IT
cp js/<file>.js IT/codice_sorgente/js/
cp sw.js index.html IT/codice_sorgente/
cp supabase/migrations/<nuova>.sql IT/codice_sorgente/supabase/migrations/

# 4. commit e push
gh auth switch --user digit-diary          # SEMPRE prima del push
git add js sw.js index.html supabase
git commit -m "..."
git push

# 5. USB (SENZA --delete)
U="/Volumes/DISK_IMG/CASINO LUGANO/DiarioCollaboratori"
rsync -a js/ "$U/js/"
rsync -a supabase/ "$U/supabase/"
cp sw.js index.html "$U/"
rsync -a --exclude '.DS_Store' IT/ "$U/IT/"
```

**Migrazioni database**: `supabase db push` (la CLI è già collegata al progetto).

---

## 6 · IL PACCHETTO PER L'IT

### Dov'è e com'è fatto
`/Users/bushi/Desktop/DiarioCollaboratori/IT/` — **33 MB**, gitignored (non è sul repo
pubblico, per scelta di sicurezza: contiene guide e backup).

```
IT/
├── LEGGIMI.txt                              indice del pacchetto, da leggere per primo
├── AGGIORNAMENTO_DA_APRILE.txt              procedura per chi ha già la versione di aprile
├── Guida_Migrazione_Server_Interno.docx     LA GUIDA PRINCIPALE (architettura, 3 opzioni,
│                                            procedura dati, test, accessi)
├── Documentazione_Tecnica_Sicurezza.docx    RLS, funzioni secure_*, sessioni, cifratura
├── diario_backup_completo_2026-09-07.json   18 MB · 43 tabelle · 51.250 righe
├── backup_durate_turni.json                 durate turni PRIMA della correzione (sicurezza)
├── codice_sorgente/                         il frontend completo + supabase/
├── migrazione/                              docker-compose.yml, .env.example,
│                                            import_backup.py, dopo_import_sequenze.sql
├── solver/                                  FASE 3: ottimizzatore turni (OR-Tools CP-SAT)
├── turnivo_opzione_B/                       alternativa: Turnivo come app separata
├── timbratrice/                             integrazione timbratrice
└── Documenti/                               i 4 fogli Profili e permessi (HTML)
```

### Come deve essere suddiviso per il server locale
Il pacchetto è già pensato per due scenari:

**A) Installazione nuova** (server interno da zero)
1. `Guida_Migrazione_Server_Interno.docx` → architettura e scelta fra Docker / nativo / cloud
2. `migrazione/docker-compose.yml` come riferimento (per la migrazione vera usare il
   repository ufficiale `supabase/docker`)
3. Eseguire **tutte** le migrazioni in ordine, dalla `20260315` alla `20260864`
4. `migrazione/import_backup.py <backup.json> <url> <service_role_key>`
5. Poi `migrazione/dopo_import_sequenze.sql`
6. Copiare `codice_sorgente/` sul web server
7. **`js/config.js` va sostituito** con quello che punta al backend interno
   (quello nel pacchetto punta al cloud)

**B) Aggiornamento di un'installazione già in produzione** (es. `diario.casinolg.local`)
→ `AGGIORNAMENTO_DA_APRILE.txt`: si sostituiscono i file dell'app e si eseguono solo le
migrazioni nuove. **I dati non vengono toccati**, nessun export/import.

### ⚠️ TRE COSE DA SISTEMARE PRIMA DI CONSEGNARE
Verificate il 24/09, sono disallineamenti veri:

1. **`AGGIORNAMENTO_DA_APRILE.txt` si ferma alla migrazione `20260851`.**
   Ne mancano **13**: dalla `20260852_regole_per_settore` alla `20260864_jolly_percentuale_piano`.
   Se l'IT segue il file così com'è, il database resta indietro e l'app non funziona.

2. **`LEGGIMI.txt` dice "42 migration" e "dalla 20260315 alla 20260835".**
   Le migrazioni ora sono **71**, l'ultima è la **20260864**.

3. **Il backup è del 07/09 e non contiene le 4 tabelle nuove**
   (`piano_recupero_ore`, `piano_ore_mese`, `piano_saldo_iniziale`, `piano_festivita`),
   né i dati importati dopo (recupero ore, riporti, correzioni).
   → **rifare il backup** da Impostazioni → Backup completo prima della consegna.

Il codice sorgente invece **è allineato**: tutte e 71 le migrazioni sono già in
`IT/codice_sorgente/supabase/migrations/`, verificato file per file.

---

## 7 · REGOLE DI LAVORO DA RISPETTARE

Dette dall'utente, valgono sempre:
- Essere **onesti su tutto**, niente risultati dati per buoni senza verifica.
- **Nessun errore**: si controlla prima di modificare, su qualsiasi regola.
- **Niente toppe**: correzioni alla radice, coerenti in tutte le schermate, con test.
- **Confermare prima** di modifiche non banali: pro e contro onesti, poi si procede.
- Ogni cosa deve **seguire lo stile del resto**: non inventare comportamenti nuovi
  quando ce n'è già uno che funziona (es. la selezione del Recupero ore copia quella
  del Calendario).
- **Mai** dati personali di clienti o colleghi all'AI esterna (Groq).
- **Mai** segreti nel repo pubblico.
- **Niente emoji** nei prodotti: solo icone SVG.
- **Mai trattini lunghi** nei testi dell'interfaccia.
- Il sistema deve durare **anni senza manutenzione**: tutto personalizzabile da
  Impostazioni o dalle Regole, niente valori scritti dentro il programma.
- I dati si conservano **almeno 5 anni** (regolamento aziendale / RAP).
- Gli incentivi richiedono **sempre** la conferma del supervisore.
- Al casinò girerà tutto su **server locale**, non sul cloud.

---

## 8 · TRAPPOLE NOTE (fanno perdere ore)

- **`gh auth switch --user digit-diary`** prima di ogni push, altrimenti errore 403.
- **Alzare `CACHE_NAME` in sw.js** a ogni rilascio, altrimenti il browser serve il vecchio.
- **`loadAll()` solo dopo il login**, mai prima.
- **PostgREST**: sempre `colonna=eq.valore`. Senza `eq.` il filtro viene ignorato e si
  legge/scrive la riga di un'altra persona (bug grave già successo).
- **Mai `--delete` nell'rsync verso l'USB.**
- **Date di fine mese**: mai `'-31'` fisso nei filtri, calcolare il giorno reale
  (febbraio e aprile fallivano in silenzio).
- **`secDel`/`secPatch`** non devono mai ripiegare sul percorso anonimo: con RLS il
  fallimento diventa invisibile e l'app dice "eliminato" senza aver eliminato niente.
- I **globals `let`** di `realtime.js` non stanno su `window`: non leggerli come `window.xxx`.
- **Prettier** del progetto: `--single-quote --print-width 120` (non il default).
- Test nel browser: la funzione per cambiare pagina è **`switchPage()`**;
  `prompt()` e `confirm()` non stubbati **bloccano** il browser di prova.

---

## 9 · LE CONVERSAZIONI, IN ORDINE

Come si è arrivati alle scelte fatte. Utile per capire **perché** una cosa è come è,
prima di rimetterla in discussione.

### Prima parte (prima del riepilogo automatico)
1. **Vacanze**: i giorni in più per anzianità **non sono cumulativi** (chi arriva a 15 anni
   ha 2 giorni in tutto, non 1+2). Chi fa 25 anni ha **4** giorni, non 5.
   Primi due anni 28 giorni, poi 35. Poi: **arrotondamento** a partire da **0.35**
   (32.67 → 33, 32.37 → 33, 32.2 → 32).
2. **Jolly**: le V dei jolly valgono **zero ore** (l'indennità è già nel salario orario).
3. Schede collaboratore che non si aprivano; popup coperture da sistemare; bozza piano
   di novembre che non partiva (era `secPost` che ripiegava sul percorso anonimo).
4. **Festivi cantonali e CGF**: elenchi 2026 e 2027 dettati dall'utente.
5. **Recupero ore**: nuova scheda nel Piano, "lo stesso che trovi nel piano slot in Excel",
   da aggiornare **tutti i giorni**. Senza jolly.
6. **Z0**: finisce alle 19:45, ma **quando c'è Z12 finisce alle 20:30**, cioè nei giorni
   in cui il casinò chiude alle 5.
7. **Chiusura alle 5**: il marcatore va **il giorno PRIMA** del festivo, e non serve se
   quel giorno è già venerdì o sabato.
8. **"Non fare cose diverse"**: la selezione del Recupero ore deve funzionare **come nel
   Calendario** (clic sostituisce, Ctrl aggiunge, clic su cella pulisce), stessi colori.
9. **Ore in sessantesimi**: "nel file C0 dalle 11.40 alle 20.00 = 8.20, nell'app 8.33".
   Chiarito che 8.33 è lo stesso valore in centesimi; da lì la richiesta di vederli
   in ore e minuti.
10. **Profili e permessi**: preparato il foglio, compilato a mano dall'utente, poi
    ricontrollato; HR, Direzione, Resp, Sost, SUP.
11. **"Ma non devi fare questi errori cavolo"** — dopo un `collabRec is not defined` che
    si vedeva solo da admin. Da lì la regola: **provare anche il percorso admin**.

### Seconda parte (questa sessione)
12. **Password nuovo operatore**: "minimo 4 caratteri" anche scrivendone di più.
    Causa: l'utente aveva scritto solo nel campo **Conferma**. Messaggi resi distinti.
13. **Correzioni a penna** sul foglio permessi → recepite tutte e 6.
    HR può **anche modificare** le Regole (scelta dell'utente).
14. **Accoglienza** dopo Cassa in Formazione → **nuovo livello L4** (scelta dell'utente),
    quindi BO → L5 e SUP → L6, con allineamento di chi era già oltre.
15. **Statistiche del Piano**: "clicco qualsiasi mese ma mostra stessi dati e sembra si
    ricarichi" → i mesi diventano un filtro.
16. **Saldo ore**: "dovevi sistemare anche saldo ore… la colonna saldo ore" → poi
    "non devo modificare colonna ore lavorate ma solo colonna saldo ore".
17. **Vacanze**: "più che altro quelli che restano" → "Restano" corretto sull'anno intero.
18. **Foglio Saldo Ore dell'Excel**: studiato formula per formula, poi replicato
    (riporto + somma mesi + banda ok/no ±15, personalizzabile).
19. **Fabbisogno**: "non deve copiarlo uguale… venerdì deve restare venerdì" e
    "il giorno dopo una chiusura alle 5 va considerato come la domenica".
20. **Jolly all'80%** solo per la generazione del piano, con tolleranza personalizzabile.
21. **Domeniche**: "dovrebbero essere dodici all'anno… se manca personale siamo costretti
    ad aggiungerne a chi le aveva libere, il sistema ne prende atto?" → scheda Benessere.
22. **Giubilei**: quelli del passato vanno segnati come **già assegnati**, si calcola
    solo dal futuro.
23. **Blocco cella**: chiesto prima il consiglio, poi "possiamo mettere blocca questa
    cella con motivazione" → fatto così.
24. **Durate turni**: "le pause sono pagate, non calcolare pause" e "gli arrotondamenti
    di uno o due minuti non ci devono essere" → 29 turni corretti, soglia a mezzo minuto.
25. **"Quando modifico deve apparire qualcosa per salvare, se no uno non ricorda più
    quello che ha fatto"** → elenco delle modifiche in cima al Piano.
26. **Moduli**: la scadenza ripetuta ("si invita, si invita…") → una volta sola;
    responsabile Lara reso personalizzabile per settore.
27. **Workshop e CdA**: preparato il discorso di 3 minuti (PDF
    `Discorso_CdA_Multidisciplinarita.pdf`, generato nello scratchpad) e la mail a Yuliya
    del Compliance per presentare il progetto il 29 o 30 settembre.

### Le frasi che valgono come regola
- *"Devi essere onesto su tutto."*
- *"Controlla bene tutto prima di fare modifiche, su qualsiasi regola."*
- *"Ogni cosa che fai deve avere una logica e seguire lo stile del resto. Non fare cose diverse."*
- *"Niente toppe, solo soluzioni serie."*
- *"Il sistema deve durare anni senza manutenzione."*
- *"Usa il modello migliore sempre per questo sistema."*

---

## 10 · IN UNA RIGA

Il Diario Collaboratori è completo e in produzione (v257): gestisce personale, disciplinari,
formazione con livelli di competenza, valutazioni, incentivi e l'intero piano di lavoro
(turni, vacanze, saldo ore con proiezione annuale, domeniche, festivi, CGF) per quattro
settori, con permessi per profilo. Quello che manca non è codice: sono **decisioni**
(applicare i profili, i nomi dei responsabili) e la **rinfrescata al pacchetto IT** prima
della consegna a Francesco.
