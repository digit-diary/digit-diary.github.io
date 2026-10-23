/**
 * Test di logica pura (senza browser e senza database): periodo delle assenze scritte nel
 * Rapporto giornaliero (_rappPeriodoFrammento in js/rapporto.js), anche a cavallo di mese e
 * di anno (A1 del controllo del 23/10/2026: «dal 27 al 2» diventava dal 2 al 27).
 *   node test/rapporto-date.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let passati = 0,
  falliti = 0;
const eq = (a, b, n) => {
  const c = JSON.stringify(a) === JSON.stringify(b);
  c ? passati++ : falliti++;
  console.log(
    (c ? '  OK  ' : '  FAIL ') +
      n +
      (c ? '' : ' (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')'),
  );
};
function estrai(file, nome) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error(nome + ' non trovata in ' + file);
  let j = src.indexOf('{', i),
    liv = 0;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}' && --liv === 0) break;
  }
  return src.substring(i, j + 1);
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(estrai('utils.js', 'dataLocaleISO'), ctx);
vm.runInContext(estrai('rapporto.js', '_rappPeriodoFrammento'), ctx);
const iso = (d) => ctx.dataLocaleISO(d);
// periodo come "AAAA-MM-GG..AAAA-MM-GG" oppure "ERR: ..."
const per = (testo, ds) => {
  const pulita = testo.replace(/([a-zà-ü])(dal\s|fino\s)/gi, '$1 $2');
  const r = ctx._rappPeriodoFrammento(testo, pulita, ds);
  return r.errore ? 'ERR' : iso(r.inizio) + '..' + iso(r.fine);
};

console.log('Cambio di mese');
eq(per("D'Angelo malata dal 27 al 2", '2027-02-27'), '2027-02-27..2027-03-02', 'dal 27 al 2 (27/02) -> 27/02-02/03');
eq(per('Rossi assente dal 28 al 1', '2027-02-28'), '2027-02-28..2027-03-01', 'dal 28 al 1 a fine febbraio');
eq(per('Rossi malato dal 30 al 3', '2027-04-30'), '2027-04-30..2027-05-03', 'dal 30 al 3 aprile-maggio');
eq(per('Rossi malato dal 3 al 5', '2027-05-02'), '2027-05-03..2027-05-05', 'dal 3 al 5 stesso mese');
eq(
  per('Rossi malato dal 29 al 2', '2027-05-01'),
  '2027-04-29..2027-05-02',
  'dal 29 al 2 scritto il 1 maggio (inizio nel mese prima)',
);
eq(per('Rossi fino al 3', '2027-02-27'), '2027-02-27..2027-03-03', 'fino al 3 (27/02) -> mese dopo, non anno dopo');
eq(per('Rossi assente fino al 28', '2027-02-27'), '2027-02-27..2027-02-28', 'fino al 28 stesso mese');
eq(per('Rossi assente il 2', '2027-02-27'), '2027-03-02..2027-03-02', 'il 2 scritto il 27/02 -> 02/03');
eq(per('Rossi assente il 26', '2027-02-27'), '2027-02-26..2027-02-26', 'il 26 scritto il 27/02 -> ieri');
eq(per('Rossi assente il 15', '2027-05-10'), '2027-05-15..2027-05-15', 'il 15 nello stesso mese');
eq(per('Rossi assente dal 12', '2027-05-10'), '2027-05-12..2027-05-12', 'dal 12 senza al = quel giorno');

console.log('Cambio di anno');
eq(per('Qualitano assente dal 30/12 al 2/1', '2026-12-30'), '2026-12-30..2027-01-02', 'dal 30/12 al 2/1 (30/12)');
eq(per('Qualitano assente dal 30 al 2', '2026-12-30'), '2026-12-30..2027-01-02', 'dal 30 al 2 (30/12)');
eq(
  per('Qualitano assente dal 30/12 al 2/1', '2027-01-02'),
  '2026-12-30..2027-01-02',
  'dal 30/12 al 2/1 scritto il 02/01',
);
eq(per('Qualitano fino al 3/1', '2026-12-30'), '2026-12-30..2027-01-03', 'fino al 3/1 a fine dicembre');
eq(per('Qualitano fino al 3', '2026-12-30'), '2026-12-30..2027-01-03', 'fino al 3 a fine dicembre');
eq(per('Qualitano assente il 2', '2026-12-30'), '2027-01-02..2027-01-02', 'il 2 scritto il 30/12');
eq(per('Qualitano assente il 31/12', '2027-01-02'), '2026-12-31..2026-12-31', 'il 31/12 scritto il 02/01');
eq(per('Rossi dal 30/12/2026 al 2/1/2027', '2026-12-30'), '2026-12-30..2027-01-02', 'date intere');
eq(per('Rossi dal 30.12.26 al 02.01.27', '2026-12-30'), '2026-12-30..2027-01-02', 'anno a due cifre e punti');
eq(per('Rossi dal 30/12/2026 al 2/1', '2026-12-30'), '2026-12-30..2027-01-02', 'anno solo all inizio');

console.log('Parole');
eq(per('Rossi malato domani', '2027-02-28'), '2027-03-01..2027-03-01', 'domani a fine febbraio');
eq(per('Rossi malato domani', '2026-12-31'), '2027-01-01..2027-01-01', 'domani a fine anno');
eq(per('Rossi oggi e domani', '2027-05-31'), '2027-05-31..2027-06-01', 'oggi e domani a fine mese');
eq(per('Rossi assente oggi e dopodomani', '2027-05-10'), '2027-05-10..2027-05-12', 'oggi e dopodomani');
eq(per('Rossi assente domani e dopodomani', '2027-05-10'), '2027-05-11..2027-05-12', 'domani e dopodomani');
eq(per('Rossi assente dopodomani', '2027-05-10'), '2027-05-11..2027-05-12', 'dopodomani (come prima)');
eq(per('Rossi malato da domani fino al 14', '2027-05-10'), '2027-05-11..2027-05-14', 'da domani fino al 14');
eq(per('Rossi malato dal 27 fino al 2', '2027-02-27'), '2027-02-27..2027-03-02', 'dal 27 fino al 2');
// 10/05/2027 e un lunedi
eq(per('Rossi assente fino a venerdì', '2027-05-10'), '2027-05-10..2027-05-14', 'fino a venerdì');
eq(per('Rossi assente oggi e venerdi', '2027-05-10'), '2027-05-10..2027-05-14', 'oggi e venerdi');
eq(per('Rossi assente domani e mercoledì', '2027-05-10'), '2027-05-11..2027-05-12', 'domani e mercoledì');
eq(per('Rossi assente venerdi', '2027-05-10'), '2027-05-14..2027-05-14', 'venerdi da solo');
eq(per('Rossi assente lunedi', '2027-05-10'), '2027-05-17..2027-05-17', 'lunedi scritto di lunedi = il prossimo');
eq(per('Rossi assente', '2027-05-10'), '2027-05-10..2027-05-10', 'senza date = giorno del rapporto');
eq(per('Rossi assente oggi', '2027-05-10'), '2027-05-10..2027-05-10', 'oggi');
eq(per('Rossi S7 dal 3 al 5', '2027-05-01'), '2027-05-03..2027-05-05', 'con la sigla del turno');
eq(per('Rossi malatadal 3 al 5', '2027-05-01'), '2027-05-03..2027-05-05', 'parola attaccata a dal');

console.log('Errori invece dello scambio silenzioso');
eq(per('Rossi dal 5/3 al 2/3', '2027-03-01'), 'ERR', 'fine prima dell inizio con il mese scritto');
eq(per('Rossi dal 5/3/2027 al 2/3/2027', '2027-03-01'), 'ERR', 'date intere invertite');
eq(per('Rossi dal 31/02 al 3/3', '2027-02-27'), 'ERR', '31 febbraio non esiste');
eq(per('Rossi dal 28 al 31', '2027-02-27'), 'ERR', 'dal 28 al 31 a febbraio: il 31 non esiste');
eq(
  per('Rossi assente il 31', '2027-04-10'),
  '2027-03-31..2027-03-31',
  'il 31 ad aprile: il piu vicino esistente (31/03)',
);
eq(per('Rossi fino al 2/1/2026', '2026-12-30'), 'ERR', 'fino a una data intera nel passato');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
