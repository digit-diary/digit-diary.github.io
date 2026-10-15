/**
 * Test automatici della ricerca sul piano (js/piano-ricerca.js).
 *
 * Come si lancia (senza browser ne server):
 *   node test/piano-ricerca.test.js
 *
 * Esce con codice 0 se tutti i test passano, 1 se qualcuno fallisce.
 */
const R = require('../js/piano-ricerca.js');
const PR = require('../js/piano-regole.js');

let passati = 0;
let falliti = 0;
function ok(cond, nome) {
  if (cond) {
    passati++;
    console.log('  OK  ' + nome);
  } else {
    falliti++;
    console.log('  FAIL ' + nome);
  }
}

// mese finto di 14 giorni, due turni: mattina M (06-14) e notte N (22-06)
const TURNI = {
  M: { ora_inizio: '06:00', ora_fine: '14:00', durata: 8 },
  N: { ora_inizio: '22:00', ora_fine: '06:00', durata: 8 },
};
const giorni = [];
for (let g = 1; g <= 14; g++) giorni.push('2026-11-' + String(g).padStart(2, '0'));
const persone = ['Anna', 'Bruno', 'Carla', 'Dario', 'Elena'];
const fabbisogno = {};
giorni.forEach((d) => (fabbisogno[d] = { M: 1, N: 1 }));
const isLavoro = (c) => !!TURNI[c];
// REGOLE (come quelle vere, in piccolo): 11 ore di riposo, max 5 giorni di fila,
// ore del mese vicine all obiettivo (6 turni = 48 ore)
function violazioni(nome, mappa) {
  let v = 0;
  let consec = 0;
  for (let i = 0; i < giorni.length; i++) {
    const c = mappa[giorni[i]] || '';
    if (isLavoro(c)) {
      consec++;
      if (consec === 6) v++;
    } else consec = 0;
    const c2 = mappa[giorni[i + 1]] || '';
    if (isLavoro(c) && isLavoro(c2)) {
      const r = PR.riposoOre(TURNI[c], TURNI[c2]);
      if (r != null && r < 11) v++;
    }
  }
  return v;
}
function ore(mappa) {
  return giorni.reduce((t, d) => t + (isLavoro(mappa[d]) ? 8 : 0), 0);
}
const costoPersona = (nome, mappa) => 1000 * violazioni(nome, mappa) + 2 * Math.abs(ore(mappa) - 48);

function problema(extra) {
  const stato = {};
  persone.forEach((n) => {
    stato[n] = {};
    giorni.forEach((d) => (stato[n][d] = 'C'));
  });
  return Object.assign(
    {
      giorni: giorni,
      persone: persone,
      stato: stato,
      riposo: 'C',
      fabbisogno: fabbisogno,
      modificabile: () => true,
      ammessi: () => ['M', 'N', 'C'],
      costoPersona: costoPersona,
    },
    extra || {},
  );
}

console.log('== da un piano vuoto ==');
const r1 = R.cerca(problema(), { seme: 7 }, 40000);
ok(r1.prima.scoperti === 28, 'partenza: 28 posti scoperti (14 giorni x 2)');
ok(r1.dopo.scoperti === 0, 'dopo la ricerca: nessun posto scoperto (' + r1.dopo.scoperti + ')');
const viol1 = persone.reduce((t, n) => t + violazioni(n, r1.stato[n]), 0);
ok(viol1 === 0, 'nessuna regola violata: riposo 11 ore e giorni di fila (' + viol1 + ')');
const ore1 = persone.map((n) => ore(r1.stato[n]));
ok(
  ore1.every((h) => Math.abs(h - 48) <= 16),
  'ore del mese vicine all obiettivo per tutti: ' + ore1.join(', '),
);

console.log('== ripetibile ==');
const r1b = R.cerca(problema(), { seme: 7 }, 40000);
ok(JSON.stringify(r1b.stato) === JSON.stringify(r1.stato), 'stesso seme, stesso risultato');

console.log('== idoneita e celle bloccate ==');
const r2 = R.cerca(
  problema({
    ammessi: (n) => (n === 'Anna' ? ['M', 'C'] : ['M', 'N', 'C']), // Anna solo diurni
    modificabile: (n, d) => !(n === 'Bruno' && d <= '2026-11-03'), // Bruno: primi 3 giorni bloccati (vacanza)
  }),
  { seme: 3 },
  40000,
);
ok(
  giorni.every((d) => r2.stato.Anna[d] !== 'N'),
  'Anna (solo diurni) non ha mai la notte',
);
ok(
  ['2026-11-01', '2026-11-02', '2026-11-03'].every((d) => r2.stato.Bruno[d] === 'C'),
  'le celle bloccate di Bruno restano come erano',
);
ok(r2.dopo.scoperti === 0, 'anche cosi tutto coperto (' + r2.dopo.scoperti + ')');

console.log('== celle obbligate (formazione) ==');
const fissi = { Carla: { '2026-11-05': 'M', '2026-11-06': 'M', '2026-11-07': 'N' } };
const r3 = R.cerca(problema({ fissi: fissi }), { seme: 5 }, 40000);
ok(r3.stato.Carla['2026-11-05'] === 'M' && r3.stato.Carla['2026-11-07'] === 'N', 'le celle obbligate restano');
ok(r3.dopo.scoperti === 0, 'il resto si sistema attorno (' + r3.dopo.scoperti + ' scoperti)');

console.log('== pochi cambi su un piano gia fatto ==');
// piano gia buono: Anna/Bruno a turni alterni... parto dal risultato r1 e chiedo
// una cella obbligata: con il peso dei cambi la ricerca tocca poche celle
const statoFatto = JSON.parse(JSON.stringify(r1.stato));
const chi = persone.find((n) => statoFatto[n]['2026-11-10'] === 'C' && statoFatto[n]['2026-11-09'] !== 'N');
const r4 = R.cerca(
  problema({ stato: statoFatto, fissi: { [chi]: { '2026-11-10': 'M' } } }),
  { seme: 11, pesoCambio: 40 },
  30000,
);
ok(r4.stato[chi]['2026-11-10'] === 'M', chi + ' ha la cella obbligata');
ok(r4.cambi.length <= 8, 'cambi limitati: ' + r4.cambi.length + ' celle toccate');
ok(r4.dopo.scoperti === 0, 'sempre tutto coperto');
ok(persone.reduce((t, n) => t + violazioni(n, r4.stato[n]), 0) === 0, 'sempre nessuna regola violata');

console.log('== mai doppioni oltre il fabbisogno ==');
// 5 persone che vogliono 6 turni ciascuna (30) ma il fabbisogno ne offre 28: prima la
// ricerca poteva aggiungere un secondo M nello stesso giorno per dare ore a qualcuno
const r5 = R.cerca(problema(), { seme: 9 }, 40000);
const doppi = giorni.filter(
  (d) =>
    persone.filter((n) => r5.stato[n][d] === 'M').length > 1 ||
    persone.filter((n) => r5.stato[n][d] === 'N').length > 1,
);
ok(doppi.length === 0, 'nessun giorno con piu persone del fabbisogno (' + doppi.join(', ') + ')');
ok(r5.dopo.eccesso === 0, 'eccesso finale 0 (' + r5.dopo.eccesso + ')');
// partenza con un doppione: la ricerca lo toglie, non ne aggiunge
const statoDoppio = JSON.parse(JSON.stringify(r1.stato));
const libero = persone.find((n) => statoDoppio[n]['2026-11-04'] === 'C');
statoDoppio[libero]['2026-11-04'] = 'M';
const r6 = R.cerca(problema({ stato: statoDoppio }), { seme: 4 }, 30000);
ok(
  r6.prima.eccesso >= 1 && r6.dopo.eccesso <= r6.prima.eccesso,
  'un doppione di partenza non aumenta (' + r6.prima.eccesso + ' -> ' + r6.dopo.eccesso + ')',
);

console.log('== riposo come cella vuota (come lo passa il programma) ==');
// il programma passa riposo: '' e celle vuote; prima il motore usava 'C' lo stesso: niente
// scambi lavoro/riposo e cambi finti '' -> 'C'
const statoV = {};
persone.forEach((n) => {
  statoV[n] = {};
  giorni.forEach((d) => (statoV[n][d] = ''));
});
const r7 = R.cerca(problema({ stato: statoV, riposo: '', ammessi: () => ['M', 'N', ''] }), { seme: 7 }, 40000);
ok(r7.dopo.scoperti === 0, 'con riposo vuoto copre tutti i posti (' + r7.dopo.scoperti + ')');
ok(
  persone.every((n) => giorni.every((d) => ['M', 'N', ''].includes(r7.stato[n][d] || ''))),
  'nessuna C inventata: i riposi restano celle vuote',
);
const finti = (r7.cambi || []).filter((c) => !c.prima && !c.dopo).length;
ok(finti === 0, 'nessun cambio finto da vuoto a vuoto (' + finti + ')');

console.log('== posti rari prima dei comuni ==');
// un giorno: il turno S lo puo fare solo Anna, il turno M Anna e Bruno. Lasciare
// scoperto S o una M e lo stesso numero di posti: deve restare scoperta la M
{
  const d0 = giorni[0];
  const pr = {
    giorni: [d0],
    persone: ['Anna', 'Bruno'],
    stato: { Anna: { [d0]: 'M' }, Bruno: { [d0]: 'M' } },
    riposo: '',
    fabbisogno: { [d0]: { S: 1, M: 2 } },
    modificabile: () => true,
    ammessi: (n) => (n === 'Anna' ? ['S', 'M', ''] : ['M', '']),
    costoPersona: () => 0,
  };
  const r = R.cerca(pr, { seme: 3 }, 2000);
  ok(
    r.stato.Anna[d0] === 'S' && r.stato.Bruno[d0] === 'M',
    'Anna copre il turno che sa fare solo lei (' + r.stato.Anna[d0] + ')',
  );
  ok(r.dopo.scoperti === 1, 'resta scoperto un solo posto, quello che altri possono coprire');
}

console.log('== seme fisso per mese e settore (ripetibile) ==');
ok(R.semeRicerca('2026-11', 'slots', 0) === R.semeRicerca('2026-11', 'slots', 0), 'stesso mese e settore: stesso seme');
ok(
  R.semeRicerca('2026-11', 'slots', 0) !== R.semeRicerca('2026-11', 'slots', 1),
  'altra variante (riprova): altro seme',
);
ok(R.semeRicerca('2026-11', 'slots', 0) !== R.semeRicerca('2026-11', 'tavoli', 0), 'altro settore: altro seme');
ok(R.semeRicerca('', '', 0) > 0, 'il seme non e mai zero');
{
  const a = R.cerca(problema(), { seme: R.semeRicerca('2026-11', 'prova', 0) }, 6000);
  const b = R.cerca(problema(), { seme: R.semeRicerca('2026-11', 'prova', 0) }, 6000);
  ok(JSON.stringify(a.stato) === JSON.stringify(b.stato), 'stesso seme e stesse iterazioni: stesso piano');
  ok(JSON.stringify(a.cambi) === JSON.stringify(b.cambi), 'stesso seme e stesse iterazioni: stessi cambi');
}

console.log('== equita delle notti (scartoNotti) ==');
{
  const z = R.scartoNotti({ A: { notti: 5, turni: 10 }, B: { notti: 5, turni: 10 } });
  ok(z.totale === 0, 'quote uguali: scarto zero');
  const d = R.scartoNotti({ A: { notti: 5, turni: 10 }, B: { notti: 0, turni: 10 } });
  ok(Math.abs(d.totale - 12.5) < 1e-9, '50% e 0%: (25^2 + 25^2) / 100 = 12,5 (' + d.totale + ')');
  const g = R.scartoNotti(
    {
      A: { notti: 5, turni: 10 },
      B: { notti: 0, turni: 10 },
      C: { notti: 10, turni: 10 },
      D: { notti: 10, turni: 10 },
    },
    (n) => (n === 'A' || n === 'B' ? 'HOST' : 'SUP'),
  );
  ok(Math.abs(g.gruppi.HOST - 12.5) < 1e-9 && g.gruppi.SUP === 0, 'i gruppi (funzioni) non si mescolano');
  const f = R.scartoNotti({ A: { notti: 5, turni: 10 }, B: { notti: 0, turni: 10 } }, (n) => (n === 'B' ? null : 'X'));
  ok(f.totale === 0, 'chi e fuori dal gruppo (null) non conta');
  const w = R.scartoNotti({ A: { notti: 0, turni: 8 }, B: { notti: 2, turni: 2 } }, null, 8);
  // B pesa 2/8: media pesata 20%, scarti 20 e 80
  ok(
    Math.abs(w.totale - (1 * 400 + 0.25 * 6400) / 100) < 1e-9,
    'chi ha pochi turni pesa in proporzione (' + w.totale + ')',
  );
}
{
  // 4 giorni, un turno di notte e uno di mattina al giorno: Anna fa tutte le notti
  const gg = giorni.slice(0, 4);
  const st = { Anna: {}, Bruno: {} };
  const fb = {};
  gg.forEach((d) => {
    st.Anna[d] = 'N';
    st.Bruno[d] = 'M';
    fb[d] = { M: 1, N: 1 };
  });
  const base = {
    giorni: gg,
    persone: ['Anna', 'Bruno'],
    stato: st,
    riposo: '',
    fabbisogno: fb,
    modificabile: () => true,
    ammessi: () => ['M', 'N', ''],
    costoPersona: () => 0,
    tipoNotte: (c) => (c === 'N' ? 1 : c === 'M' ? 0 : null),
    gruppoEquita: () => 'HOST',
  };
  const r = R.cerca(base, { seme: 5, pesoNotti: 10, temperatura: 0 }, 3000);
  const notti = (n) => gg.filter((d) => r.stato[n][d] === 'N').length;
  ok(
    notti('Anna') === 2 && notti('Bruno') === 2,
    'con il peso delle notti: 2 notti a testa (' + notti('Anna') + '/' + notti('Bruno') + ')',
  );
  ok(r.dopo.scoperti === 0 && r.dopo.notti === 0, 'nessun posto scoperto, scarto delle notti zero');
  // 4 turni a testa (meno di 8: pesano 0,5): scarti di 50 punti, 0,5 x 2500 x 2 / 100 = 25
  ok(r.prima.notti === 25, 'partenza: 100% e 0% = scarto 25 (' + r.prima.notti + ')');
}

console.log('== posti riservati: vincolo duro ==');
{
  // Anna e l unica che fa S (riservato ai Supervisor); sul turno S ha una regola violata
  // (5.000): lasciare S scoperto costerebbe meno (300 x 5). Senza riservati la ricerca la
  // sposta su M; con S riservato no.
  const d0 = giorni[0];
  const pr = (ris) => ({
    giorni: [d0],
    persone: ['Anna', 'Bruno', 'Carla'],
    stato: { Anna: { [d0]: 'S' }, Bruno: { [d0]: 'M' }, Carla: { [d0]: '' } },
    riposo: '',
    fabbisogno: { [d0]: { S: 1, M: 2 } },
    modificabile: () => true,
    ammessi: (n) => (n === 'Anna' ? ['S', 'M', ''] : ['M', '']),
    costoPersona: (n, m) => (n === 'Anna' && m[d0] === 'S' ? 5000 : 0) + (n === 'Carla' && m[d0] === 'M' ? 2000 : 0),
    riservati: ris,
  });
  const senza = R.cerca(pr(null), { seme: 3 }, 2000);
  ok(senza.stato.Anna[d0] !== 'S', 'senza riservati: Anna lascia S (' + senza.stato.Anna[d0] + ')');
  const con = R.cerca(pr({ [d0]: { S: true } }), { seme: 3 }, 2000);
  ok(con.stato.Anna[d0] === 'S' && con.dopo.riservati === 0, 'con S riservato: resta coperto');
  const conPeso = R.cerca(pr({ [d0]: { S: true } }), { seme: 3, pesoRiservato: 30000 }, 2000);
  ok(conPeso.stato.Anna[d0] === 'S', 'con il peso dei riservati: resta coperto anche durante la ricerca');
}
{
  // un posto riservato gia scoperto alla partenza non blocca gli altri miglioramenti
  const d0 = giorni[0];
  const r = R.cerca(
    {
      giorni: [d0],
      persone: ['Anna', 'Bruno'],
      stato: { Anna: { [d0]: '' }, Bruno: { [d0]: '' } },
      riposo: '',
      fabbisogno: { [d0]: { S: 1, M: 1 } },
      modificabile: () => true,
      ammessi: () => ['M', ''],
      costoPersona: () => 0,
      riservati: { [d0]: { S: true } },
    },
    { seme: 2 },
    500,
  );
  ok(r.dopo.scoperti === 1 && r.dopo.riservati === 1, 'S resta scoperto (nessuno puo), M si copre lo stesso');
}

console.log('== il migliore e sempre ammesso (vincoli come il controllo finale) ==');
{
  // 3 giorni, un posto X al giorno. Bruno puo solo il giorno 1, Carla solo il 2; il giorno 3
  // lo puo fare solo Anna, ma per lei ogni giorno di lavoro e una regola di legge (es. una
  // domenica libera in meno). Coprire il posto vale piu della regola (pesoScoperto alto): il
  // punteggio piu basso e con Anna al lavoro il giorno 3 (una legge in piu), che il controllo
  // finale scarterebbe. Il motore deve restituire il migliore AMMESSO: Bruno il 1, Carla il 2,
  // il 3 scoperto, nessuna legge in piu.
  const gg = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const pp = ['Anna', 'Bruno', 'Carla'];
  const stato0 = {};
  pp.forEach((n) => {
    stato0[n] = {};
    gg.forEach((d) => (stato0[n][d] = ''));
  });
  const puo = { Anna: [gg[2]], Bruno: [gg[0]], Carla: [gg[1]] };
  const costo = (n, mappa) => {
    const lav = gg.filter((d) => mappa[d] === 'X').length;
    return n === 'Anna' ? { costo: 60000 * lav, conti: { legge_dom: lav } } : { costo: 0, conti: {} };
  };
  const prob = () => ({
    giorni: gg,
    persone: pp,
    stato: JSON.parse(JSON.stringify(stato0)),
    riposo: '',
    fabbisogno: { [gg[0]]: { X: 1 }, [gg[1]]: { X: 1 }, [gg[2]]: { X: 1 } },
    modificabile: () => true,
    ammessi: (n, d) => (puo[n].includes(d) ? ['X', ''] : ['']),
    costoPersona: costo,
  });
  // pesoSforo: alla fine della ricerca uscire dai vincoli costa piu di ogni posto coperto
  const opz = (seme, sforo) => ({
    pesoScoperto: 100000,
    pesoRaro: 1,
    seme: seme,
    vincoli: [['legge_dom']],
    pesoSforo: sforo == null ? 1000000 : sforo,
  });
  // anche SENZA peso dello sforo il risultato e sempre ammesso (il filtro sul migliore)
  let sempreAmmesso = true;
  for (let seme = 1; seme <= 5; seme++) {
    const x = R.cerca(prob(), opz(seme, 0), 400);
    if (!x.ammesso || x.stato.Anna[gg[2]] === 'X') sempreAmmesso = false;
  }
  ok(sempreAmmesso, 'senza peso dello sforo: risultato sempre ammesso (5 semi)');
  // la ricerca passa davvero da uno stato non ammesso (Anna al lavoro), poi restituisce l ammesso
  let passata = false;
  let restituito = null;
  for (let seme = 1; seme <= 5 && !passata; seme++) {
    const r = R.crea(prob(), opz(seme));
    for (let i = 0; i < 400; i++) {
      const m = r.passo(0, i / 400, 1);
      if (m.sforo > 0) passata = true;
    }
    restituito = r.risultato();
  }
  ok(passata, 'la ricerca attraversa uno stato con una legge in piu (Anna il giorno 3)');
  ok(restituito.ammesso === true, 'il risultato e ammesso');
  ok(restituito.stato.Anna[gg[2]] !== 'X', 'Anna non lavora: nessuna legge in piu');
  ok(
    restituito.stato.Bruno[gg[0]] === 'X' && restituito.stato.Carla[gg[1]] === 'X',
    'il migliore ammesso: Bruno il 1 e Carla il 2 coperti (' + restituito.dopo.scoperti + ' scoperto)',
  );
  ok(
    restituito.dopo.scoperti === 1 && (restituito.dopo.conti.legge_dom || 0) === 0,
    'un solo posto scoperto (quello che solo Anna puo fare), zero leggi',
  );
  ok(restituito.dopo.punteggio < restituito.prima.punteggio, 'e migliore della partenza');
  // senza vincoli sui conti il migliore sarebbe quello con la legge in piu (com era prima)
  const libero = R.cerca(prob(), { pesoScoperto: 100000, pesoRaro: 1, seme: 3, vincoli: [] }, 400);
  ok(libero.stato.Anna[gg[2]] === 'X', 'controprova: senza vincoli il punteggio sceglie Anna al lavoro');
  // i conti di default (senza vincoli espliciti): ogni chiave da sola
  const def = R.cerca(prob(), { pesoScoperto: 100000, pesoRaro: 1, seme: 3 }, 400);
  ok(def.ammesso && def.stato.Anna[gg[2]] !== 'X', 'senza vincoli espliciti: ogni tipo non aumenta');
}
{
  // TIPI DIVERSI: scambiare una legge di un tipo con una di un altro non e ammesso, anche se
  // il punteggio scende (vincoli per tipo, come il controllo finale)
  const gg = ['2026-11-01', '2026-11-02'];
  const pp = ['Anna', 'Bruno'];
  // Anna al lavoro il 1: un riposo corto (legge_riposo); Bruno al lavoro il 1: una domenica
  // libera in meno (legge_dom), che pesa meno nel punteggio di prova
  const costo = (n, mappa) => {
    const lav = mappa[gg[0]] === 'X' ? 1 : 0;
    if (n === 'Anna') return { costo: 90000 * lav, conti: { legge_riposo: lav } };
    return { costo: 60000 * lav, conti: { legge_dom: lav } };
  };
  const tutti = [['legge_dom'], ['legge_riposo'], ['legge_dom', 'legge_riposo', 'regola']];
  for (let seme = 1; seme <= 5; seme++) {
    const r = R.cerca(
      {
        giorni: gg,
        persone: pp,
        stato: { Anna: { [gg[0]]: 'X', [gg[1]]: '' }, Bruno: { [gg[0]]: '', [gg[1]]: '' } },
        riposo: '',
        fabbisogno: { [gg[0]]: { X: 1 } },
        modificabile: () => true,
        ammessi: (n, d) => (d === gg[0] ? ['X', ''] : ['']),
        costoPersona: costo,
      },
      { seme: seme, vincoli: tutti },
      300,
    );
    if (r.stato.Bruno[gg[0]] === 'X' || !r.ammesso) {
      ok(false, 'seme ' + seme + ': un riposo corto scambiato con una domenica libera');
      break;
    }
    if (seme === 5) ok(true, 'una legge non si scambia con una di un altro tipo (5 semi)');
  }
}
{
  // SU UN PROBLEMA PIU GRANDE, molti semi: il risultato rispetta sempre tutti i vincoli
  const conti = (n, mappa) => {
    const v = violazioni(n, mappa);
    return { costo: 60000 * v + 2 * Math.abs(ore(mappa) - 48), conti: { legge_altre: v } };
  };
  let sempre = true;
  for (let seme = 1; seme <= 8; seme++) {
    const st = {};
    persone.forEach((n, i) => {
      st[n] = {};
      // partenza con qualche violazione: tutti lavorano 3 giorni di fila a cavallo
      giorni.forEach((d, k) => (st[n][d] = (k + i) % 5 < 3 ? (k % 2 ? 'M' : 'N') : 'C'));
    });
    const r = R.crea(problema({ stato: st, costoPersona: conti }), {
      seme: seme,
      vincoli: [['legge_altre']],
      maxScoperti: 20,
    });
    const p0 = r.misura();
    for (let i = 0; i < 20; i++) r.passo(0, i / 20, 200);
    const fin = r.risultato();
    const legge0 = p0.conti.legge_altre || 0;
    if (!fin.ammesso || (fin.dopo.conti.legge_altre || 0) > legge0 || fin.dopo.scoperti > Math.max(20, 0)) {
      sempre = false;
      console.log('    seme', seme, 'legge', legge0, '->', fin.dopo.conti.legge_altre, 'scoperti', fin.dopo.scoperti);
    }
  }
  ok(sempre, 'otto semi: il migliore restituito e sempre ammesso (leggi e scoperti entro i limiti)');
}
{
  // PESO DELLO SFORO: con pesoSforo la ricerca, alla fine, torna dentro i vincoli anche nello
  // stato corrente (non solo nel migliore restituito)
  const gg = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const r = R.crea(
    {
      giorni: gg,
      persone: ['Anna', 'Bruno'],
      stato: { Anna: {}, Bruno: {} },
      riposo: '',
      fabbisogno: { [gg[2]]: { X: 1 }, [gg[0]]: { X: 1 } },
      modificabile: () => true,
      ammessi: (n, d) => (n === 'Anna' ? ['X', ''] : d === gg[0] ? ['X', ''] : ['']),
      costoPersona: (n, m) => {
        const lav = n === 'Anna' && m[gg[2]] === 'X' ? 1 : 0;
        return { costo: 60000 * lav, conti: { legge_dom: lav } };
      },
    },
    { pesoScoperto: 100000, pesoRaro: 1, seme: 4, vincoli: [['legge_dom']], pesoSforo: 1000000 },
  );
  for (let i = 0; i < 20; i++) r.passo(0, i / 20, 30);
  const fine = r.passo(0, 1, 30);
  ok(fine.sforo === 0, 'con pesoSforo lo stato finale della ricerca e ammesso (sforo ' + fine.sforo + ')');
  ok(r.risultato().ammesso, 'e il risultato anche');
}

{
  // TORNA AL MIGLIORE: dopo la frazione indicata, uno stato fuori dai vincoli si lascia e si
  // riparte dal migliore ammesso (Anna al lavoro il giorno 3 = una legge in piu)
  const gg = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const puo = { Anna: [gg[2]], Bruno: [gg[0]], Carla: [gg[1]] };
  let fuori = 0;
  let tornato = true;
  for (let seme = 1; seme <= 5; seme++) {
    const r = R.crea(
      {
        giorni: gg,
        persone: ['Anna', 'Bruno', 'Carla'],
        stato: { Anna: {}, Bruno: {}, Carla: {} },
        riposo: '',
        fabbisogno: { [gg[0]]: { X: 1 }, [gg[1]]: { X: 1 }, [gg[2]]: { X: 1 } },
        modificabile: () => true,
        ammessi: (n, d) => (puo[n].includes(d) ? ['X', ''] : ['']),
        costoPersona: (n, m) => {
          const lav = gg.filter((d) => m[d] === 'X').length;
          return n === 'Anna' ? { costo: 60000 * lav, conti: { legge_dom: lav } } : { costo: 0, conti: {} };
        },
      },
      { pesoScoperto: 100000, pesoRaro: 1, seme: seme, vincoli: [['legge_dom']], tornaAlMigliore: 0.5 },
    );
    let uscito = false;
    for (let i = 0; i < 40 && !uscito; i++) uscito = r.passo(0, i / 100, 5).sforo > 0;
    if (!uscito) continue;
    fuori++;
    // dalla meta in poi la prima cosa che fa ogni passo e tornare al migliore ammesso
    // (passo senza iterazioni: solo il ritorno)
    if (r.passo(0, 0.6, 0).sforo !== 0 || !r.risultato().ammesso) tornato = false;
  }
  ok(fuori > 0, 'nella prima meta la ricerca esce dai vincoli (' + fuori + ' volte su 5 semi)');
  ok(tornato, 'dopo la meta torna al migliore ammesso; il risultato e ammesso');
}

console.log('== non peggiora mai ==');
ok(
  r1.dopo.punteggio <= r1.prima.punteggio && r2.dopo.punteggio <= r2.prima.punteggio,
  'il punteggio finale non supera quello di partenza',
);

console.log('\n== scambio di giorni e rifinitura (blocchi compatti, v453) ==');
{
  // due persone, un posto M al giorno per 6 giorni, a giorni alterni: ognuno ha 3 giorni
  // isolati. Con gli scambi di giorni i posti restano coperti e i blocchi si compattano.
  const gg = giorni.slice(0, 6);
  const fab = {};
  gg.forEach((d) => (fab[d] = { M: 1 }));
  const st = { Anna: {}, Bruno: {} };
  gg.forEach((d, i) => (i % 2 ? (st.Bruno[d] = 'M') : (st.Anna[d] = 'M')));
  const isolati = (mappa) => {
    let k = 0;
    gg.forEach((d, i) => {
      const l = (j) => j >= 0 && j < gg.length && isLavoro(mappa[gg[j]]);
      if (l(i) && !l(i - 1) && !l(i + 1)) k++;
    });
    return k;
  };
  const P = {
    giorni: gg,
    persone: ['Anna', 'Bruno'],
    stato: st,
    riposo: '',
    fabbisogno: fab,
    modificabile: () => true,
    ammessi: () => ['M', ''],
    costoPersona: (n, mappa) => 60 * isolati(mappa),
  };
  const tot = (r) => isolati(r.stato.Anna) + isolati(r.stato.Bruno);
  const conR = R.cerca(P, { seme: 3, temperatura: 0 }, 1);
  ok(conR.dopo.scoperti === 0, 'rifinitura: i posti restano coperti');
  ok(tot(conR) < 6, 'rifinitura: meno giorni isolati (' + tot(conR) + ' su 6)');
  const senza = R.cerca(P, { seme: 3, temperatura: 0, rifinituraScambi: 0, scambioGiorni: false }, 1);
  ok(tot(conR) <= tot(senza), 'con la rifinitura mai peggio che senza');
  // la rifinitura puo cambiare i pesi prima di partire (primaDellaRifinitura)
  let chiamata = 0;
  R.cerca(Object.assign({}, P, { primaDellaRifinitura: () => chiamata++ }), { seme: 3 }, 1);
  ok(chiamata === 1, 'primaDellaRifinitura chiamata una volta');
}

// RIFINITURA DEI POSTI SCOPERTI (v456): un posto che si copre solo con una catena di due
// (Anna passa al giorno scoperto, Bruno prende il suo turno) si copre anche senza la ricerca
// a caso; senza la rifinitura dei posti resta scoperto
{
  const gg = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const P = {
    giorni: gg,
    persone: ['Anna', 'Bruno'],
    stato: { Anna: { '2026-11-02': 'M' }, Bruno: {} },
    riposo: '',
    fabbisogno: { '2026-11-02': { M: 1 }, '2026-11-03': { M: 1 } },
    modificabile: () => true,
    // Bruno il 3 non puo; Anna non lavora due giorni di fila (una regola)
    ammessi: (n, d) => (n === 'Bruno' && d === '2026-11-03' ? [''] : ['M', '']),
    costoPersona: (n, m) => (m['2026-11-02'] && m['2026-11-03'] ? 20000 : 0),
  };
  const r = R.crea(P, { seme: 1 }).risultato();
  ok(r.dopo.scoperti === 0, 'rifinitura dei posti: la catena di due copre il posto');
  ok(r.stato.Anna['2026-11-03'] === 'M' && r.stato.Bruno['2026-11-02'] === 'M', 'Anna passa al 3, Bruno prende il 2');
  ok(r.dopo.regole === 0, 'rifinitura dei posti: nessuna regola in piu');
  const r0 = R.crea(P, { seme: 1, rifinituraScoperti: 0 }).risultato();
  ok(r0.dopo.scoperti === 1, 'senza la rifinitura dei posti resta scoperto');
}

console.log('\n=======================================');
console.log('  ' + passati + ' passati, ' + falliti + ' falliti');
console.log('=======================================');
process.exit(falliti ? 1 : 0);
