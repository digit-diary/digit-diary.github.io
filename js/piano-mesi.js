/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-mesi.js
 *
 * PREPARA PIÙ MESI (richiesta del titolare 15/10/2026): il piano di 3, 6 o 2-12 mesi del
 * settore aperto, uno dopo l altro, con le STESSE funzioni di un mese singolo:
 *   1. fabbisogno: se il mese non ce l ha si copia dal mese prima, come il pulsante
 *      "Copia dal mese precedente" (_pianoFabbisognoCopiaCalcola / Scrivi, piano-config.js);
 *   2. bozza: generaBozzaPiano (piano-genera.js) senza domande, nel modo della generazione
 *      automatica (window._pianoAutoInCorso): vacanze, C e WD, CGF, compleanni, turni;
 *   3. Migliora la bozza per i minuti scelti (pianoRicercaCalcola, piano-ricerca-ui.js),
 *      applicata solo se nessuna regola peggiora e i posti scoperti non aumentano (la
 *      stessa regola della finestra di Migliora: res.migliore);
 *   4. il mese dopo parte dal mese appena scritto: si rilegge dal database (bordo del
 *      mese, domeniche libere dell anno, ore dell anno) e le cache si azzerano prima.
 * Protezioni di un mese singolo: vacanze, malattie, ASS, ND, celle protette o scritte a
 * mano, giorni passati e mesi chiusi non si toccano (nel modo automatico la bozza non
 * cambia mai una cella scritta a mano, nemmeno per una vacanza: va nel riepilogo).
 * Ogni mese e UN passo di Annulla del piano (i passi di bozza e Migliora si uniscono);
 * il fabbisogno copiato e un passo dell Annulla generale (come il pulsante). "Annulla
 * tutti i mesi" li mette tutti nella coda di Annulla (annulla.js), dal piu recente.
 * Ferma: la preparazione finisce il mese in corso e si ferma; i mesi fatti restano.
 */

const PIANO_MESI_MINUTI = [0, 1, 2, 3];
let _pianoMesiStato = null; // { inCorso, ferma, fase, frazione, i, n, ym } mentre lavora
let _pianoMesiUltimo = null; // ultimo riepilogo (per riaprirlo e per Annulla tutti i mesi)

function _pianoMesiLabel(ym) {
  const p = String(ym).split('-');
  return ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(p[1]) - 1]) || ym) + ' ' + p[0];
}
// n mesi consecutivi da ym (compreso)
function _pianoMesiElenco(ym, n) {
  const p = String(ym).split('-');
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + i, 15);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}
function _pianoMesiDopo(ym) {
  return _pianoMesiElenco(ym, 2)[1];
}
// giorni del mese che la bozza puo scrivere (aperti o sbloccati): [[da, a], ...] a tratti
function _pianoMesiTrattiAperti(ym) {
  const nG = _pianoUltimoGiorno(ym);
  const tratti = [];
  for (let g = 1; g <= nG; g++) {
    const d = ym + '-' + String(g).padStart(2, '0');
    if (!_pianoGiornoScrivibile(d)) continue;
    const u = tratti[tratti.length - 1];
    if (u && u[2] === g - 1) {
      u[1] = d;
      u[2] = g;
    } else tratti.push([d, d, g]);
  }
  return tratti.map((t) => [t[0], t[1]]);
}
// CELLE CHE "RIGENERARE" TOGLIE: scritte dal programma (generato), senza lucchetto, senza
// motivo di blocco, senza colore e senza nota (tranne il compleanno, che la bozza rimette),
// nei giorni aperti. Mai le scritte a mano, le protette, le vacanze, le M.
const PIANO_MESI_FILTRO_GENERATE = '&generato=eq.true&protetto=eq.false&motivo_blocco=is.null&colore=is.null';
async function _pianoMesiGenerate(ym, rep) {
  const out = [];
  for (const [da, a] of _pianoMesiTrattiAperti(ym)) {
    const r =
      (await secGet(
        'piano?data=gte.' +
          da +
          '&data=lte.' +
          a +
          '&reparto_dip=eq.' +
          rep +
          PIANO_MESI_FILTRO_GENERATE +
          '&select=id,commento&limit=5000',
      )) || [];
    r.forEach((x) => {
      const nota = String(x.commento || '').trim();
      if (!nota || nota.toLowerCase() === 'compleanno') out.push(x.id);
    });
  }
  return out;
}
async function _pianoMesiTogliGenerate(ids) {
  for (let i = 0; i < ids.length; i += 200) await secDel('piano', 'id=in.(' + ids.slice(i, i + 200).join(',') + ')');
}
async function _pianoMesiFabbN(ym, rep) {
  const nG = _pianoUltimoGiorno(ym);
  const r =
    (await secGet(
      'piano_fabbisogni?data=gte.' +
        ym +
        '-01&data=lte.' +
        ym +
        '-' +
        String(nG).padStart(2, '0') +
        '&reparto_dip=eq.' +
        rep +
        '&select=id&limit=3000',
    )) || [];
  return r.length;
}

// CACHE DEL MESE PRIMA: il mese dopo deve vedere quello appena scritto. Il bordo del mese
// (_pianoRigheBordo) e le righe si rileggono gia a ogni bozza e a ogni Migliora; qui si
// azzerano le cache che restano in memoria: domeniche libere dell anno (5 minuti, per
// mese), ore dell anno (YTD) e ore reali del mese (per chiave di mese).
function _pianoMesiAzzeraCache() {
  if (typeof _pianoDomAnnoCache !== 'undefined')
    Object.keys(_pianoDomAnnoCache).forEach((k) => delete _pianoDomAnnoCache[k]);
  if (typeof _pianoYtdKey !== 'undefined') _pianoYtdKey = '';
  if (typeof _pianoOreMeseKey !== 'undefined') _pianoOreMeseKey = '';
  _pianoViolCelle = {};
  _pianoViolLista = null;
}
// fine del mese come sta nel database (ultimi 7 giorni del settore): il mese dopo la deve
// ritrovare uguale nel suo bordo
async function _pianoMesiCodaMese(ym, rep) {
  const nG = _pianoUltimoGiorno(ym);
  const da = ym + '-' + String(nG - 6).padStart(2, '0');
  const a = ym + '-' + String(nG).padStart(2, '0');
  const righe =
    (await secGet(
      'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + rep + '&select=collaboratore,data,codice',
    )) || [];
  const m = {};
  righe.forEach((r) => (m[r.collaboratore + '|' + String(r.data).substring(0, 10)] = r.codice));
  return { da: da, a: a, celle: m };
}
// confronto fra la fine del mese prima appena scritta e il bordo letto dalla bozza
function _pianoMesiControllaBordo(coda, rep) {
  if (!coda) return null;
  const bordo = {};
  (window._pianoRigheBordo || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    if (d < coda.da || d > coda.a || (r.reparto_dip || 'slots') !== rep) return;
    bordo[r.collaboratore + '|' + d] = r.codice;
  });
  const chiavi = new Set(Object.keys(coda.celle).concat(Object.keys(bordo)));
  let diverse = 0;
  chiavi.forEach((k) => {
    if (coda.celle[k] !== bordo[k]) diverse++;
  });
  return { controllate: chiavi.size, diverse: diverse };
}

// UN PASSO DI ANNULLA PER MESE: i passi aperti durante il mese (quello del mese, la bozza,
// Migliora) diventano uno solo, con la finestra dal primo all ultimo e le celle di tutti.
// La pila tiene 15 passi: quelli spinti fuori dai passi uniti tornano al loro posto.
function _pianoMesiUnisciPassi(passo, label) {
  const u = window._pianoUndo || [];
  const i = u.indexOf(passo);
  if (i < 0) return passo;
  if (typeof _pianoUndoChiudiAperto === 'function') _pianoUndoChiudiAperto();
  const altri = u.slice(i + 1);
  if (altri.length) {
    const ultimo = altri[altri.length - 1];
    passo.t1 = ultimo.t1 || passo.t1;
    if (ultimo.tUltima && (!passo.tUltima || Date.parse(ultimo.tUltima) > Date.parse(passo.tUltima)))
      passo.tUltima = ultimo.tUltima;
    passo.celle = passo.celle instanceof Set ? passo.celle : new Set(passo.celle || []);
    altri.forEach((s) => (s.celle || []).forEach((c) => passo.celle.add(c)));
    u.splice(i + 1);
    for (let k = altri.length - 1; k >= 0; k--) if (altri[k].tolto) u.unshift(altri[k].tolto);
    const sess = (window._pianoSessSnap || {})[passo.ym + '|' + passo.rep];
    if (sess) {
      sess.n = Math.max(1, sess.n - altri.length);
      if (sess.finestre) sess.finestre = sess.finestre.filter((f) => !altri.includes(f));
    }
  }
  passo.label = label;
  if (window._annullaAggiornaBarra) setTimeout(window._annullaAggiornaBarra, 0);
  return passo;
}
// il passo del mese senza scritture (mese saltato dopo la fotografia): si toglie
function _pianoMesiScartaPassi(passo) {
  const u = window._pianoUndo || [];
  const i = u.indexOf(passo);
  if (i < 0) return;
  for (const s of u.slice(i).reverse()) _pianoUndoScarta(s);
}

// I NUMERI DEL MESE come li conta Migliora (Controlla le regole + posti scoperti)
function _pianoMesiNumeri(x) {
  if (!x) return null;
  return {
    scoperti: x.scoperti,
    legge: x.legge,
    altre: x.regole - x.legge,
    oreFuori: x.oreSotto,
    buchi: x.blocchi || 0,
  };
}

// UN MESE. ui = { fase(testo, frazione 0-1 del mese) }. Ritorna la riga del riepilogo.
async function _pianoMesiUnMese(ym, rep, opz, ui, codaPrima) {
  const t0 = Date.now();
  const riga = { ym: ym, stato: 'fatto', note: [], tempi: {} };
  // tempi per fase (secondi), per il riepilogo e le misure
  let tFase = Date.now();
  const segna = (fase) => {
    riga.tempi[fase] = Math.round((Date.now() - tFase) / 100) / 10;
    tFase = Date.now();
  };
  const nG = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nG).padStart(2, '0');
  const auto = { rep: rep, ym: ym, inizio: t0, fase: '', mesi: true };
  window._pianoAutoInCorso = auto;
  _pianoMeseSel = ym;
  _pianoRepartoSel = rep;
  _pianoMesiAzzeraCache();
  await _pianoCaricaFestivita(parseInt(ym.substring(0, 4)));
  const fine = (stato, motivo) => {
    riga.stato = stato;
    if (motivo) riga.motivo = motivo;
    riga.secondi = Math.round((Date.now() - t0) / 1000);
    return riga;
  };
  // MESE CHIUSO (tutti i giorni passati): niente da fare
  if (!_pianoMesiTrattiAperti(ym).length) return fine('saltato', 'mese chiuso (giorni passati)');
  if (opz.salta && opz.salta.has(ym)) return fine('saltato', 'aveva già celle generate (scelto: Saltare)');
  // 1. FABBISOGNO
  ui.fase('Fabbisogno…', 0.02);
  const nFabb = await _pianoMesiFabbN(ym, rep);
  if (nFabb) riga.fabb = { copiato: false, celle: nFabb };
  else {
    if (!puoAzioniAutoPiano('fabbisogno'))
      return fine('saltato', 'senza fabbisogno: per copiarlo serve il permesso Modificare il fabbisogno');
    const calc = await _pianoFabbisognoCopiaCalcola(ym, rep, new Set());
    if (!calc.nPrec || !calc.nuovi.length)
      return fine('saltato', 'senza fabbisogno, e nemmeno ' + _pianoMesiLabel(calc.ymPrec) + ' ne ha uno da copiare');
    await _pianoFabbisognoCopiaScrivi(calc, ym);
    riga.fabb = { copiato: true, da: calc.ymPrec, celle: calc.nuovi.length };
    if (calc.senzaModello.length)
      riga.note.push(
        'fabbisogno vuoto per ' +
          calc.senzaModello.map((k) => calc.nomiProfilo[k] || k).join(', ') +
          ' (nessun giorno così in ' +
          _pianoMesiLabel(calc.ymPrec) +
          ')',
      );
  }
  segna('fabbisogno');
  // 2. BOZZA (un passo di Annulla per tutto il mese, aperto qui)
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, rep);
  const passo = _pianoUndoSnap('prepara più mesi ' + ym);
  try {
    return await _pianoMesiDopoFoto(ym, rep, opz, ui, codaPrima, { riga, auto, passo, segna, fine });
  } catch (e) {
    // errore a meta mese: quello che e stato scritto resta UN passo di Annulla
    _pianoMesiUnisciPassi(passo, 'prepara più mesi: ' + _pianoMesiLabel(ym) + ' (interrotto)');
    throw e;
  }
}
// il mese dopo la fotografia per Annulla: rigenera, bozza, Migliora, riepilogo
async function _pianoMesiDopoFoto(ym, rep, opz, ui, codaPrima, x) {
  const { riga, auto, passo, segna, fine } = x;
  if (opz.rigenera && opz.rigenera.has(ym)) {
    ui.fase('Tolgo le celle generate…', 0.04);
    const ids = await _pianoMesiGenerate(ym, rep);
    await _pianoMesiTogliGenerate(ids);
    riga.rigenerato = ids.length;
  }
  ui.fase('Bozza…', 0.06);
  auto.bozza = null;
  await generaBozzaPiano(false);
  const b = auto.bozza;
  segna('bozza');
  if (!b || b.saltata) {
    if (!riga.rigenerato) _pianoMesiScartaPassi(passo);
    else _pianoMesiUnisciPassi(passo, 'prepara più mesi: ' + _pianoMesiLabel(ym));
    return fine('saltato', (b && b.saltata) || 'bozza non fatta');
  }
  riga.bozza = { celle: b.celle || 0, scoperti: b.scoperti };
  if (b.volute > b.celle) riga.note.push(b.volute - b.celle + ' celle non scritte: in quei giorni c era già una cella');
  // il bordo letto dalla bozza e la fine del mese prima appena scritta: devono coincidere
  riga.bordo = _pianoMesiControllaBordo(codaPrima, rep);
  if (riga.bordo && riga.bordo.diverse)
    riga.note.push(
      'fine del mese prima letta diversa da quella scritta (' + riga.bordo.diverse + ' celle): controlla il passaggio',
    );
  // 3. MIGLIORA (o solo la misura, con 0 minuti)
  const minuti = opz.minuti || 0;
  let res;
  if (minuti > 0 && (b.celle || 0) > 0) {
    const sec = minuti * 60;
    res = await pianoRicercaCalcola(sec, (x) =>
      ui.fase(
        'Migliora… ' + Math.round(x.frazione * 100) + '% · posti scoperti ' + x.scoperti,
        0.4 + 0.55 * x.frazione,
      ),
    );
    riga.migliora = { minuti: minuti, prima: _pianoMesiNumeri(res.prima), applicata: false, cambi: 0 };
    if (res.migliore && res.cambi.length) {
      ui.fase('Scrivo i miglioramenti…', 0.97);
      await _ricercaScrivi(res);
      riga.migliora.applicata = true;
      riga.migliora.cambi = res.cambi.length;
      if (res.saltate && res.saltate.length)
        riga.note.push(res.saltate.length + ' celle cambiate a mano nel frattempo: lasciate come erano');
    } else if (res.motivi && res.motivi.length) riga.migliora.motivi = res.motivi.slice();
    riga.numeri = _pianoMesiNumeri(riga.migliora.applicata ? res.dopo : res.prima);
    segna('migliora');
  } else {
    ui.fase('Controllo le regole…', 0.9);
    res = await pianoRicercaCalcola(1, null, { iterazioni: 1 });
    riga.numeri = _pianoMesiNumeri(res.prima);
    segna('controllo');
  }
  // da controllare a mano (come nel resoconto della generazione automatica)
  const giorno = (d) => String(d).substring(8, 10) + '.' + String(d).substring(5, 7);
  if (auto.aManoNonToccate && auto.aManoNonToccate.length)
    riga.note.push(
      'celle scritte a mano lasciate dove le vacanze vorrebbero altro: ' +
        auto.aManoNonToccate
          .slice(0, 8)
          .map((x) => x.nome + ' ' + giorno(x.data) + ' (' + x.attuale + ', vacanze: ' + x.voluto + ')')
          .join('; ') +
        (auto.aManoNonToccate.length > 8 ? ' e altre ' + (auto.aManoNonToccate.length - 8) : ''),
    );
  if (auto.cMesePrima && auto.cMesePrima.length)
    riga.note.push(
      'C prima delle vacanze da mettere a mano nel mese precedente: ' +
        auto.cMesePrima.map((x) => x.nome + ' ' + giorno(x.data)).join(', '),
    );
  if (auto.vSenzaFile && auto.vSenzaFile.length)
    riga.note.push(auto.vSenzaFile.length + ' V nel piano senza vacanza nel file (lasciate come sono)');
  if (b.riposiDaSistemare && b.riposiDaSistemare.length)
    riga.note.push('riposo attorno alla domenica da sistemare: ' + b.riposiDaSistemare.join(', '));
  riga.passo = _pianoMesiUnisciPassi(passo, 'prepara più mesi: ' + _pianoMesiLabel(ym));
  return fine('fatto');
}

// LA SEQUENZA: piano = { rep, mesi: [ym], minuti, rigenera: Set, salta: Set }
// ui = { fase(testo, frazione del mese), mese(i, n, ym) } ; si ferma alla fine del mese
// in corso se _pianoMesiStato.ferma. Ritorna { righe, fermato }.
async function _pianoMesiEsegui(piano, ui) {
  const righe = [];
  let coda = null; // fine del mese prima, come scritta
  let fermato = false;
  for (let i = 0; i < piano.mesi.length; i++) {
    if (_pianoMesiStato && _pianoMesiStato.ferma) {
      fermato = true;
      break;
    }
    const ym = piano.mesi[i];
    if (ui.mese) ui.mese(i, piano.mesi.length, ym);
    let riga;
    try {
      riga = await _pianoOperazione(() => _pianoMesiUnMese(ym, piano.rep, piano, ui, coda));
    } catch (e) {
      console.error('[piano-mesi]', ym, e);
      riga = { ym: ym, stato: 'errore', motivo: String((e && e.message) || e), note: [] };
    }
    righe.push(riga);
    if (riga.stato === 'errore') {
      fermato = true;
      break;
    }
    coda = riga.stato === 'fatto' ? await _pianoMesiCodaMese(ym, piano.rep) : null;
    await new Promise((x) => setTimeout(x, 0)); // la pagina respira fra un mese e l altro
  }
  return { righe: righe, fermato: fermato };
}

// ---------------------------------------------------------------- comando
async function pianoPreparaMesi() {
  if (!_pianoAzioneAutoConsentita('genera')) return; // stesso permesso di Prepara il mese
  if (!puoGestirePiano()) return;
  if (window._pianoAutoInCorso || (typeof _pianoAutoControllo !== 'undefined' && _pianoAutoControllo)) {
    toastErrore('Una generazione del piano è già in corso su questo PC: riprova fra qualche minuto.');
    return;
  }
  const rep = _pianoReparto();
  const ymAperto = _pianoMeseSel;
  const scelta = await chiediModulo(
    'Il programma prepara il piano di ' +
      repartoLabel(rep) +
      ' per più mesi, uno dopo l altro, come Prepara il mese: copia il fabbisogno dal mese prima se manca, fa la bozza, la migliora per il tempo scelto (si applica solo se migliora e nessuna regola peggiora) e passa al mese dopo, che parte dal mese appena preparato (riposi a cavallo, giorni di fila, domeniche, ore dell anno).\n\nNon tocca vacanze, malattie, celle protette o scritte a mano, giorni passati.',
    [
      {
        titolo: 'Quanti mesi',
        campi: [
          {
            id: 'n',
            tipo: 'scelta',
            valore: '3',
            opzioni: [
              { valore: '3', etichetta: '3 mesi' },
              { valore: '6', etichetta: '6 mesi' },
              { valore: 'altro', etichetta: 'altro:' },
            ],
          },
          { id: 'altro', tipo: 'testo', segnaposto: '2-12', larghezza: 60 },
        ],
      },
      {
        titolo: 'Da quale mese',
        campi: [
          {
            id: 'da',
            tipo: 'scelta',
            valore: 'aperto',
            opzioni: [
              { valore: 'aperto', etichetta: 'dal mese aperto (' + _pianoMesiLabel(ymAperto) + ')' },
              { valore: 'dopo', etichetta: 'dal successivo (' + _pianoMesiLabel(_pianoMesiDopo(ymAperto)) + ')' },
            ],
          },
        ],
      },
      {
        titolo: 'Migliora la bozza, per ogni mese',
        campi: [
          {
            id: 'min',
            tipo: 'scelta',
            valore: '1',
            opzioni: PIANO_MESI_MINUTI.map((m) => ({
              valore: String(m),
              etichetta: m ? 'circa ' + m + (m === 1 ? ' minuto' : ' minuti') : 'no, solo la bozza',
            })),
          },
        ],
      },
    ],
    {
      titolo: 'Prepara più mesi',
      ok: 'Avanti',
      controlla: (v) => {
        if (v.n !== 'altro') return '';
        const n = parseInt(v.altro);
        return n >= 2 && n <= 12 && String(n) === String(v.altro).trim() ? '' : 'Scrivi un numero di mesi da 2 a 12';
      },
    },
  );
  if (!scelta) return;
  const n = scelta.n === 'altro' ? parseInt(scelta.altro) : parseInt(scelta.n);
  const minuti = parseInt(scelta.min) || 0;
  const mesi = _pianoMesiElenco(scelta.da === 'dopo' ? _pianoMesiDopo(ymAperto) : ymAperto, n);
  // CONTROLLO PRIMA DI PARTIRE: mesi chiusi, fabbisogno da copiare, celle gia generate
  let info;
  try {
    info = await Promise.all(
      mesi.map(async (ym) => ({
        ym: ym,
        chiuso: !_pianoMesiTrattiAperti(ym).length,
        fabb: await _pianoMesiFabbN(ym, rep),
        generate: (await _pianoMesiGenerate(ym, rep)).length,
      })),
    );
  } catch (e) {
    toastErrore('Controllo dei mesi non riuscito: ' + ((e && e.message) || e));
    return;
  }
  const conGenerate = info.filter((x) => !x.chiuso && x.generate);
  const daCopiare = info.filter((x) => !x.chiuso && !x.fabb);
  const chiusi = info.filter((x) => x.chiuso);
  const testo =
    'Preparo ' +
    n +
    ' mesi di ' +
    repartoLabel(rep) +
    ': da ' +
    _pianoMesiLabel(mesi[0]) +
    ' a ' +
    _pianoMesiLabel(mesi[mesi.length - 1]) +
    (minuti ? ', Migliora circa ' + minuti + ' min per mese' : ', solo la bozza') +
    '.' +
    (daCopiare.length
      ? '\n\nFabbisogno da copiare dal mese prima: ' + daCopiare.map((x) => _pianoMesiLabel(x.ym)).join(', ') + '.'
      : '') +
    (chiusi.length ? '\n\nMesi chiusi, saltati: ' + chiusi.map((x) => _pianoMesiLabel(x.ym)).join(', ') + '.' : '') +
    '\n\nOgni mese si annulla con Annulla (un passo per mese); alla fine c è anche Annulla tutti i mesi.';
  const opz = { rep: rep, mesi: mesi, minuti: minuti, rigenera: new Set(), salta: new Set() };
  if (conGenerate.length) {
    const r = await chiediScelta(
      testo +
        '\n\nQuesti mesi hanno già celle preparate dal programma:\n' +
        conGenerate.map((x) => '• ' + _pianoMesiLabel(x.ym) + ': ' + x.generate + ' celle generate').join('\n') +
        '\n\nRigenerare = tolgo solo le celle generate (mai quelle scritte a mano, protette o con nota) e rifaccio il mese. Saltare = quei mesi restano come sono.',
      [
        { valore: 'rigenera', etichetta: 'Rigenerare (solo generate)' },
        { valore: 'salta', etichetta: 'Saltare' },
      ],
      { titolo: 'Prepara più mesi' },
    );
    if (!r) return;
    conGenerate.forEach((x) => opz[r === 'rigenera' ? 'rigenera' : 'salta'].add(x.ym));
  } else if (!(await chiediConferma(testo, { titolo: 'Prepara più mesi', ok: 'Prepara' }))) return;
  await _pianoMesiAvvia(opz);
}

async function _pianoMesiAvvia(opz) {
  // scritture a mano in corso (anche ferme su una conferma): finiscono prima
  if (typeof _pianoAttendiScritture === 'function' && !(await _pianoAttendiScritture(60000))) {
    toastErrore('Una modifica del piano è ancora in corso: riprova fra poco.');
    return;
  }
  const prima = { mese: _pianoMeseSel, rep: _pianoRepartoSel };
  if (typeof _pianoUndoChiudiAperto === 'function') _pianoUndoChiudiAperto();
  const t0 = Date.now();
  _pianoMesiStato = { inCorso: true, ferma: false, fase: 'Preparo i dati…', frazione: 0, i: 0, n: opz.mesi.length };
  _pianoMesiPannello();
  logAzione(
    'Piano: prepara più mesi',
    opz.rep + ' · ' + opz.mesi[0] + ' → ' + opz.mesi[opz.mesi.length - 1] + ' · Migliora ' + opz.minuti + ' min',
  );
  let esito = { righe: [], fermato: true };
  try {
    await _pianoCaricaCfg();
    esito = await _pianoMesiEsegui(opz, {
      mese: (i, n, ym) => {
        Object.assign(_pianoMesiStato, { i: i, n: n, ym: ym, frazione: 0 });
        _pianoMesiPannello();
      },
      fase: (testo, fr) => {
        _pianoMesiStato.fase = testo;
        _pianoMesiStato.frazione = fr || 0;
        const a = window._pianoAutoInCorso;
        if (a) a.fase = testo;
        _pianoMesiPannello();
      },
    });
  } catch (e) {
    console.error('[piano-mesi]', e);
    toastErrore('Prepara più mesi interrotto: ' + ((e && e.message) || e));
  } finally {
    if (typeof _pianoUndoChiudiAperto === 'function') _pianoUndoChiudiAperto();
    window._pianoAutoInCorso = null;
    _pianoMeseSel = prima.mese;
    _pianoRepartoSel = prima.rep;
    _pianoMesiAzzeraCache();
    _pianoMesiStato = null;
    _pianoMesiPannello();
  }
  const fatti = esito.righe.filter((r) => r.stato === 'fatto');
  _pianoMesiUltimo = {
    rep: opz.rep,
    minuti: opz.minuti,
    righe: esito.righe,
    fermato: esito.fermato && esito.righe.length < opz.mesi.length,
    nonFatti: opz.mesi.slice(esito.righe.length),
    secondi: Math.round((Date.now() - t0) / 1000),
    passi: fatti.map((r) => r.passo).filter(Boolean),
    // passi dell Annulla generale nati dalla preparazione: uno per fabbisogno copiato
    generali: esito.righe.filter((r) => r.fabb && r.fabb.copiato).length,
    fine: new Date().toISOString(),
  };
  logAzione(
    'Piano: prepara più mesi finito',
    opz.rep +
      ' · ' +
      fatti.length +
      ' mesi fatti su ' +
      opz.mesi.length +
      ' · ' +
      _pianoMesiUltimo.secondi +
      's' +
      (_pianoMesiUltimo.fermato ? ' · fermato' : ''),
  );
  if (_pianoMesiSuPiano()) await renderPiano();
  _pianoMesiRiepilogo();
}

function _pianoMesiSuPiano() {
  try {
    return (localStorage.getItem('pagina_corrente') || '') === 'piano';
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- avanzamento
// riquadro in basso a destra, su ogni pagina: il programma resta usabile (la pagina Piano
// mostra un avviso finche la preparazione cambia mese e settore in memoria)
function _pianoMesiPannello() {
  let el = document.getElementById('pm-pannello');
  const s = _pianoMesiStato;
  if (!s) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'pm-pannello';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:900;width:min(340px,calc(100vw - 32px));background:var(--paper,#fff);color:var(--ink,#222);border:1px solid var(--line,#ccc);border-left:4px solid var(--accent2,#1a4a7a);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:10px 12px;font-size:var(--fs-sm,.8125rem)';
    el.innerHTML =
      '<div style="font-weight:700;margin-bottom:4px">Prepara più mesi</div><div id="pm-testo"></div>' +
      '<div style="height:8px;background:var(--line,#ddd);border-radius:4px;overflow:hidden;margin:8px 0"><div id="pm-barra" style="height:100%;width:0;background:var(--accent2,#1a4a7a);transition:width .3s"></div></div>' +
      '<button type="button" id="pm-ferma" class="btn-act" onclick="pianoMesiFerma()">Ferma</button>';
    document.body.appendChild(el);
  }
  const tot = Math.max(1, s.n || 1);
  const testo =
    'Mese ' +
    ((s.i || 0) + 1) +
    ' di ' +
    tot +
    (s.ym ? ' (' + _pianoMesiLabel(s.ym) + ')' : '') +
    ' · ' +
    (s.fase || '') +
    (s.ferma ? '\nMi fermo alla fine di questo mese: i mesi fatti restano.' : '');
  const t = document.getElementById('pm-testo');
  if (t) {
    t.textContent = testo;
    t.style.whiteSpace = 'pre-line';
  }
  const b = document.getElementById('pm-barra');
  if (b) b.style.width = Math.round((((s.i || 0) + Math.min(1, s.frazione || 0)) / tot) * 100) + '%';
  const f = document.getElementById('pm-ferma');
  if (f && s.ferma) {
    f.disabled = true;
    f.textContent = 'Mi fermo…';
  }
  // l avviso della pagina Piano (al posto della griglia)
  const av = document.getElementById('pm-avviso');
  if (av) av.textContent = testo;
}
function pianoMesiFerma() {
  if (!_pianoMesiStato) return;
  _pianoMesiStato.ferma = true;
  _pianoMesiPannello();
}
// avviso al posto della griglia (renderPiano, tramite _pianoAutoBanner di piano-auto.js)
function _pianoMesiBanner(el) {
  el.style.opacity = '';
  el.innerHTML =
    '<div class="main-card" style="margin-top:12px"><div class="card-header">Prepara più mesi in corso</div>' +
    '<div style="padding:14px;line-height:1.6">Il programma sta preparando il piano di più mesi su questo PC. Il resto del programma si usa normalmente; il Piano torna appena finito (o dopo Ferma, alla fine del mese in corso).' +
    '<div id="pm-avviso" style="margin-top:8px;color:var(--muted);white-space:pre-line"></div></div></div>';
  _pianoMesiPannello();
}

// ---------------------------------------------------------------- riepilogo
function _pianoMesiRiepilogo() {
  const R = _pianoMesiUltimo;
  if (!R) return;
  const vecchio = document.getElementById('pm-riepilogo');
  if (vecchio) vecchio.remove();
  const tempo = (s) => (s >= 60 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : s + ' s');
  const th = 'style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--line,#ccc);white-space:nowrap"';
  const td = 'style="padding:4px 6px;border-bottom:1px solid var(--line,#eee);vertical-align:top"';
  let h =
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem);width:100%"><thead><tr>' +
    ['Mese', 'Fabbisogno', 'Scoperti', 'Legge', 'Altre regole', 'Ore fuori', 'Buchi', 'Tempo', '']
      .map((x) => '<th ' + th + '>' + x + '</th>')
      .join('') +
    '</tr></thead><tbody>';
  R.righe.forEach((r) => {
    const n = r.numeri || {};
    const fabb = !r.fabb ? '-' : r.fabb.copiato ? 'copiato da ' + _pianoMesiLabel(r.fabb.da) : 'esistente';
    const cella = (v) => '<td ' + td + '>' + (v == null ? '-' : escP(String(v))) + '</td>';
    const mig = r.migliora
      ? r.migliora.applicata
        ? 'Migliora applicata (' + r.migliora.cambi + ' celle)'
        : 'Migliora: nessun miglioramento sicuro, bozza lasciata com era'
      : '';
    const sotto = [r.stato !== 'fatto' ? (r.stato === 'errore' ? 'Errore: ' : 'Saltato: ') + (r.motivo || '') : '']
      .concat(r.rigenerato ? ['tolte ' + r.rigenerato + ' celle generate prima'] : [])
      .concat(mig ? [mig] : [])
      .concat(r.note || [])
      .filter(Boolean);
    h +=
      '<tr><td ' +
      td +
      '><b>' +
      escP(_pianoMesiLabel(r.ym)) +
      '</b></td>' +
      cella(fabb) +
      cella(n.scoperti) +
      cella(n.legge) +
      cella(n.altre) +
      cella(n.oreFuori) +
      cella(n.buchi) +
      cella(tempo(r.secondi || 0)) +
      '<td ' +
      td +
      '><button type="button" class="btn-act" onclick="pianoMesiApri(\'' +
      escP(r.ym) +
      '\')">Apri</button></td></tr>' +
      (sotto.length
        ? '<tr><td></td><td colspan="8" style="padding:0 6px 6px;color:var(--muted);font-size:.95em">' +
          sotto.map((x) => escP(x)).join('<br>') +
          '</td></tr>'
        : '');
  });
  h += '</tbody></table></div>';
  const fatti = R.righe.filter((r) => r.stato === 'fatto').length;
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.id = 'pm-riepilogo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" aria-labelledby="pm-tit" style="width:min(820px,100%)">' +
    '<h3 id="pm-tit">Prepara più mesi · ' +
    escP(repartoLabel(R.rep)) +
    '</h3><div class="finestra-testo">' +
    escP(
      fatti +
        (fatti === 1 ? ' mese preparato' : ' mesi preparati') +
        ' in ' +
        tempo(R.secondi) +
        (R.fermato && R.nonFatti.length ? '. Fermato: non fatti ' + R.nonFatti.map(_pianoMesiLabel).join(', ') : '') +
        '. Numeri contati come Controlla le regole (legge = riposi, giorni di fila, ore della settimana, domeniche).',
    ) +
    '</div>' +
    h +
    '<div class="finestra-testo" style="margin-top:8px;color:var(--muted)">Annulla (in basso o Ctrl+Z) toglie un mese alla volta, dal più recente; il fabbisogno copiato è un passo a parte. Annulla tutti i mesi li toglie tutti, fabbisogno copiato compreso.</div>' +
    '<div class="finestra-pulsanti">' +
    (R.passi.length
      ? '<button type="button" class="finestra-no" onclick="pianoMesiAnnullaTutti()">Annulla tutti i mesi</button>'
      : '') +
    '<button type="button" class="finestra-ok" onclick="document.getElementById(\'pm-riepilogo\').remove()">Chiudi</button></div></div>';
  document.body.appendChild(velo);
  const ok = velo.querySelector('.finestra-ok');
  if (ok) ok.focus();
}
function pianoMesiApri(ym) {
  const v = document.getElementById('pm-riepilogo');
  if (v) v.remove();
  _pianoMeseSel = ym;
  if (_pianoMesiUltimo) _pianoVaiAlSettore(_pianoMesiUltimo.rep);
  if (typeof switchPage === 'function' && !_pianoMesiSuPiano()) switchPage('piano');
  else renderPiano();
}
// ANNULLA TUTTI I MESI: i passi della preparazione vanno nella coda di Annulla (annulla.js),
// che li fa uno alla volta dal piu recente, con una conferma sola. Solo se sono ancora gli
// ultimi: dopo altre modifiche si annulla un passo alla volta, guardando cosa si toglie.
function pianoMesiAnnullaTutti() {
  const R = _pianoMesiUltimo;
  if (!R || !R.passi.length || !window._annullaCoda) return;
  const u = window._pianoUndo || [];
  const nostri = u.slice(-R.passi.length);
  const pilaOk = R.passi.every((p, i) => nostri[i] === p);
  const g = window.Annulla && window.Annulla.stato ? window.Annulla.stato() : { annulla: 0 };
  const genOk = !g.quandoUltima || String(g.quandoUltima) <= R.fine;
  if (!pilaOk || !genOk || window._annullaCoda.occupata()) {
    mostraAvviso(
      'Dopo la preparazione ci sono state altre modifiche (o un Annulla è in corso): annulla un passo alla volta con Annulla, così vedi cosa togli.',
      { titolo: 'Annulla tutti i mesi' },
    );
    return;
  }
  const v = document.getElementById('pm-riepilogo');
  if (v) v.remove();
  const passi = R.passi.length + R.generali;
  for (let i = 0; i < passi; i++) window._annullaCoda.chiedi('annulla');
  _pianoMesiUltimo = null;
}
