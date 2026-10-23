/**
 * Controllo QA D (23/10/2026), difetti di gestione e configurazione del Piano, senza browser e
 * senza database:
 *  - D7  _pianoOreAnalizza (piano-gestione.js): "1:30" = 1.5, "1.30" e ambiguo (si chiede 1h30 o
 *        1,3 h), "2abc" e "abc" rifiutati con «scrivi 1:30 o 1.5» (prima 2abc = 2 h);
 *  - D17 _pianoSceltaDataDaTesto (piano-scelte.js): 31.02 rifiutato con un messaggio nostro, il
 *        futuro rifiutato prima del database; i messaggi del database con gli accenti;
 *  - D18 _pianoValidaRegola (piano-config.js): ass_giorni_regolarizzare -2 rifiutato, nessun
 *        numero negativo fuori dai limiti, testo non numerico ("2abc") rifiutato;
 *  - D24 _pianoConfermaSpegniLegge: spegnere una regola di legge chiede conferma, le altre no;
 *  - D25 _pianoBloccatiNormalizza (piano-impostazioni.js): "s8 s7c" -> "S8,S7C", sigle
 *        inesistenti elencate;
 *  - D23 _pianoFabbisognoCopiaScrivi: errore a meta -> righe gia scritte tolte, errore a chi chiama.
 *   node test/piano-qa-d-gestione.test.js
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
        const e = src.slice(m.index).search(/\n[\]}]\);?|\n[\]}];/);
        return src.substring(m.index, m.index + e + 3).replace(/\n\]\)$/, '\n]);');
      }
      return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
    })
    .join('\n');
}
const ctx = { console, Date, Set, Map, JSON, Promise, Object, Array, String, Math, parseFloat, parseInt, isNaN };
vm.createContext(ctx);
vm.runInContext(
  [
    estrai('piano-gestione.js', ['_pianoOreAnalizza', '_pianoOreDaTesto', '_pianoOreHmm']),
    estrai('piano-scelte.js', ['_pianoSceltaDataDaTesto', '_pianoSceltaTestoErrore']),
    estrai('piano-config.js', [
      'PIANO_REGOLE_LEGGE',
      'PIANO_REGOLE_GUIDA',
      'PIANO_REGOLE_LIMITI',
      '_pianoContestoSettore',
      '_pianoValidaRegolaSettore',
      '_pianoValidaRegola',
      '_pianoConfermaSpegniLegge',
      '_pianoFabbisognoCopiaScrivi',
      '_pianoFabbisognoCopiaScriviVecchio',
    ]),
    estrai('piano-impostazioni.js', ['_pianoBloccatiNormalizza']),
    'var pianoTurniCache = [], collaboratoriCache = [];',
    'function _repartoDi(x) { return x.reparto_dip || "slots"; }',
    'function repartoLabel(x) { return x; }',
    'function _pianoFunzioniTutte() { return []; }',
    'function pianoRegolaFonte() { return "LL art. 15a"; }',
    'var chiesto = []; function chiediConferma(t, o) { chiesto.push({ t: t, o: o }); return Promise.resolve(false); }',
    'function logAzione() {}',
    'this.T = { _pianoOreAnalizza, _pianoOreDaTesto, _pianoOreHmm, _pianoSceltaDataDaTesto, _pianoSceltaTestoErrore, _pianoValidaRegola, _pianoConfermaSpegniLegge, _pianoBloccatiNormalizza, _pianoFabbisognoCopiaScrivi, _pianoFabbisognoCopiaScriviVecchio, chiesto: () => chiesto };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;

console.log('== D7 ore del recupero ==');
const A = T._pianoOreAnalizza;
ok(A('1:30').ore === 1.5 && !A('1:30').dubbio, '1:30 = 1.5 senza domande');
ok(A('-1:30').ore === -1.5, '-1:30 = -1.5');
ok(A('1h30').ore === 1.5, '1h30 = 1.5');
ok(A('1,5').ore === 1.5 && A('1.5').ore === 1.5 && !A('1.5').dubbio, '1,5 e 1.5 = 1.5');
ok(A('2').ore === 2 && A('-1').ore === -1, 'interi');
const d130 = A('1.30');
ok(d130.dubbio && d130.dubbio.orologio === 1.5 && d130.dubbio.decimale === 1.3, '1.30: si chiede 1h30 o 1,3 h');
ok(A('1,45').dubbio && A('1,45').dubbio.orologio === 1.75, '1,45: 1h45 proposto');
ok(!A('1.00').dubbio && A('1.00').ore === 1, '1.00 senza domande');
ok(!!A('1.75').dubbio === false, '1.75: non sono minuti, nessuna domanda');
ok(/1:30 .*1\.5/.test(A('2abc').errore || ''), '2abc rifiutato con «scrivi 1:30 o 1.5»');
ok(!!A('abc').errore && !!A('-').errore && !!A('1:75').errore, 'abc, -, 1:75 rifiutati');
ok(A('').vuoto && A('  ').vuoto, 'campo vuoto = togli');
ok(
  T._pianoOreDaTesto('2abc') === 'NaN' && T._pianoOreDaTesto('') === '' && T._pianoOreDaTesto('1:30') === '1.5',
  '_pianoOreDaTesto compatibile',
);
ok(T._pianoOreHmm(1.3) === '1h18' && T._pianoOreHmm(-1.5) === '-1h30', '1,3 h = 1h18');

console.log('== D17 data «valida dal» ==');
const S = T._pianoSceltaDataDaTesto;
ok(/non esiste/.test(S('31.02.2026', '2026-10-23').errore || ''), '31.02.2026 rifiutata (non esiste)');
ok(/non esiste/.test(S('00.10.2026', '2026-10-23').errore || ''), '00.10 rifiutata');
ok(/futuro/.test(S('24.10.2026', '2026-10-23').errore || ''), 'domani rifiutata con «può» accentato');
ok(/può/.test(S('24.10.2026', '2026-10-23').errore), 'accento su può');
ok(S('1.9.2026', '2026-10-23').iso === '2026-09-01', '1.9.2026 -> 2026-09-01');
ok(S('29.02.2024', '2026-10-23').iso === '2024-02-29', '29.02 di un anno bisestile');
ok(/GG\.MM\.AAAA/.test(S('ieri', '2026-10-23').errore), 'testo libero: formato spiegato');
ok(
  T._pianoSceltaTestoErrore('La data non puo essere nel futuro') === 'La data non può essere nel futuro',
  'messaggio del database con accento',
);
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'piano-scelte.js'), 'utf8');
ok(
  /\[n\.titolo, modifica \? 'clic per cambiare la data di inizio' : ''\]\.filter\(Boolean\)\.join\(' · '\)/.test(
    src.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/\[ /g, '[').replace(/ \]/g, ']'),
  ),
  'tooltip senza « · » iniziale',
);

console.log('== D18 regole numeriche ==');
const V = T._pianoValidaRegola;
ok(/fuori scala/.test(V('ass_giorni_regolarizzare', '-2', '') || ''), 'ass_giorni_regolarizzare -2 rifiutato');
ok(V('ass_giorni_regolarizzare', '3', '') === null, 'ass_giorni_regolarizzare 3 accettato');
ok(/Serve un numero/.test(V('min_riposo_ore', '11abc', '') || ''), '11abc rifiutato (prima parseFloat = 11)');
ok(
  V('min_riposo_ore', '11', '') === null && V('saldo_ore_min', '-20', '') === null,
  'valori validi, negativo dove previsto',
);
ok(/fuori scala/.test(V('c_dopo_100', '-1', '') || ''), 'c_dopo_100 -1 rifiutato');

console.log('== D24 regola di legge ==');
(async () => {
  const r1 = await T._pianoConfermaSpegniLegge('min_riposo_ore');
  ok(
    r1 === false && T.chiesto().length === 1 && /norma di legge/.test(T.chiesto()[0].t),
    'riposo 11 ore: conferma con «norma di legge», Annulla = resta accesa',
  );
  const r2 = await T._pianoConfermaSpegniLegge('c_dopo_100');
  ok(r2 === true && T.chiesto().length === 1, 'regola non di legge: nessuna domanda');

  console.log('== D25 turni bloccati ==');
  const b = T._pianoBloccatiNormalizza(' s8  s7c;S8 ', ['S8', 'S7C', 'R22']);
  ok(b.testo === 'S8,S7C' && !b.ignote.length, '"s8 s7c;S8" -> "S8,S7C"');
  const b2 = T._pianoBloccatiNormalizza('S88, R22', ['S8', 'R22']);
  ok(b2.ignote.join() === 'S88', 'S88 inesistente segnalata');

  // strada di prima (database senza piano_fabbisogno_copia): righe tolte di nuovo se qualcosa
  // non riesce. La scrittura atomica e in test/scritture-atomiche.test.js
  console.log('== D23 copia del fabbisogno tutto o niente (database senza la migrazione 20260930_b) ==');
  const db = [];
  let n = 0;
  ctx.secPost = async (t, f) => {
    n++;
    if (n === 14) throw new Error('rete caduta');
    const r = Object.assign({ id: 1000 + n }, f);
    db.push(r);
    return [r];
  };
  ctx.secDel = async (t, filtro) => {
    const ids = filtro.replace('id=in.(', '').replace(')', '').split(',').map(Number);
    for (let i = db.length - 1; i >= 0; i--) if (ids.includes(db[i].id)) db.splice(i, 1);
  };
  const nuovi = Array.from({ length: 25 }, (_, i) => ({
    data: '2027-07-' + String(i + 1).padStart(2, '0'),
    turno_codice: 'S1',
    quantita: 1,
    reparto_dip: 'slots',
  }));
  let err = null;
  try {
    await T._pianoFabbisognoCopiaScriviVecchio({ nuovi: nuovi, ymPrec: '2027-06' }, '2027-07');
  } catch (e) {
    err = e;
  }
  ok(err && /rete caduta/.test(err.message) && /come prima/.test(err.message), 'errore a meta: arriva a chi chiama');
  ok(db.length === 0, 'nessuna cella rimasta (prima 19 su 25)');
  n = -100;
  db.length = 0;
  const tot = await T._pianoFabbisognoCopiaScriviVecchio({ nuovi: nuovi, ymPrec: '2027-06' }, '2027-07');
  ok(tot === 25 && db.length === 25, 'senza errori: 25 celle');

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
