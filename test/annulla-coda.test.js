/**
 * Test della CODA di Annulla / Ripristina (js/annulla.js, creaCodaAnnulla): clic veloci
 * uno dopo l altro = passi eseguiti uno alla volta, nell ordine, mai due insieme.
 *   node test/annulla-coda.test.js
 * Il "piano" finto scrive con ritardi casuali e con la scrittura condizionata (come
 * piano_scrivi_celle: scrive solo se la cella e ancora come la si aspetta). La pila
 * cambia solo a scrittura confermata, come pianoAnnulla e pianoRipristina.
 */
const { creaCodaAnnulla, creaAnnulla } = require('../js/annulla.js');
let passati = 0,
  falliti = 0;
const ok = (c, n) => {
  c ? passati++ : falliti++;
  console.log((c ? '  OK  ' : '  FAIL ') + n);
};
const eq = (a, b, n) =>
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    n + ' (atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a) + ')',
  );
const att = (ms) => new Promise((r) => setTimeout(r, ms));
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// piano finto: n modifiche fatte (stato = numero di modifiche in vigore), pile di passi
function pianoFinto(n, R, opz) {
  opz = opz || {};
  const p = {
    stato: n,
    undo: Array.from({ length: n }, (_, i) => ({ da: i, a: i + 1 })),
    redo: [],
    inVolo: 0,
    massimoInVolo: 0,
    conflitti: 0,
    eseguiti: [],
    falliscaAl: opz.falliscaAl || 0, // n-esima scrittura che fallisce (rete)
    scritture: 0,
  };
  // scrittura condizionata: vale solo se lo stato e quello atteso
  p.scrivi = async (atteso, nuovo) => {
    p.inVolo++;
    p.massimoInVolo = Math.max(p.massimoInVolo, p.inVolo);
    try {
      await att(1 + Math.floor(R() * 12));
      p.scritture++;
      if (p.falliscaAl && p.scritture === p.falliscaAl) throw new Error('connessione assente');
      if (p.stato !== atteso) {
        p.conflitti++;
        throw new Error('cambiata da un altro operatore');
      }
      p.stato = nuovo;
    } finally {
      p.inVolo--;
    }
  };
  p.esegui = async (tipo) => {
    if (tipo === 'tutto') {
      if (!p.undo.length) return { ok: true, niente: true };
      await p.scrivi(p.stato, 0);
      p.redo.push({ da: 0, a: p.undo[p.undo.length - 1].a, tutto: true });
      p.undo = [];
      p.eseguiti.push('T');
      return { ok: true };
    }
    const pila = tipo === 'annulla' ? p.undo : p.redo;
    const altra = tipo === 'annulla' ? p.redo : p.undo;
    if (!pila.length) return { ok: true, niente: true };
    const passo = pila[pila.length - 1]; // resta in pila finche la scrittura non e confermata
    if (tipo === 'annulla') await p.scrivi(passo.a, passo.da);
    else await p.scrivi(passo.da, passo.a);
    pila.pop();
    altra.push(passo);
    p.eseguiti.push(tipo === 'annulla' ? 'A' : 'R');
    return { ok: true };
  };
  return p;
}
function codaPer(p, extra) {
  const fermate = [];
  const c = creaCodaAnnulla(
    Object.assign(
      {
        esegui: (t) => p.esegui(t),
        disponibili: () => ({ annulla: p.undo.length, ripristina: p.redo.length }),
        fermati: (n, es) => fermate.push({ n, errore: es && es.errore ? es.errore.message : null, fermo: !!es.fermo }),
      },
      extra || {},
    ),
  );
  c.fermate = fermate;
  return c;
}

(async () => {
  console.log('\n--- 5 clic di fila = 5 passi, uno alla volta ---');
  {
    const R = rng(1);
    const p = pianoFinto(6, R);
    const c = codaPer(p);
    for (let i = 0; i < 5; i++) c.chiedi('annulla');
    eq(c.stato().inCoda + (c.stato().inCorso ? 1 : 0) >= 4, true, 'i clic si accodano');
    eq(c.stato().annulla, 1, 'pulsante: resta 1 passo da annullare');
    eq(c.stato().ripristina, 5, 'pulsante: 5 passi da ripristinare');
    await c.vuota();
    eq(p.stato, 1, 'stato dopo 5 Annulla');
    eq(p.massimoInVolo, 1, 'mai due scritture insieme');
    eq(p.conflitti, 0, 'nessun conflitto finto');
    eq([p.undo.length, p.redo.length], [1, 5], 'pile coerenti');
    eq(c.stato(), { inCorso: false, inCoda: 0, annulla: 1, ripristina: 5 }, 'stato a coda vuota');
  }

  console.log('\n--- alternati e tasti tenuti premuti ---');
  {
    const R = rng(2);
    const p = pianoFinto(4, R);
    const c = codaPer(p);
    // tenuto premuto: 20 Ctrl+Z, ma i passi sono 4
    let accettati = 0;
    for (let i = 0; i < 20; i++) if (c.chiedi('annulla')) accettati++;
    eq(accettati, 4, 'tasto tenuto: si accodano solo i passi che ci sono');
    for (let i = 0; i < 3; i++) c.chiedi('ripristina');
    c.chiedi('annulla');
    await c.vuota();
    eq(p.eseguiti.join(''), 'AAAARRRA', 'ordine dei passi come i clic');
    eq(p.stato, 2, 'stato finale');
    eq(p.massimoInVolo, 1, 'mai due insieme');
    eq(c.chiedi('ripristina') && c.chiedi('ripristina'), true, 'ripristina fino in cima');
    eq(c.chiedi('ripristina'), false, 'oltre la cima non si accoda');
    await c.vuota();
    eq(p.stato, 4, 'di nuovo allo stato finale');
  }

  console.log('\n--- scrittura che fallisce: pila coerente, i passi dopo non partono ---');
  {
    const R = rng(3);
    const p = pianoFinto(6, R, { falliscaAl: 2 });
    const c = codaPer(p);
    for (let i = 0; i < 5; i++) c.chiedi('annulla');
    await c.vuota();
    eq(p.stato, 5, 'solo il primo passo e fatto');
    eq([p.undo.length, p.redo.length], [5, 1], 'il passo fallito resta in Annulla');
    eq(c.fermate, [{ n: 3, errore: 'connessione assente', fermo: false }], 'messaggio: 3 passi tolti dalla coda');
    eq(c.stato().inCoda, 0, 'coda vuota');
    // si riprova: riparte dal passo giusto
    c.chiedi('annulla');
    await c.vuota();
    eq(p.stato, 4, 'riprovando si annulla il passo rimasto');
  }

  console.log('\n--- conferma rifiutata: la raffica si ferma ---');
  {
    const R = rng(4);
    const p = pianoFinto(5, R);
    const c = codaPer(p, {
      esegui: async (t, giro) => {
        // la prima raffica: l utente risponde Annulla alla domanda; la seconda: Conferma
        if (t === 'annulla' && !giro.chiesto) {
          giro.chiesto = true;
          if (!c.risposto) {
            c.risposto = true;
            return { ok: false, fermo: true };
          }
        }
        return p.esegui(t);
      },
    });
    for (let i = 0; i < 4; i++) c.chiedi('annulla');
    await c.vuota();
    eq(p.stato, 5, 'niente annullato');
    eq(c.fermate, [{ n: 3, errore: null, fermo: true }], 'i 3 passi dopo tolti');
    c.chiedi('annulla');
    await c.vuota();
    eq(p.stato, 4, 'nuova raffica, nuova domanda: passo fatto');
  }

  console.log('\n--- errore lanciato dal passo ---');
  {
    const c = creaCodaAnnulla({
      esegui: async () => {
        throw new Error('boom');
      },
      disponibili: () => ({ annulla: 3, ripristina: 0 }),
      fermati: (n, es) => (c.visto = n + ' ' + es.errore.message),
    });
    c.chiedi('annulla');
    c.chiedi('annulla');
    await c.vuota();
    eq(c.visto, '1 boom', 'errore: si ferma e lo dice');
    eq(c.occupata(), false, 'coda libera dopo un errore');
  }

  console.log('\n--- Annulla tutto in coda dopo i passi chiesti ---');
  {
    const R = rng(5);
    const p = pianoFinto(5, R);
    const c = codaPer(p);
    c.chiedi('annulla');
    c.chiedi('annulla');
    c.chiedi('tutto');
    c.chiedi('ripristina');
    await c.vuota();
    eq(p.eseguiti.join(''), 'AATR', 'ordine con Annulla tutto');
    eq(p.massimoInVolo, 1, 'mai insieme ad Annulla tutto');
  }

  console.log('\n--- svuota ---');
  {
    const R = rng(6);
    const p = pianoFinto(5, R);
    const c = codaPer(p);
    for (let i = 0; i < 5; i++) c.chiedi('annulla');
    c.svuota();
    await c.vuota();
    eq(p.eseguiti.length, 1, 'svuota: resta solo il passo gia partito');
  }

  console.log('\n--- raffiche casuali (seme fisso): stato = modello, Annulla tutto torna all inizio ---');
  {
    let tutteOk = true;
    let maxVolo = 0;
    let conflitti = 0;
    for (let s = 0; s < 200; s++) {
      const R = rng(1000 + s);
      const n = 3 + Math.floor(R() * 5);
      const p = pianoFinto(n, R);
      const c = codaPer(p);
      let pos = n;
      const k = 5 + Math.floor(R() * 10);
      for (let i = 0; i < k; i++) {
        const tipo = R() < 0.55 ? 'annulla' : 'ripristina';
        const volte = R() < 0.2 ? 6 : 1; // tasto tenuto premuto
        for (let v = 0; v < volte; v++) {
          const acc = c.chiedi(tipo);
          const atteso = tipo === 'annulla' ? pos > 0 : pos < n;
          if (acc !== atteso) tutteOk = false;
          if (acc) pos += tipo === 'annulla' ? -1 : 1;
        }
        await att(Math.floor(R() * 6)); // clic a pochi millisecondi
      }
      await c.vuota();
      if (p.stato !== pos || p.undo.length !== pos || p.redo.length !== n - pos) tutteOk = false;
      c.chiedi('tutto');
      await c.vuota();
      if (pos > 0 && p.stato !== 0) tutteOk = false;
      if (pos > 0) {
        c.chiedi('ripristina');
        await c.vuota();
        if (p.stato !== pos) tutteOk = false;
      }
      maxVolo = Math.max(maxVolo, p.massimoInVolo);
      conflitti += p.conflitti;
    }
    ok(tutteOk, '200 raffiche: stato e pile uguali al modello, Annulla tutto e Ripristina esatti');
    eq(maxVolo, 1, '200 raffiche: mai due scritture insieme');
    eq(conflitti, 0, '200 raffiche: nessun conflitto finto');
  }

  console.log('\n--- "in corso" non resta acceso: senzaTraccia accavallato con un Annulla ---');
  {
    // prima: senzaTraccia rimetteva il valore salvato all inizio; partito durante un Annulla
    // e finito dopo, lasciava "in corso" per sempre (Annulla e Ripristina morti)
    const righe = { 1: { id: 1, v: 'b' } };
    const A = creaAnnulla(
      {
        leggi: async () => [Object.assign({}, righe[1])],
        patch: async (t, f, d) => {
          await att(15);
          Object.assign(righe[1], d);
        },
        adesso: () => new Date().toISOString(),
        attesa: (ms, fn) => setTimeout(fn, ms),
        annullaAttesa: (id) => clearTimeout(id),
      },
      { quiete: 5 },
    );
    const op = await A.primaDiPatch('piano_turni', 'id=eq.1', { v: 'c' });
    righe[1].v = 'c';
    A.conferma(op);
    A.chiudiGruppo('modifica');
    const pAnn = A.annulla(); // in corso 15 ms
    await att(2);
    const pSenza = A.senzaTraccia(() => att(40)); // parte durante l Annulla, finisce dopo
    await pAnn;
    await pSenza;
    eq(righe[1].v, 'b', 'annullato');
    eq(A.inCorso(), false, 'dopo: Annulla non resta "in corso"');
    eq(A.stato().ripristina, 1, 'Ripristina disponibile');
  }

  console.log('\n--- senza coda (com era prima): i clic veloci si sovrappongono ---');
  {
    // stesso piano, ma ogni clic parte subito e toglie il passo dalla pila prima di
    // scrivere (pianoAnnulla di prima): la prova documenta il difetto
    const R = rng(7);
    const p = pianoFinto(6, R);
    const vecchio = async () => {
      const passo = p.undo.pop();
      if (!passo) return;
      try {
        await p.scrivi(passo.a, passo.da);
        p.redo.push(passo);
      } catch (e) {
        p.undo.push(passo);
      }
    };
    await Promise.all([vecchio(), vecchio(), vecchio(), vecchio(), vecchio()]);
    ok(
      p.massimoInVolo > 1 && p.conflitti > 0,
      'senza coda: scritture sovrapposte e conflitti finti (' + p.conflitti + ')',
    );
  }

  console.log(
    '\n=======================================\n  ' +
      passati +
      ' passati, ' +
      falliti +
      ' falliti\n=======================================',
  );
  process.exit(falliti ? 1 : 0);
})().catch((e) => {
  console.error('ERRORE', e);
  process.exit(2);
});
