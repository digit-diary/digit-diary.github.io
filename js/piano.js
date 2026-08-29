/**
 * Diario Collaboratori — Casino Lugano SA
 * File: piano.js
 */

// ================================================================
// SEZIONE 25: PIANO DI LAVORO (ereditato dal progetto Turnivo)
// Griglia mensile collaboratori × giorni: codici turno (S22, R4...)
// e codici speciali (V, M, C, F...). Dati on-demand, NON in loadAll.
// Fase 1: griglia + modifica manuale + malattie dal Diario +
// tabella fabbisogno vs assegnati. (Fase 2: validatore + bozza)
// ================================================================

let _pianoCfgCaricata = false;
let pianoTurniCache = [];
let pianoCodiciCache = [];
let pianoFestiviCache = [];
let pianoRegoleCache = [];
let _pianoRighe = []; // righe del mese/settore correnti
let _pianoMeseSel = new Date().toISOString().substring(0, 7);
let _pianoCellaSel = null; // {nome, data} in modifica

// Colori dei codici speciali — PALETTE ORIGINALE TURNIVO (= formattazione
// condizionale dell'Excel del casinò). I codici non elencati restano bianchi.
const PIANO_COLORI_SPECIALI = {
  V: '#00B0F0',
  V1: '#00B0F0',
  CGF: '#00B0F0',
  M: '#FFFF00',
  M1: '#FFFF00',
  I: '#FFFF00',
  I1: '#FFFF00',
  LRD: '#FFFF00',
  JG: '#FFFF00',
  C: '#FBD4B4',
  RC: '#FFC000',
  ND: '#F2DBDB',
};

function puoGestirePiano() {
  return typeof puoModificare === 'function' ? puoModificare('gestione_piano') : isAdmin();
}

let pianoMappatureCache = [];
let _pianoOreSett = 41; // ore settimanali contratto (imp 'piano_ore_settimanali')
async function _pianoCaricaCfg() {
  if (_pianoCfgCaricata) return;
  const [turni, codici, festivi, regole, mappature, oreSett, funzioni] = await Promise.all([
    secGet('piano_turni?order=ordine.asc&limit=500'),
    secGet('piano_codici?order=codice.asc&limit=200'),
    secGet('piano_festivi?order=data.asc&limit=200'),
    secGet('piano_regole?order=id.asc&limit=200'),
    secGet('piano_mappature?order=funzione.asc&limit=500'),
    getImp('piano_ore_settimanali'),
    getImp('piano_funzioni'),
  ]);
  pianoTurniCache = turni || [];
  pianoCodiciCache = codici || [];
  pianoFestiviCache = festivi || [];
  pianoRegoleCache = regole || [];
  pianoMappatureCache = mappature || [];
  _pianoOreSett = parseFloat(oreSett) || 41;
  try {
    window._pianoFunzioni = funzioni ? JSON.parse(funzioni) : null;
  } catch (e) {}
  if (!Array.isArray(window._pianoFunzioni) || !window._pianoFunzioni.length)
    window._pianoFunzioni = ['RESP', 'SUP', 'BO', 'HOST'];
  _pianoCfgCaricata = true;
}
function _pianoMappFunzione(funzione) {
  if (!funzione) return null;
  const m = pianoMappatureCache.filter((x) => x.funzione === funzione);
  return m.length ? m : null;
}
function _pianoCollabInfo(nome) {
  return collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
}

function _pianoTurniReparto() {
  return pianoTurniCache.filter((t) => t.attivo !== false && (t.reparto_dip || 'slots') === _pianoReparto());
}
function _pianoTurnoInfo(codice) {
  return _pianoTurniReparto().find((t) => t.codice === codice) || pianoTurniCache.find((t) => t.codice === codice);
}
function _pianoCodiceInfo(codice) {
  return pianoCodiciCache.find((c) => c.codice === codice);
}
function _pianoColore(codice) {
  const t = _pianoTurnoInfo(codice);
  if (t) return t.colore || '';
  return PIANO_COLORI_SPECIALI[codice] || ''; // '' = cella bianca (come Turnivo/Excel)
}
function _pianoUltimoGiorno(ym) {
  const p = ym.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]), 0).getDate();
}

// Malattie registrate nel Diario → celle "M" automatiche (solo visuali, non salvate).
// Legge le registrazioni tipo Malattia: range "dal gg/mm/aaaa al gg/mm/aaaa" nel testo,
// oppure "N giorni" dalla data della registrazione, altrimenti il singolo giorno.
function _pianoMalattieMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoMal || e.eliminato) return;
    const testo = e.testo || '';
    let da = (e.data || '').substring(0, 10);
    let a = da;
    const mRange = testo.match(/dal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+al\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
    const mGiorni = testo.match(/(\d+)\s*giorni/i);
    if (mRange) {
      da = mRange[3] + '-' + mRange[2].padStart(2, '0') + '-' + mRange[1].padStart(2, '0');
      a = mRange[6] + '-' + mRange[5].padStart(2, '0') + '-' + mRange[4].padStart(2, '0');
    } else if (mGiorni && da) {
      const d = new Date(da + 'T12:00:00');
      d.setDate(d.getDate() + parseInt(mGiorni[1]) - 1);
      a = d.toISOString().substring(0, 10);
    }
    if (!da || a < inizio || da > fine) return;
    const cur = new Date((da < inizio ? inizio : da) + 'T12:00:00');
    const stop = a > fine ? fine : a;
    while (cur.toISOString().substring(0, 10) <= stop) {
      out[e.nome + '|' + cur.toISOString().substring(0, 10)] = true;
      cur.setDate(cur.getDate() + 1);
    }
  });
  return out;
}

async function renderPiano() {
  const el = document.getElementById('piano-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento piano...</p>';
  try {
    await _pianoCaricaCfg();
    const ym = _pianoMeseSel;
    const nGiorni = _pianoUltimoGiorno(ym);
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    _pianoRighe =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000',
      )) || [];
    const mappa = {}; // 'nome|data' -> riga
    _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + r.data] = r));
    const malattie = _pianoMalattieMese(ym);
    const festiviSet = {};
    pianoFestiviCache.forEach((f) => (festiviSet[f.data] = f.descrizione));

    // righe: collaboratori attivi del settore + eventuali nomi presenti solo nel piano
    const collabs = collaboratoriCache
      .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto())
      .map((c) => c.nome)
      .sort((x, y) => x.localeCompare(y));
    const extra = [...new Set(_pianoRighe.map((r) => r.collaboratore))].filter((n) => !collabs.includes(n)).sort();
    const nomi = collabs.concat(extra);
    const puoMod = puoGestirePiano();
    const GG = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
    const MESI_L = MESI_FULL || [];
    const label = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];

    let h =
      '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
    h +=
      '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><span style="min-width:150px;text-align:center;font-weight:700">' +
      escP(label) +
      '</span><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>';
    h +=
      '<select onchange="pianoCambiaReparto(this.value)" style="padding:4px 8px;font-size:.72rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
    getReparti().forEach((rp) => {
      h +=
        '<option value="' +
        rp.key +
        '"' +
        (rp.key === _pianoReparto() ? ' selected' : '') +
        ' style="color:#000">' +
        escP(rp.label) +
        '</option>';
    });
    h += '</select>';
    if (puoMod) {
      h +=
        '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:#d4b86a;color:#d4b86a" onclick="validaPiano()">Valida regole</button>';
      h +=
        '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="generaBozzaPiano()">Genera bozza</button>';
      h +=
        '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:var(--accent);color:var(--accent)" onclick="cancellaBozzaPiano()">Cancella piano</button>';
    }
    h +=
      '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:#b8a98a;color:#b8a98a" onclick="copiaPianoExcel()">Copia per Excel</button>';
    h +=
      '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:#b8a98a;color:#b8a98a" onclick="stampaPianoPDF()">Stampa PDF</button>';
    h +=
      '<span style="font-size:.72rem;color:var(--muted);margin-left:auto">' +
      _pianoRighe.length +
      ' assegnazioni' +
      (puoMod ? ' — clicca una cella per modificare' : ' — sola lettura') +
      '</span></div>';
    h += '<div id="piano-violazioni"></div>';

    // GRIGLIA
    h += '<div class="piano-wrap"><table class="piano-table"><thead><tr><th class="piano-nome">Collaboratore</th>';
    for (let g = 1; g <= nGiorni; g++) {
      const dstr = ym + '-' + String(g).padStart(2, '0');
      const dow = new Date(dstr + 'T12:00:00').getDay();
      let cls = '';
      if (festiviSet[dstr]) cls = 'piano-festivo';
      else if (dow === 0) cls = 'piano-domenica';
      else if (dow === 5 || dow === 6) cls = 'piano-weekend';
      h +=
        '<th class="' +
        cls +
        '"' +
        (festiviSet[dstr] ? ' title="' + escP(festiviSet[dstr]) + '"' : '') +
        '>' +
        g +
        '<br><span style="font-weight:400">' +
        GG[dow] +
        '</span></th>';
    }
    h +=
      '<th class="piano-tot">Ore</th><th class="piano-tot">D</th><th class="piano-tot">N</th><th class="piano-tot" title="Ore dovute (ore settimanali x percentuale x giorni/7)">Dov.</th><th class="piano-tot" title="Saldo: pianificate - dovute">Saldo</th></tr></thead><tbody>';

    nomi.forEach((nome) => {
      const ne = nome.replace(/'/g, "\\'");
      let ore = 0;
      let nD = 0;
      let nN = 0;
      let riga = '';
      for (let g = 1; g <= nGiorni; g++) {
        const dstr = ym + '-' + String(g).padStart(2, '0');
        const r = mappa[nome + '|' + dstr];
        const codice = r ? r.codice : '';
        let cella = '';
        let stile = '';
        let cls = 'piano-cella';
        let titolo = '';
        if (r) {
          const t = _pianoTurnoInfo(codice);
          const cs = _pianoCodiceInfo(codice);
          cella = escP(codice);
          const _col = _pianoColore(codice);
          if (_col) stile = 'background:' + _col;
          if (t) {
            ore += parseFloat(t.durata_ore) || 0;
            if (t.tipo === 'NOTTURNO') nN++;
            else nD++;
            titolo = codice + ' ' + (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5);
          } else if (cs) {
            ore += parseFloat(cs.ore) || 0;
            titolo = cs.descrizione || codice;
          }
          if (r.protetto) cls += ' piano-prot';
          if (r.commento) {
            cls += ' piano-comm';
            titolo += (titolo ? ' — ' : '') + r.commento;
          }
        } else if (malattie[nome + '|' + dstr]) {
          cella = 'M';
          cls += ' piano-malattia-auto';
          titolo = 'Malattia registrata nel Diario (automatica, non salvata nel piano)';
        }
        const violMsg = _pianoViolCelle[nome + '|' + dstr];
        if (violMsg) {
          cls += ' piano-viol';
          titolo += (titolo ? ' — ' : '') + '⚠ ' + violMsg.join(' | ');
        }
        riga +=
          '<td class="' +
          cls +
          '" style="' +
          stile +
          '"' +
          (titolo ? ' title="' + escP(titolo) + '"' : '') +
          (puoMod ? ' onclick="pianoCellaPrompt(\'' + ne + "','" + dstr + '\')"' : '') +
          '>' +
          cella +
          '</td>';
      }
      const infoC = _pianoCollabInfo(nome);
      const perc = infoC ? parseFloat(infoC.percentuale) || 1 : 1;
      const dovute = Math.round(((_pianoOreSett * perc * nGiorni) / 7) * 10) / 10;
      const saldo = Math.round((ore - dovute) * 10) / 10;
      const _clsRiga =
        infoC && infoC.funzione === 'SUP'
          ? ' class="piano-row-sup"'
          : infoC && infoC.funzione === 'BO'
            ? ' class="piano-row-bo"'
            : '';
      h +=
        '<tr' +
        _clsRiga +
        '><td class="piano-nome"' +
        (infoC && infoC.funzione ? ' title="' + escP(infoC.funzione) + ' ' + Math.round(perc * 100) + '%"' : '') +
        '><i class="icx icx-stampa piano-pdf-ico" title="Stampa il piano di ' +
        escP(nome) +
        '" onclick="event.stopPropagation();stampaPianoCollaboratore(\'' +
        ne +
        '\')"></i>' +
        escP(nome) +
        (infoC && infoC.funzione && infoC.funzione !== 'HOST'
          ? ' <span style="font-size:.58rem;color:var(--muted)">' + escP(infoC.funzione) + '</span>'
          : '') +
        '</td>' +
        riga +
        '<td class="piano-tot">' +
        (ore ? ore.toFixed(1) : '') +
        '</td><td class="piano-tot">' +
        (nD || '') +
        '</td><td class="piano-tot">' +
        (nN || '') +
        '</td><td class="piano-tot" style="color:var(--muted)">' +
        (ore ? dovute.toFixed(1) : '') +
        '</td><td class="piano-tot" style="color:' +
        (saldo > 0 ? '#2c6e49' : saldo < 0 ? '#c0392b' : 'var(--muted)') +
        '">' +
        (ore ? (saldo > 0 ? '+' : '') + saldo.toFixed(1) : '') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';

    // legenda
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;font-size:.72rem;color:var(--muted)">';
    h +=
      '<span><span class="piano-leg piano-prot" style="background:var(--paper2)"></span> bordo rosso = inserito a mano (protetto)</span>';
    h +=
      '<span><span class="piano-leg piano-comm" style="background:var(--paper2)"></span> triangolo = commento (passa il mouse)</span>';
    h +=
      '<span><span class="piano-leg piano-malattia-auto" style="background:var(--paper2)">M</span> = malattia dal Diario (automatica)</span>';
    h += '<span>doppio click sul nome = stampa scheda collaboratore — tasto destro su una cella = nota rapida</span>';
    h += '</div></div>';

    // FABBISOGNO vs ASSEGNATI (editabile: click sulla cella per impostare le persone necessarie)
    const fabb =
      (await secGet(
        'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
      )) || [];
    _pianoFabbCache = fabb;
    const turniRep = _pianoTurniReparto();
    if (turniRep.length) {
      const fabbMap = {}; // codice -> {giorno: quantita}
      fabb.forEach((f) => {
        const g = parseInt(f.data.split('-')[2]);
        (fabbMap[f.turno_codice] = fabbMap[f.turno_codice] || {})[g] = f.quantita;
      });
      const assMap = {}; // codice -> {giorno: n}
      _pianoRighe.forEach((r) => {
        const g = parseInt(r.data.split('-')[2]);
        (assMap[r.codice] = assMap[r.codice] || {})[g] =
          (assMap[r.codice] && assMap[r.codice][g] ? assMap[r.codice][g] : 0) + 1;
      });
      h +=
        '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Fabbisogno vs assegnati — ' +
        escP(label);
      if (puoMod)
        h +=
          '<button class="btn-export" style="font-size:.7rem;padding:3px 10px;border-color:#d4b86a;color:#d4b86a" onclick="copiaFabbisognoMese()">Copia dal mese precedente</button>' +
          '<span style="font-size:.68rem;color:#b8a98a;font-weight:400">clicca una cella per impostare le persone necessarie</span>';
      h += '</div>';
      h += '<div class="piano-wrap"><table class="piano-table"><thead><tr><th class="piano-nome">Turno</th>';
      for (let g = 1; g <= nGiorni; g++) h += '<th>' + g + '</th>';
      h += '</tr></thead><tbody>';
      const gruppoOrd = {};
      turniRep.forEach((t, i) => (gruppoOrd[t.codice] = (t.gruppo || '') + '|' + String(i).padStart(3, '0')));
      turniRep
        .slice()
        .sort((x, y) => (gruppoOrd[x.codice] || '').localeCompare(gruppoOrd[y.codice] || ''))
        .forEach((t) => {
          const cod = t.codice;
          h +=
            '<tr><td class="piano-nome" title="' +
            escP(
              (t.gruppo || '') + ' ' + (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
            ) +
            '">' +
            escP(cod) +
            '</td>';
          for (let g = 1; g <= nGiorni; g++) {
            const req = (fabbMap[cod] || {})[g] || 0;
            const ass = (assMap[cod] || {})[g] || 0;
            let cls = '';
            if (req) cls = ass >= req ? 'piano-fabb-ok' : 'piano-fabb-ko';
            const dstr = ym + '-' + String(g).padStart(2, '0');
            h +=
              '<td class="' +
              cls +
              '"' +
              (puoMod
                ? ' style="cursor:pointer" onclick="setPianoFabbisogno(\'' + escP(cod) + "','" + dstr + '\')"'
                : '') +
              '>' +
              (req ? ass + '/' + req : '') +
              '</td>';
          }
          h += '</tr>';
        });
      h += '</tbody></table></div>';
      h +=
        '<p style="font-size:.72rem;color:var(--muted);padding:8px 14px">assegnati/richiesti — <span style="color:#2c6e49;font-weight:700">verde</span> = coperto, <span style="color:#c0392b;font-weight:700">rosso</span> = carenza. Il fabbisogno guida "Genera bozza".</p></div>';
    }
    // Configurazione (card richiudibili, solo admin)
    h +=
      '<div id="piano-config">' +
      _renderPianoRegoleCard() +
      _renderPianoTurniCard() +
      _renderPianoCodiciCard() +
      _renderPianoFestiviCard() +
      _renderPianoMappatureCard() +
      _renderPianoPreferenzeCard() +
      _renderPianoImpostazioniCard() +
      _renderPianoTimbratureCard() +
      _renderPianoVacanzeCard() +
      _renderPianoStatCard() +
      '</div>';
    el.innerHTML = h;
    if (typeof initCardRichiudibili === 'function') initCardRichiudibili('piano-config', []);
    _pianoInitSelezione();
    _pianoRenderViolazioni();
  } catch (e) {
    console.error('Errore piano:', e);
    el.innerHTML = '<p style="color:var(--accent);padding:20px">Errore caricamento piano</p>';
  }
}

function pianoCambiaMese(delta) {
  const p = _pianoMeseSel.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + delta, 15);
  _pianoMeseSel = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ---- Modifica cella ----
function apriPianoCella(nome, data) {
  if (!puoGestirePiano()) {
    toast('Non hai il permesso di modificare il piano');
    return;
  }
  _pianoCellaSel = { nome: nome, data: data };
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === data);
  const turni = _pianoTurniReparto();
  const gruppi = {};
  turni.forEach((t) => (gruppi[t.gruppo || 'ALTRO'] = (gruppi[t.gruppo || 'ALTRO'] || []).concat(t)));
  let opts = '<option value="">— vuoto —</option>';
  Object.keys(gruppi)
    .sort()
    .forEach((g) => {
      opts += '<optgroup label="' + escP(g) + '">';
      gruppi[g].forEach((t) => {
        opts +=
          '<option value="' +
          escP(t.codice) +
          '"' +
          (r && r.codice === t.codice ? ' selected' : '') +
          '>' +
          escP(t.codice) +
          ' (' +
          (t.ora_inizio || '').substring(0, 5) +
          '-' +
          (t.ora_fine || '').substring(0, 5) +
          ')</option>';
      });
      opts += '</optgroup>';
    });
  opts += '<optgroup label="CODICI SPECIALI">';
  pianoCodiciCache
    .filter((c) => c.attivo !== false)
    .forEach((c) => {
      opts +=
        '<option value="' +
        escP(c.codice) +
        '"' +
        (r && r.codice === c.codice ? ' selected' : '') +
        '>' +
        escP(c.codice) +
        ' — ' +
        escP(c.descrizione || '') +
        '</option>';
    });
  opts += '</optgroup>';
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>' +
    escP(nome) +
    ' — ' +
    new Date(data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3>' +
    '<div class="field" style="text-align:left"><label>Turno / codice</label><select id="piano-cella-codice" style="width:100%;padding:10px">' +
    opts +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Commento (opzionale)</label><input type="text" id="piano-cella-commento" value="' +
    escP((r && r.commento) || '') +
    '" placeholder="Es: cambio per esigenze operative..."></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    (r
      ? '<button class="btn-modal-cancel" style="border-color:var(--accent);color:var(--accent)" onclick="rimuoviPianoCella()">Rimuovi</button>'
      : '') +
    (r && _pianoTurnoInfo(r.codice)
      ? '<button class="btn-modal-cancel" style="border-color:#1a4a7a;color:#1a4a7a" onclick="apriScambioTurno()">Scambia con collega</button>'
      : '') +
    '<button class="btn-modal-ok" onclick="salvaPianoCella()">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}

async function salvaPianoCella() {
  const sel = _pianoCellaSel;
  if (!sel) return;
  const codice = (document.getElementById('piano-cella-codice') || {}).value || '';
  const commento = ((document.getElementById('piano-cella-commento') || {}).value || '').trim();
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!codice) {
    // vuoto = rimuovi se esisteva
    return rimuoviPianoCella(true);
  }
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  try {
    if (r) {
      await secPatch('piano', 'id=eq.' + r.id, {
        codice: codice,
        commento: commento || null,
        protetto: true,
        generato: false,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
      r.codice = codice;
      r.commento = commento;
      r.protetto = true;
    } else {
      const nuovo = await secPost('piano', {
        collaboratore: sel.nome,
        data: sel.data,
        codice: codice,
        protetto: true,
        generato: false,
        commento: commento || null,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    }
    logAzione('Piano modificato', sel.nome + ' ' + sel.data + ' → ' + codice);
    toast('Piano aggiornato');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio piano');
  }
}

async function rimuoviPianoCella(giaChiuso) {
  const sel = _pianoCellaSel;
  if (!sel) return;
  if (!giaChiuso) document.getElementById('pwd-modal').classList.add('hidden');
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  try {
    await secDel('piano', 'id=eq.' + r.id);
    _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
    logAzione('Piano: cella rimossa', sel.nome + ' ' + sel.data + ' (era ' + r.codice + ')');
    toast('Cella rimossa');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

// ================================================================
// FASE 2 — VALIDATORE REGOLE (dai manuali Turnivo/Casino Lugano)
// ================================================================
let _pianoViolCelle = {}; // 'nome|data' -> [messaggi]
let _pianoViolLista = null; // ultima validazione (null = mai eseguita)

function _pianoOra(hhmm) {
  if (!hhmm) return null;
  const p = String(hhmm).split(':');
  return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
}
function _pianoRegolaVal(nome) {
  const r = pianoRegoleCache.find((x) => x.nome === nome);
  if (!r || r.attivo === false) return null;
  return r.valore;
}
function _pianoIsLavoro(codice) {
  return !!_pianoTurnoInfo(codice);
}

// Calcola le violazioni del mese corrente. Ritorna la lista e riempie _pianoViolCelle.
function _pianoCalcolaViolazioni() {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
  const no4w1c1w = _pianoRegolaVal('no_4w1c1w') === 'TRUE';
  const diurnoPreV = _pianoRegolaVal('diurno_prima_vacanza') === 'TRUE';
  const supSoloZ = _pianoRegolaVal('sup_solo_z_settimana') === 'TRUE';
  const supVenSab = _pianoRegolaVal('sup_ven_sab_z_e_s') === 'TRUE';
  const l1SoloBoSup = _pianoRegolaVal('l1_solo_bo_sup') === 'TRUE';
  const celle = {};
  const lista = [];
  const aggiungi = (nome, giorno, msg) => {
    const dstr = ym + '-' + String(giorno).padStart(2, '0');
    (celle[nome + '|' + dstr] = celle[nome + '|' + dstr] || []).push(msg);
    lista.push({ nome: nome, giorno: giorno, msg: msg });
  };
  const perNome = {};
  _pianoRighe.forEach((r) => {
    const g = parseInt(r.data.split('-')[2]);
    (perNome[r.collaboratore] = perNome[r.collaboratore] || {})[g] = r.codice;
  });
  Object.keys(perNome).forEach((nome) => {
    const giorni = perNome[nome];
    let consec = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = giorni[g] || '';
      const lavoro = _pianoIsLavoro(cod);
      // 1) massimo giorni lavorativi consecutivi
      if (lavoro) {
        consec++;
        if (maxCons && consec === maxCons + 1)
          aggiungi(nome, g, consec - 1 + '+ giorni lavorativi consecutivi (max ' + maxCons + ')');
      } else {
        consec = 0;
      }
      // 2) riposo minimo tra due turni consecutivi
      if (minRiposo && lavoro && giorni[g + 1] && _pianoIsLavoro(giorni[g + 1])) {
        const t1 = _pianoTurnoInfo(cod);
        const t2 = _pianoTurnoInfo(giorni[g + 1]);
        const fine1 = _pianoOra(t1.ora_fine);
        const inizio2 = _pianoOra(t2.ora_inizio);
        if (fine1 != null && inizio2 != null) {
          const fineAbs = t1.oltre23 || fine1 < _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
          const riposo = 24 + inizio2 - fineAbs;
          if (riposo < minRiposo)
            aggiungi(
              nome,
              g + 1,
              'solo ' + riposo.toFixed(1) + 'h di riposo dopo ' + cod + ' (min ' + minRiposo + 'h)',
            );
        }
      }
      // 3) vietato 4 lavoro + 1 riposo + 1 lavoro
      if (no4w1c1w && !lavoro && cod && g >= 5) {
        let prima = 0;
        for (let k = g - 1; k >= 1 && _pianoIsLavoro(giorni[k]); k--) prima++;
        if (prima >= 4 && _pianoIsLavoro(giorni[g + 1] || ''))
          aggiungi(nome, g, 'riposo singolo dopo ' + prima + ' giorni di lavoro (vietato 4+1+1)');
      }
      // 4) turno diurno il giorno prima delle vacanze
      if (diurnoPreV && (cod === 'V' || cod === 'V1') && (giorni[g - 1] || '') && _pianoIsLavoro(giorni[g - 1])) {
        const tp = _pianoTurnoInfo(giorni[g - 1]);
        if (tp && tp.tipo === 'NOTTURNO')
          aggiungi(nome, g - 1, 'turno notturno il giorno prima delle vacanze (deve essere diurno)');
      }
      // 5) regole per funzione (SUP solo turni Z in settimana; L1/9 solo BO e SUP)
      if (lavoro) {
        const infoC = _pianoCollabInfo(nome);
        const fz = infoC && infoC.funzione;
        const t = _pianoTurnoInfo(cod);
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        if (supSoloZ && fz === 'SUP' && t && dow >= 1 && dow <= 4) {
          // lun-gio: SUP solo turni Z (o BO L1/9)
          if (!(cod[0] === 'Z' || cod === 'L1' || cod === '9'))
            aggiungi(nome, g, 'SUP con turno ' + cod + ' in settimana (lun-gio solo turni Z)');
        }
        if (supVenSab && fz === 'SUP' && t && (dow === 5 || dow === 6)) {
          if (!(cod[0] === 'Z' || cod[0] === 'S' || cod === 'L1' || cod === '9'))
            aggiungi(nome, g, 'SUP con turno ' + cod + ' nel weekend (ven/sab solo Z o S)');
        }
        if (l1SoloBoSup && (cod === 'L1' || cod === '9') && fz !== 'BO' && fz !== 'SUP' && fz !== 'RESP')
          aggiungi(nome, g, 'turno ' + cod + ' riservato a BO e SUP (funzione: ' + (fz || 'nessuna') + ')');
      }
    }
  });
  return { celle: celle, lista: lista };
}

function validaPiano() {
  const r = _pianoCalcolaViolazioni();
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  logAzione('Piano validato', _pianoMeseSel + ' — ' + r.lista.length + ' violazioni');
  renderPiano();
}

function _pianoRenderViolazioni() {
  const el = document.getElementById('piano-violazioni');
  if (!el || _pianoViolLista === null) return;
  if (!_pianoViolLista.length) {
    el.innerHTML =
      '<p style="padding:8px 14px;font-size:.82rem;color:#2c6e49;font-weight:600">✓ Nessuna violazione delle regole attive nel mese.</p>';
    return;
  }
  let h =
    '<div style="padding:8px 14px"><p style="font-size:.82rem;font-weight:700;color:var(--accent);margin-bottom:6px">' +
    _pianoViolLista.length +
    ' violazioni (celle evidenziate in rosso):</p><div style="max-height:180px;overflow-y:auto;font-size:.78rem;line-height:1.7">';
  _pianoViolLista.forEach((v) => {
    h += '<div>• <strong>' + escP(v.nome) + '</strong> — giorno ' + v.giorno + ': ' + escP(v.msg) + '</div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
}

// ================================================================
// FASE 2 — GENERA BOZZA (euristica istantanea, non il solver)
// Riempie i fabbisogni del mese rispettando: riposo 11h, max
// consecutivi, idoneità storica (gruppi già fatti), equità ore.
// Le celle esistenti (V, protette, malattie Diario) non si toccano.
// ================================================================
async function generaBozzaPiano() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  const fabb =
    (await secGet(
      'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!fabb.length) {
    toast('Nessun fabbisogno configurato per questo mese: la bozza non sa cosa riempire');
    return;
  }
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  // storia per idoneità (chi ha già fatto quel gruppo) e familiarità:
  // tutte le assegnazioni passate del settore (le più recenti prima)
  const storia =
    (await secGet('piano?data=lt.' + da + '&reparto_dip=eq.' + _pianoReparto() + '&order=data.desc&limit=5000')) || [];
  const idoneita = {}; // nome -> Set(gruppi)
  const familiarita = {}; // nome|codice -> n
  storia.concat(_pianoRighe).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t) return;
    (idoneita[r.collaboratore] = idoneita[r.collaboratore] || new Set()).add(t.gruppo);
    familiarita[r.collaboratore + '|' + r.codice] = (familiarita[r.collaboratore + '|' + r.codice] || 0) + 1;
  });
  const malattie = _pianoMalattieMese(ym);
  // stato griglia: esistenti + assegnazioni della bozza
  const cella = {}; // 'nome|g' -> codice
  _pianoRighe.forEach((r) => (cella[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
  const oreMese = {}; // equità
  Object.keys(cella).forEach((k) => {
    const t = _pianoTurnoInfo(cella[k]);
    if (t) oreMese[k.split('|')[0]] = (oreMese[k.split('|')[0]] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto())
    .map((c) => c.nome);
  const consecPrima = (nome, g) => {
    let n = 0;
    for (let k = g - 1; k >= 1 && _pianoIsLavoro(cella[nome + '|' + k] || ''); k--) n++;
    return n;
  };
  const riposoOk = (nome, g, t) => {
    // verso il giorno prima
    const prev = _pianoTurnoInfo(cella[nome + '|' + (g - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = prev.oltre23 || finePrev < _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    // verso il giorno dopo (se già assegnato, es. cella protetta)
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = t.oltre23 || fine < _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  // fabbisogno per giorno
  const fabbG = {}; // g -> [{codice, quantita}]
  fabb.forEach((f) => {
    const g = parseInt(f.data.split('-')[2]);
    (fabbG[g] = fabbG[g] || []).push(f);
  });
  const nuove = [];
  const scoperti = [];
  for (let g = 1; g <= nGiorni; g++) {
    (fabbG[g] || []).forEach((f) => {
      const t = _pianoTurnoInfo(f.turno_codice);
      if (!t) return;
      const dstr = ym + '-' + String(g).padStart(2, '0');
      let have = nomi.filter((n) => cella[n + '|' + g] === f.turno_codice).length;
      while (have < f.quantita) {
        const dowG = new Date(dstr + 'T12:00:00').getDay();
        const candidati = nomi
          .filter((n) => {
            if (cella[n + '|' + g] || malattie[n + '|' + dstr]) return false;
            const infoC = _pianoCollabInfo(n);
            // preferenze collaboratore
            if (infoC && infoC.solo_diurni && t.tipo === 'NOTTURNO') return false;
            if (
              infoC &&
              infoC.turni_bloccati &&
              infoC.turni_bloccati
                .split(',')
                .map((x) => x.trim())
                .includes(f.turno_codice)
            )
              return false;
            // mappature per funzione (SUP/BO limitati ai loro turni; regole settimana SUP)
            const fz = infoC && infoC.funzione;
            const mapp = _pianoMappFunzione(fz);
            if (mapp) {
              const voci = mapp
                .filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO')
                .map((m) => m.turno_codice);
              if (voci.length && !voci.includes(f.turno_codice)) return false;
              if (
                fz === 'SUP' &&
                dowG >= 1 &&
                dowG <= 4 &&
                !(f.turno_codice[0] === 'Z' || f.turno_codice === 'L1' || f.turno_codice === '9')
              )
                return false;
            } else if (!(idoneita[n] && idoneita[n].has(t.gruppo))) return false;
            return consecPrima(n, g) < maxCons && riposoOk(n, g, t);
          })
          .sort((x, y) => {
            const mx = _pianoMappFunzione((_pianoCollabInfo(x) || {}).funzione);
            const my = _pianoMappFunzione((_pianoCollabInfo(y) || {}).funzione);
            const bonus = (m) =>
              m
                ? m.some(
                    (v) => v.turno_codice === f.turno_codice && (v.tipo === 'PRINCIPALE' || v.tipo === 'PREFERITO'),
                  )
                  ? -1
                  : 0
                : 0;
            return (
              bonus(mx) - bonus(my) ||
              (oreMese[x] || 0) - (oreMese[y] || 0) ||
              (familiarita[y + '|' + f.turno_codice] || 0) - (familiarita[x + '|' + f.turno_codice] || 0)
            );
          });
        if (!candidati.length) {
          scoperti.push(f.turno_codice + ' giorno ' + g);
          break;
        }
        const scelto = candidati[0];
        cella[scelto + '|' + g] = f.turno_codice;
        oreMese[scelto] = (oreMese[scelto] || 0) + (parseFloat(t.durata_ore) || 0);
        nuove.push({
          collaboratore: scelto,
          data: dstr,
          codice: f.turno_codice,
          protetto: false,
          generato: true,
          reparto_dip: _pianoReparto(),
        });
        have++;
      }
    });
  }
  if (!nuove.length) {
    toast(
      'Niente da generare: fabbisogni già coperti' +
        (scoperti.length ? ' (' + scoperti.length + ' scoperti senza candidati)' : ''),
    );
    return;
  }
  if (
    !confirm(
      'Genera bozza per ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        '):\n\n• ' +
        nuove.length +
        ' turni da assegnare\n• ' +
        scoperti.length +
        ' posti senza candidato idoneo\n\nLe celle esistenti (vacanze, protette, malattie) NON vengono toccate.\nLa bozza si può eliminare con "Cancella piano". Procedere?',
    )
  )
    return;
  try {
    const r = await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove });
    logAzione('Piano: bozza generata', ym + ' — ' + nuove.length + ' turni, ' + scoperti.length + ' scoperti');
    toast(
      'Bozza generata: ' +
        ((r && r.inserite) || nuove.length) +
        ' turni' +
        (scoperti.length ? ' — ' + scoperti.length + ' scoperti' : ''),
    );
    _pianoViolLista = null;
    _pianoViolCelle = {};
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore generazione bozza');
  }
}

async function cancellaBozzaPiano() {
  // IDENTICO a Turnivo (cancella_piano): elimina le celle NON protette del mese;
  // opzione "cancella tutto" per includere anche le protette.
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const nonProtette = _pianoRighe.filter((r) => !r.protetto).length;
  const protette = _pianoRighe.length - nonProtette;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cancella piano — ' +
    ym +
    '</h3><p style="margin-bottom:14px;font-size:.88rem">' +
    nonProtette +
    ' celle generate/non protette, ' +
    protette +
    ' protette (manuali/vacanze).</p>' +
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" onclick="eseguiCancellaPiano(false)">Solo non protette (' +
    nonProtette +
    ')</button>' +
    '<button class="btn-modal-ok" style="background:var(--accent)" onclick="eseguiCancellaPiano(true)">TUTTE (' +
    _pianoRighe.length +
    ')</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCancellaPiano(tutto) {
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const n = tutto ? _pianoRighe.length : _pianoRighe.filter((r) => !r.protetto).length;
  if (!n) {
    toast('Niente da cancellare');
    return;
  }
  if (
    tutto &&
    !confirm('ATTENZIONE: verranno eliminate ANCHE le celle protette (vacanze, inserimenti manuali). Confermi?')
  )
    return;
  try {
    await secDel(
      'piano',
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + (tutto ? '' : '&protetto=eq.false'),
    );
    logAzione('Piano: cancellato', ym + ' — ' + n + ' celle (tutto=' + tutto + ')');
    toast('Piano cancellato: ' + n + ' celle rimosse');
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}

// ================================================================
// REGOLE DEL PIANO — card admin: elenco ordinato, valori e stato
// modificabili. Etichetta onesta su DOVE ogni regola è applicata.
// ================================================================
const PIANO_REGOLE_DOVE = {
  max_consecutivi: 'Validatore + Bozza',
  min_riposo_ore: 'Validatore + Bozza',
  no_4w1c1w: 'Validatore',
  diurno_prima_vacanza: 'Validatore',
  sup_solo_z_settimana: 'Validatore + Bozza',
  sup_ven_sab_z_e_s: 'Validatore + Bozza',
  l1_solo_bo_sup: 'Validatore + Bozza',
};
function _pianoRegoleDove(nome) {
  return PIANO_REGOLE_DOVE[nome] || 'Solver (Fase 3)';
}
function _renderPianoRegoleCard() {
  if (!isAdmin()) return '';
  const ordineTipo = { HARD: 1, SOFT: 2, PIPELINE: 3 };
  const regole = pianoRegoleCache
    .slice()
    .sort((a, b) => (ordineTipo[a.tipo] || 9) - (ordineTipo[b.tipo] || 9) || (b.peso || 0) - (a.peso || 0));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole del piano (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.76rem;color:var(--muted);margin-bottom:8px">HARD = mai violabili (il validatore le segnala). SOFT = preferenze con peso. PIPELINE = usate dal generatore. La colonna "Applicata da" dice onestamente dove ogni regola agisce oggi: quelle marcate "Solver (Fase 3)" sono conservate ma non ancora attive nel Diario.</p>';
  let tipoCorr = '';
  h += '<div style="overflow-x:auto"><table class="piano-table" style="min-width:720px;font-size:.76rem">';
  h +=
    '<thead><tr><th style="text-align:left">Regola</th><th style="text-align:left">Descrizione</th><th>Valore</th><th>Peso</th><th>Attiva</th><th>Applicata da</th></tr></thead><tbody>';
  regole.forEach((r) => {
    if (r.tipo !== tipoCorr) {
      tipoCorr = r.tipo;
      h +=
        '<tr><td colspan="6" style="text-align:left;background:var(--paper2);font-weight:700;letter-spacing:.06em">' +
        escP(tipoCorr) +
        '</td></tr>';
    }
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(r.nome) +
      '</td><td style="text-align:left;white-space:normal;min-width:220px">' +
      escP(r.descrizione || '') +
      '</td><td><input type="text" value="' +
      escP(r.valore || '') +
      '" onchange="salvaPianoRegola(' +
      r.id +
      ',\'valore\',this.value)" style="width:64px;padding:3px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td>' +
      (r.peso || 0) +
      '</td><td><input type="checkbox"' +
      (r.attivo !== false ? ' checked' : '') +
      ' onchange="salvaPianoRegola(' +
      r.id +
      ',\'attivo\',this.checked)"></td><td style="font-size:.7rem;color:' +
      (_pianoRegoleDove(r.nome).indexOf('Fase 3') === -1 ? '#2c6e49;font-weight:700' : 'var(--muted)') +
      '">' +
      _pianoRegoleDove(r.nome) +
      '</td></tr>';
  });
  h += '</tbody></table></div></div></div>';
  return h;
}
async function salvaPianoRegola(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    patch[campo] = campo === 'attivo' ? !!valore : String(valore).trim();
    await secPatch('piano_regole', 'id=eq.' + id, patch);
    const r = pianoRegoleCache.find((x) => x.id === id);
    if (r) r[campo] = patch[campo];
    logAzione('Piano: regola modificata', (r ? r.nome : id) + ' ' + campo + ' → ' + patch[campo]);
    toast('Regola aggiornata');
    _pianoViolCelle = {};
    _pianoViolLista = null;
  } catch (e) {
    toast('Errore salvataggio regola');
  }
}

// ================================================================
// PERSONALIZZAZIONE COMPLETA — fabbisogni, turni, codici, festivi
// ================================================================
let _pianoFabbCache = [];

async function setPianoFabbisogno(codice, dstr) {
  if (!puoGestirePiano()) return;
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  const v = prompt(
    'Persone necessarie per ' +
      codice +
      ' il ' +
      new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
      ' (0 = rimuovi):',
    String(attuale),
  );
  if (v === null) return;
  const q = parseInt(v);
  if (isNaN(q) || q < 0 || q > 99) {
    toast('Inserisci un numero tra 0 e 99');
    return;
  }
  try {
    if (esistente && q === 0) {
      await secDel('piano_fabbisogni', 'id=eq.' + esistente.id);
    } else if (esistente) {
      await secPatch('piano_fabbisogni', 'id=eq.' + esistente.id, { quantita: q });
    } else if (q > 0) {
      await secPost('piano_fabbisogni', {
        data: dstr,
        turno_codice: codice,
        quantita: q,
        reparto_dip: _pianoReparto(),
      });
    } else return;
    logAzione('Piano: fabbisogno', codice + ' ' + dstr + ' → ' + q);
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio fabbisogno');
  }
}

async function copiaFabbisognoMese() {
  if (!puoGestirePiano()) return;
  const p = _pianoMeseSel.split('-');
  const dPrec = new Date(parseInt(p[0]), parseInt(p[1]) - 2, 15);
  const ymPrec = dPrec.getFullYear() + '-' + String(dPrec.getMonth() + 1).padStart(2, '0');
  const daP = ymPrec + '-01';
  const aP = ymPrec + '-' + String(_pianoUltimoGiorno(ymPrec)).padStart(2, '0');
  const prec =
    (await secGet(
      'piano_fabbisogni?data=gte.' + daP + '&data=lte.' + aP + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!prec.length) {
    toast('Nessun fabbisogno nel mese precedente (' + ymPrec + ')');
    return;
  }
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const giaPresenti = new Set(_pianoFabbCache.map((f) => f.data + '|' + f.turno_codice));
  const nuovi = prec
    .map((f) => ({ giorno: parseInt(f.data.split('-')[2]), turno_codice: f.turno_codice, quantita: f.quantita }))
    .filter((f) => f.giorno <= nGiorni)
    .map((f) => ({
      data: _pianoMeseSel + '-' + String(f.giorno).padStart(2, '0'),
      turno_codice: f.turno_codice,
      quantita: f.quantita,
      reparto_dip: _pianoReparto(),
    }))
    .filter((f) => !giaPresenti.has(f.data + '|' + f.turno_codice));
  if (!nuovi.length) {
    toast('Fabbisogno già presente per tutte le celle del mese');
    return;
  }
  if (
    !confirm(
      'Copiare ' +
        nuovi.length +
        ' fabbisogni da ' +
        ymPrec +
        ' a ' +
        _pianoMeseSel +
        '?\n(le celle già impostate non vengono toccate)',
    )
  )
    return;
  try {
    for (let i = 0; i < nuovi.length; i += 10) {
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    }
    logAzione('Piano: fabbisogno copiato', ymPrec + ' → ' + _pianoMeseSel + ' (' + nuovi.length + ' celle)');
    toast('Fabbisogno copiato (' + nuovi.length + ' celle)');
    renderPiano();
  } catch (e) {
    toast('Errore copia fabbisogno');
  }
}

// ---- Card TURNI (admin) ----
function _renderPianoTurniCard() {
  if (!isAdmin()) return '';
  const turni = _pianoTurniReparto();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni — ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (admin)</div><div style="padding:10px 14px">';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:640px;font-size:.76rem"><thead><tr><th>Codice</th><th>Gruppo</th><th>Inizio</th><th>Fine</th><th>Ore</th><th>Tipo</th><th>Oltre 23</th><th>Attivo</th><th></th></tr></thead><tbody>';
  turni
    .slice()
    .sort((x, y) => (x.gruppo || '').localeCompare(y.gruppo || '') || x.codice.localeCompare(y.codice))
    .forEach((t) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(t.codice) +
        '</td><td>' +
        escP(t.gruppo || '') +
        '</td><td><input type="time" value="' +
        escP((t.ora_inizio || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_inizio\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_fine || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_fine\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="number" step="0.25" value="' +
        (t.durata_ore || 0) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'durata_ore\',this.value)" style="width:58px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><select onchange="salvaPianoTurno(' +
        t.id +
        ',\'tipo\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option' +
        (t.tipo === 'DIURNO' ? ' selected' : '') +
        '>DIURNO</option><option' +
        (t.tipo === 'NOTTURNO' ? ' selected' : '') +
        '>NOTTURNO</option></select></td><td><input type="checkbox"' +
        (t.oltre23 ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'oltre23\',this.checked)"></td><td><input type="checkbox"' +
        (t.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaPianoTurno(' +
        t.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Codice</label><input type="text" id="pt-nuovo-codice" placeholder="S9" style="width:80px"></div>' +
    '<div class="field"><label>Gruppo</label><input type="text" id="pt-nuovo-gruppo" placeholder="SALA" style="width:110px"></div>' +
    '<div class="field"><label>Inizio</label><input type="time" id="pt-nuovo-inizio"></div>' +
    '<div class="field"><label>Fine</label><input type="time" id="pt-nuovo-fine"></div>' +
    '<div class="field"><label>Ore</label><input type="number" step="0.25" id="pt-nuovo-ore" value="8.25" style="width:70px"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoTurno()">+ Aggiungi turno</button></div>';
  h += '</div></div>';
  return h;
}
async function salvaPianoTurno(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'oltre23') patch[campo] = !!valore;
    else if (campo === 'durata_ore') patch[campo] = parseFloat(valore) || 0;
    else patch[campo] = String(valore).trim();
    await secPatch('piano_turni', 'id=eq.' + id, patch);
    const t = pianoTurniCache.find((x) => x.id === id);
    if (t) t[campo] = patch[campo];
    logAzione('Piano: turno modificato', (t ? t.codice : id) + ' ' + campo + ' → ' + patch[campo]);
    toast('Turno aggiornato');
  } catch (e) {
    toast('Errore salvataggio turno');
  }
}
async function aggiungiPianoTurno() {
  if (!isAdmin()) return;
  const codice = ((document.getElementById('pt-nuovo-codice') || {}).value || '').trim().toUpperCase();
  const gruppo = ((document.getElementById('pt-nuovo-gruppo') || {}).value || '').trim().toUpperCase();
  const inizio = (document.getElementById('pt-nuovo-inizio') || {}).value || '';
  const fine = (document.getElementById('pt-nuovo-fine') || {}).value || '';
  const oreV = parseFloat((document.getElementById('pt-nuovo-ore') || {}).value) || 8.25;
  if (!codice || !gruppo || !inizio || !fine) {
    toast('Compila codice, gruppo e orari');
    return;
  }
  if (pianoTurniCache.some((t) => t.codice === codice && (t.reparto_dip || 'slots') === _pianoReparto())) {
    toast('Codice turno già esistente in questo settore');
    return;
  }
  const oltre23 = _pianoOra(fine) < _pianoOra(inizio) || _pianoOra(fine) > 23;
  try {
    const r = await secPost('piano_turni', {
      codice: codice,
      gruppo: gruppo,
      ora_inizio: inizio,
      ora_fine: fine,
      durata_ore: oreV,
      tipo: _pianoOra(inizio) >= 15 || oltre23 ? 'NOTTURNO' : 'DIURNO',
      oltre23: oltre23,
      colore: PIANO_COLORI_GRUPPO[gruppo] || '#EEEEEE',
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoTurniCache.push(r[0]);
    logAzione('Piano: turno aggiunto', codice + ' (' + gruppo + ')');
    toast('Turno ' + codice + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta turno');
  }
}
const PIANO_COLORI_GRUPPO = {
  SALA: '#F2DBDB',
  REC: '#FF99CC',
  CASSA: '#FBD4B4',
  SUP: '#B8CCE4',
  ACCOGLIENZA: '#C6EFCE',
  BO: '#CCC0D9',
  VALET: '#343a40',
};
async function eliminaPianoTurno(id) {
  if (!isAdmin()) return;
  const t = pianoTurniCache.find((x) => x.id === id);
  if (!t) return;
  const usato = (await secGet('piano?codice=eq.' + encodeURIComponent(t.codice) + '&limit=1')) || [];
  if (usato.length) {
    toast('Il turno ' + t.codice + ' è usato nel piano: disattivalo invece di eliminarlo');
    return;
  }
  if (!confirm('Eliminare il turno ' + t.codice + '? (mai usato nel piano)')) return;
  try {
    await secDel('piano_turni', 'id=eq.' + id);
    pianoTurniCache = pianoTurniCache.filter((x) => x.id !== id);
    logAzione('Piano: turno eliminato', t.codice);
    toast('Turno eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione turno');
  }
}

// ---- Card CODICI SPECIALI (admin) ----
function _renderPianoCodiciCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Codici speciali (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.74rem;color:var(--muted);margin-bottom:6px">Assenze e situazioni non lavorative. "Riposo" = il codice conta come giorno di riposo per le regole. Le ore seguono le formule CCL originali.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:560px;font-size:.76rem"><thead><tr><th>Codice</th><th style="text-align:left">Descrizione</th><th>Ore</th><th>Riposo</th><th>Attivo</th></tr></thead><tbody>';
  pianoCodiciCache
    .slice()
    .sort((x, y) => x.codice.localeCompare(y.codice))
    .forEach((c) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(c.codice) +
        '</td><td style="text-align:left"><input type="text" value="' +
        escP(c.descrizione || '') +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'descrizione\',this.value)" style="width:200px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="number" step="0.001" value="' +
        (c.ore || 0) +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'ore\',this.value)" style="width:70px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
        (c.is_riposo ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'is_riposo\',this.checked)"></td><td><input type="checkbox"' +
        (c.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ",'attivo',this.checked)\"></td></tr>";
    });
  h += '</tbody></table></div></div></div>';
  return h;
}
async function salvaPianoCodice(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'is_riposo') patch[campo] = !!valore;
    else if (campo === 'ore') patch[campo] = parseFloat(valore) || 0;
    else patch[campo] = String(valore).trim();
    await secPatch('piano_codici', 'id=eq.' + id, patch);
    const c = pianoCodiciCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: codice modificato', (c ? c.codice : id) + ' ' + campo);
    toast('Codice aggiornato');
  } catch (e) {
    toast('Errore salvataggio codice');
  }
}

// ---- Card FESTIVI (admin) ----
function _renderPianoFestiviCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Festivi (admin)</div><div style="padding:10px 14px">';
  pianoFestiviCache
    .slice()
    .sort((x, y) => x.data.localeCompare(y.data))
    .forEach((f) => {
      h +=
        '<div class="tipo-item"><div class="tipo-item-name">' +
        new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') +
        ' — ' +
        escP(f.descrizione || '') +
        (f.cgf ? ' <span class="tipo-item-default">(CGF)</span>' : '') +
        '</div><button class="btn-del-tipo" onclick="eliminaPianoFestivo(' +
        f.id +
        ')">Rimuovi</button></div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Data</label><input type="date" id="pf-nuova-data"></div>' +
    '<div class="field"><label>Descrizione</label><input type="text" id="pf-nuova-desc" placeholder="Es: Natale"></div>' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:.78rem;cursor:pointer"><input type="checkbox" id="pf-nuovo-cgf" checked> CGF</label>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoFestivo()">+ Aggiungi</button></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:6px;border-top:1px solid var(--line);padding-top:8px"><div class="field"><label>Genera automaticamente i festivi di un anno</label><input type="number" id="pf-genera-anno" value="' +
    (new Date().getFullYear() + 1) +
    '" min="2024" max="2050" style="width:90px"></div>' +
    '<button class="btn-add-tipo" onclick="generaPianoFestivi()">Genera festivi anno</button>' +
    '<span style="font-size:.72rem;color:var(--muted)">11 festivi italiani (Lunedì dell&#39;Angelo calcolato dalla Pasqua)</span></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoFestivo() {
  if (!isAdmin()) return;
  const data = (document.getElementById('pf-nuova-data') || {}).value || '';
  const desc = ((document.getElementById('pf-nuova-desc') || {}).value || '').trim();
  const cgf = !!(document.getElementById('pf-nuovo-cgf') || {}).checked;
  if (!data || !desc) {
    toast('Compila data e descrizione');
    return;
  }
  try {
    const r = await secPost('piano_festivi', { data: data, descrizione: desc, cgf: cgf });
    if (r && r[0]) pianoFestiviCache.push(r[0]);
    logAzione('Piano: festivo aggiunto', data + ' ' + desc);
    toast('Festivo aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore (data già presente?)');
  }
}
async function eliminaPianoFestivo(id) {
  if (!isAdmin()) return;
  const f = pianoFestiviCache.find((x) => x.id === id);
  if (!f || !confirm('Rimuovere il festivo ' + f.data + ' (' + (f.descrizione || '') + ')?')) return;
  try {
    await secDel('piano_festivi', 'id=eq.' + id);
    pianoFestiviCache = pianoFestiviCache.filter((x) => x.id !== id);
    logAzione('Piano: festivo rimosso', f.data);
    toast('Festivo rimosso');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione festivo');
  }
}

// ================================================================
// SETTORE DEL PIANO — un operatore autorizzato può vedere/gestire
// il piano di un altro settore (es. supervisor Tavoli sul piano
// Slots) senza cambiare login: il selettore vale solo per il Piano.
// ================================================================
let _pianoRepartoSel = null; // null = segue il settore corrente dell'app
function _pianoReparto() {
  return _pianoRepartoSel || currentReparto;
}
function pianoCambiaReparto(rep) {
  _pianoRepartoSel = rep === currentReparto ? null : rep;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ================================================================
// FESTIVI AUTOMATICI — genera i festivi di un anno con un click.
// Lista = quella osservata dal casinò (da Turnivo 2026): 7 fissi +
// Lunedì di Pasqua e Ascensione calcolati dalla data di Pasqua.
// ================================================================
function _pianoPasqua(anno) {
  // algoritmo di Meeus (calendario gregoriano)
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mese = Math.floor((hh + l - 7 * m + 114) / 31);
  const giorno = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno, 12);
}
function _pianoFestiviAnno(anno) {
  const pasqua = _pianoPasqua(anno);
  const add = (base, giorni) => {
    const d = new Date(base);
    d.setDate(d.getDate() + giorni);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  };
  // FESTIVI ITALIANI (scelta confermata dall'utente il 29/08/2026)
  return [
    { data: anno + '-01-01', descrizione: 'Capodanno' },
    { data: anno + '-01-06', descrizione: 'Epifania' },
    { data: add(pasqua, 1), descrizione: "Lunedì dell'Angelo" },
    { data: anno + '-04-25', descrizione: 'Festa della Liberazione' },
    { data: anno + '-05-01', descrizione: 'Festa del Lavoro' },
    { data: anno + '-06-02', descrizione: 'Festa della Repubblica' },
    { data: anno + '-08-15', descrizione: 'Ferragosto' },
    { data: anno + '-11-01', descrizione: 'Ognissanti' },
    { data: anno + '-12-08', descrizione: 'Immacolata Concezione' },
    { data: anno + '-12-25', descrizione: 'Natale' },
    { data: anno + '-12-26', descrizione: 'Santo Stefano' },
  ];
}
async function generaPianoFestivi() {
  if (!isAdmin()) return;
  const anno = parseInt((document.getElementById('pf-genera-anno') || {}).value);
  if (!anno || anno < 2024 || anno > 2050) {
    toast('Inserisci un anno valido (2024-2050)');
    return;
  }
  const esistenti = new Set(pianoFestiviCache.map((f) => f.data));
  const nuovi = _pianoFestiviAnno(anno).filter((f) => !esistenti.has(f.data));
  if (!nuovi.length) {
    toast('Festivi ' + anno + ' già tutti presenti');
    return;
  }
  if (
    !confirm(
      'Generare ' +
        nuovi.length +
        ' festivi per il ' +
        anno +
        '?\n\n' +
        nuovi
          .map((f) => new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') + ' — ' + f.descrizione)
          .join('\n') +
        '\n\n(tutti con CGF attivo; quelli già presenti non vengono toccati)',
    )
  )
    return;
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', { data: f.data, descrizione: f.descrizione, cgf: true });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    logAzione('Piano: festivi generati', anno + ' (' + nuovi.length + ')');
    toast('Generati ' + nuovi.length + ' festivi per il ' + anno);
    renderPiano();
  } catch (e) {
    toast('Errore generazione festivi');
  }
}

// ================================================================
// COPIA PER EXCEL / STAMPA PDF / SCAMBIO TURNO / SELEZIONE RIGA
// ================================================================
function copiaPianoExcel() {
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab) return;
  const righe = [];
  tab.querySelectorAll('tr').forEach((tr) => {
    const celle = [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim().replace(/\n/g, ' '));
    righe.push(celle.join('\t'));
  });
  navigator.clipboard
    .writeText(righe.join('\n'))
    .then(() => toast('Piano copiato: incollalo in Excel'))
    .catch(() => toast('Copia non riuscita'));
}

async function stampaPianoPDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore libreria PDF');
      return;
    }
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const label = (MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const mappa = {};
  _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
  const nomi = [...new Set(_pianoRighe.map((r) => r.collaboratore))].sort();
  const head = ['Collaboratore'];
  for (let g = 1; g <= nGiorni; g++) head.push(String(g));
  const body = nomi.map((n) => {
    const riga = [n];
    for (let g = 1; g <= nGiorni; g++) riga.push(mappa[n + '|' + g] || '');
    return riga;
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Piano di lavoro — ' + label + ' — ' + repartoLabel(_pianoReparto()), 148, 10, { align: 'center' });
  doc.autoTable({
    startY: 14,
    head: [head],
    body: body,
    theme: 'grid',
    margin: { left: 4, right: 4 },
    styles: { fontSize: 5.2, cellPadding: 0.6, halign: 'center', lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 18, 8], textColor: [255, 255, 255], fontSize: 5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26, fontSize: 5 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index > 0 && d.cell.raw) {
        const col = _pianoColore(String(d.cell.raw));
        if (col) {
          const hex = col.replace('#', '');
          d.cell.styles.fillColor = [
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16),
          ];
        }
      }
    },
  });
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Casino Lugano SA — Piano di lavoro — generato il ' + new Date().toLocaleDateString('it-IT'), 4, 205);
  logAzione('Piano stampato', label + ' (' + _pianoReparto() + ')');
  mostraPdfPreview(doc, 'piano_' + ym + '_' + _pianoReparto() + '.pdf', 'Piano ' + label);
}

// Formulario cambio turno IDENTICO a Turnivo (template cambio_turno_pdf.html):
// header centrato, sezioni con barra colorata (A blu, B arancio, motivazione
// verde, autorizzazione viola con checkbox), chip turni, firme con data.
function _pdfCambioTurno(dati) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  // header centrato
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text('Casino Lugano SA', 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text(dati.tipo === 'ESIGENZE' ? 'CAMBIO TURNO PER ESIGENZE OPERATIVE' : 'RICHIESTA CAMBIO TURNO', 105, y, {
    align: 'center',
  });
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

  const chip = (x, yy, testo, bg, fg) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const w = doc.getTextWidth(testo) + 5;
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(x, yy - 4.2, w, 6, 1.2, 1.2, 'F');
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(testo, x + 2.5, yy);
    doc.setTextColor(34, 34, 34);
    return w;
  };
  const sezione = (titolo, barra, sfondo, righe) => {
    const altezza = 12 + righe.length * 6.5 + 3;
    doc.setFillColor(sfondo[0], sfondo[1], sfondo[2]);
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
      if (r[2] === 'chip') {
        const w = chip(M + 6 + 42, yy, r[1], [232, 244, 253], [21, 101, 192]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else if (r[2] === 'chiprosso') {
        const w = chip(M + 6 + 42, yy, r[1], [253, 232, 232], [192, 57, 43]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 34, 34);
        doc.text(String(r[1]), M + 6 + 42, yy);
      }
      yy += 6.5;
    });
    y += altezza + 6;
  };

  if (dati.tipo === 'ESIGENZE') {
    sezione(
      'Collaboratore',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
        ['Nuovo turno:', dati.nuovoTurno, 'chiprosso', dati.nuovoOrari],
      ],
    );
  } else {
    sezione(
      'Collaboratore A (richiedente)',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
      ],
    );
    sezione(
      'Collaboratore B (accetta lo scambio)',
      [230, 126, 34],
      [250, 250, 250],
      [
        ['Nome:', dati.b.nome],
        ['Settore:', dati.b.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.b.turno, 'chip', dati.b.orari],
      ],
    );
  }
  if (dati.restituzione) {
    // IDENTICA a Turnivo: barra viola #8e44ad, sfondo #f8f0ff
    sezione(
      'Restituzione',
      [142, 68, 173],
      [248, 240, 255],
      [
        ['Data restituzione:', dati.restituzione],
        ['', 'In questa data i turni verranno scambiati nuovamente tra i due collaboratori.'],
      ],
    );
  }
  sezione('Motivazione', [46, 204, 113], [240, 250, 240], [['', dati.motivo || 'Nessuna motivazione specificata']]);
  // Autorizzazione con checkbox
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
  doc.text('X', M + 7.2, yy);
  doc.text('Autorizzato', M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text('Non autorizzato', M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Motivo:', M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________________________________________________________________', M + 22, yy);
  y += hAut + 14;
  // firme
  const firme =
    dati.tipo === 'ESIGENZE'
      ? [
          ['Firma Collaboratore', dati.a.nome],
          ['Firma Responsabile', ''],
        ]
      : [
          ['Firma Collaboratore A', dati.a.nome],
          ['Firma Collaboratore B', dati.b.nome],
          ['Firma Responsabile', ''],
        ];
  const wBox = firme.length === 2 ? W * 0.45 : W * 0.3;
  const gap = (W - wBox * firme.length) / (firme.length - 1);
  y += 18;
  firme.forEach((f, i) => {
    const x = M + i * (wBox + gap);
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.35);
    doc.line(x, y, x + wBox, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text(f[0], x + wBox / 2, y + 4.5, { align: 'center' });
    if (f[1]) {
      doc.setFont('helvetica', 'bold');
      doc.text(f[1], x + wBox / 2, y + 9, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Data: ____/____/________', x + wBox / 2, y + (f[1] ? 13.5 : 9), { align: 'center' });
  });
  // footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(221, 221, 221);
  doc.line(M, ph - 14, 210 - M, ph - 14);
  doc.setFontSize(7.5);
  doc.setTextColor(85, 85, 85);
  doc.text(
    'Generato da Turnivo — Casino Lugano SA — Richiesto da: ' + (dati.richiesto || getOperatore()),
    105,
    ph - 9,
    {
      align: 'center',
    },
  );
  return doc;
}

// ---- Scambio turno tra colleghi (come Turnivo cap. 19) ----
function apriScambioTurno() {
  const sel = _pianoCellaSel;
  if (!sel) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  // colleghi con un TURNO quel giorno (scambio turno-turno)
  const colleghi = _pianoRighe.filter(
    (x) => x.data === sel.data && x.collaboratore !== sel.nome && _pianoTurnoInfo(x.codice),
  );
  if (!colleghi.length) {
    toast('Nessun collega con un turno quel giorno');
    return;
  }
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambio turno — ' +
    new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(sel.nome) +
    '</strong> (' +
    escP(r.codice) +
    ') scambia con:</p><select id="scambio-collega" style="width:100%;padding:10px">' +
    colleghi
      .map(
        (c) =>
          '<option value="' +
          escP(c.collaboratore) +
          '">' +
          escP(c.collaboratore) +
          ' — ' +
          escP(c.codice) +
          '</option>',
      )
      .join('') +
    '</select><div class="field" style="text-align:left;margin-top:10px"><label>Motivazione</label><input type="text" id="scambio-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<div style="text-align:left;margin-top:10px"><label style="font-weight:700;font-size:.86rem"><input type="checkbox" id="scambio-restituito" onchange="document.getElementById(\'scambio-rest-wrap\').style.display=this.checked?\'block\':\'none\'"> Con restituzione</label>' +
    '<div id="scambio-rest-wrap" style="display:none;margin-top:6px"><label style="font-size:.8rem">Data restituzione:</label> <input type="date" id="scambio-data-rest" style="padding:6px;max-width:180px"></div></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioTurno()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaScambioTurno() {
  const sel = _pianoCellaSel;
  const collega = (document.getElementById('scambio-collega') || {}).value;
  const motivo = ((document.getElementById('scambio-motivo') || {}).value || '').trim();
  const conRest = (document.getElementById('scambio-restituito') || {}).checked;
  let dataRest = conRest ? (document.getElementById('scambio-data-rest') || {}).value || '' : '';
  if (conRest && dataRest && dataRest <= sel.data) {
    toast('La data di restituzione deve essere successiva al giorno del cambio');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !collega) return;
  const r1 = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  const r2 = _pianoRighe.find((x) => x.collaboratore === collega && x.data === sel.data);
  if (!r1 || !r2) return;
  const c1 = r1.codice;
  const c2 = r2.codice;
  try {
    await secPatch('piano', 'id=eq.' + r1.id, {
      codice: c2,
      protetto: true,
      commento: ('Scambio con ' + collega + ' (era ' + c1 + ')' + (motivo ? ' — ' + motivo : '')).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    await secPatch('piano', 'id=eq.' + r2.id, {
      codice: c1,
      protetto: true,
      commento: ('Scambio con ' + sel.nome + ' (era ' + c2 + ')' + (motivo ? ' — ' + motivo : '')).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r1.codice = c2;
    r2.codice = c1;
    r1.protetto = r2.protetto = true;
    // Restituzione: come Turnivo, scambio inverso applicato subito alla data indicata
    if (dataRest) {
      const op = getOperatore();
      const ra = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === dataRest);
      const rb = _pianoRighe.find((x) => x.collaboratore === collega && x.data === dataRest);
      const ca = ra ? ra.codice : '';
      const cb = rb ? rb.codice : '';
      const applica = async (riga, nomeC, nuovoCod, exCod, altroNome) => {
        const commento = 'Ex ' + exCod + ' - restituzione cambio con ' + altroNome + ' - ' + op;
        if (riga) {
          await secPatch('piano', 'id=eq.' + riga.id, {
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            operatore: op,
            updated_at: new Date().toISOString(),
          });
          riga.codice = nuovoCod;
          riga.protetto = true;
          riga.commento = commento;
        } else if (nuovoCod) {
          const n = await secPost('piano', {
            collaboratore: nomeC,
            data: dataRest,
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            reparto_dip: _pianoReparto(),
            operatore: op,
          });
          if (n && n[0]) _pianoRighe.push(n[0]);
        }
      };
      await applica(ra, sel.nome, cb, ca, collega);
      await applica(rb, collega, ca, cb, sel.nome);
      logAzione('Piano: restituzione programmata', sel.nome + ' <-> ' + collega + ' il ' + dataRest);
    }
    logAzione('Piano: scambio turno', sel.nome + ' (' + c1 + ') <-> ' + collega + ' (' + c2 + ') il ' + sel.data);
    toast(
      'Turni scambiati' +
        (dataRest ? ' — restituzione il ' + new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : ''),
    );
    // Formulario IDENTICO a Turnivo
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const t1 = _pianoTurnoInfo(c1);
      const t2 = _pianoTurnoInfo(c2);
      const fmtOra = (t) =>
        t
          ? '(' +
            (t.ora_inizio || '').substring(0, 5) +
            '-' +
            (t.ora_fine || '').substring(0, 5) +
            ', ' +
            (t.gruppo || '') +
            ')'
          : '';
      const doc = _pdfCambioTurno({
        tipo: 'SCAMBIO',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: c1, orari: fmtOra(t1) },
        b: { nome: collega, settore: repartoLabel(_pianoReparto()), turno: c2, orari: fmtOra(t2) },
        motivo: motivo,
        richiesto: getOperatore(),
        restituzione: dataRest ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : null,
      });
      mostraPdfPreview(doc, 'cambio_turno_' + sel.data + '.pdf', 'Cambio turno ' + sel.data);
    }
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore scambio turno');
  }
}

// ---- Selezione riga/colonna stile Excel (come Turnivo) ----
function _pianoInitSelezione() {
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab || tab.dataset.selInit) return;
  tab.dataset.selInit = '1';
  const clear = () => {
    tab.querySelectorAll('.row-selected').forEach((el) => el.classList.remove('row-selected'));
    tab.querySelectorAll('.col-selected').forEach((el) => el.classList.remove('col-selected'));
  };
  tab.querySelectorAll('tbody .piano-nome').forEach((cella) => {
    cella.addEventListener('click', () => {
      const tr = cella.closest('tr');
      const era = tr.classList.contains('row-selected');
      clear();
      if (!era) tr.classList.add('row-selected');
    });
    cella.addEventListener('dblclick', () => {
      stampaPianoCollaboratore(cella.textContent.trim().replace(/\s+(RESP|SUP|BO|HOST)$/, ''));
    });
    cella.title = 'Click: evidenzia riga — Doppio click: stampa il piano del collaboratore';
  });
  tab.querySelectorAll('tbody .piano-cella').forEach((cella) => {
    cella.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tr = cella.closest('tr');
      const nomeCella = tr.querySelector('.piano-nome');
      const idx = [...tr.children].indexOf(cella);
      const giorno = idx; // colonna 0 = nome, 1..n = giorni
      if (!nomeCella || giorno < 1) return;
      const nome = nomeCella.textContent.trim().replace(/\s+(RESP|SUP|BO|HOST)$/, '');
      mostraPianoCtx(e, nome, _pianoMeseSel + '-' + String(giorno).padStart(2, '0'));
    });
    // Mobile: long-press (>500ms) = menu contestuale, come Turnivo
    let lpTimer = null;
    let lpFired = false;
    cella.addEventListener(
      'touchstart',
      (e) => {
        lpFired = false;
        lpTimer = setTimeout(() => {
          lpFired = true;
          if (navigator.vibrate) navigator.vibrate(50);
          const tocco = e.changedTouches[0] || e.touches[0];
          const tr = cella.closest('tr');
          const nomeCella = tr.querySelector('.piano-nome');
          const idx = [...tr.children].indexOf(cella);
          if (!nomeCella || idx < 1 || !tocco) return;
          const nome = nomeCella.textContent.trim().replace(/\s+(RESP|SUP|BO|HOST)$/, '');
          mostraPianoCtx(
            { preventDefault: () => {}, clientX: tocco.clientX, clientY: tocco.clientY },
            nome,
            _pianoMeseSel + '-' + String(idx).padStart(2, '0'),
          );
        }, 500);
      },
      { passive: true },
    );
    cella.addEventListener('touchend', (e) => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      if (lpFired) {
        e.preventDefault();
        lpFired = false;
      }
    });
    cella.addEventListener(
      'touchmove',
      () => {
        if (lpTimer) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      },
      { passive: true },
    );
  });
  tab.querySelectorAll('thead th').forEach((th, idx) => {
    if (th.classList.contains('piano-nome') || th.classList.contains('piano-tot')) return;
    th.addEventListener('click', () => {
      const era = th.classList.contains('col-selected');
      clear();
      if (era) return;
      th.classList.add('col-selected');
      tab.querySelectorAll('tbody tr').forEach((tr) => {
        const celle = tr.querySelectorAll('th,td');
        if (celle[idx]) celle[idx].classList.add('col-selected');
      });
    });
  });
}

// ================================================================
// TIMBRATURE — inserimento manuale, upload da timbratrice, confronto
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
function _pianoOreTimbrata(entrata, uscita) {
  const e = _pianoOra(entrata);
  const u = _pianoOra(uscita);
  if (e == null || u == null) return 0;
  return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
}
function _renderPianoTimbratureCard() {
  if (!puoGestirePiano() && !isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Timbrature — confronto con il piano</div><div style="padding:10px 14px" id="piano-timb-body">';
  h +=
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn-export" style="font-size:.74rem;padding:5px 12px" onclick="caricaConfrontoTimbrature()">Carica confronto del mese</button>' +
    '<button class="btn-export" style="font-size:.74rem;padding:5px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'timb-file\').click()">Importa file timbratrice</button>' +
    '<input type="file" id="timb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaTimbrature(this)">' +
    '<span style="font-size:.72rem;color:var(--muted)">CSV o Excel con colonne nome / data / entrata / uscita (riconosciute in automatico)</span></div>';
  // inserimento manuale
  h +=
    '<div class="add-tipo-row"><div class="field"><label>Collaboratore</label><select id="timb-collab" style="padding:8px">' +
    collaboratoriCache
      .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto())
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
      ore: _pianoOreTimbrata(entrata, uscita),
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
      !confirm(
        'Importare ' +
          valide.length +
          ' timbrature?' +
          (scartate.length ? '\n(' + scartate.length + ' righe scartate: nome/data non riconosciuti)' : '') +
          '\nLe timbrature già presenti per lo stesso giorno non vengono toccate.',
      )
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
            ore: _pianoOreTimbrata(v.oin, v.oout),
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
  el.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Caricamento...</p>';
  await _pianoCaricaTimbrature();
  if (!_pianoTimbrature.length) {
    el.innerHTML =
      '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Nessuna timbratura per ' + _pianoMeseSel + '.</p>';
    return;
  }
  // ore pianificate per collaboratore (turni del mese)
  const pianOre = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) pianOre[r.collaboratore] = (pianOre[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const timbOre = {};
  const timbGg = {};
  _pianoTimbrature.forEach((t) => {
    timbOre[t.collaboratore] = (timbOre[t.collaboratore] || 0) + (parseFloat(t.ore) || 0);
    timbGg[t.collaboratore] = (timbGg[t.collaboratore] || 0) + 1;
  });
  let h =
    '<div style="overflow-x:auto;margin-top:8px"><table class="piano-table" style="min-width:520px;font-size:.78rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Giorni timbrati</th><th>Ore timbrate</th><th>Ore pianificate</th><th>Differenza</th></tr></thead><tbody>';
  Object.keys(timbOre)
    .sort()
    .forEach((n) => {
      const diff = Math.round((timbOre[n] - (pianOre[n] || 0)) * 10) / 10;
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
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
    });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.7rem;color:var(--muted);margin-top:6px">Differenza = timbrate − pianificate del mese (' +
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
    '<button class="btn-export" style="font-size:.74rem;padding:5px 12px" onclick="caricaStatisticheAnnoPiano()">Carica statistiche ' +
    _pianoMeseSel.split('-')[0] +
    '</button><div id="piano-stat-anno"></div></div></div>'
  );
}
async function caricaStatisticheAnnoPiano() {
  const el = document.getElementById('piano-stat-anno');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Caricamento anno...</p>';
  const anno = _pianoMeseSel.split('-')[0];
  const righe =
    (await secGet(
      'piano?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=20000',
    )) || [];
  const fabb =
    (await secGet(
      'piano_fabbisogni?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=5000',
    )) || [];
  // panoramica mesi
  const mesiDati = {};
  righe.forEach((r) => (mesiDati[r.data.substring(5, 7)] = (mesiDati[r.data.substring(5, 7)] || 0) + 1));
  const mesiFabb = {};
  fabb.forEach((f) => (mesiFabb[f.data.substring(5, 7)] = true));
  let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const ha = mesiDati[mm];
    h +=
      '<button class="btn-export" style="font-size:.7rem;padding:4px 10px;' +
      (ha ? 'border-color:#2c6e49;color:#2c6e49;font-weight:700' : 'color:var(--muted)') +
      '" onclick="_pianoMeseSel=\'' +
      anno +
      '-' +
      mm +
      '\';_pianoViolCelle={};_pianoViolLista=null;renderPiano()">' +
      (MESI[m - 1] || mm) +
      (ha ? ' (' + ha + ')' : '') +
      (mesiFabb[mm] ? ' <span style="color:#d4b86a">F</span>' : '') +
      '</button>';
  }
  h += '</div>';
  // statistiche per collaboratore
  const st = {};
  righe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    const cs = _pianoCodiceInfo(r.codice);
    const o = (st[r.collaboratore] = st[r.collaboratore] || { ore: 0, d: 0, n: 0, we: 0, dom: 0, v: 0, m: 0 });
    const dow = new Date(r.data + 'T12:00:00').getDay();
    if (t) {
      o.ore += parseFloat(t.durata_ore) || 0;
      if (t.tipo === 'NOTTURNO') o.n++;
      else o.d++;
      if (dow === 5 || dow === 6) o.we++;
      if (dow === 0) o.dom++;
    } else if (cs) {
      if (r.codice === 'V' || r.codice === 'V1') o.v++;
      if (r.codice === 'M' || r.codice === 'M1') o.m++;
      o.ore += parseFloat(cs.ore) || 0;
    }
  });
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:660px;font-size:.76rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Ore anno</th><th>Diurni</th><th>Notturni</th><th>Weekend</th><th>Domeniche</th><th>Vacanze</th><th>Malattie</th></tr></thead><tbody>';
  Object.keys(st)
    .sort()
    .forEach((n) => {
      const o = st[n];
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(n) +
        '</td><td>' +
        o.ore.toFixed(1) +
        '</td><td>' +
        o.d +
        '</td><td>' +
        o.n +
        '</td><td' +
        (o.we > 20
          ? ' style="color:#c0392b;font-weight:700"'
          : o.we >= 12
            ? ' style="color:#b39b00;font-weight:700"'
            : '') +
        '>' +
        o.we +
        '</td><td>' +
        o.dom +
        '</td><td>' +
        o.v +
        '</td><td>' +
        o.m +
        '</td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.7rem;color:var(--muted);margin-top:6px">Weekend: giallo da 12, rosso oltre 20 (equità). Click su un mese per aprirlo.</p>';
  el.innerHTML = h;
}

// ================================================================
// IMPORT VACANZE DA EXCEL (col A cognome, col B nome, col F-BE = settimane 1-52 con X)
// ================================================================
function _renderPianoVacanzeCard() {
  if (!puoGestirePiano()) return '';
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Import vacanze da Excel</div><div style="padding:10px 14px">' +
    '<p style="font-size:.76rem;color:var(--muted);margin-bottom:8px">Formato Turnivo: colonna A cognome, colonna B nome, colonne F–BE = settimane 1–52 con una X. Le settimane marcate diventano giorni V (protetti) nell\'anno scelto. Le celle già occupate non vengono toccate.</p>' +
    '<div class="add-tipo-row"><div class="field"><label>Anno</label><input type="number" id="vac-anno" value="' +
    _pianoMeseSel.split('-')[0] +
    '" min="2024" max="2050" style="width:90px"></div>' +
    '<button class="btn-add-tipo" onclick="document.getElementById(\'vac-file\').click()">Carica file vacanze</button>' +
    '<input type="file" id="vac-file" accept=".xlsx,.xls" style="display:none" onchange="importaVacanzePiano(this)"></div>' +
    '</div></div>'
  );
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
async function importaVacanzePiano(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  const anno = parseInt((document.getElementById('vac-anno') || {}).value) || new Date().getFullYear();
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const nomi = collaboratoriCache.filter((c) => c.attivo !== false);
    const nuove = [];
    let collabTrovati = 0;
    data.forEach((row) => {
      const cognome = String(row[0] || '').trim();
      const nome = String(row[1] || '').trim();
      if (!cognome) return;
      const completo = (cognome + ' ' + nome).toLowerCase().trim();
      const hit = nomi.find(
        (c) =>
          c.nome.toLowerCase() === completo ||
          c.nome.toLowerCase() === (nome + ' ' + cognome).toLowerCase().trim() ||
          (new Set(c.nome.toLowerCase().split(/\s+/)).size === new Set(completo.split(/\s+/)).size &&
            completo.split(/\s+/).every((p) => c.nome.toLowerCase().includes(p))),
      );
      if (!hit) return;
      collabTrovati++;
      for (let w = 1; w <= 52; w++) {
        const cella = String(row[4 + w] || '')
          .trim()
          .toUpperCase(); // col F = indice 5 = settimana 1
        if (cella !== 'X') continue;
        _pianoGiorniSettimana(anno, w).forEach((dstr) => {
          if (dstr.startsWith(String(anno)))
            nuove.push({
              collaboratore: hit.nome,
              data: dstr,
              codice: 'V',
              protetto: true,
              generato: false,
              reparto_dip: hit.reparto_dip || 'slots',
            });
        });
      }
    });
    if (!nuove.length) {
      toast('Nessuna vacanza riconosciuta nel file (' + collabTrovati + ' collaboratori trovati)');
      return;
    }
    if (
      !confirm(
        'Importare le vacanze ' +
          anno +
          '?\n\n• ' +
          collabTrovati +
          ' collaboratori riconosciuti\n• ' +
          nuove.length +
          ' giorni V da inserire (protetti)\n\nLe celle già occupate non vengono toccate.',
      )
    )
      return;
    const r = await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove });
    logAzione('Piano: vacanze importate', anno + ' — ' + ((r && r.inserite) || 0) + '/' + nuove.length);
    toast('Vacanze importate: ' + ((r && r.inserite) || 0) + ' giorni V');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file vacanze');
  }
}

// ================================================================
// MAPPATURE TURNO-FUNZIONE + IMPOSTAZIONI PIANO (personalizzabili)
// ================================================================
function _renderPianoMappatureCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni per funzione (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.74rem;color:var(--muted);margin-bottom:6px">PRINCIPALE = turni normali della funzione. AMMESSO = permessi quando serve. PREFERITO = la bozza li privilegia. Chi ha una funzione con mappature riceve SOLO i turni elencati; chi non ne ha segue la storia dei gruppi.</p>';
  const ordine = { PRINCIPALE: 1, AMMESSO: 2, PREFERITO: 3 };
  const perFz = {};
  pianoMappatureCache.forEach((m) => (perFz[m.funzione] = (perFz[m.funzione] || []).concat(m)));
  Object.keys(perFz)
    .sort()
    .forEach((fz) => {
      h +=
        '<p style="font-size:.76rem;font-weight:700;margin:8px 0 4px">' +
        escP(fz) +
        '</p><div style="display:flex;gap:6px;flex-wrap:wrap">';
      perFz[fz]
        .sort((a, b) => (ordine[a.tipo] || 9) - (ordine[b.tipo] || 9) || a.turno_codice.localeCompare(b.turno_codice))
        .forEach((m) => {
          const col = m.tipo === 'PRINCIPALE' ? '#2c6e49' : m.tipo === 'AMMESSO' ? '#b39b00' : '#1a4a7a';
          h +=
            '<span class="mini-badge" style="background:' +
            col +
            ';cursor:pointer" title="' +
            m.tipo +
            ' — clicca per rimuovere" onclick="rimuoviPianoMappatura(' +
            m.id +
            ')">' +
            escP(m.turno_codice) +
            '</span>';
        });
      h += '</div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:10px"><div class="field"><label>Funzione</label><select id="mp-funzione" style="padding:8px">' +
    (window._pianoFunzioni || ['RESP', 'SUP', 'BO', 'HOST']).map((f) => '<option>' + escP(f) + '</option>').join('') +
    '</select></div><div class="field"><label>Turno</label><input type="text" id="mp-turno" placeholder="S22" style="width:80px"></div>' +
    '<div class="field"><label>Tipo</label><select id="mp-tipo" style="padding:8px"><option>PRINCIPALE</option><option>AMMESSO</option><option>PREFERITO</option></select></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoMappatura()">+ Aggiungi</button></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoMappatura() {
  if (!isAdmin()) return;
  const fz = (document.getElementById('mp-funzione') || {}).value;
  const turno = ((document.getElementById('mp-turno') || {}).value || '').trim().toUpperCase();
  const tipo = (document.getElementById('mp-tipo') || {}).value || 'PRINCIPALE';
  if (!fz || !turno) {
    toast('Compila funzione e turno');
    return;
  }
  try {
    const r = await secPost('piano_mappature', { funzione: fz, turno_codice: turno, tipo: tipo });
    if (r && r[0]) pianoMappatureCache.push(r[0]);
    logAzione('Piano: mappatura aggiunta', fz + ' ' + turno + ' ' + tipo);
    toast('Mappatura aggiunta');
    renderPiano();
  } catch (e) {
    toast('Errore (mappatura già presente?)');
  }
}
async function rimuoviPianoMappatura(id) {
  if (!isAdmin()) return;
  const m = pianoMappatureCache.find((x) => x.id === id);
  if (!m || !confirm('Rimuovere ' + m.funzione + ' → ' + m.turno_codice + ' (' + m.tipo + ')?')) return;
  try {
    await secDel('piano_mappature', 'id=eq.' + id);
    pianoMappatureCache = pianoMappatureCache.filter((x) => x.id !== id);
    logAzione('Piano: mappatura rimossa', m.funzione + ' ' + m.turno_codice);
    toast('Mappatura rimossa');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

function _renderPianoImpostazioniCard() {
  if (!isAdmin()) return '';
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Impostazioni piano (admin)</div><div style="padding:10px 14px">' +
    '<div class="add-tipo-row"><div class="field"><label>Ore settimanali contratto (per il saldo ore)</label><input type="number" step="0.5" id="pi-ore-sett" value="' +
    _pianoOreSett +
    '" style="width:90px" onchange="salvaOreSettimanali(this.value)"></div>' +
    '<div class="field" style="flex:1;min-width:220px"><label>Funzioni disponibili (separate da virgola)</label><input type="text" id="pi-funzioni" value="' +
    escP((window._pianoFunzioni || []).join(', ')) +
    '" onchange="salvaPianoFunzioni(this.value)"></div></div>' +
    '<p style="font-size:.72rem;color:var(--muted)">Le funzioni compaiono nei menu di Gestione collaboratori e nelle mappature. Preferenze per collaboratore (solo diurni, turni bloccati) nella card qui sotto.</p>' +
    '</div></div>'
  );
}
async function salvaOreSettimanali(v) {
  if (!isAdmin()) return;
  const n = parseFloat(v) || 41;
  _pianoOreSett = n;
  await setImp('piano_ore_settimanali', String(n));
  logAzione('Piano: ore settimanali', String(n));
  toast('Ore settimanali: ' + n);
  renderPiano();
}
async function salvaPianoFunzioni(v) {
  if (!isAdmin()) return;
  const lista = String(v)
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (!lista.length) {
    toast('Inserisci almeno una funzione');
    return;
  }
  window._pianoFunzioni = lista;
  await setImp('piano_funzioni', JSON.stringify(lista));
  logAzione('Piano: funzioni', lista.join(','));
  toast('Funzioni aggiornate');
}

// Preferenze per collaboratore: solo diurni + turni bloccati
function _renderPianoPreferenzeCard() {
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return '';
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === _pianoReparto())
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Preferenze collaboratori — ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:520px;font-size:.76rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th><th>Solo diurni</th><th style="text-align:left">Turni bloccati (CSV)</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td>' +
      escP(c.funzione || '—') +
      '</td><td>' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</td><td><input type="checkbox"' +
      (c.solo_diurni ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'solo_diurni\',this.checked)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.turni_bloccati || '') +
      '" placeholder="Es: S8,S7C" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'turni_bloccati\',this.value)" style="width:140px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.7rem;color:var(--muted);margin-top:6px">"Solo diurni" e i turni bloccati vengono rispettati dalla bozza automatica. Funzione e percentuale si modificano in Impostazioni → Gestione collaboratori.</p>';
  h += '</div></div>';
  return h;
}
async function salvaPreferenzaCollab(id, campo, valore) {
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return;
  try {
    const patch = {};
    patch[campo] = campo === 'solo_diurni' ? !!valore : String(valore).trim().toUpperCase() || null;
    await secPatch('collaboratori', 'id=eq.' + id, patch);
    const c = collaboratoriCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: preferenza collaboratore', (c ? c.nome : id) + ' ' + campo);
    toast('Preferenza salvata');
  } catch (e) {
    toast('Errore salvataggio preferenza');
  }
}

// ================================================================
// STAMPA PIANO DEL SINGOLO COLLABORATORE (doppio click sul nome)
// + NOTA RAPIDA con tasto destro sulla cella (come Turnivo)
// ================================================================
async function stampaPianoCollaboratore(nome) {
  // PDF IDENTICO a Turnivo (template pdf_turni.html): A4 verticale,
  // intestazione con nome, tabella Data | Turno | Commenti, righe colorate
  // (weekend verde, domenica arancio, festivo rosa, con commento azzurro)
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const anno = ym.split('-')[0];
  const meseNome = MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym;
  const meseNomeLower = meseNome.toLowerCase();
  const mappa = {};
  _pianoRighe.filter((r) => r.collaboratore === nome).forEach((r) => (mappa[parseInt(r.data.split('-')[2])] = r));
  const festiviSet = {};
  pianoFestiviCache.forEach((f) => {
    if (f.data.startsWith(ym)) festiviSet[parseInt(f.data.split('-')[2])] = true;
  });
  const GG_FULL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const info = _pianoCollabInfo(nome);
  const righePdf = [];
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = ym + '-' + String(g).padStart(2, '0');
    const dow = new Date(dstr + 'T12:00:00').getDay();
    const r = mappa[g];
    const codice = r ? r.codice : '';
    const t = codice ? _pianoTurnoInfo(codice) : null;
    const cs = codice && !t ? _pianoCodiceInfo(codice) : null;
    let desc = '';
    if (t)
      desc =
        '(' +
        (t.gruppo || '') +
        ' ' +
        (t.ora_inizio || '').substring(0, 5) +
        '-' +
        (t.ora_fine || '').substring(0, 5) +
        ')';
    else if (cs) desc = '(' + (cs.descrizione || '') + ')';
    righePdf.push({
      data: GG_FULL[dow] + ' ' + g + ' ' + meseNomeLower + ' ' + anno,
      codice: codice || '-',
      desc: desc,
      commento: (r && r.commento) || '',
      fill:
        r && r.commento
          ? [187, 222, 251] // azzurro: riga con commento
          : festiviSet[g]
            ? [252, 228, 236] // rosa: festivo
            : dow === 0
              ? [255, 243, 224] // arancio: domenica
              : dow === 5 || dow === 6
                ? [232, 245, 233] // verde: weekend
                : g % 2 === 0
                  ? [248, 249, 250]
                  : [255, 255, 255],
      vuoto: !codice,
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = 16;
  // intestazione stile Turnivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text(nome, 12, y);
  y += 3;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.6);
  doc.line(12, y, 198, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Persona:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(nome, 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Settore/Dipartimento:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(repartoLabel(_pianoReparto()) + (info && info.funzione ? ' — ' + info.funzione : ''), 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Mese selezionato:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(meseNome, 45, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 102, 204);
  doc.text(anno, 12, y);
  doc.setTextColor(0);
  y += 4;
  doc.autoTable({
    startY: y,
    head: [['DATA', 'TURNO', 'COMMENTI']],
    body: righePdf.map((r) => [r.data, ' ', r.commento]),
    theme: 'plain',
    margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, lineWidth: 0 },
    headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 75 }, 2: { cellWidth: 46 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const r = righePdf[d.row.index];
      d.cell.styles.fillColor = r.fill;
      if (d.column.index === 0) d.cell.styles.textColor = [80, 80, 80];
      if (d.column.index === 2) {
        d.cell.styles.textColor = [102, 102, 102];
        d.cell.styles.fontStyle = 'italic';
        d.cell.styles.fontSize = 8.5;
      }
    },
    didDrawCell: (d) => {
      // colonna Turno: codice blu grassetto + descrizione grigia (come Turnivo)
      if (d.section !== 'body' || d.column.index !== 1) return;
      const r = righePdf[d.row.index];
      const x = d.cell.x + 2.5;
      const yy = d.cell.y + d.cell.height / 2 + 1.2;
      if (r.vuoto) {
        d.doc.setTextColor(170, 170, 170);
        d.doc.setFont('helvetica', 'normal');
        d.doc.setFontSize(9);
        d.doc.text('-', x, yy);
      } else {
        d.doc.setFont('helvetica', 'bold');
        d.doc.setFontSize(9);
        d.doc.setTextColor(21, 101, 192);
        d.doc.text(r.codice, x, yy);
        if (r.desc) {
          const w = d.doc.getTextWidth(r.codice);
          d.doc.setFont('helvetica', 'normal');
          d.doc.setFontSize(8.5);
          d.doc.setTextColor(85, 85, 85);
          d.doc.text(' ' + r.desc, x + w + 1, yy);
        }
      }
      d.doc.setTextColor(0);
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor(221, 221, 221);
      doc.setLineWidth(0.2);
      doc.line(12, ph - 12, 198, ph - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(153, 153, 153);
      doc.text(
        'Casino Lugano SA — Piano turni ' +
          meseNome +
          ' ' +
          anno +
          ' — Generato il ' +
          new Date().toLocaleDateString('it-IT') +
          ' ' +
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        105,
        ph - 8,
        { align: 'center' },
      );
      doc.setTextColor(0);
    },
  });
  logAzione('Piano collaboratore stampato', nome + ' ' + ym);
  mostraPdfPreview(doc, 'piano_' + nome.replace(/\s+/g, '_') + '_' + ym + '.pdf', 'Piano ' + nome);
}

// Nota rapida col tasto destro (senza aprire il popup completo)
async function _pianoNotaRapida(nome, dstr) {
  // IDENTICO a Turnivo (commentCell/modifica_commento): "Commento per <codice>",
  // firma automatica "- <operatore>", il commento su cella vuota crea la riga.
  if (!puoGestirePiano()) return;
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = (r && r.commento) || '';
  const v = prompt('Commento per ' + (r && r.codice ? r.codice : 'giorno ' + g) + ':', attuale);
  if (v === null) return;
  let commento = v.trim();
  const op = getOperatore();
  if (commento && !commento.endsWith('- ' + op)) commento = commento + ' - ' + op;
  try {
    if (!r) {
      if (!commento) return;
      const nuovo = await secPost('piano', {
        collaboratore: nome,
        data: dstr,
        codice: '',
        protetto: false,
        generato: false,
        commento: commento,
        reparto_dip: _pianoReparto(),
        operatore: op,
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    } else {
      await secPatch('piano', 'id=eq.' + r.id, {
        commento: commento || null,
        operatore: op,
        updated_at: new Date().toISOString(),
      });
      r.commento = commento;
    }
    if (commento) logAzione('Piano: commento', nome + ' ' + dstr + ': "' + commento + '"');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio nota');
  }
}

// ================================================================
// MENU CONTESTUALE (tasto destro) — come Turnivo cap. 17.4:
// Modifica turno / Commento / Cambia turno con... / Cambio per
// esigenze / Stampa piano collaboratore
// ================================================================
let _pianoCtxSel = null; // {nome, data}

function mostraPianoCtx(e, nome, dstr) {
  _pianoCtxSel = { nome: nome, data: dstr };
  let menu = document.getElementById('piano-ctx');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'piano-ctx';
    document.body.appendChild(menu);
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('#piano-ctx')) nascondiPianoCtx();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') nascondiPianoCtx();
    });
  }
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const haTurno = r && _pianoTurnoInfo(r.codice);
  const puoMod = puoGestirePiano();
  let h = '';
  const voce = (label, icona, azione, attiva) =>
    attiva
      ? '<div class="piano-ctx-item" onclick="' + azione + '"><i class="icx ' + icona + '"></i> ' + label + '</div>'
      : '';
  h += voce('Modifica turno', 'icx-modifica', "pianoCtxAzione('modifica')", puoMod);
  h += voce('Commento / nota', 'icx-penna', "pianoCtxAzione('nota')", puoMod && !!r);
  h += voce('Cambia turno con...', 'icx-refresh', "pianoCtxAzione('scambio')", puoMod && !!haTurno);
  h += voce('Cambio per esigenze', 'icx-settings', "pianoCtxAzione('esigenze')", puoMod && !!haTurno);
  h += voce('Rimuovi cella', 'icx-cestino', "pianoCtxAzione('rimuovi')", puoMod && !!r);
  h += voce('Stampa piano di ' + escP(nome.split(' ')[0]), 'icx-stampa', "pianoCtxAzione('stampa')", true);
  menu.innerHTML =
    '<div class="piano-ctx-head">' +
    escP(nome) +
    ' — ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    (r ? ' (' + escP(r.codice) + ')' : '') +
    '</div>' +
    h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
function nascondiPianoCtx() {
  const menu = document.getElementById('piano-ctx');
  if (menu) menu.style.display = 'none';
}
function pianoCtxAzione(azione) {
  nascondiPianoCtx();
  const sel = _pianoCtxSel;
  if (!sel) return;
  if (azione === 'modifica') pianoCellaPrompt(sel.nome, sel.data);
  else if (azione === 'nota') _pianoNotaRapida(sel.nome, sel.data);
  else if (azione === 'stampa') stampaPianoCollaboratore(sel.nome);
  else if (azione === 'scambio') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    apriScambioTurno();
  } else if (azione === 'esigenze') apriCambioEsigenze(sel.nome, sel.data);
  else if (azione === 'rimuovi') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    if (
      confirm(
        'Rimuovere la cella di ' +
          sel.nome +
          ' del ' +
          new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
          '?',
      )
    )
      rimuoviPianoCella(true);
  }
}

// Cambio per esigenze operative (come Turnivo): il turno della cella viene
// sostituito con un altro, con commento automatico "Ex <vecchio>" e PDF firma
function apriCambioEsigenze(nome, dstr) {
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  _pianoCtxSel = { nome: nome, data: dstr };
  const turni = _pianoTurniReparto().filter((t) => t.codice !== r.codice);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambio per esigenze operative</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(nome) +
    '</strong> — ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    ' — turno attuale: <strong>' +
    escP(r.codice) +
    '</strong></p>' +
    '<div class="field" style="text-align:left"><label>Nuovo turno</label><select id="esig-turno" style="width:100%;padding:10px">' +
    turni
      .map(
        (t) =>
          '<option value="' +
          escP(t.codice) +
          '">' +
          escP(t.codice) +
          ' (' +
          (t.ora_inizio || '').substring(0, 5) +
          '-' +
          (t.ora_fine || '').substring(0, 5) +
          ')</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Motivazione</label><input type="text" id="esig-motivo" placeholder="Es: copertura cassa, evento speciale..."></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaCambioEsigenze()">Cambia turno</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaCambioEsigenze() {
  const sel = _pianoCtxSel;
  const nuovo = (document.getElementById('esig-turno') || {}).value;
  const motivo = ((document.getElementById('esig-motivo') || {}).value || '').trim();
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !nuovo) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  const vecchio = r.codice;
  try {
    await secPatch('piano', 'id=eq.' + r.id, {
      codice: nuovo,
      protetto: true,
      commento: (
        'Ex ' +
        vecchio +
        ' — cambio per esigenze operative' +
        (motivo ? ': ' + motivo : '') +
        ' — firma'
      ).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r.codice = nuovo;
    r.protetto = true;
    logAzione('Piano: cambio per esigenze', sel.nome + ' ' + sel.data + ': ' + vecchio + ' -> ' + nuovo);
    toast('Turno cambiato: ' + vecchio + ' -> ' + nuovo);
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const tv = _pianoTurnoInfo(vecchio);
      const tn = _pianoTurnoInfo(nuovo);
      const fmtOra = (t) =>
        t
          ? '(' +
            (t.ora_inizio || '').substring(0, 5) +
            '-' +
            (t.ora_fine || '').substring(0, 5) +
            ', ' +
            (t.gruppo || '') +
            ')'
          : '';
      const doc = _pdfCambioTurno({
        tipo: 'ESIGENZE',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: vecchio, orari: fmtOra(tv) },
        nuovoTurno: nuovo,
        nuovoOrari: fmtOra(tn),
        motivo: motivo,
        richiesto: getOperatore(),
      });
      mostraPdfPreview(doc, 'cambio_esigenze_' + sel.data + '.pdf', 'Cambio per esigenze ' + sel.data);
    }
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore cambio turno');
  }
}

// ================================================================
// MODIFICA RAPIDA STILE TURNIVO: click sulla cella = prompt in cui
// si scrive direttamente il codice (S22, V, C...). Vuoto = rimuovi.
// La finestra completa resta nel menu del tasto destro.
// ================================================================
async function pianoCellaPrompt(nome, dstr) {
  // Comportamento IDENTICO a Turnivo (editCell): prompt "Turno per giorno N
  // (vuoto per rimuovere)", vuoto elimina senza conferma, nessuna validazione
  // del codice, il commento esistente viene conservato.
  if (!puoGestirePiano()) return;
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = r ? r.codice : '';
  const v = prompt('Turno per giorno ' + g + ' (vuoto per rimuovere):', attuale);
  if (v === null) return;
  const codice = v.trim().toUpperCase();
  _pianoCellaSel = { nome: nome, data: dstr };
  try {
    if (!codice) {
      if (r) {
        await secDel('piano', 'id=eq.' + r.id);
        _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
        logAzione('Piano: turno rimosso', nome + ' ' + dstr + ' (era ' + attuale + ')');
        renderPiano();
      }
      return;
    }
    if (codice === attuale) return;
    if (r) {
      await secPatch('piano', 'id=eq.' + r.id, {
        codice: codice,
        protetto: true,
        generato: false,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
      r.codice = codice;
      r.protetto = true;
    } else {
      const nuovo = await secPost('piano', {
        collaboratore: nome,
        data: dstr,
        codice: codice,
        protetto: true,
        generato: false,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    }
    logAzione('Piano modificato', nome + ' ' + dstr + ' → ' + codice);
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio piano');
  }
}
