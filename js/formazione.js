/**
 * Diario Collaboratori · Casino Lugano SA
 * File: formazione.js
 * Progetto Multidisciplinarità: mappatura competenze (spunte per reparto),
 * livelli L1/L2/L3, sistema punti personalizzabile e premi.
 */

// ================================================================
// CONFIGURAZIONE (personalizzabile da admin, salvata in impostazioni)
// ================================================================
const COMPETENZE_DEFAULT = {
  slots: [
    { key: 'sala', label: 'Sala Slot', livello: 1 },
    { key: 'reception', label: 'Reception', livello: 2 },
    { key: 'cassa', label: 'Cassa', livello: 3 },
    { key: 'bo', label: 'Back Office (BO)', livello: 4 },
    { key: 'sup', label: 'Supervisor (SUP)', livello: 5 },
  ],
  tavoli: [
    { key: 'croupier', label: 'Croupier', livello: 1 },
    { key: 'ispettore', label: 'Ispettore tavolo', livello: 2 },
    { key: 'cassa_tavoli', label: 'Cassa Tavoli', livello: 3 },
  ],
  valet: [
    { key: 'valet_servizio', label: 'Servizio Valet', livello: 1 },
    { key: 'valet_accoglienza', label: 'Accoglienza clienti', livello: 2 },
  ],
  cleaning: [
    { key: 'cleaning_sale', label: 'Pulizia sale', livello: 1 },
    { key: 'cleaning_speciali', label: 'Interventi speciali', livello: 2 },
  ],
};
const PUNTI_DEFAULT = {
  azioni: [
    { key: 'copertura', label: 'Copertura turno (malattia)', punti: 10 },
    { key: 'cambio_turno', label: 'Cambio turno accettato', punti: 5 },
    {
      key: 'sessione_formativa',
      label: 'Sessione formativa completata',
      punti: 5,
    },
    { key: 'competenza', label: 'Competenza certificata', punti: 20 },
    { key: 'formatore', label: 'Formatore in sessione', punti: 15 },
    {
      key: 'apprezzamento',
      label: 'Apprezzamento / feedback positivo',
      punti: 10,
    },
    {
      key: 'disponibilita_negata',
      label: 'Disponibilità negata (rifiuto copertura)',
      punti: -5,
    },
  ],
  soglie: [
    { punti: 75, premio: 'Aperitivo' },
    { punti: 150, premio: 'Cena per due' },
  ],
  premi_livello: {
    2: 'Aperitivo di team',
    3: 'Cena + proposta riconoscimento HR',
  },
  // Punti assegnati automaticamente al raggiungimento di ogni livello (0 = disattivato)
  punti_livello: { 1: 0, 2: 0, 3: 0 },
  // 'privato' = premi/livelli notificati solo all'interessato; 'tutti' = annuncio a tutta la squadra; 'off' = nessuna push
  notifiche: 'privato',
};

// Nomi dei livelli personalizzabili (es. L1 = "Base Sala"): impostazione
// 'formazione_livelli_nomi' = { reparto: { '1': 'nome', ... } }
function livelloNome(lv) {
  try {
    const cfg = window._livelliNomiCfg || {};
    const rep = cfg[currentReparto] || {};
    if (rep[String(lv)]) return rep[String(lv)];
  } catch (e) {}
  return 'Livello ' + lv;
}
function livelloSigla(lv) {
  try {
    const cfg = window._livelliNomiCfg || {};
    const rep = cfg[currentReparto] || {};
    if (rep[String(lv)]) return rep[String(lv)];
  } catch (e) {}
  return 'L' + lv;
}
async function salvaNomeLivello(lv, nome) {
  if (!isAdmin()) return;
  const cfg = window._livelliNomiCfg || {};
  cfg[currentReparto] = cfg[currentReparto] || {};
  const v = String(nome || '').trim();
  if (v) cfg[currentReparto][String(lv)] = v;
  else delete cfg[currentReparto][String(lv)];
  window._livelliNomiCfg = cfg;
  await setImp('formazione_livelli_nomi', JSON.stringify(cfg));
  logAzione('Nome livello', 'L' + lv + ' → ' + (v || 'default'));
  toast('Nome livello salvato');
  renderFormazione();
}
function getCompetenzeConfigAll() {
  const cfg = competenzeConfig && typeof competenzeConfig === 'object' ? competenzeConfig : {};
  const out = {};
  getRepartiTutti().forEach((r) => {
    out[r.key] = Array.isArray(cfg[r.key]) ? cfg[r.key] : COMPETENZE_DEFAULT[r.key] || [];
  });
  return out;
}
function getCompetenzeReparto() {
  return getCompetenzeConfigAll()[currentReparto] || [];
}
async function saveCompetenzeConfig(cfg) {
  competenzeConfig = cfg;
  await setImp('competenze_config', JSON.stringify(cfg));
}
function getPuntiConfig() {
  const cfg = puntiConfig && typeof puntiConfig === 'object' ? puntiConfig : PUNTI_DEFAULT;
  return {
    azioni: Array.isArray(cfg.azioni) && cfg.azioni.length ? cfg.azioni : PUNTI_DEFAULT.azioni,
    soglie: Array.isArray(cfg.soglie) ? cfg.soglie : PUNTI_DEFAULT.soglie,
    premi_livello: cfg.premi_livello || PUNTI_DEFAULT.premi_livello,
    punti_livello: cfg.punti_livello || PUNTI_DEFAULT.punti_livello,
    notifiche: cfg.notifiche === 'tutti' || cfg.notifiche === 'off' ? cfg.notifiche : 'privato',
    inventario: Array.isArray(cfg.inventario) ? cfg.inventario : [],
  };
}

// === LIMITI MENSILI, INVENTARIO E ATTESE PREMI ===
// La soglia si ritrova dal testo del premio (la consegna può arrivare anche come 'Livello 3: X')
function _premioSogliaDi(premio) {
  const p = String(premio || '').toLowerCase();
  return getPuntiConfig().soglie.find((s) => s.premio && p.includes(String(s.premio).toLowerCase())) || null;
}
function _consegnatiMesePremio(premio, ym) {
  const p = String(premio || '').toLowerCase();
  return getPuntiReparto().filter(
    (e) =>
      e.azione === 'premio' && (e.data_evento || '').startsWith(ym) && (e.descrizione || '').toLowerCase().includes(p),
  ).length;
}
// Attese non ancora evase: 'premio_attesa' senza una consegna successiva dello stesso premio alla stessa persona.
// Ordinate per data (chi aspetta da più tempo ha priorità), a parità di data per punti.
function _attesePremi() {
  const eventi = getPuntiReparto();
  return eventi
    .filter((a) => a.azione === 'premio_attesa')
    .filter((a) => {
      const prem = (a.descrizione || '').replace(/^In attesa premio:\s*/i, '').toLowerCase();
      return !eventi.some(
        (e) =>
          e.azione === 'premio' &&
          e.collaboratore === a.collaboratore &&
          (e.descrizione || '').toLowerCase().includes(prem) &&
          (e.data_evento || '') >= (a.data_evento || ''),
      );
    })
    .sort(
      (a, b) =>
        (a.data_evento || '').localeCompare(b.data_evento || '') ||
        puntiTotali(b.collaboratore) - puntiTotali(a.collaboratore),
    );
}
// Push incentivi: i punti personali arrivano sempre e solo all'interessato (se è anche operatore);
// premi e passaggi di livello seguono la scelta admin (privato / annuncio a tutti / off)
function _notificaIncentivo(nome, titolo, corpo, soloPrivato) {
  if (typeof inviaPush !== 'function') return;
  const mode = getPuntiConfig().notifiche;
  if (mode === 'off') return;
  if (mode === 'tutti' && !soloPrivato) {
    inviaPush(['tutti'], titolo, corpo, 'general');
    return;
  }
  const isOp = (operatoriAuthCache || []).some((o) => (o.nome || '').toLowerCase() === nome.toLowerCase());
  if (isOp) inviaPush([nome], titolo, corpo, 'general');
}
async function savePuntiConfig(cfg) {
  puntiConfig = cfg;
  await setImp('punti_config', JSON.stringify(cfg));
}

// Un JOLLY che completa TUTTI i livelli: promemoria + evento HR per valutare il contratto fisso
async function _proponiContrattoFisso(c, dopo) {
  try {
    const comps = getCompetenzeReparto().filter((k) => k.livello >= 1);
    if (!comps.length) return;
    const maxLv = Math.max.apply(
      null,
      comps.map((k) => parseInt(k.livello) || 0),
    );
    if (!maxLv || dopo < maxLv || c.impiego !== 'jolly') return;
    if (typeof _insertHrEvento === 'function')
      _insertHrEvento(c.nome, 'impiego', 'Tutti i livelli completati da jolly: valutare proposta di contratto fisso');
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const scad =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const r = await secPost('promemoria', {
      titolo: 'Valutare contratto fisso: ' + c.nome,
      descrizione:
        'Jolly con tutti i livelli di formazione completati (Livello ' +
        dopo +
        ' multidisciplinare). Da discutere con HR.',
      data_scadenza: scad,
      assegnato_a: '',
      creato_da: getOperatore(),
      ripetizione: null,
      reparto_dip: currentReparto,
    });
    if (r && r[0] && typeof promemoriaCache !== 'undefined') {
      promemoriaCache.push(r[0]);
      promemoriaCache.sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza));
      if (typeof aggiornaPromemoriaBadge === 'function') aggiornaPromemoriaBadge();
    }
    toast('Promemoria creato: valutare contratto fisso per ' + c.nome);
  } catch (e) {}
}

// ================================================================
// LIVELLI E PUNTI · helpers
// ================================================================
// Livello multidisciplinare: L(n) = tutte le competenze di livello <= n spuntate
function livelloDiCollaboratore(c) {
  const comps = getCompetenzeReparto().filter((k) => k.livello >= 1);
  if (!comps.length) return 0;
  const spunte = (c && c.competenze) || {};
  let lv = 0;
  const maxLv = Math.max.apply(
    null,
    comps.map((k) => parseInt(k.livello) || 0),
  );
  for (let n = 1; n <= maxLv; n++) {
    const richieste = comps.filter((k) => k.livello <= n);
    if (!richieste.length) continue;
    if (richieste.every((k) => spunte[k.key] === true)) lv = n;
    else break;
  }
  return lv;
}
function livelloBadgeHtml(lv, c) {
  // livello PARZIALE: ha certificazioni di livello alto ma manca qualcosa
  // sotto (es. Reception L2 senza Sala L1) · badge giallo con il dettaglio
  if (c) {
    const comps = getCompetenzeReparto().filter((k) => k.livello >= 1);
    const spunte = (c && c.competenze) || {};
    const certificati = comps.filter((k) => spunte[k.key] === true).map((k) => parseInt(k.livello) || 0);
    const maxCert = certificati.length ? Math.max.apply(null, certificati) : 0;
    if (maxCert > lv) {
      const mancanti = comps
        .filter((k) => (parseInt(k.livello) || 0) < maxCert && spunte[k.key] !== true)
        .map((k) => k.label);
      return (
        '<span class="mini-badge" style="background:#d4a017;color:#000;font-size:.72rem" title="Certificato fino a ' +
        escP(livelloNome(maxCert)) +
        ' ma manca: ' +
        escP(mancanti.join(', ')) +
        '">' +
        escP(livelloSigla(maxCert)) +
        ' parziale</span>'
      );
    }
  }
  if (!lv) return '<span class="mini-badge" style="background:var(--muted)">-</span>';
  const col = { 1: '#1a4a7a', 2: '#e67e22', 3: '#2c6e49', 4: '#8e44ad', 5: '#c0392b' }[lv] || 'var(--muted)';
  return (
    '<span class="mini-badge" style="background:' + col + ';font-size:.72rem">' + escP(livelloNome(lv)) + '</span>'
  );
}
function puntiTotali(nome, anno) {
  const a = anno || new Date().getFullYear();
  return getPuntiReparto()
    .filter((p) => p.collaboratore.toLowerCase() === nome.toLowerCase() && (p.data_evento || '').startsWith(String(a)))
    .reduce((s, p) => s + (parseInt(p.punti) || 0), 0);
}
function conteggioAzione(nome, azioneKey, anno) {
  const a = anno || new Date().getFullYear();
  return getPuntiReparto().filter(
    (p) =>
      p.collaboratore.toLowerCase() === nome.toLowerCase() &&
      p.azione === azioneKey &&
      (p.data_evento || '').startsWith(String(a)),
  ).length;
}
function prossimaSoglia(punti) {
  const soglie = getPuntiConfig()
    .soglie.slice()
    .sort((a, b) => a.punti - b.punti);
  return soglie.find((s) => punti < s.punti) || null;
}
function sogliePremiRaggiunti(nome, anno) {
  const tot = puntiTotali(nome, anno);
  return getPuntiConfig()
    .soglie.filter((s) => tot >= s.punti)
    .map((s) => s.premio);
}

// ================================================================
// PAGINA FORMAZIONE
// ================================================================
// ================================================================
// PROTOCOLLI DI FORMAZIONE (formulari ufficiali digitalizzati)
// Template Excel scaricabile -> il formatore compila (X sui punti svolti,
// voti 1-5 nella valutazione) -> import automatico: riconosce allievo,
// punti e voti, registra nello storico HR e a protocollo completo propone
// la certificazione della competenza (che abilita nel Piano di lavoro).
// Personalizzabili con l'impostazione 'formazione_protocolli'.
// ================================================================
const FORMAZIONE_PROTOCOLLI_DEFAULT = {
  slots: {
    sala: {
      titolo: 'FORMAZIONE TECNICA SLOT ATTENDANT (5 giorni)',
      punti: [
        [
          'FASE 1 · Ambientazione',
          'Visita Casinò',
          'Giro guidato, punti significativi, registrazione entrata/uscita e accesso ai locali',
        ],
        [
          'FASE 1 · Ambientazione',
          'Teoria',
          'Regolamento interno, meccanismi operativi, modelli comportamentali, Manuale Slot',
        ],
        [
          'FASE 1 · Ambientazione',
          'Turnazioni/Pause',
          'Procedure amministrative: foglio disponibilità, turnazione Slot',
        ],
        ['FASE 2 · Tecnica', 'Materiale in dotazione', 'Tessera Slot Attendant, chiavi, telefonino (numeri utili)'],
        ['FASE 2 · Tecnica', 'Nozioni tecniche', 'Struttura slot, menù interno, tipologia di macchine'],
        [
          'FASE 2 · Tecnica',
          'Risoluzione problematiche',
          'Messaggi di errore monitor, Ultrascreen (EGM locked, saldo tessera, controllo banconote)',
        ],
        [
          'FASE 2 · Tecnica',
          'Interventi per problemi',
          'Banconote non accreditate, Bill Reader, Bill Box, crediti spariti, contestazioni pagamenti',
        ],
        [
          'FASE 3 · Pratica',
          'Teoria LRD / CS',
          'Limiti LRD, ordinanza e responsabilità su RICICLAGGIO e CONCEZIONE SOCIALE',
        ],
        [
          'FASE 3 · Pratica',
          'Customer Care',
          'Comportamento in sala, clienti Maison, linguaggio non verbale, clienti difficili, riservazioni, oggetti/denaro trovati',
        ],
        ['FASE 3 · Pratica', 'Pagamenti', 'Progressive Jackpot, Cancel Credit, Short Pay, giochi, conteggio crediti'],
      ],
      valutazione: [
        'Conoscenza tipologie di macchine',
        'Conoscenza giochi',
        'Pagamenti Progressive',
        'Gestione problematiche tecniche',
        'Comportamento positivo e attivo con i clienti',
        'Procedure / Regolamentazione',
      ],
    },
    reception: {
      titolo: 'FORMAZIONE TECNICA RECEPTION',
      punti: [
        ['Formazione', 'Visita Casinò', 'Postazioni di lavoro, registrazione entrata/uscita e accesso ai locali'],
        [
          'Formazione',
          'Teoria',
          'Regolamento interno, meccanismi operativi, modelli comportamentali, Manuale Ricezione',
        ],
        [
          'Formazione',
          'Turnazioni/Pause',
          'Procedure amministrative: foglio ore, foglio disponibilità, turnazione Ricezione',
        ],
        ['Formazione', 'Programmi informatici', 'Programma REC, VETO, monitoraggi'],
        [
          'Guardaroba',
          'Gestione Guardaroba',
          'Chiavi Valet, biglietti Piazza Castello/Campo Marzio, dress code, accessori, oggetti smarriti, prenotazioni alberghi e ristorante',
        ],
        [
          'Controllo',
          'Controllo documenti',
          'Visitors, procedure, documenti validi, autenticità, Remark, limitazioni e divieti, Concezione Sociale e Sicurezza',
        ],
        ['Controllo', 'Centralino', 'Come si risponde, deviazioni chiamate, informazioni da comunicare'],
        [
          'Formazione',
          'Lugano Class',
          'Emissione/ristampa carta, informazioni al cliente, problematiche, collaborazione Marketing',
        ],
        [
          'Formazione',
          'Servizio al cliente',
          'Comunicazione verbale e non, problematiche, informazioni su giochi/carte/ristorante/eventi/orari',
        ],
        ['Formazione', 'Direttive aziendali', 'Direttive e procedure aziendali'],
      ],
      valutazione: [
        'Gestione guardaroba',
        'Controllo documenti',
        'Centralino e comunicazione',
        'Lugano Class',
        'Servizio al cliente',
        'Procedure / Regolamentazione',
      ],
    },
    cassa: {
      titolo: 'FORMAZIONE TECNICA CASSA',
      punti: [
        ['Formazione', 'Visita Casinò', 'Postazioni di lavoro, registrazione entrata/uscita e accesso ai locali'],
        ['Formazione', 'Teoria', 'Regolamento interno, meccanismi operativi, Manuale Cassa'],
        [
          'Formazione',
          'Turnazioni/Pause',
          'Procedure amministrative: foglio ore, foglio disponibilità, turnazione Casse',
        ],
        ['Formazione', 'Programmi informatici', 'Programma CASSA, programma LRD'],
        [
          'Pratica',
          'Apertura Cassa',
          'Procedura apertura Casinò (Back Office), conteggio e stesura valori, trapassi da/per il Back Office',
        ],
        [
          'Pratica',
          'Operazioni di Cassa',
          'Cambi valuta, denaro falso, cambi denominazione, cashless, handpay/progressive, short pay, assegni, carte di credito, bonifici, conti gettoni, fill e credit Live Game, Lugano Class',
        ],
        ['Pratica', 'Transazioni particolari', 'Tutte le transazioni del programma di cassa'],
        ['Pratica', 'Transazioni RICICLAGGIO', 'Tutte le transazioni del programma LRD'],
        ['Formazione', 'Ordinanza LRD / CS', 'Responsabilità del collaboratore su LRD e Concezione Sociale'],
        [
          'Pratica',
          'Chiusura Cassa',
          'Conteggio valori, passaggio intermedio col collega, procedura a chiusura Casinò',
        ],
      ],
      valutazione: [
        'Gestione apertura/chiusura cassa',
        'Stesura banconote/chip',
        'Conti gettoni',
        'Procedure SIP/Pagamenti Slot',
        'Assegni/Bonifici/Carte di Credito',
        'Transazioni di cassa',
        'Procedure / Regolamentazione',
      ],
    },
  },
};
const VALUTAZIONE_PERSONALE_STD = [
  'Comunicazione',
  'Capacità di apprendimento',
  'Resistenza allo stress',
  'Organizzazione',
  'Ruolo',
  'Atteggiamento',
  'Coinvolgimento',
  'Presenza (aspetto al lavoro)',
  'Puntualità',
  'Comportamento verso colleghi e superiori',
];
function getProtocolli() {
  let cfg = null;
  try {
    cfg = window._formazioneProtocolli || null;
  } catch (e) {}
  const base = FORMAZIONE_PROTOCOLLI_DEFAULT[currentReparto] || {};
  return cfg && cfg[currentReparto] ? Object.assign({}, base, cfg[currentReparto]) : base;
}
function _renderProtocolliCard() {
  const prot = getProtocolli();
  const chiavi = Object.keys(prot);
  if (!chiavi.length) return '';
  const comps = getCompetenzeReparto();
  let h =
    '<div class="main-card"><div class="card-header">Protocolli di formazione (formulari ufficiali)</div><div style="padding:10px 16px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Scarica il protocollo in Excel, il formatore lo compila (X sui punti svolti, voti 1-5 nella valutazione) e lo reimporti qui: il sistema riconosce allievo, punti e voti, registra tutto nello storico HR e a protocollo completo propone la certificazione della competenza. Il foglio firmato si allega alla scheda del collaboratore (Allegati HR).</p>';
  chiavi.forEach((k) => {
    const c = comps.find((x) => x.key === k);
    h +=
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0"><b style="min-width:180px">' +
      escP(c ? c.label : k) +
      '</b><button class="btn-export" style="font-size:.78rem;padding:3px 10px" onclick="scaricaProtocolloExcel(\'' +
      k +
      '\')">Scarica template</button>' +
      '<button class="btn-export" style="font-size:.78rem;padding:3px 10px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'prot-file-' +
      k +
      '\').click()">Importa compilato</button><input type="file" id="prot-file-' +
      k +
      '" accept=".xlsx,.xls,.csv" style="display:none" onchange="importaProtocolloExcel(\'' +
      k +
      '\',this)"></div>';
  });
  h += '</div></div>';
  return h;
}
function scaricaProtocolloExcel(compKey) {
  if (!window.XLSX) {
    toast('Libreria Excel non caricata');
    return;
  }
  const p = getProtocolli()[compKey];
  if (!p) return;
  const righe = [
    [p.titolo],
    [],
    ['ALLIEVO:', ''],
    ['FORMATORE:', ''],
    ['INIZIO FORMAZIONE:', ''],
    ['FORMAZIONE TERMINATA IL:', ''],
    [],
    ['N', 'ARGOMENTO', 'SVOLGIMENTO', 'FIRMA ALLIEVO per accettazione', 'SVOLTO (X)'],
  ];
  let faseCorrente = null;
  let numero = 0;
  p.punti.forEach((pt) => {
    if (pt[0] !== faseCorrente) {
      faseCorrente = pt[0];
      righe.push(['', faseCorrente.toUpperCase(), '', '', '']);
    }
    numero++;
    righe.push([numero, pt[1], pt[2], '', '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = [{ wch: 4 }, { wch: 30 }, { wch: 75 }, { wch: 28 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Protocollo');
  const rigV = [
    ['VALUTAZIONE FORMATORE'],
    ['insufficiente  1  2  3  4  5  eccellente · scrivere il voto nella colonna VOTO'],
    [],
    ['COMPETENZE TECNICHE', 'VOTO (1-5)'],
  ];
  (p.valutazione || []).forEach((v) => rigV.push([v, '']));
  rigV.push([]);
  rigV.push(['COMPETENZE PERSONALI E ATTITUDINE', 'VOTO (1-5)']);
  VALUTAZIONE_PERSONALE_STD.forEach((v) => rigV.push([v, '']));
  rigV.push([]);
  rigV.push(['GIUDIZIO COMPLESSIVO FORMATORE', '']);
  rigV.push(["VALUTAZIONE DELL'ALLIEVO SUL FORMATORE", '']);
  const wsV = XLSX.utils.aoa_to_sheet(rigV);
  wsV['!cols'] = [{ wch: 60 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsV, 'Valutazione');
  const comps = getCompetenzeReparto();
  const c = comps.find((x) => x.key === compKey);
  XLSX.writeFile(wb, 'Protocollo_' + (c ? c.label.replace(/[^A-Za-z0-9]+/g, '_') : compKey) + '.xlsx');
  logAzione('Protocollo scaricato', compKey);
}
async function importaProtocolloExcel(compKey, input) {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_competenze')) {
    toast('Non hai il permesso');
    input.value = '';
    return;
  }
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const dati = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    // intestazione: ALLIEVO / FORMATORE / date
    let allievo = '';
    let formatore = '';
    let fine = '';
    dati.slice(0, 10).forEach((r) => {
      const et = String(r[0] || '').toUpperCase();
      if (et.startsWith('ALLIEVO')) allievo = String(r[1] || '').trim();
      if (et.startsWith('FORMATORE')) formatore = String(r[1] || '').trim();
      if (et.startsWith('FORMAZIONE TERMINATA')) fine = String(r[1] || '').trim();
    });
    const collab = collaboratoriCache.find(
      (c) =>
        c.attivo !== false &&
        (c.nome.toLowerCase() === allievo.toLowerCase() ||
          (allievo &&
            allievo
              .toLowerCase()
              .split(/\s+/)
              .every((p2) => c.nome.toLowerCase().includes(p2)))),
    );
    if (!allievo || !collab) {
      toast('Allievo non riconosciuto: scrivi il nome nella cella accanto ad ALLIEVO');
      return;
    }
    // punti svolti: righe dopo la testata N|FASE|...
    const iTesta = dati.findIndex((r) => String(r[0]).trim().toUpperCase() === 'N');
    let fatti = 0;
    let totale = 0;
    const mancanti = [];
    if (iTesta >= 0)
      dati.slice(iTesta + 1).forEach((r) => {
        if (isNaN(parseInt(r[0]))) return; // righe FASE o vuote
        totale++;
        const svoltoX =
          String(r[4] || '')
            .trim()
            .toUpperCase() === 'X' ||
          String(r[3] || '')
            .trim()
            .toUpperCase() === 'X';
        if (svoltoX) fatti++;
        else mancanti.push(String(r[1] || '').trim());
      });
    // valutazioni (secondo foglio, se presente)
    const voti = [];
    if (wb.SheetNames[1]) {
      const dv = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: '' });
      dv.forEach((r) => {
        const voto = parseInt(r[1]);
        const criterio = String(r[0] || '').trim();
        if (criterio && !isNaN(voto) && voto >= 1 && voto <= 5 && !criterio.toUpperCase().startsWith('COMPETENZE'))
          voti.push(criterio + ': ' + voto + '/5');
      });
    }
    const completo = totale > 0 && fatti === totale;
    if (
      !confirm(
        'Protocollo ' +
          compKey.toUpperCase() +
          ' · ' +
          collab.nome +
          '\n\n• Punti svolti: ' +
          fatti +
          '/' +
          totale +
          (mancanti.length
            ? '\n• Mancano: ' + mancanti.slice(0, 4).join(', ') + (mancanti.length > 4 ? '...' : '')
            : '') +
          (formatore ? '\n• Formatore: ' + formatore : '') +
          (voti.length ? '\n• Valutazioni riconosciute: ' + voti.length : '') +
          '\n\nRegistrare nello storico HR?',
      )
    )
      return;
    if (typeof _insertHrEvento === 'function') {
      const comps = getCompetenzeReparto();
      const cDef = comps.find((x) => x.key === compKey);
      await _insertHrEvento(
        collab.nome,
        'formazione',
        'Protocollo ' +
          (cDef ? cDef.label : compKey) +
          ': ' +
          fatti +
          '/' +
          totale +
          ' punti svolti' +
          (formatore ? ' · formatore: ' + formatore : '') +
          (fine ? ' · terminata il ' + fine : '') +
          (voti.length ? '\n' + voti.join('; ') : ''),
      );
    }
    logAzione('Protocollo importato', collab.nome + ' ' + compKey + ' ' + fatti + '/' + totale);
    if (completo && !(collab.competenze || {})[compKey]) {
      if (
        confirm(
          'Protocollo COMPLETO: certificare la competenza a ' +
            collab.nome +
            '? (lo abilita anche nel Piano di lavoro)',
        )
      ) {
        const nuove = Object.assign({}, collab.competenze || {});
        nuove[compKey] = true;
        // scala dei livelli: il livello certificato implica quelli inferiori
        const compsRep2 = getCompetenzeReparto();
        const lvQ = parseInt((compsRep2.find((k) => k.key === compKey) || {}).livello) || 0;
        if (lvQ > 1)
          compsRep2.forEach((k) => {
            const lvK = parseInt(k.livello) || 0;
            if (lvK > 0 && lvK < lvQ) nuove[k.key] = true;
          });
        await secPatch('collaboratori', 'id=eq.' + collab.id, { competenze: nuove });
        collab.competenze = nuove;
        logAzione('Competenza certificata', collab.nome + ' · ' + compKey + ' (da protocollo)');
        const az = getPuntiConfig().azioni.find((a) => a.key === 'competenza');
        if (az && az.punti && confirm('Assegnare anche ' + az.punti + ' punti a ' + collab.nome + '?'))
          await _insertPuntiEvento(
            collab.nome,
            az.punti,
            'competenza',
            'Competenza certificata: ' + compKey + ' (da protocollo)',
          );
      }
    }
    toast('Protocollo registrato: ' + fatti + '/' + totale + ' punti' + (completo ? ' · completo' : ''));
    renderFormazione();
  } catch (e) {
    console.error(e);
    toast('Errore lettura protocollo');
  }
}

// Stesso ordine del piano: prima SUP/RESP, poi BO, poi gli altri, jolly in fondo;
// se nel piano le righe sono state riordinate a mano (drag) vale quell'ordine anche qui
function _formOrdineComePiano(lista) {
  const rango = (c) => {
    if (c.is_jolly) return 3;
    const f = ((c.funzione || '') + '').toUpperCase();
    if (f === 'RESP' || f === 'VICERESP' || f === 'SUP') return 0;
    return f === 'BO' ? 1 : 2;
  };
  const pos = {};
  try {
    ((window._pianoOrdineCollab || {})[currentReparto] || []).forEach((n, i) => (pos[n] = i));
  } catch (e) {}
  return lista.slice().sort((a, b) => {
    const pa = pos[a.nome] != null ? pos[a.nome] : 9999;
    const pb = pos[b.nome] != null ? pos[b.nome] : 9999;
    return pa - pb || rango(a) - rango(b) || a.nome.localeCompare(b.nome);
  });
}
async function _formCaricaOrdinePiano() {
  // l'ordine manuale del piano vive nell'imp 'piano_ordine_collab': se la pagina
  // Formazione viene aperta prima del Piano lo carico qui, poi ridisegno
  if (window._pianoOrdineCollab !== undefined || typeof getImp !== 'function') return;
  window._pianoOrdineCollab = {};
  try {
    const v = await getImp('piano_ordine_collab');
    if (v) window._pianoOrdineCollab = JSON.parse(v);
    if (Object.keys(window._pianoOrdineCollab).length) renderFormazione();
  } catch (e) {}
}
// ordinamento per colonna dello storico punti: 1° clic decrescente, poi si inverte
function formStoricoSort(campo) {
  const s0 = window._formStoricoSort || { campo: 'data_evento', dir: -1 };
  window._formStoricoSort = { campo: campo, dir: s0.campo === campo ? -s0.dir : -1 };
  renderFormazione();
}
function renderFormazione() {
  const el = document.getElementById('formazione-content');
  if (!el) return;
  const adm = isAdmin();
  const puoPunti = typeof puoModificare === 'function' ? puoModificare('gestione_punti') : adm;
  const puoComp = typeof puoModificare === 'function' ? puoModificare('gestione_competenze') : adm;
  const comps = getCompetenzeReparto();
  _formCaricaOrdinePiano();
  const collabs = _formOrdineComePiano(getCollaboratoriReparto().filter((c) => c.attivo !== false));
  // KPI livelli
  const perLivello = [0, 0, 0, 0];
  collabs.forEach((c) => {
    perLivello[livelloDiCollaboratore(c)]++;
  });
  let html = '<div class="stats-bar" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">';
  html +=
    '<div class="stat"><div class="stat-num">' +
    collabs.length +
    '</div><div class="stat-label">Collaboratori</div></div>';
  html +=
    '<div class="stat"><div class="stat-num blue">' +
    perLivello[1] +
    '</div><div class="stat-label">Livello 1</div></div>';
  html +=
    '<div class="stat"><div class="stat-num" style="color:#e67e22">' +
    perLivello[2] +
    '</div><div class="stat-label">Livello 2</div></div>';
  html +=
    '<div class="stat"><div class="stat-num teal">' +
    perLivello[3] +
    '</div><div class="stat-label">Livello 3 (multiruolo)</div></div>';
  // copertura per competenza
  comps.forEach((k) => {
    const n = collabs.filter((c) => (c.competenze || {})[k.key] === true).length;
    html +=
      '<div class="stat"><div class="stat-num gold">' +
      n +
      '</div><div class="stat-label">' +
      escP(k.label) +
      '</div></div>';
  });
  html += '</div>';

  // MATRICE COMPETENZE
  html += _renderProtocolliCard();
  html += '<div class="main-card"><div class="card-header">Matrice competenze · chi sa fare cosa</div>';
  html +=
    '<div class="filters" style="padding:10px 16px"><div class="filter-group"><span class="filter-label">Cerca</span><input type="text" id="form-matr-cerca" placeholder="Nome..." oninput="_filtraMatrice()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:180px"></div>' +
    '<div class="export-btns"><button class="btn-export" onclick="esportaMatriceCSV()">CSV</button><button class="btn-export btn-export-pdf" onclick="esportaMatricePDF()">PDF</button></div></div>';
  // colonna colorata come i turni di quel gruppo nel piano (Sala, Rec, ...)
  const coloreComp = (key) => {
    try {
      const g = (typeof _pianoCompetenzeGruppi === 'function' ? _pianoCompetenzeGruppi() : {})[key];
      return (typeof PIANO_COLORI_GRUPPO !== 'undefined' ? PIANO_COLORI_GRUPPO : {})[g] || '';
    } catch (e) {
      return '';
    }
  };
  html +=
    '<div style="padding:0 16px 16px;overflow-x:auto"><table class="collab-table" id="matrice-competenze"><thead><tr><th>Collaboratore</th>';
  comps.forEach((k) => {
    const cc = coloreComp(k.key);
    html +=
      '<th class="num"' +
      (cc ? ' style="background:' + cc + ' !important;color:#000"' : '') +
      '>' +
      escP(k.label) +
      (k.livello ? ' <span style="font-size:.6rem;color:#00000099">L' + k.livello + '</span>' : '') +
      '</th>';
  });
  html += '<th class="num">Livello</th><th class="num">Punti ' + new Date().getFullYear() + '</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    const lv = livelloDiCollaboratore(c);
    const pts = puntiTotali(c.nome);
    const ne = c.nome.replace(/'/g, "\\'");
    html +=
      '<tr data-matr-nome="' +
      escP(c.nome).toLowerCase() +
      '"><td><span class="entry-name" onclick="apriSchedaCollaboratore(\'' +
      ne +
      '\')"><strong>' +
      escP(c.nome) +
      '</strong></span>' +
      (c.impiego
        ? ' <span class="mini-badge" style="background:' +
          (c.impiego === 'fisso' ? '#1a7a6d' : '#e67e22') +
          ';font-size:.62rem">' +
          (c.impiego === 'fisso' ? 'Fisso' : 'Jolly') +
          '</span>'
        : '') +
      (c.categoria && typeof puoVedereCategorie === 'function' && puoVedereCategorie()
        ? ' <span class="mini-badge" style="background:var(--accent2);font-size:.62rem">' +
          c.categoria +
          '&ordf;</span>'
        : '') +
      '</td>';
    comps.forEach((k) => {
      const on = (c.competenze || {})[k.key] === true;
      const cc2 = coloreComp(k.key);
      html +=
        '<td class="num"' +
        (cc2 ? ' style="background:' + cc2 + '40"' : '') +
        '><input type="checkbox" ' +
        (on ? 'checked ' : '') +
        (puoComp ? '' : 'disabled ') +
        'onchange="toggleCompetenza(' +
        c.id +
        ",'" +
        k.key +
        '\',this)" style="width:18px;height:18px;accent-color:#2c6e49;cursor:' +
        (puoComp ? 'pointer' : 'default') +
        '"></td>';
    });
    html +=
      '<td class="num">' +
      livelloBadgeHtml(lv, c) +
      '</td><td class="num"><strong style="color:' +
      (pts < 0 ? 'var(--accent)' : 'var(--accent2)') +
      '">' +
      pts +
      '</strong></td></tr>';
  });
  html += '</tbody></table></div></div>';

  // PUNTI · assegnazione rapida + registro
  html += '<div class="main-card"><div class="card-header">Punti · assegnazione</div><div class="form-area">';
  if (puoPunti) {
    const cfg = getPuntiConfig();
    html += '<div class="form-row" style="grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:flex-end">';
    html +=
      '<div class="field"><label>Collaboratore</label><select id="pt-collab" style="padding:10px">' +
      collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
      '</select></div>';
    html +=
      '<div class="field"><label>Azione</label><select id="pt-azione" style="padding:10px">' +
      cfg.azioni
        .map(
          (a) =>
            '<option value="' +
            escP(a.key) +
            '">' +
            escP(a.label) +
            ' (' +
            (a.punti > 0 ? '+' : '') +
            a.punti +
            ')</option>',
        )
        .join('') +
      '<option value="manuale">Punti manuali...</option></select></div>';
    html +=
      '<div class="field"><label>Nota (opzionale)</label><input type="text" id="pt-nota" placeholder="Es: copertura turno del 15/08 per..."></div>';
    html += '<button class="btn-add-tipo" onclick="assegnaPuntiRapido()">+ Assegna</button></div>';
    html +=
      '<p style="color:var(--muted);font-size:.78rem;margin-top:6px">I punti si guadagnano con azioni positive (coperture, formazione, apprezzamenti). Le malattie NON tolgono mai punti: solo il rifiuto esplicito di una disponibilità richiesta può essere conteggiato, se configurato.</p>';
  } else {
    html += '<p style="color:var(--muted);font-size:.88rem">I punti vengono assegnati dal responsabile.</p>';
  }
  html += '</div>';
  // registro eventi punti: cerca per nome/voce + ordinamento
  const cercaSt = ((window._formStoricoCerca || '') + '').toLowerCase();
  const srtF = window._formStoricoSort || { campo: 'data_evento', dir: -1 };
  let eventi = getPuntiReparto();
  if (cercaSt)
    eventi = eventi.filter((p) =>
      ((p.collaboratore || '') + ' ' + (p.azione || '') + ' ' + (p.descrizione || '')).toLowerCase().includes(cercaSt),
    );
  eventi = eventi.slice().sort((a, b) => {
    const d =
      srtF.campo === 'punti'
        ? srtF.dir * ((a.punti || 0) - (b.punti || 0))
        : srtF.dir * String(a[srtF.campo] || '').localeCompare(String(b[srtF.campo] || ''));
    return d || (b.data_evento || '').localeCompare(a.data_evento || '');
  });
  eventi = eventi.slice(0, cercaSt ? 200 : 60);
  html += '<div style="padding:0 16px 16px">';
  html +=
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
    '<input type="text" value="' +
    escP(window._formStoricoCerca || '') +
    '" placeholder="Cerca nome o voce nello storico..." onchange="window._formStoricoCerca=this.value;renderFormazione()" style="padding:6px 10px;font-size:.82rem;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);width:220px"></div>';
  if (!eventi.length) html += '<p style="color:var(--muted);padding:10px">Nessun punto assegnato finora.</p>';
  else {
    const thSort = (campo, label, cls) =>
      '<th' +
      (cls ? ' class="' + cls + '"' : '') +
      ' style="cursor:pointer" title="Clicca per ordinare" onclick="formStoricoSort(\'' +
      campo +
      '\')">' +
      label +
      (srtF.campo === campo
        ? srtF.dir === 1
          ? ' &#9650;'
          : ' &#9660;'
        : ' <span style="opacity:.35">&#8597;</span>') +
      '</th>';
    html +=
      '<table class="collab-table"><thead><tr>' +
      thSort('data_evento', 'Data') +
      thSort('collaboratore', 'Collaboratore') +
      thSort('punti', 'Punti', 'num') +
      thSort('azione', 'Azione') +
      thSort('descrizione', 'Nota') +
      thSort('operatore', 'Da') +
      (adm ? '<th></th>' : '') +
      '</tr></thead><tbody>';
    const azLabels = { premio: 'Premio consegnato', premio_attesa: 'In attesa premio' };
    getPuntiConfig().azioni.forEach((a) => (azLabels[a.key] = a.label));
    eventi.forEach((p) => {
      html +=
        '<tr><td style="white-space:nowrap">' +
        new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') +
        '</td><td><strong>' +
        escP(p.collaboratore) +
        '</strong></td><td class="num"><strong style="color:' +
        (p.punti < 0 ? 'var(--accent)' : p.punti > 0 ? '#2c6e49' : 'var(--muted)') +
        '">' +
        (p.punti > 0 ? '+' : '') +
        p.punti +
        '</strong></td><td>' +
        escP(azLabels[p.azione] || p.azione) +
        '</td><td style="color:var(--muted);font-size:.84rem">' +
        escP(p.descrizione || '') +
        '</td><td style="color:var(--muted);font-size:.82rem">' +
        escP(p.operatore || '') +
        '</td>' +
        (adm
          ? '<td><button class="btn-act del" onclick="eliminaPuntiEvento(' +
            p.id +
            ')" style="font-size:.7rem">X</button></td>'
          : '') +
        '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // TRAGUARDI PREMI
  const cfgP = getPuntiConfig();
  html +=
    '<div class="main-card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">Traguardi e premi' +
    (adm || puoPunti
      ? '<span style="display:flex;align-items:center;gap:6px"><select id="ri-anno" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:.75rem">' +
        [0, 1, 2, 3]
          .map((d) => {
            const a = new Date().getFullYear() - d;
            return '<option value="' + a + '">' + a + '</option>';
          })
          .join('') +
        '</select><button class="btn-export btn-export-pdf" onclick="esportaReportIncentiviPDF()" style="font-size:.75rem;padding:4px 12px">Report Incentivi PDF</button></span>'
      : '') +
    '</div><div style="padding:16px">';
  html +=
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:10px">Soglie punti: ' +
    cfgP.soglie.map((s) => '<strong>' + s.punti + '</strong> = ' + escP(s.premio)).join(' · ') +
    ' · Passaggio livello: ' +
    Object.entries(cfgP.premi_livello)
      .map(([l, p]) => 'L' + l + ' = ' + escP(p))
      .join(' · ') +
    '</p>';
  // limiti mensili: consegnati/limite del mese corrente + attese con priorità
  const soglieConLimite = cfgP.soglie.filter((s) => parseInt(s.limite_mese) > 0);
  const attese = _attesePremi();
  if (soglieConLimite.length || attese.length) {
    const ymCorr = new Date().toISOString().substring(0, 7);
    html +=
      '<div style="padding:8px 12px;background:var(--paper2);border:1px solid var(--line);border-radius:3px;margin-bottom:12px">';
    if (soglieConLimite.length) {
      html +=
        '<p style="font-size:.8rem;margin:0 0 4px"><strong>Premi del mese:</strong> ' +
        soglieConLimite
          .map((s) => {
            const usati = _consegnatiMesePremio(s.premio, ymCorr);
            const lim = parseInt(s.limite_mese);
            const pieno = usati >= lim;
            const inv = s.inventario ? (cfgP.inventario.find((i) => i.nome === s.inventario) || {}).qta : null;
            return (
              escP(s.premio) +
              ' <strong style="color:' +
              (pieno ? 'var(--accent)' : '#2c6e49') +
              '">' +
              usati +
              '/' +
              lim +
              '</strong>' +
              (pieno ? ' (esaurito)' : '') +
              (inv != null ? ' · magazzino: ' + inv : '')
            );
          })
          .join(' &nbsp;·&nbsp; ') +
        '</p>';
    }
    if (attese.length) {
      html +=
        '<p style="font-size:.8rem;margin:0"><strong>In attesa (priorità dal mese dopo):</strong></p>' +
        attese
          .map((a) => {
            const prem = (a.descrizione || '').replace(/^In attesa premio:\s*/i, '');
            return (
              '<div style="font-size:.8rem;display:flex;align-items:center;gap:8px;padding:2px 0">' +
              '<span>&#9203; <strong>' +
              escP(a.collaboratore) +
              '</strong> · ' +
              escP(prem) +
              ' <span style="color:var(--muted)">(dal ' +
              new Date((a.data_evento || '') + 'T12:00:00').toLocaleDateString('it-IT') +
              ')</span></span>' +
              (adm || puoPunti
                ? '<button class="btn-export" style="font-size:.7rem;padding:2px 10px" onclick="registraPremioConsegnato(\'' +
                  a.collaboratore.replace(/'/g, "\\'") +
                  "','" +
                  prem.replace(/'/g, "\\'") +
                  '\')">Consegna ora</button>'
                : '') +
              '</div>'
            );
          })
          .join('');
    }
    html += '</div>';
  }
  const conPunti = collabs
    .map((c) => ({
      nome: c.nome,
      punti: puntiTotali(c.nome),
      lv: livelloDiCollaboratore(c),
    }))
    .filter((x) => x.punti !== 0 || x.lv > 0)
    .sort((a, b) => b.punti - a.punti);
  if (!conPunti.length) html += '<p style="color:var(--muted)">Nessun traguardo in corso.</p>';
  else {
    conPunti.forEach((x) => {
      const next = prossimaSoglia(x.punti);
      const raggiunti = sogliePremiRaggiunti(x.nome);
      const maxS = cfgP.soglie.length ? Math.max(...cfgP.soglie.map((s) => s.punti)) : 100;
      const pct = Math.max(0, Math.min(100, Math.round((x.punti / maxS) * 100)));
      html +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><strong style="min-width:170px">' +
        escP(x.nome) +
        '</strong>' +
        livelloBadgeHtml(x.lv) +
        '<span style="font-weight:700;color:var(--accent2)">' +
        x.punti +
        ' pt</span><div class="budget-bar" style="flex:1;min-width:120px;height:6px"><div class="budget-bar-fill" style="width:' +
        pct +
        '%;background:var(--accent2)"></div></div>' +
        (next
          ? '<span style="font-size:.78rem;color:var(--muted)">-' +
            (next.punti - x.punti) +
            ' a: ' +
            escP(next.premio) +
            '</span>'
          : '<span style="font-size:.78rem;color:#2c6e49;font-weight:700">Tutte le soglie raggiunte!</span>') +
        (raggiunti.length
          ? '<span style="font-size:.78rem;color:#2c6e49"><i class="icx icx-trofeo"></i> ' +
            raggiunti.map(escP).join(', ') +
            '</span>'
          : '') +
        '</div></div>';
    });
  }
  html += '</div></div>';

  // REGISTRA FORMAZIONE SVOLTA (admin o permesso gestione_formazioni: es. supervisor)
  const puoForm = adm || (typeof puoModificare === 'function' && puoModificare('gestione_formazioni'));
  if (puoForm) {
    html += '<div class="main-card"><div class="card-header">Registra formazione svolta</div><div class="form-area">';
    html +=
      '<div class="form-row" style="grid-template-columns:1fr 1.4fr 1fr auto auto;gap:10px;align-items:flex-end">';
    html +=
      '<div class="field"><label>Collaboratore</label><select id="frm-collab" style="padding:10px">' +
      collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
      '</select></div>';
    html +=
      '<div class="field"><label>Formazione svolta</label><input type="text" id="frm-desc" placeholder="Es: formazione Reception, procedura LRD..."></div>';
    html +=
      '<div class="field"><label>Formatore</label><input type="text" id="frm-formatore" value="' +
      escP(getOperatore() || '') +
      '"></div>';
    html +=
      '<div class="field"><label>Data</label><input type="date" id="frm-data" value="' +
      new Date().toISOString().split('T')[0] +
      '" style="padding:9px"></div>';
    html += '<button class="btn-add-tipo" onclick="registraFormazioneSvolta()">+ Registra</button></div>';
    if (puoPunti) {
      const azF = getPuntiConfig().azioni.find((a) => a.key === 'sessione_formativa');
      html +=
        '<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-top:8px;cursor:pointer"><input type="checkbox" id="frm-punti" checked> Assegna anche i punti "Sessione formativa completata"' +
        (azF ? ' (+' + azF.punti + ')' : '') +
        '</label>';
      const azFmt = getPuntiConfig().azioni.find((a) => a.key === 'formatore');
      html +=
        '<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-top:4px;cursor:pointer"><input type="checkbox" id="frm-punti-fmt"> Assegna i punti "Formatore in sessione" al formatore' +
        (azFmt ? ' (+' + azFmt.punti + ')' : '') +
        ' · facoltativo, solo se il formatore è un collaboratore</label>';
    }
    html +=
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<span style="font-size:.8rem;color:var(--muted)">Allega scheda (facoltativo):</span>' +
      '<input type="file" id="frm-allegato" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" style="font-size:.78rem;max-width:260px">' +
      '<span style="font-size:.72rem;color:var(--muted)">PDF, Excel o immagine · max 2 MB, visibile nello Storico HR</span></div>';
    html +=
      '<p style="color:var(--muted);font-size:.75rem;margin-top:6px">La formazione viene tracciata con data e formatore nello Storico HR del collaboratore (visibile solo a admin e operatori autorizzati).</p>';
    html += '</div></div>';
  }

  // PANORAMICA HR (riservato: admin + permesso storico_hr)
  if (typeof puoVedereStoricoHr === 'function' && puoVedereStoricoHr()) {
    html += _renderPanoramicaHrCard(collabs);
  }
  // PREMI GIUBILEO (riservato: admin + permesso storico_hr)
  if (typeof puoVedereStoricoHr === 'function' && puoVedereStoricoHr()) {
    html += _renderGiubileiCard(collabs);
  }
  // EQUITÀ CATEGORIE (riservato: admin + permesso storico_hr) · sistema meritocratico
  if (typeof puoVedereStoricoHr === 'function' && puoVedereStoricoHr()) {
    html += _renderEquitaCard(collabs);
  }

  // CONFIG ADMIN
  if (adm) {
    html += _renderFormazioneConfig();
  }
  el.innerHTML = html;
  if (typeof initSezioniRichiudibili === 'function') initSezioniRichiudibili('formazione-content');
  if (typeof initCardRichiudibili === 'function')
    initCardRichiudibili('formazione-content', ['Matrice competenze', 'Punti']);
}

// Registra una sessione formativa nello storico HR (+ punti opzionali)
async function registraFormazioneSvolta() {
  const adm = isAdmin();
  if (!adm && !(typeof puoModificare === 'function' && puoModificare('gestione_formazioni'))) {
    toast('Non hai il permesso di registrare formazioni');
    return;
  }
  const nome = (document.getElementById('frm-collab') || {}).value;
  const desc = ((document.getElementById('frm-desc') || {}).value || '').trim();
  const formatore = ((document.getElementById('frm-formatore') || {}).value || '').trim();
  const data = (document.getElementById('frm-data') || {}).value || new Date().toISOString().split('T')[0];
  if (!nome || !desc) {
    toast('Indica collaboratore e formazione svolta');
    return;
  }
  try {
    await _insertHrEvento(nome, 'formazione', desc + (formatore ? ' · formatore: ' + formatore : ''), data);
    logAzione('Formazione registrata', nome + ' · ' + desc + (formatore ? ' (formatore ' + formatore + ')' : ''));
    // Allegato facoltativo (scheda originale) → Storico HR
    const fEl = document.getElementById('frm-allegato');
    const fAll = fEl && fEl.files && fEl.files[0];
    if (fAll && typeof _uploadHrAllegato === 'function') {
      const rAll = await _uploadHrAllegato(fAll, nome, 'Scheda formazione: ' + desc);
      if (rAll) toast('Scheda allegata allo Storico HR');
      fEl.value = '';
    }
    const puoP = adm || (typeof puoModificare === 'function' && puoModificare('gestione_punti'));
    const conPunti = (document.getElementById('frm-punti') || {}).checked;
    if (conPunti && puoP) {
      const az = getPuntiConfig().azioni.find((a) => a.key === 'sessione_formativa');
      if (az && az.punti) await _insertPuntiEvento(nome, az.punti, 'sessione_formativa', desc);
    }
    // Punti al formatore: facoltativi, solo se il nome corrisponde a un collaboratore
    const conPuntiFmt = (document.getElementById('frm-punti-fmt') || {}).checked;
    if (conPuntiFmt && puoP && formatore) {
      const collFmt = (collaboratoriCache || []).find((x) => (x.nome || '').toLowerCase() === formatore.toLowerCase());
      const azF = getPuntiConfig().azioni.find((a) => a.key === 'formatore');
      if (!collFmt) {
        toast('Formatore "' + formatore + '" non trovato tra i collaboratori: punti formatore non assegnati');
      } else if (azF && azF.punti) {
        await _insertPuntiEvento(collFmt.nome, azF.punti, 'formatore', 'Formatore in sessione: ' + desc);
      }
    }
    document.getElementById('frm-desc').value = '';
    renderFormazione();
    toast('Formazione registrata per ' + nome);
  } catch (e) {
    toast('Errore registrazione formazione');
  }
}

// Confronto meritocratico: segnala chi ha più anzianità e pari livello ma categoria inferiore
function _renderEquitaCard(collabs) {
  const oggi = Date.now();
  const righe = collabs.map((c) => {
    const anzGiorni = c.data_assunzione
      ? Math.floor((oggi - new Date(c.data_assunzione + 'T12:00:00').getTime()) / 86400000)
      : null;
    let media = null;
    if (typeof getValutazioniReparto === 'function' && typeof _mediaValutazione === 'function') {
      const v = getValutazioniReparto()
        .filter((x) => x.collaboratore.toLowerCase() === c.nome.toLowerCase())
        .sort((a, b) => b.anno - a.anno)[0];
      if (v) media = _mediaValutazione(v.aree);
    }
    return {
      nome: c.nome,
      impiego: c.impiego || '',
      categoria: c.categoria || null,
      dataAss: c.data_assunzione || '',
      anzGiorni,
      lv: livelloDiCollaboratore(c),
      punti: puntiTotali(c.nome),
      media,
    };
  });
  // segnalazioni: X penalizzato se esiste Y con categoria migliore, almeno 6 mesi di anzianità in meno e livello pari o inferiore
  righe.forEach((x) => {
    if (!x.categoria || x.anzGiorni == null) return;
    const y = righe
      .filter(
        (o) =>
          o.categoria &&
          o.anzGiorni != null &&
          o.categoria < x.categoria &&
          x.anzGiorni > o.anzGiorni + (typeof equitaMesi !== 'undefined' ? equitaMesi : 6) * 30 &&
          (o.lv || 0) <= (x.lv || 0),
      )
      .sort((a, b) => a.anzGiorni - b.anzGiorni)[0];
    if (y)
      x.flag =
        'In ' +
        x.categoria +
        'ª con più anzianità di ' +
        y.nome +
        ' (' +
        y.categoria +
        'ª, livello pari o inferiore) · valutare revisione';
  });
  const conDati = righe.filter((r) => r.categoria || r.dataAss);
  let html =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:8px">Equità categorie · analisi meritocratica <span class="mini-badge" style="background:var(--accent);font-size:.65rem">RISERVATO</span>' +
    (isAdmin()
      ? '<span style="margin-left:auto;font-size:.72rem;font-weight:400;display:flex;align-items:center;gap:6px">Segnala da <select onchange="salvaEquitaMesi(this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:.75rem">' +
        [3, 6, 9, 12]
          .map(
            (m) =>
              '<option value="' +
              m +
              '"' +
              ((typeof equitaMesi !== 'undefined' ? equitaMesi : 6) === m ? ' selected' : '') +
              '>' +
              m +
              ' mesi</option>',
          )
          .join('') +
        '</select> di anzianità in più</span>'
      : '') +
    '</div>';
  if (!conDati.length) {
    html +=
      '<p style="color:var(--muted);padding:16px;font-size:.86rem">Assegna categorie e date di inizio contratto (scheda collaboratore → Storico HR) per attivare il confronto.</p></div>';
    return html;
  }
  conDati.sort((a, b) => (a.categoria || 9) - (b.categoria || 9) || (b.anzGiorni || 0) - (a.anzGiorni || 0));
  html +=
    '<div style="padding:0 16px 8px;overflow-x:auto"><table class="collab-table"><thead><tr><th>Collaboratore</th><th>Impiego</th><th class="num">Cat.</th><th>Anzianità</th><th class="num">Livello</th><th class="num">Punti</th><th class="num">Valutazione</th><th>Segnalazione</th></tr></thead><tbody>';
  conDati.forEach((r) => {
    html +=
      '<tr' +
      (r.flag ? ' style="background:rgba(192,57,43,0.06)"' : '') +
      '><td><strong>' +
      escP(r.nome) +
      '</strong></td><td>' +
      (r.impiego === 'fisso' ? 'Fisso' : r.impiego === 'jolly' ? 'Jolly' : '-') +
      '</td><td class="num"><strong>' +
      (r.categoria ? r.categoria + 'ª' : '-') +
      '</strong></td><td>' +
      (r.dataAss ? anzianitaLabel(r.dataAss) : '-') +
      '</td><td class="num">' +
      (r.lv ? 'L' + r.lv : '-') +
      '</td><td class="num">' +
      r.punti +
      '</td><td class="num">' +
      (r.media != null ? r.media + '%' : '-') +
      '</td><td style="font-size:.78rem;color:var(--accent)">' +
      (r.flag ? '<i class="icx icx-avviso"></i> ' + escP(r.flag) : '') +
      '</td></tr>';
  });
  html += '</tbody></table></div>';
  html +=
    '<p style="color:var(--muted);font-size:.75rem;padding:0 16px 14px">Analisi indicativa basata su anzianità (inizio contratto), categoria e livello multidisciplinare · segnala con almeno ' +
    (typeof equitaMesi !== 'undefined' ? equitaMesi : 6) +
    ' mesi di anzianità in più a parità di livello: la decisione sulle categorie resta al responsabile e a HR.</p></div>';
  return html;
}
function _filtraMatrice() {
  const q = ((document.getElementById('form-matr-cerca') || {}).value || '').toLowerCase();
  document.querySelectorAll('#matrice-competenze tbody tr').forEach((tr) => {
    tr.style.display = !q || (tr.dataset.matrNome || '').includes(q) ? '' : 'none';
  });
}

// Toggle spunta competenza (admin) + punti automatici + rilevamento passaggio livello
async function toggleCompetenza(collabId, key, cb) {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_competenze')) {
    cb.checked = !cb.checked;
    toast('Non hai il permesso di certificare competenze');
    return;
  }
  const c = collaboratoriCache.find((x) => x.id === collabId);
  if (!c) return;
  const prima = livelloDiCollaboratore(c);
  const nuove = Object.assign({}, c.competenze || {});
  const attiva = cb.checked;
  nuove[key] = attiva;
  // SCALA DEI LIVELLI: certificare un livello implica quelli inferiori
  // (chi fa Back Office ha passato anche Sala, Reception e Cassa)
  const compsRep = getCompetenzeReparto();
  const compAtt = compsRep.find((k) => k.key === key);
  const lvAtt = compAtt ? parseInt(compAtt.livello) || 0 : 0;
  const implicate = [];
  if (attiva && lvAtt > 1) {
    compsRep.forEach((k) => {
      const lv = parseInt(k.livello) || 0;
      if (lv > 0 && lv < lvAtt && nuove[k.key] !== true) {
        nuove[k.key] = true;
        implicate.push(k.label);
      }
    });
  }
  if (!attiva && lvAtt > 0) {
    const superiori = compsRep.filter((k) => (parseInt(k.livello) || 0) > lvAtt && nuove[k.key] === true);
    if (superiori.length) {
      if (
        !confirm(
          c.nome +
            ' ha anche ' +
            superiori.map((k) => k.label).join(', ') +
            ' (livelli superiori che implicano questo).\nTogliere comunque solo "' +
            (compAtt ? compAtt.label : key) +
            '"?',
        )
      ) {
        cb.checked = true;
        return;
      }
    }
  }
  try {
    await secPatch('collaboratori', 'id=eq.' + collabId, { competenze: nuove });
    c.competenze = nuove;
    if (implicate.length) {
      toast('Spuntati anche i livelli inferiori: ' + implicate.join(', '));
      logAzione(
        'Competenze implicite',
        c.nome + ' · ' + implicate.join(', ') + ' (da ' + (compAtt ? compAtt.label : key) + ')',
      );
    }
    const compDef = getCompetenzeReparto().find((k) => k.key === key);
    logAzione('Competenza ' + (attiva ? 'certificata' : 'rimossa'), c.nome + ' · ' + (compDef ? compDef.label : key));
    // Traccia nello storico HR: cosa è stato formato, quando e da chi
    if (attiva && typeof _insertHrEvento === 'function') {
      const fmt = (prompt('Formatore che ha svolto la formazione (opzionale):', '') || '').trim();
      _insertHrEvento(
        c.nome,
        'formazione',
        'Competenza certificata: ' + (compDef ? compDef.label : key) + (fmt ? ' · formatore: ' + fmt : ''),
      );
    }
    // Rimozione spunta: se per questa competenza erano stati dati punti,
    // proponi di toglierli (con conferma)
    if (!attiva) {
      const descrizioneAward = 'Competenza certificata: ' + (compDef ? compDef.label : key);
      const eventi = (puntiEventiCache || []).filter(
        (e) => e.collaboratore === c.nome && e.azione === 'competenza' && (e.descrizione || '') === descrizioneAward,
      );
      for (const ev of eventi) {
        if (
          confirm(
            'A ' +
              c.nome +
              ' erano stati assegnati ' +
              ev.punti +
              ' punti per "' +
              (compDef ? compDef.label : key) +
              '" (' +
              (ev.data_evento || '') +
              ').\nTogliere anche i punti?',
          )
        ) {
          await secDel('punti_eventi', 'id=eq.' + ev.id);
          puntiEventiCache = puntiEventiCache.filter((x) => x.id !== ev.id);
          logAzione(
            'Punti rimossi',
            c.nome + ' -' + ev.punti + ' (competenza rimossa: ' + (compDef ? compDef.label : key) + ')',
          );
          toast('Rimossi ' + ev.punti + ' punti a ' + c.nome);
        }
      }
    }
    // Punti automatici per competenza certificata
    if (attiva) {
      const az = getPuntiConfig().azioni.find((a) => a.key === 'competenza');
      if (az && az.punti) {
        if (
          confirm(
            'Assegnare ' +
              az.punti +
              ' punti a ' +
              c.nome +
              ' per la competenza certificata "' +
              (compDef ? compDef.label : key) +
              '"?',
          )
        ) {
          await _insertPuntiEvento(
            c.nome,
            az.punti,
            'competenza',
            'Competenza certificata: ' + (compDef ? compDef.label : key),
          );
        }
      }
    }
    // Passaggio livello?
    const dopo = livelloDiCollaboratore(c);
    if (dopo > prima) {
      // Punti configurabili per ogni livello raggiunto (anche più livelli in un colpo)
      for (let lv = prima + 1; lv <= dopo; lv++) {
        const pl = parseInt(getPuntiConfig().punti_livello[String(lv)]) || 0;
        if (pl) await _insertPuntiEvento(c.nome, pl, 'livello_' + lv, 'Raggiunto Livello ' + lv + ' multidisciplinare');
      }
    }
    if (dopo > prima && dopo >= 2) {
      const premio = getPuntiConfig().premi_livello[String(dopo)];
      logAzione('Passaggio livello', c.nome + ' → Livello ' + dopo);
      if (typeof _insertHrEvento === 'function')
        _insertHrEvento(c.nome, 'livello', 'Raggiunto Livello ' + dopo + ' multidisciplinare');
      await _proponiContrattoFisso(c, dopo);
      _notificaIncentivo(
        c.nome,
        '🎉 ' + c.nome + ' → Livello ' + dopo,
        'Tutte le competenze fino al livello ' + dopo + ' completate' + (premio ? ' · premio: ' + premio : ''),
      );
      const b = document.getElementById('pwd-modal-content');
      b.innerHTML =
        '<h3><i class="icx icx-premio"></i> ' +
        escP(c.nome) +
        ' → Livello ' +
        dopo +
        '</h3><p style="margin-bottom:14px">Ha completato tutte le competenze fino al livello ' +
        dopo +
        '.</p>' +
        (premio
          ? '<p style="margin-bottom:16px">Premio previsto: <strong>' +
            escP(premio) +
            '</strong></p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="registraPremioConsegnato(\'' +
            c.nome.replace(/'/g, "\\'") +
            "','Livello " +
            dopo +
            ': ' +
            escP(premio).replace(/'/g, "\\'") +
            '\')">Registra premio consegnato</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Più tardi</button></div>'
          : '<div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>');
      document.getElementById('pwd-modal').classList.remove('hidden');
    }
    renderFormazione();
  } catch (e) {
    cb.checked = !attiva;
    toast('Errore salvataggio competenza');
  }
}
async function _insertPuntiEvento(nome, punti, azione, descrizione) {
  const r = await secPost('punti_eventi', {
    collaboratore: nome,
    punti: punti,
    azione: azione,
    descrizione: descrizione || '',
    data_evento: new Date().toISOString().split('T')[0],
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  });
  if (r && r[0]) puntiEventiCache.unshift(r[0]);
  logAzione('Punti assegnati', nome + ' ' + (punti > 0 ? '+' : '') + punti + ' (' + azione + ')');
  if (punti > 0)
    _notificaIncentivo(
      nome,
      '⭐ +' + punti + ' punti',
      (descrizione || azione) + ' · totale ' + puntiTotali(nome) + ' punti',
      true,
    );
}
async function assegnaPuntiRapido() {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_punti')) {
    toast('Non hai il permesso di assegnare punti');
    return;
  }
  const nome = (document.getElementById('pt-collab') || {}).value;
  const azKey = (document.getElementById('pt-azione') || {}).value;
  const nota = ((document.getElementById('pt-nota') || {}).value || '').trim();
  if (!nome || !azKey) return;
  let punti;
  let azione = azKey;
  if (azKey === 'manuale') {
    const v = prompt('Quanti punti? (negativo per togliere)', '10');
    if (v === null) return;
    punti = parseInt(v) || 0;
  } else {
    const az = getPuntiConfig().azioni.find((a) => a.key === azKey);
    if (!az) return;
    punti = az.punti;
  }
  try {
    await _insertPuntiEvento(nome, punti, azione, nota);
    document.getElementById('pt-nota').value = '';
    // Soglia premio appena raggiunta?
    const tot = puntiTotali(nome);
    const raggiunta = getPuntiConfig().soglie.find((s) => tot >= s.punti && tot - punti < s.punti);
    renderFormazione();
    toast(nome + ': ' + (punti > 0 ? '+' : '') + punti + ' punti (totale ' + tot + ')');
    if (raggiunta)
      _notificaIncentivo(
        nome,
        '🏆 Traguardo raggiunto: ' + raggiunta.premio,
        nome + ' ha raggiunto ' + raggiunta.punti + ' punti · premio: ' + raggiunta.premio,
      );
    if (raggiunta) {
      setTimeout(() => {
        const b = document.getElementById('pwd-modal-content');
        b.innerHTML =
          '<h3><i class="icx icx-trofeo"></i> Traguardo raggiunto!</h3><p style="margin-bottom:14px"><strong>' +
          escP(nome) +
          '</strong> ha raggiunto <strong>' +
          raggiunta.punti +
          ' punti</strong>.</p><p style="margin-bottom:16px">Premio: <strong>' +
          escP(raggiunta.premio) +
          '</strong></p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="registraPremioConsegnato(\'' +
          nome.replace(/'/g, "\\'") +
          "','" +
          escP(raggiunta.premio).replace(/'/g, "\\'") +
          '\')">Registra premio consegnato</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Più tardi</button></div>';
        document.getElementById('pwd-modal').classList.remove('hidden');
      }, 300);
    }
  } catch (e) {
    toast('Errore assegnazione punti');
  }
}
async function registraPremioConsegnato(nome, premio) {
  document.getElementById('pwd-modal').classList.add('hidden');
  if (typeof puoModificare === 'function' && !puoModificare('gestione_punti')) {
    toast('Non hai il permesso di registrare premi');
    return;
  }
  try {
    const soglia = _premioSogliaDi(premio);
    const ym = new Date().toISOString().substring(0, 7);
    const lim = soglia && parseInt(soglia.limite_mese) > 0 ? parseInt(soglia.limite_mese) : 0;
    if (lim) {
      const usati = _consegnatiMesePremio(soglia.premio, ym);
      if (usati >= lim) {
        if (
          confirm(
            'Limite mensile raggiunto per "' +
              soglia.premio +
              '" (' +
              usati +
              ' su ' +
              lim +
              ').\n\nMettere ' +
              nome +
              ' IN ATTESA con priorità dal mese prossimo?\n\nOK = in attesa · Annulla = consegna comunque (fuori limite)',
          )
        ) {
          await _insertPuntiEvento(nome, 0, 'premio_attesa', 'In attesa premio: ' + soglia.premio);
          logAzione('Premio in attesa', nome + ' · ' + soglia.premio + ' (limite mensile ' + lim + ' raggiunto)');
          _notificaIncentivo(
            nome,
            '⏳ Premio in attesa',
            nome +
              ': "' +
              soglia.premio +
              '" ha raggiunto il limite di questo mese · priorità dal 1° del mese prossimo',
            true,
          );
          renderFormazione();
          toast(nome + ' in attesa con priorità per: ' + soglia.premio);
          return;
        }
      }
    }
    // premio legato a un oggetto dell'inventario: scarico di 1 pezzo alla consegna
    if (soglia && soglia.inventario) {
      const cfg = getPuntiConfig();
      const item = (cfg.inventario || []).find((i) => i.nome === soglia.inventario);
      if (item) {
        const q = parseInt(item.qta) || 0;
        if (q <= 0) {
          if (!confirm('Inventario esaurito per "' + item.nome + '" (0 pezzi). Registrare comunque la consegna?'))
            return;
        } else {
          item.qta = q - 1;
          await savePuntiConfig(cfg);
          logAzione('Inventario premi', item.nome + ' −1 (consegna a ' + nome + '), restano ' + item.qta);
        }
      }
    }
    await _insertPuntiEvento(nome, 0, 'premio', 'Premio consegnato: ' + premio);
    if (typeof _insertHrEvento === 'function') _insertHrEvento(nome, 'premio', 'Premio consegnato: ' + premio);
    _notificaIncentivo(nome, '🎁 Premio consegnato', nome + ': ' + premio);
    renderFormazione();
    toast('Premio registrato per ' + nome);
  } catch (e) {
    toast('Errore registrazione premio');
  }
}
async function eliminaPuntiEvento(id) {
  if (!confirm('Eliminare questo movimento punti?')) return;
  try {
    await secDel('punti_eventi', 'id=eq.' + id);
    puntiEventiCache = puntiEventiCache.filter((p) => p.id !== id);
    logAzione('Punti evento eliminato', 'ID ' + id);
    renderFormazione();
    toast('Eliminato');
  } catch (e) {
    toast('Errore eliminazione');
  }
}

// ================================================================
// EXPORT MATRICE
// ================================================================
function _matriceRows() {
  const comps = getCompetenzeReparto();
  const collabs = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const head = [
    'Collaboratore',
    ...comps.map((k) => k.label + ' (L' + k.livello + ')'),
    'Livello',
    'Punti ' + new Date().getFullYear(),
  ];
  const rows = collabs.map((c) => [
    c.nome,
    ...comps.map((k) => ((c.competenze || {})[k.key] === true ? 'SI' : '-')),
    livelloDiCollaboratore(c) || '-',
    puntiTotali(c.nome),
  ]);
  return { head, rows };
}
function esportaMatriceCSV() {
  const { head, rows } = _matriceRows();
  const blob = new Blob(
    ['﻿' + [head, ...rows].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'matrice_competenze_' + currentReparto + '_' + new Date().toISOString().split('T')[0] + '.csv',
  }).click();
  toast('Matrice CSV esportata!');
}
async function esportaMatricePDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const { head, rows } = _matriceRows();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;
  if (_logoB64)
    try {
      doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
    } catch (e) {}
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Matrice Competenze · Progetto Multidisciplinarità', pw / 2, y, {
    align: 'center',
  });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    'Reparto ' +
      currentReparto.charAt(0).toUpperCase() +
      currentReparto.slice(1) +
      ' · ' +
      new Date().toLocaleDateString('it-IT') +
      ' · Casino Lugano SA',
    pw / 2,
    y,
    { align: 'center' },
  );
  y += 8;
  doc.setTextColor(0);
  doc.autoTable({
    theme: 'grid',
    startY: y,
    margin: { left: 14, right: 14 },
    head: [head],
    body: rows,
    headStyles: {
      fillColor: [26, 18, 8],
      textColor: [250, 247, 242],
      fontSize: 8,
    },
    styles: {
      lineColor: [220, 215, 205],
      lineWidth: 0.15,
      fontSize: 8.5,
      cellPadding: 2.5,
      halign: 'center',
    },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    didParseCell: function (d) {
      if (d.section === 'body' && d.cell.raw === 'SI') {
        d.cell.styles.textColor = [44, 110, 73];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA · Matrice competenze · Riservato', 14, doc.internal.pageSize.getHeight() - 8);
  mostraPdfPreview(doc, 'matrice_competenze_' + currentReparto + '.pdf', 'Matrice Competenze');
}

// Report annuale incentivi per HR: riepilogo per collaboratore + registro premi + movimenti punti
async function esportaReportIncentiviPDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const anno = parseInt((document.getElementById('ri-anno') || {}).value) || new Date().getFullYear();
  const azLabels = {};
  getPuntiConfig().azioni.forEach((a) => (azLabels[a.key] = a.label));
  azLabels.premio = 'Premio consegnato';
  azLabels.manuale = 'Assegnazione manuale';
  const eventi = getPuntiReparto().filter((p) => (p.data_evento || '').startsWith(String(anno)));
  const collabs = getCollaboratoriReparto();
  const righe = collabs
    .map((c) => {
      const premiCons = eventi.filter(
        (p) => p.azione === 'premio' && p.collaboratore.toLowerCase() === c.nome.toLowerCase(),
      );
      return {
        nome: c.nome,
        lv: livelloDiCollaboratore(c),
        punti: puntiTotali(c.nome, anno),
        cop: conteggioAzione(c.nome, 'copertura', anno),
        rif: conteggioAzione(c.nome, 'disponibilita_negata', anno),
        raggiunti: sogliePremiRaggiunti(c.nome, anno).join(', '),
        consegnati: premiCons.length,
      };
    })
    .filter((r) => r.punti !== 0 || r.lv > 0 || r.cop || r.rif || r.consegnati)
    .sort((a, b) => b.punti - a.punti);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;
  if (_logoB64)
    try {
      doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
    } catch (e) {}
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Report Incentivi ' + anno + ' · Progetto Multidisciplinarità', pw / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    'Reparto ' +
      currentReparto.charAt(0).toUpperCase() +
      currentReparto.slice(1) +
      ' · generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' · Casino Lugano SA · Documento riservato HR',
    pw / 2,
    y,
    { align: 'center' },
  );
  y += 8;
  doc.setTextColor(0);
  const stiliTab = {
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242], fontSize: 8 },
    styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 247, 242] },
  };
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Collaboratore', 'Livello', 'Punti ' + anno, 'Coperture', 'Rifiuti', 'Premi raggiunti', 'Consegnati']],
      body: righe.length
        ? righe.map((r) => [r.nome, r.lv ? 'L' + r.lv : '-', r.punti, r.cop, r.rif, r.raggiunti || '-', r.consegnati])
        : [['Nessun dato per il ' + anno, '', '', '', '', '', '']],
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    }),
  );
  y = doc.lastAutoTable.finalY + 10;
  const premi = eventi
    .filter((p) => p.azione === 'premio')
    .sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Registro premi consegnati', 14, y);
  y += 4;
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Data', 'Collaboratore', 'Premio', 'Registrato da']],
      body: premi.length
        ? premi.map((p) => [
            p.data_evento ? new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') : '',
            p.collaboratore,
            (p.descrizione || '').replace(/^Premio consegnato:\s*/, ''),
            p.operatore || '',
          ])
        : [['Nessun premio consegnato nel ' + anno, '', '', '']],
      columnStyles: { 1: { fontStyle: 'bold' } },
    }),
  );
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Movimenti punti ' + anno, 14, y);
  y += 4;
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Data', 'Collaboratore', 'Punti', 'Azione', 'Nota', 'Operatore']],
      body: eventi.length
        ? eventi
            .slice()
            .sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''))
            .map((p) => [
              p.data_evento ? new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') : '',
              p.collaboratore,
              (p.punti > 0 ? '+' : '') + p.punti,
              azLabels[p.azione] || p.azione,
              p.descrizione || '',
              p.operatore || '',
            ])
        : [['Nessun movimento nel ' + anno, '', '', '', '', '']],
      columnStyles: { 2: { halign: 'center', fontStyle: 'bold' } },
    }),
  );
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA · Report incentivi · Riservato HR', 14, doc.internal.pageSize.getHeight() - 8);
  logAzione('Report incentivi', 'PDF esportato · reparto ' + currentReparto + ', anno ' + anno);
  mostraPdfPreview(doc, 'report_incentivi_' + currentReparto + '_' + anno + '.pdf', 'Report Incentivi');
}

// ================================================================
// CONFIG ADMIN (competenze per reparto + punti + soglie)
// ================================================================
function _renderFormazioneConfig() {
  const cfgC = getCompetenzeConfigAll();
  const cfgP = getPuntiConfig();
  let html = '<div class="settings-section"><h4>Configurazione (admin)</h4>';
  // nomi dei livelli personalizzabili
  html +=
    '<p style="font-size:.85rem;font-weight:700;margin:8px 0 4px">Nomi dei livelli · ' +
    escP(repartoLabel(currentReparto)) +
    '</p><p style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Personalizza come si chiamano i livelli (es. L1 = "Base Sala"). Vuoto = nome standard.</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">';
  for (let lv = 1; lv <= 5; lv++) {
    const attuale = ((window._livelliNomiCfg || {})[currentReparto] || {})[String(lv)] || '';
    html +=
      '<label style="font-size:.8rem;display:flex;align-items:center;gap:4px">L' +
      lv +
      ' = <input type="text" value="' +
      escP(attuale) +
      '" placeholder="Livello ' +
      lv +
      '" maxlength="30" onchange="salvaNomeLivello(' +
      lv +
      ',this.value)" style="width:130px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></label>';
  }
  html += '</div>';
  // competenze per reparto
  getReparti()
    .map((r) => r.key)
    .forEach((rep) => {
      html +=
        '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:12px 0 6px">Competenze ' +
        escP(repartoLabel(rep)) +
        '</p>';
      (cfgC[rep] || []).forEach((k, i) => {
        html +=
          '<div class="tipo-item"><div class="tipo-item-name">' +
          escP(k.label) +
          ' <span class="tipo-item-default">(L' +
          k.livello +
          ')</span></div><button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2)" onclick="rinominaCompetenzaCfg(\'' +
          rep +
          "'," +
          i +
          ')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="rimuoviCompetenzaCfg(\'' +
          rep +
          "'," +
          i +
          ')">Rimuovi</button></div>';
      });
      html +=
        '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Nuova competenza</label><input type="text" id="cfg-comp-nome-' +
        rep +
        '" placeholder="Es: ' +
        (rep === 'tavoli' ? 'Chef de table' : 'Nuova competenza') +
        '..."></div><div class="field"><label>Livello</label><select id="cfg-comp-lv-' +
        rep +
        '" style="padding:10px;width:90px"><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option><option value="4">L4</option><option value="5">L5</option><option value="0">Extra</option></select></div><button class="btn-add-tipo" onclick="aggiungiCompetenzaCfg(\'' +
        rep +
        '\')">+ Aggiungi</button></div>';
    });
  // punti azioni
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Azioni e punti</p>';
  cfgP.azioni.forEach((a, i) => {
    html +=
      '<div class="tipo-item"><div class="tipo-item-name">' +
      escP(a.label) +
      '</div><input type="number" value="' +
      a.punti +
      '" onchange="modificaPuntiAzione(' +
      i +
      ',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><button class="btn-del-tipo" style="margin-left:6px;color:var(--accent2);border-color:var(--accent2)" onclick="rinominaAzioneCfg(' +
      i +
      ')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="rimuoviAzioneCfg(' +
      i +
      ')">Rimuovi</button></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Nuova azione</label><input type="text" id="cfg-az-nome" placeholder="Es: Straordinario festivo..."></div><div class="field"><label>Punti</label><input type="number" id="cfg-az-punti" value="5" style="width:90px"></div><button class="btn-add-tipo" onclick="aggiungiAzioneCfg()">+ Aggiungi</button></div>';
  // soglie premi
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Soglie premi (punti annuali)</p>';
  html +=
    '<p style="font-size:.75rem;color:var(--muted);margin:0 0 6px">Max/mese: quanti se ne possono consegnare al mese (vuoto = senza limite, dipende dal budget). Chi resta fuori va in attesa con priorità dal mese dopo. Inventario: se il premio è un oggetto aziendale, alla consegna viene scalato di 1.</p>';
  const invNomi = (cfgP.inventario || []).map((x) => x.nome).filter(Boolean);
  cfgP.soglie.forEach((s, i) => {
    html +=
      '<div class="tipo-item"><input type="number" value="' +
      s.punti +
      '" onchange="modificaSoglia(' +
      i +
      ',\'punti\',this.value)" style="width:80px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><input type="text" value="' +
      escP(s.premio) +
      '" onchange="modificaSoglia(' +
      i +
      ',\'premio\',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><input type="number" min="0" value="' +
      (parseInt(s.limite_mese) > 0 ? parseInt(s.limite_mese) : '') +
      '" placeholder="max/mese" title="Massimo consegnabili al mese (vuoto = illimitato)" onchange="modificaSoglia(' +
      i +
      ',\'limite_mese\',this.value)" style="width:78px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><select title="Oggetto dell\'inventario collegato (scalato alla consegna)" onchange="modificaSoglia(' +
      i +
      ",'inventario',this.value)\" style=\"width:120px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)\"><option value=''" +
      (!s.inventario ? ' selected' : '') +
      '>· inventario</option>' +
      invNomi
        .map(
          (n) =>
            '<option value="' + escP(n) + '"' + (s.inventario === n ? ' selected' : '') + '>' + escP(n) + '</option>',
        )
        .join('') +
      '</select><button class="btn-del-tipo" onclick="rimuoviSoglia(' +
      i +
      ')">Rimuovi</button></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Punti</label><input type="number" id="cfg-soglia-punti" value="100" style="width:90px"></div><div class="field"><label>Premio</label><input type="text" id="cfg-soglia-premio" placeholder="Es: Buono ristorante..."></div><button class="btn-add-tipo" onclick="aggiungiSoglia()">+ Aggiungi</button></div>';
  // inventario premi (oggetti aziendali: watch, cuffie...)
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Inventario premi (oggetti aziendali)</p>';
  (cfgP.inventario || []).forEach((it, i) => {
    html +=
      '<div class="tipo-item"><input type="text" value="' +
      escP(it.nome || '') +
      '" onchange="modificaInvIncentivo(' +
      i +
      ',\'nome\',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><input type="number" min="0" value="' +
      (parseInt(it.qta) || 0) +
      '" title="Pezzi disponibili" onchange="modificaInvIncentivo(' +
      i +
      ',\'qta\',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><input type="text" value="' +
      escP(it.note || '') +
      '" placeholder="note" onchange="modificaInvIncentivo(' +
      i +
      ',\'note\',this.value)" style="width:160px;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><button class="btn-del-tipo" onclick="rimuoviInvIncentivo(' +
      i +
      ')">Rimuovi</button></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Oggetto</label><input type="text" id="cfg-inv-nome" placeholder="Es: Smartwatch, Cuffie..."></div><div class="field"><label>Pezzi</label><input type="number" id="cfg-inv-qta" value="1" min="0" style="width:80px"></div><button class="btn-add-tipo" onclick="aggiungiInvIncentivo()">+ Aggiungi</button></div>';
  html +=
    '<p style="font-size:.75rem;color:var(--muted);margin:2px 0 0">Ogni scarico alla consegna resta tracciato nel Registro attività.</p>';
  // punti passaggio livello
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Punti al raggiungimento del livello (0 = disattivato)</p>';
  [1, 2, 3].forEach((l) => {
    html +=
      '<div class="tipo-item"><div class="tipo-item-name">Livello ' +
      l +
      (l === 3 ? ' <span class="tipo-item-default">(completamento di tutti i livelli)</span>' : '') +
      '</div><input type="number" value="' +
      (parseInt(cfgP.punti_livello[String(l)]) || 0) +
      '" onchange="modificaPuntiLivello(' +
      l +
      ',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"></div>';
  });
  // premi livello
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Premi passaggio livello</p>';
  [2, 3].forEach((l) => {
    html +=
      '<div class="tipo-item"><div class="tipo-item-name">Livello ' +
      l +
      (l === 3 ? ' <span class="tipo-item-default">(completamento di tutti i livelli)</span>' : '') +
      '</div><input type="text" value="' +
      escP(cfgP.premi_livello[String(l)] || '') +
      '" onchange="modificaPremioLivello(' +
      l +
      ',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></div>';
  });
  // notifiche incentivi
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Notifiche incentivi</p>';
  html +=
    '<div class="tipo-item"><div class="tipo-item-name">Premi e passaggi di livello</div><select onchange="modificaNotificheCfg(this.value)" style="padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
    '<option value="privato"' +
    (cfgP.notifiche === 'privato' ? ' selected' : '') +
    '>Privato (solo interessato)</option><option value="tutti"' +
    (cfgP.notifiche === 'tutti' ? ' selected' : '') +
    '>Annuncio a tutti</option><option value="off"' +
    (cfgP.notifiche === 'off' ? ' selected' : '') +
    '>Disattivate</option></select></div>';
  html +=
    '<p style="font-size:.75rem;color:var(--muted);margin:4px 0 0">I punti personali arrivano sempre e solo all\'interessato (se ha un account operatore con notifiche attive). La scelta qui sopra riguarda premi raggiunti, premi consegnati e passaggi di livello. Per HR usa il pulsante "Report Incentivi PDF" nella sezione Traguardi.</p>';
  html += '</div>';
  return html;
}
async function modificaNotificheCfg(val) {
  const cfg = getPuntiConfig();
  cfg.notifiche = val === 'tutti' || val === 'off' ? val : 'privato';
  await savePuntiConfig(cfg);
  logAzione('Notifiche incentivi', 'Modalità: ' + cfg.notifiche);
  toast(
    'Notifiche incentivi: ' +
      (cfg.notifiche === 'tutti' ? 'annuncio a tutti' : cfg.notifiche === 'off' ? 'disattivate' : 'privato'),
  );
}
async function aggiungiCompetenzaCfg(rep) {
  const nome = (document.getElementById('cfg-comp-nome-' + rep) || {}).value.trim();
  const lv = parseInt((document.getElementById('cfg-comp-lv-' + rep) || {}).value) || 1;
  if (!nome) {
    toast('Inserisci un nome');
    return;
  }
  const cfg = getCompetenzeConfigAll();
  const key = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (cfg[rep].find((k) => k.key === key)) {
    toast('Competenza già esistente');
    return;
  }
  cfg[rep] = [...cfg[rep], { key, label: nome, livello: lv }];
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza config aggiunta', rep + ': ' + nome + ' (L' + lv + ')');
  renderFormazione();
  toast('Competenza aggiunta');
}
// Rinomina: cambia solo l'etichetta visualizzata; la chiave interna resta invariata,
// quindi le spunte già assegnate ai collaboratori vengono conservate.
async function rinominaCompetenzaCfg(rep, idx) {
  const cfg = getCompetenzeConfigAll();
  const k = cfg[rep][idx];
  if (!k) return;
  const nuovo = prompt('Nuovo nome per "' + k.label + '":', k.label);
  if (nuovo === null) return;
  const label = nuovo.trim();
  if (!label) {
    toast('Inserisci un nome');
    return;
  }
  const vecchio = k.label;
  cfg[rep][idx] = Object.assign({}, k, { label });
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza rinominata', rep + ': ' + vecchio + ' → ' + label);
  renderFormazione();
  toast(vecchio + ' → ' + label);
}
async function rimuoviCompetenzaCfg(rep, idx) {
  const cfg = getCompetenzeConfigAll();
  const k = cfg[rep][idx];
  if (!k) return;
  if (!confirm('Rimuovere "' + k.label + '"? Le spunte esistenti non verranno cancellate ma non saranno più visibili.'))
    return;
  cfg[rep] = cfg[rep].filter((_, i) => i !== idx);
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza config rimossa', rep + ': ' + k.label);
  renderFormazione();
}
async function aggiungiAzioneCfg() {
  const nome = (document.getElementById('cfg-az-nome') || {}).value.trim();
  const punti = parseInt((document.getElementById('cfg-az-punti') || {}).value) || 0;
  if (!nome) {
    toast('Inserisci un nome');
    return;
  }
  const cfg = getPuntiConfig();
  const key = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  cfg.azioni = [...cfg.azioni, { key, label: nome, punti }];
  await savePuntiConfig(cfg);
  renderFormazione();
  toast('Azione aggiunta');
}
async function modificaPuntiAzione(idx, val) {
  const cfg = getPuntiConfig();
  if (!cfg.azioni[idx]) return;
  cfg.azioni[idx].punti = parseInt(val) || 0;
  await savePuntiConfig(cfg);
  toast('Punti aggiornati');
}
// Rinomina azione punti: cambia solo l'etichetta; il registro storico resta coerente
// perché i movimenti referenziano la chiave interna, non il nome.
async function rinominaAzioneCfg(idx) {
  const cfg = getPuntiConfig();
  const a = cfg.azioni[idx];
  if (!a) return;
  const nuovo = prompt('Nuovo nome per "' + a.label + '":', a.label);
  if (nuovo === null) return;
  const label = nuovo.trim();
  if (!label) {
    toast('Inserisci un nome');
    return;
  }
  const vecchio = a.label;
  cfg.azioni[idx] = Object.assign({}, a, { label });
  await savePuntiConfig(cfg);
  logAzione('Azione punti rinominata', vecchio + ' → ' + label);
  renderFormazione();
  toast(vecchio + ' → ' + label);
}
async function rimuoviAzioneCfg(idx) {
  const cfg = getPuntiConfig();
  const a = cfg.azioni[idx];
  if (!a) return;
  if (!confirm('Rimuovere "' + a.label + '"?')) return;
  cfg.azioni = cfg.azioni.filter((_, i) => i !== idx);
  await savePuntiConfig(cfg);
  renderFormazione();
}
async function aggiungiSoglia() {
  const punti = parseInt((document.getElementById('cfg-soglia-punti') || {}).value) || 0;
  const premio = ((document.getElementById('cfg-soglia-premio') || {}).value || '').trim();
  if (!punti || !premio) {
    toast('Compila punti e premio');
    return;
  }
  const cfg = getPuntiConfig();
  cfg.soglie = [...cfg.soglie, { punti, premio }].sort((a, b) => a.punti - b.punti);
  await savePuntiConfig(cfg);
  renderFormazione();
  toast('Soglia aggiunta');
}
async function modificaSoglia(idx, campo, val) {
  const cfg = getPuntiConfig();
  if (!cfg.soglie[idx]) return;
  if (campo === 'punti') cfg.soglie[idx][campo] = parseInt(val) || 0;
  else if (campo === 'limite_mese') cfg.soglie[idx][campo] = parseInt(val) > 0 ? parseInt(val) : null;
  else cfg.soglie[idx][campo] = val;
  await savePuntiConfig(cfg);
  toast('Soglia aggiornata');
}
async function aggiungiInvIncentivo() {
  const nome = ((document.getElementById('cfg-inv-nome') || {}).value || '').trim();
  const qta = parseInt((document.getElementById('cfg-inv-qta') || {}).value) || 0;
  if (!nome) {
    toast("Inserisci il nome dell'oggetto");
    return;
  }
  const cfg = getPuntiConfig();
  if (cfg.inventario.some((i) => i.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Oggetto già in inventario');
    return;
  }
  cfg.inventario = [...cfg.inventario, { nome, qta, note: '' }];
  await savePuntiConfig(cfg);
  logAzione('Inventario premi', 'Aggiunto: ' + nome + ' (' + qta + ' pezzi)');
  renderFormazione();
}
async function modificaInvIncentivo(idx, campo, val) {
  const cfg = getPuntiConfig();
  if (!cfg.inventario[idx]) return;
  const prima = cfg.inventario[idx][campo];
  cfg.inventario[idx][campo] = campo === 'qta' ? Math.max(0, parseInt(val) || 0) : val;
  await savePuntiConfig(cfg);
  if (campo === 'qta')
    logAzione('Inventario premi', cfg.inventario[idx].nome + ': ' + prima + ' → ' + cfg.inventario[idx].qta);
  toast('Inventario aggiornato');
}
async function rimuoviInvIncentivo(idx) {
  const cfg = getPuntiConfig();
  if (!cfg.inventario[idx]) return;
  if (!confirm('Rimuovere "' + cfg.inventario[idx].nome + '" dall\'inventario premi?')) return;
  logAzione('Inventario premi', 'Rimosso: ' + cfg.inventario[idx].nome);
  cfg.inventario = cfg.inventario.filter((_, i) => i !== idx);
  await savePuntiConfig(cfg);
  renderFormazione();
}
async function rimuoviSoglia(idx) {
  const cfg = getPuntiConfig();
  cfg.soglie = cfg.soglie.filter((_, i) => i !== idx);
  await savePuntiConfig(cfg);
  renderFormazione();
}
async function modificaPremioLivello(lv, val) {
  const cfg = getPuntiConfig();
  cfg.premi_livello[String(lv)] = val.trim();
  await savePuntiConfig(cfg);
  toast('Premio livello aggiornato');
}
async function modificaPuntiLivello(lv, val) {
  const cfg = getPuntiConfig();
  cfg.punti_livello[String(lv)] = parseInt(val) || 0;
  await savePuntiConfig(cfg);
  logAzione('Punti livello', 'Livello ' + lv + ' → ' + (parseInt(val) || 0) + ' punti');
  toast('Punti livello ' + lv + ' aggiornati');
}

// ================================================================
// POPUP COPERTURA MALATTIA
// Appare quando si registra una malattia (Diario o rapporto giornaliero):
// chiede chi copre il turno (+punti) e chi NON ha dato disponibilità (-punti).
// Ritorna una Promise risolta alla chiusura (per accodare più assenze).
// ================================================================
// Data di riferimento della copertura per una registrazione malattia:
// primo giorno del range se indicato nel testo, altrimenti la data della registrazione.
function _dataRifCopertura(entry) {
  const m = (entry.testo || '').match(/dal (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return (entry.data || '').substring(0, 10);
}
// Eventi copertura/rifiuto già registrati per una specifica assenza
function eventiCopertura(assente, dataRif) {
  if (!assente) return [];
  const dataLabel = dataRif ? new Date(dataRif + 'T12:00:00').toLocaleDateString('it-IT') : '';
  const nomeL = assente.toLowerCase();
  return getPuntiReparto().filter(
    (p) =>
      (p.azione === 'copertura' || p.azione === 'disponibilita_negata') &&
      (p.descrizione || '').toLowerCase().includes(nomeL) &&
      (p.descrizione || '').includes('del ' + dataLabel),
  );
}
// Badge riassuntivo per la riga del diario ("Coperto: X" / "Senza copertura" / rifiuti)
function badgeCoperturaHtml(entry) {
  const ev = eventiCopertura(entry.nome, _dataRifCopertura(entry));
  const cop = ev.find((p) => p.azione === 'copertura');
  const rifiuti = ev.filter((p) => p.azione === 'disponibilita_negata').length;
  let h = '';
  if (cop)
    h +=
      '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:#1a7a6d;color:white;border-radius:2px;font-size:.74rem;font-weight:700">Coperto: ' +
      escP(cop.collaboratore) +
      '</span>';
  else
    h +=
      '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:var(--muted);color:white;border-radius:2px;font-size:.74rem;font-weight:600">Senza copertura</span>';
  if (rifiuti)
    h +=
      '<span style="display:inline-block;margin-left:4px;padding:2px 8px;background:var(--accent);color:white;border-radius:2px;font-size:.74rem;font-weight:700">' +
      rifiuti +
      ' rifiut' +
      (rifiuti === 1 ? 'o' : 'i') +
      '</span>';
  return h;
}
function apriPopupCopertura(assente, dataRif) {
  return new Promise((resolve) => {
    window._copResolve = resolve;
    window._copCtx = { assente, dataRif: dataRif || new Date().toISOString().split('T')[0] };
    _renderPopupCopertura();
  });
}
function _renderPopupCopertura() {
  const ctx = window._copCtx;
  if (!ctx) return;
  const assente = ctx.assente;
  const collabs = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false && c.nome.toLowerCase() !== (assente || '').toLowerCase())
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!collabs.length) {
    _chiudiPopupCopertura(false);
    return;
  }
  const cfg = getPuntiConfig();
  const azCop = cfg.azioni.find((a) => a.key === 'copertura');
  const azNeg = cfg.azioni.find((a) => a.key === 'disponibilita_negata');
  const dataLabel = ctx.dataRif ? new Date(ctx.dataRif + 'T12:00:00').toLocaleDateString('it-IT') : 'oggi';
  let html =
    '<h3>Copertura turno · ' +
    escP(assente) +
    '</h3><p style="color:var(--muted);font-size:.84rem;margin-bottom:14px">Assenza del ' +
    dataLabel +
    '. Se il turno non viene sostituito, chiudi con "Nessuna copertura".</p>';
  // Già registrato per questa assenza (con possibilità di rimuovere/correggere)
  const esistenti = eventiCopertura(assente, ctx.dataRif);
  if (esistenti.length) {
    html +=
      '<div style="margin-bottom:14px;padding:10px 12px;background:var(--paper2);border-radius:3px;border-left:3px solid var(--accent2)"><div style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:6px">Già registrato</div>' +
      esistenti
        .map(
          (p) =>
            '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.86rem"><strong>' +
            escP(p.collaboratore) +
            '</strong><span style="color:' +
            (p.punti < 0 ? 'var(--accent)' : '#1a7a6d') +
            ';font-weight:700">' +
            (p.punti > 0 ? '+' : '') +
            p.punti +
            '</span><span style="color:var(--muted);font-size:.78rem;flex:1">' +
            (p.azione === 'copertura' ? 'copertura' : 'rifiuto disponibilità') +
            '</span><button class="btn-act del" style="font-size:.68rem" onclick="_rimuoviEventoCopertura(' +
            p.id +
            ')">Rimuovi</button></div>',
        )
        .join('') +
      '</div>';
  }
  html +=
    '<div class="pwd-field"><label>Chi copre il turno' +
    (azCop ? ' (+' + azCop.punti + ' punti)' : '') +
    '</label><select id="cop-chi" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option value="">· Nessuno / da decidere ·</option>' +
    collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
    '</select></div>';
  if (azNeg) {
    html +=
      '<div class="pwd-field"><label>Chi NON ha dato disponibilità (' +
      azNeg.punti +
      ' punti ciascuno)</label><div style="max-height:170px;overflow-y:auto;border:1px solid var(--line);border-radius:2px;padding:6px 10px;background:var(--paper2)">' +
      collabs
        .map(
          (c) =>
            '<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:.9rem"><input type="checkbox" class="cop-negato-cb" value="' +
            escP(c.nome).replace(/"/g, '&quot;') +
            '" style="width:16px;height:16px"> ' +
            escP(c.nome) +
            '</label>',
        )
        .join('') +
      '</div></div>';
  }
  html +=
    '<div class="pwd-field"><label>Nota (opzionale)</label><input type="text" id="cop-nota" placeholder="Es: doppio turno, chiamati in 3..."></div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="_chiudiPopupCopertura(false)">Nessuna copertura</button><button class="btn-modal-ok" onclick="_chiudiPopupCopertura(true)">Conferma</button></div>';
  html +=
    '<p style="font-size:.72rem;color:var(--muted);text-align:center;margin-top:8px">Puoi sempre assegnare o correggere i punti dopo, dalla pagina Formazione.</p>';
  document.getElementById('pwd-modal-content').innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _rimuoviEventoCopertura(id) {
  const p = puntiEventiCache.find((x) => x.id === id);
  if (!p) return;
  if (
    !confirm(
      'Rimuovere "' +
        (p.azione === 'copertura' ? 'copertura' : 'rifiuto') +
        '" di ' +
        p.collaboratore +
        ' (' +
        (p.punti > 0 ? '+' : '') +
        p.punti +
        ' punti)?',
    )
  )
    return;
  try {
    await secDel('punti_eventi', 'id=eq.' + id);
    puntiEventiCache = puntiEventiCache.filter((x) => x.id !== id);
    logAzione('Copertura rimossa', p.collaboratore + ' (' + p.punti + ' pt) · ' + (p.descrizione || ''));
    toast('Rimosso');
    _renderPopupCopertura();
    if (typeof render === 'function' && localStorage.getItem('pagina_corrente') === 'diario') render();
  } catch (e) {
    toast('Errore rimozione');
  }
}
async function _chiudiPopupCopertura(conferma) {
  const ctx = window._copCtx || {};
  const resolve = window._copResolve;
  const dataLabel = ctx.dataRif ? new Date(ctx.dataRif + 'T12:00:00').toLocaleDateString('it-IT') : '';
  if (conferma) {
    const chi = (document.getElementById('cop-chi') || {}).value || '';
    const nota = ((document.getElementById('cop-nota') || {}).value || '').trim();
    const negati = [...document.querySelectorAll('.cop-negato-cb:checked')].map((cb) => cb.value);
    const cfg = getPuntiConfig();
    const azCop = cfg.azioni.find((a) => a.key === 'copertura');
    const azNeg = cfg.azioni.find((a) => a.key === 'disponibilita_negata');
    // Chi copre non può essere anche tra i rifiuti
    const negatiValidi = negati.filter((n) => n !== chi);
    try {
      if (chi && azCop) {
        await _insertPuntiEvento(
          chi,
          azCop.punti,
          'copertura',
          'Copertura per ' + ctx.assente + ' del ' + dataLabel + (nota ? ' · ' + nota : ''),
        );
      }
      if (azNeg) {
        for (const n of negatiValidi) {
          await _insertPuntiEvento(
            n,
            azNeg.punti,
            'disponibilita_negata',
            'Disponibilità negata per assenza di ' + ctx.assente + ' del ' + dataLabel + (nota ? ' · ' + nota : ''),
          );
        }
      }
      const parti = [];
      if (chi && azCop) parti.push(chi + ' +' + azCop.punti);
      if (negatiValidi.length && azNeg)
        parti.push(negatiValidi.length + ' rifiut' + (negatiValidi.length === 1 ? 'o' : 'i') + ' ' + azNeg.punti);
      if (parti.length) toast('Punti registrati: ' + parti.join(' · '));
    } catch (e) {
      toast('Errore registrazione punti');
    }
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  window._copCtx = null;
  window._copResolve = null;
  // Aggiorna i badge copertura nelle righe del diario
  if (typeof render === 'function' && localStorage.getItem('pagina_corrente') === 'diario') render();
  if (resolve) resolve(!!conferma);
}

// Soglia (mesi di anzianità in più) per la segnalazione di equità categorie
async function salvaEquitaMesi(val) {
  const m = parseInt(val) || 6;
  equitaMesi = m;
  await setImp('equita_mesi', String(m));
  logAzione('Soglia equità categorie', m + ' mesi');
  renderFormazione();
  toast('Soglia equità: ' + m + ' mesi di anzianità');
}

// Card riservata HR: giubilei maturati da consegnare + in arrivo nei prossimi 12 mesi
function _renderGiubileiCard(collabs) {
  const daConsegnare = [];
  const inArrivo = [];
  const tra12mesi = new Date();
  tra12mesi.setFullYear(tra12mesi.getFullYear() + 1);
  collabs.forEach((c) => {
    const gb = giubileiCollaboratore(c);
    gb.maturati.filter((g) => !g.registrato).forEach((g) => daConsegnare.push({ nome: c.nome, g }));
    if (gb.prossimo && new Date(gb.prossimo.data + 'T12:00:00') <= tra12mesi)
      inArrivo.push({ nome: c.nome, g: gb.prossimo });
  });
  if (!daConsegnare.length && !inArrivo.length) return '';
  let html =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:8px">Premi giubileo <span class="mini-badge" style="background:var(--accent);font-size:.65rem">RISERVATO</span></div><div style="padding:14px 16px">';
  if (daConsegnare.length) {
    html +=
      '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:6px">Da consegnare</p>';
    daConsegnare.forEach((x) => {
      html +=
        '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--line);flex-wrap:wrap"><strong style="min-width:170px;cursor:pointer" onclick="apriSchedaCollaboratore(\'' +
        x.nome.replace(/'/g, "\\'") +
        '\')">' +
        escP(x.nome) +
        '</strong><span class="mini-badge" style="background:#8b6914;font-size:.72rem">' +
        x.g.anni +
        ' anni</span><span style="font-size:.84rem">maturato il ' +
        x.g.dataLabel +
        '</span><strong style="color:#8b6914">' +
        fmtCHF(x.g.importo) +
        ' CHF</strong></div>';
    });
  }
  if (inArrivo.length) {
    html +=
      '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:12px 0 6px">In arrivo (12 mesi)</p>';
    inArrivo.forEach((x) => {
      html +=
        '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;font-size:.84rem;color:var(--muted);flex-wrap:wrap"><span style="min-width:170px;color:var(--ink)">' +
        escP(x.nome) +
        '</span>' +
        x.g.anni +
        ' anni il ' +
        x.g.dataLabel +
        ' · ' +
        fmtCHF(x.g.importo) +
        ' CHF</div>';
    });
  }
  html +=
    '<p style="color:var(--muted);font-size:.75rem;margin-top:10px">La consegna si registra dalla scheda del collaboratore (Storico HR). Importi configurabili in Impostazioni → Premio giubileo.</p></div></div>';
  return html;
}

// Card riservata HR: numeri chiave del settore corrente · organico (fissi/jolly),
// distribuzione categorie e livelli, spese giubilei e premi incentivi consegnati
function _estraiChf(testo) {
  const m = String(testo || '').match(/([\d']+(?:\.\d+)?) CHF/);
  return m ? parseFloat(m[1].replace(/'/g, '')) : 0;
}
function _renderPanoramicaHrCard(collabs) {
  const anno = new Date().getFullYear();
  const fissi = collabs.filter((c) => c.impiego === 'fisso').length;
  const jolly = collabs.filter((c) => c.impiego === 'jolly').length;
  const senza = collabs.length - fissi - jolly;
  const perCat = {};
  collabs.forEach((c) => {
    if (c.categoria) perCat[c.categoria] = (perCat[c.categoria] || 0) + 1;
  });
  const perLiv = {};
  collabs.forEach((c) => {
    const lv = livelloDiCollaboratore(c);
    if (lv) perLiv[lv] = (perLiv[lv] || 0) + 1;
  });
  const giubilei = getHrEventiReparto().filter((e) => e.tipo === 'giubileo');
  const giubAnno = giubilei.filter((e) => (e.data_evento || '').startsWith(String(anno)));
  const spesaGiubAnno = giubAnno.reduce((s2, e) => s2 + _estraiChf(e.descrizione), 0);
  const spesaGiubTot = giubilei.reduce((s2, e) => s2 + _estraiChf(e.descrizione), 0);
  const premiAnno = getPuntiReparto().filter(
    (p) => p.azione === 'premio' && (p.data_evento || '').startsWith(String(anno)),
  ).length;
  // Collaboratori attivi ancora senza scheda di valutazione (nessuna, di nessun anno)
  const conValutazione = new Set(
    (typeof getValutazioniReparto === 'function' ? getValutazioniReparto() : []).map((v) =>
      (v.collaboratore || '').toLowerCase(),
    ),
  );
  const senzaVal = collabs.filter((c) => !conValutazione.has((c.nome || '').toLowerCase())).length;
  let html =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:8px">Panoramica HR · ' +
    escP(repartoLabel(currentReparto)) +
    ' <span class="mini-badge" style="background:var(--accent);font-size:.65rem">RISERVATO</span></div><div style="padding:14px 16px">';
  html +=
    '<div class="stats-bar" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:12px">';
  const kpi = (n, lbl, col) =>
    '<div class="stat"><div class="stat-num"' +
    (col ? ' style="color:' + col + '"' : '') +
    '>' +
    n +
    '</div><div class="stat-label">' +
    lbl +
    '</div></div>';
  html += kpi(collabs.length, 'Collaboratori');
  html += kpi(fissi, 'Fissi', '#1a7a6d');
  html += kpi(jolly, 'Jolly', '#e67e22');
  if (senza) html += kpi(senza, 'Senza inquadramento', 'var(--muted)');
  html += kpi(premiAnno, 'Premi consegnati ' + anno, '#b8860b');
  if (senzaVal) html += kpi(senzaVal, 'Senza valutazione', '#8a1c1c');
  html += kpi(fmtCHF(spesaGiubAnno) + ' CHF', 'Giubilei erogati ' + anno, '#8b6914');
  html += kpi(fmtCHF(spesaGiubTot) + ' CHF', 'Giubilei totali storici', '#8b6914');
  html += '</div>';
  const righe = [];
  const catStr = [5, 4, 3, 2, 1]
    .filter((n) => perCat[n])
    .map((n) => n + 'ª: <strong>' + perCat[n] + '</strong>')
    .join(' · ');
  if (catStr) righe.push('<span style="color:var(--muted)">Categorie ·</span> ' + catStr);
  const livStr = [1, 2, 3]
    .filter((n) => perLiv[n])
    .map((n) => 'L' + n + ': <strong>' + perLiv[n] + '</strong>')
    .join(' · ');
  if (livStr) righe.push('<span style="color:var(--muted)">Livelli multidisciplinari ·</span> ' + livStr);
  if (righe.length) html += '<p style="font-size:.86rem;line-height:1.8">' + righe.join('<br>') + '</p>';
  html +=
    '<p style="color:var(--muted);font-size:.75rem;margin-top:8px">Dati del settore corrente: usa lo switch settori in alto per vedere gli altri. Dettaglio per persona nella card Equità categorie.</p></div></div>';
  return html;
}

// Certificazione HEADLESS richiamata dal Piano (avviso "non formato" e
// formazioni completate dai commenti): stesso flusso della spunta in
// Formazione · scala dei livelli, storico HR, punti su conferma.
async function certificaCompetenzaDaPiano(nome, key, chiediPunti) {
  const c = collaboratoriCache.find((x) => x.nome === nome);
  if (!c) return false;
  const prima = livelloDiCollaboratore(c);
  const nuove = Object.assign({}, c.competenze || {});
  if (nuove[key] === true) return true;
  nuove[key] = true;
  const compsRep = getCompetenzeReparto();
  const compAtt = compsRep.find((k) => k.key === key);
  const lvAtt = compAtt ? parseInt(compAtt.livello) || 0 : 0;
  const implicate = [];
  if (lvAtt > 1)
    compsRep.forEach((k) => {
      const lv = parseInt(k.livello) || 0;
      if (lv > 0 && lv < lvAtt && nuove[k.key] !== true) {
        nuove[k.key] = true;
        implicate.push(k.label);
      }
    });
  await secPatch('collaboratori', 'id=eq.' + c.id, { competenze: nuove });
  c.competenze = nuove;
  logAzione(
    'Competenza certificata (dal Piano)',
    nome + ' · ' + (compAtt ? compAtt.label : key) + (implicate.length ? ' + ' + implicate.join(', ') : ''),
  );
  if (typeof _insertHrEvento === 'function') {
    const fmt = chiediPunti ? (prompt('Formatore che ha svolto la formazione (opzionale):', '') || '').trim() : '';
    _insertHrEvento(
      nome,
      'formazione',
      'Competenza certificata: ' + (compAtt ? compAtt.label : key) + (fmt ? ' · formatore: ' + fmt : ''),
    );
  }
  if (chiediPunti) {
    const az = getPuntiConfig().azioni.find((a) => a.key === 'competenza');
    if (
      az &&
      az.punti &&
      confirm('Assegnare ' + az.punti + ' punti a ' + nome + ' per "' + (compAtt ? compAtt.label : key) + '"?')
    )
      await _insertPuntiEvento(
        nome,
        az.punti,
        'competenza',
        'Competenza certificata: ' + (compAtt ? compAtt.label : key),
      );
    const dopo = livelloDiCollaboratore(c);
    for (let lv = prima + 1; lv <= dopo; lv++) {
      const pl = parseInt(getPuntiConfig().punti_livello[String(lv)]) || 0;
      if (pl) await _insertPuntiEvento(nome, pl, 'livello_' + lv, 'Raggiunto Livello ' + lv + ' multidisciplinare');
    }
    if (dopo > prima) await _proponiContrattoFisso(c, dopo);
  }
  toast(nome + ' certificato: ' + (compAtt ? compAtt.label : key));
  return true;
}
