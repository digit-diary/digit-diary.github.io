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
        'Colonne finali: <b>OL</b> (ore effettivamente lavorate: dall entrata all uscita, senza il supplemento del 10% notturno e senza malattie, vacanze, CGF, permessi, maternita, matrimonio, militare, nascita, protezione civile, trasloco e assistenza familiare), <b>D</b> e <b>N</b> (turni diurni e notturni), <b>OD</b> (ore dovute), <b>OP</b> (ore pianificate: turni piu le assenze retribuite come le vacanze, e la cifra che fa il saldo), <b>SM</b> (saldo del mese: OP meno OD), <b>YTD</b> (saldo da inizio anno). Si aggiornano da sole a ogni modifica. Le <b>assenze retribuite</b> (vacanza, malattia, infortunio, CGF, permesso, maternita, matrimonio, militare, nascita, protezione civile, trasloco, assistenza familiare, funerale) valgono in ore <b>secondo la percentuale d impiego</b>: una giornata di vacanza vale 5.857 ore al 100%, 4.686 all 80% e 2.929 al 50%. Le ore di presenza effettiva (corsi, JG, ufficio, uscita per servizio, formazione) restano invece fisse per tutti. Per gli <b>ausiliari (jolly)</b> le vacanze valgono <b>zero ore</b>: la loro indennita di vacanza e gia compresa e pagata nel salario dei giorni lavorati (RAP Allegato 1), quindi contarle anche in ore le farebbe risultare due volte. L elenco dei codici trattati cosi si regola nella scheda Regole (jolly_codici_gia_pagati). La spunta si regola voce per voce nella scheda Codici.',
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
        'Ogni regola vale per <b>tutti i settori</b>, ma si puo aggiungere un eccezione per uno o piu settori con il pulsante <b>Eccezione per un settore</b> nella colonna "Vale per". Esempio: riposo minimo 11 ore ovunque, ma 12 ore ai Tavoli. La regola specifica vince nel suo settore, la generale continua a valere in tutti gli altri: non serve duplicare le regole settore per settore.',
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
        'Giorni in piu per anzianita, che <b>non si sommano</b>: lo scaglione nuovo sostituisce il precedente, e vale per intero dal giorno dopo l anniversario. <b>10 anni +1</b> (36), <b>15 anni +2</b> (37), <b>20 anni +3</b> (38), <b>25 anni +4</b> (39).',
        'Esempio: chi a 10 anni aveva un giorno in piu, quando arriva a 15 anni ne ha <b>due in tutto</b>, non tre.',
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
      titolo: 'Piano: timbrature e saldo ore',
      vis: () => _guidaVis('piano'),
      righe: [
        'Le timbrature si inseriscono a mano, si importano da file oppure arrivano in automatico dalla timbratrice.',
        'Nel confronto si clicca un collaboratore per vedere giorno per giorno entrata, uscita e ore effettive rispetto a quelle pianificate.',
        'Nel <b>Saldo</b> valgono le ore timbrate quando esistono, altrimenti quelle del piano. Il saldo da inizio anno si chiama YTD. Chi ha il mese fatto solo di congedo C, senza turni ne assenze ne timbrature, non viene conteggiato: vuol dire che non e in servizio quel mese.',
        'Nella scheda Statistiche c e il <b>Confronto anni</b>: due tendine per scegliere <b>due anni qualsiasi</b> (anche non consecutivi, es. 2026 contro 2023), per settore, con ore, collaboratori, jolly, malattie, weekend, vacanze e recuperi. La nota in alto dice quanti mesi ha in archivio ciascun anno.',
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
