/**
 * Sabato oltre le 23 per chi e indietro con le domeniche e limiti a testa di una funzione
 * (decisioni del titolare 15/10/2026), senza browser e senza database:
 *  - _pianoTestoSabatoTardi (js/piano-genera.js): il testo dell avviso;
 *  - _pianoDomAttese: le domeniche dell anno nei mesi dopo (restanti) per sapere se a fine anno
 *    si recupera ancora;
 *  - _ricercaTipoViolazione (js/piano-ricerca-ui.js): l avviso del sabato e i limiti di una
 *    funzione hanno un tipo proprio (peso e vincolo di Migliora), non sono legge.
 *   node test/piano-domeniche-sabato.test.js
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
const ctx = { console, Date, Set, Map, JSON, Math, String, parseInt, parseFloat, Object };
ctx._pianoRegolaVal = (n) => (n === 'domeniche_libere_anno' ? '12' : null);
ctx._pianoDomSabatoParam = () => ({ evita: true, copertura: true });
vm.createContext(ctx);
vm.runInContext(
  estrai('piano-genera.js', ['_pianoTestoSabatoTardi', '_pianoDomAttese', '_pianoViolDiLegge']) +
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

console.log('== testo dell avviso ==');
const t = ctx._pianoTestoSabatoTardi('2026-11-21', '2026-11-22', '02:00', 3, 5, 2);
ok(t === 'lavora sab 21 fino alle 02:00: perde la domenica 22 (domeniche valide 3 su 5, arretrato 2)', 'avviso: ' + t);
const t2 = ctx._pianoTestoSabatoTardi('2026-10-31', '2026-11-01', '04:10', 0, 5, 1);
ok(/^lavora sab 31\.10 fino alle 04:10: perde la domenica 1 /.test(t2), 'sabato del mese prima: ' + t2);
ok(!ctx._pianoViolDiLegge(t), 'non e una regola di legge (Controlla le regole: da controllare)');

console.log('== domeniche restanti dell anno ==');
const dati = {
  perNome: { A: { libere: 6, mesi: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] } },
  domMese: { '01': 4, '02': 4, '03': 5, '04': 4, '05': 5, '06': 4, '07': 4, '08': 5, '09': 4, 10: 4, 11: 5, 12: 4 },
  domAnno: 52,
};
const c = ctx._pianoDomAttese('A', '2026-11', dati);
ok(c.restanti === 4, 'novembre: restano le 4 domeniche di dicembre (' + c.restanti + ')');
ok(c.arretrato > 0, 'arretrato dei mesi passati (' + c.arretrato + ')');
ok(ctx._pianoDomAttese('A', '2026-12', dati).restanti === 0, 'dicembre: nessuna domenica dopo');

console.log('== tipi per Migliora ==');
ok(ctx._ricercaTipoViolazione(t) === 'sabato_tardi', 'avviso del sabato: tipo sabato_tardi');
ok(
  ctx._ricercaTipoViolazione('4 turni nel gruppo BO nel mese (max 1 a testa per SUP)') === 'limite_gruppo',
  'limite a testa nel mese: tipo limite_gruppo',
);
ok(
  ctx._ricercaTipoViolazione('più di 1 SUP nel gruppo BO lo stesso giorno') === 'limite_gruppo',
  'limite al giorno: tipo limite_gruppo',
);
ok(
  ctx._ricercaTipoViolazione('0 turni nel gruppo BO nel mese (minimo 1 a testa per SUP)') === 'regola',
  'minimo a testa: regola (non vincolo)',
);
ok(
  ctx._ricercaTipoViolazione(
    'domenica libera: 7 nell anno su 9 attese fino a questo mese (minimo 12 all anno): da recuperare',
  ) === 'legge_dom',
  'domenica libera mancante: resta legge',
);

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
