/**
 * Diario Collaboratori — Casino Lugano SA
 * File: maison.js
 */

// ================================================================
/**
 * Diario Collaboratori — Casino Lugano SA
 * File: maison-core.js
 * Maison: dashboard, costi, form manuale
 */

// SEZIONE 13: MAISON (clienti VIP)
// Costi, budget, import Excel, parser nomi, regali, spese extra
// ================================================================
// MAISON MANUALE
async function salvaMaisonManuale() {
  const rawNome = document.getElementById('maison-man-nome').value.trim();
  if (!rawNome) {
    toast('Inserisci il nome');
    _highlightField('maison-man-nome');
    return;
  }
  const px = parseInt(document.getElementById('maison-man-px').value) || 1;
  const importo = parseFloat(document.getElementById('maison-man-importo').value) || 0;
  if (!importo) {
    toast('Inserisci un importo');
    return;
  }
  const tipo = document.getElementById('maison-man-tipo').value || null;
  let qty = parseInt(document.getElementById('maison-man-qty').value) || 1;
  // Auto-calcola qty se l'utente lascia 1 ma il costo suggerisce di più
  if (tipo && qty === 1 && BUONO_VALORI[tipo]) {
    const calcQ = Math.ceil(importo / BUONO_VALORI[tipo]);
    if (calcQ >= 1) qty = calcQ;
  }
  const dataVal = document.getElementById('maison-man-data').value || getGiornataCasino();
  // Gestione nomi multipli con /
  const nomiRaw = rawNome
    .split(/\s*\/\s*/)
    .map((n) => capitalizzaNome(n.trim()))
    .filter((n) => n);
  const nNomi = nomiRaw.length;
  const gruppoLabel = nNomi > 1 ? capitalizzaNome(rawNome) : '';
  // FIX: per nomi multipli (gruppo /), CERCA nomi completi nei budget Maison esistenti
  // Es. "Bonomelli" → "Bonomelli Pierluigi". Disambiguazione modale se ci sono piu' match.
  let nomiFinali;
  if (nNomi > 1) {
    nomiFinali = [];
    for (const n of nomiRaw) {
      const result = _completaNomeDaBudget(n);
      if (result.needDisambiguation) {
        // Apri modal di disambiguazione e aspetta scelta utente
        const scelto = await _scegliCandidatoNome(n, result.candidates);
        if (scelto === null) {
          toast('Inserimento annullato');
          return;
        }
        nomiFinali.push(scelto);
      } else {
        nomiFinali.push(result.nome || n);
      }
    }
  } else {
    // Nome singolo: comportamento legacy (solo correzione cognome typo)
    nomiFinali = nomiRaw.map((n) => {
      const simile = _trovaNomeSimileMaison(n);
      if (simile && simile.tipo === 'simile') {
        const corretto = _soloCorrezioneCognome(n, simile.nome);
        return corretto;
      }
      return n;
    });
  }
  // === SPLITTING INTELLIGENTE PER NOMI MULTIPLI (/) ===
  // Auto-detect categoria buono dal budget se l'utente non seleziona tipo manualmente.
  // Es: Aili(BL)/Bertaggia(full), px=2, 360 CHF → Aili 40 (1BL), Bertaggia 320 (resto)
  const _pxBase = Math.floor(px / nNomi) || 1;
  const _pxExtra = px - _pxBase * nNomi;
  // Per ogni nome: calcola costo, tipo_buono, px, note
  const _nomiSplit = nomiFinali.map((n, i) => {
    const pxI = _pxBase + (i < _pxExtra ? 1 : 0);
    return { nome: n, px: pxI, tipo_buono: null, costo: 0, note: '', autoDetected: false };
  });
  if (tipo && BUONO_VALORI[tipo]) {
    // Utente ha selezionato tipo manualmente
    if (nNomi > 1) {
      // Primo nome prende il buono, gli altri il resto
      const buonoCosto = Math.min(qty * BUONO_VALORI[tipo], importo);
      const restoCosto = importo - buonoCosto;
      _nomiSplit[0].costo = Math.round(buonoCosto * 100) / 100;
      _nomiSplit[0].tipo_buono = tipo;
      _nomiSplit[0].note = qty > 1 ? qty + tipo : '';
      for (let i = 1; i < nNomi; i++) _nomiSplit[i].costo = Math.round((restoCosto / (nNomi - 1)) * 100) / 100;
    } else {
      _nomiSplit[0].costo = importo;
      _nomiSplit[0].tipo_buono = tipo;
      _nomiSplit[0].note = qty > 1 ? qty + tipo : '';
    }
  } else if (nNomi > 1) {
    // Nessun tipo selezionato + nomi multipli: AUTO-DETECT dal budget
    const budgetCats = nomiFinali.map((n) => {
      const b = getBudgetReparto().find((b) => b.nome.toLowerCase() === n.toLowerCase());
      return b ? b.categoria : null;
    });
    // Mappa categoria budget → tipo buono
    const catToTipo = { bu: 'BU', bl: 'BL' };
    const buonoIdxs = [];
    const fullIdxs = [];
    budgetCats.forEach((cat, i) => {
      if (cat && catToTipo[cat]) buonoIdxs.push(i);
      else fullIdxs.push(i);
    });
    if (buonoIdxs.length > 0 && fullIdxs.length > 0) {
      // Mix: chi ha buoni prende quota buono, chi e' full prende il resto
      let totalBuonoCosto = 0;
      buonoIdxs.forEach((i) => {
        const tipoBuono = catToTipo[budgetCats[i]];
        const pxI = _nomiSplit[i].px;
        const buonoCosto = pxI * BUONO_VALORI[tipoBuono];
        _nomiSplit[i].tipo_buono = tipoBuono;
        _nomiSplit[i].costo = Math.round(Math.min(buonoCosto, importo) * 100) / 100;
        _nomiSplit[i].note = pxI > 1 ? pxI + tipoBuono : tipoBuono;
        _nomiSplit[i].autoDetected = true;
        totalBuonoCosto += _nomiSplit[i].costo;
      });
      const restoCosto = Math.max(0, importo - totalBuonoCosto);
      fullIdxs.forEach((i) => {
        _nomiSplit[i].costo = Math.round((restoCosto / fullIdxs.length) * 100) / 100;
      });
    } else {
      // Tutti dello stesso tipo: dividi equamente
      _nomiSplit.forEach((s) => {
        s.costo = Math.round((importo / nNomi) * 100) / 100;
      });
    }
  } else {
    // Nome singolo
    _nomiSplit[0].costo = importo;
    _nomiSplit[0].tipo_buono = tipo || null;
    if (tipo && qty > 1) _nomiSplit[0].note = qty + tipo;
  }
  try {
    for (let i = 0; i < _nomiSplit.length; i++) {
      const s = _nomiSplit[i];
      const rec = {
        data_giornata: dataVal,
        nome: s.nome,
        px: s.px,
        costo: s.costo,
        tipo_buono: s.tipo_buono,
        note: (s.note || '') + (gruppoLabel ? ' ' + gruppoLabel : ''),
        gruppo: gruppoLabel,
        operatore: getOperatore(),
        reparto_dip: currentReparto,
      };
      const r = await secPost('costi_maison', rec);
      if (r && r[0]) maisonCache.unshift(r[0]);
    }
    document.getElementById('maison-man-nome').value = '';
    document.getElementById('maison-man-importo').value = '';
    document.getElementById('maison-man-px').value = '1';
    document.getElementById('maison-man-tipo').value = '';
    document.getElementById('maison-man-qty').value = '1';
    const fp = document.getElementById('maison-man-data');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    sincronizzaPareggioBuoni();
    logAzione('Maison manuale', nomiFinali.join('/') + ' ' + importo + ' CHF');
    toast('Spesa aggiunta per ' + nomiFinali.join('/'));
    nomiFinali.forEach((n) => checkBudgetPushAfterInsert(n));
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
// REGALI MAISON
function getRegaliReparto() {
  return regaliCache.filter(function (r) {
    return (r.reparto_dip || 'slots') === currentReparto;
  });
}
async function salvaRegalo() {
  let nome = capitalizzaNome(document.getElementById('regalo-nome').value.trim());
  if (!nome) {
    toast('Inserisci il nome del cliente');
    _highlightField('regalo-nome');
    return;
  }
  const nomeEsistente = getMaisonRepartoExpanded().find((r) => r.nome.toLowerCase() === nome.toLowerCase());
  if (!nomeEsistente) {
    const simile = _trovaNomeSimileMaison(nome);
    if (simile && simile.tipo === 'simile') {
      if (confirm('Hai scritto "' + nome + '" ma esiste "' + simile.nome + '". Usare "' + simile.nome + '"?'))
        nome = simile.nome;
    }
  }
  const desc = document.getElementById('regalo-desc').value.trim();
  if (!desc) {
    toast('Inserisci una descrizione');
    return;
  }
  const importo = parseFloat(document.getElementById('regalo-importo').value) || null;
  const data = document.getElementById('regalo-data').value || new Date().toISOString().split('T')[0];
  try {
    const r = await secPost('regali_maison', {
      nome: nome,
      descrizione: desc,
      importo: importo,
      data_regalo: data,
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    });
    regaliCache.unshift(r[0]);
    document.getElementById('regalo-nome').value = '';
    document.getElementById('regalo-desc').value = '';
    document.getElementById('regalo-importo').value = '';
    var fp = document.getElementById('regalo-data');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    renderRegali();
    logAzione('Regalo aggiunto', nome + ' - ' + desc);
    toast('Regalo registrato');
  } catch (e) {
    toast('Errore aggiunta regalo');
  }
}
async function rinominaRegalo(id) {
  const r = regaliCache.find((x) => x.id === id);
  if (!r) return;
  const nuovo = prompt('Rinomina cliente regalo:', r.nome);
  if (!nuovo || !nuovo.trim()) return;
  try {
    await secPatch('regali_maison', 'id=eq.' + id, { nome: capitalizzaNome(nuovo.trim()) });
    r.nome = capitalizzaNome(nuovo.trim());
    renderRegali();
    toast('Rinominato');
  } catch (e) {
    toast('Errore rinomina');
  }
}
async function eliminaRegalo(id) {
  if (!confirm('Eliminare questo regalo?')) return;
  try {
    await secDel('regali_maison', 'id=eq.' + id);
    regaliCache = regaliCache.filter(function (x) {
      return x.id !== id;
    });
    renderRegali();
    toast('Eliminato');
  } catch (e) {
    toast('Errore eliminazione regalo');
  }
}
function renderRegali() {
  var data = getRegaliReparto();
  var el = document.getElementById('regali-list');
  if (!el) return;
  if (!data.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessun regalo registrato</p><small>Aggiungi un regalo per un cliente Maison</small></div>';
    return;
  }
  var totale = data.reduce(function (s, r) {
    return s + parseFloat(r.importo || 0);
  }, 0);
  var nClienti = new Set(
    data.map(function (r) {
      return r.nome;
    }),
  ).size;
  var html =
    '<div class="mini-stats-bar"><div class="mini-stat"><div class="mini-stat-num gold">' +
    (totale ? fmtCHF(totale) : '—') +
    '</div><div class="mini-stat-label">Totale CHF</div></div><div class="mini-stat"><div class="mini-stat-num blue">' +
    data.length +
    '</div><div class="mini-stat-label">Regali</div></div><div class="mini-stat"><div class="mini-stat-num">' +
    nClienti +
    '</div><div class="mini-stat-label">Clienti</div></div></div>';
  html +=
    '<table class="collab-table"><thead><tr><th>Data</th><th>Cliente</th><th>Descrizione</th><th class="num">CHF</th><th>Operatore</th><th></th></tr></thead><tbody>';
  data.forEach(function (r) {
    var d = new Date((r.data_regalo || r.created_at) + 'T12:00:00');
    var ne = r.nome.replace(/'/g, "\\'");
    var _regBudget = getBudgetReparto().find(function (b) {
      return b.nome.toLowerCase() === r.nome.toLowerCase();
    });
    if (!_regBudget) {
      var _rc = r.nome.toLowerCase().split(/\s+/)[0];
      if (_rc.length >= 3)
        _regBudget = getBudgetReparto().find(function (b) {
          return b.nome.toLowerCase().split(/\s+/)[0] === _rc;
        });
    }
    var _regCatBadge =
      _regBudget && _regBudget.categoria === 'full_maison'
        ? ' <span class="mini-badge" style="background:#b8860b;font-size:.7rem">Full Maison</span>'
        : _regBudget && _regBudget.categoria === 'maison'
          ? ' <span class="mini-badge" style="background:#2980b9;font-size:.7rem">Maison</span>'
          : _regBudget && _regBudget.categoria === 'direzione'
            ? ' <span class="mini-badge" style="background:#8e44ad;font-size:.7rem">Direzione</span>'
            : _regBudget && _regBudget.categoria === 'bu'
              ? ' <span class="mini-badge" style="background:#e67e22;font-size:.7rem">Buono Unico</span>'
              : _regBudget && _regBudget.categoria === 'bl'
                ? ' <span class="mini-badge" style="background:#2c6e49;font-size:.7rem">Buono Lounge</span>'
                : '';
    html +=
      '<tr><td style="font-weight:600">' +
      d.toLocaleDateString('it-IT') +
      '</td><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\'' +
      ne +
      '\')">' +
      escP(r.nome) +
      '</span></strong>' +
      _regCatBadge +
      '</td><td>' +
      escP(r.descrizione || '') +
      '</td><td class="num">' +
      (r.importo ? fmtCHF(r.importo) : '—') +
      '</td><td style="color:var(--muted);font-size:.82rem">' +
      escP(r.operatore || '') +
      '</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaRegalo(' +
      r.id +
      ')" style="font-size:.78rem;padding:3px 8px">Rinomina</button> <button class="btn-act del" onclick="eliminaRegalo(' +
      r.id +
      ')">Elimina</button></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}
// NOTE PRIVATE CLIENTI
function getNoteClientiReparto() {
  return noteClientiCache.filter(function (r) {
    return (r.reparto_dip || 'slots') === currentReparto;
  });
}
async function salvaNotaCliente(nome) {
  var nota = document.getElementById('detail-nota-input').value.trim();
  if (!nota) {
    toast('Scrivi una nota');
    return;
  }
  try {
    var r = await secPost('note_clienti', {
      nome: nome,
      nota: nota,
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    });
    noteClientiCache.unshift(r[0]);
    document.getElementById('detail-nota-input').value = '';
    apriDettaglioMaison(nome);
    toast('Nota salvata');
  } catch (e) {
    toast('Errore salvataggio nota');
  }
}
async function eliminaNotaCliente(id, nome) {
  if (!confirm('Eliminare questa nota?')) return;
  try {
    await secDel('note_clienti', 'id=eq.' + id);
    noteClientiCache = noteClientiCache.filter(function (x) {
      return x.id !== id;
    });
    apriDettaglioMaison(nome);
    toast('Nota eliminata');
  } catch (e) {
    toast('Errore eliminazione nota');
  }
}
function getMaisonFiltrati() {
  const fn = (document.getElementById('maison-filt-nome') || {}).value || '';
  const ft = (document.getElementById('maison-filt-tipo') || {}).value || '';
  const fd = (document.getElementById('maison-filt-dal') || {}).value || '';
  const fa = (document.getElementById('maison-filt-al') || {}).value || '';
  return getMaisonRepartoExpanded().filter((r) => {
    if (fn && !r.nome.toLowerCase().includes(fn.toLowerCase())) return false;
    if (ft === 'BU' && r.tipo_buono !== 'BU') return false;
    if (ft === 'BL' && r.tipo_buono !== 'BL') return false;
    if (ft === 'normale' && r.tipo_buono) return false;
    if (fd && r.data_giornata < fd) return false;
    if (fa && r.data_giornata > fa) return false;
    return true;
  });
}
function renderMaisonDashboard() {
  const data = getMaisonFiltrati();
  // Stats bar
  const totCosto = data.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totPx = data.reduce((s, r) => s + (r.px || 0), 0);
  const nClienti = new Set(data.map((r) => r.nome)).size;
  const nGiorni = new Set(data.map((r) => r.data_giornata)).size;
  const nBU = _contaBuoni(data, 'BU');
  const nBL = _contaBuoni(data, 'BL');
  const nCG = _contaBuoni(data, 'CG');
  const nWL = _contaBuoni(data, 'WL');
  const sb = document.getElementById('maison-stats-bar');
  // Determina periodo visualizzato
  const fd = (document.getElementById('maison-filt-dal') || {}).value,
    fa = (document.getElementById('maison-filt-al') || {}).value;
  let periodoLabel = '';
  if (fd && fa) {
    periodoLabel =
      new Date(fd + 'T12:00:00').toLocaleDateString('it-IT') +
      ' — ' +
      new Date(fa + 'T12:00:00').toLocaleDateString('it-IT');
  } else if (data.length) {
    const _mesiMap = {};
    data.forEach((r) => {
      const d = new Date(r.data_giornata + 'T12:00:00');
      const label = MESI_FULL[d.getMonth()] + ' ' + d.getFullYear();
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      _mesiMap[key] = label;
    });
    periodoLabel = Object.keys(_mesiMap)
      .sort()
      .map((k) => _mesiMap[k])
      .join(', ');
  }
  // Month comparison
  const oggi = new Date();
  const meseCorr = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0');
  const mesePrecDate = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
  const mesePrec = mesePrecDate.getFullYear() + '-' + String(mesePrecDate.getMonth() + 1).padStart(2, '0');
  const costoMeseCorr = getMaisonRepartoExpanded()
    .filter((r) => r.data_giornata.startsWith(meseCorr))
    .reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const costoMesePrec = getMaisonRepartoExpanded()
    .filter((r) => r.data_giornata.startsWith(mesePrec))
    .reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  let confrontoHtml = '';
  if (costoMesePrec > 0) {
    const delta = (((costoMeseCorr - costoMesePrec) / costoMesePrec) * 100).toFixed(1);
    const colore = delta > 0 ? 'var(--accent)' : delta < 0 ? '#2c6e49' : 'var(--muted)';
    confrontoHtml =
      '<div style="text-align:center;margin-bottom:10px;font-size:.88rem;color:' +
      colore +
      ';font-weight:600">' +
      (delta > 0 ? '+' : '') +
      delta +
      '% vs mese precedente (' +
      fmtCHF(costoMesePrec) +
      ' CHF &#8594; ' +
      fmtCHF(costoMeseCorr) +
      ' CHF)</div>';
  }
  sb.innerHTML =
    (periodoLabel
      ? '<div style="text-align:center;margin-bottom:10px;font-family:Playfair Display,serif;font-size:1.2rem;color:var(--ink)">' +
        periodoLabel +
        '</div>'
      : '') +
    confrontoHtml +
    '<div class="stats-bar" style="margin:0"><div class="stat"><div class="stat-num gold">' +
    fmtCHF(totCosto) +
    '</div><div class="stat-label">Totale CHF</div></div><div class="stat"><div class="stat-num blue">' +
    nClienti +
    '</div><div class="stat-label">Clienti</div></div><div class="stat"><div class="stat-num">' +
    totPx.toLocaleString('de-CH') +
    '</div><div class="stat-label">Persone</div></div><div class="stat"><div class="stat-num teal">' +
    nGiorni +
    '</div><div class="stat-label">Giorni</div></div><div class="stat"><div class="stat-num red">' +
    nBU +
    ' BU / ' +
    nBL +
    ' BL / ' +
    nCG +
    ' CG / ' +
    nWL +
    ' WL</div><div class="stat-label">Buoni</div></div></div>';
  // Tabella
  const byNome = {};
  data.forEach((r) => {
    if (!byNome[r.nome])
      byNome[r.nome] = { tot: 0, px: 0, visite: 0, bu: 0, bl: 0, cg: 0, wl: 0, condivise: 0, condivisiGruppi: [] };
    const _bn = byNome[r.nome];
    _bn.tot += parseFloat(r.costo || 0);
    _bn.px += r.px || 0;
    _bn.visite++;
    const _bq = (() => {
      const m = (r.note || '').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);
      return m ? parseInt(m[1]) : 1;
    })();
    if (r.tipo_buono === 'BU') _bn.bu += _bq;
    if (r.tipo_buono === 'BL') _bn.bl += _bq;
    if (r.tipo_buono === 'CG') _bn.cg += _bq;
    if (r.tipo_buono === 'WL') _bn.wl += _bq;
    if (r._costoOriginale) {
      _bn.condivise++;
      _bn.condivisiGruppi.push(r._gruppoOriginale);
    }
  });
  const sorted = Object.entries(byNome).sort((a, b) => b[1].tot - a[1].tot);
  const tb = document.getElementById('maison-table');
  if (!sorted.length) {
    tb.innerHTML =
      '<p style="color:var(--muted);text-align:center;padding:20px">Nessun dato. Carica un file Excel per iniziare.</p>';
    ['chart-maison-trend', 'chart-maison-top', 'chart-maison-tipi'].forEach(function (id) {
      if (charts[id]) {
        charts[id].destroy();
        delete charts[id];
      }
    });
    renderMaisonGdOggi();
    return;
  }
  // Gestione giorni per eliminazione
  const giorniDisp = [...new Set(data.map((r) => r.data_giornata))].sort();
  const mesiDisp = [...new Set(data.map((r) => r.data_giornata.substring(0, 7)))].sort();
  const MESI_SHORT_M = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  let thtml =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4 style="font-family:Playfair Display,serif;margin:0;color:var(--ink)">Dettaglio per cliente</h4><button class="btn-reset" onclick="toggleSezione(\'maison-table-inner\',this)" style="font-size:.92rem;padding:6px 16px">&#9650; Nascondi</button></div><div id="maison-table-inner"><div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;flex-wrap:wrap"><select id="maison-del-giorno" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="">Seleziona giorno...</option>' +
    giorniDisp
      .map((d) => '<option value="' + d + '">' + new Date(d + 'T12:00:00').toLocaleDateString('it-IT') + '</option>')
      .join('') +
    '</select><button class="btn-act del" onclick="eliminaMaisonGiorno()" style="padding:5px 12px">Elimina giorno</button><select id="maison-del-mese" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="">Seleziona mese...</option>' +
    mesiDisp
      .map(
        (m) =>
          '<option value="' +
          m +
          '">' +
          MESI_SHORT_M[parseInt(m.split('-')[1]) - 1] +
          ' ' +
          m.split('-')[0] +
          '</option>',
      )
      .join('') +
    '</select><button class="btn-act del" onclick="eliminaMaisonMese()" style="padding:5px 12px">Elimina mese</button></div>';
  thtml +=
    '<div style="overflow-x:auto"><table class="collab-table"><thead style="position:sticky;top:0;z-index:2"><tr><th style="background:var(--paper)">Cliente</th><th class="num" style="background:var(--paper)">Visite</th><th class="num" style="background:var(--paper)">Persone</th><th class="num" style="background:var(--paper)">BU</th><th class="num" style="background:var(--paper)">BL</th><th class="num" style="background:var(--paper)">CG</th><th class="num" style="background:var(--paper)">WL</th><th class="num" style="background:var(--paper)">Totale CHF</th><th class="num" style="background:var(--paper)">Media CHF</th><th style="background:var(--paper)"></th></tr></thead><tbody>';
  const _brDash = getBudgetReparto();
  sorted.forEach(([nome, d], _idx) => {
    let budget = _brDash.find((b) => b.nome.toLowerCase() === nome.toLowerCase());
    // Fallback: match per cognome (primo token)
    if (!budget) {
      const _cog = nome.toLowerCase().split(/\s+/)[0];
      if (_cog.length >= 3) budget = _brDash.find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
    }
    const overBudget = budget && budget.budget_chf && d.tot >= budget.budget_chf;
    const nearBudget = budget && budget.budget_chf && d.tot >= budget.budget_chf * 0.8 && !overBudget;
    const catBg =
      budget && budget.categoria === 'full_maison'
        ? 'background:rgba(184,134,11,0.12)'
        : budget && budget.categoria === 'maison'
          ? 'background:rgba(41,128,185,0.12)'
          : budget && budget.categoria === 'direzione'
            ? 'background:rgba(142,68,173,0.12)'
            : budget && budget.categoria === 'bu'
              ? 'background:rgba(230,126,34,0.12)'
              : budget && budget.categoria === 'bl'
                ? 'background:rgba(44,110,73,0.12)'
                : _idx % 2
                  ? 'background:rgba(0,0,0,0.04)'
                  : 'background:var(--paper)';
    const rowStyle = overBudget
      ? 'background:rgba(192,57,43,0.1)'
      : nearBudget
        ? 'background:rgba(230,126,34,0.1)'
        : catBg;
    const ne = nome.replace(/'/g, "\\'");
    const clientInfo = budget;
    const catBadge =
      clientInfo && clientInfo.categoria === 'full_maison'
        ? '<span class="mini-badge" style="background:#b8860b;margin-left:6px">Full Maison</span>'
        : clientInfo && clientInfo.categoria === 'maison'
          ? '<span class="mini-badge" style="background:#2980b9;margin-left:6px">Maison</span>'
          : clientInfo && clientInfo.categoria === 'direzione'
            ? '<span class="mini-badge" style="background:#8e44ad;margin-left:6px">Direzione</span>'
            : clientInfo && clientInfo.categoria === 'bu'
              ? '<span class="mini-badge" style="background:#e67e22;margin-left:6px">Buono Unico</span>'
              : clientInfo && clientInfo.categoria === 'bl'
                ? '<span class="mini-badge" style="background:#2c6e49;margin-left:6px">Buono Lounge</span>'
                : '';
    const condBadge = d.condivise
      ? ' <span title="' +
        d.condivise +
        ' voci condivise (costo diviso)" style="font-size:.78rem;color:var(--accent2);font-weight:600;cursor:help">÷' +
        [...new Set(d.condivisiGruppi)].length +
        '</span>'
      : '';
    thtml +=
      '<tr style="' +
      rowStyle +
      '"><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\'' +
      ne +
      '\')">' +
      escP(nome) +
      '</span></strong>' +
      catBadge +
      (overBudget
        ? ' <span style="color:var(--accent);font-size:.75rem;font-weight:700">BUDGET SUPERATO</span>'
        : nearBudget
          ? ' <span style="color:#e67e22;font-size:.75rem;font-weight:700">80% BUDGET</span>'
          : '') +
      '</td><td class="num">' +
      d.visite +
      '</td><td class="num">' +
      d.px +
      '</td><td class="num">' +
      (d.bu || '-') +
      '</td><td class="num">' +
      (d.bl || '-') +
      '</td><td class="num">' +
      (d.cg || '-') +
      '</td><td class="num">' +
      (d.wl || '-') +
      '</td><td class="num"><strong>' +
      fmtCHF(d.tot) +
      '</strong>' +
      condBadge +
      '</td><td class="num">' +
      fmtCHF(d.tot / d.visite) +
      '</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaMaisonCliente(\'' +
      ne +
      '\')" title="Rinomina">Rinomina</button> <button class="btn-act del" onclick="eliminaMaisonCliente(\'' +
      ne +
      '\')" title="Elimina">Elimina</button></td></tr>';
  });
  thtml +=
    '<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td class="num"><strong>' +
    sorted.reduce((s, c) => s + c[1].visite, 0) +
    '</strong></td><td class="num"><strong>' +
    totPx +
    '</strong></td><td class="num"><strong>' +
    _contaBuoni(data, 'BU') +
    '</strong></td><td class="num"><strong>' +
    _contaBuoni(data, 'BL') +
    '</strong></td><td class="num"><strong>' +
    _contaBuoni(data, 'CG') +
    '</strong></td><td class="num"><strong>' +
    _contaBuoni(data, 'WL') +
    '</strong></td><td class="num"><strong>' +
    fmtCHF(totCosto) +
    '</strong></td><td></td><td></td></tr>';
  thtml += '</tbody></table></div></div>';
  tb.innerHTML = thtml;
  // Grafici
  renderMaisonCharts(data, sorted);
  renderMaisonGdOggi();
}
let _gdSelezionata = null;
function cambiaGdMaison(dir) {
  const tutteDate = [...new Set(getMaisonRepartoExpanded().map((r) => r.data_giornata))].sort();
  if (!tutteDate.length) return;
  const attuale = _gdSelezionata || getGiornataCasino();
  const idx = tutteDate.indexOf(attuale);
  if (dir === 0) {
    _gdSelezionata = null;
  } // torna a oggi
  else if (dir === -1) {
    _gdSelezionata = idx > 0 ? tutteDate[idx - 1] : tutteDate[tutteDate.length - 1];
  } else {
    _gdSelezionata = idx < tutteDate.length - 1 ? tutteDate[idx + 1] : tutteDate[0];
  }
  renderMaisonGdOggi();
}
function renderMaisonGdOggi() {
  const container = document.getElementById('maison-gd-oggi');
  if (!container) return;
  const gdData = _gdSelezionata || getGiornataCasino();
  const righe = getMaisonRepartoExpanded().filter((r) => r.data_giornata === gdData);
  const isOggi = gdData === getGiornataCasino();
  const tutteDate = [...new Set(getMaisonRepartoExpanded().map((r) => r.data_giornata))].sort();
  const haAltriDati = tutteDate.length > 0;
  if (!righe.length) {
    const dt = new Date(gdData + 'T12:00:00');
    const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const dataFmt = dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let emptyH =
      '<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="display:flex;align-items:center;gap:6px">';
    if (haAltriDati)
      emptyH +=
        '<button onclick="cambiaGdMaison(-1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700">&#9664;</button>';
    emptyH +=
      '<input type="text" id="gd-date-picker" value="' +
      dataFmt +
      '" readonly style="cursor:pointer;padding:5px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:130px;text-align:center;font-weight:600">';
    if (haAltriDati)
      emptyH +=
        '<button onclick="cambiaGdMaison(1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700">&#9654;</button>';
    emptyH += '<span style="font-weight:400;font-size:.85rem;color:var(--muted)">' + GIORNI[dt.getDay()] + '</span>';
    if (!isOggi)
      emptyH +=
        '<button onclick="cambiaGdMaison(0)" style="background:none;border:1px solid var(--accent2);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--accent2);font-size:.78rem;font-weight:600">Oggi</button>';
    emptyH +=
      '</div></div><div style="padding:16px;text-align:center;color:var(--muted);font-size:.88rem">Nessun costo Maison per questa GD</div>';
    container.innerHTML = emptyH;
    container.style.display = '';
    const _ep = document.getElementById('gd-date-picker');
    if (_ep && window.flatpickr) {
      flatpickr(_ep, {
        locale: 'it',
        dateFormat: 'd/m/Y',
        defaultDate: dt,
        onChange: function (sel) {
          if (sel[0]) {
            _gdSelezionata =
              sel[0].getFullYear() +
              '-' +
              String(sel[0].getMonth() + 1).padStart(2, '0') +
              '-' +
              String(sel[0].getDate()).padStart(2, '0');
            renderMaisonGdOggi();
          }
        },
      });
    }
    return;
  }
  righe.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const totCHF = righe.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totPX = righe.reduce((s, r) => s + (r.px || 0), 0);
  const dt = new Date(gdData + 'T12:00:00');
  const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const dataFmt = dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const _brGd = getBudgetReparto();
  // Conteggio buoni per l'header
  const _gdBU = _contaBuoni(righe, 'BU'),
    _gdBL = _contaBuoni(righe, 'BL');
  const _gdCG = _contaBuoni(righe, 'CG'),
    _gdWL = _contaBuoni(righe, 'WL');
  let h =
    '<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<div style="display:flex;align-items:center;gap:6px">';
  h +=
    '<button onclick="cambiaGdMaison(-1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700" title="Giorno precedente">&#9664;</button>';
  h +=
    '<input type="text" id="gd-date-picker" value="' +
    dataFmt +
    '" readonly style="cursor:pointer;padding:5px 10px;border:1px solid var(--line);border-radius:2px;font-size:.88rem;background:var(--paper);color:var(--ink);width:130px;text-align:center;font-weight:600">';
  h +=
    '<button onclick="cambiaGdMaison(1)" style="background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;padding:6px 14px;font-size:.9rem;font-weight:700" title="Giorno successivo">&#9654;</button>';
  h += '<span style="font-weight:400;font-size:.85rem;color:var(--muted)">' + GIORNI[dt.getDay()] + '</span>';
  if (!isOggi)
    h +=
      '<button onclick="cambiaGdMaison(0)" style="background:none;border:1px solid var(--accent2);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--accent2);font-size:.78rem;font-weight:600">Oggi</button>';
  h += '</div>';
  h +=
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-weight:400;font-size:.85rem;color:var(--muted)">CHF ' +
    fmtCHF(totCHF) +
    ' &middot; ' +
    totPX +
    ' PX' +
    (_gdBU ? ' &middot; ' + _gdBU + ' BU' : '') +
    (_gdBL ? ' &middot; ' + _gdBL + ' BL' : '') +
    (_gdCG ? ' &middot; ' + _gdCG + ' CG' : '') +
    (_gdWL ? ' &middot; ' + _gdWL + ' WL' : '') +
    '</span>';
  h +=
    '<button onclick="esportaGdOggiCSV()" style="font-size:.72rem;padding:4px 10px;background:none;border:1px solid white;color:white;border-radius:2px;cursor:pointer;font-family:Source Sans 3,sans-serif;font-weight:600">CSV</button>';
  h +=
    '<button onclick="esportaGdOggiPDF()" style="font-size:.72rem;padding:4px 10px;background:none;border:1px solid #c0392b;color:#c0392b;border-radius:2px;cursor:pointer;font-family:Source Sans 3,sans-serif;font-weight:600">PDF</button></div></div>';
  h +=
    '<div style="padding:0 16px 16px;overflow-x:auto"><table class="collab-table"><thead><tr><th style="background:var(--paper)">Cliente</th><th style="background:var(--paper)">Tipo</th><th class="num" style="background:var(--paper)">PX</th><th class="num" style="background:var(--paper)">Costo CHF</th><th style="background:var(--paper)"></th></tr></thead><tbody>';
  // Raggruppa righe con stesso gruppo (es. Bonomelli/Grignani)
  const _gdVisti = new Set();
  righe.forEach(function (r) {
    if (_gdVisti.has(r.id)) return;
    var ne = r.nome.replace(/'/g, "\\'");
    // Se ha un gruppo, mostra la riga raggruppata
    if (r.gruppo && r.gruppo.length > 1) {
      const gruppoRighe = righe.filter((x) => x.gruppo === r.gruppo);
      gruppoRighe.forEach((x) => _gdVisti.add(x.id));
      const totGruppo = gruppoRighe.reduce((s, x) => s + parseFloat(x.costo || 0), 0);
      const totPxGruppo = gruppoRighe.reduce((s, x) => s + (x.px || 0), 0);
      const primoNome = gruppoRighe[0].nome;
      const neP = primoNome.replace(/'/g, "\\'");
      var budget = _brGd.find(function (b) {
        return b.nome.toLowerCase() === primoNome.toLowerCase();
      });
      if (!budget) {
        var _cog = primoNome.toLowerCase().split(/\s+/)[0];
        if (_cog.length >= 3)
          budget = _brGd.find(function (b) {
            return b.nome.toLowerCase().split(/\s+/)[0] === _cog;
          });
      }
      var catBadge =
        budget && budget.categoria
          ? '<span class="mini-badge" style="background:' +
            ({ full_maison: '#b8860b', maison: '#2980b9', direzione: '#8e44ad', bu: '#e67e22', bl: '#2c6e49' }[
              budget.categoria
            ] || 'var(--muted)') +
            ';margin-left:6px">' +
            ({
              full_maison: 'Full Maison',
              maison: 'Maison',
              direzione: 'Direzione',
              bu: 'Buono Unico',
              bl: 'Buono Lounge',
            }[budget.categoria] || '') +
            '</span>'
          : '';
      const altriNomi = gruppoRighe
        .slice(1)
        .map((x) => {
          let bAltro = _brGd.find((b) => b.nome.toLowerCase() === x.nome.toLowerCase());
          if (!bAltro) {
            const c = x.nome.toLowerCase().split(/\s+/)[0];
            if (c.length >= 3) bAltro = _brGd.find((b) => b.nome.toLowerCase().split(/\s+/)[0] === c);
          }
          const cBadge =
            bAltro && bAltro.categoria
              ? ' <span class="mini-badge" style="background:' +
                ({ full_maison: '#b8860b', maison: '#2980b9', direzione: '#8e44ad', bu: '#e67e22', bl: '#2c6e49' }[
                  bAltro.categoria
                ] || 'var(--muted)') +
                ';font-size:.65rem">' +
                ({ full_maison: 'FM', maison: 'M', direzione: 'D', bu: 'BU', bl: 'BL' }[bAltro.categoria] || '') +
                '</span>'
              : '';
          return escP(x.nome) + cBadge;
        })
        .join(' / ');
      var _qtyM = (r.note || '').match(/(\d+)\s*(BU|BL|CG|WL)/i);
      var _qtyN = _qtyM ? parseInt(_qtyM[1]) : 1;
      var tipoBadge = r.tipo_buono
        ? '<span class="mini-badge" style="background:' +
          ({ BU: '#e67e22', BL: '#2c6e49', CG: '#8e44ad', WL: '#2980b9' }[r.tipo_buono] || 'var(--muted)') +
          '">' +
          _qtyN +
          ' ' +
          r.tipo_buono +
          '</span>'
        : '<span style="color:var(--muted)">&mdash;</span>';
      const idsGruppo = gruppoRighe.map((x) => x.id).join(',');
      h +=
        '<tr><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\'' +
        neP +
        '\')">' +
        escP(primoNome) +
        '</span></strong>' +
        catBadge +
        (altriNomi ? ' <span style="color:var(--muted);font-size:.82rem"> /' + altriNomi + '</span>' : '') +
        '</td><td>' +
        tipoBadge +
        '</td><td class="num">' +
        totPxGruppo +
        '</td><td class="num">' +
        fmtCHF(totGruppo) +
        '</td><td style="white-space:nowrap"><button class="btn-act del" onclick="eliminaMaisonGruppoGd(\'' +
        idsGruppo +
        '\')" title="Elimina gruppo">Elimina</button></td></tr>';
    } else {
      _gdVisti.add(r.id);
      var budget = _brGd.find(function (b) {
        return b.nome.toLowerCase() === r.nome.toLowerCase();
      });
      if (!budget) {
        var _cog = r.nome.toLowerCase().split(/\s+/)[0];
        if (_cog.length >= 3)
          budget = _brGd.find(function (b) {
            return b.nome.toLowerCase().split(/\s+/)[0] === _cog;
          });
      }
      var catBadge =
        budget && budget.categoria
          ? '<span class="mini-badge" style="background:' +
            ({ full_maison: '#b8860b', maison: '#2980b9', direzione: '#8e44ad', bu: '#e67e22', bl: '#2c6e49' }[
              budget.categoria
            ] || 'var(--muted)') +
            ';margin-left:6px">' +
            ({
              full_maison: 'Full Maison',
              maison: 'Maison',
              direzione: 'Direzione',
              bu: 'Buono Unico',
              bl: 'Buono Lounge',
            }[budget.categoria] || '') +
            '</span>'
          : '';
      var _qtyM = (r.note || '').match(/(\d+)\s*(BU|BL|CG|WL)/i);
      var _qtyN = _qtyM ? parseInt(_qtyM[1]) : 1;
      var tipoBadge = r.tipo_buono
        ? '<span class="mini-badge" style="background:' +
          ({ BU: '#e67e22', BL: '#2c6e49', CG: '#8e44ad', WL: '#2980b9' }[r.tipo_buono] || 'var(--muted)') +
          '">' +
          _qtyN +
          ' ' +
          r.tipo_buono +
          '</span>'
        : '<span style="color:var(--muted)">&mdash;</span>';
      h +=
        '<tr><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\'' +
        ne +
        '\')">' +
        escP(r.nome) +
        '</span></strong>' +
        catBadge +
        '</td><td>' +
        tipoBadge +
        '</td><td class="num">' +
        r.px +
        '</td><td class="num">' +
        fmtCHF(r.costo) +
        '</td><td style="white-space:nowrap"><button class="btn-act del" onclick="eliminaMaisonRigaGd(' +
        r.id +
        ')" title="Elimina">Elimina</button></td></tr>';
    }
  });
  const _totBuoni = [
    _gdBU ? _gdBU + ' BU' : '',
    _gdBL ? _gdBL + ' BL' : '',
    _gdCG ? _gdCG + ' CG' : '',
    _gdWL ? _gdWL + ' WL' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  h +=
    '<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td style="font-size:.78rem;color:var(--muted)">' +
    (_totBuoni || '') +
    '</td><td class="num"><strong>' +
    totPX +
    ' PX</strong></td><td class="num"><strong>CHF ' +
    fmtCHF(totCHF) +
    '</strong></td><td></td></tr>';
  h += '</tbody></table></div>';
  container.innerHTML = h;
  container.style.display = '';
  // Init flatpickr sul date picker
  const _gdPicker = document.getElementById('gd-date-picker');
  if (_gdPicker && window.flatpickr) {
    flatpickr(_gdPicker, {
      locale: 'it',
      dateFormat: 'd/m/Y',
      defaultDate: dt,
      onChange: function (sel) {
        if (sel[0]) {
          _gdSelezionata =
            sel[0].getFullYear() +
            '-' +
            String(sel[0].getMonth() + 1).padStart(2, '0') +
            '-' +
            String(sel[0].getDate()).padStart(2, '0');
          renderMaisonGdOggi();
        }
      },
    });
  }
}
async function eliminaMaisonRigaGd(id) {
  if (!confirm('Eliminare questa riga?')) return;
  try {
    await secDel('costi_maison', 'id=eq.' + id);
    maisonCache = maisonCache.filter(function (r) {
      return r.id !== id;
    });
    logAzione('Maison: eliminata riga GD', 'ID ' + id);
    renderMaisonGdOggi();
    renderMaisonDashboard();
    toast('Riga eliminata');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
async function eliminaMaisonGruppoGd(idsStr) {
  const ids = idsStr.split(',').map(Number);
  if (!confirm('Eliminare questo gruppo (' + ids.length + ' righe)?')) return;
  try {
    for (const id of ids) {
      await secDel('costi_maison', 'id=eq.' + id);
      maisonCache = maisonCache.filter((r) => r.id !== id);
    }
    logAzione('Maison: eliminato gruppo GD', ids.length + ' righe');
    renderMaisonGdOggi();
    renderMaisonDashboard();
    toast('Gruppo eliminato');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
function _raggruppaGdRighe(righe) {
  const result = [];
  const visti = new Set();
  righe.forEach((r) => {
    if (visti.has(r.id)) return;
    if (r.gruppo && r.gruppo.length > 1) {
      const gr = righe.filter((x) => x.gruppo === r.gruppo);
      gr.forEach((x) => visti.add(x.id));
      result.push({
        nome: gr[0].nome,
        altriNomi: gr.slice(1).map((x) => x.nome),
        tipo_buono: r.tipo_buono,
        note: r.note || '',
        px: gr.reduce((s, x) => s + (x.px || 0), 0),
        costo: gr.reduce((s, x) => s + parseFloat(x.costo || 0), 0),
        ids: gr.map((x) => x.id),
      });
    } else {
      visti.add(r.id);
      result.push({
        nome: r.nome,
        altriNomi: [],
        tipo_buono: r.tipo_buono,
        note: r.note || '',
        px: r.px,
        costo: parseFloat(r.costo || 0),
        ids: [r.id],
      });
    }
  });
  return result;
}
function esportaGdOggiCSV() {
  const oggi = _gdSelezionata || getGiornataCasino();
  const righe = getMaisonRepartoExpanded()
    .filter((r) => r.data_giornata === oggi)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!righe.length) {
    toast('Nessun dato');
    return;
  }
  const grouped = _raggruppaGdRighe(righe);
  const dt = new Date(oggi + 'T12:00:00');
  const _catL = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  const rows = [
    ['GD ' + dt.toLocaleDateString('it-IT') + ' — ' + GIORNI[dt.getDay()]],
    ['Cliente', 'Categoria', 'Tipo', 'PX', 'Costo CHF'],
  ];
  const _br = getBudgetReparto();
  grouped.forEach((g) => {
    let b = _br.find((x) => x.nome.toLowerCase() === g.nome.toLowerCase());
    if (!b) {
      const c = g.nome.toLowerCase().split(/\s+/)[0];
      if (c.length >= 3) b = _br.find((x) => x.nome.toLowerCase().split(/\s+/)[0] === c);
    }
    const label = g.nome + (g.altriNomi.length ? '/' + g.altriNomi.join('/') : '');
    const _qm = (g.note || '').match(/(\d+)\s*(BU|BL|CG|WL)/i);
    const _qn = _qm ? parseInt(_qm[1]) : 1;
    rows.push([
      label,
      b && b.categoria ? _catL[b.categoria] || '' : '',
      g.tipo_buono ? _qn + ' ' + g.tipo_buono : '—',
      g.px,
      fmtCHF(g.costo),
    ]);
  });
  const tot = grouped.reduce((s, g) => s + g.costo, 0);
  rows.push(['TOTALE', '', '', grouped.reduce((s, g) => s + g.px, 0) + ' PX', 'CHF ' + fmtCHF(tot)]);
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'maison_gd_' + oggi + '.csv',
  }).click();
  toast('CSV GD esportato!');
}
async function esportaGdOggiPDF() {
  const oggi = _gdSelezionata || getGiornataCasino();
  const righe = getMaisonRepartoExpanded()
    .filter((r) => r.data_giornata === oggi)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!righe.length) {
    toast('Nessun dato');
    return;
  }
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore');
      return;
    }
  }
  const dt = new Date(oggi + 'T12:00:00');
  const tot = righe.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totPx = righe.reduce((s, r) => s + (r.px || 0), 0);
  const _catL = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  const _catC = {
    full_maison: [184, 134, 11],
    maison: [41, 128, 185],
    direzione: [142, 68, 173],
    bu: [230, 126, 34],
    bl: [44, 110, 73],
  };
  const _br = getBudgetReparto();
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    let y = 14;
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Formulario Ristorante', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('GD ' + dt.toLocaleDateString('it-IT') + ' — ' + GIORNI[dt.getDay()] + ' — Casino Lugano SA', pw / 2, y, {
      align: 'center',
    });
    y += 5;
    doc.text(righe.length + ' clienti — ' + totPx + ' persone — CHF ' + fmtCHF(tot), pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    const grouped = _raggruppaGdRighe(righe);
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: 16, right: 16 },
      head: [['Cliente', 'Categoria', 'Tipo', 'PX', 'Costo CHF']],
      body: grouped.map((g) => {
        let b = _br.find((x) => x.nome.toLowerCase() === g.nome.toLowerCase());
        if (!b) {
          const c = g.nome.toLowerCase().split(/\s+/)[0];
          if (c.length >= 3) b = _br.find((x) => x.nome.toLowerCase().split(/\s+/)[0] === c);
        }
        const label = g.nome + (g.altriNomi.length ? '/' + g.altriNomi.join('/') : '');
        const _qm = (g.note || '').match(/(\d+)\s*(BU|BL|CG|WL)/i);
        const _qn = _qm ? parseInt(_qm[1]) : 1;
        return [
          label,
          b && b.categoria ? _catL[b.categoria] || '' : '',
          g.tipo_buono ? _qn + ' ' + g.tipo_buono : '—',
          g.px,
          fmtCHF(g.costo),
        ];
      }),
      foot: [
        [
          'TOTALE',
          '',
          righe.filter((r) => r.tipo_buono).length
            ? [
                _contaBuoni(righe, 'BU') ? _contaBuoni(righe, 'BU') + ' BU' : '',
                _contaBuoni(righe, 'BL') ? _contaBuoni(righe, 'BL') + ' BL' : '',
                _contaBuoni(righe, 'CG') ? _contaBuoni(righe, 'CG') + ' CG' : '',
                _contaBuoni(righe, 'WL') ? _contaBuoni(righe, 'WL') + ' WL' : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : '',
          totPx + ' PX',
          'CHF ' + fmtCHF(tot),
        ],
      ],
      headStyles: { fillColor: [184, 134, 11], halign: 'center' },
      footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'left', cellWidth: 50 },
        1: { halign: 'left', cellWidth: 30 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
      },
      didParseCell: function (d) {
        if (d.section === 'body' && d.column.index === 1) {
          const c = Object.entries(_catL).find(([k, v]) => v === d.cell.raw);
          if (c && _catC[c[0]]) {
            d.cell.styles.textColor = _catC[c[0]];
            d.cell.styles.fontStyle = 'bold';
          }
        }
      },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      'Casino Lugano SA — Formulario Ristorante GD ' + dt.toLocaleDateString('it-IT'),
      16,
      doc.internal.pageSize.getHeight() - 8,
    );
    mostraPdfPreview(doc, 'formulario_gd_' + oggi + '.pdf', 'Formulario GD ' + dt.toLocaleDateString('it-IT'));
  } catch (e) {
    toast('Errore PDF');
  }
}
function renderMaisonCharts(data, sorted) {
  // Trend giornaliero
  const byDay = {};
  data.forEach((r) => {
    byDay[r.data_giornata] = (byDay[r.data_giornata] || 0) + parseFloat(r.costo || 0);
  });
  const days = Object.keys(byDay).sort();
  const _giorniAbbr = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  renderChart(
    'chart-maison-trend',
    'line',
    {
      labels: days.map((d) => {
        const dt = new Date(d + 'T12:00:00');
        return _giorniAbbr[dt.getDay()] + ' ' + dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      }),
      datasets: [
        {
          label: 'Spesa CHF',
          data: days.map((d) => byDay[d]),
          borderColor: '#b8860b',
          backgroundColor: 'rgba(184,134,11,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        },
      ],
    },
    {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return 'Spesa CHF: ' + fmtCHF(c.raw);
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function (v) {
              return fmtCHF(v);
            },
          },
        },
      },
    },
  );
  // Top clienti
  const top15 = sorted.slice(0, 15);
  renderChart(
    'chart-maison-top',
    'bar',
    {
      labels: top15.map((c) => c[0]),
      datasets: [
        { label: 'CHF', data: top15.map((c) => c[1].tot), backgroundColor: 'rgba(184,134,11,0.7)', borderRadius: 4 },
      ],
    },
    {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (c) {
              return 'CHF ' + fmtCHF(c.raw);
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: function (v) {
              return fmtCHF(v);
            },
          },
        },
        y: { ticks: { autoSkip: false, font: { size: 11 } } },
      },
    },
  );
  // Distribuzione tipo
  const normale = data.filter((r) => !r.tipo_buono).reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const buTot = data.filter((r) => r.tipo_buono === 'BU').reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const blTot = data.filter((r) => r.tipo_buono === 'BL').reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const cgTot = data.filter((r) => r.tipo_buono === 'CG').reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const wlTot = data.filter((r) => r.tipo_buono === 'WL').reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  renderChart(
    'chart-maison-tipi',
    'doughnut',
    {
      labels: [
        'Consumazione (' + fmtCHF(normale) + ' CHF)',
        'Buono Unico (' + fmtCHF(buTot) + ' CHF)',
        'Buono Lounge (' + fmtCHF(blTot) + ' CHF)',
        'C. Gourmet (' + fmtCHF(cgTot) + ' CHF)',
        'Welcome L. (' + fmtCHF(wlTot) + ' CHF)',
      ],
      datasets: [
        {
          data: [normale, buTot, blTot, cgTot, wlTot],
          backgroundColor: ['#b8860b', '#e67e22', '#2c6e49', '#8e44ad', '#2980b9'],
          borderWidth: 2,
          borderColor: 'white',
        },
      ],
    },
    { plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } } },
  );
}
function resetMaisonFiltri() {
  document.getElementById('maison-filt-nome').value = '';
  document.getElementById('maison-filt-tipo').value = '';
  ['maison-filt-dal', 'maison-filt-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
  renderMaisonDashboard();
}
function _isCompleannoOggi(dataNascita) {
  if (!dataNascita) return false;
  const oggi = new Date();
  const dn = new Date(dataNascita + 'T12:00:00');
  return dn.getDate() === oggi.getDate() && dn.getMonth() === oggi.getMonth();
}
function _getCompleanniProssimi(giorni) {
  const now = new Date();
  const oggi = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = [];
  getBudgetReparto().forEach((b) => {
    if (!b.data_nascita) return;
    const dn = new Date(b.data_nascita + 'T12:00:00');
    const quest = new Date(now.getFullYear(), dn.getMonth(), dn.getDate());
    if (quest < oggi) quest.setFullYear(quest.getFullYear() + 1);
    const diff = Math.round((quest - oggi) / 86400000);
    if (diff >= 0 && diff <= giorni) result.push({ nome: b.nome, data: quest, giorni: diff });
  });
  return result.sort((a, b) => a.giorni - b.giorni);
}
function _maisonFilePeriodo(data) {
  if (!data || !data.length) return '';
  const mesi = [];
  data.forEach((r) => {
    const d = new Date((r.data_giornata || '') + 'T12:00:00');
    if (!isNaN(d)) {
      const k = MESI_FULL[d.getMonth()].toLowerCase() + '_' + d.getFullYear();
      if (!mesi.includes(k)) mesi.push(k);
    }
  });
  if (mesi.length <= 1) return mesi[0] || '';
  return 'da_' + mesi[0] + '_a_' + mesi[mesi.length - 1];
}
// Dettaglio cliente: mostra tutte le visite giorno per giorno
function apriDettaglioMaison(nome) {
  const righe = getMaisonFiltrati()
    .filter((r) => r.nome === nome)
    .sort((a, b) => a.data_giornata.localeCompare(b.data_giornata));
  let budget = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
  if (!budget) {
    const _cog = nome.toLowerCase().split(/\s+/)[0];
    if (_cog.length >= 3) budget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
  }
  const _seCheck = getSpeseReparto().filter((r) => r.beneficiario.toLowerCase() === nome.toLowerCase());
  const _regCheck = getRegaliReparto().filter(function (r) {
    return r.nome.toLowerCase() === nome.toLowerCase();
  });
  if (!righe.length && !_seCheck.length && !_regCheck.length && !budget) {
    toast('Nessun dato per ' + nome);
    return;
  }
  const tot = righe.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totPx = righe.reduce((s, r) => s + (r.px || 0), 0);
  const nBU = _contaBuoni(righe, 'BU'),
    nBL = _contaBuoni(righe, 'BL'),
    nCG_d = _contaBuoni(righe, 'CG'),
    nWL_d = _contaBuoni(righe, 'WL');
  const mesiCliente = righe.length
    ? [
        ...new Set(
          righe.map((r) => {
            const d = new Date(r.data_giornata + 'T12:00:00');
            return MESI_FULL[d.getMonth()] + ' ' + d.getFullYear();
          }),
        ),
      ].join(', ')
    : '';
  const catBadgeD =
    budget && budget.categoria === 'full_maison'
      ? ' <span class="mini-badge" style="background:#b8860b;font-size:.78rem">Full Maison</span>'
      : budget && budget.categoria === 'maison'
        ? ' <span class="mini-badge" style="background:#2980b9;font-size:.78rem">Maison</span>'
        : budget && budget.categoria === 'direzione'
          ? ' <span class="mini-badge" style="background:#8e44ad;font-size:.78rem">Direzione</span>'
          : budget && budget.categoria === 'bu'
            ? ' <span class="mini-badge" style="background:#e67e22;font-size:.78rem">Buono Unico</span>'
            : budget && budget.categoria === 'bl'
              ? ' <span class="mini-badge" style="background:#2c6e49;font-size:.78rem">Buono Lounge</span>'
              : '';
  const nascitaStr =
    budget && budget.data_nascita ? new Date(budget.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '';
  const ne = nome.replace(/'/g, "\\'");
  const _curCat = (budget && budget.categoria) || '';
  const catSelect =
    ' <select id="detail-cat-select" onchange="salvaDetailCat(\'' +
    ne +
    '\')" style="font-size:.78rem;padding:3px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink);vertical-align:middle;cursor:pointer"><option value=""' +
    (!_curCat ? ' selected' : '') +
    '>— Categoria —</option><option value="full_maison"' +
    (_curCat === 'full_maison' ? ' selected' : '') +
    '>Full Maison</option><option value="maison"' +
    (_curCat === 'maison' ? ' selected' : '') +
    '>Maison</option><option value="direzione"' +
    (_curCat === 'direzione' ? ' selected' : '') +
    '>Direzione</option><option value="bu"' +
    (_curCat === 'bu' ? ' selected' : '') +
    '>Buono Unico</option><option value="bl"' +
    (_curCat === 'bl' ? ' selected' : '') +
    '>Buono Lounge</option></select>';
  let html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:4px">' +
    escP(nome) +
    catBadgeD +
    catSelect +
    '</h3><p style="color:var(--accent2);font-size:.9rem;font-weight:600;margin-bottom:2px">' +
    mesiCliente +
    '</p><p style="color:var(--muted);font-size:.82rem">' +
    righe.length +
    ' visite — ' +
    totPx +
    ' persone — ' +
    fmtCHF(tot) +
    ' CHF' +
    (nBU ? ' — ' + nBU + ' BU' : '') +
    (nBL ? ' — ' + nBL + ' BL' : '') +
    '</p>' +
    (budget && budget.budget_chf
      ? '<p style="font-size:.82rem;color:' +
        (tot >= budget.budget_chf ? 'var(--accent)' : tot >= budget.budget_chf * 0.8 ? '#e67e22' : '#2c6e49') +
        ';font-weight:600">Budget: ' +
        fmtCHF(tot) +
        ' / ' +
        fmtCHF(parseFloat(budget.budget_chf)) +
        ' CHF (' +
        Math.round((tot / budget.budget_chf) * 100) +
        '%)</p>'
      : '') +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="font-size:.82rem;color:var(--muted)">Data nascita:</span><input type="text" id="detail-nascita" value="' +
    ((budget && budget.data_nascita) || '') +
    '" placeholder="Seleziona..." readonly style="cursor:pointer;padding:4px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper2);color:var(--ink);width:120px"><button class="btn-salva" onclick="salvaDetailNascita(\'' +
    ne +
    '\')" style="font-size:.78rem;padding:5px 14px;background:var(--accent2)">Salva</button>' +
    (nascitaStr ? ' <span style="font-size:.82rem;color:var(--muted)">Attuale: ' + nascitaStr + '</span>' : '') +
    '</div>' +
    (budget && budget.aggiornato_da
      ? '<p style="font-size:.78rem;color:var(--muted);margin-top:4px">Ultimo aggiornamento: ' +
        escP(budget.aggiornato_da) +
        (budget.aggiornato_at
          ? ' — ' +
            new Date(budget.aggiornato_at).toLocaleDateString('it-IT') +
            ' ' +
            new Date(budget.aggiornato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
          : '') +
        '</p>'
      : '') +
    '</div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  // Pre-compute spese extra e regali per KPI (riusa dati gia calcolati sopra)
  const seRighe = _seCheck.sort((a, b) => a.data_spesa.localeCompare(b.data_spesa));
  const totSE = seRighe.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
  var regRighe = _regCheck.sort(function (a, b) {
    return (a.data_regalo || '').localeCompare(b.data_regalo || '');
  });
  var totReg = regRighe.length
    ? regRighe.reduce(function (s, r) {
        return s + parseFloat(r.importo || 0);
      }, 0)
    : 0;
  // --- KPI Summary Cards ---
  const _mediaVisita = righe.length ? tot / righe.length : 0;
  const _dateSort = righe.map((r) => r.data_giornata).sort();
  const _ultimoPass = _dateSort.length ? new Date(_dateSort[_dateSort.length - 1] + 'T12:00:00') : null;
  const _ultimoStr = _ultimoPass
    ? _ultimoPass.getDate() + ' ' + MESI[_ultimoPass.getMonth()] + ' ' + _ultimoPass.getFullYear()
    : '—';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#b8860b">CHF ' +
    fmtCHF(tot) +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Ristorante</div></div>';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#2980b9">CHF ' +
    fmtCHF(totSE) +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Extra</div></div>';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:#1a7a6d">CHF ' +
    fmtCHF(totReg) +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Totale Regali</div></div>';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">CHF ' +
    fmtCHF(_mediaVisita) +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Media/visita</div></div>';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">' +
    righe.length +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Visite totali</div></div>';
  html +=
    '<div style="flex:1;min-width:100px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.2rem;font-weight:700;color:var(--ink)">' +
    _ultimoStr +
    '</div><div style="font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">Ultimo passaggio</div></div>';
  html += '</div>';
  // --- Frequenza visite + giorno preferito ---
  if (righe.length) {
    const _giorniCount = [0, 0, 0, 0, 0, 0, 0];
    righe.forEach((r) => {
      const d = new Date(r.data_giornata + 'T12:00:00');
      _giorniCount[d.getDay()]++;
    });
    const _giornoMaxIdx = _giorniCount.indexOf(Math.max(..._giorniCount));
    const _giornoPreferito = GIORNI[_giornoMaxIdx];
    let _freqStr = '—';
    if (_dateSort.length >= 2) {
      const _d0 = new Date(_dateSort[0] + 'T12:00:00');
      const _d1 = new Date(_dateSort[_dateSort.length - 1] + 'T12:00:00');
      const _diffWeeks = Math.max(1, (_d1 - _d0) / (7 * 86400000));
      _freqStr = (_dateSort.length / _diffWeeks).toFixed(1) + ' visite/sett.';
    } else if (_dateSort.length === 1) {
      _freqStr = '1 visita';
    }
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:.85rem;color:var(--muted)">';
    html += '<span>Ultimo passaggio: <strong style="color:var(--ink)">' + _ultimoStr + '</strong></span>';
    html += '<span>Giorno preferito: <strong style="color:var(--ink)">' + _giornoPreferito + '</strong></span>';
    html += '<span>Frequenza: <strong style="color:var(--ink)">' + _freqStr + '</strong></span>';
    html += '</div>';
  }
  // --- Month-over-month comparison ---
  const _byMese = {};
  const _byMeseKeys = {};
  righe.forEach((r) => {
    const d = new Date(r.data_giornata + 'T12:00:00');
    const k = MESI[d.getMonth()] + ' ' + d.getFullYear();
    const sortKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!_byMese[k]) {
      _byMese[k] = 0;
      _byMeseKeys[k] = sortKey;
    }
    _byMese[k] += parseFloat(r.costo || 0);
  });
  const _mesiArr = Object.keys(_byMese)
    .sort((a, b) => _byMeseKeys[a].localeCompare(_byMeseKeys[b]))
    .map((k) => [k, _byMese[k]]);
  if (_mesiArr.length > 0) {
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center">';
    _mesiArr.forEach(function (m, i) {
      const val = m[1];
      const lbl = m[0];
      let deltaHtml = '';
      if (i > 0) {
        const prev = _mesiArr[i - 1][1];
        if (prev > 0) {
          const pct = (((val - prev) / prev) * 100).toFixed(0);
          const isUp = val > prev;
          deltaHtml =
            ' <span style="font-size:.7rem;font-weight:700;color:' +
            (isUp ? '#c0392b' : '#27ae60') +
            ';background:' +
            (isUp ? '#c0392b1a' : '#27ae601a') +
            ';padding:1px 5px;border-radius:2px">' +
            (isUp ? '+' : '') +
            pct +
            '%</span>';
        }
      }
      html +=
        '<div style="background:var(--paper2);border-radius:3px;padding:6px 12px;font-size:.82rem;color:var(--ink);white-space:nowrap"><strong>' +
        lbl +
        '</strong>: ' +
        fmtCHF(val) +
        ' CHF' +
        deltaHtml +
        '</div>';
      if (i < _mesiArr.length - 1) html += '<span style="color:var(--muted);font-size:.7rem">&rarr;</span>';
    });
    html += '</div>';
  }
  // --- Mini CSS bar chart ---
  if (_mesiArr.length > 1) {
    const _maxMese = Math.max(..._mesiArr.map((m) => m[1]));
    html +=
      '<div style="margin-bottom:16px;padding:10px;background:var(--paper2);border-radius:3px"><div style="font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Trend mensile</div>';
    html += '<div style="display:flex;gap:4px;align-items:flex-end;height:120px">';
    _mesiArr.forEach(function (m) {
      const h = _maxMese > 0 ? Math.max(4, Math.round((m[1] / _maxMese) * 100)) : 4;
      html +=
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;justify-content:flex-end;height:100%">';
      html += '<div style="font-size:.78rem;color:var(--muted)">' + m[1].toFixed(0) + '</div>';
      html +=
        '<div style="width:100%;max-width:40px;background:#b8860b;border-radius:2px 2px 0 0;height:' + h + 'px"></div>';
      html += '<div style="font-size:.78rem;color:var(--muted);white-space:nowrap">' + m[0].split(' ')[0] + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }
  // --- Fine nuove sezioni KPI ---
  if (righe.length) {
    html +=
      '<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Giorno</th><th class="num">PX</th><th class="num">Costo CHF</th><th>Tipo</th><th>Gruppo</th><th>Note</th><th></th></tr></thead><tbody>';
    righe.forEach((r) => {
      const d = new Date(r.data_giornata + 'T12:00:00');
      const costoTip = r._costoOriginale
        ? ' title="' +
          fmtCHF(r._costoOriginale) +
          '/' +
          r._nCondiviso +
          ' (' +
          escP(r._gruppoOriginale) +
          ')" style="cursor:help"'
        : '';
      html +=
        '<tr><td style="font-weight:600">' +
        d.getDate() +
        ' ' +
        MESI[d.getMonth()] +
        '</td><td>' +
        GIORNI[d.getDay()] +
        '</td><td class="num">' +
        r.px +
        '</td><td class="num"><strong' +
        costoTip +
        '>' +
        fmtCHF(r.costo) +
        (r._costoOriginale
          ? ' <span style="font-size:.78rem;color:var(--accent2)">÷' + r._nCondiviso + '</span>'
          : '') +
        '</strong></td><td>' +
        (r.tipo_buono
          ? '<span class="mini-badge" style="background:' +
            (r.tipo_buono === 'BU'
              ? '#e67e22'
              : r.tipo_buono === 'CG'
                ? '#8e44ad'
                : r.tipo_buono === 'WL'
                  ? '#2980b9'
                  : '#2c6e49') +
            '">' +
            r.tipo_buono +
            '</span>'
          : '—') +
        '</td><td style="color:var(--muted);font-size:.85rem">' +
        escP(r._gruppoOriginale || r.gruppo || '') +
        '</td><td style="color:var(--muted);font-size:.85rem">' +
        escP(r.note || '') +
        '</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="modificaMaisonRiga(' +
        r.id +
        ",'" +
        ne +
        '\')" style="font-size:.78rem;padding:3px 8px">Modifica</button> <button class="btn-act" onclick="spostaMaisonToExtra(' +
        r.id +
        ",'" +
        ne +
        '\')" style="font-size:.78rem;padding:3px 8px;color:#e67e22;border-color:#e67e22" title="Sposta in Spese Extra">&#8594; Extra</button> <button class="btn-act del" onclick="eliminaMaisonRigaDettaglio(' +
        r.id +
        ",'" +
        ne +
        '\')" style="font-size:.78rem;padding:3px 8px">Elimina</button></td></tr>';
    });
    const _detBuoniTot = [
      nBU ? nBU + ' BU' : '',
      nBL ? nBL + ' BL' : '',
      nCG_d ? nCG_d + ' CG' : '',
      nWL_d ? nWL_d + ' WL' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    html +=
      '<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td colspan="2"><strong>TOTALE RISTORANTE</strong></td><td class="num"><strong>' +
      totPx +
      ' PX</strong></td><td class="num"><strong>CHF ' +
      fmtCHF(tot) +
      '</strong></td><td style="font-size:.78rem;color:var(--muted)">' +
      (_detBuoniTot || '') +
      '</td><td colspan="2"></td></tr>';
    html += '</tbody></table></div>';
  } else {
    html +=
      '<p style="color:var(--muted);text-align:center;padding:12px;font-size:.9rem">Nessun costo ristorante (tutte le voci sono in Spese Extra)</p>';
  }
  // Spese Extra per questo cliente (seRighe/totSE already computed above for KPI)
  if (seRighe.length) {
    html +=
      '<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Spese Extra (CHF ' +
      fmtCHF(totSE) +
      ')</h4>';
    html +=
      '<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Tipo</th><th>Luogo</th><th>Descrizione</th><th class="num">CHF</th><th></th></tr></thead><tbody>';
    seRighe.forEach((r) => {
      const d = new Date(r.data_spesa + 'T12:00:00');
      const tc = SE_TIPI_COLOR[r.tipo] || 'var(--muted)';
      html +=
        '<tr><td style="font-weight:600">' +
        d.getDate() +
        ' ' +
        MESI[d.getMonth()] +
        '</td><td><span class="mini-badge" style="background:' +
        tc +
        '">' +
        (SE_TIPI_LABEL[r.tipo] || r.tipo) +
        '</span></td><td style="font-size:.85rem">' +
        escP(r.luogo || '') +
        '</td><td style="font-size:.85rem;color:var(--muted)">' +
        escP(r.descrizione || '') +
        '</td><td class="num"><strong>' +
        fmtCHF(r.importo) +
        '</strong></td><td style="white-space:nowrap"><button class="btn-act edit" onclick="modificaSpeseExtra(' +
        r.id +
        ')" style="font-size:.78rem;padding:3px 8px">Modifica</button> <button class="btn-act del" onclick="eliminaSpeseExtra(' +
        r.id +
        ").then(function(){apriDettaglioMaison('" +
        ne +
        '\')})" style="font-size:.78rem;padding:3px 8px">Elimina</button> <button class="btn-act" onclick="spostaExtraToMaison(' +
        r.id +
        ",'" +
        ne +
        '\')" style="font-size:.78rem;padding:3px 8px;color:#2c6e49;border-color:#2c6e49" title="Sposta in Costi Maison">&#8594; Maison</button></td></tr>';
    });
    html +=
      '<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td colspan="4"><strong>TOTALE EXTRA</strong></td><td class="num"><strong>CHF ' +
      fmtCHF(totSE) +
      '</strong></td></tr></tbody></table></div>';
  }
  // Regali per questo cliente (regRighe/totReg already computed above for KPI)
  if (regRighe.length) {
    html +=
      '<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Regali' +
      (totReg ? ' (CHF ' + fmtCHF(totReg) + ')' : '') +
      '</h4>';
    html +=
      '<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Data</th><th>Descrizione</th><th class="num">CHF</th><th>Operatore</th></tr></thead><tbody>';
    regRighe.forEach(function (r) {
      var d = new Date((r.data_regalo || r.created_at) + 'T12:00:00');
      html +=
        '<tr><td style="font-weight:600">' +
        d.toLocaleDateString('it-IT') +
        '</td><td>' +
        escP(r.descrizione || '') +
        '</td><td class="num">' +
        (r.importo ? fmtCHF(r.importo) : '—') +
        '</td><td style="color:var(--muted);font-size:.82rem">' +
        escP(r.operatore || '') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  // Note private
  var noteRighe = getNoteClientiReparto().filter(function (r) {
    return r.nome.toLowerCase() === nome.toLowerCase();
  });
  if (noteRighe.length) {
    html += '<h4 style="font-family:Playfair Display,serif;margin:16px 0 8px;color:var(--ink)">Note Private</h4>';
    noteRighe.forEach(function (r) {
      var ne2 = r.nome.replace(/'/g, "\\'");
      html +=
        '<div style="padding:10px;background:var(--paper2);border-radius:3px;margin-bottom:6px;border-left:3px solid var(--accent2);display:flex;justify-content:space-between;align-items:start"><div><p style="margin-bottom:4px">' +
        esc(r.nota) +
        '</p><small style="color:var(--muted)">' +
        escP(r.operatore || '') +
        ' — ' +
        new Date(r.created_at).toLocaleDateString('it-IT') +
        '</small></div><button class="btn-act del" onclick="eliminaNotaCliente(' +
        r.id +
        ",'" +
        ne2 +
        '\')" style="font-size:.78rem;flex-shrink:0">Elimina</button></div>';
    });
  }
  // Totale complessivo aggiornato
  var grandTotal =
    tot +
    (seRighe.length
      ? seRighe.reduce(function (s, r) {
          return s + parseFloat(r.importo || 0);
        }, 0)
      : 0) +
    totReg;
  if (grandTotal > tot) {
    html +=
      '<div style="margin-top:10px;padding:10px;background:var(--paper2);border-radius:3px;text-align:center;font-weight:700;font-size:1rem;color:var(--accent2)">TOTALE COMPLESSIVO: CHF ' +
      fmtCHF(grandTotal) +
      '</div>';
  }
  // Form aggiungi nota
  html +=
    '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--line)"><h4 style="font-family:Playfair Display,serif;margin-bottom:8px;color:var(--ink)">Aggiungi nota privata</h4><textarea id="detail-nota-input" rows="2" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem;resize:vertical;background:var(--paper2);color:var(--ink)" placeholder="Scrivi una nota..."></textarea><button class="btn-salva" onclick="salvaNotaCliente(\'' +
    ne +
    '\')" style="margin-top:6px;font-size:.78rem;padding:8px 16px">Salva nota</button></div>';
  html +=
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px"><button class="btn-export" onclick="esportaMaisonClienteCSV(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">CSV</button><button class="btn-export btn-export-pdf" onclick="apriPdfSchedaMaison(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">PDF</button><button class="btn-export" onclick="stampaSchedaCliente()" style="border-color:#2c6e49;color:#2c6e49">Stampa</button></div>';
  var _pb = document.getElementById('profilo-content');
  _pb.className = 'profilo-box';
  _pb.innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
  _initNascitaInput('detail-nascita');
  var dnEl = document.getElementById('detail-nascita');
  if (dnEl && budget && budget.data_nascita) {
    dnEl.value = new Date(budget.data_nascita + 'T12:00:00').toLocaleDateString('it-IT');
    dnEl.dataset.isoValue = budget.data_nascita;
  }
}
async function salvaDetailNascita(nome) {
  var val = _getNascitaValue('detail-nascita');
  if (!val) {
    toast('Inserisci una data valida');
    return;
  }
  var b = maisonBudgetCache.find(function (x) {
    return x.nome.toLowerCase() === nome.toLowerCase() && (x.reparto_dip || 'slots') === currentReparto;
  });
  if (b) {
    try {
      await secPatch('maison_budget', 'id=eq.' + b.id, {
        data_nascita: val,
        aggiornato_da: getOperatore(),
        aggiornato_at: new Date().toISOString(),
      });
      b.data_nascita = val;
      b.aggiornato_da = getOperatore();
      b.aggiornato_at = new Date().toISOString();
      renderMaisonBudgetUI();
      logAzione('Data nascita maison', nome + ' → ' + val);
      toast('Data nascita salvata per ' + nome);
    } catch (e) {
      toast('Errore salvataggio data nascita');
    }
  } else {
    try {
      var r = await secPost('maison_budget', {
        nome: nome,
        data_nascita: val,
        reparto_dip: currentReparto,
        aggiornato_da: getOperatore(),
        aggiornato_at: new Date().toISOString(),
      });
      maisonBudgetCache.push(r[0]);
      renderMaisonBudgetUI();
      toast('Data nascita salvata per ' + nome);
    } catch (e) {
      toast('Errore salvataggio data nascita');
    }
  }
}
async function salvaDetailCat(nome) {
  var cat = document.getElementById('detail-cat-select').value;
  var b = maisonBudgetCache.find(function (x) {
    return x.nome.toLowerCase() === nome.toLowerCase() && (x.reparto_dip || 'slots') === currentReparto;
  });
  if (b) {
    try {
      await secPatch('maison_budget', 'id=eq.' + b.id, {
        categoria: cat,
        aggiornato_da: getOperatore(),
        aggiornato_at: new Date().toISOString(),
      });
      b.categoria = cat;
      b.aggiornato_da = getOperatore();
      b.aggiornato_at = new Date().toISOString();
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione('Categoria maison', nome + ' → ' + (cat || 'nessuna'));
      toast(
        nome +
          ' → ' +
          (cat === 'full_maison'
            ? 'Full Maison'
            : cat === 'maison'
              ? 'Maison'
              : cat === 'direzione'
                ? 'Direzione'
                : cat === 'bu'
                  ? 'Buono Unico'
                  : cat === 'bl'
                    ? 'Buono Lounge'
                    : 'Nessuna categoria'),
      );
    } catch (e) {
      toast('Errore salvataggio categoria');
    }
  } else {
    try {
      var r = await secPost('maison_budget', {
        nome: nome,
        categoria: cat,
        reparto_dip: currentReparto,
        aggiornato_da: getOperatore(),
        aggiornato_at: new Date().toISOString(),
      });
      maisonBudgetCache.push(r[0]);
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione('Categoria maison', nome + ' → ' + cat);
      toast(
        nome +
          ' → ' +
          (cat === 'full_maison'
            ? 'Full Maison'
            : cat === 'maison'
              ? 'Maison'
              : cat === 'direzione'
                ? 'Direzione'
                : cat === 'bu'
                  ? 'Buono Unico'
                  : cat === 'bl'
                    ? 'Buono Lounge'
                    : 'Nessuna categoria'),
      );
    } catch (e) {
      toast('Errore salvataggio categoria');
    }
  }
}
function stampaSchedaCliente() {
  var content = document.getElementById('profilo-content').innerHTML;
  var win = window.open('', '_blank', 'width=800,height=600');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scheda Cliente</title><style>');
  win.document.write(
    'body{font-family:Source Sans 3,sans-serif;padding:30px;color:#1a1208;max-width:800px;margin:0 auto}',
  );
  win.document.write('h3,h4{font-family:Playfair Display,serif}');
  win.document.write('table{width:100%;border-collapse:collapse;font-size:.85rem;margin:10px 0}');
  win.document.write(
    'th{text-align:left;padding:6px 8px;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#8a7d6b;border-bottom:2px solid #e8dfd0}',
  );
  win.document.write('td{padding:6px 8px;border-bottom:1px solid #e8dfd0}');
  win.document.write('.num{text-align:center;font-weight:600}');
  win.document.write(
    '.mini-badge{display:inline-block;font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:2px;color:white;margin:1px}',
  );
  win.document.write(
    '.budget-bar{height:4px;border-radius:2px;background:#e8dfd0;margin-top:4px;overflow:hidden;min-width:60px}',
  );
  win.document.write('.budget-bar-fill{height:100%;border-radius:2px}');
  win.document.write('button,.btn-act,.btn-del-tipo,.btn-salva,.btn-export,.btn-modal-cancel{display:none!important}');
  win.document.write('textarea,input[type=text]{display:none!important}');
  win.document.write('@media print{body{padding:10px}}</style></head><body>');
  win.document.write(
    '<div style="text-align:center;margin-bottom:20px;font-size:.8rem;color:#8a7d6b">Casino Lugano SA — Scheda Cliente</div>',
  );
  win.document.write(content);
  win.document.write(
    '<div style="text-align:center;margin-top:20px;font-size:.75rem;color:#8a7d6b">Stampato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' alle ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
      ' — Riservato</div>',
  );
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(function () {
    win.print();
  }, 300);
}
function apriConfrontoClienti() {
  var _mr = getMaisonRepartoExpanded(),
    _br = getBudgetReparto(),
    _sr = getSpeseReparto(),
    _rr = getRegaliReparto();
  var nomi = [
    ...new Set(
      _mr.map(function (r) {
        return r.nome;
      }),
    ),
  ].sort();
  if (nomi.length < 2) {
    toast('Servono almeno 2 clienti');
    return;
  }
  var mc = document.getElementById('profilo-content');
  var html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink)">Confronto clienti</h3><p style="color:var(--muted);font-size:.82rem">Seleziona 2 o 3 clienti da confrontare</p></div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  html +=
    '<select id="conf-cl-1" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 1 --</option>' +
    nomi
      .map(function (n) {
        return '<option value="' + escP(n) + '">' + escP(n) + '</option>';
      })
      .join('') +
    '</select>';
  html +=
    '<select id="conf-cl-2" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 2 --</option>' +
    nomi
      .map(function (n) {
        return '<option value="' + escP(n) + '">' + escP(n) + '</option>';
      })
      .join('') +
    '</select>';
  html +=
    '<select id="conf-cl-3" style="padding:8px 12px;border:1.5px solid var(--line);border-radius:2px;font-size:.9rem;background:var(--paper2);color:var(--ink);min-width:180px"><option value="">-- Cliente 3 (opz.) --</option>' +
    nomi
      .map(function (n) {
        return '<option value="' + escP(n) + '">' + escP(n) + '</option>';
      })
      .join('') +
    '</select>';
  html +=
    '<button class="btn-salva" onclick="eseguiConfrontoMaison()" style="padding:8px 20px;font-size:.82rem">Confronta</button></div>';
  html += '<div id="conf-risultato"></div>';
  mc.innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
}
function eseguiConfrontoMaison() {
  var n1 = (document.getElementById('conf-cl-1') || {}).value;
  var n2 = (document.getElementById('conf-cl-2') || {}).value;
  var n3 = (document.getElementById('conf-cl-3') || {}).value;
  if (!n1 || !n2) {
    toast('Seleziona almeno 2 clienti');
    return;
  }
  if (n1 === n2 || (n3 && (n3 === n1 || n3 === n2))) {
    toast('Seleziona clienti diversi');
    return;
  }
  var clienti = [n1, n2];
  if (n3) clienti.push(n3);
  var _mr = getMaisonRepartoExpanded(),
    _sr = getSpeseReparto(),
    _rr = getRegaliReparto(),
    _br = getBudgetReparto();
  var colors = ['#b8860b', '#2980b9', '#8e44ad'];
  var dati = clienti.map(function (nome, i) {
    var righe = _mr.filter(function (r) {
      return r.nome === nome;
    });
    var se = _sr.filter(function (r) {
      return r.beneficiario.toLowerCase() === nome.toLowerCase();
    });
    var reg = _rr.filter(function (r) {
      return r.nome.toLowerCase() === nome.toLowerCase();
    });
    var budget = _br.find(function (b) {
      return b.nome.toLowerCase() === nome.toLowerCase();
    });
    var totRist = righe.reduce(function (s, r) {
      return s + parseFloat(r.costo || 0);
    }, 0);
    var totExtra = se.reduce(function (s, r) {
      return s + parseFloat(r.importo || 0);
    }, 0);
    var totRegali = reg.reduce(function (s, r) {
      return s + parseFloat(r.importo || 0);
    }, 0);
    var visite = righe.length;
    var px = righe.reduce(function (s, r) {
      return s + (r.px || 0);
    }, 0);
    var nBU = _contaBuoni(righe, 'BU');
    var nBL = _contaBuoni(righe, 'BL');
    var cat = budget ? budget.categoria || '' : '';
    var byMese = {};
    righe.forEach(function (r) {
      var d = new Date(r.data_giornata + 'T12:00:00');
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      byMese[k] = (byMese[k] || 0) + parseFloat(r.costo || 0);
    });
    return {
      nome: nome,
      color: colors[i],
      totRist: totRist,
      totExtra: totExtra,
      totRegali: totRegali,
      totale: totRist + totExtra + totRegali,
      visite: visite,
      px: px,
      nBU: nBU,
      nBL: nBL,
      cat: cat,
      media: visite ? totRist / visite : 0,
      byMese: byMese,
    };
  });
  var tuttiMesi = {};
  dati.forEach(function (d) {
    Object.keys(d.byMese).forEach(function (k) {
      tuttiMesi[k] = true;
    });
  });
  var mesiOrd = Object.keys(tuttiMesi).sort();
  var h = '<h4 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:12px">Risultato confronto</h4>';
  h += '<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th></th>';
  dati.forEach(function (d) {
    h += '<th style="text-align:center;color:' + d.color + ';font-size:.85rem">' + escP(d.nome) + '</th>';
  });
  h += '</tr></thead><tbody>';
  var righeConf = [
    {
      label: 'Categoria',
      fn: function (d) {
        var c = d.cat;
        return c === 'full_maison'
          ? 'Full Maison'
          : c === 'maison'
            ? 'Maison'
            : c === 'direzione'
              ? 'Direzione'
              : c === 'bu'
                ? 'Buono Unico'
                : c === 'bl'
                  ? 'Buono Lounge'
                  : '—';
      },
    },
    {
      label: 'Totale ristorante',
      fn: function (d) {
        return fmtCHF(d.totRist) + ' CHF';
      },
    },
    {
      label: 'Totale extra',
      fn: function (d) {
        return fmtCHF(d.totExtra) + ' CHF';
      },
    },
    {
      label: 'Totale regali',
      fn: function (d) {
        return fmtCHF(d.totRegali) + ' CHF';
      },
    },
    {
      label: 'TOTALE COMPLESSIVO',
      fn: function (d) {
        return '<strong>' + fmtCHF(d.totale) + ' CHF</strong>';
      },
      bold: true,
    },
    {
      label: 'Visite',
      fn: function (d) {
        return d.visite;
      },
    },
    {
      label: 'Persone (PX)',
      fn: function (d) {
        return d.px;
      },
    },
    {
      label: 'Media/visita',
      fn: function (d) {
        return fmtCHF(d.media) + ' CHF';
      },
    },
    {
      label: 'Buoni BU',
      fn: function (d) {
        return d.nBU || '—';
      },
    },
    {
      label: 'Buoni BL',
      fn: function (d) {
        return d.nBL || '—';
      },
    },
  ];
  righeConf.forEach(function (rc, ri) {
    h +=
      '<tr' +
      (rc.bold ? ' style="background:var(--paper2);font-weight:700"' : '') +
      '><td style="font-weight:600;font-size:.82rem;white-space:nowrap">' +
      rc.label +
      '</td>';
    var vals = dati.map(function (d) {
      return parseFloat(rc.fn(d)) || 0;
    });
    var maxVal = Math.max.apply(null, vals);
    dati.forEach(function (d, di) {
      var val = rc.fn(d);
      var numVal = parseFloat(val) || 0;
      var isMax = maxVal > 0 && numVal === maxVal && !rc.bold;
      h += '<td class="num" style="' + (isMax ? 'color:' + d.color + ';font-weight:700' : '') + '">' + val + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  if (mesiOrd.length > 1) {
    h += '<h4 style="font-family:Playfair Display,serif;color:var(--ink);margin:20px 0 12px">Trend mensile</h4>';
    var maxM = 0;
    dati.forEach(function (d) {
      mesiOrd.forEach(function (m) {
        if ((d.byMese[m] || 0) > maxM) maxM = d.byMese[m] || 0;
      });
    });
    h +=
      '<div style="display:flex;gap:4px;align-items:flex-end;height:140px;border-bottom:1px solid var(--line);margin-bottom:4px">';
    mesiOrd.forEach(function (m) {
      h += '<div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:100%">';
      dati.forEach(function (d) {
        var v = d.byMese[m] || 0;
        var pct = maxM ? Math.round((v / maxM) * 120) : 0;
        h +=
          '<div style="flex:1;background:' +
          d.color +
          ';border-radius:2px 2px 0 0;height:' +
          Math.max(pct, 2) +
          'px;opacity:0.7" title="' +
          d.nome +
          ': ' +
          fmtCHF(v) +
          ' CHF"></div>';
      });
      h += '</div>';
    });
    h += '</div>';
    h += '<div style="display:flex;gap:4px">';
    mesiOrd.forEach(function (m) {
      var parts = m.split('-');
      h +=
        '<div style="flex:1;text-align:center;font-size:.78rem;color:var(--muted)">' +
        MESI[parseInt(parts[1]) - 1] +
        '</div>';
    });
    h += '</div>';
    h += '<div style="display:flex;gap:14px;justify-content:center;margin-top:8px">';
    dati.forEach(function (d) {
      h += '<span style="font-size:.78rem;color:' + d.color + ';font-weight:600">&#9632; ' + escP(d.nome) + '</span>';
    });
    h += '</div>';
  }
  document.getElementById('conf-risultato').innerHTML = h;
}
function esportaMaisonClienteCSV(nome) {
  const righe = getMaisonFiltrati()
    .filter((r) => r.nome === nome)
    .sort((a, b) => a.data_giornata.localeCompare(b.data_giornata));
  const seRighe = getSpeseReparto()
    .filter((r) => r.beneficiario.toLowerCase() === nome.toLowerCase())
    .sort((a, b) => (a.data_spesa || '').localeCompare(b.data_spesa || ''));
  const regRighe = getRegaliReparto().filter((r) => r.nome && r.nome.toLowerCase() === nome.toLowerCase());
  if (!righe.length && !seRighe.length && !regRighe.length) {
    toast('Nessun dato');
    return;
  }
  const _csvCatLabels = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  let _csvBudget = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
  if (!_csvBudget) {
    const _cog = nome.toLowerCase().split(/\s+/)[0];
    if (_cog.length >= 3) _csvBudget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
  }
  const _csvCat = _csvBudget && _csvBudget.categoria ? _csvCatLabels[_csvBudget.categoria] : '';
  const rows = [
    [nome + (_csvCat ? ' — ' + _csvCat : '')],
    ['Data', 'Giorno', 'PX', 'Costo CHF', 'Tipo', 'Gruppo', 'Note'],
  ];
  righe.forEach((r) => {
    const d = new Date(r.data_giornata + 'T12:00:00');
    rows.push([
      d.toLocaleDateString('it-IT'),
      GIORNI[d.getDay()],
      r.px,
      r.costo,
      r.tipo_buono || '',
      r.gruppo || '',
      r.note || '',
    ]);
  });
  const tot = righe.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const _nBU = _contaBuoni(righe, 'BU'),
    _nBL = _contaBuoni(righe, 'BL'),
    _nCG = _contaBuoni(righe, 'CG'),
    _nWL = _contaBuoni(righe, 'WL');
  rows.push([
    'TOTALE',
    '',
    righe.reduce((s, r) => s + (r.px || 0), 0),
    fmtCHF(tot),
    'BU:' + _nBU + ' BL:' + _nBL + ' CG:' + _nCG + ' WL:' + _nWL,
    '',
    '',
  ]);
  // Spese Extra
  if (seRighe.length) {
    rows.push([]);
    rows.push(['SPESE EXTRA']);
    rows.push(['Data', 'Tipo', 'Luogo', 'Descrizione', 'Importo CHF']);
    seRighe.forEach((r) => {
      rows.push([
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
        SE_TIPI_LABEL[r.tipo] || r.tipo,
        r.luogo || '',
        r.descrizione || '',
        fmtCHF(r.importo),
      ]);
    });
    rows.push(['TOTALE EXTRA', '', '', '', fmtCHF(seRighe.reduce((s, r) => s + parseFloat(r.importo || 0), 0))]);
  }
  // Regali
  if (regRighe.length) {
    rows.push([]);
    rows.push(['REGALI']);
    rows.push(['Data', 'Descrizione', 'Importo CHF']);
    regRighe.forEach((r) => {
      rows.push([
        r.data_regalo ? new Date(r.data_regalo + 'T12:00:00').toLocaleDateString('it-IT') : '',
        r.descrizione || '',
        fmtCHF(r.importo || 0),
      ]);
    });
    rows.push(['TOTALE REGALI', '', fmtCHF(regRighe.reduce((s, r) => s + parseFloat(r.importo || 0), 0))]);
  }
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'maison_' + nome.replace(/\s+/g, '_') + '_' + _maisonFilePeriodo(righe) + '.csv',
  }).click();
  toast('CSV esportato!');
}
function apriPdfSchedaMaison(nome) {
  const mc = document.getElementById('pwd-modal-content');
  mc.innerHTML =
    '<h3>PDF Scheda Cliente</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:14px">Seleziona le sezioni da includere nel PDF di <strong>' +
    escP(nome) +
    '</strong>:</p><div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +
    [
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-kpi" checked> KPI (visite, persone, media, totale)</label>',
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-visite" checked> Dettaglio visite</label>',
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-trend" checked> Trend mensile</label>',
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-extra"> Spese extra</label>',
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pdf-mc-regali"> Regali</label>',
    ].join('') +
    '</div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="esportaMaisonClientePDF(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Genera PDF</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function esportaMaisonClientePDF(nome) {
  const sez = {
    kpi: document.getElementById('pdf-mc-kpi')?.checked !== false,
    visite: document.getElementById('pdf-mc-visite')?.checked !== false,
    trend: document.getElementById('pdf-mc-trend')?.checked,
    extra: document.getElementById('pdf-mc-extra')?.checked,
    regali: document.getElementById('pdf-mc-regali')?.checked,
  };
  document.getElementById('pwd-modal').classList.add('hidden');
  const righe = getMaisonFiltrati()
    .filter((r) => r.nome === nome)
    .sort((a, b) => a.data_giornata.localeCompare(b.data_giornata));
  const _seRighePdf = getSpeseReparto().filter((r) => r.beneficiario.toLowerCase() === nome.toLowerCase());
  const _regRighePdf = getRegaliReparto().filter((r) => r.nome && r.nome.toLowerCase() === nome.toLowerCase());
  if (!righe.length && !_seRighePdf.length && !_regRighePdf.length) {
    toast('Nessun dato');
    return;
  }
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const tot = righe.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totPx = righe.reduce((s, r) => s + (r.px || 0), 0);
  const nBU = _contaBuoni(righe, 'BU'),
    nBL = _contaBuoni(righe, 'BL');
  const _mesiMap = {};
  righe.forEach((r) => {
    const d = new Date(r.data_giornata + 'T12:00:00');
    const label = MESI_FULL[d.getMonth()] + ' ' + d.getFullYear();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _mesiMap[key] = label;
  });
  const mesi = Object.keys(_mesiMap)
    .sort()
    .map((k) => _mesiMap[k])
    .join(', ');
  const budget = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    let y = 14;
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const _clCatLabels = {
      full_maison: 'Full Maison',
      maison: 'Maison',
      direzione: 'Direzione',
      bu: 'Buono Unico',
      bl: 'Buono Lounge',
    };
    const _clCatColors = {
      full_maison: [184, 134, 11],
      maison: [41, 128, 185],
      direzione: [142, 68, 173],
      bu: [230, 126, 34],
      bl: [44, 110, 73],
    };
    let _clBudget = budget;
    if (!_clBudget) {
      const _cog = nome.toLowerCase().split(/\s+/)[0];
      if (_cog.length >= 3) _clBudget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
    }
    const _clCat = _clBudget && _clBudget.categoria ? _clCatLabels[_clBudget.categoria] : '';
    doc.text('Scheda Cliente — ' + nome, pw / 2, y, { align: 'center' });
    y += 7;
    if (_clCat) {
      doc.setFontSize(11);
      const _cc = _clCatColors[_clBudget.categoria] || [100, 100, 100];
      doc.setTextColor(_cc[0], _cc[1], _cc[2]);
      doc.text(_clCat, pw / 2, y, { align: 'center' });
      y += 6;
      doc.setTextColor(0);
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(mesi + ' — Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 8;
    doc.setTextColor(0);
    // KPI
    const nCG = _contaBuoni(righe, 'CG'),
      nWL = _contaBuoni(righe, 'WL');
    if (sez.kpi) {
      const media = righe.length ? fmtCHF(tot / righe.length) : '0';
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: 16, right: 16 },
        head: [['Visite', 'Persone', 'BU', 'BL', 'CG', 'WL', 'Totale CHF', 'Media/visita']],
        body: [[righe.length, totPx, nBU || '-', nBL || '-', nCG || '-', nWL || '-', 'CHF ' + fmtCHF(tot), media]],
        headStyles: { fillColor: [184, 134, 11] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 4, halign: 'center' },
        columnStyles: { 6: { fontStyle: 'bold' } },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // Trend mensile
    if (sez.trend) {
      const byMese = {};
      righe.forEach((r) => {
        const d = new Date(r.data_giornata + 'T12:00:00');
        const k = MESI[d.getMonth()] + ' ' + d.getFullYear();
        byMese[k] = (byMese[k] || 0) + parseFloat(r.costo || 0);
      });
      const mesiArr = Object.entries(byMese);
      if (mesiArr.length > 1) {
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: 16, right: 16 },
          head: [['Mese', 'Totale CHF', 'Variazione']],
          body: mesiArr.map(([m, v], i) => {
            const delta = i > 0 ? (((v - mesiArr[i - 1][1]) / mesiArr[i - 1][1]) * 100).toFixed(1) + '%' : '—';
            return [m, fmtCHF(v), delta];
          }),
          headStyles: { fillColor: [26, 74, 122] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // Dettaglio visite
    if (sez.visite) {
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: 16, right: 16 },
        head: [['Data', 'Giorno', 'PX', 'Costo CHF', 'Tipo', 'Gruppo', 'Note']],
        body: righe.map((r) => {
          const d = new Date(r.data_giornata + 'T12:00:00');
          return [
            d.getDate() + ' ' + MESI[d.getMonth()],
            GIORNI[d.getDay()],
            r.px,
            fmtCHF(r.costo),
            r.tipo_buono || '',
            r.gruppo || '',
            r.note || '',
          ];
        }),
        foot: [['TOTALE', '', totPx, 'CHF ' + fmtCHF(tot), '', '', '']],
        headStyles: { fillColor: [26, 18, 8] },
        footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8, cellPadding: 3 },
        columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // Spese extra
    if (sez.extra) {
      const seR = getSpeseReparto().filter((r) => r.beneficiario.toLowerCase() === nome.toLowerCase());
      if (seR.length) {
        const totSE = seR.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: 16, right: 16 },
          head: [['Data', 'Tipo', 'Luogo', 'Descrizione', 'CHF']],
          body: seR.map((r) => {
            const d = new Date(r.data_spesa + 'T12:00:00');
            return [
              d.toLocaleDateString('it-IT'),
              SE_TIPI_LABEL[r.tipo] || r.tipo,
              r.luogo || '',
              r.descrizione || '',
              fmtCHF(r.importo),
            ];
          }),
          foot: [['TOTALE EXTRA', '', '', '', 'CHF ' + fmtCHF(totSE)]],
          headStyles: { fillColor: [142, 68, 173] },
          footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // Regali
    if (sez.regali) {
      const regR = getRegaliReparto().filter((r) => r.nome.toLowerCase() === nome.toLowerCase());
      if (regR.length) {
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: 16, right: 16 },
          head: [['Data', 'Descrizione', 'CHF', 'Operatore']],
          body: regR.map((r) => [
            new Date((r.data_regalo || r.created_at) + 'T12:00:00').toLocaleDateString('it-IT'),
            r.descrizione || '',
            r.importo ? fmtCHF(r.importo) : '—',
            r.operatore || '',
          ]),
          headStyles: { fillColor: [184, 134, 11] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — ' + nome + ' — Pag. ' + i + '/' + tp, 16, doc.internal.pageSize.getHeight() - 8);
    }
    mostraPdfPreview(
      doc,
      'scheda_' + nome.replace(/\s+/g, '_') + '_' + _maisonFilePeriodo(righe) + '.pdf',
      'Scheda — ' + nome,
    );
  } catch (e) {
    console.error(e);
    toast('Errore PDF');
  }
}

// Controlla se un nome esiste solo come parte di nomi condivisi (es. "Bertaggia" da "Bertaggia/Pegoraro")
function _isSoloCondiviso(nome) {
  return (
    !getMaisonReparto().some((r) => r.nome === nome) &&
    getMaisonReparto().some(
      (r) => r.nome.includes('/') && r.nome.split(/\s*\/\s*/).some((n) => capitalizzaNome(n.trim()) === nome),
    )
  );
}
function _getNomiCondivisiOriginali(nome) {
  return [
    ...new Set(
      getMaisonReparto()
        .filter((r) => r.nome.includes('/') && r.nome.split(/\s*\/\s*/).some((n) => capitalizzaNome(n.trim()) === nome))
        .map((r) => r.nome),
    ),
  ];
}
// Elimina singolo cliente (tutte le righe)
async function eliminaMaisonCliente(nome) {
  if (_isSoloCondiviso(nome)) {
    _eliminaCondivisoModal(nome);
    return;
  }
  const count = getMaisonReparto().filter((r) => r.nome === nome).length;
  if (!count) {
    toast('Nessun record trovato per ' + nome);
    return;
  }
  if (!confirm('Eliminare tutte le ' + count + ' registrazioni di "' + nome + '" (' + currentReparto + ')?')) return;
  try {
    await secDel('costi_maison', 'nome=eq.' + encodeURIComponent(nome) + '&reparto_dip=eq.' + currentReparto);
    maisonCache = maisonCache.filter((r) => !(r.nome === nome && (r.reparto_dip || 'slots') === currentReparto));
    logAzione('Maison: eliminato cliente', nome + ' (' + count + ' righe, ' + currentReparto + ')');
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    toast(nome + ' eliminato (' + count + ' righe)');
  } catch (e) {
    toast('Errore eliminazione cliente');
  }
}
function _eliminaCondivisoModal(nome) {
  const orig = _getNomiCondivisiOriginali(nome);
  const altri = orig.map((o) =>
    o
      .split(/\s*\/\s*/)
      .filter((n) => capitalizzaNome(n.trim()) !== nome)
      .map((n) => capitalizzaNome(n.trim()))
      .join(', '),
  );
  const count = getMaisonReparto().filter((r) => orig.includes(r.nome)).length;
  const ne = nome.replace(/'/g, "\\'");
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Eliminare ' +
    escP(nome) +
    '?</h3><p style="margin-bottom:12px">' +
    escP(nome) +
    ' ha <strong>' +
    count +
    ' registrazioni condivise</strong> con: <strong>' +
    escP(altri.join(', ')) +
    '</strong></p><p style="font-size:.88rem;color:var(--muted);margin-bottom:16px">Il costo era diviso tra i due. Cosa vuoi fare?</p><div class="pwd-modal-btns" style="flex-wrap:wrap;gap:8px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" style="background:var(--accent)" onclick="_eseguiEliminaCondiviso(\'' +
    ne +
    '\',true)">Elimina entrambi (' +
    count +
    ' righe)</button><button class="btn-modal-ok" style="background:var(--accent2)" onclick="_eseguiEliminaCondiviso(\'' +
    ne +
    '\',false)">Solo ' +
    escP(nome) +
    ' (mantieni ' +
    escP(altri[0]) +
    ')</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _eseguiEliminaCondiviso(nome, entrambi) {
  document.getElementById('pwd-modal').classList.add('hidden');
  const orig = _getNomiCondivisiOriginali(nome);
  const ids = getMaisonReparto()
    .filter((r) => orig.includes(r.nome))
    .map((r) => r.id);
  try {
    if (entrambi) {
      for (const id of ids) {
        await secDel('costi_maison', 'id=eq.' + id);
      }
      maisonCache = maisonCache.filter((r) => !ids.includes(r.id));
      logAzione('Maison: eliminato condiviso', orig.join(', ') + ' (' + ids.length + ' righe)');
      toast(orig.join(', ') + ' eliminati (' + ids.length + ' righe)');
    } else {
      for (const id of ids) {
        const rec = maisonCache.find((r) => r.id === id);
        if (!rec) continue;
        const nuovoNome = rec.nome
          .split(/\s*\/\s*/)
          .filter((n) => capitalizzaNome(n.trim()) !== nome)
          .map((n) => capitalizzaNome(n.trim()))
          .join(' / ');
        await secPatch('costi_maison', 'id=eq.' + id, { nome: nuovoNome });
        rec.nome = nuovoNome;
      }
      logAzione('Maison: rimosso da condiviso', nome + ' rimosso da ' + orig.join(', '));
      toast(
        nome +
          ' rimosso, costo intero assegnato a ' +
          orig[0]
            .split(/\s*\/\s*/)
            .filter((n) => capitalizzaNome(n.trim()) !== nome)
            .join(', '),
      );
    }
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
// Rinomina cliente (tutte le occorrenze)
function rinominaMaisonCliente(nome) {
  const b = document.getElementById('pwd-modal-content');
  if (_isSoloCondiviso(nome)) {
    const orig = _getNomiCondivisiOriginali(nome);
    const ne = nome.replace(/'/g, "\\'");
    b.innerHTML =
      '<h3>Rinomina cliente Maison</h3><p style="margin-bottom:8px;font-size:.88rem;color:var(--accent2)">' +
      escP(nome) +
      ' è registrato insieme a: <strong>' +
      escP(orig.join(', ')) +
      '</strong></p><div class="pwd-field"><label>Nuovo nome per ' +
      escP(nome) +
      '</label><input type="text" id="rin-maison-nuovo" value="' +
      escP(nome) +
      '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_eseguiRinominaCondiviso(\'' +
      ne +
      '\')">Salva</button></div>';
    document.getElementById('pwd-modal').classList.remove('hidden');
    setTimeout(() => {
      const i = document.getElementById('rin-maison-nuovo');
      i.focus();
      i.select();
    }, 100);
    return;
  }
  b.innerHTML =
    '<h3>Rinomina cliente Maison</h3><div class="pwd-field"><label>Nome attuale</label><input type="text" value="' +
    escP(nome) +
    '" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="rin-maison-nuovo" value="' +
    escP(nome) +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaMaison(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const i = document.getElementById('rin-maison-nuovo');
    i.focus();
    i.select();
  }, 100);
}
async function eseguiRinominaMaison(vecchio) {
  const nuovo = capitalizzaNome(document.getElementById('rin-maison-nuovo').value.trim());
  if (!nuovo) {
    toast('Inserisci un nome');
    return;
  }
  if (nuovo === vecchio) {
    document.getElementById('pwd-modal').classList.add('hidden');
    return;
  }
  try {
    await secPatch('costi_maison', 'nome=eq.' + encodeURIComponent(vecchio) + '&reparto_dip=eq.' + currentReparto, {
      nome: nuovo,
    });
    maisonCache.forEach((r) => {
      if (r.nome === vecchio && (r.reparto_dip || 'slots') === currentReparto) r.nome = nuovo;
    });
    // Aggiorna anche budget se presente (solo reparto corrente)
    const bIdx = maisonBudgetCache.findIndex(
      (b) => b.nome.toLowerCase() === vecchio.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto,
    );
    if (bIdx !== -1) {
      await secPatch('maison_budget', 'id=eq.' + maisonBudgetCache[bIdx].id, { nome: nuovo });
      maisonBudgetCache[bIdx].nome = nuovo;
    }
    logAzione('Maison: rinominato', vecchio + ' → ' + nuovo);
    document.getElementById('pwd-modal').classList.add('hidden');
    renderMaisonDashboard();
    renderMaisonBudgetUI();
    renderMaisonBudgetAlerts();
    toast(vecchio + ' → ' + nuovo);
  } catch (e) {
    toast('Errore rinomina');
  }
}
async function _eseguiRinominaCondiviso(vecchio) {
  const nuovo = capitalizzaNome(document.getElementById('rin-maison-nuovo').value.trim());
  if (!nuovo) {
    toast('Inserisci un nome');
    return;
  }
  if (nuovo === vecchio) {
    document.getElementById('pwd-modal').classList.add('hidden');
    return;
  }
  const orig = _getNomiCondivisiOriginali(vecchio);
  const ids = getMaisonReparto()
    .filter((r) => orig.includes(r.nome))
    .map((r) => r.id);
  try {
    for (const id of ids) {
      const rec = maisonCache.find((r) => r.id === id);
      if (!rec) continue;
      const nuovoNome = rec.nome
        .split(/\s*\/\s*/)
        .map((n) => (capitalizzaNome(n.trim()) === vecchio ? nuovo : capitalizzaNome(n.trim())))
        .join(' / ');
      await secPatch('costi_maison', 'id=eq.' + id, { nome: nuovoNome });
      rec.nome = nuovoNome;
    }
    logAzione('Maison: rinominato condiviso', vecchio + ' → ' + nuovo);
    document.getElementById('pwd-modal').classList.add('hidden');
    renderMaisonDashboard();
    renderMaisonBudgetUI();
    renderMaisonBudgetAlerts();
    toast(vecchio + ' → ' + nuovo);
  } catch (e) {
    toast('Errore rinomina');
  }
}
// Modifica singola riga maison (PX, tipo, costo, note)
function modificaMaisonRiga(id, nome) {
  const r = maisonCache.find((x) => x.id === id);
  if (!r) return;
  const ne = nome.replace(/'/g, "\\'");
  const mc = document.getElementById('pwd-modal-content');
  mc.innerHTML =
    '<h3>Modifica riga</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">' +
    escP(r.nome) +
    ' — ' +
    new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT') +
    '</p><div style="display:flex;gap:10px;flex-wrap:wrap"><div class="pwd-field" style="flex:1;min-width:80px"><label>PX</label><input type="number" id="edit-mr-px" value="' +
    (r.px || 1) +
    '" min="1"></div><div class="pwd-field" style="flex:1;min-width:100px"><label>Costo CHF</label><input type="number" id="edit-mr-costo" value="' +
    parseFloat(r.costo).toFixed(2) +
    '" step="0.01"></div><div class="pwd-field" style="flex:1;min-width:100px"><label>Tipo</label><select id="edit-mr-tipo" style="width:100%;padding:8px"><option value=""' +
    (!r.tipo_buono ? ' selected' : '') +
    '>Normale</option><option value="BU"' +
    (r.tipo_buono === 'BU' ? ' selected' : '') +
    '>Buono Unico</option><option value="BL"' +
    (r.tipo_buono === 'BL' ? ' selected' : '') +
    '>Buono Lounge</option><option value="CG"' +
    (r.tipo_buono === 'CG' ? ' selected' : '') +
    '>C. Gourmet</option><option value="WL"' +
    (r.tipo_buono === 'WL' ? ' selected' : '') +
    '>Welcome Lounge</option></select></div></div><div class="pwd-field"><label>Note</label><input type="text" id="edit-mr-note" value="' +
    escP(r.note || '') +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaMaisonRiga(' +
    id +
    ",'" +
    ne +
    '\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaModificaMaisonRiga(id, nome) {
  const px = parseInt(document.getElementById('edit-mr-px').value) || 1;
  const costo = parseFloat(document.getElementById('edit-mr-costo').value) || 0;
  const tipo = document.getElementById('edit-mr-tipo').value || null;
  const note = document.getElementById('edit-mr-note').value.trim();
  try {
    await secPatch('costi_maison', 'id=eq.' + id, { px, costo, tipo_buono: tipo, note });
    const r = maisonCache.find((x) => x.id === id);
    if (r) {
      r.px = px;
      r.costo = costo;
      r.tipo_buono = tipo;
      r.note = note;
    }
    logAzione('Modifica riga maison', nome + ' PX:' + px + ' CHF:' + costo + (tipo ? ' ' + tipo : ''));
    document.getElementById('pwd-modal').classList.add('hidden');
    apriDettaglioMaison(nome);
    renderMaisonDashboard();
    toast('Riga modificata');
  } catch (e) {
    toast('Errore modifica');
  }
}
// Sposta da costi_maison a spese_extra
async function eliminaMaisonRigaDettaglio(id, nome) {
  const r = maisonCache.find((x) => x.id === id);
  if (!r) return;
  if (
    !confirm(
      'Eliminare la spesa di ' +
        r.nome +
        ' del ' +
        new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT') +
        ' (' +
        parseFloat(r.costo).toFixed(2) +
        ' CHF)?',
    )
  )
    return;
  try {
    await secDel('costi_maison', 'id=eq.' + id);
    maisonCache = maisonCache.filter((x) => x.id !== id);
    logAzione('Eliminata spesa Maison', r.nome + ' ' + parseFloat(r.costo).toFixed(2) + ' CHF del ' + r.data_giornata);
    toast('Spesa eliminata');
    apriDettaglioMaison(nome);
    renderMaisonDashboard();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
async function spostaMaisonToExtra(id, nome) {
  const r = maisonCache.find((x) => x.id === id);
  if (!r) return;
  if (
    !confirm(
      'Spostare ' + r.nome + ' (' + parseFloat(r.costo).toFixed(2) + ' CHF, ' + r.data_giornata + ') in Spese Extra?',
    )
  )
    return;
  try {
    await secPost('spese_extra', {
      beneficiario: r.nome,
      tipo: 'cena_esterna',
      importo: r.costo,
      data_spesa: r.data_giornata,
      luogo: r.note || '',
      descrizione: 'Spostato da Costi Maison',
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    });
    await secDel('costi_maison', 'id=eq.' + id);
    maisonCache = maisonCache.filter((x) => x.id !== id);
    speseExtraCache = await secGet('spese_extra?order=data_spesa.desc');
    logAzione('Maison → Extra', r.nome + ' ' + parseFloat(r.costo).toFixed(2) + ' CHF');
    toast('Spostato in Spese Extra');
    apriDettaglioMaison(nome);
    renderMaisonDashboard();
  } catch (e) {
    toast('Errore spostamento');
  }
}
// Sposta da spese_extra a costi_maison
async function spostaExtraToMaison(id, nome) {
  const r = speseExtraCache.find((x) => x.id === id);
  if (!r) return;
  if (
    !confirm(
      'Spostare ' +
        r.beneficiario +
        ' (' +
        parseFloat(r.importo).toFixed(2) +
        ' CHF, ' +
        r.data_spesa +
        ') in Costi Maison?',
    )
  )
    return;
  try {
    await secPost('costi_maison', {
      nome: r.beneficiario,
      costo: r.importo,
      data_giornata: r.data_spesa,
      px: 1,
      tipo_buono: '',
      note: r.luogo || r.descrizione || '',
      gruppo: '',
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    });
    await secDel('spese_extra', 'id=eq.' + id);
    speseExtraCache = speseExtraCache.filter((x) => x.id !== id);
    maisonCache = await secGet('costi_maison?order=data_giornata.desc');
    logAzione('Extra → Maison', r.beneficiario + ' ' + parseFloat(r.importo).toFixed(2) + ' CHF');
    toast('Spostato in Costi Maison');
    apriDettaglioMaison(nome);
    renderMaisonDashboard();
  } catch (e) {
    toast('Errore spostamento');
  }
}
// Elimina tutti i dati di un giorno
async function eliminaMaisonGiorno() {
  const sel = document.getElementById('maison-del-giorno');
  if (!sel || !sel.value) {
    toast('Seleziona un giorno');
    return;
  }
  const giorno = sel.value;
  const label = new Date(giorno + 'T12:00:00').toLocaleDateString('it-IT');
  const count = getMaisonReparto().filter((r) => r.data_giornata === giorno).length;
  if (!confirm('Eliminare tutte le ' + count + ' registrazioni del ' + label + ' (' + currentReparto + ')?')) return;
  try {
    await secDel('costi_maison', 'data_giornata=eq.' + giorno + '&reparto_dip=eq.' + currentReparto);
    maisonCache = maisonCache.filter(
      (r) => !(r.data_giornata === giorno && (r.reparto_dip || 'slots') === currentReparto),
    );
    logAzione('Maison: eliminato giorno', label + ' (' + count + ' righe, ' + currentReparto + ')');
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    toast('Giorno ' + label + ' eliminato');
  } catch (e) {
    toast('Errore eliminazione giorno');
  }
}
async function eliminaMaisonMese() {
  const sel = document.getElementById('maison-del-mese');
  if (!sel || !sel.value) {
    toast('Seleziona un mese');
    return;
  }
  const mese = sel.value;
  const meseStart = mese + '-01';
  const meseEnd = mese + '-31';
  const label = MESI_FULL[parseInt(mese.split('-')[1]) - 1] + ' ' + mese.split('-')[0];
  const count = getMaisonReparto().filter((r) => r.data_giornata >= meseStart && r.data_giornata <= meseEnd).length;
  if (!count) {
    toast('Nessun dato per ' + label);
    return;
  }
  if (!confirm('Eliminare tutte le ' + count + ' registrazioni di ' + label + ' (' + currentReparto + ')?')) return;
  try {
    await secDel(
      'costi_maison',
      'data_giornata=gte.' + meseStart + '&data_giornata=lte.' + meseEnd + '&reparto_dip=eq.' + currentReparto,
    );
    maisonCache = maisonCache.filter(
      (r) =>
        !(r.data_giornata >= meseStart && r.data_giornata <= meseEnd && (r.reparto_dip || 'slots') === currentReparto),
    );
    logAzione('Maison: eliminato mese', label + ' (' + count + ' righe, ' + currentReparto + ')');
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    toast(label + ' eliminato (' + count + ' righe)');
  } catch (e) {
    toast('Errore eliminazione mese');
  }
}

// Budget
