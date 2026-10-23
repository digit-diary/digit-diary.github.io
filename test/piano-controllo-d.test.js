/**
 * Controllo D del Piano (23/10/2026), senza browser e senza database:
 *  - D1 Applica vacanze (js/piano-schede.js): toglie solo le celle scritte da un Applica
 *    precedente (_vacCellaDiApplica), mai le C di riempimento della bozza (_vacCRiempimento),
 *    le C del compleanno, dei cambi o scritte a mano;
 *  - D2 operazioni lunghe una alla volta (pianoLunga, js/piano-core.js): un secondo comando
 *    mentre il primo lavora (doppio clic) non parte e dice cosa e in corso;
 *  - D4 ASS come M, M1 e ND in Svuota (PIANO_SVUOTA_TIENI) e nelle Versioni (vale il Diario);
 *  - D5 sigla di un turno disattivato: resta del settore della riga (_pianoSettoreTurno,
 *    _pianoTurnoInfoRiga, _pianoTurnoInfo), non diventa la stessa sigla di un altro settore;
 *  - D19 Tipo di una nuova vacanza: niente malattie, ASS, ND, JG, WD, CGF, corsi.
 *   node test/piano-controllo-d.test.js
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
      const re = new RegExp('^(?:async )?function ' + n + '\\(|^(?:const|let) ' + n + ' =', 'm');
      const m = re.exec(src);
      if (!m) throw new Error(n + ' non trovata in ' + file);
      const riga = src.substring(m.index, src.indexOf('\n', m.index));
      if (/^(const|let)/.test(m[0])) {
        if (/;\s*(\/\/.*)?$/.test(riga)) return riga;
        const e = src.slice(m.index).search(/\n[\]}];/);
        return src.substring(m.index, m.index + e + 3);
      }
      return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
    })
    .join('\n');
}
const ctx = { console, Date, Set, Map, JSON, Promise, Object, Array, String, setTimeout };
vm.createContext(ctx);
vm.runInContext(
  [
    'var _msg = []; var toastErrore = (t) => _msg.push(t); var window = {}; var document = { body: { classList: { add(){}, remove(){} } } };',
    'var pianoTurniCache = []; var _repAperto = "slots"; function _pianoReparto(){ return _repAperto; } function _repartoDi(t){ return t.reparto_dip || "slots"; }',
    estrai('piano-core.js', [
      'PIANO_CAMPI_CELLA',
      '_pianoValNorm',
      '_pianoCelleUguali',
      '_pianoCampiDi',
      '_pianoTurniReparto',
      '_pianoSettoreTurno',
      '_pianoTurnoInfoRiga',
      '_pianoTurnoInfo',
      'pianoLungaOccupato',
      'pianoLunga',
    ]),
    'let _pianoLungaInCorso = null;',
    estrai('piano-genera.js', ['PIANO_SVUOTA_TIENI', '_pianoSvuotaCalcola']),
    estrai('piano-schede.js', [
      '_vacCRiempimento',
      '_vacCellaDiApplica',
      'PIANO_VERSIONE_DIARIO',
      '_pianoVersioneCalcola',
      'VAC_TIPI_ESCLUSI',
      '_vacTipoScegliibile',
    ]),
    fs
      .readFileSync(path.join(__dirname, '..', 'js', 'piano-coerenza.js'), 'utf8')
      .match(/^const COERENZA_NOMI_PROPRI =[\s\S]*?;\n/m)[0],
    estrai('piano-coerenza.js', ['_coerenzaConfronta', '_coerenzaCognomi', '_coerenzaExSenzaFine']),
    'this.T = { _coerenzaConfronta, _coerenzaCognomi, _coerenzaExSenzaFine, _vacCRiempimento, _vacCellaDiApplica, _pianoSvuotaCalcola, _pianoVersioneCalcola, _pianoSettoreTurno, _pianoTurnoInfoRiga, _pianoTurnoInfo, pianoLunga, pianoLungaOccupato, _vacTipoScegliibile, setTurni: (l) => { pianoTurniCache = l; }, msg: () => _msg };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;

console.log('D1 Applica vacanze: che cosa toglie');
const riemp = { codice: 'C', generato: true, protetto: false, commento: null };
const cApplica = { codice: 'C', generato: true, protetto: true, commento: null };
const wdApplica = { codice: 'WD', generato: true, protetto: false };
ok(T._vacCRiempimento(riemp) && !T._vacCellaDiApplica(riemp), 'C di riempimento della bozza: resta');
ok(T._vacCellaDiApplica(cApplica), 'C protetta e generata senza nota (di Applica): si toglie e si riscrive');
ok(T._vacCellaDiApplica(wdApplica), 'WD generato (di Applica): si toglie e si riscrive');
ok(!T._vacCellaDiApplica({ codice: 'C', generato: false, protetto: true }), 'C scritta a mano protetta: resta');
ok(!T._vacCellaDiApplica({ codice: 'C', generato: false, protetto: false }), 'C scritta a mano: resta');
ok(
  !T._vacCellaDiApplica({ codice: 'C', generato: true, protetto: false, commento: 'Compleanno' }) &&
    !T._vacCRiempimento({ codice: 'C', generato: true, protetto: false, commento: 'Compleanno' }),
  'C del compleanno: resta e non e riempimento',
);
ok(
  !T._vacCellaDiApplica({ codice: 'C', generato: true, protetto: true, commento: 'Ex S3 - cambio per esigenze' }),
  'C di un cambio (con la nota): resta',
);
ok(
  !T._vacCellaDiApplica({ codice: 'C', generato: true, protetto: true, motivo_blocco: 'deciso' }),
  'C con lucchetto: resta',
);
ok(!T._vacCellaDiApplica({ codice: 'S3', generato: true, protetto: false }), 'turno della bozza: resta');
// mese tipo del controllo: 1350 celle, 667 C di riempimento, 5 C e 8 WD di Applica
const mese = [];
for (let i = 0; i < 667; i++) mese.push(Object.assign({}, riemp));
for (let i = 0; i < 670; i++) mese.push({ codice: 'S3', generato: true, protetto: false });
for (let i = 0; i < 5; i++) mese.push(Object.assign({}, cApplica));
for (let i = 0; i < 8; i++) mese.push(Object.assign({}, wdApplica));
const tolte = mese.filter(T._vacCellaDiApplica).length;
ok(tolte === 13 && mese.length - tolte === 1337, 'mese di 1350 celle: Applica toglie solo le sue 13 (prima 667 C)');

console.log('D2 operazioni lunghe una alla volta');
(async () => {
  let fine;
  let partite = 0;
  const lunga = () =>
    new Promise((r) => {
      partite++;
      fine = r;
    });
  const p1 = T.pianoLunga('Prepara il mese', lunga);
  ok(T.pianoLungaOccupato() === 'Prepara il mese', 'il blocco si prende subito, prima di ogni attesa');
  await T.pianoLunga('Prepara il mese', lunga); // il secondo clic dopo 150 ms
  await T.pianoLunga('Svuota il mese', lunga);
  ok(partite === 1, 'doppio clic e Svuota durante la bozza: non partono');
  ok(
    T.msg().filter((m) => /Prepara il mese è ancora in corso/.test(m)).length === 2,
    'il secondo comando dice cosa e in corso',
  );
  fine('fatto');
  ok((await p1) === 'fatto' && T.pianoLungaOccupato() === '', 'finita la prima, il blocco si libera');
  await T.pianoLunga('Migliora la bozza', async () => {
    throw new Error('x');
  }).catch(() => {});
  ok(T.pianoLungaOccupato() === '', 'anche se l operazione va in errore il blocco si libera');

  console.log('D4 ASS come assenza del Diario');
  const righe = [
    { collaboratore: 'Balliu Bledar', data: '2027-06-16', codice: 'ASS', protetto: true },
    { collaboratore: 'Balliu Bledar', data: '2027-06-17', codice: 'S3', protetto: false, generato: true },
    { collaboratore: 'Rossi Anna', data: '2027-06-16', codice: 'M', protetto: true },
  ];
  const sv = T._pianoSvuotaCalcola(righe, '2027-06', 30, () => false);
  ok(
    sv.assenze.some((r) => r.codice === 'ASS') && !sv.aperte.some((r) => r.codice === 'ASS'),
    'Svuota TUTTE: la ASS resta (prima spariva e la registrazione restava)',
  );
  const v = T._pianoVersioneCalcola(
    [{ collaboratore: 'Balliu Bledar', data: '2027-06-16', codice: 'S3', protetto: false }],
    [righe[0]],
    { malattie: { 'Balliu Bledar|2027-06-16': true } },
  );
  ok(
    v.malattia.includes('Balliu Bledar|2027-06-16') && !v.rimetti.includes('Balliu Bledar|2027-06-16'),
    'Versioni: la ASS registrata nel Diario resta (prima tornava S3)',
  );
  const v2 = T._pianoVersioneCalcola(
    [{ collaboratore: 'Balliu Bledar', data: '2027-06-16', codice: 'ASS', protetto: true }],
    [{ collaboratore: 'Balliu Bledar', data: '2027-06-16', codice: 'S3', protetto: false }],
    { malattie: {} },
  );
  ok(v2.malattia.length === 1 && !v2.rimetti.length, 'Versioni: una ASS di allora non torna se il Diario non la ha');

  console.log('D5 sigla di un turno disattivato');
  T.setTurni([
    { id: 1, codice: '9', reparto_dip: 'slots', attivo: false, ora_inizio: '06:00', ora_fine: '14:00', durata_ore: 8 },
    {
      id: 2,
      codice: '9',
      reparto_dip: 'tavoli',
      attivo: true,
      ora_inizio: '21:00',
      ora_fine: '05:00',
      durata_ore: 8.6,
    },
    { id: 3, codice: 'S3', reparto_dip: 'slots', attivo: true, durata_ore: 8 },
    { id: 4, codice: 'R22', reparto_dip: 'slots', attivo: true, durata_ore: 8 },
  ]);
  const cella9 = { codice: '9', reparto_dip: 'slots' };
  ok(T._pianoSettoreTurno(cella9, 'slots') === 'slots', '«9» delle Slots disattivato: la cella resta delle Slots');
  ok(T._pianoSettoreTurno(cella9, 'tavoli') === 'slots', 'anche guardata dai Tavoli');
  ok(T._pianoTurnoInfoRiga(cella9).durata_ore === 8, 'ore e orario del 9 delle Slots (8 h, 06-14), non 21-05');
  ok(T._pianoTurnoInfo('9').ora_inizio === '06:00', 'sigla senza riga, settore Slots aperto: il 9 delle Slots');
  ok(
    T._pianoSettoreTurno({ codice: 'R22', reparto_dip: 'valet' }, 'valet') === 'slots',
    'R22 scritto dal Valet: resta un posto delle Slots (come prima)',
  );
  ok(T._pianoSettoreTurno({ codice: '9', reparto_dip: 'tavoli' }, 'slots') === 'tavoli', '9 dei Tavoli: dei Tavoli');

  console.log('D19 Tipo di una nuova vacanza');
  const sc = (codice, extra) => T._vacTipoScegliibile(Object.assign({ codice: codice, attivo: true }, extra || {}));
  ok(sc('MT') && sc('TR') && sc('PC') && sc('MI'), 'matrimonio, trasloco, protezione civile, militare: si');
  ok(
    !sc('M') && !sc('ASS') && !sc('ND') && !sc('JG') && !sc('WD') && !sc('CGF') && !sc('I'),
    'M, ASS, ND, JG, WD, CGF, I: no',
  );
  ok(!sc('CS', { richiede_orario: true }), 'corso con orario: no');
  ok(!sc('EV', { descrizione: 'Da definire (importato dai piani Excel)' }), 'sigla da definire: no');
  ok(!sc('TR', { attivo: false }), 'codice disattivato: no');

  console.log('D27-D29 Coerenza Diario/Piano');
  const giorniDi = (e) => e.giorni;
  const conf = T._coerenzaConfronta(
    [
      { collaboratore: 'Troncao Camilo', data: '2026-10-02', codice: 'M' },
      { collaboratore: 'Troncao Camilo', data: '2026-10-03', codice: 'M' },
      { collaboratore: 'Troncao Camilo', data: '2026-10-04', codice: 'M' },
      { collaboratore: 'Rossi Anna', data: '2026-10-05', codice: 'M' }, // registrata: coerente
      { collaboratore: 'Timonina Anna', data: '2026-10-14', codice: 'M' },
      { collaboratore: 'Timonina Anna', data: '2026-10-15', codice: 'C' }, // Diario malattia, piano C
      { collaboratore: 'Bianchi Ugo', data: '2026-10-20', codice: 'S3' }, // assenza sopra un turno
      { collaboratore: 'Bianchi Ugo', data: '2026-10-21', codice: 'C' }, // assenza su un riposo: ok
      { collaboratore: 'Verdi Ada', data: '2026-10-08', codice: 'ASS' }, // ASS senza registrazione
    ],
    [
      { id: 1, nome: 'Rossi Anna', tipo: 'Malattia', giorni: ['2026-10-05'] },
      { id: 2, nome: 'Timonina Anna', tipo: 'Malattia', giorni: ['2026-10-14', '2026-10-15'] },
      { id: 3, nome: 'Bianchi Ugo', tipo: 'Assenza', giorni: ['2026-10-20', '2026-10-21'] },
      { id: 4, nome: 'Neri Eva', tipo: 'Malattia', giorni: ['2026-12-03'] }, // mese non pianificato: no
      { id: 5, nome: 'Rossi Anna', tipo: 'Malattia', giorni: ['2026-10-06'], eliminato: true },
    ],
    { tipoMal: 'Malattia', tipoAss: 'Assenza', giorniDi: giorniDi, eTurno: (c) => /^S/.test(c), da: '2026-10-01' },
  );
  ok(
    conf.senzaDiario.length === 2 &&
      conf.senzaDiario[0].nome === 'Troncao Camilo' &&
      conf.senzaDiario[0].dal === '2026-10-02' &&
      conf.senzaDiario[0].al === '2026-10-04',
    'M senza registrazione: Troncao 2-4.10 in UN periodo, piu la ASS senza registrazione',
  );
  ok(
    conf.senzaPiano.length === 2 &&
      conf.senzaPiano.some((x) => x.nome === 'Timonina Anna' && x.giorni.length === 1 && x.giorni[0].cella === 'C') &&
      conf.senzaPiano.some((x) => x.nome === 'Bianchi Ugo' && x.ass && x.giorni.length === 1),
    'Diario senza piano: Timonina 15.10 (C), assenza di Bianchi solo sopra il turno; mese non pianificato no',
  );
  const cog = T._coerenzaCognomi(
    ['Nicole Marchitelli', 'Fusetti Nicoletta', 'Rossi Nicole', 'Azevedo Morais Marco Paulo', 'Di Tullio Ivano'],
    (n) => (n.startsWith('Di ') ? n.split(' ').slice(0, 2).join(' ') : n.split(' ')[0]),
    { 'Azevedo Morais Marco Paulo': 'Azevedo Morais' },
  );
  ok(
    cog.length === 1 && cog[0].nome === 'Nicole Marchitelli' && cog[0].proposte[0] === 'Marchitelli',
    'cognomi: Nicole Marchitelli al contrario (proposta MARCHITELLI); quelli gia decisi no',
  );
  const cog2 = T._coerenzaCognomi(['Troncao Camilo Hugo Miguel'], (n) => n.split(' ')[0], {});
  ok(
    cog2.length === 1 && cog2[0].proposte[0] === 'Troncao' && cog2[0].proposte.length === 3,
    'nome di 4 parole: si sceglie',
  );
  const ex = T._coerenzaExSenzaFine(
    [
      { id: 55, nome: 'Tonati Edoardo' },
      { id: 43, nome: 'Tonati' },
      { id: 9, nome: 'Senza Celle' },
      { id: 7, nome: 'Con Fine', data_fine_rapporto: '2026-05-31' },
    ],
    {
      'Tonati Edoardo': { ultimo: '2026-06-30', n: 181 },
      Tonati: { ultimo: '2026-06-30', n: 181 },
      'Con Fine': { ultimo: '2026-05-31', n: 3 },
    },
  );
  ok(
    ex.length === 2 && ex.every((x) => x.gemello) && ex[0].ultimo === '2026-06-30',
    'ex collaboratori: Tonati e Tonati Edoardo senza fine rapporto, segnalati come forse la stessa persona',
  );

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
