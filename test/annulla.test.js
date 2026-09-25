/**
 * Test di Annulla / Ripristina generale (js/annulla.js), con un canale dati finto.
 *   node test/annulla.test.js
 */
const { creaAnnulla } = require('../js/annulla.js');
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

// canale finto: tabelle in memoria, impostazioni, orologio e timer controllati a mano
function canaleFinto() {
  const db = { moduli: [], registrazioni: [], piano_vacanze: [], piano_turni: [], log_attivita: [], piano: [] };
  const impostazioni = {};
  let seq = 100;
  const timers = [];
  const filtra = (rows, f) => {
    if (!f) return rows;
    return f.split('&').reduce((acc, p) => {
      const [k, v] = p.split('=');
      const [op, val] = [v.substring(0, v.indexOf('.')), v.substring(v.indexOf('.') + 1)];
      return acc.filter((r) => (op === 'eq' ? String(r[k]) === val : true));
    }, rows);
  };
  const c = {
    db,
    impostazioni,
    timers,
    scritture: [],
    leggi: async (q) => {
      const [t, f] = q.split('?');
      return filtra(db[t] || [], f).map((r) => JSON.parse(JSON.stringify(r)));
    },
    leggiImp: async (k) => (k in impostazioni ? impostazioni[k] : null),
    patch: async (t, f, d) => {
      c.scritture.push(['patch', t, f]);
      filtra(db[t], f).forEach((r) => Object.assign(r, d));
    },
    post: async (t, r) => {
      c.scritture.push(['post', t]);
      const riga = Object.assign({}, r);
      if (riga.id == null) riga.id = ++seq;
      db[t].push(riga);
      return [riga];
    },
    del: async (t, f) => {
      c.scritture.push(['del', t, f]);
      const via = filtra(db[t], f);
      db[t] = db[t].filter((r) => !via.includes(r));
    },
    imp: async (k, v) => {
      c.scritture.push(['imp', k]);
      impostazioni[k] = v;
    },
    adesso: () => '2026-09-25T10:00:00',
    operatore: () => 'Tester',
    attesa: (ms, fn) => {
      timers.push(fn);
      return timers.length;
    },
    annullaAttesa: (id) => {
      timers[id - 1] = null;
    },
    scattaTimer: () => {
      const fns = timers.filter(Boolean);
      timers.length = 0;
      fns.forEach((f) => f());
    },
  };
  return c;
}
// simula il canale sicuro dell app: annota prima e dopo come fa realtime.js
function canaleSicuro(c, A) {
  return {
    patch: async (t, f, d) => {
      const op = await A.primaDiPatch(t, f, d);
      await c.patch(t, f, d);
      A.conferma(op);
    },
    post: async (t, r) => {
      const righe = await c.post(t, r);
      A.dopoPost(t, righe);
      return righe;
    },
    del: async (t, f) => {
      const op = await A.primaDiDel(t, f);
      await c.del(t, f);
      A.conferma(op);
    },
    imp: async (k, v) => {
      const pre = await A.primaDiImp(k);
      await c.imp(k, v);
      A.dopoImp(pre, k, v);
    },
  };
}

(async () => {
  console.log('\n== modifica: annulla e ripristina ==');
  let c = canaleFinto();
  let A = creaAnnulla(c);
  let S = canaleSicuro(c, A);
  c.db.piano_turni.push({ id: 1, codice: 'S3', ora_inizio: '15:00', ora_fine: '23:00' });
  await S.patch('piano_turni', 'id=eq.1', { ora_fine: '22:00' });
  A.chiudiGruppo('Turno S3 modificato');
  eq(A.stato().annulla, 1, 'un gruppo da annullare');
  eq(A.stato().ultima, 'Turno S3 modificato', 'etichetta dal registro');
  await A.annulla();
  eq(c.db.piano_turni[0].ora_fine, '23:00', 'annulla riporta il valore di prima');
  eq(A.stato().ripristina, 1, 'un gruppo da ripristinare');
  await A.ripristina();
  eq(c.db.piano_turni[0].ora_fine, '22:00', 'ripristina riapplica la modifica');

  console.log('\n== gruppo di piu scritture, chiuso dal registro ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  c.db.piano_vacanze.push(
    { id: 1, collaboratore: 'Rossi', settimana: 10, confermata: false },
    { id: 2, collaboratore: 'Rossi', settimana: 11, confermata: false },
  );
  await S.patch('piano_vacanze', 'id=eq.1', { confermata: true });
  await S.patch('piano_vacanze', 'id=eq.2', { confermata: true });
  A.chiudiGruppo('Vacanze confermate · Rossi');
  eq(A.stato().annulla, 1, 'due scritture = un solo gruppo');
  await A.annulla();
  ok(!c.db.piano_vacanze[0].confermata && !c.db.piano_vacanze[1].confermata, 'annulla tutto il gruppo insieme');

  console.log('\n== creazione: modulo nel Cestino, altre tabelle eliminate ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  await S.post('moduli', { tipo: 'rdi', collaboratore: 'Rossi', eliminato: false, dati: { livello: 'I' } });
  A.chiudiGruppo('Creato modulo rdi · Rossi');
  await A.annulla();
  ok(
    c.db.moduli.length === 1 && c.db.moduli[0].eliminato === true && c.db.moduli[0].eliminato_da === 'Tester',
    'modulo annullato = nel Cestino, non cancellato',
  );
  await A.ripristina();
  ok(c.db.moduli[0].eliminato === false && c.db.moduli[0].eliminato_da === null, 'ripristino = fuori dal Cestino');
  await S.post('piano_vacanze', { collaboratore: 'Bianchi', settimana: 20 });
  A.chiudiGruppo('Nuova vacanza');
  const idVac = c.db.piano_vacanze[0].id;
  await A.annulla();
  eq(c.db.piano_vacanze.length, 0, 'vacanza creata e annullata = eliminata');
  await A.ripristina();
  eq(c.db.piano_vacanze[0].id, idVac, 'ripristino reinserisce con lo stesso id');

  console.log('\n== eliminazione: annulla reinserisce ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  c.db.piano_turni.push({ id: 7, codice: 'X1', ora_inizio: '11:00', ora_fine: '20:00' });
  await S.del('piano_turni', 'id=eq.7');
  A.chiudiGruppo('Turno X1 eliminato');
  eq(c.db.piano_turni.length, 0, 'eliminato');
  await A.annulla();
  eq(c.db.piano_turni[0], { id: 7, codice: 'X1', ora_inizio: '11:00', ora_fine: '20:00' }, 'reinserito identico');

  console.log('\n== impostazioni ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  c.impostazioni.soglie_alert = '{"rdi":500}';
  await S.imp('soglie_alert', '{"rdi":800}');
  A.chiudiGruppo('Soglie salvate');
  await A.annulla();
  eq(c.impostazioni.soglie_alert, '{"rdi":500}', 'impostazione riportata al valore di prima');
  await S.imp('chiave_nuova', 'x');
  A.chiudiGruppo();
  eq(A.stato().ultima, 'Modifica impostazione', 'etichetta automatica senza registro');
  await A.annulla();
  eq(c.impostazioni.chiave_nuova, '', 'impostazione nuova annullata = vuota');
  await S.imp('soglie_alert', '{"rdi":500}');
  A.chiudiGruppo();
  eq(A.stato().annulla, 0, 'stesso valore = nessuna modifica da annullare');

  console.log('\n== conflitto: qualcun altro ha modificato nel frattempo ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  c.db.registrazioni.push({ id: 3, nome: 'Rossi', testo: 'a', eliminato: false });
  await S.patch('registrazioni', 'id=eq.3', { testo: 'b' });
  A.chiudiGruppo('Modifica registrazione');
  c.db.registrazioni[0].testo = 'c'; // un altro operatore
  let errore = '';
  try {
    await A.annulla();
  } catch (e) {
    errore = e.message;
  }
  ok(/modificata da qualcun altro/.test(errore), 'annullamento fermato con avviso');
  eq(c.db.registrazioni[0].testo, 'c', 'niente sovrascritto');
  eq(A.stato().annulla, 1, 'il gruppo resta in pila');

  console.log('\n== ripristina si azzera dopo una scrittura nuova; tabelle escluse; timer ==');
  c = canaleFinto();
  A = creaAnnulla(c);
  S = canaleSicuro(c, A);
  c.db.piano_turni.push({ id: 1, codice: 'S3', ora_fine: '23:00' });
  await S.patch('piano_turni', 'id=eq.1', { ora_fine: '22:00' });
  A.chiudiGruppo('uno');
  await A.annulla();
  eq(A.stato().ripristina, 1, 'ripristina disponibile');
  await S.patch('piano_turni', 'id=eq.1', { ora_fine: '21:00' });
  eq(A.stato().ripristina, 0, 'nuova scrittura = ripristina azzerato');
  c.scattaTimer();
  eq(A.stato().ultima, 'Modifica turno', 'dopo la quiete il gruppo si chiude da solo con etichetta in parole');
  await S.post('log_attivita', { azione: 'x' });
  await S.patch('piano', 'id=eq.1', { codice: 'V' });
  eq(A.stato().annulla, 1, 'registro e griglia del piano non entrano nel diario');
  eq(c.scritture.filter((x) => x[0] === 'patch').length, 4, 'le letture di controllo non generano scritture');

  console.log('\n== limite della pila ==');
  c = canaleFinto();
  A = creaAnnulla(c, { limite: 3 });
  S = canaleSicuro(c, A);
  c.db.piano_turni.push({ id: 1, codice: 'S3', ora_fine: '23:00' });
  for (let i = 0; i < 5; i++) {
    await S.patch('piano_turni', 'id=eq.1', { ora_fine: '2' + i + ':00' });
    A.chiudiGruppo('g' + i);
  }
  eq(A.stato().annulla, 3, 'si tengono solo gli ultimi gruppi');

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
