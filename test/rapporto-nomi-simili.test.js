/**
 * Test di logica (senza browser e senza database) per la riverifica A del 23/10/2026, A-N1:
 * il Diario non deve sovrascrivere ne cancellare nel Rapporto la voce di un collega che ha
 * lo stesso nome di battesimo o una parola in comune (prefisso, cognome doppio).
 *  - _rapportoParolaNome: nome intero, cognome unico in anagrafica, mai una parola in comune
 *  - _rapportoTogliNome: un frammento che nomina un altro collaboratore non si tocca
 *  - percorso vero: _diarioRapportoAllinea (Diario -> Rapporto), _rapportoAggiungiAssenza
 *    (Piano -> Rapporto), _rapportoTogliRegistrazione e _rapportoRimettiRegistrazione con il
 *    Rapporto finto in memoria
 *   node test/rapporto-nomi-simili.test.js
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
// la funzione intera (anche async) dal file
function estrai(file, nome) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  let i = src.indexOf('\nfunction ' + nome + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + nome + '(');
  if (i < 0) throw new Error(nome + ' non trovata in ' + file);
  i++;
  let j = src.indexOf('{', src.indexOf(')', i)),
    liv = 0;
  for (; j < src.length; j++) {
    if (src[j] === '{') liv++;
    else if (src[j] === '}' && --liv === 0) break;
  }
  return src.substring(i, j + 1);
}
// anagrafica con i casi del controllo (nomi veri simili)
const ANAGRAFICA = [
  'Clemente Chiara',
  'Bianchi Chiara',
  'Raineri Andrea',
  'Molinari Andrea',
  'De Lima Marco',
  'Lima Paolo',
  'Rossi Luca',
  'FIX3 Jollyrv Sara',
  'FIX3 D Angelorv Pia',
  'Del Prete Roberta',
  'Della Pace Jacopo',
];
const rapporti = {}; // 'ds|turno' -> testo delle assenze
const ctx = {
  console,
  currentReparto: 'slots',
  window: {},
  collaboratoriCache: ANAGRAFICA.map((n) => ({ nome: n, reparto_dip: 'slots', attivo: true })),
  datiCache: [],
  isVis: () => true,
  nomeCorrente: (t) => t,
  getOperatore: () => 'Prova',
  logAzione: () => {},
  toast: () => {},
  toastErrore: (m) => {
    throw new Error(m);
  },
  _avvisoUnaVolta: () => {},
  // Rapporto finto: una riga per giorno e turno, con le sole assenze
  _rapportoRiga: async (o) => {
    const t = rapporti[o.ds + '|' + o.turno];
    return t === undefined ? null : { assenze: t, updated_at: 'x' };
  },
  _rapportoScriviCampo: async (o, riga, valore) => {
    rapporti[o.ds + '|' + o.turno] = valore;
  },
  _diarioScriviAssenzeRapporto: async (o, calcola) => {
    const k = o.ds + '|' + o.turno;
    rapporti[k] = calcola(rapporti[k] || '');
    return true;
  },
  _processaAssenzeRapporto: async () => ({ ok: true, errori: [], falliti: [] }),
  _rapportoCacheSet: () => {},
  secPost: async () => [],
  _pianoTurnoInfo: () => null,
  _rapportoVoceAssenza: (rec, rg) => 'malato dal ' + rg.i + ' al ' + rg.f,
  _getRangeMalattiaRec: () => ({ i: '2028-01-10', f: '2028-01-11' }),
  _diarioVoceRapporto: (nome, tipo, righe) => (righe.length ? nome + ' malato dal 10/01/2028 al 10/01/2028' : null),
};
vm.createContext(ctx);
const srcR = fs.readFileSync(path.join(__dirname, '..', 'js', 'rapporto.js'), 'utf8');
vm.runInContext('var _RAPP_LETTERE = ' + srcR.match(/const _RAPP_LETTERE = ([^\n]+);/)[1] + ';', ctx);
[
  ['rapporto.js', '_rapportoEsc'],
  ['rapporto.js', '_rapportoTrovaNelTesto'],
  ['rapporto.js', '_rapportoParoleDi'],
  ['rapporto.js', '_rapportoParolaNome'],
  ['rapporto.js', '_rapportoNominaAltri'],
  ['rapporto.js', '_rapportoTogliNome'],
  ['rapporto.js', '_rapportoOrigineDi'],
  ['rapporto.js', '_rapportoValoreCampo'],
  ['rapporto.js', '_rapportoTogliRegistrazione'],
  ['rapporto.js', '_rapportoRimettiRegistrazione'],
  ['rapporto.js', '_rapportoAggiungiAssenza'],
  ['diario.js', '_diarioOrigineRapporto'],
  ['diario.js', '_diarioRapportoAllinea'],
].forEach(([f, n]) => vm.runInContext(estrai(f, n), ctx));
// funzioni del Diario che il percorso usa e qui non servono
vm.runInContext(
  'function _diarioTipoNelRapporto() { return true; } function _diarioPuoRapporto() { return true; }',
  ctx,
);
const P = (t, n) => ctx._rapportoParolaNome(t, n);
const T = (t, n, nuovo) => ctx._rapportoTogliNome(t, n, nuovo).testo;

console.log('Persona nel testo del Rapporto');
eq(P('Clemente Chiara malato', 'Bianchi Chiara'), '', 'Bianchi Chiara non e «Clemente Chiara» (nome in comune)');
eq(P('Clemente Chiara malato', 'Clemente Chiara'), 'Clemente Chiara', 'nome intero');
eq(P('Chiara Clemente malato', 'Clemente Chiara'), 'Chiara Clemente', 'nome intero al contrario');
eq(P('Clemente malato', 'Clemente Chiara'), 'Clemente', 'cognome unico in anagrafica');
eq(P('Chiara malata', 'Clemente Chiara'), '', 'il solo nome di battesimo in comune non basta');
eq(P('Molinari Andrea ferie', 'Raineri Andrea'), '', 'Raineri Andrea non e «Molinari Andrea ferie»');
eq(P('De Lima Marco assente', 'De Lima Marco'), 'De Lima Marco', 'cognome doppio: nome intero');
eq(P('Lima Paolo assente', 'De Lima Marco'), '', '«Lima» e anche di Lima Paolo: non basta');
eq(P('Marco assente', 'De Lima Marco'), 'Marco', '«Marco» solo suo in anagrafica');
eq(P('FIX3 Jollyrv Sara ND', 'FIX3 D Angelorv Pia'), '', 'prefisso in comune (come «RV-A»): non basta');
eq(P('Rossì malato', 'Rossi Luca'), '', 'lettere accentate: «Rossì» non e «Rossi»');

console.log('Togliere o riscrivere la voce');
eq(
  T('Clemente Chiara malato', 'Bianchi Chiara'),
  'Clemente Chiara malato',
  'cancellando Bianchi la voce di Clemente resta',
);
eq(
  T('Clemente Chiara malato', 'Bianchi Chiara', 'Bianchi Chiara malato dal 10/01/2028 al 10/01/2028'),
  'Clemente Chiara malato\nBianchi Chiara malato dal 10/01/2028 al 10/01/2028',
  'la malattia di Bianchi si aggiunge, Clemente resta',
);
eq(
  T('Molinari Andrea ferie', 'Raineri Andrea'),
  'Molinari Andrea ferie',
  'Raineri Andrea non toglie «Molinari Andrea ferie»',
);
eq(
  T('Raineri Andrea malato, Molinari Andrea ferie', 'Raineri Andrea'),
  'Molinari Andrea ferie',
  'si toglie solo Raineri Andrea',
);
eq(
  T('Raineri e Molinari assenti', 'Raineri Andrea'),
  'Molinari assenti',
  '«Raineri e Molinari»: si toglie solo il nome',
);
eq(
  T('Raineri malato sostituito da Molinari', 'Raineri Andrea'),
  'Raineri malato sostituito da Molinari',
  'il frammento che nomina anche Molinari non si cancella',
);
eq(
  T('De Lima Marco assente', 'De Lima Marco', 'De Lima Marco malato dal 10/01/2028 al 11/01/2028'),
  'De Lima Marco malato dal 10/01/2028 al 11/01/2028',
  'De Lima Marco riscritto con il nome intero',
);
eq(T('Lima Paolo assente', 'De Lima Marco'), 'Lima Paolo assente', '«Lima Paolo» resta togliendo De Lima Marco');

console.log('Particelle (riverifica 2, A-R1)');
eq(P('Molinari Andrea malato del turno di notte', 'Del Prete Roberta'), '', '«del» non e Del Prete Roberta');
eq(P('Rossi assente della mattina', 'Della Pace Jacopo'), '', '«della» non e Della Pace Jacopo');
eq(P('Del Prete malata', 'Del Prete Roberta'), 'Del Prete', 'Del Prete: cognome intero unico');
eq(P('Prete malata', 'Del Prete Roberta'), 'Prete', '«Prete» solo suo in anagrafica');
eq(T('Molinari Andrea malato del turno di notte', 'Molinari Andrea'), '', 'cancellata nel Diario: la voce sparisce');
eq(
  T('Molinari Andrea malato della notte, Della Pace Jacopo ferie', 'Molinari Andrea'),
  'Della Pace Jacopo ferie',
  'resta solo Della Pace Jacopo',
);
eq(
  T('Molinari Andrea malato, sostituito da Della Pace', 'Molinari Andrea'),
  'sostituito da Della Pace',
  'frammento a parte con il collega: resta',
);
eq(
  T('Molinari Andrea malato sostituito da Della Pace Jacopo', 'Molinari Andrea'),
  'Molinari Andrea malato sostituito da Della Pace Jacopo',
  'stesso frammento con il nome intero di un collega: non si tocca',
);

(async () => {
  console.log('Percorso vero: Diario -> Rapporto (_diarioRapportoAllinea)');
  rapporti['2028-01-10|PRESTO'] = 'Clemente Chiara malato dal 10/01/2028 al 12/01/2028';
  const orig = 'diario|PRESTO|2028-01-10';
  ctx.datiCache.push({
    id: 1,
    nome: 'Bianchi Chiara',
    tipo: 'Malattia',
    origine: orig,
    testo: 'x',
    data: '2028-01-10',
  });
  await ctx._diarioRapportoAllinea(orig, 'Bianchi Chiara', 'Malattia');
  eq(
    rapporti['2028-01-10|PRESTO'],
    'Clemente Chiara malato dal 10/01/2028 al 12/01/2028\nBianchi Chiara malato dal 10/01/2028 al 10/01/2028',
    'malattia di Bianchi Chiara nel Diario: Clemente Chiara resta nel Rapporto',
  );
  ctx.datiCache.length = 0; // Bianchi cancellata dal Diario
  await ctx._diarioRapportoAllinea(orig, 'Bianchi Chiara', 'Malattia');
  eq(
    rapporti['2028-01-10|PRESTO'],
    'Clemente Chiara malato dal 10/01/2028 al 12/01/2028',
    'cancellata nel Diario: via solo Bianchi Chiara',
  );
  rapporti['2028-01-11|NOTTE'] = 'FIX3 Jollyrv Sara non disponibile (ND) il 11/01/2028';
  const o2 = 'diario|NOTTE|2028-01-11';
  ctx.datiCache.push({
    id: 2,
    nome: 'FIX3 D Angelorv Pia',
    tipo: 'Malattia',
    origine: o2,
    testo: 'x',
    data: '2028-01-11',
  });
  await ctx._diarioRapportoAllinea(o2, 'FIX3 D Angelorv Pia', 'Malattia');
  eq(
    rapporti['2028-01-11|NOTTE'].split('\n')[0],
    'FIX3 Jollyrv Sara non disponibile (ND) il 11/01/2028',
    'prefisso in comune (caso RV-A del 22/09 NOTTE): la ND del collega resta',
  );
  ctx.datiCache.length = 0;

  console.log('Percorso vero: Piano -> Rapporto (_rapportoAggiungiAssenza)');
  rapporti['2028-02-01|PRESTO'] = 'Molinari Andrea ferie';
  await ctx._rapportoAggiungiAssenza('Raineri Andrea', '2028-02-01', '2028-02-02', '', 'M');
  eq(
    rapporti['2028-02-01|PRESTO'],
    'Molinari Andrea ferie\nRaineri Andrea malato con certificato dal 01/02/2028 al 02/02/2028',
    'M a Raineri Andrea nel Piano: «Molinari Andrea ferie» resta',
  );
  await ctx._rapportoAggiungiAssenza('Raineri Andrea', '2028-02-01', '2028-02-03', '', 'M');
  eq(
    rapporti['2028-02-01|PRESTO'],
    'Molinari Andrea ferie\nRaineri Andrea malato con certificato dal 01/02/2028 al 03/02/2028',
    'M allungata: si riscrive la voce di Raineri, non quella di Molinari',
  );

  console.log('Percorso vero: cancellata e rimessa (Cestino, Annulla)');
  rapporti['2028-02-05|PRESTO'] = 'Molinari Andrea ferie';
  const rec = {
    nome: 'Raineri Andrea',
    tipo: 'Malattia',
    testo: 'Assente per malattia dal 05/02/2028 al 06/02/2028 (2 giorni, da rapporto PRESTO del 05/02/2028)',
    reparto_dip: 'slots',
  };
  eq(await ctx._rapportoTogliRegistrazione(rec), false, 'cancellata Raineri: niente da togliere (Molinari non e lui)');
  eq(rapporti['2028-02-05|PRESTO'], 'Molinari Andrea ferie', 'la voce di Molinari resta');
  const o3 = await ctx._rapportoRimettiRegistrazione(rec);
  eq(!!o3, true, 'rimessa Raineri: non risulta «gia presente» per la parola in comune');
  eq(
    rapporti['2028-02-05|PRESTO'],
    'Molinari Andrea ferie, Raineri Andrea malato dal 2028-01-10 al 2028-01-11',
    'rimessa con il nome intero',
  );
  eq((await ctx._rapportoTogliRegistrazione(rec)) !== false, true, 'cancellata di nuovo: via Raineri');
  eq(rapporti['2028-02-05|PRESTO'], 'Molinari Andrea ferie', 'e Molinari resta');

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
