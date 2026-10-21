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
const ctx = {
  console,
  Date,
  Set,
  Map,
  JSON,
  Math,
  String,
  parseInt,
  parseFloat,
  Object,
  PIANO_BLOCCHI_PESO_PREFERITO: 0.25,
  PIANO_BLOCCHI_PESO_ISOLATO: 2.5,
};
ctx._pianoRegolaVal = (n) => (n === 'domeniche_libere_anno' ? '12' : null);
ctx._pianoDomSabatoParam = () => ({ evita: true, copertura: true });
ctx.PianoRegole = require('../js/piano-regole.js');
const schede = {}; // nome -> { data_assunzione, data_fine_rapporto }
ctx._pianoCollabInfo = (n) => schede[n] || null;
vm.createContext(ctx);
vm.runInContext(
  estrai('piano-genera.js', [
    '_pianoTestoSabatoTardi',
    '_pianoDomContratto',
    '_pianoDomAttese',
    '_pianoViolDiLegge',
    '_pianoPesoBuco',
  ]) +
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

console.log('== domeniche in base al contratto (titolare 21/10/2026) ==');
const PR = ctx.PianoRegole;
const dc = (ini, fin) => PR.domenicheContratto(2026, ini, fin, 12);
ok(dc('2026-08-01').diritto === 5, 'inizio 1.8: 5 domeniche (agosto-dicembre)');
ok(dc('2026-08-16').diritto === 5, 'inizio 16.8: 16 giorni su 31, agosto conta: 5');
ok(dc('2026-08-17').diritto === 4, 'inizio 17.8: 15 giorni su 31, meno di meta: 4');
ok(dc('2026-08-20').diritto === 4, 'inizio 20.8: 4');
ok(
  dc(null, '2026-03-15').diritto === 2 && dc(null, '2026-03-15').inizioMancante,
  'fine 15.3 senza inizio: 2, data mancante',
);
ok(dc('2020-01-01', '2026-03-16').diritto === 3, 'fine 16.3: marzo conta, 3');
ok(dc('2026-02-15', null).mesi[0] === '02', 'febbraio: 14 giorni su 28 bastano');
ok(dc('2026-08-16', '2026-11-10').diritto === 3, 'agosto-ottobre (novembre 10 giorni no): 3');
ok(dc('2025-03-01').diritto === 12 && dc('2027-01-01').diritto === 0, 'anno intero 12, contratto dopo: 0');
ok(dc('2026-08-16').attese('09') === 2 && dc('2026-08-16').attese('07') === 0, 'attese fino a settembre 2, luglio 0');
ok(PR.domenicheContratto(2026, '2026-07-01', null, 10).diritto === 5, 'regola a 10: 10 x 6 / 12 = 5');
// _pianoDomAttese con la data: assunto il 16.8, piano da agosto, 2 libere avute
schede.B = { data_assunzione: '2026-08-16' };
const datiB = { perNome: { B: { libere: 2, mesi: ['08', '09', '10'] } }, domMese: dati.domMese, domAnno: 52 };
const cB = ctx._pianoDomAttese('B', '2026-11', datiB);
ok(cB.diritto === 5 && cB.fineMese === 4 && cB.mesiContratto === 5, 'B: diritto 5, attese a fine novembre 4');
ok(cB.arretrato === 1, 'B: fino a ottobre 3 attese, 2 avute: arretrato 1 (' + cB.arretrato + ')');
ok(cB.restanti === 4, 'B: restano le domeniche di dicembre');
// senza data di inizio: il conto di prima (proporzione sulle domeniche dei mesi con piano)
const cA = ctx._pianoDomAttese('A', '2026-11', dati);
ok(cA.inizioMancante && cA.diritto === 12 && cA.fineMese === Math.floor((12 * 48) / 52), 'A senza data: come prima');
// fine del rapporto il 15.11 senza inizio: novembre non conta
schede.C = { data_fine_rapporto: '2026-11-14' };
const datiC = { perNome: { C: { libere: 10, mesi: dati.perNome.A.mesi } }, domMese: dati.domMese, domAnno: 52 };
const cC = ctx._pianoDomAttese('C', '2026-11', datiC);
ok(
  cC.fineMese === Math.floor((12 * 43) / 52) && cC.restanti === 0,
  'C: fine 14.11 (14 giorni su 30), novembre e dicembre fuori',
);
// un mese passato senza piano (es. lungo congedo) non conta anche con la data
schede.D = { data_assunzione: '2020-01-01' };
const datiD = {
  perNome: { D: { libere: 8, mesi: ['01', '02', '03', '06', '07', '08', '09', '10'] } },
  domMese: dati.domMese,
  domAnno: 52,
};
const cD = ctx._pianoDomAttese('D', '2026-11', datiD);
ok(cD.diritto === 10 && cD.fineMese === 9, 'D: aprile e maggio senza piano restano fuori (diritto 10)');

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

console.log('== peso dei buchi nei blocchi (16/10/2026) ==');
const pb = ctx._pianoPesoBuco;
ok(pb({ tipo: 'lavoro_isolato', lungo: 1 }) === 2.5, 'giorno isolato: 2,5 buchi (150)');
ok(pb({ tipo: 'lavoro_isolato', lungo: 2 }) === 0.5, 'due giorni soli: mezzo buco');
ok(
  60 * (pb({ tipo: 'lavoro_isolato', lungo: 1 }) + pb({ tipo: 'riposo_singolo', prima: 3, dopo: 1 })) > 300,
  '3-1-1 costa piu di un posto scoperto normale',
);
ok(pb({ tipo: 'riposo_singolo', prima: 4, dopo: 4 }) === 1, '4-1-4: un buco');
ok(pb({ tipo: 'fuori_preferito', lungo: 5 }) === 0.25, '5 invece di 4: un quarto');

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
