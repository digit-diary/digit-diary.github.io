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
  return pianoTurniCache.filter((t) => t.attivo !== false && (t.reparto_dip || 'slots') === currentReparto);
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
      (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + currentReparto + '&limit=5000')) ||
      [];
    const mappa = {}; // 'nome|data' -> riga
    _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + r.data] = r));
    const malattie = _pianoMalattieMese(ym);
    const festiviSet = {};
    pianoFestiviCache.forEach((f) => (festiviSet[f.data] = f.descrizione));

    // righe: collaboratori attivi del settore + eventuali nomi presenti solo nel piano
    const collabs = getCollaboratoriReparto()
      .filter((c) => c.attivo !== false)
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
      '<span class="mini-badge" style="background:var(--accent2);font-size:.62rem">' +
      escP(repartoLabel(currentReparto)) +
      '</span>';
    h +=
      '<span style="font-size:.72rem;color:var(--muted);margin-left:auto">' +
      _pianoRighe.length +
      ' assegnazioni' +
      (puoMod ? ' — clicca una cella per modificare' : ' — sola lettura') +
      '</span></div>';

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

    // FABBISOGNO vs ASSEGNATI
    const fabb =
      (await secGet(
        'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + currentReparto + '&limit=3000',
      )) || [];
    if (fabb.length) {
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
        '<div class="main-card" style="margin-top:16px"><div class="card-header">Fabbisogno vs assegnati — ' +
        escP(label) +
        '</div>';
      h += '<div class="piano-wrap"><table class="piano-table"><thead><tr><th class="piano-nome">Turno</th>';
      for (let g = 1; g <= nGiorni; g++) h += '<th>' + g + '</th>';
      h += '</tr></thead><tbody>';
      Object.keys(fabbMap)
        .sort()
        .forEach((cod) => {
          h += '<tr><td class="piano-nome">' + escP(cod) + '</td>';
          for (let g = 1; g <= nGiorni; g++) {
            const req = fabbMap[cod][g] || 0;
            const ass = (assMap[cod] || {})[g] || 0;
            let cls = '';
            if (req) cls = ass >= req ? 'piano-fabb-ok' : 'piano-fabb-ko';
            h += '<td class="' + cls + '">' + (req ? ass + '/' + req : '') + '</td>';
          }
          h += '</tr>';
        });
      h += '</tbody></table></div>';
      h +=
        '<p style="font-size:.72rem;color:var(--muted);padding:8px 14px">assegnati/richiesti — <span style="color:#2c6e49;font-weight:700">verde</span> = coperto, <span style="color:#c0392b;font-weight:700">rosso</span> = carenza</p></div>';
    }
    el.innerHTML = h;
  } catch (e) {
    console.error('Errore piano:', e);
    el.innerHTML = '<p style="color:var(--accent);padding:20px">Errore caricamento piano</p>';
  }
}

function pianoCambiaMese(delta) {
  const p = _pianoMeseSel.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + delta, 15);
  _pianoMeseSel = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
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
        reparto_dip: currentReparto,
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
