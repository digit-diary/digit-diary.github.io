// Livelli di Formazione: livello EFFETTIVO (gradino piu alto certificato, vale per il Piano)
// e livello COMPLETO (tutti i gradini sotto certificati, vale per incentivi e passaggi di
// livello), calcolati da PianoRegole.livelloScala (js/piano-regole.js); etichetta unica
// "L3 · Cassa · parziale" di js/formazione.js. Nessun nome di settore o gradino nel codice:
// le prove usano due scale diverse (Slots a 6 gradini, Tavoli a 7).
// Come si lancia: node test/livelli.test.js
const fs = require('fs');
const path = require('path');
const R = require('../js/piano-regole.js');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  const a = JSON.stringify(r);
  const b = JSON.stringify(atteso);
  if (a === b) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + b + '\n  ottenuto ' + a);
  }
};
const scala = (arr) => arr.map(([key, label, livello]) => ({ key, label, livello }));
const SLOTS = scala([
  ['sala', 'Sala Slot', 1],
  ['reception', 'Reception', 2],
  ['cassa', 'Cassa', 3],
  ['accoglienza', 'Accoglienza', 4],
  ['bo', 'Back Office (BO)', 5],
  ['sup', 'Supervisor (SUP)', 6],
  ['poker', 'Poker', 0], // specialita: non conta per il livello
]);
const TAVOLI = scala([
  ['cr_1', 'CR 1', 1],
  ['cr_2', 'CR 2', 2],
  ['isp_1', 'ISP 1', 3],
  ['isp_2', 'ISP 2', 4],
  ['isp_3', 'ISP 3', 5],
  ['di', 'DI', 6],
  ['sup', 'SUP', 7],
]);
const si = (...k) => Object.fromEntries(k.map((x) => [x, true]));
const riassunto = (s) =>
  s && { eff: s.effettivo, compl: s.completo, parz: s.parziale, manca: s.mancanti.map((k) => k.label) };

// ---- calcolo (PianoRegole.livelloScala)
eq(R.livelloScala([], si('sala')), null, 'settore senza scala: null');
eq(R.livelloScala(scala([['poker', 'Poker', 0]]), si('poker')), null, 'solo specialita: nessuna scala');
eq(riassunto(R.livelloScala(SLOTS, {})), { eff: 0, compl: 0, parz: false, manca: [] }, 'nessuna spunta');
eq(riassunto(R.livelloScala(SLOTS, si('poker'))), { eff: 0, compl: 0, parz: false, manca: [] }, 'solo specialita');
eq(
  riassunto(R.livelloScala(SLOTS, si('cassa'))),
  { eff: 3, compl: 0, parz: true, manca: ['Sala Slot', 'Reception'] },
  'Slots: solo Cassa = L3 parziale per il Piano, completo 0 (da un altro casino)',
);
eq(
  riassunto(R.livelloScala(SLOTS, si('sala', 'reception', 'cassa'))),
  { eff: 3, compl: 3, parz: false, manca: [] },
  'Slots: scala piena fino a Cassa',
);
eq(
  riassunto(R.livelloScala(SLOTS, si('sala', 'cassa', 'accoglienza', 'bo'))),
  { eff: 5, compl: 1, parz: true, manca: ['Reception'] },
  'Slots: manca un gradino in mezzo',
);
eq(
  riassunto(R.livelloScala(TAVOLI, si('cr_1', 'isp_1'))),
  { eff: 3, compl: 1, parz: true, manca: ['CR 2'] },
  'Tavoli: ISP 1 senza CR 2 = L3 parziale',
);
eq(
  riassunto(R.livelloScala(TAVOLI, si('cr_1', 'cr_2', 'isp_1', 'isp_2', 'isp_3', 'di', 'sup'))),
  { eff: 7, compl: 7, parz: false, manca: [] },
  'Tavoli: scala intera',
);
// gradino con due competenze: averne una sola e parziale allo stesso gradino
const DOPPIO = scala([
  ['a', 'A', 1],
  ['b', 'B', 2],
  ['c', 'C', 2],
]);
eq(riassunto(R.livelloScala(DOPPIO, si('a', 'b'))), { eff: 2, compl: 1, parz: true, manca: ['C'] }, 'gradino doppio');
// gradini non contigui (L1, L2, L4): chi li ha tutti e completo a L4
const BUCO = scala([
  ['a', 'A', 1],
  ['b', 'B', 2],
  ['d', 'D', 4],
]);
eq(riassunto(R.livelloScala(BUCO, si('a', 'b', 'd'))), { eff: 4, compl: 4, parz: false, manca: [] }, 'gradini 1,2,4');
eq(
  R.livelloScala(SLOTS, si('cassa')).comprese.map((k) => k.label + (k.certificata ? '' : '?')),
  ['Sala Slot?', 'Reception?', 'Cassa'],
  'competenze comprese con quelle mancanti',
);
// le regole del Piano (turni per livello) leggono il livello effettivo
const RL = [{ tipo_regola: 'livello_turni', valore: '10:L3' }];
const t10 = { codice: '10', gruppo: 'CASSA' };
eq(
  R.violazioneFunzioneTurno({ _livello: R.livelloScala(SLOTS, si('cassa')).effettivo }, t10, 2, RL),
  null,
  'solo Cassa: ammesso al turno "dal livello L3"',
);

// ---- etichetta unica (js/formazione.js): "L3 · Cassa · parziale"
const form = leggi('formazione.js');
const escP = new Function(pezzo(leggi('utils.js'), 'function escP(') + '; return escP;')();
const cfg = { slots: SLOTS, tavoli: TAVOLI };
const F = new Function(
  'escP',
  'PianoRegole',
  'getCompetenzeConfigAll',
  'window',
  'let currentReparto = "slots";' +
    [
      'function _lvNomeManuale(',
      'function _lvCompetenzeDi(',
      'function _lvNomeAutomatico(',
      'function livelloNome(',
      'function _escAttr(',
      'function _lvMaxReale(',
      'function _lvTono(',
      'function _lvSigla(',
      'function _lvBadge(',
      'function livelloScalaDi(',
      'function livelloDiCollaboratore(',
      'function livelloEffettivoDi(',
      'function livelloEtichettaHtml(',
      'function livelloEtichettaTesto(',
    ]
      .map((n) => pezzo(form, n))
      .join('\n') +
    '; return { livelloEtichettaHtml, livelloEtichettaTesto, livelloDiCollaboratore, livelloEffettivoDi };',
)(escP, R, () => cfg, {});
const c = (...k) => ({ competenze: si(...k) });
eq(F.livelloEtichettaTesto(c('cassa')), 'L3 · Cassa · parziale (manca Sala Slot, Reception)', 'testo parziale');
eq(F.livelloEtichettaTesto(c('sala', 'reception', 'cassa')), 'L3 · Cassa', 'testo completo');
eq(F.livelloEtichettaTesto(c()), 'Senza livello', 'testo senza livello');
eq(F.livelloEtichettaTesto(c('isp_1', 'cr_1'), 'tavoli'), 'L3 · ISP 1 · parziale (manca CR 2)', 'testo Tavoli');
eq(F.livelloEtichettaTesto(c('cr_1'), 'cleaning'), '-', 'settore senza scala: trattino');
eq(F.livelloDiCollaboratore(c('cassa')), 0, 'incentivi: livello completo 0 con solo Cassa');
eq(F.livelloEffettivoDi(c('cassa')), 3, 'Piano: livello effettivo 3 con solo Cassa');
const h = F.livelloEtichettaHtml(c('cassa'));
eq(/>L3 · Cassa<\/span>/.test(h), true, 'badge "L3 · Cassa"');
eq(/parziale — manca Sala Slot, Reception<\/span>/.test(h), true, 'testo "manca" visibile');
eq(/Comprende: Sala Slot \(manca\), Reception \(manca\), Cassa/.test(h), true, 'title con le competenze comprese');
const hc = F.livelloEtichettaHtml(c('cassa'), { compatto: true });
eq(/>parziale<\/span>/.test(hc) && /title="Manca Sala Slot, Reception/.test(hc), true, 'compatto: "manca" nel title');
eq(/parziale/.test(F.livelloEtichettaHtml(c('sala', 'reception', 'cassa'))), false, 'scala piena: niente parziale');
eq(/Senza livello/.test(F.livelloEtichettaHtml(c('poker'))), true, 'solo specialita: Senza livello');
eq(F.livelloEtichettaHtml(c('cr_1'), { rep: 'cleaning' }), '', 'settore senza scala: niente');

// ---- domanda sui gradini sotto (decisione del titolare: chiedere ogni volta)
let chiesto = null;
const G = new Function(
  'chiediScelta',
  ['function _fzElencoNomi(', 'function _fzTestoGradiniSotto(', 'function _fzChiediGradiniSotto(']
    .map((n) => pezzo(form, n))
    .join('\n') + '; return { _fzElencoNomi, _fzChiediGradiniSotto };',
)((testo, scelte, opz) => {
  chiesto = { testo, scelte, opz };
  return Promise.resolve('no');
});
eq(G._fzElencoNomi(['Sala Slot', 'Reception']), 'Sala Slot e Reception', 'elenco di due nomi');
eq(G._fzElencoNomi(['CR 1', 'CR 2', 'ISP 1']), 'CR 1, CR 2 e ISP 1', 'elenco di tre nomi');
eq(G._fzElencoNomi(['CR 2']), 'CR 2', 'un solo nome');
G._fzChiediGradiniSotto('Rossi Mario', 'Cassa', ['Sala Slot', 'Reception']).then((r) => {
  eq(r, 'no', 'la risposta della finestra passa invariata');
  eq(chiesto.testo.split('\n')[0], 'Spunto anche Sala Slot e Reception?', 'domanda con i nomi della scala');
  eq(
    chiesto.scelte.map((x) => x.valore + ':' + x.etichetta),
    ['si:Sì, formazione completa', 'no:No, solo Cassa (esperienza già fatta)'],
    'due risposte, Sì per prima',
  );
  G._fzChiediGradiniSotto('Bianchi Anna', 'ISP 1', ['CR 2']);
  eq(chiesto.testo.split('\n')[0], 'Spunto anche CR 2?', 'Tavoli: un gradino mancante');
  fine();
});
function fine() {
  console.log('\n=======================================');
  console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
  console.log('=======================================\n');
  process.exit(falliti ? 1 : 0);
}
