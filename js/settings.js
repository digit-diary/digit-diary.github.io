/**
 * Diario Collaboratori — Casino Lugano SA
 * File: settings.js
 * Impostazioni: visibilità, operatori, temi, campi
 */

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
    formazione: 'Formazione',
    piano: 'Piano di lavoro',
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
  // Permessi di MODIFICA: chi non è abilitato vede comunque i dati in sola lettura.
  // Default: solo admin. "Operatori selezionati" = es. l'operatore HR.
  permessi: {
    gestione_punti: 'Punti e premi — assegnare/registrare incentivi',
    gestione_impiego: 'Impiego — assegnare Jolly / Fisso ai collaboratori (es. supervisor)',
    gestione_categorie: 'Categorie — assegnare la categoria professionale 5ª–1ª (es. HR)',
    vista_categorie: 'Categorie — vedere la categoria dei collaboratori (badge in scheda, matrice e PDF)',
    gestione_competenze: 'Competenze — certificare le spunte in matrice',
    gestione_valutazioni: 'Valutazioni — inserire e importare schede',
    gestione_formazioni: 'Formazioni — registrare sessioni formative svolte (es. supervisor)',
    gestione_piano: 'Piano di lavoro — modificare la griglia turni del mese (es. supervisor)',
    gestione_corsi: 'Corsi — pianificare corsi nel piano: data, orario e partecipanti (es. supervisor)',
    gestione_briefing:
      'Briefing — compilare e modificare il foglio del giorno e le pause (senza toccare la griglia turni)',
    storico_hr: 'Storico HR — inizio contratto, tracciato categorie/premi/formazioni, equità (sezione riservata)',
  },
};
// Visione categorie: admin, chi le gestisce, chi ha lo Storico HR, o chi è abilitato apposta
function puoVedereCategorie() {
  return (
    isAdmin() || puoModificare('vista_categorie') || puoModificare('gestione_categorie') || puoModificare('storico_hr')
  );
}
// Permesso di modifica: default solo admin (a differenza delle pagine, default 'tutti')
// ---- Accessi extra: un operatore può accedere a sezioni scelte di ALTRI
// reparti (es. tavoli vede il Piano di slots), in sola lettura o anche in
// modifica. imp 'operatori_accessi_extra' =
//   { operatore: { reparto: { pagine: ['piano'] | 'tutte', modifica: false } } }
function _accessiExtraDi(op) {
  const cfg = window._operatoriAccessiExtra || {};
  return cfg[op] || null;
}
function _inRepartoExtra() {
  if (isAdmin()) return false;
  const op = getOperatore();
  const proprio = operatoriRepartoMap[op] || 'entrambi';
  if (proprio === 'entrambi' || proprio === currentReparto) return false;
  const extra = _accessiExtraDi(op);
  return !!(extra && extra[currentReparto]);
}
function _pagineExtraCorrenti() {
  // pagine visibili nel reparto extra corrente ('tutte' | lista), null se non in extra
  if (!_inRepartoExtra()) return null;
  const v = _accessiExtraDi(getOperatore())[currentReparto];
  if (v === 'tutte' || (v && v.pagine === 'tutte')) return 'tutte';
  if (Array.isArray(v)) return v; // retrocompatibilità col formato lista
  return v && Array.isArray(v.pagine) ? v.pagine : [];
}
function _extraPuoModificare() {
  const v = _accessiExtraDi(getOperatore())[currentReparto];
  return !!(v && v.modifica === true);
}
function puoModificare(key) {
  if (isAdmin()) return true;
  if (_inRepartoExtra() && !_extraPuoModificare()) return false; // extra in sola lettura
  const v = visibilitaConfig[key] || 'admin';
  if (v === 'admin' || v === 'nascosto') return false;
  if (typeof v === 'object' && v.tipo === 'selezionati') {
    const op = getOperatore();
    return !!(v.operatori && v.operatori.includes(op));
  }
  return true;
}
function visGet(key) {
  return visibilitaConfig[key] || 'tutti';
}
// Pagine che possono essere abilitate/disabilitate per singolo settore (Impostazioni → Settori)
const PAGINE_REPARTO = {
  rapporto: 'Rapporto',
  note_collega: 'Note Colleghi',
  statistiche: 'Statistiche',
  moduli: 'Moduli',
  formazione: 'Formazione',
  piano: 'Piano di lavoro',
  assistente: 'Assistente',
  consegna: 'Consegna',
  promemoria: 'Promemoria',
  maison: 'Maison',
  inventario: 'Inventario',
  registro: 'Registro',
};
function paginaAbilitataReparto(key, repKey) {
  if (!(key in PAGINE_REPARTO)) return true;
  const cfg = (typeof repartiPagineCfg !== 'undefined' && repartiPagineCfg) || {};
  const rc = cfg[repKey || currentReparto];
  if (!rc) return true;
  return rc[key] !== false;
}
function isVis(key) {
  if (!paginaAbilitataReparto(key)) return false;
  const extraPagine = typeof _pagineExtraCorrenti === 'function' ? _pagineExtraCorrenti() : null;
  if (extraPagine && extraPagine !== 'tutte' && !extraPagine.includes(key)) return false;
  // pagina concessa esplicitamente come accesso extra: la concessione vince
  // sulle regole di default (ma non su un "nascosto" esplicito)
  if (extraPagine && extraPagine !== 'tutte' && extraPagine.includes(key)) return visGet(key) !== 'nascosto';
  const v = visGet(key);
  // Piano di lavoro: sezione nuova, di default visibile solo ad admin
  // finché non viene configurata esplicitamente in Visibilità
  if (key === 'piano' && visibilitaConfig[key] == null) return isAdmin();
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
  // Pagine (incluse inventario e registro, che non hanno visibilità classica ma possono
  // essere disattivate per settore)
  Object.keys(VIS_ITEMS.pagine)
    .concat(['inventario', 'registro'])
    .forEach((k) => {
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
  html +=
    '<div style="margin:18px 0 4px"><strong style="font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Permessi di modifica</strong></div>';
  html +=
    '<p style="color:var(--muted);font-size:.8rem;margin-bottom:10px">Chi non è abilitato vede comunque punti, premi, categorie, competenze e valutazioni in sola lettura. Usa "Operatori selezionati" per delegare, ad esempio, all\'operatore HR.</p>';
  Object.entries(VIS_ITEMS.permessi).forEach(([k, label]) => {
    html +=
      '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-weight:600;margin-bottom:6px">' +
      label +
      '</div>';
    html += _visRadioHtml(k, visibilitaConfig[k] || 'admin', opList);
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
    // per i permessi di modifica il default (chiave assente) è 'admin', quindi 'tutti' va salvato esplicitamente
    if (val === 'tutti' && !(VIS_ITEMS.permessi && VIS_ITEMS.permessi[key])) delete visibilitaConfig[key];
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
    await sbRpc('add_operator', {
      p_nome: n,
      p_hash: h,
      p_token: getAdminToken(),
    });
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
// ---- Accessi extra: modal di configurazione per operatore ----
function apriAccessiExtra(nome) {
  if (!isAdmin()) return;
  const proprio = operatoriRepartoMap[nome] || 'entrambi';
  if (proprio === 'entrambi') {
    toast(nome + ' vede già tutti i reparti');
    return;
  }
  const cfg = (window._operatoriAccessiExtra || {})[nome] || {};
  const altri = getReparti().filter((r) => r.key !== proprio);
  const pagineDisponibili = [['diario', 'Diario']].concat(
    Object.keys(VIS_ITEMS.pagine).map((k) => [k, VIS_ITEMS.pagine[k]]),
    [
      ['inventario', 'Inventario'],
      ['registro', 'Registro'],
    ],
  );
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Accessi extra — ' +
    escP(nome) +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Reparto principale: <b>' +
    escP(repartoLabel(proprio)) +
    '</b>. Concedi l\'accesso a sezioni di altri reparti: tutte, oppure solo quelle che spunti. Senza "può modificare" l\'accesso è in sola lettura.</p>' +
    '<div style="max-height:52vh;overflow:auto;text-align:left">';
  altri.forEach((r) => {
    const v = cfg[r.key];
    const modalita = !v ? 'nessuno' : v === 'tutte' || (v && v.pagine === 'tutte') ? 'tutte' : 'scelte';
    const pagineAttive = Array.isArray(v) ? v : (v && Array.isArray(v.pagine) && v.pagine) || [];
    const modifica = !!(v && v.modifica === true);
    h +=
      '<div style="border:1px solid var(--line);border-left:4px solid ' +
      repartoColore(r.key) +
      ';border-radius:3px;padding:10px 12px;margin-bottom:10px">' +
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><b style="min-width:80px;color:' +
      repartoColore(r.key) +
      '">' +
      escP(r.label) +
      '</b>' +
      '<select id="ae-mod-sel-' +
      r.key +
      '" onchange="document.getElementById(\'ae-pagine-' +
      r.key +
      "').style.display=this.value==='scelte'?'flex':'none'\" style=\"padding:5px 8px\">" +
      '<option value="nessuno"' +
      (modalita === 'nessuno' ? ' selected' : '') +
      '>Nessun accesso</option><option value="scelte"' +
      (modalita === 'scelte' ? ' selected' : '') +
      '>Solo sezioni scelte</option><option value="tutte"' +
      (modalita === 'tutte' ? ' selected' : '') +
      '>Tutte le sezioni</option></select>' +
      '<label style="font-size:.8rem"><input type="checkbox" id="ae-scrivi-' +
      r.key +
      '"' +
      (modifica ? ' checked' : '') +
      '> può anche modificare</label></div>' +
      '<div id="ae-pagine-' +
      r.key +
      '" style="display:' +
      (modalita === 'scelte' ? 'flex' : 'none') +
      ';gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px dashed var(--line)">' +
      pagineDisponibili
        .map(
          ([k, lbl]) =>
            '<label style="font-size:.78rem;background:var(--paper2);padding:3px 8px;border-radius:10px;border:1px solid var(--line)"><input type="checkbox" class="ae-pag-' +
            r.key +
            '" value="' +
            k +
            '"' +
            (pagineAttive.includes(k) ? ' checked' : '') +
            '> ' +
            escP(lbl) +
            '</label>',
        )
        .join('') +
      '</div></div>';
  });
  h +=
    '</div><div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaAccessiExtra(\'' +
    nome.replace(/'/g, "\\'") +
    '\')">Salva</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaAccessiExtra(nome) {
  if (!isAdmin()) return;
  const proprio = operatoriRepartoMap[nome] || 'entrambi';
  const cfg = {};
  getReparti()
    .filter((r) => r.key !== proprio)
    .forEach((r) => {
      const modalita = (document.getElementById('ae-mod-sel-' + r.key) || {}).value;
      const mod = (document.getElementById('ae-scrivi-' + r.key) || {}).checked;
      if (modalita === 'tutte') cfg[r.key] = { pagine: 'tutte', modifica: !!mod };
      else if (modalita === 'scelte') {
        const scelte = [...document.querySelectorAll('.ae-pag-' + r.key + ':checked')].map((x) => x.value);
        if (scelte.length) cfg[r.key] = { pagine: scelte, modifica: !!mod };
      }
    });
  window._operatoriAccessiExtra = window._operatoriAccessiExtra || {};
  if (Object.keys(cfg).length) window._operatoriAccessiExtra[nome] = cfg;
  else delete window._operatoriAccessiExtra[nome];
  await setImp('operatori_accessi_extra', JSON.stringify(window._operatoriAccessiExtra));
  localStorage.setItem('_cache_operatori_accessi_extra', JSON.stringify(window._operatoriAccessiExtra));
  logAzione(
    'Accessi extra operatore',
    nome +
      ': ' +
      (Object.keys(cfg)
        .map(
          (k) =>
            k +
            '=' +
            (cfg[k].pagine === 'tutte' ? 'tutte' : cfg[k].pagine.join('+')) +
            (cfg[k].modifica ? ' (modifica)' : ' (lettura)'),
        )
        .join(', ') || 'nessuno'),
  );
  document.getElementById('pwd-modal').classList.add('hidden');
  toast('Accessi extra salvati per ' + nome);
  renderOperatoriUI();
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
  const res = await sbRpc('change_op_pwd', {
    p_nome: op,
    p_old_hash: oh,
    p_new_hash: nh,
    p_old_legacy_hash: ohL,
  });
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
            rep === 'entrambi' || !getRepartoInfo(rep)
              ? '<span class="mini-badge" style="background:var(--accent2)">Tutti</span>'
              : '<span class="mini-badge" style="background:' +
                repartoColore(rep) +
                '">' +
                escP(repartoLabel(rep)) +
                '</span>';
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
              ? '<button class="btn-del-tipo" style="color:#1a4a7a;border-color:#1a4a7a" onclick="apriAccessiExtra(\'' +
                ne +
                '\')">Accessi extra' +
                (Object.keys((window._operatoriAccessiExtra || {})[n] || {}).length
                  ? ' (' + Object.keys((window._operatoriAccessiExtra || {})[n] || {}).length + ')'
                  : '') +
                '</button><select onchange="cambiaRepartoOperatore(\'' +
                ne +
                '\',this.value)" style="font-size:.75rem;padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
                opzioniRepartoHtml(rep, true) +
                '</select>'
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
// Tutti i campi configurati (per il pannello Impostazioni)
function getCampiRapportoTutti() {
  let list = [
    ...CAMPI_RAPPORTO_DEFAULT.filter((c) => !campiNascosti.includes(c.key)).map((c) =>
      campiLabelOverride[c.key] ? { ...c, label: campiLabelOverride[c.key] } : c,
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
// Campi del rapporto per il SETTORE corrente: ogni campo può essere limitato
// ad alcuni settori (campiReparti); senza limite appare ovunque
function getCampiRapporto() {
  return getCampiRapportoTutti().filter((c) => {
    const rr = campiReparti[c.key];
    return !Array.isArray(rr) || !rr.length || rr.includes(currentReparto);
  });
}
function campoInReparto(key, repKey) {
  const rr = campiReparti[key];
  return !Array.isArray(rr) || !rr.length || rr.includes(repKey);
}
async function toggleCampoReparto(key, repKey, attivo) {
  const tuttiRep = getReparti().map((r) => r.key);
  let rr = Array.isArray(campiReparti[key]) && campiReparti[key].length ? campiReparti[key].slice() : tuttiRep.slice();
  rr = attivo ? [...new Set([...rr, repKey])] : rr.filter((k) => k !== repKey);
  if (!rr.length) {
    toast('Il campo deve restare visibile in almeno un settore');
    renderCampiRapportoUI();
    return;
  }
  // se copre tutti i settori torna al default "ovunque" (robusto ai settori futuri)
  if (tuttiRep.every((k) => rr.includes(k))) delete campiReparti[key];
  else campiReparti[key] = rr;
  await setImp('campi_rapporto_reparti', JSON.stringify(campiReparti));
  logAzione('Campi rapporto', key + ' → settori: ' + (campiReparti[key] ? campiReparti[key].join(',') : 'tutti'));
  renderCampiRapportoUI();
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
  if (getCampiRapportoTutti().find((c) => c.label.toLowerCase() === n.toLowerCase())) {
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
  const campi = getCampiRapportoTutti().map((c) => c.key);
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
  const campi = getCampiRapportoTutti();
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
  const campi = getCampiRapportoTutti();
  const adm = isAdmin();
  const reps = getReparti();
  const settoriHtml = (key) =>
    adm
      ? '<span style="display:inline-flex;gap:8px;margin-left:10px;flex-wrap:wrap">' +
        reps
          .map(
            (r) =>
              '<label style="display:inline-flex;align-items:center;gap:3px;font-size:.72rem;color:var(--muted);cursor:pointer" title="Il campo appare nel rapporto di questo settore"><input type="checkbox"' +
              (campoInReparto(key, r.key) ? ' checked' : '') +
              ' onchange="toggleCampoReparto(\'' +
              key +
              "','" +
              r.key +
              '\',this.checked)">' +
              escP(r.label) +
              '</label>',
          )
          .join('') +
        '</span>'
      : '';
  let cHtml = campi
    .map((c, idx) => {
      const isDefault = CAMPI_RAPPORTO_DEFAULT.find((d) => d.key === c.key);
      return (
        '<div class="tipo-item"><div class="tipo-color" style="background:' +
        (c.type === 'number' ? '#3498db' : '#2ecc71') +
        '"></div><div class="tipo-item-name">' +
        escP(c.label) +
        (isDefault ? ' <span class="tipo-item-default">(predefinito)</span>' : '') +
        settoriHtml(c.key) +
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
  document.getElementById('btn-tema').innerHTML = isDark
    ? '<i class="icx icx-sole"></i> Tema chiaro'
    : '<i class="icx icx-luna"></i> Tema scuro';
}
function applicaTemaOperatore() {
  const t = localStorage.getItem(getTemaKey()) || localStorage.getItem('tema') || 'light';
  if (t === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('btn-tema').innerHTML = '<i class="icx icx-sole"></i> Tema chiaro';
  } else {
    document.body.classList.remove('dark-theme');
    document.getElementById('btn-tema').innerHTML = '<i class="icx icx-luna"></i> Tema scuro';
  }
}

// NAVIGATION

// ================================================================
// PERSONALIZZAZIONI ADMIN: valori buoni Maison + backup completo
// ================================================================
async function salvaBuonoValori() {
  const nuovi = {};
  for (const k of ['BU', 'BL', 'CG', 'WL']) {
    const v = parseFloat((document.getElementById('buono-' + k.toLowerCase() + '-input') || {}).value);
    if (!(v > 0)) {
      toast('Inserisci un valore valido per ' + k);
      return;
    }
    nuovi[k] = v;
  }
  Object.assign(BUONO_VALORI, nuovi);
  await setImp('buono_valori', JSON.stringify(nuovi));
  logAzione(
    'Valori buoni Maison',
    'BU ' + nuovi.BU + ' / BL ' + nuovi.BL + ' / CG ' + nuovi.CG + ' / WL ' + nuovi.WL + ' CHF',
  );
  toast('Valori buoni salvati');
}

// Backup completo di tutti i dati in un file JSON scaricabile (solo admin)
const _TABELLE_BACKUP = [
  'registrazioni',
  'note_fissate',
  'scadenze',
  'collaboratori',
  'moduli',
  'log_attivita',
  'costi_maison',
  'maison_budget',
  'promemoria',
  'consegne_turno',
  'spese_extra',
  'regali_maison',
  'note_clienti',
  'rapporti_giornalieri',
  'impostazioni',
  'inventario',
  'valutazioni',
  'punti_eventi',
  'hr_eventi',
  'chat_groups',
  'chat_group_members',
  'chat_messages',
  'piano',
  'piano_turni',
  'piano_codici',
  'piano_fabbisogni',
  'piano_regole',
  'piano_festivi',
  'piano_timbrature',
  'piano_mappature',
  'piano_vacanze',
  'piano_regole_gruppo',
  'piano_formulari',
  'piano_briefing',
];
async function esportaBackupCompleto() {
  if (!isAdmin()) {
    toast('Solo admin');
    return;
  }
  const st = document.getElementById('backup-status');
  if (st) st.textContent = 'Esportazione in corso...';
  try {
    const dati = {};
    let totale = 0;
    for (const t of _TABELLE_BACKUP) {
      dati[t] = await secGet(t + '?limit=100000');
      totale += (dati[t] || []).length;
    }
    const backup = {
      app: 'Diario Collaboratori — Casino Lugano SA',
      esportato_il: new Date().toISOString(),
      esportato_da: getOperatore(),
      tabelle: dati,
    };
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'diario_backup_' + new Date().toISOString().split('T')[0] + '.json',
    }).click();
    logAzione('Backup completo esportato', totale + ' record, ' + _TABELLE_BACKUP.length + ' tabelle');
    await setImp('backup_ultimo', new Date().toISOString());
    _aggiornaBackupInfo();
    if (st) st.textContent = 'Backup scaricato: ' + totale + ' record da ' + _TABELLE_BACKUP.length + ' tabelle.';
    toast('Backup completo scaricato');
  } catch (e) {
    console.error(e);
    if (st) st.textContent = "Errore durante l'esportazione.";
    toast('Errore esportazione backup');
  }
}

// ---- BACKUP AUTOMATICO: all'accesso admin, se l'ultimo backup e' piu'
// vecchio di N giorni (configurabile, 0 = off) il file si scarica da solo ----
async function _backupAutoCheck() {
  if (!isAdmin()) return;
  try {
    const giorni = parseInt(await getImp('backup_auto_giorni'));
    const nGiorni = isNaN(giorni) ? 7 : giorni; // default: settimanale
    _aggiornaBackupInfo();
    if (!nGiorni) return;
    const ultimo = await getImp('backup_ultimo');
    const etaMs = ultimo ? Date.now() - new Date(ultimo).getTime() : Infinity;
    if (etaMs < nGiorni * 24 * 3600 * 1000) return;
    toast(
      'Backup automatico in corso (ultimo: ' + (ultimo ? new Date(ultimo).toLocaleDateString('it-IT') : 'mai') + ')',
    );
    await esportaBackupCompleto();
  } catch (e) {}
}
async function _aggiornaBackupInfo() {
  try {
    const el = document.getElementById('backup-ultimo-info');
    const inp = document.getElementById('backup-auto-giorni');
    const ultimo = await getImp('backup_ultimo');
    const giorni = parseInt(await getImp('backup_auto_giorni'));
    if (inp && !inp.dataset.init) {
      inp.value = isNaN(giorni) ? 7 : giorni;
      inp.dataset.init = '1';
    }
    if (el)
      el.textContent = ultimo
        ? 'Ultimo backup: ' +
          new Date(ultimo).toLocaleDateString('it-IT') +
          ' ' +
          new Date(ultimo).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : 'Nessun backup registrato finora.';
  } catch (e) {}
}
async function salvaBackupAutoGiorni(v) {
  if (!isAdmin()) return;
  const n = Math.max(0, Math.min(90, parseInt(v) || 0));
  await setImp('backup_auto_giorni', String(n));
  logAzione('Backup automatico', n ? 'ogni ' + n + ' giorni' : 'disattivato');
  toast(n ? 'Backup automatico: ogni ' + n + ' giorni' : 'Backup automatico disattivato');
}
// ================================================================
// SETTORI (admin): aggiungi/rinomina/colore/disattiva + pagine per settore
// ================================================================
function renderSettoriUI() {
  const el = document.getElementById('settori-list');
  if (!el || !isAdmin()) return;
  let html =
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:10px">Qui decidi <b>quali pagine esistono</b> in ogni settore (spunte sotto a ogni settore). <b>Chi</b> le vede o le modifica si regola invece in «Visibilità pagine e funzioni».</p>';
  getRepartiTutti().forEach((r) => {
    const custom = !r.fisso;
    const disattivo = custom && r.attivo === false;
    const nDati =
      collaboratoriCache.filter((c) => c.reparto_dip === r.key).length +
      datiCache.filter((d) => d.reparto_dip === r.key).length;
    html +=
      '<div style="padding:12px 0;border-bottom:1px solid var(--line)' +
      (disattivo ? ';opacity:.55' : '') +
      '"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">';
    html +=
      '<span class="mini-badge" style="background:' + r.colore + ';font-size:.78rem">' + escP(r.label) + '</span>';
    if (custom) {
      html +=
        '<input type="text" id="settore-label-' +
        r.key +
        '" value="' +
        escP(r.label) +
        '" style="width:150px;padding:5px 10px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink);font-size:.84rem">';
    } else {
      html += '<span style="font-size:.78rem;color:var(--muted)">settore di base (fisso)</span>';
    }
    html +=
      '<input type="color" id="settore-colore-' +
      r.key +
      '" value="' +
      (r.colore || '#8a7d6b') +
      '" style="width:40px;height:30px;border:1px solid var(--line);border-radius:2px;cursor:pointer;background:var(--paper2)">';
    html +=
      '<button class="btn-add-tipo" onclick="salvaSettore(\'' + r.key + '\')" style="padding:6px 14px">Salva</button>';
    if (custom) {
      html +=
        '<button class="btn-del-tipo" onclick="toggleAttivoSettore(\'' +
        r.key +
        '\')" style="margin-left:4px">' +
        (disattivo ? 'Riattiva' : 'Disattiva') +
        '</button>';
      if (nDati) html += '<span style="font-size:.72rem;color:var(--muted)">' + nDati + ' record collegati</span>';
    }
    html += '</div>';
    // pagine abilitate per questo settore
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;padding-left:4px">';
    Object.entries(PAGINE_REPARTO).forEach(([pk, plabel]) => {
      html +=
        '<label style="display:flex;align-items:center;gap:4px;font-size:.78rem;color:var(--muted);cursor:pointer"><input type="checkbox"' +
        (paginaAbilitataReparto(pk, r.key) ? ' checked' : '') +
        ' onchange="salvaPaginaSettore(\'' +
        r.key +
        "','" +
        pk +
        '\',this.checked)"> ' +
        plabel +
        '</label>';
    });
    html += '</div></div>';
  });
  html +=
    '<div class="add-tipo-row" style="margin-top:12px;align-items:flex-end"><div class="field"><label>Nuovo settore</label><input type="text" id="nuovo-settore-nome" placeholder="Es: Bar, Sicurezza, Reception..."></div><div class="field"><label>Colore</label><input type="color" id="nuovo-settore-colore" value="#b8860b" style="width:50px;height:38px;border:1px solid var(--line);border-radius:2px;cursor:pointer;background:var(--paper2)"></div><button class="btn-add-tipo" onclick="aggiungiSettore()">+ Aggiungi settore</button></div>';
  el.innerHTML = html;
}
async function _salvaRepartiConfig() {
  await setImp('reparti_config', JSON.stringify(getRepartiCustom()));
  _salvaCacheReparti();
  if (typeof renderRepartoSwitch === 'function') renderRepartoSwitch();
  if (typeof applicaVisibilita === 'function') applicaVisibilita();
  if (typeof aggiornaMenuMobile === 'function') aggiornaMenuMobile();
  popolaLoginSettore();
}
async function aggiungiSettore() {
  const nome = ((document.getElementById('nuovo-settore-nome') || {}).value || '').trim();
  const colore = (document.getElementById('nuovo-settore-colore') || {}).value || '#b8860b';
  if (!nome) {
    toast('Inserisci il nome del settore');
    return;
  }
  const key = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!key || key === 'entrambi' || getRepartiTutti().some((r) => r.key === key)) {
    toast('Settore già esistente o nome non valido');
    return;
  }
  repartiConfig = [...getRepartiCustom(), { key, label: nome, colore, attivo: true }];
  await _salvaRepartiConfig();
  logAzione('Settore aggiunto', nome);
  renderSettoriUI();
  toast('Settore "' + nome + '" creato');
}
async function salvaSettore(key) {
  const lista = getRepartiCustom();
  const r = lista.find((x) => x.key === key);
  const colore = (document.getElementById('settore-colore-' + key) || {}).value;
  if (r) {
    const label = ((document.getElementById('settore-label-' + key) || {}).value || '').trim();
    if (label) r.label = label;
    if (colore) r.colore = colore;
    repartiConfig = lista;
  } else {
    // settore base: solo colore
    const base = REPARTI_BASE.find((x) => x.key === key);
    if (base && colore) base.colore = colore;
  }
  await _salvaRepartiConfig();
  logAzione('Settore modificato', key);
  renderSettoriUI();
  toast('Settore salvato');
}
async function toggleAttivoSettore(key) {
  const lista = getRepartiCustom();
  const r = lista.find((x) => x.key === key);
  if (!r) return;
  const disattiva = r.attivo !== false;
  if (disattiva) {
    const nDati =
      collaboratoriCache.filter((c) => c.reparto_dip === key).length +
      datiCache.filter((d) => d.reparto_dip === key).length;
    if (
      !confirm(
        'Disattivare il settore "' +
          r.label +
          '"?\n\nSparisce dallo switch e dai menu ma NESSUN dato viene toccato' +
          (nDati ? ' (' + nDati + ' record restano al sicuro)' : '') +
          '. Puoi riattivarlo quando vuoi.',
      )
    )
      return;
  }
  r.attivo = !disattiva ? true : false;
  repartiConfig = lista;
  if (currentReparto === key && disattiva) currentReparto = 'slots';
  await _salvaRepartiConfig();
  logAzione('Settore ' + (disattiva ? 'disattivato' : 'riattivato'), r.label);
  renderSettoriUI();
  toast('Settore ' + (disattiva ? 'disattivato' : 'riattivato'));
}
async function salvaPaginaSettore(repKey, pageKey, abilitata) {
  if (!repartiPagineCfg || typeof repartiPagineCfg !== 'object') repartiPagineCfg = {};
  if (!repartiPagineCfg[repKey]) repartiPagineCfg[repKey] = {};
  if (abilitata) delete repartiPagineCfg[repKey][pageKey];
  else repartiPagineCfg[repKey][pageKey] = false;
  if (!Object.keys(repartiPagineCfg[repKey]).length) delete repartiPagineCfg[repKey];
  await setImp('reparti_pagine', JSON.stringify(repartiPagineCfg));
  logAzione('Pagine settore', repartoLabel(repKey) + ' — ' + pageKey + ': ' + (abilitata ? 'attiva' : 'disattivata'));
  if (typeof applicaVisibilita === 'function') applicaVisibilita();
  if (typeof aggiornaMenuMobile === 'function') aggiornaMenuMobile();
  toast(
    (abilitata ? 'Attivata' : 'Disattivata') +
      ' "' +
      (PAGINE_REPARTO[pageKey] || pageKey) +
      '" per ' +
      repartoLabel(repKey),
  );
}

// ================================================================
// PREMIO GIUBILEO (admin): scaglioni anni di servizio → importo CHF
// ================================================================
function renderGiubileoUI() {
  const el = document.getElementById('giubileo-list');
  if (!el || !isAdmin()) return;
  const cfg = getGiubileoConfig();
  el.innerHTML = cfg.length
    ? cfg
        .map(
          (g, i) =>
            '<div class="tipo-item"><div class="tipo-item-name">' +
            g.anni +
            ' anni di servizio</div><input type="number" value="' +
            g.importo +
            '" min="0" step="50" onchange="modificaGiubileo(' +
            i +
            ',this.value)" style="width:110px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"> <span style="font-size:.8rem;color:var(--muted)">CHF</span><button class="btn-del-tipo" style="margin-left:6px" onclick="rimuoviGiubileo(' +
            i +
            ')">Rimuovi</button></div>',
        )
        .join('')
    : '<p style="color:var(--muted);font-size:.84rem">Nessuno scaglione configurato.</p>';
}
async function _salvaGiubileoConfig(cfg) {
  giubileoConfig = cfg;
  await setImp('giubileo_config', JSON.stringify(cfg));
  renderGiubileoUI();
}
async function aggiungiGiubileo() {
  const anni = parseInt((document.getElementById('giubileo-anni-input') || {}).value);
  const importo = parseFloat((document.getElementById('giubileo-importo-input') || {}).value);
  if (!(anni > 0) || !(importo >= 0)) {
    toast('Inserisci anni e importo validi');
    return;
  }
  const cfg = getGiubileoConfig();
  if (cfg.some((g) => g.anni === anni)) {
    toast('Scaglione già esistente');
    return;
  }
  cfg.push({ anni, importo });
  await _salvaGiubileoConfig(cfg.sort((a, b) => a.anni - b.anni));
  logAzione('Giubileo: scaglione aggiunto', anni + ' anni = ' + fmtCHF(importo) + ' CHF');
  toast('Scaglione ' + anni + ' anni aggiunto');
}
async function modificaGiubileo(idx, val) {
  const cfg = getGiubileoConfig();
  const n = parseFloat(val);
  if (!cfg[idx] || !(n >= 0)) return;
  cfg[idx].importo = n;
  await _salvaGiubileoConfig(cfg);
  logAzione('Giubileo: importo modificato', cfg[idx].anni + ' anni = ' + fmtCHF(n) + ' CHF');
  toast('Importo aggiornato');
}
async function rimuoviGiubileo(idx) {
  const cfg = getGiubileoConfig();
  if (!cfg[idx]) return;
  if (!confirm('Rimuovere lo scaglione ' + cfg[idx].anni + ' anni?')) return;
  const rimosso = cfg.splice(idx, 1)[0];
  await _salvaGiubileoConfig(cfg);
  logAzione('Giubileo: scaglione rimosso', rimosso.anni + ' anni');
}

async function salvaGiubileoPreavviso(val) {
  const g = parseInt(val) || 0;
  giubileoPreavviso = g;
  await setImp('giubileo_preavviso', String(g));
  logAzione('Giubileo: preavviso notifica', g ? g + ' giorni' : 'disattivato');
  toast(g ? 'Notifica giubileo: ' + g + ' giorni prima' : 'Notifica giubileo disattivata');
}

// ================================================================
// SEZIONI RICHIUDIBILI: le sezioni di Impostazioni (e la config admin
// di Formazione) si aprono/chiudono cliccando sul titolo; lo stato
// viene ricordato per dispositivo. Default: tutte chiuse (pagina pulita).
// ================================================================
function initSezioniRichiudibili(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  let aperte = {};
  try {
    aperte = JSON.parse(localStorage.getItem('_sezioni_aperte') || '{}');
  } catch (e) {}
  // da OPERATORE le sezioni solo-admin non compaiono (sono inutilizzabili);
  // restano Gestione Collaboratori (si regola coi suoi permessi) e Sicurezza
  // (impronta del dispositivo, personale)
  if (rootId === 'page-impostazioni' && !isAdmin()) {
    const perOperatori = ['Gestione Collaboratori', 'Sicurezza'];
    root.querySelectorAll('.settings-section').forEach((sec) => {
      const h = sec.querySelector(':scope > h4');
      if (!h) return;
      const titolo = (h.childNodes[0].textContent || '').trim();
      if (!perOperatori.includes(titolo)) sec.style.display = 'none';
    });
  }
  // indice rapido in cima: un chip per ogni sezione VISIBILE, clic = apre e scorre lì
  {
    const vecchio = document.getElementById(rootId + '-indice');
    if (vecchio) vecchio.remove();
    const sezioni = [...root.querySelectorAll('.settings-section')].filter(
      (s) => s.querySelector(':scope > h4') && s.style.display !== 'none',
    );
    if (sezioni.length > 5) {
      const nav = document.createElement('div');
      nav.id = rootId + '-indice';
      nav.className = 'settings-indice';
      sezioni.forEach((sec) => {
        const titolo = (sec.querySelector(':scope > h4').childNodes[0].textContent || '').trim();
        if (!titolo) return;
        const chip = document.createElement('span');
        chip.className = 'settings-indice-chip';
        chip.textContent = titolo;
        chip.onclick = () => {
          sec.classList.remove('sec-collapsed');
          sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        nav.appendChild(chip);
      });
      root.insertBefore(nav, root.firstElementChild);
    }
  }
  root.querySelectorAll('.settings-section').forEach((sec, i) => {
    const h = sec.querySelector(':scope > h4');
    if (!h) return;
    const key = rootId + ':' + (sec.id || 'sec_' + i);
    if (!h.querySelector('.sec-chev')) h.insertAdjacentHTML('beforeend', '<span class="sec-chev">&#9660;</span>');
    sec.classList.toggle('sec-collapsed', !aperte[key]);
    if (h.dataset.accInit) return;
    h.dataset.accInit = '1';
    h.addEventListener('click', (e) => {
      if (e.target.closest('button, input, select, a, label')) return;
      sec.classList.toggle('sec-collapsed');
      aperte[key] = !sec.classList.contains('sec-collapsed');
      try {
        localStorage.setItem('_sezioni_aperte', JSON.stringify(aperte));
      } catch (err) {}
    });
  });
}

// Card richiudibili (es. pagina Formazione): titolo cliccabile, stato ricordato.
// aperteDefault = elenco di prefissi dei titoli aperti al primo utilizzo.
function initCardRichiudibili(rootId, aperteDefault) {
  const root = document.getElementById(rootId);
  if (!root) return;
  let stato = {};
  try {
    stato = JSON.parse(localStorage.getItem('_sezioni_aperte') || '{}');
  } catch (e) {}
  root.querySelectorAll('.main-card').forEach((card) => {
    const h = card.querySelector(':scope > .card-header');
    if (!h) return;
    const titolo = (h.textContent || '').trim();
    const key = rootId + ':card:' + titolo.substring(0, 30);
    if (!h.querySelector('.sec-chev')) h.insertAdjacentHTML('beforeend', '<span class="sec-chev">&#9660;</span>');
    const aperta =
      key in stato ? stato[key] : (aperteDefault || []).some((p) => titolo.toLowerCase().startsWith(p.toLowerCase()));
    card.classList.toggle('card-collapsed', !aperta);
    if (h.dataset.accInit) return;
    h.dataset.accInit = '1';
    h.addEventListener('click', (e) => {
      if (e.target.closest('button, input, select, a, label')) return;
      card.classList.toggle('card-collapsed');
      stato[key] = !card.classList.contains('card-collapsed');
      try {
        localStorage.setItem('_sezioni_aperte', JSON.stringify(stato));
      } catch (err) {}
    });
  });
}
