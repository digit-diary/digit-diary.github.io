/**
 * Diario Collaboratori — Casino Lugano SA
 * File: formazione.js
 * Progetto Multidisciplinarità: mappatura competenze (spunte per reparto),
 * livelli L1/L2/L3, sistema punti personalizzabile e premi.
 */

// ================================================================
// CONFIGURAZIONE (personalizzabile da admin, salvata in impostazioni)
// ================================================================
const COMPETENZE_DEFAULT = {
  slots: [
    { key: 'sala', label: 'Sala Slot', livello: 1 },
    { key: 'reception', label: 'Reception', livello: 2 },
    { key: 'cassa', label: 'Cassa', livello: 3 },
  ],
  tavoli: [
    { key: 'croupier', label: 'Croupier', livello: 1 },
    { key: 'ispettore', label: 'Ispettore tavolo', livello: 2 },
    { key: 'cassa_tavoli', label: 'Cassa Tavoli', livello: 3 },
  ],
  valet: [
    { key: 'valet_servizio', label: 'Servizio Valet', livello: 1 },
    { key: 'valet_accoglienza', label: 'Accoglienza clienti', livello: 2 },
  ],
  cleaning: [
    { key: 'cleaning_sale', label: 'Pulizia sale', livello: 1 },
    { key: 'cleaning_speciali', label: 'Interventi speciali', livello: 2 },
  ],
};
const PUNTI_DEFAULT = {
  azioni: [
    { key: 'copertura', label: 'Copertura turno (malattia)', punti: 10 },
    { key: 'cambio_turno', label: 'Cambio turno accettato', punti: 5 },
    {
      key: 'sessione_formativa',
      label: 'Sessione formativa completata',
      punti: 5,
    },
    { key: 'competenza', label: 'Competenza certificata', punti: 20 },
    { key: 'formatore', label: 'Formatore in sessione', punti: 15 },
    {
      key: 'apprezzamento',
      label: 'Apprezzamento / feedback positivo',
      punti: 10,
    },
    {
      key: 'disponibilita_negata',
      label: 'Disponibilità negata (rifiuto copertura)',
      punti: -5,
    },
  ],
  soglie: [
    { punti: 75, premio: 'Aperitivo' },
    { punti: 150, premio: 'Cena per due' },
  ],
  premi_livello: {
    2: 'Aperitivo di team',
    3: 'Cena + proposta riconoscimento HR',
  },
  // 'privato' = premi/livelli notificati solo all'interessato; 'tutti' = annuncio a tutta la squadra; 'off' = nessuna push
  notifiche: 'privato',
};

function getCompetenzeConfigAll() {
  const cfg = competenzeConfig && typeof competenzeConfig === 'object' ? competenzeConfig : COMPETENZE_DEFAULT;
  return {
    slots: Array.isArray(cfg.slots) ? cfg.slots : COMPETENZE_DEFAULT.slots,
    tavoli: Array.isArray(cfg.tavoli) ? cfg.tavoli : COMPETENZE_DEFAULT.tavoli,
    valet: Array.isArray(cfg.valet) ? cfg.valet : COMPETENZE_DEFAULT.valet,
    cleaning: Array.isArray(cfg.cleaning) ? cfg.cleaning : COMPETENZE_DEFAULT.cleaning,
  };
}
function getCompetenzeReparto() {
  return (
    getCompetenzeConfigAll()[
      ['slots', 'tavoli', 'valet', 'cleaning'].includes(currentReparto) ? currentReparto : 'slots'
    ] || []
  );
}
async function saveCompetenzeConfig(cfg) {
  competenzeConfig = cfg;
  await setImp('competenze_config', JSON.stringify(cfg));
}
function getPuntiConfig() {
  const cfg = puntiConfig && typeof puntiConfig === 'object' ? puntiConfig : PUNTI_DEFAULT;
  return {
    azioni: Array.isArray(cfg.azioni) && cfg.azioni.length ? cfg.azioni : PUNTI_DEFAULT.azioni,
    soglie: Array.isArray(cfg.soglie) ? cfg.soglie : PUNTI_DEFAULT.soglie,
    premi_livello: cfg.premi_livello || PUNTI_DEFAULT.premi_livello,
    notifiche: cfg.notifiche === 'tutti' || cfg.notifiche === 'off' ? cfg.notifiche : 'privato',
  };
}
// Push incentivi: i punti personali arrivano sempre e solo all'interessato (se è anche operatore);
// premi e passaggi di livello seguono la scelta admin (privato / annuncio a tutti / off)
function _notificaIncentivo(nome, titolo, corpo, soloPrivato) {
  if (typeof inviaPush !== 'function') return;
  const mode = getPuntiConfig().notifiche;
  if (mode === 'off') return;
  if (mode === 'tutti' && !soloPrivato) {
    inviaPush(['tutti'], titolo, corpo, 'general');
    return;
  }
  const isOp = (operatoriAuthCache || []).some((o) => (o.nome || '').toLowerCase() === nome.toLowerCase());
  if (isOp) inviaPush([nome], titolo, corpo, 'general');
}
async function savePuntiConfig(cfg) {
  puntiConfig = cfg;
  await setImp('punti_config', JSON.stringify(cfg));
}

// ================================================================
// LIVELLI E PUNTI — helpers
// ================================================================
// Livello multidisciplinare: L(n) = tutte le competenze di livello <= n spuntate
function livelloDiCollaboratore(c) {
  const comps = getCompetenzeReparto().filter((k) => k.livello >= 1);
  if (!comps.length) return 0;
  const spunte = (c && c.competenze) || {};
  let lv = 0;
  for (let n = 1; n <= 3; n++) {
    const richieste = comps.filter((k) => k.livello <= n);
    if (!richieste.length) continue;
    if (richieste.every((k) => spunte[k.key] === true)) lv = n;
    else break;
  }
  return lv;
}
function livelloBadgeHtml(lv) {
  if (!lv) return '<span class="mini-badge" style="background:var(--muted)">—</span>';
  const col = { 1: '#1a4a7a', 2: '#e67e22', 3: '#2c6e49' }[lv] || 'var(--muted)';
  return '<span class="mini-badge" style="background:' + col + ';font-size:.72rem">Livello ' + lv + '</span>';
}
function puntiTotali(nome, anno) {
  const a = anno || new Date().getFullYear();
  return getPuntiReparto()
    .filter((p) => p.collaboratore.toLowerCase() === nome.toLowerCase() && (p.data_evento || '').startsWith(String(a)))
    .reduce((s, p) => s + (parseInt(p.punti) || 0), 0);
}
function conteggioAzione(nome, azioneKey, anno) {
  const a = anno || new Date().getFullYear();
  return getPuntiReparto().filter(
    (p) =>
      p.collaboratore.toLowerCase() === nome.toLowerCase() &&
      p.azione === azioneKey &&
      (p.data_evento || '').startsWith(String(a)),
  ).length;
}
function prossimaSoglia(punti) {
  const soglie = getPuntiConfig()
    .soglie.slice()
    .sort((a, b) => a.punti - b.punti);
  return soglie.find((s) => punti < s.punti) || null;
}
function sogliePremiRaggiunti(nome, anno) {
  const tot = puntiTotali(nome, anno);
  return getPuntiConfig()
    .soglie.filter((s) => tot >= s.punti)
    .map((s) => s.premio);
}

// ================================================================
// PAGINA FORMAZIONE
// ================================================================
function renderFormazione() {
  const el = document.getElementById('formazione-content');
  if (!el) return;
  const adm = isAdmin();
  const puoPunti = typeof puoModificare === 'function' ? puoModificare('gestione_punti') : adm;
  const puoComp = typeof puoModificare === 'function' ? puoModificare('gestione_competenze') : adm;
  const comps = getCompetenzeReparto();
  const collabs = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  // KPI livelli
  const perLivello = [0, 0, 0, 0];
  collabs.forEach((c) => {
    perLivello[livelloDiCollaboratore(c)]++;
  });
  let html = '<div class="stats-bar" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">';
  html +=
    '<div class="stat"><div class="stat-num">' +
    collabs.length +
    '</div><div class="stat-label">Collaboratori</div></div>';
  html +=
    '<div class="stat"><div class="stat-num blue">' +
    perLivello[1] +
    '</div><div class="stat-label">Livello 1</div></div>';
  html +=
    '<div class="stat"><div class="stat-num" style="color:#e67e22">' +
    perLivello[2] +
    '</div><div class="stat-label">Livello 2</div></div>';
  html +=
    '<div class="stat"><div class="stat-num teal">' +
    perLivello[3] +
    '</div><div class="stat-label">Livello 3 (multiruolo)</div></div>';
  // copertura per competenza
  comps.forEach((k) => {
    const n = collabs.filter((c) => (c.competenze || {})[k.key] === true).length;
    html +=
      '<div class="stat"><div class="stat-num gold">' +
      n +
      '</div><div class="stat-label">' +
      escP(k.label) +
      '</div></div>';
  });
  html += '</div>';

  // MATRICE COMPETENZE
  html += '<div class="main-card"><div class="card-header">Matrice competenze — chi sa fare cosa</div>';
  html +=
    '<div class="filters" style="padding:10px 16px"><div class="filter-group"><span class="filter-label">Cerca</span><input type="text" id="form-matr-cerca" placeholder="Nome..." oninput="_filtraMatrice()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:180px"></div>' +
    '<div class="export-btns"><button class="btn-export" onclick="esportaMatriceCSV()">CSV</button><button class="btn-export btn-export-pdf" onclick="esportaMatricePDF()">PDF</button></div></div>';
  html +=
    '<div style="padding:0 16px 16px;overflow-x:auto"><table class="collab-table" id="matrice-competenze"><thead><tr><th>Collaboratore</th>';
  comps.forEach((k) => {
    html +=
      '<th class="num">' +
      escP(k.label) +
      (k.livello ? ' <span style="font-size:.6rem;color:var(--muted)">L' + k.livello + '</span>' : '') +
      '</th>';
  });
  html += '<th class="num">Livello</th><th class="num">Punti ' + new Date().getFullYear() + '</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    const lv = livelloDiCollaboratore(c);
    const pts = puntiTotali(c.nome);
    const ne = c.nome.replace(/'/g, "\\'");
    html +=
      '<tr data-matr-nome="' +
      escP(c.nome).toLowerCase() +
      '"><td><span class="entry-name" onclick="apriSchedaCollaboratore(\'' +
      ne +
      '\')"><strong>' +
      escP(c.nome) +
      '</strong></span>' +
      (c.impiego
        ? ' <span class="mini-badge" style="background:' +
          (c.impiego === 'fisso' ? '#1a7a6d' : '#e67e22') +
          ';font-size:.62rem">' +
          (c.impiego === 'fisso' ? 'Fisso' : 'Jolly') +
          '</span>'
        : '') +
      (c.categoria
        ? ' <span class="mini-badge" style="background:var(--accent2);font-size:.62rem">' +
          c.categoria +
          '&ordf;</span>'
        : '') +
      '</td>';
    comps.forEach((k) => {
      const on = (c.competenze || {})[k.key] === true;
      html +=
        '<td class="num"><input type="checkbox" ' +
        (on ? 'checked ' : '') +
        (puoComp ? '' : 'disabled ') +
        'onchange="toggleCompetenza(' +
        c.id +
        ",'" +
        k.key +
        '\',this)" style="width:18px;height:18px;accent-color:#2c6e49;cursor:' +
        (puoComp ? 'pointer' : 'default') +
        '"></td>';
    });
    html +=
      '<td class="num">' +
      livelloBadgeHtml(lv) +
      '</td><td class="num"><strong style="color:' +
      (pts < 0 ? 'var(--accent)' : 'var(--accent2)') +
      '">' +
      pts +
      '</strong></td></tr>';
  });
  html += '</tbody></table></div></div>';

  // PUNTI — assegnazione rapida + registro
  html += '<div class="main-card"><div class="card-header">Punti — assegnazione</div><div class="form-area">';
  if (puoPunti) {
    const cfg = getPuntiConfig();
    html += '<div class="form-row" style="grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:flex-end">';
    html +=
      '<div class="field"><label>Collaboratore</label><select id="pt-collab" style="padding:10px">' +
      collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
      '</select></div>';
    html +=
      '<div class="field"><label>Azione</label><select id="pt-azione" style="padding:10px">' +
      cfg.azioni
        .map(
          (a) =>
            '<option value="' +
            escP(a.key) +
            '">' +
            escP(a.label) +
            ' (' +
            (a.punti > 0 ? '+' : '') +
            a.punti +
            ')</option>',
        )
        .join('') +
      '<option value="manuale">Punti manuali...</option></select></div>';
    html +=
      '<div class="field"><label>Nota (opzionale)</label><input type="text" id="pt-nota" placeholder="Es: copertura turno del 15/08 per..."></div>';
    html += '<button class="btn-add-tipo" onclick="assegnaPuntiRapido()">+ Assegna</button></div>';
    html +=
      '<p style="color:var(--muted);font-size:.78rem;margin-top:6px">I punti si guadagnano con azioni positive (coperture, formazione, apprezzamenti). Le malattie NON tolgono mai punti: solo il rifiuto esplicito di una disponibilità richiesta può essere conteggiato, se configurato.</p>';
  } else {
    html += '<p style="color:var(--muted);font-size:.88rem">I punti vengono assegnati dal responsabile.</p>';
  }
  html += '</div>';
  // registro eventi punti
  const eventi = getPuntiReparto().slice(0, 60);
  html += '<div style="padding:0 16px 16px">';
  if (!eventi.length) html += '<p style="color:var(--muted);padding:10px">Nessun punto assegnato finora.</p>';
  else {
    html +=
      '<table class="collab-table"><thead><tr><th>Data</th><th>Collaboratore</th><th class="num">Punti</th><th>Azione</th><th>Nota</th><th>Da</th>' +
      (adm ? '<th></th>' : '') +
      '</tr></thead><tbody>';
    const azLabels = {};
    getPuntiConfig().azioni.forEach((a) => (azLabels[a.key] = a.label));
    eventi.forEach((p) => {
      html +=
        '<tr><td style="white-space:nowrap">' +
        new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') +
        '</td><td><strong>' +
        escP(p.collaboratore) +
        '</strong></td><td class="num"><strong style="color:' +
        (p.punti < 0 ? 'var(--accent)' : p.punti > 0 ? '#2c6e49' : 'var(--muted)') +
        '">' +
        (p.punti > 0 ? '+' : '') +
        p.punti +
        '</strong></td><td>' +
        escP(azLabels[p.azione] || p.azione) +
        '</td><td style="color:var(--muted);font-size:.84rem">' +
        escP(p.descrizione || '') +
        '</td><td style="color:var(--muted);font-size:.82rem">' +
        escP(p.operatore || '') +
        '</td>' +
        (adm
          ? '<td><button class="btn-act del" onclick="eliminaPuntiEvento(' +
            p.id +
            ')" style="font-size:.7rem">X</button></td>'
          : '') +
        '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // TRAGUARDI PREMI
  const cfgP = getPuntiConfig();
  html +=
    '<div class="main-card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">Traguardi e premi' +
    (adm || puoPunti
      ? '<span style="display:flex;align-items:center;gap:6px"><select id="ri-anno" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:.75rem">' +
        [0, 1, 2, 3]
          .map((d) => {
            const a = new Date().getFullYear() - d;
            return '<option value="' + a + '">' + a + '</option>';
          })
          .join('') +
        '</select><button class="btn-export btn-export-pdf" onclick="esportaReportIncentiviPDF()" style="font-size:.75rem;padding:4px 12px">Report Incentivi PDF</button></span>'
      : '') +
    '</div><div style="padding:16px">';
  html +=
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:10px">Soglie punti: ' +
    cfgP.soglie.map((s) => '<strong>' + s.punti + '</strong> = ' + escP(s.premio)).join(' · ') +
    ' — Passaggio livello: ' +
    Object.entries(cfgP.premi_livello)
      .map(([l, p]) => 'L' + l + ' = ' + escP(p))
      .join(' · ') +
    '</p>';
  const conPunti = collabs
    .map((c) => ({
      nome: c.nome,
      punti: puntiTotali(c.nome),
      lv: livelloDiCollaboratore(c),
    }))
    .filter((x) => x.punti !== 0 || x.lv > 0)
    .sort((a, b) => b.punti - a.punti);
  if (!conPunti.length) html += '<p style="color:var(--muted)">Nessun traguardo in corso.</p>';
  else {
    conPunti.forEach((x) => {
      const next = prossimaSoglia(x.punti);
      const raggiunti = sogliePremiRaggiunti(x.nome);
      const maxS = cfgP.soglie.length ? Math.max(...cfgP.soglie.map((s) => s.punti)) : 100;
      const pct = Math.max(0, Math.min(100, Math.round((x.punti / maxS) * 100)));
      html +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><strong style="min-width:170px">' +
        escP(x.nome) +
        '</strong>' +
        livelloBadgeHtml(x.lv) +
        '<span style="font-weight:700;color:var(--accent2)">' +
        x.punti +
        ' pt</span><div class="budget-bar" style="flex:1;min-width:120px;height:6px"><div class="budget-bar-fill" style="width:' +
        pct +
        '%;background:var(--accent2)"></div></div>' +
        (next
          ? '<span style="font-size:.78rem;color:var(--muted)">-' +
            (next.punti - x.punti) +
            ' a: ' +
            escP(next.premio) +
            '</span>'
          : '<span style="font-size:.78rem;color:#2c6e49;font-weight:700">Tutte le soglie raggiunte!</span>') +
        (raggiunti.length
          ? '<span style="font-size:.78rem;color:#2c6e49"><i class="icx icx-trofeo"></i> ' +
            raggiunti.map(escP).join(', ') +
            '</span>'
          : '') +
        '</div></div>';
    });
  }
  html += '</div></div>';

  // REGISTRA FORMAZIONE SVOLTA (admin o permesso gestione_formazioni: es. supervisor)
  const puoForm = adm || (typeof puoModificare === 'function' && puoModificare('gestione_formazioni'));
  if (puoForm) {
    html += '<div class="main-card"><div class="card-header">Registra formazione svolta</div><div class="form-area">';
    html +=
      '<div class="form-row" style="grid-template-columns:1fr 1.4fr 1fr auto auto;gap:10px;align-items:flex-end">';
    html +=
      '<div class="field"><label>Collaboratore</label><select id="frm-collab" style="padding:10px">' +
      collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
      '</select></div>';
    html +=
      '<div class="field"><label>Formazione svolta</label><input type="text" id="frm-desc" placeholder="Es: formazione Reception, procedura LRD..."></div>';
    html +=
      '<div class="field"><label>Formatore</label><input type="text" id="frm-formatore" value="' +
      escP(getOperatore() || '') +
      '"></div>';
    html +=
      '<div class="field"><label>Data</label><input type="date" id="frm-data" value="' +
      new Date().toISOString().split('T')[0] +
      '" style="padding:9px"></div>';
    html += '<button class="btn-add-tipo" onclick="registraFormazioneSvolta()">+ Registra</button></div>';
    if (puoPunti) {
      const azF = getPuntiConfig().azioni.find((a) => a.key === 'sessione_formativa');
      html +=
        '<label style="display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-top:8px;cursor:pointer"><input type="checkbox" id="frm-punti" checked> Assegna anche i punti "Sessione formativa completata"' +
        (azF ? ' (+' + azF.punti + ')' : '') +
        '</label>';
    }
    html +=
      '<p style="color:var(--muted);font-size:.75rem;margin-top:6px">La formazione viene tracciata con data e formatore nello Storico HR del collaboratore (visibile solo a admin e operatori autorizzati).</p>';
    html += '</div></div>';
  }

  // EQUITÀ CATEGORIE (riservato: admin + permesso storico_hr) — sistema meritocratico
  if (typeof puoVedereStoricoHr === 'function' && puoVedereStoricoHr()) {
    html += _renderEquitaCard(collabs);
  }

  // CONFIG ADMIN
  if (adm) {
    html += _renderFormazioneConfig();
  }
  el.innerHTML = html;
}

// Registra una sessione formativa nello storico HR (+ punti opzionali)
async function registraFormazioneSvolta() {
  const adm = isAdmin();
  if (!adm && !(typeof puoModificare === 'function' && puoModificare('gestione_formazioni'))) {
    toast('Non hai il permesso di registrare formazioni');
    return;
  }
  const nome = (document.getElementById('frm-collab') || {}).value;
  const desc = ((document.getElementById('frm-desc') || {}).value || '').trim();
  const formatore = ((document.getElementById('frm-formatore') || {}).value || '').trim();
  const data = (document.getElementById('frm-data') || {}).value || new Date().toISOString().split('T')[0];
  if (!nome || !desc) {
    toast('Indica collaboratore e formazione svolta');
    return;
  }
  try {
    await _insertHrEvento(nome, 'formazione', desc + (formatore ? ' — formatore: ' + formatore : ''), data);
    logAzione('Formazione registrata', nome + ' — ' + desc + (formatore ? ' (formatore ' + formatore + ')' : ''));
    const conPunti = (document.getElementById('frm-punti') || {}).checked;
    if (conPunti && (adm || (typeof puoModificare === 'function' && puoModificare('gestione_punti')))) {
      const az = getPuntiConfig().azioni.find((a) => a.key === 'sessione_formativa');
      if (az && az.punti) await _insertPuntiEvento(nome, az.punti, 'sessione_formativa', desc);
    }
    document.getElementById('frm-desc').value = '';
    renderFormazione();
    toast('Formazione registrata per ' + nome);
  } catch (e) {
    toast('Errore registrazione formazione');
  }
}

// Confronto meritocratico: segnala chi ha più anzianità e pari livello ma categoria inferiore
function _renderEquitaCard(collabs) {
  const oggi = Date.now();
  const righe = collabs.map((c) => {
    const anzGiorni = c.data_assunzione
      ? Math.floor((oggi - new Date(c.data_assunzione + 'T12:00:00').getTime()) / 86400000)
      : null;
    let media = null;
    if (typeof getValutazioniReparto === 'function' && typeof _mediaValutazione === 'function') {
      const v = getValutazioniReparto()
        .filter((x) => x.collaboratore.toLowerCase() === c.nome.toLowerCase())
        .sort((a, b) => b.anno - a.anno)[0];
      if (v) media = _mediaValutazione(v.aree);
    }
    return {
      nome: c.nome,
      impiego: c.impiego || '',
      categoria: c.categoria || null,
      dataAss: c.data_assunzione || '',
      anzGiorni,
      lv: livelloDiCollaboratore(c),
      punti: puntiTotali(c.nome),
      media,
    };
  });
  // segnalazioni: X penalizzato se esiste Y con categoria migliore, almeno 6 mesi di anzianità in meno e livello pari o inferiore
  righe.forEach((x) => {
    if (!x.categoria || x.anzGiorni == null) return;
    const y = righe
      .filter(
        (o) =>
          o.categoria &&
          o.anzGiorni != null &&
          o.categoria < x.categoria &&
          x.anzGiorni > o.anzGiorni + (typeof equitaMesi !== 'undefined' ? equitaMesi : 6) * 30 &&
          (o.lv || 0) <= (x.lv || 0),
      )
      .sort((a, b) => a.anzGiorni - b.anzGiorni)[0];
    if (y)
      x.flag =
        'In ' +
        x.categoria +
        'ª con più anzianità di ' +
        y.nome +
        ' (' +
        y.categoria +
        'ª, livello pari o inferiore) — valutare revisione';
  });
  const conDati = righe.filter((r) => r.categoria || r.dataAss);
  let html =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:8px">Equità categorie — analisi meritocratica <span class="mini-badge" style="background:var(--accent);font-size:.65rem">RISERVATO</span>' +
    (isAdmin()
      ? '<span style="margin-left:auto;font-size:.72rem;font-weight:400;display:flex;align-items:center;gap:6px">Segnala da <select onchange="salvaEquitaMesi(this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:.75rem">' +
        [3, 6, 9, 12]
          .map(
            (m) =>
              '<option value="' +
              m +
              '"' +
              ((typeof equitaMesi !== 'undefined' ? equitaMesi : 6) === m ? ' selected' : '') +
              '>' +
              m +
              ' mesi</option>',
          )
          .join('') +
        '</select> di anzianità in più</span>'
      : '') +
    '</div>';
  if (!conDati.length) {
    html +=
      '<p style="color:var(--muted);padding:16px;font-size:.86rem">Assegna categorie e date di inizio contratto (scheda collaboratore → Storico HR) per attivare il confronto.</p></div>';
    return html;
  }
  conDati.sort((a, b) => (a.categoria || 9) - (b.categoria || 9) || (b.anzGiorni || 0) - (a.anzGiorni || 0));
  html +=
    '<div style="padding:0 16px 8px;overflow-x:auto"><table class="collab-table"><thead><tr><th>Collaboratore</th><th>Impiego</th><th class="num">Cat.</th><th>Anzianità</th><th class="num">Livello</th><th class="num">Punti</th><th class="num">Valutazione</th><th>Segnalazione</th></tr></thead><tbody>';
  conDati.forEach((r) => {
    html +=
      '<tr' +
      (r.flag ? ' style="background:rgba(192,57,43,0.06)"' : '') +
      '><td><strong>' +
      escP(r.nome) +
      '</strong></td><td>' +
      (r.impiego === 'fisso' ? 'Fisso 100%' : r.impiego === 'jolly' ? 'Jolly' : '—') +
      '</td><td class="num"><strong>' +
      (r.categoria ? r.categoria + 'ª' : '—') +
      '</strong></td><td>' +
      (r.dataAss ? anzianitaLabel(r.dataAss) : '—') +
      '</td><td class="num">' +
      (r.lv ? 'L' + r.lv : '—') +
      '</td><td class="num">' +
      r.punti +
      '</td><td class="num">' +
      (r.media != null ? r.media + '%' : '—') +
      '</td><td style="font-size:.78rem;color:var(--accent)">' +
      (r.flag ? '<i class="icx icx-avviso"></i> ' + escP(r.flag) : '') +
      '</td></tr>';
  });
  html += '</tbody></table></div>';
  html +=
    '<p style="color:var(--muted);font-size:.75rem;padding:0 16px 14px">Analisi indicativa basata su anzianità (inizio contratto), categoria e livello multidisciplinare — segnala con almeno ' +
    (typeof equitaMesi !== 'undefined' ? equitaMesi : 6) +
    ' mesi di anzianità in più a parità di livello: la decisione sulle categorie resta al responsabile e a HR.</p></div>';
  return html;
}
function _filtraMatrice() {
  const q = ((document.getElementById('form-matr-cerca') || {}).value || '').toLowerCase();
  document.querySelectorAll('#matrice-competenze tbody tr').forEach((tr) => {
    tr.style.display = !q || (tr.dataset.matrNome || '').includes(q) ? '' : 'none';
  });
}

// Toggle spunta competenza (admin) + punti automatici + rilevamento passaggio livello
async function toggleCompetenza(collabId, key, cb) {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_competenze')) {
    cb.checked = !cb.checked;
    toast('Non hai il permesso di certificare competenze');
    return;
  }
  const c = collaboratoriCache.find((x) => x.id === collabId);
  if (!c) return;
  const prima = livelloDiCollaboratore(c);
  const nuove = Object.assign({}, c.competenze || {});
  const attiva = cb.checked;
  nuove[key] = attiva;
  try {
    await secPatch('collaboratori', 'id=eq.' + collabId, { competenze: nuove });
    c.competenze = nuove;
    const compDef = getCompetenzeReparto().find((k) => k.key === key);
    logAzione('Competenza ' + (attiva ? 'certificata' : 'rimossa'), c.nome + ' — ' + (compDef ? compDef.label : key));
    // Traccia nello storico HR: cosa è stato formato, quando e da chi
    if (attiva && typeof _insertHrEvento === 'function') {
      const fmt = (prompt('Formatore che ha svolto la formazione (opzionale):', '') || '').trim();
      _insertHrEvento(
        c.nome,
        'formazione',
        'Competenza certificata: ' + (compDef ? compDef.label : key) + (fmt ? ' — formatore: ' + fmt : ''),
      );
    }
    // Punti automatici per competenza certificata
    if (attiva) {
      const az = getPuntiConfig().azioni.find((a) => a.key === 'competenza');
      if (az && az.punti) {
        if (
          confirm(
            'Assegnare ' +
              az.punti +
              ' punti a ' +
              c.nome +
              ' per la competenza certificata "' +
              (compDef ? compDef.label : key) +
              '"?',
          )
        ) {
          await _insertPuntiEvento(
            c.nome,
            az.punti,
            'competenza',
            'Competenza certificata: ' + (compDef ? compDef.label : key),
          );
        }
      }
    }
    // Passaggio livello?
    const dopo = livelloDiCollaboratore(c);
    if (dopo > prima && dopo >= 2) {
      const premio = getPuntiConfig().premi_livello[String(dopo)];
      logAzione('Passaggio livello', c.nome + ' → Livello ' + dopo);
      if (typeof _insertHrEvento === 'function')
        _insertHrEvento(c.nome, 'livello', 'Raggiunto Livello ' + dopo + ' multidisciplinare');
      _notificaIncentivo(
        c.nome,
        '🎉 ' + c.nome + ' → Livello ' + dopo,
        'Tutte le competenze fino al livello ' + dopo + ' completate' + (premio ? ' — premio: ' + premio : ''),
      );
      const b = document.getElementById('pwd-modal-content');
      b.innerHTML =
        '<h3><i class="icx icx-premio"></i> ' +
        escP(c.nome) +
        ' → Livello ' +
        dopo +
        '</h3><p style="margin-bottom:14px">Ha completato tutte le competenze fino al livello ' +
        dopo +
        '.</p>' +
        (premio
          ? '<p style="margin-bottom:16px">Premio previsto: <strong>' +
            escP(premio) +
            '</strong></p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="registraPremioConsegnato(\'' +
            c.nome.replace(/'/g, "\\'") +
            "','Livello " +
            dopo +
            ': ' +
            escP(premio).replace(/'/g, "\\'") +
            '\')">Registra premio consegnato</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Più tardi</button></div>'
          : '<div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>');
      document.getElementById('pwd-modal').classList.remove('hidden');
    }
    renderFormazione();
  } catch (e) {
    cb.checked = !attiva;
    toast('Errore salvataggio competenza');
  }
}
async function _insertPuntiEvento(nome, punti, azione, descrizione) {
  const r = await secPost('punti_eventi', {
    collaboratore: nome,
    punti: punti,
    azione: azione,
    descrizione: descrizione || '',
    data_evento: new Date().toISOString().split('T')[0],
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  });
  if (r && r[0]) puntiEventiCache.unshift(r[0]);
  logAzione('Punti assegnati', nome + ' ' + (punti > 0 ? '+' : '') + punti + ' (' + azione + ')');
  if (punti > 0)
    _notificaIncentivo(
      nome,
      '⭐ +' + punti + ' punti',
      (descrizione || azione) + ' — totale ' + puntiTotali(nome) + ' punti',
      true,
    );
}
async function assegnaPuntiRapido() {
  if (typeof puoModificare === 'function' && !puoModificare('gestione_punti')) {
    toast('Non hai il permesso di assegnare punti');
    return;
  }
  const nome = (document.getElementById('pt-collab') || {}).value;
  const azKey = (document.getElementById('pt-azione') || {}).value;
  const nota = ((document.getElementById('pt-nota') || {}).value || '').trim();
  if (!nome || !azKey) return;
  let punti;
  let azione = azKey;
  if (azKey === 'manuale') {
    const v = prompt('Quanti punti? (negativo per togliere)', '10');
    if (v === null) return;
    punti = parseInt(v) || 0;
  } else {
    const az = getPuntiConfig().azioni.find((a) => a.key === azKey);
    if (!az) return;
    punti = az.punti;
  }
  try {
    await _insertPuntiEvento(nome, punti, azione, nota);
    document.getElementById('pt-nota').value = '';
    // Soglia premio appena raggiunta?
    const tot = puntiTotali(nome);
    const raggiunta = getPuntiConfig().soglie.find((s) => tot >= s.punti && tot - punti < s.punti);
    renderFormazione();
    toast(nome + ': ' + (punti > 0 ? '+' : '') + punti + ' punti (totale ' + tot + ')');
    if (raggiunta)
      _notificaIncentivo(
        nome,
        '🏆 Traguardo raggiunto: ' + raggiunta.premio,
        nome + ' ha raggiunto ' + raggiunta.punti + ' punti — premio: ' + raggiunta.premio,
      );
    if (raggiunta) {
      setTimeout(() => {
        const b = document.getElementById('pwd-modal-content');
        b.innerHTML =
          '<h3><i class="icx icx-trofeo"></i> Traguardo raggiunto!</h3><p style="margin-bottom:14px"><strong>' +
          escP(nome) +
          '</strong> ha raggiunto <strong>' +
          raggiunta.punti +
          ' punti</strong>.</p><p style="margin-bottom:16px">Premio: <strong>' +
          escP(raggiunta.premio) +
          '</strong></p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="registraPremioConsegnato(\'' +
          nome.replace(/'/g, "\\'") +
          "','" +
          escP(raggiunta.premio).replace(/'/g, "\\'") +
          '\')">Registra premio consegnato</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Più tardi</button></div>';
        document.getElementById('pwd-modal').classList.remove('hidden');
      }, 300);
    }
  } catch (e) {
    toast('Errore assegnazione punti');
  }
}
async function registraPremioConsegnato(nome, premio) {
  document.getElementById('pwd-modal').classList.add('hidden');
  if (typeof puoModificare === 'function' && !puoModificare('gestione_punti')) {
    toast('Non hai il permesso di registrare premi');
    return;
  }
  try {
    await _insertPuntiEvento(nome, 0, 'premio', 'Premio consegnato: ' + premio);
    if (typeof _insertHrEvento === 'function') _insertHrEvento(nome, 'premio', 'Premio consegnato: ' + premio);
    _notificaIncentivo(nome, '🎁 Premio consegnato', nome + ': ' + premio);
    renderFormazione();
    toast('Premio registrato per ' + nome);
  } catch (e) {
    toast('Errore registrazione premio');
  }
}
async function eliminaPuntiEvento(id) {
  if (!confirm('Eliminare questo movimento punti?')) return;
  try {
    await secDel('punti_eventi', 'id=eq.' + id);
    puntiEventiCache = puntiEventiCache.filter((p) => p.id !== id);
    logAzione('Punti evento eliminato', 'ID ' + id);
    renderFormazione();
    toast('Eliminato');
  } catch (e) {
    toast('Errore eliminazione');
  }
}

// ================================================================
// EXPORT MATRICE
// ================================================================
function _matriceRows() {
  const comps = getCompetenzeReparto();
  const collabs = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const head = [
    'Collaboratore',
    ...comps.map((k) => k.label + ' (L' + k.livello + ')'),
    'Livello',
    'Punti ' + new Date().getFullYear(),
  ];
  const rows = collabs.map((c) => [
    c.nome,
    ...comps.map((k) => ((c.competenze || {})[k.key] === true ? 'SI' : '—')),
    livelloDiCollaboratore(c) || '—',
    puntiTotali(c.nome),
  ]);
  return { head, rows };
}
function esportaMatriceCSV() {
  const { head, rows } = _matriceRows();
  const blob = new Blob(
    ['﻿' + [head, ...rows].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'matrice_competenze_' + currentReparto + '_' + new Date().toISOString().split('T')[0] + '.csv',
  }).click();
  toast('Matrice CSV esportata!');
}
async function esportaMatricePDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const { head, rows } = _matriceRows();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;
  if (_logoB64)
    try {
      doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
    } catch (e) {}
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Matrice Competenze — Progetto Multidisciplinarità', pw / 2, y, {
    align: 'center',
  });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    'Reparto ' +
      currentReparto.charAt(0).toUpperCase() +
      currentReparto.slice(1) +
      ' — ' +
      new Date().toLocaleDateString('it-IT') +
      ' — Casino Lugano SA',
    pw / 2,
    y,
    { align: 'center' },
  );
  y += 8;
  doc.setTextColor(0);
  doc.autoTable({
    theme: 'grid',
    startY: y,
    margin: { left: 14, right: 14 },
    head: [head],
    body: rows,
    headStyles: {
      fillColor: [26, 18, 8],
      textColor: [250, 247, 242],
      fontSize: 8,
    },
    styles: {
      lineColor: [220, 215, 205],
      lineWidth: 0.15,
      fontSize: 8.5,
      cellPadding: 2.5,
      halign: 'center',
    },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [250, 247, 242] },
    didParseCell: function (d) {
      if (d.section === 'body' && d.cell.raw === 'SI') {
        d.cell.styles.textColor = [44, 110, 73];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA — Matrice competenze — Riservato', 14, doc.internal.pageSize.getHeight() - 8);
  mostraPdfPreview(doc, 'matrice_competenze_' + currentReparto + '.pdf', 'Matrice Competenze');
}

// Report annuale incentivi per HR: riepilogo per collaboratore + registro premi + movimenti punti
async function esportaReportIncentiviPDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const anno = parseInt((document.getElementById('ri-anno') || {}).value) || new Date().getFullYear();
  const azLabels = {};
  getPuntiConfig().azioni.forEach((a) => (azLabels[a.key] = a.label));
  azLabels.premio = 'Premio consegnato';
  azLabels.manuale = 'Assegnazione manuale';
  const eventi = getPuntiReparto().filter((p) => (p.data_evento || '').startsWith(String(anno)));
  const collabs = getCollaboratoriReparto();
  const righe = collabs
    .map((c) => {
      const premiCons = eventi.filter(
        (p) => p.azione === 'premio' && p.collaboratore.toLowerCase() === c.nome.toLowerCase(),
      );
      return {
        nome: c.nome,
        lv: livelloDiCollaboratore(c),
        punti: puntiTotali(c.nome, anno),
        cop: conteggioAzione(c.nome, 'copertura', anno),
        rif: conteggioAzione(c.nome, 'disponibilita_negata', anno),
        raggiunti: sogliePremiRaggiunti(c.nome, anno).join(', '),
        consegnati: premiCons.length,
      };
    })
    .filter((r) => r.punti !== 0 || r.lv > 0 || r.cop || r.rif || r.consegnati)
    .sort((a, b) => b.punti - a.punti);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;
  if (_logoB64)
    try {
      doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
    } catch (e) {}
  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Report Incentivi ' + anno + ' — Progetto Multidisciplinarità', pw / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    'Reparto ' +
      currentReparto.charAt(0).toUpperCase() +
      currentReparto.slice(1) +
      ' — generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' — Casino Lugano SA — Documento riservato HR',
    pw / 2,
    y,
    { align: 'center' },
  );
  y += 8;
  doc.setTextColor(0);
  const stiliTab = {
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242], fontSize: 8 },
    styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [250, 247, 242] },
  };
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Collaboratore', 'Livello', 'Punti ' + anno, 'Coperture', 'Rifiuti', 'Premi raggiunti', 'Consegnati']],
      body: righe.length
        ? righe.map((r) => [r.nome, r.lv ? 'L' + r.lv : '—', r.punti, r.cop, r.rif, r.raggiunti || '—', r.consegnati])
        : [['Nessun dato per il ' + anno, '', '', '', '', '', '']],
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    }),
  );
  y = doc.lastAutoTable.finalY + 10;
  const premi = eventi
    .filter((p) => p.azione === 'premio')
    .sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Registro premi consegnati', 14, y);
  y += 4;
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Data', 'Collaboratore', 'Premio', 'Registrato da']],
      body: premi.length
        ? premi.map((p) => [
            p.data_evento ? new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') : '',
            p.collaboratore,
            (p.descrizione || '').replace(/^Premio consegnato:\s*/, ''),
            p.operatore || '',
          ])
        : [['Nessun premio consegnato nel ' + anno, '', '', '']],
      columnStyles: { 1: { fontStyle: 'bold' } },
    }),
  );
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Movimenti punti ' + anno, 14, y);
  y += 4;
  doc.autoTable(
    Object.assign({}, stiliTab, {
      startY: y,
      head: [['Data', 'Collaboratore', 'Punti', 'Azione', 'Nota', 'Operatore']],
      body: eventi.length
        ? eventi
            .slice()
            .sort((a, b) => (b.data_evento || '').localeCompare(a.data_evento || ''))
            .map((p) => [
              p.data_evento ? new Date(p.data_evento + 'T12:00:00').toLocaleDateString('it-IT') : '',
              p.collaboratore,
              (p.punti > 0 ? '+' : '') + p.punti,
              azLabels[p.azione] || p.azione,
              p.descrizione || '',
              p.operatore || '',
            ])
        : [['Nessun movimento nel ' + anno, '', '', '', '', '']],
      columnStyles: { 2: { halign: 'center', fontStyle: 'bold' } },
    }),
  );
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text('Casino Lugano SA — Report incentivi — Riservato HR', 14, doc.internal.pageSize.getHeight() - 8);
  logAzione('Report incentivi', 'PDF esportato — reparto ' + currentReparto + ', anno ' + anno);
  mostraPdfPreview(doc, 'report_incentivi_' + currentReparto + '_' + anno + '.pdf', 'Report Incentivi');
}

// ================================================================
// CONFIG ADMIN (competenze per reparto + punti + soglie)
// ================================================================
function _renderFormazioneConfig() {
  const cfgC = getCompetenzeConfigAll();
  const cfgP = getPuntiConfig();
  let html = '<div class="settings-section"><h4>Configurazione (admin)</h4>';
  // competenze per reparto
  ['slots', 'tavoli', 'valet', 'cleaning'].forEach((rep) => {
    html +=
      '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:12px 0 6px">Competenze ' +
      rep +
      '</p>';
    (cfgC[rep] || []).forEach((k, i) => {
      html +=
        '<div class="tipo-item"><div class="tipo-item-name">' +
        escP(k.label) +
        ' <span class="tipo-item-default">(L' +
        k.livello +
        ')</span></div><button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2)" onclick="rinominaCompetenzaCfg(\'' +
        rep +
        "'," +
        i +
        ')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="rimuoviCompetenzaCfg(\'' +
        rep +
        "'," +
        i +
        ')">Rimuovi</button></div>';
    });
    html +=
      '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Nuova competenza</label><input type="text" id="cfg-comp-nome-' +
      rep +
      '" placeholder="Es: ' +
      (rep === 'tavoli'
        ? 'Chef de table'
        : rep === 'valet'
          ? 'Navetta clienti'
          : rep === 'cleaning'
            ? 'Sanificazione'
            : 'Tecnica slot') +
      '..."></div><div class="field"><label>Livello</label><select id="cfg-comp-lv-' +
      rep +
      '" style="padding:10px;width:90px"><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option><option value="0">Extra</option></select></div><button class="btn-add-tipo" onclick="aggiungiCompetenzaCfg(\'' +
      rep +
      '\')">+ Aggiungi</button></div>';
  });
  // punti azioni
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Azioni e punti</p>';
  cfgP.azioni.forEach((a, i) => {
    html +=
      '<div class="tipo-item"><div class="tipo-item-name">' +
      escP(a.label) +
      '</div><input type="number" value="' +
      a.punti +
      '" onchange="modificaPuntiAzione(' +
      i +
      ',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><button class="btn-del-tipo" style="margin-left:6px;color:var(--accent2);border-color:var(--accent2)" onclick="rinominaAzioneCfg(' +
      i +
      ')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="rimuoviAzioneCfg(' +
      i +
      ')">Rimuovi</button></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Nuova azione</label><input type="text" id="cfg-az-nome" placeholder="Es: Straordinario festivo..."></div><div class="field"><label>Punti</label><input type="number" id="cfg-az-punti" value="5" style="width:90px"></div><button class="btn-add-tipo" onclick="aggiungiAzioneCfg()">+ Aggiungi</button></div>';
  // soglie premi
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Soglie premi (punti annuali)</p>';
  cfgP.soglie.forEach((s, i) => {
    html +=
      '<div class="tipo-item"><input type="number" value="' +
      s.punti +
      '" onchange="modificaSoglia(' +
      i +
      ',\'punti\',this.value)" style="width:80px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><input type="text" value="' +
      escP(s.premio) +
      '" onchange="modificaSoglia(' +
      i +
      ',\'premio\',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><button class="btn-del-tipo" onclick="rimuoviSoglia(' +
      i +
      ')">Rimuovi</button></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Punti</label><input type="number" id="cfg-soglia-punti" value="100" style="width:90px"></div><div class="field"><label>Premio</label><input type="text" id="cfg-soglia-premio" placeholder="Es: Buono ristorante..."></div><button class="btn-add-tipo" onclick="aggiungiSoglia()">+ Aggiungi</button></div>';
  // premi livello
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Premi passaggio livello</p>';
  [2, 3].forEach((l) => {
    html +=
      '<div class="tipo-item"><div class="tipo-item-name">Livello ' +
      l +
      '</div><input type="text" value="' +
      escP(cfgP.premi_livello[String(l)] || '') +
      '" onchange="modificaPremioLivello(' +
      l +
      ',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></div>';
  });
  // notifiche incentivi
  html +=
    '<p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Notifiche incentivi</p>';
  html +=
    '<div class="tipo-item"><div class="tipo-item-name">Premi e passaggi di livello</div><select onchange="modificaNotificheCfg(this.value)" style="padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
    '<option value="privato"' +
    (cfgP.notifiche === 'privato' ? ' selected' : '') +
    '>Privato (solo interessato)</option><option value="tutti"' +
    (cfgP.notifiche === 'tutti' ? ' selected' : '') +
    '>Annuncio a tutti</option><option value="off"' +
    (cfgP.notifiche === 'off' ? ' selected' : '') +
    '>Disattivate</option></select></div>';
  html +=
    '<p style="font-size:.75rem;color:var(--muted);margin:4px 0 0">I punti personali arrivano sempre e solo all\'interessato (se ha un account operatore con notifiche attive). La scelta qui sopra riguarda premi raggiunti, premi consegnati e passaggi di livello. Per HR usa il pulsante "Report Incentivi PDF" nella sezione Traguardi.</p>';
  html += '</div>';
  return html;
}
async function modificaNotificheCfg(val) {
  const cfg = getPuntiConfig();
  cfg.notifiche = val === 'tutti' || val === 'off' ? val : 'privato';
  await savePuntiConfig(cfg);
  logAzione('Notifiche incentivi', 'Modalità: ' + cfg.notifiche);
  toast(
    'Notifiche incentivi: ' +
      (cfg.notifiche === 'tutti' ? 'annuncio a tutti' : cfg.notifiche === 'off' ? 'disattivate' : 'privato'),
  );
}
async function aggiungiCompetenzaCfg(rep) {
  const nome = (document.getElementById('cfg-comp-nome-' + rep) || {}).value.trim();
  const lv = parseInt((document.getElementById('cfg-comp-lv-' + rep) || {}).value) || 1;
  if (!nome) {
    toast('Inserisci un nome');
    return;
  }
  const cfg = getCompetenzeConfigAll();
  const key = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (cfg[rep].find((k) => k.key === key)) {
    toast('Competenza già esistente');
    return;
  }
  cfg[rep] = [...cfg[rep], { key, label: nome, livello: lv }];
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza config aggiunta', rep + ': ' + nome + ' (L' + lv + ')');
  renderFormazione();
  toast('Competenza aggiunta');
}
// Rinomina: cambia solo l'etichetta visualizzata; la chiave interna resta invariata,
// quindi le spunte già assegnate ai collaboratori vengono conservate.
async function rinominaCompetenzaCfg(rep, idx) {
  const cfg = getCompetenzeConfigAll();
  const k = cfg[rep][idx];
  if (!k) return;
  const nuovo = prompt('Nuovo nome per "' + k.label + '":', k.label);
  if (nuovo === null) return;
  const label = nuovo.trim();
  if (!label) {
    toast('Inserisci un nome');
    return;
  }
  const vecchio = k.label;
  cfg[rep][idx] = Object.assign({}, k, { label });
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza rinominata', rep + ': ' + vecchio + ' → ' + label);
  renderFormazione();
  toast(vecchio + ' → ' + label);
}
async function rimuoviCompetenzaCfg(rep, idx) {
  const cfg = getCompetenzeConfigAll();
  const k = cfg[rep][idx];
  if (!k) return;
  if (!confirm('Rimuovere "' + k.label + '"? Le spunte esistenti non verranno cancellate ma non saranno più visibili.'))
    return;
  cfg[rep] = cfg[rep].filter((_, i) => i !== idx);
  await saveCompetenzeConfig(cfg);
  logAzione('Competenza config rimossa', rep + ': ' + k.label);
  renderFormazione();
}
async function aggiungiAzioneCfg() {
  const nome = (document.getElementById('cfg-az-nome') || {}).value.trim();
  const punti = parseInt((document.getElementById('cfg-az-punti') || {}).value) || 0;
  if (!nome) {
    toast('Inserisci un nome');
    return;
  }
  const cfg = getPuntiConfig();
  const key = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  cfg.azioni = [...cfg.azioni, { key, label: nome, punti }];
  await savePuntiConfig(cfg);
  renderFormazione();
  toast('Azione aggiunta');
}
async function modificaPuntiAzione(idx, val) {
  const cfg = getPuntiConfig();
  if (!cfg.azioni[idx]) return;
  cfg.azioni[idx].punti = parseInt(val) || 0;
  await savePuntiConfig(cfg);
  toast('Punti aggiornati');
}
// Rinomina azione punti: cambia solo l'etichetta; il registro storico resta coerente
// perché i movimenti referenziano la chiave interna, non il nome.
async function rinominaAzioneCfg(idx) {
  const cfg = getPuntiConfig();
  const a = cfg.azioni[idx];
  if (!a) return;
  const nuovo = prompt('Nuovo nome per "' + a.label + '":', a.label);
  if (nuovo === null) return;
  const label = nuovo.trim();
  if (!label) {
    toast('Inserisci un nome');
    return;
  }
  const vecchio = a.label;
  cfg.azioni[idx] = Object.assign({}, a, { label });
  await savePuntiConfig(cfg);
  logAzione('Azione punti rinominata', vecchio + ' → ' + label);
  renderFormazione();
  toast(vecchio + ' → ' + label);
}
async function rimuoviAzioneCfg(idx) {
  const cfg = getPuntiConfig();
  const a = cfg.azioni[idx];
  if (!a) return;
  if (!confirm('Rimuovere "' + a.label + '"?')) return;
  cfg.azioni = cfg.azioni.filter((_, i) => i !== idx);
  await savePuntiConfig(cfg);
  renderFormazione();
}
async function aggiungiSoglia() {
  const punti = parseInt((document.getElementById('cfg-soglia-punti') || {}).value) || 0;
  const premio = ((document.getElementById('cfg-soglia-premio') || {}).value || '').trim();
  if (!punti || !premio) {
    toast('Compila punti e premio');
    return;
  }
  const cfg = getPuntiConfig();
  cfg.soglie = [...cfg.soglie, { punti, premio }].sort((a, b) => a.punti - b.punti);
  await savePuntiConfig(cfg);
  renderFormazione();
  toast('Soglia aggiunta');
}
async function modificaSoglia(idx, campo, val) {
  const cfg = getPuntiConfig();
  if (!cfg.soglie[idx]) return;
  cfg.soglie[idx][campo] = campo === 'punti' ? parseInt(val) || 0 : val;
  await savePuntiConfig(cfg);
  toast('Soglia aggiornata');
}
async function rimuoviSoglia(idx) {
  const cfg = getPuntiConfig();
  cfg.soglie = cfg.soglie.filter((_, i) => i !== idx);
  await savePuntiConfig(cfg);
  renderFormazione();
}
async function modificaPremioLivello(lv, val) {
  const cfg = getPuntiConfig();
  cfg.premi_livello[String(lv)] = val.trim();
  await savePuntiConfig(cfg);
  toast('Premio livello aggiornato');
}

// ================================================================
// POPUP COPERTURA MALATTIA
// Appare quando si registra una malattia (Diario o rapporto giornaliero):
// chiede chi copre il turno (+punti) e chi NON ha dato disponibilità (-punti).
// Ritorna una Promise risolta alla chiusura (per accodare più assenze).
// ================================================================
// Data di riferimento della copertura per una registrazione malattia:
// primo giorno del range se indicato nel testo, altrimenti la data della registrazione.
function _dataRifCopertura(entry) {
  const m = (entry.testo || '').match(/dal (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return (entry.data || '').substring(0, 10);
}
// Eventi copertura/rifiuto già registrati per una specifica assenza
function eventiCopertura(assente, dataRif) {
  if (!assente) return [];
  const dataLabel = dataRif ? new Date(dataRif + 'T12:00:00').toLocaleDateString('it-IT') : '';
  const nomeL = assente.toLowerCase();
  return getPuntiReparto().filter(
    (p) =>
      (p.azione === 'copertura' || p.azione === 'disponibilita_negata') &&
      (p.descrizione || '').toLowerCase().includes(nomeL) &&
      (p.descrizione || '').includes('del ' + dataLabel),
  );
}
// Badge riassuntivo per la riga del diario ("Coperto: X" / "Senza copertura" / rifiuti)
function badgeCoperturaHtml(entry) {
  const ev = eventiCopertura(entry.nome, _dataRifCopertura(entry));
  const cop = ev.find((p) => p.azione === 'copertura');
  const rifiuti = ev.filter((p) => p.azione === 'disponibilita_negata').length;
  let h = '';
  if (cop)
    h +=
      '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:#1a7a6d;color:white;border-radius:2px;font-size:.74rem;font-weight:700">Coperto: ' +
      escP(cop.collaboratore) +
      '</span>';
  else
    h +=
      '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:var(--muted);color:white;border-radius:2px;font-size:.74rem;font-weight:600">Senza copertura</span>';
  if (rifiuti)
    h +=
      '<span style="display:inline-block;margin-left:4px;padding:2px 8px;background:var(--accent);color:white;border-radius:2px;font-size:.74rem;font-weight:700">' +
      rifiuti +
      ' rifiut' +
      (rifiuti === 1 ? 'o' : 'i') +
      '</span>';
  return h;
}
function apriPopupCopertura(assente, dataRif) {
  return new Promise((resolve) => {
    window._copResolve = resolve;
    window._copCtx = { assente, dataRif: dataRif || new Date().toISOString().split('T')[0] };
    _renderPopupCopertura();
  });
}
function _renderPopupCopertura() {
  const ctx = window._copCtx;
  if (!ctx) return;
  const assente = ctx.assente;
  const collabs = getCollaboratoriReparto()
    .filter((c) => c.attivo !== false && c.nome.toLowerCase() !== (assente || '').toLowerCase())
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!collabs.length) {
    _chiudiPopupCopertura(false);
    return;
  }
  const cfg = getPuntiConfig();
  const azCop = cfg.azioni.find((a) => a.key === 'copertura');
  const azNeg = cfg.azioni.find((a) => a.key === 'disponibilita_negata');
  const dataLabel = ctx.dataRif ? new Date(ctx.dataRif + 'T12:00:00').toLocaleDateString('it-IT') : 'oggi';
  let html =
    '<h3>Copertura turno — ' +
    escP(assente) +
    '</h3><p style="color:var(--muted);font-size:.84rem;margin-bottom:14px">Assenza del ' +
    dataLabel +
    '. Se il turno non viene sostituito, chiudi con "Nessuna copertura".</p>';
  // Già registrato per questa assenza (con possibilità di rimuovere/correggere)
  const esistenti = eventiCopertura(assente, ctx.dataRif);
  if (esistenti.length) {
    html +=
      '<div style="margin-bottom:14px;padding:10px 12px;background:var(--paper2);border-radius:3px;border-left:3px solid var(--accent2)"><div style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:6px">Già registrato</div>' +
      esistenti
        .map(
          (p) =>
            '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.86rem"><strong>' +
            escP(p.collaboratore) +
            '</strong><span style="color:' +
            (p.punti < 0 ? 'var(--accent)' : '#1a7a6d') +
            ';font-weight:700">' +
            (p.punti > 0 ? '+' : '') +
            p.punti +
            '</span><span style="color:var(--muted);font-size:.78rem;flex:1">' +
            (p.azione === 'copertura' ? 'copertura' : 'rifiuto disponibilità') +
            '</span><button class="btn-act del" style="font-size:.68rem" onclick="_rimuoviEventoCopertura(' +
            p.id +
            ')">Rimuovi</button></div>',
        )
        .join('') +
      '</div>';
  }
  html +=
    '<div class="pwd-field"><label>Chi copre il turno' +
    (azCop ? ' (+' + azCop.punti + ' punti)' : '') +
    '</label><select id="cop-chi" style="width:100%;padding:10px;border:1.5px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option value="">— Nessuno / da decidere —</option>' +
    collabs.map((c) => '<option>' + escP(c.nome) + '</option>').join('') +
    '</select></div>';
  if (azNeg) {
    html +=
      '<div class="pwd-field"><label>Chi NON ha dato disponibilità (' +
      azNeg.punti +
      ' punti ciascuno)</label><div style="max-height:170px;overflow-y:auto;border:1px solid var(--line);border-radius:2px;padding:6px 10px;background:var(--paper2)">' +
      collabs
        .map(
          (c) =>
            '<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:.9rem"><input type="checkbox" class="cop-negato-cb" value="' +
            escP(c.nome).replace(/"/g, '&quot;') +
            '" style="width:16px;height:16px"> ' +
            escP(c.nome) +
            '</label>',
        )
        .join('') +
      '</div></div>';
  }
  html +=
    '<div class="pwd-field"><label>Nota (opzionale)</label><input type="text" id="cop-nota" placeholder="Es: doppio turno, chiamati in 3..."></div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="_chiudiPopupCopertura(false)">Nessuna copertura</button><button class="btn-modal-ok" onclick="_chiudiPopupCopertura(true)">Conferma</button></div>';
  html +=
    '<p style="font-size:.72rem;color:var(--muted);text-align:center;margin-top:8px">Puoi sempre assegnare o correggere i punti dopo, dalla pagina Formazione.</p>';
  document.getElementById('pwd-modal-content').innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _rimuoviEventoCopertura(id) {
  const p = puntiEventiCache.find((x) => x.id === id);
  if (!p) return;
  if (
    !confirm(
      'Rimuovere "' +
        (p.azione === 'copertura' ? 'copertura' : 'rifiuto') +
        '" di ' +
        p.collaboratore +
        ' (' +
        (p.punti > 0 ? '+' : '') +
        p.punti +
        ' punti)?',
    )
  )
    return;
  try {
    await secDel('punti_eventi', 'id=eq.' + id);
    puntiEventiCache = puntiEventiCache.filter((x) => x.id !== id);
    logAzione('Copertura rimossa', p.collaboratore + ' (' + p.punti + ' pt) — ' + (p.descrizione || ''));
    toast('Rimosso');
    _renderPopupCopertura();
    if (typeof render === 'function' && localStorage.getItem('pagina_corrente') === 'diario') render();
  } catch (e) {
    toast('Errore rimozione');
  }
}
async function _chiudiPopupCopertura(conferma) {
  const ctx = window._copCtx || {};
  const resolve = window._copResolve;
  const dataLabel = ctx.dataRif ? new Date(ctx.dataRif + 'T12:00:00').toLocaleDateString('it-IT') : '';
  if (conferma) {
    const chi = (document.getElementById('cop-chi') || {}).value || '';
    const nota = ((document.getElementById('cop-nota') || {}).value || '').trim();
    const negati = [...document.querySelectorAll('.cop-negato-cb:checked')].map((cb) => cb.value);
    const cfg = getPuntiConfig();
    const azCop = cfg.azioni.find((a) => a.key === 'copertura');
    const azNeg = cfg.azioni.find((a) => a.key === 'disponibilita_negata');
    // Chi copre non può essere anche tra i rifiuti
    const negatiValidi = negati.filter((n) => n !== chi);
    try {
      if (chi && azCop) {
        await _insertPuntiEvento(
          chi,
          azCop.punti,
          'copertura',
          'Copertura per ' + ctx.assente + ' del ' + dataLabel + (nota ? ' — ' + nota : ''),
        );
      }
      if (azNeg) {
        for (const n of negatiValidi) {
          await _insertPuntiEvento(
            n,
            azNeg.punti,
            'disponibilita_negata',
            'Disponibilità negata per assenza di ' + ctx.assente + ' del ' + dataLabel + (nota ? ' — ' + nota : ''),
          );
        }
      }
      const parti = [];
      if (chi && azCop) parti.push(chi + ' +' + azCop.punti);
      if (negatiValidi.length && azNeg)
        parti.push(negatiValidi.length + ' rifiut' + (negatiValidi.length === 1 ? 'o' : 'i') + ' ' + azNeg.punti);
      if (parti.length) toast('Punti registrati: ' + parti.join(' · '));
    } catch (e) {
      toast('Errore registrazione punti');
    }
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  window._copCtx = null;
  window._copResolve = null;
  // Aggiorna i badge copertura nelle righe del diario
  if (typeof render === 'function' && localStorage.getItem('pagina_corrente') === 'diario') render();
  if (resolve) resolve(!!conferma);
}

// Soglia (mesi di anzianità in più) per la segnalazione di equità categorie
async function salvaEquitaMesi(val) {
  const m = parseInt(val) || 6;
  equitaMesi = m;
  await setImp('equita_mesi', String(m));
  logAzione('Soglia equità categorie', m + ' mesi');
  renderFormazione();
  toast('Soglia equità: ' + m + ' mesi di anzianità');
}
