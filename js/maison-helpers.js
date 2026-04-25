/**
 * Diario Collaboratori — Casino Lugano SA
 * File: maison-helpers.js
 * Maison: import, parser nomi, helpers
 */

function _completaNomeDaBudget(input) {
  const inp = (input || '').trim();
  if (!inp) return { nome: '', candidates: [], needDisambiguation: false };
  // Se l'input ha gia' piu' parole (cognome + nome), non serve completarlo
  if (inp.split(/\s+/).length >= 2) {
    return { nome: capitalizzaNome(inp), candidates: [], needDisambiguation: false };
  }
  // Cerca tutti i clienti che iniziano col cognome scritto (sia in costi_maison sia in budget categorizzato)
  const inpLower = inp.toLowerCase();
  const tuttiNomi = [
    ...new Set([...getMaisonReparto().map((r) => r.nome), ...getBudgetReparto().map((b) => b.nome)]),
  ].filter((n) => n && !n.includes('/')); // escludi gia' gruppi
  // Match esatto cognome (primo token uguale)
  const matches = tuttiNomi.filter((n) => {
    const tokens = n.toLowerCase().split(/\s+/);
    return tokens[0] === inpLower;
  });
  if (matches.length === 1) return { nome: matches[0], candidates: [], needDisambiguation: false };
  if (matches.length > 1) return { nome: '', candidates: matches, needDisambiguation: true };
  // Nessun match esatto: prova match senza spazi (es. "delledonne" → "Delle Donne Mario")
  const matchesNoSpace = tuttiNomi.filter((n) => n.toLowerCase().replace(/\s/g, '').startsWith(inpLower));
  if (matchesNoSpace.length === 1) return { nome: matchesNoSpace[0], candidates: [], needDisambiguation: false };
  if (matchesNoSpace.length > 1) return { nome: '', candidates: matchesNoSpace, needDisambiguation: true };
  // Nessun match: ritorna l'input cosi' com'e' (sara' creato come nuovo cliente)
  return { nome: capitalizzaNome(inp), candidates: [], needDisambiguation: false };
}
// Helper: controlla se un operatore e' incluso in un campo destinatario CSV (es. "Mario,Anna,Luca" o "tutti")
function _includeOpInCsv(field, op) {
  if (!field) return false;
  if (field === 'tutti') return true;
  if (field === op) return true;
  return field
    .split(',')
    .map((s) => s.trim())
    .includes(op);
}
// === MULTI-SELECT OPERATORI (per consegne, promemoria, ecc.) ===
// Apre un modal con checkbox per selezionare uno o piu' operatori del reparto corrente,
// + opzioni "Tutti" / "Tutti Slots" / "Tutti Tavoli". Salva il risultato come CSV nel hidden input.
// hiddenInputId = id del input nascosto che memorizza il valore (es. "cons-destinatario")
// btnId = id del bottone che mostra la label (es. "cons-destinatario-btn")
// title = titolo del modal
function apriMultiSelectOperatori(hiddenInputId, btnId, title) {
  const op = getOperatore();
  const ops = operatoriAuthCache
    .map((o) => o.nome)
    .filter((n) => {
      const rep = operatoriRepartoMap[n] || 'entrambi';
      return rep === currentReparto || rep === 'entrambi';
    })
    .sort();
  const cur = (document.getElementById(hiddenInputId) || {}).value || 'tutti';
  // Parse current selection (CSV o single value)
  const selected = new Set();
  if (cur === 'tutti') selected.add('__tutti');
  else
    cur
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s)
      .forEach((s) => selected.add(s));
  const mc = document.getElementById('pwd-modal-content');
  let html = '<h3>' + escP(title || 'Seleziona operatori') + '</h3>';
  html +=
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Seleziona uno o piu\' destinatari, oppure "Tutti" per inviare a tutto il reparto.</p>';
  // Opzione "Tutti"
  html +=
    '<div style="padding:10px 12px;background:var(--paper2);border-radius:3px;margin-bottom:10px"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600"><input type="checkbox" id="msop-tutti"' +
    (selected.has('__tutti') ? ' checked' : '') +
    ' onclick="_msopToggleTutti()" style="width:18px;height:18px"><span>Tutti gli operatori del reparto (' +
    ops.length +
    ')</span></label></div>';
  // Lista operatori individuali
  html += '<div style="max-height:280px;overflow-y:auto;border:1px solid var(--line);border-radius:3px;padding:8px">';
  ops.forEach((n) => {
    const rep = operatoriRepartoMap[n] || 'entrambi';
    const badge =
      rep === 'slots'
        ? ' <span style="font-size:.65rem;color:#1a4a7a;font-weight:700">S</span>'
        : rep === 'tavoli'
          ? ' <span style="font-size:.65rem;color:#8e44ad;font-weight:700">T</span>'
          : '';
    const isMe = n === op ? ' (Tu)' : '';
    html +=
      '<div style="padding:5px 0"><label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.92rem"><input type="checkbox" class="msop-cb" value="' +
      escP(n).replace(/"/g, '&quot;') +
      '"' +
      (selected.has(n) ? ' checked' : '') +
      ' onclick="_msopToggleSingolo()" style="width:16px;height:16px"><span>' +
      escP(n) +
      badge +
      isMe +
      '</span></label></div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_msopConferma(\'' +
    hiddenInputId +
    "','" +
    btnId +
    '\')">Conferma</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
// Toggle "Tutti": deseleziona tutti gli individuali
function _msopToggleTutti() {
  const tutti = document.getElementById('msop-tutti');
  if (tutti && tutti.checked) {
    document.querySelectorAll('.msop-cb').forEach((cb) => (cb.checked = false));
  }
}
// Toggle individuale: deseleziona "Tutti"
function _msopToggleSingolo() {
  const tutti = document.getElementById('msop-tutti');
  if (tutti) tutti.checked = false;
}
// Conferma selezione: salva nel hidden input + aggiorna label del bottone
function _msopConferma(hiddenInputId, btnId) {
  const tutti = document.getElementById('msop-tutti');
  const selected = [...document.querySelectorAll('.msop-cb:checked')].map((cb) => cb.value);
  let valore, label;
  if (tutti && tutti.checked) {
    valore = 'tutti';
    label = 'Tutti gli operatori';
  } else if (selected.length === 0) {
    toast('Seleziona almeno un destinatario');
    return;
  } else if (selected.length === 1) {
    valore = selected[0];
    label = selected[0];
  } else {
    valore = selected.join(',');
    label =
      selected.length + ' operatori (' + selected.slice(0, 2).join(', ') + (selected.length > 2 ? '...' : '') + ')';
  }
  document.getElementById(hiddenInputId).value = valore;
  const btn = document.getElementById(btnId);
  if (btn) btn.textContent = label;
  document.getElementById('pwd-modal').classList.add('hidden');
}
// Modal di disambiguazione: mostra una scelta tra piu' candidati e ritorna una Promise
function _scegliCandidatoNome(input, candidates) {
  return new Promise((resolve) => {
    const mc = document.getElementById('pwd-modal-content');
    let html = '<h3>Quale "' + escP(input) + '"?</h3>';
    html +=
      '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Esistono piu\' clienti con questo cognome. Seleziona quello giusto:</p>';
    html += '<div style="max-height:280px;overflow-y:auto">';
    candidates.forEach((c, i) => {
      html +=
        '<div style="padding:8px 0;display:flex;align-items:center;gap:10px"><input type="radio" name="dis-nome-radio" value="' +
        i +
        '" id="dis-nome-' +
        i +
        '"' +
        (i === 0 ? ' checked' : '') +
        ' style="width:18px;height:18px"><label for="dis-nome-' +
        i +
        '" style="cursor:pointer;font-size:.95rem">' +
        escP(c) +
        '</label></div>';
    });
    html +=
      '<div style="padding:8px 0;display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);margin-top:6px"><input type="radio" name="dis-nome-radio" value="-1" id="dis-nome-new" style="width:18px;height:18px"><label for="dis-nome-new" style="cursor:pointer;font-size:.92rem;color:var(--muted)">Crea come nuovo cliente "' +
      escP(input) +
      '"</label></div>';
    html += '</div>';
    html +=
      '<div class="pwd-modal-btns"><button class="btn-modal-cancel" id="dis-cancel">Annulla</button><button class="btn-modal-ok" id="dis-ok">Conferma</button></div>';
    mc.innerHTML = html;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('dis-cancel').onclick = () => {
      document.getElementById('pwd-modal').classList.add('hidden');
      resolve(null);
    };
    document.getElementById('dis-ok').onclick = () => {
      const sel = document.querySelector('input[name="dis-nome-radio"]:checked');
      const idx = sel ? parseInt(sel.value) : 0;
      document.getElementById('pwd-modal').classList.add('hidden');
      resolve(idx === -1 ? capitalizzaNome(input) : candidates[idx]);
    };
  });
}
async function riallineaNomiMaison() {
  const budget = getBudgetReparto();
  if (!budget.length) {
    toast('Nessun cliente categorizzato. Importa prima le categorie.');
    return;
  }
  // Trova nomi in costi_maison che non matchano esattamente nessun budget
  const costiNomi = [...new Set(getMaisonReparto().map((r) => r.nome))];
  const extraNomi = [...new Set(getSpeseReparto().map((r) => r.beneficiario))];
  const budgetNomi = budget.map((b) => b.nome);
  const correzioni = []; // {vecchio, nuovo, costiCount, extraCount}
  // Controlla costi maison
  costiNomi.forEach((nome) => {
    if (budgetNomi.find((b) => b.toLowerCase() === nome.toLowerCase())) return; // match esatto, ok
    // Cerca match fuzzy
    const nl = nome.toLowerCase();
    const nlNoSp = nl.replace(/\s/g, '');
    let matchBudget = null;
    // Cognome singolo → trova nome completo nel budget (Frigerio → Frigerio Luciano)
    if (nome.split(/\s+/).length <= 1) {
      const cogMatch = budgetNomi.filter((b) => b.toLowerCase().split(/\s+/)[0] === nl);
      if (cogMatch.length === 1) matchBudget = cogMatch[0];
    }
    // Senza spazi (Dalozzo → Da Lozzo)
    matchBudget = budgetNomi.find((b) => b.toLowerCase().replace(/\s/g, '') === nlNoSp);
    // Levenshtein (Armelin → Armellin)
    if (!matchBudget && nl.length > 3)
      matchBudget = budgetNomi.find(
        (b) => _levenshtein(nl, b.toLowerCase().split(/\s+/)[0]) <= 2 && nl.length <= b.split(/\s+/)[0].length + 2,
      );
    if (!matchBudget && nl.length > 3) matchBudget = budgetNomi.find((b) => _levenshtein(nl, b.toLowerCase()) <= 2);
    if (matchBudget && matchBudget.toLowerCase() !== nome.toLowerCase()) {
      const nuovoNome = _soloCorrezioneCognome(nome, matchBudget);
      if (nuovoNome.toLowerCase() === nome.toLowerCase()) return; // nessuna correzione necessaria
      const existing = correzioni.find((c) => c.vecchio === nome && c.nuovo === nuovoNome);
      if (!existing) {
        const cc = getMaisonReparto().filter((r) => r.nome === nome).length;
        const ec = getSpeseReparto().filter((r) => r.beneficiario === nome).length;
        correzioni.push({ vecchio: nome, nuovo: nuovoNome, costiCount: cc, extraCount: ec });
      }
    }
  });
  // Controlla spese extra
  extraNomi.forEach((nome) => {
    if (budgetNomi.find((b) => b.toLowerCase() === nome.toLowerCase())) return;
    if (correzioni.find((c) => c.vecchio === nome)) return; // già trovato sopra
    const nl = nome.toLowerCase();
    const nlNoSp = nl.replace(/\s/g, '');
    let matchBudget = null;
    // Cognome singolo → trova nome completo nel budget
    if (nome.split(/\s+/).length <= 1) {
      const cogMatch = budgetNomi.filter((b) => b.toLowerCase().split(/\s+/)[0] === nl);
      if (cogMatch.length === 1) matchBudget = cogMatch[0];
    }
    matchBudget = budgetNomi.find((b) => b.toLowerCase().replace(/\s/g, '') === nlNoSp);
    if (!matchBudget && nl.length > 3)
      matchBudget = budgetNomi.find(
        (b) => _levenshtein(nl, b.toLowerCase().split(/\s+/)[0]) <= 2 && nl.length <= b.split(/\s+/)[0].length + 2,
      );
    if (!matchBudget && nl.length > 3) matchBudget = budgetNomi.find((b) => _levenshtein(nl, b.toLowerCase()) <= 2);
    if (matchBudget && matchBudget.toLowerCase() !== nome.toLowerCase()) {
      const nuovoNome = _soloCorrezioneCognome(nome, matchBudget);
      if (nuovoNome.toLowerCase() === nome.toLowerCase()) return;
      const ec = getSpeseReparto().filter((r) => r.beneficiario === nome).length;
      correzioni.push({ vecchio: nome, nuovo: nuovoNome, costiCount: 0, extraCount: ec });
    }
  });
  if (!correzioni.length) {
    toast('Tutti i nomi sono già allineati!');
    return;
  }
  correzioni.sort((a, b) => b.costiCount + b.extraCount - (a.costiCount + a.extraCount));
  // Stato globale per il riallineamento interattivo
  window._riallineaState = { correzioni, confermati: 0, saltati: 0, errori: 0, vociCorr: 0 };
  _renderRiallineaUI();
}
function _renderRiallineaUI() {
  const st = window._riallineaState;
  const mc = document.getElementById('pwd-modal-content');
  const rimaste = st.correzioni.filter((c) => !c._done);
  if (!rimaste.length) {
    // Riepilogo finale
    mc.innerHTML =
      '<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">&#9989;</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Riallineamento completato</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">' +
      st.confermati +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Confermati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--muted)">' +
      st.saltati +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Saltati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--ink)">' +
      st.vociCorr +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Voci corrette</div></div></div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
    renderMaisonDashboard();
    renderSpeseExtra();
    logAzione('Riallinea nomi', st.confermati + ' confermati, ' + st.saltati + ' saltati, ' + st.vociCorr + ' voci');
    return;
  }
  const totOrig = st.correzioni.length;
  let html =
    '<div style="text-align:center;margin-bottom:12px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Riallinea Nomi</h3><p style="color:var(--muted);font-size:.84rem">' +
    rimaste.length +
    ' di ' +
    totOrig +
    ' rimaste</p></div>';
  // Contatori
  html += '<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:center">';
  html += '<span style="font-size:.82rem;color:#2c6e49;font-weight:600">' + st.confermati + ' confermati</span>';
  html += '<span style="font-size:.82rem;color:var(--muted)">' + st.saltati + ' saltati</span>';
  html += '</div>';
  // Lista con bottoni per ogni voce
  html += '<div id="riallinea-lista" style="max-height:400px;overflow-y:auto">';
  rimaste.forEach((c, i) => {
    const idx = st.correzioni.indexOf(c);
    html +=
      '<div id="riallinea-row-' +
      idx +
      '" style="padding:10px 12px;margin-bottom:6px;border-radius:3px;background:var(--paper2);display:flex;align-items:center;gap:8px;flex-wrap:wrap;transition:all .3s">';
    html +=
      '<span style="font-size:.85rem;color:var(--accent);text-decoration:line-through">' + escP(c.vecchio) + '</span>';
    html += '<span style="color:var(--muted)">&#8594;</span>';
    html += '<strong style="font-size:.85rem;color:#2c6e49">' + escP(c.nuovo) + '</strong>';
    html += '<span style="font-size:.75rem;color:var(--muted)">';
    if (c.costiCount) html += c.costiCount + ' costi';
    if (c.costiCount && c.extraCount) html += ' + ';
    if (c.extraCount) html += c.extraCount + ' extra';
    html += '</span>';
    html += '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">';
    html +=
      '<button class="btn-salva" style="font-size:.75rem;padding:5px 12px;background:#2c6e49" onclick="confermaRiallinea(' +
      idx +
      ')">Conferma</button>';
    html +=
      '<button class="btn-modal-cancel" style="font-size:.75rem;padding:5px 12px" onclick="saltaRiallinea(' +
      idx +
      ')">Salta</button>';
    html += '</div></div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaRiallinea(idx) {
  const st = window._riallineaState;
  const c = st.correzioni[idx];
  const row = document.getElementById('riallinea-row-' + idx);
  if (row) row.style.opacity = '0.5';
  // Aggiorna costi_maison
  const costiIds = maisonCache.filter((r) => r.nome === c.vecchio && (r.reparto_dip || 'slots') === currentReparto);
  for (const r of costiIds) {
    try {
      await secPatch('costi_maison', 'id=eq.' + r.id, { nome: c.nuovo });
      r.nome = c.nuovo;
      st.vociCorr++;
    } catch (e) {
      st.errori++;
    }
  }
  // Aggiorna spese_extra
  const extraIds = speseExtraCache.filter(
    (r) => r.beneficiario === c.vecchio && (r.reparto_dip || 'slots') === currentReparto,
  );
  for (const r of extraIds) {
    try {
      await secPatch('spese_extra', 'id=eq.' + r.id, { beneficiario: c.nuovo });
      r.beneficiario = c.nuovo;
      st.vociCorr++;
    } catch (e) {
      st.errori++;
    }
  }
  c._done = true;
  st.confermati++;
  if (row) {
    row.style.background = 'rgba(44,110,73,0.1)';
    row.innerHTML =
      '<span style="color:#2c6e49;font-size:.85rem">&#9989; ' +
      escP(c.vecchio) +
      ' → <strong>' +
      escP(c.nuovo) +
      '</strong></span>';
    setTimeout(() => {
      row.style.maxHeight = '0';
      row.style.padding = '0';
      row.style.margin = '0';
      row.style.overflow = 'hidden';
      setTimeout(() => _checkRiallineaDone(), 300);
    }, 800);
  } else _checkRiallineaDone();
}
function saltaRiallinea(idx) {
  const st = window._riallineaState;
  const c = st.correzioni[idx];
  c._done = true;
  st.saltati++;
  const row = document.getElementById('riallinea-row-' + idx);
  if (row) {
    row.style.opacity = '0.3';
    row.innerHTML =
      '<span style="color:var(--muted);font-size:.85rem">&#10060; ' + escP(c.vecchio) + ' — saltato</span>';
    setTimeout(() => {
      row.style.maxHeight = '0';
      row.style.padding = '0';
      row.style.margin = '0';
      row.style.overflow = 'hidden';
      setTimeout(() => _checkRiallineaDone(), 300);
    }, 500);
  } else _checkRiallineaDone();
}
function _checkRiallineaDone() {
  const st = window._riallineaState;
  const rimaste = st.correzioni.filter((c) => !c._done);
  // Aggiorna contatori
  const cntEl = document.querySelector('#riallinea-lista');
  if (cntEl && cntEl.parentElement) {
    const p = cntEl.parentElement.querySelector('p');
    if (p) p.textContent = rimaste.length + ' di ' + st.correzioni.length + ' rimaste';
  }
  if (!rimaste.length) _renderRiallineaUI();
}
async function unisciDuplicatiMaison() {
  const budget = getBudgetReparto();
  if (!budget.length) {
    toast('Nessun cliente nel budget.');
    return;
  }
  // Raggruppa per cognome (primo token)
  const byCognome = {};
  budget.forEach((b) => {
    const cogn = b.nome.trim().split(/\s+/)[0].toLowerCase();
    if (!byCognome[cogn]) byCognome[cogn] = [];
    byCognome[cogn].push(b);
  });
  const coppie = [];
  Object.keys(byCognome).forEach((cogn) => {
    const gruppo = byCognome[cogn];
    if (gruppo.length < 2) return;
    // Trova coppie dove i nomi NON sono identici (case-insensitive)
    for (let i = 0; i < gruppo.length; i++) {
      for (let j = i + 1; j < gruppo.length; j++) {
        if (gruppo[i].nome.toLowerCase() === gruppo[j].nome.toLowerCase()) continue;
        // Determina quale ha il nome piu lungo (nome+cognome)
        let longer = gruppo[i],
          shorter = gruppo[j];
        if (
          gruppo[j].nome.trim().split(/\s+/).length > gruppo[i].nome.trim().split(/\s+/).length ||
          (gruppo[j].nome.trim().split(/\s+/).length === gruppo[i].nome.trim().split(/\s+/).length &&
            gruppo[j].nome.length > gruppo[i].nome.length)
        ) {
          longer = gruppo[j];
          shorter = gruppo[i];
        }
        // Merge: nome dal piu lungo, dati dal piu ricco
        const merged = {
          nome: longer.nome,
          categoria: longer.categoria || shorter.categoria || null,
          data_nascita: longer.data_nascita || shorter.data_nascita || null,
          budget_chf: longer.budget_chf || shorter.budget_chf || null,
          budget_bu: longer.budget_bu || shorter.budget_bu || null,
          budget_bl: longer.budget_bl || shorter.budget_bl || null,
        };
        // Se il corto ha costi e il lungo no, prendi budget dal corto
        if (!longer.budget_chf && shorter.budget_chf) merged.budget_chf = shorter.budget_chf;
        if (!longer.budget_bu && shorter.budget_bu) merged.budget_bu = shorter.budget_bu;
        if (!longer.budget_bl && shorter.budget_bl) merged.budget_bl = shorter.budget_bl;
        if (!longer.categoria && shorter.categoria) merged.categoria = shorter.categoria;
        // data_nascita: preferisci dal nome lungo (import compleanni piu accurato)
        if (longer.data_nascita) merged.data_nascita = longer.data_nascita;
        else if (shorter.data_nascita) merged.data_nascita = shorter.data_nascita;
        coppie.push({ keep: longer, remove: shorter, merged });
      }
    }
  });
  if (!coppie.length) {
    toast('Nessun duplicato trovato!');
    return;
  }
  window._unisciState = { coppie, confermati: 0, saltati: 0, errori: 0, vociCorr: 0 };
  _renderUnisciUI();
}
function _renderUnisciUI() {
  const st = window._unisciState;
  const mc = document.getElementById('pwd-modal-content');
  const rimaste = st.coppie.filter((c) => !c._done);
  if (!rimaste.length) {
    mc.innerHTML =
      '<div style="text-align:center;padding:20px"><div style="font-size:2.5rem;margin-bottom:8px">&#9989;</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Unione duplicati completata</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#2c6e49">' +
      st.confermati +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Uniti</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--muted)">' +
      st.saltati +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Saltati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:var(--ink)">' +
      st.vociCorr +
      '</div><div style="font-size:.75rem;color:var(--muted);text-transform:uppercase">Voci aggiornate</div></div></div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
    renderMaisonBudgetUI();
    renderMaisonDashboard();
    renderSpeseExtra();
    logAzione(
      'Unisci duplicati maison',
      st.confermati + ' uniti, ' + st.saltati + ' saltati, ' + st.vociCorr + ' voci',
    );
    return;
  }
  const totOrig = st.coppie.length;
  const _catLabel = function (c) {
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
              : '';
  };
  const _fmtDn = function (d) {
    if (!d) return '';
    const p = d.split('-');
    return p[2] + '/' + p[1];
  };
  let html =
    '<div style="text-align:center;margin-bottom:12px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Unisci Duplicati</h3><p style="color:var(--muted);font-size:.84rem">' +
    rimaste.length +
    ' di ' +
    totOrig +
    ' coppie</p></div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:center">';
  html += '<span style="font-size:.82rem;color:#2c6e49;font-weight:600">' + st.confermati + ' uniti</span>';
  html += '<span style="font-size:.82rem;color:var(--muted)">' + st.saltati + ' saltati</span>';
  html += '</div>';
  html += '<div id="unisci-lista" style="max-height:400px;overflow-y:auto">';
  rimaste.forEach(function (c) {
    const idx = st.coppie.indexOf(c);
    const kInfo = [];
    const rInfo = [];
    if (c.keep.budget_chf) kInfo.push(fmtCHF(parseFloat(c.keep.budget_chf)) + ' CHF');
    if (c.keep.categoria) kInfo.push(_catLabel(c.keep.categoria));
    if (c.keep.data_nascita) kInfo.push('&#127874; ' + _fmtDn(c.keep.data_nascita));
    if (c.remove.budget_chf) rInfo.push(fmtCHF(parseFloat(c.remove.budget_chf)) + ' CHF');
    if (c.remove.categoria) rInfo.push(_catLabel(c.remove.categoria));
    if (c.remove.data_nascita) rInfo.push('&#127874; ' + _fmtDn(c.remove.data_nascita));
    const mInfo = [];
    if (c.merged.categoria) mInfo.push(_catLabel(c.merged.categoria));
    if (c.merged.budget_chf) mInfo.push(fmtCHF(parseFloat(c.merged.budget_chf)) + ' CHF');
    if (c.merged.data_nascita) mInfo.push('&#127874; ' + _fmtDn(c.merged.data_nascita));
    html +=
      '<div id="unisci-row-' +
      idx +
      '" style="padding:10px 12px;margin-bottom:8px;border-radius:3px;background:var(--paper2);transition:all .3s">';
    html +=
      '<div style="font-size:.85rem;margin-bottom:4px"><strong>' +
      escP(c.remove.nome) +
      '</strong>' +
      (rInfo.length ? ' <span style="color:var(--muted);font-size:.78rem">(' + rInfo.join(', ') + ')</span>' : '') +
      ' <span style="color:var(--muted)">+</span> <strong>' +
      escP(c.keep.nome) +
      '</strong>' +
      (kInfo.length ? ' <span style="color:var(--muted);font-size:.78rem">(' + kInfo.join(', ') + ')</span>' : '') +
      '</div>';
    html +=
      '<div style="font-size:.82rem;color:#1a4a7a;margin-bottom:8px">&#8594; Unisci in: <strong>' +
      escP(c.merged.nome) +
      '</strong>' +
      (mInfo.length ? ' (' + mInfo.join(', ') + ')' : '') +
      '</div>';
    html += '<div style="display:flex;gap:6px;justify-content:flex-end">';
    html +=
      '<button class="btn-salva" style="font-size:.75rem;padding:5px 12px;background:#2c6e49" onclick="confermaUnisci(' +
      idx +
      ')">Conferma</button>';
    html +=
      '<button class="btn-modal-cancel" style="font-size:.75rem;padding:5px 12px" onclick="saltaUnisci(' +
      idx +
      ')">Salta</button>';
    html += '</div></div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaUnisci(idx) {
  const st = window._unisciState;
  const c = st.coppie[idx];
  const row = document.getElementById('unisci-row-' + idx);
  if (row) row.style.opacity = '0.5';
  try {
    // 1) Aggiorna il record KEEP con i dati merged
    const patchData = { nome: c.merged.nome };
    if (c.merged.categoria) patchData.categoria = c.merged.categoria;
    if (c.merged.data_nascita) patchData.data_nascita = c.merged.data_nascita;
    if (c.merged.budget_chf) patchData.budget_chf = c.merged.budget_chf;
    if (c.merged.budget_bu) patchData.budget_bu = c.merged.budget_bu;
    if (c.merged.budget_bl) patchData.budget_bl = c.merged.budget_bl;
    await secPatch('maison_budget', 'id=eq.' + c.keep.id, patchData);
    // Aggiorna cache locale
    const kIdx = maisonBudgetCache.findIndex((b) => b.id === c.keep.id);
    if (kIdx !== -1) Object.assign(maisonBudgetCache[kIdx], patchData);
    // 2) Aggiorna costi_maison: rinomina dal nome corto al nome lungo
    const costiShort = maisonCache.filter(
      (r) => r.nome === c.remove.nome && (r.reparto_dip || 'slots') === currentReparto,
    );
    for (const r of costiShort) {
      try {
        await secPatch('costi_maison', 'id=eq.' + r.id, { nome: c.merged.nome });
        r.nome = c.merged.nome;
        st.vociCorr++;
      } catch (e) {
        st.errori++;
      }
    }
    // 3) Aggiorna spese_extra: rinomina beneficiario dal nome corto
    const extraShort = speseExtraCache.filter(
      (r) => r.beneficiario === c.remove.nome && (r.reparto_dip || 'slots') === currentReparto,
    );
    for (const r of extraShort) {
      try {
        await secPatch('spese_extra', 'id=eq.' + r.id, { beneficiario: c.merged.nome });
        r.beneficiario = c.merged.nome;
        st.vociCorr++;
      } catch (e) {
        st.errori++;
      }
    }
    // 4) Elimina il record REMOVE
    await secDel('maison_budget', 'id=eq.' + c.remove.id);
    maisonBudgetCache = maisonBudgetCache.filter((b) => b.id !== c.remove.id);
    c._done = true;
    st.confermati++;
    if (row) {
      row.style.background = 'rgba(44,110,73,0.1)';
      row.innerHTML =
        '<span style="color:#2c6e49;font-size:.85rem">&#9989; ' +
        escP(c.remove.nome) +
        ' unito in <strong>' +
        escP(c.merged.nome) +
        '</strong></span>';
      setTimeout(function () {
        row.style.maxHeight = '0';
        row.style.padding = '0';
        row.style.margin = '0';
        row.style.overflow = 'hidden';
        setTimeout(function () {
          _checkUnisciDone();
        }, 300);
      }, 800);
    } else _checkUnisciDone();
  } catch (e) {
    st.errori++;
    toast('Errore unione: ' + e.message);
    if (row) row.style.opacity = '1';
    c._done = true;
    _checkUnisciDone();
  }
}
function saltaUnisci(idx) {
  const st = window._unisciState;
  const c = st.coppie[idx];
  c._done = true;
  st.saltati++;
  const row = document.getElementById('unisci-row-' + idx);
  if (row) {
    row.style.opacity = '0.3';
    row.innerHTML =
      '<span style="color:var(--muted);font-size:.85rem">&#10060; ' +
      escP(c.remove.nome) +
      ' / ' +
      escP(c.keep.nome) +
      ' — saltato</span>';
    setTimeout(function () {
      row.style.maxHeight = '0';
      row.style.padding = '0';
      row.style.margin = '0';
      row.style.overflow = 'hidden';
      setTimeout(function () {
        _checkUnisciDone();
      }, 300);
    }, 500);
  } else _checkUnisciDone();
}
function _checkUnisciDone() {
  const st = window._unisciState;
  const rimaste = st.coppie.filter((c) => !c._done);
  const cntEl = document.querySelector('#unisci-lista');
  if (cntEl && cntEl.parentElement) {
    const p = cntEl.parentElement.querySelector('p');
    if (p) p.textContent = rimaste.length + ' di ' + st.coppie.length + ' coppie';
  }
  if (!rimaste.length) _renderUnisciUI();
}
async function rimuoviMaisonBudget(id) {
  if (!confirm('Rimuovere questo budget?')) return;
  try {
    await secDel('maison_budget', 'id=eq.' + id);
    maisonBudgetCache = maisonBudgetCache.filter((b) => b.id !== id);
    logAzione('Budget maison rimosso', 'ID ' + id);
    renderMaisonBudgetUI();
    renderMaisonDashboard();
    renderMaisonBudgetAlerts();
    toast('Budget rimosso');
  } catch (e) {
    toast('Errore rimozione budget');
  }
}
function renderMaisonBudgetAlerts() {
  const container = document.getElementById('maison-alerts-container');
  if (!container) return;
  const now = new Date(),
    mese = now.getMonth(),
    anno = now.getFullYear();
  const periodo = (document.getElementById('maison-budget-periodo') || {}).value || 'mese';
  let dataStart;
  if (periodo === 'anno') dataStart = anno + '-01-01';
  else dataStart = anno + '-' + String(mese + 1).padStart(2, '0') + '-01';
  const periodoLabel =
    periodo === 'anno'
      ? 'anno ' + anno
      : [
          'Gennaio',
          'Febbraio',
          'Marzo',
          'Aprile',
          'Maggio',
          'Giugno',
          'Luglio',
          'Agosto',
          'Settembre',
          'Ottobre',
          'Novembre',
          'Dicembre',
        ][mese] +
        ' ' +
        anno;
  const alerts = [];
  const _mrAlerts = getMaisonRepartoExpanded();
  getBudgetReparto().forEach((b) => {
    const periodoData = _mrAlerts.filter(
      (r) => r.nome.toLowerCase() === b.nome.toLowerCase() && r.data_giornata >= dataStart,
    );
    const spent = periodoData.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
    const nBU = _contaBuoni(periodoData, 'BU');
    const nBL = _contaBuoni(periodoData, 'BL');
    const budgetChf = periodo === 'anno' && b.budget_chf ? b.budget_chf * 12 : b.budget_chf;
    const budgetBu = periodo === 'anno' && b.budget_bu ? b.budget_bu * 12 : b.budget_bu;
    const budgetBl = periodo === 'anno' && b.budget_bl ? b.budget_bl * 12 : b.budget_bl;
    if (budgetChf && spent >= budgetChf) alerts.push({ nome: b.nome, tipo: 'chf_over', spent, budget: budgetChf });
    else if (budgetChf && spent >= budgetChf * 0.8)
      alerts.push({ nome: b.nome, tipo: 'chf_near', spent, budget: budgetChf });
    if (budgetBu && nBU >= budgetBu) alerts.push({ nome: b.nome, tipo: 'bu_over', count: nBU, max: budgetBu });
    if (budgetBl && nBL >= budgetBl) alerts.push({ nome: b.nome, tipo: 'bl_over', count: nBL, max: budgetBl });
  });
  let html =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:.82rem;color:var(--muted)">Periodo budget:</span><select id="maison-budget-periodo" onchange="renderMaisonBudgetAlerts()" style="padding:4px 8px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper);color:var(--ink)"><option value="mese"' +
    (periodo === 'mese' ? ' selected' : '') +
    '>Mese corrente</option><option value="anno"' +
    (periodo === 'anno' ? ' selected' : '') +
    '>Anno corrente</option></select><span style="font-size:.82rem;color:var(--muted)">(' +
    periodoLabel +
    ')</span></div>';
  if (!alerts.length) {
    container.innerHTML = html;
    return;
  }
  const overAlerts = alerts.filter((a) => a.tipo.includes('over'));
  const nearAlerts = alerts.filter((a) => a.tipo.includes('near'));
  if (overAlerts.length) {
    html +=
      '<div class="cassa-alert-banner rdi" style="margin-bottom:8px;cursor:default">&#9888; Budget superato: ' +
      overAlerts
        .map(
          (a) =>
            escP(a.nome) +
            (a.spent
              ? ' (' + fmtCHF(a.spent) + '/' + fmtCHF(a.budget) + ' CHF)'
              : a.count
                ? ' (' + a.count + '/' + a.max + ' buoni)'
                : ''),
        )
        .join(' — ') +
      '</div>';
  }
  if (nearAlerts.length) {
    html +=
      '<div class="cassa-alert-banner allin" style="margin-bottom:8px;cursor:default">&#9888; Quasi al budget (80%+): ' +
      nearAlerts.map((a) => escP(a.nome) + ' (' + fmtCHF(a.spent) + '/' + fmtCHF(a.budget) + ' CHF)').join(' — ') +
      '</div>';
  }
  container.innerHTML = html;
}
function acFiltraMaison(inputId, dropId) {
  const inp = document.getElementById(inputId),
    drop = document.getElementById(dropId);
  if (!inp || !drop) return;
  const v = inp.value.toLowerCase();
  const _catLabelsAc = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  const _catColorsAc = {
    full_maison: '#b8860b',
    maison: '#2980b9',
    direzione: '#8e44ad',
    bu: '#e67e22',
    bl: '#2c6e49',
  };
  // Budget names con categoria (prioritari)
  const budgetNomi = getBudgetReparto().map((b) => ({ nome: b.nome, cat: b.categoria || null }));
  const budgetSet = new Set(budgetNomi.map((b) => b.nome.toLowerCase()));
  // Nomi da costi esistenti non in budget
  const costiNomi = [...new Set(getMaisonRepartoExpanded().map((r) => r.nome))]
    .filter((n) => !budgetSet.has(n.toLowerCase()))
    .map((n) => ({ nome: n, cat: null }));
  // Unisci: budget prima, poi extra
  const tutti = budgetNomi.concat(costiNomi);
  // Filtra: match su qualsiasi parte del nome (cognome, nome)
  const filtrati = v ? tutti.filter((item) => item.nome.toLowerCase().includes(v)) : tutti;
  // Ordina: budget first, poi alfa
  filtrati.sort((a, b) => {
    if (a.cat && !b.cat) return -1;
    if (!a.cat && b.cat) return 1;
    return a.nome.localeCompare(b.nome);
  });
  if (!filtrati.length) {
    drop.classList.remove('show');
    return;
  }
  drop.innerHTML = filtrati
    .slice(0, 50)
    .map((item) => {
      const badge = item.cat
        ? '<span class="mini-badge" style="background:' +
          (_catColorsAc[item.cat] || 'var(--muted)') +
          ';margin-left:6px;font-size:.6rem;vertical-align:middle">' +
          escP(_catLabelsAc[item.cat] || '') +
          '</span>'
        : '';
      const catTipo = item.cat === 'bu' ? 'BU' : item.cat === 'bl' ? 'BL' : '';
      return (
        '<div onmousedown="document.getElementById(\'' +
        inputId +
        "').value='" +
        item.nome.replace(/'/g, "\\'") +
        "';document.getElementById('" +
        dropId +
        "').classList.remove('show');_preimpostaTipoMaison('" +
        escP(item.cat || '') +
        '\')" style="display:flex;align-items:center;justify-content:space-between">' +
        escP(item.nome) +
        badge +
        '</div>'
      );
    })
    .join('');
  drop.classList.add('show');
}
function _preimpostaTipoMaison(cat) {
  const catToTipo = { bu: 'BU', bl: 'BL', cg: 'CG', wl: 'WL' };
  // Sezione Maison
  const tipoSel = document.getElementById('maison-man-tipo');
  if (tipoSel && catToTipo[cat]) {
    tipoSel.value = catToTipo[cat];
    tipoSel.dispatchEvent(new Event('change'));
  }
  // Sezione Inventario - Buono a Cliente
  const invTipoSel = document.getElementById('inv-usc-tipo');
  if (invTipoSel && catToTipo[cat]) {
    invTipoSel.value = catToTipo[cat];
  }
  // Ricalcola qty se c'è già un importo
  _autoCalcolaBuoniManuale();
}
function _autoCalcolaBuoniManuale() {
  const tipo = (document.getElementById('maison-man-tipo') || {}).value;
  const importo = parseFloat((document.getElementById('maison-man-importo') || {}).value) || 0;
  const qtyEl = document.getElementById('maison-man-qty');
  if (!tipo || !importo || !BUONO_VALORI[tipo] || !qtyEl) return;
  const calcQ = Math.ceil(importo / BUONO_VALORI[tipo]);
  if (calcQ >= 1) qtyEl.value = calcQ;
}
// Export
function esportaMaisonCSV() {
  const data = getMaisonFiltrati();
  if (!data.length) {
    toast('Nessun dato');
    return;
  }
  // Raggruppato per cliente con buoni e categoria
  const _catLabels = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  const byNome = {};
  data.forEach((r) => {
    if (!byNome[r.nome]) byNome[r.nome] = { tot: 0, px: 0, visite: 0, bu: 0, bl: 0, cg: 0, wl: 0 };
    const d = byNome[r.nome];
    d.tot += parseFloat(r.costo || 0);
    d.px += r.px || 0;
    d.visite++;
    const _bq = (() => {
      const m = (r.note || '').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);
      return m ? parseInt(m[1]) : 1;
    })();
    if (r.tipo_buono === 'BU') d.bu += _bq;
    if (r.tipo_buono === 'BL') d.bl += _bq;
    if (r.tipo_buono === 'CG') d.cg += _bq;
    if (r.tipo_buono === 'WL') d.wl += _bq;
  });
  const sorted = Object.entries(byNome).sort((a, b) => b[1].tot - a[1].tot);
  const rows = [['Cliente', 'Categoria', 'Visite', 'PX', 'BU', 'BL', 'CG', 'WL', 'Totale CHF', 'Media CHF']];
  sorted.forEach(([n, d]) => {
    let budget = getBudgetReparto().find((b) => b.nome.toLowerCase() === n.toLowerCase());
    if (!budget) {
      const _cog = n.toLowerCase().split(/\s+/)[0];
      if (_cog.length >= 3) budget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
    }
    const cat = budget && budget.categoria ? _catLabels[budget.categoria] || '' : '';
    rows.push([
      n,
      cat,
      d.visite,
      d.px,
      d.bu || '',
      d.bl || '',
      d.cg || '',
      d.wl || '',
      fmtCHF(d.tot),
      fmtCHF(d.tot / d.visite),
    ]);
  });
  rows.push([
    'TOTALE',
    '',
    sorted.reduce((s, c) => s + c[1].visite, 0),
    sorted.reduce((s, c) => s + c[1].px, 0) + ' PX',
    sorted.reduce((s, c) => s + c[1].bu, 0) ? sorted.reduce((s, c) => s + c[1].bu, 0) + ' BU' : '',
    sorted.reduce((s, c) => s + c[1].bl, 0) ? sorted.reduce((s, c) => s + c[1].bl, 0) + ' BL' : '',
    sorted.reduce((s, c) => s + c[1].cg, 0) ? sorted.reduce((s, c) => s + c[1].cg, 0) + ' CG' : '',
    sorted.reduce((s, c) => s + c[1].wl, 0) ? sorted.reduce((s, c) => s + c[1].wl, 0) + ' WL' : '',
    'CHF ' + fmtCHF(sorted.reduce((s, c) => s + c[1].tot, 0)),
    '',
  ]);
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'costi_maison_' + _maisonFilePeriodo(data) + '.csv',
  }).click();
  toast('CSV esportato!');
}
async function esportaMaisonPDF() {
  const data = getMaisonFiltrati();
  if (!data.length) {
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
  const _catLabels = {
    full_maison: 'Full Maison',
    maison: 'Maison',
    direzione: 'Direzione',
    bu: 'Buono Unico',
    bl: 'Buono Lounge',
  };
  const _catColors = {
    full_maison: [184, 134, 11],
    maison: [41, 128, 185],
    direzione: [142, 68, 173],
    bu: [230, 126, 34],
    bl: [44, 110, 73],
  };
  const byNome = {};
  data.forEach((r) => {
    if (!byNome[r.nome]) byNome[r.nome] = { tot: 0, px: 0, visite: 0, bu: 0, bl: 0, cg: 0, wl: 0 };
    const d = byNome[r.nome];
    d.tot += parseFloat(r.costo || 0);
    d.px += r.px || 0;
    d.visite++;
    const _bq = (() => {
      const m = (r.note || '').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);
      return m ? parseInt(m[1]) : 1;
    })();
    if (r.tipo_buono === 'BU') d.bu += _bq;
    if (r.tipo_buono === 'BL') d.bl += _bq;
    if (r.tipo_buono === 'CG') d.cg += _bq;
    if (r.tipo_buono === 'WL') d.wl += _bq;
  });
  const sorted = Object.entries(byNome).sort((a, b) => b[1].tot - a[1].tot);
  const totale = sorted.reduce((s, c) => s + c[1].tot, 0);
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
    doc.text('Costi Maison', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const fd = (document.getElementById('maison-filt-dal') || {}).value,
      fa = (document.getElementById('maison-filt-al') || {}).value;
    let _periodoLabel = '';
    if (fd && fa) {
      _periodoLabel =
        new Date(fd + 'T12:00:00').toLocaleDateString('it-IT') +
        ' — ' +
        new Date(fa + 'T12:00:00').toLocaleDateString('it-IT');
    } else if (data.length) {
      const _dates = data.map((r) => r.data_giornata).sort();
      const _d1 = new Date(_dates[0] + 'T12:00:00');
      const _d2 = new Date(_dates[_dates.length - 1] + 'T12:00:00');
      if (_d1.getMonth() === _d2.getMonth() && _d1.getFullYear() === _d2.getFullYear())
        _periodoLabel = MESI_FULL[_d1.getMonth()] + ' ' + _d1.getFullYear();
      else
        _periodoLabel =
          MESI_FULL[_d1.getMonth()] +
          ' ' +
          _d1.getFullYear() +
          ' — ' +
          MESI_FULL[_d2.getMonth()] +
          ' ' +
          _d2.getFullYear();
    } else {
      _periodoLabel = 'Tutti i dati';
    }
    doc.text(_periodoLabel + ' — Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: 16, right: 16 },
      head: [['Cliente', 'Categoria', 'Visite', 'PX', 'BU', 'BL', 'CG', 'WL', 'Totale CHF', 'Media CHF']],
      body: sorted.map(([n, d]) => {
        let budget = getBudgetReparto().find((b) => b.nome.toLowerCase() === n.toLowerCase());
        if (!budget) {
          const _cog = n.toLowerCase().split(/\s+/)[0];
          if (_cog.length >= 3) budget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
        }
        const cat = budget && budget.categoria ? _catLabels[budget.categoria] || '' : '';
        return [
          n,
          cat,
          d.visite,
          d.px,
          d.bu || '',
          d.bl || '',
          d.cg || '',
          d.wl || '',
          fmtCHF(d.tot),
          fmtCHF(d.tot / d.visite),
        ];
      }),
      foot: [
        [
          'TOTALE',
          '',
          sorted.reduce((s, c) => s + c[1].visite, 0),
          sorted.reduce((s, c) => s + c[1].px, 0) + ' PX',
          sorted.reduce((s, c) => s + c[1].bu, 0) ? sorted.reduce((s, c) => s + c[1].bu, 0) + ' BU' : '',
          sorted.reduce((s, c) => s + c[1].bl, 0) ? sorted.reduce((s, c) => s + c[1].bl, 0) + ' BL' : '',
          sorted.reduce((s, c) => s + c[1].cg, 0) ? sorted.reduce((s, c) => s + c[1].cg, 0) + ' CG' : '',
          sorted.reduce((s, c) => s + c[1].wl, 0) ? sorted.reduce((s, c) => s + c[1].wl, 0) + ' WL' : '',
          'CHF ' + fmtCHF(totale),
          '',
        ],
      ],
      headStyles: { fillColor: [26, 18, 8], halign: 'center' },
      footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: {
        lineColor: [220, 215, 205],
        lineWidth: 0.15,
        fontSize: 7.5,
        cellPadding: 2.5,
        lineColor: [220, 215, 205],
        lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 38, halign: 'left' },
        1: { cellWidth: 28, halign: 'left' },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 12 },
        4: { halign: 'center', cellWidth: 10 },
        5: { halign: 'center', cellWidth: 10 },
        6: { halign: 'center', cellWidth: 10 },
        7: { halign: 'center', cellWidth: 10 },
        8: { halign: 'right', cellWidth: 22 },
        9: { halign: 'right', cellWidth: 18 },
      },
      didParseCell: function (d) {
        if (d.section === 'body' && d.column.index === 1) {
          const c = Object.entries(_catLabels).find(([k, v]) => v === d.cell.raw);
          if (c && _catColors[c[0]]) {
            d.cell.styles.textColor = _catColors[c[0]];
            d.cell.styles.fontStyle = 'bold';
          }
        }
      },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    y = doc.lastAutoTable.finalY + 6;
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — Costi Maison — Pag. ' + i + '/' + tp, 16, doc.internal.pageSize.getHeight() - 8);
    }
    mostraPdfPreview(doc, 'costi_maison_' + _maisonFilePeriodo(data) + '.pdf', 'Costi Maison');
  } catch (e) {
    console.error(e);
    toast('Errore PDF: ' + e.message);
  }
}

// ========================
// SPESE EXTRA
// ========================
const SE_TIPI_LABEL = {
  cena_esterna: 'Cena esterna',
  pranzo_esterno: 'Pranzo esterno',
  rimborso: 'Rimborso spese',
  viaggio: 'Viaggio',
  biglietti: 'Biglietti',
  regalo: 'Regalo',
  hotel: 'Hotel/Alloggio',
  altro: 'Altro',
};
const SE_TIPI_COLOR = {
  cena_esterna: '#c0392b',
  pranzo_esterno: '#e67e22',
  rimborso: '#2980b9',
  viaggio: '#8e44ad',
  biglietti: '#2c6e49',
  regalo: '#b8860b',
  hotel: '#1a4a7a',
  altro: '#8a7d6b',
};
let _seFpInit = false;
function initSpeseExtraFP() {
  if (_seFpInit || !window.flatpickr) return;
  _seFpInit = true;
  flatpickr('#se-data', { locale: 'it', dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: false });
  const o = {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
    onChange: () => renderSpeseExtra(),
  };
  flatpickr('#se-filt-dal', o);
  flatpickr('#se-filt-al', o);
}
function acFiltraSpeseExtra() {
  const inp = document.getElementById('se-beneficiario'),
    drop = document.getElementById('ac-se-benef');
  if (!inp || !drop) return;
  const v = inp.value.toLowerCase();
  const nomi = [
    ...new Set([...getSpeseReparto().map((r) => r.beneficiario), ...getMaisonRepartoExpanded().map((r) => r.nome)]),
  ].sort();
  const f = v ? nomi.filter((n) => n.toLowerCase().includes(v)) : nomi;
  if (!f.length) {
    drop.classList.remove('show');
    return;
  }
  drop.innerHTML = f
    .slice(0, 12)
    .map(
      (n) =>
        "<div onmousedown=\"document.getElementById('se-beneficiario').value='" +
        n.replace(/'/g, "\\'") +
        "';document.getElementById('ac-se-benef').classList.remove('show')\">" +
        escP(n) +
        '</div>',
    )
    .join('');
  drop.classList.add('show');
}
async function salvaSpeseExtra() {
  let benef = capitalizzaNome(document.getElementById('se-beneficiario').value.trim());
  const tipo = document.getElementById('se-tipo').value;
  const data = document.getElementById('se-data').value;
  const luogo = document.getElementById('se-luogo').value.trim();
  const importo = parseFloat(document.getElementById('se-importo').value) || 0;
  const desc = document.getElementById('se-descrizione').value.trim();
  if (!benef) {
    toast('Inserisci il beneficiario');
    _highlightField('se-beneficiario');
    return;
  }
  const nomeEsistente =
    getMaisonRepartoExpanded().find((r) => r.nome.toLowerCase() === benef.toLowerCase()) ||
    getSpeseReparto().find((r) => r.beneficiario.toLowerCase() === benef.toLowerCase());
  if (!nomeEsistente) {
    const simile = _trovaNomeSimileMaison(benef);
    if (simile && simile.tipo === 'simile') {
      if (confirm('Hai scritto "' + benef + '" ma esiste "' + simile.nome + '". Usare "' + simile.nome + '"?'))
        benef = simile.nome;
    }
  }
  if (!data) {
    toast('Seleziona la data');
    return;
  }
  if (!importo) {
    toast("Inserisci l'importo");
    return;
  }
  // Controllo duplicati: stesso beneficiario + stessa data + stesso importo
  const seDup = getSpeseReparto().find(
    (r) =>
      r.beneficiario.toLowerCase() === benef.toLowerCase() &&
      r.data_spesa === data &&
      parseFloat(r.importo) === importo,
  );
  if (seDup) {
    if (
      !confirm(
        benef +
          ' ha già una spesa di ' +
          importo.toFixed(2) +
          ' CHF il ' +
          new Date(data + 'T12:00:00').toLocaleDateString('it-IT') +
          '.\n\nVuoi aggiungere comunque?',
      )
    )
      return;
  }
  const px = parseInt(document.getElementById('se-px').value) || 1;
  try {
    const rec = {
      beneficiario: benef,
      tipo,
      descrizione: desc + (px > 1 ? ' (' + px + ' px)' : ''),
      importo,
      data_spesa: data,
      luogo,
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    };
    const r = await secPost('spese_extra', rec);
    speseExtraCache.unshift(r[0]);
    document.getElementById('se-beneficiario').value = '';
    document.getElementById('se-luogo').value = '';
    document.getElementById('se-importo').value = '';
    document.getElementById('se-descrizione').value = '';
    document.getElementById('se-px').value = '1';
    const fp = document.getElementById('se-data');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    logAzione('Spesa extra', benef + ' — ' + SE_TIPI_LABEL[tipo] + ' — ' + importo.toFixed(2) + ' CHF');
    renderSpeseExtra();
    renderMaisonDashboard();
    toast('Spesa aggiunta');
  } catch (e) {
    toast('Errore aggiunta spesa');
  }
}
async function eliminaSpeseExtra(id) {
  if (!confirm('Eliminare questa spesa?')) return;
  try {
    await secDel('spese_extra', 'id=eq.' + id);
    speseExtraCache = speseExtraCache.filter((x) => x.id !== id);
    renderSpeseExtra();
    renderMaisonDashboard();
    logAzione('Eliminata spesa extra', 'ID ' + id);
    toast('Eliminata');
  } catch (e) {
    toast('Errore eliminazione spesa');
  }
}
function modificaSpeseExtra(id) {
  const s = speseExtraCache.find((x) => x.id === id);
  if (!s) return;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Modifica spesa extra</h3><div class="pwd-field"><label>Beneficiario</label><input type="text" id="edit-se-benef" value="' +
    escP(s.beneficiario) +
    '"></div><div class="pwd-field"><label>Tipo</label><select id="edit-se-tipo" style="padding:10px;width:100%"><option value="cena_esterna"' +
    (s.tipo === 'cena_esterna' ? ' selected' : '') +
    '>Cena esterna</option><option value="pranzo_esterno"' +
    (s.tipo === 'pranzo_esterno' ? ' selected' : '') +
    '>Pranzo esterno</option><option value="rimborso"' +
    (s.tipo === 'rimborso' ? ' selected' : '') +
    '>Rimborso spese</option><option value="viaggio"' +
    (s.tipo === 'viaggio' ? ' selected' : '') +
    '>Viaggio</option><option value="biglietti"' +
    (s.tipo === 'biglietti' ? ' selected' : '') +
    '>Biglietti</option><option value="regalo"' +
    (s.tipo === 'regalo' ? ' selected' : '') +
    '>Regalo</option><option value="hotel"' +
    (s.tipo === 'hotel' ? ' selected' : '') +
    '>Hotel / Alloggio</option><option value="altro"' +
    (s.tipo === 'altro' ? ' selected' : '') +
    '>Altro</option></select></div><div class="pwd-field"><label>Luogo</label><input type="text" id="edit-se-luogo" value="' +
    escP(s.luogo || '') +
    '"></div><div class="pwd-field"><label>Importo CHF</label><input type="number" id="edit-se-importo" value="' +
    s.importo +
    '" step="0.01"></div><div class="pwd-field"><label>Descrizione</label><input type="text" id="edit-se-desc" value="' +
    escP(s.descrizione || '') +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaSE(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaModificaSE(id) {
  const benef = capitalizzaNome(document.getElementById('edit-se-benef').value.trim());
  const tipo = document.getElementById('edit-se-tipo').value;
  const luogo = document.getElementById('edit-se-luogo').value.trim();
  const importo = parseFloat(document.getElementById('edit-se-importo').value) || 0;
  const desc = document.getElementById('edit-se-desc').value.trim();
  if (!benef || !importo) {
    toast('Compila beneficiario e importo');
    return;
  }
  try {
    await secPatch('spese_extra', 'id=eq.' + id, { beneficiario: benef, tipo, luogo, importo, descrizione: desc });
    const s = speseExtraCache.find((x) => x.id === id);
    if (s) {
      s.beneficiario = benef;
      s.tipo = tipo;
      s.luogo = luogo;
      s.importo = importo;
      s.descrizione = desc;
    }
    document.getElementById('pwd-modal').classList.add('hidden');
    renderSpeseExtra();
    renderMaisonDashboard();
    logAzione('Modifica spesa extra', benef + ' ' + importo + ' CHF');
    toast('Modificata');
    // Riapri scheda cliente se era aperta
    if (
      document.getElementById('profilo-modal') &&
      !document.getElementById('profilo-modal').classList.contains('hidden')
    )
      apriDettaglioMaison(benef);
  } catch (e) {
    toast('Errore modifica spesa');
  }
}
function getSpeseExtraFiltrate() {
  const fn = (document.getElementById('se-filt-nome') || {}).value || '';
  const ft = (document.getElementById('se-filt-tipo') || {}).value || '';
  const fd = (document.getElementById('se-filt-dal') || {}).value || '';
  const fa = (document.getElementById('se-filt-al') || {}).value || '';
  return getSpeseReparto().filter((r) => {
    if (fn && !r.beneficiario.toLowerCase().includes(fn.toLowerCase())) return false;
    if (ft && r.tipo !== ft) return false;
    if (fd && r.data_spesa < fd) return false;
    if (fa && r.data_spesa > fa) return false;
    return true;
  });
}
function renderSpeseExtra() {
  const data = getSpeseExtraFiltrate();
  const el = document.getElementById('spese-extra-list');
  if (!el) return;
  const tot = data.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
  if (!data.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessuna spesa extra</p><small>Aggiungi una spesa compilando il form sopra</small></div>';
    return;
  }
  const nBenef = new Set(data.map((r) => r.beneficiario)).size;
  const topTipo = data.reduce((m, r) => {
    m[r.tipo] = (m[r.tipo] || 0) + 1;
    return m;
  }, {});
  const topTipoLabel =
    Object.entries(topTipo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
      .map((t) => SE_TIPI_LABEL[t[0]] || t[0])[0] || '';
  let h =
    '<div class="mini-stats-bar"><div class="mini-stat"><div class="mini-stat-num gold">' +
    fmtCHF(tot) +
    '</div><div class="mini-stat-label">Totale CHF</div></div><div class="mini-stat"><div class="mini-stat-num blue">' +
    data.length +
    '</div><div class="mini-stat-label">Spese</div></div><div class="mini-stat"><div class="mini-stat-num">' +
    nBenef +
    '</div><div class="mini-stat-label">Beneficiari</div></div>' +
    (topTipoLabel
      ? '<div class="mini-stat"><div class="mini-stat-num" style="font-size:1rem">' +
        topTipoLabel +
        '</div><div class="mini-stat-label">Tipo frequente</div></div>'
      : '') +
    '</div>';
  // Raggruppato per beneficiario con dettaglio tipi
  const byBenef = {};
  data.forEach((r) => {
    const k = r.beneficiario;
    if (!byBenef[k]) byBenef[k] = { tot: 0, visite: 0, tipi: {} };
    byBenef[k].tot += parseFloat(r.importo || 0);
    byBenef[k].visite++;
    byBenef[k].tipi[r.tipo] = (byBenef[k].tipi[r.tipo] || 0) + 1;
  });
  const sorted = Object.entries(byBenef).sort((a, b) => b[1].tot - a[1].tot);
  h +=
    '<div style="overflow-x:auto"><table class="collab-table"><thead><tr><th>Beneficiario</th><th class="num">Visite</th><th>Tipi</th><th class="num">Totale CHF</th><th class="num">Media CHF</th><th></th></tr></thead><tbody>';
  sorted.forEach(([nome, d], idx) => {
    const ne = nome.replace(/'/g, "\\'");
    let _seBudget = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
    if (!_seBudget) {
      const _cog = nome.toLowerCase().split(/\s+/)[0];
      if (_cog.length >= 3) _seBudget = getBudgetReparto().find((b) => b.nome.toLowerCase().split(/\s+/)[0] === _cog);
    }
    const _seCatBadge =
      _seBudget && _seBudget.categoria === 'full_maison'
        ? ' <span class="mini-badge" style="background:#b8860b;font-size:.7rem">Full Maison</span>'
        : _seBudget && _seBudget.categoria === 'maison'
          ? ' <span class="mini-badge" style="background:#2980b9;font-size:.7rem">Maison</span>'
          : _seBudget && _seBudget.categoria === 'direzione'
            ? ' <span class="mini-badge" style="background:#8e44ad;font-size:.7rem">Direzione</span>'
            : _seBudget && _seBudget.categoria === 'bu'
              ? ' <span class="mini-badge" style="background:#e67e22;font-size:.7rem">Buono Unico</span>'
              : _seBudget && _seBudget.categoria === 'bl'
                ? ' <span class="mini-badge" style="background:#2c6e49;font-size:.7rem">Buono Lounge</span>'
                : '';
    const tipiBadges = Object.entries(d.tipi)
      .map(
        ([t, n]) =>
          '<span class="mini-badge" style="background:' +
          (SE_TIPI_COLOR[t] || 'var(--muted)') +
          ';font-size:.7rem">' +
          n +
          ' ' +
          (SE_TIPI_LABEL[t] || t) +
          '</span>',
      )
      .join(' ');
    h +=
      '<tr style="' +
      (idx % 2 ? 'background:rgba(0,0,0,0.03)' : '') +
      '"><td><strong><span class="entry-name" onclick="apriDettaglioMaison(\'' +
      ne +
      '\')">' +
      escP(nome) +
      '</span></strong>' +
      _seCatBadge +
      '</td><td class="num">' +
      d.visite +
      '</td><td>' +
      tipiBadges +
      '</td><td class="num"><strong>' +
      fmtCHF(d.tot) +
      '</strong></td><td class="num">' +
      fmtCHF(d.tot / d.visite) +
      '</td><td style="white-space:nowrap"><button class="btn-act edit" onclick="rinominaSpeseExtraBenef(\'' +
      ne +
      '\')" style="font-size:.78rem;padding:3px 8px">Rinomina</button> <button class="btn-act del" onclick="eliminaSpeseExtraBenef(\'' +
      ne +
      '\')" style="font-size:.78rem;padding:3px 8px">Elimina</button></td></tr>';
  });
  h +=
    '<tr style="border-top:2px solid var(--ink);background:var(--paper2)"><td><strong>TOTALE</strong></td><td class="num"><strong>' +
    data.length +
    '</strong></td><td></td><td class="num"><strong>CHF ' +
    fmtCHF(tot) +
    '</strong></td><td></td><td></td></tr></tbody></table></div>';
  el.innerHTML = h;
}
async function eliminaSpeseExtraBenef(nome) {
  const ids = speseExtraCache.filter((r) => r.beneficiario === nome && (r.reparto_dip || 'slots') === currentReparto);
  if (!ids.length) {
    toast('Nessuna spesa');
    return;
  }
  if (!confirm('Eliminare tutte le ' + ids.length + ' spese extra di "' + nome + '"?')) return;
  try {
    for (const r of ids) {
      await secDel('spese_extra', 'id=eq.' + r.id);
    }
    speseExtraCache = speseExtraCache.filter(
      (r) => !(r.beneficiario === nome && (r.reparto_dip || 'slots') === currentReparto),
    );
    logAzione('Eliminato spese extra', nome + ' (' + ids.length + ' righe)');
    renderSpeseExtra();
    renderMaisonDashboard();
    toast(nome + ' eliminato (' + ids.length + ' spese)');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
function rinominaSpeseExtraBenef(vecchio) {
  const mc = document.getElementById('pwd-modal-content');
  mc.innerHTML =
    '<h3>Rinomina beneficiario</h3><p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">Rinomina tutte le spese extra di <strong>' +
    escP(vecchio) +
    '</strong></p><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="se-rename-nuovo" value="' +
    escP(vecchio) +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaSE(\'' +
    vecchio.replace(/'/g, "\\'") +
    '\')">Rinomina tutti</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const i = document.getElementById('se-rename-nuovo');
    if (i) {
      i.focus();
      i.select();
    }
  }, 100);
}
async function eseguiRinominaSE(vecchio) {
  const nuovo = capitalizzaNome(document.getElementById('se-rename-nuovo').value.trim());
  if (!nuovo) {
    toast('Inserisci un nome');
    return;
  }
  if (nuovo === vecchio) {
    document.getElementById('pwd-modal').classList.add('hidden');
    return;
  }
  const ids = speseExtraCache
    .filter((r) => r.beneficiario === vecchio && (r.reparto_dip || 'slots') === currentReparto)
    .map((r) => r.id);
  try {
    for (const id of ids) {
      await secPatch('spese_extra', 'id=eq.' + id, { beneficiario: nuovo });
    }
    speseExtraCache.forEach((r) => {
      if (r.beneficiario === vecchio && (r.reparto_dip || 'slots') === currentReparto) r.beneficiario = nuovo;
    });
    logAzione('Rinomina spese extra', vecchio + ' → ' + nuovo + ' (' + ids.length + ' righe)');
    document.getElementById('pwd-modal').classList.add('hidden');
    renderSpeseExtra();
    toast(vecchio + ' → ' + nuovo + ' (' + ids.length + ' righe)');
  } catch (e) {
    toast('Errore rinomina');
  }
}
function resetSpeseExtraFiltri() {
  document.getElementById('se-filt-nome').value = '';
  document.getElementById('se-filt-tipo').value = '';
  ['se-filt-dal', 'se-filt-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
  renderSpeseExtra();
}
function esportaSpeseExtraCSV() {
  const data = getSpeseExtraFiltrate();
  if (!data.length) {
    toast('Nessun dato');
    return;
  }
  const rows = [['Data', 'Beneficiario', 'Tipo', 'Luogo', 'Descrizione', 'Importo CHF', 'Operatore']];
  data.forEach((r) => {
    rows.push([
      new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
      r.beneficiario,
      SE_TIPI_LABEL[r.tipo] || r.tipo,
      r.luogo || '',
      r.descrizione || '',
      fmtCHF(r.importo),
      r.operatore || '',
    ]);
  });
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '\"' + String(c).replace(/\"/g, '\"\"') + '\"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'spese_extra_' + new Date().toLocaleDateString('it-IT').replace(/\//g, '-') + '.csv',
  }).click();
  toast('CSV esportato!');
}
async function esportaSpeseExtraPDF() {
  const data = getSpeseExtraFiltrate();
  if (!data.length) {
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
  const tot = data.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
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
    doc.text('Spese Extra', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Casino Lugano SA — ' + data.length + ' spese — CHF ' + fmtCHF(tot), pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: 16, right: 16 },
      head: [['Data', 'Beneficiario', 'Tipo', 'Luogo', 'Descrizione', 'CHF']],
      body: data.map((r) => [
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
        r.beneficiario,
        SE_TIPI_LABEL[r.tipo] || r.tipo,
        r.luogo || '',
        r.descrizione || '',
        fmtCHF(r.importo),
      ]),
      foot: [['', '', '', '', 'TOTALE', 'CHF ' + fmtCHF(tot)]],
      headStyles: { fillColor: [26, 18, 8] },
      footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8, cellPadding: 3 },
      columnStyles: { 5: { halign: 'right' } },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — Spese Extra — Pag. ' + i + '/' + tp, 16, doc.internal.pageSize.getHeight() - 8);
    }
    mostraPdfPreview(doc, 'spese_extra.pdf', 'Spese Extra');
  } catch (e) {
    toast('Errore PDF');
  }
}

// REPARTO SWITCH
function aggiornaLoginOperatori() {
  var settore = document.getElementById('login-settore').value;
  var loginNome = document.getElementById('login-nome');
  if (!settore) {
    loginNome.innerHTML = '<option value="">-- Seleziona operatore --</option>';
    return;
  }
  var ops = operatoriAuthCache
    .map(function (o) {
      return o.nome;
    })
    .filter(function (n) {
      var rep = operatoriRepartoMap[n] || 'entrambi';
      return rep === settore || rep === 'entrambi';
    })
    .sort();
  loginNome.innerHTML =
    '<option value="">-- Admin (password master) --</option>' +
    ops
      .map(function (n) {
        return '<option value="' + escP(n) + '">' + escP(n) + '</option>';
      })
      .join('');
}
function setReparto(rep) {
  currentReparto = rep;
  document.getElementById('btn-rep-slots').className = 'reparto-btn' + (rep === 'slots' ? ' active-slots' : '');
  document.getElementById('btn-rep-tavoli').className = 'reparto-btn' + (rep === 'tavoli' ? ' active-tavoli' : '');
  registraPushSubscription();
  // Re-render TUTTE le pagine (dati devono essere sempre freschi per il reparto)
  aggiornaNomi();
  render();
  updateStats();
  renderDashboard();
  renderStatistiche();
  renderMaisonDashboard();
  renderMaisonBudgetUI();
  renderSpeseExtra();
  renderRegali();
  if (typeof renderModuliList === 'function') renderModuliList();
  if (typeof renderRapporto === 'function') renderRapporto();
  renderConsegne();
  aggiornaConsegnaBadge();
  renderCassaAlerts();
  renderRischioAlerts();
  renderAmmonimentiAlerts();
  renderScadenzeBanner();
}
function applicaRepartoVisibilita() {
  var sw = document.getElementById('reparto-switch');
  if (!sw) return;
  var op = getOperatore();
  var opRep = operatoriRepartoMap[op] || 'entrambi';
  if (isAdmin()) opRep = 'entrambi';
  var vSlots = opRep === 'slots' || opRep === 'entrambi';
  var vTavoli = opRep === 'tavoli' || opRep === 'entrambi';
  if (vSlots && vTavoli) {
    sw.style.display = 'flex';
    sw.classList.remove('hidden');
  } else {
    sw.style.display = 'none';
    sw.classList.add('hidden');
    if (vSlots) currentReparto = 'slots';
    else if (vTavoli) currentReparto = 'tavoli';
    else currentReparto = 'slots';
  }
  document.getElementById('btn-rep-slots').className =
    'reparto-btn' + (currentReparto === 'slots' ? ' active-slots' : '');
  document.getElementById('btn-rep-tavoli').className =
    'reparto-btn' + (currentReparto === 'tavoli' ? ' active-tavoli' : '');
}
function getDatiReparto() {
  return datiCache.filter(function (e) {
    return (e.reparto_dip || 'slots') === currentReparto;
  });
}
function getMaisonReparto() {
  return maisonCache.filter(function (r) {
    return (r.reparto_dip || 'slots') === currentReparto;
  });
}
function getMaisonRepartoExpanded() {
  return getMaisonReparto().flatMap(function (r) {
    if (!r.nome || !r.nome.includes('/')) return [r];
    var nomi = r.nome
      .split(/\s*\/\s*/)
      .map(function (n) {
        return n.trim();
      })
      .filter(Boolean);
    if (nomi.length < 2) return [r];
    return nomi.map(function (n) {
      return Object.assign({}, r, {
        nome: capitalizzaNome(n),
        costo: Math.round((parseFloat(r.costo || 0) / nomi.length) * 100) / 100,
        px: Math.round((r.px || 0) / nomi.length) || 1,
        _costoOriginale: parseFloat(r.costo || 0),
        _nCondiviso: nomi.length,
        _gruppoOriginale: r.nome,
      });
    });
  });
}
function getBudgetReparto() {
  return maisonBudgetCache.filter(function (b) {
    return (b.reparto_dip || 'slots') === currentReparto;
  });
}
function getSpeseReparto() {
  return speseExtraCache.filter(function (r) {
    return (r.reparto_dip || 'slots') === currentReparto;
  });
}
function getModuliReparto() {
  return moduliCache.filter(function (m) {
    return (m.reparto_dip || 'slots') === currentReparto;
  });
}
function getConsegneReparto() {
  return consegneCache.filter(function (c) {
    return (c.reparto_dip || 'slots') === currentReparto;
  });
}

// === INVENTARIO ===
let _invTab = 'buoni';
function getInventarioReparto() {
  return inventarioCache.filter((r) => (r.reparto_dip || 'slots') === currentReparto);
}
function calcolaGiacenzaBuoni() {
  const inv = getInventarioReparto().filter((r) => r.categoria === 'buono');
  const giacenze = { BU: 0, BL: 0, CG: 0, WL: 0 };
  ['BU', 'BL', 'CG', 'WL'].forEach((t) => {
    const recs = inv.filter((r) => r.tipo === t);
    const entrate = recs.filter((r) => r.movimento === 'entrata').reduce((s, r) => s + r.quantita, 0);
    const uscite = recs.filter((r) => r.movimento === 'uscita').reduce((s, r) => s + r.quantita, 0);
    const preAss = recs
      .filter((r) => r.movimento === 'preassegno' && !r.pareggiato)
      .reduce((s, r) => s + r.quantita, 0);
    giacenze[t] = entrate - uscite - preAss;
  });
  const maisonBuoni = getMaisonReparto().filter((r) => r.tipo_buono);
  const linkedIds = new Set(inv.filter((r) => r.maison_id).map((r) => r.maison_id));
  maisonBuoni.forEach((r) => {
    if (linkedIds.has(r.id)) return;
    const preMatch = inv.find(
      (p) =>
        p.movimento === 'preassegno' &&
        !p.pareggiato &&
        p.tipo === r.tipo_buono &&
        p.cliente.toLowerCase() === r.nome.toLowerCase(),
    );
    if (!preMatch) {
      const qty = _contaBuoniFromNote(r);
      if (giacenze[r.tipo_buono] !== undefined) giacenze[r.tipo_buono] -= qty;
    }
  });
  return giacenze;
}
function _contaBuoniFromNote(r) {
  const m = (r.note || '').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);
  return m ? parseInt(m[1]) : 1;
}
function calcolaGiacenzeSigarette() {
  const inv = getInventarioReparto().filter((r) => r.categoria === 'sigaretta');
  const byMarca = {};
  inv.forEach((r) => {
    if (!byMarca[r.tipo]) byMarca[r.tipo] = 0;
    if (r.movimento === 'entrata') byMarca[r.tipo] += r.quantita;
    else byMarca[r.tipo] -= r.quantita;
  });
  return byMarca;
}
function renderInventario() {
  if (_invTab === 'buoni') {
    renderInventarioBuoni();
    document.getElementById('inv-section-buoni').style.display = '';
    document.getElementById('inv-section-sigarette').style.display = 'none';
  } else {
    renderInventarioSigarette();
    document.getElementById('inv-section-buoni').style.display = 'none';
    document.getElementById('inv-section-sigarette').style.display = '';
  }
  document.querySelectorAll('.inv-tab-btn').forEach((b) => {
    const isActive = b.dataset.tab === _invTab;
    b.classList.toggle('active', isActive);
    b.style.background = isActive ? 'var(--ink)' : 'var(--paper)';
    b.style.color = isActive ? 'var(--paper)' : 'var(--ink)';
    b.style.borderColor = isActive ? 'var(--ink)' : 'var(--line)';
  });
}
function switchInvTab(tab) {
  _invTab = tab;
  renderInventario();
}
function renderInventarioBuoni() {
  const giacenze = calcolaGiacenzaBuoni();
  const nonPareggiati = getInventarioReparto().filter(
    (r) => r.categoria === 'buono' && r.movimento === 'preassegno' && !r.pareggiato,
  ).length;
  const kpiEl = document.getElementById('inv-buoni-kpi');
  if (kpiEl) {
    const labels = { BU: 'Buono Unico', BL: 'Buono Lounge', CG: 'C. Gourmet', WL: 'Welcome L.' };
    const _scortaBassa = ['BU', 'BL', 'CG', 'WL'].filter((t) => (giacenze[t] || 0) > 0 && (giacenze[t] || 0) <= 10);
    const _scortaFinita = ['BU', 'BL', 'CG', 'WL'].filter(
      (t) => (giacenze[t] || 0) <= 0 && getInventarioReparto().some((r) => r.categoria === 'buono' && r.tipo === t),
    );
    kpiEl.innerHTML =
      ['BU', 'BL', 'CG', 'WL']
        .map((t) => {
          const v = giacenze[t] || 0;
          const col = v <= 0 ? 'var(--accent)' : v <= 10 ? '#e67e22' : '#2c6e49';
          return (
            '<div class="mini-stat"><div class="mini-stat-num" style="color:' +
            col +
            '">' +
            v +
            '</div><div class="mini-stat-label">' +
            labels[t] +
            '</div></div>'
          );
        })
        .join('') +
      (_scortaFinita.length
        ? '<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(192,57,43,0.15);color:var(--accent);border-radius:3px;font-size:.85rem;font-weight:600">&#9888; Scorta esaurita: ' +
          _scortaFinita.join(', ') +
          '</div>'
        : '') +
      (_scortaBassa.length
        ? '<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(230,126,34,0.12);color:#e67e22;border-radius:3px;font-size:.85rem">&#9888; Scorta bassa (&le;10): ' +
          _scortaBassa.map((t) => t + ' (' + giacenze[t] + ')').join(', ') +
          '</div>'
        : '') +
      (nonPareggiati
        ? '<div style="width:100%;grid-column:1/-1;margin-top:8px;padding:8px;background:rgba(230,126,34,0.12);color:#e67e22;border-radius:3px;font-size:.85rem">&#9888; ' +
          nonPareggiati +
          ' buoni pre-assegnati non pareggiati</div>'
        : '');
  }
  renderInventarioBuoniTable();
}
function _invPopulateAnni() {
  const anni = new Set();
  getInventarioReparto().forEach((r) => {
    if (r.data_movimento) anni.add(r.data_movimento.substring(0, 4));
  });
  getMaisonReparto()
    .filter((r) => r.tipo_buono)
    .forEach((r) => {
      if (r.data_giornata) anni.add(r.data_giornata.substring(0, 4));
    });
  const sorted = [...anni].sort().reverse();
  ['inv-b-filt-anno', 'inv-s-filt-anno'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cv = sel.value;
    sel.innerHTML =
      '<option value="">Tutti</option>' +
      sorted.map((a) => '<option' + (a === cv ? ' selected' : '') + '>' + a + '</option>').join('');
  });
}
function renderInventarioBuoniTable() {
  const el = document.getElementById('inv-buoni-table');
  if (!el) return;
  _invPopulateAnni();
  const ft = (document.getElementById('inv-b-filt-tipo') || {}).value || '';
  const fc = (document.getElementById('inv-b-filt-cliente') || {}).value || '';
  const fq = (document.getElementById('inv-b-filt-cerca') || {}).value || '';
  const fmese = (document.getElementById('inv-b-filt-mese') || {}).value || '';
  const fanno = (document.getElementById('inv-b-filt-anno') || {}).value || '';
  const fd = (document.getElementById('inv-b-filt-dal') || {}).value || '';
  const fa = (document.getElementById('inv-b-filt-al') || {}).value || '';
  const fs = (document.getElementById('inv-b-filt-stato') || {}).value || '';
  function _filtDate(d) {
    if (!d) return false;
    if (fd && d < fd) return false;
    if (fa && d > fa) return false;
    if (fmese && d.substring(5, 7) !== fmese) return false;
    if (fanno && d.substring(0, 4) !== fanno) return false;
    return true;
  }
  function _filtCerca(r) {
    if (!fq) return true;
    const q = fq.toLowerCase();
    return (
      (r.tipo || '').toLowerCase().includes(q) ||
      (r.cliente || '').toLowerCase().includes(q) ||
      (r.note || '').toLowerCase().includes(q) ||
      (r.movimento || '').toLowerCase().includes(q)
    );
  }
  let rows = getInventarioReparto().filter((r) => r.categoria === 'buono');
  if (ft) rows = rows.filter((r) => r.tipo === ft);
  if (fc) rows = rows.filter((r) => (r.cliente || '').toLowerCase().includes(fc.toLowerCase()));
  rows = rows.filter((r) => _filtDate(r.data_movimento));
  rows = rows.filter(_filtCerca);
  if (fs === 'pareggiato') rows = rows.filter((r) => r.pareggiato);
  if (fs === 'non_pareggiato') rows = rows.filter((r) => r.movimento === 'preassegno' && !r.pareggiato);
  const linkedIds = new Set(
    getInventarioReparto()
      .filter((r) => r.maison_id)
      .map((r) => r.maison_id),
  );
  let autoRows = getMaisonReparto()
    .filter((r) => r.tipo_buono && !linkedIds.has(r.id))
    .map((r) => ({
      tipo: r.tipo_buono,
      movimento: 'auto',
      quantita: _contaBuoniFromNote(r),
      cliente: r.nome,
      data_movimento: r.data_giornata,
      note: 'Da Maison',
      _auto: true,
    }));
  const all = [
    ...rows,
    ...autoRows.filter((r) => {
      if (ft && r.tipo !== ft) return false;
      if (fc && !r.cliente.toLowerCase().includes(fc.toLowerCase())) return false;
      if (!_filtDate(r.data_movimento)) return false;
      if (!_filtCerca(r)) return false;
      if (fs) return false;
      return true;
    }),
  ].sort((a, b) => (b.data_movimento || '').localeCompare(a.data_movimento || ''));
  if (!all.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:16px;text-align:center">Nessun movimento</p>';
    return;
  }
  const movLabels = {
    entrata: '&#9650; Carico',
    uscita: '&#9660; Uscita man.',
    preassegno: '&#9660; Pre-assegnato',
    auto: '&#9660; Da Maison',
  };
  const movColors = { entrata: '#2c6e49', uscita: '#c0392b', preassegno: '#e67e22', auto: '#8a7d6b' };
  const tipColors = { BU: '#b8860b', BL: '#1a4a7a', CG: '#2c6e49', WL: '#7b2d8b' };
  let html =
    '<table style="width:100%;border-collapse:collapse;font-size:.88rem"><thead><tr style="border-bottom:2px solid var(--line);text-align:left"><th style="padding:8px">Data</th><th style="padding:8px">Tipo</th><th style="padding:8px">Qty</th><th style="padding:8px">Movimento</th><th style="padding:8px">Cliente</th><th style="padding:8px">Stato</th><th style="padding:8px"></th></tr></thead><tbody>';
  all.forEach((r) => {
    const d = r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '';
    const mov = movLabels[r.movimento] || r.movimento;
    const col = movColors[r.movimento] || 'var(--ink)';
    const qSign = r.movimento === 'entrata' ? '+' : '-';
    const stato =
      r.movimento === 'preassegno'
        ? r.pareggiato
          ? '<span style="color:#2c6e49">&#10003; Pareggiato</span>'
          : '<span style="color:#e67e22">&#9203; In attesa</span>'
        : r._auto
          ? '<span style="color:var(--muted)">auto</span>'
          : '';
    const actions = r._auto
      ? ''
      : '<div style="display:flex;gap:4px"><button class="entry-action-btn" onclick="modificaInventario(' +
        r.id +
        ')" title="Modifica">&#9998;</button><button class="entry-action-btn" onclick="eliminaInventario(' +
        r.id +
        ')" title="Elimina">&#128465;</button></div>';
    html +=
      '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 8px;white-space:nowrap;color:var(--muted);font-size:.82rem">' +
      d +
      '</td><td style="padding:6px 8px"><span style="background:' +
      (tipColors[r.tipo] || 'var(--muted)') +
      ';color:white;padding:2px 8px;border-radius:2px;font-size:.78rem;font-weight:600">' +
      escP(r.tipo) +
      '</span></td><td style="padding:6px 8px;font-weight:700;color:' +
      col +
      '">' +
      qSign +
      r.quantita +
      '</td><td style="padding:6px 8px;color:' +
      col +
      '">' +
      mov +
      '</td><td style="padding:6px 8px">' +
      escP(r.cliente || '') +
      '</td><td style="padding:6px 8px">' +
      stato +
      '</td><td style="padding:6px 8px">' +
      actions +
      '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}
function renderInventarioSigarette() {
  const giacenze = calcolaGiacenzeSigarette();
  const kpiEl = document.getElementById('inv-sig-kpi');
  if (kpiEl) {
    const brands = Object.entries(giacenze)
      .filter(([k, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const totale = brands.reduce((s, [k, v]) => s + v, 0);
    kpiEl.innerHTML =
      brands
        .map(
          ([marca, qty]) =>
            '<div class="mini-stat"><div class="mini-stat-num">' +
            qty +
            '</div><div class="mini-stat-label">' +
            escP(marca) +
            '</div></div>',
        )
        .join('') +
      '<div class="mini-stat"><div class="mini-stat-num" style="color:var(--ink)">' +
      totale +
      '</div><div class="mini-stat-label">Totale pacchetti</div></div>';
    if (!brands.length)
      kpiEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:12px">Nessuna sigaretta in scorta</p>';
  }
  renderInventarioSigTable();
  _aggiornaMarche();
}
function renderInventarioSigTable() {
  const el = document.getElementById('inv-sig-table');
  if (!el) return;
  _invPopulateAnni();
  const fm = (document.getElementById('inv-s-filt-marca') || {}).value || '';
  const fq = (document.getElementById('inv-s-filt-cerca') || {}).value || '';
  const fmese = (document.getElementById('inv-s-filt-mese') || {}).value || '';
  const fanno = (document.getElementById('inv-s-filt-anno') || {}).value || '';
  const fd = (document.getElementById('inv-s-filt-dal') || {}).value || '';
  const fa = (document.getElementById('inv-s-filt-al') || {}).value || '';
  let rows = getInventarioReparto().filter((r) => r.categoria === 'sigaretta');
  if (fm) rows = rows.filter((r) => r.tipo.toLowerCase().includes(fm.toLowerCase()));
  if (fq) {
    const q = fq.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.tipo || '').toLowerCase().includes(q) ||
        (r.cliente || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q),
    );
  }
  if (fmese) rows = rows.filter((r) => r.data_movimento && r.data_movimento.substring(5, 7) === fmese);
  if (fanno) rows = rows.filter((r) => r.data_movimento && r.data_movimento.substring(0, 4) === fanno);
  if (fd) rows = rows.filter((r) => r.data_movimento >= fd);
  if (fa) rows = rows.filter((r) => r.data_movimento <= fa);
  rows.sort((a, b) => (b.data_movimento || '').localeCompare(a.data_movimento || ''));
  if (!rows.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:16px;text-align:center">Nessun movimento</p>';
    return;
  }
  let html =
    '<table style="width:100%;border-collapse:collapse;font-size:.88rem"><thead><tr style="border-bottom:2px solid var(--line);text-align:left"><th style="padding:8px">Data</th><th style="padding:8px">Marca</th><th style="padding:8px">Qty</th><th style="padding:8px">Movimento</th><th style="padding:8px">Cliente</th><th style="padding:8px">Collaboratore</th><th style="padding:8px"></th></tr></thead><tbody>';
  rows.forEach((r) => {
    const d = r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '';
    const isIn = r.movimento === 'entrata';
    html +=
      '<tr style="border-bottom:1px solid var(--line)"><td style="padding:6px 8px;color:var(--muted);font-size:.82rem">' +
      d +
      '</td><td style="padding:6px 8px;font-weight:600">' +
      escP(r.tipo) +
      '</td><td style="padding:6px 8px;font-weight:700;color:' +
      (isIn ? '#2c6e49' : '#c0392b') +
      '">' +
      (isIn ? '+' : '-') +
      r.quantita +
      '</td><td style="padding:6px 8px;color:' +
      (isIn ? '#2c6e49' : '#c0392b') +
      '">' +
      (isIn ? '&#9650; Sbagliata' : '&#9660; Data a cliente') +
      '</td><td style="padding:6px 8px">' +
      escP(r.cliente || '') +
      '</td><td style="padding:6px 8px;color:var(--muted)">' +
      escP(r.note || '') +
      '</td><td style="padding:6px 8px"><div style="display:flex;gap:4px"><button class="entry-action-btn" onclick="modificaInventario(' +
      r.id +
      ')" title="Modifica">&#9998;</button><button class="entry-action-btn" onclick="eliminaInventario(' +
      r.id +
      ')" title="Elimina">&#128465;</button></div></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}
async function salvaInventarioCarico() {
  const tipo = (document.getElementById('inv-carico-tipo') || {}).value;
  const qty = parseInt((document.getElementById('inv-carico-qty') || {}).value) || 0;
  const data = (document.getElementById('inv-carico-data') || {}).value || new Date().toISOString().split('T')[0];
  const nota = (document.getElementById('inv-carico-nota') || {}).value || '';
  if (!tipo) {
    toast('Seleziona il tipo');
    return;
  }
  if (!qty || qty < 1) {
    toast('Inserisci la quantit\u00e0');
    return;
  }
  const rec = {
    categoria: 'buono',
    tipo: tipo,
    movimento: 'entrata',
    quantita: qty,
    data_movimento: data,
    note: nota,
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  };
  try {
    const r = await secPost('inventario', rec);
    if (r && r[0]) inventarioCache.unshift(r[0]);
    document.getElementById('inv-carico-qty').value = '';
    document.getElementById('inv-carico-nota').value = '';
    const fp = document.getElementById('inv-carico-data');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    logAzione('Inventario carico', qty + ' ' + tipo);
    renderInventario();
    toast(qty + ' ' + tipo + ' caricati');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
async function salvaInventarioUscita() {
  const cliente = capitalizzaNome((document.getElementById('inv-usc-cliente') || {}).value.trim());
  const tipo = (document.getElementById('inv-usc-tipo') || {}).value;
  const qty = parseInt((document.getElementById('inv-usc-qty') || {}).value) || 0;
  const data = (document.getElementById('inv-usc-data') || {}).value || new Date().toISOString().split('T')[0];
  const nota = (document.getElementById('inv-usc-nota') || {}).value || '';
  if (!cliente) {
    toast('Inserisci il cliente');
    return;
  }
  if (!tipo) {
    toast('Seleziona il tipo');
    return;
  }
  if (!qty || qty < 1) {
    toast('Inserisci la quantit\u00e0');
    return;
  }
  const rec = {
    categoria: 'buono',
    tipo: tipo,
    movimento: 'preassegno',
    quantita: qty,
    cliente: cliente,
    data_movimento: data,
    note: nota,
    pareggiato: false,
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  };
  try {
    const r = await secPost('inventario', rec);
    if (r && r[0]) inventarioCache.unshift(r[0]);
    document.getElementById('inv-usc-cliente').value = '';
    document.getElementById('inv-usc-qty').value = '1';
    document.getElementById('inv-usc-nota').value = '';
    const fp = document.getElementById('inv-usc-data');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    logAzione('Inventario uscita', qty + ' ' + tipo + ' a ' + cliente);
    renderInventario();
    toast(qty + ' ' + tipo + ' assegnati a ' + cliente);
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
async function salvaInventarioSigEntrata() {
  const marca = capitalizzaNome((document.getElementById('inv-sig-marca') || {}).value.trim());
  const collab = (document.getElementById('inv-sig-collab') || {}).value.trim();
  const cliente = (document.getElementById('inv-sig-cliente') || {}).value.trim();
  const qty = parseInt((document.getElementById('inv-sig-qty') || {}).value) || 1;
  const data = (document.getElementById('inv-sig-data') || {}).value || new Date().toISOString().split('T')[0];
  if (!marca) {
    toast('Inserisci la marca');
    return;
  }
  const rec = {
    categoria: 'sigaretta',
    tipo: marca,
    movimento: 'entrata',
    quantita: qty,
    cliente: cliente || '',
    note: collab || '',
    data_movimento: data,
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  };
  try {
    const r = await secPost('inventario', rec);
    if (r && r[0]) inventarioCache.unshift(r[0]);
    document.getElementById('inv-sig-marca').value = '';
    document.getElementById('inv-sig-collab').value = '';
    document.getElementById('inv-sig-cliente').value = '';
    logAzione('Inventario sigaretta', marca + ' (sbagliata per ' + cliente + ')');
    renderInventario();
    toast(marca + ' aggiunta alla scorta');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
async function salvaInventarioSigUscita() {
  const marca = (document.getElementById('inv-sig-usc-marca') || {}).value;
  const cliente = (document.getElementById('inv-sig-usc-cliente') || {}).value.trim();
  const qty = parseInt((document.getElementById('inv-sig-usc-qty') || {}).value) || 1;
  const data = (document.getElementById('inv-sig-usc-data') || {}).value || new Date().toISOString().split('T')[0];
  if (!marca) {
    toast('Seleziona la marca');
    return;
  }
  if (!cliente) {
    toast('Inserisci il cliente');
    return;
  }
  const rec = {
    categoria: 'sigaretta',
    tipo: marca,
    movimento: 'uscita',
    quantita: qty,
    cliente: cliente,
    data_movimento: data,
    operatore: getOperatore(),
    reparto_dip: currentReparto,
  };
  try {
    const r = await secPost('inventario', rec);
    if (r && r[0]) inventarioCache.unshift(r[0]);
    document.getElementById('inv-sig-usc-cliente').value = '';
    logAzione('Inventario sigaretta', marca + ' data a ' + cliente);
    renderInventario();
    toast(marca + ' data a ' + cliente);
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
async function eliminaInventario(id) {
  if (!confirm('Eliminare questo movimento?')) return;
  try {
    await secDel('inventario', 'id=eq.' + id);
    inventarioCache = inventarioCache.filter((r) => r.id !== id);
    logAzione('Inventario eliminato', 'ID ' + id);
    renderInventario();
    toast('Movimento eliminato');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
function modificaInventario(id) {
  const r = inventarioCache.find((x) => x.id === id);
  if (!r) return;
  const b = document.getElementById('pwd-modal-content');
  const isBuono = r.categoria === 'buono';
  let html = '<h3>Modifica movimento</h3>';
  if (isBuono) {
    html +=
      '<div class="pwd-field"><label>Tipo</label><select id="inv-edit-tipo" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option value="BU"' +
      (r.tipo === 'BU' ? ' selected' : '') +
      '>BU</option><option value="BL"' +
      (r.tipo === 'BL' ? ' selected' : '') +
      '>BL</option><option value="CG"' +
      (r.tipo === 'CG' ? ' selected' : '') +
      '>CG</option><option value="WL"' +
      (r.tipo === 'WL' ? ' selected' : '') +
      '>WL</option></select></div>';
  } else {
    html +=
      '<div class="pwd-field"><label>Marca</label><input type="text" id="inv-edit-tipo" value="' +
      escP(r.tipo) +
      '" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  }
  html +=
    '<div class="pwd-field"><label>Quantit\u00e0</label><input type="number" id="inv-edit-qty" value="' +
    r.quantita +
    '" min="1" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html +=
    '<div class="pwd-field"><label>Cliente</label><input type="text" id="inv-edit-cliente" value="' +
    escP(r.cliente || '') +
    '" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html +=
    '<div class="pwd-field"><label>Data</label><input type="text" id="inv-edit-data" value="' +
    (r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '') +
    '" placeholder="GG/MM/AAAA" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html +=
    '<div class="pwd-field"><label>Nota</label><input type="text" id="inv-edit-nota" value="' +
    escP(r.note || '') +
    '" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaInventario(' +
    id +
    ')">Salva</button></div>';
  b.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
  if (window.flatpickr) flatpickr('#inv-edit-data', { locale: 'it', dateFormat: 'd/m/Y', allowInput: true });
}
async function salvaModificaInventario(id) {
  const tipo = (document.getElementById('inv-edit-tipo') || {}).value.trim();
  const qty = parseInt((document.getElementById('inv-edit-qty') || {}).value) || 1;
  const cliente = (document.getElementById('inv-edit-cliente') || {}).value.trim();
  const dataRaw = (document.getElementById('inv-edit-data') || {}).value.trim();
  const nota = (document.getElementById('inv-edit-nota') || {}).value.trim();
  let dataISO = '';
  if (dataRaw) {
    const dm = dataRaw.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
    if (dm) {
      const a = parseInt(dm[3]);
      dataISO = (a < 100 ? 2000 + a : a) + '-' + dm[2].padStart(2, '0') + '-' + dm[1].padStart(2, '0');
    } else dataISO = dataRaw;
  }
  const updates = { tipo: tipo, quantita: qty, cliente: cliente, note: nota };
  if (dataISO) updates.data_movimento = dataISO;
  try {
    await secPatch('inventario', 'id=eq.' + id, updates);
    const c = inventarioCache.find((x) => x.id === id);
    if (c) Object.assign(c, updates);
    document.getElementById('pwd-modal').classList.add('hidden');
    logAzione('Inventario modificato', tipo + ' qty=' + qty);
    renderInventario();
    toast('Movimento modificato');
  } catch (e) {
    toast('Errore modifica');
  }
}
function sincronizzaPareggioBuoni() {
  const inv = getInventarioReparto().filter(
    (r) => r.categoria === 'buono' && r.movimento === 'preassegno' && !r.pareggiato,
  );
  if (!inv.length) return;
  const maison = getMaisonReparto().filter((r) => r.tipo_buono);
  inv.forEach(async (pre) => {
    const match = maison.find(
      (m) =>
        m.tipo_buono === pre.tipo &&
        m.nome.toLowerCase() === pre.cliente.toLowerCase() &&
        m.data_giornata >= pre.data_movimento,
    );
    if (match) {
      try {
        await secPatch('inventario', 'id=eq.' + pre.id, { pareggiato: true, pareggio_maison_id: match.id });
        pre.pareggiato = true;
        pre.pareggio_maison_id = match.id;
      } catch (e) {}
    }
  });
}
function _aggiornaMarche() {
  const sel = document.getElementById('inv-sig-usc-marca');
  if (!sel) return;
  const giacenze = calcolaGiacenzeSigarette();
  const brands = Object.entries(giacenze)
    .filter(([k, v]) => v > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  sel.innerHTML =
    '<option value="">Seleziona...</option>' +
    brands.map(([m, q]) => '<option value="' + escP(m) + '">' + escP(m) + ' (' + q + ')</option>').join('');
}
function initInventarioFP() {
  if (!window.flatpickr) return;
  const opts = { locale: 'it', dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: false };
  ['inv-carico-data', 'inv-usc-data', 'inv-sig-data', 'inv-sig-usc-data'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el._flatpickr) flatpickr('#' + id, opts);
  });
  const fOpts = Object.assign({}, opts, {
    onChange: function () {
      renderInventario();
    },
  });
  ['inv-b-filt-dal', 'inv-b-filt-al', 'inv-s-filt-dal', 'inv-s-filt-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el._flatpickr) flatpickr('#' + id, fOpts);
  });
}
function esportaInventarioCSV() {
  const isBuoni = _invTab === 'buoni';
  const data = getInventarioReparto().filter((r) => r.categoria === (isBuoni ? 'buono' : 'sigaretta'));
  if (!data.length) {
    toast('Nessun dato');
    return;
  }
  const headers = isBuoni
    ? ['Data', 'Tipo', 'Quantit\u00e0', 'Movimento', 'Cliente', 'Stato', 'Nota']
    : ['Data', 'Marca', 'Quantit\u00e0', 'Movimento', 'Cliente', 'Collaboratore'];
  const rows = data.map((r) => {
    const d = r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '';
    if (isBuoni)
      return [
        d,
        r.tipo,
        (r.movimento === 'entrata' ? '+' : '-') + r.quantita,
        r.movimento,
        r.cliente || '',
        r.pareggiato ? 'Pareggiato' : r.movimento === 'preassegno' ? 'In attesa' : '',
        r.note || '',
      ];
    return [
      d,
      r.tipo,
      (r.movimento === 'entrata' ? '+' : '-') + r.quantita,
      r.movimento === 'entrata' ? 'Sbagliata' : 'Data a cliente',
      r.cliente || '',
      r.note || '',
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => '"' + (c + '').replace(/"/g, '""') + '"').join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download =
    'inventario_' + (isBuoni ? 'buoni' : 'sigarette') + '_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
}
function esportaInventarioPDF() {
  if (!window.jspdf) {
    toast('Libreria PDF non caricata');
    return;
  }
  const isBuoni = _invTab === 'buoni';
  const data = getInventarioReparto().filter((r) => r.categoria === (isBuoni ? 'buono' : 'sigaretta'));
  if (!data.length) {
    toast('Nessun dato');
    return;
  }
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(
    'Inventario ' +
      (isBuoni ? 'Buoni' : 'Sigarette') +
      ' \u2014 ' +
      currentReparto.charAt(0).toUpperCase() +
      currentReparto.slice(1),
    14,
    16,
  );
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' alle ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    14,
    22,
  );
  if (isBuoni) {
    const giacenze = calcolaGiacenzaBuoni();
    doc.text(
      'Giacenze: BU=' + giacenze.BU + ' | BL=' + giacenze.BL + ' | CG=' + giacenze.CG + ' | WL=' + giacenze.WL,
      14,
      28,
    );
  }
  const headers = isBuoni
    ? [['Data', 'Tipo', 'Qty', 'Movimento', 'Cliente', 'Stato', 'Nota']]
    : [['Data', 'Marca', 'Qty', 'Movimento', 'Cliente', 'Collaboratore']];
  const rows = data.map((r) => {
    const d = r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '';
    if (isBuoni)
      return [
        d,
        r.tipo,
        (r.movimento === 'entrata' ? '+' : '-') + r.quantita,
        r.movimento,
        r.cliente || '',
        r.pareggiato ? 'Pareggiato' : r.movimento === 'preassegno' ? 'In attesa' : '',
        r.note || '',
      ];
    return [
      d,
      r.tipo,
      (r.movimento === 'entrata' ? '+' : '-') + r.quantita,
      r.movimento === 'entrata' ? 'Sbagliata' : 'Data a cliente',
      r.cliente || '',
      r.note || '',
    ];
  });
  doc.autoTable({
    head: headers,
    body: rows,
    startY: isBuoni ? 32 : 26,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3, lineColor: [200, 200, 200] },
    headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold' },
  });
  doc.save('inventario_' + (isBuoni ? 'buoni' : 'sigarette') + '_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// MENU MOBILE
function toggleMobileNav() {
  document.getElementById('mobile-nav').classList.toggle('show');
}
function chiudiMobileNav() {
  document.getElementById('mobile-nav').classList.remove('show');
}
function aggiornaMenuMobile() {
  try {
    const items = document.getElementById('mobile-nav-items');
    if (!items) return;
    const tabs = [
      { page: 'dashboard', icon: '&#127968;', label: 'Home' },
      { page: 'diario', icon: '&#128214;', label: 'Diario' },
      { page: 'rapporto', icon: '&#128197;', label: 'Rapporto', vis: 'rapporto' },
      {
        page: 'note-collega',
        icon: '&#9993;&#65039;',
        label: 'Note Colleghi',
        vis: 'note_collega',
        badgeId: 'note-badge',
      },
      { page: 'statistiche', icon: '&#128202;', label: 'Statistiche', vis: 'statistiche' },
      { page: 'moduli', icon: '&#128196;', label: 'Moduli', vis: 'moduli' },
      { page: 'assistente', icon: '&#128113;&#8205;&#9792;&#65039;', label: 'Assistente', vis: 'assistente' },
      { page: 'consegna', icon: '&#128221;', label: 'Consegna', vis: 'consegna', badgeId: 'consegna-badge' },
      { page: 'promemoria', icon: '&#128203;', label: 'Promemoria', vis: 'promemoria', badgeId: 'promemoria-badge' },
      { page: 'maison', icon: '&#127860;', label: 'Maison', vis: 'maison' },
      { page: 'inventario', icon: '&#128230;', label: 'Inventario', vis: 'inventario' },
      { page: 'registro', icon: '&#128203;', label: 'Registro', adminOnly: true },
      { page: 'impostazioni', icon: '&#9881;&#65039;', label: 'Impostazioni' },
    ];
    const cur = localStorage.getItem('pagina_corrente') || 'dashboard';
    let html = '';
    tabs.forEach(function (t) {
      if (t.adminOnly && !isAdmin()) return;
      if (t.vis && typeof isVis === 'function' && !isVis(t.vis)) return;
      var badge = t.badgeId ? document.getElementById(t.badgeId) : null;
      var badgeHtml =
        badge && badge.style.display !== 'none' ? '<span class="nav-badge">' + badge.textContent + '</span>' : '';
      html +=
        '<button class="mobile-nav-item' +
        (cur === t.page ? ' active' : '') +
        '" onclick="switchPage(\'' +
        t.page +
        '\');chiudiMobileNav()">' +
        t.icon +
        ' ' +
        t.label +
        badgeHtml +
        '</button>';
    });
    items.innerHTML = html;
    var curTab = tabs.find(function (t) {
      return t.page === cur;
    });
    var hBtn = document.getElementById('hamburger-btn');
    if (hBtn && curTab) hBtn.innerHTML = '&#9776; ' + curTab.icon + ' ' + curTab.label;
  } catch (e) {
    console.error('Menu mobile error:', e);
  }
}

// INIT
window.addEventListener('load', async () => {
  if (localStorage.getItem('tema') === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('btn-tema').textContent = 'Tema chiaro';
  } // tema provvisorio, poi si applica quello dell'operatore
  document.getElementById('entries-list').innerHTML = '<div class="loading">Caricamento...</div>';
  const h = document.getElementById('login-hint');
  const defCheck = await sbRpc('is_default_master_pwd', { p_default_hash: DEFAULT_PWD_HASH });
  if ((defCheck && defCheck.is_default) || operatoriAuthCache.length)
    h.innerHTML = 'Accedi come Admin oppure seleziona il tuo nome';
  // Carica mappa reparti e operatori da cache per il login
  if (!Object.keys(operatoriRepartoMap).length) {
    try {
      const cached = localStorage.getItem('_cache_operatori_reparto');
      if (cached) operatoriRepartoMap = JSON.parse(cached);
    } catch (e) {}
  }
  if (!operatoriAuthCache.length) {
    try {
      const cached = localStorage.getItem('_cache_operatori_auth');
      if (cached) operatoriAuthCache = JSON.parse(cached);
    } catch (e) {}
  }
  // Carica operatori dal DB per il login (leggero, senza loadAll)
  try {
    const _opLogin = await sbRpc('list_operators');
    if (_opLogin && _opLogin.length) {
      operatoriAuthCache = _opLogin;
      localStorage.setItem('_cache_operatori_auth', JSON.stringify(_opLogin));
    }
  } catch (e) {}
  // Populate login dropdown
  aggiornaLoginOperatori();
  if (_isSessionValid()) {
    // Se Face ID attivo e non gia verificato in questa tab (refresh): verifica PRIMA di entrare
    if (_hasBioForCurrentOp() && !sessionStorage.getItem('bio_verified')) {
      var bl = document.getElementById('biometric-login');
      if (bl) {
        bl.style.display = 'block';
        var _bb = document.getElementById('bio-login-btn');
        if (_bb) _bb.textContent = '\u{1F512} ' + getBioName();
      }
      var bioOk = await loginBiometrico();
      if (bioOk) {
        sessionStorage.setItem('bio_verified', '1');
        sessionStorage.setItem('session_active', '1');
      } else {
        document.getElementById('pwd-input').focus();
        var _sel = document.getElementById('login-nome');
        var _sop = localStorage.getItem('operatore_corrente');
        if (_sel && _sop) {
          for (var i = 0; i < _sel.options.length; i++) {
            if (_sel.options[i].value === _sop) {
              _sel.selectedIndex = i;
              break;
            }
          }
        }
        return;
      }
    }
    document.getElementById('login-overlay').classList.add('hidden');
    applicaTemaOperatore();
    // Valida sessione admin se presente
    if (isAdmin()) {
      const tk = getAdminToken();
      if (tk) {
        const sv = await sbRpc('validate_admin_session', { p_token: tk });
        if (!sv || !sv.valid) {
          sessionStorage.removeItem('is_admin');
          sessionStorage.removeItem('admin_token');
        }
      } else {
        sessionStorage.removeItem('is_admin');
      }
    }
    // Verifica/rinnova token sessione per caricare dati
    var _opTk = getOpToken();
    if (_opTk) {
      var _vld = await sbRpc('validate_op_session', { p_token: _opTk });
      if (!_vld || !_vld.valid) {
        sessionStorage.removeItem('op_token');
        _opTk = '';
      }
    }
    if (!_opTk) {
      var _ropN = getOperatore();
      if (_ropN) {
        var _bioS = await sbRpc('create_bio_session', { p_nome: _ropN });
        if (_bioS && _bioS.session_token) setOpToken(_bioS.session_token);
        else {
          var _bioS2 = await sbRpc('create_bio_session', { p_nome: _ropN });
          if (_bioS2 && _bioS2.session_token) setOpToken(_bioS2.session_token);
        }
      }
    }
    await loadAll();
    // Se dati vuoti (possibile token scaduto/fallito), rinnova e riprova
    if (!datiCache.length && getOperatore()) {
      console.warn('Init: dati vuoti, rinnovo token...');
      if (await _renewToken()) await loadAll();
    }
    _initNoteRealtime();
    applicaVisibilita();
    var _sp = localStorage.getItem('pagina_corrente');
    switchPage(_sp || 'dashboard');
    _renderPostLogin();
    if (getOperatore()) {
      document.getElementById('operatore-display').textContent = 'Operatore: ' + getOperatore();
      const authCheck = await sbRpc('check_deve_cambiare', { p_nome: getOperatore() });
      if (authCheck && authCheck.deve_cambiare_pwd) setTimeout(() => forzaCambioPwdOperatore(getOperatore()), 300);
      else {
        setTimeout(() => mostraNoteNonLette(), 800);
        setTimeout(() => mostraPromemoriaLogin(), 1500);
        setTimeout(() => mostraConsegnaLogin(), 2100);
      }
      if (isAdmin()) document.getElementById('tab-registro').style.display = '';
    } else if (isAdmin()) {
      document.getElementById('operatore-display').textContent = 'Admin';
      document.getElementById('tab-registro').style.display = '';
    }
  } else {
    // Face ID auto-trigger se QUALSIASI credenziale esiste (login screen)
    if (_hasBioForAnyOp()) {
      // Imposta operatore_corrente dalla credenziale per far funzionare tentaBiometrico
      var _bioC = JSON.parse(localStorage.getItem('webauthn_cred'));
      localStorage.setItem('operatore_corrente', _bioC.op);
      var bl = document.getElementById('biometric-login');
      if (bl) {
        bl.style.display = 'block';
        var _bb = document.getElementById('bio-login-btn');
        if (_bb) _bb.textContent = '\u{1F512} ' + getBioName() + ' (' + _bioC.op + ')';
      }
      setTimeout(() => tentaBiometrico(), 500);
    } else {
      // Pre-compila operatore se salvato
      var savedOp = localStorage.getItem('operatore_corrente');
      if (savedOp) {
        var sel = document.getElementById('login-nome');
        if (sel) {
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === savedOp) {
              sel.selectedIndex = i;
              break;
            }
          }
        }
      }
      document.getElementById('pwd-input').focus();
    }
  }
  const n = new Date();
  document.getElementById('today-date').innerHTML =
    n.getDate() +
    ' ' +
    MESI[n.getMonth()] +
    ' ' +
    n.getFullYear() +
    '<br><small style="color:var(--muted);font-size:.75rem">' +
    GIORNI[n.getDay()] +
    '</small>';
  // Render gia eseguito nel blocco login sopra (dopo loadAll)
  setTimeout(checkQrHash, 1200);
  // Realtime note (con fallback a polling se Supabase JS non caricato)
  _initNoteRealtime();
  // Migra vecchi gruppi note al nuovo formato (una tantum)
  _migraNoteGruppi();
  // Menu mobile
  aggiornaMenuMobile();
  // Flatpickr date pickers
  if (window.flatpickr) {
    const fpOpts = {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      allowInput: false,
      onChange: () => render(),
    };
    flatpickr('#filt-dal', fpOpts);
    flatpickr('#filt-al', fpOpts);
    const fpLog = {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      allowInput: false,
      onChange: () => renderRegistro(),
    };
    flatpickr('#log-filt-dal', fpLog);
    flatpickr('#log-filt-al', fpLog);
  }
});
document.getElementById('pwd-modal').addEventListener('click', function (e) {
  if (e.target === this) {
    const c = document.getElementById('pwd-modal-content').innerHTML;
    if (
      c.includes('predefinita') ||
      c.includes('Cambia la password') ||
      c.includes('Password impostata') ||
      c.includes('Reimpostata') ||
      c.includes('Benvenuto') ||
      c.includes('scegli una nuova')
    )
      return;
    this.classList.add('hidden');
  }
});
document.getElementById('operatore-modal').addEventListener('click', function (e) {
  if (e.target === this) {
    const inp = document.getElementById('inp-operatore');
    if (inp && inp.value.trim()) confermaOperatore();
    else this.classList.add('hidden');
  }
});
document.getElementById('modal-overlay').addEventListener('click', function (e) {
  if (e.target === this) chiudiModal();
});
document.getElementById('profilo-modal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('scadenza-modal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('note-modal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('inp-testo').addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') salva();
});
// Ctrl+Invio per note colleghi, consegne, promemoria
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'nota-msg') inviaNotaCollega();
  else if (id === 'cons-messaggio') inviaConsegnaTurno();
  else if (id === 'assist-input') assistenteGenera();
});
// LOCK SCREEN: solo su PWA installata (mobile), non su browser desktop
var _isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
document.addEventListener('visibilitychange', function () {
  if (document.hidden || !_isPWA) return;
  if (_isSessionValid() && _hasBioForCurrentOp()) {
    sessionStorage.removeItem('bio_verified');
    document.getElementById('login-overlay').classList.remove('hidden');
    document.documentElement.classList.remove('authed');
    var bl = document.getElementById('biometric-login');
    if (bl) {
      bl.style.display = 'block';
      var _bb = document.getElementById('bio-login-btn');
      if (_bb) _bb.textContent = '\u{1F512} ' + getBioName();
    }
    setTimeout(function () {
      tentaBiometrico();
    }, 400);
  }
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.action === 'navigate' && e.data.page) switchPage(e.data.page);
    if (e.data && e.data.action === 'push' && e.data.data) {
      var d = e.data.data;
      toast(d.titolo + (d.corpo ? ' — ' + d.corpo : ''));
    }
  });
}
