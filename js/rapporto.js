/**
 * Diario Collaboratori · Casino Lugano SA
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
  /\b(lutto|ferie|vacanza|vacanze|infortunio|permesso|giorno libero|riposo|congedo|ritardo|in ritardo)\b/i;
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
  // plurale valgono tutti quelli trovati, al singolare solo il primo (come prima)
  const plurale = /\b(assenti|malat[ie]|vengono|saranno|stanno)\b/i.test(riga);
  const trovati = [];
  for (const c of collaboratoriCache) {
    const words = c.nome.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length >= 3 && new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(riga)) {
        if (!trovati.includes(c.nome)) trovati.push(c.nome);
        break;
      }
    }
    if (trovati.length && !plurale) break;
  }
  const _cm = riga.match(/\b([A-Z])\s*(\d{1,2})\b/);
  return trovati.map((n) => [riga, n, _cm ? _cm[0] : 'assente', _cm ? _cm[1] : null, _cm ? _cm[2] : null]);
}
// scelte = { "somma": "Somma Alfonso" }: nomi ambigui gia chiariti dall operatore
// (un nome ambiguo senza scelta finisce in ops.ambigui e non si registra)
function _analizzaAssenzeRapporto(assenzeText, ds, turno, scelte) {
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
    ambigui: [],
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
  for (const rigaIntera of righe) {
    // Ogni riga puo' contenere piu' persone separate da virgola o punto e virgola: si valuta
    // ogni frammento da solo, cosi' "Rossi ferie, Bianchi malato" non perde piu' Bianchi
    const frammenti = rigaIntera.split(/\s*[;,]\s*/).filter((f) => f.trim());
    for (const riga of frammenti) {
      const _rigaPulita = riga.replace(/([a-zà-ü])(dal\s|fino\s)/gi, '$1 $2');
      const voci = _vociAssenzaDaFrammento(riga, _rigaPulita);
      // null = assenza non per malattia (ferie, permesso...) o segnaposto: si ignora senza errore
      if (voci === null) continue;
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
        const domaniMatch = /\bdomani\b/i.test(riga);
        const dopodomaniMatch = /\bdopodomani\b/i.test(riga);
        const oggiMatch = /\b(oggi|stasera|questa sera)\b/i.test(riga);
        const finoMatch = riga.match(/fino\s+(?:al?\s+)?(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?/i);
        const dalAlMatch = _rigaPulita.match(
          /dal\s+(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?\s+al\s+(\d{1,2})(?:[\/\.\-](\d{1,2}))?(?:[\/\.\-](\d{2,4}))?/i,
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
          /fino\s+(?:a\s+)?(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)/i,
        );
        const dataRapp = new Date(ds + 'T12:00:00');
        let dataInizio = new Date(ds + 'T12:00:00'),
          dataFine = new Date(ds + 'T12:00:00');
        // "oggi e domani" / "oggi e dopodomani": il periodo parte dal giorno del
        // rapporto e arriva al giorno indicato. Vanno prima delle altre, altrimenti
        // "domani" da solo vincerebbe e il primo giorno andrebbe perso.
        if (oggiMatch && dopodomaniMatch) {
          dataInizio = new Date(dataRapp);
          dataFine = new Date(dataRapp);
          dataFine.setDate(dataFine.getDate() + 2);
        } else if (oggiMatch && domaniMatch) {
          dataInizio = new Date(dataRapp);
          dataFine = new Date(dataRapp);
          dataFine.setDate(dataFine.getDate() + 1);
        } else if (oggiMatch && _giorniTrovati.length === 1) {
          // "oggi e venerdi": dal giorno del rapporto fino a quel giorno
          dataInizio = new Date(dataRapp);
          const _t = _giorniTrovati[0];
          dataFine = new Date(dataRapp);
          let _d = (_t - dataFine.getDay() + 7) % 7;
          if (_d === 0) _d = 7;
          dataFine.setDate(dataFine.getDate() + _d);
        } else if (dopodomaniMatch && domaniMatch) {
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
        // OMONIMI: chi ha gia la registrazione di questo rapporto vale come scelta
        const _sc = scegliCollaboratore(
          nome,
          _esistenti.map((e) => e.nome),
          scelte,
        );
        if (_sc && _sc.ambigui) {
          if (!ops.ambigui.some((a) => a.testo.toLowerCase() === nome.toLowerCase()))
            ops.ambigui.push({ testo: nome, nomi: _sc.ambigui });
          continue;
        }
        if (_sc && _sc.nome === '') {
          ops.errors.push({ nome: nome, motivo: 'nome da chiarire: piu collaboratori con questo nome', riga });
          continue;
        }
        const nomeFinale = (_sc && _sc.nome) || capitalizzaNome(nome);
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
            : // un giorno solo: si scrive la data SEMPRE quando non e' il giorno del
              // rapporto (es. "domani"), altrimenti l'assenza risulterebbe datata al
              // giorno del rapporto e la copertura, registrata sul giorno vero, non
              // verrebbe piu' collegata
              'Assente per malattia' +
              codeTxt +
              (dalStr !== new Date(ds + 'T12:00:00').toLocaleDateString('it-IT') ? ' dal ' + dalStr : '') +
              ' (' +
              _rapLabel +
              ')';
        _nomiProcessati.add(nomeFinale.toLowerCase());
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
          const _newKeyI = dataLocaleISO(dataInizio);
          const _newKeyF = dataLocaleISO(dataFine);
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
    toast('Attenzione · ' + e.nome + ': ' + e.motivo);
    try {
      logAzione('Validazione assenza fallita', e.nome + ' - ' + e.motivo + ' (rapporto ' + turno + ' del ' + ds + ')');
    } catch (_) {}
  }
  // TOLTE DAL RAPPORTO: il Diario resta (regola del titolare). La registrazione si
  // stacca dal Rapporto: nel testo "da rapporto" diventa "tolta dal rapporto" e non
  // viene piu aggiornata dal Rapporto; un avviso lo dice.
  const staccate = ops.deletes;
  ops.deletes = [];
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
  const totaleDb = ops.creates.length + ops.updates.length + ops.deletes.length;
  if (totaleDb === 0 && ops.skipped.length === 0) return;
  // D6: TRANSACTIONAL · costruisci batch operazioni per RPC
  const rpcOps = [];
  for (const c of ops.creates) rpcOps.push({ action: 'create', data: c.record });
  for (const u of ops.updates) rpcOps.push({ action: 'update', id: u.id, data: { testo: u.nuovoTesto } });
  for (const d of ops.deletes) rpcOps.push({ action: 'delete', id: d.id });
  let result = { created_ids: [], created: 0, updated: 0, deleted: 0 };
  // cio che il database ha DAVVERO salvato: solo questo entra in memoria, nel
  // registro e nel Piano (creates con l id vero dato dal database)
  const salvate = { creates: [], updates: [], deletes: [] };
  const falliti = []; // nomi delle operazioni che il database non ha salvato
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
      // Tutto o niente: se il database rifiuta, la transazione e annullata e NULLA
      // e salvato. Si ripiega sulle chiamate una per una solo se la funzione non
      // e raggiungibile (non esiste, rete); un rifiuto del database si dice e basta.
      const _chiama = () => _rpcSicura('parse_assenze_transactional', { p_token: getOpToken(), p_ops: rpcOps });
      let _rpcResult = null;
      try {
        try {
          _rpcResult = await _chiama();
        } catch (e) {
          const _msg = (e.message || '').toLowerCase();
          if (e.sessione && (await _renewToken())) {
            _rpcResult = await _chiama();
          } else if (_origineSchemaSupported && _msg.includes('origine')) {
            // colonna origine non ancora presente nel database: si riprova senza
            console.warn('Colonna origine non disponibile, switching schema legacy');
            _origineSchemaSupported = false;
            _maybeStripOrigineFromOps();
            _rpcResult = await _chiama();
          } else {
            throw e;
          }
        }
        if (!_rpcResult || !Array.isArray(_rpcResult.created_ids))
          throw Object.assign(new Error('risposta vuota dal database'), { dalDatabase: true });
        result = _rpcResult;
        salvate.creates = ops.creates.map((c, i) => ({ c: c, id: _rpcResult.created_ids[i] }));
        salvate.updates = ops.updates.slice();
        salvate.deletes = ops.deletes.slice();
      } catch (e) {
        if (e.dalDatabase && e.status !== 404) {
          console.error('parse_assenze_transactional rifiutata:', e.message);
          toastErrore('Assenze del rapporto NON salvate: ' + e.message, 9000);
          try {
            logAzione('Assenze da rapporto non salvate', e.message + ' (rapporto ' + turno + ' del ' + ds + ')');
          } catch (_) {}
          return;
        }
        console.warn('parse_assenze_transactional non disponibile, fallback REST sequenziale:', e.message);
        _transactionalRpcSupported = false;
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }
    if (usedFallback) {
      // Fallback: chiamate REST una per una (senza atomicita). Si tiene SOLO cio
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
      for (const d of ops.deletes) {
        try {
          await secDel('registrazioni', 'id=eq.' + d.id);
          salvate.deletes.push(d);
          result.deleted++;
        } catch (err) {
          console.error('Fallback delete ' + d.nome + ':', err);
          falliti.push(d.nome + ' (rimozione)');
        }
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
  if (typeof sincronizzaMalattiaPiano === 'function') {
    for (const { c } of salvate.creates) {
      try {
        await sincronizzaMalattiaPiano(c.nome, '', c.record.data, c.record.testo || '');
      } catch (e) {
        toastErrore(c.nome + ': piano non allineato alla malattia (' + ((e && e.message) || e) + ')');
      }
    }
    for (const u of salvate.updates) {
      try {
        const rec = datiCache.find((x) => x.id === u.id);
        await sincronizzaMalattiaPiano(u.nome, u.vecchioTesto || '', rec ? rec.data : '', u.nuovoTesto || '');
      } catch (e) {
        toastErrore(u.nome + ': piano non allineato alla malattia (' + ((e && e.message) || e) + ')');
      }
    }
  }
  // SKIPPED: solo audit + toast
  for (const s of ops.skipped) {
    toast(s.nome + ': ' + s.motivo + ', non duplicato');
    try {
      logAzione(
        'Duplicato cross-rapporto saltato',
        s.nome + ': ' + s.motivo + ' (rapporto ' + turno + ' del ' + ds + ')',
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
      await apriPopupCopertura(c.nome, dIso);
    }
  }
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
  await _eseguiAssenzeOps(ops, ds, turno);
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
async function _salvaRapportoTurnoEsegui(ds, turno, cls) {
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
    const existing = _rapportoCacheGet(ds)[turno];
    if (existing) {
      await secPatch('rapporti_giornalieri', filtro, data);
    } else {
      try {
        await secPost('rapporti_giornalieri', data);
      } catch (e2) {
        if (!/duplicate key|already exists|23505/i.test((e2 && e2.message) || '')) throw e2;
        // un collega ha creato lo stesso rapporto nello stesso momento: si UNISCONO i testi
        // invece di sovrascrivere il suo (prima il suo spariva)
        const suo = ((await secGet('rapporti_giornalieri?' + filtro)) || [])[0] || {};
        const unisci = (a, b) => {
          const x = a === 0 ? '' : String(a == null ? '' : a).trim();
          const y = b === 0 ? '' : String(b == null ? '' : b).trim();
          if (!x) return b;
          if (!y || x === y) return a;
          return typeof a === 'number' && typeof b === 'number' ? a : x + '\n' + y;
        };
        Object.keys(data).forEach((k) => {
          if (['data_rapporto', 'turno', 'reparto_dip', 'operatore', 'updated_at', 'note_extra'].includes(k)) return;
          data[k] = unisci(suo[k], data[k]);
        });
        let extraSuo = {};
        try {
          extraSuo = JSON.parse(suo.note_extra || '{}') || {};
        } catch (e3) {}
        Object.keys(extra).forEach((k) => (extra[k] = unisci(extraSuo[k], extra[k])));
        data.note_extra = JSON.stringify(Object.assign({}, extraSuo, extra));
        await secPatch('rapporti_giornalieri', filtro, data);
        toast('Un collega stava scrivendo lo stesso rapporto: i testi sono stati uniti', 6000);
      }
    }
    _rapportoCacheSet(ds, turno, data);
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
    doc.text('Casinò Lugano SA · dal ' + dalF + ' al ' + alF, 14, 21);
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
      doc.text('Casinò Lugano SA · Pag. ' + i + '/' + tp, 14, doc.internal.pageSize.height - 8);
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
    rec.tipo === nomeCorrente('Malattia')
      ? 'assenze'
      : /^Differenza cassa/.test(String(rec.testo || ''))
        ? 'differenze_cassa'
        : '';
  if (!campo) return null;
  return { turno: m[1], ds: ds, campo: campo, reparto: rec.reparto_dip || currentReparto };
}
// parole del nome (almeno 3 lettere) presenti nel testo, come erano scritte li
function _rapportoParolaNome(testo, nome) {
  const parole = String(nome || '')
    .split(/\s+/)
    .filter((w) => w.replace(/[^A-Za-zÀ-ü]/g, '').length >= 3);
  for (const w of parole) {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const m = String(testo || '').match(re);
    if (m) return m[0];
  }
  return '';
}
// toglie (o sostituisce con 'nuovo') la parte del testo che riguarda la persona:
// "Rossi malato, Bianchi ferie" -> "Bianchi ferie"; "Rossi e Bianchi assenti" ->
// "Bianchi assenti". Righe e frammenti (separati da virgola o punto e virgola).
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
        const w = _rapportoParolaNome(fr, nome);
        if (!w || fatto) {
          out.push(fr, sep);
          continue;
        }
        fatto = true;
        const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const conAltri = new RegExp('(^|\\s)' + e + '\\s+(?:e|ed|&)\\s+|\\s+(?:e|ed|&)\\s+' + e + '(?=\\s|$)', 'i');
        if (conAltri.test(fr)) {
          // piu persone nello stesso frammento: si toglie solo il nome
          out.push(fr.replace(conAltri, (x, a) => a || '').trim(), sep);
          if (nuovo) out.push(nuovo, sep || ', ');
        } else if (nuovo) out.push(nuovo, sep);
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
    const parola = String(rec.nome).split(/\s+/)[0];
    let voce = '';
    if (o.campo === 'assenze') {
      const rg = _getRangeMalattiaRec(rec);
      if (!rg) return false;
      const f = (d) => d.split('-').reverse().join('/');
      voce = parola + ' malato dal ' + f(rg.i) + ' al ' + f(rg.f);
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
async function _rapportoCorreggiRegistrazione(rec, nomeVecchio) {
  const o = _rapportoOrigineDi(rec);
  if (!o) return false;
  try {
    const riga = await _rapportoRiga(o);
    if (!riga) return false;
    const vecchio = _rapportoValoreCampo(riga, o.campo);
    const parola = _rapportoParolaNome(vecchio, nomeVecchio || rec.nome) || String(rec.nome).split(/\s+/)[0];
    let nuovo = '';
    if (o.campo === 'assenze') {
      const rg = _getRangeMalattiaRec(rec);
      if (!rg) return false;
      const f = (d) => d.split('-').reverse().join('/');
      nuovo = parola + ' malato dal ' + f(rg.i) + ' al ' + f(rg.f);
    } else {
      const segno = /eccedenza/i.test(rec.testo || '') ? '+' : '-';
      nuovo = parola + ' ' + segno + (parseFloat(rec.importo) || 0).toFixed(2);
    }
    const r = _rapportoTogliNome(vecchio, nomeVecchio || rec.nome, nuovo);
    await _rapportoScriviCampo(o, riga, r.testo);
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
async function _rapportoAggiungiAssenza(nome, dal, al, codiceSostituito) {
  const t = codiceSostituito && typeof _pianoTurnoInfo === 'function' ? _pianoTurnoInfo(codiceSostituito) : null;
  const turno = t && String(t.tipo || '').toUpperCase() === 'NOTTURNO' ? 'NOTTE' : 'PRESTO';
  const o = { ds: dal, turno: turno, reparto: currentReparto, campo: 'assenze' };
  const riga = await _rapportoRiga(o);
  const f = (d) => d.split('-').reverse().join('/');
  const voce = String(nome).trim() + ' malato dal ' + f(dal) + ' al ' + f(al);
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
  try {
    await _processaAssenzeRapporto(nuovo, dal, turno);
  } finally {
    window._rapportoDalPiano = false;
  }
  logAzione('Malattia dal piano nel Rapporto', nome + ' ' + dal + '-' + al + ' · rapporto ' + turno);
  return o;
}
