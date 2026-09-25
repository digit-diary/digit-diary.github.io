/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-cambi.js
 * PIANO · copia Excel, stampa PDF, cambi turno (scambio, esigenze, cerca cambio), copertura malattia
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// COPIA PER EXCEL / STAMPA PDF / SCAMBIO TURNO / SELEZIONE RIGA
// ================================================================
function copiaPianoExcel() {
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab) return;
  const righe = [];
  tab.querySelectorAll('tr').forEach((tr) => {
    const celle = [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim().replace(/\n/g, ' '));
    righe.push(celle.join('\t'));
  });
  navigator.clipboard
    .writeText(righe.join('\n'))
    .then(() => toast('Piano copiato: incollalo in Excel'))
    .catch(() => toast('Copia non riuscita'));
}

async function stampaPianoPDF(soloNomi) {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore libreria PDF');
      return;
    }
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const label = (MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const mappa = {};
  const mappaCol = {};
  _pianoRighe.forEach((r) => {
    mappa[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice;
    if (r.colore) mappaCol[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.colore;
  });
  // righe/giorni NASCOSTI nella griglia restano fuori anche dalla stampa
  // (serve p.es. per stampare il piano senza i SUP)
  const nasc = _pianoNascosti();
  let nomi = [...new Set(_pianoRighe.map((r) => r.collaboratore))].filter((n) => !nasc.nomi.includes(n)).sort();
  // stampa di una SELEZIONE di collaboratori (barra della selezione multipla)
  if (Array.isArray(soloNomi) && soloNomi.length) nomi = nomi.filter((n) => soloNomi.includes(n));
  const giorniVis = [];
  for (let g = 1; g <= nGiorni; g++) if (!nasc.giorni.includes(g)) giorniVis.push(g);
  const head = ['Collaboratore'];
  giorniVis.forEach((g) => head.push(String(g)));
  const body = nomi.map((n) => {
    const riga = [n];
    giorniVis.forEach((g) => riga.push(mappa[n + '|' + g] || ''));
    return riga;
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Piano di lavoro · ' + label + ' · ' + repartoLabel(_pianoReparto()), 148, 10, { align: 'center' });
  doc.autoTable({
    startY: 14,
    head: [head],
    body: body,
    theme: 'grid',
    margin: { left: 4, right: 4 },
    styles: { fontSize: 5.2, cellPadding: 0.6, halign: 'center', lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 18, 8], textColor: [255, 255, 255], fontSize: 5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26, fontSize: 5 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index > 0 && d.cell.raw) {
        // colore personalizzato della cella: vince sul colore del turno anche in stampa
        const ovr = mappaCol[nomi[d.row.index] + '|' + giorniVis[d.column.index - 1]];
        const stC = ovr ? _stileCella(ovr) : null;
        if (stC && (stC.b || stC.i))
          d.cell.styles.fontStyle = stC.b && stC.i ? 'bolditalic' : stC.b ? 'bold' : 'italic';
        if (stC && stC.t && stC.t[0] === '#') {
          const ht = stC.t.replace('#', '');
          d.cell.styles.textColor = [
            parseInt(ht.substring(0, 2), 16),
            parseInt(ht.substring(2, 4), 16),
            parseInt(ht.substring(4, 6), 16),
          ];
        }
        const col = (stC && stC.c) || _pianoColore(String(d.cell.raw));
        if (col) {
          const hex = col.replace('#', '');
          d.cell.styles.fillColor = [
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16),
          ];
        }
      }
    },
  });
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Casino Lugano SA · Piano di lavoro · generato il ' + new Date().toLocaleDateString('it-IT'), 4, 205);
  logAzione('Piano stampato', label + ' (' + _pianoReparto() + ')');
  mostraPdfPreview(doc, 'piano_' + ym + '_' + _pianoReparto() + '.pdf', 'Piano ' + label);
}

// Formulario cambio turno IDENTICO a Turnivo (template cambio_turno_pdf.html):
// header centrato, sezioni con barra colorata (A blu, B arancio, motivazione
// verde, autorizzazione viola con checkbox), chip turni, firme con data.
function _pdfCambioTurno(dati) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  // header centrato
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text('Casino Lugano SA', 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text(dati.tipo === 'ESIGENZE' ? 'CAMBIO TURNO PER ESIGENZE OPERATIVE' : 'RICHIESTA CAMBIO TURNO', 105, y, {
    align: 'center',
  });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text(
    'Generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    105,
    y,
    { align: 'center' },
  );
  y += 5;
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(1);
  doc.line(M, y, 210 - M, y);
  y += 10;

  const chip = (x, yy, testo, bg, fg) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const w = doc.getTextWidth(testo) + 5;
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(x, yy - 4.2, w, 6, 1.2, 1.2, 'F');
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(testo, x + 2.5, yy);
    doc.setTextColor(34, 34, 34);
    return w;
  };
  const sezione = (titolo, barra, sfondo, righe) => {
    const altezza = 12 + righe.length * 6.5 + 3;
    doc.setFillColor(sfondo[0], sfondo[1], sfondo[2]);
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, y, W, altezza, 1.8, 1.8, 'FD');
    doc.setFillColor(barra[0], barra[1], barra[2]);
    doc.rect(M, y, 1.6, altezza, 'F');
    let yy = y + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(titolo, M + 6, yy);
    doc.setDrawColor(221, 221, 221);
    doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
    yy += 8;
    doc.setFontSize(10);
    righe.forEach((r) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 51, 51);
      doc.text(r[0], M + 6, yy);
      if (r[2] === 'chip') {
        const w = chip(M + 6 + 42, yy, r[1], [232, 244, 253], [21, 101, 192]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else if (r[2] === 'chiprosso') {
        const w = chip(M + 6 + 42, yy, r[1], [253, 232, 232], [192, 57, 43]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 34, 34);
        doc.text(String(r[1]), M + 6 + 42, yy);
      }
      yy += 6.5;
    });
    y += altezza + 6;
  };

  if (dati.tipo === 'ESIGENZE') {
    sezione(
      'Collaboratore',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
        ['Nuovo turno:', dati.nuovoTurno, 'chiprosso', dati.nuovoOrari],
      ],
    );
  } else {
    sezione(
      'Collaboratore A (richiedente)',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
      ],
    );
    sezione(
      'Collaboratore B (accetta lo scambio)',
      [230, 126, 34],
      [250, 250, 250],
      [
        ['Nome:', dati.b.nome],
        ['Settore:', dati.b.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.b.turno, 'chip', dati.b.orari],
      ],
    );
  }
  if (dati.restituzione) {
    // IDENTICA a Turnivo: barra viola #8e44ad, sfondo #f8f0ff
    sezione(
      'Restituzione',
      [142, 68, 173],
      [248, 240, 255],
      [
        ['Data restituzione:', dati.restituzione],
        ['', 'In questa data i turni verranno scambiati nuovamente tra i due collaboratori.'],
      ],
    );
  }
  sezione('Motivazione', [46, 204, 113], [240, 250, 240], [['', dati.motivo || 'Nessuna motivazione specificata']]);
  // Autorizzazione con checkbox
  const hAut = 30;
  doc.setFillColor(250, 248, 252);
  doc.setDrawColor(221, 221, 221);
  doc.roundedRect(M, y, W, hAut, 1.8, 1.8, 'FD');
  doc.setFillColor(142, 68, 173);
  doc.rect(M, y, 1.6, hAut, 'F');
  let yy = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(44, 62, 80);
  doc.text('Autorizzazione', M + 6, yy);
  doc.setDrawColor(221, 221, 221);
  doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
  yy += 9;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.rect(M + 6, yy - 4, 5, 5);
  if (dati.autorizzato) {
    // spunta gia' marcata: il cambio e' stato applicato nel piano,
    // il foglio si stampa e si firma
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(34, 34, 34);
    doc.text('X', M + 7.2, yy);
    doc.setFont('helvetica', 'normal');
  }
  doc.setFontSize(11);
  doc.setTextColor(34, 34, 34);
  doc.text('Autorizzato', M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text('Non autorizzato', M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Motivo:', M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________________________________________________________________', M + 22, yy);
  y += hAut + 14;
  // firme
  const firme =
    dati.tipo === 'ESIGENZE'
      ? [
          ['Firma Collaboratore', dati.a.nome],
          ['Firma Responsabile', ''],
        ]
      : [
          ['Firma Collaboratore A', dati.a.nome],
          ['Firma Collaboratore B', dati.b.nome],
          ['Firma Responsabile', ''],
        ];
  const wBox = firme.length === 2 ? W * 0.45 : W * 0.3;
  const gap = (W - wBox * firme.length) / (firme.length - 1);
  y += 18;
  firme.forEach((f, i) => {
    const x = M + i * (wBox + gap);
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.35);
    doc.line(x, y, x + wBox, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text(f[0], x + wBox / 2, y + 4.5, { align: 'center' });
    if (f[1]) {
      doc.setFont('helvetica', 'bold');
      doc.text(f[1], x + wBox / 2, y + 9, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Data: ____/____/________', x + wBox / 2, y + (f[1] ? 13.5 : 9), { align: 'center' });
  });
  // footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(221, 221, 221);
  doc.line(M, ph - 14, 210 - M, ph - 14);
  doc.setFontSize(7.5);
  doc.setTextColor(85, 85, 85);
  doc.text('Casino Lugano SA · Richiesto da: ' + (dati.richiesto || getOperatore()), 105, ph - 9, {
    align: 'center',
  });
  return doc;
}

// ---- CERCA CAMBIO · "vorrei essere libero il giorno X" ----
// Il collaboratore chiede il giorno libero: il sistema trova i colleghi a
// riposo (C) quel giorno che possono coprire il suo turno e propone i giorni
// di RESTITUZIONE (stesso mese o successivo) in cui lui prende un turno del
// collega. Tutto verificato: idoneita', riposo minimo, massimo consecutivi.
let _ccDati = null;
async function apriCercaCambioLibero() {
  const sel = _pianoCellaSel;
  if (!sel || !puoGestirePiano()) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  const tMio = r ? _pianoTurnoInfo(r.codice) : null;
  if (!tMio) {
    toast('La cella deve avere un turno da coprire');
    return;
  }
  toast("Cerco con chi puo' cambiare...");
  const ym = _pianoMeseSel;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const fineMeseSucc = new Date(anno, mese + 1, 0, 12); // a mezzogiorno: toISOString (UTC) non torna al giorno prima
  const iso = (d) => d.toISOString().substring(0, 10);
  const daRange = new Date(sel.data + 'T12:00:00');
  daRange.setDate(daRange.getDate() - 8);
  // SENZA filtro settore: chi lavora in due settori ha celle anche nell'altro
  // piano, e quel giorno NON e' libero (prima risultava libero e la sua cella
  // dell'altro settore veniva sovrascritta)
  const righeTutte =
    (await secGet('piano?data=gte.' + iso(daRange) + '&data=lte.' + iso(fineMeseSucc) + '&limit=20000')) || [];
  const mappe = {}; // nome -> {data: codice}
  const bloccate = {}; // nome|data -> motivo (celle bloccate con motivo: non si toccano)
  righeTutte.forEach((x) => {
    (mappe[x.collaboratore] = mappe[x.collaboratore] || {})[x.data] = x.codice;
    if (_pianoCellaRiservata(x)) bloccate[x.collaboratore + '|' + x.data] = _pianoCellaRiservata(x);
  });
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const giornoRel = (dstr, n) => {
    const d = new Date(dstr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const riposoTra = (codA, codB) => {
    const t1 = _pianoTurnoInfo(codA);
    const t2 = _pianoTurnoInfo(codB);
    if (!t1 || !t2) return null;
    const fine1 = _pianoOra(t1.ora_fine);
    const inizio2 = _pianoOra(t2.ora_inizio);
    if (fine1 == null || inizio2 == null) return null;
    const fineAbs = fine1 <= _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
    return 24 + inizio2 - fineAbs;
  };
  // simula: nella mappa di "nome", il giorno dstr diventa "codice"; ritorna
  // l'eventuale problema (riposo o consecutivi), null se tutto ok
  const problema = (mappa, dstr, codice) => {
    const m2 = Object.assign({}, mappa);
    m2[dstr] = codice;
    if (_pianoTurnoInfo(codice)) {
      const rP = riposoTra(m2[giornoRel(dstr, -1)], codice);
      if (rP != null && rP < minRiposo) return 'riposo ' + rP.toFixed(1) + 'h';
      const rD = riposoTra(codice, m2[giornoRel(dstr, 1)]);
      if (rD != null && rD < minRiposo) return 'riposo ' + rD.toFixed(1) + 'h';
      let cons = 1;
      for (let n = -1; n >= -maxCons - 2 && _pianoIsLavoro(m2[giornoRel(dstr, n)] || ''); n--) cons++;
      for (let n = 1; n <= maxCons + 2 && _pianoIsLavoro(m2[giornoRel(dstr, n)] || ''); n++) cons++;
      if (cons > maxCons) return cons + ' consecutivi';
    }
    return null;
  };
  const eLibero = (cod) => !cod || (!_pianoTurnoInfo(cod) && ['C', ''].includes(String(cod)));
  // CANDIDATI: a riposo il giorno X, idonei al turno, regole rispettate
  const candidati = [];
  collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && c.nome !== sel.nome && c.funzione !== 'RESP')
    .forEach((c) => {
      const mia = mappe[c.nome] || {};
      if (!eLibero(mia[sel.data])) return;
      if (bloccate[c.nome + '|' + sel.data]) return; // cella bloccata con motivo
      if (!_pianoIdoneoPerTurno(c.nome, tMio)) return;
      const prob = problema(mia, sel.data, r.codice);
      if (prob) return;
      // accompagnamento il giorno X: il richiedente esce (C), il collega entra
      if (
        _pianoAccompagnamentoAvviso([
          { nome: sel.nome, data: sel.data, codice: 'C' },
          { nome: c.nome, data: sel.data, codice: r.codice },
        ]).length
      )
        return;
      // RESTITUZIONI: giorni dopo X (fino a fine mese successivo) dove il
      // collega lavora e il richiedente e' libero, con scambio inverso valido
      const mioPiano = Object.assign({}, mappe[sel.nome] || {});
      mioPiano[sel.data] = 'C'; // dopo il cambio il richiedente e' libero il giorno X
      const suoPiano = Object.assign({}, mia);
      suoPiano[sel.data] = r.codice;
      const rest = [];
      let d = new Date(sel.data + 'T12:00:00');
      for (let k = 0; k < 62 && rest.length < 14; k++) {
        d.setDate(d.getDate() + 1);
        const y = iso(d);
        if (y > iso(fineMeseSucc)) break;
        const codSuo = suoPiano[y];
        const tSuo = _pianoTurnoInfo(codSuo);
        if (!tSuo) continue;
        if (!eLibero(mioPiano[y])) continue;
        if (bloccate[c.nome + '|' + y] || bloccate[sel.nome + '|' + y]) continue;
        if (!_pianoIdoneoPerTurno(sel.nome, tSuo)) continue;
        if (problema(mioPiano, y, codSuo)) continue;
        // accompagnamento il giorno di restituzione: il collega esce (C), il
        // richiedente entra prendendo il turno del collega
        if (
          _pianoAccompagnamentoAvviso([
            { nome: c.nome, data: y, codice: 'C' },
            { nome: sel.nome, data: y, codice: codSuo },
          ]).length
        )
          continue;
        rest.push({ data: y, codice: codSuo, stesso: codSuo === r.codice, meseDopo: y.substring(0, 7) !== ym });
      }
      rest.sort((a, b) => (b.stesso ? 1 : 0) - (a.stesso ? 1 : 0) || (a.data < b.data ? -1 : 1));
      candidati.push({ nome: c.nome, jolly: c.impiego === 'jolly' || c.is_jolly, rest: rest });
    });
  candidati.sort((a, b) => b.rest.length - a.rest.length || a.nome.localeCompare(b.nome));
  if (!candidati.length) {
    toast("Nessun collega a riposo quel giorno puo' coprire " + r.codice + ' rispettando le regole');
    return;
  }
  _ccDati = { nome: sel.nome, data: sel.data, codice: r.codice, candidati: candidati };
  const dataIt = sel.data.split('-').reverse().join('.');
  let h =
    '<h3>Cerca cambio · ' +
    escP(sel.nome) +
    ' libero il ' +
    dataIt +
    '</h3><p style="font-size:.85rem;margin-bottom:10px">' +
    escP(sel.nome.split(' ')[0]) +
    ' cede il turno <b>' +
    escP(r.codice) +
    '</b> a un collega a riposo e lo restituisce prendendo un turno del collega in un altro giorno. Tutte le proposte rispettano idoneità, riposo minimo e giorni consecutivi.</p>' +
    '<div class="field" style="text-align:left"><label>Chi copre il ' +
    dataIt +
    '</label><select id="cc-collega" style="width:100%;padding:9px" onchange="ccAggiornaRestituzioni()">' +
    candidati
      .map(
        (c, i) =>
          '<option value="' +
          i +
          '">' +
          escP(c.nome) +
          (c.jolly ? ' (jolly)' : '') +
          ' · ' +
          c.rest.length +
          ' date possibili per la restituzione</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Giorno di restituzione</label><select id="cc-rest" style="width:100%;padding:9px"></select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Motivazione</label><input type="text" id="cc-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<p style="font-size:.82rem;color:var(--muted);margin-top:8px">Puoi stampare la lista dei colleghi con cui puo\' cambiare e consegnarla al collaboratore: lui chiede a chi vuole, poi si torna qui e si conferma. Alla conferma: celle aggiornate col commento del cambio, formulario cambio turno gia\' compilato da stampare e firmare, conteggio nel limite cambi del richiedente.</p>' +
    '<div class="pwd-modal-btns" style="margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button>' +
    '<button class="btn-export" style="padding:8px 14px" onclick="stampaListaCambioLibero()">Stampa lista colleghi</button>' +
    '<button class="btn-modal-ok" onclick="confermaCercaCambioLibero()">Applica cambio</button></div>';
  document.getElementById('pwd-modal-content').innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
  ccAggiornaRestituzioni();
}
// PDF della lista colleghi con cui il collaboratore puo' cambiare il giorno X,
// da consegnargli PRIMA di confermare: lui chiede, poi si torna e si applica
async function stampaListaCambioLibero() {
  if (!_ccDati) return;
  if (!window.jspdf) await caricaJsPDF();
  const doc = new window.jspdf.jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const dataIt = _ccDati.data.split('-').reverse().join('.');
  doc.setFontSize(13);
  doc.text('Cambio turno · colleghi disponibili', pw / 2, 16, { align: 'center' });
  doc.setFontSize(10);
  doc.text(_ccDati.nome + ' chiede di essere libero il ' + dataIt + ' (turno ' + _ccDati.codice + ')', pw / 2, 24, {
    align: 'center',
  });
  doc.setFontSize(8.5);
  doc.text(
    'Questi colleghi sono a riposo quel giorno e possono coprire rispettando le regole. ' +
      'Il turno va restituito prendendo un turno del collega in una delle date indicate.',
    pw / 2,
    31,
    { align: 'center', maxWidth: pw - 28 },
  );
  doc.autoTable({
    theme: 'grid',
    startY: 38,
    head: [['Collega', 'Tipo', 'Date possibili per restituire il turno']],
    body: _ccDati.candidati.map((c) => [
      c.nome,
      c.jolly ? 'jolly' : 'fisso',
      c.rest.length
        ? c.rest
            .slice(0, 10)
            .map((rr) => rr.data.split('-').reverse().join('.') + ' (' + rr.codice + ')' + (rr.stesso ? ' =' : ''))
            .join(',  ') + (c.rest.length > 10 ? '  ...' : '')
        : 'nessuna data compatibile',
    ]),
    headStyles: { fillColor: [26, 74, 122], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { cellWidth: 105 } },
    margin: { left: 12, right: 12 },
  });
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8.5);
  doc.text('"=" indica una data in cui il collega fa lo stesso turno (' + _ccDati.codice + ').', 14, y);
  y += 12;
  doc.text('Collega scelto: ______________________     Data restituzione: ______________', 14, y);
  y += 10;
  doc.text('Firma richiedente: __________________     Firma collega: __________________', 14, y);
  doc.setFontSize(8);
  doc.text(
    'Casino Lugano SA · lista informativa, il cambio va confermato dal responsabile',
    14,
    doc.internal.pageSize.getHeight() - 8,
  );
  mostraPdfPreview(doc, 'colleghi_cambio_' + _ccDati.data + '.pdf', 'Colleghi per il cambio');
}
function ccAggiornaRestituzioni() {
  if (!_ccDati) return;
  const i = parseInt((document.getElementById('cc-collega') || {}).value) || 0;
  const c = _ccDati.candidati[i];
  const sel = document.getElementById('cc-rest');
  if (!sel || !c) return;
  sel.innerHTML =
    '<option value="">senza restituzione (solo copertura)</option>' +
    c.rest
      .map(
        (x) =>
          '<option value="' +
          x.data +
          '">' +
          x.data.split('-').reverse().join('.') +
          ' · prende ' +
          escP(x.codice) +
          (x.stesso ? ' (stesso turno)' : '') +
          (x.meseDopo ? ' · mese successivo' : '') +
          '</option>',
      )
      .join('');
}
async function confermaCercaCambioLibero() {
  if (!_ccDati || !puoGestirePiano()) return;
  if (!_pianoConsentiScrittura(_ccDati.data)) return; // giorno chiuso
  const i = parseInt((document.getElementById('cc-collega') || {}).value) || 0;
  const cand = _ccDati.candidati[i];
  const dataRest = (document.getElementById('cc-rest') || {}).value || '';
  const motivo = ((document.getElementById('cc-motivo') || {}).value || '').trim();
  const rInfo = cand.rest.find((x) => x.data === dataRest);
  const dataIt = _ccDati.data.split('-').reverse().join('.');
  const op = getOperatore();
  // limite cambi mensile: a carico di chi RICHIEDE il giorno libero
  const maxC = _pianoMaxCambi();
  if (maxC > 0) {
    const richiesti = await _pianoCambiRichiesti(_pianoMeseSel);
    const n = richiesti[_ccDati.nome] || 0;
    if (n >= maxC) {
      if (
        !confirm(
          'ATTENZIONE: ' +
            _ccDati.nome +
            " ha gia' richiesto " +
            n +
            '/' +
            maxC +
            " cambi questo mese.\n\nAutorizzi comunque il cambio come responsabile? (verra' registrato nello storico come autorizzazione in deroga)",
        )
      )
        return;
      logAzione('Piano: scambio autorizzato oltre limite', _ccDati.nome + ' (' + (n + 1) + '/' + maxC + ') da ' + op);
    }
  }
  let msg =
    _ccDati.nome + " sara' LIBERO (C) il " + dataIt + ';\n' + cand.nome + " coprira' il turno " + _ccDati.codice + '.';
  if (rInfo)
    msg +=
      '\n\nRESTITUZIONE il ' +
      dataRest.split('-').reverse().join('.') +
      ': ' +
      _ccDati.nome.split(' ')[0] +
      ' prende il turno ' +
      rInfo.codice +
      ' di ' +
      cand.nome.split(' ')[0] +
      ', che va a riposo (C).';
  else msg += '\n\nSenza restituzione automatica.';
  if (!confirm(msg + "\n\nConfermi? Verra' generato il formulario cambio turno da stampare e firmare.")) return;
  _pianoUndoSnap('cerca cambio ' + _ccDati.data);
  const scrivi = async (nome, dstr, codice, exCod, commento) => {
    const righe =
      (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + dstr + '&limit=5')) || [];
    const r0 = righe[0];
    if (r0 && (r0.reparto_dip || 'slots') !== _pianoReparto())
      throw new Error(nome + ' il ' + dstr + ' ha una cella nel piano ' + repartoLabel(r0.reparto_dip));
    if (r0 && _pianoCellaRiservata(r0))
      throw new Error(nome + ' il ' + dstr + ': cella riservata (' + _pianoCellaRiservata(r0) + ')');
    const body = {
      codice: codice,
      protetto: true,
      generato: false,
      commento: commento.substring(0, 400),
      operatore: op,
    };
    if (r0) {
      body.updated_at = new Date().toISOString();
      await secPatch('piano', 'id=eq.' + r0.id, body);
      const inMem = _pianoRighe.find((x) => x.id === r0.id);
      if (inMem) Object.assign(inMem, body);
    } else {
      body.collaboratore = nome;
      body.data = dstr;
      body.reparto_dip = _pianoReparto();
      await _pianoInserisciCella(body);
    }
  };
  try {
    // commenti nello stesso formato dello scambio classico: Ex <vecchio> - cambio con <nome> - <operatore>
    await scrivi(
      _ccDati.nome,
      _ccDati.data,
      'C',
      _ccDati.codice,
      'Ex ' + _ccDati.codice + ' - cambio con ' + cand.nome + ' - ' + op,
    );
    await scrivi(cand.nome, _ccDati.data, _ccDati.codice, 'C', 'Ex C - cambio con ' + _ccDati.nome + ' - ' + op);
    if (rInfo) {
      await scrivi(
        cand.nome,
        dataRest,
        'C',
        rInfo.codice,
        'Ex ' + rInfo.codice + ' - restituzione cambio con ' + _ccDati.nome + ' - ' + op,
      );
      await scrivi(
        _ccDati.nome,
        dataRest,
        rInfo.codice,
        'C',
        'Ex C - restituzione cambio con ' + cand.nome + ' - ' + op,
      );
    }
    logAzione(
      'Piano: scambio turno',
      _ccDati.nome +
        ' (giorno libero il ' +
        _ccDati.data +
        ' coperto da ' +
        cand.nome +
        (dataRest ? ', restituzione ' + dataRest : ', senza restituzione') +
        ')',
    );
    document.getElementById('pwd-modal').classList.add('hidden');
    // FORMULARIO gia' compilato, con la spunta Autorizzato: si stampa e si firma
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const t = _pianoTurnoInfo(_ccDati.codice);
      const fmtOra = (tt) =>
        tt
          ? '(' +
            (tt.ora_inizio || '').substring(0, 5) +
            '-' +
            (tt.ora_fine || '').substring(0, 5) +
            ', ' +
            (tt.gruppo || '') +
            ')'
          : '';
      const datiPdf = {
        tipo: 'SCAMBIO',
        data: new Date(_ccDati.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: _ccDati.nome, settore: repartoLabel(_pianoReparto()), turno: _ccDati.codice, orari: fmtOra(t) },
        b: { nome: cand.nome, settore: repartoLabel(_pianoReparto()), turno: 'C (riposo)', orari: '' },
        motivo: motivo || 'Richiesta giorno libero',
        richiesto: op,
        autorizzato: true,
        restituzione: rInfo
          ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') +
            ' \u00b7 ' +
            _ccDati.nome.split(' ')[0] +
            ' prende il turno ' +
            rInfo.codice +
            ' di ' +
            cand.nome.split(' ')[0]
          : null,
      };
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + _ccDati.data + '.pdf', 'Cambio turno ' + _ccDati.data);
      await _salvaFoglioCambio(datiPdf, _ccDati.nome, _ccDati.data);
    }
    toast('Cambio applicato' + (rInfo ? ' con restituzione' : ''));
    _ccDati = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore applicazione cambio');
  }
}

// Il foglio del cambio resta ARCHIVIATO (tabella moduli, tipo cambio_turno):
// si ristampa in qualsiasi momento dal menu della cella
async function _salvaFoglioCambio(datiPdf, collaboratore, dataCambio) {
  try {
    const rec = {
      tipo: 'cambio_turno',
      collaboratore: collaboratore,
      data_modulo: dataCambio,
      dati: datiPdf,
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    const saved = await secPost('moduli', rec);
    if (saved && saved[0] && typeof moduliCache !== 'undefined') moduliCache.unshift(saved[0]);
  } catch (e) {
    console.error('archivio foglio cambio', e);
  }
}
async function ristampaFoglioCambio(nome, dstr) {
  try {
    let tutti = (await secGet('moduli?tipo=eq.cambio_turno&data_modulo=eq.' + dstr + '&limit=50')) || [];
    const perNome = (lista) =>
      lista.filter(
        (m) =>
          !m.eliminato &&
          m.dati &&
          ((m.dati.a && m.dati.a.nome === nome) || (m.dati.b && m.dati.b.nome === nome) || m.collaboratore === nome),
      );
    let miei = perNome(tutti);
    if (!miei.length) {
      // cella della RESTITUZIONE: il foglio e' archiviato sul giorno del
      // cambio, ma la data di restituzione compare nel campo dedicato
      const dataIt = new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT');
      const recenti = (await secGet('moduli?tipo=eq.cambio_turno&order=created_at.desc&limit=100')) || [];
      miei = perNome(recenti).filter((m) => String(m.dati.restituzione || '').includes(dataIt));
    }
    miei = miei.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (!miei.length) {
      toast('Nessun foglio cambio archiviato per ' + nome.split(' ')[0] + ' in questa data');
      return;
    }
    if (!window.jspdf) await caricaJsPDF();
    const doc = _pdfCambioTurno(miei[0].dati);
    mostraPdfPreview(doc, 'cambio_turno_' + dstr + '.pdf', 'Cambio turno ' + dstr);
  } catch (e) {
    console.error(e);
    toast('Errore ristampa foglio');
  }
}
// ---- Scambio turno tra colleghi (come Turnivo cap. 19) ----
async function apriScambioTurno() {
  const sel = _pianoCellaSel;
  if (!sel) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  if (r.motivo_blocco) {
    toastErrore('Cella bloccata: ' + r.motivo_blocco + '. Sbloccala prima di scambiarla.');
    return;
  }
  // colleghi con un TURNO quel giorno (scambio turno-turno), dello STESSO
  // settore: le celle di un altro settore dei coprenti (in corsivo) non si
  // scambiano da qui; le celle bloccate con motivo restano fuori
  const colleghi = _pianoRighe.filter(
    (x) =>
      x.data === sel.data &&
      x.collaboratore !== sel.nome &&
      (x.reparto_dip || 'slots') === _pianoReparto() &&
      !x.motivo_blocco &&
      _pianoTurnoInfo(x.codice),
  );
  if (!colleghi.length) {
    toast('Nessun collega con un turno quel giorno');
    return;
  }
  // come "Cerca cambio turno" di Turnivo: verifica per ogni collega se lo
  // scambio sarebbe valido (idoneità ai turni incrociati + riposo 11h)
  const g = parseInt(sel.data.split('-')[2]);
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const cellaMese = {};
  _pianoRighe.forEach((x) => (cellaMese[x.collaboratore + '|' + parseInt(x.data.split('-')[2])] = x.codice));
  const riposoOkCon = (nomeX, gX, t) => {
    const prev = _pianoTurnoInfo(cellaMese[nomeX + '|' + (gX - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = finePrev <= _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cellaMese[nomeX + '|' + (gX + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = fine <= _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  const tMio = _pianoTurnoInfo(r.codice);
  // limite cambi al mese: conta solo i cambi RICHIESTI dal collaboratore
  // (es. limite 3: Mario chiede 3 cambi e li esaurisce, Paolo che ha solo
  // accettato può ancora chiederne 3 a sua volta)
  const maxCambi = _pianoMaxCambi();
  const cambiRichiesti = maxCambi > 0 ? await _pianoCambiRichiesti(_pianoMeseSel) : {};
  const mieiCambi = cambiRichiesti[sel.nome] || 0;
  const problemaCon = (c) => {
    if (maxCambi > 0 && mieiCambi >= maxCambi)
      return 'limite superato (' + mieiCambi + '/' + maxCambi + '): serve autorizzazione';
    const tSuo = _pianoTurnoInfo(c.codice);
    if (!_pianoIdoneoPerTurno(sel.nome, tSuo)) return 'tu non sei idoneo a ' + c.codice;
    if (!_pianoIdoneoPerTurno(c.collaboratore, tMio)) return 'non idoneo a ' + r.codice;
    if (!riposoOkCon(sel.nome, g, tSuo) || !riposoOkCon(c.collaboratore, g, tMio)) return 'riposo 11h violato';
    return null;
  };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambio turno · ' +
    new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(sel.nome) +
    '</strong> (' +
    escP(r.codice) +
    ') scambia con:</p>' +
    (maxCambi > 0
      ? '<p style="font-size:.82rem;color:' +
        (mieiCambi >= maxCambi ? '#c0392b' : 'var(--muted)') +
        ';margin-bottom:6px">Cambi richiesti da ' +
        escP(sel.nome.split(' ')[0]) +
        ' questo mese: ' +
        mieiCambi +
        '/' +
        maxCambi +
        ' (chi accetta non consuma il suo limite)</p>'
      : '') +
    '<select id="scambio-collega" style="width:100%;padding:10px">' +
    colleghi
      .map((c) => {
        const prob = problemaCon(c);
        return (
          '<option value="' +
          escP(c.collaboratore) +
          '"' +
          (prob ? ' style="color:#c0392b"' : '') +
          '>' +
          escP(c.collaboratore) +
          ' · ' +
          escP(c.codice) +
          (prob ? ' ⚠ ' + prob : ' ✓') +
          '</option>'
        );
      })
      .join('') +
    '</select><div class="field" style="text-align:left;margin-top:10px"><label>Motivazione</label><input type="text" id="scambio-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<div style="text-align:left;margin-top:10px"><label style="font-weight:700;font-size:.86rem"><input type="checkbox" id="scambio-restituito" onchange="document.getElementById(\'scambio-rest-wrap\').style.display=this.checked?\'block\':\'none\'"> Con restituzione</label>' +
    '<div id="scambio-rest-wrap" style="display:none;margin-top:6px"><label style="font-size:.8rem">Data restituzione:</label> <input type="date" id="scambio-data-rest" style="padding:6px;max-width:180px"></div></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioTurno()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaScambioTurno() {
  const sel = _pianoCellaSel;
  if (sel && sel.data && !_pianoConsentiScrittura(sel.data)) return; // giorno chiuso
  const collega = (document.getElementById('scambio-collega') || {}).value;
  const motivo = ((document.getElementById('scambio-motivo') || {}).value || '').trim();
  const conRest = (document.getElementById('scambio-restituito') || {}).checked;
  let dataRest = conRest ? (document.getElementById('scambio-data-rest') || {}).value || '' : '';
  if (conRest && dataRest && dataRest <= sel.data) {
    toast('La data di restituzione deve essere successiva al giorno del cambio');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !collega) return;
  const maxC = _pianoMaxCambi();
  if (maxC > 0) {
    const richiesti = await _pianoCambiRichiesti(_pianoMeseSel);
    const n = richiesti[sel.nome] || 0;
    if (n >= maxC) {
      // niente blocco duro: il responsabile può autorizzare l'eccezione
      if (
        !confirm(
          'ATTENZIONE: ' +
            sel.nome +
            ' ha già richiesto ' +
            n +
            '/' +
            maxC +
            ' cambi questo mese.\n\nAutorizzi comunque lo scambio come responsabile? (verrà registrato nello storico come autorizzazione in deroga)',
        )
      )
        return;
      window._pianoDerogaDaRegistrare = sel.nome + ' (' + (n + 1) + '/' + maxC + ') da ' + getOperatore();
    }
  }
  const r1 = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  const r2 = _pianoRighe.find((x) => x.collaboratore === collega && x.data === sel.data);
  if (!r1 || !r2) return;
  const c1 = r1.codice;
  const c2 = r2.codice;
  // STESSE REGOLE DEL PIANO MANUALE, per TUTTI E DUE i lati dello scambio:
  // avviso + conferma del responsabile e violazione scritta nel commento
  let nota1 = '';
  let nota2 = '';
  if (typeof _pianoAvvisaViolazioniCella === 'function') {
    const av1 = _pianoTurnoInfo(c2) ? await _pianoAvvisaViolazioniCella(sel.nome, sel.data, c2) : [];
    const av2 = _pianoTurnoInfo(c1) ? await _pianoAvvisaViolazioniCella(collega, sel.data, c1) : [];
    // accompagnamento: valutato UNA volta con ENTRAMBE le celle scambiate,
    // instradato nel lato giusto per collaboratore
    _pianoAccompagnamentoAvviso([
      { nome: sel.nome, data: sel.data, codice: c2 },
      { nome: collega, data: sel.data, codice: c1 },
    ]).forEach((a) => (a.nome === collega ? av2 : av1).push(a.testo));
    if (av1.length || av2.length) {
      const dettagli = []
        .concat(av1.map((a) => sel.nome.split(' ')[0] + ': ' + a))
        .concat(av2.map((a) => collega.split(' ')[0] + ': ' + a));
      if (
        !confirm(
          '⚠ ATTENZIONE · scambio ' +
            sel.data.split('-').reverse().join('.') +
            ':\n\n• ' +
            dettagli.join('\n• ') +
            "\n\nConfermi comunque lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        )
      )
        return;
      if (av1.length) nota1 = '⚠ ' + av1.join(' · ') + ' · ';
      if (av2.length) nota2 = '⚠ ' + av2.join(' · ') + ' · ';
    }
  }
  // Restituzione: valido lo scambio inverso del giorno di restituzione PRIMA di
  // applicare qualsiasi cosa, cosi' se l'operatore annulla non e' stato toccato
  // nulla. Le note vanno poi nei commenti delle celle di restituzione.
  let notaRa = '';
  let notaRb = '';
  if (dataRest && typeof _pianoAvvisaViolazioniCella === 'function') {
    const raPre = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === dataRest);
    const rbPre = _pianoRighe.find((x) => x.collaboratore === collega && x.data === dataRest);
    const caPre = raPre ? raPre.codice : '';
    const cbPre = rbPre ? rbPre.codice : '';
    const avA = _pianoTurnoInfo(cbPre) ? await _pianoAvvisaViolazioniCella(sel.nome, dataRest, cbPre) : [];
    const avB = _pianoTurnoInfo(caPre) ? await _pianoAvvisaViolazioniCella(collega, dataRest, caPre) : [];
    _pianoAccompagnamentoAvviso([
      { nome: sel.nome, data: dataRest, codice: cbPre },
      { nome: collega, data: dataRest, codice: caPre },
    ]).forEach((a) => (a.nome === collega ? avB : avA).push(a.testo));
    if (avA.length || avB.length) {
      const det = []
        .concat(avA.map((a) => sel.nome.split(' ')[0] + ': ' + a))
        .concat(avB.map((a) => collega.split(' ')[0] + ': ' + a));
      if (
        !confirm(
          '⚠ ATTENZIONE · restituzione del ' +
            dataRest.split('-').reverse().join('.') +
            ':\n\n• ' +
            det.join('\n• ') +
            "\n\nConfermi comunque tutto lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        )
      )
        return;
      if (avA.length) notaRa = '⚠ ' + avA.join(' · ') + ' · ';
      if (avB.length) notaRb = '⚠ ' + avB.join(' · ') + ' · ';
    }
  }
  // RESTITUZIONE: le celle del giorno di restituzione si leggono dal database
  // (puo' essere nel mese dopo, che non e' in memoria). Prima si cercavano
  // solo nel mese aperto: la restituzione veniva registrata ma mai scritta.
  let ra = null;
  let rb = null;
  if (dataRest) {
    const trova = async (nomeC) =>
      ((await secGet('piano?collaboratore=eq.' + encodeURIComponent(nomeC) + '&data=eq.' + dataRest + '&limit=2')) ||
        [])[0] || null;
    ra = await trova(sel.nome);
    rb = await trova(collega);
    const altroSettore = [ra, rb].find((x) => x && (x.reparto_dip || 'slots') !== _pianoReparto());
    if (altroSettore) {
      toastErrore(
        'Il ' +
          new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') +
          ' ' +
          altroSettore.collaboratore +
          ' ha una cella nel piano ' +
          repartoLabel(altroSettore.reparto_dip) +
          ': scegli un altro giorno di restituzione.',
      );
      return;
    }
    const bloccata = [ra, rb].find((x) => x && x.motivo_blocco);
    if (bloccata) {
      toastErrore('Cella del ' + dataRest + ' bloccata (' + bloccata.motivo_blocco + '): scegli un altro giorno.');
      return;
    }
  }
  _pianoUndoSnap('scambio turno ' + sel.data);
  try {
    await secPatch('piano', 'id=eq.' + r1.id, {
      codice: c2,
      protetto: true,
      commento: (nota1 + (c1 ? 'Ex ' + c1 + ' - ' : '') + 'cambio con ' + collega + ' - ' + getOperatore()).substring(
        0,
        400,
      ),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    await secPatch('piano', 'id=eq.' + r2.id, {
      codice: c1,
      protetto: true,
      commento: (nota2 + (c2 ? 'Ex ' + c2 + ' - ' : '') + 'cambio con ' + sel.nome + ' - ' + getOperatore()).substring(
        0,
        400,
      ),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r1.codice = c2;
    r2.codice = c1;
    r1.protetto = r2.protetto = true;
    // Restituzione: come Turnivo, scambio inverso applicato subito alla data indicata
    if (dataRest) {
      const op = getOperatore();
      // chi quel giorno non ha cella e' libero: dopo la restituzione riceve C
      const ca = ra ? ra.codice : 'C';
      const cb = rb ? rb.codice : 'C';
      const applica = async (riga, nomeC, nuovoCod, exCod, altroNome, notaR) => {
        const commento = (notaR || '') + 'Ex ' + exCod + ' - restituzione cambio con ' + altroNome + ' - ' + op;
        if (riga) {
          await secPatch('piano', 'id=eq.' + riga.id, {
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            operatore: op,
            updated_at: new Date().toISOString(),
          });
          riga.codice = nuovoCod;
          riga.protetto = true;
          riga.commento = commento;
        } else if (nuovoCod) {
          const n = await _pianoInserisciCella({
            collaboratore: nomeC,
            data: dataRest,
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            reparto_dip: _pianoReparto(),
            operatore: op,
          });
          if (n && String(dataRest).startsWith(_pianoMeseSel)) _pianoRighe.push(Array.isArray(n) ? n[0] : n);
        }
      };
      await applica(ra, sel.nome, cb, ca, collega, notaRa);
      await applica(rb, collega, ca, cb, sel.nome, notaRb);
      logAzione('Piano: restituzione programmata', sel.nome + ' <-> ' + collega + ' il ' + dataRest);
    }
    logAzione('Piano: scambio turno', sel.nome + ' (' + c1 + ') <-> ' + collega + ' (' + c2 + ') il ' + sel.data);
    if (window._pianoDerogaDaRegistrare) {
      logAzione('Piano: scambio autorizzato oltre limite', window._pianoDerogaDaRegistrare);
      window._pianoDerogaDaRegistrare = null;
    }
    toast(
      'Turni scambiati' +
        (dataRest ? ' · restituzione il ' + new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : ''),
    );
    // Formulario IDENTICO a Turnivo
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const t1 = _pianoTurnoInfo(c1);
      const t2 = _pianoTurnoInfo(c2);
      const fmtOra = (t) =>
        t
          ? '(' +
            (t.ora_inizio || '').substring(0, 5) +
            '-' +
            (t.ora_fine || '').substring(0, 5) +
            ', ' +
            (t.gruppo || '') +
            ')'
          : '';
      const datiPdf = {
        tipo: 'SCAMBIO',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: c1, orari: fmtOra(t1) },
        b: { nome: collega, settore: repartoLabel(_pianoReparto()), turno: c2, orari: fmtOra(t2) },
        motivo: motivo,
        richiesto: getOperatore(),
        autorizzato: true,
        restituzione: dataRest ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : null,
      };
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + sel.data + '.pdf', 'Cambio turno ' + sel.data);
      await _salvaFoglioCambio(datiPdf, sel.nome, sel.data);
    }
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore scambio turno');
  }
}

// ---- Selezione riga/colonna stile Excel (come Turnivo) ----
async function salvaOrdinePiano(nomi) {
  if (!puoGestirePiano()) return;
  window._pianoOrdineCollab = window._pianoOrdineCollab || {};
  window._pianoOrdineCollab[_pianoReparto()] = nomi;
  if (!(await salvaImp('piano_ordine_collab', JSON.stringify(window._pianoOrdineCollab)))) return;
  logAzione('Piano: ordine collaboratori', _pianoReparto());
  toast('Ordine salvato');
}
async function ripristinaOrdinePiano() {
  if (!puoGestirePiano()) return;
  window._pianoOrdineCollab = window._pianoOrdineCollab || {};
  delete window._pianoOrdineCollab[_pianoReparto()];
  if (!(await salvaImp('piano_ordine_collab', JSON.stringify(window._pianoOrdineCollab)))) return;
  logAzione('Piano: ordine predefinito', _pianoReparto());
  toast('Ordine predefinito: SUP, BO, poi gli altri');
  renderPiano();
}

// ================================================================
// COPERTURA MALATTIA · port di malattia_cerca/malattia_conferma di
// Turnivo: per ogni giorno del periodo propone il miglior sostituto
// libero e idoneo (greedy: meno ore mese + meno giorni consecutivi),
// alla conferma mette M al malato e i turni (protetti) ai sostituti.
// ================================================================
function _pianoIdoneoPerTurno(nome, turno) {
  // idoneita' (settori, regole di gruppo, solo_diurni, turni bloccati, mappatura
  // funzione, regola L1): la logica vive nel motore puro PianoRegole, qui si
  // iniettano solo gli accessi allo stato dell'app
  const info = _pianoCollabInfo(nome) || {};
  return PianoRegole.idoneoPerTurno(info, turno, {
    settoriDi: (i) => _pianoSettoriEffettivi(i),
    regoleGruppoDi: (gr) => _pianoRegoleGruppoDi(gr),
    campoOk: (i, v) => _pianoCampoOk(i, v),
    mappFunzione: (fz) => _pianoMappFunzione(fz),
    regolaVal: (n) => _pianoRegolaVal(n),
    regoleTurnoFunzione: () => _pianoRegoleTurnoFunzione(),
    fannoTutto: (fz) => _pianoFunzioniFannoTutto().has(fz),
  });
}
function apriCoperturaMalattia() {
  if (!puoGestirePiano()) return;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Copertura malattia · ' +
    _pianoMeseSel +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Cerca i migliori sostituti liberi per i turni del collaboratore malato.</p>' +
    '<div class="field" style="text-align:left"><label>Collaboratore malato</label><select id="mal-collab" style="width:100%;padding:8px">' +
    nomi.map((n) => '<option>' + escP(n) + '</option>').join('') +
    '</select></div>' +
    '<div style="display:flex;gap:10px;margin-top:8px"><div class="field" style="text-align:left"><label>Dal giorno</label><input type="number" id="mal-da" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div>' +
    '<div class="field" style="text-align:left"><label>Al giorno</label><input type="number" id="mal-al" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div></div>' +
    '<div id="mal-risultati" style="text-align:left;margin-top:10px;max-height:40vh;overflow:auto"></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" id="mal-btn-cerca" onclick="cercaSostitutiMalattia()">Cerca sostituti</button>' +
    '<button class="btn-modal-ok" id="mal-btn-conferma" style="display:none;background:#c0392b" onclick="confermaCoperturaMalattia()">Conferma copertura</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
let _malattiaPiano = null;
async function cercaSostitutiMalattia() {
  const nome = (document.getElementById('mal-collab') || {}).value;
  const da = parseInt((document.getElementById('mal-da') || {}).value);
  const al = parseInt((document.getElementById('mal-al') || {}).value);
  const out = document.getElementById('mal-risultati');
  if (!nome || isNaN(da) || isNaN(al) || da > al) {
    toast('Compila collaboratore e periodo (dal ≤ al)');
    return;
  }
  out.innerHTML = '<p style="color:var(--muted)">Ricerca in corso...</p>';
  const ym = _pianoMeseSel;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const cella = {}; // nome|g -> codice (con overrides progressivi)
  const rigaDi = {};
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  // CROSS-MESE: carico gli ultimi giorni del mese precedente e i primi del
  // successivo con indice continuo (0, -1... e oltre l'ultimo del mese), cosi'
  // riposo e consecutivi valgono anche a cavallo tra un mese e l'altro
  const _primoDelMese = new Date(ym + '-01T12:00:00');
  const _nGiorniMese = _pianoUltimoGiorno(ym);
  const _isoB = (d) => d.toISOString().substring(0, 10);
  const _bDa = new Date(_primoDelMese);
  _bDa.setDate(_bDa.getDate() - 8);
  const _bAl = new Date(_primoDelMese);
  _bAl.setDate(_bAl.getDate() + _nGiorniMese + 7);
  try {
    const _righeBordo =
      (await secGet(
        'piano?data=gte.' + _isoB(_bDa) + '&data=lt.' + ym + '-01&reparto_dip=eq.' + _pianoReparto() + '&limit=4000',
      )) || [];
    const _righeBordo2 =
      (await secGet(
        'piano?data=gt.' +
          ym +
          '-' +
          String(_nGiorniMese).padStart(2, '0') +
          '&data=lte.' +
          _isoB(_bAl) +
          '&reparto_dip=eq.' +
          _pianoReparto() +
          '&limit=4000',
      )) || [];
    [..._righeBordo, ..._righeBordo2].forEach((r) => {
      const idx = Math.round((new Date(r.data + 'T12:00:00') - _primoDelMese) / 86400000) + 1;
      cella[r.collaboratore + '|' + idx] = r.codice;
    });
  } catch (e) {}
  const oreMese = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) oreMese[r.collaboratore] = (oreMese[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const consecFinoA = (n, g) => {
    let c = 0;
    // scende anche nel mese precedente (indici 0, -1, ...) per i consecutivi
    for (let k = g - 1; k >= g - 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) c++;
    return c;
  };
  const riposoOkSost = (n, g, t) => {
    const prev = _pianoTurnoInfo(cella[n + '|' + (g - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = finePrev <= _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cella[n + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = fine <= _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  // controllo COMPLETO per la persona n attorno al giorno g0, leggendo la
  // mappa `cella` gia' simulata: riposo 11h (prima e dopo) E max consecutivi.
  // Usato dalle mosse a catena per verificare TUTTI i collaboratori toccati.
  const regolaOkSost = (n, g0) => {
    const cod0 = cella[n + '|' + g0] || '';
    const t0 = _pianoTurnoInfo(cod0);
    if (t0) {
      const tPrev = _pianoTurnoInfo(cella[n + '|' + (g0 - 1)] || '');
      if (tPrev) {
        const fp = _pianoOra(tPrev.ora_fine);
        const fpAbs = fp <= _pianoOra(tPrev.ora_inizio) ? 24 + fp : fp;
        if (24 + _pianoOra(t0.ora_inizio) - fpAbs < minRiposo) return false;
      }
      const tNext = _pianoTurnoInfo(cella[n + '|' + (g0 + 1)] || '');
      if (tNext) {
        const f0 = _pianoOra(t0.ora_fine);
        const f0Abs = f0 <= _pianoOra(t0.ora_inizio) ? 24 + f0 : f0;
        if (24 + _pianoOra(tNext.ora_inizio) - f0Abs < minRiposo) return false;
      }
    }
    if (_pianoIsLavoro(cod0)) {
      let cons = 1;
      // conta a cavallo del mese in entrambe le direzioni
      for (let k = g0 - 1; k >= g0 - 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) cons++;
      for (let k = g0 + 1; k <= g0 + 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k++) cons++;
      if (cons > maxCons) return false;
    }
    return true;
  };
  // ACCOMPAGNAMENTO nella simulazione `cella`: nel giorno g0 nessun collega
  // "accompagnato" deve restare da solo nel suo gruppo
  const accompagnamentoOkSost = (g0) => {
    const conta = {};
    const accs = [];
    for (const nm of nomi) {
      const tt = _pianoTurnoInfo(cella[nm + '|' + g0] || '');
      if (!tt) continue;
      const gr = (tt.gruppo || '').toUpperCase();
      if (!gr) continue;
      conta[gr] = (conta[gr] || 0) + 1;
      const info = _pianoCollabInfo(nm);
      if (!info) continue;
      let acc = !!(info.accompagnamento_settori && _pianoAccompagnamentoDi(info).includes(gr));
      const cop = _pianoCoperturaCfg(info);
      if (cop && cop.accompagnato) acc = true;
      if (acc) accs.push(gr);
    }
    return accs.every((gr) => (conta[gr] || 0) > 1);
  };
  const giorni = [];
  for (let g = da; g <= al; g++) {
    const cod = cella[nome + '|' + g] || '';
    const t = _pianoTurnoInfo(cod);
    if (!cod) {
      giorni.push({ g: g, salta: 'Nessun turno assegnato' });
      continue;
    }
    if (cod === 'M' || cod === 'M1') {
      giorni.push({ g: g, salta: 'Già in malattia' });
      continue;
    }
    if (!t) {
      const cs = _pianoCodiceInfo(cod);
      giorni.push({
        g: g,
        salta: cs && cs.is_riposo ? 'Giorno di riposo (' + cod + ')' : 'Codice speciale (' + cod + ')',
      });
      continue;
    }
    // candidati: liberi quel giorno (nessuna cella o codice di riposo non protetto)
    let migliore = null;
    let migliorePunteggio = Infinity;
    for (const n of nomi) {
      if (n === nome) continue;
      const codC = cella[n + '|' + g] || '';
      if (codC) {
        const csC = _pianoCodiceInfo(codC);
        const rC = rigaDi[n + '|' + g];
        if (rC && _pianoCellaRiservata(rC)) continue; // bloccata con motivo: non si tocca
        if (!(csC && csC.is_riposo && !(rC && rC.protetto && codC === 'V'))) continue; // occupato o vacanza protetta
      }
      if (!_pianoIdoneoPerTurno(n, t)) continue;
      if (consecFinoA(n, g) >= maxCons) continue;
      if (!riposoOkSost(n, g, t)) continue;
      // accompagnamento: simula malato→M e sostituto→turno, poi verifica
      const _accM = cella[nome + '|' + g];
      const _accN = cella[n + '|' + g];
      cella[nome + '|' + g] = 'M';
      cella[n + '|' + g] = cod;
      const _accOk = accompagnamentoOkSost(g);
      cella[nome + '|' + g] = _accM;
      cella[n + '|' + g] = _accN;
      if (!_accOk) continue;
      const punteggio = (oreMese[n] || 0) + consecFinoA(n, g) * 10;
      if (punteggio < migliorePunteggio) {
        migliorePunteggio = punteggio;
        migliore = n;
      }
    }
    // SOLUZIONE A CATENA: nessun candidato diretto. Provo a liberare chi
    // avrebbe il giorno libero ma e' bloccato dal turno del giorno prima
    // (es. notte): quel turno si scambia con un collega o passa a un terzo,
    // sempre rispettando idoneita', riposo 11h e consecutivi.
    let catena = null;
    if (!migliore) {
      for (const x of nomi) {
        if (catena) break;
        if (x === nome) continue;
        if (g - 1 < 1) break; // la catena tocca il giorno prima: solo dentro il mese aperto
        const codX = cella[x + '|' + g] || '';
        if (codX) {
          const csX = _pianoCodiceInfo(codX);
          const rX = rigaDi[x + '|' + g];
          if (rX && _pianoCellaRiservata(rX)) continue;
          if (!(csX && csX.is_riposo && !(rX && rX.protetto && codX === 'V'))) continue;
        }
        if ((rigaDi[x + '|' + (g - 1)] || {}).motivo_blocco) continue; // il suo giorno prima e' bloccato
        if (!_pianoIdoneoPerTurno(x, t)) continue;
        if (consecFinoA(x, g) >= maxCons) continue;
        const codP = cella[x + '|' + (g - 1)] || '';
        const tP = _pianoTurnoInfo(codP);
        if (!tP) continue; // non e' bloccato da un turno del giorno prima
        if (riposoOkSost(x, g, t)) continue; // sarebbe gia' un candidato diretto
        const salvaP = cella[x + '|' + (g - 1)];
        cella[x + '|' + (g - 1)] = '';
        const sbloccato = riposoOkSost(x, g, t);
        cella[x + '|' + (g - 1)] = salvaP;
        if (!sbloccato) continue;
        // opzione 1: SCAMBIO alla pari del giorno prima con un collega. Dopo
        // lo scambio si controllano TUTTE le regole (riposo + consecutivi) per
        // x (giorno prima e giorno della copertura) e per z (giorno prima)
        for (const z of nomi) {
          if (z === x || z === nome) continue;
          const codS = cella[z + '|' + (g - 1)] || '';
          const tS = _pianoTurnoInfo(codS);
          if (!tS || codS === codP) continue;
          if (!_pianoIdoneoPerTurno(x, tS) || !_pianoIdoneoPerTurno(z, tP)) continue;
          const s1 = cella[x + '|' + (g - 1)];
          const s2 = cella[z + '|' + (g - 1)];
          const sG = cella[x + '|' + g];
          const sMal = cella[nome + '|' + g];
          cella[x + '|' + (g - 1)] = codS;
          cella[z + '|' + (g - 1)] = codP;
          cella[x + '|' + g] = cod; // x copre la malattia il giorno g
          cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
          const ok =
            regolaOkSost(x, g - 1) &&
            regolaOkSost(x, g) &&
            regolaOkSost(z, g - 1) &&
            regolaOkSost(z, g) &&
            accompagnamentoOkSost(g) &&
            accompagnamentoOkSost(g - 1);
          cella[x + '|' + (g - 1)] = s1;
          cella[z + '|' + (g - 1)] = s2;
          cella[x + '|' + g] = sG;
          cella[nome + '|' + g] = sMal;
          if (ok) {
            catena = { tipo: 'scambio', g1: g - 1, turnoX: codP, con: z, turnoCon: codS };
            break;
          }
        }
        // opzione 2: il turno del giorno prima PASSA a un terzo libero. Si
        // controllano TUTTE le regole per il terzo (che si carica il turno) e
        // per x (liberato il giorno prima, che copre il giorno g)
        if (!catena) {
          for (const y of nomi) {
            if (y === x || y === nome) continue;
            const codY = cella[y + '|' + (g - 1)] || '';
            if (codY) {
              const csY = _pianoCodiceInfo(codY);
              const rY = rigaDi[y + '|' + (g - 1)];
              if (rY && _pianoCellaRiservata(rY)) continue; // bloccata con motivo o compleanno
              if (!(csY && csY.is_riposo && !(rY && rY.protetto && codY === 'V'))) continue;
            }
            if (!_pianoIdoneoPerTurno(y, tP)) continue;
            const sy = cella[y + '|' + (g - 1)];
            const sx1 = cella[x + '|' + (g - 1)];
            const sxG = cella[x + '|' + g];
            const sMal2 = cella[nome + '|' + g];
            cella[y + '|' + (g - 1)] = codP; // il terzo prende il turno
            cella[x + '|' + (g - 1)] = 'C'; // x liberato il giorno prima
            cella[x + '|' + g] = cod; // x copre la malattia
            cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
            const ok =
              regolaOkSost(y, g - 1) &&
              regolaOkSost(x, g - 1) &&
              regolaOkSost(x, g) &&
              accompagnamentoOkSost(g) &&
              accompagnamentoOkSost(g - 1);
            cella[y + '|' + (g - 1)] = sy;
            cella[x + '|' + (g - 1)] = sx1;
            cella[x + '|' + g] = sxG;
            cella[nome + '|' + g] = sMal2;
            if (ok) {
              catena = { tipo: 'riassegna', g1: g - 1, turnoX: codP, con: y, eraCon: cella[y + '|' + (g - 1)] || '' };
              break;
            }
          }
        }
        if (catena) {
          migliore = x;
          // aggiorno la simulazione progressiva anche per la mossa a catena
          if (catena.tipo === 'scambio') {
            cella[x + '|' + (g - 1)] = catena.turnoCon;
            cella[catena.con + '|' + (g - 1)] = catena.turnoX;
          } else {
            cella[x + '|' + (g - 1)] = 'C';
            cella[catena.con + '|' + (g - 1)] = catena.turnoX;
            oreMese[catena.con] = (oreMese[catena.con] || 0) + (parseFloat(tP.durata_ore) || 0);
            oreMese[x] = Math.max(0, (oreMese[x] || 0) - (parseFloat(tP.durata_ore) || 0));
          }
        }
      }
    }
    if (migliore) {
      giorni.push({
        g: g,
        codice: cod,
        orari: (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
        sostituto: migliore,
        era: cella[migliore + '|' + g] || '',
        catena: catena,
      });
      cella[migliore + '|' + g] = cod; // override progressivo, come il greedy Turnivo
      oreMese[migliore] = (oreMese[migliore] || 0) + (parseFloat(t.durata_ore) || 0);
    } else {
      giorni.push({ g: g, codice: cod, scoperto: true });
    }
  }
  _malattiaPiano = { nome: nome, da: da, al: al, giorni: giorni };
  const descCatena = (d) =>
    !d.catena
      ? ''
      : d.catena.tipo === 'scambio'
        ? "In piu' il " +
          d.catena.g1 +
          ': ' +
          d.sostituto.split(' ')[0] +
          ' fa ' +
          d.catena.turnoCon +
          ' e ' +
          d.catena.con.split(' ')[0] +
          ' fa ' +
          d.catena.turnoX +
          ' (scambio alla pari)'
        : "In piu' il " +
          d.catena.g1 +
          ': il turno ' +
          d.catena.turnoX +
          ' di ' +
          d.sostituto.split(' ')[0] +
          ' passa a ' +
          d.catena.con.split(' ')[0] +
          ", cosi' " +
          d.sostituto.split(' ')[0] +
          " puo' coprire";
  _malattiaPiano.descCatena = descCatena;
  let h =
    '<table class="piano-table" style="min-width:100%;font-size:.82rem"><thead><tr><th></th><th>Giorno</th><th>Turno</th><th style="text-align:left">Sostituto proposto</th></tr></thead><tbody>';
  giorni.forEach((d) => {
    if (d.salta)
      h +=
        '<tr><td></td><td>' +
        d.g +
        '</td><td colspan="2" style="color:var(--muted);text-align:left">' +
        d.salta +
        '</td></tr>';
    else if (d.scoperto)
      h +=
        '<tr><td></td><td>' +
        d.g +
        '</td><td>' +
        escP(d.codice) +
        '</td><td style="color:#c0392b;font-weight:700;text-align:left">NESSUN SOSTITUTO DISPONIBILE (nemmeno con cambi a catena)</td></tr>';
    else
      h +=
        '<tr><td><input type="checkbox" class="mal-sel" data-g="' +
        d.g +
        '" checked title="Togli la spunta per NON applicare questa soluzione (la M al malato resta)"></td><td>' +
        d.g +
        '</td><td><b>' +
        escP(d.codice) +
        '</b> ' +
        d.orari +
        '</td><td style="text-align:left;color:#2c6e49;font-weight:700">' +
        escP(d.sostituto) +
        (d.era ? ' <span style="color:var(--muted);font-weight:400">(era ' + escP(d.era) + ')</span>' : '') +
        (d.catena
          ? '<div style="font-weight:400;color:#b8860b;font-size:.82rem">' + escP(descCatena(d)) + '</div>'
          : '') +
        '</td></tr>';
  });
  h += '</tbody></table>';
  const coperti = giorni.filter((d) => d.sostituto).length;
  const scoperti = giorni.filter((d) => d.scoperto).length;
  h +=
    '<p style="font-size:.8rem;margin-top:6px">' +
    coperti +
    ' giorni coperti' +
    (scoperti ? ', <b style="color:#c0392b">' + scoperti + ' scoperti</b>' : '') +
    '. Alla conferma: M (protetta) al malato su tutti i giorni; turni protetti SOLO per le soluzioni con la spunta' +
    (coperti ? ', punti incentivo con conferma' : '') +
    '. Le mosse a catena scrivono il commento anche sulle celle del giorno prima.</p>';
  h +=
    '<button class="btn-export" style="font-size:.8rem;padding:5px 14px;margin-top:4px" onclick="stampaPropostaCopertura()">Stampa proposta</button>';
  out.innerHTML = h;
  document.getElementById('mal-btn-conferma').style.display = coperti || giorni.some((d) => d.codice) ? '' : 'none';
}
// PDF della proposta di copertura: lista giorni, sostituti e mosse a catena,
// da stampare e discutere prima di confermare
async function stampaPropostaCopertura() {
  const m = _malattiaPiano;
  if (!m) return;
  if (!window.jspdf) await caricaJsPDF();
  const doc = new window.jspdf.jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(13);
  doc.text('Proposta copertura malattia', pw / 2, 16, { align: 'center' });
  doc.setFontSize(9);
  doc.text(
    m.nome +
      ' · giorni ' +
      m.da +
      '-' +
      m.al +
      ' ' +
      _pianoMeseSel +
      ' · settore ' +
      repartoLabel(_pianoReparto()) +
      ' · preparata da ' +
      getOperatore() +
      ' il ' +
      new Date().toLocaleDateString('it-IT'),
    pw / 2,
    23,
    { align: 'center' },
  );
  doc.autoTable({
    theme: 'grid',
    startY: 30,
    head: [['Giorno', 'Turno', 'Sostituto proposto', 'Mossa aggiuntiva']],
    body: m.giorni.map((d) => [
      d.g,
      d.salta ? '-' : d.codice + (d.orari ? ' ' + d.orari : ''),
      d.salta ? d.salta : d.scoperto ? 'NESSUN SOSTITUTO' : d.sostituto + (d.era ? ' (era ' + d.era + ')' : ''),
      d.catena ? m.descCatena(d) : '',
    ]),
    headStyles: { fillColor: [26, 74, 122], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 12, right: 12 },
  });
  doc.setFontSize(8);
  doc.text('Casino Lugano SA · proposta operativa, non vincolante', 14, doc.internal.pageSize.getHeight() - 8);
  mostraPdfPreview(doc, 'proposta_copertura_' + _pianoMeseSel + '.pdf', 'Proposta copertura');
}
// PIANO → DIARIO: una malattia scritta nel piano si registra anche nel Diario,
// cosi' la scheda collaboratore conta i giorni (i giorni C dentro il range,
// mostrati come MC, sono inclusi). Un giorno gia' registrato non si duplica.
async function _pianoMalattiaNelDiario(nome, dal, al, chiedi) {
  if (typeof datiCache === 'undefined' || typeof secPost !== 'function') return 0;
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const dI = new Date(dal + 'T12:00:00'),
    dF = new Date(al + 'T12:00:00');
  const giorniNuovi = [];
  for (let d = new Date(dI); d <= dF; d.setDate(d.getDate() + 1)) {
    const dStr =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const esiste = datiCache.find(
      (e) =>
        (e.nome || '').toLowerCase() === nome.toLowerCase() &&
        e.tipo === tipoMal &&
        String(e.data || '').startsWith(dStr),
    );
    if (!esiste) giorniNuovi.push(dStr);
  }
  if (!giorniNuovi.length) return 0;
  if (
    chiedi &&
    !confirm(
      'Registrare la malattia anche nel Diario di ' +
        nome +
        ' (' +
        giorniNuovi.length +
        (giorniNuovi.length === 1 ? ' giorno' : ' giorni') +
        ")?\n\nCosi' i giorni contano nella scheda del collaboratore.",
    )
  )
    return 0;
  const lbl = ' (dal ' + dI.toLocaleDateString('it-IT') + ' al ' + dF.toLocaleDateString('it-IT') + ')';
  let creati = 0;
  for (const dStr of giorniNuovi) {
    const rec = {
      id: Date.now() + creati,
      nome: nome,
      tipo: tipoMal,
      testo: 'Malattia registrata dal piano' + lbl,
      data: dStr + 'T08:00:00.000Z',
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    try {
      await secPost('registrazioni', rec);
      datiCache.unshift(rec);
      creati++;
    } catch (e) {}
  }
  if (creati) logAzione('Malattia dal piano', nome + ' · ' + creati + ' giorni registrati nel Diario');
  return creati;
}
// PIANO → DIARIO anche in rimozione: se una M sparisce dal piano (tolta o
// sovrascritta con un turno), il programma propone di togliere quei giorni
// anche dal Diario. Le registrazioni finiscono nel Cestino, recuperabili.
async function _pianoMalattiaViaDiario(nome, giorniDstr) {
  if (typeof datiCache === 'undefined' || typeof secPatch !== 'function') return 0;
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const daTogliere = datiCache.filter(
    (e) =>
      (e.nome || '').toLowerCase() === nome.toLowerCase() &&
      e.tipo === tipoMal &&
      !e.eliminato &&
      giorniDstr.some((d) => String(e.data || '').startsWith(d)),
  );
  if (!daTogliere.length) return 0;
  const gg = daTogliere
    .map((e) => String(e.data).substring(8, 10) + '/' + String(e.data).substring(5, 7))
    .sort()
    .join(', ');
  const nG = daTogliere.length;
  if (
    !confirm(
      'Nel Diario ' +
        nome +
        ' risulta in malattia ' +
        (nG === 1 ? 'il giorno ' : 'nei giorni ') +
        gg +
        '.\n\nTogliere ' +
        (nG === 1 ? 'questo giorno' : 'questi ' + nG + ' giorni') +
        " anche dal Diario? Le registrazioni finiscono nel Cestino (recuperabili) e la scheda del collaboratore si aggiorna.\n\nOK = togli anche dal Diario · Annulla = il Diario resta com'e'",
    )
  )
    return 0;
  const op = getOperatore();
  const now = new Date().toISOString();
  let tolte = 0;
  for (const e of daTogliere) {
    try {
      await secPatch('registrazioni', 'id=eq.' + e.id, { eliminato: true, eliminato_da: op, eliminato_at: now });
      e.eliminato = true;
      tolte++;
    } catch (err) {}
  }
  datiCache = datiCache.filter((e) => !e.eliminato);
  if (tolte) {
    logAzione('Malattia tolta dal piano', nome + ' · ' + tolte + ' giorni spostati nel cestino del Diario');
    toast('Diario aggiornato: ' + tolte + (tolte === 1 ? ' giorno' : ' giorni') + ' di malattia nel Cestino');
  }
  return tolte;
}
async function confermaCoperturaMalattia() {
  const m = _malattiaPiano;
  if (!m) return;
  // basta lo sblocco sul primo giorno: copre il flusso, e gli inserimenti sui
  // singoli giorni passano comunque dal controllo dentro _pianoInserisciCella
  const _g0 = m.giorni && m.giorni.length ? _pianoMeseSel + '-' + String(m.giorni[0].g).padStart(2, '0') : null;
  if (_g0 && !_pianoConsentiScrittura(_g0)) return;
  // soluzioni selezionate: senza spunta la M resta ma il sostituto non si tocca
  const selGiorni = new Set([...document.querySelectorAll('.mal-sel:checked')].map((c) => parseInt(c.dataset.g)));
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = _pianoMeseSel;
  const op = getOperatore();
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  const rigaDi = {};
  _pianoRighe.forEach((r) => (rigaDi[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
  _pianoUndoSnap('copertura malattia ' + _pianoMeseSel);
  let nM = 0;
  let nSost = 0;
  const sostituti = new Set();
  try {
    for (const d of m.giorni) {
      if (d.salta) continue;
      // M al malato (protetta)
      const rMal = rigaDi[m.nome + '|' + d.g];
      if (rMal) {
        await secPatch('piano', 'id=eq.' + rMal.id, {
          codice: 'M',
          protetto: true,
          generato: false,
          commento: ('Ex ' + d.codice + ' - assenza - ' + op).substring(0, 400),
          operatore: op,
          updated_at: new Date().toISOString(),
        });
      } else {
        await _pianoInserisciCella({
          collaboratore: m.nome,
          data: dstrDi(d.g),
          codice: 'M',
          protetto: true,
          generato: false,
          reparto_dip: _pianoReparto(),
          operatore: op,
        });
      }
      nM++;
      // turno al sostituto (protetto), SOLO se la soluzione ha la spunta
      if (d.sostituto && selGiorni.has(d.g)) {
        // MOSSA A CATENA sul giorno prima, se prevista dalla proposta
        if (d.catena) {
          const g1 = d.catena.g1;
          const rX1 = rigaDi[d.sostituto + '|' + g1];
          if (d.catena.tipo === 'scambio') {
            const rZ = rigaDi[d.catena.con + '|' + g1];
            if (rX1 && rZ) {
              await secPatch('piano', 'id=eq.' + rX1.id, {
                codice: d.catena.turnoCon,
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoX +
                  ' - scambio per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
              await secPatch('piano', 'id=eq.' + rZ.id, {
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoCon +
                  ' - scambio per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            }
          } else {
            // riassegna: il sostituto viene liberato, il suo turno passa al terzo
            if (rX1)
              await secPatch('piano', 'id=eq.' + rX1.id, {
                codice: 'C',
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoX +
                  ' - liberato per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            const rY = rigaDi[d.catena.con + '|' + g1];
            const commY = (
              (d.catena.eraCon ? 'Ex ' + d.catena.eraCon + ' - ' : '') +
              'prende il turno di ' +
              d.sostituto.split(' ')[0] +
              ' (copertura malattia di ' +
              m.nome.split(' ')[0] +
              ') - ' +
              op
            ).substring(0, 400);
            if (rY) {
              await secPatch('piano', 'id=eq.' + rY.id, {
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: commY,
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            } else {
              await _pianoInserisciCella({
                collaboratore: d.catena.con,
                data: dstrDi(g1),
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: commY,
                reparto_dip: _pianoReparto(),
                operatore: op,
              });
            }
            sostituti.add(d.catena.con); // si carica un turno in piu': incentivi con conferma
          }
        }
        const rS = rigaDi[d.sostituto + '|' + d.g];
        const commento = ('Ex ' + (d.era || '-') + ' - cambio per esigenze operative - ' + op).substring(0, 400);
        if (rS) {
          await secPatch('piano', 'id=eq.' + rS.id, {
            codice: d.codice,
            protetto: true,
            generato: false,
            commento: commento,
            operatore: op,
            updated_at: new Date().toISOString(),
          });
        } else {
          await _pianoInserisciCella({
            collaboratore: d.sostituto,
            data: dstrDi(d.g),
            codice: d.codice,
            protetto: true,
            generato: false,
            commento: commento,
            reparto_dip: _pianoReparto(),
            operatore: op,
          });
        }
        sostituti.add(d.sostituto);
        nSost++;
      }
    }
    // punti incentivo: MAI automatici, il responsabile conferma prima; e solo
    // se il sistema incentivi (e l'azione copertura) e' acceso
    let puntiDati = false;
    if (
      typeof _insertPuntiEvento === 'function' &&
      typeof getPuntiConfig === 'function' &&
      sostituti.size &&
      (typeof incentiviAttivi !== 'function' || incentiviAttivi('copertura'))
    ) {
      const az = (getPuntiConfig().azioni || []).find((a) => a.key === 'copertura');
      const dataLbl = new Date(ym + '-' + String(m.da).padStart(2, '0') + 'T12:00:00').toLocaleDateString('it-IT');
      if (
        az &&
        confirm(
          'Incentivi: assegnare +' +
            az.punti +
            ' punti (copertura) a ' +
            [...sostituti].join(', ') +
            "?\n\nAnnulla = nessun punto ora (si puo' fare dopo dal popup o da Formazione).",
        )
      ) {
        for (const n of sostituti) {
          const ok = await _insertPuntiEvento(
            n,
            az.punti,
            'copertura',
            'Copertura malattia di ' + m.nome + ' del ' + dataLbl + ' (giorni ' + m.da + '-' + m.al + ' ' + ym + ')',
          );
          if (ok) puntiDati = true;
        }
      }
    }
    logAzione(
      'Copertura malattia',
      m.nome + ' ' + m.da + '-' + m.al + ' ' + ym + ': ' + nM + ' M, ' + nSost + ' sostituzioni',
    );
    // piano e Diario sempre allineati: la malattia si registra anche nel Diario
    const nDiario = await _pianoMalattiaNelDiario(m.nome, dstrDi(m.da), dstrDi(m.al), false);
    toast(
      'Copertura registrata: ' +
        nM +
        ' giorni M, ' +
        nSost +
        ' sostituzioni' +
        (nDiario ? ', ' + nDiario + ' giorni nel Diario' : '') +
        (puntiDati ? ', punti assegnati' : ''),
    );
    // popup incentivi come per la malattia dal rapporto: i sostituti hanno
    // gia' i punti (compaiono in "Gia' registrato"), qui si segnano i rifiuti
    if (typeof apriPopupCopertura === 'function')
      setTimeout(() => apriPopupCopertura(m.nome, ym + '-' + String(m.da).padStart(2, '0')), 500);
    _malattiaPiano = null;
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore registrazione copertura');
  }
}

// Barra delle date sempre visibile durante lo scorrimento della PAGINA:
// il piano scorre col resto della pagina (nessuno scrollbox interno) e le
// intestazioni vengono traslate per restare in cima allo schermo. Vale per
// tutte le tabelle piano-wrap (griglia collaboratori e fabbisogno).
// LARGHEZZA AUTOMATICA delle due colonne fisse (nome e funzione): si misura
// il testo piu' lungo prima di disegnare, perche' le tabelle del piano hanno
// colonne a larghezza fissa (servono ad allineare i giorni con fabbisogno,
// differenze ed effettivi: la somma nome+funzione dev'essere uguale ovunque)
function _pianoMisura(txt, font) {
  const c = (window._pianoCanvasMis = window._pianoCanvasMis || document.createElement('canvas'));
  const ctx = c.getContext('2d');
  ctx.font = font;
  return ctx.measureText(txt || '').width;
}
function _pianoCalcolaLarghezze(nomi) {
  const ff = ' system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  let maxN = 0;
  let maxF = 0;
  (nomi || []).forEach((n) => {
    const info = _pianoCollabInfo(n);
    let w = _pianoMisura(n, '600 14px' + ff);
    if (info && info.lingue) w += 6 + _pianoMisura(info.lingue, '700 10px' + ff);
    if (w > maxN) maxN = w;
    const perc = info ? parseFloat(info.percentuale) || 1 : 1;
    const t = (
      (info && info.is_jolly ? 'JOLLY' : (info && info.funzione) || '') +
      ' ' +
      Math.round(perc * 100) +
      '%'
    ).trim();
    const wf = _pianoMisura(t, '700 11.5px' + ff);
    if (wf > maxF) maxF = wf;
  });
  // icona stampa + margini nel nome, respiro nella colonna funzione
  window._pianoLargCol = {
    nome: Math.min(330, Math.max(150, Math.ceil(maxN + 36))),
    fun: Math.min(110, Math.max(44, Math.ceil(maxF + 14))),
  };
  window._pianoLargCol.tot = window._pianoLargCol.nome + window._pianoLargCol.fun;
  return window._pianoLargCol;
}
function _pianoLC() {
  return window._pianoLargCol || { nome: 150, fun: 44, tot: 194 };
}
// La colonna del nome si allarga da sola in base al nome piu' lungo (CSS):
// qui si riallinea la colonna Fun (funzione + percentuale), che resta
// appiccicata subito dopo, alla larghezza reale che il browser ha calcolato
function _pianoLarghezzaNomi() {
  document.querySelectorAll('#piano-content .piano-wrap table').forEach((tab) => {
    const nome = tab.querySelector('.piano-nome');
    if (!nome) return;
    const w = Math.round(nome.getBoundingClientRect().width);
    if (!w) return;
    tab.querySelectorAll('.piano-fun').forEach((el) => {
      if (el.style.left !== w + 'px') el.style.left = w + 'px';
    });
  });
}
function _pianoInitSticky() {
  requestAnimationFrame(_pianoLarghezzaNomi);
  if (!window._pianoLargBound) {
    window._pianoLargBound = true;
    window.addEventListener('resize', () => requestAnimationFrame(_pianoLarghezzaNomi), { passive: true });
  }
  const wraps = document.querySelectorAll('#piano-content .piano-wrap');
  window._pianoStickyEls = [...wraps]
    .map((w) => {
      const tab = w.querySelector('table');
      return tab ? { tab: tab, ths: tab.querySelectorAll('thead th') } : null;
    })
    .filter(Boolean);
  if (window._pianoStickyBound) return;
  window._pianoStickyBound = true;
  const applica = () => {
    (window._pianoStickyEls || []).forEach((o) => {
      if (!o.tab || !o.tab.isConnected) return;
      const r = o.tab.getBoundingClientRect();
      const hHead = o.ths[0] ? o.ths[0].offsetHeight : 24;
      let y = 0;
      if (r.top < 0) y = Math.min(-r.top, r.height - hHead * 2);
      if (y < 0) y = 0;
      const t = y ? 'translateY(' + Math.round(y) + 'px)' : '';
      o.ths.forEach((th) => {
        if (th.style.transform !== t) th.style.transform = t;
      });
    });
  };
  window.addEventListener('scroll', applica, { passive: true, capture: true });
  window.addEventListener('resize', applica, { passive: true });
}

// SCHEDA SALDO: clic su "Ore lavorate" o "Saldo mese" per scrivere le ore
// realmente lavorate. Nel calendario la stessa cosa si fa col doppio clic, ma
// li' il clic singolo serve gia' a selezionare; qui non seleziona niente, quindi
// basta un clic solo. Prima non succedeva nulla: il collegamento esisteva solo
// nella scheda Calendario.
function _pianoSaldoBind() {
  const tab = document.getElementById('piano-saldo-table');
  if (!tab) return;
  tab.querySelectorAll('tbody tr[data-nome]').forEach((riga) => {
    // solo la colonna "Saldo mese": le ore lavorate si leggono, non si scrivono
    riga.querySelectorAll('td.piano-sm').forEach((td) => {
      td.addEventListener('click', (e) => {
        e.stopPropagation();
        pianoScriviOreMese(riga.dataset.nome);
      });
    });
  });
}
function _pianoInitSelezione() {
  // IDENTICA a Turnivo (main.js data-selectable): click header giorno =
  // colonna con velo azzurro + header blu; click nome = riga; ri-click =
  // deseleziona; riga e colonna mutuamente esclusive; click fuori dalla
  // tabella = deseleziona. La stampa avviene SOLO dall'icona rossa.
  // Come Turnivo (table[data-selectable]): vale per TUTTE le tabelle in
  // piano-wrap · griglia collaboratori E fabbisogno. Le COLONNE data sono
  // COLLEGATE: selezionando un giorno nel piano l'evidenziazione arriva
  // fino in fondo al fabbisogno (stessa colonna) e viceversa, così si
  // capisce la corrispondenza giorno-fabbisogno.
  const tabelle = [...document.querySelectorAll('#piano-content .piano-wrap > .piano-table')].filter(
    (t) => !t.dataset.selInit,
  );
  if (!tabelle.length) return;
  tabelle.forEach((t, i) => (t.dataset.selInit = String(i + 1)));
  let selTipo = '';
  let selIdx = -1;
  let selTab = null;
  const clearAll = () => {
    tabelle.forEach((t) => {
      t.querySelectorAll('.col-selected, .col-selected-header').forEach((el) =>
        el.classList.remove('col-selected', 'col-selected-header'),
      );
      t.querySelectorAll('.row-selected').forEach((el) => el.classList.remove('row-selected'));
    });
    selTipo = '';
    selIdx = -1;
    selTab = null;
  };
  const selezionaColonna = (thCliccata, tabProprio, colIdx) => {
    const g = thCliccata.dataset.g;
    if (g) {
      // colonna GIORNO: collegata su tutte le tabelle via data-g
      tabelle.forEach((t) => {
        const th = t.querySelector('thead th[data-g="' + g + '"]');
        if (th) th.classList.add('col-selected-header');
        t.querySelectorAll('tbody td[data-g="' + g + '"]').forEach((c) => c.classList.add('col-selected'));
      });
    } else {
      // colonne totali (Ore/D/N/OD/OP/SM/YTD/Tot): solo nella propria tabella
      thCliccata.classList.add('col-selected-header');
      tabProprio
        .querySelector('tbody')
        .querySelectorAll('tr')
        .forEach((riga) => {
          const celle = riga.querySelectorAll('td, th');
          if (celle[colIdx]) celle[colIdx].classList.add('col-selected');
        });
    }
  };
  tabelle.forEach((tab) => {
    const thead = tab.querySelector('thead');
    const tbody = tab.querySelector('tbody');
    if (!thead || !tbody) return;
    thead.querySelectorAll('tr th').forEach((th, colIdx) => {
      if (th.classList.contains('piano-nome') || th.classList.contains('piano-fun')) return;
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = parseInt(th.dataset.g) || 0;
        // Shift+click su un altro giorno = intervallo di colonne (come Excel), pronto da copiare
        if (e.shiftKey && g && selTipo === 'col' && String(selIdx).charAt(0) === 'g') {
          const g0 = parseInt(String(selIdx).substring(1)) || g;
          const ga = Math.min(g0, g);
          const gb = Math.max(g0, g);
          clearAll();
          _pianoBloccoPulisci();
          selTipo = 'col';
          selIdx = 'g' + g0;
          for (let gi = ga; gi <= gb; gi++) {
            tabelle.forEach((t) => {
              const thx = t.querySelector('thead th[data-g="' + gi + '"]');
              if (thx) thx.classList.add('col-selected-header');
              t.querySelectorAll('tbody td[data-g="' + gi + '"]').forEach((c) => c.classList.add('col-selected'));
            });
          }
          _pianoBloccoDaColonne(tab, ga, gb);
          return;
        }
        // Ctrl/Cmd+click: selezione SPARSA di giorni con barra azioni
        if ((e.ctrlKey || e.metaKey) && g) {
          _pianoSparseToggleGiorno(g);
          return;
        }
        const idSel = g ? 'g' + g : tab.dataset.selInit + ':' + colIdx;
        const era = selTipo === 'col' && idSel === selIdx;
        clearAll();
        _pianoBloccoPulisci();
        if (era) return;
        selTipo = 'col';
        selIdx = idSel;
        selezionaColonna(th, tab, colIdx);
        if (g) _pianoBloccoDaColonne(tab, g, g);
      });
    });
    tbody.querySelectorAll('tr').forEach((riga, rowIdx) => {
      // doppio clic su ore pianificate o saldo: si scrivono le ore reali del mese
      riga.querySelectorAll('td.piano-op, td.piano-sm').forEach((td) => {
        td.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (riga.dataset.nome) pianoScriviOreMese(riga.dataset.nome);
        });
      });
      const nomeCella = riga.querySelector('.piano-nome');
      if (!nomeCella) return;
      nomeCella.style.cursor = 'pointer';
      // doppio clic sul nome: scheda del collaboratore (il clic singolo resta
      // la selezione della riga, con Ctrl/Shift per piu' collaboratori)
      nomeCella.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (riga.dataset.nome && typeof apriSchedaCollaboratore === 'function')
          apriSchedaCollaboratore(riga.dataset.nome);
      });
      if (riga.dataset.nome) nomeCella.addEventListener('contextmenu', (e) => mostraPianoCtxNome(e, riga.dataset.nome));
      nomeCella.addEventListener('click', (e) => {
        if (e.target.closest('a, .piano-pdf-ico')) return;
        e.stopPropagation();
        // Ctrl/Cmd+click: selezione SPARSA di collaboratori con barra azioni
        if ((e.ctrlKey || e.metaKey) && riga.dataset.nome) {
          _pianoSparseToggleNome(riga.dataset.nome, riga);
          return;
        }
        const righeT = [...tbody.querySelectorAll('tr')];
        // Shift+click su un altro nome = intervallo di righe (come Excel), pronto da copiare
        if (e.shiftKey && selTipo === 'row' && selTab === tab && selIdx >= 0 && selIdx !== rowIdx) {
          const a = Math.min(selIdx, rowIdx);
          const b2 = Math.max(selIdx, rowIdx);
          const ancora = selIdx;
          clearAll();
          _pianoBloccoPulisci();
          selTipo = 'row';
          selIdx = ancora;
          selTab = tab;
          for (let ri = a; ri <= b2; ri++) righeT[ri].classList.add('row-selected');
          _pianoBloccoDaRighe(tab, righeT[a], righeT[b2]);
          return;
        }
        const era = selTipo === 'row' && rowIdx === selIdx && selTab === tab;
        clearAll();
        _pianoBloccoPulisci();
        if (era) return;
        selTipo = 'row';
        selIdx = rowIdx;
        selTab = tab;
        riga.classList.add('row-selected');
        _pianoBloccoDaRighe(tab, riga, riga);
      });
    });
  });
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab) return;
  // Riordino collaboratori: trascina la riga dal nome (solo chi gestisce il piano)
  if (puoGestirePiano()) {
    const tbodyG = tab.querySelector('tbody');
    let trDrag = null;
    tbodyG.querySelectorAll('tr[data-nome]').forEach((tr) => {
      const cel = tr.querySelector('.piano-nome');
      if (!cel) return;
      cel.draggable = true;
      cel.title = (cel.title ? cel.title + ' · ' : '') + 'trascina per riordinare';
      cel.addEventListener('dragstart', (e) => {
        trDrag = tr;
        tr.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      cel.addEventListener('dragend', async () => {
        tr.style.opacity = '';
        if (!trDrag) return;
        trDrag = null;
        const nuovi = [...tbodyG.querySelectorAll('tr[data-nome]')].map((r) => r.dataset.nome);
        await salvaOrdinePiano(nuovi);
      });
      tr.addEventListener('dragover', (e) => {
        if (!trDrag || trDrag === tr) return;
        e.preventDefault();
        const r = tr.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) tbodyG.insertBefore(trDrag, tr);
        else tbodyG.insertBefore(trDrag, tr.nextSibling);
      });
    });
  }
  if (!window._pianoSelDocClick) {
    window._pianoSelDocClick = true;
    document.addEventListener('click', (e) => {
      // celle dei TOTALI (Ore, D, N, OD, OP, SM, YTD): selezione sparsa come
      // Excel (click = solo quella, Ctrl/Cmd+click = aggiungi o togli); la
      // barra di calcolo mostra somma e media anche di queste
      const tdTot = e.target.closest('#piano-content tbody td.piano-tot');
      if (tdTot) {
        if (window._pianoTotDragged) {
          // click di rilascio subito dopo un trascinamento: si ignora una
          // volta sola, la selezione trascinata resta
          window._pianoTotDragged = false;
          return;
        }
        if (e.ctrlKey || e.metaKey) tdTot.classList.toggle('tot-sel');
        else {
          document.querySelectorAll('#piano-content .tot-sel').forEach((x) => x.classList.remove('tot-sel'));
          tdTot.classList.add('tot-sel');
        }
        setTimeout(_pianoStatSelezione, 30);
        return;
      }
      if (!e.target.closest('#piano-content .piano-table')) {
        document
          .querySelectorAll('#piano-content .col-selected, #piano-content .col-selected-header')
          .forEach((el) => el.classList.remove('col-selected', 'col-selected-header'));
        document.querySelectorAll('#piano-content .row-selected').forEach((el) => el.classList.remove('row-selected'));
        if (document.querySelector('#piano-content .tot-sel')) {
          document.querySelectorAll('#piano-content .tot-sel').forEach((el) => el.classList.remove('tot-sel'));
          setTimeout(_pianoStatSelezione, 30);
        }
      }
    });
  }
  tab.querySelectorAll('tbody .piano-cella').forEach((cella) => {
    cella.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tr = cella.closest('tr');
      const giorno = parseInt(cella.dataset.g);
      if (!tr.dataset.nome || !giorno) return;
      mostraPianoCtx(e, tr.dataset.nome, _pianoMeseSel + '-' + String(giorno).padStart(2, '0'));
    });
    // Mobile: long-press (>500ms) = menu contestuale, come Turnivo
    let lpTimer = null;
    let lpFired = false;
    cella.addEventListener(
      'touchstart',
      (e) => {
        lpFired = false;
        lpTimer = setTimeout(() => {
          lpFired = true;
          if (navigator.vibrate) navigator.vibrate(50);
          const tocco = e.changedTouches[0] || e.touches[0];
          const tr = cella.closest('tr');
          const giorno = parseInt(cella.dataset.g);
          if (!tr.dataset.nome || !giorno || !tocco) return;
          mostraPianoCtx(
            { preventDefault: () => {}, clientX: tocco.clientX, clientY: tocco.clientY },
            tr.dataset.nome,
            _pianoMeseSel + '-' + String(giorno).padStart(2, '0'),
          );
        }, 500);
      },
      { passive: true },
    );
    cella.addEventListener('touchend', (e) => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      if (lpFired) {
        e.preventDefault();
        lpFired = false;
      }
    });
    cella.addEventListener(
      'touchmove',
      () => {
        if (lpTimer) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      },
      { passive: true },
    );
  });
}
