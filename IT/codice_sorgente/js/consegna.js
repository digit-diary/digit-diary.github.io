/**
 * Diario Collaboratori — Casino Lugano SA
 * File: consegna.js
 * Righe originali: 423
 * Estratto automaticamente da index.html
 */
// SEZIONE 11: CONSEGNA TURNO
// Passaggio consegne tra turni con multi-destinatario
// ================================================================
// CONSEGNA TURNO
// ========================
async function initConsegnaUI() {
  const turno = _getTurnoCorrente();
  const sel = document.getElementById('cons-turno');
  if (sel) sel.value = turno;
  // Default destinatari "tutti" (il widget custom multi-select gestisce la selezione)
  const hidden = document.getElementById('cons-destinatario');
  if (!hidden) return;
  const ops = operatoriAuthCache
    .map((o) => o.nome)
    .filter((n) => {
      const rep = operatoriRepartoMap[n] || 'entrambi';
      return rep === currentReparto || rep === 'entrambi';
    })
    .sort();
  // Carica rapporto di oggi se non in cache
  const oggi = getGiornataCasino();
  if (!rapportiCache[oggi]) {
    try {
      const rData = await secGet('rapporti_giornalieri?data_rapporto=eq.' + oggi + '&reparto_dip=eq.' + currentReparto);
      if (rData && rData.length) {
        if (!rapportiCache[oggi]) rapportiCache[oggi] = {};
        rData.forEach((r) => {
          rapportiCache[oggi][r.turno] = r;
        });
      }
    } catch (e) {}
  }
  // Cerca supervisore dell'altro turno dal rapporto giornaliero (suggerimento default)
  let suggerito = '';
  const rapp = rapportiCache[oggi] || {};
  if (turno === 'PRESTO') {
    if (rapp.NOTTE && rapp.NOTTE.sup_note) suggerito = rapp.NOTTE.sup_note.trim();
  } else {
    const domani = new Date(new Date(oggi + 'T12:00:00').getTime() + 86400000);
    const domaniStr =
      domani.getFullYear() +
      '-' +
      String(domani.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(domani.getDate()).padStart(2, '0');
    const rappD = rapportiCache[domaniStr] || {};
    if (rappD.PRESTO && rappD.PRESTO.sup_note) suggerito = rappD.PRESTO.sup_note.trim();
    if (!suggerito && rapp.PRESTO && rapp.PRESTO.sup_note) suggerito = rapp.PRESTO.sup_note.trim();
  }
  const sugMatch = suggerito ? matchCollaboratoreOps(suggerito, ops) : '';
  const btn = document.getElementById('cons-destinatario-btn');
  if (sugMatch) {
    // Pre-seleziona il supervisore suggerito come unico destinatario
    hidden.value = sugMatch;
    if (btn) btn.textContent = sugMatch + ' (suggerito dal rapporto)';
    toast('Destinatario suggerito: ' + sugMatch);
  } else {
    hidden.value = 'tutti';
    if (btn) btn.textContent = 'Tutti';
  }
}
function matchCollaboratoreOps(nome, ops) {
  nome = nome.toLowerCase();
  return (
    ops.find((n) => n.toLowerCase() === nome) ||
    ops.find((n) => {
      const w = n.toLowerCase().split(/\s+/);
      return w.some((p) => p === nome || nome === p);
    }) ||
    ops.find((n) => n.toLowerCase().includes(nome) || nome.includes(n.toLowerCase())) ||
    ''
  );
}
async function inviaConsegnaTurno() {
  const turno = document.getElementById('cons-turno').value;
  const msg = document.getElementById('cons-messaggio').value.trim();
  const priorita = document.getElementById('cons-priorita').value;
  if (!msg) {
    toast('Scrivi un messaggio di consegna');
    return;
  }
  const oggi = getGiornataCasino();
  const destinatario = document.getElementById('cons-destinatario').value;
  try {
    const rec = {
      data_giornata: oggi,
      turno_uscente: turno,
      operatore: getOperatore(),
      messaggio: msg,
      priorita,
      destinatario,
      reparto_dip: currentReparto,
    };
    const r = await secPost('consegne_turno', rec);
    consegneCache.unshift(r[0]);
    document.getElementById('cons-messaggio').value = '';
    logAzione('Consegna turno', turno + ' — ' + msg.substring(0, 50));
    renderConsegne();
    aggiornaConsegnaBadge();
    toast('Consegna inviata!');
    // Push: gestisci CSV multi-destinatario
    const pushDests =
      destinatario === 'tutti'
        ? ['tutti']
        : destinatario
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s);
    inviaPush(pushDests, 'Consegna ' + turno + ' da ' + getOperatore(), msg.substring(0, 120), 'consegna');
  } catch (e) {
    toast('Errore invio consegna');
  }
}
async function segnaConsegnaLetta(id) {
  const op = getOperatore();
  try {
    await secPatch('consegne_turno', 'id=eq.' + id, { letto_da: op, letto_at: new Date().toISOString() });
    const c = consegneCache.find((x) => x.id === id);
    if (c) {
      c.letto_da = op;
      c.letto_at = new Date().toISOString();
    }
    renderConsegne();
    aggiornaConsegnaBadge();
  } catch (e) {
    toast('Errore aggiornamento consegna');
  }
}
function renderConsegne() {
  const el = document.getElementById('consegne-list');
  if (!el) return;
  const op = getOperatore();
  const _consDal = (document.getElementById('cons-filt-dal') || {}).value || '';
  const _consAl = (document.getElementById('cons-filt-al') || {}).value || '';
  // Mostra solo: consegne che hai inviato tu, destinate a te, o destinate a tutti
  var _cr = getConsegneReparto().filter((c) => {
    if (!(c.operatore === op || _includeOpInCsv(c.destinatario, op) || (isAdmin() && !c.destinatario))) return false;
    const d = (c.data_giornata || c.created_at || '').substring(0, 10);
    if (_consDal && d < _consDal) return false;
    if (_consAl && d > _consAl) return false;
    return true;
  });
  if (!_cr.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessuna consegna</p><small>Le consegne appariranno qui dopo essere state inviate</small></div>';
    return;
  }
  el.innerHTML = _cr
    .slice(0, 20)
    .map((c) => {
      const d = new Date(c.created_at);
      const isAlta = c.priorita === 'alta';
      const letto = !!c.letto_da;
      const isMia = c.operatore === op;
      const canEdit = isMia && !letto;
      const destLabel = c.destinatario && c.destinatario !== 'tutti' ? c.destinatario : 'Tutti';
      let btns = '';
      if (isMia) {
        if (canEdit) {
          btns +=
            '<button class="btn-act edit" onclick="modificaConsegna(' +
            c.id +
            ')" style="font-size:.7rem">Modifica</button>';
          btns +=
            '<button class="btn-act del" onclick="annullaConsegna(' +
            c.id +
            ')" style="font-size:.7rem">Annulla invio</button>';
        } else if (letto) {
          btns += '<span style="font-size:.72rem;color:var(--muted);font-style:italic">Non modificabile (letta)</span>';
        }
      }
      if (!isMia && !letto) {
        segnaConsegnaLetta(c.id);
      }
      return (
        '<div style="padding:14px;margin-bottom:12px;border-radius:3px;border-left:3px solid ' +
        (isAlta ? 'var(--accent)' : 'var(--accent2)') +
        ';background:var(--paper2);' +
        (letto ? 'opacity:.65' : '') +
        '"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap"><span class="mini-badge" style="background:' +
        (c.turno_uscente === 'PRESTO' ? '#e67e22' : '#2c3e50') +
        '">' +
        c.turno_uscente +
        '</span><strong>' +
        escP(c.operatore) +
        '</strong><span style="font-size:.78rem;color:#2980b9;font-weight:600">→ ' +
        escP(destLabel) +
        '</span><span style="color:var(--muted);font-size:.78rem">' +
        d.toLocaleDateString('it-IT') +
        ' ' +
        d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
        '</span>' +
        (isAlta ? '<span style="color:var(--accent);font-size:.78rem;font-weight:700">PRIORITA ALTA</span>' : '') +
        (letto
          ? '<span style="color:#2c6e49;font-size:.78rem;font-weight:600">Letto da ' +
            escP(c.letto_da) +
            ' il ' +
            new Date(c.letto_at).toLocaleDateString('it-IT') +
            '</span>'
          : '') +
        '<div style="display:flex;gap:6px">' +
        btns +
        '</div></div><div style="white-space:pre-line;font-size:.92rem;line-height:1.5">' +
        esc(c.messaggio) +
        '</div></div>'
      );
    })
    .join('');
}
function modificaConsegna(id) {
  const c = consegneCache.find((x) => x.id === id);
  if (!c || c.letto_da) return;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Modifica consegna</h3><div class="pwd-field"><label>Messaggio</label><textarea id="edit-cons-msg" style="width:100%;min-height:100px;padding:10px;font-family:Source Sans 3,sans-serif;font-size:.95rem;border:1.5px solid var(--line);border-radius:2px;resize:vertical">' +
    escP(c.messaggio) +
    '</textarea></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaConsegna(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaModificaConsegna(id) {
  const msg = document.getElementById('edit-cons-msg').value.trim();
  if (!msg) {
    toast('Scrivi un messaggio');
    return;
  }
  try {
    await secPatch('consegne_turno', 'id=eq.' + id, { messaggio: msg });
    const c = consegneCache.find((x) => x.id === id);
    if (c) c.messaggio = msg;
    document.getElementById('pwd-modal').classList.add('hidden');
    renderConsegne();
    toast('Consegna modificata');
  } catch (e) {
    toast('Errore modifica consegna');
  }
}
async function annullaConsegna(id) {
  const c = consegneCache.find((x) => x.id === id);
  if (!c) return;
  if (c.letto_da) {
    toast('Non puoi annullare: già letta da ' + c.letto_da);
    return;
  }
  if (!confirm("Annullare l'invio di questa consegna? Verrà eliminata.")) return;
  try {
    await secDel('consegne_turno', 'id=eq.' + id);
    consegneCache = consegneCache.filter((x) => x.id !== id);
    logAzione('Consegna annullata', c.messaggio.substring(0, 50));
    renderConsegne();
    aggiornaConsegnaBadge();
    toast('Consegna annullata');
  } catch (e) {
    toast('Errore annullamento consegna');
  }
}
function aggiornaConsegnaBadge() {
  const op = getOperatore();
  const badge = document.getElementById('consegna-badge');
  if (!badge || !op) return;
  const nonLette = getConsegneReparto().filter(
    (c) => !c.letto_da && c.operatore !== op && _includeOpInCsv(c.destinatario, op)
  ).length;
  if (nonLette) {
    badge.style.display = 'inline';
    badge.textContent = nonLette;
  } else {
    badge.style.display = 'none';
  }
}
function mostraConsegnaLogin() {
  const op = getOperatore();
  if (!op) return;
  const nonLette = getConsegneReparto().filter(
    (c) => !c.letto_da && c.operatore !== op && _includeOpInCsv(c.destinatario, op)
  );
  if (!nonLette.length) return;
  const ultima = nonLette[0];
  const isAlta = ultima.priorita === 'alta';
  mostraNotifBanner('consegna', 'Consegna da ' + ultima.operatore, ultima.messaggio.substring(0, 80), () =>
    switchPage('consegna')
  );
  const mc = document.getElementById('note-modal-content');
  let html =
    '<h3 style="margin-bottom:4px">' +
    (isAlta ? '<span style="color:var(--accent)">&#9888;</span> ' : '') +
    'Consegna dal turno ' +
    ultima.turno_uscente +
    '</h3><p style="color:var(--accent2);font-size:.85rem;margin-bottom:12px">da ' +
    escP(ultima.operatore) +
    ' — ' +
    new Date(ultima.created_at).toLocaleDateString('it-IT') +
    ' ' +
    new Date(ultima.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
    '</p>';
  if (isAlta)
    html += '<p style="color:var(--accent);font-size:.82rem;font-weight:700;margin-bottom:10px">PRIORITA ALTA</p>';
  html +=
    '<div style="background:var(--paper2);border-radius:3px;padding:14px;border-left:3px solid ' +
    (isAlta ? 'var(--accent)' : 'var(--accent2)') +
    ';white-space:pre-line;font-size:.95rem;line-height:1.6;margin-bottom:16px">' +
    esc(ultima.messaggio) +
    '</div>';
  if (nonLette.length > 1)
    html +=
      '<p style="color:var(--muted);font-size:.82rem;margin-bottom:12px">+ altre ' +
      (nonLette.length - 1) +
      ' consegne non lette</p>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'note-modal\').classList.add(\'hidden\')">OK</button><button class="btn-modal-cancel" onclick="document.getElementById(\'note-modal\').classList.add(\'hidden\');switchPage(\'consegna\')">Vedi tutte</button></div>';
  mc.innerHTML = html;
  document.getElementById('note-modal').classList.remove('hidden');
  // Segna come letta automaticamente quando il popup si apre
  segnaConsegnaLetta(ultima.id);
}

// ========================
// DASHBOARD PANORAMICA
// ========================
function _getTurnoCorrente() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const day = now.getDay(); // 0=dom,5=ven,6=sab
  // PRESTO: 06:00 - 20:00 (dom-gio) o 06:00 - 20:45 (ven-sab)
  const finePresto = day === 5 || day === 6 ? 20.75 : 20; // 20:45 = 20.75
  const oraDecimale = h + m / 60;
  return oraDecimale >= 6 && oraDecimale < finePresto ? 'PRESTO' : 'NOTTE';
}
function renderDashboard() {
  const oggi = getGiornataCasino();
  const now = new Date();
  const turno = _getTurnoCorrente();
  const gd = new Date(oggi + 'T12:00:00');
  // Titolo: usa la giornata di gioco, non la data di sistema
  document.getElementById('dash-titolo').textContent =
    'Dashboard — GD ' + gd.getDate() + ' ' + MESI_FULL[gd.getMonth()] + ' ' + gd.getFullYear();
  document.getElementById('dash-sottotitolo').textContent =
    GIORNI[gd.getDay()] + ' — Turno ' + turno + ' — ' + getOperatore();
  // Stats bar: 6 KPI
  const op = getOperatore();
  const pmMiei = promemoriaCache.filter((p) => !p.completata && _includeOpInCsv(p.assegnato_a, op));
  const pmScaduti = pmMiei.filter((p) => p.data_scadenza < oggi);
  const noteNL = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && !n.nascosta_dest).length;
  const _rd = getDatiReparto(),
    _rm = getMaisonRepartoExpanded();
  const maisonOggi = _rm.filter((r) => r.data_giornata === oggi).reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const alertCassa = checkCassaAlerts().length;
  const regOggi = _rd.filter((e) => e.data && e.data.startsWith(oggi)).length;
  const alertRischio = checkRischioAlerts().length;
  let statsH = '';
  if (isVis('promemoria'))
    statsH +=
      '<div class="stat"><div class="stat-num' +
      (pmScaduti.length ? ' red' : '') +
      '">' +
      pmMiei.length +
      '</div><div class="stat-label">Promemoria' +
      (pmScaduti.length ? ' (' + pmScaduti.length + ' scaduti)' : '') +
      '</div></div>';
  if (isVis('note_collega'))
    statsH +=
      '<div class="stat"><div class="stat-num' +
      (noteNL ? ' red' : '') +
      '">' +
      noteNL +
      '</div><div class="stat-label">Note non lette</div></div>';
  if (isVis('maison'))
    statsH +=
      '<div class="stat"><div class="stat-num gold">' +
      fmtCHF(maisonOggi) +
      '</div><div class="stat-label">Maison oggi CHF</div></div>';
  if (isVis('alert_cassa'))
    statsH +=
      '<div class="stat"><div class="stat-num' +
      (alertCassa ? ' red' : '') +
      '">' +
      alertCassa +
      '</div><div class="stat-label">Alert cassa</div></div>';
  statsH +=
    '<div class="stat"><div class="stat-num blue">' +
    regOggi +
    '</div><div class="stat-label">Registrazioni oggi</div></div>';
  if (isVis('alert_rischio'))
    statsH +=
      '<div class="stat"><div class="stat-num' +
      (alertRischio ? ' red' : '') +
      '">' +
      alertRischio +
      '</div><div class="stat-label">A rischio</div></div>';
  document.getElementById('dash-stats').innerHTML = statsH;
  // Helper: estrai data reminder dalla descrizione del promemoria
  function _getDataRemind(p) {
    const m = (p.descrizione || '').match(/Promemoria: (\d+) giorno\/i prima/);
    if (m) {
      const d = new Date(p.data_scadenza + 'T12:00:00');
      d.setDate(d.getDate() - parseInt(m[1]));
      return d.toISOString().split('T')[0];
    }
    if ((p.descrizione || '').includes('il giorno stesso')) return p.data_scadenza;
    return p.data_scadenza;
  }
  const domani = new Date(new Date(oggi + 'T12:00:00').getTime() + 86400000).toISOString().split('T')[0];
  // DA FARE OGGI: scaduti + reminder di oggi + note non lette + compleanni oggi + ammonimenti
  const todoEl = document.getElementById('dash-todo-list');
  let todoH = '';
  const pmOggi = pmMiei.filter((p) => {
    const dr = _getDataRemind(p);
    return p.data_scadenza <= oggi || dr <= oggi;
  });
  pmOggi.forEach((p) => {
    const isScaduto = p.data_scadenza < oggi;
    todoH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px"><span style="color:' +
      (isScaduto ? 'var(--accent)' : '#e67e22') +
      ';font-weight:700;font-size:1.1rem">' +
      (isScaduto ? '!' : '&#9679;') +
      '</span><span style="flex:1;cursor:pointer" onclick="switchPage(\'promemoria\')"><strong>' +
      escP(p.titolo) +
      '</strong>' +
      (p.data_scadenza !== oggi
        ? ' <span style="color:var(--muted);font-size:.78rem">scade ' +
          new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
          '</span>'
        : '') +
      '</span><button class="btn-act pin" onclick="completaPromemoria(' +
      p.id +
      ');renderDashboard()" style="color:#2c6e49;border-color:#2c6e49;font-size:.78rem">Fatto</button></div>';
  });
  if (noteNL)
    todoH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="switchPage(\'note-collega\')"><span style="color:#2980b9;font-size:1.1rem">&#9993;</span><span>' +
      noteNL +
      ' nota/e non letta/e</span></div>';
  const bdays = isVis('alert_compleanni') ? _getCompleanniProssimi(0) : [];
  bdays.forEach((bd) => {
    todoH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px"><span style="font-size:1.1rem">&#127874;</span><span style="flex:1"><strong>' +
      escP(bd.nome) +
      '</strong> — <span style="color:var(--accent2);font-weight:700">Compleanno OGGI!</span></span></div>';
  });
  const ammA = checkAmmonimentiAlerts();
  ammA.forEach((a) => {
    const ne = a.nome.replace(/'/g, "\\'");
    todoH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px"><span style="color:#e67e22;font-weight:700;font-size:1.1rem">!</span><span style="flex:1;cursor:pointer" onclick="apriProfilo(\'' +
      ne +
      '\')"><strong>' +
      escP(a.nome) +
      '</strong> — ' +
      a.count +
      ' ammonimenti verbali</span></div>';
  });
  if (!todoH) todoH = '<p style="color:#2c6e49;text-align:center;padding:20px;font-weight:600">Tutto in ordine!</p>';
  todoEl.innerHTML = todoH;
  // DA FARE DOMANI: reminder di domani + scadenze domani + compleanni domani
  const domaniEl = document.getElementById('dash-domani-list');
  let domH = '';
  const pmDomani = pmMiei.filter((p) => {
    const dr = _getDataRemind(p);
    return (p.data_scadenza === domani || dr === domani) && !pmOggi.includes(p);
  });
  pmDomani.forEach((p) => {
    domH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="switchPage(\'promemoria\')"><span style="color:#8e44ad;font-size:1.1rem">&#9679;</span><span style="flex:1"><strong>' +
      escP(p.titolo) +
      '</strong> <span style="color:var(--muted);font-size:.78rem">scade ' +
      new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
      '</span></span></div>';
  });
  const bdaysDomani = isVis('alert_compleanni') ? _getCompleanniProssimi(1).filter((b) => b.giorni === 1) : [];
  bdaysDomani.forEach((bd) => {
    domH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px"><span style="font-size:1.1rem">&#127874;</span><span style="flex:1"><strong>' +
      escP(bd.nome) +
      '</strong> — compleanno domani</span></div>';
  });
  if (!domH) domH = '<p style="color:var(--muted);text-align:center;padding:20px">Niente in programma</p>';
  domaniEl.innerHTML = domH;
  const dashDomani = document.getElementById('dash-domani');
  if (dashDomani) dashDomani.style.display = isVis('promemoria') ? '' : '';
  // COMPLEANNI (oggi + prossimi 7 giorni)
  const compEl = document.getElementById('dash-compleanni-list');
  const dashComp = document.getElementById('dash-compleanni');
  if (compEl && isVis('alert_compleanni')) {
    const _oggiDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Compleanni clienti maison (filtrati per reparto)
    const bdaysMaison = [];
    getBudgetReparto().forEach((b) => {
      if (!b.data_nascita) return;
      const dn = new Date(b.data_nascita + 'T12:00:00');
      const quest = new Date(now.getFullYear(), dn.getMonth(), dn.getDate());
      if (quest < _oggiDate) quest.setFullYear(quest.getFullYear() + 1);
      const diff = Math.round((quest - _oggiDate) / 86400000);
      if (diff >= 0 && diff <= 7) bdaysMaison.push({ nome: b.nome, data: quest, giorni: diff, tipo: 'cliente' });
    });
    // Compleanni collaboratori (filtrati per reparto: solo quelli con registrazioni nel reparto corrente)
    const _collabReparto = new Set(getDatiReparto().map((e) => e.nome));
    const bdaysCollab = [];
    collaboratoriCache.forEach((c) => {
      if (!c.attivo || !c.data_nascita) return;
      if (_collabReparto.size && !_collabReparto.has(c.nome)) return;
      const dn = new Date(c.data_nascita + 'T12:00:00');
      const quest = new Date(now.getFullYear(), dn.getMonth(), dn.getDate());
      if (quest < _oggiDate) quest.setFullYear(quest.getFullYear() + 1);
      const diff = Math.round((quest - _oggiDate) / 86400000);
      if (diff >= 0 && diff <= 7) bdaysCollab.push({ nome: c.nome, data: quest, giorni: diff, tipo: 'collaboratore' });
    });
    let compH = '';
    if (bdaysCollab.length) {
      compH +=
        '<div style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;font-weight:600">Collaboratori</div>';
      bdaysCollab
        .sort((a, b) => a.giorni - b.giorni)
        .forEach((bd) => {
          const isOggi = bd.giorni === 0;
          compH +=
            '<div style="padding:8px 10px;margin-bottom:4px;border-radius:3px;display:flex;align-items:center;gap:10px;' +
            (isOggi
              ? 'background:rgba(184,134,11,0.12);border-left:3px solid var(--accent2)'
              : 'border-bottom:1px solid var(--line)') +
            '"><span style="font-size:1.4rem">&#127874;</span><div style="flex:1"><strong>' +
            escP(bd.nome) +
            '</strong> <span style="font-size:.82rem;font-weight:700;color:' +
            (isOggi ? 'var(--accent2)' : 'var(--muted)') +
            '">' +
            (isOggi ? 'COMPLEANNO OGGI!' : 'tra ' + bd.giorni + ' giorno/i') +
            '</span></div></div>';
        });
    }
    if (bdaysMaison.length) {
      compH +=
        '<div style="font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent2);margin:' +
        (bdaysCollab.length ? '10px' : '0') +
        ' 0 6px;font-weight:600">Clienti Maison</div>';
      bdaysMaison
        .sort((a, b) => a.giorni - b.giorni)
        .forEach((bd) => {
          const ne = bd.nome.replace(/'/g, "\\'");
          const isOggi = bd.giorni === 0;
          compH +=
            '<div style="padding:8px 10px;margin-bottom:4px;border-radius:3px;display:flex;align-items:center;gap:10px;' +
            (isOggi
              ? 'background:rgba(184,134,11,0.12);border-left:3px solid var(--accent2)'
              : 'border-bottom:1px solid var(--line)') +
            '"><span style="font-size:1.4rem">&#127874;</span><div style="flex:1"><strong class="entry-name" onclick="apriDettaglioMaison(\'' +
            ne +
            '\')">' +
            escP(bd.nome) +
            '</strong> <span style="font-size:.82rem;font-weight:700;color:' +
            (isOggi ? 'var(--accent2)' : 'var(--muted)') +
            '">' +
            (isOggi ? 'COMPLEANNO OGGI!' : 'tra ' + bd.giorni + ' giorno/i') +
            '</span></div></div>';
        });
    }
    if (!compH)
      compH =
        '<p style="color:var(--muted);text-align:center;padding:20px">Nessun compleanno nei prossimi 7 giorni</p>';
    compEl.innerHTML = compH;
    if (dashComp) dashComp.style.display = '';
  } else {
    if (dashComp) dashComp.style.display = 'none';
  }
  // ALERT ATTIVI
  const alertEl = document.getElementById('dash-alert-list');
  let alertH = '';
  checkCassaAlerts().forEach((a) => {
    const ne = a.nome.replace(/'/g, "\\'");
    alertH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
      (a.type === 'rdi' ? 'var(--accent)' : '#e67e22') +
      ';margin-right:8px"></span><span class="entry-name" onclick="apriProfilo(\'' +
      ne +
      '\')"><strong>' +
      escP(a.nome) +
      '</strong></span>: ' +
      (a.type === 'rdi'
        ? 'cumulativo ' + fmtCHF(a.importo) + ' CHF → RDI'
        : 'singola ' + fmtCHF(a.importo) + ' CHF → Allineamento') +
      '</div>';
  });
  checkRischioAlerts().forEach((a) => {
    const ne = a.nome.replace(/'/g, "\\'");
    alertH +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#8e44ad;margin-right:8px"></span><span class="entry-name" onclick="apriProfilo(\'' +
      ne +
      '\')"><strong>' +
      escP(a.nome) +
      '</strong></span>: ' +
      a.count +
      ' allineamenti — rischio RDI</div>';
  });
  getBudgetReparto().forEach((b) => {
    const spent = _rm
      .filter((r) => r.nome.toLowerCase() === b.nome.toLowerCase())
      .reduce((s, r) => s + parseFloat(r.costo || 0), 0);
    const ne = b.nome.replace(/'/g, "\\'");
    if (b.budget_chf && spent >= b.budget_chf * 0.8) {
      alertH +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
        (spent >= b.budget_chf ? 'var(--accent)' : '#e67e22') +
        ';margin-right:8px"></span><span class="entry-name" onclick="apriDettaglioMaison(\'' +
        ne +
        '\')"><strong>' +
        escP(b.nome) +
        '</strong></span>: Maison ' +
        fmtCHF(spent) +
        '/' +
        fmtCHF(parseFloat(b.budget_chf)) +
        ' CHF (' +
        Math.round((spent / b.budget_chf) * 100) +
        '%)</div>';
    }
  });
  // Stato rapporto giornaliero — carica da DB se non in cache, mostra solo se NON compilato
  if (isVis('rapporto')) {
    if (!rapportiCache[oggi]) {
      secGet('rapporti_giornalieri?data_rapporto=eq.' + oggi + '&reparto_dip=eq.' + currentReparto)
        .then((rData) => {
          if (rData && rData.length) {
            if (!rapportiCache[oggi]) rapportiCache[oggi] = {};
            rData.forEach((r) => {
              rapportiCache[oggi][r.turno] = r;
            });
            renderDashboard();
          }
        })
        .catch(() => {});
    }
    const rapp = rapportiCache[oggi] || {};
    if (!rapp.PRESTO)
      alertH +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="switchPage(\'rapporto\')"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e67e22;margin-right:8px"></span><strong>Rapporto PRESTO:</strong> <span style="color:#e67e22;font-weight:700">da compilare</span></div>';
    if (!rapp.NOTTE)
      alertH +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="switchPage(\'rapporto\')"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e67e22;margin-right:8px"></span><strong>Rapporto NOTTE:</strong> <span style="color:#e67e22;font-weight:700">da compilare</span></div>';
  }
  // Consegne recenti
  const _consRecenti = getConsegneReparto().slice(0, 3);
  if (_consRecenti.length) {
    alertH +=
      '<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:10px;margin-bottom:6px;font-weight:600">Ultime consegne</div>';
    _consRecenti.forEach((c) => {
      const cd = new Date(c.created_at);
      const isAlta = c.priorita === 'alta';
      alertH +=
        '<div style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.85rem" onclick="switchPage(\'consegna\')"><span class="mini-badge" style="background:' +
        (c.turno_uscente === 'PRESTO' ? '#e67e22' : '#2c3e50') +
        ';font-size:.65rem">' +
        c.turno_uscente +
        '</span><strong>' +
        escP(c.operatore) +
        '</strong><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">' +
        escP(c.messaggio.substring(0, 50)) +
        '</span>' +
        (isAlta ? '<span style="color:var(--accent);font-size:.7rem;font-weight:700">!</span>' : '') +
        '<span style="color:var(--muted);font-size:.72rem">' +
        cd.toLocaleDateString('it-IT') +
        '</span></div>';
    });
  }
  if (!alertH)
    alertH = '<p style="color:#2c6e49;text-align:center;padding:20px;font-weight:600">Nessun alert attivo</p>';
  alertEl.innerHTML = alertH;
  // ULTIME REGISTRAZIONI
  const recEl = document.getElementById('dash-recenti-list');
  const ultimi = _rd.slice(0, 8);
  recEl.innerHTML = ultimi.length
    ? ultimi
        .map((e) => {
          const d = new Date(e.data);
          const ne = e.nome.replace(/'/g, "\\'");
          const gdD = d.getHours() < 6;
          const gdDt = gdD ? new Date(d.getTime() - 86400000) : null;
          const gdB = gdD
            ? '<span class="mini-badge" style="background:var(--accent2)">GD ' +
              gdDt.getDate() +
              '.' +
              String(gdDt.getMonth() + 1).padStart(2, '0') +
              '</span>'
            : '';
          return (
            '<div style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:.88rem"><span style="color:var(--muted);font-size:.78rem;min-width:38px">' +
            d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
            '</span><span class="mini-badge" style="background:' +
            getColore(e.tipo) +
            '">' +
            escP(e.tipo) +
            '</span>' +
            gdB +
            '<span class="entry-name" onclick="apriProfilo(\'' +
            ne +
            '\')"><strong>' +
            escP(e.nome) +
            '</strong></span> <span style="color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escP(e.testo.substring(0, 40)) +
            '</span></div>'
          );
        })
        .join('')
    : '<p style="color:var(--muted);text-align:center;padding:20px">Nessuna registrazione</p>';
  // MAISON OGGI
  const mEl = document.getElementById('dash-maison-content');
  const maisonOggiRighe = _rm.filter((r) => r.data_giornata === oggi);
  if (maisonOggiRighe.length) {
    const byN = {};
    maisonOggiRighe.forEach((r) => {
      byN[r.nome] = (byN[r.nome] || 0) + parseFloat(r.costo || 0);
    });
    const sorted = Object.entries(byN).sort((a, b) => b[1] - a[1]);
    mEl.innerHTML =
      sorted
        .map(([n, c]) => {
          const ne = n.replace(/'/g, "\\'");
          return (
            '<div style="padding:5px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;font-size:.88rem"><span class="entry-name" onclick="apriDettaglioMaison(\'' +
            ne +
            '\')">' +
            escP(n) +
            '</span><strong>' +
            fmtCHF(c) +
            ' CHF</strong></div>'
          );
        })
        .join('') +
      '<div style="padding:8px 0;display:flex;justify-content:space-between;font-weight:700;color:var(--accent2)"><span>Totale</span><span>CHF ' +
      fmtCHF(maisonOggi) +
      '</span></div>';
  } else {
    mEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">Nessun dato Maison oggi</p>';
  }
  // Visibilita widget Dashboard in base alle impostazioni admin
  const dashMaison = document.getElementById('dash-maison');
  if (dashMaison) dashMaison.style.display = isVis('maison') ? '' : 'none';
  const dashTodo = document.getElementById('dash-todo');
  if (dashTodo) dashTodo.style.display = isVis('promemoria') ? '' : 'none';
  const dashAlerts = document.getElementById('dash-alerts');
  if (dashAlerts) {
    const hasCassa = isVis('alert_cassa'),
      hasRischio = isVis('alert_rischio');
    if (!hasCassa && !hasRischio) dashAlerts.style.display = 'none';
    else dashAlerts.style.display = '';
  }
  // GRAFICO SETTIMANALE
  _renderDashSettimana(_rd, _rm);
}
var _dashSettOffset = 0;
function navigaDashSettimana(dir) {
  _dashSettOffset += dir;
  renderDashSettimanaOnly();
}
function renderDashSettimanaOnly() {
  _renderDashSettimana(getDatiReparto(), getMaisonRepartoExpanded());
}
function _renderDashSettimana(_rd, _rm) {
  const sett = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i + _dashSettOffset * 7);
    sett.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }
  const titEl = document.getElementById('dash-sett-titolo');
  if (titEl) {
    if (_dashSettOffset === 0) titEl.textContent = 'Andamento settimanale';
    else {
      const d0 = new Date(sett[0] + 'T12:00:00'),
        d6 = new Date(sett[6] + 'T12:00:00');
      titEl.textContent =
        d0.getDate() +
        ' ' +
        MESI[d0.getMonth()] +
        ' — ' +
        d6.getDate() +
        ' ' +
        MESI[d6.getMonth()] +
        ' ' +
        d6.getFullYear();
    }
  }
  const regPerGiorno = sett.map((ds) => _rd.filter((e) => e.data && e.data.startsWith(ds)).length);
  const maisonPerGiorno = sett.map((ds) =>
    _rm.filter((r) => r.data_giornata === ds).reduce((s, r) => s + parseFloat(r.costo || 0), 0)
  );
  renderChart(
    'chart-dash-settimana',
    'bar',
    {
      labels: sett.map((ds) => {
        const d = new Date(ds + 'T12:00:00');
        return d.getDate() + ' ' + MESI[d.getMonth()];
      }),
      datasets: [
        {
          label: 'Registrazioni',
          data: regPerGiorno,
          backgroundColor: 'rgba(26,74,122,0.7)',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Maison CHF',
          data: maisonPerGiorno,
          backgroundColor: 'rgba(184,134,11,0.4)',
          borderRadius: 4,
          type: 'line',
          borderColor: '#b8860b',
          tension: 0.3,
          pointRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    {
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Registrazioni' } },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Maison CHF' },
        },
      },
    }
  );
}

// ========================
// REPORT CONFIG MODAL
// ========================
function apriReportConfig(tipo) {
  var mc = document.getElementById('pwd-modal-content');
  var sez = [
    { key: 'panoramica', label: 'Panoramica', checked: true },
    { key: 'cassa', label: 'Differenze Cassa', checked: true },
    { key: 'maison', label: 'Costi Maison', checked: true },
    { key: 'spese_extra', label: 'Spese Extra', checked: true },
    { key: 'regali', label: 'Regali', checked: true },
    { key: 'moduli', label: 'Moduli Disciplinari', checked: true },
    { key: 'promemoria', label: 'Promemoria', checked: true },
    { key: 'registrazioni', label: 'Registrazioni dettagliate', checked: false },
  ];
  mc.innerHTML =
    '<h3>Report ' +
    (tipo === 'settimanale' ? 'Settimanale' : 'Annuale') +
    '</h3><p style="color:var(--muted);margin-bottom:14px">Scegli le sezioni da includere:</p><div id="report-sez-list" style="display:flex;flex-direction:column;gap:8px">' +
    sez
      .map(function (s) {
        return (
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.9rem"><input type="checkbox" id="rep-sez-' +
          s.key +
          '" ' +
          (s.checked ? 'checked' : '') +
          ' style="width:18px;height:18px"> ' +
          s.label +
          '</label>'
        );
      })
      .join('') +
    '</div><div class="pwd-modal-btns" style="margin-top:18px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiReport(\'' +
    tipo +
    '\')">Genera PDF</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
function _getReportSez() {
  var sez = {};
  ['panoramica', 'cassa', 'maison', 'spese_extra', 'regali', 'moduli', 'promemoria', 'registrazioni'].forEach(
    function (k) {
      var cb = document.getElementById('rep-sez-' + k);
      sez[k] = cb ? cb.checked : true;
    }
  );
  return sez;
}
function eseguiReport(tipo) {
  document.getElementById('pwd-modal').classList.add('hidden');
  if (tipo === 'settimanale') generaReportSettimanale(_getReportSez());
  else generaReportAnnuale(_getReportSez());
}
// ========================
// REPORT SETTIMANALE PDF
// ========================
async function generaReportSettimanale(sez) {
  if (!sez)
    sez = {
      panoramica: true,
      cassa: true,
      maison: true,
      spese_extra: true,
      regali: true,
      moduli: true,
      promemoria: true,
      registrazioni: false,
    };
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const now = new Date();
  const sett = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    sett.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }
  const dalLabel = new Date(sett[0] + 'T12:00:00').toLocaleDateString('it-IT'),
    alLabel = new Date(sett[6] + 'T12:00:00').toLocaleDateString('it-IT');
  const settData = getDatiReparto().filter((e) => e.data >= sett[0] && e.data <= sett[6] + 'T23:59:59');
  const settMaison = getMaisonRepartoExpanded().filter((r) => r.data_giornata >= sett[0] && r.data_giornata <= sett[6]);
  const settModuli = getModuliReparto().filter((m) => (m.created_at || m.data_modulo || '') >= sett[0]);
  const settPM = promemoriaCache.filter((p) => p.data_scadenza >= sett[0] && p.data_scadenza <= sett[6]);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const mx = 16;
    let y = 14;
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Report Settimanale', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(dalLabel + ' — ' + alLabel + ' — Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    // PANORAMICA
    const totMaison = settMaison.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
    if (sez.panoramica) {
      const nErr = settData.filter((e) => e.tipo === nomeCorrente('Errore')).length;
      const nMal = _contaTotaleMalattie(settData, nomeCorrente('Malattia'));
      const nAllin = settModuli.filter((m) => m.tipo === 'allineamento').length;
      const nRdi = settModuli.filter((m) => m.tipo === 'rdi').length;
      const nApprMod = settModuli.filter((m) => m.tipo === 'apprezzamento').length;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Panoramica', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        body: [
          ['Registrazioni', settData.length],
          ['Errori', nErr],
          ['Malattie', nMal],
          ['Costi Maison', 'CHF ' + fmtCHF(totMaison)],
          ['Allineamenti generati', nAllin],
          ['Apprezzamenti (moduli)', nApprMod],
          ['RDI generati', nRdi],
        ],
        theme: 'grid',
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'center' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // DIFFERENZE CASSA
    if (sez.cassa) {
      const errCassa = settData.filter(
        (e) => e.tipo === nomeCorrente('Errore') && e.reparto === 'Cassa' && parseFloat(e.importo) > 0
      );
      if (errCassa.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Differenze Cassa', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Data', 'Collaboratore', 'Importo']],
          body: errCassa.map((e) => {
            const d = new Date(e.data);
            return [d.toLocaleDateString('it-IT'), e.nome, fmtCHF(e.importo) + ' ' + (e.valuta || 'CHF')];
          }),
          headStyles: { fillColor: [192, 57, 43] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // COSTI MAISON
    if (sez.maison && settMaison.length) {
      const byN = {};
      settMaison.forEach((r) => {
        if (!byN[r.nome]) byN[r.nome] = { tot: 0, visite: 0 };
        byN[r.nome].tot += parseFloat(r.costo || 0);
        byN[r.nome].visite++;
      });
      const top10 = Object.entries(byN)
        .sort((a, b) => b[1].tot - a[1].tot)
        .slice(0, 10);
      if (y + 30 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Top Clienti Maison', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Cliente', 'Visite', 'Totale CHF']],
        body: top10.map(([n, d]) => [n, d.visite, fmtCHF(d.tot)]),
        foot: [['TOTALE', '', 'CHF ' + fmtCHF(totMaison)]],
        headStyles: { fillColor: [184, 134, 11] },
        footStyles: { fillColor: [245, 243, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // MODULI
    if (sez.moduli) {
      const settModAll = [...settModuli];
      if (settModAll.length) {
        if (y + 20 > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 16;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Moduli Disciplinari', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Tipo', 'Collaboratore', 'Data', 'Resp.']],
          body: settModAll.map((m) => [
            m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
            m.collaboratore,
            m.data_modulo || '',
            m.resp_settore || '',
          ]),
          headStyles: { fillColor: [26, 18, 8] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // PROMEMORIA
    if (sez.promemoria && settPM.length) {
      if (y + 20 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 16;
      }
      const pmFatti = settPM.filter((p) => p.completata).length,
        pmScad = settPM.filter((p) => !p.completata && p.data_scadenza <= sett[6]).length;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Promemoria', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Titolo', 'Scadenza', 'Assegnato', 'Stato']],
        body: settPM.map((p) => [
          p.titolo,
          p.data_scadenza,
          p.assegnato_a,
          p.completata ? 'Completato' + (p.completata_da ? ' da ' + p.completata_da : '') : 'In corso',
        ]),
        headStyles: { fillColor: [142, 68, 173] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // Spese Extra
    if (sez.spese_extra) {
      const settSE = getSpeseReparto().filter((r) => r.data_spesa >= sett[0] && r.data_spesa <= sett[6]);
      if (settSE.length) {
        const totSE = settSE.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
        if (y + 20 > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 16;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Spese Extra (CHF ' + fmtCHF(totSE) + ')', mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Data', 'Beneficiario', 'Tipo', 'Luogo', 'CHF']],
          body: settSE.map((r) => [
            new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
            r.beneficiario,
            SE_TIPI_LABEL[r.tipo] || r.tipo,
            r.luogo || '',
            fmtCHF(r.importo),
          ]),
          headStyles: { fillColor: [41, 128, 185] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          columnStyles: { 4: { halign: 'right' } },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // Regali
    if (sez.regali) {
      const settReg = getRegaliReparto().filter(
        (r) => (r.data_regalo || '') >= sett[0] && (r.data_regalo || '') <= sett[6]
      );
      if (settReg.length) {
        const totReg = settReg.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
        if (y + 20 > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = 16;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Regali' + (totReg ? ' (CHF ' + fmtCHF(totReg) + ')' : ''), mx, y);
        y += 2;
        doc.autoTable({
          theme: 'grid',
          startY: y,
          margin: { left: mx, right: mx },
          head: [['Data', 'Cliente', 'Descrizione', 'CHF']],
          body: settReg.map((r) => [
            new Date((r.data_regalo || r.created_at) + 'T12:00:00').toLocaleDateString('it-IT'),
            r.nome,
            r.descrizione || '',
            r.importo ? fmtCHF(r.importo) : '—',
          ]),
          headStyles: { fillColor: [139, 105, 20] },
          styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
          alternateRowStyles: { fillColor: [250, 247, 242] },
        });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    // Footer
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        'Casino Lugano SA — Report ' + dalLabel + ' / ' + alLabel + ' — Pag. ' + i + '/' + tp,
        mx,
        doc.internal.pageSize.getHeight() - 8
      );
    }
    mostraPdfPreview(
      doc,
      'report_settimanale_' + dalLabel.replace(/\//g, '-') + '_' + alLabel.replace(/\//g, '-') + '.pdf',
      'Report Settimanale'
    );
  } catch (e) {
    console.error(e);
    toast('Errore PDF: ' + e.message);
  }
}

// REPORT SETTIMANALE CSV
function generaReportSettimanaleCSV() {
  const sett = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    sett.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }
  const dalL = new Date(sett[0] + 'T12:00:00').toLocaleDateString('it-IT'),
    alL = new Date(sett[6] + 'T12:00:00').toLocaleDateString('it-IT');
  const settData = getDatiReparto().filter((e) => e.data >= sett[0] && e.data <= sett[6] + 'T23:59:59');
  const settMaison = getMaisonRepartoExpanded().filter((r) => r.data_giornata >= sett[0] && r.data_giornata <= sett[6]);
  const settSE = getSpeseReparto().filter((r) => r.data_spesa >= sett[0] && r.data_spesa <= sett[6]);
  const rows = [
    ['REPORT SETTIMANALE ' + dalL + ' - ' + alL],
    [''],
    ['REGISTRAZIONI'],
    ['Data', 'Ora', 'Collaboratore', 'Tipo', 'Descrizione'],
  ];
  settData.forEach((e) => {
    const d = new Date(e.data);
    rows.push([
      d.toLocaleDateString('it-IT'),
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      e.nome,
      e.tipo,
      e.testo.replace(/\n/g, ' '),
    ]);
  });
  rows.push([''], ['COSTI MAISON'], ['Data', 'Cliente', 'PX', 'Costo CHF', 'Tipo']);
  settMaison.forEach((r) => {
    rows.push([
      new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT'),
      r.nome,
      r.px,
      r.costo,
      r.tipo_buono || '',
    ]);
  });
  if (settSE.length) {
    rows.push([''], ['SPESE EXTRA'], ['Data', 'Beneficiario', 'Tipo', 'Luogo', 'CHF']);
    settSE.forEach((r) => {
      rows.push([
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
        r.beneficiario,
        SE_TIPI_LABEL[r.tipo] || r.tipo,
        r.luogo || '',
        r.importo,
      ]);
    });
  }
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c || '').replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' }
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'report_settimanale_' + dalL.replace(/\//g, '-') + '_' + alL.replace(/\//g, '-') + '.csv',
  }).click();
  toast('Report settimanale CSV esportato!');
}

// REPORT ANNUALE
function _getAnnoCorrente() {
  return new Date().getFullYear();
}
function _getDatiAnno(anno) {
  const start = anno + '-01-01',
    end = anno + '-12-31';
  return {
    data: getDatiReparto().filter((e) => e.data >= start && e.data <= end + 'T23:59:59'),
    maison: getMaisonRepartoExpanded().filter((r) => r.data_giornata >= start && r.data_giornata <= end),
    spese: getSpeseReparto().filter((r) => r.data_spesa >= start && r.data_spesa <= end),
    moduli: getModuliReparto().filter(
      (m) =>
        (m.created_at || m.data_modulo || '') >= start && (m.created_at || m.data_modulo || '') <= end + 'T23:59:59'
    ),
  };
}
async function generaReportAnnuale(sez) {
  if (!sez)
    sez = {
      panoramica: true,
      cassa: true,
      maison: true,
      spese_extra: true,
      regali: true,
      moduli: true,
      promemoria: true,
      registrazioni: false,
    };
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore caricamento libreria PDF');
      return;
    }
  }
  const anno = _getAnnoCorrente();
  const d = _getDatiAnno(anno);
  const nErr = d.data.filter((e) => e.tipo === nomeCorrente('Errore')).length;
  const nMal = _contaTotaleMalattie(d.data, nomeCorrente('Malattia'));
  const totMaison = d.maison.reduce((s, r) => s + parseFloat(r.costo || 0), 0);
  const totSE = d.spese.reduce((s, r) => s + parseFloat(r.importo || 0), 0);
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const mx = 16;
    let y = 14;
    if (_logoB64)
      try {
        doc.addImage(_logoB64, 'PNG', pw / 2 - 20, y, 40, 22.5);
      } catch (e) {}
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Report Annuale ' + anno, pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Casino Lugano SA', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    // Panoramica
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Panoramica', mx, y);
    y += 2;
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: mx, right: mx },
      body: [
        ['Registrazioni totali', d.data.length],
        ['Errori', nErr],
        ['Malattie', nMal],
        ['Apprezzamenti (moduli)', d.moduli.filter((m) => m.tipo === 'apprezzamento').length],
        ['Costi Maison totali', 'CHF ' + fmtCHF(totMaison)],
        ['Spese Extra totali', 'CHF ' + fmtCHF(totSE)],
        ['Totale complessivo (Maison+Extra)', 'CHF ' + fmtCHF(totMaison + totSE)],
        ['Allineamenti', d.moduli.filter((m) => m.tipo === 'allineamento').length],
        ['RDI', d.moduli.filter((m) => m.tipo === 'rdi').length],
      ],
      theme: 'grid',
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'center' } },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    y = doc.lastAutoTable.finalY + 8;
    // Riepilogo mensile
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Riepilogo per mese', mx, y);
    y += 2;
    const mesiBody = [];
    for (let m = 0; m < 12; m++) {
      const ms = anno + '-' + String(m + 1).padStart(2, '0');
      const mData = d.data.filter((e) => e.data.startsWith(ms));
      const mMaison = d.maison.filter((r) => r.data_giornata.startsWith(ms));
      const mSE = d.spese.filter((r) => r.data_spesa.startsWith(ms));
      if (mData.length || mMaison.length || mSE.length)
        mesiBody.push([
          MESI_FULL[m],
          mData.length,
          mData.filter((e) => e.tipo === nomeCorrente('Errore')).length,
          mMaison.reduce((s, r) => s + parseFloat(r.costo || 0), 0).toFixed(0),
          mSE.reduce((s, r) => s + parseFloat(r.importo || 0), 0).toFixed(0),
        ]);
    }
    if (mesiBody.length) {
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Mese', 'Registr.', 'Errori', 'Maison CHF', 'Extra CHF']],
        body: mesiBody,
        headStyles: { fillColor: [26, 18, 8] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // Top clienti maison
    if (d.maison.length) {
      const byN = {};
      d.maison.forEach((r) => {
        if (!byN[r.nome]) byN[r.nome] = 0;
        byN[r.nome] += parseFloat(r.costo || 0);
      });
      const top15 = Object.entries(byN)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
      if (y + 30 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Top 15 Clienti Maison', mx, y);
      y += 2;
      doc.autoTable({
        theme: 'grid',
        startY: y,
        margin: { left: mx, right: mx },
        head: [['Cliente', 'Totale CHF']],
        body: top15.map(function (x) {
          return [x[0], fmtCHF(x[1])];
        }),
        headStyles: { fillColor: [184, 134, 11] },
        styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 9, cellPadding: 3 },
        columnStyles: { 1: { halign: 'right' } },
        alternateRowStyles: { fillColor: [250, 247, 242] },
      });
      y = doc.lastAutoTable.finalY + 8;
    }
    // Footer
    var tp = doc.internal.getNumberOfPages();
    for (var i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        'Casino Lugano SA — Report Annuale ' + anno + ' — Pag. ' + i + '/' + tp,
        mx,
        doc.internal.pageSize.getHeight() - 8
      );
    }
    mostraPdfPreview(doc, 'report_annuale_' + anno + '.pdf', 'Report Annuale ' + anno);
  } catch (e) {
    console.error(e);
    toast('Errore PDF: ' + e.message);
  }
}
function generaReportAnnualeCSV() {
  const anno = _getAnnoCorrente();
  const d = _getDatiAnno(anno);
  const rows = [['REPORT ANNUALE ' + anno + ' — Casino Lugano SA'], ['']];
  // Riepilogo mensile
  rows.push(['RIEPILOGO MENSILE'], ['Mese', 'Registrazioni', 'Errori', 'Malattie', 'Maison CHF', 'Spese Extra CHF']);
  for (var m = 0; m < 12; m++) {
    var ms = anno + '-' + String(m + 1).padStart(2, '0');
    var mData = d.data.filter(function (e) {
      return e.data.startsWith(ms);
    });
    var mMaison = d.maison.filter(function (r) {
      return r.data_giornata.startsWith(ms);
    });
    var mSE = d.spese.filter(function (r) {
      return r.data_spesa.startsWith(ms);
    });
    rows.push([
      MESI_FULL[m],
      mData.length,
      mData.filter(function (e) {
        return e.tipo === nomeCorrente('Errore');
      }).length,
      mData.filter(function (e) {
        return e.tipo === nomeCorrente('Malattia');
      }).length,
      fmtCHF(
        mMaison.reduce(function (s, r) {
          return s + parseFloat(r.costo || 0);
        }, 0)
      ),
      fmtCHF(
        mSE.reduce(function (s, r) {
          return s + parseFloat(r.importo || 0);
        }, 0)
      ),
    ]);
  }
  // Registrazioni
  rows.push([''], ['REGISTRAZIONI'], ['Data', 'Collaboratore', 'Tipo', 'Descrizione']);
  d.data.forEach(function (e) {
    var dt = new Date(e.data);
    rows.push([dt.toLocaleDateString('it-IT'), e.nome, e.tipo, e.testo.replace(/\n/g, ' ')]);
  });
  // Costi Maison
  rows.push([''], ['COSTI MAISON'], ['Data', 'Cliente', 'PX', 'Costo CHF', 'Tipo']);
  d.maison.forEach(function (r) {
    rows.push([
      new Date(r.data_giornata + 'T12:00:00').toLocaleDateString('it-IT'),
      r.nome,
      r.px,
      r.costo,
      r.tipo_buono || '',
    ]);
  });
  // Spese Extra
  if (d.spese.length) {
    rows.push([''], ['SPESE EXTRA'], ['Data', 'Beneficiario', 'Tipo', 'Luogo', 'CHF']);
    d.spese.forEach(function (r) {
      rows.push([
        new Date(r.data_spesa + 'T12:00:00').toLocaleDateString('it-IT'),
        r.beneficiario,
        SE_TIPI_LABEL[r.tipo] || r.tipo,
        r.luogo || '',
        r.importo,
      ]);
    });
  }
  var blob = new Blob(
    [
      '\uFEFF' +
        rows
          .map(function (r) {
            return r
              .map(function (c) {
                return '"' + String(c || '').replace(/"/g, '""') + '"';
              })
              .join(';');
          })
          .join('\n'),
    ],
    { type: 'text/csv;charset=utf-8' }
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'report_annuale_' + anno + '.csv',
  }).click();
  toast('Report annuale CSV esportato!');
}

// ========================
// ================================================================
