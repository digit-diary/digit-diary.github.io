/**
 * Test degli schemi pause degli Slots (js/pause-engine.js), decisioni del titolare 02/11/2026.
 *   node test/pause-schemi.test.js
 * - R24 in pausa 22.30-23.00 e S3 22.15-22.30 (regola configurabile, predefinita sempre),
 *   anche quando S7C nella colonna BG3 ha la Reception: S7C pausa 22.00-22.15, poi S3
 *   22.15-22.30, R24 22.30-23.00, R23 23.00-23.15, seconda pausa piu tardi;
 * - manca S1: un foglio per ogni sostituto valido (S22, C23), il migliore per primo; i cambi
 *   dello schema di S1 dopo la fine del sostituto (R23 alle 20.30) li da S3 se libero e formato;
 * - Formazione sempre: chi non si trova non e formato; BO e SUP ovunque solo con l impostazione.
 */
const fs = require('fs');
const vm = require('vm');
const PC = require('../js/pause-controlli.js');

const ctx = {
  console,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {} },
};
ctx.window = ctx;
ctx.PauseControlli = PC;
ctx._pianoReparto = () => 'slots';
ctx.escP = (x) => String(x);
ctx.isAdmin = () => true;
ctx._briefGruppo = () => 0;
ctx._pianoColore = () => '';
ctx._briefOrarioHM = (x) => (x ? String(x).substring(0, 5) : '');
ctx._briefData = '2026-10-12';
const TURNI = {
  S1: ['14:00', '21:00', 'SALA'],
  S22: ['11:40', '20:00', 'SALA'],
  C23: ['11:40', '20:10', 'CASSA'],
  C0: ['11:40', '20:00', 'CASSA'],
  C4: ['11:40', '20:15', 'CASSA'],
  R22: ['11:40', '20:00', 'REC'],
  R23: ['19:50', '04:00', 'REC'],
  R24: ['19:50', '03:00', 'REC'],
  S3: ['20:00', '02:00', 'SALA'],
  S5: ['17:00', '02:00', 'SALA'],
  S7C: ['19:50', '02:00', 'SALA'],
  C15: ['19:40', '04:10', 'CASSA'],
  C5: ['19:40', '04:10', 'CASSA'],
  C20: ['19:40', '03:10', 'CASSA'],
};
ctx._pianoTurniReparto = () =>
  Object.keys(TURNI).map((k) => ({ codice: k, ora_inizio: TURNI[k][0], ora_fine: TURNI[k][1], gruppo: TURNI[k][2] }));
// collaboratori di prova con i settori della Formazione
let COLLAB = {};
ctx._pianoCollabInfo = (n) => (COLLAB[String(n).toUpperCase()] ? { nome: n } : null);
ctx._pianoSettoriEffettivi = (info) => COLLAB[String(info.nome).toUpperCase()] || [];
ctx._pianoAccompagnamentoDi = () => [];
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/pause-engine.js', 'utf8'), ctx);

let passati = 0,
  falliti = 0;
const ok = (c, n) => {
  c ? passati++ : falliti++;
  console.log((c ? '  OK  ' : '  FAIL ') + n);
};
const eq = (a, b, n) =>
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    n + ' (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')',
  );
// righe di una colonna del foglio virtuale: "POS hh.mm - hh.mm"
const colonna = (sh, col) => {
  const out = [];
  for (let r = 7; r < 80; r++) {
    const a = sh.celle[r + '|' + col];
    const b = sh.celle[r + '|' + (col + 1)];
    if (a && b) out.push(a.v + ' ' + String(b.v).replace(/\s*\[!\]$/, ''));
  }
  return out;
};
const sovrapposte = (righe) => {
  const iv = righe.map((x) => PC.intervallo(x.split(' ').slice(1).join(' '))).filter(Boolean);
  for (let i = 1; i < iv.length; i++) if (iv[i].ini < iv[i - 1].fin) return true;
  return false;
};

console.log('\n== regola R24 alle 22.30 ==');
ctx._briefPauseCfgObj = {};
ok(ctx._peR24Dopo(1) && ctx._peR24Dopo(0) && ctx._peR24Dopo(4), 'predefinita: vale ogni giorno (anche domenica)');
ctx._briefPauseCfgObj = { schemi: { slots: { r24: { attivo: true, giorni: [1, 2, 3, 4] } } } };
ok(ctx._peR24Dopo(2) && !ctx._peR24Dopo(0), 'con i giorni Lun-Gio: la domenica no');
ctx._briefPauseCfgObj = { schemi: { slots: { r24: { attivo: false } } } };
ok(!ctx._peR24Dopo(2), 'spenta: schema di prima');
ctx._briefPauseCfgObj = {};

console.log('\n== S3 (colonna Q2) con R24 ==');
const dc0 = {};
let sh = ctx._peSheet();
ctx._pePatternS3(
  sh,
  { dT: { R24: ['X'], R23: ['Y'], C15: ['A'], C5: ['B'], C20: ['C'] }, dc: dc0 },
  4,
  'S3P',
  true,
  true,
  true,
);
let q2 = colonna(sh, 4);
ok(
  q2.includes('PAUSA 22.15 - 22.30') && !q2.includes('PAUSA 22.45 - 23.00'),
  'BG3 con la Reception: S3 in pausa 22.15-22.30',
);
sh = ctx._peSheet();
ctx._pePatternS3(
  sh,
  { dT: { R24: ['X'], R23: ['Y'], C15: ['A'], C5: ['B'], C20: ['C'] }, dc: dc0 },
  4,
  'S3P',
  true,
  false,
  true,
);
q2 = colonna(sh, 4);
ok(
  q2.includes('PAUSA 22.15 - 22.30') && q2.includes('R24 22.30 - 23.00'),
  'senza Reception in BG3: S3 pausa 22.15 e poi R24 22.30-23.00',
);
sh = ctx._peSheet();
ctx._pePatternS3(
  sh,
  { dT: { R24: ['X'], R23: ['Y'], C15: ['A'], C5: ['B'], C20: ['C'] }, dc: dc0 },
  4,
  'S3P',
  true,
  true,
  false,
);
ok(colonna(sh, 4).includes('PAUSA 22.45 - 23.00'), 'regola spenta: lo schema di prima (S3 alle 22.45)');

console.log('\n== S7C nella colonna BG3 con la Reception ==');
const dTb = { R24: ['X'], R23: ['Y'], S3: ['S3P'], S7: [], S7C: ['S7CP'] };
sh = ctx._peSheet();
// haS7C, un solo S7 (numS7 0), bg3FaRec, s3PausaPrima
ctx._pePatternBG3_S7C(
  sh,
  { dT: dTb, dc: dc0 },
  7,
  'S7CP',
  'S7CP',
  'S3P',
  true,
  false,
  false,
  false,
  true,
  true,
  0,
  true,
);
const bg3 = colonna(sh, 7);
const da = bg3.indexOf('PAUSA 22.00 - 22.15');
eq(
  bg3.slice(da, da + 4),
  ['PAUSA 22.00 - 22.15', 'S3 22.15 - 22.30', 'R24 22.30 - 23.00', 'R23 23.00 - 23.15'],
  'S7C: prima pausa 22.00-22.15, poi S3 22.15, R24 22.30, R23 23.00',
);
const pauseS7C = bg3.filter((x) => x.startsWith('PAUSA'));
eq(pauseS7C, ['PAUSA 22.00 - 22.15', 'PAUSA 24.15 - 24.30'], 'S7C: due pause da 15 minuti, la seconda dopo');
ok(!sovrapposte(bg3), 'colonna BG3 senza righe sovrapposte');
sh = ctx._peSheet();
ctx._pePatternBG3_S7C(
  sh,
  { dT: dTb, dc: dc0 },
  7,
  'S7CP',
  'S7CP',
  'S3P',
  true,
  false,
  false,
  false,
  true,
  true,
  0,
  false,
);
ok(colonna(sh, 7).includes('R24 22.15 - 22.45'), 'regola spenta: R24 22.15-22.45 come prima');
sh = ctx._peSheet();
ctx._pePatternBG3_S31(sh, { dT: dTb, dc: dc0 }, 7, 'S31P', 'S3P', true, true, true);
const s31 = colonna(sh, 7);
ok(
  s31.includes('S3 22.15 - 22.30') && s31.includes('R24 22.30 - 23.00') && !sovrapposte(s31),
  'BG3 = S31: stessa sequenza',
);

console.log('\n== Formazione ==');
COLLAB = { ROSSI: ['SALA'], BIANCHI: ['BO'], VERDI: ['SALA', 'CASSA'] };
let dc = ctx._peCompetenze([
  { nome: 'ROSSI', nomeFull: 'ROSSI' },
  { nome: 'BIANCHI', nomeFull: 'BIANCHI' },
  { nome: 'NERI', nomeFull: 'NERI' },
]);
ok(ctx._pePuoCoprire(dc, 'ROSSI', 'S3') && !ctx._pePuoCoprire(dc, 'ROSSI', 'C0'), 'formato solo dove ha la spunta');
ok(!ctx._pePuoCoprire(dc, 'NERI', 'S3'), 'non trovato fra i collaboratori = non formato');
eq(dc._nonTrovati, ['NERI'], 'elenco dei non trovati per l avviso');
ok(ctx._pePuoCoprire(dc, 'BIANCHI', 'C0'), 'BO formato ovunque con l impostazione accesa (predefinita)');
ok(!ctx._pePuoCoprire(dc, 'ROSSI M', 'S3'), 'nessun abbinamento per pezzi del nome');
ok(!ctx._pePuoCoprire(dc, 'ROSSINI', 'S3'), 'ROSSINI non prende la formazione di ROSSI');
ctx._briefPauseCfgObj = { schemi: { slots: { boSupTutto: false } } };
dc = ctx._peCompetenze([
  { nome: 'BIANCHI', nomeFull: 'BIANCHI' },
  { nome: 'ROSSI', nomeFull: 'ROSSI' },
]);
ok(!ctx._pePuoCoprire(dc, 'BIANCHI', 'C0'), 'impostazione spenta: BO senza spunte non da cambi in cassa');
ctx._briefPauseCfgObj = {};
COLLAB = {};
dc = ctx._peCompetenze([{ nome: 'ROSSI', nomeFull: 'ROSSI' }]);
ok(ctx._pePuoCoprire(dc, 'ROSSI', 'C0'), 'collaboratori non caricati: nessun controllo, come prima');

console.log('\n== manca S1: un foglio per ogni sostituto ==');
// lunedi 12.10.2026: S22 e C23 presenti, S1 assente
COLLAB = {
  S22P: ['SALA', 'REC', 'CASSA'],
  C23P: ['CASSA', 'REC', 'SALA'],
  C0P: ['CASSA'],
  C4P: ['CASSA'],
  R22P: ['REC'],
  R23P: ['REC'],
  R24P: ['REC'],
  S3P: ['SALA', 'REC', 'CASSA'],
  S7CP: ['SALA'],
  C15P: ['CASSA'],
  C5P: ['CASSA'],
  C20P: ['CASSA'],
};
const righe = Object.keys(COLLAB).map((n) => ({ nome: n, nomeFull: n, turno: n.replace(/P$/, '') }));
ctx._briefPauseCfgObj = {};
ctx._peJg = {};
let c = ctx._peGeneraSlots(righe, '2026-10-12');
ok(c && Array.isArray(c.varianti) && c.varianti.length === 2, 'due varianti (S22 e C23)');
eq(c.varianti.map((v) => v.sigla).sort(), ['C23', 'S22'], 'una per sostituto');
const scelta = c.varianti.find((v) => v.scelta);
const altra = c.varianti.find((v) => !v.scelta);
ok(scelta && altra && scelta.punteggio <= altra.punteggio, 'la consigliata ha il punteggio migliore');
ok(altra.contenuto && !altra.contenuto.varianti, 'l altra variante e un foglio completo, senza elenco annidato');
// R23 alle 20.00-20.30 dato da S3 (S22/C23 finiscono alle 20.00/20.10)
const s3col = PC.blocchi(c).find((b) => b.base === 4 && b.post === 'S3');
ok(
  s3col && s3col.righe.some((x) => x.pos === 'R23' && x.ini === 1200 && x.fin === 1230),
  'R23 20.00-20.30 lo copre S3',
);
const v22 = c.varianti.find((v) => v.sigla === 'S22');
const c22 = v22.contenuto || c;
const s3col22 = PC.blocchi(c22).find((b) => b.base === 4 && b.post === 'S3');
ok(s3col22 && s3col22.righe.some((x) => x.pos === 'R23' && x.ini === 1200), 'anche nella variante S22');
// senza S1, R23 in pausa SEMPRE 20.00-20.30 (regola «Senza S1: R23 alle 20.00»), in tutte e due
// le varianti: nessuna riga R23 20.30-21.00, nessuna sovrapposizione
const r23Sera = (cc) => {
  const l = [];
  PC.blocchi(cc).forEach((b) =>
    b.righe.forEach((x) => x.pos === 'R23' && x.ini >= 1170 && x.ini < 1290 && l.push(b.post + ' ' + x.ini)),
  );
  return l.sort();
};
// S7C formato anche al rec (colonna BG3 con la Reception): la sequenza di notte la fa lui
COLLAB.S7CP = ['SALA', 'REC'];
c = ctx._peGeneraSlots(righe, '2026-10-12');
c.varianti.forEach((v) =>
  eq(r23Sera(v.contenuto || c), ['S3 1200'], 'variante ' + v.sigla + ': R23 solo 20.00-20.30, da S3'),
);
const pers = ctx._pcPersone(righe, '2026-10-12');
c.varianti.forEach((v) => {
  const cc = v.contenuto || c;
  const pp = PC.pausePersone(cc, pers, cc.biglietti);
  const prima = pp['R23P'].alternative[0].pause[0];
  eq([prima.ini, prima.fin], [1200, 1230], 'variante ' + v.sigla + ': prima pausa di R23 20.00-20.30');
  const s7c = PC.blocchi(cc).find((b) => b.base === 7 && b.post === 'S7C');
  const seq = s7c.righe.filter((x) => x.ini >= 1320 && x.ini < 1395).map((x) => x.pos + ' ' + x.ini);
  eq(seq, ['PAUSA 1320', 'S3 1335', 'R24 1350', 'R23 1380'], 'variante ' + v.sigla + ': S7C 22.00 pausa, S3, R24, R23');
});
// domenica uguale
c = ctx._peGeneraSlots(righe, '2026-10-11');
eq(r23Sera(c), ['S3 1200'], 'domenica: R23 20.00-20.30 da S3');
// S3 non formato al rec: il cambio lo da S7C (BG3) se formato, altrimenti riga rossa
COLLAB.S3P = ['SALA', 'CASSA'];
c = ctx._peGeneraSlots(righe, '2026-10-12');
eq(r23Sera(c), ['S7C 1200'], 'S3 non formato al rec: R23 20.00-20.30 da S7C');
// S3 al rec ma non in cassa: non sa dare tutte le pause, il cambio lo da S7C
COLLAB.S3P = ['SALA', 'REC'];
c = ctx._peGeneraSlots(righe, '2026-10-12');
eq(r23Sera(c), ['S7C 1200'], 'S3 senza cassa: R23 20.00-20.30 da S7C');
// senza S1 e senza sostituti (S22 e C23 assenti): stessa regola
COLLAB.S3P = ['SALA', 'REC', 'CASSA'];
const nessuno = righe.filter((r) => !['S22', 'C23'].includes(r.turno));
c = ctx._peGeneraSlots(nessuno, '2026-10-12');
eq(r23Sera(c), ['S3 1200'], 'senza S1 ne sostituti: R23 20.00-20.30 da S3');
COLLAB.S3P = ['SALA', 'REC'];
c = ctx._peGeneraSlots(nessuno, '2026-10-12');
eq(r23Sera(c), ['S7C 1200'], 'senza sostituti e S3 senza cassa: da S7C');
COLLAB.S3P = ['SALA', 'CASSA'];
COLLAB.S7CP = ['SALA'];
c = ctx._peGeneraSlots(righe, '2026-10-12');
const rossa = Object.keys(c.celle).some((k) => /^20\.00 - 20\.30\s*\[!\]$/.test(String(c.celle[k].v)));
ok(r23Sera(c).length === 1 && rossa, 'nessuno formato al rec: R23 20.00-20.30 in rosso');
COLLAB.S3P = ['SALA', 'REC', 'CASSA'];
// regola spenta: come v464 (cambio di R23 dopo la fine del sostituto)
ctx._briefPauseCfgObj = { schemi: { slots: { r23Prima: { attivo: false } } } };
c = ctx._peGeneraSlots(righe, '2026-10-12');
ok(c && r23Sera(c).length >= 1, 'regola spenta: R23 serale con lo schema di prima');
ctx._briefPauseCfgObj = {};
// due R23: il secondo alle 20.30
const due = righe.concat([{ nome: 'R23B', nomeFull: 'R23B', turno: 'R23' }]);
COLLAB.R23B = ['REC'];
c = ctx._peGeneraSlots(due, '2026-10-12');
eq(r23Sera(c).length, 2, 'due R23: due cambi serali');
ok(r23Sera(c).some((x) => / 1200$/.test(x)) && r23Sera(c).some((x) => / 1230$/.test(x)), 'due R23: 20.00 e 20.30');
delete COLLAB.R23B;
// sostituto non valido (S22 senza cassa ne rec): un solo foglio, niente scelta
COLLAB.S22P = ['SALA'];
c = ctx._peGeneraSlots(righe, '2026-10-12');
ok(c && !c.varianti, 'S22 non formato ne in cassa ne al rec: resta solo C23, nessuna scelta');
COLLAB.S22P = ['SALA', 'REC', 'CASSA'];
// con S1 presente: nessuna variante
const conS1 = righe.concat([{ nome: 'S1P', nomeFull: 'S1P', turno: 'S1' }]);
COLLAB.S1P = ['SALA', 'REC', 'CASSA'];
c = ctx._peGeneraSlots(conS1, '2026-10-12');
ok(c && !c.varianti && !c.sostituto, 'con S1 presente: un foglio solo, come sempre');
// elenco dei sostituti vuoto: un foglio solo (scelta del motore come prima)
ctx._briefPauseCfgObj = { schemi: { slots: { sostituti: { S1: [] } } } };
c = ctx._peGeneraSlots(righe, '2026-10-12');
ok(c && !c.varianti, 'senza sostituti in elenco: nessuna scelta');
ctx._briefPauseCfgObj = {};
// R24 alle 22.30 nel foglio completo
c = ctx._peGeneraSlots(conS1, '2026-10-12');
const r24 = [];
PC.blocchi(c).forEach((b) => b.righe.forEach((x) => x.pos === 'R24' && x.ini < 1380 && r24.push(x.ini)));
eq(r24, [1350], 'foglio completo del lunedi: R24 alle 22.30');
c = ctx._peGeneraSlots(conS1, '2026-10-11');
const r24d = [];
PC.blocchi(c).forEach((b) => b.righe.forEach((x) => x.pos === 'R24' && x.ini < 1380 && r24d.push(x.ini)));
eq(r24d, [1350], 'anche la domenica');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
if (falliti) process.exit(1);
