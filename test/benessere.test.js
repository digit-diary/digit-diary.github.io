/**
 * Test del calcolo del benessere (js/piano-benessere.js).
 *   node test/benessere.test.js
 * Esce con 0 se tutti i test passano, 1 se qualcuno fallisce. Nomi di fantasia.
 */
const B = require('../js/piano-benessere.js');

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

// turni di prova: ora inizio e fine (fine oltre 24 se passa la mezzanotte)
const TURNI = {
  P: [6, 14], // presto
  G: [11, 19.5], // giorno
  N: [20, 29], // notte 20-05
  T: [16, 25.75], // sera 16-01:45: meno di 3 ore notturne, non e notte
};
// costruisce i giorni da una stringa di sigle (una per giorno, separate da spazio) a partire da
// una data; '.' = riposo C, 'V' = vacanza, 'M' = malattia, 'D' = ND chiesto, '_' = senza piano
function giorni(da, sigle) {
  const out = [];
  const d0 = new Date(da + 'T12:00:00');
  sigle
    .trim()
    .split(/\s+/)
    .forEach((s, i) => {
      const d = new Date(d0);
      d.setDate(d0.getDate() + i);
      const iso =
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const g = { data: iso, dow: d.getDay(), stato: 'riposo' };
      const base = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 3600000;
      if (TURNI[s]) {
        g.stato = 'lavoro';
        g.int = { ini: base + TURNI[s][0], fin: base + TURNI[s][1] };
        g.notte = B.oreNotturne({ ini: TURNI[s][0], fin: TURNI[s][1] }, 23, 6) >= 3;
        g.presto = TURNI[s][0] < 8;
      } else if (s === 'V' || s === 'M') {
        g.stato = 'assenza';
        g.assenza = s;
      } else if (s === '_') g.stato = 'ignoto';
      else if (s === 'D') g.sceltoNd = true;
      if (g.dow === 0) g.domenica = g.stato === 'lavoro' ? 'lavoro' : g.stato === 'assenza' ? 'esclusa' : 'libera';
      out.push(g);
    });
  return out;
}
const voce = (res, k) => res.voci.find((v) => v.chiave === k) || { livello: '-' };
// 4 settimane da lunedi 7 settembre 2026
const DA = '2026-09-07';
const A = '2026-10-04';
const rip = (x, n) => Array(n).fill(x).join(' ');

console.log('\n== ore notturne ==');
ok(B.oreNotturne({ ini: 20, fin: 29 }, 23, 6) === 6, 'notte 20-05: 6 ore notturne');
ok(B.oreNotturne({ ini: 6, fin: 14 }, 23, 6) === 0, 'presto 06-14: nessuna ora notturna');
ok(B.oreNotturne({ ini: 16, fin: 25.75 }, 23, 6) === 2.75, 'sera 16-01:45: 2,75 ore (non e notte)');
ok(B.oreNotturne({ ini: 2, fin: 8 }, 23, 6) === 4, 'turno 02-08: 4 ore');

console.log('\n== presti: chi fa sempre il mattino sta bene ==');
const presti = rip('P P P P P . .', 4);
const settore = (lista) =>
  B.valutaSettore(
    lista.map((x) => ({ nome: x.nome, info: x.info || {}, giorni: giorni(DA, x.sigle) })),
    { da: DA, a: A, turnoDi: (k) => (k === 'G' ? { tipo: 'DIURNO' } : null) },
  );
let r = settore([
  { nome: 'Alfa', sigle: presti },
  { nome: 'Beta', sigle: rip('G G G G G . .', 4) },
  { nome: 'Gamma', sigle: rip('N N N . G G .', 4) },
]);
const alfa = r.find((x) => x.nome === 'Alfa');
ok(alfa.res.stato === 'ok', 'sempre presti: buono');
ok(
  voce(alfa.res, 'presti').livello === 'ok' && /nessun peso/.test(voce(alfa.res, 'presti').testo),
  'presti: nessun peso',
);

console.log('\n== solo notti: una scelta non e mai critica ==');
const nottiScelte = rip('N N N N . . .', 4);
r = settore([
  { nome: 'Notturno', info: { solo_notti: true }, sigle: nottiScelte },
  { nome: 'Uno', sigle: rip('G G G G G . .', 4) },
  { nome: 'Due', sigle: rip('G G N G G . .', 4) },
  { nome: 'Tre', sigle: rip('G G G N G . .', 4) },
]);
const nott = r.find((x) => x.nome === 'Notturno');
ok(voce(nott.res, 'notti').livello === 'nota', 'solo notti: le notti sono una nota');
ok(/scelta: solo notti/.test(voce(nott.res, 'notti').testo), 'il testo dice la scelta');
ok(nott.res.stato === 'ok', 'solo notti con riposi regolari: buono');
ok(/riposo fra i blocchi di notti regolare/.test(nott.res.perche), 'perche: riposo fra i blocchi regolare');
// la stessa quota NON scelta: squilibrio
r = settore([
  { nome: 'Carico', sigle: nottiScelte },
  { nome: 'Uno', sigle: rip('G G G G G . .', 4) },
  { nome: 'Due', sigle: rip('G G N G G . .', 4) },
  { nome: 'Tre', sigle: rip('G G G N G . .', 4) },
]);
const car = r.find((x) => x.nome === 'Carico');
ok(voce(car.res, 'notti').livello === 'critico', 'tutte notti NON scelte, colleghi di giorno: critico');
ok(/più dei colleghi/.test(voce(car.res, 'notti').testo), 'perche: piu dei colleghi');

console.log('\n== limiti di legge validi anche per chi ha scelto ==');
// 4 notti, 1 riposo, notti: recupero corto (05:00 -> 20:00 del giorno dopo = 39 ore)
const corto = rip('N N N N . N N', 4);
r = settore([
  { nome: 'Notturno', info: { solo_notti: true }, sigle: corto },
  { nome: 'Uno', sigle: presti },
  { nome: 'Due', sigle: presti },
]);
const nc = r.find((x) => x.nome === 'Notturno');
ok(voce(nc.res, 'recupero').livello === 'attenzione', 'recupero sotto 46 ore spesso: da tenere d occhio');
ok(/vale anche con la scelta solo notti/.test(voce(nc.res, 'recupero').testo), 'testo neutro con la scelta');
ok(voce(nc.res, 'serie').livello !== 'ok', 'serie oltre 5 giorni segnalata anche con solo notti');
// rientro breve: notte che finisce alle 05 e presto alle 06 = 1 ora
r = settore([
  { nome: 'Rientro', sigle: 'N P . . G G G ' + rip('G G G G G . .', 3) + ' G G G .' },
  { nome: 'Uno', sigle: presti },
  { nome: 'Due', sigle: presti },
]);
const rn = r.find((x) => x.nome === 'Rientro');
ok(voce(rn.res, 'rientri').livello === 'attenzione', 'un rientro sotto 11 ore: da tenere d occhio');
ok(/limite di legge/.test(voce(rn.res, 'rientri').testo), 'rientro: limite di legge');

console.log('\n== solo diurni con notti: la scelta non e rispettata ==');
r = settore([
  { nome: 'Diurno', info: { solo_diurni: true }, sigle: rip('G G N G G . .', 4) },
  { nome: 'Uno', sigle: presti },
  { nome: 'Due', sigle: presti },
]);
ok(/malgrado la scelta solo diurni/.test(voce(r[0].res, 'notti').testo), 'notti malgrado solo diurni');
ok(voce(r[0].res, 'notti').livello === 'attenzione', 'solo diurni con notti: da tenere d occhio');

console.log('\n== weekend ==');
const tutti = rip('. . G G G G G', 4); // lavora sempre sabato e domenica
const liberi = rip('G G G G G . .', 4);
r = settore([
  { nome: 'Weekend', sigle: tutti },
  { nome: 'Uno', sigle: liberi },
  { nome: 'Due', sigle: liberi },
  { nome: 'Tre', sigle: liberi },
  { nome: 'Scelto', info: { giorni_lavoro: '3,4,5,6,0' }, sigle: tutti },
]);
const we = r.find((x) => x.nome === 'Weekend');
ok(voce(we.res, 'weekend').livello === 'critico', '4 weekend su 4, colleghi meno: critico');
ok(
  /4 weekend lavorati su 4 · colleghi al 100%: media 0/.test(voce(we.res, 'weekend').testo),
  'perche weekend in una riga',
);
const sc = r.find((x) => x.nome === 'Scelto');
ok(voce(sc.res, 'weekend').livello === 'nota', 'giorni fissi con il weekend: nota');
// 13 settimane di domeniche lavorate: il minimo di legge vale anche con i giorni scelti
const lungo = B.valutaSettore(
  [{ nome: 'Scelto', info: { giorni_lavoro: '3,4,5,6,0' }, giorni: giorni('2026-06-01', rip('. . G G G G G', 13)) }],
  { da: '2026-06-01', a: '2026-08-30' },
)[0];
ok(voce(lungo.res, 'domeniche').livello !== 'ok', 'le domeniche libere restano un limite di legge');
ok(
  /vale anche con la scelta lavora/.test(voce(lungo.res, 'domeniche').testo),
  'domeniche: la scelta detta in modo neutro',
);
ok(voce(lungo.res, 'domeniche').livello !== 'critico', 'domeniche: una scelta non e mai critica');

console.log('\n== riposi isolati ==');
const sparsi = rip('G . G . G G .', 4);
r = settore([
  { nome: 'Sparso', sigle: sparsi },
  { nome: 'Parziale', info: { percentuale: 0.5 }, sigle: rip('G . G . . . .', 4) },
  { nome: 'Pieno', sigle: rip('G . G G G G .', 4) },
  { nome: 'Chiesti', sigle: rip('G D G D G G .', 4) },
  { nome: 'Uno', sigle: liberi },
]);
ok(voce(r.find((x) => x.nome === 'Sparso').res, 'isolati').livello !== 'ok', 'riposi isolati non scelti: segnalati');
ok(
  voce(r.find((x) => x.nome === 'Parziale').res, 'isolati').livello === 'ok',
  'al 50%: limite riportato alla percentuale (6)',
);
ok(
  voce(r.find((x) => x.nome === 'Pieno').res, 'isolati').livello !== 'ok',
  'gli stessi riposi isolati al 100%: segnalati',
);

ok(voce(r.find((x) => x.nome === 'Chiesti').res, 'isolati').livello === 'ok', 'riposi chiesti (ND): non contano');

console.log('\n== percentuale: confronto a parita di impiego ==');
// tempo pieno: 4 weekend su 4; al 50%: di solito 2 su 4
const pieno = rip('. . G G G G G', 4);
const meta = rip('. . . G . G .', 2) + ' ' + rip('. . . G G . .', 2);
r = settore([
  { nome: 'P1', sigle: pieno },
  { nome: 'P2', sigle: pieno },
  { nome: 'P3', sigle: pieno },
  { nome: 'M1', info: { percentuale: 0.5 }, sigle: meta },
  { nome: 'M2', info: { percentuale: 0.5 }, sigle: meta },
  { nome: 'M3', info: { percentuale: 0.5 }, sigle: meta },
  { nome: 'Mtutti', info: { percentuale: 0.5 }, sigle: rip('. . . . . G G', 4) },
]);
const mt = r.find((x) => x.nome === 'Mtutti');
ok(voce(mt.res, 'weekend').livello !== 'ok', 'al 50% con tutti i weekend: piu dei colleghi al 50%');
ok(/colleghi al 50%: media 2/.test(voce(mt.res, 'weekend').testo), 'perche: colleghi al 50%: media 2');
ok(voce(r.find((x) => x.nome === 'M1').res, 'weekend').livello === 'ok', 'al 50% come i colleghi al 50%: buono');
ok(voce(r.find((x) => x.nome === 'P1').res, 'weekend').livello === 'ok', 'tempo pieno confrontato con il tempo pieno');
ok(!mt.p.scelte.some((x) => /%/.test(x)), 'la percentuale non e una scelta');
// nessun collega alla stessa percentuale: media del gruppo riportata alla percentuale
r = settore([
  { nome: 'P1', sigle: pieno },
  { nome: 'P2', sigle: pieno },
  { nome: 'P3', sigle: pieno },
  { nome: 'Solo', info: { percentuale: 0.5 }, sigle: rip('. . . . . G G', 4) },
]);
ok(
  /colleghi riportati al 50%: media 2/.test(voce(r.find((x) => x.nome === 'Solo').res, 'weekend').testo),
  'senza colleghi al 50%: media riportata',
);

console.log('\n== domeniche libere: diritto annuale ==');
ok(B.domenicheRestanti('2026-12-26') === 1, 'una domenica dopo il 26.12.2026');
ok(B.domenicheRestanti('2026-12-31') === 0, 'nessuna domenica dopo il 31.12');

// anno intero visto in ottobre: 7 domeniche libere fino al 18.10, poi 6 settimane senza piano
// (domeniche future) e dicembre con le domeniche lavorate
const annoGiorni =
  rip('G G G G G G .', 7) + ' ' + rip('. G G G G G G', 34) + ' ' + rip('_', 7 * 6) + ' ' + rip('. G G G G G G', 4);
const anno = (oggi) =>
  B.valutaSettore([{ nome: 'Indietro', info: {}, giorni: giorni('2026-01-05', annoGiorni) }], {
    da: '2026-01-01',
    a: '2026-12-31',
    oggi: oggi,
  })[0];
ok(
  voce(anno('2026-10-15').res, 'domeniche').livello !== 'critico',
  'domeniche future senza piano: ancora recuperabili',
);
ok(voce(anno(null).res, 'domeniche').livello === 'critico', 'senza domeniche disponibili: minimo non raggiungibile');

console.log('\n== giorni senza piano ==');
r = settore([
  { nome: 'Vuoto', sigle: rip('_', 28) },
  { nome: 'Uno', sigle: presti },
]);
ok(r.length === 1 && r[0].nome === 'Uno', 'chi non ha piano nel periodo non compare');

console.log('\n== soglie dalle regole ==');
const s = B.soglieDa((n) => ({ min_riposo_ore: '12', benessere_notti_fila: '4' })[n]);
ok(s.minRiposo === 12 && s.nottiFila === 4 && s.recuperoOre === 46, 'soglie lette, predefiniti per le altre');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
