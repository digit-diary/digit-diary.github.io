/**
 * Svuota il mese e giorni chiusi (segnalazione del titolare 16/10/2026), senza browser e
 * senza database:
 *  - _pianoSvuotaCalcola (js/piano-genera.js): Svuota toglie solo i giorni aperti (dal primo
 *    giorno non chiuso alla fine del mese); le celle dei giorni chiusi restano e si contano;
 *    mese tutto chiuso = niente di aperto; mese tutto aperto = tutto;
 *  - _pianoAnnullaFinestra (js/piano-extra.js): l Annulla di un operazione che ha cambiato
 *    anche giorni chiusi (Svuota con i giorni chiusi) li rimette, con il permesso "Giorni
 *    chiusi" e il motivo, in UNA scrittura; senza permesso (o senza motivo) restano e
 *    l avviso li elenca e dice come rimetterli (Versioni del mese);
 *  - _pianoRipristinaStato con opz.riapri (Annulla dalla fotografia del mese): lo stesso.
 *   node test/piano-svuota.test.js
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
    estrai('piano-genera.js', ['PIANO_SVUOTA_TIENI', '_pianoSvuotaCalcola']),
    estrai('piano-schede.js', ['_pianoNdDaSvuota', '_pianoVersioneCalcola']),
    estrai('piano-extra.js', [
      '_pianoAnnullaFinestra',
      '_pianoRiapriChiusi',
      '_pianoAvvisoGiorniChiusi',
      '_pianoRipristinaStato',
    ]),
    'this.T = { _pianoNdDaSvuota, _pianoVersioneCalcola, _pianoSvuotaCalcola, _pianoAnnullaFinestra, _pianoRipristinaStato, _pianoCelleUguali };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;

// oggi 16.10.2026: chiusi i giorni fino al 15
const CHIUSO = (d) => d <= '2026-10-15';
const k = (r) => r.collaboratore + '|' + String(r.data).substring(0, 10);
const norm = (v) => (v == null || v === false || v === '' ? '' : JSON.stringify(v));
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
let db, scritture, sbloccati, avvisi, richieste, permesso, motivo;
const prima = () => [
  cella('Rossi', '2026-10-03', 'S5'),
  cella('Rossi', '2026-10-08', 'V', { motivo_blocco: 'vacanze' }),
  cella('Bianchi', '2026-10-12', 'C', { generato: true, protetto: false }),
  cella('Bianchi', '2026-10-20', 'S1'),
  cella('Verdi', '2026-10-27', 'C4', { commento: 'nota' }),
];
const reset = () => {
  db = [];
  scritture = [];
  sbloccati = new Set();
  avvisi = [];
  richieste = [];
  permesso = true;
  motivo = 'recupero';
};
ctx._pianoUltimoGiorno = () => 31;
ctx.getOperatore = () => 'Tester';
ctx.secGet = async () => JSON.parse(JSON.stringify(db));
ctx._pianoGiornoScrivibile = (d) => !CHIUSO(d) || sbloccati.has(d);
ctx._pianoGiornoBloccato = CHIUSO;
ctx._pianoGiornoSbloccato = (d) => sbloccati.has(d);
ctx.puoSbloccareGiorniChiusi = () => permesso;
ctx.chiediConferma = async () => true;
ctx._pianoConflittoTesto = (c) => c.collaboratore;
ctx._pianoErroreConflitto = () => new Error('conflitto');
ctx.mostraAvviso = async (t) => avvisi.push(t);
// lo sblocco vero chiede il motivo: qui permesso e motivo si scelgono nella prova
ctx._pianoSbloccaGiorni = async (giorni) => {
  richieste.push(giorni);
  if (!permesso || !motivo) return false;
  giorni.forEach((d) => sbloccati.add(d));
  return true;
};
ctx._pianoScriviCelle = async (ops) => {
  scritture.push(ops.length);
  for (const o of ops) {
    const cur = db.find((r) => k(r) === o.collaboratore + '|' + o.data);
    const at = o.atteso;
    const giusta = at === null ? !cur : !!cur && Object.keys(at).every((c) => norm(cur[c]) === norm(at[c]));
    if (!giusta) return { ok: false, conflitti: [{ collaboratore: o.collaboratore, data: o.data, attuale: cur }] };
  }
  ops.forEach((o) => {
    const i = db.findIndex((r) => k(r) === o.collaboratore + '|' + o.data);
    if (o.dati === null) db.splice(i, 1);
    else if (i >= 0) db[i] = Object.assign({}, db[i], o.dati);
    else db.push(Object.assign({ collaboratore: o.collaboratore, data: o.data }, o.dati));
  });
  return { ok: true, righe: [], inizio: 't1', fine: 't2' };
};
// lo storico del database: lo Svuota ha cancellato tutte le celle (giorni chiusi compresi)
ctx._pianoMieModifiche = async () =>
  prima().map((r) => ({ collaboratore: r.collaboratore, data: r.data, prima: r, dopo: null }));
const differenze = () => {
  const A = new Map(prima().map((r) => [k(r), r]));
  const B = new Map(db.map((r) => [k(r), r]));
  return [...new Set([...A.keys(), ...B.keys()])].filter((x) => !T._pianoCelleUguali(A.get(x), B.get(x)));
};

(async () => {
  // ---------- Svuota: che cosa si toglie ----------
  {
    const c = T._pianoSvuotaCalcola(prima(), '2026-10', 31, CHIUSO);
    ok(c.daAperto === '2026-10-16', 'si svuota dal primo giorno aperto (16.10)');
    ok(c.aperte.length === 2 && c.chiuse.length === 3, 'aperte 2, chiuse 3 (restano)');
    ok(c.giorniChiusi.join(',') === '2026-10-03,2026-10-08,2026-10-12', 'giorni chiusi con celle elencati');
    const tutto = T._pianoSvuotaCalcola(prima(), '2026-09', 30, () => true);
    ok(
      tutto.daAperto === null && !tutto.aperte.length && tutto.chiuse.length === 5,
      'mese tutto chiuso: niente di aperto',
    );
    const futuro = T._pianoSvuotaCalcola(
      prima().map((r) => Object.assign(r, { data: r.data.replace('2026-10', '2026-12') })),
      '2026-12',
      31,
      () => false,
    );
    ok(
      futuro.daAperto === '2026-12-01' && futuro.aperte.length === 5 && !futuro.chiuse.length,
      'mese futuro: tutto aperto',
    );
  }
  // ---------- Svuota non tocca mai ND e malattie ----------
  {
    const righe = prima().concat([
      cella('Neri', '2026-10-05', 'ND'),
      cella('Neri', '2026-10-22', 'ND', { commento: 'esame' }),
      cella('Gialli', '2026-10-21', 'M'),
      cella('Gialli', '2026-10-02', 'm1'),
    ]);
    const c = T._pianoSvuotaCalcola(righe, '2026-10', 31, CHIUSO);
    ok(c.assenze.length === 4, 'ND e M restano, nei giorni aperti e chiusi (' + c.assenze.length + ')');
    ok(c.aperte.length === 2 && c.chiuse.length === 3, 'le assenze non si contano fra le celle da togliere');
  }
  // ---------- Versioni: ND cancellate da uno Svuota ----------
  {
    const ist = '2026-10-16T10:00:00Z';
    const ev = {
      // cancellata dallo Svuota (Registro 1 s dopo)
      'Neri|2026-10-05': [{ quando: '2026-10-16T10:05:00.100Z', azione: 'cancellata', da: 'ND' }],
      // tolta a mano dalla cella (nessuno Svuota vicino)
      'Neri|2026-10-06': [
        { quando: '2026-10-16T09:00:00Z', azione: 'nuova', da: null },
        { quando: '2026-10-16T11:00:00Z', azione: 'cancellata', da: 'ND' },
      ],
      // cambiata in S5 e poi cancellata dallo Svuota: l ultima cancellazione non e di una ND
      'Neri|2026-10-07': [
        { quando: '2026-10-16T10:01:00Z', azione: 'modifica', da: 'ND' },
        { quando: '2026-10-16T10:05:00.200Z', azione: 'cancellata', da: 'S5' },
      ],
      // cancellata dallo Svuota e poi riempita dalla bozza: torna la ND
      'Neri|2026-10-20': [
        { quando: '2026-10-16T10:05:00.300Z', azione: 'cancellata', da: 'ND' },
        { quando: '2026-10-16T10:06:00Z', azione: 'nuova', da: null },
      ],
      // cancellata prima dell istante: non riguarda questa versione
      'Neri|2026-10-08': [{ quando: '2026-10-16T08:00:00Z', azione: 'cancellata', da: 'ND' }],
    };
    const sel = T._pianoNdDaSvuota(ev, [{ created_at: '2026-10-16T10:05:01Z' }], ist);
    ok(
      sel.has('Neri|2026-10-05') && sel.has('Neri|2026-10-20') && sel.size === 2,
      'solo le ND cancellate dallo Svuota, anche se poi la bozza ha scritto la cella (' + [...sel] + ')',
    );
    ok(T._pianoNdDaSvuota(ev, [], ist).size === 0, 'senza Svuota nel Registro: nessuna ND rimessa');
    const v = [cella('Neri', '2026-10-05', 'ND'), cella('Neri', '2026-10-06', 'ND'), cella('Neri', '2026-10-20', 'ND')];
    const c = T._pianoVersioneCalcola(v, [cella('Neri', '2026-10-20', 'S7', { generato: true })], {
      bloccato: CHIUSO,
      ndSvuota: sel,
    });
    ok(
      c.rimetti.join() === 'Neri|2026-10-05,Neri|2026-10-20' && c.passate.length === 1,
      'Versioni: le ND dello Svuota tornano (passato e sopra la bozza)',
    );
    ok(c.nd.join() === 'Neri|2026-10-06' && c.ndSvuota.length === 2, 'la ND tolta di proposito resta come oggi');
  }
  // ---------- Annulla di uno Svuota con i giorni chiusi ----------
  {
    reset();
    const es = await T._pianoAnnullaFinestra({ t0: 't0', label: 'cancella piano' }, {});
    ok(es.cambiate === 5 && !es.chiusi.length, 'con permesso e motivo: tornano tutte e 5, giorni chiusi compresi');
    ok(scritture.length === 1, 'in UNA scrittura');
    ok(richieste.length === 1 && richieste[0].length === 3, 'chiede il motivo una volta per i 3 giorni chiusi');
    ok(!avvisi.length, 'nessun avviso di celle lasciate');
    ok(differenze().length === 0, 'il mese e com era prima dello Svuota: 0 differenze');
  }
  {
    reset();
    permesso = false;
    const es = await T._pianoAnnullaFinestra({ t0: 't0', label: 'cancella piano' }, {});
    ok(es.cambiate === 2 && es.chiusi.length === 3, 'senza permesso: tornano le 2 aperte, le 3 chiuse restano');
    ok(!richieste.length, 'senza permesso non chiede il motivo');
    ok(avvisi.length === 1 && /permesso "Giorni chiusi"/.test(avvisi[0]), 'l avviso dice che serve il permesso');
    ok(/Versioni del mese/.test(avvisi[0]), 'e come rimetterle (Versioni del mese)');
  }
  {
    reset();
    motivo = '';
    const es = await T._pianoAnnullaFinestra({ t0: 't0', label: 'cancella piano' }, {});
    ok(es.cambiate === 2 && es.chiusi.length === 3, 'con permesso ma senza motivo: le chiuse restano');
    ok(avvisi.length === 1 && /Senza motivo/.test(avvisi[0]), 'e l avviso lo dice');
  }
  // ---------- Annulla dalla fotografia del mese (database non aggiornato) ----------
  {
    reset();
    const es = await T._pianoRipristinaStato(
      { ym: '2026-10', rep: 'slots', label: 'cancella', righe: prima() },
      {
        riapri: true,
      },
    );
    ok(es.cambiate === 5 && !es.chiusi.length && differenze().length === 0, 'fotografia + riapri: tutto torna');
    reset();
    permesso = false;
    const es2 = await T._pianoRipristinaStato(
      { ym: '2026-10', rep: 'slots', label: 'cancella', righe: prima() },
      {
        riapri: true,
      },
    );
    ok(es2.cambiate === 2 && es2.chiusi.length === 3 && avvisi.length === 1, 'senza permesso: chiuse elencate');
    reset();
    const es3 = await T._pianoRipristinaStato({ ym: '2026-10', rep: 'slots', label: 'x', righe: prima() }, {});
    ok(es3.cambiate === 2 && !richieste.length, 'senza riapri (anteprima di una versione): i chiusi non si chiedono');
  }
  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
