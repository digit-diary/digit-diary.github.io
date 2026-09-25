/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-celle.js
 * PIANO · stampa singolo collaboratore, menu tasto destro, modifica rapida delle celle
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// STAMPA PIANO DEL SINGOLO COLLABORATORE (icona rossa prima del nome)
// + NOTA RAPIDA con tasto destro sulla cella (come Turnivo)
// ================================================================
async function stampaPianoCollaboratore(nome) {
  // PDF IDENTICO a Turnivo (template pdf_turni.html): A4 verticale,
  // intestazione con nome, tabella Data | Turno | Commenti, righe colorate
  // (weekend verde, domenica arancio, festivo rosa, con commento azzurro)
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const anno = ym.split('-')[0];
  const meseNome = MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym;
  const meseNomeLower = meseNome.toLowerCase();
  const mappa = {};
  _pianoRighe.filter((r) => r.collaboratore === nome).forEach((r) => (mappa[parseInt(r.data.split('-')[2])] = r));
  const festiviSet = {};
  pianoFestiviCache.forEach((f) => {
    if (f.data.startsWith(ym)) festiviSet[parseInt(f.data.split('-')[2])] = true;
  });
  const GG_FULL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const info = _pianoCollabInfo(nome);
  const righePdf = [];
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = ym + '-' + String(g).padStart(2, '0');
    const dow = new Date(dstr + 'T12:00:00').getDay();
    const r = mappa[g];
    const codice = r ? r.codice : '';
    const t = codice ? _pianoTurnoInfo(codice) : null;
    const cs = codice && !t ? _pianoCodiceInfo(codice) : null;
    let desc = '';
    if (t)
      desc =
        '(' +
        (t.gruppo || '') +
        ' ' +
        (t.ora_inizio || '').substring(0, 5) +
        '-' +
        (t.ora_fine || '').substring(0, 5) +
        ')';
    else if (cs) desc = '(' + (cs.descrizione || '') + ')';
    righePdf.push({
      data: GG_FULL[dow] + ' ' + g + ' ' + meseNomeLower + ' ' + anno,
      codice: codice || '-',
      desc: desc,
      commento: (r && r.commento) || '',
      // stampa PULITA: righe bianche per tutti i settori (niente verdi/arancio
      // weekend-festivi · richiesta utente); resta solo la zebra leggerissima
      fill: g % 2 === 0 ? [248, 249, 250] : [255, 255, 255],
      vuoto: !codice,
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = 16;
  // intestazione stile Turnivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text(nome, 12, y);
  y += 3;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.6);
  doc.line(12, y, 198, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Persona:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(nome, 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Settore/Dipartimento:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(repartoLabel(_pianoReparto()) + (info && info.funzione ? ' · ' + info.funzione : ''), 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Mese selezionato:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(meseNome, 45, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 102, 204);
  doc.text(anno, 12, y);
  doc.setTextColor(0);
  y += 4;
  doc.autoTable({
    startY: y,
    head: [['DATA', 'TURNO', 'COMMENTI']],
    body: righePdf.map((r) => [r.data, ' ', r.commento]),
    theme: 'plain',
    margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, lineWidth: 0 },
    headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 75 }, 2: { cellWidth: 46 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const r = righePdf[d.row.index];
      d.cell.styles.fillColor = r.fill;
      if (d.column.index === 0) d.cell.styles.textColor = [80, 80, 80];
      if (d.column.index === 2) {
        d.cell.styles.textColor = [102, 102, 102];
        d.cell.styles.fontStyle = 'italic';
        d.cell.styles.fontSize = 8.5;
      }
    },
    didDrawCell: (d) => {
      // colonna Turno: codice blu grassetto + descrizione grigia (come Turnivo)
      if (d.section !== 'body' || d.column.index !== 1) return;
      const r = righePdf[d.row.index];
      const x = d.cell.x + 2.5;
      const yy = d.cell.y + d.cell.height / 2 + 1.2;
      if (r.vuoto) {
        d.doc.setTextColor(170, 170, 170);
        d.doc.setFont('helvetica', 'normal');
        d.doc.setFontSize(9);
        d.doc.text('-', x, yy);
      } else {
        d.doc.setFont('helvetica', 'bold');
        d.doc.setFontSize(9);
        d.doc.setTextColor(21, 101, 192);
        d.doc.text(r.codice, x, yy);
        if (r.desc) {
          const w = d.doc.getTextWidth(r.codice);
          d.doc.setFont('helvetica', 'normal');
          d.doc.setFontSize(8.5);
          d.doc.setTextColor(85, 85, 85);
          d.doc.text(' ' + r.desc, x + w + 1, yy);
        }
      }
      d.doc.setTextColor(0);
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor(221, 221, 221);
      doc.setLineWidth(0.2);
      doc.line(12, ph - 12, 198, ph - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(153, 153, 153);
      doc.text(
        'Casino Lugano SA · Piano turni ' +
          meseNome +
          ' ' +
          anno +
          ' · Generato il ' +
          new Date().toLocaleDateString('it-IT') +
          ' ' +
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        105,
        ph - 8,
        { align: 'center' },
      );
      doc.setTextColor(0);
    },
  });
  logAzione('Piano collaboratore stampato', nome + ' ' + ym);
  mostraPdfPreview(doc, 'piano_' + nome.replace(/\s+/g, '_') + '_' + ym + '.pdf', 'Piano ' + nome);
}

// Nota rapida col tasto destro (senza aprire il popup completo)
async function _pianoNotaRapida(nome, dstr) {
  // IDENTICO a Turnivo (commentCell/modifica_commento): "Commento per <codice>",
  // firma automatica "- <operatore>", il commento su cella vuota crea la riga.
  if (!puoGestirePiano()) return;
  if (!_pianoConsentiScrittura(dstr)) return; // giorno chiuso
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = (r && r.commento) || '';
  const v = prompt('Commento per ' + (r && r.codice ? r.codice : 'giorno ' + g) + ':', attuale);
  if (v === null) return;
  let commento = v.trim();
  const op = getOperatore();
  if (commento && !commento.endsWith('- ' + op)) commento = commento + ' - ' + op;
  try {
    if (!r) {
      if (!commento) return;
      const nuovo = await _pianoInserisciCella({
        collaboratore: nome,
        data: dstr,
        codice: '',
        protetto: false,
        generato: false,
        commento: commento,
        reparto_dip: _pianoReparto(),
        operatore: op,
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    } else {
      await secPatch('piano', 'id=eq.' + r.id, {
        commento: commento || null,
        operatore: op,
        updated_at: new Date().toISOString(),
      });
      r.commento = commento;
    }
    if (commento) logAzione('Piano: commento', nome + ' ' + dstr + ': "' + commento + '"');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio nota');
  }
}

// ================================================================
// MENU CONTESTUALE (tasto destro) · come Turnivo cap. 17.4:
// Modifica turno / Commento / Cambia turno con... / Cambio per
// esigenze / Stampa piano collaboratore
// ================================================================
let _pianoCtxSel = null; // {nome, data}

// Il menu del tasto destro e' uno solo, condiviso fra cella e nome. La
// chiusura si registra QUI, una volta sola: prima stava dentro il menu della
// cella, quindi aprendo per primo quello del nome nessuno lo chiudeva. E si
// ascolta in fase di CATTURA, perche' il clic sul nome ferma la propagazione
// (serve alla selezione delle righe) e altrimenti non arriverebbe mai.
function _pianoCtxElemento() {
  let menu = document.getElementById('piano-ctx');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'piano-ctx';
  document.body.appendChild(menu);
  document.addEventListener(
    'mousedown',
    (ev) => {
      if (!ev.target.closest('#piano-ctx')) nascondiPianoCtx();
    },
    true,
  );
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') nascondiPianoCtx();
  });
  // scorrendo la pagina il menu resterebbe appeso lontano dal punto cliccato
  window.addEventListener('scroll', () => nascondiPianoCtx(), true);
  return menu;
}
function mostraPianoCtx(e, nome, dstr) {
  _pianoCtxSel = { nome: nome, data: dstr };
  const menu = _pianoCtxElemento();
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const haTurno = r && _pianoTurnoInfo(r.codice);
  const puoMod = puoGestirePiano();
  let h = '';
  const voce = (label, icona, azione, attiva) =>
    attiva
      ? '<div class="piano-ctx-item" onclick="' + azione + '"><i class="icx ' + icona + '"></i> ' + label + '</div>'
      : '';
  h += voce('Modifica turno', 'icx-modifica', "pianoCtxAzione('modifica')", puoMod);
  if (r && (r.commento || '').trim()) {
    h += voce('Modifica commento', 'icx-penna', "pianoCtxAzione('nota')", puoMod);
    h += voce('Elimina commento', 'icx-cestino', "pianoCtxAzione('commentoElimina')", puoMod);
  } else {
    h += voce('Aggiungi commento', 'icx-penna', "pianoCtxAzione('nota')", puoMod && !!r);
  }
  h += voce(
    'Colore cella' + (r && r.colore ? ' (attivo)' : ''),
    'icx-penna',
    "pianoCtxAzione('colore')",
    puoMod && !!r,
  );
  h += voce('Cambia turno con...', 'icx-refresh', "pianoCtxAzione('scambio')", puoMod && !!haTurno);
  h += voce('Cerca cambio · giorno libero', 'icx-cerca', "pianoCtxAzione('liberogiorno')", puoMod && !!haTurno);
  // solo dove c'e' stato un cambio (commento "cambio con" o restituzione)
  const _haCambio = !!(r && /cambio con/i.test(r.commento || ''));
  if (_haCambio) h += voce('Ristampa foglio cambio', 'icx-stampa', "pianoCtxAzione('ristampaCambio')", puoMod);
  h += voce('Cambio per esigenze', 'icx-settings', "pianoCtxAzione('esigenze')", puoMod && !!haTurno);
  // BLOCCO DELLA CELLA: il contrassegno "protetto" lo metteva solo il programma
  // (vacanze, assenze, scambi). Cosi' si puo' fermare a mano un giorno che non
  // si deve toccare, scrivendo perche'.
  // "Sblocca" solo se c'e' un blocco con motivo: le celle importate sono
  // "protette" ma non bloccate, e prima mostravano "Sblocca" a vuoto
  if (r && r.motivo_blocco) h += voce('Sblocca questa cella', 'icx-lucchetto', "pianoCtxAzione('sblocca')", puoMod);
  else h += voce('Blocca questa cella (con motivo)', 'icx-lucchetto', "pianoCtxAzione('blocca')", puoMod && !!r);
  h += voce('Rimuovi cella', 'icx-cestino', "pianoCtxAzione('rimuovi')", puoMod && !!r);
  h += voce('Copia cella', 'icx-modifica', "pianoCtxAzione('copia')", !!r);
  h += voce(
    'Copia blocco selezionato',
    'icx-modifica',
    "pianoCtxAzione('copiaBlocco')",
    !!(window._pianoBlocco && window._pianoBlocco.completo),
  );
  h += voce('Incolla qui (Excel/blocco)', 'icx-refresh', "pianoCtxAzione('incolla')", puoMod);
  const nascN = _pianoNascosti();
  const conBlocco = !!(window._pianoBlocco && window._pianoBlocco.completo);
  h += voce('Nascondi riga (' + escP(nome.split(' ')[0]) + ')', 'icx-settings', "pianoCtxAzione('nascondiRiga')", true);
  h += voce(
    'Nascondi giorno ' + parseInt(dstr.split('-')[2]),
    'icx-settings',
    "pianoCtxAzione('nascondiGiorno')",
    true,
  );
  h += voce('Nascondi righe selezionate', 'icx-settings', "pianoCtxAzione('nascondiRigheSel')", conBlocco);
  h += voce('Nascondi giorni selezionati', 'icx-settings', "pianoCtxAzione('nascondiGiorniSel')", conBlocco);
  h += voce(
    'Mostra nascosti (' + (nascN.nomi.length + nascN.giorni.length) + ')',
    'icx-refresh',
    'pianoMostraNascosti()',
    nascN.nomi.length + nascN.giorni.length > 0,
  );
  h += voce('Stampa piano di ' + escP(nome.split(' ')[0]), 'icx-stampa', "pianoCtxAzione('stampa')", true);
  menu.innerHTML =
    '<div class="piano-ctx-head">' +
    escP(nome) +
    ' · ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    (r ? ' (' + escP(r.codice) + ')' : '') +
    '</div>' +
    h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
function nascondiPianoCtx() {
  const menu = document.getElementById('piano-ctx');
  if (menu) menu.style.display = 'none';
}
// Tasto destro sul NOME del collaboratore: menu della riga (nascondi, stampa...)
function mostraPianoCtxNome(e, nome) {
  e.preventDefault();
  _pianoCtxSel = { nome: nome, data: _pianoMeseSel + '-01' };
  // stesso menu della cella, con i comandi di chiusura gia' registrati
  const menu = _pianoCtxElemento();
  const voce = (label, icona, azione, attiva) =>
    attiva
      ? '<div class="piano-ctx-item" onclick="' + azione + '"><i class="icx ' + icona + '"></i> ' + label + '</div>'
      : '';
  const nasc = _pianoNascosti();
  const conBlocco = !!(window._pianoBlocco && window._pianoBlocco.completo);
  let h = '';
  h += voce('Nascondi riga (' + escP(nome.split(' ')[0]) + ')', 'icx-settings', "pianoCtxAzione('nascondiRiga')", true);
  h += voce('Nascondi righe selezionate', 'icx-settings', "pianoCtxAzione('nascondiRigheSel')", conBlocco);
  h += voce(
    'Mostra nascosti (' + (nasc.nomi.length + nasc.giorni.length) + ')',
    'icx-refresh',
    'pianoMostraNascosti()',
    nasc.nomi.length + nasc.giorni.length > 0,
  );
  h += voce('Stampa piano di ' + escP(nome.split(' ')[0]), 'icx-stampa', "pianoCtxAzione('stampa')", true);
  menu.innerHTML = '<div class="piano-ctx-head">' + escP(nome) + '</div>' + h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
// Blocca o sblocca UNA cella del piano. Bloccata significa: fuori dalla
// generazione della bozza, fuori da "cancella mese", non la prendono gli scambi
// turno ne' la ricerca coperture, e per cambiarla o cancellarla serve una
// conferma esplicita che mostra il motivo. Chi blocca, quando e perche' finisce
// nel Registro attivita, come per lo sblocco dei giorni chiusi.
async function pianoBloccaCella(nome, dstr, blocca) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return;
  }
  if (!_pianoConsentiScrittura(dstr)) return;
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  if (!r && !blocca) return;
  const giorno = String(dstr).split('-').reverse().join('.');
  if (blocca) {
    // cella vuota: il blocco crea un congedo C (il giorno e' libero ma va
    // tenuto libero: visita, appuntamento). Scambi e coperture lo saltano.
    if (!r) {
      const motivoV = prompt(
        "Il giorno e' vuoto: lo segno come congedo C bloccato.\n\n" +
          nome +
          ' \u00b7 ' +
          giorno +
          "\n\nPerche' non si deve toccare? (es. visita medica, appuntamento)",
        '',
      );
      if (motivoV === null) return;
      const testoV = String(motivoV).trim();
      if (!testoV) {
        toast('Serve il motivo: senza, il blocco non si capisce');
        return;
      }
      try {
        const nuovo = await _pianoInserisciCella({
          collaboratore: nome,
          data: dstr,
          codice: 'C',
          protetto: true,
          generato: false,
          motivo_blocco: testoV,
          reparto_dip: _pianoReparto(),
          operatore: getOperatore(),
        });
        if (nuovo) _pianoRighe.push(Array.isArray(nuovo) ? nuovo[0] : nuovo);
        logAzione('Piano: cella bloccata', nome + ' ' + dstr + ' (C nuovo): ' + testoV);
        toast('Congedo C bloccato: ' + testoV);
        renderPiano();
      } catch (e) {
        toastErrore('Errore nel salvataggio del blocco: ' + (e.message || ''));
      }
      return;
    }
    const motivo = prompt(
      'Perche questa cella non si deve toccare?\n\n' +
        nome +
        ' \u00b7 ' +
        giorno +
        ' \u00b7 ' +
        (r.codice || '') +
        '\n\nEsempi: visita medica, appuntamento fissato, corso obbligatorio.\nIl motivo lo legge chi domani prova a cambiare il turno.',
      r.motivo_blocco || '',
    );
    if (motivo === null) return;
    const testo = String(motivo).trim();
    if (!testo) {
      toast('Serve il motivo: senza, il blocco non si capisce');
      return;
    }
    try {
      await secPatch('piano', 'id=eq.' + r.id, { protetto: true, motivo_blocco: testo });
      r.protetto = true;
      r.motivo_blocco = testo;
      logAzione('Piano: cella bloccata', nome + ' ' + dstr + ' (' + (r.codice || '') + '): ' + testo);
      toast('Cella bloccata: ' + testo);
      renderPiano();
    } catch (e) {
      console.error('blocco cella', e);
      toast('Errore nel salvataggio del blocco');
    }
    return;
  }
  if (
    !confirm(
      'Sbloccare questa cella?\n\n' +
        nome +
        ' \u00b7 ' +
        giorno +
        ' \u00b7 ' +
        (r.codice || '') +
        (r.motivo_blocco ? '\n\nEra bloccata per: ' + r.motivo_blocco : '') +
        '\n\nDa quel momento torna modificabile come le altre.',
    )
  )
    return;
  try {
    await secPatch('piano', 'id=eq.' + r.id, { protetto: false, motivo_blocco: null });
    logAzione('Piano: cella sbloccata', nome + ' ' + dstr + (r.motivo_blocco ? ' (era: ' + r.motivo_blocco + ')' : ''));
    r.protetto = false;
    r.motivo_blocco = null;
    toast('Cella sbloccata');
    renderPiano();
  } catch (e) {
    console.error('sblocco cella', e);
    toast('Errore nello sblocco');
  }
}
function pianoCtxAzione(azione) {
  nascondiPianoCtx();
  const sel = _pianoCtxSel;
  if (!sel) return;
  if (azione === 'modifica') {
    const tr = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(sel.nome) + '"]');
    const cel = tr ? tr.querySelector('td[data-g="' + parseInt(sel.data.split('-')[2]) + '"]') : null;
    if (cel) pianoCellaInline(sel.nome, sel.data, cel);
    else pianoCellaPrompt(sel.nome, sel.data);
  } else if (azione === 'nota') _pianoNotaRapida(sel.nome, sel.data);
  else if (azione === 'commentoElimina') {
    (async () => {
      const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
      if (!r || !confirm('Eliminare il commento di ' + sel.nome + ' del ' + sel.data + '?')) return;
      try {
        await secPatch('piano', 'id=eq.' + r.id, { commento: null });
        r.commento = null;
        logAzione('Piano: commento eliminato', sel.nome + ' ' + sel.data);
        toast('Commento eliminato');
        renderPiano();
      } catch (e) {
        toast('Errore eliminazione commento');
      }
    })();
  } else if (azione === 'blocca' || azione === 'sblocca') {
    pianoBloccaCella(sel.nome, sel.data, azione === 'blocca');
  } else if (azione === 'colore') {
    // seleziona la cella e apre la palette in alto (stessa di Excel)
    const tr = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(sel.nome) + '"]');
    const cel = tr ? tr.querySelector('td[data-g="' + parseInt(sel.data.split('-')[2]) + '"]') : null;
    if (cel) {
      _pianoBloccoPulisci();
      window._pianoBlocco = { tab: 'piano', t1: cel, t2: cel, completo: true };
      _pianoBloccoEvidenzia();
    }
    pianoColoriToggle();
  } else if (azione === 'nascondiRiga') pianoNascondiRighe([sel.nome]);
  else if (azione === 'nascondiGiorno') pianoNascondiGiorni([parseInt(sel.data.split('-')[2])]);
  else if (azione === 'nascondiRigheSel' || azione === 'nascondiGiorniSel') {
    const b = window._pianoBlocco;
    if (!b || !b.completo) return;
    if (azione === 'nascondiRigheSel') {
      const nomi = [
        ...new Set(
          _pianoBloccoCelle()
            .map((r) => (r[0] && r[0].closest('tr') ? r[0].closest('tr').dataset.nome : null))
            .filter(Boolean),
        ),
      ];
      if (nomi.length) pianoNascondiRighe(nomi);
      else toast('La selezione non è sulla griglia dei collaboratori');
    } else {
      let g1 = parseInt(b.t1.dataset.g);
      let g2 = parseInt(b.t2.dataset.g);
      if (g1 > g2) [g1, g2] = [g2, g1];
      const gg = [];
      for (let g = g1; g <= g2; g++) gg.push(g);
      pianoNascondiGiorni(gg);
    }
  } else if (azione === 'stampa') stampaPianoCollaboratore(sel.nome);
  else if (azione === 'scambio') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    apriScambioTurno();
  } else if (azione === 'liberogiorno') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    apriCercaCambioLibero();
  } else if (azione === 'ristampaCambio') ristampaFoglioCambio(sel.nome, sel.data);
  else if (azione === 'esigenze') apriCambioEsigenze(sel.nome, sel.data);
  else if (azione === 'copia') {
    const r2 = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
    if (r2) navigator.clipboard.writeText(r2.codice).then(() => toast('Copiato: ' + r2.codice));
  } else if (azione === 'copiaBlocco') pianoCopiaBlocco();
  else if (azione === 'incolla') pianoIncollaDaClipboard(sel);
  else if (azione === 'rimuovi') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    if (
      confirm(
        'Rimuovere la cella di ' +
          sel.nome +
          ' del ' +
          new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
          '?',
      )
    )
      rimuoviPianoCella(true);
  }
}

// Cambio per esigenze operative (come Turnivo): il turno della cella viene
// sostituito con un altro, con commento automatico "Ex <vecchio>" e PDF firma
function apriCambioEsigenze(nome, dstr) {
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  _pianoCtxSel = { nome: nome, data: dstr };
  const turni = _pianoTurniReparto().filter((t) => t.codice !== r.codice);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambio per esigenze operative</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(nome) +
    '</strong> · ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    ' · turno attuale: <strong>' +
    escP(r.codice) +
    '</strong></p>' +
    '<div class="field" style="text-align:left"><label>Nuovo turno</label><select id="esig-turno" style="width:100%;padding:10px">' +
    turni
      .map(
        (t) =>
          '<option value="' +
          escP(t.codice) +
          '">' +
          escP(t.codice) +
          ' (' +
          (t.ora_inizio || '').substring(0, 5) +
          '-' +
          (t.ora_fine || '').substring(0, 5) +
          ')' +
          (_pianoIdoneoPerTurno(nome, t) ? '' : ' ⚠ NON FORMATO') +
          '</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Motivazione</label><input type="text" id="esig-motivo" placeholder="Es: copertura cassa, evento speciale..."></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaCambioEsigenze()">Cambia turno</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaCambioEsigenze() {
  const sel = _pianoCtxSel;
  const nuovo = (document.getElementById('esig-turno') || {}).value;
  const motivo = ((document.getElementById('esig-motivo') || {}).value || '').trim();
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !nuovo) return;
  if (!_pianoConsentiScrittura(sel.data)) return; // giorno chiuso: stessa regola degli altri flussi
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  if (r.motivo_blocco && !confirm("La cella e' bloccata per: " + r.motivo_blocco + '\n\nLa cambi lo stesso?')) return;
  _pianoUndoSnap('cambio per esigenze ' + sel.data);
  const vecchio = r.codice;
  // STESSE REGOLE DEL PIANO MANUALE: se il nuovo turno viola riposo 11h,
  // consecutivi o le altre regole, avviso + conferma e violazione a verbale
  let notaRegole = '';
  if (typeof _pianoAvvisaViolazioniCella === 'function') {
    const avvisi = await _pianoAvvisaViolazioniCella(sel.nome, sel.data, nuovo);
    _pianoAccompagnamentoAvviso([{ nome: sel.nome, data: sel.data, codice: nuovo }]).forEach((a) =>
      avvisi.push(a.testo),
    );
    if (avvisi.length) {
      if (
        !confirm(
          '⚠ ATTENZIONE · ' +
            sel.nome +
            ' · ' +
            sel.data.split('-').reverse().join('.') +
            ':\n\n• ' +
            avvisi.join('\n• ') +
            '\n\nConfermi comunque il cambio per esigenze in ' +
            nuovo +
            "? La segnalazione restera' scritta nel commento della cella.",
        )
      )
        return;
      notaRegole = '⚠ ' + avvisi.join(' · ') + ' · ';
    }
  }
  try {
    await secPatch('piano', 'id=eq.' + r.id, {
      codice: nuovo,
      protetto: true,
      commento: (
        notaRegole +
        (vecchio ? 'Ex ' + vecchio + ' - ' : '') +
        'cambio per esigenze operative - ' +
        getOperatore()
      ).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r.codice = nuovo;
    r.protetto = true;
    logAzione('Piano: cambio per esigenze', sel.nome + ' ' + sel.data + ': ' + vecchio + ' -> ' + nuovo);
    toast('Turno cambiato: ' + vecchio + ' -> ' + nuovo);
    // incentivi: chi accetta il cambio prende i punti "Cambio turno
    // accettato", chi ha rifiutato si segna nello stesso popup
    if (typeof apriPopupCopertura === 'function')
      setTimeout(() => apriPopupCopertura(sel.nome, sel.data, 'cambio'), 400);
    // niente formulario: e' una decisione dell'operatore, basta il commento
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore cambio turno');
  }
}

// ================================================================
// MODIFICA RAPIDA STILE TURNIVO: click sulla cella = prompt in cui
// si scrive direttamente il codice (S22, V, C...). Vuoto = rimuovi.
// La finestra completa resta nel menu del tasto destro.
// ================================================================
// Salvataggio cella (regole Turnivo: vuoto elimina senza conferma, nessuna
// validazione del codice, commento conservato, cella protetta)
// CONTROLLO IMMEDIATO delle regole quando si scrive un turno A MANO:
// riposo minimo con il giorno prima e dopo, massimo di giorni consecutivi.
// Legge i giorni vicini dal database, quindi vale anche a cavallo di mese
// ACCOMPAGNAMENTO: chi e' segnato "accompagnato" in un gruppo (o copre da un
// altro settore con la spunta accompagnato) non deve restare DA SOLO in quel
// gruppo in un dato giorno. Simula uno o piu' cambi di cella insieme (override)
// e ritorna gli avvisi per il giorno. Usa il piano in memoria (_pianoRighe).
function _pianoAccompagnamentoAvviso(overrides) {
  try {
    if (typeof _pianoRighe === 'undefined' || !overrides || !overrides.length) return [];
    // solo i giorni toccati dai cambi
    const giorni = [...new Set(overrides.map((o) => o.data))];
    const avvisi = [];
    for (const dstr of giorni) {
      const g = parseInt(dstr.split('-')[2]);
      // stato del giorno dal piano, poi applico gli override
      const perNome = {};
      _pianoRighe.forEach((r) => {
        if (r.data === dstr) perNome[r.collaboratore] = r.codice;
      });
      overrides.forEach((o) => {
        if (o.data === dstr) perNome[o.nome] = o.codice || '';
      });
      // il conteggio per gruppo e chi resta solo lo calcola il motore puro
      const soli = PianoRegole.violazioniAccompagnamento({
        perNome: perNome,
        turnoDi: (c) => _pianoTurnoInfo(c),
        gruppoDi: (c) => {
          const t = _pianoTurnoInfo(c);
          return t ? (t.gruppo || '').toUpperCase() : '';
        },
        isAccompagnato: (nm, gr) => {
          const info = _pianoCollabInfo(nm);
          if (!info) return false;
          if (info.accompagnamento_settori && _pianoAccompagnamentoDi(info).includes(gr)) return true;
          const cop = _pianoCoperturaCfg(info);
          return !!(cop && cop.accompagnato);
        },
      });
      soli.forEach((a) =>
        avvisi.push({
          nome: a.nome,
          testo: 'resta da solo nel gruppo ' + a.gruppo + ' il ' + g + ' ma richiede accompagnamento',
        }),
      );
    }
    return avvisi;
  } catch (e) {
    return [];
  }
}
async function _pianoAvvisaViolazioniCella(nome, dstr, codiceNuovo) {
  try {
    const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
    const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
    if (!maxCons && !minRiposo) return [];
    const d0 = new Date(dstr + 'T12:00:00');
    const iso = (d) => d.toISOString().substring(0, 10);
    const da = new Date(d0);
    da.setDate(da.getDate() - Math.max(7, maxCons + 1));
    const fin = new Date(d0);
    fin.setDate(fin.getDate() + Math.max(7, maxCons + 1));
    const righe =
      (await secGet(
        'piano?collaboratore=eq.' +
          encodeURIComponent(nome) +
          '&data=gte.' +
          iso(da) +
          '&data=lte.' +
          iso(fin) +
          '&limit=100',
      )) || [];
    const mappa = {};
    const codPrec = {};
    righe.forEach((r) => {
      mappa[r.data] = r.codice;
      codPrec[r.data] = r.codice; // stato PRIMA della modifica, per i controlli sotto
    });
    if (codiceNuovo !== undefined) mappa[dstr] = codiceNuovo; // simulazione prima del salvataggio
    // CONGEDI DEDICATI ALLE VACANZE: le C (e i WD) messi prima e dopo un
    // periodo di vacanza servono al riposo previsto dalle regole. Scriverci
    // sopra un turno toglie quel riposo, quindi si avvisa.
    const avvisiExtra = [];
    const codOra = codPrec[dstr];
    if (
      codiceNuovo &&
      _pianoTurnoInfo(codiceNuovo) &&
      (codOra === 'C' || codOra === 'WD') &&
      _pianoCongediAttornoVacanze()
    ) {
      const info = _pianoCollabInfo(nome) || {};
      const pct = parseFloat(info.percentuale) || 1;
      const nPrima =
        (info.is_jolly ? parseInt(_pianoRegolaVal('c_prima_jolly')) : parseInt(_pianoRegolaVal('c_prima_fissi'))) || 1;
      const nDopo =
        parseInt(
          _pianoRegolaVal(pct >= 1 ? 'c_dopo_100' : pct >= 0.8 ? 'c_dopo_80' : pct >= 0.6 ? 'c_dopo_60' : 'c_dopo_40'),
        ) || 1;
      const nWd = parseInt(_pianoRegolaVal('wd_prima_vacanza')) || 0;
      const rel = (n) => {
        const d = new Date(dstr + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().substring(0, 10);
      };
      let dedicato = '';
      // vacanza che INIZIA nei giorni successivi: questo e' un congedo "prima"
      for (let k = 1; k <= nPrima + nWd && !dedicato; k++)
        if (codPrec[rel(k)] === 'V')
          dedicato = 'congedo previsto PRIMA delle vacanze (' + (codOra === 'WD' ? 'WD' : 'C') + ')';
      // vacanza che FINISCE nei giorni precedenti: congedo "dopo"
      for (let k = 1; k <= nDopo && !dedicato; k++)
        if (codPrec[rel(-k)] === 'V') dedicato = 'congedo di recupero DOPO le vacanze';
      if (dedicato)
        avvisiExtra.push(
          "questo giorno e' un " + dedicato + ': assegnandogli il turno ' + codiceNuovo + ' quel riposo viene tolto',
        );
    }
    // la logica riposo/consecutivi/idoneita' vive nel motore puro PianoRegole
    const tNuovo = codiceNuovo !== undefined ? _pianoTurnoInfo(codiceNuovo) : null;
    if (tNuovo) {
      const vfz = _pianoViolazioneFunzioneTurno(nome, tNuovo, new Date(dstr + 'T12:00:00').getDay(), false);
      if (vfz) avvisiExtra.push(vfz);
    }
    return avvisiExtra.concat(
      PianoRegole.violazioniCella({
        mappaGiorni: mappa,
        giorno: dstr,
        minRiposo: minRiposo,
        maxCons: maxCons,
        turnoDi: (c) => _pianoTurnoInfo(c),
        isLavoro: (c) => _pianoIsLavoro(c),
        idoneo: tNuovo ? _pianoIdoneoPerTurno(nome, tNuovo) : null,
        codiceNuovo: codiceNuovo,
      }),
    );
  } catch (e) {
    return [];
  }
}
// Testo dell'avviso per una sigla che non esiste: dice cosa e' stato rifiutato
// e, se c'e' una sigla del settore a una lettera di distanza, la propone.
function _pianoMessaggioSiglaSbagliata(codice) {
  const sigle = _pianoTurniReparto()
    .map((t) => t.codice)
    .concat(pianoCodiciCache.filter((c) => c.attivo !== false).map((c) => c.codice))
    .filter(Boolean);
  let vicina = '';
  if (typeof _levenshtein === 'function') {
    let best = 2;
    sigle.forEach((sg) => {
      const d = _levenshtein(String(sg).toUpperCase(), codice);
      if (d < best) {
        best = d;
        vicina = sg;
      }
    });
  }
  return (
    'Sigla o codice sbagliato: "' +
    codice +
    '" non esiste tra i turni e i codici speciali di ' +
    repartoLabel(_pianoReparto()) +
    ". La cella e' rimasta com'era." +
    (vicina ? ' Forse intendevi "' + vicina + '"?' : '')
  );
}
async function pianoSalvaCella(nome, dstr, codice) {
  if (!puoGestirePiano()) return false;
  // giorno chiuso: si procede solo con lo sblocco motivato
  if (!_pianoConsentiScrittura(dstr)) return false;
  // le sigle si possono scrivere in minuscolo: nel piano restano sempre MAIUSCOLE
  codice = String(codice == null ? '' : codice)
    .trim()
    .toUpperCase();
  // sigla inesistente (né turno né codice speciale) = errore, niente salvataggio
  // (solo a config caricata: con le cache vuote non si blocca nulla).
  // L'avviso e' rosso, resta a lungo e propone la sigla piu' vicina: il
  // vecchio avviso scuro di due secondi in basso a destra passava inosservato
  // e l'operatore vedeva solo la cella tornare com'era.
  if (
    codice &&
    (pianoTurniCache.length || pianoCodiciCache.length) &&
    !_pianoTurnoInfo(codice) &&
    !_pianoCodiceInfo(codice)
  ) {
    toastErrore(_pianoMessaggioSiglaSbagliata(codice));
    return false;
  }
  _pianoUndoSnap('modifica cella ' + nome.split(' ')[0] + ' ' + dstr.substring(8));
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = r ? r.codice : '';
  // CELLA PROTETTA: sovrascriverla e' possibile, ma si dice chiaramente cosa si
  // sta sostituendo. Le protette sono il piano consolidato, le vacanze e le
  // assenze confermate: non devono cambiare per un clic distratto.
  _pianoCellaSel = { nome: nome, data: dstr };
  // codici con orario personalizzato (es. JG): chiedi inizio e fine
  let orarioJG = null;
  const csOr = codice ? _pianoCodiceInfo(codice) : null;
  if (csOr && csOr.richiede_orario) {
    const ini = prompt('Orario di INIZIO per ' + codice + ' (es. 10:00):', (r && r.ora_inizio) || '10:00');
    if (ini === null) return;
    const fin = prompt('Orario di FINE per ' + codice + ' (es. 18:00):', (r && r.ora_fine) || '18:00');
    if (fin === null) return;
    const okOra = (v) => /^\d{1,2}[:.]\d{2}$/.test(String(v).trim());
    if (!okOra(ini) || !okOra(fin)) {
      toast('Orario non valido (usa hh:mm)');
      return;
    }
    orarioJG = { ora_inizio: String(ini).trim().replace('.', ':'), ora_fine: String(fin).trim().replace('.', ':') };
  }
  // REGOLE ANCHE A MANO: controllo prima di salvare (riposo minimo e
  // consecutivi, anche a cavallo di mese); se si conferma comunque, la
  // violazione resta scritta nel commento della cella
  let commentoRegole = '';
  if (codice) {
    // UN SOLO AVVISO con tutto quello che l'operatore deve sapere: prima le
    // regole (non formato, riposo, consecutivi, accompagnamento), poi la nota
    // sulla cella protetta. Prima erano due finestre in fila e la prima
    // copriva la seconda: si leggeva "protetto" e non si vedeva "non formato".
    const avvisi = _pianoTurnoInfo(codice) ? await _pianoAvvisaViolazioniCella(nome, dstr, codice) : [];
    if (_pianoTurnoInfo(codice))
      _pianoAccompagnamentoAvviso([{ nome: nome, data: dstr, codice: codice }]).forEach((a) => avvisi.push(a.testo));
    const protetta = !!(r && r.protetto && codice !== attuale);
    if (avvisi.length || protetta) {
      const righe = avvisi.slice();
      if (protetta)
        righe.push(
          r.motivo_blocco
            ? 'cella BLOCCATA per: ' + r.motivo_blocco + ' (la stai sostituendo)'
            : 'cella protetta (piano consolidato, vacanza o assenza confermata): la stai sostituendo',
        );
      if (
        !confirm(
          '\u26a0 ATTENZIONE \u00b7 ' +
            nome +
            ' \u00b7 ' +
            dstr.split('-').reverse().join('.') +
            (attuale ? ' \u00b7 da ' + attuale + ' a ' + codice : ' \u00b7 ' + codice) +
            ':\n\n\u2022 ' +
            righe.join('\n\u2022 ') +
            '\n\nConfermi comunque il turno ' +
            codice +
            "? La segnalazione restera' scritta nel commento della cella.",
        )
      )
        return false;
      if (avvisi.length) commentoRegole = '\u26a0 ' + avvisi.join(' \u00b7 ');
    }
  }
  try {
    if (!codice) {
      if (r) {
        await secDel('piano', 'id=eq.' + r.id);
        _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
        logAzione('Piano: turno rimosso', nome + ' ' + dstr + ' (era ' + attuale + ')');
        // era una malattia: proposta di toglierla anche dal Diario
        if (attuale === 'M' || attuale === 'M1') await _pianoMalattiaViaDiario(nome, [dstr]);
        renderPiano();
      }
      return;
    }
    if (codice === attuale) return;
    if (r) {
      const patchCella = {
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      };
      // la malattia scioglie il blocco con motivo: il giorno non e' piu' "da tenere libero"
      if (r.motivo_blocco && (codice === 'M' || codice === 'M1' || codice === 'I')) {
        patchCella.motivo_blocco = null;
        r.motivo_blocco = null;
      }
      if (commentoRegole)
        patchCella.commento = (commentoRegole + (r.commento ? ' \u00b7 ' + r.commento : '')).substring(0, 400);
      await secPatch('piano', 'id=eq.' + r.id, patchCella);
      if (commentoRegole) r.commento = patchCella.commento;
      r.codice = codice;
      r.protetto = true;
      r.ora_inizio = orarioJG ? orarioJG.ora_inizio : null;
      r.ora_fine = orarioJG ? orarioJG.ora_fine : null;
    } else {
      const nuovo = await _pianoInserisciCella({
        collaboratore: nome,
        data: dstr,
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        commento: commentoRegole ? commentoRegole.substring(0, 400) : null,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    }
    logAzione('Piano modificato', nome + ' ' + dstr + ' → ' + codice);
    // M scritta a mano nel piano: proposta di registrarla anche nel Diario,
    // cosi' piano, Diario e scheda collaboratore restano allineati
    if (codice === 'M' || codice === 'M1') {
      const nDia = await _pianoMalattiaNelDiario(nome, dstr, dstr, true);
      if (nDia) toast('Malattia registrata anche nel Diario: conta nella scheda di ' + nome);
    } else if (attuale === 'M' || attuale === 'M1') {
      // la M e' stata sovrascritta con un turno: il giorno non e' piu' malattia
      await _pianoMalattiaViaDiario(nome, [dstr]);
    }
    renderPiano();
    // rivalidazione del mese se era attiva (tutte le altre regole)
    if (_pianoViolLista !== null) {
      const rv = _pianoCalcolaViolazioni();
      _pianoViolCelle = rv.celle;
      _pianoViolLista = rv.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
      _pianoRenderViolazioni();
    }
    // formazione: avvisa se il collaboratore non risulta formato per il settore
    const gNF = _pianoGruppoNonFormato(nome, codice, '');
    if (gNF) setTimeout(() => _pianoProponiCertificazione(nome, gNF), 300);
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio piano');
  }
}
async function pianoCellaPrompt(nome, dstr) {
  // usato dal menu contestuale quando la cella non è raggiungibile
  if (!puoGestirePiano()) return;
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const v = prompt('Turno per giorno ' + g + ' (vuoto per rimuovere):', r ? r.codice : '');
  if (v === null) return;
  await pianoSalvaCella(nome, dstr, v.trim().toUpperCase());
}
// Modifica INLINE: click sulla cella = si scrive direttamente lì (niente finestra)
function pianoCellaInline(nome, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('piano', el);
    return;
  }
  if (!puoGestirePiano() || !el || el.querySelector('input')) return;
  _pianoBloccoPulisci();
  // la cella cliccata resta SELEZIONATA (come la cella attiva di Excel):
  // cosi' "clicco la cella e poi scelgo il colore" funziona al primo colpo
  window._pianoBlocco = { tab: 'piano', t1: el, t2: el, completo: true };
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = r ? r.codice : '';
  const vecchio = el.innerHTML;
  el.innerHTML =
    '<input type="text" value="' +
    escP(attuale) +
    '" size="1" maxlength="6" style="width:100%;min-width:0;box-sizing:border-box;border:1px solid #1a4a7a;border-radius:0;padding:0;margin:0;font:inherit;font-weight:700;text-transform:uppercase;text-align:center;background:transparent;color:inherit">';
  const inp = el.querySelector('input');
  inp.focus();
  inp.select();
  let chiuso = false;
  const conferma = async () => {
    if (chiuso) return;
    chiuso = true;
    const v = inp.value.trim().toUpperCase();
    if (v === attuale) {
      el.innerHTML = vecchio;
      return;
    }
    const ok = await pianoSalvaCella(nome, dstr, v);
    if (ok === false) {
      el.innerHTML = vecchio;
      // la cella rifiutata lampeggia in rosso: si vede QUALE cella e' tornata indietro
      el.classList.remove('piano-cella-rifiutata');
      void el.offsetWidth;
      el.classList.add('piano-cella-rifiutata');
      setTimeout(() => el.classList.remove('piano-cella-rifiutata'), 1700);
    }
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      conferma();
    } else if (e.key === 'Escape') {
      chiuso = true;
      el.innerHTML = vecchio;
    }
  });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', conferma);
}
