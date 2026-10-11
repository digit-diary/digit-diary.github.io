/**
 * Test di logica pura (senza browser e senza database):
 *  - promemoriaDataAvviso (js/promemoria.js): giorno dell avviso di un promemoria,
 *    usato sia dalla Home ("Da fare oggi/domani") sia dalla pagina Promemoria
 *  - _rappUnisciTre (js/rapporto.js): salvataggio del rapporto giornaliero da due PC
 *  - esc (js/utils.js): anche l apostrofo
 *   node test/promemoria-rapporto.test.js
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

// estrae una funzione globale dal file sorgente (le pagine non sono moduli)
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
vm.runInContext(estrai('utils.js', 'esc'), ctx);
vm.runInContext(estrai('promemoria.js', 'promemoriaDataAvviso'), ctx);
vm.runInContext(estrai('rapporto.js', '_rappValore'), ctx);
vm.runInContext(estrai('rapporto.js', '_rappUnisciTre'), ctx);

console.log('Promemoria: giorno dell avviso');
const pa = (descr, scad) => ctx.promemoriaDataAvviso({ descrizione: descr, data_scadenza: scad || '2026-12-10' });
eq(pa('Prova\nPromemoria: 1 giorno prima alle 08:00'), '2026-12-09', 'scrittura nuova "1 giorno prima"');
eq(pa('Prova\nPromemoria: 3 giorni prima alle 10:00'), '2026-12-07', 'scrittura nuova "3 giorni prima"');
eq(pa('Promemoria: 7 giorni prima alle 08:00', '2027-01-03'), '2026-12-27', '"7 giorni prima" a cavallo dell anno');
eq(pa('Promemoria: 3 giorno/i prima alle 08:00'), '2026-12-07', 'vecchia scrittura "giorno/i prima"');
eq(pa('Promemoria: il giorno stesso alle 08:00'), '2026-12-10', '"il giorno stesso" = scadenza');
eq(pa(''), '2026-12-10', 'senza indicazione = scadenza');
eq(pa('Promemoria: 1 giorno prima alle 08:00', '2027-03-29'), '2027-03-28', 'cambio ora legale (fine marzo)');
eq(pa('Promemoria: 1 giorno prima alle 08:00', '2026-10-26'), '2026-10-25', 'cambio ora solare (fine ottobre)');
eq(ctx.promemoriaDataAvviso({ descrizione: null, data_scadenza: '2026-12-10' }), '2026-12-10', 'descrizione vuota');

console.log('Rapporto: unione a tre (due PC)');
const campi = [
  { key: 'sup_note', label: 'Note supervisore', type: 'text' },
  { key: 'cassa_note', label: 'Note cassa', type: 'text' },
  { key: 'n_assegni', label: 'Assegni', type: 'number' },
];
const u = (b, m, s) => JSON.parse(JSON.stringify(ctx._rappUnisciTre(campi, b, m, s)));
const base = { sup_note: '', cassa_note: '', n_assegni: 0 };
// A scrive sup_note, B (che aveva caricato il modulo vuoto) scrive cassa_note e salva dopo
let r = u(
  base,
  { sup_note: '', cassa_note: 'cassa B', n_assegni: 0 },
  { sup_note: 'testo A', cassa_note: '', n_assegni: 0 },
);
eq(r.valori, { sup_note: 'testo A', cassa_note: 'cassa B', n_assegni: 0 }, 'campi diversi: restano entrambi');
eq(r.conflitti, [], 'campi diversi: nessun avviso');
r = u(base, { sup_note: 'mio', cassa_note: '', n_assegni: 0 }, null || {});
eq(r.valori.sup_note, 'mio', 'riga nuova: valgono i miei');
r = u(
  { sup_note: 'Inizio.', cassa_note: '', n_assegni: 2 },
  { sup_note: 'Inizio. B', cassa_note: '', n_assegni: 5 },
  {
    sup_note: 'Inizio. A',
    cassa_note: '',
    n_assegni: 3,
  },
);
eq(r.valori.sup_note, 'Inizio. A B', 'stesso campo su entrambi: aggiunte unite');
eq(r.valori.n_assegni, 5, 'numero cambiato su entrambi: il mio');
eq(r.conflitti, ['Note supervisore', 'Assegni'], 'stesso campo su entrambi: avviso');
r = u({ sup_note: 'vecchio' }, { sup_note: 'nuovo B' }, { sup_note: 'nuovo A', cassa_note: 'x', n_assegni: 1 });
eq(
  r.valori,
  { sup_note: 'nuovo A\nnuovo B', cassa_note: 'x', n_assegni: 1 },
  'riscritti entrambi: testi uniti, campi fuori modulo dal DB',
);
r = u(base, { sup_note: 'uguale', cassa_note: '', n_assegni: 0 }, { sup_note: 'uguale', cassa_note: '', n_assegni: 0 });
eq(r.conflitti, [], 'stesso testo su entrambi: nessun avviso');

console.log('esc: apostrofo');
eq(
  ctx.esc('D\'Amico <b>"x"</b>\n'),
  'D&#39;Amico &lt;b&gt;&quot;x&quot;&lt;/b&gt;<br>',
  'esc converte anche l apostrofo',
);

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
