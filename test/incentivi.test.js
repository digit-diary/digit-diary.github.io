// Incentivi (Formazione): interruttore generale e passaggio di livello.
//  - incentiviVisibili / incentiviAttivi (js/formazione.js): con «Incentivi attivi» spento
//    punti e premi spariscono ovunque e nessuna azione assegna punti (decisione 23/10/2026);
//  - puntiPassaggioLivello (C27): chi salta dei livelli (L1 -> L3) riceve punti e premio SOLO
//    del livello raggiunto, non di quelli saltati;
//  - _registroSenzaIncentivi (js/moduli.js): righe di punti e premi tolte dal Registro.
// Come si lancia: node test/incentivi.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};
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
const F = leggi('formazione.js');
const M = leggi('moduli.js');
const codice =
  'var PUNTI_DEFAULT = { attivo: true, azioni: [{ key: "copertura", punti: 10 }], soglie: [], premi_livello: { 2: "Cena", 3: "Weekend" }, punti_livello: { 1: 0, 2: 20, 3: 40 } };\n' +
  'var puntiConfig = null;\n' +
  [
    'function getPuntiConfig(',
    'function incentiviVisibili(',
    'function incentiviAttivi(',
    'function incentiviLivelloSettore(',
    'function _incLivelloVoce(',
    'function puntiLivelloDi(',
    'function premioLivelloDi(',
    'function puntiPassaggioLivello(',
  ]
    .map((x) => pezzo(F, x))
    .join('\n') +
  M.slice(M.indexOf('const _REG_INCENTIVI_RE'), M.indexOf('function _registroDisegna(')).replace('const ', 'var ');
const G = vm.createContext({});
vm.runInContext(codice, G);
const imposta = (cfg) => vm.runInContext('puntiConfig = ' + JSON.stringify(cfg), G);

// ---- interruttore generale
imposta(null);
eq(G.incentiviVisibili(), true, 'senza configurazione: incentivi accesi');
imposta({ attivo: false, azioni: [{ key: 'copertura', punti: 10 }] });
eq(G.incentiviVisibili(), false, 'interruttore spento: non visibili');
eq(G.incentiviAttivi(), false, 'interruttore spento: nessuna assegnazione');
eq(G.incentiviAttivi('copertura'), false, 'interruttore spento: anche la singola azione accesa e spenta');
imposta({ attivo: true, azioni: [{ key: 'copertura', punti: 10, attiva: false }] });
eq(G.incentiviVisibili(), true, 'acceso con una sola azione spenta: punti visibili');
eq(G.incentiviAttivi('copertura'), false, 'azione spenta: niente punti per quell azione');
eq(G.incentiviAttivi(), true, 'sistema acceso');
eq(G.incentiviVisibili({ attivo: false }), false, 'configurazione passata: spenta');

// ---- C27: salto di livelli
imposta(null);
eq(G.puntiPassaggioLivello(1, 3, 'slots'), [{ lv: 3, punti: 40 }], 'L1 -> L3: solo i punti di L3 (non anche L2)');
eq(G.puntiPassaggioLivello(1, 2, 'slots'), [{ lv: 2, punti: 20 }], 'L1 -> L2: i punti di L2');
eq(G.puntiPassaggioLivello(0, 3, 'slots'), [{ lv: 3, punti: 40 }], 'da nessun livello a L3: solo L3');
eq(G.puntiPassaggioLivello(0, 1, 'slots'), [], 'L1 con 0 punti configurati: niente');
eq(G.puntiPassaggioLivello(3, 3, 'slots'), [], 'nessun passaggio: niente');
eq(G.puntiPassaggioLivello(3, 2, 'slots'), [], 'livello sceso: niente');
const somma = (prima, dopo) => G.puntiPassaggioLivello(prima, dopo, 'slots').reduce((s, x) => s + x.punti, 0);
eq(somma(1, 3), 40, 'totale L1 -> L3 = 40 (prima erano 60: L2 + L3)');
imposta({ per_settore: { tavoli: { punti_livello: { 3: 30 } } } });
eq(G.puntiPassaggioLivello(1, 3, 'tavoli'), [{ lv: 3, punti: 30 }], 'valori propri del settore: L3 dei Tavoli');
eq(G.puntiPassaggioLivello(1, 3, 'slots'), [{ lv: 3, punti: 40 }], 'gli altri settori restano sui valori comuni');
eq(G.premioLivelloDi(3, 'slots'), 'Weekend', 'premio del livello raggiunto (uno solo)');
// i tre punti del programma che danno i punti di livello passano tutti da puntiPassaggioLivello
eq(
  (F.match(/for \(let lv = prima \+ 1; lv <= dopo/g) || []).length,
  0,
  'formazione.js: niente piu punti livello per livello',
);
eq((F.match(/of puntiPassaggioLivello\(prima, dopo/g) || []).length, 3, 'formazione.js: tre passaggi di livello');
eq(
  /for \(let lv = p\.prima \+ 1/.test(leggi('piano-extra.js')),
  false,
  'piano-extra.js: anteprima con il solo livello raggiunto',
);

// ---- Registro senza punti e premi
const righe = [
  { azione: 'Punti assegnati' },
  { azione: 'Premio consegnato' },
  { azione: 'Passaggio livello' },
  { azione: 'Nuova registrazione' },
  { azione: 'Report incentivi' },
];
imposta({ attivo: true });
eq(G._registroSenzaIncentivi(righe).length, 5, 'incentivi accesi: tutto il Registro');
imposta({ attivo: false });
eq(
  G._registroSenzaIncentivi(righe).map((r) => r.azione),
  ['Passaggio livello', 'Nuova registrazione'],
  'incentivi spenti: via punti, premi e report incentivi',
);

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
