/**
 * Test del motore delle regole pause (js/pause-engine.js).
 *   node test/pause-regole.test.js
 * Carica il file nel contesto di Node con i pochi appoggi che servono
 * (settore corrente, turni del settore, impostazioni) e verifica:
 * traduzione delle vecchie impostazioni, composizione per turno e durata,
 * controlli alla creazione, generazione algoritmica con fascia e persone
 * insieme, verifica delle pause generate.
 */
const fs = require('fs');
const vm = require('vm');
const ctx = {
  window: {},
  console,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: () => null, setItem() {} },
};
ctx.window = ctx;
ctx._pianoReparto = () => ctx.__settore;
ctx._pianoTurniReparto = () => ctx.__turni;
ctx.pianoCodiciCache = [];
ctx.escP = (x) => String(x);
ctx.isAdmin = () => true;
ctx._briefGruppo = () => 0;
ctx._pianoColore = () => '';
ctx._briefOrarioHM = (x) => (x ? String(x).substring(0, 5) : '');
ctx._briefData = '2026-09-30';
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

// turni del settore di prova
ctx.__turni = [
  { codice: 'S3', ora_inizio: '15:00', ora_fine: '23:00' },
  { codice: 'X1', ora_inizio: '11:00', ora_fine: '20:00' },
  { codice: 'N1', ora_inizio: '20:00', ora_fine: '03:00' },
];
const orari = {
  S3: { ini: 900, fin: 1380, dur: 480 },
  X1: { ini: 660, fin: 1200, dur: 540 },
  N1: { ini: 1200, fin: 1620, dur: 420 },
};

console.log('\n== traduzione vecchie impostazioni ==');
ctx.__settore = 'slots';
ctx._briefPauseCfgObj = { slots_6h: 30, slots_7h: 45, slots_9h: 60, turni: { S3: '15+15', ZZ: '10' } };
let r = ctx._peRegolePause('slots');
eq(
  r.filter((x) => x.tipo === 'durata').map((x) => x.pause),
  ['15+15', '30+15', '30+15+15'],
  'slots: tre fasce dai minuti',
);
eq(
  r.filter((x) => x.tipo === 'turno').map((x) => x.turno),
  ['S3'],
  'slots: solo i turni del settore',
);
ctx.__settore = 'valet';
ctx._briefPauseCfgObj = { valet_gap: 50, picco_da: '22.30', picco_a: '00.30', valet_nota: 'ciao' };
r = ctx._peRegolePause('valet');
eq(r.find((x) => x.tipo === 'distanza').minuti, 50, 'valet: distanza dal vecchio gap');
eq(r.find((x) => x.tipo === 'fascia').giorni, [5, 6], 'valet: fascia ven/sab');
eq(r.find((x) => x.tipo === 'nota').testo, 'ciao', 'valet: nota');

console.log('\n== composizione ==');
ctx.__settore = 'slots';
ctx._briefPauseCfgObj = {
  regole: {
    slots: [
      { tipo: 'durata', da: 7, a: 9, pause: '30+15' },
      { tipo: 'durata', da: 9, a: 24, pause: '30+15+15' },
      { tipo: 'turno', turno: 'S3', pause: '20+20' },
    ],
  },
};
eq(ctx._pePauseSplit(orari, 'S3'), [20, 20], 'regola turno vince');
eq(ctx._pePauseSplit(orari, 'X1'), [30, 15, 15], '9 ore: fascia 9-24');
eq(ctx._pePauseSplit(orari, 'N1'), [30, 15], '7 ore: fascia 7-9');
ctx._briefPauseCfgObj = { regole: { slots: [{ tipo: 'turno', turno: 'S3', pause: '0' }] }, slots_7h: 45 };
eq(ctx._pePauseSplit(orari, 'S3'), [], 'turno con 0 = nessuna pausa');
eq(ctx._pePauseSplit(orari, 'X1'), [30, 15, 15], 'senza regola per durata: valore di base (9 ore)');
eq(ctx._pePauseSplit(orari, 'N1'), [30, 15], 'senza regola per durata: 7 ore = 30+15');
ok(
  ctx._peDurataLbl(7, 8) === 'Turni di 7 ore' &&
    ctx._peDurataLbl(8, 24) === 'Turni da 8 ore in su' &&
    ctx._peDurataLbl(6, 8) === 'Turni da 6 a meno di 8 ore',
  'dicitura delle fasce',
);

console.log('\n== controlli ==');
ctx._briefPauseCfgObj = {};
ok(
  ctx._peValidaRegolaPausa({ tipo: 'turno', turno: 'QQ', pause: '15' }, 'slots', []).errore,
  'sigla inesistente bloccata',
);
ok(!ctx._peValidaRegolaPausa({ tipo: 'turno', turno: 's3', pause: '15+15' }, 'slots', []).errore, 'sigla esistente ok');
ok(
  ctx._peValidaRegolaPausa({ tipo: 'durata', da: 9, a: 7, pause: '15' }, 'slots', []).errore,
  'ore invertite bloccate',
);
ok(
  ctx._peValidaRegolaPausa({ tipo: 'durata', da: 6, a: 8, pause: '15' }, 'slots', [
    { tipo: 'durata', da: 7, a: 9, pause: '30' },
  ]).avvisi.length === 1,
  'sovrapposizione avvisata',
);
ok(
  ctx._peValidaRegolaPausa({ tipo: 'fascia', da: '23.00', a: 'x', giorni: [] }, 'valet', []).errore,
  'orario sbagliato bloccato',
);
ok(ctx._peValidaRegolaPausa({ tipo: 'insieme', n: 0 }, 'valet', []).errore, 'zero persone bloccato');
ok(
  ctx._peValidaRegolaPausa({ tipo: 'fascia', da: '23.00', a: '01.00', giorni: [5] }, 'slots', []).avvisi.length === 1,
  'slots: fascia = solo segnalazione, avvisato',
);
ok(
  ctx._peValidaRegolaPausa({ tipo: 'durata', da: 6, a: 8, pause: '15', giorni: [0] }, 'slots', [
    { tipo: 'durata', da: 7, a: 9, pause: '30', giorni: [5, 6] },
  ]).avvisi.length === 0,
  'giorni diversi: nessuna sovrapposizione',
);

console.log('\n== giorni: lun-gio / ven-sab / dom ==');
ctx.__settore = 'slots';
ctx._briefPauseCfgObj = {
  regole: {
    slots: [
      { tipo: 'durata', da: 7, a: 9, pause: '30+15' },
      { tipo: 'durata', da: 7, a: 9, pause: '30+15+15', giorni: [5, 6] },
      { tipo: 'turno', turno: 'S3', pause: '15+15', giorni: [0] },
    ],
  },
};
eq(ctx._pePauseSplit(orari, 'S3', 'slots', 3), [30, 15], 'mercoledi: regola senza giorni');
eq(ctx._pePauseSplit(orari, 'S3', 'slots', 6), [30, 15, 15], 'sabato: vince la regola ven-sab');
eq(ctx._pePauseSplit(orari, 'S3', 'slots', 0), [15, 15], 'domenica: vince la regola del turno');
ok(
  ctx._peRegolaDescr({ tipo: 'durata', da: 7, a: 9, pause: '30+15+15', giorni: [5, 6] }).includes('venerdi-sabato'),
  'descrizione con giorni',
);

console.log('\n== generazione algoritmica con regole ==');
ctx.__settore = 'valet';
ctx._briefPauseCfgObj = {
  regole: {
    valet: [
      { tipo: 'durata', da: 0, a: 24, pause: '30' },
      { tipo: 'fascia', giorni: [], da: '16.00', a: '18.00' },
      { tipo: 'insieme', n: 1 },
      { tipo: 'distanza', minuti: 60 },
    ],
  },
};
ctx.__turni = [{ codice: 'V1', ora_inizio: '14:00', ora_fine: '22:00' }];
const righe = [
  { nome: 'A', turno: 'V1' },
  { nome: 'B', turno: 'V1' },
  { nome: 'C', turno: 'V1' },
];
const out = ctx._peGeneraValet(righe, '2026-09-30');
ok(out && out.righe.length === 3, 'tre righe generate');
const min = (t) => ctx._peOraMin(t.split(' - ')[0]);
const inizi = out.righe.map((x) => min(x.pause[0])).sort((a, b) => a - b);
ok(
  inizi.every((m) => m >= 14 * 60 + 60),
  'prima pausa almeno 60 minuti dopo l inizio',
);
ok(
  inizi.every((m) => m + 30 <= 16 * 60 || m >= 18 * 60),
  'nessuna pausa nella fascia 16-18',
);
ok(new Set(inizi).size === 3, 'una persona alla volta');
eq(ctx._peVerificaRegolePause(out, '2026-09-30', 'valet'), [], 'verifica: nessuna violazione');
ctx._briefPauseCfgObj.regole.valet.push({ tipo: 'fascia', giorni: [3], da: '14.00', a: '22.00' });
ok(
  ctx._peVerificaRegolePause(out, '2026-09-30', 'valet').length === 3,
  'verifica: fascia del mercoledi segnala le tre pause',
);
ok(ctx._peVerificaRegolePause(out, '2026-10-01', 'valet').length === 0, 'verifica: giovedi la fascia non vale');

console.log('\n== verifica su foglio slots ==');
const sh = { tipo: 'slots', nR: 8, celle: {} };
sh.celle['4|1'] = { v: 'ROSSI', hdr: 1 };
sh.celle['4|2'] = { v: '15.00 - 23.00', hdr: 1 };
sh.celle['5|1'] = { v: 'PAUSA' };
sh.celle['5|2'] = { v: '15.15 - 15.45' };
sh.celle['4|4'] = { v: 'BIANCHI', hdr: 1 };
sh.celle['4|5'] = { v: '15.00 - 23.00', hdr: 1 };
sh.celle['5|4'] = { v: 'PAUSA' };
sh.celle['5|5'] = { v: '15.30 - 16.00' };
ctx.__settore = 'slots';
ctx._briefPauseCfgObj = {
  regole: {
    slots: [
      { tipo: 'distanza', minuti: 60 },
      { tipo: 'insieme', n: 1 },
    ],
  },
};
const v = ctx._peVerificaRegolePause(sh, '2026-09-30', 'slots');
ok(
  v.some((x) => x.startsWith('ROSSI')),
  'distanza: pausa a 15 minuti dall inizio segnalata',
);
ok(
  v.some((x) => x.includes('2 persone in pausa insieme')),
  'insieme: sovrapposizione segnalata',
);

console.log(
  '\n=======================================\n  ' +
    passati +
    ' passati, ' +
    falliti +
    ' falliti\n=======================================',
);
process.exit(falliti ? 1 : 0);
