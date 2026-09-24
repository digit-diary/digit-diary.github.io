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
    // scelgo distribuiti · ideali a frazioni del turno, minimo 45' tra loro
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
  window._peDowCorrente = dow;
  const sh = _peSheet();
  const dataStr = dstr.split('-').reverse().join('.');
  if (tipoGiorno === 'LUN-GIO') _peGeneraLunGio(sh, ctx, dataStr);
  else if (tipoGiorno === 'VEN-SAB') _peGeneraVenSab(sh, ctx, dataStr);
  else _peGeneraDomenica(sh, ctx, dataStr);
  _peGeneraExtra(sh, ctx, tipoGiorno);
  _peCompattaSala(sh);
  window._peDowCorrente = null;
  return { tipo: 'slots', celle: sh.celle, nR: _peMaxR(sh), tipoGiorno: tipoGiorno };
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
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
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
// scambia una riga di copertura con quella adiacente RICALCOLANDO gli
// orari: l'inizio resta quello della prima, le durate seguono le postazioni
// (es. R24 22.15-22.45 + S3 22.45-23.00 → S3 22.15-22.30 + R24 22.30-23.00)
function briefPausaSposta(base, r, dir) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  const dati = (rr) => {
    const a = c.celle[rr + '|' + base];
    const b = c.celle[rr + '|' + (base + 1)];
    if (!a || !b || a.hdr || a.span || b.hdr) return null;
    const orario = String(b.v || '');
    if (!orario.includes(' - ')) return null;
    const p = orario.split(' - ');
    const ini = _peOraMin(p[0].trim());
    let fin = _peOraMin(p[1].trim());
    if (ini == null || fin == null) return null;
    let iniA = ini < 660 ? ini + 1440 : ini;
    let finA = fin < 660 ? fin + 1440 : fin;
    if (finA <= iniA) finA += 1440;
    return { a: a, b: b, ini: iniA, fin: finA, dur: finA - iniA };
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
  if (!d1 || !d2) {
    toast('Questa riga non si può scambiare (serve una riga di copertura adiacente)');
    return;
  }
  const prima = dir < 0 ? d2 : d1;
  const seconda = dir < 0 ? d1 : d2;
  // le POSTAZIONI si scambiano (e l'eventuale avviso rosso [!] le segue),
  // gli orari si ricalcolano in sequenza dall'inizio della prima riga
  const inizio = prima.ini;
  const warnPrima = prima.a.bg === _PE_CLR.rosso;
  const warnSeconda = seconda.a.bg === _PE_CLR.rosso;
  const oraStile = (min) => {
    // stile Excel: la fascia 24:00-24:59 si scrive 24.xx
    let m = min;
    while (m >= 1500) m -= 1440;
    if (m >= 1440) return '24.' + String(m - 1440).padStart(2, '0');
    return _peMinToOra(m);
  };
  const durPrima = seconda.dur;
  const nuovi = [
    { d: prima, pos: seconda.a.v, warn: warnSeconda, ini: inizio, fin: inizio + durPrima },
    { d: seconda, pos: prima.a.v, warn: warnPrima, ini: inizio + durPrima, fin: inizio + durPrima + prima.dur },
  ];
  nuovi.forEach((x) => {
    x.d.a.v = x.pos;
    const clr = x.warn ? _PE_CLR.rosso : _peColoreSettore(x.pos);
    x.d.a.bg = clr;
    x.d.b.v = oraStile(x.ini) + ' - ' + oraStile(x.fin) + (x.warn ? '  [!]' : '');
    x.d.b.bg = clr;
    if (x.warn) {
      x.d.a.fg = '#fff';
      x.d.b.fg = '#fff';
    } else {
      delete x.d.a.fg;
      delete x.d.b.fg;
    }
  });
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
function briefPausaDelRiga(base, r) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  const c = _briefState.pause.contenuto;
  delete c.celle[r + '|' + base];
  delete c.celle[r + '|' + (base + 1)];
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
// modifica cella pause slots (r|c del foglio virtuale)
function briefPausaCellaSlots(r, c, val) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
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
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
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
  _briefState.pause.contenuto.righe.push({ turno: '', nome: '', orario: '', pause: [] });
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
function briefValetDelRiga(i) {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause) return;
  _briefState.pause.contenuto.righe.splice(i, 1);
  _briefSalvaPauseDebounce();
  _briefRefreshPause();
}
async function briefEliminaPause() {
  if (!puoGestireBriefing() || !_briefState || !_briefState.pause || !_briefState.pause.id) return;
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
  const puo = puoGestireBriefing();
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
      '<table style="border-collapse:collapse;font-size:.82rem;table-layout:fixed"><colgroup><col style="width:46px"><col style="width:88px"></colgroup>';
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
            'padding:2px 4px;font-size:.82rem"></td>';
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
        '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-top:4px" onclick="briefPausaInsRiga(' +
        base +
        ',' +
        (righe.length ? righe[righe.length - 1].r : 6) +
        ')">+ riga</button>';
    h += '</div>';
  });
  h += '</div>';
  if (puo)
    h +=
      '<div style="margin-top:8px"><button class="btn-export" style="font-size:.82rem;padding:4px 10px;border-color:#c0392b;color:#c0392b" onclick="briefEliminaPause()">Elimina pause</button></div>';
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
        (x) => '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:.82rem">' + x + '</th>',
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
  const puo = puoGestireBriefing();
  let h =
    '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:.82rem"><tr><td colspan="6" style="border:1px solid #999;background:#FFFF00;font-weight:bold;text-align:center;padding:4px">PAUSE VALET · ' +
    escP(c.tipoGiorno || '') +
    '</td></tr><tr>' +
    ['TURNO', 'NOME', 'ORARIO', 'PAUSA 1', 'PAUSA 2', 'PAUSA 3']
      .map(
        (x) => '<th style="border:1px solid #999;background:#DCDCDC;padding:3px 8px;font-size:.82rem">' + x + '</th>',
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
          'padding:2px 6px;font-size:.82rem"></td>'
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
          '\',this.value)" style="width:86px;border:none;background:transparent;font:inherit;text-align:center;padding:2px 4px;font-size:.82rem"></td>';
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
      '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-top:4px" onclick="briefValetAddRiga()">+ Aggiungi riga</button>';
  h += '<div id="brief-crono">' + _briefRenderCronoValet(c) + '</div>';
  if (c.nota)
    h +=
      '<p style="font-size:.82rem;font-style:italic;background:#FFFFCC;border:1px solid #999;padding:6px 10px;margin-top:10px;max-width:560px">' +
      escP(c.nota) +
      '</p>';
  if (puo)
    h +=
      '<div style="margin-top:8px"><button class="btn-export" style="font-size:.82rem;padding:4px 10px;border-color:#c0392b;color:#c0392b" onclick="briefEliminaPause()">Elimina pause</button></div>';
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
  doc.text('BRIEFING ' + _pianoReparto().toUpperCase() + ' · ' + lbl, 105, 16.2, { align: 'center' });
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
  // sempre in UN SOLO foglio: con tante righe compatta altezza e carattere
  const nRighe = body.length || 1;
  const rowH = nRighe > 32 ? Math.max(4.4, Math.floor((248 / nRighe) * 10) / 10) : 7;
  const fontR = nRighe > 32 ? 7.4 : 8.5;
  const padR = nRighe > 32 ? 1.1 : 1.8;
  doc.autoTable({
    startY: 24,
    margin: { left: 10 },
    tableWidth: valet ? 190 : 138,
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
      : generico
        ? {
            0: { cellWidth: 10 },
            1: { cellWidth: 10 },
            2: { cellWidth: 50 },
            3: { cellWidth: 14 },
            4: { cellWidth: 24 },
            5: { cellWidth: 30 },
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
  doc.text('Casino Lugano SA · Briefing · E/U da spuntare a penna', 10, 292);
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
      styles: Object.assign({}, stiliBase, { fontSize: 8, cellPadding: 1.4 }),
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
        margin: { left: 10 + bi * 50 },
        tableWidth: 42,
        body: body,
        theme: 'grid',
        styles: Object.assign({}, stiliBase, { cellPadding: 0.9, fontSize: 7 }),
        columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 29 } },
      });
    });
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
    '<table style="border-collapse:collapse;font-size:.82rem;margin:8px 0"><tr>' +
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
          '<td colspan="4" style="border:1px solid #999;padding:2px 10px;color:#c0392b">orari mancanti · impostali nella scheda Turni per far funzionare le pause</td></tr>';
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
    '<div id="pcfg-esito" style="font-size:.8rem"></div>' +
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
    '<details style="margin-top:14px;font-size:.82rem"><summary style="cursor:pointer;font-weight:bold">Regole pause · ' +
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
      '<div><button class="btn-export" style="font-size:.8rem;padding:4px 14px" onclick="salvaPauseCfg()">Salva numeri cassa</button></div>';
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
    if (es) es.innerHTML = '<span style="color:#c0392b;font-weight:700">' + escP(chk.errore) + '</span>';
    return;
  }
  if (chk.avvisi.length && !confirm('Attenzione:\n\n- ' + chk.avvisi.join('\n- ') + '\n\nSalvare lo stesso?')) return;
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
  if (!confirm('Eliminare la regola?\n\n' + _peRegolaDescr(r))) return;
  lista.splice(i, 1);
  if (!(await _pePauseSalvaRegole(lista))) return;
  logAzione('Regole pause', _peSettoreCorrente() + ': eliminata ' + _peRegolaDescr(r));
  toast('Regola eliminata');
  _briefRefreshPause();
}
async function pePauseRipristina() {
  if (!isAdmin()) return;
  if (!confirm('Tornare alle regole di partenza di questo settore? Le regole create qui vengono tolte.')) return;
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
