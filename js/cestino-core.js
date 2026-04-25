/**
 * Diario Collaboratori — Casino Lugano SA
 * File: cestino.js
 */

// ================================================================
// SEZIONE 6: CESTINO (soft delete)
// Registrazioni e moduli eliminati, ripristino
// ================================================================
// CESTINO
/**
 * Diario Collaboratori — Casino Lugano SA
 * File: cestino-core.js
 * Cestino: soft delete, ripristino, DB stats
 */

let _cestinoModuli = [],
  _cestinoReg = [];
async function caricaCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  try {
    const modDel = await secGet(
      'moduli?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
    );
    const regDel = await secGet(
      'registrazioni?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
    );
    _cestinoModuli = modDel || [];
    _cestinoReg = regDel || [];
    renderCestino();
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Errore caricamento cestino</p>';
  }
}
function renderCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  const ft = (document.getElementById('cestino-filt-tipo') || {}).value || '';
  const fn = (document.getElementById('cestino-filt-nome') || {}).value || '';
  const fc = (document.getElementById('cestino-filt-chi') || {}).value || '';
  const fnl = fn.toLowerCase(),
    fcl = fc.toLowerCase();
  let filtReg = _cestinoReg;
  let filtMod = _cestinoModuli;
  if (ft === 'registrazioni') filtMod = [];
  if (ft === 'moduli') filtReg = [];
  if (fn) {
    filtReg = filtReg.filter(
      (r) => (r.nome || '').toLowerCase().includes(fnl) || (r.testo || '').toLowerCase().includes(fnl),
    );
    filtMod = filtMod.filter((m) => (m.collaboratore || '').toLowerCase().includes(fnl));
  }
  if (fc) {
    filtReg = filtReg.filter((r) => (r.eliminato_da || '').toLowerCase().includes(fcl));
    filtMod = filtMod.filter((m) => (m.eliminato_da || '').toLowerCase().includes(fcl));
  }
  if (!filtMod.length && !filtReg.length) {
    el.innerHTML =
      '<p style="color:#2c6e49;font-weight:600">' +
      (_cestinoModuli.length || _cestinoReg.length ? 'Nessun risultato con i filtri applicati' : 'Cestino vuoto') +
      '</p>';
    return;
  }
  let html = '';
  if (filtReg.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Registrazioni (' + filtReg.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtReg.forEach((r) => {
      const d = r.data ? new Date(r.data).toLocaleDateString('it-IT') : '';
      const delAt = r.eliminato_at
        ? new Date(r.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(r.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:.85rem"><div style="flex:1"><strong>' +
        escP(r.nome || '') +
        '</strong> — <span style="color:var(--muted)">' +
        escP(r.tipo || '') +
        '</span> — ' +
        d +
        '<div style="font-size:.75rem;color:var(--muted)">' +
        escP((r.testo || '').substring(0, 60)) +
        '</div><div style="font-size:.72rem;color:var(--accent)">Eliminato da ' +
        escP(r.eliminato_da || '') +
        ' il ' +
        delAt +
        '</div></div><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:#2c6e49" onclick="ripristinaCestino(\'registrazioni\',' +
        r.id +
        ')">Ripristina</button><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:var(--accent)" onclick="eliminaDefinitivo(\'registrazioni\',' +
        r.id +
        ')">Elimina</button></div>';
    });
    html += '</div>';
  }
  if (filtMod.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Moduli (' + filtMod.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtMod.forEach((m) => {
      const delAt = m.eliminato_at
        ? new Date(m.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(m.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:.85rem"><div style="flex:1"><strong>' +
        escP(m.collaboratore || '') +
        '</strong> — <span style="color:var(--muted)">' +
        escP(m.tipo || '') +
        '</span> — ' +
        escP(m.data_modulo || '') +
        '<div style="font-size:.72rem;color:var(--accent)">Eliminato da ' +
        escP(m.eliminato_da || '') +
        ' il ' +
        delAt +
        '</div></div><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:#2c6e49" onclick="ripristinaCestino(\'moduli\',' +
        m.id +
        ')">Ripristina</button><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:var(--accent)" onclick="eliminaDefinitivo(\'moduli\',' +
        m.id +
        ')">Elimina</button></div>';
    });
    html += '</div>';
  }
  html +=
    '<div style="margin-top:16px;display:flex;gap:8px"><button class="btn-salva" style="background:var(--accent);font-size:.82rem;padding:8px 16px" onclick="svuotaCestino()">Svuota cestino</button></div>';
  el.innerHTML = html;
}
async function ripristinaCestino(tabella, id) {
  if (!confirm('Ripristinare questo elemento?')) return;
  try {
    await secPatch(tabella, 'id=eq.' + id, { eliminato: false, eliminato_da: null, eliminato_at: null });
    if (tabella === 'moduli') {
      const m = _cestinoModuli.find((x) => x.id === id);
      if (m) {
        m.eliminato = false;
        m.eliminato_da = null;
        m.eliminato_at = null;
        moduliCache.push(m);
        _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
      }
    } else {
      const r = _cestinoReg.find((x) => x.id === id);
      if (r) {
        r.eliminato = false;
        r.eliminato_da = null;
        r.eliminato_at = null;
        datiCache.unshift(r);
        _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
      }
    }
    logAzione('Ripristinato da cestino', tabella + ' ID ' + id);
    renderCestino();
    aggiornaNomi();
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    aggiornaModuliLista();
    toast('Ripristinato!');
  } catch (e) {
    toast('Errore ripristino');
  }
}
async function eliminaDefinitivo(tabella, id) {
  if (!confirm('Eliminare DEFINITIVAMENTE? Non potrà essere recuperato.')) return;
  try {
    await secDel(tabella, 'id=eq.' + id);
    if (tabella === 'moduli') _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
    else _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
    logAzione('Eliminato definitivamente', tabella + ' ID ' + id);
    renderCestino();
    toast('Eliminato definitivamente');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
async function svuotaCestino() {
  const tot = _cestinoModuli.length + _cestinoReg.length;
  if (!tot) {
    toast('Cestino già vuoto');
    return;
  }
  if (!confirm('Svuotare il cestino? ' + tot + ' elementi verranno eliminati DEFINITIVAMENTE.')) return;
  try {
    for (const m of _cestinoModuli) {
      await secDel('moduli', 'id=eq.' + m.id);
    }
    for (const r of _cestinoReg) {
      await secDel('registrazioni', 'id=eq.' + r.id);
    }
    logAzione('Cestino svuotato', tot + ' elementi eliminati definitivamente');
    _cestinoModuli = [];
    _cestinoReg = [];
    renderCestino();
    toast('Cestino svuotato');
  } catch (e) {
    toast('Errore svuotamento');
  }
}
async function caricaDbStats() {
  const el = document.getElementById('db-stats-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tk = getAdminToken();
  if (!tk) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun token admin. Esci e rientra come admin.</p>';
    return;
  }
  const rpcR = await fetch(SB_URL + '/rest/v1/rpc/get_db_stats', {
    method: 'POST',
    headers: sbH(),
    body: JSON.stringify({ p_token: tk }),
  });
  if (!rpcR.ok) {
    const errTxt = await rpcR.text();
    console.error('DB stats error:', errTxt);
    if (errTxt.includes('Solo admin')) {
      el.innerHTML = '<p style="color:var(--accent)">Sessione admin scaduta. Esci e rientra come admin.</p>';
    } else {
      el.innerHTML = '<p style="color:var(--accent)">Errore: ' + (JSON.parse(errTxt).message || 'sconosciuto') + '</p>';
    }
    return;
  }
  const r = await rpcR.json();
  if (!r) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun dato ricevuto</p>';
    return;
  }
  const sizeMatch = (r.db_size || '').match(/([\d.]+)\s*(MB|GB|kB)/);
  let usedMB = 0;
  if (sizeMatch) {
    usedMB = parseFloat(sizeMatch[1]);
    if (sizeMatch[2] === 'GB') usedMB *= 1024;
    if (sizeMatch[2] === 'kB') usedMB /= 1024;
  }
  const pct = Math.min(Math.round((usedMB / 500) * 100), 100);
  const barColor = pct >= 90 ? 'var(--accent)' : pct >= 70 ? '#e67e22' : '#2c6e49';
  let h =
    '<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong>' +
    r.db_size +
    ' / 500 MB</strong><span style="color:' +
    barColor +
    ';font-weight:700">' +
    pct +
    '%</span></div>';
  h +=
    '<div style="background:var(--line);border-radius:4px;height:8px;overflow:hidden"><div style="background:' +
    barColor +
    ';height:100%;width:' +
    pct +
    '%;border-radius:4px;transition:width .5s"></div></div></div>';
  const tables = r.tables || [];
  const labelMap = {
    registrazioni: 'Registrazioni',
    costi_maison: 'Costi Maison',
    moduli: 'Moduli',
    note_colleghi: 'Note Colleghi',
    consegne_turno: 'Consegne',
    promemoria: 'Promemoria',
    spese_extra: 'Spese Extra',
    log_attivita: 'Log Attivita',
    operatori_auth: 'Operatori',
    operator_sessions: 'Sessioni',
    impostazioni: 'Impostazioni',
    maison_budget: 'Budget Maison',
    regali_maison: 'Regali',
    note_clienti: 'Note Clienti',
    rapporti_giornalieri: 'Rapporti',
    collaboratori: 'Collaboratori',
    scadenze: 'Scadenze',
    note_fissate: 'Note Fissate',
    push_subscriptions: 'Push',
    login_attempts: 'Tentativi Login',
  };
  // Calcola totale dati reali (somma dimensioni tabelle)
  const totalDataBytes = tables.reduce((s, t) => s + (t.bytes || 0), 0);
  const totalDataMB = (totalDataBytes / 1024 / 1024).toFixed(1);
  h +=
    '<p style="color:var(--muted);font-size:.85rem;margin-bottom:14px">Di cui dati reali: <strong style="color:var(--ink)">' +
    totalDataMB +
    ' MB</strong> — il resto e overhead PostgreSQL (fisso, non cresce)</p>';
  // Card grid con conteggio + dimensione
  h +=
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">';
  tables.forEach((t) => {
    h +=
      '<div style="background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">' +
      t.righe +
      '</div><div style="font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">' +
      (labelMap[t.nome] || t.nome) +
      '</div><div style="font-size:.72rem;color:var(--accent2);font-weight:600;margin-top:3px">' +
      t.dimensione +
      '</div></div>';
  });
  h += '</div>';
  h += '<p style="color:var(--muted);font-size:.78rem">Sessioni attive: ' + r.sessioni_attive + '</p>';
  el.innerHTML = h;
}
async function _healthCheck() {
  const problems = [];
  // 1. Supabase connessione (verifica tramite dati caricati, no fetch extra)
  // 2. Librerie CDN
  if (!window.jspdf && !document.querySelector('script[src*="jspdf"]'))
    problems.push('Libreria PDF (jsPDF) non caricata');
  if (!window.Chart) problems.push('Libreria grafici (Chart.js) non caricata');
  if (!window.flatpickr) problems.push('Libreria calendario (Flatpickr) non caricata');
  if (!window.XLSX) problems.push('Libreria Excel (XLSX) non caricata');
  // 3. Groq AI (solo se configurata)
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: 'Bearer ' + groqKey },
      });
      if (!r.ok) problems.push('API Groq AI non risponde (chiave scaduta?)');
    } catch (e) {
      problems.push('API Groq AI non raggiungibile');
    }
  }
  // 4. Token sessione
  const tk = getOpToken();
  if (!tk) problems.push('Nessun token sessione attivo');
  // 5. Dati caricati
  if (!datiCache.length && !maisonCache.length && !collaboratoriCache.length)
    problems.push('Nessun dato caricato (verifica connessione)');
  // Mostra avviso solo se ci sono problemi
  if (problems.length) {
    console.warn('Health check:', problems);
    toast('Attenzione: ' + problems[0]);
  }
}

// PASSWORD
