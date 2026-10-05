/**
 * CONFINE FRA DUE MESI (v364)
 *
 * Un cambio negli ultimi giorni di un mese puo rompere una regola di legge nei
 * primi giorni del mese dopo, se quel mese e gia pianificato (riposo minimo fra
 * due turni, giorni di fila, ore della settimana a cavallo, riposo attorno alla
 * domenica). Il controllo della cella avvisa gia al momento del cambio; qui la
 * segnalazione RESTA visibile nel calendario finche il problema c e:
 *   - nel mese della modifica: "il mese dopo e da ricontrollare";
 *   - nel mese dopo: "da ricontrollare per i turni di fine mese prima".
 * Si contano solo le violazioni che dipendono dalla fine del mese prima (calcolo
 * con e senza quei giorni), nei primi 7 giorni, e solo se quei giorni non sono
 * gia passati.
 *
 * "Proponi correzione" (permesso Genera bozza): la ricerca lavora solo sui primi
 * 10 giorni del mese dopo e solo sulle celle scritte dal programma, con pochi
 * cambi; mostra prima/dopo e le celle toccate, e scrive solo dopo la conferma.
 * Le celle scritte a mano non si spostano mai.
 */
let _pianoConfineTimer = null;
let _pianoConfineGiro = 0;

function _pianoConfineMeseDopo(ym) {
  const p = ym.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]), 15);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _pianoConfineMesePrima(ym) {
  const p = ym.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 2, 15);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// violazioni di legge nei primi 7 giorni di ymB che dipendono dagli ultimi 14 di ymA
// (mese prima). null = mese dopo non pianificato o gia passato.
async function _pianoConfineCalcola(ymA, rep) {
  const ymB = _pianoConfineMeseDopo(ymA);
  if (oggiLocale() > ymB + '-07') return null;
  const nA = _pianoUltimoGiorno(ymA);
  const daA = ymA + '-' + String(nA - 13).padStart(2, '0');
  const inizioB = ymB + '-01';
  const aB = ymB + '-14';
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c, rep) && !_pianoCoperturaCfg(c))
    .map((c) => c.nome);
  if (!nomi.length) return null;
  const righe =
    (await secGet(
      'piano?collaboratore=in.(' +
        nomi.map((n) => encodeURIComponent(n)).join(',') +
        ')&data=gte.' +
        daA +
        '&data=lte.' +
        aB +
        '&limit=5000',
    )) || [];
  const diB = (r) => String(r.data).substring(0, 10) >= inizioB;
  const pianificato = righe.some((r) => diB(r) && (r.reparto_dip || 'slots') === rep && _pianoIsLavoro(r.codice));
  if (!pianificato) return null;
  const ctx = _pianoCtxViolazioni(ymB);
  const chiave = (v) => v.giorno + '|' + String(v.msg).replace(/[\d.,]+/g, '#');
  const lista = [];
  nomi.forEach((nome) => {
    const sue = righe.filter((r) => r.collaboratore === nome);
    const meseB = sue.filter(diB);
    if (!meseB.some((r) => _pianoIsLavoro(r.codice))) return;
    const coda = sue.filter((r) => !diB(r));
    if (!coda.some((r) => _pianoIsLavoro(r.codice))) return;
    let con;
    let senza;
    try {
      con = _pianoViolazioniPersona(nome, meseB, meseB.concat(coda), ctx);
      senza = new Set(_pianoViolazioniPersona(nome, meseB, meseB, ctx).map(chiave));
    } catch (e) {
      return;
    }
    con
      // solo giorni da oggi in poi: un giorno passato e un documento, non si corregge
      // (es. il 5.10 non si segnala piu l 1.10)
      .filter(
        (v) =>
          v.giorno &&
          v.giorno <= 7 &&
          ymB + '-' + String(v.giorno).padStart(2, '0') >= oggiLocale() &&
          _ricercaRegolaDiLegge(v.msg) &&
          !senza.has(chiave(v)),
      )
      .forEach((v) =>
        lista.push({ nome: nome, data: ymB + '-' + String(v.giorno).padStart(2, '0'), giorno: v.giorno, msg: v.msg }),
      );
  });
  return { ymA: ymA, ymB: ymB, lista: lista };
}

function _pianoConfineMeseLabel(ym) {
  const p = String(ym).split('-');
  return ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(p[1]) - 1]) || ym) + ' ' + p[0];
}

// dopo ogni ridisegno del calendario (con una piccola attesa: piu cambi di fila = un controllo)
function _pianoConfineMostra() {
  clearTimeout(_pianoConfineTimer);
  _pianoConfineTimer = setTimeout(() => _pianoConfineAggiorna(), 600);
}
async function _pianoConfineAggiorna() {
  const el = document.getElementById('piano-confine');
  if (!el || window._pianoAutoInCorso) return;
  const giro = ++_pianoConfineGiro;
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  let verso = null;
  let dal = null;
  try {
    [verso, dal] = await Promise.all([
      _pianoConfineCalcola(ym, rep),
      _pianoConfineCalcola(_pianoConfineMesePrima(ym), rep),
    ]);
  } catch (e) {
    return;
  }
  // nel frattempo si e cambiato mese o settore: il risultato non vale piu
  if (giro !== _pianoConfineGiro || ym !== _pianoMeseSel || rep !== _pianoReparto()) return;
  const el2 = document.getElementById('piano-confine');
  if (!el2) return;
  window._pianoConfineUltimo = { verso: verso, dal: dal };
  let h = '';
  const puo = typeof puoAzioniAutoPiano === 'function' && puoAzioniAutoPiano('genera');
  const blocco = (r, titolo, apri) => {
    if (!r || !r.lista.length) return '';
    let b =
      '<div style="border-left:3px solid #b8860b;background:var(--paper2,rgba(184,134,11,.06));padding:8px 12px;margin:6px 0;font-size:var(--fs-sm,.8125rem)">' +
      '<b>' +
      escP(titolo) +
      '</b><div style="margin:4px 0;line-height:1.6">';
    r.lista.slice(0, 8).forEach((v) => {
      b +=
        '<div' +
        (typeof _attrCella === 'function' ? _attrCella(v.nome, v.data) : '') +
        '>• <strong>' +
        escP(v.nome) +
        '</strong> ' +
        escP(_pianoGgMm(v.data)) +
        ': ' +
        escP(v.msg) +
        '</div>';
    });
    if (r.lista.length > 8) b += '<div>e altre ' + (r.lista.length - 8) + '</div>';
    b += '</div><div style="display:flex;gap:8px;flex-wrap:wrap">';
    if (apri)
      b +=
        '<button class="btn-act" onclick="pianoConfineApri(\'' +
        escP(r.ymB) +
        '\')">Apri ' +
        escP(_pianoConfineMeseLabel(r.ymB)) +
        '</button>';
    if (puo)
      b +=
        '<button class="btn-act" onclick="pianoConfineCorreggi(\'' +
        escP(r.ymB) +
        '\')" title="Cerca pochi cambi fra le celle generate dei primi giorni di ' +
        escP(_pianoConfineMeseLabel(r.ymB)) +
        ': mostra la proposta e scrive solo se confermi">Proponi correzione</button>';
    b += '</div></div>';
    return b;
  };
  h += blocco(
    verso,
    _pianoConfineMeseLabel(verso && verso.ymB) +
      ' e gia pianificato ed e da ricontrollare: i turni di fine ' +
      _pianoConfineMeseLabel(ym) +
      ' rompono ' +
      ((verso && verso.lista.length) || 0) +
      ' regole di legge nei suoi primi giorni',
    true,
  );
  h += blocco(
    dal,
    'Da ricontrollare: i turni di fine ' +
      _pianoConfineMeseLabel(dal && dal.ymA) +
      ' rompono ' +
      ((dal && dal.lista.length) || 0) +
      ' regole di legge nei primi giorni di questo mese',
    false,
  );
  el2.innerHTML = h;
}

function pianoConfineApri(ymB) {
  _pianoMeseSel = ymB;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// PROPOSTA DI CORREZIONE: ricerca mirata sui primi 10 giorni del mese ymB, solo
// celle generate, con il peso dei cambi (pochi spostamenti). Applica solo se
// nessuna regola peggiora e i posti scoperti non aumentano, e solo dopo la conferma.
async function pianoConfineCorreggi(ymB) {
  if (!_pianoAzioneAutoConsentita('genera')) return;
  if (!puoGestirePiano()) return;
  if (_pianoMeseSel !== ymB) {
    _pianoMeseSel = ymB;
    _pianoViolCelle = {};
    _pianoViolLista = null;
    await renderPiano();
  }
  const prima = await _pianoConfineCalcola(_pianoConfineMesePrima(ymB), _pianoReparto());
  if (!prima || !prima.lista.length) {
    toast('Nessuna regola rotta al confine con il mese prima: niente da correggere');
    return;
  }
  const giorni = new Set();
  for (let g = 1; g <= 10; g++) giorni.add(ymB + '-' + String(g).padStart(2, '0'));
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:460px"><h3>Correzione al confine</h3>' +
    '<div class="finestra-testo" id="conf-testo">Cerco pochi cambi nei primi giorni di ' +
    escP(_pianoConfineMeseLabel(ymB)) +
    '...</div></div>';
  document.body.appendChild(velo);
  let res;
  try {
    res = await pianoRicercaCalcola(30, null, {
      prepara: { giorni: giorni },
      motore: { pesoCambio: 800 },
    });
  } catch (e) {
    velo.remove();
    toastErrore('Ricerca non riuscita: ' + (e.message || e));
    return;
  }
  velo.remove();
  const P = res.prima;
  const D = res.dopo;
  logAzione(
    'Piano: correzione confine proposta',
    ymB + ' ' + _pianoReparto() + ' · legge ' + P.legge + '>' + D.legge + ' · ' + res.cambi.length + ' celle',
  );
  if (!res.migliore || !res.cambi.length || D.legge >= P.legge) {
    // una sola finestra con un pulsante (prima: due "Chiudi" uguali)
    const nomi = [...new Set(prima.lista.map((v) => v.nome + ' ' + _pianoGgMm(v.data)))];
    await mostraAvviso(
      'Il programma non ha trovato cambi sicuri: ogni spostamento delle celle generate nei primi 10 giorni avrebbe peggiorato un altra regola o lasciato un posto scoperto. Non ha cambiato niente.\n\n' +
        'Da sistemare a mano (' +
        nomi.length +
        '):\n' +
        nomi
          .slice(0, 10)
          .map((x) => '• ' + x)
          .join('\n') +
        (nomi.length > 10 ? '\n• e altri ' + (nomi.length - 10) : '') +
        '\n\nIl motivo di ognuno (riposo corto, giorni di fila, 4+1+1) e nel riquadro "da ricontrollare" sopra il calendario: passando sul nome si va alla cella. Spesso sono celle scritte a mano o importate, che il programma non sposta mai.',
      { titolo: 'Correzione al confine', ok: 'Ho capito' },
    );
    return;
  }
  const celle = res.cambi
    .slice(0, 20)
    .map(
      (c) => '\n• ' + c.nome + ' ' + _pianoGgMm(c.data) + ': ' + (c.prima || 'riposo') + ' → ' + (c.dopo || 'riposo'),
    )
    .join('');
  const ok = await chiediModulo(
    'Proposta per ' +
      _pianoConfineMeseLabel(ymB) +
      ' (controllata con "Valida regole"):\n• Regole di legge violate nel mese: ' +
      P.legge +
      ' → ' +
      D.legge +
      '\n• Altre regole: ' +
      (P.regole - P.legge) +
      ' → ' +
      (D.regole - D.legge) +
      '\n• Posti scoperti: ' +
      P.scoperti +
      ' → ' +
      D.scoperti +
      '\n\nCelle cambiate (' +
      res.cambi.length +
      '):' +
      celle +
      (res.cambi.length > 20 ? '\n• ...' : '') +
      '\n\nSolo celle scritte dal programma; quelle scritte a mano restano. Si puo annullare con Annulla del piano.',
    [],
    { titolo: 'Correzione al confine', ok: 'Applica', annulla: 'Lascia com e' },
  );
  if (!ok) return;
  await _ricercaScrivi(res);
  logAzione('Piano: correzione confine applicata', ymB + ' ' + _pianoReparto() + ' · ' + res.cambi.length + ' celle');
}
