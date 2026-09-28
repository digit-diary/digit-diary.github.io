// ============================================================
// MOTORE PAUSE · port 1:1 dai file Excel di Musa:
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
// ============================================================
// REGOLE PAUSE · per settore, create e modificate dal pannello del briefing
// (impostazione piano_pause_cfg, chiave regole[settore]). Ogni regola e un
// oggetto {tipo, ...}. I tipi che il motore sa applicare:
//   durata   {da, a, pause, giorni?}       turni da `da` a `a` ore (a escluso): composizione es. "30+15"
//   turno    {turno, pause, giorni?}       composizione per una sigla ("0" = nessuna pausa)
//   (giorni = [1,2,3,4] lun-gio, [5,6] ven-sab, [0] dom; vuoto = sempre; la regola con i giorni vince)
//   distanza {minuti}                      minuti minimi dall inizio turno e fra una pausa e la successiva
//   fascia   {giorni:[5,6], da, a}         in questi giorni nessuna pausa fra `da` e `a` (giorni vuoto = sempre)
//   insieme  {n}                           al massimo N persone in pausa nello stesso momento
//   nota     {testo}                       nota in fondo al foglio delle pause
// Se un settore non ha ancora regole salvate, quelle attuali (Slots ed
// ex Valet) vengono ricavate dai vecchi valori: niente cambia finche non si
// tocca qualcosa.
// ============================================================
const PAUSE_REGOLE_TIPI = {
  durata: {
    nome: 'Pause per durata del turno',
    spiega:
      'Per i turni che durano almeno X ore e meno di Y ore, la composizione delle pause. Per un solo valore scrivi 7 e 8 (= turni di 7 ore); per "8 ore in su" scrivi 8 e 24.',
    esempio: 'Turni di 7 ore: 30+15 · Turni da 8 ore in su: 30+15+15',
  },
  turno: {
    nome: 'Pause di un turno preciso',
    spiega:
      'Vale piu della regola per durata. Scrivi 0 per un turno senza pausa. Con i giorni scelti vale solo in quei giorni.',
    esempio: 'Turno S3, domenica: 15+15',
  },
  distanza: {
    nome: 'Distanza minima',
    spiega: 'Minuti minimi fra l inizio del turno e la prima pausa, e fra una pausa e la successiva.',
    esempio: '45 minuti',
  },
  fascia: {
    nome: 'Fascia senza pause',
    spiega: 'Nei giorni scelti nessuna pausa in questa fascia oraria (ora di punta). Senza giorni vale sempre.',
    esempio: 'Venerdi e sabato dalle 23.00 alle 01.00',
  },
  insieme: {
    nome: 'Persone in pausa insieme',
    spiega: 'Quante persone al massimo possono essere in pausa nello stesso momento.',
    esempio: '1 persona',
  },
  nota: {
    nome: 'Nota in fondo al foglio',
    spiega: 'Testo stampato sotto le pause.',
    esempio: 'Chi esce prima non fa l ultima pausa.',
  },
};
function _briefPauseCfg() {
  return window._briefPauseCfgObj || {};
}
function _pePauseParse(txt) {
  return String(txt == null ? '' : txt)
    .split(/[+,;\s]+/)
    .map((x) => parseInt(x))
    .filter((x) => x > 0);
}
function _pePauseDaTotale(tot) {
  if (tot <= 30) return '15+15';
  if (tot <= 45) return '30+15';
  return '30+15+15';
}
function _peSettoreCorrente() {
  return typeof _pianoReparto === 'function' ? _pianoReparto() : 'slots';
}
// giorno della settimana per cui si stanno calcolando le pause (0=dom)
function _peDow(dstr) {
  const d = dstr || (typeof _briefData !== 'undefined' ? _briefData : null);
  if (window._peDowCorrente != null) return window._peDowCorrente;
  return d ? new Date(d + 'T12:00:00').getDay() : new Date().getDay();
}
function _peGiorniOk(r, dow) {
  return !r.giorni || !r.giorni.length || r.giorni.map(Number).includes(dow);
}
// regole del settore: quelle salvate, altrimenti la traduzione dei vecchi valori
function _peRegolePause(settore) {
  const cfg = _briefPauseCfg();
  const sett = settore || _peSettoreCorrente();
  if (cfg.regole && Array.isArray(cfg.regole[sett])) return cfg.regole[sett];
  const out = [];
  if (sett === 'slots') {
    // regola del casino: 6 ore = 15+15 · 7 ore = 30+15 · 8 ore e oltre = 30+15+15
    out.push({ tipo: 'durata', da: 6, a: 7, pause: '15+15' });
    out.push({ tipo: 'durata', da: 7, a: 8, pause: '30+15' });
    out.push({ tipo: 'durata', da: 8, a: 24, pause: '30+15+15' });
  } else {
    // motore algoritmico (ex Valet): le fasce che usava finora
    out.push({ tipo: 'durata', da: 0, a: 6, pause: '15' });
    out.push({ tipo: 'durata', da: 6, a: 7, pause: '15+15' });
    out.push({ tipo: 'durata', da: 7, a: 8, pause: '30+15' });
    out.push({ tipo: 'durata', da: 8, a: 24, pause: '30+15+15' });
    out.push({ tipo: 'distanza', minuti: parseInt(cfg.valet_gap) || 45 });
    out.push({ tipo: 'fascia', giorni: [5, 6], da: cfg.picco_da || '23.00', a: cfg.picco_a || '01.00' });
    out.push({ tipo: 'insieme', n: 1 });
    if (cfg.valet_nota) out.push({ tipo: 'nota', testo: cfg.valet_nota });
  }
  const codici =
    typeof _pianoTurniReparto === 'function' ? _pianoTurniReparto().map((t) => String(t.codice).toUpperCase()) : [];
  Object.keys(cfg.turni || {}).forEach((k) => {
    if (codici.includes(k.toUpperCase()))
      out.push({ tipo: 'turno', turno: k.toUpperCase(), pause: String(cfg.turni[k]) });
  });
  return out;
}
function _peRegola(tipo, settore) {
  return _peRegolePause(settore).find((r) => r.tipo === tipo) || null;
}
// composizione pause di un turno: regola per il turno, poi regola per
// durata, poi il comportamento di sempre
function _pePauseSplit(orari, turno, settore, dow) {
  const cod = String(turno || '').toUpperCase();
  const regole = _peRegolePause(settore);
  const g = dow == null ? _peDow() : dow;
  const conGiorni = (r) => r.giorni && r.giorni.length;
  const perTurno = regole.filter(
    (r) => r.tipo === 'turno' && String(r.turno).toUpperCase() === cod && _peGiorniOk(r, g),
  );
  const rt = perTurno.find(conGiorni) || perTurno[0];
  if (rt) return _pePauseParse(rt.pause);
  const dur = _peDurataMin(orari, turno);
  const ore = dur / 60;
  const perDurata = regole.filter(
    (r) => r.tipo === 'durata' && ore >= parseFloat(r.da) && ore < parseFloat(r.a) && _peGiorniOk(r, g),
  );
  const rd = perDurata.find(conGiorni) || perDurata[0];
  if (rd) return _pePauseParse(rd.pause);
  if (dur < 360) return [];
  return dur < 420 ? [15, 15] : dur < 480 ? [30, 15] : [30, 15, 15];
}
// etichetta dei giorni: i tre gruppi del casino hanno un nome breve
function _peGiorniLbl(giorni) {
  const GG = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const k = (giorni || []).map(Number).sort().join(',');
  if (k === '1,2,3,4') return 'lunedi-giovedi';
  if (k === '5,6') return 'venerdi-sabato';
  if (k === '0') return 'domenica';
  return (giorni || []).map((g) => GG[g]).join(', ');
}
// "Turni di 7 ore", "Turni da 8 ore in su", "Turni da 6 a meno di 8 ore"
function _peDurataLbl(da, a) {
  const d = parseFloat(da);
  const f = parseFloat(a);
  if (f >= 24) return d <= 0 ? 'Tutti i turni' : 'Turni da ' + d + ' ore in su';
  if (f - d === 1 && Number.isInteger(d)) return 'Turni di ' + d + ' ore';
  if (d <= 0) return 'Turni sotto le ' + f + ' ore';
  return 'Turni da ' + d + ' a meno di ' + f + ' ore';
}
// descrizione in parole di una regola (pannello, guida, stampa)
function _peRegolaDescr(r) {
  const GG = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const pause = (p) => (_pePauseParse(p).length ? _pePauseParse(p).join('+') + ' minuti' : 'nessuna pausa');
  const gg = r.giorni && r.giorni.length ? ', ' + _peGiorniLbl(r.giorni) : '';
  switch (r.tipo) {
    case 'durata':
      return _peDurataLbl(r.da, r.a) + gg + ': ' + pause(r.pause);
    case 'turno':
      return 'Turno ' + r.turno + gg + ': ' + pause(r.pause);
    case 'distanza':
      return 'Almeno ' + r.minuti + ' minuti fra inizio turno, una pausa e la successiva';
    case 'fascia':
      return (
        (r.giorni && r.giorni.length ? r.giorni.map((g) => GG[g]).join(', ') : 'Tutti i giorni') +
        ': nessuna pausa dalle ' +
        r.da +
        ' alle ' +
        r.a
      );
    case 'insieme':
      return 'Al massimo ' + r.n + (r.n == 1 ? ' persona' : ' persone') + ' in pausa nello stesso momento';
    case 'nota':
      return 'Nota: ' + r.testo;
  }
  return '';
}
function _peGiorniStessi(a, b) {
  return (a || []).map(Number).sort().join(',') === (b || []).map(Number).sort().join(',');
}
function _peGiorniIncrocio(a, b) {
  if (!a || !a.length || !b || !b.length) return true;
  return a.map(Number).some((g) => b.map(Number).includes(g));
}
// controllo alla creazione: {errore} blocca, {avvisi:[]} avverte
function _peValidaRegolaPausa(r, settore, altre) {
  const av = [];
  const sett = settore || _peSettoreCorrente();
  const codici =
    typeof _pianoTurniReparto === 'function' ? _pianoTurniReparto().map((t) => String(t.codice).toUpperCase()) : [];
  const oraOk = (t) => _peOraMin(t) != null;
  if (!PAUSE_REGOLE_TIPI[r.tipo]) return { errore: 'Tipo di regola sconosciuto' };
  if (r.tipo === 'durata') {
    const da = parseFloat(r.da);
    const a = parseFloat(r.a);
    if (!(da >= 0 && a <= 24 && a > da))
      return { errore: 'Le ore vanno da 0 a 24 e la seconda deve essere maggiore della prima' };
    if (String(r.pause).trim() !== '0' && !_pePauseParse(r.pause).length)
      return { errore: 'Scrivi la composizione delle pause, per esempio 30+15, oppure 0 per nessuna pausa' };
    (altre || []).forEach((o) => {
      if (o.tipo === 'durata' && parseFloat(o.da) < a && parseFloat(o.a) > da && _peGiorniIncrocio(o.giorni, r.giorni))
        av.push(
          'Si sovrappone a "' +
            _peRegolaDescr(o) +
            '": ' +
            (_peGiorniStessi(o.giorni, r.giorni)
              ? 'per un turno vale la prima regola dell elenco'
              : 'nei giorni comuni vince quella con i giorni indicati'),
        );
    });
    if (_pePauseParse(r.pause).reduce((x, y) => x + y, 0) > da * 60 && da > 0)
      av.push('Le pause superano la durata minima del turno');
  }
  if (r.tipo === 'turno') {
    const cod = String(r.turno || '')
      .trim()
      .toUpperCase();
    if (!cod) return { errore: 'Scrivi la sigla del turno' };
    if (codici.length && !codici.includes(cod))
      return { errore: 'La sigla ' + cod + ' non esiste nel settore ' + sett + ' (scheda Turni)' };
    if (String(r.pause).trim() !== '0' && !_pePauseParse(r.pause).length)
      return { errore: 'Scrivi la composizione delle pause, per esempio 15+15, oppure 0 per nessuna pausa' };
    if (
      (altre || []).some(
        (o) => o.tipo === 'turno' && String(o.turno).toUpperCase() === cod && _peGiorniStessi(o.giorni, r.giorni),
      )
    )
      av.push('Esiste gia una regola per il turno ' + cod + ' negli stessi giorni: questa la sostituisce');
  }
  if (r.tipo === 'distanza') {
    const m = parseInt(r.minuti);
    if (!(m >= 0 && m <= 240)) return { errore: 'I minuti vanno da 0 a 240' };
    if ((altre || []).some((o) => o.tipo === 'distanza'))
      av.push('Esiste gia una distanza minima: questa la sostituisce');
  }
  if (r.tipo === 'fascia') {
    if (!oraOk(r.da) || !oraOk(r.a)) return { errore: 'Scrivi gli orari come 23.00 e 01.00' };
    if (_peOraMin(r.da) === _peOraMin(r.a)) return { errore: 'Inizio e fine della fascia sono uguali' };
    if (sett === 'slots')
      av.push(
        'Negli Slots le pause seguono gli schemi fissi: questa regola segnala le pause fuori fascia, non le sposta',
      );
  }
  if (r.tipo === 'insieme') {
    const n = parseInt(r.n);
    if (!(n >= 1 && n <= 20)) return { errore: 'Il numero di persone va da 1 a 20' };
    if ((altre || []).some((o) => o.tipo === 'insieme'))
      av.push('Esiste gia un massimo di persone in pausa: questa lo sostituisce');
    if (sett === 'slots')
      av.push('Negli Slots le pause seguono gli schemi fissi: questa regola segnala le sovrapposizioni, non le sposta');
  }
  if (r.tipo === 'nota' && !String(r.testo || '').trim()) return { errore: 'Scrivi il testo della nota' };
  return { avvisi: av };
}
// verifica delle pause generate contro le regole (per gli Slots e l unico
// modo di far valere fascia, distanza e persone insieme)
function _peVerificaRegolePause(contenuto, dstr, settore) {
  if (!contenuto) return [];
  const regole = _peRegolePause(settore);
  const dow = new Date(dstr + 'T12:00:00').getDay();
  const norm = (m) => (m < 660 ? m + 1440 : m);
  const intv = (txt) => {
    const m = String(txt || '').match(/(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/);
    if (!m) return null;
    const a = _peOraMin(m[1]);
    const b = _peOraMin(m[2]);
    if (a == null || b == null) return null;
    return [norm(a), norm(b) <= norm(a) ? norm(b) + 1440 : norm(b)];
  };
  // elenco pause {nome, ini, fin, iniTurno}
  const pause = [];
  if (contenuto.tipo === 'slots') {
    [1, 4, 7].forEach((base) => {
      let nome = '';
      let iniTurno = null;
      for (let r = 4; r <= (contenuto.nR || 0); r++) {
        const a = contenuto.celle[r + '|' + base];
        const b = contenuto.celle[r + '|' + (base + 1)];
        if (a && a.hdr) {
          nome = String(a.v || '');
          const t = b && intv(b.v);
          iniTurno = t ? t[0] : null;
          continue;
        }
        if (a && String(a.v).toUpperCase() === 'PAUSA' && b) {
          const t = intv(b.v);
          if (t) pause.push({ nome: nome, ini: t[0], fin: t[1], iniTurno: iniTurno });
        }
      }
    });
  } else {
    (contenuto.righe || []).forEach((r) => {
      const t = intv(r.orario);
      (r.pause || []).forEach((p) => {
        const i = intv(p);
        if (i) pause.push({ nome: r.nome, ini: i[0], fin: i[1], iniTurno: t ? t[0] : null });
      });
    });
  }
  const out = [];
  regole.forEach((rg) => {
    if (rg.tipo === 'fascia') {
      if (rg.giorni && rg.giorni.length && !rg.giorni.map(Number).includes(dow)) return;
      const fs = norm(_peOraMin(rg.da));
      let fe = norm(_peOraMin(rg.a));
      if (fe <= fs) fe += 1440;
      pause.forEach((p) => {
        if (p.ini < fe && p.fin > fs)
          out.push(
            p.nome + ' in pausa alle ' + _peMinToOra(p.ini) + ' (fascia senza pause ' + rg.da + '-' + rg.a + ')',
          );
      });
    }
    if (rg.tipo === 'distanza') {
      const gap = parseInt(rg.minuti) || 0;
      const perNome = {};
      pause.forEach((p) => (perNome[p.nome] = perNome[p.nome] || []).push(p));
      Object.keys(perNome).forEach((n) => {
        const l = perNome[n].sort((x, y) => x.ini - y.ini);
        l.forEach((p, i) => {
          const prev = i ? l[i - 1].fin : p.iniTurno;
          if (prev != null && p.ini - prev < gap)
            out.push(n + ': pausa alle ' + _peMinToOra(p.ini) + ' a meno di ' + gap + ' minuti dalla precedente');
        });
      });
    }
    if (rg.tipo === 'insieme') {
      const n = parseInt(rg.n) || 1;
      pause.forEach((p) => {
        const ins = pause.filter((q) => q !== p && q.ini < p.fin && q.fin > p.ini && q.nome !== p.nome).length;
        if (ins + 1 > n)
          out.push(_peMinToOra(p.ini) + ': ' + (ins + 1) + ' persone in pausa insieme (massimo ' + n + ')');
      });
    }
  });
  return [...new Set(out)];
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
    const acc = typeof _pianoAccompagnamentoDi === 'function' ? _pianoAccompagnamentoDi(info) : [];
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
  // S5 fa 9 ore: la mezz ora alle 19.30, come quando la da S1
  r = _peSS(sh, r, col, 'SALA', '18.45 - 19.30');
  r = _peSPP(sh, ctx, r, col, 'S5', '19.30 - 20.00', nBG1);
}
// s3PausaPrima (lunedi-giovedi): quando S3 fa R24, la pausa e alle 22.15 e R24 dopo,
// 22.30-23.00; la domenica resta R24 22.15-22.45 e pausa 22.45
function _pePatternS3(sh, ctx, col, nS3, hasR24, bg3FaRec, s3PausaPrima) {
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
      if (s3PausaPrima) {
        r = _peSS(sh, r, col, 'PAUSA', '22.15 - 22.30');
        r = _peSPP(sh, ctx, r, col, 'R24', '22.30 - 23.00', nS3);
      } else {
        r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', nS3);
        r = _peSS(sh, r, col, 'PAUSA', '22.45 - 23.00');
      }
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
  s3PausaPrima,
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
        } else if (s3PausaPrima) {
          r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
          r = _peSS(sh, r, col, 'SALA', '22.30 - 23.30');
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
        if (!bg3FaRec && s3PausaPrima) {
          // S3 in pausa alle 22.15 (lunedi-giovedi), poi fa R24
          r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
          r = _peSS(sh, r, col, 'SALA', '22.30 - 23.15');
        } else {
          if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
          else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
          r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
          if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
          else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
        }
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
      if (!bg3FaRec && s3PausaPrima) {
        // S3 in pausa alle 22.15 (lunedi-giovedi), poi fa R24
        r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
        r = _peSS(sh, r, col, 'SALA', '22.30 - 23.15');
      } else {
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
        r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
        if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
        else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
      }
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
        // R24 fa 7 ore: 30+15 (qui un quarto d ora)
        r = _peSPP(sh, ctx, r, col, 'R24', '24.45 - 01.00', bgRec);
        r = _peSS(sh, r, col, 'SALA', '01.00 - 01.15');
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
function _pePatternBG3_S5(sh, ctx, col, nBG3, bgRec, nS3, bg3DaR23Sera, hasR24, s7InQ2, bg3FaRec, s3PausaPrima) {
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
    if (!bg3FaRec && s3PausaPrima) {
      // S3 in pausa alle 22.15 (lunedi-giovedi), poi fa R24
      r = _peSN(sh, ctx, r, col, 'S3', '22.15 - 22.30', nS3, nBG3);
      r = _peSS(sh, r, col, 'SALA', '22.30 - 23.15');
    } else {
      if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R24', '22.15 - 22.45', bgRec);
      else r = _peSS(sh, r, col, 'SALA', '22.15 - 22.45');
      r = _peSN(sh, ctx, r, col, 'S3', '22.45 - 23.00', nS3, nBG3);
      if (bg3FaRec) r = _peSPP(sh, ctx, r, col, 'R23', '23.00 - 23.15', bgRec);
      else r = _peSS(sh, r, col, 'SALA', '23.00 - 23.15');
    }
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
  // S8C fa 7 ore e 20: 30+15 (la terza pausa non spetta)
  r = _peSS(sh, r, col, 'SALA', '01.45 - 02.00');
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
  const q2 = ctx.q2Nome;
  switch (lblQ2) {
    case 'S22':
      _peScrHeader(sh, 5, 4, 'S22', nS22, '11.40 - 20.00', _PE_CLR.giallo);
      break;
    case 'C23':
      _peScrHeader(sh, 5, 4, 'C23', nC23bg, '11.40 - 20.10', _PE_CLR.c23);
      break;
    case 'S3':
      _peScrHeader(sh, 5, 4, 'S3', q2 || nS3, '20.00 - 02.00', _PE_CLR.giallo);
      break;
    case 'S5':
      _peScrHeader(sh, 5, 4, 'S5', q2 || _peGPN(dT, 'S5'), '17.00 - 02.00', _PE_CLR.giallo);
      break;
    case 'S7C':
      _peScrHeader(sh, 5, 4, 'S7C', q2 || _peGPN(dT, 'S7C'), '19.50 - 02.00', _PE_CLR.giallo);
      break;
    case 'S8C':
      _peScrHeader(sh, 5, 4, 'S8C', q2 || _peGPN(dT, 'S8C'), '20.50 - 04.10', _PE_CLR.giallo);
      break;
    case 'S7':
      _peScrHeader(sh, 5, 4, 'S7', q2 || _peGPN(dT, 'S7'), '19.50 - 04.00', _PE_CLR.giallo);
      break;
    case 'S31':
      _peScrHeader(sh, 5, 4, 'S31', q2 || _peGPN(dT, 'S31'), '16.00 - 01.00', _PE_CLR.giallo);
      break;
    case 'C20':
      _peScrHeader(sh, 5, 4, 'C20', nC20, '19.40 - 03.10', _PE_CLR.azzurro);
      break;
  }
}
function _peEseguiQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22, nBG3, hasR24, bg3FaRec, s3PausaPrima) {
  const dT = ctx.dT;
  const q2 = ctx.q2Nome;
  switch (lblQ2) {
    case 'S22':
      _pePatternS22_Cassa(sh, ctx, 4, nS22);
      break;
    case 'C23':
      _pePatternC23_Cassa(sh, ctx, 4, nC23bg, true);
      break;
    case 'S3':
      _pePatternS3(sh, ctx, 4, q2 || nS3, hasR24, bg3FaRec, s3PausaPrima);
      break;
    case 'S5':
      _pePatternS3(sh, ctx, 4, q2 || _peGPN(dT, 'S5'), hasR24, bg3FaRec, s3PausaPrima);
      break;
    case 'S7C':
      _pePatternS3(sh, ctx, 4, q2 || _peGPN(dT, 'S7C'), hasR24, bg3FaRec, s3PausaPrima);
      break;
    case 'S8C':
      _pePatternS8C_Q2(sh, ctx, 4, q2 || _peGPN(dT, 'S8C'));
      break;
    case 'S7':
      _pePatternS7_Q2(sh, ctx, 4, q2 || _peGPN(dT, 'S7'));
      break;
    case 'S31':
      _pePatternS31_Q2(sh, ctx, 4, q2 || _peGPN(dT, 'S31'));
      break;
    case 'C20':
      _pePatternC20_BG(sh, ctx, 4, nC20, nBG3);
      break;
  }
}

// ---------- scelta Q2 (condivisa LUN-GIO / DOM) ----------
// escludi: chi fa gia la colonna dei cambi di sala e rec (BG3). La stessa persona
// non puo fare due colonne nello stesso orario: si prende un altro collega dello
// stesso turno o il prossimo dell elenco (prima capitava in una decina di giorni
// l anno, es. "S1 - S7 - S7" con un solo S7). Il nome scelto va in ctx.q2Nome.
function _peScegliQ2(ctx, bgCassa, nS3, s3FaCassa, nC20, bg1IsC23, conS22C23, escludi) {
  const dT = ctx.dT;
  const dc = ctx.dc;
  const pers = (t) => (dT[t] || []).map((x) => String(x).trim()).find((n) => n && n !== escludi) || '';
  const scegli = (lbl, nome) => {
    ctx.q2Nome = nome;
    return lbl;
  };
  ctx.q2Nome = '';
  const s3 = nS3 && nS3 !== escludi ? nS3 : pers('S3');
  const s3Cassa = s3 ? (s3 === nS3 ? s3FaCassa : _pePuoCoprire(dc, s3, 'C0')) : false;
  const c20 = nC20 && nC20 !== escludi ? nC20 : '';
  if (conS22C23 && bgCassa === 'S22' && !nS3) return scegli('S22', '');
  if (conS22C23 && bgCassa === 'C23' && !nS3 && !bg1IsC23) return scegli('C23', '');
  if (s3 && s3Cassa) return scegli('S3', s3);
  if (s3 && !s3Cassa) {
    const s5 = pers('S5');
    if (s5 && _pePuoCoprire(dc, s5, 'C0')) return scegli('S5', s5);
    if (c20) return scegli('C20', c20);
    return scegli('S3', s3);
  }
  for (const t of ['S7C', 'S8C', 'S7', 'S31']) {
    const n = pers(t);
    if (n && _pePuoCoprire(dc, n, 'C0')) return scegli(t, n);
  }
  if (c20) return scegli('C20', c20);
  return scegli('', '');
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
  const lblQ2 = _peScegliQ2(ctx, bgCassa, nS3, s3FaCassa, nC20, bg1.bg1IsC23, true, bg3.nBG3);

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
  _peEseguiQ2(sh, ctx, lblQ2, nS3, nC23bg, nC20, nS22, bg3.nBG3, hasR24, bg3FaRec, true);

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
        true,
      );
      break;
    case 'S5':
      _pePatternBG3_S5(sh, ctx, 7, bg3.nBG3, bg3.bgRec, nS3, bg3DaR23Sera, hasR24, lblQ2 === 'S7', bg3FaRec, true);
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
  const lblQ2d = _peScegliQ2(ctx, '', nS3, s3FaCassa, nC20, bg1.bg1IsC23, false, bg3.nBG3);

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
  // numeri cassa delle coppie CONFIGURATE (Impostazioni del piano): la cassa
  // principale e' la coppia che apre con C23, la secondaria quella di C0.
  // Prima 3/4 e 2/7 erano scritti fissi e ignoravano le impostazioni.
  const coppie = (window._pianoCdCfg && window._pianoCdCfg.coppie) || [];
  const cdDi = (apre, fallback) => {
    const c = coppie.find((x) => String(x.apre || '').toUpperCase() === apre);
    return new Set((c && Array.isArray(c.cd) ? c.cd : fallback).map((x) => parseInt(x)));
  };
  const cdPrincSet = cdDi('C23', [3, 4]);
  const cdSecSet = cdDi('C0', [2, 7]);
  if (numC8Eff >= 3) {
    for (let j = 0; j < numC8; j++)
      if (cdPrincSet.has(ctx.c8Cd[j])) {
        nCassaPrinc = ctx.c8Nomi[j];
        cdPrinc = ctx.c8Cd[j];
        break;
      }
    if (!nCassaPrinc && numC8) {
      nCassaPrinc = ctx.c8Nomi[0];
      cdPrinc = ctx.c8Cd[0];
    }
    for (let j = 0; j < numC8; j++)
      if (ctx.c8Nomi[j] !== nCassaPrinc && cdSecSet.has(ctx.c8Cd[j])) {
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
      if (cdSecSet.has(ctx.c8Cd[j])) {
        nCassaPrinc = ctx.c8Nomi[j];
        cdPrinc = ctx.c8Cd[j];
        break;
      }
    if (!nCassaPrinc && numC8 >= 1) {
      nCassaPrinc = ctx.c8Nomi[0];
      cdPrinc = ctx.c8Cd[0];
    }
  }
  // se il numero CD non è stato scritto nel briefing, l'etichetta resta C8
  const lblPrinc = cdPrinc > 0 ? 'CD ' + String(cdPrinc).padStart(2, '0') : 'C8';
  const lblSec = cdSec > 0 ? 'CD ' + String(cdSec).padStart(2, '0') : 'C8 (2)';

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
  if (nCassaPrinc) _peScrHeader(sh, 5, 7, lblPrinc, nCassaPrinc, '20.50 - 05.00', _PE_CLR.azzurro);

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
  // la colonna del rec e di S3 o S5 (non di R8): le loro pause seguono la regola delle ore
  const recBgBreve = !!bgRecPrima && bgRecPrima !== nR8;
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
    // la colonna e di S3/S5 (15+15) oppure di R8, che ha le sue pause alle 24.00,
    // 02.00 e 03.30: per R8 qui niente pausa alle 22.00 (sarebbe la quarta)
    r = _peSS(sh, r, 4, recBgBreve ? 'PAUSA' : 'REC', '22.00 - 22.15');
    r = _peSS(sh, r, 4, 'REC', '22.15 - 23.30');
    r = _peSN(sh, ctx, r, 4, 'R8', '23.30 - 24.00', nR8, bgRecPrima);
    // colonna di S3 o S5 che fa il rec: 15+15 (regola delle ore); di R8: 30
    if (recBgBreve) {
      r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.15');
      r = _peSS(sh, r, 4, 'REC', '24.15 - 24.30');
    } else r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.30');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSS(sh, r, 4, recBgBreve ? 'REC' : 'PAUSA', '24.45 - 01.00');
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
    if (recBgBreve) {
      r = _peSS(sh, r, 4, 'REC', '23.30 - 24.00');
      r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.15');
      r = _peSS(sh, r, 4, 'REC', '24.15 - 24.30');
    } else r = _peSS(sh, r, 4, 'PAUSA', '24.00 - 24.30');
    if (numR23 >= 2) {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.45 - 01.00', bgRecPrima);
    } else {
      r = _peSPP(sh, ctx, r, 4, 'R23', '24.30 - 24.45', bgRecPrima);
      r = _peSS(sh, r, 4, recBgBreve ? 'REC' : 'PAUSA', '24.45 - 01.00');
    }
    r = _peSS(sh, r, 4, 'REC', '01.00 - 02.00');
  }

  // Q3 CASSA · solo se quel giorno c'è almeno un C8
  r = 7;
  if (!nCassaPrinc) {
    // nessun C8: la terza colonna resta per gli extra
  } else if (numC8Eff <= 2) {
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
    // con l S5 che non riceve cambi dall S7 (S3 e S7C gia nelle sue righe) e l S1 in
    // sala fino alle 21: l S7 va in pausa prima (20.30) e crea spazio per l S5, che
    // cosi non fa la pausa della sera troppo tardi
    const s5Presto = dT['S5'] && dT['S1'] && recSost !== 'S5' && sA !== 'S5' && sB !== 'S5';
    if (numS7 >= 2 && s5Presto) {
      r = _peSS(sh, r, 1, 'SALA', '20.00 - 20.30');
      r = _peSS(sh, r, 1, 'PAUSA', '20.30 - 21.00');
      r = _peSPP(sh, ctx, r, 1, 'S7', '21.00 - 21.30', nS7);
      r = _peSPP(sh, ctx, r, 1, 'S5', '21.30 - 21.45', nS7);
      r = _peSS(sh, r, 1, 'SALA', '21.45 - 22.00');
    } else if (numS7 >= 2) {
      r = _peSS(sh, r, 1, 'SALA', '20.00 - 21.00');
      r = _peSS(sh, r, 1, 'PAUSA', '21.00 - 21.30');
      r = _peSPP(sh, ctx, r, 1, 'S7', '21.30 - 22.00', nS7);
    }
    if (numS7 >= 2) {
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
    // se la colonna del rec e di S3/S5, R8 ha gia il quarto d ora delle 01.45 (dato da
    // loro): qui niente pausa alle 02.00, sarebbe attaccata (30 invece di 15)
    r = _peSS(sh, r, 4, recBgBreve ? 'REC' : 'PAUSA', '02.00 - 02.15');
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
    // R23 ha gia 30 (21.00) e 15 (24.30) dalla colonna del rec: qui solo l ultima
    r = _peSS(sh, r, 4, 'REC', '02.00 - 03.30');
    r = _peSS(sh, r, 4, 'PAUSA', '03.30 - 03.45');
    r = _peSS(sh, r, 4, 'REC', '03.45 - 04.00');
  }

  if (bg1.bg1IsC23 && bg1.nS1Orig) {
    const startS1vs = _peMaxR(sh) + 3;
    _peScrHeader(sh, startS1vs, 1, bg1.lblS1Orig, bg1.nS1Orig, '14.00 - 21.00', _PE_CLR.sala);
    _pePatternS1_SoloSala(sh, ctx, startS1vs + 2, 1, bg1.nS1Orig);
  }
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
  // se un turno ha già ricevuto i suoi slot pausa nella griglia (piazzati
  // da PiazzaPauseExtra), niente blocco personale doppio
  const lastRE = _peMaxR(sh);
  const haSlot = (turno) => {
    for (let c = 1; c <= 7; c += 3)
      for (let rr = 7; rr <= lastRE; rr++) {
        const cell = _peGet(sh, rr, c);
        if (cell && String(cell.v) === turno) return true;
      }
    return false;
  };
  Object.keys(extraNomi).forEach((nome) => {
    const turno = extraNomi[nome];
    if (haSlot(turno)) return;
    const sett = _peSettoreTurno(turno);
    const pauseMin = _peMinutiPausa(ctx.orari, turno);
    const clrH =
      sett === 'S' ? _PE_CLR.sala : sett === 'R' ? _PE_CLR.rec : sett === 'C' ? _PE_CLR.cassa : _PE_CLR.grigio;
    const startR = _peMaxR(sh) + 3;
    const o = ctx.orari[turno];
    _peScrHeader(sh, startR, 1, turno, nome, o ? o.iniStr + ' - ' + o.finStr : '', clrH);
    sh.celle[startR + '|1'].pers = 1; // colonnina personale: non da cambi ad altri
    // e non da cambi: facoltativa in stampa, come le altre colonnine personali
    sh.celle[startR + '|1'].opz = 'pause da solo';
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
  const rDist = _peRegola('distanza');
  const gap = rDist ? parseInt(rDist.minuti) || 0 : 0;
  let prevEnd = o.ini;
  for (let k = 1; k <= numPause; k++) {
    let curMin = Math.floor((o.ini + intervallo * k) / 15) * 15;
    if (curMin < prevEnd + gap) curMin = Math.ceil((prevEnd + gap) / 15) * 15;
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
// FORMAZIONE: chi nel piano ha il commento "formazione" (o "affiancamento") e ha
// un collega sullo stesso turno sta con lui: stessa postazione e stesse pause,
// quindi per le pause conta come una persona sola (vale per tutti i turni: R22,
// S22, casse...). Se sullo stesso turno non c e nessun altro, e una persona normale.
// Restituisce le righe senza chi e in formazione e l elenco {nome, turno, con}.
function _pcFormazione(righe) {
  const valide = (righe || []).filter((r) => r && r.nome && r.turno);
  const turno = (r) =>
    String(r.turno || '')
      .trim()
      .toUpperCase();
  const affiancati = [];
  const tolti = new Set();
  // chi guida una coppia di formazione resta nell elenco segnato (fmCoppia): la
  // funzione si puo applicare di nuovo allo stesso elenco senza rifare le coppie
  const guidaCoppia = new Set();
  const inF = (r) => r.fm && !r.fmCoppia;
  const perTurno = {};
  valide.forEach((r) => (perTurno[turno(r)] = perTurno[turno(r)] || []).push(r));
  Object.keys(perTurno).forEach((t) => {
    const l = perTurno[t];
    if (l.length < 2 || !l.some(inF)) return;
    // chi e in formazione va in coppia: se il commento e scritto su piu persone
    // dello stesso turno (formatore e allievo, es. due R22 con FORMAZIONE REC e un
    // terzo R22 senza) sono loro la coppia, il primo guida; se e scritto su una
    // sola persona va con un collega del turno senza commento. Con piu allievi, uno
    // per ciascun collega a turno.
    const inForm = l.filter(inF);
    const guide = l.filter((r) => !inF(r));
    const capi = inForm.length >= 2 ? [inForm[0]] : guide.length ? guide : [inForm[0]];
    const seguono = inForm.filter((r) => !capi.includes(r));
    capi.forEach((r) => inF(r) && guidaCoppia.add(r));
    seguono.forEach((r, k) => {
      const con = capi[k % capi.length];
      tolti.add(r);
      affiancati.push({ nome: String(r.nome).trim(), turno: t, con: String(con.nome).trim() });
    });
  });
  return {
    righe: (righe || [])
      .filter((r) => !tolti.has(r))
      .map((r) => (guidaCoppia.has(r) ? Object.assign({}, r, { fmCoppia: true }) : r)),
    affiancati: affiancati,
  };
}
function _peGeneraSlots(righeTutte, dstr) {
  const form = _pcFormazione(righeTutte);
  const righe = form.righe;
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
  window._peDowCorrente = dow;
  const sh = _peSheet();
  const dataStr = dstr.split('-').reverse().join('.');
  if (tipoGiorno === 'LUN-GIO') _peGeneraLunGio(sh, ctx, dataStr);
  else if (tipoGiorno === 'VEN-SAB') _peGeneraVenSab(sh, ctx, dataStr);
  else _peGeneraDomenica(sh, ctx, dataStr);
  _peGeneraExtra(sh, ctx, tipoGiorno);
  _peCompattaSala(sh);
  const biglietto = _peBigliettoMattino(ctx);
  const out = { tipo: 'slots', celle: sh.celle, nR: _peMaxR(sh), tipoGiorno: tipoGiorno };
  if (biglietto) out.biglietti = [biglietto];
  if (form.affiancati.length) out.formazione = form.affiancati;
  const proposte = _peCompletaPause(out, ctx, righe, dstr).concat(_peRisolviSalaVuota(out, righe, dstr));
  if (proposte.length) out.proposte = proposte;
  window._peDowCorrente = null;
  return out;
}
// ---------- SALA MAI VUOTA: spostamenti come con le frecce ----------
// Se in un momento nessuno e in sala (chi da i cambi e in cassa o al rec mentre
// l altro di sala e in pausa), il programma prova gli spostamenti che farebbe un
// responsabile con le frecce: scambiare una pausa o un cambio con la riga vicina.
// Tiene lo spostamento che toglie piu sala vuota senza creare altri problemi
// (regola delle ore, distanza, pause nella prima o nell ultima mezz ora) e
// ripete finche migliora. Ogni spostamento e una proposta (blu) con il motivo.
function _pcPunteggio(c, persone) {
  const PC = window.PauseControlli;
  const pp = PC.pausePersone(c, persone, c.biglietti);
  let v = 0;
  PC.salaVuota(c, persone, pp, c.biglietti).forEach((b) => (v += 100 * (b.fin - b.ini)));
  PC.controlla(c, persone, { biglietti: c.biglietti }).forEach((a) => {
    if (a.tipo !== 'sala') v += 5000;
  });
  // pause nella prima o nell ultima mezz ora del turno: da evitare
  persone.forEach((p) => {
    const i = pp[p.nome];
    if (!i || !i.alternative[0] || p.ini == null) return;
    i.alternative[0].pause.forEach((x) => {
      if (x.ini < p.ini + 30 || x.fin > p.fin - 30) v += 400;
    });
  });
  return v;
}
function _peRisolviSalaVuota(c, righe, dstr) {
  const PC = window.PauseControlli;
  const out = [];
  if (!PC) return out;
  const persone = _pcPersone(righe, dstr);
  const vuota = () => PC.salaVuota(c, persone, PC.pausePersone(c, persone, c.biglietti), c.biglietti).length;
  if (!vuota()) return out;
  let attuale = _pcPunteggio(c, persone);
  for (let giro = 0; giro < 8 && vuota(); giro++) {
    let meglio = null;
    PC.blocchi(c)
      .filter((b) => !/ALT/.test(b.post))
      .forEach((b) => {
        b.righe.forEach((x) => {
          // si spostano pause e cambi, non le righe libere
          if (_PC_LIBERE.includes(x.pos)) return;
          [-1, 1].forEach((dir) => {
            const copia = JSON.stringify({ celle: c.celle, nR: c.nR });
            const r2 = _pbScambia(c, b.base, x.r, dir);
            if (r2) {
              const v = _pcPunteggio(c, persone);
              if (v < attuale && (!meglio || v < meglio.v)) meglio = { v: v, b: b, x: x, dir: dir, r2: r2 };
            }
            const o = JSON.parse(copia);
            c.celle = o.celle;
            c.nR = o.nR;
          });
        });
      });
    if (!meglio) break;
    const prima = { pos: meglio.x.pos, ini: meglio.x.ini, fin: meglio.x.fin };
    _pbScambia(c, meglio.b.base, meglio.x.r, meglio.dir);
    [meglio.x.r, meglio.r2].forEach((r) => {
      [meglio.b.base, meglio.b.base + 1].forEach((col) => {
        if (c.celle[r + '|' + col]) c.celle[r + '|' + col].prop = 1;
      });
    });
    const dopo = _pbIntervallo((c.celle[meglio.r2 + '|' + (meglio.b.base + 1)] || {}).v) || prima;
    out.push({
      modo: 'spostata',
      nome: meglio.b.nome,
      turno: meglio.b.post,
      pos: prima.pos,
      ini: dopo.ini,
      fin: dopo.fin,
      daIni: prima.ini,
      daFin: prima.fin,
    });
    attuale = meglio.v;
  }
  return out;
}
// ---------- COMPLETAMENTO: le pause che la regola prevede e il foglio non da ----------
// Per ogni persona senza colonna propria a cui manca una pausa (es. S31, il
// secondo C15, il secondo quarto d ora serale di S5 il venerdi), il programma
// decide come farebbe un responsabile, secondo il reparto:
//  - SALA: se in sala resta almeno un altro collega, va in pausa da solo; le
//    pause dei colleghi si sfalsano;
//  - REC: da solo se al rec resta un altro collega, altrimenti cambio;
//  - CASSA: sempre un cambio da chi e formato in cassa ed e libero; se nessuno
//    puo, la pausa si propone comunque e si avvisa che la cassa resta senza cambio.
// Il cambio lo da una colonna libera in quel momento (SALA, REC, CASSA), formata
// (Formazione); meglio chi gia copre quella postazione e chi ha meno cambi in
// quell ora. Quando: non nella prima mezz ora ne nell ultima del turno, almeno
// un ora dalle altre pause (si cerca l ora e mezza), al centro dello spazio
// libero, senza lasciare la sala vuota. Chi va in pausa da solo riceve una sua
// colonnina con tutte le sue pause. Le righe nuove sono proposte (in blu).
const _PC_LIBERE = ['SALA', 'REC', 'CASSA'];
function _pcRigaNuova(c, base, dopoR) {
  // sposta in giu di una riga le celle di questa coppia di colonne sotto dopoR
  for (let rr = c.nR; rr > dopoR; rr--) {
    [base, base + 1].forEach((col) => {
      const k = rr + '|' + col;
      if (c.celle[k]) {
        c.celle[rr + 1 + '|' + col] = c.celle[k];
        delete c.celle[k];
      }
    });
  }
  c.nR += 1;
  return dopoR + 1;
}
function _pcScriviRiga(c, r, base, pos, ini, fin, modello, prop, per) {
  const clr = _peColoreSettore(pos) || (modello && modello.bg) || '';
  const a = { v: pos, b: 1, bg: clr, sz: 9 };
  const b = { v: _pbOra(ini) + ' - ' + _pbOra(fin), b: 1, bg: clr, sz: 9 };
  if (prop) {
    a.prop = 1;
    b.prop = 1;
  }
  // per chi e la pausa (serve quando due persone hanno lo stesso turno)
  if (per) a.per = per;
  c.celle[r + '|' + base] = a;
  c.celle[r + '|' + (base + 1)] = b;
}
// mette `pos` fra ini e fin dentro una riga libera (la divide se serve)
function _pcInserisciCambio(c, base, riga, pos, ini, fin, per) {
  const libera = riga.pos;
  const modello = c.celle[riga.r + '|' + base];
  let r = riga.r;
  if (ini > riga.ini) {
    _pcScriviRiga(c, r, base, libera, riga.ini, ini, modello, false);
    r = _pcRigaNuova(c, base, r);
  }
  _pcScriviRiga(c, r, base, pos, ini, fin, modello, true, per);
  if (fin < riga.fin) {
    r = _pcRigaNuova(c, base, r);
    _pcScriviRiga(c, r, base, libera, fin, riga.fin, modello, false);
  }
}
// colonnina personale: intestazione (turno, nome, orario) e la giornata con le pause
function _pcBloccoPersonale(c, p, pause, opz) {
  const ultima = (base) => {
    let m = 0;
    Object.keys(c.celle).forEach((k) => {
      const [r, col] = k.split('|').map(Number);
      if ((col === base || col === base + 1) && r > m) m = r;
    });
    return m;
  };
  const base = [1, 4, 7].sort((a, b) => ultima(a) - ultima(b))[0];
  let r = Math.max(ultima(base) + 3, 7);
  const sett = _peSettoreTurno(p.turno);
  const clr = sett === 'S' ? _PE_CLR.sala : sett === 'R' ? _PE_CLR.rec : sett === 'C' ? _PE_CLR.cassa : _PE_CLR.grigio;
  // pers: colonnina personale (non da cambi ad altri)
  c.celle[r + '|' + base] = { v: p.turno, b: 1, bg: clr, sz: 10, hdr: 1, pers: 1 };
  // opz: colonna facoltativa in stampa (accoglienza, secondo collega sullo stesso turno)
  if (opz) c.celle[r + '|' + base].opz = opz;
  c.celle[r + '|' + (base + 1)] = { v: p.nome, b: 1, bg: clr, sz: 9, hdr: 1 };
  c.celle[r + 1 + '|' + (base + 1)] = { v: _pbOra(p.ini) + ' - ' + _pbOra(p.fin), b: 1, sz: 9, ora: 1 };
  r += 2;
  const lbl = _peNomeSettore(sett);
  let t = p.ini;
  pause
    .slice()
    .sort((a, b) => a.ini - b.ini)
    .forEach((x) => {
      if (x.ini > t) _pcScriviRiga(c, r++, base, lbl, t, x.ini, null, false);
      _pcScriviRiga(c, r++, base, 'PAUSA', x.ini, x.fin, null, !!x.nuova && !/^(accoglienza|secondo)/.test(opz));
      t = x.fin;
    });
  if (t < p.fin) _pcScriviRiga(c, r++, base, lbl, t, p.fin, null, false);
  c.nR = Math.max(c.nR, r);
}
function _peCompletaPause(c, ctx, righe, dstr) {
  const PC = window.PauseControlli;
  const proposte = [];
  if (!PC) return proposte;
  const persone = _pcPersone(righe, dstr);
  // a chi va ogni riga di copertura si decide una volta, all inizio; le righe che
  // non coprono la pausa di nessuno (es. la seconda riga R22 con un solo R22)
  // tornano libere (SALA, REC o CASSA come la colonna)
  PC.attribuisci(c, persone, c.biglietti).avanzi.forEach((k) => {
    const [r, col] = k.split('|').map(Number);
    const blk = PC.blocchi(c).find((b) => b.base === col && b.righe.some((x) => x.r === r));
    const libera = (blk && blk.righe.find((x) => _PC_LIBERE.includes(x.pos))) || null;
    const lbl = libera ? libera.pos : 'SALA';
    const a = c.celle[k];
    const b = c.celle[r + '|' + (col + 1)];
    if (!a || !b) return;
    a.v = lbl;
    a.bg = _peColoreSettore(lbl);
    b.bg = a.bg;
    delete a.per;
    delete a.fg;
    delete b.fg;
    b.v = String(b.v).replace(/\s*\[!\]\s*$/, '');
  });
  PC.fissaAttribuzioni(c, persone, c.biglietti);

  const leggi = () => PC.pausePersone(c, persone, c.biglietti);
  const vuota = () => PC.salaVuota(c, persone, leggi(), c.biglietti).reduce((s, b) => s + b.fin - b.ini, 0);
  // pause gia decise in questo giro per chi va in pausa da solo (non ancora nel foglio)
  const decise = {};
  const pauseDi = (q, pp) => {
    const i = pp[q.nome];
    const l = i && i.alternative[0] ? i.alternative[0].pause.map((x) => ({ ini: x.ini, fin: x.fin })) : [];
    return l.concat(decise[q.nome] || []);
  };
  // un collega dello stesso reparto e al lavoro e non in pausa per tutta la fascia
  // in ogni quarto d ora della pausa almeno un collega del suo reparto e davvero li
  // (per la sala: su una riga SALA o su una sigla S; chi e in cassa o al rec a dare i
  // cambi non conta). Prima bastava che il collega non fosse in pausa.
  const colleghiLiberi = (p, t1, t2, pp) => {
    const bl = PC.blocchi(c);
    const sett = _peSettoreTurno(p.turno);
    let minimo = Infinity;
    for (let t = t1; t < t2; t += 15) {
      let n = 0;
      persone.forEach((q) => {
        if (q === p) return;
        const dove = PC.reparto(q, pp[q.nome], bl, t);
        const dec = (decise[q.nome] || []).some((x) => x.ini <= t && t < x.fin);
        if (dove === sett && !dec) n++;
      });
      // chi dal bigliettino copre una postazione del reparto (es. C4 su S22 alle 13.00)
      (c.biglietti || []).forEach((bg) =>
        (bg.righe || []).forEach((x) => {
          if (x.chi && String(x.pos)[0] === sett && x.ini <= t && t < x.fin) n++;
        }),
      );
      minimo = Math.min(minimo, n);
    }
    return minimo === Infinity ? 0 : minimo;
  };
  const inPausaInsieme = (p, t1, t2, pp) =>
    persone.filter(
      (q) =>
        q !== p &&
        _peSettoreTurno(q.turno) === _peSettoreTurno(p.turno) &&
        pauseDi(q, pp).some((x) => x.ini < t2 && x.fin > t1),
    ).length;
  // punteggio di un orario per la persona: equilibrio fra le sue pause
  const valuta = (p, fatte, t, d) => {
    if (t < p.ini + 30 || t + d > p.fin - 30) return null;
    let prima = null;
    let dopo = null;
    for (const x of fatte) {
      if (x.ini < t + d && x.fin > t) return null;
      if (x.fin <= t && (prima == null || x.fin > prima)) prima = x.fin;
      if (x.ini >= t + d && (dopo == null || x.ini < dopo)) dopo = x.ini;
    }
    const dPrima = prima == null ? t - p.ini : t - prima;
    const dDopo = dopo == null ? p.fin - (t + d) : dopo - (t + d);
    if ((prima != null && dPrima < PC.DISTANZA_MIN) || (dopo != null && dDopo < PC.DISTANZA_MIN)) return null;
    let punti = Math.min(dPrima, dDopo);
    if ((prima != null && dPrima < 90) || (dopo != null && dDopo < 90)) punti -= 60;
    return punti;
  };
  const ordine = persone.filter((p) => p.ini != null && p.attese && p.attese.length).sort((a, b) => a.ini - b.ini);
  for (const p of ordine) {
    const sett = _peSettoreTurno(p.turno);
    let pp = leggi();
    const info = pp[p.nome];
    if (!info || info.colonna || info.rotazione) continue;
    // accoglienza: le pause si suggeriscono in una colonna facoltativa (si organizzano
    // da soli), senza cambi, senza proposte e senza avvisi
    if (p.acc) {
      const gia = (info.alternative[0] || { pause: [] }).pause.map((x) => ({ ini: x.ini, fin: x.fin }));
      const resto = p.attese.slice().sort((a, b) => b - a);
      gia.forEach((x) => {
        const i = resto.indexOf(x.fin - x.ini);
        if (i >= 0) resto.splice(i, 1);
      });
      const tutte = gia.slice();
      resto.forEach((d) => {
        let m = null;
        for (let t = Math.ceil((p.ini + 30) / 15) * 15; t + d <= p.fin - 30; t += 15) {
          const v = valuta(p, tutte, t, d);
          if (v != null && (!m || v > m.v)) m = { v: v, t: t };
        }
        if (m) tutte.push({ ini: m.t, fin: m.t + d, nuova: true });
      });
      if (tutte.length) _pcBloccoPersonale(c, p, tutte, 'accoglienza');
      continue;
    }
    const esistenti = (info.alternative[0] || { pause: [] }).pause.map((x) => ({ ini: x.ini, fin: x.fin }));
    // cosa manca: le pause attese non ancora nel foglio (se ci sono pause di
    // durata diversa dalla regola non si tocca nulla: resta l avviso)
    const resto = p.attese.slice().sort((a, b) => b - a);
    let diverse = false;
    esistenti.forEach((x) => {
      const i = resto.indexOf(x.fin - x.ini);
      if (i >= 0) resto.splice(i, 1);
      else diverse = true;
    });
    if (diverse || !resto.length) continue;
    const soli = [];
    for (const d of resto) {
      pp = leggi();
      const fatte = esistenti
        .concat(soli, decise[p.nome] || [])
        .concat((pauseDi(p, pp) || []).filter((x) => !esistenti.some((y) => y.ini === x.ini)));
      // 1. da solo (sala e rec) se resta un collega del reparto
      let daSolo = null;
      if (sett !== 'C') {
        for (let t = Math.ceil((p.ini + 30) / 15) * 15; t + d <= p.fin - 30; t += 15) {
          let punti = valuta(p, fatte, t, d);
          if (punti == null || !colleghiLiberi(p, t, t + d, pp)) continue;
          punti -= 40 * inPausaInsieme(p, t, t + d, pp);
          if (!daSolo || punti > daSolo.punti) daSolo = { punti: punti, t: t };
        }
      }
      if (daSolo) {
        soli.push({ ini: daSolo.t, fin: daSolo.t + d, nuova: true });
        continue;
      }
      // 2. cambio da un collega formato e libero
      let migliore = null;
      PC.blocchi(c)
        .filter((b) => !/ALT/.test(b.post) && !b.personale && b.nome && !/^\(/.test(b.nome))
        .forEach((b) => {
          if (String(b.nome).toUpperCase() === p.nome.toUpperCase()) return;
          if (!_pePuoCoprire(ctx.dc, b.nome, p.turno)) return;
          const giaCopre = b.righe.some((x) => x.pos === p.turno);
          b.righe.forEach((riga) => {
            if (!_PC_LIBERE.includes(riga.pos)) return;
            for (let t = Math.ceil(riga.ini / 15) * 15; t + d <= riga.fin; t += 15) {
              let punti = valuta(p, fatte, t, d);
              if (punti == null) continue;
              if (giaCopre) punti += 20;
              // equita fra chi da i cambi: meno cambi nell ora intorno
              punti -=
                5 *
                b.righe.filter(
                  (x) => !_PC_LIBERE.includes(x.pos) && x.pos !== 'PAUSA' && x.ini < t + 60 && x.fin > t - 60,
                ).length;
              if (!migliore || punti > migliore.punti) migliore = { punti: punti, b: b, riga: riga, t: t };
            }
          });
        });
      if (migliore) {
        const copia = JSON.stringify({ celle: c.celle, nR: c.nR });
        const primaVuota = vuota();
        _pcInserisciCambio(c, migliore.b.base, migliore.riga, p.turno, migliore.t, migliore.t + d, p.nome);
        // la sala non deve restare vuota piu di prima: altrimenti si rinuncia al cambio
        if (vuota() > primaVuota) {
          const o = JSON.parse(copia);
          c.celle = o.celle;
          c.nR = o.nR;
        } else {
          esistenti.push({ ini: migliore.t, fin: migliore.t + d });
          proposte.push({
            modo: 'cambio',
            nome: p.nome,
            turno: p.turno,
            ini: migliore.t,
            fin: migliore.t + d,
            chi: migliore.b.nome,
            chiTurno: migliore.b.post,
          });
          continue;
        }
      }
      // 3. nessuno puo dare il cambio: la pausa si propone comunque, con avviso
      let ripiego = null;
      for (let t = Math.ceil((p.ini + 30) / 15) * 15; t + d <= p.fin - 30; t += 15) {
        const punti = valuta(p, fatte, t, d);
        if (punti != null && (!ripiego || punti > ripiego.punti)) ripiego = { punti: punti, t: t };
      }
      if (ripiego) soli.push({ ini: ripiego.t, fin: ripiego.t + d, nuova: true, scoperta: true });
    }
    if (soli.length) {
      // colonnina personale con tutte le sue pause (quelle con cambio restano anche
      // nella colonna di chi le copre)
      const tutte = esistenti.map((x) => ({ ini: x.ini, fin: x.fin })).concat(soli);
      // con un collega sullo stesso turno (es. due S5) la colonnina e facoltativa in stampa
      // (facoltativa solo se l altro e gia nel foglio: il primo dei due si stampa sempre)
      const ppNow = leggi();
      const doppio = persone.some(
        (q) =>
          q !== p &&
          q.turno === p.turno &&
          ppNow[q.nome] &&
          ((ppNow[q.nome].colonna &&
            !PC.blocchi(c).some((b) => b.opz && String(b.nome).toUpperCase() === q.nome.toUpperCase())) ||
            (ppNow[q.nome].alternative[0] && ppNow[q.nome].alternative[0].pause.length)),
      );
      // chi non da cambi non riceve un bigliettino da stampare: la sua colonnina e
      // facoltativa (sotto il foglio, in stampa solo se spuntata) ma le pause restano
      // nei controlli
      _pcBloccoPersonale(c, p, tutte, doppio ? 'secondo ' + p.turno : 'pause da solo');
      decise[p.nome] = (decise[p.nome] || []).concat(soli);
      soli.forEach((x) =>
        proposte.push({
          modo: x.scoperta ? 'scoperta' : 'solo',
          nome: p.nome,
          turno: p.turno,
          ini: x.ini,
          fin: x.fin,
          chi: '',
          chiTurno: '',
        }),
      );
    }
  }
  return proposte;
}
// BIGLIETTINO DEL MATTINO (C4, cassa tavoli): apre alle 11.40, da la mezz ora ai
// due R22 fra le 12.00 e le 13.00 e a S22 alle 13.00, poi va in pausa 13.30-14.00
// (la cassa tavoli apre alle 14.00). Non entra nelle colonne del foglio: si
// stampa a parte, ma le sue pause contano nei controlli.
function _peBigliettoMattino(ctx) {
  const nC4 = _peGPN(ctx.dT, 'C4');
  if (!nC4) return null;
  const r22 = (ctx.dT['R22'] || []).map((n) => String(n).trim()).filter(Boolean);
  const nS22 = _peGPN(ctx.dT, 'S22');
  const righe = [];
  if (r22[0]) righe.push({ pos: 'R22', nome: r22[0], ini: 720, fin: 750, chi: nC4 });
  if (r22[1]) righe.push({ pos: 'R22', nome: r22[1], ini: 750, fin: 780, chi: nC4 });
  if (nS22) righe.push({ pos: 'S22', nome: nS22, ini: 780, fin: 810, chi: nC4 });
  righe.push({ pos: 'PAUSA', nome: nC4, ini: 810, fin: 840 });
  return { titolo: 'C4 · MATTINO', turno: 'C4', nome: nC4, righe: righe };
}
// persone del giorno per i controlli: turno, orario (da Turni) e pause attese
// (dalla regola del turno o di durata, scheda Regole pause)
function _pcPersone(righeTutte, dstr) {
  const righe = _pcFormazione(righeTutte).righe;
  const orari = _peOrariTurni();
  const dow = new Date(dstr + 'T12:00:00').getDay();
  const visti = new Set();
  const out = [];
  (righe || []).forEach((r) => {
    const nome = String(r.nome || '').trim();
    const turno = String(r.turno || '')
      .trim()
      .toUpperCase();
    if (!nome || !turno || visti.has(nome.toUpperCase())) return;
    if (String(nome).toUpperCase() === 'XXX' || !_peSettoreTurno(turno)) return;
    visti.add(nome.toUpperCase());
    const o = orari[turno];
    // stessa convenzione del foglio: prima delle 11.00 e dopo mezzanotte
    const ini = o ? (o.ini < 660 ? o.ini + 1440 : o.ini) : null;
    const fin = o ? ini + o.dur : null;
    // accoglienza (gruppo ACCOGLIENZA nella tabella Turni, es. S31): si organizzano da soli
    const info =
      typeof _pianoTurniReparto === 'function'
        ? _pianoTurniReparto().find((t) => String(t.codice).toUpperCase() === turno)
        : null;
    const acc = !!(info && String(info.gruppo || '').toUpperCase() === 'ACCOGLIENZA');
    out.push({
      nome: nome,
      turno: turno,
      ini: ini,
      fin: fin,
      attese: o ? _pePauseSplit(orari, turno, 'slots', dow) : [],
      acc: acc,
    });
  });
  return out;
}

// ---------- MAIN valet (port ModuloPauseValet v2) ----------
function _peGeneraValet(righe, dstr) {
  const dow = new Date(dstr + 'T12:00:00').getDay();
  const isWknd = dow === 5 || dow === 6;
  const regole = _peRegolePause();
  const rDist = regole.find((r) => r.tipo === 'distanza');
  const GAP_MIN = rDist ? parseInt(rDist.minuti) || 0 : 45;
  const WIN_MIN = 90;
  const rIns = regole.find((r) => r.tipo === 'insieme');
  const N_INSIEME = rIns ? parseInt(rIns.n) || 1 : 1;
  const norm = (m) => (m < 660 ? m + 1440 : m);
  // fasce senza pause valide oggi
  const fasce = regole
    .filter((r) => r.tipo === 'fascia' && (!r.giorni || !r.giorni.length || r.giorni.map(Number).includes(dow)))
    .map((r) => {
      const fs = norm(_peOraMin(r.da));
      let fe = norm(_peOraMin(r.a));
      if (fe <= fs) fe += 1440;
      return [fs, fe];
    });
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
    valet.push({ nome: nome.toUpperCase(), sigla: sigla, ini: o.ini, fin: o.fin, o: o });
  });
  if (!valet.length) return null;
  // elenco pause con ideale: composizione dalle regole (turno, poi durata)
  const pause = []; // {vi, dur, ideal, start, end}
  valet.forEach((v, vi) => {
    const dur = v.fin - v.ini;
    const orariLoc = orari[v.sigla] ? orari : Object.assign({}, orari, { [v.sigla]: v.o });
    const split = _pePauseSplit(orariLoc, v.sigla, null, dow);
    if (!split.length) return;
    const fr =
      { 1: [0.5], 2: [0.34, 0.67], 3: [0.22, 0.5, 0.78] }[split.length] ||
      split.map((_, k) => (k + 1) / (split.length + 1));
    const arr = split.map((d, k) => [d, fr[k]]);
    arr.forEach(([d, fr]) => {
      pause.push({ vi: vi, dur: d, ideal: Math.floor((v.ini + dur * fr) / 15) * 15, start: 0, end: 0 });
    });
  });
  const ord = pause.map((_, i) => i).sort((a, b) => pause[a].ideal - pause[b].ideal);
  const slotLibero = (s, e, selfIdx) => {
    let n = 0;
    for (let j = 0; j < pause.length; j++) {
      if (j !== selfIdx && pause[j].end > 0 && s < pause[j].end && e > pause[j].start) n++;
    }
    return n < N_INSIEME;
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
        for (let f = 0; f < fasce.length; f++) if (c < fasce[f][1] && c + L > fasce[f][0]) sc -= 100000;
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
      (regole.find((r) => r.tipo === 'nota') || {}).testo ||
      "NOTA: chi termina il turno prima del previsto (es. un X1 che esce alle 19.00) di norma NON fa l'ultima pausa da 15 min.",
  };
}

// ============================================================
// GENERAZIONE + RENDERING + EDITING (chiamati da piano.js)
// ============================================================
async function briefGeneraPause() {
  if (!puoGestireBriefing() || !_briefState) return;
  // XXX = posizione scoperta del fabbisogno: si vede sul foglio ma NON è un collaboratore
  const righe = (_briefState.righe || []).filter(
    (r) => r.nome && r.turno && String(r.nome).trim().toUpperCase() !== 'XXX',
  );
  if (!righe.length) {
    toast('Compila prima il briefing (nomi e turni)');
    return;
  }
  if (_briefState.pause && _briefState.pause.contenuto && _briefState.pause.contenuto.tipo) {
    if (!(await chiediConferma('Sovrascrivo le pause già generate per questa data?'))) return;
  }
  _briefRicorda();
  window._briefPauseAvviso = null;
  // slots = pattern manuali (dal tuo Excel); valet e ogni altro settore =
  // motore algoritmico (durate per fascia, gap, una-alla-volta)
  const contenuto = _pianoReparto() === 'slots' ? _peGeneraSlots(righe, _briefData) : _peGeneraValet(righe, _briefData);
  if (!contenuto) {
    toast('Nessun turno riconosciuto per generare le pause');
    return;
  }
  if (contenuto.tipo === 'slots') contenuto.legami = _pbCalcolaLegami(contenuto);
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
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _pbLegami(_briefState.pause.contenuto);
  _briefRicorda();
  window._briefPauseAvviso = null;
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
// ---------- pause e cambi: coerenza tra le colonne (slots) ----------
// Ogni colonna e un blocco: intestazione con la postazione (S3) e il nome, poi le
// righe postazione + orario. La PAUSA di S3 nella colonna di Sassi e la riga "S3"
// nella colonna di chi gli da il cambio devono avere lo stesso orario.
function _pbOra(min) {
  // stile Excel: la fascia 24:00-24:59 si scrive 24.xx
  let m = min;
  while (m >= 1500) m -= 1440;
  if (m >= 1440) return '24.' + String(m - 1440).padStart(2, '0');
  return _peMinToOra(m);
}
function _pbIntervallo(v) {
  const orario = String(v || '');
  if (!orario.includes(' - ')) return null;
  const p = orario.split(' - ');
  const ini = _peOraMin(p[0].trim());
  const fin = _peOraMin(p[1].trim());
  if (ini == null || fin == null) return null;
  const iniA = ini < 660 ? ini + 1440 : ini;
  let finA = fin < 660 ? fin + 1440 : fin;
  if (finA <= iniA) finA += 1440;
  return { ini: iniA, fin: finA };
}
function _pbBlocchi(c) {
  // stessa lettura del modulo dei controlli (con chi e la riga, proposte, colonnine personali)
  return window.PauseControlli ? window.PauseControlli.blocchi(c) : [];
}
// postazioni che hanno una colonna propria (una sola) e un cambio in un altra colonna
function _pbCoperture(blocchi) {
  const out = {};
  const conta = {};
  blocchi.forEach((b) => (conta[b.post] = (conta[b.post] || 0) + 1));
  blocchi.forEach((b) => {
    if (!b.post || b.post === 'PAUSA' || b.post === 'SALA' || conta[b.post] !== 1) return;
    const cambi = [];
    blocchi.forEach((o) => {
      if (o === b) return;
      o.righe.forEach((x) => {
        if (x.pos === b.post) cambi.push({ blk: o, riga: x });
      });
    });
    if (cambi.length) out[b.post] = { blk: b, pause: b.righe.filter((x) => x.pos === 'PAUSA'), cambi: cambi };
  });
  return out;
}
// Postazioni COLLEGATE: quelle in cui ogni pausa ha il suo cambio allo stesso orario
// e ogni cambio cade in una pausa (es. S3 e chi gli da il cambio). Si fissano quando
// il foglio nasce (o la prima volta che si apre) e restano nel foglio: solo per queste
// il programma sposta il cambio insieme alla pausa e avvisa se non coincidono.
// Le altre righe con la sigla di un collega (es. C8 a rotazione in cassa) non sono
// cambi-pausa e non vengono toccate.
function _pbCalcolaLegami(c) {
  const cop = _pbCoperture(_pbBlocchi(c));
  const stesso = (x, y) => x.ini === y.ini && x.fin === y.fin;
  return Object.keys(cop).filter((post) => {
    const { pause, cambi } = cop[post];
    return (
      pause.length &&
      pause.every((p) => cambi.some((k) => stesso(k.riga, p))) &&
      cambi.every((k) => pause.some((p) => stesso(k.riga, p)))
    );
  });
}
function _pbLegami(c) {
  if (!c || !c.celle) return [];
  if (!Array.isArray(c.legami)) c.legami = _pbCalcolaLegami(c);
  return c.legami;
}
// avvisi (non bloccano): pausa senza cambio, cambio senza pausa
function _pbControlla(c) {
  const avvisi = [];
  if (!c || !c.celle) return avvisi;
  const legami = _pbLegami(c);
  const tutte = _pbCoperture(_pbBlocchi(c));
  const cop = {};
  legami.forEach((k) => {
    if (tutte[k]) cop[k] = tutte[k];
  });
  const chi = (b) => (b.nome ? b.nome.split(' ')[0] : b.post);
  const ora = (x) => _pbOra(x.ini) + ' - ' + _pbOra(x.fin);
  Object.keys(cop).forEach((post) => {
    const { blk, pause, cambi } = cop[post];
    pause.forEach((p) => {
      if (!cambi.some((k) => k.riga.ini === p.ini && k.riga.fin === p.fin))
        avvisi.push({
          testo: chi(blk) + ' (' + post + ') e in pausa ' + ora(p) + ', ma nessuno copre ' + post + ' in quell orario',
          celle: [p.r + '|' + blk.base],
        });
    });
    cambi.forEach((k) => {
      if (!pause.some((p) => p.ini === k.riga.ini && p.fin === k.riga.fin))
        avvisi.push({
          testo:
            chi(k.blk) + ' copre ' + post + ' ' + ora(k.riga) + ', ma ' + chi(blk) + ' in quell orario non e in pausa',
          celle: [k.riga.r + '|' + k.blk.base],
        });
    });
  });
  return avvisi;
}
// scrive le righe di un blocco (dalla prima riga del blocco in giu); se servono
// piu righe sposta in basso le celle sottostanti della stessa colonna
function _pbScriviRighe(c, blk, segmenti) {
  const base = blk.base;
  const primo = blk.righe[0].r;
  const ultimo = blk.righe[blk.righe.length - 1].r;
  const vecchie = ultimo - primo + 1;
  const delta = segmenti.length - vecchie;
  if (delta > 0) {
    for (let rr = c.nR; rr > ultimo; rr--) {
      [base, base + 1].forEach((col) => {
        const k = rr + '|' + col;
        if (c.celle[k]) {
          c.celle[rr + delta + '|' + col] = c.celle[k];
          delete c.celle[k];
        }
      });
    }
    c.nR += delta;
  }
  for (let rr = primo; rr <= ultimo; rr++) {
    delete c.celle[rr + '|' + base];
    delete c.celle[rr + '|' + (base + 1)];
  }
  segmenti.forEach((sg, i) => {
    const clr = sg.warn ? _PE_CLR.rosso : _peColoreSettore(sg.pos);
    const a = { v: sg.pos, b: 1, bg: clr, sz: 9 };
    const b = { v: _pbOra(sg.ini) + ' - ' + _pbOra(sg.fin) + (sg.warn ? '  [!]' : ''), b: 1, bg: clr, sz: 9 };
    if (sg.per) a.per = sg.per;
    if (sg.warn) {
      a.fg = '#fff';
      b.fg = '#fff';
    }
    c.celle[primo + i + '|' + base] = a;
    c.celle[primo + i + '|' + (base + 1)] = b;
  });
}
// chi da il cambio: la riga della postazione va al nuovo orario, dove c era la
// copertura torna SALA e le sale vicine si uniscono. Serve che nel nuovo orario
// chi copre sia in SALA; altrimenti non tocca nulla e restituisce il motivo.
function _pbSpostaCambio(c, blk, riga, nuovo) {
  const warn = (c.celle[riga.r + '|' + blk.base] || {}).bg === _PE_CLR.rosso;
  const seg = blk.righe.map((x) => ({
    pos: x === riga ? 'SALA' : x.pos,
    ini: x.ini,
    fin: x.fin,
    warn: x !== riga && (c.celle[x.r + '|' + blk.base] || {}).bg === _PE_CLR.rosso,
    per: x === riga ? '' : x.per,
  }));
  const libero = seg.filter((x) => x.pos === 'SALA' && x.fin > nuovo.ini && x.ini < nuovo.fin);
  let copre = 0;
  libero.forEach((x) => (copre += Math.min(x.fin, nuovo.fin) - Math.max(x.ini, nuovo.ini)));
  if (copre !== nuovo.fin - nuovo.ini) return 'alle ' + _pbOra(nuovo.ini) + ' non e in sala';
  const out = [];
  seg.forEach((x) => {
    if (x.pos !== 'SALA' || x.fin <= nuovo.ini || x.ini >= nuovo.fin) return out.push(x);
    if (x.ini < nuovo.ini) out.push({ pos: 'SALA', ini: x.ini, fin: nuovo.ini });
    if (x.ini <= nuovo.ini) out.push({ pos: riga.pos, ini: nuovo.ini, fin: nuovo.fin, warn: warn, per: riga.per });
    if (x.fin > nuovo.fin) out.push({ pos: 'SALA', ini: nuovo.fin, fin: x.fin });
  });
  const uniti = [];
  out.forEach((x) => {
    const u = uniti[uniti.length - 1];
    if (u && u.pos === 'SALA' && x.pos === 'SALA' && u.fin === x.ini && !u.warn && !x.warn) u.fin = x.fin;
    else uniti.push(Object.assign({}, x));
  });
  _pbScriviRighe(c, blk, uniti);
  return '';
}
// scambio di due righe adiacenti della stessa colonna RICALCOLANDO gli orari:
// l inizio resta quello della prima, le durate seguono le postazioni
// (es. R24 22.15-22.45 + PAUSA 22.45-23.00 -> PAUSA 22.15-22.30 + R24 22.30-23.00).
// Restituisce la riga dove e finita la riga r, oppure 0 se non si puo.
function _pbScambia(c, base, r, dir) {
  const dati = (rr) => {
    const a = c.celle[rr + '|' + base];
    const b = c.celle[rr + '|' + (base + 1)];
    if (!a || !b || a.hdr || a.span || b.hdr) return null;
    const iv = _pbIntervallo(b.v);
    if (!iv) return null;
    return { a: a, b: b, ini: iv.ini, fin: iv.fin, dur: iv.fin - iv.ini };
  };
  // trova la riga adiacente (salta le righe vuote della stessa coppia)
  let r2 = r + dir;
  let d2 = null;
  while (r2 >= 4 && r2 <= c.nR + 1) {
    d2 = dati(r2);
    if (d2 || c.celle[r2 + '|' + base] || c.celle[r2 + '|' + (base + 1)]) break;
    r2 += dir;
  }
  const d1 = dati(r);
  if (!d1 || !d2) return 0;
  const prima = dir < 0 ? d2 : d1;
  const seconda = dir < 0 ? d1 : d2;
  // le POSTAZIONI si scambiano (e l eventuale avviso rosso [!] le segue),
  // gli orari si ricalcolano in sequenza dall inizio della prima riga
  const inizio = prima.ini;
  const warnPrima = prima.a.bg === _PE_CLR.rosso;
  const warnSeconda = seconda.a.bg === _PE_CLR.rosso;
  // per chi e la riga e se e una proposta seguono la postazione
  const extra = (x) => ({ per: x.a.per, prop: x.a.prop });
  const exPrima = extra(prima);
  const exSeconda = extra(seconda);
  const durPrima = seconda.dur;
  const nuovi = [
    { d: prima, pos: seconda.a.v, warn: warnSeconda, ex: exSeconda, ini: inizio, fin: inizio + durPrima },
    {
      d: seconda,
      pos: prima.a.v,
      warn: warnPrima,
      ex: exPrima,
      ini: inizio + durPrima,
      fin: inizio + durPrima + prima.dur,
    },
  ];
  nuovi.forEach((x) => {
    x.d.a.v = x.pos;
    ['per', 'prop'].forEach((k) => {
      if (x.ex[k]) x.d.a[k] = x.ex[k];
      else delete x.d.a[k];
      if (k === 'prop') {
        if (x.ex.prop) x.d.b.prop = 1;
        else delete x.d.b.prop;
      }
    });
    const clr = x.warn ? _PE_CLR.rosso : _peColoreSettore(x.pos);
    x.d.a.bg = clr;
    x.d.b.v = _pbOra(x.ini) + ' - ' + _pbOra(x.fin) + (x.warn ? '  [!]' : '');
    x.d.b.bg = clr;
    if (x.warn) {
      x.d.a.fg = '#fff';
      x.d.b.fg = '#fff';
    } else {
      delete x.d.a.fg;
      delete x.d.b.fg;
    }
  });
  return r2;
}
// chi va in pausa: la PAUSA si sposta con UNO scambio con la riga vicina (come con
// le frecce). Se ne servono di piu non si tocca nulla: scorrerebbero altre righe della
// colonna, cioe i cambi dati ad altri colleghi, senza che l operatore lo veda.
function _pbSpostaPausa(c, blk, riga, nuovo) {
  const copia = JSON.stringify(c.celle);
  let r = riga.r;
  let ini = riga.ini;
  for (let i = 0; i < 1 && ini !== nuovo.ini; i++) {
    const dir = nuovo.ini < ini ? -1 : 1;
    const r2 = _pbScambia(c, blk.base, r, dir);
    if (!r2) break;
    r = r2;
    const iv = _pbIntervallo((c.celle[r + '|' + (blk.base + 1)] || {}).v);
    if (!iv) break;
    // oltrepassato: il nuovo orario non cade all inizio di una riga
    if ((dir < 0 && iv.ini < nuovo.ini) || (dir > 0 && iv.ini > nuovo.ini)) break;
    ini = iv.ini;
  }
  if (ini !== nuovo.ini) {
    c.celle = JSON.parse(copia);
    return 'spostala a mano con le frecce nella sua colonna (alle ' + _pbOra(nuovo.ini) + ')';
  }
  return '';
}
// dopo uno scambio: se si e spostata una PAUSA, si sposta anche il cambio di chi la
// copre; se si e spostato un cambio, si sposta la PAUSA di chi e coperto
function _pbSincronizza(c, prima, base) {
  const dopo = _pbBlocchi(c);
  const legami = _pbLegami(c);
  const tutte = _pbCoperture(prima);
  const cop = {};
  legami.forEach((k) => {
    if (tutte[k]) cop[k] = tutte[k];
  });
  const msg = [];
  const bPrima = prima.filter((b) => b.base === base);
  const bDopo = dopo.filter((b) => b.base === base);
  bPrima.forEach((bp, i) => {
    const bd = bDopo[i];
    if (!bd) return;
    const chiave = (x) => x.pos + '@' + x.ini + '-' + x.fin;
    const prese = new Set(bd.righe.map(chiave));
    const vecchie = bp.righe.filter((x) => !prese.has(chiave(x)));
    vecchie.forEach((v) => {
      const n = bd.righe.find((x) => x.pos === v.pos && !bp.righe.some((y) => chiave(y) === chiave(x)));
      if (!n) return;
      const nuovo = { ini: n.ini, fin: n.fin };
      const chi = (b) => (b.nome ? b.nome.split(' ')[0] : b.post);
      if (v.pos === 'PAUSA' && cop[bp.post]) {
        const k = cop[bp.post].cambi.find((x) => x.riga.ini === v.ini && x.riga.fin === v.fin);
        if (!k) return;
        const blk = _pbBlocchi(c).find((b) => b.base === k.blk.base && b.r === k.blk.r);
        const riga = blk && blk.righe.find((x) => x.pos === bp.post && x.ini === v.ini && x.fin === v.fin);
        if (!riga) return;
        const err = _pbSpostaCambio(c, blk, riga, nuovo);
        msg.push(
          err
            ? 'Cambio di ' + chi(blk) + ' non spostato: ' + err
            : 'Spostato anche il cambio di ' + chi(blk) + ': ' + bp.post + ' ' + _pbOra(n.ini) + '-' + _pbOra(n.fin),
        );
      } else if (cop[v.pos] && cop[v.pos].blk.base !== base) {
        const pb = cop[v.pos].blk;
        const blk = _pbBlocchi(c).find((b) => b.base === pb.base && b.r === pb.r);
        const riga = blk && blk.righe.find((x) => x.pos === 'PAUSA' && x.ini === v.ini && x.fin === v.fin);
        if (!riga) return;
        // prima dentro le sue righe libere (SALA...), di quanto serve; se non si puo,
        // con uno scambio con la riga vicina come con le frecce
        const errLibero = _pbSpostaCambio(c, blk, riga, nuovo);
        const err = errLibero ? _pbSpostaPausa(c, blk, riga, nuovo) : '';
        msg.push(
          err
            ? 'Pausa di ' + chi(blk) + ' non spostata: ' + err
            : 'Spostata anche la pausa di ' + chi(blk) + ': ' + _pbOra(n.ini) + '-' + _pbOra(n.fin),
        );
      }
    });
  });
  return msg;
}
// frecce: scambia la riga con quella adiacente e tiene allineati pausa e cambio
// FRECCE VICINO A UNA RIGA LIBERA. Se la riga vicina e SALA, REC o CASSA (tempo
// libero di chi da i cambi) la riga (un cambio o una pausa) non salta oltre tutta
// la riga libera: si sposta di un quarto d ora alla volta, fermandosi nel primo
// orario in cui la sala resta coperta da qualcun altro (es. S3 in sala). Se in
// quel quarto d ora nessun altro e in sala, passa direttamente al primo in cui
// c e (es. S7 01.45 in su con S3 in cassa alle 01.30 e in sala fino alle 01.15
// -> S7 01.00-01.15). Restituisce null se non si applica, 'fatto', o il motivo.
function _pbSpostaQuarto(c, base, r, dir) {
  const PC = window.PauseControlli;
  if (!PC || !_briefState) return null;
  const blk = PC.blocchi(c).find((b) => b.base === base && b.righe.some((x) => x.r === r));
  if (!blk) return null;
  const k = blk.righe.findIndex((x) => x.r === r);
  const x = blk.righe[k];
  const v = blk.righe[k + dir];
  if (!x || !v || _PC_LIBERE.includes(x.pos) || !_PC_LIBERE.includes(v.pos)) return null;
  const d = x.fin - x.ini;
  // chi non conta: chi da il cambio (questa colonna) e chi riceve il cambio
  const persone = _pcPersone(_briefState.righe, _briefData);
  const pp = PC.pausePersone(c, persone, _pcBigliettiFoglio(c));
  const bl = PC.blocchi(c);
  const esclusi = new Set([String(blk.nome).toUpperCase()]);
  persone.forEach((p) => {
    if (x.per ? p.nome.toUpperCase() === String(x.per).toUpperCase() : p.turno === x.pos)
      esclusi.add(p.nome.toUpperCase());
  });
  const altri = persone.filter((p) => !esclusi.has(p.nome.toUpperCase()));
  // in ogni quarto d ora: se ci sono altri di sala in turno, almeno uno e in sala
  const salaCoperta = (t1, t2) => {
    for (let t = t1; t < t2; t += 15) {
      const inTurno = altri.filter((p) => /^S/.test(p.turno) && !p.acc && p.ini != null && p.ini <= t && t < p.fin);
      if (inTurno.length && !altri.some((p) => PC.reparto(p, pp[p.nome], bl, t) === 'S')) return false;
    }
    return true;
  };
  // orari possibili dentro la riga libera, un quarto d ora alla volta
  let nuovo = null;
  for (let passo = 1; ; passo++) {
    const t = x.ini + dir * 15 * passo;
    if (dir < 0 && t < v.ini) break;
    if (dir > 0 && t + d > v.fin) break;
    if (salaCoperta(t, t + d)) {
      nuovo = t;
      break;
    }
  }
  if (nuovo == null) return 'Nessun orario vicino con la sala coperta da un collega: la riga resta dove e';
  // si riscrive la colonna: la riga libera si divide intorno alla nuova posizione
  const warn = (rr) => (c.celle[rr + '|' + base] || {}).bg === _PE_CLR.rosso;
  const seg = [];
  blk.righe.forEach((y) => {
    if (y === x) return;
    if (y === v) {
      const libero = { pos: v.pos, per: '' };
      const pezzi = [];
      if (dir < 0) {
        if (nuovo > v.ini) pezzi.push(Object.assign({ ini: v.ini, fin: nuovo }, libero));
        pezzi.push({ pos: x.pos, ini: nuovo, fin: nuovo + d, per: x.per, warn: warn(x.r) });
        pezzi.push(Object.assign({ ini: nuovo + d, fin: x.fin }, libero));
      } else {
        pezzi.push(Object.assign({ ini: x.ini, fin: nuovo }, libero));
        pezzi.push({ pos: x.pos, ini: nuovo, fin: nuovo + d, per: x.per, warn: warn(x.r) });
        if (nuovo + d < v.fin) pezzi.push(Object.assign({ ini: nuovo + d, fin: v.fin }, libero));
      }
      pezzi.forEach((p) => seg.push(p));
      return;
    }
    seg.push({ pos: y.pos, ini: y.ini, fin: y.fin, per: y.per, warn: warn(y.r) });
  });
  // righe libere uguali e attaccate diventano una sola
  const uniti = [];
  seg
    .sort((a, b) => a.ini - b.ini)
    .forEach((y) => {
      const u = uniti[uniti.length - 1];
      if (u && _PC_LIBERE.includes(y.pos) && u.pos === y.pos && u.fin === y.ini && !u.warn && !y.warn) u.fin = y.fin;
      else uniti.push(Object.assign({}, y));
    });
  _pbScriviRighe(c, blk, uniti);
  return 'fatto';
}
function briefPausaSposta(base, r, dir) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  _pbLegami(c);
  _briefRicorda();
  const prima = _pbBlocchi(c);
  // vicino a una riga libera (SALA, REC, CASSA) la riga si sposta di un quarto d ora
  // alla volta, nel primo orario in cui la sala resta coperta; altrimenti scambio
  const copia = JSON.stringify({ celle: c.celle, nR: c.nR });
  let quarto = c.tipo === 'slots' ? _pbSpostaQuarto(c, base, r, dir) : null;
  let msg = null;
  if (quarto === 'fatto') {
    msg = _pbSincronizza(c, prima, base);
    // la pausa collegata non riesce a seguire il quarto d ora: si torna indietro e si
    // fa lo scambio intero (con cui la pausa collegata segue)
    if (msg.some((x) => /non spostat/.test(x))) {
      const o = JSON.parse(copia);
      c.celle = o.celle;
      c.nR = o.nR;
      quarto = null;
      msg = null;
    }
  }
  if (quarto && quarto !== 'fatto') {
    _briefDimentica();
    toast(quarto);
    return;
  }
  if (!quarto && !_pbScambia(c, base, r, dir)) {
    _briefDimentica();
    toast('Questa riga non si può scambiare (serve una riga di copertura adiacente)');
    return;
  }
  if (!msg) msg = _pbSincronizza(c, prima, base);
  window._briefPauseAvviso = msg.length ? msg.join(' · ') : null;
  if (msg.length) toast(msg.join(' · '), 5000);
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
// elimina un intera colonna del foglio pause (intestazione, orario e righe fino
// alla colonna successiva nella stessa pila); si annulla con Annulla del briefing
async function briefPausaEliminaColonna(base, r) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  const hdr = c.celle[r + '|' + base];
  const nome = c.celle[r + '|' + (base + 1)];
  if (!hdr || !hdr.hdr) return;
  let fine = c.nR;
  for (let rr = r + 1; rr <= c.nR; rr++) {
    const a = c.celle[rr + '|' + base];
    if (a && a.hdr) {
      fine = rr - 1;
      break;
    }
  }
  const chi = String(hdr.v || '') + (nome && nome.v ? ' ' + nome.v : '');
  if (
    !(await chiediConferma('Elimino la colonna ' + chi + ' con tutte le sue righe?\n\nSi puo annullare con Annulla.'))
  )
    return;
  _briefRicorda();
  for (let rr = r; rr <= fine; rr++) {
    delete c.celle[rr + '|' + base];
    delete c.celle[rr + '|' + (base + 1)];
  }
  // le proposte di quella persona (pause da solo o senza cambio) non valgono piu
  if (Array.isArray(c.proposte) && nome && nome.v) {
    const n = String(nome.v).trim().toUpperCase();
    c.proposte = c.proposte.filter((x) => !(String(x.nome).trim().toUpperCase() === n && x.modo !== 'cambio'));
  }
  window._briefPauseAvviso = null;
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
  logAzione('Pause: colonna eliminata', chi + ' ' + _briefData);
  toast('Colonna ' + chi + ' eliminata (Annulla per rimetterla)');
}
function briefPausaDelRiga(base, r) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _pbLegami(_briefState.pause.contenuto);
  _briefRicorda();
  window._briefPauseAvviso = null;
  const c = _briefState.pause.contenuto;
  delete c.celle[r + '|' + base];
  delete c.celle[r + '|' + (base + 1)];
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
// modifica cella pause slots (r|c del foglio virtuale)
function briefPausaCellaSlots(r, c, val) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _pbLegami(_briefState.pause.contenuto);
  _briefRicorda();
  window._briefPauseAvviso = null;
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
        delete ora.prop;
        ora.v = String(ora.v).replace(/\s*\[!\]\s*$/, '');
      }
    } else {
      nuovo.bg = prev.bg;
      nuovo.fg = prev.fg;
      // orario scritto a mano: la riga non e piu una proposta; resta per chi e
      const pos = g[r + '|' + (c - 1)];
      if (pos) delete pos.prop;
      if (prev.per) nuovo.per = prev.per;
    }
    g[k] = nuovo;
  }
  _briefSalvaPauseDebounce();
  _briefRefreshPause(); // avvisi pausa/cambio aggiornati
}
// modifica pause valet (riga i, pausa k o campo)
function briefPausaCellaValet(i, campo, val) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _briefRicorda('valet|' + i + '|' + campo);
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
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _briefRicorda();
  _briefState.pause.contenuto.righe.push({ turno: '', nome: '', orario: '', pause: [] });
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
function briefValetDelRiga(i) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _briefRicorda();
  _briefState.pause.contenuto.righe.splice(i, 1);
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
async function briefEliminaPause() {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause || !_briefState.pause.id) return;
  if (!(await chiediConferma('Elimino le pause di questa data?'))) return;
  _briefRicorda();
  window._briefPauseAvviso = null;
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
  const puo = puoGestireBriefing();
  let h = '';
  // righe dove pausa e cambio non coincidono: bordo rosso
  const errate = new Set();
  _pcAvvisiFoglio(c).forEach((x) => (x.celle || []).forEach((k) => errate.add(k)));
  const tit = c.celle['1|1'];
  const dataC = c.celle['2|1'];
  const sotto = c.celle['3|1'];
  h += '<div style="max-width:580px">';
  if (tit)
    h +=
      '<div style="border:1px solid #999;background:' +
      (tit.bg || '#FFFF00') +
      ';color:#14100a;font-weight:bold;text-align:center;padding:4px;font-size:var(--fs-base,.9375rem)">' +
      escP(tit.v) +
      '</div>';
  if (dataC)
    h += '<div style="font-weight:bold;font-size:var(--fs-sm,.8125rem);padding:2px 0">' + escP(dataC.v) + '</div>';
  if (sotto)
    h +=
      '<div style="border:1px solid #999;background:' +
      (sotto.bg || '#FFFF00') +
      ';color:#14100a;font-weight:bold;text-align:center;padding:3px;font-size:var(--fs-md,.875rem)">' +
      escP(sotto.v) +
      '</div>';
  h += '</div>';
  // 3 pile compatte affiancate: le righe vuote spariscono, resta solo un
  // piccolo stacco prima di ogni nuovo blocco (header turno)
  h += '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-top:10px">';
  // colonne facoltative (accoglienza, secondo S5...): non nel foglio principale ma
  // sotto, nella sezione Facoltative, con la loro casella per la stampa e il bigliettino
  const PCx = window.PauseControlli;
  const facoltative = PCx ? PCx.blocchi(c).filter((b) => b.opz) : [];
  const righeFac = new Set();
  facoltative.forEach((b) => {
    let fine = c.nR;
    for (let rr = b.r + 1; rr <= c.nR; rr++) {
      const x = c.celle[rr + '|' + b.base];
      if (x && x.hdr) {
        fine = rr - 1;
        break;
      }
    }
    for (let rr = b.r; rr <= fine; rr++) righeFac.add(rr + '|' + b.base);
  });
  // senzaTesta: nelle schede facoltative nome e orario stanno nella striscia in alto
  const disegna = (base, righeTutte, senzaTesta) => {
    const righe = senzaTesta
      ? righeTutte.filter((x, k) => !(k <= 1 && ((x.a && x.a.hdr) || (x.b && (x.b.hdr || x.b.ora)))))
      : righeTutte;
    let t =
      '<table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem);table-layout:fixed"><colgroup><col style="width:46px"><col style="width:88px"></colgroup>';
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
          (errate.has(riga.r + '|' + base)
            ? 'box-shadow:inset 0 0 0 2px var(--c-rosso,#c0392b);'
            : riga.a && riga.a.prop
              ? 'box-shadow:inset 0 0 0 2px var(--c-azzurro,#1f6fa3);'
              : '') +
          'border:1px solid #999;background:' +
          (cell.bg || 'transparent') +
          ';color:' +
          // fondo sempre chiaro (pastello o giallo): testo scuro anche nel tema scuro
          (cell.fg || (cell.bg ? '#14100a' : 'inherit')) +
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
            'padding:2px 4px;font-size:var(--fs-sm,.8125rem)"></td>';
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
      if (puo && isHdr)
        // intestazione della colonna: + aggiunge una riga sotto l orario, x elimina tutta la colonna
        t +=
          '<td style="border:none;padding:0 3px;white-space:nowrap">' +
          '<span style="cursor:pointer;color:var(--c-verde,#2c6e49);font-weight:bold" title="Inserisci riga sotto" onclick="briefPausaInsRiga(' +
          base +
          ',' +
          (riga.r + 1) +
          ')">+</span> ' +
          '<span style="cursor:pointer;color:var(--c-rosso,#c0392b);font-weight:bold" title="Elimina tutta la colonna" aria-label="Elimina tutta la colonna" onclick="briefPausaEliminaColonna(' +
          base +
          ',' +
          riga.r +
          ')">×</span></td>';
      else if (puo)
        t +=
          '<td style="border:none;padding:0 3px;white-space:nowrap">' +
          '<span style="cursor:pointer;color:var(--c-verde,#2c6e49);font-weight:bold" title="Inserisci riga sotto" onclick="briefPausaInsRiga(' +
          base +
          ',' +
          riga.r +
          ')">+</span> ' +
          '<span style="cursor:pointer;color:var(--muted)" title="Scambia con la riga sopra (orari ricalcolati)" onclick="briefPausaSposta(' +
          base +
          ',' +
          riga.r +
          ',-1)">▲</span> ' +
          '<span style="cursor:pointer;color:var(--muted)" title="Scambia con la riga sotto (orari ricalcolati)" onclick="briefPausaSposta(' +
          base +
          ',' +
          riga.r +
          ',1)">▼</span> ' +
          '<span style="cursor:pointer;color:var(--c-rosso,#c0392b);font-weight:bold" title="Elimina riga" onclick="briefPausaDelRiga(' +
          base +
          ',' +
          riga.r +
          ')">×</span></td>';
      t += '</tr>';
    });
    t += '</table>';
    let out = '<div>' + t;
    if (puo)
      out +=
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 8px;margin-top:4px" onclick="briefPausaInsRiga(' +
        base +
        ',' +
        (righe.length ? righe[righe.length - 1].r : 6) +
        ')">+ riga</button>';
    return out + '</div>';
  };
  const righeDi = (base, dentro) => {
    const righe = [];
    for (let r = 4; r <= c.nR; r++) {
      if (!dentro(r + '|' + base)) continue;
      const a = c.celle[r + '|' + base];
      const b = c.celle[r + '|' + (base + 1)];
      if ((a && (String(a.v).trim() !== '' || a.ins)) || (b && (String(b.v).trim() !== '' || b.ins)))
        righe.push({ r: r, a: a, b: b });
    }
    return righe;
  };
  [1, 4, 7].forEach((base) => {
    const righe = righeDi(base, (k) => !righeFac.has(k));
    if (righe.length) h += disegna(base, righe);
  });
  h += '</div>';
  if (facoltative.length || (c.biglietti || []).length) {
    const scelte = c.stampaOpz || {};
    h +=
      '<div class="pb-facoltative" style="margin-top:18px;padding-top:12px;border-top:1px dashed var(--line,#bbb)"><div style="font-weight:bold;font-size:var(--fs-md,.875rem)">Facoltative <span style="font-weight:normal;color:var(--muted)">(non nel foglio stampato, a meno di spuntarle; si possono stampare a parte)</span></div><div style="display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;margin-top:10px">';
    facoltative.forEach((b) => {
      const righe = righeDi(b.base, (k) => righeFac.has(k) && Number(k.split('|')[0]) >= b.r).filter(
        (x) => x.r < (facoltative.find((o) => o.base === b.base && o.r > b.r) || { r: Infinity }).r,
      );
      const etichetta = String(b.opz || '');
      const orario = (c.celle[b.r + 1 + '|' + (b.base + 1)] || {}).v || '';
      h += _pcFacScheda(
        etichetta.charAt(0).toUpperCase() +
          etichetta.slice(1) +
          ' · ' +
          b.post +
          ' ' +
          b.nome +
          (orario ? ' · ' + orario : ''),
        _peColoreSettore(b.post) || '#e8e8e8',
        disegna(b.base, righe, true),
        b.nome,
        'pdfBigliettoColonna(' + b.base + ',' + b.r + ')',
        scelte[b.nome],
        puo ? 'briefPausaEliminaColonna(' + b.base + ',' + b.r + ')' : '',
      );
    });
    // bigliettino del mattino (C4) con le altre facoltative
    h += _pcBigliettoHtml(c) + '</div></div>';
  }
  if (puo)
    h +=
      '<div style="margin-top:16px"><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;border-color:var(--c-rosso,#c0392b);color:var(--c-rosso,#c0392b)" onclick="briefEliminaPause()">Elimina pause</button></div>';
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
    '<table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem);margin-top:12px"><tr><td colspan="4" style="border:1px solid #999;background:#FFFF00;font-weight:bold;padding:3px 8px">ORDINE PAUSE (una alla volta)</td></tr>';
  h +=
    '<tr>' +
    ['ORARIO', 'NOME', 'TURNO', 'DURATA']
      .map(
        (x) =>
          '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:var(--fs-sm,.8125rem)">' +
          x +
          '</th>',
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
      '<p style="color:var(--c-rosso,#c0392b);font-weight:bold;font-size:var(--fs-sm,.8125rem);margin-top:6px">Attenzione: ' +
      sovrapposte +
      ' sovrapposizioni (righe rosse)</p>';
  return h;
}
function _briefRenderPauseValet(c) {
  const puo = puoGestireBriefing();
  let h =
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem)"><tr><td colspan="6" style="border:1px solid #999;background:#FFFF00;font-weight:bold;text-align:center;padding:4px">PAUSE VALET · ' +
    escP(c.tipoGiorno || '') +
    '</td></tr><tr>' +
    ['TURNO', 'NOME', 'ORARIO', 'PAUSA 1', 'PAUSA 2', 'PAUSA 3']
      .map(
        (x) =>
          '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:var(--fs-sm,.8125rem)">' +
          x +
          '</th>',
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
          'padding:2px 6px;font-size:var(--fs-sm,.8125rem)"></td>'
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
          '\',this.value)" style="width:86px;border:none;background:transparent;font:inherit;text-align:center;padding:2px 4px;font-size:var(--fs-sm,.8125rem)"></td>';
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
        '<td style="border:none;padding:0 4px"><span style="cursor:pointer;color:var(--c-rosso,#c0392b);font-weight:bold" title="Elimina riga" onclick="briefValetDelRiga(' +
        i +
        ')">×</span></td>';
    h += '</tr>';
  });
  h += '</table></div>';
  if (puo)
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 8px;margin-top:4px" onclick="briefValetAddRiga()">+ Aggiungi riga</button>';
  h += '<div id="brief-crono">' + _briefRenderCronoValet(c) + '</div>';
  if (c.nota)
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);font-style:italic;background:#FFFFCC;color:#14100a;border:1px solid #999;padding:6px 10px;margin-top:10px;max-width:560px">' +
      escP(c.nota) +
      '</p>';
  if (puo)
    h +=
      '<div style="margin-top:8px"><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;border-color:var(--c-rosso,#c0392b);color:var(--c-rosso,#c0392b)" onclick="briefEliminaPause()">Elimina pause</button></div>';
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
  const valet = _briefIsValet();
  // sempre in verticale (deciso dal titolare): le colonne si allargano quanto il testo
  // e il carattere si adatta perche ci stia tutto in un foglio
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const PW = 210;
  const PH = 297;
  const dstr = _briefData;
  const lbl = _briefGiornoLbl(dstr) + ' ' + dstr.split('-').reverse().join('.');
  doc.setFillColor(255, 255, 0);
  doc.rect(10, 10, PW - 20, 10, 'F');
  doc.setDrawColor(120);
  doc.rect(10, 10, PW - 20, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text('BRIEFING ' + repartoNomeDocumento(_pianoReparto()).toUpperCase() + ' · ' + lbl, PW / 2, 17, {
    align: 'center',
  });
  const generico = !valet && _pianoReparto() !== 'slots';
  const cols = valet
    ? ['E', 'U', 'COLLABORATORE', 'TURNO', 'USCITA', 'FIRMA', 'RADIO', 'BADGE']
    : generico
      ? ['E', 'U', 'COLLABORATORE', 'T', 'USCITA', 'FIRMA']
      : ['E', 'U', 'HOST', 'T', 'CD', 'USCITA', 'FIRMA'];
  const body = [];
  const righeFm = {}; // indice riga body -> in formazione (nome giallo sul PDF)
  const righeFmt = {}; // indice riga body -> formato dell'intera riga {b,i}
  const righeCs = {}; // indice riga body -> stili per singola cella (r.cs)
  // colonna PDF -> campo della riga briefing (per gli stili per cella)
  const campiCol = valet
    ? [null, null, 'nome', 'turno', 'uscita', 'firma', 'radio', 'badge']
    : generico
      ? [null, null, 'nome', 'turno', 'uscita', 'firma']
      : [null, null, 'nome', 'turno', 'cd', 'uscita', 'firma'];
  let gPrec = null;
  (_briefState.righe || []).forEach((r) => {
    if (!r.nome && !r.turno) return;
    const g = _briefGruppo(r.turno);
    if (gPrec !== null && g !== gPrec)
      body.push([{ content: '', colSpan: cols.length, styles: { minCellHeight: 3.5 } }]);
    gPrec = g;
    const nomePdf = (r.nome || '') + (r.fm ? ' (formazione)' : '');
    if (r.col || r.fm) righeFm[body.length] = r.col || '#FFFF00';
    if (r.bold || r.ital || r.colT) righeFmt[body.length] = { b: !!r.bold, i: !!r.ital, t: r.colT || '' };
    if (r.cs) righeCs[body.length] = r.cs;
    body.push(
      valet
        ? ['', '', nomePdf, r.turno || '', r.uscita || '', r.firma || '', r.radio || '', r.badge || '']
        : generico
          ? ['', '', nomePdf, r.turno || '', r.uscita || '', r.firma || '']
          : ['', '', nomePdf, r.turno || '', r.cd || '', r.uscita || '', r.firma || ''],
    );
  });
  // sempre in UN SOLO foglio, con il carattere piu grande che ci sta (fino a 12)
  // e colonne larghe quanto il testo piu lungo (cognomi lunghi, radio, badge)
  const nRighe = body.length || 1;
  const largMax = valet ? PW - 20 : 142; // Slots/altri: a destra c e il riquadro ORARI
  const altDisp = PH - 26 - 12;
  const misura = (f) => {
    doc.setFontSize(f);
    const pad = Math.max(1, f * 0.17);
    const larg = cols.map((h, c) => {
      doc.setFont('helvetica', 'bold');
      let w = doc.getTextWidth(String(h));
      body.forEach((riga) => {
        if (riga.length !== cols.length) return;
        doc.setFont('helvetica', c === 2 || c === 3 || (c === 4 && !valet && !generico) ? 'bold' : 'normal');
        w = Math.max(w, doc.getTextWidth(String(riga[c] == null ? '' : riga[c])));
      });
      return w + 2 * pad + 1.5;
    });
    const minimi = cols.map((h) => (h === 'E' || h === 'U' ? 9 : h === 'FIRMA' ? 30 : h === 'USCITA' ? 18 : 12));
    const w = larg.map((x, c) => Math.max(x, minimi[c]));
    const rowH = f * 0.3528 * 1.25 + 2 * pad;
    return { f, pad, w, rowH, somma: w.reduce((a, b) => a + b, 0), naturale: w[2] };
  };
  // il nome si allarga quanto serve; se non ci sta nella larghezza del foglio va a
  // capo su due righe (la riga si alza) invece di rimpicciolire tutto il testo
  const adatta = (x, larghMax) => {
    const altre = x.somma - x.w[2];
    const spazio = larghMax - altre;
    if (spazio < 30) return null;
    let doppie = 0;
    if (x.w[2] > spazio) {
      doc.setFontSize(x.f);
      doc.setFont('helvetica', 'bold');
      body.forEach((riga) => {
        if (riga.length === cols.length && doc.getTextWidth(String(riga[2] || '')) + 2 * x.pad + 1.5 > spazio) doppie++;
      });
      x.w[2] = spazio;
      x.somma = altre + spazio;
    }
    x.doppie = doppie;
    return x;
  };
  // Slots e altri: ORARI accanto (tabella fino a 142 mm) oppure sotto (tabella fino a
  // 190 mm, se i nomi lunghi chiedono spazio): si sceglie la disposizione con il
  // carattere piu grande che ci sta
  const nOrari = valet
    ? 0
    : _pianoTurniReparto().filter((t) =>
        (_briefState.righe || []).some(
          (r) =>
            String(r.turno || '')
              .trim()
              .toUpperCase() === String(t.codice).toUpperCase(),
        ),
      ).length;
  const cerca = (larghMax, altMax) => {
    // prima una misura grande (almeno 9) senza nomi a capo; se non c e, il nome
    // lungo va a capo e il resto del foglio resta grande
    for (const aCapo of [false, true]) {
      for (let f = 12; f >= (aCapo ? 6.5 : 9); f -= 0.5) {
        const x = adatta(misura(f), larghMax);
        if (!x || (!aCapo && x.doppie)) continue;
        if (x.somma <= larghMax && (nRighe + x.doppie) * x.rowH + 8 <= altMax) return x;
      }
    }
    return null;
  };
  let m = cerca(largMax, altDisp);
  let orariSotto = false;
  if (!valet) {
    // altezza del riquadro ORARI: righe da circa 6 mm, stacchi fra i gruppi, intestazione
    const sotto = cerca(PW - 20, altDisp - (nOrari * 6.3 + 30));
    if (sotto && (!m || sotto.f > m.f)) {
      m = sotto;
      orariSotto = true;
    }
  }
  if (!m) m = misura(6.5);
  const largUso = valet || orariSotto ? PW - 20 : largMax;
  // lo spazio che avanza va soprattutto a FIRMA (per scrivere) e al nome
  const avanza = Math.max(0, (valet || orariSotto ? largUso : Math.min(largUso, Math.max(m.somma, 138))) - m.somma);
  const iF = cols.indexOf('FIRMA');
  if (iF >= 0) m.w[iF] += avanza * 0.6;
  m.w[2] += avanza * (iF >= 0 ? 0.4 : 1);
  const larghezze = {};
  m.w.forEach((x, c) => (larghezze[c] = { cellWidth: Math.round(x * 10) / 10 }));
  // sigle del turno (e numero cassa) al centro della casella
  larghezze[3].halign = 'center';
  if (!valet && !generico) larghezze[4].halign = 'center';
  const tabW = m.w.reduce((a, b) => a + b, 0);
  const rowH = m.rowH;
  const fontR = m.f;
  const padR = m.pad;
  doc.autoTable({
    startY: 26,
    margin: { left: 10 },
    tableWidth: tabW,
    head: [cols],
    body: body,
    theme: 'grid',
    styles: {
      fontSize: fontR,
      cellPadding: padR,
      lineColor: [120, 120, 120],
      lineWidth: 0.2,
      textColor: [0, 0, 0],
      minCellHeight: rowH,
    },
    headStyles: { fontStyle: 'bold', halign: 'center', minCellHeight: 6 },
    columnStyles: larghezze,
    didParseCell: (d) => {
      if (d.section === 'head') {
        d.cell.styles.fillColor =
          d.column.index === 0 ? [0, 176, 80] : d.column.index === 1 ? [255, 0, 0] : [255, 255, 0];
        if (d.column.index <= 1) d.cell.styles.textColor = [255, 255, 255];
        return;
      }
      // stile della cella singola + formato riga + regole fisse delle colonne
      const fmtR = righeFmt[d.row.index] || {};
      const campo = campiCol[d.column.index];
      const stC = _stileCella(campo && righeCs[d.row.index] ? righeCs[d.row.index][campo] : '');
      let bold = stC.b || fmtR.b;
      let ital = stC.i || fmtR.i;
      let fill = stC.c || '';
      const tCol = stC.t || fmtR.t || '';
      if (tCol && tCol[0] === '#') d.cell.styles.textColor = _peHexRgb(tCol);
      if (d.column.index === 2 && righeFm[d.row.index]) {
        fill = fill || righeFm[d.row.index];
        bold = true;
      } else if (d.column.index === 3 && d.cell.raw) {
        const hex = _pianoColore(String(d.cell.raw).trim());
        if (!fill && hex && hex[0] === '#') fill = hex;
        bold = true;
      } else if (d.column.index === 4 && !valet && !generico && d.cell.raw) {
        fill = fill || '#FFFF00';
        bold = true;
      }
      if (fill) d.cell.styles.fillColor = _peHexRgb(fill);
      if (bold || ital) d.cell.styles.fontStyle = bold && ital ? 'bolditalic' : bold ? 'bold' : 'italic';
    },
  });
  if (!valet) {
    const turniPresenti = {};
    (_briefState.righe || []).forEach((r) => {
      if (r.turno) turniPresenti[String(r.turno).trim().toUpperCase()] = true;
    });
    const turni = _pianoTurniReparto()
      .filter((t) => turniPresenti[t.codice.toUpperCase()])
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
      startY: orariSotto ? doc.lastAutoTable.finalY + 6 : 26,
      margin: { left: orariSotto ? 10 : Math.max(156, 10 + tabW + 4) },
      tableWidth: 44,
      head: [[{ content: 'ORARI', colSpan: 3, styles: { halign: 'center' } }]],
      body: bodyT,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 1.3, lineColor: [120, 120, 120], lineWidth: 0.2, textColor: [0, 0, 0] },
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
  doc.text('Casino Lugano SA · Briefing · E/U da spuntare a penna', 10, PH - 5);
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
    doc.text('PAUSE VALET · ' + lbl, 105, 16, { align: 'center' });
    doc.autoTable({
      startY: 24,
      margin: { left: 10 },
      tableWidth: 152,
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
      styles: Object.assign({}, stiliBase, { fontSize: 9.5, cellPadding: 1.6 }),
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 42 },
        2: { cellWidth: 26 },
        3: { cellWidth: 23 },
        4: { cellWidth: 23 },
        5: { cellWidth: 23 },
      },
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
    doc.text((tit ? String(tit.v) : 'PAUSE') + ' · ' + lbl, 105, 15.4, { align: 'center' });
    if (sotto) {
      doc.setFillColor(255, 255, 0);
      doc.rect(10, 19.5, 190, 6.5, 'F');
      doc.rect(10, 19.5, 190, 6.5);
      doc.setFontSize(9);
      doc.text(String(sotto.v), 105, 24, { align: 'center' });
    }
    const colonne = [];
    const stampaOpz = c.stampaOpz || {};
    [1, 4, 7].forEach((base, bi) => {
      const body = [];
      let salta = false;
      for (let r = 4; r <= c.nR; r++) {
        const a = c.celle[r + '|' + base];
        const b = c.celle[r + '|' + (base + 1)];
        // colonne facoltative (accoglienza, secondo S5...): solo se scelte
        if (a && a.hdr) salta = !!a.opz && !stampaOpz[String((b && b.v) || '').trim()];
        if (salta) continue;
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
      if (body.length) colonne.push({ bi: bi, body: body });
    });
    // sempre su un foglio solo. Ogni colonna e fatta di blocchi (intestazione e
    // righe): il primo blocco resta al suo posto, gli altri (colonnine personali,
    // seconde colonne) vanno nella colonna piu corta, anche in una quarta colonna;
    // se serve ancora il testo si rimpicciolisce, restando leggibile.
    const posti = [[], [], [], []];
    const altezza = (l) => l.reduce((n, x) => n + x.length, 0);
    const extra = [];
    colonne.forEach((x) => {
      const blocchi = [];
      x.body.forEach((riga) => {
        const vuota = riga.length === 1 && riga[0].styles && riga[0].styles.lineWidth === 0;
        if (vuota || !blocchi.length) blocchi.push([]);
        if (!vuota) blocchi[blocchi.length - 1].push(riga);
      });
      posti[x.bi].push(blocchi[0]);
      blocchi.slice(1).forEach((bl) => extra.push(bl));
    });
    // bigliettino del mattino (C4) nel foglio grande, se spuntato in "In stampa anche"
    (c.biglietti || []).forEach((bg) => {
      if (!stampaOpz[String(bg.nome || '').trim()]) return;
      const cella = (v, bgc, bold) => ({
        content: v,
        styles: {
          fillColor: bgc ? _peHexRgb(bgc) : [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: bold ? 'bold' : 'normal',
        },
      });
      extra.push(
        [[cella(bg.turno || 'C4', '#FFE0B2', true), cella(String(bg.nome) + ' · mattino', '#FFE0B2', true)]].concat(
          bg.righe.map((x) => [
            cella(x.pos, _peColoreSettore(x.pos), true),
            cella(
              _pbOra(x.ini) + ' - ' + _pbOra(x.fin) + (x.pos === 'PAUSA' ? '' : ' ' + x.nome),
              _peColoreSettore(x.pos),
              true,
            ),
          ]),
        ),
      );
    });
    extra.forEach((bl) => {
      const k = [0, 1, 2, 3].sort((a, b) => altezza(posti[a]) - altezza(posti[b]))[0];
      posti[k].push(bl);
    });
    const spazio = [
      { content: '', colSpan: 2, styles: { minCellHeight: 3.2, lineWidth: 0, fillColor: [255, 255, 255] } },
    ];
    const corpi = posti.map((l) => l.reduce((acc, bl, i) => acc.concat(i ? [spazio] : [], bl), []));
    const maxRighe = Math.max(1, ...corpi.map((x) => x.length));
    // carattere 8,5 (piu leggibile); altezza di una riga a scala 1 circa 5,5 mm; spazio utile 250 mm
    const scala = Math.min(1, 250 / (5.5 * maxRighe));
    // bigliettini vicini (3 mm tra uno e l altro, facili da tagliare) e
    // larghi quanto serve: la colonna orario quanto "22.15 - 22.30" o il nome
    const fs = Math.max(5.2, 8.5 * scala);
    const pad = Math.max(0.35, 1 * scala);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs);
    const largo = (body, i, min) =>
      Math.min(
        40,
        Math.max(
          min,
          ...body
            .filter((r) => r.length === 2)
            .map((r) => doc.getTextWidth(String(r[i].content || '')) + 2 * pad + 0.8),
        ),
      );
    let x = 10;
    corpi.forEach((body) => {
      if (!body.length) return;
      const w0 = largo(body, 0, 10);
      const w1 = largo(body, 1, 18);
      doc.setPage(1);
      doc.autoTable({
        startY: 30,
        margin: { left: x },
        tableWidth: w0 + w1,
        body: body,
        theme: 'grid',
        styles: Object.assign({}, stiliBase, { cellPadding: pad, fontSize: fs }),
        columnStyles: { 0: { cellWidth: w0 }, 1: { cellWidth: w1 } },
      });
      x += w0 + w1 + 3;
    });
  }
  const formTesto = c.tipo === 'slots' ? _pcFormazioneTesto(c) : '';
  if (formTesto) {
    doc.setPage(1);
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize('In formazione (stesse pause del collega): ' + formTesto, 190), 10, 284);
  }
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text(
    'Casino Lugano SA · Pause ' + _pianoReparto() + ' · generato il ' + new Date().toLocaleDateString('it-IT'),
    10,
    292,
  );
  logAzione('Pause stampate', _pianoReparto() + ' ' + dstr);
  mostraPdfPreview(doc, 'pause_' + dstr + '_' + _pianoReparto() + '.pdf', 'Pause ' + lbl);
}
// ---------- controlli, proposte e bigliettino nel briefing ----------
// bigliettino del mattino: quello del foglio; per i fogli generati prima che
// esistesse (v303 e precedenti) si ricava dal briefing del giorno, cosi le mezz
// ore del mattino (R22, S22, C4) non risultano mancanti
function _pcBigliettiFoglio(c) {
  if (c && Array.isArray(c.biglietti)) return c.biglietti;
  if (!_briefState || !Array.isArray(_briefState.righe)) return [];
  const dT = {};
  _pcFormazione(_briefState.righe).righe.forEach((r) => {
    const nome = String(r.nome || '').trim();
    const t = String(r.turno || '')
      .trim()
      .toUpperCase();
    if (nome && t && nome.toUpperCase() !== 'XXX') (dT[t] = dT[t] || []).push(nome);
  });
  const bg = _peBigliettoMattino({ dT: dT });
  return bg ? [bg] : [];
}
// tutti gli avvisi del foglio: pausa e cambio collegati, regola delle ore,
// distanza, sala vuota, righe che non coprono nessuno (senza doppioni)
function _pcAvvisiFoglio(c) {
  const out = (typeof _pbControlla === 'function' ? _pbControlla(c) : []).map((x) =>
    Object.assign({ tipo: 'cambio' }, x),
  );
  if (!c || c.tipo !== 'slots' || !window.PauseControlli || !_briefState) return out;
  const gia = new Set();
  out.forEach((x) => x.celle.forEach((k) => gia.add(k)));
  const persone = _pcPersone(_briefState.righe, _briefData);
  window.PauseControlli.controlla(c, persone, { biglietti: _pcBigliettiFoglio(c) }).forEach((x) => {
    if (x.tipo === 'riga' && x.celle.some((k) => gia.has(k))) return;
    out.push(x);
  });
  return out;
}
function _pcAvvisiHtml(c) {
  const avvisi = _pcAvvisiFoglio(c);
  if (!avvisi.length) return '';
  const ordine = { cambio: 0, ore: 1, turno: 2, distanza: 3, riga: 4, sala: 5 };
  avvisi.sort((a, b) => (ordine[a.tipo] || 9) - (ordine[b.tipo] || 9));
  return (
    '<div class="pb-errori" style="margin:0 0 8px;padding:6px 10px;font-size:var(--fs-sm,.8125rem);background:var(--c-rosso-bg,#fdecea);border-left:3px solid var(--c-rosso,#c0392b)"><b>Da controllare (' +
    avvisi.length +
    ')</b><br>' +
    avvisi.map((x) => escP(x.testo)).join('<br>') +
    '<br><span style="color:var(--muted)">Le righe interessate sono bordate di rosso. Sono avvisi: puoi correggere con le frecce, scrivendo nelle celle o con Annulla.</span></div>'
  );
}
// chi e in formazione con un collega (va in pausa con lui)
function _pcFormazioneTesto(c) {
  let l = (c && c.formazione) || null;
  if (!l && _briefState && Array.isArray(_briefState.righe)) l = _pcFormazione(_briefState.righe).affiancati;
  return (l || []).map((x) => x.nome + ' con ' + x.con + ' (' + x.turno + ')').join(', ');
}
function _pcFormazioneHtml(c) {
  const t = _pcFormazioneTesto(c);
  return t
    ? '<div class="pb-formazione" style="margin:0 0 8px;padding:5px 10px;font-size:var(--fs-sm,.8125rem);border-left:3px solid var(--c-verde,#2c6e49);background:var(--card-bg,transparent)"><b>In formazione</b> (stesse pause del collega, contano come una persona): ' +
        escP(t) +
        '</div>'
    : '';
}
// colonne facoltative in stampa: una casella per ciascuna (spenta di partenza)
function _pcStampaOpzHtml(c) {
  if (!c || !puoGestireBriefing()) return '';
  const l = (window.PauseControlli ? window.PauseControlli.blocchi(c).filter((b) => b.opz) : []).concat(
    (c.biglietti || []).map((bg) => ({ post: bg.turno || 'C4', nome: bg.nome, opz: 'bigliettino del mattino' })),
  );
  if (!l.length) return '';
  const scelte = c.stampaOpz || {};
  return (
    '<div class="pb-stampaopz" style="margin:0 0 8px;font-size:var(--fs-sm,.8125rem);display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center"><b>In stampa anche:</b>' +
    l
      .map(
        (b) =>
          '<label style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" data-nome="' +
          escP(b.nome) +
          '" onchange="briefPauseStampaOpz(this.dataset.nome,this.checked)"' +
          (scelte[b.nome] ? ' checked' : '') +
          '> ' +
          escP(b.post + ' ' + b.nome) +
          ' <span style="color:var(--muted)">(' +
          escP(b.opz) +
          ')</span></label>',
      )
      .join('') +
    '</div>'
  );
}
function briefPauseStampaOpz(nome, si) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  _briefRicorda();
  c.stampaOpz = Object.assign({}, c.stampaOpz || {});
  if (si) c.stampaOpz[nome] = true;
  else delete c.stampaOpz[nome];
  _briefSalvaPauseDebounce();
}
function _pcProposteHtml(c) {
  const l = (c && c.proposte) || [];
  if (!l.length || !puoGestireBriefing()) return '';
  const o = (m) => _pbOra(m);
  const righe = l.map((x) => {
    const chi = escP(x.turno) + ' ' + escP(x.nome);
    const ora = o(x.ini) + '-' + o(x.fin);
    if (x.modo === 'cambio') return chi + ': pausa ' + ora + ', cambio da ' + escP(x.chiTurno) + ' ' + escP(x.chi);
    if (x.modo === 'solo') return chi + ': pausa ' + ora + ' da solo (nel reparto resta un collega)';
    if (x.modo === 'spostata')
      return (
        chi +
        ': ' +
        (x.pos === 'PAUSA' ? 'pausa' : 'cambio ' + escP(x.pos)) +
        ' spostato da ' +
        o(x.daIni) +
        '-' +
        o(x.daFin) +
        ' a ' +
        ora +
        ', perche la sala non resti vuota'
      );
    return (
      '<b style="color:var(--c-rosso,#c0392b)">' +
      chi +
      ': pausa ' +
      ora +
      ', nessun collega formato e libero: la postazione resta senza cambio</b>'
    );
  });
  return (
    '<div class="pb-proposte" style="margin:0 0 8px;padding:6px 10px;font-size:var(--fs-sm,.8125rem);background:var(--c-azzurro-bg,#e6f0f8);border-left:3px solid var(--c-azzurro,#1f6fa3)"><b>Proposte del programma (' +
    l.length +
    ')</b>: pause che la regola delle ore prevede e lo schema non dava. Sono bordate di blu nel foglio.<br>' +
    righe.join('<br>') +
    '<div style="margin-top:6px"><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px" onclick="briefPauseTieniProposte()">Tengo le proposte</button> <span style="color:var(--muted)">(togli il blu; per cambiarle usa le frecce o scrivi nelle celle)</span></div></div>'
  );
}
function briefPauseTieniProposte() {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  _briefRicorda();
  Object.keys(c.celle).forEach((k) => delete c.celle[k].prop);
  c.proposte = [];
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
  toast('Proposte confermate');
}
// scheda di una facoltativa, uguale per tutte: striscia con il titolo (colore del
// settore), contenuto, e in basso sempre casella "nel foglio stampato" e bottone
function _pcFacScheda(titolo, colore, corpo, nome, azione, scelta, elimina) {
  const puo = puoGestireBriefing();
  return (
    '<div class="pb-fac" style="display:flex;flex-direction:column;border:1px solid #999;border-radius:4px;overflow:hidden;background:var(--card-bg,#fff);width:300px;max-width:100%">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:' +
    (colore || '#e8e8e8') +
    ';color:#14100a;font-weight:bold;padding:6px 10px;font-size:var(--fs-sm,.8125rem);border-bottom:1px solid #999"><span>' +
    escP(titolo) +
    '</span>' +
    (elimina
      ? '<span role="button" tabindex="0" style="cursor:pointer;color:#a8321f;font-size:1.05em;line-height:1" title="Elimina tutta la colonna" aria-label="Elimina tutta la colonna" onclick="' +
        elimina +
        '">×</span>'
      : '') +
    '</div><div style="padding:10px;flex:1">' +
    corpo +
    '</div>' +
    (puo
      ? '<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:6px 10px;border-top:1px solid var(--line,#ccc);font-size:var(--fs-sm,.8125rem)"><label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-nome="' +
        escP(nome) +
        '" onchange="briefPauseStampaOpz(this.dataset.nome,this.checked)"' +
        (scelta ? ' checked' : '') +
        '> nel foglio stampato</label><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 12px" onclick="' +
        azione +
        '">Stampa bigliettino</button></div>'
      : '') +
    '</div>'
  );
}
// bigliettino del mattino (C4) come scheda facoltativa
function _pcBigliettoHtml(c) {
  const scelte = (c && c.stampaOpz) || {};
  return ((c && c.biglietti) || [])
    .map((bg, i) =>
      _pcFacScheda(
        'Mattino · ' + (bg.turno || 'C4') + ' ' + bg.nome,
        _peColoreSettore(bg.turno || 'C4') || '#FFE0B2',
        '<table class="pb-biglietto" style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem);width:100%">' +
          bg.righe
            .map(
              (x) =>
                '<tr><td style="border:1px solid #999;padding:3px 8px;background:' +
                (_peColoreSettore(x.pos) || '#fff') +
                ';color:#14100a;font-weight:bold;width:52px">' +
                escP(x.pos) +
                '</td><td style="border:1px solid #999;padding:3px 8px">' +
                escP(x.pos === 'PAUSA' ? '' : x.nome || '') +
                '</td><td style="border:1px solid #999;padding:3px 8px;font-variant-numeric:tabular-nums;white-space:nowrap">' +
                _pbOra(x.ini) +
                ' - ' +
                _pbOra(x.fin) +
                '</td></tr>',
            )
            .join('') +
          '</table>',
        bg.nome,
        'pdfBigliettoPause(' + i + ')',
        scelte[bg.nome],
      ),
    )
    .join('');
}
// bigliettino da tagliare (formato A6): cambi del mattino di C4 o una colonna
// facoltativa (accoglienza, secondo S5...)
function pdfBigliettoPause(i) {
  const c = _briefState && _briefState.pause && _briefState.pause.contenuto;
  const bg = c && c.biglietti && c.biglietti[i];
  if (bg) _pdfBiglietto(bg);
}
function _pcBigliettoDaColonna(c, blk) {
  return {
    titolo: blk.post + ' · ' + String(blk.opz || '').toUpperCase(),
    nome: blk.nome,
    righe: blk.righe.map((x) => ({ pos: x.pos, nome: '', ini: x.ini, fin: x.fin })),
  };
}
function pdfBigliettoColonna(base, r) {
  const c = _briefState && _briefState.pause && _briefState.pause.contenuto;
  if (!c || !window.PauseControlli) return;
  const blk = window.PauseControlli.blocchi(c).find((b) => b.base === base && b.r === r);
  if (blk) _pdfBiglietto(_pcBigliettoDaColonna(c, blk));
}
function _pdfBiglietto(bg) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a6');
  const dstr = _briefData;
  doc.setFillColor(255, 224, 178);
  doc.rect(8, 8, 89, 9, 'F');
  doc.setDrawColor(120);
  doc.rect(8, 8, 89, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(bg.titolo + ' · ' + dstr.split('-').reverse().join('.'), 52.5, 14, { align: 'center' });
  doc.setFontSize(9);
  doc.text(String(bg.nome), 8, 23);
  doc.autoTable({
    startY: 26,
    margin: { left: 8 },
    tableWidth: 89,
    body: bg.righe.map((x) => [x.pos, x.pos === 'PAUSA' ? '' : x.nome || '', _pbOra(x.ini) + ' - ' + _pbOra(x.fin)]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.2, textColor: [0, 0, 0] },
    columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 45 }, 2: { cellWidth: 26 } },
    didParseCell: (d) => {
      const clr = _peColoreSettore(d.row.raw[0]);
      if (d.column.index === 0 && clr) d.cell.styles.fillColor = _peHexRgb(clr);
    },
  });
  logAzione('Bigliettino pause stampato', bg.titolo + ' ' + dstr);
  mostraPdfPreview(doc, 'bigliettino_' + dstr + '.pdf', 'Bigliettino ' + bg.titolo);
}
// ---------- regole pause personalizzabili ----------
function _briefRenderPauseCfg() {
  if (typeof isAdmin === 'function' && !isAdmin()) return '';
  const sett = _peSettoreCorrente();
  const regole = _peRegolePause(sett);
  const orari = _peOrariTurni();
  const turniSett = _pianoTurniReparto().slice();
  const salvate = !!(_briefPauseCfg().regole && Array.isArray(_briefPauseCfg().regole[sett]));
  const dowTab = _peDow();
  const GGL = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  // tabella "turni, orari e pause spettanti" calcolata LIVE dalle regole
  let tab =
    '<table style="border-collapse:collapse;font-size:var(--fs-sm,.8125rem);margin:8px 0"><tr>' +
    ['TURNO', 'ORARIO', 'DURATA', 'PAUSE', 'DA QUALE REGOLA']
      .map((x) => '<th style="border:1px solid #999;background:#FFFF00;padding:3px 10px">' + x + '</th>')
      .join('') +
    '</tr>';
  turniSett
    .sort((a, b) => {
      const g = _briefGruppo(a.codice) - _briefGruppo(b.codice);
      if (g) return g;
      return a.codice < b.codice ? -1 : 1;
    })
    .forEach((t) => {
      const o = orari[t.codice];
      const td = (x, extra) => '<td style="border:1px solid #999;padding:2px 10px' + (extra || '') + '">' + x + '</td>';
      if (!o) {
        tab +=
          '<tr>' +
          td(escP(t.codice), ';font-weight:bold;background:' + (_pianoColore(t.codice) || '')) +
          '<td colspan="4" style="border:1px solid #999;padding:2px 10px;color:var(--c-rosso,#c0392b)">orari mancanti · impostali nella scheda Turni per far funzionare le pause</td></tr>';
        return;
      }
      const split = _pePauseSplit(orari, t.codice, sett, dowTab);
      const cod = String(t.codice).toUpperCase();
      const ore = o.dur / 60;
      const conG = (r) => r.giorni && r.giorni.length;
      const pt = regole.filter(
        (r) => r.tipo === 'turno' && String(r.turno).toUpperCase() === cod && _peGiorniOk(r, dowTab),
      );
      const rt = pt.find(conG) || pt[0];
      const pd = regole.filter(
        (r) => r.tipo === 'durata' && ore >= parseFloat(r.da) && ore < parseFloat(r.a) && _peGiorniOk(r, dowTab),
      );
      const rd = pd.find(conG) || pd[0];
      const fonte = rt ? _peRegolaDescr(rt) : rd ? _peRegolaDescr(rd) : 'nessuna regola: valore di base';
      const oreLbl = Math.floor(o.dur / 60) + 'h' + (o.dur % 60 ? String(o.dur % 60).padStart(2, '0') : '');
      tab +=
        '<tr>' +
        td(escP(t.codice), ';font-weight:bold;background:' + (_pianoColore(t.codice) || '')) +
        td(o.iniStr + ' - ' + o.finStr) +
        td(oreLbl) +
        td('<b>' + (split.length ? split.join('+') : 'nessuna') + '</b>') +
        td('<span style="color:var(--muted)">' + escP(fonte) + '</span>') +
        '</tr>';
    });
  tab += '</table>';
  // elenco regole del settore
  let lista = '';
  if (!regole.length) lista = '<p style="color:var(--muted)">Nessuna regola: le pause seguono i valori di base.</p>';
  regole.forEach((r, i) => {
    lista +=
      '<div class="tipo-item" style="padding:6px 10px"><span class="mini-badge" style="background:var(--accent2)">' +
      escP((PAUSE_REGOLE_TIPI[r.tipo] || {}).nome || r.tipo) +
      '</span><span class="tipo-item-name">' +
      escP(_peRegolaDescr(r)) +
      '</span><span style="flex:1"></span><button class="btn-del-tipo" onclick="pePauseModifica(' +
      i +
      ')">Modifica</button><button class="btn-del-tipo pericolo" style="margin-left:4px" onclick="pePauseElimina(' +
      i +
      ')">Elimina</button></div>';
  });
  // modulo nuova regola / modifica (i campi compaiono in base al tipo)
  const GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const GGV = [1, 2, 3, 4, 5, 6, 0];
  const inp = (id, ph, larg, tipo) =>
    '<input id="' +
    id +
    '" type="' +
    (tipo || 'text') +
    '" placeholder="' +
    ph +
    '" style="width:' +
    (larg || 90) +
    'px;padding:5px 7px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">';
  let form =
    '<div id="pcfg-form" class="sez-form" style="display:none;flex-direction:column;align-items:stretch;gap:8px;margin-top:8px;padding:12px 14px;background:var(--paper2);border-radius:3px">' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b id="pcfg-titolo">Nuova regola</b> · tipo: <select id="pcfg-tipo" onchange="pePauseTipoCambiato()">' +
    Object.keys(PAUSE_REGOLE_TIPI)
      .map((k) => '<option value="' + k + '">' + escP(PAUSE_REGOLE_TIPI[k].nome) + '</option>')
      .join('') +
    '</select><span id="pcfg-spiega" style="color:var(--muted)"></span></div>';
  const giorniHtml =
    'Giorni: ' +
    GG.map(
      (g, k) =>
        '<label style="display:inline-flex;align-items:center;gap:2px"><input type="checkbox" class="pcfg-g" value="' +
        GGV[k] +
        '">' +
        g +
        '</label>',
    ).join('') +
    ' <button type="button" class="btn-del-tipo" onclick="pePauseGiorni([1,2,3,4])">Lun-Gio</button><button type="button" class="btn-del-tipo" onclick="pePauseGiorni([5,6])">Ven-Sab</button><button type="button" class="btn-del-tipo" onclick="pePauseGiorni([0])">Dom</button><button type="button" class="btn-del-tipo" onclick="pePauseGiorni([])">Sempre</button>' +
    ' <span style="color:var(--muted)">(nessuno = sempre)</span>';
  form +=
    '<div data-pt="durata" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">Turni da almeno ' +
    inp('pcfg-da', '7', 56, 'number') +
    ' ore e meno di ' +
    inp('pcfg-a', '8', 56, 'number') +
    ' ore: pause ' +
    inp('pcfg-pause-d', '30+15', 90) +
    '</div>';
  form +=
    '<div data-pt="turno" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">Turno <select id="pcfg-turno" style="padding:5px">' +
    turniSett.map((t) => '<option value="' + escP(t.codice) + '">' + escP(t.codice) + '</option>').join('') +
    '</select> pause ' +
    inp('pcfg-pause-t', '15+15 oppure 0', 120) +
    '</div>';
  form += '<div data-pt="distanza">Almeno ' + inp('pcfg-minuti', '45', 60, 'number') + ' minuti</div>';
  form +=
    '<div data-pt="fascia" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">Nessuna pausa dalle ' +
    inp('pcfg-fda', '23.00', 64) +
    ' alle ' +
    inp('pcfg-fa', '01.00', 64) +
    '</div>';
  form +=
    '<div id="pcfg-giorni" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + giorniHtml + '</div>';
  form += '<div data-pt="insieme">Al massimo ' + inp('pcfg-n', '1', 56, 'number') + ' persone in pausa insieme</div>';
  form += '<div data-pt="nota">Testo: ' + inp('pcfg-testo', 'Chi esce prima non fa l ultima pausa', 420) + '</div>';
  form +=
    '<div id="pcfg-esito" style="font-size:var(--fs-sm,.8125rem)"></div>' +
    '<div style="display:flex;gap:8px"><button class="btn-add-tipo" onclick="pePauseSalva()">Salva regola</button><button class="btn-secondario" onclick="pePauseAnnulla()">Annulla</button></div></div>';
  // guida rapida, senza parole tecniche
  const guida =
    '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:bold">Come si crea una regola (guida rapida)</summary>' +
    '<ol style="margin:8px 0 4px 18px;line-height:1.5">' +
    '<li>Premi <b>Nuova regola</b> e scegli il tipo dal menu: accanto compare a cosa serve.</li>' +
    '<li>Compila le caselle. Le pause si scrivono come somma di minuti: <b>30+15</b> vuol dire una pausa da 30 e una da 15; <b>0</b> vuol dire nessuna pausa.</li>' +
    '<li>Premi <b>Salva regola</b>. Se qualcosa non torna (una sigla che nel settore non esiste, un orario scritto male, due regole che si accavallano) il programma lo dice subito.</li>' +
    '<li>La tabella in alto si aggiorna da sola: mostra per ogni turno le pause che risultano e da quale regola vengono.</li>' +
    '</ol>' +
    '<p style="margin:6px 0"><b>Esempi</b></p><ul style="margin:0 0 6px 18px;line-height:1.5">' +
    Object.keys(PAUSE_REGOLE_TIPI)
      .map((k) => '<li><b>' + escP(PAUSE_REGOLE_TIPI[k].nome) + '</b>: ' + escP(PAUSE_REGOLE_TIPI[k].esempio) + '</li>')
      .join('') +
    '</ul>' +
    '<p style="margin:6px 0;color:var(--muted)">Ogni settore ha le sue regole. Una regola per un turno preciso vale piu di quella per durata; una regola con i giorni indicati (Lun-Gio, Ven-Sab, Dom) vale piu di una senza giorni. Cosi si possono avere pause diverse da lunedi a giovedi, venerdi e sabato, e domenica. ' +
    (sett === 'slots'
      ? 'Negli Slots gli schemi di copertura (BG1, Q2, BG3, chi copre chi) restano quelli di sempre: le regole decidono quante pause e quanto lunghe, e segnalano in giallo le pause che non rispettano fascia, distanza o persone insieme.'
      : 'In questo settore le regole guidano direttamente la generazione delle pause.') +
    '</p></details>';
  let h =
    '<details style="margin-top:14px;font-size:var(--fs-sm,.8125rem)"><summary style="cursor:pointer;font-weight:bold">Regole pause · ' +
    escP(sett) +
    ' (' +
    regole.length +
    ')</summary><div style="padding:10px 4px;display:flex;flex-direction:column;gap:8px">';
  h +=
    '<div><b>Turni, orari e pause che risultano</b> per il giorno del briefing (' +
    GGL[dowTab] +
    ') · gli orari si cambiano nella scheda Turni</div>' +
    tab;
  h +=
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>Regole del settore</b><span style="flex:1"></span><button class="btn-add-tipo" onclick="pePauseNuova()">Nuova regola</button>' +
    (salvate
      ? '<button class="btn-secondario" title="Torna alle regole con cui il settore e partito" onclick="pePauseRipristina()">Ripristina regole di partenza</button>'
      : '') +
    '</div>';
  h += '<div class="tipo-list">' + lista + '</div>' + form + guida;
  const repCorr = sett;
  h += '<div style="margin-top:8px"></div>';
  // numeri cassa (CD): coppie e rotazione giornaliera · solo settore slots
  const cdCfg = repCorr === 'slots' ? (window._pianoCdCfg && window._pianoCdCfg.coppie) || [] : [];
  if (repCorr === 'slots')
    h +=
      '<div style="margin-top:6px"><b>Numeri cassa (CD)</b> · chi ha chiuso ieri riapre oggi; i C8 di ven/sab riprendono in ordine la cassa del presto di ogni coppia. Tutto resta modificabile nel briefing.<br>';
  cdCfg.forEach((cp, i) => {
    h +=
      '<div style="margin:4px 0">Coppia CD <input class="cdcfg" data-i="' +
      i +
      '" data-f="cd" value="' +
      escP((cp.cd || []).join(',')) +
      '" style="width:52px;padding:3px;text-align:center"> · apre: <input class="cdcfg" data-i="' +
      i +
      '" data-f="apre" value="' +
      escP(cp.apre || '') +
      '" style="width:52px;padding:3px;text-align:center"> chiude: <input class="cdcfg" data-i="' +
      i +
      '" data-f="chiude" value="' +
      escP(cp.chiude || '') +
      '" style="width:52px;padding:3px;text-align:center"></div>';
  });
  if (repCorr === 'slots') h += '</div>';
  if (repCorr === 'slots')
    h +=
      '<div><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 14px" onclick="salvaPauseCfg()">Salva numeri cassa</button></div>';
  h += '</div></details>';
  return h;
}
// ---- modulo regole: apertura, campi per tipo, salvataggio ----
window._pePauseEditIdx = -1;
function pePauseGiorni(lista) {
  document.querySelectorAll('.pcfg-g').forEach((cb) => (cb.checked = lista.includes(parseInt(cb.value))));
}
function pePauseTipoCambiato() {
  const tipo = (document.getElementById('pcfg-tipo') || {}).value || 'durata';
  document
    .querySelectorAll('#pcfg-form [data-pt]')
    .forEach((el) => (el.style.display = el.dataset.pt === tipo ? '' : 'none'));
  const gg = document.getElementById('pcfg-giorni');
  if (gg) gg.style.display = ['durata', 'turno', 'fascia'].includes(tipo) ? '' : 'none';
  const sp = document.getElementById('pcfg-spiega');
  if (sp) sp.textContent = (PAUSE_REGOLE_TIPI[tipo] || {}).spiega || '';
  const es = document.getElementById('pcfg-esito');
  if (es) es.innerHTML = '';
}
function pePauseNuova() {
  window._pePauseEditIdx = -1;
  const f = document.getElementById('pcfg-form');
  if (!f) return;
  f.style.display = 'flex';
  document.getElementById('pcfg-titolo').textContent = 'Nuova regola';
  f.querySelectorAll('input').forEach((i) => {
    if (i.type === 'checkbox') i.checked = false;
    else i.value = '';
  });
  pePauseTipoCambiato();
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function pePauseModifica(i) {
  const r = _peRegolePause()[i];
  if (!r) return;
  pePauseNuova();
  window._pePauseEditIdx = i;
  document.getElementById('pcfg-titolo').textContent = 'Modifica regola';
  document.getElementById('pcfg-tipo').value = r.tipo;
  const v = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val == null ? '' : val;
  };
  v('pcfg-da', r.da);
  v('pcfg-a', r.a);
  v('pcfg-pause-d', r.pause);
  v('pcfg-turno', r.turno);
  v('pcfg-pause-t', r.pause);
  v('pcfg-minuti', r.minuti);
  v('pcfg-fda', r.da);
  v('pcfg-fa', r.a);
  v('pcfg-n', r.n);
  v('pcfg-testo', r.testo);
  document
    .querySelectorAll('.pcfg-g')
    .forEach((cb) => (cb.checked = !!(r.giorni || []).map(Number).includes(parseInt(cb.value))));
  pePauseTipoCambiato();
}
function pePauseAnnulla() {
  const f = document.getElementById('pcfg-form');
  if (f) f.style.display = 'none';
  window._pePauseEditIdx = -1;
}
function _pePauseLeggiForm() {
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const tipo = v('pcfg-tipo');
  const giorni = [...document.querySelectorAll('.pcfg-g:checked')].map((cb) => parseInt(cb.value));
  if (tipo === 'durata')
    return { tipo, da: parseFloat(v('pcfg-da')), a: parseFloat(v('pcfg-a')), pause: v('pcfg-pause-d'), giorni };
  if (tipo === 'turno') return { tipo, turno: v('pcfg-turno').toUpperCase(), pause: v('pcfg-pause-t'), giorni };
  if (tipo === 'distanza') return { tipo, minuti: parseInt(v('pcfg-minuti')) };
  if (tipo === 'fascia')
    return {
      tipo,
      giorni,
      da: _peOrarioPunti(v('pcfg-fda')),
      a: _peOrarioPunti(v('pcfg-fa')),
    };
  if (tipo === 'insieme') return { tipo, n: parseInt(v('pcfg-n')) };
  return { tipo: 'nota', testo: v('pcfg-testo') };
}
async function _pePauseSalvaRegole(lista) {
  const sett = _peSettoreCorrente();
  const c0 = _briefPauseCfg();
  const cfg = Object.assign({}, c0, { regole: Object.assign({}, c0.regole || {}) });
  if (lista === null) delete cfg.regole[sett];
  else cfg.regole[sett] = lista;
  if (!(await salvaImp('piano_pause_cfg', JSON.stringify(cfg)))) return false;
  window._briefPauseCfgObj = cfg;
  return true;
}
async function pePauseSalva() {
  if (!isAdmin()) return;
  const r = _pePauseLeggiForm();
  const lista = _peRegolePause().map((x) => Object.assign({}, x));
  const idx = window._pePauseEditIdx;
  const altre = lista.filter((_, i) => i !== idx);
  const es = document.getElementById('pcfg-esito');
  const chk = _peValidaRegolaPausa(r, _peSettoreCorrente(), altre);
  if (chk.errore) {
    if (es) es.innerHTML = '<span style="color:var(--c-rosso,#c0392b);font-weight:700">' + escP(chk.errore) + '</span>';
    return;
  }
  if (
    chk.avvisi.length &&
    !(await chiediConferma('Attenzione:\n\n- ' + chk.avvisi.join('\n- ') + '\n\nSalvare lo stesso?'))
  )
    return;
  // le regole "una sola" (distanza, persone insieme) e quelle per lo stesso turno sostituiscono la precedente
  let nuova = altre.filter(
    (o) =>
      !(
        (r.tipo === 'distanza' && o.tipo === 'distanza') ||
        (r.tipo === 'insieme' && o.tipo === 'insieme') ||
        (r.tipo === 'nota' && o.tipo === 'nota') ||
        (r.tipo === 'turno' &&
          o.tipo === 'turno' &&
          String(o.turno).toUpperCase() === r.turno &&
          _peGiorniStessi(o.giorni, r.giorni))
      ),
  );
  if (idx >= 0 && idx <= nuova.length) nuova.splice(idx, 0, r);
  else nuova.push(r);
  if (!(await _pePauseSalvaRegole(nuova))) return;
  logAzione('Regole pause', _peSettoreCorrente() + ': ' + (idx >= 0 ? 'modificata ' : 'nuova ') + _peRegolaDescr(r));
  toast('Regola salvata · ' + _peRegolaDescr(r));
  window._pePauseEditIdx = -1;
  _briefRefreshPause();
}
async function pePauseElimina(i) {
  if (!isAdmin()) return;
  const lista = _peRegolePause().slice();
  const r = lista[i];
  if (!r) return;
  if (!(await chiediConferma('Eliminare la regola?\n\n' + _peRegolaDescr(r)))) return;
  lista.splice(i, 1);
  if (!(await _pePauseSalvaRegole(lista))) return;
  logAzione('Regole pause', _peSettoreCorrente() + ': eliminata ' + _peRegolaDescr(r));
  toast('Regola eliminata');
  _briefRefreshPause();
}
async function pePauseRipristina() {
  if (!isAdmin()) return;
  if (!(await chiediConferma('Tornare alle regole di partenza di questo settore? Le regole create qui vengono tolte.')))
    return;
  if (!(await _pePauseSalvaRegole(null))) return;
  logAzione('Regole pause', _peSettoreCorrente() + ': ripristinate le regole di partenza');
  toast('Regole di partenza ripristinate');
  _briefRefreshPause();
}
// numeri cassa (CD): salvataggio delle coppie · le altre impostazioni restano
async function salvaPauseCfg() {
  const c0 = window._briefPauseCfgObj || {};
  const obj = Object.assign({}, c0);
  if (!(await salvaImp('piano_pause_cfg', JSON.stringify(obj)))) return;
  window._briefPauseCfgObj = obj;
  // coppie CD
  const coppie = ((window._pianoCdCfg && window._pianoCdCfg.coppie) || []).map((cp) => Object.assign({}, cp));
  document.querySelectorAll('.cdcfg').forEach((el) => {
    const i = parseInt(el.dataset.i);
    if (!coppie[i]) return;
    if (el.dataset.f === 'cd')
      coppie[i].cd = el.value
        .split(/[,/\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 2);
    else coppie[i][el.dataset.f] = el.value.trim().toUpperCase();
  });
  if (coppie.length) {
    window._pianoCdCfg = { coppie: coppie };
    if (!(await salvaImp('piano_cd_config', JSON.stringify(window._pianoCdCfg)))) return;
  }
  toast('Regole pause e numeri cassa salvati');
}
async function importaBriefingExcel(input) {
  if (!puoGestireBriefing() || !_briefState) return;
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
      !(await chiediConferma('Trovate ' + righe.length + ' righe nel file. Sostituisco il briefing attuale?'))
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
