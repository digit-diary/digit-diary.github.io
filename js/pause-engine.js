// ============================================================
// MOTORE PAUSE — port 1:1 dai file Excel di Musa:
//  - Slots: ModuloPause_v8c (BG1/Q2/BG3, pattern LUN-GIO / VEN-SAB /
//    DOM, C8 con CD, R30, pause extra) su "foglio virtuale" a 8
//    colonne identico all'output Excel.
//  - Valet: ModuloPauseValet v2 (algoritmico: durate per fascia,
//    gap 45', una-alla-volta, ven/sab evita 23-01).
// Le competenze S/R/C arrivano dai settori effettivi (Formazione),
// gli orari dei turni da piano_turni. Output editabile, salvato in
// piano_briefing (sezione 'pause').
// ============================================================

// ---------- util orari ----------
function _peOraMin(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
function _peMinToOra(min) {
  let m = min;
  while (m >= 1440) m -= 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(Math.round(m) % 60).padStart(2, '0');
}
function _peOrarioPunti(s) {
  // "20:00" -> "20.00"
  return _briefOrarioHM(s).replace(':', '.');
}
// mappa codice turno -> orari (da piano_turni del reparto corrente)
function _peOrariTurni() {
  const d = {};
  _pianoTurniReparto().forEach((t) => {
    if (!t.ora_inizio || !t.ora_fine) return;
    const a = _peOraMin(t.ora_inizio);
    let b = _peOraMin(t.ora_fine);
    if (a == null || b == null) return;
    if (b <= a) b += 1440;
    d[t.codice] = {
      ini: a,
      fin: b,
      iniStr: _peOrarioPunti(t.ora_inizio),
      finStr: _peOrarioPunti(t.ora_fine),
      dur: b - a,
    };
  });
  return d;
}
function _peDurataMin(orari, turno) {
  return orari[turno] ? orari[turno].dur : 0;
}
// regola pause slots (personalizzabile in futuro): <6h 0', 6-7h 30', 7-9h 45', 9h+ 60'
function _briefPauseCfg() {
  return window._briefPauseCfgObj || {};
}
// composizione pause di un turno: personalizzata per turno (es. "15+15")
// oppure default dalla fascia di durata
function _pePauseSplit(orari, turno) {
  const cfg = _briefPauseCfg();
  const pers = cfg.turni && cfg.turni[String(turno).toUpperCase()];
  if (pers) {
    const arr = String(pers)
      .split(/[+,;\s]+/)
      .map((x) => parseInt(x))
      .filter((x) => x > 0);
    if (arr.length) return arr;
    return []; // "0" o "-" = nessuna pausa
  }
  const dur = _peDurataMin(orari, turno);
  if (dur < 360) return [];
  const tot =
    dur < 420 ? parseInt(cfg.slots_6h) || 30 : dur < 540 ? parseInt(cfg.slots_7h) || 45 : parseInt(cfg.slots_9h) || 60;
  if (tot <= 30) return [15, 15];
  if (tot <= 45) return [30, 15];
  return [30, 15, 15];
}
function _peMinutiPausa(orari, turno) {
  return _pePauseSplit(orari, turno).reduce((a, b) => a + b, 0);
}
function _peSettoreTurno(t) {
  const c = String(t || '').toUpperCase()[0];
  return c === 'S' || c === 'R' || c === 'C' ? c : '';
}

// ---------- competenze (dai settori effettivi della Formazione) ----------
// lettere: S=sala, R=reception (esclusa se in accompagnamento), C=cassa
function _peCompetenze(righe) {
  const d = {};
  (righe || []).forEach((r) => {
    if (!r.nome) return;
    const info = r.nomeFull ? _pianoCollabInfo(r.nomeFull) : null;
    if (!info) return;
    let sett = [];
    try {
      sett = typeof _pianoSettoriEffettivi === 'function' ? _pianoSettoriEffettivi(info) || [] : [];
    } catch (e) {}
    let acc = [];
    try {
      acc = Array.isArray(info.accompagnamento_settori)
        ? info.accompagnamento_settori
        : JSON.parse(info.accompagnamento_settori || '[]');
    } catch (e) {}
    let comp = '';
    if (sett.includes('SALA') || sett.includes('BO') || sett.includes('SUP')) comp += 'S';
    if ((sett.includes('REC') || sett.includes('BO') || sett.includes('SUP')) && !acc.includes('REC')) comp += 'R';
    if (sett.includes('CASSA') || sett.includes('BO') || sett.includes('SUP')) comp += 'C';
    d[r.nome.toUpperCase().trim()] = comp;
  });
  return d;
}
function _pePuoCoprire(dc, bg, pos) {
  if (!dc || !Object.keys(dc).length || !bg) return true;
  let sett = '';
  const u = String(pos || '').toUpperCase();
  if (u === 'CASSA' || u[0] === 'C') sett = 'C';
  else if (u === 'REC' || u[0] === 'R') sett = 'R';
  else if (u === 'SALA' || u[0] === 'S') sett = 'S';
  else return true;
  const bgU = bg.toUpperCase().trim();
  if (dc[bgU] !== undefined) return dc[bgU].includes(sett);
  const k = Object.keys(dc).find((x) => x.includes(bgU) || bgU.includes(x));
  if (k) return dc[k].includes(sett);
  const bgFirst = bgU.split(' ')[0];
  const k2 = Object.keys(dc).find((x) => x.split(' ')[0] === bgFirst);
  if (k2) return dc[k2].includes(sett);
  return true;
}

// ---------- foglio virtuale (stessa vista dell'Excel) ----------
const _PE_CLR = {
  giallo: '#FFFF00',
  cassa: '#FFE0B2',
  rec: '#E1D2FF',
  sala: '#C8F0C8',
  rosso: '#FF5050',
  arancio: '#FFC864',
  venerdi: '#92D050',
  domenica: '#00B0F0',
  verdeScuro: '#00B050',
  azzurro: '#00B0F0',
  c23: '#FFC800',
  grigio: '#DCDCDC',
};
function _peColoreSettore(pos) {
  const u = String(pos || '').toUpperCase();
  if (['C0', 'C23', 'C4', 'C5', 'C15', 'C20', 'C8', 'CASSA'].includes(u)) return _PE_CLR.cassa;
  if (['R22', 'R23', 'R24', 'R8', 'R7C', 'R4', 'R30', 'R31', 'REC'].includes(u)) return _PE_CLR.rec;
  if (['S22', 'S5', 'S7', 'S8', 'S7C', 'S8C', 'S3', 'S31', 'S25', 'SALA', 'S1'].includes(u)) return _PE_CLR.sala;
  if (u === 'PAUSA') return _PE_CLR.giallo;
  return '';
}
function _peSheet() {
  return { celle: {}, merge: {} };
}
function _peSet(sh, r, c, v, opts) {
  sh.celle[r + '|' + c] = Object.assign({ v: v }, opts || {});
}
function _peGet(sh, r, c) {
  return sh.celle[r + '|' + c] || null;
}
function _peMaxR(sh) {
  let max = 1;
  Object.keys(sh.celle).forEach((k) => {
    const r = parseInt(k.split('|')[0]);
    if (sh.celle[k].v !== '' && sh.celle[k].v != null && r > max) max = r;
  });
  return max;
}
function _peSS(sh, r, c, pos, orario) {
  const clr = _peColoreSettore(pos);
  _peSet(sh, r, c, pos, { b: 1, bg: clr, sz: 9 });
  _peSet(sh, r, c + 1, orario, { b: 1, bg: clr, sz: 9 });
  return r + 1;
}
function _peWarn(sh, r, c, orario) {
  const a = _peGet(sh, r, c);
  const b = _peGet(sh, r, c + 1);
  if (a) {
    a.bg = _PE_CLR.rosso;
    a.fg = '#fff';
  }
  if (b) {
    b.bg = _PE_CLR.rosso;
    b.fg = '#fff';
    b.v = orario + '  [!]';
  }
}
function _peSPP(sh, ctx, r, c, pos, orario, bg) {
  if (ctx.dT[pos]) {
    const nr = _peSS(sh, r, c, pos, orario);
    if (!_pePuoCoprire(ctx.dc, bg, pos)) _peWarn(sh, r, c, orario);
    return nr;
  }
  return _peSS(sh, r, c, 'SALA', orario);
}
function _peSPPC(sh, ctx, r, c, pos, orario, bg) {
  if (ctx.dT[pos]) {
    const nr = _peSS(sh, r, c, pos, orario);
    if (!_pePuoCoprire(ctx.dc, bg, pos)) _peWarn(sh, r, c, orario);
    return nr;
  }
  return _peSS(sh, r, c, 'CASSA', orario);
}
function _peSN(sh, ctx, r, c, pos, orario, nome, bg) {
  if (!nome) return _peSS(sh, r, c, 'SALA', orario);
  const nr = _peSS(sh, r, c, pos, orario);
  if (bg && !_pePuoCoprire(ctx.dc, bg, pos)) _peWarn(sh, r, c, orario);
  return nr;
}
function _peScrTitolo(sh, titolo, dataStr, sotto, clr) {
  _peSet(sh, 1, 1, titolo, { b: 1, bg: clr, sz: 12, span: 8, center: 1 });
  _peSet(sh, 2, 1, dataStr, { sz: 9 });
  _peSet(sh, 3, 1, sotto, { b: 1, bg: clr, sz: 10, span: 8, center: 1 });
}
function _peScrHeader(sh, r, c, turno, nome, orario, clr) {
  _peSet(sh, r, c, turno, { b: 1, bg: clr, sz: 10, hdr: 1 });
  _peSet(sh, r, c + 1, nome, { b: 1, bg: clr, sz: 9, hdr: 1 });
  _peSet(sh, r + 1, c + 1, orario, { b: 1, sz: 9, ora: 1 });
}
function _peGPN(dT, turno) {
  const l = dT[turno];
  return l && l.length ? l[0] : '';
}
function _peConta(dT, turno) {
  return dT[turno] ? dT[turno].length : 0;
}

// ---------- BG1 / BG3 (cascate identiche al VBA) ----------
function _pePuoBG1(ctx, nome) {
  return _pePuoCoprire(ctx.dc, nome, 'S22') && _pePuoCoprire(ctx.dc, nome, 'R22') && _pePuoCoprire(ctx.dc, nome, 'C0');
}
function _pePuoBG3(ctx, nome) {
  return _pePuoCoprire(ctx.dc, nome, 'S3') && _pePuoCoprire(ctx.dc, nome, 'R23');
}
function _peTrovaBG1(ctx) {
  const dT = ctx.dT;
  let out = { nBG1: '', lblBG1: '???', orBG1: '', isS22: false };
  if (dT['S1']) {
    const cand = _peGPN(dT, 'S1');
    if (_pePuoBG1(ctx, cand)) return { nBG1: cand, lblBG1: 'S1', orBG1: '14.00 - 21.00', isS22: false };
  }
  if (dT['S22']) {
    const cand = _peGPN(dT, 'S22');
    if (_pePuoBG1(ctx, cand)) return { nBG1: cand, lblBG1: 'S22', orBG1: '11.40 - 20.00', isS22: true };
  }
  if (dT['S1']) out = { nBG1: _peGPN(dT, 'S1'), lblBG1: 'S1', orBG1: '14.00 - 21.00', isS22: false };
  else if (dT['S22']) out = { nBG1: _peGPN(dT, 'S22'), lblBG1: 'S22', orBG1: '11.40 - 20.00', isS22: true };
  return out;
}
function _peTrovaBG3(ctx) {
  const dT = ctx.dT;
  const nS7 = _peGPN(dT, 'S7');
  const setRec = (o) => {
    if (nS7 && !_pePuoCoprire(ctx.dc, o.nBG3, 'R23')) o.bgRec = nS7;
    else o.bgRec = o.nBG3;
    o.nS7 = nS7;
    return o;
  };
  let cand;
  if (dT['S7C']) {
    cand = _peGPN(dT, 'S7C');
    if (_pePuoBG3(ctx, cand)) return setRec({ nBG3: cand, lblBG3: 'S7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  }
  if (dT['R7C']) {
    cand = _peGPN(dT, 'R7C');
    if (_pePuoBG3(ctx, cand)) return setRec({ nBG3: cand, lblBG3: 'R7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  }
  if (dT['S8C']) {
    cand = _peGPN(dT, 'S8C');
    if (_pePuoBG3(ctx, cand)) return { nBG3: cand, lblBG3: 'S8C', orBG3: '20.50 - 04.10', bgRec: cand, nS7: nS7 };
  }
  if (dT['S5']) {
    cand = _peGPN(dT, 'S5');
    if (_pePuoBG3(ctx, cand)) return { nBG3: cand, lblBG3: 'S5', orBG3: '17.00 - 02.00', bgRec: cand, nS7: nS7 };
  }
  if (dT['S7']) {
    for (let i = 0; i < dT['S7'].length; i++) {
      const n = dT['S7'][i].trim();
      if (_pePuoBG3(ctx, n)) return { nBG3: n, lblBG3: 'S7', orBG3: '19.50 - 04.00', bgRec: n, nS7: n };
    }
  }
  // secondario: S7C/R7C/S7 in sala (senza REC) prima di S31
  if (dT['S7C']) {
    cand = _peGPN(dT, 'S7C');
    if (_pePuoCoprire(ctx.dc, cand, 'S3'))
      return setRec({ nBG3: cand, lblBG3: 'S7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  }
  if (dT['R7C']) {
    cand = _peGPN(dT, 'R7C');
    if (_pePuoCoprire(ctx.dc, cand, 'S3'))
      return setRec({ nBG3: cand, lblBG3: 'R7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  }
  if (dT['S7'] && _pePuoCoprire(ctx.dc, nS7, 'S3'))
    return setRec({ nBG3: nS7, lblBG3: 'S7', orBG3: '19.50 - 04.00', nS7: nS7 });
  if (dT['S31']) {
    cand = _peGPN(dT, 'S31');
    if (_pePuoBG3(ctx, cand)) return { nBG3: cand, lblBG3: 'S31', orBG3: '16.00 - 01.00', bgRec: cand, nS7: nS7 };
  }
  // fallback senza controllo competenze
  if (dT['S7C']) return setRec({ nBG3: _peGPN(dT, 'S7C'), lblBG3: 'S7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  if (dT['R7C']) return setRec({ nBG3: _peGPN(dT, 'R7C'), lblBG3: 'R7C', orBG3: '19.50 - 02.00', nS7: nS7 });
  if (dT['S8C'])
    return { nBG3: _peGPN(dT, 'S8C'), lblBG3: 'S8C', orBG3: '20.50 - 04.10', bgRec: _peGPN(dT, 'S8C'), nS7: nS7 };
  if (dT['S5'] && _pePuoBG3(ctx, _peGPN(dT, 'S5')))
    return { nBG3: _peGPN(dT, 'S5'), lblBG3: 'S5', orBG3: '17.00 - 02.00', bgRec: _peGPN(dT, 'S5'), nS7: nS7 };
  if (dT['S7']) return { nBG3: nS7, lblBG3: 'S7', orBG3: '19.50 - 04.00', bgRec: nS7, nS7: nS7 };
  if (dT['S5'])
    return { nBG3: _peGPN(dT, 'S5'), lblBG3: 'S5', orBG3: '17.00 - 02.00', bgRec: _peGPN(dT, 'S5'), nS7: nS7 };
  if (dT['S31'])
    return { nBG3: _peGPN(dT, 'S31'), lblBG3: 'S31', orBG3: '16.00 - 01.00', bgRec: _peGPN(dT, 'S31'), nS7: nS7 };
  return { nBG3: '', lblBG3: '???', orBG3: '', bgRec: '', nS7: nS7 };
}
function _peCalcolaBgCassa(bg1FaCassa, s22FaCassa, nS22, nC23bg) {
  if (bg1FaCassa) return 'S1';
  if (s22FaCassa && nS22) return 'S22';
  if (nC23bg) return 'C23';
  return '';
}

// ---------- pattern (port riga per riga dal VBA) ----------
function _pePatternS22(sh, ctx, col, nBG1, numS22) {
  numS22 = numS22 || 1;
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '12.00 - 13.00');
  r = _peSS(sh, r, col, 'PAUSA', '13.00 - 13.30');
  if (numS22 >= 2) r = _peSPP(sh, ctx, r, col, 'S22', '13.30 - 14.00', nBG1);
  else r = _peSS(sh, r, col, 'SALA', '13.30 - 14.00');
  r = _peSPP(sh, ctx, r, col, 'C0', '14.00 - 14.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '14.30 - 15.00', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.00 - 15.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.15 - 15.30', nBG1);
  r = _peSS(sh, r, col, 'PAUSA', '15.30 - 15.45');
  r = _peSS(sh, r, col, 'SALA', '15.45 - 16.00');
  if (numS22 >= 2) r = _peSPP(sh, ctx, r, col, 'S22', '16.00 - 16.15', nBG1);
  else r = _peSPP(sh, ctx, r, col, 'S1', '16.00 - 16.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C4', '16.15 - 16.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C0', '16.30 - 16.45', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '16.45 - 17.00', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '17.00 - 17.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '17.15 - 17.30', nBG1);
  if (numS22 >= 2) {
    r = _peSS(sh, r, col, 'PAUSA', '17.30 - 17.45');
    r = _peSPP(sh, ctx, r, col, 'S22', '17.45 - 18.00', nBG1);
  } else {
    r = _peSS(sh, r, col, 'SALA', '17.30 - 17.45');
    r = _peSS(sh, r, col, 'PAUSA', '17.45 - 18.00');
  }
  r = _peSPP(sh, ctx, r, col, 'C4', '18.00 - 18.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C0', '18.15 - 18.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '18.30 - 18.45', nBG1);
  r = _peSPP(sh, ctx, r, col, 'S5', '18.45 - 19.00', nBG1);
  r = _peSS(sh, r, col, 'SALA', '19.00 - 20.00');
}
function _pePatternS3(sh, ctx, col, nS3, hasR24, bg3FaRec) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '20.00 - 20.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '20.30 - 21.00', nS3);
  r = _peSPP(sh, ctx, r, col, 'C5', '21.00 - 21.30', nS3);
  r = _peSPP(sh, ctx, r, col, 'C20', '21.30 - 22.00', nS3);
  if (hasR24) {
    if (bg3FaRec) {
      r = _peSS(sh, r, col, 'SALA', '22.00 - 22.45');
      r = _peSS(sh, r, col, 'PAUSA', '22.45 - 23.00');
      r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
    } else {
      r = _peSS(sh, r, col, 'SALA', '22.00 - 22.15');
      r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', nS3);
      r = _peSS(sh, r, col, 'PAUSA', '22.45 - 23.00');
      r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', nS3);
      r = _peSS(sh, r, col, 'SALA', '23.15 - 23.30');
    }
    r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nS3);
    r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nS3);
    r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
    r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nS3);
    if (bg3FaRec) {
      r = _peSS(sh, r, col, 'SALA', '24.30 - 01.30');
    } else {
      r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', nS3);
      r = _peSS(sh, r, col, 'SALA', '24.45 - 01.15');
      r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', nS3);
    }
    r = _peSPP(sh, ctx, r, col, 'C15', '01.30 - 01.45', nS3);
    r = _peSPP(sh, ctx, r, col, 'C5', '01.45 - 02.00', nS3);
  } else {
    if (bg3FaRec) {
      r = _peSS(sh, r, col, 'SALA', '22.00 - 22.15');
      r = _peSS(sh, r, col, 'PAUSA', '22.15 - 22.30');
      r = _peSS(sh, r, col, 'SALA', '22.30 - 23.30');
      r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nS3);
      r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nS3);
      r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
      r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nS3);
      r = _peSS(sh, r, col, 'SALA', '24.30 - 01.30');
    } else {
      r = _peSS(sh, r, col, 'SALA', '22.00 - 22.15');
      r = _peSS(sh, r, col, 'PAUSA', '22.15 - 22.30');
      r = _peSPP(sh, ctx, r, col, 'R23', '22.30 - 22.45', nS3);
      r = _peSS(sh, r, col, 'SALA', '22.45 - 23.30');
      r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nS3);
      r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nS3);
      r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
      r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nS3);
      r = _peSPP(sh, ctx, r, col, 'R23', '24.30 - 24.45', nS3);
      r = _peSS(sh, r, col, 'SALA', '24.45 - 01.30');
    }
    r = _peSPP(sh, ctx, r, col, 'C15', '01.30 - 01.45', nS3);
    r = _peSPP(sh, ctx, r, col, 'C5', '01.45 - 02.00', nS3);
  }
}
function _pePatternS7_Q2(sh, ctx, col, nQ2) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '20.00 - 20.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '20.30 - 21.00', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '21.00 - 21.30', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '21.30 - 22.00');
  r = _peSPP(sh, ctx, r, col, 'C20', '22.00 - 22.30', nQ2);
  r = _peSS(sh, r, col, 'SALA', '22.30 - 23.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
  r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nQ2);
  r = _peSS(sh, r, col, 'SALA', '24.30 - 01.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '01.30 - 01.45', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '01.45 - 02.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '02.00 - 02.15');
  r = _peSS(sh, r, col, 'SALA', '02.15 - 04.00');
}
function _pePatternS8C_Q2(sh, ctx, col, nQ2) {
  let r = 7;
  r = _peSPP(sh, ctx, r, col, 'C15', '21.00 - 21.30', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '21.30 - 22.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.30');
  r = _peSPP(sh, ctx, r, col, 'C20', '22.30 - 23.00', nQ2);
  r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
  r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nQ2);
  r = _peSS(sh, r, col, 'SALA', '24.30 - 01.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '01.30 - 01.45', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '01.45 - 02.00', nQ2);
  r = _peSS(sh, r, col, 'SALA', '02.00 - 04.10');
}
function _pePatternS31_Q2(sh, ctx, col, nQ2) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '16.00 - 18.00');
  r = _peSS(sh, r, col, 'PAUSA', '18.00 - 18.30');
  r = _peSS(sh, r, col, 'SALA', '18.30 - 20.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '20.30 - 21.00', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '21.00 - 21.30', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C20', '21.30 - 22.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.15');
  r = _peSS(sh, r, col, 'SALA', '22.15 - 23.30');
  r = _peSPP(sh, ctx, r, col, 'C15', '23.30 - 23.45', nQ2);
  r = _peSPP(sh, ctx, r, col, 'C5', '23.45 - 24.00', nQ2);
  r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
  r = _peSPP(sh, ctx, r, col, 'C20', '24.15 - 24.30', nQ2);
  r = _peSS(sh, r, col, 'SALA', '24.30 - 01.00');
}
function _pePatternBG3_S7C(
  sh,
  ctx,
  col,
  nBG3,
  bgRec,
  nS3,
  haS7C,
  bg3DaR23Sera,
  s7InQ2,
  c20InQ2,
  hasR24,
  bg3FaRec,
  numS7,
) {
  let r = 7;
  if (haS7C) {
    if (numS7 >= 2) {
      r = _peSS(sh, r, col, 'SALA', '20.00 - 21.00');
      r = _peSPP(sh, ctx, r, col, 'S7', '21.00 - 21.30', nBG3);
      r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
      r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.15');
      if (hasR24) {
        if (bg3FaRec) {
          r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
          r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
          r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
          r = _peSS(sh, r, col, 'SALA', '23.15 - 23.30');
        } else {
          r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
          r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
          r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
        }
        r = _peSPP(sh, ctx, r, col, 'S7', '23.30 - 23.45', nBG3);
        r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
        r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
      } else {
        r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
        r = _peSS(sh, r, col, 'SALA', '22.30 - 22.45');
        if (bg3FaRec) {
          r = _peSPP(sh, ctx, r, col, 'R23', '22.45 - 23.00', bgRec);
          r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
          r = _peSS(sh, r, col, 'SALA', '23.15 - 23.30');
        } else {
          r = _peSS(sh, r, col, 'SALA', '22.45 - 23.30');
        }
        r = _peSPP(sh, ctx, r, col, 'S7', '23.30 - 23.45', nBG3);
        r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
        r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
      }
      r = _peSS(sh, r, col, 'PAUSA', '24.15 - 24.30');
      if (hasR24 && bg3FaRec) {
        r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', bgRec);
        r = _peSS(sh, r, col, 'SALA', '24.45 - 01.15');
        r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', bgRec);
      } else {
        r = _peSS(sh, r, col, 'SALA', '24.30 - 01.30');
      }
      r = _peSPP(sh, ctx, r, col, 'S7', '01.30 - 01.45', nBG3);
      r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
    } else {
      if (bg3DaR23Sera && bg3FaRec) {
        r = _peSPP(sh, ctx, r, col, 'R23', '20.00 - 20.30', nBG3);
        r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG3);
        r = _peSS(sh, r, col, 'SALA', '21.00 - 21.30');
      } else {
        r = _peSS(sh, r, col, 'SALA', '20.00 - 21.30');
      }
      r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
      r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.15');
      if (hasR24) {
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
        r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
        r = _peSS(sh, r, col, 'SALA', '23.15 - 23.45');
        if (s7InQ2) {
          r = _peSS(sh, r, col, 'SALA', '23.45 - 24.00');
          r = _peSPP(sh, ctx, r, col, 'S7', '24.00 - 24.15', nBG3);
        } else if (c20InQ2) {
          r = _peSS(sh, r, col, 'SALA', '23.45 - 24.15');
        } else {
          r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
          r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
        }
        r = _peSS(sh, r, col, 'PAUSA', '24.15 - 24.30');
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '24.30 - 24.45');
        r = _peSS(sh, r, col, 'SALA', '24.45 - 01.30');
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '01.30 - 01.45');
        if (s7InQ2 || c20InQ2) r = _peSS(sh, r, col, 'SALA', '01.45 - 02.00');
        else r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
      } else {
        if (c20InQ2) {
          r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
        } else {
          r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
          r = _peSS(sh, r, col, 'SALA', '22.30 - 23.00');
        }
        if (bg3FaRec) {
          r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
          r = _peSPP(sh, ctx, r, col, 'R23', '23.15 - 23.30', bgRec);
        } else {
          r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
        }
        r = _peSS(sh, r, col, 'SALA', '23.30 - 23.45');
        if (s7InQ2) {
          r = _peSS(sh, r, col, 'SALA', '23.45 - 24.00');
          r = _peSPP(sh, ctx, r, col, 'S7', '24.00 - 24.15', nBG3);
        } else if (c20InQ2) {
          r = _peSS(sh, r, col, 'SALA', '23.45 - 24.15');
        } else {
          r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
          r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
        }
        r = _peSS(sh, r, col, 'PAUSA', '24.15 - 24.30');
        r = _peSS(sh, r, col, 'SALA', '24.30 - 01.15');
        if (bg3FaRec) {
          r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', bgRec);
          r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
        } else {
          r = _peSS(sh, r, col, 'SALA', '01.15 - 01.45');
        }
        if (s7InQ2 || c20InQ2) r = _peSS(sh, r, col, 'SALA', '01.45 - 02.00');
        else r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
      }
    }
  } else {
    // BG3 è S7 stesso
    let salaBreakLbl = '';
    if (ctx.dT['S7C']) salaBreakLbl = 'S7C';
    else if (ctx.dT['S5']) salaBreakLbl = 'S5';
    if (numS7 >= 2) {
      r = _peSS(sh, r, col, 'SALA', '20.00 - 21.00');
      r = _peSS(sh, r, col, 'PAUSA', '21.00 - 21.30');
      r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
    } else if (bg3DaR23Sera && bg3FaRec) {
      r = _peSPP(sh, ctx, r, col, 'R23', '20.00 - 20.30', nBG3);
      r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG3);
      r = _peSS(sh, r, col, 'SALA', '21.00 - 21.30');
      r = _peSS(sh, r, col, 'PAUSA', '21.30 - 22.00');
    } else {
      r = _peSS(sh, r, col, 'SALA', '20.00 - 21.30');
      r = _peSS(sh, r, col, 'PAUSA', '21.30 - 22.00');
    }
    r = _peSPP(sh, ctx, r, col, salaBreakLbl, '22.00 - 22.15', nBG3);
    if (hasR24) {
      if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
      else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
      r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
      if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
      else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
      r = _peSS(sh, r, col, 'SALA', '23.15 - 23.45');
    } else {
      r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
      r = _peSS(sh, r, col, 'SALA', '22.30 - 23.00');
      if (bg3FaRec) {
        r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
        r = _peSPP(sh, ctx, r, col, 'R23', '23.15 - 23.30', bgRec);
      } else {
        r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
      }
      r = _peSS(sh, r, col, 'SALA', '23.30 - 23.45');
    }
    r = _peSS(sh, r, col, 'PAUSA', '23.45 - 24.00');
    r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
    if (numS7 >= 2) {
      r = _peSPP(sh, ctx, r, col, 'S7', '24.15 - 24.30', nBG3);
      r = _peSPP(sh, ctx, r, col, salaBreakLbl, '24.30 - 24.45', nBG3);
      if (hasR24 && bg3FaRec) {
        r = _peSPP(sh, ctx, r, col, 'R24', '24.45 - 01.15', bgRec);
        r = _peSS(sh, r, col, 'SALA', '01.15 - 01.30');
        r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
      } else if (bg3FaRec) {
        r = _peSS(sh, r, col, 'SALA', '24.45 - 01.30');
        r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
      } else {
        r = _peSS(sh, r, col, 'SALA', '24.45 - 01.45');
      }
      r = _peSS(sh, r, col, 'PAUSA', '01.45 - 02.00');
      r = _peSPP(sh, ctx, r, col, 'S7', '02.00 - 02.15', nBG3);
      r = _peSS(sh, r, col, 'SALA', '02.15 - 04.00');
    } else {
      r = _peSPP(sh, ctx, r, col, salaBreakLbl, '24.15 - 24.30', nBG3);
      if (hasR24 && bg3FaRec) {
        r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', bgRec);
        r = _peSS(sh, r, col, 'SALA', '24.45 - 01.30');
        r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
      } else if (bg3FaRec) {
        r = _peSS(sh, r, col, 'SALA', '24.30 - 01.15');
        r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', bgRec);
        r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
      } else {
        r = _peSS(sh, r, col, 'SALA', '24.30 - 01.45');
      }
      r = _peSS(sh, r, col, 'PAUSA', '01.45 - 02.00');
      r = _peSS(sh, r, col, 'SALA', '02.00 - 04.00');
    }
  }
}
function _pePatternBG3_S5(sh, ctx, col, nBG3, bgRec, nS3, bg3DaR23Sera, hasR24, s7InQ2, bg3FaRec) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '17.00 - 18.30');
  r = _peSS(sh, r, col, 'PAUSA', '18.30 - 19.00');
  if (bg3DaR23Sera && bg3FaRec) {
    r = _peSS(sh, r, col, 'SALA', '19.00 - 20.30');
    r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', bgRec);
    r = _peSS(sh, r, col, 'SALA', '21.00 - 21.30');
  } else {
    r = _peSS(sh, r, col, 'SALA', '19.00 - 21.30');
  }
  r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
  r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.15');
  if (hasR24) {
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
    else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
    r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
    else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
    r = _peSS(sh, r, col, 'SALA', '23.15 - 23.45');
    if (s7InQ2) {
      r = _peSS(sh, r, col, 'SALA', '23.45 - 24.00');
      r = _peSPP(sh, ctx, r, col, 'S7', '24.00 - 24.15', nBG3);
    } else {
      r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
      r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
    }
    r = _peSS(sh, r, col, 'PAUSA', '24.15 - 24.30');
    if (bg3FaRec) {
      r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', bgRec);
      r = _peSS(sh, r, col, 'SALA', '24.45 - 01.30');
      r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
    } else {
      r = _peSS(sh, r, col, 'SALA', '24.30 - 01.45');
    }
    if (s7InQ2) r = _peSS(sh, r, col, 'SALA', '01.45 - 02.00');
    else r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
  } else {
    r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
    r = _peSS(sh, r, col, 'SALA', '22.30 - 23.00');
    if (bg3FaRec) {
      r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
      r = _peSPP(sh, ctx, r, col, 'R23', '23.15 - 23.30', bgRec);
    } else {
      r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
    }
    r = _peSS(sh, r, col, 'SALA', '23.30 - 23.45');
    if (s7InQ2) {
      r = _peSS(sh, r, col, 'SALA', '23.45 - 24.00');
      r = _peSPP(sh, ctx, r, col, 'S7', '24.00 - 24.15', nBG3);
    } else {
      r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
      r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
    }
    r = _peSS(sh, r, col, 'PAUSA', '24.15 - 24.30');
    if (bg3FaRec) {
      r = _peSS(sh, r, col, 'SALA', '24.30 - 01.15');
      r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', bgRec);
      r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
    } else {
      r = _peSS(sh, r, col, 'SALA', '24.30 - 01.45');
    }
    if (s7InQ2) r = _peSS(sh, r, col, 'SALA', '01.45 - 02.00');
    else r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
  }
}
function _pePatternBG3_S3(sh, ctx, col, nBG3, bgRec, bg3DaR23Sera) {
  let r = 7;
  if (bg3DaR23Sera) {
    r = _peSPP(sh, ctx, r, col, 'R23', '20.00 - 20.30', nBG3);
    r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG3);
    r = _peSS(sh, r, col, 'SALA', '21.00 - 21.30');
  } else {
    r = _peSS(sh, r, col, 'SALA', '20.00 - 21.30');
  }
  r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
  r = _peSPP(sh, ctx, r, col, 'S7C', '22.00 - 22.15', nBG3);
  r = _peSS(sh, r, col, 'PAUSA', '22.15 - 22.30');
  r = _peSS(sh, r, col, 'SALA', '22.30 - 23.00');
  r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
  r = _peSPP(sh, ctx, r, col, 'R23', '23.15 - 23.30', bgRec);
  r = _peSS(sh, r, col, 'SALA', '23.30 - 23.45');
  r = _peSPP(sh, ctx, r, col, 'S7', '23.45 - 24.00', nBG3);
  r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
  r = _peSPP(sh, ctx, r, col, 'S7C', '24.15 - 24.30', nBG3);
  r = _peSS(sh, r, col, 'SALA', '24.30 - 01.15');
  r = _peSPP(sh, ctx, r, col, 'R23', '01.15 - 01.30', bgRec);
  r = _peSPP(sh, ctx, r, col, 'R23', '01.30 - 01.45', bgRec);
  r = _peSPP(sh, ctx, r, col, 'S7', '01.45 - 02.00', nBG3);
}
function _pePatternBG3_S8C(sh, ctx, col, nBG3) {
  let r = 7;
  r = _peSPP(sh, ctx, r, col, 'C5', '21.00 - 21.30', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C15', '21.30 - 22.00', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C20', '22.00 - 22.30', nBG3);
  r = _peSS(sh, r, col, 'PAUSA', '22.30 - 23.00');
  r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C15', '23.15 - 23.30', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C5', '23.30 - 23.45', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C20', '23.45 - 24.00', nBG3);
  r = _peSS(sh, r, col, 'SALA', '24.00 - 24.30');
  r = _peSS(sh, r, col, 'PAUSA', '24.30 - 24.45');
  r = _peSS(sh, r, col, 'SALA', '24.45 - 01.00');
  r = _peSPP(sh, ctx, r, col, 'R23', '01.00 - 01.15', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C15', '01.15 - 01.30', nBG3);
  r = _peSPP(sh, ctx, r, col, 'C5', '01.30 - 01.45', nBG3);
  r = _peSS(sh, r, col, 'PAUSA', '01.45 - 02.00');
  r = _peSS(sh, r, col, 'SALA', '02.00 - 04.00');
}
function _pePatternBG3_S31(sh, ctx, col, nBG3, nS3, hasR24, bg3FaRec) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '16.00 - 18.45');
  r = _peSS(sh, r, col, 'PAUSA', '18.45 - 19.00');
  r = _peSS(sh, r, col, 'SALA', '19.00 - 20.30');
  if (hasR24) {
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG3);
    else r = _peSS(sh, r, col, 'SALA', '20.30 - 21.00');
    r = _peSS(sh, r, col, 'PAUSA', '21.00 - 21.30');
    r = _peSPP(sh, ctx, r, col, 'S7', '21.30 - 22.00', nBG3);
    r = _peSS(sh, r, col, 'SALA', '22.00 - 22.15');
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', nBG3);
    else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
    r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', nBG3);
    else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
    r = _peSS(sh, r, col, 'SALA', '23.15 - 23.30');
    r = _peSS(sh, r, col, 'PAUSA', '23.30 - 23.45');
    r = _peSS(sh, r, col, 'SALA', '23.45 - 24.00');
    r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
    r = _peSS(sh, r, col, 'SALA', '24.15 - 24.30');
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '24.30 - 24.45', nBG3);
    else r = _peSS(sh, r, col, 'SALA', '24.30 - 24.45');
    r = _peSS(sh, r, col, 'SALA', '24.45 - 01.00');
  } else {
    if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG3);
    else r = _peSS(sh, r, col, 'SALA', '20.30 - 21.00');
    r = _peSS(sh, r, col, 'PAUSA', '21.00 - 21.30');
    r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
    r = _peSS(sh, r, col, 'PAUSA', '22.45 - 23.00');
    if (bg3FaRec) {
      r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', nBG3);
      r = _peSPP(sh, ctx, r, col, 'R23', '23.15 - 23.30', nBG3);
    } else {
      r = _peSS(sh, r, col, 'SALA', '23.00 - 23.30');
    }
    r = _peSS(sh, r, col, 'SALA', '23.30 - 23.45');
    r = _peSN(sh, ctx, r, col, 'S3', '24.00 - 24.15', nS3, nBG3);
    r = _peSS(sh, r, col, 'SALA', '24.15 - 01.00');
  }
}
function _pePatternS1_Dom(sh, ctx, col, nBG1) {
  let r = 7;
  r = _peSPP(sh, ctx, r, col, 'C0', '14.00 - 14.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '14.30 - 15.00', nBG1);
  r = _peSS(sh, r, col, 'SALA', '15.00 - 16.00');
  r = _peSS(sh, r, col, 'PAUSA', '16.00 - 16.15');
  r = _peSPP(sh, ctx, r, col, 'C4', '16.15 - 16.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C0', '16.30 - 16.45', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '16.45 - 17.00', nBG1);
  r = _peSS(sh, r, col, 'SALA', '17.00 - 17.30');
  r = _peSPP(sh, ctx, r, col, 'S22', '17.30 - 17.45', nBG1);
  r = _peSPP(sh, ctx, r, col, 'S22', '17.45 - 18.00', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C4', '18.00 - 18.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C0', '18.15 - 18.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'C23', '18.30 - 18.45', nBG1);
  r = _peSS(sh, r, col, 'SALA', '18.45 - 19.30');
  r = _peSS(sh, r, col, 'PAUSA', '19.30 - 20.00');
  r = _peSPP(sh, ctx, r, col, 'R23', '20.00 - 20.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG1);
}
function _pePatternS1_Rec(sh, ctx, col, nBG1, bg1FaRec) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '14.00 - 15.00');
  r = _peSPP(sh, ctx, r, col, 'R22', '15.00 - 15.15', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.15 - 15.30', nBG1);
  r = _peSS(sh, r, col, 'SALA', '15.30 - 15.45');
  r = _peSPP(sh, ctx, r, col, 'S22', '15.45 - 16.00', nBG1);
  r = _peSS(sh, r, col, 'PAUSA', '16.00 - 16.15');
  r = _peSS(sh, r, col, 'SALA', '16.15 - 17.15');
  r = _peSPP(sh, ctx, r, col, 'R22', '17.15 - 17.30', nBG1);
  r = _peSPP(sh, ctx, r, col, 'R22', '17.30 - 17.45', nBG1);
  r = _peSPP(sh, ctx, r, col, 'S22', '17.45 - 18.00', nBG1);
  r = _peSS(sh, r, col, 'SALA', '18.00 - 19.30');
  r = _peSS(sh, r, col, 'PAUSA', '19.30 - 20.00');
  if (bg1FaRec) {
    r = _peSPP(sh, ctx, r, col, 'R23', '20.00 - 20.30', nBG1);
    r = _peSPP(sh, ctx, r, col, 'R23', '20.30 - 21.00', nBG1);
  } else {
    r = _peSS(sh, r, col, 'SALA', '20.00 - 21.00');
  }
}
function _pePatternS22_Cassa(sh, ctx, col, nS22) {
  let r = 7;
  r = _peSS(sh, r, col, 'SALA', '12.00 - 13.30');
  r = _peSS(sh, r, col, 'PAUSA', '13.30 - 14.00');
  r = _peSPP(sh, ctx, r, col, 'C0', '14.00 - 14.30', nS22);
  r = _peSPP(sh, ctx, r, col, 'C23', '14.30 - 15.00', nS22);
  r = _peSS(sh, r, col, 'SALA', '15.00 - 15.45');
  r = _peSS(sh, r, col, 'PAUSA', '15.45 - 16.00');
  r = _peSPP(sh, ctx, r, col, 'S1', '16.00 - 16.15', nS22);
  r = _peSPP(sh, ctx, r, col, 'C4', '16.15 - 16.30', nS22);
  r = _peSPP(sh, ctx, r, col, 'C0', '16.30 - 16.45', nS22);
  r = _peSPP(sh, ctx, r, col, 'C23', '16.45 - 17.00', nS22);
  r = _peSS(sh, r, col, 'SALA', '17.00 - 17.45');
  r = _peSS(sh, r, col, 'PAUSA', '17.45 - 18.00');
  r = _peSPP(sh, ctx, r, col, 'C4', '18.00 - 18.15', nS22);
  r = _peSPP(sh, ctx, r, col, 'C0', '18.15 - 18.30', nS22);
  r = _peSPP(sh, ctx, r, col, 'C23', '18.30 - 18.45', nS22);
  r = _peSS(sh, r, col, 'SALA', '18.45 - 19.30');
  r = _peSPP(sh, ctx, r, col, 'S1', '19.30 - 20.00', nS22);
}
function _pePatternC23_Cassa(sh, ctx, col, nC23, conS22) {
  let r = 7;
  r = _peSS(sh, r, col, 'CASSA', '11.40 - 14.00');
  r = _peSPP(sh, ctx, r, col, 'C0', '14.00 - 14.30', nC23);
  r = _peSS(sh, r, col, 'PAUSA', '14.30 - 15.00');
  r = _peSPP(sh, ctx, r, col, 'R22', '15.00 - 15.15', nC23);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.15 - 15.30', nC23);
  if (conS22) {
    r = _peSPP(sh, ctx, r, col, 'S22', '15.30 - 15.45', nC23);
    r = _peSS(sh, r, col, 'CASSA', '15.45 - 16.15');
  } else {
    r = _peSS(sh, r, col, 'CASSA', '15.30 - 16.15');
  }
  r = _peSPP(sh, ctx, r, col, 'C4', '16.15 - 16.30', nC23);
  r = _peSPP(sh, ctx, r, col, 'C0', '16.30 - 16.45', nC23);
  r = _peSS(sh, r, col, 'PAUSA', '16.45 - 17.00');
  r = _peSS(sh, r, col, 'CASSA', '17.00 - 17.15');
  r = _peSPP(sh, ctx, r, col, 'R22', '17.15 - 17.30', nC23);
  r = _peSPP(sh, ctx, r, col, 'R22', '17.30 - 17.45', nC23);
  if (conS22) r = _peSPP(sh, ctx, r, col, 'S22', '17.45 - 18.00', nC23);
  else r = _peSS(sh, r, col, 'CASSA', '17.45 - 18.00');
  r = _peSPP(sh, ctx, r, col, 'C4', '18.00 - 18.15', nC23);
  r = _peSPP(sh, ctx, r, col, 'C0', '18.15 - 18.30', nC23);
  r = _peSS(sh, r, col, 'PAUSA', '18.30 - 18.45');
  r = _peSS(sh, r, col, 'CASSA', '18.45 - 20.00');
}
function _pePatternS1_SoloSala(sh, ctx, startRow, col, nS1) {
  let r = startRow;
  r = _peSS(sh, r, col, 'SALA', '14.00 - 15.30');
  r = _peSPP(sh, ctx, r, col, 'S22', '15.30 - 15.45', nS1);
  r = _peSS(sh, r, col, 'SALA', '15.45 - 16.00');
  r = _peSS(sh, r, col, 'PAUSA', '16.00 - 16.15');
  r = _peSS(sh, r, col, 'SALA', '16.15 - 17.45');
  r = _peSPP(sh, ctx, r, col, 'S22', '17.45 - 18.00', nS1);
  r = _peSS(sh, r, col, 'SALA', '18.00 - 19.00');
  r = _peSS(sh, r, col, 'PAUSA', '19.00 - 19.30');
  r = _peSS(sh, r, col, 'SALA', '19.30 - 21.00');
}
function _pePatternC20_BG(sh, ctx, col, nC20, salaLbl) {
  let r = 7;
  if (salaLbl) {
    r = _peSS(sh, r, col, 'CASSA', '20.00 - 20.30');
    r = _peSPPC(sh, ctx, r, col, 'C5', '20.30 - 21.00', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '21.00 - 21.30', nC20);
    r = _peSS(sh, r, col, 'CASSA', '21.30 - 21.45');
    r = _peSPP(sh, ctx, r, col, salaLbl, '21.45 - 22.00', nC20);
    r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.30');
    r = _peSS(sh, r, col, 'CASSA', '22.30 - 23.30');
    r = _peSPPC(sh, ctx, r, col, 'C5', '23.30 - 23.45', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '23.45 - 24.00', nC20);
    r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
    r = _peSPP(sh, ctx, r, col, salaLbl, '24.15 - 24.30', nC20);
    r = _peSS(sh, r, col, 'CASSA', '24.30 - 01.30');
    r = _peSPPC(sh, ctx, r, col, 'C5', '01.30 - 01.45', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '01.45 - 02.00', nC20);
    r = _peSS(sh, r, col, 'CASSA', '02.00 - 03.00');
  } else {
    r = _peSS(sh, r, col, 'CASSA', '20.00 - 21.00');
    r = _peSPPC(sh, ctx, r, col, 'C5', '21.00 - 21.30', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '21.30 - 22.00', nC20);
    r = _peSS(sh, r, col, 'PAUSA', '22.00 - 22.30');
    r = _peSS(sh, r, col, 'CASSA', '22.30 - 23.30');
    r = _peSPPC(sh, ctx, r, col, 'C5', '23.30 - 23.45', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '23.45 - 24.00', nC20);
    r = _peSS(sh, r, col, 'PAUSA', '24.00 - 24.15');
    r = _peSS(sh, r, col, 'CASSA', '24.15 - 01.30');
    r = _peSPPC(sh, ctx, r, col, 'C5', '01.30 - 01.45', nC20);
    r = _peSPPC(sh, ctx, r, col, 'C15', '01.45 - 02.00', nC20);
    r = _peSS(sh, r, col, 'CASSA', '02.00 - 03.00');
  }
}
function _pePatternR4(sh, ctx, startRow, col, nR4) {
  let r = startRow;
  r = _peSS(sh, r, col, 'SALA', '14.00 - 14.30');
  r = _peSPP(sh, ctx, r, col, 'C23', '14.30 - 15.00', nR4);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.00 - 15.15', nR4);
  r = _peSPP(sh, ctx, r, col, 'R22', '15.15 - 15.30', nR4);
  r = _peSPP(sh, ctx, r, col, 'S22', '15.30 - 15.45', nR4);
  r = _peSPP(sh, ctx, r, col, 'S22', '15.45 - 16.00', nR4);
  r = _peSS(sh, r, col, 'PAUSA', '16.00 - 16.15');
  r = _peSS(sh, r, col, 'SALA', '16.15 - 17.15');
  r = _peSPP(sh, ctx, r, col, 'R22', '17.15 - 17.30', nR4);
  r = _peSPP(sh, ctx, r, col, 'R22', '17.30 - 17.45', nR4);
  r = _peSS(sh, r, col, 'SALA', '17.45 - 18.00');
  r = _peSS(sh, r, col, 'PAUSA', '18.00 - 18.15');
  r = _peSS(sh, r, col, 'SALA', '18.15 - 19.30');
  r = _peSPP(sh, ctx, r, col, 'S1', '19.30 - 20.00', nR4);
}
function _pePatternS1_Standard(sh, ctx, nBG1, numS22, hasR24) {
  let r = 7;
  r = _peSPP(sh, ctx, r, 1, 'C0', '14.00 - 14.30', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C23', '14.30 - 15.00', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'R22', '15.00 - 15.15', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'R22', '15.15 - 15.30', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'S22', '15.30 - 15.45', nBG1);
  r = _peSS(sh, r, 1, 'SALA', '15.45 - 16.00');
  r = _peSS(sh, r, 1, 'PAUSA', '16.00 - 16.15');
  r = _peSPP(sh, ctx, r, 1, 'C4', '16.15 - 16.30', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C0', '16.30 - 16.45', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C23', '16.45 - 17.00', nBG1);
  r = _peSS(sh, r, 1, 'SALA', '17.00 - 17.15');
  r = _peSPP(sh, ctx, r, 1, 'R22', '17.15 - 17.30', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'R22', '17.30 - 17.45', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'S22', '17.45 - 18.00', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C4', '18.00 - 18.15', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C0', '18.15 - 18.30', nBG1);
  r = _peSPP(sh, ctx, r, 1, 'C23', '18.30 - 18.45', nBG1);
  if (numS22 >= 2) {
    r = _peSS(sh, r, 1, 'SALA', '18.45 - 19.30');
    r = _peSS(sh, r, 1, 'PAUSA', '19.30 - 20.00');
    r = _peSPP(sh, ctx, r, 1, 'R23', '20.00 - 20.30', nBG1);
    r = _peSPP(sh, ctx, r, 1, 'R23', '20.30 - 21.00', nBG1);
  } else {
    r = _peSS(sh, r, 1, 'SALA', '18.45 - 19.00');
    r = _peSS(sh, r, 1, 'PAUSA', '19.00 - 19.30');
    if (hasR24) {
      r = _peSPP(sh, ctx, r, 1, 'S5', '19.30 - 20.00', nBG1);
      r = _peSS(sh, r, 1, 'SALA', '20.00 - 20.30');
      r = _peSPP(sh, ctx, r, 1, 'R23', '20.30 - 21.00', nBG1);
    } else {
      r = _peSPP(sh, ctx, r, 1, 'S5', '19.30 - 20.00', nBG1);
      r = _peSPP(sh, ctx, r, 1, 'R23', '20.00 - 20.30', nBG1);
      r = _peSPP(sh, ctx, r, 1, 'R23', '20.30 - 21.00', nBG1);
    }
  }
}
function _peScrHeaderQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22) {
  const dT = ctx.dT;
  switch (lblQ2) {
    case 'S22':
      _peScrHeader(sh, 5, 4, 'S22', nS22, '11.40 - 20.00', _PE_CLR.giallo);
      break;
    case 'C23':
      _peScrHeader(sh, 5, 4, 'C23', nC23bg, '11.40 - 20.10', _PE_CLR.c23);
      break;
    case 'S3':
      _peScrHeader(sh, 5, 4, 'S3', nS3, '20.00 - 02.00', _PE_CLR.giallo);
      break;
    case 'S5':
      _peScrHeader(sh, 5, 4, 'S5', _peGPN(dT, 'S5'), '17.00 - 02.00', _PE_CLR.giallo);
      break;
    case 'S7C':
      _peScrHeader(sh, 5, 4, 'S7C', _peGPN(dT, 'S7C'), '19.50 - 02.00', _PE_CLR.giallo);
      break;
    case 'S8C':
      _peScrHeader(sh, 5, 4, 'S8C', _peGPN(dT, 'S8C'), '20.50 - 04.10', _PE_CLR.giallo);
      break;
    case 'S7':
      _peScrHeader(sh, 5, 4, 'S7', _peGPN(dT, 'S7'), '19.50 - 04.00', _PE_CLR.giallo);
      break;
    case 'S31':
      _peScrHeader(sh, 5, 4, 'S31', _peGPN(dT, 'S31'), '16.00 - 01.00', _PE_CLR.giallo);
      break;
    case 'C20':
      _peScrHeader(sh, 5, 4, 'C20', nC20, '19.40 - 03.10', _PE_CLR.azzurro);
      break;
  }
}
function _peEseguiQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22, nBG3, hasR24, bg3FaRec) {
  const dT = ctx.dT;
  switch (lblQ2) {
    case 'S22':
      _pePatternS22_Cassa(sh, ctx, 4, nS22);
      break;
    case 'C23':
      _pePatternC23_Cassa(sh, ctx, 4, nC23bg, true);
      break;
    case 'S3':
      _pePatternS3(sh, ctx, 4, nS3, hasR24, bg3FaRec);
      break;
    case 'S5':
      _pePatternS3(sh, ctx, 4, _peGPN(dT, 'S5'), hasR24, bg3FaRec);
      break;
    case 'S7C':
      _pePatternS3(sh, ctx, 4, _peGPN(dT, 'S7C'), hasR24, bg3FaRec);
      break;
    case 'S8C':
      _pePatternS8C_Q2(sh, ctx, 4, _peGPN(dT, 'S8C'));
      break;
    case 'S7':
      _pePatternS7_Q2(sh, ctx, 4, _peGPN(dT, 'S7'));
      break;
    case 'S31':
      _pePatternS31_Q2(sh, ctx, 4, _peGPN(dT, 'S31'));
      break;
    case 'C20':
      _pePatternC20_BG(sh, ctx, 4, nC20, nBG3);
      break;
  }
}

// ---------- scelta Q2 (condivisa LUN-GIO / DOM) ----------
function _peScegliQ2(ctx, bgCassa, nS3, s3FaCassa, nC20, bg1IsC23, conS22C23) {
  const dT = ctx.dT;
  const dc = ctx.dc;
  if (conS22C23 && bgCassa === 'S22' && !nS3) return 'S22';
  if (conS22C23 && bgCassa === 'C23' && !nS3 && !bg1IsC23) return 'C23';
  if (nS3 && s3FaCassa) return 'S3';
  if (nS3 && !s3FaCassa) {
    if (_peGPN(dT, 'S5') && _pePuoCoprire(dc, _peGPN(dT, 'S5'), 'C0')) return 'S5';
    if (nC20) return 'C20';
    return 'S3';
  }
  if (!nS3) {
    if (_peGPN(dT, 'S7C') && _pePuoCoprire(dc, _peGPN(dT, 'S7C'), 'C0')) return 'S7C';
    if (_peGPN(dT, 'S8C') && _pePuoCoprire(dc, _peGPN(dT, 'S8C'), 'C0')) return 'S8C';
    if (_peGPN(dT, 'S7') && _pePuoCoprire(dc, _peGPN(dT, 'S7'), 'C0')) return 'S7';
    if (_peGPN(dT, 'S31') && _pePuoCoprire(dc, _peGPN(dT, 'S31'), 'C0')) return 'S31';
    if (nC20) return 'C20';
  }
  return '';
}

// aggiustamento BG1 comune: se BG1 non fa né cassa né rec, prova C23
function _peAggiustaBG1(ctx, bg) {
  const dc = ctx.dc;
  const nC23bg = _peGPN(ctx.dT, 'C23');
  const out = {
    nBG1: bg.nBG1,
    lblBG1: bg.lblBG1,
    orBG1: bg.orBG1,
    isS22: bg.isS22,
    bg1IsC23: false,
    nS1Orig: '',
    lblS1Orig: '',
  };
  if (out.isS22 && out.nBG1) {
    if (!_pePuoCoprire(dc, out.nBG1, 'C0') && !_pePuoCoprire(dc, out.nBG1, 'R22') && nC23bg) {
      out.nBG1 = nC23bg;
      out.lblBG1 = 'C23';
      out.orBG1 = '11.40 - 20.10';
      out.isS22 = false;
      out.bg1IsC23 = true;
    }
  }
  if (!out.isS22 && !out.bg1IsC23 && out.nBG1) {
    const nS22 = _peGPN(ctx.dT, 'S22');
    const s22FaCassa = nS22 ? _pePuoCoprire(dc, nS22, 'C0') : false;
    if (!_pePuoCoprire(dc, out.nBG1, 'C0') && !_pePuoCoprire(dc, out.nBG1, 'R22')) {
      if (!s22FaCassa && nC23bg) {
        out.nS1Orig = out.nBG1;
        out.lblS1Orig = out.lblBG1;
        out.nBG1 = nC23bg;
        out.lblBG1 = 'C23';
        out.orBG1 = '11.40 - 20.10';
        out.bg1IsC23 = true;
      }
    }
  }
  return out;
}

// ---------- generatori giornata (port dei 3 layout) ----------
function _peGeneraLunGio(sh, ctx, dataStr) {
  const dT = ctx.dT;
  const dc = ctx.dc;
  let bg1 = _peTrovaBG1(ctx);
  const nS3 = _peGPN(dT, 'S3');
  let bg3 = _peTrovaBG3(ctx);
  let haS7C = bg3.lblBG3 === 'S7C' || bg3.lblBG3 === 'R7C';
  const nC20 = _peGPN(dT, 'C20');
  const numS22 = _peConta(dT, 'S22');
  const hasR24 = !!dT['R24'];
  const nS22 = _peGPN(dT, 'S22');
  const nC23bg = _peGPN(dT, 'C23');

  let bg1FaCassa = true;
  let bg1FaRec = false;
  let s22FaCassa = true;
  if (!bg1.isS22 && bg1.nBG1) {
    bg1FaCassa = _pePuoCoprire(dc, bg1.nBG1, 'C0');
    bg1FaRec = _pePuoCoprire(dc, bg1.nBG1, 'R22');
  }
  if (nS22) s22FaCassa = _pePuoCoprire(dc, nS22, 'C0');
  const a = _peAggiustaBG1(ctx, bg1);
  if (a.bg1IsC23) {
    bg1FaCassa = false;
    if (a.isS22 === false && bg1.isS22) bg1FaRec = false;
  }
  bg1 = a;
  const bgCassa = _peCalcolaBgCassa(bg1FaCassa && !bg1.bg1IsC23, s22FaCassa, nS22, nC23bg);

  let s3FaCassa = true;
  let s3FaRec = false;
  if (nS3) {
    s3FaCassa = _pePuoCoprire(dc, nS3, 'C0');
    s3FaRec = _pePuoCoprire(dc, nS3, 'R22');
  }
  if (nS3 && !s3FaCassa && s3FaRec && bg3.lblBG3 === 'S31') {
    bg3 = { nBG3: nS3, lblBG3: 'S3', orBG3: '20.00 - 02.00', bgRec: nS3, nS7: bg3.nS7 };
    haS7C = false;
  }
  const lblQ2 = _peScegliQ2(ctx, bgCassa, nS3, s3FaCassa, nC20, bg1.bg1IsC23, true);

  let sotto = 'PAUSE ' + bg1.lblBG1;
  if (lblQ2) sotto += ' - ' + lblQ2;
  if (bg3.nBG3) sotto += ' - ' + bg3.lblBG3;
  if (hasR24) sotto += ' [+R24]';
  _peScrTitolo(sh, 'LUNEDI - GIOVEDI', dataStr, sotto, _PE_CLR.giallo);
  _peScrHeader(sh, 5, 1, bg1.lblBG1, bg1.nBG1, bg1.orBG1, _PE_CLR.giallo);
  _peScrHeaderQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22);
  if (bg3.nBG3) _peScrHeader(sh, 5, 7, bg3.lblBG3, bg3.nBG3, bg3.orBG3, _PE_CLR.giallo);

  // Q1
  if (bg1.bg1IsC23) _pePatternC23_Cassa(sh, ctx, 1, bg1.nBG1, bg1.nS1Orig === '');
  else if (bg1.isS22) _pePatternS22(sh, ctx, 1, bg1.nBG1, numS22);
  else if (bgCassa !== 'S1') _pePatternS1_Rec(sh, ctx, 1, bg1.nBG1, bg1FaRec);
  else _pePatternS1_Standard(sh, ctx, bg1.nBG1, numS22, hasR24);

  // Q2
  const bg3FaRec = _pePuoCoprire(dc, bg3.bgRec, 'R23');
  _peEseguiQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22, bg3.nBG3, hasR24, bg3FaRec);

  // Q3
  const bg3DaR23Sera = bg1.isS22 || bg1.bg1IsC23 || (bgCassa !== 'S1' && !bg1FaRec);
  switch (bg3.lblBG3) {
    case 'S7C':
    case 'R7C':
    case 'S7':
      _pePatternBG3_S7C(
        sh,
        ctx,
        7,
        bg3.nBG3,
        bg3.bgRec,
        nS3,
        haS7C,
        bg3DaR23Sera,
        lblQ2 === 'S7',
        lblQ2 === 'C20',
        hasR24,
        bg3FaRec,
        _peConta(dT, 'S7'),
      );
      break;
    case 'S5':
      _pePatternBG3_S5(sh, ctx, 7, bg3.nBG3, bg3.bgRec, nS3, bg3DaR23Sera, hasR24, lblQ2 === 'S7', bg3FaRec);
      break;
    case 'S3':
      _pePatternBG3_S3(sh, ctx, 7, bg3.nBG3, bg3.bgRec, bg3DaR23Sera);
      break;
    case 'S8C':
      _pePatternBG3_S8C(sh, ctx, 7, bg3.nBG3);
      break;
    case 'S31':
      _pePatternBG3_S31(sh, ctx, 7, bg3.nBG3, nS3, hasR24, bg3FaRec);
      if (hasR24 && dT['C20']) {
        const startC20 = _peMaxR(sh) + 3;
        _peScrHeader(sh, startC20, 7, 'C20', _peGPN(dT, 'C20'), '19.40 - 03.10', _PE_CLR.cassa);
        let rc = startC20 + 2;
        rc = _peSPP(sh, ctx, rc, 7, 'R23', '01.30 - 01.45', _peGPN(dT, 'C20'));
        rc = _peSPP(sh, ctx, rc, 7, 'S7', '01.45 - 02.00', _peGPN(dT, 'C20'));
      }
      break;
  }
  if (bg1.bg1IsC23 && bg1.nS1Orig) {
    const startS1 = _peMaxR(sh) + 3;
    _peScrHeader(sh, startS1, 1, bg1.lblS1Orig, bg1.nS1Orig, '14.00 - 21.00', _PE_CLR.sala);
    _pePatternS1_SoloSala(sh, ctx, startS1 + 2, 1, bg1.nS1Orig);
  }
  _pePiazzaPauseExtra(sh, ctx);
}
function _peGeneraDomenica(sh, ctx, dataStr) {
  const dT = ctx.dT;
  const dc = ctx.dc;
  let bg1 = _peTrovaBG1(ctx);
  const nS3 = _peGPN(dT, 'S3');
  let bg3 = _peTrovaBG3(ctx);
  let haS7C = bg3.lblBG3 === 'S7C' || bg3.lblBG3 === 'R7C';
  const nC20 = _peGPN(dT, 'C20');
  const nR4 = _peGPN(dT, 'R4');
  const numS22 = _peConta(dT, 'S22');
  const hasR24 = !!dT['R24'];
  const nC23bg = _peGPN(dT, 'C23');
  bg1 = _peAggiustaBG1(ctx, bg1);

  let s3FaCassa = true;
  let s3FaRec = false;
  if (nS3) {
    s3FaCassa = _pePuoCoprire(dc, nS3, 'C0');
    s3FaRec = _pePuoCoprire(dc, nS3, 'R22');
  }
  if (nS3 && !s3FaCassa && s3FaRec && bg3.lblBG3 === 'S31') {
    bg3 = { nBG3: nS3, lblBG3: 'S3', orBG3: '20.00 - 02.00', bgRec: nS3, nS7: bg3.nS7 };
    haS7C = false;
  }
  const lblQ2d = _peScegliQ2(ctx, '', nS3, s3FaCassa, nC20, bg1.bg1IsC23, false);

  let sotto = 'PAUSE ' + bg1.lblBG1;
  if (lblQ2d) sotto += ' - ' + lblQ2d;
  if (bg3.nBG3) sotto += ' - ' + bg3.lblBG3;
  if (hasR24) sotto += ' [+R24]';
  _peScrTitolo(sh, 'DOMENICA', dataStr, sotto, _PE_CLR.domenica);
  _peScrHeader(sh, 5, 1, bg1.lblBG1, bg1.nBG1, bg1.orBG1, _PE_CLR.giallo);
  _peScrHeaderQ2(sh, ctx, lblQ2d, nS3, nC23bg, nC20, _peGPN(dT, 'S22'));
  if (bg3.nBG3) _peScrHeader(sh, 5, 7, bg3.lblBG3, bg3.nBG3, bg3.orBG3, _PE_CLR.giallo);

  if (bg1.bg1IsC23) _pePatternC23_Cassa(sh, ctx, 1, bg1.nBG1, bg1.nS1Orig === '');
  else if (bg1.isS22) _pePatternS22(sh, ctx, 1, bg1.nBG1, numS22);
  else if (nR4) _pePatternS1_Dom(sh, ctx, 1, bg1.nBG1);
  else _pePatternS1_Standard(sh, ctx, bg1.nBG1, numS22, hasR24);

  const bg3FaRec = _pePuoCoprire(dc, bg3.bgRec, 'R23');
  _peEseguiQ2(sh, ctx, lblQ2d, nS3, nC23bg, nC20, _peGPN(dT, 'S22'), bg3.nBG3, hasR24, bg3FaRec);

  const bg3DaR23Sera = bg1.isS22 || bg1.bg1IsC23;
  switch (bg3.lblBG3) {
    case 'S7C':
    case 'R7C':
    case 'S7':
      _pePatternBG3_S7C(
        sh,
        ctx,
        7,
        bg3.nBG3,
        bg3.bgRec,
        nS3,
        haS7C,
        false,
        lblQ2d === 'S7',
        lblQ2d === 'C20',
        hasR24,
        bg3FaRec,
        _peConta(dT, 'S7'),
      );
      break;
    case 'S5':
      _pePatternBG3_S5(sh, ctx, 7, bg3.nBG3, bg3.bgRec, nS3, bg3DaR23Sera, hasR24, lblQ2d === 'S7', bg3FaRec);
      break;
    case 'S3':
      _pePatternBG3_S3(sh, ctx, 7, bg3.nBG3, bg3.bgRec, false);
      break;
    case 'S8C':
      _pePatternBG3_S8C(sh, ctx, 7, bg3.nBG3);
      break;
    case 'S31':
      _pePatternBG3_S31(sh, ctx, 7, bg3.nBG3, nS3, hasR24, bg3FaRec);
      if (hasR24 && dT['C20']) {
        const sc = _peMaxR(sh) + 3;
        _peScrHeader(sh, sc, 7, 'C20', _peGPN(dT, 'C20'), '19.40 - 03.10', _PE_CLR.cassa);
        let rc = sc + 2;
        rc = _peSPP(sh, ctx, rc, 7, 'R23', '01.30 - 01.45', _peGPN(dT, 'C20'));
        rc = _peSPP(sh, ctx, rc, 7, 'S7', '01.45 - 02.00', _peGPN(dT, 'C20'));
      }
      break;
  }
  let startExtra = _peMaxR(sh) + 3;
  if (bg1.bg1IsC23 && bg1.nS1Orig) {
    _peScrHeader(sh, startExtra, 1, bg1.lblS1Orig, bg1.nS1Orig, '14.00 - 21.00', _PE_CLR.sala);
    _pePatternS1_SoloSala(sh, ctx, startExtra + 2, 1, bg1.nS1Orig);
    startExtra = _peMaxR(sh) + 3;
  }
  if (nR4) {
    _peScrHeader(sh, startExtra, 1, 'R4', nR4, '14.00 - 20.00', _PE_CLR.rec);
    _pePatternR4(sh, ctx, startExtra + 2, 1, nR4);
  }
  _pePiazzaPauseExtra(sh, ctx);
}
function _peGeneraVenSab(sh, ctx, dataStr) {
  const dT = ctx.dT;
  const dc = ctx.dc;
  let bg1 = _peTrovaBG1(ctx);
  bg1 = _peAggiustaBG1(ctx, bg1);
  let nR8 = '';
  if (dT['R8']) {
    const r8Nomi = dT['R8'].slice();
    nR8 = r8Nomi[0].trim();
    if (r8Nomi.length >= 2 && !_pePuoCoprire(dc, nR8, 'R23')) {
      for (let i = 1; i < r8Nomi.length; i++) {
        if (_pePuoCoprire(dc, r8Nomi[i].trim(), 'R23')) {
          const tmp = nR8;
          nR8 = r8Nomi[i].trim();
          r8Nomi[i] = tmp;
          r8Nomi[0] = nR8;
          dT['R8'] = r8Nomi;
          break;
        }
      }
    }
  }
  const nS7 = _peGPN(dT, 'S7');
  const nS3 = _peGPN(dT, 'S3');
  const nR23 = _peGPN(dT, 'R23');
  const numR8 = _peConta(dT, 'R8');
  const numR23 = _peConta(dT, 'R23');
  const numS7 = _peConta(dT, 'S7');
  const numS22 = _peConta(dT, 'S22');
  const numC8 = ctx.c8Nomi.length;
  let numC8Eff = dT['C20'] ? numC8 : numC8 - 1;
  if (numC8Eff < 0) numC8Eff = 0;

  let bgRecPrima = '';
  let bgRecNotte = '';
  if (numR8 >= 2) {
    bgRecPrima = nR8;
    bgRecNotte = nR8;
  } else if (numR8 === 1) {
    bgRecPrima = nS3 || _peGPN(dT, 'S5');
    bgRecNotte = nR23 || nR8;
  } else {
    bgRecPrima = nS3 || _peGPN(dT, 'S5') || '';
    bgRecNotte = nR23 || bgRecPrima;
  }
  let recSost = '';
  if (numR23 < 2) {
    if (nS3) recSost = 'S3';
    else if (_peGPN(dT, 'S5')) recSost = 'S5';
  }

  let nCassaPrinc = '';
  let cdPrinc = 0;
  let nCassaSec = '';
  let cdSec = 0;
  if (numC8Eff >= 3) {
    for (let j = 0; j < numC8; j++)
      if (ctx.c8Cd[j] === 3 || ctx.c8Cd[j] === 4) {
        nCassaPrinc = ctx.c8Nomi[j];
        cdPrinc = ctx.c8Cd[j];
        break;
      }
    if (!nCassaPrinc && numC8) {
      nCassaPrinc = ctx.c8Nomi[0];
      cdPrinc = ctx.c8Cd[0];
    }
    for (let j = 0; j < numC8; j++)
      if (ctx.c8Nomi[j] !== nCassaPrinc && (ctx.c8Cd[j] === 2 || ctx.c8Cd[j] === 7)) {
        nCassaSec = ctx.c8Nomi[j];
        cdSec = ctx.c8Cd[j];
        break;
      }
    if (!nCassaSec)
      for (let j = 0; j < numC8; j++)
        if (ctx.c8Nomi[j] !== nCassaPrinc) {
          nCassaSec = ctx.c8Nomi[j];
          cdSec = ctx.c8Cd[j];
          break;
        }
  } else {
    for (let j = 0; j < numC8; j++)
      if (ctx.c8Cd[j] === 2 || ctx.c8Cd[j] === 7) {
        nCassaPrinc = ctx.c8Nomi[j];
        cdPrinc = ctx.c8Cd[j];
        break;
      }
    if (!nCassaPrinc && numC8 >= 1) {
      nCassaPrinc = ctx.c8Nomi[0];
      cdPrinc = ctx.c8Cd[0];
    }
  }
  const lblPrinc = cdPrinc > 0 ? 'CD ' + String(cdPrinc).padStart(2, '0') : 'CD 01';
  const lblSec = cdSec > 0 ? 'CD ' + String(cdSec).padStart(2, '0') : 'CD 02';

  let lblR8 = 'PAUSE ' + bg1.lblBG1;
  if (nS7) lblR8 += ' - S7';
  if (numC8 > 0) lblR8 += ' - C8 (' + numC8 + ')';
  if (numR8 >= 2) lblR8 += ' - R8';
  else if (numR8 === 1) lblR8 += ' - R8(1)';

  _peScrTitolo(sh, 'VENERDI - SABATO', dataStr, lblR8, _PE_CLR.venerdi);
  _peScrHeader(sh, 5, 1, bg1.lblBG1, bg1.nBG1, bg1.orBG1, _PE_CLR.giallo);
  if (numR8 >= 2) {
    _peScrHeader(sh, 5, 4, 'R8', nR8, '20.50 - 05.00', _PE_CLR.verdeScuro);
  } else if (numR8 === 1) {
    const lblRecBG1 = nS3 ? 'S3' : _peGPN(dT, 'S5') ? 'S5' : 'R8';
    if (bgRecPrima && bgRecPrima !== nR8)
      _peScrHeader(sh, 5, 4, lblRecBG1, bgRecPrima, '20.00 - 02.00', _PE_CLR.verdeScuro);
    else _peScrHeader(sh, 5, 4, 'R8', nR8, '20.50 - 05.00', _PE_CLR.verdeScuro);
  } else {
    const lblRecBG = nS3 ? 'S3' : _peGPN(dT, 'S5') ? 'S5' : 'REC';
    if (bgRecPrima) _peScrHeader(sh, 5, 4, lblRecBG, bgRecPrima, '20.00 - 02.00', _PE_CLR.verdeScuro);
    else _peScrHeader(sh, 5, 4, 'REC', '(nessun BG)', 'REC copertura', _PE_CLR.verdeScuro);
  }
  _peScrHeader(sh, 5, 7, lblPrinc, nCassaPrinc, '20.50 - 05.00', _PE_CLR.azzurro);

  // Q1
  if (bg1.bg1IsC23) {
    _pePatternC23_Cassa(sh, ctx, 1, bg1.nBG1, bg1.nS1Orig === '');
  } else if (bg1.isS22) {
    _pePatternS22(sh, ctx, 1, bg1.nBG1, numS22);
  } else {
    let r = 7;
    r = _peSPP(sh, ctx, r, 1, 'C0', '14.00 - 14.30', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C23', '14.30 - 15.00', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'R22', '15.00 - 15.15', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'R22', '15.15 - 15.30', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'S22', '15.30 - 15.45', bg1.nBG1);
    r = _peSS(sh, r, 1, 'SALA', '15.45 - 16.00');
    r = _peSS(sh, r, 1, 'PAUSA', '16.00 - 16.15');
    r = _peSPP(sh, ctx, r, 1, 'C4', '16.15 - 16.30', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C0', '16.30 - 16.45', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C23', '16.45 - 17.00', bg1.nBG1);
    r = _peSS(sh, r, 1, 'SALA', '17.00 - 17.15');
    r = _peSPP(sh, ctx, r, 1, 'R22', '17.15 - 17.30', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'R22', '17.30 - 17.45', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'S22', '17.45 - 18.00', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C4', '18.00 - 18.15', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C0', '18.15 - 18.30', bg1.nBG1);
    r = _peSPP(sh, ctx, r, 1, 'C23', '18.30 - 18.45', bg1.nBG1);
    r = _peSS(sh, r, 1, 'SALA', '18.45 - 19.00');
    r = _peSS(sh, r, 1, 'PAUSA', '19.00 - 19.30');
    r = _peSPP(sh, ctx, r, 1, 'S5', '19.30 - 20.00', bg1.nBG1);
    r = _peSS(sh, r, 1, 'SALA', '20.00 - 21.00');
  }

  // Q2 REC
  let r = 7;
  if (numR8 >= 2) {
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', nR8);
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.30 - 22.00', nR8);
      r = _peSS(sh, r, 4, 'REC', '22.00 - 23.30');
    } else if (numR23 === 1) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', nR8);
      r = _peSS(sh, r, 4, 'REC', '21.30 - 22.15');
      if (recSost) r = _peSPP(sh, ctx, r, 4, recSost, '22.15 - 22.30', nR8);
      else r = _peSS(sh, r, 4, 'REC', '22.15 - 22.30');
      r = _peSS(sh, r, 4, 'REC', '22.30 - 23.30');
    } else {
      r = _peSS(sh, r, 4, 'REC', '21.00 - 22.15');
      if (recSost) r = _peSPP(sh, ctx, r, 4, recSost, '22.15 - 22.30', nR8);
      else r = _peSS(sh, r, 4, 'REC', '22.15 - 22.30');
      r = _peSS(sh, r, 4, 'REC', '22.30 - 23.30');
    }
    r = _peSN(sh, ctx, r, 4, 'R8', '23.30 - 24.00', nR8, nR8);
    if (numR23 < 2 && recSost) {
      r = _peSPP(sh, ctx, r, 4, recSost, '24.00 - 24.15', nR8);
      r = _peSS(sh, r, 4, 'PAUSA', '24.15 - 24.45');
      if (numR23 === 1) r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', nR8);
      else r = _peSS(sh, r, 4, 'REC', '24.45 - 01.00');
    } else {
      r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.30');
      if (numR23 >= 2) {
        r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', nR8);
        r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', nR8);
      } else if (numR23 === 1) {
        r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', nR8);
        r = _peSS(sh, r, 4, 'REC', '24.45 - 01.00');
      } else {
        r = _peSS(sh, r, 4, 'REC', '24.30 - 01.00');
      }
    }
    r = _peSS(sh, r, 4, 'REC', '01.00 - 01.45');
    r = _peSN(sh, ctx, r, 4, 'R8', '01.45 - 02.00', nR8, nR8);
    r = _peSS(sh, r, 4, 'PAUSA', '02.00 - 02.15');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.15 - 02.30', nR8);
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.30 - 02.45', nR8);
      r = _peSS(sh, r, 4, 'REC', '02.45 - 03.15');
    } else if (numR23 === 1) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.15 - 02.30', nR8);
      r = _peSS(sh, r, 4, 'REC', '02.30 - 03.15');
    } else {
      r = _peSS(sh, r, 4, 'REC', '02.15 - 03.15');
    }
    r = _peSN(sh, ctx, r, 4, 'R8', '03.15 - 03.30', nR8, nR8);
    r = _peSS(sh, r, 4, 'PAUSA', '03.30 - 03.45');
    r = _peSS(sh, r, 4, 'REC', '03.45 - 05.00');
  } else if (numR8 === 1) {
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.30 - 22.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', bgRecPrima);
      r = _peSS(sh, r, 4, 'REC', '21.30 - 22.00');
    }
    r = _peSS(sh, r, 4, 'PAUSA', '22.00 - 22.15');
    r = _peSS(sh, r, 4, 'REC', '22.15 - 23.30');
    r = _peSN(sh, ctx, r, 4, 'R8', '23.30 - 24.00', nR8, bgRecPrima);
    r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.30');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSS(sh, r, 4, 'PAUSA', '24.45 - 01.00');
    }
    r = _peSS(sh, r, 4, 'REC', '01.00 - 01.45');
    r = _peSN(sh, ctx, r, 4, 'R8', '01.45 - 02.00', nR8, bgRecPrima);
  } else if (bgRecPrima) {
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.30 - 22.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '21.00 - 21.30', bgRecPrima);
      r = _peSS(sh, r, 4, 'REC', '21.30 - 22.00');
    }
    r = _peSS(sh, r, 4, 'PAUSA', '22.00 - 22.15');
    r = _peSS(sh, r, 4, 'REC', '22.15 - 23.30');
    r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.30');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSS(sh, r, 4, 'PAUSA', '24.45 - 01.00');
    }
    r = _peSS(sh, r, 4, 'REC', '01.00 - 02.00');
  }

  // Q3 CASSA
  r = 7;
  if (numC8Eff <= 2) {
    if (dT['C20']) {
      r = _peSPPC(sh, ctx, r, 7, 'C5', '21.00 - 21.30', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '21.30 - 22.00', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C20', '22.00 - 22.30', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '22.30 - 23.00', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '23.00 - 23.30');
      r = _peSS(sh, r, 7, 'CASSA', '23.30 - 24.30');
      r = _peSPPC(sh, ctx, r, 7, 'C5', '24.30 - 24.45', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '24.45 - 01.00', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C20', '01.00 - 01.15', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '01.15 - 01.30', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '01.30 - 01.45');
      r = _peSS(sh, r, 7, 'CASSA', '01.45 - 02.00');
      r = _peSPPC(sh, ctx, r, 7, 'C5', '02.00 - 02.15', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '02.15 - 02.30', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '02.30 - 02.45', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '02.45 - 03.00');
      r = _peSS(sh, r, 7, 'CASSA', '03.00 - 05.00');
    } else {
      r = _peSPPC(sh, ctx, r, 7, 'C5', '21.00 - 21.30', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '21.30 - 22.00', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '22.00 - 22.30', nCassaPrinc, nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '22.30 - 23.00', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '23.00 - 23.30');
      r = _peSS(sh, r, 7, 'CASSA', '23.30 - 24.30');
      r = _peSPPC(sh, ctx, r, 7, 'C5', '24.30 - 24.45', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '24.45 - 01.00', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '01.00 - 01.15', nCassaPrinc, nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '01.15 - 01.30', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '01.30 - 01.45');
      r = _peSPPC(sh, ctx, r, 7, 'C5', '01.45 - 02.00', nCassaPrinc);
      r = _peSPPC(sh, ctx, r, 7, 'C15', '02.00 - 02.15', nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '02.15 - 02.30', nCassaPrinc, nCassaPrinc);
      r = _peSN(sh, ctx, r, 7, 'C8', '02.30 - 02.45', nCassaPrinc, nCassaPrinc);
      r = _peSS(sh, r, 7, 'PAUSA', '02.45 - 03.00');
      r = _peSS(sh, r, 7, 'CASSA', '03.00 - 05.00');
    }
  } else {
    r = _peSPPC(sh, ctx, r, 7, 'C5', '21.00 - 21.30', nCassaPrinc);
    r = _peSPPC(sh, ctx, r, 7, 'C15', '21.30 - 22.00', nCassaPrinc);
    r = _peSPPC(sh, ctx, r, 7, 'C20', '22.00 - 22.30', nCassaPrinc);
    r = _peSN(sh, ctx, r, 7, 'C8', '22.30 - 23.00', nCassaPrinc, nCassaPrinc);
    r = _peSN(sh, ctx, r, 7, 'C8', '23.00 - 23.30', nCassaPrinc, nCassaPrinc);
    r = _peSS(sh, r, 7, 'PAUSA', '23.30 - 24.00');
    r = _peSS(sh, r, 7, 'CASSA', '24.00 - 24.15');
    r = _peSPPC(sh, ctx, r, 7, 'C5', '24.15 - 24.30', nCassaPrinc);
    r = _peSPPC(sh, ctx, r, 7, 'C15', '24.30 - 24.45', nCassaPrinc);
    r = _peSPPC(sh, ctx, r, 7, 'C20', '24.45 - 01.00', nCassaPrinc);
    r = _peSN(sh, ctx, r, 7, 'C8', '01.00 - 01.15', nCassaPrinc, nCassaPrinc);
    r = _peSN(sh, ctx, r, 7, 'C8', '01.15 - 01.30', nCassaPrinc, nCassaPrinc);
    r = _peSS(sh, r, 7, 'PAUSA', '01.30 - 01.45');
    r = _peSS(sh, r, 7, 'CASSA', '01.45 - 02.45');
    r = _peSS(sh, r, 7, 'PAUSA', '02.45 - 03.00');
    r = _peSS(sh, r, 7, 'CASSA', '03.00 - 05.00');
  }

  const startR2 = _peMaxR(sh) + 3;
  if (nS7) {
    _peScrHeader(sh, startR2, 1, 'S7', nS7, '19.50 - 04.00', _PE_CLR.verdeScuro);
    r = startR2 + 2;
    let sA = '';
    let sB = '';
    if (dT['S3'] && recSost !== 'S3') sA = 'S3';
    if (dT['S7C']) {
      if (!sA) sA = 'S7C';
      else if (!sB) sB = 'S7C';
    }
    if (dT['S5'] && recSost !== 'S5') {
      if (!sA) sA = 'S5';
      else if (!sB) sB = 'S5';
    }
    if (numS7 >= 2) {
      r = _peSS(sh, r, 1, 'SALA', '20.00 - 21.00');
      r = _peSS(sh, r, 1, 'PAUSA', '21.00 - 21.30');
      r = _peSPP(sh, ctx, r, 1, 'S7', '21.30 - 22.00', nS7);
      if (sA) r = _peSPP(sh, ctx, r, 1, sA, '22.00 - 22.15', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '22.00 - 22.15');
      if (sB) r = _peSPP(sh, ctx, r, 1, sB, '22.15 - 22.30', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '22.15 - 22.30');
      r = _peSPP(sh, ctx, r, 1, 'S8', '22.30 - 23.00', nS7);
      r = _peSS(sh, r, 1, 'SALA', '23.00 - 24.00');
      if (sA) r = _peSPP(sh, ctx, r, 1, sA, '24.00 - 24.15', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '24.00 - 24.15');
      r = _peSS(sh, r, 1, 'PAUSA', '24.15 - 24.30');
      r = _peSPP(sh, ctx, r, 1, 'S7', '24.30 - 24.45', nS7);
      r = _peSS(sh, r, 1, 'SALA', '24.45 - 01.00');
      r = _peSPP(sh, ctx, r, 1, 'S8', '01.00 - 01.15', nS7);
      r = _peSS(sh, r, 1, 'SALA', '01.15 - 02.00');
      r = _peSS(sh, r, 1, 'PAUSA', '02.00 - 02.15');
      r = _peSPP(sh, ctx, r, 1, 'S7', '02.15 - 02.30', nS7);
      r = _peSS(sh, r, 1, 'SALA', '02.30 - 03.00');
      r = _peSPP(sh, ctx, r, 1, 'S8', '03.00 - 03.15', nS7);
      r = _peSS(sh, r, 1, 'SALA', '03.15 - 04.00');
    } else {
      r = _peSS(sh, r, 1, 'SALA', '20.00 - 21.30');
      r = _peSS(sh, r, 1, 'PAUSA', '21.30 - 22.00');
      if (sA) r = _peSPP(sh, ctx, r, 1, sA, '22.00 - 22.15', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '22.00 - 22.15');
      if (sB) r = _peSPP(sh, ctx, r, 1, sB, '22.15 - 22.30', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '22.15 - 22.30');
      r = _peSPP(sh, ctx, r, 1, 'S8', '22.30 - 23.00', nS7);
      r = _peSS(sh, r, 1, 'SALA', '23.00 - 24.00');
      r = _peSS(sh, r, 1, 'PAUSA', '24.00 - 24.15');
      if (sB) r = _peSPP(sh, ctx, r, 1, sB, '24.15 - 24.30', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '24.15 - 24.30');
      r = _peSS(sh, r, 1, 'SALA', '24.30 - 24.45');
      if (sA) r = _peSPP(sh, ctx, r, 1, sA, '24.45 - 01.00', nS7);
      else r = _peSS(sh, r, 1, 'SALA', '24.45 - 01.00');
      r = _peSPP(sh, ctx, r, 1, 'S8', '01.00 - 01.15', nS7);
      r = _peSS(sh, r, 1, 'SALA', '01.15 - 02.00');
      r = _peSS(sh, r, 1, 'PAUSA', '02.00 - 02.15');
      r = _peSS(sh, r, 1, 'SALA', '02.15 - 03.00');
      r = _peSPP(sh, ctx, r, 1, 'S8', '03.00 - 03.15', nS7);
      r = _peSS(sh, r, 1, 'SALA', '03.15 - 04.00');
    }
  }

  if (nCassaSec && numC8Eff >= 3) {
    _peScrHeader(sh, startR2, 4, lblSec, nCassaSec, '20.50 - 05.00', _PE_CLR.azzurro);
    r = startR2 + 2;
    r = _peSPPC(sh, ctx, r, 4, 'C5', '01.45 - 02.00', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C15', '02.00 - 02.15', nCassaSec);
    r = _peSS(sh, r, 4, 'PAUSA', '02.15 - 02.30');
    r = _peSN(sh, ctx, r, 4, 'C8', '02.30 - 02.45', nCassaSec, nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '02.45 - 03.00', nCassaSec, nCassaSec);
    r = _peSS(sh, r, 4, 'CASSA', '03.00 - 05.00');
    const startAlt = _peMaxR(sh) + 3;
    _peScrHeader(sh, startAlt, 4, lblSec + ' (ALT.)', nCassaSec, '20.50 - 05.00', _PE_CLR.azzurro);
    r = startAlt + 2;
    r = _peSPPC(sh, ctx, r, 4, 'C5', '21.00 - 21.30', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C15', '21.30 - 22.00', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C20', '22.00 - 22.30', nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '22.30 - 23.00', nCassaSec, nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '23.00 - 23.30', nCassaSec, nCassaSec);
    r = _peSS(sh, r, 4, 'PAUSA', '23.30 - 24.00');
    r = _peSS(sh, r, 4, 'CASSA', '24.00 - 24.15');
    r = _peSPPC(sh, ctx, r, 4, 'C5', '24.15 - 24.30', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C15', '24.30 - 24.45', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C20', '24.45 - 01.00', nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '01.00 - 01.15', nCassaSec, nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '01.15 - 01.30', nCassaSec, nCassaSec);
    r = _peSS(sh, r, 4, 'PAUSA', '01.30 - 01.45');
    r = _peSPPC(sh, ctx, r, 4, 'C5', '01.45 - 02.00', nCassaSec);
    r = _peSPPC(sh, ctx, r, 4, 'C15', '02.00 - 02.15', nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '02.15 - 02.30', nCassaSec, nCassaSec);
    r = _peSN(sh, ctx, r, 4, 'C8', '02.30 - 02.45', nCassaSec, nCassaSec);
    r = _peSS(sh, r, 4, 'PAUSA', '02.45 - 03.00');
    r = _peSS(sh, r, 4, 'CASSA', '03.00 - 05.00');
  }

  if (numR8 === 1 && nR8) {
    const startR8b = _peMaxR(sh) + 3;
    _peScrHeader(sh, startR8b, 4, 'R8', nR8, '20.50 - 05.00', _PE_CLR.verdeScuro);
    r = startR8b + 2;
    r = _peSS(sh, r, 4, 'PAUSA', '02.00 - 02.15');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.15 - 02.30', nR8);
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.30 - 02.45', nR8);
      r = _peSS(sh, r, 4, 'REC', '02.45 - 03.15');
    } else if (numR23 === 1) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '02.15 - 02.30', nR8);
      r = _peSS(sh, r, 4, 'REC', '02.30 - 03.15');
    } else {
      r = _peSS(sh, r, 4, 'REC', '02.15 - 03.15');
    }
    r = _peSN(sh, ctx, r, 4, 'R8', '03.15 - 03.30', nR8, nR8);
    r = _peSS(sh, r, 4, 'PAUSA', '03.30 - 03.45');
    r = _peSS(sh, r, 4, 'REC', '03.45 - 05.00');
  } else if (numR8 === 0 && nR23) {
    const startR23 = _peMaxR(sh) + 3;
    _peScrHeader(sh, startR23, 4, 'R23', nR23, '19.50 - 04.00', _PE_CLR.rec);
    r = startR23 + 2;
    r = _peSS(sh, r, 4, 'PAUSA', '02.00 - 02.15');
    r = _peSS(sh, r, 4, 'REC', '02.15 - 03.30');
    r = _peSS(sh, r, 4, 'PAUSA', '03.30 - 03.45');
    r = _peSS(sh, r, 4, 'REC', '03.45 - 04.00');
  }

  if (bg1.bg1IsC23 && bg1.nS1Orig) {
    const startS1vs = _peMaxR(sh) + 3;
    _peScrHeader(sh, startS1vs, 1, bg1.lblS1Orig, bg1.nS1Orig, '14.00 - 21.00', _PE_CLR.sala);
    _pePatternS1_SoloSala(sh, ctx, startS1vs + 2, 1, bg1.nS1Orig);
  }
  _pePiazzaPauseExtra(sh, ctx);
}

// ---------- pause extra + blocchi automatici ----------
function _peSlotInTurno(ctx, oraCell, turno) {
  if (!oraCell) return false;
  const o = ctx.orari[turno];
  if (!o) return true;
  const p = String(oraCell).indexOf(' - ');
  if (p < 0) return false;
  let slotMin = _peOraMin(String(oraCell).substring(0, p).trim());
  if (slotMin == null) return false;
  let tIni = o.ini;
  let tFin = o.fin;
  if (slotMin < 720 && tIni >= 720) slotMin += 1440;
  return slotMin >= tIni && slotMin < tFin;
}
function _pePiazzaPauseExtra(sh, ctx) {
  const lastR = _peMaxR(sh);
  if (lastR < 7) return;
  Object.keys(ctx.dT).forEach((posStr) => {
    if (['PAUSA', 'SALA', 'CASSA', 'REC'].includes(posStr)) return;
    if (posStr[0] === 'C') return;
    if (['R8', 'S31', 'R31', 'R30', 'R4', 'R23', 'R24', 'S5', '9', 'L1', 'Z0', 'Z8', 'Z5', 'Z12'].includes(posStr))
      return;
    // e' un BG? (header con nome e orario sotto)
    for (let c = 1; c <= 7; c += 3) {
      for (let hdrR = 1; hdrR < lastR; hdrR++) {
        const a = _peGet(sh, hdrR, c);
        if (a && String(a.v).toUpperCase().trim() === posStr.toUpperCase()) {
          const nx = _peGet(sh, hdrR, c + 1);
          const below = _peGet(sh, hdrR + 1, c + 1);
          if (nx && String(nx.v).length && below && String(below.v).includes(' - ')) return;
        }
      }
    }
    // ha gia' slot?
    for (let c = 1; c <= 7; c += 3)
      for (let rr = 7; rr <= lastR; rr++) {
        const cell = _peGet(sh, rr, c);
        if (cell && String(cell.v) === posStr) return;
      }
    const minPausa = _peMinutiPausa(ctx.orari, posStr);
    if (!minPausa) return;
    const slotsNeeded = Math.floor(minPausa / 15);
    // MIGLIORIA rispetto al VBA (che prendeva i primi slot SALA trovati,
    // spesso ammucchiati): raccolgo TUTTI gli slot SALA nel turno e li
    // scelgo distribuiti — ideali a frazioni del turno, minimo 45' tra loro
    const candidati = [];
    for (let c = 1; c <= 7; c += 3)
      for (let rr = 7; rr <= lastR; rr++) {
        const cell = _peGet(sh, rr, c);
        if (cell && String(cell.v) === 'SALA') {
          const ora = _peGet(sh, rr, c + 1);
          if (ora && _peSlotInTurno(ctx, ora.v, posStr)) {
            let min = _peOraMin(String(ora.v).split('-')[0].trim());
            if (min != null) {
              const oo = ctx.orari[posStr];
              if (oo && min < 720 && oo.ini >= 720) min += 1440;
              candidati.push({ cell: cell, ora: ora, min: min });
            }
          }
        }
      }
    candidati.sort((a, b) => a.min - b.min);
    let piazzati = 0;
    const o = ctx.orari[posStr];
    if (o && candidati.length) {
      const usati = [];
      for (let k = 1; k <= slotsNeeded; k++) {
        const ideale = o.ini + ((o.fin - o.ini) * k) / (slotsNeeded + 1);
        let best = null;
        let bestScore = -Infinity;
        candidati.forEach((cand) => {
          if (usati.includes(cand)) return;
          let score = -Math.abs(cand.min - ideale);
          if (usati.some((u) => Math.abs(u.min - cand.min) < 45)) score -= 10000;
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        });
        if (best) usati.push(best);
      }
      usati.forEach((cand) => {
        cand.cell.v = posStr;
        cand.cell.bg = _PE_CLR.arancio;
        cand.cell.b = 1;
        cand.ora.bg = _PE_CLR.arancio;
        cand.ora.b = 1;
        piazzati++;
      });
    }
    if (piazzati < slotsNeeded) {
      const noteR = _peMaxR(sh) + 1;
      _peSet(sh, noteR, 1, '! ' + posStr + ': pausa non coperta (' + piazzati * 15 + '/' + minPausa + ' min)', {
        bg: _PE_CLR.rosso,
        fg: '#fff',
        b: 1,
        span: 2,
      });
    }
  });
}
function _peGeneraExtra(sh, ctx, tipoGiorno) {
  const dictCoperti = {};
  ['S1', 'S22', 'S3', 'S7', 'S7C', 'R7C', 'S8C', 'S31', 'S5', 'R8', 'C8', 'R4', 'C20'].forEach(
    (k) => (dictCoperti[k] = 1),
  );
  ['C0', 'C23', 'C4', 'C5', 'C15', 'R22', 'R23', 'R24', 'S22', 'S8', 'S25'].forEach((k) => (dictCoperti[k] = 1));
  dictCoperti['S7'] = 2;
  dictCoperti['S3'] = 2;
  dictCoperti['S7C'] = 2;
  dictCoperti['S5'] = 2;
  dictCoperti['S8'] = 2;
  dictCoperti['S22'] = 2;
  dictCoperti['R8'] = 2;
  dictCoperti['R22'] = 2;
  dictCoperti['R23'] = 2;
  dictCoperti['R24'] = 1;
  dictCoperti['C8'] = 3;
  ['C20', 'C0', 'C23', 'C4', 'C5', 'C15', '9', 'L1', 'Z0', 'Z8', 'Z5', 'S31', 'Z12'].forEach(
    (k) => (dictCoperti[k] = 99),
  );

  const extraNomi = {};
  Object.keys(ctx.dT).forEach((turno) => {
    const presenti = _peConta(ctx.dT, turno);
    const copertiMax = dictCoperti[turno] !== undefined ? dictCoperti[turno] : 0;
    const extra = presenti - copertiMax;
    if (extra > 0 && ctx.orari[turno] && _peMinutiPausa(ctx.orari, turno) > 0) {
      for (let i = copertiMax; i < ctx.dT[turno].length; i++) {
        const nome = ctx.dT[turno][i].trim();
        if (nome && extraNomi[nome] === undefined) extraNomi[nome] = turno;
      }
    }
  });
  Object.keys(ctx.dN).forEach((nome) => {
    const turno = ctx.dN[nome];
    if (dictCoperti[turno] === undefined && extraNomi[nome] === undefined) {
      if (ctx.orari[turno] && _peMinutiPausa(ctx.orari, turno) > 0) extraNomi[nome] = turno;
    }
  });
  Object.keys(extraNomi).forEach((nome) => {
    const turno = extraNomi[nome];
    const sett = _peSettoreTurno(turno);
    const pauseMin = _peMinutiPausa(ctx.orari, turno);
    const clrH =
      sett === 'S' ? _PE_CLR.sala : sett === 'R' ? _PE_CLR.rec : sett === 'C' ? _PE_CLR.cassa : _PE_CLR.grigio;
    const startR = _peMaxR(sh) + 3;
    const o = ctx.orari[turno];
    _peScrHeader(sh, startR, 1, turno, nome, o ? o.iniStr + ' - ' + o.finStr : '', clrH);
    _peGeneraPauseAuto(sh, startR + 2, 1, turno, ctx, pauseMin);
  });
}
function _peNomeSettore(sett) {
  return sett === 'R' ? 'REC' : sett === 'C' ? 'CASSA' : 'SALA';
}
function _peGeneraPauseAuto(sh, startR, col, turno, ctx, pauseMin) {
  let r = startR;
  const sett = _peSettoreTurno(turno);
  const o = ctx.orari[turno];
  if (!o) return;
  const durTot = o.fin - o.ini;
  const split = _pePauseSplit(ctx.orari, turno);
  const numPause = split.length;
  if (!numPause) return;
  const intervallo = durTot / (numPause + 1);
  let prevEnd = o.ini;
  for (let k = 1; k <= numPause; k++) {
    let curMin = Math.floor((o.ini + intervallo * k) / 15) * 15;
    const curDur = split[k - 1];
    if (curMin > prevEnd)
      r = _peSS(sh, r, col, _peNomeSettore(sett), _peMinToOra(prevEnd) + ' - ' + _peMinToOra(curMin));
    r = _peSS(sh, r, col, 'PAUSA', _peMinToOra(curMin) + ' - ' + _peMinToOra(curMin + curDur));
    prevEnd = curMin + curDur;
  }
  if (prevEnd < o.fin) r = _peSS(sh, r, col, _peNomeSettore(sett), _peMinToOra(prevEnd) + ' - ' + _peMinToOra(o.fin));
}
function _peCompattaSala(sh) {
  const lastR = _peMaxR(sh);
  [1, 4, 7].forEach((col) => {
    let startSala = 0;
    let blockType = '';
    let startTime = '';
    let endTime = '';
    const chiudi = (endR) => {
      if (endR - startSala >= 1) {
        const first = _peGet(sh, startSala, col + 1);
        if (first) first.v = startTime + ' - ' + endTime;
        for (let k = startSala + 1; k <= endR; k++) {
          delete sh.celle[k + '|' + col];
          delete sh.celle[k + '|' + (col + 1)];
        }
      }
    };
    for (let r = 7; r <= lastR + 1; r++) {
      let cellVal = '';
      const cell = r <= lastR ? _peGet(sh, r, col) : null;
      if (cell) cellVal = String(cell.v).toUpperCase().trim();
      if (cellVal === 'SALA' || cellVal === 'REC' || cellVal === 'CASSA') {
        const oraCell = _peGet(sh, r, col + 1);
        const orario = oraCell ? String(oraCell.v).trim() : '';
        if (!startSala || cellVal !== blockType) {
          if (startSala && cellVal !== blockType) chiudi(r - 1);
          startSala = r;
          blockType = cellVal;
          const p = orario.indexOf('-');
          startTime = p > 0 ? orario.substring(0, p).trim() : orario;
        }
        const p2 = orario.indexOf('-');
        endTime = p2 > 0 ? orario.substring(p2 + 1).trim() : orario;
      } else if (startSala) {
        chiudi(r - 1);
        startSala = 0;
        blockType = '';
      }
    }
  });
}

// ---------- MAIN slots ----------
function _peGeneraSlots(righe, dstr) {
  const dow = new Date(dstr + 'T12:00:00').getDay();
  const tipoGiorno = dow === 0 ? 'DOM' : dow >= 5 ? 'VEN-SAB' : 'LUN-GIO';
  const dT = {};
  const dN = {};
  const c8Nomi = [];
  const c8Cd = [];
  (righe || []).forEach((r) => {
    const nome = (r.nome || '').trim();
    const turno = String(r.turno || '')
      .trim()
      .toUpperCase();
    if (!nome || !turno) return;
    if (turno === 'C8') {
      c8Nomi.push(nome);
      c8Cd.push(parseInt(r.cd) || 0);
    }
    if (dN[nome] === undefined) dN[nome] = turno;
    if (!dT[turno]) dT[turno] = [];
    dT[turno].push(nome);
  });
  if (!Object.keys(dT).length) return null;
  const ctx = { dT: dT, dN: dN, dc: _peCompetenze(righe), orari: _peOrariTurni(), c8Nomi: c8Nomi, c8Cd: c8Cd };
  const sh = _peSheet();
  const dataStr = dstr.split('-').reverse().join('.');
  if (tipoGiorno === 'LUN-GIO') _peGeneraLunGio(sh, ctx, dataStr);
  else if (tipoGiorno === 'VEN-SAB') _peGeneraVenSab(sh, ctx, dataStr);
  else _peGeneraDomenica(sh, ctx, dataStr);
  _peGeneraExtra(sh, ctx, tipoGiorno);
  _peCompattaSala(sh);
  return { tipo: 'slots', celle: sh.celle, nR: _peMaxR(sh), tipoGiorno: tipoGiorno };
}

// ---------- MAIN valet (port ModuloPauseValet v2) ----------
function _peGeneraValet(righe, dstr) {
  const dow = new Date(dstr + 'T12:00:00').getDay();
  const isWknd = dow === 5 || dow === 6;
  const cfg = _briefPauseCfg();
  const GAP_MIN = parseInt(cfg.valet_gap) || 45;
  const WIN_MIN = 90;
  const PEAK_S =
    _peOraMin(cfg.picco_da) != null ? _peOraMin(cfg.picco_da) + (_peOraMin(cfg.picco_da) < 660 ? 1440 : 0) : 1380;
  const PEAK_E =
    _peOraMin(cfg.picco_a) != null ? _peOraMin(cfg.picco_a) + (_peOraMin(cfg.picco_a) < 660 ? 1440 : 0) : 1500;
  const orari = _peOrariTurni();
  const valet = [];
  (righe || []).forEach((r) => {
    const nome = (r.nome || '').trim();
    const sigla = String(r.turno || '')
      .trim()
      .toUpperCase();
    if (!nome || !sigla) return;
    let o = orari[sigla];
    if (!o && r.oi && r.of) {
      const a = _peOraMin(r.oi);
      let b = _peOraMin(r.of);
      if (a != null && b != null) {
        if (b <= a) b += 1440;
        o = { ini: a, fin: b, iniStr: _peOrarioPunti(r.oi), finStr: _peOrarioPunti(r.of), dur: b - a };
      }
    }
    if (!o) return;
    valet.push({ nome: nome.toUpperCase(), sigla: sigla, ini: o.ini, fin: o.fin });
  });
  if (!valet.length) return null;
  // elenco pause con ideale
  const pause = []; // {vi, dur, ideal, start, end}
  valet.forEach((v, vi) => {
    const dur = v.fin - v.ini;
    let arr;
    const pers = (cfg.turni || {})[v.sigla];
    if (pers) {
      const split = String(pers)
        .split(/[+,;\s]+/)
        .map((x) => parseInt(x))
        .filter((x) => x > 0);
      const fr = { 1: [0.5], 2: [0.34, 0.67], 3: [0.22, 0.5, 0.78] }[Math.min(split.length, 3)] || [];
      arr = split.slice(0, 3).map((d, k) => [d, fr[k]]);
      if (!arr.length) return;
    } else if (dur < 360) arr = [[15, 0.5]];
    else if (dur < 420)
      arr = [
        [15, 0.34],
        [15, 0.67],
      ];
    else if (dur < 480)
      arr = [
        [30, 0.3],
        [15, 0.7],
      ];
    else
      arr = [
        [30, 0.22],
        [15, 0.5],
        [15, 0.78],
      ];
    arr.forEach(([d, fr]) => {
      pause.push({ vi: vi, dur: d, ideal: Math.floor((v.ini + dur * fr) / 15) * 15, start: 0, end: 0 });
    });
  });
  const ord = pause.map((_, i) => i).sort((a, b) => pause[a].ideal - pause[b].ideal);
  const slotLibero = (s, e, selfIdx) => {
    for (let j = 0; j < pause.length; j++) {
      if (j !== selfIdx && pause[j].end > 0 && s < pause[j].end && e > pause[j].start) return false;
    }
    return true;
  };
  const cercaSlot = (lo, hi, L, ideal, minStart, selfIdx) => {
    let best = -1;
    let bestScore = -Infinity;
    let c = lo < minStart ? minStart : lo;
    c = Math.floor(c / 15) * 15;
    if (c < minStart) c += 15;
    while (c + L <= hi) {
      if (slotLibero(c, c + L, selfIdx)) {
        let sc = -Math.abs(c - ideal);
        if (isWknd && c < PEAK_E && c + L > PEAK_S) sc -= 100000;
        if (sc > bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      c += 15;
    }
    return best;
  };
  const lastEnd = valet.map((v) => v.ini);
  ord.forEach((idx) => {
    const p = pause[idx];
    const v = valet[p.vi];
    let minStart = v.ini + GAP_MIN;
    if (lastEnd[p.vi] + GAP_MIN > minStart) minStart = lastEnd[p.vi] + GAP_MIN;
    let lo = p.ideal - WIN_MIN;
    let hi = p.ideal + WIN_MIN;
    if (hi > v.fin) hi = v.fin;
    let best = cercaSlot(lo, hi, p.dur, p.ideal, minStart, idx);
    if (best < 0) best = cercaSlot(minStart, v.fin, p.dur, p.ideal, minStart, idx);
    if (best < 0) {
      best = p.ideal;
      if (best + p.dur > v.fin) best = v.fin - p.dur;
      if (best < v.ini) best = v.ini;
    }
    p.start = best;
    p.end = best + p.dur;
    if (p.end > lastEnd[p.vi]) lastEnd[p.vi] = p.end;
  });
  // righe output ordinate per prima pausa
  const firstBk = valet.map(() => Infinity);
  pause.forEach((p) => {
    if (p.start < firstBk[p.vi]) firstBk[p.vi] = p.start;
  });
  const vord = valet.map((_, i) => i).sort((a, b) => firstBk[a] - firstBk[b]);
  const out = vord.map((vi) => {
    const v = valet[vi];
    const mie = pause.filter((p) => p.vi === vi).sort((a, b) => a.start - b.start);
    return {
      turno: v.sigla,
      nome: v.nome,
      orario: _peMinToOra(v.ini) + ' - ' + _peMinToOra(v.fin),
      pause: mie.map((p) => _peMinToOra(p.start) + ' - ' + _peMinToOra(p.end)),
    };
  });
  return {
    tipo: 'valet',
    tipoGiorno: isWknd ? 'VEN-SAB' : dow === 0 ? 'DOM' : 'LUN-GIO',
    righe: out,
    nota:
      _briefPauseCfg().valet_nota ||
      "NOTA: chi termina il turno prima del previsto (es. un X1 che esce alle 19.00) di norma NON fa l'ultima pausa da 15 min.",
  };
}

// ============================================================
// GENERAZIONE + RENDERING + EDITING (chiamati da piano.js)
// ============================================================
async function briefGeneraPause() {
  if (!puoGestirePiano() || !_briefState) return;
  const righe = (_briefState.righe || []).filter((r) => r.nome && r.turno);
  if (!righe.length) {
    toast('Compila prima il briefing (nomi e turni)');
    return;
  }
  if (_briefState.pause && _briefState.pause.contenuto && _briefState.pause.contenuto.tipo) {
    if (!confirm('Sovrascrivo le pause già generate per questa data?')) return;
  }
  // slots = pattern manuali (dal tuo Excel); valet e ogni altro settore =
  // motore algoritmico (durate per fascia, gap, una-alla-volta)
  const contenuto = _pianoReparto() === 'slots' ? _peGeneraSlots(righe, _briefData) : _peGeneraValet(righe, _briefData);
  if (!contenuto) {
    toast('Nessun turno riconosciuto per generare le pause');
    return;
  }
  try {
    if (_briefState.pause && _briefState.pause.id) {
      await secPatch('piano_briefing', 'id=eq.' + _briefState.pause.id, {
        contenuto: contenuto,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
      _briefState.pause.contenuto = contenuto;
    } else {
      const nuovo = await secPost('piano_briefing', {
        data: _briefData,
        reparto_dip: _pianoReparto(),
        sezione: 'pause',
        contenuto: contenuto,
        operatore: getOperatore(),
      });
      _briefState.pause = nuovo && nuovo[0] ? nuovo[0] : { id: null, contenuto: contenuto };
    }
    logAzione('Pause generate', _pianoReparto() + ' ' + _briefData);
    toast('Pause generate');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio pause');
  }
}
let _briefPauseSaveTimer = null;
function _briefSalvaPauseDebounce() {
  clearTimeout(_briefPauseSaveTimer);
  _briefPauseSaveTimer = setTimeout(async () => {
    if (!_briefState || !_briefState.pause) return;
    try {
      await secPatch('piano_briefing', 'id=eq.' + _briefState.pause.id, {
        contenuto: _briefState.pause.contenuto,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {}
  }, 900);
}
function _briefRefreshPause() {
  const el = document.getElementById('brief-pause-body');
  if (el && typeof _briefPauseBodyHtml === 'function') el.innerHTML = _briefPauseBodyHtml();
}
function briefPausaInsRiga(base, r) {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  // sposta in giù di 1 le celle di QUESTA coppia di colonne sotto la riga r
  for (let rr = c.nR + 1; rr > r + 1; rr--) {
    [base, base + 1].forEach((col) => {
      const k = rr - 1 + '|' + col;
      if (c.celle[k]) {
        c.celle[rr + '|' + col] = c.celle[k];
        delete c.celle[k];
      }
    });
  }
  c.celle[r + 1 + '|' + base] = { v: '', ins: 1 };
  c.celle[r + 1 + '|' + (base + 1)] = { v: '', ins: 1 };
  if (r + 1 > c.nR) c.nR = r + 1;
  else c.nR = c.nR + 1;
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
function briefPausaDelRiga(base, r) {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  delete c.celle[r + '|' + base];
  delete c.celle[r + '|' + (base + 1)];
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
// modifica cella pause slots (r|c del foglio virtuale)
function briefPausaCellaSlots(r, c, val) {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  const g = _briefState.pause.contenuto.celle;
  const k = r + '|' + c;
  if (!val.trim()) {
    delete g[k];
  } else {
    const prev = g[k] || {};
    const isPos = c % 3 === 1; // colonne 1/4/7 = postazione
    const nuovo = { v: val.trim(), b: prev.b, sz: prev.sz, span: prev.span, center: prev.center };
    if (isPos && !prev.span) {
      const clr = _peColoreSettore(val.trim());
      nuovo.bg = clr;
      // aggiorna anche la cella orario affiancata
      const ora = g[r + '|' + (c + 1)];
      if (ora && !ora.span) {
        ora.bg = clr;
        delete ora.fg;
        ora.v = String(ora.v).replace(/\s*\[!\]\s*$/, '');
      }
    } else {
      nuovo.bg = prev.bg;
      nuovo.fg = prev.fg;
    }
    g[k] = nuovo;
  }
  _briefSalvaPauseDebounce();
}
// modifica pause valet (riga i, pausa k o campo)
function briefPausaCellaValet(i, campo, val) {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  if (campo === 'p0' || campo === 'p1' || campo === 'p2') {
    const k = parseInt(campo[1]);
    c.righe[i].pause[k] = val.trim();
    c.righe[i].pause = c.righe[i].pause.filter((x) => x);
  } else {
    c.righe[i][campo] = val;
  }
  _briefSalvaPauseDebounce();
  // rirender solo elenco cronologico
  const el = document.getElementById('brief-crono');
  if (el) el.innerHTML = _briefRenderCronoValet(c);
}
function briefValetAddRiga() {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  _briefState.pause.contenuto.righe.push({ turno: '', nome: '', orario: '', pause: [] });
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
function briefValetDelRiga(i) {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause) return;
  _briefState.pause.contenuto.righe.splice(i, 1);
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
async function briefEliminaPause() {
  if (!puoGestirePiano() || !_briefState || !_briefState.pause || !_briefState.pause.id) return;
  if (!confirm('Elimino le pause di questa data?')) return;
  await secDel('piano_briefing', 'id=eq.' + _briefState.pause.id);
  _briefState.pause = null;
  renderPiano();
}
// ---------- rendering ----------
function _briefRenderPause(c) {
  if (c.tipo === 'valet') return _briefRenderPauseValet(c);
  return _briefRenderPauseSlots(c);
}
function _briefRenderPauseSlots(c) {
  const puo = puoGestirePiano();
  let h = '';
  const tit = c.celle['1|1'];
  const dataC = c.celle['2|1'];
  const sotto = c.celle['3|1'];
  h += '<div style="max-width:580px">';
  if (tit)
    h +=
      '<div style="border:1px solid #999;background:' +
      (tit.bg || '#FFFF00') +
      ';font-weight:bold;text-align:center;padding:4px;font-size:.95rem">' +
      escP(tit.v) +
      '</div>';
  if (dataC) h += '<div style="font-weight:bold;font-size:.8rem;padding:2px 0">' + escP(dataC.v) + '</div>';
  if (sotto)
    h +=
      '<div style="border:1px solid #999;background:' +
      (sotto.bg || '#FFFF00') +
      ';font-weight:bold;text-align:center;padding:3px;font-size:.85rem">' +
      escP(sotto.v) +
      '</div>';
  h += '</div>';
  // 3 pile compatte affiancate: le righe vuote spariscono, resta solo un
  // piccolo stacco prima di ogni nuovo blocco (header turno)
  h += '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-top:10px">';
  [1, 4, 7].forEach((base) => {
    const righe = [];
    for (let r = 4; r <= c.nR; r++) {
      const a = c.celle[r + '|' + base];
      const b = c.celle[r + '|' + (base + 1)];
      if ((a && (String(a.v).trim() !== '' || a.ins)) || (b && (String(b.v).trim() !== '' || b.ins)))
        righe.push({ r: r, a: a, b: b });
    }
    if (!righe.length) return;
    let t =
      '<table style="border-collapse:collapse;font-size:.78rem;table-layout:fixed"><colgroup><col style="width:58px"><col style="width:112px"></colgroup>';
    righe.forEach((riga, idx) => {
      const isHdr = (riga.a && riga.a.hdr) || (riga.b && riga.b.hdr);
      if (isHdr && idx > 0) t += '<tr><td colspan="2" style="border:none;height:12px"></td></tr>';
      if (!riga.a && riga.b) {
        // riga orario sotto l\'header: una cella unica, niente buco a sinistra
        t +=
          '<tr><td colspan="2" style="border:1px solid #999;font-weight:bold;padding:2px 6px;text-align:center">' +
          escP(riga.b.v) +
          '</td></tr>';
        return;
      }
      if (riga.a && riga.a.span) {
        t +=
          '<tr><td colspan="2" style="border:1px solid #999;background:' +
          (riga.a.bg || '#fff') +
          ';color:' +
          (riga.a.fg || '#000') +
          ';font-weight:bold;padding:2px 6px">' +
          escP(riga.a.v) +
          '</td></tr>';
        return;
      }
      t += '<tr>';
      [
        [riga.a, base],
        [riga.b, base + 1],
      ].forEach(([cell, col]) => {
        if (!cell) {
          t += '<td style="border:1px solid #999">&nbsp;</td>';
          return;
        }
        const stile =
          'border:1px solid #999;background:' +
          (cell.bg || 'transparent') +
          ';color:' +
          (cell.fg || 'inherit') +
          ';padding:0';
        if (puo) {
          t +=
            '<td style="' +
            stile +
            '"><input value="' +
            escP(cell.v) +
            '" onchange="briefPausaCellaSlots(' +
            riga.r +
            ',' +
            col +
            ',this.value)" style="width:100%;border:none;background:transparent;color:inherit;font:inherit;' +
            (cell.b ? 'font-weight:bold;' : '') +
            'padding:2px 4px;font-size:.78rem"></td>';
        } else {
          t +=
            '<td style="' +
            stile +
            ';padding:2px 4px;' +
            (cell.b ? 'font-weight:bold' : '') +
            '">' +
            escP(cell.v) +
            '</td>';
        }
      });
      if (puo)
        t +=
          '<td style="border:none;padding:0 3px;white-space:nowrap">' +
          '<span style="cursor:pointer;color:#2c6e49;font-weight:bold" title="Inserisci riga sotto" onclick="briefPausaInsRiga(' +
          base +
          ',' +
          riga.r +
          ')">+</span> ' +
          '<span style="cursor:pointer;color:#c0392b;font-weight:bold" title="Elimina riga" onclick="briefPausaDelRiga(' +
          base +
          ',' +
          riga.r +
          ')">×</span></td>';
      t += '</tr>';
    });
    t += '</table>';
    h += '<div>' + t;
    if (puo)
      h +=
        '<button class="btn-export" style="font-size:.72rem;padding:2px 8px;margin-top:4px" onclick="briefPausaInsRiga(' +
        base +
        ',' +
        (righe.length ? righe[righe.length - 1].r : 6) +
        ')">+ riga</button>';
    h += '</div>';
  });
  h += '</div>';
  if (puo)
    h +=
      '<div style="margin-top:8px"><button class="btn-export" style="font-size:.78rem;padding:4px 10px;border-color:#c0392b;color:#c0392b" onclick="briefEliminaPause()">Elimina pause</button></div>';
  return h;
}
function _briefParseIntv(s) {
  const p = String(s).split('-');
  if (p.length < 2) return null;
  let a = _peOraMin(p[0].trim());
  let b = _peOraMin(p[1].trim());
  if (a == null || b == null) return null;
  if (a < 660) a += 1440; // dopo mezzanotte
  if (b <= a) b += 1440;
  return [a, b];
}
function _briefRenderCronoValet(c) {
  const eventi = [];
  (c.righe || []).forEach((r) => {
    (r.pause || []).forEach((p) => {
      const iv = _briefParseIntv(p);
      if (iv) eventi.push({ s: iv[0], e: iv[1], nome: r.nome, turno: r.turno, txt: p });
    });
  });
  eventi.sort((a, b) => a.s - b.s);
  let h =
    '<table style="border-collapse:collapse;font-size:.8rem;margin-top:12px"><tr><td colspan="4" style="border:1px solid #999;background:#FFFF00;font-weight:bold;padding:3px 8px">ORDINE PAUSE (una alla volta)</td></tr>';
  h +=
    '<tr>' +
    ['ORARIO', 'NOME', 'TURNO', 'DURATA']
      .map(
        (x) => '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:.75rem">' + x + '</th>',
      )
      .join('') +
    '</tr>';
  let prevEnd = -1;
  let sovrapposte = 0;
  eventi.forEach((ev) => {
    const overlap = prevEnd >= 0 && ev.s < prevEnd;
    if (overlap) sovrapposte++;
    const bg = overlap ? 'background:#FF5050;color:#fff;' : '';
    h +=
      '<tr><td style="border:1px solid #999;padding:2px 8px;' +
      bg +
      '">' +
      escP(ev.txt) +
      '</td><td style="border:1px solid #999;padding:2px 8px;' +
      bg +
      '">' +
      escP(ev.nome) +
      '</td><td style="border:1px solid #999;padding:2px 8px;' +
      bg +
      '">' +
      escP(ev.turno) +
      '</td><td style="border:1px solid #999;padding:2px 8px;' +
      bg +
      '">' +
      (ev.e - ev.s) +
      ' min</td></tr>';
    if (ev.e > prevEnd) prevEnd = ev.e;
  });
  h += '</table>';
  if (sovrapposte)
    h +=
      '<p style="color:#c0392b;font-weight:bold;font-size:.8rem;margin-top:6px">Attenzione: ' +
      sovrapposte +
      ' sovrapposizioni (righe rosse)</p>';
  return h;
}
function _briefRenderPauseValet(c) {
  const puo = puoGestirePiano();
  let h =
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:.82rem"><tr><td colspan="6" style="border:1px solid #999;background:#FFFF00;font-weight:bold;text-align:center;padding:4px">PAUSE VALET — ' +
    escP(c.tipoGiorno || '') +
    '</td></tr><tr>' +
    ['TURNO', 'NOME', 'ORARIO', 'PAUSA 1', 'PAUSA 2', 'PAUSA 3']
      .map(
        (x) => '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:.75rem">' + x + '</th>',
      )
      .join('') +
    '</tr>';
  (c.righe || []).forEach((r, i) => {
    h += '<tr>';
    const cInp = (campo, val, larg, extra) =>
      puo
        ? '<td style="border:1px solid #999;padding:0"><input value="' +
          escP(val || '') +
          '" onchange="briefPausaCellaValet(' +
          i +
          ",'" +
          campo +
          '\',this.value)" style="width:' +
          larg +
          'px;border:none;background:transparent;font:inherit;' +
          (extra || '') +
          'padding:2px 6px;font-size:.78rem"></td>'
        : '<td style="border:1px solid #999;padding:2px 8px;' + (extra || '') + '">' + escP(val || '') + '</td>';
    h += cInp('turno', r.turno, 55, 'font-weight:bold;');
    h += cInp('nome', r.nome, 150);
    h += cInp('orario', r.orario, 100);
    for (let k = 0; k < 3; k++) {
      const val = (r.pause || [])[k] || '';
      if (puo) {
        h +=
          '<td style="border:1px solid #999;background:' +
          (val ? '#FFE0B2' : '#fff') +
          ';padding:0"><input value="' +
          escP(val) +
          '" onchange="briefPausaCellaValet(' +
          i +
          ",'p" +
          k +
          '\',this.value)" style="width:105px;border:none;background:transparent;font:inherit;text-align:center;padding:2px 4px;font-size:.78rem"></td>';
      } else {
        h +=
          '<td style="border:1px solid #999;background:' +
          (val ? '#FFE0B2' : '#fff') +
          ';padding:2px 8px;text-align:center">' +
          escP(val) +
          '</td>';
      }
    }
    if (puo)
      h +=
        '<td style="border:none;padding:0 4px"><span style="cursor:pointer;color:#c0392b;font-weight:bold" title="Elimina riga" onclick="briefValetDelRiga(' +
        i +
        ')">×</span></td>';
    h += '</tr>';
  });
  h += '</table></div>';
  if (puo)
    h +=
      '<button class="btn-export" style="font-size:.72rem;padding:2px 8px;margin-top:4px" onclick="briefValetAddRiga()">+ Aggiungi riga</button>';
  h += '<div id="brief-crono">' + _briefRenderCronoValet(c) + '</div>';
  if (c.nota)
    h +=
      '<p style="font-size:.75rem;font-style:italic;background:#FFFFCC;border:1px solid #999;padding:6px 10px;margin-top:10px;max-width:560px">' +
      escP(c.nota) +
      '</p>';
  if (puo)
    h +=
      '<div style="margin-top:8px"><button class="btn-export" style="font-size:.78rem;padding:4px 10px;border-color:#c0392b;color:#c0392b" onclick="briefEliminaPause()">Elimina pause</button></div>';
  return h;
}

// ============================================================
// STAMPA PDF A4 (briefing da compilare a penna + pause) e
// regole pause personalizzabili (imp piano_pause_cfg)
// ============================================================
function _peHexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}
function pdfBriefingGiorno() {
  if (!_briefState) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const valet = _briefIsValet();
  const dstr = _briefData;
  const lbl = _briefGiornoLbl(dstr) + ' ' + dstr.split('-').reverse().join('.');
  doc.setFillColor(255, 255, 0);
  doc.rect(10, 10, 190, 9, 'F');
  doc.setDrawColor(120);
  doc.rect(10, 10, 190, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.text('BRIEFING ' + _pianoReparto().toUpperCase() + ' — ' + lbl, 105, 16.2, { align: 'center' });
  const cols = valet
    ? ['E', 'U', 'COLLABORATORE', 'TURNO', 'USCITA', 'FIRMA', 'RADIO', 'BADGE']
    : ['E', 'U', 'HOST', 'T', 'CD', 'USCITA', 'FIRMA'];
  const body = [];
  let gPrec = null;
  (_briefState.righe || []).forEach((r) => {
    if (!r.nome && !r.turno) return;
    const g = _briefGruppo(r.turno);
    if (gPrec !== null && g !== gPrec)
      body.push([{ content: '', colSpan: cols.length, styles: { minCellHeight: 3.5 } }]);
    gPrec = g;
    body.push(
      valet
        ? ['', '', r.nome || '', r.turno || '', r.uscita || '', r.firma || '', r.radio || '', r.badge || '']
        : ['', '', r.nome || '', r.turno || '', r.cd || '', r.uscita || '', r.firma || ''],
    );
  });
  doc.autoTable({
    startY: 24,
    margin: { left: 10 },
    tableWidth: valet ? 190 : 138,
    head: [cols],
    body: body,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 1.8,
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      minCellHeight: 7,
    },
    headStyles: { fontStyle: 'bold', halign: 'center', minCellHeight: 6 },
    columnStyles: valet
      ? {
          0: { cellWidth: 10 },
          1: { cellWidth: 10 },
          2: { cellWidth: 56 },
          3: { cellWidth: 16 },
          4: { cellWidth: 24 },
          5: { cellWidth: 34 },
          6: { cellWidth: 20 },
          7: { cellWidth: 20 },
        }
      : {
          0: { cellWidth: 10 },
          1: { cellWidth: 10 },
          2: { cellWidth: 46 },
          3: { cellWidth: 13 },
          4: { cellWidth: 11 },
          5: { cellWidth: 20 },
          6: { cellWidth: 28 },
        },
    didParseCell: (d) => {
      if (d.section === 'head') {
        d.cell.styles.fillColor =
          d.column.index === 0 ? [0, 176, 80] : d.column.index === 1 ? [255, 0, 0] : [255, 255, 0];
        if (d.column.index <= 1) d.cell.styles.textColor = [255, 255, 255];
      } else if (d.column.index === 3 && d.cell.raw) {
        const hex = _pianoColore(String(d.cell.raw).trim());
        if (hex && hex[0] === '#') d.cell.styles.fillColor = _peHexRgb(hex);
        d.cell.styles.fontStyle = 'bold';
      } else if (d.column.index === 4 && !valet && d.cell.raw) {
        d.cell.styles.fillColor = [255, 255, 0];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  if (!valet) {
    const turni = _pianoTurniReparto()
      .slice()
      .sort((a, b) => {
        const g = _briefGruppo(a.codice) - _briefGruppo(b.codice);
        if (g) return g;
        return a.codice < b.codice ? -1 : 1;
      });
    const bodyT = [];
    let gT = null;
    turni.forEach((t) => {
      const g = _briefGruppo(t.codice);
      if (gT !== null && g !== gT) bodyT.push([{ content: '', colSpan: 3, styles: { minCellHeight: 2.5 } }]);
      gT = g;
      bodyT.push([t.codice, _briefOrarioHM(t.ora_inizio), _briefOrarioHM(t.ora_fine)]);
    });
    doc.autoTable({
      startY: 24,
      margin: { left: 156 },
      tableWidth: 44,
      head: [[{ content: 'ORARI', colSpan: 3, styles: { halign: 'center' } }]],
      body: bodyT,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.1, lineColor: [120, 120, 120], lineWidth: 0.2, textColor: [0, 0, 0] },
      headStyles: { fillColor: [255, 255, 0], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 13, fontStyle: 'bold' }, 1: { cellWidth: 15.5 }, 2: { cellWidth: 15.5 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 0 && d.cell.raw) {
          const hex = _pianoColore(String(d.cell.raw).trim());
          if (hex && hex[0] === '#') d.cell.styles.fillColor = _peHexRgb(hex);
        }
      },
    });
  }
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Casino Lugano SA — Briefing — E/U da spuntare a penna', 10, 292);
  logAzione('Briefing stampato', _pianoReparto() + ' ' + dstr);
  mostraPdfPreview(doc, 'briefing_' + dstr + '_' + _pianoReparto() + '.pdf', 'Briefing ' + lbl);
}
function pdfPauseGiorno() {
  if (!_briefState || !_briefState.pause || !_briefState.pause.contenuto) return;
  const c = _briefState.pause.contenuto;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const dstr = _briefData;
  const lbl = _briefGiornoLbl(dstr) + ' ' + dstr.split('-').reverse().join('.');
  const stiliBase = {
    fontSize: 7.5,
    cellPadding: 1.2,
    lineColor: [120, 120, 120],
    lineWidth: 0.2,
    textColor: [0, 0, 0],
  };
  if (c.tipo === 'valet') {
    doc.setFillColor(255, 255, 0);
    doc.rect(10, 10, 190, 9, 'F');
    doc.setDrawColor(120);
    doc.rect(10, 10, 190, 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('PAUSE VALET — ' + lbl, 105, 16, { align: 'center' });
    doc.autoTable({
      startY: 24,
      margin: { left: 10 },
      tableWidth: 190,
      head: [['TURNO', 'NOME', 'ORARIO', 'PAUSA 1', 'PAUSA 2', 'PAUSA 3']],
      body: (c.righe || []).map((r) => [
        r.turno,
        r.nome,
        r.orario,
        (r.pause || [])[0] || '',
        (r.pause || [])[1] || '',
        (r.pause || [])[2] || '',
      ]),
      theme: 'grid',
      styles: Object.assign({}, stiliBase, { fontSize: 8.5, cellPadding: 1.8 }),
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index >= 3 && d.cell.raw) d.cell.styles.fillColor = [255, 224, 178];
      },
    });
    const eventi = [];
    (c.righe || []).forEach((r) => {
      (r.pause || []).forEach((p) => {
        const iv = _briefParseIntv(p);
        if (iv) eventi.push({ s: iv[0], e: iv[1], nome: r.nome, turno: r.turno, txt: p });
      });
    });
    eventi.sort((a, b) => a.s - b.s);
    let prevEnd = -1;
    const bodyC = eventi.map((ev) => {
      const overlap = prevEnd >= 0 && ev.s < prevEnd;
      if (ev.e > prevEnd) prevEnd = ev.e;
      return [ev.txt, ev.nome, ev.turno, ev.e - ev.s + ' min'].map((x) => ({
        content: x,
        styles: overlap ? { fillColor: [255, 80, 80], textColor: [255, 255, 255] } : {},
      }));
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6,
      margin: { left: 10 },
      tableWidth: 130,
      head: [
        [
          {
            content: 'ORDINE PAUSE (una alla volta)',
            colSpan: 4,
            styles: { fillColor: [255, 255, 0], textColor: [0, 0, 0] },
          },
        ],
        ['ORARIO', 'NOME', 'TURNO', 'DURATA'],
      ],
      body: bodyC,
      theme: 'grid',
      styles: stiliBase,
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    });
    if (c.nota) {
      const y = doc.lastAutoTable.finalY + 5;
      doc.setFillColor(255, 255, 204);
      doc.rect(10, y, 130, 12, 'F');
      doc.setDrawColor(120);
      doc.rect(10, y, 130, 12);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(0);
      doc.text(doc.splitTextToSize(c.nota, 126), 12, y + 4);
    }
  } else {
    const tit = c.celle['1|1'];
    const sotto = c.celle['3|1'];
    doc.setFillColor(255, 255, 0);
    doc.rect(10, 10, 190, 8, 'F');
    doc.setDrawColor(120);
    doc.rect(10, 10, 190, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text((tit ? String(tit.v) : 'PAUSE') + ' — ' + lbl, 105, 15.4, { align: 'center' });
    if (sotto) {
      doc.setFillColor(255, 255, 0);
      doc.rect(10, 19.5, 190, 6.5, 'F');
      doc.rect(10, 19.5, 190, 6.5);
      doc.setFontSize(9);
      doc.text(String(sotto.v), 105, 24, { align: 'center' });
    }
    [1, 4, 7].forEach((base, bi) => {
      const body = [];
      for (let r = 4; r <= c.nR; r++) {
        const a = c.celle[r + '|' + base];
        const b = c.celle[r + '|' + (base + 1)];
        const pieno = (x) => x && String(x.v).trim() !== '';
        if (!pieno(a) && !pieno(b)) continue;
        const isHdr = (a && a.hdr) || (b && b.hdr);
        if (isHdr && body.length)
          body.push([
            { content: '', colSpan: 2, styles: { minCellHeight: 3.2, lineWidth: 0, fillColor: [255, 255, 255] } },
          ]);
        if (!pieno(a) && pieno(b)) {
          body.push([{ content: String(b.v), colSpan: 2, styles: { fontStyle: 'bold', halign: 'center' } }]);
          continue;
        }
        if (a && a.span) {
          body.push([
            {
              content: String(a.v),
              colSpan: 2,
              styles: {
                fillColor: a.bg ? _peHexRgb(a.bg) : [255, 255, 255],
                textColor: a.fg ? _peHexRgb(a.fg) : [0, 0, 0],
                fontStyle: 'bold',
              },
            },
          ]);
          continue;
        }
        const mk = (cell) => ({
          content: cell ? String(cell.v) : '',
          styles: {
            fillColor: cell && cell.bg ? _peHexRgb(cell.bg) : [255, 255, 255],
            textColor: cell && cell.fg ? _peHexRgb(cell.fg) : [0, 0, 0],
            fontStyle: cell && cell.b ? 'bold' : 'normal',
          },
        });
        body.push([mk(a), mk(b)]);
      }
      if (!body.length) return;
      doc.autoTable({
        startY: 30,
        margin: { left: 10 + bi * 65 },
        tableWidth: 60,
        body: body,
        theme: 'grid',
        styles: Object.assign({}, stiliBase, { cellPadding: 1 }),
        columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 43 } },
      });
    });
  }
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text(
    'Casino Lugano SA — Pause ' + _pianoReparto() + ' — generato il ' + new Date().toLocaleDateString('it-IT'),
    10,
    292,
  );
  logAzione('Pause stampate', _pianoReparto() + ' ' + dstr);
  mostraPdfPreview(doc, 'pause_' + dstr + '_' + _pianoReparto() + '.pdf', 'Pause ' + lbl);
}
// ---------- regole pause personalizzabili ----------
function _briefRenderPauseCfg() {
  if (typeof isAdmin === 'function' && !isAdmin()) return '';
  const c = _briefPauseCfg();
  const orari = _peOrariTurni();
  // tabella "turni, orari e pause spettanti" calcolata LIVE dalle regole:
  // cambi un orario nella tab Turni o una fascia qui sotto e si aggiorna
  let tab =
    '<table style="border-collapse:collapse;font-size:.78rem;margin:8px 0"><tr>' +
    ['TURNO', 'ORARIO', 'DURATA', 'PAUSA SPETTANTE']
      .map((x) => '<th style="border:1px solid #999;background:#FFFF00;padding:3px 10px">' + x + '</th>')
      .join('') +
    '</tr>';
  _pianoTurniReparto()
    .slice()
    .sort((a, b) => {
      const g = _briefGruppo(a.codice) - _briefGruppo(b.codice);
      if (g) return g;
      return a.codice < b.codice ? -1 : 1;
    })
    .forEach((t) => {
      const o = orari[t.codice];
      if (!o) return;
      const split = _pePauseSplit(orari, t.codice);
      const pers = (c.turni || {})[t.codice] || '';
      const ore = Math.floor(o.dur / 60) + 'h' + (o.dur % 60 ? String(o.dur % 60).padStart(2, '0') : '');
      tab +=
        '<tr><td style="border:1px solid #999;padding:2px 10px;font-weight:bold;background:' +
        (_pianoColore(t.codice) || '') +
        '">' +
        escP(t.codice) +
        '</td><td style="border:1px solid #999;padding:2px 10px">' +
        o.iniStr +
        ' - ' +
        o.finStr +
        '</td><td style="border:1px solid #999;padding:2px 10px">' +
        ore +
        '</td><td style="border:1px solid #999;padding:0;background:' +
        (pers ? '#FFF3C4' : 'transparent') +
        '"><input class="pcfg-turno" data-turno="' +
        escP(t.codice) +
        '" value="' +
        escP(pers) +
        '" placeholder="' +
        (split.length ? split.join('+') : '—') +
        '" style="width:80px;border:none;background:transparent;font:inherit;font-weight:bold;padding:2px 8px"></td></tr>';
    });
  tab +=
    '</table><p style="font-size:.72rem;color:var(--muted)">Colonna PAUSA: scrivi la composizione che vuoi per quel turno (es. <b>15+15</b> per S3, <b>30+15+15</b>), oppure lasciala vuota per usare la regola per fascia di durata (il valore grigio è quello attuale). Gli orari dei turni si modificano nella tab <b>Turni</b>. Tutto si aggiorna da solo.</p>';
  const num = (id, val, larg) =>
    '<input id="' +
    id +
    '" type="number" value="' +
    escP(String(val)) +
    '" style="width:' +
    (larg || 60) +
    'px;padding:4px">';
  let h =
    '<details style="margin-top:14px;font-size:.82rem"><summary style="cursor:pointer;font-weight:bold">Regole — turni, orari e pause spettanti (personalizza)</summary><div style="padding:10px 4px;display:flex;flex-direction:column;gap:8px">';
  h += tab;
  h +=
    '<div><b>Slots</b> — minuti di pausa per durata turno: 6–7 ore ' +
    num('pcfg-6h', c.slots_6h || 30) +
    ' &nbsp; 7–9 ore ' +
    num('pcfg-7h', c.slots_7h || 45) +
    ' &nbsp; 9 ore o più ' +
    num('pcfg-9h', c.slots_9h || 60) +
    ' &nbsp; <span style="color:var(--muted)">(sotto le 6 ore: nessuna pausa)</span></div>';
  h +=
    '<div><b>Valet</b> — distanza minima tra pause ' +
    num('pcfg-gap', c.valet_gap || 45) +
    ' min &nbsp; fascia di punta ven/sab: da <input id="pcfg-picco-da" value="' +
    escP(c.picco_da || '23.00') +
    '" style="width:64px;padding:4px"> a <input id="pcfg-picco-a" value="' +
    escP(c.picco_a || '01.00') +
    '" style="width:64px;padding:4px"></div>';
  h +=
    '<div>Nota in fondo alle pause valet:<br><input id="pcfg-nota" value="' +
    escP(c.valet_nota || '') +
    '" placeholder="(testo standard)" style="width:100%;max-width:560px;padding:5px"></div>';
  h +=
    '<div><button class="btn-export" style="font-size:.8rem;padding:4px 14px" onclick="salvaPauseCfg()">Salva regole</button></div>';
  h += '</div></details>';
  return h;
}
async function salvaPauseCfg() {
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const turni = {};
  document.querySelectorAll('.pcfg-turno').forEach((el) => {
    const val = el.value.trim();
    if (val) turni[el.dataset.turno.toUpperCase()] = val;
  });
  const obj = {
    slots_6h: parseInt(v('pcfg-6h')) || 30,
    slots_7h: parseInt(v('pcfg-7h')) || 45,
    slots_9h: parseInt(v('pcfg-9h')) || 60,
    valet_gap: parseInt(v('pcfg-gap')) || 45,
    picco_da: v('pcfg-picco-da') || '23.00',
    picco_a: v('pcfg-picco-a') || '01.00',
    valet_nota: v('pcfg-nota').trim(),
    turni: turni,
  };
  await setImp('piano_pause_cfg', JSON.stringify(obj));
  window._briefPauseCfgObj = obj;
  toast('Regole pause salvate');
}

// Importa il briefing da un foglio Excel: cerca in ogni riga una cella che
// corrisponde a un TURNO del reparto e prende come nome la cella non vuota
// più vicina a sinistra (funziona con i fogli briefing slots e valet)
async function importaBriefingExcel(input) {
  if (!puoGestirePiano() || !_briefState) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const codici = {};
    _pianoTurniReparto().forEach((t) => (codici[t.codice.toUpperCase()] = true));
    const righe = [];
    const visti = {};
    wb.SheetNames.forEach((nomeFoglio) => {
      if (righe.length) return; // primo foglio utile
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglio], { header: 1, raw: false });
      const trovate = [];
      grid.forEach((r) => {
        if (!r) return;
        for (let j = 1; j < r.length; j++) {
          const val = String(r[j] == null ? '' : r[j])
            .trim()
            .toUpperCase();
          if (!codici[val]) continue;
          let nome = '';
          for (let k = j - 1; k >= 0; k--) {
            const cand = String(r[k] == null ? '' : r[k]).trim();
            if (cand && !/^\d|[./]/.test(cand)) {
              nome = cand.toUpperCase();
              break;
            }
          }
          if (nome && nome !== 'HOST' && nome !== 'COLLABORATORE' && !visti[nome]) {
            visti[nome] = true;
            trovate.push({
              e: '',
              u: '',
              nome: nome,
              nomeFull: null,
              turno: val,
              cd: '',
              uscita: '',
              firma: '',
              radio: '',
              badge: '',
            });
          }
          break;
        }
      });
      if (trovate.length) righe.push(...trovate);
    });
    if (!righe.length) {
      toast('Nessuna coppia nome+turno riconosciuta nel file');
      return;
    }
    if (
      _briefState.righe.length &&
      !confirm('Trovate ' + righe.length + ' righe nel file. Sostituisco il briefing attuale?')
    )
      return;
    righe.sort((a, b) => {
      const g = _briefGruppo(a.turno) - _briefGruppo(b.turno);
      if (g) return g;
      if (a.turno !== b.turno) return a.turno < b.turno ? -1 : 1;
      return a.nome < b.nome ? -1 : 1;
    });
    _briefState.righe = righe;
    clearTimeout(_briefSaveTimer);
    await briefSalvaBriefing();
    renderPiano();
    toast('Briefing importato: ' + righe.length + ' righe');
  } catch (e) {
    toast('Errore lettura file Excel');
  }
}
