/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
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
  doc.text('Piano di lavoro · ' + label + ' · ' + repartoNomeDocumento(_pianoReparto()), 148, 10, { align: 'center' });
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
  doc.text(identita().azienda + ' · Piano di lavoro · generato il ' + new Date().toLocaleDateString('it-IT'), 4, 205);
  logAzione('Piano stampato', label + ' (' + _pianoReparto() + ')');
  mostraPdfPreview(doc, 'piano_' + ym + '_' + _pianoReparto() + '.pdf', 'Piano ' + label);
}

// Formulario cambio turno IDENTICO a Turnivo (template cambio_turno_pdf.html):
// header centrato, sezioni con barra colorata (A blu, B arancio, motivazione
// verde, autorizzazione viola con checkbox), chip turni, firme con data.
// I testi fissi (titoli, sezioni, autorizzazione, firme, piede) vengono dal modello del
// documento "cambio_turno" (js/modelli-documenti.js); testiSovra = testi da usare al posto di
// quelli salvati (anteprima). Chi chiama legge prima i modelli (modelliCarica).
function _pdfCambioTurno(dati, testiSovra) {
  // FOGLIO ARCHIVIATO: i testi del modello di quando e stato fatto (salvati nel foglio dalla
  // v455, anche {} = testi originali). I fogli di prima non li hanno: valgono quelli di oggi.
  if (testiSovra === undefined && dati && dati.modello_testi && typeof dati.modello_testi === 'object')
    testiSovra = dati.modello_testi;
  // fogli archiviati con il nome breve del settore di allora (es. "Slots"): si stampa il nome nei documenti
  dati = Object.assign({}, dati, {
    a: Object.assign({}, dati.a, { settore: settoreNomeDocumento(dati.a && dati.a.settore) }),
    b: Object.assign({}, dati.b, { settore: settoreNomeDocumento(dati.b && dati.b.settore) }),
  });
  const t = modelloTestoDi(
    modelloTesti('cambio_turno', testiSovra),
    modelloValori({
      nome: dati.a.nome || '',
      data: dati.data || '',
      settore: dati.a.settore || '',
      richiesto: dati.richiesto || getOperatore(),
    }),
  );
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  // header centrato
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text(t('intestazione'), 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text(dati.tipo === 'ESIGENZE' ? t('titolo_esigenze') : t('titolo'), 105, y, {
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
      t('sez_collab'),
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
      t('sez_a'),
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
      t('sez_b'),
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
      t('restituzione_titolo'),
      [142, 68, 173],
      [248, 240, 255],
      [
        ['Data restituzione:', dati.restituzione],
        ['', t('restituzione_frase')],
      ],
    );
  }
  sezione(t('motivazione_titolo'), [46, 204, 113], [240, 250, 240], [['', dati.motivo || t('motivo_vuoto')]]);
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
  doc.text(t('aut_titolo'), M + 6, yy);
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
  doc.text(t('aut_si'), M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text(t('aut_no'), M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(t('aut_motivo'), M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text(
    '_______________________________________________________________________',
    M + 22 + _modelloAllungo(doc, t('aut_motivo'), modelloOriginale('cambio_turno', 'aut_motivo')),
    yy,
  );
  y += hAut + 14;
  // firme
  const firme =
    dati.tipo === 'ESIGENZE'
      ? [
          [t('firma_collab'), dati.a.nome],
          [t('firma_resp'), ''],
        ]
      : [
          [t('firma_a'), dati.a.nome],
          [t('firma_b'), dati.b.nome],
          [t('firma_resp'), ''],
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
  doc.text(t('piede'), 105, ph - 9, {
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
  toast('Cerco con chi può cambiare...');
  await _pianoCaricaStoriaGruppi(_pianoReparto()).catch(() => {}); // idoneita come la bozza
  const ym = _pianoMeseSel;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const fineMeseSucc = new Date(anno, mese + 1, 0, 12); // a mezzogiorno: toISOString (UTC) non torna al giorno prima
  const iso = (d) => d.toISOString().substring(0, 10);
  // dal 14 del mese prima a 14 giorni dopo il mese successivo: le regole di Valida
  // (settimane, giorni di fila, riposi) guardano anche i giorni a cavallo
  const daRange = new Date(ym + '-01T12:00:00');
  daRange.setDate(daRange.getDate() - 14);
  const finoA = new Date(fineMeseSucc);
  finoA.setDate(finoA.getDate() + 14);
  // SENZA filtro settore: chi lavora in due settori ha celle anche nell'altro
  // piano, e quel giorno NON e' libero (prima risultava libero e la sua cella
  // dell'altro settore veniva sovrascritta)
  const righeTutte = (await secGet('piano?data=gte.' + iso(daRange) + '&data=lte.' + iso(finoA) + '')) || [];
  const mappe = {}; // nome -> {data: codice}
  const bloccate = {}; // nome|data -> motivo (celle bloccate con motivo: non si toccano)
  const rigaPer = {}; // nome|data -> riga (orari veri per il riposo)
  righeTutte.forEach((x) => {
    (mappe[x.collaboratore] = mappe[x.collaboratore] || {})[x.data] = x.codice;
    rigaPer[x.collaboratore + '|' + x.data] = x;
    if (_pianoCellaRiservata(x)) bloccate[x.collaboratore + '|' + x.data] = _pianoCellaRiservata(x);
    // C e WD messi dal programma attorno alle vacanze (generati e protetti): riservati
    else if (x.protetto && x.generato && !_pianoTurnoInfo(x.codice))
      bloccate[x.collaboratore + '|' + x.data] = 'congedo attorno alle vacanze';
  });
  // assenze del Diario (ND, malattie, congedi) e fuori contratto: il giorno non e libero
  const assente = _pianoAssenzeLettore();
  // simula: nella mappa di "nome", il giorno dstr diventa "codice"; ritorna la prima
  // violazione NUOVA (stesse regole di Valida, nel mese del giorno e in quello accanto
  // se il giorno e vicino al confine), null se non ne crea. Prima qui c erano solo
  // riposo 11 ore con l orario base e giorni di fila: un cambio poteva creare un
  // riposo singolo dopo 4 giorni o superare le ore della settimana.
  const ctxPer = {};
  const chiaviAttorno = (nomeP, mappa, dstr) => {
    const out = new Set();
    const d0 = new Date(dstr + 'T12:00:00');
    const mesi = new Set([dstr.substring(0, 7)]);
    [-14, 14].forEach((off) => {
      const d = new Date(d0);
      d.setDate(d.getDate() + off);
      mesi.add(iso(d).substring(0, 7));
    });
    mesi.forEach((ymD) => {
      const primo = new Date(ymD + '-01T12:00:00');
      const dIdx = (k) => {
        const d = new Date(primo);
        d.setDate(d.getDate() + k - 1);
        return dataLocaleISO(d);
      };
      _pianoChiaviViolazioni(
        nomeP,
        ymD,
        (k) => mappa[dIdx(k)],
        (k) => rigaPer[nomeP + '|' + dIdx(k)],
        ctxPer[ymD] || (ctxPer[ymD] = _pianoCtxViolazioni(ymD)),
      ).forEach((k) => out.add(ymD + '|' + k));
    });
    return out;
  };
  const problema = (mappa, dstr, codice, nome) => {
    const m2 = Object.assign({}, mappa);
    m2[dstr] = codice;
    const nuove = _pianoViolazioniNuove(chiaviAttorno(nome, mappa, dstr), chiaviAttorno(nome, m2, dstr));
    return nuove.length ? nuove[0].split('|').slice(2).join('|') : null;
  };
  const eLibero = (cod) => !cod || (!_pianoTurnoInfo(cod) && ['C', ''].includes(String(cod)));
  // il richiedente libero il giorno X SENZA restituzione rispetta le regole? (es. il giorno
  // libero non puo essere un riposo singolo vietato): se no, solo cambi con restituzione
  const liberoOk = !problema(mappe[sel.nome] || {}, sel.data, 'C', sel.nome);
  // CANDIDATI: a riposo il giorno X, idonei al turno, regole rispettate
  const candidati = [];
  collaboratoriCache
    .filter(
      (c) =>
        c.attivo !== false &&
        _pianoAppartieneAlReparto(c) &&
        c.nome !== sel.nome &&
        c.funzione !== 'RESP' &&
        _pianoOperativoIl(c, sel.data), // non chi ha finito il rapporto
    )
    .forEach((c) => {
      const mia = mappe[c.nome] || {};
      if (!eLibero(mia[sel.data])) return;
      if (assente(c.nome, sel.data)) return; // ND, malattia o congedo nel Diario
      if (bloccate[c.nome + '|' + sel.data]) return; // cella bloccata con motivo
      if (!_pianoIdoneoPerTurno(c.nome, tMio, sel.data)) return;
      const prob = problema(mia, sel.data, r.codice, c.nome);
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
        if (assente(sel.nome, y)) continue;
        if (!_pianoOperativoIl(sel.nome, y)) continue; // dopo la fine del rapporto non si restituisce
        if (bloccate[c.nome + '|' + y] || bloccate[sel.nome + '|' + y]) continue;
        if (!_pianoIdoneoPerTurno(sel.nome, tSuo, y)) continue;
        if (problema(mioPiano, y, codSuo, sel.nome)) continue;
        // e il collega che il giorno della restituzione va a riposo (C): anche per lui nessuna
        // regola nuova, con il giorno X gia preso (C attorno alle vacanze, riposo singolo...)
        if (problema(suoPiano, y, 'C', c.nome)) continue;
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
      if (!liberoOk && !rest.length) return;
      candidati.push({ nome: c.nome, jolly: c.impiego === 'jolly' || c.is_jolly, rest: rest });
    });
  candidati.sort((a, b) => b.rest.length - a.rest.length || a.nome.localeCompare(b.nome));
  if (!candidati.length) {
    toast('Nessun collega a riposo quel giorno può coprire ' + r.codice + ' rispettando le regole');
    return;
  }
  _ccDati = { nome: sel.nome, data: sel.data, codice: r.codice, candidati: candidati, liberoOk: liberoOk };
  const dataIt = sel.data.split('-').reverse().join('.');
  let h =
    '<h3>Cerca cambio · ' +
    escP(sel.nome) +
    ' libero il ' +
    dataIt +
    '</h3><p style="font-size:var(--fs-md,.875rem);margin-bottom:10px">' +
    escP(sel.nome.split(' ')[0]) +
    ' cede il turno <b>' +
    escP(r.codice) +
    '</b> a un collega a riposo e lo restituisce prendendo un turno del collega in un altro giorno. Tutte le proposte rispettano idoneità e le regole di Valida: riposo minimo, giorni di fila, riposo settimanale, ore della settimana.' +
    (liberoOk ? '' : ' <b>Senza restituzione il giorno libero violerebbe le regole: serve una restituzione.</b>') +
    '</p>' +
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
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:8px">Puoi stampare la lista dei colleghi con cui può cambiare e consegnarla al collaboratore: lui chiede a chi vuole, poi si torna qui e si conferma. Alla conferma: celle aggiornate col commento del cambio, formulario cambio turno già compilato da stampare e firmare, conteggio nel limite cambi del richiedente.</p>' +
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
    identita().azienda + ' · lista informativa, il cambio va confermato dal responsabile',
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
    (_ccDati.liberoOk ? '<option value="">senza restituzione (solo copertura)</option>' : '') +
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
// un cambio alla volta: il doppio click su "Applica cambio" lo applicava due volte
function confermaCercaCambioLibero() {
  return unaVoltaSola('piano-cerca-cambio-applica', () => _pianoConScrittura(() => _confermaCercaCambioLiberoEsegui()));
}
async function _confermaCercaCambioLiberoEsegui() {
  const avvisoRete = !!window._sessioneScadutaAvvisata;
  if (!_ccDati || !puoGestirePiano()) return;
  if (!(await _pianoConsentiScrittura(_ccDati.data))) return; // giorno chiuso
  const i = parseInt((document.getElementById('cc-collega') || {}).value) || 0;
  const cand = _ccDati.candidati[i];
  const dataRest = (document.getElementById('cc-rest') || {}).value || '';
  const motivo = ((document.getElementById('cc-motivo') || {}).value || '').trim();
  const rInfo = cand.rest.find((x) => x.data === dataRest);
  if (!rInfo && !_ccDati.liberoOk) {
    toastErrore(
      'Senza restituzione il giorno libero di ' +
        _ccDati.nome +
        ' violerebbe le regole: scegli un giorno di restituzione',
    );
    return;
  }
  // anche il giorno della RESTITUZIONE deve essere aperto (prima si controllava solo il primo)
  if (rInfo && !(await _pianoConsentiScrittura(dataRest))) return;
  const dataIt = _ccDati.data.split('-').reverse().join('.');
  const op = getOperatore();
  // limite cambi mensile: a carico di chi RICHIEDE il giorno libero
  const maxC = _pianoMaxCambi();
  if (maxC > 0) {
    const richiesti = await _pianoCambiRichiesti(_pianoMeseSel);
    const n = richiesti[_ccDati.nome] || 0;
    if (n >= maxC) {
      if (
        !(await chiediConferma(
          'ATTENZIONE: ' +
            _ccDati.nome +
            ' ha già richiesto ' +
            n +
            '/' +
            maxC +
            " cambi questo mese.\n\nAutorizzi comunque il cambio come responsabile? (verra' registrato nello storico come autorizzazione in deroga)",
        ))
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
  // DOMENICHE LIBERE VALIDE: chi copre (o chi restituisce) puo perdere una delle 12
  const domPerse = await _pianoAvvisiDomenichePerse(
    [{ nome: cand.nome, data: _ccDati.data, codice: _ccDati.codice }].concat(
      rInfo ? [{ nome: _ccDati.nome, data: dataRest, codice: rInfo.codice }] : [],
    ),
  );
  if (domPerse.length) msg += '\n\nDOMENICA LIBERA:\n• ' + domPerse.join('\n• ');
  if (!(await chiediConferma(msg + "\n\nConfermi? Verra' generato il formulario cambio turno da stampare e firmare.")))
    return;
  if (domPerse.length) logAzione('Piano: domenica libera persa confermata', domPerse.join(' | '));
  const passo = _pianoUndoSnap('cerca cambio ' + _ccDati.data);
  // TUTTO O NIENTE, e solo se le celle sono ancora quelle mostrate: le 2-4 celle del
  // cambio si scrivono in UNA scrittura (prima una alla volta, senza ritorno)
  const celle = [
    [_ccDati.nome, _ccDati.data, 'C', 'Ex ' + _ccDati.codice + ' - cambio con ' + cand.nome + ' - ' + op],
    [cand.nome, _ccDati.data, _ccDati.codice, 'Ex C - cambio con ' + _ccDati.nome + ' - ' + op],
  ];
  // commenti nello stesso formato dello scambio classico: Ex <vecchio> - cambio con <nome> - <operatore>
  if (rInfo) {
    celle.push([
      cand.nome,
      dataRest,
      'C',
      'Ex ' + rInfo.codice + ' - restituzione cambio con ' + _ccDati.nome + ' - ' + op,
    ]);
    celle.push([_ccDati.nome, dataRest, rInfo.codice, 'Ex C - restituzione cambio con ' + cand.nome + ' - ' + op]);
  }
  let esito;
  try {
    const lette = await Promise.all(
      celle.map((c) =>
        secGet('piano?collaboratore=eq.' + encodeURIComponent(c[0]) + '&data=eq.' + c[1] + '&limit=5').then(
          (x) => (x || [])[0] || null,
        ),
      ),
    );
    const ops = celle.map((c, i) => {
      const r0 = lette[i];
      if (r0 && (r0.reparto_dip || 'slots') !== _pianoReparto())
        throw new Error(c[0] + ' il ' + c[1] + ' ha una cella nel piano ' + repartoLabel(r0.reparto_dip));
      if (r0 && _pianoCellaRiservata(r0))
        throw new Error(c[0] + ' il ' + c[1] + ': cella riservata (' + _pianoCellaRiservata(r0) + ')');
      const dati = {
        codice: c[2],
        protetto: true,
        generato: false,
        commento: c[3].substring(0, 400),
        operatore: op,
      };
      if (r0) dati.updated_at = new Date().toISOString();
      else dati.reparto_dip = _pianoReparto();
      return { collaboratore: c[0], data: c[1], atteso: _pianoAttesoVisto(c[0], c[1], r0), dati: dati };
    });
    esito = await _pianoScriviCelle(ops);
  } catch (e) {
    _pianoUndoScarta(passo);
    console.error(e);
    _pianoErroreScrittura('Cambio NON applicato: ', e, avvisoRete);
    return;
  }
  if (!esito.ok) {
    _pianoUndoScarta(passo);
    document.getElementById('pwd-modal').classList.add('hidden');
    _ccDati = null;
    await _pianoAvvisaConflitti(esito.conflitti, 'Cambio non applicato');
    return;
  }
  _pianoMemoriaDopo(esito.ops, esito.righe);
  try {
    const logCambio =
      _ccDati.nome +
      ' (giorno libero il ' +
      _ccDati.data +
      ' coperto da ' +
      cand.nome +
      (dataRest ? ', restituzione ' + dataRest : ', senza restituzione') +
      ')';
    logAzione('Piano: scambio turno', logCambio);
    // Annulla di questo cambio: anche foglio archiviato e conteggio dei cambi
    if (passo) passo.seguito = { log: logCambio, foglio: null };
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
        a: {
          nome: _ccDati.nome,
          settore: repartoNomeDocumento(_pianoReparto()),
          turno: _ccDati.codice,
          orari: fmtOra(t),
        },
        b: { nome: cand.nome, settore: repartoNomeDocumento(_pianoReparto()), turno: 'C (riposo)', orari: '' },
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
      if (typeof modelliCarica === 'function') await modelliCarica();
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + _ccDati.data + '.pdf', 'Cambio turno ' + _ccDati.data);
      const idFoglio = await _salvaFoglioCambio(datiPdf, _ccDati.nome, _ccDati.data);
      if (passo && passo.seguito) passo.seguito.foglio = idFoglio;
    }
    toast('Cambio applicato' + (rInfo ? ' con restituzione' : ''));
    _ccDati = null;
    renderPiano();
  } catch (e) {
    // le celle sono scritte: qui si ferma solo il seguito (formulario, registro)
    console.error(e);
    toastErrore('Cambio applicato, ma il seguito non e riuscito: ' + ((e && e.message) || e));
    renderPiano();
  }
}

// Il foglio del cambio resta ARCHIVIATO (tabella moduli, tipo cambio_turno):
// si ristampa in qualsiasi momento dal menu della cella
async function _salvaFoglioCambio(datiPdf, collaboratore, dataCambio) {
  try {
    // i testi del modello usati per questo foglio (come i moduli, js/moduli.js): la ristampa
    // usa quelli di quando e stato fatto, anche se il modello cambia dopo. {} = originali.
    const testiUsati = typeof modelloTestiCambiati === 'function' ? modelloTestiCambiati('cambio_turno') : {};
    const rec = {
      tipo: 'cambio_turno',
      collaboratore: collaboratore,
      data_modulo: dataCambio,
      dati: Object.assign({}, datiPdf, { modello_testi: testiUsati || {} }),
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    // il foglio e parte del passo del Piano (seguito.foglio): Annulla dello scambio lo mette
    // nel Cestino. Fuori dall Annulla generale: prima diventava un azione a parte, piu
    // recente dello scambio, e il primo Ctrl+Z toglieva solo il foglio lasciando lo scambio
    const scrivi = () => secPost('moduli', rec);
    const saved = await (window.Annulla ? window.Annulla.senzaTraccia(scrivi) : scrivi());
    if (saved && saved[0] && typeof moduliCache !== 'undefined') moduliCache.unshift(saved[0]);
    return saved && saved[0] ? saved[0].id : null;
  } catch (e) {
    console.error('archivio foglio cambio', e);
    return null;
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
    if (typeof modelliCarica === 'function') await modelliCarica();
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
    // scambio scelto a mano: i turni bloccati non contano (vedi _pianoIdoneoAMano)
    if (!_pianoIdoneoAMano(sel.nome, tSuo)) return 'tu non sei idoneo a ' + c.codice;
    if (!_pianoIdoneoAMano(c.collaboratore, tMio)) return 'non idoneo a ' + r.codice;
    if (!riposoOkCon(sel.nome, g, tSuo) || !riposoOkCon(c.collaboratore, g, tMio)) return 'riposo 11h violato';
    return null;
  };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambio turno · ' +
    new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3><p style="margin-bottom:10px;font-size:var(--fs-md,.875rem)"><strong>' +
    escP(sel.nome) +
    '</strong> (' +
    escP(r.codice) +
    ') scambia con:</p>' +
    (maxCambi > 0
      ? '<p style="font-size:var(--fs-sm,.8125rem);color:' +
        (mieiCambi >= maxCambi ? 'var(--c-rosso,#c0392b)' : 'var(--muted)') +
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
          (prob ? ' style="color:var(--c-rosso,#c0392b)"' : '') +
          '>' +
          escP(c.collaboratore) +
          ' · ' +
          escP(c.codice) +
          (prob ? ' · da verificare: ' + prob : ' · regole rispettate') +
          '</option>'
        );
      })
      .join('') +
    '</select><div class="field" style="text-align:left;margin-top:10px"><label>Motivazione</label><input type="text" id="scambio-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<div style="text-align:left;margin-top:10px"><label style="font-weight:700;font-size:var(--fs-md,.875rem)"><input type="checkbox" id="scambio-restituito" onchange="document.getElementById(\'scambio-rest-wrap\').style.display=this.checked?\'block\':\'none\'"> Con restituzione</label>' +
    '<div id="scambio-rest-wrap" style="display:none;margin-top:6px"><label style="font-size:var(--fs-sm,.8125rem)">Data restituzione:</label> <input type="date" id="scambio-data-rest" style="padding:6px;max-width:180px"></div></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioTurno()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
// scambio in corso: la generazione automatica aspetta (anche durante le conferme).
// Uno scambio alla volta: il doppio click su "Scambia" lo faceva partire due volte
function confermaScambioTurno() {
  return unaVoltaSola('piano-scambio-turno', () => _pianoConScrittura(() => _confermaScambioTurnoEsegui()));
}
async function _confermaScambioTurnoEsegui() {
  const avvisoRete = !!window._sessioneScadutaAvvisata;
  const sel = _pianoCellaSel;
  if (sel && sel.data && !(await _pianoConsentiScrittura(sel.data))) return; // giorno chiuso
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
        !(await chiediConferma(
          'ATTENZIONE: ' +
            sel.nome +
            ' ha già richiesto ' +
            n +
            '/' +
            maxC +
            ' cambi questo mese.\n\nAutorizzi comunque lo scambio come responsabile? (verrà registrato nello storico come autorizzazione in deroga)',
        ))
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
        !(await chiediConferma(
          'ATTENZIONE · scambio ' +
            sel.data.split('-').reverse().join('.') +
            ':\n\n• ' +
            dettagli.join('\n• ') +
            "\n\nConfermi comunque lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        ))
      )
        return;
      if (av1.length) nota1 = 'Avviso: ' + av1.join(' · ') + ' · ';
      if (av2.length) nota2 = 'Avviso: ' + av2.join(' · ') + ' · ';
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
    // LO SCAMBIO E LA RESTITUZIONE INSIEME: ogni giorno sopra e controllato da solo, sul
    // piano di prima; se i due giorni sono vicini (es. uno dopo l altro) il riposo fra il
    // turno scambiato e quello restituito non si vedeva
    try {
      const comb = await _pianoViolazioniMosse([
        { nome: sel.nome, data: sel.data, codice: c2 },
        { nome: collega, data: sel.data, codice: c1 },
        { nome: sel.nome, data: dataRest, codice: cbPre || 'C' },
        { nome: collega, data: dataRest, codice: caPre || 'C' },
      ]);
      const gia = new Set(av1.concat(av2, avA, avB));
      (comb[sel.nome] || []).filter((v) => !v.ore && !gia.has(v.msg)).forEach((v) => avA.push(v.msg));
      (comb[collega] || []).filter((v) => !v.ore && !gia.has(v.msg)).forEach((v) => avB.push(v.msg));
    } catch (e) {
      /* senza lettura restano i controlli dei singoli giorni */
    }
    if (avA.length || avB.length) {
      const det = []
        .concat(avA.map((a) => sel.nome.split(' ')[0] + ': ' + a))
        .concat(avB.map((a) => collega.split(' ')[0] + ': ' + a));
      if (
        !(await chiediConferma(
          'ATTENZIONE · restituzione del ' +
            dataRest.split('-').reverse().join('.') +
            ':\n\n• ' +
            det.join('\n• ') +
            "\n\nConfermi comunque tutto lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        ))
      )
        return;
      if (avA.length) notaRa = 'Avviso: ' + avA.join(' · ') + ' · ';
      if (avB.length) notaRb = 'Avviso: ' + avB.join(' · ') + ' · ';
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
  const passo = _pianoUndoSnap('scambio turno ' + sel.data);
  // TUTTO O NIENTE, e solo se le celle sono ancora quelle mostrate: le due (o quattro,
  // con la restituzione) celle si scrivono in UNA scrittura. Prima erano scritture in
  // fila: un errore a meta lasciava uno solo dei due con il turno scambiato.
  const opS = getOperatore();
  const adesso = new Date().toISOString();
  const ops = [
    {
      collaboratore: sel.nome,
      data: sel.data,
      atteso: _pianoAttesoDi(r1),
      dati: {
        codice: c2,
        protetto: true,
        commento: (nota1 + (c1 ? 'Ex ' + c1 + ' - ' : '') + 'cambio con ' + collega + ' - ' + opS).substring(0, 400),
        operatore: opS,
        updated_at: adesso,
      },
    },
    {
      collaboratore: collega,
      data: sel.data,
      atteso: _pianoAttesoDi(r2),
      dati: {
        codice: c1,
        protetto: true,
        commento: (nota2 + (c2 ? 'Ex ' + c2 + ' - ' : '') + 'cambio con ' + sel.nome + ' - ' + opS).substring(0, 400),
        operatore: opS,
        updated_at: adesso,
      },
    },
  ];
  // Restituzione: come Turnivo, scambio inverso applicato subito alla data indicata
  if (dataRest) {
    // chi quel giorno non ha cella e' libero: dopo la restituzione riceve C
    const ca = ra ? ra.codice : 'C';
    const cb = rb ? rb.codice : 'C';
    const applica = (riga, nomeC, nuovoCod, exCod, altroNome, notaR) => {
      const commento = (
        (notaR || '') +
        'Ex ' +
        exCod +
        ' - restituzione cambio con ' +
        altroNome +
        ' - ' +
        opS
      ).substring(0, 400);
      if (!riga && !nuovoCod) return;
      const dati = {
        codice: nuovoCod,
        protetto: true,
        generato: false,
        commento: commento,
        operatore: opS,
      };
      if (riga) dati.updated_at = adesso;
      else dati.reparto_dip = _pianoReparto();
      ops.push({ collaboratore: nomeC, data: dataRest, atteso: _pianoAttesoVisto(nomeC, dataRest, riga), dati: dati });
    };
    applica(ra, sel.nome, cb, ca, collega, notaRa);
    applica(rb, collega, ca, cb, sel.nome, notaRb);
  }
  let esito;
  try {
    // giorno di restituzione chiuso: si chiede lo sblocco prima di scrivere
    if (dataRest && !(await _pianoConsentiScrittura(dataRest))) {
      _pianoUndoScarta(passo);
      return;
    }
    esito = await _pianoScriviCelle(ops);
  } catch (e) {
    _pianoUndoScarta(passo);
    console.error(e);
    _pianoErroreScrittura('Scambio NON fatto: ', e, avvisoRete);
    renderPiano();
    return;
  }
  if (!esito.ok) {
    _pianoUndoScarta(passo);
    await _pianoAvvisaConflitti(esito.conflitti, 'Scambio non fatto');
    return;
  }
  _pianoMemoriaDopo(esito.ops, esito.righe);
  try {
    if (dataRest) logAzione('Piano: restituzione programmata', sel.nome + ' <-> ' + collega + ' il ' + dataRest);
    const logScambio = sel.nome + ' (' + c1 + ') <-> ' + collega + ' (' + c2 + ') il ' + sel.data;
    logAzione('Piano: scambio turno', logScambio);
    // Annulla di questo scambio: anche foglio archiviato e conteggio dei cambi
    if (passo) passo.seguito = { log: logScambio, foglio: null };
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
        a: { nome: sel.nome, settore: repartoNomeDocumento(_pianoReparto()), turno: c1, orari: fmtOra(t1) },
        b: { nome: collega, settore: repartoNomeDocumento(_pianoReparto()), turno: c2, orari: fmtOra(t2) },
        motivo: motivo,
        richiesto: getOperatore(),
        autorizzato: true,
        restituzione: dataRest ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : null,
      };
      if (typeof modelliCarica === 'function') await modelliCarica();
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + sel.data + '.pdf', 'Cambio turno ' + sel.data);
      const idFoglio = await _salvaFoglioCambio(datiPdf, sel.nome, sel.data);
      if (passo && passo.seguito) passo.seguito.foglio = idFoglio;
    }
    renderPiano();
  } catch (e) {
    // le celle sono scritte: qui si ferma solo il seguito (formulario, registro)
    console.error(e);
    toastErrore('Turni scambiati, ma il seguito non e riuscito: ' + ((e && e.message) || e));
    renderPiano();
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
  // l ordine fatto a mano trascinando i nomi si perde: si chiede prima
  if (
    !(await chiediConferma(
      'Tornare all ordine predefinito dei nomi (responsabili, vice, SUP, BO, poi gli altri; i jolly in fondo)? L ordine fatto trascinando i nomi si perde.',
      { ok: 'Ripristina ordine' },
    ))
  )
    return;
  window._pianoOrdineCollab = window._pianoOrdineCollab || {};
  delete window._pianoOrdineCollab[_pianoReparto()];
  if (!(await salvaImp('piano_ordine_collab', JSON.stringify(window._pianoOrdineCollab)))) return;
  logAzione('Piano: ordine predefinito', _pianoReparto());
  toast('Ordine dei nomi rimesso: responsabili, vice, SUP, BO, poi gli altri; i jolly in fondo');
  renderPiano();
}

// ================================================================
// COPERTURA MALATTIA · port di malattia_cerca/malattia_conferma di
// Turnivo: per ogni giorno del periodo propone il miglior sostituto
// libero e idoneo (greedy: meno ore mese + meno giorni consecutivi),
// alla conferma mette M al malato e i turni (protetti) ai sostituti.
// ================================================================
// giorno (YYYY-MM-DD) di un indice g del mese aperto, anche fuori dal mese (g <= 0)
function _pianoGiornoDiIndice(g) {
  const d = new Date(_pianoMeseSel + '-01T12:00:00');
  d.setDate(d.getDate() + g - 1);
  return dataLocaleISO(d);
}
// dstr (facoltativo): il giorno del turno, per la preferenza dei giorni di lavoro
function _pianoIdoneoPerTurno(nome, turno, dstr) {
  // idoneita per le PROPOSTE del programma (cerca cambio, copertura malattia e ND,
  // Migliora ore, finestra copertura del Diario): lo stesso motore della bozza
  // (PianoRegole.idoneita), con il giorno del turno e la storia del settore aperto; chi
  // viene da un altro settore solo nell area della sua copertura
  return PianoRegole.idoneita(
    _pianoCollabInfo(nome) || {},
    turno,
    _pianoCtxIdoneita({
      dow: dstr ? new Date(String(dstr).substring(0, 10) + 'T12:00:00').getDay() : null,
      storiaDi: () => _pianoStoriaGruppiDi(nome, dstr),
      coperturaDi: (i) => _pianoCoperturaCfg(i),
    }),
  ).ok;
}
// IDONEITA PER LE SCELTE A MANO: lo stesso motore in modo "mano", piu largo per scelta:
// niente turni bloccati (S1 e S3 a chi non copre sala, reception e cassa: non vengono mai
// PROPOSTI, ma chi li scrive a mano non riceve l avviso "non formato"), niente "solo a
// mano", e le funzioni che fanno tutto (SUP, RESP) possono ogni turno. L avviso resta
// per un area davvero non abilitata.
function _pianoIdoneoAMano(nome, turno) {
  return PianoRegole.idoneita(
    _pianoCollabInfo(nome) || {},
    turno,
    _pianoCtxIdoneita({ modo: 'mano', storiaDi: () => _pianoStoriaGruppiDi(nome) }),
  ).ok;
}
// NOTE DELLA COPERTURA (decisione 15.10, segnalazione del titolare "al sostituto non cambia
// nulla"): chi copre ha "Ex C - copre Rossi Mario (malattia) - operatore", il malato
// "Ex S7 - coperto da Bianchi Anna - operatore". La sigla di prima resta in testa ("Ex S7"):
// togliendo la malattia torna al suo posto come sempre.
// nd: true = non disponibilita, 'ASS' = assenza in attesa di certificato
function _pianoNotaCopre(exCod, malato, nd, op) {
  return (
    'Ex ' +
    (exCod || '-') +
    ' - copre ' +
    malato +
    (nd === 'ASS' ? ' (assenza)' : nd ? ' (non disponibile)' : ' (malattia)') +
    ' - ' +
    op
  ).substring(0, 400);
}
function _pianoCopreMalattiaDi(r, malato) {
  const c = String((r && r.commento) || '');
  return c.includes(' - copre ' + malato + ' (');
}
// TURNI LASCIATI SCOPERTI DA UNA MALATTIA nel periodo: celle M con la nota "Ex <sigla>"
// che nessun collega copre ancora. Per i percorsi che scrivono la M senza cercare chi
// copre (M a mano nel Piano, Diario, Rapporto). [{ data, codice }]
// Anche le ASS (assenza in attesa di certificato): il turno resta scoperto come con la M.
async function _pianoTurniScopertiMalattia(nome, dal, al) {
  return (await _pianoStatoTurniMalattia(nome, dal, al))
    .filter((x) => !x.libero && !x.da)
    .map((x) => ({ data: x.data, codice: x.codice, ass: x.ass }));
}
// STATO DEI TURNI DI UNA MALATTIA O ASSENZA, giorno per giorno (Diario › «Turni da coprire»,
// Copri ora, Avvisi): le celle M/ASS del periodo con il turno che c era sotto («Ex S7») e
// chi lo copre ora (la nota «copre Rossi (...)» del collega). Due letture.
// [{ data, codice, ass, libero, nonGiust, da }] (libero: sotto c era un riposo, niente da coprire)
async function _pianoStatoTurniMalattia(nome, dal, al) {
  const righe =
    (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=gte.' + dal + '&data=lte.' + al)) || [];
  const conM = righe.filter((r) => _pianoCodiceAssenteTurno(r.codice));
  const giorni = [...new Set(conM.map((r) => String(r.data).substring(0, 10)))];
  const giorno = giorni.length
    ? (await secGet(
        'piano?data=in.(' + giorni.join(',') + ')&commento=like.*copre*&select=collaboratore,data,commento',
      )) || []
    : [];
  return _pianoStatoTurniDaRighe(nome, conM, giorno);
}
// la parte di calcolo (senza letture): righe = celle della persona, giorno = celle dei
// colleghi negli stessi giorni (almeno quelle con la nota «copre»)
function _pianoStatoTurniDaRighe(nome, righe, giorno) {
  return righe
    .filter((r) => r.collaboratore === nome && _pianoCodiceAssenteTurno(r.codice))
    .map((r) => {
      const d = String(r.data).substring(0, 10);
      const codice = _pianoSiglaSottoMalattia(r);
      const libero = !codice || ['C', 'V', 'V1', 'CGF', 'WD', 'ND', 'M', 'M1'].includes(codice);
      const chi = libero
        ? null
        : (giorno || []).find((y) => String(y.data).substring(0, 10) === d && _pianoCopreMalattiaDi(y, nome));
      return {
        data: d,
        codice: codice,
        ass: r.codice === 'ASS',
        libero: libero,
        nonGiust: typeof _assNgCella === 'function' && _assNgCella(r),
        da: chi ? chi.collaboratore : null,
      };
    })
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
// MALATTIA TOLTA MA GIA COPERTA (decisione del titolare 15.10): togliendo la M dal Diario,
// dal Rapporto o dal Piano, se un collega la copriva il programma chiede «Rimetto il turno a
// X e tolgo la copertura a Y?». Le celle della copertura si ritrovano dalle note (il
// sostituto «Ex C - copre X (malattia)», le mosse a catena «(copertura di X)», anche il giorno
// prima) e tornano come erano prima della copertura: dallo storico del piano (la riga
// "prima" della scrittura che ha messo la nota), altrimenti dalla sigla della nota «Ex».
// Ritorna { ops, righe: [testo] }: le scritture condizionate (la cella deve essere ancora
// quella letta) da mettere nella STESSA _pianoScriviCelle del malato.
async function _pianoOpsTogliCopertura(nome, giorni) {
  const out = { ops: [], righe: [] };
  if (!nome || !giorni || !giorni.length) return out;
  const sposta = (d, n) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + n);
    return dataLocaleISO(x);
  };
  const date = [...new Set(giorni.concat(giorni.map((d) => sposta(d, -1))))].sort();
  const righe = (await secGet('piano?data=in.(' + date.join(',') + ')&limit=5000')) || [];
  const catena = ' (copertura di ' + nome + ')';
  const toccate = righe.filter(
    (r) =>
      r.collaboratore !== nome &&
      ((giorni.includes(String(r.data).substring(0, 10)) && _pianoCopreMalattiaDi(r, nome)) ||
        String(r.commento || '').includes(catena)),
  );
  const op = getOperatore();
  const ora = new Date().toISOString();
  const gg = (d) => String(d).substring(8, 10) + '.' + String(d).substring(5, 7);
  for (const r of toccate) {
    const d = String(r.data).substring(0, 10);
    let prima;
    // 1) com era, salvato dalla copertura stessa (dalla v455)
    const pm = r.prima_malattia;
    const exNota = _pianoSiglaSottoMalattia(r);
    if (pm && typeof pm === 'object' && pm.codice && (!exNota || pm.codice === exNota)) {
      prima = {
        codice: pm.codice,
        protetto: !!pm.protetto,
        generato: !!pm.generato,
        commento: pm.commento || null,
        motivo_blocco: pm.motivo_blocco || null,
        prima_malattia: null,
      };
    }
    // 2) lo storico della cella: la scrittura che ha messo la nota (null = era vuota)
    if (prima === undefined) {
      try {
        const st =
          (await _rpcSicura('piano_storico_cella', {
            p_token: getOpToken(),
            p_collaboratore: r.collaboratore,
            p_data: d,
          })) || [];
        const x = st.find((e) => e.a === r.codice && String(e.commento || '') === String(r.commento || ''));
        if (x) prima = x.da ? { codice: x.da, protetto: false, generato: false, commento: null } : null;
      } catch (e) {
        /* storico non leggibile: vale la nota */
      }
    }
    // 3) la sigla della nota «Ex C - copre ...» («Ex -» = era vuota)
    if (prima === undefined) {
      const ex = exNota || (String(r.commento || '').match(/^Ex (-)/) ? '-' : '');
      prima = !ex || ex === '-' ? null : { codice: ex, protetto: false, generato: false, commento: null };
    }
    out.ops.push({
      collaboratore: r.collaboratore,
      data: d,
      atteso: _pianoAttesoDi(r),
      dati: prima ? Object.assign({}, prima, { operatore: op, updated_at: ora }) : null,
    });
    out.righe.push(
      r.collaboratore + ' ' + gg(d) + ': ' + r.codice + ' torna ' + (prima && prima.codice ? prima.codice : 'vuota'),
    );
  }
  return out;
}
// testo della domanda (giorni: le date della M che si toglie, con la sigla che torna)
function _pianoTestoTogliCopertura(nome, ritorni, cop) {
  const gg = (d) => String(d).substring(8, 10) + '.' + String(d).substring(5, 7);
  return (
    'Rimetto il turno a ' +
    nome +
    (ritorni.length ? ' (' + ritorni.map((x) => gg(x.data) + ' ' + x.codice).join(', ') + ')' : '') +
    ' e tolgo la copertura?\n\n• ' +
    cop.righe.join('\n• ') +
    '\n\nSì = tutto torna com era prima della malattia, in una sola scrittura (Annulla la rimette). No = la copertura resta.'
  );
}
// MALATTIA SCRITTA SENZA COPERTURA (M a mano nel Piano, Malattia nel Diario o nel Rapporto):
// AVVISO DISCRETO NELLA PAGINA, mai una finestra (decisione del titolare 15.10: nel Rapporto
// la finestra si apriva mentre si scriveva, all autosalvataggio). L avviso arriva dopo il
// salvataggio: «Malattia di Rossi registrata: 2 turni da coprire — Copri ora · Più tardi».
// Copri ora apre Sostituisci chi e in malattia gia compilata; Più tardi lo chiude e i turni
// restano in Piano › Avvisi › Malattie da coprire. Corretta o cancellata la malattia
// (sincronizzaMalattiaPiano) l avviso si aggiorna o sparisce.
window._copAvvisi = window._copAvvisi || {};
// stato della malattia nel periodo: quante M e quali turni restano scoperti
async function _pianoMalattiaStato(nome, dal, al) {
  const righe =
    (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=gte.' + dal + '&data=lte.' + al)) || [];
  // M e ASS (assenza in attesa di certificato): l avviso dice «Assenza» se sono tutte ASS
  const nM = righe.filter((r) => _pianoCodiceAssenteTurno(r.codice)).length;
  const nAss = righe.filter((r) => r.codice === 'ASS').length;
  const scoperti = nM ? await _pianoTurniScopertiMalattia(nome, dal, al) : [];
  return { nM: nM, nAss: nAss, scoperti: scoperti };
}
function _pianoAvvisoCopertura(nome, dal, al) {
  if (!nome || !dal) return Promise.resolve();
  const vecchio = window._copAvvisi[nome];
  window._copAvvisi[nome] = {
    dal: vecchio && vecchio.dal < dal ? vecchio.dal : dal,
    al: vecchio && vecchio.al > (al || dal) ? vecchio.al : al || dal,
    punti: true, // i punti della copertura si possono ancora segnare
  };
  return _pianoAvvisoCoperturaAggiorna(nome);
}
async function _pianoAvvisoCoperturaAggiorna(nome) {
  const a = window._copAvvisi[nome];
  if (!a) return;
  try {
    const st = await _pianoMalattiaStato(nome, a.dal, a.al);
    const gestisce = typeof puoGestirePiano === 'function' && puoGestirePiano();
    a.scoperti = gestisce ? st.scoperti : [];
    a.ass = st.nAss > 0 && st.nAss === st.nM; // solo ASS: «Assenza di Rossi registrata»
    a.conPunti =
      a.punti &&
      typeof apriPopupCopertura === 'function' &&
      (typeof incentiviAttivi !== 'function' || incentiviAttivi('copertura'));
    // malattia tolta, o niente da fare: l avviso sparisce
    if (!st.nM || (!a.scoperti.length && !a.conPunti)) delete window._copAvvisi[nome];
  } catch (e) {
    /* senza rete l avviso resta com era */
  }
  _pianoAvvisoCoperturaRender();
}
function _pianoAvvisoCoperturaRender() {
  let box = document.getElementById('cop-avvisi');
  const nomi = Object.keys(window._copAvvisi);
  const togli = Object.keys(window._copTogli || {});
  if (!nomi.length && !togli.length) {
    if (box) box.remove();
    return;
  }
  if (!box) {
    box = document.createElement('div');
    box.id = 'cop-avvisi';
    box.setAttribute('role', 'status');
    box.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:900;max-width:min(460px,calc(100vw - 32px));display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(box);
  }
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
  const ja = (x) => "'" + String(x).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  box.innerHTML = nomi
    .map((n) => {
      const a = window._copAvvisi[n];
      const k = (a.scoperti || []).length;
      return (
        '<div class="cop-avviso" style="background:var(--paper,#fff);color:var(--ink,#222);border:1px solid var(--line,#ccc);border-left:4px solid var(--c-rosso,#c0392b);border-radius:3px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:var(--fs-md,.875rem)">' +
        '<div>' +
        (a.ass ? 'Assenza (attesa certificato)' : 'Malattia') +
        ' di <b>' +
        escP(n) +
        '</b> registrata' +
        (k
          ? ': <b>' +
            k +
            (k === 1 ? ' turno da coprire' : ' turni da coprire') +
            '</b> (' +
            a.scoperti.map((x) => gg(x.data) + ' ' + escP(x.codice)).join(', ') +
            ')'
          : '') +
        '</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
        (k
          ? '<button type="button" class="btn-modal-ok" style="padding:5px 12px" onclick="pianoAvvisoCopriOra(' +
            ja(n) +
            ')">Copri ora</button>'
          : '') +
        (!k && a.conPunti
          ? '<button type="button" class="btn-modal-ok" style="padding:5px 12px" onclick="pianoAvvisoPunti(' +
            ja(n) +
            ')">Chi ha coperto (punti)</button>'
          : '') +
        '<button type="button" class="btn-modal-cancel" style="padding:5px 12px" onclick="pianoAvvisoPiuTardi(' +
        ja(n) +
        ')">Più tardi</button></div></div>'
      );
    })
    .concat(
      togli.map(
        (n) =>
          '<div class="cop-avviso" style="background:var(--paper,#fff);color:var(--ink,#222);border:1px solid var(--line,#ccc);border-left:4px solid var(--c-oro,#8b6914);border-radius:3px;padding:10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:var(--fs-md,.875rem)"><div>Malattia di <b>' +
          escP(n) +
          '</b> tolta (' +
          window._copTogli[n].map(gg).join(', ') +
          '): il turno è tornato a ' +
          escP(n.split(' ')[0]) +
          ', ma un collega lo copre ancora.</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn-modal-ok" style="padding:5px 12px" onclick="pianoAvvisoTogliCopertura(' +
          ja(n) +
          ')">Togli la copertura</button><button type="button" class="btn-modal-cancel" style="padding:5px 12px" onclick="pianoAvvisoLasciaCopertura(' +
          ja(n) +
          ')">Lascia</button></div></div>',
      ),
    )
    .join('');
}
// MALATTIA TOLTA DAL RAPPORTO (si salva mentre si scrive, niente finestre) che qualcuno
// copriva: avviso nella pagina «Togli la copertura · Lascia»
window._copTogli = window._copTogli || {};
function _pianoAvvisoTogliCopertura(nome, giorni) {
  window._copTogli[nome] = [...new Set((window._copTogli[nome] || []).concat(giorni))].sort();
  _pianoAvvisoCoperturaRender();
}
async function pianoAvvisoTogliCopertura(nome) {
  const giorni = window._copTogli[nome] || [];
  delete window._copTogli[nome];
  _pianoAvvisoCoperturaRender();
  return _pianoConScrittura(async () => {
    const cop = await _pianoOpsTogliCopertura(nome, giorni);
    if (!cop.ops.length) {
      toast('Nessuna copertura da togliere per ' + nome);
      return;
    }
    const passo = _pianoUndoSnap('tolta copertura malattia ' + nome.split(' ')[0]);
    let es;
    try {
      es = await _pianoScriviCelle(cop.ops);
    } catch (e) {
      _pianoUndoScarta(passo);
      _pianoErroreScrittura('Copertura NON tolta: ', e, false);
      return;
    }
    if (!es.ok) {
      _pianoUndoScarta(passo);
      await _pianoAvvisaConflitti(es.conflitti, 'Copertura non tolta');
      return;
    }
    _pianoMemoriaDopo(es.ops, es.righe);
    logAzione('Piano: copertura malattia tolta', nome + ' · ' + cop.righe.join('; '));
    toast('Copertura tolta: ' + cop.righe.join(', '), 6000);
    if (typeof renderPiano === 'function' && localStorage.getItem('pagina_corrente') === 'piano') renderPiano();
  });
}
function pianoAvvisoLasciaCopertura(nome) {
  delete window._copTogli[nome];
  _pianoAvvisoCoperturaRender();
}
async function pianoAvvisoCopriOra(nome) {
  const a = window._copAvvisi[nome];
  if (!a || !a.scoperti || !a.scoperti.length) return;
  delete window._copAvvisi[nome];
  _pianoAvvisoCoperturaRender();
  const ym = a.scoperti[0].data.substring(0, 7);
  const g = a.scoperti.filter((x) => x.data.startsWith(ym)).map((x) => parseInt(x.data.substring(8, 10)));
  await _pianoApriCopertura(nome, ym, Math.min(...g), Math.max(...g), null, a.ass ? 'ASS' : 'M');
}
function pianoAvvisoPunti(nome) {
  const a = window._copAvvisi[nome];
  delete window._copAvvisi[nome];
  _pianoAvvisoCoperturaRender();
  if (a && typeof apriPopupCopertura === 'function') apriPopupCopertura(nome, a.dal);
}
function pianoAvvisoPiuTardi(nome) {
  delete window._copAvvisi[nome];
  _pianoAvvisoCoperturaRender();
}
// TURNI DA COPRIRE DEL MESE APERTO (Piano › Avvisi › Malattie da coprire), dalle celle in
// memoria: M con un turno nella nota «Ex» che nessun collega copre quel giorno
function _pianoMalattieDaCoprire() {
  const righe = typeof _pianoRighe !== 'undefined' ? _pianoRighe : [];
  return righe
    .filter((r) => _pianoCodiceAssenteTurno(r.codice))
    .map((r) => ({
      nome: r.collaboratore,
      data: String(r.data).substring(0, 10),
      codice: _pianoSiglaSottoMalattia(r),
      ass: r.codice === 'ASS', // assenza in attesa di certificato
    }))
    .filter((x) => x.codice && _pianoTurnoInfo(x.codice))
    .filter((x) => !righe.some((y) => String(y.data).substring(0, 10) === x.data && _pianoCopreMalattiaDi(y, x.nome)))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.nome.localeCompare(b.nome)));
}
// apre Sostituisci chi e in malattia gia compilata (settore e mese del collaboratore) e
// cerca subito i sostituti. ass: null = malattia, { codice: 'ND', nota } = non disponibilita
// codice: 'ASS' o 'M' preimpostato in «Registra come» (dal Diario: il tipo della registrazione)
async function _pianoApriCopertura(nome, ym, gDa, gAl, ass, codice) {
  const info = _pianoCollabInfo(nome) || {};
  switchPage('piano');
  if (info.reparto_dip && typeof pianoCambiaReparto === 'function') pianoCambiaReparto(info.reparto_dip);
  _pianoMeseSel = ym;
  _pianoTab = 'calendario';
  await renderPiano();
  apriCoperturaMalattia();
  window._coperturaAssenza = ass || null;
  // ND: la sigla e decisa (niente scelta ASS / M)
  const rigaCod = document.getElementById('mal-codice-riga');
  if (rigaCod && ass) rigaCod.style.display = 'none';
  const selCod = document.getElementById('mal-codice');
  if (selCod && !ass && (codice === 'ASS' || codice === 'M')) selCod.value = codice;
  const sel = document.getElementById('mal-collab');
  if (sel) sel.value = nome;
  document.getElementById('mal-da').value = gDa;
  document.getElementById('mal-al').value = gAl;
  await cercaSostitutiMalattia();
}
// COPERTURA DI UNA NON DISPONIBILITA dal Diario: la stessa ricerca dei sostituti della
// malattia, gia compilata, che alla conferma scrive ND (non M) con la nota del Diario
async function apriCoperturaAssenza(nome, ym, gDa, gAl) {
  if (!puoGestirePiano()) return;
  await _pianoApriCopertura(nome, ym, gDa, gAl, { codice: 'ND', nota: _ND_NOTA_DIARIO });
}
function apriCoperturaMalattia() {
  if (!puoGestirePiano()) return;
  // aperta a mano = malattia; apriCoperturaAssenza la reimposta subito dopo
  window._coperturaAssenza = null;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Sostituisci chi è in malattia · ' +
    _pianoMeseSel +
    '</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Cerca i migliori sostituti liberi per i turni del collaboratore malato.</p>' +
    '<div class="field" style="text-align:left"><label>Collaboratore malato</label><select id="mal-collab" style="width:100%;padding:8px">' +
    nomi.map((n) => '<option>' + escP(n) + '</option>').join('') +
    '</select></div>' +
    '<div style="display:flex;gap:10px;margin-top:8px"><div class="field" style="text-align:left"><label>Dal giorno</label><input type="number" id="mal-da" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div>' +
    '<div class="field" style="text-align:left"><label>Al giorno</label><input type="number" id="mal-al" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div></div>' +
    // ASS (attesa certificato) e la scelta di base quando un collaboratore chiama (15.10)
    '<div class="field" id="mal-codice-riga" style="text-align:left;margin-top:8px"><label>Registra come</label><select id="mal-codice" style="width:100%;padding:8px"><option value="ASS">ASS · assenza in attesa di certificato (0 ore)</option><option value="M">M · malattia con certificato</option></select></div>' +
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
  await _pianoCaricaStoriaGruppi(_pianoReparto()).catch(() => {}); // idoneita come la bozza
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
      (await secGet('piano?data=gte.' + _isoB(_bDa) + '&data=lt.' + ym + '-01&reparto_dip=eq.' + _pianoReparto())) ||
      [];
    const _righeBordo2 =
      (await secGet(
        'piano?data=gt.' +
          ym +
          '-' +
          String(_nGiorniMese).padStart(2, '0') +
          '&data=lte.' +
          _isoB(_bAl) +
          '&reparto_dip=eq.' +
          _pianoReparto(),
      )) || [];
    [..._righeBordo, ..._righeBordo2].forEach((r) => {
      const idx = Math.round((new Date(r.data + 'T12:00:00') - _primoDelMese) / 86400000) + 1;
      cella[r.collaboratore + '|' + idx] = r.codice;
    });
  } catch (e) {
    toastErrore('Ricerca fermata: non riesco a leggere i giorni prima e dopo il mese (riposi). Riprova.', 8000);
    return;
  }
  // dopo la fine del rapporto il giorno non e libero: nessuna proposta
  for (const nf of nomi)
    for (let g = 1; g <= _pianoUltimoGiorno(ym); g++)
      if (!_pianoOperativoIl(nf, ym + '-' + String(g).padStart(2, '0'))) cella[nf + '|' + g] = 'FINE';
  const oreMese = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) oreMese[r.collaboratore] = (oreMese[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  // CANDIDATO VALIDO: le stesse regole di Valida per ogni persona toccata (nessuna
  // violazione nuova rispetto a com era il piano all inizio della ricerca), le assenze
  // del Diario (ND, malattie, congedi) e le celle riservate. Prima qui c erano solo
  // riposo 11 ore con l orario base e giorni di fila contati all indietro: si poteva
  // proporre una serie di 6 giorni o un sostituto con la ND registrata nel Diario.
  const ctxV = _pianoCtxViolazioni(ym);
  const assente = _pianoAssenzeLettore();
  const chiaviDi = (n) =>
    _pianoChiaviViolazioni(
      n,
      ym,
      (k) => cella[n + '|' + k],
      (k) => rigaDi[n + '|' + k],
      ctxV,
    );
  const base = {};
  nomi.forEach((n) => (base[n] = chiaviDi(n)));
  const regolaOk = (n) => _pianoViolazioniNuove(base[n] || new Set(), chiaviDi(n)).length === 0;
  // cella che si puo dare a un sostituto: vuota o un riposo non riservato. Restano fuori
  // vacanze, compleanno, celle con motivo e le C/WD che il programma ha messo protette
  // attorno alle vacanze (generate e protette); le C importate o scritte a mano si usano.
  const liberaPer = (n, gg) => {
    if (assente(n, _pianoGiornoDiIndice(gg))) return false;
    const cod = cella[n + '|' + gg] || '';
    if (!cod) return true;
    if (cod === 'FINE' || /^V/.test(cod)) return false;
    const r = rigaDi[n + '|' + gg];
    if (r && (_pianoCellaRiservata(r) || (r.protetto && r.generato))) return false;
    const cs = _pianoCodiceInfo(cod);
    return !!(cs && cs.is_riposo);
  };
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
  const giaM = new Set(); // giorni gia in M: si cerca solo il sostituto
  const giaAss = new Set(); // di questi, quelli in ASS (assenza in attesa di certificato)
  for (let g = da; g <= al; g++) {
    let cod = cella[nome + '|' + g] || '';
    let t = _pianoTurnoInfo(cod);
    if (!cod) {
      giorni.push({ g: g, salta: 'Nessun turno assegnato' });
      continue;
    }
    // GIA IN MALATTIA (M scritta a mano nel Piano, dal Diario o dal Rapporto): il turno
    // che la M ha preso e nella nota "Ex C4 - operatore" e resta da coprire. Prima questi
    // giorni si saltavano: la M c era ma al sostituto non arrivava niente.
    if (_pianoCodiceAssenteTurno(cod)) {
      const rM = rigaDi[nome + '|' + g];
      const sotto = _pianoSiglaSottoMalattia(rM);
      const tSotto = sotto ? _pianoTurnoInfo(sotto) : null;
      const chiCopre = _pianoRighe.find(
        (x) => x.data === _pianoGiornoDiIndice(g) && _pianoCopreMalattiaDi(x, nome) && x.collaboratore !== nome,
      );
      if (!tSotto || chiCopre) {
        giorni.push({
          g: g,
          salta: chiCopre
            ? 'Già coperto da ' + chiCopre.collaboratore + ' (' + chiCopre.codice + ')'
            : cod === 'ASS'
              ? 'Già in assenza (ASS)'
              : 'Già in malattia',
        });
        continue;
      }
      giaM.add(g);
      if (cod === 'ASS') giaAss.add(g);
      cod = sotto;
      t = tSotto;
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
      if (!liberaPer(n, g)) continue;
      if (!_pianoIdoneoPerTurno(n, t, _pianoGiornoDiIndice(g))) continue;
      {
        const sN = cella[n + '|' + g];
        cella[n + '|' + g] = cod;
        const okN = regolaOk(n);
        cella[n + '|' + g] = sN;
        if (!okN) continue;
      }
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
        if (!liberaPer(x, g)) continue;
        {
          // il suo giorno prima (il turno da scambiare o passare) non deve essere riservato
          const rP0 = rigaDi[x + '|' + (g - 1)];
          if (rP0 && (_pianoCellaRiservata(rP0) || (rP0.protetto && rP0.generato))) continue;
        }
        if (!_pianoIdoneoPerTurno(x, t, _pianoGiornoDiIndice(g))) continue;
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
          const rS = rigaDi[z + '|' + (g - 1)];
          if (rS && _pianoCellaRiservata(rS)) continue; // turno bloccato con motivo: non si scambia
          if (assente(z, _pianoGiornoDiIndice(g - 1))) continue;
          if (
            !_pianoIdoneoPerTurno(x, tS, _pianoGiornoDiIndice(g - 1)) ||
            !_pianoIdoneoPerTurno(z, tP, _pianoGiornoDiIndice(g - 1))
          )
            continue;
          const s1 = cella[x + '|' + (g - 1)];
          const s2 = cella[z + '|' + (g - 1)];
          const sG = cella[x + '|' + g];
          const sMal = cella[nome + '|' + g];
          cella[x + '|' + (g - 1)] = codS;
          cella[z + '|' + (g - 1)] = codP;
          cella[x + '|' + g] = cod; // x copre la malattia il giorno g
          cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
          const ok = regolaOk(x) && regolaOk(z) && accompagnamentoOkSost(g) && accompagnamentoOkSost(g - 1);
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
            if (!liberaPer(y, g - 1)) continue;
            if (!_pianoIdoneoPerTurno(y, tP, _pianoGiornoDiIndice(g - 1))) continue;
            const sy = cella[y + '|' + (g - 1)];
            const sx1 = cella[x + '|' + (g - 1)];
            const sxG = cella[x + '|' + g];
            const sMal2 = cella[nome + '|' + g];
            cella[y + '|' + (g - 1)] = codP; // il terzo prende il turno
            cella[x + '|' + (g - 1)] = 'C'; // x liberato il giorno prima
            cella[x + '|' + g] = cod; // x copre la malattia
            cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
            const ok = regolaOk(y) && regolaOk(x) && accompagnamentoOkSost(g) && accompagnamentoOkSost(g - 1);
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
        giaM: giaM.has(g),
        giaAss: giaAss.has(g),
        codice: cod,
        orari: (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
        sostituto: migliore,
        era: cella[migliore + '|' + g] || '',
        catena: catena,
      });
      cella[migliore + '|' + g] = cod; // override progressivo, come il greedy Turnivo
      oreMese[migliore] = (oreMese[migliore] || 0) + (parseFloat(t.durata_ore) || 0);
    } else {
      giorni.push({ g: g, giaM: giaM.has(g), giaAss: giaAss.has(g), codice: cod, scoperto: true });
    }
  }
  _malattiaPiano = { nome: nome, da: da, al: al, giorni: giorni };
  const descCatena = (d) =>
    !d.catena
      ? ''
      : d.catena.tipo === 'scambio'
        ? 'In più il ' +
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
        : 'In più il ' +
          d.catena.g1 +
          ': il turno ' +
          d.catena.turnoX +
          ' di ' +
          d.sostituto.split(' ')[0] +
          ' passa a ' +
          d.catena.con.split(' ')[0] +
          ', così ' +
          d.sostituto.split(' ')[0] +
          ' può coprire';
  _malattiaPiano.descCatena = descCatena;
  let h =
    '<table class="piano-table" style="min-width:100%;font-size:var(--fs-sm,.8125rem)"><thead><tr><th></th><th>Giorno</th><th>Turno</th><th style="text-align:left">Sostituto proposto</th></tr></thead><tbody>';
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
        '</td><td style="color:var(--c-rosso,#c0392b);font-weight:700;text-align:left">NESSUN SOSTITUTO DISPONIBILE (nemmeno con cambi a catena)</td></tr>';
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
        (d.giaM ? ' <span style="color:var(--muted)">(già ' + (d.giaAss ? 'ASS' : 'M') + ')</span>' : '') +
        '</td><td style="text-align:left;color:var(--c-verde,#2c6e49);font-weight:700">' +
        escP(d.sostituto) +
        (d.era ? ' <span style="color:var(--muted);font-weight:400">(era ' + escP(d.era) + ')</span>' : '') +
        // jolly chiamato che non e disponibile: ND con commento e nuova ricerca
        (_pianoEJolly(d.sostituto)
          ? ' <button class="btn-act" style="font-size:var(--fs-xs,.75rem);padding:1px 6px;margin-left:6px" title="Il jolly e stato chiamato ma non e disponibile: si scrive ND con il commento e si cerca un altro sostituto" onclick="malNdChiamata(' +
            d.g +
            ')">Chiamato, non disponibile</button>'
          : '') +
        (d.catena
          ? '<div style="font-weight:400;color:var(--c-oro,#8b6914);font-size:var(--fs-sm,.8125rem)">' +
            escP(descCatena(d)) +
            '</div>'
          : '') +
        '</td></tr>';
  });
  h += '</tbody></table>';
  const coperti = giorni.filter((d) => d.sostituto).length;
  const scoperti = giorni.filter((d) => d.scoperto).length;
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);margin-top:6px">' +
    coperti +
    ' giorni coperti' +
    (scoperti ? ', <b style="color:var(--c-rosso,#c0392b)">' + scoperti + ' scoperti</b>' : '') +
    '. Alla conferma: ' +
    (window._coperturaAssenza && window._coperturaAssenza.codice === 'ND'
      ? 'ND (protetta) al jolly non disponibile'
      : 'la sigla scelta in «Registra come» (ASS o M, protetta) al malato') +
    ' sui giorni non ancora in ASS o M; turni protetti SOLO per le soluzioni con la spunta' +
    (coperti ? ', punti incentivo con conferma' : '') +
    '. Le mosse a catena scrivono il commento anche sulle celle del giorno prima.</p>';
  h +=
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 14px;margin-top:4px" onclick="stampaPropostaCopertura()">Stampa proposta</button>';
  out.innerHTML = h;
  document.getElementById('mal-btn-conferma').style.display = coperti || giorni.some((d) => d.codice) ? '' : 'none';
}
async function malNdChiamata(g) {
  const m = _malattiaPiano;
  const d = m && m.giorni.find((x) => x.g === g);
  if (!d || !d.sostituto) return;
  const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
  if (
    !(await chiediConferma(
      d.sostituto +
        ' e stato chiamato per il ' +
        g +
        ' ma non e disponibile: scrivo ND con il commento e cerco un altro sostituto?',
    ))
  )
    return;
  if ((await _pianoNdChiamata(d.sostituto, dstr)) === false) return;
  _pianoRighe = await _pianoCaricaMeseSettore(
    _pianoMeseSel + '-01',
    _pianoMeseSel + '-' + String(_pianoUltimoGiorno(_pianoMeseSel)).padStart(2, '0'),
    _pianoReparto(),
  );
  await cercaSostitutiMalattia();
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
      repartoNomeDocumento(_pianoReparto()) +
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
  doc.text(identita().azienda + ' · proposta operativa, non vincolante', 14, doc.internal.pageSize.getHeight() - 8);
  mostraPdfPreview(doc, 'proposta_copertura_' + _pianoMeseSel + '.pdf', 'Proposta copertura');
}
// PIANO → DIARIO: una malattia scritta nel piano si registra anche nel Diario,
// cosi' la scheda collaboratore conta i giorni (i giorni C dentro il range,
// mostrati come MC, sono inclusi). Un giorno gia' registrato non si duplica.
// codiceSostituito: la sigla che la M ha preso (sceglie il Rapporto PRESTO o NOTTE)
// codice 'ASS': assenza in attesa di certificato (registrazione «Assenza»)
async function _pianoMalattiaNelDiario(nome, dal, al, chiedi, codiceSostituito, codice) {
  if (typeof datiCache === 'undefined' || typeof secPost !== 'function') return 0;
  const eAss = codice === 'ASS';
  const parola = eAss ? 'l assenza (attesa certificato)' : 'la malattia';
  const tipoMal = eAss
    ? _pianoTipoAssenza()
    : typeof nomeCorrente === 'function'
      ? nomeCorrente('Malattia')
      : 'Malattia';
  const dI = new Date(dal + 'T12:00:00'),
    dF = new Date(al + 'T12:00:00');
  const giorniNuovi = [];
  for (let d = new Date(dI); d <= dF; d.setDate(d.getDate() + 1)) {
    const dStr =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    // gia registrato: una riga di quel giorno o una vecchia riga che copre piu giorni
    // ("dal 02.11.2026 al 21.11.2026"): prima quel giorno veniva registrato due volte
    const esiste = datiCache.find(
      (e) =>
        (e.nome || '').toLowerCase() === nome.toLowerCase() &&
        e.tipo === tipoMal &&
        !e.eliminato &&
        (String(e.data || '').startsWith(dStr) || _pianoDateMalattia(e.testo || '', e.data).includes(dStr)),
    );
    if (!esiste) giorniNuovi.push(dStr);
  }
  if (!giorniNuovi.length) return 0;
  // TUTTO COLLEGATO: come se la malattia fosse scritta nel Rapporto del primo giorno
  // (Rapporto + Diario). Solo se il Piano aperto e del settore del Diario.
  const viaRapporto =
    typeof _rapportoAggiungiAssenza === 'function' &&
    currentReparto === _pianoReparto() &&
    (typeof isVis !== 'function' || isVis('rapporto')); // senza la pagina Rapporto il database non lo lascia scrivere
  if (viaRapporto) {
    const tInfo = codiceSostituito ? _pianoTurnoInfo(codiceSostituito) : null;
    const tr = tInfo && String(tInfo.tipo || '').toUpperCase() === 'NOTTURNO' ? 'NOTTE' : 'PRESTO';
    if (
      chiedi &&
      !(await chiediConferma(
        'Registro ' +
          parola +
          ' di ' +
          nome +
          ' anche nel Rapporto ' +
          tr +
          ' del ' +
          dal.split('-').reverse().join('.') +
          ' e nel Diario (' +
          giorniNuovi.length +
          (giorniNuovi.length === 1 ? ' giorno' : ' giorni') +
          ')?',
      ))
    )
      return 0;
    try {
      await _rapportoAggiungiAssenza(nome, dal, al, codiceSostituito, codice);
      return giorniNuovi.length;
    } catch (e) {
      console.error('malattia nel rapporto', e);
      toast('Rapporto non aggiornato: ' + parola + ' va solo nel Diario');
    }
  }
  if (
    chiedi &&
    !(await chiediConferma(
      'Registrare ' +
        parola +
        ' anche nel Diario di ' +
        nome +
        ' (' +
        giorniNuovi.length +
        (giorniNuovi.length === 1 ? ' giorno' : ' giorni') +
        ")?\n\nCosi' i giorni contano nella scheda del collaboratore.",
    ))
  )
    return 0;
  const lbl = ' (dal ' + dI.toLocaleDateString('it-IT') + ' al ' + dF.toLocaleDateString('it-IT') + ')';
  let creati = 0;
  const falliti = [];
  for (const dStr of giorniNuovi) {
    const rec = {
      id: Date.now() + creati,
      nome: nome,
      tipo: tipoMal,
      testo: (eAss ? 'Assenza (attesa certificato) registrata dal piano' : 'Malattia registrata dal piano') + lbl,
      data: dStr + 'T08:00:00.000Z',
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    try {
      await secPost('registrazioni', rec);
      datiCache.unshift(rec);
      creati++;
    } catch (e) {
      falliti.push(dStr.split('-').reverse().join('.'));
    }
  }
  if (creati)
    logAzione(
      eAss ? 'Assenza dal piano' : 'Malattia dal piano',
      nome + ' · ' + creati + ' giorni registrati nel Diario',
    );
  if (falliti.length)
    toastErrore(
      (eAss ? 'Assenza di ' : 'Malattia di ') +
        nome +
        ' NON registrata nel Diario per ' +
        falliti.join(', ') +
        ': registrala dal Diario.',
      10000,
    );
  return creati;
}
// PIANO → DIARIO anche in rimozione: se una M sparisce dal piano (tolta o
// sovrascritta con un turno), il programma propone di togliere quei giorni
// anche dal Diario. Le registrazioni finiscono nel Cestino, recuperabili.
// Annulla di una copertura malattia: i punti incentivo dati per quella copertura
// (copertura e rifiuti segnati nel popup) restavano. Si elencano e si chiede se toglierli:
// mai in automatico, i punti potrebbero valere anche se il piano si rifa a mano.
async function _pianoPuntiCoperturaVia(nome, giorniDstr) {
  if (typeof eventiCopertura !== 'function' || !giorniDstr || !giorniDstr.length) return 0;
  const ord = giorniDstr.slice().sort();
  const eventi = eventiCopertura(nome, ord[0], ord[ord.length - 1]);
  if (!eventi.length) return 0;
  const elenco = eventi
    .map(
      (p) =>
        p.collaboratore +
        ' ' +
        (p.punti > 0 ? '+' : '') +
        p.punti +
        (p.azione === 'copertura' ? ' (copertura)' : ' (rifiuto)'),
    )
    .join(', ');
  if (
    !(await chiediConferma(
      'Per questa copertura erano stati dati dei punti incentivo: ' +
        elenco +
        '.\n\nTogliere anche questi punti?\nAnnulla = i punti restano (si possono togliere dopo da Formazione).',
    ))
  )
    return 0;
  let tolti = 0;
  for (const p of eventi) {
    try {
      await secDel('punti_eventi', 'id=eq.' + p.id);
      puntiEventiCache = puntiEventiCache.filter((x) => x.id !== p.id);
      tolti++;
    } catch (e) {
      toastErrore('Punti di ' + p.collaboratore + ' non tolti: ' + ((e && e.message) || e));
    }
  }
  if (tolti) {
    logAzione('Punti tolti', 'Annulla copertura malattia di ' + nome + ': ' + tolti + ' registrazioni');
    toast('Punti incentivo tolti: ' + tolti);
  }
  return tolti;
}
// opz (Annulla di una copertura): { ids: le registrazioni scritte dalla copertura, tolte: []
// riempito con quelle messe nel Cestino, per il Ripristina }
// opz.codice 'ASS': le registrazioni «Assenza» (attesa certificato) invece della Malattia
async function _pianoMalattiaViaDiario(nome, giorniDstr, opz) {
  opz = opz || {};
  if (typeof datiCache === 'undefined' || typeof secPatch !== 'function') return 0;
  const eAss = opz.codice === 'ASS';
  const tipoMal = eAss
    ? _pianoTipoAssenza()
    : typeof nomeCorrente === 'function'
      ? nomeCorrente('Malattia')
      : 'Malattia';
  const suoi = datiCache.filter(
    (e) => (e.nome || '').toLowerCase() === nome.toLowerCase() && e.tipo === tipoMal && !e.eliminato,
  );
  // giorni coperti dalla riga. Il Diario e il piano scrivono UNA RIGA PER GIORNO con il
  // periodo come etichetta finale "(dal 16/11/2026 al 18/11/2026)": vale solo il suo giorno.
  // Una vecchia riga unica scritta a mano ("dal 2.11.2026 al 21.11.2026", "3 giorni")
  // copre tutto il suo periodo.
  const giorniDellaRiga = (e) => {
    const g0 = String(e.data || '').substring(0, 10);
    if (/\(dal \d{1,2}[./]\d{1,2}[./]\d{4} al \d{1,2}[./]\d{1,2}[./]\d{4}\)\s*$/.test(String(e.testo || '')))
      return [g0];
    const periodo = _pianoDateMalattia(e.testo || '', e.data);
    return periodo.length ? periodo : [g0];
  };
  const daTogliere = [];
  const periodiInteri = [];
  // ANNULLA DI UNA COPERTURA (15/10/2026): si tolgono ESATTAMENTE le registrazioni che la
  // copertura ha scritto, tutte, anche se il periodo comprende un giorno di congedo (C) che
  // non era diventato M. Prima si guardavano i giorni M: la riga del Rapporto "dal 04 al 06"
  // copriva anche il C del 05, restava nel Diario e nel piano compariva MC.
  if (Array.isArray(opz.ids)) suoi.filter((e) => opz.ids.includes(e.id)).forEach((e) => daTogliere.push(e));
  else
    suoi.forEach((e) => {
      const gg = giorniDellaRiga(e);
      if (!giorniDstr.some((d) => gg.includes(d))) return;
      // una riga che copre anche giorni che restano in malattia non si cestina: toglierla
      // cancellerebbe tutto il periodo (prima succedeva, con il messaggio "il giorno 30")
      if (gg.some((d) => !giorniDstr.includes(d))) periodiInteri.push(e);
      else daTogliere.push(e);
    });
  if (periodiInteri.length) {
    const testo = periodiInteri
      .map((e) => {
        const gg = giorniDellaRiga(e);
        return gg[0].split('-').reverse().join('.') + ' - ' + gg[gg.length - 1].split('-').reverse().join('.');
      })
      .join(', ');
    await mostraAvviso(
      'Nel Diario ' +
        (eAss ? 'l assenza' : 'la malattia') +
        ' di ' +
        nome +
        ' e registrata come un periodo unico (' +
        testo +
        ').\n\nIl Diario resta com e: per accorciare il periodo modifica la registrazione nel Diario.',
    );
  }
  if (!daTogliere.length) return 0;
  // una riga con un periodo (Rapporto "dal 04 al 06") si dice con il periodo intero
  const ggM = (d) => d.substring(8, 10) + '/' + d.substring(5, 7);
  const gg = daTogliere
    .map((e) => {
      const p = giorniDellaRiga(e);
      return p.length > 1 ? 'dal ' + ggM(p[0]) + ' al ' + ggM(p[p.length - 1]) : ggM(String(e.data));
    })
    .sort()
    .join(', ');
  const nG = daTogliere.length;
  const conPeriodo = daTogliere.some((e) => giorniDellaRiga(e).length > 1);
  if (
    !(await chiediConferma(
      'Nel Diario ' +
        nome +
        (eAss ? ' risulta assente (attesa certificato) ' : ' risulta in malattia ') +
        (conPeriodo ? '' : nG === 1 ? 'il giorno ' : 'nei giorni ') +
        gg +
        '.\n\nTogliere ' +
        (conPeriodo
          ? nG === 1
            ? eAss
              ? 'questa assenza'
              : 'questa malattia'
            : 'queste ' + nG + ' registrazioni'
          : nG === 1
            ? 'questo giorno'
            : 'questi ' + nG + ' giorni') +
        " anche dal Diario? Le registrazioni finiscono nel Cestino (recuperabili) e la scheda del collaboratore si aggiorna.\n\nOK = togli anche dal Diario · Annulla = il Diario resta com'e'",
    ))
  )
    return 0;
  const op = getOperatore();
  const now = new Date().toISOString();
  let tolte = 0;
  const nonTolte = [];
  const rapportiTolti = [];
  for (const e of daTogliere) {
    try {
      await secPatch('registrazioni', 'id=eq.' + e.id, { eliminato: true, eliminato_da: op, eliminato_at: now });
      e.eliminato = true;
      _diarioTogliArchivioLeggero(e.id);
      tolte++;
      if (Array.isArray(opz.tolte)) opz.tolte.push(e.id);
      // nata dal Rapporto giornaliero: la persona sparisce anche da li, come quando la
      // registrazione si cestina dal Diario (prima il Rapporto diceva ancora "malato")
      if (typeof _rapportoTogliRegistrazione === 'function') {
        const rap = await _rapportoTogliRegistrazione(e);
        if (rap) rapportiTolti.push(rap.turno + ' del ' + rap.ds.split('-').reverse().join('.'));
      }
    } catch (err) {
      nonTolte.push(String(e.data).substring(8, 10) + '/' + String(e.data).substring(5, 7));
    }
  }
  if (nonTolte.length)
    toastErrore('Diario NON aggiornato per ' + nonTolte.join(', ') + ': togli la malattia dal Diario.', 10000);
  datiCache = datiCache.filter((e) => !e.eliminato);
  if (tolte) {
    logAzione(
      eAss ? 'Assenza tolta dal piano' : 'Malattia tolta dal piano',
      nome + ' · ' + tolte + ' giorni spostati nel cestino del Diario',
    );
    toast(
      'Diario aggiornato: ' +
        tolte +
        (tolte === 1 ? ' giorno' : ' giorni') +
        (eAss ? ' di assenza nel Cestino' : ' di malattia nel Cestino') +
        (rapportiTolti.length ? ' · tolto anche dal Rapporto ' + [...new Set(rapportiTolti)].join(', ') : ''),
    );
  }
  return tolte;
}
// RIPRISTINA DI UNA COPERTURA: le registrazioni della malattia che l Annulla aveva messo
// nel Cestino tornano (le stesse, con il loro numero) e la persona torna nel Rapporto,
// come il ripristino dal Cestino. Il piano non si tocca: le sue celle le rimette il
// Ripristina del piano. Prima il Ripristina rimetteva solo il piano: malato nel piano, non
// nel Diario ne nel Rapporto. Ritorna gli id rimessi.
async function _pianoMalattiaRimettiDiario(nome, ids) {
  const rimessi = [];
  const nonRimessi = [];
  for (const id of ids || []) {
    try {
      const r = ((await secGet('registrazioni?id=eq.' + id)) || [])[0];
      if (!r) {
        nonRimessi.push(id);
        continue;
      }
      // tolta dal Cestino da qualcun altro nel frattempo: resta com e
      if (!r.eliminato) continue;
      await secPatch('registrazioni', 'id=eq.' + id, { eliminato: false, eliminato_da: null, eliminato_at: null });
      Object.assign(r, { eliminato: false, eliminato_da: null, eliminato_at: null });
      if (typeof datiCache !== 'undefined' && !datiCache.some((e) => e.id === r.id)) datiCache.unshift(r);
      rimessi.push(id);
      if (typeof _rapportoRimettiRegistrazione === 'function') await _rapportoRimettiRegistrazione(r);
    } catch (e) {
      nonRimessi.push(id);
    }
  }
  if (rimessi.length)
    logAzione(
      'Malattia rimessa dal piano',
      nome + ' · ' + rimessi.length + ' registrazioni del Diario tolte dal Cestino',
    );
  if (nonRimessi.length)
    toastErrore(
      'Ripristinato il piano, ma la malattia di ' + nome + ' non e tornata nel Diario: rimettila dal Cestino.',
      10000,
    );
  return rimessi;
}
// una copertura alla volta: il doppio click su "Conferma copertura" la applicava due volte
function confermaCoperturaMalattia() {
  return unaVoltaSola('piano-copertura-malattia', () => _pianoConScrittura(() => _confermaCoperturaMalattiaEsegui()));
}
async function _confermaCoperturaMalattiaEsegui() {
  const avvisoRete = !!window._sessioneScadutaAvvisata;
  const m = _malattiaPiano;
  if (!m) return;
  // basta lo sblocco sul primo giorno: copre il flusso, e gli inserimenti sui
  // singoli giorni passano comunque dal controllo dentro _pianoInserisciCella
  const _g0 = m.giorni && m.giorni.length ? _pianoMeseSel + '-' + String(m.giorni[0].g).padStart(2, '0') : null;
  if (_g0 && !(await _pianoConsentiScrittura(_g0))) return;
  // soluzioni selezionate: senza spunta la M resta ma il sostituto non si tocca
  const selGiorni = new Set([...document.querySelectorAll('.mal-sel:checked')].map((c) => parseInt(c.dataset.g)));
  const ym = _pianoMeseSel;
  // DOMENICHE LIBERE VALIDE: il sostituto (o chi entra nella catena) puo perdere
  // una delle 12. Si chiede prima di scrivere qualsiasi cella.
  const dstrG = (g) => ym + '-' + String(g).padStart(2, '0');
  const mosseDom = [];
  (m.giorni || []).forEach((d) => {
    if (d.salta || !d.sostituto || !selGiorni.has(d.g)) return;
    mosseDom.push({ nome: d.sostituto, data: dstrG(d.g), codice: d.codice });
    if (d.catena && d.catena.tipo === 'scambio') {
      mosseDom.push({ nome: d.sostituto, data: dstrG(d.catena.g1), codice: d.catena.turnoCon });
      mosseDom.push({ nome: d.catena.con, data: dstrG(d.catena.g1), codice: d.catena.turnoX });
    } else if (d.catena) mosseDom.push({ nome: d.catena.con, data: dstrG(d.catena.g1), codice: d.catena.turnoX });
  });
  const domPerse = await _pianoAvvisiDomenichePerse(mosseDom);
  if (domPerse.length) {
    if (
      !(await chiediConferma(
        'DOMENICA LIBERA · copertura malattia di ' +
          m.nome +
          ':\n\n• ' +
          domPerse.join('\n• ') +
          '\n\nConfermi comunque la copertura?',
      ))
    )
      return;
    logAzione('Piano: domenica libera persa confermata', domPerse.join(' | '));
  }
  // codice dell assenza: ASS (attesa certificato, la scelta di base), M (malattia con
  // certificato) o ND (non disponibilita dal Diario)
  const selCod = document.getElementById('mal-codice');
  const ass = window._coperturaAssenza || { codice: selCod && selCod.value === 'M' ? 'M' : 'ASS', nota: '' };
  document.getElementById('pwd-modal').classList.add('hidden');
  const op = getOperatore();
  window._coperturaAssenza = null;
  const eAss = ass.codice === 'ASS';
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  const rigaDi = {};
  _pianoRighe.forEach((r) => (rigaDi[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
  const passo = _pianoUndoSnap(
    'copertura ' +
      (ass.codice === 'ND' ? 'non disponibilità ' : eAss ? 'malattia (assenza ASS) ' : 'malattia ') +
      _pianoMeseSel,
  );
  let nM = 0;
  let nSost = 0;
  const sostituti = new Set();
  // TUTTO O NIENTE, e solo se le celle sono ancora quelle mostrate: M al malato, catene e
  // sostituti si scrivono in UNA scrittura. Prima erano scritture in fila: un errore a
  // meta lasciava la M senza sostituto o una catena a meta.
  const ops = [];
  const adesso = new Date().toISOString();
  // cella da scrivere: modifica (riga) o nuova (senza riga), con il controllo di come si vedeva
  // com era la cella di chi copre (o della mossa a catena) prima della copertura: torna tale e
  // quale se la malattia si toglie («Rimetto il turno a ... e tolgo la copertura?»)
  const comEra = (riga) =>
    riga && riga.prima_malattia !== undefined ? { prima_malattia: _pianoPrimaMalattiaDi(riga) } : {};
  const metti = (nomeC, g, riga, dati) => {
    const d = Object.assign({ protetto: true, generato: false, operatore: op }, dati);
    if (riga) d.updated_at = adesso;
    else d.reparto_dip = _pianoReparto();
    ops.push({ collaboratore: nomeC, data: dstrDi(g), atteso: _pianoAttesoDi(riga || null), dati: d });
  };
  const nd = ass.codice === 'ND';
  for (const d of m.giorni) {
    if (d.salta) continue;
    const conSost = !!(d.sostituto && selGiorni.has(d.g));
    const coperto = conSost ? ' - coperto da ' + d.sostituto : '';
    // M al malato (protetta)
    const rMal = rigaDi[m.nome + '|' + d.g];
    if (d.giaM) {
      // gia in M (scritta a mano, dal Diario o dal Rapporto): resta com e, la nota dice chi copre
      // (un assenza non giustificata lo resta: la nota la tiene)
      if (rMal && conSost)
        metti(m.nome, d.g, rMal, {
          commento: _assNgCommento(('Ex ' + d.codice + coperto + ' - ' + op).substring(0, 370), _assNgCella(rMal)),
          operatore: op,
        });
    } else if (rMal) {
      const dM = {
        codice: ass.codice,
        // la malattia scioglie il blocco, come negli altri percorsi
        motivo_blocco: null,
        // "Ex C5 - coperto da Bianchi Anna - Admin" (senza sostituto "Ex C5 - Admin")
        commento: ('Ex ' + d.codice + coperto + ' - ' + (ass.nota ? ass.nota + ' - ' : '') + op).substring(0, 400),
      };
      // com era la cella sotto la malattia: torna tale e quale quando la malattia si toglie
      if ((ass.codice === 'M' || eAss) && rMal.codice !== 'M' && rMal.prima_malattia !== undefined)
        dM.prima_malattia = _pianoPrimaMalattiaDi(rMal);
      metti(m.nome, d.g, rMal, dM);
    } else metti(m.nome, d.g, null, { codice: ass.codice });
    if (!d.giaM) nM++;
    // turno al sostituto (protetto), SOLO se la soluzione ha la spunta
    if (conSost) {
      // MOSSA A CATENA sul giorno prima, se prevista dalla proposta
      if (d.catena) {
        const g1 = d.catena.g1;
        const perChi = ' (copertura di ' + m.nome + ')';
        const rX1 = rigaDi[d.sostituto + '|' + g1];
        if (d.catena.tipo === 'scambio') {
          const rZ = rigaDi[d.catena.con + '|' + g1];
          if (rX1 && rZ) {
            metti(d.sostituto, g1, rX1, {
              ...comEra(rX1),
              codice: d.catena.turnoCon,
              commento: ('Ex ' + d.catena.turnoX + ' - cambio per esigenze operative' + perChi + ' - ' + op).substring(
                0,
                400,
              ),
            });
            metti(d.catena.con, g1, rZ, {
              ...comEra(rZ),
              codice: d.catena.turnoX,
              commento: (
                'Ex ' +
                d.catena.turnoCon +
                ' - cambio per esigenze operative' +
                perChi +
                ' - ' +
                op
              ).substring(0, 400),
            });
          }
        } else {
          // riassegna: il sostituto viene liberato, il suo turno passa al terzo
          if (rX1)
            metti(d.sostituto, g1, rX1, {
              ...comEra(rX1),
              codice: 'C',
              commento: ('Ex ' + d.catena.turnoX + ' - cambio per esigenze operative' + perChi + ' - ' + op).substring(
                0,
                400,
              ),
            });
          const rY = rigaDi[d.catena.con + '|' + g1];
          const commY = (
            (d.catena.eraCon ? 'Ex ' + d.catena.eraCon + ' - ' : '') +
            'cambio per esigenze operative' +
            perChi +
            ' - ' +
            op
          ).substring(0, 400);
          metti(d.catena.con, g1, rY || null, Object.assign({ codice: d.catena.turnoX, commento: commY }, comEra(rY)));
          sostituti.add(d.catena.con); // si carica un turno in piu': incentivi con conferma
        }
      }
      const rS = rigaDi[d.sostituto + '|' + d.g];
      // nota chiara: chi copre chi ("Ex C - copre Rossi Mario (malattia) - Admin")
      // la nota dice cosa copre: assenza (ASS), malattia o non disponibilita
      const commento = _pianoNotaCopre(d.era, m.nome, (d.giaM ? d.giaAss : eAss) ? 'ASS' : nd, op);
      metti(d.sostituto, d.g, rS || null, Object.assign({ codice: d.codice, commento: commento }, comEra(rS)));
      sostituti.add(d.sostituto);
      nSost++;
    }
  }
  let esito;
  try {
    // giorni chiusi: ogni giorno toccato passa dallo sblocco motivato (prima lo faceva
    // l inserimento cella per cella)
    for (const dC of [...new Set(ops.map((o) => o.data))].sort())
      if (!(await _pianoConsentiScrittura(dC))) {
        _pianoUndoScarta(passo);
        return;
      }
    esito = await _pianoScriviCelle(ops);
  } catch (e) {
    _pianoUndoScarta(passo);
    console.error(e);
    _pianoErroreScrittura('Copertura NON registrata: ', e, avvisoRete);
    renderPiano();
    return;
  }
  if (!esito.ok) {
    _pianoUndoScarta(passo);
    _malattiaPiano = null;
    await _pianoAvvisaConflitti(esito.conflitti, 'Copertura non registrata');
    return;
  }
  try {
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
        (await chiediConferma(
          'Incentivi: assegnare +' +
            az.punti +
            ' punti (copertura) a ' +
            [...sostituti].join(', ') +
            '?\n\nAnnulla = nessun punto ora (si può fare dopo dal popup o da Formazione).',
        ))
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
      eAss ? 'Copertura assenza' : 'Copertura malattia',
      m.nome + ' ' + m.da + '-' + m.al + ' ' + ym + ': ' + nM + (eAss ? ' ASS, ' : ' M, ') + nSost + ' sostituzioni',
    );
    // piano, Rapporto e Diario sempre allineati: la malattia si registra nel Rapporto
    // del primo giorno e da li nel Diario
    // i giorni gia in M (scritta prima a mano, dal Diario o dal Rapporto) hanno gia avuto
    // questi collegamenti: qui solo le M nuove
    const primo = m.giorni.find((d) => !d.salta && !d.giaM);
    // STESSI COLLEGAMENTI della M scritta a mano: CGF caduto in malattia (si
    // propone il giorno sostitutivo) e festivi con recupero non piu lavorati
    const giorniM = m.giorni.filter((d) => !d.salta && !d.giaM);
    for (const d of giorniM)
      if (d.codice === 'CGF' && typeof _pianoRimettiCgf === 'function') await _pianoRimettiCgf(m.nome, dstrDi(d.g));
    await _pianoFestiviPersiDopo(
      m.nome,
      giorniM.map((d) => ({ data: dstrDi(d.g), codice: d.codice })),
    );
    // la malattia nel Rapporto e nel Diario e parte del passo della copertura (malattiaDiario
    // qui sotto: Annulla della copertura propone di toglierla). Fuori dall Annulla generale:
    // prima diventava un azione a parte, piu recente, e il primo Ctrl+Z toglieva la malattia
    // dal Diario mentre la copertura restava nel piano (due Annulla sulle stesse celle)
    const nelDiario = () =>
      _pianoMalattiaNelDiario(
        m.nome,
        dstrDi(giorniM[0].g),
        dstrDi(giorniM[giorniM.length - 1].g),
        false,
        primo ? primo.codice : '',
        eAss ? 'ASS' : '',
      );
    // quali registrazioni scrive la copertura (Annulla toglie quelle, Ripristina le rimette)
    const tipoMalC = eAss
      ? _pianoTipoAssenza()
      : typeof nomeCorrente === 'function'
        ? nomeCorrente('Malattia')
        : 'Malattia';
    const regSue = () =>
      (typeof datiCache !== 'undefined' ? datiCache : []).filter(
        (e) => (e.nome || '').toLowerCase() === m.nome.toLowerCase() && e.tipo === tipoMalC && !e.eliminato,
      );
    const regPrima = new Set(regSue().map((e) => e.id));
    const nDiario = giorniM.length ? await (window.Annulla ? window.Annulla.senzaTraccia(nelDiario) : nelDiario()) : 0;
    const regNuove = regSue()
      .filter((e) => !regPrima.has(e.id))
      .map((e) => e.id);
    // Annulla di questa copertura: rimette le celle E propone di togliere la malattia dal
    // Diario (prima restava nel Diario: "malato" nel Diario, non nel piano)
    if ((ass.codice === 'M' || eAss) && window._pianoUndo && window._pianoUndo.length) {
      const ultimo = window._pianoUndo[window._pianoUndo.length - 1];
      // solo le M scritte da questa copertura: la M scritta prima (a mano, Diario) resta
      if (ultimo && /^copertura malattia/.test(ultimo.label || '') && giorniM.length)
        ultimo.malattiaDiario = {
          nome: m.nome,
          giorni: giorniM.map((d) => dstrDi(d.g)),
          ids: regNuove,
          codice: eAss ? 'ASS' : '',
        };
      // i punti della copertura si propongono di togliere anche se la M c era gia
      else if (ultimo && /^copertura malattia/.test(ultimo.label || '') && nSost)
        ultimo.puntiCopertura = {
          nome: m.nome,
          giorni: m.giorni.filter((d) => !d.salta).map((d) => dstrDi(d.g)),
        };
    }
    toast(
      'Copertura registrata: ' +
        (nM ? nM + (eAss ? ' giorni ASS, ' : ' giorni M, ') : '') +
        nSost +
        (nSost === 1 ? ' sostituzione' : ' sostituzioni') +
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
    // coperto: l avviso dei turni da coprire si aggiorna (o sparisce)
    if (window._copAvvisi && window._copAvvisi[m.nome]) _pianoAvvisoCoperturaAggiorna(m.nome);
    renderPiano();
  } catch (e) {
    // le celle sono scritte: qui si ferma solo il seguito (punti, Diario, CGF)
    console.error(e);
    toastErrore('Copertura scritta nel piano, ma il seguito non e riuscito: ' + ((e && e.message) || e));
    renderPiano();
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
      // la riga dei giorni si ferma SOTTO il menu delle pagine (fermo in alto), non
      // al bordo dello schermo: prima finiva sotto il menu e copriva i giorni
      const nav = document.querySelector('.nav-tabs');
      const off = nav && getComputedStyle(nav).position === 'sticky' ? nav.getBoundingClientRect().bottom : 0;
      let y = 0;
      if (r.top < off) y = Math.min(off - r.top, r.height - hHead * 2);
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
          // click semplice: solo questa cella (anche il blocco di turni si toglie), cosi
          // resta in evidenza un collaboratore solo
          if (typeof _pianoBloccoPulisci === 'function') _pianoBloccoPulisci();
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

// ---- Scheda CAMBI TURNO: tutti i fogli di cambio turno archiviati del settore ----
// (prima comparivano nella sezione Moduli insieme ai moduli disciplinari)
function _renderPianoCambiTab() {
  const rep = _pianoReparto();
  const fogli = getFogliCambioReparto(rep)
    .slice()
    .sort(
      (a, b) =>
        String(b.data_modulo || '').localeCompare(String(a.data_modulo || '')) ||
        String(b.created_at || '').localeCompare(String(a.created_at || '')),
    );
  const mesi = [...new Set(fogli.map((m) => String(m.data_modulo || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const mese = window._pianoCambiMese && mesi.includes(window._pianoCambiMese) ? window._pianoCambiMese : '';
  const lista = mese ? fogli.filter((m) => String(m.data_modulo || '').startsWith(mese)) : fogli;
  const nomeMese = (ym) => {
    const [a, mm] = ym.split('-');
    return (typeof MESI_FULL !== 'undefined' ? MESI_FULL[parseInt(mm) - 1] : mm) + ' ' + a;
  };
  const dataIt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Fogli di cambio turno · ' +
    escP(repartoLabel(rep)) +
    ' (' +
    lista.length +
    ')<select onchange="window._pianoCambiMese=this.value;renderPiano()" style="padding:4px 8px;font-size:var(--fs-sm,.8125rem);border:1px solid var(--line-forte);border-radius:var(--r-1);background:var(--paper);color:var(--ink);letter-spacing:0;text-transform:none"><option value="" style="color:#000">Tutti i mesi</option>' +
    mesi
      .map(
        (m) =>
          '<option value="' +
          m +
          '"' +
          (m === mese ? ' selected' : '') +
          ' style="color:#000">' +
          nomeMese(m) +
          '</option>',
      )
      .join('') +
    '</select><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="pdfCambioTurnoVuoto()">Formulario vuoto</button>' +
    '<input type="text" class="piano-cerca campo-cerca" placeholder="Cerca nei cambi turno..." title="Cerca per collaboratore, motivo o chi l ha fatto" aria-label="Cerca nei cambi turno" oninput="pianoTabellaFiltra(this.value,\'piano-cambi-table\')"></div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);padding:10px 14px 0">Ogni cambio fatto dal Piano (scambio, cerca cambio, esigenze operative) crea un foglio che resta archiviato qui. Apri PDF lo mostra per la stampa o la firma.</p>';
  if (!lista.length) {
    h +=
      '<p style="padding:18px 14px;color:var(--muted)">' +
      (fogli.length
        ? 'Nessun cambio turno in questo mese.'
        : 'Nessun foglio di cambio turno archiviato per questo settore.') +
      '</p></div>';
    return h;
  }
  h +=
    '<div style="overflow-x:auto;padding:8px 6px 10px"><table class="piano-table" id="piano-cambi-table" style="width:100%;min-width:860px;font-size:var(--fs-md,.875rem)"><thead><tr>' +
    '<th style="text-align:left">Data del cambio</th><th style="text-align:left">Tipo</th><th style="text-align:left">Collaboratori e turni</th><th style="text-align:left">Motivo</th><th style="text-align:left">Fatto da</th><th style="text-align:left">Creato il</th><th></th></tr></thead><tbody>';
  lista.forEach((m) => {
    const d = m.dati || {};
    const a = d.a || {};
    const b = d.b || {};
    const tipo = d.tipo === 'ESIGENZE' ? 'Esigenze operative' : 'Scambio';
    const coppia =
      escP(a.nome || m.collaboratore || '') +
      (a.turno ? ' <span style="color:var(--muted)">(' + escP(a.turno) + ')</span>' : '') +
      (b.nome
        ? ' &harr; ' +
          escP(b.nome) +
          (b.turno ? ' <span style="color:var(--muted)">(' + escP(b.turno) + ')</span>' : '')
        : '');
    const chiave = [a.nome, b.nome, m.collaboratore, d.motivo, m.operatore, d.richiesto, tipo]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    h +=
      '<tr data-id="' +
      Number(m.id) +
      '" data-nome="' +
      escP(chiave) +
      '"' +
      (typeof _attrCella === 'function' ? _attrCella(a.nome || m.collaboratore, m.data_modulo) : '') +
      '><td style="text-align:left;white-space:nowrap">' +
      dataIt(m.data_modulo) +
      '</td><td style="text-align:left">' +
      tipo +
      '</td><td style="text-align:left">' +
      coppia +
      (d.restituzione
        ? '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">Restituzione: ' +
          escP(d.restituzione) +
          '</div>'
        : '') +
      '</td><td style="text-align:left">' +
      escP(d.motivo || '') +
      '</td><td style="text-align:left;white-space:nowrap">' +
      escP(m.operatore || d.richiesto || '-') +
      '</td><td style="text-align:left;white-space:nowrap">' +
      dataIt(m.created_at) +
      '</td><td><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="ristampaModuloPDF(' +
      Number(m.id) +
      ')">Apri PDF</button></td></tr>';
  });
  h += '</tbody></table></div></div>';
  return h;
}

// Apre Piano > Cambi turno filtrato su un nome; con l id porta in vista quel foglio
// e lo evidenzia (usato dalla scheda del collaboratore e dalla ricerca globale)
function apriCambiTurnoDi(nome, id) {
  const pm = document.getElementById('profilo-modal');
  if (pm) pm.classList.add('hidden');
  window._pianoCambiMese = '';
  switchPage('piano');
  setTimeout(() => {
    pianoCambiaTab('cambi');
    setTimeout(() => {
      const i = document.querySelector('#piano-cambi-table') && document.querySelector('.card-header .campo-cerca');
      if (i) {
        i.value = nome;
        pianoTabellaFiltra(nome, 'piano-cambi-table');
      }
      if (id && typeof _rgEvidenzia === 'function')
        _rgEvidenzia(() => document.querySelector('#piano-cambi-table tr[data-id="' + Number(id) + '"]'));
    }, 700);
  }, 300);
}
