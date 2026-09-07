/**
 * Test automatici del motore delle regole del piano (js/piano-regole.js).
 *
 * Come si lancia (senza browser ne' server):
 *   node test/piano-regole.test.js
 *
 * Esce con codice 0 se tutti i test passano, 1 se qualcuno fallisce.
 * Da eseguire dopo OGNI modifica alle regole, prima di pubblicare.
 */
const R = require('../js/piano-regole.js');

let passati = 0;
let falliti = 0;
function ok(cond, nome) {
  if (cond) {
    passati++;
    console.log('  OK  ' + nome);
  } else {
    falliti++;
    console.log('  FAIL ' + nome);
  }
}
function eq(a, b, nome) {
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    nome + '  (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')',
  );
}

// --- turni di prova (come nel piano reale) ---
const TURNI = {
  PRESTO: { codice: 'PRESTO', ora_inizio: '06:00', ora_fine: '14:00', oltre23: false, tipo: 'DIURNO', gruppo: 'SALA' },
  POM: { codice: 'POM', ora_inizio: '14:00', ora_fine: '22:00', oltre23: false, tipo: 'DIURNO', gruppo: 'SALA' },
  NOTTE: { codice: 'NOTTE', ora_inizio: '22:00', ora_fine: '06:00', oltre23: true, tipo: 'NOTTURNO', gruppo: 'SALA' },
  REC: { codice: 'REC', ora_inizio: '10:00', ora_fine: '18:00', oltre23: false, tipo: 'DIURNO', gruppo: 'REC' },
};
const turnoDi = (c) => TURNI[c] || null;
const isLavoro = (c) => !!TURNI[c];

console.log('\n== oraNum ==');
eq(R.oraNum('08:30'), 8.5, 'oraNum 08:30');
eq(R.oraNum('00:00'), 0, 'oraNum 00:00');
eq(R.oraNum(''), null, 'oraNum vuoto = null');

console.log('\n== riposoOre ==');
// notte finisce alle 06:00, presto inizia alle 06:00 il giorno dopo -> 0h (in realta' 24h dal giorno prima)
eq(R.riposoOre(TURNI.NOTTE, TURNI.PRESTO), 0, 'notte -> presto = 0h di riposo');
// pom finisce 22:00, presto giorno dopo 06:00 -> 8h
eq(R.riposoOre(TURNI.POM, TURNI.PRESTO), 8, 'pom -> presto = 8h');
// presto finisce 14:00, presto giorno dopo 06:00 -> 16h
eq(R.riposoOre(TURNI.PRESTO, TURNI.PRESTO), 16, 'presto -> presto = 16h');
eq(R.riposoOre(null, TURNI.PRESTO), null, 'riposo con turno mancante = null');

console.log('\n== violazioniCella: riposo ==');
// presto il giorno 11 dopo la notte del 10 -> viola (0h < 11h)
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'NOTTE', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).length,
  1,
  'presto dopo notte = 1 avviso',
);
// stessa cosa vista dal giorno prima (metto la notte il 10, il presto c'e' gia' l'11)
ok(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'NOTTE', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-10',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).some((a) => /giorno dopo/.test(a)),
  'notte prima del presto = avviso "giorno dopo"',
);
// pom -> presto = 8h < 11h -> viola
ok(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'POM', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).length === 1,
  'pom -> presto (8h) = viola',
);
// presto -> presto = 16h -> ok
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'PRESTO', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }),
  [],
  'presto -> presto (16h) = nessun avviso',
);

console.log('\n== violazioniCella: consecutivi ==');
// 6 giorni di fila -> viola (max 5)
const sei = {};
for (let d = 10; d <= 15; d++) sei['2099-11-' + d] = 'PRESTO';
ok(
  R.violazioniCella({ mappaGiorni: sei, giorno: '2099-11-15', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  '6 giorni di fila = avviso consecutivi',
);
// 5 giorni -> ok
const cinque = {};
for (let d = 10; d <= 14; d++) cinque['2099-11-' + d] = 'PRESTO';
ok(
  !R.violazioniCella({ mappaGiorni: cinque, giorno: '2099-11-14', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  '5 giorni di fila = nessun avviso consecutivi',
);
// CROSS-MESE: 31/10..04/11 = 5, il 5/11 sarebbe il 6o
const cross = {};
for (const d of ['2099-10-31', '2099-11-01', '2099-11-02', '2099-11-03', '2099-11-04', '2099-11-05'])
  cross[d] = 'PRESTO';
ok(
  R.violazioniCella({ mappaGiorni: cross, giorno: '2099-11-05', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  'consecutivi contati a cavallo tra ottobre e novembre',
);

console.log('\n== violazioniCella: idoneita ==');
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-11': 'REC' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
    idoneo: false,
    codiceNuovo: 'REC',
  }).filter((a) => /non risulta formato/.test(a)).length,
  1,
  'non idoneo = avviso formato',
);

console.log('\n== violazioniCella: regole spente ==');
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-11': 'NOTTE' },
    giorno: '2099-11-11',
    minRiposo: 0,
    maxCons: 0,
    turnoDi,
    isLavoro,
  }),
  [],
  'regole spente (0/0) = nessun avviso',
);

console.log('\n== violazioniAccompagnamento ==');
const gruppoDi = (c) => (turnoDi(c) ? turnoDi(c).gruppo.toUpperCase() : '');
// Papa accompagnato in REC, da solo in REC -> viola
eq(
  R.violazioniAccompagnamento({
    perNome: { Papa: 'REC' },
    turnoDi,
    gruppoDi,
    isAccompagnato: (n, g) => n === 'Papa' && g === 'REC',
  }),
  [{ nome: 'Papa', gruppo: 'REC' }],
  'accompagnato da solo = violazione',
);
// Papa con un collega in REC -> ok
eq(
  R.violazioniAccompagnamento({
    perNome: { Papa: 'REC', Rossi: 'REC' },
    turnoDi,
    gruppoDi,
    isAccompagnato: (n, g) => n === 'Papa' && g === 'REC',
  }),
  [],
  'accompagnato con un collega = nessuna violazione',
);

console.log('\n== idoneoPerTurno ==');
const ctxBase = {
  settoriDi: () => null, // nessun vincolo di settore
  regoleGruppoDi: () => [],
  campoOk: () => true,
  mappFunzione: () => null,
  regolaVal: () => null,
};
ok(R.idoneoPerTurno({ funzione: 'SA' }, TURNI.PRESTO, ctxBase), 'nessun vincolo = idoneo');
ok(!R.idoneoPerTurno({ solo_diurni: true }, TURNI.NOTTE, ctxBase), 'solo_diurni = non idoneo alla notte');
ok(!R.idoneoPerTurno({ turni_bloccati: 'PRESTO' }, TURNI.PRESTO, ctxBase), 'turno bloccato = non idoneo');
// settore non assegnato senza campo -> non idoneo
ok(
  !R.idoneoPerTurno({ funzione: 'SA' }, TURNI.REC, { ...ctxBase, settoriDi: () => ['SALA'] }),
  'settore REC non assegnato = non idoneo',
);
ok(
  R.idoneoPerTurno({ funzione: 'SA' }, TURNI.REC, { ...ctxBase, settoriDi: () => ['SALA', 'REC'] }),
  'settore REC assegnato = idoneo',
);

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
