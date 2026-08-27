/**
 * Diario Collaboratori — Casino Lugano SA
 * File: valutazioni.js
 * Valutazione annuale integrata: 9 aree scheda HR + Versatilità, Affidabilità,
 * Disponibilità. Editor, storico, radar nella scheda collaboratore,
 * import Excel della scheda compilata, export PDF in formato HR.
 */

// Aree della scheda ufficiale HR (versione 02/25) + le 3 nuove concordate con HR
const AREE_VALUTAZIONE = [
  {
    key: 'gestione_risorse',
    label: 'Gestione delle risorse/dei mezzi',
    gruppo: 'COMPETENZE PERSONALI',
    desc: "Capacità di gestire le diverse risorse (collaboratori, tempo, informazioni, mezzi, ecc.) in modo efficace ed efficiente. Pianifica e organizza l'attività in modo efficace, fissa le priorità e rispetta le scadenze.",
  },
  {
    key: 'lavoro_team',
    label: 'Lavoro in Team',
    gruppo: 'COMPETENZE PERSONALI',
    desc: "Interagisce in modo ottimale con le persone con buona capacità di ascolto. Contribuisce a costruire un ambiente armonioso e tollerante. Favorisce l'integrazione e gestisce i conflitti con moderazione.",
  },
  {
    key: 'comunicazione',
    label: 'Comunicazione',
    gruppo: 'COMPETENZE PERSONALI',
    desc: "Comunica e ascolta in modo propositivo e coinvolgente. Passa in modo chiaro ed è garante di un corretto passaggio d'informazione. Ascolta e assimila le informazioni comunicate dal responsabile.",
  },
  {
    key: 'conoscenze',
    label: 'Conoscenze professionali e procedurali',
    gruppo: 'COMPETENZE PERSONALI',
    desc: 'Dispone di conoscenze tecniche e teoriche per svolgere al meglio il proprio lavoro. Gestisce in modo propositivo i mutamenti del proprio settore di competenza e mette in pratica quanto appreso durante la propria attività e/o formazione.',
  },
  {
    key: 'motivazione',
    label: 'Motivazione e gestione del cambiamento',
    gruppo: 'COMPETENZE PERSONALI',
    desc: 'È propositivo e porta suggerimenti che favoriscono le attività e il clima di lavoro. Lavora in modo autonomo ed affidabile, sa organizzarsi in modo da sopportare il carico di lavoro e/o di stress. Fornisce soluzioni costruttive, è disponibile e flessibile ai cambiamenti organizzativi.',
  },
  {
    key: 'qualitative',
    label: 'Qualitative',
    gruppo: 'PRESTAZIONI LAVORATIVE',
    desc: "Le attività svolte rispecchiano le aspettative qualitative del cliente e dell'azienda.",
  },
  {
    key: 'quantitative',
    label: 'Quantitative',
    gruppo: 'PRESTAZIONI LAVORATIVE',
    desc: "Le attività svolte vengono eseguite rapidamente, nel rispetto delle scadenze e secondo le aspettative dell'azienda.",
  },
  {
    key: 'impegno',
    label: 'Impegno',
    gruppo: 'PRESTAZIONI LAVORATIVE',
    desc: "Nell'esecuzione si nota iniziativa, responsabilità e propositività, alla ricerca di continuo apprendimento e miglioramento.",
  },
  {
    key: 'servizio_cliente',
    label: 'Servizio al cliente',
    gruppo: 'PRESTAZIONI LAVORATIVE',
    desc: 'Fornisce la corretta informazione, ascolta e riesce a relazionarsi con il cliente in modo adeguato. Trasmette positività e accoglie il cliente anticipandone i bisogni. È cortese, disponibile e sorridente.',
  },
  {
    key: 'versatilita',
    label: 'Versatilità',
    gruppo: 'COMPETENZE MULTIDISCIPLINARI',
    desc: 'Sa operare su più settori del reparto secondo il percorso multidisciplinare (es. Sala, Reception, Cassa). Si adatta rapidamente a ruoli e postazioni diverse in base alle necessità operative.',
  },
  {
    key: 'affidabilita',
    label: 'Affidabilità',
    gruppo: 'COMPETENZE MULTIDISCIPLINARI',
    desc: 'Svolge il proprio lavoro con costanza e precisione, con un basso tasso di errori. Rispetta le procedure e le consegne; si può contare sul suo operato senza necessità di controlli continui.',
  },
  {
    key: 'disponibilita',
    label: 'Disponibilità',
    gruppo: 'COMPETENZE MULTIDISCIPLINARI',
    desc: 'È disponibile a coprire turni scoperti, ad accettare cambi di turno e a supportare i colleghi nei momenti di necessità, contribuendo concretamente alla continuità del servizio.',
  },
];
const SCALA_VALUTAZIONE =
  '100%-90% Raggiunto/Ottimo · 80%-70% Buono/Abb. Bene · 60%-50% Sufficiente/Appena sufficiente · 40%-0% Insufficiente/Non raggiunto';

function getValutazioniCollab(nome) {
  return getValutazioniReparto()
    .filter((v) => v.collaboratore.toLowerCase() === nome.toLowerCase())
    .sort((a, b) => b.anno - a.anno || (a.tipo === 'valutazione' ? -1 : 1));
}

// Suggerimenti dai dati del Diario (precompilazione: il valutatore può sempre correggere)
function _suggerisciAree(nome) {
  const sug = {};
  // Versatilità dal livello multidisciplinare
  const c = getCollaboratoriReparto().find((x) => x.nome.toLowerCase() === nome.toLowerCase());
  if (c && typeof livelloDiCollaboratore === 'function') {
    const lv = livelloDiCollaboratore(c);
    sug.versatilita = lv >= 3 ? 100 : lv === 2 ? 80 : lv === 1 ? 60 : 40;
  }
  // Affidabilità da errori/ammonimenti ultimi 12 mesi
  const unAnnoFa = new Date(Date.now() - 365 * 86400000).toISOString();
  const entries = getDatiReparto().filter((e) => e.nome.toLowerCase() === nome.toLowerCase() && e.data >= unAnnoFa);
  const errori = entries.filter((e) => e.tipo === nomeCorrente('Errore')).length;
  const amm = entries.filter((e) => e.tipo === nomeCorrente('Ammonimento Verbale')).length;
  sug.affidabilita = Math.max(30, 100 - errori * 8 - amm * 12);
  // Disponibilità da coperture/rifiuti registrati nei punti
  if (typeof conteggioAzione === 'function') {
    const coperture = conteggioAzione(nome, 'copertura') + conteggioAzione(nome, 'cambio_turno');
    const rifiuti = conteggioAzione(nome, 'disponibilita_negata');
    sug.disponibilita = Math.max(30, Math.min(100, 60 + coperture * 8 - rifiuti * 10));
  }
  return sug;
}

// ================================================================
// SEZIONE NELLA SCHEDA COLLABORATORE
// ================================================================
function _renderValutazioneSezione(nome) {
  const vals = getValutazioniCollab(nome);
  const ne = nome.replace(/'/g, "\\'");
  let html =
    '<div class="scheda-section"><h4 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Valutazione annuale';
  html +=
    '<button class="btn-export" onclick="apriValutazioneEditor(\'' +
    ne +
    '\')" style="font-size:.72rem;padding:4px 12px">+ Nuova / Modifica</button>';
  html +=
    '<button class="btn-export" onclick="document.getElementById(\'val-import-file\').click()" style="font-size:.72rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49">Importa Excel</button>' +
    '<input type="file" id="val-import-file" accept=".xlsx,.xls" style="display:none" onchange="importaValutazioneExcel(this,\'' +
    ne +
    '\')">';
  if (vals.length) {
    html +=
      '<button class="btn-export btn-export-pdf" onclick="esportaValutazionePDF(' +
      vals[0].id +
      ')" style="font-size:.72rem;padding:4px 12px">PDF scheda HR</button>';
  }
  html += '</h4>';
  if (!vals.length) {
    html +=
      '<p style="color:var(--muted);font-size:.86rem">Nessuna valutazione registrata. Creane una nuova o importa la scheda Excel compilata.</p></div>';
    return html;
  }
  const v = vals[0];
  const aree = v.aree || {};
  const media = _mediaValutazione(aree);
  html +=
    '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px">';
  html +=
    '<p style="font-size:.84rem;color:var(--muted);margin-bottom:8px">Anno <strong style="color:var(--ink)">' +
    v.anno +
    '</strong> (' +
    escP(v.tipo) +
    ')' +
    (v.valutatore ? ' — valutatore: ' + escP(v.valutatore) : '') +
    ' — media: <strong style="color:' +
    _coloreValore(media) +
    '">' +
    media +
    '%</strong></p>';
  let gruppoCorr = '';
  AREE_VALUTAZIONE.forEach((a) => {
    if (a.gruppo !== gruppoCorr) {
      gruppoCorr = a.gruppo;
      html +=
        '<div style="font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:8px 0 3px">' +
        gruppoCorr +
        '</div>';
    }
    const val = aree[a.key];
    html +=
      '<div style="display:flex;align-items:center;gap:8px;padding:2px 0;font-size:.84rem"><span style="flex:1">' +
      a.label +
      '</span><div class="budget-bar" style="width:110px;height:5px"><div class="budget-bar-fill" style="width:' +
      (val || 0) +
      '%;background:' +
      _coloreValore(val) +
      '"></div></div><strong style="min-width:38px;text-align:right;color:' +
      _coloreValore(val) +
      '">' +
      (val != null ? val + '%' : '—') +
      '</strong></div>';
  });
  html +=
    '</div><div style="width:320px;max-width:100%"><div class="scheda-chart-wrap" style="height:280px"><canvas id="scheda-radar-valutazione"></canvas></div></div></div>';
  // storico anni
  if (vals.length > 1) {
    html +=
      '<p style="font-size:.8rem;color:var(--muted);margin-top:8px">Storico: ' +
      vals
        .map(
          (x) =>
            '<span class="mini-badge" style="background:var(--paper2);color:var(--ink);border:1px solid var(--line);cursor:pointer" onclick="apriValutazioneEditor(\'' +
            ne +
            "'," +
            x.anno +
            ')">' +
            x.anno +
            ': ' +
            _mediaValutazione(x.aree || {}) +
            '%</span>',
        )
        .join(' ') +
      '</p>';
  }
  html += '</div>';
  return html;
}
function _mediaValutazione(aree) {
  const vals = AREE_VALUTAZIONE.map((a) => aree[a.key]).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, v) => s + Number(v), 0) / vals.length);
}
function _coloreValore(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 90) return '#2c6e49';
  if (v >= 70) return '#8b6914';
  if (v >= 50) return '#e67e22';
  return '#c0392b';
}
function _initSchedaValutazione(nome) {
  const el = document.getElementById('scheda-radar-valutazione');
  if (!el || !window.Chart) return;
  const vals = getValutazioniCollab(nome);
  if (!vals.length) return;
  const datasets = vals.slice(0, 2).map((v, i) => ({
    label: v.anno + (v.tipo === 'autovalutazione' ? ' (auto)' : ''),
    data: AREE_VALUTAZIONE.map((a) => (v.aree || {})[a.key] || 0),
    borderColor: i === 0 ? '#8b6914' : '#1a4a7a',
    backgroundColor: i === 0 ? 'rgba(139,105,20,0.15)' : 'rgba(26,74,122,0.10)',
    pointRadius: 3,
  }));
  if (_schedaCharts.radar) _schedaCharts.radar.destroy();
  _schedaCharts.radar = new Chart(el, {
    type: 'radar',
    data: {
      labels: AREE_VALUTAZIONE.map((a) => (a.label.length > 22 ? a.label.substring(0, 20) + '…' : a.label)),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 20, font: { size: 9 } },
          pointLabels: { font: { size: 9 } },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 } } },
      },
    },
  });
}

// ================================================================
// EDITOR VALUTAZIONE
// ================================================================
function apriValutazioneEditor(nome, anno) {
  const a = anno || new Date().getFullYear();
  const esistente = getValutazioniCollab(nome).find((v) => v.anno === a && v.tipo === 'valutazione');
  const aree = (esistente && esistente.aree) || {};
  const sug = _suggerisciAree(nome);
  const ne = nome.replace(/'/g, "\\'");
  let html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink)">Valutazione — ' +
    escP(nome) +
    '</h3><p style="color:var(--muted);font-size:.8rem">' +
    SCALA_VALUTAZIONE +
    '</p></div><button class="btn-modal-cancel" onclick="apriSchedaCollaboratore(\'' +
    ne +
    '\')" style="padding:6px 12px;font-size:.75rem">← Scheda</button></div>';
  html +=
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><span class="filter-label">Anno</span><input type="number" id="val-anno" value="' +
    a +
    '" min="2020" max="2040" style="width:100px;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)">' +
    '<span class="filter-label">Valutatore</span><input type="text" id="val-valutatore" value="' +
    escP((esistente && esistente.valutatore) || getOperatore() || '') +
    '" style="width:200px;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  let gruppoCorr = '';
  AREE_VALUTAZIONE.forEach((ar) => {
    if (ar.gruppo !== gruppoCorr) {
      gruppoCorr = ar.gruppo;
      html +=
        '<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent2);font-weight:700;margin:14px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px">' +
        gruppoCorr +
        '</div>';
    }
    const val = aree[ar.key] != null ? aree[ar.key] : '';
    const s = sug[ar.key];
    html +=
      '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;flex-wrap:wrap"><div style="flex:1;min-width:220px"><strong style="font-size:.88rem">' +
      ar.label +
      '</strong><div style="font-size:.74rem;color:var(--muted);line-height:1.35">' +
      ar.desc +
      '</div></div><input type="number" id="val-area-' +
      ar.key +
      '" value="' +
      val +
      '" min="0" max="100" step="5" placeholder="—" style="width:80px;padding:8px;border:1.5px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink);text-align:center;font-weight:700">' +
      (s != null
        ? '<button class="btn-act pin" onclick="document.getElementById(\'val-area-' +
          ar.key +
          "').value=" +
          s +
          '" title="Suggerito dai dati del Diario" style="font-size:.68rem">Suggerito: ' +
          s +
          '</button>'
        : '') +
      '</div>';
  });
  const pf = (esistente && esistente.punti_forza) || '';
  const ob = (esistente && esistente.obiettivi) || [];
  const ef = (esistente && esistente.esigenze_formative) || '';
  const os = (esistente && esistente.osservazioni) || '';
  html +=
    '<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent2);font-weight:700;margin:14px 0 6px;border-bottom:1px solid var(--line);padding-bottom:3px">COMMENTO ALLA VALUTAZIONE</div>';
  html +=
    '<div class="field" style="margin-bottom:10px"><label>Punti di forza</label><textarea id="val-punti-forza" style="min-height:50px">' +
    escP(pf) +
    '</textarea></div>';
  html +=
    '<div class="field" style="margin-bottom:10px"><label>Punti da migliorare / obiettivi entro il 31 dicembre</label>';
  for (let i = 0; i < 3; i++) {
    html +=
      '<input type="text" id="val-obiettivo-' +
      i +
      '" value="' +
      escP(ob[i] || '') +
      '" placeholder="Obiettivo ' +
      (i + 1) +
      '..." style="margin-bottom:5px;padding:8px 10px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)">';
  }
  html += '</div>';
  html +=
    '<div class="field" style="margin-bottom:10px"><label>Esigenze formative</label><textarea id="val-esigenze" style="min-height:44px">' +
    escP(ef) +
    '</textarea></div>';
  html +=
    '<div class="field" style="margin-bottom:14px"><label>Osservazioni</label><textarea id="val-osservazioni" style="min-height:44px">' +
    escP(os) +
    '</textarea></div>';
  html += '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">';
  html +=
    '<button class="btn-salva" onclick="salvaValutazione(\'' +
    ne +
    '\')" style="width:auto;padding:12px 30px">Salva valutazione</button>';
  if (esistente)
    html +=
      '<button class="btn-salva" onclick="eliminaValutazione(' +
      esistente.id +
      ",'" +
      ne +
      '\')" style="width:auto;padding:12px 20px;background:var(--accent)">Elimina</button>';
  html += '</div>';
  const box = document.getElementById('profilo-content');
  box.className = 'profilo-box scheda-wide';
  box.innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
}
async function salvaValutazione(nome) {
  const anno = parseInt((document.getElementById('val-anno') || {}).value) || new Date().getFullYear();
  const aree = {};
  AREE_VALUTAZIONE.forEach((a) => {
    const v = (document.getElementById('val-area-' + a.key) || {}).value;
    if (v !== '' && v != null) aree[a.key] = Math.max(0, Math.min(100, parseInt(v)));
  });
  const obiettivi = [];
  for (let i = 0; i < 3; i++) {
    const v = ((document.getElementById('val-obiettivo-' + i) || {}).value || '').trim();
    if (v) obiettivi.push(v);
  }
  const rec = {
    collaboratore: nome,
    anno,
    tipo: 'valutazione',
    aree,
    punti_forza: ((document.getElementById('val-punti-forza') || {}).value || '').trim(),
    obiettivi,
    esigenze_formative: ((document.getElementById('val-esigenze') || {}).value || '').trim(),
    osservazioni: ((document.getElementById('val-osservazioni') || {}).value || '').trim(),
    valutatore: ((document.getElementById('val-valutatore') || {}).value || '').trim(),
    data_valutazione: new Date().toISOString().split('T')[0],
    reparto_dip: currentReparto,
  };
  try {
    const esistente = getValutazioniCollab(nome).find((v) => v.anno === anno && v.tipo === 'valutazione');
    if (esistente) {
      rec.updated_at = new Date().toISOString();
      await secPatch('valutazioni', 'id=eq.' + esistente.id, rec);
      Object.assign(esistente, rec);
    } else {
      const r = await secPost('valutazioni', rec);
      if (r && r[0]) valutazioniCache.unshift(r[0]);
    }
    logAzione('Valutazione salvata', nome + ' — anno ' + anno + ' (media ' + _mediaValutazione(aree) + '%)');
    toast('Valutazione ' + anno + ' salvata');
    apriSchedaCollaboratore(nome);
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio valutazione');
  }
}
async function eliminaValutazione(id, nome) {
  if (!confirm('Eliminare questa valutazione?')) return;
  try {
    await secDel('valutazioni', 'id=eq.' + id);
    valutazioniCache = valutazioniCache.filter((v) => v.id !== id);
    logAzione('Valutazione eliminata', nome + ' ID ' + id);
    toast('Valutazione eliminata');
    apriSchedaCollaboratore(nome);
  } catch (e) {
    toast('Errore eliminazione');
  }
}

// ================================================================
// IMPORT EXCEL (scheda compilata da HR — parser tollerante)
// ================================================================
function _normTesto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const _AREE_MATCH = [
  { key: 'gestione_risorse', match: 'gestione delle risorse' },
  { key: 'lavoro_team', match: 'lavoro in team' },
  { key: 'comunicazione', match: 'comunicazione' },
  { key: 'conoscenze', match: 'conoscenze professionali' },
  { key: 'motivazione', match: 'motivazione e gestione' },
  { key: 'qualitative', match: 'qualitative' },
  { key: 'quantitative', match: 'quantitative' },
  { key: 'impegno', match: 'impegno' },
  { key: 'servizio_cliente', match: 'servizio al cliente' },
  { key: 'versatilita', match: 'versatilita' },
  { key: 'affidabilita', match: 'affidabilita' },
  { key: 'disponibilita', match: 'disponibilita' },
];
async function importaValutazioneExcel(input, nome) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  if (!window.XLSX) {
    toast('Libreria Excel non caricata');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const aree = {};
    let annoTrovato = null;
    for (const sn of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
        header: 1,
        defval: '',
      });
      data.forEach((row) => {
        const rowNorm = row.map(_normTesto);
        // anno: cella "periodo di valutazione" o un anno isolato 20xx
        row.forEach((cell) => {
          const m = String(cell).match(/^(20[2-4]\d)$/);
          if (m && !annoTrovato) annoTrovato = parseInt(m[1]);
        });
        _AREE_MATCH.forEach((am) => {
          if (aree[am.key] != null) return;
          const idx = rowNorm.findIndex((c) => c && c.includes(am.match));
          if (idx === -1) return;
          // primo valore numerico 0-100 nella stessa riga (dopo la label)
          for (let j = 0; j < row.length; j++) {
            if (j === idx) continue;
            let v = row[j];
            if (typeof v === 'string') v = v.replace('%', '').replace(',', '.').trim();
            const n = parseFloat(v);
            if (!isNaN(n) && n >= 0 && n <= 100 && String(v) !== '') {
              // Excel a volte usa 0-1 per le percentuali
              aree[am.key] = n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
              break;
            }
          }
        });
      });
    }
    const trovate = Object.keys(aree).length;
    if (!trovate) {
      toast('Nessuna area di valutazione riconosciuta nel file');
      return;
    }
    const anno = annoTrovato || new Date().getFullYear();
    // anteprima conferma
    const b = document.getElementById('pwd-modal-content');
    const ne = nome.replace(/'/g, "\\'");
    window._valImportPending = { nome, anno, aree };
    b.innerHTML =
      '<h3>Importa valutazione</h3><p style="margin-bottom:10px"><strong>' +
      escP(nome) +
      '</strong> — anno <strong>' +
      anno +
      '</strong> — ' +
      trovate +
      '/12 aree riconosciute:</p><div style="max-height:280px;overflow-y:auto;text-align:left;margin-bottom:14px">' +
      AREE_VALUTAZIONE.map(
        (a) =>
          '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:.85rem;border-bottom:1px solid var(--line)"><span>' +
          a.label +
          '</span><strong style="color:' +
          (aree[a.key] != null ? _coloreValore(aree[a.key]) : 'var(--muted)') +
          '">' +
          (aree[a.key] != null ? aree[a.key] + '%' : 'non trovata') +
          '</strong></div>',
      ).join('') +
      '</div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_confermaImportValutazione()">Importa</button></div>';
    document.getElementById('pwd-modal').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    toast('Errore lettura file: ' + e.message);
  }
}
async function _confermaImportValutazione() {
  const p = window._valImportPending;
  if (!p) return;
  document.getElementById('pwd-modal').classList.add('hidden');
  try {
    const esistente = getValutazioniCollab(p.nome).find((v) => v.anno === p.anno && v.tipo === 'valutazione');
    if (esistente) {
      const areeMerged = Object.assign({}, esistente.aree || {}, p.aree);
      await secPatch('valutazioni', 'id=eq.' + esistente.id, {
        aree: areeMerged,
        updated_at: new Date().toISOString(),
      });
      esistente.aree = areeMerged;
    } else {
      const r = await secPost('valutazioni', {
        collaboratore: p.nome,
        anno: p.anno,
        tipo: 'valutazione',
        aree: p.aree,
        valutatore: getOperatore(),
        data_valutazione: new Date().toISOString().split('T')[0],
        reparto_dip: currentReparto,
      });
      if (r && r[0]) valutazioniCache.unshift(r[0]);
    }
    logAzione('Valutazione importata da Excel', p.nome + ' — anno ' + p.anno);
    toast('Valutazione importata');
    window._valImportPending = null;
    apriSchedaCollaboratore(p.nome);
  } catch (e) {
    toast('Errore importazione');
  }
}

// ================================================================
// EXPORT PDF — formato scheda ufficiale HR
// ================================================================
async function esportaValutazionePDF(id) {
  const v = valutazioniCache.find((x) => x.id === id);
  if (!v) return;
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mx = 14;
  let y = 12;
  if (_logoB64)
    try {
      doc.addImage(_logoB64, 'PNG', mx, y, 34, 19);
    } catch (e) {}
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    'Scheda di valutazione\nRed: HR — Diario Collaboratori\nVersione: ' + new Date().getFullYear(),
    pw - mx,
    y + 4,
    { align: 'right' },
  );
  y += 26;
  doc.setTextColor(0);
  function sezione(titolo) {
    doc.setFillColor(26, 42, 64);
    doc.rect(mx, y, pw - mx * 2, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255);
    doc.text(titolo, mx + 2, y + 4.6);
    doc.setTextColor(0);
    y += 9;
  }
  sezione('DATI PERSONALI');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Valutato: ' + v.collaboratore, mx, y + 1);
  doc.text('Settore: Reparto ' + (v.reparto_dip === 'tavoli' ? 'Tavoli' : 'Slot'), mx + 90, y + 1);
  y += 6;
  doc.text('Periodo di valutazione: ' + v.anno, mx, y + 1);
  doc.text(
    'Data: ' + (v.data_valutazione ? new Date(v.data_valutazione + 'T12:00:00').toLocaleDateString('it-IT') : ''),
    mx + 90,
    y + 1,
  );
  y += 5;
  if (v.valutatore) {
    doc.text('Valutatore: ' + v.valutatore, mx, y + 1);
    y += 5;
  }
  y += 2;
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text('Scala di valore: ' + SCALA_VALUTAZIONE, mx, y);
  doc.setTextColor(0);
  y += 5;
  const aree = v.aree || {};
  const gruppi = ['COMPETENZE PERSONALI', 'PRESTAZIONI LAVORATIVE', 'COMPETENZE MULTIDISCIPLINARI'];
  gruppi.forEach((g) => {
    const righe = AREE_VALUTAZIONE.filter((a) => a.gruppo === g);
    if (y + 30 > ph - 20) {
      doc.addPage();
      y = 14;
    }
    sezione(
      g +
        (g === 'COMPETENZE MULTIDISCIPLINARI'
          ? ' (progetto multidisciplinarità)'
          : ' (in riferimento alla posizione ricoperta)'),
    );
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: mx, right: mx },
      head: [['Area di valutazione', 'Valore', 'Descrizione area']],
      body: righe.map((a) => [a.label, aree[a.key] != null ? aree[a.key] + '%' : '', a.desc]),
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  });
  if (y + 45 > ph - 20) {
    doc.addPage();
    y = 14;
  }
  sezione('COMMENTO ALLA VALUTAZIONE');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  function blocco(label, testo) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, mx, y + 1);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(testo || '—', pw - mx * 2 - 45);
    doc.text(lines, mx + 45, y + 1);
    y += Math.max(6, lines.length * 3.8 + 2);
  }
  blocco('Punti di forza', v.punti_forza);
  const ob = v.obiettivi || [];
  blocco('Obiettivi entro 31/12', ob.length ? ob.map((o, i) => i + 1 + '. ' + o).join('\n') : '—');
  blocco('Esigenze formative', v.esigenze_formative);
  if (v.osservazioni) {
    if (y + 25 > ph - 30) {
      doc.addPage();
      y = 14;
    }
    sezione('OSSERVAZIONI DEL VALUTATO');
    const lines = doc.splitTextToSize(v.osservazioni, pw - mx * 2);
    doc.setFontSize(8.5);
    doc.text(lines, mx, y + 1);
    y += lines.length * 3.8 + 4;
  }
  if (y + 25 > ph - 15) {
    doc.addPage();
    y = 14;
  }
  sezione('FIRME');
  doc.setFontSize(8.5);
  doc.text('Valutato, data e firma', mx, y + 4);
  doc.line(mx, y + 14, mx + 70, y + 14);
  doc.text('Responsabile, data e firma', mx + 95, y + 4);
  doc.line(mx + 95, y + 14, mx + 165, y + 14);
  doc.setFontSize(6.5);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA — Scheda di valutazione ' + v.anno + ' — Riservato', mx, ph - 8);
  mostraPdfPreview(
    doc,
    'valutazione_' + v.collaboratore.replace(/\s+/g, '_') + '_' + v.anno + '.pdf',
    'Valutazione ' + v.anno + ' — ' + v.collaboratore,
  );
}
