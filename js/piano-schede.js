/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-schede.js
 * PIANO · timbrature, statistiche, import vacanze, saldo ore dell anno, esportazione formato HR
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// TIMBRATURE · inserimento manuale, upload da timbratrice, confronto
// ore timbrate vs pianificate (come Turnivo cap. 22)
// ================================================================
let _pianoTimbrature = []; // mese corrente

async function _pianoCaricaTimbrature() {
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  _pianoTimbrature =
    (await secGet(
      'piano_timbrature?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
}
async function eliminaTimbratura(id) {
  if (!puoGestirePiano()) return;
  const t = _pianoTimbrature.find((x) => x.id === id);
  if (!t || !(await chiediConferma('Eliminare la timbratura di ' + t.collaboratore + ' del ' + t.data + '?'))) return;
  try {
    await secDel('piano_timbrature', 'id=eq.' + id);
    _pianoTimbrature = _pianoTimbrature.filter((x) => x.id !== id);
    logAzione('Timbratura eliminata', t.collaboratore + ' ' + t.data);
    toast('Timbratura eliminata');
    caricaConfrontoTimbrature();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
function _pianoOreTimbrata(entrata, uscita) {
  const e = _pianoOra(entrata);
  const u = _pianoOra(uscita);
  if (e == null || u == null) return 0;
  return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
}
// Ore timbrate CON LA REGOLA DEL TURNO: chi timbra PRIMA dell'inizio del
// proprio turno viene conteggiato dall'inizio turno (la timbratura resta
// registrata com'è); l'uscita oltre il fine turno conta tutta (straordinario).
// Con JG o altri codici senza orari (o senza turno) si conta dalla timbratura.
function _pianoOreTimbrataPerGiorno(nome, dstr, entrata, uscita) {
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  // orario personalizzato (es. JG con inizio dichiarato): stesso aggancio del turno
  if (r && !_pianoTurnoInfo(r.codice) && r.ora_inizio) {
    const e0 = _pianoOra(entrata);
    const i0 = _pianoOra(r.ora_inizio);
    if (e0 != null && i0 != null) {
      const anticipo = i0 - e0;
      if (anticipo > 0 && anticipo < 6) return _pianoOreTimbrata(r.ora_inizio, uscita);
    }
    return _pianoOreTimbrata(entrata, uscita);
  }
  const t = r ? _pianoTurnoInfo(r.codice) : null;
  if (t && t.ora_inizio) {
    const e = _pianoOra(entrata);
    const inizio = _pianoOra(t.ora_inizio);
    if (e != null && inizio != null) {
      // "prima dell'inizio" tenendo conto della mezzanotte: se la differenza
      // è piccola (< 6h) l'entrata anticipata si aggancia all'inizio turno
      const anticipo = inizio - e;
      const eEff = anticipo > 0 && anticipo < 6 ? t.ora_inizio.substring(0, 5) : entrata;
      return _pianoOreTimbrata(eEff, uscita);
    }
  }
  return _pianoOreTimbrata(entrata, uscita);
}
function _renderPianoTimbratureCard() {
  if (!puoGestirePiano() && !isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Timbrature · confronto con il piano</div><div style="padding:10px 14px" id="piano-timb-body">';
  h +=
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 12px" onclick="caricaConfrontoTimbrature()">Carica confronto del mese</button>' +
    (puoAzioniAutoPiano('import')
      ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 12px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="document.getElementById(\'timb-file\').click()">Importa file timbratrice</button>' +
        '<input type="file" id="timb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaTimbrature(this)">'
      : '') +
    '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">CSV o Excel con colonne nome / data / entrata / uscita (riconosciute in automatico)</span></div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:10px">Collegamento automatico alla timbratrice: nel pacchetto IT c\'è lo script <b>sync_timbratrice.py</b> che legge gli export della timbratrice e carica le timbrature qui da solo (in automatico ogni pochi minuti, lo configura l\'IT).</p>';
  // inserimento manuale
  h +=
    '<div class="add-tipo-row"><div class="field"><label>Collaboratore</label><select id="timb-collab" style="padding:8px">' +
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
      .map((c) => '<option>' + escP(c.nome) + '</option>')
      .join('') +
    '</select></div>' +
    '<div class="field"><label>Data</label><input type="date" id="timb-data"></div>' +
    '<div class="field"><label>Entrata</label><input type="time" id="timb-entrata"></div>' +
    '<div class="field"><label>Uscita</label><input type="time" id="timb-uscita"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiTimbratura()">+ Registra</button></div>';
  h += '<div id="timb-confronto"></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiTimbratura() {
  if (!puoGestirePiano()) return;
  const nome = (document.getElementById('timb-collab') || {}).value;
  const data = (document.getElementById('timb-data') || {}).value;
  const entrata = (document.getElementById('timb-entrata') || {}).value;
  const uscita = (document.getElementById('timb-uscita') || {}).value;
  if (!nome || !data || !entrata || !uscita) {
    toast('Compila tutti i campi');
    return;
  }
  try {
    await secPost('piano_timbrature', {
      collaboratore: nome,
      data: data,
      ora_entrata: entrata,
      ora_uscita: uscita,
      ore: _pianoOreTimbrataPerGiorno(nome, data, entrata, uscita),
      fonte: 'manuale',
      reparto_dip: _pianoReparto(),
      operatore: getOperatore(),
    });
    logAzione('Timbratura registrata', nome + ' ' + data + ' ' + entrata + '-' + uscita);
    toast('Timbratura registrata');
    caricaConfrontoTimbrature();
  } catch (e) {
    toast('Errore (timbratura già presente per quel giorno?)');
  }
}
async function importaTimbrature(input) {
  if (!_pianoAzioneAutoConsentita('import')) return; // azione automatica: permesso apposito
  if (!(await assicuraLibreria('xlsx'))) return;
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    if (data.length < 2) {
      toast('File vuoto');
      return;
    }
    // riconoscimento colonne (fuzzy, come Turnivo)
    const head = data[0].map((c) => String(c).toLowerCase());
    const trova = (parole) => head.findIndex((c) => parole.some((p) => c.includes(p)));
    const iNome = trova(['nome', 'collaboratore', 'dipendente']);
    const iData = trova(['data', 'giorno', 'date']);
    const iIn = trova(['entrata', 'ingresso', 'inizio', 'in']);
    const iOut = trova(['uscita', 'fine', 'out']);
    if (iNome === -1 || iData === -1 || iIn === -1 || iOut === -1) {
      toast('Colonne non riconosciute: servono nome, data, entrata, uscita');
      return;
    }
    const nomi = collaboratoriCache.filter((c) => c.attivo !== false);
    const matchNome = (n) => {
      const nn = String(n).toLowerCase().trim();
      const parti = nn.split(/\s+/);
      const hit = nomi.find(
        (c) =>
          c.nome.toLowerCase() === nn ||
          c.nome.toLowerCase() === parti.slice().reverse().join(' ') ||
          parti.every((p) => c.nome.toLowerCase().includes(p)),
      );
      return hit ? hit.nome : null;
    };
    const normOra = (v) => {
      if (v instanceof Date)
        return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
      if (typeof v === 'number') {
        const min = Math.round(v * 24 * 60);
        return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
      }
      const m = String(v).match(/(\d{1,2})[:.](\d{2})/);
      return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
    };
    const normData = (v) => {
      if (v instanceof Date) return v.toISOString().substring(0, 10);
      if (typeof v === 'number' && v > 40000)
        return new Date(Math.round((v - 25569) * 86400000)).toISOString().substring(0, 10);
      const m = String(v).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (m)
        return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      const iso = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
      return iso ? iso[0] : null;
    };
    const valide = [];
    const scartate = [];
    data.slice(1).forEach((row) => {
      const nome = matchNome(row[iNome]);
      const dt = normData(row[iData]);
      const oin = normOra(row[iIn]);
      const oout = normOra(row[iOut]);
      if (nome && dt && oin && oout) valide.push({ nome, dt, oin, oout });
      else if (String(row[iNome] || '').trim()) scartate.push(String(row[iNome]));
    });
    if (!valide.length) {
      toast('Nessuna riga valida nel file');
      return;
    }
    if (
      !(await chiediConferma(
        'Importare ' +
          valide.length +
          ' timbrature?' +
          (scartate.length ? '\n(' + scartate.length + ' righe scartate: nome/data non riconosciuti)' : '') +
          '\nLe timbrature già presenti per lo stesso giorno non vengono toccate.',
      ))
    )
      return;
    let ok = 0;
    for (let i = 0; i < valide.length; i += 10) {
      const blocco = valide.slice(i, i + 10);
      const esiti = await Promise.all(
        blocco.map((v) =>
          secPost('piano_timbrature', {
            collaboratore: v.nome,
            data: v.dt,
            ora_entrata: v.oin,
            ora_uscita: v.oout,
            ore: _pianoOreTimbrataPerGiorno(v.nome, v.dt, v.oin, v.oout),
            fonte: 'import',
            reparto_dip: _pianoReparto(),
            operatore: getOperatore(),
          }).then(
            () => 1,
            () => 0,
          ),
        ),
      );
      ok += esiti.reduce((s, x) => s + x, 0);
    }
    logAzione('Timbrature importate', ok + '/' + valide.length + ' da ' + file.name);
    toast(
      'Importate ' +
        ok +
        ' timbrature' +
        (valide.length - ok ? ' (' + (valide.length - ok) + ' duplicate saltate)' : ''),
    );
    caricaConfrontoTimbrature();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file timbrature');
  }
}
async function caricaConfrontoTimbrature() {
  const el = document.getElementById('timb-confronto');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);font-size:var(--fs-sm,.8125rem);padding:6px 0">Caricamento...</p>';
  await _pianoCaricaTimbrature();
  if (!_pianoTimbrature.length) {
    el.innerHTML =
      '<p style="color:var(--muted);font-size:var(--fs-sm,.8125rem);padding:6px 0">Nessuna timbratura per ' +
      _pianoMeseSel +
      '.</p>';
    return;
  }
  // ore pianificate per collaboratore (turni del mese)
  const pianOre = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) pianOre[r.collaboratore] = (pianOre[r.collaboratore] || 0) + _pianoOreDiRiga(r); // come Calendario e Saldo (chiusure tardi, orari propri)
  });
  const timbOre = {};
  const timbGg = {};
  _pianoTimbrature.forEach((t) => {
    timbOre[t.collaboratore] = (timbOre[t.collaboratore] || 0) + (parseFloat(t.ore) || 0);
    timbGg[t.collaboratore] = (timbGg[t.collaboratore] || 0) + 1;
  });
  // pianificato per giorno (per il dettaglio, come timbrate.html di Turnivo)
  const pianoGiorno = {}; // nome|data -> {codice, ore}
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) pianoGiorno[r.collaboratore + '|' + r.data] = { codice: r.codice, ore: _pianoOreDiRiga(r) };
  });
  const perNomeT = {};
  _pianoTimbrature.forEach((t) => (perNomeT[t.collaboratore] = (perNomeT[t.collaboratore] || []).concat(t)));
  let h =
    '<div style="display:flex;margin-top:8px"><input type="text" class="campo-cerca" placeholder="Cerca collaboratore..." aria-label="Cerca collaboratore" oninput="pianoTabellaFiltra(this.value,\'piano-timb-table\')"></div>' +
    '<div style="overflow-x:auto;margin-top:8px"><table class="piano-table" id="piano-timb-table" style="min-width:560px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Giorni timbrati</th><th>Ore timbrate</th><th>Ore pianificate</th><th>Differenza</th></tr></thead><tbody>';
  let iDet = 0;
  ordineCollabPiano(Object.keys(timbOre), _pianoReparto()).forEach((n) => {
    const diff = Math.round((timbOre[n] - (pianOre[n] || 0)) * 10) / 10;
    iDet++;
    h +=
      '<tr data-nome="' +
      escP(n) +
      '" style="cursor:pointer" title="Clicca per il dettaglio dei giorni" onclick="const d=document.getElementById(\'timb-det-' +
      iDet +
      "');d.style.display=d.style.display==='none'?'':'none'\"><td style=\"text-align:left;font-weight:600\">▸ " +
      escP(n) +
      '</td><td>' +
      timbGg[n] +
      '</td><td>' +
      timbOre[n].toFixed(1) +
      '</td><td>' +
      (pianOre[n] || 0).toFixed(1) +
      '</td><td style="font-weight:700;color:' +
      (diff > 0 ? '#2c6e49' : diff < 0 ? '#c0392b' : 'var(--muted)') +
      '">' +
      (diff > 0 ? '+' : '') +
      diff.toFixed(1) +
      '</td></tr>';
    // dettaglio per giorno (chiuso di default, per non fare confusione)
    let det =
      '<table class="piano-table" style="min-width:100%;font-size:var(--fs-sm,.8125rem)"><thead><tr><th>Giorno</th><th>Turno</th><th>Entrata</th><th>Uscita</th><th>Ore eff.</th><th>Ore pian.</th><th>Diff</th><th></th></tr></thead><tbody>';
    (perNomeT[n] || [])
      .slice()
      .sort((x, y) => x.data.localeCompare(y.data))
      .forEach((t) => {
        const p = pianoGiorno[n + '|' + t.data];
        const dg = Math.round(((parseFloat(t.ore) || 0) - (p ? p.ore : 0)) * 100) / 100;
        det +=
          '<tr><td>' +
          t.data.split('-')[2] +
          '</td><td>' +
          escP(p ? p.codice : '-') +
          '</td><td>' +
          escP((t.ora_entrata || '').substring(0, 5)) +
          '</td><td>' +
          escP((t.ora_uscita || '').substring(0, 5)) +
          '</td><td style="font-weight:700">' +
          (parseFloat(t.ore) || 0).toFixed(2) +
          '</td><td>' +
          (p ? p.ore.toFixed(2) : '') +
          '</td><td style="color:' +
          (dg > 0 ? '#2c6e49' : dg < 0 ? '#c0392b' : 'var(--muted)') +
          '">' +
          (dg > 0 ? '+' : '') +
          dg.toFixed(2) +
          '</td><td><button class="btn-del-tipo" onclick="eliminaTimbratura(' +
          t.id +
          ')">Elimina</button></td></tr>';
      });
    det += '</tbody></table>';
    h +=
      '<tr id="timb-det-' +
      iDet +
      '" style="display:none"><td colspan="5" style="padding:6px 10px;background:var(--paper2)">' +
      det +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:6px">Differenza = timbrate − pianificate del mese (' +
    _pianoMeseSel +
    ', ' +
    escP(repartoLabel(_pianoReparto())) +
    ')</p>';
  el.innerHTML = h;
}

// ================================================================
// STATISTICHE ANNUALI + PANORAMICA MESI (come Turnivo cap. 7.4 e 20)
// ================================================================
function _renderPianoStatCard() {
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Statistiche anno e panoramica mesi</div><div style="padding:10px 14px" id="piano-stat-body">' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 12px" onclick="caricaStatisticheAnnoPiano(true)">Ricarica statistiche ' +
    _pianoMeseSel.split('-')[0] +
    '</button><div id="piano-stat-anno"></div></div></div>' +
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Confronto anni · ' +
    escP(repartoLabel(_pianoReparto())) +
    '<span id="piano-confronto-sel"></span></div>' +
    '<div style="padding:10px 14px" id="piano-confronto-anni"><p style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Caricamento confronto...</p></div></div>'
  );
}
// due anni QUALSIASI, scelti liberamente dalle tendine (non solo adiacenti)
function _pianoConfrontoSelHtml() {
  const annoBase = parseInt(_pianoMeseSel.split('-')[0]);
  const a = window._pianoConfrontoAnno || annoBase;
  const b = window._pianoConfrontoAnnoB != null ? window._pianoConfrontoAnnoB : a - 1;
  const opt = (sel) => {
    let s = '';
    for (let y = annoBase + 1; y >= annoBase - 8; y--)
      s += '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>' + y + '</option>';
    return s;
  };
  return (
    '<label style="font-size:var(--fs-sm,.8125rem);font-weight:400">confronta <select onchange="window._pianoConfrontoAnnoB=parseInt(this.value);caricaConfrontoAnniPiano()" style="padding:3px 6px;font-size:var(--fs-sm,.8125rem);border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">' +
    opt(b) +
    '</select> con <select onchange="window._pianoConfrontoAnno=parseInt(this.value);caricaConfrontoAnniPiano()" style="padding:3px 6px;font-size:var(--fs-sm,.8125rem);border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">' +
    opt(a) +
    '</select></label>'
  );
}
// Aggregati di un anno del settore corrente, per il confronto anno su anno
async function _pianoAggregatiAnno(anno) {
  const righe =
    (await secGet(
      'piano?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=40000',
    )) || [];
  const tot = {
    ore: 0,
    oreTimb: 0,
    collab: new Set(),
    jolly: new Set(),
    mal: 0,
    weekend: 0,
    domeniche: 0,
    vac: 0,
    cgf: 0,
    mesi: new Set(),
  };
  righe.forEach((r) => {
    const cod = r.codice;
    if (!cod) return;
    tot.mesi.add(String(r.data).substring(0, 7));
    const info = _pianoCollabInfo(r.collaboratore) || {};
    tot.ore += _pianoOreDiRiga(r, parseFloat(info.percentuale) || 1);
    if (cod === 'M' || cod === 'M1') {
      tot.mal++;
      return;
    }
    if (cod === 'V') {
      tot.vac++;
      return;
    }
    if (cod === 'CGF') {
      tot.cgf++;
      return;
    }
    if (!_pianoTurnoInfo(cod)) return;
    tot.collab.add(r.collaboratore);
    if (info.is_jolly || info.impiego === 'jolly') tot.jolly.add(r.collaboratore);
    const gw = new Date(r.data + 'T12:00:00').getDay();
    if (gw === 0) {
      tot.domeniche++;
      tot.weekend++;
    } else if (gw === 6) tot.weekend++;
  });
  const nomiSettore = tot.collab;
  const timb =
    (await secGet('piano_timbrature?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=20000')) || [];
  timb.forEach((t) => {
    if (nomiSettore.has(t.collaboratore)) tot.oreTimb += parseFloat(t.ore) || 0;
  });
  return tot;
}
async function caricaConfrontoAnniPiano() {
  const el = document.getElementById('piano-confronto-anni');
  if (!el) return;
  const selBox = document.getElementById('piano-confronto-sel');
  if (selBox) selBox.innerHTML = _pianoConfrontoSelHtml();
  const anno = window._pianoConfrontoAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const annoB = window._pianoConfrontoAnnoB != null ? window._pianoConfrontoAnnoB : anno - 1;
  el.innerHTML =
    '<p style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Caricamento confronto ' +
    annoB +
    ' / ' +
    anno +
    '...</p>';
  try {
    const [prec, corr] = await Promise.all([_pianoAggregatiAnno(annoB), _pianoAggregatiAnno(anno)]);
    const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('de-CH');
    // verso: +1 se crescere e' positivo (verde), -1 se e' negativo (rosso,
    // es. malattie), 0 se neutro (grigio)
    const voci = [
      ['Ore pianificate', prec.ore, corr.ore, 1, f1],
      ['Ore timbrate', prec.oreTimb, corr.oreTimb, 1, f1],
      ['Collaboratori con turni', prec.collab.size, corr.collab.size, 1, (v) => v],
      ['di cui jolly', prec.jolly.size, corr.jolly.size, 0, (v) => v],
      ['Giorni di malattia', prec.mal, corr.mal, -1, (v) => v],
      ['Weekend lavorati (turni sab+dom)', prec.weekend, corr.weekend, 0, (v) => v],
      ['di cui domeniche', prec.domeniche, corr.domeniche, 0, (v) => v],
      ['Giorni di vacanza (V)', prec.vac, corr.vac, 0, (v) => v],
      ['Recuperi festivi goduti (CGF)', prec.cgf, corr.cgf, 0, (v) => v],
    ];
    let h =
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Confronto sui piani presenti in archivio: ' +
      annoB +
      ' (' +
      prec.mesi.size +
      ' mesi) contro ' +
      anno +
      ' (' +
      corr.mesi.size +
      ' mesi). Se un anno ha meno mesi pianificati, il confronto va letto di conseguenza.</p>';
    h +=
      '<div style="overflow-x:auto"><table class="piano-table" style="min-width:560px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Voce</th><th>' +
      annoB +
      '</th><th>' +
      anno +
      '</th><th>Differenza</th></tr></thead><tbody>';
    voci.forEach(([label, a, b, verso, fmt]) => {
      const d = Math.round((b - a) * 10) / 10;
      const colD = d === 0 || verso === 0 ? 'var(--muted)' : d * verso > 0 ? '#2c6e49' : '#c0392b';
      const pct = a > 0 ? Math.round((d / a) * 100) : null;
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        label +
        '</td><td>' +
        fmt(a) +
        '</td><td>' +
        fmt(b) +
        '</td><td style="color:' +
        colD +
        ';font-weight:700">' +
        (d > 0 ? '+' : '') +
        fmt(d) +
        (pct != null && d !== 0 ? ' (' + (pct > 0 ? '+' : '') + pct + '%)' : '') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
  } catch (e) {
    el.innerHTML =
      '<p style="color:var(--accent);font-size:var(--fs-sm,.8125rem)">Errore confronto: ' +
      escP(e.message || '') +
      '</p>';
  }
}
// Filtro mese della scheda Statistiche: '' = tutto l'anno, altrimenti 'AAAA-MM'.
// Cambiarlo non ricarica niente dal server e non tocca il mese del calendario:
// i dati dell'anno sono gia' in memoria, si mostra solo la fetta scelta.
function pianoStatMese(ym) {
  window._pianoStatMese = ym || '';
  caricaStatisticheAnnoPiano();
}
// Porta il calendario sul mese che si sta guardando nelle statistiche.
function pianoStatApriMese() {
  const ym = window._pianoStatMese;
  if (!ym) return;
  _pianoMeseSel = ym;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  pianoCambiaTab('calendario');
}
async function caricaStatisticheAnnoPiano(forza) {
  // malattie dell anno per le ore di malattia (giorno 1-14 o dal 15.)
  if (typeof _pianoCaricaMalattieAnno === 'function')
    await _pianoCaricaMalattieAnno(parseInt(String(_pianoMeseSel).substring(0, 4)));
  const el = document.getElementById('piano-stat-anno');
  if (!el) return;
  const anno = _pianoMeseSel.split('-')[0];
  const rep = _pianoReparto();
  const c = window._pianoStatCache;
  if (forza || !c || c.anno !== anno || c.reparto !== rep) {
    el.innerHTML =
      '<p style="color:var(--muted);font-size:var(--fs-sm,.8125rem);padding:6px 0">Caricamento anno...</p>';
    // le festivita dell anno servono per i turni con orario prolungato
    await _pianoCaricaFestivita(parseInt(anno));
    await _pianoCaricaCgfRiporto(anno); // riporto CGF dall'anno prima, per il saldo
    const rg =
      (await secGet(
        'piano?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&reparto_dip=eq.' + rep + '&limit=20000',
      )) || [];
    _pianoRegistraGiorniTurno(rg);
    const fb =
      (await secGet(
        'piano_fabbisogni?data=gte.' +
          anno +
          '-01-01&data=lte.' +
          anno +
          '-12-31&reparto_dip=eq.' +
          rep +
          '&limit=5000',
      )) || [];
    const rc =
      (await secGet(
        'piano_recupero_ore?data=gte.' +
          anno +
          '-01-01&data=lte.' +
          anno +
          '-12-31&reparto_dip=eq.' +
          _pianoReparto() +
          '&limit=20000',
      )) || [];
    const rt =
      (await secGet('piano_ore_mese?anno_mese=gte.' + anno + '-01&anno_mese=lte.' + anno + '-12&limit=5000')) || [];
    window._pianoStatCache = { anno: anno, reparto: rep, righe: rg, fabb: fb, rec: rc, rett: rt };
  }
  const cache = window._pianoStatCache;
  // il filtro vale solo dentro l'anno che si sta guardando
  const meseFiltro =
    window._pianoStatMese && String(window._pianoStatMese).substring(0, 4) === anno ? window._pianoStatMese : '';
  window._pianoStatMese = meseFiltro;
  const righe = meseFiltro ? cache.righe.filter((r) => String(r.data).substring(0, 7) === meseFiltro) : cache.righe;
  const fabb = cache.fabb;
  // panoramica mesi
  const mesiDati = {};
  cache.righe.forEach((r) => (mesiDati[r.data.substring(5, 7)] = (mesiDati[r.data.substring(5, 7)] || 0) + 1));
  const mesiFabb = {};
  fabb.forEach((f) => (mesiFabb[f.data.substring(5, 7)] = true));
  // I mesi sono un FILTRO della tabella qui sotto, non un salto nel calendario:
  // prima cliccarli cambiava il mese del piano e ricaricava tutto, e i numeri
  // restavano quelli dell'anno intero. Ora si vede il mese scelto.
  const _attivo = 'border-color:var(--c-verde,#2c6e49);background:#2c6e49;color:#fff;font-weight:700';
  let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;align-items:center">';
  h +=
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;' +
    (meseFiltro ? '' : _attivo) +
    '" onclick="pianoStatMese(\'\')">Anno intero</button>';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const ha = mesiDati[mm];
    const sel = meseFiltro === anno + '-' + mm;
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;' +
      (sel
        ? _attivo
        : ha
          ? 'border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49);font-weight:700'
          : 'color:var(--muted)') +
      '" onclick="pianoStatMese(\'' +
      anno +
      '-' +
      mm +
      '\')">' +
      (MESI[m - 1] || mm) +
      (ha ? ' (' + ha + ')' : '') +
      (mesiFabb[mm] ? ' <span style="color:#d4b86a">F</span>' : '') +
      '</button>';
  }
  if (meseFiltro)
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="pianoStatApriMese()">Apri ' +
      (MESI[parseInt(meseFiltro.substring(5, 7)) - 1] || '') +
      ' nel calendario</button>';
  h += '</div>';
  // statistiche per collaboratore
  const st = {};
  // CGF: si contano solo fino alla fine del mese aperto nel Piano (mai i mesi
  // futuri gia' pianificati), come nella bozza e in "Chi ha diritto"
  const _cgfFinoA =
    String(anno) < _pianoMeseSel.substring(0, 4)
      ? anno + '-12-31'
      : String(anno) > _pianoMeseSel.substring(0, 4)
        ? anno + '-00-00'
        : _pianoMeseSel + '-' + String(_pianoUltimoGiorno(_pianoMeseSel)).padStart(2, '0');
  // malattie di tutto l'anno: un CGF che cade in malattia non e' goduto
  const malattieAnno = {};
  for (let m = 1; m <= 12; m++)
    Object.assign(malattieAnno, _pianoMalattieMese(anno + '-' + String(m).padStart(2, '0')));
  const mesiConPiano = new Set(righe.map((r) => r.data.substring(5, 7)));
  righe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    const cs = _pianoCodiceInfo(r.codice);
    const o = (st[r.collaboratore] = st[r.collaboratore] || {
      ore: 0,
      gg: 0,
      d: 0,
      n: 0,
      we: 0,
      dom: 0,
      v: 0,
      m: 0,
      cgfMat: 0,
      cgfGod: 0,
      cgfPersi: 0,
      sup50: 0,
      oreNotte: 0,
      oreLav: 0,
    });
    const dow = new Date(r.data + 'T12:00:00').getDay();
    const info = _pianoCollabInfo(r.collaboratore) || {};
    const _mese = String(r.data).substring(0, 7);
    const _addMese = (q) => {
      if (!o.perMese) o.perMese = {};
      o.perMese[_mese] = (o.perMese[_mese] || 0) + q;
    };
    if (t) {
      // stesse ore del Calendario e del Saldo: prolungamento nei giorni di
      // chiusura tardi e orari personalizzati della cella (prima durata fissa)
      const _oT = _pianoOreDiRiga(r, parseFloat(info.percentuale) || 1);
      o.ore += _oT;
      _addMese(_oT);
      o.gg++;
      if (t.tipo === 'NOTTURNO') o.n++;
      else o.d++;
      if (_pianoGiorniWeekend().includes(dow)) o.we++;
      if (dow === 0) o.dom++;
      // CGF MATURATO: ha lavorato in un festivo con flag CGF (automatico)
      const fest = pianoFestiviCache.find((f) => f.data === r.data);
      // DUE MONDI SEPARATI:
      // FISSI (RAP 4.3): recupero CGF sui festivi con il flag attivo, esclusi
      // quelli che cadono di domenica.
      if (
        _pianoFestivoDaCgf(fest) &&
        _pianoMaturaCgf(info) &&
        String(r.data) <= _cgfFinoA &&
        !malattieAnno[r.collaboratore + '|' + r.data]
      )
        o.cgfMat++;
      // AUSILIARI/JOLLY (RAP Allegato 1): supplemento del 50% sul salario orario
      // per i NOVE festivi parificati alle domeniche. Lista fissa che non cambia
      // di anno in anno, e vale SEMPRE, anche quando il festivo cade di domenica.
      if (fest && !_pianoMaturaCgf(info) && _pianoFestivoParificato(fest)) o.sup50++;
      // ore di lavoro notturno degli ausiliari: il 10% matura come tempo
      // libero pagato (RAP Allegato 1)
      if (!_pianoMaturaCgf(info)) o.oreNotte += _pianoOreNotturneTurno(t);
      // ore realmente lavorate: base per le indennita' degli ausiliari
      o.oreLav += _pianoOreEffettiveTurno(t, r);
    } else if (cs) {
      if (r.codice === 'V' || r.codice === 'V1') o.v++;
      if (r.codice === 'M' || r.codice === 'M1') o.m++;
      // CGF goduto, ma se quel giorno c'e' malattia il recupero non e' stato
      // goduto e il credito resta (come per le vacanze)
      if (r.codice === 'CGF' && String(r.data) <= _cgfFinoA) {
        if (malattieAnno[r.collaboratore + '|' + r.data]) o.cgfPersi++;
        else o.cgfGod++;
      }
      const _oCs = _pianoOreSpecialeDelGiorno(r, cs, info);
      o.ore += _oCs;
      _addMese(_oCs);
    }
  });
  // ORE REALI SCRITTE A MANO: dove esistono, sostituiscono le ore del piano di
  // quel mese, cosi' le statistiche dell'anno dicono lo stesso numero del saldo
  // e del calendario. Un dato solo, in tutto il programma.
  // scostamenti giornalieri dell'anno: entrano nelle ore, mese per mese
  const recStat = meseFiltro ? cache.rec.filter((x) => String(x.data).substring(0, 7) === meseFiltro) : cache.rec;
  recStat.forEach((x) => {
    const o = st[x.collaboratore];
    if (!o) return;
    const meseK = String(x.data).substring(0, 7);
    const v = parseFloat(x.ore) || 0;
    o.ore = Math.round((o.ore + v) * 100) / 100;
    if (!o.perMese) o.perMese = {};
    o.perMese[meseK] = (o.perMese[meseK] || 0) + v;
  });
  const rettAnno = meseFiltro ? cache.rett.filter((x) => x.anno_mese === meseFiltro) : cache.rett;
  rettAnno.forEach((x) => {
    const o = st[x.collaboratore];
    if (!o || !o.perMese) return;
    const pian = o.perMese[x.anno_mese] || 0;
    o.ore = Math.round((o.ore - pian + (parseFloat(x.ore_reali) || 0)) * 100) / 100;
    o.rettifiche = (o.rettifiche || 0) + 1;
  });

  // ore dovute sull'anno: solo sui mesi che hanno un piano (come confronto sensato)
  let ggDovuti = 0;
  mesiConPiano.forEach((mm) => (ggDovuti += new Date(parseInt(anno), parseInt(mm), 0).getDate()));
  const dovuteDi = (nome) => {
    const info = _pianoCollabInfo(nome) || {};
    if (info.is_jolly) return 0;
    let gg = 0; // giorni dei mesi con piano, meno i giorni di congedo non pagato
    mesiConPiano.forEach((mm) => (gg += _pianoGgDovuti(nome, anno + '-' + mm)));
    return Math.round((gg / 7) * _pianoOreSett * (parseFloat(info.percentuale) || 1) * 10) / 10;
  };
  // saldo CGF = riporto dall'anno prima + maturati - goduti (stessa contabilita' della bozza)
  Object.keys(st).forEach((n) => {
    const rip = _pianoCgfRiporto[n + '|' + anno];
    st[n].cgfRip = rip ? parseInt(rip.riporto) || 0 : 0;
    st[n].cgfSaldo = st[n].cgfRip + st[n].cgfMat - st[n].cgfGod;
  });
  h +=
    '<div style="display:flex;padding:6px 0"><input type="text" class="piano-cerca campo-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-statanno-table\')"></div>';
  h +=
    '<div style="overflow-x:auto"><table id="piano-statanno-table" class="piano-table" style="min-width:760px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Ore ' +
    (meseFiltro ? escP(MESI[parseInt(meseFiltro.substring(5, 7)) - 1] || meseFiltro) : 'anno') +
    '</th><th title="Sui mesi con un piano">Ore dovute</th><th>Giorni lavorati</th><th>Diurni</th><th>Notturni</th><th>Weekend</th><th>Domeniche</th><th>Vacanze</th><th>Malattie</th><th title="Festivi con diritto lavorati, non in malattia, fino alla fine del mese aperto nel Piano (solo personale fisso)">CGF maturati</th><th title="Giorni CGF effettivamente goduti (quelli caduti in malattia non contano)">CGF goduti</th><th title="Riporto dall anno prima + maturati - goduti: quanti recuperi restano da dare">Saldo CGF</th><th title="Festivi parificati alle domeniche lavorati dagli ausiliari (jolly): danno diritto al supplemento del 50% sul salario orario lordo (RAP Allegato 1). Sono nove giorni fissi e valgono anche di domenica">Suppl. 50%</th><th title="Ore lavorate nella fascia notturna (23:00-06:00). Il supplemento del 10% e gia compreso nella durata dei turni: questa colonna serve da controllo, non e un credito da dare a parte">Ore notte</th><th title="Solo ausiliari (jolly): ore effettivamente lavorate nell anno e indennita calcolate su quel totale secondo il RAP Allegato 1 (vacanze 8.33% con 4 settimane o 10.65% con 5, tredicesima 8.33%). I jolly non hanno una percentuale contrattuale: tutto si calcola sulle ore fatte">Ore lavorate · indennita</th></tr></thead><tbody>';
  ordineCollabPiano(Object.keys(st), _pianoReparto()).forEach((n) => {
    const o = st[n];
    const info = _pianoCollabInfo(n) || {};
    h +=
      '<tr data-nome="' +
      escP(n) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(n) +
      '</td><td' +
      (o.rettifiche
        ? ' title="Comprende ' +
          o.rettifiche +
          (o.rettifiche === 1 ? ' mese con ore reali scritte a mano"' : ' mesi con ore reali scritte a mano"')
        : '') +
      '>' +
      o.ore.toFixed(1) +
      (o.rettifiche ? '<span class="piano-rett">*</span>' : '') +
      '</td><td style="color:var(--muted)">' +
      (dovuteDi(n) ? dovuteDi(n).toFixed(1) : '-') +
      '</td><td>' +
      o.gg +
      '</td><td>' +
      o.d +
      '</td><td>' +
      o.n +
      '</td><td' +
      (o.we > 20
        ? ' style="color:var(--c-rosso,#c0392b);font-weight:700"'
        : o.we >= 12
          ? ' style="color:var(--c-oro,#8b6914);font-weight:700"'
          : '') +
      '>' +
      o.we +
      '</td><td>' +
      o.dom +
      '</td><td>' +
      o.v +
      '</td><td>' +
      o.m +
      '</td><td>' +
      (o.cgfMat || '') +
      '</td><td' +
      (o.cgfPersi ? ' title="' + o.cgfPersi + ' recuperi caduti in malattia: restano a credito"' : '') +
      '>' +
      (o.cgfGod || '') +
      (o.cgfPersi
        ? ' <span style="color:var(--c-rosso,#c0392b);font-size:var(--fs-sm,.8125rem)">+' +
          o.cgfPersi +
          ' in malattia</span>'
        : '') +
      '</td><td style="font-weight:700;color:' +
      (o.cgfSaldo > 0 ? '#2c6e49' : o.cgfSaldo < 0 ? '#c0392b' : 'var(--muted)') +
      '"' +
      (o.cgfRip ? ' title="Riporto dall anno prima: ' + o.cgfRip + '"' : '') +
      '>' +
      (o.cgfMat || o.cgfGod || o.cgfRip ? o.cgfSaldo : '') +
      '</td><td style="font-weight:700;color:' +
      (o.sup50 ? '#8b6914' : 'var(--muted)') +
      '" title="Festivi parificati lavorati come personale ausiliario">' +
      (o.sup50 || '') +
      '</td><td style="font-weight:700;color:' +
      (o.oreNotte ? '#1a4a7a' : 'var(--muted)') +
      '" title="' +
      (o.oreNotte
        ? Math.round(o.oreNotte * 10) / 10 +
          'h nella fascia notturna: il supplemento del 10% (' +
          _pianoNotteRecupero(o.oreNotte) +
          "h) e' gia' compreso nelle ore dei turni"
        : '') +
      '">' +
      (o.oreNotte ? Math.round(o.oreNotte * 10) / 10 + 'h' : '') +
      '</td><td style="font-weight:700;color:' +
      (!_pianoMaturaCgf(info) && o.oreLav ? '#8b6914' : 'var(--muted)') +
      '" title="' +
      (!_pianoMaturaCgf(info) && o.oreLav ? _pianoIndennitaJolly(o.oreLav) : '') +
      '">' +
      (!_pianoMaturaCgf(info) && o.oreLav ? Math.round(o.oreLav * 10) / 10 + 'h' : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:6px">Weekend: giallo da 12, rosso oltre 20 (equità). Click su un mese per vedere solo quel mese, "Anno intero" per tornare al totale.</p>';
  el.innerHTML = h;
}

// ================================================================
// IMPORT VACANZE DA EXCEL (col A cognome, col B nome, col F-BE = settimane 1-52 con X)
// ================================================================
// ================================================================
// TAB VACANZE · identica alla pagina Vacanze di Turnivo: settimane ISO
// per collaboratore per anno, conferma, elimina, import Excel,
// applicazione V+C+WD al piano (port di step_vacanze.py)
// ================================================================
let _pianoVacCache = [];
function _vacDateSettimana(anno, settimana) {
  const gg = _pianoGiorniSettimana(anno, settimana);
  const f = (x) => x.split('-')[2] + '/' + x.split('-')[1];
  return 'dal ' + f(gg[0]) + ' al ' + f(gg[6]);
}
// GIORNI DI VACANZA SPETTANTI (personale fisso): quanti ne matura ciascuno
// nell'anno secondo anzianita', e quanti ne ha gia' pianificati nel piano.
function _pianoVacCfg() {
  return {
    base1: parseFloat(_pianoRegolaVal('vacanze_giorni_primi2anni')) || 28,
    base2: parseFloat(_pianoRegolaVal('vacanze_giorni_base')) || 35,
    bonus: [
      { anni: 10, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_10anni')) || 1 },
      { anni: 15, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_15anni')) || 2 },
      { anni: 20, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_20anni')) || 3 },
      { anni: 25, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_25anni')) || 4 },
      { anni: 30, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_30anni')) || 5 },
    ],
    // arrotondamento al giorno pieno: dalla soglia in su si sale (32.67 -> 33,
    // 32.37 -> 33), sotto si resta al giorno intero (32.3 -> 32)
    arrotondaDa: _pianoRegolaVal('vacanze_arrotonda_da') != null ? _pianoRegolaVal('vacanze_arrotonda_da') : 0.35,
  };
}
async function _pianoVacDirittoCard(anno) {
  const cfg = _pianoVacCfg();
  // GIORNI GIA' PIANIFICATI: le settimane registrate per l'anno in questa
  // scheda, contate giorno per giorno (una settimana intera vale 7 giorni, come
  // i 35 giorni di diritto che sono 5 settimane). Prima si contavano le V del
  // SOLO mese aperto nel calendario, e "Restano" cambiava numero a ogni mese.
  const gia = {};
  const pianif = await _vacPianificateNellAnno(anno);
  Object.keys(pianif).forEach((n) => (gia[n] = pianif[n].giorni));
  // Colonna di controllo: le V davvero scritte nel calendario dell'anno. Se il
  // numero non corrisponde alle settimane, vuol dire che "Applica al piano" non
  // e' ancora stato fatto per tutti i mesi.
  const vCal = {};
  (
    (await secGet(
      'piano?codice=eq.V&data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&select=collaboratore,data&limit=20000',
    )) || []
  ).forEach((r) => (vCal[r.collaboratore] = (vCal[r.collaboratore] || 0) + 1));
  // vacanze restituite: giorni V coperti da una malattia (M con "Ex V" o, nelle note vecchie, "era V")
  const vRest = await _vacRestituiteNellAnno(anno);
  const righe = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c) && c.data_assunzione)
    .map((c) => ({
      c: c,
      r: PianoRegole.giorniVacanzaSpettanti(String(c.data_assunzione).substring(0, 10), anno, {
        ...cfg,
        giorniCongedo: _pianoCongedoNpEffetti(c.nome, anno).giorniVacanze,
        giorniAnzianita: _pianoCongedoNpEffetti(c.nome, anno).giorniAnzianita,
      }),
    }))
    .filter((x) => x.r)
    .sort((a, b2) => a.c.nome.localeCompare(b2.c.nome));
  const senzaData = collaboratoriCache.filter(
    (c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c) && !c.data_assunzione,
  ).length;
  let h =
    '<div class="main-card" style="margin-bottom:14px"><div class="card-header">Giorni di vacanza spettanti ' +
    anno +
    ' · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Primi due anni ' +
    cfg.base1 +
    ' giorni, poi ' +
    cfg.base2 +
    '; nell anno del passaggio si matura mese per mese. Giorni in piu per anzianita UNA VOLTA SOLA, nell anno dell anniversario (l anno dopo si torna a ' +
    cfg.base2 +
    '): 10 anni +' +
    cfg.bonus[0].giorni +
    ', 15 anni +' +
    cfg.bonus[1].giorni +
    ', 20 anni +' +
    cfg.bonus[2].giorni +
    ', 25 anni +' +
    cfg.bonus[3].giorni +
    ', 30 anni +' +
    cfg.bonus[4].giorni +
    '. Gli ausiliari non compaiono: hanno l indennita in percentuale sulle ore.</p>';
  if (!righe.length) {
    h +=
      '<p style="font-size:var(--fs-md,.875rem)">Nessun calcolo possibile: manca la data di inizio contratto nelle schede.</p></div></div>';
    return h;
  }
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:640px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>In servizio dal</th><th>Anni</th><th>Spettanti</th><th title="Giorni delle settimane registrate qui sotto per l anno">Pianificati</th><th title="Giorni V davvero scritti nel calendario dell anno: se sono meno delle settimane registrate, manca Applica al piano per qualche mese">V nel calendario</th><th title="Giorni di vacanza coperti da una malattia registrata nel Diario: la V e diventata M e il giorno torna disponibile">Restituite per malattia</th><th>Restano</th></tr></thead><tbody>';
  righe.forEach((x) => {
    const dal = String(x.c.data_assunzione).substring(0, 10);
    const anni = Math.floor((new Date(anno, 11, 31) - new Date(dal + 'T12:00:00')) / (365.25 * 86400000));
    const pian = gia[x.c.nome] || 0;
    const inCal = vCal[x.c.nome] || 0;
    const rest = vRest[x.c.nome] || 0;
    const resta = Math.round((x.r.giorni - pian + rest) * 10) / 10;
    h +=
      '<tr title="' +
      x.r.base +
      ' giorni di base' +
      (x.r.bonus
        ? ' + ' +
          x.r.bonus +
          ' per anzianita (' +
          x.r.voci.map((v) => v.anni + ' anni, solo nel ' + v.dal).join(', ') +
          ')'
        : '') +
      (x.r.giorniEsatti != null && x.r.giorniEsatti !== x.r.giorni
        ? ' · esatti ' + x.r.giorniEsatti + ', arrotondati a ' + x.r.giorni
        : '') +
      '" data-nome="' +
      escP(x.c.nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(x.c.nome) +
      '</td><td>' +
      dal.split('-').reverse().join('.') +
      '</td><td>' +
      anni +
      '</td><td style="font-weight:700">' +
      x.r.giorni +
      '</td><td>' +
      (pian || '') +
      '</td><td style="color:' +
      (pian && inCal !== pian ? '#8b6914' : 'var(--muted)') +
      '" title="' +
      (pian && inCal !== pian ? 'Registrate ' + pian + ' giornate, nel calendario ce ne sono ' + inCal : '') +
      '">' +
      (inCal || '') +
      '</td><td style="color:var(--c-verde,#2c6e49);font-weight:' +
      (rest ? '700' : '400') +
      '">' +
      (rest || '') +
      '</td><td style="font-weight:700;color:' +
      (resta > 0 ? '#8b6914' : resta < 0 ? '#c0392b' : '#2c6e49') +
      '">' +
      resta +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  if (senzaData)
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--c-rosso,#c0392b);margin-top:8px">' +
      senzaData +
      ' collaboratori non compaiono perche manca la data di inizio contratto nella loro scheda.</p>';
  // AVVISO DI OTTOBRE: quando si pianificano le vacanze dell'anno dopo serve
  // sapere in anticipo chi cambia scaglione, per non assegnare giorni sbagliati
  const mese = new Date().getMonth() + 1;
  const annoOggi = new Date().getFullYear();
  if (mese >= 10 && anno === annoOggi) {
    const cambi = righe
      .map((x) => {
        const pros = PianoRegole.giorniVacanzaSpettanti(String(x.c.data_assunzione).substring(0, 10), anno + 1, {
          ...cfg,
          giorniCongedo: _pianoCongedoNpEffetti(x.c.nome, anno + 1).giorniVacanze,
          giorniAnzianita: _pianoCongedoNpEffetti(x.c.nome, anno + 1).giorniAnzianita,
        });
        // si segnala solo chi SUPERA la base dei primi due anni: chi arriva a 28
        // sta semplicemente completando l'anno intero, non e' una novita' da
        // tenere presente per la pianificazione
        return pros && pros.giorni > x.r.giorni && pros.giorni > cfg.base1
          ? { nome: x.c.nome, da: x.r.giorni, a: pros.giorni, diff: Math.round((pros.giorni - x.r.giorni) * 10) / 10 }
          : null;
      })
      .filter(Boolean)
      .sort((p, q) => q.diff - p.diff);
    if (cambi.length)
      h +=
        '<div style="margin-top:12px;padding:10px 12px;background:#fff8e1;border-left:4px solid #b8860b;border-radius:3px">' +
        '<b style="font-size:var(--fs-base,.9375rem)">Da tenere presente per il ' +
        (anno + 1) +
        '</b><p style="font-size:var(--fs-md,.875rem);margin:4px 0 0">Nel pianificare le vacanze del prossimo anno, ' +
        cambi.length +
        (cambi.length === 1 ? ' collaboratore avra' : ' collaboratori avranno') +
        ' piu giorni:</p><ul style="margin:6px 0 0 18px;font-size:var(--fs-md,.875rem)">' +
        cambi
          .map(
            (x) =>
              '<li><b>' + escP(x.nome) + '</b>: da ' + x.da + ' a <b>' + x.a + '</b> giorni (+' + x.diff + ')</li>',
          )
          .join('') +
        '</ul></div>';
  }
  h += '</div></div>';
  return h;
}
// ricerca nella scheda Vacanze: per nome o numero di settimana
function vacanzeCerca(q) {
  const t = String(q || '')
    .trim()
    .toLowerCase();
  document.querySelectorAll('.vac-blocco').forEach((b) => {
    b.hidden = !!t && !b.dataset.cerca.split(' ').some((w) => w.startsWith(t)) && !b.dataset.cerca.includes(t);
  });
}
async function _renderPianoVacanzeTab() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  window._pianoVacAnno = anno;
  _pianoVacCache =
    (await secGet('piano_vacanze?anno=eq.' + anno + '&order=collaboratore.asc,settimana.asc&limit=2000')) || [];
  const puoMod = puoGestirePiano();
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  // ogni settore vede SOLO le vacanze dei propri collaboratori
  _pianoVacCache = _pianoVacCache.filter((v) => nomiRep.includes(v.collaboratore));
  const filtro = window._pianoVacFiltro || '';
  const vac = filtro ? _pianoVacCache.filter((v) => v.collaboratore === filtro) : _pianoVacCache;
  // ordine come nel piano (ordine salvato, poi SUP/BO/altri)
  const perCollab = {};
  vac.forEach((v) => (perCollab[v.collaboratore] = (perCollab[v.collaboratore] || []).concat(v)));
  const gruppi = ordineCollabPiano(Object.keys(perCollab), _pianoReparto());
  const MESI_L = MESI_FULL || [];
  const meseLbl = (MESI_L[parseInt(_pianoMeseSel.split('-')[1]) - 1] || '') + ' ' + _pianoMeseSel.split('-')[0];

  let h =
    (await _pianoVacDirittoCard(anno)) +
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Vacanze ' +
    anno +
    ' (' +
    vac.length +
    ')';
  h +=
    '<select onchange="window._pianoVacAnno=parseInt(this.value);renderPiano()" style="padding:4px 8px;font-size:var(--fs-sm,.8125rem);border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
  for (let a = 2025; a <= 2031; a++)
    h += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  h += '</select>';
  h +=
    '<select onchange="window._pianoVacFiltro=this.value;renderPiano()" style="padding:4px 8px;font-size:var(--fs-sm,.8125rem);border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a;max-width:220px"><option value="">Tutti i collaboratori</option>' +
    nomiRep
      .map((n) => '<option value="' + escP(n) + '"' + (filtro === n ? ' selected' : '') + '>' + escP(n) + '</option>')
      .join('') +
    '</select>';
  if (puoMod) {
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="apriNuovaVacanza()">Nuova vacanza</button>';
    // importa, applica al piano ed elimina tutte: azioni automatiche (permesso apposito)
    const _auto = puoAzioniAutoPiano('vacanze');
    const _cancella = puoAzioniAutoPiano('cancella');
    h +=
      (_auto
        ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:#d4b86a;color:#d4b86a" onclick="document.getElementById(\'vac-file\').click()">Importa (Excel o PDF)</button>' +
          '<input type="file" id="vac-file" accept=".xlsx,.xls,.pdf" style="display:none" onchange="importaVacanzePiano(this)">'
        : '') +
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" title="Scarica il piano vacanze del settore nello stesso formato del file HR" onclick="esportaVacanzeExcel()">Scarica Excel</button>' +
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-blu,#1a4a7a);color:#7ea8d8" onclick="esportaVacanzePdf()">Scarica PDF</button>';
    if (_auto)
      h +=
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-blu,#1a4a7a);color:#7ea8d8" onclick="applicaVacanzePiano()">Applica al piano · ' +
        escP(meseLbl) +
        '</button>';
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-viola,#7b2d8b);color:#b07cc7" onclick="apriScambioSettimane()">Scambia settimane</button>';
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-viola,#7b2d8b);color:#b07cc7" onclick="pdfCambioVacanza()">Formulario cambio vacanza</button>';
    if (_cancella)
      h +=
        '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--accent);color:var(--accent)" onclick="eliminaTutteVacanze()">Elimina tutte</button>';
  }
  h += '</div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);padding:8px 14px 0">Le vacanze sono settimane intere (lun-dom): una settimana vale 7 giornate di diritto, quindi 35 giorni sono 5 settimane. "Applica al piano" scrive le V (protette) del mese scelto nel Calendario e i congedi C prima/dopo secondo le regole (1 C prima per i fissi, 2 per i jolly; C dopo scalati per percentuale). Import Excel: colonna A cognome, B nome, colonne F-BE settimane 1-52 con X.</p>';
  if (!gruppi.length) h += '<p style="padding:14px;color:var(--muted)">Nessuna vacanza per il ' + anno + '.</p>';
  else
    h +=
      '<div style="padding:8px 14px 0"><input type="search" class="campo-cerca" placeholder="Cerca collaboratore o settimana..." oninput="vacanzeCerca(this.value)" autocomplete="off" style="min-width:280px"></div>';
  gruppi.forEach((nome) => {
    const lista = perCollab[nome];
    h +=
      '<div class="vac-blocco" data-cerca="' +
      escP((nome + ' ' + lista.map((v) => 'sett ' + v.settimana + ' ' + v.settimana).join(' ')).toLowerCase()) +
      '" style="margin:10px 14px;border:1px solid var(--line);border-radius:3px;overflow:hidden"><div data-collab="' +
      escP(nome) +
      '" title="Apri la scheda di ' +
      escP(nome) +
      '" style="background:#ffc107;color:#212529;padding:6px 10px;font-weight:700;font-size:var(--fs-sm,.8125rem)">' +
      escP(nome) +
      ' (' +
      lista.filter(_vacEVacanza).length +
      ' settimane di vacanza' +
      (lista.some((v) => !_vacEVacanza(v))
        ? ' · ' + lista.filter((v) => !_vacEVacanza(v)).length + ' altre assenze'
        : '') +
      ')</div>';
    h +=
      '<table class="piano-table" style="min-width:100%;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Settimana</th><th style="text-align:left" title="V = vacanza (conta nei giorni di vacanza). Altre sigle del Piano (PC Protezione Civile, MT Matrimonio...) = altre assenze: non contano come vacanza">Tipo</th><th title="Definitiva = va nel piano e conta nel saldo. Provvisoria = resta qui in attesa, non va nel piano e non conta">Definitiva</th>' +
      (puoMod ? '<th>Azioni</th>' : '') +
      '</tr></thead><tbody>';
    lista.forEach((v) => {
      h +=
        '<tr' +
        (v.confermata
          ? ''
          : ' style="background:#fff3c4" title="Provvisoria: non va nel piano e non conta nel saldo"') +
        '><td style="text-align:left"><strong>Settimana ' +
        v.settimana +
        '</strong> <span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">(' +
        _vacDateSettimana(anno, v.settimana) +
        ')</span></td>' +
        '<td style="text-align:left">' +
        (_vacEVacanza(v)
          ? 'Vacanza'
          : '<span class="mini-badge" style="background:#5d6d7e" title="Non conta come vacanza">' +
            escP(_vacCodice(v)) +
            '</span> ' +
            escP(_vacDescrSigla(_vacCodice(v)))) +
        (_vacDalAlTesto(v) ? ' <strong>' + escP(_vacDalAlTesto(v)) + '</strong>' : '') +
        (v.nota ? '<div style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">' + escP(v.nota) + '</div>' : '') +
        '</td>';
      h +=
        '<td>' +
        (puoMod
          ? '<span class="mini-badge" style="cursor:pointer;background:' +
            (v.confermata ? '#2c6e49' : '#b8860b') +
            '" title="Clic per cambiare" onclick="toggleVacanzaConfermata(' +
            v.id +
            ')">' +
            (v.confermata ? 'Definitiva' : 'Provvisoria') +
            '</span>'
          : v.confermata
            ? 'Definitiva'
            : 'Provvisoria') +
        '</td>';
      if (puoMod)
        h +=
          '<td><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px;border-color:var(--c-blu,#1a4a7a);color:var(--c-blu,#1a4a7a);margin-right:6px" onclick="modificaVacanza(' +
          v.id +
          ')">Modifica</button><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaVacanza(' +
          v.id +
          ')">Elimina</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  h += '</div>';
  return h;
}
// ================================================================
// SALDO ORE DELL'ANNO · come il foglio "Saldo Ore" del piano Excel
//
// Saldo dell'anno = RIPORTO iniziale + somma dei saldi di ogni mese.
// Il saldo del mese e' lo stesso della scheda Saldo (ore piano meno ore dovute
// piu' gli scostamenti del recupero ore, con la precedenza alle timbrature e
// alle ore reali scritte a mano), quindi i due numeri non possono divergere.
// I mesi futuri gia' pianificati entrano nel conto: e' questo che permette di
// vedere in anticipo chi andra' fuori dalla banda e chi deve recuperare.
// ================================================================
let _pianoSaldoIniz = {}; // 'nome|anno' -> record del riporto
async function _pianoCaricaSaldoIniziale(anno) {
  const r =
    (await secGet('piano_saldo_iniziale?anno=eq.' + anno + '&reparto_dip=eq.' + _pianoReparto() + '&limit=500')) || [];
  _pianoSaldoIniz = {};
  r.forEach((x) => (_pianoSaldoIniz[x.collaboratore + '|' + x.anno] = x));
}
function _pianoRiporto(nome, anno) {
  const r = _pianoSaldoIniz[nome + '|' + anno];
  return r ? parseFloat(r.ore) || 0 : 0;
}
// Il riporto e' il saldo A UNA CERTA DATA, quindi contiene gia' i mesi fino a
// li'. Quei mesi non si sommano una seconda volta, altrimenti gennaio-agosto
// verrebbero contati due volte. E' esattamente quello che fa il foglio Excel,
// dove le colonne dei mesi gia' compresi nel riporto sono lasciate vuote.
// Senza data il riporto vale da inizio anno e tutti i mesi contano.
function _pianoMeseDentroRiporto(nome, anno, mm) {
  const r = _pianoSaldoIniz[nome + '|' + anno];
  if (!r || !r.data_riferimento) return false;
  const rif = String(r.data_riferimento).substring(0, 10);
  // il mese conta solo se finisce DOPO la data del riporto. Vale per qualsiasi
  // anno: un riporto al 31.12 dell'anno prima non comprende nessun mese, uno
  // datato nell'anno dopo li comprende tutti (prima era il contrario).
  const ultimo = anno + '-' + mm + '-' + String(new Date(anno, parseInt(mm), 0).getDate()).padStart(2, '0');
  return ultimo <= rif;
}
function _pianoSaldoBanda() {
  const max = parseFloat(_pianoRegolaVal('saldo_ore_max'));
  const min = parseFloat(_pianoRegolaVal('saldo_ore_min'));
  return { max: isNaN(max) ? 15 : max, min: isNaN(min) ? -15 : min };
}
// Scrive il riporto con cui la persona entra nell'anno. Nel foglio era una
// colonna a mano aggiornata al 31.08: qui si tiene anche la data, altrimenti
// fra sei mesi nessuno sa piu' a quando si riferisce quel numero.
async function pianoSaldoIniziale(nome) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return;
  }
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const att = _pianoSaldoIniz[nome + '|' + anno];
  const val = await chiediTesto(
    'Riporto ore di ' +
      nome +
      ' per il ' +
      anno +
      '.\n\nE il saldo con cui entra nell anno, prima dei mesi di questo piano.\nSi somma ai saldi mensili. Vuoto = nessun riporto.',
    att ? String(att.ore) : '',
  );
  if (val === null) return;
  const testo = String(val).trim().replace(',', '.');
  try {
    if (testo === '') {
      if (att) {
        await secDel('piano_saldo_iniziale', 'id=eq.' + att.id);
        delete _pianoSaldoIniz[nome + '|' + anno];
        logAzione('Saldo: riporto tolto', nome + ' ' + anno + ' (era ' + att.ore + 'h)');
        _pianoRegistraModifica('Saldo anno', nome, 'riporto ' + anno, att.ore + 'h', 'nessuno');
        toast('Salvato · riporto tolto per ' + nome);
      }
    } else {
      const ore = parseFloat(testo);
      if (isNaN(ore) || ore < -500 || ore > 500) {
        toast('Valore fuori scala (da -500 a +500)');
        return;
      }
      const quando = await chiediTesto(
        'A quando e aggiornato questo riporto? (giorno.mese.anno)\n\nNel foglio Excel era il 31.08.2026.',
        att && att.data_riferimento
          ? String(att.data_riferimento).split('-').reverse().join('.')
          : '31.12.' + (anno - 1),
      );
      if (quando === null) return;
      const pz = String(quando).trim().split(/[./-]/);
      const dataRif =
        pz.length === 3 ? pz[2].padStart(4, '20') + '-' + pz[1].padStart(2, '0') + '-' + pz[0].padStart(2, '0') : null;
      const dati = {
        collaboratore: nome,
        reparto_dip: _pianoReparto(),
        anno: anno,
        ore: ore,
        data_riferimento: dataRif,
        operatore: getOperatore(),
        modificato_il: new Date().toISOString(),
      };
      if (att) {
        await secPatch('piano_saldo_iniziale', 'id=eq.' + att.id, dati);
        _pianoSaldoIniz[nome + '|' + anno] = Object.assign({}, att, dati);
      } else {
        const nuovo = await secPost('piano_saldo_iniziale', dati);
        _pianoSaldoIniz[nome + '|' + anno] = (nuovo && nuovo[0]) || dati;
      }
      logAzione('Saldo: riporto', nome + ' ' + anno + ': ' + (att ? att.ore + 'h → ' : '') + ore + 'h');
      _pianoRegistraModifica('Saldo anno', nome, 'riporto ' + anno, att ? att.ore + 'h' : 'nessuno', ore + 'h');
      toast('Salvato · riporto di ' + nome + ': ' + ore + 'h');
    }
    window._pianoSaldoAnnoDati = null;
    _pianoYtdKey = ''; // il saldo del calendario e della bozza comprende il riporto
    renderPiano();
  } catch (e) {
    console.error('riporto saldo', e);
    toast('Errore nel salvataggio del riporto');
  }
}
// Calcola il saldo di OGNI mese dell'anno per ogni collaboratore del settore,
// con gli stessi criteri della scheda Saldo. Si carica una volta sola e resta
// in memoria finche' non si cambia anno o non si tocca qualcosa.
async function _pianoSaldoAnnoCalcola(anno) {
  await _pianoCaricaMalattieAnno(parseInt(anno));
  // le ore di una persona contano tutte, anche quelle fatte in un altro settore
  // (coperture, cambio di settore durante l anno): le righe del settore piu
  // quelle dei suoi collaboratori negli altri settori, come il saldo YTD del
  // calendario. Prima chi passava al Valet a novembre risultava con 100 ore in meno.
  const rep = _pianoReparto();
  const nomi = collaboratoriCache.filter((c) => _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const periodo = '&data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31';
  const [delSettore, altrove] = await Promise.all([
    secGet('piano?reparto_dip=eq.' + rep + periodo),
    nomi.length
      ? secGet(
          'piano?collaboratore=in.(' +
            nomi.map((n) => encodeURIComponent(n)).join(',') +
            ')&reparto_dip=neq.' +
            rep +
            periodo,
        )
      : [],
  ]);
  const righe = (delSettore || []).concat(altrove || []);
  _pianoRegistraGiorniTurno(righe);
  const rec =
    (await secGet(
      'piano_recupero_ore?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=20000',
    )) || [];
  const rett =
    (await secGet('piano_ore_mese?anno_mese=gte.' + anno + '-01&anno_mese=lte.' + anno + '-12&limit=5000')) || [];
  const timb =
    (await secGet('piano_timbrature?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=20000')) || [];
  const perMese = {}; // 'nome|MM' -> ore piano
  righe.forEach((r) => {
    const info = _pianoCollabInfo(r.collaboratore) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const mm = String(r.data).substring(5, 7);
    const k = r.collaboratore + '|' + mm;
    perMese[k] = (perMese[k] || 0) + _pianoOreDiRiga(r, pct);
  });
  rec.forEach((x) => {
    const k = x.collaboratore + '|' + String(x.data).substring(5, 7);
    perMese[k] = (perMese[k] || 0) + (parseFloat(x.ore) || 0);
  });
  const timbMese = {};
  timb.forEach((t) => {
    const k = t.collaboratore + '|' + String(t.data).substring(5, 7);
    timbMese[k] = (timbMese[k] || 0) + (parseFloat(t.ore) || 0);
  });
  const rettMese = {};
  rett.forEach(
    (x) => (rettMese[x.collaboratore + '|' + String(x.anno_mese).substring(5, 7)] = parseFloat(x.ore_reali)),
  );
  // mesi che hanno davvero un piano: sugli altri non si conta niente, altrimenti
  // un mese non ancora pianificato risulterebbe come un buco di 175 ore
  const mesiConPiano = {};
  righe.forEach((r) => (mesiConPiano[String(r.data).substring(5, 7)] = true));
  return { perMese: perMese, timbMese: timbMese, rettMese: rettMese, mesiConPiano: mesiConPiano, anno: anno };
}
// Saldo di un mese: le stesse precedenze della scheda Saldo (ore reali scritte
// a mano, poi timbrature, poi piano) meno le ore dovute.
function _pianoSaldoDelMese(dati, nome, mm, info) {
  if (!dati.mesiConPiano[mm]) return null;
  const k = nome + '|' + mm;
  const pct = parseFloat(info.percentuale) || 1;
  let op = dati.perMese[k] || 0;
  if (dati.timbMese[k] != null) op = dati.timbMese[k];
  if (dati.rettMese[k] != null) op = dati.rettMese[k];
  if (!op) return null;
  const gg = _pianoGgDovuti(nome, dati.anno + '-' + mm); // meno i giorni di congedo non pagato
  const od = info.is_jolly ? 0 : Math.round((gg / 7) * _pianoOreSett * pct * 10) / 10;
  return Math.round((Math.round(op * 100) / 100 - od) * 10) / 10;
}
async function pianoCaricaSaldoAnno() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const el = document.getElementById('piano-saldoanno');
  if (el)
    el.innerHTML =
      '<p style="color:var(--muted);font-size:var(--fs-md,.875rem);padding:8px 0">Calcolo dei dodici mesi...</p>';
  await _pianoCaricaSaldoIniziale(anno);
  window._pianoSaldoAnnoDati = await _pianoSaldoAnnoCalcola(anno);
  window._pianoSaldoAnnoAperto = true;
  renderPiano();
}
function _renderPianoSaldoAnnoCard() {
  const anno = parseInt(_pianoMeseSel.split('-')[0]);
  const dati = window._pianoSaldoAnnoDati;
  let h =
    '<div class="main-card" style="margin-bottom:14px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Saldo ore ' +
    anno +
    ' · anno intero';
  if (dati && dati.anno === anno)
    h +=
      '<input type="text" class="piano-cerca campo-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-saldoanno-table\')">' +
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px" onclick="pianoCaricaSaldoAnno()">Ricalcola</button>';
  h += '</div><div style="padding:10px 14px" id="piano-saldoanno">';
  if (!dati || dati.anno !== anno) {
    h +=
      '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Riporto di inizio anno piu il saldo di ogni mese, come il foglio Saldo Ore del piano. I mesi gia pianificati contano anche se sono nel futuro, cosi si vede in anticipo chi andra fuori dalla banda e chi deve recuperare.</p>' +
      '<button class="btn-export" style="font-size:var(--fs-md,.875rem);padding:6px 14px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="pianoCaricaSaldoAnno()">Calcola l anno ' +
      anno +
      '</button></div></div>';
    return h;
  }
  const banda = _pianoSaldoBanda();
  const nomi = ordineCollabPiano(
    collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome),
    _pianoReparto(),
  );
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Saldo del mese = ore fatte meno ore dovute, con dentro gli scostamenti del Recupero ore. Il totale e il riporto piu i mesi. E in ordine (verde) se resta fra ' +
    banda.min +
    ' e +' +
    banda.max +
    ' ore: la banda si cambia nella scheda Regole. Clic sul riporto per scriverlo: se gli dai una data, i mesi gia compresi restano grigi con un punto e non vengono contati due volte.</p>';
  h +=
    '<div style="overflow:auto;max-height:72vh"><table id="piano-saldoanno-table" class="piano-table piano-fisse3" style="min-width:1100px;font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Fun</th><th>%</th><th title="Saldo con cui entra nell anno. Clic per scriverlo">Riporto</th>';
  for (let m = 1; m <= 12; m++) h += '<th>' + (MESI[m - 1] || m) + '</th>';
  h += '<th>Totale mesi</th><th>Saldo ' + anno + '</th><th></th></tr></thead><tbody>';
  let righeScritte = 0;
  nomi.forEach((nome) => {
    const info = _pianoCollabInfo(nome) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const mesi = [];
    let somma = 0;
    let qualcosa = false;
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      if (_pianoMeseDentroRiporto(nome, anno, mm)) {
        mesi.push('riporto'); // gia' compreso nel riporto: non si somma
        continue;
      }
      const v = _pianoSaldoDelMese(dati, nome, mm, info);
      mesi.push(v);
      if (v != null) {
        somma += v;
        qualcosa = true;
      }
    }
    const rip = _pianoRiporto(nome, anno);
    if (!qualcosa && !rip) return;
    void pct;
    righeScritte++;
    somma = Math.round(somma * 10) / 10;
    const tot = Math.round((rip + somma) * 10) / 10;
    // gli ausiliari non hanno ore dovute: per loro il saldo non vuol dire nulla
    const jolly = !!info.is_jolly;
    const dentro = tot <= banda.max && tot >= banda.min;
    const col = (v) => (v > 0 ? '#2c6e49' : v < 0 ? '#c0392b' : 'var(--muted)');
    const rec = _pianoSaldoIniz[nome + '|' + anno];
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(nome) +
      '</td><td>' +
      escP(jolly ? 'JOLLY' : info.funzione || '') +
      '</td><td>' +
      (jolly ? '-' : Math.round(pct * 100) + '%') +
      '</td><td style="cursor:pointer;font-weight:600;color:' +
      col(rip) +
      '" title="' +
      (rec && rec.data_riferimento
        ? 'Aggiornato al ' + String(rec.data_riferimento).split('-').reverse().join('.')
        : 'Clic per scrivere il riporto') +
      '" onclick="pianoSaldoIniziale(\'' +
      _jsArg(nome) +
      '\')">' +
      (rip ? (rip > 0 ? '+' : '') + rip : '–') +
      '</td>';
    mesi.forEach((v) => {
      // ausiliari: non hanno ore dovute, quindi il saldo del mese non esiste.
      // Mostrare le ore fatte al posto del saldo faceva leggere +150 come se
      // fossero ore in credito.
      if (v === 'riporto') {
        h +=
          '<td style="color:var(--line);background:var(--paper2)" title="Mese gia compreso nel riporto: non si conta due volte">\u00b7</td>';
        return;
      }
      if (jolly) {
        h += '<td style="color:var(--muted)">' + (v == null ? '' : '\u2013') + '</td>';
        return;
      }
      h +=
        '<td style="color:' +
        (v == null ? 'var(--line)' : col(v)) +
        (v != null && Math.abs(v) >= 10 ? ';font-weight:700' : '') +
        '">' +
        (v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(1)) +
        '</td>';
    });
    h +=
      '<td style="font-weight:600;color:' +
      (jolly ? 'var(--muted)' : col(somma)) +
      '">' +
      (jolly ? '\u2013' : (somma > 0 ? '+' : '') + somma.toFixed(1)) +
      '</td><td style="font-weight:700;color:' +
      col(tot) +
      '">' +
      (jolly ? '–' : (tot > 0 ? '+' : '') + tot.toFixed(1)) +
      '</td><td>' +
      (jolly
        ? '<span style="color:var(--muted)">–</span>'
        : dentro
          ? '<span style="color:var(--c-verde,#2c6e49);font-weight:700">ok</span>'
          : '<span style="color:var(--c-rosso,#c0392b);font-weight:700" title="Fuori dalla banda ' +
            banda.min +
            ' / +' +
            banda.max +
            '">no</span>') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  if (!righeScritte)
    h +=
      '<p style="color:var(--muted);font-size:var(--fs-md,.875rem)">Nessun mese pianificato per il ' + anno + '.</p>';
  h += '</div></div>';
  return h;
}
// TAB SALDO · come la pagina Saldo Ore di Turnivo: dovute/pianificate/saldo
// del mese per collaboratore + totali (YTD dalla stessa mappa della griglia)
async function _renderPianoSaldoTab() {
  const ym = _pianoMeseSel;
  await _pianoCaricaRecupero(ym);
  const nGiorni = _pianoUltimoGiorno(ym);
  const MESI_L = MESI_FULL || [];
  const label = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const perNome = {};
  _pianoRighe.forEach((r) => (perNome[r.collaboratore] = (perNome[r.collaboratore] || []).concat(r)));
  const nomi = ordineCollabPiano(
    collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome),
    _pianoReparto(),
  );
  await _pianoAggiornaYtd(nomi);
  await _pianoCaricaOreMese(_pianoMeseSel);
  // come Turnivo: ore LAVORATE = timbrate del mese se presenti, altrimenti piano
  const da = ym + '-01';
  const aFine = ym + '-' + String(nGiorni).padStart(2, '0');
  const timbrateMese = (await secGet('piano_timbrature?data=gte.' + da + '&data=lte.' + aFine + '&limit=5000')) || [];
  const timbNome = {};
  timbrateMese.forEach(
    (t) => (timbNome[t.collaboratore] = (timbNome[t.collaboratore] || 0) + (parseFloat(t.ore) || 0)),
  );
  let h = _renderPianoSaldoAnnoCard();
  h +=
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Saldo ore · ' +
    escP(label) +
    '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>' +
    '<input type="text" class="piano-cerca campo-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-saldo-table\')"></div>';
  h +=
    // scorrimento DENTRO il riquadro: l'intestazione resta in alto e le prime
    // tre colonne (nome, funzione, percentuale) restano ferme a sinistra
    '<div style="overflow:auto;max-height:72vh;padding:0 6px 8px"><table id="piano-saldo-table" class="piano-table piano-fisse3" style="min-width:760px;font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Fun</th><th>%</th><th>Ore dovute</th><th title="Timbrate se presenti, altrimenti piano">Ore lavorate</th><th>Saldo mese</th><th>Saldo anno (YTD)</th></tr></thead><tbody>';
  let totD = 0;
  let totP = 0;
  let totS = 0;
  nomi.forEach((nome) => {
    const info = _pianoCollabInfo(nome) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const righeMese = perNome[nome] || [];
    // mese fatto SOLO di congedo C senza commenti, turni, malattie, vacanze o
    // CGF, e senza timbrature: il collaboratore non e' in servizio quel mese
    // (es. uscito ma non ancora disattivato), non si conteggia nel saldo
    if (
      righeMese.length &&
      righeMese.every((r) => r.codice === 'C' && !(r.commento || '').trim()) &&
      timbNome[nome] == null
    )
      return;
    let op = 0;
    righeMese.forEach((r) => {
      op += _pianoOreDiRiga(r, pct);
    });
    op += _pianoRecuperoTotale(nome, ym); // scostamenti giornalieri
    if (timbNome[nome] != null) op = timbNome[nome]; // timbrate del mese: hanno la precedenza
    // ore reali scritte a mano: precedenza su tutto, come nel calendario
    const rettSaldo = _pianoRettificaMese(nome);
    if (rettSaldo) op = Math.round(parseFloat(rettSaldo.ore_reali) * 100) / 100;
    // stesso arrotondamento del calendario (una cifra decimale sulle ore
    // dovute), altrimenti la stessa persona mostra due saldi diversi nelle due
    // schede per un centesimo di differenza
    const od = info.is_jolly ? 0 : Math.round((_pianoGgDovuti(nome, ym) / 7) * _pianoOreSett * pct * 10) / 10;
    const sm = Math.round((Math.round(op * 100) / 100 - od) * 10) / 10;
    const ytd = _pianoYtdConMese(nome, sm, op);
    totD += od;
    totP += op;
    if (!info.is_jolly) totS += sm;
    const col = (v) => (v > 0 ? '#2c6e49' : v < 0 ? '#c0392b' : 'var(--muted)');
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(nome) +
      '</td><td>' +
      escP(info.is_jolly ? 'JOLLY' : info.funzione || '') +
      '</td><td>' +
      Math.round(pct * 100) +
      '%</td><td>' +
      (od ? od.toFixed(1) : '-') +
      '</td><td>' +
      (op ? op.toFixed(1) : '') +
      (rettSaldo
        ? '<span class="piano-rett" title="Ore reali scritte da ' +
          escP(rettSaldo.operatore || '') +
          (rettSaldo.nota ? ' · ' + escP(rettSaldo.nota) : '') +
          '">*</span>'
        : '') +
      '</td><td class="piano-sm" style="font-weight:700;cursor:pointer;color:' +
      (info.is_jolly ? 'var(--muted)' : col(sm)) +
      '" title="' +
      (info.is_jolly
        ? 'Gli ausiliari non hanno ore dovute: il saldo non si applica'
        : 'Clic per scrivere le ore realmente lavorate nel mese') +
      '">' +
      (info.is_jolly ? '\u2013' : op || od ? (sm > 0 ? '+' : '') + sm.toFixed(1) : '') +
      '</td><td style="font-weight:700;color:' +
      (info.is_jolly ? 'var(--muted)' : col(ytd)) +
      '">' +
      (info.is_jolly ? '\u2013' : op || _pianoYtdMap[nome] ? (ytd > 0 ? '+' : '') + ytd.toFixed(1) : '') +
      '</td></tr>';
  });
  h +=
    '<tr style="border-top:2px solid #000"><td style="text-align:left;font-weight:700">TOTALE</td><td></td><td></td><td style="font-weight:700">' +
    totD.toFixed(1) +
    '</td><td style="font-weight:700">' +
    totP.toFixed(1) +
    '</td><td style="font-weight:700;color:' +
    (totS > 0 ? '#2c6e49' : totS < 0 ? '#c0392b' : 'inherit') +
    '">' +
    (totS > 0 ? '+' : '') +
    totS.toFixed(1) +
    '</td><td></td></tr>';
  h +=
    '</tbody></table></div><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);padding:8px 14px">Dovute = giorni/7 × ' +
    _pianoOreSett +
    'h × percentuale (jolly esclusi). Pianificate = ore turni + codici speciali (V, M... scalati per percentuale). YTD = cumulato da gennaio: nei mesi passati valgono le ore timbrate se presenti, altrimenti il piano. Clic su "Saldo mese" per scrivere le ore reali del mese: un mese gia chiuso si corregge solo indicando il motivo.</p></div>';
  return h;
}

// TAB STORICO · come la pagina Storico di Turnivo: log delle modifiche al
// piano (dal Registro del Diario, filtrato sulle azioni del piano)
// ordinamento per colonna dello storico: 1° clic decrescente, 2° crescente
function pianoStoricoSort(campo) {
  const s0 = window._pianoStoricoSort || { campo: 'created_at', dir: -1 };
  window._pianoStoricoSort = { campo: campo, dir: s0.campo === campo ? -s0.dir : campo === 'created_at' ? -1 : 1 };
  renderPiano();
}
// VERSIONI DEL MESE (storico del piano, v408): ogni cambio di cella registrato dal
// database (piano_storico). Si sceglie un momento e si riporta il mese di questo settore
// a com era subito PRIMA (oppure a un giorno e un ora scelti). Il ripristino usa le
// scritture normali: e registrato a sua volta e si annulla con Annulla.
async function _pianoVersioniHtml() {
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  let momenti = null;
  try {
    momenti = (await _rpcSicura('piano_storico_momenti', { p_token: getOpToken(), p_reparto: rep, p_ym: ym })) || [];
  } catch (e) {
    return '<div class="main-card" style="margin-bottom:16px"><div class="card-header">Versioni del mese</div><div style="padding:12px 14px;color:var(--muted)">Lo storico delle celle non e ancora disponibile su questo database (serve la migrazione 20260901).</div></div>';
  }
  const puo = puoGestirePiano();
  const ora = (t) => new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  let h =
    '<div class="main-card" style="margin-bottom:16px"><div class="card-header">Versioni del mese · ' +
    escP(typeof MESI_FULL !== 'undefined' ? MESI_FULL[parseInt(ym.split('-')[1]) - 1] + ' ' + ym.split('-')[0] : ym) +
    ' · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:10px 14px">' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Ogni cambio di cella e registrato dal database con chi e quando (a mano, bozza, import, vacanze, Annulla), da qualsiasi PC. ' +
    (puo
      ? 'Con <b>Riporta a prima</b> il mese torna com era subito prima di quel momento: vedi le differenze e confermi; i giorni chiusi restano come sono e tutto si annulla con Annulla.'
      : 'Riportare il mese indietro e di chi gestisce il piano.') +
    '</p>';
  if (puo)
    h +=
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><label for="storico-quando" style="font-size:var(--fs-sm,.8125rem)">Riporta il mese a com era il</label><input type="datetime-local" id="storico-quando" style="padding:4px 6px"><button class="btn-act" onclick="pianoStoricoRiportaA()">Vedi e riporta</button></div>';
  if (!momenti.length) {
    h +=
      '<p style="color:var(--muted)">Nessuna modifica registrata per questo mese (lo storico parte dall installazione).</p></div></div>';
    return h;
  }
  h +=
    '<div style="overflow-x:auto;max-height:380px;overflow-y:auto"><table class="piano-table" style="min-width:640px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Quando</th><th style="text-align:left">Chi</th><th>Celle</th><th style="text-align:left">Esempi</th>' +
    (puo ? '<th></th>' : '') +
    '</tr></thead><tbody>';
  momenti.forEach((m) => {
    const det = [
      m.nuove ? m.nuove + ' nuove' : '',
      m.modificate ? m.modificate + ' cambiate' : '',
      m.cancellate ? m.cancellate + ' tolte' : '',
    ]
      .filter(Boolean)
      .join(', ');
    h +=
      '<tr><td style="text-align:left;white-space:nowrap">' +
      escP(ora(m.primo)) +
      '</td><td style="text-align:left">' +
      escP(m.operatore || '-') +
      '</td><td title="' +
      escP(det) +
      '"><b>' +
      m.celle +
      '</b></td><td style="text-align:left;font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
      escP((m.esempi || []).join(' · ')) +
      (m.celle > (m.esempi || []).length ? ' …' : '') +
      '</td>' +
      (puo
        ? '<td><button class="btn-act" title="Riporta il mese a com era subito prima di questo momento" onclick="pianoStoricoRiporta(\'' +
          _jsArg(m.primo) +
          '\')">Riporta a prima</button></td>'
        : '') +
      '</tr>';
  });
  h += '</tbody></table></div></div></div>';
  return h;
}
function pianoStoricoRiportaA() {
  const v = (document.getElementById('storico-quando') || {}).value;
  if (!v) {
    toast('Scegli giorno e ora');
    return;
  }
  // l ora scelta e quella di Lugano: la data locale del browser la converte
  pianoStoricoRiporta(new Date(v).toISOString(), true);
}
async function pianoStoricoRiporta(quando, esatto) {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  // "prima di questo momento": un millesimo prima della prima cella cambiata
  const istante = esatto ? quando : new Date(new Date(quando).getTime() - 1).toISOString();
  let stato;
  let cur;
  try {
    stato =
      (await _rpcSicura('piano_storico_al', { p_token: getOpToken(), p_reparto: rep, p_ym: ym, p_quando: istante })) ||
      [];
    const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
    cur =
      (await secGet('piano?data=gte.' + ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + rep + '&limit=8000')) || [];
  } catch (e) {
    toastErrore('Storico non letto: ' + ((e && e.message) || e));
    return;
  }
  const k = (r) => r.collaboratore + '|' + String(r.data).substring(0, 10);
  const firma = (r) =>
    r ? [r.codice, r.ora_inizio || '', r.ora_fine || '', r.commento || '', r.motivo_blocco || ''].join('|') : '';
  const prima = new Map(stato.map((r) => [k(r), r]));
  const oggi = new Map(cur.map((r) => [k(r), r]));
  const diverse = [...new Set([...prima.keys(), ...oggi.keys()])].filter(
    (x) => firma(prima.get(x)) !== firma(oggi.get(x)),
  );
  const quandoIt = new Date(istante).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' });
  if (!diverse.length) {
    toast('Il mese e gia com era il ' + quandoIt);
    return;
  }
  diverse.sort((a, b) => a.split('|')[1].localeCompare(b.split('|')[1]) || a.localeCompare(b));
  const esempi = diverse
    .slice(0, 14)
    .map((x) => {
      const [n, d] = x.split('|');
      return (
        '\u2022 ' +
        n +
        ' ' +
        d.split('-').reverse().join('.') +
        ': oggi ' +
        ((oggi.get(x) || {}).codice || 'vuota') +
        ' \u2192 allora ' +
        ((prima.get(x) || {}).codice || 'vuota')
      );
    })
    .join('\n');
  if (
    !(await chiediConferma(
      'Riporto ' +
        ym +
        ' (' +
        repartoLabel(rep) +
        ') a com era il ' +
        quandoIt +
        '?\n\n' +
        diverse.length +
        (diverse.length === 1 ? ' cella cambia:' : ' celle cambiano:') +
        '\n' +
        esempi +
        (diverse.length > 14 ? '\n... e altre ' + (diverse.length - 14) : '') +
        '\n\nI giorni chiusi restano come sono. Si torna indietro con Annulla.',
      { titolo: 'Versioni del mese' },
    ))
  )
    return;
  // Annulla: lo stato di adesso (dal database) va sulla pila del piano
  window._pianoUndo = window._pianoUndo || [];
  window._pianoUndo.push({
    ym: ym,
    rep: rep,
    label: 'riporta a ' + quandoIt,
    quando: new Date().toISOString(),
    righe: _pianoMappaRighe(cur, rep),
  });
  window._pianoRedo = [];
  try {
    const esito = await _pianoRipristinaStato({ ym: ym, rep: rep, righe: _pianoMappaRighe(stato, rep) });
    logAzione('Piano: riportato a una versione', ym + ' ' + rep + ' · ' + quandoIt + ' · ' + esito.cambiate + ' celle');
    toast('Mese riportato al ' + quandoIt + ' (' + esito.cambiate + ' celle)');
  } catch (e) {
    window._pianoUndo.pop();
    toastErrore('Ripristino non riuscito: ' + ((e && e.message) || e));
  }
  await renderPiano();
}
async function _renderPianoStoricoTab() {
  const filtro = window._pianoStoricoFiltro || '';
  const cerca = (window._pianoStoricoCerca || '').toLowerCase();
  const srt = window._pianoStoricoSort || { campo: 'created_at', dir: -1 };
  // ogni settore vede il SUO storico; i log vecchi (senza settore) restano visibili
  const logsTutti = (await secGet('log_attivita?azione=ilike.*piano*&order=created_at.desc&limit=400')) || [];
  const repCorr = _pianoReparto();
  const logs = logsTutti.filter((l) => !l.reparto_dip || l.reparto_dip === repCorr);
  let visibili = filtro ? logs.filter((l) => l.azione === filtro) : logs;
  if (cerca)
    visibili = visibili.filter((l) =>
      ((l.operatore || '') + ' ' + (l.azione || '') + ' ' + (l.dettaglio || '')).toLowerCase().includes(cerca),
    );
  visibili = visibili
    .slice()
    .sort(
      (a, b) =>
        srt.dir * String(a[srt.campo] || '').localeCompare(String(b[srt.campo] || '')) ||
        (b.created_at || '').localeCompare(a.created_at || ''),
    );
  const azioni = [...new Set(logs.map((l) => l.azione))].sort();
  let h = await _pianoVersioniHtml();
  h +=
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Storico modifiche piano (' +
    visibili.length +
    ')';
  h +=
    '<select onchange="window._pianoStoricoFiltro=this.value;renderPiano()" style="padding:4px 8px;font-size:var(--fs-sm,.8125rem);border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a"><option value="">Tutte le azioni</option>' +
    azioni
      .map((a) => '<option value="' + escP(a) + '"' + (filtro === a ? ' selected' : '') + '>' + escP(a) + '</option>')
      .join('') +
    '</select>';
  h +=
    '<input type="text" value="' +
    escP(window._pianoStoricoCerca || '') +
    '" placeholder="Cerca nome o voce..." onchange="window._pianoStoricoCerca=this.value;renderPiano()" class="piano-cerca campo-cerca">';
  h += '</div>';
  h +=
    '<div style="overflow-x:auto;padding:0 6px 8px"><table class="piano-table" style="min-width:700px;font-size:var(--fs-md,.875rem)"><thead><tr>' +
    [
      ['created_at', 'Data e ora', ''],
      ['operatore', 'Operatore', ''],
      ['azione', 'Azione', 'text-align:left'],
      ['dettaglio', 'Dettaglio', 'text-align:left'],
    ]
      .map(
        ([campo, label, st]) =>
          '<th style="cursor:pointer;' +
          st +
          '" title="Clicca per ordinare" onclick="pianoStoricoSort(\'' +
          campo +
          '\')">' +
          label +
          (srt.campo === campo
            ? srt.dir === 1
              ? ' &#9650;'
              : ' &#9660;'
            : ' <span style="opacity:.35">&#8597;</span>') +
          '</th>',
      )
      .join('') +
    '</tr></thead><tbody>';
  visibili.forEach((l) => {
    const d = l.created_at ? new Date(l.created_at) : null;
    h +=
      '<tr' +
      (typeof _attrCellaDaTesto === 'function' ? _attrCellaDaTesto(l.dettaglio) : '') +
      '><td>' +
      (d
        ? d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '') +
      '</td><td>' +
      escP(l.operatore || '') +
      '</td><td style="text-align:left;font-weight:600">' +
      escP(l.azione || '') +
      '</td><td style="text-align:left">' +
      escP(l.dettaglio || '') +
      '</td></tr>';
  });
  if (!visibili.length)
    h += '<tr><td colspan="4" style="padding:14px;color:var(--muted)">Nessuna modifica registrata</td></tr>';
  h += '</tbody></table></div></div>';
  return h;
}

// Formulario RICHIESTA CAMBIO VACANZA · replica di cambio_vacanza_pdf.html
// di Turnivo (modulo vuoto da compilare a mano, stesse sezioni colorate)
async function pdfCambioVacanza(dati) {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text('Casino Lugano SA', 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text('RICHIESTA CAMBIO VACANZA', 105, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text(
    'Generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    105,
    y,
    { align: 'center' },
  );
  y += 5;
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(1);
  doc.line(M, y, 210 - M, y);
  y += 10;
  const linea = '___________________________________________';
  const sezione = (titolo, barra, righe, altezzaExtra) => {
    const altezza = 12 + righe.length * 7 + (altezzaExtra || 3);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, y, W, altezza, 1.8, 1.8, 'FD');
    doc.setFillColor(barra[0], barra[1], barra[2]);
    doc.rect(M, y, 1.6, altezza, 'F');
    let yy = y + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(titolo, M + 6, yy);
    doc.setDrawColor(221, 221, 221);
    doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
    yy += 8;
    doc.setFontSize(10);
    righe.forEach((r) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 51, 51);
      doc.text(r[0], M + 6, yy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(34, 34, 34);
      doc.text(r[1], M + 6 + 44, yy);
      yy += 7;
    });
    y += altezza + 6;
    return yy;
  };
  const campiDi = (c) =>
    c
      ? [
          ['Nome:', c.nome],
          ['Settore:', c.settore || repartoNomeDocumento(_pianoReparto())],
          ['Numero settimana:', 'Settimana ' + c.settimana],
          ['Periodo vacanza:', c.dal + '  ·  ' + c.al],
        ]
      : [
          ['Nome:', linea],
          ['Settore:', linea],
          ['Numero settimana:', '__________________'],
          ['Periodo vacanza:', '____/____/________  ·  ____/____/________'],
        ];
  sezione('Collaboratore A (richiedente)', [52, 152, 219], campiDi(dati && dati.a));
  sezione('Collaboratore B (accetta lo scambio)', [230, 126, 34], campiDi(dati && dati.b));
  sezione(
    'Motivazione',
    [46, 204, 113],
    [
      ['', linea + '__________________'],
      ['', linea + '__________________'],
    ],
  );
  // Autorizzazione con checkbox (viola, come il cambio turno)
  const hAut = 30;
  doc.setFillColor(250, 248, 252);
  doc.setDrawColor(221, 221, 221);
  doc.roundedRect(M, y, W, hAut, 1.8, 1.8, 'FD');
  doc.setFillColor(142, 68, 173);
  doc.rect(M, y, 1.6, hAut, 'F');
  let yy = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(44, 62, 80);
  doc.text('Autorizzazione', M + 6, yy);
  doc.setDrawColor(221, 221, 221);
  doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
  yy += 9;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.rect(M + 6, yy - 4, 5, 5);
  doc.setFontSize(11);
  doc.setTextColor(34, 34, 34);
  doc.text('Autorizzato', M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text('Non autorizzato', M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Motivo:', M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________________________________________________________________', M + 22, yy);
  y += hAut + 20;
  // firme A / B / Responsabile
  const firme = ['Firma Collaboratore A', 'Firma Collaboratore B', 'Firma Responsabile'];
  const wBox = W * 0.3;
  const gap = (W - wBox * 3) / 2;
  firme.forEach((f, i) => {
    const x = M + i * (wBox + gap);
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.35);
    doc.line(x, y, x + wBox, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text(f, x + wBox / 2, y + 5, { align: 'center' });
    doc.text('Data: ____/____/________', x + wBox / 2, y + 11, { align: 'center' });
  });
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Casino Lugano SA · formulario cambio vacanza', 105, 287, { align: 'center' });
  mostraPdfPreview(doc, 'cambio_vacanza.pdf', 'Formulario cambio vacanza');
}

// SCAMBIO SETTIMANE tra due collaboratori (meglio del solo formulario di
// Turnivo): scambia le righe vacanza, sistema le celle V/C/WD nei mesi già
// pianificati e genera il modulo PDF PRECOMPILATO per le firme.
function apriScambioSettimane() {
  if (!puoGestirePiano()) return;
  if (_pianoVacCache.length < 2) {
    toast("Servono almeno due vacanze nell'anno selezionato");
    return;
  }
  const opzioni = _pianoVacCache
    .slice()
    .sort((a, b) => a.collaboratore.localeCompare(b.collaboratore) || a.settimana - b.settimana)
    .map(
      (v) =>
        '<option value="' +
        v.id +
        '">' +
        escP(v.collaboratore) +
        ' · settimana ' +
        v.settimana +
        ' (' +
        _vacDateSettimana(v.anno, v.settimana) +
        ')</option>',
    )
    .join('');
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambia settimane di vacanza · ' +
    window._pianoVacAnno +
    '</h3><div class="field" style="text-align:left"><label>Collaboratore A (richiedente)</label><select id="ss-a" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div><div class="field" style="text-align:left;margin-top:8px"><label>Collaboratore B (accetta lo scambio)</label><select id="ss-b" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div>' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:8px">Le due settimane vengono scambiate; nei mesi già pianificati le V e i congedi vengono sistemati di conseguenza. Alla fine si genera il modulo PDF precompilato per le firme.</p>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioSettimane()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaScambioSettimane() {
  const idA = parseInt((document.getElementById('ss-a') || {}).value);
  const idB = parseInt((document.getElementById('ss-b') || {}).value);
  document.getElementById('pwd-modal').classList.add('hidden');
  const vA = _pianoVacCache.find((x) => x.id === idA);
  const vB = _pianoVacCache.find((x) => x.id === idB);
  if (!vA || !vB || vA.id === vB.id) {
    toast('Scegli due vacanze diverse');
    return;
  }
  if (vA.collaboratore === vB.collaboratore) {
    toast('Le due vacanze appartengono alla stessa persona: usa Modifica');
    return;
  }
  // duplicati: A non deve già avere la settimana di B e viceversa
  if (
    _pianoVacCache.some(
      (x) => x.collaboratore === vA.collaboratore && x.settimana === vB.settimana && x.id !== vA.id,
    ) ||
    _pianoVacCache.some((x) => x.collaboratore === vB.collaboratore && x.settimana === vA.settimana && x.id !== vB.id)
  ) {
    toast("Uno dei due ha già la settimana dell'altro");
    return;
  }
  const op = getOperatore();
  // GIORNI CHIUSI: si controlla PRIMA di toccare qualsiasi cosa. Prima le V
  // venivano cancellate e poi il reinserimento falliva sul giorno chiuso,
  // lasciando il piano senza vacanze e il programma sul mese sbagliato.
  const annoV = window._pianoVacAnno;
  const giorniToccati = _pianoGiorniSettimana(annoV, vA.settimana).concat(_pianoGiorniSettimana(annoV, vB.settimana));
  const chiuso = giorniToccati.find((d) => _pianoGiornoBloccato(d) && !_pianoGiornoSbloccato(d));
  if (chiuso) {
    toastErrore(
      'Il ' +
        chiuso.split('-').reverse().join('.') +
        ' e\' un giorno chiuso: lo scambio toccherebbe il passato. Sblocca il giorno (permesso "Giorni chiusi") oppure scegli settimane future.',
    );
    return;
  }
  const meseCorrente = _pianoMeseSel;
  try {
    await secPatch('piano_vacanze', 'id=eq.' + vA.id, { settimana: vB.settimana });
    await secPatch('piano_vacanze', 'id=eq.' + vB.id, { settimana: vA.settimana });
    logAzione(
      'Vacanze: scambio settimane',
      vA.collaboratore + ' (sett. ' + vA.settimana + ') <-> ' + vB.collaboratore + ' (sett. ' + vB.settimana + ')',
    );
    // sistemare i mesi già pianificati: via le V della vecchia settimana e i
    // C/WD generati dei due collaboratori, poi riapplico le vacanze
    const anno = window._pianoVacAnno;
    const mesi = new Set();
    [vA.settimana, vB.settimana].forEach((sett) =>
      // anche il mese dell altro anno, per le settimane a cavallo d anno
      _pianoGiorniSettimana(anno, sett).forEach((dstr) => mesi.add(dstr.substring(0, 7))),
    );
    for (const ym of mesi) {
      const nG = _pianoUltimoGiorno(ym);
      const righeMese =
        (await secGet(
          'piano?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nG).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=5000',
        )) || [];
      if (!righeMese.length) continue; // mese non ancora pianificato: le V arriveranno con Applica/Genera
      for (const nome of [vA.collaboratore, vB.collaboratore]) {
        for (const r of righeMese.filter(
          (x) =>
            x.collaboratore === nome &&
            // solo i giorni aperti: _applicaVacanzeMese non riscrive i giorni chiusi,
            // quindi cancellarli li lascerebbe vuoti (prima si toglieva tutto il mese)
            _pianoGiornoScrivibile(String(x.data).substring(0, 10)) &&
            (x.codice === 'V' || ((x.codice === 'C' || x.codice === 'WD') && x.generato)),
        )) {
          await secDel('piano', 'id=eq.' + r.id);
        }
      }
      _pianoMeseSel = ym;
      _pianoRighe =
        (await secGet(
          'piano?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nG).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=5000',
        )) || [];
      await _applicaVacanzeMese(false);
    }
    _pianoMeseSel = meseCorrente;
    // PDF precompilato identico al modulo
    const ggA = _pianoGiorniSettimana(anno, vB.settimana); // nuova settimana di A
    const ggB = _pianoGiorniSettimana(anno, vA.settimana);
    const fmt = (d) => d.split('-').reverse().join('/');
    await pdfCambioVacanza({
      a: { nome: vA.collaboratore, settimana: vB.settimana, dal: fmt(ggA[0]), al: fmt(ggA[6]) },
      b: { nome: vB.collaboratore, settimana: vA.settimana, dal: fmt(ggB[0]), al: fmt(ggB[6]) },
    });
    toast('Settimane scambiate' + (mesi.size ? ' e piano aggiornato' : ''));
    renderPiano();
  } catch (e) {
    console.error(e);
    _pianoMeseSel = meseCorrente; // mai lasciare il programma sul mese sbagliato
    toastErrore(
      'Errore scambio settimane: ' + (e.message || '') + '. Controlla i mesi toccati e usa Annulla se serve.',
    );
    renderPiano();
  }
}

function apriNuovaVacanza() {
  if (!puoGestirePiano()) return;
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Nuova vacanza · ' +
    window._pianoVacAnno +
    '</h3><div class="field" style="text-align:left"><label>Collaboratore</label><select id="nv-collab" style="width:100%;padding:8px">' +
    nomiRep.map((n) => '<option value="' + escP(n) + '">' + escP(n) + '</option>').join('') +
    '</select></div><div class="field" style="text-align:left;margin-top:8px"><label>Settimana (1-53)</label><input type="number" id="nv-sett" min="1" max="53" style="width:110px;padding:8px"></div><div class="field" style="text-align:left;margin-top:8px"><label>Tipo</label><select id="nv-tipo" style="width:100%;padding:8px"><option value="V">V · Vacanza (conta nei giorni di vacanza)</option>' +
    (typeof pianoCodiciCache !== 'undefined' ? pianoCodiciCache : [])
      .filter((c) => c.attivo !== false && !['V', 'C'].includes(String(c.codice).toUpperCase()))
      .map(
        (c) =>
          '<option value="' +
          escP(c.codice) +
          '">' +
          escP(c.codice) +
          ' · ' +
          escP(c.descrizione || '') +
          ' (altra assenza, non conta come vacanza)</option>',
      )
      .join('') +
    '</select></div>' +
    '<div style="text-align:left;margin-top:8px"><label style="font-size:var(--fs-sm,.8125rem)"><input type="checkbox" id="nv-conf" checked> Definitiva (va nel piano e conta nel saldo; senza spunta resta provvisoria)</label></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaNuovaVacanza()">Aggiungi</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const el = document.getElementById('nv-sett');
    if (el) el.focus();
  }, 100);
}
async function salvaNuovaVacanza() {
  const nome = (document.getElementById('nv-collab') || {}).value;
  const sett = parseInt((document.getElementById('nv-sett') || {}).value);
  const conf = (document.getElementById('nv-conf') || {}).checked;
  const tipo = String((document.getElementById('nv-tipo') || {}).value || 'V').toUpperCase();
  const annoNv = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const maxNv = _vacSettimaneAnno(annoNv);
  if (!nome || isNaN(sett) || sett < 1 || sett > maxNv) {
    toast('Collaboratore e settimana (1-' + maxNv + ' nel ' + annoNv + ') obbligatori');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  if (_pianoVacCache.find((v) => v.collaboratore === nome && v.settimana === sett)) {
    toast('Vacanza già inserita per questa settimana');
    return;
  }
  try {
    await secPost('piano_vacanze', {
      collaboratore: nome,
      settimana: sett,
      anno: window._pianoVacAnno,
      confermata: conf,
      codice: tipo === 'V' ? null : tipo,
      operatore: getOperatore(),
    });
    logAzione('Vacanza aggiunta', nome + ' settimana ' + sett + '/' + window._pianoVacAnno);
    toast('Vacanza settimana ' + sett + ' aggiunta per ' + nome);
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio vacanza');
  }
}
async function toggleVacanzaConfermata(id) {
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v) return;
  try {
    await secPatch('piano_vacanze', 'id=eq.' + id, { confermata: !v.confermata });
    logAzione(
      'Vacanza ' + (!v.confermata ? 'definitiva' : 'provvisoria'),
      v.collaboratore + ' · settimana ' + v.settimana + ' · ' + v.anno,
    );
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
// settimana ISO (anno, numero) di una data
// settimane ISO dell anno: 53 quando il 28 dicembre cade nella settimana 53 (2026, 2032...)
function _vacSettimaneAnno(anno) {
  return _vacSettimanaDi(parseInt(anno) + '-12-28').settimana;
}
function _vacSettimanaDi(dstr) {
  const d = new Date(dstr + 'T12:00:00');
  const gio = new Date(d);
  gio.setDate(gio.getDate() + 3 - ((gio.getDay() + 6) % 7)); // il giovedi della settimana: decide l anno
  const anno = gio.getFullYear();
  const lun1 = new Date(anno, 0, 4, 12); // la settimana 1 contiene il 4 gennaio
  lun1.setDate(lun1.getDate() - ((lun1.getDay() + 6) % 7));
  const lun = new Date(d);
  lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
  return { anno: anno, settimana: 1 + Math.round((lun - lun1) / 86400000 / 7) };
}
async function modificaVacanza(id) {
  // come vacanze.modifica di Turnivo: cambia la settimana, controllo duplicati
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v) return;
  // DATE LIBERE (05.10, richiesta del titolare): per MT, MI, PC... conta il periodo
  // vero. Con dal / al il programma mette da solo le settimane: se il periodo cade su
  // piu settimane questa riga diventa la prima e le altre si aggiungono; se cambia
  // settimana la riga si sposta. Senza date vale la settimana scritta (tutta).
  const anno = parseInt(v.anno) || window._pianoVacAnno;
  // le date si vedono sempre: quelle della riga o, per una settimana intera, il
  // lunedi e la domenica di quella settimana
  const gW = _pianoGiorniSettimana(anno, v.settimana);
  const r = await chiediModulo(
    v.collaboratore +
      ' · ' +
      (_vacEVacanza(v) ? 'Vacanza' : _vacCodice(v) + ' ' + _vacDescrSigla(_vacCodice(v))) +
      ' · settimana ' +
      v.settimana +
      ' (' +
      _vacDateSettimana(anno, v.settimana) +
      ')',
    [
      {
        titolo: 'Giorni',
        nota: 'Il periodo vero, anche su piu settimane: le settimane le mette il programma (sposta la riga o ne aggiunge).',
        campi: [
          {
            id: 'dal',
            tipo: 'data',
            etichetta: 'dal',
            valore: v.dal ? String(v.dal).substring(0, 10) : gW[0],
            larghezza: 150,
          },
          {
            id: 'al',
            tipo: 'data',
            etichetta: 'al',
            valore: v.al ? String(v.al).substring(0, 10) : gW[6],
            larghezza: 150,
          },
        ],
      },
      { titolo: 'Nota', campi: [{ id: 'nota', valore: v.nota || '', larghezza: 420 }] },
    ],
    { titolo: 'Modifica ' + (_vacEVacanza(v) ? 'vacanza' : 'assenza'), ok: 'Salva' },
  );
  if (!r) return;
  const nota = String(r.nota || '').trim() || null;
  let dal = r.dal || null;
  let al = r.al || null;
  if (dal && !al) al = dal;
  if (al && !dal) dal = al;
  // pezzi: [{ anno, settimana, dal, al }] (dal / al null = tutta la settimana)
  const pezzi = [];
  if (dal) {
    if (al < dal) {
      toast('La data "al" e prima di "dal"');
      return;
    }
    const giorni = Math.round((new Date(al + 'T12:00:00') - new Date(dal + 'T12:00:00')) / 86400000) + 1;
    if (giorni > 120) {
      toast('Periodo troppo lungo (piu di 120 giorni): controlla le date');
      return;
    }
    const cur = new Date(dal + 'T12:00:00');
    while (dataLocaleISO(cur) <= al) {
      const d = dataLocaleISO(cur);
      const w = _vacSettimanaDi(d);
      let p = pezzi.find((x) => x.anno === w.anno && x.settimana === w.settimana);
      if (!p) pezzi.push((p = { anno: w.anno, settimana: w.settimana, dal: d, al: d }));
      p.al = d;
      cur.setDate(cur.getDate() + 1);
    }
    // tutta la settimana = nessun limite
    pezzi.forEach((p) => {
      const g = _pianoGiorniSettimana(p.anno, p.settimana);
      if (p.dal === g[0]) p.dal = null;
      if (p.al === g[6]) p.al = null;
    });
  } else {
    const sett = parseInt(r.sett || v.settimana); // date cancellate: tutta la sua settimana
    if (isNaN(sett) || sett < 1 || sett > 53) {
      toast('Settimana non valida (1-53)');
      return;
    }
    pezzi.push({ anno: anno, settimana: sett, dal: null, al: null });
  }
  // le altre settimane della persona: lette dall archivio (anche di altri settori)
  const anni = [...new Set(pezzi.map((p) => p.anno))];
  const esistenti =
    (await secGet(
      'piano_vacanze?collaboratore=eq.' + encodeURIComponent(v.collaboratore) + '&anno=in.(' + anni.join(',') + ')',
    )) || [];
  const occupata = (p) =>
    esistenti.find((x) => x.id !== id && parseInt(x.anno) === p.anno && x.settimana === p.settimana);
  const conflitti = pezzi.filter((p) => {
    const o = occupata(p);
    return o && _vacCodice(o) !== _vacCodice(v);
  });
  if (conflitti.length) {
    await mostraAvviso(
      v.collaboratore +
        ' ha gia altro in ' +
        conflitti.map((p) => 'settimana ' + p.settimana + ' (' + _vacCodice(occupata(p)) + ')').join(', ') +
        ': correggi prima quella riga.',
      { titolo: 'Modifica vacanza' },
    );
    return;
  }
  try {
    const [primo, ...altri] = pezzi;
    await secPatch('piano_vacanze', 'id=eq.' + id, {
      anno: primo.anno,
      settimana: primo.settimana,
      dal: primo.dal,
      al: primo.al,
      nota: nota,
    });
    for (const p of altri) {
      const o = occupata(p); // stessa sigla gia presente: si aggiornano solo le date
      if (o) await secPatch('piano_vacanze', 'id=eq.' + o.id, { dal: p.dal, al: p.al, nota: nota || o.nota || null });
      else
        await secPost('piano_vacanze', {
          collaboratore: v.collaboratore,
          anno: p.anno,
          settimana: p.settimana,
          dal: p.dal,
          al: p.al,
          nota: nota,
          codice: v.codice || null,
          confermata: v.confermata !== false,
          operatore: getOperatore(),
        });
    }
    const descr = pezzi
      .map((p) => 'sett. ' + p.settimana + (p.dal || p.al ? ' (' + _vacDalAlTesto(p) + ')' : ''))
      .join(', ');
    logAzione('Vacanza modificata', v.collaboratore + ' ' + _vacCodice(v) + ': ' + descr);
    toast(
      v.collaboratore +
        ': ' +
        descr +
        (pezzi.length > 1 ? ' (settimane aggiunte da sole)' : '') +
        '. Riapplica le vacanze al mese per aggiornare il piano',
      7000,
    );
    renderPiano();
  } catch (e) {
    toastErrore('Modifica vacanza non salvata: ' + ((e && e.message) || e));
  }
}
async function eliminaVacanza(id) {
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v || !(await chiediConferma('Eliminare la vacanza di ' + v.collaboratore + ' settimana ' + v.settimana + '?')))
    return;
  try {
    await secDel('piano_vacanze', 'id=eq.' + id);
    logAzione('Vacanza eliminata', v.collaboratore + ' settimana ' + v.settimana + '/' + v.anno);
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
async function eliminaTutteVacanze() {
  if (!_pianoAzioneAutoConsentita('cancella')) return; // azione automatica: permesso apposito
  if (!puoGestirePiano()) return;
  const anno = window._pianoVacAnno;
  if (
    !(await chiediConferma(
      'Eliminare TUTTE le vacanze del ' +
        anno +
        ' di ' +
        repartoLabel(_pianoReparto()) +
        '? (' +
        _pianoVacCache.length +
        ' settimane)\n\nGli altri settori non vengono toccati.',
    ))
  )
    return;
  try {
    // la tabella non ha il settore: si cancellano le righe del settore aperto una per una
    for (const v of _pianoVacCache) await secDel('piano_vacanze', 'id=eq.' + v.id);
    logAzione('Vacanze: eliminate tutte', String(anno));
    toast('Vacanze ' + anno + ' eliminate');
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}

// GIORNI PRECISI DI UNA SETTIMANA DEL FILE VACANZE (05.10, richiesta del titolare):
// le assenze che non durano tutta la settimana (PC, MI, MT...) hanno le date nel
// commento della cella del file ("27-28 APRILE PC", "PROTEZIONE CIVILE 31.03-13.04",
// "24-27.06 CONGEDO MATRIMONIO", "DAL 14.02.2026", "7-18 SETTEMBRE"). Si leggono come
// dal / al (solo la parte dentro la settimana) e si correggono dalla scheda Vacanze.
const _VAC_MESI = [
  'GENNAIO',
  'FEBBRAIO',
  'MARZO',
  'APRILE',
  'MAGGIO',
  'GIUGNO',
  'LUGLIO',
  'AGOSTO',
  'SETTEMBRE',
  'OTTOBRE',
  'NOVEMBRE',
  'DICEMBRE',
];
function _vacDateDaNota(nota, anno, settimana) {
  const t = String(nota || '').toUpperCase();
  if (!t) return null;
  const iso = (g, m, a) => {
    const aa = a ? (String(a).length === 2 ? 2000 + parseInt(a) : parseInt(a)) : anno;
    const gi = parseInt(g);
    const mi = parseInt(m);
    if (!(gi >= 1 && gi <= 31 && mi >= 1 && mi <= 12)) return null;
    return aa + '-' + String(mi).padStart(2, '0') + '-' + String(gi).padStart(2, '0');
  };
  let da = null;
  let a = null;
  let m;
  const meseRe = '(' + _VAC_MESI.join('|') + ')';
  if ((m = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))) {
    da = iso(m[1], m[2], m[3]);
    a = iso(m[4], m[5], m[6] || m[3]);
  } else if ((m = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))) {
    da = iso(m[1], m[3], m[4]);
    a = iso(m[2], m[3], m[4]);
  } else if ((m = t.match(new RegExp('(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+' + meseRe)))) {
    const mi = _VAC_MESI.indexOf(m[3]) + 1;
    da = iso(m[1], mi);
    a = iso(m[2], mi);
  } else if ((m = t.match(/\b(?:DAL|DA\s+[A-Z]+)\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))) {
    da = iso(m[1], m[2], m[3]);
  } else if ((m = t.match(/\b(?:AL|FINO\s+AL)\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/))) {
    a = iso(m[1], m[2], m[3]);
  }
  if (!da && !a) return null;
  if (da && a && a < da) return null;
  // solo la parte dentro la settimana; tutta la settimana = nessun limite
  const sett = _pianoGiorniSettimana(anno, settimana);
  const dentro = sett.filter((d) => (!da || d >= da) && (!a || d <= a));
  if (!dentro.length) return { fuori: true };
  const dal = dentro[0] === sett[0] ? null : dentro[0];
  const al = dentro[dentro.length - 1] === sett[6] ? null : dentro[dentro.length - 1];
  return dal || al ? { dal: dal, al: al } : null;
}
// giorni del piano di una riga di piano_vacanze (dal / al se ci sono)
// GIORNI DI VACANZA PIANIFICATI NELL ANNO (scheda Vacanze e Crediti, stesso numero):
// settimane confermate, solo vacanze (PC, MT... no), contate giorno per giorno con le
// date dal/al. Ogni settimana si calcola con il SUO anno ISO e conta nell anno solare
// del giorno: la settimana 1 del 2026 porta 29-31.12 nel 2025, la 53 del 2026 porta
// 1-3.01 nel 2027 (prima quei giorni non contavano in nessun anno). Ritorna
// { nome: { giorni, settimane: [{ sett, dal, al }] } }.
async function _vacPianificateNellAnno(anno) {
  anno = parseInt(anno);
  const lista =
    (await secGet(
      'piano_vacanze?anno=in.(' + (anno - 1) + ',' + anno + ',' + (anno + 1) + ')&confermata=eq.true&limit=6000',
    )) || [];
  const out = {};
  lista.forEach((v) => {
    const sett = parseInt(v.settimana);
    if (!sett || !_vacEVacanza(v)) return;
    const gg = _vacGiorni(v, parseInt(v.anno) || anno).filter((d) => d.substring(0, 4) === String(anno));
    if (!gg.length) return;
    const o = (out[v.collaboratore] = out[v.collaboratore] || { giorni: 0, settimane: [] });
    o.giorni += gg.length;
    o.settimane.push({ sett: sett, dal: gg[0], al: gg[gg.length - 1] });
  });
  return out;
}
// giorni di vacanza restituiti per malattia nell anno (M sopra una V: "Ex V"), per
// persona e non per settore: il diritto e della persona
async function _vacRestituiteNellAnno(anno) {
  const out = {};
  (
    (await secGet(
      'piano?codice=eq.M&data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&select=collaboratore,data,commento&limit=8000',
    )) || []
  ).forEach((r) => {
    if (/(?:era|^Ex) V1?\b/.test(String(r.commento || ''))) out[r.collaboratore] = (out[r.collaboratore] || 0) + 1;
  });
  return out;
}
function _vacGiorni(v, annoDefault) {
  const dal = v.dal ? String(v.dal).substring(0, 10) : '';
  const al = v.al ? String(v.al).substring(0, 10) : '';
  return _pianoGiorniSettimana(parseInt(v.anno) || annoDefault, v.settimana).filter(
    (d) => (!dal || d >= dal) && (!al || d <= al),
  );
}
// "27.04-28.04" / "dal 14.02" / "" per l elenco
function _vacDalAlTesto(v) {
  const f = (x) => String(x).substring(8, 10) + '.' + String(x).substring(5, 7);
  if (v.dal && v.al) return f(v.dal) + '-' + f(v.al);
  if (v.dal) return 'dal ' + f(v.dal);
  if (v.al) return 'fino al ' + f(v.al);
  return '';
}
function _pianoGiorniSettimana(anno, settimana) {
  // ISO 8601: settimana 1 = quella che contiene il 4 gennaio; lunedì = primo giorno
  const d = new Date(anno, 0, 4, 12);
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1 + (settimana - 1) * 7);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}
// Port 1:1 di step_vacanze.py (Turnivo "Ferie e Riposi"): piazza V protette
// dai blocchi settimana, C prima (1 fissi / 2 jolly, con riporto sul mese
// precedente) e dopo (scala per percentuale 100->1, 80->2, 60->3, 40->4),
// WD (diurno forzato, non protetto) nei giorni prima dei C pre-vacanza.
// Si / No della regola c_prima_dopo_vacanza (assente o spenta = Si, com'era)
function _pianoCongediAttornoVacanze() {
  const v = _pianoRegolaVal('c_prima_dopo_vacanza');
  return v == null ? true : String(v).toUpperCase() !== 'FALSE';
}
async function _applicaVacanzeMese(interattivo) {
  if (!puoGestirePiano() && !window._pianoAutoInCorso) return null; // anche dentro la generazione automatica
  const ym = _pianoMeseSel;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const nGiorni = _pianoUltimoGiorno(ym);
  // regola "congedi attorno alle vacanze" (c_prima_dopo_vacanza): spenta =
  // nessuna C e nessun WD automatici, restano solo le V
  const cAttorno = _pianoCongediAttornoVacanze();
  const cPrimaFissi = cAttorno ? parseInt(_pianoRegolaVal('c_prima_fissi')) || 1 : 0;
  const cPrimaJolly = cAttorno ? parseInt(_pianoRegolaVal('c_prima_jolly')) || 2 : 0;
  const cDopo = {
    100: cAttorno ? parseInt(_pianoRegolaVal('c_dopo_100')) || 1 : 0,
    80: cAttorno ? parseInt(_pianoRegolaVal('c_dopo_80')) || 2 : 0,
    60: cAttorno ? parseInt(_pianoRegolaVal('c_dopo_60')) || 3 : 0,
    40: cAttorno ? parseInt(_pianoRegolaVal('c_dopo_40')) || 4 : 0,
  };
  // jolly: C dopo le vacanze fisse (decisione del titolare 08/10/2026: una prima e una dopo)
  const cDopoJolly = cAttorno ? parseInt(_pianoRegolaVal('c_dopo_jolly')) || 1 : 0;
  const wdPrima = parseInt(_pianoRegolaVal('wd_prima_vacanza'));
  const nWd = !cAttorno ? 0 : isNaN(wdPrima) ? 4 : wdPrima;
  // giorni di lavoro obbligatori anche DOPO le C del rientro (turni prima e dopo le C)
  const wdDopoR = parseInt(_pianoRegolaVal('wd_dopo_vacanza'));
  const nWdDopo = !cAttorno ? 0 : isNaN(wdDopoR) ? 1 : wdDopoR;
  // SETTIMANE A CAVALLO D ANNO: la settimana 53 del 2026 (28.12-03.01) e la
  // settimana 1 del 2026 (dal 29.12.2025) portano giorni nel mese di un altro
  // anno. Si leggono anche le vacanze dell anno prima e dopo e ogni settimana
  // si calcola con il SUO anno; restano solo i giorni del mese aperto. Prima a
  // gennaio le V di fine dicembre mancavano e venivano tolte come "orfane".
  const vacanze =
    (await secGet('piano_vacanze?anno=in.(' + (anno - 1) + ',' + anno + ',' + (anno + 1) + ')&limit=6000')) || [];
  // solo chi ha QUESTO come settore principale: le vacanze di chi lavora in due settori
  // le applica il suo settore (la cella e una sola e si vede in entrambi). Prima il
  // settore extra le riapplicava e sovrascriveva i turni dell altro settore con WD e
  // ne cambiava il settore (prova 08/10: Balliu, R22 C23 C0 delle Slot -> WD dal Valet)
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto())
    .map((c) => c.nome);
  // settimane -> giorni del mese corrente
  const vacGiorni = {}; // nome -> Set(giorno)   solo vacanze (V)
  const altreGiorni = {}; // nome -> { giorno: sigla }   altre assenze della settimana (PC, MT...)
  vacanze.forEach((v) => {
    if (!nomiRep.includes(v.collaboratore)) return;
    if (!v.confermata) return; // provvisoria: resta in elenco, non va nel piano
    const sigla = _vacCodice(v);
    _vacGiorni(v, anno).forEach((dstr) => {
      const p = dstr.split('-');
      if (parseInt(p[0]) !== anno || parseInt(p[1]) !== mese) return;
      if (!_pianoOperativoIl(v.collaboratore, dstr)) return; // fuori dal rapporto: niente V
      if (sigla === 'V') (vacGiorni[v.collaboratore] = vacGiorni[v.collaboratore] || new Set()).add(parseInt(p[2]));
      else (altreGiorni[v.collaboratore] = altreGiorni[v.collaboratore] || {})[parseInt(p[2])] = sigla;
    });
  });
  // LA MALATTIA PREVALE (decisione del titolare 08/10/2026): nei giorni di malattia
  // (registrata nel Diario o M/I nel piano) niente V, C, WD ne altre assenze. Il giorno
  // di vacanza diventa M protetta con la nota "Ex V", come quando la malattia si registra
  // sopra una V gia scritta: le ore restano quelle della vacanza e, tolta la malattia, la
  // V torna (sincronizzaMalattiaPiano). Prima una malattia del Diario sui giorni senza
  // cella (la M si vede in automatico) veniva coperta: prova 08/10, Bonavetti malata
  // 2-21.11 con vacanza 9-15.11 -> V 9-15, C 8 e 16, WD 7 e 17, C 4-6
  const malato = {}; // 'nome minuscolo|giorno' -> true
  Object.keys(_pianoMalattieMese(ym)).forEach((k) => {
    const i = k.lastIndexOf('|');
    malato[k.substring(0, i).toLowerCase() + '|' + parseInt(k.substring(i + 1).split('-')[2])] = true;
  });
  (
    (await secGet(
      'piano?data=gte.' +
        ym +
        '-01&data=lte.' +
        ym +
        '-' +
        String(nGiorni).padStart(2, '0') +
        '&codice=in.(M,M1,I,I1)&select=collaboratore,data&limit=5000',
    )) || []
  ).forEach((r) => (malato[String(r.collaboratore).toLowerCase() + '|' + parseInt(r.data.split('-')[2])] = true));
  const eMalato = (nome, g) => !!malato[String(nome).toLowerCase() + '|' + g];
  const vacInMalattia = []; // { nome, g }: giorni di vacanza da segnare M "Ex V"
  Object.keys(vacGiorni).forEach((nome) => {
    [...vacGiorni[nome]].forEach((g) => {
      if (eMalato(nome, g)) {
        vacGiorni[nome].delete(g);
        vacInMalattia.push({ nome: nome, g: g });
      }
    });
    if (!vacGiorni[nome].size) delete vacGiorni[nome];
  });
  Object.keys(altreGiorni).forEach((nome) => {
    Object.keys(altreGiorni[nome]).forEach((g) => {
      if (eMalato(nome, parseInt(g))) delete altreGiorni[nome][g];
    });
    if (!Object.keys(altreGiorni[nome]).length) delete altreGiorni[nome];
  });
  // GIORNI CHIUSI: il piano dei giorni passati e un documento. Si lavora solo
  // dal primo giorno aperto; nei giorni chiusi non si cancella e non si scrive
  // niente, e le differenze che restano si elencano (niente di nascosto).
  // Prima si cancellavano le V/C/WD di tutto il mese e il reinserimento sui
  // giorni chiusi falliva: le vacanze restavano perse.
  const _chiuso = (dstr) => _pianoGiornoBloccato(dstr) && !_pianoGiornoSbloccato(dstr);
  let primoAperto = 1;
  while (primoAperto <= nGiorni && _chiuso(ym + '-' + String(primoAperto).padStart(2, '0'))) primoAperto++;
  const nonToccati = []; // { nome, data, voluto, attuale }
  const cNonMesse = []; // C prima delle vacanze nel mese prima non messe (turno protetto): { nome, data, attuale }
  if (primoAperto > nGiorni) {
    if (interattivo) toast('Il mese ' + ym + ' e tutto chiuso: le vacanze non vengono riapplicate');
    return { v: 0, c: 0, wd: 0, orfane: 0, altre: 0, nonToccati: nonToccati, primoAperto: primoAperto };
  }
  const da = ym + '-' + String(primoAperto).padStart(2, '0');
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  // le celle scritte da qui (V, PC, MT...) portano questo commento: cosi ai giri
  // successivi si aggiornano senza toccare le stesse sigle inserite a mano
  const COMMENTO_ALTRE = 'Piano vacanze: ';
  const COMMENTO_V = COMMENTO_ALTRE + 'Vacanza';
  // le V scritte da qui non portano piu il commento (decisione del titolare 08/10/2026:
  // non serve vederlo): il segno e "protetta e generata dal programma", invisibile
  const daVacanze = (r) =>
    String(r.commento || '').startsWith(COMMENTO_ALTRE) || (r.codice === 'V' && r.protetto && r.generato);
  // V ORFANE: se una vacanza e' stata spostata o tolta dalla scheda Vacanze,
  // le V scritte da qui rimaste senza settimana corrispondente vengono rimosse.
  // Le V scritte a mano (o importate) senza vacanza nel file NON si toccano: si
  // elencano da controllare (prima si cancellavano anche quelle, controllo 05.10:
  // 14 V protette tolte a Valet novembre e sostituite con turni)
  let nOrfane = 0;
  const vSenzaFile = []; // { nome, data }
  {
    const righeV =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&codice=eq.V&limit=2000',
      )) || [];
    const senza = righeV.filter((r) => {
      if (!nomiRep.includes(r.collaboratore)) return false;
      const g = parseInt(r.data.split('-')[2]);
      if (vacInMalattia.some((x) => x.nome === r.collaboratore && x.g === g)) return false; // diventa M sotto
      return !(vacGiorni[r.collaboratore] && vacGiorni[r.collaboratore].has(g));
    });
    // nella generazione automatica non si cancella niente di protetto: anche le V delle
    // vacanze spostate restano e vanno nel resoconto da controllare
    const auto = !!window._pianoAutoInCorso;
    // una V in una settimana REGISTRATA nel file per quella persona viene dalla vacanza
    // (anche se scritta prima del segno): se la settimana si accorcia (dal / al) o
    // cambia, si toglie. Restano solo le V in settimane senza vacanza registrata
    const settReg = new Set();
    vacanze.forEach((v) => {
      if (v.confermata && _vacEVacanza(v))
        settReg.add(v.collaboratore + '|' + (parseInt(v.anno) || anno) + '|' + v.settimana);
    });
    const diSettReg = (r) => {
      const w = _vacSettimanaDi(String(r.data).substring(0, 10));
      return settReg.has(r.collaboratore + '|' + w.anno + '|' + w.settimana);
    };
    const dalFile = (r) => daVacanze(r) || diSettReg(r);
    const orfane = auto ? [] : senza.filter(dalFile);
    senza.filter((r) => auto || !dalFile(r)).forEach((r) => vSenzaFile.push({ nome: r.collaboratore, data: r.data }));
    for (let i = 0; i < orfane.length; i += 10) {
      await Promise.all(orfane.slice(i, i + 10).map((r) => secDel('piano', 'id=eq.' + r.id)));
    }
    nOrfane = orfane.length;
    if (nOrfane) logAzione('Vacanze: V rimosse', ym + ' · ' + nOrfane + " giorni non piu' in vacanza");
  }
  // via le V/C/WD dei giri precedenti: i WD (non protetti) e i C scritti da
  // "Applica" (protetti ma generati); gli inserimenti a mano restano
  await secDel(
    'piano',
    'data=gte.' +
      da +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&protetto=eq.false&generato=eq.true&codice=in.(V,C,WD)',
  );
  await secDel(
    'piano',
    'data=gte.' +
      da +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&protetto=eq.true&generato=eq.true&codice=eq.C',
  );
  // VACANZA IN MALATTIA: M protetta con la nota "Ex V" (stessa forma della malattia
  // registrata sopra una V: ore della vacanza nei primi 14 giorni, V di ritorno se la
  // malattia si toglie). Le M/I gia presenti restano; nella generazione automatica le
  // celle scritte a mano diverse dalla V non si toccano (vanno nel resoconto)
  let nRestituiti = 0;
  if (vacInMalattia.length) {
    const righeMal =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000',
      )) || [];
    const perCellaMal = {};
    righeMal.forEach((r) => (perCellaMal[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
    const opM = getOperatore();
    for (const x of vacInMalattia) {
      if (x.g < primoAperto) continue; // giorno chiuso: non si tocca
      const dstrM = ym + '-' + String(x.g).padStart(2, '0');
      const r = perCellaMal[x.nome + '|' + x.g];
      if (r && ['M', 'M1', 'I', 'I1'].includes(r.codice)) continue;
      if (r && r.codice !== 'V' && (r.protetto || (window._pianoAutoInCorso && !r.generato))) {
        if (window._pianoAutoInCorso)
          (window._pianoAutoInCorso.aManoNonToccate = window._pianoAutoInCorso.aManoNonToccate || []).push({
            nome: x.nome,
            data: dstrM,
            voluto: 'M',
            attuale: r.codice,
          });
        continue;
      }
      const datiM = {
        codice: 'M',
        protetto: true,
        generato: false,
        commento: ('Ex V - ' + opM).substring(0, 400),
        operatore: opM,
      };
      if (r) await secPatch('piano', 'id=eq.' + r.id, Object.assign({ updated_at: new Date().toISOString() }, datiM));
      else
        await _pianoInserisciCella(
          Object.assign({ collaboratore: x.nome, data: dstrM, reparto_dip: _pianoReparto() }, datiM),
        );
      nRestituiti++;
    }
    if (nRestituiti)
      logAzione('Vacanze: giorni in malattia', ym + ' · ' + nRestituiti + ' giorni di vacanza segnati M (Ex V)');
  }
  // ALTRE ASSENZE (PC, MT...): scritte con il commento COMMENTO_ALTRE
  let nAltre = 0;
  {
    const righeMese =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000',
      )) || [];
    // le V hanno il loro giro (sopra e sotto): qui solo le altre assenze
    const giaScritte = righeMese.filter((r) => r.codice !== 'V' && daVacanze(r));
    for (const r of giaScritte) {
      const g = parseInt(r.data.split('-')[2]);
      const voluta = altreGiorni[r.collaboratore] && altreGiorni[r.collaboratore][g];
      if (voluta !== r.codice) await secDel('piano', 'id=eq.' + r.id);
    }
    const perCellaM = {};
    righeMese.forEach((r) => (perCellaM[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
    for (const nome of Object.keys(altreGiorni)) {
      for (const g of Object.keys(altreGiorni[nome])) {
        const sigla = altreGiorni[nome][g];
        const r = perCellaM[nome + '|' + g];
        if (parseInt(g) < primoAperto) {
          nonToccati.push({ nome: nome, data: ym + '-' + String(g).padStart(2, '0'), voluto: sigla });
          continue;
        }
        if (r && String(r.commento || '').startsWith(COMMENTO_ALTRE) && r.codice === sigla) continue;
        if (r && r.protetto && !String(r.commento || '').startsWith(COMMENTO_ALTRE)) continue; // protette: mai toccate
        const dati = {
          codice: sigla,
          protetto: true,
          generato: true,
          commento: COMMENTO_ALTRE + _vacDescrSigla(sigla),
          operatore: getOperatore(),
        };
        if (r && !(String(r.commento || '').startsWith(COMMENTO_ALTRE) && r.codice !== sigla))
          await secPatch('piano', 'id=eq.' + r.id, Object.assign({ updated_at: new Date().toISOString() }, dati));
        else
          await _pianoInserisciCella(
            Object.assign(
              { collaboratore: nome, data: ym + '-' + String(g).padStart(2, '0'), reparto_dip: _pianoReparto() },
              dati,
            ),
          );
        nAltre++;
      }
    }
  }
  // le altre assenze (PC, MT...) seguono la stessa regola delle vacanze per i C
  // prima e dopo (e i diurni prima): insieme alle V formano un unico blocco
  // VACANZE FINITE IL MESE PRIMA (es. fino al 31.10): le C dopo le vacanze cadono in
  // questo mese (1 e 2.11). Prima si perdevano: il mese della vacanza saltava i giorni
  // oltre la fine e questo mese non sapeva della vacanza. Chi ha la vacanza (V, o
  // un altra assenza del file) l ultimo giorno del mese prima entra nei blocchi.
  const codaPrec = {};
  if (cAttorno) {
    const ultPrec = dataLocaleISO(new Date(anno, mese - 1, 0, 12));
    ((await secGet('piano?data=eq.' + ultPrec + '&reparto_dip=eq.' + _pianoReparto() + '&limit=2000')) || []).forEach(
      (r) => {
        if (r.codice === 'V' || daVacanze(r)) codaPrec[r.collaboratore] = true;
      },
    );
  }
  const nomiBlocchi = [...new Set(Object.keys(vacGiorni).concat(Object.keys(altreGiorni), Object.keys(codaPrec)))];
  if (!nomiBlocchi.length) {
    if (interattivo)
      toast(
        nOrfane
          ? nOrfane + ' V rimosse (vacanze spostate); nessuna vacanza cade in ' + ym
          : 'Nessuna vacanza cade in ' + ym + ' per questo settore',
      );
    return { v: 0, c: 0, wd: 0, orfane: nOrfane, altre: nAltre, vSenzaFile: vSenzaFile, restituiti: nRestituiti };
  }
  const righe =
    (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000')) ||
    [];
  const perCella = {}; // nome|g -> riga
  righe.forEach((r) => (perCella[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  let nV = 0;
  let nC = 0;
  let nWdP = 0;
  const op = getOperatore();
  const scrivi = async (nome, g, codice, protetto, generato, commento) => {
    const r = perCella[nome + '|' + g];
    // prima dell assunzione o dopo la fine del rapporto non si scrive niente (C, WD)
    if (!_pianoOperativoIl(nome, dstrDi(g))) return false;
    // in malattia niente C o WD attorno alle vacanze: il giorno resta malattia
    if (eMalato(nome, g)) return false;
    if (g < primoAperto) {
      // giorno chiuso: niente scrittura, ma se la cella e diversa si segnala
      if (!r || (r.codice !== codice && !r.protetto))
        nonToccati.push({ nome: nome, data: dstrDi(g), voluto: codice, attuale: r ? r.codice : '' });
      return false;
    }
    if (r) {
      if (r.protetto) return false; // mai toccare le protette
      if (r.codice === codice) return false;
      // GENERAZIONE AUTOMATICA: le celle scritte a mano non si toccano mai, nemmeno
      // per una vacanza; il conflitto va nel resoconto da controllare
      const auto = window._pianoAutoInCorso;
      if (auto && !r.generato) {
        (auto.aManoNonToccate = auto.aManoNonToccate || []).push({
          nome: nome,
          data: dstrDi(g),
          voluto: codice,
          attuale: r.codice,
        });
        return false;
      }
      await secPatch(
        'piano',
        'id=eq.' + r.id,
        Object.assign(
          {
            codice: codice,
            protetto: protetto,
            generato: generato,
            operatore: op,
            updated_at: new Date().toISOString(),
          },
          commento ? { commento: commento } : {},
        ),
      );
      r.codice = codice;
      r.protetto = protetto;
    } else {
      const n = await _pianoInserisciCella(
        Object.assign(
          {
            collaboratore: nome,
            data: dstrDi(g),
            codice: codice,
            protetto: protetto,
            generato: generato,
            reparto_dip: _pianoReparto(),
            operatore: op,
          },
          commento ? { commento: commento } : {},
        ),
      );
      if (n) perCella[nome + '|' + g] = n;
    }
    return true;
  };
  for (const nome of nomiBlocchi) {
    const soloV = [...(vacGiorni[nome] || [])].sort((x, y) => x - y);
    const setVac = new Set(soloV.concat(Object.keys(altreGiorni[nome] || {}).map((g) => parseInt(g))));
    const giorni = [...setVac].sort((x, y) => x - y);
    const info = _pianoCollabInfo(nome) || {};
    // V protette su ogni giorno di vacanza (le protette esistenti restano)
    for (const g of soloV) {
      const r = perCella[nome + '|' + g];
      if (r && r.protetto) {
        // una V gia presente sul giorno di una vacanza del file prende il segno delle
        // vacanze: se la vacanza si sposta, si toglie con le altre
        // (e le V con il vecchio commento lo perdono: resta solo il segno invisibile)
        if (r.codice === 'V' && g >= primoAperto && (r.commento === COMMENTO_V || (!r.commento && !r.generato))) {
          await secPatch('piano', 'id=eq.' + r.id, {
            commento: null,
            generato: true,
            updated_at: new Date().toISOString(),
          });
          r.commento = null;
          r.generato = true;
        }
        continue;
      }
      if (await scrivi(nome, g, 'V', true, true, null)) nV++;
    }
    // blocchi contigui; una vacanza che arriva dal mese prima e continua il giorno 1
    // inizia "prima" del mese (giorno 0): niente C prima, le C dopo si mettono qui
    const blocchi = [];
    if (giorni.length) {
      let bIni = giorni[0] === 1 && codaPrec[nome] ? 0 : giorni[0];
      let bFine = giorni[0];
      for (const g of giorni.slice(1)) {
        if (g === bFine + 1) bFine = g;
        else {
          blocchi.push([bIni, bFine]);
          bIni = g;
          bFine = g;
        }
      }
      blocchi.push([bIni, bFine]);
    } else if (codaPrec[nome]) blocchi.push([0, 0]); // vacanza finita l ultimo giorno del mese prima
    const pct = info.percentuale != null ? info.percentuale : 1.0;
    const nCPrima = info.is_jolly ? cPrimaJolly : cPrimaFissi;
    const nCDopo = info.is_jolly
      ? cDopoJolly
      : pct >= 1.0
        ? cDopo[100]
        : pct >= 0.8
          ? cDopo[80]
          : pct >= 0.6
            ? cDopo[60]
            : cDopo[40];
    const cGiorni = new Set();
    const cMesePrec = []; // giorni del mese precedente
    const dPrec = new Date(anno, mese - 2, 15);
    const nGiorniPrec = new Date(dPrec.getFullYear(), dPrec.getMonth() + 1, 0).getDate();
    for (const [bstart, bend] of blocchi) {
      for (let off = 1; off <= (bstart >= 1 ? nCPrima : 0); off++) {
        const prima = bstart - off;
        if (prima >= 1 && prima <= nGiorni && !setVac.has(prima)) cGiorni.add(prima);
        else if (prima < 1) {
          const gPrec = nGiorniPrec + prima;
          if (gPrec >= 1 && gPrec <= nGiorniPrec) cMesePrec.push(gPrec);
        }
      }
      for (let off = 1; off <= nCDopo; off++) {
        const dopo = bend + off;
        if (dopo >= 1 && dopo <= nGiorni && !setVac.has(dopo)) cGiorni.add(dopo);
      }
    }
    for (const g of [...cGiorni].sort((x, y) => x - y)) {
      if (await scrivi(nome, g, 'C', true, true)) nC++;
    }
    // WD: diurni forzati prima dei C pre-vacanza (non protetti)
    if (nWd > 0 || nWdDopo > 0) {
      const wdSet = new Set();
      for (const [bstart, bend] of blocchi) {
        if (bstart >= 1) {
          // vacanza iniziata in questo mese: giorni di lavoro prima delle C
          const primoC = bstart - nCPrima;
          for (let off = 1; off <= nWd; off++) {
            const g = primoC - off;
            if (g >= 1 && g <= nGiorni && !setVac.has(g) && !cGiorni.has(g)) wdSet.add(g);
          }
        }
        // e dopo le C del rientro
        const ultimoC = bend + nCDopo;
        for (let off = 1; off <= nWdDopo; off++) {
          const g = ultimoC + off;
          if (g >= 1 && g <= nGiorni && !setVac.has(g) && !cGiorni.has(g)) wdSet.add(g);
        }
      }
      for (const g of [...wdSet].sort((x, y) => x - y)) {
        if (await scrivi(nome, g, 'WD', false, true)) nWdP++;
      }
    }
    // C a cavallo del mese precedente
    for (const gPrec of cMesePrec) {
      const ymPrec = dPrec.getFullYear() + '-' + String(dPrec.getMonth() + 1).padStart(2, '0');
      const dstrP = ymPrec + '-' + String(gPrec).padStart(2, '0');
      if (_chiuso(dstrP)) {
        nonToccati.push({ nome: nome, data: dstrP, voluto: 'C' });
        continue;
      }
      const es = (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + dstrP)) || [];
      // gia un riposo o un assenza: la regola e rispettata
      if (es.length && !_pianoIsLavoro(es[0].codice)) continue;
      // GENERAZIONE AUTOMATICA: il mese prima non si tocca (si genera solo il mese
      // prenotato); se c e un turno, il caso va nel resoconto da sistemare a mano
      if (window._pianoAutoInCorso) {
        if (es.length)
          (window._pianoAutoInCorso.aManoNonToccate = window._pianoAutoInCorso.aManoNonToccate || []).push({
            nome: nome,
            data: dstrP,
            voluto: 'C (prima delle vacanze)',
            attuale: es[0].codice,
          });
        else
          (window._pianoAutoInCorso.cMesePrima = window._pianoAutoInCorso.cMesePrima || []).push({
            nome: nome,
            data: dstrP,
          });
        continue;
      }
      if (es.length) {
        if (!es[0].protetto) {
          // protetta come le C dentro il mese: una bozza rifatta del mese prima non la toglie
          await secPatch('piano', 'id=eq.' + es[0].id, { codice: 'C', generato: true, protetto: true, operatore: op });
          nC++;
        } else cNonMesse.push({ nome: nome, data: dstrP, attuale: es[0].codice }); // turno protetto: si segnala
      } else {
        await _pianoInserisciCella({
          collaboratore: nome,
          data: dstrP,
          codice: 'C',
          protetto: true,
          generato: true,
          reparto_dip: _pianoReparto(),
          operatore: op,
        });
        nC++;
      }
    }
  }
  logAzione(
    'Piano: vacanze applicate',
    ym +
      ' · ' +
      nV +
      ' V, ' +
      nC +
      ' C, ' +
      nWdP +
      ' WD' +
      (nAltre ? ', ' + nAltre + ' altre assenze (PC, MT...)' : ''),
  );
  if (nonToccati.length)
    logAzione(
      'Vacanze: giorni chiusi non toccati',
      ym +
        ' · ' +
        nonToccati
          .map((x) => x.nome + ' ' + x.data + ' ' + x.voluto)
          .join(', ')
          .substring(0, 900),
    );
  if (window._pianoAutoInCorso && vSenzaFile.length) window._pianoAutoInCorso.vSenzaFile = vSenzaFile;
  return {
    v: nV,
    c: nC,
    wd: nWdP,
    orfane: nOrfane,
    altre: nAltre,
    nonToccati: nonToccati,
    primoAperto: primoAperto,
    vSenzaFile: vSenzaFile,
    cNonMesse: cNonMesse,
    restituiti: nRestituiti,
  };
}
// "Rossi Mario 03.11-09.11, Bianchi Anna 21.11": giorni di fila raccolti per persona
function _vacElencoGiorni(l) {
  const per = {};
  l.forEach((x) => (per[x.nome] = per[x.nome] || []).push(x.data));
  return Object.keys(per)
    .sort()
    .map((nome) => {
      const d = per[nome].sort();
      const tratti = [];
      d.forEach((x) => {
        const u = tratti[tratti.length - 1];
        const ieri = new Date(x + 'T12:00:00');
        ieri.setDate(ieri.getDate() - 1);
        if (u && u[1] === dataLocaleISO(ieri)) u[1] = x;
        else tratti.push([x, x]);
      });
      const f = (x) => x.substring(8, 10) + '.' + x.substring(5, 7);
      return '\u2022 ' + nome + ' ' + tratti.map((t) => (t[0] === t[1] ? f(t[0]) : f(t[0]) + '-' + f(t[1]))).join(', ');
    })
    .join('\n');
}
async function applicaVacanzePiano() {
  if (!_pianoAzioneAutoConsentita('vacanze')) return; // azione automatica: permesso apposito
  const MESI_L = MESI_FULL || [];
  const lbl = (MESI_L[parseInt(_pianoMeseSel.split('-')[1]) - 1] || '') + ' ' + _pianoMeseSel.split('-')[0];
  if (
    !(await chiediConferma(
      'Applicare le vacanze a ' +
        lbl +
        ' (' +
        repartoLabel(_pianoReparto()) +
        ')?\n\nScrive le V (protette) sui giorni di vacanza, i congedi C prima/dopo i blocchi e i WD (diurno forzato) secondo le regole. Le celle protette esistenti non vengono toccate.',
    ))
  )
    return;
  _pianoUndoSnap('applica vacanze ' + _pianoMeseSel);
  let r = null;
  try {
    r = await _applicaVacanzeMese(true);
  } catch (e) {
    // prima l errore finiva solo nella console e la griglia non si aggiornava
    toastErrore('Applica vacanze interrotto: ' + ((e && e.message) || e) + '. Il calendario mostra lo stato attuale.');
  }
  if (r)
    toast(
      'Piazzate ' +
        r.v +
        ' V, ' +
        r.c +
        ' C, ' +
        r.wd +
        ' WD' +
        (r.altre ? ', ' + r.altre + ' altre assenze' : '') +
        (r.orfane ? ' · rimosse ' + r.orfane + ' V di vacanze spostate' : '') +
        (r.restituiti ? ' · ' + r.restituiti + ' giorni di vacanza in malattia: segnati M (Ex V)' : ''),
    );
  if (r && r.cNonMesse && r.cNonMesse.length)
    await mostraAvviso(
      'C prima delle vacanze NON messe nel mese precedente (c e un turno protetto o scritto a mano): da sistemare a mano.\n\n' +
        r.cNonMesse
          .map((x) => '\u2022 ' + x.nome + ' ' + x.data.split('-').reverse().join('.') + ': oggi ' + x.attuale)
          .join('\n'),
      { titolo: 'Vacanze da controllare' },
    );
  if (r && r.vSenzaFile && r.vSenzaFile.length)
    await mostraAvviso(
      'V scritte nel piano senza vacanza nel file (' +
        r.vSenzaFile.length +
        ' giorni): lasciate come sono. Se la vacanza non c e piu, toglile a mano; se c e, aggiungila nella scheda Vacanze.\n\n' +
        _vacElencoGiorni(r.vSenzaFile),
      { titolo: 'Vacanze da controllare' },
    );
  if (r && r.nonToccati && r.nonToccati.length)
    await mostraAvviso(
      'Giorni chiusi non toccati (' +
        r.nonToccati.length +
        '): il piano dei giorni passati non si modifica senza sblocco.\n\n' +
        r.nonToccati
          .slice(0, 30)
          .map(
            (x) =>
              '\u2022 ' +
              x.nome +
              ' ' +
              x.data.split('-').reverse().join('.') +
              ': previsto ' +
              x.voluto +
              (x.attuale != null ? ', oggi ' + (x.attuale || 'vuoto') : ''),
          )
          .join('\n') +
        (r.nonToccati.length > 30 ? '\n... e altri ' + (r.nonToccati.length - 30) : '') +
        '\n\nPer correggerli: sblocca il giorno (permesso "Giorni chiusi") e riapplica.',
      { titolo: 'Vacanze applicate dal ' + r.primoAperto + ' in poi' },
    );
  _pianoTab = 'calendario';
  localStorage.setItem('piano_tab', 'calendario');
  renderPiano();
}

// Abbinamento del nome scritto nel file HR con l'anagrafica: tollera refusi
// (Blader/Bledar), nomi invertiti, abbreviazioni (AZEVEDO M. / MARCO P.) e
// cerca prima nel settore, poi in tutta l'anagrafica, perche' chi copre altri
// reparti compare anche nei loro fogli vacanze.
function _vacNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _vacLev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function _vacSimile(a, b) {
  if (a === b) return 3;
  if (a.length > 3 && b.length > 3) {
    const d = _vacLev(a, b);
    if (d === 1) return 2.5;
    if (d === 2 && Math.min(a.length, b.length) > 5) return 2;
  }
  if (a.startsWith(b) || b.startsWith(a)) return 2;
  return 0;
}
function _vacAbbina(cognome, nome, rep) {
  const tok = (_vacNorm(cognome) + ' ' + _vacNorm(nome)).split(' ').filter((x) => x.length > 1);
  if (!tok.length) return null;
  const punteggio = (c) => {
    const ct = _vacNorm(c.nome).split(' ');
    const usati = new Set();
    let s = 0;
    tok.forEach((w) => {
      let best = 0;
      let bi = -1;
      ct.forEach((y, i) => {
        if (usati.has(i)) return;
        const v = _vacSimile(w, y);
        if (v > best) {
          best = v;
          bi = i;
        }
      });
      if (best > 0) {
        s += best;
        usati.add(bi);
      }
    });
    return s;
  };
  const cerca = (lista) => {
    let best = null;
    let bs = 0;
    lista.forEach((c) => {
      const s = punteggio(c);
      if (s > bs) {
        bs = s;
        best = c;
      }
    });
    return bs >= 4 ? { c: best, score: bs } : null;
  };
  const attivi = collaboratoriCache.filter((c) => c.attivo !== false);
  const delRep = attivi.filter((c) => (c.reparto_dip || 'slots') === (rep || _pianoReparto()));
  return cerca(delRep) || cerca(attivi) || cerca(collaboratoriCache);
}
// SIGLA DI UNA SETTIMANA: vuota o V = vacanza (conta nei giorni di vacanza);
// un altra sigla del Piano (PC Protezione Civile, MT Matrimonio...) = altra
// assenza: sta nella scheda Vacanze ma NON conta come vacanza.
function _vacCodice(v) {
  return String((v && v.codice) || 'V').toUpperCase() || 'V';
}
function _vacEVacanza(v) {
  return _vacCodice(v) === 'V';
}
function _vacDescrSigla(c) {
  if (c === 'V') return 'Vacanza';
  const i = (typeof pianoCodiciCache !== 'undefined' ? pianoCodiciCache : []).find(
    (x) => String(x.codice).toUpperCase() === c,
  );
  return (i && i.descrizione) || c;
}
// cella del file: X (o V) = vacanza, sigla del Piano = altra assenza, vuota = niente,
// qualsiasi altra cosa = simbolo non riconosciuto. Maiuscole e minuscole uguali.
function _vacLeggiCella(testo) {
  const t = String(testo == null ? '' : testo)
    .trim()
    .toUpperCase();
  if (!t) return null;
  if (t === 'X' || t === 'V') return 'V';
  const sigle = []
    .concat(typeof pianoCodiciCache !== 'undefined' ? pianoCodiciCache : [])
    .concat(typeof pianoTurniCache !== 'undefined' ? pianoTurniCache : [])
    .map((c) => String(c.codice || '').toUpperCase());
  return sigle.includes(t) ? t : { ignoto: t };
}
// ===== IMPORT VACANZE (Excel o PDF nel formato HR) =====
// Formato ufficiale: riga di intestazione con COGNOME | NOME | anno |
// Pianificate | 52 | 1..52, poi una riga per persona con la X sulle settimane.
// Vale sia per il file Excel sia per il PDF stampato dallo stesso foglio.
function _vacRigheDaExcel(wb) {
  // il foglio giusto e' quello che contiene l'intestazione COGNOME/NOME
  let rows = null;
  let ws = null;
  const leggiFoglio = (w) => XLSX.utils.sheet_to_json(w, { header: 1, defval: '', blankrows: true });
  for (const sn of wb.SheetNames) {
    const r = leggiFoglio(wb.Sheets[sn]);
    if (r.some((x) => /cognome/i.test(String(x[0] || '')) && /nome/i.test(String(x[1] || '')))) {
      rows = r;
      ws = wb.Sheets[sn];
      break;
    }
  }
  if (!rows) {
    ws = wb.Sheets[wb.SheetNames[0]];
    rows = leggiFoglio(ws);
  }
  // COMMENTI DELLE CELLE (note di Excel): date precise e note della settimana. La prima
  // riga del commento e l autore ("OpTable:"), si toglie
  const inizio = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s : { r: 0, c: 0 };
  const commento = (i, col) => {
    const cell = ws && ws[XLSX.utils.encode_cell({ r: inizio.r + i, c: inizio.c + col })];
    if (!cell || !cell.c || !cell.c.length) return '';
    // solo il nome dell autore ("OpTable:" e a capo): una nota con un orario o con i due
    // punti ("MT: 10:00") non perde piu il testo
    return cell.c
      .map((x) => {
        let t = String(x.t || '');
        if (x.a && t.startsWith(x.a + ':')) t = t.slice(x.a.length + 1);
        else t = t.replace(/^[^\n:]{1,40}:[ \t]*\r?\n/, '');
        return t;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const out = [];
  const ignoti = [];
  const noteSenzaX = []; // commenti su settimane senza X (richieste, cambi): da controllare
  // SETTIMANA 53 (2026): il file la ha solo se l intestazione ha la colonna "53" dopo la 52.
  // Le settimane oltre quelle del file non si toccano all import (prima una 53 inserita
  // a mano veniva tolta perche il file non la leggeva)
  const maxW = rows.some((r) => String(r[4 + 52]).trim() === '52' && String(r[4 + 53]).trim() === '53') ? 53 : 52;
  rows.forEach((r, i) => {
    const cognome = String(r[0] || '').trim();
    const nome = String(r[1] || '').trim();
    if (!cognome || /cognome/i.test(cognome)) return;
    const sett = [];
    for (let w = 1; w <= maxW; w++) {
      const c = _vacLeggiCella(r[4 + w]);
      const nota = commento(i, 4 + w);
      if (c && c.ignoto) ignoti.push('"' + c.ignoto + '" per ' + (cognome + ' ' + nome).trim() + ', settimana ' + w);
      else if (c) sett.push({ w: w, codice: c, nota: nota });
      else if (nota) noteSenzaX.push((cognome + ' ' + nome).trim() + ', settimana ' + w + ': ' + nota);
    }
    out.push({ cognome: cognome, nome: nome, settimane: sett });
  });
  return { righe: out, ignoti: ignoti, noteSenzaX: noteSenzaX, maxW: maxW };
}
async function _vacRigheDaPdf(file) {
  // pdf.js: si prendono le posizioni orizzontali dei numeri di settimana
  // nell'intestazione e si assegna ogni X alla colonna piu' vicina
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!lib) throw new Error('lettore PDF non disponibile');
  lib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const out = [];
  let maxWPdf = 52; // 53 se l intestazione ha la settimana 53
  const ignoti = [];
  for (let np = 1; np <= pdf.numPages; np++) {
    const page = await pdf.getPage(np);
    const txt = await page.getTextContent();
    const items = txt.items
      .map((i) => ({ s: String(i.str || '').trim(), x: i.transform[4], y: Math.round(i.transform[5]) }))
      .filter((i) => i.s);
    // righe: raggruppo per y (tolleranza 3 punti)
    const righe = [];
    items.forEach((i) => {
      let r = righe.find((x) => Math.abs(x.y - i.y) <= 3);
      if (!r) {
        r = { y: i.y, items: [] };
        righe.push(r);
      }
      r.items.push(i);
    });
    righe.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    righe.sort((a, b) => b.y - a.y);
    // intestazione: la riga che contiene i numeri 1..52 in sequenza
    let head = null;
    for (const r of righe) {
      const nums = r.items.filter((i) => /^\d{1,2}$/.test(i.s)).map((i) => ({ n: parseInt(i.s), x: i.x }));
      if (nums.length >= 40 && nums.some((v) => v.n === 1) && nums.some((v) => v.n === 52)) {
        head = nums;
        break;
      }
    }
    if (!head) continue;
    const colonne = {};
    head.forEach((v) => {
      if (v.n >= 1 && v.n <= 53 && colonne[v.n] == null) colonne[v.n] = v.x;
    });
    if (colonne[53] != null) maxWPdf = 53;
    const headY = righe.find((r) => r.items.some((i) => head.some((h) => h.x === i.x)))?.y;
    const primaColonna = Math.min(...Object.values(colonne));
    const colonnaDi = (x) => {
      let best = null;
      let bd = 1e9;
      Object.keys(colonne).forEach((w) => {
        const d = Math.abs(colonne[w] - x);
        if (d < bd) {
          bd = d;
          best = parseInt(w);
        }
      });
      return bd < 12 ? best : null;
    };
    righe.forEach((r) => {
      if (headY != null && r.y >= headY) return; // sopra l'intestazione: titoli
      // celle delle settimane (sotto le colonne 1-52) e testo del nome (a sinistra)
      const celle = r.items.filter((i) => i.x >= primaColonna - 12 && colonnaDi(i.x));
      const testo = r.items.filter((i) => !celle.includes(i) && /[A-Za-zÀ-ÿ.]{2,}/.test(i.s));
      if (!testo.length) return;
      const cognome = testo[0].s;
      const nome = testo[1] ? testo[1].s : '';
      const sett = [];
      celle.forEach((i) => {
        const c = _vacLeggiCella(i.s);
        const w = colonnaDi(i.x);
        if (c && c.ignoto) {
          if (!/^\d+$/.test(c.ignoto))
            ignoti.push('"' + c.ignoto + '" per ' + (cognome + ' ' + nome).trim() + ', settimana ' + w);
        } else if (c && !sett.some((x) => x.w === w)) sett.push({ w: w, codice: c });
      });
      out.push({ cognome: cognome, nome: nome, settimane: sett.sort((a, b) => a.w - b.w) });
    });
  }
  return { righe: out, ignoti: ignoti, maxW: maxWPdf };
}
async function importaVacanzePiano(input) {
  if (!_pianoAzioneAutoConsentita('vacanze')) return; // azione automatica: permesso apposito
  if (!(await assicuraLibreria('xlsx'))) return;
  if (!(await assicuraLibreria('pdf'))) return;
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  try {
    const isPdf = /\.pdf$/i.test(file.name);
    let letto;
    if (isPdf) {
      letto = await _vacRigheDaPdf(file);
    } else {
      if (!window.XLSX) return;
      letto = _vacRigheDaExcel(XLSX.read(await file.arrayBuffer()));
    }
    const righe = letto.righe;
    if (!righe.some((r) => r.settimane.length)) {
      toast('Nessuna settimana trovata nel file');
      return;
    }
    // abbinamento con l'anagrafica
    const trovati = [];
    const persi = [];
    const deboli = [];
    righe.forEach((r) => {
      const m = _vacAbbina(r.cognome, r.nome);
      if (!m) {
        if (r.settimane.length)
          persi.push((r.cognome + ' ' + r.nome).trim() + ' (' + r.settimane.length + ' settimane)');
        return;
      }
      if (m.score < 6) deboli.push((r.cognome + ' ' + r.nome).trim() + ' letto come ' + m.c.nome);
      let g = trovati.find((t) => t.nome === m.c.nome);
      if (!g) {
        g = { nome: m.c.nome, settimane: {} };
        trovati.push(g);
      }
      r.settimane.forEach((x) => {
        g.settimane[x.w] = x.codice;
        if (x.nota) (g.note = g.note || {})[x.w] = x.nota;
      });
    });
    if (!trovati.length) {
      toast('Nessun collaboratore riconosciuto nel file');
      return;
    }
    // CONFRONTO con l'archivio, persona per persona: si cambia solo cio che e diverso.
    // Le settimane uguali restano come sono (anche Provvisoria).
    // le vacanze di OGNI persona del file, di qualsiasi settore: chi lavora in due settori
    // (es. Papa Giacomo Aldo, Valet, nel file degli Slots) ha le settimane gia registrate
    // dall altro file. Prima si guardava solo il settore aperto: la settimana risultava
    // nuova, il database rifiutava il doppione e l import si fermava a meta (05.10)
    const archivio =
      (await secGet(
        'piano_vacanze?anno=eq.' +
          anno +
          '&collaboratore=in.(' +
          trovati.map((t) => encodeURIComponent(t.nome)).join(',') +
          ')',
      )) || [];
    const piano = [];
    const righeMsg = [];
    const fuoriSett = []; // note con date che non cadono nella settimana della X
    let nAgg = 0,
      nTolte = 0,
      nCamb = 0;
    trovati.forEach((t) => {
      const vecchie = archivio.filter((v) => v.collaboratore === t.nome && parseInt(v.anno) === anno);
      // chi e di un altro settore: dal file di questo settore si aggiunge e si corregge,
      // ma non si toglie (le sue settimane le decide anche il file del suo settore)
      const info = _pianoCollabInfo(t.nome);
      const diQui = !info || _pianoAppartieneAlReparto(info);
      const perSett = {};
      vecchie.forEach((v) => (perSett[v.settimana] = v));
      const agg = [];
      const tolte = [];
      const camb = [];
      Object.keys(t.settimane).forEach((w) => {
        const c = t.settimane[w];
        const v = perSett[w];
        // nota del file e date precise lette dalla nota (se la nota non ha date, le
        // date gia corrette a mano nel programma restano)
        const nota = (t.note && t.note[w]) || '';
        const dd = nota ? _vacDateDaNota(nota, anno, parseInt(w)) : null;
        if (dd && dd.fuori) fuoriSett.push(t.nome + ', settimana ' + w + ': ' + nota);
        const extra = { nota: nota || null };
        if (dd && !dd.fuori) Object.assign(extra, { dal: dd.dal, al: dd.al });
        else if (!dd && v && v.nota && (v.dal || v.al)) {
          // le date erano quelle della nota vecchia del file e la nota non c e piu: la
          // settimana torna intera (le date corrette a mano nel programma invece restano)
          const ddV = _vacDateDaNota(v.nota, anno, parseInt(w));
          if (
            ddV &&
            !ddV.fuori &&
            ddV.dal === String(v.dal || '').substring(0, 10) &&
            ddV.al === String(v.al || '').substring(0, 10)
          )
            Object.assign(extra, { dal: null, al: null });
        }
        if (!v) agg.push(Object.assign({ w: parseInt(w), codice: c }, extra));
        else {
          const diverse =
            String(v.nota || '') !== String(extra.nota || '') ||
            ('dal' in extra &&
              (String(v.dal || '').substring(0, 10) !== String(extra.dal || '') ||
                String(v.al || '').substring(0, 10) !== String(extra.al || '')));
          if (_vacCodice(v) !== c || diverse) camb.push({ v: v, da: _vacCodice(v), a: c, extra: extra });
        }
      });
      if (diQui)
        vecchie.forEach((v) => {
          // solo le settimane che il file contiene (la 53 di un file a 52 colonne resta)
          if (parseInt(v.settimana) <= (letto.maxW || 52) && t.settimane[v.settimana] === undefined) tolte.push(v);
        });
      if (!agg.length && !tolte.length && !camb.length) return;
      piano.push({ nome: t.nome, agg, tolte, camb });
      nAgg += agg.length;
      nTolte += tolte.length;
      nCamb += camb.length;
      const sig = (c) => (c === 'V' ? '' : ' ' + c);
      const parti = [];
      const gg = (x) => (x.dal || x.al ? ' (' + _vacDalAlTesto(x) + ')' : '');
      if (agg.length) parti.push('+ ' + agg.map((x) => x.w + sig(x.codice) + gg(x)).join(', '));
      if (tolte.length) parti.push('- ' + tolte.map((v) => v.settimana + sig(_vacCodice(v))).join(', '));
      if (camb.length)
        parti.push(
          camb
            .map(
              (x) =>
                'sett. ' +
                x.v.settimana +
                (x.da !== x.a ? ' ' + x.da + ' -> ' + x.a : ' nota/date') +
                gg(x.extra.dal !== undefined ? x.extra : {}),
            )
            .join(', '),
        );
      righeMsg.push('  ' + t.nome + ': ' + parti.join(' · '));
    });
    let msg =
      'File ' + (isPdf ? 'PDF' : 'Excel') + ' letto per l anno ' + anno + ': ' + trovati.length + ' collaboratori.';
    if (!piano.length) msg += '\n\nIl file coincide con l archivio: nessuna modifica da fare.';
    else {
      msg +=
        '\n\nCambiamenti (+ settimane nuove, - settimane tolte; accanto la sigla se non e vacanza):\n' +
        righeMsg.slice(0, 25).join('\n') +
        (righeMsg.length > 25 ? '\n  ... e altri ' + (righeMsg.length - 25) : '') +
        '\n\nTotale: ' +
        nAgg +
        ' nuove, ' +
        nTolte +
        ' tolte, ' +
        nCamb +
        ' con sigla cambiata. Le settimane che non cambiano restano come sono (anche Provvisoria).';
    }
    if (letto.ignoti.length)
      msg +=
        '\n\nSimboli non riconosciuti (non sono X ne sigle del Piano, restano fuori):\n' +
        letto.ignoti
          .slice(0, 15)
          .map((x) => '  ' + x)
          .join('\n') +
        (letto.ignoti.length > 15 ? '\n  ... e altri ' + (letto.ignoti.length - 15) : '');
    if (letto.noteSenzaX && letto.noteSenzaX.length)
      msg +=
        '\n\nNote su settimane senza X (richieste o cambi, da controllare):\n' +
        letto.noteSenzaX
          .slice(0, 15)
          .map((x) => '  ' + x)
          .join('\n') +
        (letto.noteSenzaX.length > 15 ? '\n  ... e altre ' + (letto.noteSenzaX.length - 15) : '');
    if (fuoriSett.length)
      msg +=
        '\n\nNote con date fuori dalla settimana segnata (vale la settimana intera, correggi dal/al se serve):\n' +
        fuoriSett.map((x) => '  ' + x).join('\n');
    if (deboli.length)
      msg += '\n\nLetti con piccole differenze di scrittura:\n' + deboli.map((x) => '  ' + x).join('\n');
    if (persi.length) msg += '\n\nNON riconosciuti (restano fuori):\n' + persi.map((x) => '  ' + x).join('\n');
    if (!piano.length) {
      await mostraAvviso(msg, { titolo: 'Importa vacanze' });
      return;
    }
    if (!(await chiediConferma(msg, { titolo: 'Importa vacanze', ok: 'Applica i cambiamenti', pericolo: false })))
      return;
    // ogni scrittura per conto suo: un rifiuto non ferma le altre, e si dice quali
    const nonFatte = [];
    const prova = async (cosa, fn) => {
      try {
        await fn();
      } catch (e) {
        nonFatte.push(cosa + ': ' + String((e && e.message) || e).substring(0, 120));
      }
    };
    for (const p of piano) {
      for (const v of p.tolte)
        await prova(p.nome + ' sett. ' + v.settimana, () => secDel('piano_vacanze', 'id=eq.' + v.id));
      for (const x of p.camb)
        await prova(p.nome + ' sett. ' + x.v.settimana, () =>
          secPatch('piano_vacanze', 'id=eq.' + x.v.id, Object.assign({ codice: x.a === 'V' ? null : x.a }, x.extra)),
        );
      for (const x of p.agg)
        await prova(p.nome + ' sett. ' + x.w, () =>
          secPost('piano_vacanze', {
            collaboratore: p.nome,
            settimana: x.w,
            anno: anno,
            confermata: true,
            codice: x.codice === 'V' ? null : x.codice,
            dal: x.dal || null,
            al: x.al || null,
            nota: x.nota || null,
            operatore: getOperatore(),
          }),
        );
    }
    if (nonFatte.length)
      await mostraAvviso(
        'Queste settimane NON sono state salvate (le altre si):\n\n' +
          nonFatte.slice(0, 20).join('\n') +
          (nonFatte.length > 20 ? '\n... e altre ' + (nonFatte.length - 20) : ''),
        { titolo: 'Importa vacanze' },
      );
    logAzione(
      'Vacanze importate',
      anno + ' · ' + nAgg + ' nuove, ' + nTolte + ' tolte, ' + nCamb + ' cambiate · ' + piano.length + ' collaboratori',
    );
    toast(
      'Vacanze aggiornate: ' +
        nAgg +
        ' nuove, ' +
        nTolte +
        ' tolte, ' +
        nCamb +
        ' cambiate' +
        (nonFatte.length ? ' · ' + nonFatte.length + ' NON salvate (elenco nella finestra)' : ''),
    );
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file vacanze: ' + (e.message || ''));
  }
}
// ===== ESPORTAZIONE nello stesso formato del file HR =====
// La scheda esportata replica il file ufficiale: istruzioni in alto, titolo,
// intestazione con le settimane 1-52, X sulle settimane, fasce colorate dei
// periodi (Natale rosso, Carnevale/Pasqua/autunno arancio, estate verde) e
// legenda a destra con le date di ogni settimana.
var VAC_COLORI_FASCE = { rosso: 'FF0000', arancio: 'FFC000', verde: 'C5E0B4', giallo: 'FFFF00', azzurro: '9DC3E6' };
// fasce del file HR 2026 (estratte dal file ufficiale); per gli altri anni si
// calcolano dalle feste: Natale/Capodanno rosso, Carnevale e la settimana del
// Lunedi' di Pasqua arancio, estate (giugno-agosto) verde, autunno arancio
function _vacFasce(anno) {
  if (anno === 2026) {
    var m = {
      0: 'rosso',
      1: 'rosso',
      8: 'arancio',
      15: 'arancio',
      45: 'arancio',
      49: 'azzurro',
      51: 'rosso',
      52: 'rosso',
    };
    for (var w = 22; w <= 37; w++) m[w] = 'verde';
    for (var w2 = 46; w2 <= 48; w2++) m[w2] = 'giallo';
    m[53] = 'rosso'; // settimana 53 del 2026 (28.12-03.01): Natale
    return m;
  }
  var nW = _vacSettimaneAnno(anno);
  var out = { 0: 'rosso', 1: 'rosso', 51: 'rosso', 52: 'rosso' };
  if (nW === 53) out[53] = 'rosso';
  var settDi = function (dstr) {
    for (var w3 = 1; w3 <= nW; w3++) if (_pianoGiorniSettimana(anno, w3).includes(dstr)) return w3;
    return null;
  };
  try {
    var pasqua = _pianoPasqua ? _pianoPasqua(anno) : null;
    if (pasqua) {
      var lun = new Date(pasqua.getTime() + 86400000);
      var lstr =
        lun.getFullYear() +
        '-' +
        String(lun.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(lun.getDate()).padStart(2, '0');
      var wP = settDi(lstr);
      if (wP) out[wP] = 'arancio';
      var mart = new Date(pasqua.getTime() - 47 * 86400000); // martedi' grasso
      var mstr =
        mart.getFullYear() +
        '-' +
        String(mart.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(mart.getDate()).padStart(2, '0');
      var wC = settDi(mstr);
      if (wC) out[wC] = 'arancio';
    }
  } catch (e) {}
  var wN = settDi(anno + '-11-02');
  if (wN) out[wN] = 'arancio'; // vacanze autunnali
  for (var w4 = 1; w4 <= nW; w4++) {
    var gg = _pianoGiorniSettimana(anno, w4);
    var mm = parseInt(gg[0].split('-')[1]);
    if (mm >= 6 && mm <= 8 && !out[w4]) out[w4] = 'verde';
  }
  return out;
}
function _vacDatiEsport(anno) {
  const collab = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return collab.map((c) => {
    const parti = c.nome.trim().split(/\s+/);
    const cognome = parti.length > 1 ? parti.slice(0, -1).join(' ') : parti[0];
    const nome = parti.length > 1 ? parti[parti.length - 1] : '';
    const mie = _pianoVacCache.filter((v) => v.collaboratore === c.nome && v.anno === anno);
    const sett = mie.map((v) => v.settimana).sort((a, b) => a - b);
    // nel file: X per le vacanze, la sigla per le altre assenze (PC, MT...)
    const segni = {};
    mie.forEach((v) => (segni[v.settimana] = _vacEVacanza(v) ? 'X' : _vacCodice(v)));
    return {
      cognome: cognome.toUpperCase(),
      nome: nome.toUpperCase(),
      settimane: sett,
      segni: segni,
      nVacanze: mie.filter(_vacEVacanza).length,
    };
  });
}
function _vacDataIt(dstr) {
  const p = dstr.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}
// libreria Excel CON stili (colori): si carica solo quando serve, senza
// toccare la XLSX globale usata da tutto il resto del programma
async function _vacXlsxStyle() {
  // xlsx (a richiesta) deve essere gia caricata: la libreria degli stili la
  // sovrascrive e si rimette l originale (prima, se xlsx arrivava dopo, restava undefined)
  if (window._XLSXStyle) return window._XLSXStyle;
  await libreria('xlsx');
  return new Promise((resolve, reject) => {
    if (window._XLSXStyle) return resolve(window._XLSXStyle);
    const orig = window.XLSX;
    const s = document.createElement('script');
    s.src = 'libs/xlsx-style.min.js';
    s.onload = () => {
      window._XLSXStyle = window.XLSX;
      window.XLSX = orig;
      resolve(window._XLSXStyle);
    };
    s.onerror = () => {
      window.XLSX = orig;
      reject(new Error('libreria stili non caricata'));
    };
    document.head.appendChild(s);
  });
}
async function esportaVacanzeExcel() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  let XS;
  try {
    XS = await _vacXlsxStyle();
  } catch (e) {
    toast('Libreria per i colori non disponibile');
    return;
  }
  const dati = _vacDatiEsport(anno);
  const fasce = _vacFasce(anno);
  const bordo = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  };
  const fillDi = (w) => (fasce[w] ? { patternType: 'solid', fgColor: { rgb: VAC_COLORI_FASCE[fasce[w]] } } : undefined);
  const ws = {};
  const set = (r, c, v, stile) => {
    const a = XS.utils.encode_cell({ r: r, c: c });
    ws[a] = { v: v === undefined ? '' : v, t: typeof v === 'number' ? 'n' : 's' };
    if (stile) ws[a].s = stile;
  };
  // istruzioni (identiche al file HR)
  set(
    0,
    0,
    '1) Selezionare la settimana di preferenza con una X. Scegliere 5 settimane in modo da facilitare la pianificazione.',
    { font: { sz: 9, italic: true } },
  );
  set(
    1,
    0,
    '2) Devono essere effettuate 2 settimane consecutive . Durante le vacanze scolastiche si darà precedenza a genitori con i figli in età scolastica.',
    { font: { sz: 9, italic: true } },
  );
  // titolo
  set(3, 0, repartoNomeDocumento(_pianoReparto()).toUpperCase(), { font: { bold: true, sz: 12 } });
  set(3, 3, ' PIANIFICAZIONE VACANZE ANNO ' + anno, { font: { bold: true, sz: 14 } });
  // intestazione riga 5: COGNOME NOME anno Pianificate 52 1..52
  const hStile = (w) => ({
    font: { bold: true, sz: 9 },
    alignment: { horizontal: 'center' },
    border: bordo,
    fill: fillDi(w),
  });
  set(4, 0, 'COGNOME', { font: { bold: true }, border: bordo });
  set(4, 1, 'NOME', { font: { bold: true }, border: bordo });
  set(4, 2, String(anno), { font: { bold: true }, alignment: { horizontal: 'center' }, border: bordo });
  set(4, 3, 'Pianificate', { font: { bold: true }, alignment: { horizontal: 'center' }, border: bordo });
  // settimane dell anno (53 nel 2026) e ultima settimana dell anno prima nella colonna 0
  const nW = _vacSettimaneAnno(anno);
  const nPrev = _vacSettimaneAnno(anno - 1);
  set(4, 4, nPrev, hStile(0));
  for (let w = 1; w <= nW; w++) set(4, 4 + w, w, hStile(w));
  // righe collaboratori
  dati.forEach((d, i) => {
    const r = 5 + i;
    set(r, 0, d.cognome, { border: bordo });
    set(r, 1, d.nome, { border: bordo });
    set(r, 2, '', { border: bordo });
    set(r, 3, d.nVacanze, { alignment: { horizontal: 'center' }, border: bordo });
    set(r, 4, '', { border: bordo, fill: fillDi(0) });
    for (let w = 1; w <= nW; w++) {
      const stile = { alignment: { horizontal: 'center' }, border: bordo, font: { bold: true, sz: 9 } };
      const f = fillDi(w);
      if (f) stile.fill = f;
      set(r, 4 + w, d.segni[w] || '', stile);
    }
  });
  // LEGENDA a destra (colonne BH-BJ come nel file)
  const cL = 59;
  set(0, cL, 'LEGENDA', { font: { bold: true } });
  set(1, cL, 'N° Sett.', { font: { bold: true, sz: 9 }, border: bordo });
  set(1, cL + 1, 'dal', { font: { bold: true, sz: 9 }, border: bordo });
  set(1, cL + 2, 'al', { font: { bold: true, sz: 9 }, border: bordo });
  const legRiga = (rr, w, wLbl, annoW) => {
    const gg = _pianoGiorniSettimana(annoW, w);
    const f = fillDi(wLbl);
    set(rr, cL, wLbl === 0 ? nPrev : wLbl, { alignment: { horizontal: 'center' }, border: bordo, font: { sz: 9 } });
    const stD = { border: bordo, font: { sz: 9 } };
    if (f) stD.fill = f;
    set(rr, cL + 1, _vacDataIt(gg[0]), stD);
    set(rr, cL + 2, _vacDataIt(gg[6]), Object.assign({}, stD));
  };
  legRiga(2, nPrev, 0, anno - 1); // ultima settimana dell anno precedente
  for (let w = 1; w <= nW; w++) legRiga(2 + w, w, w, anno);
  ws['!ref'] = XS.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(5 + dati.length, 55), c: cL + 2 } });
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 9 }, { wch: 11 }].concat(
    Array.from({ length: nW + 1 }, () => ({ wch: 3.2 })),
    [{ wch: 2 }, { wch: 2 }],
    [{ wch: 8 }, { wch: 11 }, { wch: 11 }],
  );
  ws['!merges'] = [{ s: { r: 3, c: 3 }, e: { r: 3, c: 4 + nW } }];
  const wb = XS.utils.book_new();
  XS.utils.book_append_sheet(wb, ws, 'preferenze');
  XS.writeFile(wb, 'VACANZE ' + repartoNomeDocumento(_pianoReparto()).toUpperCase() + ' ' + anno + '.xlsx');
  logAzione('Vacanze esportate', anno + ' · Excel · ' + dati.length + ' collaboratori');
  toast('File Excel creato (formato HR con colori)');
}
async function esportaVacanzePdf() {
  if (!(await assicuraLibreria('jspdf'))) return;
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const dati = _vacDatiEsport(anno);
  const fasce = _vacFasce(anno);
  const rgbDi = (w) => {
    if (!fasce[w]) return null;
    const hex = VAC_COLORI_FASCE[fasce[w]];
    return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
  };
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a3');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    'PIANIFICAZIONE VACANZE ANNO ' + anno + ' · ' + repartoNomeDocumento(_pianoReparto()).toUpperCase(),
    180,
    9,
    {
      align: 'center',
    },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    '1) Selezionare la settimana di preferenza con una X. Scegliere 5 settimane in modo da facilitare la pianificazione.',
    8,
    14,
  );
  doc.text(
    '2) Devono essere effettuate 2 settimane consecutive. Durante le vacanze scolastiche si darà precedenza a genitori con i figli in età scolastica.',
    8,
    17.5,
  );
  const nW = _vacSettimaneAnno(anno);
  const nPrev = _vacSettimaneAnno(anno - 1);
  const head = ['COGNOME', 'NOME', 'Pianificate', String(nPrev)];
  for (let w = 1; w <= nW; w++) head.push(String(w));
  const body = dati.map((d) => {
    const r = [d.cognome, d.nome, String(d.nVacanze), ''];
    for (let w = 1; w <= nW; w++) r.push(d.segni[w] || '');
    return r;
  });
  const colStyles = {
    0: { cellWidth: 28, halign: 'left' },
    1: { cellWidth: 21, halign: 'left' },
    2: { cellWidth: 11 },
  };
  for (let i = 3; i < 4 + nW; i++) colStyles[i] = { cellWidth: nW === 53 ? 4.5 : 4.6 };
  doc.autoTable({
    startY: 20,
    head: [head],
    body: body,
    theme: 'grid',
    margin: { left: 6, right: 60 },
    styles: {
      fontSize: 5.2,
      cellPadding: 0.6,
      halign: 'center',
      lineColor: [130, 130, 130],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 5 },
    columnStyles: colStyles,
    didParseCell: (d) => {
      if (d.column.index < 3) return;
      const w = d.column.index === 3 ? 0 : d.column.index - 3;
      const rgb = rgbDi(w);
      if (rgb) d.cell.styles.fillColor = rgb;
      if (d.section === 'body' && d.cell.raw && d.column.index > 3) d.cell.styles.fontStyle = 'bold';
    },
  });
  // LEGENDA a destra
  const legBody = [];
  const ggPrev = _pianoGiorniSettimana(anno - 1, nPrev);
  legBody.push([String(nPrev), _vacDataIt(ggPrev[0]), _vacDataIt(ggPrev[6])]);
  for (let w = 1; w <= nW; w++) {
    const gg = _pianoGiorniSettimana(anno, w);
    legBody.push([String(w), _vacDataIt(gg[0]), _vacDataIt(gg[6])]);
  }
  doc.autoTable({
    startY: 20,
    margin: { left: 366 },
    tableWidth: 48,
    head: [['N° Sett.', 'dal', 'al']],
    body: legBody,
    theme: 'grid',
    styles: {
      fontSize: 4.6,
      cellPadding: 0.5,
      halign: 'center',
      lineColor: [130, 130, 130],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 4.8 },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const w = d.row.index === 0 ? 0 : d.row.index;
      const rgb = rgbDi(w);
      if (rgb && d.column.index > 0) d.cell.styles.fillColor = rgb;
    },
  });
  const nomeFile = 'VACANZE_' + repartoNomeDocumento(_pianoReparto()).toUpperCase() + '_' + anno + '.pdf';
  if (typeof mostraPdfPreview === 'function') mostraPdfPreview(doc, nomeFile, 'Vacanze ' + anno);
  else doc.save(nomeFile);
  logAzione('Vacanze esportate', anno + ' · PDF · ' + dati.length + ' collaboratori');
}
