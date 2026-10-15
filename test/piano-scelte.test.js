/**
 * Test delle scelte del piano nel tempo (js/piano-scelte.js) e del Benessere che giudica ogni
 * parte del periodo con le scelte di allora (js/piano-benessere.js).
 *   node test/piano-scelte.test.js
 * Esce con 0 se tutti i test passano, 1 se qualcuno fallisce. Nomi di fantasia.
 */
const fs = require('fs');
const path = require('path');
const S = require('../js/piano-scelte.js');
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

console.log('== sceltaValidaIl ==');
// persona di fantasia: "solo diurni" spuntato il 01.11.2026; giorni 5,6 dal 10.09, tolti il 20.10
const anna = { id: 7, nome: 'Rossi Anna', solo_diurni: true, solo_notti: false, giorni_lavoro: null };
const storico = [
  { id: 1, collaboratore_id: 7, campo: 'giorni_lavoro', valore: '5,6', valore_prima: '', valido_dal: '2026-09-10' },
  { id: 2, collaboratore_id: 7, campo: 'giorni_lavoro', valore: '', valore_prima: '5,6', valido_dal: '2026-10-20' },
  { id: 3, collaboratore_id: 7, campo: 'solo_diurni', valore: 'true', valore_prima: 'false', valido_dal: '2026-11-01' },
  // un altra persona: non conta per Anna
  { id: 4, collaboratore_id: 8, campo: 'solo_diurni', valore: 'false', valore_prima: 'true', valido_dal: '2026-08-01' },
];
ok(S.sceltaValidaIl(anna, 'solo_diurni', '2026-08-15', storico) === false, 'agosto: solo diurni non ancora messo');
ok(S.sceltaValidaIl(anna, 'solo_diurni', '2026-10-31', storico) === false, 'il giorno prima: ancora no');
ok(S.sceltaValidaIl(anna, 'solo_diurni', '2026-11-01', storico) === true, 'dal giorno del cambio: si');
ok(S.sceltaValidaIl(anna, 'solo_diurni', '2027-02-01', storico) === true, 'dopo: la colonna di oggi');
ok(S.sceltaValidaIl(anna, 'giorni_lavoro', '2026-09-01', storico) === null, 'giorni: prima del primo cambio nessuno');
ok(S.sceltaValidaIl(anna, 'giorni_lavoro', '2026-09-30', storico) === '5,6', 'giorni: valore del tratto di mezzo');
ok(S.sceltaValidaIl(anna, 'giorni_lavoro', '2026-10-20', storico) === null, 'giorni: tolti il 20.10');
ok(S.sceltaValidaIl(anna, 'solo_notti', '2026-01-01', storico) === false, 'senza cambi: vale la colonna di oggi');
// la colonna di oggi prevale dall ultimo cambio in poi, anche se lo storico dicesse altro
const diversa = Object.assign({}, anna, { solo_diurni: false });
ok(S.sceltaValidaIl(diversa, 'solo_diurni', '2026-12-01', storico) === false, 'dall ultimo cambio: colonna di oggi');
const gs = [
  { id: 9, collaboratore_id: 3, campo: 'giorni_settimana', valore: '3', valore_prima: '', valido_dal: '2026-10-05' },
];
ok(
  S.sceltaValidaIl({ id: 3, giorni_settimana: 3 }, 'giorni_settimana', '2026-10-04', gs) === null,
  'numero: prima vuoto',
);
ok(
  S.sceltaValidaIl({ id: 3, giorni_settimana: 3 }, 'giorni_settimana', '2026-10-05', gs) === 3,
  'numero: dal cambio 3',
);
ok(S.sceltaValidaIl(null, 'solo_diurni', '2026-10-05', gs) === false, 'persona mancante: nessuna scelta');

console.log('\n== infoIl e segmenti ==');
const agosto = S.infoIl(anna, '2026-08-10', storico);
ok(
  agosto.solo_diurni === false && agosto.nome === 'Rossi Anna' && agosto !== anna,
  'riga di agosto, altre colonne uguali',
);
const senza = { id: 99, nome: 'Bianchi Luca', solo_notti: true };
ok(S.infoIl(senza, '2026-08-10', storico) === senza, 'senza storico: la riga stessa (nessuna copia)');
let seg = S.segmenti(anna, '2026-08-01', '2026-12-31', storico);
ok(seg.length === 4, 'quattro tratti: prima, giorni 5,6, senza, solo diurni');
ok(seg[0].da === '2026-08-01' && seg[0].a === '2026-09-09' && seg[1].da === '2026-09-10', 'tratti: date giuste');
ok(seg[3].da === '2026-11-01' && seg[3].a === '2026-12-31' && seg[3].info.solo_diurni === true, 'ultimo tratto');
seg = S.segmenti(anna, '2026-08-01', '2026-08-31', storico);
ok(seg.length === 1 && seg[0].info.solo_diurni === false, 'agosto intero: un tratto con le scelte di agosto');
// messa e tolta: tratti con le stesse scelte uniti
const mt = [
  { id: 1, collaboratore_id: 5, campo: 'solo_notti', valore: 'true', valore_prima: 'false', valido_dal: '2026-05-10' },
  { id: 2, collaboratore_id: 5, campo: 'solo_notti', valore: 'false', valore_prima: 'true', valido_dal: '2026-05-10' },
];
seg = S.segmenti({ id: 5, solo_notti: false }, '2026-05-01', '2026-05-31', mt);
ok(seg.length === 1 && seg[0].info.solo_notti === false, 'messa e tolta lo stesso giorno: nessun cambio');
ok(S.validaDal(anna, 'solo_diurni', storico).dal === '2026-11-01', 'validaDal: attiva dal 01.11');
ok(S.validaDal(senza, 'solo_notti', storico).dal === null, 'validaDal: da sempre');
ok(
  S.validaDal({ id: 5, solo_notti: false }, 'solo_notti', mt).dal === null,
  'validaDal: messa e tolta lo stesso giorno, nessun cambio',
);

console.log('\n== Benessere: ogni tratto con le scelte di allora ==');
// notti in agosto, "solo diurni" dal 01.11: le notti di agosto non sono un anomalia
function giorni(da, n, sigla) {
  const out = [];
  const d0 = new Date(da + 'T12:00:00');
  for (let i = 0; i < n; i++) {
    const d = new Date(d0);
    d.setDate(d0.getDate() + i);
    const iso =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const base = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 3600000;
    const s = typeof sigla === 'function' ? sigla(iso, i) : sigla;
    const g = { data: iso, dow: d.getDay(), stato: 'riposo' };
    if (s === 'N' || s === 'G') {
      g.stato = 'lavoro';
      g.int = s === 'N' ? { ini: base + 20, fin: base + 29 } : { ini: base + 11, fin: base + 19 };
      g.notte = s === 'N';
    }
    if (g.dow === 0) g.domenica = g.stato === 'lavoro' ? 'lavoro' : 'libera';
    out.push(g);
  }
  return out;
}
// ritmo: 2 lavoro, 2 riposo (notti fino al 31.10, poi giorno)
const ritmo = (iso, i) => (i % 4 < 2 ? (iso < '2026-11-01' ? 'N' : 'G') : '.');
const ritmoNotti = (iso, i) => (i % 4 < 2 ? 'N' : '.');
const g1 = giorni('2026-07-18', 180, ritmo);
const colleghi = ['Verdi Paolo', 'Neri Sara', 'Gialli Marco'].map((n, k) => ({
  nome: n,
  info: { id: 20 + k, funzione: 'CR' },
  giorni: giorni('2026-07-18', 180, ritmoNotti),
}));
const persona = (info, tratti) =>
  [{ nome: 'Rossi Anna', info: info, giorni: g1, tratti: tratti }].concat(colleghi.map((x) => Object.assign({}, x)));
const ANNA = { id: 7, nome: 'Rossi Anna', funzione: 'CR', solo_diurni: true };
const storicoAnna = [
  { id: 3, collaboratore_id: 7, campo: 'solo_diurni', valore: 'true', valore_prima: 'false', valido_dal: '2026-11-01' },
];
const calcola = (da, a, conTratti) =>
  B.valutaSettore(persona(ANNA, conTratti ? S.segmenti(ANNA, da, a, storicoAnna) : null), {
    da: da,
    a: a,
    oggi: '2026-12-31',
  }).find((x) => x.nome === 'Rossi Anna');
const voce = (r, k) => r.res.voci.find((v) => v.chiave === k) || { livello: '-', testo: '' };
// prima (scelta di oggi su agosto): notti "malgrado la scelta solo diurni"
let r = calcola('2026-08-01', '2026-08-31', false);
ok(voce(r, 'notti').livello === 'attenzione' && /malgrado/.test(voce(r, 'notti').testo), 'senza storico: anomalia');
r = calcola('2026-08-01', '2026-08-31', true);
ok(
  voce(r, 'notti').livello !== 'attenzione' && !/malgrado/.test(voce(r, 'notti').testo),
  'con storico: agosto normale',
);
ok(r.p.soloDiurni === false && r.res.scelte.indexOf('solo diurni') < 0, 'profilo di agosto: nessuna scelta');
r = calcola('2026-11-01', '2026-11-30', true);
ok(r.p.soloDiurni === true && voce(r, 'notti').livello === 'ok', 'novembre: solo diurni rispettato');
// periodo a cavallo: due tratti, le notti di ottobre non sono un anomalia
r = calcola('2026-10-01', '2026-11-30', true);
ok(r.tratti.length === 2, 'ottobre-novembre: due tratti');
ok(!/malgrado/.test(voce(r, 'notti').testo), 'a cavallo: nessuna anomalia per le notti di ottobre');
ok(
  r.res.scelte.some((s) => /solo diurni \(1\.11/.test(s)),
  'scelte con il tratto: solo diurni (1.11–30.11)',
);
// notte vera dopo il cambio: anomalia nel tratto giusto
const g2 = g1.map((g) =>
  g.data === '2026-11-10' ? Object.assign({}, g, { stato: 'lavoro', notte: true, int: { ini: 0, fin: 1 } }) : g,
);
const conNotte = B.valutaSettore(
  [
    { nome: 'Rossi Anna', info: ANNA, giorni: g2, tratti: S.segmenti(ANNA, '2026-10-01', '2026-11-30', storicoAnna) },
  ].concat(colleghi),
  { da: '2026-10-01', a: '2026-11-30', oggi: '2026-12-31' },
).find((x) => x.nome === 'Rossi Anna');
ok(
  voce(conNotte, 'notti').livello === 'attenzione' && /^1\.11–30\.11: .*malgrado/.test(voce(conNotte, 'notti').testo),
  'notte dopo il cambio: anomalia con le date del tratto',
);

console.log('\n== agganci nel programma ==');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
ok(/pianoScelteSegmenti\(c, da, a\)/.test(leggi('js/piano-benessere.js')), 'Benessere legge i tratti');
ok(
  /pianoInfoIl\(r\.collaboratore, r\.data\)/.test(leggi('js/piano-genera.js')),
  'Controlla le regole: scelte del giorno',
);
ok(/_pianoMaxGiorniSett\(nome, dstrDi/.test(leggi('js/piano-genera.js')), 'giorni a settimana: scelta della settimana');
ok(/pianoSceltaNota\(c, 'solo_diurni'\)/.test(leggi('js/piano-impostazioni.js')), 'Preferenze: nota attiva dal');
ok(/pianoScelteCambiate\(\)/.test(leggi('js/realtime.js')), 'salvataggio di una scelta: storico riletto');
ok(/js\/piano-scelte\.js/.test(leggi('index.html')) && /piano-scelte\.js/.test(leggi('sw.js')), 'file caricato');

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
