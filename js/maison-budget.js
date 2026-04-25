/**
 * Diario Collaboratori — Casino Lugano SA
 * File: maison-budget.js
 * Maison Budget: categorie, profilo cliente, scheda
 * Righe: 1141
 */

function renderMaisonBudgetUI() {
  const el = document.getElementById('maison-budget-list');
  if (!el) return;
  const _br = getBudgetReparto(),
    _mr = getMaisonRepartoExpanded();
  // Solo clienti con categoria assegnata (+ opzione per vedere tutti)
  const clientiCat = _br.filter((b) => b.categoria);
  const tuttiNomi = [...new Set(clientiCat.map((b) => b.nome))].sort();
  const nTotali = [...new Set([..._br.map((b) => b.nome), ..._mr.map((r) => r.nome)])].length;
  if (!tuttiNomi.length && !_mr.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessun cliente categorizzato</p><small>Clicca sul nome di un cliente nella tabella sopra per assegnare una categoria</small></div>';
    return;
  }
  let filtCat = (document.getElementById('maison-filt-cat-lista') || {}).value || '';
  const nFM = clientiCat.filter((b) => b.categoria === 'full_maison').length;
  const nM = clientiCat.filter((b) => b.categoria === 'maison').length;
  const nD = clientiCat.filter((b) => b.categoria === 'direzione').length;
  const nBU = clientiCat.filter((b) => b.categoria === 'bu').length;
  const nBL = clientiCat.filter((b) => b.categoria === 'bl').length;
  const _filtNomeBudget = (document.getElementById('maison-filt-nome-budget') || {}).value || '';
  let html =
    '<div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap"><select id="maison-filt-cat-lista" onchange="renderMaisonBudgetUI()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.85rem;background:var(--paper);color:var(--ink)"><option value="">Tutti categorizzati (' +
    tuttiNomi.length +
    ')</option><option value="full_maison"' +
    (filtCat === 'full_maison' ? ' selected' : '') +
    '>Full Maison (' +
    nFM +
    ')</option><option value="maison"' +
    (filtCat === 'maison' ? ' selected' : '') +
    '>Maison (' +
    nM +
    ')</option><option value="direzione"' +
    (filtCat === 'direzione' ? ' selected' : '') +
    '>Direzione (' +
    nD +
    ')</option><option value="bu"' +
    (filtCat === 'bu' ? ' selected' : '') +
    '>Buono Unico (' +
    nBU +
    ')</option><option value="bl"' +
    (filtCat === 'bl' ? ' selected' : '') +
    '>Buono Lounge (' +
    nBL +
    ')</option></select><input type="text" id="maison-filt-nome-budget" placeholder="Cerca cliente..." value="' +
    escP(_filtNomeBudget) +
    '" oninput="renderMaisonBudgetUI()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.85rem;background:var(--paper);color:var(--ink);width:180px"></div>';
  // Build client data
  const clients = tuttiNomi.map((nome) => {
    const b = _br.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const spent = _mr
      .filter((r) => r.nome.toLowerCase() === nome.toLowerCase())
      .reduce((s, r) => s + parseFloat(r.costo || 0), 0);
    const cat = b ? b.categoria || '' : '';
    return { nome, b, spent, cat };
  });
  // Filter
  let filtered = clients;
  if (filtCat) {
    filtered = clients.filter((c) => c.cat === filtCat);
  }
  if (_filtNomeBudget) {
    const _fnl = _filtNomeBudget.toLowerCase();
    filtered = filtered.filter((c) => c.nome.toLowerCase().includes(_fnl));
  }
  // Group by category
  const catDefs = [
    { key: 'full_maison', label: 'Full Maison', color: '#b8860b' },
    { key: 'maison', label: 'Maison', color: '#2980b9' },
    { key: 'direzione', label: 'Direzione', color: '#8e44ad' },
    { key: 'bu', label: 'Buono Unico', color: '#e67e22' },
    { key: 'bl', label: 'Buono Lounge', color: '#2c6e49' },
  ];
  function renderClientRow(c, idx) {
    const pct = c.b && c.b.budget_chf ? Math.round((c.spent / c.b.budget_chf) * 100) : 0;
    const pctColor = pct >= 100 ? 'var(--accent)' : pct >= 80 ? '#e67e22' : '#2c6e49';
    const borderColor =
      c.cat === 'full_maison'
        ? '#b8860b'
        : c.cat === 'maison'
          ? '#2980b9'
          : c.cat === 'direzione'
            ? '#8e44ad'
            : c.cat === 'bu'
              ? '#e67e22'
              : c.cat === 'bl'
                ? '#2c6e49'
                : 'var(--muted)';
    const nascitaLabel =
      c.b && c.b.data_nascita
        ? new Date(c.b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
        : '';
    const isBday = c.b ? _isCompleannoOggi(c.b.data_nascita) : false;
    const ne = c.nome.replace(/'/g, "\\'");
    const budgetBar =
      c.b && c.b.budget_chf
        ? '<div class="budget-bar"><div class="budget-bar-fill" style="width:' +
          Math.min(pct, 100) +
          '%;background:' +
          pctColor +
          '"></div></div>'
        : '';
    const bgColor =
      c.cat === 'full_maison'
        ? 'rgba(184,134,11,0.15)'
        : c.cat === 'maison'
          ? 'rgba(41,128,185,0.15)'
          : c.cat === 'direzione'
            ? 'rgba(142,68,173,0.15)'
            : c.cat === 'bu'
              ? 'rgba(230,126,34,0.15)'
              : c.cat === 'bl'
                ? 'rgba(44,110,73,0.15)'
                : idx % 2
                  ? 'rgba(0,0,0,0.03)'
                  : 'var(--paper)';
    const _catBadgeRow = c.cat
      ? '<span class="mini-badge" style="background:' +
        borderColor +
        ';font-size:.7rem;margin-left:6px">' +
        ({ full_maison: 'Full Maison', maison: 'Maison', direzione: 'Direzione', bu: 'BU', bl: 'BL' }[c.cat] || '') +
        '</span>'
      : '';
    return (
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' +
      bgColor +
      ';border-radius:3px;margin-bottom:4px;border-left:3px solid ' +
      borderColor +
      ';flex-wrap:wrap"><span style="font-weight:600;min-width:150px;cursor:pointer" class="entry-name" onclick="apriDettaglioMaison(\'' +
      ne +
      '\')">' +
      escP(c.nome) +
      _catBadgeRow +
      (isBday ? ' <span style="font-size:1.1rem">&#127874;</span>' : '') +
      '</span>' +
      (c.spent ? '<span style="font-size:.82rem;color:var(--muted)">' + fmtCHF(c.spent) + ' CHF</span>' : '') +
      (c.b && c.b.budget_chf
        ? '<span style="font-size:.82rem;color:' + pctColor + ';font-weight:600">' + pct + '%</span>' + budgetBar
        : '') +
      (nascitaLabel ? '<span style="font-size:.82rem;color:var(--muted)">&#127874; ' + nascitaLabel + '</span>' : '') +
      (c.b
        ? '<button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2);font-size:.72rem" onclick="modificaMaisonInfo(' +
          c.b.id +
          ')">Modifica</button>'
        : '<button class="btn-del-tipo" style="color:#2980b9;border-color:#2980b9;font-size:.72rem" onclick="assegnaCatRapida(\'' +
          ne +
          '\')">Assegna</button>') +
      (c.b
        ? '<button class="btn-del-tipo" style="font-size:.72rem" onclick="rimuoviMaisonBudget(' +
          c.b.id +
          ')">Rimuovi</button>'
        : '') +
      '</div>'
    );
  }
  if (filtCat) {
    html += filtered.map(renderClientRow).join('');
  } else {
    catDefs.forEach((cd) => {
      const group = filtered.filter((c) => c.cat === cd.key);
      if (!group.length) return;
      html +=
        '<div class="cat-group-header" style="color:' +
        cd.color +
        ';border-bottom-color:' +
        cd.color +
        '">' +
        cd.label +
        ' <span class="cat-count" style="background:' +
        cd.color +
        '">' +
        group.length +
        '</span></div>';
      html += group.map(renderClientRow).join('');
    });
  }
  el.innerHTML = html;
  // Ripristina focus sul campo ricerca se era attivo
  if (_filtNomeBudget) {
    const _ri = document.getElementById('maison-filt-nome-budget');
    if (_ri) {
      _ri.focus();
      _ri.setSelectionRange(_ri.value.length, _ri.value.length);
    }
  }
}
async function salvaMaisonBudget() {
  const nome = capitalizzaNome(document.getElementById('maison-budget-nome').value.trim());
  const chf = parseFloat(document.getElementById('maison-budget-chf').value) || null;
  const bu = parseInt(document.getElementById('maison-budget-bu').value) || null;
  const bl = parseInt(document.getElementById('maison-budget-bl').value) || null;
  const nascita = _getNascitaValue('maison-budget-nascita') || null;
  const cat = document.getElementById('maison-budget-cat').value || '';
  if (!nome) {
    toast('Inserisci il nome del cliente');
    return;
  }
  if (!chf && !bu && !bl && !nascita && !cat) {
    toast('Imposta almeno un campo');
    return;
  }
  if (getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Già esistente per ' + nome + '. Rimuovi prima il vecchio.');
    return;
  }
  try {
    const r = await secPost('maison_budget', {
      nome,
      budget_chf: chf,
      budget_bu: bu,
      budget_bl: bl,
      data_nascita: nascita,
      categoria: cat,
      reparto_dip: currentReparto,
      aggiornato_da: getOperatore(),
      aggiornato_at: new Date().toISOString(),
    });
    maisonBudgetCache.push(r[0]);
    document.getElementById('maison-budget-nome').value = '';
    document.getElementById('maison-budget-chf').value = '';
    document.getElementById('maison-budget-bu').value = '';
    document.getElementById('maison-budget-bl').value = '';
    const nbFp = document.getElementById('maison-budget-nascita');
    if (nbFp && nbFp._flatpickr) nbFp._flatpickr.clear();
    else if (nbFp) nbFp.value = '';
    renderMaisonBudgetUI();
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    toast('Budget impostato per ' + nome);
  } catch (e) {
    toast('Errore salvataggio budget');
  }
}
function assegnaCatRapida(nome) {
  const mc = document.getElementById('pwd-modal-content');
  mc.innerHTML =
    '<h3>Assegna categoria</h3><p style="color:var(--muted);margin-bottom:16px">' +
    escP(nome) +
    '</p><div style="display:flex;flex-direction:column;gap:10px"><button class="btn-salva" style="background:#b8860b" onclick="salvaAssegnaCat(\'' +
    nome.replace(/'/g, "\\'") +
    '\',\'full_maison\')">Full Maison</button><button class="btn-salva" style="background:#2980b9" onclick="salvaAssegnaCat(\'' +
    nome.replace(/'/g, "\\'") +
    '\',\'maison\')">Maison</button><button class="btn-salva" style="background:#8e44ad" onclick="salvaAssegnaCat(\'' +
    nome.replace(/'/g, "\\'") +
    '\',\'direzione\')">Direzione</button><button class="btn-salva" style="background:#e67e22" onclick="salvaAssegnaCat(\'' +
    nome.replace(/'/g, "\\'") +
    '\',\'bu\')">Buono Unico</button><button class="btn-salva" style="background:#2c6e49" onclick="salvaAssegnaCat(\'' +
    nome.replace(/'/g, "\\'") +
    "','bl')\">Buono Lounge</button><button class=\"btn-modal-cancel\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden')\">Annulla</button></div>";
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaAssegnaCat(nome, cat) {
  try {
    const r = await secPost('maison_budget', {
      nome,
      categoria: cat,
      reparto_dip: currentReparto,
      aggiornato_da: getOperatore(),
      aggiornato_at: new Date().toISOString(),
    });
    maisonBudgetCache.push(r[0]);
    document.getElementById('pwd-modal').classList.add('hidden');
    renderMaisonBudgetUI();
    renderMaisonDashboard();
    logAzione('Categoria maison', nome + ' → ' + cat);
    toast(
      nome +
        ' → ' +
        (cat === 'full_maison'
          ? 'Full Maison'
          : cat === 'maison'
            ? 'Maison'
            : cat === 'direzione'
              ? 'Direzione'
              : cat === 'bu'
                ? 'Buono Unico'
                : cat === 'bl'
                  ? 'Buono Lounge'
                  : cat)
    );
  } catch (e) {
    toast('Errore assegnazione categoria');
  }
}
function modificaMaisonInfo(id) {
  const b = maisonBudgetCache.find((x) => x.id === id);
  if (!b) return;
  const mc = document.getElementById('pwd-modal-content');
  const nascitaDisplay = b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '';
  mc.innerHTML =
    '<h3>Modifica info cliente</h3><div class="pwd-field"><label>Cliente</label><input type="text" value="' +
    escP(b.nome) +
    '" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Categoria</label><select id="edit-mb-cat" style="width:100%;padding:8px"><option value=""' +
    (b.categoria === '' || !b.categoria ? ' selected' : '') +
    '>—</option><option value="maison"' +
    (b.categoria === 'maison' ? ' selected' : '') +
    '>Maison</option><option value="full_maison"' +
    (b.categoria === 'full_maison' ? ' selected' : '') +
    '>Full Maison</option><option value="direzione"' +
    (b.categoria === 'direzione' ? ' selected' : '') +
    '>Direzione</option><option value="bu"' +
    (b.categoria === 'bu' ? ' selected' : '') +
    '>Buono Unico</option><option value="bl"' +
    (b.categoria === 'bl' ? ' selected' : '') +
    '>Buono Lounge</option></select></div><div style="display:flex;gap:10px"><div class="pwd-field" style="flex:1"><label>Budget CHF/mese</label><input type="number" id="edit-mb-chf" value="' +
    (b.budget_chf || '') +
    '" step="0.01"></div><div class="pwd-field" style="flex:1"><label>Max BU/mese</label><input type="number" id="edit-mb-bu" value="' +
    (b.budget_bu || '') +
    '"></div><div class="pwd-field" style="flex:1"><label>Max BL/mese</label><input type="number" id="edit-mb-bl" value="' +
    (b.budget_bl || '') +
    '"></div></div><p style="font-size:.78rem;color:var(--muted);margin:4px 0 8px">I valori sono mensili. Per il controllo annuale il sistema moltiplica &times;12.</p><div class="pwd-field"><label>Data nascita</label><input type="text" id="edit-mb-nascita" value="' +
    nascitaDisplay +
    '" placeholder="es: 12.01.1997"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaMaisonInfo(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  _initNascitaInput('edit-mb-nascita');
  if (b.data_nascita) {
    const el = document.getElementById('edit-mb-nascita');
    if (el) el.dataset.isoValue = b.data_nascita;
  }
}
async function salvaModificaMaisonInfo(id) {
  const cat = document.getElementById('edit-mb-cat').value || '';
  const chf = parseFloat(document.getElementById('edit-mb-chf').value) || null;
  const bu = parseInt(document.getElementById('edit-mb-bu').value) || null;
  const bl = parseInt(document.getElementById('edit-mb-bl').value) || null;
  const nascita = _getNascitaValue('edit-mb-nascita') || null;
  try {
    await secPatch('maison_budget', 'id=eq.' + id, {
      categoria: cat,
      budget_chf: chf,
      budget_bu: bu,
      budget_bl: bl,
      data_nascita: nascita,
      aggiornato_da: getOperatore(),
      aggiornato_at: new Date().toISOString(),
    });
    const b = maisonBudgetCache.find((x) => x.id === id);
    if (b) {
      b.categoria = cat;
      b.budget_chf = chf;
      b.budget_bu = bu;
      b.budget_bl = bl;
      b.data_nascita = nascita;
    }
    document.getElementById('pwd-modal').classList.add('hidden');
    renderMaisonBudgetUI();
    renderMaisonDashboard();
    logAzione('Modifica info maison', 'ID ' + id);
    toast('Info aggiornate');
  } catch (e) {
    toast('Errore aggiornamento info');
  }
}
function apriListaClientiMaison() {
  const _br = getBudgetReparto();
  const fullM = _br.filter((b) => b.categoria === 'full_maison').sort((a, b) => a.nome.localeCompare(b.nome));
  const maison = _br.filter((b) => b.categoria === 'maison').sort((a, b) => a.nome.localeCompare(b.nome));
  const direz = _br.filter((b) => b.categoria === 'direzione').sort((a, b) => a.nome.localeCompare(b.nome));
  const buCat = _br.filter((b) => b.categoria === 'bu').sort((a, b) => a.nome.localeCompare(b.nome));
  const blCat = _br.filter((b) => b.categoria === 'bl').sort((a, b) => a.nome.localeCompare(b.nome));
  const tot = fullM.length + maison.length + direz.length + buCat.length + blCat.length;
  let html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:4px">Clienti Categorizzati</h3><p style="color:var(--muted);font-size:.82rem">' +
    tot +
    ' clienti — ' +
    fullM.length +
    ' Full Maison — ' +
    maison.length +
    ' Maison — ' +
    direz.length +
    ' Direzione — ' +
    buCat.length +
    ' BU — ' +
    blCat.length +
    ' BL</p></div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  html +=
    '<div style="display:flex;gap:10px;margin-bottom:16px"><button class="btn-export" onclick="esportaListaMaisonCSV()" style="font-size:.78rem;padding:5px 14px">CSV</button><button class="btn-export btn-export-pdf" onclick="esportaListaMaisonPDF()" style="font-size:.78rem;padding:5px 14px">PDF</button></div>';
  function renderCatBlock(items, label, color) {
    if (!items.length) return '';
    let h =
      '<div style="margin-bottom:16px"><div style="font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:' +
      color +
      ';font-weight:700;margin-bottom:8px;border-bottom:2px solid ' +
      color +
      ';padding-bottom:4px">' +
      label +
      ' (' +
      items.length +
      ')</div>';
    items.forEach(function (b) {
      var nascita = b.data_nascita
        ? '  —  &#127874; ' +
          new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
        : '';
      h +=
        '<div style="padding:8px 12px;margin-bottom:4px;border-radius:3px;border-left:3px solid ' +
        color +
        ';background:' +
        color +
        '0F;display:flex;align-items:center;gap:10px"><strong>' +
        escP(b.nome) +
        '</strong>' +
        nascita +
        '</div>';
    });
    return h + '</div>';
  }
  html += renderCatBlock(fullM, 'Full Maison', '#b8860b');
  html += renderCatBlock(maison, 'Maison', '#2980b9');
  html += renderCatBlock(direz, 'Direzione', '#8e44ad');
  html += renderCatBlock(buCat, 'Buono Unico', '#e67e22');
  html += renderCatBlock(blCat, 'Buono Lounge', '#2c6e49');
  if (!tot)
    html +=
      '<p style="color:var(--muted);text-align:center;padding:20px">Nessun cliente categorizzato. Assegna le categorie dalla scheda clienti.</p>';
  document.getElementById('profilo-content').innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
}
function esportaListaMaisonCSV() {
  const _br = getBudgetReparto();
  if (!_br.length) {
    toast('Nessun cliente');
    return;
  }
  const rows = [['Cliente', 'Categoria', 'Budget CHF', 'Max BU', 'Max BL', 'Data nascita']];
  _br.forEach((b) => {
    rows.push([
      b.nome,
      b.categoria === 'full_maison' ? 'Full Maison' : b.categoria === 'maison' ? 'Maison' : '',
      b.budget_chf || '',
      b.budget_bu || '',
      b.budget_bl || '',
      b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '',
    ]);
  });
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' }
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'clienti_maison.csv',
  }).click();
  toast('Lista CSV esportata!');
}
async function esportaListaMaisonPDF() {
  const _br = getBudgetReparto();
  if (!_br.length) {
    toast('Nessun cliente');
    return;
  }
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  try {
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
    doc.setFontSize(16);
    doc.text('Clienti Maison', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Casino Lugano SA — ' + _br.length + ' clienti', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    const catOrder = ['full_maison', 'maison', 'direzione', 'bu', 'bl'];
    const sorted = _br
      .filter((b) => b.categoria)
      .sort((a, b) => catOrder.indexOf(a.categoria) - catOrder.indexOf(b.categoria) || a.nome.localeCompare(b.nome));
    const body = sorted.map((b) => [
      b.nome,
      b.categoria === 'full_maison'
        ? 'Full Maison'
        : b.categoria === 'maison'
          ? 'Maison'
          : b.categoria === 'direzione'
            ? 'Direzione'
            : b.categoria === 'bu'
              ? 'Buono Unico'
              : b.categoria === 'bl'
                ? 'Buono Lounge'
                : '—',
      b.budget_chf ? parseFloat(b.budget_chf).toFixed(0) : '—',
      b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '',
    ]);
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: 16, right: 16 },
      head: [['Cliente', 'Categoria', 'Budget CHF', 'Nascita']],
      body,
      headStyles: { fillColor: [26, 18, 8] },
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 10, cellPadding: 4 },
      didParseCell: function (d) {
        if (d.section === 'body' && d.column.index === 1) {
          if (d.cell.raw === 'Full Maison') {
            d.cell.styles.textColor = [184, 134, 11];
            d.cell.styles.fontStyle = 'bold';
          } else if (d.cell.raw === 'Maison') {
            d.cell.styles.textColor = [41, 128, 185];
            d.cell.styles.fontStyle = 'bold';
          } else if (d.cell.raw === 'Direzione') {
            d.cell.styles.textColor = [142, 68, 173];
            d.cell.styles.fontStyle = 'bold';
          } else if (d.cell.raw === 'Buono Unico') {
            d.cell.styles.textColor = [230, 126, 34];
            d.cell.styles.fontStyle = 'bold';
          } else if (d.cell.raw === 'Buono Lounge') {
            d.cell.styles.textColor = [44, 110, 73];
            d.cell.styles.fontStyle = 'bold';
          }
        }
      },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — Clienti Maison — Pag. ' + i + '/' + tp, 16, doc.internal.pageSize.getHeight() - 8);
    }
    mostraPdfPreview(doc, 'clienti_maison.pdf', 'Lista Clienti Maison');
  } catch (e) {
    toast('Errore PDF');
  }
}
// IMPORTA CATEGORIE DA FILE EXCEL (Maison slots)
async function importaCategorieMaison(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const XLSX = window.XLSX;
  if (!XLSX) {
    toast('Libreria XLSX non caricata');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const catMap = {}; // {nome: categoria}
    // Cerca in tutti i fogli
    for (const sn of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      if (!data.length) continue;
      // Trova riga intestazione con le categorie
      let catCols = {}; // {colIdx: categoria}
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j++) {
          const v = String(row[j]).trim().toUpperCase();
          if (v.includes('FULL MAISON')) catCols[j] = 'full_maison';
          else if (v === 'MAISON' || (v.includes('MAISON') && !v.includes('FULL') && !v.includes('BUON')))
            catCols[j] = 'maison';
          else if (v.includes('BUONI LOUNGE') || v.includes('BUONO LOUNGE') || v === 'BL') catCols[j] = 'bl';
          else if (v.includes('BUONO UNICO') || v.includes('BUONI UNICI') || v === 'BU') catCols[j] = 'bu';
          else if (v.includes('DIREZIONE')) catCols[j] = 'direzione';
        }
      }
      if (!Object.keys(catCols).length) continue;
      // Parole da escludere (non sono nomi cliente)
      const _escludiNomi =
        /^(consumazion|mangia|slot[is]?|buoni|full|maison|direzione|buono|lounge|unic[oi]|unici|tavol[oi]|bar|ristorante|totale|note|data|nome|cognome|px|costo|gruppo)$/i;
      // Per ogni colonna con nomi, traccia la categoria corrente (può cambiare con sub-header)
      const catGroups = {};
      // Identifica le colonne nomi (colonna adiacente a quella con intestazione categoria)
      const colToCat = {}; // {colIdx: catIniziale}
      for (const [ci, cat] of Object.entries(catCols)) {
        const colIdx = parseInt(ci);
        // La colonna nomi è tipicamente quella dopo l'intestazione, o la stessa
        if (!catCols[colIdx + 1]) colToCat[colIdx + 1] = cat;
        colToCat[colIdx] = cat;
      }
      // Leggi riga per riga, aggiorna la categoria se trovi un sub-header
      const activeCat = {}; // {colIdx: categoriaCorrente}
      for (const [ci, cat] of Object.entries(colToCat)) activeCat[ci] = cat;
      for (let i = 1; i < data.length; i++) {
        for (const ci of Object.keys(colToCat)) {
          const cc = parseInt(ci);
          const v = String(data[i][cc] || '').trim();
          if (!v) continue;
          const vUp = v.toUpperCase().replace(/\*+/g, '').trim();
          // Sub-header? Cambia la categoria per questa colonna
          if (vUp.includes('BUONO UNICO') || vUp.includes('BUONI UNICI') || vUp === 'BU') {
            activeCat[cc] = 'bu';
            continue;
          }
          if (vUp.includes('BUONI LOUNGE') || vUp.includes('BUONO LOUNGE')) {
            activeCat[cc] = 'bl';
            continue;
          }
          if (vUp.includes('FULL MAISON')) {
            activeCat[cc] = 'full_maison';
            continue;
          }
          if (vUp === 'MAISON') {
            activeCat[cc] = 'maison';
            continue;
          }
          if (vUp === 'DIREZIONE') {
            activeCat[cc] = 'direzione';
            continue;
          }
          // CONSUMAZIONI/MANGIA AL BAR = non è una categoria, disattiva
          if (vUp.includes('CONSUMAZION') || vUp.includes('MANGIA AL BAR')) {
            activeCat[cc] = null;
            continue;
          }
          // Salta marcatori tipo BL/BU isolati e parole non-nome
          if (/^(BL|BU|CG|WL)$/i.test(vUp)) continue;
          if (_escludiNomi.test(vUp)) continue;
          // Pulisci e aggiungi
          let nome = v
            .replace(/\*+/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();
          if (!nome || nome.length < 2) continue;
          const cat = activeCat[cc];
          if (!cat) continue;
          if (!catGroups[cat]) catGroups[cat] = new Set();
          if (nome.includes('/')) {
            nome.split('/').forEach((n) => {
              n = n.trim();
              if (n && n.length >= 3 && !_escludiNomi.test(n)) catGroups[cat].add(capitalizzaNome(n));
            });
          } else if (nome.length >= 3) {
            catGroups[cat].add(capitalizzaNome(nome));
          }
        }
      }
      for (const [cat, nomi] of Object.entries(catGroups)) {
        for (const nome of nomi) {
          if (nome.length >= 3) catMap[nome] = cat;
        }
      }
    }
    const nomi = Object.keys(catMap);
    if (!nomi.length) {
      toast('Nessun cliente trovato nel file');
      return;
    }
    // Mostra anteprima professionale
    const mc = document.getElementById('pwd-modal-content');
    const byCat = {};
    nomi.forEach((n) => {
      const c = catMap[n];
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(n.trim());
    });
    const catLabels = {
      full_maison: 'Full Maison',
      maison: 'Maison',
      bl: 'Buono Lounge',
      bu: 'Buono Unico',
      direzione: 'Direzione',
    };
    const catColors = { full_maison: '#b8860b', maison: '#2980b9', bl: '#2c6e49', bu: '#e67e22', direzione: '#8e44ad' };
    const esist = nomi.filter((n) =>
      maisonBudgetCache.find(
        (b) => b.nome.toLowerCase() === n.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto
      )
    );
    const nNuovi = nomi.length - esist.length;
    let prev =
      '<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Categorie Clienti</h3><p style="color:var(--muted);font-size:.84rem">File: ' +
      escP(file.name) +
      '</p></div>';
    // KPI cards
    prev += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">' +
      nomi.length +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Totale</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2c6e49">' +
      nNuovi +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Nuovi</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--accent2)">' +
      esist.length +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Aggiornati</div></div>';
    prev += '</div>';
    // Categorie con lista espandibile
    prev += '<div style="max-height:350px;overflow-y:auto">';
    for (const [cat, lista] of Object.entries(byCat)) {
      lista.sort();
      prev += '<div style="margin-bottom:12px;border-left:3px solid ' + catColors[cat] + ';padding-left:12px">';
      prev +=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="mini-badge" style="background:' +
        catColors[cat] +
        ';font-size:.82rem;padding:3px 10px">' +
        catLabels[cat] +
        '</span><span style="font-size:.82rem;color:var(--muted)">' +
        lista.length +
        ' clienti</span></div>';
      prev += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      lista.forEach((n) => {
        const isExist = esist.includes(n);
        prev +=
          '<span style="font-size:.78rem;padding:2px 8px;border-radius:2px;background:' +
          (isExist ? catColors[cat] + '15' : 'var(--paper2)') +
          ';color:' +
          (isExist ? catColors[cat] : 'var(--ink)') +
          ';border:1px solid ' +
          (isExist ? catColors[cat] + '40' : 'var(--line)') +
          '">' +
          escP(n) +
          (isExist ? ' &#8635;' : '') +
          '</span>';
      });
      prev += '</div></div>';
    }
    prev += '</div>';
    // Barra progresso (nascosta)
    prev +=
      '<div id="import-cat-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-cat-bar" style="height:100%;width:0%;background:#b8860b;border-radius:3px;transition:width .2s"></div></div><p id="import-cat-status" style="text-align:center;font-size:.82rem;color:var(--muted);margin-top:4px"></p></div>';
    prev +=
      '<div id="import-cat-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-cat">Importa ' +
      nomi.length +
      ' clienti</button></div>';
    mc.innerHTML = prev;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('btn-conf-import-cat').onclick = async function () {
      document.getElementById('import-cat-btns').style.display = 'none';
      document.getElementById('import-cat-progress').style.display = 'block';
      const bar = document.getElementById('import-cat-bar');
      const status = document.getElementById('import-cat-status');
      // Refresh cache dal server per evitare duplicati
      status.textContent = 'Caricamento dati...';
      try {
        maisonBudgetCache = await secGet('maison_budget?order=nome.asc');
      } catch (e) {}
      let nuovi = 0,
        aggiornati = 0,
        errori = 0,
        done = 0;
      for (const nome of nomi) {
        const cat = catMap[nome];
        const existing = maisonBudgetCache.find(
          (b) => b.nome.toLowerCase() === nome.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto
        );
        if (existing) {
          if (existing.categoria !== cat) {
            try {
              await secPatch('maison_budget', 'id=eq.' + existing.id, {
                categoria: cat,
                aggiornato_da: getOperatore(),
                aggiornato_at: new Date().toISOString(),
              });
              existing.categoria = cat;
              aggiornati++;
            } catch (e) {
              errori++;
            }
          }
        } else {
          try {
            const postData = { nome: nome, categoria: cat, reparto_dip: currentReparto };
            try {
              postData.aggiornato_da = getOperatore();
              postData.aggiornato_at = new Date().toISOString();
            } catch (e2) {}
            const r = await secPost('maison_budget', postData);
            if (r && r.length && r[0] && r[0].id) {
              maisonBudgetCache.push(r[0]);
              nuovi++;
            } else {
              // secPost ritornò dati vuoti, riprova senza campi extra
              const r2 = await secPost('maison_budget', { nome: nome, categoria: cat, reparto_dip: currentReparto });
              if (r2 && r2.length && r2[0] && r2[0].id) {
                maisonBudgetCache.push(r2[0]);
                nuovi++;
              } else {
                errori++;
              }
            }
          } catch (e) {
            console.error('Import cat errore:', nome, e.message);
            errori++;
          }
        }
        done++;
        bar.style.width = Math.round((done / nomi.length) * 100) + '%';
        status.textContent = done + '/' + nomi.length + ' — ' + escP(nome);
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 50));
      }
      // Riepilogo finale
      mc.innerHTML =
        '<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">' +
        (errori ? '&#9888;' : '&#9989;') +
        '</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Importazione completata</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">' +
        nuovi +
        '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Nuovi</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent2)">' +
        aggiornati +
        '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Aggiornati</div></div>' +
        (errori
          ? '<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent)">' +
            errori +
            '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Errori</div></div>'
          : '') +
        '</div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione('Importa categorie', nomi.length + ' clienti (' + nuovi + ' nuovi, ' + aggiornati + ' aggiornati)');
    };
  } catch (e) {
    toast('Errore lettura file: ' + e.message);
  }
}
// IMPORTA COMPLEANNI DA FILE EXCEL
async function importaCompleanniMaison(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const XLSX = window.XLSX;
  if (!XLSX) {
    toast('Libreria XLSX non caricata');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const compleanni = []; // [{nome, data}]
    const mesiIt = [
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
    for (const sn of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
      if (!data.length) continue;
      // Formato: coppie colonne (nome, data) per ogni mese
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j += 2) {
          const nomeRaw = String(row[j] || '').trim();
          const cellVal = row[j + 1];
          // Salta intestazioni mese
          if (!nomeRaw || mesiIt.includes(nomeRaw.toUpperCase()) || nomeRaw.toUpperCase() === 'COMPLEANNI') continue;
          if (cellVal === undefined || cellVal === null || cellVal === '') continue;
          // Parsa la data in vari formati
          let isoDate = null;
          // Se è un oggetto Date (cellDates:true) — usa getFullYear/Month/Date locali per evitare shift UTC
          if (cellVal instanceof Date && !isNaN(cellVal)) {
            isoDate =
              cellVal.getFullYear() +
              '-' +
              String(cellVal.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(cellVal.getDate()).padStart(2, '0');
          }
          // Se è un numero seriale Excel
          if (!isoDate && typeof cellVal === 'number' && cellVal > 1000 && cellVal < 100000) {
            const d = new Date((cellVal - 25569) * 86400000 + 43200000);
            if (!isNaN(d))
              isoDate =
                d.getFullYear() +
                '-' +
                String(d.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(d.getDate()).padStart(2, '0');
          }
          // Se è stringa
          if (!isoDate && typeof cellVal === 'string') {
            const dataRaw = cellVal.trim();
            // YYYY-MM-DD HH:MM:SS o YYYY-MM-DD
            const dm = dataRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dm) isoDate = dm[1] + '-' + dm[2] + '-' + dm[3];
            // DD.MM.YYYY o DD/MM/YYYY
            if (!isoDate) {
              const dm2 = dataRaw.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
              if (dm2) isoDate = dm2[3] + '-' + dm2[2].padStart(2, '0') + '-' + dm2[1].padStart(2, '0');
            }
            // MM-DD-YY o MM/DD/YY (formato mm-dd-yy di Excel)
            if (!isoDate) {
              const dm3 = dataRaw.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
              if (dm3) {
                let y = parseInt(dm3[3]);
                if (y < 100) y += y > 50 ? 1900 : 2000;
                isoDate = y + '-' + dm3[1].padStart(2, '0') + '-' + dm3[2].padStart(2, '0');
              }
            }
          }
          if (!isoDate) continue;
          // Pulisci nome
          let nome = capitalizzaNome(nomeRaw.replace(/\*+/g, '').trim());
          if (nome.length < 2) continue;
          compleanni.push({ nome, data: isoDate });
        }
      }
    }
    if (!compleanni.length) {
      toast('Nessun compleanno trovato nel file');
      return;
    }
    // Fuzzy match con nomi esistenti in maison_budget
    const matched = [];
    const nonTrovati = [];
    compleanni.forEach((c) => {
      // Match esatto
      let found = maisonBudgetCache.find(
        (b) => b.nome.toLowerCase() === c.nome.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto
      );
      if (!found) {
        // Fuzzy match con Levenshtein
        const sim = _trovaNomeSimileMaison(c.nome);
        if (sim)
          found = maisonBudgetCache.find(
            (b) =>
              b.nome.toLowerCase() === (sim.nome || sim).toLowerCase() && (b.reparto_dip || 'slots') === currentReparto
          );
      }
      if (found) matched.push({ ...c, budgetId: found.id, nomeDB: found.nome, isNew: false });
      else matched.push({ ...c, budgetId: null, nomeDB: null, isNew: true });
    });
    const nuovi = matched.filter((m) => m.isNew);
    const esistenti = matched.filter((m) => !m.isNew);
    // Mostra anteprima professionale
    const mc = document.getElementById('pwd-modal-content');
    const mesiNomi = [
      'Gennaio',
      'Febbraio',
      'Marzo',
      'Aprile',
      'Maggio',
      'Giugno',
      'Luglio',
      'Agosto',
      'Settembre',
      'Ottobre',
      'Novembre',
      'Dicembre',
    ];
    let prev =
      '<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Compleanni</h3><p style="color:var(--muted);font-size:.84rem">File: ' +
      escP(file.name) +
      '</p></div>';
    // KPI cards
    prev += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">' +
      compleanni.length +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Compleanni</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2c6e49">' +
      esistenti.length +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Clienti esistenti</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:#2980b9">' +
      nuovi.length +
      '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Familiari / Nuovi</div></div>';
    prev += '</div>';
    // Raggruppa per mese
    const byMese = {};
    matched.forEach((m) => {
      const d = new Date(m.data + 'T12:00:00');
      const k = d.getMonth();
      if (!byMese[k]) byMese[k] = [];
      byMese[k].push(m);
    });
    prev += '<div style="max-height:350px;overflow-y:auto">';
    for (let mi = 0; mi < 12; mi++) {
      if (!byMese[mi] || !byMese[mi].length) continue;
      const lista = byMese[mi].sort((a, b) => {
        const da = new Date(a.data + 'T12:00:00').getDate();
        const db = new Date(b.data + 'T12:00:00').getDate();
        return da - db;
      });
      prev +=
        '<div style="margin-bottom:12px"><div style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:#b8860b;font-weight:700;margin-bottom:6px;border-bottom:1px solid var(--line);padding-bottom:4px">' +
        mesiNomi[mi] +
        ' (' +
        lista.length +
        ')</div>';
      prev += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      lista.forEach((m) => {
        const d = new Date(m.data + 'T12:00:00');
        const giorno = d.getDate();
        const bg = m.isNew ? 'rgba(41,128,185,0.1)' : 'rgba(44,110,73,0.1)';
        const border = m.isNew ? '#2980b9' : '#2c6e49';
        const isRename =
          !m.isNew &&
          m.nomeDB &&
          m.nome.length > m.nomeDB.length &&
          m.nome.toLowerCase().startsWith(m.nomeDB.split(/\s+/)[0].toLowerCase());
        const fuzzyNote =
          !m.isNew && m.nome !== m.nomeDB
            ? ' title="DB: ' + escP(m.nomeDB) + (isRename ? ' → ' + escP(m.nome) : '') + '" style="cursor:help"'
            : '';
        prev +=
          '<span style="font-size:.78rem;padding:3px 8px;border-radius:2px;background:' +
          bg +
          ';border:1px solid ' +
          border +
          '30;display:inline-flex;align-items:center;gap:4px"' +
          fuzzyNote +
          '><strong style="color:' +
          border +
          '">' +
          giorno +
          '</strong> ' +
          escP(m.nome) +
          (m.isNew ? ' <span style="font-size:.65rem;color:#2980b9;font-weight:700">NEW</span>' : '') +
          (isRename ? ' <span style="font-size:.65rem;color:#e67e22;font-weight:700">&#8593;</span>' : '') +
          '</span>';
      });
      prev += '</div></div>';
    }
    prev += '</div>';
    // Barra progresso
    prev +=
      '<div id="import-compl-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-compl-bar" style="height:100%;width:0%;background:#8e44ad;border-radius:3px;transition:width .2s"></div></div><p id="import-compl-status" style="text-align:center;font-size:.82rem;color:var(--muted);margin-top:4px"></p></div>';
    prev +=
      '<div id="import-compl-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-compl">Importa ' +
      compleanni.length +
      ' compleanni</button></div>';
    mc.innerHTML = prev;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('btn-conf-import-compl').onclick = async function () {
      document.getElementById('import-compl-btns').style.display = 'none';
      document.getElementById('import-compl-progress').style.display = 'block';
      const bar = document.getElementById('import-compl-bar');
      const status = document.getElementById('import-compl-status');
      let nAggiornati = 0,
        nNuovi = 0,
        nErrori = 0,
        done = 0;
      for (const m of matched) {
        if (m.budgetId) {
          try {
            const updateData = {
              data_nascita: m.data,
              aggiornato_da: getOperatore(),
              aggiornato_at: new Date().toISOString(),
            };
            // Arricchisci nome: se il file ha cognome+nome e il DB ha solo cognome, aggiorna
            const b = maisonBudgetCache.find((x) => x.id === m.budgetId);
            if (
              b &&
              m.nome.length > b.nome.length &&
              m.nome.toLowerCase().startsWith(b.nome.split(/\s+/)[0].toLowerCase())
            )
              updateData.nome = m.nome;
            await secPatch('maison_budget', 'id=eq.' + m.budgetId, updateData);
            if (b) {
              b.data_nascita = m.data;
              if (updateData.nome) b.nome = updateData.nome;
            }
            nAggiornati++;
          } catch (e) {
            nErrori++;
          }
        } else {
          try {
            const r = await secPost('maison_budget', {
              nome: m.nome,
              data_nascita: m.data,
              reparto_dip: currentReparto,
              aggiornato_da: getOperatore(),
              aggiornato_at: new Date().toISOString(),
            });
            if (r && r.length && r[0] && r[0].id) maisonBudgetCache.push(r[0]);
            nNuovi++;
          } catch (e) {
            nErrori++;
          }
        }
        done++;
        bar.style.width = Math.round((done / matched.length) * 100) + '%';
        status.textContent = done + '/' + matched.length + ' — ' + escP(m.nome);
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 50));
      }
      // Riepilogo finale
      mc.innerHTML =
        '<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">' +
        (nErrori ? '&#9888;' : '&#127874;') +
        '</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Compleanni importati</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">' +
        nAggiornati +
        '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Aggiornati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2980b9">' +
        nNuovi +
        '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Nuovi / Familiari</div></div>' +
        (nErrori
          ? '<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--accent)">' +
            nErrori +
            '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Errori</div></div>'
          : '') +
        '</div><p style="font-size:.84rem;color:var(--muted)">I compleanni appariranno nella dashboard e nelle notifiche.</p><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')" style="margin-top:12px">Chiudi</button></div>';
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione('Importa compleanni', compleanni.length + ' (' + nAggiornati + ' aggiornati, ' + nNuovi + ' nuovi)');
    };
  } catch (e) {
    toast('Errore lettura file: ' + e.message);
  }
}
// RIALLINEA NOMI: corregge nomi vecchi in costi_maison e spese_extra usando maison_budget come riferimento
// Correggi solo il cognome, non aggiungere nome di battesimo
function _soloCorrezioneCognome(nomeVecchio, matchBudget) {
  const tokensVecchio = nomeVecchio.trim().split(/\s+/);
  const tokensBudget = matchBudget.trim().split(/\s+/);
  // Se il vecchio è solo cognome e il budget ha cognome+nome, usa il cognome corretto (non aggiungere nome)
  // MA se il cognome è identico, ritorna il cognome (nessuna correzione ortografica necessaria)
  if (tokensVecchio.length === 1) {
    const cogCorretto = capitalizzaNome(tokensBudget[0]);
    if (cogCorretto.toLowerCase() === nomeVecchio.toLowerCase()) return nomeVecchio; // stesso cognome, nessun fix ortografico
    return cogCorretto;
  }
  return tokensVecchio
    .map((tv) => {
      const best =
        tokensBudget.find((tb) => tb.toLowerCase() === tv.toLowerCase()) ||
        tokensBudget.find((tb) => _levenshtein(tv.toLowerCase(), tb.toLowerCase()) <= 1) ||
        tokensBudget.find((tb) => tb.toLowerCase().replace(/\s/g, '') === tv.toLowerCase().replace(/\s/g, ''));
      return best ? capitalizzaNome(best) : capitalizzaNome(tv);
    })
    .join(' ');
}
