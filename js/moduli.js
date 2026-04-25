/**
 * Diario Collaboratori — Casino Lugano SA
 * File: moduli.js
 */

// ================================================================
// SEZIONE 8: MODULI DISCIPLINARI
// Allineamento, Apprezzamento, RDI — form e PDF
// ================================================================
// MODULI DISCIPLINARI
function apriModulo(tipo) {
  const area = document.getElementById('modulo-form-area');
  area.style.display = 'block';
  const op = getOperatore() || '';
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let html = '<div class="main-card" style="margin-top:18px"><div class="card-header">';
  const aiBox =
    '<div class="ai-gen-box" style="margin-bottom:16px;padding:14px;background:linear-gradient(135deg,rgba(102,126,234,.08),rgba(118,75,162,.08));border:1.5px solid rgba(102,126,234,.25);border-radius:6px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:1.1rem">&#9733;</span><strong style="font-size:.92rem">Genera con AI</strong><span style="font-size:.78rem;color:var(--muted)">Descrivi la situazione e l\'AI compila tutti i campi</span></div><textarea id="ai-gen-prompt" placeholder="Es: Cognome Nome – cassa – acquisto crediti senza documento – cliente non identificato – 22:45 – 08.03.2026 – 2000 CHF – LOG 7834&#10;&#10;Oppure: Cognome Nome – valet – alle 23:10 ha consegnato il veicolo sbagliato al cliente – 05.03.2026 – IR 4521" style="width:100%;min-height:70px;padding:10px;border:1px solid var(--line);border-radius:4px;font-size:.88rem;background:var(--paper);color:var(--ink);resize:vertical"></textarea><div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn-ai" id="btn-ai-gen" onclick="generaModuloAI(\'' +
    tipo +
    '\')">Genera tutti i campi</button><button class="btn-ai" onclick="document.getElementById(\'modulo-foto-input\').click()" style="background:linear-gradient(135deg,#b8860b,#d4a017)">Allega foto per AI</button><input type="file" id="modulo-foto-input" accept="image/*" style="display:none" onchange="moduloFotoPreview(this)"><span id="modulo-foto-name" style="font-size:.78rem;color:var(--muted)"></span><button id="modulo-foto-remove" onclick="moduloFotoRimuovi()" style="display:none;background:none;border:1px solid var(--accent);color:var(--accent);padding:2px 8px;border-radius:2px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:Source Sans 3,sans-serif">X</button><span id="ai-gen-status" style="font-size:.78rem;color:var(--muted)"></span></div><div id="modulo-foto-preview" style="display:none;margin-top:8px"><img id="modulo-foto-img" style="max-width:200px;max-height:140px;border-radius:3px;border:1px solid var(--line)"></div></div>';
  if (tipo === 'allineamento') {
    html += 'Rilevamento di non conformità e colloquio di allineamento</div><div style="padding:18px">';
    html += aiBox;
    html +=
      '<div class="modulo-field"><label>Collaboratore</label><div class="ac-wrap"><input type="text" id="mod-collaboratore" placeholder="Nome collaboratore..." oninput="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')" onfocus="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')"><div class="ac-drop" id="ac-mod-nomi"></div></div></div>';
    html +=
      '<div class="modulo-field"><label>Resp. Settore</label><input type="text" id="mod-resp" value="Sig.ra Fertitta Lara"></div>';
    html += '<div class="modulo-field"><label>Data</label><input type="text" id="mod-data" value="' + oggi + '"></div>';
    html +=
      '<div class="modulo-field"><label>Non conformità rilevata (descrizione)</label><textarea id="mod-non-conf" placeholder="Descrizione della non conformità..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-non-conf\',\'non conformità\')">Migliora testo con AI</button></div></div>';
    html +=
      '<div class="modulo-field"><label>Obiettivo concordato onde evitare il ripetersi della non conformità</label><textarea id="mod-obiettivo" placeholder="Obiettivo concordato..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-obiettivo\',\'obiettivo concordato\')">Migliora testo con AI</button></div></div>';
    html +=
      '<div class="modulo-field"><label>Scadenza</label><input type="text" id="mod-scadenza" placeholder="Termine di verifica..."></div>';
  } else if (tipo === 'apprezzamento') {
    html += 'Colloquio di apprezzamento</div><div style="padding:18px">';
    html += aiBox;
    html +=
      '<div class="modulo-field"><label>Collaboratore</label><div class="ac-wrap"><input type="text" id="mod-collaboratore" placeholder="Nome collaboratore..." oninput="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')" onfocus="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')"><div class="ac-drop" id="ac-mod-nomi"></div></div></div>';
    html +=
      '<div class="modulo-field"><label>Resp. Settore</label><input type="text" id="mod-resp" value="Sig.ra Fertitta Lara"></div>';
    html += '<div class="modulo-field"><label>Data</label><input type="text" id="mod-data" value="' + oggi + '"></div>';
    html +=
      '<div class="modulo-field"><label>Descrizione</label><textarea id="mod-descrizione" placeholder="Descrizione dell\'apprezzamento..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-descrizione\',\'apprezzamento\')">Migliora testo con AI</button></div></div>';
    html +=
      '<div class="modulo-field"><label>Osservazioni da parte del Resp. Settore</label><textarea id="mod-osservazioni" placeholder="Osservazioni..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-osservazioni\',\'osservazioni\')">Migliora testo con AI</button></div></div>';
  } else if (tipo === 'rdi') {
    html += 'Rapporto disciplinare interno (RDI)</div><div style="padding:18px">';
    html += aiBox;
    html +=
      '<div class="modulo-field"><label>Collaboratore</label><div class="ac-wrap"><input type="text" id="mod-collaboratore" placeholder="Nome collaboratore..." oninput="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')" onfocus="acFiltra(\'mod-collaboratore\',\'ac-mod-nomi\')"><div class="ac-drop" id="ac-mod-nomi"></div></div></div>';
    html +=
      '<div class="modulo-field"><label>Resp. Settore</label><input type="text" id="mod-resp" value="Sig.ra Fertitta Lara"></div>';
    html += '<div class="modulo-field"><label>Data</label><input type="text" id="mod-data" value="' + oggi + '"></div>';
    html +=
      '<div class="modulo-field"><label>Non conformità rilevata</label><textarea id="mod-non-conf" placeholder="Descrizione della non conformità..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-non-conf\',\'non conformità\')">Migliora testo con AI</button></div></div>';
    html +=
      '<div class="modulo-field"><label>Obiettivo concordato onde evitare il ripetersi della non conformità</label><textarea id="mod-obiettivo" placeholder="Obiettivo concordato..."></textarea><div class="btn-ai-wrap"><button class="btn-ai" onclick="miglioraTesto(\'mod-obiettivo\',\'obiettivo concordato\')">Migliora testo con AI</button></div></div>';
    html +=
      '<div class="modulo-field"><label>Scadenza (termine di verifica)</label><input type="text" id="mod-scadenza" placeholder="Termine di verifica..."></div>';
    html +=
      '<div class="modulo-field"><label>Livello RDI</label><select id="mod-livello"><option value="I">I° livello</option><option value="II">II° livello (grave)</option></select></div>';
  }
  html +=
    '<div class="modulo-field" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><label>Modalit\u00E0 firma</label><div style="display:flex;gap:18px;margin-bottom:8px"><label style="display:flex;align-items:center;gap:5px;font-size:.88rem;cursor:pointer"><input type="radio" name="firma-tipo" value="cartacea" checked onchange="toggleFirmaDigitale()"> &#128221; Cartacea (stampa e firma a mano)</label><label style="display:flex;align-items:center;gap:5px;font-size:.88rem;cursor:pointer"><input type="radio" name="firma-tipo" value="digitale" onchange="toggleFirmaDigitale()"> &#9999;&#65039; Digitale (firma sullo schermo)</label></div><div id="firma-digitale-box" style="display:none"><div class="firma-canvas-wrap"><div class="firma-canvas-box"><small>Firma Resp. Settore</small><canvas id="firma-resp-canvas" class="firma-canvas" width="560" height="200"></canvas><button onclick="clearFirma(\'firma-resp-canvas\')">Cancella</button></div><div class="firma-canvas-box"><small>Firma Collaboratore</small><canvas id="firma-collab-canvas" class="firma-canvas" width="560" height="200"></canvas><button onclick="clearFirma(\'firma-collab-canvas\')">Cancella</button></div></div></div></div>';
  html +=
    '<div style="display:flex;gap:12px;margin-top:18px"><button class="btn-salva" onclick="generaModuloPDF(\'' +
    tipo +
    '\')">Genera PDF</button><button class="btn-modal-cancel" onclick="chiudiModulo()">Annulla</button></div>';
  html += '</div></div>';
  area.innerHTML = html;
  area.scrollIntoView({ behavior: 'smooth' });
  applicaVisibilita();
  // Auto-resize textarea in base al contenuto
  setTimeout(() => {
    area.querySelectorAll('textarea').forEach((ta) => {
      ta.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.max(80, this.scrollHeight) + 'px';
      });
      // Resize iniziale se ha già contenuto
      if (ta.value) {
        ta.style.height = 'auto';
        ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
      }
    });
  }, 100);
}
function chiudiModulo() {
  document.getElementById('modulo-form-area').style.display = 'none';
  document.getElementById('modulo-form-area').innerHTML = '';
  window._editModuloId = null;
}
// FIRMA DIGITALE
function toggleFirmaDigitale() {
  const d = document.querySelector('input[name="firma-tipo"][value="digitale"]');
  const box = document.getElementById('firma-digitale-box');
  if (!d || !box) return;
  box.style.display = d.checked ? '' : 'none';
  if (d.checked)
    setTimeout(() => {
      initFirmaCanvas('firma-resp-canvas');
      initFirmaCanvas('firma-collab-canvas');
    }, 50);
}
function initFirmaCanvas(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c || c._firmInit) return;
  c._firmInit = true;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#1a1208';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false,
    lx = 0,
    ly = 0;
  function gp(e) {
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width,
      sy = c.height / r.height;
    if (e.touches) {
      const t = e.touches[0];
      return [(t.clientX - r.left) * sx, (t.clientY - r.top) * sy];
    }
    return [e.offsetX * sx, e.offsetY * sy];
  }
  c.addEventListener('mousedown', (e) => {
    drawing = true;
    [lx, ly] = gp(e);
  });
  c.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const [x, y] = gp(e);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lx, ly] = [x, y];
  });
  c.addEventListener('mouseup', () => (drawing = false));
  c.addEventListener('mouseleave', () => (drawing = false));
  c.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      drawing = true;
      [lx, ly] = gp(e);
    },
    { passive: false },
  );
  c.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (!drawing) return;
      const [x, y] = gp(e);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(x, y);
      ctx.stroke();
      [lx, ly] = [x, y];
    },
    { passive: false },
  );
  c.addEventListener(
    'touchend',
    (e) => {
      e.preventDefault();
      drawing = false;
    },
    { passive: false },
  );
}
function clearFirma(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}
function getFirmaB64(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) return c.toDataURL('image/png');
  }
  return null;
}
function loadFirmaToCanvas(canvasId, b64) {
  const c = document.getElementById(canvasId);
  if (!c || !b64) return;
  const ctx = c.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  };
  img.src = b64;
}
let _logoB64 = null;
async function _loadLogo() {
  try {
    const r = await fetch('logo_casino.png');
    if (!r.ok) return;
    const b = await r.blob();
    _logoB64 = await new Promise((res) => {
      const rd = new FileReader();
      rd.onloadend = () => res(rd.result);
      rd.readAsDataURL(b);
    });
  } catch (e) {}
}
async function generaModuloPDF(tipo) {
  // Cattura SUBITO i flag, prima di qualsiasi await (race condition con ristampaModuloPDF)
  const _isRistampaSnap = !!window._isRistampa;
  const _isEditSnap = !!window._editModuloId;
  let collab = capitalizzaNome((document.getElementById('mod-collaboratore') || {}).value || '');
  const resp = (document.getElementById('mod-resp') || {}).value || '';
  const data = (document.getElementById('mod-data') || {}).value || '';
  if (!collab) {
    toast('Inserisci il nome del collaboratore');
    _highlightField('mod-collaboratore');
    return;
  }
  collab = await _verificaNome(collab);
  document.getElementById('mod-collaboratore').value = collab;
  // Firma digitale
  const isDigFirma = document.querySelector('input[name="firma-tipo"][value="digitale"]');
  const _fResp = isDigFirma && isDigFirma.checked ? getFirmaB64('firma-resp-canvas') : null;
  const _fCollab = isDigFirma && isDigFirma.checked ? getFirmaB64('firma-collab-canvas') : null;
  // QR code ID
  const existingQr = window._editModuloId && moduliCache.find((x) => x.id === window._editModuloId);
  const moduloQrId =
    existingQr && existingQr.dati && existingQr.dati.qr_code
      ? existingQr.dati.qr_code
      : Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mx = 20;
  let y = 12;
  // Logo Casino Lugano (ratio 1.78:1)
  if (_logoB64)
    try {
      const lw = 40,
        lh = lw / 1.78;
      doc.addImage(_logoB64, 'PNG', pw / 2 - lw / 2, y, lw, lh);
    } catch (e) {}
  y += 28;
  function checkPage(need) {
    if (y + need > ph - 25) {
      doc.addPage();
      y = 20;
      return true;
    }
    return false;
  }
  // Tabella intestazione (come Word)
  function drawHeaderTable() {
    const tw = pw - mx * 2,
      col1 = 42;
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: mx, right: mx },
      tableWidth: tw,
      body: [
        ['Collaboratore', collab],
        ['Resp. Settore', resp],
        ['Data', data],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9.5,
        cellPadding: { top: 2, bottom: 2, left: 4, right: 4 },
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
      },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: col1 }, 1: { fontStyle: 'normal' } },
      didDrawPage: function () {},
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  // Sezione con titolo sottolineato (come Word)
  function drawSection(title, text) {
    const maxW = pw - mx * 2;
    checkPage(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    const titleLines = doc.splitTextToSize(title, maxW);
    doc.text(titleLines, mx, y);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    titleLines.forEach(function (line, i) {
      const lw2 = doc.getTextWidth(line);
      doc.line(mx, y + 1.2 + i * 4.5, mx + lw2, y + 1.2 + i * 4.5);
    });
    y += titleLines.length * 4.5 + 4;
    if (text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(0);
      const lines = doc.splitTextToSize(text, maxW);
      lines.forEach(function (line) {
        checkPage(5);
        doc.text(line, mx, y);
        y += 4;
      });
      y += 2;
    } else {
      y += 4;
    }
    y += 2;
  }
  if (tipo === 'allineamento') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text('Rilevamento di non conformit\u00E0 e colloquio di allineamento', mx, y);
    y += 8;
    drawHeaderTable();
    const nonConf = (document.getElementById('mod-non-conf') || {}).value || '';
    drawSection('Non conformit\u00E0 rilevata', nonConf);
    const obiettivo = (document.getElementById('mod-obiettivo') || {}).value || '';
    drawSection(
      'Obiettivo concordato tra Collaboratore e Resp. Settore onde evitare il ripetersi della non conformit\u00E0',
      obiettivo,
    );
    const scad = (document.getElementById('mod-scadenza') || {}).value || '';
    checkPage(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    const scLabel = 'Scadenza';
    doc.text(scLabel, mx, y);
    const scW = doc.getTextWidth(scLabel);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(mx, y + 1.2, mx + scW, y + 1.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      " (termine di verifica entro il quale si \u00E8 concordato di raggiungere l'obiettivo di cui sopra)",
      mx + scW,
      y,
    );
    y += 6;
    if (scad) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(0);
      doc.text(scad, mx, y);
      y += 5;
    } else {
      y += 4;
    }
    y += 3;
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(60);
    const scadTxt = scad && scad.toLowerCase() !== 'a partire da subito' ? scad : 'a partire da subito';
    doc.text('Chiediamo che, ' + scadTxt + ", venga raggiunto l'obiettivo di cui sopra.", mx, y);
    y += 10;
    checkPage(25);
    const fy1 = drawFirmePro(doc, mx, y, pw, false, _fResp, _fCollab);
    y = fy1 + 14;
    checkPage(15);
    drawDistribuzionePro(doc, mx, y, ['Diario di bordo del collaboratore', 'Resp. Settore']);
  } else if (tipo === 'apprezzamento') {
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text('Colloquio di apprezzamento', mx, y);
    y += 8;
    drawHeaderTable();
    const desc = (document.getElementById('mod-descrizione') || {}).value || '';
    drawSection('Descrizione', desc);
    const oss = (document.getElementById('mod-osservazioni') || {}).value || '';
    drawSection('Osservazioni da parte del Resp. Settore', oss);
    y += 6;
    checkPage(30);
    const fy2 = drawFirmePro(doc, mx, y, pw, false, _fResp, _fCollab);
    y = fy2 + 20;
    checkPage(15);
    drawDistribuzionePro(doc, mx, y, ['Diario di bordo del collaboratore', 'Resp. Settore']);
  } else if (tipo === 'rdi') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text('Rapporto disciplinare interno (RDI)', mx, y);
    y += 8;
    drawHeaderTable();
    const nonConf = (document.getElementById('mod-non-conf') || {}).value || '';
    drawSection('Non conformit\u00E0 rilevata', nonConf);
    const obiettivo = (document.getElementById('mod-obiettivo') || {}).value || '';
    drawSection(
      'Obiettivo concordato tra Collaboratore e Resp. Settore onde evitare il ripetersi della non conformit\u00E0',
      obiettivo,
    );
    const scad = (document.getElementById('mod-scadenza') || {}).value || '';
    checkPage(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    const scLbl2 = 'Scadenza';
    doc.text(scLbl2, mx, y);
    const scW2 = doc.getTextWidth(scLbl2);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(mx, y + 1.2, mx + scW2, y + 1.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      " (termine di verifica entro il quale si \u00E8 concordato di raggiungere l'obiettivo di cui sopra)",
      mx + scW2,
      y,
    );
    y += 6;
    if (scad) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(0);
      doc.text(scad, mx, y);
      y += 5;
    } else {
      y += 4;
    }
    y += 3;
    const livello = (document.getElementById('mod-livello') || {}).value || 'I';
    checkPage(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    const rdiLabel = 'Il presente RDI vale quale';
    doc.text(rdiLabel, mx, y);
    const rdiLW = doc.getTextWidth(rdiLabel);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(mx, y + 1.2, mx + rdiLW, y + 1.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(' (segnare ci\u00F2 che fa al caso)', mx + rdiLW, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const rb = 1.8;
    const cx1 = mx + rb;
    const txtX = mx + 9;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.setFillColor(0);
    doc.circle(cx1, y - 1, rb, 'S');
    if (livello === 'I') {
      doc.circle(cx1, y - 1, rb * 0.55, 'F');
    }
    doc.text('rapporto disciplinare interno di I\u00B0 livello', txtX, y);
    y += 6;
    doc.circle(cx1, y - 1, rb, 'S');
    if (livello === 'II') {
      doc.circle(cx1, y - 1, rb * 0.55, 'F');
    }
    doc.text('rapporto disciplinare interno grave (II\u00B0 livello)', txtX, y);
    y += 10;
    checkPage(35);
    const firmaY = drawFirmePro(doc, mx, y, pw, true, _fResp, _fCollab);
    y = firmaY + 6;
    const mid = pw / 2;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80);
    const notaLines = doc.splitTextToSize(
      '* il collaboratore che non vuole sottoscrivere il rapporto disciplinare lo deve espressamente dichiarare, scrivendolo al posto della firma.',
      pw - mid - 10 - mx,
    );
    doc.text(notaLines, mid + 10, y);
    y += notaLines.length * 3 + 8;
    checkPage(15);
    drawDistribuzionePro(doc, mx, y, ['Resp. Settore', 'Resp. Risorse Umane']);
  }
  // QR Code in basso a destra dell'ultima pagina
  try {
    if (isVis('qr_code') && typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData('https://digit-diary.github.io/#modulo/' + moduloQrId);
      qr.make();
      const qrImg = qr.createDataURL(4, 0);
      const qrSz = 22;
      const tp = doc.internal.getNumberOfPages();
      doc.setPage(tp);
      doc.addImage(qrImg, 'PNG', pw - mx - qrSz, ph - 14 - qrSz, qrSz, qrSz);
      doc.setFontSize(5.5);
      doc.setTextColor(130);
      doc.setFont('helvetica', 'normal');
      doc.text('Scansiona per verificare', pw - mx - qrSz, ph - 11);
      doc.text('digit-diary.github.io/#modulo/' + moduloQrId, pw - mx - qrSz, ph - 8);
    }
  } catch (e) {}
  mostraPdfPreview(
    doc,
    'Modulo_' +
      tipo.charAt(0).toUpperCase() +
      tipo.slice(1) +
      '_' +
      collab.replace(/\s+/g, '_') +
      '_' +
      data.replace(/\//g, '-') +
      '.pdf',
    'Modulo ' + tipo.charAt(0).toUpperCase() + tipo.slice(1) + ' — ' + collab,
  );
  // Salva/aggiorna nel database
  const dati = { qr_code: moduloQrId };
  if (_fResp) dati.firma_resp = _fResp;
  if (_fCollab) dati.firma_collab = _fCollab;
  dati.firma_digitale = !!(isDigFirma && isDigFirma.checked);
  if (tipo === 'allineamento' || tipo === 'rdi') {
    dati.non_conformita = (document.getElementById('mod-non-conf') || {}).value || '';
    dati.obiettivo = (document.getElementById('mod-obiettivo') || {}).value || '';
    dati.scadenza = (document.getElementById('mod-scadenza') || {}).value || '';
    if (tipo === 'rdi') dati.livello = (document.getElementById('mod-livello') || {}).value || 'I';
  } else if (tipo === 'apprezzamento') {
    dati.descrizione = (document.getElementById('mod-descrizione') || {}).value || '';
    dati.osservazioni = (document.getElementById('mod-osservazioni') || {}).value || '';
  }
  const isEdit = _isEditSnap;
  const isRistampa = _isRistampaSnap;
  // Ristampa: solo PDF, non salva nel DB
  if (isRistampa) {
    window._editModuloId = null;
    chiudiModulo();
    return;
  }
  try {
    if (isEdit) {
      const origMod = moduliCache.find((x) => x.id === window._editModuloId);
      const origOp = origMod ? origMod.operatore : getOperatore();
      // Confronta con originale per capire se c'è stata una modifica reale
      const orig = window._editModuloOrig || {};
      const curSnap = { collaboratore: collab, resp_settore: resp, data_modulo: data, dati: JSON.stringify(dati) };
      const hasChanged =
        curSnap.collaboratore !== orig.collaboratore ||
        curSnap.resp_settore !== orig.resp_settore ||
        curSnap.data_modulo !== orig.data_modulo ||
        curSnap.dati !== orig.dati;
      const modBy = hasChanged && origOp !== getOperatore() ? getOperatore() : origMod ? origMod.modificato_da : null;
      if (hasChanged) {
        await secPatch('moduli', 'id=eq.' + window._editModuloId, {
          collaboratore: collab,
          resp_settore: resp,
          data_modulo: data,
          dati,
          operatore: origOp,
          modificato_da: modBy,
        });
        const idx = moduliCache.findIndex((x) => x.id === window._editModuloId);
        if (idx !== -1)
          Object.assign(moduliCache[idx], {
            collaboratore: collab,
            resp_settore: resp,
            data_modulo: data,
            dati,
            modificato_da: modBy,
          });
      }
      window._editModuloId = null;
      window._editModuloOrig = null;
      toast(hasChanged ? 'Modulo aggiornato e PDF generato!' : 'PDF rigenerato (nessuna modifica)');
    } else {
      const rec = {
        tipo,
        collaboratore: collab,
        resp_settore: resp,
        data_modulo: data,
        dati,
        operatore: getOperatore(),
        reparto_dip: currentReparto,
      };
      const saved = await secPost('moduli', rec);
      moduliCache.unshift(saved[0]);
      toast('PDF generato e modulo salvato!');
    }
    window._importedFileData = null;
    logAzione((isEdit ? 'Modificato' : 'Creato') + ' modulo ' + tipo, collab + ' - ' + data);
    aggiornaModuliLista();
    const _cnt = document.getElementById('mod-list-count');
    if (_cnt) _cnt.textContent = getModuliReparto().length;
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    chiudiModulo();
  } catch (e) {
    console.error(e);
    toast('PDF generato (errore salvataggio DB)');
  }
}
function drawFieldLine(doc, x, y, label, value, pw) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(label + ':', x, y);
  const lw = doc.getTextWidth(label + ':  ');
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + lw, y);
  doc.setDrawColor(200);
  doc.line(x + lw, y + 1, pw - x, y + 1);
}
function drawBlockField(doc, x, y, label, value, pw) {
  const maxW = pw - x * 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  const labelLines = doc.splitTextToSize(label + ':', maxW);
  doc.text(labelLines, x, y);
  y += labelLines.length * 5 + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30);
  if (value) {
    const lines = doc.splitTextToSize(value, maxW);
    doc.text(lines, x, y);
    y += lines.length * 5 + 3;
  } else {
    y += 8;
  }
  doc.setDrawColor(180);
  doc.line(x, y, pw - x, y);
  y += 2;
  return y;
}
function drawFirmePro(doc, x, y, pw, isRdi, firmaRespB64, firmaCollabB64) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  const mid = pw / 2;
  const lbl1 = 'Firma del Resp. Settore';
  const lbl2 = isRdi ? 'Firma del collaboratore*' : 'Firma del collaboratore';
  doc.text(lbl1, x, y);
  doc.text(lbl2, mid + 10, y);
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  const w1 = doc.getTextWidth(lbl1);
  const w2 = doc.getTextWidth(lbl2);
  doc.line(x, y + 1.2, x + w1, y + 1.2);
  doc.line(mid + 10, y + 1.2, mid + 10 + w2, y + 1.2);
  y += 4;
  if (firmaRespB64) {
    try {
      doc.addImage(firmaRespB64, 'PNG', x, y, 52, 18);
    } catch (e) {}
  }
  if (firmaCollabB64) {
    try {
      doc.addImage(firmaCollabB64, 'PNG', mid + 10, y, 52, 18);
    } catch (e) {}
  }
  y += firmaRespB64 || firmaCollabB64 ? 20 : 8;
  doc.setDrawColor(150);
  const dots = '....................................................';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (!firmaRespB64) doc.text(dots, x, y);
  if (!firmaCollabB64) doc.text(dots, mid + 10, y);
  return y;
}
function drawDistribuzionePro(doc, x, y, items) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('Distribuzione:', x, y);
  const dw = doc.getTextWidth('Distribuzione:');
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1.5, x + dw, y + 1.5);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  items.forEach((it) => {
    doc.text('>       ' + it, x, y);
    y += 5;
  });
}
let _modFiltInit = false;
function renderModuliList() {
  let c = document.getElementById('moduli-list-section');
  if (!c) {
    c = document.createElement('div');
    c.id = 'moduli-list-section';
    c.className = 'main-card';
    c.style.marginTop = '20px';
    document.getElementById('page-moduli').appendChild(c);
  }
  if (!_modFiltInit) {
    let hdr =
      '<div class="card-header">Moduli generati (<span id="mod-list-count">' +
      getModuliReparto().length +
      '</span>)</div>';
    hdr += '<div class="filters">';
    hdr +=
      '<div class="filter-group"><span class="filter-label">Collaboratore</span><div class="ac-wrap"><input type="text" id="mod-filt-nome" placeholder="Cerca nome..." oninput="acFiltraModuli(\'mod-filt-nome\',\'ac-mod-filt-nomi\')" onfocus="acFiltraModuli(\'mod-filt-nome\',\'ac-mod-filt-nomi\')"><div class="ac-drop" id="ac-mod-filt-nomi"></div></div></div>';
    hdr +=
      '<div class="filter-group"><span class="filter-label">Tipo</span><select id="mod-filt-tipo" onchange="aggiornaModuliLista()"><option value="">Tutti</option><option value="allineamento">Allineamento</option><option value="apprezzamento">Apprezzamento</option><option value="rdi">RDI</option></select></div>';
    hdr +=
      '<div class="filter-group"><span class="filter-label">Dal</span><input type="text" id="mod-filt-dal" placeholder="Seleziona..." readonly style="cursor:pointer;min-width:150px"></div>';
    hdr +=
      '<div class="filter-group"><span class="filter-label">Al</span><input type="text" id="mod-filt-al" placeholder="Seleziona..." readonly style="cursor:pointer;min-width:150px"></div>';
    hdr += '<button class="btn-reset" onclick="resetModuliFiltri()">Reset</button></div>';
    hdr += '<div id="mod-list-results" style="padding:10px"></div>';
    c.innerHTML = hdr;
    if (window.flatpickr) {
      const fpOpts = {
        locale: 'it',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        allowInput: false,
        onChange: () => aggiornaModuliLista(),
      };
      flatpickr('#mod-filt-dal', fpOpts);
      flatpickr('#mod-filt-al', fpOpts);
    }
    _modFiltInit = true;
  }
  const cnt = document.getElementById('mod-list-count');
  if (cnt) cnt.textContent = getModuliReparto().length;
  aggiornaModuliLista();
}
function resetModuliFiltri() {
  const n = document.getElementById('mod-filt-nome');
  if (n) n.value = '';
  const t = document.getElementById('mod-filt-tipo');
  if (t) t.value = '';
  ['mod-filt-dal', 'mod-filt-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
  aggiornaModuliLista();
}
function aggiornaModuliLista() {
  const fn = (document.getElementById('mod-filt-nome') || {}).value || '';
  const ft = (document.getElementById('mod-filt-tipo') || {}).value || '';
  const fd = (document.getElementById('mod-filt-dal') || {}).value || '';
  const fa = (document.getElementById('mod-filt-al') || {}).value || '';
  let filtered = getModuliReparto().filter((m) => {
    if (fn && !m.collaboratore.toLowerCase().includes(fn.toLowerCase())) return false;
    if (ft && m.tipo !== ft) return false;
    if (fd && m.created_at < fd) return false;
    if (fa && m.created_at > fa + 'T23:59:59') return false;
    return true;
  });
  const tl = { allineamento: 'Allineamento', apprezzamento: 'Apprezzamento', rdi: 'RDI' };
  const tc = { allineamento: '#1a4a7a', apprezzamento: '#b8860b', rdi: '#c0392b' };
  const box = document.getElementById('mod-list-results');
  if (!box) return;
  if (!filtered.length) {
    box.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted)">Nessun modulo trovato</div>';
    return;
  }
  box.innerHTML = filtered
    .slice(0, 50)
    .map((m) => {
      const d = new Date(m.created_at);
      const me = m.collaboratore.replace(/'/g, "\\'");
      return (
        '<div class="scad-item" style="flex-wrap:wrap;padding:12px 0"><div style="display:flex;align-items:center;gap:10px;width:100%;flex-wrap:wrap"><span class="scad-date">' +
        d.toLocaleDateString('it-IT') +
        '</span><span class="entry-name" onclick="apriSchedaCollaboratore(\'' +
        me +
        '\')"><strong>' +
        escP(m.collaboratore) +
        '</strong></span><span class="badge" style="background:' +
        tc[m.tipo] +
        ';color:white;padding:2px 10px;border-radius:2px;font-size:.78rem">' +
        tl[m.tipo] +
        '</span><span style="font-size:.78rem;color:var(--muted)">Resp: ' +
        escP(m.resp_settore) +
        (m.operatore ? ' — Creato da ' + escP(m.operatore) : '') +
        (m.modificato_da ? ' — Modificato da ' + escP(m.modificato_da) : '') +
        '</span><div style="margin-left:auto;display:flex;gap:6px"><button class="btn-act edit" onclick="apriModuloSalvato(' +
        m.id +
        ')">Apri</button><button class="btn-act tipo" onclick="ristampaModuloPDF(' +
        m.id +
        ')">PDF</button><button class="btn-act del" onclick="eliminaModulo(' +
        m.id +
        ')">Elimina</button></div></div></div>'
      );
    })
    .join('');
}
function apriModuloSalvato(id) {
  const m = moduliCache.find((x) => x.id === id);
  if (!m) return;
  apriModulo(m.tipo);
  window._editModuloId = id;
  // Salva snapshot originale per confronto
  window._editModuloOrig = {
    collaboratore: m.collaboratore,
    resp_settore: m.resp_settore,
    data_modulo: m.data_modulo,
    dati: JSON.stringify(m.dati || {}),
  };
  setTimeout(() => {
    const ce = document.getElementById('mod-collaboratore');
    if (ce) ce.value = m.collaboratore;
    const re = document.getElementById('mod-resp');
    if (re) re.value = m.resp_settore;
    const de = document.getElementById('mod-data');
    if (de) de.value = m.data_modulo;
    const dt = m.dati || {};
    if (m.tipo === 'allineamento' || m.tipo === 'rdi') {
      const nc = document.getElementById('mod-non-conf');
      if (nc) nc.value = dt.non_conformita || '';
      const ob = document.getElementById('mod-obiettivo');
      if (ob) ob.value = dt.obiettivo || '';
      const sc = document.getElementById('mod-scadenza');
      if (sc) sc.value = dt.scadenza || '';
      if (m.tipo === 'rdi') {
        const lv = document.getElementById('mod-livello');
        if (lv) lv.value = dt.livello || 'I';
      }
    } else if (m.tipo === 'apprezzamento') {
      const ds = document.getElementById('mod-descrizione');
      if (ds) ds.value = dt.descrizione || '';
      const os = document.getElementById('mod-osservazioni');
      if (os) os.value = dt.osservazioni || '';
    }
    // Ripristina firma digitale se presente
    if (dt.firma_digitale) {
      setTimeout(() => {
        const radio = document.querySelector('input[name="firma-tipo"][value="digitale"]');
        if (radio) {
          radio.checked = true;
          toggleFirmaDigitale();
          setTimeout(() => {
            if (dt.firma_resp) loadFirmaToCanvas('firma-resp-canvas', dt.firma_resp);
            if (dt.firma_collab) loadFirmaToCanvas('firma-collab-canvas', dt.firma_collab);
          }, 150);
        }
      }, 100);
    }
    // Auto-resize textarea dopo populate
    setTimeout(() => {
      document.querySelectorAll('#modulo-form-area textarea').forEach((ta) => {
        if (ta.value) {
          ta.style.height = 'auto';
          ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
        }
      });
    }, 200);
  }, 50);
}
function checkQrHash() {
  const h = window.location.hash;
  if (!h.startsWith('#modulo/')) return;
  const code = h.split('/')[1];
  const mod = moduliCache.find((m) => m.dati && m.dati.qr_code === code);
  if (mod) {
    switchPage('moduli');
    setTimeout(() => apriModuloSalvato(mod.id), 300);
  } else {
    toast('Modulo non trovato');
  }
  history.replaceState(null, '', window.location.pathname);
}
async function ristampaModuloPDF(id) {
  window._isRistampa = true;
  apriModuloSalvato(id);
  await new Promise((r) => setTimeout(r, 150));
  const m = moduliCache.find((x) => x.id === id);
  try {
    if (m) await generaModuloPDF(m.tipo);
  } finally {
    window._isRistampa = false;
  }
}
async function eliminaModulo(id) {
  if (!confirm('Eliminare questo modulo? Sarà spostato nel cestino.')) return;
  const _m = moduliCache.find((x) => x.id === id);
  const op = getOperatore();
  const now = new Date().toISOString();
  try {
    await secPatch('moduli', 'id=eq.' + id, { eliminato: true, eliminato_da: op, eliminato_at: now });
    if (_m) {
      _m.eliminato = true;
      _m.eliminato_da = op;
      _m.eliminato_at = now;
    }
    moduliCache = moduliCache.filter((x) => !x.eliminato);
    if (_m) logAzione('Modulo nel cestino', _m.tipo + ' - ' + _m.collaboratore + ' (da ' + op + ')');
    aggiornaModuliLista();
    const cnt = document.getElementById('mod-list-count');
    if (cnt) cnt.textContent = getModuliReparto().length;
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    toast('Modulo spostato nel cestino');
  } catch (e) {
    toast('Errore eliminazione');
  }
}

// GESTIONE COLLABORATORI
async function renderCollaboratoriUI() {
  const section = document.getElementById('collab-section');
  if (!section) return;
  section.style.display = isAdmin() ? '' : 'none';
  if (!isAdmin()) return;
  const tutti = await secGet('collaboratori?order=nome.asc');
  const attivi = tutti.filter((c) => c.attivo !== false);
  const inattivi = tutti.filter((c) => c.attivo === false);
  const el = document.getElementById('collaboratori-list');
  let html = attivi.length
    ? attivi
        .map(
          (c) =>
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--paper2);border-radius:3px;margin-bottom:6px;border:1px solid var(--line)"><span style="flex:1;font-weight:400">' +
            escP(c.nome) +
            '</span><button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2)" onclick="rinominaCollaboratore(\'' +
            c.nome.replace(/'/g, "\\'") +
            '\')">Rinomina</button><button class="btn-del-tipo" onclick="disattivaCollaboratore(\'' +
            c.nome.replace(/'/g, "\\'") +
            '\')">Rimuovi</button></div>',
        )
        .join('')
    : '<p style="color:var(--muted);font-size:.85rem">Nessun collaboratore.</p>';
  if (inattivi.length) {
    html +=
      '<div style="margin-top:12px;padding:10px;background:var(--paper2);border-radius:3px"><small style="color:var(--muted);display:block;margin-bottom:6px">Collaboratori disattivati (clicca per riattivare):</small><div style="display:flex;flex-wrap:wrap;gap:6px">' +
      inattivi
        .map(
          (c) =>
            '<button style="padding:4px 10px;font-size:.82rem;border:1px solid var(--line);border-radius:2px;cursor:pointer;background:var(--paper);color:var(--muted)" onclick="riattivaCollaboratore(\'' +
            c.nome.replace(/'/g, "\\'") +
            '\')">+ ' +
            escP(c.nome) +
            '</button>',
        )
        .join('') +
      '</div></div>';
  }
  el.innerHTML = html;
}
async function aggiungiCollaboratore() {
  const nome = capitalizzaNome(document.getElementById('new-collab-nome').value.trim());
  if (!nome) {
    toast('Inserisci un nome');
    return;
  }
  if (collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Collaboratore già esistente');
    return;
  }
  try {
    const r = await secPost('collaboratori', { nome, attivo: true });
    collaboratoriCache.push(r[0]);
    collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
    logAzione('Collaboratore aggiunto', nome);
    document.getElementById('new-collab-nome').value = '';
    renderCollaboratoriUI();
    aggiornaNomi();
    toast('Collaboratore aggiunto');
  } catch (e) {
    if (e.message && e.message.includes('duplicate')) toast('Nome già esistente');
    else toast('Errore aggiunta collaboratore');
  }
}
function rinominaCollaboratore(nome) {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Rinomina collaboratore</h3><div class="pwd-field"><label>Nome attuale</label><input type="text" value="' +
    escP(nome) +
    '" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="rin-collab-nuovo" value="' +
    escP(nome) +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaRinominaCollaboratore(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const i = document.getElementById('rin-collab-nuovo');
    if (i) {
      i.focus();
      i.select();
    }
  }, 100);
}
async function salvaRinominaCollaboratore(vecchio) {
  const nuovo = document.getElementById('rin-collab-nuovo').value.trim();
  if (!nuovo) {
    toast('Inserisci un nome');
    return;
  }
  if (nuovo === vecchio) {
    document.getElementById('pwd-modal').classList.add('hidden');
    return;
  }
  try {
    await secPatch('collaboratori', 'nome=eq.' + encodeURIComponent(vecchio), { nome: nuovo });
    await secPatch('registrazioni', 'nome=eq.' + encodeURIComponent(vecchio), { nome: nuovo });
    // ENTERPRISE: rinomina anche su chat_messages, chat_group_members, chat_message_letti, chat_message_hidden
    try {
      await secPatch('chat_messages', 'da_operatore=eq.' + encodeURIComponent(vecchio), { da_operatore: nuovo });
    } catch (_) {}
    try {
      await secPatch('chat_messages', 'a_operatore=eq.' + encodeURIComponent(vecchio), { a_operatore: nuovo });
    } catch (_) {}
    try {
      await secPatch('chat_group_members', 'operatore=eq.' + encodeURIComponent(vecchio), { operatore: nuovo });
    } catch (_) {}
    try {
      await secPatch('chat_message_letti', 'operatore=eq.' + encodeURIComponent(vecchio), { operatore: nuovo });
    } catch (_) {}
    try {
      await secPatch('chat_message_hidden', 'operatore=eq.' + encodeURIComponent(vecchio), { operatore: nuovo });
    } catch (_) {}
    await secPatch('moduli', 'collaboratore=eq.' + encodeURIComponent(vecchio), { collaboratore: nuovo });
    const ci = collaboratoriCache.findIndex((c) => c.nome === vecchio);
    if (ci !== -1) collaboratoriCache[ci].nome = nuovo;
    datiCache.forEach((e) => {
      if (e.nome === vecchio) e.nome = nuovo;
    });
    collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
    logAzione('Rinomina collaboratore', vecchio + ' → ' + nuovo);
    document.getElementById('pwd-modal').classList.add('hidden');
    renderCollaboratoriUI();
    aggiornaNomi();
    render();
    toast('Collaboratore rinominato');
  } catch (e) {
    toast('Errore: nome già esistente?');
  }
}
async function disattivaCollaboratore(nome) {
  if (!confirm('Disattivare "' + nome + '"? Non apparirà più nell\'autocomplete.')) return;
  try {
    await secPatch('collaboratori', 'nome=eq.' + encodeURIComponent(nome), { attivo: false });
    collaboratoriCache = collaboratoriCache.filter((c) => c.nome !== nome);
    logAzione('Collaboratore disattivato', nome);
    renderCollaboratoriUI();
    aggiornaNomi();
    toast('Collaboratore disattivato');
  } catch (e) {
    toast('Errore disattivazione');
  }
}
async function riattivaCollaboratore(nome) {
  try {
    await secPatch('collaboratori', 'nome=eq.' + encodeURIComponent(nome), { attivo: true });
    collaboratoriCache.push({ nome, attivo: true });
    collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
    renderCollaboratoriUI();
    aggiornaNomi();
    toast('Collaboratore riattivato');
  } catch (e) {
    toast('Errore riattivazione');
  }
}

// LOG ATTIVITA
async function logAzione(azione, dettaglio) {
  try {
    const rec = { operatore: getOperatore() || 'Admin', azione, dettaglio: dettaglio || '' };
    await secPost('log_attivita', rec);
    logCache.unshift(Object.assign(rec, { created_at: new Date().toISOString() }));
  } catch (e) {}
}
function renderRegistro() {
  const el = document.getElementById('registro-list');
  if (!el) return;
  const selOp = document.getElementById('log-filt-op');
  if (selOp) {
    const cv = selOp.value;
    const ops = [...new Set(logCache.map((l) => l.operatore))].sort();
    selOp.innerHTML =
      '<option value="">Tutti</option>' +
      ops.map((n) => '<option' + (n === cv ? ' selected' : '') + '>' + escP(n) + '</option>').join('');
  }
  const fo = (document.getElementById('log-filt-op') || {}).value || '';
  const fcat = (document.getElementById('log-filt-cat') || {}).value || '';
  const fc = (document.getElementById('log-filt-cerca') || {}).value || '';
  const fd = (document.getElementById('log-filt-dal') || {}).value || '';
  const fa = (document.getElementById('log-filt-al') || {}).value || '';
  const catMap = {
    registrazione: ['Nuova registrazione', 'Modifica registrazione', 'Eliminata registrazione'],
    modulo: ['Modulo allineamento', 'Modulo apprezzamento', 'Modulo rdi', 'Eliminato modulo'],
    collaboratore: [
      'Rinomina collaboratore',
      'Importa collaboratori',
      'Collaboratore aggiunto',
      'Collaboratore disattivato',
    ],
    rapporto: ['Rapporto salvato'],
    scadenza: ['Scadenza creata', 'Scadenza completata'],
    operatore: ['Operatore creato', 'Operatore rimosso'],
    tipo: ['Tipo aggiunto'],
  };
  let filtered = logCache.filter((l) => {
    if (fo && l.operatore !== fo) return false;
    if (fcat && catMap[fcat] && !catMap[fcat].some((a) => l.azione.startsWith(a))) return false;
    if (
      fc &&
      !l.azione.toLowerCase().includes(fc.toLowerCase()) &&
      !(l.dettaglio || '').toLowerCase().includes(fc.toLowerCase())
    )
      return false;
    if (fd && l.created_at < fd) return false;
    if (fa && l.created_at > fa + 'T23:59:59') return false;
    return true;
  });
  if (!filtered.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:10px">Nessuna attività registrata</p>';
    return;
  }
  el.innerHTML =
    '<table style="width:100%;border-collapse:collapse;font-size:.88rem"><thead><tr style="border-bottom:2px solid var(--line);text-align:left"><th style="padding:8px">Data/Ora</th><th style="padding:8px">Operatore</th><th style="padding:8px">Azione</th><th style="padding:8px">Dettaglio</th></tr></thead><tbody>' +
    filtered
      .slice(0, 200)
      .map((l) => {
        const d = new Date(l.created_at);
        return (
          '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 8px;white-space:nowrap;color:var(--muted);font-size:.82rem">' +
          d.toLocaleDateString('it-IT') +
          ' ' +
          d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
          '</td><td style="padding:6px 8px;font-weight:600">' +
          escP(l.operatore) +
          '</td><td style="padding:6px 8px">' +
          escP(l.azione) +
          '</td><td style="padding:6px 8px;color:var(--muted);font-size:.84rem">' +
          escP(l.dettaglio) +
          '</td></tr>'
        );
      })
      .join('') +
    '</tbody></table>';
}
function esportaRegistroCSV() {
  const fo = (document.getElementById('log-filt-op') || {}).value || '';
  const fcat = (document.getElementById('log-filt-cat') || {}).value || '';
  const fc = (document.getElementById('log-filt-cerca') || {}).value || '';
  const fd = (document.getElementById('log-filt-dal') || {}).value || '';
  const fa = (document.getElementById('log-filt-al') || {}).value || '';
  const catMap = {
    registrazione: ['Nuova registrazione', 'Modifica registrazione', 'Eliminata registrazione'],
    modulo: ['Modulo allineamento', 'Modulo apprezzamento', 'Modulo rdi', 'Eliminato modulo'],
    collaboratore: [
      'Rinomina collaboratore',
      'Importa collaboratori',
      'Collaboratore aggiunto',
      'Collaboratore disattivato',
    ],
    rapporto: ['Rapporto salvato'],
    scadenza: ['Scadenza creata', 'Scadenza completata'],
    operatore: ['Operatore creato', 'Operatore rimosso'],
    tipo: ['Tipo aggiunto'],
  };
  const filtered = logCache.filter((l) => {
    if (fo && l.operatore !== fo) return false;
    if (fcat && catMap[fcat] && !catMap[fcat].some((a) => l.azione.startsWith(a))) return false;
    if (
      fc &&
      !l.azione.toLowerCase().includes(fc.toLowerCase()) &&
      !(l.dettaglio || '').toLowerCase().includes(fc.toLowerCase())
    )
      return false;
    if (fd && l.created_at < fd) return false;
    if (fa && l.created_at > fa + 'T23:59:59') return false;
    return true;
  });
  if (!filtered.length) {
    toast('Nessun dato da esportare');
    return;
  }
  const rows = [['Data', 'Ora', 'Operatore', 'Azione', 'Dettaglio']];
  filtered.forEach((l) => {
    const d = new Date(l.created_at);
    rows.push([
      d.toLocaleDateString('it-IT'),
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      l.operatore,
      l.azione,
      '"' + (l.dettaglio || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"',
    ]);
  });
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'registro_' + new Date().toLocaleDateString('it-IT').replace(/\//g, '-') + '.csv',
  }).click();
  toast('CSV registro esportato!');
}

// IMPORTA COLLABORATORI DA FILE
async function importaCollaboratori(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  let nomi = [];
  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    nomi = text
      .split(/[\r\n]+/)
      .map((l) => l.replace(/[";]/g, '').trim())
      .filter(Boolean);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    data.forEach((row) => {
      if (row[0] && typeof row[0] === 'string') {
        const n = row[0].trim();
        if (n && n.length > 1) nomi.push(n);
      }
    });
  } else {
    toast('Formato non supportato');
    input.value = '';
    return;
  }
  nomi = nomi.map((n) => capitalizzaNome(n));
  if (!nomi.length) {
    toast('Nessun nome trovato nel file');
    input.value = '';
    return;
  }
  let aggiunti = 0,
    duplicati = 0;
  for (const nome of nomi) {
    if (collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      duplicati++;
      continue;
    }
    try {
      const r = await secPost('collaboratori', { nome, attivo: true });
      collaboratoriCache.push(r[0]);
      aggiunti++;
    } catch (e) {
      duplicati++;
    }
  }
  collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
  renderCollaboratoriUI();
  aggiornaNomi();
  input.value = '';
  toast(aggiunti + ' collaboratori importati' + (duplicati ? ' (' + duplicati + ' già esistenti)' : ''));
  if (aggiunti) logAzione('Importa collaboratori', aggiunti + ' nomi importati da ' + file.name);
}

// ASSISTENTE AI GROQ
let groqKey = '';
async function loadGroqKey() {
  try {
    const res = await sbRpc('get_groq_key');
    if (res && res.key) {
      const k = res.key;
      if (k.startsWith('enc:')) {
        groqKey = _d(k.substring(4));
      } else {
        groqKey = k;
        await sbRpc('set_groq_key', { p_key: 'enc:' + _e(k), p_token: getAdminToken() }).catch(() => {});
      }
    }
  } catch (e) {
    let k = await getImp('groq_api_key');
    if (!k) k = await getImp('gemini_api_key');
    if (k) {
      if (k.startsWith('enc:')) {
        groqKey = _d(k.substring(4));
      } else {
        groqKey = k;
      }
    }
  }
}
async function salvaGroqKey() {
  const k = document.getElementById('groq-key-input').value.trim();
  if (!k) {
    toast('Inserisci la chiave');
    return;
  }
  try {
    await sbRpc('set_groq_key', { p_key: 'enc:' + _e(k), p_token: getAdminToken() });
  } catch (e) {
    await setImp('groq_api_key', 'enc:' + _e(k));
  }
  groqKey = k;
  document.getElementById('groq-key-input').value = '';
  document.getElementById('groq-status').innerHTML =
    '<span style="color:#2c6e49;font-weight:600">Chiave salvata</span>';
  toast('Chiave Groq salvata');
}
async function miglioraTesto(fieldId, contesto) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const testo = el.value.trim();
  if (!testo) {
    toast('Scrivi prima un testo da migliorare');
    return;
  }
  if (!groqKey) {
    toast('Configura la chiave Groq nelle Impostazioni');
    return;
  }
  const btn = el.parentElement.querySelector('.btn-ai');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Elaborazione...';
  }
  try {
    const prompt =
      'Sei il Responsabile del Settore del Casinò Lugano SA (CLSA), casa da gioco regolata dalla CFCG. Devi riscrivere il seguente testo per un documento formale di ' +
      contesto +
      '.\n\nSTILE RICHIESTO:\n- Italiano formale e professionale, tipico di documenti di un casinò svizzero\n- Terza persona: "il/la collaboratore/trice", "il Sig./la Sig.ra [Cognome Nome]"\n- MANTIENI tutti i dettagli specifici: date, orari, luoghi, importi, circostanze\n- Per fatti: "In data [data], durante il turno [turno], presso [luogo]..." → "si è verificato quanto segue:"\n- Per telecamere: "dalla revisione delle immagini del sistema CCTV risulta che..."\n- Per violazioni: "Tale comportamento costituisce una violazione della procedura QM [codice]" citando la procedura specifica\n- Per soglie: usa SEMPRE "pari o superiore a" (NON "superiore a")\n- Per obiettivi: "Si invita formalmente il/la collaboratore/trice a:" seguito da elenco puntato con -\n- Chiudi con: "consapevole che il ripetersi di tale comportamento potrà comportare l\'adozione di provvedimenti disciplinari più severi"\n- NON inventare fatti, migliora SOLO la forma professionale del testo esistente\n- Scrivi come un RESPONSABILE DI SETTORE esperto, NON come un\'intelligenza artificiale. Il testo deve sembrare scritto da una persona reale con esperienza nel settore. Evita frasi generiche, template o formule troppo perfette. Usa il linguaggio naturale di chi lavora in un casinò svizzero ogni giorno.\n- Rispondi SOLO con il testo migliorato, senza commenti o spiegazioni\n\nABBREVIAZIONI E TERMINOLOGIA CASINO:\nDIR=Direttore, CdA=Consiglio Amministrazione, CdD=Collegio Direzione, MgrTeam=Management Team, CO=Compliance, RLRD=Resp.LRD, RCS=Resp.Concezione Sociale, RSS=Resp.Sicurezza&Sorveglianza, R_FBS=Resp.FoBoSlot, SUP_FBS=Supervisor FoBoSlot, R_LG=Resp.Live Game, SUP_LG=Supervisor Live Game, CAS=Cassiere, REC=Receptionist, SA=Slot Attendant, GUARD=Guardaroba, BOK=Back Office, CT=Counting Team, CR=Croupier, ISP=Ispettore tavolo, SIC=Sicurezza, SURV=Sorveglianza, SECC=Sistema elettronico conteggio/controllo, AAGA=Apparecchi automatici da gioco, IR=Incident Report, SOL=Surveillance Operator Log, TRAKA=sistema gestione chiavi, GD=giornata di gioco, PLG=prodotto lordo giochi, RDI=Rapporto Disciplinare Interno, LRD=Legge riciclaggio denaro, CFCG=Commissione federale case da gioco, QM=Quality Management, VP=Valet Parking, MG=Manutenzione Giochi, FAC=Facility, PUL=Pulizie, F&C=Finanze&Controlling, F&B=Food&Beverage, MKTG=Marketing, VC=gettoni valore, NN=fiches non negoziabili, CLI/CLO=Cashless In/Out, NRT=Note Recycler Terminal, JP=Jackpot, CD=Cassa.\n\nPRINCIPI TRASVERSALI:\n- Pulizia delle mani: sfregamento palmi verso alto verso CCTV\n- Principio dei quattro occhi: un funzionario esegue, uno+ indipendenti attestano\n- Percorso più breve: rientro immediato alla postazione senza soste\n- Tutte le operazioni sotto copertura CCTV (art.33 OCG-DFGP)\n\nSOGLIE CHF:\n- CHF 3\'000: identificazione LRD obbligatoria (pari o superiore)\n- CHF 4\'000: registrazione Form III (pari o superiore)\n- CHF 10: discrepanza cassa → verifica con SUP_FBS\n- CHF 100: discrepanza cassa → indagine formale + IR\n- CHF 15\'000: pagamento → notifica preventiva SURV + verifica KYC/PEP immediata\n- CHF 30\'000: acquisto gettoni → chiarimento speciale con SUP_FBS\n- CHF 50\'000: riscossione/jackpot → chiarimento speciale + fax CFCG entro fine GD\n\nLIVELLI DISCIPLINARI: 1)Allineamento verbale 2)Allineamento scritto 3)RDI 1°grado 4)RDI 2°grado (può portare a disdetta). Dal 3° allineamento scritto stesso motivo → scatta RDI.\n\nTesto originale:\n' +
      testo;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });
    if (!r.ok) throw new Error('API error ' + r.status);
    const data = await r.json();
    const migliorato = data.choices?.[0]?.message?.content;
    if (migliorato) {
      el.value = migliorato.trim();
      el.style.height = 'auto';
      el.style.height = Math.max(80, el.scrollHeight) + 'px';
      toast('Testo migliorato!');
    } else throw new Error('Nessuna risposta');
  } catch (e) {
    console.error(e);
    toast('Errore AI: verifica la chiave Groq');
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Migliora testo con AI';
  }
}
let _moduloFotoB64 = null;
function moduloFotoPreview(inp) {
  const file = inp.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    toast('Foto troppo grande (max 20MB)');
    inp.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    _moduloFotoB64 = e.target.result;
    document.getElementById('modulo-foto-img').src = _moduloFotoB64;
    document.getElementById('modulo-foto-preview').style.display = 'block';
    document.getElementById('modulo-foto-name').textContent = file.name;
    document.getElementById('modulo-foto-remove').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}
function moduloFotoRimuovi() {
  _moduloFotoB64 = null;
  document.getElementById('modulo-foto-input').value = '';
  document.getElementById('modulo-foto-preview').style.display = 'none';
  document.getElementById('modulo-foto-name').textContent = '';
  document.getElementById('modulo-foto-remove').style.display = 'none';
}
async function generaModuloAI(tipo) {
  const prompt = (document.getElementById('ai-gen-prompt') || {}).value || '';
  if (!prompt.trim() && !_moduloFotoB64) {
    toast('Scrivi una descrizione o allega una foto');
    return;
  }
  if (!groqKey) {
    toast('Configura la chiave Groq nelle Impostazioni');
    return;
  }
  const btn = document.getElementById('btn-ai-gen');
  const status = document.getElementById('ai-gen-status');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generazione in corso...';
  }
  if (status)
    status.textContent = _moduloFotoB64 ? "L'AI sta analizzando foto e dati..." : "L'AI sta compilando i campi...";
  let sysPrompt = '';
  if (tipo === 'allineamento' || tipo === 'rdi') {
    sysPrompt =
      'Sei un assistente aziendale esperto per Casinò Lugano SA (casa da gioco in Svizzera, regolata dalla CFCG - Commissione Federale delle Case da Gioco). Genera un "Rilevamento di non conformità e colloquio di allineamento".\nTesto: formale, chiaro, oggettivo, solo fatti.\n\nABBREVIAZIONI: DIR=Direttore, CO=Compliance, RLRD=Resp.LRD, RCS=Resp.Concezione Sociale, RSS=Resp.Sicurezza&Sorveglianza, R_FBS=Resp.FoBoSlot, SUP_FBS=Supervisor FoBoSlot, SUP_LG=Supervisor Live Game, R_LG=Resp.Live Game, CAS=Cassiere, REC=Receptionist, SA=Slot Attendant, GUARD=Guardaroba, BOK=Back Office, CR=Croupier, ISP=Ispettore tavolo, SIC=Sicurezza, SURV=Sorveglianza, CT=Counting Team, VP=Valet Parking, SECC=Sistema elettronico conteggio/controllo, AAGA=Apparecchi automatici da gioco, IR=Incident Report, SOL=Surveillance Operator Log, TRAKA=sistema gestione chiavi, QM=Quality Management, GD=giornata di gioco, CD=Cassa/Differenza cassa, PLG=prodotto lordo giochi, RDI=Rapporto Disciplinare Interno. Il programma cassa si chiama Asterix. Il programma controllo documenti alla reception si chiama Reception. Le postazioni NRT si chiamano Kiosk.\n\nCONTESTO NORMATIVO E PROCEDURALE DEL CASINÒ (usa per spiegare PERCHÉ una condotta è non conforme, citando la procedura QM specifica):\n\n• LRD - IDENTIFICAZIONE (QM 3-002): obbligo documento identità valido per transazioni a partire da CHF 3\'000 (da CHF 3\'000 in su, sotto i CHF 3\'000 non si identifica), apertura deposito gettoni e carta Lugano Class (senza soglia). CAS deve verificare se cliente già identificato nel programma LRD, richiedere documento, registrare dati anagrafici completi, scansionare documento, far firmare Form I/II per avente economicamente diritto, chiedere esplicitamente se è PEP. Se transazione ≥CHF 15\'000: SIC verifica KYC/PEP immediata. Se acquisto crediti/cambio valuta ≥CHF 30\'000: chiarimento speciale con SUP_FBS prima di procedere. Se riscossione ≥CHF 50\'000: idem. Smurfing (frazionamento per aggirare soglia) VIETATO. Al tavolo: CR deve avvisare ISP se importo da CHF 3\'000 in su; se ≥CHF 30\'000 rifiutare e indirizzare a cassa.\n\n• LRD - REGISTRAZIONE (QM 3-003): Form III obbligatorio per riscossioni ≥CHF 4\'000, acquisti gettoni/cashless ≥CHF 30\'000, movimenti deposito (senza soglia). Tutti i collaboratori devono segnalare comportamenti sospetti (Red Flags LRD) a SUP_FBS e RLRD.\n\n• CASSA (QM 5-001/5-002/5-003/5-004): CAS deve timbrare in divisa, recarsi alla postazione per via più breve senza soste. Pulizia mani obbligatoria (sfregamento palmi verso alto) ogni volta che tocca valori/corpo/entra-esce postazione. Valori sempre nel carrello quando si allontana. Apertura cassa con doppia chiave (CAS+SUP_FBS), conteggio fisico obbligatorio, confronto con formulario chiusura precedente. Discrepanza >CHF 10: contatta SUP_FBS. Transazioni sotto copertura CCTV (art.33 OCG-DFGP). Principio quattro occhi per transazioni interne. Verifica autenticità banconote con lampada UV. Carte credito: verificare autenticità, firma, documento; rifiutare carte aziendali. Hand Pay/Jackpot: documento identità obbligatorio, ricevuta firmata da cliente+CAS+SUP_FBS. Deposito gettoni: procedura LRD senza soglia, avvisare SURV e SUP_FBS.\n\n• RECEPTION (QM 4-001/4-002/4-004): REC deve verificare volto visibile, stato di decoro, no alterazione. Documento identità valido obbligatorio (≥18 anni). Inserimento dati nel sistema Reception (VETO). Divieto accesso assoluto: negare ingresso, informare SUP_FBS e SIC. Accesso con divieto gioco: compilare registro visitatori, targhetta Visitor, informare SUP_FBS e SURV. Carta Lugano Class: verifica periodica annuale obbligatoria, disabilitazione immediata se esclusione.\n\n• GUARDAROBA (QM 4-003): targhetta numerata per ogni capo, mostrare al cliente cosa si inserisce nel sacchetto. Convalida autosilo: verificare coincidenza orario ingresso autosilo/CLSA, importi >CHF 30: avvisare SUP_FBS. VIETATO convalidare biglietto autosilo per uso personale (nessun collaboratore). Cassa Ward: cassetta trasferita sempre chiusa.\n\n• CROUPIER/LIVE GAME (QM 8-001/8-002/8-003/8-014): CR deve presentarsi in divisa, pulizia mani obbligatoria (entrata/uscita tavolo, prima di toccare dolly, prima di scalinare numero, dopo prelevare gettoni da chipping machine, dopo aver toccato corpo). Apertura/chiusura tavolo: autorizzazione SURV, conta fisica ad alta voce, formulario firmato da ISP+CR, copia nel Drop Box. Principio quattro occhi (Gaming+SURV). Fill/Credit: conteggio ad alta voce, formulario firmato, corrispondenza sistema. Banconote CHF 200/1\'000 e TUTTE le EUR: controllo UV una a una. Gettoni mai passati mano a mano al cliente. Cambio gettoni colore ≥CHF 20: controllo chipping machine; ≥CHF 50: taglio stecche da 5. Errori pagamento/dispute: notifica SUP_LG e SURV, decisione solo dopo verifica CCTV. Circostanze particolari: SURV redige IR e salva immagini.\n\n• MATERIALE DI GIOCO (QM 8-011): accesso locale carte con doppio badge, SURV informata. Trasporto carte sotto CCTV con almeno 2 membri staff. Controllo carte prima del gioco: completezza, danni, lampada UV, marchio sicurezza. Carta danneggiata: SUP_LG taglia a metà, avvisa SURV. Distruzione carte: SIC+SUP_LG presenti, monitoraggio SURV. Gettoni colore: verifica giornaliera, differenza >10 pezzi: avviso SURV, indagine. Caduta materiale: annuncio ad alta voce, ISP chiama SURV.\n\n• SLOTS/AAGA (QM 7-001/7-002/7-003): SA deve mantenersi in movimento nell\'area assegnata, no soste non autorizzate. Mance: mostrare platealmente palmo verso alto verso CCTV, recarsi immediatamente al box raccolta, pulizia mani dopo. Hand Pay: verificare display AAGA, informare SURV e SUP_FBS per ≥CHF 15\'000. Jackpot: comunicare tipologia/numero AAGA/importo a SUP_FBS, richiedere documento identità. Swiss Jackpot: SURV e CFCG da avvisare, AAGA sigillata. Carte cashless: autorizzazione SUP_FBS per raccolta, separare con/senza credito. Contestazioni Kiosk: trattenere carta cashless, chiedere ricevuta failed, contattare SUP_FBS. Rimborso >CHF 2\'000: conferma collega/R_FBS. Jackpot >CHF 50\'000: modulo fax CFCG entro fine giornata.\n\n• CONCEZIONE SOCIALE (QM 2-001/2-002) - LGD 2017: Art.52: vietato giocare a minorenni, esclusi, impiegati, CDA/CFCG. Ingresso minorenne/escluso: notifica immediata SUP_FBS, SURV verifica video, IR dettagliato, comunicazione CFCG obbligatoria (art.43 LGD). Opuscoli: generici (≥26 residenti TI=Progetto Residenti), giovani (<25=Progetto Giovani). Riconoscimento precoce: notifica per criteri A (gravi: problemi finanziari, richiesta prestiti) e B (frequenza, recupero). Cassetta piano 0/spogliatoi o ufficio CS. Coinvolgere Supervisor per criteri A. Ogni notifica va fatta anche se cliente già segnalato. Monitoraggio: 8 settimane (max 16), osservazione mirata, REC avvisa colleghi ingresso monitorato. Colloqui: prevenzione (Supervisor) e comportamento (RCS/SRCS). Esclusione imposta (art.80 cpv 1/2): debiti, poste sproporzionate, servizi sociali. Esclusione volontaria (art.80 cpv 5): revoca dopo 3 mesi. Revoca (art.81): documentazione finanziaria+IRGA+Direzione, monitoraggio 8 sett. post-revoca. Allarme TI 50K: identificare possessore cashcard anonima.\n\n• SICUREZZA (QM 13-001/13-003/13-006/13-007/13-008): SIC in divisa, badge, chiavi TRAKA. Ronde regolari. Accesso locali solo con autorizzazione e badge personale. Chiavi: registrazione ogni transazione, restituzione TRAKA fine turno, perdita chiave=informare RSS immediatamente. Personale esterno: solo con comunicazione scritta del Resp.settore. Esclusioni: inserimento VETO immediato con motivo e articolo di legge. Gestione conflitti: CR resta concentrato sul gioco, SUP_LG/SUP_FBS informano SURV e SIC prima di intervenire, colloquio in VIP Room. Denaro falso: segnalare immediatamente a SIC, trattenere banconota e cliente, chiamare Polizia, VIETATO restituire banconota falsa.\n\n• SORVEGLIANZA/CCTV (QM 14-001/14-002/14-003/14-004): SURV deve monitorare attività di gioco, redigere IR per ogni irregolarità/mancanza procedurale, salvare filmati CCTV. Camera check obbligatorio ogni turno. Guasto CCTV prima apertura: tavoli/AAGA NON in esercizio. Guasto durante giornata: interrompere esercizio fine unità di gioco. Guasto CCTV: comunicazione CFCG il giorno stesso. Accesso locale CCTV solo SURV/SIC. Registrazioni conservate minimo 4 settimane, VIETATO cancellare senza autorizzazione CFCG. Mancata segnalazione anomalie=negligenza/coinvolgimento diretto=procedimento disciplinare.\n\n• PRESENZE/HR (QM 16-003/16-005): timbratura entrata/uscita obbligatoria. Malattia: informare tempestivamente + certificato medico. Corsi aggiornamento obbligatori. Sistema disciplinare: allineamento verbale → allineamento scritto → RDI 1° → RDI 2° (può portare a disdetta). Dal 3° allineamento stesso motivo scatta RDI automatico.\n\n• CAVEAU/BACKOFFICE (QM 6-002): apertura sempre con principio quattro occhi (BOK+SIC). Conteggio fisico, confronto formulario chiusura precedente. Trapasso straordinario: avvisare SURV e SIC prima, registrare nel sistema. Assegni pre-firmati: accesso solo a 2 persone delegate. Chiavi nel TRAKA prima di uscire.\n\n• VALET PARKING: verifica tagliando/numero prima della consegna veicolo. Errore=rischio patrimoniale/sicurezza cliente.\n\n• REGOLE GENERALI: tutte le operazioni sotto CCTV. Obblighi comunicazione (art.43 LGD): segnalare immediatamente eventi che pregiudicano sicurezza/trasparenza giochi. Nuovi dipendenti: formazione LRD prima dell\'impiego, refresh biennale. Dati personali (QM 1-002): documentazione buona reputazione obbligatoria, mancata presentazione=disdetta contratto.\n\nCAMPO non_conformita (STRINGA):\n- PIÙ PARAGRAFI separati da \\n\\n\n- Par 1: Descrizione del FATTO (cosa, quando, dove, chi)\n- Par 2: Spiega PERCHÉ è una non conformità, citando il regolamento/procedura/legge specifica violata (LRD, procedure interne, organigramma, ecc.)\n- Par 3 (SOLO se LOG/IR nei dati): "Per i dettagli operativi si faccia riferimento al LOG / IR {numero}." Se NON c\'è LOG/IR: ometti questo paragrafo, NON scrivere "non disponibile"\n- NON inventare fatti non presenti nei dati\n- Se CCTV nei dati: "Dalla revisione delle immagini CCTV risulta che..."\n\nCAMPO obiettivo (STRINGA):\n- Inizia con "Si invita formalmente il collaboratore a:"\n- Elenco puntato con \\n- per ogni punto\n- Minimo 3 punti SPECIFICI alla situazione\n- RIPRENDI OGNI dettaglio/indicazione dell\'operatore come punto\n\nCAMPO scadenza: SEMPRE "A partire da subito"\nCAMPO collaboratore: Sig./Sig.ra + Cognome Nome\n\nREGOLE: donna→la collaboratrice/l\'impiegata, uomo→il collaboratore/l\'impiegato. Menziona reparto. Importi: CHF X\'XXX.—\nScrivi come un RESPONSABILE DI SETTORE esperto che lavora nel casinò ogni giorno, NON come un\'intelligenza artificiale. Il testo deve sembrare scritto da una persona reale. Evita frasi generiche o troppo perfette. Usa il linguaggio naturale e diretto di chi conosce le procedure. Per le soglie usa SEMPRE "pari o superiore a" (MAI "superiore a")\n\nFORMATO: JSON con 4 campi STRINGA: {"collaboratore":"...","non_conformita":"...","obiettivo":"...","scadenza":"..."}\n\nDATI:\n' +
      prompt;
  } else if (tipo === 'apprezzamento') {
    sysPrompt =
      'Sei un responsabile di settore esperto del Casinò Lugano SA (CLSA). Scrivi come una persona REALE, NON come un\'AI. Genera un "Colloquio di apprezzamento" (procedura QM 16-005).\nTono: formale ma naturale, sintetico, professionale. Evidenzia il contributo positivo con fatti concreti. Frasi brevi e dirette come le scriverebbe un responsabile di settore.\n\nAbbreviazioni: DIR=Direttore, SUP_FBS=Supervisor FoBoSlot, SUP_LG=Supervisor Live Game, CAS=Cassiere, REC=Receptionist, SA=Slot Attendant, CR=Croupier, ISP=Ispettore, SIC=Sicurezza, SURV=Sorveglianza, AAGA=Apparecchi automatici da gioco.\n\nRispondi SOLO con un JSON valido con questi campi:\n- collaboratore: nome con prefisso Sig./Sig.ra\n- descrizione: testo del merito/apprezzamento\n- osservazioni: breve nota di apprezzamento del Resp. Settore\n\nDATI DA ELABORARE:\n' +
      prompt;
  }
  if (_moduloFotoB64)
    sysPrompt +=
      '\n\nHo allegato una foto che mostra la situazione (screenshot, documento, log, schermata). Analizzala e usa le informazioni visibili per compilare i campi. Integra foto e testo.';
  try {
    let model = 'llama-3.3-70b-versatile';
    let messages;
    let bodyOpts = { temperature: 0.2, top_p: 0.9, max_tokens: 1500 };
    if (_moduloFotoB64) {
      model = 'llama-3.2-90b-vision-preview';
      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: sysPrompt },
            { type: 'image_url', image_url: { url: _moduloFotoB64 } },
          ],
        },
      ];
    } else {
      messages = [{ role: 'user', content: sysPrompt }];
      bodyOpts.response_format = { type: 'json_object' };
    }
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
      body: JSON.stringify(Object.assign({ model: model, messages: messages }, bodyOpts)),
    });
    if (!r.ok) {
      const errTxt = await r.text();
      console.error('Groq API error', r.status, errTxt);
      throw new Error('API error ' + r.status);
    }
    const data = await r.json();
    let txt = data.choices?.[0]?.message?.content;
    if (!txt) throw new Error("Nessuna risposta dall'AI");
    txt = txt
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (jsonMatch) txt = jsonMatch[0];
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch (pe) {
      console.error('JSON parse error:', txt);
      throw new Error('Risposta AI non valida');
    }
    if (parsed.collaboratore) {
      const el = document.getElementById('mod-collaboratore');
      if (el) el.value = parsed.collaboratore;
    }
    if (tipo === 'allineamento' || tipo === 'rdi') {
      if (parsed.non_conformita) {
        const el = document.getElementById('mod-non-conf');
        if (el) el.value = parsed.non_conformita;
      }
      if (parsed.obiettivo) {
        const el = document.getElementById('mod-obiettivo');
        if (el) el.value = parsed.obiettivo;
      }
      if (parsed.scadenza) {
        const el = document.getElementById('mod-scadenza');
        if (el) el.value = parsed.scadenza;
      }
    } else if (tipo === 'apprezzamento') {
      if (parsed.descrizione) {
        const el = document.getElementById('mod-descrizione');
        if (el) el.value = parsed.descrizione;
      }
      if (parsed.osservazioni) {
        const el = document.getElementById('mod-osservazioni');
        if (el) el.value = parsed.osservazioni;
      }
    }
    if (status)
      status.innerHTML = '<span style="color:#2c6e49">Campi compilati! Verifica e modifica se necessario.</span>';
    // Auto-resize textarea dopo AI
    document.querySelectorAll('#modulo-form-area textarea').forEach((ta) => {
      if (ta.value) {
        ta.style.height = 'auto';
        ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
      }
    });
    toast("Campi compilati dall'AI!");
  } catch (e) {
    console.error(e);
    const msg = e.message || '';
    if (status)
      status.innerHTML =
        '<span style="color:#c0392b">' +
        (msg.includes('API error')
          ? 'Errore API: verifica la chiave Groq'
          : msg.includes('non valida')
            ? 'Risposta AI non leggibile, riprova'
            : 'Errore: ' + msg) +
        '</span>';
    toast('Errore AI: ' + msg);
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Genera tutti i campi';
  }
}

// ASSISTENTE TESTO
let _assistFotoB64 = null;
function assistenteFotoPreview(inp) {
  const file = inp.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    toast('Foto troppo grande (max 20MB)');
    inp.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    _assistFotoB64 = e.target.result;
    document.getElementById('assist-foto-img').src = _assistFotoB64;
    document.getElementById('assist-foto-preview').style.display = 'block';
    document.getElementById('assist-foto-name').textContent = file.name;
    document.getElementById('assist-foto-remove').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}
function assistenteFotoRimuovi() {
  _assistFotoB64 = null;
  document.getElementById('assist-foto-input').value = '';
  document.getElementById('assist-foto-preview').style.display = 'none';
  document.getElementById('assist-foto-name').textContent = 'Nessuna foto';
  document.getElementById('assist-foto-remove').style.display = 'none';
}
async function assistenteGenera() {
  const input = document.getElementById('assist-input').value.trim();
  if (!input && !_assistFotoB64) {
    toast('Scrivi qualcosa o allega una foto');
    return;
  }
  if (!groqKey) {
    toast('Configura la chiave Groq nelle Impostazioni');
    return;
  }
  const tipo = document.getElementById('assist-tipo').value;
  const tono = document.getElementById('assist-tono').value;
  const lunghezza = (document.getElementById('assist-lunghezza') || {}).value || 'auto';
  const btn = document.getElementById('btn-assist-gen');
  const status = document.getElementById('assist-status');
  btn.disabled = true;
  btn.textContent = 'Elaborazione...';
  if (status)
    status.textContent = _assistFotoB64 ? "L'AI sta analizzando foto e testo..." : "L'AI sta riscrivendo il testo...";
  const tipoLabels = {
    mail_formale: 'una mail formale (destinatario: Direzione, HR, CFCG o ente esterno)',
    mail_colleghi: 'una comunicazione interna tra colleghi',
    nota_collaboratore: 'una nota indirizzata a un collaboratore',
    comunicazione_servizio: 'una comunicazione di servizio per il reparto',
    segnalazione: 'una segnalazione o un rapporto interno',
    risposta: 'una risposta formale a una richiesta o reclamo',
    libero: 'un testo professionale (migliora solo la forma)',
  };
  const tonoLabels = {
    formale: 'Tono formale e istituzionale, tipico di documenti ufficiali.',
    cordiale: 'Tono cordiale ma professionale, adatto a comunicazioni tra colleghi.',
    diretto: 'Tono diretto e conciso, vai al punto senza giri di parole.',
  };
  const lunghLabels = {
    auto: '',
    breve: '\n- Il testo deve essere BREVE: massimo 3-5 righe, vai dritto al punto.',
    media: '\n- Lunghezza MEDIA: copri tutti i punti ma senza dilungarti.',
    lunga: '\n- Testo DETTAGLIATO: sviluppa ogni punto in modo completo e articolato.',
  };
  let promptText =
    "Sei un responsabile di settore esperto del Casinò Lugano SA (CLSA), casa da gioco svizzera regolata dalla CFCG. Scrivi come una persona REALE che lavora nel casinò ogni giorno, NON come un'intelligenza artificiale.\n\nRiscrivi il seguente testo come " +
    tipoLabels[tipo] +
    '.\n\n' +
    tonoLabels[tono] +
    "\n\nREGOLE:\n- Italiano corretto e professionale, linguaggio naturale e diretto\n- Il testo deve sembrare scritto da un essere umano esperto del settore\n- Mantieni TUTTI i dettagli specifici (nomi, date, orari, importi, circostanze)\n- Usa le abbreviazioni ufficiali del casinò quando pertinente\n- Per le soglie usa SEMPRE \"pari o superiore a\" (MAI \"superiore a\")\n- NON inventare fatti non presenti nel testo originale\n- NON aggiungere saluti/chiusure se non richiesto\n- Rispondi SOLO con il testo riscritto, senza commenti o spiegazioni\n\nABBREVIAZIONI CASINO LUGANO:\nDIR=Direttore, CdA=Consiglio Amministrazione, CdD=Collegio Direzione, MgrTeam=Management Team, CO=Compliance, RLRD=Resp.LRD, RCS=Resp.Concezione Sociale, RSS=Resp.Sicurezza&Sorveglianza, R_FBS=Resp.FoBoSlot, SUP_FBS=Supervisor FoBoSlot, R_LG=Resp.Live Game, SUP_LG=Supervisor Live Game, CAS=Cassiere, REC=Receptionist, SA=Slot Attendant, GUARD=Guardaroba, BOK=Back Office, CT=Counting Team, CR=Croupier, ISP=Ispettore tavolo, SIC=Sicurezza, SURV=Sorveglianza, SECC=Sistema elettronico conteggio/controllo, AAGA=Apparecchi automatici da gioco, IR=Incident Report, SOL=Surveillance Operator Log, TRAKA=sistema gestione chiavi, GD=giornata di gioco, PLG=prodotto lordo giochi, RDI=Rapporto Disciplinare Interno, LRD=Legge riciclaggio denaro, CFCG=Commissione federale case da gioco, QM=Quality Management, VP=Valet Parking, MG=Manutenzione Giochi, FAC=Facility, PUL=Pulizie, F&C=Finanze&Controlling, F&B=Food&Beverage, MKTG=Marketing, VC=gettoni valore, NN=fiches non negoziabili, CLI/CLO=Cashless In/Out, NRT=Note Recycler Terminal, JP=Jackpot, CD=Cassa, CS=Concezione Sociale, RAP=Regolamento aziendale e del personale.\n\nPRINCIPI: Pulizia delle mani (palmi verso CCTV), Principio dei quattro occhi, Percorso più breve, Copertura CCTV (art.33 OCG-DFGP).\nSOGLIE: CHF 3'000 identificazione LRD, CHF 4'000 registrazione, CHF 15'000 notifica SURV, CHF 30'000 chiarimento speciale, CHF 50'000 fax CFCG.\nDISCIPLINARE: allineamento verbale → scritto → RDI 1° → RDI 2° (disdetta). 3° allineamento stesso motivo → RDI" +
    (lunghLabels[lunghezza] || '');
  if (_assistFotoB64)
    promptText +=
      '\n\nHo allegato una foto. Analizzala e integra le informazioni visibili nella foto con il testo scritto. Se la foto mostra documenti, schermate, situazioni o dettagli rilevanti, includili nel testo riscritto.';
  promptText +=
    '\n\nTesto originale:\n' + (input || '[Vedi foto allegata - descrivi e riscrivi in base a ciò che vedi]');
  let model = 'llama-3.3-70b-versatile';
  let messages;
  if (_assistFotoB64) {
    model = 'llama-3.2-90b-vision-preview';
    messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: _assistFotoB64 } },
        ],
      },
    ];
  } else {
    messages = [{ role: 'user', content: promptText }];
  }
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
      body: JSON.stringify({ model: model, messages: messages, temperature: 0.3, max_tokens: 1500 }),
    });
    if (!r.ok) {
      const errTxt = await r.text();
      console.error('Groq error', r.status, errTxt);
      throw new Error('API error ' + r.status);
    }
    const data = await r.json();
    const result = data.choices?.[0]?.message?.content;
    if (result) {
      document.getElementById('assist-output').value = result.trim();
      document.getElementById('assist-output-wrap').style.display = 'block';
      if (status) status.innerHTML = '<span style="color:#2c6e49">Testo riscritto!</span>';
      toast('Testo riscritto!');
    } else throw new Error('Nessuna risposta');
  } catch (e) {
    console.error(e);
    if (status) status.innerHTML = '<span style="color:#c0392b">Errore: verifica la chiave Groq</span>';
    toast('Errore AI: ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = 'Riscrivi con AI';
}
function assistenteCopia() {
  const t = document.getElementById('assist-output').value;
  if (t) {
    navigator.clipboard
      .writeText(t)
      .then(() => toast('Copiato negli appunti!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = t;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copiato!');
      });
  }
}
function assistenteReset() {
  document.getElementById('assist-input').value = '';
  document.getElementById('assist-output').value = '';
  document.getElementById('assist-output-wrap').style.display = 'none';
  document.getElementById('assist-status').textContent = '';
  assistenteFotoRimuovi();
  toast('Pulito');
}

// IMPORTA MODULO DA WORD/PDF
async function importaModuloFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  let testo = '';
  toast('Lettura file in corso...');
  try {
    if (ext === 'docx') {
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      testo = result.value;
    } else if (ext === 'doc') {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let raw = '';
      for (let i = 0; i < bytes.length; i++) {
        const c = bytes[i];
        if ((c >= 32 && c < 127) || c === 10 || c === 13) raw += String.fromCharCode(c);
      }
      testo = raw.replace(/[^\x20-\x7E\xC0-\xFF\n]/g, ' ').replace(/\s{3,}/g, ' ');
    } else if (ext === 'pdf') {
      if (typeof pdfjsLib === 'undefined') {
        toast('Libreria PDF non caricata');
        input.value = '';
        return;
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        testo += tc.items.map((it) => it.str).join(' ') + '\n';
      }
    } else {
      toast('Formato non supportato');
      input.value = '';
      return;
    }
  } catch (e) {
    console.error(e);
    toast('Errore lettura file');
    input.value = '';
    return;
  }
  input.value = '';
  // Rileva tipo dal contenuto
  const lower = testo.toLowerCase();
  let tipo = 'allineamento';
  if (lower.includes('apprezzamento')) tipo = 'apprezzamento';
  else if (lower.includes('rapporto disciplinare') || lower.includes('rdi')) tipo = 'rdi';
  // Estrai campi
  const parsed = parseModuloTesto(testo, tipo);
  // Apri form pre-compilato
  apriModulo(tipo);
  setTimeout(() => {
    const ce = document.getElementById('mod-collaboratore');
    if (ce && parsed.collaboratore) ce.value = parsed.collaboratore;
    const re = document.getElementById('mod-resp');
    if (re && parsed.resp) re.value = parsed.resp;
    const de = document.getElementById('mod-data');
    if (de && parsed.data) de.value = parsed.data;
    if (tipo === 'allineamento' || tipo === 'rdi') {
      const nc = document.getElementById('mod-non-conf');
      if (nc && parsed.non_conformita) nc.value = parsed.non_conformita;
      const ob = document.getElementById('mod-obiettivo');
      if (ob && parsed.obiettivo) ob.value = parsed.obiettivo;
      const sc = document.getElementById('mod-scadenza');
      if (sc && parsed.scadenza) sc.value = parsed.scadenza;
      if (tipo === 'rdi') {
        const lv = document.getElementById('mod-livello');
        if (lv && parsed.livello) lv.value = parsed.livello;
      }
    } else if (tipo === 'apprezzamento') {
      const ds = document.getElementById('mod-descrizione');
      if (ds && parsed.descrizione) ds.value = parsed.descrizione;
      const os = document.getElementById('mod-osservazioni');
      if (os && parsed.osservazioni) os.value = parsed.osservazioni;
    }
    // Salva file originale come base64 per scaricarlo dopo
    const reader = new FileReader();
    reader.onload = () => {
      window._importedFileData = { name: file.name, type: file.type, data: reader.result };
    };
    reader.readAsDataURL(file);
    toast('Modulo importato - controlla i campi e genera il PDF');
  }, 100);
}
function parseModuloTesto(testo, tipo) {
  const r = {};
  const lines = testo.split(/\n/);
  // Cerca collaboratore
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/collaboratore/i.test(l)) {
      const next = (lines[i + 1] || '').trim();
      if (next && next.length > 2 && !/resp|settore|data|non conf/i.test(next)) {
        r.collaboratore = next.replace(/^(sig\.|sig\.ra|sig)\s*/i, '').trim();
      }
      const m = l.match(/collaboratore\s*[:\s]+(.+)/i);
      if (m && m[1].trim().length > 2)
        r.collaboratore = m[1]
          .trim()
          .replace(/^(sig\.|sig\.ra|sig)\s*/i, '')
          .trim();
    }
  }
  // Cerca resp settore
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/resp.*settore/i.test(l)) {
      const next = (lines[i + 1] || '').trim();
      if (next && next.length > 2 && !/data|non conf|collab/i.test(next)) {
        r.resp = next.replace(/^(sig\.|sig\.ra|sig)\s*/i, '').trim();
      }
      const m = l.match(/settore\s*[:\s]+(.+)/i);
      if (m && m[1].trim().length > 2)
        r.resp = m[1]
          .trim()
          .replace(/^(sig\.|sig\.ra|sig)\s*/i, '')
          .trim();
    }
  }
  // Cerca data
  const dm = testo.match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/);
  if (dm) r.data = dm[1];
  // Cerca non conformità / descrizione
  if (tipo === 'allineamento' || tipo === 'rdi') {
    const ncMatch = testo.match(/non conformit[àa][^]*?(?=obiettivo|scadenza|firma|$)/i);
    if (ncMatch) {
      let t = ncMatch[0].replace(/non conformit[àa]\s*(rilevata)?\s*(\(descrizione\))?\s*/i, '').trim();
      t = t.replace(/\n{2,}/g, '\n').trim();
      if (t.length > 3) r.non_conformita = t.substring(0, 500);
    }
    const obMatch = testo.match(/obiettivo concordato[^]*?(?=scadenza|chiediamo|firma|$)/i);
    if (obMatch) {
      let t = obMatch[0].replace(/obiettivo concordato[^]*?non conformit[àa]\s*/i, '').trim();
      if (t.length > 3) r.obiettivo = t.substring(0, 500);
    }
    if (tipo === 'rdi') {
      r.livello = testo.toLowerCase().includes('ii°') || testo.toLowerCase().includes('grave') ? 'II' : 'I';
    }
  } else if (tipo === 'apprezzamento') {
    const descMatch = testo.match(/descrizione[^]*?(?=osservazioni|firma|$)/i);
    if (descMatch) {
      let t = descMatch[0].replace(/descrizione\s*/i, '').trim();
      if (t.length > 3) r.descrizione = t.substring(0, 500);
    }
    const ossMatch = testo.match(/osservazioni[^]*?(?=firma|distribuzione|$)/i);
    if (ossMatch) {
      let t = ossMatch[0].replace(/osservazioni[^]*?settore\s*/i, '').trim();
      if (t.length > 3) r.osservazioni = t.substring(0, 500);
    }
  }
  return r;
}

// PROFILO COLLABORATORE
function apriProfilo(nome) {
  apriSchedaCollaboratore(nome);
}

// FILTER & RENDER
function getFiltrati() {
  const p = document.getElementById('filt-persona').value,
    t = document.getElementById('filt-tipo').value,
    dal = document.getElementById('filt-dal').value,
    al = document.getElementById('filt-al').value,
    c = document.getElementById('filt-cerca').value.toLowerCase();
  let list = getDatiReparto().filter((e) => {
    const d = new Date(e.data);
    if (p && e.nome !== p) return false;
    if (t && e.tipo !== t) return false;
    if (dal && d < new Date(dal)) return false;
    if (al && d > new Date(al + 'T23:59:59')) return false;
    if (c && !e.nome.toLowerCase().includes(c) && !e.testo.toLowerCase().includes(c)) return false;
    return true;
  });
  // Pinned first
  list.sort((a, b) => {
    const pa = pinnedIds.has(a.id) ? 0 : 1,
      pb = pinnedIds.has(b.id) ? 0 : 1;
    return pa - pb || new Date(b.data) - new Date(a.data);
  });
  return list;
}
function render() {
  const f = getFiltrati(),
    el = document.getElementById('entries-list');
  if (!f.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessuna registrazione</p><small>Modifica i filtri o aggiungi voci</small></div>';
    return;
  }
  el.innerHTML = f
    .map((e) => {
      const d = new Date(e.data),
        bc = 'badge-' + e.tipo.replace(/ /g, '-'),
        te = e.tipo.replace(/'/g, "\\'"),
        pin = pinnedIds.has(e.id);
      const rep = e.reparto
        ? '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:var(--muted);color:white;border-radius:2px;font-size:.78rem;font-weight:600">' +
          escP(e.reparto) +
          '</span>'
        : '';
      const imp =
        e.importo && parseFloat(e.importo)
          ? '<span style="display:inline-block;margin-left:6px;padding:2px 8px;background:var(--accent);color:white;border-radius:2px;font-size:.82rem;font-weight:700">' +
            fmtCHF(e.importo) +
            ' ' +
            (e.valuta || 'CHF') +
            '</span>'
          : '';
      const metaLines = [];
      if (e.operatore) metaLines.push('Inserita da ' + escP(e.operatore));
      if (e.modificato_da) metaLines.push('Modificata da ' + escP(e.modificato_da));
      const gdDiff = d.getHours() < 6;
      const gdDate = gdDiff ? new Date(d.getTime() - 86400000) : d;
      const gdBadge = gdDiff
        ? '<span style="font-size:.72rem;padding:2px 7px;border-radius:2px;background:var(--accent2);color:white;font-weight:700">GD ' +
          gdDate.getDate() +
          '.' +
          String(gdDate.getMonth() + 1).padStart(2, '0') +
          '</span>'
        : '';
      return (
        '<div class="entry' +
        (pin ? ' pinned' : '') +
        '"><div class="entry-date"><div class="entry-day">' +
        d.getDate() +
        '</div><div class="entry-month">' +
        MESI[d.getMonth()] +
        ' ' +
        d.getFullYear() +
        '</div><div class="entry-time">' +
        d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
        '</div></div><div class="entry-body"><div class="entry-top"><span class="entry-name" onclick="apriProfilo(\'' +
        e.nome.replace(/'/g, "\\'") +
        '\')">' +
        esc(e.nome) +
        '</span><span class="badge ' +
        bc +
        '">' +
        escP(e.tipo) +
        '</span>' +
        gdBadge +
        rep +
        imp +
        '</div><div class="entry-text">' +
        esc(e.testo) +
        '</div>' +
        (metaLines.length ? '<div class="entry-meta">' + metaLines.join(' · ') + '</div>' : '') +
        '</div><div class="entry-actions"><button class="btn-act pin" onclick="togglePin(' +
        e.id +
        ')">' +
        (pin ? 'Rimuovi pin' : 'Fissa') +
        '</button><button class="btn-act tipo" onclick="apriModal(' +
        e.id +
        ",'" +
        te +
        '\')">Tipo</button><button class="btn-act edit" onclick="modificaRegistrazione(' +
        e.id +
        ')">Modifica</button><button class="btn-act del" onclick="elimina(' +
        e.id +
        ')">Elimina</button></div></div>'
      );
    })
    .join('');
  _saveFiltri();
}
function getNomiLista() {
  return [
    ...new Set(
      [...collaboratoriCache.map((c) => c.nome.trim()), ...getDatiReparto().map((e) => (e.nome || '').trim())]
        .filter(Boolean)
        .map((n) => n.replace(/\s+/g, ' ')),
    ),
  ].sort();
}
function aggiornaNomi() {
  const nomi = getNomiLista();
  const sel = document.getElementById('filt-persona'),
    cur = sel.value;
  sel.innerHTML =
    '<option value="">Tutte</option>' +
    nomi.map((n) => '<option' + (n === cur ? ' selected' : '') + '>' + escP(n) + '</option>').join('');
}
function acFiltra(inputId, dropId) {
  const inp = document.getElementById(inputId),
    drop = document.getElementById(dropId);
  if (!inp || !drop) return;
  const v = inp.value.toLowerCase(),
    nomi = getNomiLista();
  const filtrati = v ? nomi.filter((n) => n.toLowerCase().includes(v)) : nomi;
  if (!filtrati.length) {
    drop.classList.remove('show');
    return;
  }
  drop.innerHTML = filtrati
    .slice(0, 15)
    .map(
      (n) =>
        '<div onmousedown="acScegli(\'' +
        inputId +
        "','" +
        dropId +
        "','" +
        n.replace(/'/g, "\\'") +
        '\')">' +
        escP(n) +
        '</div>',
    )
    .join('');
  drop.classList.add('show');
}
function acScegli(inputId, dropId, nome) {
  const inp = document.getElementById(inputId),
    drop = document.getElementById(dropId);
  if (inp) inp.value = nome;
  if (drop) drop.classList.remove('show');
}
function acFiltraModuli(inputId, dropId) {
  const inp = document.getElementById(inputId),
    drop = document.getElementById(dropId);
  if (!inp || !drop) return;
  const v = inp.value.toLowerCase();
  const nomiSet = new Set();
  getModuliReparto().forEach((m) => {
    if (m.collaboratore) nomiSet.add(m.collaboratore);
  });
  const nomi = Array.from(nomiSet).sort();
  const filtrati = v ? nomi.filter((n) => n.toLowerCase().includes(v)) : nomi;
  if (!filtrati.length) {
    drop.classList.remove('show');
    return;
  }
  drop.innerHTML = filtrati
    .slice(0, 15)
    .map(
      (n) =>
        '<div onmousedown="acScegliModuli(\'' +
        inputId +
        "','" +
        dropId +
        "','" +
        n.replace(/'/g, "\\'") +
        '\')">' +
        escP(n) +
        '</div>',
    )
    .join('');
  drop.classList.add('show');
}
function acScegliModuli(inputId, dropId, nome) {
  const inp = document.getElementById(inputId),
    drop = document.getElementById(dropId);
  if (inp) inp.value = nome;
  if (drop) drop.classList.remove('show');
  aggiornaModuliLista();
}
document.addEventListener('click', function (e) {
  document.querySelectorAll('.ac-drop.show').forEach((d) => {
    if (!d.parentElement.contains(e.target)) d.classList.remove('show');
  });
});
function _saveFiltri() {
  try {
    localStorage.setItem(
      'diario_filtri',
      JSON.stringify({
        persona: (document.getElementById('filt-persona') || {}).value || '',
        tipo: (document.getElementById('filt-tipo') || {}).value || '',
        cerca: (document.getElementById('filt-cerca') || {}).value || '',
        dal: (document.getElementById('filt-dal') || {}).value || '',
        al: (document.getElementById('filt-al') || {}).value || '',
      }),
    );
  } catch (e) {}
}
function _restoreFiltri() {
  try {
    const f = JSON.parse(localStorage.getItem('diario_filtri') || '{}');
    if (f.persona) {
      const s = document.getElementById('filt-persona');
      if (s) s.value = f.persona;
    }
    if (f.tipo) {
      const s = document.getElementById('filt-tipo');
      if (s) s.value = f.tipo;
    }
    if (f.cerca) {
      const s = document.getElementById('filt-cerca');
      if (s) s.value = f.cerca;
    }
    if (f.dal) {
      const s = document.getElementById('filt-dal');
      if (s) {
        s.value = f.dal;
        if (s._flatpickr) s._flatpickr.setDate(f.dal);
      }
    }
    if (f.al) {
      const s = document.getElementById('filt-al');
      if (s) {
        s.value = f.al;
        if (s._flatpickr) s._flatpickr.setDate(f.al);
      }
    }
  } catch (e) {}
}
function resetFiltri() {
  ['filt-persona', 'filt-tipo'].forEach((id) => (document.getElementById(id).value = ''));
  ['filt-cerca'].forEach((id) => (document.getElementById(id).value = ''));
  const fd = document.getElementById('filt-dal'),
    fa = document.getElementById('filt-al');
  if (fd._flatpickr) fd._flatpickr.clear();
  else fd.value = '';
  if (fa._flatpickr) fa._flatpickr.clear();
  else fa.value = '';
  _saveFiltri();
  render();
}
function updateStats() {
  const rd = getDatiReparto();
  document.getElementById('stats-bar').innerHTML =
    '<div class="stat"><div class="stat-num">' +
    rd.length +
    '</div><div class="stat-label">Totale</div></div><div class="stat"><div class="stat-num blue">' +
    new Set(rd.map((e) => e.nome)).size +
    '</div><div class="stat-label">Collaboratori</div></div><div class="stat"><div class="stat-num red">' +
    rd.filter((e) => e.tipo === nomeCorrente('Errore')).length +
    '</div><div class="stat-label">' +
    nomeCorrente('Errore') +
    '</div></div><div class="stat"><div class="stat-num teal">' +
    rd.filter((e) => e.tipo === nomeCorrente('Malattia')).length +
    '</div><div class="stat-label">' +
    nomeCorrente('Malattia') +
    '</div></div>';
}
