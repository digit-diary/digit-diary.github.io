/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
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
          'Modulo non disponibilità',
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
      if (!senzaLog) logAzione('Modulo non disponibilità', nome + ' ' + ym + ' creato: ' + giorni.length + ' giorni');
    }
  } catch (e) {
    console.warn('modulo non disponibilità', nome, ym, e);
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
  // il modulo segue il piano da solo: non e un azione di chi lavora, quindi resta fuori
  // dall Annulla generale. Prima, 1,5 s dopo una ND scritta o annullata, il modulo creato
  // o aggiornato diventava "l ultima azione" e il Ctrl+Z dopo toccava lui, non il piano.
  const fuori = (fn) => (window.Annulla ? window.Annulla.senzaTraccia(fn) : fn());
  for (const n of nomi) if (n) await fuori(() => ndSincronizzaPersona(n, ym));
}

// ---------------------------------------------------------------- PDF
// logo ritagliato (l immagine predefinita ha molto bianco attorno); un logo
// caricato in Identita del programma si usa intero
let _ndLogo = null;
async function _ndLogoRitagliato() {
  if (_ndLogo) return _ndLogo;
  try {
    if (!_logoB64) await _loadLogo();
    if (!_logoB64) return null;
    if (identita().logo) {
      _ndLogo = { url: _logoB64, ratio: 1 / _logoRatio, intero: true };
      return _ndLogo;
    }
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = _logoB64;
    });
    // parte disegnata del logo predefinito (CASINO, il simbolo, LUGANO)
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
// logo del modulo 1187 in alto a sinistra: riquadro 30 x 14,3 mm (il predefinito ritagliato lo riempie)
function _ndDisegnaLogo(doc, logo) {
  if (!logo) return;
  if (logo.intero) identitaLogoPdf(doc, 18, 5, 30, 14.3, false);
  else doc.addImage(logo.url, 'PNG', 18, 5, 30, 30 * logo.ratio, 'logo-nd', 'FAST');
}
// modulo 1187 · stessa impaginazione dell originale (A4, misure in mm). I testi fissi
// vengono dal modello del documento "nd1187" (js/modelli-documenti.js); testiSovra = testi
// da usare al posto di quelli salvati (anteprima). Con i testi originali il PDF e identico.
async function _pdfListaNd(dati, testiSovra) {
  if (!window.jspdf) await caricaJsPDF();
  if (typeof modelliCarica === 'function' && testiSovra === undefined) await modelliCarica();
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
  const t = _ndTesti(testiSovra, {
    nome: String(d.nome || ''),
    mese: meseTxt,
    data: String(d.compilato || '')
      .split('-')
      .reverse()
      .join('.'),
    settore: d.reparto && typeof repartoNomeDocumento === 'function' ? repartoNomeDocumento(d.reparto) : '',
  });
  const punti = (x1, x2, y) => {
    doc.setLineDashPattern([0.25, 0.6], 0);
    doc.setLineWidth(0.2);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  };
  doc.setTextColor(0);
  // intestazione: logo, reparto e numero del modulo, dati del documento
  const logo = await _ndLogoRitagliato();
  _ndDisegnaLogo(doc, logo);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(t('emittente'), 13, 25.5);
  doc.setFontSize(8.5);
  doc.text(t('codice'), 20.5, 31);
  doc.setFontSize(7);
  doc.text('Data :' + t('data_modulo'), 110, 20);
  doc.setFontSize(5);
  doc.text('Red.', 110, 23.2);
  doc.text('Appr.', 110, 29.3);
  doc.setFontSize(7);
  doc.text(t('redatto'), 114, 24.5);
  doc.text(t('approvato'), 116, 29.6);
  // titolo
  doc.setFontSize(16);
  doc.text(t('titolo'), 108, 45, { align: 'center' });
  doc.setFontSize(8);
  // sottotitolo in tre parti, la seconda sottolineata
  const sotto1 = t('sotto_inizio') ? t('sotto_inizio') + ' ' : '';
  const sotto2 = t('sotto_evidenza');
  const sotto3 = t('sotto_fine') ? ' ' + t('sotto_fine') : '';
  const w1 = doc.getTextWidth(sotto1);
  const w2 = doc.getTextWidth(sotto2);
  const w3 = doc.getTextWidth(sotto3);
  let x0 = 108 - (w1 + w2 + w3) / 2;
  doc.text(sotto1, x0, 50.5);
  doc.text(sotto2, x0 + w1, 50.5);
  doc.setLineWidth(0.15);
  doc.line(x0 + w1, 51.2, x0 + w1 + w2, 51.2);
  doc.text(sotto3, x0 + w1 + w2, 50.5);
  // dopo un etichetta del modello: la riga di puntini parte dove sempre, spostata a destra
  // di quanto l etichetta e piu lunga dell originale (con l originale: identica)
  const dopo = (k, minimo) => minimo + _modelloAllungo(doc, t(k), modelloOriginale('nd1187', k));
  // nome e mese (gia scritti)
  doc.setFontSize(8.5);
  doc.text(t('etich_nome'), 12.5, 59.5);
  const xNome = dopo('etich_nome', 37);
  punti(xNome, 173, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(d.nome || ''), xNome + 3, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(t('etich_mese'), 12.5, 67.5);
  const xMese = dopo('etich_mese', 41);
  punti(xMese, 173, 68);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(meseTxt, xMese + 3, 67);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12.5);
  // frase prima dei giorni: le sue righe (al massimo 3), a capo se troppo lunghe
  const frase = [];
  t('frase')
    .split('\n')
    .forEach((r) => doc.splitTextToSize(r, 190).forEach((x) => frase.push(x)));
  frase.slice(0, 3).forEach((r, i) => doc.text(r, 12.5, 77.5 + i * 5.5));
  // intestazione della tabella: "Non sarò" sopra, "Giorno disponibile" sotto (l ultima
  // parola della colonna della casella va sulla riga del giorno, come nell originale)
  doc.setFontSize(8.5);
  const parole = t('col_nonsaro').split(' ');
  const ultima = parole.pop();
  if (parole.length) doc.text(parole.join(' '), 25, 92.5);
  const rigaGiorno = t('col_giorno') + (ultima ? ' ' + ultima : '');
  doc.text(rigaGiorno, 12.5, 98);
  const casella = (x, y, piena) => {
    doc.setLineWidth(0.2);
    doc.rect(x, y - 2.5, 2.7, 2.7);
    if (piena) {
      doc.setLineWidth(0.45);
      doc.line(x + 0.5, y - 1.2, x + 1.15, y - 0.25);
      doc.line(x + 1.15, y - 0.25, x + 2.3, y - 2.2);
    }
  };
  const wGd = doc.getTextWidth(rigaGiorno);
  casella(12.5 + wGd + 1.2, 98, true);
  doc.text(t('col_oss'), 12.5 + wGd + 5, 98);
  doc.setLineWidth(0.15);
  doc.line(12.5, 98.7, 12.5 + wGd + 5 + doc.getTextWidth(t('col_oss')), 98.7);
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
  doc.text(t('firma_collab'), 12.5, 265);
  punti(dopo('firma_collab', 51), 178, 265.4);
  doc.text(t('etich_data'), 12.5, 274);
  const xData = dopo('etich_data', 21);
  punti(xData, 59, 274.4);
  const comp = String(d.compilato || '');
  if (comp) doc.text(comp.split('-').reverse().join('.'), xData + 3, 273.5);
  doc.text(t('visto'), 88, 274);
  punti(dopo('visto', 116), 172, 274.4);
  return doc;
}
// testi del modello 1187 pronti per il PDF ({giorno} = giorno di consegna del Piano)
function _ndTesti(testiSovra, valori) {
  const giorno = typeof _pianoGiornoNd === 'function' ? _pianoGiornoNd() : 3;
  return modelloTestoDi(modelloTesti('nd1187', testiSovra), modelloValori(Object.assign({ giorno: giorno }, valori)));
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
      'Non disponibilità ' + (m.collaboratore || '') + ' ' + String(m.data_modulo || '').substring(0, 7),
    );
    logAzione(
      'Aperto modulo non disponibilità',
      (m.collaboratore || '') + ' ' + String(m.data_modulo || '').substring(0, 7),
    );
  } catch (e) {
    console.error(e);
    toastErrore('Modulo non leggibile');
  }
}

// NOTIFICA D ASSENZA, modulo 827 di Human Resources (richiesta del titolare 08/10/2026):
// stessa intestazione dell originale, ma con piu righe (i collaboratori la usano per
// mettere giu le settimane di vacanza), il motivo per riga con caselle vere (nell
// originale erano simboli "£" dovuti al carattere) e l autorizzazione riga per riga.
async function pdfNotificaAssenza() {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  if (typeof modelliCarica === 'function') await modelliCarica();
  const doc = await _pdfNotificaAssenzaDoc();
  if (typeof mostraPdfPreview === 'function')
    mostraPdfPreview(doc, 'Notifica_assenza_827.pdf', "Notifica d'assenza (827)");
  else doc.save('Notifica_assenza_827.pdf');
}
// il PDF del modulo 827; testi fissi dal modello del documento "assenza827" (testiSovra =
// testi da usare al posto di quelli salvati, per l anteprima)
async function _pdfNotificaAssenzaDoc(testiSovra) {
  if (!window.jspdf) await caricaJsPDF();
  const t = modelloTestoDi(
    modelloTesti('assenza827', testiSovra),
    modelloValori({
      settore:
        typeof repartoNomeDocumento === 'function' && typeof _pianoReparto === 'function'
          ? repartoNomeDocumento(_pianoReparto())
          : '',
    }),
  );
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const punti = (x1, x2, y) => {
    doc.setLineDashPattern([0.25, 0.6], 0);
    doc.setLineWidth(0.2);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  };
  const casella = (x, y) => {
    doc.setLineWidth(0.25);
    doc.rect(x, y - 2.7, 3, 3);
  };
  doc.setTextColor(0);
  const logo = await _ndLogoRitagliato();
  _ndDisegnaLogo(doc, logo);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(t('emittente'), 13, 25.5);
  doc.setFontSize(8.5);
  doc.text(t('codice'), 20.5, 31);
  doc.setFontSize(7);
  doc.text('Data :' + t('data_modulo'), 140, 20);
  doc.setFontSize(5);
  doc.text('Red.', 140, 23.2);
  doc.text('Appr.', 140, 29.3);
  doc.setFontSize(7);
  doc.text(t('redatto'), 144, 24.5);
  doc.text(t('approvato'), 146, 29.6);
  doc.setFontSize(16);
  doc.text(t('titolo'), 105, 45, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text(t('sottotitolo'), 105, 50.5, { align: 'center' });
  doc.setFontSize(10);
  // dopo un etichetta del modello la riga di puntini parte dove sempre, spostata a destra
  // di quanto l etichetta e piu lunga dell originale (con l originale: identica)
  const dopo = (k, minimo) => minimo + _modelloAllungo(doc, t(k), modelloOriginale('assenza827', k));
  doc.text(t('etich_nome'), 15, 62);
  punti(dopo('etich_nome', 48), 195, 62.5);
  doc.text(t('etich_settore'), 15, 71);
  punti(dopo('etich_settore', 48), 195, 71.5);
  // tabella dei periodi (intestazioni al massimo su due righe)
  const x0 = 15;
  const due = (k) => t(k).split('\n').slice(0, 2).join('\n');
  const col = [
    { t: 'N.', w: 8 },
    { t: due('col_settimana'), w: 20 },
    { t: due('col_dal'), w: 26 },
    { t: due('col_al'), w: 26 },
    { t: due('col_giorni'), w: 15 },
    { t: due('col_vacanze'), w: 18 },
    { t: due('col_recupero'), w: 18 },
    { t: due('col_militare'), w: 18 },
    { t: due('col_altro'), w: 16 },
    { t: due('col_autor'), w: 15 },
  ];
  const wTot = col.reduce((s, c) => s + c.w, 0);
  let y = 80;
  const hTesta = 10;
  const hRiga = 9;
  const nRighe = 8;
  doc.setFillColor(242, 242, 242);
  doc.rect(x0, y, wTot, hTesta, 'F');
  doc.setLineWidth(0.25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  let x = x0;
  col.forEach((c) => {
    doc.rect(x, y, c.w, hTesta);
    const righe = c.t.split('\n');
    righe.forEach((tx, i) =>
      doc.text(tx, x + c.w / 2, y + (righe.length === 1 ? 6 : 4.2 + i * 3.6), { align: 'center' }),
    );
    x += c.w;
  });
  doc.setFont('helvetica', 'normal');
  y += hTesta;
  for (let r = 1; r <= nRighe; r++) {
    x = x0;
    col.forEach((c, i) => {
      doc.rect(x, y, c.w, hRiga);
      if (i === 0) doc.text(String(r), x + c.w / 2, y + 5.8, { align: 'center' });
      if (i >= 5 && i <= 8) casella(x + c.w / 2 - 1.5, y + 6);
      if (i === 9) {
        casella(x + 2.5, y + 6);
        casella(x + c.w - 5.5, y + 6);
      }
      x += c.w;
    });
    y += hRiga;
  }
  y += 7;
  doc.setFontSize(9);
  doc.text(t('note'), 15, y);
  punti(dopo('note', 38), 195, y + 0.5);
  y += 8;
  punti(15, 195, y + 0.5);
  y += 13;
  doc.setFontSize(10);
  doc.text(t('luogo'), 15, y);
  punti(dopo('luogo', 40), 95, y + 0.5);
  doc.text(t('firma'), 105, y);
  punti(dopo('firma', 118), 195, y + 0.5);
  // parte del responsabile
  y += 12;
  doc.setLineWidth(0.6);
  doc.line(15, y, 195, y);
  y += 10;
  doc.setFontSize(10);
  doc.text(t('aut_titolo'), 15, y);
  casella(75, y);
  doc.text(t('aut_si'), 80, y);
  casella(118, y);
  doc.text(t('aut_salvo'), 123, y);
  punti(dopo('aut_salvo', 155), 195, y + 0.5);
  y += 8;
  casella(75, y);
  doc.text(t('aut_no'), 80, y);
  y += 11;
  doc.text(t('visto'), 15, y);
  punti(dopo('visto', 62), 195, y + 0.5);
  y += 9;
  doc.text(t('etich_data'), 15, y);
  punti(dopo('etich_data', 62), 120, y + 0.5);
  y += 11;
  doc.text(t('motivazione'), 15, y);
  y += 8;
  punti(15, 195, y + 0.5);
  y += 8;
  punti(15, 195, y + 0.5);
  return doc;
}
