/**
 * Diario Collaboratori — Casino Lugano SA
 * File: cestino.js
 * Righe originali: 1289
 * Estratto automaticamente da index.html
 */
// SEZIONE 6: CESTINO (soft delete)
// Registrazioni e moduli eliminati, ripristino
// ================================================================
// CESTINO
let _cestinoModuli = [],
  _cestinoReg = [];
async function caricaCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  try {
    const modDel = await secGet(
      'moduli?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc'
    );
    const regDel = await secGet(
      'registrazioni?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc'
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
      (r) => (r.nome || '').toLowerCase().includes(fnl) || (r.testo || '').toLowerCase().includes(fnl)
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
async function checkPwd() {
  const nome = document.getElementById('login-nome').value.trim(),
    v = document.getElementById('pwd-input').value,
    err = document.getElementById('login-error');
  // Rate limiting client-side
  if (_loginLockUntil && Date.now() < _loginLockUntil) {
    const secs = Math.ceil((_loginLockUntil - Date.now()) / 1000);
    err.textContent = 'Troppi tentativi. Riprova tra ' + secs + 's';
    return;
  }
  const legacyH = await sha256(v);
  // Try individual operator login first
  if (nome) {
    const opH = await secureHash(v, nome);
    const res = await sbRpc('verify_login', { p_nome: nome, p_hash: opH, p_legacy_hash: legacyH });
    if (res && res.locked) {
      err.textContent = 'Troppi tentativi. Riprova tra 1 minuto';
      return;
    }
    if (res && res.valid) {
      _loginFailCount = 0;
      localStorage.setItem('operatore_corrente', nome);
      localStorage.setItem('diario_auth_ts', String(Date.now()));
      sessionStorage.setItem('bio_verified', '1');
      sessionStorage.setItem('session_active', '1');
      sessionStorage.setItem('diario_auth', '1');
      sessionStorage.removeItem('is_admin');
      sessionStorage.removeItem('admin_token');
      if (res.session_token) setOpToken(res.session_token);
      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('operatore-display').textContent = 'Operatore: ' + nome;
      var loginSettore = document.getElementById('login-settore');
      if (loginSettore && loginSettore.value) currentReparto = loginSettore.value;
      applicaTemaOperatore();
      registraPushSubscription();
      await loadAll();
      if (!datiCache.length && nome) {
        console.warn('Login: dati vuoti, rinnovo token...');
        if (await _renewToken()) await loadAll();
      }
      _initNoteRealtime();
      applicaVisibilita();
      switchPage('diario');
      _renderPostLogin();
      if (res.deve_cambiare_pwd) setTimeout(() => forzaCambioPwdOperatore(nome), 300);
      else {
        setTimeout(() => mostraNoteNonLette(), 500);
        setTimeout(() => mostraPromemoriaLogin(), 1200);
        setTimeout(() => mostraConsegnaLogin(), 1800);
        setTimeout(checkQrHash, 800);
        setTimeout(() => offriBiometrico(), 600);
      }
      return;
    }
    if (res && res.found) {
      _loginFailCount++;
      if (_loginFailCount >= 5) {
        _loginLockUntil = Date.now() + 30000;
        _loginFailCount = 0;
      }
      err.textContent = 'Password errata per ' + nome;
      document.getElementById('pwd-input').value = '';
      document.getElementById('pwd-input').focus();
      setTimeout(() => (err.textContent = ''), 2500);
      return;
    }
  }
  // Fallback: master password (admin) - salt sempre __master__
  const masterH = await secureHash(v, '__master__');
  const masterRes = await sbRpc('verify_master_pwd', { p_hash: masterH, p_legacy_hash: legacyH });
  if (masterRes && masterRes.locked) {
    err.textContent = 'Troppi tentativi. Riprova tra 1 minuto';
    return;
  }
  if (masterRes && masterRes.valid) {
    _loginFailCount = 0;
    document.getElementById('login-overlay').classList.add('hidden');
    localStorage.setItem('diario_auth_ts', String(Date.now()));
    sessionStorage.setItem('bio_verified', '1');
    sessionStorage.setItem('session_active', '1');
    sessionStorage.setItem('diario_auth', '1');
    sessionStorage.setItem('is_admin', '1');
    if (masterRes.session_token) {
      sessionStorage.setItem('admin_token', masterRes.session_token);
      setOpToken(masterRes.session_token);
    }
    var loginSettore = document.getElementById('login-settore');
    if (loginSettore && loginSettore.value) currentReparto = loginSettore.value;
    if (nome) {
      localStorage.setItem('operatore_corrente', nome);
      document.getElementById('operatore-display').textContent = 'Operatore: ' + nome;
    } else {
      localStorage.setItem('operatore_corrente', 'Admin');
      document.getElementById('operatore-display').textContent = 'Admin';
    }
    await loadAll();
    if (!datiCache.length && getOperatore()) {
      console.warn('Admin login: dati vuoti, rinnovo token...');
      if (await _renewToken()) await loadAll();
    }
    _initNoteRealtime();
    applicaTemaOperatore();
    renderOperatoriUI();
    renderCampiRapportoUI();
    document.getElementById('tab-registro').style.display = '';
    applicaVisibilita();
    registraPushSubscription();
    switchPage('diario');
    _renderPostLogin();
    setTimeout(() => mostraNoteNonLette(), 500);
    setTimeout(() => mostraPromemoriaLogin(), 1200);
    setTimeout(() => mostraConsegnaLogin(), 1800);
    setTimeout(checkQrHash, 800);
  } else {
    _loginFailCount++;
    if (_loginFailCount >= 5) {
      _loginLockUntil = Date.now() + 30000;
      _loginFailCount = 0;
    }
    err.textContent = nome ? 'Operatore non trovato o password errata' : 'Password errata';
    document.getElementById('pwd-input').value = '';
    document.getElementById('pwd-input').focus();
    setTimeout(() => (err.textContent = ''), 2500);
  }
}
function mostraForzaCambio() {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambia la password</h3><p>Password predefinita. Impostane una nuova.</p><div class="pwd-field"><label>Nuova password (min 4 car.)</label><input type="password" id="new-pwd-1"></div><div class="pwd-field"><label>Conferma</label><input type="password" id="new-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="eseguiPrimoCambio()">Imposta</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-pwd-1').focus(), 100);
}
async function eseguiPrimoCambio() {
  const p1 = document.getElementById('new-pwd-1').value,
    p2 = document.getElementById('new-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  if (p1.length < 4) {
    err.textContent = 'Troppo corta';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const nh = await sha256(p1),
    nhV2 = await secureHash(p1, '__master__'),
    nc = genCode();
  await sbRpc('setup_master_pwd', {
    p_default_hash: DEFAULT_PWD_HASH,
    p_new_hash: nh,
    p_new_recovery: nc,
    p_new_hash_v2: nhV2,
  });
  document.getElementById('pwd-modal-content').innerHTML =
    '<h3>Password impostata!</h3><div class="recovery-code-box"><div class="code">' +
    nc +
    '</div><small>Salvalo in un posto sicuro.</small></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\');chiediOperatore()">OK</button></div>';
  toast('Password impostata!');
}
function cambiaPassword() {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambia password</h3><p>Inserisci la password attuale</p><div class="pwd-field"><label>Password attuale</label><input type="password" id="old-pwd"></div><div class="pwd-field"><label>Nuova password</label><input type="password" id="new-pwd-1"></div><div class="pwd-field"><label>Conferma</label><input type="password" id="new-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiCambioPwd()">Conferma</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCambioPwd() {
  const o = document.getElementById('old-pwd').value,
    p1 = document.getElementById('new-pwd-1').value,
    p2 = document.getElementById('new-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  if (p1.length < 4) {
    err.textContent = 'Troppo corta';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const oh = await secureHash(o, '__master__'),
    ohL = await sha256(o),
    nh = await secureHash(p1, '__master__'),
    nc = genCode();
  const res = await sbRpc('change_master_pwd', {
    p_old_hash: oh,
    p_new_hash: nh,
    p_new_recovery: nc,
    p_old_legacy_hash: ohL,
    p_token: getAdminToken(),
  });
  if (!res || !res.success) {
    err.textContent = 'Password attuale errata';
    return;
  }
  document.getElementById('pwd-modal-content').innerHTML =
    '<h3>Aggiornata!</h3><div class="recovery-code-box"><div class="code">' +
    nc +
    '</div><small>Nuovo codice di recupero.</small></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>';
  toast('Password aggiornata!');
}
async function recuperoPassword() {
  const rc = await sbRpc('has_recovery_code');
  if (!rc || !rc.exists) {
    document.getElementById('login-error').textContent = 'Nessun codice di recupero';
    setTimeout(() => (document.getElementById('login-error').textContent = ''), 3000);
    return;
  }
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Recupero</h3><div class="pwd-field"><label>Codice recupero</label><input type="text" id="recovery-input" style="text-transform:uppercase;letter-spacing:.2em;text-align:center"></div><div class="pwd-field"><label>Nuova password</label><input type="password" id="new-pwd-1"></div><div class="pwd-field"><label>Conferma</label><input type="password" id="new-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRecupero()">Reimposta</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiRecupero() {
  const c = document.getElementById('recovery-input').value.toUpperCase().trim(),
    p1 = document.getElementById('new-pwd-1').value,
    p2 = document.getElementById('new-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  if (p1.length < 4) {
    err.textContent = 'Troppo corta';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const nh = await sha256(p1),
    nhV2 = await secureHash(p1, '__master__'),
    nc = genCode();
  const res = await sbRpc('recovery_master_pwd', {
    p_code: c,
    p_new_hash: nh,
    p_new_recovery: nc,
    p_new_hash_v2: nhV2,
  });
  if (!res || !res.success) {
    err.textContent = 'Codice errato';
    return;
  }
  document.getElementById('pwd-modal-content').innerHTML =
    '<h3>Reimpostata!</h3><div class="recovery-code-box"><div class="code">' +
    nc +
    '</div></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>';
  toast('Password reimpostata!');
}

// OPERATORE
function chiediOperatore() {
  const nomi = [
    ...new Set([
      ...operatoriSalvati,
      ...operatoriAuthCache.map((o) => o.nome),
      ...datiCache.map((e) => e.operatore).filter(Boolean),
    ]),
  ].sort();
  document.getElementById('operatore-modal-content').innerHTML =
    '<h3>Chi sei?</h3><p>Seleziona o inserisci il tuo nome (per tracciare chi inserisce)</p><div class="pwd-field"><label>Nome operatore</label><input type="text" id="inp-operatore" list="op-list" placeholder="Il tuo nome..."><datalist id="op-list">' +
    nomi.map((n) => '<option value="' + n + '">').join('') +
    '</datalist></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="confermaOperatore()">Conferma</button></div>';
  document.getElementById('operatore-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('inp-operatore').focus(), 100);
}
function confermaOperatore() {
  const n = document.getElementById('inp-operatore').value.trim();
  if (!n) {
    toast('Inserisci un nome');
    return;
  }
  localStorage.setItem('operatore_corrente', n);
  sessionStorage.removeItem('bio_verified');
  chiudiTuttiModali();
  document.getElementById('operatore-display').textContent = 'Operatore: ' + n;
  setTimeout(() => mostraNoteNonLette(), 500);
}
function chiudiTuttiModali() {
  ['pwd-modal', 'operatore-modal', 'modal-overlay', 'profilo-modal', 'scadenza-modal', 'note-modal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}
function cambiaOperatore() {
  chiediOperatore();
}
function forzaCambioPwdOperatore(nome) {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Benvenuto ' +
    escP(nome) +
    '!</h3><p>Per sicurezza, scegli una nuova password personale.</p><div class="pwd-field"><label>Nuova password (min 4 car.)</label><input type="password" id="op-new-pwd-1"></div><div class="pwd-field"><label>Conferma password</label><input type="password" id="op-new-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="eseguiForzaCambioPwdOp(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Imposta</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('op-new-pwd-1').focus(), 100);
}
async function eseguiForzaCambioPwdOp(nome) {
  const p1 = document.getElementById('op-new-pwd-1').value,
    p2 = document.getElementById('op-new-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  if (p1.length < 4) {
    err.textContent = 'Troppo corta (min 4)';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Le password non coincidono';
    return;
  }
  const nh = await secureHash(p1, nome);
  try {
    await sbRpc('force_change_pwd', { p_nome: nome, p_new_hash: nh, p_deve_cambiare: false });
    document.getElementById('pwd-modal-content').innerHTML =
      '<h3>Password impostata!</h3><p style="text-align:center;color:var(--muted)">Da ora accedi con la tua nuova password.</p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\');mostraNoteNonLette()">OK</button></div>';
    toast('Password personale impostata!');
  } catch (e) {
    err.textContent = 'Errore salvataggio';
  }
}
function esci() {
  const tk = getOpToken() || getAdminToken();
  if (tk) {
    sbRpc('invalidate_op_session', { p_token: tk }).catch(() => {});
    sbRpc('invalidate_admin_session', { p_token: tk }).catch(() => {});
  }
  // FIX BUG #20: cleanup polling interval e canale realtime al logout
  if (window._notePollingId) {
    clearInterval(window._notePollingId);
    window._notePollingId = null;
  }
  if (_noteChannel) {
    try {
      _noteChannel.unsubscribe();
    } catch (e) {}
    _noteChannel = null;
  }
  // Pulisci TUTTO: sessione, operatore, pagina, cache
  localStorage.removeItem('diario_auth_ts');
  localStorage.removeItem('pagina_corrente');
  localStorage.removeItem('operatore_corrente');
  sessionStorage.removeItem('is_admin');
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('op_token');
  sessionStorage.removeItem('diario_auth');
  sessionStorage.removeItem('session_active');
  sessionStorage.removeItem('bio_verified');
  sessionStorage.removeItem('note_popup_shown');
  // Svuota cache in memoria
  noteColleghiCache = [];
  datiCache = [];
  moduliCache = [];
  logCache = [];
  maisonCache = [];
  promemoriaCache = [];
  consegneCache = [];
  speseExtraCache = [];
  regaliCache = [];
  noteClientiCache = [];
  scadenzeCache = [];
  inventarioCache = [];
  location.reload();
}
// FACE ID / TOUCH ID (WebAuthn)
async function biometricAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    return false;
  }
}
function getBioName() {
  var ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) {
    var h = window.screen.height;
    return h >= 812 ? 'Face ID' : 'Touch ID';
  }
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 0) return 'Touch ID';
  if (/Mac/.test(ua)) return 'Touch ID';
  if (/Android/.test(ua)) return 'Sblocco biometrico';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Face ID / Touch ID';
}
async function offriBiometrico() {
  if (!(await biometricAvailable())) return;
  if (_hasBioForCurrentOp()) return;
  var op = getOperatore();
  if (!op) return;
  // Se l'operatore ha gia rifiutato, non chiedere piu
  if (localStorage.getItem('bio_declined_' + op)) return;
  var b = document.getElementById('pwd-modal-content');
  var bn = getBioName();
  b.innerHTML =
    '<h3>Attivare ' +
    bn +
    '?</h3><p style="color:var(--muted);font-size:.9rem">Accedi più velocemente la prossima volta senza inserire la password.</p><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="localStorage.setItem(\'bio_declined_\'+getOperatore(),\'1\');document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">No grazie</button><button class="btn-modal-ok" onclick="registraBiometrico()">Attiva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function registraBiometrico() {
  try {
    var op = getOperatore();
    if (!op) {
      toast('Nessun operatore');
      return;
    }
    // Se esiste bio di un altro operatore, chiedi conferma prima di sovrascrivere
    var existing = localStorage.getItem('webauthn_cred');
    if (existing) {
      var exOp = JSON.parse(existing).op;
      if (
        exOp !== op &&
        !confirm(getBioName() + ' è attivo per ' + exOp + ' su questo dispositivo. Sostituire con il tuo?')
      )
        return;
    }
    var userId = new TextEncoder().encode(op);
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Diario Collaboratori', id: location.hostname },
        user: { id: userId, name: op, displayName: op },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    });
    var credId = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId)));
    localStorage.setItem('webauthn_cred', JSON.stringify({ id: credId, op: op, v: 3 }));
    localStorage.removeItem('bio_declined_' + op);
    document.getElementById('pwd-modal').classList.add('hidden');
    toast(getBioName() + ' attivato!');
  } catch (e) {
    document.getElementById('pwd-modal').classList.add('hidden');
    if (e.name !== 'NotAllowedError') toast('Non disponibile su questo dispositivo');
  }
}
async function loginBiometrico() {
  try {
    var stored = JSON.parse(localStorage.getItem('webauthn_cred'));
    if (!stored) return false;
    // Rimuovi credenziali vecchie PRIMA di tentare
    if (!stored.v || stored.v < 3) {
      localStorage.removeItem('webauthn_cred');
      return false;
    }
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return true;
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      localStorage.removeItem('webauthn_cred');
    }
    return false;
  }
}
async function tentaBiometrico() {
  var ok = await loginBiometrico();
  if (ok) {
    var stored = JSON.parse(localStorage.getItem('webauthn_cred'));
    // Sicurezza: verifica che la credenziale sia dell'operatore atteso
    var expectedOp = localStorage.getItem('operatore_corrente');
    if (expectedOp && stored.op !== expectedOp) {
      toast('Credenziale non valida per questo operatore');
      return;
    }
    localStorage.setItem('diario_auth_ts', String(Date.now()));
    localStorage.setItem('operatore_corrente', stored.op);
    sessionStorage.setItem('bio_verified', '1');
    sessionStorage.setItem('session_active', '1');
    // Crea sessione server per il login biometrico
    var bioSession = await sbRpc('create_bio_session', { p_nome: stored.op });
    if (bioSession && bioSession.session_token) {
      setOpToken(bioSession.session_token);
    } else {
      var bioH = await secureHash('__bio_fallback__', stored.op);
      var bioRes = await sbRpc('verify_login', { p_nome: stored.op, p_hash: bioH, p_legacy_hash: null });
      if (bioRes && bioRes.session_token) setOpToken(bioRes.session_token);
    }
    var loginSettore = document.getElementById('login-settore');
    if (loginSettore && loginSettore.value) currentReparto = loginSettore.value;
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('operatore-display').textContent = 'Operatore: ' + stored.op;
    applicaTemaOperatore();
    registraPushSubscription();
    await loadAll();
    if (!datiCache.length && stored.op) {
      console.warn('Bio login: dati vuoti, rinnovo token...');
      if (await _renewToken()) await loadAll();
    }
    _initNoteRealtime();
    applicaVisibilita();
    switchPage('diario');
    _renderPostLogin();
    // Controlla se admin ha resettato la password → forza cambio
    var _dcCheck = await sbRpc('check_deve_cambiare', { p_nome: stored.op });
    if (_dcCheck && _dcCheck.deve_cambiare_pwd) {
      setTimeout(() => forzaCambioPwdOperatore(stored.op), 300);
    } else {
      setTimeout(() => mostraNoteNonLette(), 500);
      setTimeout(() => mostraPromemoriaLogin(), 1200);
      setTimeout(() => mostraConsegnaLogin(), 1800);
    }
  } else toast('Autenticazione fallita');
}
function disattivaBiometrico() {
  if (!_hasBioForCurrentOp()) {
    toast('Non puoi disattivare il biometrico di un altro operatore');
    return;
  }
  localStorage.removeItem('webauthn_cred');
  sessionStorage.removeItem('bio_verified');
  toast(getBioName() + ' disattivato');
  renderBiometricSettings();
}
function renderBiometricSettings() {
  var el = document.getElementById('biometric-settings');
  if (!el) return;
  var cred = localStorage.getItem('webauthn_cred');
  var curOp = getOperatore();
  var bn = getBioName();
  if (cred) {
    var credOp = JSON.parse(cred).op;
    var isMine = credOp === curOp;
    if (isMine) {
      el.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>' +
        bn +
        '</strong><br><span style="font-size:.84rem;color:var(--muted)">Attivo per: ' +
        escP(curOp) +
        '</span></div><button onclick="disattivaBiometrico()" style="padding:8px 16px;font-size:.85rem;font-family:Source Sans 3,sans-serif;font-weight:600;border:1.5px solid #c0392b;color:#c0392b;background:none;border-radius:2px;cursor:pointer">Disattiva</button></div>';
    } else {
      biometricAvailable().then(function (ok) {
        el.innerHTML = ok
          ? '<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>' +
            bn +
            '</strong><br><span style="font-size:.84rem;color:var(--muted)">Non attivo</span></div><button onclick="offriBiometrico()" style="padding:8px 16px;font-size:.85rem;font-family:Source Sans 3,sans-serif;font-weight:600;border:1.5px solid var(--accent2);color:var(--accent2);background:none;border-radius:2px;cursor:pointer">Attiva</button></div>'
          : '<span style="font-size:.84rem;color:var(--muted)">' + bn + ' non disponibile su questo dispositivo</span>';
      });
    }
  } else {
    biometricAvailable().then(function (ok) {
      el.innerHTML = ok
        ? '<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>' +
          bn +
          '</strong><br><span style="font-size:.84rem;color:var(--muted)">Non attivo</span></div><button onclick="offriBiometrico()" style="padding:8px 16px;font-size:.85rem;font-family:Source Sans 3,sans-serif;font-weight:600;border:1.5px solid var(--accent2);color:var(--accent2);background:none;border-radius:2px;cursor:pointer">Attiva</button></div>'
        : '<span style="font-size:.84rem;color:var(--muted)">' + bn + ' non disponibile su questo dispositivo</span>';
    });
  }
}
async function resetPasswordOperatore(nome) {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Resetta password</h3><p>Imposta una nuova password temporanea per <strong>' +
    escP(nome) +
    '</strong></p><div class="pwd-field"><label>Nuova password</label><input type="password" id="reset-pwd-1"></div><div class="pwd-field"><label>Conferma</label><input type="password" id="reset-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiResetPwdOp(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Resetta</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiResetPwdOp(nome) {
  const p1 = document.getElementById('reset-pwd-1').value,
    p2 = document.getElementById('reset-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  if (p1.length < 4) {
    err.textContent = 'Minimo 4 caratteri';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const nh = await secureHash(p1, nome);
  try {
    await sbRpc('force_change_pwd', { p_nome: nome, p_new_hash: nh, p_deve_cambiare: true, p_token: getAdminToken() });
    document.getElementById('pwd-modal-content').innerHTML =
      '<h3>Password resettata!</h3><p style="text-align:center">' +
      escP(nome) +
      ' dovrà cambiarla al prossimo accesso.</p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>';
    toast('Password di ' + nome + ' resettata');
  } catch (e) {
    err.textContent = 'Errore';
  }
}
function isAdmin() {
  return sessionStorage.getItem('is_admin') === '1';
}
// VISIBILITA - 'tutti' | 'admin' | 'nascosto' | {tipo:'selezionati',operatori:['Nome1']}
const VIS_ITEMS = {
  pagine: {
    rapporto: 'Rapporto',
    note_collega: 'Note Colleghi',
    statistiche: 'Statistiche',
    moduli: 'Moduli',
    assistente: 'Assistente',
    consegna: 'Consegna Turno',
    promemoria: 'Promemoria',
    maison: 'Costi Maison',
  },
  funzioni: {
    ricerca_globale: 'Ricerca globale',
    alert_cassa: 'Alert cassa',
    alert_rischio: 'Alert rischio',
    alert_compleanni: 'Compleanni maison',
    template_rapidi: 'Template rapidi',
    firma_digitale: 'Firma digitale',
    qr_code: 'QR Code su PDF',
    ai_moduli: 'AI (Genera + Migliora testo)',
  },
};
function visGet(key) {
  return visibilitaConfig[key] || 'tutti';
}
function isVis(key) {
  const v = visGet(key);
  if (v === 'nascosto') return false;
  if (v === 'admin') return isAdmin();
  if (typeof v === 'object' && v.tipo === 'selezionati') {
    if (isAdmin()) return true;
    const op = getOperatore();
    return v.operatori && v.operatori.includes(op);
  }
  return true;
}
function applicaVisibilita() {
  // Pagine
  Object.keys(VIS_ITEMS.pagine).forEach((k) => {
    const pageName = k.replace('_', '-');
    const tab = document.querySelector('.nav-tab[data-page="' + pageName + '"]');
    if (tab) tab.style.display = isVis(k) ? '' : 'none';
  });
  // Ricerca globale
  const rg = document.querySelector('.ricerca-globale-wrap');
  if (rg) rg.style.display = isVis('ricerca_globale') ? '' : 'none';
  // Alert cassa
  const ca = document.getElementById('cassa-alerts-container');
  if (ca) ca.style.display = isVis('alert_cassa') ? '' : 'none';
  // Alert rischio
  const ra = document.getElementById('rischio-alerts-container');
  if (ra) ra.style.display = isVis('alert_rischio') ? '' : 'none';
  // Template rapidi
  document.querySelectorAll('.template-rapidi-wrap').forEach((el) => {
    const par = el.parentElement;
    if (par) par.style.display = isVis('template_rapidi') ? '' : 'none';
  });
  // AI moduli
  document.querySelectorAll('.ai-gen-box,.btn-ai-wrap,.btn-ai').forEach((el) => {
    el.style.display = isVis('ai_moduli') ? '' : 'none';
  });
  // Firma digitale
  document.querySelectorAll('input[name="firma-tipo"][value="digitale"]').forEach((el) => {
    const lbl = el.closest('label');
    if (lbl) lbl.style.display = isVis('firma_digitale') ? '' : 'none';
  });
  applicaRepartoVisibilita();
}
function _visRadioHtml(k, v, opList) {
  let html = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
  const curTipo = typeof v === 'object' ? 'selezionati' : v || 'tutti';
  ['tutti', 'admin', 'selezionati', 'nascosto'].forEach((opt) => {
    const label =
      opt === 'tutti'
        ? 'Tutti'
        : opt === 'admin'
          ? 'Solo admin'
          : opt === 'selezionati'
            ? 'Operatori selezionati'
            : 'Nascosto';
    html +=
      '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="radio" name="vis-' +
      k +
      '" value="' +
      opt +
      '"' +
      (curTipo === opt ? ' checked' : '') +
      ' onchange="cambiaVisibilita(\'' +
      k +
      '\',this.value)"> ' +
      label +
      '</label>';
  });
  html += '</div>';
  // Operatori checkboxes (visibili solo se selezionati)
  const selOps = typeof v === 'object' && v.operatori ? v.operatori : [];
  html +=
    '<div id="vis-ops-' +
    k +
    '" style="display:' +
    (curTipo === 'selezionati' ? 'flex' : 'none') +
    ';flex-wrap:wrap;gap:6px 14px;margin-top:8px;padding:8px 12px;background:var(--paper2);border-radius:3px">';
  opList.forEach((nome) => {
    html +=
      '<label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer"><input type="checkbox" value="' +
      escP(nome) +
      '"' +
      (selOps.includes(nome) ? ' checked' : '') +
      ' onchange="aggiornaVisOps(\'' +
      k +
      '\')"> ' +
      escP(nome) +
      '</label>';
  });
  if (!opList.length) html += '<span style="color:var(--muted);font-size:.82rem">Nessun operatore creato</span>';
  html += '</div>';
  return html;
}
function renderVisibilitaUI() {
  const el = document.getElementById('visibilita-list');
  if (!el) return;
  const opList = operatoriAuthCache.map((o) => o.nome).sort();
  let html = '';
  html +=
    '<div style="margin-bottom:14px"><strong style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Pagine</strong></div>';
  Object.entries(VIS_ITEMS.pagine).forEach(([k, label]) => {
    html +=
      '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-weight:600;margin-bottom:6px">' +
      label +
      '</div>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  html +=
    '<div style="margin:18px 0 14px"><strong style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Funzioni</strong></div>';
  Object.entries(VIS_ITEMS.funzioni).forEach(([k, label]) => {
    html +=
      '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-weight:600;margin-bottom:6px">' +
      label +
      '</div>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  el.innerHTML = html;
}
async function cambiaVisibilita(key, val) {
  if (val === 'selezionati') {
    visibilitaConfig[key] = { tipo: 'selezionati', operatori: [] };
    const box = document.getElementById('vis-ops-' + key);
    if (box) box.style.display = 'flex';
  } else {
    if (val === 'tutti') delete visibilitaConfig[key];
    else visibilitaConfig[key] = val;
    const box = document.getElementById('vis-ops-' + key);
    if (box) box.style.display = 'none';
  }
  await setImp('visibilita', JSON.stringify(visibilitaConfig));
  applicaVisibilita();
  toast('Visibilità aggiornata');
}
async function aggiornaVisOps(key) {
  const box = document.getElementById('vis-ops-' + key);
  if (!box) return;
  const checked = [...box.querySelectorAll('input[type=checkbox]:checked')].map((cb) => cb.value);
  visibilitaConfig[key] = { tipo: 'selezionati', operatori: checked };
  await setImp('visibilita', JSON.stringify(visibilitaConfig));
  applicaVisibilita();
}
async function aggiungiOperatoreConPwd() {
  const n = document.getElementById('new-operatore-nome').value.trim(),
    p = document.getElementById('new-operatore-pwd').value,
    p2 = document.getElementById('new-operatore-pwd2').value;
  if (!n) {
    toast('Inserisci un nome');
    return;
  }
  if (p.length < 4) {
    toast('Password minimo 4 caratteri');
    return;
  }
  if (p !== p2) {
    toast('Le password non coincidono');
    return;
  }
  if (operatoriAuthCache.find((o) => o.nome.toLowerCase() === n.toLowerCase())) {
    toast('Operatore già esistente');
    return;
  }
  const h = await secureHash(p, n);
  try {
    await sbRpc('add_operator', { p_nome: n, p_hash: h, p_token: getAdminToken() });
    operatoriAuthCache.push({ nome: n, ruolo: 'operatore' });
    if (!operatoriSalvati.includes(n)) {
      operatoriSalvati.push(n);
      operatoriSalvati.sort();
      await saveOperatori();
    }
    const rep = document.getElementById('new-operatore-rep').value || 'entrambi';
    operatoriRepartoMap[n] = rep;
    await setImp('operatori_reparto', JSON.stringify(operatoriRepartoMap));
    logAzione('Operatore creato', n + ' (' + rep + ')');
    document.getElementById('new-operatore-nome').value = '';
    document.getElementById('new-operatore-pwd').value = '';
    document.getElementById('new-operatore-pwd2').value = '';
    renderOperatoriUI();
    toast('Operatore "' + n + '" creato (' + rep + ')');
  } catch (e) {
    toast('Errore creazione');
  }
}
async function cambiaRepartoOperatore(nome, rep) {
  operatoriRepartoMap[nome] = rep;
  await setImp('operatori_reparto', JSON.stringify(operatoriRepartoMap));
  renderOperatoriUI();
  toast(nome + ' → ' + rep);
}
async function rimuoviOperatore(n) {
  if (!confirm('Rimuovere operatore "' + n + '"?')) return;
  operatoriSalvati = operatoriSalvati.filter((o) => o !== n);
  await saveOperatori();
  try {
    await sbRpc('remove_operator', { p_nome: n, p_token: getAdminToken() });
    operatoriAuthCache = operatoriAuthCache.filter((o) => o.nome !== n);
  } catch (e) {}
  delete operatoriRepartoMap[n];
  await setImp('operatori_reparto', JSON.stringify(operatoriRepartoMap));
  logAzione('Operatore rimosso', n);
  renderOperatoriUI();
  toast('Rimosso');
}
async function cambiaPasswordOperatore() {
  const op = getOperatore();
  if (!op) {
    toast('Seleziona prima un operatore');
    return;
  }
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambia password operatore</h3><p>Operatore: <strong>' +
    escP(op) +
    '</strong></p><div class="pwd-field"><label>Password attuale</label><input type="password" id="op-old-pwd"></div><div class="pwd-field"><label>Nuova password (min 4)</label><input type="password" id="op-new-pwd-1"></div><div class="pwd-field"><label>Conferma</label><input type="password" id="op-new-pwd-2"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiCambioPwdOp()">Conferma</button></div><div class="pwd-modal-error" id="pwd-modal-error"></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCambioPwdOp() {
  const op = getOperatore(),
    o = document.getElementById('op-old-pwd').value,
    p1 = document.getElementById('op-new-pwd-1').value,
    p2 = document.getElementById('op-new-pwd-2').value,
    err = document.getElementById('pwd-modal-error');
  const oh = await secureHash(o, op),
    ohL = await sha256(o);
  if (p1.length < 4) {
    err.textContent = 'Troppo corta';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const nh = await secureHash(p1, op);
  const res = await sbRpc('change_op_pwd', { p_nome: op, p_old_hash: oh, p_new_hash: nh, p_old_legacy_hash: ohL });
  if (!res || !res.success) {
    err.textContent = 'Password attuale errata';
    return;
  }
  try {
    document.getElementById('pwd-modal-content').innerHTML =
      '<h3>Password aggiornata!</h3><p style="text-align:center;color:var(--muted)">La tua password è stata cambiata.</p><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">OK</button></div>';
    toast('Password operatore aggiornata!');
  } catch (e) {
    err.textContent = 'Errore salvataggio';
  }
}
function selezionaOperatore(n) {
  localStorage.setItem('operatore_corrente', n);
  sessionStorage.removeItem('bio_verified');
  chiudiTuttiModali();
  document.getElementById('operatore-display').textContent = 'Operatore: ' + n;
  renderOperatoriUI();
  toast('Operatore: ' + n);
}
function renderOperatoriUI() {
  const el = document.getElementById('operatori-list');
  if (!el) return;
  const cur = getOperatore();
  const admin = isAdmin();
  document.getElementById('op-attuale').textContent = cur || 'Nessuno';
  const tutti = admin ? [...new Set([...operatoriSalvati, ...operatoriAuthCache.map((o) => o.nome)])].sort() : [];
  el.innerHTML = tutti.length
    ? tutti
        .map((n) => {
          const hasAuth = operatoriAuthCache.find((o) => o.nome === n);
          const rep = operatoriRepartoMap[n] || 'entrambi';
          const repBadge =
            rep === 'slots'
              ? '<span class="mini-badge" style="background:#1a4a7a">Slots</span>'
              : rep === 'tavoli'
                ? '<span class="mini-badge" style="background:#8e44ad">Tavoli</span>'
                : '<span class="mini-badge" style="background:var(--accent2)">Entrambi</span>';
          const ne = n.replace(/'/g, "\\'");
          return (
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--paper2);border-radius:3px;margin-bottom:6px;border:1px solid ' +
            (n === cur ? 'var(--accent2)' : 'var(--line)') +
            ';flex-wrap:wrap"><span style="font-weight:' +
            (n === cur ? '700' : '400') +
            '">' +
            escP(n) +
            '</span>' +
            repBadge +
            (hasAuth ? '<span style="font-size:.82rem;color:#2c6e49;font-weight:600">Con password</span>' : '') +
            (admin
              ? '<select onchange="cambiaRepartoOperatore(\'' +
                ne +
                '\',this.value)" style="font-size:.75rem;padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="entrambi"' +
                (rep === 'entrambi' ? ' selected' : '') +
                '>Entrambi</option><option value="slots"' +
                (rep === 'slots' ? ' selected' : '') +
                '>Slots</option><option value="tavoli"' +
                (rep === 'tavoli' ? ' selected' : '') +
                '>Tavoli</option></select>'
              : '') +
            (admin && hasAuth
              ? '<button style="font-size:.75rem;padding:3px 8px;cursor:pointer;border:1px solid var(--accent2);color:var(--accent2);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif;font-weight:600" onclick="resetPasswordOperatore(\'' +
                ne +
                '\')">Pwd</button>'
              : '') +
            (admin
              ? '<button style="font-size:.75rem;padding:3px 8px;cursor:pointer;border:1px solid var(--accent);color:var(--accent);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif;font-weight:600" onclick="rimuoviOperatore(\'' +
                ne +
                '\')">Rimuovi</button>'
              : '') +
            '</div>'
          );
        })
        .join('')
    : '<p style="color:var(--muted);font-size:.85rem">Nessun operatore.</p>';
  // Nascondi form creazione se non admin
  const addRow = el.parentElement.querySelector('.add-tipo-row');
  if (addRow) addRow.style.display = admin ? '' : 'none';
}

// CAMPI RAPPORTO
function getCampiRapporto() {
  let list = [
    ...CAMPI_RAPPORTO_DEFAULT.filter((c) => !campiNascosti.includes(c.key)).map((c) =>
      campiLabelOverride[c.key] ? { ...c, label: campiLabelOverride[c.key] } : c
    ),
    ...campiRapportoExtra,
  ];
  if (campiOrdine.length)
    list.sort((a, b) => {
      const ia = campiOrdine.indexOf(a.key),
        ib = campiOrdine.indexOf(b.key);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  return list;
}
async function saveCampiExtra() {
  await setImp('campi_rapporto_extra', JSON.stringify(campiRapportoExtra));
}
async function aggiungiCampoRapporto() {
  const n = document.getElementById('new-campo-nome').value.trim();
  if (!n) {
    toast('Inserisci un nome');
    return;
  }
  const key = 'extra_' + n.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (getCampiRapporto().find((c) => c.label.toLowerCase() === n.toLowerCase())) {
    toast('Campo già esistente');
    return;
  }
  campiRapportoExtra.push({ key, label: n, type: 'text' });
  await saveCampiExtra();
  document.getElementById('new-campo-nome').value = '';
  renderCampiRapportoUI();
  toast('Campo aggiunto');
}
async function rimuoviCampoRapporto(key) {
  if (!confirm('Rimuovere questo campo?')) return;
  campiRapportoExtra = campiRapportoExtra.filter((c) => c.key !== key);
  await saveCampiExtra();
  renderCampiRapportoUI();
  toast('Campo rimosso');
}
async function nascondiCampoDefault(key) {
  const d = CAMPI_RAPPORTO_DEFAULT.find((x) => x.key === key);
  if (!confirm('Nascondere il campo "' + (d ? d.label : key) + '"? I dati esistenti non verranno eliminati.')) return;
  campiNascosti.push(key);
  await setImp('campi_nascosti', JSON.stringify(campiNascosti));
  renderCampiRapportoUI();
  toast('Campo nascosto');
}
async function ripristinaCampoDefault(key) {
  campiNascosti = campiNascosti.filter((k) => k !== key);
  await setImp('campi_nascosti', JSON.stringify(campiNascosti));
  renderCampiRapportoUI();
  toast('Campo ripristinato');
}
async function spostaTipo(nome, dir) {
  const tutti = getTuttiTipi().map((t) => t.nome);
  const i = tutti.indexOf(nome);
  if (i === -1) return;
  const ni = i + dir;
  if (ni < 0 || ni >= tutti.length) return;
  [tutti[i], tutti[ni]] = [tutti[ni], tutti[i]];
  tipiOrdine = tutti;
  await setImp('tipi_ordine', JSON.stringify(tipiOrdine));
  renderTipiUI();
}
async function spostaCampo(key, dir) {
  const campi = getCampiRapporto().map((c) => c.key);
  const i = campi.indexOf(key);
  if (i === -1) return;
  const ni = i + dir;
  if (ni < 0 || ni >= campi.length) return;
  [campi[i], campi[ni]] = [campi[ni], campi[i]];
  campiOrdine = campi;
  await setImp('campi_ordine', JSON.stringify(campiOrdine));
  renderCampiRapportoUI();
}
function rinominaCampo(key) {
  const campi = getCampiRapporto();
  const c = campi.find((x) => x.key === key);
  if (!c) return;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Rinomina campo</h3><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="rename-campo-val" value="' +
    escP(c.label) +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaCampo(\'' +
    key +
    '\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const inp = document.getElementById('rename-campo-val');
    inp.focus();
    inp.select();
  }, 100);
}
async function eseguiRinominaCampo(key) {
  const val = document.getElementById('rename-campo-val').value.trim();
  if (!val) {
    toast('Inserisci un nome');
    return;
  }
  const isDefault = CAMPI_RAPPORTO_DEFAULT.find((d) => d.key === key);
  if (isDefault) {
    campiLabelOverride[key] = val;
    await setImp('campi_label_override', JSON.stringify(campiLabelOverride));
  } else {
    const c = campiRapportoExtra.find((x) => x.key === key);
    if (c) {
      c.label = val;
      await saveCampiExtra();
    }
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  renderCampiRapportoUI();
  toast('Campo rinominato');
}
function rinominaTipo(nome) {
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Rinomina tipo evento</h3><div class="pwd-field"><label>Nuovo nome</label><input type="text" id="rename-tipo-val" value="' +
    escP(nome) +
    '"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiRinominaTipo(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const inp = document.getElementById('rename-tipo-val');
    inp.focus();
    inp.select();
  }, 100);
}
async function eseguiRinominaTipo(vecchioNome) {
  const nuovoNome = document.getElementById('rename-tipo-val').value.trim();
  if (!nuovoNome) {
    toast('Inserisci un nome');
    return;
  }
  if (nuovoNome === vecchioNome) {
    document.getElementById('pwd-modal').classList.add('hidden');
    return;
  }
  if (getTuttiTipi().find((t) => t.nome.toLowerCase() === nuovoNome.toLowerCase() && t.nome !== vecchioNome)) {
    toast('Nome già esistente');
    return;
  }
  // Trova il nome originale (default) se era già stato rinominato
  const origDefault = Object.entries(tipiRinominati).find(([k, v]) => v === vecchioNome);
  const nomeOriginale = origDefault ? origDefault[0] : vecchioNome;
  const isDefault = TIPI_DEFAULT.find((d) => d.nome === nomeOriginale);
  if (isDefault) {
    tipiRinominati[nomeOriginale] = nuovoNome;
    await setImp('tipi_rinominati', JSON.stringify(tipiRinominati));
    if (coloriOverride[vecchioNome]) {
      coloriOverride[nomeOriginale] = coloriOverride[vecchioNome];
      if (vecchioNome !== nomeOriginale) delete coloriOverride[vecchioNome];
      await saveColoriOverride();
    }
    const oi = tipiOrdine.indexOf(vecchioNome);
    if (oi !== -1) {
      tipiOrdine[oi] = nuovoNome;
      await setImp('tipi_ordine', JSON.stringify(tipiOrdine));
    }
    // Aggiorna registrazioni nel DB e nella cache
    try {
      await secPatch('registrazioni', 'tipo=eq.' + encodeURIComponent(vecchioNome), { tipo: nuovoNome });
    } catch (e) {}
    datiCache.forEach((e) => {
      if (e.tipo === vecchioNome) e.tipo = nuovoNome;
    });
  } else {
    const tp = tipiPersonalizzati.find((t) => t.nome === vecchioNome);
    if (tp) {
      tp.nome = nuovoNome;
      if (coloriOverride[vecchioNome]) {
        coloriOverride[nuovoNome] = coloriOverride[vecchioNome];
        delete coloriOverride[vecchioNome];
      }
      const oi = tipiOrdine.indexOf(vecchioNome);
      if (oi !== -1) tipiOrdine[oi] = nuovoNome;
      await saveTipiP();
      await saveColoriOverride();
      if (tipiOrdine.length) await setImp('tipi_ordine', JSON.stringify(tipiOrdine));
      try {
        await secPatch('registrazioni', 'tipo=eq.' + encodeURIComponent(vecchioNome), { tipo: nuovoNome });
      } catch (e) {}
      datiCache.forEach((e) => {
        if (e.tipo === vecchioNome) e.tipo = nuovoNome;
      });
    }
  }
  if (tipoSelezionato === vecchioNome) tipoSelezionato = nuovoNome;
  document.getElementById('pwd-modal').classList.add('hidden');
  renderTipiUI();
  render();
  updateStats();
  toast('Tipo rinominato');
}
function renderCampiRapportoUI() {
  const el = document.getElementById('rapporto-campi-list');
  if (!el) return;
  const campi = getCampiRapporto();
  const adm = isAdmin();
  let cHtml = campi
    .map((c, idx) => {
      const isDefault = CAMPI_RAPPORTO_DEFAULT.find((d) => d.key === c.key);
      return (
        '<div class="tipo-item"><div class="tipo-color" style="background:' +
        (c.type === 'number' ? '#3498db' : '#2ecc71') +
        '"></div><div class="tipo-item-name">' +
        escP(c.label) +
        (isDefault ? ' <span class="tipo-item-default">(predefinito)</span>' : '') +
        '</div>' +
        (adm
          ? '<div style="display:flex;gap:3px;margin-left:auto"><button class="btn-ord" onclick="spostaCampo(\'' +
            c.key +
            '\',-1)"' +
            (idx === 0 ? ' disabled' : '') +
            '>&#9650;</button><button class="btn-ord" onclick="spostaCampo(\'' +
            c.key +
            '\',1)"' +
            (idx === campi.length - 1 ? ' disabled' : '') +
            '>&#9660;</button></div><button class="btn-del-tipo" style="margin-left:6px" onclick="rinominaCampo(\'' +
            c.key +
            '\')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="' +
            (isDefault ? 'nascondiCampoDefault' : 'rimuoviCampoRapporto') +
            "('" +
            c.key +
            '\')">Rimuovi</button>'
          : '') +
        '</div>'
      );
    })
    .join('');
  if (adm && campiNascosti.length) {
    cHtml +=
      '<div style="margin-top:12px;padding:10px;background:var(--paper2);border-radius:3px"><small style="color:var(--muted);display:block;margin-bottom:6px">Campi nascosti:</small>' +
      campiNascosti
        .map((k) => {
          const d = CAMPI_RAPPORTO_DEFAULT.find((x) => x.key === k);
          return (
            '<button style="margin:2px 4px;padding:3px 10px;font-size:.78rem;cursor:pointer;border:1px dashed var(--accent2);color:var(--accent2);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif" onclick="ripristinaCampoDefault(\'' +
            k +
            '\')">+ ' +
            (d ? escP(d.label) : k) +
            '</button>'
          );
        })
        .join('') +
      '</div>';
  }
  el.innerHTML = cHtml;
  const addCampo = el.parentElement.querySelector('.add-tipo-row');
  if (addCampo) addCampo.style.display = adm ? '' : 'none';
}

// TEMA
function getTemaKey() {
  return 'tema_' + (getOperatore() || 'default');
}
function toggleTema() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem(getTemaKey(), isDark ? 'dark' : 'light');
  document.getElementById('btn-tema').innerHTML = isDark ? '&#9728;&#65039; Tema chiaro' : '&#127761; Tema scuro';
}
function applicaTemaOperatore() {
  const t = localStorage.getItem(getTemaKey()) || localStorage.getItem('tema') || 'light';
  if (t === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('btn-tema').innerHTML = '\u2600\uFE0F Tema chiaro';
  } else {
    document.body.classList.remove('dark-theme');
    document.getElementById('btn-tema').innerHTML = '\uD83C\uDF11 Tema scuro';
  }
}

// NAVIGATION
function switchPage(name) {
  flushRapportoSave();
  // Controllo visibilità: blocca accesso a pagine nascoste (dashboard/diario/impostazioni sempre accessibili)
  const _pagesAlwaysVisible = ['dashboard', 'diario', 'impostazioni'];
  const _visKey = name.replace(/-/g, '_');
  if (!_pagesAlwaysVisible.includes(name) && typeof isVis === 'function' && !isVis(_visKey)) {
    name = 'dashboard';
  }
  var _epf = document.getElementById('early-page-fix');
  if (_epf) _epf.remove();
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  const tb = document.querySelector('.nav-tab[data-page="' + name + '"]');
  if (tb) tb.classList.add('active');
  localStorage.setItem('pagina_corrente', name);
  if (typeof aggiornaMenuMobile === 'function') aggiornaMenuMobile();
  if (name === 'diario') {
    aggiornaNomi();
    _restoreFiltri();
    render();
    updateStats();
  }
  if (name === 'statistiche') {
    initStatsFlatpickr();
    renderStatistiche();
  }
  if (name === 'rapporto') {
    if (!rapportoGiornoAperto) {
      const gc = getGiornataCasino();
      const d = new Date(gc + 'T12:00:00');
      rapportoMese = d.getMonth();
      rapportoAnno = d.getFullYear();
      rapportoGiornoAperto = gc;
    }
    renderRapporto();
  }
  if (name === 'note-collega') {
    initNoteFlatpickr();
    renderNoteCollega();
  }
  if (name === 'impostazioni') {
    renderTipiUI();
    renderScadenzeSettings();
    renderOperatoriUI();
    renderCampiRapportoUI();
    const sb = document.getElementById('sicurezza-btns');
    if (sb) {
      sb.innerHTML = isAdmin()
        ? '<button class="btn-settings" onclick="cambiaPassword()">Cambia password master</button>'
        : '<button class="btn-settings" onclick="cambiaPasswordOperatore()">Cambia la mia password</button>';
    }
    renderCollaboratoriUI();
    renderBiometricSettings();
    const ai = document.getElementById('ai-section');
    if (ai) ai.style.display = isAdmin() ? '' : 'none';
    const dbSec = document.getElementById('db-stats-section');
    if (dbSec) dbSec.style.display = isAdmin() ? '' : 'none';
    const cestSec = document.getElementById('cestino-section');
    if (cestSec) cestSec.style.display = isAdmin() ? '' : 'none';
    const visSec = document.getElementById('visibilita-section');
    if (visSec) {
      visSec.style.display = isAdmin() ? '' : 'none';
      if (isAdmin()) renderVisibilitaUI();
    }
    if (isAdmin() && groqKey) {
      const gs = document.getElementById('groq-status');
      if (gs) gs.innerHTML = '<span style="color:#2c6e49">Chiave configurata</span>';
    }
  }
  if (name === 'moduli') {
    if (!document.getElementById('mod-list-results')) _modFiltInit = false;
    renderModuliList();
  }
  if (name === 'registro') renderRegistro();
  if (name === 'maison') {
    renderMaisonDashboard();
    renderMaisonBudgetUI();
    renderMaisonBudgetAlerts();
    initMaisonFlatpickr();
    renderSpeseExtra();
    initSpeseExtraFP();
    renderRegali();
  }
  if (name === 'promemoria') {
    renderPromemoria();
    initPromemoriaUI();
  }
  if (name === 'dashboard') renderDashboard();
  if (name === 'consegna') {
    initConsFlatpickr();
    renderConsegne();
    initConsegnaUI();
  }
  if (name === 'inventario') {
    renderInventario();
    initInventarioFP();
  }
}

// TIPI
async function saveTipiP() {
  await setImp('tipi_personalizzati', JSON.stringify(tipiPersonalizzati));
}
async function saveColoriOverride() {
  await setImp('colori_override', JSON.stringify(coloriOverride));
}
async function saveOperatori() {
  await setImp('operatori_lista', JSON.stringify(operatoriSalvati));
}
async function cambiaColoreTipo(nome, colore) {
  coloriOverride[nome] = colore;
  const tp = tipiPersonalizzati.find((t) => t.nome === nome);
  if (tp) tp.colore = colore;
  await saveColoriOverride();
  if (tp) await saveTipiP();
  renderTipiUI();
}
async function aggiungiTipoPersonalizzato() {
  const n = document.getElementById('new-tipo-nome').value.trim(),
    c = document.getElementById('new-tipo-colore').value;
  if (!n) {
    toast('Inserisci un nome');
    return;
  }
  if (getTuttiTipi().find((t) => t.nome.toLowerCase() === n.toLowerCase())) {
    toast('Già esistente');
    return;
  }
  tipiPersonalizzati.push({ nome: n, colore: c });
  await saveTipiP();
  logAzione('Tipo aggiunto', n);
  document.getElementById('new-tipo-nome').value = '';
  renderTipiUI();
  toast('Tipo aggiunto');
}
async function rimuoviTipo(n) {
  if (!confirm('Rimuovere "' + n + '"?')) return;
  tipiPersonalizzati = tipiPersonalizzati.filter((t) => t.nome !== n);
  delete coloriOverride[n];
  await saveTipiP();
  await saveColoriOverride();
  renderTipiUI();
  toast('Rimosso');
}
async function nascondiTipoDefault(n) {
  if (!confirm('Nascondere il tipo "' + n + '"? Le registrazioni esistenti non verranno eliminate.')) return;
  tipiNascosti.push(n);
  await setImp('tipi_nascosti', JSON.stringify(tipiNascosti));
  renderTipiUI();
  toast('Tipo "' + n + '" nascosto');
}
async function ripristinaTipoDefault(n) {
  tipiNascosti = tipiNascosti.filter((t) => t !== n);
  await setImp('tipi_nascosti', JSON.stringify(tipiNascosti));
  renderTipiUI();
  toast('Tipo "' + n + '" ripristinato');
}
function _renderPostLogin() {
  try {
    renderTipiUI();
    aggiornaNomi();
    render();
    updateStats();
    renderScadenzeBanner();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    aggiornaNoteBadge();
    aggiornaPromemoriaBadge();
    aggiornaConsegnaBadge();
    renderDashboard();
    checkCompleanniBanner();
    _avviaAutoDisconnessione();
  } catch (e) {
    console.error('Render error:', e);
  }
  // Auto-disconnessione dopo 8 ore di sessione aperta (anche con app in primo piano)
  function _avviaAutoDisconnessione() {
    if (window._autoDisconnTimer) clearInterval(window._autoDisconnTimer);
    window._autoDisconnTimer = setInterval(function () {
      var ts = parseInt(localStorage.getItem('diario_auth_ts') || '0');
      if (!ts) return;
      var ore = (Date.now() - ts) / 3600000;
      if (ore >= 8) {
        clearInterval(window._autoDisconnTimer);
        toast('Sessione scaduta dopo 8 ore. Disconnessione automatica.');
        setTimeout(function () {
          esci();
        }, 2000);
      } else if (ore >= 7.5) {
        // Warning 30 minuti prima della scadenza (mostrato una sola volta)
        if (!window._disconnWarningShown) {
          window._disconnWarningShown = true;
          toast("La sessione scadra' tra 30 minuti. Salva il tuo lavoro.");
        }
      }
    }, 60000); // check ogni 60 secondi
  }
  // Fallback: se dopo 600ms i tipi non ci sono, ri-renderizza
  setTimeout(() => {
    const ft = document.getElementById('form-tipo-tags');
    if (ft && !ft.children.length) {
      console.warn('Fallback render tipi+alerts');
      try {
        renderTipiUI();
        render();
        updateStats();
        renderCassaAlerts();
        renderRischioAlerts();
        renderAmmonimentiAlerts();
      } catch (e2) {
        console.error('Fallback error:', e2);
      }
    }
  }, 600);
}
function renderTipiUI() {
  const tutti = getTuttiTipi();
  document.getElementById('form-tipo-tags').innerHTML = tutti
    .map(
      (t) =>
        '<button class="tipo-tag' +
        (tipoSelezionato === t.nome ? ' active' : '') +
        '" data-tipo="' +
        esc(t.nome) +
        '" style="' +
        (tipoSelezionato === t.nome ? 'background:' + t.colore + ';border-color:' + t.colore : '') +
        '">' +
        esc(t.nome) +
        '</button>'
    )
    .join('');
  document
    .getElementById('form-tipo-tags')
    .querySelectorAll('.tipo-tag')
    .forEach((b) => {
      b.onclick = () => {
        tipoSelezionato = b.dataset.tipo;
        renderTipiUI();
      };
    });
  const errRow = document.getElementById('errore-extra-row');
  if (errRow) errRow.style.display = tipoSelezionato === nomeCorrente('Errore') ? 'block' : 'none';
  const malRow = document.getElementById('malattia-extra-row');
  if (malRow) {
    malRow.style.display = tipoSelezionato === nomeCorrente('Malattia') ? 'block' : 'none';
    _initMalFlatpickr();
  }
  const ndRow = document.getElementById('nd-extra-row');
  if (ndRow) {
    const showNd = tipoSelezionato === nomeCorrente('Non Disponibilità');
    ndRow.style.display = showNd ? 'block' : 'none';
    if (showNd) _initNdCal();
  }
  const fs = document.getElementById('filt-tipo');
  if (fs) {
    const cv = fs.value;
    fs.innerHTML =
      '<option value="">Tutti</option>' +
      tutti.map((t) => '<option' + (t.nome === cv ? ' selected' : '') + '>' + esc(t.nome) + '</option>').join('');
  }
  document.getElementById('modal-tipo-tags').innerHTML = tutti
    .map(
      (t) =>
        '<button class="modal-tipo-tag' +
        (modalTipoSel === t.nome ? ' selected' : '') +
        '" data-tipo="' +
        esc(t.nome) +
        '" style="' +
        (modalTipoSel === t.nome ? 'background:' + t.colore + ';border-color:' + t.colore : '') +
        '">' +
        esc(t.nome) +
        '</button>'
    )
    .join('');
  document
    .getElementById('modal-tipo-tags')
    .querySelectorAll('.modal-tipo-tag')
    .forEach((b) => {
      b.onclick = () => {
        modalTipoSel = b.dataset.tipo;
        renderTipiUI();
      };
    });
  const tl = document.getElementById('tipo-list');
  if (tl) {
    const adm = isAdmin();
    let tlHtml = tutti
      .map((t, idx) => {
        const d = t._orig ? TIPI_DEFAULT.find((x) => x.nome === t._orig) : null;
        const ne = t.nome.replace(/'/g, "\\'");
        const origNe = t._orig ? t._orig.replace(/'/g, "\\'") : ne;
        return (
          '<div class="tipo-item">' +
          (adm
            ? '<input type="color" class="tipo-color-picker" value="' +
              t.colore +
              '" onchange="cambiaColoreTipo(\'' +
              (t._orig || ne) +
              '\',this.value)">'
            : '<div class="tipo-color" style="background:' + t.colore + '"></div>') +
          '<div class="tipo-item-name">' +
          esc(t.nome) +
          (d ? ' <span class="tipo-item-default">(predefinito)</span>' : '') +
          '</div>' +
          (adm
            ? '<div style="display:flex;gap:3px;margin-left:auto"><button class="btn-ord" onclick="spostaTipo(\'' +
              ne +
              '\',-1)"' +
              (idx === 0 ? ' disabled' : '') +
              '>&#9650;</button><button class="btn-ord" onclick="spostaTipo(\'' +
              ne +
              '\',1)"' +
              (idx === tutti.length - 1 ? ' disabled' : '') +
              '>&#9660;</button></div><button class="btn-del-tipo" style="margin-left:6px" onclick="rinominaTipo(\'' +
              ne +
              '\')">Rinomina</button><button class="btn-del-tipo" style="margin-left:4px" onclick="' +
              (d ? "nascondiTipoDefault('" + origNe + "')" : "rimuoviTipo('" + ne + "')") +
              '">Rimuovi</button>'
            : '') +
          '</div>'
        );
      })
      .join('');
    if (adm && tipiNascosti.length) {
      tlHtml +=
        '<div style="margin-top:12px;padding:10px;background:var(--paper2);border-radius:3px"><small style="color:var(--muted);display:block;margin-bottom:6px">Tipi nascosti:</small>' +
        tipiNascosti
          .map(
            (n) =>
              '<button style="margin:2px 4px;padding:3px 10px;font-size:.78rem;cursor:pointer;border:1px dashed var(--accent2);color:var(--accent2);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif" onclick="ripristinaTipoDefault(\'' +
              n.replace(/'/g, "\\'") +
              '\')">+ ' +
              escP(n) +
              '</button>'
          )
          .join('') +
        '</div>';
    }
    tl.innerHTML = tlHtml;
    const addTipo = tl.parentElement.querySelector('.add-tipo-row');
    if (addTipo) addTipo.style.display = adm ? '' : 'none';
  }
  let s = document.getElementById('dyn-styles');
  if (!s) {
    s = document.createElement('style');
    s.id = 'dyn-styles';
    document.head.appendChild(s);
  }
  s.textContent = tutti.map((t) => '.badge-' + t.nome.replace(/ /g, '-') + '{background:' + t.colore + '}').join('\n');
}

// CAPITALIZZAZIONE NOMI
function capitalizzaNome(s) {
  return s.replace(/\S+/g, (w) => {
    const l = w.toLowerCase();
    if (
      [
        'di',
        'da',
        'de',
        'del',
        'della',
        'dello',
        'dei',
        'degli',
        'delle',
        'dal',
        'dalla',
        'con',
        'e',
        'in',
        'la',
        'le',
        'lo',
        'il',
        'gli',
        'von',
        'van',
        'el',
        'al',
        'ben',
      ].includes(l) &&
      s.indexOf(w) > 0
    )
      return l;
    return l.replace(/(^|['-])(\w)/g, (m, sep, ch) => sep + ch.toUpperCase());
  });
}

// TOAST & UTILS
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function escP(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// PDF PREVIEW
let _pdfPreviewBlob = null,
  _pdfPreviewName = '';
function mostraPdfPreview(doc, filename, titolo) {
  _pdfPreviewName = filename;
  const blob = doc.output('blob');
  _pdfPreviewBlob = blob;
  const url = URL.createObjectURL(blob);
  document.getElementById('pdf-preview-title').textContent = titolo || 'Anteprima PDF';
  document.getElementById('pdf-preview-iframe').src = url;
  document.getElementById('pdf-preview-modal').classList.remove('hidden');
}
function scaricaPdfPreview() {
  if (!_pdfPreviewBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(_pdfPreviewBlob);
  a.download = _pdfPreviewName || 'documento.pdf';
  a.click();
  toast('PDF scaricato!');
}
function chiudiPdfPreview() {
  document.getElementById('pdf-preview-modal').classList.add('hidden');
  const iframe = document.getElementById('pdf-preview-iframe');
  if (iframe.src) {
    URL.revokeObjectURL(iframe.src);
    iframe.src = '';
  }
}
_pdfPreviewBlob = null;

// MALATTIA DAL/AL
let _malFpInit = false;
function _initMalFlatpickr() {
  if (_malFpInit || !window.flatpickr) return;
  _malFpInit = true;
  const o = { locale: 'it', dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: false };
  flatpickr('#inp-mal-dal', o);
  flatpickr('#inp-mal-al', o);
}
function resetMalFiltri() {
  ['inp-mal-dal', 'inp-mal-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
}
// Mini-calendario Non Disponibilità — selezione giorni sparsi
let _ndSelectedDates = [];
let _ndCalMonth = new Date().getMonth();
let _ndCalYear = new Date().getFullYear();
function _initNdCal() {
  _ndSelectedDates = [];
  _ndCalMonth = new Date().getMonth();
  _ndCalYear = new Date().getFullYear();
  _renderNdCal();
}
function _renderNdCal() {
  const container = document.getElementById('nd-cal-container');
  if (!container) return;
  const mesi = [
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
  ];
  const giorni = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'];
  const primo = new Date(_ndCalYear, _ndCalMonth, 1);
  const ultimoGiorno = new Date(_ndCalYear, _ndCalMonth + 1, 0).getDate();
  let startDay = primo.getDay() - 1;
  if (startDay < 0) startDay = 6; // lunedì=0
  const oggi = new Date().toISOString().substring(0, 10);
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
  html +=
    '<button onclick="_ndCalNav(-1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:1rem">&#9664;</button>';
  html += '<strong style="font-size:.92rem">' + mesi[_ndCalMonth] + ' ' + _ndCalYear + '</strong>';
  html +=
    '<button onclick="_ndCalNav(1)" style="background:none;border:1px solid var(--line);border-radius:2px;cursor:pointer;padding:4px 10px;color:var(--ink);font-size:1rem">&#9654;</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">';
  giorni.forEach((g) => {
    html += '<div style="font-size:.72rem;font-weight:700;color:var(--muted);padding:4px 0">' + g + '</div>';
  });
  for (let i = 0; i < startDay; i++) html += '<div></div>';
  for (let d = 1; d <= ultimoGiorno; d++) {
    const ds = _ndCalYear + '-' + String(_ndCalMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isSel = _ndSelectedDates.includes(ds);
    const isToday = ds === oggi;
    let style = 'padding:6px 0;border-radius:2px;cursor:pointer;font-size:.84rem;font-weight:600;';
    if (isSel) style += 'background:var(--accent2);color:white;';
    else if (isToday) style += 'background:var(--paper2);border:1px solid var(--accent2);';
    else style += 'background:var(--paper);';
    html += '<div onclick="_ndToggleDate(\'' + ds + '\')" style="' + style + '">' + d + '</div>';
  }
  html += '</div>';
  if (_ndSelectedDates.length) {
    html +=
      '<div style="margin-top:6px"><button onclick="_ndSelectedDates=[];_renderNdCal()" style="font-size:.75rem;background:none;border:1px solid var(--line);border-radius:2px;padding:2px 8px;cursor:pointer;color:var(--muted)">Pulisci selezione</button></div>';
  }
  container.innerHTML = html;
  // Update selected display
  const selEl = document.getElementById('nd-cal-selected');
  if (selEl) {
    if (_ndSelectedDates.length) {
      const sorted = [..._ndSelectedDates].sort();
      selEl.innerHTML =
        '<strong>Selezionati:</strong> ' +
        sorted.map((ds) => new Date(ds + 'T12:00:00').toLocaleDateString('it-IT')).join(', ') +
        ' <span style="color:var(--accent2);font-weight:700">(' +
        _ndSelectedDates.length +
        ' giorn' +
        (_ndSelectedDates.length === 1 ? 'o' : 'i') +
        ')</span>';
    } else selEl.innerHTML = '';
  }
}
function _ndToggleDate(ds) {
  const idx = _ndSelectedDates.indexOf(ds);
  if (idx >= 0) _ndSelectedDates.splice(idx, 1);
  else _ndSelectedDates.push(ds);
  _renderNdCal();
}
function _ndCalNav(dir) {
  _ndCalMonth += dir;
  if (_ndCalMonth > 11) {
    _ndCalMonth = 0;
    _ndCalYear++;
  }
  if (_ndCalMonth < 0) {
    _ndCalMonth = 11;
    _ndCalYear--;
  }
  _renderNdCal();
}
function resetNdFiltri() {
  _ndSelectedDates = [];
  _renderNdCal();
}
// CORE CRUD
// NOTIFICA BANNER + SUONO
let _notifTimeout = null,
  _notifAction = null;
let _userHasInteracted = false;
document.addEventListener(
  'click',
  () => {
    _userHasInteracted = true;
  },
  { once: true }
);
document.addEventListener(
  'keydown',
  () => {
    _userHasInteracted = true;
  },
  { once: true }
);
document.addEventListener(
  'touchstart',
  () => {
    _userHasInteracted = true;
  },
  { once: true }
);
function _playNotifSound() {
  if (!_userHasInteracted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}
function mostraNotifBanner(tipo, titolo, testo, azione) {
  const icons = { nota: '&#9993;', consegna: '&#128221;', promemoria: '&#128203;', urgente: '&#10071;' };
  const b = document.getElementById('notif-banner');
  b.className = 'notif-banner ' + (tipo || 'nota');
  document.getElementById('notif-icon').innerHTML = icons[tipo] || '&#128276;';
  document.getElementById('notif-title').textContent = titolo;
  document.getElementById('notif-text').textContent = testo;
  _notifAction = azione || null;
  clearTimeout(_notifTimeout);
  b.classList.add('show');
  _playNotifSound();
  _notifTimeout = setTimeout(() => b.classList.remove('show'), 6000);
}
function chiudiNotifBanner() {
  clearTimeout(_notifTimeout);
  document.getElementById('notif-banner').classList.remove('show');
}
function notifBannerClick() {
  chiudiNotifBanner();
  if (_notifAction) _notifAction();
}

// VERIFICA NOME COLLABORATORE (anti-doppioni)
async function _verificaNome(nome) {
  if (!nome) return nome;
  const nl = nome.toLowerCase();
  // Esiste esattamente?
  if (collaboratoriCache.find((c) => c.nome.toLowerCase() === nl)) return nome;
  // Cerca simile (Levenshtein ≤ 2)
  let best = null,
    bestDist = 3;
  for (const c of collaboratoriCache) {
    const dist = _levenshtein(nl, c.nome.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = c.nome;
    }
    // Anche per singole parole (cognome)
    const words = c.nome.toLowerCase().split(/\s+/);
    const nWords = nl.split(/\s+/);
    for (const w of nWords) {
      for (const cw of words) {
        const wd = _levenshtein(w, cw);
        if (wd < bestDist && w.length >= 3) {
          bestDist = wd;
          best = c.nome;
        }
      }
    }
  }
  if (best && bestDist <= 2) {
    return new Promise((res) => {
      const b = document.getElementById('pwd-modal-content');
      b.innerHTML =
        '<h3>Nome simile trovato</h3><p style="margin-bottom:16px">Hai scritto <strong>"' +
        escP(nome) +
        "\"</strong> ma esiste gia un collaboratore simile:</p><div style=\"text-align:center;margin-bottom:20px\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='" +
        escP(best) +
        '\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:#2c6e49;padding:12px 24px;font-size:1rem">Usa "' +
        escP(best) +
        "\"</button></div><div style=\"text-align:center\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='" +
        escP(nome) +
        '\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:.88rem;box-shadow:none">No, usa "' +
        escP(nome) +
        '" cosi com\'e</button></div>';
      const resolver = document.createElement('button');
      resolver.style.display = 'none';
      resolver.dataset.verifyResolve = '1';
      resolver.onclick = function () {
        res(this.dataset.result);
        this.remove();
      };
      document.body.appendChild(resolver);
      document.getElementById('pwd-modal').classList.remove('hidden');
    });
  }
  // Non esiste e nessun simile → chiedi se aggiungere
  return new Promise((res) => {
    const b = document.getElementById('pwd-modal-content');
    b.innerHTML =
      '<h3>Collaboratore non trovato</h3><p style="margin-bottom:16px"><strong>"' +
      escP(nome) +
      '"</strong> non e nella lista collaboratori.</p><div style="text-align:center;margin-bottom:16px"><button class="btn-salva" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\');document.querySelector(\'[data-verify-resolve]\').dataset.result=\'add\';document.querySelector(\'[data-verify-resolve]\').click()" style="background:#2c6e49;padding:12px 24px;font-size:.95rem">Aggiungi "' +
      escP(nome) +
      "\" alla lista</button></div><div style=\"text-align:center\"><button class=\"btn-salva\" onclick=\"document.getElementById('pwd-modal').classList.add('hidden');document.querySelector('[data-verify-resolve]').dataset.result='use';document.querySelector('[data-verify-resolve]').click()\" style=\"background:var(--paper2);color:var(--muted);border:1px solid var(--line);padding:10px 20px;font-size:.88rem;box-shadow:none\">Usa senza aggiungere</button></div>";
    const resolver = document.createElement('button');
    resolver.style.display = 'none';
    resolver.dataset.verifyResolve = '1';
    resolver.onclick = async function () {
      if (this.dataset.result === 'add') {
        try {
          await secPost('collaboratori', { nome, attivo: true });
          collaboratoriCache.push({ nome, attivo: true });
          collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
          aggiornaNomi();
          toast(nome + ' aggiunto alla lista');
        } catch (e) {}
      }
      res(nome);
      this.remove();
    };
    document.body.appendChild(resolver);
    document.getElementById('pwd-modal').classList.remove('hidden');
  });
}

// PARSER DATA NASCITA FLESSIBILE
function _parseDataNascita(input) {
  if (!input) return '';
  input = input.trim();
  // Prova formato ISO (YYYY-MM-DD) già valido
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  // Match: gg.mm.aaaa, gg/mm/aaaa, gg-mm-aaaa, gg.mm.aa, gg/mm/aa, ecc.
  const m = input.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (!m) return '';
  const g = parseInt(m[1]),
    me = parseInt(m[2]);
  let a = parseInt(m[3]);
  if (a < 100) {
    a = a <= 30 ? 2000 + a : 1900 + a;
  } // 97→1997, 05→2005
  if (g < 1 || g > 31 || me < 1 || me > 12 || a < 1900 || a > 2030) return '';
  return a + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
}
function _initNascitaInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Rimuovi flatpickr se presente (prima di tutto)
  if (el._flatpickr) {
    el._flatpickr.destroy();
    delete el._flatpickr;
  }
  // Rimuovi altInput creato da flatpickr
  const altInput = el.nextElementSibling;
  if (altInput && altInput.classList && altInput.classList.contains('flatpickr-input')) altInput.remove();
  el.removeAttribute('readonly');
  el.style.cursor = 'text';
  el.style.display = '';
  el.placeholder = 'es: 12.01.1997';
  if (!el._nascitaInit) {
    el._nascitaInit = true;
    el.addEventListener('blur', function () {
      const parsed = _parseDataNascita(this.value);
      if (parsed) {
        this.value = new Date(parsed + 'T12:00:00').toLocaleDateString('it-IT');
        this.dataset.isoValue = parsed;
      } else if (this.value.trim()) {
        toast('Formato data non valido');
        this.value = '';
        this.dataset.isoValue = '';
      }
    });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}
function _getNascitaValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.dataset.isoValue) return el.dataset.isoValue;
  return _parseDataNascita(el.value);
}

// Conta giorni malattia da una registrazione (1 se singola, N se range)
function _contaGiorniMalattia(entry) {
  const m = (entry.testo || '').match(/\((\d+)\s*giorni/);
  return m ? parseInt(m[1]) : 1;
}
function _contaTotaleMalattie(entries, tipoMal) {
  return entries.filter((e) => e.tipo === tipoMal).reduce((s, e) => s + _contaGiorniMalattia(e), 0);
}

function _highlightField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.transition = 'border-color .2s,box-shadow .2s';
  el.style.borderColor = 'var(--accent)';
  el.style.boxShadow = '0 0 0 2px rgba(192,57,43,0.2)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, 2000);
  el.focus();
}
async function salva() {
  let nome = capitalizzaNome(document.getElementById('inp-nome').value.trim());
  const testo = document.getElementById('inp-testo').value.trim();
  if (!nome) {
    toast('Inserisci il nome');
    _highlightField('inp-nome');
    return;
  }
  if (!testo) {
    toast('Scrivi una descrizione');
    _highlightField('inp-testo');
    return;
  }
  nome = await _verificaNome(nome);
  document.getElementById('inp-nome').value = nome;
  const importo = parseFloat(document.getElementById('inp-importo').value) || 0;
  const valuta = importo ? document.getElementById('inp-valuta').value : '';
  const reparto = document.getElementById('inp-reparto').value;
  // Malattia con range Dal/Al → crea registrazione per ogni giorno
  if (tipoSelezionato === nomeCorrente('Malattia')) {
    const malDal = (document.getElementById('inp-mal-dal') || {}).value;
    const malAl = (document.getElementById('inp-mal-al') || {}).value;
    if (malDal && malAl && malDal <= malAl) {
      const dInizio = new Date(malDal + 'T12:00:00'),
        dFine = new Date(malAl + 'T12:00:00');
      const nGiorni = Math.round((dFine - dInizio) / 86400000) + 1;
      if (
        !confirm(
          nome +
            ': registrare ' +
            nGiorni +
            ' giorni di malattia dal ' +
            dInizio.toLocaleDateString('it-IT') +
            ' al ' +
            dFine.toLocaleDateString('it-IT') +
            '?'
        )
      )
        return;
      let creati = 0;
      for (let d = new Date(dInizio); d <= dFine; d.setDate(d.getDate() + 1)) {
        const dStr =
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0');
        const esiste = datiCache.find(
          (e) =>
            e.nome.toLowerCase() === nome.toLowerCase() &&
            e.tipo === nomeCorrente('Malattia') &&
            e.data.startsWith(dStr)
        );
        if (!esiste) {
          const rec = {
            id: Date.now() + creati,
            nome,
            tipo: tipoSelezionato,
            testo:
              testo + ' (dal ' + dInizio.toLocaleDateString('it-IT') + ' al ' + dFine.toLocaleDateString('it-IT') + ')',
            data: dStr + 'T08:00:00.000Z',
            operatore: getOperatore(),
            reparto_dip: currentReparto,
          };
          try {
            await secPost('registrazioni', rec);
            datiCache.unshift(rec);
            creati++;
          } catch (e) {}
        }
      }
      if (!collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
        try {
          const cr = await secPost('collaboratori', { nome, attivo: true });
          collaboratoriCache.push(cr[0]);
        } catch (e2) {}
      }
      document.getElementById('inp-testo').value = '';
      resetMalFiltri();
      logAzione('Malattia range', nome + ' — ' + creati + ' giorni');
      toast(nome + ': ' + creati + ' giorni malattia registrati');
      aggiornaNomi();
      render();
      updateStats();
      return;
    }
  }
  // Non Disponibilità con giorni selezionati dal calendario
  if (tipoSelezionato === nomeCorrente('Non Disponibilità') && _ndSelectedDates.length) {
    const sorted = [..._ndSelectedDates].sort();
    const dateLabel = sorted.map((ds) => new Date(ds + 'T12:00:00').toLocaleDateString('it-IT')).join(', ');
    const nGiorni = sorted.length;
    const descDate = ' (' + nGiorni + ' giorn' + (nGiorni === 1 ? 'o' : 'i') + ': ' + dateLabel + ')';
    const rec = {
      id: Date.now(),
      nome,
      tipo: tipoSelezionato,
      testo: testo + descDate,
      data: new Date().toISOString(),
      operatore: getOperatore(),
      reparto_dip: currentReparto,
    };
    try {
      await secPost('registrazioni', rec);
      datiCache.unshift(rec);
      if (!collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
        try {
          const cr = await secPost('collaboratori', { nome, attivo: true });
          collaboratoriCache.push(cr[0]);
        } catch (e2) {}
      }
      document.getElementById('inp-testo').value = '';
      resetNdFiltri();
      logAzione('Non disponibilità', nome + descDate);
      toast(nome + ': non disponibilità registrata (' + nGiorni + ' giorni)');
      aggiornaNomi();
      render();
      updateStats();
    } catch (e) {
      toast('Errore salvataggio');
    }
    return;
  }
  // Controllo duplicati: stesso nome + stesso tipo + oggi
  const oggi = new Date().toISOString().split('T')[0];
  const dupExact = getDatiReparto().find(
    (e) =>
      e.nome.toLowerCase() === nome.toLowerCase() &&
      e.tipo === tipoSelezionato &&
      e.testo === testo &&
      e.data.startsWith(oggi)
  );
  if (dupExact) {
    toast('Registrazione identica già presente per oggi');
    return;
  }
  const dupSimile = getDatiReparto().filter(
    (e) => e.nome.toLowerCase() === nome.toLowerCase() && e.tipo === tipoSelezionato && e.data.startsWith(oggi)
  );
  if (dupSimile.length) {
    const tipoAmm = nomeCorrente('Ammonimento Verbale');
    let msg = nome + ' ha già ' + dupSimile.length + ' registrazione/i "' + tipoSelezionato + '" oggi.';
    if (tipoSelezionato === tipoAmm && dupSimile.length >= 1) {
      const _ammSimili = dupSimile.filter((d) => _motivoSimile(d.testo, testo, nome));
      if (_ammSimili.length >= 1)
        msg += '\n\nCon 2+ ammonimenti verbali per lo stesso motivo, valuta di preparare un modulo di Allineamento.';
    }
    msg += '\n\nVuoi aggiungere comunque?';
    if (!confirm(msg)) return;
  }
  const rec = {
    id: Date.now(),
    nome,
    tipo: tipoSelezionato,
    testo,
    data: new Date().toISOString(),
    operatore: getOperatore(),
    importo,
    valuta,
    reparto,
    reparto_dip: currentReparto,
  };
  try {
    await secPost('registrazioni', rec);
    datiCache.unshift(rec);
    document.getElementById('inp-testo').value = '';
    document.getElementById('inp-importo').value = '';
    document.getElementById('inp-reparto').value = '';
    if (!collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      try {
        const cr = await secPost('collaboratori', { nome, attivo: true });
        collaboratoriCache.push(cr[0]);
        collaboratoriCache.sort((a, b) => a.nome.localeCompare(b.nome));
      } catch (e2) {}
    }
    logAzione('Nuova registrazione', nome + ' - ' + tipoSelezionato + ': ' + testo.substring(0, 60));
    toast('Registrato per ' + nome);
    aggiornaNomi();
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    // Richiesta → suggerisci promemoria di follow-up
    if (tipoSelezionato === nomeCorrente('Richiesta')) {
      _suggerisciFollowUp(nome, testo);
    }
  } catch (e) {
    toast('Errore salvataggio');
  }
}
function _suggerisciFollowUp(nome, testo) {
  const b = document.getElementById('pwd-modal-content');
  const _ne = nome.replace(/'/g, "\\'");
  const _te = escP(testo.substring(0, 80).replace(/'/g, "\\'"));
  const fra3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const fra7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const fra14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const fra30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  function _fmtD(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  }
  b.innerHTML =
    '<h3>Scadenza follow-up</h3><p style="margin-bottom:14px">Richiesta registrata per <strong>' +
    escP(nome) +
    '</strong>. Entro quando va risolta?</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px"><button class="btn-salva" style="background:var(--accent2);padding:10px" onclick="_creaFollowUp(\'' +
    _ne +
    "','" +
    _te +
    "','" +
    fra3 +
    '\')">Fra 3 giorni<br><small style="opacity:.7">' +
    _fmtD(fra3) +
    '</small></button><button class="btn-salva" style="background:var(--accent2);padding:10px" onclick="_creaFollowUp(\'' +
    _ne +
    "','" +
    _te +
    "','" +
    fra7 +
    '\')">Fra 1 settimana<br><small style="opacity:.7">' +
    _fmtD(fra7) +
    '</small></button><button class="btn-salva" style="background:var(--accent2);padding:10px" onclick="_creaFollowUp(\'' +
    _ne +
    "','" +
    _te +
    "','" +
    fra14 +
    '\')">Fra 2 settimane<br><small style="opacity:.7">' +
    _fmtD(fra14) +
    '</small></button><button class="btn-salva" style="background:var(--accent2);padding:10px" onclick="_creaFollowUp(\'' +
    _ne +
    "','" +
    _te +
    "','" +
    fra30 +
    '\')">Fra 1 mese<br><small style="opacity:.7">' +
    _fmtD(fra30) +
    '</small></button></div><div class="pwd-field"><label>Oppure data personalizzata</label><input type="text" id="followup-data" placeholder="Seleziona..." readonly style="cursor:pointer"></div><div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="_creaFollowUp(\'' +
    _ne +
    "','" +
    _te +
    '\')">Crea con data personalizzata</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Nessun promemoria</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  if (window.flatpickr)
    flatpickr('#followup-data', {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      minDate: 'today',
    });
}
async function _creaFollowUp(nome, testo, dataDirecta) {
  const data = dataDirecta || document.getElementById('followup-data').value;
  if (!data) {
    toast('Seleziona una data');
    return;
  }
  try {
    const rec = {
      titolo: 'Follow-up: ' + nome,
      descrizione: testo + '\nPromemoria: 1 giorno prima alle 08:00',
      data_scadenza: data,
      assegnato_a: getOperatore(),
      creato_da: getOperatore(),
    };
    const r = await secPost('promemoria', rec);
    promemoriaCache.push(r[0]);
    document.getElementById('pwd-modal').classList.add('hidden');
    aggiornaPromemoriaBadge();
    toast('Promemoria follow-up creato per ' + nome);
  } catch (e) {
    toast('Errore creazione promemoria');
  }
}
async function elimina(id) {
  if (!confirm('Eliminare? Sarà spostata nel cestino.')) return;
  const _e = datiCache.find((x) => x.id === id);
  const op = getOperatore();
  const now = new Date().toISOString();
  try {
    await secPatch('registrazioni', 'id=eq.' + id, { eliminato: true, eliminato_da: op, eliminato_at: now });
    if (_e) {
      _e.eliminato = true;
      _e.eliminato_da = op;
      _e.eliminato_at = now;
    }
    datiCache = datiCache.filter((e) => !e.eliminato);
    pinnedIds.delete(id);
    if (_e) logAzione('Registrazione nel cestino', _e.nome + ' - ' + _e.tipo + ' (da ' + op + ')');
    aggiornaNomi();
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    toast('Spostata nel cestino');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
async function togglePin(id) {
  try {
    if (pinnedIds.has(id)) {
      await secDel('note_fissate', 'registrazione_id=eq.' + id);
      pinnedIds.delete(id);
    } else {
      await secPost('note_fissate', { registrazione_id: id });
      pinnedIds.add(id);
    }
    render();
  } catch (e) {
    toast('Errore fissaggio nota');
  }
}

// MODIFICA REGISTRAZIONE
function modificaRegistrazione(id) {
  const e = datiCache.find((x) => x.id === id);
  if (!e) return;
  const tutti = getTuttiTipi();
  const b = document.getElementById('pwd-modal-content');
  // Estrai date dal/al dalla descrizione malattia se presenti
  const _malDalAl = (e.testo || '').match(
    /dal\s+(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})\s+al\s+(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})/
  );
  let _malDal = '',
    _malAl = '';
  if (_malDalAl) {
    const _ya = parseInt(_malDalAl[3]),
      _yb = parseInt(_malDalAl[6]);
    _malDal =
      (_ya < 100 ? 2000 + _ya : _ya) + '-' + _malDalAl[2].padStart(2, '0') + '-' + _malDalAl[1].padStart(2, '0');
    _malAl = (_yb < 100 ? 2000 + _yb : _yb) + '-' + _malDalAl[5].padStart(2, '0') + '-' + _malDalAl[4].padStart(2, '0');
  }
  const _isMalattia = e.tipo === nomeCorrente('Malattia');
  b.innerHTML =
    '<h3>Modifica registrazione</h3><div class="pwd-field"><label>Collaboratore</label><div class="ac-wrap"><input type="text" id="edit-nome" value="' +
    escP(e.nome) +
    '" placeholder="Nome collaboratore..." oninput="acFiltra(\'edit-nome\',\'ac-edit-nomi\')" onfocus="acFiltra(\'edit-nome\',\'ac-edit-nomi\')"><div class="ac-drop" id="ac-edit-nomi"></div></div></div><div class="pwd-field"><label>Tipo</label><div id="edit-tipo-tags" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">' +
    tutti
      .map(
        (t) =>
          '<button class="tipo-tag' +
          (e.tipo === t.nome ? ' active' : '') +
          '" data-tipo="' +
          esc(t.nome) +
          '" style="' +
          (e.tipo === t.nome ? 'background:' + t.colore + ';border-color:' + t.colore : '') +
          '">' +
          esc(t.nome) +
          '</button>'
      )
      .join('') +
    '</div></div><div id="edit-malattia-dates" style="display:' +
    (_isMalattia ? 'flex' : 'none') +
    ';gap:10px;margin-top:8px"><div class="pwd-field" style="flex:1"><label>Dal</label><input type="text" id="edit-mal-dal" value="' +
    (_malDal ? new Date(_malDal + 'T12:00:00').toLocaleDateString('it-IT') : '') +
    '" placeholder="GG/MM/AAAA" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div><div class="pwd-field" style="flex:1"><label>Al</label><input type="text" id="edit-mal-al" value="' +
    (_malAl ? new Date(_malAl + 'T12:00:00').toLocaleDateString('it-IT') : '') +
    '" placeholder="GG/MM/AAAA" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div></div><div class="pwd-field"><label>Descrizione</label><textarea id="edit-testo" rows="4" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem;background:var(--paper2);color:var(--ink);resize:vertical">' +
    escP(e.testo) +
    '</textarea></div>' +
    (e.tipo === nomeCorrente('Errore')
      ? '<div style="display:flex;gap:10px;margin-top:8px"><div class="pwd-field" style="flex:1"><label>Reparto</label><select id="edit-reparto" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option value="">--</option><option' +
        (e.reparto === 'Cassa' ? ' selected' : '') +
        '>Cassa</option><option' +
        (e.reparto === 'Sala' ? ' selected' : '') +
        '>Sala</option><option' +
        (e.reparto === 'Supervisione' ? ' selected' : '') +
        '>Supervisione</option><option' +
        (e.reparto === 'Bar' ? ' selected' : '') +
        '>Bar</option><option' +
        (e.reparto === 'Altro' ? ' selected' : '') +
        '>Altro</option></select></div><div class="pwd-field" style="flex:1"><label>Importo</label><input type="number" id="edit-importo" value="' +
        (e.importo || '') +
        '" step="0.01" min="0" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div><div class="pwd-field" style="flex:1"><label>Valuta</label><select id="edit-valuta" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"><option' +
        (e.valuta === 'CHF' || !e.valuta ? ' selected' : '') +
        '>CHF</option><option' +
        (e.valuta === 'EUR' ? ' selected' : '') +
        '>EUR</option></select></div></div>'
      : '') +
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaRegistrazione(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  let editTipo = e.tipo;
  document.querySelectorAll('#edit-tipo-tags .tipo-tag').forEach((btn) => {
    btn.onclick = () => {
      editTipo = btn.dataset.tipo;
      document.querySelectorAll('#edit-tipo-tags .tipo-tag').forEach((b) => {
        const t = tutti.find((x) => x.nome === b.dataset.tipo);
        b.classList.toggle('active', b.dataset.tipo === editTipo);
        b.style.background = b.dataset.tipo === editTipo ? (t ? t.colore : '') : '';
        b.style.borderColor = b.dataset.tipo === editTipo ? (t ? t.colore : '') : '';
      });
    };
  });
  window._editTipoCorrente = editTipo;
  const origHandler = document.querySelectorAll('#edit-tipo-tags .tipo-tag');
  origHandler.forEach((btn) => {
    const origClick = btn.onclick;
    btn.onclick = () => {
      origClick();
      window._editTipoCorrente = btn.dataset.tipo;
      const malDiv = document.getElementById('edit-malattia-dates');
      if (malDiv) malDiv.style.display = btn.dataset.tipo === nomeCorrente('Malattia') ? 'flex' : 'none';
    };
  });
}
async function salvaModificaRegistrazione(id) {
  const nome = document.getElementById('edit-nome').value.trim();
  let testo = document.getElementById('edit-testo').value.trim();
  const tipo = window._editTipoCorrente;
  if (!nome) {
    toast('Inserisci il nome');
    return;
  }
  if (!testo) {
    toast('Inserisci una descrizione');
    return;
  }
  // Se malattia con dal/al, aggiorna la descrizione
  if (tipo === nomeCorrente('Malattia')) {
    const dalEl = document.getElementById('edit-mal-dal'),
      alEl = document.getElementById('edit-mal-al');
    const dalVal = (dalEl ? dalEl.value : '').trim(),
      alVal = (alEl ? alEl.value : '').trim();
    if (dalVal && alVal) {
      // Parsa date: DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY, DD.MM.YY, DD/M/YY, ecc.
      function _parseMalData(s) {
        const m = s.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
        if (!m) return null;
        const g = parseInt(m[1]),
          me = parseInt(m[2]) - 1,
          a = parseInt(m[3]);
        return new Date(a < 100 ? 2000 + a : a, me, g, 12);
      }
      const d1 = _parseMalData(dalVal),
        d2 = _parseMalData(alVal);
      if (d1 && d2) {
        const nGiorni = Math.round((d2 - d1) / 86400000) + 1;
        const dalFmt = d1.toLocaleDateString('it-IT'),
          alFmt = d2.toLocaleDateString('it-IT');
        // Rimuovi vecchio dal/al dalla descrizione
        testo = testo
          .replace(
            /\s*dal\s+\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}\s+al\s+\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}\s*\(\d+ giorni[^)]*\)/gi,
            ''
          )
          .trim();
        testo = testo.replace(/\s*\(\d+ giorni[^)]*\)/gi, '').trim();
        if (nGiorni > 1) testo += ' dal ' + dalFmt + ' al ' + alFmt + ' (' + nGiorni + ' giorni)';
        else if (nGiorni === 1) testo += ' il ' + dalFmt + ' (1 giorno)';
      } else {
        toast('Formato data non valido (usa GG/MM/AA o GG.MM.AA)');
        return;
      }
    }
  }
  const op = getOperatore();
  const now = new Date();
  const modificato_da =
    op +
    ' il ' +
    now.toLocaleDateString('it-IT') +
    ' alle ' +
    now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const update = { nome, tipo, testo, modificato_da };
  const impEl = document.getElementById('edit-importo'),
    repEl = document.getElementById('edit-reparto'),
    valEl = document.getElementById('edit-valuta');
  if (impEl) update.importo = parseFloat(impEl.value) || 0;
  if (repEl) update.reparto = repEl.value;
  if (valEl) update.valuta = update.importo ? valEl.value : '';
  try {
    await secPatch('registrazioni', 'id=eq.' + id, update);
    const e = datiCache.find((x) => x.id === id);
    if (e) Object.assign(e, update);
    logAzione('Modifica registrazione', nome + ' - ' + tipo + ': ' + testo.substring(0, 60));
    document.getElementById('pwd-modal').classList.add('hidden');
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    toast('Registrazione modificata');
  } catch (e) {
    toast('Errore salvataggio');
  }
}

// MODAL TIPO
function apriModal(id, tipo) {
  modalEntryId = id;
  modalTipoSel = tipo;
  renderTipiUI();
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function chiudiModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  modalEntryId = null;
  modalTipoSel = null;
}
async function confermaCambioTipo() {
  if (!modalEntryId || !modalTipoSel) return;
  const op = getOperatore();
  const now = new Date();
  const mod =
    op +
    ' il ' +
    now.toLocaleDateString('it-IT') +
    ' alle ' +
    now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  try {
    await secPatch('registrazioni', 'id=eq.' + modalEntryId, { tipo: modalTipoSel, modificato_da: mod });
    const e = datiCache.find((e) => e.id === modalEntryId);
    if (e) {
      e.tipo = modalTipoSel;
      e.modificato_da = mod;
    }
    render();
    updateStats();
    toast('Tipo aggiornato');
  } catch (e) {
    toast('Errore cambio tipo');
  }
  chiudiModal();
}

// SCADENZE
function apriScadenza(id) {
  const b = document.getElementById('scadenza-content');
  b.innerHTML =
    '<h3>Nuova scadenza</h3><p>Imposta un promemoria per questa registrazione</p><div class="pwd-field"><label>Titolo</label><input type="text" id="scad-titolo" placeholder="es. Follow-up ammonimento..."></div><div class="pwd-field"><label>Data scadenza</label><input type="text" id="scad-data" placeholder="Seleziona data..." readonly style="cursor:pointer;min-width:200px"></div><div class="pwd-field"><label>Note (opzionale)</label><input type="text" id="scad-desc" placeholder="Dettagli..."></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'scadenza-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaScadenza(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('scadenza-modal').classList.remove('hidden');
  if (window.flatpickr)
    flatpickr('#scad-data', {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      allowInput: false,
      minDate: 'today',
    });
}
async function salvaScadenza(regId) {
  const t = document.getElementById('scad-titolo').value.trim(),
    d = document.getElementById('scad-data').value,
    desc = document.getElementById('scad-desc').value.trim();
  if (!t || !d) {
    toast('Compila titolo e data');
    return;
  }
  try {
    const r = await secPost('scadenze', { registrazione_id: regId, titolo: t, data_scadenza: d, descrizione: desc });
    scadenzeCache.push(r[0]);
    logAzione('Scadenza creata', t + ' - ' + d);
    renderScadenzeBanner();
    document.getElementById('scadenza-modal').classList.add('hidden');
    toast('Scadenza impostata');
  } catch (e) {
    toast('Errore creazione scadenza');
  }
}
async function completaScadenza(id) {
  try {
    await secPatch('scadenze', 'id=eq.' + id, { completata: true, completata_da: getOperatore() || '?' });
    const s = scadenzeCache.find((s) => s.id === id);
    if (s) {
      s.completata = true;
      s.completata_da = getOperatore() || '?';
      logAzione('Scadenza completata', s.titolo);
    }
    renderScadenzeBanner();
    renderScadenzeSettings();
    toggleScadenzeDropdown();
    toggleScadenzeDropdown();
    toast('Completata');
  } catch (e) {
    toast('Errore completamento scadenza');
  }
}
async function eliminaScadenza(id) {
  try {
    await secDel('scadenze', 'id=eq.' + id);
    scadenzeCache = scadenzeCache.filter((s) => s.id !== id);
    renderScadenzeBanner();
    renderScadenzeSettings();
    toast('Eliminata');
  } catch (e) {
    toast('Errore eliminazione scadenza');
  }
}
function renderScadenzeBanner() {
  const banner = document.getElementById('scadenze-banner'),
    dd = document.getElementById('scadenze-dropdown');
  const oggi = new Date().toISOString().split('T')[0];
  const attive = scadenzeCache.filter((s) => !s.completata);
  const scadute = attive.filter((s) => s.data_scadenza < oggi);
  const prossime = attive.filter((s) => s.data_scadenza > oggi);
  const tot = attive.length;
  if (!tot) {
    if (banner) banner.classList.add('hidden');
    if (dd) dd.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML =
    (scadute.length ? '&#9888;&#65039; ' + scadute.length + ' scadenza/e scaduta/e! ' : '') +
    (prossime.length ? prossime.length + ' in arrivo' : '');
  banner.style.background = scadute.length ? 'var(--accent)' : 'var(--accent2)';
}
function toggleScadenzeDropdown() {
  const dd = document.getElementById('scadenze-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) {
    const oggi = new Date().toISOString().split('T')[0];
    const attive = scadenzeCache.filter((s) => !s.completata);
    const fatte = scadenzeCache.filter((s) => s.completata).slice(0, 10);
    let html = attive
      .map((s) => {
        const over = s.data_scadenza <= oggi;
        return (
          '<div class="scad-item"><span class="scad-date' +
          (over ? ' overdue' : '') +
          '">' +
          new Date(s.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
          '</span><span class="scad-title"><strong>' +
          escP(s.titolo) +
          '</strong>' +
          (s.descrizione ? ' - ' + escP(s.descrizione) : '') +
          '</span><button style="color:#2c6e49;border-color:#2c6e49" onclick="completaScadenza(' +
          s.id +
          ')">Fatto</button><button style="color:var(--accent);border-color:var(--accent)" onclick="eliminaScadenza(' +
          s.id +
          ')">Elimina</button></div>'
        );
      })
      .join('');
    if (!attive.length)
      html = '<p style="color:var(--muted);text-align:center;padding:8px">Nessuna scadenza attiva</p>';
    if (fatte.length) {
      html +=
        '<div style="margin-top:12px;padding-top:10px;border-top:2px solid var(--line)"><span style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Completate</span></div>';
      html += fatte
        .map(
          (s) =>
            '<div class="scad-item" style="opacity:.55"><span class="scad-date">' +
            new Date(s.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
            '</span><span class="scad-title" style="text-decoration:line-through"><strong>' +
            escP(s.titolo) +
            '</strong>' +
            (s.descrizione ? ' - ' + escP(s.descrizione) : '') +
            '</span><span style="color:#2c6e49;font-weight:700;font-size:.78rem">' +
            (s.completata_da ? 'Fatto da ' + escP(s.completata_da) : 'Fatto') +
            '</span></div>'
        )
        .join('');
    }
    dd.innerHTML = html;
  }
}
function renderScadenzeSettings() {
  const el = document.getElementById('scadenze-settings-list');
  if (!el) return;
  if (!scadenzeCache.length) {
    el.innerHTML = '<p style="color:var(--muted)">Nessuna scadenza attiva</p>';
    return;
  }
  el.innerHTML = scadenzeCache
    .map(
      (s) =>
        '<div class="scad-item"><span class="scad-date">' +
        new Date(s.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span><span class="scad-title"><strong>' +
        escP(s.titolo) +
        '</strong>' +
        (s.descrizione ? ' - ' + escP(s.descrizione) : '') +
        '</span><button style="color:#2c6e49;border-color:#2c6e49" onclick="completaScadenza(' +
        s.id +
        ');renderScadenzeSettings()">Fatto</button><button style="color:var(--accent);border-color:var(--accent)" onclick="eliminaScadenza(' +
        s.id +
        ');renderScadenzeSettings()">Elimina</button></div>'
    )
    .join('');
}

// CASSA ALERTS SYSTEM
function _levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
  return d[m][n];
}
function matchCollaboratore(cognome) {
  cognome = cognome.trim().toLowerCase();
  if (!cognome) return null;
  // 1. Match esatto nome completo
  const exact = collaboratoriCache.find((c) => c.nome.toLowerCase() === cognome);
  if (exact) return exact.nome;
  // 2. Match cognome o nome singolo esatto
  for (const c of collaboratoriCache) {
    const words = c.nome.toLowerCase().split(/\s+/);
    if (words.some((w) => w === cognome)) return c.nome;
  }
  // 2b. Match cognome multi-parola (es. "de lima" → "De Lima Marco")
  if (cognome.includes(' ')) {
    for (const c of collaboratoriCache) {
      if (c.nome.toLowerCase().startsWith(cognome + ' ') || c.nome.toLowerCase() === cognome) return c.nome;
    }
  }
  // 3. Match prefisso (min 4 caratteri, evita falsi positivi su nomi corti come "Mai"→"Maira")
  for (const c of collaboratoriCache) {
    const words = c.nome.toLowerCase().split(/\s+/);
    if (words.some((w) => w.startsWith(cognome) && cognome.length >= 4)) return c.nome;
  }
  // 4. Match fuzzy (Levenshtein ≤ 2) per errori di battitura
  if (cognome.length >= 3) {
    let best = null,
      bestDist = 3;
    for (const c of collaboratoriCache) {
      const words = c.nome.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (w.length < 3) continue;
        const dist = _levenshtein(cognome, w);
        if (dist < bestDist) {
          bestDist = dist;
          best = c.nome;
        }
      }
    }
    if (best) {
      toast('Corretto: "' + capitalizzaNome(cognome) + '" → ' + best + ' (errore battitura)');
      return best;
    }
  }
  return null;
}
async function parseDifferenzeCassa(text, ds, turno) {
  if (!text || !text.trim()) return;
  const entries = text
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    // Separa per virgola, "e" tra due differenze, o "/"
    const parts = entry
      .split(/,|\be\b(?=\s+[A-Za-zÀ-ü])|\/(?=\s*[A-Za-zÀ-ü])/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      // 1. Formato classico: "Cognome +/-importo" o "Cognome importo"
      let m = part.match(/^([A-Za-zÀ-ü\s.'-]+?)\s*([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
      // 2. Formato con CHF: "Cognome 50 CHF" o "Cognome 50 chf"
      if (!m) m = part.match(/^([A-Za-zÀ-ü\s.'-]+?)\s*([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:chf|fr\.?|franchi)?\s*$/i);
      // 2b. Formato invertito: "-170.44 Cognome" o "+50 Cognome"
      if (!m) {
        const _inv = part.match(/^\s*([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s+([A-Za-zÀ-ü\s.'-]+?)\s*$/);
        if (_inv) m = [part, _inv[3], _inv[1], _inv[2]];
      }
      // 2c. Pulisci nome da keyword non-nome se il match classico ha parole extra
      if (m && m[1]) {
        const _cleaned = m[1]
          .replace(/\b(chiude|chiuso|con|ha|aveva|fatto|differenza|cassa|ammanco|eccedenza)\b/gi, '')
          .trim();
        if (_cleaned.length >= 2) m[1] = _cleaned;
      }
      // 3. Frase libera: cerca cognome collaboratore + importo nella stessa riga
      if (!m) {
        // Cerca importo nella riga
        const impMatch = part.match(/([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:chf|fr\.?|franchi)?/i);
        if (impMatch && parseFloat(impMatch[2].replace(',', '.')) >= 0.01) {
          // Cerca cognome collaboratore nella riga
          let _foundCassa = null;
          for (const c of collaboratoriCache) {
            const words = c.nome.toLowerCase().split(/\s+/);
            for (const w of words) {
              if (
                w.length >= 3 &&
                new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(part)
              ) {
                _foundCassa = c.nome;
                break;
              }
            }
            if (_foundCassa) break;
          }
          if (_foundCassa) {
            // Determina segno da keyword
            let _sign = impMatch[1] || null;
            if (!_sign && /\b(ammanco|mancante|mancanza|manca|negativ[oa]|meno|sotto)\b/i.test(part)) _sign = '-';
            if (!_sign && /\b(eccedenza|eccesso|positiv[oa]|più|piu|sopra|avanzo|avanza)\b/i.test(part)) _sign = '+';
            m = [part, _foundCassa, _sign, impMatch[2]];
          }
        }
      }
      if (!m) continue;
      const cognome = m[1].trim();
      const sign = m[2];
      const amount = parseFloat(m[3].replace(',', '.'));
      if (!amount || amount < 0.01) continue;
      const nomeCompleto = matchCollaboratore(cognome);
      if (!nomeCompleto) {
        toast('Differenza: "' + cognome + '" non trovato tra i collaboratori');
        continue;
      }
      const direction = sign === '+' ? 'eccedenza' : 'ammanco';
      const _rappRef = 'da rapporto ' + turno + ' del ' + new Date(ds + 'T12:00:00').toLocaleDateString('it-IT');
      // FIX: check per nome + turno/data rapporto (non per importo esatto). Se cambi importo → aggiorna, non duplica.
      const esiste = datiCache.find(
        (e) =>
          e.nome.toLowerCase() === nomeCompleto.toLowerCase() &&
          e.tipo === nomeCorrente('Errore') &&
          e.reparto === 'Cassa' &&
          (e.testo || '').includes(_rappRef)
      );
      const newTesto = 'Differenza cassa: ' + direction + ' di ' + amount.toFixed(2) + ' CHF (' + _rappRef + ')';
      if (esiste) {
        // Aggiorna importo e testo se cambiati
        if (Math.abs(parseFloat(esiste.importo) || 0) !== amount || esiste.testo !== newTesto) {
          try {
            await secPatch('registrazioni', 'id=eq.' + esiste.id, { importo: amount, testo: newTesto });
            esiste.importo = amount;
            esiste.testo = newTesto;
          } catch (e) {}
        }
        continue;
      }
      const rec = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        nome: nomeCompleto,
        tipo: nomeCorrente('Errore'),
        testo: newTesto,
        data: ds + 'T' + new Date().toTimeString().slice(0, 8) + '.000Z',
        operatore: getOperatore(),
        importo: amount,
        valuta: 'CHF',
        reparto: 'Cassa',
      };
      try {
        await secPost('registrazioni', rec);
        datiCache.unshift(rec);
        logAzione('Auto-registrazione differenza cassa', nomeCompleto + ' ' + amount.toFixed(2) + ' CHF');
      } catch (e) {}
    }
  }
  render();
  updateStats();
}
function checkCassaAlerts() {
  const alerts = [];
  const tipoErr = nomeCorrente('Errore');
  const errori = getDatiReparto().filter(
    (e) =>
      e.tipo === tipoErr &&
      (e.reparto === 'Cassa' || (e.testo || '').toLowerCase().includes('differenza cassa')) &&
      (parseFloat(e.importo) || 0) > 0
  );
  const byNome = {};
  errori.forEach((e) => {
    const k = e.nome.toLowerCase();
    if (!byNome[k]) byNome[k] = { nome: e.nome, errs: [] };
    byNome[k].errs.push(e);
  });
  Object.values(byNome).forEach(({ nome, errs }) => {
    const lastAllin = getModuliReparto()
      .filter((m) => m.tipo === 'allineamento' && m.collaboratore.toLowerCase() === nome.toLowerCase())
      .sort((a, b) => (b.created_at || b.data_modulo || '').localeCompare(a.created_at || a.data_modulo || ''))[0];
    const lastAllinDate = lastAllin ? lastAllin.created_at || lastAllin.data_modulo || '' : '';
    const lastRdi = getModuliReparto()
      .filter((m) => m.tipo === 'rdi' && m.collaboratore.toLowerCase() === nome.toLowerCase())
      .sort((a, b) => (b.created_at || b.data_modulo || '').localeCompare(a.created_at || a.data_modulo || ''))[0];
    const lastRdiDate = lastRdi ? lastRdi.created_at || lastRdi.data_modulo || '' : '';
    // Solo errori ≥90 contano per il percorso disciplinare
    const errsSinceAllin = (lastAllinDate ? errs.filter((e) => (e.data || '') > lastAllinDate) : errs).filter(
      (e) => (parseFloat(e.importo) || 0) >= 90
    );
    const errsSinceRdi = (lastRdiDate ? errs.filter((e) => (e.data || '') > lastRdiDate) : errs).filter(
      (e) => (parseFloat(e.importo) || 0) >= 90
    );
    const cumTotal = errsSinceRdi.reduce((s, e) => s + (parseFloat(e.importo) || 0), 0);
    // Se cumulativo ≥500 → solo RDI
    if (cumTotal >= 500) alerts.push({ type: 'rdi', nome, importo: cumTotal, count: errsSinceRdi.length });
    // Altrimenti: un alert per ogni errore ≥90
    else {
      errsSinceAllin.forEach((e) => {
        const imp = parseFloat(e.importo) || 0;
        if (imp >= 90) {
          const dt = e.data ? new Date(e.data).toLocaleDateString('it-IT') : '';
          alerts.push({ type: 'allineamento', nome, importo: imp, count: 1, dataErr: dt });
        }
      });
    }
  });
  return alerts;
}
function renderCassaAlerts() {
  const container = document.getElementById('cassa-alerts-container');
  if (!container) return;
  const alerts = checkCassaAlerts();
  if (!alerts.length) {
    container.innerHTML = '';
    return;
  }
  const allinAlerts = alerts.filter((a) => a.type === 'allineamento');
  const rdiAlerts = alerts.filter((a) => a.type === 'rdi');
  let html = '';
  if (allinAlerts.length) {
    html +=
      '<div class="cassa-alert-banner allin" onclick="toggleCassaDD(\'allin\')">&#9888;&#65039; ' +
      allinAlerts.length +
      ' collaboratore/i con differenza cassa &#8805; CHF 90 &#8212; Preparare allineamento <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="cassa-alerts-dropdown hidden" id="cassa-allin-dd">';
    allinAlerts.forEach((a) => {
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">Differenza: ' +
        fmtCHF(a.importo) +
        ' CHF' +
        (a.dataErr ? ' del ' + a.dataErr : '') +
        '</span><button class="alert-action" onclick="apriModuloVeloce(\'allineamento\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea Allineamento</button></div>';
    });
    html += '</div>';
  }
  if (rdiAlerts.length) {
    html +=
      '<div class="cassa-alert-banner rdi" onclick="toggleCassaDD(\'rdi\')">&#9888;&#65039; ' +
      rdiAlerts.length +
      ' collaboratore/i con differenze cumulative &#8805; CHF 500 &#8212; Fare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="cassa-alerts-dropdown hidden" id="cassa-rdi-dd">';
    rdiAlerts.forEach((a) => {
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">Totale cumulativo: ' +
        fmtCHF(a.importo) +
        ' CHF (' +
        a.count +
        ' errori dal ultimo RDI)</span><button class="alert-action" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button></div>';
    });
    html += '</div>';
  }
  container.innerHTML = html;
}
function toggleCassaDD(type) {
  const dd = document.getElementById('cassa-' + type + '-dd');
  if (dd) dd.classList.toggle('hidden');
}
function apriModuloVeloce(tipo, nome) {
  switchPage('moduli');
  setTimeout(() => {
    apriModulo(tipo);
    setTimeout(() => {
      const ci = document.getElementById('mod-collaboratore');
      if (ci) ci.value = nome;
    }, 100);
  }, 200);
}

// KEYWORDS MOTIVO: estrae parole significative per confronto motivi
const _STOP_WORDS = new Set([
  'il',
  'lo',
  'la',
  'le',
  'li',
  'gli',
  'i',
  'un',
  'uno',
  'una',
  'di',
  'da',
  'del',
  'della',
  'dello',
  'dei',
  'degli',
  'delle',
  'dal',
  'dalla',
  'con',
  'e',
  'in',
  'per',
  'a',
  'al',
  'alla',
  'allo',
  'che',
  'non',
  'si',
  'ha',
  'è',
  'sono',
  'stato',
  'stata',
  'stati',
  'nel',
  'nella',
  'sul',
  'sulla',
  'come',
  'questo',
  'questa',
  'durante',
  'dopo',
  'prima',
  'tra',
  'fra',
  'essere',
  'avere',
  'suo',
  'sua',
  'suoi',
  'sue',
  'ogni',
  'anche',
  'più',
  'già',
  'senza',
  'presso',
  'fatto',
  'data',
  'turno',
  'servizio',
  'collaboratore',
  'collaboratrice',
]);
function _estraiKeywords(testo) {
  if (!testo) return [];
  return testo
    .toLowerCase()
    .replace(/[^a-zàèéìòù\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !_STOP_WORDS.has(w));
}
// Categorie semantiche: parole diverse ma stesso ambito disciplinare
const _SINONIMI_MOTIVO = {
  ritardo: ['ritardo', 'ritardi', 'tardi', 'puntualità', 'orario', 'orari', 'timbratura', 'timbrare'],
  uniforme: [
    'uniforme',
    'divisa',
    'camicia',
    'abbigliamento',
    'vestito',
    'scarpe',
    'cravatta',
    'badge',
    'targhetta',
    'decoro',
  ],
  cassa: ['cassa', 'conteggio', 'ammanco', 'eccedenza', 'differenza', 'discrepanza', 'mancante', 'mancanza'],
  assenza: ['assenza', 'assente', 'malattia', 'certificato', 'giustificativo'],
  comportamento: [
    'comportamento',
    'condotta',
    'atteggiamento',
    'maleducazione',
    'scortese',
    'scortesia',
    'litigio',
    'insulto',
    'aggressivo',
  ],
  procedura: ['procedura', 'protocollo', 'regolamento', 'normativa', 'istruzione'],
  pulizia: ['pulizia', 'mani', 'igiene', 'sfregamento', 'palmi'],
  identificazione: ['identificazione', 'documento', 'identità', 'lrd', 'verifica', 'kyc'],
  cellulare: ['cellulare', 'telefono', 'smartphone', 'telefonate'],
};
function _normalizzaKeywords(keywords) {
  return keywords.map((w) => {
    for (const [cat, sinonimi] of Object.entries(_SINONIMI_MOTIVO)) {
      if (sinonimi.some((s) => w.includes(s) || s.includes(w))) return '__' + cat;
    }
    return w;
  });
}
function _motivoSimile(t1, t2, nomeCollab) {
  let k1 = _estraiKeywords(t1),
    k2 = _estraiKeywords(t2);
  // Rimuovi parole del nome collaboratore dal confronto
  if (nomeCollab) {
    const nk = new Set(
      nomeCollab
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    k1 = k1.filter((w) => !nk.has(w));
    k2 = k2.filter((w) => !nk.has(w));
  }
  // Normalizza sinonimi (divisa→__uniforme, ritardo→__ritardo, ecc.)
  k1 = _normalizzaKeywords(k1);
  k2 = _normalizzaKeywords(k2);
  if (!k1.length || !k2.length) return false;
  const set2 = new Set(k2);
  let comuni = 0;
  k1.forEach((w) => {
    if (set2.has(w)) comuni++;
  });
  return comuni >= 2 || (comuni >= 1 && Math.min(k1.length, k2.length) <= 3);
}

// ALERT COLLABORATORE A RISCHIO (allineamenti → RDI)
function checkRischioAlerts() {
  const alerts = [];
  const nomiSet = new Set(
    getModuliReparto()
      .filter((m) => m.tipo === 'allineamento')
      .map((m) => m.collaboratore.toLowerCase())
  );
  nomiSet.forEach((nomeLc) => {
    const allins = getModuliReparto()
      .filter((m) => m.tipo === 'allineamento' && m.collaboratore.toLowerCase() === nomeLc)
      .sort((a, b) => (a.created_at || a.data_modulo || '').localeCompare(b.created_at || b.data_modulo || ''));
    if (allins.length < 2) return;
    const nome = allins[0].collaboratore;
    const lastAllin = allins[allins.length - 1];
    const lastDate = lastAllin.created_at || lastAllin.data_modulo || '';
    const hasRdi = getModuliReparto().some(
      (m) =>
        m.tipo === 'rdi' && m.collaboratore.toLowerCase() === nomeLc && (m.created_at || m.data_modulo || '') > lastDate
    );
    if (hasRdi) return;
    // 1) Recidiva: 3+ allineamenti stesso motivo → RDI obbligatorio
    const gruppi = [];
    allins.forEach((a) => {
      const nc = a.non_conformita || '';
      let trovato = false;
      for (const g of gruppi) {
        if (_motivoSimile(nc, g.motivo, nome)) {
          g.items.push(a);
          trovato = true;
          break;
        }
      }
      if (!trovato) gruppi.push({ motivo: nc, items: [a] });
    });
    const recidiva = gruppi.find((g) => g.items.length >= 3);
    if (recidiva) {
      const motBrv = _estraiKeywords(recidiva.motivo).slice(0, 4).join(', ');
      alerts.push({
        nome,
        count: recidiva.items.length,
        lastDate: lastAllin.data_modulo || lastDate,
        motivo: motBrv || 'stesso motivo',
        tipo: 'recidiva',
      });
      return;
    }
    // 2) Accumulo: 3+ allineamenti totali (motivi diversi) → segnalazione rischio
    if (allins.length >= 3) {
      alerts.push({
        nome,
        count: allins.length,
        lastDate: lastAllin.data_modulo || lastDate,
        motivo: '',
        tipo: 'accumulo',
      });
    }
  });
  return alerts;
}
function renderRischioAlerts() {
  const container = document.getElementById('rischio-alerts-container');
  if (!container) return;
  var oldRischio = document.getElementById('rischio-alerts-block');
  if (oldRischio) oldRischio.remove();
  const alerts = checkRischioAlerts();
  if (!alerts.length) return;
  const recidive = alerts.filter((a) => a.tipo === 'recidiva'),
    accumuli = alerts.filter((a) => a.tipo === 'accumulo');
  let html = '<div id="rischio-alerts-block">';
  if (recidive.length) {
    html +=
      '<div class="rischio-alert-banner" style="background:#8e44ad" onclick="toggleRischioDD()">&#9888;&#65039; ' +
      recidive.length +
      ' collaboratore/i con 3+ allineamenti stesso motivo — Preparare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="rischio-alerts-dropdown hidden" id="rischio-dd">';
    recidive.forEach((a) => {
      const dt = a.lastDate ? new Date(a.lastDate + 'T12:00:00').toLocaleDateString('it-IT') : '';
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">' +
        a.count +
        ' allineamenti per: ' +
        escP(a.motivo) +
        ' (ultimo: ' +
        dt +
        '). Recidiva — preparare RDI.</span><button class="alert-action" style="background:#8e44ad" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button></div>';
    });
    html += '</div>';
  }
  if (accumuli.length) {
    html +=
      '<div class="rischio-alert-banner" style="background:#e67e22;margin-top:6px" onclick="toggleAccDD()">&#9888;&#65039; ' +
      accumuli.length +
      ' collaboratore/i con 3+ allineamenti totali — Valutare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="rischio-alerts-dropdown hidden" id="acc-dd">';
    accumuli.forEach((a) => {
      const dt = a.lastDate ? new Date(a.lastDate + 'T12:00:00').toLocaleDateString('it-IT') : '';
      const _ignKey = '_alert_ign_' + a.nome.toLowerCase().replace(/\s/g, '_') + '_acc';
      if (localStorage.getItem(_ignKey)) return;
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">' +
        a.count +
        ' allineamenti totali (ultimo: ' +
        dt +
        '). Valutare provvedimento.</span><button class="alert-action" style="background:#e67e22" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button><button class="alert-action" style="background:var(--muted);margin-left:4px" onclick="ignoraAlertSuggerimento(\'' +
        escP(a.nome).replace(/'/g, "\\'") +
        "','acc')\">Ignora</button></div>";
    });
    html += '</div>';
  }
  html += '</div>';
  container.insertAdjacentHTML('beforeend', html);
}
function ignoraAlertSuggerimento(nome, tipo) {
  if (!confirm('Ignorare questo suggerimento per ' + nome + '?\nVerrà registrato nel log.')) return;
  const _ignKey = '_alert_ign_' + nome.toLowerCase().replace(/\s/g, '_') + '_' + tipo;
  localStorage.setItem(_ignKey, '1');
  logAzione('Alert ignorato', nome + ' — suggerimento ' + tipo + ' ignorato da ' + getOperatore());
  renderRischioAlerts();
  renderAmmonimentiAlerts();
  toast('Suggerimento ignorato per ' + nome);
}
function toggleAccDD() {
  const dd = document.getElementById('acc-dd');
  if (dd) dd.classList.toggle('hidden');
}
function toggleRischioDD() {
  const dd = document.getElementById('rischio-dd');
  if (dd) dd.classList.toggle('hidden');
}

// ALERT AMMONIMENTI VERBALI RECIDIVI (2+ stesso motivo → preparare allineamento)
function checkAmmonimentiAlerts() {
  const tipoAmm = nomeCorrente('Ammonimento Verbale');
  const alerts = [];
  // Raggruppa ammonimenti per collaboratore
  const byNome = {};
  getDatiReparto()
    .filter((e) => e.tipo === tipoAmm)
    .forEach((e) => {
      const k = e.nome.toLowerCase();
      if (!byNome[k]) byNome[k] = { nome: e.nome, entries: [] };
      byNome[k].entries.push(e);
    });
  Object.values(byNome).forEach((a) => {
    if (a.entries.length < 2) return;
    // Raggruppa per motivo simile
    const gruppi = [];
    a.entries.forEach((e) => {
      let trovato = false;
      for (const g of gruppi) {
        if (_motivoSimile(e.testo, g.motivo, a.nome)) {
          g.items.push(e);
          trovato = true;
          break;
        }
      }
      if (!trovato) gruppi.push({ motivo: e.testo, items: [e] });
    });
    // Alert solo per gruppi con 2+ ammonimenti stesso motivo
    gruppi
      .filter((g) => g.items.length >= 2)
      .forEach((g) => {
        const last = g.items.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
        // Controlla se c'è già un allineamento dopo l'ultimo ammonimento di questo gruppo
        const hasAllin = getModuliReparto().some(
          (m) =>
            m.tipo === 'allineamento' &&
            m.collaboratore.toLowerCase() === a.nome.toLowerCase() &&
            (m.created_at || m.data_modulo || '') > last.data
        );
        if (!hasAllin) {
          const motBrv = _estraiKeywords(g.motivo).slice(0, 4).join(', ');
          alerts.push({ nome: a.nome, count: g.items.length, last: last.data, motivo: motBrv || 'stesso motivo' });
        }
      });
  });
  return alerts;
}
function renderAmmonimentiAlerts() {
  var old = document.getElementById('amm-alerts-block');
  if (old) old.remove();
  const container = document.getElementById('rischio-alerts-container');
  if (!container) return;
  const ammAlerts = checkAmmonimentiAlerts();
  if (!ammAlerts.length) return;
  let html = '<div id="amm-alerts-block">';
  html +=
    '<div class="cassa-alert-banner" style="background:#e67e22;margin-bottom:8px;cursor:pointer" onclick="toggleAmmDD()">&#9888; ' +
    ammAlerts.length +
    ' collaboratore/i con 2+ ammonimenti stesso motivo — Preparare allineamento <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
  html += '<div class="cassa-alerts-dropdown hidden" id="amm-dd">';
  ammAlerts.forEach((a) => {
    const dt = a.last ? new Date(a.last).toLocaleDateString('it-IT') : '';
    html +=
      '<div class="cassa-alert-item"><span class="alert-name">' +
      escP(a.nome) +
      '</span><span class="alert-detail">' +
      a.count +
      ' ammonimenti per: ' +
      escP(a.motivo) +
      ' (ultimo: ' +
      dt +
      ')</span><button class="alert-action" style="background:#e67e22" onclick="apriModuloVeloce(\'allineamento\',\'' +
      a.nome.replace(/'/g, "\\'") +
      '\')">Crea Allineamento</button></div>';
  });
  html += '</div></div>';
  container.insertAdjacentHTML('beforeend', html);
}
function toggleAmmDD() {
  const dd = document.getElementById('amm-dd');
  if (dd) dd.classList.toggle('hidden');
}

// TEMPLATE RAPIDI
const TEMPLATES_RAPIDI = {
  cassa_errore: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, durante il turno di servizio, è stata rilevata una differenza di cassa a carico del collaboratore. L'importo della differenza ammonta a CHF ___. Tale discrepanza è stata accertata a seguito del conteggio di fine turno.",
    obiettivo:
      'Il collaboratore si impegna a prestare maggiore attenzione durante le operazioni di cassa, verificando ogni transazione e controllando il conteggio prima della chiusura del turno.',
    scadenza: 'A partire da subito',
  },
  ritardo: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, il collaboratore si è presentato al posto di lavoro con un ritardo di ___ minuti rispetto all'orario previsto dal turno assegnato, senza aver comunicato preventivamente l'impossibilità di presentarsi in orario.",
    obiettivo:
      'Il collaboratore si impegna a rispettare rigorosamente gli orari di servizio e a comunicare tempestivamente eventuali ritardi al responsabile di turno.',
    scadenza: 'A partire da subito',
  },
  uniforme: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, il collaboratore si è presentato al turno di servizio con l'uniforme non conforme alle disposizioni aziendali.",
    obiettivo:
      "Il collaboratore si impegna a presentarsi al lavoro indossando l'uniforme completa e conforme al regolamento aziendale.",
    scadenza: 'A partire da subito',
  },
  comportamento: {
    tipo: 'allineamento',
    non_conf:
      'In data {data}, è stato rilevato un comportamento inadeguato da parte del collaboratore durante il turno di servizio.',
    obiettivo:
      'Il collaboratore si impegna a mantenere un comportamento professionale e rispettoso nei confronti di colleghi e clienti.',
    scadenza: 'A partire da subito',
  },
  procedura: {
    tipo: 'allineamento',
    non_conf: 'In data {data}, il collaboratore non ha rispettato la procedura prevista per ___.',
    obiettivo: 'Il collaboratore si impegna a seguire scrupolosamente le procedure operative stabilite.',
    scadenza: 'A partire da subito',
  },
  prestazione: {
    tipo: 'apprezzamento',
    descrizione:
      'Si desidera riconoscere la prestazione eccellente del collaboratore, il quale ha dimostrato particolare impegno e professionalità nello svolgimento delle proprie mansioni.',
    osservazioni:
      'Il responsabile di settore esprime piena soddisfazione per il lavoro svolto e incoraggia il collaboratore a mantenere questo livello di eccellenza.',
  },
  cliente: {
    tipo: 'apprezzamento',
    descrizione:
      "A seguito di un feedback positivo ricevuto da un cliente, si desidera riconoscere l'atteggiamento professionale e cortese del collaboratore che ha contribuito a un'esperienza positiva per il cliente.",
    osservazioni: "Il responsabile di settore ringrazia il collaboratore per l'attenzione dedicata alla clientela.",
  },
  recidiva: {
    tipo: 'rdi',
    non_conf:
      'Il collaboratore è stato già oggetto di precedenti allineamenti per la medesima non conformità. Nonostante i colloqui di allineamento effettuati, la non conformità si è ripetuta in data {data}.',
    obiettivo:
      'Il collaboratore è consapevole che ulteriori recidive potranno comportare provvedimenti disciplinari di grado superiore.',
    scadenza: 'A partire da subito',
    livello: 'I',
  },
};
function templateRapido(tipo, templateKey) {
  const tmpl = TEMPLATES_RAPIDI[templateKey];
  if (!tmpl) return;
  apriModulo(tipo);
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  setTimeout(() => {
    if (tmpl.non_conf) {
      const el = document.getElementById('mod-non-conf');
      if (el) el.value = tmpl.non_conf.replace('{data}', oggi);
    }
    if (tmpl.obiettivo) {
      const el = document.getElementById('mod-obiettivo');
      if (el) el.value = tmpl.obiettivo;
    }
    if (tmpl.scadenza) {
      const el = document.getElementById('mod-scadenza');
      if (el) el.value = tmpl.scadenza;
    }
    if (tmpl.descrizione) {
      const el = document.getElementById('mod-descrizione');
      if (el) el.value = tmpl.descrizione;
    }
    if (tmpl.osservazioni) {
      const el = document.getElementById('mod-osservazioni');
      if (el) el.value = tmpl.osservazioni;
    }
    if (tmpl.livello) {
      const el = document.getElementById('mod-livello');
      if (el) el.value = tmpl.livello;
    }
  }, 150);
}

// RICERCA GLOBALE
let _rgTimeout = null;
function cercaGlobale(q) {
  clearTimeout(_rgTimeout);
  const dd = document.getElementById('ricerca-globale-results');
  if (!q || q.length < 2) {
    dd.classList.remove('show');
    return;
  }
  _rgTimeout = setTimeout(() => {
    _eseguiRicercaGlobale(q.toLowerCase());
  }, 200);
}
function _eseguiRicercaGlobale(q) {
  const dd = document.getElementById('ricerca-globale-results');
  let html = '';
  let tot = 0;
  // Diario
  const diarioRes = getDatiReparto()
    .filter(
      (e) => e.nome.toLowerCase().includes(q) || e.testo.toLowerCase().includes(q) || e.tipo.toLowerCase().includes(q)
    )
    .slice(0, 8);
  if (diarioRes.length) {
    html += '<div class="rg-section">Diario (' + diarioRes.length + (diarioRes.length >= 8 ? '+' : '') + ')</div>';
    diarioRes.forEach((e) => {
      const d = new Date(e.data);
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('diario');document.getElementById('filt-cerca').value='" +
        escP(q) +
        '\';render()"><span class="rg-badge" style="background:' +
        getColore(e.tipo) +
        '">' +
        escP(e.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(e.nome) +
        '</strong> — ' +
        escP(e.testo.substring(0, 80)) +
        '</span><span class="rg-date">' +
        d.toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += diarioRes.length;
  }
  // Moduli
  const moduRes = getModuliReparto()
    .filter(
      (m) =>
        (m.collaboratore || '').toLowerCase().includes(q) ||
        (m.tipo || '').toLowerCase().includes(q) ||
        JSON.stringify(m.dati || {})
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 6);
  if (isVis('moduli') && moduRes.length) {
    html += '<div class="rg-section">Moduli (' + moduRes.length + (moduRes.length >= 6 ? '+' : '') + ')</div>';
    moduRes.forEach((m) => {
      const colB = { allineamento: '#e67e22', apprezzamento: '#b8860b', rdi: '#c0392b' }[m.tipo] || 'var(--muted)';
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'moduli\');setTimeout(()=>apriModuloSalvato(' +
        m.id +
        '),300)"><span class="rg-badge" style="background:' +
        colB +
        '">' +
        escP(m.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(m.collaboratore) +
        '</strong> — ' +
        escP(m.data_modulo || '') +
        '</span><span class="rg-date">' +
        (m.created_at ? new Date(m.created_at).toLocaleDateString('it-IT') : '') +
        '</span></div>';
    });
    tot += moduRes.length;
  }
  // Note colleghi (solo quelle dove l'operatore è mittente o destinatario)
  const _op = getOperatore();
  const noteRes = noteColleghiCache
    .filter((n) => {
      const isMitt = n.da_operatore === _op && !n.nascosta_mitt;
      const isDest = n.a_operatore === _op && !n.nascosta_dest;
      if (!isMitt && !isDest) return false;
      return (
        n.messaggio.toLowerCase().includes(q) ||
        n.da_operatore.toLowerCase().includes(q) ||
        n.a_operatore.toLowerCase().includes(q)
      );
    })
    .slice(0, 5);
  if (isVis('note_collega') && noteRes.length) {
    html += '<div class="rg-section">Note Colleghi (' + noteRes.length + (noteRes.length >= 5 ? '+' : '') + ')</div>';
    noteRes.forEach((n) => {
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'note-collega\')"><span class="rg-badge" style="background:#2980b9">Nota</span><span class="rg-text"><strong>' +
        escP(n.da_operatore) +
        '</strong> → ' +
        escP(n.a_operatore) +
        ' — ' +
        escP(n.messaggio.substring(0, 60)) +
        '</span><span class="rg-date">' +
        new Date(n.created_at).toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += noteRes.length;
  }
  // Maison
  const maisonRes = getMaisonRepartoExpanded()
    .filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        (r.gruppo || '').toLowerCase().includes(q)
    )
    .slice(0, 6);
  if (isVis('maison') && maisonRes.length) {
    html +=
      '<div class="rg-section">Costi Maison (' + maisonRes.length + (maisonRes.length >= 6 ? '+' : '') + ')</div>';
    maisonRes.forEach((r) => {
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('maison');document.getElementById('maison-filt-nome').value='" +
        escP(r.nome) +
        '\';renderMaisonDashboard()"><span class="rg-badge" style="background:#b8860b">Maison</span><span class="rg-text"><strong>' +
        escP(r.nome) +
        '</strong> — ' +
        fmtCHF(r.costo) +
        ' CHF' +
        (r.tipo_buono ? ' (' + r.tipo_buono + ')' : '') +
        '</span><span class="rg-date">' +
        new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += maisonRes.length;
  }
  // Promemoria
  const pmRes = promemoriaCache
    .filter(
      (p) =>
        p.titolo.toLowerCase().includes(q) ||
        (p.descrizione || '').toLowerCase().includes(q) ||
        (p.assegnato_a || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isVis('promemoria') && pmRes.length) {
    html += '<div class="rg-section">Promemoria (' + pmRes.length + (pmRes.length >= 5 ? '+' : '') + ')</div>';
    pmRes.forEach((p) => {
      const scaduto = !p.completata && p.data_scadenza <= new Date().toISOString().split('T')[0];
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'promemoria\')"><span class="rg-badge" style="background:' +
        (p.completata ? '#2c6e49' : scaduto ? 'var(--accent)' : '#8e44ad') +
        '">' +
        (p.completata ? 'Fatto' : scaduto ? 'Scaduto' : 'Todo') +
        '</span><span class="rg-text"><strong>' +
        escP(p.titolo) +
        '</strong>' +
        (p.descrizione ? ' — ' + escP(p.descrizione.substring(0, 50)) : '') +
        '</span><span class="rg-date">' +
        new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += pmRes.length;
  }
  // Spese Extra
  const seRes = getSpeseReparto()
    .filter(
      (r) =>
        r.beneficiario.toLowerCase().includes(q) ||
        (r.luogo || '').toLowerCase().includes(q) ||
        (r.descrizione || '').toLowerCase().includes(q) ||
        (r.tipo || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isVis('maison') && seRes.length) {
    html += '<div class="rg-section">Spese Extra (' + seRes.length + (seRes.length >= 5 ? '+' : '') + ')</div>';
    seRes.forEach((r) => {
      const tc = SE_TIPI_COLOR[r.tipo] || 'var(--muted)';
      html +=
        '<div class="rg-item" onclick="chiudiRicercaGlobale();switchPage(\'maison\')"><span class="rg-badge" style="background:' +
        tc +
        '">' +
        (SE_TIPI_LABEL[r.tipo] || r.tipo) +
        '</span><span class="rg-text"><strong>' +
        escP(r.beneficiario) +
        '</strong>' +
        (r.luogo ? ' — ' + escP(r.luogo) : '') +
        ' — ' +
        fmtCHF(r.importo) +
        ' CHF</span><span class="rg-date">' +
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += seRes.length;
  }
  // Registro (solo admin)
  const logRes = logCache
    .filter(
      (l) =>
        l.azione.toLowerCase().includes(q) ||
        (l.dettaglio || '').toLowerCase().includes(q) ||
        (l.operatore || '').toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (isAdmin() && logRes.length) {
    html += '<div class="rg-section">Registro (' + logRes.length + (logRes.length >= 5 ? '+' : '') + ')</div>';
    logRes.forEach((l) => {
      html +=
        "<div class=\"rg-item\" onclick=\"chiudiRicercaGlobale();switchPage('registro');document.getElementById('log-filt-cerca').value='" +
        escP(q) +
        '\';renderRegistro()"><span class="rg-badge" style="background:var(--muted)">Log</span><span class="rg-text"><strong>' +
        escP(l.operatore || '') +
        '</strong> — ' +
        escP(l.azione) +
        ' ' +
        escP((l.dettaglio || '').substring(0, 50)) +
        '</span><span class="rg-date">' +
        new Date(l.created_at).toLocaleDateString('it-IT') +
        '</span></div>';
    });
    tot += logRes.length;
  }
  if (!tot)
    html =
      '<div class="rg-item" style="justify-content:center;color:var(--muted)">Nessun risultato per "' +
      escP(q) +
      '"</div>';
  dd.innerHTML = html;
  dd.classList.add('show');
}
function chiudiRicercaGlobale() {
  document.getElementById('ricerca-globale-results').classList.remove('show');
  document.getElementById('ricerca-globale').value = '';
}
document.addEventListener('click', function (e) {
  const w = document.querySelector('.ricerca-globale-wrap');
  if (w && !w.contains(e.target)) document.getElementById('ricerca-globale-results').classList.remove('show');
});
document.getElementById('ricerca-globale').addEventListener('keydown', function (e) {
  if (e.key === 'Escape') chiudiRicercaGlobale();
});

// RIEPILOGO MENSILE PDF
async function generaRiepilogoMensile() {
  // Show selection dialog before generating
  const mc = document.getElementById('pwd-modal-content');
  const now = new Date();
  let _rmMese = now.getMonth(),
    _rmAnno = now.getFullYear();
  // Build month selector options
  let meseOpts = '';
  MESI_FULL.forEach((m, i) => {
    meseOpts += '<option value="' + i + '"' + (i === _rmMese ? ' selected' : '') + '>' + m + '</option>';
  });
  let annoOpts = '';
  for (let a = _rmAnno; a >= _rmAnno - 3; a--)
    annoOpts += '<option value="' + a + '"' + (a === _rmAnno ? ' selected' : '') + '>' + a + '</option>';
  let html = '<h3>Riepilogo Mensile PDF</h3>';
  html += '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Seleziona mese e sezioni da includere</p>';
  html +=
    '<div style="display:flex;gap:10px;margin-bottom:14px"><select id="rm-mese" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem">' +
    meseOpts +
    '</select>';
  html +=
    '<select id="rm-anno" style="flex:1;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:.9rem">' +
    annoOpts +
    '</select></div>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
  const _sez = [
    ['registrazioni', 'Registrazioni (errori, malattie, ammonimenti, ecc.)'],
    ['differenze', 'Differenze cassa'],
    ['moduli', 'Moduli (allineamenti, RDI, apprezzamenti)'],
    ['maison', 'Costi Maison'],
    ['spese', 'Spese Extra'],
    ['inventario', 'Inventario movimenti'],
    ['statistiche', 'Statistiche riepilogative'],
  ];
  _sez.forEach(([k, l]) => {
    html +=
      '<label style="display:flex;align-items:center;gap:8px;font-size:.88rem;cursor:pointer"><input type="checkbox" id="rm-sez-' +
      k +
      '" checked style="width:16px;height:16px;accent-color:var(--accent2)"> ' +
      l +
      '</label>';
  });
  html += '</div>';
  html +=
    '<div style="display:flex;gap:8px;margin-bottom:8px"><button style="flex:1;padding:6px;font-size:.78rem;cursor:pointer;border:1px solid var(--line);border-radius:2px;background:var(--paper2);font-family:Source Sans 3,sans-serif" onclick="document.querySelectorAll(\'[id^=rm-sez-]\').forEach(c=>c.checked=true)">Seleziona tutti</button><button style="flex:1;padding:6px;font-size:.78rem;cursor:pointer;border:1px solid var(--line);border-radius:2px;background:var(--paper2);font-family:Source Sans 3,sans-serif" onclick="document.querySelectorAll(\'[id^=rm-sez-]\').forEach(c=>c.checked=false)">Deseleziona tutti</button></div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_eseguiRiepilogoMensile()">Genera PDF</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _eseguiRiepilogoMensile() {
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const mese = parseInt(document.getElementById('rm-mese').value);
  const anno = parseInt(document.getElementById('rm-anno').value);
  const sez = {};
  document.querySelectorAll('[id^=rm-sez-]').forEach((c) => {
    sez[c.id.replace('rm-sez-', '')] = c.checked;
  });
  const meseName = MESI_FULL[mese] + ' ' + anno;
  const primoGiorno = anno + '-' + String(mese + 1).padStart(2, '0') + '-01';
  const nextAnno = mese === 11 ? anno + 1 : anno,
    nextMese = mese === 11 ? 1 : mese + 1;
  const fineStr = nextAnno + '-' + String(nextMese).padStart(2, '0') + '-01';
  const meseData = getDatiReparto().filter((e) => e.data >= primoGiorno && e.data < fineStr);
  const meseModuli = getModuliReparto().filter((m) => {
    const d = m.created_at || m.data_modulo || '';
    return d >= primoGiorno && d < fineStr;
  });
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mx = 16;
    let y = 14;
    function _checkPage(needed) {
      if (y + needed > ph - 20) {
        doc.addPage();
        y = 16;
      }
    }
    // Logo
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(26, 18, 8);
    doc.text('Riepilogo Mensile', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(meseName + ' — Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    // Panoramica (sempre visibile)
    const nCollab = new Set(meseData.map((e) => e.nome)).size;
    const nErr = meseData.filter((e) => e.tipo === nomeCorrente('Errore')).length;
    const nMal = _contaTotaleMalattie(meseData, nomeCorrente('Malattia'));
    const totImp = meseData.reduce((s, e) => s + (parseFloat(e.importo) || 0), 0);
    const nAllin = meseModuli.filter((m) => m.tipo === 'allineamento').length;
    const nRdi = meseModuli.filter((m) => m.tipo === 'rdi').length;
    const nApprM = meseModuli.filter((m) => m.tipo === 'apprezzamento').length;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Panoramica', mx, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const stats = [
      ['Registrazioni totali', meseData.length],
      ['Collaboratori coinvolti', nCollab],
      ['Errori', nErr],
      ['Malattie', nMal],
      ['Importo totale errori', 'CHF ' + fmtCHF(totImp)],
      ['Moduli allineamento generati', nAllin],
      ['Moduli RDI generati', nRdi],
      ['Moduli apprezzamento generati', nApprM],
    ];
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: mx, right: mx },
      body: stats.map((s) => [s[0], String(s[1])]),
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'center' } },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    y = doc.lastAutoTable.finalY + 10;
    // SEZIONE: Registrazioni
    if (sez.registrazioni && meseData.length) {
      const cc = {};
      meseData.forEach((e) => {
        cc[e.nome] = (cc[e.nome] || 0) + 1;
      });
      const top10 = Object.entries(cc)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Top 10 collaboratori con piu registrazioni', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Collaboratore', 'N. registrazioni']],
        body: top10.map(([n, c]) => [n, String(c)]),
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 10;
      // Errori per collaboratore
      const errori = meseData.filter((e) => e.tipo === nomeCorrente('Errore'));
      if (errori.length) {
        const errMap = {};
        errori.forEach((e) => {
          if (!errMap[e.nome]) errMap[e.nome] = { count: 0, tot: 0 };
          errMap[e.nome].count++;
          errMap[e.nome].tot += parseFloat(e.importo) || 0;
        });
        const errSorted = Object.entries(errMap).sort((a, b) => b[1].count - a[1].count);
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Dettaglio errori per collaboratore', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'N. errori', 'Importo totale']],
          body: errSorted.map(([n, d]) => [n, String(d.count), 'CHF ' + fmtCHF(d.tot)]),
          headStyles: { fillColor: [192, 57, 43], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
      // Malattie
      const malattie = meseData.filter((e) => e.tipo === nomeCorrente('Malattia'));
      if (malattie.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Malattie', mx, y);
        y += 2;
        const malMap = {};
        malattie.forEach((e) => {
          if (!malMap[e.nome]) malMap[e.nome] = 0;
          const gg = _contaGiorniMalattia(e);
          malMap[e.nome] += gg;
        });
        const malSorted = Object.entries(malMap).sort((a, b) => b[1] - a[1]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'Giorni malattia']],
          body: malSorted.map(([n, g]) => [n, String(g)]),
          headStyles: { fillColor: [230, 126, 34], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Differenze cassa
    if (sez.differenze) {
      const cassaEntries = meseData.filter(
        (e) => e.tipo === nomeCorrente('Differenza Cassa') || e.tipo === 'Differenza Cassa'
      );
      if (cassaEntries.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Differenze Cassa', mx, y);
        y += 2;
        const cassaBody = cassaEntries.map((e) => [
          e.nome,
          e.data ? new Date(e.data + 'T12:00:00').toLocaleDateString('it-IT') : '',
          'CHF ' + fmtCHF(parseFloat(e.importo) || 0),
          (e.descrizione || '').substring(0, 60),
        ]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Collaboratore', 'Data', 'Importo', 'Descrizione']],
          body: cassaBody,
          headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
          columnStyles: { 2: { halign: 'right' }, 3: { cellWidth: 60 } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Moduli
    if (sez.moduli && meseModuli.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Moduli generati', mx, y);
      y += 2;
      const tipiModulo = ['allineamento', 'rdi', 'apprezzamento'];
      const modBody = [];
      tipiModulo.forEach((tipo) => {
        const mm = meseModuli.filter((m) => m.tipo === tipo);
        if (mm.length) {
          const collab = {};
          mm.forEach((m) => {
            collab[m.nome] = (collab[m.nome] || 0) + 1;
          });
          Object.entries(collab)
            .sort((a, b) => b[1] - a[1])
            .forEach(([n, c]) => {
              modBody.push([tipo.charAt(0).toUpperCase() + tipo.slice(1), n, String(c)]);
            });
        }
      });
      if (modBody.length) {
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Tipo', 'Collaboratore', 'Quantita']],
          body: modBody,
          headStyles: { fillColor: [142, 68, 173], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 2: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Costi Maison
    const _pdfMaison = getMaisonRepartoExpanded().filter(
      (r) => r.data_giornata >= primoGiorno && r.data_giornata < fineStr
    );
    if (sez.maison && _pdfMaison.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Costi Maison', mx, y);
      y += 2;
      const maisonTot = _pdfMaison.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
      const maisonClienti = new Set(_pdfMaison.map((r) => r.nome)).size;
      // Summary
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        body: [
          ['Costo totale', 'CHF ' + fmtCHF(maisonTot)],
          ['Clienti', '' + maisonClienti],
          ['Visite totali', '' + _pdfMaison.length],
        ],
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 6;
      // Top clienti Maison
      const cliMap = {};
      _pdfMaison.forEach((r) => {
        if (!cliMap[r.nome]) cliMap[r.nome] = { costo: 0, visite: 0 };
        cliMap[r.nome].costo += parseFloat(r.costo || 0);
        cliMap[r.nome].visite++;
      });
      const topCli = Object.entries(cliMap)
        .sort((a, b) => b[1].costo - a[1].costo)
        .slice(0, 15);
      if (topCli.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Top clienti Maison per costo', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Cliente', 'Visite', 'Costo totale']],
          body: topCli.map(([n, d]) => [n, String(d.visite), 'CHF ' + fmtCHF(d.costo)]),
          headStyles: { fillColor: [139, 105, 20], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Spese Extra
    const _pdfSpese = getSpeseReparto().filter(
      (r) => (r.data_spesa || r.created_at || '') >= primoGiorno && (r.data_spesa || r.created_at || '') < fineStr
    );
    if (sez.spese && _pdfSpese.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Spese Extra', mx, y);
      y += 2;
      const speseTot = _pdfSpese.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
      const speseBody = _pdfSpese
        .sort((a, b) => (b.data_spesa || '').localeCompare(a.data_spesa || ''))
        .map((r) => [
          r.beneficiario || '',
          r.data_spesa ? new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT') : '',
          (SE_TIPI_LABEL && SE_TIPI_LABEL[r.tipo]) || r.tipo || '',
          'CHF ' + fmtCHF(parseFloat(r.importo || 0)),
          (r.luogo || '').substring(0, 30),
        ]);
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Beneficiario', 'Data', 'Tipo', 'Importo', 'Luogo']],
        body: speseBody,
        headStyles: { fillColor: [44, 110, 73], textColor: [255, 255, 255] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
        columnStyles: { 3: { halign: 'right' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Totale Spese Extra: CHF ' + fmtCHF(speseTot), mx, y + 4);
      y += 10;
    }
    // SEZIONE: Inventario movimenti
    if (sez.inventario) {
      const invData = getInventarioReparto().filter(
        (r) =>
          (r.data_movimento || r.created_at || '') >= primoGiorno && (r.data_movimento || r.created_at || '') < fineStr
      );
      if (invData.length) {
        _checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('Inventario Movimenti', mx, y);
        y += 2;
        const invBody = invData
          .sort((a, b) => (b.data_movimento || '').localeCompare(a.data_movimento || ''))
          .map((r) => [
            r.articolo || '',
            (r.tipo_movimento || '').charAt(0).toUpperCase() + (r.tipo_movimento || '').slice(1),
            String(r.quantita || 0),
            r.data_movimento ? new Date(r.data_movimento + 'T12:00:00').toLocaleDateString('it-IT') : '',
            (r.note || '').substring(0, 40),
          ]);
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Articolo', 'Tipo', 'Quantita', 'Data', 'Note']],
          body: invBody,
          headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 8.5, cellPadding: 3 },
          columnStyles: { 2: { halign: 'center' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
    // SEZIONE: Statistiche riepilogative
    if (sez.statistiche && meseData.length) {
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Statistiche per tipo di evento', mx, y);
      y += 2;
      const tipoCount = {};
      meseData.forEach((e) => {
        tipoCount[e.tipo] = (tipoCount[e.tipo] || 0) + 1;
      });
      const tipoSorted = Object.entries(tipoCount).sort((a, b) => b[1] - a[1]);
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Tipo evento', 'Conteggio', 'Percentuale']],
        body: tipoSorted.map(([t, c]) => [t, String(c), ((c / meseData.length) * 100).toFixed(1) + '%']),
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
      // Distribuzione per giorno della settimana
      const giorniNome = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
      const giorniCount = [0, 0, 0, 0, 0, 0, 0];
      meseData.forEach((e) => {
        if (e.data) {
          const d = new Date(e.data + 'T12:00:00');
          giorniCount[d.getDay()]++;
        }
      });
      _checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Distribuzione per giorno della settimana', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [giorniNome],
        body: [giorniCount.map(String)],
        headStyles: { fillColor: [26, 18, 8], textColor: [250, 247, 242] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3, halign: 'center' },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    // Footer
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Casino Lugano SA — Riepilogo ' + meseName + ' — Pag. ' + i + '/' + tp, mx, ph - 8);
    }
    mostraPdfPreview(doc, 'Riepilogo_' + meseName.replace(/\s/g, '_') + '.pdf', 'Riepilogo ' + meseName);
  } catch (e) {
    console.error(e);
    toast('Errore generazione PDF: ' + e.message);
  }
}

// ================================================================
