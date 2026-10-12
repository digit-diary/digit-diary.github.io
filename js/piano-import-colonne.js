/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-import-colonne.js
 *
 * IMPORT DEL PIANO DA EXCEL CON LE COLONNE A SCELTA (v453).
 * Il file del Casino (foglio del mese, giorni in una riga) e il formato semplice (nome e poi
 * i giorni 1..N) si riconoscono da soli, come sempre (js/piano-config.js). Un file di formato
 * diverso apre la finestra "Scegli le colonne": foglio, riga di intestazione, colonna dei
 * nomi, della funzione e della percentuale (facoltative), colonne dei giorni (numeri 1-31
 * nella riga di intestazione, oppure dalla colonna X alla colonna Y), con l anteprima delle
 * prime righe e dei codici riconosciuti e sconosciuti. La stessa finestra si apre a richiesta
 * (Esporta > "Importa da Excel scegliendo le colonne").
 * La mappatura si puo salvare per settore (impostazione piano_import_colonne_<settore>,
 * migrazione 20260915: la scrive chi importa il piano da file, nei suoi settori) e viene
 * proposta al file successivo. L import vero resta quello di sempre (_importaPianoDaWb):
 * stessi controlli (codici sconosciuti, celle protette, giorni chiusi, malattie, persone
 * nuove o assenti, riposi) e stesso riepilogo prima di scrivere.
 */

// ---------------------------------------------------------------- funzioni pure
// colonna Excel: 0 -> 'A', 25 -> 'Z', 26 -> 'AA'
function _xlsColLettera(i) {
  let n = Math.floor(i);
  if (!(n >= 0)) return '';
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
// 'A' -> 0, 'aa' -> 26; non valida -> -1
function _xlsColIndice(l) {
  const t = String(l == null ? '' : l)
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) return -1;
  let n = 0;
  for (const ch of t) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
// mappa giorno -> colonna dalla scelta dell utente. riga = riga di intestazione (per
// 'numeri'), mappaNumeri = funzione che trova i numeri 1..N in una riga (_xlsMappaGiorni).
// { mappa } oppure { errore }
function _xlsMappaDaColonne(scelta, riga, nGiorni, mappaNumeri) {
  const s = scelta || {};
  if (s.giorni === 'numeri') {
    const m = riga && mappaNumeri ? mappaNumeri(riga, nGiorni) : null;
    if (!m)
      return {
        errore:
          'Nella riga di intestazione non ci sono i numeri dei giorni (1, 2, 3...): scegli un altra riga oppure indica la prima e l ultima colonna dei giorni.',
      };
    return { mappa: m };
  }
  const a = _xlsColIndice(s.primaCol);
  if (a < 0) return { errore: 'Indica la colonna del giorno 1.' };
  const z = s.ultimaCol ? _xlsColIndice(s.ultimaCol) : a + nGiorni - 1;
  if (z < a) return { errore: 'L ultima colonna dei giorni viene prima della prima.' };
  const mappa = {};
  for (let g = 1; g <= nGiorni && a + g - 1 <= z; g++) mappa[g] = a + g - 1;
  return { mappa: mappa };
}
// ANTEPRIMA: le righe dei dati con il nome, il collaboratore trovato, la funzione e i codici
// dei giorni; conteggi dei codici riconosciuti e sconosciuti. Stessa regola dell import per
// le righe da leggere (nome di almeno 4 caratteri che non inizia con una cifra).
// L = { dati, mappa, colNome, colFunzione, colPerc, inizio }; trova(nome) -> collaboratore o
// null; valido(codice) -> true se il programma conosce la sigla.
function _xlsAnteprimaRighe(L, nGiorni, trova, valido) {
  const out = {
    righe: [],
    persone: 0,
    trovate: 0,
    nonTrovate: [],
    celle: 0,
    codiciOk: {},
    codiciSconosciuti: {},
  };
  (L.dati || []).slice(L.inizio || 0).forEach((riga, i) => {
    const raw = String((riga || [])[L.colNome] == null ? '' : riga[L.colNome]).trim();
    if (!raw || raw.length < 4 || /^\d/.test(raw)) return;
    const codici = [];
    for (let g = 1; g <= nGiorni; g++) {
      const c = L.mappa[g];
      const cod =
        c == null
          ? ''
          : String(riga[c] == null ? '' : riga[c])
              .trim()
              .toUpperCase();
      codici.push(cod);
      if (!cod) continue;
      if (valido(cod)) {
        out.codiciOk[cod] = (out.codiciOk[cod] || 0) + 1;
        out.celle++;
      } else out.codiciSconosciuti[cod] = (out.codiciSconosciuti[cod] || 0) + 1;
    }
    const hit = trova(raw);
    out.persone++;
    if (hit) out.trovate++;
    else out.nonTrovate.push(raw);
    out.righe.push({
      riga: (L.inizio || 0) + i + 1, // numero della riga in Excel
      nome: raw,
      collaboratore: hit ? hit.nome : '',
      funzione: L.colFunzione == null ? '' : String(riga[L.colFunzione] == null ? '' : riga[L.colFunzione]).trim(),
      percentuale: L.colPerc == null ? '' : String(riga[L.colPerc] == null ? '' : riga[L.colPerc]).trim(),
      codici: codici,
    });
  });
  return out;
}

// ---------------------------------------------------------------- lettura del file
// righe del foglio a partire da A1 (righe e colonne come in Excel, anche se il foglio inizia
// piu in basso o piu a destra), valori grezzi come nell import
function _xlsLeggiFoglioA1(ws) {
  if (!ws || !ws['!ref']) return [];
  const r = XLSX.utils.decode_range(ws['!ref']);
  const ref = 'A1:' + XLSX.utils.encode_cell({ r: r.e.r, c: r.e.c });
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, range: ref, blankrows: true });
}
// FILE RICONOSCIUTO DA SOLO (come sempre): foglio del mese con i numeri dei giorni nelle prime
// righe (file del Casino), oppure formato semplice (prima colonna i nomi, poi i giorni 1..N):
// riga di intestazione con i giorni proprio dalla colonna B, o senza intestazione con almeno un
// nome conosciuto nella prima colonna.
function _xlsFileRiconosciuto(wb, ym, collabs) {
  const nG = _pianoUltimoGiorno(ym);
  const fm = _xlsFoglioMese(wb, ym);
  if (fm) {
    const d = XLSX.utils.sheet_to_json(wb.Sheets[fm], { header: 1, defval: '', raw: true });
    if (_xlsCercaMappaGiorni(d, nG, 0, 8)) return true;
  }
  const d = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  for (let r = 0; r < Math.min(10, d.length); r++) {
    const m = _xlsMappaGiorni(d[r], nG);
    if (!m) continue;
    // giorni dalla colonna B in poi, uno per colonna: e il formato semplice
    return Object.keys(m).every((g) => m[g] === parseInt(g));
  }
  return _xlsSempliceAllineato(
    d.filter((riga) => _xlsTrovaCollab(String((riga || [])[0] || '').trim(), collabs || [])),
    nG,
  );
}
// formato semplice senza intestazione: nelle righe con un nome conosciuto in colonna A il
// giorno 1 deve stare in B e dopo l ultimo giorno non ci devono essere codici (altrimenti i
// giorni sono spostati, per esempio da una colonna in piu tra il nome e i giorni)
function _xlsSempliceAllineato(righe, nGiorni) {
  if (!righe.length) return false;
  const pieno = (r, c) => String((r || [])[c] == null ? '' : r[c]).trim() !== '';
  const conPrimo = righe.filter((r) => pieno(r, 1)).length;
  const oltre = righe.filter((r) => pieno(r, nGiorni + 1)).length;
  return conPrimo > 0 && oltre <= righe.length / 2;
}
// foglio con piu nomi di collaboratori conosciuti (primi 20 fogli, prime 150 righe)
function _xlsFoglioConPiuNomi(wb, collabs) {
  let meglio = wb.SheetNames[0];
  let max = 0;
  wb.SheetNames.slice(0, 20).forEach((n) => {
    const d = _xlsLeggiFoglioA1(wb.Sheets[n]).slice(0, 150);
    let k = 0;
    d.forEach((riga) =>
      (riga || []).forEach((v) => {
        if (typeof v === 'string' && v.trim().length >= 4 && _xlsTrovaCollab(v, collabs)) k++;
      }),
    );
    if (k > max) {
      max = k;
      meglio = n;
    }
  });
  return meglio;
}
// mappatura proposta: quella salvata del settore (se il foglio c e) o una indovinata dal file
function _xlsColonneProposte(wb, ym, salvata, collabs, funzioni) {
  const nG = _pianoUltimoGiorno(ym);
  const fm = _xlsFoglioMese(wb, ym);
  // la mappatura salvata vale se il suo foglio c e (o il foglio del mese, se era quello)
  let s = salvata && typeof salvata === 'object' ? salvata : null;
  let foglio = null;
  if (s && s.foglioMese && fm) foglio = fm;
  else if (s && s.foglio && wb.Sheets[s.foglio]) foglio = s.foglio;
  else {
    s = null;
    foglio = fm || _xlsFoglioConPiuNomi(wb, collabs);
  }
  const dati = _xlsLeggiFoglioA1(wb.Sheets[foglio]);
  if (s) {
    return {
      foglio: foglio,
      rigaIntest: Math.max(0, parseInt(s.rigaIntest) || 0),
      colNome: s.colNome || 'A',
      colFunzione: s.colFunzione || '',
      colPerc: s.colPerc || '',
      giorni: s.giorni === 'colonne' ? 'colonne' : 'numeri',
      primaCol: s.primaCol || '',
      ultimaCol: s.ultimaCol || '',
      dallaSalvata: true,
    };
  }
  // riga con i numeri dei giorni
  let rIntest = -1;
  let mappa = null;
  for (let r = 0; r < Math.min(15, dati.length); r++) {
    mappa = _xlsMappaGiorni(dati[r], nG);
    if (mappa) {
      rIntest = r;
      break;
    }
  }
  const fine = Math.min(dati.length, (rIntest < 0 ? 0 : rIntest + 1) + 80);
  const contaCol = (prova) => {
    const n = {};
    for (let r = rIntest + 1; r < fine; r++)
      (dati[r] || []).forEach((v, c) => {
        if (prova(v)) n[c] = (n[c] || 0) + 1;
      });
    return n;
  };
  const migliore = (n, escluse) =>
    Object.keys(n)
      .map(Number)
      .filter((c) => !(escluse || []).includes(c))
      .sort((a, b) => n[b] - n[a] || a - b)[0];
  const giorniCol = mappa ? Object.values(mappa) : [];
  const nomi = contaCol((v) => typeof v === 'string' && v.trim().length >= 4 && !!_xlsTrovaCollab(v, collabs));
  let colNome = migliore(nomi, giorniCol);
  if (colNome == null) colNome = 0;
  const fzSet = new Set((funzioni || []).map((x) => String(x).toUpperCase()));
  const fz = contaCol((v) => fzSet.has(String(v).trim().toUpperCase()));
  let colFunzione = migliore(fz, giorniCol.concat([colNome]));
  // intestazioni scritte: funzione, percentuale
  const intest = rIntest >= 0 ? dati[rIntest] || [] : [];
  let colPerc = null;
  intest.forEach((v, c) => {
    const t = String(v || '').toLowerCase();
    if (colFunzione == null && /funz|ruolo|mansion|qualific/.test(t)) colFunzione = c;
    if (colPerc == null && /%|percent|impiego|grado/.test(t) && !giorniCol.includes(c)) colPerc = c;
  });
  // senza numeri dei giorni: intestazione = la riga sopra il primo nome conosciuto; giorni
  // dalla prima colonna dopo il nome (e la funzione) piena nelle righe con un nome
  let rigaIntest = rIntest >= 0 ? rIntest + 1 : 0;
  let primaCol = mappa ? mappa[1] : colNome + 1;
  if (!mappa) {
    const conNome = [];
    dati.forEach((riga, r) => {
      const v = (riga || [])[colNome];
      if (typeof v === 'string' && v.trim().length >= 4 && _xlsTrovaCollab(v, collabs)) conNome.push(r);
    });
    if (conNome.length) {
      rigaIntest = conNome[0]; // riga sopra (numero di Excel = indice)
      const dopo = Math.max(colNome, colFunzione == null ? -1 : colFunzione, colPerc == null ? -1 : colPerc) + 1;
      for (let c = dopo; c < dopo + 10; c++) {
        const pieni = conNome.filter((r) => String((dati[r] || [])[c] == null ? '' : dati[r][c]).trim() !== '').length;
        if (pieni >= conNome.length / 2) {
          primaCol = c;
          break;
        }
      }
    }
  }
  return {
    foglio: foglio,
    rigaIntest: rigaIntest,
    colNome: _xlsColLettera(colNome),
    colFunzione: colFunzione == null ? '' : _xlsColLettera(colFunzione),
    colPerc: colPerc == null ? '' : _xlsColLettera(colPerc),
    giorni: mappa ? 'numeri' : 'colonne',
    primaCol: _xlsColLettera(primaCol),
    ultimaCol: mappa ? _xlsColLettera(mappa[Math.max(...Object.keys(mappa).map(Number))]) : '',
    dallaSalvata: false,
  };
}
// DISPOSIZIONE DEL FILE dalla scelta dell utente, per _importaPianoDaWb:
// { foglio, dati, mappa, colNome, colFunzione, colPerc, inizio, fonte } oppure { errore }
function _xlsLayoutColonne(wb, ym, scelta) {
  const nG = _pianoUltimoGiorno(ym);
  const s = scelta || {};
  const foglio = s.foglio && wb.Sheets[s.foglio] ? s.foglio : null;
  if (!foglio) return { errore: 'Foglio non trovato nel file: ' + (s.foglio || '(nessuno)') };
  const dati = _xlsLeggiFoglioA1(wb.Sheets[foglio]);
  const rIntest = Math.max(0, parseInt(s.rigaIntest) || 0); // numero della riga in Excel, 0 = nessuna
  if (s.giorni === 'numeri' && !rIntest)
    return { errore: 'Per riconoscere i numeri dei giorni indica la riga di intestazione.' };
  const m = _xlsMappaDaColonne(s, rIntest ? dati[rIntest - 1] : null, nG, _xlsMappaGiorni);
  if (m.errore) return { errore: m.errore };
  const colNome = _xlsColIndice(s.colNome);
  if (colNome < 0) return { errore: 'Indica la colonna dei nomi.' };
  const giorniCol = Object.values(m.mappa);
  const colFunzione = s.colFunzione ? _xlsColIndice(s.colFunzione) : -1;
  const colPerc = s.colPerc ? _xlsColIndice(s.colPerc) : -1;
  if (giorniCol.includes(colNome)) return { errore: 'La colonna dei nomi è anche una colonna dei giorni.' };
  if (colFunzione >= 0 && giorniCol.includes(colFunzione))
    return { errore: 'La colonna della funzione è anche una colonna dei giorni.' };
  if (colPerc >= 0 && giorniCol.includes(colPerc))
    return { errore: 'La colonna della percentuale è anche una colonna dei giorni.' };
  const n = giorniCol.length;
  return {
    foglio: foglio,
    dati: dati,
    mappa: m.mappa,
    colNome: colNome,
    colFunzione: colFunzione >= 0 ? colFunzione : null,
    colPerc: colPerc >= 0 ? colPerc : null,
    inizio: rIntest,
    giorniLetti: n,
    fonte:
      'colonne scelte (foglio "' +
      foglio +
      '", nomi in ' +
      _xlsColLettera(colNome) +
      ', giorni ' +
      _xlsColLettera(m.mappa[1]) +
      '-' +
      _xlsColLettera(m.mappa[n]) +
      (n < nG ? ', solo ' + n + ' giorni su ' + nG : '') +
      ')',
  };
}

// ---------------------------------------------------------------- finestra
// Finestra "Scegli le colonne". Ritorna la scelta (per _importaPianoDaWb) o null se annullata.
// opz.nonRiconosciuto: il file non ha il formato del Casino (lo si dice in cima)
async function pianoImportScegliColonne(wb, ym, opz) {
  opz = opz || {};
  const rep = _pianoReparto();
  const nG = _pianoUltimoGiorno(ym);
  const MESI_L = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const collabs = collaboratoriCache.filter((c) => c.attivo !== false);
  const funzioni = _pianoFunzioniDi(rep) || [];
  let salvata = null;
  try {
    const v = await getImp('piano_import_colonne_' + rep);
    salvata = v ? JSON.parse(v) : null;
  } catch (e) {
    salvata = null;
  }
  const fm = _xlsFoglioMese(wb, ym);
  let scelta = _xlsColonneProposte(wb, ym, salvata, collabs, funzioni);
  const puoSalvare =
    (typeof puoAzioniAutoPiano !== 'function' || puoAzioniAutoPiano('import')) &&
    (typeof puoGestirePiano !== 'function' || puoGestirePiano());
  const trova = (n) => _xlsTrovaCollab(n, collabs);
  const valido = (cod) => !!(_pianoTurnoInfo(cod) || _pianoCodiceInfo(cod));
  // il file sembra quello del Casino ma non ha il foglio del mese: si dice chiaro
  const fogliMese = wb.SheetNames.filter((n) =>
    MESI_L.some((m) => String(n).toUpperCase().trim().startsWith(String(m).toUpperCase())),
  );
  return new Promise((risolvi) => {
    const velo = document.createElement('div');
    velo.className = 'finestra-velo';
    velo.innerHTML =
      '<div class="finestra-box imp-colonne" role="dialog" aria-modal="true" aria-labelledby="impc-tit">' +
      '<h3 id="impc-tit"></h3><p class="impc-intro"></p>' +
      '<div class="impc-campi">' +
      '<label class="impc-campo"><span>Foglio</span><select data-c="foglio"></select></label>' +
      '<label class="impc-campo"><span>Riga di intestazione</span><input type="number" min="0" max="200" data-c="rigaIntest"><small>Numero della riga in Excel; 0 = nessuna</small></label>' +
      '<label class="impc-campo"><span>Colonna dei nomi</span><select data-c="colNome"></select></label>' +
      '<label class="impc-campo"><span>Colonna della funzione</span><select data-c="colFunzione"></select><small>Facoltativa: serve per i collaboratori nuovi</small></label>' +
      '<label class="impc-campo"><span>Colonna della percentuale</span><select data-c="colPerc"></select><small>Facoltativa (0,8 · 80 · 80%)</small></label>' +
      '<fieldset class="impc-campo impc-giorni"><legend>Colonne dei giorni</legend>' +
      '<label><input type="radio" name="impc-g" value="numeri"> Riconosci i numeri 1-' +
      nG +
      ' nella riga di intestazione</label>' +
      '<label><input type="radio" name="impc-g" value="colonne"> Dalla colonna <select data-c="primaCol"></select> (giorno 1) alla colonna <select data-c="ultimaCol"></select></label></fieldset>' +
      '</div>' +
      '<div class="impc-esito" aria-live="polite"></div>' +
      '<div class="impc-tab-wrap"><table class="impc-tab"></table></div>' +
      (puoSalvare
        ? '<label class="impc-salva"><input type="checkbox"> Salva queste colonne per ' +
          escP(repartoLabel(rep)) +
          ': al prossimo file di questo formato vengono proposte da sole</label>'
        : '') +
      '<div class="finestra-pulsanti"><button type="button" class="finestra-no">Annulla</button><button type="button" class="finestra-ok">Continua con l\'import</button></div></div>';
    velo.querySelector('h3').textContent = 'Importa il piano di ' + lbl + ': scegli le colonne';
    const intro = velo.querySelector('.impc-intro');
    intro.textContent =
      (opz.nonRiconosciuto
        ? 'Il file non ha il formato del piano del Casinò (foglio del mese con i giorni in una riga), quindi indica tu dove sono i dati. '
        : 'Indica dove sono i dati nel file. ') +
      (scelta.dallaSalvata
        ? 'Sono proposte le colonne salvate per ' + repartoLabel(rep) + '. '
        : 'Le colonne proposte sono una prima ipotesi. ') +
      "L'anteprima qui sotto si aggiorna subito; dopo arriva il riepilogo dell'import di sempre, con tutti i controlli, e niente viene scritto prima di confermare.";
    if (!fm && fogliMese.length)
      intro.insertAdjacentHTML(
        'beforeend',
        '<b class="impc-attenzione">Attenzione: nel file non c\'è il foglio di ' +
          escP(lbl) +
          ' (ci sono ' +
          escP(fogliMese.slice(0, 4).join(', ')) +
          (fogliMese.length > 4 ? '...' : '') +
          '). Controlla di scegliere il foglio giusto.</b>',
      );
    const q = (c) => velo.querySelector('[data-c="' + c + '"]');
    const salvaCb = velo.querySelector('.impc-salva input');
    if (salvaCb) salvaCb.checked = !!scelta.dallaSalvata;
    const okBtn = velo.querySelector('.finestra-ok');
    q('foglio').innerHTML = wb.SheetNames.map(
      (n) => '<option value="' + escP(n) + '">' + escP(n) + (n === fm ? ' (foglio del mese)' : '') + '</option>',
    ).join('');
    let dati = [];
    // elenco delle colonne con l intestazione accanto (A · Nome)
    const opzioniColonne = (vuota) => {
      const r = scelta.rigaIntest ? dati[scelta.rigaIntest - 1] || [] : [];
      const nCol = Math.min(200, Math.max(1, ...dati.slice(0, 60).map((x) => (x || []).length)));
      let h = vuota ? '<option value="">nessuna</option>' : '';
      for (let c = 0; c < nCol; c++) {
        const t = String(r[c] == null ? '' : r[c]).trim();
        h +=
          '<option value="' +
          _xlsColLettera(c) +
          '">' +
          _xlsColLettera(c) +
          (t ? ' · ' + escP(t.slice(0, 24)) : '') +
          '</option>';
      }
      return h;
    };
    const riempi = () => {
      dati = _xlsLeggiFoglioA1(wb.Sheets[scelta.foglio]);
      q('foglio').value = scelta.foglio;
      q('rigaIntest').value = scelta.rigaIntest;
      ['colNome', 'primaCol', 'ultimaCol'].forEach((c) => (q(c).innerHTML = opzioniColonne(false)));
      ['colFunzione', 'colPerc'].forEach((c) => (q(c).innerHTML = opzioniColonne(true)));
      ['colNome', 'colFunzione', 'colPerc', 'primaCol', 'ultimaCol'].forEach((c) => (q(c).value = scelta[c] || ''));
      if (!q('ultimaCol').value && scelta.primaCol) {
        const u = _xlsColLettera(_xlsColIndice(scelta.primaCol) + nG - 1);
        if ([...q('ultimaCol').options].some((o) => o.value === u)) q('ultimaCol').value = u;
      }
      scelta.ultimaCol = q('ultimaCol').value;
      velo.querySelectorAll('input[name="impc-g"]').forEach((r) => (r.checked = r.value === scelta.giorni));
    };
    const esito = velo.querySelector('.impc-esito');
    const tab = velo.querySelector('.impc-tab');
    const conteggio = (o) =>
      Object.keys(o)
        .sort((a, b) => o[b] - o[a])
        .map((k) => escP(k) + ' (' + o[k] + ')')
        .join(', ');
    const aggiorna = () => {
      const L = _xlsLayoutColonne(wb, ym, scelta);
      tab.innerHTML = '';
      if (L.errore) {
        esito.innerHTML = '<p class="impc-errore">' + escP(L.errore) + '</p>';
        okBtn.disabled = true;
        return;
      }
      const a = _xlsAnteprimaRighe(L, nG, trova, valido);
      const nSc = Object.values(a.codiciSconosciuti).reduce((s, x) => s + x, 0);
      esito.innerHTML =
        '<p><b>' +
        a.persone +
        (a.persone === 1 ? ' riga' : ' righe') +
        ' con un nome</b>: ' +
        a.trovate +
        (a.trovate === 1 ? ' collaboratore riconosciuto, ' : ' collaboratori riconosciuti, ') +
        a.nonTrovate.length +
        (a.nonTrovate.length === 1 ? ' non trovato' : ' non trovati') +
        (a.nonTrovate.length
          ? ' (' + escP(a.nonTrovate.slice(0, 5).join(', ')) + (a.nonTrovate.length > 5 ? '...' : '') + ')'
          : '') +
        ' · giorni letti: ' +
        L.giorniLetti +
        ' su ' +
        nG +
        ' · ' +
        a.celle +
        (a.celle === 1 ? ' cella' : ' celle') +
        ' con codici riconosciuti.</p>' +
        '<p class="impc-ok">Codici riconosciuti: ' +
        (conteggio(a.codiciOk) || 'nessuno') +
        '</p>' +
        (nSc
          ? '<p class="impc-errore">Codici sconosciuti (non si importano): ' + conteggio(a.codiciSconosciuti) + '</p>'
          : '<p>Nessun codice sconosciuto.</p>') +
        (a.nonTrovate.length
          ? '<p class="impc-nota">I nomi non trovati diventano collaboratori nuovi solo se hanno almeno 3 turni (si conferma nel riepilogo); i disattivati restano disattivati.</p>'
          : '');
      const nGiorniTab = Math.min(nG, 12);
      let h =
        '<thead><tr><th>Riga</th><th>Nome nel file</th><th>Collaboratore</th>' +
        (L.colFunzione != null ? '<th>Funzione</th>' : '') +
        (L.colPerc != null ? '<th>%</th>' : '');
      for (let g = 1; g <= nGiorniTab; g++) h += '<th>' + g + '</th>';
      h += '<th>…</th></tr></thead><tbody>';
      a.righe.slice(0, 8).forEach((r) => {
        h +=
          '<tr><td>' +
          r.riga +
          '</td><td>' +
          escP(r.nome) +
          '</td><td>' +
          (r.collaboratore ? escP(r.collaboratore) : '<span class="impc-nuovo">non trovato</span>') +
          '</td>' +
          (L.colFunzione != null ? '<td>' + escP(r.funzione) + '</td>' : '') +
          (L.colPerc != null ? '<td>' + escP(r.percentuale) + '</td>' : '');
        for (let g = 1; g <= nGiorniTab; g++) {
          const c = r.codici[g - 1] || '';
          h +=
            '<td' +
            (c && !valido(c) ? ' class="impc-sconosciuto" title="Codice sconosciuto"' : '') +
            '>' +
            escP(c) +
            '</td>';
        }
        h += '<td></td></tr>';
      });
      if (!a.righe.length)
        h += '<tr><td colspan="' + (5 + nGiorniTab) + '">Nessuna riga con un nome nella colonna scelta.</td></tr>';
      h += '</tbody>';
      tab.innerHTML = h;
      okBtn.disabled = !a.celle;
    };
    const leggi = () => {
      scelta.rigaIntest = Math.max(0, parseInt(q('rigaIntest').value) || 0);
      ['colNome', 'colFunzione', 'colPerc', 'primaCol', 'ultimaCol'].forEach((c) => (scelta[c] = q(c).value));
      const g = velo.querySelector('input[name="impc-g"]:checked');
      scelta.giorni = g ? g.value : 'numeri';
    };
    velo.addEventListener('change', (e) => {
      if (e.target === q('foglio')) {
        scelta = Object.assign(
          _xlsColonneProposte(Object.assign({}, wb, { SheetNames: [e.target.value] }), ym, null, collabs, funzioni),
          { foglio: e.target.value },
        );
        riempi();
      } else {
        leggi();
        if (e.target === q('rigaIntest')) {
          // le etichette delle colonne seguono la riga di intestazione
          const tenere = Object.assign({}, scelta);
          riempi();
          Object.assign(scelta, tenere);
          ['colNome', 'colFunzione', 'colPerc', 'primaCol', 'ultimaCol'].forEach((c) => (q(c).value = scelta[c] || ''));
        }
      }
      aggiorna();
    });
    const chiudi = (v) => {
      document.removeEventListener('keydown', tasti, true);
      velo.remove();
      risolvi(v);
    };
    const tasti = (e) => {
      if (e.key !== 'Escape' || document.querySelectorAll('.finestra-velo').length > 1) return;
      e.preventDefault();
      e.stopPropagation();
      chiudi(null);
    };
    velo.querySelector('.finestra-no').addEventListener('click', () => chiudi(null));
    okBtn.addEventListener('click', async () => {
      leggi();
      const L = _xlsLayoutColonne(wb, ym, scelta);
      if (L.errore) return;
      const daSalvare = {
        foglio: scelta.foglio,
        foglioMese: !!fm && scelta.foglio === fm,
        rigaIntest: scelta.rigaIntest,
        colNome: scelta.colNome,
        colFunzione: scelta.colFunzione || '',
        colPerc: scelta.colPerc || '',
        giorni: scelta.giorni,
        primaCol: scelta.giorni === 'colonne' ? scelta.primaCol : '',
        ultimaCol: scelta.giorni === 'colonne' ? scelta.ultimaCol : '',
      };
      if (salvaCb && salvaCb.checked) {
        okBtn.disabled = true;
        const ok = await salvaImp('piano_import_colonne_' + rep, JSON.stringify(daSalvare));
        okBtn.disabled = false;
        if (!ok) return;
        logAzione('Colonne dell import del piano salvate', rep + ' · ' + L.fonte);
      }
      chiudi(Object.assign({}, daSalvare));
    });
    document.addEventListener('keydown', tasti, true);
    document.body.appendChild(velo);
    riempi();
    aggiorna();
    q('foglio').focus();
  });
}
// pulsante del menu Esporta: import con la finestra delle colonne anche se il file e riconosciuto
let _pianoImpScegliColonne = false;
function pianoImportaConColonne(scegli) {
  _pianoImpScegliColonne = !!scegli;
  const el = document.getElementById('piano-imp-file');
  if (el) el.click();
}
