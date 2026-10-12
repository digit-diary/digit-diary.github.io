// Personalizzazioni dalle schermate, secondo rilascio (v453):
// - modelli dei documenti (js/modelli-documenti.js): sostituzione dei campi automatici,
//   ripulitura dei testi salvati, testi originali identici a quelli di prima;
// - import del piano con le colonne a scelta (js/piano-import-colonne.js): lettere delle
//   colonne, mappa dei giorni, anteprima, riconoscimento del formato semplice.
// Come si lancia: node test/modelli-import.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

// il file si esegue in un contesto separato con i pochi riferimenti esterni che servono
const ctx = vm.createContext({
  identita: () => ({ azienda: 'Casinò Lugano SA', programma: 'Diario Collaboratori' }),
  console,
});
vm.runInContext(leggi('modelli-documenti.js'), ctx);
vm.runInContext(
  `this.M = { MODELLI_DOC, modelloSostituisci, modelloSegnapostiSconosciuti, modelloOriginali, modelloPulisci,
    modelloTesti, modelloValori, modelloTestoDi, modelloOriginale };`,
  ctx,
);
const M = ctx.M;
// import con le colonne: _xlsMappaGiorni vero (js/piano-config.js) per la modalita "numeri"
const pc = leggi('piano-config.js');
const i0 = pc.indexOf('function _xlsMappaGiorni(');
const _xlsMappaGiorni = new Function(pc.slice(i0, pc.indexOf('\n}\n', i0) + 3) + '; return _xlsMappaGiorni;')();
const ctx2 = vm.createContext({ _xlsMappaGiorni });
vm.runInContext(leggi('piano-import-colonne.js'), ctx2);
vm.runInContext(
  'this.I = { _xlsColLettera, _xlsColIndice, _xlsMappaDaColonne, _xlsAnteprimaRighe, _xlsSempliceAllineato };',
  ctx2,
);
const I = ctx2.I;

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  const a = JSON.stringify(r);
  const b = JSON.stringify(atteso);
  if (a === b) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + b + '\n  ottenuto ' + a);
  }
};

// ---- sostituzione dei campi automatici
const v = M.modelloValori({ nome: 'Rossi Mario', data: '12.10.2026', settore: 'FoBoSlot' });
eq(M.modelloSostituisci('RDI di {nome} del {data}', v), 'RDI di Rossi Mario del 12.10.2026', 'nome e data');
eq(
  M.modelloSostituisci('{azienda} · {programma}', v),
  'Casinò Lugano SA · Diario Collaboratori',
  'azienda e programma',
);
eq(M.modelloSostituisci('Settore {settore}, {settore}', v), 'Settore FoBoSlot, FoBoSlot', 'stesso campo due volte');
eq(
  M.modelloSostituisci('Campo {sconosciuto} e {nome}', v),
  'Campo {sconosciuto} e Rossi Mario',
  'campo sconosciuto resta',
);
eq(M.modelloSostituisci('{responsabile}', { responsabile: null }), '', 'valore vuoto');
eq(
  M.modelloSostituisci('Nome: {nome}', { nome: '{data} {azienda}', data: 'X' }),
  'Nome: {data} {azienda}',
  'il valore inserito non viene riletto',
);
eq(M.modelloSostituisci('{NOME} { nome }', v), '{NOME} { nome }', 'solo minuscole e senza spazi');
eq(M.modelloSostituisci(null, v), '', 'testo nullo');
eq(M.modelloSostituisci('Testo senza campi', {}), 'Testo senza campi', 'senza campi resta uguale');

// ---- campi sconosciuti (avviso nell editor)
eq(M.modelloSegnapostiSconosciuti('{nome} {x} {azienda} {x} {data}', ['nome']), ['x', 'data'], 'sconosciuti');
eq(M.modelloSegnapostiSconosciuti('{nome}', ['nome']), [], 'nessuno sconosciuto');

// ---- ripulitura dei testi salvati: solo chiavi note, testi, diversi dall originale
eq(
  M.modelloPulisci('rdi', {
    titolo: 'Nuovo titolo',
    distribuzione: 'Resp. Settore\nResp. Risorse Umane', // = originale: non si salva
    inventata: 'x',
    firma_resp: 5,
    nota_firma: 'a\r\nb',
  }),
  { titolo: 'Nuovo titolo', nota_firma: 'a\nb' },
  'pulisci',
);
eq(M.modelloPulisci('nessuno', { titolo: 'x' }), {}, 'documento sconosciuto');
eq(Object.keys(M.modelloPulisci('rdi', { titolo: 'y'.repeat(5000) })).length, 1, 'testo lungo tenuto');
eq(M.modelloPulisci('rdi', { titolo: 'y'.repeat(5000) }).titolo.length, 3000, 'testo lungo accorciato a 3000');

// ---- testi in uso: originali + cambiati
eq(M.modelloTesti('rdi', { titolo: 'T' }).titolo, 'T', 'testo cambiato in uso');
eq(M.modelloTesti('rdi', { titolo: 'T' }).firma_resp, 'Firma del Resp. Settore', 'gli altri restano originali');
eq(M.modelloTesti('rdi', {}), M.modelloOriginali('rdi'), 'senza cambi = originali');
const t = M.modelloTestoDi(M.modelloTesti('cambio_turno', {}), M.modelloValori({ richiesto: 'Admin' }));
eq(t('piede'), 'Casinò Lugano SA · Richiesto da: Admin', 'piede del cambio turno come prima');
eq(t('intestazione'), 'Casinò Lugano SA', 'intestazione del cambio turno = azienda');
const t1187 = M.modelloTestoDi(M.modelloTesti('nd1187', {}), M.modelloValori({ giorno: 3 }));
eq(
  [t1187('sotto_inizio'), t1187('sotto_evidenza'), t1187('sotto_fine')].join(' '),
  '- da trasmettere al massimo entro il 3° giorno del mese al Responsabile di settore -',
  'sottotitolo 1187 come prima',
);
eq(M.modelloOriginale('rdi', 'titolo'), 'Rapporto disciplinare interno (RDI)', 'testo originale di un campo');

// ---- TESTI ORIGINALI = quelli scritti prima nel codice (i PDF restano identici)
const orig = {
  allineamento: {
    titolo: 'Rilevamento di non conformità e colloquio di allineamento',
    sez_obiettivo:
      'Obiettivo concordato tra Collaboratore e Resp. Settore onde evitare il ripetersi della non conformità',
    scad_nota: "(termine di verifica entro il quale si è concordato di raggiungere l'obiettivo di cui sopra)",
    scad_vuota: 'A partire da subito',
    chiusura: "Chiediamo che, entro il termine sopra indicato, venga raggiunto l'obiettivo di cui sopra.",
    distribuzione: 'Diario di bordo del collaboratore\nResp. Settore',
  },
  apprezzamento: { titolo: 'Colloquio di apprezzamento', sez_osservazioni: 'Osservazioni da parte del Resp. Settore' },
  rdi: {
    vale_titolo: 'Il presente RDI vale quale',
    vale_nota: '(segnare ciò che fa al caso)',
    livello1: 'rapporto disciplinare interno di I° livello',
    livello2: 'rapporto disciplinare interno grave (II° livello)',
    firma_collab: 'Firma del collaboratore*',
    nota_firma:
      '* il collaboratore che non vuole sottoscrivere il rapporto disciplinare lo deve espressamente dichiarare, scrivendolo al posto della firma.',
    distribuzione: 'Resp. Settore\nResp. Risorse Umane',
  },
  nd1187: {
    codice: '1187 - LISTA NON DISPONIBILITA JOLLY',
    data_modulo: '18/12/2012',
    titolo: 'LISTA DI NON DISPONIBILITÀ (JOLLY)',
    frase: 'vi informo che NON sarò disponibile per la pianificazione durante i giorni\nseguenti.',
    firma_collab: 'Firma collaboratore (Jolly):',
  },
  assenza827: { titolo: "NOTIFICA D'ASSENZA", col_militare: 'Servizio\nmilitare', approvato: 'AD CEO' },
  cambio_turno: {
    titolo: 'RICHIESTA CAMBIO TURNO',
    titolo_esigenze: 'CAMBIO TURNO PER ESIGENZE OPERATIVE',
    restituzione_frase: 'In questa data i turni verranno scambiati nuovamente tra i due collaboratori.',
    motivo_vuoto: 'Nessuna motivazione specificata',
  },
  cambio_vacanza: { titolo: 'RICHIESTA CAMBIO VACANZA', piede: '{azienda} · formulario cambio vacanza' },
};
Object.keys(orig).forEach((tipo) =>
  Object.keys(orig[tipo]).forEach((k) => eq(M.modelloOriginali(tipo)[k], orig[tipo][k], 'originale ' + tipo + '.' + k)),
);
// negli originali solo campi automatici che il documento conosce; chiavi semplici e uniche
Object.keys(M.MODELLI_DOC).forEach((tipo) => {
  const m = M.MODELLI_DOC[tipo];
  const chiavi = m.campi.map((c) => c.k);
  eq(new Set(chiavi).size, chiavi.length, 'chiavi uniche ' + tipo);
  eq(
    chiavi.every((k) => /^[a-z0-9_]{1,40}$/.test(k)),
    true,
    'chiavi valide per il database ' + tipo,
  );
  m.campi.forEach((c) =>
    eq(M.modelloSegnapostiSconosciuti(c.t, m.segnaposti), [], 'originale senza campi sconosciuti ' + tipo + '.' + c.k),
  );
});

// ---- colonne Excel
eq(['A', 'Z', 'AA', 'AZ', 'BA', 'AI'].map(I._xlsColIndice), [0, 25, 26, 51, 52, 34], 'lettera -> indice');
eq([0, 25, 26, 51, 52, 34].map(I._xlsColLettera), ['A', 'Z', 'AA', 'AZ', 'BA', 'AI'], 'indice -> lettera');
eq([I._xlsColIndice(''), I._xlsColIndice('1'), I._xlsColIndice(' c ')], [-1, -1, 2], 'lettere non valide');
for (let i = 0; i < 800; i += 37) eq(I._xlsColIndice(I._xlsColLettera(i)), i, 'andata e ritorno ' + i);

// ---- mappa dei giorni
eq(I._xlsMappaDaColonne({ giorni: 'colonne', primaCol: 'E' }, null, 3).mappa, { 1: 4, 2: 5, 3: 6 }, 'dalla colonna E');
eq(
  I._xlsMappaDaColonne({ giorni: 'colonne', primaCol: 'C', ultimaCol: 'D' }, null, 31).mappa,
  { 1: 2, 2: 3 },
  'solo fino all ultima colonna',
);
eq(
  !!I._xlsMappaDaColonne({ giorni: 'colonne', primaCol: 'D', ultimaCol: 'C' }, null, 31).errore,
  true,
  'ultima prima della prima',
);
eq(!!I._xlsMappaDaColonne({ giorni: 'colonne', primaCol: '' }, null, 31).errore, true, 'manca la prima colonna');
const intest = ['Matricola', 'Funzione', 'Dipendente', '%'];
for (let g = 1; g <= 31; g++) intest.push(g);
const mN = I._xlsMappaDaColonne({ giorni: 'numeri' }, intest, 31, _xlsMappaGiorni);
eq([mN.mappa[1], mN.mappa[31]], [4, 34], 'numeri nella riga di intestazione');
eq(
  !!I._xlsMappaDaColonne({ giorni: 'numeri' }, ['Nome', 'Ven 1', 'Sab 2'], 31, _xlsMappaGiorni).errore,
  true,
  'nessun numero',
);

// ---- anteprima
const dati = [
  ['Titolo'],
  ['N', 'Funzione', 'Nome', 1, 2, 3],
  [1, 'HOST', 'Rossi Mario', 'l1', 'xyz', ''],
  [2, 'SUP', 'Bianchi Anna', 'C', 'C', 'S7'],
  [3, '', '12 totale', 'C', 'C', 'C'], // inizia con una cifra: non e una persona
  [4, 'HOST', 'Nuovo Tizio', 'Q9', 'L1', 'C'],
];
const conosciuti = { 'Rossi Mario': 1, 'Bianchi Anna': 1 };
const a = I._xlsAnteprimaRighe(
  { dati, mappa: { 1: 3, 2: 4, 3: 5 }, colNome: 2, colFunzione: 1, colPerc: null, inizio: 2 },
  3,
  (n) => (conosciuti[n] ? { nome: n } : null),
  (c) => ['L1', 'C', 'S7'].includes(c),
);
eq([a.persone, a.trovate, a.nonTrovate, a.celle], [3, 2, ['Nuovo Tizio'], 6], 'conteggi anteprima');
eq(a.codiciOk, { L1: 2, C: 3, S7: 1 }, 'codici riconosciuti (maiuscole)');
eq(a.codiciSconosciuti, { XYZ: 1, Q9: 1 }, 'codici sconosciuti');
eq(
  a.righe.map((r) => r.riga),
  [3, 4, 6],
  'numero della riga in Excel',
);
eq(a.righe[1].funzione, 'SUP', 'funzione letta');

// ---- formato semplice (nome in A, giorni da B) riconosciuto solo se allineato
const semplice = [
  ['Rossi Mario', 'L1', 'C', 'C'],
  ['Bianchi Anna', 'C', 'S7', 'C'],
];
eq(I._xlsSempliceAllineato(semplice, 3), true, 'formato semplice allineato');
const spostato = [
  ['Rossi Mario', '', 'L1', 'C', 'C'],
  ['Bianchi Anna', '', 'C', 'S7', 'C'],
];
eq(I._xlsSempliceAllineato(spostato, 3), false, 'giorni spostati di una colonna');
eq(I._xlsSempliceAllineato([], 3), false, 'nessun nome conosciuto');

console.log((falliti ? 'ATTENZIONE: ' : 'OK: ') + passati + ' controlli passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
