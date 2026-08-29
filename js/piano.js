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

async function _pianoCaricaCfg() {
  if (_pianoCfgCaricata) return;
  const [turni, codici, festivi, regole] = await Promise.all([
    secGet('piano_turni?order=ordine.asc&limit=500'),
    secGet('piano_codici?order=codice.asc&limit=200'),
    secGet('piano_festivi?order=data.asc&limit=200'),
    secGet('piano_regole?order=id.asc&limit=200'),
  ]);
  pianoTurniCache = turni || [];
  pianoCodiciCache = codici || [];
  pianoFestiviCache = festivi || [];
  pianoRegoleCache = regole || [];
  _pianoCfgCaricata = true;
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
        '<button class="btn-export" style="font-size:.72rem;padding:4px 12px;border-color:var(--accent);color:var(--accent)" onclick="cancellaBozzaPiano()">Cancella bozza</button>';
    }
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
    h += '<th class="piano-tot">Ore</th><th class="piano-tot">D</th><th class="piano-tot">N</th></tr></thead><tbody>';

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
          (puoMod ? ' onclick="apriPianoCella(\'' + ne + "','" + dstr + '\')"' : '') +
          '>' +
          cella +
          '</td>';
      }
      h +=
        '<tr><td class="piano-nome">' +
        escP(nome) +
        '</td>' +
        riga +
        '<td class="piano-tot">' +
        (ore ? ore.toFixed(1) : '') +
        '</td><td class="piano-tot">' +
        (nD || '') +
        '</td><td class="piano-tot">' +
        (nN || '') +
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
      '</div>';
    el.innerHTML = h;
    if (typeof initCardRichiudibili === 'function') initCardRichiudibili('piano-config', []);
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
        const candidati = nomi
          .filter(
            (n) =>
              !cella[n + '|' + g] &&
              !malattie[n + '|' + dstr] &&
              idoneita[n] &&
              idoneita[n].has(t.gruppo) &&
              consecPrima(n, g) < maxCons &&
              riposoOk(n, g, t),
          )
          .sort(
            (x, y) =>
              (oreMese[x] || 0) - (oreMese[y] || 0) ||
              (familiarita[y + '|' + f.turno_codice] || 0) - (familiarita[x + '|' + f.turno_codice] || 0),
          );
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
        ' posti senza candidato idoneo\n\nLe celle esistenti (vacanze, protette, malattie) NON vengono toccate.\nLa bozza si può eliminare con "Cancella bozza". Procedere?',
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
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const generati = _pianoRighe.filter((r) => r.generato && !r.protetto);
  if (!generati.length) {
    toast('Nessuna cella generata da cancellare in questo mese');
    return;
  }
  if (
    !confirm(
      'Cancellare le ' +
        generati.length +
        ' celle GENERATE di ' +
        ym +
        '?\nLe celle inserite a mano (protette) restano.',
    )
  )
    return;
  try {
    await secDel(
      'piano',
      'data=gte.' +
        da +
        '&data=lte.' +
        a +
        '&reparto_dip=eq.' +
        _pianoReparto() +
        '&generato=eq.true&protetto=eq.false',
    );
    logAzione('Piano: bozza cancellata', ym + ' — ' + generati.length + ' celle');
    toast('Bozza cancellata (' + generati.length + ' celle)');
    _pianoViolLista = null;
    _pianoViolCelle = {};
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione bozza');
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
