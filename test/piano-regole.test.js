/**
 * Test automatici del motore delle regole del piano (js/piano-regole.js).
 *
 * Come si lancia (senza browser ne' server):
 *   node test/piano-regole.test.js
 *
 * Esce con codice 0 se tutti i test passano, 1 se qualcuno fallisce.
 * Da eseguire dopo OGNI modifica alle regole, prima di pubblicare.
 */
const R = require('../js/piano-regole.js');

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
function eq(a, b, nome) {
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    nome + '  (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')',
  );
}

// --- turni di prova (come nel piano reale) ---
const TURNI = {
  PRESTO: { codice: 'PRESTO', ora_inizio: '06:00', ora_fine: '14:00', oltre23: false, tipo: 'DIURNO', gruppo: 'SALA' },
  POM: { codice: 'POM', ora_inizio: '14:00', ora_fine: '22:00', oltre23: false, tipo: 'DIURNO', gruppo: 'SALA' },
  NOTTE: { codice: 'NOTTE', ora_inizio: '22:00', ora_fine: '06:00', oltre23: true, tipo: 'NOTTURNO', gruppo: 'SALA' },
  REC: { codice: 'REC', ora_inizio: '10:00', ora_fine: '18:00', oltre23: false, tipo: 'DIURNO', gruppo: 'REC' },
};
const turnoDi = (c) => TURNI[c] || null;
const isLavoro = (c) => !!TURNI[c];

console.log('\n== oraNum ==');
eq(R.oraNum('08:30'), 8.5, 'oraNum 08:30');
eq(R.oraNum('00:00'), 0, 'oraNum 00:00');
eq(R.oraNum(''), null, 'oraNum vuoto = null');

console.log('\n== riposoOre ==');
// notte finisce alle 06:00, presto inizia alle 06:00 il giorno dopo -> 0h (in realta' 24h dal giorno prima)
eq(R.riposoOre(TURNI.NOTTE, TURNI.PRESTO), 0, 'notte -> presto = 0h di riposo');
// pom finisce 22:00, presto giorno dopo 06:00 -> 8h
eq(R.riposoOre(TURNI.POM, TURNI.PRESTO), 8, 'pom -> presto = 8h');
// presto finisce 14:00, presto giorno dopo 06:00 -> 16h
eq(R.riposoOre(TURNI.PRESTO, TURNI.PRESTO), 16, 'presto -> presto = 16h');
eq(R.riposoOre(null, TURNI.PRESTO), null, 'riposo con turno mancante = null');

console.log('\n== violazioniCella: riposo ==');
// presto il giorno 11 dopo la notte del 10 -> viola (0h < 11h)
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'NOTTE', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).length,
  1,
  'presto dopo notte = 1 avviso',
);
// stessa cosa vista dal giorno prima (metto la notte il 10, il presto c'e' gia' l'11)
ok(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'NOTTE', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-10',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).some((a) => /giorno dopo/.test(a)),
  'notte prima del presto = avviso "giorno dopo"',
);
// pom -> presto = 8h < 11h -> viola
ok(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'POM', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }).length === 1,
  'pom -> presto (8h) = viola',
);
// presto -> presto = 16h -> ok
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-10': 'PRESTO', '2099-11-11': 'PRESTO' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
  }),
  [],
  'presto -> presto (16h) = nessun avviso',
);

console.log('\n== violazioniCella: consecutivi ==');
// 6 giorni di fila -> viola (max 5)
const sei = {};
for (let d = 10; d <= 15; d++) sei['2099-11-' + d] = 'PRESTO';
ok(
  R.violazioniCella({ mappaGiorni: sei, giorno: '2099-11-15', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  '6 giorni di fila = avviso consecutivi',
);
// 5 giorni -> ok
const cinque = {};
for (let d = 10; d <= 14; d++) cinque['2099-11-' + d] = 'PRESTO';
ok(
  !R.violazioniCella({ mappaGiorni: cinque, giorno: '2099-11-14', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  '5 giorni di fila = nessun avviso consecutivi',
);
// CROSS-MESE: 31/10..04/11 = 5, il 5/11 sarebbe il 6o
const cross = {};
for (const d of ['2099-10-31', '2099-11-01', '2099-11-02', '2099-11-03', '2099-11-04', '2099-11-05'])
  cross[d] = 'PRESTO';
ok(
  R.violazioniCella({ mappaGiorni: cross, giorno: '2099-11-05', minRiposo: 11, maxCons: 5, turnoDi, isLavoro }).some(
    (a) => /consecutivi/.test(a),
  ),
  'consecutivi contati a cavallo tra ottobre e novembre',
);

console.log('\n== violazioniCella: idoneita ==');
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-11': 'REC' },
    giorno: '2099-11-11',
    minRiposo: 11,
    maxCons: 5,
    turnoDi,
    isLavoro,
    idoneo: false,
    codiceNuovo: 'REC',
  }).filter((a) => /non risulta formato/.test(a)).length,
  1,
  'non idoneo = avviso formato',
);

console.log('\n== violazioniCella: regole spente ==');
eq(
  R.violazioniCella({
    mappaGiorni: { '2099-11-11': 'NOTTE' },
    giorno: '2099-11-11',
    minRiposo: 0,
    maxCons: 0,
    turnoDi,
    isLavoro,
  }),
  [],
  'regole spente (0/0) = nessun avviso',
);

console.log('\n== violazioniAccompagnamento ==');
const gruppoDi = (c) => (turnoDi(c) ? turnoDi(c).gruppo.toUpperCase() : '');
// Papa accompagnato in REC, da solo in REC -> viola
eq(
  R.violazioniAccompagnamento({
    perNome: { Papa: 'REC' },
    turnoDi,
    gruppoDi,
    isAccompagnato: (n, g) => n === 'Papa' && g === 'REC',
  }),
  [{ nome: 'Papa', gruppo: 'REC' }],
  'accompagnato da solo = violazione',
);
// Papa con un collega in REC -> ok
eq(
  R.violazioniAccompagnamento({
    perNome: { Papa: 'REC', Rossi: 'REC' },
    turnoDi,
    gruppoDi,
    isAccompagnato: (n, g) => n === 'Papa' && g === 'REC',
  }),
  [],
  'accompagnato con un collega = nessuna violazione',
);

console.log('\n== idoneoPerTurno ==');
const ctxBase = {
  settoriDi: () => null, // nessun vincolo di settore
  regoleGruppoDi: () => [],
  campoOk: () => true,
  mappFunzione: () => null,
  regolaVal: () => null,
};
ok(R.idoneoPerTurno({ funzione: 'SA' }, TURNI.PRESTO, ctxBase), 'nessun vincolo = idoneo');
ok(!R.idoneoPerTurno({ solo_diurni: true }, TURNI.NOTTE, ctxBase), 'solo_diurni = non idoneo alla notte');
ok(!R.idoneoPerTurno({ turni_bloccati: 'PRESTO' }, TURNI.PRESTO, ctxBase), 'turno bloccato = non idoneo');
// settore non assegnato senza campo -> non idoneo
ok(
  !R.idoneoPerTurno({ funzione: 'SA' }, TURNI.REC, { ...ctxBase, settoriDi: () => ['SALA'] }),
  'settore REC non assegnato = non idoneo',
);
ok(
  R.idoneoPerTurno({ funzione: 'SA' }, TURNI.REC, { ...ctxBase, settoriDi: () => ['SALA', 'REC'] }),
  'settore REC assegnato = idoneo',
);

console.log('\n== indiceBenessere ==');
const soglie = { domenicheAnno: 12, maxConsecutivi: 5, vacanzeAnno: 20 };
// caso ideale: tutto nella norma
const ideale = R.indiceBenessere(
  {
    domenicheLibere: 12,
    domenicheTot: 52,
    weekendLavorati: 20,
    weekendMediaSettore: 20,
    notti: 30,
    giorniLavorati: 200,
    riposiIsolati: 0,
    serieMax: 5,
    vacanzeGiorni: 20,
  },
  soglie,
);
eq(ideale.punteggio, 100, 'situazione ideale = 100 punti');
// caso pesante: nessuna domenica libera, molti weekend, tante notti, serie lunghe
const pesante = R.indiceBenessere(
  {
    domenicheLibere: 0,
    domenicheTot: 52,
    weekendLavorati: 40,
    weekendMediaSettore: 20,
    notti: 150,
    giorniLavorati: 200,
    riposiIsolati: 10,
    serieMax: 9,
    vacanzeGiorni: 0,
  },
  soglie,
);
eq(pesante.punteggio, 0, 'situazione critica = 0 punti');
ok(ideale.voci.length === 6, 'sei indicatori valutati');
eq(
  ideale.voci.reduce((s, v) => s + v.max, 0),
  100,
  'i pesi sommano a 100',
);
// mezze misure: 6 domeniche su 12 = meta dei punti di quella voce
const meta = R.indiceBenessere(
  {
    domenicheLibere: 6,
    domenicheTot: 52,
    weekendLavorati: 20,
    weekendMediaSettore: 20,
    notti: 30,
    giorniLavorati: 200,
    riposiIsolati: 0,
    serieMax: 5,
    vacanzeGiorni: 20,
  },
  soglie,
);
eq(meta.voci[0].punti, 13, 'sei domeniche su dodici = circa meta punti');
ok(meta.punteggio < ideale.punteggio, 'meno domeniche libere = punteggio piu basso');
// la malattia non deve influire: non e' tra i criteri
ok(!ideale.voci.some((v) => /malatt/i.test(v.nome)), 'le malattie non tolgono punti (non sono una colpa)');

console.log('\n== giorniVacanzaSpettanti ==');
// scala per anzianita' (assunto il 1 gennaio, cosi' gli anni sono pieni)
eq(R.giorniVacanzaSpettanti('2000-01-01', 2001).giorni, 28, 'primo anno = 28 giorni');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2002).giorni, 35, 'dal secondo anniversario = 35 giorni');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2009).giorni, 35, 'nove anni = ancora 35');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2010).giorni, 36, 'dieci anni = 36 (+1)');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2015).giorni, 37, 'quindici anni = 37 (+2, sostituisce l +1)');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2020).giorni, 38, 'venti anni = 38 (+3, sostituisce l +2)');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2025).giorni, 39, 'venticinque anni = 39 (+4, sostituisce l +3)');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2030).giorni, 39, 'oltre i venticinque resta 39');
// gli scaglioni NON si sommano: vale solo il piu' alto raggiunto
eq(R.giorniVacanzaSpettanti('2000-01-01', 2016).bonus, 2, 'a 16 anni il bonus e 2, non 1+2');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2026).voci.length, 1, 'resta una sola voce di bonus, la piu alta');
eq(R.giorniVacanzaSpettanti('2000-01-01', 2026).voci[0].anni, 25, 'la voce e lo scaglione dei 25 anni');

// PRO RATA nell'anno in cui si compiono i due anni: assunto 1 maggio 2024,
// nel 2026 compie 2 anni il 1 maggio -> gen-apr a 28/12, mag-dic a 35/12
const pr = R.giorniVacanzaSpettanti('2024-05-01', 2026);
eq(pr.mesiBase1, 4, 'quattro mesi ancora a 28 giorni');
eq(pr.mesiBase2, 8, 'otto mesi gia a 35 giorni');
eq(pr.giorni, 32.67, 'anno del passaggio: 32.67 giorni (9.33 + 23.33)');

// anno di assunzione: contano solo i mesi lavorati
const primo = R.giorniVacanzaSpettanti('2026-07-01', 2026);
eq(primo.mesiBase1, 6, 'assunto a luglio: sei mesi nel primo anno');
eq(primo.giorni, 14, 'assunto a luglio: 14 giorni (mezza annata a 28)');

// il bonus e' pieno nell'anno dell'anniversario, non proporzionato
const b10 = R.giorniVacanzaSpettanti('2016-05-01', 2026);
eq(b10.bonus, 1, 'compie dieci anni a maggio: il giorno in piu vale per intero');
eq(b10.giorni, 36, 'dieci anni compiuti in corso d anno = 36 giorni pieni');

// nessuna data di assunzione = nessun calcolo
// il giorno in piu' spetta DAL GIORNO DOPO l'anniversario
eq(
  R.giorniVacanzaSpettanti('2016-12-31', 2026).bonus,
  0,
  'dieci anni compiuti il 31 dicembre: il giorno in piu vale dall anno dopo',
);
eq(R.giorniVacanzaSpettanti('2016-12-31', 2027).bonus, 1, 'lo stesso caso, l anno seguente vale');
eq(R.giorniVacanzaSpettanti('2016-12-30', 2026).bonus, 1, 'anniversario il 30 dicembre: vale gia quest anno');
eq(
  R.giorniVacanzaSpettanti('2016-01-01', 2026, { mesiCongedo: 0 }).bonus,
  1,
  'dieci anni senza congedi: il giorno in piu spetta',
);
eq(
  R.giorniVacanzaSpettanti('2016-01-01', 2026, { mesiCongedo: 6 }).bonus,
  1,
  'sei mesi di congedo: i dieci anni cadono comunque dentro il 2026 (a luglio)',
);
eq(
  R.giorniVacanzaSpettanti('2016-01-01', 2026, { mesiCongedo: 12 }).bonus,
  0,
  'un anno intero di congedo non pagato: i dieci anni slittano al 2027',
);
eq(
  R.giorniVacanzaSpettanti('2016-01-01', 2027, { mesiCongedo: 12 }).bonus,
  1,
  'lo stesso caso: nel 2027 il giorno in piu spetta',
);
ok(R.giorniVacanzaSpettanti('', 2026) === null, 'senza data di assunzione non si calcola');
eq(R.giorniVacanzaSpettanti('2027-01-01', 2026).giorni, 0, 'assunto l anno dopo: zero giorni');

console.log('\n== festivita e orari di chiusura ==');
// Pasqua: date verificate sul calendario
eq(R.pasqua(2026), '2026-04-05', 'Pasqua 2026');
eq(R.pasqua(2027), '2027-03-28', 'Pasqua 2027');
eq(R.pasqua(2028), '2028-04-16', 'Pasqua 2028');
// L'elenco 2027 deve coincidere con quello fornito dalla direzione
const f27 = R.festivitaItaliane(2027);
eq(f27.length, 12, 'dodici festivita italiane');
ok(
  f27.some((x) => x.data === '2027-03-29' && /Angelo/.test(x.nome)),
  'Lunedi dell Angelo 2027 = 29 marzo',
);
ok(
  f27.some((x) => x.data === '2027-08-15' && /Ferragosto/.test(x.nome)),
  'Ferragosto 15 agosto',
);
// Chiusure
const FEST = { '2027-01-06': 'Epifania', '2027-12-25': 'Natale' };
// SI CHIUDE TARDI LA NOTTE PRIMA DEL FESTIVO, non la notte del festivo
const vigilia = R.chiusuraDelGiorno('2027-01-05', FEST, {}); // martedi, vigilia dell Epifania
eq(vigilia.ora, 5, 'vigilia infrasettimanale: chiusura alle 5');
eq(vigilia.marcatore, 'CH5', 'e va segnalata nel piano');
ok(/Epifania/.test(vigilia.motivo), 'il motivo dice di quale festa e la vigilia');
const ilFestivo = R.chiusuraDelGiorno('2027-01-06', FEST, {}); // il giorno di festa in se
eq(ilFestivo.ora, 4, 'il giorno di festa chiude all orario normale: la sera dopo si lavora');
eq(ilFestivo.marcatore, '', 'nessun marcatore sul festivo stesso');
const vigiliaVen = R.chiusuraDelGiorno('2027-12-24', FEST, {}); // 24 dicembre 2027 e venerdi
eq(vigiliaVen.ora, 5, 'vigilia di venerdi: sempre alle 5');
eq(vigiliaVen.marcatore, '', 'ma nessun marcatore: il venerdi chiude gia alle 5');
const feriale = R.chiusuraDelGiorno('2027-01-07', FEST, {}); // giovedi qualunque
eq(feriale.ora, 4, 'giorno feriale normale: chiusura alle 4');
eq(feriale.marcatore, '', 'nessun marcatore');
const ven = R.chiusuraDelGiorno('2027-01-08', FEST, {}); // venerdi
eq(ven.ora, 5, 'venerdi: chiusura alle 5 anche senza festivita');
const fine = R.chiusuraDelGiorno('2026-12-31', {}, {});
eq(fine.ora, 7, '31 dicembre: chiusura alle 7');
eq(fine.marcatore, 'CH7', 'e si segnala sempre');
// tutto configurabile: se un giorno si decidesse di chiudere alle 6
const alt = R.chiusuraDelGiorno('2027-01-05', FEST, { oraTardi: 6 });
eq(alt.marcatore, 'CH6', 'orario di chiusura configurabile');

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
