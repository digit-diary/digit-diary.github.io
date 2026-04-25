/**
 * Diario Collaboratori — Casino Lugano SA
 * File: settings.js
 * Impostazioni: visibilita, operatori, temi, campi rapporto
 * Righe: 624
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
