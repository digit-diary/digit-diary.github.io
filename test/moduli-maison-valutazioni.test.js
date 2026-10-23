// Correzioni del controllo QA "audit B" (23/10/2026): Moduli, Maison, Inventario, Statistiche,
// Valutazioni e scheda collaboratore. Ogni blocco prova la funzione vera estratta dal file del
// programma; dove serve confronta con il comportamento di prima (codice del commit HEAD).
// Come si lancia: node test/moduli-maison-valutazioni.test.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const radice = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(radice, 'js', f), 'utf8');
const leggiHead = (f) => {
  try {
    return execSync('git show HEAD:js/' + f, { cwd: radice, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null;
  }
};
const pezzo = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};
const costante = (src, inizio) => {
  const i = src.indexOf(inizio);
  if (i < 0) throw new Error('non trovato: ' + inizio);
  const fine = src.slice(i).search(/\n[\]}];\n/);
  return src.slice(i, i + fine + 4);
};

let passati = 0;
let falliti = 0;
const eq = (r, atteso, nome) => {
  const a = JSON.stringify(r);
  const b = JSON.stringify(atteso);
  if (a === b) passati++;
  else {
    falliti++;
    console.log('FALLITO: ' + nome + '\n  atteso   ' + b + '\n  ottenuto ' + a);
  }
};

const utils = leggi('utils.js');
const LEV = `function _levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
  return d[m][n];
}`;
const CAP =
  costante(utils, 'const _NOMI_PARTICELLE = [') +
  pezzo(utils, 'function _nomeSigla(') +
  pezzo(utils, 'function capitalizzaNome(');

// ---- B1 valutazione importata: valutatore e data del file
{
  const val = leggi('valutazioni.js');
  const f = new Function(pezzo(val, 'function _valImportNuovaRiga(') + 'return _valImportNuovaRiga;')();
  const p = { nome: 'Rossi Mario', anno: 2026, aree: { a: 3 } };
  const r = f(
    p,
    { valutatore: 'Pisano Pamela', data_valutazione: '2026-09-03', sintesi: 'x' },
    'Admin',
    '2026-10-23',
    'slots',
  );
  eq([r.valutatore, r.data_valutazione], ['Pisano Pamela', '2026-09-03'], 'B1 valutatore e data del file restano');
  eq([r.aree.a, r.reparto_dip, r.sintesi], [3, 'slots', 'x'], 'B1 aree, settore e testi');
  const r2 = f(p, {}, 'Admin', '2026-10-23', 'slots');
  eq([r2.valutatore, r2.data_valutazione], ['Admin', '2026-10-23'], 'B1 file senza valutatore/data: chi importa, oggi');
  const vecchio = leggiHead('valutazioni.js');
  if (vecchio)
    eq(
      /\.\.\.testi,\s*aree: p\.aree,\s*valutatore: getOperatore\(\),\s*data_valutazione: oggiLocale\(\)/.test(vecchio),
      true,
      'B1 prima: valutatore e data di oggi scritti DOPO i valori del file',
    );
}

// ---- B2 riepilogo mensile: nome del collaboratore, RDI
const mod = leggi('moduli.js');
{
  const f = new Function(
    costante(mod, 'const MODULI_TIPO_ETICHETTE = {') +
      pezzo(mod, 'function moduloTipoEtichetta(') +
      pezzo(mod, 'function moduliRiepilogoRighe(') +
      'return moduliRiepilogoRighe;',
  )();
  const righe = f([
    { tipo: 'rdi', collaboratore: 'Bianchi Anna' },
    { tipo: 'allineamento', collaboratore: 'Rossi Mario' },
    { tipo: 'allineamento', collaboratore: 'Rossi Mario' },
    { tipo: 'allineamento', collaboratore: 'Verdi Luca' },
  ]);
  eq(
    righe,
    [
      ['Allineamento', 'Rossi Mario', '2'],
      ['Allineamento', 'Verdi Luca', '1'],
      ['RDI', 'Bianchi Anna', '1'],
    ],
    'B2 righe con nome, RDI maiuscolo, ordine per tipo e quantità',
  );
  eq(
    righe.some((r) => r.includes('undefined')),
    false,
    'B2 nessun undefined',
  );
  const search = leggi('search.js');
  eq(/Quantità'\]\]/.test(search) && !/'Quantita'\]/.test(search), true, 'B2 intestazione Quantità con accento');
}

// ---- B3 modulo riaperto senza cambiamenti
{
  const g = new Function(
    pezzo(mod, 'function _moduloDatiNorm(') + pezzo(mod, 'function _moduloCambiato(') + 'return _moduloCambiato;',
  )();
  const db = { scadenza: '', qr_code: 'abc', obiettivo: 'Contare', non_conformita: 'Cassa', firma_digitale: false };
  const form = { qr_code: 'abc', firma_digitale: false, non_conformita: 'Cassa', obiettivo: 'Contare', scadenza: '' };
  const base = { collaboratore: 'Rossi Mario', resp_settore: 'Lara', data_modulo: '2026-10-01' };
  eq(
    g(Object.assign({}, base, { dati: db }), Object.assign({}, base, { dati: form })),
    false,
    'B3 chiavi in altro ordine: non cambiato',
  );
  eq(JSON.stringify(db) === JSON.stringify(form), false, 'B3 prima: il confronto con JSON.stringify li dava diversi');
  const vecchioSenzaScad = { qr_code: 'abc', obiettivo: 'Contare', non_conformita: 'Cassa' };
  eq(
    g(Object.assign({}, base, { dati: vecchioSenzaScad }), Object.assign({}, base, { dati: form })),
    false,
    'B3 modulo vecchio senza scadenza vuota',
  );
  eq(
    g(
      Object.assign({}, base, { dati: db }),
      Object.assign({}, base, { dati: Object.assign({}, form, { obiettivo: 'Contare due volte' }) }),
    ),
    true,
    'B3 testo cambiato: cambiato',
  );
  eq(
    g(Object.assign({}, base, { dati: db }), Object.assign({}, base, { resp_settore: 'Altro', dati: form })),
    true,
    'B3 responsabile cambiato',
  );
  // B10: in modifica i testi di allora
  eq(
    /\(_isRistampaSnap \|\| _isEditSnap\) && existingQr/.test(mod),
    true,
    'B10 la modifica usa i testi salvati nel modulo',
  );
  eq(/if \(!_isEditSnap\) \{\s*const testiUsati/.test(mod), true, 'B10 la modifica non riscrive modello_testi');
}

// ---- B4 modulo 1187 con i testi di allora
{
  const nd = leggi('modulo-nd.js');
  const ctx = new Function(
    'modelloTestiCambiati',
    pezzo(nd, 'function _ndTestiDelModulo(') +
      pezzo(nd, 'function _ndTestiRistampa(') +
      'return { _ndTestiDelModulo, _ndTestiRistampa };',
  )(() => ({ titolo: 'TITOLO NUOVO' }));
  eq(ctx._ndTestiDelModulo(null), { titolo: 'TITOLO NUOVO' }, 'B4 modulo nuovo: testi in uso');
  eq(ctx._ndTestiDelModulo({ modello_testi: {} }), {}, 'B4 modulo con testi originali li tiene');
  eq(
    ctx._ndTestiDelModulo({ modello_testi: { titolo: 'VECCHIO' } }),
    { titolo: 'VECCHIO' },
    'B4 aggiornare i giorni non cambia i testi',
  );
  eq(
    ctx._ndTestiRistampa({ modello_testi: { titolo: 'VECCHIO' } }),
    { titolo: 'VECCHIO' },
    'B4 ristampa con i testi di allora',
  );
  eq(ctx._ndTestiRistampa({ giorni: [] }), undefined, 'B4 modulo di prima: testi in uso');
  eq(/_pdfListaNd\(m\.dati, _ndTestiRistampa\(m\.dati\)\)/.test(nd), true, 'B4 la ristampa passa i testi salvati');
}

// ---- B5 categoria del cliente: una funzione, esatta
const help = leggi('maison-helpers.js');
{
  const f = new Function(
    'getBudgetReparto',
    pezzo(help, 'function _maisonNomeChiave(') + pezzo(help, 'function maisonClienteDi(') + 'return maisonClienteDi;',
  )(() => []);
  const clienti = [
    { nome: 'QA-B Cliente BL', categoria: 'BU' },
    { nome: 'Porcello Angelo', categoria: 'FM' },
    { nome: 'Porcello Bruno', categoria: 'BL' },
    { nome: 'Frigerio Luciano', categoria: 'BL' },
  ];
  eq(f('QA-B Uno', clienti), null, 'B5 QA-B Uno non prende la categoria di QA-B Cliente BL');
  eq(f("QA-B D'Alessio", clienti), null, "B5 QA-B D'Alessio senza categoria");
  eq(f('Porcello Bruno', clienti).categoria, 'BL', 'B5 omonimi: ognuno la sua');
  eq(f('porcello  angelo ', clienti).categoria, 'FM', 'B5 maiuscole e spazi non contano');
  eq(f('Porcello', clienti), null, 'B5 cognome di due clienti: nessuno');
  eq(f('Frigerio', clienti).nome, 'Frigerio Luciano', 'B5 cognome di un cliente solo: quello');
  eq(f('Porcello Carlo', clienti), null, 'B5 cliente tolto non prende la categoria di un omonimo');
  // prima: primo cognome uguale
  const vecchio = (n) => {
    let b = clienti.find((x) => x.nome.toLowerCase() === n.toLowerCase());
    if (!b) {
      const c = n.toLowerCase().split(/\s+/)[0];
      if (c.length >= 3) b = clienti.find((x) => x.nome.toLowerCase().split(/\s+/)[0] === c);
    }
    return b || null;
  };
  eq((vecchio('QA-B Uno') || {}).categoria, 'BU', 'B5 prima: QA-B Uno risultava Buono Unico');
  const core = leggi('maison-core.js');
  const tutti = help + core;
  eq(
    (tutti.match(/split\(\/\\s\+\/\)\[0\] === _cog/g) || []).length,
    0,
    'B5 nessun abbinamento per primo cognome rimasto',
  );
  eq((tutti.match(/maisonClienteDi\(/g) || []).length >= 12, true, 'B5 usata nei punti di categoria (>=12)');
}

// ---- B6 import: Baroni non diventa Micheli
{
  const bud = leggi('maison-budget.js');
  const f = new Function(
    LEV + CAP + pezzo(bud, 'function _soloCorrezioneCognome(') + 'return _soloCorrezioneCognome;',
  )();
  eq(f('Baroni', 'Micheli Baroni Cristina'), 'Micheli Baroni Cristina', 'B6 doppio cognome: nome completo');
  eq(f('Frigerio', 'Frigerio Luciano'), 'Frigerio', 'B6 stesso cognome: resta');
  eq(f('Armelin', 'Armellin Paolo'), 'Armellin', 'B6 errore di battitura del cognome corretto');
  eq(f('Dalozzo', 'Da Lozzo Mario'), 'Da Lozzo', 'B6 cognome di due parole unito');
  eq(f('Xyz', 'Micheli Baroni Cristina'), 'Xyz', 'B6 nessuna parte uguale: resta com e');
  const vecchio = leggiHead('maison-budget.js');
  if (vecchio) {
    const g = new Function(
      LEV + CAP + pezzo(vecchio, 'function _soloCorrezioneCognome(') + 'return _soloCorrezioneCognome;',
    )();
    eq(g('Baroni', 'Micheli Baroni Cristina'), 'Micheli', 'B6 prima: Baroni diventava Micheli');
  }
}

// ---- B7 inventario: CSV/PDF e giacenze dalla stessa lista
{
  const ctx = {};
  const fn = new Function(
    'getInventarioReparto',
    'getMaisonReparto',
    'buoniCodici',
    'buonoRegexQta',
    "const INV_CAMPO_PAREGGIO = 'pareggio_maison_id';" +
      costante(help, 'const INV_MOV_ETICHETTE = {') +
      pezzo(help, 'function _invMovimentiBuoni(') +
      pezzo(help, 'function calcolaGiacenzaBuoni(') +
      pezzo(help, 'function _invQtaSegno(') +
      pezzo(help, 'function _contaBuoniFromNote(') +
      'return { _invMovimentiBuoni, calcolaGiacenzaBuoni, _invQtaSegno };',
  );
  const inv = [
    { id: 1, categoria: 'buono', tipo: 'BU', movimento: 'entrata', quantita: 100, data_movimento: '2026-10-01' },
    {
      id: 2,
      categoria: 'buono',
      tipo: 'BU',
      movimento: 'preassegno',
      quantita: 2,
      cliente: 'Rossi',
      data_movimento: '2026-10-02',
    },
    { id: 3, categoria: 'buono', tipo: 'BL', movimento: 'entrata', quantita: 50, data_movimento: '2026-10-01' },
    {
      id: 4,
      categoria: 'buono',
      tipo: 'BL',
      movimento: 'preassegno',
      quantita: 1,
      cliente: 'Neri',
      pareggiato: true,
      pareggio_maison_id: 99,
      data_movimento: '2026-10-02',
    },
  ];
  const maison = [
    { id: 10, nome: 'Bianchi', tipo_buono: 'BU', note: '3 BU', data_giornata: '2026-10-05' },
    { id: 11, nome: 'Rossi', tipo_buono: 'BU', note: '2 BU', data_giornata: '2026-10-06' },
    { id: 99, nome: 'Neri', tipo_buono: 'BL', note: '1 BL', data_giornata: '2026-10-03' },
  ];
  const f = fn(
    () => inv,
    () => maison,
    () => ['BU', 'BL'],
    () => /(\d+)\s*(BU|BL)/i,
  );
  const mov = f._invMovimentiBuoni();
  const g = f.calcolaGiacenzaBuoni();
  const somma = {};
  mov.forEach((m) => (somma[m.tipo] = (somma[m.tipo] || 0) + m._conta));
  eq(g, somma, 'B7 giacenze = somma delle righe esportate');
  eq(g, { BU: 95, BL: 49 }, 'B7 BU 100-2-3 (Rossi coperto dal pre-assegnato); BL 50-1 pareggiato');
  eq(
    mov.filter((m) => m._auto).map((m) => [m.cliente, f._invQtaSegno(m)]),
    [
      ['Rossi', '(2)'],
      ['Bianchi', '-3'],
    ],
    'B7 righe Da Maison nella lista, quella coperta tra parentesi',
  );
  eq(/doc\.save\('inventario_/.test(help), false, 'B7 il PDF non si scarica piu direttamente (anteprima)');
  eq(/mostraPdfPreview\(doc, nomeFile, 'Inventario '/.test(help), true, 'B7 anteprima interna del programma');
}

// ---- B9 QR: indirizzo dell'Identita o del sito corrente
{
  const id = leggi('identita.js');
  const mk = (cfg) =>
    new Function(
      'identita',
      pezzo(id, 'function _identitaIndirizzoPulito(') +
        pezzo(id, 'function identitaIndirizzo(') +
        'return { _identitaIndirizzoPulito, identitaIndirizzo };',
    )(() => cfg);
  const f = mk({ indirizzo: '' });
  eq(
    f.identitaIndirizzo({ protocol: 'http:', origin: 'http://127.0.0.1:8000', pathname: '/index.html' }),
    'http://127.0.0.1:8000',
    'B9 sito di prova',
  );
  eq(
    f.identitaIndirizzo({ protocol: 'https:', origin: 'https://intranet.casino.local', pathname: '/diario/' }),
    'https://intranet.casino.local/diario',
    'B9 server interno in una cartella',
  );
  eq(
    mk({ indirizzo: 'https://diario.casino.ch' }).identitaIndirizzo({
      protocol: 'http:',
      origin: 'http://x',
      pathname: '/',
    }),
    'https://diario.casino.ch',
    'B9 indirizzo fissato nell Identita',
  );
  eq(
    f._identitaIndirizzoPulito('diario.casino.ch/app/index.html#modulo/x'),
    'https://diario.casino.ch/app',
    'B9 indirizzo pulito',
  );
  eq(f._identitaIndirizzoPulito('non valido <script>'), '', 'B9 testo non valido scartato');
  eq(/digit-diary\.github\.io\/#modulo/.test(mod), false, 'B9 nessun indirizzo fisso nei moduli');
}

// ---- B14 nome simile non troppo largo
{
  const f = new Function(
    LEV +
      pezzo(utils, 'function _nomeSimileSoglia(') +
      pezzo(utils, 'function _nomeSimileDist(') +
      'return _nomeSimileDist;',
  )();
  eq(f('Kaya Sevina', 'Bujic Nada') > 2, true, 'B14 Kaya Sevina non propone Bujic Nada');
  eq(f('Rossi Mrio', 'Rossi Mario') <= 2, true, 'B14 errore di battitura nel nome proposto');
  eq(f('Rossi', 'Rossi Mario'), 0, 'B14 solo cognome proposto');
  eq(f('Sala', 'Sula Marco') <= 2, true, 'B14 una lettera su 4 ammessa');
  eq(f('Bo', 'Bi Anna') > 2, true, 'B14 parole corte: nessun errore ammesso');
  const prom = leggi('promemoria.js');
  const g = new Function(
    'getMaisonReparto',
    'getBudgetReparto',
    pezzo(prom, 'function _trovaNomeSimileMaison(') + 'return _trovaNomeSimileMaison;',
  )(
    () => [{ nome: 'Qa-B Tre' }],
    () => [{ nome: 'Micheli Baroni Cristina' }, { nome: 'Leccese Pietro' }],
  );
  eq(g("Qa-B D'Angelo Spesa"), null, "B14 Qa-B D'Angelo Spesa non propone Qa-B Tre");
  eq(g('Leccese'), { nome: 'Leccese Pietro', tipo: 'simile' }, 'B14 cognome solo: proposta');
  eq(g('Baroni'), { nome: 'Micheli Baroni Cristina', tipo: 'simile' }, 'B14 secondo cognome solo: proposta');
}

// ---- B20 sigle nei nomi
{
  const f = new Function(CAP + 'return capitalizzaNome;')();
  eq(f('QA-B Cliente BL'), 'QA-B Cliente BL', 'B20 sigle tenute');
  eq(f('ROSSI MARIO'), 'Rossi Mario', 'B20 tutto maiuscolo sistemato');
  eq(f("d'amico zoë"), "D'Amico Zoë", 'B20 apostrofo');
  eq(f('Rossi DE Lima'), 'Rossi de Lima', 'B20 particella non e una sigla');
}

// ---- B11 / B12 / B13 / B23
{
  const st = leggi('stats.js');
  const pl = new Function(pezzo(st, 'function _plurale(') + 'return _plurale;')();
  eq([pl('Errore'), pl('Malattia'), pl('Errore cassa')], ['Errori', 'Malattie', 'Errori cassa'], 'B11 plurale');
  eq(/Totale differenze \(ammanchi ed eccedenze\)/.test(st), true, 'B11 etichetta importo chiarita');
  eq(/'Malattia \(giorni\)'/.test(st) && /Impiego da impostare/.test(st), true, 'B12 giorni e impiego da impostare');
  eq(
    (leggi('maison-helpers.js').match(/showFoot: 'lastPage'/g) || []).length >= 2,
    true,
    'B13 totale solo in ultima pagina',
  );
  const giornoDi = new Function(
    'dataLocaleISO',
    pezzo(utils, 'function giornoDi(') + pezzo(mod, 'function _moduloGiorno(') + 'return _moduloGiorno;',
  )(
    (d) =>
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
  );
  process.env.TZ = 'Europe/Zurich';
  const iso = new Date(2026, 9, 23, 0, 30).toISOString(); // 00:30 di Lugano = 22:30 UTC del 22
  eq(giornoDi({ created_at: iso }), '2026-10-23', 'B23 modulo delle 00:30 nel suo giorno');
}

// ---- A23 / A25 / A28 (controllo A)
{
  process.env.TZ = 'Europe/Zurich';
  const dataLocaleISO = (d) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const f = new Function(
    'dataLocaleISO',
    pezzo(utils, 'function giornoDi(') + pezzo(mod, 'function _diarioNelPeriodo(') + 'return _diarioNelPeriodo;',
  )(dataLocaleISO);
  const v0030 = new Date(2026, 9, 22, 0, 30).toISOString(); // 22/10 00:30 a Lugano
  eq(f(v0030, '2026-10-22', '2026-10-22'), true, 'A23 voce delle 00:30 dentro Dal = Al = 22/10');
  eq(new Date(v0030) < new Date('2026-10-22'), true, 'A23 prima: new Date(dal) la escludeva');
  eq(f(new Date(2026, 9, 21, 23, 59).toISOString(), '2026-10-22', ''), false, 'A23 il giorno prima resta fuori');
  eq(f(new Date(2026, 9, 22, 23, 59).toISOString(), '', '2026-10-22'), true, 'A23 fino alle 23:59 del giorno Al');

  const core = leggi('maison-core.js');
  const g = new Function(
    'getBudgetReparto',
    'currentReparto',
    pezzo(core, 'function _getCompleanniProssimi(') +
      pezzo(core, 'function compleannoChi(') +
      'return { _getCompleanniProssimi, compleannoChi };',
  )(() => [], 'slots');
  const oggi = new Date(2026, 9, 23, 10, 0);
  const r = g._getCompleanniProssimi(1, {
    oggi,
    reparto: 'slots',
    collaboratori: [
      { nome: 'Rossi Mario', data_nascita: '1990-10-23', reparto_dip: 'slots' },
      { nome: 'Bianchi Anna', data_nascita: '1985-10-24', reparto_dip: 'entrambi' },
      { nome: 'Altro Settore', data_nascita: '1990-10-23', reparto_dip: 'tavoli' },
      { nome: 'Non Attivo', data_nascita: '1990-10-23', reparto_dip: 'slots', attivo: false },
    ],
    clienti: [{ nome: 'Cliente Uno', data_nascita: '1970-10-23' }],
  });
  eq(
    r.map((x) => [x.nome, x.giorni, g.compleannoChi(x)]),
    [
      ['Rossi Mario', 0, 'collaboratore'],
      ['Cliente Uno', 0, 'cliente Maison'],
      ['Bianchi Anna', 1, 'collaboratore'],
    ],
    'A25 oggi/domani: collaboratori del settore e clienti, ognuno con chi è',
  );
  const help2 = leggi('maison-helpers.js');
  eq(
    /window\.Annulla\.senzaTraccia\(scrivi\)/.test(pezzo(help2, 'async function _checkGiubileiNotifiche(')),
    true,
    'A28 notifiche giubileo fuori dalla barretta Annulla',
  );
}

console.log(passati + ' passati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
