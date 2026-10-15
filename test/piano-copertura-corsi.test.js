/**
 * Regole nelle scritture del Piano che prima le saltavano (segnalazioni del titolare 15.10),
 * senza browser e senza database:
 *  - _pianoViolazioniMosse (js/piano-core.js): le violazioni NUOVE di piu celle insieme, con
 *    l orario scritto sulla cella (corso 14:30-17:30 dopo una notte che finisce alle 04:10),
 *    i giorni di fila, le violazioni gia presenti che non si ripetono, piu mosse della stessa
 *    persona viste insieme (scambio + restituzione il giorno dopo);
 *  - _corsoOrarioUnito (js/piano-briefing-ui.js): corso e turno nello stesso giorno,
 *    sovrapposti o no, orario unito anche oltre la mezzanotte;
 *  - note della copertura malattia (js/piano-cambi.js): "Ex C - copre Rossi (malattia)" e
 *    "Ex S7 - coperto da ...": la sigla di prima resta leggibile da _pianoSiglaSottoMalattia;
 *  - _pianoTurniScopertiMalattia: le M con un turno sotto che nessuno copre ancora.
 *   node test/piano-copertura-corsi.test.js
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
// turni del settore di prova: notte S7 19:50-04:10, presto L1 06:00-14:00, sera C0 11:40-20:00
const TURNI = {
  S7: { codice: 'S7', ora_inizio: '19:50', ora_fine: '04:10' },
  L1: { codice: 'L1', ora_inizio: '06:00', ora_fine: '14:00' },
  C0: { codice: 'C0', ora_inizio: '11:40', ora_fine: '20:00' },
};
const ctx = {
  window: {},
  console,
  Date,
  Set,
  Map,
  JSON,
  Promise,
  Math,
  String,
  parseInt,
  parseFloat,
  encodeURIComponent,
  letture: [],
};
ctx.dataLocaleISO = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
ctx._pianoTurnoInfo = (c) => TURNI[String(c || '').toUpperCase()] || null;
ctx._pianoTurnoDelGiorno = (t) => ({ ora_inizio: t.ora_inizio, ora_fine: t.ora_fine });
ctx._pianoIsLavoro = (c) => !!ctx._pianoTurnoInfo(c) || ['CS', 'JG'].includes(String(c || '').toUpperCase());
ctx._pianoUltimoGiorno = (ym) => new Date(parseInt(ym.slice(0, 4)), parseInt(ym.slice(5, 7)), 0).getDate();
ctx._pianoCtxViolazioni = (ym) => ({ ym: ym });
// MOTORE DI PROVA al posto di _pianoViolazioniPersona (quello vero vive in piano-genera.js e
// ha bisogno di tutto il programma): riposo minimo 11 ore fra due giorni di lavoro con gli
// orari VERI delle righe (stessa _pianoIntervalloLavoro del programma) e massimo 5 giorni di
// fila. Serve a provare cosa _pianoViolazioniMosse gli passa: righe, orari, giorni.
ctx._pianoViolazioniPersona = (nome, mese, sett) => {
  const out = [];
  const per = {};
  sett.forEach((r) => (per[String(r.data).substring(0, 10)] = r));
  const giorni = Object.keys(per).sort();
  const dopo = (d) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + 1);
    return ctx.dataLocaleISO(x);
  };
  let fila = 0;
  let prec = null;
  giorni.forEach((d) => {
    const r = per[d];
    if (!ctx._pianoIsLavoro(r.codice)) {
      fila = 0;
      prec = d;
      return;
    }
    fila = prec && dopo(prec) === d && fila ? fila + 1 : 1;
    if (fila > 5)
      out.push({
        nome,
        giorno: parseInt(d.slice(8)),
        msg: fila + ' giorni lavorativi consecutivi (max 5)',
        celle: [d],
      });
    const ieri = giorni.find((x) => dopo(x) === d);
    if (ieri && ctx._pianoIsLavoro(per[ieri].codice)) {
      const ore = vm.runInContext('_pianoRiposoOreTra', ctx)(per[ieri], r);
      if (ore != null && ore < 11)
        out.push({
          nome,
          giorno: parseInt(d.slice(8)),
          msg: 'solo ' + ore.toFixed(1) + 'h di riposo (min 11h)',
          celle: [d],
        });
    }
    prec = d;
  });
  return out.filter((v) => mese.some((r) => String(r.data).substring(0, 10) === v.celle[0]));
};
// "database": le righe di prova, filtrate per nome e periodo come farebbe PostgREST
let DB = [];
ctx.secGet = async (url) => {
  ctx.letture.push(url);
  const q = decodeURIComponent(url);
  const nomi = /collaboratore=in\.\(([^)]*)\)/.exec(q);
  const uno = /collaboratore=eq\.([^&]*)/.exec(q);
  const da = /data=gte\.([0-9-]+)/.exec(q);
  const a = /data=lte\.([0-9-]+)/.exec(q);
  const inDate = /data=in\.\(([^)]*)\)/.exec(q);
  return DB.filter(
    (r) =>
      (!nomi || nomi[1].split(',').includes(r.collaboratore)) &&
      (!uno || uno[1] === r.collaboratore) &&
      (!da || r.data >= da[1]) &&
      (!a || r.data <= a[1]) &&
      (!inDate || inDate[1].split(',').includes(r.data)),
  );
};
vm.createContext(ctx);
vm.runInContext(
  [
    estrai('piano-genera.js', ['_pianoOra', '_pianoIntervalloLavoro', '_pianoRiposoOreTra']),
    estrai('piano-core.js', ['_pianoViolazioniMosse', '_pianoSiglaSottoMalattia', '_pianoCodiceAssenteTurno']),
    estrai('piano-briefing-ui.js', ['_corsoOrarioUnito']),
    estrai('piano-cambi.js', [
      '_pianoNotaCopre',
      '_pianoCopreMalattiaDi',
      '_pianoTurniScopertiMalattia',
      '_pianoOpsTogliCopertura',
      '_pianoMalattieDaCoprire',
    ]),
    estrai('piano-core.js', ['_pianoAttesoDi']),
  ].join('\n'),
  ctx,
);
const riga = (nome, data, codice, extra) =>
  Object.assign({ collaboratore: nome, data: data, codice: codice }, extra || {});
const D = (g) => '2027-01-' + String(g).padStart(2, '0');

(async () => {
  console.log('_pianoViolazioniMosse · corso dopo una notte');
  // Rossi: S7 il 12 (finisce alle 04:10 del 13), il 13 libero
  DB = [riga('Rossi', D(12), 'S7'), riga('Rossi', D(13), 'C')];
  let v = await ctx._pianoViolazioniMosse([
    { nome: 'Rossi', data: D(13), codice: 'CS', ora_inizio: '14:30', ora_fine: '17:30' },
  ]);
  ok(
    v.Rossi && v.Rossi.some((x) => /10\.3h di riposo/.test(x.msg)),
    'corso 14:30 dopo S7 (04:10): 10.3 ore di riposo, violazione',
  );
  v = await ctx._pianoViolazioniMosse([
    { nome: 'Rossi', data: D(13), codice: 'CS', ora_inizio: '16:00', ora_fine: '19:00' },
  ]);
  ok(!v.Rossi, 'corso alle 16:00 dopo la stessa notte: 11.8 ore, nessuna violazione');
  // senza orario il corso non si puo misurare: nessun avviso inventato
  v = await ctx._pianoViolazioniMosse([{ nome: 'Rossi', data: D(13), codice: 'CS' }]);
  ok(!v.Rossi, 'corso senza orario: il riposo non si misura (nessun avviso inventato)');

  console.log('_pianoViolazioniMosse · giorni di fila e violazioni gia presenti');
  // Bianchi: L1 dal 8 al 12 (5 giorni), 13 libero
  DB = [8, 9, 10, 11, 12].map((g) => riga('Bianchi', D(g), 'L1')).concat([riga('Bianchi', D(13), 'C')]);
  v = await ctx._pianoViolazioniMosse([
    { nome: 'Bianchi', data: D(13), codice: 'CS', ora_inizio: '14:30', ora_fine: '17:30' },
  ]);
  ok(
    v.Bianchi && v.Bianchi.some((x) => /6 giorni lavorativi consecutivi/.test(x.msg)),
    'corso come 6o giorno di fila: violazione',
  );
  ok(v.Bianchi && v.Bianchi[0].data === D(13), 'la violazione porta il giorno della cella');
  // Verdi ha GIA 6 giorni di fila: un corso altrove nel mese non la ripete
  DB = [1, 2, 3, 4, 5, 6].map((g) => riga('Verdi', D(g), 'L1')).concat([riga('Verdi', D(20), 'C')]);
  v = await ctx._pianoViolazioniMosse([
    { nome: 'Verdi', data: D(20), codice: 'CS', ora_inizio: '09:00', ora_fine: '12:00' },
  ]);
  ok(!v.Verdi, 'violazione gia presente nel piano: non e nuova, non si ripete');

  console.log('_pianoViolazioniMosse · piu celle della stessa persona insieme');
  // scambio il 14 (prende S7) e restituzione il 15 (prende L1 alle 06:00): 1.8 ore di riposo
  DB = [riga('Neri', D(14), 'C'), riga('Neri', D(15), 'C'), riga('Gialli', D(14), 'S7'), riga('Gialli', D(15), 'L1')];
  v = await ctx._pianoViolazioniMosse([
    { nome: 'Neri', data: D(14), codice: 'S7' },
    { nome: 'Gialli', data: D(14), codice: 'C' },
    { nome: 'Neri', data: D(15), codice: 'L1' },
    { nome: 'Gialli', data: D(15), codice: 'C' },
  ]);
  ok(
    v.Neri && v.Neri.some((x) => /1\.8h di riposo/.test(x.msg)),
    'scambio + restituzione il giorno dopo: il riposo fra i due si vede',
  );
  ok(!v.Gialli, 'chi va a riposo nei due giorni non ha violazioni');
  // ogni persona letta una volta: una lettura per tutti
  ctx.letture = [];
  await ctx._pianoViolazioniMosse([
    { nome: 'Neri', data: D(14), codice: 'S7' },
    { nome: 'Gialli', data: D(14), codice: 'C' },
  ]);
  ok(ctx.letture.length === 1, 'una sola lettura del piano per tutte le persone');
  // cella svuotata (codice '')
  DB = [riga('Blu', D(10), 'S7'), riga('Blu', D(11), 'L1')];
  v = await ctx._pianoViolazioniMosse([{ nome: 'Blu', data: D(11), codice: '' }]);
  ok(!v.Blu, 'cella svuotata: tolta dalla simulazione (nessuna violazione nuova)');

  console.log('_corsoOrarioUnito');
  let u = ctx._corsoOrarioUnito(TURNI.C0, null, D(13), '14:30', '17:30');
  ok(u.sovrapposto === true, 'corso 14:30-17:30 dentro C0 11:40-20:00: sovrapposto');
  u = ctx._corsoOrarioUnito(TURNI.C0, null, D(13), '08:00', '10:00');
  ok(
    !u.sovrapposto && u.ora_inizio === '08:00' && u.ora_fine === '20:00',
    'corso 08-10 e poi C0: giorno unito 08:00-20:00',
  );
  u = ctx._corsoOrarioUnito(TURNI.S7, null, D(13), '14:30', '17:30');
  ok(!u.sovrapposto && u.ora_inizio === '14:30' && u.ora_fine === '04:10', 'corso e poi la notte S7: 14:30-04:10');
  u = ctx._corsoOrarioUnito(
    TURNI.L1,
    riga('X', D(13), 'L1', { ora_inizio: '07:00', ora_fine: '15:00' }),
    D(13),
    '14:30',
    '17:30',
  );
  ok(u.sovrapposto === true, 'orario scritto sulla cella (07-15) vale piu di quello del turno');

  console.log('note della copertura malattia');
  const nSost = ctx._pianoNotaCopre('C', 'Rossi Mario', false, 'Admin');
  ok(nSost === 'Ex C - copre Rossi Mario (malattia) - Admin', 'nota del sostituto: ' + nSost);
  ok(ctx._pianoCopreMalattiaDi({ commento: nSost }, 'Rossi Mario'), 'la nota dice chi copre chi');
  ok(!ctx._pianoCopreMalattiaDi({ commento: nSost }, 'Rossi'), 'nome diverso (piu corto): non coperto');
  ok(ctx._pianoNotaCopre('S5', 'Bianchi', true, 'Op').includes('(non disponibile)'), 'ND: "(non disponibile)"');
  ok(
    ctx._pianoSiglaSottoMalattia({ commento: 'Ex S7 - coperto da Verdi Anna - Admin' }) === 'S7',
    'il malato tiene la sigla di prima in testa (togliendo la M torna S7)',
  );

  console.log('_pianoTurniScopertiMalattia');
  DB = [
    riga('Rossi Mario', D(5), 'M', { commento: 'Ex S7 - Admin' }),
    riga('Rossi Mario', D(6), 'M', { commento: 'Ex C - Admin' }),
    riga('Rossi Mario', D(7), 'M', { commento: 'Ex L1 - Admin' }),
    riga('Rossi Mario', D(8), 'M', { commento: null }),
    riga('Verdi Anna', D(7), 'L1', { commento: nSost }),
  ];
  const sc = await ctx._pianoTurniScopertiMalattia('Rossi Mario', D(1), D(31));
  ok(
    sc.length === 1 && sc[0].data === D(5) && sc[0].codice === 'S7',
    'scoperto solo il 5 (S7): il 6 era C, il 7 e coperto, l 8 senza nota',
  );

  console.log('ASS (assenza in attesa di certificato): turno scoperto come la M');
  DB = [
    riga('Rossi Mario', D(11), 'ASS', { commento: 'Ex S7 - Admin' }),
    riga('Rossi Mario', D(12), 'ASS', { commento: 'Ex S7 - coperto da Verdi Anna - Admin' }),
    riga('Verdi Anna', D(12), 'S7', { commento: ctx._pianoNotaCopre('C', 'Rossi Mario', 'ASS', 'Admin') }),
  ];
  const scA = await ctx._pianoTurniScopertiMalattia('Rossi Mario', D(1), D(31));
  ok(scA.length === 1 && scA[0].data === D(11) && scA[0].ass === true, 'ASS: scoperto solo l 11 (il 12 e coperto)');
  ok(
    ctx._pianoNotaCopre('C', 'Rossi Mario', 'ASS', 'Admin') === 'Ex C - copre Rossi Mario (assenza) - Admin',
    'nota del sostituto per un ASS: "(assenza)"',
  );
  ok(
    ctx._pianoCodiceAssenteTurno('ASS') && ctx._pianoCodiceAssenteTurno('M') && !ctx._pianoCodiceAssenteTurno('C'),
    'ASS, M e M1 lasciano il turno scoperto; C no',
  );

  console.log('_pianoOpsTogliCopertura (malattia tolta che un collega copriva)');
  ctx.getOperatore = () => 'Admin';
  ctx.getOpToken = () => 'tk';
  let storico = [];
  ctx._rpcSicura = async () => storico;
  const notaB = ctx._pianoNotaCopre('C', 'Rossi Mario', false, 'Admin');
  // 1) com era salvato dalla copertura (prima_malattia): torna esatto (bozza, non protetta)
  DB = [
    riga('Rossi Mario', D(5), 'M', { commento: 'Ex S7 - coperto da Bianchi Anna - Admin' }),
    riga('Bianchi Anna', D(5), 'S7', {
      commento: notaB,
      protetto: true,
      prima_malattia: { codice: 'C', protetto: false, generato: true, commento: null, motivo_blocco: null },
    }),
    // mossa a catena del giorno prima
    riga('Verdi Anna', D(4), 'L1', {
      commento: 'Ex C0 - cambio per esigenze operative (copertura di Rossi Mario) - Admin',
      protetto: true,
    }),
    riga('Neri Ugo', D(5), 'S7', { commento: 'Ex C - copre Altro Nome (malattia) - Admin' }),
  ];
  let cop = await ctx._pianoOpsTogliCopertura('Rossi Mario', [D(5)]);
  const opB = cop.ops.find((o) => o.collaboratore === 'Bianchi Anna');
  ok(
    opB && opB.dati.codice === 'C' && opB.dati.generato === true && opB.dati.protetto === false,
    'sostituto: torna C com era (bozza, non protetta)',
  );
  ok(opB && opB.atteso && opB.atteso.codice === 'S7', 'scrittura condizionata: la cella deve essere ancora S7');
  const opV = cop.ops.find((o) => o.collaboratore === 'Verdi Anna');
  ok(opV && opV.data === D(4) && opV.dati.codice === 'C0', 'mossa a catena del giorno prima: torna C0 (dalla nota)');
  ok(
    !cop.ops.some((o) => o.collaboratore === 'Neri Ugo' || o.collaboratore === 'Rossi Mario'),
    'chi copre un altro malato e il malato non si toccano',
  );
  // 2) senza prima_malattia: lo storico (la scrittura che ha messo la nota; da vuota = cancella)
  DB = [riga('Bianchi Anna', D(5), 'S7', { commento: notaB })];
  storico = [{ a: 'S7', da: null, commento: notaB }];
  cop = await ctx._pianoOpsTogliCopertura('Rossi Mario', [D(5)]);
  ok(cop.ops.length === 1 && cop.ops[0].dati === null, 'dallo storico: la cella era vuota, si cancella');
  // 3) niente storico: la nota «Ex C»
  storico = [];
  cop = await ctx._pianoOpsTogliCopertura('Rossi Mario', [D(5)]);
  ok(cop.ops[0].dati && cop.ops[0].dati.codice === 'C', 'senza storico: la sigla della nota «Ex C»');

  console.log('_pianoMalattieDaCoprire (Piano › Avvisi)');
  ctx._pianoRighe = [
    riga('Rossi Mario', D(5), 'M', { commento: 'Ex S7 - Admin' }),
    riga('Rossi Mario', D(6), 'M', { commento: 'Ex L1 - coperto da Bianchi Anna - Admin' }),
    riga('Bianchi Anna', D(6), 'L1', { commento: notaB }),
    riga('Rossi Mario', D(7), 'M', { commento: 'Ex C - Admin' }),
  ];
  vm.runInContext('var _pianoRighe = this._pianoRighe', ctx);
  const dc = ctx._pianoMalattieDaCoprire();
  ok(
    dc.length === 1 && dc[0].data === D(5) && dc[0].codice === 'S7',
    'da coprire solo il 5 (S7): il 6 e coperto, il 7 era C',
  );

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
