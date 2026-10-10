/**
 * Test automatici della ricerca sul piano (js/piano-ricerca.js).
 *
 * Come si lancia (senza browser ne server):
 *   node test/piano-ricerca.test.js
 *
 * Esce con codice 0 se tutti i test passano, 1 se qualcuno fallisce.
 */
const R = require('../js/piano-ricerca.js');
const PR = require('../js/piano-regole.js');

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

// mese finto di 14 giorni, due turni: mattina M (06-14) e notte N (22-06)
const TURNI = {
  M: { ora_inizio: '06:00', ora_fine: '14:00', durata: 8 },
  N: { ora_inizio: '22:00', ora_fine: '06:00', durata: 8 },
};
const giorni = [];
for (let g = 1; g <= 14; g++) giorni.push('2026-11-' + String(g).padStart(2, '0'));
const persone = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena'];
const fabbisogno = {};
giorni.forEach((d) => (fabbisogno[d] = { M: 1, N: 1 }));
const isLavoro = (c) => !!TURNI[c];
// REGOLE (come quelle vere, in piccolo): 11 ore di riposo, max 5 giorni di fila,
// ore del mese vicine all obiettivo (6 turni = 48 ore)
function violazioni(nome, mappa) {
  let v = 0;
  let consec = 0;
  for (let i = 0; i < giorni.length; i++) {
    const c = mappa[giorni[i]] || '';
    if (isLavoro(c)) {
      consec++;
      if (consec === 6) v++;
    } else consec = 0;
    const c2 = mappa[giorni[i + 1]] || '';
    if (isLavoro(c) && isLavoro(c2)) {
      const r = PR.riposoOre(TURNI[c], TURNI[c2]);
      if (r != null && r < 11) v++;
    }
  }
  return v;
}
function ore(mappa) {
  return giorni.reduce((t, d) => t + (isLavoro(mappa[d]) ? 8 : 0), 0);
}
const costoPersona = (nome, mappa) => 1000 * violazioni(nome, mappa) + 2 * Math.abs(ore(mappa) - 48);

function problema(extra) {
  const stato = {};
  persone.forEach((n) => {
    stato[n] = {};
    giorni.forEach((d) => (stato[n][d] = 'C'));
  });
  return Object.assign(
    {
      giorni: giorni,
      persone: persone,
      stato: stato,
      riposo: 'C',
      fabbisogno: fabbisogno,
      modificabile: () => true,
      ammessi: () => ['M', 'N', 'C'],
      costoPersona: costoPersona,
    },
    extra || {},
  );
}

console.log('== da un piano vuoto ==');
const r1 = R.cerca(problema(), { seme: 7 }, 40000);
ok(r1.prima.scoperti === 28, 'partenza: 28 posti scoperti (14 giorni x 2)');
ok(r1.dopo.scoperti === 0, 'dopo la ricerca: nessun posto scoperto (' + r1.dopo.scoperti + ')');
const viol1 = persone.reduce((t, n) => t + violazioni(n, r1.stato[n]), 0);
ok(viol1 === 0, 'nessuna regola violata: riposo 11 ore e giorni di fila (' + viol1 + ')');
const ore1 = persone.map((n) => ore(r1.stato[n]));
ok(
  ore1.every((h) => Math.abs(h - 48) <= 16),
  'ore del mese vicine all obiettivo per tutti: ' + ore1.join(', '),
);

console.log('== ripetibile ==');
const r1b = R.cerca(problema(), { seme: 7 }, 40000);
ok(JSON.stringify(r1b.stato) === JSON.stringify(r1.stato), 'stesso seme, stesso risultato');

console.log('== idoneita e celle bloccate ==');
const r2 = R.cerca(
  problema({
    ammessi: (n) => (n === 'Anna' ? ['M', 'C'] : ['M', 'N', 'C']), // Anna solo diurni
    modificabile: (n, d) => !(n === 'Bruno' && d <= '2026-11-03'), // Bruno: primi 3 giorni bloccati (vacanza)
  }),
  { seme: 3 },
  40000,
);
ok(
  giorni.every((d) => r2.stato.Anna[d] !== 'N'),
  'Anna (solo diurni) non ha mai la notte',
);
ok(
  ['2026-11-01', '2026-11-02', '2026-11-03'].every((d) => r2.stato.Bruno[d] === 'C'),
  'le celle bloccate di Bruno restano come erano',
);
ok(r2.dopo.scoperti === 0, 'anche cosi tutto coperto (' + r2.dopo.scoperti + ')');

console.log('== celle obbligate (formazione) ==');
const fissi = { Carla: { '2026-11-05': 'M', '2026-11-06': 'M', '2026-11-07': 'N' } };
const r3 = R.cerca(problema({ fissi: fissi }), { seme: 5 }, 40000);
ok(r3.stato.Carla['2026-11-05'] === 'M' && r3.stato.Carla['2026-11-07'] === 'N', 'le celle obbligate restano');
ok(r3.dopo.scoperti === 0, 'il resto si sistema attorno (' + r3.dopo.scoperti + ' scoperti)');

console.log('== pochi cambi su un piano gia fatto ==');
// piano gia buono: Anna/Bruno a turni alterni... parto dal risultato r1 e chiedo
// una cella obbligata: con il peso dei cambi la ricerca tocca poche celle
const statoFatto = JSON.parse(JSON.stringify(r1.stato));
const chi = persone.find((n) => statoFatto[n]['2026-11-10'] === 'C' && statoFatto[n]['2026-11-09'] !== 'N');
const r4 = R.cerca(
  problema({ stato: statoFatto, fissi: { [chi]: { '2026-11-10': 'M' } } }),
  { seme: 11, pesoCambio: 40 },
  30000,
);
ok(r4.stato[chi]['2026-11-10'] === 'M', chi + ' ha la cella obbligata');
ok(r4.cambi.length <= 8, 'cambi limitati: ' + r4.cambi.length + ' celle toccate');
ok(r4.dopo.scoperti === 0, 'sempre tutto coperto');
ok(persone.reduce((t, n) => t + violazioni(n, r4.stato[n]), 0) === 0, 'sempre nessuna regola violata');

console.log('== mai doppioni oltre il fabbisogno ==');
// 5 persone che vogliono 6 turni ciascuna (30) ma il fabbisogno ne offre 28: prima la
// ricerca poteva aggiungere un secondo M nello stesso giorno per dare ore a qualcuno
const r5 = R.cerca(problema(), { seme: 9 }, 40000);
const doppi = giorni.filter(
  (d) =>
    persone.filter((n) => r5.stato[n][d] === 'M').length > 1 ||
    persone.filter((n) => r5.stato[n][d] === 'N').length > 1,
);
ok(doppi.length === 0, 'nessun giorno con piu persone del fabbisogno (' + doppi.join(', ') + ')');
ok(r5.dopo.eccesso === 0, 'eccesso finale 0 (' + r5.dopo.eccesso + ')');
// partenza con un doppione: la ricerca lo toglie, non ne aggiunge
const statoDoppio = JSON.parse(JSON.stringify(r1.stato));
const libero = persone.find((n) => statoDoppio[n]['2026-11-04'] === 'C');
statoDoppio[libero]['2026-11-04'] = 'M';
const r6 = R.cerca(problema({ stato: statoDoppio }), { seme: 4 }, 30000);
ok(
  r6.prima.eccesso >= 1 && r6.dopo.eccesso <= r6.prima.eccesso,
  'un doppione di partenza non aumenta (' + r6.prima.eccesso + ' -> ' + r6.dopo.eccesso + ')',
);

console.log('== riposo come cella vuota (come lo passa il programma) ==');
// il programma passa riposo: '' e celle vuote; prima il motore usava 'C' lo stesso: niente
// scambi lavoro/riposo e cambi finti '' -> 'C'
const statoV = {};
persone.forEach((n) => {
  statoV[n] = {};
  giorni.forEach((d) => (statoV[n][d] = ''));
});
const r7 = R.cerca(problema({ stato: statoV, riposo: '', ammessi: () => ['M', 'N', ''] }), { seme: 7 }, 40000);
ok(r7.dopo.scoperti === 0, 'con riposo vuoto copre tutti i posti (' + r7.dopo.scoperti + ')');
ok(
  persone.every((n) => giorni.every((d) => ['M', 'N', ''].includes(r7.stato[n][d] || ''))),
  'nessuna C inventata: i riposi restano celle vuote',
);
const finti = (r7.cambi || []).filter((c) => !c.prima && !c.dopo).length;
ok(finti === 0, 'nessun cambio finto da vuoto a vuoto (' + finti + ')');

console.log('== posti rari prima dei comuni ==');
// un giorno: il turno S lo puo fare solo Anna, il turno M Anna e Bruno. Lasciare
// scoperto S o una M e lo stesso numero di posti: deve restare scoperta la M
{
  const d0 = giorni[0];
  const pr = {
    giorni: [d0],
    persone: ['Anna', 'Bruno'],
    stato: { Anna: { [d0]: 'M' }, Bruno: { [d0]: 'M' } },
    riposo: '',
    fabbisogno: { [d0]: { S: 1, M: 2 } },
    modificabile: () => true,
    ammessi: (n) => (n === 'Anna' ? ['S', 'M', ''] : ['M', '']),
    costoPersona: () => 0,
  };
  const r = R.cerca(pr, { seme: 3 }, 2000);
  ok(
    r.stato.Anna[d0] === 'S' && r.stato.Bruno[d0] === 'M',
    'Anna copre il turno che sa fare solo lei (' + r.stato.Anna[d0] + ')',
  );
  ok(r.dopo.scoperti === 1, 'resta scoperto un solo posto, quello che altri possono coprire');
}

console.log('== non peggiora mai ==');
ok(
  r1.dopo.punteggio <= r1.prima.punteggio && r2.dopo.punteggio <= r2.prima.punteggio,
  'il punteggio finale non supera quello di partenza',
);

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================');
process.exit(falliti ? 1 : 0);
