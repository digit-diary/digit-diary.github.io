/**
 * Test di logica pura (senza browser e senza database) per il controllo A del 23/10/2026:
 *  - nominatiInFrase / _vociAssenzaDaFrammento: omonimi nelle frasi libere (A5)
 *  - _cassaVociDaTesto: virgola dei decimali (A2), numero giusto nella frase (A7), omonimi (A5)
 *  - _pianoGiorniRegistrazione: righe «un giorno per riga» contano il loro giorno (A4)
 *  - _diarioEtichettePeriodo: periodo delle righe rimaste dopo una cancellazione (A4)
 *  - _rapportoHaDati: pallino del calendario per qualsiasi campo (A14)
 *  - _csvCellaDiario: CSV del Diario (A32)
 *   node test/diario-rapporto-frasi.test.js
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
const ctx = {
  console,
  currentReparto: 'slots',
  toast: () => {},
  collaboratoriCache: [
    { nome: 'Provetti Anna', reparto_dip: 'slots' },
    { nome: 'Provetti Marco', reparto_dip: 'slots' },
    { nome: 'Qualitano Mario', reparto_dip: 'slots' },
    { nome: 'Rossi Luca', reparto_dip: 'slots' },
    { nome: 'Bianchi Sara', reparto_dip: 'tavoli' },
    { nome: 'Bianchi Sara Maria', reparto_dip: 'slots' },
  ],
};
vm.createContext(ctx);
// capitalizzaNome usa le particelle e le sigle (js/utils.js), se ci sono
const srcU = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const mPart = srcU.match(/const _NOMI_PARTICELLE = (\[[\s\S]*?\]);/);
if (mPart) vm.runInContext('var _NOMI_PARTICELLE = ' + mPart[1] + ';', ctx);
if (srcU.includes('function _nomeSigla(')) vm.runInContext(estrai('utils.js', '_nomeSigla'), ctx);
[
  ['utils.js', 'dataLocaleISO'],
  ['utils.js', 'giornoDi'],
  ['utils.js', 'capitalizzaNome'],
  ['diario.js', '_levenshtein'],
  ['diario.js', 'candidatiCollaboratore'],
  ['diario.js', '_collabNelSettoreAperto'],
  ['diario.js', 'scegliCollaboratore'],
  ['diario.js', 'nominatiInFrase'],
  ['diario.js', '_cassaImportoInFrase'],
  ['diario.js', '_cassaSegnoDaParole'],
  ['diario.js', '_cassaVociDaTesto'],
  ['diario.js', '_diarioEtichettePeriodo'],
  ['diario.js', '_diarioSenzaEtichetta'],
  ['piano-core.js', '_pianoDateMalattia'],
  ['piano-core.js', '_pianoGiorniRegistrazione'],
  ['rapporto.js', '_rapportoHaDati'],
  ['stats.js', '_csvCellaDiario'],
].forEach(([f, n]) => vm.runInContext(estrai(f, n), ctx));
// costanti delle assenze del rapporto (const a livello di file)
const srcR = fs.readFileSync(path.join(__dirname, '..', 'js', 'rapporto.js'), 'utf8');
['_ASSENZE_ALTRO_RE', '_ASSENZE_MAL_RE', '_ASSENZE_VUOTO_RE'].forEach((k) => {
  const m = srcR.match(new RegExp('const ' + k + ' =\\s*([^\\n]+);'));
  vm.runInContext('var ' + k + ' = ' + m[1] + ';', ctx);
});
vm.runInContext(estrai('rapporto.js', '_vociAssenzaDaFrammento'), ctx);

console.log('Nomi nelle frasi libere (A5)');
const nf = (t) => ctx.nominatiInFrase(t).map((x) => x.testo + '=' + x.nomi.join('/'));
eq(nf('Oggi ha chiamato Provetti'), ['provetti=Provetti Anna/Provetti Marco'], 'due Provetti: restano tutti e due');
eq(nf('ha chiamato Anna Provetti, non sta bene'), ['anna provetti=Provetti Anna'], 'nome e cognome: uno solo');
eq(nf('Qualitano sta male'), ['qualitano=Qualitano Mario'], 'cognome unico');
eq(nf('Rossi e Qualitano stanno male'), ['rossi=Rossi Luca', 'qualitano=Qualitano Mario'], 'due persone in ordine');
eq(nf('nessuno oggi'), [], 'nessun nome');
const voci = (t) => ctx._vociAssenzaDaFrammento(t, t).map((v) => v[1]);
eq(voci('Oggi ha chiamato Provetti'), ['Provetti'], 'frase libera: si passa il cognome, non il primo collaboratore');
eq(voci('Oggi ha chiamato Qualitano'), ['Qualitano Mario'], 'frase libera con un solo collaboratore');
const sc = (t) => ctx.scegliCollaboratore(t, []);
eq(sc('Provetti'), { ambigui: ['Provetti Anna', 'Provetti Marco'] }, 'scegliCollaboratore chiede tra gli omonimi');
eq(sc('Bianchi'), { nome: 'Bianchi Sara Maria' }, 'omonimi in settori diversi: quello del settore aperto');

console.log('Differenze di cassa (A2, A7, A5)');
const cv = (t) =>
  ctx
    ._cassaVociDaTesto(t)
    .map((v) =>
      v.nonCapita
        ? 'NON CAPITO'
        : v.cognome + ' ' + (v.ambiguo ? 'IMPORTO DA CHIARIRE' : (v.segno || '') + v.importo.toFixed(2)),
    );
eq(cv('Qualitano -12,50'), ['Qualitano -12.50'], 'virgola dei decimali (A2)');
eq(cv('Qualitano -12,50, Rossi +5'), ['Qualitano -12.50', 'Rossi +5.00'], 'virgola dei decimali e virgola fra persone');
eq(cv('Qualitano -12,5'), ['Qualitano -12.50'], 'un decimale');
eq(cv('Qualitano 12.50 CHF'), ['Qualitano 12.50'], 'con CHF');
eq(cv('-170.44 Rossi'), ['Rossi -170.44'], 'importo prima del nome');
eq(cv('Rossi eccedenza 20'), ['Rossi +20.00'], '«eccedenza» = +');
eq(cv('Rossi ammanco di 20'), ['Rossi -20.00'], '«ammanco di 20»');
eq(cv('cassa 3 Qualitano ammanco 20'), ['Qualitano Mario -20.00'], 'frase libera: il numero dopo «ammanco» (A7)');
eq(cv('cassa 3 Qualitano chiude 20 chf in meno'), ['Qualitano Mario -20.00'], 'frase libera: il numero con CHF');
eq(cv('cassa 3 Qualitano 20'), ['Qualitano Mario IMPORTO DA CHIARIRE'], 'due numeri senza indicazione: da chiarire');
eq(cv('alla cassa Provetti ammanco 5'), ['Provetti -5.00'], 'frase libera con omonimi: resta il cognome (A5)');
eq(cv('Rossi -5; Qualitano +3'), ['Rossi -5.00', 'Qualitano +3.00'], 'punto e virgola');
eq(cv('nessuna'), [], 'segnaposto');

console.log('Righe «un giorno per riga» (A4)');
const gr = (t, d) => ctx._pianoGiorniRegistrazione(t, d);
eq(gr('Febbre (dal 3/2/2027 al 5/2/2027)', '2027-02-05T08:00:00.000Z'), ['2027-02-05'], 'riga del 05: solo il 05');
eq(gr('Febbre (dal 03/02/2027 al 05/02/2027)', '2027-02-03T08:00:00.000Z'), ['2027-02-03'], 'riga del 03: solo il 03');
eq(
  gr('Assente dal 03/02/2027 al 05/02/2027 (3 giorni, da rapporto PRESTO del 03/02/2027)', '2027-02-03T09:00:00Z'),
  ['2027-02-03', '2027-02-04', '2027-02-05'],
  'riga del Rapporto: tutto il periodo',
);
eq(
  gr('dal 3/2/2027 al 5/2/2027', '2027-02-03'),
  ['2027-02-03', '2027-02-04', '2027-02-05'],
  'periodo scritto senza etichetta',
);
eq(
  gr('Febbre (dal 3/2/2027 al 5/2/2027)', '2027-03-10T08:00:00Z'),
  ['2027-02-03', '2027-02-04', '2027-02-05'],
  'giorno fuori dal periodo: il periodo',
);
// la data come la scrive il programma (toLocaleDateString): senza gli zeri davanti
const z = (t) => String(t).replace(/\b0(\d)\//g, '$1/');
const et = ctx._diarioEtichettePeriodo(['2027-02-03', '2027-02-04']);
eq(z(et['2027-02-04']), '(dal 3/2/2027 al 4/2/2027)', 'tolto il 05: il periodo diventa 03-04');
const et2 = ctx._diarioEtichettePeriodo(['2027-02-03', '2027-02-05', '2027-02-06']);
eq(
  [z(et2['2027-02-03']), z(et2['2027-02-06'])],
  ['(dal 3/2/2027 al 3/2/2027)', '(dal 5/2/2027 al 6/2/2027)'],
  'tolto il 04: due tratti',
);
const et3 = ctx._diarioEtichettePeriodo(['2027-02-28', '2027-03-01']);
eq(z(et3['2027-03-01']), '(dal 28/2/2027 al 1/3/2027)', 'tratto a cavallo del mese');
eq(ctx._diarioSenzaEtichetta('Febbre alta (dal 3/2/2027 al 5/2/2027)'), 'Febbre alta', 'testo senza etichetta');

console.log('Calendario del Rapporto (A14)');
eq(
  ctx._rapportoHaDati({ id: 1, reparto_dip: 'valet', sup_note: '', assenze: '' }),
  false,
  'riga vuota (anche con il settore)',
);
eq(ctx._rapportoHaDati({ reparto_dip: 'valet', assenze: 'Rossi assente' }), true, 'solo assenze');
eq(ctx._rapportoHaDati({ reparto_dip: 'slots', prelievi: '2' }), true, 'solo prelievi');
eq(
  ctx._rapportoHaDati({ reparto_dip: 'slots', note_extra: '{"differenze_cassa":"Rossi -5"}' }),
  true,
  'solo differenze cassa',
);
eq(ctx._rapportoHaDati({ reparto_dip: 'slots', note_extra: '{"auto":""}' }), false, 'campo extra vuoto');

console.log('CSV del Diario (A32)');
eq(ctx._csvCellaDiario('Rossi; Luca'), '"Rossi; Luca"', 'tra virgolette');
eq(ctx._csvCellaDiario('detto "ciao"'), '"detto ""ciao"""', 'virgolette raddoppiate');
eq(ctx._csvCellaDiario('=SOMMA(A1)'), '"\'=SOMMA(A1)"', 'formula neutralizzata');
eq(ctx._csvCellaDiario('-12,50'), '"-12,50"', 'numero negativo resta numero');
eq(ctx._csvCellaDiario(''), '""', 'vuoto');

console.log('Diario -> Rapporto (A9)');
ctx.nomeCorrente = (x) => x;
['_diarioTipoConPeriodo', '_diarioOrigineRapporto', '_diarioGiorniPerRapporto', '_diarioVoceRapporto'].forEach((n) =>
  vm.runInContext(estrai('diario.js', n), ctx),
);
eq(
  ctx._diarioOrigineRapporto({ origine: 'diario|NOTTE|2027-05-03', reparto_dip: 'slots' }),
  { turno: 'NOTTE', ds: '2027-05-03', reparto: 'slots', campo: 'assenze' },
  'collegamento letto dall origine',
);
eq(ctx._diarioOrigineRapporto({ origine: 'manual' }), null, 'riga senza collegamento');
const riga = (g, t) => ({
  tipo: t || 'Malattia',
  testo: 'Febbre (dal 3/5/2027 al 5/5/2027)',
  data: g + 'T08:00:00.000Z',
});
eq(
  ctx._diarioVoceRapporto('Rossi Luca', 'Malattia', [riga('2027-05-03'), riga('2027-05-04'), riga('2027-05-05')]),
  'Rossi Luca malato dal 03/05/2027 al 05/05/2027',
  'malattia di tre giorni',
);
eq(
  ctx._diarioVoceRapporto('Rossi Luca', 'Malattia', [riga('2027-05-03'), riga('2027-05-05')]),
  'Rossi Luca malato dal 03/05/2027 al 03/05/2027 e dal 05/05/2027 al 05/05/2027',
  'tolto il giorno in mezzo: due tratti',
);
eq(
  ctx._diarioVoceRapporto('Rossi Luca', 'Assenza', [riga('2027-05-03', 'Assenza')]),
  'Rossi Luca assente dal 03/05/2027 al 03/05/2027',
  'assenza (attesa certificato)',
);
eq(
  ctx._diarioVoceRapporto('Rossi Luca', 'Non Disponibilità', [
    { tipo: 'Non Disponibilità', testo: 'corso (2 giorni: 14/05/2027, 16/05/2027)', data: '2026-10-23T10:00:00Z' },
  ]),
  'Rossi Luca non disponibile (ND) il 14/05/2027 e 16/05/2027',
  'ND con due giorni',
);
eq(ctx._diarioVoceRapporto('Rossi Luca', 'Malattia', []), null, 'nessuna riga: voce da togliere');
eq(
  ctx._vociAssenzaDaFrammento('Rossi Luca non disponibile (ND) il 14/05/2027 e 16/05/2027', 'x'),
  null,
  'la voce ND nel Rapporto non crea assenze',
);
eq(
  voci('Rossi Luca malato dal 03/05/2027 al 05/05/2027'),
  ['Rossi Luca'],
  'la voce malattia scritta dal Diario si rilegge con il nome intero',
);

console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
