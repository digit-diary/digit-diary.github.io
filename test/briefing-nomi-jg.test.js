/**
 * Test del foglio del briefing (js/piano-briefing-ui.js), richieste del titolare 21/10/2026:
 *  - cognomi uguali nello stesso giorno: cognome + iniziale del nome (BIANCHI C. / BIANCHI M.),
 *    due lettere se l iniziale non basta (BIANCHI Ma. / BIANCHI Mi.), il nome intero se non
 *    bastano nemmeno quelle;
 *  - il JG sta subito dopo l ultimo turno di sala (Slots e Valet: dopo le S/X, prima di R, 9/L1
 *    e Z; gli altri settori: dopo tutti i turni).
 *   node test/briefing-nomi-jg.test.js
 */
const fs = require('fs');
const vm = require('vm');
const ctx = { console, document: { addEventListener() {}, getElementById: () => null }, addEventListener() {} };
ctx.window = ctx;
ctx.__settore = 'slots';
ctx._pianoReparto = () => ctx.__settore;
const turni = {
  C0: '07:00',
  C5: '15:00',
  S3: '15:00',
  S1: '10:00',
  R1: '11:00',
  Z1: '18:00',
  L1: '20:00',
  X1: '11:00',
  I42: '12:00',
  9: '20:00',
  12: '12:00',
};
ctx._pianoTurnoInfo = (c) => (turni[c] ? { codice: c, ora_inizio: turni[c] } : null);
ctx._pianoOra = (s) => {
  const m = /^(\d\d):(\d\d)$/.exec(s || '');
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/piano-briefing-ui.js', 'utf8'), ctx);

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
const riga = (full, turno) => {
  const p = full.split(' ');
  return { nome: p.slice(0, -1).join(' ').toUpperCase(), nomeFull: full, turno: turno || 'S3' };
};

console.log('\n== cognomi uguali ==');
let r = ctx._briefNomiDistinti([riga('Bianchi Chiara'), riga('Bianchi Milena'), riga('Rossi Anna')]);
eq(
  r.map((x) => x.nome),
  ['BIANCHI C.', 'BIANCHI M.', 'ROSSI'],
  'iniziale del nome solo per chi ha il cognome uguale',
);
r = ctx._briefNomiDistinti([riga('Bianchi Marco'), riga('Bianchi Milena')]);
eq(
  r.map((x) => x.nome),
  ['BIANCHI Ma.', 'BIANCHI Mi.'],
  'stessa iniziale: due lettere',
);
r = ctx._briefNomiDistinti([riga('Bianchi Mario'), riga('Bianchi Marta'), riga('Bianchi Luca')]);
eq(
  r.map((x) => x.nome),
  ['BIANCHI Mario', 'BIANCHI Marta', 'BIANCHI L.'],
  'due lettere uguali: nome intero, gli altri restano con l iniziale',
);
r = ctx._briefNomiDistinti([riga('De Luca Paolo'), riga('De Luca Sara'), riga('Luca Pietro')]);
eq(
  r.map((x) => x.nome),
  ['DE LUCA P.', 'DE LUCA S.', 'LUCA'],
  'cognome di due parole',
);
r = ctx._briefNomiDistinti([riga('Bianchi Chiara', 'S3'), riga('Bianchi Chiara', 'JG')]);
eq(
  r.map((x) => x.nome),
  ['BIANCHI', 'BIANCHI'],
  'la stessa persona due volte non si distingue da se stessa',
);
r = ctx._briefNomiDistinti([{ nome: 'XXX', nomeFull: null, turno: 'C0' }, riga('Verdi Ugo')]);
eq(
  r.map((x) => x.nome),
  ['XXX', 'VERDI'],
  'posti scoperti (XXX) intatti',
);

console.log('\n== JG nel foglio: Slots ==');
ctx.__settore = 'slots';
const ordine = (lista) => ctx._briefOrdina(lista.map((t, i) => ({ nome: 'N' + i, turno: t }))).map((x) => x.turno);
eq(
  ordine(['Z1', 'JG', 'R1', 'S3', 'C5', 'L1', 'S1', 'C0']),
  ['C0', 'C5', 'S1', 'S3', 'JG', 'R1', 'L1', 'Z1'],
  'JG subito dopo l ultima S, prima di R, L1 e Z',
);
eq(ctx._briefGruppo('JG'), ctx._briefGruppo('S3'), 'JG nel gruppo della sala (nessuno stacco tra S e JG)');
eq(ctx._briefGruppo('jg'), 1, 'sigla minuscola');

console.log('\n== JG nel foglio: Valet ==');
ctx.__settore = 'valet';
eq(ordine(['I42', 'JG', 'X1']), ['X1', 'JG', 'I42'], 'JG dopo i turni X');

console.log('\n== JG nel foglio: altri settori (per orario) ==');
ctx.__settore = 'tavoli';
eq(ordine(['JG', '9', '12']), ['12', '9', 'JG'], 'JG dopo tutti i turni, che restano per orario');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
