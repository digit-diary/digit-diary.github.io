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
        "Se una cosa non ti torna, in fondo a ogni pagina trovi la spiegazione qui nella Guida: usa l'indice in alto per saltare all'argomento.",
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
      ],
    },
    {
      area: 'diario',
      titolo: 'Moduli e formulari',
      vis: () => _guidaVis('moduli'),
      righe: [
        'Raccolta dei moduli compilabili e stampabili del settore, con archivio a cartelle per Word, PDF ed Excel.',
        'I moduli generati restano archiviati e si possono ristampare in qualsiasi momento.',
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
      area: 'piano',
      titolo: 'Piano: calendario',
      vis: () => _guidaVis('piano'),
      righe: [
        'Ogni riga e un collaboratore, ogni colonna un giorno. <b>Clicca una cella</b> e scrivi la sigla del turno (Invio salva, Esc annulla, cella vuota cancella). Le sigle inesistenti vengono rifiutate.',
        '<b>Tasto destro</b> o pressione lunga su una cella: modifica, commento, cambio turno con un collega, cambio per esigenze operative, rimozione, stampa.',
        "Si seleziona come in Excel: trascinando col mouse, oppure cliccando l'intestazione di un giorno per l'intera colonna. Sulla selezione funzionano <b>Canc</b> (con conferma), <b>Ctrl+C</b> e i colori.",
        'La barra in basso a destra mostra <b>somma, media, minimo e massimo</b> delle celle selezionate. Vale anche per le colonne delle ore, dove con Ctrl+click prendi celle sparse.',
        'Le <b>frecce Annulla e Ripristina</b> in alto tornano indietro fino a 15 passaggi e diventano blu quando c e qualcosa da annullare. Il bottone rosso <b>Annulla tutto</b> riporta il mese a com era a inizio sessione.',
        'Segni nelle celle: triangolo = commento, <b>M</b> = malattia dal Diario, <b>MC</b> = malattia su giorno di congedo, <b>MCG</b> = malattia sul giorno di recupero festivo, che resta a credito.',
        'Colonne finali: Ore, D e N (diurni e notturni), OD (ore dovute), OP (ore pianificate), SM (saldo del mese), YTD (saldo da inizio anno). Si aggiornano da sole a ogni modifica.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: generare il mese',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        "L'ordine giusto e: <b>Vacanze</b> (applica al piano) → <b>Fabbisogno</b> (quante persone per turno) → <b>Genera bozza</b> → <b>Valida regole</b> → se serve <b>Completa con coperture</b>.",
        '<b>Genera bozza</b> riempie il fabbisogno usando solo i collaboratori del settore e ti elenca i posti rimasti scoperti.',
        '<b>Completa con coperture</b> compare solo se qualcuno e abilitato a coprire da un altro settore: tappa i buchi rimasti rispettando i limiti della sua scheda. Va usato dopo aver generato i piani degli altri reparti.',
        '<b>Valida regole</b> elenca le violazioni (riposi, giorni consecutivi, idoneita, ore fuori tolleranza). <b>Migliora ore</b> riequilibra chi e lontano dal proprio obiettivo.',
        '<b>Cancella piano</b> agisce solo sul mese e sul settore che stai guardando: puoi togliere solo le celle generate oppure tutte, e in ogni caso si torna indietro con la freccia Annulla.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: briefing e pause',
      vis: () => _guidaVis('piano'),
      righe: [
        'La data parte da <b>domani</b>. <b>Compila dal piano</b> riempie nomi e turni del giorno; ogni cella si modifica, ogni riga ha il piu per inserire sotto, le frecce per riordinare e la crocetta per eliminare.',
        'I <b>numeri di cassa</b> si assegnano da soli con la regola "chi chiude riapre": le casse che finiscono piu tardi aprono il giorno dopo di presto. Restano modificabili a mano.',
        'Le colonne <b>E</b> e <b>U</b> restano vuote apposta: si spuntano a penna sul foglio stampato.',
        'Per colorare o evidenziare: <b>clicca la cella</b> per marcarla, con Ctrl aggiungi le altre, poi <b>Colora</b> applica il colore della barretta, la freccia ne sceglie un altro, <b>G</b> mette il grassetto e <b>C</b> il corsivo.',
        '<b>Genera pause</b> crea la distribuzione delle pause; anche queste si modificano cella per cella. Le stampe sono in PDF A4, sempre su un foglio solo.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: vacanze',
      vis: () => _guidaVis('piano'),
      righe: [
        'Le vacanze si assegnano a <b>settimane intere</b> (da lunedi a domenica) per collaboratore e per anno.',
        '<b>Applica al piano</b> scrive le V protette, i congedi C prima e dopo la vacanza in base alla percentuale e il giorno diurno obbligato prima della partenza.',
        'Le regole aziendali da rispettare: settimane a blocchi di sette giorni, nei settori con piu di otto persone si pianifica in vacanza uno ogni otto o nove collaboratori, nei settori piu piccoli mai piu di due contemporaneamente.',
        'Le vacanze si <b>importano dal file HR</b> sia in Excel sia in PDF: il programma riconosce i collaboratori dai nomi, anche con refusi o abbreviazioni, e mostra chi ha trovato prima di sostituire.',
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
        '<b>Regole del piano</b>: i valori normativi con accanto <b>la fonte</b> (RAP, direttiva interna 16-007, legge sul lavoro) e la colonna che dice dove vengono applicati. Se domani cambia il regolamento si aggiorna il numero, senza toccare il programma.',
        '<b>Regole di gruppo</b>: chi puo lavorare in ogni gruppo del proprio settore, con minimi e limiti per funzione.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: festivi, CGF e supplementi',
      vis: () => _guidaVis('piano'),
      righe: [
        'I <b>festivi</b> sono quelli ufficiali del Canton Ticino e si generano da soli per qualsiasi anno futuro aprendo la scheda Festivi.',
        'Il <b>CGF</b> e il recupero per il lavoro nei giorni festivi. Per il regolamento aziendale spetta al <b>personale fisso</b> e solo per i festivi diversi dalla domenica.',
        'I <b>jolly non maturano CGF</b>: ricevono il <b>supplemento del 50%</b> sul salario orario quando lavorano un festivo parificato alla domenica. Nelle Statistiche c e la colonna con i giorni da passare alle paghe.',
        'Se la persona si ammala nel giorno del recupero, il CGF non risulta goduto e il credito resta.',
        'Il conteggio di maturati, goduti e saldo parte da gennaio e serve anche a controllare se nei mesi passati i recuperi sono stati dati.',
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
      area: 'piano',
      titolo: 'Piano: timbrature e saldo ore',
      vis: () => _guidaVis('piano'),
      righe: [
        'Le timbrature si inseriscono a mano, si importano da file oppure arrivano in automatico dalla timbratrice.',
        'Nel confronto si clicca un collaboratore per vedere giorno per giorno entrata, uscita e ore effettive rispetto a quelle pianificate.',
        'Nel <b>Saldo</b> valgono le ore timbrate quando esistono, altrimenti quelle del piano. Il saldo da inizio anno si chiama YTD.',
      ],
    },
    {
      area: 'piano',
      titolo: 'Piano: import dai file Excel',
      vis: () => _guidaVis('piano') && _guidaPuo('puoGestirePiano'),
      righe: [
        '<b>Importa piano</b> legge il file dei piani del settore: riconosce il foglio del mese, le colonne dei giorni e i nomi anche con piccoli refusi. Le celle gia presenti non vengono toccate.',
        'Se nel file ci sono collaboratori nuovi li crea, quelli disattivati ma presenti te li propone da riattivare, quelli attivi ma assenti te li propone da disattivare. Ogni passo ha la sua conferma.',
        '<b>Importa fabbisogno</b> legge la sezione di pianificazione dello stesso file e sostituisce il fabbisogno del mese.',
      ],
    },
    {
      area: 'hr',
      titolo: 'Formazione e competenze',
      vis: () => _guidaVis('formazione'),
      righe: [
        'La <b>matrice delle competenze</b> mostra chi sa fare cosa: le spunte segnano le competenze certificate e i livelli raggiunti.',
        'Al completamento di un livello il programma assegna i punti previsti e avvisa la persona interessata.',
        'I <b>punti e i premi</b> seguono le azioni configurate (coperture, cambi turno, formazioni svolte) e sono consultabili nella scheda del collaboratore.',
        "Ogni assegnazione di punti richiede la <b>conferma del responsabile</b>: nessun punto parte da solo. Il programma controlla anche i <b>doppioni</b>: se la stessa persona ha gia' ricevuto punti per lo stesso motivo, o altri punti nello stesso giorno, appare un avviso e si decide se procedere.",
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
        '<b>Settori</b>: si creano, rinominano e si scelgono le pagine attive per ognuno.',
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
    '<div class="main-card"><div class="card-header">Guida &middot; scegli l\'argomento</div><div style="padding:12px 14px">' +
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:10px">Qui trovi solo gli argomenti che riguardano quello che puoi fare tu. Se e la prima volta, parti da <b>Da dove iniziare</b>.</p>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
    cap
      .map(
        (c) =>
          '<button class="btn-export" style="font-size:.85rem;padding:6px 14px" onclick="document.getElementById(\'' +
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
      '</div><div style="padding:10px 16px;font-size:.9rem;line-height:1.55">' +
      c.righe.map((r) => '<p style="margin:4px 0">• ' + r + '</p>').join('') +
      '</div></div>';
  });
  return h;
}

function renderGuida() {
  const el = document.getElementById('guida-content');
  if (el) el.innerHTML = renderGuidaHtml();
}
