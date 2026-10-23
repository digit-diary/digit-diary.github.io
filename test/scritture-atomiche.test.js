/**
 * Test di logica pura (senza browser e senza database), controllo del 23/10/2026:
 *  - D12 assenze del Rapporto in un unica transazione: operazioni del Diario per
 *    rapporto_assenze_scrivi (_rapportoOpsDiario) e celle del piano di piu assenze in una
 *    lista sola (_rapportoUnisciCelle) in js/rapporto.js;
 *  - D23 copia del fabbisogno in una scrittura: la funzione chiama piano_fabbisogno_copia e,
 *    senza la migrazione, la strada di prima (_pianoFabbisognoCopiaScrivi in piano-config.js);
 *  - Unisci schede: riepilogo dell anteprima e righe doppie in parole (js/piano-coerenza.js).
 *   node test/scritture-atomiche.test.js
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
  return (src.lastIndexOf('async ', i) === i - 6 ? 'async ' : '') + src.substring(i, j + 1);
}
function estraiConst(file, nome) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  const i = src.indexOf('const ' + nome + ' =');
  if (i < 0) throw new Error(nome + ' non trovata in ' + file);
  const j =
    src.indexOf('\n};\n', i) >= 0 && src.indexOf('\n];\n', i) >= 0
      ? Math.min(src.indexOf('\n};\n', i), src.indexOf('\n];\n', i))
      : src.indexOf('\n};\n', i) >= 0
        ? src.indexOf('\n};\n', i)
        : src.indexOf('\n];\n', i);
  return src.substring(i, j + 3).replace('const ', 'var ');
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(estrai('rapporto.js', '_rapportoOpsDiario'), ctx);
vm.runInContext(estrai('rapporto.js', '_rapportoUnisciCelle'), ctx);
vm.runInContext(estraiConst('piano-coerenza.js', 'COERENZA_UNISCI_GRUPPI'), ctx);
vm.runInContext(estraiConst('piano-coerenza.js', 'COERENZA_UNISCI_TABELLE'), ctx);
vm.runInContext(estrai('piano-coerenza.js', '_coerenzaUnisciRiepilogo'), ctx);
vm.runInContext(estrai('piano-coerenza.js', '_coerenzaUnisciDoppia'), ctx);
vm.runInContext(
  "var _coerenzaGg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7) + '.' + d.substring(0, 4);",
  ctx,
);

console.log('D12 · operazioni del Diario per rapporto_assenze_scrivi');
const cache = [
  { id: 11, nome: 'Rossi', testo: 'Assente per malattia (da rapporto PRESTO del 10/08/2027)' },
  {
    id: 12,
    nome: 'Bianchi',
    testo: 'Assente per malattia dal 10/08/2027 al 11/08/2027 (2 giorni, da rapporto PRESTO)',
  },
];
const creates = [
  { nome: 'Verdi', record: { id: 99, nome: 'Verdi', tipo: 'Malattia', testo: 't', origine: 'rapporto' } },
];
const updates = [{ id: 12, nome: 'Bianchi', vecchioTesto: 'x', nuovoTesto: 'nuovo testo' }];
const staccate = [
  { id: 11, nome: 'Rossi' },
  { id: 77, nome: 'Sparito' },
];
let ops = ctx._rapportoOpsDiario(creates, updates, staccate, cache, true);
eq(
  ops.map((o) => o.action + (o.id ? ' ' + o.id : '')),
  ['update 11', 'create', 'update 12'],
  'staccate prima, poi nuove e corrette (la staccata che non e in memoria si salta)',
);
eq(
  ops[0].data,
  { testo: 'Assente per malattia (tolta dal rapporto PRESTO del 10/08/2027)', origine: 'manual' },
  'staccata: testo «tolta dal rapporto» e origine manuale',
);
eq(
  ops[0].atteso_testo,
  cache[0].testo,
  'staccata: il testo come lo vede chi scrive (cambiato nel frattempo = niente scritto)',
);
eq(ops[2].atteso_testo, cache[1].testo, 'corretta: atteso = testo in memoria, non quello dell analisi');
eq(ops[2].data, { testo: 'nuovo testo' }, 'corretta: cambia solo il testo');
eq(ops[1].data.origine, 'rapporto', 'nuova: con la colonna origine');
ops = ctx._rapportoOpsDiario(creates, [], [{ id: 11, nome: 'Rossi' }], cache, false);
eq(
  [ops[0].data.origine, 'origine' in ops[1].data],
  [undefined, false],
  'database senza la colonna origine: niente origine',
);
eq(creates[0].record.origine, 'rapporto', 'il record dell analisi non cambia');

console.log('\nD12 · celle del piano di piu assenze');
const c1 = [
  { collaboratore: 'Verdi', data: '2027-08-10', dati: { codice: 'M' } },
  { collaboratore: 'Verdi', data: '2027-08-11', dati: { codice: 'M' } },
];
const c2 = [{ collaboratore: 'Bianchi', data: '2027-08-10', dati: null }];
let u = ctx._rapportoUnisciCelle([c1, [], c2]);
eq(u.ops.length, 3, 'tutte le celle in una lista');
eq(u.da, [0, 2, 2], 'dove comincia ogni assenza (per rimettere in memoria le sue righe)');
let errore = '';
try {
  ctx._rapportoUnisciCelle([c1, [{ collaboratore: 'Verdi', data: '2027-08-11T00:00:00', dati: { codice: 'ASS' } }]]);
} catch (e) {
  errore = e.message;
}
eq(
  /stessa cella del piano \(Verdi 11\.08\.2027\)/.test(errore),
  true,
  'stessa cella da due assenze: errore, niente scritto',
);

console.log('\nD23 · copia del fabbisogno');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'piano-config.js'), 'utf8');
const scrivi = estrai('piano-config.js', '_pianoFabbisognoCopiaScrivi');
eq(
  /piano_fabbisogno_copia/.test(scrivi) && !/secPost\(/.test(scrivi),
  true,
  'una sola scrittura nel database (niente secPost a gruppi)',
);
eq(/_pianoFabbisognoCopiaScriviVecchio\(calc, ym\)/.test(scrivi), true, 'senza la migrazione: la strada di prima');
eq(/Annulla\.dopoPost\('piano_fabbisogni'/.test(scrivi), true, 'le righe scritte entrano nell Annulla');
eq(
  src.indexOf('async function _pianoFabbisognoCopiaScriviVecchio(') > 0,
  true,
  'la strada di prima resta (righe tolte se qualcosa non riesce)',
);
// esecuzione con un database finto
async function provaCopia(risposta) {
  const c2x = { console, window: { Annulla: { dopoPost: (t, r) => (c2x.annullate = [t, r.length]) } } };
  c2x.getOpToken = () => 'tk';
  c2x._conSessione = (f, t) => f(t);
  c2x._rpcSicura = async (fn, p) => {
    c2x.chiamata = [fn, p.p_ym, p.p_rep, p.p_righe.length];
    if (risposta instanceof Error) throw risposta;
    return risposta;
  };
  c2x._pianoErroreFunzioneAssente = (e) => e.status === 404;
  c2x._pianoFabbisognoCopiaScriviVecchio = async () => 'vecchia';
  c2x.logAzione = (a, d) => (c2x.log = a + ' · ' + d);
  vm.createContext(c2x);
  vm.runInContext(scrivi, c2x);
  const calc = {
    ymPrec: '2027-07',
    nuovi: [
      { data: '2027-08-01', turno_codice: 'S1', quantita: 2, reparto_dip: 'slots' },
      { data: '2027-08-02', turno_codice: 'S1', quantita: 2, reparto_dip: 'slots' },
    ],
  };
  let esito, err;
  try {
    esito = await c2x._pianoFabbisognoCopiaScrivi(calc, '2027-08');
  } catch (e) {
    err = e;
  }
  return { esito, err, c: c2x };
}
(async () => {
  let r = await provaCopia({ ok: true, righe: [{ id: 1 }, { id: 2 }] });
  eq(
    [r.esito, r.c.chiamata, r.c.annullate],
    [2, ['piano_fabbisogno_copia', '2027-08', 'slots', 2], ['piano_fabbisogni', 2]],
    'copia riuscita: una chiamata, due righe nell Annulla',
  );
  eq(/fabbisogno copiato/.test(r.c.log), true, 'una riga nel registro');
  r = await provaCopia({ ok: false, conflitti: [{ data: '2027-08-02', turno_codice: 'S1' }] });
  eq(
    [
      !!r.err,
      r.err && r.err.copiaParziale,
      /1 cella.*02\.08 S1.*Nessuna cella scritta/.test(r.err && r.err.message),
      r.c.log,
    ],
    [true, 0, true, undefined],
    'cella impostata da un altro PC: errore, niente scritto, niente registro',
  );
  r = await provaCopia(Object.assign(new Error('Fabbisogno di un altro settore: tavoli'), { status: 400 }));
  eq(
    [!!r.err, /altro settore.*Nessuna cella scritta/.test(r.err && r.err.message)],
    [true, true],
    'rifiuto del database (settore): errore chiaro',
  );
  r = await provaCopia(Object.assign(new Error('Could not find the function'), { status: 404 }));
  eq(r.esito, 'vecchia', 'funzione assente: la strada di prima');

  console.log('\nUnisci schede · anteprima');
  const a = {
    tieni: { id: 1, nome: 'Tonati Edoardo' },
    togli: { id: 2, nome: 'Tonati' },
    tabelle: {
      piano: { gruppo: 'piano', righe: 181, doppie: 181 },
      piano_vacanze: { gruppo: 'piano', righe: 5, doppie: 5 },
      registrazioni: { gruppo: 'diario', righe: 3, doppie: 0 },
      moduli: { gruppo: 'moduli', righe: 0, doppie: 0 },
      hr_eventi: { gruppo: 'hr', righe: 1, doppie: 0 },
      piano_storico: { gruppo: 'storico', righe: 4, doppie: 0 },
    },
    campi: [
      { campo: 'funzione', tieni: null, togli: 'HOST', azione: 'completa' },
      { campo: 'percentuale', tieni: 1, togli: 0.5, azione: 'diverso' },
    ],
    impostazioni: { piano_ordine_collab: 1, regole_piano: 2 },
    operatore: true,
  };
  const rr = ctx._coerenzaUnisciRiepilogo(a);
  eq(
    rr.gruppi.map((g) => g.gruppo),
    ['piano', 'diario', 'hr', 'storico', 'preferenze', 'permessi'],
    'gruppi nell ordine, senza quelli vuoti (moduli)',
  );
  eq(rr.doppie, 186, 'righe doppie in tutto');
  eq(
    rr.gruppi[0].voci.map((v) => v.etichetta + ' ' + v.righe + '/' + v.doppie),
    ['celle del piano 181/181', 'vacanze 5/5'],
    'piano: celle e vacanze con le doppie',
  );
  eq(
    rr.gruppi[4].voci.map((v) => v.tab),
    ['piano_ordine_collab', 'campi', 'campi_diversi'],
    'preferenze: impostazioni e campi della scheda',
  );
  eq(
    rr.gruppi[5].voci.map((v) => v.tab),
    ['regole_piano', 'operatore'],
    'permessi: regole del piano e accesso al programma',
  );
  eq(
    ctx._coerenzaUnisciRiepilogo({ tabelle: {}, campi: [], impostazioni: {} }).gruppi,
    [],
    'scheda senza dati: niente da spostare',
  );
  const d = ctx._coerenzaUnisciDoppia('piano', {
    chiave: { data: '2026-01-01' },
    tieni: { codice: 'X1', reparto_dip: 'valet', commento: 'dalle 14' },
    togli: { codice: 'X1', reparto_dip: 'slots', commento: null },
    diversi: ['commento', 'reparto_dip'],
  });
  eq(
    [d.chiave, d.tieni, d.togli, d.uguali],
    ['01.01.2026', 'X1 (valet) «dalle 14»', 'X1 (slots)', false],
    'cella doppia del piano in parole',
  );
  const v = ctx._coerenzaUnisciDoppia('piano_vacanze', {
    chiave: { settimana: 10, anno: 2026 },
    tieni: {},
    togli: {},
    diversi: [],
  });
  eq([v.chiave, v.tieni, v.uguali], ['settimana 10 2026', 'uguale', true], 'vacanza doppia identica');

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
