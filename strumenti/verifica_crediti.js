// Verifica incrociata della scheda Crediti con il codice VERO del Piano e i
// dati VERI del database, senza browser:
//   1) PW=... python3 strumenti/esporta_dati_verifica.py   (scarica le tabelle in strumenti/dati_verifica/db)
//   2) node strumenti/verifica_crediti.js
// Per ogni settore confronta, collaboratore per collaboratore, Crediti con le
// schede Vacanze (spettanti, pianificate, restituite, restano), Festivi (CGF
// maturati, goduti, restano) e Saldo (saldo ore dell anno). Esce 0 se tutto
// coincide. I dati esportati contengono nomi: la cartella e fuori dal repository.
// Verifica INCROCIATA con il codice vero e i dati veri: scheda Crediti vs
// schede Vacanze, Festivi (CGF) e Saldo, per ogni settore.
const fs = require('fs');
const vm = require('vm');
const SP = __dirname + '/dati_verifica';
const DB = {};
for (const f of fs.readdirSync(SP + '/db'))
  DB[f.replace('.json', '')] = JSON.parse(fs.readFileSync(SP + '/db/' + f, 'utf8'));
const IMP = {};
DB.impostazioni.forEach((r) => (IMP[r.chiave] = r.valore));
// mini PostgREST sui JSON
function secGet(q) {
  const [tab, qs] = q.split('?');
  let rows = (DB[tab] || []).slice();
  let limit = null;
  const order = [];
  (qs || '').split('&').forEach((p) => {
    if (!p) return;
    const i = p.indexOf('=');
    const k = decodeURIComponent(p.substring(0, i));
    const v = decodeURIComponent(p.substring(i + 1));
    if (k === 'select') return;
    if (k === 'limit') return (limit = parseInt(v));
    if (k === 'order') return v.split(',').forEach((o) => order.push(o.split('.')));
    const j = v.indexOf('.');
    const op = v.substring(0, j);
    const val = v.substring(j + 1);
    const S = (x) => (x == null ? '' : String(x));
    if (op === 'eq') rows = rows.filter((r) => S(r[k]) === val);
    else if (op === 'neq') rows = rows.filter((r) => S(r[k]) !== val);
    else if (op === 'gte') rows = rows.filter((r) => S(r[k]) >= val);
    else if (op === 'lte') rows = rows.filter((r) => S(r[k]) <= val);
    else if (op === 'gt') rows = rows.filter((r) => S(r[k]) > val);
    else if (op === 'lt') rows = rows.filter((r) => S(r[k]) < val);
    else if (op === 'like' || op === 'ilike') {
      const re = new RegExp(
        '^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$',
        op === 'ilike' ? 'i' : '',
      );
      rows = rows.filter((r) => re.test(S(r[k])));
    } else if (op === 'in') {
      const set = val
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((x) => x.replace(/^"|"$/g, ''));
      rows = rows.filter((r) => set.includes(S(r[k])));
    } else if (op === 'is') rows = rows.filter((r) => (val === 'null' ? r[k] == null : String(r[k]) === val));
    else throw new Error('op sconosciuto ' + op + ' in ' + q);
  });
  order.forEach(([k, dir]) => rows.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (dir === 'desc' ? -1 : 1)));
  if (limit) rows = rows.slice(0, limit);
  return Promise.resolve(rows.map((r) => Object.assign({}, r)));
}
const noop = () => {};
const el = () => ({
  style: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  appendChild: noop,
  setAttribute: noop,
  addEventListener: noop,
  innerHTML: '',
  textContent: '',
  querySelectorAll: () => [],
  querySelector: () => null,
  getBoundingClientRect: () => ({}),
});
const ctx = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (f) => setTimeout(f, 0),
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: el,
    body: el(),
    head: el(),
    documentElement: el(),
  },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { userAgent: 'node' },
  location: { href: '', hash: '' },
  alert: noop,
  confirm: () => true,
  prompt: () => null,
  secGet,
  getImp: (k) => Promise.resolve(IMP[k] != null ? IMP[k] : null),
  secPatch: () => Promise.reject(new Error('sola lettura')),
  secPost: () => Promise.reject(new Error('sola lettura')),
  secDel: () => Promise.reject(new Error('sola lettura')),
  salvaImp: () => Promise.resolve(false),
  sbRpc: () => Promise.reject(new Error('sola lettura')),
  isAdmin: () => true,
  getOperatore: () => 'verifica',
  nomeCorrente: (x) => x,
  toast: noop,
  toastErrore: noop,
  logAzione: noop,
  puoModificare: () => true,
  visGet: () => 'tutti',
  puoGestirePiano: () => true,
  operatoriRepartoMap: {},
  _accessiExtraDi: () => null,
  datiCache: DB.registrazioni,
  collaboratoriCache: DB.collaboratori.filter((c) => c.attivo !== false),
  repartiConfig: JSON.parse(IMP.reparti_config || 'null'),
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  Intl,
  Date,
  Math,
  JSON,
  Promise,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  parseInt,
  parseFloat,
  isNaN,
  RegExp,
  Error,
};
ctx.addEventListener = noop;
ctx.removeEventListener = noop;
ctx.dispatchEvent = noop;
ctx.matchMedia = () => ({ matches: false, addEventListener: noop });
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
const carica = (f) => vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'), ctx, { filename: f });
carica('piano-regole.js');
carica('utils.js');
[
  ...fs.readFileSync(__dirname + '/../index.html', 'utf8').matchAll(/<script src="js\/(piano-(?!regole)[a-z-]+\.js)"/g),
].forEach((m) => carica(m[1]));
if (!ctx.MESI_FULL)
  ctx.MESI_FULL = [
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
  ];
if (!ctx.MESI) ctx.MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const celle = (riga) =>
  [...riga.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
const righeDi = (html) =>
  [...html.matchAll(/<tr[^>]*data-nome="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => ({
    nome: m[1].replace(/&#39;|&apos;/g, "'"),
    c: celle(m[2]),
  }));
(async () => {
  await ctx._pianoCaricaCfg();
  vm.runInContext("_pianoMeseSel = '2026-09'", ctx);
  let diff = 0,
    ok = 0;
  const nota = (m) => console.log('  ' + m);
  for (const rep of ['slots', 'tavoli', 'valet', 'cleaning']) {
    vm.runInContext("_pianoRepartoSel = '" + rep + "'", ctx);
    ctx.currentReparto = rep;
    const anno = 2026;
    // scheda Vacanze (card diritto)
    const nomiRep = ctx.collaboratoriCache
      .filter((c) => c.attivo !== false && ctx._pianoAppartieneAlReparto(c))
      .map((c) => c.nome);
    ctx.__vac = (await secGet('piano_vacanze?anno=eq.' + anno + '&limit=2000')).filter((v) =>
      nomiRep.includes(v.collaboratore),
    );
    vm.runInContext('_pianoVacCache = __vac', ctx);
    const vacHtml = await ctx._pianoVacDirittoCard(anno);
    const vac = {};
    righeDi(vacHtml).forEach((r) => (vac[r.nome] = r.c)); // nome, dal, anni, spettanti, pianificati, inCal, restituite, restano
    // scheda Festivi (CGF)
    const cgf = (await ctx._pianoSaldoCgf('2026-09')).saldo;
    // scheda Saldo anno
    await ctx._pianoCaricaSaldoIniziale(anno);
    ctx._pianoSaldoAnnoDati = await ctx._pianoSaldoAnnoCalcola(anno);
    const saldoHtml = ctx._renderPianoSaldoAnnoCard();
    const saldo = {};
    righeDi(saldoHtml).forEach((r) => (saldo[r.nome] = r.c[r.c.length - 2]));
    // scheda Crediti
    const cred = await ctx._pianoCreditiDati(anno);
    console.log(
      '\n== ' +
        rep +
        ' · ' +
        cred.length +
        ' collaboratori · vacanze card ' +
        Object.keys(vac).length +
        ' · cgf ' +
        Object.keys(cgf).length +
        ' · saldo ' +
        Object.keys(saldo).length,
    );
    cred.forEach((d) => {
      const v = vac[d.nome];
      if (d.vac) {
        if (!v) {
          diff++;
          nota('VAC manca nella scheda Vacanze: ' + d.nome);
        } else {
          const att = [String(d.vac.spett), String(d.vac.pian || ''), String(d.vac.rest || ''), String(d.vac.resta)];
          const card = [v[3], v[4], v[6], v[7]];
          if (JSON.stringify(att) !== JSON.stringify(card)) {
            diff++;
            nota('VAC ' + d.nome + ': crediti ' + att.join('/') + ' vs vacanze ' + card.join('/'));
          } else ok++;
        }
      } else if (v) {
        diff++;
        nota('VAC crediti vuoto ma la scheda Vacanze ha ' + d.nome + ' ' + v.slice(3).join('/'));
      }
      const c = cgf[d.nome];
      if (d.cgf) {
        if (!c) {
          diff++;
          nota('CGF manca in Festivi: ' + d.nome);
        } else if (c.resta !== d.cgf.resta || c.maturati !== d.cgf.mat || c.goduti !== d.cgf.god) {
          diff++;
          nota(
            'CGF ' +
              d.nome +
              ': crediti ' +
              d.cgf.mat +
              '/' +
              d.cgf.god +
              '/' +
              d.cgf.resta +
              ' vs festivi ' +
              c.maturati +
              '/' +
              c.goduti +
              '/' +
              c.resta,
          );
        } else ok++;
      } else if (c) {
        diff++;
        nota('CGF crediti vuoto ma Festivi ha ' + d.nome);
      }
      const s = saldo[d.nome];
      if (d.saldoOre != null) {
        if (s == null) {
          diff++;
          nota('SALDO manca nella scheda Saldo: ' + d.nome);
        } else if (Math.abs(d.saldoOre - parseFloat(String(s).replace('+', ''))) > 0.05) {
          diff++;
          nota('SALDO ' + d.nome + ': crediti ' + d.saldoOre + ' vs saldo ' + s);
        } else ok++;
      } else if (s != null && !d.jolly) {
        diff++;
        nota('SALDO crediti vuoto ma la scheda Saldo ha ' + d.nome + ' = ' + s);
      }
    });
    // esempi
    cred
      .slice(0, 3)
      .forEach((d) =>
        nota(
          'es. ' +
            d.nome +
            ': vac ' +
            (d.vac ? d.vac.spett + '/' + d.vac.pian + '/' + d.vac.rest + ' resta ' + d.vac.resta : '-') +
            ' · cgf ' +
            (d.cgf ? d.cgf.mat + '/' + d.cgf.god + ' resta ' + d.cgf.resta : '-') +
            ' · saldo ' +
            d.saldoOre +
            ' · rec ' +
            d.recMese +
            ' · cnp ' +
            d.cnp,
        ),
      );
  }
  console.log('\nCONFRONTI UGUALI: ' + ok + ' · DIFFERENZE: ' + diff);
  process.exit(diff ? 1 : 0);
})().catch((e) => {
  console.error('ERRORE', e);
  process.exit(2);
});
