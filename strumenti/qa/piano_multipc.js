// ============================================================
// COPIA NEL REPOSITORY (versionata dal 11/10/2026, migrazione 20260913).
// Originale: ~/DiarioProvaLocale/strumenti/check_generazione/piano_multipc.js.
// COSA SERVE: la copia di prova locale avviata (bash ~/DiarioProvaLocale/avvia_locale.sh:
// database diario2 sulla porta 55432, PostgREST 3000, sito 8000), Chrome per puppeteer-core
// (in ~/DiarioProvaLocale/node_modules) e, per il confronto "vecchio", il sito del codice
// git HEAD sulla porta 8001 (avvia_vecchio.sh).
// COME SI LANCIA:  node strumenti/qa/piano_multipc.js nuovo [prove...]
// MAI sul database vero: tocca celle del piano (dicembre 2026 / gennaio 2027) e le rimette.
// ============================================================
// PROVE "PIU PC SULLO STESSO MESE" (scritture del Piano sicure, migrazione 20260912)
// Due PC = due browser separati (contesti diversi, sessioni diverse) sulla copia locale.
// Uso:
//   node piano_multipc.js nuovo  [prova ...]   codice attuale  (sito :8000, avvia_locale.sh)
//   node piano_multipc.js vecchio [prova ...]  codice git HEAD (sito :8001, avvia_vecchio.sh)
// Prove: p1a p1b p2 p3a p3b p3c p3d p4a p4b p5a p5b p6a p6b p7a p7b p8 (senza nomi: tutte)
// Ogni prova dice cosa ha visto e se il DIFETTO c e. Dati: dicembre 2026 / gennaio 2027.
// Le celle toccate si salvano prima e si rimettono dopo ogni prova (trigger spenti, lo
// storico non si sporca); registrazioni, moduli, punti e promemoria delle prove si tolgono.
const puppeteer = require('/Users/bushi/DiarioProvaLocale/node_modules/puppeteer-core');
const { execSync } = require('child_process');
const fs = require('fs');
const PSQL = '/Users/bushi/DiarioProvaLocale/psql.sh';
const sql = (q) => execSync(PSQL + ' -Atq -v ON_ERROR_STOP=1', { input: q, maxBuffer: 512 * 1024 * 1024 }).toString().trim();
const att = (ms) => new Promise((r) => setTimeout(r, ms));
const MODO = process.argv[2] === 'vecchio' ? 'vecchio' : 'nuovo';
const BASE = MODO === 'vecchio' ? 'http://127.0.0.1:8001/' : 'http://127.0.0.1:8000/';
const SCELTE = process.argv.slice(3);
const esiti = [];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ---------- dati: salva e rimetti ----------
function salvaCelle(filtro) {
  return sql('select coalesce(json_agg(p), \'[]\') from piano p where ' + filtro);
}
function rimettiCelle(filtro, json) {
  // trigger spenti: il ripristino della prova non entra nello storico del piano
  sql(
    'begin; set local session_replication_role = replica; delete from piano where ' +
      filtro +
      "; insert into piano overriding system value select * from json_populate_recordset(null::piano, " +
      q(json) +
      '); commit;',
  );
}
function cella(nome, data) {
  const r = sql(
    "select json_build_object('codice',codice,'protetto',protetto,'generato',generato,'commento',commento,'motivo',motivo_blocco,'reparto',reparto_dip,'operatore',operatore) from piano where collaboratore=" +
      q(nome) +
      ' and data=' +
      q(data),
  );
  return r ? JSON.parse(r) : null;
}
const MAX = {};
function segnaMassimi() {
  MAX.reg = sql('select coalesce(max(id),0) from registrazioni');
  MAX.mod = sql('select coalesce(max(id),0) from moduli');
  MAX.punti = sql('select coalesce(max(id),0) from punti_eventi');
  MAX.prom = sql('select coalesce(max(id),0) from promemoria');
  MAX.log = sql('select coalesce(max(id),0) from log_attivita');
  MAX.rap = sql('select coalesce(max(id),0) from rapporti_giornalieri');
}
function pulisciAltro(nomi) {
  const lista = nomi.map(q).join(',');
  sql('delete from registrazioni where id > ' + MAX.reg + ' and nome in (' + lista + ')');
  sql('delete from moduli where id > ' + MAX.mod + ' and collaboratore in (' + lista + ')');
  sql('delete from punti_eventi where id > ' + MAX.punti + ' and collaboratore in (' + lista + ')');
  // rapporti del giorno creati dalle prove (malattia registrata anche nel Rapporto)
  sql(
    'delete from rapporti_giornalieri where id > ' +
      MAX.rap +
      " and data_rapporto between '2026-12-01' and '2027-01-31' and (" +
      nomi.map((n) => 'assenze like ' + q('%' + n + '%')).join(' or ') +
      ')',
  );
}
function logDopo(testo) {
  return parseInt(
    sql('select count(*) from log_attivita where id > ' + MAX.log + ' and (azione || dettaglio) like ' + q('%' + testo + '%')),
  );
}

// ---------- browser ----------
let browser;
async function apri(op) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p._err = [];
  p.on('pageerror', (e) => p._err.push(e.message));
  p.on('dialog', (d) => d.dismiss());
  await p.setViewport({ width: 1400, height: 900 });
  sql('delete from login_attempts');
  for (let i = 0; i < 5; i++) {
    await p.goto(BASE, { waitUntil: 'networkidle2' });
    if (await p.evaluate(() => typeof checkPwd === 'function')) break;
  }
  if (op)
    await p.waitForFunction(
      (op) => [...document.getElementById('login-nome').options].some((o) => o.value === op),
      { timeout: 30000 },
      op,
    );
  await p.evaluate((op) => {
    if (op) {
      document.getElementById('login-nome').value = op;
      document.getElementById('pwd-input').value = 'ProvaLocale1!';
    } else document.getElementById('pwd-input').value = 'ProvaAdmin1!';
    checkPwd();
  }, op);
  await p.waitForFunction(() => window._loadAllDone === true, { timeout: 240000 });
  await p.evaluate(() => {
    clearTimeout(window._pianoAutoPrimo);
    window._msg = [];
    window._risposte = []; // risposte alle conferme, in ordine (poi sempre si)
    window._confermaStd = async (t) => {
      _msg.push('C ' + String(t).slice(0, 300));
      return _risposte.length ? _risposte.shift() : true;
    };
    window.chiediConferma = window._confermaStd;
    window.toast = (t, d, k) => _msg.push((k === 'errore' ? 'E ' : 'T ') + t);
    window.toastErrore = (t) => _msg.push('E ' + t);
    window.mostraAvviso = async (t) => {
      _msg.push('A ' + String(t).slice(0, 400));
      return true;
    };
  });
  return p;
}
async function vai(p, ym, rep) {
  await p.evaluate(
    async (ym, rep) => {
      switchPage('piano');
      _pianoRepartoSel = rep;
      _pianoMeseSel = ym;
      pianoCambiaTab('calendario');
      await renderPiano();
    },
    ym,
    rep,
  );
  await att(600);
}
// un altro mese e ritorno (il PC ricarica il mese dal database: la "memoria" cambia)
async function ricarica(p, ym, rep) {
  const altro = ym === '2026-12' ? '2027-01' : '2026-12';
  await vai(p, altro, rep);
  await vai(p, ym, rep);
}
const msg = (p) => p.evaluate(() => window._msg.splice(0));
async function nUndo(p) {
  return p.evaluate(() => (window._pianoUndo || []).length);
}
// rete caduta dalla N-esima richiesta di scrittura che corrisponde a re in poi
async function interrompi(p, re, n) {
  let visti = 0;
  p._interr = { re: re, n: n };
  await p.setRequestInterception(true);
  p._gestore = (req) => {
    if (p._interr && p._interr.re.test(req.url()) && req.method() === 'POST') {
      visti++;
      if (visti >= p._interr.n) return req.abort('failed'); // da qui in poi la rete non c e
    }
    req.continue();
  };
  p.on('request', p._gestore);
}
async function smettiInterrompi(p) {
  if (p._gestore) p.off('request', p._gestore);
  p._gestore = null;
  p._interr = null;
  await p.setRequestInterception(false);
}
function esito(prova, descr, difetto, dettagli) {
  esiti.push({ prova, difetto });
  console.log(
    '\n[' + prova + '] ' + descr + '\n  ' + (difetto ? 'DIFETTO PRESENTE' : 'nessun difetto') + '\n  ' + dettagli.join('\n  '),
  );
}

// ---------- prove ----------
const PROVE = {};
const DIC = "data between '2026-12-01' and '2026-12-31'";

// 1. scrittura persa: un collega svuota la cella, l altro PC scrive sulla vista vecchia
PROVE.p1a = async (A, B) => {
  const N = 'Bernasconi Bintou';
  const D = '2026-12-05';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await vai(B, '2026-12', 'slots');
    await B.evaluate((n, d) => pianoSalvaCella(n, d, ''), N, D); // B svuota
    const u0 = await nUndo(A);
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D); // A sulla vista vecchia
    const m = await msg(A);
    const db = cella(N, D);
    const log = logDopo(N + ' ' + D + ' → S1');
    const mem = await A.evaluate((n, d) => (_pianoRighe.find((x) => x.collaboratore === n && x.data === d) || {}).codice || '', N, D);
    const persa = !db && log > 0;
    esito('p1a', 'cella svuotata da B, A scrive S1 sulla vista vecchia', persa, [
      'database: ' + (db ? db.codice : 'vuota') + ' · Registro "Piano modificato": ' + log + ' · schermo di A: ' + (mem || 'vuota'),
      'passi Annulla di A: ' + u0 + ' -> ' + (await nUndo(A)),
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
  }
};
// 1b. un collega cambia la cella, l altro PC la riscrive sopra senza saperlo
PROVE.p1b = async (A, B) => {
  const N = 'Bernasconi Bintou';
  const D = '2026-12-06';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await vai(B, '2026-12', 'slots');
    await B.evaluate((n, d) => pianoSalvaCella(n, d, 'R24'), N, D);
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    const m = await msg(A);
    const db = cella(N, D);
    esito('p1b', 'B cambia S7 in R24, A scrive S1 sulla vista vecchia (S7)', db.codice !== 'R24', [
      'database: ' + db.codice + ' (scritta da ' + db.operatore + ')',
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
  }
};
// 2. inserimento con chiave doppia: A vede la cella vuota, B ci mette una V protetta
PROVE.p2 = async (A, B) => {
  const N = 'Bernasconi Bintou';
  const D = '2027-01-12';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  const D2 = '2027-01-13';
  const filtro2 = 'collaboratore=' + q(N) + ' and data=' + q(D2);
  const salv2 = salvaCelle(filtro2);
  try {
    await vai(A, '2027-01', 'slots');
    await vai(B, '2027-01', 'slots');
    await B.evaluate((n, d) => pianoSalvaCella(n, d, 'V'), N, D);
    const vB = cella(N, D);
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    const m = await msg(A);
    const db = cella(N, D);
    // stesso caso dal punto unico degli inserimenti (Assegna CGF, coperture, vacanze...)
    await B.evaluate((n, d) => pianoSalvaCella(n, d, 'V'), N, D2);
    const r2 = await A.evaluate(async (n, d) => {
      try {
        await _pianoInserisciCella({ collaboratore: n, data: d, codice: 'CGF', protetto: false, generato: true, reparto_dip: 'slots', operatore: getOperatore() });
        return 'scritta';
      } catch (e) {
        return 'errore: ' + e.message;
      }
    }, N, D2);
    const db2 = cella(N, D2);
    esito('p2', 'B mette V protetta dove A vede vuoto; A scrive S1 / inserimento CGF', db.codice !== 'V' || db2.codice !== 'V', [
      'V di B: ' + JSON.stringify(vB) + ' -> dopo A: ' + JSON.stringify(db),
      'messaggi A: ' + JSON.stringify(m),
      '_pianoInserisciCella CGF su V protetta: ' + r2 + ' -> database ' + db2.codice,
    ]);
  } finally {
    rimettiCelle(filtro, salv);
    rimettiCelle(filtro2, salv2);
  }
};
// 3a. Annulla del Piano: cella di un collega (non toccata dall operazione) riportata indietro
PROVE.p3a = async (A, B) => {
  const N = 'Zanotti Italo';
  const filtro = 'collaboratore=' + q(N) + " and data in ('2026-12-02','2026-12-03')";
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await vai(B, '2026-12', 'slots');
    await A.evaluate((n) => pianoSalvaCella(n, '2026-12-02', 'S1'), N);
    await B.evaluate((n) => pianoSalvaCella(n, '2026-12-03', 'R23'), N);
    await ricarica(A, '2026-12', 'slots'); // A vede anche la modifica di B
    await A.evaluate(() => pianoAnnulla());
    const m = await msg(A);
    const c2 = cella(N, '2026-12-02');
    const c3 = cella(N, '2026-12-03');
    esito('p3a', 'A scrive il 02, B il 03; A annulla', c3.codice !== 'R23' || c2.codice !== 'C', [
      '02 (di A): ' + c2.codice + ' (atteso C) · 03 (di B): ' + c3.codice + ' (atteso R23)',
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
  }
};
// 3b. Annulla del Piano: cella dell operazione cambiata poi dal collega -> si deve chiedere
PROVE.p3b = async (A, B) => {
  const N = 'Zanotti Italo';
  const D = '2026-12-08';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await vai(B, '2026-12', 'slots');
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    await vai(B, '2026-12', 'slots'); // B vede la S1 di A e la cambia
    await B.evaluate((n, d) => pianoSalvaCella(n, d, 'R23'), N, D);
    await ricarica(A, '2026-12', 'slots');
    await A.evaluate(() => {
      _risposte = [false]; // alla domanda "modifiche di altri": lascio le sue
    });
    await A.evaluate(() => pianoAnnulla());
    const m = await msg(A);
    const db = cella(N, D);
    const chiesto = m.some((x) => /altro operatore/.test(x));
    esito('p3b', 'A scrive S1, B la cambia in R23; A annulla (alla domanda: lascio le sue)', db.codice !== 'R23' || !chiesto, [
      'database: ' + db.codice + ' (atteso R23) · domanda fatta: ' + chiesto,
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
  }
};
// 3c. Annulla interrotto a meta (rete): le celle non devono restare cancellate
PROVE.p3c = async (A) => {
  const N = 'Zanotti Italo';
  const D = '2026-12-09';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    // la scrittura di ripristino si interrompe: vecchio = bulk_upsert dopo la cancellazione
    // (la prima chiamata e il controllo della sessione con zero righe), nuovo = l unica scrittura
    if (MODO === 'vecchio') await interrompi(A, /rpc\/piano_bulk_upsert/, 2);
    else await interrompi(A, /rpc\/piano_scrivi_celle/, 1);
    await A.evaluate(() => pianoAnnulla());
    await smettiInterrompi(A);
    const m = await msg(A);
    const db = cella(N, D);
    const u = await nUndo(A);
    esito('p3c', 'A scrive S1, poi Annulla con la rete che cade sulla scrittura', !db, [
      'database: ' + (db ? db.codice : 'CELLA CANCELLATA') + ' · passi Annulla rimasti: ' + u,
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    await smettiInterrompi(A).catch(() => {});
    rimettiCelle(filtro, salv);
  }
};
// 3d. Rinuncia alla bozza: riportava indietro tutto il mese senza controlli
PROVE.p3d = async (A, B) => {
  const filtro = "reparto_dip='slots' and " + DIC;
  const N = 'Cenci Yari';
  const D = '2026-12-09';
  const filtroB = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  const vac = sql("select coalesce(json_agg(v), '[]') from piano_vacanze v");
  const nC0 = sql("select count(*) from piano where " + filtro + " and codice='C' and generato");
  try {
    await vai(A, '2026-12', 'slots');
    await vai(B, '2026-12', 'slots');
    // A genera la bozza; alla domanda finale si ferma finche B non ha cambiato una cella
    await A.evaluate(() => {
      window._fermo = null;
      window.chiediConferma = async (t) => {
        _msg.push('C ' + String(t).slice(0, 120));
        if (/^(Prepara il mese|Genera bozza) per/.test(t)) {
          window._inAttesa = true;
          await new Promise((r) => (window._fermo = r));
          return false; // rinuncia
        }
        return true;
      };
      window._fine = generaBozzaPiano(false).then(() => 'fatto');
    });
    await A.waitForFunction(() => window._inAttesa === true, { timeout: 300000, polling: 300 });
    await B.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    const durante = sql("select count(*) from piano where " + filtro + " and codice='C' and generato");
    await A.evaluate(() => window._fermo());
    await A.evaluate(() => window._fine);
    const m = await msg(A);
    const db = cella(N, D);
    const nC1 = sql("select count(*) from piano where " + filtro + " and codice='C' and generato");
    esito('p3d', 'A genera la bozza di dicembre, B scrive S1 a Cenci 09.12, A rinuncia alla bozza', db.codice !== 'S1' || nC1 !== nC0, [
      'cella di B: ' + db.codice + ' (atteso S1) · C della bozza: prima ' + nC0 + ', durante ' + durante + ', dopo ' + nC1,
      'messaggi A: ' + JSON.stringify(m.slice(-4)),
    ]);
  } finally {
    rimettiCelle(filtro + ' or (' + filtroB + ')', salv);
    // la bozza riallinea anche le vacanze del mese: si rimettono come erano
    sql(
      'begin; set local session_replication_role = replica; delete from piano_vacanze; insert into piano_vacanze overriding system value select * from json_populate_recordset(null::piano_vacanze, ' +
        q(vac) +
        '); commit;',
    );
  }
};
// 4a. Scambio turno interrotto a meta
PROVE.p4a = async (A) => {
  const D = '2026-12-12';
  const N1 = 'Bernasconi Bintou'; // S7
  const N2 = 'Zanotti Italo'; // C5
  const filtro = 'data=' + q(D) + ' and collaboratore in (' + q(N1) + ',' + q(N2) + ')';
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    const scambia = () =>
      A.evaluate(
        async (n1, n2, d) => {
          _pianoCellaSel = { nome: n1, data: d };
          await apriScambioTurno();
          document.getElementById('scambio-collega').value = n2;
          window.caricaJsPDF = async () => {}; // niente PDF nella prova
          window.jspdf = null;
          await confermaScambioTurno();
        },
        N1,
        N2,
        D,
      );
    if (MODO === 'vecchio') await interrompi(A, /rpc\/secure_update/, 2);
    else await interrompi(A, /rpc\/piano_scrivi_celle/, 1);
    await scambia();
    await smettiInterrompi(A);
    const m = await msg(A);
    const c1 = cella(N1, D);
    const c2 = cella(N2, D);
    const meta = c1.codice !== 'S7' && c2.codice === 'C5';
    const righe = [
      'rete caduta sulla seconda scrittura: ' + N1 + ' ' + c1.codice + ' · ' + N2 + ' ' + c2.codice + ' (prima S7 / C5)',
      'messaggi A: ' + JSON.stringify(m),
    ];
    if (MODO === 'nuovo') {
      // senza interruzione: tutti e due, poi Annulla li rimette tutti e due
      await vai(A, '2026-12', 'slots');
      await scambia();
      const s1 = cella(N1, D).codice + '/' + cella(N2, D).codice;
      await A.evaluate(() => pianoAnnulla());
      const s2 = cella(N1, D).codice + '/' + cella(N2, D).codice;
      righe.push('scambio completo: ' + s1 + ' · dopo Annulla: ' + s2 + ' · messaggi: ' + JSON.stringify(await msg(A)));
    }
    esito('p4a', 'scambio turno ' + N1 + ' (S7) <-> ' + N2 + ' (C5) il 12.12', meta, righe);
  } finally {
    await smettiInterrompi(A).catch(() => {});
    rimettiCelle(filtro, salv);
    pulisciAltro([N1, N2]);
  }
};
// 4b. Copertura malattia interrotta a meta
PROVE.p4b = async (A) => {
  const N = 'Cenci Yari';
  const filtro = "reparto_dip='slots' and data between '2026-12-08' and '2026-12-11'";
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    const proposta = await A.evaluate(async (n) => {
      apriCoperturaMalattia();
      document.getElementById('mal-collab').value = n;
      document.getElementById('mal-da').value = 9;
      document.getElementById('mal-al').value = 10;
      await cercaSostitutiMalattia();
      return (_malattiaPiano.giorni || []).map((d) => d.g + ':' + d.codice + '>' + (d.sostituto || '-'));
    }, N);
    if (MODO === 'vecchio') await interrompi(A, /rpc\/secure_update|rpc\/secure_insert/, 2);
    else await interrompi(A, /rpc\/piano_scrivi_celle/, 1);
    await A.evaluate(() => {
      _risposte = [true, false]; // domenica (se chiesta) si, punti no
      return confermaCoperturaMalattia();
    });
    await smettiInterrompi(A);
    const m = await msg(A);
    const dopo = JSON.parse(salvaCelle(filtro));
    const prima = JSON.parse(salv);
    const cambiate = prima
      .filter((r) => {
        const d = dopo.find((x) => x.collaboratore === r.collaboratore && x.data === r.data);
        return !d || d.codice !== r.codice;
      })
      .map((r) => r.collaboratore.split(' ')[0] + ' ' + r.data.substring(8) + ' ' + r.codice + '->' + ((dopo.find((x) => x.collaboratore === r.collaboratore && x.data === r.data) || {}).codice || 'vuota'));
    const righe = [
      'proposta: ' + proposta.join(', '),
      'celle cambiate nonostante la copertura non riuscita: ' + (cambiate.join(', ') || 'nessuna'),
      'messaggi A: ' + JSON.stringify(m),
    ];
    if (MODO === 'nuovo') {
      // senza interruzione: tutte le celle in una scrittura, poi Annulla le rimette tutte
      await vai(A, '2026-12', 'slots');
      await A.evaluate(async (n) => {
        apriCoperturaMalattia();
        document.getElementById('mal-collab').value = n;
        document.getElementById('mal-da').value = 9;
        document.getElementById('mal-al').value = 10;
        await cercaSostitutiMalattia();
        _risposte = [true, false, false]; // domenica si, punti no, Diario no
        await confermaCoperturaMalattia();
      }, N);
      const scritte = JSON.parse(salvaCelle(filtro));
      const diverse = prima.filter((r) => {
        const d = scritte.find((x) => x.collaboratore === r.collaboratore && x.data === r.data);
        return !d || d.codice !== r.codice;
      }).length;
      await A.evaluate(() => {
        _risposte = [true];
        return pianoAnnulla();
      });
      const rimesse = JSON.parse(salvaCelle(filtro));
      const ancora = prima.filter((r) => {
        const d = rimesse.find((x) => x.collaboratore === r.collaboratore && x.data === r.data);
        return !d || d.codice !== r.codice;
      }).length;
      righe.push('copertura completa: ' + diverse + ' celle cambiate · dopo Annulla ancora diverse: ' + ancora + ' · messaggi: ' + JSON.stringify((await msg(A)).filter((x) => !/^C /.test(x))));
    }
    esito('p4b', 'copertura malattia di ' + N + ' 9-10.12, rete caduta sulla seconda scrittura', cambiate.length > 0, righe);
  } finally {
    await smettiInterrompi(A).catch(() => {});
    rimettiCelle(filtro, salv);
    pulisciAltro(['Cenci Yari']);
    sql("delete from punti_eventi where id > " + MAX.punti + " and azione = 'copertura'");
  }
};
// 5a. Annulla generale di un aggiunta modificata poi da un collega
PROVE.p5a = async (A, B) => {
  let id = null;
  try {
    id = await A.evaluate(async () => {
      // solo questa azione nelle pile (le prove prima ne hanno lasciate altre)
      window._pianoUndo = [];
      window._pianoRedo = [];
      window.Annulla.azzera();
      const r = await secPost('promemoria', { titolo: 'prova multipc', data_scadenza: '2026-12-20', creato_da: getOperatore() });
      window.Annulla.chiudiGruppo('Promemoria di prova');
      return r[0].id;
    });
    await B.evaluate((id) => secPatch('promemoria', 'id=eq.' + id, { titolo: 'prova multipc (cambiato da B)' }), id);
    await A.evaluate(() => {
      _risposte = [true, false]; // "Annullare: ...?" si; "modificata da altri": no
    });
    await A.evaluate(() => annullaGlobale());
    const m = await msg(A);
    const ora = sql('select titolo from promemoria where id=' + id) || '(cancellato)';
    esito('p5a', 'A aggiunge un promemoria, B lo modifica, A annulla (alla domanda: no)', !/cambiato da B/.test(ora), [
      'promemoria: ' + ora,
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    if (id) sql('delete from promemoria where id=' + id);
  }
};
// 5b. Annulla generale di un impostazione cambiata poi da un collega
PROVE.p5b = async (A, B) => {
  try {
    sql("delete from impostazioni where chiave='prova_multipc'");
    await A.evaluate(async () => {
      window._pianoUndo = [];
      window._pianoRedo = [];
      window.Annulla.azzera();
      await setImp('prova_multipc', 'valore di A');
      window.Annulla.chiudiGruppo('Impostazione di prova');
    });
    await B.evaluate(() => setImp('prova_multipc', 'valore di B'));
    await A.evaluate(() => {
      _risposte = [true, false];
    });
    await A.evaluate(() => annullaGlobale());
    const m = await msg(A);
    const ora = sql("select valore from impostazioni where chiave='prova_multipc'");
    esito('p5b', 'A salva un impostazione, B la cambia, A annulla (alla domanda: no)', ora !== 'valore di B', [
      'impostazione: ' + JSON.stringify(ora),
      'messaggi A: ' + JSON.stringify(m),
    ]);
  } finally {
    sql("delete from impostazioni where chiave='prova_multipc'");
  }
};
// 6. malattia messa e tolta: la cella deve tornare com era (bozza, nota, protetto)
async function provaMalattia(A, prova, N, D, comeMettere) {
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    const prima = cella(N, D);
    const it = D.split('-').reverse().join('.');
    if (comeMettere === 'diario') await A.evaluate((n, d, it) => sincronizzaMalattiaPiano(n, '', d, 'il ' + it), N, D, it);
    else
      await A.evaluate((n, d) => {
        _risposte = [false]; // "registro la malattia anche nel Rapporto e nel Diario?" no
        return pianoSalvaCella(n, d, 'M');
      }, N, D);
    const conM = cella(N, D);
    await A.evaluate((n, d, it) => sincronizzaMalattiaPiano(n, 'il ' + it, d, ''), N, D, it);
    const dopo = cella(N, D);
    const uguale = ['codice', 'protetto', 'generato', 'commento', 'motivo'].every((k) => (prima[k] || null) === (dopo[k] || null));
    esito(prova, 'malattia ' + (comeMettere === 'diario' ? 'dal Diario' : 'scritta a mano') + ' su ' + N + ' ' + D + ', poi tolta dal Diario', !uguale, [
      'prima: ' + JSON.stringify(prima),
      'con M: ' + JSON.stringify(conM),
      'dopo:  ' + JSON.stringify(dopo),
      'messaggi A: ' + JSON.stringify(await msg(A)),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
    pulisciAltro([N]);
  }
}
PROVE.p6a = (A) => provaMalattia(A, 'p6a', 'Cenci Yari', '2026-12-11', 'diario'); // C della bozza, nota "Compleanno"
PROVE.p6b = (A) => provaMalattia(A, 'p6b', 'Zanotti Italo', '2026-12-10', 'mano'); // C della bozza
// 7a. generazione automatica mentre una scrittura a mano aspetta una risposta
PROVE.p7a = async (A) => {
  const N = 'Maksuti Halil';
  const D = '2026-12-10';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'valet');
    await A.evaluate(
      (n, d) => {
        window._modulo = null;
        window.chiediModulo = () => new Promise((r) => (window._modulo = r));
        window._manuale = pianoSalvaCella(n, d, 'JG');
      },
      N,
      D,
    );
    await A.waitForFunction(() => !!window._modulo, { timeout: 30000 });
    // parte la generazione automatica (slots dicembre: bozza gia presente, si salta)
    await A.evaluate(() => {
      window._auto = _pianoAutoEsegui('slots', '2026-12', 0);
    });
    // il settore in memoria cambia appena la generazione parte (codice vecchio): si
    // risponde subito; con il codice nuovo la generazione aspetta e il settore resta
    await A.waitForFunction(() => _pianoReparto() !== 'valet', { timeout: 4000, polling: 20 }).catch(() => {});
    const repDurante = await A.evaluate(() => _pianoReparto());
    await A.evaluate(() => window._modulo({ da0: '10:00', a0: '18:00', da1: '', a1: '', da2: '', a2: '' }));
    await A.evaluate(() => window._manuale);
    await A.evaluate(() => window._auto);
    const db = cella(N, D);
    esito('p7a', 'JG a mano su ' + N + ' (Valet) ferma sull orario, intanto parte la generazione automatica', !db || db.reparto !== 'valet', [
      'settore in memoria mentre la scrittura aspettava: ' + repDurante,
      'cella scritta: ' + JSON.stringify(db),
      'messaggi A: ' + JSON.stringify((await msg(A)).slice(-3)),
    ]);
  } finally {
    rimettiCelle(filtro, salv);
  }
};
// 7b. generazione automatica con la pila di Annulla piena (15 passi)
PROVE.p7b = async (A) => {
  await vai(A, '2026-12', 'slots');
  const prima = await A.evaluate(() => {
    window._pianoUndo = [];
    for (let i = 1; i <= 15; i++) _pianoUndoSnap('passo ' + i);
    return window._pianoUndo.map((x) => x.label);
  });
  await A.evaluate(() => _pianoAutoEsegui('valet', '2027-01', 0)); // nessun fabbisogno: si salta subito
  const dopo = await A.evaluate(() => window._pianoUndo.map((x) => x.label));
  await A.evaluate(() => {
    window._pianoUndo = [];
    window._pianoSessSnap = {};
  });
  esito('p7b', 'pila di Annulla piena (15) e generazione automatica', JSON.stringify(prima) !== JSON.stringify(dopo), [
    'prima: ' + prima[0] + ' ... ' + prima[prima.length - 1] + ' (' + prima.length + ')',
    'dopo:  ' + dopo[0] + ' ... ' + dopo[dopo.length - 1] + ' (' + dopo.length + ')',
    'messaggi A: ' + JSON.stringify((await msg(A)).slice(-2)),
  ]);
};
// 8. senza rete: un messaggio solo, nessun passo di Annulla
PROVE.p8 = async (A) => {
  const N = 'Bernasconi Bintou';
  const D = '2026-12-07';
  const filtro = 'collaboratore=' + q(N) + ' and data=' + q(D);
  const salv = salvaCelle(filtro);
  try {
    await vai(A, '2026-12', 'slots');
    await msg(A);
    const u0 = await nUndo(A);
    await A.setOfflineMode(true);
    await A.evaluate((n, d) => pianoSalvaCella(n, d, 'S1'), N, D);
    await att(1500);
    await A.setOfflineMode(false);
    const m = await msg(A);
    const u1 = await nUndo(A);
    const db = cella(N, D);
    esito('p8', 'senza rete: A scrive S1', m.length !== 1 || u1 !== u0, [
      'messaggi (' + m.length + '): ' + JSON.stringify(m),
      'passi Annulla: ' + u0 + ' -> ' + u1 + ' · database: ' + db.codice,
    ]);
    await A.evaluate(() => {
      window._sessioneScadutaAvvisata = false;
    });
  } finally {
    await A.setOfflineMode(false).catch(() => {});
    rimettiCelle(filtro, salv);
  }
};

(async () => {
  console.log('PROVE PIU PC · codice ' + MODO + ' (' + BASE + ')');
  const copia = salvaCelle("data between '2026-12-01' and '2027-01-31'");
  fs.writeFileSync('/Users/bushi/DiarioProvaLocale/strumenti/check_generazione/multipc_backup/ultima_partenza.json', copia);
  segnaMassimi();
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    protocolTimeout: 900000,
  });
  const A = await apri(null);
  const B = await apri(null);
  const elenco = SCELTE.length ? SCELTE : Object.keys(PROVE);
  for (const nome of elenco) {
    for (const P of [A, B])
      await P.evaluate(() => {
        window._risposte = [];
        window.chiediConferma = window._confermaStd; // una prova puo averla cambiata
      }).catch(() => {});
    try {
      await PROVE[nome](A, B);
    } catch (e) {
      esiti.push({ prova: nome, errore: true });
      console.log('\n[' + nome + '] ERRORE DELLA PROVA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    await msg(A).catch(() => {});
    await msg(B).catch(() => {});
  }
  // controllo finale: dicembre e gennaio come alla partenza
  const ora = salvaCelle("data between '2026-12-01' and '2027-01-31'");
  const chiave = (r) => r.collaboratore + '|' + r.data + '|' + r.codice + '|' + r.protetto + '|' + r.generato + '|' + (r.commento || '') + '|' + (r.motivo_blocco || '') + '|' + r.reparto_dip;
  const a = new Set(JSON.parse(copia).map(chiave));
  const b = new Set(JSON.parse(ora).map(chiave));
  const diff = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  console.log('\n=== ' + MODO + ': ' + esiti.filter((x) => x.difetto).length + ' prove con il difetto, ' + esiti.filter((x) => !x.difetto && !x.errore).length + ' senza, ' + esiti.filter((x) => x.errore).length + ' non riuscite');
  console.log('errori di pagina A: ' + JSON.stringify(A._err.slice(0, 5)) + ' · B: ' + JSON.stringify(B._err.slice(0, 5)));
  console.log('celle di dicembre e gennaio diverse dalla partenza: ' + diff.length + (diff.length ? ' ' + JSON.stringify(diff.slice(0, 6)) : ''));
  await browser.close();
})();
