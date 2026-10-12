// Personalizzazioni dalle schermate (v452): testo delle istruzioni del settore (Markdown
// ridotto, sempre scappato: js/guida.js) e colonne del briefing per settore (predefinite
// identiche a quelle di sempre, ripulitura dell impostazione: js/piano-briefing-ui.js).
// Come si lancia: node test/personalizzazioni.test.js
const fs = require('fs');
const path = require('path');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
// estrae una funzione (o costante) di primo livello dal file
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  const j = src.indexOf('\n}\n', i);
  const k = src.indexOf('\n};\n', i);
  const fine = k >= 0 && (j < 0 || k < j) ? k + 4 : j + 3;
  return src.slice(i, fine);
};
const utils = leggi('utils.js');
const guida = leggi('guida.js');
const brief = leggi('piano-briefing-ui.js');
const escP = new Function(pezzo(utils, 'function escP(') + '; return escP;')();
const istrMarkdownHtml = new Function(
  'escP',
  pezzo(guida, 'function istrMarkdownHtml(') + '; return istrMarkdownHtml;',
)(escP);
const window = {};
let rep = 'slots';
const B = new Function(
  'window',
  '_pianoReparto',
  pezzo(brief, 'const BRIEF_COLONNE_CATALOGO') +
    pezzo(brief, 'function _briefColonnePredefinite(') +
    pezzo(brief, 'function _briefColonneTutte(') +
    pezzo(brief, 'function _briefColonne(') +
    '; return { _briefColonne, _briefColonneTutte };',
)(window, () => rep);

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  if (r === atteso) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + atteso + '\n  ottenuto ' + r);
  }
};
// ---- Markdown ridotto
eq(istrMarkdownHtml('# Apertura'), '<h4 class="istr-tit">Apertura</h4>', 'titolo');
eq(istrMarkdownHtml('## Sotto'), '<h4 class="istr-tit istr-tit2">Sotto</h4>', 'sottotitolo');
eq(
  istrMarkdownHtml('- uno\n- **due**'),
  '<ul class="istr-elenco"><li class="guida-riga">uno</li><li class="guida-riga"><b>due</b></li></ul>',
  'elenco puntato con grassetto',
);
eq(
  istrMarkdownHtml('1. primo\n2) secondo'),
  '<ol class="istr-elenco"><li class="guida-riga">primo</li><li class="guida-riga">secondo</li></ol>',
  'elenco numerato',
);
eq(
  istrMarkdownHtml('riga uno\nriga due\n\naltro'),
  '<p class="guida-riga">riga uno<br>riga due</p><p class="guida-riga">altro</p>',
  'paragrafi',
);
eq(
  istrMarkdownHtml('<script>alert(1)</script> <b onclick="x">y</b>'),
  '<p class="guida-riga">&lt;script&gt;alert(1)&lt;/script&gt; &lt;b onclick=&quot;x&quot;&gt;y&lt;/b&gt;</p>',
  'HTML sempre scappato',
);
eq(
  istrMarkdownHtml('**<img src=x onerror=alert(1)>**'),
  '<p class="guida-riga"><b>&lt;img src=x onerror=alert(1)&gt;</b></p>',
  'grassetto con HTML dentro: scappato',
);
eq(
  istrMarkdownHtml('# [link](javascript:alert(1))'),
  '<h4 class="istr-tit">[link](javascript:alert(1))</h4>',
  'niente collegamenti',
);
eq(istrMarkdownHtml(''), '', 'testo vuoto');
// ---- Colonne del briefing: predefinite uguali a quelle di sempre
const tit = (r) => {
  rep = r;
  return B._briefColonne(r)
    .map((c) => c.tit)
    .join(',');
};
eq(tit('slots'), 'E,U,HOST,T,CD,USCITA,FIRMA', 'Slots predefinite');
eq(tit('valet'), 'E,U,COLLABORATORE,TURNO,USCITA,FIRMA,RADIO,BADGE', 'Valet predefinite');
eq(tit('tavoli'), 'E,U,COLLABORATORE,T,USCITA,FIRMA', 'Tavoli predefinite');
eq(tit('cleaning'), 'E,U,COLLABORATORE,T,USCITA,FIRMA', 'Cleaning predefinite');
// ---- impostazione ripulita
window._briefColonneCfg = {
  tavoli: [
    { id: 'turno', tit: 'TURNO', vis: false }, // fissa: resta visibile
    { id: 'x_ab12', tit: '  NOTE  ', vis: true },
    { id: 'cd', tit: 'CD', vis: true }, // solo Slots: tolta
    { id: 'pippo', tit: 'X', vis: true }, // sconosciuta: tolta
    { id: 'x_ab12', tit: 'doppia', vis: true }, // doppia: tolta
    { id: 'e', tit: '', vis: true }, // intestazione vuota: quella predefinita
    { id: 'firma', tit: 'FIRMA', vis: false },
  ],
};
eq(tit('tavoli'), 'TURNO,NOTE,E,COLLABORATORE', 'ripulitura: fisse visibili, mancanti in fondo, sconosciute tolte');
eq(
  B._briefColonneTutte('tavoli')
    .map((c) => c.id + (c.vis ? '' : '-'))
    .join(','),
  'turno,x_ab12,e,firma-,u-,nome,uscita-,radio-,badge-',
  'ripulitura: elenco completo con le nascoste',
);
window._briefColonneCfg = { slots: 'non un elenco' };
eq(tit('slots'), 'E,U,HOST,T,CD,USCITA,FIRMA', 'impostazione rovinata: predefinite');
console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================\n');
process.exit(falliti ? 1 : 0);
