/**
 * OPERAZIONI LUNGHE CON LA PAGINA NASCOSTA (02/11/2026)
 *  - pianoCedi (js/utils.js): la pausa fra un pezzo di calcolo e l altro passa da un
 *    MessageChannel (nessun freno di Chrome a pagina nascosta o PC bloccato), in ordine,
 *    senza tenere vivo il processo; senza MessageChannel torna a setTimeout(0);
 *  - nei file del calcolo (bozza, blocchi, Migliora, Prepara piu mesi, analisi dei posti
 *    scoperti, proposte della Formazione) non resta nessuna pausa con setTimeout(0);
 *  - _pianoSveglia (js/piano-core.js): schermo acceso solo mentre un operazione lunga e in
 *    corso e la pagina e visibile, una sola richiesta, rilasciato alla fine; se il browser
 *    rifiuta si continua senza errori;
 *  - pianoOrologio (js/utils.js): a pagina nascosta il tempo conta il lavoro al ritmo della
 *    pagina visibile, cosi freni e durate danno lo stesso lavoro (Migliora: stesse iterazioni).
 *   node test/pausa-nascosta.test.js
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
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
function estrai(src, nome) {
  const m = new RegExp('^(?:async )?function ' + nome + '\\(', 'm').exec(src);
  if (!m) throw new Error(nome + ' non trovata');
  return src.substring(m.index, src.indexOf('\n}', m.index) + 2);
}

(async () => {
  const utils = leggi('utils.js');
  const cedi = estrai(utils, 'pianoCedi');

  // 1) con MessageChannel (come nel browser): risolve, in ordine, il processo non resta appeso
  const ctx1 = { MessageChannel, setTimeout, Promise };
  vm.createContext(ctx1);
  vm.runInContext('let _cediCanale = null; const _cediCoda = [];\n' + cedi + '\nthis.pianoCedi = pianoCedi;', ctx1);
  const ordine = [];
  await Promise.all([1, 2, 3].map((i) => ctx1.pianoCedi().then(() => ordine.push(i))));
  ok(ordine.join(',') === '1,2,3', 'pause risolte nell ordine in cui sono chieste (' + ordine.join(',') + ')');
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) await ctx1.pianoCedi();
  ok(Date.now() - t0 < 2000, '2000 pause di fila senza attese di timer (' + (Date.now() - t0) + ' ms)');
  let usatoTimer = 0;
  const ctx1b = { MessageChannel, setTimeout: (f, ms) => (usatoTimer++, setTimeout(f, ms)), Promise };
  vm.createContext(ctx1b);
  vm.runInContext('let _cediCanale = null; const _cediCoda = [];\n' + cedi + '\nthis.pianoCedi = pianoCedi;', ctx1b);
  await ctx1b.pianoCedi();
  ok(usatoTimer === 0, 'con MessageChannel nessun setTimeout (il freno di Chrome vale per i timer)');

  // 2) senza MessageChannel (browser molto vecchio): setTimeout(0)
  let ms = null;
  const ctx2 = { setTimeout: (f, m) => ((ms = m), setTimeout(f, 0)), Promise };
  vm.createContext(ctx2);
  vm.runInContext('let _cediCanale = null; const _cediCoda = [];\n' + cedi + '\nthis.pianoCedi = pianoCedi;', ctx2);
  await ctx2.pianoCedi();
  ok(ms === 0, 'senza MessageChannel si usa setTimeout(0)');

  // 3) nessuna pausa con setTimeout(0) nei file del calcolo
  const file = [
    'piano-genera.js',
    'piano-blocchi.js',
    'piano-ricerca-ui.js',
    'piano-mesi.js',
    'piano-extra.js',
    'piano-formazioni.js',
  ];
  const resti = [];
  file.forEach((f) =>
    leggi(f)
      .split('\n')
      .forEach((r, i) => {
        if (/new Promise\(\((\w+)\) => setTimeout\(\1, 0\)\)/.test(r)) resti.push(f + ':' + (i + 1));
      }),
  );
  ok(!resti.length, 'nessuna pausa setTimeout(0) nel calcolo' + (resti.length ? ': ' + resti.join(' ') : ''));
  ok(
    file.every((f) => leggi(f).includes('pianoCedi()')),
    'ogni file del calcolo usa pianoCedi',
  );

  // 4) schermo acceso durante le operazioni lunghe
  const core = leggi('piano-core.js');
  const richieste = [];
  let rifiuta = false;
  const ascoltatori = {};
  const doc = { visibilityState: 'visible', body: { classList: { add() {}, remove() {} } } };
  const ctx4 = {
    window: {},
    document: doc,
    navigator: {
      wakeLock: {
        request: async (tipo) => {
          if (rifiuta) throw new Error('NotAllowedError');
          const l = {
            tipo,
            rilasciato: false,
            release: async () => {
              l.rilasciato = true;
              (ascoltatori.release || []).forEach((f) => f());
            },
            addEventListener: (ev, f) => (ascoltatori[ev] = (ascoltatori[ev] || []).concat(f)),
          };
          richieste.push(l);
          return l;
        },
      },
    },
    toastErrore() {},
    Promise,
  };
  vm.createContext(ctx4);
  vm.runInContext(
    'let _pianoLungaInCorso = null; let _pianoSvegliaLock = null; let _pianoSvegliaRichiesta = null;\n' +
      estrai(core, 'pianoLungaOccupato') +
      '\n' +
      estrai(core, 'pianoLunga') +
      '\n' +
      estrai(core, '_pianoSveglia') +
      '\nthis.T = { pianoLunga, _pianoSveglia, lock: () => _pianoSvegliaLock };',
    ctx4,
  );
  const T = ctx4.T;
  const pausa = () => new Promise((r) => setTimeout(r, 5));
  let dentro = null;
  await T.pianoLunga('Prepara il mese', async () => {
    await pausa();
    dentro = T.lock();
    await T._pianoSveglia(); // una seconda chiamata (pagina tornata visibile) non chiede di nuovo
  });
  ok(richieste.length === 1 && richieste[0].tipo === 'screen', 'una sola richiesta di schermo acceso');
  ok(dentro === richieste[0], 'schermo acceso durante l operazione');
  await pausa();
  ok(richieste[0].rilasciato && !T.lock(), 'alla fine lo schermo torna normale');

  doc.visibilityState = 'hidden';
  await T.pianoLunga('Migliora la bozza', async () => {
    await pausa();
  });
  ok(richieste.length === 1, 'a pagina nascosta non si chiede (il browser non lo concede)');

  doc.visibilityState = 'visible';
  rifiuta = true;
  let errore = null;
  try {
    await T.pianoLunga('Prepara il mese', async () => {
      await pausa();
      return 'fatto';
    });
  } catch (e) {
    errore = e;
  }
  ok(!errore && !T.lock(), 'se il browser rifiuta si continua senza errori');

  // 5) orologio di lavoro: a pagina nascosta conta il lavoro al ritmo della pagina visibile
  const orol = estrai(utils, 'pianoPaginaNascosta') + '\n' + estrai(utils, 'pianoOrologio');
  let ora = 1000;
  const doc5 = { visibilityState: 'visible' };
  const ctx5 = { Date: { now: () => ora }, document: doc5 };
  vm.createContext(ctx5);
  vm.runInContext(orol + '\nthis.pianoOrologio = pianoOrologio;', ctx5);
  const o = ctx5.pianoOrologio();
  ora += 100;
  let tm = o.passo(1000); // visibile: 1000 di lavoro in 100 ms
  ok(tm === 100, 'visibile: conta il tempo reale (' + tm + ')');
  doc5.visibilityState = 'hidden';
  ora += 2000; // nascosta: lo stesso lavoro ci mette 20 volte tanto
  tm = o.passo(1000);
  ok(tm === 200, 'nascosta: 1000 di lavoro valgono 100 ms come a pagina visibile (' + tm + ')');
  ok(o.nascosto() === 2000, 'tempo reale a pagina nascosta tenuto a parte (' + o.nascosto() + ')');
  doc5.visibilityState = 'visible';
  ora += 50;
  tm = o.passo(500);
  ok(tm === 250, 'tornata visibile: di nuovo il tempo reale (' + tm + ')');
  // partita gia nascosta: nessun ritmo misurato, conta il tempo reale (come prima)
  doc5.visibilityState = 'hidden';
  const o2 = ctx5.pianoOrologio();
  ora += 700;
  tm = o2.passo(10);
  ok(tm === 700, 'partita nascosta senza ritmo: tempo reale (' + tm + ')');
  // una ricerca a numero fisso di iterazioni con il freno: visibile e nascosta fanno le stesse
  const giri = (lento) => {
    doc5.visibilityState = 'visible';
    const oo = ctx5.pianoOrologio();
    let fatte = 0;
    const freno = 2 * 60000;
    const tot = 42000;
    while (fatte < tot) {
      if (oo.passo(0) > freno) break;
      if (fatte === 2000 && lento) doc5.visibilityState = 'hidden'; // PC bloccato dopo poco
      ora += doc5.visibilityState === 'hidden' ? 25 * 20 : 25; // 25 iterazioni = 25 ms (x20 nascosta)
      oo.passo(25);
      fatte += 25;
    }
    return fatte;
  };
  const gv = giri(false);
  const gn = giri(true);
  ok(gv === 42000 && gn === 42000, 'Migliora: stesse iterazioni visibile ' + gv + ' e con il PC bloccato ' + gn);

  console.log(passati + ' passati, ' + falliti + ' falliti');
  process.exitCode = falliti ? 1 : 0;
})();
