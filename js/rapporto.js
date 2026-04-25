/**
 * Diario Collaboratori — Casino Lugano SA
 * File: rapporto.js
 * Righe originali: 436
 * Estratto automaticamente da index.html
 */
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
async function fetchRapportiMese(a, m) {
  const start = a + '-' + String(m + 1).padStart(2, '0') + '-01';
  const nm = m === 11 ? new Date(a + 1, 0, 1) : new Date(a, m + 1, 1);
  const end = nm.getFullYear() + '-' + String(nm.getMonth() + 1).padStart(2, '0') + '-01';
  rapportiCache = {};
  const data = await secGet(
    'rapporti_giornalieri?data_rapporto=gte.' + start + '&data_rapporto=lt.' + end + '&reparto_dip=eq.' + currentReparto
  );
  data.forEach((r) => {
    const k = r.data_rapporto;
    if (!rapportiCache[k]) rapportiCache[k] = {};
    rapportiCache[k][r.turno] = r;
  });
}
function flushRapportoSave() {
  if (!window._rappPending) return;
  Object.entries(window._rappPending).forEach(([cls, turno]) => {
    clearTimeout(window._rappTimers[cls]);
    salvaRapportoTurno(window._rappDs, turno, cls);
  });
  window._rappPending = {};
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
    ' <select onchange="rapportoAnno=parseInt(this.value);renderRapportoCalendario()" style="font-family:Playfair Display,serif;font-size:1.3rem;border:none;background:transparent;color:var(--ink);cursor:pointer">' +
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
    const rdata = rapportiCache[ds] || {};
    const hasP = rdata.PRESTO && (rdata.PRESTO.sup_note || rdata.PRESTO.cassa_note || rdata.PRESTO.sala_note);
    const hasN = rdata.NOTTE && (rdata.NOTTE.sup_note || rdata.NOTTE.cassa_note || rdata.NOTTE.sala_note);
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
    '<div style="margin-top:20px;text-align:center"><div style="display:flex;justify-content:center;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:12px"><div class="field"><label style="font-size:.78rem;color:var(--muted);display:block;margin-bottom:2px">Dal</label><input type="text" id="rapp-dal" readonly style="width:120px;padding:7px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper2);color:var(--ink);cursor:pointer"></div><div class="field"><label style="font-size:.78rem;color:var(--muted);display:block;margin-bottom:2px">Al</label><input type="text" id="rapp-al" readonly style="width:120px;padding:7px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper2);color:var(--ink);cursor:pointer"></div></div><div style="display:flex;justify-content:center;gap:12px"><button class="btn-export" onclick="esportaRapportoCSV()" style="padding:10px 24px;font-size:.85rem">Esporta CSV</button><button class="btn-export btn-export-pdf" onclick="esportaRapportoPDF()" style="padding:10px 24px;font-size:.85rem">Esporta PDF</button></div></div>';
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
  const rdata = rapportiCache[ds] || {};
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
      '" placeholder="Nome..." style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.88rem;background:var(--paper2);color:var(--ink);outline:none"></div>'
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
      '" style="text-align:center;font-size:.75rem;color:var(--muted);margin-top:8px;min-height:18px"></div></div></div>'
    );
  }
  v.innerHTML =
    '<button class="btn-back" onclick="flushRapportoSave();rapportoGiornoAperto=null;renderRapportoCalendario()">&larr; Torna al calendario</button><div class="rapporto-detail"><h3>Rapporto del ' +
    d.getDate() +
    ' ' +
    MESI_FULL[d.getMonth()] +
    ' ' +
    d.getFullYear() +
    ' — ' +
    GIORNI[d.getDay()] +
    '</h3><div class="turno-columns">' +
    turnoCol('PRESTO', 'presto', p) +
    turnoCol('NOTTE', 'notte', n) +
    '</div><div style="display:flex;justify-content:center;gap:12px;margin-top:20px"><button class="btn-export" onclick="esportaRapportoCSV()" style="padding:10px 24px;font-size:.9rem">Esporta CSV</button><button class="btn-export btn-export-pdf" onclick="esportaRapportoPDF()" style="padding:10px 24px;font-size:.9rem">Esporta PDF</button></div></div>';
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
      salvaRapportoTurno(ds, turno, cls).then(() => {
        if (st) {
          st.textContent = 'Salvato';
          setTimeout(() => {
            if (st) st.textContent = '';
          }, 2000);
        }
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
let _transactionalRpcSupported = false; // DISABILITATO: la function ha bug INTEGER[] vs BIGINT[]. Usa REST diretto.
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
  if (rec.data) {
    const d = (rec.data || '').substring(0, 10);
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
function _analizzaAssenzeRapporto(assenzeText, ds, turno) {
  const _rappDateStr = new Date(ds + 'T12:00:00').toLocaleDateString('it-IT');
  const _rapLabel = 'da rapporto ' + turno + ' del ' + _rappDateStr;
  const _rapLabelOld = 'da rapporto ' + turno;
  const _malTipo = nomeCorrente('Malattia');
  // D1: snapshot esistenti per QUESTO rapporto, ESCLUSI i record con origine='manual'
  const _esistenti = datiCache.filter((e) => {
    if (e.tipo !== _malTipo) return false;
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
    meta: { rapLabel: _rapLabel, malTipo: _malTipo, turno, ds, rappDateStr: _rappDateStr },
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
  for (const riga of righe) {
    if (
      /\b(lutto|ferie|vacanza|vacanze|infortunio|permesso|giorno libero|riposo|congedo|ritardo|in ritardo)\b/i.test(
        riga
      )
    )
      continue;
    let _rigaPulita = riga.replace(/([a-zà-ü])(dal\s|fino\s)/gi, '$1 $2');
    let m = _rigaPulita.match(/^([A-ZÀ-Üa-zà-ü\s.'-]+?)\s*(assente|malattia|malato|malata|([A-Z])\s*(\d{1,2}))\b/);
    if (m && m[1]) m[1] = m[1].replace(/\s+(da|dal|fino|al|a)$/i, '');
    if (!m) {
      const _preDate = _rigaPulita.match(/^(.+?)\s+(?:dal\s|fino\s|domani|dopodomani|oggi)/i);
      if (_preDate) {
        let _pn = _preDate[1].replace(/\s+(da|dal|fino|a)$/i, '').trim();
        if (_pn.length >= 3 && /^[A-ZÀ-Üa-zà-ü\s.'-]+$/.test(_pn)) m = [_rigaPulita, _pn, 'assente', null, null];
      }
    }
    if (m && m[1].trim().split(/\s+/).length > 4) m = null;
    if (
      !m &&
      /\b(assente|malattia|malato|malata|malessere|non.{0,10}present[ei]|non.{0,10}vien[ei]|chiamat[oa]|si è sentit[oa]|non.{0,10}sar[àa]|non sta bene|sta male|ricoverat[oa]|ospedale|pronto soccorso|visita medica|controllo medico|certificato medico)\b/i.test(
        riga
      )
    ) {
      let _foundNome = null,
        _codice = null;
      for (const c of collaboratoriCache) {
        const words = c.nome.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length >= 3 && new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(riga)) {
            _foundNome = c.nome;
            break;
          }
        }
        if (_foundNome) break;
      }
      if (_foundNome) {
        const _cm = riga.match(/\b([A-Z])\s*(\d{1,2})\b/);
        if (_cm) _codice = _cm;
        m = [riga, _foundNome, _codice ? _cm[0] : 'assente', _codice ? _cm[1] : null, _codice ? _cm[2] : null];
      }
    }
    if (!m) continue;
    const nome = m[1] && m[1] === m[1] ? capitalizzaNome(m[1].trim()) : capitalizzaNome(m[1]);
    const isCodice = !!m[3] && /^[a-zA-Z]$/.test(m[3]);
    const codiceNum = m[4] ? parseInt(m[4]) : 0;
    const domaniMatch = /\bdomani\b/i.test(riga);
    const dopodomaniMatch = /\bdopodomani\b/i.test(riga);
    const oggiMatch = /\b(oggi|stasera|questa sera)\b/i.test(riga);
    const finoMatch = riga.match(/fino\s+(?:al?\s+)?(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?/i);
    const dalAlMatch = _rigaPulita.match(
      /dal\s+(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?\s+al\s+(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?/i
    );
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
      if (rigaLow.includes(g)) _giorniTrovati.push(idx);
    }
    const finoGiornoMatch = riga.match(
      /fino\s+(?:a\s+)?(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)/i
    );
    const dataRapp = new Date(ds + 'T12:00:00');
    let dataInizio = new Date(ds + 'T12:00:00'),
      dataFine = new Date(ds + 'T12:00:00');
    if (dopodomaniMatch && domaniMatch) {
      dataInizio = new Date(dataRapp);
      dataInizio.setDate(dataInizio.getDate() + 1);
      dataFine = new Date(dataRapp);
      dataFine.setDate(dataFine.getDate() + 2);
    } else if (domaniMatch && _giorniTrovati.length) {
      dataInizio = new Date(dataRapp);
      dataInizio.setDate(dataInizio.getDate() + 1);
      const targetDay = _giorniTrovati[0];
      dataFine = new Date(dataRapp);
      let diff = (targetDay - dataFine.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      dataFine.setDate(dataFine.getDate() + diff);
      if (dataFine < dataInizio) dataFine.setDate(dataFine.getDate() + 7);
    } else if (finoGiornoMatch) {
      const targetDay = _giorniSett[finoGiornoMatch[1].toLowerCase()];
      dataFine = new Date(dataRapp);
      let diff = (targetDay - dataFine.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      dataFine.setDate(dataFine.getDate() + diff);
    } else if (_giorniTrovati.length >= 2) {
      const dates = _giorniTrovati
        .map((g) => {
          const d = new Date(dataRapp);
          let diff = (g - d.getDay() + 7) % 7;
          if (diff === 0) diff = 7;
          d.setDate(d.getDate() + diff);
          return d;
        })
        .sort((a, b) => a - b);
      dataInizio = dates[0];
      dataFine = dates[dates.length - 1];
    } else if (_giorniTrovati.length === 1) {
      const targetDay = _giorniTrovati[0];
      dataInizio = new Date(dataRapp);
      let diff = (targetDay - dataInizio.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      dataInizio.setDate(dataInizio.getDate() + diff);
      dataFine = new Date(dataInizio);
    } else if (dopodomaniMatch) {
      dataInizio = new Date(dataRapp);
      dataInizio.setDate(dataInizio.getDate() + 1);
      dataFine = new Date(dataRapp);
      dataFine.setDate(dataFine.getDate() + 2);
    } else if (domaniMatch) {
      dataInizio = new Date(dataRapp);
      dataInizio.setDate(dataInizio.getDate() + 1);
      dataFine = new Date(dataInizio);
    } else if (dalAlMatch) {
      const gInizio = parseInt(dalAlMatch[1]),
        mInizio = dalAlMatch[2] ? parseInt(dalAlMatch[2]) - 1 : dataRapp.getMonth();
      const _aInizio = dalAlMatch[3] ? parseInt(dalAlMatch[3]) : null;
      const annoInizio = _aInizio ? (_aInizio < 100 ? 2000 + _aInizio : _aInizio) : dataRapp.getFullYear();
      const gFine = parseInt(dalAlMatch[4]),
        mFine = dalAlMatch[5] ? parseInt(dalAlMatch[5]) - 1 : mInizio;
      const _aFine = dalAlMatch[6] ? parseInt(dalAlMatch[6]) : null;
      const annoFine = _aFine ? (_aFine < 100 ? 2000 + _aFine : _aFine) : annoInizio;
      dataInizio = new Date(annoInizio, mInizio, gInizio, 12);
      dataFine = new Date(annoFine, mFine, gFine, 12);
    } else if (finoMatch) {
      const gFine = parseInt(finoMatch[1]),
        mFine = finoMatch[2] ? parseInt(finoMatch[2]) - 1 : dataRapp.getMonth();
      dataFine = new Date(dataRapp.getFullYear(), mFine, gFine, 12);
      if (dataFine < dataInizio) dataFine.setFullYear(dataFine.getFullYear() + 1);
    }
    const nomeFinale = matchCollaboratore(nome) || capitalizzaNome(nome);
    // === D7: VALIDAZIONE DATE ===
    if (dataFine < dataInizio) {
      const _tmp = dataInizio;
      dataInizio = dataFine;
      dataFine = _tmp;
    } // auto-swap
    const _oggi = new Date();
    _oggi.setHours(12, 0, 0, 0);
    const _maxFuturo = new Date(_oggi);
    _maxFuturo.setDate(_maxFuturo.getDate() + 365);
    const _maxPassato = new Date(_oggi);
    _maxPassato.setDate(_maxPassato.getDate() - 180);
    if (dataInizio > _maxFuturo) {
      ops.errors.push({
        nome: nomeFinale,
        motivo: 'data inizio oltre 12 mesi nel futuro (' + dataInizio.toLocaleDateString('it-IT') + ')',
        riga,
      });
      continue;
    }
    if (dataFine < _maxPassato) {
      ops.errors.push({
        nome: nomeFinale,
        motivo: 'data fine oltre 6 mesi nel passato (' + dataFine.toLocaleDateString('it-IT') + ')',
        riga,
      });
      continue;
    }
    const nGiorni = Math.round((dataFine - dataInizio) / 86400000) + 1;
    if (nGiorni > 180) {
      ops.errors.push({
        nome: nomeFinale,
        motivo: 'range eccessivo (' + nGiorni + ' giorni) - probabile errore di data',
        riga,
      });
      continue;
    }
    const dalStr = dataInizio.toLocaleDateString('it-IT'),
      alStr = dataFine.toLocaleDateString('it-IT');
    const codeTxt = isCodice ? ' (' + m[2].toUpperCase() + ')' : '';
    const testo =
      nGiorni > 1
        ? 'Assente per malattia' +
          codeTxt +
          ' dal ' +
          dalStr +
          ' al ' +
          alStr +
          ' (' +
          nGiorni +
          ' giorni, ' +
          _rapLabel +
          ')'
        : 'Assente per malattia' + codeTxt + ' (' + _rapLabel + ')';
    _nomiProcessati.add(nomeFinale.toLowerCase());
    const esiste = _esistenti.find(
      (e) => e.nome.toLowerCase() === nomeFinale.toLowerCase() && !_usedEsistentiIds.has(e.id)
    );
    if (esiste) {
      _usedEsistentiIds.add(esiste.id);
      if (esiste.testo !== testo) {
        ops.updates.push({ id: esiste.id, nome: nomeFinale, vecchioTesto: esiste.testo, nuovoTesto: testo, nGiorni });
      }
      // else: no-op
    } else {
      // Cross-rapporto dedup: include ANCHE record manuali (per evitare duplicati visivi)
      const _newKeyI = dataInizio.toISOString().substring(0, 10);
      const _newKeyF = dataFine.toISOString().substring(0, 10);
      const _giaInAltro = datiCache.find((e) => {
        if (e.tipo !== _malTipo) return false;
        if (e.nome.toLowerCase() !== nomeFinale.toLowerCase()) return false;
        if ((e.reparto_dip || currentReparto) !== currentReparto) return false;
        if (_recIsCurrentRapporto(e, _rapLabel, _rapLabelOld, ds)) return false;
        const r = _getRangeMalattiaRec(e);
        if (!r) return false;
        return r.i === _newKeyI && r.f === _newKeyF;
      });
      if (_giaInAltro) {
        let _motivo;
        if (_giaInAltro.origine === 'manual') {
          _motivo = 'già inserita manualmente';
        } else {
          const _refMatch = (_giaInAltro.testo || '').match(
            /da rapporto (PRESTO|NOTTE)(?:\s+del\s+(\d{2}\/\d{2}\/\d{4}))?/
          );
          const _refTxt = _refMatch ? _refMatch[1] + (_refMatch[2] ? ' del ' + _refMatch[2] : '') : 'altro rapporto';
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
          String(_now.getSeconds()).padStart(2, '0')
      ).toISOString();
      ops.creates.push({
        nome: nomeFinale,
        nGiorni,
        dataInizio,
        dataFine,
        record: {
          id: Date.now() + Math.floor(Math.random() * 1000),
          nome: nomeFinale,
          tipo: _malTipo,
          testo,
          data: _evtDate,
          operatore: getOperatore(),
          reparto_dip: currentReparto,
          origine: 'rapporto',
        },
      });
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
// === EXECUTE: applica le operazioni (D6 transactional con fallback REST + D4 audit) ===
async function _eseguiAssenzeOps(ops, ds, turno) {
  // D7: notifica errori validazione (non bloccanti, gli altri op vanno avanti)
  for (const e of ops.errors) {
    toast('⚠ ' + e.nome + ': ' + e.motivo);
    try {
      logAzione('Validazione assenza fallita', e.nome + ' - ' + e.motivo + ' (rapporto ' + turno + ' del ' + ds + ')');
    } catch (_) {}
  }
  const totaleDb = ops.creates.length + ops.updates.length + ops.deletes.length;
  if (totaleDb === 0 && ops.skipped.length === 0) return;
  // D6: TRANSACTIONAL — costruisci batch operazioni per RPC
  const rpcOps = [];
  for (const c of ops.creates) rpcOps.push({ action: 'create', data: c.record });
  for (const u of ops.updates) rpcOps.push({ action: 'update', id: u.id, data: { testo: u.nuovoTesto } });
  for (const d of ops.deletes) rpcOps.push({ action: 'delete', id: d.id });
  let result = { created_ids: [], created: 0, updated: 0, deleted: 0 };
  let usedFallback = false;
  // Strip origine dalle ops se schema non supporta la colonna (graceful degradation pre-migration)
  const _maybeStripOrigineFromOps = () => {
    if (!_origineSchemaSupported) {
      for (const op of rpcOps) {
        if (op.action === 'create' && op.data) delete op.data.origine;
      }
    }
  };
  _maybeStripOrigineFromOps();
  if (rpcOps.length > 0) {
    const tk = getOpToken();
    if (tk && _transactionalRpcSupported) {
      try {
        const _rpcResult = await sbRpc('parse_assenze_transactional', { p_token: tk, p_ops: rpcOps });
        if (_rpcResult) result = _rpcResult;
      } catch (e) {
        const _msg = (e.message || '').toLowerCase();
        // Detect schema mismatch sulla colonna origine
        if (_msg.includes('origine') || _msg.includes('column')) {
          console.warn('Colonna origine non disponibile, switching schema legacy');
          _origineSchemaSupported = false;
          _maybeStripOrigineFromOps();
          // Retry RPC senza origine
          try {
            const _rpcResult = await sbRpc('parse_assenze_transactional', { p_token: tk, p_ops: rpcOps });
            if (_rpcResult) result = _rpcResult;
          } catch (e2) {
            console.warn('parse_assenze_transactional non disponibile, fallback REST:', e2.message);
            _transactionalRpcSupported = false;
            usedFallback = true;
          }
        } else {
          console.warn('parse_assenze_transactional non disponibile, fallback REST sequenziale:', e.message);
          _transactionalRpcSupported = false;
          usedFallback = true;
        }
      }
    } else {
      usedFallback = true;
    }
    if (usedFallback) {
      // Fallback: chiamate REST sequenziali (no atomicità ma recupero degradato)
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
          if (_saved && _saved[0] && _saved[0].id) result.created_ids.push(_saved[0].id);
          else result.created_ids.push(Date.now() + Math.floor(Math.random() * 1000));
          result.created++;
        } catch (err) {
          console.error('Fallback create ' + c.nome + ':', err);
          toast('Errore creazione ' + c.nome);
        }
      }
      for (const u of ops.updates) {
        try {
          await secPatch('registrazioni', 'id=eq.' + u.id, { testo: u.nuovoTesto });
          result.updated++;
        } catch (err) {
          console.error('Fallback update ' + u.nome + ':', err);
          toast('Errore aggiornamento ' + u.nome);
        }
      }
      for (const d of ops.deletes) {
        try {
          await secDel('registrazioni', 'id=eq.' + d.id);
          result.deleted++;
        } catch (err) {
          console.error('Fallback delete ' + d.nome + ':', err);
          toast('Errore rimozione ' + d.nome);
        }
      }
    }
  }
  // Aggiorna cache locale + audit log
  // CREATES: assegna ID dal DB e unshift in datiCache
  for (let i = 0; i < ops.creates.length; i++) {
    const c = ops.creates[i];
    const newId = (result.created_ids && result.created_ids[i]) || Date.now() + Math.floor(Math.random() * 1000);
    const fullRec = Object.assign({ id: newId }, c.record);
    datiCache.unshift(fullRec);
    try {
      logAzione(
        'Malattia creata da rapporto',
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
          ')'
      );
    } catch (_) {}
  }
  // UPDATES: patch testo in cache + audit con diff giorni
  for (const u of ops.updates) {
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
  for (const d of ops.deletes) {
    datiCache = datiCache.filter((x) => x.id !== d.id);
    try {
      logAzione(
        'Malattia eliminata da rapporto',
        d.nome + ' (' + d.motivo + ', rapporto ' + turno + ' del ' + ds + ')'
      );
    } catch (_) {}
  }
  // SKIPPED: solo audit + toast
  for (const s of ops.skipped) {
    toast(s.nome + ': ' + s.motivo + ', non duplicato');
    try {
      logAzione(
        'Duplicato cross-rapporto saltato',
        s.nome + ': ' + s.motivo + ' (rapporto ' + turno + ' del ' + ds + ')'
      );
    } catch (_) {}
  }
  // Toast riepilogo
  const summary = [];
  if (result.created) summary.push(result.created + ' create');
  if (result.updated) summary.push(result.updated + ' aggiornate');
  if (result.deleted) summary.push(result.deleted + ' eliminate');
  if (ops.skipped.length) summary.push(ops.skipped.length + ' duplicati saltati');
  if (summary.length) toast('Assenze: ' + summary.join(', ') + (usedFallback ? ' (modalita compatibilita)' : ''));
}
// === ORCHESTRATOR ===
async function _processaAssenzeRapporto(assenzeText, ds, turno) {
  const ops = _analizzaAssenzeRapporto(assenzeText, ds, turno);
  await _eseguiAssenzeOps(ops, ds, turno);
}
// =================================================================================
async function salvaRapportoTurno(ds, turno, cls) {
  const campi = getCampiRapporto();
  const extra = {};
  const data = {
    data_rapporto: ds,
    turno,
    operatore: getOperatore(),
    updated_at: new Date().toISOString(),
    reparto_dip: currentReparto,
  };
  campi.forEach((c) => {
    const el = document.getElementById(cls + '-' + c.key);
    if (!el) return;
    const val = c.type === 'number' ? parseInt(el.value) || 0 : el.value;
    if (RAPPORTO_DB_COLS.includes(c.key)) data[c.key] = val;
    else extra[c.key] = val;
  });
  data.note_extra = JSON.stringify(extra);
  try {
    // Prova UPDATE, se nessuna riga aggiornata → INSERT
    const filtro = 'data_rapporto=eq.' + ds + '&turno=eq.' + turno + '&reparto_dip=eq.' + currentReparto;
    const existing = rapportiCache[ds] && rapportiCache[ds][turno];
    if (existing) {
      await secPatch('rapporti_giornalieri', filtro, data);
    } else {
      try {
        await secPost('rapporti_giornalieri', data);
      } catch (e2) {
        await secPatch('rapporti_giornalieri', filtro, data);
      }
    }
    if (!rapportiCache[ds]) rapportiCache[ds] = {};
    rapportiCache[ds][turno] = data;
    // Auto-malattia: parse assenze field via _processaAssenzeRapporto (analyze + execute)
    // D-Full: D1 origine, D4 audit log, D6 transactional RPC, D7 date validation
    await _processaAssenzeRapporto(data.assenze || '', ds, turno);
    // Auto-differenze cassa: parse differenze_cassa field
    const diffExtra = data.note_extra ? JSON.parse(data.note_extra) : {};
    const diffText = diffExtra.differenze_cassa || '';
    if (diffText.trim()) {
      await parseDifferenzeCassa(diffText, ds, turno);
      renderCassaAlerts();
      renderRischioAlerts();
      renderAmmonimentiAlerts();
    }
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio');
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
  const skip = ['id', 'data_rapporto', 'turno', 'operatore', 'updated_at', 'created_at'];
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
      '&order=data_rapporto.asc'
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
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const { dal, al } = getRapportoDateRange();
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
    doc.text('Casinò Lugano SA — dal ' + dalF + ' al ' + alF, 14, 21);
    doc.setTextColor(0);
    let y = 28;
    dates.forEach((ds) => {
      const d = new Date(ds + 'T12:00:00');
      const dayLabel = d.getDate() + ' ' + MESI_FULL[d.getMonth()] + ' ' + d.getFullYear() + ' — ' + GIORNI[d.getDay()];
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
      doc.text('Casinò Lugano SA — Pag. ' + i + '/' + tp, 14, doc.internal.pageSize.height - 8);
    }
    mostraPdfPreview(doc, 'rapporto_' + dal + '_' + al + '.pdf', 'Rapporto ' + dal + ' — ' + al);
  } catch (e) {
    console.error('PDF error:', e);
    toast('Errore generazione PDF: ' + e.message);
  }
}

// ================================================================
