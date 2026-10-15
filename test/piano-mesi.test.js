/**
 * PREPARA PIÙ MESI (js/piano-mesi.js) e copia del fabbisogno (js/piano-config.js), senza
 * browser e senza database (un database finto in memoria):
 *  - copia del fabbisogno per tipo di giornata: venerdi su venerdi, festivi come la
 *    domenica, vigilie come il sabato, celle gia impostate lasciate, mese prima vuoto;
 *  - sequenza: per ogni mese fabbisogno (copiato se manca, dal mese appena copiato),
 *    poi bozza, poi Migliora; il mese dopo parte quando il precedente e scritto, con le
 *    cache azzerate; mesi saltati; Ferma alla fine del mese in corso;
 *  - un passo di Annulla per mese (bozza e Migliora uniti), la pila di 15 passi intatta;
 *  - controllo del bordo: la fine del mese prima letta dalla bozza = quella scritta.
 *   node test/piano-mesi.test.js
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
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n + ' (' + JSON.stringify(a) + ')');

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

// ------------------------------------------------------------------ database finto
function creaDb() {
  const db = { piano: [], piano_fabbisogni: [], id: 1, letture: [] };
  const filtri = (q) => {
    const [tab, qs] = q.split('?');
    const f = [];
    (qs || '').split('&').forEach((p) => {
      const i = p.indexOf('=');
      if (i > 0) f.push([p.slice(0, i), p.slice(i + 1)]);
    });
    return { tab, f };
  };
  const passa = (r, f) =>
    f.every(([k, v]) => {
      if (['select', 'limit', 'order'].includes(k)) return true;
      const x = r[k] == null ? null : String(r[k]);
      const [op, ...resto] = v.split('.');
      const val = resto.join('.');
      if (op === 'eq') return x === val || (val === 'true' && r[k] === true) || (val === 'false' && r[k] === false);
      if (op === 'gte') return x >= val;
      if (op === 'lte') return x <= val;
      if (op === 'lt') return x < val;
      if (op === 'is') return val === 'null' ? r[k] == null : String(r[k]) === val;
      if (op === 'in') return val.replace(/[()]/g, '').split(',').map(decodeURIComponent).includes(String(r[k]));
      throw new Error('operatore ' + op);
    });
  db.get = (q) => {
    const { tab, f } = filtri(q);
    db.letture.push(q);
    return db[tab].filter((r) => passa(r, f)).map((r) => Object.assign({}, r));
  };
  db.del = (tab, q) => {
    const { f } = filtri(tab + '?' + q);
    db[tab] = db[tab].filter((r) => !passa(r, f));
  };
  db.post = (tab, r) => db[tab].push(Object.assign({ id: db.id++ }, r));
  return db;
}

// ------------------------------------------------------------------ contesto
function creaCtx(db, log) {
  const ctx = {
    window: { _pianoUndo: [], _pianoRedo: [], _pianoSessSnap: {} },
    console: { warn() {}, error() {}, log() {} },
    Date,
    Set,
    Map,
    JSON,
    Math,
    Promise,
    String,
    Object,
    parseInt,
    parseFloat,
    setTimeout: (f) => f(),
    MESI_FULL: [
      'Gennaio',
      'Febbraio',
      'Marzo',
      'Aprile',
      'Maggio',
      'Giugno',
      'Luglio',
      'Agosto',
      'Settembre',
      'Ottobre',
      'Novembre',
      'Dicembre',
    ],
    pianoFestiviCache: [{ data: '2027-01-01' }, { data: '2027-01-06' }, { data: '2026-12-25' }],
    log: log,
    db: db,
  };
  ctx.secGet = async (q) => db.get(q);
  ctx.secDel = async (tab, q) => db.del(tab, q);
  ctx.secPost = async (tab, r) => db.post(tab, r);
  ctx.logAzione = () => {};
  ctx.dataLocaleISO = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  vm.createContext(ctx);
  return ctx;
}
const BASE = `
let _pianoMeseSel = '2027-01';
let _pianoRepartoSel = null;
let _pianoRighe = [];
let _pianoViolCelle = {};
let _pianoViolLista = null;
let _pianoYtdKey = 'vecchia';
let _pianoOreMeseKey = 'vecchia';
let _pianoOraScarto = 0;
const _pianoDomAnnoCache = {};
function _pianoUltimoGiorno(ym) { const p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
function _pianoGiornoScrivibile(d) { return !(window._chiusi || []).includes(d.substring(0, 7)); }
async function _pianoCaricaFestivita() {}
async function _pianoCaricaCfg() {}
function _pianoChiusuraGiorno(d) { return (window._vigilie || []).includes(d) ? { marcatore: true } : null; }
function puoAzioniAutoPiano() { return true; }
function _repartoDi(r) { return (r && r.reparto_dip) || 'slots'; }
function _pianoReparto() { return _pianoRepartoSel || 'slots'; }
function _pianoOraServer() { window._ora = (window._ora || 1000) + 1000; return new Date(window._ora).toISOString(); }
function _pianoCalibraOra() {}
function _pianoSalvatoFlash() {}
async function _pianoOperazione(fn) { return fn(); }
// righe del mese e bordo (7 giorni prima e dopo), come _pianoCaricaMeseSettore
async function _pianoCaricaMeseSettore(da, a, rep) {
  const d0 = new Date(da + 'T12:00:00'); d0.setDate(d0.getDate() - 7);
  const d1 = new Date(a + 'T12:00:00'); d1.setDate(d1.getDate() + 7);
  const dalB = dataLocaleISO(d0), alB = dataLocaleISO(d1);
  window._pianoRigheBordo = (window._bordoFinto || db.piano).filter((r) => r.reparto_dip === rep && ((r.data >= dalB && r.data < da) || (r.data > a && r.data <= alB)));
  return db.piano.filter((r) => r.reparto_dip === rep && r.data >= da && r.data <= a);
}
`;
function caricaMesi(ctx) {
  vm.runInContext(BASE, ctx);
  vm.runInContext(
    estrai('piano-config.js', ['_pianoProfiloGiorno', '_pianoFabbisognoCopiaCalcola', '_pianoFabbisognoCopiaScrivi']),
    ctx,
  );
  vm.runInContext(
    estrai('piano-extra.js', [
      '_pianoStatoMese',
      '_pianoMappaRighe',
      '_pianoUndoSnap',
      '_pianoUndoChiudi',
      '_pianoUndoChiudiAperto',
      '_pianoSessFinestra',
      '_pianoUndoScarta',
    ]),
    ctx,
  );
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'piano-mesi.js'), 'utf8'), ctx);
}

// fabbisogno di dicembre 2026: lun-gio 2 L1, ven-sab 3 L1 + 1 S7, domenica 4 L1, Natale 9 L1
function fabbDicembre(db) {
  for (let g = 1; g <= 31; g++) {
    const d = '2026-12-' + String(g).padStart(2, '0');
    const dow = new Date(d + 'T12:00:00').getDay();
    const q = d === '2026-12-25' ? 9 : dow === 0 ? 4 : dow === 5 || dow === 6 ? 3 : 2;
    db.piano_fabbisogni.push({ id: db.id++, data: d, turno_codice: 'L1', quantita: q, reparto_dip: 'slots' });
    if (dow === 5 || dow === 6)
      db.piano_fabbisogni.push({ id: db.id++, data: d, turno_codice: 'S7', quantita: 1, reparto_dip: 'slots' });
  }
}

(async () => {
  // ================================================================ copia del fabbisogno
  console.log('Copia del fabbisogno dal mese precedente (senza finestre)');
  {
    const db = creaDb();
    fabbDicembre(db);
    const ctx = creaCtx(db, []);
    caricaMesi(ctx);
    ctx.window._vigilie = ['2027-01-05']; // vigilia dell Epifania: chiude alle 5 come il sabato
    const c = await vm.runInContext(
      "_pianoFabbisognoCopiaCalcola('2027-01', 'slots', new Set(['2027-01-04|L1']))",
      ctx,
    );
    const di = (d, t) => (c.nuovi.find((x) => x.data === d && x.turno_codice === t) || {}).quantita;
    eq(c.ymPrec, '2026-12', 'mese di partenza = mese precedente (anche a cavallo dell anno)');
    eq(di('2027-01-08', 'L1'), 3, 'venerdi 8.1 come i venerdi di dicembre');
    eq(di('2027-01-08', 'S7'), 1, 'venerdi 8.1 anche con il turno del venerdi (S7)');
    eq(di('2027-01-12', 'L1'), 2, 'martedi come i martedi');
    eq(di('2027-01-12', 'S7'), undefined, 'martedi senza S7');
    eq(di('2027-01-10', 'L1'), 4, 'domenica come le domeniche (non Natale: assetto piu frequente)');
    eq(di('2027-01-06', 'L1'), 4, 'Epifania (mercoledi festivo) come la domenica');
    eq(di('2027-01-01', 'L1'), 4, 'Capodanno (venerdi festivo) come la domenica');
    eq(di('2027-01-05', 'L1'), 3, 'vigilia (martedi che chiude alle 5) come venerdi e sabato');
    eq(di('2027-01-04', 'L1'), undefined, 'cella gia impostata (4.1 L1) non riscritta');
    eq(c.nuovi.length, 31 + 10 - 1, 'una cella per giorno e turno, meno quella gia impostata');
    eq(c.senzaModello, [], 'ogni tipo di giornata ha un modello');
    ok(
      c.nuovi.every((x) => x.reparto_dip === 'slots' && x.data.startsWith('2027-01')),
      'righe del settore e del mese giusti',
    );
    const vuoto = await vm.runInContext("_pianoFabbisognoCopiaCalcola('2026-12', 'slots', new Set())", ctx);
    eq(
      [vuoto.ymPrec, vuoto.nPrec, vuoto.nuovi.length],
      ['2026-11', 0, 0],
      'mese prima senza fabbisogno: niente da copiare',
    );
    // giovedi mancante nel mese di partenza: resta vuoto e si dice
    db.piano_fabbisogni = db.piano_fabbisogni.filter((f) => new Date(f.data + 'T12:00:00').getDay() !== 4);
    const c2 = await vm.runInContext("_pianoFabbisognoCopiaCalcola('2027-01', 'slots', new Set())", ctx);
    eq(c2.senzaModello, ['D4'], 'giovedi senza riferimento: segnalato');
    eq(c2.nuovi.filter((x) => x.data === '2027-01-07').length, 0, 'giovedi 7.1 resta vuoto');
    await vm.runInContext("_pianoFabbisognoCopiaScrivi(_c, '2027-01')", Object.assign(ctx, { _c: c2 }));
    eq(
      db.piano_fabbisogni.filter((f) => f.data.startsWith('2027-01')).length,
      c2.nuovi.length,
      'scrittura: tutte le celle calcolate',
    );
  }

  // ================================================================ sequenza
  console.log('Sequenza dei mesi');
  const prova = async (opz, extra) => {
    const db = creaDb();
    fabbDicembre(db);
    if (extra && extra.prima) extra.prima(db);
    const log = [];
    const ctx = creaCtx(db, log);
    caricaMesi(ctx);
    // la bozza finta: controlla che il mese parta dal precedente e scrive un turno al giorno
    ctx.generaBozzaPiano = async () => {
      const ym = vm.runInContext('_pianoMeseSel', ctx);
      const a = ctx.window._pianoAutoInCorso;
      log.push('bozza ' + ym);
      ok(
        vm.runInContext(
          "_pianoYtdKey === '' && _pianoOreMeseKey === '' && !Object.keys(_pianoDomAnnoCache).length",
          ctx,
        ),
        ym + ': cache del mese prima azzerate prima della bozza',
      );
      ok(a && a.ym === ym && a.mesi, ym + ': bozza senza domande (modo automatico) sul mese giusto');
      ok(
        db.piano_fabbisogni.some((f) => f.data.startsWith(ym)),
        ym + ': il fabbisogno c e gia quando parte la bozza',
      );
      vm.runInContext("_pianoUndoSnap('genera bozza ' + _pianoMeseSel)", ctx);
      vm.runInContext(
        "_pianoDomAnnoCache['2027|slots|' + _pianoMeseSel] = { quando: 1 }; _pianoYtdKey = _pianoMeseSel",
        ctx,
      );
      const nG = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
      for (let g = 1; g <= nG; g++)
        db.post('piano', {
          collaboratore: 'Persona A',
          data: ym + '-' + String(g).padStart(2, '0'),
          codice: 'L1',
          generato: true,
          protetto: false,
          reparto_dip: 'slots',
        });
      // il bordo letto ADESSO (dopo la scrittura, come la bozza vera)
      await ctx._pianoCaricaMeseSettore(ym + '-01', ym + '-' + nG, 'slots');
      a.bozza = { celle: nG, volute: nG, scoperti: 1 };
      if (extra && extra.dopoBozza) extra.dopoBozza(ym, ctx);
    };
    ctx.pianoRicercaCalcola = async (sec, onPasso, o) => {
      log.push('ricerca ' + vm.runInContext('_pianoMeseSel', ctx) + ' ' + sec + (o && o.iterazioni ? ' misura' : ''));
      if (onPasso) onPasso({ frazione: 1, scoperti: 0 });
      const m = (s) => ({ scoperti: s, legge: 0, regole: 2, oreSotto: 1, blocchi: 3 });
      return { prima: m(1), dopo: m(0), migliore: true, cambi: [{}], motivi: [] };
    };
    ctx._ricercaScrivi = async () => {
      log.push('scrivi ' + vm.runInContext('_pianoMeseSel', ctx));
      vm.runInContext("_pianoUndoSnap('migliora bozza ' + _pianoMeseSel)", ctx);
    };
    // la pila di Annulla con 13 passi vecchi: con quelli del mese si va oltre i 15
    for (let i = 0; i < 13; i++) ctx.window._pianoUndo.push({ label: 'vecchio ' + i, ym: '2026-10', rep: 'slots' });
    ctx._opz = opz;
    const fasi = [];
    ctx._ui = { mese: (i, n, ym) => fasi.push('mese ' + (i + 1) + '/' + n + ' ' + ym), fase: () => {} };
    vm.runInContext('_pianoMesiStato = { ferma: false }', ctx);
    const esito = await vm.runInContext('_pianoMesiEsegui(_opz, _ui)', ctx);
    return { db, log, ctx, esito, fasi };
  };
  {
    const opz = {
      rep: 'slots',
      mesi: ['2027-01', '2027-02', '2027-03'],
      minuti: 1,
      rigenera: new Set(),
      salta: new Set(),
    };
    const { db, log, ctx, esito, fasi } = await prova(opz);
    eq(
      log,
      [
        'bozza 2027-01',
        'ricerca 2027-01 60',
        'scrivi 2027-01',
        'bozza 2027-02',
        'ricerca 2027-02 60',
        'scrivi 2027-02',
        'bozza 2027-03',
        'ricerca 2027-03 60',
        'scrivi 2027-03',
      ],
      'in sequenza: bozza, Migliora (1 min) e scrittura di un mese prima del mese dopo',
    );
    eq(fasi, ['mese 1/3 2027-01', 'mese 2/3 2027-02', 'mese 3/3 2027-03'], 'avanzamento «Mese i di n»');
    eq(
      esito.righe.map((r) => r.fabb && r.fabb.copiato && r.fabb.da),
      ['2026-12', '2027-01', '2027-02'],
      'fabbisogno copiato da: dicembre, poi dal mese appena copiato',
    );
    eq(
      esito.righe.map((r) => r.bordo && r.bordo.diverse),
      [null, 0, 0],
      'il bordo letto dalla bozza = la fine del mese prima appena scritta',
    );
    eq(
      esito.righe.map((r) => r.numeri.scoperti),
      [0, 0, 0],
      'numeri finali = dopo Migliora applicata',
    );
    const u = ctx.window._pianoUndo;
    eq(
      u.slice(-3).map((s) => s.label),
      ['prepara più mesi: Gennaio 2027', 'prepara più mesi: Febbraio 2027', 'prepara più mesi: Marzo 2027'],
      'un passo di Annulla per mese',
    );
    eq(u.length, 15, 'pila piena (15): i passi spinti fuori da bozza e Migliora sono tornati');
    eq(u[0].label, 'vecchio 1', 'restano i passi vecchi piu recenti (solo il piu vecchio esce, per i 3 mesi)');
    const p = u[u.length - 1];
    ok(p.t0 && p.t1 && Date.parse(p.t1) > Date.parse(p.t0), 'il passo del mese va dall inizio alla fine del mese');
    ok(!esito.fermato && esito.righe.every((r) => r.stato === 'fatto'), 'tre mesi fatti');
    eq(db.piano_fabbisogni.filter((f) => f.data >= '2027-01').length > 0, true, 'fabbisogno scritto');
  }
  {
    // mese saltato e solo bozza (0 minuti: solo la misura)
    const opz = {
      rep: 'slots',
      mesi: ['2027-01', '2027-02', '2027-03'],
      minuti: 0,
      rigenera: new Set(),
      salta: new Set(['2027-02']),
    };
    // febbraio (saltato) ha gia il suo fabbisogno, come un mese con celle generate
    const { log, esito } = await prova(opz, {
      prima: (db) =>
        db.piano_fabbisogni.push({
          id: 999,
          data: '2027-02-10',
          turno_codice: 'L1',
          quantita: 2,
          reparto_dip: 'slots',
        }),
    });
    eq(
      log,
      ['bozza 2027-01', 'ricerca 2027-01 1 misura', 'bozza 2027-03', 'ricerca 2027-03 1 misura'],
      'mese saltato: niente bozza; 0 minuti: niente Migliora, solo la misura',
    );
    eq(
      esito.righe.map((r) => r.stato),
      ['fatto', 'saltato', 'fatto'],
      'stato per mese',
    );
    eq(esito.righe[2].fabb.da, '2027-02', 'marzo: fabbisogno da febbraio (che ce l ha anche se saltato)');
    // mese saltato SENZA fabbisogno: il mese dopo non ha da dove copiare e lo dice
    const s2 = await prova(opz);
    eq(
      s2.esito.righe.map((r) => r.stato),
      ['fatto', 'saltato', 'saltato'],
      'dopo un mese saltato senza fabbisogno',
    );
    ok(/nemmeno Febbraio 2027/.test(s2.esito.righe[2].motivo), 'motivo: il mese prima non ha fabbisogno da copiare');
  }
  {
    // FERMA nel mese 2: il mese 2 finisce, il 3 non parte
    const opz = {
      rep: 'slots',
      mesi: ['2027-01', '2027-02', '2027-03'],
      minuti: 1,
      rigenera: new Set(),
      salta: new Set(),
    };
    const { log, esito, db } = await prova(opz, {
      dopoBozza: (ym, ctx) => {
        if (ym === '2027-02') vm.runInContext('_pianoMesiStato.ferma = true', ctx);
      },
    });
    eq(log.slice(-3), ['bozza 2027-02', 'ricerca 2027-02 60', 'scrivi 2027-02'], 'Ferma: il mese in corso finisce');
    ok(esito.fermato && esito.righe.length === 2, 'Ferma: il mese dopo non parte');
    ok(
      !db.piano_fabbisogni.some((f) => f.data.startsWith('2027-03')),
      'Ferma: niente fabbisogno copiato nel mese non fatto',
    );
  }
  {
    // bordo vecchio (cache non aggiornata): si vede nel riepilogo
    const opz = { rep: 'slots', mesi: ['2027-01', '2027-02'], minuti: 0, rigenera: new Set(), salta: new Set() };
    const { esito } = await prova(opz, {
      dopoBozza: (ym, ctx) => {
        if (ym === '2027-01') ctx.window._bordoFinto = [];
      },
    });
    ok(esito.righe[1].bordo.diverse > 0, 'bordo diverso da quello scritto: segnalato');
    ok(/fine del mese prima/.test(esito.righe[1].note.join(' ')), 'nota nel riepilogo del mese');
  }
  {
    // mese chiuso (tutti i giorni passati) e mesi in fila
    const db = creaDb();
    const ctx = creaCtx(db, []);
    caricaMesi(ctx);
    eq(
      vm.runInContext("_pianoMesiElenco('2026-11', 4)", ctx),
      ['2026-11', '2026-12', '2027-01', '2027-02'],
      'mesi in fila a cavallo dell anno',
    );
    ctx.window._chiusi = ['2027-01'];
    eq(vm.runInContext("_pianoMesiTrattiAperti('2027-01').length", ctx), 0, 'mese chiuso: nessun giorno da scrivere');
    eq(
      vm.runInContext("_pianoMesiTrattiAperti('2027-02')", ctx),
      [['2027-02-01', '2027-02-28']],
      'mese aperto: un tratto',
    );
  }

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
