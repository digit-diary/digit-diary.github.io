/**
 * Diario Collaboratori · Casino Lugano SA
 * File: guida.js
 * Guida completa del programma. Un solo posto per tutte le spiegazioni:
 * la pagina Guida le mostra tutte, la tab Guida del Piano mostra i capitoli
 * del piano. Ogni capitolo dichiara CHI lo vede, cosi' ognuno legge solo le
 * istruzioni delle cose che puo' davvero fare.
 */

function _guidaPuo(fn) {
  try {
    return typeof window[fn] === 'function' ? !!window[fn]() : false;
  } catch (e) {
    return false;
  }
}
function _guidaVis(key) {
  try {
    return typeof isVis === 'function' ? isVis(key) : true;
  } catch (e) {
    return true;
  }
}
function _guidaAdmin() {
  return typeof isAdmin === 'function' && isAdmin();
}

// area: 'inizio' | 'diario' | 'piano' | 'hr' | 'admin'
// vis: funzione che dice se il capitolo va mostrato a chi sta leggendo
function GUIDA_CAPITOLI() {
  return [
    {
      area: 'inizio',
      titolo: 'Da dove iniziare',
      vis: () => true,
      righe: [
        "Il programma e' diviso in <b>pagine</b>, che trovi nella barra in alto. Vedi solo quelle che ti sono state abilitate: se una pagina non c'e', significa che non rientra nel tuo ruolo.",
        "La <b>Home</b> riassume la giornata: promemoria in scadenza, avvisi e scorciatoie. E' il punto di partenza consigliato ogni volta che entri.",
        'Quasi tutto si salva <b>da solo</b> nel momento in cui scrivi: non esiste un tasto Salva generale. Dove serve una conferma, il programma te la chiede.',
        '<b>Annulla e Ripristina</b> valgono in tutto il programma: dopo una modifica compare in basso a sinistra la barretta con l ultima azione in parole (per esempio "Creato modulo rdi · Rossi"); Annulla la toglie, Ripristina la rimette. Ctrl+Z e Ctrl+Y fanno lo stesso fuori dai campi di testo. Regole: si annullano le proprie azioni della sessione corrente (le ultime 30), un azione intera alla volta; se nel frattempo un altro operatore ha toccato la stessa riga il programma avvisa e non sovrascrive; un documento creato e poi annullato va nel Cestino; ogni annullamento resta nel registro attivita. La griglia del calendario del Piano e il briefing hanno il loro Annulla; chat e registro non si annullano.',
        "Se una cosa non ti torna, in fondo a ogni pagina trovi la spiegazione qui nella Guida: usa l'indice in alto per saltare all'argomento.",
        '<b>La pagina resta ferma</b>: quando il programma aggiorna una pagina (un salvataggio, un colore, una cella, un aggiornamento da un altro operatore) resti dove eri, anche nei riquadri che scorrono di lato come il calendario del Piano. Anche ricaricando la pagina del browser torni allo stesso punto. Si riparte dall inizio solo cambiando pagina dal menu; restano liberi gli spostamenti voluti, come la ricerca globale che porta in vista il risultato.',
        '<b>Ricerca globale</b> (la casella al centro in alto): basta una parte di un nome o di una parola. In cima compaiono i <b>collaboratori</b> del settore, anche chi non ha nessuna registrazione, e il clic apre la loro scheda; sotto le registrazioni del Diario, i moduli, i <b>cambi turno</b>, le note, la Maison, i promemoria, le spese e il registro. Il clic su un risultato apre la pagina giusta, porta in vista l elemento trovato e lo evidenzia per un momento.',
        '<b>Dimensione del testo</b>: i pulsanti <b>A&minus;</b> e <b>A+</b> in alto a destra rimpiccioliscono o ingrandiscono tutti i caratteri (dal 90% al 130%). La scelta vale solo per il tuo operatore e resta salvata: la ritrovi su ogni PC dove entri.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Diario delle attivita',
      vis: () => _guidaVis('diario'),
      righe: [
        "Serve a registrare cosa succede in turno: attivita', richieste, errori, ammonimenti, malattie, non disponibilita', note.",
        'Scegli il <b>tipo</b>, il <b>collaboratore</b> e scrivi il testo. La data e il tuo nome vengono messi in automatico.',
        'Le voci si possono cercare, filtrare per tipo o collaboratore, modificare e mettere in evidenza. Quelle eliminate finiscono nel Cestino e si possono recuperare.',
        "Le <b>malattie</b> registrate qui compaiono da sole nel piano di lavoro, quindi non vanno riscritte due volte. Vale anche al contrario: una M scritta nel piano o una copertura malattia si registrano nel Diario e contano nella scheda del collaboratore. Ognuno puo' partire dal punto che preferisce, il risultato non cambia.",
        'Vale anche quando si toglie: se una M viene rimossa dal piano o sovrascritta con un turno, il programma propone di togliere quei giorni anche dal Diario. Le registrazioni finiscono nel Cestino e si possono recuperare.',
        'La <b>copertura malattia</b> propone prima chi e libero quel giorno e in regola; se non basta prova le <b>soluzioni a catena</b> (libera un collega spostando il suo turno del giorno prima a un altro), sempre nel rispetto di riposo, consecutivi e formazione. Ogni proposta ha la sua spunta: si sceglie cosa applicare e si puo stampare la lista.',
        'Tutte le regole valgono anche a mano e in ogni cambio (per esigenze, scambio con restituzione, cerca cambio, copertura malattia): riposo di 11 ore, massimo giorni consecutivi (contati anche <b>a cavallo tra un mese e l altro</b>), <b>accompagnamento</b> (chi e segnato accompagnato non deve restare da solo nel suo gruppo quel giorno) e <b>avviso se il collaboratore non e formato</b> per quel turno. Il controllo vale per tutti i collaboratori toccati e per tutti i giorni coinvolti, restituzione compresa. Si puo confermare lo stesso, ma la segnalazione resta scritta nel commento della cella. I commenti automatici si possono sempre modificare o cancellare col tasto destro. Avvisa anche quando si scrive un turno su un <b>congedo dedicato alle vacanze</b> (le C e i WD messi prima o dopo un periodo di ferie secondo le regole): quel riposo verrebbe tolto.',
        'Nel <b>cerca cambio</b> per il giorno libero, prima di confermare puoi premere <b>Stampa lista colleghi</b>: esce un foglio con i colleghi disponibili e le date di restituzione, da consegnare al collaboratore. Lui chiede a chi vuole, poi si torna e si applica il cambio. Stampare la lista non cambia nulla nel piano.',
        'Nel briefing, chi ha la cella colorata nel piano viene evidenziato: il nome appare con lo sfondo colorato sul foglio. Con le <b>Evidenziazioni dal piano</b> (in fondo alla scheda Briefing) si decide, per ogni settore, quale colore del piano diventa quale colore sul briefing e cosa significa: per esempio nel valet il coordinatore si segna in rosso sul piano e sul foglio si vede in verde.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Rapporto giornaliero',
      vis: () => _guidaVis('rapporto'),
      righe: [
        'E il rapporto di fine turno: presenze, assenze, differenze di cassa e le voci che il tuo settore deve compilare.',
        'I campi del rapporto sono personalizzabili per settore: se ne manca uno, si aggiunge dalle Impostazioni.',
        'Il pulsante di <b>importazione</b> legge il rapporto scritto altrove e compila i campi da solo, chiedendo conferma quando trova qualcosa di ambiguo.',
        'A fine mese il rapporto alimenta le statistiche e gli avvisi sulle differenze di cassa oltre soglia.',
        '<b>Nomi uguali (omonimi)</b>: quando nel rapporto (assenze o differenze di cassa) un nome corrisponde a piu collaboratori, il programma sceglie da solo solo se la scelta e sicura (uno solo nel settore aperto, oppure chi ha gia la registrazione di quel rapporto); altrimenti apre una finestra con i nomi, il settore e la funzione e chiede chi e. Prima prendeva il primo dell elenco in silenzio.',
        '<b>Piano, Rapporto e Diario collegati</b>: una M scritta nel Piano o una Copertura malattia fanno come se l assenza fosse scritta nel Rapporto: la persona entra nelle assenze del Rapporto del primo giorno (PRESTO se il turno sostituito e diurno o era un riposo, NOTTE se notturno) e da li nel Diario; la cella ha la nota "Ex R23 - operatore" e, se il giorno era un CGF, si propone il giorno sostitutivo. Una malattia scritta nel Rapporto scrive le M nel Piano come quella del Diario. Cancellando la malattia dal Diario, nel Piano torna la sigla di prima e la persona sparisce dal Rapporto.',
        '<b>Rapporto e Diario collegati</b>: le assenze e le differenze di cassa scritte nel Rapporto creano le registrazioni nel Diario ("da rapporto PRESTO del 30/09/2026"). Se cancelli la registrazione dal Diario, la persona sparisce anche dal Rapporto di quel giorno (il resto del testo resta: "Rossi e Bianchi assenti" diventa "Bianchi assenti"). Se la togli dal Rapporto, il Diario resta: la registrazione diventa "tolta dal rapporto" e un avviso lo dice. Se la modifichi nel Diario (giorni di malattia, importo), il programma chiede se correggere anche il Rapporto.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Chat e note tra colleghi',
      vis: () => _guidaVis('note_collega'),
      righe: [
        'Funziona come una chat: gruppi per settore e conversazioni singole, con notifiche quando qualcuno ti scrive.',
        'Si possono allegare file e immagini, rispondere a un messaggio e reagire con le faccine.',
        'Quello che scrivi qui resta interno al programma: non usarlo per dati personali dei clienti.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Promemoria',
      vis: () => _guidaVis('promemoria'),
      righe: [
        "Promemoria con data e ora, assegnabili a te o ad altri operatori, con avviso all'apertura del programma e notifica sul telefono.",
        'Quelli scaduti o di oggi compaiono in un riquadro in Home finche non li completi.',
        'Sono divisi per settore: ognuno vede quelli del proprio.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Consegna del turno',
      vis: () => _guidaVis('consegna'),
      righe: [
        'La consegna scritta tra un turno e il successivo: cosa e rimasto in sospeso, cosa deve sapere chi entra.',
        'Chi prende servizio la legge e la conferma, cosi resta traccia del passaggio.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Maison e budget clienti',
      vis: () => _guidaVis('maison'),
      righe: [
        '<b>Tipi di buono</b> (Impostazioni &gt; Maison, solo amministratore): per ogni buono sigla, nome, valore in CHF e attivo. Si puo <b>rinominare</b> un buono e <b>aggiungere</b> un tipo nuovo (sigla da 2 a 6 lettere o cifre, nome, valore e, se serve, le parole che nel file Maison lo indicano, es. brunch). La sigla non si cambia dopo l aggiunta, perche e scritta nelle registrazioni; un tipo che non si usa piu si <b>disattiva</b>: sparisce dai menu ma resta nello storico, nelle statistiche e negli export. Con le spunte <b>Settori</b> un buono compare solo nei menu di quei settori (es. un buono solo ai Tavoli); nessuna spunta = in tutti. Menu, tabelle, grafici, export e magazzino si adeguano da soli.',
        'Gestione delle consumazioni offerte ai clienti: budget per cliente, categorie, buoni e conteggi mensili.',
        'Il testo del gestionale si incolla nel riquadro di importazione e il programma riconosce da solo cliente, importo e tipo di consumazione.',
        'I <b>buoni</b> si calcolano in automatico dal costo, con i valori impostati in Impostazioni.',
        'Le voci si possono correggere a mano; i doppioni si uniscono con la funzione apposita.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Inventario',
      vis: () => _guidaVis('inventario'),
      righe: [
        'Scorte e giacenze del settore, con movimenti di carico e scarico e categorie personalizzabili.',
        'Ogni movimento resta registrato con chi lo ha fatto e quando.',
        '<b>Categorie</b> (amministratore): in Slots e Tavoli ci sono Buoni (collegati ai buoni della Maison) e Sigarette; per ogni settore si possono <b>rinominare</b> o <b>nascondere</b> (es. Sigarette ai Tavoli) con i pulsanti nel titolo della scorta, e rimettere con "Mostra ..." accanto alle schede. I movimenti restano. <b>+ Categoria</b> aggiunge categorie libere (Valet, Cleaning: pettorine, chiavi, prodotti...), rinominabili e rimovibili.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Moduli e formulari',
      vis: () => _guidaVis('moduli'),
      righe: [
        'Ogni modulo nuovo (Allineamento, Apprezzamento, RDI) e un record separato: aprire un modulo salvato e poi premere un pulsante "Nuovo" crea un modulo nuovo, non sovrascrive quello aperto prima. Un modulo salvato si aggiorna solo riaprendolo dall elenco e rigenerando il PDF.',
        'Raccolta dei moduli compilabili e stampabili del settore, con archivio a cartelle per Word, PDF ed Excel.',
        'I moduli generati restano archiviati e si possono ristampare in qualsiasi momento.',
        'I fogli di <b>cambio turno</b> non sono piu in questa sezione: si trovano nel Piano, scheda <b>Cambi turno</b>, e nella scheda del collaboratore.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Statistiche e report',
      vis: () => _guidaVis('statistiche'),
      righe: [
        "Grafici e tabelle su attivita', assenze, differenze di cassa e andamento del settore.",
        'I report si esportano in PDF con il logo, pronti da consegnare.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Assistente AI',
      vis: () => _guidaVis('assistente'),
      righe: [
        "Aiuta a scrivere testi di servizio: comunicazioni, richieste, correzione di bozze, traduzioni nelle lingue dell'azienda.",
        '<b>Non vanno mai inseriti dati personali dei clienti o dei colleghi</b>: si scrive in forma generica.',
        'Il testo prodotto e sempre da rileggere e correggere prima di usarlo.',
      ],
    },
    {
      area: 'admin',
      titolo: 'Intelligenza artificiale: quale usare',
      vis: () => _guidaAdmin(),
      righe: [
        'In <b>Impostazioni > Persone e accessi > Intelligenza artificiale</b> c e l elenco dei fornitori. Uno e <b>In uso</b>; un altro puo fare da <b>Riserva</b>, usata da sola se il primo non risponde.',
        '<b>Aggiungi fornitore</b>: si sceglie il tipo (Groq, Ollama o LM Studio sul server interno, altro servizio compatibile), l indirizzo, il modello per i testi e quello per i moduli, e la chiave se serve. Con un modello sul server interno (per esempio Llama con Ollama, indirizzo <b>/ai/v1</b>) i testi non escono dal casino.',
        '<b>Prova</b> manda una domanda brevissima e mostra il tempo di risposta e i modelli disponibili; <b>Usa</b> rende attivo quel fornitore per tutti.',
        'In ogni caso i nomi dei collaboratori vengono sostituiti prima dell invio e le fotografie non escono dal programma.',
      ],
    },
    {
      area: 'inizio',
      titolo: 'Dettagli utili in tutto il programma',
      vis: () => true,
      righe: [
        '<b>Accesso con impronta o volto</b> (operatori): vale 90 giorni dalla registrazione, poi si riattiva dalle Impostazioni dopo essere entrati con la password. Serve sempre il gesto (impronta o volto): quando la sessione scade il programma non rientra piu da solo. L amministratore entra con la password principale. Cambiare la password chiude le sessioni aperte sugli altri dispositivi e toglie l impronta registrata.',
        '<b>Rinomina di un collaboratore</b> (amministratore): il nome cambia in tutto il programma in una volta sola (anagrafica, Diario, piano, schede, vacanze, ore, chat se non e anche operatore); se qualcosa non va non cambia niente. Annulla la rimette com era, ovunque.',
        '<b>Mini-scheda del collaboratore</b>: fermando il mouse mezzo secondo su un nome, ovunque nel programma (calendario, Diario, Avvisi, Crediti, Vacanze, Statistiche...), compare un riquadro con settore, funzione, percentuale, turni di oggi e dei prossimi 3 giorni, vacanze che restano, CGF da dare, saldo ore (se calcolato), congedi e le cose da guardare (settimane oltre il massimo, riposo, regole, malattia in corso). Sul telefono si apre tenendo premuto. Un clic sul nome apre la scheda completa come prima. I crediti si vedono solo con il permesso Crediti; i dati riservati restano nella scheda completa.',
        '<b>Aggiornare la pagina</b> (F5) non cambia settore: si resta sul settore, sul settore del Piano e sul mese in cui si era. Un nuovo accesso parte dal settore scelto nella schermata di accesso.',
        '<b>Tabelle come Excel</b> (calendario, briefing, pause): un clic seleziona la cella (senza modificarla), le frecce si spostano su, giu, destra e sinistra (Maiusc + frecce allarga la selezione nel calendario), Tab passa alla cella accanto. Si modifica con doppio clic, Invio o F2, oppure scrivendo direttamente: il testo sostituisce la cella. In modifica Invio, Tab e le frecce su/giu confermano e passano alla cella vicina; Esc annulla. Canc svuota la cella. Nel briefing e nelle pause le righe si spostano <b>trascinandole</b> (dalle colonne E/U del briefing, dalla maniglia a destra nelle pause; anche col dito): nelle pause gli orari si ricalcolano come con le vecchie frecce. Trascinando una cella gia selezionata la si <b>scambia</b> con un altra della stessa colonna (nelle pause: le postazioni).',
        '<b>Chi vede e chi modifica la scheda del collaboratore</b>: tutti vedono nome, settore, turni, cambi turno, registrazioni del Diario ed errori del proprio settore, e il compleanno (giorno e mese). Chi ha il permesso <b>Storico HR, vedere</b> vede anche contratto, anzianita, giubilei, congedi non pagati, allegati, costo degli errori, giorni di malattia e percorso disciplinare, di tutti i settori. Solo chi ha <b>Storico HR, modificare</b> (profilo HR) scrive inizio e fine contratto, data di nascita, giubilei e congedi non pagati. Le <b>valutazioni annuali</b> le vede chi ha Valutazioni, vedere (Direzione, Responsabile, Sostituto, HR) e le scrive chi ha Valutazioni, inserire. Eliminare eventi HR e allegati: solo amministratore. Le stesse regole valgono anche nel database: chi non ha il permesso non riceve i dati e non puo salvarli.',
        '<b>Ricerche</b>: la Guida ha una casella di ricerca (restano solo le righe con la parola), la scheda Vacanze cerca per nome o numero di settimana.',
        '<b>Diario veloce e completo</b>: all apertura il Diario porta in memoria gli ultimi 24 mesi di tutti i settori, piu gli ammonimenti verbali e le differenze di cassa di sempre (cosi gli avvisi disciplinari e di cassa contano tutta la storia). Le registrazioni piu vecchie non spariscono: la scheda del collaboratore mostra sempre tutta la sua storia, la ricerca cerca anche nell archivio, le Statistiche contano tutto, un filtro "Dal" piu vecchio porta quel periodo, e in fondo all elenco c e "Mostra registrazioni piu vecchie".',
        '<b>Un solo Annulla</b>: la barra Annulla / Ripristina in basso (o Ctrl+Z / Ctrl+Y fuori dai campi) annulla sempre l ultima cosa fatta, in qualsiasi parte del programma: anche le celle del calendario del piano e il briefing. Le frecce del calendario e i pulsanti del briefing non ci sono piu.',
        '<b>Ora del promemoria</b>: dalle 06:00 alle 22:00 ogni due ore e 00:00 (mezzanotte). La notifica sul telefono parte a quell ora di Lugano, il giorno scelto (il giorno stesso, 1, 3 o 7 giorni prima); nel programma il promemoria compare dal giorno scelto.',
        '<b>Promemoria da una registrazione</b>: il pulsante Promemoria su ogni registrazione del Diario apre un promemoria gia compilato (Follow-up: nome e tipo, con il testo); si sceglie la data e si salva. Sostituisce le vecchie scadenze del Diario.',
        '<b>Rinomina di un collaboratore che e anche operatore</b>: anagrafica, Diario, Piano, schede e briefing futuri passano al nome nuovo; il nome di accesso e la chat restano quelli di prima, cosi al login ritrova i suoi messaggi.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: dettagli e novita',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Ore lavorate nella settimana</b>: se un collaboratore supera 45.1 ore dal lunedi alla domenica il programma avvisa quando scrivi la cella o fai un cambio, lo mostra in Valida regole e in Piano > Avvisi, e la bozza non lo supera mai. Contano turni e JG (non vacanze, malattie, CGF, riposi); il turno che passa la mezzanotte conta nella settimana in cui inizia. Si vedono sempre tre cifre: ore da orologio, 10% notturno e totale (es. 51.68 = 49.18 + 2.50); il limite si confronta con il totale compreso il 10% (regola ore_settimana_con_notturno, si puo cambiare in Regole insieme al limite ore_settimana_max).',
        '<b>Piano > Avvisi</b>: sotto-schede Ore settimanali, Regole del mese, Chiusura anno (saldo ore fuori banda, CGF da dare o in piu, domeniche libere sotto il diritto), Posti scoperti (prossimi 7 giorni) e Malattie lunghe (in corso da 10 giorni o piu), ognuna con il suo numero, e una ricerca per nome o testo. Il numero sulla scheda Avvisi e sulla voce Piano del menu conta solo le cose importanti (settimane oltre il limite, scoperti, malattie oltre il 14. giorno, chiusura anno in rosso). Aggiorna ricalcola le parti dell anno. Il saldo delle domeniche per persona e mese resta in Piano > Benessere.',
        '<b>Finestrelle sui numeri</b>: nel calendario passando sulle colonne OD (ore dovute: giorni, ore settimanali, percentuale), SM (saldo del mese: ore meno dovute), YTD (saldo dell anno: riporto della scheda Saldo piu i mesi dopo il riporto piu questo mese), D e N; nelle Domeniche libere (Benessere) ogni domenica del mese e come conta; nel Benessere il dettaglio dell indice; in Crediti vacanze e CGF con le date.',
        '<b>Storia della cella</b>: tasto destro su una cella del calendario > Storia della cella: com e oggi (chi l ha cambiata e quando, nota, blocco) e, per chi vede lo Storico, tutte le modifiche registrate per quella persona e quel giorno.',
        '<b>Colonna di oggi</b>: nel calendario il giorno di oggi ha il bordo oro.',
        '<b>Excel</b>: in Crediti, Congedi e Avvisi il pulsante Excel scarica la tabella come la vedi (solo le righe rimaste dopo una ricerca).',
        '<b>Congedo non pagato</b>: si registra dalla scheda del collaboratore (Registra congedo non pagato: dal, al, motivo, autorizzato da) oppure nella scheda Piano > Congedi, dove si vedono tutti: chi, quando, quanti giorni per anno e gli effetti (vacanze prima e dopo, anzianita spostata). Nel piano i giorni diventano CNP (zero ore); ogni giorno di congedo riduce in proporzione le vacanze dell anno e sposta in avanti l anzianita (giubilei e giorni di vacanza in piu), contando i giorni gia trascorsi entro l anno.',
        '<b>Pause di venerdi e sabato con tre cassieri o piu</b>: quando si generano le pause il programma chiede chi da le pause delle casse. <b>Normale</b>: due cassieri, la cassa al primo (CD 3/4) da le pause a tutte le casse per tutta la notte e la cassa allo 0 (CD 2/7) ne da alcune dopo l 1.45, con la sua pausa alle 2.15. <b>Alternativa</b>: un cassiere solo, la cassa allo 0, da le pause a tutte le casse (sue pause alle 23.30, 1.30 e 2.45); la colonna della cassa al primo resta libera. L ultima scelta viene proposta la volta dopo.',
        '<b>Colori dall Excel</b>: importando il piano arriva il colore che si vede aprendo il file. Il programma calcola anche le regole automatiche di Excel (es. "V = blu"): quando una regola copre il colore dato a mano, vale la regola, come in Excel. I colori dati a mano (es. le X dei coordinatori in rosso) arrivano sulle stesse celle e restano modificabili; i colori delle regole sono i colori delle sigle e, se diversi dalla tabella dei turni, l amministratore puo prenderli dal file. Un colore messo per sbaglio da un import precedente si toglie reimportando; un colore dato nel programma resta. I colori usati nel mese compaiono nella tavolozza di Colora, per darli uguali ad altre celle.',
        '<b>Organico</b> (scheda del Piano): quante persone servono per coprire il fabbisogno con le regole del settore. Mese per mese confronta le ore richieste con le ore nette (contratto meno vacanze, CGF, malattie, altri impegni, congedi non pagati), controlla le persone minime per il giorno di punta e per le domeniche e calcola la riserva per le malattie improvvise (95% dei giorni). Propone le soluzioni dalla piu leggera: spostare vacanze verso i mesi con margine, piu disponibilita degli ausiliari attuali, un ausiliario stagionale, un fisso; ogni proposta mostra l effetto ricalcolato e si prova nel <b>simulatore</b>. La <b>verifica sui mesi passati</b> dice se i buchi venivano da ore mancanti o da ore disponibili non usate (distribuzione dei turni, abilitazioni). Excel e rapporto PDF per la Direzione. L amministratore la attiva o disattiva in Piano > Impostazioni; chi la vede si decide in Visibilita e permessi (Piano · Organico).',
        '<b>Azioni automatiche del piano</b>, sei permessi (Impostazioni > Visibilita e permessi; oltre ai quattro qui sotto anche Fabbisogno e Formazioni), oltre a poter modificare il piano: <b>Genera</b> (genera bozza, solver, coperture, migliora ore, valida regole, cancella la bozza), <b>Vacanze e CGF automatici</b> (importa e applica le vacanze del mese, assegna i CGF del mese), <b>Import da file</b> (piano, fabbisogno, timbrature), <b>Cancellazioni di massa</b> (piano intero anche le celle protette, tutte le vacanze, svuota il fabbisogno). Senza il permesso il bottone non compare e il database rifiuta l azione. Esportare resta libero. Il <b>fabbisogno</b> lo vedono tutti; modificarlo (celle, incolla, copia dal mese prima, import, svuota) richiede il permesso <b>Modificare il fabbisogno</b>. All inizio questi permessi li hanno Responsabile e Sostituto. Tutto il lavoro di ogni giorno resta a chiunque puo modificare il piano (Modificare il piano), anche dopo la generazione: qualsiasi cella anche protetta, malattie e coperture, cambi turno e richieste per esigenze, lucchetto, commenti, colori, la V di una persona dagli Avvisi.',
        '<b>Fine contratto</b>: nella scheda del collaboratore, sotto Inizio contratto, il pulsante + Fine contratto (solo per chi ha il permesso Storico HR, modificare; chi lo vede soltanto legge la data). Dal giorno dopo l ultimo giorno il collaboratore non e piu nel calendario dei mesi successivi, nella bozza, nelle coperture e nei cambi, e non ha ore dovute; nel mese della fine i giorni dopo sono a righe grigie. Diario, scheda, storico, vacanze e CGF restano. Togliendo la data torna operativo.',
        '<b>Crediti: dettaglio al passaggio del mouse</b>: sui numeri sottolineati a puntini compare il dettaglio: vacanze pianificate (settimane con le date), vacanze che restano (il conto), spettanti (base e anzianita), CGF maturati (festivi lavorati) e CGF goduti (date, e quelli caduti in malattia).',
        '<b>JG del mattino nelle pause</b>: se un JG comincia prima delle 11 (es. 10.00-20.00) la giornata delle pause parte da li; la mezz ora va a pranzo (12.00-13.30) e nessuna attesa supera le 3 ore.',
        '<b>Dalle liste al calendario</b>: in Avvisi, Valida regole, Cambi turno, Storico del Piano e Registro attivita un clic su una riga con un collaboratore e un giorno apre il calendario su quel mese e fa lampeggiare la cella. Nella ricerca in alto, sotto il nome di un collaboratore, "Apri nel Piano" porta alla sua cella di oggi.',
        '<b>Vacanze non nel piano</b> (Piano > Avvisi): le settimane confermate nel file vacanze i cui giorni nel piano non hanno la V (le malattie non contano). Per ogni riga: Apri nel calendario, Metti le V (i giorni chiusi chiedono un solo motivo per tutta la settimana) oppure Il piano e giusto (la vacanza non e stata fatta: la scelta resta registrata con nome, data e nota, e la riga sparisce).',
        '<b>Apri nel calendario</b>: dalle liste porta il Piano sul mese giusto e fa lampeggiare la cella del collaboratore.',
        '<b>Annulla del Piano</b>: rimette solo le celle cambiate dalla tua operazione, con tutto (orari, colori, motivo del blocco). Se nel frattempo un altro operatore ha cambiato una di quelle celle, te la mostra e scegli se riportarla indietro o lasciare la sua modifica; i giorni chiusi non si toccano e vengono elencati.',
        '<b>Incolla nel Piano</b>: come la cella scritta a mano: una M va nel Rapporto e nel Diario, una M tolta si toglie dal Diario, un CGF caduto in malattia viene rimesso, i festivi persi ricalcolano i CGF; alla fine le regole da controllare (riposo, consecutivi, ore) sono elencate e bordate di rosso.',
        '<b>Non disponibilita dal Diario (solo jolly)</b>: i giorni scelti diventano ND nel piano. Se il piano del mese e gia fatto e in quei giorni il jolly ha un turno, il programma lo dice e propone subito chi lo copre (Copertura gia compilata: alla conferma ND al jolly e turno al sostituto); rispondendo Annulla i turni diventano ND con la nota "Ex S8 - ND dal Diario" e i posti restano da coprire. Annulla, Elimina o la modifica della registrazione rimettono i turni com erano e aggiornano il modulo ND. A un collaboratore fisso la ND non si registra.',
        '<b>File vacanze: note e giorni precisi</b>: all import il programma legge anche i commenti delle celle del file. Le date scritte nel commento ("27-28 APRILE PC", "24-27.06 CONGEDO MATRIMONIO", "FINO AL 10/12") diventano dal / al della settimana: nel piano va solo quella parte (es. PC solo il 27 e 28). Le altre note (cambi, conferme) restano scritte sotto la settimana; i commenti su settimane senza X si elencano da controllare. Per correggere: scheda Vacanze, Modifica: dal / al sono il periodo vero (anche su piu settimane: il programma mette da solo le settimane, sposta la riga o ne aggiunge una per settimana); senza date vale la settimana scritta. Poi riapplica le vacanze al mese.',
        '<b>Organico in tre passi</b>: <b>1 · Situazione</b> dice in parole semplici se il personale basta (quante persone a tempo pieno servono e quante ce ne sono dopo le assenze, quali mesi o gruppi di turni restano scoperti), cosa conviene fare e i mesi in breve; <b>2 · Prova una soluzione</b>: cosa serve (postazioni, periodo, costo) e il confronto mese per mese; <b>3 · Dettagli e metodo</b>: tabelle complete, verifica sui mesi passati, metodo e costi. Excel e Rapporto PDF contengono sempre tutte le tabelle.',
        '<b>Organico, simulatore dei costi</b>: per ogni ipotesi tipo (ausiliario o fisso), quante persone, dal / al (date), orario dalle / alle con i giorni a settimana (diventa la percentuale: 20:00-02:00 per 5 giorni = 30 ore) oppure la percentuale, e il costo orario. Al costo si aggiungono, con le percentuali delle Regole, il notturno (10% sulle ore fra le 23 e le 6) e per gli ausiliari le indennita di vacanze (8.33%) e tredicesima (8.33%). Ogni ipotesi mostra il suo costo e le ore; il totale e nel Risultato.',
        '<b>Organico, calcolo del fabbisogno</b>: periodo dal / al, ausiliari o fissi con la loro percentuale, costo orario e le postazioni che servono (dalle, alle, giorni della settimana, persone insieme), per esempio una persona dalle 15 alle 18 e una dalle 16 alle 22 dal lunedi al giovedi. Calcola le ore sui giorni veri (anche di notte), quanti collaboratori servono (per le ore e per avere sempre le persone insieme, con le assenze medie dello storico) e il costo secondo il RAP (Allegato 1): per gli ausiliari si sceglie se il prezzo orario e il SALARIO DI BASE (si aggiungono indennita vacanze 8.33% o 10.65% con 5 settimane e tredicesima 8.33%, pagate con le ore lavorate) o COMPRENSIVO (gia dentro); sempre a parte il notturno 10% sulle ore fra le 23 e le 6 e, per gli ausiliari, il 50% nei nove festivi parificati del periodo. Gli oneri sociali del datore di lavoro non sono compresi. Aggiungi al confronto mette quelle persone nel confronto mese per mese (stesso selettore anche li). Stampa: periodo, dati, postazioni, risultato e come si legge, su un foglio A4. Riposi settimanali, malattie e vacanze sono gia compresi nel numero di persone (ore nette di ognuno meno le assenze medie dello storico, piu le persone che devono essere insieme); non controlla riposi minimi e giorni di fila persona per persona.',
        '<b>Collaboratore in evidenza</b>: selezionando una cella del calendario (turno) o delle colonne delle ore, il nome del collaboratore della riga si colora di verde con una barra arancione.',
        '<b>Import del piano e mese in corso</b>: importando il piano di un mese (es. novembre), se il file contiene anche il foglio del mese in corso (ottobre) con differenze dal programma, il programma lo dice e chiede se aggiornare anche quello, con le stesse regole (giorni chiusi, malattie, celle bloccate e altri settori restano). Se ottobre nel file e uguale non chiede niente.',
        '<b>Fabbisogno dal file del piano</b>: importando il piano Excel di un mese, il programma legge anche il fabbisogno dallo stesso file (sezione PIANIFICAZIONE del foglio del mese). Se il mese non ha ancora un fabbisogno lo carica da solo; se ce n e uno diverso chiede se sostituirlo; se e uguale non fa niente. Se il file non ha la sezione PIANIFICAZIONE (es. Cleaning) e il mese non ha fabbisogno, propone di crearlo dai turni del piano importato (quante persone per turno ogni giorno). Serve il permesso Modificare il fabbisogno.',
        '<b>Disattivare un collaboratore che lascia</b> (amministratore): Impostazioni > Gestione collaboratori > Disattiva chiede l ultimo giorno di lavoro (proposto oggi). Con Fine contratto (consigliato) fino a quel giorno resta tutto (piano, ore, saldo, Diario, storico); dal giorno dopo non e piu nel calendario dei mesi dopo, nella bozza, nella generazione, nelle coperture e nei cambi e non ha ore dovute. I turni gia scritti dopo quella data vengono segnalati (a righe grigie) e restano finche non li sposti. Nell elenco compare il bollino fine contratto. La stessa data si vede e si toglie nella scheda > Storico HR. Rimuovi del tutto e solo per chi non e mai entrato o e stato inserito per errore. Per cambiare la data o togliere la fine contratto: di nuovo Disattiva (la finestra propone la data salvata e la scelta Torna operativo). Importando il piano Excel: chi e disattivato resta disattivato e le sue celle non si importano; a chi ha una fine contratto non si importano le celle dopo quella data; chi non compare nel file si propone di fermarlo con la fine contratto all ultimo giorno del mese prima (non piu disattivato del tutto).',
        '<b>Giorni chiusi nelle azioni automatiche</b>: Applica vacanze, Assegna CGF, Migliora ore e la bozza lavorano solo dal primo giorno aperto in poi. Nei giorni chiusi non cancellano e non scrivono niente; Applica vacanze elenca le differenze rimaste (previsto V, oggi vuoto) da correggere con lo sblocco.',
        '<b>Domeniche libere valide (C rossa)</b>: nel calendario la lettera della domenica diventa ROSSA quando quella domenica conta per le 12 dell anno: domenica non lavorata, non in vacanza o malattia, e sabato finito entro le 23. Un sabato di malattia (dal piano, dal Rapporto o dal Diario) non si lavora, quindi la domenica dopo diventa rossa da sola. Se un cambio turno, un cambio per esigenze, una copertura malattia o una modifica a mano toglie una domenica rossa (turno di domenica o sabato che finisce dopo le 23), il programma avvisa prima di salvare, dice quante domeniche valide restano nell anno e chiede conferma; la conferma resta nello storico.',
        '<b>Riposo attorno alla domenica</b>: dalla fine dell ultimo turno all inizio del successivo. Domenica libera: almeno 35 ore consecutive (24 della domenica + 11) comprese le 23 del sabato e le 23 della domenica. Domenica lavorata (anche quando il sabato finisce dopo le 23): almeno 47 ore consecutive (36 + 11) nella settimana prima oppure in quella dopo (lunedi-sabato). Il programma avvisa sulla cella, in Valida regole e in Piano > Avvisi > Riposo settimanale (con da quando a quando); la bozza a fine mese sposta un turno a un collega libero per creare il riposo, e dice se qualcosa resta da sistemare a mano. I valori si cambiano in Regole (riposo_domenica_libera_ore, riposo_domenica_lavorata_ore).',
        '<b>Ore della malattia</b>: la malattia continua (giorni uno dopo l altro, anche con prolungamenti attaccati; un giorno senza malattia in mezzo, anche un riposo, la interrompe) vale: dal 1. al 14. giorno le ore del turno che la persona aveva quel giorno, da orologio e MAI con il 10% notturno (es. R23 8.17, non 8.67); un riposo C vale 0 (MC) ma conta come giorno; una V vale le ore della V e la vacanza torna da recuperare; dal 15. giorno 41 ore settimanali / 7 = 5.857 ore per ogni giorno di calendario, che lavorasse o no. Le M importate dall Excel senza la sigla coperta valgono il codice M nei primi 14 giorni.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: calendario',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni riga e un collaboratore, ogni colonna un giorno. Un clic seleziona la cella; si scrive la sigla del turno con <b>doppio clic</b>, Invio o F2, oppure scrivendo direttamente sulla cella selezionata (Invio salva, Esc annulla, Canc svuota). Una sigla che non esiste viene rifiutata con un <b>avviso rosso</b> che dice quale sigla hai scritto, in quale settore non esiste e, se c e, la sigla piu simile ("Forse intendevi C0?"); la cella lampeggia in rosso e torna com era.',
        '<b>Lucchetto</b>: con il tasto destro, <b>Blocca questa cella (con motivo)</b> scrive il motivo (visita medica, corso, appuntamento) e mette un <b>lucchetto rosso</b> nella cella. Chi prova a cambiarla legge il motivo; scambi turno, cerca cambio e copertura malattia la saltano. <b>Sblocca</b> compare solo sulle celle bloccate cosi: le celle "protette" dall importazione (piano consolidato, vacanze) non hanno lucchetto e si sovrascrivono con una conferma.',
        '<b>Tasto destro</b> o pressione lunga su una cella: modifica, commento, cambio turno con un collega, cambio per esigenze operative, rimozione, stampa.',
        "Si seleziona come in Excel: trascinando col mouse, oppure cliccando l'intestazione di un giorno per l'intera colonna. Sulla selezione funzionano <b>Canc</b> (con conferma), <b>Ctrl+C</b> e i colori.",
        'La barra in basso a destra mostra <b>somma, media, minimo e massimo</b> delle celle selezionate. Vale anche per le colonne delle ore, dove con Ctrl+click prendi celle sparse.',
        '<b>Annulla e Ripristina</b>: la barra in basso (o Ctrl+Z e Ctrl+Y fuori dai campi) annulla l ultima cosa fatta in tutto il programma, anche nel calendario, fino a 15 passaggi per mese e settore (30 azioni nel resto del programma); premendo piu volte si torna indietro di piu passi. Vale finche la pagina resta aperta. Il bottone rosso <b>Annulla tutto</b> riporta il mese a com era a inizio sessione.',
        'Segni nelle celle: triangolo = commento, <b>M</b> = malattia dal Diario. La malattia registrata nel Diario prevale su qualsiasi sigla del giorno: turno, V, CGF, JG, C diventano M protetta, con la sigla coperta scritta nel commento ("era V"). Il giorno di vacanza torna disponibile (colonna "Restituite per malattia" nella scheda Vacanze), il CGF resta a credito, il turno perso conta come malattia. Se la malattia viene tolta dal Diario, la sigla coperta torna al suo posto. Le vecchie celle <b>MC</b> e <b>MCG</b> (malattia sopra C o CGF di prima di questa regola) restano leggibili.',
        'Colonne finali: <b>OL</b> (ore effettivamente lavorate: dall entrata all uscita, senza il supplemento del 10% notturno e senza malattie, vacanze, CGF, permessi, maternita, matrimonio, militare, nascita, protezione civile, trasloco e assistenza familiare), <b>D</b> e <b>N</b> (turni diurni e notturni), <b>OD</b> (ore dovute), <b>OP</b> (ore pianificate: turni piu le assenze retribuite come le vacanze, e la cifra che fa il saldo), <b>SM</b> (saldo del mese: OP meno OD), <b>YTD</b> (saldo dell anno, uguale alla scheda Saldo: comprende il riporto, e i mesi gia dentro il riporto non si contano due volte). Si aggiornano da sole a ogni modifica. Le <b>assenze retribuite</b> (vacanza, malattia, infortunio, CGF, permesso, maternita, matrimonio, militare, nascita, protezione civile, trasloco, assistenza familiare, funerale) valgono in ore <b>secondo la percentuale d impiego</b>: una giornata di vacanza vale 5.857 ore al 100%, 4.686 all 80% e 2.929 al 50%. Le ore di presenza effettiva (corsi, JG, ufficio, uscita per servizio, formazione) restano invece fisse per tutti. Per gli <b>ausiliari (jolly)</b> le vacanze valgono <b>zero ore</b>: la loro indennita di vacanza e gia compresa e pagata nel salario dei giorni lavorati (RAP Allegato 1), quindi contarle anche in ore le farebbe risultare due volte. L elenco dei codici trattati cosi si regola nella scheda Regole (jolly_codici_gia_pagati). La spunta si regola voce per voce nella scheda Codici.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: generare il mese',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        "L'ordine giusto e: <b>Vacanze</b> (applica al piano) → <b>Fabbisogno</b> (quante persone per turno) → <b>Genera bozza</b> → <b>Valida regole</b> → se serve <b>Completa con coperture</b>.",
        '<b>Genera bozza</b> riempie il fabbisogno usando solo i collaboratori del settore e ti elenca i posti rimasti scoperti. Prima dei turni prenota i giorni che spettano: il <b>compleanno</b> (congedo C con la nota "Compleanno", anche per chi lavora in due settori, dove la cella e una sola e si vede in entrambi i piani) e i <b>recuperi festivi arretrati</b>. I giorni gia chiusi (passati) non vengono toccati. Se alla conferma rispondi Annulla, il mese torna esattamente com era.',
        'Chi ha giorni di vacanza, malattia o recupero nel mese riceve turni solo fino alle ore dovute: quei codici valgono ore anche per la bozza, come nel validatore e nel calendario.',
        '<b>Completa con coperture</b> compare solo se qualcuno e abilitato a coprire da un altro settore: tappa i buchi rimasti rispettando i limiti della sua scheda. Va usato dopo aver generato i piani degli altri reparti.',
        '<b>Valida regole</b> elenca le violazioni (riposi, giorni consecutivi, idoneita, ore fuori tolleranza). <b>Migliora ore</b> riequilibra chi e lontano dal proprio obiettivo.',
        '<b>Migliora la bozza</b> (dopo Genera bozza): scegli il tempo (1, 3, 5 o 10 minuti) e il programma prova scambi e spostamenti fra le celle della bozza, tenendo solo quelli che migliorano: prima le regole di legge (riposi, giorni di fila, ore della settimana, domenica), poi le altre regole, poi i posti scoperti, poi le ore di ognuno. Piu tempo ha, migliore e il risultato. Alla fine mostra prima e dopo, controllati con Valida regole, e chiede se applicare; si applica solo se nessuna regola peggiora e i posti scoperti non aumentano. Non mette mai due persone su un posto gia coperto (turni oltre il fabbisogno): se a qualcuno mancano ore e il fabbisogno e pieno, resta sotto il minimo e lo segnala (e un tema di organico). Non tocca vacanze, malattie, celle protette o bloccate, inserimenti a mano, giorni chiusi. Si puo fermare prima e si annulla con Annulla del piano.',
        '<b>Passata di riparazione</b>: dopo il primo giro, per ogni posto rimasto scoperto la bozza prova a spostare un turno appena assegnato a chi e idoneo al posto scoperto, dando il suo turno a un collega libero: tutte le regole valgono per entrambi. I posti che restano scoperti sono quelli senza nessuna combinazione valida.',
        '<b>Genera con il solver</b> compare solo se l amministratore ha scritto l indirizzo del servizio sul server interno (Piano · Impostazioni): e il motore di ottimizzazione globale (OR-Tools) che calcola il piano ottimo del mese con equita garantita. Senza servizio resta la bozza integrata.',
        '<b>Cancella piano</b> agisce solo sul mese e sul settore che stai guardando: puoi togliere solo le celle generate oppure tutte, e in ogni caso si torna indietro con Annulla.',
        '<b>Generazione automatica</b> (Piano · Impostazioni, solo amministratore): per ogni settore si sceglie il giorno del mese (1-28 o l ultimo) e i minuti di Migliora la bozza. Da quel giorno in poi il primo PC con il programma aperto genera il piano del mese dopo: vacanze, congedi, CGF, compleanni, turni, poi lo migliora. Se il PC si accende piu tardi la fa appena acceso; con piu PC accesi la fa uno solo, una volta. Non servono permessi a chi ha il programma aperto: il database gli concede, solo per quei minuti, di scrivere le celle generate di quel mese e settore. Le vacanze dell anno devono essere importate: se mancano aspetta e avvisa. Non tocca mai le celle scritte a mano (se una vacanza cade su una cella scritta a mano la lascia e la segnala); se il mese ha gia una bozza non la rifa. Alla fine chi ha il permesso Genera bozza riceve una nota con il resoconto; Riprova nelle Impostazioni la rimette da fare. Mentre genera si lavora normalmente: sul PC che la fa solo la pagina Piano mostra un avviso per qualche minuto; sugli altri PC, aprendo quel mese, compare "Generazione automatica in corso" ma niente e bloccato, e se qualcuno modifica a mano una cella in quei minuti la sua modifica vince (il programma la salta e lo scrive nel resoconto). Lo stesso vale per Migliora la bozza.',
        '<b>Solo notturni e giorni di lavoro</b> (Piano · Impostazioni · Preferenze collaboratori): oltre a Solo diurni si puo segnare Solo notturni (riceve solo turni notturni) e i giorni della settimana in cui uno lavora (es. solo V e S). Negli altri giorni non viene mai proposto: bozza, Migliora, generazione automatica, cerca cambio, copertura malattia e assenze. Nessuna spunta = tutti i giorni. Scrivendo a mano un turno contro la preferenza il programma avvisa; Valida regole segnala i turni gia nel piano in giorni esclusi (es. rimasti da una bozza fatta prima di cambiare la preferenza: la bozza riempie solo le celle vuote, per rifarla si usa Cancella piano e poi Genera).',
        '<b>Giorni a settimana</b> (Preferenze collaboratori, accanto ai giorni): quanti giorni di lavoro al massimo nella settimana lunedi-domenica. Con piu giorni spuntati (es. G V S D e 3) il programma sceglie ogni settimana quali dare, cosi le domeniche libere ruotano. Se uno puo lavorare la domenica e ha tanti giorni a settimana quanti quelli spuntati (es. solo V S D), il programma avvisa che le domeniche libere del regolamento non sono garantite. Il limite vale per bozza, Migliora, generazione automatica, cerca cambio, copertura malattia, Migliora ore; Valida lo segnala. Preferisce L1 e Accoglienza si vedono solo nelle Slots.',
        '<b>Turni per livello di Formazione</b> (Piano · Regole · Regole di gruppo, amministratore): il livello di ognuno e quello di Formazione (L2 = tutte le competenze fino a L2 certificate). Regola <b>Turni per livello</b>, es. <code>10,10C,9:L2</code> = quei turni dal livello L2 in su, <code>1,21:L1-L2</code> = solo L1 e L2. Regola <b>Minimo di un livello al giorno</b>, es. <code>L3:2:NOTTURNO:4,5</code> = venerdi e sabato almeno 2 persone di livello L3 o piu sui turni notturni. Sotto ogni regola il numero di persone che la soddisfano (in rosso se troppo poche). Eccezioni per persona in Preferenze collaboratori, <b>Turni consentiti</b>. Le usano bozza, Migliora, generazione automatica, cerca cambio, copertura malattia e Valida; a mano un avviso. Quando qualcuno sale di livello in Formazione i turni si aprono da soli.',
        '<b>Proposte con le regole di Valida</b> (07-08.10): cerca cambio, copertura malattia e ND, Migliora ore e l avviso quando si scrive a mano usano le stesse regole di Valida (riposo con gli orari veri e i JG, giorni di fila nei due sensi, riposo singolo dopo 4 giorni, ore della settimana, riposo attorno alla domenica, giorni a settimana, chi fa cosa per giorno, ND e malattie del Diario). Un sostituto si propone solo se non crea nessuna violazione nuova: in qualche giorno puo non esserci nessuno, e voluto. Non si usano mai il compleanno, le celle con lucchetto e le C messe attorno alle vacanze.',
        '<b>Import del piano: lucchetto e celle tolte</b>: un commento di visita medica (o controllo, certificato medico) su una cella del file la blocca con il lucchetto e quel motivo, come a mano. Una cella vuota nel file, per una persona del file e in un giorno che il file ha, si svuota anche nel piano (elenco nella conferma); restano malattie, ND, vacanze, celle con lucchetto e riposi messi dal programma. Le note con un orario (DALLE 14:30, ore 10:00) non perdono piu il testo.',
        '<b>Migliora ore</b>: ogni spostamento di turno da chi e sopra a chi e sotto le ore si fa solo se non crea nessuna violazione nuova per nessuno dei due (le stesse regole di Valida: riposo singolo dopo 4 giorni, riposo attorno alla domenica, ore della settimana, giorni a settimana, accompagnamento). Prima controllava solo riposo di 11 ore e giorni di fila.',
        '<b>Fine contratto: celle chiuse</b>: dopo la data di fine contratto (Gestione collaboratori · Disattiva) le celle di quel collaboratore non si modificano piu, ne a mano ne incollando: si possono solo svuotare. Per scrivere ancora si cambia o si toglie la data da Disattiva o dalla scheda · Storico HR.',
        '<b>Turni bloccati per chi non e formato</b> (Piano · Impostazioni · Preferenze collaboratori, amministratore): per ogni settore i turni che puo fare solo chi copre certi reparti. Slots: S1 e S3, che danno le pause in cassa e reception, solo a chi copre SALA, REC e CASSA. Un reparto e coperto con la competenza certificata in Formazione oppure con turni di quel reparto lavorati nell ultimo anno. <b>Applica ora</b> mostra chi non ha i requisiti, con il motivo (es. "manca CASSA"), e blocca dopo la conferma. Ogni collaboratore nuovo, da qualsiasi strada, parte gia con questi turni bloccati; all import Excel non chi nel file fa gia turni di tutti quei reparti. Poi si cambiano a mano nella sua riga. I turni bloccati non vengono mai proposti (bozza, Migliora la bozza, Cerca cambio, coperture, formazioni), ma chi li scrive o li scambia a mano non riceve avvisi: restano turni di sala. L avviso "non formato" resta per un reparto davvero non formato (es. un turno di cassa a chi fa solo sala).',
        '<b>Confine fra due mesi</b>: Valida regole conta anche la fine del mese prima (riposo fra il 31 e l 1, giorni di fila, 4+1+1). Se un cambio di fine mese rompe una regola di legge nei primi giorni del mese dopo gia pianificato, nel calendario compare il riquadro "da ricontrollare" in tutti e due i mesi, finche il problema c e. <b>Proponi correzione</b> (permesso Genera bozza) cerca pochi cambi fra le celle generate dei primi 10 giorni, mostra prima e dopo e scrive solo se confermi; le celle scritte a mano non si spostano.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: briefing e pause',
      vis: () => _guidaVis('piano'),
      righe: [
        'La data parte da <b>domani</b>. <b>Compila dal piano</b> riempie nomi e turni del giorno; ogni cella si modifica, ogni riga ha il piu per inserire sotto e la crocetta per eliminare; le righe si riordinano trascinandole.',
        'I <b>numeri di cassa</b> si assegnano da soli con la regola "chi chiude riapre": le casse che finiscono piu tardi aprono il giorno dopo di presto. Restano modificabili a mano.',
        'Le colonne <b>E</b> e <b>U</b> restano vuote apposta: si spuntano a penna sul foglio stampato.',
        '<b>Copiare per un email</b>: seleziona trascinando (anche le intestazioni, es. HOST), poi tasto destro: <b>Copia</b> incolla una tabella con colori e bordi, <b>Copia come immagine</b> incolla un immagine (se il browser non lo permette, la scarica come file). Nello stesso menu Taglia, Incolla e Cancella contenuto.',
        'Per colorare o evidenziare: <b>clicca la cella</b> per marcarla, con Ctrl aggiungi le altre, poi <b>Colora</b> applica il colore della barretta, la freccia ne sceglie un altro, <b>G</b> mette il grassetto e <b>C</b> il corsivo.',
        '<b>Genera pause</b> crea la distribuzione delle pause; anche queste si modificano cella per cella. Le stampe sono in PDF A4, sempre su un foglio solo.',
        '<b>Stampa briefing</b> (Slots, Valet e altri settori): sempre in verticale e su un foglio solo; le colonne si allargano in automatico quanto il testo piu lungo e il carattere e il piu grande che ci sta. Un nome lunghissimo va a capo invece di rimpicciolire tutto; negli Slots il riquadro ORARI va sotto la tabella quando serve spazio.',
        'Slots, da <b>lunedi a giovedi</b>, quando S3 fa anche R24: S3 va in pausa <b>22.15-22.30</b> e fa R24 <b>22.30-23.00</b>; chi gli da il cambio (S7C, S7 o S5) copre S3 alle 22.15 e poi resta in sala fino alle 23.45. La domenica lo schema resta R24 22.15-22.45 e pausa 22.45.',
        '<b>Annulla</b> e <b>Ripristina</b> nel briefing (la barra generale in basso, oppure Ctrl+Z e Ctrl+Y): valgono per tutto il giorno aperto, righe e pause insieme: nomi, turni, numeri cassa, colori e formato, righe aggiunte o tolte, pause generate, spostate, scritte o eliminate.',
        '<b>Pausa e cambio si spostano insieme</b>: quando la pausa di un collega e il cambio che gli da un altro hanno lo stesso orario (per esempio S3 di Sassi e la riga S3 di Nicole), spostando (trascinando) la PAUSA si sposta da solo anche il cambio: dove c era il cambio torna SALA e le sale vicine si uniscono. Vale anche al contrario: spostando il cambio si sposta la pausa, se basta uno scambio con la riga vicina. Compare un avviso con il pulsante Annulla. Le righe che sono solo rotazioni (per esempio C8 in cassa il venerdi e il sabato) non vengono toccate.',
        'Se pausa e cambio non coincidono piu (spostati o scritti a mano) compare un <b>avviso rosso</b> che dice chi e scoperto e le righe interessate sono bordate di rosso. L avviso non blocca nulla: si corregge con le frecce, scrivendo nelle celle o con Annulla.',
        '<b>Regola delle ore sempre controllata</b> (Slots): da 6 ore 15+15, da 7 ore 30+15, da 8 ore in su 30+15+15, per ogni persona del briefing, anche per chi non ha una colonna (le sue pause sono le righe di chi gli da il cambio). Il riquadro <b>Da controllare</b> elenca cosa non torna: pause mancanti o in piu, meno di un ora fra due pause, pause fuori dal turno, righe che non coprono la pausa di nessuno, e i momenti in cui <b>in sala non resta nessuno</b> (per esempio quando l unico in sala sta dando i cambi in cassa). Sono avvisi: non bloccano nulla.',
        '<b>Proposte del programma</b>: quando lo schema non da a qualcuno tutte le pause della regola (per esempio S31, il secondo C0 o il secondo quarto d ora serale di S5 il venerdi), il programma le propone come farebbe un responsabile. In sala e al rec la persona va in pausa da solo se nel reparto resta un collega (riceve una sua colonnina con tutte le pause); in cassa serve un cambio da chi e formato in cassa ed e libero; le pause stanno ad almeno un ora dalle altre (meglio un ora e mezza), non nella prima ne nell ultima mezz ora del turno. Quando tutto rispetta le regole queste sistemazioni si applicano da sole e restano elencate nel riquadro <b>Sistemato dal programma</b> (si apre con un clic). Solo nei casi eccezionali il foglio chiede conferma: righe bordate di blu e riquadro <b>Da confermare</b> con il motivo (una postazione resta senza cambio, restano avvisi, molte righe dello schema abituale spostate); <b>Tengo le proposte</b> conferma. Se per una cassa nessuno puo dare il cambio, la proposta e scritta in rosso.',
        '<b>Sistemazione automatica</b>: nelle giornate normali lo schema resta com e. Solo se c e un problema vero (sala vuota, avvisi, pausa nella prima o nell ultima mezz ora del turno) il programma sposta cambi e pause con le stesse mosse che faresti trascinando le righe (quarto d ora dentro la sala o scambio con la riga vicina, con pausa e cambio collegati insieme); una mossa che lascia la sala vuota o crea un avviso non si fa mai. Ogni spostamento e elencato con il motivo. Le attese lunghe senza pausa (di base oltre 3 ore) non si spostano da sole: compaiono in <b>Da tenere d occhio</b> e decidi tu trascinando le righe. Si accende, si spegne e si sceglie il massimo in Regole pause > Sistemazione automatica.',
        '<b>Jolly Giornata (JG)</b>: quando premi Genera pause il programma chiede per ogni JG dove lavora oggi (le scelte del settore: negli Slots sala, rec, cassa, accoglienza, sup) oppure se e a un corso, con l orario di inizio e fine. In sala, al rec o in cassa conta per quel reparto (per esempio la sala non risulta vuota se c e un JG in sala) e riceve le pause della regola delle ore; in accoglienza si organizza da solo come S31; sup e corso non contano. Se il commento del Piano dice CORSO propone corso, e un orario scritto nel commento (es. 15:30-19_30, dalle 18.00 alle 03.00) lo propone nelle caselle. L orario si salva nella cella del Piano e la scelta nel foglio pause: la volta dopo non lo richiede.',
        '<b>Sala mai vuota</b>: la sigla di ogni riga dice dove si trova chi la fa (S sala, C cassa, R rec: S1 con S22 e in sala al posto di S22). I responsabili (Z) non contano. Se in un momento nessuno resta in sala, per esempio S3 in cassa a dare i cambi mentre S7 e in pausa, il programma prova gli spostamenti che si farebbero trascinando le righe e applica quello che risolve senza creare altri problemi ("pausa spostata da 21.30 a 20.00, cosi la sala non resta vuota"). Se non si puo (per esempio il pomeriggio c e un solo turno di sala e deve dare i cambi in cassa), resta l avviso. I fogli generati prima della versione 304 si controllano con il bigliettino del mattino ricavato dal briefing; per avere anche le proposte basta premere di nuovo Genera pause.',
        '<b>Bigliettino del mattino</b>: C4 (cassa tavoli, dalle 11.40) da la mezz ora ai due R22 fra le 12.00 e le 13.00 e a S22 alle 13.00, poi va in pausa 13.30-14.00. Il bigliettino con i nomi del giorno e sotto le pause, con <b>Stampa bigliettino</b> (foglio piccolo da tagliare); queste pause contano nella regola delle ore.',
        'Nel foglio pause la <b>x sull intestazione</b> di una colonna (dove c e il nome) elimina <b>tutta la colonna</b> con le sue righe, dopo una conferma; si rimette con Annulla. Il + sull intestazione aggiunge una riga sotto l orario del turno. <b>Elimina pause</b>, in fondo, cancella invece tutto il foglio del giorno.',
        '<b>Formazione</b>: chi nel piano ha nel commento della cella "formazione" (o "affiancamento") e ha un collega sullo stesso turno va con lui: stessa postazione e stesse pause, e per le pause conta come una persona sola (R22, S22, casse, qualsiasi turno; anche se il commento e scritto su tutti e due). Nel foglio e nella stampa c e la riga <b>In formazione</b> con chi va con chi. Chi ha "formazione" ma e solo sul suo turno e una persona normale.',
        '<b>Accoglienza</b> (i turni del gruppo ACCOGLIENZA nella tabella Turni, es. S31): si organizzano da soli. Il programma suggerisce le loro pause in una colonna, senza avvisi e senza proposte, e al loro posto non contano come presenza in sala (quando coprono qualcuno in sala si). ',
        '<b>Facoltative</b>: sotto il foglio, nella sezione Facoltative, ci sono le colonne dell accoglienza, quelle di chi va in pausa da solo avendo un collega sullo stesso turno (es. il secondo S5) e il bigliettino di C4. Si modificano come le altre; non entrano nel foglio stampato, a meno di spuntare <b>nel foglio stampato</b>, e ognuna ha <b>Stampa bigliettino</b> per stamparla a parte su un foglietto. Annulla torna indietro di un passo alla volta: se sposti una riga e poi la rimetti, servono due Annulla per tornare all inizio.',
        '<b>Frecce vicino a una riga SALA</b> (o REC, CASSA): un cambio o una pausa non salta oltre tutta la riga libera ma si sposta di un quarto d ora alla volta, fermandosi solo dove la sala resta coperta da un altro collega (es. S7 01.45 in su con S3 in cassa alle 01.30 e in sala fino alle 01.15: va subito a 01.00-01.15); la sala si divide e si riunisce da sola. Vale per tutti i cambi e le pause; se il cambio e collegato alla pausa di chi ha una colonna (es. S3 dato da Nicole a Sassi) anche la pausa si sposta di un quarto d ora, e se non puo seguire si fa lo scambio intero.',
        'Formazione: se la scritta FORMAZIONE e su due persone dello stesso turno (formatore e allievo) sono loro la coppia e vanno in pausa insieme; se e su una sola persona va con un collega del suo turno.',
        '<b>Cassa il venerdi e il sabato</b>: con due che danno le pause in cassa (es. CD 03 dalle 21.00 e CD 07 dalle 01.45) le pause che CD 07 riceve prima della sua colonna stanno nelle righe C8 della colonna di CD 03, e il controllo le conta come sue (non segna piu rosso chi le ha). Chi da le pause in cassa resta in cassa: il venerdi e il sabato il programma non gli fa coprire pause di sala (es. un S5).',
        '<b>S5</b>: nel foglio le pause del secondo S5 le da chi e libero in sala (es. S7 alle 24.45, scritto S5 con il nome); se nessuno e libero va in pausa da solo. Con due o piu S5, nelle Facoltative c e anche la colonna <b>S5 ALT.</b> (S5 tra loro) per ognuno: si danno le pause fra loro in modo equo, la mezz ora una dopo l altra (es. 19.30-20.00 e 20.00-20.30) e poi i quarti distribuiti fino a fine turno, con l ordine che si alterna; chi rientra copre il collega. E un alternativa al foglio: i controlli la accettano se e giusta e non la sommano alle pause del foglio.',
        'Chi non da cambi (es. S5, S7C, R22 che vanno in pausa da soli) non riceve un bigliettino: la sua colonnina e fra le Facoltative sotto il foglio, si stampa solo se spuntata, e le sue pause restano nei controlli.',
        'Venerdi e sabato con due S7, S1 e S5: l S7 che da i cambi va in pausa alle 20.30 mentre l S1 e in sala, alle 21.00 da la mezz ora all altro S7 e alle 21.30 il quarto d ora all S5, cosi l S5 non va in pausa troppo tardi.',
        'Nel briefing le colonne si allargano da sole quanto il testo piu lungo (anche mentre scrivi un cognome lungo) e le sigle dei turni stanno al centro della casella, a schermo e in stampa.',
        'La stessa persona non fa mai due colonne nello stesso orario: se chi da i cambi di sala e rec e anche il primo candidato per i cambi di cassa, questi passano a un altro collega. La stampa delle pause resta sempre su un foglio solo: con molte colonnine si usa una quarta colonna e il testo si rimpicciolisce quanto serve.',
        '<b>Regole pause</b> (admin, sotto le pause): ogni settore ha il suo elenco di regole in parole semplici, con Modifica ed Elimina, e si creano nuove regole con <b>Nuova regola</b>: pause per durata del turno (regola di partenza: 6 ore = 15+15, 7 ore = 30+15, da 8 ore in su = 30+15+15), pause di un turno preciso (S3: 15+15, oppure 0 = nessuna), distanza minima fra pause, fascia senza pause (es. venerdi e sabato dalle 23.00 alle 01.00), persone in pausa insieme, nota in fondo al foglio. Le pause si scrivono come somma di minuti. Le regole per durata e per turno possono valere solo in certi giorni (Lun-Gio, Ven-Sab, Dom): cosi le pause cambiano fra settimana, fine settimana e domenica, come negli schemi di sempre.',
        'Ogni regola viene controllata quando la salvi: una sigla che nel settore non esiste, un orario scritto male o due regole che si accavallano vengono segnalati subito. La tabella "turni, orari e pause che risultano" mostra per ogni turno le pause e da quale regola vengono. Negli Slots gli schemi di copertura restano quelli di sempre: le regole decidono quante pause e quanto lunghe, e le pause fuori regola vengono elencate in giallo sotto il foglio. Negli altri settori guidano direttamente la generazione. <b>Ripristina regole di partenza</b> riporta il settore alle regole iniziali.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: crediti',
      vis: () => _guidaVis('piano'),
      righe: [
        'La scheda <b>Crediti</b> mostra per ogni collaboratore del settore quello che gli resta o che deve recuperare: vacanze spettanti, pianificate, restituite per malattia e quante restano; CGF riportati, maturati, goduti e quanti restano (fino alla fine del mese aperto, mai i mesi futuri); saldo ore dell anno (con il pulsante Calcola, come nella scheda Saldo); recupero ore del mese aperto; giorni di congedo non pagato. Clic sulla riga per il dettaglio, Stampa per il foglio A4.',
        'Sono gli stessi numeri delle schede Vacanze, Festivi, Saldo e Recupero ore, senza calcoli nuovi. Chi la vede si decide in Visibilita e permessi (Piano · Crediti). La stessa riga di riepilogo compare in fondo alla scheda del collaboratore.',
        'Il congedo del compleanno e le celle bloccate con motivo (visita medica, corso) non vengono mai usati per coprire una malattia ne proposti negli scambi: contano come giorni riservati.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: vacanze',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni settimana e <b>Definitiva</b> o <b>Provvisoria</b> (clic sul badge per cambiare, se hai il permesso). Definitiva = va nel piano con Applica al piano e conta fra le pianificate e nel saldo; provvisoria = resta in elenco in giallo, in attesa, senza toccare il piano ne il saldo. Le settimane importate dal file HR sono definitive; quelle aggiunte a mano nascono definitive, togli la spunta se non e ancora sicura. Il cambio resta nel registro attivita.',
        'Le vacanze si assegnano a <b>settimane intere</b> (da lunedi a domenica) per collaboratore e per anno.',
        '<b>Applica al piano</b> scrive le V protette, i congedi C prima e dopo la vacanza in base alla percentuale e il giorno diurno obbligato prima della partenza.',
        'Le regole aziendali da rispettare: settimane a blocchi di sette giorni, nei settori con piu di otto persone si pianifica in vacanza uno ogni otto o nove collaboratori, nei settori piu piccoli mai piu di due contemporaneamente.',
        'Le vacanze si <b>importano dal file HR</b> sia in Excel sia in PDF: il programma riconosce i collaboratori dai nomi, anche con refusi o abbreviazioni, e mostra chi ha trovato prima di sostituire.',
        'Nel file, oltre alla <b>X</b> (vacanza), si puo scrivere una <b>sigla del Piano</b> sulla settimana: per esempio <b>PC</b> (Protezione Civile) o <b>MT</b> (Matrimonio). Maiuscole o minuscole e uguale. Queste settimane compaiono nella scheda con la loro sigla, <b>non contano come vacanza</b> e con Applica al piano vanno nel calendario con la loro sigla e gli stessi C prima e dopo delle vacanze. Un simbolo che non e una sigla del Piano viene segnalato e non importato.',
        '<b>Reimportare il file</b> non cancella tutto: il programma confronta il file con l archivio e mostra, persona per persona, le settimane nuove, quelle tolte e quelle con la sigla cambiata; cambia solo quelle. Le settimane uguali restano come sono, anche se erano Provvisoria.',
        'Con <b>Scarica Excel</b> e <b>Scarica PDF</b> ottieni la scheda vacanze del settore nello stesso formato del file HR; il PDF si apre in anteprima prima di salvare.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: turni, codici e regole',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Turni</b>: orari, ore, tipo diurno o notturno e colore. Sono <b>divisi per settore</b>, quindi due reparti possono usare la stessa sigla senza confondersi.',
        '<b>Codici speciali</b> (V, M, C, CGF, ND, ASS e simili) sono comuni a tutti i settori.',
        '<b>Regole del piano</b>: ogni regola ha un nome in italiano semplice, un valore (numero oppure Si / No), la colonna <b>Dove agisce</b> che dice in quali schermate conta, e sotto il nome tecnico con la <b>fonte</b> (RAP, direttiva 16-007, legge sul lavoro). Sono raggruppate per tema: riposo, domeniche, ore e saldo, festivi e recuperi, vacanze, ausiliari, funzioni, orari di chiusura, giorni chiusi, congedi non pagati. Se domani cambia il regolamento si aggiorna il numero, senza toccare il programma.',
        '<b>Per un settore</b>: nel menu in alto della scheda Regole scegli il settore (Slots, Tavoli, Valet, Cleaning) e cambia il numero nella riga: nasce da sola l eccezione per quel settore, gli altri tengono il valore generale. La colonna dice "eccezione" o "valore generale"; <b>Torna al generale</b> la toglie. Esempio: riposo minimo 11 ore ovunque, 12 ai Tavoli.',
        '<b>Controlli prima di salvare</b>: un valore fuori scala (riposo di 3 ore, 40 giorni consecutivi), un testo dove serve un numero, oppure una regola che cita turni o funzioni che in quel settore non esistono (per esempio "L1 e 9 solo a BO e SUP" ai Tavoli, dove L1 e 9 non ci sono) viene rifiutato con un avviso rosso che spiega il motivo, e resta il valore di prima. Lo stesso vale per le regole di gruppo: gruppo, funzione e formato vengono verificati sul settore.',
        '<b>Regole nuove, per settore</b>: nella scheda <b>Regole di gruppo</b> ogni settore crea le sue, con le sue sigle e le sue funzioni, scegliendo il tipo dall elenco. Due tipi coprono il "chi fa cosa": <b>Turni riservati a certe funzioni</b> (valore <code>L1,9:BO,SUP</code>: i turni L1 e 9 li fanno solo Back Office e Supervisor) e <b>Una funzione fa solo certi turni, per giorno</b> (valore <code>SUP:Z*,L1,9:0,1,2,3</code>: da lunedi a giovedi i Supervisor fanno solo turni che iniziano con Z, oppure L1 e 9; <code>SUP:Z*,S*,L1,9:4,5</code>: venerdi e sabato anche i turni S). Gli altri tipi: funzioni ammesse nel gruppo, tipo di turno vietato, requisito sulla scheda, massimo o minimo di una funzione al giorno o al mese. Ai Tavoli la stessa regola si scrive con le sigle dei Tavoli. Eccezione voluta: le funzioni elencate nella regola <b>funzioni_fanno_tutto</b> (predefinite SUP e RESP) a mano possono fare qualsiasi turno, come in Formazione il livello alto comprende quelli sotto: scrivere un turno di cassa a un Supervisor non da avvisi. La <b>bozza automatica</b> invece continua a seguire le regole del settore. Il programma verifica che gruppo, funzioni e sigle esistano nel settore prima di salvare, e la scheda ha la guida con gli esempi. Le regole con nome fisso (riposo, ore, vacanze, CGF...) sono quelle che il programma sa applicare: la scheda mostra solo quelle che agiscono davvero.',
        'Le <b>regole di preferenza</b> della bozza (blocchi compatti, riposo isolato, notte poi turno del mattino, equilibrio delle notti e dei diurni, domeniche) ora spostano davvero l ordine con cui il generatore sceglie le persone: si accendono e si spengono con Si / No.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: festivi, CGF e supplementi',
      vis: () => _guidaVis('piano'),
      righe: [
        'I <b>festivi</b> sono quelli ufficiali del Canton Ticino e si generano da soli per qualsiasi anno futuro aprendo la scheda Festivi.',
        'Il <b>CGF</b> e il recupero per il lavoro nei giorni festivi. Per il regolamento aziendale spetta al <b>personale fisso</b> e solo per i festivi diversi dalla domenica. Con la regola <b>cgf_solo_parificati</b> (predefinita: Si) il recupero matura solo sui <b>nove festivi parificati alla domenica</b>, esattamente come nel foglio Excel del piano: gli altri festivi cantonali (San Giuseppe, 1 Maggio, Pentecoste, Corpus Domini, SS. Pietro e Paolo, Immacolata) non danno recupero. Nella scheda Festivi ogni giorno dice se da CGF, se e escluso perche non parificato o perche cade di domenica.',
        '<b>CGF caduto in malattia</b>: se una persona e in malattia proprio nel giorno del suo CGF, il recupero non e goduto. Subito dopo aver registrato la malattia il programma propone un giorno sostitutivo nello stesso mese ("Il CGF del 09.12 di Peraino e caduto in malattia. Lo rimetto il 15.12 (oggi C)?"): un giorno vuoto o un C messo dalla bozza, mai un C scritto a mano, bloccato o di compleanno, con le regole dei recuperi. Con Si il giorno diventa CGF con la nota "Ex C - operatore"; con No, o se nel mese non c e posto, il recupero resta da dare. Anche <b>Assegna CGF</b> usa i C messi dalla bozza, cosi funziona anche a mese gia pianificato.',
        '<b>Note delle celle</b>: la malattia sostituisce la sigla del giorno con la nota "Ex C0 - operatore" (Ex V, Ex CGF...); togliendo la malattia la sigla torna. Chi copre un collega in malattia ha "Ex C - cambio per esigenze operative - operatore", come i cambi per esigenze; gli scambi tra colleghi "Ex C0 - cambio con Rossi - operatore".',
        '<b>CGF anticipato</b>: il recupero di un festivo si puo dare anche prima del festivo nello stesso mese (es. dicembre: CGF il 18 per chi lavora il 25). Se poi il festivo non si lavora (turno tolto a mano o malattia): un CGF che deve ancora arrivare non spetta piu e diventa C (prima quello anticipato prima del festivo perso; se l hai scritto a mano o cambi tu la cella, il programma chiede conferma); un CGF gia goduto (il giorno e passato) resta CGF e il conto va a -1, da pareggiare. Esempi: il 16 togli il 25, il 18 diventa C; il 19 togli il 25, il 18 resta CGF (-1); CGF il 18 e il 29 per 25 e 26, il 20 togli il 25: il 18 resta e diventa C il 29.',

        'La <b>bozza</b> mette i recuperi arretrati PRIMA di distribuire i turni, con tre regole modificabili: al massimo <b>cgf_max_mese</b> recuperi a persona in un mese (2), almeno <b>cgf_distanza_giorni</b> giorni fra due recuperi (5), e mai il giorno prima o dopo una vacanza (<b>cgf_non_con_vacanze</b>, RAP 4.3). I recuperi dei festivi del mese vanno nei giorni dopo il festivo. Mai sul compleanno.',
        'Il <b>riporto CGF</b> dall anno precedente (colonna "riporto" del foglio Excel) si scrive nella scheda Festivi con il pulsante <b>Riporto CGF dall anno precedente</b>: con un riporto registrato il programma non conta piu i festivi e i recuperi dell anno prima. Lo stesso conteggio (riporto + maturati - goduti, con i recuperi caduti in malattia che restano a credito) vale ovunque: bozza, Assegna i CGF, Chi ha diritto e Statistiche.',
        'Gli <b>ausiliari (jolly) non maturano CGF</b>: ricevono il <b>supplemento del 50%</b> sul salario orario lordo quando lavorano uno dei <b>nove festivi parificati alle domeniche</b> (Capodanno, Epifania, Lunedi di Pasqua, Ascensione, 1 Agosto, Assunzione, Ognissanti, Natale, Santo Stefano). Sono sempre quei nove, non cambiano di anno in anno e valgono anche quando cadono di domenica. Gli altri festivi cantonali (San Giuseppe, 1 Maggio, Pentecoste, Corpus Domini, SS. Pietro e Paolo, Immacolata) non danno il supplemento. In piu, per il lavoro notturno maturano <b>tempo libero pagato pari al 10% delle ore notturne</b>. Entrambi i conteggi sono nelle Statistiche anno, colonne Suppl. 50% e Notte 10%, pronti per le paghe. Fonte: RAP Allegato 1. Il <b>supplemento del 10% per il lavoro notturno</b> (fascia 23:00-06:00) e gia compreso nella durata dei turni, quindi entra da solo nelle ore del mese e nel saldo: nella scheda Turni il pulsante <b>Controlla le durate dei turni</b> verifica che tutti i turni notturni lo comprendano e propone la correzione dove manca.',
        'Se la persona si ammala nel giorno del recupero, il CGF non risulta goduto e il credito resta.',
        'Il conteggio di maturati, goduti e saldo parte da gennaio e serve anche a controllare se nei mesi passati i recuperi sono stati dati. Chi compila il piano <b>a mano</b> trova nella scheda Festivi due pulsanti: <b>Chi ha diritto a un recupero</b> (elenco con maturati, goduti e saldo dell anno) e <b>Assegna i CGF del mese</b>, che mette i recuperi nei giorni liberi tenendo conto di quelli gia dati nei mesi precedenti, senza doppioni e senza toccare le celle occupate.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: collaboratori e copertura di altri settori',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni collaboratore appartiene a <b>un settore</b>. Se copre i buchi anche altrove, si apre il bottone <b>Copertura</b> nella sua riga in Gestione Collaboratori.',
        'Li si scelgono i settori dove puo andare, il <b>massimo di turni al mese</b>, i <b>gruppi ammessi</b> e se lavora <b>accompagnato</b>.',
        'Chi copre compare nella griglia dell altro settore con l etichetta azzurra <b>copre</b>, e nei due piani vedi sempre gli stessi turni: cosi nessuno puo essere prenotato due volte lo stesso giorno.',
        'La percentuale del contratto resta una sola, nel settore di appartenenza.',
      ],
    },
    {
      area: 'home',
      titolo: 'Compleanni: dove compaiono e chi ci finisce',
      righe: [
        'I compleanni si vedono in due posti: la <b>fascia dorata in cima</b> alla pagina, che saluta chi compie gli anni <b>oggi</b>, e il riquadro <b>Compleanni</b> nella Home, che elenca <b>oggi e i prossimi sette giorni</b>.',
        'Nel riquadro della Home ci sono sia i <b>collaboratori</b> del settore sia i <b>clienti Maison</b>: sono due elenchi diversi uniti nello stesso posto, per questo si puo trovare un nome in uno e non nell altro.',
        'Il settore si legge dall <b>anagrafica</b> del collaboratore. Prima il riquadro mostrava solo chi aveva gia registrazioni nel diario, quindi un collaboratore nuovo compariva nella fascia in alto ma non nella Home: adesso i due elenchi usano lo stesso criterio e coincidono sempre.',
        'Serve la <b>data di nascita</b> in anagrafica: si mette in Gestione collaboratori. Basta giorno e mese, l anno non e obbligatorio.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: controllo delle durate dei turni (in ore e minuti)',
      righe: [
        'Nella scheda <b>Turni</b> il bottone <b>Controlla le durate dei turni</b> confronta, per ogni turno con orario, la durata scritta con quella che risulta dall orologio piu il supplemento del <b>10%</b> sulle ore notturne (23:00-06:00).',
        'La tabella mostra tutto sia in <b>ore e minuti</b> (8h30) sia in decimali (8.5), perche sui turni si ragiona in sessantesimi ma il programma calcola in decimali: cosi i due modi si vedono affiancati e non ci si sbaglia.',
        'Anche nella tabella dei <b>Turni</b> ogni durata mostra l equivalente: <b>8.33 = 8h20</b>, perche 20 minuti sono un terzo di ora. Se una durata sembra non coincidere con la tabella cartacea, quasi sempre e solo il formato: il numero e lo stesso.',
        'Vengono segnalati solo gli scarti di <b>almeno tre minuti</b>: sotto e arrotondamento, non un errore.',
        'Il bottone che corregge riscrive la durata dei turni, quindi cambia i conteggi delle ore: si usa solo dopo aver controllato riga per riga. Un turno puo avere una durata diversa per accordi particolari, per esempio pause non pagate.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: recupero ore (griglia giornaliera)',
      righe: [
        'La scheda <b>Recupero ore</b> e il foglio giornaliero: si aggiorna <b>ogni giorno</b>, come si faceva sul file Excel di slots e tavoli.',
        'Nella casella del giorno si scrive quanto il collaboratore ha lavorato in piu o in meno rispetto al suo turno: <b>-1</b> un ora in meno (casella rossa), <b>+3</b> tre ore in piu (casella verde). Casella vuota vuol dire che ha fatto esattamente il turno previsto.',
        'Si puo scrivere sia in decimali (<b>1.5</b>) sia come orologio (<b>1:30</b>): il programma capisce tutti e due, cosi nessuno sbaglia scrivendo 1.30 per intendere un ora e mezza.',
        'A destra c e il <b>totale del mese</b> per ogni collaboratore, e in alto il riepilogo del settore: ore in piu, ore in meno e saldo complessivo.',
        'Tutto e collegato: quelle ore si sommano nella colonna <b>OP</b> del calendario, quindi entrano in <b>SM</b> (saldo del mese), nell <b>YTD</b> (saldo da inizio anno), nella scheda <b>Saldo</b> e nelle <b>Statistiche</b> dell anno. Chi scrive e quando resta nel registro.',
        'Non va confusa con la correzione del <b>saldo mensile</b> (doppio clic su OP o SM nel calendario): quella serve a scrivere il totale reale di un mese chiuso, questa e la registrazione di ogni giorno. Se ci sono tutte e due, il totale scritto a mano ha la precedenza.',
        'Selezione e colori funzionano <b>esattamente come nel calendario</b>: click sul <b>nome</b> marca la riga, click sull <b>intestazione del giorno</b> marca la colonna, <b>Ctrl+click</b> su una casella la singola cella. Il bottone <b>Colora</b> applica l ultimo colore usato (condiviso col calendario), la freccia apre la stessa palette con <b>Grassetto</b>, <b>Corsivo</b> e colore del <b>testo</b>. I colori restano salvati per mese e settore e li vedono tutti gli operatori. Unica differenza rispetto al calendario: qui si colora anche il <b>nome</b> del collaboratore, col colore della riga.',
        'Scorrendo la griglia, la <b>riga delle date</b> resta fissa in alto e la <b>colonna dei collaboratori</b> resta fissa a sinistra.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: giorni chiusi (il passato si corregge solo con motivo)',
      righe: [
        'Passata la giornata di gioco, il piano di quel giorno diventa un <b>documento</b>: non si modifica piu per distrazione. Nel calendario i giorni chiusi portano un piccolo lucchetto sotto il numero.',
        'C e un margine di respiro: il giorno resta aperto <b>fino a mezzogiorno del giorno dopo</b>, cosi chi apre al mattino sistema le ultime cose della giornata appena finita senza sbloccare niente. L ora si cambia nella regola blocco_ora_limite.',
        'Per correggere un giorno chiuso serve il permesso <b>Giorni chiusi</b> (si assegna per nome da Impostazioni · Visibilita e permessi). Chi lo ha clicca la cella, scrive il <b>motivo</b> (obbligatorio) e il giorno si apre per <b>dieci minuti</b>. Sblocco e motivo finiscono nel registro.',
        'Il blocco vale per ogni strada: modifica manuale, bozza, scambi e coperture su giorni passati. <b>Non</b> vale per il Recupero ore e per le timbrature, che per natura si compilano il giorno dopo, ne per i commenti.',
        'L interruttore generale e la regola blocco_giorni_chiusi: FALSE lo spegne del tutto.',
        'Vale anche per il <b>saldo del mese</b>: passato il mese (col solito respiro fino a mezzogiorno del giorno dopo), correggere le ore reali di quel mese richiede lo stesso sblocco motivato. Il 1 ottobre a mezzogiorno settembre e chiuso; il mese in corso resta sempre modificabile.',
        'Le <b>celle protette</b> del piano (piano consolidato, vacanze, assenze confermate) si possono ancora modificare o cancellare, ma solo dopo una conferma che dice esattamente cosa si sta sostituendo o togliendo.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: turni che finiscono piu tardi (es. Z0)',
      righe: [
        'Alcuni turni finiscono piu tardi nei giorni in cui il casino chiude alle <b>05:00</b>. Il caso noto e <b>Z0</b>: finisce alle <b>19:45</b> nei giorni normali e alle <b>20:30</b> il venerdi, il sabato, nelle vigilie di festivita e il 31 dicembre.',
        'La sigla resta <b>una sola</b>: nel piano si scrive Z0 come sempre e il programma calcola da solo le ore di quel giorno. Passando il mouse sulla cella si legge l orario effettivo e la durata.',
        'Il programma usa <b>due criteri, ne basta uno</b>: il giorno chiude tardi, oppure nel piano di quel giorno c e il turno che da il cambio (per Z0 e <b>Z12</b>, che inizia alle 20:30). Cosi il conteggio resta giusto anche in un giorno fuori dal solito.',
        'Si imposta nella scheda <b>Turni</b>: la colonna <b>Fine (chiusura 5)</b> per l orario prolungato. Lasciandola vuota il turno finisce sempre alla stessa ora.',
        'Le ore in piu entrano da sole in <b>OP</b>, <b>SM</b>, <b>YTD</b>, nella scheda Saldo e nelle Statistiche: non c e niente da aggiungere a mano.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: festivita e orari di chiusura (CH5 e CH7)',
      righe: [
        'Il casino chiude alle <b>04:00</b> nei giorni feriali e alle <b>05:00</b> il venerdi e il sabato. Nei giorni di <b>festivita</b> si chiude alle 05:00 anche in mezzo alla settimana, e il <b>31 dicembre</b> alle 07:00.',
        'Nel calendario quei giorni portano in cima alla colonna il marcatore viola <b>CH5</b> (o CH7), cosi si sa in anticipo dove serve piu personale. Il marcatore <b>non</b> compare il venerdi e il sabato, perche li si chiude tardi per prassi e segnalarlo sarebbe rumore.',
        'L elenco si gestisce nella scheda <b>Festivi</b>, riquadro "Festivita e orari di chiusura": un bottone inserisce le festivita dell anno (per il 2026 e il 2027 gli elenchi forniti dalla direzione, per gli altri anni le dodici festivita italiane di legge con Pasqua calcolata), e ogni riga si puo spegnere o eliminare. Se ne possono aggiungere altre a mano.',
        'Gli orari (4, 5, 7 e i giorni che chiudono tardi) sono <b>regole modificabili</b> nella scheda Regole: chiusura_ora_normale, chiusura_ora_tardi, chiusura_ora_fine_anno, chiusura_giorni_tardi.',
        'Attenzione a non confondere: i <b>festivi cantonali</b> (stessa scheda, riquadro sopra) servono ad altro, cioe al recupero <b>CGF</b> dei fissi e al supplemento del 50% degli ausiliari. La lista cantonale segue la legge ticinese del 15 dicembre 2009 e coincide con il calendario ufficiale del Cantone: undici feste fisse piu quattro mobili calcolate da Pasqua.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: ogni scheda personalizzabile (visibile, modificabile, nascosta)',
      righe: [
        'Da <b>Impostazioni · Visibilita e permessi</b> ogni scheda del Piano si regola in due modi separati: <b>chi la vede</b> (sezione "Piano · schede visibili") e <b>chi la puo modificare</b> (sezione "Piano · schede modificabili").',
        'Tre stati possibili per ogni operatore: <b>nascosta</b> (sparisce dal menu), <b>solo lettura</b> (la vede ma i comandi di modifica sono spenti), <b>visibile e modificabile</b>.',
        'La restrizione di modifica vale <b>in aggiunta</b> ai permessi esistenti: chi non ha "Piano di lavoro" non modifica comunque, e l admin vede e modifica sempre tutto.',
        'La <b>Guida</b> resta visibile a tutti di default. E ogni operatore continua a lavorare solo sui collaboratori del <b>suo settore</b>: queste regole decidono cosa si vede, la separazione dei dati resta quella dei settori.',
        'Le scritture automatiche (es. la malattia registrata dal Diario che si sincronizza nel piano) non c entrano con le schede e passano sempre.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Scheda collaboratore: pattern malattie riservato e data di nascita',
      righe: [
        'Su richiesta HR, il blocco <b>Pattern malattie</b> della scheda collaboratore (percentuali per giorno della settimana, avviso Lunedi/Venerdi, confronto con la media del team) e riservato: lo vedono l admin e gli operatori scelti col permesso <b>Pattern malattie</b> in Impostazioni. Il <b>conteggio</b> dei giorni di malattia resta visibile a tutti.',
        'La <b>data di nascita</b>: se c e, si legge soltanto (si modifica in Gestione collaboratori, con conferma); campo e tasto Salva compaiono solo quando manca. Se e stato inserito solo giorno e mese, l anno segnaposto 1900 <b>non viene mostrato</b>: si legge "02/11 (anno non indicato)". Con l anno vero si legge la data completa.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Regole e Festivi: chi puo vederli',
      righe: [
        'Le schede <b>Regole</b> e <b>Festivi</b> del piano erano riservate agli amministratori e per gli altri restavano vuote, senza spiegazione.',
        'Ora sono <b>permessi delegabili</b>: un amministratore li assegna da <b>Impostazioni · Visibilita e permessi</b> scegliendo "Operatori selezionati" (es. il responsabile del settore o HR).',
        'Chi non ha il permesso legge un messaggio che dice cosa serve e a chi chiederlo, invece di trovare una pagina bianca.',
        'Stessa cosa vale gia per le <b>categorie professionali</b> (5ª-1ª): permessi separati per vederle e per assegnarle.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: correggere il saldo del mese (ore reali)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Finche il programma non e collegato alla timbratrice, le ore vere di un mese possono non coincidere con il piano: chi finisce prima, chi resta oltre.',
        'Nel <b>Calendario</b> fai <b>doppio clic</b> sulla colonna <b>OP</b> (ore pianificate) o su <b>SM</b> (saldo del mese) del collaboratore: il programma chiede le <b>ore realmente lavorate</b> nel mese e, se vuoi, il motivo.',
        'Da quel momento il saldo del mese, l <b>YTD</b>, la scheda <b>Saldo</b> e le <b>Statistiche</b> dell anno usano quel totale. Il valore scritto a mano si riconosce da un <b>asterisco</b>, e passandoci sopra si legge chi lo ha scritto, quando e perche.',
        'Si corregge la <b>causa</b> (le ore), non l effetto (il saldo): cosi il numero resta spiegabile e continua ad aggiornarsi da solo.',
        'Per tornare alle ore del piano basta rifare il doppio clic e <b>lasciare il campo vuoto</b>.',
        'Se serve la precisione del singolo giorno, resta la scheda <b>Timbrature</b>: li si registra entrata e uscita di una giornata. Ordine di precedenza: ore reali del mese, poi timbrature, poi piano.',
        'Gli <b>ausiliari</b> non hanno ore dovute, quindi per loro non esiste un saldo da correggere.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Scheda del collaboratore: si apre da ogni tabella',
      righe: [
        'Il nome di un collaboratore apre la sua scheda ovunque compaia come prima colonna di una tabella: Diario, Statistiche, Moduli, Formazione, Valutazioni, e nel Piano le schede Saldo, Statistiche, Benessere e Vacanze.',
        'Nel <b>Piano di lavoro</b> fa eccezione: li il clic sul nome seleziona la riga (con Ctrl o Shift piu collaboratori), quindi la scheda si apre con il <b>doppio clic</b> sul nome.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: giorni di vacanza spettanti',
      vis: () => _guidaVis('piano'),
      righe: [
        'Nella scheda <b>Vacanze</b> il programma calcola quanti giorni spettano a ogni collaboratore fisso, partendo dalla data di inizio contratto.',
        'La regola: <b>28 giorni</b> nei primi due anni, <b>35</b> dal compimento dei due anni. Nell anno del passaggio il diritto matura mese per mese: i mesi prima dell anniversario valgono 28 diviso 12, quelli dopo 35 diviso 12.',
        'Giorni in piu per anzianita <b>una volta sola</b>, nell anno in cui cade l anniversario (dal giorno dopo: un anniversario il 31.12 vale l anno seguente): <b>10 anni +1</b> (36), <b>15 anni +2</b> (37), <b>20 anni +3</b> (38), <b>25 anni +4</b> (39), <b>30 anni +5</b> (40). L anno dopo si torna a 35.',
        'I decimali del pro-rata si <b>arrotondano al giorno pieno</b> a favore del collaboratore: da <b>,35</b> in su si sale (32.67 e 32.37 diventano 33), sotto resta il giorno intero (32.3 resta 32). Passando il mouse sulla riga si legge comunque il valore esatto. La soglia si cambia nella regola vacanze_arrotonda_da (vuota = nessun arrotondamento).',
        'Esempio: chi compie 20 anni a marzo 2025 ha 38 giorni nel 2025 e di nuovo 35 nel 2026.',
        'I mesi di <b>congedo non pagato</b> spostano in avanti anche questi scaglioni, esattamente come fanno con i giubilei: l anzianita di servizio e una sola.',
        'Da <b>ottobre</b> compare l avviso con chi avra piu giorni l anno successivo, per pianificare le vacanze con il numero giusto.',
        'Gli <b>ausiliari non compaiono</b>: per loro le vacanze sono un indennita in percentuale sulle ore lavorate (RAP Allegato 1), non giorni.',
        'Tutti i valori (28, 35 e i quattro scaglioni) sono modificabili nella scheda Regole.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: benessere dei collaboratori',
      vis: () => _guidaVis('piano'),
      righe: [
        'La scheda <b>Benessere</b> mostra come e distribuito il carico di lavoro nell anno, separando <b>personale fisso</b> e <b>ausiliari</b>, perche hanno regole diverse.',
        'Ogni persona ha un <b>indice da 0 a 100</b> calcolato su dati oggettivi del piano: domeniche libere (25 punti), equita nei weekend rispetto alla media del settore (20), carico notturno (15), qualita del riposo cioe pochi riposi isolati di un solo giorno (15), giorni consecutivi entro il limite (15), vacanze godute (10). Il conteggio usa solo i <b>mesi con piano completo</b> (anche futuri, se il piano c e gia): i mesi a meta o non pianificati restano fuori, e il periodo considerato e scritto in cima. Le domeniche libere seguono la regola di legge: non contano se il sabato prima si finisce dopo le 23.',
        'Sopra 75 la situazione e buona, tra 55 e 75 va tenuta d occhio, sotto 55 e critica: in fondo compare l elenco di chi guardare per primo. Passando il mouse su una riga si vede il dettaglio di ogni punteggio.',
        'Le <b>malattie non tolgono punti</b>: non sono una colpa. Si vedono in colonna come segnale da leggere insieme al resto, per esempio accanto a molti weekend e molte notti.',
        'I valori di riferimento (domeniche libere all anno, massimo giorni consecutivi) sono le stesse regole del piano, quindi cambiando quelle cambia anche la valutazione.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: congedi non pagati',
      vis: () => _guidaVis('piano'),
      righe: [
        'Regolamento aziendale 5.14: domanda scritta tre mesi prima, concessione della Direzione. Si registrano nella scheda <b>Collaboratori</b> del Piano (riquadro Congedi non pagati) con date dal / al, motivo e chi ha autorizzato. Il programma rifiuta date invertite, periodi sovrapposti e congedi senza motivo.',
        'Nel piano i giorni diventano <b>CNP</b> (zero ore, cella protetta) e <b>non contano fra le ore dovute</b> del mese: saldo, statistiche e bozza lo sanno. Eliminando il congedo i giorni CNP spariscono.',
        'Oltre <b>congedo_np_giorni_vacanze</b> giorni (10) il diritto alle vacanze dell anno si riduce in proporzione ai giorni di congedo ("decade per tutta la durata del congedo"). Oltre <b>congedo_np_mesi_anzianita</b> mesi (6) l anzianita di servizio si sposta in avanti di tutta la durata: giubilei e scaglioni vacanze arrivano piu tardi. Fino a sei mesi concordati, come dice il regolamento, l anzianita non si interrompe. Le due soglie sono nella scheda Regole.',
        'Il vecchio automatismo "mese intero di sole C = congedo non pagato" non registra piu nulla da solo: il controllo salute segnala solo i mesi senza turni, da verificare a mano.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: cambi turno, coperture e restituzioni',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>ND solo per i jolly</b>: i fissi non danno disponibilita, quindi a un fisso l ND non si mette (il programma lo dice). Scrivendo ND a un jolly nel calendario si sceglie: <b>non disponibilita data</b> (come quelle chieste entro il 3 dal Diario) oppure <b>chiamata ma non disponibile</b>: la cella ha il commento "Ex <turno di prima> - chiamata ma non disponibile - operatore" e il modulo ND lo riporta nelle osservazioni. Nella Copertura malattia, accanto a un jolly proposto, il pulsante <b>Chiamato, non disponibile</b> fa lo stesso e cerca un altro sostituto.',
        '<b>Lista di non disponibilita (modulo 1187)</b>: quando a una persona si mette un <b>ND</b>, nel calendario del piano (in qualsiasi modo) o nel Diario con una registrazione Non disponibilita, il programma prepara da solo il modulo del mese, identico a quello di Human Resources: logo, nome, mese, giorni spuntati e osservazioni (la nota della cella o il testo della registrazione). Un modulo per persona e per mese, aggiornato se i giorni cambiano. Lo trovi nella <b>scheda del collaboratore</b> (Non disponibilita · Anteprima), da dove si stampa per la firma: resta lo storico, come per i cambi turno.',
        'Dal tasto destro sulla cella: <b>Cambia turno con...</b> (scambio con un collega che quel giorno ha un turno nello stesso settore, con restituzione facoltativa), <b>Cerca cambio, giorno libero</b> (un collega libero prende il turno, con eventuale restituzione), <b>Cambio per esigenze</b> (la direzione cambia il turno con motivo), e dalla barra <b>Copertura malattia</b> (sostituti giorno per giorno, anche con una mossa a catena sul giorno prima).',
        'Tutti i flussi controllano le regole per <b>entrambe</b> le persone (riposo 11 ore, giorni consecutivi, idoneita, accompagnamento), rispettano i giorni chiusi, saltano le celle bloccate con motivo e non toccano mai le celle di un altro settore: chi lavora in due settori e ha gia una cella nell altro piano non risulta libero.',
        'La <b>restituzione</b> puo cadere anche nel mese dopo: le celle si leggono dal database e vengono scritte davvero (prima venivano solo annunciate). Chi quel giorno non aveva nulla riceve un congedo C. Ogni cambio produce il formulario da firmare e finisce nel Registro; l autorizzazione oltre il limite mensile viene registrata solo a scambio fatto.',
        'Ogni cambio si puo annullare con <b>Annulla</b>, che ripristina anche colori, orari personalizzati e motivi di blocco del mese.',
        'La scheda <b>Piano &gt; Cambi turno</b> (gruppo Gestione) elenca tutti i fogli del settore, dal piu recente: data del cambio, tipo (scambio o esigenze operative), collaboratori e turni, restituzione, motivo, <b>chi l ha fatto</b>, data di creazione e <b>Apri PDF</b>. La casella di ricerca cerca per collaboratore, motivo o autore; c e il filtro per mese e il pulsante <b>Formulario vuoto</b> da compilare a mano.',
        'Nella <b>scheda del collaboratore</b> compaiono i suoi ultimi tre cambi turno (data e collega) con il pulsante <b>Anteprima</b>, che apre subito il foglio; <b>Tutti nel Piano</b> apre la scheda Cambi turno gia filtrata su di lui.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: timbrature e saldo ore',
      vis: () => _guidaVis('piano'),
      righe: [
        'Le timbrature si inseriscono a mano, si importano da file oppure arrivano in automatico dalla timbratrice.',
        'Nel confronto si clicca un collaboratore per vedere giorno per giorno entrata, uscita e ore effettive rispetto a quelle pianificate.',
        'Nel <b>Saldo</b> valgono le ore timbrate quando esistono, altrimenti quelle del piano. Il saldo da inizio anno si chiama YTD e comprende il riporto: e lo stesso numero nel calendario e nella scheda Saldo. Lo usa anche la bozza del piano: chi e in piu riceve meno ore, chi e in meno ne riceve di piu, finche non rientra. Sempre dentro la tolleranza del mese: il saldo si recupera un po per mese. La sigla dice di quale settore e un turno: R22 o R23 scritti nel foglio del Valet sono turni della Reception Slots e coprono il posto agli Slots; nel calendario Slots si vedono normali, con la nota del foglio da cui vengono. Il corsivo dipende solo dalla sigla: un turno di un altro settore (es. X7 del Valet nel calendario Slots, R23 nel calendario Valet) si vede in corsivo, la persona e occupata ma non copre i posti qui. Se cambi la sigla, il corsivo segue la sigla nuova. Congedi, vacanze e malattie valgono per la persona e si vedono sempre normali. Ore e orari di ogni turno si leggono in tutti i settori. Chi ha il mese fatto solo di congedo C, senza turni ne assenze ne timbrature, non viene conteggiato: vuol dire che non e in servizio quel mese.',
        'Nella scheda Statistiche c e il <b>Confronto anni</b>: due tendine per scegliere <b>due anni qualsiasi</b> (anche non consecutivi, es. 2026 contro 2023), per settore, con ore, collaboratori, jolly, malattie, weekend, vacanze e recuperi. La nota in alto dice quanti mesi ha in archivio ciascun anno.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: import dai file Excel',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        '<b>Importa piano</b> legge il file dei piani del settore: riconosce il foglio del mese, le colonne dei giorni e i nomi anche con piccoli refusi.',
        '<b>Nomi</b>: se nel file c e prima il nome e poi il cognome (o mancano accenti e apostrofi) il collaboratore viene riconosciuto lo stesso, e resta sempre il nome scritto in Gestione collaboratori: l import non rinomina mai nessuno.',
        '<b>Ordine</b>: dopo l import il calendario del settore ha i collaboratori nell ordine del file; chi non e nel file resta in fondo. Si cambia trascinando le righe o con Ordine predefinito.',
        '<b>Prima di scrivere mostra l anteprima</b>: celle nuove, celle diverse dal piano (con i primi esempi), colori e orari JG da allineare, celle gia uguali. Si sceglie <b>Aggiorna dal file</b> (il file aggiornato sovrascrive turni, ore e colori) oppure <b>Solo le celle nuove</b>.',
        '<b>Controllo prima dell import</b> (ogni settore), come il file Excel CONTROLLO PIANO: prima di scrivere, riposo minimo fra due turni e giorni di fila (valori delle Regole: 11 ore, 5 giorni), contando anche la fine del mese prima; una cella vuota non conta come riposo. Se ci sono errori compare la tabella Collaboratore, Data, Errore, Dettagli, Turni con tre scelte: <b>Annulla</b> (niente scritto), <b>Importa com e</b>, <b>Importa e proponi correzioni</b>: il programma cerca il minor numero di cambi solo nei giorni degli errori (i colleghi possono solo scambiarsi turni gia esistenti, i giorni di riposo e le celle vuote si toccano solo per chi ha l errore; mai vacanze, malattie, celle bloccate, giorni chiusi), li mostra prima/dopo e applica solo con Applica, e solo se gli errori calano, non ne nasce nessuno nuovo e nessuna altra regola di legge peggiora.',
        '<b>Controllo delle regole dopo l import</b> (ogni settore): finito l import, una finestra dice quante regole il mese importato non rispetta, per tipo (riposo sotto il minimo, giorni di fila, 4+1+1, ore della settimana, domeniche, ore del mese, idoneita) e chi e piu coinvolto; con Mostra nel calendario le celle si colorano e compare l elenco con nome, giorno e motivo. Il piano si importa com e: il programma non sposta le celle importate.',
        'Restano come sono, anche se nel file sono diverse: le <b>malattie registrate</b> (vale il Diario), i <b>giorni chiusi</b> (si sbloccano con motivo), le <b>celle bloccate</b> con motivo e le celle scritte dal piano di <b>un altro settore</b>. L anteprima le elenca.',
        'Tutto l import si toglie con <b>Annulla</b> del piano.',
        'Se nel file ci sono collaboratori nuovi li crea, quelli disattivati ma presenti te li propone da riattivare. Quelli attivi ma senza turni nel file te li propone da disattivare solo se il mese nel file e compilato (con un mese a meta non propone niente). Ogni passo ha la sua conferma: leggi bene l elenco prima di confermare.',
        '<b>Colori</b>: arriva il colore che si vede aprendo il file, comprese le regole automatiche di Excel (es. V blu). <b>JG</b>: la nota della cella resta; se dice l orario (\"dalle 10 alle 14\") l orario si prende, altrimenti si aggiunge con doppio clic sul JG.',
        '<b>Importa fabbisogno</b> legge la sezione di pianificazione dello stesso file e sostituisce il fabbisogno del mese.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: organico (quante persone servono)',
      vis: () => _guidaVis('piano') && typeof organicoAttivo === 'function' && organicoAttivo(),
      righe: [
        'La scheda <b>Organico</b> del Piano dice, per i mesi dell anno, se le persone del settore bastano a coprire il fabbisogno rispettando le regole, e cosa conviene fare se non bastano. Si aggiorna da sola quando cambiano piano, fabbisogno, vacanze, malattie o collaboratori.',
        '<b>1. Ore</b>: ore richieste dal fabbisogno contro ore nette disponibili (contratto meno vacanze, CGF, malattie medie del mese, altri impegni, congedi non pagati). <b>2. Persone</b>: quante ne servono nel giorno di punta e per le domeniche, anche quando le ore bastano. <b>3. Affidabilita</b>: riserva a chiamata per coprire le malattie improvvise nel 95% dei giorni.',
        '<b>Per gruppo</b> (sala, cassa, accoglienza...): ore, posti massimi in un giorno, persone minime, persone abilitate (col mouse si vede chi sono), quante <b>mancano</b> e chi <b>si potrebbe formare</b> tra chi c e gia (prima chi ha piu ore libere). Un gruppo e scoperto se nel giorno di punta non ci sono abbastanza abilitati, o se le sue ore superano tutte le ore degli abilitati.',
        '<b>Che tipo di persona serve</b>: per ogni gruppo scoperto la proposta e prima <b>formare</b> collaboratori gia in organico; se non bastano, le proposte di assunzione dicono il <b>profilo da cercare</b> (es. abilitato a cassa). Perche il conto per gruppo sia vero, nella scheda del collaboratore vanno impostati i settori: chi non li ha conta per tutti i gruppi.',
        '<b>Costi</b> (facoltativi): l amministratore inserisce in fondo alla scheda il costo annuo di un tempo pieno e il costo orario di un ausiliario (medie, oneri compresi) e li accende. Ogni proposta e il simulatore mostrano il costo nei mesi rimasti e il costo per ora di carenza coperta; spostare vacanze e formare non aggiungono ore di contratto. I costi li vede solo chi vede la scheda Organico.',
        '<b>Suggerimenti</b>, dal piu leggero: spostare vacanze verso i mesi con margine, piu disponibilita degli ausiliari, un ausiliario stagionale, un fisso. Ognuno mostra l effetto ricalcolato; <b>Prova nel simulatore</b> lo applica alle ipotesi senza toccare i dati.',
        '<b>Verifica sui mesi passati</b>: dice se i buchi del piano venivano da ore mancanti (servono persone) o da ore libere non usate (distribuzione dei turni o abilitazioni: prima di assumere conviene guardare li).',
        '<b>Metodo</b> (in fondo alla scheda) spiega i calcoli con i numeri del settore. <b>Excel</b> e <b>rapporto PDF</b> per la Direzione.',
        'L amministratore la accende o spegne in Piano > Impostazioni; chi la vede si decide in Visibilita e permessi (Piano · Organico).',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: formazioni (pianificare, proposte di cambi, storico)',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Nuova formazione</b> (scheda Formazioni, permesso Pianificare formazioni): allievo, competenza (le stesse della scheda Formazione: se aggiungi una competenza o un livello compare anche qui), un allievo gia nel programma oppure, con la spunta <b>Nuovo allievo</b>, cognome e nome di uno nuovo (entra come gli altri jolly del settore, con S1 e S3 bloccati, solo quando applichi la proposta: chiudendo senza applicare non resta niente; poi compare nel calendario, in Gestione collaboratori e in tutti gli elenchi), uno o piu formatori dalla lista con ricerca (anche diversi per diurni e notti: per ogni giorno il primo libero nell ordine scelto), quanti giorni (5 proposti, il programma chiede conferma prima di generare) e il periodo, in qualsiasi mese o a cavallo di due (ogni proposta sta dentro un mese; applicando si apre quel mese).',
        'Funziona in <b>ogni settore</b> (Slots, Tavoli, Valet, Cleaning): in fondo alla scheda, per ogni competenza si sceglie il <b>gruppo di turni</b> (se il settore ne ha uno solo e gia scelto) e il <b>modello dei turni</b>; le sigle devono essere turni di quel gruppo, altrimenti il programma non salva e dice quali sono sbagliate. I turni vengono dal modello, presi dai piani veri in Slots: cassa C0, C4, C23 poi C15, C5; rec R22 x2 poi R23 x3; sala S22 x2 poi S7 x3. Prima i diurni, poi le notti, se possibile nel fine settimana. L allievo e <b>in piu</b> rispetto al fabbisogno: il posto lo copre il formatore.',
        '<b>Proposte</b>: il programma prova i periodi possibili (senza vacanze, malattie, ND, CGF di allievo e formatore) e, se il piano e gia fatto, trova i cambi necessari con lo stesso motore di Migliora la bozza e le stesse regole di Valida regole, toccando meno celle possibile: solo i giorni della formazione (e la settimana prima e dopo per formatore e allievo) e solo per coprire i posti lasciati liberi. Ogni proposta mostra le celle che cambiano e le eventuali violazioni nuove; si <b>stampa</b> prima di confermare. Annulla = non cambia niente.',
        '<b>Applica</b>: nel piano le celle hanno il commento "FORMAZIONE CASSA con ..." (al formatore il nome dell allievo, all allievo il nome del formatore). Si annulla con Annulla del piano o, piu tardi, con Annulla nella scheda (le celle della formazione tornano come erano).',
        '<b>Fine formazione</b>: dopo l ultimo giorno, all apertura della scheda (o con Segna svolta) la formazione risulta svolta nello storico HR, la competenza viene certificata (con i livelli inferiori, il livello si aggiorna da solo nella scheda Formazione) e, se gli incentivi sono attivi, formatore e allievo ricevono i punti.',
        '<b>Storico di ognuno</b>: quante formazioni da formatore e da allievo; passando il mouse si vede con chi e in quali giorni. <b>Formatori</b>: chi puo formare per ogni competenza (Modifica: lista con ricerca e spunte; proposti per primi e gia spuntati nella nuova formazione). Dall <b>Organico</b>, sui gruppi scoperti, il bottone Pianifica formazione apre la scheda gia compilata.',
      ],
    },
    {
      area: 'hr',
      titolo: 'Formazione e competenze',
      vis: () => _guidaVis('formazione'),
      righe: [
        '<b>Protocolli di formazione</b>: sono i documenti Word originali della cartella <b>Formazione</b> di Piano &gt; Formulari, gli stessi file: per ogni competenza (cassa, reception, sala...) il bottone Apri Word scarica il protocollo giusto, identico, da stampare, compilare e firmare. Un formulario caricato o sostituito in quella cartella compare subito qui. Il registro in Excel per importare punti e voti resta come scelta facoltativa.',
        'La <b>matrice delle competenze</b> mostra chi sa fare cosa: le spunte segnano le competenze certificate e i livelli raggiunti.',
        '<b>Ordine e livelli delle competenze</b> (amministratore): bottone <b>Riordina competenze</b> sopra la matrice, oppure Configurazione (admin) &gt; Competenze del settore. Le competenze stanno sempre in ordine di livello (prima L1, poi L2...): una nuova va dopo le altre del suo livello. I livelli non hanno un tetto: il menu Livello offre sempre un gradino in piu del piu alto (con L4 compare L5, poi L6...), e <b>Extra</b> per le competenze fuori dalla scala, che stanno in fondo e non contano per il livello. Per piu gradini dello stesso ruolo si usano nomi diversi (es. Ispettore tavolo L2, Ispettore capo L3). Con le frecce si cambia l ordine dentro lo stesso livello; con il menu L1/L2/L3 davanti al nome se ne cambia il livello. Per spostare una competenza in un altro livello non serve crearne una nuova: se si aggiunge un nome che esiste gia, il programma propone di cambiarne il livello. Due competenze con lo stesso nome (es. Ispettore Tavolo e Ispettore tavolo) sono segnalate: <b>Tieni questa</b> tiene quella scelta (nome e livello) e le passa le spunte dell altra, formatori, gruppo di turni e modello delle Formazioni compresi, poi toglie l altra (il programma chiede conferma, poi ricalcola il livello dei collaboratori). Lo stesso ordine vale nella matrice, nelle Formazioni del piano e nelle Preferenze.',
        'Al completamento di un livello il programma assegna i punti previsti e avvisa la persona interessata.',
        'I <b>punti e i premi</b> seguono le azioni configurate (coperture, cambi turno, formazioni svolte) e sono consultabili nella scheda del collaboratore.',
        "Ogni assegnazione di punti richiede la <b>conferma del responsabile</b>: nessun punto parte da solo. Il programma controlla anche i <b>doppioni</b>: se la stessa persona ha gia' ricevuto punti per lo stesso motivo, o altri punti nello stesso giorno, appare un avviso e si decide se procedere.",
        "Il sistema incentivi si puo' <b>accendere e spegnere</b> dalla configurazione (sezione Sistema incentivi): con l'interruttore generale spento non vengono assegnati punti e non appare nessun popup in tutto il programma. Si puo' anche spegnere una <b>singola azione</b> (per esempio solo la copertura malattia) lasciando attive le altre. Lo storico dei punti gia' assegnati resta consultabile.",
        "Il cerca cambio per il giorno libero <b>non</b> assegna punti: e' uno scambio alla pari tra colleghi.",
        'Le <b>formazioni svolte</b> si registrano con data, formatore ed eventuali allegati.',
      ],
    },
    {
      area: 'hr',
      titolo: 'Valutazioni e storico HR',
      vis: () => _guidaPuo('puoVedereStoricoHr') || _guidaAdmin(),
      righe: [
        'Le <b>valutazioni</b> seguono la scheda ufficiale HR: aree di valutazione, punteggi, sintesi, punti di forza, obiettivi ed esigenze formative.',
        'La scheda Excel ricevuta da HR si <b>importa</b> e il programma compila i dati, conservando il file originale come allegato.',
        'Il <b>PDF</b> riproduce il formato ufficiale, pronto per il colloquio e la firma.',
        'Lo <b>storico HR</b> raccoglie categoria, impiego, premi, livelli, formazioni e giubilei, con anzianita e date. E riservato a chi ha il permesso.',
        'Questi dati sono riservati: non vanno condivisi con chi non ha il permesso di vederli.',
      ],
    },
    {
      area: 'admin',
      titolo: 'Impostazioni del programma',
      vis: () => _guidaAdmin(),
      righe: [
        '<b>Stampa scheda permessi</b> (in Visibilita pagine e funzioni): produce il foglio con lo stato REALE dei permessi, operatore per operatore, con profilo, settori e accessi extra, pronto per la stampa o il PDF. Serve per farlo controllare a chi decide chi puo vedere e fare cosa.',
        '<b>Sessioni</b>: ogni dispositivo ha la sua sessione, che si rinnova da sola con il token che possiede; aprire il programma sul telefono non fa piu uscire dal PC. Se il rinnovo non e possibile compare un avviso e si rientra con la password. Lo <b>sblocco biometrico</b> va riattivato una volta dalle Impostazioni: da questa versione il dispositivo ha un segreto che il server verifica, quindi nessuno puo ottenere una sessione con il solo nome dell operatore.',
        'Le impostazioni di configurazione (visibilita, profili, settori, punti, soglie, moduli, opzioni del piano) le salva solo una sessione amministratore: il server lo verifica, non basta l interfaccia. Ogni salvataggio fallito viene segnalato con un avviso rosso, mai in silenzio.',
        'La pagina Impostazioni e divisa in cinque schede (Registrazioni, Persone e accessi, Maison, Personale, Sistema): si vede solo il gruppo scelto, con le chip delle sue sezioni sotto le schede; il programma ricorda l ultima scheda aperta.',
        '<b>Settori</b>: si creano, rinominano e si scelgono le pagine attive per ognuno.',
        '<b>Nome nei documenti</b> (in Settori): il nome ufficiale del settore che compare nei documenti stampati, per esempio <b>FoBoSlot</b> per Slots. Nei menu resta il nome breve. Vale per i fogli di cambio turno (anche quelli gia archiviati), il formulario vuoto, la stampa del Piano, il briefing, le coperture, i crediti, le vacanze e le valutazioni. Vuoto = nome breve.',
        '<b>Profili personalizzati</b> (Visibilita e permessi): oltre ai cinque profili fissi del documento firmato si creano altre figure, per esempio Compliance o Segretariato: si parte da una copia di un profilo esistente, si decide voce per voce Modifica, Vede o No, si salva. Il profilo compare nel menu accanto agli altri, "Applica i profili" lo tratta allo stesso modo e la scheda permessi stampata lo mostra con il suo nome. I cinque profili fissi non si possono modificare.',
        '<b>Nuovo operatore</b>: nel modulo di creazione la casella "Posizione e permessi" assegna subito un profilo (fisso o personalizzato) e lo applica, oppure copia gli accessi di un collega (profilo, accessi extra, voci selezionate; il settore se non scelto), oppure apre la tabella di un nuovo profilo personalizzato che al salvataggio viene assegnato all operatore appena creato.',
        '<b>Visibilita pagine e funzioni</b>: si decide chi vede cosa, pagina per pagina e funzione per funzione, anche per singolo operatore.',
        '<b>Operatori</b>: account, password e permessi. Ogni azione resta registrata nel Registro.',
        '<b>Backup</b>: sono automatici e si possono scaricare in qualsiasi momento. Il file contiene tutte le tabelle.',
        '<b>Sicurezza</b>: accesso con password e impronta, sessioni a scadenza, chiavi non contenute nel codice pubblico.',
      ],
    },
    {
      area: 'admin',
      titolo: 'Controllo e manutenzione',
      vis: () => _guidaAdmin(),
      righe: [
        'In <b>Impostazioni → Stato del sistema</b> il bottone <b>Controlla il sistema</b> verifica i dati e dice cosa non torna: impiego mancante, nomi con turni ma senza scheda, disattivati che hanno ancora turni, festivi dell anno prossimo, schede di prova rimaste.',
        'Da li partono due strumenti: <b>Assegna l impiego adesso</b>, che compila fisso o jolly per tutti quelli che non ce l hanno, e <b>Sistema questi nomi</b>, che crea la scheda mancante, sposta i turni sul collaboratore giusto oppure elimina le righe che non sono persone.',
        'Il <b>Registro</b> elenca chi ha modificato cosa e quando. I dati eliminati restano nel <b>Cestino</b> e si recuperano.',
        'CONSERVAZIONE: il regolamento aziendale impone di tenere i dati del personale per almeno <b>5 anni</b>. Le voci che rientrano nell archivio non si possono eliminare definitivamente: restano nel Cestino e si ripristinano quando serve. Si possono invece cancellare davvero le voci inserite da poco (correzione di errori di battitura). Anni e finestra di correzione si impostano in Impostazioni, sezione Conservazione dei dati.',
        'La legge impone di conservare piani e registrazioni degli orari per <b>cinque anni</b>: gli archivi non vanno svuotati prima.',
      ],
    },
  ];
}

// area: se passata, mostra solo i capitoli di quell'area (es. 'piano')
function renderGuidaHtml(area) {
  const cap = GUIDA_CAPITOLI().filter(
    (c) => (!area || c.area === area || (area === 'piano' && c.area === 'inizio')) && (!c.vis || c.vis()),
  );
  if (!cap.length)
    return '<div class="main-card"><div style="padding:16px">Nessuna guida disponibile per il tuo profilo.</div></div>';
  const idDi = (t) => 'guida-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let h =
    '<div class="guida-radice"><div class="main-card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>Guida &middot; scegli l\'argomento</span><input type="search" class="campo-cerca" placeholder="Cerca nella guida (es. CGF, malattia, pause)" oninput="guidaCerca(this)" autocomplete="off" style="min-width:260px"></div><div style="padding:12px 14px">' +
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:10px">Qui trovi solo gli argomenti che riguardano quello che puoi fare tu. Se e la prima volta, parti da <b>Da dove iniziare</b>.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
    cap
      .map(
        (c) =>
          '<button class="btn-export" style="font-size:var(--fs-md,.875rem);padding:6px 14px" onclick="document.getElementById(\'' +
          idDi(c.titolo) +
          "').scrollIntoView({behavior:'smooth',block:'start'})\">" +
          escP(c.titolo) +
          '</button>',
      )
      .join('') +
    '</div></div></div>';
  cap.forEach((c) => {
    h +=
      '<div class="main-card" id="' +
      idDi(c.titolo) +
      '" style="margin-top:12px"><div class="card-header">' +
      escP(c.titolo) +
      '</div><div style="padding:10px 16px;font-size:var(--fs-md,.875rem);line-height:1.55">' +
      c.righe.map((r) => '<p class="guida-riga" style="margin:4px 0">• ' + r + '</p>').join('') +
      '</div></div>';
  });
  return (
    h +
    '<p class="guida-nessuno" hidden style="padding:14px;color:var(--muted)">Nessun argomento contiene questa parola.</p></div>'
  );
}
// RICERCA NELLA GUIDA: restano visibili solo le righe che contengono la parola
// (in tutti i capitoli), i capitoli senza righe si nascondono
function guidaCerca(inp) {
  const radice = inp.closest('.guida-radice');
  if (!radice) return;
  const q = inp.value.trim().toLowerCase();
  let tot = 0;
  radice.querySelectorAll('.main-card[id^="guida-"]').forEach((cap) => {
    let n = 0;
    cap.querySelectorAll('.guida-riga').forEach((r) => {
      const ok = !q || r.textContent.toLowerCase().includes(q);
      r.hidden = !ok;
      if (ok) n++;
    });
    const titoloOk = q && cap.querySelector('.card-header').textContent.toLowerCase().includes(q);
    if (titoloOk) cap.querySelectorAll('.guida-riga').forEach((r) => (r.hidden = false));
    cap.hidden = !(n || titoloOk || !q);
    tot += n || titoloOk ? 1 : 0;
  });
  const nessuno = radice.querySelector('.guida-nessuno');
  if (nessuno) nessuno.hidden = !q || tot > 0;
}

function renderGuida() {
  const el = document.getElementById('guida-content');
  if (el) el.innerHTML = renderGuidaHtml();
}
