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
};

function getCompetenzeConfigAll() {
  const cfg = competenzeConfig && typeof competenzeConfig === 'object' ? competenzeConfig : COMPETENZE_DEFAULT;
  return {
    slots: Array.isArray(cfg.slots) ? cfg.slots : COMPETENZE_DEFAULT.slots,
    tavoli: Array.isArray(cfg.tavoli) ? cfg.tavoli : COMPETENZE_DEFAULT.tavoli,
  };
}
function getCompetenzeReparto() {
  return getCompetenzeConfigAll()[currentReparto === 'tavoli' ? 'tavoli' : 'slots'] || [];
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
  };
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
      '</strong></span></td>';
    comps.forEach((k) => {
      const on = (c.competenze || {})[k.key] === true;
      html +=
        '<td class="num"><input type="checkbox" ' +
        (on ? 'checked ' : '') +
        (adm ? '' : 'disabled ') +
        'onchange="toggleCompetenza(' +
        c.id +
        ",'" +
        k.key +
        '\',this)" style="width:18px;height:18px;accent-color:#2c6e49;cursor:' +
        (adm ? 'pointer' : 'default') +
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
  if (adm) {
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
  html += '<div class="main-card"><div class="card-header">Traguardi e premi</div><div style="padding:16px">';
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
          ? '<span style="font-size:.78rem;color:#2c6e49">🏆 ' + raggiunti.map(escP).join(', ') + '</span>'
          : '') +
        '</div></div>';
    });
  }
  html += '</div></div>';

  // CONFIG ADMIN
  if (adm) {
    html += _renderFormazioneConfig();
  }
  el.innerHTML = html;
}
function _filtraMatrice() {
  const q = ((document.getElementById('form-matr-cerca') || {}).value || '').toLowerCase();
  document.querySelectorAll('#matrice-competenze tbody tr').forEach((tr) => {
    tr.style.display = !q || (tr.dataset.matrNome || '').includes(q) ? '' : 'none';
  });
}

// Toggle spunta competenza (admin) + punti automatici + rilevamento passaggio livello
async function toggleCompetenza(collabId, key, cb) {
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
      const b = document.getElementById('pwd-modal-content');
      b.innerHTML =
        '<h3>🎉 ' +
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
}
async function assegnaPuntiRapido() {
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
    if (raggiunta) {
      setTimeout(() => {
        const b = document.getElementById('pwd-modal-content');
        b.innerHTML =
          '<h3>🏆 Traguardo raggiunto!</h3><p style="margin-bottom:14px"><strong>' +
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
  try {
    await _insertPuntiEvento(nome, 0, 'premio', 'Premio consegnato: ' + premio);
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

// ================================================================
// CONFIG ADMIN (competenze per reparto + punti + soglie)
// ================================================================
function _renderFormazioneConfig() {
  const cfgC = getCompetenzeConfigAll();
  const cfgP = getPuntiConfig();
  let html = '<div class="settings-section"><h4>Configurazione (admin)</h4>';
  // competenze per reparto
  ['slots', 'tavoli'].forEach((rep) => {
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
        ')</span></div><button class="btn-del-tipo" onclick="rimuoviCompetenzaCfg(\'' +
        rep +
        "'," +
        i +
        ')">Rimuovi</button></div>';
    });
    html +=
      '<div class="add-tipo-row" style="margin:6px 0 4px"><div class="field"><label>Nuova competenza</label><input type="text" id="cfg-comp-nome-' +
      rep +
      '" placeholder="Es: ' +
      (rep === 'tavoli' ? 'Chef de table' : 'Tecnica slot') +
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
      ',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><button class="btn-del-tipo" style="margin-left:6px" onclick="rimuoviAzioneCfg(' +
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
  html += '</div>';
  return html;
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
function apriPopupCopertura(assente, dataRif) {
  return new Promise((resolve) => {
    const collabs = getCollaboratoriReparto()
      .filter((c) => c.attivo !== false && c.nome.toLowerCase() !== (assente || '').toLowerCase())
      .sort((a, b) => a.nome.localeCompare(b.nome));
    if (!collabs.length) {
      resolve(false);
      return;
    }
    const cfg = getPuntiConfig();
    const azCop = cfg.azioni.find((a) => a.key === 'copertura');
    const azNeg = cfg.azioni.find((a) => a.key === 'disponibilita_negata');
    const dataLabel = dataRif ? new Date(dataRif + 'T12:00:00').toLocaleDateString('it-IT') : 'oggi';
    window._copResolve = resolve;
    window._copCtx = { assente, dataRif: dataRif || new Date().toISOString().split('T')[0] };
    let html =
      '<h3>Copertura turno — ' +
      escP(assente) +
      '</h3><p style="color:var(--muted);font-size:.84rem;margin-bottom:14px">Assenza del ' +
      dataLabel +
      '. Se il turno non viene sostituito, chiudi con "Nessuna copertura".</p>';
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
  });
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
  if (resolve) resolve(!!conferma);
}
