/**
 * Diario Collaboratori — Casino Lugano SA
 * File: search.js
 * Ricerca globale e riepilogo mensile PDF
 * Righe: 729
 */

function cercaGlobale(q) {
  clearTimeout(_rgTimeout);
  const dd = document.getElementById('ricerca-globale-results');
  if (!q || q.length < 2) {
    dd.classList.remove('show');
    return;
  }
  _rgTimeout = setTimeout(() => {
    _eseguiRicercaGlobale(q.toLowerCase());
  }, 200);
}
function _eseguiRicercaGlobale(q) {
  const dd = document.getElementById('ricerca-globale-results');
  let html = '';
  let tot = 0;
  // Diario
  const diarioRes = getDatiReparto()
    .filter(
      (e) => e.nome.toLowerCase().includes(q) || e.testo.toLowerCase().includes(q) || e.tipo.toLowerCase().includes(q)
    )
    .slice(0, 8);
  if (diarioRes.length) {
    html += '<div class="rg-section">Diario (' + diarioRes.length + (diarioRes.length >= 8 ? '+' : '') + ')</div>';
    diarioRes.forEach((e) => {
      const d = new Date(e.data);
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('diario');document.getElementById('filt-cerca').value='" +
        escP(q) +
        '\';render()"><span class="rg-badge" style="background:' +
        getColore(e.tipo) +
        '">' +
        escP(e.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(e.nome) +
        '</strong> — ' +
        escP(e.testo.substring(0, 80)) +
        '</span><span class="rg-date">' +
        d.toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += diarioRes.length;
  }
  // Moduli
  const moduRes = getModuliReparto()
    .filter(
      (m) =>
        (m.collaboratore || '').toLowerCase().includes(q) ||
        (m.tipo || '').toLowerCase().includes(q) ||
        JSON.stringify(m.dati || {})
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 6);
  if (isVis('moduli') && moduRes.length) {
    html += '<div class="rg-section">Moduli (' + moduRes.length + (moduRes.length >= 6 ? '+' : '') + ')</div>';
    moduRes.forEach((m) => {
      const colB = { allineamento: '#e67e22', apprezzamento: '#b8860b', rdi: '#c0392b' }[m.tipo] || 'var(--muted)';
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'moduli\');setTimeout(()=>apriModuloSalvato(' +
        m.id +
        '),300)"><span class="rg-badge" style="background:' +
        colB +
        '">' +
        escP(m.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(m.collaboratore) +
        '</strong> — ' +
        escP(m.data_modulo || '') +
        '</span><span class="rg-date">' +
        (m.created_at ? new Date(m.created_at).toLocaleDateString('it-IT') : '') +
        '</span></div>';
    });
    tot += moduRes.length;
  }
  // Note colleghi (solo quelle dove l'operatore è mittente o destinatario)
  const _op = getOperatore();
  const noteRes = noteColleghiCache
    .filter((n) => {
      const isMitt = n.da_operatore === _op && !n.nascosta_mitt;
      const isDest = n.a_operatore === _op && !n.nascosta_dest;
      if (!isMitt && !isDest) return false;
      return (
        n.messaggio.toLowerCase().includes(q) ||
        n.da_operatore.toLowerCase().includes(q) ||
        n.a_operatore.toLowerCase().includes(q)
      );
    })
    .slice(0, 5);
  if (isVis('note_collega') && noteRes.length) {
    html += '<div class="rg-section">Note Colleghi (' + noteRes.length + (noteRes.length >= 5 ? '+' : '') + ')</div>';
    noteRes.forEach((n) => {
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'note-collega\')"><span class="rg-badge" style="background:#2980b9">Nota</span><span class="rg-text"><strong>' +
        escP(n.da_operatore) +
        '</strong> → ' +
        escP(n.a_operatore) +
        ' — ' +
        escP(n.messaggio.substring(0, 60)) +
        '</span><span class="rg-date">' +
        new Date(n.created_at).toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += noteRes.length;
  }
  // Maison
  const maisonRes = getMaisonRepartoExpanded()
    .filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        (r.gruppo || '').toLowerCase().includes(q)
    )
    .slice(0, 6);
  if (isVis('maison') && maisonRes.length) {
    html +=
      '<div class="rg-section">Costi Maison (' + maisonRes.length + (maisonRes.length >= 6 ? '+' : '') + ')</div>';
    maisonRes.forEach((r) => {
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('maison');document.getElementById('maison-filt-nome').value='" +
        escP(r.nome) +
        '\';renderMaisonDashboard()"><span class="rg-badge" style="background:#b8860b">Maison</span><span class="rg-text"><strong>' +
        escP(r.nome) +
        '</strong> — ' +
        fmtCHF(r.costo) +
        ' CHF' +
        (r.tipo_buono ? ' (' + r.tipo_buono + ')' : '') +
        '</span><span class="rg-date">' +
        new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += maisonRes.length;
  }
  // Promemoria
  const pmRes = promemoriaCache
    .filter(
      (p) =>
        p.titolo.toLowerCase().includes(q) ||
        (p.descrizione || '').toLowerCase().includes(q) ||
        (p.assegnato_a || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isVis('promemoria') && pmRes.length) {
    html += '<div class="rg-section">Promemoria (' + pmRes.length + (pmRes.length >= 5 ? '+' : '') + ')</div>';
    pmRes.forEach((p) => {
      const scaduto = !p.completata && p.data_scadenza <= new Date().toISOString().split('T')[0];
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'promemoria\')"><span class="rg-badge" style="background:' +
        (p.completata ? '#2c6e49' : scaduto ? 'var(--accent)' : '#8e44ad') +
        '">' +
        (p.completata ? 'Fatto' : scaduto ? 'Scaduto' : 'Todo') +
        '</span><span class="rg-text"><strong>' +
        escP(p.titolo) +
        '</strong>' +
        (p.descrizione ? ' — ' + escP(p.descrizione.substring(0, 50)) : '') +
        '</span><span class="rg-date">' +
        new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += pmRes.length;
  }
  // Spese Extra
  const seRes = getSpeseReparto()
    .filter(
      (r) =>
        r.beneficiario.toLowerCase().includes(q) ||
        (r.luogo || '').toLowerCase().includes(q) ||
        (r.descrizione || '').toLowerCase().includes(q) ||
        (r.tipo || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isVis('maison') && seRes.length) {
    html += '<div class="rg-section">Spese Extra (' + seRes.length + (seRes.length >= 5 ? '+' : '') + ')</div>';
    seRes.forEach((r) => {
      const tc = SE_TIPI_COLOR[r.tipo] || 'var(--muted)';
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'maison\')"><span class="rg-badge" style="background:' +
        tc +
        '">' +
        (SE_TIPI_LABEL[r.tipo] || r.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(r.beneficiario) +
        '</strong>' +
        (r.luogo ? ' — ' + escP(r.luogo) : '') +
        ' — ' +
        fmtCHF(r.importo) +
        ' CHF</span><span class="rg-date">' +
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += seRes.length;
  }
  // Registro (solo admin)
  const logRes = logCache
    .filter(
      (l) =>
        l.azione.toLowerCase().includes(q) ||
        (l.dettaglio || '').toLowerCase().includes(q) ||
        (l.operatore || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isAdmin() && logRes.length) {
    html += '<div class="rg-section">Registro (' + logRes.length + (logRes.length >= 5 ? '+' : '') + ')</div>';
    logRes.forEach((l) => {
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('registro');document.getElementById('log-filt-cerca').value='" +
        escP(q) +
        '\';renderRegistro()"><span class="rg-badge" style="background:var(--muted)">Log</span><span class="rg-text"><strong>' +
        escP(l.operatore || '') +
        '</strong> — ' +
        escP(l.azione) +
        ' ' +
        escP((l.dettaglio || '').substring(0, 50)) +
        '</span><span class="rg-date">' +
        new Date(l.created_at).toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += logRes.length;
  }
  if (!tot)
    html =
      '<div class="rg-item" style="justify-content:center;color:var(--muted)">Nessun risultato per "' +
      escP(q) +
      '"</div>';
  dd.innerHTML = html;
  dd.classList.add('show');
}
function chiudiRicercaGlobale() {
  document.getElementById('ricerca-globale-results').classList.remove('show');
  document.getElementById('ricerca-globale').value = '';
}
document.addEventListener('click', function (e) {
  const w = document.querySelector('.ricerca-globale-wrap');
  if (w && !w.contains(e.target)) document.getElementById('ricerca-globale-results').classList.remove('show');
});
document.getElementById('ricerca-globale').addEventListener('keydown', function (e) {
  if (e.key === 'Escape') chiudiRicercaGlobale();
});

// RIEPILOGO MENSILE PDF
async function generaRiepilogoMensile() {
  // Show selection dialog before generating
  const mc = document.getElementById('pwd-modal-content');
  const now = new Date();
  let _rmMese = now.getMonth(),
    _rmAnno = now.getFullYear();
  // Build month selector options
  let meseOpts = '';
  MESI_FULL.forEach((m, i) => {
    meseOpts += '<option value="' + i + '"' + (i === _rmMese ? ' selected' : '') + '>' + m + '</option>';
  });
  let annoOpts = '';
  for (let a = _rmAnno; a >= _rmAnno - 3; a--)
    annoOpts += '<option value="' + a + '"' + (a === _rmAnno ? ' selected' : '') + '>' + a + '</option>';
  let html = '<h3>Riepilogo Mensile PDF</h3>';
  html += '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Seleziona mese e sezioni da includere</p>';
  html +=
    '<div style="display:flex;gap:10px;margin-bottom:14px"><select id="rm-mese" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem">' +
    meseOpts +
    '</select>';
  html +=
    '<select id="rm-anno" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem">' +
    annoOpts +
    '</select></div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
  const _sez = [
    ['registrazioni', 'Registrazioni (errori, malattie, ammonimenti, ecc.)'],
    ['differenze', 'Differenze cassa'],
    ['moduli', 'Moduli (allineamenti, RDI, apprezzamenti)'],
    ['maison', 'Costi Maison'],
    ['spese', 'Spese Extra'],
    ['inventario', 'Inventario movimenti'],
    ['statistiche', 'Statistiche riepilogative'],
  ];
  _sez.forEach(([k, l]) => {
    html +=
      '<label style="display:flex;align-items:center;gap:8px;font-size:.88rem;cursor:pointer"><input type="checkbox" id="rm-sez-' +
      k +
      '" checked style="width:16px;height:16px;accent-color:var(--accent2)"> ' +
      l +
      '</label>';
  });
  html += '</div>';
  html +=
    '<div style="display:flex;gap:8px;margin-bottom:8px"><button style="flex:1;padding:6px;font-size:.78rem;cursor:pointer;border:1px solid var(--line);border-radius:2px;background:var(--paper2);font-family:Source Sans 3,sans-serif" onclick="document.querySelectorAll(\'[id^=rm-sez-]\').forEach(c=>c.checked=true)">Seleziona tutti</button><button style="flex:1;padding:6px;font-size:.78rem;cursor:pointer;border:1px solid var(--line);border-radius:2px;background:var(--paper2);font-family:Source Sans 3,sans-serif" onclick="document.querySelectorAll(\'[id^=rm-sez-]\').forEach(c=>c.checked=false)">Deseleziona tutti</button></div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_eseguiRiepilogoMensile()">Genera PDF</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _eseguiRiepilogoMensile() {
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const mese = parseInt(document.getElementById('rm-mese').value);
  const anno = parseInt(document.getElementById('rm-anno').value);
  const sez = {};
  document.querySelectorAll('[id^=rm-sez-]').forEach((c) => {
    sez[c.id.replace('rm-sez-', '')] = c.checked;
  });
  const meseName = MESI_FULL[mese] + ' ' + anno;
  const primoGiorno = anno + '-' + String(mese + 1).padStart(2, '0') + '-01';
  const nextAnno = mese === 11 ? anno + 1 : anno,
    nextMese = mese === 11 ? 1 : mese + 1;
  const fineStr = nextAnno + '-' + String(nextMese).padStart(2, '0') + '-01';
  const meseData = getDatiReparto().filter((e) => e.data >= primoGiorno && e.data < fineStr);
  const meseModuli = getModuliReparto().filter((m) => {
    const d = m.created_at || m.data_modulo || '';
    return d >= primoGiorno && d < fineStr;
  });
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mx = 16;
    let y = 14;
    function _checkPage(needed) {
      if (y + needed > ph - 20) {
        doc.addPage();
        y = 16;
      }
    }
    // Logo
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(26, 18, 8);
    doc.text('Riepilogo Mensile', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(meseName + ' — Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    // Panoramica (sempre visibile)
    const nCollab = new Set(meseData.map((e) => e.nome)).size;
    const nErr = meseData.filter((e) => e.tipo === nomeCorrente('Errore')).length;
    const nMal = _contaTotaleMalattie(meseData, nomeCorrente('Malattia'));
    const totImp = meseData.reduce((s, e) => s + (parseFloat(e.importo) || 0), 0);
    const nAllin = meseModuli.filter((m) => m.tipo === 'allineamento').length;
    const nRdi = meseModuli.filter((m) => m.tipo === 'rdi').length;
    const nApprM = meseModuli.filter((m) => m.tipo === 'apprezzamento').length;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Panoramica', mx, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const stats = [
      ['Registrazioni totali', meseData.length],
      ['Collaboratori coinvolti', nCollab],
      ['Errori', nErr],
      ['Malattie', nMal],
      ['Importo totale errori', 'CHF ' + fmtCHF(totImp)],
      ['Moduli allineamento generati', nAllin],
      ['Moduli RDI generati', nRdi],
      ['Moduli apprezzamento generati', nApprM],
    ];
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: mx, right: mx },
      body: stats.map((s) => [s[0], String(s[1])]),
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'center' } },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    y = doc.lastAutoTable.finalY + 10;
    // SEZIONE: Registrazioni
    if (sez.registrazioni && meseData.length) {
      const cc = {};
      meseData.forEach((e) => {
        cc[e.nome] = (cc[e.nome] || 0) + 1;
      });
      const top10 = Object.entries(cc)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Top 10 collaboratori con piu registrazioni', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Collaboratore', 'N. registrazioni']],
        body: top10.map(([n, c]) => [n, String(c)]),
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 10;
      // Errori per collaboratore
      const errori = meseData.filter((e) => e.tipo === nomeCorrente('Errore'));
      if (errori.length) {
        const errMap = {};
        errori.forEach((e) => {
          if (!errMap[e.nome]) errMap[e.nome] = { count: 0, tot: 0 };
          errMap[e.nome].count++;
          errMap[e.nome].tot += parseFloat(e.importo) || 0;
        });
        const errSorted = Object.entries(errMap).sort((a, b) => b[1].count - a[1].count);
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Dettaglio errori per collaboratore', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'N. errori', 'Importo totale']],
          body: errSorted.map(([n, d]) => [n, String(d.count), 'CHF ' + fmtCHF(d.tot)]),
          headStyles: { fillColor: [192, 57, 43], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
      // Malattie
      const malattie = meseData.filter((e) => e.tipo === nomeCorrente('Malattia'));
      if (malattie.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Malattie', mx, y);
        y += 2;
        const malMap = {};
        malattie.forEach((e) => {
          if (!malMap[e.nome]) malMap[e.nome] = 0;
          const gg = _contaGiorniMalattia(e);
          malMap[e.nome] += gg;
        });
        const malSorted = Object.entries(malMap).sort((a, b) => b[1] - a[1]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'Giorni malattia']],
          body: malSorted.map(([n, g]) => [n, String(g)]),
          headStyles: { fillColor: [230, 126, 34], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Differenze cassa
    if (sez.differenze) {
      const cassaEntries = meseData.filter(
        (e) => e.tipo === nomeCorrente('Differenza Cassa') || e.tipo === 'Differenza Cassa'
      );
      if (cassaEntries.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Differenze Cassa', mx, y);
        y += 2;
        const cassaBody = cassaEntries.map((e) => [
          e.nome,
          e.data ? new Date(e.data + 'T12:00:00').toLocaleDateString('it-IT') : '',
          'CHF ' + fmtCHF(parseFloat(e.importo) || 0),
          (e.descrizione || '').substring(0, 60),
        ]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'Data', 'Importo', 'Descrizione']],
          body: cassaBody,
          headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
          columnStyles: { 2: { halign: 'right' }, 3: { cellWidth: 60 } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Moduli
    if (sez.moduli && meseModuli.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Moduli generati', mx, y);
      y += 2;
      const tipiModulo = ['allineamento', 'rdi', 'apprezzamento'];
      const modBody = [];
      tipiModulo.forEach((tipo) => {
        const mm = meseModuli.filter((m) => m.tipo === tipo);
        if (mm.length) {
          const collab = {};
          mm.forEach((m) => {
            collab[m.nome] = (collab[m.nome] || 0) + 1;
          });
          Object.entries(collab)
            .sort((a, b) => b[1] - a[1])
            .forEach(([n, c]) => {
              modBody.push([tipo.charAt(0).toUpperCase() + tipo.slice(1), n, String(c)]);
            });
        }
      });
      if (modBody.length) {
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Tipo', 'Collaboratore', 'Quantita']],
          body: modBody,
          headStyles: { fillColor: [142, 68, 173], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 2: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Costi Maison
    const _pdfMaison = getMaisonRepartoExpanded().filter(
      (r) => r.data_giornata >= primoGiorno && r.data_giornata < fineStr
    );
    if (sez.maison && _pdfMaison.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Costi Maison', mx, y);
      y += 2;
      const maisonTot = _pdfMaison.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
      const maisonClienti = new Set(_pdfMaison.map((r) => r.nome)).size;
      // Summary
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        body: [
          ['Costo totale', 'CHF ' + fmtCHF(maisonTot)],
          ['Clienti', '' + maisonClienti],
          ['Visite totali', '' + _pdfMaison.length],
        ],
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 6;
      // Top clienti Maison
      const cliMap = {};
      _pdfMaison.forEach((r) => {
        if (!cliMap[r.nome]) cliMap[r.nome] = { costo: 0, visite: 0 };
        cliMap[r.nome].costo += parseFloat(r.costo || 0);
        cliMap[r.nome].visite++;
      });
      const topCli = Object.entries(cliMap)
        .sort((a, b) => b[1].costo - a[1].costo)
        .slice(0, 15);
      if (topCli.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Top clienti Maison per costo', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Cliente', 'Visite', 'Costo totale']],
          body: topCli.map(([n, d]) => [n, String(d.visite), 'CHF ' + fmtCHF(d.costo)]),
          headStyles: { fillColor: [139, 105, 20], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Spese Extra
    const _pdfSpese = getSpeseReparto().filter(
      (r) => (r.data_spesa || r.created_at || '') >= primoGiorno && (r.data_spesa || r.created_at || '') < fineStr
    );
    if (sez.spese && _pdfSpese.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Spese Extra', mx, y);
      y += 2;
      const speseTot = _pdfSpese.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
      const speseBody = _pdfSpese
        .sort((a, b) => (b.data_spesa || '').localeCompare(a.data_spesa || ''))
        .map((r) => [
          r.beneficiario || '',
          r.data_spesa ? new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT') : '',
          (SE_TIPI_LABEL && SE_TIPI_LABEL[r.tipo]) || r.tipo || '',
          'CHF ' + fmtCHF(parseFloat(r.importo || 0)),
          (r.luogo || '').substring(0, 30),
        ]);
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Beneficiario', 'Data', 'Tipo', 'Importo', 'Luogo']],
        body: speseBody,
        headStyles: { fillColor: [44, 110, 73], textColor: [255, 255, 255] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
        columnStyles: { 3: { halign: 'right' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Totale Spese Extra: CHF ' + fmtCHF(speseTot), mx, y + 4);
      y += 10;
    }
    // SEZIONE: Inventario movimenti
    if (sez.inventario) {
      const invData = getInventarioReparto().filter(
        (r) =>
          (r.data_movimento || r.created_at || '') >= primoGiorno && (r.data_movimento || r.created_at || '') < fineStr
      );
      if (invData.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('Inventario Movimenti', mx, y);
        y += 2;
        const invBody = invData
          .sort((a, b) => (b.data_movimento || '').localeCompare(a.data_movimento || ''))
          .map((r) => [
            r.articolo || '',
            (r.tipo_movimento || '').charAt(0).toUpperCase() + (r.tipo_movimento || '').slice(1),
            String(r.quantita || 0),
            r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '',
            (r.note || '').substring(0, 40),
          ]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Articolo', 'Tipo', 'Quantita', 'Data', 'Note']],
          body: invBody,
          headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
          columnStyles: { 2: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Statistiche riepilogative
    if (sez.statistiche && meseData.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Statistiche per tipo di evento', mx, y);
      y += 2;
      const tipoCount = {};
      meseData.forEach((e) => {
        tipoCount[e.tipo] = (tipoCount[e.tipo] || 0) + 1;
      });
      const tipoSorted = Object.entries(tipoCount).sort((a, b) => b[1] - a[1]);
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Tipo evento', 'Conteggio', 'Percentuale']],
        body: tipoSorted.map(([t, c]) => [t, String(c), ((c / meseData.length) * 100).toFixed(1) + '%']),
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
      // Distribuzione per giorno della settimana
      const giorniNome = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
      const giorniCount = [0, 0, 0, 0, 0, 0, 0];
      meseData.forEach((e) => {
        if (e.data) {
          const d = new Date(e.data + 'T12:00:00');
          giorniCount[d.getDay()]++;
        }
      });
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Distribuzione per giorno della settimana', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [giorniNome],
        body: [giorniCount.map(String)],
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3, halign: 'center' },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    // Footer
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — Riepilogo ' + meseName + ' — Pag. ' + i + '/' + tp, mx, ph - 8);
    }
    mostraPdfPreview(doc, 'Riepilogo_' + meseName.replace(/\s/g, '_') + '.pdf', 'Riepilogo ' + meseName);
  } catch (e) {
    console.error(e);
    toast('Errore generazione PDF: ' + e.message);
  }
}

// ================================================================
