// Numero di buoni Maison proposto da solo (ripristinato 16/10/2026): importo / valore del buono
// arrotondato in su come fino al 24/09 (js/promemoria.js _buoniAutoQty), tetto alle persone del
// primo nome nelle righe "A / B", correzione a mano che resta finche' non cambiano i dati di
// partenza (js/maison-helpers.js), numero scritto o no nel file importato (_parseMaisonNome).
// Come si lancia: node test/maison-buoni-auto.test.js
const fs = require('fs');
const path = require('path');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};
const prom = leggi('promemoria.js');
const help = leggi('maison-helpers.js');
const bud = leggi('maison-budget.js');

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  if (r === atteso) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + atteso + '\n  ottenuto ' + r);
  }
};
const BUONO_VALORI = { BU: 15, BL: 40, CG: 80, WL: 40 };
const { _buoniAutoQty, _ripartisciPx } = new Function(
  pezzo(prom, 'function _buoniAutoQty(') +
    pezzo(prom, 'function _ripartisciPx(') +
    '; return { _buoniAutoQty, _ripartisciPx };',
)();

// ---- calcolo: identico al vecchio Math.ceil(importo / valore) con un nome solo
const vecchio = (imp, val) => {
  const q = Math.ceil(imp / val);
  return q >= 1 ? q : null;
};
let diversi = 0;
for (const val of [15, 40, 80, 25.5])
  for (let c = 1; c <= 40000; c += 7) {
    const imp = c / 100;
    if (_buoniAutoQty(imp, val, 1, 1) !== vecchio(imp, val)) diversi++;
  }
eq(diversi, 0, 'nome singolo: stesso risultato del calcolo vecchio su ~23000 importi');
eq(_buoniAutoQty(30, 15, 1, 1), 2, '30 CHF BU = 2');
eq(_buoniAutoQty(31, 15, 1, 1), 3, '31 CHF BU = 3 (supera = un buono in piu)');
eq(_buoniAutoQty(15, 15, 1, 1), 1, '15 CHF BU = 1');
eq(_buoniAutoQty(80, 40, 1, 1), 2, '80 CHF BL = 2');
eq(_buoniAutoQty(120, 80, 1, 1), 2, '120 CHF CG = 2');
eq(_buoniAutoQty(45, 15, 1, 1), 3, '45/15 in centesimi resta 3');
eq(_buoniAutoQty(0, 15, 1, 1), null, 'senza importo niente proposta');
eq(_buoniAutoQty(50, 0, 1, 1), null, 'tipo senza valore niente proposta');
eq(_buoniAutoQty(360, 40, 2, 1), 1, 'Aili BL / Bertaggia 360 CHF px 2: 1 BL (non 9)');
eq(_buoniAutoQty(360, 40, 2, 3), 3, 'riga a due nomi, 3 persone del primo: 3 BL');
eq(_buoniAutoQty(60, 40, 2, 3), 2, 'riga a due nomi: mai oltre importo/valore');

// ---- CATEGORIE DEI CLIENTI (21/10/2026): fisse + una per ogni tipo di buono configurato
// (js/maison-budget.js); la categoria di buono da il tipo che fa calcolare i buoni
const BUONI_TIPI = [
  { codice: 'BU', nome: 'Buono Unico', attivo: true },
  { codice: 'BL', nome: 'Buono Lounge', attivo: true },
  { codice: 'CG', nome: 'Coupon Gourmet', attivo: true },
  { codice: 'WL', nome: 'Welcome Lounge', attivo: true, settori: ['tavoli'] },
  { codice: 'XS', nome: 'Extra Spa', attivo: false },
];
let settoreAperto = 'slots';
const CAT = new Function(
  'BUONI_TIPI',
  'buoniTipi',
  'buonoColore',
  'escP',
  bud.slice(bud.indexOf('const MAISON_CAT_FISSE'), bud.indexOf('// mappa chiave -> etichetta')) +
    '; return { maisonCatInfo, maisonCategorie, maisonCatLabel, maisonCatBreve, maisonCatTipoBuono, maisonCatColore, maisonCatRgb, maisonCatOpzioniHtml };',
)(
  BUONI_TIPI,
  () => BUONI_TIPI.filter((t) => t.attivo && (!t.settori || t.settori.includes(settoreAperto))),
  (c) => ({ BU: '#e67e22', BL: '#2c6e49', CG: '#8e44ad', WL: '#2980b9' })[c] || '#5a6b7a',
  (s) => String(s),
);
const maisonCatTipoBuono = CAT.maisonCatTipoBuono;
eq(CAT.maisonCatTipoBuono('bu'), 'BU', 'categoria bu = buono BU');
eq(CAT.maisonCatTipoBuono('cg'), 'CG', 'categoria cg = buono CG (prima non assegnabile)');
eq(CAT.maisonCatTipoBuono('xs'), 'XS', 'tipo disattivato: la categoria gia data vale ancora');
eq(CAT.maisonCatTipoBuono('full_maison'), '', 'Full Maison: nessun buono');
eq(CAT.maisonCatTipoBuono('zz'), '', 'sigla non configurata: nessun buono');
eq(CAT.maisonCatTipoBuono(''), '', 'senza categoria: nessun buono');
eq(CAT.maisonCatLabel('cg'), 'Coupon Gourmet', 'etichetta dal nome del tipo');
eq(CAT.maisonCatBreve('cg'), 'CG', 'nome corto = sigla');
eq(CAT.maisonCatLabel('maison'), 'Maison', 'fissa Maison');
eq(
  CAT.maisonCategorie()
    .map((c) => c.key)
    .join(','),
  'full_maison,maison,direzione,bu,bl,cg',
  'Slots: fisse + tipi attivi del settore (WL solo Tavoli, XS disattivato)',
);
settoreAperto = 'tavoli';
eq(
  CAT.maisonCategorie()
    .map((c) => c.key)
    .join(','),
  'full_maison,maison,direzione,bu,bl,cg,wl',
  'Tavoli: anche WL',
);
settoreAperto = 'slots';
eq(
  CAT.maisonCategorie([{ categoria: 'xs' }])
    .map((c) => c.key)
    .join(','),
  'full_maison,maison,direzione,bu,bl,cg,xs',
  'categoria gia assegnata con tipo disattivato resta nell elenco',
);
eq(CAT.maisonCatColore('cg') !== CAT.maisonCatColore('direzione'), true, 'CG non ha il colore di Direzione');
eq(CAT.maisonCatRgb('bu').join(','), '230,126,34', 'colore per il PDF');
eq(
  /<option value="cg" selected>Coupon Gourmet \(CG\)<\/option>/.test(CAT.maisonCatOpzioniHtml('cg')),
  true,
  'menu: CG scelto',
);
eq(/<option value="" selected>-<\/option>/.test(CAT.maisonCatOpzioniHtml('')), true, 'menu: vuoto scelto');
eq(/value="xs" selected/.test(CAT.maisonCatOpzioniHtml('xs')), true, 'menu: categoria disattivata resta scelta');

// ---- modulo: documento finto con i campi del form
const campi = {};
const el = (id, value) => (campi[id] = { id, value, dataset: {}, dispatchEvent() {} });
el('maison-man-nome', '');
el('maison-man-px', '1');
el('maison-man-importo', '');
el('maison-man-tipo', '');
el('maison-man-qty', '1');
const document = { getElementById: (id) => campi[id] || null };
const budget = [
  { nome: 'Aili Marco', categoria: 'bl' },
  { nome: 'Frigerio Anna', categoria: 'bu' },
  { nome: 'Rossi Luca', categoria: 'full_maison' },
  { nome: 'Gallo Pia', categoria: 'cg' },
];
const F = new Function(
  'document',
  'BUONO_VALORI',
  'getBudgetReparto',
  '_buoniAutoQty',
  '_ripartisciPx',
  'maisonCatTipoBuono',
  pezzo(help, 'function _preimpostaTipoMaison(') +
    pezzo(help, 'function _maisonManNomeCambiato(') +
    pezzo(help, 'function _maisonManFonte(') +
    pezzo(help, 'function _maisonManAutoQty(') +
    pezzo(help, 'function _maisonManQtyAMano(') +
    pezzo(help, 'function _autoCalcolaBuoniManuale(') +
    '; return { _preimpostaTipoMaison, _maisonManNomeCambiato, _maisonManQtyAMano, _autoCalcolaBuoniManuale };',
)(document, BUONO_VALORI, () => budget, _buoniAutoQty, _ripartisciPx, maisonCatTipoBuono);
const v = (id) => String(campi[id].value);
const scrivi = (id, x) => {
  campi[id].value = x;
  F._autoCalcolaBuoniManuale();
};
// cliente con categoria BU scelto, poi importo
F._preimpostaTipoMaison('bu');
eq(v('maison-man-tipo'), 'BU', 'categoria bu imposta il tipo BU');
scrivi('maison-man-importo', '30');
eq(v('maison-man-qty'), '2', '30 CHF BU: 2 buoni da soli');
scrivi('maison-man-importo', '46');
eq(v('maison-man-qty'), '4', 'cambia importo 46: 4 buoni');
// correzione a mano: resta finche' non cambia un dato
campi['maison-man-qty'].value = '1';
F._maisonManQtyAMano();
F._autoCalcolaBuoniManuale();
eq(v('maison-man-qty'), '1', 'correzione a mano non sovrascritta senza cambi');
F._maisonManNomeCambiato();
eq(v('maison-man-qty'), '1', 'uscire dal nome senza cambiare nulla non la tocca');
scrivi('maison-man-importo', '60');
eq(v('maison-man-qty'), '4', 'nuovo importo: si ricalcola (60/15)');
// cambio tipo
scrivi('maison-man-tipo', 'BL');
eq(v('maison-man-qty'), '2', 'tipo BL su 60 CHF: 2');
// cliente a buono poi cliente senza buoni: torna Normale
F._preimpostaTipoMaison('bl');
F._preimpostaTipoMaison('full_maison');
eq(v('maison-man-tipo'), '', 'cliente senza buoni dopo uno a buono: tipo torna Normale');
// tipo scelto a mano non si toglie
campi['maison-man-tipo'].value = 'CG';
delete campi['maison-man-tipo'].dataset.auto;
F._preimpostaTipoMaison('full_maison');
eq(v('maison-man-tipo'), 'CG', 'tipo scelto a mano resta');
// nome scritto per intero
campi['maison-man-tipo'].value = '';
campi['maison-man-nome'].value = 'aili marco';
scrivi('maison-man-importo', '85');
F._maisonManNomeCambiato();
eq(v('maison-man-tipo'), 'BL', 'nome scritto per intero: tipo dal budget');
eq(v('maison-man-qty'), '3', '85 CHF BL: 3');
// due nomi: tetto alle persone del primo
campi['maison-man-nome'].value = 'Aili / Rossi';
scrivi('maison-man-importo', '360');
F._maisonManNomeCambiato();
eq(v('maison-man-qty'), '1', 'Aili / Rossi px 1: 1 BL');
scrivi('maison-man-px', '4');
eq(v('maison-man-qty'), '2', 'PX 4 su due nomi: 2 BL al primo');

// cliente aggiunto a mano con categoria CG (Coupon Gourmet, 80 CHF): tipo e numero da soli
campi['maison-man-tipo'].value = '';
campi['maison-man-px'].value = '1';
campi['maison-man-nome'].value = 'Gallo Pia';
scrivi('maison-man-importo', '170');
F._maisonManNomeCambiato();
eq(v('maison-man-tipo'), 'CG', 'cliente con categoria CG: tipo CG');
eq(v('maison-man-qty'), '3', '170 CHF CG da 80: 3 buoni');
F._preimpostaTipoMaison('maison');
eq(v('maison-man-tipo'), '', 'poi un cliente Maison: tipo torna Normale');

// ---- import: numero scritto o no nel file
const _parseMaisonNome = new Function(
  'capitalizzaNome',
  'buoniTipi',
  'BUONI_TIPI_BASE',
  '_buoniEsc',
  pezzo(prom, 'function _parseMaisonNome(') + '; return _parseMaisonNome;',
)(
  (s) => s,
  () => [],
  [],
  (x) => x,
);
eq(_parseMaisonNome('Rossi BL').tipiBuono[0].scritta, false, 'file "Rossi BL": numero non scritto');
eq(_parseMaisonNome('Rossi 1BL').tipiBuono[0].scritta, true, 'file "Rossi 1BL": numero scritto');
eq(_parseMaisonNome('Rossi 2 BU').tipiBuono[0].scritta, true, 'file "Rossi 2 BU": numero scritto');

console.log(passati + ' controlli OK, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
