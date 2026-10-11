/**
 * Annulla generale (js/annulla.js): aggiunte e impostazioni cambiate da un collega dopo
 * l azione. Prima l annullamento le cancellava o le riscriveva senza guardare; ora si
 * controlla e, se sono cambiate, si chiede (canale.chiedi).
 *   node test/annulla-conflitti.test.js
 */
const { creaAnnulla } = require('../js/annulla.js');
let passati = 0,
  falliti = 0;
const ok = (c, n) => {
  c ? passati++ : falliti++;
  console.log((c ? '  OK  ' : '  FAIL ') + n);
};

function canaleFinto(risposta) {
  const db = { promemoria: [], registrazioni: [] };
  const impostazioni = {};
  let seq = 100;
  const filtra = (rows, f) =>
    f.split('&').reduce((acc, p) => {
      const [k, v] = p.split('=');
      return acc.filter((r) => String(r[k]) === v.substring(v.indexOf('.') + 1));
    }, rows);
  const c = {
    db,
    impostazioni,
    domande: [],
    leggi: async (q) => {
      const [t, f] = q.split('?');
      return filtra(db[t] || [], f).map((r) => JSON.parse(JSON.stringify(r)));
    },
    leggiImp: async (k) => (k in impostazioni ? impostazioni[k] : null),
    patch: async (t, f, d) => filtra(db[t], f).forEach((r) => Object.assign(r, d)),
    post: async (t, r) => {
      const riga = Object.assign({ id: ++seq }, r);
      db[t].push(riga);
      return [riga];
    },
    del: async (t, f) => {
      const via = filtra(db[t], f);
      db[t] = db[t].filter((r) => !via.includes(r));
    },
    imp: async (k, v) => {
      impostazioni[k] = v;
    },
    adesso: () => '2026-10-11T10:00:00',
    operatore: () => 'Tester',
    attesa: () => 1,
    annullaAttesa: () => {},
  };
  if (risposta !== undefined)
    c.chiedi = async (t) => {
      c.domande.push(t);
      return risposta;
    };
  return c;
}
// come realtime.js: annota prima e dopo
function sicuro(c, A) {
  return {
    post: async (t, r) => {
      const righe = await c.post(t, r);
      A.dopoPost(t, righe);
      return righe;
    },
    imp: async (k, v) => {
      const pre = await A.primaDiImp(k);
      await c.imp(k, v);
      A.dopoImp(pre, k, v);
    },
  };
}

(async () => {
  console.log('\n== aggiunta non toccata da altri: si annulla senza domande ==');
  let c = canaleFinto(true);
  let A = creaAnnulla(c);
  let S = sicuro(c, A);
  await S.post('promemoria', { testo: 'chiamare' });
  A.chiudiGruppo('Promemoria');
  await A.annulla();
  ok(c.db.promemoria.length === 0, 'riga aggiunta tolta');
  ok(c.domande.length === 0, 'nessuna domanda');

  console.log('\n== aggiunta cambiata da un collega: si chiede, NO = fermo ==');
  c = canaleFinto(false);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  await S.post('promemoria', { testo: 'chiamare' });
  A.chiudiGruppo('Promemoria');
  c.db.promemoria[0].testo = 'chiamare (scritto da Bianchi)'; // il collega la cambia
  let errore = '';
  try {
    await A.annulla();
  } catch (e) {
    errore = e.message;
  }
  ok(c.domande.length === 1 && /riga aggiunta \(promemoria\)/.test(c.domande[0]), 'domanda fatta, con la tabella');
  ok(c.db.promemoria.length === 1 && /Bianchi/.test(c.db.promemoria[0].testo), 'la modifica del collega resta');
  ok(/modificata da qualcun altro/.test(errore), 'annullamento fermato con il motivo');
  ok(A.stato().annulla === 1, 'il passo resta da annullare');

  console.log('\n== aggiunta cambiata da un collega: SI = si annulla comunque ==');
  c = canaleFinto(true);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  await S.post('promemoria', { testo: 'chiamare' });
  A.chiudiGruppo('Promemoria');
  c.db.promemoria[0].testo = 'altro';
  await A.annulla();
  ok(c.domande.length === 1 && c.db.promemoria.length === 0, 'domanda fatta, riga tolta');

  console.log('\n== aggiunta gia tolta da un collega: niente da fare ==');
  c = canaleFinto(true);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  await S.post('promemoria', { testo: 'chiamare' });
  A.chiudiGruppo('Promemoria');
  c.db.promemoria = [];
  await A.annulla();
  ok(c.domande.length === 0 && A.stato().ripristina === 1, 'nessun errore, passo annullato');

  console.log('\n== solo la data di aggiornamento diversa: non e un conflitto ==');
  c = canaleFinto(false);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  await S.post('promemoria', { testo: 'x', updated_at: '2026-10-11T09:00:00Z' });
  A.chiudiGruppo('Promemoria');
  c.db.promemoria[0].updated_at = '2026-10-11T09:30:00Z';
  await A.annulla();
  ok(c.domande.length === 0 && c.db.promemoria.length === 0, 'tolta senza domande');

  console.log('\n== impostazione cambiata da un collega: si chiede ==');
  c = canaleFinto(false);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  c.impostazioni.soglia = '3';
  await S.imp('soglia', '5');
  A.chiudiGruppo('Soglia');
  c.impostazioni.soglia = '7'; // il collega
  errore = '';
  try {
    await A.annulla();
  } catch (e) {
    errore = e.message;
  }
  ok(c.domande.length === 1, 'domanda fatta');
  ok(c.impostazioni.soglia === '7', 'il valore del collega resta');
  ok(/impostazione "soglia"/.test(errore), 'messaggio con il nome dell impostazione');

  console.log('\n== impostazione non toccata: annulla e ripristina senza domande ==');
  c = canaleFinto(false);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  c.impostazioni.soglia = '3';
  await S.imp('soglia', '5');
  A.chiudiGruppo('Soglia');
  await A.annulla();
  ok(c.impostazioni.soglia === '3', 'annullata');
  await A.ripristina();
  ok(c.impostazioni.soglia === '5' && c.domande.length === 0, 'ripristinata, nessuna domanda');

  console.log('\n== ripristina un impostazione cambiata dopo l annullamento: si chiede ==');
  c = canaleFinto(false);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  c.impostazioni.soglia = '3';
  await S.imp('soglia', '5');
  A.chiudiGruppo('Soglia');
  await A.annulla();
  c.impostazioni.soglia = '9';
  errore = '';
  try {
    await A.ripristina();
  } catch (e) {
    errore = e.message;
  }
  ok(c.impostazioni.soglia === '9' && !!errore, 'il valore del collega resta');

  console.log('\n== senza canale.chiedi: fermo con il motivo (come le modifiche) ==');
  c = canaleFinto(undefined);
  A = creaAnnulla(c);
  S = sicuro(c, A);
  await S.post('promemoria', { testo: 'chiamare' });
  A.chiudiGruppo('Promemoria');
  c.db.promemoria[0].testo = 'altro';
  errore = '';
  try {
    await A.annulla();
  } catch (e) {
    errore = e.message;
  }
  ok(c.db.promemoria.length === 1 && /modificata da qualcun altro/.test(errore), 'non cancellata');

  console.log('\n=======================================');
  console.log(passati + ' passati, ' + falliti + ' falliti');
  console.log('=======================================');
  process.exit(falliti ? 1 : 0);
})();
