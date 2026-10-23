/**
 * Bozza a blocchi e correzioni del controllo del 23/10/2026, senza browser e senza database:
 *  - _pianoSchemaAbbina (js/piano-blocchi.js): abbinamento persona-posto del giorno, prima i
 *    posti riservati, chi resta senza posto;
 *  - _pianoBlocchiTipoTurno: presto / giorno / notte;
 *  - _pianoViolazioniPersona (js/piano-genera.js): i giorni di fila che continuano nel mese dopo
 *    gia scritto si vedono (prima no: 26.11-02.12 ai Tavoli);
 *  - _ricercaTipoViolazione (js/piano-ricerca-ui.js): le ore oltre il massimo del mese sono un
 *    vincolo a parte di Migliora.
 *   node test/piano-blocchi.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let passati = 0,
  falliti = 0;
const ok = (c, n) => {
  c ? passati++ : falliti++;
  console.log((c ? '  OK  ' : '  FAIL ') + n);
};
function estrai(file, nomi) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  return nomi
    .map((n) => {
      const re = new RegExp('^(?:async )?function ' + n + '\\(', 'm');
      const m = re.exec(src);
      if (!m) throw new Error(n + ' non trovata in ' + file);
      return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
    })
    .join('\n');
}
const turni = {
  N1: { codice: 'N1', tipo: 'NOTTURNO', ora_inizio: '20:00' },
  D1: { codice: 'D1', tipo: 'DIURNO', ora_inizio: '11:40' },
  P1: { codice: 'P1', tipo: 'PRESTO', ora_inizio: '06:00' },
};
const ctx = { console, Date, Set, Map, JSON, Math, String, parseInt, parseFloat, Object, Array, isFinite };
Object.assign(ctx, {
  _pianoOra: (h) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(h || ''));
    return m ? parseInt(m[1]) + parseInt(m[2]) / 60 : null;
  },
  _pianoTurnoInfo: (c) => turni[c] || null,
  _pianoIsLavoro: (c) => !!turni[c],
  _pianoRiposiSettimanali: () => [],
  _pianoSettimaneOltre: () => [],
  _pianoMaxGiorniSett: () => 0,
  _pianoRiposoOreTra: () => null,
  _pianoCollabInfo: () => ({}),
  _pianoLimitiOre: () => ({}),
  _pianoOreDiRiga: () => 0,
  _pianoEsenteRiposi: () => true,
  _pianoDomSospesaMese: () => null,
  _pianoCongediAttornoVacanze: () => false,
  _pianoWdDopoVacanza: () => 0,
  _pianoViolazioneFunzioneTurno: () => null,
  _pianoDomSabatoParam: () => ({ evita: false, copertura: false }),
  _pianoRegolaVal: () => null,
  _pianoGgMm: (d) => d,
  _pianoLunediDi: (d) => d,
  PianoRegole: require('../js/piano-regole.js'),
});
vm.createContext(ctx);
vm.runInContext(
  estrai('piano-blocchi.js', [
    '_pianoBlocchiTipoTurno',
    '_pianoSchemaAbbina',
    '_pianoRiposiLunghi',
    '_pianoRiposoMassimo',
  ]) +
    '\n' +
    estrai('piano-genera.js', ['_pianoViolazioniPersona']) +
    '\n' +
    estrai('piano-ricerca-ui.js', [
      '_ricercaPesoOrdine',
      '_ricercaRegolaDiQualita',
      '_ricercaRegolaDiLegge',
      '_ricercaSabatoTardi',
      '_ricercaLimiteGruppo',
      '_ricercaTipoViolazione',
    ]),
  ctx,
);

console.log('== tipo del turno per lo schema ==');
ok(ctx._pianoBlocchiTipoTurno(turni.N1) === 'N', 'notturno: N');
ok(ctx._pianoBlocchiTipoTurno(turni.D1) === 'D', 'diurno alle 11:40: D');
ok(ctx._pianoBlocchiTipoTurno(turni.P1) === 'P', 'inizio alle 6: P');

console.log('== abbinamento del giorno ==');
// due posti (uno riservato), tre persone: 0 fa solo Z, 1 fa S e Z, 2 solo S
const posti = [
  { c: 'Z', ris: true },
  { c: 'S', ris: false },
];
const puo = { 0: ['Z'], 1: ['S', 'Z'], 2: ['S'] };
const a = ctx._pianoSchemaAbbina(posti, [1, 2, 0], (i, c) => puo[i].includes(c));
ok(a.scop === 0 && a.scopR === 0, 'tutti i posti coperti');
ok(a.inPiu === 1, 'una persona senza posto (il giorno salterebbe)');
const b = ctx._pianoSchemaAbbina(posti, [1], (i, c) => puo[i].includes(c));
ok(b.scopR === 0 && b.scop === 1, 'una persona sola: prima il posto riservato');
const c = ctx._pianoSchemaAbbina([{ c: 'S' }, { c: 'S' }], [2, 1], (i, x) => puo[i].includes(x));
ok(c.scop === 0 && c.inPiu === 0, 'due posti uguali, due persone');

console.log('== giorni di fila con il mese dopo gia scritto ==');
const rv = { ym: '2026-11', nGiorni: 30, maxCons: 5, minRiposo: 11, maxSett: 0, ndV: {}, domeniche: [], domSabato: {} };
const riga = (d, c) => ({ collaboratore: 'A', data: d, codice: c });
const mese = ['26', '27', '28', '29', '30'].map((g) => riga('2026-11-' + g, 'N1'));
const dic = [riga('2026-12-01', 'N1'), riga('2026-12-02', 'N1')];
const v = ctx._pianoViolazioniPersona('A', mese, mese.concat(dic), rv);
const fila = v.filter((x) => /consecutivi/.test(x.msg));
ok(
  fila.length === 1 && /^7 giorni/.test(fila[0].msg) && fila[0].giorno === 30,
  '26.11-02.12: 7 giorni (' + (fila[0] || {}).msg + ')',
);
ok(ctx._ricercaRegolaDiLegge(fila[0].msg), 'e legge (vincolo di Migliora)');
const v2 = ctx._pianoViolazioniPersona('A', mese, mese.concat([riga('2026-12-02', 'N1')]), rv);
ok(!v2.some((x) => /consecutivi/.test(x.msg)), 'con il riposo l 1.12: nessuna serie');
const lunga = ['20', '21', '22', '23', '24', '25'].map((g) => riga('2026-11-' + g, 'N1'));
const v3 = ctx._pianoViolazioniPersona('A', lunga, lunga, rv);
ok(v3.filter((x) => /consecutivi/.test(x.msg)).length === 1, 'serie nel mese: una sola segnalazione come prima');

console.log('== ore oltre il massimo: vincolo a parte ==');
ok(
  ctx._ricercaTipoViolazione('ore mese 207.7h SOPRA il massimo 195.7h (regole tolleranza)') === 'oreSopra',
  'tipo oreSopra',
);
ok(
  ctx._ricercaTipoViolazione('ore mese 120h SOTTO il minimo 150h (regole tolleranza)') === 'oreSotto',
  'sotto resta oreSotto',
);

console.log('== riposi troppo lunghi ==');
// indici: da 2 a 11 il mese
const T = (x) => x.split('');
ok(ctx._pianoRiposiLunghi(T('ULLRRRRRRLLU'), 1, 10, 3) === 3, '6 liberi fra due blocchi, massimo 3: 3 giorni oltre');
ok(ctx._pianoRiposiLunghi(T('ULLXRRRRRRLU'), 1, 10, 3) === 0, 'attaccati a una vacanza: non si giudica');
ok(
  ctx._pianoRiposiLunghi(T('ULLLLRRRRRRRU'), 1, 11, 4) === 3,
  'fino alla fine del mese: si giudica (7 liberi, massimo 4)',
);
ok(ctx._pianoRiposiLunghi(T('ULLRZZZRRLLU'), 1, 10, 3) === 0, 'giorni in cui non puo lavorare non contano');
ok(ctx._pianoRiposiLunghi(T('ULLRRRLLRRLU'), 1, 10, 3) === 0, '3+2 liberi: niente');
ctx._pianoOreSett = 41;
ctx._pianoCollabInfo = () => ({ percentuale: 1 });
ok(ctx._pianoRiposoMassimo('A', 30, { obiettivo: 175.7 }) === 3, 'tempo pieno: 3 giorni');
ok(ctx._pianoRiposoMassimo('A', 30, { obiettivo: 105 }) === 4, '60%: 4 giorni');
ok(ctx._pianoRiposoMassimo('A', 30, { obiettivo: 70 }) === 5, '40%: 5 giorni');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
