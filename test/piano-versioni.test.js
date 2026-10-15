/**
 * Versioni del mese (js/piano-schede.js) e ripristino mirato (js/piano-extra.js), senza
 * browser e senza database:
 *  - _pianoVersioneCalcola: tutte le celle diverse, passato compreso (sigla, protetta,
 *    bozza, lucchetto, nota); quali sono nei giorni chiusi; malattie del Diario e celle di
 *    un altro settore che restano come oggi;
 *  - _pianoRipristinaStato: con il passato confermato (opz.passato) i giorni chiusi si
 *    rimettono in UNA scrittura; senza, restano e si elencano; il suo Annulla
 *    (st.passato) riapre i giorni con il motivo; opz.solo limita alle celle scelte;
 *  - il risultato e la versione: 0 differenze cella per cella.
 *   node test/piano-versioni.test.js
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
const ctx = { console, Date, Set, Map, JSON, Promise, Object, Array, String };
vm.createContext(ctx);
vm.runInContext(
  [
    estrai('piano-core.js', ['PIANO_CAMPI_CELLA', '_pianoValNorm', '_pianoCelleUguali', '_pianoCampiDi']),
    estrai('piano-schede.js', ['_pianoVersioneCalcola', '_pianoVersioneCella']),
    estrai('piano-schede.js', ['PIANO_PERMESSO_VERSIONI', 'puoRipristinareVersioni']),
    estrai('piano-extra.js', ['_pianoRipristinaStato', '_pianoMappaRighe', '_pianoPassoVersioneConsentito']),
    'this.T = { _pianoPassoVersioneConsentito, puoRipristinareVersioni, _pianoVersioneCalcola, _pianoVersioneCella, _pianoRipristinaStato, _pianoMappaRighe, _pianoCelleUguali };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;

// database finto: le righe del piano; oggi = 15.10.2026, chiusi i giorni fino al 13
const OGGI_CHIUSO = (d) => d <= '2026-10-13';
let db = [];
let scritture = [];
let sbloccati = new Set();
let avvisiChiusi = [];
let richiesteSblocco = [];
let consentiSblocco = true;
const norm = (v) => (v == null || v === false || v === '' ? '' : JSON.stringify(v));
const k = (r) => r.collaboratore + '|' + String(r.data).substring(0, 10);
ctx._pianoUltimoGiorno = () => 31;
ctx.getOperatore = () => 'Tester';
ctx.secGet = async () => JSON.parse(JSON.stringify(db));
ctx._pianoGiornoScrivibile = (d) => !OGGI_CHIUSO(d) || sbloccati.has(d);
ctx.chiediConferma = async () => true;
ctx._pianoConflittoTesto = (c) => c.collaboratore;
ctx._pianoAvvisoGiorniChiusi = async (l) => avvisiChiusi.push(l);
ctx._pianoSbloccaGiorni = async (giorni) => {
  richiesteSblocco.push(giorni);
  if (consentiSblocco) giorni.forEach((d) => sbloccati.add(d));
  return consentiSblocco;
};
// la scrittura sicura: tutto o niente, controllo "atteso"
ctx._pianoScriviCelle = async (ops) => {
  scritture.push(ops.length);
  for (const o of ops) {
    const cur = db.find((r) => k(r) === o.collaboratore + '|' + o.data);
    const atteso = o.atteso;
    const giusta = atteso === null ? !cur : !!cur && Object.keys(atteso).every((c) => norm(cur[c]) === norm(atteso[c]));
    if (!giusta) return { ok: false, conflitti: [{ collaboratore: o.collaboratore, data: o.data, attuale: cur }] };
  }
  ops.forEach((o) => {
    const i = db.findIndex((r) => k(r) === o.collaboratore + '|' + o.data);
    if (o.dati === null) db.splice(i, 1);
    else if (i >= 0) db[i] = Object.assign({}, db[i], o.dati);
    else db.push(Object.assign({ collaboratore: o.collaboratore, data: o.data }, o.dati));
  });
  return { ok: true, righe: [] };
};
const cella = (nome, d, cod, extra) =>
  Object.assign(
    {
      collaboratore: nome,
      data: d,
      codice: cod,
      protetto: true,
      generato: false,
      ora_inizio: null,
      ora_fine: null,
      commento: null,
      colore: null,
      motivo_blocco: null,
      fasce: null,
      prima_malattia: null,
      reparto_dip: 'slots',
      operatore: 'X',
    },
    extra || {},
  );
// la versione: passato e futuro, una cella con il lucchetto, una della bozza
const versione = [
  cella('Rossi', '2026-10-03', 'S5'),
  cella('Rossi', '2026-10-08', 'V', { motivo_blocco: 'vacanze' }),
  cella('Bianchi', '2026-10-12', 'C', { generato: true, protetto: false }),
  cella('Bianchi', '2026-10-20', 'S1'),
  cella('Verdi', '2026-10-27', 'C4', { commento: 'nota' }),
  cella('Neri', '2026-10-05', 'S7'),
];
// oggi: svuotate, cambiate, flag cambiati, passato e futuro
const oggi = () => [
  cella('Rossi', '2026-10-08', 'V'), // lucchetto tolto
  cella('Bianchi', '2026-10-12', 'C', { generato: false, protetto: true }), // flag
  cella('Bianchi', '2026-10-20', 'C'), // sigla
  cella('Verdi', '2026-10-27', 'C4'), // nota tolta
  cella('Verdi', '2026-10-02', 'S3'), // nuova nel passato
  cella('Neri', '2026-10-05', 'S7'), // uguale
];
const confronta = () => {
  const A = new Map(versione.map((r) => [k(r), r]));
  const B = new Map(db.map((r) => [k(r), r]));
  return [...new Set([...A.keys(), ...B.keys()])].filter((x) => !T._pianoCelleUguali(A.get(x), B.get(x)));
};
const reset = () => {
  db = oggi();
  scritture = [];
  sbloccati = new Set();
  avvisiChiusi = [];
  richiesteSblocco = [];
  consentiSblocco = true;
};

(async () => {
  // ---------- che cosa si rimette ----------
  {
    const c = T._pianoVersioneCalcola(versione, oggi(), { bloccato: OGGI_CHIUSO });
    ok(c.rimetti.length === 6, 'tutte le 6 celle diverse, passato compreso (ottenuto ' + c.rimetti.length + ')');
    ok(c.passate.length === 4, '4 nei giorni chiusi (ottenuto ' + c.passate.length + ')');
    ok(c.giorniPassati.join(',') === '2026-10-02,2026-10-03,2026-10-08,2026-10-12', 'giorni chiusi elencati');
    ok(c.rimetti.includes('Bianchi|2026-10-12'), 'conta anche protetta/bozza cambiata (stessa sigla)');
    ok(c.rimetti.includes('Rossi|2026-10-08'), 'conta anche il lucchetto tolto (stessa sigla)');
    ok(!c.rimetti.includes('Neri|2026-10-05'), 'cella uguale: non si tocca');
  }
  {
    // malattie: la M di oggi registrata nel Diario resta; la M di allora non piu nel
    // Diario non torna; una M senza Diario si toglie come le altre celle
    const v = [cella('A', '2026-10-20', 'S1'), cella('B', '2026-10-21', 'M'), cella('C', '2026-10-22', 'S2')];
    const o = [cella('A', '2026-10-20', 'M'), cella('B', '2026-10-21', 'S5'), cella('C', '2026-10-22', 'M')];
    const c = T._pianoVersioneCalcola(v, o, { bloccato: OGGI_CHIUSO, malattie: { 'A|2026-10-20': true } });
    ok(c.malattia.join(',') === 'A|2026-10-20,B|2026-10-21', 'malattie che restano (vale il Diario)');
    ok(c.rimetti.join(',') === 'C|2026-10-22', 'M senza registrazione nel Diario: si toglie');
  }
  {
    const v = [cella('A', '2026-10-20', 'S1')];
    const c = T._pianoVersioneCalcola(v, [], { altroSettore: new Set(['A|2026-10-20']) });
    ok(c.altroSettore.length === 1 && !c.rimetti.length, 'cella oggi nel piano di un altro settore: resta');
  }
  {
    // assenze ND: vale il modulo 1187, restano come oggi (ND messa dopo o ND di allora)
    const v = [cella('A', '2026-10-20', 'S1'), cella('B', '2026-10-21', 'ND'), cella('C', '2026-10-03', 'ND')];
    const o = [
      cella('A', '2026-10-20', 'ND'),
      cella('B', '2026-10-21', 'C'),
      cella('C', '2026-10-03', 'ND', { commento: 'x' }),
    ];
    const c = T._pianoVersioneCalcola(v, o, { bloccato: OGGI_CHIUSO });
    ok(c.nd.length === 3 && !c.rimetti.length && !c.passate.length, 'assenze ND: restano come oggi, anche nel passato');
  }
  ok(T._pianoVersioneCella(cella('A', 'x', 'V', { motivo_blocco: 'm' })) === 'V (lucchetto)', 'anteprima: lucchetto');
  ok(T._pianoVersioneCella(null) === 'vuota', 'anteprima: vuota');

  // ---------- ripristino con il passato confermato ----------
  {
    reset();
    const c = T._pianoVersioneCalcola(versione, db, { bloccato: OGGI_CHIUSO });
    const es = await T._pianoRipristinaStato(
      { ym: '2026-10', rep: 'slots', righe: T._pianoMappaRighe(versione, 'slots') },
      { memoria: oggi(), solo: new Set(c.rimetti), passato: true },
    );
    ok(
      es.cambiate === 6 && scritture.length === 1 && scritture[0] === 6,
      'passato confermato: 6 celle in UNA scrittura',
    );
    ok(!avvisiChiusi.length, 'nessuna cella lasciata nei giorni chiusi');
    const d = confronta();
    ok(d.length === 0, 'versione e risultato: 0 differenze cella per cella (' + d.join(';') + ')');
  }
  // ---------- senza il passato: restano e si elencano (prima: in silenzio nell anteprima) ----------
  {
    reset();
    const es = await T._pianoRipristinaStato({
      ym: '2026-10',
      rep: 'slots',
      righe: T._pianoMappaRighe(versione, 'slots'),
    });
    ok(es.cambiate === 2 && es.chiusi.length === 4, 'senza conferma del passato: 2 da oggi, 4 chiuse lasciate');
    ok(avvisiChiusi.length === 1 && avvisiChiusi[0].length === 4, 'le 4 chiuse si elencano');
  }
  // ---------- solo da oggi in poi ----------
  {
    reset();
    const c = T._pianoVersioneCalcola(versione, db, { bloccato: OGGI_CHIUSO });
    const futuro = c.rimetti.filter((x) => !c.passate.includes(x));
    sbloccati.add('2026-10-03'); // un giorno sbloccato prima: "solo da oggi" non lo tocca
    const es = await T._pianoRipristinaStato(
      { ym: '2026-10', rep: 'slots', righe: T._pianoMappaRighe(versione, 'slots') },
      { solo: new Set(futuro) },
    );
    ok(es.cambiate === 2 && !avvisiChiusi.length, 'solo da oggi in poi: 2 celle, nessun giorno passato toccato');
    ok(!db.some((r) => k(r) === 'Rossi|2026-10-03'), 'giorno passato sbloccato ma non scelto: resta com e');
  }
  // ---------- Annulla del ripristino (st.passato): i giorni si riaprono con il motivo ----------
  {
    reset();
    db = T._pianoMappaRighe(versione, 'slots'); // dopo il ripristino
    const passo = {
      ym: '2026-10',
      rep: 'slots',
      righe: T._pianoMappaRighe(oggi(), 'slots'),
      passato: true,
      label: 'riporta a',
    };
    const es = await T._pianoRipristinaStato(passo, {});
    ok(richiesteSblocco.length === 1, 'Annulla: chiede il motivo per riaprire i giorni passati');
    ok(es.cambiate === 6 && !avvisiChiusi.length, 'Annulla: rimette anche i giorni passati');
    const B = new Map(db.map((r) => [k(r), r]));
    const O = new Map(oggi().map((r) => [k(r), r]));
    ok(
      [...new Set([...B.keys(), ...O.keys()])].every((x) => T._pianoCelleUguali(B.get(x), O.get(x))),
      'Annulla: il mese torna com era prima del ripristino',
    );
  }
  {
    reset();
    consentiSblocco = false; // senza permesso o senza motivo
    db = T._pianoMappaRighe(versione, 'slots');
    const passo = { ym: '2026-10', rep: 'slots', righe: T._pianoMappaRighe(oggi(), 'slots'), passato: true };
    const es = await T._pianoRipristinaStato(passo, {});
    ok(es.cambiate === 2 && avvisiChiusi.length === 1, 'Annulla senza sblocco: i giorni passati restano e si elencano');
  }
  // ---------- tutto o niente ----------
  {
    reset();
    const memoria = oggi();
    db.find((r) => k(r) === 'Bianchi|2026-10-20').codice = 'S9'; // un collega dopo l anteprima
    ctx.chiediConferma = async () => false; // "lascia le sue modifiche"
    const es = await T._pianoRipristinaStato(
      { ym: '2026-10', rep: 'slots', righe: T._pianoMappaRighe(versione, 'slots') },
      { memoria: memoria, passato: true },
    );
    ok(es.altri.length === 1 && es.cambiate === 5, 'cella cambiata da un collega dopo l anteprima: si chiede');
    ok(db.find((r) => k(r) === 'Bianchi|2026-10-20').codice === 'S9', 'la sua modifica resta');
    ctx.chiediConferma = async () => true;
  }

  // ---------- permesso proprio: Ripristinare una versione ----------
  {
    const toasts = [];
    ctx.toast = (t) => toasts.push(t);
    ctx.puoGestirePiano = () => true;
    ctx.isAdmin = () => false;
    let concessi = [];
    ctx.puoModificare = (k) => concessi.includes(k);
    ok(!T.puoRipristinareVersioni(), 'senza il permesso: niente ripristino (anche se gestisce il piano)');
    const passo = { versione: true, label: 'riporta a 12.10' };
    ok(
      !T._pianoPassoVersioneConsentito(passo) && /Serve il permesso Ripristinare una versione/.test(toasts[0]),
      'Annulla/Ripristina di un ripristino: fermo, con la scritta del permesso',
    );
    ok(T._pianoPassoVersioneConsentito({ label: 'cella' }), 'gli altri passi di Annulla non cambiano');
    concessi = ['piano_ripristino_versioni'];
    ok(
      T.puoRipristinareVersioni() && T._pianoPassoVersioneConsentito(passo),
      'con il permesso: ripristino, Annulla e Ripristina',
    );
    ctx.puoGestirePiano = () => false;
    ok(!T.puoRipristinareVersioni(), 'con il permesso ma senza poter modificare il piano: niente');
    ctx.isAdmin = () => true;
    ctx.puoGestirePiano = () => true;
    concessi = [];
    ok(T.puoRipristinareVersioni(), 'amministratore: sempre');
  }

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
