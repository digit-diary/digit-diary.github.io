/**
 * Diario Collaboratori — Casino Lugano SA
 * File: valutazioni.js
 * Valutazione annuale integrata: 9 aree scheda HR + Versatilità e
 * "Affidabilità e disponibilità" (voce unica). Editor multi-scheda (anno/tipo),
 * note per area (colonna I), radar, import Excel, export PDF formato HR.
 */

// Aree della scheda ufficiale HR (versione 02/25) + le 2 nuove concordate con HR
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
    key: 'affidabilita_disponibilita',
    label: 'Affidabilità e disponibilità',
    gruppo: 'COMPETENZE MULTIDISCIPLINARI',
    desc: 'Svolge il proprio lavoro con costanza e precisione, con un basso tasso di errori; si può contare sul suo operato senza necessità di controlli continui. È disponibile a coprire turni scoperti, ad accettare cambi di turno e a supportare i colleghi nei momenti di necessità, contribuendo concretamente alla continuità del servizio.',
  },
];
// Compatibilità: le valutazioni salvate prima della fusione avevano 'affidabilita' e
// 'disponibilita' separate → confluiscono nella voce unica (media delle due)
function _areeNormalizza(aree) {
  const a = Object.assign({}, aree || {});
  if (a.affidabilita_disponibilita == null && (a.affidabilita != null || a.disponibilita != null)) {
    const vv = [a.affidabilita, a.disponibilita].filter((x) => x != null && !isNaN(x)).map(Number);
    if (vv.length) a.affidabilita_disponibilita = Math.round(vv.reduce((s, x) => s + x, 0) / vv.length);
  }
  delete a.affidabilita;
  delete a.disponibilita;
  return a;
}
const SCALA_VALUTAZIONE =
  '100%-90% Raggiunto/Ottimo · 80%-70% Buono/Abb. Bene · 60%-50% Sufficiente/Appena sufficiente · 40%-0% Insufficiente/Non raggiunto';
// Foglio "Scala valutazione" della scheda HR: fasce di giudizio + Grado 1-5 (punteggio = grado x 20)
function _giudizioScala(v) {
  if (v == null || isNaN(v)) return '';
  if (v >= 90) return 'Ottimo/Raggiunto';
  if (v >= 70) return 'Abbastanza bene/Buono';
  if (v >= 50) return 'Appena sufficiente/Sufficiente';
  return 'Insufficiente/Non raggiunto';
}
function _gradoScala(v) {
  if (v == null || isNaN(v)) return '';
  return Math.max(1, Math.min(5, Math.round(v / 20)));
}

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
  // Affidabilità e disponibilità (voce unica): metà dal tasso di errori/ammonimenti
  // degli ultimi 12 mesi, metà da coperture/rifiuti registrati nei punti
  const unAnnoFa = new Date(Date.now() - 365 * 86400000).toISOString();
  const entries = getDatiReparto().filter((e) => e.nome.toLowerCase() === nome.toLowerCase() && e.data >= unAnnoFa);
  const errori = entries.filter((e) => e.tipo === nomeCorrente('Errore')).length;
  const amm = entries.filter((e) => e.tipo === nomeCorrente('Ammonimento Verbale')).length;
  const affid = Math.max(30, 100 - errori * 8 - amm * 12);
  let disp = null;
  if (typeof conteggioAzione === 'function') {
    const coperture = conteggioAzione(nome, 'copertura') + conteggioAzione(nome, 'cambio_turno');
    const rifiuti = conteggioAzione(nome, 'disponibilita_negata');
    disp = Math.max(30, Math.min(100, 60 + coperture * 8 - rifiuti * 10));
  }
  sug.affidabilita_disponibilita = disp != null ? Math.round((affid + disp) / 2) : affid;
  return sug;
}

// ================================================================
// SEZIONE NELLA SCHEDA COLLABORATORE
// ================================================================
// Restituisce la valutazione selezionata nel selettore schede (default: la più recente)
function _valSchedaCorrente(vals) {
  return vals.find((x) => x.id === window._valSchedaSel) || vals[0];
}
// Cambio scheda dal selettore (più valutazioni per collaboratore: anni e tipi diversi)
function selezionaValutazione(nome, id) {
  window._valSchedaSel = id;
  apriSchedaCollaboratore(nome);
}
function _renderValutazioneSezione(nome) {
  const vals = getValutazioniCollab(nome);
  const ne = nome.replace(/'/g, "\\'");
  const puoVal = typeof puoModificare === 'function' ? puoModificare('gestione_valutazioni') : isAdmin();
  const v = vals.length ? _valSchedaCorrente(vals) : null;
  let html =
    '<div class="scheda-section"><h4 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Valutazione annuale';
  if (puoVal) {
    html +=
      '<button class="btn-export" onclick="apriValutazioneEditor(\'' +
      ne +
      "'" +
      (v ? ',' + v.anno + ",'" + escP(v.tipo) + "'" : '') +
      ')" style="font-size:.72rem;padding:4px 12px">+ Nuova / Modifica</button>';
    html +=
      '<button class="btn-export" onclick="document.getElementById(\'val-import-file\').click()" style="font-size:.72rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49">Importa Excel</button>' +
      '<input type="file" id="val-import-file" accept=".xlsx,.xls" style="display:none" onchange="importaValutazioneExcel(this,\'' +
      ne +
      '\')">';
  }
  if (v) {
    html +=
      '<button class="btn-export btn-export-pdf" onclick="esportaValutazionePDF(' +
      v.id +
      ')" style="font-size:.72rem;padding:4px 12px">PDF scheda HR</button>';
  }
  html += '</h4>';
  if (!vals.length) {
    html +=
      '<p style="color:var(--muted);font-size:.86rem">Nessuna valutazione registrata. Creane una nuova o importa la scheda Excel compilata.</p></div>';
    return html;
  }
  // Selettore schede (più valutazioni: anni/tipi diversi)
  if (vals.length > 1) {
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
    vals.forEach((x) => {
      const att = x.id === v.id;
      html +=
        '<span class="mini-badge" style="cursor:pointer;font-size:.74rem;' +
        (att
          ? 'background:var(--accent2);color:white'
          : 'background:var(--paper2);color:var(--ink);border:1px solid var(--line)') +
        '" onclick="selezionaValutazione(\'' +
        ne +
        "'," +
        x.id +
        ')">' +
        x.anno +
        (x.tipo !== 'valutazione' ? ' · ' + escP(x.tipo) : '') +
        ' — ' +
        _mediaValutazione(_areeNormalizza(x.aree)) +
        '%</span>';
    });
    html += '</div>';
  }
  const aree = _areeNormalizza(v.aree);
  const note = v.aree_note || {};
  const media = _mediaValutazione(aree);
  // Confronto con la scheda precedente (anno più recente prima di quella selezionata)
  const prec = vals.find((x) => x.anno < v.anno) || null;
  const areePrec = prec ? _areeNormalizza(prec.aree) : {};
  const mediaPrec = prec ? _mediaValutazione(areePrec) : null;
  const deltaBadge = function (cur, old) {
    if (cur == null || old == null) return '';
    const d = cur - old;
    if (d === 0) return '<span style="font-size:.7rem;color:var(--muted);min-width:34px;text-align:right">=</span>';
    return (
      '<span style="font-size:.7rem;font-weight:700;min-width:34px;text-align:right;color:' +
      (d > 0 ? '#2c6e49' : 'var(--accent)') +
      '">' +
      (d > 0 ? '&#9650; +' : '&#9660; ') +
      d +
      '</span>'
    );
  };
  html +=
    '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px">';
  html +=
    '<p style="font-size:.84rem;color:var(--muted);margin-bottom:8px">Anno <strong style="color:var(--ink)">' +
    v.anno +
    '</strong> (' +
    escP(v.tipo) +
    ')' +
    (v.valutatore ? ' — valutatore: ' + escP(v.valutatore) : '') +
    ((v.dati_personali || {}).settore || (v.dati_personali || {}).funzione
      ? ' — ' +
        [(v.dati_personali || {}).settore, (v.dati_personali || {}).funzione].filter(Boolean).map(escP).join(' · ')
      : '') +
    ' — media: <strong style="color:' +
    _coloreValore(media) +
    '">' +
    media +
    '%</strong> <span style="font-size:.78rem">(' +
    _giudizioScala(media) +
    ')</span>' +
    (mediaPrec != null
      ? ' <span style="font-size:.78rem;font-weight:700;color:' +
        (media - mediaPrec > 0 ? '#2c6e49' : media - mediaPrec < 0 ? 'var(--accent)' : 'var(--muted)') +
        '">' +
        (media - mediaPrec > 0 ? '▲ +' : media - mediaPrec < 0 ? '▼ ' : '= ') +
        (media - mediaPrec !== 0 ? media - mediaPrec + '%' : '') +
        ' vs ' +
        prec.anno +
        '</span>'
      : '') +
    '</p>';
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
      '"' +
      (val != null ? ' title="Grado ' + _gradoScala(val) + ' — ' + _giudizioScala(val) + '"' : '') +
      '>' +
      (val != null ? val + '%' : '—') +
      '</strong>' +
      (prec ? deltaBadge(val, areePrec[a.key]) : '') +
      '</div>';
    if (note[a.key])
      html +=
        '<div style="font-size:.76rem;color:var(--muted);font-style:italic;padding:0 0 3px 12px;line-height:1.3">&#8618; ' +
        escP(note[a.key]) +
        '</div>';
  });
  html +=
    '</div><div style="width:320px;max-width:100%"><div class="scheda-chart-wrap" style="height:280px"><canvas id="scheda-radar-valutazione"></canvas></div></div></div>';
  html += '</div>';
  return html;
}
function _mediaValutazione(aree) {
  aree = _areeNormalizza(aree);
  const vals = AREE_VALUTAZIONE.map((a) => aree[a.key]).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((s, v) => s + Number(v), 0) / vals.length);
}
// Fasce colore ufficiali della scheda HR: 90-100 verde, 70-89 azzurro, 50-69 giallo, 0-49 rosso
function _coloreValore(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 90) return '#2c6e49';
  if (v >= 70) return '#1a7aa8';
  if (v >= 50) return '#b39b00';
  return '#c0392b';
}
// Riempimento celle PDF (stessi colori del foglio Excel)
function _fasciaFillPdf(n) {
  if (n >= 90) return [183, 225, 166];
  if (n >= 70) return [189, 224, 238];
  if (n >= 50) return [255, 255, 130];
  return [234, 107, 99];
}
function _initSchedaValutazione(nome) {
  const el = document.getElementById('scheda-radar-valutazione');
  if (!el || !window.Chart) return;
  const vals = getValutazioniCollab(nome);
  if (!vals.length) return;
  // radar: scheda selezionata in oro + la successiva (per confronto) in blu
  const sel = _valSchedaCorrente(vals);
  const daMostrare = [sel].concat(vals.filter((x) => x.id !== sel.id).slice(0, 1));
  const datasets = daMostrare.map((v, i) => ({
    label: v.anno + (v.tipo !== 'valutazione' ? ' (' + v.tipo + ')' : ''),
    data: AREE_VALUTAZIONE.map((a) => _areeNormalizza(v.aree)[a.key] || 0),
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
function apriValutazioneEditor(nome, anno, tipo) {
  const a = anno || new Date().getFullYear();
  const tp = tipo || 'valutazione';
  const esistente = getValutazioniCollab(nome).find((v) => v.anno === a && v.tipo === tp);
  const aree = _areeNormalizza((esistente && esistente.aree) || {});
  const note = (esistente && esistente.aree_note) || {};
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
    '<span class="filter-label">Tipo</span><select id="val-tipo" style="padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)">' +
    ['valutazione', 'autovalutazione', 'intermedia']
      .map((t) => '<option value="' + t + '"' + (tp === t ? ' selected' : '') + '>' + t + '</option>')
      .join('') +
    '</select>' +
    '<span class="filter-label">Valutatore</span><input type="text" id="val-valutatore" value="' +
    escP((esistente && esistente.valutatore) || getOperatore() || '') +
    '" style="width:200px;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)">' +
    '<span class="filter-label">Settore</span><input type="text" id="val-settore" value="' +
    escP(((esistente && esistente.dati_personali) || {}).settore || '') +
    '" placeholder="Es: Foboslot" style="width:130px;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)">' +
    '<span class="filter-label">Funzione</span><input type="text" id="val-funzione" value="' +
    escP(((esistente && esistente.dati_personali) || {}).funzione || '') +
    '" placeholder="Es: Casinò Host" style="width:150px;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
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
    html +=
      '<input type="text" id="val-nota-' +
      ar.key +
      '" value="' +
      escP(note[ar.key] || '') +
      '" placeholder="Nota del valutatore (opzionale)..." style="width:100%;margin:0 0 4px;padding:6px 10px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--muted);font-size:.8rem;font-style:italic">';
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
  if (typeof puoModificare === 'function' && !puoModificare('gestione_valutazioni')) {
    toast('Non hai il permesso di salvare valutazioni');
    return;
  }
  const anno = parseInt((document.getElementById('val-anno') || {}).value) || new Date().getFullYear();
  const tipo = (document.getElementById('val-tipo') || {}).value || 'valutazione';
  const aree = {};
  const areeNote = {};
  AREE_VALUTAZIONE.forEach((a) => {
    const v = (document.getElementById('val-area-' + a.key) || {}).value;
    if (v !== '' && v != null) aree[a.key] = Math.max(0, Math.min(100, parseInt(v)));
    const n = ((document.getElementById('val-nota-' + a.key) || {}).value || '').trim();
    if (n) areeNote[a.key] = n;
  });
  const obiettivi = [];
  for (let i = 0; i < 3; i++) {
    const v = ((document.getElementById('val-obiettivo-' + i) || {}).value || '').trim();
    if (v) obiettivi.push(v);
  }
  // dati ufficiali: settore/funzione modificabili, ID e dati valutatore conservati dall'import
  const esistPre = getValutazioniCollab(nome).find((v) => v.anno === anno && v.tipo === tipo);
  const datiPers = Object.assign({}, (esistPre && esistPre.dati_personali) || {});
  const setV = ((document.getElementById('val-settore') || {}).value || '').trim();
  const funV = ((document.getElementById('val-funzione') || {}).value || '').trim();
  if (setV) datiPers.settore = setV;
  else delete datiPers.settore;
  if (funV) datiPers.funzione = funV;
  else delete datiPers.funzione;
  const rec = {
    collaboratore: nome,
    anno,
    tipo,
    aree,
    aree_note: areeNote,
    dati_personali: datiPers,
    punti_forza: ((document.getElementById('val-punti-forza') || {}).value || '').trim(),
    obiettivi,
    esigenze_formative: ((document.getElementById('val-esigenze') || {}).value || '').trim(),
    osservazioni: ((document.getElementById('val-osservazioni') || {}).value || '').trim(),
    valutatore: ((document.getElementById('val-valutatore') || {}).value || '').trim(),
    data_valutazione: new Date().toISOString().split('T')[0],
    reparto_dip: currentReparto,
  };
  try {
    const esistente = getValutazioniCollab(nome).find((v) => v.anno === anno && v.tipo === tipo);
    if (esistente) {
      rec.updated_at = new Date().toISOString();
      await secPatch('valutazioni', 'id=eq.' + esistente.id, rec);
      Object.assign(esistente, rec);
      window._valSchedaSel = esistente.id;
    } else {
      const r = await secPost('valutazioni', rec);
      if (r && r[0]) {
        valutazioniCache.unshift(r[0]);
        window._valSchedaSel = r[0].id;
      }
    }
    logAzione('Valutazione salvata', nome + ' — ' + tipo + ' ' + anno + ' (media ' + _mediaValutazione(aree) + '%)');
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
  // voce unica: nel file può comparire come "Affidabilità e disponibilità" o come righe separate
  { key: 'affidabilita_disponibilita', match: 'affidabilita' },
  { key: 'affidabilita_disponibilita', match: 'disponibilita' },
];
// Parser scheda HR: la scheda ufficiale del valutatore ha colonne B=Grado (1-5),
// C=Punteggio (0-100), D=Valore, E=Totale — il punteggio da importare è la colonna C,
// individuata dall'intestazione "Punteggio" (nell'autovalutazione la colonna si chiama "Valore").
// Mai prendere il primo numero della riga: sarebbe il Grado 1-5.
function _parseValutazioneWorkbook(wb) {
  const aree = {};
  const areeNote = {};
  const areeValori = {};
  const extra = {};
  let annoTrovato = null;
  const leggiNum = (v) => {
    if (typeof v === 'string') v = v.replace('%', '').replace(',', '.').trim();
    const n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 100 || String(v) === '') return null;
    // Excel a volte usa 0-1 per le percentuali
    return n <= 1 && n > 0 ? Math.round(n * 100) : Math.round(n);
  };
  // La scheda del valutatore ha priorità sull'autovalutazione
  const ordinati = wb.SheetNames.slice().sort((a, b) => {
    const peso = (n) => (_normTesto(n).includes('autovalutazione') ? 1 : 0);
    return peso(a) - peso(b);
  });
  for (const sn of ordinati) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
      header: 1,
      defval: '',
    });
    // Considera solo i fogli che sono schede (esclude "Elenco persone" ecc.)
    const isScheda = data.some((row) => row.some((c) => _normTesto(c).includes('area di valutazione')));
    if (!isScheda) continue;
    let colPunteggio = -1;
    let colDescr = -1;
    let colValore = -1;
    const dp = extra.dati_personali || {};
    // DATI PERSONALI ufficiali: nella scheda le etichette compaiono due volte per riga
    // (colonna sinistra = valutato, colonna destra = valutatore)
    const leggiCoppia = (row, rowNorm, etichetta, esatta) => {
      const trovati = [];
      rowNorm.forEach((c, j) => {
        if (esatta ? c !== etichetta : c !== etichetta && !c.startsWith(etichetta)) return;
        for (let k = j + 1; k < row.length; k++) {
          const t = String(row[k] == null ? '' : row[k]).trim();
          if (t !== '') {
            trovati.push(t);
            break;
          }
        }
      });
      return trovati;
    };
    data.forEach((row) => {
      const rowNorm = row.map(_normTesto);
      // blocco DATI PERSONALI: la prima scheda (valutatore) imposta, le altre non sovrascrivono
      const settori = leggiCoppia(row, rowNorm, 'settore');
      if (settori.length && dp.settore == null) {
        dp.settore = settori[0];
        if (settori[1] != null) dp.valutatore_settore = settori[1];
      }
      const funzioni = leggiCoppia(row, rowNorm, 'funzione');
      if (funzioni.length && dp.funzione == null) {
        dp.funzione = funzioni[0];
        if (funzioni[1] != null) dp.valutatore_funzione = funzioni[1];
      }
      const ids = leggiCoppia(row, rowNorm, 'valutato id');
      if (ids.length && dp.valutato_id == null) dp.valutato_id = ids[0];
      const idsV = leggiCoppia(row, rowNorm, 'valutatore id');
      if (idsV.length && dp.valutatore_id == null) dp.valutatore_id = idsV[0];
      const nomi = leggiCoppia(row, rowNorm, 'cognome');
      if (nomi.length >= 2 && !extra.valutatore) extra.valutatore = nomi[1];
      // data ufficiale della scheda (cella "Data:") — numero seriale Excel o testo gg.mm.aaaa
      const dataC = leggiCoppia(row, rowNorm, 'data', true);
      if (dataC.length && dp.data_scheda == null) {
        const nSer = parseFloat(dataC[0]);
        if (!isNaN(nSer) && nSer > 40000 && nSer < 60000) {
          dp.data_scheda = new Date(Math.round((nSer - 25569) * 86400000)).toISOString().split('T')[0];
        } else {
          const md = String(dataC[0]).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
          if (md)
            dp.data_scheda =
              (md[3].length === 2 ? '20' + md[3] : md[3]) + '-' + md[2].padStart(2, '0') + '-' + md[1].padStart(2, '0');
        }
      }
      if (Object.keys(dp).length) extra.dati_personali = dp;
      // riga di intestazione tabella: memorizza dove stanno punteggio e descrizione
      if (rowNorm.some((c) => c.includes('area di valutazione'))) {
        let ip = rowNorm.findIndex((c) => c.includes('punteggio'));
        if (ip === -1) ip = rowNorm.findIndex((c) => c === 'valore');
        if (ip !== -1) colPunteggio = ip;
        // colonna D "Valore" (ponderazione ufficiale) — solo se distinta dal punteggio
        const iv = rowNorm.findIndex((c, j) => c === 'valore' && j !== ip);
        colValore = iv !== -1 && rowNorm[ip] !== 'valore' ? iv : -1;
        const idd = rowNorm.findIndex((c) => c.includes('descrizione area') || c.includes('param'));
        if (idd !== -1) colDescr = idd;
        return;
      }
      // anno: un anno isolato 20xx (riga "Periodo di valutazione")
      row.forEach((cell) => {
        const m = String(cell).match(/^(20[2-4]\d)$/);
        if (m && !annoTrovato) annoTrovato = parseInt(m[1]);
      });
      _AREE_MATCH.forEach((am) => {
        if (aree[am.key] != null) return;
        const idx = rowNorm.findIndex((c) => c && c.includes(am.match));
        if (idx === -1) return;
        // 1) colonna Punteggio individuata dall'intestazione
        if (colPunteggio !== -1 && colPunteggio !== idx) {
          const n = leggiNum(row[colPunteggio]);
          if (n != null) aree[am.key] = n;
        }
        // 2) fallback: primo valore numerico 0-100 nella riga
        if (aree[am.key] == null) {
          for (let j = 0; j < row.length; j++) {
            if (j === idx) continue;
            const n = leggiNum(row[j]);
            if (n != null) {
              aree[am.key] = n;
              break;
            }
          }
        }
        // colonna D "Valore" (ponderazione ufficiale) per il calcolo di Totale/Conseguito
        if (areeValori[am.key] == null && colValore !== -1) {
          const nv = leggiNum(row[colValore]);
          if (nv != null) areeValori[am.key] = nv;
        }
        // nota del valutatore (es. colonna I): primo testo dopo la colonna Descrizione
        if (areeNote[am.key] == null && colDescr !== -1) {
          for (let j = colDescr + 1; j < row.length; j++) {
            const t = String(row[j] || '').trim();
            if (t.length > 2 && isNaN(parseFloat(t))) {
              areeNote[am.key] = t;
              break;
            }
          }
        }
      });
      // testi: punti di forza / esigenze formative / obiettivi numerati 1-3
      const primo = rowNorm.findIndex((c) => c);
      if (primo !== -1) {
        const label = rowNorm[primo];
        const testoDopo = row
          .slice(primo + 1)
          .map((v) => String(v || '').trim())
          .find((v) => v.length > 2);
        if (label.startsWith('punti di forza') && testoDopo && !extra.punti_forza) extra.punti_forza = testoDopo;
        if (label === 'sintesi' && testoDopo && !extra.sintesi) extra.sintesi = testoDopo;
        if (label.startsWith('esigenze formative') && testoDopo && !extra.esigenze_formative)
          extra.esigenze_formative = testoDopo;
      }
      const n0 = parseInt(row[0]);
      if (!isNaN(n0) && n0 >= 1 && n0 <= 3 && String(row[0]).trim().length <= 2) {
        const t = row
          .slice(1)
          .map((v) => String(v || '').trim())
          .find((v) => v.length > 2);
        if (t) {
          extra.obiettivi = extra.obiettivi || [];
          if (extra.obiettivi.length < 3 && !extra.obiettivi.includes(t)) extra.obiettivi.push(t);
        }
      }
    });
  }
  if (Object.keys(areeNote).length) extra.aree_note = areeNote;
  if (Object.keys(areeValori).length) extra.aree_valori = areeValori;
  return { aree, annoTrovato, extra };
}
async function importaValutazioneExcel(input, nome) {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_valutazioni')) {
    input.value = '';
    toast('Non hai il permesso di importare valutazioni');
    return;
  }
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
    const { aree, annoTrovato, extra } = _parseValutazioneWorkbook(wb);
    const trovate = Object.keys(aree).length;
    if (!trovate) {
      toast('Nessuna area di valutazione riconosciuta nel file');
      return;
    }
    const anno = annoTrovato || new Date().getFullYear();
    // anteprima conferma
    const b = document.getElementById('pwd-modal-content');
    const ne = nome.replace(/'/g, "\\'");
    window._valImportPending = { nome, anno, aree, extra };
    b.innerHTML =
      '<h3>Importa valutazione</h3><p style="margin-bottom:10px"><strong>' +
      escP(nome) +
      '</strong> — anno <strong>' +
      anno +
      '</strong> — ' +
      trovate +
      '/' +
      AREE_VALUTAZIONE.length +
      ' aree riconosciute:</p><div style="max-height:280px;overflow-y:auto;text-align:left;margin-bottom:14px">' +
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
      (extra &&
      (extra.punti_forza ||
        extra.esigenze_formative ||
        (extra.obiettivi || []).length ||
        extra.aree_note ||
        extra.dati_personali)
        ? '<p style="font-size:.78rem;color:var(--muted);margin:0 0 10px">Testi trovati: ' +
          [
            extra.dati_personali
              ? 'dati ufficiali (' +
                [extra.dati_personali.settore, extra.dati_personali.funzione].filter(Boolean).join(', ') +
                ')'
              : '',
            extra.punti_forza ? 'punti di forza' : '',
            (extra.obiettivi || []).length ? (extra.obiettivi || []).length + ' obiettivi' : '',
            extra.esigenze_formative ? 'esigenze formative' : '',
            extra.aree_note ? Object.keys(extra.aree_note).length + ' note area' : '',
          ]
            .filter(Boolean)
            .join(' · ') +
          '</p>'
        : '') +
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
    const ex = p.extra || {};
    const testi = {};
    if (ex.punti_forza) testi.punti_forza = ex.punti_forza;
    if (ex.esigenze_formative) testi.esigenze_formative = ex.esigenze_formative;
    if (Array.isArray(ex.obiettivi) && ex.obiettivi.length) testi.obiettivi = ex.obiettivi;
    if (ex.aree_note && Object.keys(ex.aree_note).length) testi.aree_note = ex.aree_note;
    if (ex.aree_valori && Object.keys(ex.aree_valori).length) testi.aree_valori = ex.aree_valori;
    if (ex.sintesi) testi.sintesi = ex.sintesi;
    // dati ufficiali della scheda: settore, funzione, ID, valutatore, data
    if (ex.dati_personali && Object.keys(ex.dati_personali).length) testi.dati_personali = ex.dati_personali;
    if (ex.valutatore) testi.valutatore = ex.valutatore;
    if (ex.dati_personali && ex.dati_personali.data_scheda) testi.data_valutazione = ex.dati_personali.data_scheda;
    const esistente = getValutazioniCollab(p.nome).find((v) => v.anno === p.anno && v.tipo === 'valutazione');
    if (esistente) {
      const areeMerged = Object.assign({}, esistente.aree || {}, p.aree);
      if (testi.aree_note) testi.aree_note = Object.assign({}, esistente.aree_note || {}, testi.aree_note);
      if (testi.aree_valori) testi.aree_valori = Object.assign({}, esistente.aree_valori || {}, testi.aree_valori);
      if (testi.dati_personali)
        testi.dati_personali = Object.assign({}, esistente.dati_personali || {}, testi.dati_personali);
      const patch = Object.assign({ aree: areeMerged, updated_at: new Date().toISOString() }, testi);
      await secPatch('valutazioni', 'id=eq.' + esistente.id, patch);
      Object.assign(esistente, patch);
    } else {
      const r = await secPost('valutazioni', {
        collaboratore: p.nome,
        anno: p.anno,
        tipo: 'valutazione',
        ...testi,
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
  // === DATI PERSONALI: blocco a due colonne come il foglio ufficiale ===
  sezione('DATI PERSONALI');
  const dpP = v.dati_personali || {};
  const settoreLbl = dpP.settore || 'Reparto ' + repartoLabel(v.reparto_dip || 'slots');
  const dataLbl = v.data_valutazione ? new Date(v.data_valutazione + 'T12:00:00').toLocaleDateString('it-IT') : '';
  const stileDP = {
    theme: 'grid',
    margin: { left: mx, right: mx },
    styles: { lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 8.5, cellPadding: 1.8, valign: 'middle' },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 53, fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 'auto' },
    },
    // come nel foglio: etichette con i due punti in grassetto, valori del valutato in grassetto,
    // "Periodo di valutazione" centrato e "Data" a destra
    didParseCell: function (d) {
      const raw = String(d.cell.raw || '');
      if (raw.endsWith(':')) d.cell.styles.fontStyle = 'bold';
      if (d.row.index === 4 && d.column.index === 1) d.cell.styles.halign = 'center';
      if (d.row.index === 4 && d.column.index === 3) d.cell.styles.halign = 'right';
    },
  };
  doc.autoTable(
    Object.assign({}, stileDP, {
      startY: y,
      body: [
        ['Valutato ID:', dpP.valutato_id || '', 'Valutatore ID:', dpP.valutatore_id || ''],
        ['Cognome, Nome', v.collaboratore, 'Cognome, Nome', v.valutatore || ''],
        ['Settore', settoreLbl, 'Settore', dpP.valutatore_settore || ''],
        ['Funzione', dpP.funzione || '', 'Funzione', dpP.valutatore_funzione || ''],
        ['Periodo di valutazione:', String(v.anno), 'Data:', dataLbl],
      ],
    }),
  );
  y = doc.lastAutoTable.finalY + 4;
  // === Tabelle aree nel formato ufficiale: Grado / Punteggio / Valore / Totale ===
  // Le note del valutatore (colonna I) restano SOLO nella scheda in-app: nel PDF non si stampano
  const aree = _areeNormalizza(v.aree);
  const valori = v.aree_valori || {};
  const conValori = Object.keys(valori).some((k) => valori[k] != null);
  const stileTab = {
    theme: 'grid',
    margin: { left: mx, right: mx },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7.5 },
    styles: { lineColor: [0, 0, 0], lineWidth: 0.2, fontSize: 7.2, cellPadding: 1.8, valign: 'top' },
  };
  // come nel foglio: numeri allineati a destra in basso, intestazioni centrate
  const colStili = {
    0: { cellWidth: 30, fontStyle: 'bold' },
    1: { cellWidth: 13, halign: 'right', valign: 'bottom' },
    2: { cellWidth: 17, halign: 'right', valign: 'bottom' },
    3: { cellWidth: 13, halign: 'center', valign: 'middle' },
    4: { cellWidth: 13, halign: 'right', valign: 'bottom' },
    5: { cellWidth: 'auto' },
  };
  const _testateCentrate = function (d) {
    if (d.section === 'head') {
      d.cell.styles.halign = 'center';
      d.cell.styles.valign = 'middle';
    }
  };
  const testataAree = ['Area di valutazione', 'Grado', 'Punteggio', 'Valore', 'Totale', 'Descrizione area'];
  // sezione "Verifica obiettivi precedenti" del formulario ufficiale (compilazione manuale)
  if (y + 30 > ph - 20) {
    doc.addPage();
    y = 14;
  }
  sezione('VERIFICA OBIETTIVI PRECEDENTI E FORMAZIONI CONSEGUITE');
  doc.autoTable(
    Object.assign({}, stileTab, {
      startY: y,
      head: [
        ['Area di valutazione', 'Grado', 'Punteggio', 'Valore', 'Totale', 'Paramentro di valutazione e/o osservazioni'],
      ],
      body: [
        ['', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        [
          { content: '', colSpan: 5 },
          { content: 'Conseguito:', styles: { fontStyle: 'bold', halign: 'right' } },
        ],
      ],
      columnStyles: colStili,
      didParseCell: _testateCentrate,
    }),
  );
  y = doc.lastAutoTable.finalY + 4;
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
    // Conseguito = somma Totale / somma Punteggio (come nel foglio ufficiale)
    let sommaTot = 0;
    let sommaPunt = 0;
    const body = righe.map((a) => {
      const p = aree[a.key];
      const val = valori[a.key];
      const grado = p != null ? _gradoScala(p) : '';
      const totale = p != null && val != null ? Math.round((p * val) / 100) : '';
      if (p != null && val != null) {
        sommaTot += (p * val) / 100;
        sommaPunt += p;
      }
      return [a.label, grado, p != null ? p : '', val != null ? val : '', totale, a.desc];
    });
    if (conValori && sommaPunt > 0) {
      const conseguito = Math.round((sommaTot / sommaPunt) * 100) + '%';
      body.push([
        { content: '', colSpan: 5 },
        { content: 'Conseguito: ' + conseguito, styles: { fontStyle: 'bold', halign: 'right' } },
      ]);
    }
    doc.autoTable(
      Object.assign({}, stileTab, {
        startY: y,
        head: [testataAree],
        body,
        columnStyles: colStili,
        // intestazioni centrate + colonna "Valore" colorata per fascia come nel foglio ufficiale
        didParseCell: function (d) {
          _testateCentrate(d);
          if (d.section !== 'body' || d.column.index !== 3) return;
          const n = parseFloat(d.cell.raw);
          if (!isNaN(n)) d.cell.styles.fillColor = _fasciaFillPdf(n);
        },
      }),
    );
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
    const labLines = doc.splitTextToSize(label, 42);
    doc.text(labLines, mx, y + 1);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(testo || '—', pw - mx * 2 - 45);
    doc.text(lines, mx + 45, y + 1);
    y += Math.max(6, Math.max(lines.length, labLines.length) * 3.8 + 2);
  }
  if (v.sintesi) blocco('Sintesi', v.sintesi);
  blocco('Punti di forza', v.punti_forza);
  const ob = v.obiettivi || [];
  blocco(
    'Punti da migliorare/sviluppare e/o obiettivi da raggiungere entro il 31 dicembre:',
    ob.length ? ob.map((o, i) => i + 1 + '. ' + o).join('\n') : '—',
  );
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
  doc.text('Valutatore, firma', mx + 95, y + 4);
  doc.line(mx + 95, y + 14, mx + 165, y + 14);
  y += 22;
  if (y + 22 > ph - 15) {
    doc.addPage();
    y = 14;
  }
  doc.text('Per visione resp. Settore', mx, y + 4);
  doc.text('Data, visto:', mx, y + 9);
  doc.line(mx + 18, y + 14, mx + 70, y + 14);
  doc.text('Per visione HR', mx + 95, y + 4);
  doc.text('Data, visto:', mx + 95, y + 9);
  doc.line(mx + 113, y + 14, mx + 165, y + 14);
  doc.setFontSize(6.5);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA — Scheda di valutazione ' + v.anno + ' — Riservato', mx, ph - 8);
  mostraPdfPreview(
    doc,
    'valutazione_' + v.collaboratore.replace(/\s+/g, '_') + '_' + v.anno + '.pdf',
    'Valutazione ' + v.anno + ' — ' + v.collaboratore,
  );
}
