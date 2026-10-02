/**
 * Test automatici dell analisi dell organico (js/organico-modello.js).
 *
 * Come si lancia (senza browser ne server):
 *   node test/organico.test.js
 *
 * Esce con codice 0 se tutti i test passano, 1 se qualcuno fallisce.
 */
const O = require('../js/organico-modello.js');

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
const vicino = (a, b, tol, nome) =>
  ok(Math.abs(a - b) <= (tol == null ? 0.01 : tol), nome + '  (atteso ' + b + ', ottenuto ' + a + ')');

const ORE_GIORNO = 41 / 7;

console.log('== affidabilita (binomiale) ==');
vicino(O.binomCdf(0, 10, 0.1), 0.3487, 0.0001, 'P(nessuna assenza) su 10 persone al 10%');
vicino(O.binomCdf(2, 10, 0.1), 0.9298, 0.0001, 'P(al massimo 2 assenze)');
ok(O.riservaPerLivello(10, 0.1, 0.95) === 3, 'riserva per il 95% con 10 persone al 10% = 3');
ok(O.riservaPerLivello(20, 0.04, 0.95) === 2, 'riserva per il 95% con 20 persone al 4% = 2');
ok(O.riservaPerLivello(0, 0.1, 0.95) === 0, 'nessuno in turno: nessuna riserva');

console.log('== carico del mese ==');
const turni = {
  A: { durata: 8, tipo: 'DIURNO', gruppo: 'CASSA' },
  N: { durata: 9, tipo: 'NOTTURNO', gruppo: 'SALA' },
};
// novembre 2026: domenica 1, 8, 15...
const fabb = [
  { data: '2026-11-01', codice: 'A', quantita: 2 },
  { data: '2026-11-01', codice: 'N', quantita: 1 },
  { data: '2026-11-02', codice: 'A', quantita: 4 },
  { data: '2026-12-01', codice: 'A', quantita: 9 },
];
const c = O.caricoMese(2026, 11, fabb, turni);
vicino(c.ore, 2 * 8 + 9 + 4 * 8, 0, 'ore richieste: somma posti x durata, solo del mese');
ok(c.postiMax === 4, 'giorno di punta: 4 posti');
ok(c.postiDomMax === 3, 'domenica 1 novembre: 3 posti');
vicino(c.oreNotte, 9, 0, 'ore notturne');
ok(c.perGruppo.CASSA === 48 && c.perGruppo.SALA === 9, 'ore per gruppo');
const cLungo = O.caricoMese(2026, 11, fabb, turni, (cod, d) => (d === '2026-11-02' ? 10 : null));
vicino(cLungo.ore, 2 * 8 + 9 + 4 * 10, 0, 'durata del giorno (chiusura alle 5) usata quando c e');

console.log('== tassi storici ==');
const persone1 = [{ nome: 'Rossi', pct: 1, vacanzeAnno: 35 }];
const righeStoria = [];
for (let g = 1; g <= 30; g++)
  righeStoria.push({
    collaboratore: 'Rossi',
    data: '2026-04-' + String(g).padStart(2, '0'),
    codice: g <= 3 ? 'M' : 'A',
  });
const tS = O.tassiStorici(righeStoria, persone1, { oggi: '2026-10-01', pesoStorico: 0 });
vicino(tS.media.malattia, 3 / 30, 0.0001, 'tasso medio di malattia dai giorni passati');
vicino(tS.mesi[4].malattia, 3 / 30, 0.0001, 'aprile: tasso del mese (senza peso storico)');
const tS2 = O.tassiStorici(righeStoria, persone1, { oggi: '2026-10-01', pesoStorico: 30 });
vicino(tS2.mesi[5].malattia, 3 / 30, 0.0001, 'mese senza dati: vale la media');
const tFut = O.tassiStorici(righeStoria, persone1, { oggi: '2026-04-02', pesoStorico: 0 });
vicino(tFut.media.malattia, 1, 0.0001, 'solo i giorni gia passati (fino a oggi) contano');
const tCnp = O.tassiStorici(
  righeStoria.concat([{ collaboratore: 'Rossi', data: '2026-05-01', codice: 'CNP' }]),
  persone1,
  { oggi: '2026-10-01', pesoStorico: 0 },
);
ok(tCnp.giorniOsservati === 30, 'il congedo non pagato non e un giorno di servizio');

console.log('== offerta del mese ==');
const tassi0 = { media: { malattia: 0, impegni: 0 }, mesi: {} };
const o1 = O.offertaMese(2026, 11, persone1, {}, tassi0, { oggi: '2026-10-01' });
vicino(o1.contratto, 30 * ORE_GIORNO, 0.01, 'contratto: 30 giorni a tempo pieno');
vicino(o1.vacanze, (35 / 365) * 30 * ORE_GIORNO, 0.01, 'mese non pianificato: quota media delle vacanze');
vicino(o1.netto, o1.contratto - o1.vacanze, 0.01, 'netto = contratto - vacanze (nessuna malattia attesa)');
const rp = {};
for (let g = 2; g <= 8; g++) rp['Rossi|2026-11-0' + g] = 'V';
const o2 = O.offertaMese(2026, 11, persone1, rp, tassi0, { oggi: '2026-10-01' });
vicino(o2.vacanze, 7 * ORE_GIORNO, 0.01, 'vacanze gia nel piano: valgono quelle (7 giorni)');
const o3 = O.offertaMese(2026, 11, [{ nome: 'Bianchi', pct: 0.5 }], {}, tassi0, { oggi: '2026-10-01' });
vicino(o3.contratto, 15 * ORE_GIORNO, 0.01, 'tempo parziale 50%');
const o4 = O.offertaMese(2026, 11, [{ nome: 'Jolly', jolly: true, pct: 1 }], {}, tassi0, {
  oggi: '2026-10-01',
  jollyPct: 0.8,
});
vicino(o4.contratto, 30 * ORE_GIORNO * 0.8, 0.01, 'ausiliario: si pianifica sulla percentuale delle regole (80%)');
vicino(o4.vacanze, 0, 0, 'ausiliario: nessuna quota vacanze (pagate in percentuale)');
const o5 = O.offertaMese(2026, 11, [{ nome: 'Neri', pct: 1, assunzione: '2026-11-16' }], {}, tassi0, {
  oggi: '2026-10-01',
});
vicino(o5.contratto, 15 * ORE_GIORNO, 0.01, 'assunto il 16: conta da quel giorno');
const o6 = O.offertaMese(2026, 11, [{ nome: 'Verdi', pct: 1, fine: '2026-11-10' }], {}, tassi0, { oggi: '2026-10-01' });
vicino(o6.contratto, 10 * ORE_GIORNO, 0.01, 'fine contratto il 10: dopo non conta');
const o7 = O.offertaMese(2026, 11, [{ nome: 'Gialli', pct: 1, cnp: { 11: 5 } }], {}, tassi0, { oggi: '2026-10-01' });
vicino(o7.contratto, 25 * ORE_GIORNO, 0.01, 'congedo non pagato registrato: 5 giorni in meno');
const tassi10 = { media: { malattia: 0.1, impegni: 0 }, mesi: { 11: { malattia: 0.1, impegni: 0 } } };
const o8 = O.offertaMese(2026, 11, [{ nome: 'Blu', pct: 1 }], {}, tassi10, { oggi: '2026-10-01' });
vicino(o8.malattia, 30 * ORE_GIORNO * 0.1, 0.01, 'malattia attesa dal tasso del mese');
const rpPass = { 'Blu|2026-04-03': 'M', 'Blu|2026-04-04': 'M' };
const o9 = O.offertaMese(2026, 4, [{ nome: 'Blu', pct: 1 }], rpPass, tassi10, { oggi: '2026-10-01' });
vicino(o9.malattia, 2 * ORE_GIORNO, 0.01, 'mese passato: le malattie vere, non quelle attese');

console.log('== analisi, scenari e suggerimenti ==');
// settore di prova: 4 fissi, fabbisogno di 4 posti da 8 ore ogni giorno
const fabbAnno = [];
for (let m = 1; m <= 12; m++)
  for (let g = 1; g <= new Date(2026, m, 0).getDate(); g++)
    fabbAnno.push({
      data: '2026-' + String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0'),
      codice: 'A',
      quantita: m === 12 ? 5 : 4,
    });
const persone4 = [1, 2, 3, 4, 5].map((i) => ({ nome: 'P' + i, pct: 1, vacanzeAnno: 35 }));
const dati = { anno: 2026, fabbisogni: fabbAnno, turni: turni, persone: persone4, righe: [], festiviAnno: 0 };
const A = O.analizza(dati, { oggi: '2026-10-01' });
const nov = A.mesi[10];
vicino(nov.oreRichieste, 30 * 4 * 8, 0, 'novembre: 960 ore richieste');
ok(nov.differenzaOre < 0, 'novembre: 5 persone non bastano per 4 posti tutti i giorni (ferie comprese)');
ok(A.mesi[11].differenzaOre < nov.differenzaOre, 'dicembre (5 posti) e piu scoperto di novembre');
const B = O.analizza(dati, { oggi: '2026-10-01' }, { aggiunte: [{ jolly: false, pct: 1, dal: '2026-11-01' }] });
ok(B.mesi[10].oreNette > nov.oreNette, 'scenario: un fisso in piu aumenta le ore nette');
vicino(B.mesi[9].oreNette, A.mesi[9].oreNette, 0.001, 'scenario dal 1 novembre: ottobre non cambia');
const C = O.analizza(dati, { oggi: '2026-10-01' }, { percentuali: { P1: 0.5 } });
ok(C.mesi[10].oreNette < nov.oreNette, 'scenario: percentuale ridotta toglie ore');
const sug = O.suggerimenti(dati, { oggi: '2026-10-01' }, A);
const strutt = sug.find((s) => s.tipo === 'strutturale');
ok(!!strutt, 'carenza in tutti i mesi rimasti: suggerimento strutturale (fisso)');
ok(strutt && strutt.effetto.mesiSottoDopo < strutt.effetto.mesiSottoPrima, 'il suggerimento riduce i mesi sotto');
// solo dicembre sotto: suggerimento stagionale
const persone6 = persone4.concat([{ nome: 'P6', pct: 1, vacanzeAnno: 35 }]);
const datiS = Object.assign({}, dati, { persone: persone6 });
const AS = O.analizza(datiS, { oggi: '2026-10-01' });
ok(
  O.statoMese(AS.mesi[10]) !== 'sotto' && O.statoMese(AS.mesi[11]) === 'sotto',
  '6 persone: novembre in regola, dicembre sotto',
);
const sugS = O.suggerimenti(datiS, { oggi: '2026-10-01' }, AS);
const stag = sugS.find((s) => s.tipo === 'stagionale');
ok(!!stag && stag.mesi.join() === '12', 'solo dicembre sotto: suggerimento stagionale (ausiliario) per dicembre');
ok(!sugS.find((s) => s.tipo === 'strutturale'), 'nessun suggerimento strutturale se manca solo un mese');
ok(stag && stag.effetto.mesiSottoDopo === 0, 'con l ausiliario dicembre torna in regola');

console.log('== suggerimenti senza costi ==');
// novembre con molte vacanze gia nel piano, dicembre con margine
const persone7 = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ nome: 'Q' + i, pct: 1, vacanzeAnno: 35 }));
const fabbV = [];
for (let m = 10; m <= 12; m++)
  for (let g = 1; g <= new Date(2026, m, 0).getDate(); g++)
    fabbV.push({ data: '2026-' + m + '-' + String(g).padStart(2, '0'), codice: 'A', quantita: 4 });
const righeV = [];
['Q1', 'Q2', 'Q3'].forEach((n) => {
  for (let g = 2; g <= 22; g++)
    righeV.push({ collaboratore: n, data: '2026-11-' + String(g).padStart(2, '0'), codice: 'V' });
});
const datiV = { anno: 2026, fabbisogni: fabbV, turni: turni, persone: persone7, righe: righeV, festiviAnno: 0 };
const AV = O.analizza(datiV, { oggi: '2026-10-05' });
ok(
  O.statoMese(AV.mesi[10]) === 'sotto' && AV.mesi[11].differenzaOre > 0,
  'novembre sotto per le vacanze, dicembre con ore in piu',
);
const sugV = O.suggerimenti(datiV, { oggi: '2026-10-05' }, AV);
const sp = sugV.find((s) => s.tipo === 'vacanze');
ok(!!sp, 'suggerimento: spostare vacanze da novembre a dicembre');
ok(
  sp && sp.scenario.vacanzeSposta.every((v) => v.da === 11 && v.a === 12),
  'spostamento solo da novembre verso un mese con margine (non ottobre in corso)',
);
ok(sp && sp.effetto.oreCoperte > 0, 'spostando le vacanze una parte della carenza di novembre si copre');
const BV = O.analizza(datiV, { oggi: '2026-10-05' }, sp.scenario);
ok(BV.mesi[11].oreNette < AV.mesi[11].oreNette, 'il mese che riceve le vacanze perde ore nette');
const comb = sugV.find((s) => s.tipo === 'combinata');
ok(!!comb, 'vacanze non bastano: proposta combinata (vacanze + il resto)');
ok(comb && comb.effetto.oreCoperte >= sp.effetto.oreCoperte, 'la combinata copre almeno quanto le sole vacanze');
ok(sugV.filter((s) => s.consigliato).length === 1, 'una sola proposta indicata come la piu leggera');
// ausiliari attuali con piu disponibilita
const datiJ = Object.assign({}, datiV, {
  persone: persone7.slice(0, 4).concat([
    { nome: 'J1', jolly: true, pct: 1 },
    { nome: 'J2', jolly: true, pct: 1 },
  ]),
  righe: [],
});
const AJ = O.analizza(datiJ, { oggi: '2026-10-05', jollyPct: 0.5 });
const sj = O.suggerimenti(datiJ, { oggi: '2026-10-05', jollyPct: 0.5 }, AJ).find((s) => s.tipo === 'disponibilita');
ok(!!sj, 'suggerimento: piu disponibilita agli ausiliari attuali');
const BJ = O.analizza(datiJ, { oggi: '2026-10-05', jollyPct: 0.5 }, sj.scenario);
ok(BJ.mesi[10].oreNette > AJ.mesi[10].oreNette, 'con piu disponibilita degli ausiliari aumentano le ore nette');

console.log('== persone per le domeniche ==');
// 3 posti la domenica, 3 persone: con 12 domeniche libere non bastano
const fabbDom = [];
for (let g = 1; g <= 30; g++) {
  const d = '2026-11-' + String(g).padStart(2, '0');
  const dom = new Date(2026, 10, g, 12).getDay() === 0;
  fabbDom.push({ data: d, codice: 'A', quantita: dom ? 3 : 1 });
}
const datiD = {
  anno: 2026,
  fabbisogni: fabbDom,
  turni: turni,
  persone: persone4.slice(0, 3),
  righe: [],
  festiviAnno: 0,
};
const AD = O.analizza(datiD, { oggi: '2026-10-01' });
ok(AD.mesi[10].testeMinDomenica > 3, 'domeniche: 3 posti chiedono piu di 3 persone');
ok(O.statoMese(AD.mesi[10]) === 'sotto', 'mese sotto per le persone anche se le ore bastano');
ok(
  !!O.suggerimenti(datiD, { oggi: '2026-10-01' }, AD).find((s) => s.tipo === 'persone'),
  'suggerimento: persone in piu per domeniche',
);

console.log('== verifica sui mesi passati ==');
const finto = {
  mesi: [1, 2, 3, 4].map((m) => ({
    mese: m,
    passato: true,
    oreRichieste: 100,
    differenzaOre: -m * 10,
    consuntivo: { scopertiOre: m * 8, oreExtra: m * 3 },
  })),
};
const v = O.verifica(finto);
ok(v.righe[0].diagnosi === 'organico', 'mese con ore mancanti: diagnosi organico');
const dist = O.verifica({
  mesi: [
    {
      mese: 7,
      passato: true,
      oreRichieste: 100,
      differenzaOre: 50,
      consuntivo: { scopertiOre: 40, oreExtra: 0, oreSotto: 60 },
    },
  ],
});
ok(dist.righe[0].diagnosi === 'distribuzione', 'posti scoperti con ore non usate: diagnosi distribuzione');
ok(v.righe.length === 4, 'quattro mesi passati confrontati');
vicino(v.correlazione, 1, 0.0001, 'mancanza del modello e pressione reale crescono insieme: correlazione 1');

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================');
process.exit(falliti ? 1 : 0);
