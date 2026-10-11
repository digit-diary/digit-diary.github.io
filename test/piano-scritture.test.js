/**
 * Scritture del Piano (js/piano-core.js) e passi di Annulla (js/piano-extra.js), senza
 * browser e senza database:
 *  - _pianoOpsUnisci: la stessa cella due volte nella stessa scrittura; "cancella poi
 *    scrivi" sostituisce la cella (prima diventava una modifica parziale);
 *  - passo di Annulla chiuso alla fine dell operazione: le scritture dopo (malattia dal
 *    Diario, generazione automatica) non entrano nella sua finestra;
 *  - celle registrate nel passo e filtro mese/settore;
 *  - _pianoMieModifiche: piu finestre (Annulla tutto) unite per cella;
 *  - funzione del database assente per un attimo (404): si riprova, poi si avvisa.
 *   node test/piano-scritture.test.js
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

// le funzioni vere, prese dai file del programma (dichiarazioni di primo livello)
function estrai(file, nomi) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  return nomi
    .map((n) => {
      const re = new RegExp('^(?:async )?function ' + n + '\\(|^(?:const|let) ' + n + ' =', 'm');
      const m = re.exec(src);
      if (!m) throw new Error(n + ' non trovata in ' + file);
      // funzione: fino alla prima riga "}" di primo livello; costante su una riga: la
      // riga; costante su piu righe: fino a "];" o "};" di primo livello
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
const ctx = {
  window: {},
  console: { warn() {}, error() {}, log() {} },
  Date,
  Set,
  Map,
  JSON,
  Promise,
  setTimeout: (f) => f(),
  toasts: [],
};
ctx.toastErrore = (t) => ctx.toasts.push(String(t));
ctx.getOpToken = () => 'tk';
ctx.getOperatore = () => 'Tester';
vm.createContext(ctx);
vm.runInContext(
  [
    estrai('piano-core.js', [
      'PIANO_CAMPI_CELLA',
      '_pianoValNorm',
      '_pianoCelleUguali',
      'PIANO_CELLA_VUOTA',
      '_pianoOpsUnisci',
      '_pianoAttesoDi',
      '_pianoVerificaScritte',
      'PIANO_RIPROVE_FUNZIONE',
      '_pianoFunzioniAssenti',
      '_pianoAvvisoFunzioneAssente',
      '_pianoErroreFunzioneAssente',
      '_pianoFunzioneAssente',
      '_pianoFunzionePresente',
      '_pianoFunzioneMancante',
      '_pianoScriviCelleManca',
      '_pianoErroreRete',
      '_pianoScriviCelle',
      '_pianoOperazioniInCorso',
      '_pianoOperazione',
      '_pianoFuoriDalPasso',
    ]),
    estrai('piano-extra.js', [
      '_pianoUndoChiudi',
      '_pianoUndoChiudiAperto',
      '_pianoPassoRegistra',
      '_pianoSessFinestra',
      '_pianoFiltroPasso',
      '_pianoMieModifiche',
    ]),
    // per l accesso dai test (le let/const di primo livello non finiscono in globalThis)
    'this.T = { _pianoOpsUnisci, _pianoVerificaScritte, _pianoScriviCelle, _pianoOperazione, _pianoFuoriDalPasso, _pianoUndoChiudi, _pianoPassoRegistra, _pianoFiltroPasso, _pianoMieModifiche, stato: () => ({ manca: _pianoScriviCelleManca, assenti: _pianoFunzioniAssenti }) };',
  ].join('\n'),
  ctx,
);
const T = ctx.T;
ctx._pianoUltimoGiorno = () => 31;
ctx._pianoOraServer = () => new Date(ctx._ora).toISOString();
ctx._ora = Date.parse('2026-12-01T10:00:00Z');

(async () => {
  // ---------- _pianoOpsUnisci ----------
  {
    const u = T._pianoOpsUnisci([
      { collaboratore: 'A', data: '2026-12-03', atteso: { codice: 'S1' }, dati: { codice: 'C' } },
      { collaboratore: 'A', data: '2026-12-03', atteso: { codice: 'X' }, dati: { commento: 'n' } },
    ]);
    ok(u.length === 1 && u[0].atteso.codice === 'S1', 'stessa cella: resta il controllo della prima');
    ok(u[0].dati.codice === 'C' && u[0].dati.commento === 'n', 'modifica + modifica: i dati si uniscono');
  }
  {
    const u = T._pianoOpsUnisci([
      { collaboratore: 'A', data: '2026-12-03', atteso: { codice: 'M', protetto: true }, dati: null },
      { collaboratore: 'A', data: '2026-12-03', atteso: null, dati: { codice: 'S1', reparto_dip: 'slots' } },
    ]);
    const d = u[0].dati;
    ok(u.length === 1 && u[0].sostituisce === true, 'cancella poi scrivi: sostituzione');
    ok(
      d.codice === 'S1' &&
        d.protetto === false &&
        d.commento === null &&
        d.motivo_blocco === null &&
        d.prima_malattia === null,
      'cancella poi scrivi: i campi della cella cancellata NON restano (protetto, commento, blocco, prima_malattia)',
    );
    ok(u[0].atteso.codice === 'M', 'cancella poi scrivi: controllo sulla cella com era');
  }
  {
    const u = T._pianoOpsUnisci([
      { collaboratore: 'A', data: '2026-12-03', atteso: null, dati: { codice: 'S1' } },
      { collaboratore: 'A', data: '2026-12-03', dati: null },
    ]);
    ok(u[0].dati === null && !u[0].sostituisce, 'scrivi poi cancella: cancellazione');
  }

  // ---------- verifica della strada vecchia ----------
  {
    let err = null;
    try {
      T._pianoVerificaScritte(
        [{ collaboratore: 'A', data: '2026-12-03', dati: { codice: 'C', updated_at: 'x' } }],
        [{ codice: 'S1' }],
      );
    } catch (e) {
      err = e.message;
    }
    ok(/Permesso mancante/.test(err || ''), 'strada vecchia: modifica scartata dal canale = "Permesso mancante"');
    let err2 = null;
    try {
      T._pianoVerificaScritte([{ collaboratore: 'A', data: '2026-12-03', dati: { codice: 'C' } }], [{ codice: 'C' }]);
    } catch (e) {
      err2 = e;
    }
    ok(!err2, 'strada vecchia: modifica arrivata = nessun errore');
  }

  // ---------- 404 passeggero ----------
  {
    let chiamate = 0;
    ctx._conSessione = (f, tk) => f(tk);
    ctx._rpcSicura = async (fn) => {
      chiamate++;
      if (chiamate === 1) {
        const e = new Error('Could not find the function public.piano_scrivi_celle in the schema cache');
        e.status = 404;
        throw e;
      }
      return { ok: true, righe: [null], fine: '2026-12-01T10:00:01Z' };
    };
    const r = await T._pianoScriviCelle([
      { collaboratore: 'A', data: '2026-12-03', atteso: null, dati: { codice: 'C' } },
    ]);
    ok(
      r.ok && chiamate === 2 && T.stato().manca === false,
      '404 passeggero: si riprova e si resta sulla strada sicura',
    );
    ok(ctx.toasts.length === 0, '404 passeggero: nessun avviso');
    // assente davvero: dopo i tentativi, strada vecchia e avviso visibile UNA volta
    let n = 0;
    ctx._rpcSicura = async () => {
      n++;
      const e = new Error('Could not find the function');
      e.status = 404;
      throw e;
    };
    ctx._pianoScriviCelleVecchio = async (ops) => ({ ok: true, righe: ops.map(() => null), ops });
    await T._pianoScriviCelle([{ collaboratore: 'A', data: '2026-12-03', atteso: null, dati: { codice: 'C' } }]);
    await T._pianoScriviCelle([{ collaboratore: 'A', data: '2026-12-04', atteso: null, dati: { codice: 'C' } }]);
    ok(
      n === 4 && T.stato().manca === true,
      'assente davvero: 4 tentativi, poi la strada di prima (la seconda scrittura non riprova)',
    );
    ok(ctx.toasts.length === 1 && /Avvisa l IT/.test(ctx.toasts[0]), 'assente davvero: avviso visibile, una volta');
    // dopo 5 minuti si ricontrolla
    T.stato().assenti.scrivi = Date.now() - 6 * 60 * 1000;
    ctx._rpcSicura = async () => ({ ok: true, righe: [null], fine: '2026-12-01T10:00:02Z' });
    const r3 = await T._pianoScriviCelle([
      { collaboratore: 'A', data: '2026-12-05', atteso: null, dati: { codice: 'C' } },
    ]);
    ok(r3.ok && T.stato().manca === false, 'dopo 5 minuti si ricontrolla e si torna alla strada sicura');
  }

  // ---------- passo di Annulla chiuso alla fine dell operazione ----------
  {
    const st = { t0: '2026-12-01T10:00:00.000Z', ym: '2026-12', rep: 'slots', celle: new Set() };
    ctx.window._pianoPassoAperto = st;
    ctx._ora = Date.parse('2026-12-01T10:00:05Z');
    await T._pianoOperazione(async () => {
      T._pianoPassoRegistra([{ collaboratore: 'A', data: '2026-12-03' }], '2026-12-01T10:00:09.000Z');
      // dentro l operazione una scrittura "fuori dal passo" (Diario) NON chiude il passo
      T._pianoFuoriDalPasso();
      ok(!st.t1, 'malattia scritta DENTRO un operazione del Piano: il passo resta aperto');
    });
    ok(
      st.t1 === '2026-12-01T10:00:09.001Z',
      'fine operazione: finestra chiusa dopo l ultima scrittura (ora del database)',
    );
    ok(ctx.window._pianoPassoAperto === null, 'fine operazione: nessun passo aperto');
    T._pianoPassoRegistra([{ collaboratore: 'B', data: '2026-12-04' }], '2026-12-01T10:01:00Z');
    ok(!st.celle.has('B|2026-12-04'), 'scrittura dopo la fine (Diario): non entra nel passo');
    ok(st.celle.has('A|2026-12-03'), 'la cella dell operazione e nel passo');
    const tieni = T._pianoFiltroPasso(st);
    ok(
      tieni({ collaboratore: 'A', data: '2026-12-03', prima: { reparto_dip: 'valet' } }),
      'filtro: cella dell operazione anche di un altro settore',
    );
    ok(
      !tieni({ collaboratore: 'Z', data: '2026-12-09', prima: { reparto_dip: 'valet' } }),
      'filtro: altra cella di un altro settore esclusa',
    );
    ok(
      tieni({ collaboratore: 'Z', data: '2026-12-09', dopo: { reparto_dip: 'slots' } }),
      'filtro: altra cella del mese e settore (scrittura senza strada sicura) inclusa',
    );
  }

  // ---------- finestre unite (Annulla tutto) ----------
  {
    const chiesti = [];
    ctx._rpcSicura = async (fn, p) => {
      chiesti.push([p.p_dal, p.p_al]);
      if (p.p_dal === '2026-12-01T10:00:00Z')
        return [{ collaboratore: 'A', data: '2026-12-03', prima: { codice: 'S1' }, dopo: { codice: 'C' } }];
      return [{ collaboratore: 'A', data: '2026-12-03', prima: { codice: 'C' }, dopo: { codice: 'R22' } }];
    };
    const m = await T._pianoMieModifiche(
      [
        { t0: '2026-12-01T12:00:00Z', t1: '2026-12-01T12:00:05Z' },
        { t0: '2026-12-01T10:00:00Z', t1: '2026-12-01T10:00:05Z' },
        { t0: '2026-12-01T10:00:05Z', t1: '2026-12-01T10:00:07Z' }, // attaccata alla precedente
      ],
      {},
    );
    ok(chiesti.length === 2, 'finestre attaccate: una lettura sola (2 invece di 3)');
    ok(
      chiesti.some((x) => x[0] === '2026-12-01T10:00:00Z' && x[1] === '2026-12-01T10:00:07Z'),
      'finestre attaccate: unite da 10:00:00 a 10:00:07',
    );
    ok(
      m.length === 1 && m[0].prima.codice === 'S1' && m[0].dopo.codice === 'R22',
      'stessa cella in due finestre: prima della prima, dopo dell ultima',
    );
  }

  console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
  process.exit(falliti ? 1 : 0);
})();
