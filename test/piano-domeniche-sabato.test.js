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
const sospesiDi = {}; // nome -> mesi 'MM' con le domeniche non conteggiate (preferenze)
ctx._pianoDomMesiSospesi = (n) => sospesiDi[n] || [];
vm.createContext(ctx);
vm.runInContext(
  estrai('piano-genera.js', [
    '_pianoTestoSabatoTardi',
    '_pianoDomContratto',
    '_pianoDomAttese',
    '_pianoDomDirittoDi',
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

console.log('== domeniche non conteggiate per le preferenze (titolare 23/10/2026) ==');
{
  const R = require('../js/piano-regole.js');
  const notte = [
    { codice: 'R8', tardi: true },
    { codice: 'R23', tardi: true },
  ];
  const vs = { giorni_lavoro: '5,6', solo_notti: true };
  const s1 = R.domenicheSospese(vs, notte);
  ok(s1 && s1.motivo === 'lavora solo ven e sab sera', 'solo ven e sab sera: domeniche non conteggiate');
  ok(
    R.domenicheSospeseNota(s1.motivo) === 'Domeniche non conteggiate: lavora solo ven e sab sera (preferenze)',
    'testo della nota grigia',
  );
  ok(
    R.domenicheSospese(vs, notte.concat([{ codice: 'R22', tardi: false }])) === null,
    'un turno del sabato entro le 23: si conta',
  );
  ok(
    R.domenicheSospese({ giorni_lavoro: '5,6,0', solo_notti: true }, notte) === null,
    'lavora anche la domenica: si conta (puo lasciarla libera)',
  );
  ok(R.domenicheSospese({ giorni_lavoro: '1,2,3,4,5', solo_notti: true }, notte) === null, 'senza sabato: si conta');
  ok(
    R.domenicheSospese({ giorni_lavoro: '4,5,6', giorni_settimana: 2 }, notte) === null,
    'G V S e 2 a settimana: il sabato si puo lasciare libero',
  );
  ok(
    R.domenicheSospese({ giorni_lavoro: '1,2,3,4,5,6', solo_notti: true }, notte) === null,
    'sei giorni: i riposi possono cadere di sabato',
  );
  ok(R.domenicheSospese({ solo_notti: true }, notte) === null, 'senza giorni di lavoro: si conta');
  ok(R.domenicheSospese(vs, []) === null, 'nessun turno possibile il sabato (dati incompleti): si conta');
  const s2 = R.domenicheSospese({ giorni_lavoro: '2,3,4,5,6' }, notte);
  ok(s2 && /mar, mer, gio, ven e sab, il sabato sempre/.test(s2.motivo), 'mar-sab con turni tardi: non conteggiate');
  const c = R.domenicheContratto(2026, '2026-05-01', null, 12, ['10', '11', '12']);
  ok(c.diritto === 5 && c.attese('12') === 5 && c.attese('09') === 5, 'mesi esclusi fuori dal diritto: mag-set = 5');
  ok(R.domenicheContratto(2026, null, null, 12, ['01', '02']).diritto === 10, 'senza inizio, 2 mesi esclusi: 10');
  // ORE MINIME RAGGIUNGIBILI con le preferenze
  const sett = (k, lav, cap) => ({ sett: 'S' + k, fisse: 0, lavoro: lav, cap: cap || 0 });
  // 4 settimane, solo ven e sab (9 ore): 8 turni = 72 h
  const vsGiorni = [];
  for (let k = 0; k < 4; k++) for (let d = 0; d < 7; d++) vsGiorni.push(sett(k, d === 4 || d === 5 ? 9 : 0));
  ok(R.oreRaggiungibili(vsGiorni) === 72, 'solo ven e sab, 4 settimane: 72 h');
  ok(
    R.oreRaggiungibili(vsGiorni.concat([{ sett: 'S0', fisse: 8.4, lavoro: 0 }])) === 80.4,
    'vacanza: le sue ore contano',
  );
  const cap2 = [sett(0, 9, 2), sett(0, 8, 2), sett(0, 7, 2)];
  ok(R.oreRaggiungibili(cap2) === 17, '2 giorni a settimana: i due turni piu lunghi');
  ok(
    R.oreMinimoNota('solo ven e sab', 96) ===
      'Ore sotto il minimo per le preferenze (solo ven e sab): massimo raggiungibile 96 h',
    'testo della nota delle ore',
  );
}
{
  // _pianoDomAttese con i mesi non conteggiati: niente arretrato dai mesi sospesi
  schede['Prova Sospesa'] = { data_assunzione: '2026-05-01' };
  sospesiDi['Prova Sospesa'] = ['07', '08', '09', '10', '11', '12'];
  const dm = {};
  for (let m = 1; m <= 12; m++) dm[String(m).padStart(2, '0')] = 4;
  const dati = {
    perNome: { 'Prova Sospesa': { libere: 2, mesi: ['05', '06', '07', '08', '09'] } },
    domMese: dm,
    domAnno: 52,
  };
  const c = ctx._pianoDomAttese('Prova Sospesa', '2026-10', dati);
  ok(
    c.diritto === 2 && c.arretrato === 0 && c.attese === 2,
    'mesi sospesi lug-dic: diritto 2 (mag, giu), nessun arretrato',
  );
  ok(c.sospesi.length === 6, 'mesi sospesi riportati');
}

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
