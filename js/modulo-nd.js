/**
 * Diario Collaboratori · Casino Lugano SA
 * File: modulo-nd.js
 *
 * LISTA DI NON DISPONIBILITA (JOLLY), modulo 1187 di Human Resources: lo stesso
 * modulo caricato in Piano > Formulari, rifatto identico con il logo, il nome,
 * il mese, i giorni spuntati e le osservazioni gia scritti.
 *
 * Si crea DA SOLO: quando a una persona si mette un ND, nel calendario del piano
 * (da qualsiasi strada: modifica, incolla, menu, import) o nel Diario (nuova
 * registrazione Non disponibilita), il programma confronta i giorni ND del mese
 * con il modulo salvato e lo crea o lo aggiorna. Un modulo per persona e per mese,
 * salvato come i fogli dei cambi turno: resta lo storico nella scheda del
 * collaboratore, da dove si stampa per la firma.
 */
const ND_TIPO_MODULO = 'non_disponibilita';

// testo della registrazione del Diario senza la parte con i giorni
function _ndNotaDiario(testo) {
  return String(testo || '')
    .replace(/\s*\(\d+ giorn[oi]:[^)]*\)/, '')
    .replace(/\s*\[consegna fuori termine\]/, '')
    .trim();
}
// giorni ND di una persona nel mese: celle ND del piano (anche di altri settori) e
// registrazioni Non disponibilita del Diario. [{ g, nota }]
async function _ndGiorniPersona(nome, ym) {
  const nG = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nG).padStart(2, '0');
  const out = {};
  const celle =
    (await secGet(
      'piano?collaboratore=eq.' +
        encodeURIComponent(nome) +
        '&codice=eq.ND&data=gte.' +
        da +
        '&data=lte.' +
        a +
        '&limit=100',
    )) || [];
  celle.forEach((r) => {
    const g = parseInt(String(r.data).substring(8, 10));
    out[g] = { g: g, nota: String(r.commento || '').trim() };
  });
  const tipoNd = typeof nomeCorrente === 'function' ? nomeCorrente('Non Disponibilità') : 'Non Disponibilità';
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.nome !== nome || e.tipo !== tipoNd || e.eliminato) return;
    (String(e.testo || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g) || []).forEach((dd) => {
      const p = dd.split('/');
      const dstr = p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
      if (!dstr.startsWith(ym)) return;
      const g = parseInt(p[0]);
      const nota = _ndNotaDiario(e.testo);
      if (!out[g]) out[g] = { g: g, nota: nota };
      else if (!out[g].nota && nota) out[g].nota = nota;
    });
  });
  return Object.values(out).sort((x, y) => x.g - y.g);
}

// crea o aggiorna il modulo del mese di una persona (nessun ND = modulo tolto)
async function ndSincronizzaPersona(nome, ym, opz) {
  const senzaLog = !!(opz && opz.senzaLog);
  if (!nome || !/^\d{4}-\d{2}$/.test(ym)) return;
  try {
    const giorni = await _ndGiorniPersona(nome, ym);
    const esistenti =
      (await secGet(
        'moduli?tipo=eq.' +
          ND_TIPO_MODULO +
          '&collaboratore=eq.' +
          encodeURIComponent(nome) +
          '&data_modulo=eq.' +
          ym +
          '-01&limit=10',
      )) || [];
    const attivo = esistenti.find((m) => !m.eliminato);
    const uguale = (m) => JSON.stringify((m.dati || {}).giorni || []) === JSON.stringify(giorni);
    if (attivo && uguale(attivo)) return;
    const info = typeof _pianoCollabInfo === 'function' ? _pianoCollabInfo(nome) || {} : {};
    const dati = {
      nome: nome,
      ym: ym,
      giorni: giorni,
      compilato: oggiLocale(),
      reparto: info.reparto_dip || (typeof _pianoReparto === 'function' ? _pianoReparto() : currentReparto),
    };
    const cache = typeof moduliCache !== 'undefined' ? moduliCache : [];
    if (attivo) {
      const patch = giorni.length ? { dati: dati } : { eliminato: true };
      await secPatch('moduli', 'id=eq.' + attivo.id, patch);
      const c = cache.find((m) => m.id === attivo.id);
      if (c) Object.assign(c, patch);
      if (!senzaLog)
        logAzione(
          'Modulo non disponibilita',
          nome + ' ' + ym + (giorni.length ? ' aggiornato: ' + giorni.length + ' giorni' : ' tolto (nessun ND)'),
        );
    } else if (giorni.length) {
      const salvato = await secPost('moduli', {
        tipo: ND_TIPO_MODULO,
        collaboratore: nome,
        data_modulo: ym + '-01',
        dati: dati,
        operatore: getOperatore(),
        reparto_dip: dati.reparto || 'slots',
      });
      if (salvato && salvato[0]) cache.unshift(salvato[0]);
      if (!senzaLog) logAzione('Modulo non disponibilita', nome + ' ' + ym + ' creato: ' + giorni.length + ' giorni');
    }
  } catch (e) {
    console.warn('modulo non disponibilita', nome, ym, e);
  }
}

// dopo ogni disegno del piano: chi ha ND nel mese (o aveva il modulo) viene
// riallineato. Si lavora solo se qualcosa e cambiato dall ultima volta.
let _ndUltimo = null; // { ym, chiavi: Set('nome|data|nota') }
let _ndTimer = null;
function ndProgramma() {
  clearTimeout(_ndTimer);
  _ndTimer = setTimeout(_ndRiallineaMese, 1500);
}
async function _ndRiallineaMese() {
  if (typeof _pianoRighe === 'undefined' || typeof _pianoMeseSel === 'undefined' || !getOperatore()) return;
  const ym = _pianoMeseSel;
  const chiavi = new Set(
    _pianoRighe
      .filter((r) => r.codice === 'ND' && String(r.data).startsWith(ym))
      .map((r) => r.collaboratore + '|' + r.data + '|' + (r.commento || ''))
      .concat(Object.keys(typeof _pianoNdMese === 'function' ? _pianoNdMese(ym) : {}).map((k) => k + '|diario')),
  );
  const prima = _ndUltimo && _ndUltimo.ym === ym ? _ndUltimo.chiavi : null;
  _ndUltimo = { ym: ym, chiavi: chiavi };
  const nomi = new Set();
  if (!prima) {
    // prima volta su questo mese: tutti quelli con ND e chi ha gia un modulo
    chiavi.forEach((k) => nomi.add(k.split('|')[0]));
    (typeof moduliCache !== 'undefined' ? moduliCache : []).forEach((m) => {
      if (m.tipo === ND_TIPO_MODULO && !m.eliminato && m.data_modulo === ym + '-01') nomi.add(m.collaboratore);
    });
  } else {
    // solo chi e cambiato: ND aggiunti, tolti o con la nota diversa
    chiavi.forEach((k) => {
      if (!prima.has(k)) nomi.add(k.split('|')[0]);
    });
    prima.forEach((k) => {
      if (!chiavi.has(k)) nomi.add(k.split('|')[0]);
    });
  }
  for (const n of nomi) if (n) await ndSincronizzaPersona(n, ym);
}

// ---------------------------------------------------------------- PDF
// logo ritagliato (l immagine ha molto bianco attorno)
let _ndLogo = null;
async function _ndLogoRitagliato() {
  if (_ndLogo) return _ndLogo;
  try {
    if (typeof _logoB64 === 'undefined' || !_logoB64) await _loadLogo();
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = _logoB64;
    });
    // parte disegnata del logo (CASINO, il simbolo, LUGANO)
    const x = 0.04 * img.width;
    const y = 0.06 * img.height;
    const w = 0.92 * img.width;
    const h = 0.78 * img.height;
    const c = document.createElement('canvas');
    c.width = Math.round(w);
    c.height = Math.round(h);
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    _ndLogo = { url: c.toDataURL('image/png'), ratio: h / w };
  } catch (e) {
    _ndLogo = null;
  }
  return _ndLogo;
}
// modulo 1187 · stessa impaginazione dell originale (A4, misure in mm)
async function _pdfListaNd(dati) {
  if (!window.jspdf) await caricaJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const d = dati || {};
  const giorni = {};
  (d.giorni || []).forEach((x) => (giorni[x.g] = x));
  const nG = d.ym ? _pianoUltimoGiorno(d.ym) : 31;
  const meseTxt = d.ym
    ? ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(d.ym.substring(5, 7)) - 1]) || d.ym) +
      ' ' +
      d.ym.substring(0, 4)
    : '';
  const punti = (x1, x2, y) => {
    doc.setLineDashPattern([0.25, 0.6], 0);
    doc.setLineWidth(0.2);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  };
  doc.setTextColor(0);
  // intestazione: logo, reparto e numero del modulo, dati del documento
  const logo = await _ndLogoRitagliato();
  if (logo) doc.addImage(logo.url, 'PNG', 18, 5, 30, 30 * logo.ratio);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('4 - Human Resources', 13, 25.5);
  doc.setFontSize(8.5);
  doc.text('1187 - LISTA NON DISPONIBILITA JOLLY', 20.5, 31);
  doc.setFontSize(7);
  doc.text('Data :18/12/2012', 110, 20);
  doc.setFontSize(5);
  doc.text('Red.', 110, 23.2);
  doc.text('Appr.', 110, 29.3);
  doc.setFontSize(7);
  doc.text('O. Sampietro', 114, 24.5);
  doc.text('Direttore', 116, 29.6);
  // titolo
  doc.setFontSize(16);
  doc.text('LISTA DI NON DISPONIBILITÀ (JOLLY)', 108, 45, { align: 'center' });
  doc.setFontSize(8);
  const sotto1 = '- da trasmettere ';
  const sotto2 = 'al massimo entro il 3° giorno';
  const sotto3 = ' del mese al Responsabile di settore -';
  const w1 = doc.getTextWidth(sotto1);
  const w2 = doc.getTextWidth(sotto2);
  const w3 = doc.getTextWidth(sotto3);
  let x0 = 108 - (w1 + w2 + w3) / 2;
  doc.text(sotto1, x0, 50.5);
  doc.text(sotto2, x0 + w1, 50.5);
  doc.setLineWidth(0.15);
  doc.line(x0 + w1, 51.2, x0 + w1 + w2, 51.2);
  doc.text(sotto3, x0 + w1 + w2, 50.5);
  // nome e mese (gia scritti)
  doc.setFontSize(8.5);
  doc.text('Nome e Cognome:', 12.5, 59.5);
  punti(37, 173, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(d.nome || ''), 40, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Mese di riferimento:', 12.5, 67.5);
  punti(41, 173, 68);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(meseTxt, 44, 67);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12.5);
  doc.text('vi informo che NON sarò disponibile per la pianificazione durante i giorni', 12.5, 77.5);
  doc.text('seguenti.', 12.5, 83);
  // intestazione della tabella
  doc.setFontSize(8.5);
  doc.text('Non sarò', 25, 92.5);
  doc.text('Giorno disponibile', 12.5, 98);
  const casella = (x, y, piena) => {
    doc.setLineWidth(0.2);
    doc.rect(x, y - 2.5, 2.7, 2.7);
    if (piena) {
      doc.setLineWidth(0.45);
      doc.line(x + 0.5, y - 1.2, x + 1.15, y - 0.25);
      doc.line(x + 1.15, y - 0.25, x + 2.3, y - 2.2);
    }
  };
  const wGd = doc.getTextWidth('Giorno disponibile');
  casella(12.5 + wGd + 1.2, 98, true);
  doc.text('Eventuali osservazioni', 12.5 + wGd + 5, 98);
  doc.setLineWidth(0.15);
  doc.line(12.5, 98.7, 12.5 + wGd + 5 + doc.getTextWidth('Eventuali osservazioni'), 98.7);
  // giorni del mese
  const passo = 4.98;
  for (let g = 1; g <= 31; g++) {
    const y = 107 + (g - 1) * passo;
    const fuori = g > nG;
    doc.setTextColor(fuori ? 170 : 0);
    doc.setFontSize(8);
    doc.text(String(g), 12.5, y);
    const x = giorni[g];
    casella(34.2, y, !!x);
    punti(37.5, 178, y + 0.2);
    if (x && x.nota) {
      doc.setFontSize(8);
      doc.text(doc.splitTextToSize(x.nota, 138)[0], 39, y - 0.4);
    }
  }
  doc.setTextColor(0);
  doc.setFontSize(8.5);
  doc.text('Firma collaboratore (Jolly):', 12.5, 265);
  punti(51, 178, 265.4);
  doc.text('Data:', 12.5, 274);
  punti(21, 59, 274.4);
  const comp = String(d.compilato || '');
  if (comp) doc.text(comp.split('-').reverse().join('.'), 24, 273.5);
  doc.text('Visto Resp. Settore:', 88, 274);
  punti(116, 172, 274.4);
  return doc;
}
async function ndApriModulo(id) {
  const m = (typeof moduliCache !== 'undefined' ? moduliCache : []).find((x) => x.id === id);
  if (!m) return;
  try {
    const doc = await _pdfListaNd(m.dati);
    const nome =
      'non_disponibilita_' +
      String(m.collaboratore || '').replace(/\s+/g, '_') +
      '_' +
      String(m.data_modulo || '').substring(0, 7) +
      '.pdf';
    mostraPdfPreview(
      doc,
      nome,
      'Non disponibilita ' + (m.collaboratore || '') + ' ' + String(m.data_modulo || '').substring(0, 7),
    );
    logAzione(
      'Aperto modulo non disponibilita',
      (m.collaboratore || '') + ' ' + String(m.data_modulo || '').substring(0, 7),
    );
  } catch (e) {
    console.error(e);
    toastErrore('Modulo non leggibile');
  }
}
// scheda del collaboratore: i suoi moduli di non disponibilita (ultimi 3 mesi)
function _schedaNdRiga(nome) {
  const lista = (typeof moduliCache !== 'undefined' ? moduliCache : [])
    .filter((m) => m.tipo === ND_TIPO_MODULO && !m.eliminato && m.collaboratore === nome)
    .sort((a, b) => String(b.data_modulo || '').localeCompare(String(a.data_modulo || '')));
  if (!lista.length) return '';
  const righe = lista
    .slice(0, 3)
    .map((m) => {
      const d = m.dati || {};
      const ym = String(m.data_modulo || '').substring(0, 7);
      const mese =
        ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(ym.substring(5, 7)) - 1]) || ym) +
        ' ' +
        ym.substring(0, 4);
      const n = (d.giorni || []).length;
      return (
        '<div class="scheda-cambio"><span>' +
        escP(mese) +
        ' · ' +
        n +
        (n === 1 ? ' giorno' : ' giorni') +
        ': ' +
        escP((d.giorni || []).map((x) => x.g).join(', ')) +
        '</span><button class="btn-secondario" onclick="ndApriModulo(' +
        Number(m.id) +
        ')">Anteprima</button></div>'
      );
    })
    .join('');
  return (
    '<div class="scheda-cambi"><div class="scheda-cambi-tit">Non disponibilita: <b>' +
    lista.length +
    '</b>' +
    (lista.length === 1 ? ' mese' : ' mesi') +
    (lista.length > 3 ? ' (ultimi 3)' : '') +
    '</div>' +
    righe +
    '</div>'
  );
}
