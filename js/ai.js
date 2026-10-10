/**
 * Diario Collaboratori · Casino Lugano SA
 * File: ai.js
 *
 * INTELLIGENZA ARTIFICIALE CONFIGURABILE: piu fornitori con la stessa interfaccia
 * standard (chat/completions): Groq, Ollama o LM Studio sul server interno (Llama,
 * Qwen, Mistral...), altri servizi compatibili. Uno e attivo, uno puo fare da
 * riserva se il primo non risponde. Tutto si configura da Impostazioni >
 * Settori e moduli > Intelligenza artificiale (solo amministratore).
 *
 * Privacy invariata: chi chiama sostituisce i nomi con segnaposto prima dell invio
 * e non invia fotografie. Le chiavi stanno nella tabella ai_chiavi del database,
 * leggibili solo con una sessione valida (get_ai_key), mai nel codice.
 */
const AI_TIPI = {
  groq: {
    etichetta: 'Groq (servizio esterno)',
    url: 'https://api.groq.com/openai/v1',
    modelli: { testo: 'openai/gpt-oss-120b', json: 'qwen/qwen3.8-27b' },
    chiave: true,
    json: true,
    riserva: 'qwen/qwen3.8-27b',
  },
  ollama: {
    etichetta: 'Ollama sul server interno (Llama, Qwen, Mistral...)',
    url: '/ai/v1',
    modelli: { testo: 'llama3.1:8b', json: 'llama3.1:8b' },
    chiave: false,
    json: true,
  },
  lmstudio: {
    etichetta: 'LM Studio sul server interno',
    url: 'http://localhost:1234/v1',
    modelli: { testo: '', json: '' },
    chiave: false,
    json: false,
  },
  compatibile: {
    etichetta: 'Altro servizio compatibile (OpenAI, vLLM, ...)',
    url: '',
    modelli: { testo: '', json: '' },
    chiave: true,
    json: true,
  },
};
const AI_ATTESA_MS = 180000; // i modelli locali possono impiegare anche un paio di minuti
let _aiConf = { fornitori: [], attivo: '', riserva: '' };
const _aiChiavi = {};

// compatibilita: il resto del programma usava questi nomi
let groqKey = '';

function _aiFornitore(id) {
  return _aiConf.fornitori.find((f) => f.id === id) || null;
}
function aiFornitoreAttivo() {
  return _aiFornitore(_aiConf.attivo) || null;
}
function aiModello(compito) {
  const f = aiFornitoreAttivo();
  if (!f) return '';
  return (f.modelli && f.modelli[compito]) || (f.modelli && f.modelli.testo) || '';
}
function _aiUrl(f) {
  let u = String(f.url || '')
    .trim()
    .replace(/\/+$/, '');
  // indirizzo relativo (es. /ai/v1): stesso sito del programma, passa dall inoltro IIS
  if (u.startsWith('/')) u = location.origin + u;
  return u;
}
function aiPronta() {
  const f = aiFornitoreAttivo();
  if (!f || !_aiUrl(f) || !aiModello('testo')) return false;
  return !(AI_TIPI[f.tipo] || {}).chiave || !!_aiChiavi[f.id] || f.senzaChiave === true;
}

async function _aiLeggiChiave(id) {
  if (_aiChiavi[id] !== undefined) return _aiChiavi[id];
  let k = '';
  try {
    const r = await _rpcSicura('get_ai_key', { p_token: getOpToken() || getAdminToken(), p_fornitore: id });
    k = (r && r.key) || '';
    if (k.startsWith('enc:')) k = _d(k.substring(4));
  } catch (e) {
    console.warn('Chiave AI non letta:', e.message);
  }
  _aiChiavi[id] = k;
  return k;
}

// Legge l elenco dei fornitori. Se non c e ancora (prima installazione o
// aggiornamento), lo ricava dalla configurazione Groq di prima.
async function caricaAiConfig() {
  let fornitori = null;
  try {
    const v = await getImp('ai_fornitori');
    if (v) fornitori = JSON.parse(v);
  } catch (e) {}
  if (!Array.isArray(fornitori) || !fornitori.length) {
    let modelli = Object.assign({}, AI_TIPI.groq.modelli);
    try {
      const gm = await getImp('groq_modelli');
      if (gm) modelli = Object.assign(modelli, JSON.parse(gm));
    } catch (e) {}
    fornitori = [{ id: 'groq', nome: 'Groq', tipo: 'groq', url: AI_TIPI.groq.url, modelli, json: true }];
  }
  let attivo = '',
    riserva = '';
  try {
    attivo = (await getImp('ai_fornitore_attivo')) || '';
    riserva = (await getImp('ai_fornitore_riserva')) || '';
  } catch (e) {}
  if (!fornitori.find((f) => f.id === attivo)) attivo = fornitori[0].id;
  _aiConf = { fornitori, attivo, riserva: fornitori.find((f) => f.id === riserva) ? riserva : '' };
  const f = aiFornitoreAttivo();
  if (f && (AI_TIPI[f.tipo] || {}).chiave) await _aiLeggiChiave(f.id);
  groqKey = aiPronta() ? 'configurata' : '';
  if (typeof renderAiFornitoriUI === 'function' && document.getElementById('ai-fornitori-ui')) renderAiFornitoriUI();
}
// vecchio nome, chiamato all avvio
async function loadGroqKey() {
  return caricaAiConfig();
}

// alcuni modelli locali scrivono il loro "ragionamento" prima della risposta
function _aiPulisci(t) {
  return String(t || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

async function _aiChiamaUno(f, body, compito) {
  const tipo = AI_TIPI[f.tipo] || AI_TIPI.compatibile;
  const chiave = tipo.chiave ? await _aiLeggiChiave(f.id) : '';
  if (tipo.chiave && !chiave) throw new Error('Manca la chiave per ' + f.nome + ': inseriscila nelle Impostazioni');
  const corpo = Object.assign({}, body);
  corpo.model = (f.modelli && f.modelli[compito]) || (f.modelli && f.modelli.testo) || corpo.model;
  if (f.json === false) delete corpo.response_format;
  const controllo = new AbortController();
  const timer = setTimeout(() => controllo.abort(), AI_ATTESA_MS);
  let r;
  try {
    r = await fetch(_aiUrl(f) + '/chat/completions', {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        chiave ? { Authorization: 'Bearer ' + chiave } : {},
      ),
      body: JSON.stringify(corpo),
      signal: controllo.signal,
    });
  } catch (e) {
    throw new Error(
      e.name === 'AbortError'
        ? f.nome + ': nessuna risposta entro ' + AI_ATTESA_MS / 60000 + ' minuti'
        : f.nome + ' non raggiungibile: controlla indirizzo e server',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const testo = await r.text().catch(() => '');
    console.error('AI', f.nome, r.status, testo.slice(0, 300));
    // alcuni server non accettano la richiesta di risposta JSON: si riprova senza
    if (r.status === 400 && corpo.response_format) {
      return _aiChiamaUno(Object.assign({}, f, { json: false }), body, compito);
    }
    // Groq: modello dismesso o sovraccarico -> modello di riserva
    if (f.tipo === 'groq' && [404, 429, 503].includes(r.status) && corpo.model !== tipo.riserva) {
      const m = Object.assign({}, f.modelli, { [compito]: tipo.riserva });
      return _aiChiamaUno(Object.assign({}, f, { modelli: m }), body, compito);
    }
    if (r.status === 401 || r.status === 403) throw new Error('Chiave non valida per ' + f.nome);
    if (r.status === 404) throw new Error(f.nome + ': modello "' + corpo.model + '" non disponibile');
    if (r.status === 429 || r.status === 503) throw new Error(f.nome + ' sovraccarico: riprova tra poco');
    throw new Error(f.nome + ': errore ' + r.status);
  }
  const dati = await r.json();
  const txt = _aiPulisci(dati.choices && dati.choices[0] && dati.choices[0].message && dati.choices[0].message.content);
  if (!txt) throw new Error(f.nome + ': risposta vuota');
  return txt;
}

// Chiamata unica usata da tutto il programma. compito: 'testo' | 'json'
async function aiChat(body, compito) {
  const f = aiFornitoreAttivo();
  if (!f) throw new Error('Nessun fornitore AI configurato');
  const c = compito || (body && body.response_format ? 'json' : 'testo');
  try {
    return await _aiChiamaUno(f, body, c);
  } catch (e) {
    const ris = _aiFornitore(_aiConf.riserva);
    if (!ris || ris.id === f.id) throw e;
    console.warn('AI: ' + e.message + ' -> provo la riserva ' + ris.nome);
    return _aiChiamaUno(ris, body, c);
  }
}

// PROVA COLLEGAMENTO: elenco modelli + una domanda brevissima
async function aiProva(id) {
  const f = _aiFornitore(id);
  if (!f) return { ok: false, errore: 'Fornitore non trovato' };
  const esito = { ok: false, modelli: [], ms: 0, errore: '' };
  try {
    const tipo = AI_TIPI[f.tipo] || AI_TIPI.compatibile;
    const chiave = tipo.chiave ? await _aiLeggiChiave(f.id) : '';
    const r = await fetch(_aiUrl(f) + '/models', { headers: chiave ? { Authorization: 'Bearer ' + chiave } : {} });
    if (r.ok) {
      const d = await r.json();
      esito.modelli = ((d && d.data) || []).map((m) => m.id).sort();
    }
    const t0 = performance.now();
    const risposta = await _aiChiamaUno(
      f,
      { messages: [{ role: 'user', content: 'Rispondi solo con la parola: pronto' }], max_tokens: 400, temperature: 0 },
      'testo',
    );
    esito.ms = Math.round(performance.now() - t0);
    esito.risposta = risposta.slice(0, 80);
    esito.ok = true;
  } catch (e) {
    esito.errore = e.message;
  }
  return esito;
}

// ---------------- IMPOSTAZIONI (solo amministratore) ----------------
function renderAiFornitoriUI() {
  const el = document.getElementById('ai-fornitori-ui');
  if (!el) return;
  const riga = (f) => {
    const tipo = AI_TIPI[f.tipo] || AI_TIPI.compatibile;
    const attivo = f.id === _aiConf.attivo;
    const riserva = f.id === _aiConf.riserva;
    const chiave = !tipo.chiave ? 'non serve' : _aiChiavi[f.id] ? 'salvata' : 'da inserire';
    return (
      '<div class="tipo-item ai-riga' +
      (attivo ? ' ai-attivo' : '') +
      '"><div class="ai-info"><div class="ai-nome">' +
      escP(f.nome) +
      (attivo ? ' <span class="mini-badge ai-badge">In uso</span>' : '') +
      (riserva ? ' <span class="mini-badge ai-badge-ris">Riserva</span>' : '') +
      '</div><div class="ai-dett">' +
      escP(tipo.etichetta) +
      ' · ' +
      escP(f.url || '-') +
      '<br>Modelli: testi <b>' +
      escP((f.modelli && f.modelli.testo) || '-') +
      '</b> · moduli <b>' +
      escP((f.modelli && f.modelli.json) || '-') +
      '</b> · chiave: ' +
      chiave +
      '</div><div class="ai-esito" id="ai-esito-' +
      escP(f.id) +
      '"></div></div><div class="ai-azioni">' +
      (attivo ? '' : '<button class="btn-secondario" onclick="aiUsa(\'' + _jsArg(f.id) + '\')">Usa</button>') +
      '<button class="btn-secondario" onclick="aiProvaUI(\'' +
      _jsArg(f.id) +
      '\')">Prova</button><button class="btn-secondario" onclick="aiModifica(\'' +
      _jsArg(f.id) +
      '\')">Modifica</button>' +
      (_aiConf.fornitori.length > 1 && !attivo
        ? '<button class="btn-secondario btn-pericolo" onclick="aiElimina(\'' + _jsArg(f.id) + '\')">Elimina</button>'
        : '') +
      '</div></div>'
    );
  };
  el.innerHTML =
    '<div class="tipo-list">' +
    _aiConf.fornitori.map(riga).join('') +
    '</div><div class="add-tipo-row sez-form"><button class="btn-add-tipo" onclick="aiModifica(\'\')">+ Aggiungi fornitore</button>' +
    '<div class="field"><label>Riserva se il fornitore in uso non risponde</label><select onchange="aiImpostaRiserva(this.value)"><option value="">Nessuna</option>' +
    _aiConf.fornitori
      .filter((f) => f.id !== _aiConf.attivo)
      .map(
        (f) =>
          '<option value="' +
          escP(f.id) +
          '"' +
          (f.id === _aiConf.riserva ? ' selected' : '') +
          '>' +
          escP(f.nome) +
          '</option>',
      )
      .join('') +
    '</select></div></div>';
}
async function _aiSalvaConfig(azione) {
  await setImp('ai_fornitori', JSON.stringify(_aiConf.fornitori));
  await setImp('ai_fornitore_attivo', _aiConf.attivo);
  await setImp('ai_fornitore_riserva', _aiConf.riserva || '');
  if (azione) logAzione('Intelligenza artificiale', azione);
  groqKey = aiPronta() ? 'configurata' : '';
  renderAiFornitoriUI();
}
async function aiUsa(id) {
  const f = _aiFornitore(id);
  if (!f) return;
  _aiConf.attivo = id;
  if (_aiConf.riserva === id) _aiConf.riserva = '';
  if ((AI_TIPI[f.tipo] || {}).chiave) await _aiLeggiChiave(id);
  await _aiSalvaConfig('fornitore in uso: ' + f.nome);
  toast('Ora l intelligenza artificiale usa ' + f.nome);
}
async function aiImpostaRiserva(id) {
  _aiConf.riserva = id || '';
  const f = _aiFornitore(id);
  await _aiSalvaConfig('riserva: ' + (f ? f.nome : 'nessuna'));
}
async function aiElimina(id) {
  const f = _aiFornitore(id);
  if (!f || id === _aiConf.attivo) return;
  if (!(await chiediConferma('Eliminare il fornitore "' + f.nome + '"? La sua chiave viene cancellata.'))) return;
  _aiConf.fornitori = _aiConf.fornitori.filter((x) => x.id !== id);
  if (_aiConf.riserva === id) _aiConf.riserva = '';
  try {
    await _rpcSicura('set_ai_key', { p_token: getAdminToken(), p_fornitore: id, p_chiave: '' });
  } catch (e) {}
  delete _aiChiavi[id];
  await _aiSalvaConfig('fornitore eliminato: ' + f.nome);
}
async function aiProvaUI(id) {
  const out = document.getElementById('ai-esito-' + id);
  if (out) out.innerHTML = '<span class="ai-attesa">Prova in corso...</span>';
  const e = await aiProva(id);
  if (!out) return;
  out.innerHTML = e.ok
    ? '<span style="color:var(--c-verde)">Funziona: risposta in ' +
      (e.ms / 1000).toFixed(1) +
      ' s' +
      (e.modelli.length ? ' · modelli disponibili: ' + escP(e.modelli.slice(0, 12).join(', ')) : '') +
      '</span>'
    : '<span style="color:var(--c-rosso)">Non funziona: ' + escP(e.errore) + '</span>';
}
// finestra per aggiungere o modificare un fornitore
function aiModifica(id) {
  const f = _aiFornitore(id) || { id: '', nome: '', tipo: 'ollama', url: '', modelli: {}, json: true };
  const m = document.getElementById('pwd-modal');
  const mc = document.getElementById('pwd-modal-content');
  const opz = Object.keys(AI_TIPI)
    .map(
      (k) => '<option value="' + k + '"' + (k === f.tipo ? ' selected' : '') + '>' + AI_TIPI[k].etichetta + '</option>',
    )
    .join('');
  mc.innerHTML =
    '<h3>' +
    (id ? 'Modifica fornitore' : 'Nuovo fornitore AI') +
    '</h3><div class="ai-form">' +
    '<label>Tipo</label><select id="ai-f-tipo" onchange="_aiPreset(this.value)">' +
    opz +
    '</select>' +
    '<label>Nome</label><input type="text" id="ai-f-nome" value="' +
    escP(f.nome) +
    '" placeholder="es. Llama sul server">' +
    '<label>Indirizzo</label><input type="text" id="ai-f-url" value="' +
    escP(f.url) +
    '" placeholder="es. /ai/v1 oppure https://...">' +
    '<label>Modello per i testi</label><input type="text" id="ai-f-testo" value="' +
    escP((f.modelli && f.modelli.testo) || '') +
    '" placeholder="es. llama3.1:8b">' +
    '<label>Modello per i moduli (risposta strutturata)</label><input type="text" id="ai-f-json" value="' +
    escP((f.modelli && f.modelli.json) || '') +
    '">' +
    '<label class="ai-check"><input type="checkbox" id="ai-f-jsonok"' +
    (f.json !== false ? ' checked' : '') +
    '> Il server accetta la richiesta di risposta JSON</label>' +
    '<label id="ai-f-chiave-lbl">Chiave API' +
    (id ? ' (vuoto = resta quella salvata)' : '') +
    '</label><input type="password" id="ai-f-chiave" autocomplete="new-password">' +
    '<p class="ai-nota" id="ai-f-nota"></p></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="aiSalvaFornitore(\'' +
    _jsArg(id) +
    '\')">Salva</button></div>';
  m.classList.remove('hidden');
  _aiPreset(f.tipo, !!id);
}
function _aiPreset(tipo, soloVista) {
  const t = AI_TIPI[tipo] || AI_TIPI.compatibile;
  const val = (idc, v) => {
    const e = document.getElementById(idc);
    if (e && (!soloVista || !e.value)) e.value = v;
  };
  if (!soloVista) {
    val('ai-f-url', t.url);
    val('ai-f-testo', t.modelli.testo);
    val('ai-f-json', t.modelli.json);
    const cb = document.getElementById('ai-f-jsonok');
    if (cb) cb.checked = t.json;
  }
  const lbl = document.getElementById('ai-f-chiave-lbl');
  const k = document.getElementById('ai-f-chiave');
  if (lbl) lbl.style.display = t.chiave ? '' : 'none';
  if (k) k.style.display = t.chiave ? '' : 'none';
  const nota = document.getElementById('ai-f-nota');
  if (nota)
    nota.textContent =
      tipo === 'ollama'
        ? 'Sul server interno: indirizzo /ai/v1 (inoltro IIS verso Ollama). Il modello deve essere già scaricato (ollama pull). Dati e testi restano nel casino.'
        : tipo === 'lmstudio'
          ? 'Avviare il server di LM Studio e scrivere il nome del modello caricato.'
          : tipo === 'groq'
            ? 'Servizio esterno: i nomi dei collaboratori vengono sostituiti prima dell invio.'
            : 'Qualsiasi servizio con interfaccia chat/completions standard.';
}
async function aiSalvaFornitore(id) {
  const v = (x) => ((document.getElementById(x) || {}).value || '').trim();
  const tipo = v('ai-f-tipo');
  const nome = v('ai-f-nome');
  const url = v('ai-f-url');
  if (!nome || !url || !v('ai-f-testo')) {
    toast('Nome, indirizzo e modello per i testi sono obbligatori');
    return;
  }
  let nid = id;
  if (!nid) {
    nid =
      nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'ai';
    while (_aiFornitore(nid)) nid += '-2';
  }
  const f = {
    id: nid,
    nome,
    tipo,
    url,
    modelli: { testo: v('ai-f-testo'), json: v('ai-f-json') || v('ai-f-testo') },
    json: !!(document.getElementById('ai-f-jsonok') || {}).checked,
  };
  const chiave = v('ai-f-chiave');
  if (chiave) {
    try {
      await _rpcSicura('set_ai_key', { p_token: getAdminToken(), p_fornitore: nid, p_chiave: 'enc:' + _e(chiave) });
      _aiChiavi[nid] = chiave;
    } catch (e) {
      toastErrore('Chiave non salvata: ' + e.message);
      return;
    }
  }
  const i = _aiConf.fornitori.findIndex((x) => x.id === nid);
  if (i >= 0) _aiConf.fornitori[i] = f;
  else _aiConf.fornitori.push(f);
  if (!_aiConf.attivo) _aiConf.attivo = nid;
  document.getElementById('pwd-modal').classList.add('hidden');
  await _aiSalvaConfig((id ? 'fornitore modificato: ' : 'fornitore aggiunto: ') + nome);
  toast('Fornitore salvato: usa "Prova" per verificarlo');
}
