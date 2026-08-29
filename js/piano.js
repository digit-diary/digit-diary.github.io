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
    if (puoMod) {
      h +=
        '<button class="btn-export" style="font-size:.72rem;padding:4px 12px" onclick="validaPiano()">Valida regole</button>';
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
  _pianoViolLista = r.lista;
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
      'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + currentReparto + '&limit=3000',
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
    (await secGet('piano?data=lt.' + da + '&reparto_dip=eq.' + currentReparto + '&order=data.desc&limit=5000')) || [];
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
  const nomi = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false)
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
          reparto_dip: currentReparto,
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
        repartoLabel(currentReparto) +
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
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + currentReparto + '&generato=eq.true&protetto=eq.false',
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
