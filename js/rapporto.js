/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: rapporto.js
 */

// ================================================================
// SEZIONE 9: RAPPORTO GIORNALIERO
// Calendario, form turno, parser assenze e differenze cassa
// ================================================================
// RAPPORTO GIORNALIERO
function getGiornataCasino() {
  const now = new Date();
  if (now.getHours() < 6) now.setDate(now.getDate() - 1);
  return (
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  );
}
// La cache dei rapporti e' indicizzata per data E settore: con la sola data, dopo un cambio
// settore la Home mostrava lo stato del rapporto del settore precedente.
function _rapportoKey(ds, reparto) {
  return ds + '|' + (reparto || currentReparto);
}
function _rapportoCacheGet(ds) {
  return rapportiCache[_rapportoKey(ds)] || {};
}
function _rapportoCacheSet(ds, turno, rec) {
  const k = _rapportoKey(ds);
  if (!rapportiCache[k]) rapportiCache[k] = {};
  rapportiCache[k][turno] = rec;
}
async function fetchRapportiMese(a, m) {
  const start = a + '-' + String(m + 1).padStart(2, '0') + '-01';
  const nm = m === 11 ? new Date(a + 1, 0, 1) : new Date(a, m + 1, 1);
  const end = nm.getFullYear() + '-' + String(nm.getMonth() + 1).padStart(2, '0') + '-01';
  rapportiCache = {};
  const data = await secGet(
    'rapporti_giornalieri?data_rapporto=gte.' +
      start +
      '&data_rapporto=lt.' +
      end +
      '&reparto_dip=eq.' +
      currentReparto,
  );
  data.forEach((r) => {
    _rapportoCacheSet(r.data_rapporto, r.turno, r);
  });
}
// salva subito quello che aspetta il ritardo dell autosalvataggio (cambio pagina, uscita):
// ritorna la promessa, cosi chi esce puo aspettarla
function flushRapportoSave() {
  if (!window._rappPending) return Promise.resolve();
  const salvataggi = Object.entries(window._rappPending).map(([cls, turno]) => {
    clearTimeout(window._rappTimers[cls]);
    return salvaRapportoTurno(window._rappDs, turno, cls);
  });
  window._rappPending = {};
  return Promise.allSettled(salvataggi);
}
async function renderRapporto() {
  if (rapportoGiornoAperto) {
    await fetchRapportiMese(rapportoAnno, rapportoMese);
    apriGiorno(rapportoGiornoAperto);
  } else renderRapportoCalendario();
}
async function renderRapportoCalendario() {
  const v = document.getElementById('rapporto-view');
  v.innerHTML = '<div class="loading">Caricamento...</div>';
  await fetchRapportiMese(rapportoAnno, rapportoMese);
  const firstDay = new Date(rapportoAnno, rapportoMese, 1).getDay();
  const startDay = (firstDay + 6) % 7;
  const daysInMonth = new Date(rapportoAnno, rapportoMese + 1, 0).getDate();
  const oggiStr = getGiornataCasino();
  let yearOpts = '';
  for (let y = 2023; y <= rapportoAnno + 1; y++)
    yearOpts += '<option' + (y === rapportoAnno ? ' selected' : '') + '>' + y + '</option>';
  let html =
    '<div class="rapporto-nav"><button onclick="navMese(-1)">&lt;</button><div class="month-label">' +
    MESI_FULL[rapportoMese] +
    ' <select onchange="rapportoAnno=parseInt(this.value);renderRapportoCalendario()" style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);border:none;background:transparent;color:var(--ink);cursor:pointer">' +
    yearOpts +
    '</select></div><button onclick="navMese(1)">&gt;</button></div>';
  html += '<div class="rapporto-calendar">';
  ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].forEach((g) => {
    html += '<div class="rapporto-day-header">' + g + '</div>';
  });
  // Previous month filler
  const prevDays = new Date(rapportoAnno, rapportoMese, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    html += '<div class="rapporto-day-cell other-month"><div class="day-num">' + (prevDays - i) + '</div></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = rapportoAnno + '-' + String(rapportoMese + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const rdata = _rapportoCacheGet(ds);
    // pallino per QUALSIASI campo compilato (assenze, prelievi, assegni, differenze, campi del
    // settore): prima solo le tre note, e in Valet e Cleaning i rapporti non si vedevano (A14)
    const hasP = _rapportoHaDati(rdata.PRESTO);
    const hasN = _rapportoHaDati(rdata.NOTTE);
    html +=
      '<div class="rapporto-day-cell' +
      (ds === oggiStr ? ' today' : '') +
      '" onclick="apriGiorno(\'' +
      ds +
      '\')"><div class="day-num">' +
      d +
      '</div><div class="day-dots">' +
      (hasP ? '<div class="dot dot-presto"></div>' : '') +
      (hasN ? '<div class="dot dot-notte"></div>' : '') +
      '</div></div>';
  }
  // Next month filler
  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 ? 7 - (totalCells % 7) : 0;
  for (let i = 1; i <= remaining; i++) {
    html += '<div class="rapporto-day-cell other-month"><div class="day-num">' + i + '</div></div>';
  }
  html += '</div>';
  html +=
    '<div style="margin-top:20px;text-align:center"><div style="display:flex;justify-content:center;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:12px"><div class="field"><label style="font-size:var(--fs-sm,.8125rem);color:var(--muted);display:block;margin-bottom:2px">Dal</label><input type="text" id="rapp-dal" readonly style="width:120px;padding:7px 10px;border:1px solid var(--line);border-radius:2px;font-size:var(--fs-md,.875rem);background:var(--paper2);color:var(--ink);cursor:pointer"></div><div class="field"><label style="font-size:var(--fs-sm,.8125rem);color:var(--muted);display:block;margin-bottom:2px">Al</label><input type="text" id="rapp-al" readonly style="width:120px;padding:7px 10px;border:1px solid var(--line);border-radius:2px;font-size:var(--fs-md,.875rem);background:var(--paper2);color:var(--ink);cursor:pointer"></div></div><div style="display:flex;justify-content:center;gap:12px"><button class="btn-export" onclick="esportaRapportoCSV()" style="padding:10px 24px;font-size:var(--fs-md,.875rem)">Esporta CSV</button><button class="btn-export btn-export-pdf" onclick="esportaRapportoPDF()" style="padding:10px 24px;font-size:var(--fs-md,.875rem)">Esporta PDF</button></div></div>';
  v.innerHTML = html;
  if (window.flatpickr) {
    const ms = rapportoAnno + '-' + String(rapportoMese + 1).padStart(2, '0') + '-01';
    const ed = new Date(rapportoAnno, rapportoMese + 1, 0).getDate();
    const me = rapportoAnno + '-' + String(rapportoMese + 1).padStart(2, '0') + '-' + String(ed).padStart(2, '0');
    flatpickr('#rapp-dal', {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      defaultDate: ms,
      allowInput: false,
    });
    flatpickr('#rapp-al', {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      defaultDate: me,
      allowInput: false,
    });
  }
}
function navMese(delta) {
  rapportoMese += delta;
  if (rapportoMese > 11) {
    rapportoMese = 0;
    rapportoAnno++;
  }
  if (rapportoMese < 0) {
    rapportoMese = 11;
    rapportoAnno--;
  }
  renderRapportoCalendario();
}
async function apriGiorno(ds) {
  flushRapportoSave();
  rapportoGiornoAperto = ds;
  const d = new Date(ds + 'T12:00:00');
  const rdata = _rapportoCacheGet(ds);
  const p = rdata.PRESTO || {};
  const n = rdata.NOTTE || {};
  const v = document.getElementById('rapporto-view');
  function tf(id, label, val) {
    return (
      '<div class="turno-field"><label>' +
      label +
      '</label><textarea id="' +
      id +
      '" placeholder="Scrivi qui...">' +
      escP(val || '') +
      '</textarea></div>'
    );
  }
  function sf(id, label, val) {
    return (
      '<div class="turno-field"><label>' +
      label +
      '</label><input type="text" id="' +
      id +
      '" value="' +
      escP(val || '') +
      '" placeholder="Nome..." style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:var(--fs-md,.875rem);background:var(--paper2);color:var(--ink);outline:none"></div>'
    );
  }
  function nf(id, label, val) {
    return (
      '<div class="turno-field"><label>' +
      label +
      '</label><input type="number" id="' +
      id +
      '" value="' +
      (val || 0) +
      '" min="0"></div>'
    );
  }
  function turnoCol(turno, cls, data) {
    const extra = data.note_extra ? JSON.parse(data.note_extra || '{}') : {};
    let fields = '';
    getCampiRapporto().forEach((c) => {
      const isExtra = !RAPPORTO_DB_COLS.includes(c.key);
      const val = isExtra ? extra[c.key] : data[c.key];
      if (c.type === 'number') fields += nf(cls + '-' + c.key, c.label, val);
      else if (c.type === 'input') fields += sf(cls + '-' + c.key, c.label, val);
      else if (c.key === 'differenze_cassa')
        fields +=
          '<div class="turno-field"><label>' +
          c.label +
          '</label><textarea id="' +
          cls +
          '-' +
          c.key +
          '" placeholder="Cognome -100&#10;Cognome +50&#10;(auto-registra nel diario)">' +
          escP(val || '') +
          '</textarea></div>';
      else fields += tf(cls + '-' + c.key, c.label, val);
    });
    return (
      '<div class="turno-col"><div class="turno-header ' +
      cls +
      '">' +
      turno +
      '</div><div class="turno-body">' +
      fields +
      '<div class="autosave-status" id="status-' +
      cls +
      '" style="text-align:center;font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:8px;min-height:18px"></div></div></div>'
    );
  }
  v.innerHTML =
    '<button class="btn-back" onclick="flushRapportoSave();rapportoGiornoAperto=null;renderRapportoCalendario()">&larr; Torna al calendario</button><div class="rapporto-detail"><h3>Rapporto del ' +
    d.getDate() +
    ' ' +
    MESI_FULL[d.getMonth()] +
    ' ' +
    d.getFullYear() +
    ' · ' +
    GIORNI[d.getDay()] +
    '</h3><div class="turno-columns">' +
    turnoCol('PRESTO', 'presto', p) +
    turnoCol('NOTTE', 'notte', n) +
    '</div><div style="display:flex;justify-content:center;gap:12px;margin-top:20px"><button class="btn-export" onclick="esportaRapportoCSV()" style="padding:10px 24px;font-size:var(--fs-md,.875rem)">Esporta CSV</button><button class="btn-export btn-export-pdf" onclick="esportaRapportoPDF()" style="padding:10px 24px;font-size:var(--fs-md,.875rem)">Esporta PDF</button></div></div>';
  // valori di partenza dei due turni: servono per salvare solo i campi cambiati qui
  _rappSegnaBase(ds, 'PRESTO', p);
  _rappSegnaBase(ds, 'NOTTE', n);
  // Autosave debounce
  window._rappTimers = {};
  window._rappPending = {};
  window._rappDs = ds;
  function autoSave(turno, cls) {
    clearTimeout(window._rappTimers[cls]);
    window._rappPending[cls] = turno;
    const st = document.getElementById('status-' + cls);
    if (st) st.textContent = 'Salvando...';
    window._rappTimers[cls] = setTimeout(() => {
      delete window._rappPending[cls];
      salvaRapportoTurno(ds, turno, cls).then((esito) => {
        if (!st) return;
        // "Salvato" solo se il database ha confermato (prima compariva sempre)
        if (esito === true) {
          st.textContent = 'Salvato';
          setTimeout(() => {
            if (st && st.textContent === 'Salvato') st.textContent = '';
          }, 2000);
        } else st.textContent = 'Non salvato: riprova';
      });
    }, 1200);
  }
  document.querySelectorAll('#rapporto-view .turno-body textarea, #rapporto-view .turno-body input').forEach((el) => {
    const cls = el.id.startsWith('presto') ? 'presto' : 'notte';
    const turno = cls === 'presto' ? 'PRESTO' : 'NOTTE';
    el.addEventListener('input', () => autoSave(turno, cls));
    el.addEventListener('change', () => autoSave(turno, cls));
  });
}
// === D-FULL PARSER ASSENZE: analyze + execute + audit + transactional ============
// Schema flags per gestire deployment senza migration applicata (graceful degradation)
let _origineSchemaSupported = true; // false se DB non ha ancora la colonna 'origine'
function _stripOrigine(rec) {
  const r = Object.assign({}, rec);
  delete r.origine;
  return r;
}
// Helper: estrae range date di una malattia (dal testo "dal DD/MM/YYYY al DD/MM/YYYY" o dal campo data per single-day)
function _getRangeMalattiaRec(rec) {
  const t = rec.testo || '';
  const m = t.match(/dal\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+al\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m)
    return {
      i: m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'),
      f: m[6] + '-' + m[5].padStart(2, '0') + '-' + m[4].padStart(2, '0'),
    };
  // un giorno solo diverso da quello del rapporto: "dal 05/01/2027 (da rapporto ...)"
  const m1 = t.match(/\bdal\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    const d1 = m1[3] + '-' + m1[2].padStart(2, '0') + '-' + m1[1].padStart(2, '0');
    return { i: d1, f: d1 };
  }
  if (rec.data) {
    const d = giornoDi(rec.data);
    return { i: d, f: d };
  }
  return null;
}
// Helper: true se il record appartiene al rapporto corrente (turno+ds), inclusi formati legacy
function _recIsCurrentRapporto(rec, _rapLabel, _rapLabelOld, ds) {
  const t = rec.testo || '';
  if (t.includes(_rapLabel)) return true;
  if (t.includes(_rapLabelOld + ')') && !t.includes(_rapLabelOld + ' del ') && (rec.data || '').startsWith(ds))
    return true;
  return false;
}
// === ANALYZE: parsa il campo assenze e ritorna lista operazioni (NESSUN side effect) ===
// Parole che indicano un'assenza NON per malattia (nessuna registrazione da creare)
const _ASSENZE_ALTRO_RE =
  /\b(lutto|ferie|vacanza|vacanze|infortunio|permesso|giorno libero|riposo|congedo|ritardo|in ritardo|non disponibil[ei])\b/i;
// Parole che indicano malattia/assenza, al singolare E al plurale ("assenti", "malati")
const _ASSENZE_MAL_RE =
  /\b(assent[ei]|malattia|malat[oaie]|malessere|non.{0,10}present[ei]|non.{0,10}vien[ei]|non.{0,10}vengono|chiamat[oaie]|si (?:è|e'|sono) sentit[oaie]|non.{0,10}sar[àa]|non.{0,10}saranno|non sta bene|non stanno bene|sta male|stanno male|ricoverat[oaie]|ospedale|pronto soccorso|visita medica|controllo medico|certificato medico)\b/i;
// Segnaposto tipo "nessuna", "-", "/" nel campo assenze: non sono errori
const _ASSENZE_VUOTO_RE = /^(nessun[oa]|niente|nulla|no|n\/a|-+|\/+|\.+)$/i;
// Da un frammento ("Rossi e Bianchi assenti domani") ricava le voci [riga, nome, stato, lettera, numero],
// una per nome. Ritorna null se il frammento e' un'assenza di altro tipo o un segnaposto,
// [] se non si capisce (il chiamante lo segnala in ops.errors).
function _vociAssenzaDaFrammento(riga, _rigaPulita) {
  if (_ASSENZE_VUOTO_RE.test(riga.trim())) return null;
  const haMal = _ASSENZE_MAL_RE.test(riga) || /\b[A-Z]\s*\d{1,2}\b/.test(riga);
  if (_ASSENZE_ALTRO_RE.test(riga) && !haMal) return null;
  let m = _rigaPulita.match(/^([A-ZÀ-Üa-zà-ü\s.'-]+?)\s*(assent[ei]|malattia|malat[oaie]|([A-Z])\s*(\d{1,2}))\b/);
  if (m && m[1]) m[1] = m[1].replace(/\s+(da|dal|fino|al|a)$/i, '');
  if (!m) {
    const _preDate = _rigaPulita.match(/^(.+?)\s+(?:dal\s|fino\s|domani|dopodomani|oggi)/i);
    if (_preDate) {
      let _pn = _preDate[1].replace(/\s+(da|dal|fino|a)$/i, '').trim();
      if (_pn.length >= 3 && /^[A-ZÀ-Üa-zà-ü\s.'-]+$/.test(_pn)) m = [_rigaPulita, _pn, 'assente', null, null];
    }
  }
  if (m) {
    // "Rossi e Bianchi assenti": un nome per voce; chi e' in ferie nello stesso frammento si salta
    const nomi = m[1]
      .split(/\s+(?:e|ed|&)\s+/i)
      .map((n) => n.trim())
      .filter((n) => n && n.split(/\s+/).length <= 4 && !_ASSENZE_ALTRO_RE.test(n));
    return nomi.map((n) => [riga, n, m[2], m[3], m[4]]);
  }
  if (!_ASSENZE_MAL_RE.test(riga)) return [];
  // Parola chiave in mezzo alla frase: si cercano i collaboratori nominati. Con lo stato al
  // plurale valgono tutti quelli trovati, al singolare solo il primo (come prima). Un nome
  // che vale per piu collaboratori (due «Provetti») resta il cognome scritto: la scelta la
  // fa scegliCollaboratore, che chiede (A5: prima si prendeva il primo dell elenco)
  const plurale = /\b(assenti|malat[ie]|vengono|saranno|stanno)\b/i.test(riga);
  const trovati = [];
  for (const x of nominatiInFrase(riga)) {
    const n = x.nomi.length === 1 ? x.nomi[0] : capitalizzaNome(x.testo);
    if (!trovati.includes(n)) trovati.push(n);
    if (!plurale) break;
  }
  const _cm = riga.match(/\b([A-Z])\s*(\d{1,2})\b/);
  return trovati.map((n) => [riga, n, _cm ? _cm[0] : 'assente', _cm ? _cm[1] : null, _cm ? _cm[2] : null]);
}
// PERIODO DI UN FRAMMENTO DELLE ASSENZE («dal 27 al 2», «dal 30/12 al 2/1», «fino al 3»,
// «domani», «oggi e venerdi», «il 2»), dal giorno del rapporto ds (AAAA-MM-GG).
// Ritorna { inizio, fine } (Date alle 12) oppure { errore }. Regole (A1 del controllo 23.10):
//  - un giorno senza mese vale la data piu vicina al rapporto fra il mese prima, quello del
//    rapporto e quello dopo (a parita il futuro): «il 2» scritto il 27/02 e il 02/03;
//  - un mese senza anno vale l anno piu vicino al rapporto: «dal 30/12» scritto il 02/01 e
//    dell anno prima;
//  - la fine senza mese (o senza anno) e la prima data uguale o dopo l inizio: «dal 27 al 2»
//    finisce il 2 del mese dopo, «dal 30/12 al 2/1» il 2 gennaio dell anno dopo;
//  - fine prima dell inizio con le date intere: errore (prima le date si scambiavano in
//    silenzio e «dal 27 al 2» diventava dal 2 al 27 dello stesso mese).
function _rappPeriodoFrammento(riga, rigaPulita, ds) {
  riga = String(riga || '');
  rigaPulita = String(rigaPulita || riga);
  const rif = new Date(ds + 'T12:00:00');
  const giorno = (y, m, g) => {
    const d = new Date(y, m, g, 12);
    return d.getFullYear() === y && d.getMonth() === m && d.getDate() === g ? d : null;
  };
  const anno = (a) => (a == null || a === '' ? null : parseInt(a) < 100 ? 2000 + parseInt(a) : parseInt(a));
  const mese = (m) => (m == null || m === '' ? null : parseInt(m) - 1);
  const piuGiorni = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const scritta = (g, m, a) => g + (m != null ? '/' + (m + 1) : '') + (a != null ? '/' + a : '');
  // data vicina al rapporto (inizio, o giorno solo)
  const vicina = (g, m, a) => {
    if (a != null && m != null) return giorno(a, m, g);
    const cand = [];
    if (m != null) [-1, 0, 1].forEach((k) => cand.push(giorno(rif.getFullYear() + k, m, g)));
    else
      [-1, 0, 1].forEach((k) => {
        const b = new Date(rif.getFullYear(), rif.getMonth() + k, 1, 12);
        cand.push(giorno(b.getFullYear(), b.getMonth(), g));
      });
    let best = null;
    cand.forEach((d) => {
      if (!d) return;
      const dist = Math.abs(d - rif);
      if (!best || dist < Math.abs(best - rif) || (dist === Math.abs(best - rif) && d > best)) best = d;
    });
    return best;
  };
  // fine: la prima data uguale o dopo l inizio con il giorno (e il mese) scritti
  // fine: con il giorno (e il mese) scritti, la prima data uguale o dopo l inizio. Si passa al
  // mese dopo solo se il giorno e prima di quello d inizio («dal 27 al 2»), all anno dopo solo
  // se il mese e prima di quello d inizio («dal 30/12 al 2/1»); altrimenti la data resta
  // quella (giorno che non esiste = null, fine prima dell inizio = errore di chi chiama)
  const dopo = (g, m, a, ini) => {
    if (a != null && m != null) return giorno(a, m, g);
    if (m != null) return giorno(ini.getFullYear() + (m < ini.getMonth() ? 1 : 0), m, g);
    if (g >= ini.getDate()) return giorno(ini.getFullYear(), ini.getMonth(), g);
    const b = new Date(ini.getFullYear(), ini.getMonth() + 1, 1, 12);
    return giorno(b.getFullYear(), b.getMonth(), g);
  };
  const D = '(\\d{1,2})(?:[\\/\\.\\-](\\d{1,2}))?(?:[\\/\\.\\-](\\d{2,4}))?';
  const domaniMatch = /\bdomani\b/i.test(riga);
  const dopodomaniMatch = /\bdopodomani\b/i.test(riga);
  const oggiMatch = /\b(oggi|stasera|questa sera)\b/i.test(riga);
  const dalAlMatch = rigaPulita.match(new RegExp('\\bdal\\s+' + D + '\\s+(?:fino\\s+)?al?\\s+' + D + '(?!\\d)', 'i'));
  const finoMatch = dalAlMatch ? null : riga.match(new RegExp('\\bfino\\s+(?:al?\\s+)?' + D + '(?!\\d)', 'i'));
  // un giorno solo: «assente il 14», «dal 12» senza «al» (vale quel giorno)
  const unGiornoMatch = dalAlMatch ? null : rigaPulita.match(new RegExp('\\b(?:il|dal)\\s+' + D + '(?!\\d)', 'i'));
  // DATE SCRITTE CON I NUMERI: vengono prima delle parole (piu precise)
  if (dalAlMatch) {
    const m1 = mese(dalAlMatch[2]),
      a1 = anno(dalAlMatch[3]);
    const g2 = parseInt(dalAlMatch[4]),
      m2 = mese(dalAlMatch[5]),
      a2s = anno(dalAlMatch[6]);
    // «dal 30/12/2026 al 2/1»: l anno della fine segue l inizio
    const inizio = vicina(parseInt(dalAlMatch[1]), m1, a1);
    if (!inizio) return { errore: 'data non valida (' + scritta(dalAlMatch[1], m1, a1) + ')' };
    const fine = dopo(g2, m2, a2s, inizio);
    if (!fine) return { errore: 'data non valida (' + scritta(g2, m2, a2s) + ')' };
    if (fine < inizio) return { errore: 'la fine (' + fine.toLocaleDateString('it-IT') + ") è prima dell'inizio" };
    return { inizio, fine };
  }
  if (finoMatch) {
    const inizio = dopodomaniMatch ? piuGiorni(rif, 2) : domaniMatch && !oggiMatch ? piuGiorni(rif, 1) : new Date(rif);
    const g2 = parseInt(finoMatch[1]),
      m2 = mese(finoMatch[2]),
      a2 = anno(finoMatch[3]);
    const fine = dopo(g2, m2, a2, inizio);
    if (!fine) return { errore: 'data non valida (' + scritta(g2, m2, a2) + ')' };
    if (fine < inizio) return { errore: 'la fine (' + fine.toLocaleDateString('it-IT') + ") è prima dell'inizio" };
    return { inizio, fine };
  }
  const _giorniSett = {
    lunedi: 1,
    lunedì: 1,
    martedi: 2,
    martedì: 2,
    mercoledi: 3,
    mercoledì: 3,
    giovedi: 4,
    giovedì: 4,
    venerdi: 5,
    venerdì: 5,
    sabato: 6,
    domenica: 0,
  };
  const _giorniTrovati = [];
  const rigaLow = riga.toLowerCase();
  for (const [g, idx] of Object.entries(_giorniSett)) {
    if (new RegExp('\\b' + g + '(?![a-zà-ü])', 'i').test(rigaLow) && !_giorniTrovati.includes(idx))
      _giorniTrovati.push(idx);
  }
  const finoGiornoMatch = riga.match(
    /fino\s+(?:a\s+)?(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)/i,
  );
  // prossimo giorno della settimana dopo d (mai d stesso)
  const prossimo = (d, idx) => {
    let diff = (idx - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return piuGiorni(d, diff);
  };
  let inizio = new Date(rif),
    fine = new Date(rif);
  // "oggi e domani" / "oggi e dopodomani": il periodo parte dal giorno del rapporto e arriva
  // al giorno indicato. Vanno prima delle altre, altrimenti "domani" da solo vincerebbe.
  if (oggiMatch && dopodomaniMatch) fine = piuGiorni(rif, 2);
  else if (oggiMatch && domaniMatch) fine = piuGiorni(rif, 1);
  else if (oggiMatch && _giorniTrovati.length === 1) fine = prossimo(rif, _giorniTrovati[0]);
  else if (dopodomaniMatch && domaniMatch) {
    inizio = piuGiorni(rif, 1);
    fine = piuGiorni(rif, 2);
  } else if (domaniMatch && _giorniTrovati.length) {
    inizio = piuGiorni(rif, 1);
    fine = prossimo(rif, _giorniTrovati[0]);
    if (fine < inizio) fine = piuGiorni(fine, 7);
  } else if (finoGiornoMatch) fine = prossimo(rif, _giorniSett[finoGiornoMatch[1].toLowerCase()]);
  else if (_giorniTrovati.length >= 2) {
    const dates = _giorniTrovati.map((g) => prossimo(rif, g)).sort((a, b) => a - b);
    inizio = dates[0];
    fine = dates[dates.length - 1];
  } else if (_giorniTrovati.length === 1) {
    inizio = prossimo(rif, _giorniTrovati[0]);
    fine = new Date(inizio);
  } else if (dopodomaniMatch) {
    // "dopodomani" da solo: come prima, da domani a dopodomani
    inizio = piuGiorni(rif, 1);
    fine = piuGiorni(rif, 2);
  } else if (domaniMatch) {
    inizio = piuGiorni(rif, 1);
    fine = new Date(inizio);
  } else if (unGiornoMatch) {
    const m1 = mese(unGiornoMatch[2]),
      a1 = anno(unGiornoMatch[3]);
    inizio = vicina(parseInt(unGiornoMatch[1]), m1, a1);
    if (!inizio) return { errore: 'data non valida (' + scritta(unGiornoMatch[1], m1, a1) + ')' };
    fine = new Date(inizio);
  }
  return { inizio, fine };
}
// scelte = { "somma": "Somma Alfonso" }: nomi ambigui gia chiariti dall operatore
// (un nome ambiguo senza scelta finisce in ops.ambigui e non si registra)
function _analizzaAssenzeRapporto(assenzeText, ds, turno, scelte) {
  const _rappDateStr = new Date(ds + 'T12:00:00').toLocaleDateString('it-IT');
  const _rapLabel = 'da rapporto ' + turno + ' del ' + _rappDateStr;
  const _rapLabelOld = 'da rapporto ' + turno;
  const _malTipo = nomeCorrente('Malattia');
  // ASSENZA IN ATTESA DI CERTIFICATO (decisione del titolare 15.10): chi chiama per malattia
  // e di base un «Assenza» (nel Piano ASS sui turni, 0 ore); «Malattia» solo se il
  // frammento dice che il certificato c e gia («Rossi malato con certificato»). Una
  // registrazione gia esistente tiene il suo tipo (il certificato lo registra l HR).
  const _assTipo = nomeCorrente('Assenza');
  const _eTipoAss = (t) => t === _malTipo || t === _assTipo;
  // D1: snapshot esistenti per QUESTO rapporto, ESCLUSI i record con origine='manual'
  const _esistenti = datiCache.filter((e) => {
    if (!_eTipoAss(e.tipo)) return false;
    if ((e.reparto_dip || currentReparto) !== currentReparto) return false;
    if (e.origine === 'manual') return false;
    return _recIsCurrentRapporto(e, _rapLabel, _rapLabelOld, ds);
  });
  const ops = {
    creates: [],
    updates: [],
    deletes: [],
    skipped: [],
    errors: [],
    ambigui: [],
    meta: { rapLabel: _rapLabel, malTipo: _malTipo, assTipo: _assTipo, turno, ds, rappDateStr: _rappDateStr },
  };
  if (!assenzeText.trim()) {
    // Tutte le esistenti diventano deletes
    for (const v of _esistenti) {
      ops.deletes.push({ id: v.id, nome: v.nome, motivo: 'campo assenze vuoto' });
    }
    return ops;
  }
  const _nomiProcessati = new Set();
  const _usedEsistentiIds = new Set();
  const righe = assenzeText.split('\n').filter((r) => r.trim());
  for (const rigaIntera of righe) {
    // Ogni riga puo' contenere piu' persone separate da virgola o punto e virgola: si valuta
    // ogni frammento da solo, cosi' "Rossi ferie, Bianchi malato" non perde piu' Bianchi
    const frammenti = rigaIntera.split(/\s*[;,]\s*/).filter((f) => f.trim());
    let _nomeNellaRiga = false;
    for (const riga of frammenti) {
      const _rigaPulita = riga.replace(/([a-zà-ü])(dal\s|fino\s)/gi, '$1 $2');
      const voci = _vociAssenzaDaFrammento(riga, _rigaPulita);
      // null = assenza non per malattia (ferie, permesso...) o segnaposto: si ignora senza errore
      if (voci === null) continue;
      if (voci.length) _nomeNellaRiga = true;
      // seguito della frase di prima, senza nomi e senza date («Oggi ha chiamato Rossi, non sta
      // bene»): non e un frammento da controllare a mano
      else if (_nomeNellaRiga && !/\d/.test(riga)) continue;
      if (!voci.length) {
        // Prima il frammento spariva in silenzio: ora chi compila lo vede e lo controlla a mano
        ops.errors.push({
          nome: riga.substring(0, 40),
          motivo: 'frammento non riconosciuto, controllare a mano',
          riga,
        });
        continue;
      }
      for (const m of voci) {
        const nome = capitalizzaNome(m[1].trim());
        const isCodice = !!m[3] && /^[a-zA-Z]$/.test(m[3]);
        const codiceNum = m[4] ? parseInt(m[4]) : 0;
        // periodo scritto nel frammento (giorni senza mese o anno letti vicino al rapporto)
        const _per = _rappPeriodoFrammento(riga, _rigaPulita, ds);
        let dataInizio = _per.inizio,
          dataFine = _per.fine;
        // OMONIMI: chi ha gia la registrazione di questo rapporto vale come scelta
        let _sc = scegliCollaboratore(
          nome,
          _esistenti.map((e) => e.nome),
          scelte,
        );
        // NOME AL CONTRARIO («Chiara Bianchi» = Bianchi Chiara, «Marco De Lima» = De Lima
        // Marco); se non c e nessuno in anagrafica non si crea niente (riverifica 2 A-R2: prima
        // nasceva una registrazione «Pinco Pallino» che il Piano non conosce)
        if (!_sc) {
          const pz = nome.split(/\s+/).filter(Boolean);
          if (pz.length >= 2)
            for (const inv of [pz.slice(1).concat(pz[0]), [pz[pz.length - 1]].concat(pz.slice(0, -1))]) {
              _sc = scegliCollaboratore(
                inv.join(' '),
                _esistenti.map((e) => e.nome),
                scelte,
              );
              if (_sc) break;
            }
        }
        if (!_sc) {
          _nomiProcessati.add(nome.toLowerCase());
          ops.errors.push({ nome: nome, motivo: 'non in anagrafica: nessuna registrazione creata', riga });
          continue;
        }
        if (_sc && _sc.ambigui) {
          if (!ops.ambigui.some((a) => a.testo.toLowerCase() === nome.toLowerCase()))
            ops.ambigui.push({ testo: nome, nomi: _sc.ambigui });
          continue;
        }
        if (_sc && _sc.nome === '') {
          ops.errors.push({ nome: nome, motivo: 'nome da chiarire: più collaboratori con questo nome', riga });
          continue;
        }
        const nomeFinale = (_sc && _sc.nome) || capitalizzaNome(nome);
        // === D7: VALIDAZIONE DATE === (niente piu scambio silenzioso: una data che non si
        // capisce e un avviso, e la registrazione che c e gia resta com e, non si stacca)
        if (_per.errore) {
          _nomiProcessati.add(nomeFinale.toLowerCase());
          ops.errors.push({ nome: nomeFinale, motivo: _per.errore, riga });
          continue;
        }
        const _oggi = new Date();
        _oggi.setHours(12, 0, 0, 0);
        const _maxFuturo = new Date(_oggi);
        _maxFuturo.setDate(_maxFuturo.getDate() + 365);
        const _maxPassato = new Date(_oggi);
        _maxPassato.setDate(_maxPassato.getDate() - 180);
        // i limiti servono a fermare una data scritta male nel testo del Rapporto; una M o
        // una ASS messa nel calendario del Piano ha il giorno giusto (riverifica D-N1: un mese
        // corretto piu di 6 mesi dopo restava solo nel Piano)
        const _dalPiano =
          typeof window !== 'undefined' &&
          !!window._rapportoDalPiano &&
          window._rapportoDalPianoNome === nomeFinale.toLowerCase();
        if (!_dalPiano && dataInizio > _maxFuturo) {
          _nomiProcessati.add(nomeFinale.toLowerCase());
          ops.errors.push({
            nome: nomeFinale,
            motivo: 'data inizio oltre 12 mesi nel futuro (' + dataInizio.toLocaleDateString('it-IT') + ')',
            riga,
          });
          continue;
        }
        if (!_dalPiano && dataFine < _maxPassato) {
          _nomiProcessati.add(nomeFinale.toLowerCase());
          ops.errors.push({
            nome: nomeFinale,
            motivo: 'data fine oltre 6 mesi nel passato (' + dataFine.toLocaleDateString('it-IT') + ')',
            riga,
          });
          continue;
        }
        const nGiorni = Math.round((dataFine - dataInizio) / 86400000) + 1;
        if (nGiorni > 180) {
          _nomiProcessati.add(nomeFinale.toLowerCase());
          ops.errors.push({
            nome: nomeFinale,
            motivo: 'periodo troppo lungo (' + nGiorni + ' giorni): controlla le date',
            riga,
          });
          continue;
        }
        const dalStr = dataInizio.toLocaleDateString('it-IT'),
          alStr = dataFine.toLocaleDateString('it-IT');
        const codeTxt = isCodice ? ' (' + m[2].toUpperCase() + ')' : '';
        // tipo: quello della registrazione gia esistente, altrimenti Assenza (Malattia solo
        // con il certificato scritto nel frammento)
        const _esisteT = _esistenti.find(
          (e) => e.nome.toLowerCase() === nomeFinale.toLowerCase() && !_usedEsistentiIds.has(e.id),
        );
        const conCert = _rapportoConCertificato(riga);
        const tipoVoce = _esisteT ? _esisteT.tipo : conCert ? _malTipo : _assTipo;
        const prefisso =
          tipoVoce === _assTipo
            ? 'Assente (attesa certificato)'
            : 'Assente per malattia' + (conCert ? ' con certificato' : '');
        let testo =
          nGiorni > 1
            ? prefisso + codeTxt + ' dal ' + dalStr + ' al ' + alStr + ' (' + nGiorni + ' giorni, ' + _rapLabel + ')'
            : // un giorno solo: si scrive la data SEMPRE quando non e' il giorno del
              // rapporto (es. "domani"), altrimenti l'assenza risulterebbe datata al
              // giorno del rapporto e la copertura, registrata sul giorno vero, non
              // verrebbe piu' collegata
              prefisso +
              codeTxt +
              (dalStr !== new Date(ds + 'T12:00:00').toLocaleDateString('it-IT') ? ' dal ' + dalStr : '') +
              ' (' +
              _rapLabel +
              ')';
        _nomiProcessati.add(nomeFinale.toLowerCase());
        // assenza gia NON GIUSTIFICATA (Certificato non ricevuto): il contrassegno resta (lo
        // mette e lo toglie solo l HR, da assenze.js)
        if (_esisteT && _esisteT.tipo === _assTipo && typeof _assNgGiorniReg === 'function') {
          const _ngE = _assNgGiorniReg(_esisteT);
          if (_ngE.length) {
            const _recN = Object.assign({}, _esisteT, { testo: testo });
            testo = _assNgTestoReg(testo, _ngE, _assGiorniPropri(_recN));
          }
        }
        const esiste = _esistenti.find(
          (e) => e.nome.toLowerCase() === nomeFinale.toLowerCase() && !_usedEsistentiIds.has(e.id),
        );
        if (esiste) {
          _usedEsistentiIds.add(esiste.id);
          if (esiste.testo !== testo) {
            ops.updates.push({
              id: esiste.id,
              nome: nomeFinale,
              vecchioTesto: esiste.testo,
              nuovoTesto: testo,
              nGiorni,
            });
          }
          // else: no-op
        } else {
          // Cross-rapporto dedup: include ANCHE record manuali (per evitare duplicati visivi)
          // GIA REGISTRATA: tutti i giorni del periodo sono gia coperti da una Malattia o
          // Assenza della persona (Diario, altro rapporto, Piano; le righe «un giorno per riga»
          // contano il loro giorno). Prima valeva solo lo stesso identico periodo: una Malattia
          // del Diario e «assente domani» nel Rapporto davano due registrazioni (A19).
          const _giorniNuovi = [];
          for (let d = new Date(dataInizio); d <= dataFine && _giorniNuovi.length < 400; d.setDate(d.getDate() + 1))
            _giorniNuovi.push(dataLocaleISO(d));
          const _coperti = new Set();
          let _giaInAltro = null;
          datiCache.forEach((e) => {
            if (!_eTipoAss(e.tipo) || e.eliminato) return;
            if (e.nome.toLowerCase() !== nomeFinale.toLowerCase()) return;
            if ((e.reparto_dip || currentReparto) !== currentReparto) return;
            if (_recIsCurrentRapporto(e, _rapLabel, _rapLabelOld, ds)) return;
            let gg;
            if (typeof _pianoGiorniRegistrazione === 'function') gg = _pianoGiorniRegistrazione(e.testo || '', e.data);
            else {
              const r = _getRangeMalattiaRec(e);
              gg = r ? [r.i, r.f] : [];
            }
            const qui = gg.filter((d) => _giorniNuovi.includes(d));
            if (!qui.length) return;
            qui.forEach((d) => _coperti.add(d));
            if (!_giaInAltro) _giaInAltro = e;
          });
          // REGISTRATA DAL DIARIO (A9): la voce l ha scritta il Diario (origine 'diario|...'): niente
          // da creare e niente avviso. Se nel Rapporto le date sono state cambiate e non coincidono
          // piu, niente doppione: si dice di correggere dal Diario.
          const _dalDiario = datiCache.find(
            (e) =>
              !e.eliminato &&
              _eTipoAss(e.tipo) &&
              /^diario\|/.test(e.origine || '') &&
              e.nome.toLowerCase() === nomeFinale.toLowerCase() &&
              (e.reparto_dip || currentReparto) === currentReparto &&
              e.origine === 'diario|' + turno + '|' + ds,
          );
          if (_dalDiario) {
            if (!_giorniNuovi.every((d) => _coperti.has(d)))
              ops.skipped.push({
                nome: nomeFinale,
                motivo: 'registrata dal Diario con altre date: per cambiarle usa il Diario',
                existingId: _dalDiario.id,
              });
            continue;
          }
          if (_giaInAltro && !_giorniNuovi.every((d) => _coperti.has(d))) _giaInAltro = null;
          if (_giaInAltro) {
            let _motivo;
            if (!/da rapporto (PRESTO|NOTTE)/.test(_giaInAltro.testo || '')) {
              _motivo = 'già registrata nel Diario (' + _giaInAltro.tipo + ')';
            } else if (_giaInAltro.origine === 'manual') {
              _motivo = 'già inserita manualmente';
            } else {
              const _refMatch = (_giaInAltro.testo || '').match(
                /da rapporto (PRESTO|NOTTE)(?:\s+del\s+(\d{2}\/\d{2}\/\d{4}))?/,
              );
              const _refTxt = _refMatch
                ? _refMatch[1] + (_refMatch[2] ? ' del ' + _refMatch[2] : '')
                : 'altro rapporto';
              _motivo = 'già documentata nel rapporto ' + _refTxt;
            }
            ops.skipped.push({ nome: nomeFinale, motivo: _motivo, existingId: _giaInAltro.id });
            continue;
          }
          // Nuovo record da creare
          const _now = new Date();
          const _evtDate = new Date(
            ds +
              'T' +
              String(_now.getHours()).padStart(2, '0') +
              ':' +
              String(_now.getMinutes()).padStart(2, '0') +
              ':' +
              String(_now.getSeconds()).padStart(2, '0'),
          ).toISOString();
          ops.creates.push({
            nome: nomeFinale,
            nGiorni,
            dataInizio,
            dataFine,
            record: {
              id: Date.now() + Math.floor(Math.random() * 1000),
              nome: nomeFinale,
              tipo: tipoVoce,
              testo,
              data: _evtDate,
              operatore: getOperatore(),
              reparto_dip: currentReparto,
              origine: 'rapporto',
            },
          });
        }
      }
    }
  }
  // Cleanup orfani: nomi non più nel campo assenze diventano deletes
  for (const v of _esistenti) {
    if (!_nomiProcessati.has((v.nome || '').toLowerCase())) {
      ops.deletes.push({ id: v.id, nome: v.nome, motivo: 'rimosso dal campo assenze' });
    }
  }
  return ops;
}
// === SCRITTURA IN UN UNICA TRANSAZIONE (controllo 23/10 D12) ===============================
// Il Diario (registrazioni nuove, corrette, staccate dal Rapporto) e il Piano (M/ASS) si scrivono
// insieme con rapporto_assenze_scrivi (migrazione 20260930_a): tutto o niente, con i controlli di
// sempre (permessi e settori del canale sicuro, piano_scrivi_celle per le celle). Prima erano
// scritture una per una: un errore a meta lasciava il Diario scritto e il Piano no.
// Database senza la funzione: la strada di prima (una per una), detta solo nella console.
let _rapportoAtomicaManca = false;
// operazioni del Diario per la funzione (logica pura, test/rapporto-atomico.test.js).
// cache: le registrazioni in memoria (testo come le ha lette chi scrive: se nel database e
// cambiato nel frattempo, niente e scritto)
function _rapportoOpsDiario(creates, updates, staccate, cache, conOrigine) {
  const trova = (id) => (cache || []).find((e) => e.id === id);
  const out = [];
  for (const d of staccate || []) {
    const rec = trova(d.id);
    if (!rec) continue;
    const dati = { testo: String(rec.testo || '').replace(/\bda rapporto (PRESTO|NOTTE)/, 'tolta dal rapporto $1') };
    if (conOrigine) dati.origine = 'manual';
    out.push({ action: 'update', id: d.id, atteso_testo: rec.testo == null ? '' : rec.testo, data: dati, staccata: d });
  }
  for (const c of creates || []) {
    const rec = Object.assign({}, c.record);
    if (!conOrigine) delete rec.origine;
    out.push({ action: 'create', data: rec, create: c });
  }
  for (const u of updates || []) {
    const rec = trova(u.id);
    out.push({
      action: 'update',
      id: u.id,
      atteso_testo: rec ? (rec.testo == null ? '' : rec.testo) : u.vecchioTesto || '',
      data: { testo: u.nuovoTesto },
      update: u,
    });
  }
  return out;
}
// celle del piano di piu assenze in una lista sola, con dove comincia quella di ognuna. La stessa
// cella da due assenze (stessa persona, giorni sovrapposti) e un errore: niente si scrive
function _rapportoUnisciCelle(liste) {
  const ops = [];
  const da = [];
  const viste = new Map();
  (liste || []).forEach((l, n) => {
    da.push(ops.length);
    (l || []).forEach((o) => {
      const k = o.collaboratore + '|' + String(o.data).substring(0, 10);
      if (viste.has(k))
        throw new Error(
          'la stessa cella del piano (' +
            o.collaboratore +
            ' ' +
            String(o.data).substring(0, 10).split('-').reverse().join('.') +
            ') viene da due assenze diverse: correggi le date nel rapporto',
        );
      viste.set(k, n);
      ops.push(o);
    });
  });
  return { ops: ops, da: da };
}
const _rappSenzaCampi = (o) => {
  const x = Object.assign({}, o);
  delete x.staccata;
  delete x.create;
  delete x.update;
  return x;
};
// Ritorna null se la funzione non c e (si usa la strada di prima), altrimenti
// { salvate, result, staccate } con cio che il database ha salvato (tutto). Lancia se niente
// e stato scritto (errore del database, cella o registrazione cambiata da un collega).
async function _rapportoScriviAtomico(ops, staccate, ds, turno) {
  if (_rapportoAtomicaManca || !getOpToken()) return null;
  const conPiano = typeof sincronizzaMalattiaPiano === 'function';
  const assTipo = ops.meta && ops.meta.assTipo;
  // 1. le celle del piano, preparate come le scrive il Diario (nessuna scrittura qui)
  const prep = [];
  if (conPiano) {
    for (const c of ops.creates) {
      const x = await sincronizzaMalattiaPiano(c.nome, '', c.record.data, c.record.testo || '', {
        soloPrepara: true,
        codice: c.record.tipo === assTipo ? 'ASS' : undefined,
      });
      if (x) prep.push(x);
    }
    for (const u of ops.updates) {
      const rec = datiCache.find((x) => x.id === u.id);
      const x = await sincronizzaMalattiaPiano(u.nome, u.vecchioTesto || '', rec ? rec.data : '', u.nuovoTesto || '', {
        soloPrepara: true,
        codice: rec && rec.tipo === assTipo ? 'ASS' : undefined,
      });
      if (x) prep.push(x);
    }
  }
  const regOps = _rapportoOpsDiario(ops.creates, ops.updates, staccate, datiCache, _origineSchemaSupported);
  let celle = _rapportoUnisciCelle(prep.map((x) => x.ops));
  const chiama = () =>
    _conSessione(
      (t) =>
        _rpcSicura('rapporto_assenze_scrivi', {
          p_token: t,
          p_reg: regOps.map(_rappSenzaCampi),
          p_piano: celle.ops,
        }),
      getOpToken(),
      true, // rete caduta: niente secondo tentativo alla cieca (la prima potrebbe essere arrivata)
    );
  let es;
  for (let giro = 0; ; giro++) {
    try {
      es = await chiama();
    } catch (e) {
      if (typeof _pianoErroreFunzioneAssente === 'function' && _pianoErroreFunzioneAssente(e)) {
        _rapportoAtomicaManca = true;
        console.warn('rapporto_assenze_scrivi assente (migrazione 20260930_a): scrittura una per una');
        return null;
      }
      throw e;
    }
    if (!es || typeof es.ok !== 'boolean') throw new Error('il database non ha confermato il salvataggio');
    if (es.ok) break;
    const conf = es.conflitti || [];
    const diReg = conf.filter((c) => c && c.registrazione != null);
    if (diReg.length) {
      const nomi = diReg.map((c) => {
        const r = regOps.find((o) => o.id === c.registrazione);
        return (r && ((r.update && r.update.nome) || (r.staccata && r.staccata.nome))) || 'una registrazione';
      });
      throw new Error(
        'nel frattempo ' + nomi.join(', ') + ' è stata cambiata da un collega nel Diario: ricarica e riprova',
      );
    }
    // una cella del piano cambiata fra la lettura e la scrittura: si rilegge e si riprova UNA
    // volta (la malattia prevale, la nota "Ex" prende la sigla nuova), come dal Diario
    if (giro >= 1 || !prep.length)
      throw new Error(
        'il piano è cambiato mentre salvavi: ' +
          conf
            .map((c) => (typeof _pianoConflittoTesto === 'function' ? _pianoConflittoTesto(c) : c.collaboratore))
            .join('; '),
      );
    for (const x of prep) await x.riprepara();
    celle = _rapportoUnisciCelle(prep.map((x) => x.ops));
  }
  // 2. salvato tutto: la memoria e l Annulla (un passo con la registrazione, come dal Diario)
  const salvate = { creates: [], updates: [], deletes: [] };
  const result = { created_ids: es.created_ids || [], created: 0, updated: 0, deleted: 0 };
  const righe = es.righe || [];
  const staccateOk = [];
  let iC = 0;
  let iU = 0;
  regOps.forEach((o) => {
    if (o.action === 'create') {
      salvate.creates.push({ c: o.create, id: (es.created_ids || [])[iC] });
      iC++;
      result.created++;
    } else {
      const dopo = (es.dopo || [])[iU];
      const rec = datiCache.find((x) => x.id === o.id);
      if (rec) Object.assign(rec, o.data);
      if (window.Annulla && typeof window.Annulla.conferma === 'function' && (es.prima || [])[iU])
        window.Annulla.conferma({ tipo: 'patch', table: 'registrazioni', prima: [es.prima[iU]], dati: o.data });
      iU++;
      if (o.update) {
        salvate.updates.push(o.update);
        result.updated++;
      }
      if (o.staccata && dopo !== undefined) staccateOk.push(o.staccata);
    }
  });
  if (window.Annulla && typeof window.Annulla.dopoPost === 'function' && righe.length)
    window.Annulla.dopoPost('registrazioni', righe);
  // le righe di registro dopo l Annulla (la prima chiude il passo: tutto in uno)
  for (const d of staccateOk) {
    toast(d.nome + ' tolto dal Rapporto: nel Diario la registrazione resta');
    try {
      logAzione('Tolto dal rapporto (Diario invariato)', d.nome + ' · rapporto ' + turno + ' del ' + ds);
    } catch (_) {}
  }
  // 3. il piano: memoria, recuperi CGF, avvisi e registro di ogni assenza (dopo la scrittura)
  if (prep.length) {
    if (typeof _pianoPassoRegistra === 'function') _pianoPassoRegistra(celle.ops, es.fine);
    for (let n = 0; n < prep.length; n++) {
      const a = celle.da[n];
      const b = n + 1 < prep.length ? celle.da[n + 1] : celle.ops.length;
      try {
        await prep[n].dopo({ ok: true, ops: celle.ops.slice(a, b), righe: (es.piano || []).slice(a, b) });
      } catch (e) {
        toastErrore('Piano: aggiornamento dopo il salvataggio non riuscito (' + ((e && e.message) || e) + ')');
      }
    }
  }
  return { salvate: salvate, result: result };
}
// === EXECUTE: applica le operazioni (una transazione, ripiego REST) + D4 audit ===
async function _eseguiAssenzeOps(ops, ds, turno) {
  // D7: notifica errori validazione (non bloccanti, gli altri op vanno avanti)
  for (const e of ops.errors) {
    // una volta per frase (il rapporto si salva mentre si scrive: prima lo stesso avviso
    // tornava a ogni salvataggio, A22)
    const _msg = 'Attenzione · ' + e.nome + ': ' + e.motivo;
    if (typeof _avvisoUnaVolta === 'function')
      _avvisoUnaVolta('ass|' + ds + '|' + turno + '|' + (e.riga || '') + '|' + e.motivo, _msg);
    else toast(_msg);
    try {
      logAzione('Validazione assenza fallita', e.nome + ' - ' + e.motivo + ' (rapporto ' + turno + ' del ' + ds + ')');
    } catch (_) {}
  }
  // TOLTE DAL RAPPORTO: il Diario resta (regola del titolare). La registrazione si
  // stacca dal Rapporto: nel testo "da rapporto" diventa "tolta dal rapporto" e non
  // viene piu aggiornata dal Rapporto; un avviso lo dice.
  const staccate = ops.deletes;
  ops.deletes = [];
  let result = { created_ids: [], created: 0, updated: 0, deleted: 0 };
  // cio che il database ha DAVVERO salvato: solo questo entra in memoria, nel
  // registro e nel Piano (creates con l id vero dato dal database)
  let salvate = { creates: [], updates: [], deletes: [] };
  const falliti = []; // nomi delle operazioni che il database non ha salvato
  let usedFallback = false;
  let pianoFatto = false; // celle del piano gia scritte nella stessa transazione
  if (staccate.length || ops.creates.length || ops.updates.length) {
    let at = null;
    try {
      at = await _rapportoScriviAtomico(ops, staccate, ds, turno);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      console.error('rapporto_assenze_scrivi:', msg);
      toastErrore('Assenze del rapporto NON salvate (Diario e Piano come prima): ' + msg, 9000);
      try {
        logAzione('Assenze da rapporto non salvate', msg + ' (rapporto ' + turno + ' del ' + ds + ')');
      } catch (_) {}
      return { ok: false, errori: ops.errors, falliti: ['tutte (' + msg + ')'] };
    }
    if (at) {
      salvate = at.salvate;
      result = at.result;
      pianoFatto = true;
    } else usedFallback = true;
  }
  if (usedFallback) {
    for (const d of staccate) {
      const rec = datiCache.find((e) => e.id === d.id);
      if (!rec) continue;
      const nuovoTesto = String(rec.testo || '').replace(/\bda rapporto (PRESTO|NOTTE)/, 'tolta dal rapporto $1');
      const patch = { testo: nuovoTesto };
      if (_origineSchemaSupported) patch.origine = 'manual';
      try {
        await secPatch('registrazioni', 'id=eq.' + d.id, patch);
      } catch (e) {
        try {
          await secPatch('registrazioni', 'id=eq.' + d.id, { testo: nuovoTesto });
        } catch (e2) {
          toastErrore(d.nome + ': non staccata dal Rapporto, ' + (e2.message || 'errore del database'));
          continue;
        }
      }
      Object.assign(rec, patch);
      toast(d.nome + ' tolto dal Rapporto: nel Diario la registrazione resta');
      try {
        logAzione('Tolto dal rapporto (Diario invariato)', d.nome + ' · rapporto ' + turno + ' del ' + ds);
      } catch (_) {}
    }
  }
  const totaleDb = ops.creates.length + ops.updates.length + ops.deletes.length;
  if (totaleDb === 0 && ops.skipped.length === 0) return;
  if (usedFallback && totaleDb > 0) {
    // Ripiego: chiamate REST una per una (senza atomicita). Si tiene SOLO cio
    // che il database ha davvero salvato: un errore resta un errore visibile.
    for (const c of ops.creates) {
      let _recToSend = _origineSchemaSupported ? c.record : _stripOrigine(c.record);
      try {
        let _saved;
        try {
          _saved = await secPost('registrazioni', _recToSend);
        } catch (innerErr) {
          const _imsg = (innerErr.message || '').toLowerCase();
          if (_origineSchemaSupported && (_imsg.includes('origine') || _imsg.includes('column'))) {
            _origineSchemaSupported = false;
            _saved = await secPost('registrazioni', _stripOrigine(c.record));
          } else {
            throw innerErr;
          }
        }
        const _id = _saved && _saved[0] && _saved[0].id;
        if (!_id) throw new Error('il database non ha restituito la registrazione');
        salvate.creates.push({ c: c, id: _id });
        result.created++;
      } catch (err) {
        console.error('Fallback create ' + c.nome + ':', err);
        falliti.push(c.nome + ' (creazione)');
      }
    }
    for (const u of ops.updates) {
      try {
        await secPatch('registrazioni', 'id=eq.' + u.id, { testo: u.nuovoTesto });
        salvate.updates.push(u);
        result.updated++;
      } catch (err) {
        console.error('Fallback update ' + u.nome + ':', err);
        falliti.push(u.nome + ' (aggiornamento)');
      }
    }
  }
  // Aggiorna cache locale + audit log
  // CREATES: assegna ID dal DB e unshift in datiCache
  for (const { c, id } of salvate.creates) {
    const fullRec = Object.assign({ id: id }, c.record);
    datiCache.unshift(fullRec);
    try {
      logAzione(
        c.record.tipo === ops.meta.assTipo ? 'Assenza creata da rapporto' : 'Malattia creata da rapporto',
        c.nome +
          ' (' +
          c.nGiorni +
          ' giorni, dal ' +
          c.dataInizio.toLocaleDateString('it-IT') +
          ' al ' +
          c.dataFine.toLocaleDateString('it-IT') +
          ', rapporto ' +
          turno +
          ' del ' +
          ds +
          ')',
      );
    } catch (_) {}
  }
  // UPDATES: patch testo in cache + audit con diff giorni
  for (const u of salvate.updates) {
    const cached = datiCache.find((x) => x.id === u.id);
    if (cached) cached.testo = u.nuovoTesto;
    const _vecchiGiorniMatch = (u.vecchioTesto || '').match(/\((\d+) giorni/);
    const _vecchiGiorni = _vecchiGiorniMatch ? parseInt(_vecchiGiorniMatch[1]) : null;
    const _diff =
      _vecchiGiorni && _vecchiGiorni !== u.nGiorni
        ? ' (' +
          (u.nGiorni > _vecchiGiorni ? 'esteso' : 'ridotto') +
          ' da ' +
          _vecchiGiorni +
          ' a ' +
          u.nGiorni +
          ' giorni)'
        : '';
    try {
      logAzione('Malattia aggiornata da rapporto', u.nome + _diff + ' (rapporto ' + turno + ' del ' + ds + ')');
    } catch (_) {}
  }
  // DELETES: rimuovi da cache + audit
  for (const d of salvate.deletes) {
    datiCache = datiCache.filter((x) => x.id !== d.id);
    _diarioTogliArchivioLeggero(d.id);
    try {
      logAzione(
        'Malattia eliminata da rapporto',
        d.nome + ' (' + d.motivo + ', rapporto ' + turno + ' del ' + ds + ')',
      );
    } catch (_) {}
  }
  // PIANO: la malattia scritta nel Rapporto scrive le M nel Piano come quella registrata
  // nel Diario (nota "Ex C0 - operatore", recuperi CGF, festivi persi)
  if (!pianoFatto && typeof sincronizzaMalattiaPiano === 'function') {
    for (const { c } of salvate.creates) {
      try {
        await sincronizzaMalattiaPiano(
          c.nome,
          '',
          c.record.data,
          c.record.testo || '',
          c.record.tipo === ops.meta.assTipo ? { codice: 'ASS' } : undefined,
        );
      } catch (e) {
        toastErrore(c.nome + ': piano non allineato alla malattia (' + ((e && e.message) || e) + ')');
      }
    }
    for (const u of salvate.updates) {
      try {
        const rec = datiCache.find((x) => x.id === u.id);
        // si salva mentre si scrive: nessuna finestra (una copertura da togliere diventa un avviso)
        await sincronizzaMalattiaPiano(u.nome, u.vecchioTesto || '', rec ? rec.data : '', u.nuovoTesto || '', {
          senzaDomande: true,
          codice: rec && rec.tipo === ops.meta.assTipo ? 'ASS' : undefined,
        });
        // malattia corretta: l avviso dei turni da coprire segue le date nuove
        const nuove =
          typeof _pianoDateMalattia === 'function' && u.nuovoTesto
            ? _pianoDateMalattia(u.nuovoTesto, rec ? rec.data : '')
            : [];
        if (nuove.length && typeof _pianoAvvisoCopertura === 'function')
          _pianoAvvisoCopertura(u.nome, nuove[0], nuove[nuove.length - 1]).catch(() => {});
      } catch (e) {
        toastErrore(u.nome + ': piano non allineato alla malattia (' + ((e && e.message) || e) + ')');
      }
    }
  }
  // SKIPPED: solo audit + toast
  for (const s of ops.skipped) {
    if (typeof _avvisoUnaVolta === 'function')
      _avvisoUnaVolta('ass-dup|' + ds + '|' + turno + '|' + s.existingId, s.nome + ': ' + s.motivo + ', non duplicato');
    else toast(s.nome + ': ' + s.motivo + ', non duplicato');
    try {
      logAzione(
        'Duplicato cross-rapporto saltato',
        s.nome + ': ' + s.motivo + ' (rapporto ' + turno + ' del ' + ds + ')',
      );
    } catch (_) {}
  }
  // Toast riepilogo
  // testo per chi usa il programma (prima «Assenze: 1 create (modalità compatibilita)»,
  // controllo 23/10 D12); il modo di scrittura resta solo nella console
  const summary = [];
  const nn = (n, uno, piu) => n + ' ' + (n === 1 ? uno : piu);
  if (result.created) summary.push(nn(result.created, 'registrata', 'registrate'));
  if (result.updated) summary.push(nn(result.updated, 'corretta', 'corrette'));
  if (result.deleted) summary.push(nn(result.deleted, 'tolta', 'tolte'));
  if (ops.skipped.length) summary.push(nn(ops.skipped.length, 'già presente', 'già presenti'));
  if (usedFallback) console.info('assenze del rapporto: scrittura una per una (REST)');
  if (summary.length) toast('Assenze nel Diario: ' + summary.join(', '));
  // per ultimo, perche nessun altro avviso lo copra
  if (falliti.length) {
    toastErrore('Assenze NON salvate per: ' + falliti.join(', ') + '. Riprova a salvare il rapporto.', 9000);
    try {
      logAzione('Assenze da rapporto non salvate', falliti.join(', ') + ' (rapporto ' + turno + ' del ' + ds + ')');
    } catch (_) {}
  }
  // Popup copertura per ogni NUOVA assenza creata dal rapporto (in sequenza); non quando
  // l assenza arriva dal Piano (M o Copertura malattia: la copertura e gia decisa li)
  if (salvate.creates.length && typeof apriPopupCopertura === 'function' && !window._rapportoDalPiano) {
    for (const { c } of salvate.creates) {
      const dIso =
        c.dataInizio instanceof Date
          ? c.dataInizio.getFullYear() +
            '-' +
            String(c.dataInizio.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(c.dataInizio.getDate()).padStart(2, '0')
          : ds;
      // MAI UNA FINESTRA dal Rapporto (si salva da solo mentre si scrive): un avviso discreto
      // nella pagina con i turni da coprire o i punti (decisione del titolare 15.10)
      const dFine =
        c.dataFine instanceof Date
          ? c.dataFine.getFullYear() +
            '-' +
            String(c.dataFine.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(c.dataFine.getDate()).padStart(2, '0')
          : dIso;
      if (typeof _pianoAvvisoCopertura === 'function') _pianoAvvisoCopertura(c.nome, dIso, dFine).catch(() => {});
      else await apriPopupCopertura(c.nome, dIso);
    }
  }
  // esito per chi scrive dal Piano (D-N1): con un errore niente «registrata anche nel Diario»
  return { ok: !falliti.length && !ops.errors.length, errori: ops.errors, falliti: falliti };
}
// === ORCHESTRATOR ===
async function _processaAssenzeRapporto(assenzeText, ds, turno) {
  let ops = _analizzaAssenzeRapporto(assenzeText, ds, turno);
  // nomi ambigui (due "Somma"): si chiede una volta per nome, poi si rifa l analisi
  if (ops.ambigui.length) {
    const scelte = {};
    for (const a of ops.ambigui)
      scelte[a.testo.toLowerCase()] =
        (await chiediOmonimo(
          a.testo,
          a.nomi,
          'nelle assenze del rapporto',
          'ass|' + ds + '|' + turno + '|' + a.testo.toLowerCase(),
        )) || '';
    ops = _analizzaAssenzeRapporto(assenzeText, ds, turno, scelte);
  }
  const esito = await _eseguiAssenzeOps(ops, ds, turno);
  await _rapportoStaccaDalDiario(assenzeText, ds, turno);
  return esito || { ok: true, errori: [], falliti: [] };
}
// VOCE SCRITTA DAL DIARIO E TOLTA DAL RAPPORTO (A9): il Diario resta (come per le assenze nate
// nel Rapporto) e il collegamento si toglie, cosi una cancellazione futura nel Diario non tocca
// piu questo Rapporto
async function _rapportoStaccaDalDiario(assenzeText, ds, turno) {
  const orig = 'diario|' + turno + '|' + ds;
  const via = datiCache.filter(
    (e) =>
      !e.eliminato &&
      e.origine === orig &&
      (e.reparto_dip || currentReparto) === currentReparto &&
      !_rapportoParolaNome(assenzeText || '', e.nome),
  );
  const nomi = new Set();
  for (const e of via) {
    try {
      await secPatch('registrazioni', 'id=eq.' + e.id, { origine: 'manual' });
      e.origine = 'manual';
      nomi.add(e.nome);
    } catch (er) {
      console.error('rapporto: stacca dal diario', er);
    }
  }
  nomi.forEach((n) => toast(n + ' tolto dal Rapporto: nel Diario la registrazione resta'));
}
// =================================================================================
// un salvataggio alla volta: il doppio click creava righe doppie (unaVoltaSola in utils.js)
// Un salvataggio alla volta per giorno e turno. Se si scrive mentre il precedente e in
// corso (o aspetta una conferma), le modifiche nuove si salvano SUBITO DOPO: prima venivano
// scartate e la scritta diceva comunque "Salvato".
const _rappDaRisalvare = {};
function salvaRapportoTurno(ds, turno, cls) {
  const k = 'rapporto-salva|' + ds + '|' + turno;
  if (_salvataggiInCorso.has(k)) {
    _rappDaRisalvare[k] = cls;
    return new Promise((ok) => {
      const aspetta = () => (_salvataggiInCorso.has(k) || _rappDaRisalvare[k] ? setTimeout(aspetta, 300) : ok(true));
      setTimeout(aspetta, 300);
    });
  }
  return unaVoltaSola(k, async () => {
    let esito = await _salvaRapportoTurnoEsegui(ds, turno, cls);
    while (_rappDaRisalvare[k]) {
      const c = _rappDaRisalvare[k];
      delete _rappDaRisalvare[k];
      esito = await _salvaRapportoTurnoEsegui(ds, turno, c);
    }
    return esito;
  });
}
// RAPPORTO DA DUE PC: ogni PC ricorda i valori dei campi come li ha caricati (o salvati
// l ultima volta). Salvando si rilegge la riga dal database e si scrivono SOLO i campi
// cambiati su questo PC; gli altri restano come li ha lasciati il collega. Prima si
// mandavano tutti i campi del modulo e chi salvava per ultimo cancellava i testi dell altro.
const _rappBase = {};
function _rappBaseChiave(ds, turno) {
  return ds + '|' + currentReparto + '|' + turno;
}
function _rappValore(c, v) {
  if (c.type === 'number') return parseInt(v) || 0;
  return v == null ? '' : String(v);
}
// valori dei campi di una riga del database (colonne + note_extra)
function _rappValoriRiga(riga) {
  const out = {};
  if (!riga) return out;
  let extra = {};
  try {
    extra = JSON.parse(riga.note_extra || '{}') || {};
  } catch (e) {}
  getCampiRapporto().forEach((c) => {
    const v = RAPPORTO_DB_COLS.includes(c.key) ? riga[c.key] : extra[c.key];
    out[c.key] = _rappValore(c, v);
  });
  return out;
}
function _rappSegnaBase(ds, turno, riga) {
  _rappBase[_rappBaseChiave(ds, turno)] = _rappValoriRiga(riga || {});
}
// unione a tre: base (caricato qui), mio (modulo), suo (database adesso)
function _rappUnisciTre(campi, base, mio, suo) {
  const valori = {};
  const conflitti = [];
  campi.forEach((c) => {
    const k = c.key;
    if (!(k in mio)) {
      // campo non presente nel modulo: resta quello del database
      if (k in suo) valori[k] = suo[k];
      return;
    }
    const b = k in base ? base[k] : _rappValore(c, '');
    const m = mio[k];
    const s = k in suo ? suo[k] : b;
    if (m === b)
      valori[k] = s; // non toccato qui: vale quello del collega
    else if (s === b || s === m)
      valori[k] = m; // toccato solo qui
    else {
      // cambiato su ENTRAMBI i PC: i testi si uniscono, i numeri restano i miei; si avvisa
      conflitti.push(c.label || k);
      if (c.type === 'number') valori[k] = m;
      else if (b && m.startsWith(b) && s.startsWith(b)) valori[k] = s + m.substring(b.length);
      else if (!s.trim()) valori[k] = m;
      else {
        // RIGA PER RIGA: le righe del collega, senza quelle che ho tolto io, piu quelle che ho
        // aggiunto io. Prima i due testi si mettevano uno dopo l altro e una voce corretta dal
        // Diario (A9) restava due volte, vecchia e nuova.
        const righe = (t) => t.split('\n').filter((x) => x.trim());
        const B = righe(b),
          M = righe(m);
        const tolte = B.filter((x) => !M.includes(x));
        const out = righe(s).filter((x) => !tolte.includes(x));
        M.filter((x) => !B.includes(x) && !out.includes(x)).forEach((x) => out.push(x));
        valori[k] = out.join('\n');
      }
    }
  });
  return { valori, conflitti };
}
async function _salvaRapportoTurnoEsegui(ds, turno, cls) {
  const campi = getCampiRapporto();
  const chiaveBase = _rappBaseChiave(ds, turno);
  const base = _rappBase[chiaveBase] || _rappValoriRiga(_rapportoCacheGet(ds)[turno]);
  const mio = {};
  campi.forEach((c) => {
    const el = document.getElementById(cls + '-' + c.key);
    if (!el) return;
    mio[c.key] = _rappValore(c, el.value);
  });
  let data = null;
  try {
    const filtro = 'data_rapporto=eq.' + ds + '&turno=eq.' + turno + '&reparto_dip=eq.' + currentReparto;
    const leggi = async () => ((await secGet('rapporti_giornalieri?' + filtro)) || [])[0] || null;
    // costruisce la riga da scrivere unendo i valori a quelli del database
    const componi = (suoRiga) => {
      const u = _rappUnisciTre(campi, base, mio, _rappValoriRiga(suoRiga));
      let extraSuo = {};
      try {
        extraSuo = JSON.parse((suoRiga && suoRiga.note_extra) || '{}') || {};
      } catch (e) {}
      const extra = Object.assign({}, extraSuo); // chiavi extra non piu nel modulo: restano
      const riga = {
        data_rapporto: ds,
        turno,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
        reparto_dip: currentReparto,
      };
      campi.forEach((c) => {
        if (!(c.key in u.valori)) return;
        if (RAPPORTO_DB_COLS.includes(c.key)) riga[c.key] = u.valori[c.key];
        else extra[c.key] = u.valori[c.key];
      });
      riga.note_extra = JSON.stringify(extra);
      return { riga, u };
    };
    let suo = await leggi();
    let esito = componi(suo);
    if (suo) {
      await secPatch('rapporti_giornalieri', filtro, esito.riga);
    } else {
      try {
        await secPost('rapporti_giornalieri', esito.riga);
      } catch (e2) {
        if (!/duplicate key|already exists|23505/i.test((e2 && e2.message) || '')) throw e2;
        // un collega ha creato lo stesso rapporto nello stesso momento: si riunisce con il suo
        suo = await leggi();
        esito = componi(suo);
        await secPatch('rapporti_giornalieri', filtro, esito.riga);
      }
    }
    data = Object.assign({}, suo || {}, esito.riga);
    _rappBase[chiaveBase] = _rappValoriRiga(data);
    // il modulo mostra i campi scritti dal collega (e i testi uniti)
    campi.forEach((c) => {
      const el = document.getElementById(cls + '-' + c.key);
      if (!el || !(c.key in esito.u.valori)) return;
      const v = esito.u.valori[c.key];
      if (v !== mio[c.key]) el.value = v;
    });
    if (esito.u.conflitti.length)
      toast(
        'Un collega ha cambiato anche: ' +
          esito.u.conflitti.join(', ') +
          '. I testi sono stati uniti: controlla il rapporto.',
        8000,
      );
    _rapportoCacheSet(ds, turno, data);
    // Auto-malattia: parse assenze field via _processaAssenzeRapporto (analyze + execute)
    // D-Full: D1 origine, D4 audit log, D6 transactional RPC, D7 date validation
    await _processaAssenzeRapporto(data.assenze || '', ds, turno);
    // Auto-differenze cassa: parse differenze_cassa field
    const diffExtra = data.note_extra ? JSON.parse(data.note_extra) : {};
    const diffText = diffExtra.differenze_cassa || '';
    // anche vuoto: chi e stato tolto dal campo si stacca dal Rapporto (resta nel Diario)
    await parseDifferenzeCassa(diffText, ds, turno);
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    return true;
  } catch (e) {
    console.error(e);
    toastErrore('Rapporto NON salvato: ' + ((e && e.message) || e) + '. Riprova.', 8000);
    return false;
  }
}

// RAPPORTO EXPORT
function getRapportoDateRange() {
  const dalEl = document.getElementById('rapp-dal'),
    alEl = document.getElementById('rapp-al');
  if (dalEl && dalEl.value && alEl && alEl.value) return { dal: dalEl.value, al: alEl.value };
  if (rapportoGiornoAperto) return { dal: rapportoGiornoAperto, al: rapportoGiornoAperto };
  const dal = rapportoAnno + '-' + String(rapportoMese + 1).padStart(2, '0') + '-01';
  const ed = new Date(rapportoAnno, rapportoMese + 1, 0).getDate();
  return {
    dal,
    al: rapportoAnno + '-' + String(rapportoMese + 1).padStart(2, '0') + '-' + String(ed).padStart(2, '0'),
  };
}
function _rapportoHaDati(r) {
  if (!r) return false;
  // reparto_dip non e un dato del rapporto (prima ogni riga risultava compilata)
  const skip = ['id', 'data_rapporto', 'turno', 'operatore', 'updated_at', 'created_at', 'reparto_dip'];
  for (const k in r) {
    if (skip.includes(k)) continue;
    const v = r[k];
    if (k === 'note_extra') {
      try {
        const ex = JSON.parse(v || '{}');
        if (Object.values(ex).some((x) => x && String(x).trim())) return true;
      } catch (e) {}
      continue;
    }
    if (v && String(v).trim() && v !== '0' && v !== 0) return true;
  }
  return false;
}
async function fetchRapportiRange(dal, al) {
  const data = await secGet(
    'rapporti_giornalieri?data_rapporto=gte.' +
      dal +
      '&data_rapporto=lte.' +
      al +
      '&reparto_dip=eq.' +
      currentReparto +
      '&order=data_rapporto.asc',
  );
  const byDate = {};
  data.forEach((r) => {
    if (!byDate[r.data_rapporto]) byDate[r.data_rapporto] = {};
    byDate[r.data_rapporto][r.turno] = r;
  });
  // Rimuovi giorni dove entrambi i turni sono vuoti
  Object.keys(byDate).forEach((ds) => {
    const d = byDate[ds];
    if (!_rapportoHaDati(d.PRESTO) && !_rapportoHaDati(d.NOTTE)) delete byDate[ds];
  });
  return byDate;
}
async function esportaRapportoCSV() {
  const { dal, al } = getRapportoDateRange();
  if (dal > al) {
    toastErrore('Date invertite: "Dal" è dopo "Al". Correggi il periodo.');
    return;
  }
  const byDate = await fetchRapportiRange(dal, al);
  const dates = Object.keys(byDate).sort();
  if (!dates.length) {
    toast('Nessun rapporto nel periodo selezionato');
    return;
  }
  const campi = getCampiRapporto();
  const rows = [['Data', 'Campo', 'PRESTO', 'NOTTE']];
  dates.forEach((ds) => {
    const d = new Date(ds + 'T12:00:00');
    const dayLabel = d.toLocaleDateString('it-IT') + ' ' + GIORNI[d.getDay()];
    const p = byDate[ds].PRESTO || {},
      n = byDate[ds].NOTTE || {};
    const extraP = p.note_extra ? JSON.parse(p.note_extra) : {};
    const extraN = n.note_extra ? JSON.parse(n.note_extra) : {};
    campi.forEach((c, i) => {
      const isExtra = !RAPPORTO_DB_COLS.includes(c.key);
      const vP = (isExtra ? extraP[c.key] || '' : p[c.key] || '').toString().replace(/"/g, '""').replace(/\n/g, ' ');
      const vN = (isExtra ? extraN[c.key] || '' : n[c.key] || '').toString().replace(/"/g, '""').replace(/\n/g, ' ');
      rows.push([i === 0 ? '"' + dayLabel + '"' : '', '"' + c.label + '"', '"' + vP + '"', '"' + vN + '"']);
    });
    rows.push(['', '', '', '']);
  });
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'rapporto_' + dal + '_' + al + '.csv',
  }).click();
  toast('CSV esportato!');
}
async function esportaRapportoPDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toastErrore('Non riesco a preparare il PDF: controlla la connessione internet e riprova');
      return;
    }
  }
  const { dal, al } = getRapportoDateRange();
  if (dal > al) {
    toastErrore('Date invertite: "Dal" è dopo "Al". Correggi il periodo.');
    return;
  }
  const byDate = await fetchRapportiRange(dal, al);
  const dates = Object.keys(byDate).sort();
  if (!dates.length) {
    toast('Nessun rapporto nel periodo selezionato');
    return;
  }
  const campi = getCampiRapporto();
  const dalF = new Date(dal + 'T12:00:00').toLocaleDateString('it-IT'),
    alF = new Date(al + 'T12:00:00').toLocaleDateString('it-IT');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Rapporto Giornaliero', 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(identita().azienda + ' · dal ' + dalF + ' al ' + alF, 14, 21);
    doc.setTextColor(0);
    let y = 28;
    dates.forEach((ds) => {
      const d = new Date(ds + 'T12:00:00');
      const dayLabel = d.getDate() + ' ' + MESI_FULL[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + GIORNI[d.getDay()];
      const p = byDate[ds].PRESTO || {},
        n = byDate[ds].NOTTE || {};
      const extraP = p.note_extra ? JSON.parse(p.note_extra) : {};
      const extraN = n.note_extra ? JSON.parse(n.note_extra) : {};
      const body = campi.map((c) => {
        const isExtra = !RAPPORTO_DB_COLS.includes(c.key);
        return [
          c.label,
          (isExtra ? extraP[c.key] || '' : p[c.key] || '').toString(),
          (isExtra ? extraN[c.key] || '' : n[c.key] || '').toString(),
        ];
      });
      const tableH = campi.length * 9 + 18;
      if (y + tableH > doc.internal.pageSize.height - 15) {
        doc.addPage();
        y = 15;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 18, 8);
      doc.text(dayLabel, 14, y);
      doc.setTextColor(0);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        head: [['Campo', 'PRESTO', 'NOTTE']],
        body,
        styles: {
          lineColor: [220, 215, 205],
          lineWidth: 0.15,
          fontSize: 8,
          cellPadding: 3,
          overflow: 'linebreak',
          lineWidth: 0.1,
        },
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { cellWidth: 42, fontStyle: 'bold', fillColor: [245, 243, 238] },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 'auto' },
        },
        alternateRowStyles: { fillColor: [250, 247, 242] },
        margin: { left: 14, right: 14 },
        theme: 'grid',
      });
      y = doc.lastAutoTable.finalY + 10;
    });
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(identita().azienda + ' · Pag. ' + i + '/' + tp, 14, doc.internal.pageSize.height - 8);
    }
    mostraPdfPreview(doc, 'rapporto_' + dal + '_' + al + '.pdf', 'Rapporto ' + dal + ' · ' + al);
  } catch (e) {
    console.error('PDF error:', e);
    toast('Errore generazione PDF: ' + e.message);
  }
}
// ===== DIARIO <-> RAPPORTO =====
// Una registrazione del Diario nata dal Rapporto (assenza o differenza di cassa)
// porta nel testo "da rapporto PRESTO del 30/09/2026". Regole (titolare, 30.09):
//  - cancellata dal Diario -> la persona sparisce anche dal Rapporto di quel giorno;
//  - tolta dal Rapporto -> il Diario resta (la registrazione si stacca dal Rapporto
//    e diventa a se, con un avviso);
//  - modificata nel Diario -> il programma chiede se correggere anche il Rapporto.
function _rapportoOrigineDi(rec) {
  if (!rec || rec.origine === 'manual') return null;
  const m = String(rec.testo || '').match(/da rapporto (PRESTO|NOTTE) del (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const ds = m[4] + '-' + m[3].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const campo =
    rec.tipo === nomeCorrente('Malattia') || rec.tipo === nomeCorrente('Assenza')
      ? 'assenze'
      : /^Differenza cassa/.test(String(rec.testo || ''))
        ? 'differenze_cassa'
        : '';
  if (!campo) return null;
  return { turno: m[1], ds: ds, campo: campo, reparto: rec.reparto_dip || currentReparto };
}
// LA PERSONA NEL TESTO DEL RAPPORTO (riverifica A-N1, 23/10): il testo con cui il Rapporto
// nomina il collaboratore «nome», come e scritto li; '' se non lo nomina. Vale il nome intero
// (anche al contrario: «Chiara Clemente») oppure una parola del nome che in anagrafica e solo
// sua (cognome unico). Una parola in comune con un collega non basta: prima bastava una
// parola qualsiasi di 3 lettere e la malattia di «Bianchi Chiara» riscriveva «Clemente Chiara
// malato», «Raineri Andrea» toglieva «Molinari Andrea ferie», un prefisso comune un altro.
const _RAPP_LETTERE = "A-Za-zÀ-ÖØ-öø-ÿ'’";
function _rapportoEsc(w) {
  return String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function _rapportoTrovaNelTesto(testo, pezzo) {
  const m = String(testo || '').match(
    new RegExp('(^|[^' + _RAPP_LETTERE + '])(' + pezzo + ')(?![' + _RAPP_LETTERE + '])', 'i'),
  );
  return m ? m[2] : '';
}
// parole del nome che lo possono riconoscere: almeno 3 lettere e non una particella («Del»,
// «Della», «Dal»: in «malato del turno» non c e Del Prete Roberta, riverifica 2 A-R1)
function _rapportoParoleDi(nome) {
  const part = typeof _NOMI_PARTICELLE !== 'undefined' ? _NOMI_PARTICELLE : ['di', 'da', 'de', 'del', 'della', 'dal'];
  return String(nome || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.replace(/[^a-zà-öø-ÿ]/g, '').length >= 3 && !part.includes(w));
}
function _rapportoParolaNome(testo, nome) {
  const n = String(nome || '').trim();
  if (!n) return '';
  const parole = n.split(/\s+/);
  let w = _rapportoTrovaNelTesto(testo, parole.map(_rapportoEsc).join('\\s+'));
  if (!w && parole.length === 2)
    w = _rapportoTrovaNelTesto(testo, [parole[1], parole[0]].map(_rapportoEsc).join('\\s+'));
  if (w) return w;
  const lc = n.toLowerCase();
  const altri = (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache || [] : []).filter(
    (c) =>
      String(c.nome || '')
        .trim()
        .toLowerCase() !== lc,
  );
  for (const p of _rapportoParoleDi(n)) {
    if (altri.some((c) => _rapportoParoleDi(c.nome).includes(p))) continue; // parola in comune
    // con le particelle che la precedono nel nome («Del Prete»), se sono scritte anche li
    const tutte = parole.map((w) => w.toLowerCase());
    const k = tutte.indexOf(p);
    let k0 = k;
    while (k0 > 0 && !_rapportoParoleDi(tutte[k0 - 1]).length) k0--;
    const x =
      (k0 < k &&
        _rapportoTrovaNelTesto(
          testo,
          parole
            .slice(k0, k + 1)
            .map(_rapportoEsc)
            .join('\\s+'),
        )) ||
      _rapportoTrovaNelTesto(testo, _rapportoEsc(p));
    if (x) return x;
  }
  return '';
}
// il frammento nomina (oltre a «nome», gia tolto: resto) un altro collaboratore? Lo si
// riconosce come sempre: nome intero o cognome unico (A-R1: prima bastava una parola qualsiasi
// del suo nome, anche «del» di «Del Prete»)
function _rapportoNominaAltri(resto, nome) {
  const lc = String(nome || '')
    .trim()
    .toLowerCase();
  return (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache || [] : []).some(
    (c) =>
      String(c.nome || '')
        .trim()
        .toLowerCase() !== lc && !!_rapportoParolaNome(resto, c.nome),
  );
}
// toglie (o sostituisce con 'nuovo') la parte del testo che riguarda la persona:
// "Rossi malato, Bianchi ferie" -> "Bianchi ferie"; "Rossi e Bianchi assenti" ->
// "Bianchi assenti". Righe e frammenti (separati da virgola o punto e virgola).
// Un frammento che nomina anche un altro collaboratore non si cancella e non si riscrive
// (A-N1): se ne toglie solo il nome quando e «Rossi e Bianchi ...», altrimenti resta com e
// e la voce nuova si aggiunge a parte.
function _rapportoTogliNome(testo, nome, nuovo) {
  let fatto = false;
  const righe = String(testo || '')
    .split('\n')
    .map((riga) => {
      const pezzi = riga.split(/(\s*[;,]\s*)/);
      const out = [];
      for (let i = 0; i < pezzi.length; i += 2) {
        const fr = pezzi[i];
        const sep = pezzi[i + 1] || '';
        const w = fatto ? '' : _rapportoParolaNome(fr, nome);
        if (!w) {
          out.push(fr, sep);
          continue;
        }
        const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const conAltri = new RegExp('(^|\\s)' + e + '\\s+(?:e|ed|&)\\s+|\\s+(?:e|ed|&)\\s+' + e + '(?=\\s|$)', 'i');
        if (conAltri.test(fr)) {
          // piu persone nello stesso frammento: si toglie solo il nome
          fatto = true;
          out.push(fr.replace(conAltri, (x, a) => a || '').trim(), sep);
          if (nuovo) out.push(nuovo, sep || ', ');
          continue;
        }
        const resto = fr.replace(new RegExp(e, 'i'), ' ');
        if (_rapportoNominaAltri(resto, nome)) {
          out.push(fr, sep); // nomina un collega: non si tocca
          continue;
        }
        fatto = true;
        if (nuovo) out.push(nuovo, sep);
        else out.push('', '');
      }
      return out
        .join('')
        .replace(/^\s*[;,]\s*|\s*[;,]\s*$/g, '')
        .replace(/\s*([;,])\s*[;,]\s*/g, '$1 ')
        .trim();
    })
    .filter((r) => r);
  if (!fatto && nuovo) righe.push(nuovo);
  return { testo: righe.join('\n'), fatto: fatto || !!nuovo };
}
async function _rapportoRiga(o) {
  const r =
    (await secGet(
      'rapporti_giornalieri?data_rapporto=eq.' + o.ds + '&turno=eq.' + o.turno + '&reparto_dip=eq.' + o.reparto,
    )) || [];
  return r[0] || null;
}
// scrive il campo nel rapporto (assenze e colonna, differenze_cassa e in note_extra)
async function _rapportoScriviCampo(o, riga, valore) {
  const filtro = 'data_rapporto=eq.' + o.ds + '&turno=eq.' + o.turno + '&reparto_dip=eq.' + o.reparto;
  const patch = { operatore: getOperatore(), updated_at: new Date().toISOString() };
  if (o.campo === 'assenze') patch.assenze = valore;
  else {
    let extra = {};
    try {
      extra = JSON.parse(riga.note_extra || '{}') || {};
    } catch (e) {}
    extra[o.campo] = valore;
    patch.note_extra = JSON.stringify(extra);
  }
  await secPatch('rapporti_giornalieri', filtro, patch);
  if (o.reparto === currentReparto) _rapportoCacheSet(o.ds, o.turno, Object.assign({}, riga, patch));
}
function _rapportoValoreCampo(riga, campo) {
  if (!riga) return '';
  if (campo === 'assenze') return riga.assenze || '';
  try {
    return (JSON.parse(riga.note_extra || '{}') || {})[campo] || '';
  } catch (e) {
    return '';
  }
}
// cancellata dal Diario: la persona sparisce dal Rapporto di quel giorno
async function _rapportoTogliRegistrazione(rec) {
  const o = _rapportoOrigineDi(rec);
  if (!o) return false;
  try {
    const riga = await _rapportoRiga(o);
    if (!riga) return false;
    const r = _rapportoTogliNome(_rapportoValoreCampo(riga, o.campo), rec.nome);
    if (!r.fatto) return false;
    await _rapportoScriviCampo(o, riga, r.testo);
    logAzione('Rapporto aggiornato dal Diario', rec.nome + ' tolto dal rapporto ' + o.turno + ' del ' + o.ds);
    return o;
  } catch (e) {
    console.error('rapporto: togli', e);
    return false;
  }
}
// ripristinata (cestino) o rimessa da Annulla: la voce torna nel Rapporto del giorno,
// scritta come la scrive la correzione, se il nome non c e gia
async function _rapportoRimettiRegistrazione(rec) {
  const o = _rapportoOrigineDi(rec);
  if (!o) return false;
  try {
    const riga = await _rapportoRiga(o);
    if (!riga) return false;
    const vecchio = _rapportoValoreCampo(riga, o.campo);
    if (_rapportoParolaNome(vecchio, rec.nome)) return false; // gia presente
    // il nome intero (A-N1): la prima parola («De» di «De Lima Marco», un nome in comune con
    // un collega) non riconosceva piu la persona
    const parola = String(rec.nome).trim();
    let voce = '';
    if (o.campo === 'assenze') {
      const rg = _getRangeMalattiaRec(rec);
      if (!rg) return false;
      voce = parola + ' ' + _rapportoVoceAssenza(rec, rg);
    } else {
      const segno = /eccedenza/i.test(rec.testo || '') ? '+' : '-';
      voce = parola + ' ' + segno + (parseFloat(rec.importo) || 0).toFixed(2);
    }
    await _rapportoScriviCampo(o, riga, String(vecchio || '').trim() ? String(vecchio).trim() + ', ' + voce : voce);
    logAzione('Rapporto aggiornato dal Diario', rec.nome + ' rimesso nel rapporto ' + o.turno + ' del ' + o.ds);
    return o;
  } catch (e) {
    console.error('rapporto: rimetti', e);
    return false;
  }
}
// modificata nel Diario: la voce del Rapporto si riscrive con i dati nuovi
// opz.senzaRegistro: niente voce nel registro (chi chiama la scrive alla fine, cosi resta un
// solo passo di Annulla: Certificato ricevuto)
async function _rapportoCorreggiRegistrazione(rec, nomeVecchio, opz) {
  const o = _rapportoOrigineDi(rec);
  if (!o) return false;
  try {
    const riga = await _rapportoRiga(o);
    if (!riga) return false;
    const vecchio = _rapportoValoreCampo(riga, o.campo);
    // il nome come e scritto nel Rapporto: intero se c e intero («Balliu Bledar assente» ->
    // «Balliu Bledar malato con certificato»; prima restava solo «Balliu», controllo 23/10
    // D15), altrimenti la parola usata (chi scrive «Rossi malato» resta «Rossi»)
    const nomeIntero = String(nomeVecchio || rec.nome || '').trim();
    const mIntero = nomeIntero
      ? String(vecchio || '').match(
          new RegExp(
            '(^|[^A-Za-zÀ-ü])(' +
              nomeIntero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') +
              ')(?![A-Za-zÀ-ü])',
            'i',
          ),
        )
      : null;
    const parola =
      (mIntero && rec.nome) || _rapportoParolaNome(vecchio, nomeVecchio || rec.nome) || String(rec.nome).trim();
    let nuovo = '';
    if (o.campo === 'assenze') {
      const rg = _getRangeMalattiaRec(rec);
      if (!rg) return false;
      nuovo = parola + ' ' + _rapportoVoceAssenza(rec, rg);
    } else {
      const segno = /eccedenza/i.test(rec.testo || '') ? '+' : '-';
      nuovo = parola + ' ' + segno + (parseFloat(rec.importo) || 0).toFixed(2);
    }
    const r = _rapportoTogliNome(vecchio, nomeVecchio || rec.nome, nuovo);
    await _rapportoScriviCampo(o, riga, r.testo);
    if (!(opz && opz.senzaRegistro))
      logAzione('Rapporto corretto dal Diario', rec.nome + ' nel rapporto ' + o.turno + ' del ' + o.ds + ': ' + nuovo);
    return o;
  } catch (e) {
    console.error('rapporto: correggi', e);
    return false;
  }
}

// M NEL PIANO O COPERTURA MALATTIA: come se l assenza fosse scritta nel Rapporto. Si
// aggiunge "Rossi malato dal 30/09/2026 al 02/10/2026" alle assenze del Rapporto del
// primo giorno (PRESTO se il turno sostituito e diurno o era un riposo, NOTTE se
// notturno) e il Rapporto crea la registrazione nel Diario, come sempre.
// codice 'ASS': assenza in attesa di certificato («Rossi assente dal ...»); senza, la M
// del Piano e una malattia con il certificato («Rossi malato con certificato dal ...»)
async function _rapportoAggiungiAssenza(nome, dal, al, codiceSostituito, codice) {
  const t = codiceSostituito && typeof _pianoTurnoInfo === 'function' ? _pianoTurnoInfo(codiceSostituito) : null;
  const turno = t && String(t.tipo || '').toUpperCase() === 'NOTTURNO' ? 'NOTTE' : 'PRESTO';
  const o = { ds: dal, turno: turno, reparto: currentReparto, campo: 'assenze' };
  const riga = await _rapportoRiga(o);
  const f = (d) => d.split('-').reverse().join('/');
  const voce =
    String(nome).trim() +
    (codice === 'ASS' ? ' assente dal ' : ' malato con certificato dal ') +
    f(dal) +
    ' al ' +
    f(al);
  const vecchio = riga ? riga.assenze || '' : '';
  const nuovo = _rapportoParolaNome(vecchio, nome)
    ? _rapportoTogliNome(vecchio, nome, voce).testo
    : (vecchio.trim() ? vecchio.replace(/\s+$/, '') + '\n' : '') + voce;
  if (riga) await _rapportoScriviCampo(o, riga, nuovo);
  else {
    await secPost('rapporti_giornalieri', {
      data_rapporto: dal,
      turno: turno,
      reparto_dip: currentReparto,
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
      assenze: nuovo,
    });
    _rapportoCacheSet(dal, turno, { data_rapporto: dal, turno: turno, assenze: nuovo });
  }
  window._rapportoDalPiano = true;
  // i limiti di data valgono per gli altri frammenti del Rapporto, non per la persona del Piano
  window._rapportoDalPianoNome = String(nome).trim().toLowerCase();
  let esito = null;
  try {
    esito = await _processaAssenzeRapporto(nuovo, dal, turno);
  } finally {
    window._rapportoDalPiano = false;
    window._rapportoDalPianoNome = '';
  }
  // errori di questa persona (date, nome da chiarire, scrittura rifiutata): chi chiama
  // registra nel Diario per un altra strada e non annuncia un successo (D-N1)
  const lc = String(nome).trim().toLowerCase();
  o.errori = ((esito && esito.errori) || []).filter((e) => String(e.nome || '').toLowerCase() === lc);
  if (esito && esito.falliti && esito.falliti.length) o.errori.push({ nome: nome, motivo: esito.falliti.join(', ') });
  logAzione(
    codice === 'ASS' ? 'Assenza dal piano nel Rapporto' : 'Malattia dal piano nel Rapporto',
    nome + ' ' + dal + '-' + al + ' · rapporto ' + turno,
  );
  return o;
}
// il frammento del Rapporto dice che il certificato c e gia? («malato con certificato»,
// «certificato medico fino a venerdi»); «senza certificato», «in attesa del certificato» no
function _rapportoConCertificato(riga) {
  const t = String(riga || '');
  if (!/\bcertificat[oi]\b/i.test(t)) return false;
  return !/\b(senza|attesa|aspett\w*|manca\w*|attende\w*|non\s+ha)\b[^,;]{0,25}\bcertificat/i.test(t);
}
// voce del Rapporto per una registrazione di assenza o malattia (Diario -> Rapporto): la
// stessa che, riletta, ridà quel tipo («assente» = Assenza, «malato con certificato» = Malattia)
function _rapportoVoceAssenza(rec, rg) {
  const f = (d) => d.split('-').reverse().join('/');
  const per = 'dal ' + f(rg.i) + ' al ' + f(rg.f);
  if (rec.tipo === nomeCorrente('Assenza')) {
    // ASSENZA NON GIUSTIFICATA (Certificato non ricevuto, assenze.js): tutta o solo alcuni giorni
    const ng = typeof _assNgGiorniReg === 'function' ? _assNgGiorniReg(rec) : [];
    if (!ng.length) return 'assente ' + per;
    const tutti = typeof _assGiorniPropri === 'function' ? _assGiorniPropri(rec) : ng;
    return ng.length >= tutti.length
      ? 'assente non giustificato ' + per
      : 'assente ' +
          per +
          ' (non giustificato: ' +
          ng.map((d) => d.substring(8, 10) + '.' + d.substring(5, 7)).join(', ') +
          ')';
  }
  return /certificat/i.test(rec.testo || '') ? 'malato con certificato ' + per : 'malato ' + per;
}
