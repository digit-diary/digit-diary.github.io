/**
 * Test dei controlli del foglio pause (js/pause-controlli.js).
 *   node test/pause-controlli.test.js
 * Fogli costruiti a mano con colonne e righe come quelle del briefing Slots:
 * lettura delle pause di ogni persona (colonna propria, righe di chi da il
 * cambio, due persone sullo stesso turno, righe in piu, bigliettino del
 * mattino, colonne in fila e alternative) e avvisi (regola delle ore,
 * distanza, pause fuori turno, sala vuota, riga che non copre nessuno).
 */
const PC = require('../js/pause-controlli.js');

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

// foglio: colonne = [{base, post, nome, righe:[[pos, 'hh.mm - hh.mm', extra?]]}]
// le colonne con la stessa base si mettono una sotto l altra
function foglio(colonne) {
  const c = { tipo: 'slots', celle: {}, nR: 0 };
  const riga = { 1: 5, 4: 5, 7: 5 };
  colonne.forEach((col) => {
    let r = riga[col.base];
    c.celle[r + '|' + col.base] = { v: col.post, hdr: 1, pers: col.pers ? 1 : undefined };
    c.celle[r + '|' + (col.base + 1)] = { v: col.nome, hdr: 1 };
    c.celle[r + 1 + '|' + (col.base + 1)] = { v: col.orario || '', ora: 1 };
    r += 2;
    col.righe.forEach(([pos, ora, extra]) => {
      c.celle[r + '|' + col.base] = Object.assign({ v: pos }, extra || {});
      c.celle[r + '|' + (col.base + 1)] = { v: ora };
      r++;
    });
    riga[col.base] = r + 2;
    c.nR = Math.max(c.nR, r);
  });
  return c;
}
const m = PC.minuti;
const persona = (nome, turno, da, a, attese) => ({ nome, turno, ini: m(da), fin: m(a), attese });
const pause = (pp, nome) => ((pp[nome] && pp[nome].alternative[0]) || { pause: [] }).pause.map((x) => PC.ora(x.ini) + '-' + PC.ora(x.fin));

console.log('Orari del foglio');
eq(m('20.00'), 1200, 'le 20.00 sono 1200 minuti');
eq(m('01.30'), 1530, 'dopo mezzanotte si conta nel giorno dopo (01.30 = 1530)');
eq(m('24.15'), 1455, 'la scrittura 24.15 del foglio');
eq(PC.ora(1455), '24.15', 'e si riscrive 24.15');
eq(PC.intervallo('23.30 - 01.00'), { ini: 1410, fin: 1500 }, 'intervallo a cavallo della mezzanotte');

console.log('\nColonne e righe');
const base = foglio([
  {
    base: 1,
    post: 'S1',
    nome: 'BUJIC',
    orario: '14.00 - 21.00',
    righe: [
      ['C0', '14.00 - 14.30'],
      ['R22', '15.00 - 15.15'],
      ['R22', '15.15 - 15.30'],
      ['SALA', '15.30 - 16.00'],
      ['PAUSA', '16.00 - 16.15'],
      ['R22', '17.15 - 17.30'],
      ['R22', '17.30 - 17.45'],
      ['SALA', '17.45 - 19.00'],
      ['PAUSA', '19.00 - 19.30'],
      ['S5', '19.30 - 20.00'],
      ['SALA', '20.00 - 21.00'],
    ],
  },
  {
    base: 4,
    post: 'S5',
    nome: 'ROSSI',
    orario: '20.00 - 02.00',
    righe: [
      ['SALA', '20.00 - 22.15'],
      ['PAUSA', '22.15 - 22.30'],
      ['SALA', '22.30 - 24.00'],
      ['PAUSA', '24.00 - 24.15'],
      ['SALA', '24.15 - 02.00'],
    ],
  },
]);
const bl = PC.blocchi(base);
eq(
  bl.map((b) => b.post + ':' + b.nome + ':' + b.righe.length),
  ['S1:BUJIC:11', 'S5:ROSSI:5'],
  'due colonne lette con intestazione e righe',
);

console.log('\nDue persone sullo stesso turno (due R22) e bigliettino del mattino');
const biglietto = [
  {
    righe: [
      { pos: 'R22', nome: 'VERDI', ini: 720, fin: 750, chi: 'C4' },
      { pos: 'R22', nome: 'NERI', ini: 750, fin: 780, chi: 'C4' },
    ],
  },
];
const due = [
  persona('BUJIC', 'S1', '14.00', '21.00', [30, 15]),
  persona('ROSSI', 'S5', '17.00', '02.00', [30, 15, 15]),
  persona('VERDI', 'R22', '11.40', '20.00', [30, 15, 15]),
  persona('NERI', 'R22', '11.40', '20.00', [30, 15, 15]),
];
let pp = PC.pausePersone(base, due, biglietto);
eq(pause(pp, 'VERDI'), ['12.00-12.30', '15.00-15.15', '17.15-17.30'], 'prima R22: mezz ora del bigliettino e 15+15');
eq(pause(pp, 'NERI'), ['12.30-13.00', '15.15-15.30', '17.30-17.45'], 'seconda R22: le righe attaccate vanno all altra');
eq(pause(pp, 'ROSSI'), ['19.30-20.00', '22.15-22.30', '24.00-24.15'], 'S5 con colonna dalle 20.00: conta anche la mezz ora data da S1 alle 19.30');
eq(
  PC.controlla(base, due, { biglietti: biglietto }).filter((a) => a.tipo !== 'sala'),
  [],
  'nessun avviso sulle persone quando tutto rispetta la regola',
);

console.log('\nUna sola R22: le righe in piu non sono pause');
const una = due.filter((p) => p.nome !== 'NERI');
const b1 = [{ righe: [biglietto[0].righe[0]] }];
const att = PC.attribuisci(base, una, b1);
eq(att.pause.VERDI.map((x) => PC.ora(x.ini)), ['15.00', '17.15'], 'la R22 sola prende un quarto d ora per volta');
eq(att.avanzi.length, 2, 'le altre due righe R22 non coprono nessuno');
const avvRiga = PC.controlla(base, una, { biglietti: b1 }).filter((a) => a.tipo === 'riga');
ok(avvRiga.length === 2 && /non copre la pausa di nessuno/.test(avvRiga[0].testo), 'avviso per le righe che non coprono nessuno');

console.log('\nRiga scritta per una persona (completamento)');
const conPer = foglio([
  {
    base: 1,
    post: 'S3',
    nome: 'SASSI',
    righe: [
      ['C15', '20.30 - 21.00'],
      ['C15', '23.30 - 23.45', { per: 'BIANCHI' }],
      ['C15', '01.30 - 01.45'],
    ],
  },
]);
const c15 = [persona('ROSSO', 'C15', '19.40', '04.10', [30, 15, 15]), persona('BIANCHI', 'C15', '19.40', '04.10', [15])];
pp = PC.pausePersone(conPer, c15);
eq(pause(pp, 'BIANCHI'), ['23.30-23.45'], 'la riga con il nome va a quella persona');
eq(pause(pp, 'ROSSO'), ['20.30-21.00', '01.30-01.45'], 'le altre a chi le aspetta');

console.log('\nRegola delle ore, distanza, fuori turno');
const corto = foglio([
  {
    base: 1,
    post: 'S7',
    nome: 'GRIGI',
    righe: [
      ['PAUSA', '21.30 - 22.00'],
      ['SALA', '22.00 - 22.15'],
      ['PAUSA', '22.15 - 22.30'],
    ],
  },
]);
const grigi = [persona('GRIGI', 'S7', '19.50', '04.10', [30, 15, 15])];
const av = PC.controlla(corto, grigi);
ok(av.some((a) => a.tipo === 'ore' && /30\+15\+15, nel foglio 30\+15/.test(a.testo)), 'manca una pausa: la regola prevede 30+15+15');
ok(av.some((a) => a.tipo === 'distanza' && /solo 15 minuti/.test(a.testo)), 'due pause a 15 minuti: avviso distanza');
const fuori = foglio([{ base: 1, post: 'S3', nome: 'BLU', righe: [['PAUSA', '19.00 - 19.15'], ['PAUSA', '22.00 - 22.15']] }]);
ok(
  PC.controlla(fuori, [persona('BLU', 'S3', '20.00', '02.00', [15, 15])]).some((a) => a.tipo === 'turno'),
  'pausa prima dell inizio del turno: avviso',
);

console.log('\nColonne della stessa persona e alternative');
const r8 = foglio([
  { base: 4, post: 'S3', nome: 'SASSI', righe: [['R8', '23.30 - 24.00'], ['R8', '01.45 - 02.00']] },
  { base: 4, post: 'R8', nome: 'TEPE', righe: [['REC', '02.00 - 02.15'], ['PAUSA', '03.30 - 03.45'], ['REC', '03.45 - 05.00']] },
]);
const tepe = [persona('TEPE', 'R8', '20.00', '05.10', [30, 15, 15]), persona('SASSI', 'S3', '20.00', '02.00', [])];
eq(pause(PC.pausePersone(r8, tepe), 'TEPE'), ['23.30-24.00', '01.45-02.00', '03.30-03.45'], 'R8 con colonna di notte: le pause date da S3 prima contano');
const attaccate = foglio([
  { base: 4, post: 'S3', nome: 'SASSI', righe: [['R8', '01.45 - 02.00']] },
  { base: 4, post: 'R8', nome: 'TEPE', righe: [['PAUSA', '02.00 - 02.15'], ['REC', '02.15 - 05.00']] },
]);
eq(pause(PC.pausePersone(attaccate, tepe), 'TEPE'), ['01.45-02.15'], 'pause attaccate in due colonne sono una pausa sola');
const alt = foglio([
  { base: 4, post: 'C8 (2)', nome: 'CASSA', righe: [['PAUSA', '02.15 - 02.30']] },
  {
    base: 4,
    post: 'C8 (2) (ALT.)',
    nome: 'CASSA',
    righe: [['PAUSA', '23.30 - 24.00'], ['PAUSA', '01.30 - 01.45'], ['PAUSA', '02.45 - 03.00']],
  },
]);
const cassa = [persona('CASSA', 'C8', '20.50', '05.10', [30, 15, 15])];
eq(PC.pausePersone(alt, cassa).CASSA.alternative.length, 2, 'la colonna ALT. e un alternativa');
eq(PC.controlla(alt, cassa), [], 'basta che una delle alternative rispetti la regola');
eq(PC.pausePersone(foglio([]), [persona('ROTA', 'C8', '20.50', '05.10', [30, 15, 15])]).ROTA.rotazione, true, 'C8 senza colonna: rotazione, non si controlla');

console.log('\nSala mai vuota');
const vuota = foglio([
  {
    base: 1,
    post: 'S1',
    nome: 'SOLO',
    righe: [
      ['C0', '14.00 - 14.30'],
      ['SALA', '14.30 - 16.00'],
      ['PAUSA', '16.00 - 16.15'],
      ['SALA', '16.15 - 21.00'],
    ],
  },
]);
const solo = [persona('SOLO', 'S1', '14.00', '21.00', [15])];
const buchi = PC.salaVuota(vuota, solo, PC.pausePersone(vuota, solo));
eq(buchi.map((b) => PC.ora(b.ini) + '-' + PC.ora(b.fin)), ['14.00-14.30', '16.00-16.15'], 'S1 in cassa o in pausa e nessun altro in sala');
const conCollega = solo.concat([persona('ALTRO', 'S24', '16.00', '01.00', [])]);
eq(
  PC.salaVuota(vuota, conCollega, PC.pausePersone(vuota, conCollega)).map((b) => PC.ora(b.ini)),
  ['14.00'],
  'con un collega di sala dalle 16.00 resta scoperta solo la mezz ora delle 14.00',
);
const conAccoglienza = solo.concat([Object.assign(persona('ACC', 'S31', '16.00', '01.00', [30, 15, 15]), { acc: true })]);
eq(
  PC.salaVuota(vuota, conAccoglienza, PC.pausePersone(vuota, conAccoglienza)).length,
  2,
  'l accoglienza (S31) al suo posto non conta come presenza in sala',
);
ok(!PC.controlla(vuota, conAccoglienza).some((a) => a.nome === 'ACC'), 'l accoglienza non riceve avvisi (si organizza da sola)');
const avvSala = PC.controlla(vuota, solo).filter((a) => a.tipo === 'sala');
eq(avvSala.length, 2, 'due avvisi: i buchi distano piu di un ora');
const vicini = foglio([
  {
    base: 1,
    post: 'S1',
    nome: 'SOLO',
    righe: [
      ['C0', '14.00 - 14.30'],
      ['SALA', '14.30 - 14.45'],
      ['C23', '14.45 - 15.15'],
      ['SALA', '15.15 - 21.00'],
    ],
  },
]);
const unico = PC.controlla(vicini, solo).filter((a) => a.tipo === 'sala');
ok(unico.length === 1 && /Fra le 14\.00 e le 15\.15 .* per 1 ora in tutto \(2 volte\)/.test(unico[0].testo), 'buchi vicini: un avviso solo, ' + (unico[0] || {}).testo);

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
if (falliti) process.exit(1);
