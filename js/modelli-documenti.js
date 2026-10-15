/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: modelli-documenti.js
 *
 * MODELLI DEI DOCUMENTI (v453): i testi fissi dei documenti stampati (titoli, frasi
 * standard, diciture, firme, distribuzione) si cambiano dalle schermate, senza toccare il
 * codice. Valgono per: allineamento, apprezzamento, RDI (js/moduli.js), lista di non
 * disponibilita 1187 e notifica d assenza 827 (js/modulo-nd.js, js/piano-impostazioni.js),
 * foglio di cambio turno (js/piano-cambi.js) e formulario di cambio vacanza
 * (js/piano-schede.js).
 * - I testi ORIGINALI stanno qui sotto (MODELLI_DOC) e sono gli stessi di prima, carattere
 *   per carattere: senza modifiche salvate i PDF restano identici.
 * - Nel database (tabella modelli_documenti, migrazione 20260915) ci sono solo i testi
 *   cambiati; si leggono con leggi_modelli_documenti e si scrivono con
 *   salva_modello_documento, che controlla il permesso (amministratore o "Modelli dei
 *   documenti: modificare", gestione_modelli), conserva le versioni e scrive il Registro.
 * - Campi automatici: {nome}, {data}, {settore}, {responsabile}, {azienda}, {programma} e
 *   pochi altri per documento; un campo sconosciuto resta scritto com e.
 * - I campi compilati da chi fa il modulo (nome, testi, date...) non passano di qui.
 */

// campi automatici: nome -> spiegazione per l editor
const MODELLI_SEGNAPOSTI = {
  nome: 'nome e cognome del collaboratore',
  data: 'data del documento',
  settore: 'settore (nome nei documenti)',
  responsabile: 'responsabile di settore scritto nel modulo',
  azienda: "nome dell'azienda (Identità del programma)",
  programma: 'nome del programma (Identità del programma)',
  mese: 'mese di riferimento (es. novembre 2026)',
  giorno: 'giorno del mese entro cui consegnare la lista (Piano › Impostazioni)',
  richiesto: 'chi ha preparato il foglio',
};
const _MOD_BASE = ['azienda', 'programma'];
// Catalogo dei documenti. campi: k = chiave, e = etichetta nell editor, t = testo
// originale, r = righe (1 = una riga sola; piu righe = ogni riga va a capo nel PDF),
// n = nota per chi scrive. I testi sono quelli di sempre: NON cambiarli qui.
const _MOD_ETICHETTE_TABELLA = [
  { k: 'etich_collab', e: 'Tabella in alto: riga del collaboratore', t: 'Collaboratore' },
  { k: 'etich_resp', e: 'Tabella in alto: riga del responsabile', t: 'Resp. Settore' },
  { k: 'etich_data', e: 'Tabella in alto: riga della data', t: 'Data' },
];
const _MOD_SCADENZA = [
  { k: 'scad_titolo', e: 'Scadenza: titolo', t: 'Scadenza' },
  {
    k: 'scad_nota',
    e: 'Scadenza: spiegazione accanto al titolo',
    t: "(termine di verifica entro il quale si è concordato di raggiungere l'obiettivo di cui sopra)",
  },
  {
    k: 'scad_vuota',
    e: 'Scadenza scritta quando il campo del modulo è vuoto',
    t: 'A partire da subito',
    n: 'Compare anche come suggerimento nel campo Scadenza del modulo.',
  },
];
const MODELLI_DOC = {
  allineamento: {
    nome: 'Allineamento',
    descr: 'Rilevamento di non conformità e colloquio di allineamento (pagina Moduli)',
    segnaposti: ['nome', 'data', 'responsabile', 'settore'],
    campi: [
      { k: 'titolo', e: 'Titolo del documento', t: 'Rilevamento di non conformità e colloquio di allineamento' },
      ..._MOD_ETICHETTE_TABELLA,
      { k: 'sez_nonconf', e: 'Titolo della sezione: non conformità', t: 'Non conformità rilevata' },
      {
        k: 'sez_obiettivo',
        e: 'Titolo della sezione: obiettivo',
        t: 'Obiettivo concordato tra Collaboratore e Resp. Settore onde evitare il ripetersi della non conformità',
      },
      ..._MOD_SCADENZA,
      {
        k: 'chiusura',
        e: 'Frase di chiusura',
        t: "Chiediamo che, entro il termine sopra indicato, venga raggiunto l'obiettivo di cui sopra.",
        r: 3,
      },
      { k: 'firma_resp', e: 'Firma a sinistra', t: 'Firma del Resp. Settore' },
      { k: 'firma_collab', e: 'Firma a destra', t: 'Firma del collaboratore' },
      { k: 'distrib_titolo', e: 'Distribuzione: titolo', t: 'Distribuzione:' },
      {
        k: 'distribuzione',
        e: 'Distribuzione: a chi va (una riga per destinatario)',
        t: 'Diario di bordo del collaboratore\nResp. Settore',
        r: 4,
      },
    ],
  },
  apprezzamento: {
    nome: 'Apprezzamento',
    descr: 'Colloquio di apprezzamento (pagina Moduli)',
    segnaposti: ['nome', 'data', 'responsabile', 'settore'],
    campi: [
      { k: 'titolo', e: 'Titolo del documento', t: 'Colloquio di apprezzamento' },
      ..._MOD_ETICHETTE_TABELLA,
      { k: 'sez_descrizione', e: 'Titolo della sezione: descrizione', t: 'Descrizione' },
      {
        k: 'sez_osservazioni',
        e: 'Titolo della sezione: osservazioni',
        t: 'Osservazioni da parte del Resp. Settore',
      },
      { k: 'firma_resp', e: 'Firma a sinistra', t: 'Firma del Resp. Settore' },
      { k: 'firma_collab', e: 'Firma a destra', t: 'Firma del collaboratore' },
      { k: 'distrib_titolo', e: 'Distribuzione: titolo', t: 'Distribuzione:' },
      {
        k: 'distribuzione',
        e: 'Distribuzione: a chi va (una riga per destinatario)',
        t: 'Diario di bordo del collaboratore\nResp. Settore',
        r: 4,
      },
    ],
  },
  rdi: {
    nome: 'RDI',
    descr: 'Rapporto disciplinare interno, I° e II° livello (pagina Moduli)',
    segnaposti: ['nome', 'data', 'responsabile', 'settore'],
    campi: [
      { k: 'titolo', e: 'Titolo del documento', t: 'Rapporto disciplinare interno (RDI)' },
      ..._MOD_ETICHETTE_TABELLA,
      { k: 'sez_nonconf', e: 'Titolo della sezione: non conformità', t: 'Non conformità rilevata' },
      {
        k: 'sez_obiettivo',
        e: 'Titolo della sezione: obiettivo',
        t: 'Obiettivo concordato tra Collaboratore e Resp. Settore onde evitare il ripetersi della non conformità',
      },
      ..._MOD_SCADENZA,
      { k: 'vale_titolo', e: 'Livello: titolo', t: 'Il presente RDI vale quale' },
      { k: 'vale_nota', e: 'Livello: spiegazione accanto al titolo', t: '(segnare ciò che fa al caso)' },
      { k: 'livello1', e: 'Livello: prima casella', t: 'rapporto disciplinare interno di I° livello' },
      { k: 'livello2', e: 'Livello: seconda casella', t: 'rapporto disciplinare interno grave (II° livello)' },
      { k: 'firma_resp', e: 'Firma a sinistra', t: 'Firma del Resp. Settore' },
      { k: 'firma_collab', e: 'Firma a destra', t: 'Firma del collaboratore*' },
      {
        k: 'nota_firma',
        e: 'Nota sotto la firma del collaboratore',
        t: '* il collaboratore che non vuole sottoscrivere il rapporto disciplinare lo deve espressamente dichiarare, scrivendolo al posto della firma.',
        r: 3,
      },
      { k: 'distrib_titolo', e: 'Distribuzione: titolo', t: 'Distribuzione:' },
      {
        k: 'distribuzione',
        e: 'Distribuzione: a chi va (una riga per destinatario)',
        t: 'Resp. Settore\nResp. Risorse Umane',
        r: 4,
      },
    ],
  },
  nd1187: {
    nome: 'Lista di non disponibilità (1187)',
    descr: 'Modulo HR 1187 dei jolly: quello creato da solo con gli ND e quello vuoto di Piano › Formulari',
    segnaposti: ['nome', 'mese', 'giorno', 'data', 'settore'],
    varianti: [
      ['compilato', 'Compilato (con gli ND)'],
      ['vuoto', 'Vuoto da stampare'],
    ],
    campi: [
      { k: 'emittente', e: 'Intestazione: reparto che emette il modulo', t: '4 - Human Resources' },
      { k: 'codice', e: 'Intestazione: numero e nome del modulo', t: '1187 - LISTA NON DISPONIBILITA JOLLY' },
      {
        k: 'data_modulo',
        e: 'Intestazione: data della versione del modulo',
        t: '18/12/2012',
        n: 'Nel modulo vuoto si stampa la data del giorno.',
      },
      { k: 'redatto', e: 'Intestazione: redatto da', t: 'O. Sampietro' },
      { k: 'approvato', e: 'Intestazione: approvato da', t: 'Direttore' },
      { k: 'titolo', e: 'Titolo', t: 'LISTA DI NON DISPONIBILITÀ (JOLLY)' },
      { k: 'sotto_inizio', e: 'Sottotitolo: inizio', t: '- da trasmettere' },
      { k: 'sotto_evidenza', e: 'Sottotitolo: parte sottolineata', t: 'al massimo entro il {giorno}° giorno' },
      { k: 'sotto_fine', e: 'Sottotitolo: fine', t: 'del mese al Responsabile di settore -' },
      { k: 'etich_nome', e: 'Riga del nome', t: 'Nome e Cognome:' },
      { k: 'etich_mese', e: 'Riga del mese', t: 'Mese di riferimento:' },
      {
        k: 'frase',
        e: 'Frase prima dei giorni',
        t: 'vi informo che NON sarò disponibile per la pianificazione durante i giorni\nseguenti.',
        r: 3,
        n: 'Al massimo 3 righe.',
      },
      { k: 'col_giorno', e: 'Tabella: colonna del giorno', t: 'Giorno' },
      { k: 'col_nonsaro', e: 'Tabella: colonna della casella', t: 'Non sarò disponibile' },
      { k: 'col_oss', e: 'Tabella: colonna delle osservazioni', t: 'Eventuali osservazioni' },
      { k: 'firma_collab', e: 'Firma del collaboratore', t: 'Firma collaboratore (Jolly):' },
      { k: 'etich_data', e: 'Riga della data', t: 'Data:' },
      { k: 'visto', e: 'Visto del responsabile', t: 'Visto Resp. Settore:' },
    ],
  },
  assenza827: {
    nome: "Notifica d'assenza (827)",
    descr: 'Modulo HR 827 vuoto da stampare (Piano › Formulari)',
    segnaposti: ['settore'],
    campi: [
      { k: 'emittente', e: 'Intestazione: reparto che emette il modulo', t: '4 - Human Resources' },
      { k: 'codice', e: 'Intestazione: numero e nome del modulo', t: '827 - NOTIFICA DI ASSENZA' },
      { k: 'data_modulo', e: 'Intestazione: data della versione del modulo', t: '14/03/2012' },
      { k: 'redatto', e: 'Intestazione: redatto da', t: 'O. Sampietro' },
      { k: 'approvato', e: 'Intestazione: approvato da', t: 'AD CEO' },
      { k: 'titolo', e: 'Titolo', t: "NOTIFICA D'ASSENZA" },
      { k: 'sottotitolo', e: 'Sottotitolo', t: '- da trasmettere tempestivamente al Responsabile di settore -' },
      { k: 'etich_nome', e: 'Riga del nome', t: 'Nome e Cognome:' },
      { k: 'etich_settore', e: 'Riga del settore', t: 'Settore:' },
      { k: 'col_settimana', e: 'Tabella: colonna della settimana', t: 'Settimana' },
      { k: 'col_dal', e: 'Tabella: colonna "dal"', t: 'Dal' },
      { k: 'col_al', e: 'Tabella: colonna "al"', t: 'Al' },
      { k: 'col_giorni', e: 'Tabella: colonna dei giorni', t: 'Giorni' },
      { k: 'col_vacanze', e: 'Tabella: primo motivo', t: 'Vacanze', r: 2 },
      { k: 'col_recupero', e: 'Tabella: secondo motivo', t: 'Recupero', r: 2 },
      { k: 'col_militare', e: 'Tabella: terzo motivo', t: 'Servizio\nmilitare', r: 2 },
      { k: 'col_altro', e: 'Tabella: quarto motivo', t: 'Altro', r: 2 },
      { k: 'col_autor', e: 'Tabella: colonna dell autorizzazione', t: 'Autor.\nSI / NO', r: 2 },
      { k: 'note', e: 'Riga delle note', t: 'Altro / note:' },
      { k: 'luogo', e: 'Luogo e data', t: 'Luogo e data:' },
      { k: 'firma', e: 'Firma del collaboratore', t: 'Firma:' },
      { k: 'aut_titolo', e: 'Autorizzazione: titolo', t: 'AUTORIZZAZIONE CONCESSA:' },
      { k: 'aut_si', e: 'Autorizzazione: prima casella', t: 'SI, tutte le righe' },
      { k: 'aut_salvo', e: 'Autorizzazione: seconda casella', t: 'SI, salvo le righe:' },
      { k: 'aut_no', e: 'Autorizzazione: terza casella', t: 'NO' },
      { k: 'visto', e: 'Visto del responsabile', t: 'VISTO RESP. SETTORE:' },
      { k: 'etich_data', e: 'Data del responsabile', t: 'DATA:' },
      { k: 'motivazione', e: 'Riga della motivazione', t: 'In caso di mancata autorizzazione, motivazione:' },
    ],
  },
  cambio_turno: {
    nome: 'Foglio di cambio turno',
    descr: 'Richiesta di cambio turno e cambio per esigenze operative (Piano)',
    segnaposti: ['nome', 'data', 'settore', 'richiesto'],
    varianti: [
      ['scambio', 'Scambio tra colleghi'],
      ['esigenze', 'Cambio per esigenze'],
    ],
    campi: [
      { k: 'intestazione', e: 'Intestazione', t: '{azienda}' },
      { k: 'titolo', e: 'Titolo dello scambio tra colleghi', t: 'RICHIESTA CAMBIO TURNO' },
      { k: 'titolo_esigenze', e: 'Titolo del cambio per esigenze', t: 'CAMBIO TURNO PER ESIGENZE OPERATIVE' },
      { k: 'sez_a', e: 'Sezione del collaboratore A', t: 'Collaboratore A (richiedente)' },
      { k: 'sez_b', e: 'Sezione del collaboratore B', t: 'Collaboratore B (accetta lo scambio)' },
      { k: 'sez_collab', e: 'Sezione del collaboratore (cambio per esigenze)', t: 'Collaboratore' },
      { k: 'restituzione_titolo', e: 'Restituzione: titolo', t: 'Restituzione' },
      {
        k: 'restituzione_frase',
        e: 'Restituzione: frase',
        t: 'In questa data i turni verranno scambiati nuovamente tra i due collaboratori.',
      },
      { k: 'motivazione_titolo', e: 'Motivazione: titolo', t: 'Motivazione' },
      { k: 'motivo_vuoto', e: 'Motivazione quando non è scritta', t: 'Nessuna motivazione specificata' },
      { k: 'aut_titolo', e: 'Autorizzazione: titolo', t: 'Autorizzazione' },
      { k: 'aut_si', e: 'Autorizzazione: prima casella', t: 'Autorizzato' },
      { k: 'aut_no', e: 'Autorizzazione: seconda casella', t: 'Non autorizzato' },
      { k: 'aut_motivo', e: 'Autorizzazione: riga del motivo', t: 'Motivo:' },
      { k: 'firma_a', e: 'Firma del collaboratore A', t: 'Firma Collaboratore A' },
      { k: 'firma_b', e: 'Firma del collaboratore B', t: 'Firma Collaboratore B' },
      { k: 'firma_collab', e: 'Firma del collaboratore (cambio per esigenze)', t: 'Firma Collaboratore' },
      { k: 'firma_resp', e: 'Firma del responsabile', t: 'Firma Responsabile' },
      { k: 'piede', e: 'Piè di pagina', t: '{azienda} · Richiesto da: {richiesto}' },
    ],
  },
  cambio_vacanza: {
    nome: 'Formulario di cambio vacanza',
    descr: 'Richiesta di cambio vacanza, vuota o compilata dallo scambio di settimane (Piano › Vacanze)',
    segnaposti: ['nome', 'settore'],
    varianti: [
      ['vuoto', 'Vuoto da stampare'],
      ['compilato', 'Compilato (scambio di settimane)'],
    ],
    campi: [
      { k: 'intestazione', e: 'Intestazione', t: '{azienda}' },
      { k: 'titolo', e: 'Titolo', t: 'RICHIESTA CAMBIO VACANZA' },
      { k: 'sez_a', e: 'Sezione del collaboratore A', t: 'Collaboratore A (richiedente)' },
      { k: 'sez_b', e: 'Sezione del collaboratore B', t: 'Collaboratore B (accetta lo scambio)' },
      { k: 'motivazione_titolo', e: 'Motivazione: titolo', t: 'Motivazione' },
      { k: 'aut_titolo', e: 'Autorizzazione: titolo', t: 'Autorizzazione' },
      { k: 'aut_si', e: 'Autorizzazione: prima casella', t: 'Autorizzato' },
      { k: 'aut_no', e: 'Autorizzazione: seconda casella', t: 'Non autorizzato' },
      { k: 'aut_motivo', e: 'Autorizzazione: riga del motivo', t: 'Motivo:' },
      { k: 'firma_a', e: 'Firma del collaboratore A', t: 'Firma Collaboratore A' },
      { k: 'firma_b', e: 'Firma del collaboratore B', t: 'Firma Collaboratore B' },
      { k: 'firma_resp', e: 'Firma del responsabile', t: 'Firma Responsabile' },
      { k: 'piede', e: 'Piè di pagina', t: '{azienda} · formulario cambio vacanza' },
    ],
  },
};
const MODELLI_MAX_TESTO = 3000;

// ---------------------------------------------------------------- funzioni pure
// sostituisce i campi automatici conosciuti ({nome} -> valore); quelli sconosciuti restano
// scritti com erano. I valori inseriti non vengono riletti (un "{x}" dentro un nome resta).
function modelloSostituisci(testo, valori) {
  const v = valori || {};
  return String(testo == null ? '' : testo).replace(/\{([a-z_]+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(v, k) ? String(v[k] == null ? '' : v[k]) : m,
  );
}
// campi automatici scritti nel testo che il documento non conosce
function modelloSegnapostiSconosciuti(testo, ammessi) {
  const ok = new Set((ammessi || []).concat(_MOD_BASE));
  const out = [];
  String(testo || '').replace(/\{([^{}\s]{1,40})\}/g, (m, k) => {
    if (!ok.has(k) && !out.includes(k)) out.push(k);
    return m;
  });
  return out;
}
// testi originali di un documento {k: testo}
function modelloOriginali(tipo) {
  const m = MODELLI_DOC[tipo];
  const out = {};
  if (m) m.campi.forEach((c) => (out[c.k] = c.t));
  return out;
}
// tiene solo i testi noti, come testo, diversi dall originale (quello che si salva)
function modelloPulisci(tipo, testi) {
  const orig = modelloOriginali(tipo);
  const out = {};
  Object.keys(testi || {}).forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(orig, k)) return;
    const v = testi[k];
    if (typeof v !== 'string') return;
    const t = v.replace(/\r\n?/g, '\n').slice(0, MODELLI_MAX_TESTO);
    if (t !== orig[k]) out[k] = t;
  });
  return out;
}
// testi in uso: originali + cambiati. sovra = testi cambiati da usare al posto di quelli
// salvati (anteprima dell editor, ristampa con i testi di quando il modulo e stato fatto)
function modelloTesti(tipo, sovra) {
  const salvati = sovra !== undefined && sovra !== null ? sovra : (_modelliDi(tipo) || {}).testi;
  return Object.assign(modelloOriginali(tipo), modelloPulisci(tipo, salvati || {}));
}
// valori dei campi automatici: quelli del documento + azienda e programma
function modelloValori(v) {
  const id = typeof identita === 'function' ? identita() : {};
  return Object.assign({ azienda: id.azienda || '', programma: id.programma || '' }, v || {});
}
// testo originale di un campo (per misurare quanto un testo cambiato e piu lungo)
function modelloOriginale(tipo, k) {
  return modelloOriginali(tipo)[k] || '';
}
// di quanti mm un testo e piu largo dell originale (0 se non lo e): chi disegna sposta di
// tanto quello che segue, cosi con il testo originale il PDF non cambia di un punto
function _modelloAllungo(doc, testo, originale) {
  return Math.max(0, doc.getTextWidth(String(testo || '')) - doc.getTextWidth(String(originale || '')));
}
// testo pronto per il PDF: t(k) con i campi automatici sostituiti
function modelloTestoDi(testi, valori) {
  return (k) => modelloSostituisci(testi[k], valori);
}

// ---------------------------------------------------------------- lettura dal database
let _modelliCache = null; // [{ tipo, testi, aggiornato_da, aggiornato_il }]
let _modelliLetti = 0; // ora dell ultima lettura (ms)
let _modelliCaricamento = null;
const _MODELLI_RILETTURA_MS = 5 * 60 * 1000;
function _modelliDi(tipo) {
  return (_modelliCache || []).find((x) => x.tipo === tipo) || null;
}
// legge i modelli (al massimo ogni 5 minuti, o subito con forza). Senza la migrazione o
// senza rete restano i testi letti prima, oppure quelli originali.
async function modelliCarica(forza) {
  if (!forza && _modelliCache && Date.now() - _modelliLetti < _MODELLI_RILETTURA_MS) return _modelliCache;
  if (_modelliCaricamento) return _modelliCaricamento;
  const tk = typeof getOpToken === 'function' ? getOpToken() : null;
  if (!tk) return _modelliCache || [];
  _modelliCaricamento = (async () => {
    try {
      const r = await _conSessione((t) => _rpcSicura('leggi_modelli_documenti', { p_token: t }), tk);
      _modelliCache = Array.isArray(r) ? r : [];
      _modelliLetti = Date.now();
    } catch (e) {
      if (_modelliCache == null) _modelliCache = [];
    }
    _modelliCaricamento = null;
    return _modelliCache;
  })();
  return _modelliCaricamento;
}
// testi cambiati in uso per un documento ({} = tutti originali): si salvano con il modulo
// fatto, cosi la ristampa usa i testi di quel giorno
function modelloTestiCambiati(tipo) {
  return modelloPulisci(tipo, (_modelliDi(tipo) || {}).testi || {});
}

// ---------------------------------------------------------------- permesso
// "Modelli dei documenti: modificare" (predefinito: solo amministratore). Vale per tutti i
// settori: i documenti sono gli stessi. Il database fa lo stesso controllo.
function modelliPuoModificare() {
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  const cfg = typeof visibilitaConfig !== 'undefined' && visibilitaConfig ? visibilitaConfig : {};
  const v = cfg.gestione_modelli || 'admin';
  if (v === 'admin' || v === 'nascosto') return false;
  if (typeof v === 'object' && v.tipo === 'selezionati')
    return !!(v.operatori && v.operatori.includes(typeof getOperatore === 'function' ? getOperatore() : ''));
  return true;
}

// ---------------------------------------------------------------- anteprima
// PDF di prova con dati di esempio e i testi scritti nell editor (non salvati)
async function _modelliAnteprimaDoc(tipo, testi, variante) {
  if (!window.jspdf) await caricaJsPDF();
  const oggi = new Date();
  const oggiTxt = oggi.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rep = typeof currentReparto !== 'undefined' ? currentReparto : 'slots';
  const settore = typeof repartoNomeDocumento === 'function' ? repartoNomeDocumento(rep) : rep;
  const esempio = 'Rossi Mario';
  if (tipo === 'allineamento' || tipo === 'rdi' || tipo === 'apprezzamento') {
    if (!(await assicuraLibreria('jspdf'))) return null;
    return _pdfModuloDisciplinare(
      tipo,
      {
        collab: esempio,
        resp: moduloRespSettore() || 'Resp. di settore',
        data: oggiTxt,
        settore: settore,
        nonConf: 'Testo di esempio: qui va la descrizione scritta da chi compila il modulo.',
        obiettivo: 'Testo di esempio: qui va l obiettivo concordato.',
        scadenza: '',
        livello: 'I',
        desc: 'Testo di esempio: qui va la descrizione scritta da chi compila il modulo.',
        oss: 'Testo di esempio: qui vanno le osservazioni del responsabile.',
        qrId: 'anteprima',
        senzaQr: true,
      },
      testi,
    );
  }
  if (tipo === 'nd1187') {
    if (variante === 'vuoto') return _pdfNdVuotoDoc(testi);
    const d = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return _pdfListaNd(
      {
        nome: esempio,
        ym: ym,
        giorni: [
          { g: 3, nota: 'esempio di osservazione' },
          { g: 12, nota: '' },
        ],
        compilato: typeof oggiLocale === 'function' ? oggiLocale() : '',
        reparto: rep,
      },
      testi,
    );
  }
  if (tipo === 'assenza827') return _pdfNotificaAssenzaDoc(testi);
  if (tipo === 'cambio_turno') {
    const a = { nome: esempio, settore: settore, turno: 'L1', orari: '14:00-22:00' };
    if (variante === 'esigenze')
      return _pdfCambioTurno(
        { tipo: 'ESIGENZE', data: oggiTxt, a: a, b: {}, nuovoTurno: 'G1', nuovoOrari: '10:00-18:00', motivo: '' },
        testi,
      );
    return _pdfCambioTurno(
      {
        tipo: 'SCAMBIO',
        data: oggiTxt,
        a: a,
        b: { nome: 'Bianchi Anna', settore: settore, turno: 'N2', orari: '20:00-04:00' },
        restituzione: oggiTxt,
        motivo: 'Esempio di motivazione',
        autorizzato: true,
      },
      testi,
    );
  }
  if (tipo === 'cambio_vacanza') {
    if (variante === 'compilato')
      return _pdfCambioVacanzaDoc(
        {
          a: { nome: esempio, settore: settore, settimana: 12, dal: oggiTxt, al: oggiTxt },
          b: { nome: 'Bianchi Anna', settore: settore, settimana: 20, dal: oggiTxt, al: oggiTxt },
        },
        testi,
      );
    return _pdfCambioVacanzaDoc(null, testi);
  }
  return null;
}

// ---------------------------------------------------------------- editor
function _modelliQuando(iso) {
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
// FINESTRA DEI MODELLI: a sinistra i documenti, al centro i testi del documento scelto
// (con i campi automatici da inserire e "Rimetti il testo originale"), a destra l anteprima
// del PDF con dati di esempio. Salva solo chi ha il permesso; il database ricontrolla.
async function modelliApriEditor(tipoIniziale) {
  if (!modelliPuoModificare()) {
    toastErrore('Per modificare i modelli dei documenti serve il permesso "Modelli dei documenti: modificare".');
    return;
  }
  await modelliCarica(true);
  if (!(await assicuraLibreria('jspdf'))) return;
  let tipo = MODELLI_DOC[tipoIniziale] ? tipoIniziale : Object.keys(MODELLI_DOC)[0];
  let variante = null;
  let bozza = {}; // testi a video del documento aperto {k: testo}
  let atteso = null;
  let ultimoCampo = null;
  let genAnteprima = 0; // ogni anteprima nuova ferma quella prima
  let pdfAnteprima = null;
  let timerAnteprima = null;
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box modelli-editor" role="dialog" aria-modal="true" aria-labelledby="mdl-tit">' +
    '<h3 id="mdl-tit">Modelli dei documenti</h3>' +
    '<p class="mdl-aiuto">Qui si cambiano i <b>testi fissi</b> dei documenti stampati: titoli, frasi standard, diciture e firme. I campi che compila chi fa il modulo (nomi, descrizioni, date) e l impaginazione del PDF restano come sono. I campi automatici fra graffe, per esempio <b>{nome}</b>, diventano il dato vero nel PDF.</p>' +
    '<div class="mdl-corpo"><nav class="mdl-elenco" aria-label="Documenti"></nav>' +
    '<div class="mdl-campi"></div>' +
    '<div class="mdl-anteprima"><div class="mdl-ant-testa"><span>Anteprima del PDF (dati di esempio)</span><select class="mdl-variante" aria-label="Esempio"></select><button type="button" class="btn-secondario mdl-ant-agg"><i class="icx icx-refresh"></i> Aggiorna</button></div><div class="mdl-ant-pdf" role="document" aria-label="Anteprima del PDF" style="overflow:auto;background:#525659;padding:10px;display:flex;flex-direction:column;align-items:center;gap:10px"></div></div></div>' +
    '<div class="finestra-pulsanti mdl-pulsanti"><span class="mdl-stato"></span><button type="button" class="finestra-no">Chiudi</button><button type="button" class="finestra-ok">Salva il modello</button></div></div>';
  const elenco = velo.querySelector('.mdl-elenco');
  const campi = velo.querySelector('.mdl-campi');
  const sel = velo.querySelector('.mdl-variante');
  const riquadro = velo.querySelector('.mdl-ant-pdf');
  const stato = velo.querySelector('.mdl-stato');
  const okBtn = velo.querySelector('.finestra-ok');
  const salvati = () => modelloPulisci(tipo, (_modelliDi(tipo) || {}).testi || {});
  const cambiata = () => JSON.stringify(modelloPulisci(tipo, bozza)) !== JSON.stringify(salvati());
  const disegnaElenco = () => {
    elenco.innerHTML = Object.keys(MODELLI_DOC)
      .map((k) => {
        const n = Object.keys(modelloPulisci(k, (_modelliDi(k) || {}).testi || {})).length;
        return (
          '<button type="button" data-tipo="' +
          k +
          '" class="' +
          (k === tipo ? 'attivo' : '') +
          '"' +
          (k === tipo ? ' aria-current="true"' : '') +
          '><span>' +
          escP(MODELLI_DOC[k].nome) +
          '</span>' +
          (n
            ? '<small>' + n + (n === 1 ? ' testo cambiato' : ' testi cambiati') + '</small>'
            : '<small>originale</small>') +
          '</button>'
        );
      })
      .join('');
  };
  const aggiornaStato = () => {
    const r = _modelliDi(tipo);
    const nCamb = Object.keys(modelloPulisci(tipo, bozza)).length;
    stato.textContent =
      (cambiata() ? 'Modifiche non salvate · ' : '') +
      (nCamb ? nCamb + (nCamb === 1 ? ' testo diverso' : ' testi diversi') + " dall'originale" : 'Testi originali') +
      (r && r.aggiornato_da ? ' · ultima modifica: ' + r.aggiornato_da + ', ' + _modelliQuando(r.aggiornato_il) : '');
    okBtn.disabled = !cambiata();
  };
  const programmaAnteprima = () => {
    clearTimeout(timerAnteprima);
    timerAnteprima = setTimeout(aggiornaAnteprima, 700);
  };
  const aggiornaAnteprima = async () => {
    clearTimeout(timerAnteprima);
    try {
      const doc = await _modelliAnteprimaDoc(tipo, modelloPulisci(tipo, bozza), variante);
      if (!doc) return;
      // pagine disegnate nel programma (come Anteprima PDF, js/utils.js): non dipende dal
      // lettore PDF del browser
      const g = ++genAnteprima;
      const pdf = await pdfDisegnaPagine(
        doc.output('blob'),
        riquadro,
        g,
        (x) => x === genAnteprima && velo.isConnected,
      );
      if (pdfAnteprima) pdfAnteprima.destroy();
      pdfAnteprima = pdf;
    } catch (e) {
      console.error(e);
      riquadro.innerHTML =
        '<p style="color:#fff;margin:auto;text-align:center">Anteprima non disponibile: ' +
        escP((e && e.message) || String(e)) +
        '</p>';
    }
  };
  const avvisoCampo = (c, ta) => {
    const box = ta.closest('.mdl-campo');
    const sconosciuti = modelloSegnapostiSconosciuti(ta.value, MODELLI_DOC[tipo].segnaposti);
    const righe = ta.value.split('\n').length;
    const msg = [];
    if (sconosciuti.length)
      msg.push(
        'Campo automatico sconosciuto in questo documento: ' +
          sconosciuti.map((x) => '{' + x + '}').join(', ') +
          ' (resta scritto così nel PDF)',
      );
    if ((c.r || 1) === 1 && righe > 1) msg.push('Una riga sola: gli a capo diventano spazi.');
    else if (c.r && righe > c.r) msg.push('Al massimo ' + c.r + ' righe: quelle in più non si stampano.');
    box.querySelector('.mdl-avviso').textContent = msg.join(' ');
    box.classList.toggle('mdl-cambiato', ta.value !== c.t);
    box.querySelector('.mdl-orig').hidden = ta.value === c.t;
  };
  const disegnaCampi = () => {
    const m = MODELLI_DOC[tipo];
    const tutti = modelloTesti(tipo, bozza);
    const chips = m.segnaposti
      .concat(_MOD_BASE)
      .map(
        (k) =>
          '<button type="button" class="mdl-chip" data-seg="' +
          k +
          '" title="' +
          escP(MODELLI_SEGNAPOSTI[k] || '') +
          '">{' +
          k +
          '}</button>',
      )
      .join('');
    campi.innerHTML =
      '<div class="mdl-testa"><div><h4>' +
      escP(m.nome) +
      '</h4><p>' +
      escP(m.descr) +
      '</p></div><button type="button" class="btn-secondario mdl-tutti-orig"><i class="icx icx-refresh"></i> Rimetti il testo originale</button></div>' +
      '<div class="mdl-chips"><span>Campi automatici (clic per inserirli dove sei nel testo):</span>' +
      chips +
      '</div>' +
      m.campi
        .map((c, i) => {
          const id = 'mdl-c-' + i;
          return (
            '<div class="mdl-campo" data-k="' +
            c.k +
            '"><label for="' +
            id +
            '">' +
            escP(c.e) +
            ' <span class="mdl-tag">modificato</span></label>' +
            '<textarea id="' +
            id +
            '" rows="' +
            Math.min(4, Math.max(1, c.r || 1)) +
            '" maxlength="' +
            MODELLI_MAX_TESTO +
            '" spellcheck="true"></textarea>' +
            '<div class="mdl-sotto"><span class="mdl-avviso" aria-live="polite"></span>' +
            (c.n ? '<span class="mdl-nota">' + escP(c.n) + '</span>' : '') +
            '<button type="button" class="mdl-orig" hidden>Testo originale</button></div>' +
            '<div class="mdl-originale">Originale: <span></span></div></div>'
          );
        })
        .join('');
    m.campi.forEach((c, i) => {
      const ta = campi.querySelector('#mdl-c-' + i);
      ta.value = tutti[c.k];
      const box = ta.closest('.mdl-campo');
      box.querySelector('.mdl-originale span').textContent = c.t;
      avvisoCampo(c, ta);
      ta.addEventListener('focus', () => (ultimoCampo = ta));
      ta.addEventListener('input', () => {
        bozza[c.k] = (c.r || 1) === 1 ? ta.value.replace(/\s*\n\s*/g, ' ') : ta.value;
        avvisoCampo(c, ta);
        aggiornaStato();
        disegnaElenco();
        programmaAnteprima();
      });
      box.querySelector('.mdl-orig').addEventListener('click', () => {
        ta.value = c.t;
        bozza[c.k] = c.t;
        avvisoCampo(c, ta);
        aggiornaStato();
        programmaAnteprima();
      });
    });
    campi.querySelector('.mdl-tutti-orig').addEventListener('click', () => {
      m.campi.forEach((c, i) => {
        const ta = campi.querySelector('#mdl-c-' + i);
        ta.value = c.t;
        bozza[c.k] = c.t;
        avvisoCampo(c, ta);
      });
      aggiornaStato();
      programmaAnteprima();
      toast('Testi originali rimessi nella finestra: premi "Salva il modello" per usarli');
    });
    campi.querySelector('.mdl-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-seg]');
      if (!b) return;
      const ta = ultimoCampo && campi.contains(ultimoCampo) ? ultimoCampo : campi.querySelector('textarea');
      ta.setRangeText('{' + b.dataset.seg + '}', ta.selectionStart, ta.selectionEnd, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input'));
    });
    // versioni conservate
    const ver = document.createElement('div');
    ver.className = 'mdl-versioni';
    ver.innerHTML =
      '<button type="button" class="btn-secondario mdl-ver-apri"><i class="icx icx-file"></i> Versioni precedenti</button><div class="mdl-ver-lista" hidden></div>';
    campi.appendChild(ver);
    ver.querySelector('.mdl-ver-apri').addEventListener('click', async () => {
      const lista = ver.querySelector('.mdl-ver-lista');
      if (!lista.hidden) {
        lista.hidden = true;
        return;
      }
      lista.hidden = false;
      lista.textContent = 'Lettura delle versioni...';
      try {
        const v = await _conSessione(
          (t) => _rpcSicura('leggi_versioni_modello', { p_token: t, p_tipo: tipo }),
          getOpToken(),
        );
        if (!Array.isArray(v) || !v.length) {
          lista.textContent = 'Nessuna modifica salvata finora: il documento usa i testi originali.';
          return;
        }
        lista.innerHTML =
          '<p class="mdl-ver-aiuto">Ogni riga è un salvataggio. "Rimetti i testi di prima" riporta nella finestra i testi com erano prima di quel salvataggio: controlla l anteprima e premi Salva.</p>' +
          v
            .map(
              (x, i) =>
                '<div class="mdl-ver-riga"><span>' +
                escP(_modelliQuando(x.quando)) +
                ' · ' +
                escP(x.autore || '') +
                ' · ' +
                Object.keys(Object.assign({}, x.testi_prima, x.testi_dopo)).filter(
                  (k) => (x.testi_prima || {})[k] !== (x.testi_dopo || {})[k],
                ).length +
                ' testi cambiati</span><button type="button" class="btn-secondario" data-ver="' +
                i +
                '">Rimetti i testi di prima</button></div>',
            )
            .join('');
        lista.querySelectorAll('[data-ver]').forEach((b) =>
          b.addEventListener('click', () => {
            const x = v[parseInt(b.dataset.ver)];
            bozza = Object.assign(modelloOriginali(tipo), modelloPulisci(tipo, x.testi_prima || {}));
            disegnaCampi();
            aggiornaStato();
            disegnaElenco();
            aggiornaAnteprima();
            toast('Testi di prima del ' + _modelliQuando(x.quando) + ' rimessi nella finestra: premi Salva per usarli');
          }),
        );
      } catch (e) {
        lista.textContent = 'Versioni non lette: ' + ((e && e.message) || 'errore');
      }
    });
  };
  const apri = (k) => {
    tipo = k;
    const r = _modelliDi(tipo);
    atteso = r ? r.aggiornato_il : null;
    bozza = modelloTesti(tipo);
    const vv = MODELLI_DOC[tipo].varianti || [];
    variante = vv.length ? vv[0][0] : null;
    sel.innerHTML = vv.map((x) => '<option value="' + x[0] + '">' + escP(x[1]) + '</option>').join('');
    sel.hidden = !vv.length;
    disegnaElenco();
    disegnaCampi();
    aggiornaStato();
    aggiornaAnteprima();
  };
  elenco.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b || b.dataset.tipo === tipo) return;
    if (
      cambiata() &&
      !(await chiediConferma('Le modifiche a "' + MODELLI_DOC[tipo].nome + '" non sono salvate. Lasciarle?'))
    )
      return;
    apri(b.dataset.tipo);
  });
  sel.addEventListener('change', () => {
    variante = sel.value;
    aggiornaAnteprima();
  });
  velo.querySelector('.mdl-ant-agg').addEventListener('click', aggiornaAnteprima);
  const chiudi = () => {
    clearTimeout(timerAnteprima);
    document.removeEventListener('keydown', tasti, true);
    genAnteprima++;
    if (pdfAnteprima) pdfAnteprima.destroy();
    pdfAnteprima = null;
    velo.remove();
    if (typeof renderModelliUI === 'function') renderModelliUI();
  };
  const annulla = async () => {
    if (cambiata() && !(await chiediConferma('Chiudere senza salvare? Le modifiche ai testi andranno perse.'))) return;
    chiudi();
  };
  const tasti = (e) => {
    if (e.key !== 'Escape' || document.querySelectorAll('.finestra-velo').length > 1) return;
    e.preventDefault();
    e.stopPropagation();
    annulla();
  };
  okBtn.addEventListener('click', async () => {
    const testi = modelloPulisci(tipo, bozza);
    const nomeDoc = MODELLI_DOC[tipo].nome;
    if (
      !(await chiediConferma(
        'Salvare il modello "' +
          nomeDoc +
          '"?\n\nDa adesso tutti i nuovi PDF di questo documento usano questi testi (' +
          (Object.keys(testi).length
            ? Object.keys(testi).length + (Object.keys(testi).length === 1 ? ' testo diverso' : ' testi diversi')
            : 'tutti') +
          (Object.keys(testi).length ? " dall'originale" : ' originali') +
          '). La modifica resta nel Registro attività e nelle versioni precedenti.',
        { titolo: 'Modelli dei documenti', ok: 'Salva' },
      ))
    )
      return;
    okBtn.disabled = true;
    try {
      const esito = await _conSessione(
        (t) =>
          _rpcSicura('salva_modello_documento', {
            p_token: t,
            p_tipo: tipo,
            p_testi: testi,
            p_atteso: atteso,
          }),
        getOpToken(),
      );
      toast(esito && esito.invariato ? 'Nessuna modifica da salvare' : 'Modello "' + nomeDoc + '" salvato');
      await modelliCarica(true);
      const r = _modelliDi(tipo);
      atteso = r ? r.aggiornato_il : null;
      bozza = modelloTesti(tipo);
      disegnaElenco();
      aggiornaStato();
    } catch (e) {
      okBtn.disabled = false;
      toastErrore('Modello non salvato: ' + ((e && e.message) || 'errore'), 9000);
    }
  });
  velo.querySelector('.finestra-no').addEventListener('click', annulla);
  document.addEventListener('keydown', tasti, true);
  document.body.appendChild(velo);
  apri(tipo);
  const primo = elenco.querySelector('.attivo');
  if (primo) primo.focus();
}

// ---------------------------------------------------------------- schermate
// Impostazioni generali > Settori e moduli: riquadro con lo stato dei modelli
async function renderModelliUI() {
  const sec = document.getElementById('modelli-section');
  if (!sec) return;
  const puo = modelliPuoModificare();
  sec.style.display = puo ? '' : 'none';
  if (!puo) return;
  const box = document.getElementById('modelli-ui');
  if (!box) return;
  await modelliCarica(true);
  box.innerHTML =
    '<div class="mdl-riepilogo">' +
    Object.keys(MODELLI_DOC)
      .map((k) => {
        const r = _modelliDi(k);
        const n = Object.keys(modelloPulisci(k, (r || {}).testi || {})).length;
        return (
          '<div class="mdl-riep-riga"><div><b>' +
          escP(MODELLI_DOC[k].nome) +
          '</b><span>' +
          (n
            ? n +
              (n === 1 ? ' testo cambiato' : ' testi cambiati') +
              (r && r.aggiornato_da ? ' · ' + escP(r.aggiornato_da) + ', ' + escP(_modelliQuando(r.aggiornato_il)) : '')
            : 'Testi originali') +
          '</span></div><button type="button" class="btn-secondario" onclick="modelliApriEditor(\'' +
          k +
          '\')">Modifica</button></div>'
        );
      })
      .join('') +
    '</div>';
}
// pagina Moduli: pulsante per chi puo modificare i modelli
function modelliPulsanteModuli() {
  const el = document.getElementById('moduli-modelli-azione');
  if (!el) return;
  el.innerHTML = modelliPuoModificare()
    ? '<button type="button" class="btn-secondario" onclick="modelliApriEditor(\'allineamento\')" title="Cambia i testi fissi dei moduli e dei formulari stampati"><i class="icx icx-modifica"></i> Modelli dei documenti</button>'
    : '';
}
