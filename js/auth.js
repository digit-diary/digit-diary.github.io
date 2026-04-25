/**
 * Diario Collaboratori — Casino Lugano SA
 * File: auth.js
 * Autenticazione: login, password, sessioni, biometrico
 */

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
