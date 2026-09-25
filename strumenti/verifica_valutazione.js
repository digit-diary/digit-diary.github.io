// Verifica dell importazione della scheda di valutazione: esegue il parser VERO
// (js/valutazioni.js) su un file Excel della scheda HR e stampa cosa legge.
//   node strumenti/verifica_valutazione.js "Scheda_di_valutazione.xlsx"
const fs = require('fs');
const vm = require('vm');
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
});
const ctx = {
  console,
  setTimeout,
  clearTimeout,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: el,
    body: el(),
    head: el(),
  },
  localStorage: { getItem: () => null, setItem: noop },
  navigator: {},
  location: {},
  module: { exports: {} },
  require,
  Buffer,
  process,
  URLSearchParams,
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
  Uint8Array,
  ArrayBuffer,
  DataView,
  TextDecoder,
  TextEncoder,
  escP: (x) => String(x),
  isAdmin: () => true,
  puoModificare: () => true,
  toast: noop,
  getOperatore: () => 'test',
  collaboratoriCache: [],
  valutazioniCache: [],
  currentReparto: 'slots',
  nomeCorrente: (x) => x,
  getValutazioniCollab: () => [],
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
ctx.addEventListener = noop;
vm.createContext(ctx);
ctx.XLSX = require(__dirname + '/../libs/xlsx.full.min.js');
vm.runInContext(fs.readFileSync(__dirname + '/../js/valutazioni.js', 'utf8'), ctx, { filename: 'valutazioni.js' });
const file = process.argv[2];
if (!file) {
  console.log('Uso: node strumenti/verifica_valutazione.js <scheda.xlsx>');
  process.exit(1);
}
const buf = fs.readFileSync(file);
ctx.__buf = new Uint8Array(buf).buffer;
const r = vm.runInContext('_parseValutazioneWorkbook(XLSX.read(__buf))', ctx);
console.log('fogli:', vm.runInContext('XLSX.read(__buf).SheetNames', ctx));
console.log('anno:', r.annoTrovato);
console.log('aree trovate:', Object.keys(r.aree).length, '/', vm.runInContext('AREE_VALUTAZIONE', ctx).length);
vm.runInContext('AREE_VALUTAZIONE', ctx).forEach((a) =>
  console.log(
    '  ',
    a.label.padEnd(42),
    r.aree[a.key] != null ? r.aree[a.key] : 'MANCA',
    ' auto:',
    r.autoAree && r.autoAree[a.key] != null ? r.autoAree[a.key] : '-',
  ),
);
console.log('extra:', JSON.stringify(r.extra, null, 1));
