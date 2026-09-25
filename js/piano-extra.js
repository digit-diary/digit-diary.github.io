/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-extra.js
 * PIANO · copia/incolla a blocchi, annulla/ripristina, selezione sparsa, trova, migliora ore, formazione, scheda Crediti
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ============================================================
// COPIA / INCOLLA a blocchi · Shift+click su due celle = blocco
// (piano o fabbisogno), tasto destro = Copia / Incolla. L'incolla
// accetta anche celle copiate da Excel (formato tab-separato).
// ============================================================
window._pianoBlocco = null; // {tab, t1, t2, completo}
// BARRA DI CALCOLO (come la barra di stato di Excel): con una selezione
// attiva mostra in basso Conteggio, Somma e Media dei valori selezionati;
// per le celle coi turni la somma usa le ORE del turno
function _pianoStatSelezione() {
  let box = document.getElementById('piano-statbar');
  const sel = [
    ...document.querySelectorAll('#piano-content .blocco-sel, #piano-content .col-selected, #piano-content .tot-sel'),
  ];
  const valori = [];
  let piene = 0;
  sel.forEach((td) => {
    const txt = (td.textContent || '').trim();
    if (!txt) return;
    piene++;
    const num = parseFloat(txt.replace(',', '.'));
    if (!isNaN(num) && /^[-+]?[0-9.,]+$/.test(txt)) {
      valori.push(num);
    } else {
      const t = _pianoTurnoInfo(txt.toUpperCase());
      if (t && parseFloat(t.durata_ore)) valori.push(parseFloat(t.durata_ore));
    }
  });
  if (!sel.length) {
    if (box) box.style.display = 'none';
    return;
  }
  if (!box) {
    box = document.createElement('div');
    box.id = 'piano-statbar';
    document.body.appendChild(box);
  }
  const somma = Math.round(valori.reduce((a, b) => a + b, 0) * 100) / 100;
  const media = valori.length ? Math.round((somma / valori.length) * 100) / 100 : 0;
  box.innerHTML =
    '<b>' +
    sel.length +
    '</b> celle (' +
    piene +
    ' piene)' +
    (valori.length
      ? ' &nbsp;&middot;&nbsp; Somma <b>' + somma + '</b> &nbsp;&middot;&nbsp; Media <b>' + media + '</b>'
      : '') +
    (valori.length > 1
      ? ' &nbsp;&middot;&nbsp; Min <b>' +
        Math.min.apply(null, valori) +
        '</b> &nbsp;&middot;&nbsp; Max <b>' +
        Math.max.apply(null, valori) +
        '</b>'
      : '');
  box.style.display = 'block';
}
// ================= ANNULLA / RIPRISTINA (stile Excel) =================
// Prima di ogni modifica al piano si salva una copia del mese (dalla memoria,
// costo zero): le frecce nella barra riportano il mese a com'era, avanti e
// indietro fino a 15 passi. Vale per il mese e il settore correnti.
function _pianoStatoMese() {
  const rep = _pianoReparto();
  return {
    ym: _pianoMeseSel,
    rep: rep,
    righe: (_pianoRighe || [])
      .filter((r) => (r.reparto_dip || 'slots') === rep)
      .map((r) => ({
        collaboratore: r.collaboratore,
        data: r.data,
        codice: r.codice,
        protetto: r.protetto,
        generato: r.generato,
        ora_inizio: r.ora_inizio,
        ora_fine: r.ora_fine,
        commento: r.commento,
        colore: r.colore,
        reparto_dip: rep,
      })),
  };
}
function _pianoUndoSnap(label) {
  try {
    const st = _pianoStatoMese();
    st.label = label;
    window._pianoUndo = window._pianoUndo || [];
    window._pianoUndo.push(st);
    if (window._pianoUndo.length > 15) window._pianoUndo.shift();
    window._pianoRedo = [];
    // prima modifica di questo mese+settore nella sessione: si conserva lo
    // stato di partenza per "Annulla tutto" (non limitato ai 15 passi)
    window._pianoSessSnap = window._pianoSessSnap || {};
    const k = st.ym + '|' + st.rep;
    if (!window._pianoSessSnap[k])
      window._pianoSessSnap[k] = { ym: st.ym, rep: st.rep, righe: st.righe, label: 'inizio sessione', n: 0 };
    window._pianoSessSnap[k].n++;
    _pianoSalvatoFlash();
  } catch (e) {}
}
// Feedback visivo del salvataggio automatico: "Salvato" per qualche secondo
function _pianoSalvatoFlash() {
  clearTimeout(window._pasT);
  window._pasT = setTimeout(() => {
    const el = document.getElementById('piano-autosave');
    if (!el) return;
    el.textContent = 'Salvato \u2713';
    el.classList.add('pas-on');
    clearTimeout(window._pasT2);
    window._pasT2 = setTimeout(() => {
      const el2 = document.getElementById('piano-autosave');
      if (!el2) return;
      el2.textContent = 'Salvataggio automatico';
      el2.classList.remove('pas-on');
    }, 2600);
  }, 900);
}
async function _pianoRipristinaStato(st) {
  const fine = st.ym + '-' + String(_pianoUltimoGiorno(st.ym)).padStart(2, '0');
  // Prima si verifica che la sessione sia valida: il mese si cancella SOLO se
  // poi lo si puo' riscrivere. Un token scaduto tra i due passi lasciava il
  // mese vuoto con il messaggio "Annullato".
  const prova = await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: [] });
  void prova;
  await secDel('piano', 'data=gte.' + st.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + st.rep);
  let scritte = 0;
  for (let i = 0; i < st.righe.length; i += 2000) {
    const r = await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: st.righe.slice(i, i + 2000) });
    scritte += (r && r.inserite) || 0;
  }
  if (scritte !== st.righe.length)
    throw new Error('ripristinate ' + scritte + ' celle su ' + st.righe.length + ': controlla il mese');
}
// Annulla l'ultima operazione registrata (usato da chi rinuncia a meta' di
// un'operazione che ha gia' scritto qualcosa, per esempio la bozza).
async function _pianoRipristinaUltimoSnapshot(messaggio) {
  const u = window._pianoUndo || [];
  const st = u.pop();
  if (!st) return;
  try {
    await _pianoRipristinaStato(st);
    toast(messaggio || 'Operazione annullata');
  } catch (e) {
    toastErrore('Ripristino non riuscito: ' + (e.message || '') + '. Usa "Annulla" dal piano.');
    u.push(st);
  }
  renderPiano();
}
function _pianoMappaRighe(rows, rep) {
  return rows.map((r) => ({
    collaboratore: r.collaboratore,
    data: r.data,
    codice: r.codice,
    protetto: r.protetto,
    generato: r.generato,
    ora_inizio: r.ora_inizio,
    ora_fine: r.ora_fine,
    commento: r.commento,
    colore: r.colore,
    motivo_blocco: r.motivo_blocco,
    operatore: r.operatore,
    reparto_dip: rep,
  }));
}
async function pianoAnnulla() {
  const u = window._pianoUndo || [];
  if (!u.length) {
    toast('Niente da annullare');
    return;
  }
  if (!puoGestirePiano()) return;
  const st = u.pop();
  // torna al mese/settore dell'operazione se nel frattempo sei altrove
  _pianoMeseSel = st.ym;
  if (st.rep !== currentReparto) _pianoRepartoSel = st.rep;
  else _pianoRepartoSel = _pianoRepartoSel === null ? null : st.rep;
  // lo stato corrente (dal DB) diventa il "Ripristina"
  try {
    const fine = st.ym + '-' + String(_pianoUltimoGiorno(st.ym)).padStart(2, '0');
    const cur =
      (await secGet(
        'piano?data=gte.' + st.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + st.rep + '&limit=8000',
      )) || [];
    window._pianoRedo = window._pianoRedo || [];
    window._pianoRedo.push({ ym: st.ym, rep: st.rep, label: st.label, righe: _pianoMappaRighe(cur, st.rep) });
  } catch (e) {}
  await _pianoRipristinaStato(st);
  logAzione('Piano: annullato', st.label + ' (' + st.ym + ')');
  toast('Annullato: ' + st.label);
  renderPiano();
}
// ANNULLA TUTTO: riporta il mese visualizzato a com'era all'inizio della
// sessione. Il bottone appare SOLO a chi ha fatto modifiche qui (lo stato
// vive nel browser di chi le ha fatte) e sparisce dopo l'uso o al rientro
async function pianoAnnullaTutto() {
  if (!puoGestirePiano()) return;
  const k = _pianoMeseSel + '|' + _pianoReparto();
  const snap = (window._pianoSessSnap || {})[k];
  if (!snap) return;
  if (
    !confirm(
      'Riporto il piano di ' +
        snap.ym +
        ' (' +
        repartoLabel(snap.rep) +
        ") a com'era all'inizio di questa sessione, annullando le tue " +
        snap.n +
        ' operazioni.\n\nATTENZIONE: se un altro operatore ha modificato questo stesso mese nel frattempo, anche le sue modifiche verranno sovrascritte.\n\nConfermare?',
    )
  )
    return;
  // lo stato attuale (dal DB) finisce sulla freccia Ripristina: si puo' tornare avanti
  try {
    const fine = snap.ym + '-' + String(_pianoUltimoGiorno(snap.ym)).padStart(2, '0');
    const cur =
      (await secGet(
        'piano?data=gte.' + snap.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + snap.rep + '&limit=8000',
      )) || [];
    window._pianoRedo = window._pianoRedo || [];
    window._pianoRedo.push({
      ym: snap.ym,
      rep: snap.rep,
      label: 'annulla tutte le modifiche',
      righe: _pianoMappaRighe(cur, snap.rep),
    });
  } catch (e) {}
  await _pianoRipristinaStato(snap);
  window._pianoUndo = (window._pianoUndo || []).filter((s) => !(s.ym === snap.ym && s.rep === snap.rep));
  delete window._pianoSessSnap[k];
  logAzione('Piano: annullate tutte le modifiche della sessione', snap.ym + ' · ' + snap.n + ' operazioni');
  toast('Piano riportato a inizio sessione (' + snap.n + ' operazioni annullate)');
  renderPiano();
}
async function pianoRipristina() {
  const rd = window._pianoRedo || [];
  if (!rd.length) {
    toast('Niente da ripristinare');
    return;
  }
  if (!puoGestirePiano()) return;
  const st = rd.pop();
  _pianoMeseSel = st.ym;
  if (st.rep !== currentReparto) _pianoRepartoSel = st.rep;
  // lo stato corrente torna sull'Annulla (senza svuotare il redo)
  try {
    const prima = _pianoStatoMese();
    prima.label = st.label;
    window._pianoUndo = window._pianoUndo || [];
    window._pianoUndo.push(prima);
  } catch (e) {}
  await _pianoRipristinaStato(st);
  logAzione('Piano: ripristinato', st.label + ' (' + st.ym + ')');
  toast('Ripristinato: ' + st.label);
  renderPiano();
}
// CANC sulla selezione: cancella tutte le celle del blocco (con conferma)
async function pianoCancellaSelezione() {
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano' || !puoGestirePiano()) return;
  const celle = _pianoBloccoCelle();
  const daCanc = [];
  celle.forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !tr.dataset.nome || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) daCanc.push(r);
    }),
  );
  if (!daCanc.length) {
    toast('Nessuna cella piena nella selezione');
    return;
  }
  const prot = daCanc.filter((r) => r.protetto).length;
  if (
    !confirm(
      'Cancellare ' + daCanc.length + ' celle selezionate' + (prot ? ' (di cui ' + prot + ' protette)' : '') + '?',
    )
  )
    return;
  // giorni chiusi: ogni giorno toccato va sbloccato con motivo, come per la singola cella
  for (const d of [...new Set(daCanc.map((x) => x.data))].sort()) if (!_pianoConsentiScrittura(d)) return;
  _pianoUndoSnap('cancellazione di ' + daCanc.length + ' celle');
  try {
    const ids = daCanc.map((r) => r.id);
    // il canale sicuro accetta solo filtri semplici: cancellazione per id, a gruppi
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map((idr) => secDel('piano', 'id=eq.' + idr)));
    }
    _pianoRighe = _pianoRighe.filter((r) => !ids.includes(r.id));
    logAzione('Piano: celle cancellate da selezione', daCanc.length + ' celle (' + _pianoMeseSel + ')');
    toast('Cancellate ' + daCanc.length + ' celle');
    // tra le celle cancellate c'erano malattie: proposta di aggiornare il
    // Diario, una domanda per collaboratore con l'elenco dei giorni
    const perNomeM = {};
    daCanc.forEach((r) => {
      if (r.codice === 'M' || r.codice === 'M1')
        (perNomeM[r.collaboratore] = perNomeM[r.collaboratore] || []).push(r.data);
    });
    for (const nomeM of Object.keys(perNomeM)) await _pianoMalattiaViaDiario(nomeM, perNomeM[nomeM]);
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}
function pianoBloccoClick(tab, el) {
  const b = window._pianoBlocco;
  if (b && b.tab === tab && b.t1.closest('table') === el.closest('table')) {
    // Shift+click: estende dalla cella àncora (come Excel)
    const t1 = b.t1;
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: tab, t1: t1, t2: el, completo: true };
    _pianoBloccoEvidenzia();
  } else {
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: tab, t1: el, t2: el, completo: true };
    _pianoBloccoEvidenzia();
  }
}
// === COLORI CELLE (come il secchiello di Excel): palette in alto, si
// applica alle celle SELEZIONATE; solo visivo per quella cella del piano,
// il colore predefinito del turno non cambia mai ===
// Stile di una cella in un'unica stringa ("#RRGGBB|bi": colore + flag
// b=grassetto i=corsivo), salvata dov'era il solo colore: nessun campo nuovo
function _stileCella(s) {
  const out = { c: '', b: false, i: false, t: '' };
  if (!s) return out;
  const parti = String(s).split('|');
  if (parti[0] && parti[0][0] === '#') out.c = parti[0];
  const f = parti[1] || '';
  out.b = f.indexOf('b') >= 0;
  out.i = f.indexOf('i') >= 0;
  if (parti[2] && parti[2][0] === '#') out.t = parti[2];
  return out;
}
function _stileStr(st) {
  const f = (st.b ? 'b' : '') + (st.i ? 'i' : '');
  if (!st.c && !f && !st.t) return null;
  return (st.c || '') + '|' + f + (st.t ? '|' + st.t : '');
}
// Ultimo colore usato (secchiello stile Excel, condiviso piano+briefing).
// Ricorda anche "nessuno" ('' = barretta bianca barrata, il bottone toglie il colore)
function _colUltimo() {
  const v = localStorage.getItem('piano_col_ult');
  return v === null ? PIANO_COLORI_CELLA[0] : v;
}
function _colChipPaint(el, c) {
  el.style.background = c || '#fff';
  el.style.backgroundImage = c ? 'none' : 'linear-gradient(to top right, #fff 44%, #c0392b 47%, #c0392b 53%, #fff 56%)';
}
function _colUltimoSet(c) {
  localStorage.setItem('piano_col_ult', c || '');
  document.querySelectorAll('.col-ultimo-chip').forEach((el) => _colChipPaint(el, c));
}
function _colChipHtml() {
  const c = _colUltimo();
  return (
    '<span class="col-ultimo-chip" style="display:block;width:100%;height:4px;border:1px solid #999;border-radius:2px;background:' +
    (c || '#fff') +
    (c ? '' : ';background-image:linear-gradient(to top right, #fff 44%, #c0392b 47%, #c0392b 53%, #fff 56%)') +
    '"></span>'
  );
}
const PIANO_COLORI_CELLA = ['#FF6B6B', '#FFB86B', '#FFF06B', '#95E06C', '#6BCBFF', '#B39DDB', '#F48FB1', '#D7CCC8'];
function _pianoColoriBarHtml() {
  // secchiello stile Excel: il bottone applica subito l'ultimo colore usato
  // (chip colorata), la freccia apre la palette con formato G/C
  return (
    '<span style="position:relative;display:inline-flex;align-items:center">' +
    '<button class="btn-export pbar-btn pbar-color" title="Applica alle celle selezionate il colore mostrato nella barretta (per cambiarlo usa la freccia accanto)" onclick="event.stopPropagation();pianoApplicaColore(_colUltimo() || null)"><span style="display:flex;flex-direction:column;gap:3px;min-width:44px">Colora' +
    _colChipHtml() +
    '</span></button>' +
    '<button class="btn-export pbar-btn pbar-color" style="padding-left:6px;padding-right:6px" title="Scegli un altro colore o il formato (grassetto, corsivo)" onclick="event.stopPropagation();pianoColoriToggle()">&#9662;</button>' +
    '<div id="piano-colori-pop" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<span data-c="' +
        c +
        '" onclick="pianoApplicaColore(\'' +
        c +
        '\')" style="display:inline-block;width:22px;height:22px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button data-c="" class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="pianoApplicaColore(null)">Colore del turno</button>' +
    '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
    '<button class="btn-export" style="font-size:.82rem;font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulle celle selezionate (vista e stampa)" onclick="pianoApplicaFormato(\'b\')">G</button> ' +
    '<button class="btn-export" style="font-size:.82rem;font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulle celle selezionate (vista e stampa)" onclick="pianoApplicaFormato(\'i\')">C</button>' +
    '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
    '<span style="font-size:.82rem;color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
    PIANO_COLORI_TESTO.map(
      (c) =>
        '<span title="Colore del testo" onclick="pianoApplicaColoreTesto(\'' +
        c +
        '\')" style="display:inline-block;width:18px;height:18px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:4px;vertical-align:middle" onclick="pianoApplicaColoreTesto(null)">Auto</button>' +
    '</div>' +
    '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Memorizza colore e formato della prima cella selezionata" onclick="pianoCopiaFormato()">Copia formato</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Applica il formato memorizzato alle celle selezionate" onclick="pianoIncollaFormato()">Incolla formato</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle;border-color:#c0392b;color:#c0392b" title="Toglie colori, grassetto e corsivo dalle celle selezionate (i turni non cambiano)" onclick="pianoCancellaFormato()">Cancella formato</button>' +
    '</div>' +
    '</div></span>'
  );
}
const PIANO_COLORI_TESTO = ['#000000', '#c0392b', '#1a4a7a', '#2c6e49', '#e67e22', '#8e44ad', '#ffffff'];
// helper comune: righe del piano dentro la selezione corrente della griglia
function _pianoRigheSelezione() {
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') return null;
  const righe = [];
  _pianoBloccoCelle().forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) righe.push(r);
    }),
  );
  return righe;
}
async function _pianoScriviStili(righe, trasforma, label, msg) {
  _pianoUndoSnap(label);
  let fatte = 0;
  try {
    for (const r of righe) {
      const nuovo = trasforma(_stileCella(r.colore));
      if ((r.colore || null) === nuovo) continue;
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
      fatte++;
    }
    logAzione('Piano: ' + label, fatte + ' celle');
    toast(msg.replace('{n}', fatte));
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio formato');
  }
}
async function pianoApplicaColoreTesto(colore) {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima le celle nella griglia');
    return;
  }
  await _pianoScriviStili(
    righe,
    (st) => {
      st.t = colore || '';
      return _stileStr(st);
    },
    colore ? 'colore testo' : 'colore testo tolto',
    colore ? 'Testo colorato su {n} celle' : 'Colore del testo tolto da {n} celle',
  );
}
function pianoCopiaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima la cella da cui copiare il formato');
    return;
  }
  window._pianoFormatoCopiato = righe[0].colore || null;
  const st = _stileCella(window._pianoFormatoCopiato);
  toast(
    'Formato copiato' +
      (st.c || st.b || st.i || st.t
        ? ' (' +
          [st.c ? 'sfondo' : '', st.t ? 'testo' : '', st.b ? 'grassetto' : '', st.i ? 'corsivo' : '']
            .filter(Boolean)
            .join(', ') +
          ')'
        : ' (nessuno: incollandolo si pulisce)'),
  );
}
async function pianoIncollaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  if (window._pianoFormatoCopiato === undefined) {
    toast('Prima usa "Copia formato" su una cella');
    return;
  }
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona le celle a cui applicare il formato');
    return;
  }
  const f = window._pianoFormatoCopiato;
  await _pianoScriviStili(righe, () => f, 'incolla formato', 'Formato applicato a {n} celle');
}
async function pianoCancellaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima le celle nella griglia');
    return;
  }
  await _pianoScriviStili(righe, () => null, 'cancella formato', 'Formato tolto da {n} celle');
}
// i pannelli a comparsa (palette colori del piano e del briefing) si
// chiudono cliccando in un punto qualsiasi fuori dal pannello
if (!window._popupCloseBound) {
  window._popupCloseBound = true;
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('piano-colori-pop');
    if (
      pop &&
      pop.style.display !== 'none' &&
      !e.target.closest('#piano-colori-pop') &&
      !e.target.closest('.pbar-color')
    )
      pop.style.display = 'none';
    const bb = document.getElementById('brief-colori-bar');
    if (
      bb &&
      bb.style.display !== 'none' &&
      !e.target.closest('#brief-colori-bar') &&
      !e.target.closest('[onclick*="briefColoriToggle"], [onclick*="briefColoreApplica(_colUltimo"]')
    )
      bb.style.display = 'none';
  });
}
function pianoColoriToggle() {
  const p = document.getElementById('piano-colori-pop');
  if (!p) return;
  if (p.style.display !== 'none') {
    p.style.display = 'none';
    return;
  }
  // all'apertura si evidenzia il colore che le celle selezionate hanno adesso
  const cc = [];
  const b = window._pianoBlocco;
  if (b && b.completo && b.tab === 'piano') {
    _pianoBloccoCelle().forEach((rigaC) =>
      rigaC.forEach((td) => {
        const tr = td.closest('tr');
        const g = parseInt(td.dataset.g);
        if (!tr || !g) return;
        const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
        const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
        cc.push(r ? _stileCella(r.colore).c : '');
      }),
    );
  }
  const cur = cc.length && cc.every((x) => x === cc[0]) ? cc[0] : '__misto__';
  p.querySelectorAll('[data-c]').forEach((s) => {
    const on = s.dataset.c === cur;
    s.style.outline = on ? '2.5px solid #1a4a7a' : 'none';
    s.style.outlineOffset = on ? '1px' : '0';
  });
  p.style.display = 'block';
}
async function pianoApplicaColore(colore) {
  const p = document.getElementById('piano-colori-pop');
  if (p) p.style.display = 'none';
  if (!puoGestirePiano()) return;
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') {
    toast('Seleziona prima le celle nella griglia (click o trascinamento)');
    return;
  }
  _pianoUndoSnap(colore ? 'colore celle' : 'rimozione colore');
  const celle = _pianoBloccoCelle();
  let fatte = 0;
  let senza = 0;
  try {
    for (const rigaC of celle) {
      for (const td of rigaC) {
        const tr = td.closest('tr');
        const nome = tr ? tr.dataset.nome : null;
        const g = parseInt(td.dataset.g);
        if (!nome || !g) continue;
        const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
        const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
        if (!r) {
          senza++;
          continue;
        }
        const stC = _stileCella(r.colore);
        stC.c = colore || '';
        const nuovo = _stileStr(stC);
        if ((r.colore || null) === nuovo) continue;
        await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
        r.colore = nuovo;
        fatte++;
      }
    }
    _colUltimoSet(colore || '');
    logAzione('Piano: colore celle', (colore || 'rimosso') + ' su ' + fatte + ' celle');
    toast(
      colore
        ? 'Colorate ' + fatte + ' celle' + (senza ? ' (' + senza + ' vuote saltate)' : '')
        : 'Colore rimosso da ' + fatte + ' celle',
    );
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio colore');
  }
}
// GRASSETTO / CORSIVO sulle celle selezionate (come Excel: se tutte le
// celle piene hanno gia' il formato lo toglie, altrimenti lo applica)
async function pianoApplicaFormato(f) {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') {
    toast('Seleziona prima le celle nella griglia (click o trascinamento)');
    return;
  }
  const righeSel = [];
  _pianoBloccoCelle().forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) righeSel.push(r);
    }),
  );
  if (!righeSel.length) {
    toast('Nessuna cella piena nella selezione');
    return;
  }
  const on = !righeSel.every((r) => _stileCella(r.colore)[f]);
  _pianoUndoSnap(f === 'b' ? 'grassetto celle' : 'corsivo celle');
  try {
    for (const r of righeSel) {
      const stC = _stileCella(r.colore);
      if (stC[f] === on) continue;
      stC[f] = on;
      const nuovo = _stileStr(stC);
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
    }
    logAzione(
      'Piano: formato celle',
      (f === 'b' ? 'grassetto ' : 'corsivo ') + (on ? 'applicato' : 'tolto') + ' su ' + righeSel.length + ' celle',
    );
    toast((f === 'b' ? 'Grassetto' : 'Corsivo') + (on ? ' su ' : ' tolto da ') + righeSel.length + ' celle');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio formato');
  }
}
// Click SINGOLO sulla cella della griglia: la MARCA soltanto (come Excel);
// la modifica manuale parte col DOPPIO click
function pianoCellaClick(nome, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('piano', el);
    return;
  }
  _pianoBloccoPulisci();
  window._pianoBlocco = { tab: 'piano', t1: el, t2: el, completo: true };
  _pianoBloccoEvidenzia();
}
function fabbCellaClick(codice, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('fabb', el);
    return;
  }
  _pianoBloccoPulisci();
  window._pianoBlocco = { tab: 'fabb', t1: el, t2: el, completo: true };
  _pianoBloccoEvidenzia();
}
function _pianoBloccoCelle() {
  const b = window._pianoBlocco;
  if (!b || !b.completo) return [];
  const tbody = b.t1.closest('tbody');
  const righe = [...tbody.rows];
  let r1 = righe.indexOf(b.t1.closest('tr'));
  let r2 = righe.indexOf(b.t2.closest('tr'));
  if (r1 > r2) [r1, r2] = [r2, r1];
  let g1 = parseInt(b.t1.dataset.g);
  let g2 = parseInt(b.t2.dataset.g);
  if (g1 > g2) [g1, g2] = [g2, g1];
  const out = [];
  for (let ri = r1; ri <= r2; ri++) {
    const riga = [];
    for (let g = g1; g <= g2; g++) {
      const cel = righe[ri].querySelector('td[data-g="' + g + '"]');
      if (cel) riga.push(cel);
    }
    if (riga.length) out.push(riga);
  }
  return out;
}
// Toglie le marcature di riga e colonna: quando parte una selezione a
// trascinamento, quella precedente deve sparire (e viceversa).
function _pianoPulisciSelezioneRighe() {
  const s = typeof _pianoSparse === 'function' ? _pianoSparse() : null;
  if (s) {
    s.nomi.length = 0;
    s.giorni.length = 0;
  }
  document
    .querySelectorAll('#piano-content .row-selected, #piano-content .col-selected, #piano-content .col-selected-header')
    .forEach((el) => el.classList.remove('row-selected', 'col-selected', 'col-selected-header'));
  const bar = document.getElementById('piano-multibar');
  if (bar) bar.remove();
}
function _pianoBloccoEvidenzia() {
  _pianoPulisciSelezioneRighe();
  const celle = _pianoBloccoCelle();
  celle.forEach((riga, ri) =>
    riga.forEach((c, ci) => {
      c.classList.add('blocco-sel');
      // quadrante in grassetto: bordi marcati sul perimetro della selezione
      if (ri === 0) c.classList.add('bs-t');
      if (ri === celle.length - 1) c.classList.add('bs-b');
      if (ci === 0) c.classList.add('bs-l');
      if (ci === riga.length - 1) c.classList.add('bs-r');
    }),
  );
  // intestazioni della selezione in evidenza (giorni sopra, nome a sinistra)
  const b = window._pianoBlocco;
  if (!b || !celle.length) return;
  const table = b.t1.closest('table');
  let g1 = parseInt(b.t1.dataset.g);
  let g2 = parseInt(b.t2.dataset.g);
  if (g1 > g2) [g1, g2] = [g2, g1];
  for (let g = g1; g <= g2; g++) {
    const th = table.querySelector('thead th[data-g="' + g + '"]');
    if (th) th.classList.add('blocco-sel-head');
  }
  celle.forEach((riga) => {
    const primo = riga[0] && riga[0].closest('tr') && riga[0].closest('tr').firstElementChild;
    if (primo && !primo.dataset.g) primo.classList.add('blocco-sel-head');
  });
  setTimeout(_pianoStatSelezione, 30);
}
function _pianoBloccoPulisci() {
  document.querySelectorAll('#piano-content .tot-sel').forEach((el) => el.classList.remove('tot-sel'));
  document
    .querySelectorAll('.blocco-sel, .bs-t, .bs-b, .bs-l, .bs-r, .blocco-sel-head')
    .forEach((c) => c.classList.remove('blocco-sel', 'bs-t', 'bs-b', 'bs-l', 'bs-r', 'blocco-sel-head'));
  window._pianoBlocco = null;
  setTimeout(_pianoStatSelezione, 30);
}
// === SELEZIONE COL TRASCINAMENTO (come Excel): mousedown su una cella e
// trascina; il click semplice continua ad aprire l'editor della cella ===
function _pianoDragBind() {
  if (window._pianoDragBound) return;
  window._pianoDragBound = true;
  let drag = null; // {tab, table, start, moved}
  const swallow = (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener('click', swallow, true);
  };
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    if (e.target.closest('input,select,textarea,button,a')) return;
    const td = e.target.closest('td[data-g]');
    const tabEl = e.target.closest('table[data-seltab]');
    if (!td || !tabEl) return;
    // niente selezione del TESTO del browser (prenderebbe anche i nomi):
    // si copia solo il blocco marcato. Se c'è un editor aperto, lasciamo
    // partire il blur (il preventDefault bloccherebbe il cambio di focus)
    const att = document.activeElement;
    if (!att || att.tagName !== 'INPUT' || !att.closest('td')) e.preventDefault();
    drag = { tab: tabEl.dataset.seltab, table: tabEl, start: td, moved: false };
  });
  // click fuori dalle tabelle = deseleziona (come Excel); Esc idem
  document.addEventListener('click', (e) => {
    if (!e.target.closest('table[data-seltab], #piano-ctx, #piano-colori-pop')) {
      if (window._pianoBlocco) _pianoBloccoPulisci();
    }
    setTimeout(_pianoStatSelezione, 60);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window._pianoBlocco) _pianoBloccoPulisci();
    // CANC/Backspace: cancella le celle selezionate (con conferma)
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      window._pianoBlocco &&
      window._pianoBlocco.completo &&
      window._pianoBlocco.tab === 'piano' &&
      !e.target.closest('input,textarea,select')
    ) {
      e.preventDefault();
      pianoCancellaSelezione();
    }
    // Ctrl/Cmd+C copia il blocco marcato (solo le celle, mai i nomi)
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'c' || e.key === 'C') &&
      window._pianoBlocco &&
      window._pianoBlocco.completo &&
      !e.target.closest('input,textarea,select') &&
      String(window.getSelection ? window.getSelection() : '') === ''
    ) {
      e.preventDefault();
      pianoCopiaBlocco();
    }
  });
  const estendi = (td) => {
    if (!drag || !td || td.closest('table') !== drag.table) return;
    if (td === drag.start && !drag.moved) return;
    drag.moved = true;
    drag.table.classList.add('sel-noselect');
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: drag.tab, t1: drag.start, t2: td, completo: true };
    _pianoBloccoEvidenzia();
  };
  document.addEventListener('mouseover', (e) => {
    if (!drag) return;
    estendi(e.target.closest('td[data-g]'));
  });
  // AUTO-SCROLL: trascinando verso il bordo la pagina scorre da sola e la
  // selezione continua (in basso/alto la finestra, a destra/sinistra la griglia)
  let scrollTimer = null;
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    drag.cx = e.clientX;
    drag.cy = e.clientY;
    if (!scrollTimer) {
      scrollTimer = setInterval(() => {
        if (!drag || !drag.moved) return;
        const M = 70;
        let dy = 0;
        if (drag.cy > window.innerHeight - M) dy = 24;
        else if (drag.cy < 130) dy = -24;
        if (dy) window.scrollBy(0, dy);
        const wrap = drag.table.closest('.piano-wrap');
        let dx = 0;
        if (drag.cx > window.innerWidth - M) dx = 24;
        else if (drag.cx < M) dx = -24;
        if (dx && wrap) wrap.scrollLeft += dx;
        if (dy || dx) {
          const sotto = document.elementFromPoint(drag.cx, drag.cy);
          if (sotto) estendi(sotto.closest && sotto.closest('td[data-g]'));
        }
      }, 60);
    }
  });
  // TOTALI (Ore, D, N, OD, OP, SM, YTD): selezione a trascinamento come
  // nella griglia, oltre a click e Ctrl+click. Rettangolo righe x colonne.
  let dragT = null;
  const totCelle = (t) => [...t.querySelectorAll('tbody td[data-tot]')];
  const estendiTot = (td) => {
    if (!dragT || !td || td.closest('table') !== dragT.table) return;
    if (td === dragT.start && !dragT.moved) return;
    dragT.moved = true;
    dragT.table.classList.add('sel-noselect');
    const rIdx = (x) => [...dragT.table.querySelectorAll('tbody tr')].indexOf(x.closest('tr'));
    const r1 = rIdx(dragT.start);
    const r2 = rIdx(td);
    const c1 = parseInt(dragT.start.dataset.tot);
    const c2 = parseInt(td.dataset.tot);
    document.querySelectorAll('#piano-content .tot-sel').forEach((x) => x.classList.remove('tot-sel'));
    totCelle(dragT.table).forEach((x) => {
      const ri = rIdx(x);
      const ci = parseInt(x.dataset.tot);
      if (ri >= Math.min(r1, r2) && ri <= Math.max(r1, r2) && ci >= Math.min(c1, c2) && ci <= Math.max(c1, c2))
        x.classList.add('tot-sel');
    });
    _pianoStatSelezione();
  };
  document.addEventListener('mousedown', (e) => {
    window._pianoTotDragged = false;
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const td = e.target.closest('td[data-tot]');
    if (!td) return;
    e.preventDefault();
    dragT = { table: td.closest('table'), start: td, moved: false };
  });
  document.addEventListener('mouseover', (e) => {
    if (!dragT) return;
    estendiTot(e.target.closest('td[data-tot]'));
  });
  // trascinando verso il bordo la pagina scorre da sola, come nella griglia
  let scrollTimerT = null;
  document.addEventListener('mousemove', (e) => {
    if (!dragT) return;
    dragT.cx = e.clientX;
    dragT.cy = e.clientY;
    if (!scrollTimerT) {
      scrollTimerT = setInterval(() => {
        if (!dragT || !dragT.moved) return;
        const M = 70;
        let dy = 0;
        if (dragT.cy > window.innerHeight - M) dy = 24;
        else if (dragT.cy < 130) dy = -24;
        if (dy) window.scrollBy(0, dy);
        const wrap = dragT.table.closest('.piano-wrap');
        let dx = 0;
        if (dragT.cx > window.innerWidth - M) dx = 24;
        else if (dragT.cx < M) dx = -24;
        if (dx && wrap) wrap.scrollLeft += dx;
        if (dy || dx) {
          const sotto = document.elementFromPoint(dragT.cx, dragT.cy);
          if (sotto && sotto.closest) estendiTot(sotto.closest('td[data-tot]'));
        }
      }, 60);
    }
  });
  document.addEventListener('mouseup', () => {
    if (scrollTimerT) {
      clearInterval(scrollTimerT);
      scrollTimerT = null;
    }
    if (!dragT) return;
    if (dragT.moved) {
      dragT.table.classList.remove('sel-noselect');
      // il click di rilascio non deve ridurre la selezione a una sola cella
      window._pianoTotDragged = true;
    }
    dragT = null;
  });
  document.addEventListener('mouseup', () => {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
    }
    if (!drag) return;
    if (drag.moved) {
      drag.table.classList.remove('sel-noselect');
      // il click che segue il rilascio NON deve aprire l'editor della cella
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 300);
    }
    drag = null;
  });
}
// Selezione "riga intera" / "colonne intere" impostata come blocco: così
// il tasto destro → Copia blocco funziona anche da qui (come Excel)
function _pianoBloccoDaColonne(tabEl, g1, g2) {
  if (!tabEl || !tabEl.dataset.seltab) return;
  const rows = [...tabEl.querySelectorAll('tbody tr')].filter((r) => r.querySelector('td[data-g]'));
  if (!rows.length) return;
  const t1 = rows[0].querySelector('td[data-g="' + g1 + '"]');
  const t2 = rows[rows.length - 1].querySelector('td[data-g="' + g2 + '"]');
  if (t1 && t2) window._pianoBlocco = { tab: tabEl.dataset.seltab, t1: t1, t2: t2, completo: true };
}
function _pianoBloccoDaRighe(tabEl, tr1, tr2) {
  if (!tabEl || !tabEl.dataset.seltab) return;
  const c1 = tr1.querySelectorAll('td[data-g]');
  const c2 = tr2.querySelectorAll('td[data-g]');
  if (!c1.length || !c2.length) return;
  window._pianoBlocco = { tab: tabEl.dataset.seltab, t1: c1[0], t2: c2[c2.length - 1], completo: true };
}
// === ANTEPRIMA IMMEDIATA DEI COMMENTI: al passaggio del mouse su una cella
// con commento la nota appare SUBITO (il tooltip del browser tarda secondi) ===
function _pianoTipBind() {
  if (window._pianoTipBound) return;
  window._pianoTipBound = true;
  let tip = null;
  const nascondi = () => {
    if (tip) tip.style.display = 'none';
  };
  document.addEventListener('mouseover', (e) => {
    const td = e.target.closest('td[data-commento]');
    if (!td) {
      nascondi();
      return;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'piano-tip';
      document.body.appendChild(tip);
    }
    tip.textContent = td.dataset.commento;
    tip.style.display = 'block';
    const rc = td.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(rc.left, window.innerWidth - 264)) + 'px';
    tip.style.top = rc.bottom + 4 + 'px';
    // sospende il tooltip nativo (doppione): torna al mouseout
    if (td.title) {
      td.dataset.titSalvo = td.title;
      td.removeAttribute('title');
    }
  });
  document.addEventListener('mouseout', (e) => {
    const td = e.target.closest('td[data-commento]');
    if (td && td.dataset.titSalvo) {
      td.title = td.dataset.titSalvo;
      delete td.dataset.titSalvo;
    }
  });
  document.addEventListener('scroll', nascondi, true);
}
// === RIGHE E GIORNI NASCOSTI (come nascondere righe/colonne in Excel):
// solo visivo e per questo browser, i dati non si toccano mai ===
function _pianoNascostiKey() {
  return 'piano_nascosti_' + _pianoReparto();
}
function _pianoNascosti() {
  try {
    const o = JSON.parse(localStorage.getItem(_pianoNascostiKey()) || '{}');
    return { nomi: Array.isArray(o.nomi) ? o.nomi : [], giorni: Array.isArray(o.giorni) ? o.giorni : [] };
  } catch (e) {
    return { nomi: [], giorni: [] };
  }
}
function _pianoSalvaNascosti(o) {
  localStorage.setItem(_pianoNascostiKey(), JSON.stringify(o));
}
// ===== SELEZIONE MULTIPLA SPARSA (Ctrl+click su nomi e giorni) =====
// Shift+click prende un intervallo (gia' presente); Ctrl/Cmd+click aggiunge
// righe o giorni anche non vicini, e compare la barra con le azioni in blocco.
function _pianoSparse() {
  if (!window._pianoSparseSel) window._pianoSparseSel = { nomi: [], giorni: [] };
  return window._pianoSparseSel;
}
function _pianoSparseToggleNome(nome, riga) {
  // una selezione alla volta: quella a trascinamento sparisce, come in Excel
  if (window._pianoBlocco) _pianoBloccoPulisci();
  const s = _pianoSparse();
  const i = s.nomi.indexOf(nome);
  if (i >= 0) {
    s.nomi.splice(i, 1);
    if (riga) riga.classList.remove('row-selected');
  } else {
    s.nomi.push(nome);
    if (riga) riga.classList.add('row-selected');
  }
  _pianoSparseBar();
}
function _pianoSparseToggleGiorno(g) {
  if (window._pianoBlocco) _pianoBloccoPulisci();
  const s = _pianoSparse();
  const i = s.giorni.indexOf(g);
  if (i >= 0) s.giorni.splice(i, 1);
  else s.giorni.push(g);
  document.querySelectorAll('#piano-content table[data-seltab]').forEach((t) => {
    const th = t.querySelector('thead th[data-g="' + g + '"]');
    if (th) th.classList.toggle('col-selected-header', i < 0);
    t.querySelectorAll('tbody td[data-g="' + g + '"]').forEach((c) => c.classList.toggle('col-selected', i < 0));
  });
  _pianoSparseBar();
}
function _pianoSparseBar() {
  const s = _pianoSparse();
  let bar = document.getElementById('piano-multibar');
  if (!s.nomi.length && !s.giorni.length) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'piano-multibar';
    document.body.appendChild(bar);
  }
  const b = (label, onclick, rosso) =>
    '<button class="btn-export" style="font-size:.82rem;padding:4px 12px' +
    (rosso ? ';border-color:#c0392b;color:#c0392b' : '') +
    '" onclick="' +
    onclick +
    '">' +
    label +
    '</button>';
  let h = '';
  if (s.nomi.length) {
    h +=
      '<b>' +
      s.nomi.length +
      (s.nomi.length === 1 ? ' collaboratore' : ' collaboratori') +
      '</b> ' +
      b('Nascondi', 'pianoSparseNascondi()') +
      b('Stampa PDF', 'pianoSparseStampa()') +
      b('Colora celle', 'pianoSparseColora()');
  }
  if (s.giorni.length) {
    h +=
      (s.nomi.length ? ' &nbsp;&middot;&nbsp; ' : '') +
      '<b>' +
      s.giorni.length +
      (s.giorni.length === 1 ? ' giorno' : ' giorni') +
      '</b> ' +
      b('Nascondi giorni', 'pianoSparseNascondiGiorni()');
  }
  h += b('&#10005;', 'pianoSparsePulisci()', true);
  bar.innerHTML = h;
}
// ===== TROVA NEL PIANO =====
// Filtra le righe per nome oppure per sigla presente nel mese (es. "C8"):
// le celle che corrispondono alla sigla vengono evidenziate
// Ricerca dentro le tabelle riepilogo (Saldo, Statistiche): mostra solo le
// righe del collaboratore cercato; le righe senza data-nome (totali) restano
function pianoTabellaFiltra(q, tableId) {
  const testo = (q || '').trim().toLowerCase();
  const tab = document.getElementById(tableId);
  if (!tab) return;
  tab.querySelectorAll('tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = !testo || tr.dataset.nome.toLowerCase().includes(testo) ? '' : 'none';
  });
}
function pianoCercaFiltra(q) {
  window._pianoCercaTesto = q || '';
  const testo = (q || '').trim().toLowerCase();
  const tab = document.querySelector('#piano-content table[data-seltab="piano"]');
  if (!tab) return;
  tab.querySelectorAll('td.cerca-hit').forEach((c) => c.classList.remove('cerca-hit'));
  tab.querySelectorAll('tbody tr[data-nome]').forEach((tr) => {
    if (!testo) {
      tr.style.display = '';
      return;
    }
    const nomeOk = tr.dataset.nome.toLowerCase().includes(testo);
    let siglaOk = false;
    if (!nomeOk) {
      tr.querySelectorAll('td[data-g]').forEach((td) => {
        if (td.textContent.trim().toLowerCase() === testo) {
          siglaOk = true;
          td.classList.add('cerca-hit');
        }
      });
    }
    tr.style.display = nomeOk || siglaOk ? '' : 'none';
  });
}
function pianoSparsePulisci() {
  const s = _pianoSparse();
  s.nomi = [];
  s.giorni = [];
  document.querySelectorAll('#piano-content .row-selected').forEach((el) => el.classList.remove('row-selected'));
  document
    .querySelectorAll('#piano-content .col-selected, #piano-content .col-selected-header')
    .forEach((el) => el.classList.remove('col-selected', 'col-selected-header'));
  _pianoSparseBar();
}
function pianoSparseNascondi() {
  const s = _pianoSparse();
  if (s.nomi.length) pianoNascondiRighe(s.nomi.slice());
  pianoSparsePulisci();
}
function pianoSparseNascondiGiorni() {
  const s = _pianoSparse();
  if (s.giorni.length) pianoNascondiGiorni(s.giorni.slice());
  pianoSparsePulisci();
}
function pianoSparseStampa() {
  const s = _pianoSparse();
  if (s.nomi.length) stampaPianoPDF(s.nomi.slice());
}
async function pianoSparseColora() {
  const s = _pianoSparse();
  if (!s.nomi.length || !puoGestirePiano()) return;
  const colore = _colUltimo() || null;
  const righe = _pianoRighe.filter((r) => s.nomi.includes(r.collaboratore));
  if (!righe.length) {
    toast('Nessuna cella piena per i collaboratori selezionati');
    return;
  }
  if (
    !confirm(
      (colore ? 'Applico il colore del secchiello a ' : 'Tolgo il colore da ') +
        righe.length +
        ' celle di ' +
        s.nomi.length +
        ' collaboratori (mese ' +
        _pianoMeseSel +
        ')?',
    )
  )
    return;
  _pianoUndoSnap('colore righe selezionate');
  let fatte = 0;
  try {
    for (const r of righe) {
      const stC = _stileCella(r.colore);
      stC.c = colore || '';
      const nuovo = _stileStr(stC);
      if ((r.colore || null) === nuovo) continue;
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
      fatte++;
    }
    logAzione('Piano: colore righe multiple', s.nomi.length + ' collaboratori · ' + fatte + ' celle');
    toast('Colorate ' + fatte + ' celle');
    pianoSparsePulisci();
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio colore');
  }
}
function pianoNascondiRighe(nomi) {
  const o = _pianoNascosti();
  nomi.forEach((n) => {
    if (!o.nomi.includes(n)) o.nomi.push(n);
  });
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast(nomi.length + (nomi.length === 1 ? ' riga nascosta' : ' righe nascoste'));
}
function pianoNascondiGiorni(gg) {
  const o = _pianoNascosti();
  gg.forEach((g) => {
    if (!o.giorni.includes(g)) o.giorni.push(g);
  });
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast(gg.length + (gg.length === 1 ? ' giorno nascosto' : ' giorni nascosti'));
}
// rimostra SOLO alcune righe (dal chip sul confine, come Excel)
function pianoMostraRighe(nomi) {
  const o = _pianoNascosti();
  o.nomi = o.nomi.filter((n) => !nomi.includes(n));
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast('Mostrate: ' + nomi.join(', '));
}
function pianoMostraGiorni(gg) {
  const o = _pianoNascosti();
  o.giorni = o.giorni.filter((g) => !gg.includes(g));
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast('Giorni rimostrati: ' + gg.join(', '));
}
function pianoMostraNascosti() {
  _pianoSalvaNascosti({ nomi: [], giorni: [] });
  _pianoApplicaNascosti();
  toast('Righe e giorni di nuovo tutti visibili');
}
function _pianoApplicaNascosti() {
  const o = _pianoNascosti();
  _pianoBloccoPulisci();
  // giorni: colonne collegate su TUTTE le tabelle (griglia, differenze, effettivi, pianificazione);
  // con table-layout:fixed va azzerata anche la <col> e ridotta la larghezza tabella
  document.querySelectorAll('#piano-content table[data-seltab]').forEach((t) => {
    t.querySelectorAll('th[data-g], td[data-g]').forEach((c) => {
      c.classList.toggle('col-nascosta', o.giorni.includes(parseInt(c.dataset.g)));
    });
    const offset = t.dataset.seltab === 'piano' ? 2 : 1;
    const cols = t.querySelectorAll('colgroup col');
    if (!t.dataset.wOrig) t.dataset.wOrig = parseInt(t.style.width) || t.offsetWidth;
    let tolti = 0;
    cols.forEach((col, i) => {
      const g = i - offset + 1;
      if (g < 1) return;
      if (!col.dataset.wOrig) col.dataset.wOrig = col.style.width || '37px';
      if (o.giorni.includes(g) && parseInt(col.dataset.wOrig)) {
        col.style.width = '0px';
        tolti += parseInt(col.dataset.wOrig) || 37;
      } else if (col.style.width === '0px') {
        col.style.width = col.dataset.wOrig;
      }
    });
    t.style.width = parseInt(t.dataset.wOrig) - tolti + 'px';
  });
  // GIORNI nascosti: chip sull'intestazione (come per le righe), cosi' si
  // vede subito che mancano colonne e si rimostrano con un click
  document.querySelectorAll('.chip-giorni-nascosti').forEach((c) => c.remove());
  const tabG = document.querySelector('#piano-content table[data-seltab="piano"]');
  if (tabG && o.giorni.length) {
    const ordinati = [...o.giorni].sort((a, b) => a - b);
    // gruppi contigui
    const gruppi = [];
    let cur = [ordinati[0]];
    ordinati.slice(1).forEach((g) => {
      if (g === cur[cur.length - 1] + 1) cur.push(g);
      else {
        gruppi.push(cur);
        cur = [g];
      }
    });
    gruppi.push(cur);
    gruppi.forEach((gr) => {
      // aggancio: il primo giorno visibile dopo il gruppo (o prima, se in coda)
      let th = null;
      for (let g = gr[gr.length - 1] + 1; g <= 31 && !th; g++)
        if (!o.giorni.includes(g)) th = tabG.querySelector('thead th[data-g="' + g + '"]');
      let inCoda = false;
      if (!th) {
        inCoda = true;
        for (let g = gr[0] - 1; g >= 1 && !th; g--)
          if (!o.giorni.includes(g)) th = tabG.querySelector('thead th[data-g="' + g + '"]');
      }
      if (!th) return;
      const chip = document.createElement('span');
      chip.className = 'chip-giorni-nascosti';
      chip.textContent = (inCoda ? '\u25c2' : '\u25b8') + gr.length;
      chip.title = 'Giorni nascosti: ' + gr.join(', ') + ' \u00b7 clicca per rimostrarli';
      const gr2 = gr.slice();
      chip.onclick = (e) => {
        e.stopPropagation();
        pianoMostraGiorni(gr2);
      };
      th.style.position = 'relative';
      th.prepend(chip);
    });
  }
  // righe: solo la griglia collaboratori
  document.querySelectorAll('#piano-content table[data-seltab="piano"] tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = o.nomi.includes(tr.dataset.nome) ? 'none' : '';
  });
  // confine visibile come Excel: linea marcata + chip a sinistra del nome
  // che al passaggio dice chi c'è sotto ("Mostra: Andrade...") e al click li rimostra
  document.querySelectorAll('.chip-nascoste').forEach((c) => c.remove());
  document.querySelectorAll('.riga-dopo-nascoste').forEach((r) => r.classList.remove('riga-dopo-nascoste'));
  document.querySelectorAll('.riga-prima-nascoste').forEach((r) => r.classList.remove('riga-prima-nascoste'));
  const tbodyG = document.querySelector('#piano-content table[data-seltab="piano"] tbody');
  if (tbodyG && o.nomi.length) {
    const mettiChip = (tr, gruppo, inCoda) => {
      tr.classList.add(inCoda ? 'riga-prima-nascoste' : 'riga-dopo-nascoste');
      const cel = tr.querySelector('.piano-nome');
      if (!cel) return;
      const chip = document.createElement('span');
      chip.className = 'chip-nascoste';
      chip.textContent = (inCoda ? '▾' : '▸') + gruppo.length;
      chip.title = 'Mostra: ' + gruppo.join(', ');
      const g2 = gruppo.slice();
      chip.onclick = (e) => {
        e.stopPropagation();
        pianoMostraRighe(g2);
      };
      cel.prepend(chip);
    };
    const rows = [...tbodyG.querySelectorAll('tr[data-nome]')];
    let gruppo = [];
    let ultimaVisibile = null;
    rows.forEach((tr) => {
      if (o.nomi.includes(tr.dataset.nome)) {
        gruppo.push(tr.dataset.nome);
        return;
      }
      if (gruppo.length) {
        mettiChip(tr, gruppo, false);
        gruppo = [];
      }
      ultimaVisibile = tr;
    });
    if (gruppo.length && ultimaVisibile) mettiChip(ultimaVisibile, gruppo, true);
  }
  // barra "mostra tutto"
  const n = o.nomi.length + o.giorni.length;
  let bar = document.getElementById('piano-nascosti-bar');
  if (!n) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    const wrap = document.querySelector('#piano-content table[data-seltab="piano"]');
    if (!wrap) return;
    bar = document.createElement('div');
    bar.id = 'piano-nascosti-bar';
    wrap.closest('.piano-wrap').parentNode.insertBefore(bar, wrap.closest('.piano-wrap'));
  }
  bar.innerHTML =
    '<span style="font-size:.82rem;color:var(--muted)">Nascosti: ' +
    (o.nomi.length ? o.nomi.length + ' righe' : '') +
    (o.nomi.length && o.giorni.length ? ' + ' : '') +
    (o.giorni.length ? o.giorni.length + ' giorni (' + o.giorni.sort((a, b) => a - b).join(', ') + ')' : '') +
    '</span> <button class="btn-export" style="font-size:.82rem;padding:2px 10px;margin-left:8px" onclick="pianoMostraNascosti()">Mostra tutto</button>';
  bar.style.cssText = 'padding:4px 2px 6px';
}
function pianoCopiaBlocco() {
  const celle = _pianoBloccoCelle();
  if (!celle.length) {
    toast('Nessun blocco: Shift+click su due celle per selezionarlo');
    return;
  }
  const tab = window._pianoBlocco.tab;
  const tsv = celle
    .map((riga) =>
      riga
        .map((c) => {
          let t = (c.textContent || '').trim();
          if (tab === 'fabb' && t.includes('/')) t = t.split('/').pop();
          return t;
        })
        .join('\t'),
    )
    .join('\n');
  navigator.clipboard.writeText(tsv).then(
    () => toast('Copiate ' + celle.length * celle[0].length + ' celle (incollabili anche in Excel)'),
    () => toast('Clipboard non disponibile'),
  );
}
// testo dagli appunti, con ripiego manuale se il browser nega la lettura
async function _pianoTestoAppunti() {
  try {
    const t = await navigator.clipboard.readText();
    if (t && t.trim()) return t;
  } catch (e) {}
  return new Promise((res) => {
    const m = document.getElementById('pwd-modal');
    const mc = document.getElementById('pwd-modal-content');
    if (!m || !mc) {
      res(prompt('Incolla qui il contenuto copiato (una riga per collaboratore, celle separate da TAB):') || '');
      return;
    }
    mc.innerHTML =
      '<h3 style="margin-bottom:8px">Incolla</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Premi Ctrl+V (Cmd+V su Mac) nel riquadro: puoi incollare celle copiate da Excel o dal Diario.</p>' +
      '<textarea id="incolla-txt" style="width:100%;height:140px;font-family:monospace;font-size:.85rem;padding:8px"></textarea>' +
      '<div style="margin-top:10px;display:flex;gap:10px"><button class="btn-export" onclick="window._incollaOk()">Incolla</button><button class="btn-export" style="border-color:#c0392b;color:#c0392b" onclick="window._incollaAnnulla()">Annulla</button></div>';
    m.classList.remove('hidden');
    setTimeout(() => document.getElementById('incolla-txt').focus(), 100);
    window._incollaOk = () => {
      const v = document.getElementById('incolla-txt').value;
      m.classList.add('hidden');
      res(v);
    };
    window._incollaAnnulla = () => {
      m.classList.add('hidden');
      res('');
    };
  });
}
function _pianoParseTsv(testo) {
  return testo
    .replace(/\r/g, '')
    .split('\n')
    .map((r) => r.split('\t').map((x) => x.trim()));
}
// incolla nel PIANO a partire dalla cella target (righe = collaboratori in
// ordine visivo, colonne = giorni)
async function pianoIncollaDaClipboard(target) {
  if (!puoGestirePiano()) return;
  const testo = await _pianoTestoAppunti();
  if (!testo.trim()) return;
  const grid = _pianoParseTsv(testo);
  const nomiVis = [...document.querySelectorAll('#piano-content .piano-table tbody tr[data-nome]')].map(
    (tr) => tr.dataset.nome,
  );
  const start = nomiVis.indexOf(target.nome);
  if (start < 0) {
    toast('Cella di partenza non trovata');
    return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const g0 = parseInt(target.data.split('-')[2]);
  const daPatch = [];
  const daInserire = [];
  let scartate = 0;
  let fuori = 0;
  grid.forEach((riga, i) => {
    const nome = nomiVis[start + i];
    if (!nome) {
      fuori += riga.filter((x) => x).length;
      return;
    }
    riga.forEach((val, j) => {
      const g = g0 + j;
      const cod = String(val || '')
        .trim()
        .toUpperCase();
      if (!cod) return;
      if (g > nGiorni) {
        fuori++;
        return;
      }
      if (!_pianoTurnoInfo(cod) && !_pianoCodiceInfo(cod)) {
        scartate++;
        return;
      }
      const dstr = ym + '-' + String(g).padStart(2, '0');
      const ex = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
      if (ex) {
        if (ex.codice !== cod) daPatch.push({ id: ex.id, codice: cod, nomeRef: nome });
      } else {
        daInserire.push({
          collaboratore: nome,
          data: dstr,
          codice: cod,
          protetto: true,
          generato: false,
          reparto_dip: _pianoReparto(),
        });
      }
    });
  });
  if (!daPatch.length && !daInserire.length) {
    toast('Niente da incollare' + (scartate ? ' (' + scartate + ' sigle sconosciute)' : ''));
    return;
  }
  if (
    !confirm(
      'Incollo a partire da ' +
        target.nome +
        ' / giorno ' +
        g0 +
        '?\n\n• ' +
        daInserire.length +
        ' celle nuove\n• ' +
        daPatch.length +
        ' celle sovrascritte' +
        (scartate ? '\n• ' + scartate + ' sigle sconosciute scartate' : '') +
        (fuori ? '\n• ' + fuori + ' celle oltre i bordi del mese/lista (ignorate)' : ''),
    )
  )
    return;
  // giorni chiusi: ogni giorno toccato va sbloccato con motivo, come per la singola cella
  const dateIncolla = new Set(daInserire.map((x) => x.data));
  daPatch.forEach((p) => {
    const rr = _pianoRighe.find((x) => x.id === p.id);
    if (rr) dateIncolla.add(rr.data);
  });
  for (const d of [...dateIncolla].sort()) if (!_pianoConsentiScrittura(d)) return;
  _pianoUndoSnap('incolla nel piano');
  try {
    for (let i = 0; i < daPatch.length; i += 10)
      await Promise.all(
        daPatch
          .slice(i, i + 10)
          .map((p) => secPatch('piano', 'id=eq.' + p.id, { codice: p.codice, protetto: true, generato: false })),
      );
    if (daInserire.length) await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: daInserire });
    logAzione('Incolla nel piano', target.nome + ' g' + g0 + ' · ' + (daPatch.length + daInserire.length) + ' celle');
    toast('Incollate ' + (daPatch.length + daInserire.length) + ' celle');
    _pianoBloccoPulisci();
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
    const coppieNF = daInserire
      .map((x) => ({ nome: x.collaboratore, codice: x.codice, commento: '' }))
      .concat(daPatch.map((p) => ({ nome: p.nomeRef || '', codice: p.codice, commento: '' })));
    setTimeout(async () => {
      await _pianoProponiCertificazioniBulk(coppieNF);
      await controllaFormazioniCompletate(true);
    }, 400);
  } catch (e) {
    console.error(e);
    toast('Errore incolla');
  }
}
// menu contestuale sul FABBISOGNO: copia blocco / incolla numeri
function fabbCtxMenu(e, codice, dstr) {
  e.preventDefault();
  let menu = document.getElementById('piano-ctx');
  if (!menu) return;
  window._fabbCtxSel = { codice: codice, dstr: dstr };
  const puoMod = puoGestirePiano();
  let h =
    '<div class="piano-ctx-head">Fabbisogno ' +
    escP(codice) +
    ' · ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    '</div>';
  if (window._pianoBlocco && window._pianoBlocco.completo)
    h +=
      '<div class="piano-ctx-item" onclick="nascondiPianoCtx();pianoCopiaBlocco()"><i class="icx icx-modifica"></i> Copia blocco selezionato</div>';
  if (puoMod)
    h +=
      '<div class="piano-ctx-item" onclick="nascondiPianoCtx();fabbIncollaDaClipboard()"><i class="icx icx-refresh"></i> Incolla numeri qui (Excel/blocco)</div>';
  menu.innerHTML = h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
}
async function fabbIncollaDaClipboard() {
  if (!puoGestirePiano() || !window._fabbCtxSel) return;
  const target = window._fabbCtxSel;
  const testo = await _pianoTestoAppunti();
  if (!testo.trim()) return;
  const grid = _pianoParseTsv(testo);
  // ordine dei turni come mostrati nella tabella fabbisogno
  const tabelle = [...document.querySelectorAll('#piano-content .piano-table')];
  const tavFabb = tabelle.find((t) => t.querySelector('td[onclick*="fabbisognoInline"]'));
  if (!tavFabb) return;
  const codiciVis = [...tavFabb.querySelectorAll('tbody tr')].map((tr) =>
    (tr.querySelector('.piano-nome') || {}).textContent ? tr.querySelector('.piano-nome').textContent.trim() : '',
  );
  const start = codiciVis.indexOf(target.codice);
  if (start < 0) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const g0 = parseInt(target.dstr.split('-')[2]);
  const ops = [];
  let scartate = 0;
  grid.forEach((riga, i) => {
    const cod = codiciVis[start + i];
    if (!cod) return;
    riga.forEach((val, j) => {
      const g = g0 + j;
      if (g > nGiorni) return;
      const v = String(val || '').trim();
      if (v === '') return;
      const q = parseInt(v);
      if (isNaN(q) || q < 0) {
        scartate++;
        return;
      }
      ops.push({ codice: cod, data: ym + '-' + String(g).padStart(2, '0'), q: q });
    });
  });
  if (!ops.length) {
    toast('Nessun numero da incollare');
    return;
  }
  if (
    !confirm(
      'Incollo il fabbisogno da ' +
        target.codice +
        ' / giorno ' +
        g0 +
        '?\n\n• ' +
        ops.length +
        ' celle (0 = rimuove)' +
        (scartate ? '\n• ' + scartate + ' valori non numerici scartati' : ''),
    )
  )
    return;
  try {
    for (let i = 0; i < ops.length; i += 10)
      await Promise.all(
        ops.slice(i, i + 10).map(async (op) => {
          await secDel(
            'piano_fabbisogni',
            'data=eq.' + op.data + '&turno_codice=eq.' + op.codice + '&reparto_dip=eq.' + _pianoReparto(),
          );
          if (op.q > 0)
            await secPost('piano_fabbisogni', {
              data: op.data,
              turno_codice: op.codice,
              quantita: op.q,
              reparto_dip: _pianoReparto(),
            });
        }),
      );
    logAzione('Incolla fabbisogno', target.codice + ' g' + g0 + ' · ' + ops.length + ' celle');
    toast('Fabbisogno incollato: ' + ops.length + ' celle');
    _pianoBloccoPulisci();
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore incolla fabbisogno');
  }
}

// ============================================================
// MIGLIORA ORE · secondo passaggio dopo la bozza: sposta turni
// GENERATI (non protetti) da chi è sopra le ore dovute a chi è
// sotto, stesso giorno e stesse regole (idoneità, consecutivi,
// riposo 11h, tolleranza). La copertura del fabbisogno non cambia.
// ============================================================
async function miglioraOrePiano() {
  _pianoUndoSnap('migliora ore ' + _pianoMeseSel);
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  let righe;
  {
    const tutteRighe = (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&limit=8000')) || [];
    const repM = _pianoReparto();
    righe = tutteRighe.filter((r) => {
      if ((r.reparto_dip || 'slots') === repM) return true;
      const infoM = _pianoCollabInfo(r.collaboratore);
      return !!(infoM && String(infoM.reparti_extra || '').trim() && _pianoAppartieneAlReparto(infoM));
    });
  }
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const cella = {};
  const rigaDi = {};
  righe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  const infoDi = {};
  nomi.forEach((n) => (infoDi[n] = _pianoCollabInfo(n) || {}));
  const ore = {};
  righe.forEach((r) => {
    if (!nomi.includes(r.collaboratore)) return;
    const pct = parseFloat((infoDi[r.collaboratore] || {}).percentuale) || 1;
    ore[r.collaboratore] = (ore[r.collaboratore] || 0) + _pianoOreDiRiga(r, pct);
  });
  await _pianoAggiornaYtd(nomi);
  await _pianoCaricaOreMese(_pianoMeseSel);
  const saldo = {};
  const fissi = nomi.filter((n) => !infoDi[n].is_jolly);
  fissi.forEach((n) => {
    const pct = parseFloat(infoDi[n].percentuale) || 1;
    const obiettivo = (_pianoGgDovuti(n, ym) / 7) * _pianoOreSett * pct - (_pianoYtdMap[n] || 0);
    saldo[n] = (ore[n] || 0) - obiettivo;
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const lavora = (cod) => !!_pianoTurnoInfo(cod);
  const consecOk = (nome, g) => {
    // catena consecutiva risultante aggiungendo un turno il giorno g
    let n = 1;
    for (let k = g - 1; k >= 1 && lavora(cella[nome + '|' + k] || ''); k--) n++;
    for (let k = g + 1; k <= nGiorni && lavora(cella[nome + '|' + k] || ''); k++) n++;
    return n <= maxCons;
  };
  const riposoOk = (nome, g, t) => {
    const prev = _pianoTurnoInfo(cella[nome + '|' + (g - 1)] || '');
    if (prev && prev.ora_fine && t.ora_inizio) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = finePrev <= _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next && next.ora_fine && t.ora_fine) {
      const fineT = _pianoOra(t.ora_fine);
      const fineTAbs = fineT <= _pianoOra(t.ora_inizio) ? 24 + fineT : fineT;
      if (24 + _pianoOra(next.ora_inizio) - fineTAbs < minRiposo) return false;
    }
    return true;
  };
  const malattie = _pianoMalattieMese(ym);
  // donatori: turni GENERATI non protetti di chi è sopra (fissi sopra o jolly)
  const donatrici = righe
    .filter(
      (r) =>
        r.generato &&
        !r.protetto &&
        _pianoTurnoInfo(r.codice) &&
        nomi.includes(r.collaboratore) &&
        (infoDi[r.collaboratore].is_jolly || (saldo[r.collaboratore] || 0) > 1),
    )
    .sort(
      (x, y) =>
        (saldo[y.collaboratore] === undefined ? 999 : saldo[y.collaboratore]) -
        (saldo[x.collaboratore] === undefined ? 999 : saldo[x.collaboratore]),
    );
  const scambi = [];
  const mediaPrima = fissi.reduce((acc, n) => acc + Math.abs(saldo[n] || 0), 0) / (fissi.length || 1);
  for (const rT of donatrici) {
    const t = _pianoTurnoInfo(rT.codice);
    const g = parseInt(rT.data.split('-')[2]);
    const oT = parseFloat(t.durata_ore) || 0;
    const donatore = rT.collaboratore;
    const sD = infoDi[donatore].is_jolly ? 999 : saldo[donatore] || 0;
    if (sD !== 999 && sD - oT < -1) continue; // il donatore andrebbe troppo sotto
    // riceventi: fissi sotto le ore, ordinati dal più sotto
    const cand = fissi
      .filter((n) => n !== donatore && (saldo[n] || 0) < -1)
      .sort((x, y) => (saldo[x] || 0) - (saldo[y] || 0));
    for (const ric of cand) {
      const kR = ric + '|' + g;
      const celR = cella[kR] || '';
      const rigaR = rigaDi[kR];
      const libera = !celR || (celR === 'C' && rigaR && rigaR.generato && !rigaR.protetto);
      if (!libera) continue;
      if (malattie[ric + '|' + rT.data]) continue;
      if (!_pianoIdoneoPerTurno(ric, t)) continue;
      if (!consecOk(ric, g)) continue;
      if (!riposoOk(ric, g, t)) continue;
      // il ricevente non supera il proprio massimo (tolleranza_ore_sopra o simmetrica)
      const limR = _pianoLimitiOre(ric, nGiorni);
      if (limR.obiettivo != null && limR.max != null && (saldo[ric] || 0) + oT > limR.max - limR.obiettivo) continue;
      const sR = saldo[ric] || 0;
      const dopoD = sD === 999 ? 0 : Math.abs(sD - oT) - Math.abs(sD);
      const dopoR = Math.abs(sR + oT) - Math.abs(sR);
      if (dopoD + dopoR >= -0.25) continue; // deve migliorare davvero
      scambi.push({ rT: rT, rigaR: rigaR, ric: ric, g: g, cod: rT.codice });
      // aggiorna lo stato per i prossimi scambi
      cella[donatore + '|' + g] = 'C';
      cella[kR] = rT.codice;
      if (sD !== 999) saldo[donatore] = sD - oT;
      saldo[ric] = sR + oT;
      const pctD = parseFloat(infoDi[donatore].percentuale) || 1;
      ore[donatore] = (ore[donatore] || 0) - oT;
      ore[ric] = (ore[ric] || 0) + oT;
      break;
    }
  }
  if (!scambi.length) {
    toast('Nessuno scambio utile trovato: le ore sono già bilanciate al meglio');
    return;
  }
  const mediaDopo = fissi.reduce((acc, n) => acc + Math.abs(saldo[n] || 0), 0) / (fissi.length || 1);
  if (
    !confirm(
      'Migliora ore (' +
        ym +
        '):\n\n• ' +
        scambi.length +
        ' turni spostati da chi è sopra a chi è sotto le ore dovute (stesso giorno, regole rispettate)\n• Scarto medio dalle ore dovute: ' +
        mediaPrima.toFixed(1) +
        ' → ' +
        mediaDopo.toFixed(1) +
        ' ore\n\nSolo celle GENERATE, mai quelle protette. Procedere?',
    )
  )
    return;
  try {
    for (let i = 0; i < scambi.length; i += 8)
      await Promise.all(
        scambi.slice(i, i + 8).map(async (sc) => {
          await secPatch('piano', 'id=eq.' + sc.rT.id, { codice: 'C' });
          if (sc.rigaR) await secPatch('piano', 'id=eq.' + sc.rigaR.id, { codice: sc.cod });
          else
            await _pianoInserisciCella({
              collaboratore: sc.ric,
              data: ym + '-' + String(sc.g).padStart(2, '0'),
              codice: sc.cod,
              protetto: false,
              generato: true,
              reparto_dip: _pianoReparto(),
            });
        }),
      );
    logAzione(
      'Piano: migliora ore',
      ym + ' · ' + scambi.length + ' scambi, scarto ' + mediaPrima.toFixed(1) + '→' + mediaDopo.toFixed(1),
    );
    toast(
      'Migliorato: ' +
        scambi.length +
        ' scambi (scarto medio ' +
        mediaPrima.toFixed(1) +
        '→' +
        mediaDopo.toFixed(1) +
        ' ore)',
    );
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore migliora ore');
  }
}

// ============================================================
// FORMAZIONE ↔ PIANO: avviso "non formato per il settore" e
// contatore dei giorni di formazione dai commenti
// ============================================================
function _pianoGruppoCompInv() {
  const m = _pianoCompetenzeGruppi();
  const inv = {};
  Object.entries(m).forEach(([k, g]) => {
    if (!inv[g]) inv[g] = k;
  });
  return inv;
}
// ritorna il gruppo (SALA/REC/CASSA) per cui il collaboratore NON risulta
// formato, oppure null. I commenti di formazione/affiancamento non contano.
function _pianoGruppoNonFormato(nome, codTurno, commento) {
  const t = _pianoTurnoInfo(codTurno);
  if (!t) return null;
  const g = (t.gruppo || '').toUpperCase();
  if (!['SALA', 'REC', 'CASSA'].includes(g)) return null;
  if (/formazion|affianc/i.test(commento || '')) return null;
  const info = _pianoCollabInfo(nome);
  if (!info) return null;
  const fz = ((info.funzione || '') + '').toUpperCase();
  if (['SUP', 'SOSTRESP', 'RESP'].includes(fz)) return null;
  // chi lavora quel settore IN ACCOMPAGNAMENTO (es. guardaroba con la rec)
  // è una situazione voluta: nessun avviso
  if (_pianoAccompagnamentoDi(info).includes(g)) return null;
  const sett = _pianoSettoriEffettivi(info);
  if (!sett || sett.includes(g)) return null;
  return g;
}
async function _pianoProponiCertificazione(nome, gruppo) {
  if (
    !confirm(
      nome +
        ' non risulta formato per ' +
        gruppo +
        '.\nVuoi aggiungerlo in Formazione?\n\nOK = certifica (ti chiederà formatore e punti, come dalla Formazione)\nAnnulla = il turno resta ma la Formazione non cambia',
    )
  )
    return;
  const key = _pianoGruppoCompInv()[gruppo];
  if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(nome, key, true);
}
// riepilogo bulk (import/incolla): certificazione SENZA punti
async function _pianoProponiCertificazioniBulk(coppie) {
  const mancanti = [];
  const visti = new Set();
  coppie.forEach((c) => {
    const g = _pianoGruppoNonFormato(c.nome, c.codice, c.commento);
    if (g && !visti.has(c.nome + '|' + g)) {
      visti.add(c.nome + '|' + g);
      mancanti.push({ nome: c.nome, gruppo: g });
    }
  });
  if (!mancanti.length) return;
  if (
    !confirm(
      'Alcuni collaboratori hanno ricevuto turni di settori per cui NON risultano formati:\n\n' +
        mancanti.map((x) => '• ' + x.nome + ' → ' + x.gruppo).join('\n') +
        '\n\nVuoi certificarli in Formazione? (senza punti: i punti si assegnano poi dalla pagina Formazione)',
    )
  )
    return;
  const inv = _pianoGruppoCompInv();
  for (const m of mancanti) {
    const key = inv[m.gruppo];
    if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(m.nome, key, false);
  }
}
// FORMAZIONI COMPLETATE dai commenti: cella con turno + commento
// "formazione/affianc..." = giorno di affiancamento; al raggiungimento
// della soglia (personalizzabile, default 5) propone la certificazione
function _pianoSettoreDaCommento(commento, gruppoTurno) {
  const c = (commento || '').toLowerCase();
  if (/cass/.test(c)) return 'CASSA';
  if (/rec/.test(c)) return 'REC';
  if (/sala/.test(c)) return 'SALA';
  if (/acc/.test(c)) return 'ACCOGLIENZA';
  return gruppoTurno;
}
async function controllaFormazioniCompletate(silenzioso) {
  const soglia = window._pianoGgFormazione || parseInt(await getImp('piano_giorni_formazione')) || 5;
  const rep = _pianoReparto();
  const pattern = ['%ormazion%', '%ORMAZION%', '%ffianc%', '%FFIANC%'];
  const tutte = [];
  for (const p of pattern) {
    const r = (await secGet('piano?commento=like.' + p + '&reparto_dip=eq.' + rep + '&limit=5000')) || [];
    r.forEach((x) => tutte.push(x));
  }
  const perId = {};
  tutte.forEach((r) => (perId[r.id] = r));
  const gruppi = {}; // nome|settore -> {giorni:Set, ultimo}
  Object.values(perId).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t) return;
    const sett = _pianoSettoreDaCommento(r.commento, (t.gruppo || '').toUpperCase());
    if (!['SALA', 'REC', 'CASSA'].includes(sett)) return;
    const k = r.collaboratore + '|' + sett;
    gruppi[k] = gruppi[k] || { giorni: new Set(), ultimo: '' };
    gruppi[k].giorni.add(r.data);
    if (r.data > gruppi[k].ultimo) gruppi[k].ultimo = r.data;
  });
  const oggi = new Date();
  const oggiStr =
    oggi.getFullYear() +
    '-' +
    String(oggi.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(oggi.getDate()).padStart(2, '0');
  const complete = [];
  Object.entries(gruppi).forEach(([k, v]) => {
    const [nome, sett] = k.split('|');
    if (v.giorni.size < soglia) return;
    if (v.ultimo > oggiStr) return; // la formazione deve essere FINITA
    const info = _pianoCollabInfo(nome);
    if (!info || info.attivo === false) return;
    const eff = _pianoSettoriEffettivi(info);
    if (eff && eff.includes(sett)) return; // già formato/certificato
    complete.push({ nome: nome, sett: sett, giorni: v.giorni.size, ultimo: v.ultimo });
  });
  if (!complete.length) {
    if (!silenzioso) toast('Nessuna formazione completata da certificare (soglia ' + soglia + ' giorni)');
    return;
  }
  for (const f of complete) {
    if (
      confirm(
        f.nome +
          ' ha COMPLETATO la formazione in ' +
          f.sett +
          ': ' +
          f.giorni +
          ' giorni di affiancamento (ultimo il ' +
          f.ultimo.split('-').reverse().join('.') +
          ', dai commenti del piano).\n\nVuoi certificarlo in Formazione?\n(OK = certifica · ti chiederà formatore e punti)',
      )
    ) {
      const key = _pianoGruppoCompInv()[f.sett];
      if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(f.nome, key, true);
    }
  }
}
async function salvaGiorniFormazione() {
  const v = parseInt((document.getElementById('imp-gg-formazione') || {}).value);
  if (!v || v < 1 || v > 30) {
    toastErrore('I giorni di formazione per certificare vanno da 1 a 30');
    return;
  }
  if (!(await salvaImp('piano_giorni_formazione', String(v)))) return;
  window._pianoGgFormazione = v;
  toast('Soglia giorni di formazione: ' + v);
}

// ============================================================
// TAB CREDITI · una riga per collaboratore con quello che gli resta o che
// deve recuperare: vacanze, CGF, saldo ore dell anno, recupero del mese,
// congedi non pagati. Nessun calcolo nuovo: sono gli stessi numeri delle
// schede Vacanze, Festivi, Saldo e Recupero ore, messi uno accanto all altro.
// ============================================================
async function _pianoCreditiDati(anno, soloNomi) {
  const nomi = soloNomi
    ? soloNomi
    : ordineCollabPiano(
        collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome),
        _pianoReparto(),
      );
  const cfg = _pianoVacCfg();
  // vacanze: settimane registrate nell anno (come la scheda Vacanze)
  const vac = (await secGet('piano_vacanze?anno=eq.' + anno + '&limit=2000')) || [];
  const gia = {};
  vac.forEach((v) => {
    const sett = parseInt(v.settimana);
    if (!sett || !v.confermata) return; // come la scheda Vacanze: le provvisorie non contano
    const gg = _pianoGiorniSettimana(anno, sett).filter((d) => d.substring(0, 4) === String(anno));
    gia[v.collaboratore] = (gia[v.collaboratore] || 0) + gg.length;
  });
  const vRest = {};
  (
    (await secGet(
      'piano?codice=eq.M&commento=like.Malattia%20dal%20Diario%20*era%20V*&data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&select=collaboratore,data,commento&limit=5000',
    )) || []
  ).forEach((r) => {
    if (/era V1?\b/.test(String(r.commento || ''))) vRest[r.collaboratore] = (vRest[r.collaboratore] || 0) + 1;
  });
  // CGF: fino alla fine del mese aperto nel Piano, mai i mesi futuri
  const annoSel = _pianoMeseSel.substring(0, 4);
  const finoA =
    String(anno) < annoSel
      ? anno + '-12-31'
      : String(anno) > annoSel
        ? anno + '-00-00'
        : _pianoMeseSel + '-' + String(_pianoUltimoGiorno(_pianoMeseSel)).padStart(2, '0');
  const nomiCgf = nomi.filter((n) => {
    const c = _pianoCollabInfo(n);
    return c && _pianoMaturaCgf(c);
  });
  await _pianoCaricaCgfRiporto(anno);
  const storia = await _pianoCaricaRigheCgf(anno, finoA);
  const cgf = nomiCgf.length ? _pianoContabilitaCgf(storia, nomiCgf, anno, finoA) : {};
  // recupero ore del mese aperto (solo del settore aperto)
  if (!soloNomi) await _pianoCaricaRecupero(_pianoMeseSel);
  // saldo ore dell anno: se e gia stato calcolato nella scheda Saldo
  const saldo =
    window._pianoSaldoAnnoDati && window._pianoSaldoAnnoDati.anno === anno ? window._pianoSaldoAnnoDati : null;
  return nomi.map((n) => {
    const info = _pianoCollabInfo(n) || {};
    const jolly = !!(info.is_jolly || info.impiego === 'jolly');
    const fisso = _pianoMaturaCgf(info); // stesso criterio della scheda Vacanze
    const eff = _pianoCongedoNpEffetti(n, anno);
    const dir =
      info.data_assunzione && fisso
        ? PianoRegole.giorniVacanzaSpettanti(String(info.data_assunzione).substring(0, 10), anno, {
            ...cfg,
            giorniCongedo: eff.giorniVacanze,
            giorniAnzianita: eff.giorniAnzianita,
          })
        : null;
    const pian = gia[n] || 0;
    const rest = vRest[n] || 0;
    let saldoOre = null;
    if (saldo && !jolly) {
      let somma = 0;
      let q = false;
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        if (_pianoMeseDentroRiporto(n, anno, mm)) continue;
        const v = _pianoSaldoDelMese(saldo, n, mm, info);
        if (v != null) {
          somma += v;
          q = true;
        }
      }
      const rip = _pianoRiporto(n, anno);
      if (q || rip) saldoOre = Math.round((rip + somma) * 10) / 10;
    }
    const cnp = _pianoCongediDi(n).filter(
      (c) => String(c.dal).substring(0, 4) <= String(anno) && String(c.al).substring(0, 4) >= String(anno),
    );
    return {
      nome: n,
      funzione: jolly ? 'JOLLY' : info.funzione || '',
      pct: jolly ? null : Math.round((parseFloat(info.percentuale) || 1) * 100),
      jolly: jolly,
      senzaData: !info.data_assunzione && fisso,
      vac: dir
        ? { spett: dir.giorni, pian: pian, rest: rest, resta: Math.round((dir.giorni - pian + rest) * 10) / 10 }
        : null,
      cgf: cgf[n]
        ? { mat: cgf[n].maturati, god: cgf[n].goduti, rip: cgf[n].riporto, persi: cgf[n].persi, resta: cgf[n].resta }
        : null,
      saldoOre: saldoOre,
      recMese: soloNomi || jolly ? null : _pianoRecuperoTotale(n, _pianoMeseSel),
      cnp: cnp.reduce((a, c) => a + _pianoGiorniCongedo(c), 0),
    };
  });
}
function _pianoCreditiNum(v, unita, colore) {
  if (v == null) return '<td style="color:var(--muted)">-</td>';
  const c = colore ? (v > 0 ? '#8b6914' : v < 0 ? '#c0392b' : '#2c6e49') : 'inherit';
  return '<td style="font-weight:' + (colore ? 700 : 400) + ';color:' + c + '">' + v + (unita || '') + '</td>';
}
async function _renderPianoCreditiTab() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const MESI_L = MESI_FULL || [];
  const meseLbl = (MESI_L[parseInt(_pianoMeseSel.split('-')[1]) - 1] || '') + ' ' + anno;
  const dati = await _pianoCreditiDati(anno);
  const saldoPronto = !!(window._pianoSaldoAnnoDati && window._pianoSaldoAnnoDati.anno === anno);
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Crediti ' +
    anno +
    ' &middot; ' +
    escP(repartoLabel(_pianoReparto())) +
    '<span style="display:inline-flex;align-items:center;gap:6px">' +
    '<button class="btn-export" style="padding:2px 10px;font-size:.9rem" title="Mese precedente" onclick="pianoCambiaMese(-1)">&#8592;</button>' +
    '<b style="min-width:150px;text-align:center">' +
    escP(meseLbl) +
    '</b>' +
    '<button class="btn-export" style="padding:2px 10px;font-size:.9rem" title="Mese successivo" onclick="pianoCambiaMese(1)">&#8594;</button></span>' +
    '<input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-crediti-table\')">' +
    '<button class="btn-export" style="font-size:.8rem;padding:4px 12px" onclick="pianoCaricaSaldoAnno()">' +
    (saldoPronto ? 'Ricalcola saldo ore' : 'Calcola saldo ore ' + anno) +
    '</button>' +
    '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;margin-left:auto" onclick="pianoCreditiStampa()">Stampa</button>' +
    '</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Per ogni collaboratore quello che gli resta o che deve recuperare. <b>Vacanze</b>: giorni spettanti nell anno meno le settimane registrate, piu i giorni restituiti per malattia (scheda Vacanze). <b>CGF</b>: recuperi festivi maturati e goduti fino alla fine di ' +
    escP(meseLbl) +
    ', mai i mesi futuri (scheda Festivi). <b>Saldo ore</b>: riporto piu i mesi dell anno, positivo = ore in piu fatte, negativo = ore da fare (scheda Saldo; va calcolato con il pulsante). <b>Recupero</b>: scostamenti del mese aperto (scheda Recupero ore). <b>Congedo NP</b>: giorni di congedo non pagato nell anno. Clic sulla riga per il dettaglio.</p>';
  h +=
    '<div style="overflow:auto;max-height:72vh"><table id="piano-crediti-table" class="piano-table" style="min-width:1100px;font-size:.82rem"><thead><tr>' +
    '<th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th>' +
    '<th title="Giorni di vacanza dell anno secondo anzianita">Vacanze spettanti</th><th title="Giorni delle settimane registrate">Pianificate</th><th title="Giorni V coperti da malattia, tornati disponibili">Restituite</th><th>Vacanze restano</th>' +
    '<th title="Riporto dall anno prima">CGF riporto</th><th>CGF maturati</th><th>CGF goduti</th><th>CGF restano</th>' +
    '<th title="Riporto piu i mesi dell anno">Saldo ore ' +
    anno +
    '</th><th title="Scostamenti del mese aperto">Recupero mese</th><th>Congedo NP</th></tr></thead><tbody>';
  dati.forEach((d, i) => {
    h +=
      '<tr data-nome="' +
      escP(d.nome) +
      '" style="cursor:pointer" onclick="pianoCreditiDettaglio(' +
      i +
      ')"><td style="text-align:left;font-weight:600">' +
      escP(d.nome) +
      (d.senzaData
        ? ' <span title="Manca la data di assunzione: vacanze non calcolabili" style="color:#c0392b">*</span>'
        : '') +
      '</td><td>' +
      escP(d.funzione) +
      '</td><td>' +
      (d.pct == null ? '-' : d.pct + '%') +
      '</td>' +
      _pianoCreditiNum(d.vac ? d.vac.spett : null) +
      _pianoCreditiNum(d.vac ? d.vac.pian : null) +
      _pianoCreditiNum(d.vac ? d.vac.rest || null : null) +
      _pianoCreditiNum(d.vac ? d.vac.resta : null, '', true) +
      _pianoCreditiNum(d.cgf ? d.cgf.rip : null) +
      _pianoCreditiNum(d.cgf ? d.cgf.mat : null) +
      _pianoCreditiNum(d.cgf ? d.cgf.god : null) +
      _pianoCreditiNum(d.cgf ? d.cgf.resta : null, '', true) +
      (d.jolly
        ? '<td style="color:var(--muted)">-</td>'
        : saldoPronto
          ? _pianoCreditiNum(d.saldoOre, ' h', true)
          : '<td style="color:var(--muted)" title="Premi Calcola saldo ore">da calcolare</td>') +
      _pianoCreditiNum(d.recMese == null ? null : d.recMese, ' h', true) +
      _pianoCreditiNum(d.cnp || null, ' gg') +
      '</tr>';
  });
  h += '</tbody></table></div>';
  if (!dati.length) h += '<p style="color:var(--muted);padding:10px 0">Nessun collaboratore in questo settore.</p>';
  h += '</div></div>';
  window._pianoCreditiUltimi = { anno: anno, dati: dati, meseLbl: meseLbl };
  return h;
}
function pianoCreditiDettaglio(i) {
  const u = window._pianoCreditiUltimi;
  const d = u && u.dati[i];
  if (!d) return;
  const righe = [];
  if (d.vac)
    righe.push(
      'Vacanze ' +
        u.anno +
        ': spettano ' +
        d.vac.spett +
        ' giorni, registrate ' +
        d.vac.pian +
        (d.vac.rest ? ', restituite per malattia ' + d.vac.rest : '') +
        ' → restano ' +
        d.vac.resta +
        ' (scheda Vacanze).',
    );
  else if (d.senzaData) righe.push('Vacanze: manca la data di assunzione nella scheda del collaboratore.');
  else if (d.jolly) righe.push('Ausiliario: niente giorni di vacanza fissi ne saldo ore (RAP Allegato 1).');
  if (d.cgf)
    righe.push(
      'CGF fino a ' +
        u.meseLbl +
        ': riporto ' +
        d.cgf.rip +
        ', maturati ' +
        d.cgf.mat +
        ', goduti ' +
        d.cgf.god +
        (d.cgf.persi ? ', caduti in malattia ' + d.cgf.persi : '') +
        ' → restano ' +
        d.cgf.resta +
        ' (scheda Festivi).',
    );
  if (d.saldoOre != null)
    righe.push('Saldo ore ' + u.anno + ': ' + d.saldoOre + ' h, riporto piu i mesi con un piano (scheda Saldo).');
  if (d.recMese != null)
    righe.push('Recupero ore di ' + u.meseLbl + ': ' + d.recMese + ' h di scostamenti (scheda Recupero ore).');
  if (d.cnp)
    righe.push(
      'Congedo non pagato nell anno: ' + d.cnp + ' giorni (scheda Impostazioni del Piano, Congedi non pagati).',
    );
  alert(d.nome + '\n\n' + righe.join('\n\n'));
}
function pianoCreditiStampa() {
  const t = document.getElementById('piano-crediti-table');
  const u = window._pianoCreditiUltimi;
  if (!t || !u) return;
  const w = window.open('', '_blank');
  if (!w) {
    toastErrore('Finestra bloccata dal browser: consenti i popup');
    return;
  }
  w.document.write(
    '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Crediti ' +
      u.anno +
      '</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Georgia,serif;font-size:11px;color:#000;margin:0}h1{font-size:15px;margin:0 0 4px}p{margin:0 0 8px;color:#333}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:3px 5px;text-align:center}th{background:#eee}td:first-child{text-align:left;font-weight:700}</style></head><body><h1>Crediti ' +
      u.anno +
      ' · ' +
      escP(repartoLabel(_pianoReparto())) +
      '</h1><p>CGF e recupero fino a ' +
      escP(u.meseLbl) +
      ' · stampato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' da ' +
      escP(getOperatore() || '') +
      '</p>' +
      t.outerHTML.replace(/ style="[^"]*"/g, '').replace(/ onclick="[^"]*"/g, '') +
      '</body></html>',
  );
  w.document.close();
  setTimeout(() => w.print(), 300);
}
// riga di riepilogo nella scheda del collaboratore
async function _pianoCreditiScheda(nome) {
  const el = document.getElementById('collab-crediti');
  if (!el) return;
  try {
    const anno = new Date().getFullYear();
    const d = (await _pianoCreditiDati(anno, [nome]))[0];
    if (!d) return;
    const parti = [];
    if (d.vac)
      parti.push(
        'vacanze ' +
          anno +
          ': restano <b>' +
          d.vac.resta +
          '</b> giorni' +
          (d.vac.rest ? ' (' + d.vac.rest + ' restituiti per malattia)' : ''),
      );
    if (d.cgf) parti.push('CGF: restano <b>' + d.cgf.resta + '</b>');
    if (d.saldoOre != null) parti.push('saldo ore: <b>' + d.saldoOre + ' h</b>');
    if (d.cnp) parti.push('congedo non pagato: ' + d.cnp + ' giorni');
    el.innerHTML = parti.length
      ? 'Crediti: ' +
        parti.join(' · ') +
        ' <span style="color:var(--muted)">(dettaglio nella scheda Crediti del Piano)</span>'
      : '';
  } catch (e) {
    el.innerHTML = '';
  }
}
