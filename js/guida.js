/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
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
        "Il programma è diviso in <b>pagine</b>, che trovi nella barra in alto. Le pagine di ogni giorno sono sempre in vista; <b>Maison e inventario</b> e <b>Strumenti</b> (Assistente, Statistiche del Diario, Registro attività, Guida del programma, Impostazioni generali) si aprono con un clic come un piccolo elenco. Al telefono tutte le pagine sono nel pulsante <b>Menu</b> in alto a sinistra, insieme a tema, dimensione del testo ed Esci. Vedi solo le pagine che ti sono state abilitate: se una pagina non c'è, significa che non rientra nel tuo ruolo.",
        'La <b>Home</b> riassume la giornata: promemoria in scadenza, avvisi e scorciatoie. È il punto di partenza consigliato ogni volta che entri.',
        'Quasi tutto si salva <b>da solo</b> nel momento in cui scrivi: non esiste un tasto Salva generale. Dove serve una conferma, il programma te la chiede.',
        '<b>Annulla e Ripristina</b> valgono in tutto il programma: dopo una modifica compare in basso a sinistra la barretta con l\'ultima azione in parole (per esempio "Creato modulo rdi · Rossi"); Annulla la toglie, Ripristina la rimette. Ctrl+Z e Ctrl+Y fanno lo stesso fuori dai campi di testo. Regole: si annullano le proprie azioni della sessione corrente (le ultime 30), un\'azione intera alla volta; se nel frattempo un altro operatore ha toccato la stessa riga il programma avvisa e non sovrascrive; un documento creato e poi annullato va nel Cestino; ogni annullamento resta nel registro attività. Lo stesso Annulla vale anche per il calendario del Piano e per il briefing; chat e registro non si annullano.',
        "Se una cosa non ti torna, la spiegazione è qui nella Guida: usa l'indice in alto o la ricerca per arrivare all'argomento.",
        "<b>La pagina resta ferma</b>: quando il programma aggiorna una pagina (un salvataggio, un colore, una cella, un aggiornamento da un altro operatore) resti dove eri, anche nei riquadri che scorrono di lato come il calendario del Piano. Anche ricaricando la pagina del browser (F5) torni allo stesso punto e resti sul settore, sul settore del Piano e sul mese in cui eri; un nuovo accesso parte dal settore scelto nella schermata di accesso. Si riparte dall'inizio solo cambiando pagina dal menu; restano liberi gli spostamenti voluti, come la ricerca globale che porta in vista il risultato.",
        "<b>Ricerca globale</b> (la casella al centro in alto; al telefono la lente accanto al Menu): basta una parte di un nome o di una parola. In cima compaiono i <b>collaboratori</b> del settore, anche chi non ha nessuna registrazione, e il clic apre la loro scheda; sotto le registrazioni del Diario, i moduli, i <b>cambi turno</b>, le note, la Maison, i promemoria, le spese e il registro. Il clic su un risultato apre la pagina giusta, porta in vista l'elemento trovato e lo evidenzia per un momento.",
        '<b>Dimensione del testo</b>: i pulsanti <b>A&minus;</b> e <b>A+</b> in alto a destra (al telefono nel Menu) rimpiccioliscono o ingrandiscono tutti i caratteri (dal 90% al 130%). La scelta vale solo per il tuo operatore e resta salvata: la ritrovi su ogni PC dove entri.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Diario delle attività',
      vis: () => _guidaVis('diario'),
      righe: [
        'Serve a registrare cosa succede in turno: attività, richieste, errori, ammonimenti, malattie, non disponibilità, note.',
        'Scegli il <b>tipo</b>, il <b>collaboratore</b> e scrivi il testo. La data e il tuo nome vengono messi in automatico.',
        'Le voci si possono cercare, filtrare per tipo o collaboratore, modificare e mettere in evidenza. Quelle eliminate finiscono nel Cestino e si possono recuperare.',
        'Le <b>malattie</b> registrate qui compaiono da sole nel piano di lavoro, quindi non vanno riscritte due volte. Vale anche al contrario: una M scritta nel piano o una copertura malattia si registrano nel Diario e contano nella scheda del collaboratore. Ognuno può partire dal punto che preferisce, il risultato non cambia.',
        'Vale anche quando si toglie: se una M viene rimossa dal piano o sovrascritta con un turno, il programma propone di togliere quei giorni anche dal Diario. Le registrazioni finiscono nel Cestino e si possono recuperare.',
        'La <b>copertura malattia</b> (nel Piano: menu Sistema, <b>Sostituisci chi è in malattia</b>) propone prima chi è libero quel giorno e in regola; se non basta prova le <b>soluzioni a catena</b> (libera un collega spostando il suo turno del giorno prima a un altro), sempre nel rispetto di riposo, consecutivi e formazione. Ogni proposta ha la sua spunta: si sceglie cosa applicare e si può stampare la lista.',
        "Tutte le regole valgono anche a mano e in ogni cambio (per esigenze, scambio con restituzione, cerca cambio, copertura malattia): riposo di 11 ore, massimo giorni consecutivi (contati anche <b>a cavallo tra un mese e l'altro</b>), <b>accompagnamento</b> (chi è segnato accompagnato non deve restare da solo nel suo gruppo quel giorno) e <b>avviso se il collaboratore non è formato</b> per quel turno. Il controllo vale per tutti i collaboratori toccati e per tutti i giorni coinvolti, restituzione compresa. Si può confermare lo stesso, ma la segnalazione resta scritta nel commento della cella. I commenti automatici si possono sempre modificare o cancellare col tasto destro. Avvisa anche quando si scrive un turno su un <b>congedo dedicato alle vacanze</b> (le C e i WD messi prima o dopo un periodo di ferie secondo le regole): quel riposo verrebbe tolto.",
        'Nel <b>cerca cambio</b> per il giorno libero, prima di confermare puoi premere <b>Stampa lista colleghi</b>: esce un foglio con i colleghi disponibili e le date di restituzione, da consegnare al collaboratore. Lui chiede a chi vuole, poi si torna e si applica il cambio. Stampare la lista non cambia nulla nel piano.',
        'Nel briefing, chi ha la cella colorata nel piano viene evidenziato: il nome appare con lo sfondo colorato sul foglio. Con le <b>Evidenziazioni dal piano</b> (in fondo alla scheda Briefing) si decide, per ogni settore, quale colore del piano diventa quale colore sul briefing e cosa significa: per esempio nel valet il coordinatore si segna in rosso sul piano e sul foglio si vede in verde.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Rapporto giornaliero',
      vis: () => _guidaVis('rapporto'),
      righe: [
        'È il rapporto di fine turno: presenze, assenze, differenze di cassa e le voci che il tuo settore deve compilare.',
        'I campi del rapporto sono personalizzabili per settore: se ne manca uno, si aggiunge dalle Impostazioni.',
        "<b>Il calendario del mese</b>: la pagina Rapporto si apre sul mese, con le frecce per cambiarlo e la tendina dell'anno. Ogni giorno ha un pallino per il turno PRESTO e uno per la NOTTE quando c'è qualcosa scritto; un clic sul giorno apre il rapporto con le due colonne PRESTO e NOTTE, e <b>Torna al calendario</b> riporta indietro. Si scrive nelle caselle e si salva da solo: compare «Salvato» solo quando il database ha confermato, altrimenti «Non salvato: riprova».",
        '<b>Esporta CSV</b> ed <b>Esporta PDF</b>: sotto il calendario, scegliendo <b>Dal</b> e <b>Al</b> (proposto il mese aperto), per avere i rapporti di un periodo; dentro un giorno, gli stessi pulsanti esportano quel rapporto. Esempio: Dal 1.10 Al 31.10 per il PDF del mese da consegnare.',
        'A fine mese il rapporto alimenta le statistiche e gli avvisi sulle differenze di cassa oltre soglia.',
        '<b>Nomi uguali (omonimi)</b>: quando nel rapporto (assenze o differenze di cassa) un nome corrisponde a più collaboratori, il programma sceglie da solo solo se la scelta è sicura (uno solo nel settore aperto, oppure chi ha già la registrazione di quel rapporto); altrimenti apre una finestra con i nomi, il settore e la funzione e chiede chi è.',
        '<b>Piano, Rapporto e Diario collegati</b>: una M scritta nel Piano o una sostituzione fatta con Sostituisci chi è in malattia fanno come se l\'assenza fosse scritta nel Rapporto: la persona entra nelle assenze del Rapporto del primo giorno (PRESTO se il turno sostituito è diurno o era un riposo, NOTTE se notturno) e da lì nel Diario; la cella ha la nota "Ex R23 - operatore" e, se il giorno era un CGF, si propone il giorno sostitutivo. Una malattia scritta nel Rapporto scrive le M nel Piano come quella del Diario. Cancellando la malattia dal Diario, nel Piano torna la sigla di prima e la persona sparisce dal Rapporto.',
        '<b>Rapporto e Diario collegati</b>: le assenze e le differenze di cassa scritte nel Rapporto creano le registrazioni nel Diario ("da rapporto PRESTO del 30/09/2026"). Se cancelli la registrazione dal Diario, la persona sparisce anche dal Rapporto di quel giorno (il resto del testo resta: "Rossi e Bianchi assenti" diventa "Bianchi assenti"). Se la togli dal Rapporto, il Diario resta: la registrazione diventa "tolta dal rapporto" e un avviso lo dice. Se la modifichi nel Diario (giorni di malattia, importo), il programma chiede se correggere anche il Rapporto.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Chat e note tra colleghi',
      vis: () => _guidaVis('note_collega'),
      righe: [
        'Si apre dalla voce <b>Note colleghi</b> della barra in alto. Funziona come una chat: gruppi per settore e conversazioni singole, con notifiche quando qualcuno ti scrive.',
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
        'Quelli scaduti o di oggi compaiono in un riquadro in Home finché non li completi.',
        'Sono divisi per settore: ognuno vede quelli del proprio.',
        "<b>Fatto</b> è la spunta a sinistra di ogni promemoria e vale per tutti quelli a cui è assegnato: se lo segna un collega, sparisce anche dagli altri PC (l'elenco si aggiorna aprendo la pagina e ogni 5 minuti). Se lo segni fatto su un PC che non si era ancora aggiornato, il programma te lo dice e non lo rifà.",
        "<b>Promemoria che si ripetono</b> (ogni giorno, settimana, mese...): con Fatto nasce il prossimo, con la prima data della serie dopo oggi, anche se era scaduto da giorni. Togliendo la spunta Fatto il promemoria torna aperto, e il programma avvisa se il prossimo c'è già.",
        '<b>Elimina</b> sta nel menu <b>…</b> a destra del promemoria: lo cancella per sempre (non va nel Cestino), dopo una conferma.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Consegna del turno',
      vis: () => _guidaVis('consegna'),
      righe: [
        'La consegna scritta tra un turno e il successivo: cosa è rimasto in sospeso, cosa deve sapere chi entra. Si apre dalla voce <b>Consegna</b> della barra in alto.',
        '<b>Scrivere una consegna</b>: si sceglie il turno che esce (PRESTO o NOTTE), il <b>destinatario</b> (tutti oppure uno o più colleghi), la <b>priorità</b> (normale o alta) e si scrive il messaggio. Esempio: «PRESTO → tutti, priorità alta: la cassa 4 ha il cassetto bloccato, il tecnico passa alle 18». I destinatari ricevono anche la notifica sul telefono.',
        "<b>Avviso all'accesso</b>: chi entra nel programma e ha consegne non lette del suo settore vede subito una finestra con l'ultima consegna (chi l'ha scritta, quando e, se serve, PRIORITA ALTA) e quante altre ce ne sono; aprendosi, quella consegna risulta letta. <b>Vedi tutte</b> porta alla pagina Consegna. Il numero sulla voce Consegna dice quante consegne restano da leggere.",
        '<b>Leggere e confermare</b>: nella pagina ogni consegna ricevuta ha il pulsante <b>Letta</b>; dopo la conferma si legge «Letto da … il …», così resta traccia del passaggio. In alto si cerca per testo, autore o destinatario e si filtra con Dal e Al.',
        "<b>Modificare e annullare</b>: chi ha scritto una consegna la può <b>Modificare</b> o <b>Annullare l'invio</b> (viene eliminata, dopo una conferma) solo finché nessuno l'ha letta. Dopo, compare «Non modificabile (letta)»: si scrive una consegna nuova con la correzione.",
      ],
    },
    {
      area: 'diario',
      titolo: 'Maison e budget clienti',
      vis: () => _guidaVis('maison'),
      righe: [
        "<b>Tipi di buono</b> (Impostazioni &gt; Maison, solo amministratore): per ogni buono sigla, nome, valore in CHF e attivo. Si può <b>rinominare</b> un buono e <b>aggiungere</b> un tipo nuovo (sigla da 2 a 6 lettere o cifre, nome, valore e, se serve, le parole che nel file Maison lo indicano, es. brunch). La sigla non si cambia dopo l'aggiunta, perché è scritta nelle registrazioni; un tipo che non si usa più si <b>disattiva</b>: sparisce dai menu ma resta nello storico, nelle statistiche e negli export. Con le spunte <b>Settori</b> un buono compare solo nei menu di quei settori (es. un buono solo ai Tavoli); nessuna spunta = in tutti. Menu, tabelle, grafici, export e magazzino si adeguano da soli.",
        'Gestione delle consumazioni offerte ai clienti: budget per cliente, categorie, buoni e conteggi mensili.',
        'Il testo del gestionale si incolla nel riquadro di importazione e il programma riconosce da solo cliente, importo e tipo di consumazione.',
        'I <b>buoni</b> si calcolano in automatico dal costo, con i valori impostati in Impostazioni.',
        'Le voci si possono correggere a mano; i doppioni si uniscono con la funzione apposita.',
        "<b>Inserimento a mano da tastiera</b>: nelle caselle Cliente, PX, Importo, Tipo, N° buoni e Data ci si sposta con le frecce (← → e ↑ ↓) senza mouse; nel nome del cliente ← e → muovono il cursore e passano alla casella accanto solo all'inizio o alla fine del nome. Con l'elenco dei clienti aperto, ↓ e ↑ scelgono il nome e Invio lo conferma.",
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
        'Ogni modulo nuovo (Allineamento, Apprezzamento, RDI) è un record separato: aprire un modulo salvato e poi premere un pulsante "Nuovo" crea un modulo nuovo, non sovrascrive quello aperto prima. Un modulo salvato si aggiorna solo riaprendolo dall\'elenco e rigenerando il PDF.',
        'Raccolta dei moduli compilabili e stampabili del settore, con archivio a cartelle per Word, PDF ed Excel.',
        'I moduli generati restano archiviati e si possono ristampare in qualsiasi momento.',
        'I fogli di <b>cambio turno</b> si trovano nel Piano, scheda <b>Cambi turno</b>, e nella scheda del collaboratore.',
        "<b>Modelli dei documenti</b>: i testi fissi dei documenti stampati (titoli, frasi standard, diciture, firme, distribuzione) si cambiano dalle schermate, senza toccare il programma. Valgono per Allineamento, Apprezzamento, RDI, Lista di non disponibilità 1187 (compilata e vuota), Notifica d'assenza 827, foglio di cambio turno e formulario di cambio vacanza. I campi che compila chi fa il modulo (nome, descrizioni, date, scadenza) e l'impaginazione del PDF non cambiano. Si apre dal pulsante <b>Modelli dei documenti</b> nella pagina Moduli o da Impostazioni › Settori e moduli; lo vede solo chi può modificarli: l'amministratore e chi ha il permesso <b>Modelli dei documenti: modificare</b> (all'inizio solo l'amministratore; il database ricontrolla).",
        "<b>Come si usa la finestra dei modelli</b>: a sinistra il documento, al centro i suoi testi (accanto a ognuno c'è il testo originale e <b>modificato</b> se è cambiato), a destra l'<b>anteprima del PDF</b> con dati di esempio, che si aggiorna mentre scrivi. I <b>campi automatici</b> fra graffe diventano il dato vero: <b>{nome}</b> (collaboratore), <b>{data}</b>, <b>{settore}</b>, <b>{responsabile}</b>, <b>{azienda}</b> e <b>{programma}</b> (da Identità del programma) e, dove servono, <b>{mese}</b>, <b>{giorno}</b> (giorno di consegna della lista 1187) e <b>{richiesto}</b>; un clic sul campo lo inserisce dove sei nel testo, uno sconosciuto viene segnalato e resta scritto così. <b>Testo originale</b> rimette un testo, <b>Rimetti il testo originale</b> tutto il documento; poi <b>Salva il modello</b>.",
        "Ogni salvataggio finisce nel <b>Registro attività</b> con il testo prima e dopo; <b>Versioni precedenti</b> elenca i salvataggi (chi e quando) e <b>Rimetti i testi di prima</b> riporta nella finestra i testi com'erano prima di quel salvataggio, da controllare e salvare. Un modulo già fatto si ristampa con i testi che aveva quando è stato creato; i documenti nuovi usano i testi in vigore. Se due persone modificano insieme, chi salva per secondo riceve un avviso invece di cancellare il lavoro dell'altro.",
      ],
    },
    {
      area: 'diario',
      titolo: 'Statistiche del Diario e report',
      vis: () => _guidaVis('statistiche'),
      righe: [
        'Grafici e tabelle su attività, assenze, differenze di cassa e andamento del settore. I numeri della pagina si filtrano con <b>Dal</b> e <b>Al</b> in alto.',
        "<b>Report Direzione PDF</b> (amministratore, nella riga «Report Direzione · periodo del PDF»): si sceglie il periodo (<b>Mese</b>, <b>Anno</b> o <b>Periodo</b> da un mese a un altro) e le sezioni da includere: <b>Organico</b> (persone per settore, fissi, jolly, livelli), <b>Operativo</b> (andamento del mese o del periodo) e <b>Sviluppo</b> (sviluppo del personale e incentivi). Il PDF ha il logo e il nome dell'azienda dell'identità del programma ed è riservato. Il periodo vale solo per il PDF, non per i numeri a schermo. Esempio: Mese = settembre, tutte e tre le sezioni, per la riunione di direzione.",
        '<b>Riepilogo mensile PDF</b> (accanto): si sceglie mese, anno e sezioni; esce la panoramica del mese con i collaboratori con più registrazioni, gli errori e le malattie.',
      ],
    },
    {
      area: 'inizio',
      titolo: 'Home: riepilogo e report',
      vis: () => true,
      righe: [
        "La <b>Home</b> è la prima pagina dopo l'accesso: promemoria in scadenza, avvisi, compleanni e il grafico della settimana, che si sposta con <b>Settimana precedente</b> e <b>Settimana successiva</b>.",
        "<b>Report Settimanale PDF</b> e <b>Report Annuale PDF</b> (in fondo alla Home): prima si scelgono le sezioni (Panoramica, Differenze Cassa, Costi Maison, Spese Extra, Regali, Moduli Disciplinari, Promemoria e, se serve, Registrazioni dettagliate), poi <b>Genera PDF</b>. Il settimanale riguarda gli ultimi 7 giorni, oggi compreso; l'annuale l'anno in corso. Esempio: ogni lunedì mattina il Report Settimanale PDF, solo con Panoramica e Differenze Cassa.",
        '<b>Report Settimanale CSV</b> e <b>Report Annuale CSV</b>: gli stessi dati in un file da aprire con Excel.',
        'I report riguardano il settore aperto in alto: per un altro settore si cambia settore e si rifà il report.',
      ],
    },
    {
      area: 'diario',
      titolo: 'Assistente (scrittura veloce)',
      vis: () => _guidaVis('assistente'),
      righe: [
        "Aiuta a scrivere testi di servizio: comunicazioni, richieste, correzione di bozze, traduzioni nelle lingue dell'azienda.",
        '<b>Non vanno mai inseriti dati personali dei clienti o dei colleghi</b>: si scrive in forma generica.',
        'Il testo prodotto è sempre da rileggere e correggere prima di usarlo.',
      ],
    },
    {
      area: 'admin',
      titolo: 'Intelligenza artificiale: quale usare',
      vis: () => _guidaAdmin(),
      righe: [
        "In <b>Impostazioni > Settori e moduli > Intelligenza artificiale</b> c'è l'elenco dei fornitori. Uno è <b>In uso</b>; un altro può fare da <b>Riserva</b>, usata da sola se il primo non risponde.",
        "<b>Aggiungi fornitore</b>: si sceglie il tipo (Groq, Ollama o LM Studio sul server interno, altro servizio compatibile), l'indirizzo, il modello per i testi e quello per i moduli, e la chiave se serve. Con un modello sul server interno (per esempio Llama con Ollama, indirizzo <b>/ai/v1</b>) i testi non escono dal casino.",
        '<b>Prova</b> manda una domanda brevissima e mostra il tempo di risposta e i modelli disponibili; <b>Usa</b> rende attivo quel fornitore per tutti.',
        "In ogni caso i nomi dei collaboratori vengono sostituiti prima dell'invio e le fotografie non escono dal programma.",
      ],
    },
    {
      area: 'inizio',
      titolo: 'Istruzioni del settore: come si scrivono',
      vis: () => true,
      righe: [
        "In cima alla Guida c'è <b>Istruzioni del settore</b>: le regole interne del tuo settore (come si apre e si chiude il turno, chi chiamare, cosa controllare), scritte e aggiornate dai responsabili, senza chiedere a uno sviluppatore. Ognuno vede quelle dei suoi settori; chi lavora in più settori le vede una sotto l'altra, prima quelle del settore aperto.",
        "<b>Chi le scrive</b>: l'amministratore e chi ha il permesso <b>Istruzioni del settore: modificare</b> (Impostazioni › Visibilità e permessi; all'inizio solo l'amministratore), e solo per i propri settori: un responsabile degli Slots non cambia quelle dei Tavoli. Il pulsante <b>Modifica</b> (o <b>Scrivi le istruzioni</b>, se il settore non ne ha ancora) compare solo a chi può.",
        "<b>Come si scrivono</b>: nella finestra a sinistra c'è il testo, a destra l'anteprima di come apparirà. <b>#</b> a inizio riga fa un titolo, <b>-</b> un elenco puntato, <b>1.</b> un elenco numerato, <b>**parola**</b> il grassetto; i pulsanti Titolo, Elenco, Elenco numerato e Grassetto lo fanno per te sulle righe scelte. Una riga vuota separa i paragrafi. Il testo si mostra sempre come testo semplice: niente collegamenti, immagini o codice.",
        "Accanto al nome del settore c'è l'<b>ultima modifica</b> (chi e quando); ogni salvataggio finisce anche nel <b>Registro attività</b>. Se due persone modificano insieme, chi salva per secondo riceve un avviso e il suo testo resta nella finestra: lo copi, riapri le istruzioni aggiornate e lo aggiungi.",
      ],
    },
    {
      area: 'inizio',
      titolo: 'Dettagli utili in tutto il programma',
      vis: () => true,
      righe: [
        "<b>Accesso, password e impronta o volto</b> (operatori): l'accesso con impronta o volto vale 90 giorni dalla registrazione, poi si riattiva dalle Impostazioni dopo essere entrati con la password. Serve sempre il gesto (impronta o volto): quando la sessione scade il programma non rientra più da solo. L'amministratore entra con la password principale. Cambiare la password chiude le sessioni aperte sugli altri dispositivi e toglie l'impronta registrata. Dopo 30 giorni dall'ultimo accesso con la password il programma la chiede di nuovo.",
        "<b>Rinomina di un collaboratore</b> (amministratore): il nome cambia in tutto il programma in una volta sola (anagrafica, Diario, piano, schede, vacanze, ore, chat se non è anche operatore); se qualcosa non va non cambia niente. Annulla la rimette com'era, ovunque. Se il collaboratore è anche operatore, anagrafica, Diario, Piano, schede e briefing futuri passano al nome nuovo, mentre il nome di accesso e la chat restano quelli di sempre, così al login ritrova i suoi messaggi.",
        '<b>Mini-scheda del collaboratore</b>: fermando il mouse mezzo secondo su un nome, ovunque nel programma (calendario, Diario, Avvisi, Crediti, Vacanze, Statistiche...), compare un riquadro con settore, funzione, percentuale, turni di oggi e dei prossimi 3 giorni, vacanze che restano, CGF da dare, saldo ore (se calcolato), congedi e le cose da guardare (settimane oltre il massimo, riposo, regole, malattia in corso). Sul telefono si apre tenendo premuto. Un clic sul nome apre la scheda completa come prima. I crediti si vedono solo con il permesso Crediti; i dati riservati restano nella scheda completa.',
        "<b>Tabelle come Excel</b> (calendario, briefing, pause): un clic seleziona la cella (senza modificarla), le frecce si spostano su, giù, destra e sinistra (Maiusc + frecce allarga la selezione nel calendario), Tab passa alla cella accanto. Si modifica con doppio clic, Invio o F2, oppure scrivendo direttamente: il testo sostituisce la cella. In modifica Invio, Tab e le frecce su/giù confermano e passano alla cella vicina; Esc annulla. Canc svuota la cella. Nel briefing e nelle pause le righe si spostano <b>trascinandole</b> (dalle colonne E/U del briefing, dalla maniglia a destra nelle pause; anche col dito): nelle pause gli orari si ricalcolano come con le vecchie frecce. Trascinando una cella già selezionata la si <b>scambia</b> con un'altra della stessa colonna (nelle pause: le postazioni).",
        "Il <b>Cestino</b> (Strumenti › Impostazioni generali, scheda Dati, sezione Cestino) lo usano anche gli operatori: ripristinano le registrazioni del Diario e i moduli eliminati del loro settore; l'eliminazione definitiva resta all'amministratore.",
        '<b>Ricerche</b>: la Guida ha una casella di ricerca (restano solo le righe con la parola), la scheda Vacanze cerca per nome o numero di settimana.',
        '<b>Diario veloce e completo</b>: all\'apertura il Diario porta in memoria gli ultimi 24 mesi di tutti i settori, più gli ammonimenti verbali e le differenze di cassa di sempre (così gli avvisi disciplinari e di cassa contano tutta la storia). Le registrazioni più vecchie non spariscono: la scheda del collaboratore mostra sempre tutta la sua storia, la ricerca cerca anche nell\'archivio, le Statistiche contano tutto, un filtro "Dal" più vecchio porta quel periodo, e in fondo all\'elenco c\'è "Mostra registrazioni più vecchie".',
        '<b>Un solo Annulla</b> per tutto il programma, anche per il calendario del piano e il briefing: vedi il capitolo «Da dove iniziare».',
        "<b>Ora del promemoria</b>: dalle 06:00 alle 22:00 ogni due ore e 00:00 (mezzanotte). La notifica sul telefono parte a quell'ora di Lugano, il giorno scelto (il giorno stesso, 1, 3 o 7 giorni prima); nel programma il promemoria compare dal giorno scelto.",
        "<b>Salvataggi controllati</b>: il programma scrive «Salvato» solo quando il database ha confermato, altrimenti «Non salvato: riprova». Il fabbisogno e l'import Maison si sostituiscono in un colpo solo: se la rete cade a metà resta tutto com'era. Se la connessione cade mentre si salva, il programma non ripete alla cieca ma dice di controllare. I messaggi di errore sono in italiano semplice.",
        '<b>Freccia Indietro</b>: la freccia del browser o del telefono torna alla pagina e alla scheda del Piano di prima, invece di uscire dal Diario. Dopo un "vai a" (per esempio da Chi può fare cosa) la barra in basso riporta al punto di partenza.',
        '<b>Promemoria da una registrazione</b>: il pulsante Promemoria su ogni registrazione del Diario apre un promemoria già compilato (Follow-up: nome e tipo, con il testo); si sceglie la data e si salva. Sostituisce le vecchie scadenze del Diario.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Cosa si imposta per settore',
      vis: () => _guidaVis('piano'),
      righe: [
        "Ogni settore (Slots, Tavoli, Valet, Cleaning) ha la sua configurazione. Prima di cambiare qualcosa si sceglie il settore <b>in alto</b>: ogni voce di questo elenco vale solo per il settore aperto. Per un settore nuovo conviene seguire quest'ordine; accanto a ogni voce c'è dove si trova e un esempio per Slots, Tavoli e Valet.",
        '<b>1. Funzioni del settore</b> (Piano › Impostazioni, amministratore): i ruoli del settore, con il nome per esteso. Slots: RESP, SUP, BO, HOST. Tavoli: CR, DI, SUP. Valet: HOST. La funzione di ogni persona si sceglie nella sua scheda (Impostazioni generali › Gestione collaboratori).',
        "<b>2. Turni del settore</b> (Piano › Turni, amministratore): sigla, area, orari, ore, tipo e colore di ogni turno. Slots: S7 nell'area SALA, R22 in REC, C0 in CASSA, Z0 in SUP. Tavoli: 21, 81, 91, 911 nell'area TAVOLI. Valet: X1, X3, X4 nell'area VALET. Due settori possono usare la stessa sigla senza confondersi.",
        '<b>3. Turni per funzione</b> (Piano › Impostazioni, amministratore): quali turni fa ogni funzione. Slots: SUP con Z0, Z8, Z12 come PRINCIPALE; BO con 9 e L1 come PRINCIPALE. Tavoli: SUP con 21, 81, 91, 911 come PRINCIPALE e 6, 9 come AMMESSO. Valet: vuoto, così ognuno fa tutti i turni per cui è formato.',
        '<b>4. Regole di gruppo</b> (Piano › Regole, permesso Regole del piano): i limiti in più del settore. Slots: L1 e 9 solo a BO, SUP e RESP; ogni giorno almeno 1 persona con Accoglienza su S5 o S31. Tavoli: 21, 81, 91, 911 solo ai SUP; Equilibrio dei livelli nelle fasce della serata. Valet: Coordinatori, apertura X1 e chiusura X3 o X4.',
        "<b>5. Scala dei livelli con «Turni che può fare»</b> (Formazione › Imposta livelli e specialità, amministratore): i gradini nell'ordine in cui si impara il lavoro e, per ognuno, l'area dei turni che apre. Slots: Sala Slot (SALA), Reception (REC), Cassa (CASSA), Accoglienza, Back Office, Supervisor. Tavoli: per esempio CR1, CR2, ISP 1 e così via fino a SUP, tutti con TAVOLI, più specialità come Poker. Valet: Servizio Valet e Accoglienza clienti, con VALET. Un livello senza turni indicati non abilita a niente.",
        '<b>6. Livelli parziali</b> (Formazione, matrice Chi sa fare cosa): chi ha un gradino alto senza quelli sotto ha il livello «parziale». Per il Piano vale il gradino più alto; punti e premi arrivano solo con la scala completa. Slots: chi arriva da un altro casinò e fa subito cassa è «L3 · Cassa, parziale, manca Sala, Reception». Tavoli: chi ha ISP 3 ma non ISP 1. Valet: Accoglienza clienti senza Servizio Valet. Spuntando un gradino con quelli sotto vuoti, il programma chiede «Spunto anche i gradini sotto?».',
        '<b>7. Preferenze collaboratori</b> (Piano › Impostazioni, amministratore e chi ha il permesso Storico HR): le eccezioni di ogni persona. Slots: S1 e S3 bloccati a chi non copre SALA, REC e CASSA; la spunta Preferisce per il turno L1. Tavoli: Turni consentiti per chi deve fare un turno senza il livello richiesto. Valet: un collega che lavora solo venerdì, sabato e domenica (Giorni di lavoro).',
        "<b>8. Regole pause</b> (Piano › Briefing, riquadro Regole pause sotto il foglio delle pause, amministratore): quante pause e quanto lunghe. Slots: 6 ore 15+15, 7 ore 30+15, da 8 ore 30+15+15, con gli schemi di copertura di sempre. Tavoli e Valet partono da: sotto le 6 ore 15, da 6 ore 15+15, da 7 ore 30+15, da 8 ore 30+15+15, almeno 45 minuti fra due pause, nessuna pausa venerdì e sabato dalle 23.00 all'01.00, una persona in pausa alla volta. Ogni settore cambia le sue con Nuova regola, Modifica ed Elimina.",
        '<b>9. Colonne del briefing</b> (Piano › Briefing, card in fondo): Slots: E, U, HOST, T, CD (numero cassa), USCITA, FIRMA. Tavoli: E, U, COLLABORATORE, T, USCITA, FIRMA. Valet: come i Tavoli, più RADIO e BADGE. Una colonna libera, per esempio POSTAZIONE, si aggiunge con <b>+ Aggiungi colonna libera</b>.',
        '<b>10. Evidenziazioni dal piano</b> (Piano › Briefing, in fondo): quale colore del piano diventa quale colore sul briefing e cosa vuol dire. Valet: il coordinatore segnato in rosso nel piano esce colorato sul foglio. Slots e Tavoli: per esempio chi è in formazione.',
        "<b>11. Istruzioni del settore</b> (in cima alla Guida, permesso Istruzioni del settore: modificare): le regole interne del reparto, scritte dai responsabili. Slots: chi apre la sala e controlla le casse. Tavoli: chi assegna i croupier ai tavoli. Valet: chi prende chiavi e radio all'apertura.",
        "<b>12. Valori delle regole del piano</b> (Piano › Regole, menu del settore in alto nella scheda): ogni regola ha un valore generale; cambiandolo con un settore scelto nasce l'eccezione solo per quel settore. Esempio: riposo minimo 11 ore ovunque, 12 ai Tavoli. Il Turno preferito è L1 negli Slots.",
        '<b>13. Colonne di import</b> (Piano › Calendario › Esporta › Importa da Excel scegliendo le colonne, permesso Import da file): con <b>Salva queste colonne per il settore</b> la scelta viene riproposta al prossimo file con lo stesso foglio. Esempio: il file di un consulente dei Tavoli con i nomi nella colonna C e i giorni dalla colonna E.',
        "<b>14. Affiancamenti</b> (Piano › Affiancamenti, in fondo alla scheda): per ogni competenza il gruppo di turni e il modello dei turni dell'allievo. Slots: cassa C0, C4, C23 poi C15, C5. Tavoli: per CR2 i turni del gruppo TAVOLI scelti dal responsabile. Valet: il gruppo VALET.",
        '<b>15. Nome nei documenti, pagine e generazione automatica</b>: in Impostazioni › Settori il nome del settore nei documenti stampati (Slots = FoBoSlot) e le pagine attive; in Piano › Impostazioni il giorno del mese e i minuti della generazione automatica di ogni settore.',
        "<b>Uguali per tutti i settori</b> (non si scelgono per settore): le regole di legge (riposi, domeniche libere, ore della settimana); i <b>riferimenti normativi</b> sotto le regole (Piano › Regole, matita: cambiando il testo cambia in tutti i settori); i <b>modelli dei documenti</b> (un solo testo per modulo: il campo {settore} diventa il nome nei documenti del settore che stampa); l'<b>identità e il logo</b> del programma; i codici speciali (V, M, C, CGF...); i festivi cantonali; le azioni e le soglie degli incentivi. I <b>punti e premi del passaggio di livello</b> invece sono uguali per tutti finché un settore non sceglie «Propri di» quel settore (Formazione, Configurazione incentivi e premi, Valori per).",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: le schede una per una',
      vis: () => _guidaVis('piano'),
      righe: [
        'Il Piano è il calendario dei turni del mese, settore per settore. In alto si sceglie il settore e il mese; le schede sono in sei gruppi: Giornata, Assenze, Ore, Persone, Archivio e Configurazione. Ognuno vede solo le schede che gli sono permesse.',
        '<b>Calendario</b>: la griglia del mese, una riga per persona e una colonna per giorno. Si scrive come in Excel (clic, sigla, Invio; trascinando si scrive su più celle). Da qui <b>Prepara il mese</b> (poi propone Migliora la bozza); nei menu <b>Controlla</b>, <b>Sistema</b>, <b>Strumenti</b> ed <b>Esporta</b> tutti gli altri comandi, ognuno con una riga di spiegazione; <b>Svuota il mese</b> sta a destra, in rosso. Il settore del Piano è lo stesso della barra in alto: cambiarlo qui lo cambia anche lì.',
        '<b>Briefing</b>: il foglio del giorno con chi lavora, orari, pause e note, compilato partendo dal piano.',
        "<b>Avvisi</b>: tutto quello che richiede attenzione (ore della settimana, riposi, regole del mese, chiusura dell'anno, posti scoperti, malattie lunghe, vacanze non nel piano); il numero rosso dice quante cose ci sono da guardare.",
        '<b>Crediti</b>: per ogni persona i giorni ancora da recuperare (liberi, festivi lavorati, ore).',
        "<b>Vacanze</b>: le vacanze dell'anno, quante ne spettano, quante sono nel piano e quante restano; Applica al piano le scrive nel calendario.",
        "<b>Saldo</b>: ore previste dal contratto, ore lavorate e differenza del mese e dall'inizio dell'anno; il saldo del mese si può correggere con le ore reali e una nota.",
        '<b>Recupero ore</b>: le ore recuperate giorno per giorno; il saldo si aggiorna da solo.',
        '<b>Congedi</b>: i congedi non pagati con date, motivo e chi li ha autorizzati; riducono vacanze e ore dovute.',
        '<b>Timbrature</b>: le ore vere della timbratrice, inserite a mano o importate dal file; quando ci sono, il saldo usa quelle.',
        '<b>Statistiche</b>: notti, domeniche e fine settimana per persona, per vedere se il lavoro è diviso in modo giusto.',
        '<b>Organico</b>: quante persone servono per coprire il fabbisogno con le regole del settore, mese per mese.',
        "<b>Affiancamenti</b>: chi impara, chi insegna, in quali turni; alla fine si segna svolto e la competenza viene certificata (la pagina Formazione e competenze è un'altra cosa: lì si tengono livelli e specialità).",
        '<b>Benessere</b>: quanto è sostenibile il carico di ognuno (notti, fine settimana, domeniche libere, giorni di fila).',
        "<b>Storico</b>: ogni modifica al piano, con chi l'ha fatta e quando; si può tornare a una versione precedente del mese.",
        '<b>Cambi turno</b>: le richieste di cambio fra colleghi, controllate con le regole, con il foglio da firmare.',
        '<b>Formulari</b>: i moduli legati al piano da stampare o da far firmare, divisi in cartelle.',
        '<b>Vacanze</b>, <b>Congedi</b> e <b>Festivi</b> stanno nel gruppo Assenze: Festivi tiene i festivi cantonali, i recuperi CGF e gli orari di chiusura (CH5, CH7). <b>Turni</b>, <b>Regole</b>, <b>Impostazioni</b> e <b>Guida</b> stanno nel gruppo Configurazione: orari dei turni e corsi, regole e regole di gruppo, funzioni, turni per funzione e preferenze delle persone, questa guida. In Regole la prima card, <b>Chi può fare cosa</b>, dice per ogni persona e ogni turno se il programma glielo può dare e perché. Cosa va impostato in ogni settore: capitolo «Cosa si imposta per settore».',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: calendario',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni riga è un collaboratore, ogni colonna un giorno. Si seleziona e si scrive come in Excel (vedi il capitolo «Dettagli utili in tutto il programma», voce Tabelle come Excel): un clic seleziona la cella, la sigla si scrive con doppio clic, Invio, F2 o direttamente sulla cella. Una sigla che non esiste viene rifiutata con un <b>avviso rosso</b> che dice quale sigla hai scritto, in quale settore non esiste e, se c\'è, la sigla più simile ("Forse intendevi C0?"); la cella lampeggia in rosso e torna com\'era.',
        '<b>Più celle insieme, come in Excel</b>: nel calendario si selezionano le celle trascinando o con Maiusc+clic (o Maiusc+frecce), si scrive la sigla (es. M) e Invio: va su tutte, con una sola conferma. Ogni cella segue le regole della cella singola (sotto la M resta la nota "Ex" della sigla, le regole non rispettate restano nel commento e si elencano alla fine); la malattia si registra nel Rapporto e nel Diario una volta per persona e periodo. Annulla toglie tutto il blocco. Il Diario non si annulla da qui: la malattia si toglie dal Diario.',
        '<b>Incolla (Ctrl+V / Cmd+V)</b> nel calendario e nel fabbisogno: con più celle selezionate un solo valore copiato (una sigla o un numero, anche da Excel) va su tutte; un blocco copiato si incolla a partire dalla prima cella selezionata. Ctrl+C copia la selezione. Restano anche Copia e Incolla nel tasto destro.',
        '<b>Incolla nel Piano</b>: come la cella scritta a mano: una M va nel Rapporto e nel Diario, una M tolta si toglie dal Diario, un CGF caduto in malattia viene rimesso, i festivi persi ricalcolano i CGF; alla fine le regole da controllare (riposo, consecutivi, ore) sono elencate e bordate di rosso.',
        '<b>Lucchetto</b>: con il tasto destro, <b>Blocca questa cella (con motivo)</b> scrive il motivo (visita medica, corso, appuntamento) e mette un <b>lucchetto rosso</b> nella cella. Chi prova a cambiarla legge il motivo; scambi turno, cerca cambio e copertura malattia la saltano. <b>Sblocca</b> compare solo sulle celle bloccate così: le celle "protette" dall\'importazione (piano consolidato, vacanze) non hanno lucchetto e si sovrascrivono con una conferma.',
        '<b>Tasto destro</b> o pressione lunga su una cella: modifica, commento, cambio turno con un collega, cambio per esigenze operative, rimozione, stampa.',
        "Si seleziona come in Excel: trascinando col mouse, oppure cliccando l'intestazione di un giorno per l'intera colonna. Sulla selezione funzionano <b>Canc</b> (con conferma), <b>Ctrl+C</b> e i colori.",
        'La barra in basso a destra mostra <b>somma, media, minimo e massimo</b> delle celle selezionate. Vale anche per le colonne delle ore, dove con Ctrl+click prendi celle sparse.',
        "<b>Annulla e Ripristina</b>: la barra in basso (o Ctrl+Z e Ctrl+Y fuori dai campi) annulla l'ultima cosa fatta in tutto il programma, anche nel calendario, fino a 15 passaggi per mese e settore (30 azioni nel resto del programma); premendo più volte si torna indietro di più passi. Vale finché la pagina resta aperta. Nel Piano Annulla rimette solo le celle dell'ultima operazione fatta da questo PC nel mese e settore aperti, con tutto (orari personalizzati, colori, motivo del blocco): vale anche per cambi turno, coperture e import. Se nel frattempo un collega ha cambiato una di quelle celle, te la mostra e scegli se riportarla indietro o lasciare la sua modifica; annullando una copertura malattia sparisce anche dal Rapporto; annullando uno scambio va nel Cestino anche il foglio del cambio turno; i giorni chiusi non si toccano e vengono elencati. Il bottone rosso <b>Annulla tutto</b> riporta il mese a com'era a inizio sessione.",
        'Segni nelle celle: triangolo = commento, <b>M</b> = malattia dal Diario. La malattia registrata nel Diario prevale su qualsiasi sigla del giorno: turno, V, CGF, JG, C diventano M protetta, anche nei giorni senza turno, con la sigla coperta scritta nella nota ("Ex V - operatore", "Ex C0 - operatore"); Prepara il mese fa lo stesso per le malattie già registrate. Quante ore vale la M è spiegato nel capitolo «Piano: malattia (cosa fare e come conta)». Il giorno di vacanza torna disponibile (colonna "Restituite per malattia" nella scheda Vacanze), il CGF resta a credito, il turno perso conta come malattia. Se la malattia viene tolta dal Diario, la sigla coperta torna al suo posto e una M senza nota sparisce. Le vecchie celle <b>MC</b> e <b>MCG</b> (malattia sopra C o CGF) restano leggibili.',
        '<b>Note delle celle</b>: oltre alla nota della malattia, chi copre un collega in malattia ha "Ex C - cambio per esigenze operative - operatore", come i cambi per esigenze; gli scambi tra colleghi "Ex C0 - cambio con Rossi - operatore".',
        "<b>JG con più fasce</b>: scrivendo JG (o con doppio clic su un JG) si possono mettere fino a tre fasce nello stesso giorno, per esempio 10:00-12:00 e 19:00-03:00. Le ore e il notturno sono la somma delle fasce (l'intervallo non conta); il riposo minimo si conta dalla fine dell'ultima fascia; nelle pause vale la fascia più lunga; nel briefing il JG resta su una riga. All'import la nota \"dalle 10 alle 12 e dalle 19 alle 3\" diventa due fasce.",
        "Colonne finali: <b>OL</b> (ore effettivamente lavorate: dall'entrata all'uscita, senza il supplemento del 10% notturno e senza malattie, vacanze, CGF, permessi, maternità, matrimonio, militare, nascita, protezione civile, trasloco e assistenza familiare), <b>D</b> e <b>N</b> (turni diurni e notturni), <b>OD</b> (ore dovute), <b>OP</b> (ore pianificate: turni più le assenze retribuite come le vacanze, e la cifra che fa il saldo), <b>SM</b> (saldo del mese: OP meno OD), <b>YTD</b> (saldo dell'anno, uguale alla scheda Saldo: comprende il riporto, e i mesi già dentro il riporto non si contano due volte). Si aggiornano da sole a ogni modifica. Le <b>assenze retribuite</b> (vacanza, malattia, infortunio, CGF, permesso, maternità, matrimonio, militare, nascita, protezione civile, trasloco, assistenza familiare, funerale) valgono in ore <b>secondo la percentuale d'impiego</b>: una giornata di vacanza vale 5.857 ore al 100%, 4.686 all'80% e 2.929 al 50%. Le ore di presenza effettiva (corsi, JG, ufficio, uscita per servizio, formazione) restano invece fisse per tutti. Per gli <b>ausiliari (jolly)</b> le vacanze valgono <b>zero ore</b>: la loro indennità di vacanza è già compresa e pagata nel salario dei giorni lavorati (RAP Allegato 1), quindi contarle anche in ore le farebbe risultare due volte. L'elenco dei codici trattati così si regola nella scheda Regole (jolly_codici_gia_pagati). La spunta si regola voce per voce nella scheda Codici.",
        "<b>Finestrelle sui numeri</b>: nel calendario passando sulle colonne OD (ore dovute: giorni, ore settimanali, percentuale), SM (saldo del mese: ore meno dovute), YTD (saldo dell'anno: riporto della scheda Saldo più i mesi dopo il riporto più questo mese), D e N; nelle Domeniche libere (Benessere) ogni domenica del mese e come conta; nel Benessere il dettaglio dell'indice; in Crediti vacanze e CGF con le date.",
        '<b>Colonna di oggi</b>: nel calendario il giorno di oggi ha il bordo oro, che scende anche nelle tabelle sotto il calendario (fabbisogno e conteggi).',
        '<b>Collaboratore in evidenza</b>: selezionando una cella del calendario (turno) o delle colonne delle ore, il nome del collaboratore della riga si colora di verde con una barra arancione.',
        "<b>Il responsabile sempre in cima</b>: in tutte le liste del piano (calendario, crediti, vacanze, saldo, domeniche, recupero ore) e in Formazione il responsabile di settore (funzione RESP) è sempre il primo, anche se le righe sono state riordinate trascinandole. Dopo di lui vale l'ordine trascinato a mano, poi SUP, BO, gli altri e i jolly in fondo.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: avvisi del mese',
      vis: () => _guidaVis('piano'),
      righe: [
        "<b>Avvisi del mese</b> (la riga sopra la griglia del Calendario): in un colpo d'occhio quante cose ci sono <b>da risolvere</b> (in rosso) e <b>da controllare</b> (in arancio), più le segnalazioni del giorno (Controlla le regole, confine fra due mesi, generazione automatica, compleanni). <b>Mostra</b> apre il dettaglio, <b>Nascondi</b> lo chiude; <b>Apri la scheda Avvisi</b> porta all'elenco completo. Esempio: «3 da risolvere, 12 da controllare».",
        "<b>Scheda Avvisi</b> (Piano › Avvisi, gruppo Giornata): sette sotto-schede, ognuna con il suo numero: <b>Ore settimanali</b>, <b>Riposo settimanale</b>, <b>Regole del mese</b>, <b>Chiusura anno</b> (saldo ore fuori banda, CGF da dare o in più, domeniche libere sotto il diritto), <b>Posti scoperti</b> (prossimi 7 giorni), <b>Malattie lunghe</b> (in corso da 10 giorni o più) e <b>Vacanze non nel piano</b>, con una ricerca per nome o testo. Aggiorna ricalcola le parti dell'anno. Il saldo delle domeniche per persona e mese resta in Piano › Benessere.",
        "<b>Il numero rosso</b> (sulla scheda Avvisi, sulla voce Piano del menu e nella riga Avvisi del mese) conta solo i problemi da risolvere: settimane oltre il limite di ore, <b>riposo attorno alla domenica</b> mancante, <b>regole di legge</b> non rispettate nel mese (riposi, giorni di fila), chiusura dell'anno in rosso, posti scoperti e malattie oltre il 14. giorno. Le altre regole del mese (ore del mese, preferenze, formazione), la chiusura dell'anno in arancio e le vacanze non nel piano sono «da controllare». Passando il mouse sul numero si legge la spiegazione.",
        '<b>Dalle liste al calendario</b> (Apri nel calendario): in Avvisi, Controlla le regole, Cambi turno, Storico del Piano e Registro attività un clic su una riga con un collaboratore e un giorno apre il calendario su quel mese e fa lampeggiare la cella del collaboratore. Nella ricerca in alto, sotto il nome di un collaboratore, "Apri nel Piano" porta alla sua cella di oggi.',
        '<b>Vacanze non nel piano</b> (Piano > Avvisi): le settimane confermate nel file vacanze i cui giorni nel piano non hanno la V (le malattie non contano). Per ogni riga: Apri nel calendario, Metti le V (i giorni chiusi chiedono un solo motivo per tutta la settimana; se una cella è protetta o bloccata il programma chiede prima di scrivere la V: Conferma la sostituisce, Annulla la lascia e mette la V negli altri giorni) oppure Il piano è giusto (la vacanza non è stata fatta: la scelta resta registrata con nome, data e nota, e la riga sparisce).',
        'Vale per ogni settore: ognuno vede gli avvisi del settore aperto in alto. Esempio Tavoli: una settimana con 47 ore compare in Ore settimanali; un sabato che finisce dopo le 23 fa perdere la domenica libera e compare in Riposo settimanale o in Regole del mese.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: briefing e pause',
      vis: () => _guidaVis('piano'),
      righe: [
        'La data parte da <b>domani</b>. <b>Compila dal piano</b> riempie nomi e turni del giorno; ogni cella si modifica, ogni riga ha il più per inserire sotto e la crocetta per eliminare; le righe si riordinano trascinandole.',
        '<b>Ordine delle righe</b>: negli <b>Slots</b> e al <b>Valet</b> il foglio raggruppa i turni per lettera della sigla (per esempio negli Slots cassa C, sala S, reception R, poi L1 e 9, poi Z) e dentro il gruppo per orario; negli altri settori, Tavoli compresi, le righe vanno solo per orario di inizio.',
        'I <b>numeri di cassa</b> si assegnano da soli con la regola "chi chiude riapre": le casse che finiscono più tardi aprono il giorno dopo di presto. Restano modificabili a mano.',
        "<b>Coppie dei numeri cassa</b> (Slots, amministratore: Piano › Briefing, riquadro Regole pause, voce <b>Numeri cassa (CD)</b>): ogni coppia ha i due numeri di cassa, il turno che apre e quello che chiude, per esempio CD 2,7 apre C0 e chiude C5; CD 3,4 apre C23 e chiude C20; CD 8,9 apre C4 e chiude C15. Chi ha chiuso ieri riapre oggi; i C8 del venerdì e del sabato riprendono in ordine la cassa del presto di ogni coppia. Si salva con <b>Salva numeri cassa</b>. Nel briefing tutto resta modificabile; se i numeri di ieri sono cambiati compare l'avviso e il pulsante <b>Aggiorna numeri cassa</b>, che riassegna solo la colonna CD.",
        'Le colonne <b>E</b> e <b>U</b> restano vuote apposta: si spuntano a penna sul foglio stampato.',
        "<b>Colonne del briefing</b> (card in fondo alla scheda Briefing, per chi compila il briefing): per ogni settore si sceglie quali colonne ha il foglio, in che ordine (con le frecce) e con che intestazione; vale a video e nella stampa. Le colonne speciali restano con la loro funzione: E e U a penna, numeri cassa (CD) con la rotazione, colori del turno; si possono solo mostrare, nascondere, rinominare e spostare. Collaboratore e turno ci sono sempre. <b>+ Aggiungi colonna libera</b> crea una casella vuota (per esempio Note o Postazione) da compilare a mano; <b>Rimetti le colonne predefinite</b> torna a quelle di sempre. Una colonna nascosta non cancella quello che c'era scritto. Ogni modifica va nel Registro attività.",
        "<b>Copiare per un'email</b>: seleziona trascinando (anche le intestazioni, es. HOST), poi tasto destro: <b>Copia</b> incolla una tabella con colori e bordi, <b>Copia come immagine</b> incolla un'immagine (se il browser non lo permette, la scarica come file). Nello stesso menu Taglia, Incolla e Cancella contenuto.",
        'Per colorare o evidenziare: <b>clicca la cella</b> per marcarla, con Ctrl aggiungi le altre, poi <b>Colora</b> applica il colore della barretta, la freccia ne sceglie un altro, <b>G</b> mette il grassetto e <b>C</b> il corsivo.',
        '<b>Genera pause</b> crea la distribuzione delle pause; anche queste si modificano cella per cella. Le stampe sono in PDF A4, sempre su un foglio solo.',
        '<b>Stampa briefing</b> (Slots, Valet e altri settori): sempre in verticale e su un foglio solo; le colonne si allargano in automatico quanto il testo più lungo e il carattere è il più grande che ci sta. Un nome lunghissimo va a capo invece di rimpicciolire tutto; negli Slots il riquadro ORARI va sotto la tabella quando serve spazio.',
        'Slots, da <b>lunedì a giovedì</b>, quando S3 fa anche R24: S3 va in pausa <b>22.15-22.30</b> e fa R24 <b>22.30-23.00</b>; chi gli dà il cambio (S7C, S7 o S5) copre S3 alle 22.15 e poi resta in sala fino alle 23.45. La domenica lo schema resta R24 22.15-22.45 e pausa 22.45.',
        '<b>Annulla</b> e <b>Ripristina</b> nel briefing (la barra generale in basso, oppure Ctrl+Z e Ctrl+Y): valgono per tutto il giorno aperto, righe e pause insieme: nomi, turni, numeri cassa, colori e formato, righe aggiunte o tolte, pause generate, spostate, scritte o eliminate.',
        "<b>Pausa e cambio si spostano insieme</b> (Slots): quando la pausa di un collega e il cambio che gli dà un altro hanno lo stesso orario (per esempio S3 di Sassi e la riga S3 di Nicole), spostando (trascinando) la PAUSA si sposta da solo anche il cambio: dove c'era il cambio torna SALA e le sale vicine si uniscono. Vale anche al contrario: spostando il cambio si sposta la pausa, se basta uno scambio con la riga vicina. Compare un avviso con il pulsante Annulla. Le righe che sono solo rotazioni (per esempio C8 in cassa il venerdì e il sabato) non vengono toccate.",
        "Se pausa e cambio non coincidono più (spostati o scritti a mano) compare un <b>avviso rosso</b> che dice chi è scoperto e le righe interessate sono bordate di rosso. L'avviso non blocca nulla: si corregge con le frecce, scrivendo nelle celle o con Annulla.",
        "<b>Regola delle ore sempre controllata</b> (Slots): da 6 ore 15+15, da 7 ore 30+15, da 8 ore in su 30+15+15, per ogni persona del briefing, anche per chi non ha una colonna (le sue pause sono le righe di chi gli dà il cambio). Il riquadro <b>Da controllare</b> elenca cosa non torna: pause mancanti o in più, meno di un'ora fra due pause, pause fuori dal turno, righe che non coprono la pausa di nessuno, e i momenti in cui <b>in sala non resta nessuno</b> (per esempio quando l'unico in sala sta dando i cambi in cassa). Sono avvisi: non bloccano nulla.",
        "<b>Proposte del programma</b> (Slots): quando lo schema non dà a qualcuno tutte le pause della regola (per esempio S31, il secondo C0 o il secondo quarto d'ora serale di S5 il venerdì), il programma le propone come farebbe un responsabile. In sala e al rec la persona va in pausa da solo se nel reparto resta un collega (riceve una sua colonnina con tutte le pause); in cassa serve un cambio da chi è formato in cassa ed è libero; le pause stanno ad almeno un'ora dalle altre (meglio un'ora e mezza), non nella prima né nell'ultima mezz'ora del turno. Quando tutto rispetta le regole queste sistemazioni si applicano da sole e restano elencate nel riquadro <b>Sistemato dal programma</b> (si apre con un clic). Solo nei casi eccezionali il foglio chiede conferma: righe bordate di blu e riquadro <b>Da confermare</b> con il motivo (una postazione resta senza cambio, restano avvisi, molte righe dello schema abituale spostate); <b>Tengo le proposte</b> conferma. Se per una cassa nessuno può dare il cambio, la proposta è scritta in rosso.",
        "<b>Sistemazione automatica</b>: nelle giornate normali lo schema resta com'è. Solo se c'è un problema vero (sala vuota, avvisi, pausa nella prima o nell'ultima mezz'ora del turno) il programma sposta cambi e pause con le stesse mosse che faresti trascinando le righe (quarto d'ora dentro la sala o scambio con la riga vicina, con pausa e cambio collegati insieme); una mossa che lascia la sala vuota o crea un avviso non si fa mai. Ogni spostamento è elencato con il motivo. Le attese lunghe senza pausa (di base oltre 3 ore) non si spostano da sole: compaiono in <b>Da tenere d'occhio</b> e decidi tu trascinando le righe. Si accende, si spegne e si sceglie il massimo in Regole pause > Sistemazione automatica.",
        "<b>Jolly Giornata (JG)</b>: quando premi Genera pause il programma chiede per ogni JG dove lavora oggi (le scelte del settore: negli Slots sala, rec, cassa, accoglienza, sup) oppure se è a un corso, con l'orario di inizio e fine. In sala, al rec o in cassa conta per quel reparto (per esempio la sala non risulta vuota se c'è un JG in sala) e riceve le pause della regola delle ore; in accoglienza si organizza da solo come S31; sup e corso non contano. Se il commento del Piano dice CORSO propone corso, e un orario scritto nel commento (es. 15:30-19_30, dalle 18.00 alle 03.00) lo propone nelle caselle. L'orario si salva nella cella del Piano e la scelta nel foglio pause: la volta dopo non lo richiede.",
        "<b>JG del mattino nelle pause</b>: se un JG comincia prima delle 11 (es. 10.00-20.00) la giornata delle pause parte da lì; la mezz'ora va a pranzo (12.00-13.30) e nessuna attesa supera le 3 ore.",
        '<b>Sala mai vuota</b> (Slots): la sigla di ogni riga dice dove si trova chi la fa (S sala, C cassa, R rec: S1 con S22 e in sala al posto di S22). I responsabili (Z) non contano. Se in un momento nessuno resta in sala, per esempio S3 in cassa a dare i cambi mentre S7 è in pausa, il programma prova gli spostamenti che si farebbero trascinando le righe e applica quello che risolve senza creare altri problemi ("pausa spostata da 21.30 a 20.00, così la sala non resta vuota"). Se non si può (per esempio il pomeriggio c\'è un solo turno di sala e deve dare i cambi in cassa), resta l\'avviso.',
        "<b>Bigliettino del mattino</b> (Slots): C4 (cassa tavoli, dalle 11.40) dà la mezz'ora ai due R22 fra le 12.00 e le 13.00 e a S22 alle 13.00, poi va in pausa 13.30-14.00. Il bigliettino con i nomi del giorno e sotto le pause, con <b>Stampa bigliettino</b> (foglio piccolo da tagliare); queste pause contano nella regola delle ore.",
        "Nel foglio pause la <b>x sull'intestazione</b> di una colonna (dove c'è il nome) elimina <b>tutta la colonna</b> con le sue righe, dopo una conferma; si rimette con Annulla. Il + sull'intestazione aggiunge una riga sotto l'orario del turno. <b>Elimina pause</b>, in fondo, cancella invece tutto il foglio del giorno.",
        '<b>Formazione</b>: chi nel piano ha nel commento della cella "formazione" (o "affiancamento") e ha un collega sullo stesso turno va con lui: stessa postazione e stesse pause, e per le pause conta come una persona sola (R22, S22, casse, qualsiasi turno). Se la scritta è su due persone dello stesso turno (formatore e allievo) sono loro la coppia; se è su una sola, va con un collega del suo turno. Nel foglio e nella stampa c\'è la riga <b>In formazione</b> con chi va con chi. Chi ha "formazione" ma è solo sul suo turno è una persona normale.',
        '<b>Accoglienza</b> (i turni del gruppo ACCOGLIENZA nella tabella Turni, es. S31): si organizzano da soli. Il programma suggerisce le loro pause in una colonna, senza avvisi e senza proposte, e al loro posto non contano come presenza in sala (quando coprono qualcuno in sala si). ',
        "<b>Facoltative</b> (Slots): sotto il foglio, nella sezione Facoltative, ci sono le colonne dell'accoglienza, quelle di chi va in pausa da solo avendo un collega sullo stesso turno (es. il secondo S5) e il bigliettino di C4. Chi non dà cambi (es. S5, S7C, R22 che vanno in pausa da soli) ha qui la sua colonnina, non un bigliettino, e le sue pause restano nei controlli. Si modificano come le altre; non entrano nel foglio stampato, a meno di spuntare <b>nel foglio stampato</b>, e ognuna ha <b>Stampa bigliettino</b> per stamparla a parte su un foglietto. Annulla torna indietro di un passo alla volta: se sposti una riga e poi la rimetti, servono due Annulla per tornare all'inizio.",
        "<b>Frecce vicino a una riga SALA</b> (Slots) (o REC, CASSA): un cambio o una pausa non salta oltre tutta la riga libera ma si sposta di un quarto d'ora alla volta, fermandosi solo dove la sala resta coperta da un altro collega (es. S7 01.45 in su con S3 in cassa alle 01.30 e in sala fino alle 01.15: va subito a 01.00-01.15); la sala si divide e si riunisce da sola. Vale per tutti i cambi e le pause; se il cambio è collegato alla pausa di chi ha una colonna (es. S3 dato da Nicole a Sassi) anche la pausa si sposta di un quarto d'ora, e se non può seguire si fa lo scambio intero.",
        "<b>Pause di venerdì e sabato con tre cassieri o più</b> (Slots): quando si generano le pause il programma chiede chi dà le pause delle casse. <b>Normale</b>: due cassieri, la cassa al primo (CD 3/4) dà le pause a tutte le casse per tutta la notte e la cassa allo 0 (CD 2/7) ne dà alcune dopo l'1.45, con la sua pausa alle 2.15. <b>Alternativa</b>: un cassiere solo, la cassa allo 0, dà le pause a tutte le casse (sue pause alle 23.30, 1.30 e 2.45); la colonna della cassa al primo resta libera. L'ultima scelta viene proposta la volta dopo.",
        '<b>Cassa il venerdì e il sabato</b> (Slots): con due che danno le pause in cassa (es. CD 03 dalle 21.00 e CD 07 dalle 01.45) le pause che CD 07 riceve prima della sua colonna stanno nelle righe C8 della colonna di CD 03, e il controllo le conta come sue (non segna più rosso chi le ha). Chi dà le pause in cassa resta in cassa: il venerdì e il sabato il programma non gli fa coprire pause di sala (es. un S5).',
        "<b>S5</b> (Slots): nel foglio le pause del secondo S5 le dà chi è libero in sala (es. S7 alle 24.45, scritto S5 con il nome); se nessuno è libero va in pausa da solo. Con due o più S5, nelle Facoltative c'è anche la colonna <b>S5 ALT.</b> (S5 tra loro) per ognuno: si danno le pause fra loro in modo equo, la mezz'ora una dopo l'altra (es. 19.30-20.00 e 20.00-20.30) e poi i quarti distribuiti fino a fine turno, con l'ordine che si alterna; chi rientra copre il collega. È un'alternativa al foglio: i controlli la accettano se è giusta e non la sommano alle pause del foglio.",
        "Slots, venerdì e sabato con due S7, S1 e S5: l'S7 che dà i cambi va in pausa alle 20.30 mentre l'S1 è in sala, alle 21.00 dà la mezz'ora all'altro S7 e alle 21.30 il quarto d'ora all'S5, così l'S5 non va in pausa troppo tardi.",
        'Nel briefing le colonne si allargano da sole quanto il testo più lungo (anche mentre scrivi un cognome lungo) e le sigle dei turni stanno al centro della casella, a schermo e in stampa.',
        'La stessa persona non fa mai due colonne nello stesso orario: se chi dà i cambi di sala e rec è anche il primo candidato per i cambi di cassa, questi passano a un altro collega. La stampa delle pause resta sempre su un foglio solo: con molte colonnine si usa una quarta colonna e il testo si rimpicciolisce quanto serve.',
        '<b>Regole pause</b> (admin, sotto le pause): ogni settore ha il suo elenco di regole in parole semplici, con Modifica ed Elimina, e si creano nuove regole con <b>Nuova regola</b>: pause per durata del turno (regola di partenza: 6 ore = 15+15, 7 ore = 30+15, da 8 ore in su = 30+15+15), pause di un turno preciso (S3: 15+15, oppure 0 = nessuna), distanza minima fra pause, fascia senza pause (es. venerdì e sabato dalle 23.00 alle 01.00), persone in pausa insieme, nota in fondo al foglio. Le pause si scrivono come somma di minuti. Le regole per durata e per turno possono valere solo in certi giorni (Lun-Gio, Ven-Sab, Dom): così le pause cambiano fra settimana, fine settimana e domenica, come negli schemi di sempre.',
        'Ogni regola viene controllata quando la salvi: una sigla che nel settore non esiste, un orario scritto male o due regole che si accavallano vengono segnalati subito. La tabella "turni, orari e pause che risultano" mostra per ogni turno le pause e da quale regola vengono. Negli Slots gli schemi di copertura restano quelli di sempre: le regole decidono quante pause e quanto lunghe, e le pause fuori regola vengono elencate in giallo sotto il foglio. Negli altri settori guidano direttamente la generazione. <b>Ripristina regole di partenza</b> riporta il settore alle regole iniziali.',
        "<b>Voglio cambiare le pause del mio settore</b>: Piano › Briefing, riquadro <b>Regole pause · settore</b> sotto le pause (amministratore). Esempio Valet: per avere 30+15 anche nei turni da 6 ore, Nuova regola › Pause per durata del turno › da 6 a 7 ore › 30+15 › Salva regola. Esempio Tavoli: per nessuna pausa il sabato dalle 22.00 alle 24.00, Nuova regola › Fascia senza pause › Sab. La tabella «Turni, orari e pause che risultano» mostra subito l'effetto, turno per turno.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: malattia (cosa fare e come conta)',
      vis: () => _guidaVis('piano'),
      righe: [
        "<b>Cosa fare quando un collaboratore si ammala</b>, in quest'ordine. 1. Registrala <b>una volta sola</b>, dove ti è più comodo: nel <b>Diario</b> (tipo Malattia, con Dal e Al), scrivendo <b>M</b> nel calendario del Piano, oppure nelle assenze del <b>Rapporto</b>. Gli altri due posti si aggiornano da soli. 2. Nel Piano, menu <b>Sistema › Sostituisci chi è in malattia</b>: il programma propone per ogni giorno chi può coprire, con le regole valide per tutti e due; si spunta cosa applicare. 3. Se la malattia cade su un CGF, il programma propone subito un giorno sostitutivo. 4. Se gli incentivi sono accesi, dopo la registrazione nel Diario si apre la finestra Copertura turno per dare i punti a chi copre.",
        'Esempio: Rossi (Slots) è in malattia dal 3 al 5; il 3 aveva S7. Nel Diario si registra Malattia dal 3 al 5: nel piano le celle diventano M con la nota «Ex S7 - operatore» e Rossi entra nelle assenze del Rapporto. Con Sostituisci chi è in malattia un collega libero e formato prende S7; la sua cella ha la nota «Ex C - cambio per esigenze operative - operatore». Ai Tavoli e al Valet è uguale, con le sigle del settore.',
        "<b>Ore della malattia</b>: la malattia continua (giorni uno dopo l'altro, anche con prolungamenti attaccati; un giorno senza malattia in mezzo, anche un riposo, la interrompe) vale: dal 1. al 14. giorno le ore del turno che la persona aveva quel giorno, da orologio e MAI con il 10% notturno (es. R23 8.17, non 8.67); un riposo C vale 0 (MC) ma conta come giorno; una V vale le ore della V e la vacanza torna da recuperare; dal 15. giorno 41 ore settimanali / 7 = 5.857 ore per ogni giorno di calendario, che lavorasse o no. Le M importate dall'Excel senza la sigla coperta valgono il codice M nei primi 14 giorni.",
        '<b>Togliere una malattia</b>: si cancella la registrazione nel Diario (o si scrive un turno sopra la M nel piano: il programma propone di togliere quei giorni anche dal Diario). Nel piano torna la sigla di prima e la persona sparisce dal Rapporto. Una sostituzione si annulla con Annulla del Piano: sparisce anche dal Rapporto.',
        '<b>Malattia e vacanze</b>: se la malattia cade in una vacanza la V diventa M e il giorno torna disponibile; Applica al piano propone di spostare la vacanza subito dopo (capitolo «Piano: vacanze»). Le malattie in corso da 10 giorni o più sono in Piano › Avvisi › Malattie lunghe.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: cambi turno, coperture e restituzioni',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Come si fa un cambio turno</b>: tasto destro sulla cella del collaboratore che chiede il cambio, poi una delle voci qui sotto. Il programma propone solo i colleghi che possono farlo senza rompere una regola, mostra prima e dopo e, alla conferma, scrive le celle, prepara il foglio da firmare e lo archivia nella scheda Cambi turno. Esempio Valet: Bianchi ha X3 venerdì e chiede di lavorare sabato; con <b>Cambia turno con...</b> si sceglie un collega che sabato ha X1 e, se serve, la restituzione.',
        'Dal tasto destro sulla cella: <b>Cambia turno con...</b> (scambio con un collega che quel giorno ha un turno nello stesso settore, con restituzione facoltativa), <b>Cerca cambio · giorno libero</b> (un collega libero prende il turno, con eventuale restituzione), <b>Cambio per esigenze</b> (la direzione cambia il turno con motivo), e dalla barra, menu Sistema, <b>Sostituisci chi è in malattia</b> (sostituti giorno per giorno, anche con una mossa a catena sul giorno prima).',
        "Tutti i flussi controllano le regole per <b>entrambe</b> le persone (riposo 11 ore, giorni consecutivi, idoneità, accompagnamento), rispettano i giorni chiusi, saltano le celle bloccate con motivo (visita medica, corso) e il congedo del compleanno, che contano come giorni riservati, e non toccano mai le celle di un altro settore: chi lavora in due settori e ha già una cella nell'altro piano non risulta libero.",
        "<b>Proposte con le stesse regole del controllo</b>: cerca cambio, copertura malattia e ND, Sistema le ore e l'avviso quando si scrive a mano usano le stesse regole di Controlla le regole (riposo con gli orari veri e i JG, giorni di fila nei due sensi, riposo singolo dopo 4 giorni, ore della settimana, riposo attorno alla domenica, giorni a settimana, chi fa cosa per giorno, ND e malattie del Diario). Un sostituto si propone solo se non crea nessuna violazione nuova: in qualche giorno può non esserci nessuno, è voluto. Non si usano mai il compleanno, le celle con lucchetto e le C messe attorno alle vacanze.",
        "La <b>restituzione</b> può cadere anche nel mese dopo: le celle si leggono dal database e vengono scritte davvero. Chi quel giorno non aveva nulla riceve un congedo C. Ogni cambio produce il formulario da firmare e finisce nel Registro; l'autorizzazione oltre il limite mensile viene registrata solo a scambio fatto.",
        '<b>ND solo per i jolly</b>: i fissi non danno disponibilità, quindi a un fisso l\'ND non si mette (il programma lo dice). Scrivendo ND a un jolly nel calendario si sceglie: <b>non disponibilità data</b> (come quelle chieste entro il 3 dal Diario) oppure <b>chiamata ma non disponibile</b>: la cella ha il commento "Ex <turno di prima> - chiamata ma non disponibile - operatore" e il modulo ND lo riporta nelle osservazioni. In Sostituisci chi è in malattia, accanto a un jolly proposto, il pulsante <b>Chiamato, non disponibile</b> fa lo stesso e cerca un altro sostituto.',
        '<b>Non disponibilità dal Diario (solo jolly)</b>: i giorni scelti diventano ND nel piano. Se il piano del mese è già fatto e in quei giorni il jolly ha un turno, il programma lo dice e propone subito chi lo copre (Copertura già compilata: alla conferma ND al jolly e turno al sostituto); rispondendo Annulla i turni diventano ND con la nota "Ex S8 - ND dal Diario" e i posti restano da coprire. Annulla, Elimina o la modifica della registrazione rimettono i turni com\'erano e aggiornano il modulo ND.',
        '<b>Lista di non disponibilità (modulo 1187)</b>: quando a una persona si mette un <b>ND</b>, nel calendario del piano (in qualsiasi modo) o nel Diario con una registrazione Non disponibilità, il programma prepara da solo il modulo del mese, identico a quello di Human Resources: logo, nome, mese, giorni spuntati e osservazioni (la nota della cella o il testo della registrazione). Un modulo per persona e per mese, aggiornato se i giorni cambiano. Lo trovi nella <b>scheda del collaboratore</b> (Non disponibilità · Anteprima), da dove si stampa per la firma: resta lo storico, come per i cambi turno.',
        'Ogni cambio si può annullare con <b>Annulla</b> del Piano: vedi il capitolo «Piano: calendario».',
        "La scheda <b>Piano › Cambi turno</b> (gruppo Persone) elenca tutti i fogli del settore, dal più recente: data del cambio, tipo (scambio o esigenze operative), collaboratori e turni, restituzione, motivo, <b>chi l'ha fatto</b>, data di creazione e <b>Apri PDF</b>. La casella di ricerca cerca per collaboratore, motivo o autore; c'è il filtro per mese e il pulsante <b>Formulario vuoto</b> da compilare a mano.",
        "Nella <b>scheda del collaboratore</b> compaiono i suoi cambi turno (data e collega) con il pulsante <b>Anteprima</b>, che apre subito il foglio; l'elenco completo è nella scheda Cambi turno del Piano.",
        '<b>Chi viene proposto</b>: per chi non ha settori né competenze impostati (per esempio una persona nuova) Cerca cambio, Sostituisci chi è in malattia e ND, Sistema le ore e la copertura dal Diario propongono solo i gruppi di turni che ha già fatto, come la bozza: un HOST nuovo che ha fatto solo sala non viene proposto in cassa. Per allargare i suoi turni si impostano i settori o le competenze in Formazione.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: vacanze',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Le vacanze in quattro passi</b>: 1. a inizio anno, nella scheda Vacanze, <b>Importa vacanze</b> legge il file HR (Excel o PDF); 2. si controllano le settimane <b>Definitive</b> e <b>Provvisorie</b>; 3. ogni mese <b>Applica al piano</b> scrive le V nel calendario (Prepara il mese lo fa da solo); 4. Piano › Avvisi › Vacanze non nel piano mostra le settimane rimaste fuori. Serve il permesso Vacanze e CGF automatici per importare e applicare.',
        'Ogni settimana è <b>Definitiva</b> o <b>Provvisoria</b> (clic sul badge per cambiare, se hai il permesso). Definitiva = va nel piano con Applica al piano e conta fra le pianificate e nel saldo; provvisoria = resta in elenco in giallo, in attesa, senza toccare il piano né il saldo. Le settimane importate dal file HR sono definitive; quelle aggiunte a mano nascono definitive, togli la spunta se non è ancora sicura. Il cambio resta nel registro attività.',
        'Le vacanze si assegnano a <b>settimane intere</b> (da lunedì a domenica) per collaboratore e per anno.',
        '<b>Applica al piano</b> scrive le V protette (senza commento), i congedi C prima e dopo la vacanza e i giorni di lavoro obbligati (WD) attorno alla vacanza, come dicono le regole Vacanze.',
        '<b>C e turni attorno alle vacanze</b>: prima delle vacanze una C (fissi e jolly), dopo le vacanze C secondo la percentuale (100% una, 80% due, 60% tre, 40% quattro; jolly una). Prima delle C di partenza e dopo quelle del rientro ci deve essere un turno: i giorni WD sono giorni di lavoro obbligatori; la bozza li riempie per primi, prende il turno di chi non è obbligato se il fabbisogno è pieno, e accanto alle C da un turno presto anche oltre il fabbisogno. Le WD che restano senza turno diventano riposo, tranne quella attaccata alle C (segnalata in Controlla le regole). Controlla le regole segnala anche "prima delle C delle vacanze serve un turno" e "dopo le C del rientro serve un turno". Queste C dedicate alle vacanze non vengono mai usate per cambi e coperture, e scrivendoci sopra un turno a mano il programma avvisa che quel riposo verrebbe tolto.',
        '<b>Malattia e vacanze</b>: la malattia prevale. Se una persona è in malattia (registrata nel Diario o M nel piano) nei giorni di una vacanza, Applica al piano e Prepara il mese non scrivono V: il giorno diventa <b>M con la nota "Ex V"</b> (ore della vacanza, giorno restituito nei Crediti; togliendo la malattia torna la V). Nei giorni di malattia non si mettono nemmeno le C e i WD attorno alle vacanze: resta malattia tutto.',
        '<b>Spostare la vacanza dopo la malattia</b>: se una vacanza cade in una malattia, Applica al piano e Prepara il mese propongono di spostarla subito dopo (es. malattia fino al 21: C il 22, vacanza dal 23 con gli stessi giorni, poi le C del rientro). Con <b>Sposta la vacanza</b> la scheda Vacanze viene corretta (nota "Spostata per malattia") e le M perdono la nota "Ex V"; con No restano M e i giorni sono restituiti nei Crediti. La generazione automatica non chiede e non sposta.',
        'Le regole aziendali da rispettare: settimane a blocchi di sette giorni, nei settori con più di otto persone si pianifica in vacanza uno ogni otto o nove collaboratori, nei settori più piccoli mai più di due contemporaneamente. Questa regola il programma non la controlla: va verificata a mano guardando la tabella delle vacanze.',
        'Le vacanze si <b>importano dal file HR</b> sia in Excel sia in PDF: il programma riconosce i collaboratori dai nomi, anche con refusi o abbreviazioni, e mostra chi ha trovato prima di sostituire.',
        'Nel file, oltre alla <b>X</b> (vacanza), si può scrivere una <b>sigla del Piano</b> sulla settimana: per esempio <b>PC</b> (Protezione Civile) o <b>MT</b> (Matrimonio). Maiuscole o minuscole è uguale. Queste settimane compaiono nella scheda con la loro sigla, <b>non contano come vacanza</b> e con Applica al piano vanno nel calendario con la loro sigla e gli stessi C prima e dopo delle vacanze. Un simbolo che non è una sigla del Piano viene segnalato e non importato.',
        '<b>File vacanze: note e giorni precisi</b>: all\'import il programma legge anche i commenti delle celle del file. Le date scritte nel commento ("27-28 APRILE PC", "24-27.06 CONGEDO MATRIMONIO", "FINO AL 10/12") diventano dal / al della settimana: nel piano va solo quella parte (es. PC solo il 27 e 28). Le altre note (cambi, conferme) restano scritte sotto la settimana; i commenti su settimane senza X si elencano da controllare. Per correggere: scheda Vacanze, Modifica: dal / al sono il periodo vero (anche su più settimane: il programma mette da solo le settimane, sposta la riga o ne aggiunge una per settimana); senza date vale la settimana scritta. Poi riapplica le vacanze al mese.',
        "<b>Reimportare il file</b> non cancella tutto: il programma confronta il file con l'archivio e mostra, persona per persona, le settimane nuove, quelle tolte e quelle con la sigla cambiata; cambia solo quelle. Le settimane uguali restano come sono, anche se erano Provvisoria.",
        'Con <b>Scarica Excel</b> e <b>Scarica PDF</b> ottieni la scheda vacanze del settore nello stesso formato del file HR; il PDF si apre in anteprima prima di salvare.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: crediti',
      vis: () => _guidaVis('piano'),
      righe: [
        "La scheda <b>Crediti</b> mostra per ogni collaboratore del settore quello che gli resta o che deve recuperare: vacanze spettanti, pianificate, restituite per malattia e quante restano; CGF riportati, maturati, goduti e quanti restano (fino alla fine del mese aperto, mai i mesi futuri); saldo ore dell'anno (con il pulsante Calcola, come nella scheda Saldo); recupero ore del mese aperto; giorni di congedo non pagato. Clic sulla riga per il dettaglio, Stampa per il foglio A4.",
        '<b>Crediti: dettaglio al passaggio del mouse</b>: sui numeri sottolineati a puntini compare il dettaglio: vacanze pianificate (settimane con le date), vacanze che restano (il conto), spettanti (base e anzianità), CGF maturati (festivi lavorati) e CGF goduti (date, e quelli caduti in malattia).',
        'Sono gli stessi numeri delle schede Vacanze, Festivi, Saldo e Recupero ore, senza calcoli nuovi. Chi la vede si decide in Visibilità e permessi (Piano · Crediti). La stessa riga di riepilogo compare in fondo alla scheda del collaboratore.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: timbrature e saldo ore',
      vis: () => _guidaVis('piano'),
      righe: [
        "Le timbrature si inseriscono a mano o si importano dal file della timbratrice. Il collegamento automatico con la timbratrice (script per l'IT) non è ancora attivo.",
        'Nel confronto si clicca un collaboratore per vedere giorno per giorno entrata, uscita e ore effettive rispetto a quelle pianificate.',
        "Nel <b>Saldo</b> valgono le ore timbrate quando esistono, altrimenti quelle del piano. Il saldo da inizio anno si chiama YTD e comprende il riporto: è lo stesso numero nel calendario e nella scheda Saldo. Lo usa anche la bozza del piano: chi è in più riceve meno ore, chi è in meno ne riceve di più, finché non rientra. Sempre dentro la tolleranza del mese: il saldo si recupera un po' per mese. La sigla dice di quale settore è un turno: R22 o R23 scritti nel foglio del Valet sono turni della Reception Slots e coprono il posto agli Slots; nel calendario Slots si vedono normali, con la nota del foglio da cui vengono. Il corsivo dipende solo dalla sigla: un turno di un altro settore (es. X7 del Valet nel calendario Slots, R23 nel calendario Valet) si vede in corsivo, la persona è occupata ma non copre i posti qui. Se cambi la sigla, il corsivo segue la sigla nuova. Congedi, vacanze e malattie valgono per la persona e si vedono sempre normali. Ore e orari di ogni turno si leggono in tutti i settori. Chi ha il mese fatto solo di congedo C, senza turni né assenze né timbrature, non viene conteggiato: vuol dire che non è in servizio quel mese.",
        "Nella scheda Statistiche c'è il <b>Confronto anni</b>: due tendine per scegliere <b>due anni qualsiasi</b> (anche non consecutivi, es. 2026 contro 2023), per settore, con ore, collaboratori, jolly, malattie, weekend, vacanze e recuperi. La nota in alto dice quanti mesi ha in archivio ciascun anno.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: recupero ore (griglia giornaliera)',
      vis: () => _guidaVis('piano'),
      righe: [
        'La scheda <b>Recupero ore</b> è il foglio giornaliero: si aggiorna <b>ogni giorno</b>, come si faceva sul file Excel di slots e tavoli.',
        "Nella casella del giorno si scrive quanto il collaboratore ha lavorato in più o in meno rispetto al suo turno: <b>-1</b> un'ora in meno (casella rossa), <b>+3</b> tre ore in più (casella verde). Casella vuota vuol dire che ha fatto esattamente il turno previsto.",
        "Si può scrivere sia in decimali (<b>1.5</b>) sia come orologio (<b>1:30</b>): il programma capisce tutti e due, così nessuno sbaglia scrivendo 1.30 per intendere un'ora e mezza.",
        "A destra c'è il <b>totale del mese</b> per ogni collaboratore, e in alto il riepilogo del settore: ore in più, ore in meno e saldo complessivo.",
        "Tutto è collegato: quelle ore si sommano nella colonna <b>OP</b> del calendario, quindi entrano in <b>SM</b> (saldo del mese), nell'<b>YTD</b> (saldo da inizio anno), nella scheda <b>Saldo</b> e nelle <b>Statistiche</b> dell'anno. Chi scrive e quando resta nel registro.",
        'Non va confusa con la correzione del <b>saldo mensile</b> (doppio clic su OP o SM nel calendario): quella serve a scrivere il totale reale di un mese chiuso, questa è la registrazione di ogni giorno. Se ci sono tutte e due, il totale scritto a mano ha la precedenza.',
        "Selezione e colori funzionano <b>esattamente come nel calendario</b>: click sul <b>nome</b> marca la riga, click sull'<b>intestazione del giorno</b> marca la colonna, <b>Ctrl+click</b> su una casella la singola cella. Il bottone <b>Colora</b> applica l'ultimo colore usato (condiviso col calendario), la freccia apre la stessa palette con <b>Grassetto</b>, <b>Corsivo</b> e colore del <b>testo</b>. I colori restano salvati per mese e settore e li vedono tutti gli operatori. Unica differenza rispetto al calendario: qui si colora anche il <b>nome</b> del collaboratore, col colore della riga.",
        'Scorrendo la griglia, la <b>riga delle date</b> resta fissa in alto e la <b>colonna dei collaboratori</b> resta fissa a sinistra.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: giorni chiusi (il passato si corregge solo con motivo)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Passata la giornata di gioco, il piano di quel giorno diventa un <b>documento</b>: non si modifica più per distrazione. Nel calendario i giorni chiusi portano un piccolo lucchetto sotto il numero.',
        "C'è un margine di respiro: il giorno resta aperto <b>fino a mezzogiorno del giorno dopo</b>, così chi apre al mattino sistema le ultime cose della giornata appena finita senza sbloccare niente. L'ora si cambia nella regola blocco_ora_limite.",
        'Per correggere un giorno chiuso serve il permesso <b>Giorni chiusi</b> (si assegna per nome da Impostazioni · Visibilità e permessi). Chi lo ha clicca la cella, scrive il <b>motivo</b> (obbligatorio) e il giorno si apre per <b>dieci minuti</b>. Sblocco e motivo finiscono nel registro.',
        'Il blocco vale per ogni strada: modifica manuale, bozza, scambi e coperture su giorni passati. <b>Non</b> vale per il Recupero ore e per le timbrature, che per natura si compilano il giorno dopo, né per i commenti.',
        '<b>Giorni chiusi nelle azioni automatiche</b>: Applica vacanze, Assegna CGF, Sistema le ore e la bozza lavorano solo dal primo giorno aperto in poi. Nei giorni chiusi non cancellano e non scrivono niente; Applica vacanze elenca le differenze rimaste (previsto V, oggi vuoto) da correggere con lo sblocco.',
        "L'interruttore generale è la regola blocco_giorni_chiusi: FALSE lo spegne del tutto.",
        'Vale anche per il <b>saldo del mese</b>: passato il mese (col solito respiro fino a mezzogiorno del giorno dopo), correggere le ore reali di quel mese richiede lo stesso sblocco motivato. Il 1 ottobre a mezzogiorno settembre è chiuso; il mese in corso resta sempre modificabile.',
        'Le <b>celle protette</b> del piano (piano consolidato, vacanze, assenze confermate) si possono ancora modificare o cancellare, ma solo dopo una conferma che dice esattamente cosa si sta sostituendo o togliendo.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: congedi non pagati',
      vis: () => _guidaVis('piano'),
      righe: [
        'Regolamento aziendale 5.14: domanda scritta tre mesi prima, concessione della Direzione. Si registrano nella scheda <b>Congedi</b> del Piano oppure dalla scheda del collaboratore (Registra congedo non pagato), con date dal / al, motivo e chi ha autorizzato. La scheda Congedi li mostra tutti: chi, quando, quanti giorni per anno e gli effetti (vacanze prima e dopo, anzianità spostata). Il programma rifiuta date invertite, periodi sovrapposti e congedi senza motivo.',
        'Nel piano i giorni diventano <b>CNP</b> (zero ore, cella protetta) e <b>non contano fra le ore dovute</b> del mese: saldo, statistiche e bozza lo sanno. Eliminando il congedo i giorni CNP spariscono.',
        'Ogni giorno di congedo non pagato riduce in proporzione il diritto alle vacanze dell\'anno e sposta in avanti l\'anzianità di servizio della stessa durata (giubilei e scaglioni delle vacanze arrivano più tardi), contando i giorni già trascorsi entro l\'anno: è la scelta fatta il 01.10.2026. Le due soglie (oggi a 0, cioè da subito) si cambiano nella scheda Regole, voci "Oltre questi giorni di congedo il diritto vacanze si riduce" e "Oltre questi mesi di congedo l\'anzianità si sposta".',
        'Un mese fatto solo di C non diventa da solo un congedo non pagato: il controllo salute segnala i mesi senza turni, da verificare a mano.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: affiancamenti (pianificare, proposte di cambi, storico)',
      vis: () => _guidaVis('piano'),
      righe: [
        "<b>Nuova formazione</b> (scheda Affiancamenti, permesso Piano: pianificare formazioni): allievo, competenza (le stesse della pagina Formazione e competenze: se aggiungi un livello o una specialità compare anche qui), un allievo già nel programma oppure, con la spunta <b>Nuovo allievo</b>, cognome e nome di uno nuovo (entra come gli altri jolly del settore, con S1 e S3 bloccati, solo quando applichi la proposta: chiudendo senza applicare non resta niente; poi compare nel calendario, in Gestione collaboratori e in tutti gli elenchi), uno o più formatori dalla lista con ricerca (anche diversi per diurni e notti: per ogni giorno il primo libero nell'ordine scelto), quanti giorni (5 proposti, il programma chiede conferma prima di generare) e il periodo, in qualsiasi mese o a cavallo di due (ogni proposta sta dentro un mese; applicando si apre quel mese).",
        "Funziona in <b>ogni settore</b> (Slots, Tavoli, Valet, Cleaning): in fondo alla scheda, per ogni competenza si sceglie il <b>gruppo di turni</b> (se il settore ne ha uno solo è già scelto) e il <b>modello dei turni</b>; le sigle devono essere turni di quel gruppo, altrimenti il programma non salva e dice quali sono sbagliate. I turni vengono dal modello, presi dai piani veri in Slots: cassa C0, C4, C23 poi C15, C5; rec R22 x2 poi R23 x3; sala S22 x2 poi S7 x3. Prima i diurni, poi le notti, se possibile nel fine settimana. L'allievo è <b>in più</b> rispetto al fabbisogno: il posto lo copre il formatore.",
        '<b>Proposte</b>: il programma prova i periodi possibili (senza vacanze, malattie, ND, CGF di allievo e formatore) e, se il piano è già fatto, trova i cambi necessari con lo stesso motore di Migliora la bozza e le stesse regole di Controlla le regole, toccando meno celle possibile: solo i giorni della formazione (e la settimana prima e dopo per formatore e allievo) e solo per coprire i posti lasciati liberi. Ogni proposta mostra le celle che cambiano e le eventuali violazioni nuove; si <b>stampa</b> prima di confermare. Annulla = non cambia niente.',
        '<b>Applica</b>: nel piano le celle hanno il commento "FORMAZIONE CASSA con ..." (al formatore il nome dell\'allievo, all\'allievo il nome del formatore). Si annulla con Annulla del piano o, più tardi, con Annulla nella scheda (le celle della formazione tornano come erano).',
        "<b>Fine formazione</b>: dopo l'ultimo giorno, all'apertura della scheda (o con Segna svolta) la formazione risulta svolta nello storico HR, la competenza viene certificata (con i livelli inferiori, il livello si aggiorna da solo nella scheda Formazione) e, se gli incentivi sono attivi, formatore e allievo ricevono i punti.",
        '<b>Formazione scritta nei commenti del piano</b>: la parola <b>formazione</b> o <b>affiancamento</b> nel commento di una cella, seguita dal nome di un gruppo o di una competenza del settore, conta per quel gruppo: per esempio «formazione cassa», «affiancamento reception», «formazione croupier», «formazione valet», oppure la sigla fra parentesi del nome della competenza (es. BO per Back Office (BO)). Senza un nome vale il gruppo del turno. Dopo i giorni scelti in Piano › Impostazioni (Giorni formazione per certificare, di base 5), a formazione finita, il programma propone di certificare la competenza in Formazione. Nel briefing chi ha «formazione» va in coppia con il collega dello stesso turno.',
        "<b>Storico di ognuno</b>: quante formazioni da formatore e da allievo; passando il mouse si vede con chi e in quali giorni. <b>Formatori</b>: chi può formare per ogni competenza (Modifica: lista con ricerca e spunte; proposti per primi e già spuntati nella nuova formazione). Dall'<b>Organico</b>, sui gruppi scoperti, il bottone Pianifica formazione apre la scheda già compilata.",
      ],
    },
    {
      area: 'home',
      titolo: 'Compleanni: dove compaiono e chi ci finisce',
      righe: [
        'I compleanni si vedono in due posti: la <b>fascia dorata in cima</b> alla pagina, che saluta chi compie gli anni <b>oggi</b>, e il riquadro <b>Compleanni</b> nella Home, che elenca <b>oggi e i prossimi sette giorni</b>.',
        "Nel riquadro della Home ci sono sia i <b>collaboratori</b> del settore sia i <b>clienti Maison</b>: sono due elenchi diversi uniti nello stesso posto, per questo si può trovare un nome in uno e non nell'altro.",
        "Il settore si legge dall'<b>anagrafica</b> del collaboratore: la fascia in alto e la Home usano lo stesso criterio e mostrano sempre le stesse persone, anche chi non ha ancora registrazioni nel Diario.",
        "Serve la <b>data di nascita</b> in anagrafica: si mette in Gestione collaboratori. Basta giorno e mese, l'anno non è obbligatorio.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Scheda del collaboratore: pagine, permessi, malattie e data di nascita',
      righe: [
        'Il nome di un collaboratore apre la sua scheda ovunque compaia come prima colonna di una tabella: Diario, Statistiche, Moduli, Formazione, Valutazioni, e nel Piano le schede Saldo, Statistiche, Benessere e Vacanze.',
        'Nel <b>Piano di lavoro</b> fa eccezione: lì il clic sul nome seleziona la riga (con Ctrl o Shift più collaboratori), quindi la scheda si apre con il <b>doppio clic</b> sul nome.',
        "<b>Scheda del collaboratore a pagine</b>: in alto restano sempre nome, contratto, crediti e i pulsanti PDF, Confronta e Chiudi; sotto, le pagine <b>Panoramica</b> (numeri, livello, andamento, pattern malattie), <b>Diario</b> (cronologia con filtri), <b>Piano</b> (tutti i cambi turno divisi per mese e tutti i moduli di non disponibilità divisi per anno, ognuno con Anteprima), <b>Moduli</b> (percorso disciplinare, RDI, allineamenti e apprezzamenti per anno) e <b>HR e formazione</b> (valutazione, storico HR, formazioni). Il numero accanto al nome della pagina dice quante voci ci sono; compaiono solo le pagine con qualcosa da mostrare e i permessi di sempre. Il mese o l'anno più recente è aperto, gli altri si aprono con un clic. Un clic su un riquadro della Panoramica apre il Diario già filtrato. La scheda si riapre sulla pagina usata per ultima.",
        '<b>Chi vede e chi modifica la scheda del collaboratore</b>: tutti vedono nome, settore, turni, cambi turno, registrazioni del Diario ed errori del proprio settore, e il compleanno (giorno e mese). Chi ha il permesso <b>Storico HR, vedere</b> vede anche contratto, anzianità, giubilei, congedi non pagati, allegati, costo degli errori, giorni di malattia e percorso disciplinare, di tutti i settori. Solo chi ha <b>Storico HR, modificare</b> (profilo HR) scrive inizio e fine contratto, data di nascita, giubilei e congedi non pagati. Le <b>valutazioni annuali</b> le vede chi ha Valutazioni, vedere (Direzione, Responsabile, Sostituto, HR) e le scrive chi ha Valutazioni, inserire. Eliminare eventi HR e allegati: solo amministratore. Le stesse regole valgono anche nel database: chi non ha il permesso non riceve i dati e non può salvarli.',
        "Su richiesta HR, il blocco <b>Andamento delle malattie</b> della scheda collaboratore (percentuali per giorno della settimana, avviso Lunedì/Venerdì, confronto con la media del team) è riservato: lo vedono l'admin e gli operatori scelti col permesso <b>Pattern malattie</b> in Impostazioni. Il <b>conteggio</b> dei giorni di malattia resta visibile a tutti.",
        "La <b>data di nascita</b>: se c'è, si legge soltanto (si modifica in Gestione collaboratori, con conferma); campo e tasto Salva compaiono solo quando manca. Se è stato inserito solo giorno e mese, l'anno segnaposto 1900 <b>non viene mostrato</b>: si legge \"02/11 (anno non indicato)\". Con l'anno vero si legge la data completa.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: benessere dei collaboratori',
      vis: () => _guidaVis('piano'),
      righe: [
        "La scheda <b>Benessere</b> mostra come è distribuito il carico di lavoro nell'anno, separando <b>personale fisso</b> e <b>ausiliari</b>, perché hanno regole diverse.",
        "Ogni persona ha un <b>indice da 0 a 100</b> calcolato su dati oggettivi del piano: domeniche libere (25 punti), equità nei weekend rispetto alla media del settore (20), carico notturno (15), qualità del riposo cioè pochi riposi isolati di un solo giorno (15), giorni consecutivi entro il limite (15), vacanze godute (10). Il conteggio usa solo i <b>mesi con piano completo</b> (anche futuri, se il piano c'è già): i mesi a metà o non pianificati restano fuori, e il periodo considerato è scritto in cima. Le domeniche libere seguono la regola di legge: non contano se il sabato prima si finisce dopo le 23.",
        "Sopra 75 la situazione è buona, tra 55 e 75 va tenuta d'occhio, sotto 55 è critica: in fondo compare l'elenco di chi guardare per primo. Passando il mouse su una riga si vede il dettaglio di ogni punteggio.",
        'Le <b>malattie non tolgono punti</b>: non sono una colpa. Si vedono in colonna come segnale da leggere insieme al resto, per esempio accanto a molti weekend e molte notti.',
        "I valori di riferimento (domeniche libere all'anno, massimo giorni consecutivi) sono le stesse regole del piano, quindi cambiando quelle cambia anche la valutazione.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: storico e versioni del mese',
      vis: () => _guidaVis('piano'),
      righe: [
        "La scheda <b>Storico</b> (Piano › Archivio) elenca ogni modifica al piano con chi l'ha fatta e quando. Esempio: «Rossi, 12.11 S7 → C, operatore Bianchi, 10.10 ore 14:32».",
        "<b>Versioni del mese</b> (Piano · Storico, in alto): ogni cambio di cella è registrato dal database con chi e quando (a mano, bozza, import, vacanze, Annulla), da qualsiasi PC e anche dopo aver chiuso il programma. L'elenco mostra i momenti di modifica del mese (chi, quante celle, esempi): <b>Riporta a prima</b> riporta il mese del settore a com'era subito prima di quel momento, oppure si sceglie giorno e ora. Prima di scrivere il programma mostra le celle che cambiano; i giorni chiusi restano; si torna indietro con Annulla. Lo storico si tiene 13 mesi. Con il tasto destro su una cella del calendario, <b>Storia della cella</b> dice com'è oggi (chi l'ha cambiata e quando, nota, blocco) e, per chi vede lo Storico, elenca tutte le modifiche registrate per quella persona e quel giorno (es. S1 \u2192 S7, chi e quando).",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: stampare ed esportare',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Stampa PDF</b> (Piano › Calendario › menu <b>Esporta</b>): il piano del mese del settore aperto su un foglio <b>A4 orizzontale</b>, con il titolo «Piano di lavoro · mese · nome del settore nei documenti» (per gli Slots: FoBoSlot). Le righe e i giorni nascosti nella griglia restano fuori anche dalla stampa: così si stampa, per esempio, il piano senza i SUP.',
        '<b>Copia per Excel</b> (stesso menu Esporta): copia la griglia del mese; in Excel basta incollare (Ctrl+V). Copiare ed esportare sono liberi: non servono permessi.',
        '<b>Excel</b>: in Crediti, Congedi e Avvisi il pulsante Excel scarica la tabella come la vedi (solo le righe rimaste dopo una ricerca).',
        '<b>Crediti</b>, <b>Vacanze</b> (Scarica Excel e Scarica PDF nel formato del file HR), <b>Organico</b> (Excel e rapporto PDF) e <b>Cambi turno</b> (Apri PDF di ogni foglio) hanno le loro stampe. Nella scheda <b>Crediti</b> il pulsante Stampa prepara il foglio A4 orizzontale con il nome del settore.',
        "<b>Notifica d'assenza (modulo 827)</b> in Piano · Formulari: 8 righe (settimana, dal, al, giorni, motivo con caselle) e autorizzazione riga per riga.",
        'Nella scheda <b>Formulari</b> (Piano › Archivio) ci sono i moduli legati al piano, divisi in cartelle, da stampare o far firmare (per esempio la cartella Formazione con i protocolli Word). Il <b>Formulario vuoto</b> del cambio turno è nella scheda Cambi turno.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: preparare il mese',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        '<b>Generare un mese vuoto, prima i dati</b>: collaboratori aggiornati (entrate, uscite con la data di fine contratto, percentuali, funzioni); <b>livelli in Formazione</b> (chi non ne ha riceve il livello 1 e va solo nel gruppo base); preferenze e regole (solo diurni o notti, giorni di lavoro, turni bloccati, regole di gruppo); <b>vacanze</b> inserite; <b>fabbisogno</b> del mese caricato; malattie e ND già note registrate nel Diario, visite mediche con il lucchetto.',
        "<b>Poi, in quest'ordine</b>: 1. <b>Prepara il mese</b> (applica da sola le vacanze, prenota compleanni e recuperi festivi, poi riempie il fabbisogno con il settore ed elenca gli scoperti) → 2. <b>Migliora la bozza</b> (menu Sistema) 3-5 minuti (scambi e spostamenti: scrive solo se niente peggiora) → 3. <b>Copri i buchi con altri settori</b> (menu Sistema) se qualcuno copre da un altro settore, dopo aver preparato anche gli altri settori → 4. <b>Sistema le ore</b> → 5. <b>Controlla le regole</b> (menu Controlla) e ritocchi a mano (il programma avvisa se una modifica rompe una regola) → 6. se restano buchi, la scheda <b>Organico</b>, Cerca cambio o le coperture. Se qualcosa va storto: Annulla, oppure Piano · Storico · Versioni del mese.",
        '<b>Prepara il mese</b> riempie il fabbisogno usando solo i collaboratori del settore e ti elenca i posti rimasti scoperti. Prima dei turni prenota i giorni che spettano: il <b>compleanno</b> (congedo C con la nota "Compleanno", anche per chi lavora in due settori, dove la cella è una sola e si vede in entrambi i piani) e i <b>recuperi festivi arretrati</b>. I giorni già chiusi (passati) non vengono toccati. Se alla conferma rispondi Annulla, il mese torna esattamente com\'era.',
        'Chi ha giorni di vacanza, malattia o recupero nel mese riceve turni solo fino alle ore dovute: quei codici valgono ore anche per la bozza, come in Controlla le regole e nel calendario.',
        '<b>Copri i buchi con altri settori</b> (menu Sistema) compare solo se qualcuno è abilitato a coprire da un altro settore: tappa solo i posti rimasti scoperti, rispettando i limiti della scheda di chi copre, e non tocca vacanze, C e WD già sistemate. Prima si prepara ogni settore (Prepara il mese e Migliora la bozza), poi le coperture: così chi lavora in due settori è usato fuori dal suo solo se serve. Le vacanze di chi lavora in due settori le applica solo il suo settore principale.',
        '<b>Controlla le regole</b> (menu Controlla) elenca le violazioni (riposi, giorni consecutivi, idoneità, ore fuori tolleranza). <b>Sistema le ore</b> (menu Sistema) riequilibra chi è lontano dal proprio obiettivo.',
        '<b>Migliora la bozza</b> (menu Sistema, proposta anche alla fine di Prepara il mese): scegli il tempo (circa 1, 3, 5 o 10 minuti) e il programma prova scambi e spostamenti fra le celle della bozza, tenendo solo quelli che migliorano: prima le regole di legge (riposi, giorni di fila, ore della settimana, domenica), poi le altre regole, poi i posti scoperti, poi le ore di ognuno. Più tempo ha, migliore è il risultato. Alla fine mostra prima e dopo, controllati con Controlla le regole, e chiede se applicare; si applica solo se nessuna regola peggiora e i posti scoperti non aumentano. Non mette mai due persone su un posto già coperto (turni oltre il fabbisogno): se a qualcuno mancano ore e il fabbisogno è pieno, resta sotto il minimo e lo segnala (è un tema di organico). Non tocca vacanze, malattie, celle protette o bloccate, inserimenti a mano, giorni chiusi. Si può fermare prima e si annulla con Annulla del piano. I posti che possono coprire in pochi (le Z dei supervisor, i turni riservati ai SUP) non restano mai più scoperti di prima; cerca anche di dividere le notti in modo uguale fra persone con la stessa funzione. Con lo stesso piano di partenza il risultato è sempre lo stesso.',
        "<b>Migliora la bozza: tempo, notti e Riprova</b>. Il tempo scelto è indicativo: il programma fa sempre lo stesso numero di prove, così lo stesso piano dà lo stesso risultato. Su un computer lento ci mette di più; dopo il doppio del tempo scelto si ferma comunque e il riepilogo lo dice (in quel caso rifacendola il risultato può cambiare). Il riepilogo mostra anche lo <b>squilibrio delle notti</b> fra colleghi della stessa funzione (più basso è meglio); quanto conta si sceglie in Regole, «Quanto Migliora la bozza cerca di dividere le notti in modo uguale» (0 = non ci bada, 3 = normale). Il pulsante <b>Riprova con un altro tentativo</b> lascia il piano com'è e rifà la ricerca, con la stessa durata, partendo da combinazioni diverse: serve quando il primo risultato non convince o non ha trovato miglioramenti. Ogni tentativo ha il suo numero nel titolo.",
        '<b>Passata di riparazione</b>: dopo il primo giro, per ogni posto rimasto scoperto la bozza prova a spostare un turno appena assegnato a chi è idoneo al posto scoperto, dando il suo turno a un collega libero: tutte le regole valgono per entrambi. I posti che restano scoperti sono quelli senza nessuna combinazione valida.',
        "<b>Passata finale della bozza</b>: dopo la sistemazione dei riposi e dei WD la bozza riprova ogni posto ancora scoperto con chi ora è libero, con tutte le regole e lo stesso ordine (prima i fissi sotto le loro ore, poi i jolly). Per coprire il fabbisogno e per i WD il saldo ore dell'anno non abbassa il massimo del mese (resta il massimo con la tolleranza).",
        "<b>Fissi e jolly nella bozza</b>: i fissi devono raggiungere le loro ore e hanno sempre la precedenza; i jolly (ausiliari) sostituiscono i fissi quando serve. Ordine per ogni posto: prima i fissi sotto il loro obiettivo, poi i jolly sotto l'80%, poi i fissi già arrivati (fino al loro massimo), per ultimi i jolly oltre l'80% (con la tolleranza, solo se serve davvero). I jolly non hanno un minimo e fra loro il lavoro si divide in modo equo: tutti alla stessa quota del proprio obiettivo. Le loro vacanze valgono zero ore e tolgono la loro parte di obiettivo. Migliora la bozza pesa di più un fisso sotto le ore; Sistema le ore toglie prima ai jolly con la quota più alta. La percentuale dei jolly (0.8) si cambia in Regole.",
        "<b>Perché manca qualcuno</b> (menu Controlla della barra del calendario, proposto anche alla fine di Prepara il mese): per ogni posto del fabbisogno rimasto scoperto dice chi c'era quel giorno (al lavoro, assente, riposo già fissato, non formato, fermato dalle impostazioni o da una regola di gruppo, fermato da una regola, libero) e in alto <b>cosa manca</b>: personale nei giorni senza nessuno libero, formazione nei gruppi dove c'era gente libera ma non formata, impostazioni da controllare (per esempio solo diurni o un turno bloccato), regole che fermano più spesso. Così si capisce se manca gente o se va corretta la configurazione.",
        '<b>Eccezioni solo se si è al limite</b>: nel rapporto Perché manca qualcuno, chi coprirebbe il posto con un riposo un po\' più corto (sotto le 11 ore, mai sotto le 8, o sotto le 36 ore della settimana) ha il pulsante <b>Assegna comunque</b>: conferma, nota "Eccezione" sulla cella, Controlla le regole continua a segnalarla. Al massimo una a settimana per persona. Ordine delle regole: prima le 12 domeniche libere all\'anno (mai eccezioni), poi le 11 ore, poi le 36 ore, poi le altre. La bozza non fa mai eccezioni da sola.',
        '<b>Generazione automatica completa</b>: dopo la bozza e Migliora la bozza fa anche le coperture da altri settori e Sistema le ore.',
        "<b>Prepara con il motore avanzato</b> (menu Sistema) compare solo se l'amministratore ha scritto l'indirizzo del servizio sul server interno (Piano · Impostazioni): è il motore di ottimizzazione globale (OR-Tools) che calcola il piano ottimo del mese con equità garantita. Senza servizio resta la bozza integrata.",
        '<b>Svuota il mese</b> (a destra nella barra, in rosso) agisce solo sul mese e sul settore che stai guardando: puoi togliere solo le celle generate oppure tutte, e in ogni caso si torna indietro con Annulla.',
        "<b>Generazione automatica</b> (Piano · Impostazioni, solo amministratore): per ogni settore si sceglie il giorno del mese (1-28 o l'ultimo) e i minuti di Migliora la bozza. Da quel giorno in poi il primo PC con il programma aperto genera il piano del mese dopo: vacanze, congedi, CGF, compleanni, turni, poi lo migliora, fa le coperture da altri settori (solo se il piano del settore di chi copre c'è già, altrimenti lo scrive nel resoconto e le rifà quando quel settore viene generato) e Sistema le ore. Se il PC si accende più tardi la fa appena acceso; con più PC accesi la fa uno solo, una volta. Non servono permessi a chi ha il programma aperto: il database gli concede, solo per quei minuti, di scrivere le celle generate di quel mese e settore. Le vacanze dell'anno devono essere importate: se mancano aspetta e avvisa. Non tocca mai le celle scritte a mano (se una vacanza cade su una cella scritta a mano la lascia e la segnala); se il mese ha già una bozza non la rifà. Alla fine chi ha il permesso Piano: preparare il mese (bozza) riceve una nota con il resoconto; Riprova nelle Impostazioni la rimette da fare. Mentre genera si lavora normalmente: sul PC che la fa solo la pagina Piano mostra un avviso per qualche minuto; sugli altri PC, aprendo quel mese, compare \"Generazione automatica in corso\" ma niente è bloccato, e se qualcuno modifica a mano una cella in quei minuti la sua modifica vince (il programma la salta e lo scrive nel resoconto). Lo stesso vale per Migliora la bozza.",
        '<b>Sistema le ore</b> (menu Sistema): sposta un turno da chi è sopra a chi è sotto le sue ore solo se non crea nessuna violazione nuova per nessuno dei due: le stesse regole di Controlla le regole (riposo singolo dopo 4 giorni, riposo attorno alla domenica, ore della settimana, giorni a settimana, accompagnamento), le regole di gruppo (quanti SUP nel giorno e nel mese, SUP di notte, livello minimo) e il minimo di ore del mese di chi cede il turno. Se la rete cade un attimo mentre il programma scrive, la scrittura si ripete da sola invece di perdersi.',
        '<b>Confine fra due mesi</b>: Controlla le regole conta anche la fine del mese prima (riposo fra il 31 e l\'1, giorni di fila, 4+1+1). Se un cambio di fine mese rompe una regola di legge nei primi giorni del mese dopo già pianificato, nel calendario compare il riquadro "da ricontrollare" in tutti e due i mesi, finché il problema c\'è. <b>Proponi correzione</b> (permesso Piano: preparare il mese) cerca pochi cambi fra le celle generate dei primi 10 giorni, mostra prima e dopo e scrive solo se confermi; le celle scritte a mano non si spostano.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: regole di legge (riposi, domeniche, ore della settimana)',
      vis: () => _guidaVis('piano'),
      righe: [
        "Queste regole valgono <b>uguali per tutti i settori</b> (sono le regole di legge per le case da gioco): almeno 11 ore di riposo fra due turni, un massimo di giorni di lavoro di fila, 12 domeniche libere all'anno, la domenica libera vale solo se il sabato si finisce entro le 23, al massimo 45.1 ore nella settimana. I valori si leggono e, se cambia la legge, si cambiano in Piano › Regole; la scritta grigia sotto ogni regola dice da dove viene.",
        "<b>Domeniche libere nell'anno</b>: il diritto è di 12 all'anno. In un mese con bisogno si può lavorare tutte le domeniche; chi è indietro recupera in parti uguali nei mesi che restano fino a dicembre: ogni mese la sua quota più una parte dell'arretrato (a dicembre tutto quello che manca). Prepara il mese rispetta questa quota come una regola di legge e Controlla le regole segnala chi non ci arriva (\"domenica libera: 7 nell anno su 9 attese fino a questo mese (minimo 12 all anno, arretrato 2 da recuperare entro dicembre): da recuperare\").",
        '<b>Domenica libera e sabato fino alle 23</b>: una domenica libera conta solo se il sabato prima si finisce entro le 23 (LL art. 18, regola Turno prima della domenica libera). È una regola di legge per le case da gioco e vale per tutti i settori. Dove quasi tutti i turni del sabato finiscono dopo le 23 (per esempio ai Tavoli) servono il sabato e la domenica liberi insieme: se la bozza lascia posti scoperti per rispettarla, è un tema di organico o di orari dei turni, e Perché manca qualcuno lo mostra.',
        "<b>Domeniche libere valide (C rossa)</b>: nel calendario la lettera della domenica diventa ROSSA quando quella domenica conta per le 12 dell'anno: domenica non lavorata, non in vacanza o malattia, e sabato finito entro le 23. Un sabato di malattia (dal piano, dal Rapporto o dal Diario) non si lavora, quindi la domenica dopo diventa rossa da sola. Se un cambio turno, un cambio per esigenze, una copertura malattia o una modifica a mano toglie una domenica rossa (turno di domenica o sabato che finisce dopo le 23), il programma avvisa prima di salvare, dice quante domeniche valide restano nell'anno e chiede conferma; la conferma resta nello storico.",
        "<b>Riposo attorno alla domenica</b>: dalla fine dell'ultimo turno all'inizio del successivo. Domenica libera: almeno 35 ore consecutive (24 della domenica + 11) comprese le 23 del sabato e le 23 della domenica. Domenica lavorata (anche quando il sabato finisce dopo le 23): almeno 47 ore consecutive (36 + 11) nella settimana prima oppure in quella dopo (lunedì-sabato). Il programma avvisa sulla cella, in Controlla le regole e in Piano > Avvisi > Riposo settimanale (con da quando a quando); la bozza a fine mese sposta un turno a un collega libero per creare il riposo, e dice se qualcosa resta da sistemare a mano. I valori si cambiano in Regole (riposo_domenica_libera_ore, riposo_domenica_lavorata_ore).",
        '<b>Ore lavorate nella settimana</b>: se un collaboratore supera 45.1 ore dal lunedì alla domenica il programma avvisa quando scrivi la cella o fai un cambio, lo mostra in Controlla le regole e in Piano > Avvisi, e la bozza non lo supera mai. Contano turni e JG (non vacanze, malattie, CGF, riposi); il turno che passa la mezzanotte conta nella settimana in cui inizia. Si vedono sempre tre cifre: ore da orologio, 10% notturno e totale (es. 51.68 = 49.18 + 2.50); il limite si confronta con il totale compreso il 10% (regola ore_settimana_con_notturno, si può cambiare in Regole insieme al limite ore_settimana_max).',
        '<b>Ore dei fissi</b>: margine del mese +/-20 ore (regola tolleranza_ore).',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: fabbisogno (quante persone per turno)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Il <b>fabbisogno</b> è la tabella sotto il calendario: per ogni turno e ogni giorno quante persone servono. È quello che Prepara il mese cerca di coprire. Lo vedono tutti; modificarlo (celle, incolla, <b>Copia dal mese precedente</b>, <b>Importa da Excel</b>, svuota) richiede il permesso <b>Modificare il fabbisogno</b>. Esempio Tavoli: due SUP al giorno (un 21 più un 81 o un 911) non sono una regola, arrivano dal fabbisogno.',
        "<b>Fabbisogno con la tastiera</b>: come il calendario. Clic = seleziona, doppio clic o un numero = modifica; Invio scende, Tab va a destra, le frecce confermano e si spostano, Esc annulla; Maiusc+frecce o il trascinamento selezionano più celle e il numero va su tutte; Canc svuota. Le righe seguono l'ordine dei turni del file Excel (sezione PIANIFICAZIONE), salvato a ogni import del fabbisogno o del piano.",
        "<b>Fabbisogno dal file del piano</b>: importando il piano Excel di un mese, il programma legge anche il fabbisogno dallo stesso file (sezione PIANIFICAZIONE del foglio del mese). Se il mese non ha ancora un fabbisogno lo carica da solo; se ce n'è uno diverso chiede se sostituirlo; se è uguale non fa niente. Se il file non ha la sezione PIANIFICAZIONE (es. Cleaning) e il mese non ha fabbisogno, propone di crearlo dai turni del piano importato (quante persone per turno ogni giorno). Serve il permesso Modificare il fabbisogno.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: import dai file Excel',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        '<b>Importa da Excel</b> (Piano › Calendario › menu <b>Esporta</b>, permesso Import da file) legge il file dei piani del settore: riconosce il foglio del mese, le colonne dei giorni e i nomi anche con piccoli refusi.',
        "<b>Nomi</b>: se nel file c'è prima il nome e poi il cognome (o mancano accenti e apostrofi) il collaboratore viene riconosciuto lo stesso, e resta sempre il nome scritto in Gestione collaboratori: l'import non rinomina mai nessuno.",
        "<b>Ordine</b>: dopo l'import il calendario del settore ha i collaboratori nell'ordine del file; chi non è nel file resta in fondo. Si cambia trascinando le righe o con <b>Rimetti l'ordine dei nomi</b> (menu Strumenti).",
        "<b>Prima di scrivere mostra l'anteprima</b>: celle nuove, celle diverse dal piano (con i primi esempi), colori e orari JG da allineare, celle già uguali. Si sceglie <b>Aggiorna dal file</b> (il file aggiornato sovrascrive turni, ore e colori) oppure <b>Solo le celle nuove</b>.",
        "<b>Controllo prima dell'import</b> (ogni settore), come il file Excel CONTROLLO PIANO: prima di scrivere, riposo minimo fra due turni e giorni di fila (valori delle Regole: 11 ore, 5 giorni), contando anche la fine del mese prima; una cella vuota non conta come riposo. Se ci sono errori compare la tabella Collaboratore, Data, Errore, Dettagli, Turni con tre scelte: <b>Annulla</b> (niente scritto), <b>Importa com'è</b>, <b>Importa e proponi correzioni</b>: il programma cerca il minor numero di cambi solo nei giorni degli errori (i colleghi possono solo scambiarsi turni già esistenti, i giorni di riposo e le celle vuote si toccano solo per chi ha l'errore; mai vacanze, malattie, celle bloccate, giorni chiusi), li mostra prima/dopo e applica solo con Applica, e solo se gli errori calano, non ne nasce nessuno nuovo e nessuna altra regola di legge peggiora.",
        "<b>Controllo delle regole dopo l'import</b> (ogni settore): finito l'import, una finestra dice quante regole il mese importato non rispetta, per tipo (riposo sotto il minimo, giorni di fila, 4+1+1, ore della settimana, domeniche, ore del mese, idoneità) e chi è più coinvolto; con Mostra nel calendario le celle si colorano e compare l'elenco con nome, giorno e motivo. Il piano si importa com'è: il programma non sposta le celle importate.",
        "Restano come sono, anche se nel file sono diverse: le <b>malattie registrate</b> (vale il Diario), i <b>giorni chiusi</b> (si sbloccano con motivo), le <b>celle bloccate</b> con motivo e le celle scritte dal piano di <b>un altro settore</b>. L'anteprima le elenca.",
        '<b>Import del piano: lucchetto e celle tolte</b>: un commento di visita medica (o controllo, certificato medico) su una cella del file la blocca con il lucchetto e quel motivo, come a mano. Una cella vuota nel file, per una persona del file e in un giorno che il file ha, si svuota anche nel piano (elenco nella conferma); restano malattie, ND, vacanze, celle con lucchetto e riposi messi dal programma. Le note con un orario (DALLE 14:30, ore 10:00) non perdono il testo.',
        "Tutto l'import si toglie con <b>Annulla</b> del piano.",
        "Se nel file ci sono collaboratori nuovi li crea; quelli disattivati restano disattivati e le loro celle non si importano. Quelli attivi ma senza turni nel file te li propone da fermare con la fine contratto all'ultimo giorno del mese prima, solo se il mese nel file è compilato (con un mese a metà non propone niente). Ogni passo ha la sua conferma: leggi bene l'elenco prima di confermare.",
        '<b>Import del piano e mese in corso</b>: importando il piano di un mese (es. novembre), se il file contiene anche il foglio del mese in corso (ottobre) con differenze dal programma, il programma lo dice e chiede se aggiornare anche quello, con le stesse regole (giorni chiusi, malattie, celle bloccate e altri settori restano). Se ottobre nel file è uguale non chiede niente.',
        "<b>Colori</b>: arriva il colore che si vede aprendo il file, comprese le regole automatiche di Excel (es. V blu); i dettagli sono alla voce Colori dall'Excel qui sotto. <b>JG</b>: la nota della cella resta; se dice l'orario (\"dalle 10 alle 14\") l'orario si prende, altrimenti si aggiunge con doppio clic sul JG.",
        '<b>Colori dall\'Excel</b>: importando il piano arriva il colore che si vede aprendo il file. Il programma calcola anche le regole automatiche di Excel (es. "V = blu"): quando una regola copre il colore dato a mano, vale la regola, come in Excel. I colori dati a mano (es. le X dei coordinatori in rosso) arrivano sulle stesse celle e restano modificabili; i colori delle regole sono i colori delle sigle e, se diversi dalla tabella dei turni, l\'amministratore può prenderli dal file. Un colore messo per sbaglio da un import precedente si toglie reimportando; un colore dato nel programma resta. I colori usati nel mese compaiono nella tavolozza di Colora, per darli uguali ad altre celle.',
        '<b>Importa da Excel</b> nel fabbisogno (sotto il calendario) legge la sezione di pianificazione dello stesso file e sostituisce il fabbisogno del mese. Cosa succede al fabbisogno quando si importa il piano è spiegato nel capitolo «Piano: fabbisogno (quante persone per turno)».',
        "<b>File di un altro formato: scegli le colonne</b>. Il file del Casinò (foglio del mese con i giorni in una riga) e il formato semplice (nome e poi i giorni 1, 2, 3...) si riconoscono da soli come sempre. Se il file è diverso (per esempio quello di un consulente, con i nomi in un'altra colonna o i giorni spostati) si apre la finestra <b>Scegli le colonne</b>; si può aprire anche a richiesta da Esporta › <b>Importa da Excel scegliendo le colonne</b>. Si indicano il <b>foglio</b>, la <b>riga di intestazione</b> (numero della riga in Excel), la <b>colonna dei nomi</b>, la colonna della <b>funzione</b> e della <b>percentuale</b> (facoltative: servono per i collaboratori nuovi) e le <b>colonne dei giorni</b>: i numeri 1-31 riconosciuti nella riga di intestazione, oppure dalla colonna del giorno 1 all'ultima. Il programma propone da solo una prima scelta.",
        "Sotto c'è l'<b>anteprima</b> delle prime righe: nome nel file, collaboratore riconosciuto (o non trovato), funzione e i codici dei primi giorni, con il conto dei <b>codici riconosciuti</b> e dei <b>codici sconosciuti</b> (sottolineati in rosso: non si importano). Con <b>Salva queste colonne per il settore</b> la scelta viene riproposta al prossimo file con lo stesso foglio (la salva chi può importare il piano, solo per i propri settori). <b>Continua con l'import</b> porta al riepilogo di sempre, con tutti i controlli di questo capitolo (celle protette, giorni chiusi, malattie, altri settori, persone nuove o assenti, riposi): niente viene scritto prima di confermare.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: festivi, CGF e supplementi',
      vis: () => _guidaVis('piano'),
      righe: [
        'I <b>festivi</b> sono quelli ufficiali del Canton Ticino e si generano da soli per qualsiasi anno futuro aprendo la scheda Festivi.',
        'Il <b>CGF</b> è il recupero per il lavoro nei giorni festivi. Per il regolamento aziendale spetta al <b>personale fisso</b> e solo per i festivi diversi dalla domenica. Con la regola <b>cgf_solo_parificati</b> (predefinita: Sì) il recupero matura solo sui <b>nove festivi parificati alla domenica</b>, esattamente come nel foglio Excel del piano: gli altri festivi cantonali (San Giuseppe, 1 Maggio, Pentecoste, Corpus Domini, SS. Pietro e Paolo, Immacolata) non danno recupero. Nella scheda Festivi ogni giorno dice se dà CGF, se è escluso perché non parificato o perché cade di domenica.',
        '<b>CGF caduto in malattia</b>: se una persona è in malattia proprio nel giorno del suo CGF, il recupero non è goduto e il credito resta. Subito dopo aver registrato la malattia il programma propone un giorno sostitutivo nello stesso mese ("Il CGF del 09.12 di Peraino è caduto in malattia. Lo rimetto il 15.12 (oggi C)?"): un giorno vuoto o un C messo dalla bozza, mai un C scritto a mano, bloccato o di compleanno, con le regole dei recuperi. Con Sì il giorno diventa CGF con la nota "Ex C - operatore"; con No, o se nel mese non c\'è posto, il recupero resta da dare. Anche <b>Assegna CGF</b> usa i C messi dalla bozza, così funziona anche a mese già pianificato.',
        "<b>CGF anticipato</b>: il recupero di un festivo si può dare anche prima del festivo nello stesso mese (es. dicembre: CGF il 18 per chi lavora il 25). Se poi il festivo non si lavora (turno tolto a mano o malattia): un CGF che deve ancora arrivare non spetta più e diventa C (prima quello anticipato prima del festivo perso; se l'hai scritto a mano o cambi tu la cella, il programma chiede conferma); un CGF già goduto (il giorno è passato) resta CGF e il conto va a -1, da pareggiare. Esempi: il 16 togli il 25, il 18 diventa C; il 19 togli il 25, il 18 resta CGF (-1); CGF il 18 e il 29 per 25 e 26, il 20 togli il 25: il 18 resta e diventa C il 29.",

        'La <b>bozza</b> mette i recuperi arretrati PRIMA di distribuire i turni, con tre regole modificabili: al massimo <b>cgf_max_mese</b> recuperi a persona in un mese (2), almeno <b>cgf_distanza_giorni</b> giorni fra due recuperi (5), e mai il giorno prima o dopo una vacanza (<b>cgf_non_con_vacanze</b>, RAP 4.3). I recuperi dei festivi del mese vanno nei giorni dopo il festivo. Mai sul compleanno.',
        "Il <b>riporto CGF</b> dall'anno precedente (colonna \"riporto\" del foglio Excel) si scrive nella scheda Festivi con il pulsante <b>Riporto CGF dall'anno precedente</b>: con un riporto registrato il programma non conta più i festivi e i recuperi dell'anno prima. Lo stesso conteggio (riporto + maturati - goduti, con i recuperi caduti in malattia che restano a credito) vale ovunque: bozza, Assegna i CGF, Chi ha diritto e Statistiche.",
        'Gli <b>ausiliari (jolly) non maturano CGF</b>: ricevono il <b>supplemento del 50%</b> sul salario orario lordo quando lavorano uno dei <b>nove festivi parificati alle domeniche</b> (Capodanno, Epifania, Lunedì di Pasqua, Ascensione, 1 Agosto, Assunzione, Ognissanti, Natale, Santo Stefano). Sono sempre quei nove, non cambiano di anno in anno e valgono anche quando cadono di domenica. Gli altri festivi cantonali (quelli elencati sopra per il CGF) non danno il supplemento. In più, per il lavoro notturno maturano <b>tempo libero pagato pari al 10% delle ore notturne</b>. Entrambi i conteggi sono nelle Statistiche anno, colonne Suppl. 50% e Notte 10%, pronti per le paghe. Fonte: RAP Allegato 1. Il <b>supplemento del 10% per il lavoro notturno</b> (fascia 23:00-06:00) è già compreso nella durata dei turni, quindi entra da solo nelle ore del mese e nel saldo: come verificarlo è spiegato nel capitolo «Piano: controllo delle durate dei turni (in ore e minuti)».',
        "Il conteggio di maturati, goduti e saldo parte da gennaio e serve anche a controllare se nei mesi passati i recuperi sono stati dati. Chi compila il piano <b>a mano</b> trova nella scheda Festivi due pulsanti: <b>Chi ha diritto a un recupero</b> (elenco con maturati, goduti e saldo dell'anno) e <b>Assegna i CGF del mese</b>, che mette i recuperi nei giorni liberi tenendo conto di quelli già dati nei mesi precedenti, senza doppioni e senza toccare le celle occupate.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: festività e orari di chiusura (CH5 e CH7)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Il casino chiude alle <b>04:00</b> nei giorni feriali e alle <b>05:00</b> il venerdì e il sabato. Nei giorni di <b>festività</b> si chiude alle 05:00 anche in mezzo alla settimana, e il <b>31 dicembre</b> alle 07:00.',
        'Nel calendario quei giorni portano in cima alla colonna il marcatore viola <b>CH5</b> (o CH7), così si sa in anticipo dove serve più personale. Il marcatore <b>non</b> compare il venerdì e il sabato, perché lì si chiude tardi per prassi e segnalarlo sarebbe rumore.',
        'L\'elenco si gestisce nella scheda <b>Festivi</b>, riquadro "Festività e orari di chiusura": un bottone inserisce le festività dell\'anno (per il 2026 e il 2027 gli elenchi forniti dalla direzione, per gli altri anni le dodici festività italiane di legge con Pasqua calcolata), e ogni riga si può spegnere o eliminare. Se ne possono aggiungere altre a mano.',
        'Gli orari (4, 5, 7 e i giorni che chiudono tardi) sono <b>regole modificabili</b> nella scheda Regole: chiusura_ora_normale, chiusura_ora_tardi, chiusura_ora_fine_anno, chiusura_giorni_tardi.',
        'Attenzione a non confondere: i <b>festivi cantonali</b> (stessa scheda, riquadro sopra) servono ad altro, cioè al recupero <b>CGF</b> dei fissi e al supplemento del 50% degli ausiliari. La lista cantonale segue la legge ticinese del 15 dicembre 2009 e coincide con il calendario ufficiale del Cantone: undici feste fisse più quattro mobili calcolate da Pasqua.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: turni che finiscono più tardi (es. Z0)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Alcuni turni finiscono più tardi nei giorni in cui il casino chiude alle <b>05:00</b>. Il caso noto è <b>Z0</b>: finisce alle <b>19:45</b> nei giorni normali e alle <b>20:30</b> il venerdì, il sabato, nelle vigilie di festività e il 31 dicembre.',
        "La sigla resta <b>una sola</b>: nel piano si scrive Z0 come sempre e il programma calcola da solo le ore di quel giorno. Passando il mouse sulla cella si legge l'orario effettivo e la durata.",
        "Il programma usa <b>due criteri, ne basta uno</b>: il giorno chiude tardi, oppure nel piano di quel giorno c'è il turno che dà il cambio (per Z0 e <b>Z12</b>, che inizia alle 20:30). Così il conteggio resta giusto anche in un giorno fuori dal solito.",
        "Si imposta nella scheda <b>Turni</b>: la colonna <b>Fine (chiusura 5)</b> per l'orario prolungato. Lasciandola vuota il turno finisce sempre alla stessa ora.",
        "Le ore in più entrano da sole in <b>OP</b>, <b>SM</b>, <b>YTD</b>, nella scheda Saldo e nelle Statistiche: non c'è niente da aggiungere a mano.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: controllo delle durate dei turni (in ore e minuti)',
      vis: () => _guidaVis('piano'),
      righe: [
        "Nella scheda <b>Turni</b> il bottone <b>Controlla le durate dei turni</b> confronta, per ogni turno con orario, la durata scritta con quella che risulta dall'orologio più il supplemento del <b>10%</b> sulle ore notturne (23:00-06:00).",
        'La tabella mostra tutto sia in <b>ore e minuti</b> (8h30) sia in decimali (8.5), perché sui turni si ragiona in sessantesimi ma il programma calcola in decimali: così i due modi si vedono affiancati e non ci si sbaglia.',
        "Anche nella tabella dei <b>Turni</b> ogni durata mostra l'equivalente: <b>8.33 = 8h20</b>, perché 20 minuti sono un terzo di ora. Se una durata sembra non coincidere con la tabella cartacea, quasi sempre è solo il formato: il numero è lo stesso.",
        'Vengono segnalati solo gli scarti di <b>almeno tre minuti</b>: sotto è arrotondamento, non un errore.',
        'Il bottone che corregge riscrive la durata dei turni, quindi cambia i conteggi delle ore: si usa solo dopo aver controllato riga per riga. Un turno può avere una durata diversa per accordi particolari, per esempio pause non pagate.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: correggere il saldo del mese (ore reali)',
      vis: () => _guidaVis('piano'),
      righe: [
        'Finché il programma non è collegato in automatico alla timbratrice, le ore vere di un mese possono non coincidere con il piano: chi finisce prima, chi resta oltre.',
        'Nel <b>Calendario</b> fai <b>doppio clic</b> sulla colonna <b>OP</b> (ore pianificate) o su <b>SM</b> (saldo del mese) del collaboratore: il programma chiede le <b>ore realmente lavorate</b> nel mese e, se vuoi, il motivo.',
        "Da quel momento il saldo del mese, l'<b>YTD</b>, la scheda <b>Saldo</b> e le <b>Statistiche</b> dell'anno usano quel totale. Il valore scritto a mano si riconosce da un <b>asterisco</b>, e passandoci sopra si legge chi lo ha scritto, quando e perché.",
        "Si corregge la <b>causa</b> (le ore), non l'effetto (il saldo): così il numero resta spiegabile e continua ad aggiornarsi da solo.",
        'Per tornare alle ore del piano basta rifare il doppio clic e <b>lasciare il campo vuoto</b>.',
        'Se serve la precisione del singolo giorno, resta la scheda <b>Timbrature</b>: lì si registra entrata e uscita di una giornata. Ordine di precedenza: ore reali del mese, poi timbrature, poi piano.',
        'Gli <b>ausiliari</b> non hanno ore dovute, quindi per loro non esiste un saldo da correggere.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: giorni di vacanza spettanti',
      vis: () => _guidaVis('piano'),
      righe: [
        'Nella scheda <b>Vacanze</b> il programma calcola quanti giorni spettano a ogni collaboratore fisso, partendo dalla data di inizio contratto.',
        "La regola: <b>28 giorni</b> nei primi due anni, <b>35</b> dal compimento dei due anni. Nell'anno del passaggio il diritto matura mese per mese: i mesi prima dell'anniversario valgono 28 diviso 12, quelli dopo 35 diviso 12.",
        "Giorni in più per anzianità <b>una volta sola</b>, nell'anno in cui cade l'anniversario (dal giorno dopo: un anniversario il 31.12 vale l'anno seguente): <b>10 anni +1</b> (36), <b>15 anni +2</b> (37), <b>20 anni +3</b> (38), <b>25 anni +4</b> (39), <b>30 anni +5</b> (40). L'anno dopo si torna a 35.",
        'I decimali del pro-rata si <b>arrotondano al giorno pieno</b> a favore del collaboratore: da <b>,35</b> in su si sale (32.67 e 32.37 diventano 33), sotto resta il giorno intero (32.3 resta 32). Passando il mouse sulla riga si legge comunque il valore esatto. La soglia si cambia nella regola vacanze_arrotonda_da (vuota = nessun arrotondamento).',
        'Esempio: chi compie 20 anni a marzo 2025 ha 38 giorni nel 2025 e di nuovo 35 nel 2026.',
        "I mesi di <b>congedo non pagato</b> spostano in avanti anche questi scaglioni, esattamente come fanno con i giubilei: l'anzianità di servizio è una sola.",
        "Da <b>ottobre</b> compare l'avviso con chi avrà più giorni l'anno successivo, per pianificare le vacanze con il numero giusto.",
        "Gli <b>ausiliari non compaiono</b>: per loro le vacanze sono un'indennità in percentuale sulle ore lavorate (RAP Allegato 1), non giorni.",
        'Tutti i valori (28, 35 e i quattro scaglioni) sono modificabili nella scheda Regole.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: organico (quante persone servono)',
      vis: () => _guidaVis('piano') && typeof organicoAttivo === 'function' && organicoAttivo(),
      righe: [
        "La scheda <b>Organico</b> del Piano dice, per i mesi dell'anno, se le persone del settore bastano a coprire il fabbisogno rispettando le regole, e cosa conviene fare se non bastano. Si aggiorna da sola quando cambiano piano, fabbisogno, vacanze, malattie o collaboratori.",
        '<b>1. Ore</b>: ore richieste dal fabbisogno contro ore nette disponibili (contratto meno vacanze, CGF, malattie medie del mese, altri impegni, congedi non pagati). <b>2. Persone</b>: quante ne servono nel giorno di punta e per le domeniche, anche quando le ore bastano. <b>3. Affidabilità</b>: riserva a chiamata per coprire le malattie improvvise nel 95% dei giorni.',
        "<b>Per gruppo</b> (sala, cassa, accoglienza...): ore, posti massimi in un giorno, persone minime, persone abilitate (col mouse si vede chi sono), quante <b>mancano</b> e chi <b>si potrebbe formare</b> tra chi c'è già (prima chi ha più ore libere). Un gruppo è scoperto se nel giorno di punta non ci sono abbastanza abilitati, o se le sue ore superano tutte le ore degli abilitati.",
        '<b>Che tipo di persona serve</b>: per ogni gruppo scoperto la proposta è prima <b>formare</b> collaboratori già in organico; se non bastano, le proposte di assunzione dicono il <b>profilo da cercare</b> (es. abilitato a cassa). Perché il conto per gruppo sia vero, nella scheda del collaboratore vanno impostati i settori: chi non li ha conta per tutti i gruppi.',
        "<b>Costi</b> (facoltativi): l'amministratore inserisce in fondo alla scheda il costo annuo di un tempo pieno e il costo orario di un ausiliario (medie, oneri compresi) e li accende. Ogni proposta e il simulatore mostrano il costo nei mesi rimasti e il costo per ora di carenza coperta; spostare vacanze e formare non aggiungono ore di contratto. I costi li vede solo chi vede la scheda Organico.",
        "<b>Suggerimenti</b>, dal più leggero: spostare vacanze verso i mesi con margine, più disponibilità degli ausiliari, un ausiliario stagionale, un fisso. Ognuno mostra l'effetto ricalcolato; <b>Prova questa soluzione</b> la applica alle ipotesi senza toccare i dati.",
        '<b>Verifica sui mesi passati</b>: dice se i buchi del piano venivano da ore mancanti (servono persone) o da ore libere non usate (distribuzione dei turni o abilitazioni: prima di assumere conviene guardare lì).',
        '<b>Organico in tre passi</b>: <b>1 · Situazione</b> dice in parole semplici se il personale basta (quante persone a tempo pieno servono e quante ce ne sono dopo le assenze, quali mesi o gruppi di turni restano scoperti), cosa conviene fare e i mesi in breve; <b>2 · Prova una soluzione</b>: cosa serve (postazioni, periodo, costo) e il confronto mese per mese; <b>3 · Dettagli e metodo</b>: tabelle complete, verifica sui mesi passati, metodo e costi. Excel e Rapporto PDF contengono sempre tutte le tabelle.',
        '<b>Organico, simulatore dei costi</b>: per ogni ipotesi tipo (ausiliario o fisso), quante persone, dal / al (date), orario dalle / alle con i giorni a settimana (diventa la percentuale: 20:00-02:00 per 5 giorni = 30 ore) oppure la percentuale, e il costo orario. Al costo si aggiungono, con le percentuali delle Regole, il notturno (10% sulle ore fra le 23 e le 6) e per gli ausiliari le indennità di vacanze (8.33%) e tredicesima (8.33%). Ogni ipotesi mostra il suo costo e le ore; il totale è nel Risultato.',
        '<b>Organico, calcolo del fabbisogno</b>: periodo dal / al, ausiliari o fissi con la loro percentuale, costo orario e le postazioni che servono (dalle, alle, giorni della settimana, persone insieme), per esempio una persona dalle 15 alle 18 e una dalle 16 alle 22 dal lunedì al giovedì. Calcola le ore sui giorni veri (anche di notte), quanti collaboratori servono (per le ore e per avere sempre le persone insieme, con le assenze medie dello storico) e il costo secondo il RAP (Allegato 1): per gli ausiliari si sceglie se il prezzo orario è il SALARIO DI BASE (si aggiungono indennità vacanze 8.33% o 10.65% con 5 settimane e tredicesima 8.33%, pagate con le ore lavorate) o COMPRENSIVO (già dentro); sempre a parte il notturno 10% sulle ore fra le 23 e le 6 e, per gli ausiliari, il 50% nei nove festivi parificati del periodo. Gli oneri sociali del datore di lavoro non sono compresi. Aggiungi al confronto mette quelle persone nel confronto mese per mese (stesso selettore anche lì). Stampa: periodo, dati, postazioni, risultato e come si legge, su un foglio A4. Riposi settimanali, malattie e vacanze sono già compresi nel numero di persone (ore nette di ognuno meno le assenze medie dello storico, più le persone che devono essere insieme); non controlla riposi minimi e giorni di fila persona per persona.',
        '<b>Metodo</b> (in fondo alla scheda) spiega i calcoli con i numeri del settore. <b>Excel</b> e <b>rapporto PDF</b> per la Direzione.',
        "L'amministratore la accende o spegne in Piano > Impostazioni; chi la vede si decide in Visibilità e permessi (Piano · Organico).",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: chi fa cosa (funzioni, turni per funzione, preferenze)',
      vis: () => _guidaVis('piano'),
      righe: [
        "<b>Chi fa cosa: le parole</b>. <b>Area</b> (o gruppo di turni): SALA, CASSA, REC, SUP, BO... ogni turno appartiene a un'area. <b>Competenza</b> (Formazione): cosa la persona sa fare e con che livello; una competenza collegata a un'area apre quell'area. <b>Funzione</b> (scheda del collaboratore): il ruolo, HOST, SUP, BO, RESP. <b>Turni per funzione</b>: PRINCIPALE = i turni abituali della funzione, AMMESSO = solo se serve (dopo tutti gli altri e solo per chi è sotto le sue ore), PREFERITO = preferenza senza limiti; se una funzione ha almeno un PRINCIPALE o AMMESSO fa solo quei turni. <b>Regole di gruppo</b>: limiti in più del settore (turni riservati, requisiti sulla scheda, minimi e massimi). <b>Affiancato in</b> (Preferenze): la persona lavora in quell'area ma mai da sola.",
        "<b>Funzioni del settore</b> (Piano › Impostazioni, amministratore): l'elenco delle funzioni del settore aperto con il nome per esteso (si scrive nella casella, es. DI = Ispettore di gioco, e compare nelle schede e negli elenchi), quante persone la hanno e la colonna <b>Turni che fa</b>: <b>Tutti i turni del settore</b> se la funzione non ha turni principali o ammessi, altrimenti <b>Solo questi turni</b>, con le righe <b>principali</b> (i turni PRINCIPALE), <b>se mancano ore</b> (gli AMMESSO) e <b>preferiti</b> (i PREFERITO). Si aggiunge con Sigla, Nome per esteso e <b>Aggiungi funzione</b>; <b>Togli</b> la toglie (chi la ha ancora la tiene nei suoi dati finché non la cambi nella sua scheda; nel settore deve restarne almeno una). Le funzioni che i collaboratori hanno già compaiono sempre, con la scritta «(dai collaboratori)». Esempio Slots: SUP = Solo questi turni, principali Z0, Z8, Z12, se mancano ore tutti gli altri; HOST = Tutti i turni del settore.",
        '<b>Turni per funzione</b> (Piano › Impostazioni, sotto Funzioni del settore, amministratore): si scelgono Funzione, Turno e Tipo e si preme <b>+ Aggiungi</b>; un clic sulla sigla colorata la toglie. <b>PRINCIPALE</b> (verde) = i turni normali della funzione, la bozza li dà per primi; <b>AMMESSO</b> (ocra) = solo se serve, dopo tutti gli altri e solo a chi è sotto le sue ore; <b>PREFERITO</b> (blu) = solo una preferenza, non limita niente. Attenzione: basta un PRINCIPALE o un AMMESSO e tutti quelli con quella funzione fanno <b>solo</b> i turni elencati; il programma lo dice prima di salvare. Vale per la funzione, non per una persona (per una persona: Regole di gruppo, Turni riservati a collaboratori scelti). Esempio Tavoli: SUP → 21, 81, 91, 911 PRINCIPALE e 6, 9 AMMESSO. Valet: vuoto.',
        "<b>Come la bozza sceglie chi fa cosa</b>: bozza, proposte di cambio, coperture, Sistema le ore, scrittura a mano, Controlla le regole e la card Chi può fare cosa usano lo stesso controllo «chi può fare questo turno». La bozza fa due giri: prima, su tutto il mese, i turni PRINCIPALI riservati a una funzione (per esempio le Z dei Supervisor: nessuna deve restare scoperta), poi tutto il resto; ogni giorno riempie per primi i posti che possono fare in pochi. Un turno AMMESSO si dà solo se serve (dopo tutti gli altri) e solo a chi è sotto le sue ore, salvo quando una regola Minimo di una funzione al giorno chiede proprio quella funzione. Chi è <b>affiancato</b> in un'area (Preferenze, Affiancato in) ne fa i turni, mai da solo.",
        "<b>Chi può fare cosa</b> (Piano › Regole, prima card, sola lettura): si sceglie la <b>Vista</b> (Per collaboratore o Per turno), la persona o il turno e il <b>Giorno</b> (anche «Qualsiasi giorno»). La tabella ha le colonne <b>Il programma lo assegna?</b> (<b>Sì</b>; <b>Solo se serve</b> = solo dopo tutti gli altri e se la persona è sotto le sue ore; <b>No</b>), <b>Puoi assegnarlo tu?</b> (a mano), <b>Perché</b> e <b>Dove si cambia</b>; le righe sono raggruppate per risposta e, se il settore ha più aree, ogni gruppo di sigle porta il nome dell'area. I filtri in alto, ognuno con il suo numero: <b>Tutti</b>, <b>Il programma li assegna</b>, <b>Solo se serve</b>, <b>Non li assegna</b>, <b>A mano è diverso</b>. Nella vista per turno il riquadro <b>Cosa decide chi fa</b> elenca tutto quello che vale per quel turno (area e competenze, regole di gruppo, turni per funzione, persone con il turno bloccato). Il pulsante della colonna Dove si cambia porta al posto giusto, <b>evidenzia la riga</b> (la persona in Formazione o nelle Preferenze, la regola, la funzione) e una barra in basso spiega cosa fare e riporta indietro; anche la freccia Indietro del browser o del telefono torna alla pagina di prima. Fra gli abilitati la bozza sceglie poi con riposi, ore, vacanze, fabbisogno e regole del giorno.",
        '<b>Preferenze collaboratori</b> (Piano › Impostazioni, amministratore e chi ha il permesso Storico HR): una riga per persona con le sue eccezioni. Le colonne: Solo diurni, Solo notturni, Giorni di lavoro e quanti a settimana, Turni bloccati, Turni consentiti, Affiancato in, Aree abilitate (sola lettura, vengono da Formazione), Turni solo a mano; nei settori che li usano anche Preferisce (turno preferito) e Accoglienza.',
        '<b>Solo notturni e giorni di lavoro</b> (Piano · Impostazioni · Preferenze collaboratori): oltre a Solo diurni si può segnare Solo notturni (riceve solo turni notturni) e i giorni della settimana in cui uno lavora (es. solo V e S). Negli altri giorni non viene mai proposto: bozza, Migliora la bozza, generazione automatica, cerca cambio, copertura malattia e assenze. Nessuna spunta = tutti i giorni. Scrivendo a mano un turno contro la preferenza il programma avvisa; Controlla le regole segnala i turni già nel piano in giorni esclusi (es. rimasti da una bozza fatta prima di cambiare la preferenza: la bozza riempie solo le celle vuote, per rifarla si usa Svuota il mese e poi Prepara il mese).',
        '<b>Giorni a settimana</b> (Preferenze collaboratori, accanto ai giorni): quanti giorni di lavoro al massimo nella settimana lunedì-domenica. Con più giorni spuntati (es. G V S D e 3) il programma sceglie ogni settimana quali dare, così le domeniche libere ruotano. Se uno può lavorare la domenica e ha tanti giorni a settimana quanti quelli spuntati (es. solo V S D), il programma avvisa che le domeniche libere del regolamento non sono garantite. Il limite vale per bozza, Migliora la bozza, generazione automatica, cerca cambio, copertura malattia, Sistema le ore; Controlla le regole lo segnala. La colonna <b>Preferisce</b> compare nei settori che hanno il turno preferito (Regole, «Turno preferito»: L1 nelle Slots) e Accoglienza in quelli con turni di accoglienza.',
        '<b>Turni bloccati per chi non è formato</b> (Piano · Impostazioni · Preferenze collaboratori, amministratore): per ogni settore i turni che può fare solo chi copre certi reparti. Slots: S1 e S3, che danno le pause in cassa e reception, solo a chi copre SALA, REC e CASSA. Un reparto è coperto con la competenza certificata in Formazione oppure con turni di quel reparto lavorati nell\'ultimo anno. <b>Applica ora</b> mostra chi non ha i requisiti, con il motivo (es. "manca CASSA"), e blocca dopo la conferma. Ogni collaboratore nuovo, da qualsiasi strada, parte già con questi turni bloccati; all\'import Excel non chi nel file fa già turni di tutti quei reparti. Poi si cambiano a mano nella sua riga. I turni bloccati non vengono mai proposti (bozza, Migliora la bozza, Cerca cambio, coperture, formazioni), ma chi li scrive o li scambia a mano non riceve avvisi: restano turni di sala. L\'avviso "non formato" resta per un reparto davvero non formato (es. un turno di cassa a chi fa solo sala).',
        '<b>Turni solo a mano</b> (Piano · Impostazioni · Preferenze collaboratori): per chi non sta nella rotazione dei turni, per esempio la responsabile che fa ufficio. Bozza, Migliora la bozza, Sistema le ore, coperture e cambi non le propongono mai turni e la bozza non le riempie i giorni vuoti; i turni e i codici (ufficio, vacanze...) li scrive chi pianifica. Le ore contano come sempre: ore dovute, saldo, Controlla le regole.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: turni e codici',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Turni</b>: orari, ore, tipo diurno o notturno e colore. Sono <b>divisi per settore</b>, quindi due settori possono usare la stessa sigla senza confondersi.',
        '<b>La tabella dei turni</b> (Piano › Turni, amministratore; gli altri la vedono in sola lettura): per ogni turno <b>Codice</b>, <b>Area</b> (il gruppo di turni: SALA, CASSA, REC, TAVOLI, VALET...), <b>Inizio</b> e <b>Fine</b>, <b>Fine (chiusura 5)</b> per i giorni in cui si chiude alle 5, <b>Ore</b> (con accanto ore e minuti: 8.33 = 8h20), <b>Tipo</b> (DIURNO o NOTTURNO), <b>Colore</b> della sigla nel piano, <b>Oltre 23</b>, <b>Attivo</b> ed <b>Elimina</b>. Ogni cambio si salva subito.',
        '<b>+ Aggiungi turno</b> (sotto la tabella): si scrivono Codice, Area, Inizio, Fine e Ore e si preme il pulsante. Esempio Slots: codice S9, area SALA, 18:00-02:00, 8.25 ore. Esempio Valet: X8, area VALET. Il tipo e il colore si regolano poi nella riga.',
        "<b>Oltre 23</b>: la spunta dice che il turno finisce dopo le 23. Conta per la domenica libera: un sabato con un turno Oltre 23 fa perdere la domenica libera che segue (la domenica non è più «libera valida» e non conta per le 12 dell'anno). Esempio Tavoli: quasi tutti i turni della sera hanno la spunta, quindi per una domenica libera serve anche il sabato libero.",
        "<b>Attivo</b>: togliendo la spunta il turno non si propone più (bozza, cambi, coperture) e sparisce dagli elenchi di scelta del settore; le celle già scritte restano. Nella tabella dei turni resta in fondo, in grigio: rimettendo la spunta Attivo torna come prima. Prima di disattivarlo, o di cambiarne l'area o il tipo, il programma elenca cosa ne dipende (regole di gruppo, turni per funzione, competenze collegate, preferenze, fabbisogno futuro) e chiede conferma.",
        "<b>Corsi · inserimento automatico nel piano</b> (Piano › Turni): scegli corso, data e orario, poi i partecipanti. L'elenco è diviso per funzione e per ognuno dice com'è quel giorno nel piano (libero, turno con orario e se si sovrappone al corso, vacanza, malattia, riposo) e se ha già fatto il corso («Fatto il …» o «Mai fatto»). Filtri: Tutti, Liberi quel giorno, Non hanno ancora fatto il corso; «Seleziona il gruppo» spunta tutta una funzione.",
        '<b>Codici speciali</b> (V, M, C, CGF, ND, ASS e simili) sono comuni a tutti i settori.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: regole del piano',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Regole del piano</b>: ogni regola ha un nome in italiano semplice, un valore (numero oppure Sì / No), la colonna <b>Dove agisce</b> che dice in quali schermate conta, e sotto il nome tecnico con la <b>fonte</b> (RAP, direttiva 16-007, legge sul lavoro). Sono raggruppate per tema: riposo, domeniche, ore e saldo, festivi e recuperi, vacanze, ausiliari, funzioni, orari di chiusura, giorni chiusi, congedi non pagati. Se domani cambia il regolamento si aggiorna il numero, senza toccare il programma.',
        "<b>Riferimento normativo</b> (la scritta grigia sotto il nome della regola, per esempio «LL art. 15a · direttiva 16-007»): l'amministratore lo cambia con la <b>matita</b> accanto, per esempio quando cambia il RAP. Vale per tutti i settori, anche per le regole di legge, e cambia solo la scritta: la regola funziona come prima. Accanto compare «(modificato)»; <b>Rimetti il testo originale</b> torna a quello di partenza. Ogni modifica va nel Registro attività.",
        '<b>Impostazioni del motore</b> (scheda Regole, valori predefiniti finché non le cambi): <b>Funzioni esenti dai riposi attorno alla domenica e dal conto delle domeniche libere</b> (gruppo Domeniche, predefinito RESP): chi ha queste funzioni non riceve avvisi su quei riposi e sulle domeniche; vuoto = nessuno esente. <b>Chi non può più recuperare le domeniche libere nel mese non ne perde altre</b> (Domeniche, predefinito No): con No, se serve a coprire un posto la bozza può ancora fargli lavorare una domenica, per ultimo, e resta segnalato; con Sì la bozza non gli toglie altre domeniche libere, anche a costo di lasciare un posto scoperto. <b>Turno preferito</b> (Funzioni e turni, predefinito L1): le sigle dei turni che la bozza dà per primi a chi ha la spunta «Preferisce» nelle Preferenze collaboratori; vuoto = nessuno. <b>Quanto Migliora la bozza cerca di dividere le notti in modo uguale</b> (Riposo e giorni di lavoro, predefinito 3, 0 = spento). Tutte e quattro si possono cambiare per settore. La casella Attiva resta sempre accesa: si spengono con il valore (vuoto, 0 oppure No).',
        '<b>Per un settore</b>: nel menu in alto della scheda Regole scegli il settore (Slots, Tavoli, Valet, Cleaning) e cambia il numero nella riga: nasce da sola l\'eccezione per quel settore, gli altri tengono il valore generale. La colonna dice "eccezione" o "valore generale"; <b>Torna al generale</b> la toglie. Esempio: riposo minimo 11 ore ovunque, 12 ai Tavoli.',
        '<b>Controlli prima di salvare</b>: un valore fuori scala (riposo di 3 ore, 40 giorni consecutivi), un testo dove serve un numero, oppure una regola che cita turni o funzioni che in quel settore non esistono (per esempio "L1 e 9 solo a BO e SUP" ai Tavoli, dove L1 e 9 non ci sono) viene rifiutato con un avviso rosso che spiega il motivo, e resta il valore di prima. Lo stesso vale per le regole di gruppo: gruppo, funzione e formato vengono verificati sul settore.',
        "Le <b>regole di preferenza</b> della bozza (blocchi compatti, riposo isolato, notte poi turno del mattino, equilibrio delle notti e dei diurni, domeniche) cambiano l'ordine con cui il generatore sceglie le persone: si accendono e si spengono con Sì / No.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: regole di gruppo',
      vis: () => _guidaVis('piano'),
      righe: [
        '<b>Regole di gruppo, modulo guidato</b> (Piano · Regole, per ogni settore): scegli gruppo e tipo, compaiono i campi giusti (funzione o livello, numero, turni diurni o notturni, giorni con le caselle lun-dom) e sotto la frase di cosa farà la regola, per esempio "Almeno 2 SUP sui turni notturni nel gruppo SALA, ven, sab". Nella tabella ogni regola è scritta a parole, con Modifica ed Elimina. Il gruppo <b>tutti</b> vale anche per massimi e minimi di una funzione. Tutto si adatta al settore aperto: i turni da scegliere sono le sue posizioni (divise per gruppo), gli esempi usano le sue sigle e funzioni, i livelli arrivano fino al suo livello più alto.',
        "<b>I tipi di regola, per settore</b>: nella scheda <b>Regole di gruppo</b> ogni settore crea le sue, con le sue sigle e le sue funzioni, scegliendo il tipo dall'elenco. Due tipi coprono il \"chi fa cosa\": <b>Turni riservati a certe funzioni</b> (valore <code>L1,9:BO,SUP</code>: i turni L1 e 9 li fanno solo Back Office e Supervisor) e <b>Una funzione fa solo certi turni (per giorno)</b> (valore <code>SUP:Z*,L1,9:0,1,2,3</code>: da lunedì a giovedì i Supervisor fanno solo turni che iniziano con Z, oppure L1 e 9; <code>SUP:Z*,S*,L1,9:4,5</code>: venerdì e sabato anche i turni S). Gli altri tipi: <b>Funzioni che entrano nell'area senza abilitazione</b>, <b>Tipo di turno vietato nel gruppo</b>, <b>Requisito sulla scheda del collaboratore</b>, <b>Massimo di una funzione al giorno</b>, <b>Massimo persone di una funzione al mese</b>, <b>Minimo di una funzione al mese</b>, <b>Minimo di una funzione al giorno</b>, <b>Turni al mese nell'area per persona (se possibile)</b>, <b>Turni per livello di Formazione</b>, <b>Minimo di un livello al giorno</b>, <b>Minimo con una competenza al giorno</b>, <b>Equilibrio dei livelli nelle fasce orarie</b>, <b>Turni riservati a collaboratori scelti</b> e <b>Coordinatori (apertura e chiusura)</b>. Ai Tavoli la stessa regola si scrive con le sigle dei Tavoli. Eccezione voluta: le funzioni della regola <b>Funzioni che a mano possono fare qualsiasi turno</b> (funzioni_fanno_tutto, predefinite SUP, SOSTRESP e RESP) a mano possono fare qualsiasi turno, come in Formazione il livello alto comprende quelli sotto: scrivere un turno di cassa a un Supervisor non dà l'avviso «non formato». Se la regola si lascia vuota, nessuno è esente e l'avviso vale per tutti. La <b>bozza automatica</b> invece segue sempre le regole del settore. Il programma verifica che gruppo, funzioni e sigle esistano nel settore prima di salvare.",
        "<b>Turni riservati a collaboratori scelti</b> (Regole di gruppo): si sceglie il turno (es. AX) e si spuntano le persone che possono farlo; tutti gli altri no. Chi è spuntato fa quei turni anche se la sua funzione da sola non lo permetterebbe (es. un Supervisor che fa anche l'accoglienza); restano le sue preferenze (turni bloccati, solo diurni, giorni di lavoro). Vale per tutto il settore: bozza, Migliora la bozza, proposte di cambio, Perché manca qualcuno; Controlla le regole segnala il turno scritto a qualcun altro. Rinominando un collaboratore il nome si aggiorna anche nella regola. Nel modulo i collaboratori si cercano scrivendo il nome e compaiono come etichette (la x li toglie); i turni mostrati sono quelli del gruppo scelto, gli altri gruppi si aprono sotto.",
        "<b>Minimo con una competenza al giorno</b> (Regole di gruppo): almeno N persone che hanno una competenza di Formazione, anche una specialità senza livello (es. Poker), con filtri facoltativi: tipo di turno, giorni della settimana, fascia oraria (es. 22:00-02:00; dopo la mezzanotte vale la stessa serata). C'è anche il campo facoltativo dei turni: per esempio almeno 1 persona con Accoglienza su S5 e S31 (dei due S5, uno è accoglienza). La bozza preferisce chi ha la competenza finché il minimo non c'è; Controlla le regole segnala i giorni che restano sotto.",
        "<b>Turni al mese nell'area per persona (se possibile)</b>: per esempio nell'area BO ogni SUP almeno 1 turno al mese, per non dimenticarlo. La bozza ci prova, non è un obbligo: non lascia scoperto un posto per farlo.",
        '<b>Turni per livello di Formazione</b> (Piano · Regole · Regole di gruppo, amministratore): il livello di ognuno è quello di Formazione, cioè il gradino più alto certificato (anche se parziale: chi ha Cassa senza Sala vale L3). Regola <b>Turni per livello</b>, es. <code>10,10C,9:L2</code> = quei turni dal livello L2 in su, <code>1,21:L1-L2</code> = solo L1 e L2. Regola <b>Minimo di un livello al giorno</b>, es. <code>L3:2:NOTTURNO:4,5</code> = venerdì e sabato almeno 2 persone di livello L3 o più sui turni notturni. Sotto ogni regola il numero di persone che la soddisfano (in rosso se troppo poche). Eccezioni per persona in Preferenze collaboratori, <b>Turni consentiti</b>. Le usano bozza, Migliora la bozza, generazione automatica, cerca cambio, copertura malattia e Controlla le regole; a mano un avviso. Quando qualcuno sale di livello in Formazione i turni si aprono da soli.',
        '<b>Equilibrio dei livelli nelle fasce orarie</b> (Regole di gruppo): si scrivono le fasce (es. 14-18, 18-22, 22-02, 02-05), da quale livello di Formazione uno conta come forte, quanti forti servono in ogni fascia e lo scarto massimo del livello medio della fascia da quello del giorno. La bozza, alla fine, scambia turni fra un forte di una fascia che ne ha in più e uno più debole della fascia scoperta, solo fra turni messi da lei e con tutte le regole valide; Controlla le regole segnala le fasce che restano sbilanciate (es. giorno 12, 02:00-05:00: 0 di livello L6 o più). Ogni livello deve avere i suoi turni indicati (riga Turni che può fare in Formazione › Imposta livelli e specialità, o in Piano › Impostazioni), altrimenti non abilita ai turni.',
        "<b>Coordinatori</b> (Piano · Regole · Regole di gruppo, tipo <b>Coordinatori</b>, per esempio nel Valet): scegli i turni di apertura (es. X1) e di chiusura (es. X3 e X4) e, con le caselle, i collaboratori che fanno da coordinatore, in ordine di preferenza. Ogni giorno c'è un coordinatore di giorno fra chi ha l'apertura e uno di notte fra chi ha la chiusura (vale il turno che finisce più tardi: X4 venerdì e sabato, X3 gli altri giorni). La bozza mette prima i coordinatori scelti su quei turni; se un giorno non ce n'è nessuno disponibile, ne propone un altro fra chi fa il turno e Controlla le regole lo segnala. Il coordinatore esce in rosso nel piano e nel briefing da solo (il colore è quello delle Evidenziazioni con \"coord\" nel significato); se colori a mano una cella di apertura o chiusura, per quel giorno vale la tua scelta. La regola si modifica o si elimina come le altre; rinominando un collaboratore si aggiorna da sola.",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: collaboratori e copertura di altri settori',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni collaboratore appartiene a <b>un settore</b>: lì ha contratto, percentuale e ore dovute, e la percentuale resta una sola. Se copre i buchi anche in un altro settore, servono tre passi.',
        '<b>1. Imposta copertura</b>: Impostazioni generali › Gestione collaboratori › clic sul nome › <b>Altre azioni</b> › <b>Imposta copertura</b>. Nella finestra Copertura altri settori si spunta il settore dove può andare e, per quel settore, il <b>Massimo turni al mese</b> (vuoto = nessun limite), <b>Solo questi gruppi di turni</b> e <b>Lavora accompagnato in questo settore</b>. Poi Salva.',
        "<b>2. Spunta la competenza nella Formazione del settore che riceve</b>: si sceglie in alto il settore che riceve la copertura e si apre la pagina <b>Formazione</b>. Nella matrice Chi sa fare cosa compare anche chi copre, con l'etichetta azzurra <b>copre da</b> e il suo settore (es. «Balliu · copre da Slots» nella Formazione del Valet). Nella sua riga si spunta la competenza di quel settore (per Balliu: Servizio Valet). Senza questa spunta la bozza non lo usa mai in quel settore.",
        "<b>3. Verifica con Chi può fare cosa</b>: Piano › Regole › Chi può fare cosa, con la persona scelta. Per i turni del settore deve comparire Sì o Solo se serve; se il motivo dice che l'area non è abilitata, manca la spunta in Formazione.",
        "Chi copre compare nella griglia dell'altro settore con l'etichetta azzurra <b>copre</b>, e nei due piani vedi sempre gli stessi turni: così nessuno può essere prenotato due volte lo stesso giorno.",
        'Le coperture le usa solo <b>Sistema › Copri i buchi con altri settori</b>, dopo che tutti i settori hanno preparato il loro mese, e solo per i posti rimasti scoperti. Esempi: Slots → Valet (Balliu copre il Valet al massimo 4 volte al mese, gruppo VALET); Tavoli: un collega degli Slots che copre i Tavoli deve avere spuntato il livello dei Tavoli che gli serve.',
        "<b>Gestione collaboratori</b> (Impostazioni): l'elenco si legge soltanto; un clic sul nome apre la scheda, dove si cambiano impiego, categoria, funzione, percentuale, lingue, date e settore, e si conferma con <b>Salva</b> (Annulla non cambia nulla). Copertura di altri settori, Rinomina e Disattiva sono nella stessa scheda, sotto <b>Altre azioni</b>.",
        "<b>Disattivare un collaboratore che lascia e fine contratto</b> (amministratore): Impostazioni > Gestione collaboratori > clic sul nome > Disattiva (in Altre azioni) chiede l'ultimo giorno di lavoro (proposto oggi). Con Fine contratto (consigliato) fino a quel giorno resta tutto (piano, ore, saldo, Diario, storico); dal giorno dopo non è più nel calendario dei mesi dopo, nella bozza, nella generazione, nelle coperture e nei cambi e non ha ore dovute. Diario, scheda, storico, vacanze e CGF restano. I turni già scritti dopo quella data vengono segnalati (nel mese della fine i giorni dopo sono a righe grigie) e restano finché non li sposti; le celle dopo la data non si modificano più, né a mano né incollando: si possono solo svuotare. Nell'elenco compare il bollino fine contratto. La stessa data si vede anche nella scheda del collaboratore, sotto Inizio contratto (pulsante + Fine contratto e Storico HR): la scrive o la toglie solo chi ha il permesso Storico HR, modificare, chi lo vede soltanto legge la data. Togliendo la data il collaboratore torna operativo. Rimuovi del tutto è solo per chi non è mai entrato o è stato inserito per errore. Per cambiare la data o togliere la fine contratto: nella stessa scheda, Altre azioni, <b>Cambia</b> (la finestra propone la data salvata e la scelta Torna operativo). Importando il piano Excel: chi è disattivato resta disattivato e le sue celle non si importano; a chi ha una fine contratto non si importano le celle dopo quella data; chi non compare nel file si propone di fermarlo con la fine contratto all'ultimo giorno del mese prima (non più disattivato del tutto).",
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: chi può vedere e modificare le schede',
      vis: () => _guidaVis('piano'),
      righe: [
        'Da <b>Impostazioni · Visibilità e permessi</b> ogni scheda del Piano si regola in due modi separati: <b>chi la vede</b> (sezione "Piano · schede visibili") e <b>chi la può modificare</b> (sezione "Piano · schede modificabili").',
        'Tre stati possibili per ogni operatore: <b>nascosta</b> (sparisce dal menu), <b>solo lettura</b> (la vede ma i comandi di modifica sono spenti), <b>visibile e modificabile</b>.',
        'La restrizione di modifica vale <b>in aggiunta</b> ai permessi esistenti: chi non ha "Piano di lavoro" non modifica comunque, e l\'admin vede e modifica sempre tutto.',
        'La <b>Guida</b> resta visibile a tutti di default. E ogni operatore continua a lavorare solo sui collaboratori del <b>suo settore</b>: queste regole decidono cosa si vede, la separazione dei dati resta quella dei settori.',
        "Le scritture automatiche (es. la malattia registrata dal Diario che si sincronizza nel piano) non c'entrano con le schede e passano sempre.",
        'Le schede <b>Regole</b> e <b>Festivi</b> si danno con permessi propri: un amministratore li assegna in <b>Impostazioni › Visibilità e permessi</b> scegliendo «Operatori selezionati» (es. il responsabile del settore o HR). Chi non ha il permesso legge un messaggio che dice cosa serve e a chi chiederlo. Allo stesso modo le <b>categorie professionali</b> (5ª-1ª) hanno un permesso per vederle e uno per assegnarle.',
        "<b>Azioni automatiche del piano</b>, sei permessi (Impostazioni > Visibilità e permessi; oltre ai quattro qui sotto anche Fabbisogno e Affiancamenti), oltre a poter modificare il piano: <b>Preparare il mese (bozza)</b> (Prepara il mese, Migliora la bozza, Prepara con il motore avanzato, Copri i buchi con altri settori, Sistema le ore, Controlla le regole, Svuota il mese), <b>Vacanze e CGF automatici</b> (importa e applica le vacanze del mese, assegna i CGF del mese), <b>Import da file</b> (piano, fabbisogno, timbrature), <b>Cancellazioni di massa</b> (piano intero anche le celle protette, tutte le vacanze, svuota il fabbisogno). Senza il permesso il bottone non compare e il database rifiuta l'azione. Esportare resta libero. Il <b>fabbisogno</b> lo vedono tutti; modificarlo (celle, incolla, copia dal mese prima, import, svuota) richiede il permesso <b>Modificare il fabbisogno</b>. All'inizio questi permessi li hanno Responsabile e Sostituto. Tutto il lavoro di ogni giorno resta a chiunque può modificare il piano (Modificare il piano), anche dopo la generazione: qualsiasi cella anche protetta, malattie e coperture, cambi turno e richieste per esigenze, lucchetto, commenti, colori, la V di una persona dagli Avvisi.",
      ],
    },
    {
      area: 'hr',
      titolo: 'Formazione e competenze',
      vis: () => _guidaVis('formazione'),
      righe: [
        '<b>Protocolli di formazione</b>: sono i documenti Word originali della cartella <b>Formazione</b> di Piano &gt; Formulari, gli stessi file: per ogni competenza (cassa, reception, sala...) il bottone Apri Word scarica il protocollo giusto, identico, da stampare, compilare e firmare. Un formulario caricato o sostituito in quella cartella compare subito qui. Il registro in Excel per importare punti e voti resta come scelta facoltativa.',
        'La <b>matrice delle competenze</b> mostra chi sa fare cosa: le spunte segnano le competenze certificate e i livelli raggiunti.',
        "<b>Il livello</b> è il gradino più alto certificato, scritto con numero e nome (es. <b>L3 · Cassa</b>). Se mancano gradini sotto è segnato <b>parziale</b> con cosa manca (es. «parziale — manca Sala, Reception»), ma per il Piano vale lo stesso: chi arriva da un altro casinò e fa subito cassa conta come L3. Passando il mouse sul livello si vede l'elenco delle competenze comprese. <b>Senza livello</b> è solo chi non ha nessuna competenza della scala. Punti, premi e passaggi di livello invece contano solo la scala completa: un livello parziale non dà premi finché non si completano i gradini sotto. Quando si spunta un gradino e quelli sotto sono vuoti, il programma chiede ogni volta: «Sì, formazione completa» spunta anche i gradini sotto (come sempre, con punti e premi), «No, solo Cassa (esperienza già fatta)» spunta solo quel gradino e il livello resta parziale; Annulla o Esc non cambia niente. La stessa domanda compare quando si certifica una competenza dal Piano.",
        "<b>Livelli e specialità</b> (amministratore): pulsante <b>Imposta livelli e specialità</b> in cima a Formazione. Si apre una finestra solo per il settore aperto: ogni livello della scala ha il suo nome (quello della voce, oppure uno scritto a mano, con l'anteprima del badge mentre si scrive) e la riga <b>Turni che può fare</b>, lo stesso dato di Piano › Impostazioni. Con «Sposta in» una voce cambia livello o diventa una specialità.",
        "<b>Livelli senza turni</b>: se un livello non ha i turni indicati, il Piano non lo usa; in cima a Formazione compare l'avviso («Per questo livello non è indicato quali turni può fare…») con il pulsante <b>Indica i turni</b>, che apre la finestra dei livelli.",
        'In Formazione, se il settore non ha la scala o quasi tutti sono senza livello (nessuna competenza di livello), compare <b>Come iniziare</b> (3 passi).',
        "Nella stessa finestra: <b>Aggiungi un livello o una specialità</b> la mette in un livello che c'è già o in un livello nuovo in cima alla scala; se il nome esiste già, il programma sposta quella che c'è (le spunte restano). Le <b>specialità (senza livello)</b> stanno in un riquadro a parte e non contano per il livello (per esempio un gioco particolare). Con le frecce si cambia l'ordine delle voci dello stesso livello nella matrice. Due competenze con lo stesso nome (es. Ispettore Tavolo e Ispettore tavolo) sono segnalate: <b>Tieni questa</b> tiene quella scelta (nome e livello) e le passa le spunte dell'altra, formatori, gruppo di turni e modello degli Affiancamenti compresi, poi toglie l'altra (il programma chiede conferma, poi ricalcola il livello dei collaboratori). Lo stesso ordine vale nella matrice, negli Affiancamenti del piano e nelle Preferenze.",
        '<b>Persone per livello</b>: ogni persona è contata una volta, al gradino più alto certificato. «Senza livello» sono le persone senza nessuna competenza di livello, da classificare; «Scala incompleta» conta a parte chi ha un livello parziale (es. ha ISP 3, manca ISP 1). Un clic su un conteggio filtra la matrice; i totali per competenza sono in fondo alla matrice.',
        "<b>Proponi livelli in base ai turni fatti</b> (pulsante in cima a Formazione): chi nel piano importato (o scritto a mano) fa turni di un settore per cui non risulta formato, per esempio reception con solo il livello 1, riceve la competenza e quelle dei livelli sotto. Prima compare l'elenco (persona, livello prima e dopo, quanti turni, incentivo e premio del livello) e si conferma; poi Formazione, Storico HR e punti sono aggiornati come con la spunta a mano. I turni con la nota formazione o affiancamento non contano (si sta ancora imparando). Succede da solo dopo l'import del piano; per chi c'è già: Formazione, pulsante <b>Proponi livelli in base ai turni fatti</b> (ultimi 12 mesi e piano già scritto). Un livello non scende mai.",
        '<b>Livello 1 ai nuovi collaboratori</b>: chi entra senza nessun livello (importazione del piano o dei collaboratori, Diario, Gestione collaboratori, formazioni) riceve subito il <b>livello 1 della scala del suo settore</b>, cioè le competenze messe al livello 1 in Imposta livelli e specialità (oggi Sala Slot negli Slots, Servizio Valet al Valet, Pulizia sale al Cleaning; ai Tavoli il primo gradino della scala impostata). Se la scala cambia, vale il nuovo livello 1. Così bozza e proposte lo mettono solo nei turni del primo gradino (negli Slots la sala, turni S) finché in Formazione non gli si danno altri livelli. Vale anche quando un collaboratore passa a un settore dove non ha livelli. I RESP restano esclusi.',
        "<b>Chi copre da un altro settore</b> compare nella matrice del settore che riceve la copertura, con l'etichetta azzurra <b>copre da</b> e il suo settore. Lì si spunta la competenza di quel settore: senza la spunta la bozza non lo usa. Tutti i passi sono nel capitolo «Piano: collaboratori e copertura di altri settori».",
        "<b>Importa da Excel</b>: nella finestra <b>Imposta livelli e specialità</b>, riquadro «Importa le spunte da Excel». Un file con un collaboratore per riga e un livello o una specialità per colonna, con la X dove la persona la sa fare (per esempio il file dei Tavoli con SUP, DI, ISP, CR, poker...). Si sceglie il foglio, il programma trova la riga dei titoli e la colonna dei nomi; per ogni colonna si sceglie la competenza di Formazione che corrisponde, oppure una nuova specialità (senza livello) o \"non importare\" (le scelte restano per la volta dopo). Con <b>Chi ha un livello ha anche tutti quelli sotto</b> un ISP 3 riceve anche ISP 2 e ISP 1. L'<b>anteprima</b> mostra per ogni persona il livello prima e dopo e le competenze aggiunte e tolte; i nomi che non ci sono si possono creare come nuovi. Ogni persona riceve una nota nello storico. <b>Annulla l'ultimo import</b> riporta le competenze com'erano.",
        'Al completamento di un livello (tutti i gradini fino a lì certificati) il programma assegna i punti previsti e avvisa la persona interessata.',
        'I <b>punti e i premi</b> seguono le azioni configurate (coperture, cambi turno, formazioni svolte) e sono consultabili nella scheda del collaboratore.',
        'Ogni assegnazione di punti richiede la <b>conferma del responsabile</b>: nessun punto parte da solo. Il programma controlla anche i <b>doppioni</b>: se la stessa persona ha già ricevuto punti per lo stesso motivo, o altri punti nello stesso giorno, appare un avviso e si decide se procedere.',
        "<b>Dove si impostano gli incentivi</b> (amministratore): in fondo alla pagina Formazione, riquadro <b>Configurazione incentivi e premi</b>. Ci sono: <b>Incentivi attivi</b> (l'interruttore generale); <b>Azioni e punti</b> (per esempio Copertura turno (malattia) 10 punti, Cambio turno accettato 5, ognuna con la sua spunta, Rinomina e Rimuovi, + Aggiungi per una nuova); <b>Soglie premi</b> (punti annuali, premio, quanti al mese, oggetto dell'inventario scalato alla consegna); <b>Inventario premi</b>; <b>Punti al raggiungimento del livello</b> e <b>Premi passaggio livello</b> (dal livello 2); <b>Notifiche incentivi</b> (privato, annuncio a tutti o disattivate). Il <b>Report Incentivi PDF</b> per HR è nel riquadro Traguardi e premi.",
        '<b>Punti e premi del passaggio di livello, per settore</b> (stesso riquadro, voce <b>Valori per</b> e il nome del settore aperto): si sceglie <b>Uguali per tutti i settori</b> oppure <b>Propri di</b> quel settore. Con «Uguali» i valori valgono per numero di livello in tutti i settori: accanto a ogni livello si legge come si chiama nel settore aperto (es. «Livello 3 (Slots: Cassa)»; al Valet, che ha due gradini, «(non esiste in Valet)»). Con «Propri» il settore parte dai punti e premi di tutti i settori e li cambia solo per sé; un premio lasciato vuoto vuol dire nessun premio in quel settore. Tornando a «Uguali per tutti i settori» il programma chiede conferma e i valori propri si cancellano. Esempio: i Tavoli scelgono Propri di Tavoli e danno 30 punti al Livello 3 (ISP 1), mentre gli Slots restano sui valori comuni. Azioni, soglie premi e inventario restano uguali per tutti. Un livello parziale non dà punti né premi finché non si completano i gradini sotto.',
        "Con l'interruttore generale spento non vengono assegnati punti e non appare nessun popup in tutto il programma. Si può anche spegnere una <b>singola azione</b> (per esempio solo la copertura malattia) lasciando attive le altre. Lo storico dei punti già assegnati resta consultabile.",
        'Il cerca cambio per il giorno libero <b>non</b> assegna punti: è uno scambio alla pari tra colleghi.',
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
        'Lo <b>storico HR</b> raccoglie categoria, impiego, premi, livelli, formazioni e giubilei, con anzianità e date. È riservato a chi ha il permesso.',
        'Questi dati sono riservati: non vanno condivisi con chi non ha il permesso di vederli.',
      ],
    },
    {
      area: 'admin',
      titolo: 'Impostazioni del programma',
      vis: () => _guidaAdmin(),
      righe: [
        "<b>Scarica scheda da compilare</b> (accanto, in Visibilità e permessi): scarica un file già spuntato con i permessi di adesso, uno per operatore, con caselle Sì/No modificabili, note e firme (anche col dito). Chi decide lo apre nel browser, cambia le caselle (le modifiche si colorano), firma e preme <b>Salva copia compilata</b>: il file che torna all'amministratore mostra cosa cambiare. Il file non cambia niente nel programma: i permessi si cambiano poi in Visibilità e permessi.",
        "<b>L'elenco dei permessi</b> (Impostazioni › Visibilità e permessi): oltre alle <b>pagine</b> (Rapporto, Note Colleghi, Statistiche, Moduli, Formazione, Piano di lavoro, Assistente, Consegna Turno, Promemoria, Costi Maison, Inventario, Registro attività) e alle <b>funzioni</b> (ricerca globale, avvisi di cassa e di rischio, testi pronti, firma digitale, codice QR, intelligenza artificiale nei moduli), ci sono i permessi di modifica: Punti e premi; Impiego (jolly o fisso); Categorie, assegnare e vedere; Competenze (spunte in matrice); Valutazioni, inserire e vedere; Formazioni svolte; Piano di lavoro, modificare; Piano, preparare il mese (bozza); Piano, vacanze e CGF automatici; Piano, importare da file; Piano, pianificare formazioni (Affiancamenti); Piano, modificare il fabbisogno; Piano, cancellazioni di massa; Regole del piano; Festivi e CGF; Giorni chiusi; Andamento delle malattie; <b>Corsi</b> (pianificare i corsi nel piano); <b>Briefing</b> (compilare il foglio del giorno e le pause); Storico HR, vedere e modificare; Istruzioni del settore, modificare; Modelli dei documenti, modificare. Infine, per ogni scheda del Piano, chi la vede e chi la modifica.",
        'Ogni voce si imposta scegliendo <b>Tutti</b>, <b>Solo admin</b>, <b>Operatori selezionati</b> (per nome) oppure <b>Nascosto</b>. Esempio: il permesso Briefing a operatori selezionati, i supervisori, così compilano il foglio del giorno senza poter cambiare la griglia dei turni.',
        '<b>Stampa scheda permessi</b> (in Visibilità e permessi): produce il foglio con lo stato REALE dei permessi, operatore per operatore, con profilo, settori e accessi extra, pronto per la stampa o il PDF. Serve per farlo controllare a chi decide chi può vedere e fare cosa.',
        "<b>Sessioni</b>: ogni dispositivo ha la sua sessione, che si rinnova da sola con il token che possiede; aprire il programma sul telefono non fa uscire dal PC. Se il rinnovo non è possibile compare un avviso e si rientra con la password. Lo <b>sblocco biometrico</b> si riattiva dalle Impostazioni (durata e regole nel capitolo «Dettagli utili in tutto il programma»): il dispositivo ha un segreto che il server verifica, quindi nessuno può ottenere una sessione con il solo nome dell'operatore.",
        "Le impostazioni di configurazione (visibilità, profili, settori, punti, soglie, moduli, opzioni del piano) le salva solo una sessione amministratore: il server lo verifica, non basta l'interfaccia. Ogni salvataggio fallito viene segnalato con un avviso rosso, mai in silenzio.",
        "La pagina Impostazioni è divisa in quattro schede (Persone, Accessi, Settori e moduli, Dati): si vede solo il gruppo scelto, con le chip delle sue sezioni sotto le schede; il programma ricorda l'ultima scheda aperta.",
        '<b>Settori</b>: si creano, rinominano e si scelgono le pagine attive per ognuno.',
        "<b>Modelli dei documenti</b> (Settori e moduli): l'elenco dei documenti stampati con i testi cambiati, chi e quando, e il pulsante Modifica per ognuno. Come si usano è spiegato nel capitolo «Moduli e formulari».",
        "<b>Identità del programma</b> (Settori e moduli, solo amministratore): nome del programma, nome dell'azienda, sigla, riga sopra il titolo, logo (caricato dal computer, ridotto da solo) e due colori facoltativi. Valgono nella testata, nella schermata di accesso, nel titolo della pagina e nelle intestazioni e nei piè di pagina dei PDF e delle stampe; l'anteprima mostra il risultato prima di salvare. I colori vengono adattati per restare leggibili nel tema chiaro e scuro. <b>Rimetti i valori predefiniti</b> riporta tutto com'era (poi Salva). La casella <b>Mostra il proprietario del programma in fondo alla pagina</b> accende o spegne la riga del proprietario (testo fisso, non modificabile, mai in stampa); di base è spenta.",
        '<b>Nome nei documenti</b> (in Settori): il nome ufficiale del settore che compare nei documenti stampati, per esempio <b>FoBoSlot</b> per Slots. Nei menu resta il nome breve. Vale per i fogli di cambio turno (anche quelli già archiviati), il formulario vuoto, la stampa del Piano, il briefing, le coperture, i crediti, le vacanze e le valutazioni. Vuoto = nome breve.',
        '<b>Profili personalizzati</b> (Visibilità e permessi): oltre ai cinque profili fissi del documento firmato si creano altre figure, per esempio Compliance o Segretariato: si parte da una copia di un profilo esistente, si decide voce per voce Modifica, Vede o No, si salva. Il profilo compare nel menu accanto agli altri, "Applica i profili" lo tratta allo stesso modo e la scheda permessi stampata lo mostra con il suo nome. I cinque profili fissi non si possono modificare.',
        '<b>Nuovo operatore</b>: nel modulo di creazione la casella "Posizione e permessi" assegna subito un profilo (fisso o personalizzato) e lo applica, oppure copia gli accessi di un collega (profilo, accessi extra, voci selezionate; il settore se non scelto), oppure apre la tabella di un nuovo profilo personalizzato che al salvataggio viene assegnato all\'operatore appena creato.',
        '<b>Visibilità e permessi</b>: si decide chi vede cosa, pagina per pagina e funzione per funzione, anche per singolo operatore.',
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
        "In <b>Impostazioni → Stato del sistema</b> il bottone <b>Controlla il sistema</b> verifica i dati e dice cosa non torna: impiego mancante, nomi con turni ma senza scheda, disattivati che hanno ancora turni, festivi dell'anno prossimo, schede di prova rimaste.",
        "Da lì partono due strumenti: <b>Assegna l'impiego adesso</b>, che compila fisso o jolly per tutti quelli che non ce l'hanno, e <b>Sistema questi nomi</b>, che crea la scheda mancante, sposta i turni sul collaboratore giusto oppure elimina le righe che non sono persone.",
        'Il <b>Registro</b> elenca chi ha modificato cosa e quando. I dati eliminati restano nel <b>Cestino</b> e si recuperano.',
        "CONSERVAZIONE: il regolamento aziendale impone di tenere i dati del personale per almeno <b>5 anni</b>, e la legge chiede lo stesso per piani e registrazioni degli orari: gli archivi non vanno svuotati prima. Le voci che rientrano nell'archivio non si possono eliminare definitivamente: restano nel Cestino e si ripristinano quando serve. Si possono invece cancellare davvero le voci inserite da poco (correzione di errori di battitura). Anni e finestra di correzione si impostano in Impostazioni, sezione Conservazione dei dati.",
      ],
    },
  ];
}

// GRUPPI DELL INDICE (ondata 3): 46 argomenti in un muro di pulsanti erano difficili da
// scorrere. L indice e diviso in gruppi con un titolo; i capitoli nuovi senza posto nella
// tabella vanno nel gruppo della loro area.
const GUIDA_GRUPPI = [
  { id: 'inizio', titolo: 'Primi passi' },
  { id: 'diario', titolo: 'Diario e turno' },
  { id: 'locale', titolo: 'Maison, inventario e strumenti' },
  { id: 'piano-giorno', titolo: 'Piano: lavoro di ogni giorno' },
  { id: 'piano-regole', titolo: 'Piano: regole, conti e preparazione del mese' },
  { id: 'piano-settore', titolo: 'Piano: impostare il settore' },
  { id: 'persone', titolo: 'Collaboratori e formazione' },
  { id: 'admin', titolo: 'Impostazioni e dati' },
];
const _GUIDA_GRUPPO_DI = {
  'Da dove iniziare': 'inizio',
  'Home: riepilogo e report': 'inizio',
  'Dettagli utili in tutto il programma': 'inizio',
  'Istruzioni del settore: come si scrivono': 'inizio',
  'Compleanni: dove compaiono e chi ci finisce': 'inizio',
  'Diario delle attività': 'diario',
  'Rapporto giornaliero': 'diario',
  'Consegna del turno': 'diario',
  Promemoria: 'diario',
  'Chat e note tra colleghi': 'diario',
  'Moduli e formulari': 'diario',
  'Maison e budget clienti': 'locale',
  Inventario: 'locale',
  'Statistiche del Diario e report': 'locale',
  'Assistente (scrittura veloce)': 'locale',
  'Piano: le schede una per una': 'piano-giorno',
  'Piano: calendario': 'piano-giorno',
  'Piano: avvisi del mese': 'piano-giorno',
  'Piano: briefing e pause': 'piano-giorno',
  'Piano: malattia (cosa fare e come conta)': 'piano-giorno',
  'Piano: cambi turno, coperture e restituzioni': 'piano-giorno',
  'Piano: vacanze': 'piano-giorno',
  'Piano: crediti': 'piano-giorno',
  'Piano: timbrature e saldo ore': 'piano-giorno',
  'Piano: recupero ore (griglia giornaliera)': 'piano-giorno',
  'Piano: giorni chiusi (il passato si corregge solo con motivo)': 'piano-giorno',
  'Piano: congedi non pagati': 'piano-giorno',
  'Piano: affiancamenti (pianificare, proposte di cambi, storico)': 'piano-giorno',
  'Piano: storico e versioni del mese': 'piano-giorno',
  'Piano: stampare ed esportare': 'piano-giorno',
  'Piano: preparare il mese': 'piano-regole',
  'Piano: regole di legge (riposi, domeniche, ore della settimana)': 'piano-regole',
  'Piano: fabbisogno (quante persone per turno)': 'piano-regole',
  'Piano: import dai file Excel': 'piano-regole',
  'Piano: festivi, CGF e supplementi': 'piano-regole',
  'Piano: festività e orari di chiusura (CH5 e CH7)': 'piano-regole',
  'Piano: controllo delle durate dei turni (in ore e minuti)': 'piano-regole',
  'Piano: turni che finiscono più tardi (es. Z0)': 'piano-regole',
  'Piano: correggere il saldo del mese (ore reali)': 'piano-regole',
  'Piano: giorni di vacanza spettanti': 'piano-regole',
  'Piano: organico (quante persone servono)': 'piano-regole',
  'Cosa si imposta per settore': 'piano-settore',
  'Piano: chi fa cosa (funzioni, turni per funzione, preferenze)': 'piano-settore',
  'Piano: turni e codici': 'piano-settore',
  'Piano: regole del piano': 'piano-settore',
  'Piano: regole di gruppo': 'piano-settore',
  'Piano: collaboratori e copertura di altri settori': 'piano-settore',
  'Piano: chi può vedere e modificare le schede': 'piano-settore',
  'Piano: benessere dei collaboratori': 'persone',
  'Scheda del collaboratore: pagine, permessi, malattie e data di nascita': 'persone',
  'Formazione e competenze': 'persone',
  'Valutazioni e storico HR': 'persone',
  'Intelligenza artificiale: quale usare': 'admin',
  'Impostazioni del programma': 'admin',
  'Controllo e manutenzione': 'admin',
};
function _guidaGruppo(c) {
  if (_GUIDA_GRUPPO_DI[c.titolo]) return _GUIDA_GRUPPO_DI[c.titolo];
  return (
    { inizio: 'inizio', home: 'inizio', diario: 'diario', piano: 'piano-giorno', hr: 'persone' }[c.area] || 'admin'
  );
}
// nell indice di un gruppo "Piano" il prefisso "Piano:" e gia nel titolo del gruppo
function _guidaEtichetta(c, gruppo) {
  const t = /^piano-/.test(gruppo) ? c.titolo.replace(/^Piano: /, '') : c.titolo;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// area: se passata, mostra solo i capitoli di quell'area (es. 'piano')
function renderGuidaHtml(area) {
  const cap = GUIDA_CAPITOLI().filter(
    (c) => (!area || c.area === area || (area === 'piano' && c.area === 'inizio')) && (!c.vis || c.vis()),
  );
  if (!cap.length)
    return '<div class="main-card"><div style="padding:16px">Nessuna guida disponibile per il tuo profilo.</div></div>';
  const idDi = (t) => 'guida-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const vai = (c) =>
    'onclick="document.getElementById(\'' + idDi(c.titolo) + "').scrollIntoView({behavior:'smooth',block:'start'})\"";
  const gruppi = GUIDA_GRUPPI.map((g) => ({ ...g, cap: cap.filter((c) => _guidaGruppo(c) === g.id) })).filter(
    (g) => g.cap.length,
  );
  const inizio = cap.find((c) => c.titolo === 'Da dove iniziare');
  const istr = _istrGuidaHtml();
  let h =
    '<div class="guida-radice"><div class="main-card guida-indice"><div class="card-header guida-testa"><span>Guida del programma</span><span class="guida-strumenti" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;min-width:0;flex:1 1 auto"><input type="search" class="campo-cerca" placeholder="Cerca nella guida (es. CGF, malattia, pause)" aria-label="Cerca nella guida" oninput="guidaCerca(this)" autocomplete="off"><select class="guida-stampa-scelta" aria-label="Cosa stampare" title="Cosa stampare" style="padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:var(--fs-sm,.8125rem);max-width:100%"><option value="tutta">Tutta la guida</option><option value="parte">Solo il capitolo aperto o la ricerca</option></select><button type="button" class="btn-export" onclick="guidaStampa(this)" title="Stampa su fogli A4 o salva in PDF" style="font-size:var(--fs-sm,.8125rem);padding:6px 12px;white-space:nowrap"><i class="icx icx-stampa"></i> Stampa guida</button></span></div><div class="guida-indice-corpo">' +
    (inizio
      ? '<button type="button" class="guida-inizio" data-cap="' +
        idDi(inizio.titolo) +
        '" ' +
        vai(inizio) +
        '><span class="guida-inizio-tit">È la prima volta? Parti da qui</span><span class="guida-inizio-sub">Da dove iniziare: come è fatto il programma, cosa si salva da solo, Annulla, ricerca e dimensione del testo</span></button>'
      : '') +
    istr.voce +
    '<p class="guida-nota">Qui trovi solo gli argomenti che riguardano quello che puoi fare tu.</p>' +
    gruppi
      .filter((g) => g.cap.some((c) => c !== inizio))
      .map(
        (g) =>
          '<section class="guida-gruppo" data-gruppo="' +
          g.id +
          '"><h3 class="guida-gruppo-tit">' +
          escP(g.titolo) +
          '</h3><div class="guida-voci">' +
          g.cap
            .filter((c) => c !== inizio)
            .map(
              (c) =>
                '<button type="button" class="guida-voce" data-cap="' +
                idDi(c.titolo) +
                '" ' +
                vai(c) +
                '>' +
                escP(_guidaEtichetta(c, g.id)) +
                '</button>',
            )
            .join('') +
          '</div></section>',
      )
      .join('') +
    '</div></div>' +
    istr.capitolo;
  gruppi.forEach((g) => {
    h += '<h2 class="guida-sezione" data-gruppo="' + g.id + '">' + escP(g.titolo) + '</h2>';
    g.cap.forEach((c) => {
      h +=
        '<div class="main-card guida-cap" id="' +
        idDi(c.titolo) +
        '" data-gruppo="' +
        g.id +
        '"><div class="card-header">' +
        escP(c.titolo) +
        '</div><div class="guida-cap-corpo">' +
        c.righe.map((r) => '<p class="guida-riga">' + r + '</p>').join('') +
        '</div></div>';
    });
  });
  return (
    h +
    '<p class="guida-nessuno" hidden style="padding:14px;color:var(--muted)">Nessun argomento contiene questa parola.</p></div>'
  );
}
// RICERCA NELLA GUIDA: restano visibili solo le righe che contengono la parola
// (in tutti i capitoli), i capitoli senza righe si nascondono; nell indice restano le voci
// dei capitoli trovati e i gruppi che ne hanno almeno una
function guidaCerca(inp) {
  const radice = inp.closest('.guida-radice');
  if (!radice) return;
  const q = inp.value.trim().toLowerCase();
  let tot = 0;
  const trovati = new Set();
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
    if (!cap.hidden) trovati.add(cap.id);
    tot += n || titoloOk ? 1 : 0;
  });
  radice.querySelectorAll('[data-cap]').forEach((b) => (b.hidden = !trovati.has(b.dataset.cap)));
  radice.querySelectorAll('.guida-gruppo').forEach((g) => {
    g.hidden = !g.querySelector('.guida-voce:not([hidden])');
  });
  radice.querySelectorAll('.guida-sezione').forEach((h) => {
    h.hidden = !radice.querySelector('.guida-cap[data-gruppo="' + h.dataset.gruppo + '"]:not([hidden])');
  });
  const nessuno = radice.querySelector('.guida-nessuno');
  if (nessuno) nessuno.hidden = !q || tot > 0;
}

// STAMPA DELLA GUIDA (richiesta del titolare 12/10/2026): stessa strada delle altre stampe
// (Crediti, scheda permessi): finestra nuova con un foglio HTML pronto e la stampa del
// browser, da cui si salva anche il PDF. A4 verticale, logo e nome dell identita del
// programma, titolo, versione, elenco dei capitoli numerati, capitoli che non si spezzano
// male, numero di pagina in fondo, niente pulsanti. "Tutta la guida" stampa tutti i
// capitoli che chi legge puo vedere; "Solo il capitolo aperto o la ricerca" stampa i
// capitoli trovati dalla ricerca (con le sole righe trovate) oppure il capitolo in vista.
async function _guidaVersione() {
  try {
    const r = await fetch('sw.js', { cache: 'no-store' });
    if (r.ok) {
      const m = /CACHE_NAME\s*=\s*['"][^'"]*?(v\d+)['"]/.exec(await r.text());
      if (m) return m[1];
    }
  } catch (e) {}
  try {
    if (window.caches) {
      const n = (await caches.keys())
        .map((k) => /diario-cl-v(\d+)/.exec(k))
        .filter(Boolean)
        .map((m) => parseInt(m[1]));
      if (n.length) return 'v' + Math.max(...n);
    }
  } catch (e) {}
  return '';
}
// il capitolo in vista: quello che occupa la parte alta dello schermo
function _guidaCapInVista(radice) {
  const caps = [...radice.querySelectorAll('.guida-cap')].filter((c) => !c.hidden && c.offsetParent !== null);
  const soglia = Math.min(160, window.innerHeight / 3);
  return caps.find((c) => c.getBoundingClientRect().bottom > soglia) || caps[0] || null;
}
// testo di un capitolo, senza pulsanti (le istruzioni del settore hanno Modifica)
function _guidaCorpoStampa(cap, soloVisibili) {
  const corpo = cap.querySelector('.guida-cap-corpo');
  if (!corpo) return '';
  const copia = corpo.cloneNode(true);
  copia.querySelectorAll('button, input, select, textarea, script').forEach((x) => x.remove());
  // istruzioni del settore: in stampa solo i settori che le hanno scritte
  copia.querySelectorAll('section').forEach((x) => {
    if (x.querySelector('.istr-vuoto') && !x.querySelector('.istr-corpo')) x.remove();
  });
  if (soloVisibili) copia.querySelectorAll('.guida-riga[hidden]').forEach((x) => x.remove());
  copia.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  copia.querySelectorAll('[onclick],[style]').forEach((x) => {
    x.removeAttribute('onclick');
    x.removeAttribute('style');
  });
  return copia.innerHTML;
}
function _guidaStampaHtml(radice, modo, versione) {
  const id = typeof identita === 'function' ? identita() : { programma: 'Diario Collaboratori', azienda: '' };
  let logo = '';
  try {
    logo = id.logoUrl ? new URL(id.logoUrl, location.href).href : '';
  } catch (e) {}
  const q = ((radice.querySelector('.guida-testa .campo-cerca') || {}).value || '').trim();
  let caps = [...radice.querySelectorAll('.guida-cap')];
  let sottotitolo = 'Tutta la guida';
  let soloRighe = false;
  if (modo === 'parte') {
    if (q) {
      caps = caps.filter((c) => !c.hidden);
      soloRighe = true;
      sottotitolo = 'Risultati della ricerca «' + q + '»';
    } else {
      const c = _guidaCapInVista(radice);
      caps = c ? [c] : [];
      sottotitolo = 'Capitolo';
    }
  } else caps = caps.filter((c) => !(c.classList.contains('guida-istr') && c.hidden));
  // titolo del gruppo dell indice per ogni capitolo
  const nomiGruppo = {};
  GUIDA_GRUPPI.forEach((g) => (nomiGruppo[g.id] = g.titolo));
  nomiGruppo.istr = 'Istruzioni del settore';
  const voci = caps
    .map((c) => ({
      gruppo: c.dataset.gruppo || '',
      titolo: ((c.querySelector('.card-header') || {}).textContent || '').trim(),
      corpo: _guidaCorpoStampa(c, soloRighe),
    }))
    .filter((v) => v.titolo && v.corpo.trim());
  if (modo === 'parte' && !q && voci[0]) sottotitolo = 'Capitolo «' + voci[0].titolo + '»';
  const oggi = new Date().toLocaleDateString('it-IT');
  const cssStr = (t) => '"' + String(t).replace(/["\\\n]/g, ' ') + '"';
  const piede = id.programma + ' · Guida del programma' + (versione ? ' · ' + versione : '');
  let indice = '';
  let corpo = '';
  let gruppoPrima = null;
  voci.forEach((v, i) => {
    const n = i + 1;
    if (v.gruppo !== gruppoPrima) {
      if (gruppoPrima !== null) indice += '</ol>';
      indice += '<h3>' + escP(nomiGruppo[v.gruppo] || '') + '</h3><ol start="' + n + '">';
      if (v.gruppo !== 'istr') corpo += '<h2 class="gruppo">' + escP(nomiGruppo[v.gruppo] || '') + '</h2>';
      gruppoPrima = v.gruppo;
    }
    indice += '<li>' + escP(v.titolo) + '</li>';
    const righe = (v.corpo.match(/class="guida-riga"/g) || []).length;
    corpo +=
      '<section class="cap' +
      (righe <= 4 && v.corpo.length < 2200 ? ' breve' : '') +
      '"><h3 class="cap-tit"><span class="num">' +
      n +
      '</span>' +
      escP(v.titolo) +
      '</h3>' +
      v.corpo +
      '</section>';
  });
  if (gruppoPrima !== null) indice += '</ol>';
  const titoloDoc = 'Guida del programma · ' + id.programma;
  return (
    '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>' +
    escP(titoloDoc) +
    '</title><style>' +
    '@page{size:A4 portrait;margin:16mm 15mm 18mm 15mm;@bottom-left{content:' +
    cssStr(piede) +
    ';font:8.5pt Georgia,serif;color:#6c655a}@bottom-right{content:"Pagina " counter(page) " di " counter(pages);font:8.5pt Georgia,serif;color:#6c655a}}' +
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'body{font-family:Georgia,"Times New Roman",serif;color:#1c1a17;font-size:10.5pt;line-height:1.45;margin:0;background:#fff;font-variant-numeric:lining-nums}' +
    '.testa{display:flex;align-items:center;gap:16px;border-bottom:2px solid #8b6914;padding-bottom:10px;margin-bottom:14px}' +
    '.testa img{max-height:48px;max-width:150px;object-fit:contain}' +
    '.testa .az{font:600 8.5pt Calibri,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8b6914}' +
    'h1{font-size:21pt;font-weight:normal;margin:2px 0 2px;color:#3b2a14}' +
    '.sotto{color:#5e5446;font-size:9.5pt}' +
    '.indice{border:1px solid #d9cdb4;background:#f6f0e4;padding:10px 14px 6px;margin:0 0 6px;column-count:2;column-gap:22px;font-size:9pt;line-height:1.35}' +
    '.indice h3{font:600 8.5pt Calibri,Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8b6914;margin:6px 0 2px;break-after:avoid}' +
    '.indice ol{margin:0 0 4px;padding-left:22px}.indice li{break-inside:avoid}' +
    '.indice-tit{font:600 10pt Calibri,Arial,sans-serif;margin:0 0 4px;column-span:all}' +
    'h2.gruppo{font-size:14pt;font-weight:normal;color:#8b6914;border-bottom:1px solid #d9cdb4;padding-bottom:3px;margin:20px 0 4px;break-after:avoid}' +
    'section.cap{margin:0 0 10px}section.cap.breve{break-inside:avoid}' +
    'h3.cap-tit{font-size:12pt;color:#3b2a14;margin:12px 0 5px;break-after:avoid}' +
    'h3.cap-tit .num{display:inline-block;min-width:24px;color:#8b6914}' +
    '.guida-riga,.istr-corpo p,.istr-corpo li{margin:0 0 5px;orphans:3;widows:3;break-inside:avoid}' +
    'p.guida-riga{padding-left:12px;text-indent:-12px}p.guida-riga::before{content:"\\2022";display:inline-block;width:12px;text-indent:0;color:#8b6914}' +
    'code{font-family:Consolas,monospace;font-size:9pt;background:#f1ece2;padding:0 3px}' +
    '.istr-settore h4,.istr-corpo h4,.istr-corpo h5{font-size:10.5pt;margin:8px 0 3px;break-after:avoid}' +
    '.istr-elenco{margin:0 0 6px;padding-left:20px}' +
    '@media screen{body{max-width:190mm;margin:14px auto;padding:0 10px}}' +
    '</style></head><body>' +
    '<div class="testa">' +
    (logo ? '<img src="' + escP(logo) + '" alt="">' : '') +
    '<div><div class="az">' +
    escP(id.azienda || '') +
    '</div><h1>Guida del programma</h1><div class="sotto">' +
    escP(id.programma) +
    (versione ? ' · versione ' + escP(versione) : '') +
    ' · ' +
    escP(sottotitolo) +
    ' · stampata il ' +
    escP(oggi) +
    '</div></div></div>' +
    (voci.length > 1 ? '<div class="indice"><p class="indice-tit">Indice dei capitoli</p>' + indice + '</div>' : '') +
    (voci.length ? corpo : '<p>Nessun capitolo da stampare.</p>') +
    '</body></html>'
  );
}
async function guidaStampa(btn) {
  const radice = btn && btn.closest ? btn.closest('.guida-radice') : document.querySelector('.guida-radice');
  if (!radice) return;
  const scelta = radice.querySelector('.guida-stampa-scelta');
  const modo = scelta ? scelta.value : 'tutta';
  // la finestra si apre subito (dentro il clic, o il browser la blocca), poi si riempie
  const w = window.open('', '_blank');
  if (!w) {
    toastErrore('Il browser ha bloccato la finestra: consenti le finestre a comparsa per questo sito');
    return;
  }
  const versione = await _guidaVersione();
  w.document.write(_guidaStampaHtml(radice, modo, versione));
  w.document.close();
  const stampa = () => setTimeout(() => w.print(), 300);
  const img = w.document.querySelector('img');
  if (img && !img.complete) {
    img.onload = stampa;
    img.onerror = stampa;
  } else stampa();
  if (typeof logAzione === 'function') logAzione('Guida stampata', modo === 'tutta' ? 'tutta la guida' : 'una parte');
}

function renderGuida() {
  const el = document.getElementById('guida-content');
  if (el) el.innerHTML = renderGuidaHtml();
}

// ================================================================
// ISTRUZIONI DEL SETTORE (v452): le regole interne di ogni settore, scritte e aggiornate
// dai responsabili senza chiedere a uno sviluppatore. Stanno in cima alla Guida.
// Database: tabella istruzioni_settore (migrazione 20260914), lette e scritte solo con
// leggi_istruzioni_settore / salva_istruzioni_settore, che controllano permesso e settore.
// Il testo e Markdown ridotto (titoli, elenchi, grassetto): si mostra SEMPRE come testo
// scappato, mai come HTML scritto da qualcuno.
// ================================================================
let _istrCache = null; // [{ settore, testo, aggiornato_da, aggiornato_il }]
let _istrCaricamento = null;
const ISTR_MAX = 20000;
// permesso delegabile "Istruzioni del settore: modificare" (predefinito: solo amministratore).
// Come puoModificare, ma senza la sola lettura del settore extra aperto: il settore conta
// per ogni blocco (vedi _istrSettori)
function _istrHaPermesso() {
  if (_guidaAdmin()) return true;
  const cfg = typeof visibilitaConfig !== 'undefined' ? visibilitaConfig : {};
  const v = cfg.gestione_istruzioni || 'admin';
  if (v === 'admin' || v === 'nascosto') return false;
  if (typeof v === 'object' && v.tipo === 'selezionati')
    return !!(v.operatori && v.operatori.includes(typeof getOperatore === 'function' ? getOperatore() : ''));
  return true;
}
// settori di chi legge (scrittura: solo gli accessi extra con modifica), come
// _settori_operatore nel database: amministratore e chi lavora in tutti i settori = tutti
function _istrSettori(scrittura) {
  const tutti = typeof getReparti === 'function' ? getReparti().map((r) => r.key) : [];
  if (_guidaAdmin()) return tutti;
  const op = typeof getOperatore === 'function' ? getOperatore() : '';
  const mappa = typeof operatoriRepartoMap !== 'undefined' ? operatoriRepartoMap : {};
  const proprio = mappa[op] || 'entrambi';
  if (proprio === 'entrambi') return tutti;
  const out = [proprio];
  const extra = (typeof _accessiExtraDi === 'function' && _accessiExtraDi(op)) || {};
  Object.keys(extra).forEach((k) => {
    const v = extra[k];
    if (!scrittura || (v && typeof v === 'object' && v.modifica === true)) out.push(k);
  });
  return out.filter((k, i) => out.indexOf(k) === i && tutti.includes(k));
}
function istrPuoScrivere(settore) {
  return _istrHaPermesso() && _istrSettori(true).includes(settore);
}
async function _istrCarica() {
  if (_istrCaricamento) return _istrCaricamento;
  const tk = typeof getOpToken === 'function' ? getOpToken() : null;
  if (!tk) return _istrCache || [];
  _istrCaricamento = (async () => {
    try {
      const r = await _conSessione((t) => _rpcSicura('leggi_istruzioni_settore', { p_token: t }), tk);
      _istrCache = Array.isArray(r) ? r : [];
    } catch (e) {
      // database senza la migrazione 20260914 o rete caduta: la Guida resta com era
      if (_istrCache == null) _istrCache = [];
    }
    _istrCaricamento = null;
    return _istrCache;
  })();
  return _istrCaricamento;
}
function _istrDi(settore) {
  return (_istrCache || []).find((x) => x.settore === settore) || null;
}
function _istrQuando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return (
    p(d.getDate()) +
    '.' +
    p(d.getMonth() + 1) +
    '.' +
    d.getFullYear() +
    ' alle ' +
    p(d.getHours()) +
    ':' +
    p(d.getMinutes())
  );
}
// MARKDOWN RIDOTTO -> HTML sicuro: ogni riga e prima scappata (escP), poi si riconoscono
// solo titoli (# e ##), elenchi (- oppure 1.) e grassetto (**testo**). Nient altro.
function istrMarkdownHtml(testo) {
  const righe = String(testo || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  let h = '';
  let lista = null;
  let par = [];
  const inline = (s) => escP(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const chiudiPar = () => {
    if (par.length) h += '<p class="guida-riga">' + par.map(inline).join('<br>') + '</p>';
    par = [];
  };
  const chiudiLista = () => {
    if (lista) h += '</' + lista + '>';
    lista = null;
  };
  const apriLista = (tipo) => {
    chiudiPar();
    if (lista !== tipo) {
      chiudiLista();
      h += '<' + tipo + ' class="istr-elenco">';
      lista = tipo;
    }
  };
  righe.forEach((r) => {
    const t = r.trim();
    let m;
    if (!t) {
      chiudiPar();
      chiudiLista();
    } else if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
      chiudiPar();
      chiudiLista();
      h += '<h4 class="istr-tit' + (m[1].length > 1 ? ' istr-tit2' : '') + '">' + inline(m[2]) + '</h4>';
    } else if ((m = t.match(/^[-*•]\s+(.+)$/))) {
      apriLista('ul');
      h += '<li class="guida-riga">' + inline(m[1]) + '</li>';
    } else if ((m = t.match(/^\d{1,3}[.)]\s+(.+)$/))) {
      apriLista('ol');
      h += '<li class="guida-riga">' + inline(m[1]) + '</li>';
    } else {
      chiudiLista();
      par.push(t);
    }
  });
  chiudiPar();
  chiudiLista();
  return h;
}
// contenuto della card: un blocco per settore (prima quello aperto), solo i settori con
// istruzioni scritte o che chi legge puo scrivere. '' = niente da mostrare
function _istrCorpoHtml() {
  const lettura = _istrSettori(false);
  const cur = typeof currentReparto !== 'undefined' ? currentReparto : '';
  const ordine = lettura.slice().sort((a, b) => (a === cur ? -1 : b === cur ? 1 : 0));
  const blocchi = ordine
    .map((k) => {
      const r = _istrDi(k);
      const scritte = r && String(r.testo || '').trim();
      const puo = istrPuoScrivere(k);
      if (!scritte && !puo) return '';
      const nome = typeof repartoLabel === 'function' ? repartoLabel(k) : k;
      return (
        '<section class="istr-settore" data-settore="' +
        escP(k) +
        '"><div class="istr-testa"><h3 class="istr-nome">' +
        escP(nome) +
        '</h3>' +
        (r && r.aggiornato_da
          ? '<span class="istr-agg">Ultima modifica: ' +
            escP(r.aggiornato_da) +
            ', ' +
            escP(_istrQuando(r.aggiornato_il)) +
            '</span>'
          : '') +
        (puo
          ? '<button type="button" class="btn-export istr-modifica" onclick="istrApriEditor(\'' +
            _jsArg(k) +
            '\')"><i class="icx icx-modifica"></i> ' +
            (scritte ? 'Modifica' : 'Scrivi le istruzioni') +
            '</button>'
          : '') +
        '</div>' +
        (scritte
          ? '<div class="istr-corpo">' + istrMarkdownHtml(r.testo) + '</div>'
          : '<p class="istr-vuoto">Non ci sono ancora istruzioni per ' +
            escP(nome) +
            '. Scrivi qui le regole interne del settore: come si apre e si chiude il turno, chi chiamare, cosa controllare.</p>') +
        '</section>'
      );
    })
    .filter(Boolean);
  return blocchi.join('');
}
// riempie (o toglie) card e voce dell indice in tutte le guide aperte
function _istrAggiornaDom() {
  const corpo = _istrCorpoHtml();
  document.querySelectorAll('.guida-radice').forEach((radice) => {
    const card = radice.querySelector('#guida-istruzioni-del-settore');
    const voce = radice.querySelector('.guida-istr-voce');
    if (!corpo) {
      [card, voce].forEach((x) => x && x.remove());
      return;
    }
    if (card) {
      card.querySelector('.guida-cap-corpo').innerHTML = corpo;
      card.hidden = false;
    }
    if (voce) voce.hidden = false;
  });
}
// parte della Guida: voce evidenziata nell indice + capitolo in cima, riempiti appena
// arrivano le istruzioni dal database (subito dalla memoria se gia lette)
function _istrGuidaHtml() {
  const vai =
    "onclick=\"document.getElementById('guida-istruzioni-del-settore').scrollIntoView({behavior:'smooth',block:'start'})\"";
  setTimeout(() => _istrCarica().then(_istrAggiornaDom), 0);
  return {
    voce:
      '<button type="button" class="guida-inizio guida-istr-voce" data-cap="guida-istruzioni-del-settore" hidden ' +
      vai +
      '><span class="guida-inizio-tit"><i class="icx icx-clipboard"></i> Istruzioni del settore</span><span class="guida-inizio-sub">Le regole interne del tuo settore, scritte e aggiornate dai responsabili</span></button>',
    capitolo:
      '<div class="main-card guida-cap guida-istr" id="guida-istruzioni-del-settore" data-gruppo="istr" hidden><div class="card-header">Istruzioni del settore</div><div class="guida-cap-corpo">' +
      (_istrCache ? _istrCorpoHtml() : '') +
      '</div></div>',
  };
}
// EDITOR: casella di testo con i pulsanti per titolo, elenco e grassetto e l anteprima
// accanto (come apparira nella Guida). Salva solo chi ha il permesso nel settore; se nel
// frattempo un collega ha salvato, il database rifiuta e il testo resta nella finestra.
async function istrApriEditor(settore) {
  if (!istrPuoScrivere(settore)) {
    toastErrore(
      'Per modificare le istruzioni di questo settore serve il permesso "Istruzioni del settore: modificare".',
    );
    return;
  }
  await _istrCarica();
  const r = _istrDi(settore);
  const atteso = r ? r.aggiornato_il : null;
  const nome = typeof repartoLabel === 'function' ? repartoLabel(settore) : settore;
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box istr-editor" role="dialog" aria-modal="true" aria-labelledby="istr-ed-tit">' +
    '<h3 id="istr-ed-tit"></h3>' +
    '<p class="istr-ed-aiuto">Scrivi in parole semplici. <b># Titolo</b> a inizio riga fa un titolo, <b>- </b> un elenco puntato, <b>1. </b> un elenco numerato, <b>**parola**</b> il grassetto. Una riga vuota separa i paragrafi.</p>' +
    '<div class="istr-ed-barra">' +
    '<button type="button" data-f="tit" title="Titolo (# a inizio riga)">Titolo</button>' +
    '<button type="button" data-f="ul" title="Elenco puntato (- a inizio riga)">Elenco</button>' +
    '<button type="button" data-f="ol" title="Elenco numerato (1. a inizio riga)">Elenco numerato</button>' +
    '<button type="button" data-f="b" title="Grassetto (**testo**)"><b>G</b> Grassetto</button>' +
    '<span class="istr-ed-conta"></span></div>' +
    '<div class="istr-ed-due"><label class="istr-ed-col"><span>Testo</span><textarea class="istr-ed-testo" spellcheck="true" maxlength="' +
    ISTR_MAX +
    '"></textarea></label>' +
    '<div class="istr-ed-col"><span>Anteprima</span><div class="istr-ed-anteprima istr-corpo"></div></div></div>' +
    '<p class="istr-ed-ultima"></p>' +
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no">Annulla</button><button type="button" class="finestra-ok">Salva</button></div></div>';
  velo.querySelector('h3').textContent = 'Istruzioni del settore · ' + nome;
  const ta = velo.querySelector('textarea');
  const prev = velo.querySelector('.istr-ed-anteprima');
  const conta = velo.querySelector('.istr-ed-conta');
  ta.value = r ? r.testo || '' : '';
  velo.querySelector('.istr-ed-ultima').textContent =
    r && r.aggiornato_da
      ? 'Ultima modifica: ' + r.aggiornato_da + ', ' + _istrQuando(r.aggiornato_il)
      : 'Ancora nessuna istruzione salvata.';
  const aggiorna = () => {
    prev.innerHTML = istrMarkdownHtml(ta.value) || '<p class="istr-vuoto">L\'anteprima compare qui.</p>';
    conta.textContent = ta.value.length + ' / ' + ISTR_MAX;
  };
  ta.addEventListener('input', aggiorna);
  aggiorna();
  // pulsanti di formato: agiscono sulle righe selezionate (o sulla riga del cursore)
  velo.querySelector('.istr-ed-barra').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    const f = b.dataset.f;
    const v = ta.value;
    let s = ta.selectionStart;
    let fine = ta.selectionEnd;
    if (f === 'b') {
      const sel = v.slice(s, fine) || 'testo';
      ta.setRangeText('**' + sel + '**', s, fine, 'end');
    } else {
      s = v.lastIndexOf('\n', s - 1) + 1;
      const fineRiga = v.indexOf('\n', fine);
      fine = fineRiga < 0 ? v.length : fineRiga;
      const righe = v.slice(s, fine).split('\n');
      const nuove = righe.map((x, i) => {
        const pulita = x.replace(/^(#{1,3}\s+|[-*•]\s+|\d{1,3}[.)]\s+)/, '');
        return (f === 'tit' ? '# ' : f === 'ul' ? '- ' : i + 1 + '. ') + pulita;
      });
      ta.setRangeText(nuove.join('\n'), s, fine, 'end');
    }
    ta.focus();
    aggiorna();
  });
  const originale = ta.value;
  const chiudi = () => {
    document.removeEventListener('keydown', tasti, true);
    velo.remove();
  };
  // chiudere senza salvare: se il testo e cambiato, prima si chiede
  const annulla = async () => {
    if (
      ta.value !== originale &&
      !(await chiediConferma('Chiudere senza salvare? Le modifiche al testo andranno perse.'))
    )
      return;
    chiudi();
  };
  const tasti = (e) => {
    // una conferma aperta sopra l editor risponde lei ai tasti
    if (e.key !== 'Escape' || document.querySelectorAll('.finestra-velo').length > 1) return;
    e.preventDefault();
    e.stopPropagation();
    annulla();
  };
  const salva = async () => {
    const ok = velo.querySelector('.finestra-ok');
    ok.disabled = true;
    try {
      const tk = getOpToken();
      const esito = await _conSessione(
        (t) =>
          _rpcSicura('salva_istruzioni_settore', {
            p_token: t,
            p_settore: settore,
            p_testo: ta.value.replace(/\s+$/, ''),
            p_atteso: atteso,
          }),
        tk,
      );
      chiudi();
      toast(esito && esito.invariato ? 'Nessuna modifica da salvare' : 'Istruzioni di ' + nome + ' salvate');
      _istrCache = null;
      await _istrCarica();
      _istrAggiornaDom();
    } catch (e) {
      ok.disabled = false;
      toastErrore('Istruzioni non salvate: ' + ((e && e.message) || 'errore'), 9000);
    }
  };
  velo.querySelector('.finestra-no').addEventListener('click', annulla);
  velo.querySelector('.finestra-ok').addEventListener('click', salva);
  document.addEventListener('keydown', tasti, true);
  document.body.appendChild(velo);
  ta.focus();
}
