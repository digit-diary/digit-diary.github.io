/**
 * Diario Collaboratori — Casino Lugano SA
 * File: realtime.js
 * Righe originali: 181
 * Estratto automaticamente da index.html
 */
// SEZIONE 4: REALTIME E POLLING
// WebSocket per notifiche chat, polling fallback
// ================================================================
// --- SUPABASE REALTIME ---
let _sbClient = null,
  _noteChannel = null;
function _getSbClient() {
  if (_sbClient) return _sbClient;
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    _sbClient = supabase.createClient(SB_URL, SB_KEY);
    return _sbClient;
  }
  return null;
}
function _initNoteRealtime() {
  if (_noteChannel || window._notePollingId) return;
  const sb = _getSbClient();
  if (!sb) {
    console.warn('Supabase client non disponibile, fallback a polling');
    window._notePollingId = setInterval(pollNuoveNote, 15000);
    return;
  }
  // ENTERPRISE REALTIME: subscribe SOLO a chat_messages (tabella principale).
  // Le altre tabelle (letti, hidden) vengono sincronizzate via _resyncNote al cambio tab.
  // Sottoscrivere 3 tabelle in un canale causava loop errore/riconnessione su Supabase free.
  let _rtRetryCount = 0;
  const _RT_MAX_RETRIES = 5;
  _noteChannel = sb
    .channel('chat-msg-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, async function (payload) {
      try {
        _rtRetryCount = 0; // reset retry su evento ricevuto con successo
        const op = getOperatore();
        if (!op) return;
        if (payload.eventType === 'INSERT') {
          const m = payload.new;
          // Skip messaggi propri (evita auto-notifica) E duplicati gia' in cache
          if (m.da_operatore === op) return;
          if (chatMessagesCache.find((x) => x.id === m.id)) return;
          if (m.messaggio && m.messaggio.startsWith('ENC:')) m.messaggio = await decryptNota(m.messaggio);
          m._decrypted = true;
          chatMessagesCache.unshift(m);
          _chatBuildNoteCache();
          aggiornaNoteBadge();
          const pg = localStorage.getItem('pagina_corrente');
          if (pg === 'note-collega') renderNoteCollega();
          if (m.da_operatore !== op) {
            let isForMe = false;
            if (m.a_operatore === op) isForMe = true;
            else if (
              m.group_id &&
              chatGroupMembersCache.some((gm) => gm.group_id === m.group_id && gm.operatore === op)
            )
              isForMe = true;
            if (isForMe) {
              let convKey = null;
              if (m.a_operatore === op) convKey = m.da_operatore;
              else if (m.group_id) {
                const g = _chatGetGroupById(m.group_id);
                if (g) convKey = 'gruppo:' + _chatGroupGid(g);
              }
              const _isCurrentConv =
                window._noteConvAttiva && pg === 'note-collega' && window._noteConvAttiva === convKey;
              if (!_isCurrentConv) {
                const _cleanMsg = (m.messaggio || '')
                  .substring(0, 80)
                  .replace(/\[GNAME:[^\]]*\]/g, '')
                  .replace(/\[REPLY:[^\]]*\]/g, '')
                  .trim();
                if (m.urgente) {
                  mostraNotifBanner('urgente', '\u26A0\uFE0F URGENTE da ' + m.da_operatore, _cleanMsg, () =>
                    switchPage('note-collega')
                  );
                  inviaNotifica('\u26A0\uFE0F URGENTE da ' + m.da_operatore, _cleanMsg);
                } else {
                  mostraNotifBanner('nota', 'Nota da ' + m.da_operatore, _cleanMsg, () => switchPage('note-collega'));
                  inviaNotifica('Nota da ' + m.da_operatore, _cleanMsg);
                }
              } else {
                _chatPatchMessage(m.id, { letta: true })
                  .then(() => aggiornaNoteBadge())
                  .catch((e) => console.warn('Auto-mark read failed:', e.message));
              }
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          const m = payload.new;
          const idx = chatMessagesCache.findIndex((x) => x.id === m.id);
          if (idx !== -1) {
            if (m.messaggio && m.messaggio.startsWith('ENC:')) m.messaggio = await decryptNota(m.messaggio);
            else if (chatMessagesCache[idx]._decrypted) m.messaggio = chatMessagesCache[idx].messaggio;
            m._decrypted = true;
            chatMessagesCache[idx] = m;
            _chatBuildNoteCache();
            aggiornaNoteBadge();
            const pg = localStorage.getItem('pagina_corrente');
            if (pg === 'note-collega') renderNoteCollega();
          }
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old;
          chatMessagesCache = chatMessagesCache.filter((x) => x.id !== old.id);
          chatLettiCache = chatLettiCache.filter((l) => l.message_id !== old.id);
          chatHiddenCache = chatHiddenCache.filter((h) => h.message_id !== old.id);
          _chatBuildNoteCache();
          aggiornaNoteBadge();
          const pg = localStorage.getItem('pagina_corrente');
          if (pg === 'note-collega') renderNoteCollega();
        }
      } catch (e) {
        console.error('Realtime chat callback error:', e);
      }
    })
    .subscribe(function (status) {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime chat: connesso');
        _rtRetryCount = 0;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        _rtRetryCount++;
        if (_rtRetryCount <= _RT_MAX_RETRIES) {
          console.warn('Realtime chat: errore (' + _rtRetryCount + '/' + _RT_MAX_RETRIES + '), risincronizzazione...');
          setTimeout(_resyncNote, 3000 * _rtRetryCount); // backoff crescente
        } else {
          console.warn('Realtime chat: troppi errori, passaggio a polling ogni 30s');
          try {
            _noteChannel.unsubscribe();
          } catch (e) {}
          _noteChannel = null;
          window._notePollingId = setInterval(pollNuoveNote, 30000);
        }
      }
    });
  // Riconnessione: quando il tab torna attivo, rinnova token e risincronizza
  document.addEventListener('visibilitychange', async function () {
    if (!document.hidden) {
      await _ensureToken();
      _resyncNote();
    }
  });
}
async function _resyncNote() {
  // ENTERPRISE: rifetch chat_* tables
  try {
    const [msgs, letti, hidden, grps, members] = await Promise.all([
      secGet('chat_messages?order=created_at.desc'),
      secGet('chat_message_letti?order=letta_at.desc'),
      secGet('chat_message_hidden?order=hidden_at.desc'),
      secGet('chat_groups?order=id.asc'),
      secGet('chat_group_members?order=group_id.asc'),
    ]);
    chatMessagesCache = msgs || [];
    chatLettiCache = letti || [];
    chatHiddenCache = hidden || [];
    chatGroupsCache = grps || [];
    chatGroupMembersCache = members || [];
    await decryptChatMessagesCache();
    _chatBuildNoteCache();
    aggiornaNoteBadge();
    const pg = localStorage.getItem('pagina_corrente');
    if (pg === 'note-collega') renderNoteCollega();
  } catch (e) {
    console.warn('_resyncNote enterprise:', e.message);
  }
}
const CAMPI_RAPPORTO_DEFAULT = [
  { key: 'sup_note', label: 'Supervisore', type: 'input' },
  { key: 'cassa_note', label: 'Cassa', type: 'text' },
  { key: 'differenze_cassa', label: 'Differenze Cassa', type: 'text' },
  { key: 'sala_note', label: 'Sala', type: 'text' },
  { key: 'n_assegni', label: 'Incasso Assegni', type: 'text' },
  { key: 'prelievi', label: 'Prelievi', type: 'text' },
  { key: 'assenze', label: 'Assenze', type: 'text' },
];
const RAPPORTO_DB_COLS = ['sup_note', 'cassa_note', 'sala_note', 'n_assegni', 'prelievi', 'assenze'];
let campiRapportoExtra = [],
  tipiNascosti = [],
  campiNascosti = [],
  tipiOrdine = [],
  campiOrdine = [],
  campiLabelOverride = {},
  tipiRinominati = {};
let visibilitaConfig = {};
let collaboratoriCache = [],
  moduliCache = [],
  logCache = [],
  maisonCache = [],
  maisonBudgetCache = [],
  promemoriaCache = [],
  consegneCache = [],
  speseExtraCache = [],
  regaliCache = [],
  noteClientiCache = [],
  inventarioCache = [];
let currentReparto = 'slots',
  operatoriRepartoMap = {};
function nomeCorrente(orig) {
  return tipiRinominati[orig] || orig;
}
function getTuttiTipi() {
  let list = [
    ...TIPI_DEFAULT.filter((t) => !tipiNascosti.includes(t.nome)).map((t) => {
      const c = coloriOverride[t.nome] || t.colore;
      const n = tipiRinominati[t.nome] || t.nome;
      return { nome: n, colore: c, _orig: t.nome };
    }),
    ...tipiPersonalizzati,
  ];
  if (tipiOrdine.length)
    list.sort((a, b) => {
      const ia = tipiOrdine.indexOf(a.nome),
        ib = tipiOrdine.indexOf(b.nome);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  return list;
}
function getColore(n) {
  return coloriOverride[n] || (getTuttiTipi().find((t) => t.nome === n) || {}).colore || '#8a7d6b';
}
function getOperatore() {
  return localStorage.getItem('operatore_corrente') || '';
}
function _isSessionValid() {
  var ts = parseInt(localStorage.getItem('diario_auth_ts') || '0');
  if (!ts) return false;
  if (_hasBioForCurrentOp()) return true;
  return sessionStorage.getItem('session_active') === '1' && Date.now() - ts < 28800000;
}
function _hasBioForCurrentOp() {
  var c = localStorage.getItem('webauthn_cred');
  if (!c) return false;
  try {
    var o = JSON.parse(c);
    if (!o.v || o.v < 3) {
      localStorage.removeItem('webauthn_cred');
      return false;
    }
    return o.op === localStorage.getItem('operatore_corrente');
  } catch (e) {
    localStorage.removeItem('webauthn_cred');
    return false;
  }
}
function _hasBioForAnyOp() {
  var c = localStorage.getItem('webauthn_cred');
  if (!c) return false;
  try {
    var o = JSON.parse(c);
    if (!o.v || o.v < 3) {
      localStorage.removeItem('webauthn_cred');
      return false;
    }
    return true;
  } catch (e) {
    localStorage.removeItem('webauthn_cred');
    return false;
  }
}
async function sha256(t) {
  const d = new TextEncoder().encode(t),
    h = await crypto.subtle.digest('SHA-256', d);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function _e(s) {
  const r = [];
  for (let i = 0; i < s.length; i++) r.push(String.fromCharCode(s.charCodeAt(i) ^ _k.charCodeAt(i % _k.length)));
  return btoa(r.join(''));
}
async function secureHash(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode('DiarioCL26_v2_' + (salt || '').toLowerCase()),
      iterations: 100000,
      hash: 'SHA-256',
    },
    km,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
let _loginFailCount = 0,
  _loginLockUntil = 0;
function getAdminToken() {
  return sessionStorage.getItem('op_token') || sessionStorage.getItem('admin_token') || '';
}
function getOpToken() {
  return sessionStorage.getItem('op_token') || '';
}
function setOpToken(t) {
  if (t) sessionStorage.setItem('op_token', t);
}
async function _renewToken() {
  const op = getOperatore();
  if (!op) return false;
  try {
    const r = await sbRpc('create_bio_session', { p_nome: op });
    if (r && r.session_token) {
      setOpToken(r.session_token);
      return true;
    }
  } catch (e) {}
  return false;
}
let _renewingToken = false;
async function _ensureToken() {
  if (_renewingToken) return;
  const tk = getOpToken();
  if (tk) {
    const v = await sbRpc('validate_op_session', { p_token: tk });
    if (v && v.valid) return;
  }
  _renewingToken = true;
  try {
    await _renewToken();
  } finally {
    _renewingToken = false;
  }
}
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

// SUPABASE
function sbH(x) {
  return Object.assign(
    { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    x || {}
  );
}
async function sbGet(path) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: sbH() });
  return r.ok ? r.json() : [];
}
async function sbPost(table, data, extra) {
  const r = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: sbH(Object.assign({ Prefer: 'return=representation' }, extra || {})),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPatch(table, filter, data) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH',
    headers: sbH({ Prefer: 'return=representation' }),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function sbDel(table, filter) {
  await fetch(SB_URL + '/rest/v1/' + table + '?' + filter, { method: 'DELETE', headers: sbH() });
}
async function sbRpc(fn, params) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: sbH(),
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) {
    try {
      const errTxt = await r.text();
      console.error('sbRpc ' + fn + ' ' + r.status + ':', errTxt);
    } catch (e) {}
    return null;
  }
  const txt = await r.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}
// --- FUNZIONI SICURE (token-based) con fallback a sbGet/sbPost/etc ---
function _parseRestFilter(path) {
  // Converte 'table?col=eq.val&col2=gte.val2' in {table, filter SQL, order, limit}
  const qIdx = path.indexOf('?');
  if (qIdx === -1) return { table: path, filter: '', order: '', limit: 5000 };
  const table = path.substring(0, qIdx);
  const params = new URLSearchParams(path.substring(qIdx + 1));
  let filters = [],
    order = '',
    limit = 5000,
    selectCols = '';
  for (const [k, v] of params.entries()) {
    if (k === 'order') {
      order = v.replace(/\./g, ' ').replace(/,/g, ', ');
    } else if (k === 'limit') {
      limit = parseInt(v) || 5000;
    } else if (k === 'select') {
      selectCols = v;
    } else {
      const m = v.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)/);
      if (m) {
        const op = {
          eq: '=',
          neq: '!=',
          gt: '>',
          gte: '>=',
          lt: '<',
          lte: '<=',
          like: 'LIKE',
          ilike: 'ILIKE',
          is: 'IS',
        }[m[1]];
        const val =
          m[2] === 'true'
            ? 'TRUE'
            : m[2] === 'false'
              ? 'FALSE'
              : m[2] === 'null'
                ? 'NULL'
                : "'" + m[2].replace(/'/g, "''") + "'";
        filters.push(k + ' ' + op + ' ' + val);
      }
    }
  }
  return { table, filter: filters.join(' AND '), order, limit };
}
async function secGet(path) {
  let tk = getOpToken();
  if (tk) {
    try {
      const p = _parseRestFilter(path);
      const r = await sbRpc('secure_read', {
        p_token: tk,
        p_table: p.table,
        p_filter: p.filter,
        p_order: p.order,
        p_limit: p.limit,
      });
      return r || [];
    } catch (e) {
      // Token scaduto → rinnova e riprova
      if (await _renewToken()) {
        tk = getOpToken();
        try {
          const p = _parseRestFilter(path);
          const r = await sbRpc('secure_read', {
            p_token: tk,
            p_table: p.table,
            p_filter: p.filter,
            p_order: p.order,
            p_limit: p.limit,
          });
          return r || [];
        } catch (e2) {}
      }
      console.warn('secGet fallback:', e.message);
      return sbGet(path);
    }
  }
  return sbGet(path);
}
async function secPost(table, data) {
  const tk = getOpToken();
  if (tk) {
    try {
      const r = await sbRpc('secure_insert', { p_token: tk, p_table: table, p_data: data });
      if (r) return [r];
      console.warn('secPost: secure_insert null, fallback');
      return sbPost(table, data);
    } catch (e) {
      console.warn('secPost fallback:', e.message);
      return sbPost(table, data);
    }
  }
  return sbPost(table, data);
}
async function secPatch(table, filter, data) {
  const tk = getOpToken();
  if (tk) {
    try {
      // Converte filtro REST (id=eq.123&nome=eq.X) in SQL (id = 123 AND nome = 'X')
      const parts = filter
        .split('&')
        .map((p) => {
          const [k, v] = p.split('=');
          const rest = p.substring(k.length + 1);
          const m = rest.match(/^(eq|neq)\.(.*)/);
          if (m) {
            const op = m[1] === 'eq' ? '=' : '!=';
            const val = isNaN(m[2]) ? "'" + m[2].replace(/'/g, "''") + "'" : m[2];
            return k + ' ' + op + ' ' + val;
          }
          return null;
        })
        .filter(Boolean)
        .join(' AND ');
      await sbRpc('secure_update', { p_token: tk, p_table: table, p_filter: parts, p_data: data });
    } catch (e) {
      console.warn('secPatch fallback:', e.message);
      await sbPatch(table, filter, data);
    }
  } else {
    await sbPatch(table, filter, data);
  }
}
async function secDel(table, filter) {
  const tk = getOpToken();
  if (tk) {
    try {
      const parts = filter
        .split('&')
        .map((p) => {
          const [k] = p.split('=');
          const rest = p.substring(k.length + 1);
          const m = rest.match(/^(eq|neq|like)\.(.*)/);
          if (m) {
            const op = { eq: '=', neq: '!=', like: 'LIKE' }[m[1]];
            const val = isNaN(m[2]) ? "'" + m[2].replace(/'/g, "''") + "'" : m[2];
            return k + ' ' + op + ' ' + val;
          }
          return null;
        })
        .filter(Boolean)
        .join(' AND ');
      await sbRpc('secure_delete', { p_token: tk, p_table: table, p_filter: parts });
    } catch (e) {
      console.warn('secDel fallback:', e.message);
      await sbDel(table, filter);
    }
  } else {
    await sbDel(table, filter);
  }
}
async function getImp(k) {
  const d = await secGet('impostazioni?chiave=eq.' + k + '&select=valore');
  return d.length ? d[0].valore : null;
}
async function setImp(k, v) {
  const tk = getOpToken();
  if (tk) {
    try {
      await sbRpc('upsert_impostazione', { p_token: tk, p_chiave: k, p_valore: v });
      return;
    } catch (e) {
      console.warn('setImp upsert error:', e.message);
    }
  }
  try {
    await secPatch('impostazioni', 'chiave=eq.' + k, { valore: v });
  } catch (e) {}
  const check = await getImp(k);
  if (check !== v) {
    try {
      await secPost('impostazioni', { chiave: k, valore: v });
    } catch (e2) {}
  }
}

// ================================================================
