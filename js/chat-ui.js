/**
 * Diario Collaboratori — Casino Lugano SA
 * File: chat-ui.js
 */

// ================================================================
// SEZIONE 7: NOTE COLLEGHI (interfaccia chat)
// Lista conversazioni, renderNoteCollega, renderNoteChat
// ================================================================
// NOTE COLLEGHI
function toggleTuttiDest() {
  const c = document.getElementById('nota-tutti').checked;
  document
    .querySelectorAll('#nota-dest-box input[type=checkbox]:not(#nota-tutti):not(.nota-gruppo)')
    .forEach((cb) => (cb.checked = c));
}
function toggleGruppoDest(reparto) {
  const c = document.querySelector('#nota-dest-box .nota-gruppo[data-rep="' + reparto + '"]');
  if (!c) return;
  document.querySelectorAll('#nota-dest-box input[type=checkbox]:not(#nota-tutti):not(.nota-gruppo)').forEach((cb) => {
    const rep = operatoriRepartoMap[cb.value] || 'entrambi';
    if (rep === reparto || rep === 'entrambi') cb.checked = c.checked;
  });
}
function getDestinatariSelezionati() {
  return [...document.querySelectorAll('#nota-dest-box input[type=checkbox]:not(#nota-tutti)')]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}
async function inviaNotaCollega() {
  const dests = getDestinatariSelezionati(),
    msg = document.getElementById('nota-msg').value.trim(),
    da = getOperatore();
  if (!da) {
    toast('Seleziona prima un operatore (in alto)');
    return;
  }
  if (!dests.length) {
    toast('Seleziona almeno un destinatario');
    return;
  }
  if (!msg) {
    toast('Scrivi un messaggio');
    _highlightField('nota-msg');
    return;
  }
  const msgEnc = await encryptNota(msg);
  try {
    if (dests.length === 1) {
      // 1-to-1
      await _chatInsertMessage({ da, partner: dests[0], messaggioCifrato: msgEnc, messaggioPlain: msg });
    } else {
      // Gruppo ad-hoc → crea custom group
      const legacyGid =
        '__gruppo_custom_' +
        [da, ...dests]
          .sort()
          .join('|')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 60);
      await _chatInsertMessage({
        da,
        partner: 'gruppo:' + legacyGid,
        messaggioCifrato: msgEnc,
        messaggioPlain: msg,
        gruppoMembers: [da, ...dests],
      });
    }
    document.getElementById('nota-msg').value = '';
    document.querySelectorAll('#nota-dest-box input[type=checkbox]').forEach((cb) => (cb.checked = false));
    renderNoteCollega();
    toast('Nota inviata a ' + dests.join(', '));
    inviaPush(dests, 'Nota da ' + da, msg.substring(0, 120), 'nota', true);
  } catch (e) {
    toast('Errore invio: ' + e.message);
  }
}
async function segnaNotaLetta(id) {
  try {
    await _chatPatchMessage(id, { letta: true });
    renderNoteCollega();
  } catch (e) {
    toast('Errore aggiornamento nota');
  }
}
function rispondiNota(mittente, notaId) {
  // Segna come letta se non lo è
  const nota = noteColleghiCache.find((n) => n.id === notaId);
  if (nota && !nota.letta) segnaNotaLetta(notaId);
  // FIX: se il messaggio era in un gruppo, apri la chat del gruppo (non la chat privata col mittente)
  let convKey = mittente;
  if (nota && nota.gruppo_id && nota.gruppo_id.startsWith('__gruppo_')) {
    convKey = 'gruppo:' + nota.gruppo_id;
  }
  apriConversazione(convKey);
  // Focus on chat input
  setTimeout(() => {
    const ta = document.getElementById('nota-msg-chat');
    if (ta) {
      ta.focus();
      ta.placeholder = 'Rispondi a ' + mittente + '...';
    }
  }, 200);
}
async function eliminaNotaCollega(id, ruolo) {
  if (!confirm('Eliminare questa nota?')) return;
  // ENTERPRISE: id e' chat_messages.id, basta UNA operazione (nascondi per me)
  const campo = ruolo === 'mitt' ? 'nascosta_mitt' : 'nascosta_dest';
  try {
    await _chatPatchMessage(id, { [campo]: true });
    renderNoteCollega();
    toast('Nota rimossa');
  } catch (e) {
    toast('Errore rimozione nota');
  }
}
function modificaNotaCollega(id) {
  const n = noteColleghiCache.find((n) => n.id === id);
  if (!n) return;
  const gid = n.gruppo_id;
  const _nTime2 = new Date(n.created_at || 0).getTime();
  const gruppo = gid
    ? noteColleghiCache.filter(
        (x) =>
          x.gruppo_id === gid &&
          x.da_operatore === n.da_operatore &&
          (x.messaggio || '') === (n.messaggio || '') &&
          Math.abs(new Date(x.created_at || 0).getTime() - _nTime2) < 10000,
      )
    : null;
  const destLabel =
    gruppo && gruppo.length > 1 ? gruppo.map((x) => escP(x.a_operatore)).join(', ') : escP(n.a_operatore);
  // FIX EDGE CASE #2: salva snapshot del messaggio corrente per optimistic lock
  // Se al momento del salvataggio il messaggio risulta cambiato (es. modificato altrove via realtime),
  // abortiamo con warning invece di sovrascrivere ciecamente.
  window._editNoteSnapshot = { id: id, originalMsg: n.messaggio, originalCreatedAt: n.created_at };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Modifica nota</h3><p>Destinatari: <strong>' +
    destLabel +
    '</strong></p><div class="pwd-field"><label>Messaggio</label><textarea id="edit-nota-msg" style="width:100%;min-height:80px;padding:10px;font-family:\'Source Sans 3\',sans-serif;font-size:.95rem;border:1.5px solid var(--line);border-radius:2px;resize:vertical">' +
    n.messaggio.replace(/</g, '&lt;') +
    '</textarea></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaNota(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaModificaNota(id) {
  const msg = document.getElementById('edit-nota-msg').value.trim();
  if (!msg) {
    toast('Scrivi un messaggio');
    return;
  }
  const n = noteColleghiCache.find((n) => n.id === id);
  if (!n) {
    toast('Nota non trovata');
    return;
  }
  // FIX EDGE CASE #2: optimistic lock
  const snap = window._editNoteSnapshot;
  if (snap && snap.id === id && snap.originalMsg !== n.messaggio) {
    toast("La nota e' stata modificata altrove. Riapri il messaggio per vedere la versione aggiornata.");
    document.getElementById('pwd-modal').classList.add('hidden');
    window._editNoteSnapshot = null;
    return;
  }
  // ENTERPRISE: 1 sola PATCH su chat_messages
  const msgEnc = await encryptNota(msg);
  try {
    await _chatPatchMessage(id, { messaggio: msgEnc });
    // Aggiorna anche la cache locale chat_messages con il testo decifrato per uso immediato
    const cm = chatMessagesCache.find((x) => x.id === id);
    if (cm) {
      cm.messaggio = msg;
      cm._decrypted = true;
    }
    _chatBuildNoteCache();
    document.getElementById('pwd-modal').classList.add('hidden');
    window._editNoteSnapshot = null;
    renderNoteCollega();
    toast('Nota modificata');
  } catch (e) {
    toast('Errore modifica nota');
  }
}
async function eliminaNotaSmart(id) {
  // ENTERPRISE: id e' chat_messages.id. Check letti via chat_message_letti.
  const cm = _chatFindMsg(id);
  if (!cm) return;
  const letti = _chatLetti(id).filter((l) => l.operatore !== cm.da_operatore);
  const qualcunoHaLetto = letti.length > 0;
  if (!qualcunoHaLetto) {
    if (!confirm("Nessuno ha ancora letto. Annullare l'invio per tutti?")) return;
    try {
      await _chatDeleteMessage(id);
      renderNoteCollega();
      toast('Invio annullato per tutti');
    } catch (e) {
      toast('Errore');
    }
  } else {
    if (!confirm('Eliminare dalla tua vista?')) return;
    try {
      await _chatPatchMessage(id, { nascosta_mitt: true });
      renderNoteCollega();
      toast('Messaggio eliminato dalla tua vista');
    } catch (e) {
      toast('Errore');
    }
  }
}
async function annullaInvioNota(id) {
  const cm = _chatFindMsg(id);
  if (!cm) return;
  const letti = _chatLetti(id).filter((l) => l.operatore !== cm.da_operatore);
  const qualcunoHaLetto = letti.length > 0;
  if (qualcunoHaLetto) {
    if (!confirm('Qualcuno ha già letto questo messaggio. Eliminare solo dalla tua vista?')) return;
    try {
      await _chatPatchMessage(id, { nascosta_mitt: true });
      renderNoteCollega();
      toast('Messaggio nascosto per te');
    } catch (e) {
      toast('Errore');
    }
  } else {
    if (!confirm("Nessuno ha ancora letto. Annullare l'invio per tutti?")) return;
    try {
      await _chatDeleteMessage(id);
      renderNoteCollega();
      toast('Invio annullato per tutti');
    } catch (e) {
      toast('Errore annullamento invio');
    }
  }
}
// _migraNoteGruppi: OBSOLETA dopo refactor enterprise (la migrazione SQL ha gia' creato chat_groups)
async function _migraNoteGruppi() {
  return;
}
function renderNoteCollega() {
  const op = getOperatore();
  if (!op) return;
  const listEl = document.getElementById('note-conv-list');
  if (!listEl) return;
  // Build conversations from noteColleghiCache
  const myNotes = noteColleghiCache.filter((n) => {
    const isMitt = n.da_operatore === op && !n.nascosta_mitt;
    const isDest = n.a_operatore === op && !n.nascosta_dest;
    return isMitt || isDest;
  });
  // Group by conversation partner or group
  const convMap = {};
  myNotes.forEach((n) => {
    let key;
    if (n.gruppo_id && n.gruppo_id.startsWith('__gruppo_')) {
      // Persistent group (department or custom): always show as group for everyone
      key = 'gruppo:' + n.gruppo_id;
    } else if (n.gruppo_id) {
      // Legacy ad-hoc group: keep old behavior
      const gNotes = noteColleghiCache.filter((x) => x.gruppo_id === n.gruppo_id);
      const partners = new Set();
      gNotes.forEach((x) => {
        if (x.da_operatore !== op) partners.add(x.da_operatore);
        if (x.a_operatore !== op) partners.add(x.a_operatore);
      });
      if (partners.size > 1) {
        key = 'gruppo:' + n.gruppo_id;
      } else {
        key = partners.size === 1 ? [...partners][0] : n.da_operatore === op ? n.a_operatore : n.da_operatore;
      }
    } else if (!n.gruppo_id || !n.gruppo_id.startsWith('__gruppo_')) {
      key = n.da_operatore === op ? n.a_operatore : n.da_operatore;
    } else {
      key = 'gruppo:' + n.gruppo_id;
    }
    if (!convMap[key]) convMap[key] = { partner: key, notes: [], unread: 0, lastTime: '' };
    if (!convMap[key].notes.find((x) => x.id === n.id)) convMap[key].notes.push(n);
    if (n.a_operatore === op && !n.letta) convMap[key].unread++;
    const t = n.created_at || '';
    if (t > convMap[key].lastTime) convMap[key].lastTime = t;
  });
  // Lista unica ordinata per data ultimo messaggio (stile WhatsApp): groups e singoli mescolati
  const allConvs = Object.values(convMap).sort((a, b) => b.lastTime.localeCompare(a.lastTime));
  // Render conversation list
  let html =
    '<div style="position:relative"><div class="conv-new-btn" id="conv-new-wrap" onclick="toggleConvNewDropdown(event)">&#43; Nuova conversazione</div>';
  html +=
    '<div id="conv-new-dropdown" class="conv-new-dropdown" style="display:none;position:absolute;left:0;right:0;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div></div>';
  html +=
    '<div style="padding:8px 10px;border-bottom:1px solid var(--line)"><input type="text" id="conv-search-input" placeholder="&#128269; Cerca conversazione..." oninput="filtraConversazioni()" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:18px;font-size:.84rem;background:var(--paper);color:var(--ink);font-family:Source Sans 3,sans-serif;box-sizing:border-box"></div>';
  if (!allConvs.length) {
    html +=
      '<div style="padding:20px;text-align:center;color:var(--muted);font-size:.88rem">Nessuna conversazione</div>';
  }
  // Lista mescolata: l'ultimo che scrive (gruppo o persona) sale in cima
  allConvs.forEach((c) => {
    _renderConvItem(c);
  });
  function _renderConvItem(c) {
    const isActive = window._noteConvAttiva === c.partner;
    const isGroup = c.partner.startsWith('gruppo:');
    const _gid = isGroup ? c.partner.replace('gruppo:', '') : '';
    const _customNome = _gid.startsWith('__gruppo_custom_') ? _getGruppoNome(_gid) : '';
    const partnerLabel =
      _gid === '__gruppo_slots'
        ? 'Tutti Slots'
        : _gid === '__gruppo_tavoli'
          ? 'Tutti Tavoli'
          : _gid === '__gruppo_tutti'
            ? 'Tutti'
            : _customNome
              ? escP(_customNome)
              : isGroup
                ? _chatGroupLabel(c)
                : escP(c.partner);
    const lastNote = c.notes.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const _prevMsg = lastNote
      ? (lastNote.messaggio || '')
          .replace(/\[REPLY:\d+:[^:]*:[^\]]*\]/g, '')
          .replace(/\[GNAME:[^\]]*\]/g, '')
          .trim()
      : '';
    const preview = lastNote
      ? (lastNote.da_operatore === op ? 'Tu: ' : '') + _prevMsg.substring(0, 40) + (_prevMsg.length > 40 ? '...' : '')
      : '';
    const timeStr = lastNote ? _chatTimeShort(lastNote.created_at) : '';
    const rep = !isGroup ? operatoriRepartoMap[c.partner] || '' : '';
    const repBadge =
      rep === 'slots'
        ? '<span style="font-size:.6rem;color:#1a4a7a;font-weight:700;margin-left:4px">S</span>'
        : rep === 'tavoli'
          ? '<span style="font-size:.6rem;color:#8e44ad;font-weight:700;margin-left:4px">T</span>'
          : '';
    html +=
      '<div class="conv-item' +
      (isActive ? ' active' : '') +
      '" data-conv-name="' +
      (c.partner + ' ' + preview).toLowerCase().replace(/"/g, '') +
      '" onclick="apriConversazione(\'' +
      escP(c.partner).replace(/'/g, "\\'") +
      '\')">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    const _pLog = !isGroup ? logCache.find((l) => l.operatore === c.partner) : null;
    const _pOnline = _pLog && Date.now() - new Date(_pLog.created_at).getTime() < 300000;
    const _onlineDot = _pOnline
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2c6e49;margin-right:4px;vertical-align:middle"></span>'
      : '';
    html +=
      '<div style="font-weight:' +
      (c.unread > 0 ? '700' : '600') +
      ';font-size:.9rem;color:var(--ink)">' +
      _onlineDot +
      partnerLabel +
      repBadge +
      '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px">';
    if (c.unread > 0) html += '<span class="conv-badge">' + c.unread + '</span>';
    html += '<span style="font-size:.7rem;color:var(--muted)">' + timeStr + '</span>';
    html += '</div></div>';
    html +=
      '<div style="font-size:.8rem;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' +
      (c.unread > 0 ? ';font-weight:600;color:var(--ink)' : '') +
      '">' +
      escP(preview) +
      '</div>';
    html += '</div>';
  }
  listEl.innerHTML = html;
  // Position the dropdown correctly
  const wrapEl = document.getElementById('conv-new-wrap');
  if (wrapEl) wrapEl.style.position = 'relative';
  // Render active chat
  if (window._noteConvAttiva) {
    renderNoteChat(window._noteConvAttiva);
  } else {
    // Show placeholder on desktop
    const chatArea = document.getElementById('note-chat-area');
    const header = document.getElementById('note-chat-header');
    const msgs = document.getElementById('note-chat-messages');
    const inp = document.getElementById('note-chat-input');
    if (window.innerWidth > 700) {
      chatArea.classList.remove('chat-hidden');
      header.innerHTML = '<span style="color:var(--muted);font-weight:400">Note Colleghi</span>';
      msgs.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.95rem">Seleziona una conversazione</div>';
      inp.style.display = 'none';
    }
  }
}
function _nomeBreve(nome) {
  // "Pisano Pamela" → "Pamela P." / "Rondinella Alessio" → "Alessio R."
  const parts = (nome || '').trim().split(/\s+/);
  if (parts.length < 2) return nome;
  // Cognome = primo, Nome = secondo (convenzione casino)
  return parts.slice(1).join(' ') + ' ' + parts[0].charAt(0) + '.';
}
function _chatGroupLabel(conv) {
  const op = getOperatore();
  const partners = new Set();
  conv.notes.forEach((n) => {
    if (n.da_operatore !== op) partners.add(n.da_operatore);
    if (n.a_operatore !== op) partners.add(n.a_operatore);
  });
  const arr = [...partners];
  if (arr.length <= 3) return arr.map((p) => escP(_nomeBreve(p))).join(', ');
  return escP(_nomeBreve(arr[0])) + ', ' + escP(_nomeBreve(arr[1])) + ' +' + (arr.length - 2);
}
function _chatTimeShort(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const dateStr = isoStr.substring(0, 10);
  if (dateStr === today) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const ieri = new Date(now);
  ieri.setDate(ieri.getDate() - 1);
  if (dateStr === ieri.toISOString().substring(0, 10)) return 'Ieri';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}
function _chatDateLabel(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const dateStr = isoStr.substring(0, 10);
  if (dateStr === today) return 'Oggi';
  const ieri = new Date(now);
  ieri.setDate(ieri.getDate() - 1);
  if (dateStr === ieri.toISOString().substring(0, 10)) return 'Ieri';
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function toggleConvNewDropdown(ev) {
  ev.stopPropagation();
  const dd = document.getElementById('conv-new-dropdown');
  if (!dd) return;
  if (dd.style.display !== 'none') {
    dd.style.display = 'none';
    return;
  }
  const op = getOperatore();
  const tutti = operatoriAuthCache
    .map((o) => o.nome)
    .sort()
    .filter((n) => n && n !== op);
  const myRep = operatoriRepartoMap[op] || 'entrambi';
  let h = '';
  // Group buttons
  h +=
    '<div onclick="event.stopPropagation();apriConversazioneGruppo(\'tutti\')" style="font-weight:700;color:var(--ink)">Tutti</div>';
  if (myRep === 'slots' || myRep === 'entrambi')
    h +=
      '<div onclick="event.stopPropagation();apriConversazioneGruppo(\'slots\')" style="font-weight:700;color:#1a4a7a">Tutti Slots</div>';
  if (myRep === 'tavoli' || myRep === 'entrambi')
    h +=
      '<div onclick="event.stopPropagation();apriConversazioneGruppo(\'tavoli\')" style="font-weight:700;color:#8e44ad">Tutti Tavoli</div>';
  h += '<div style="height:1px;background:var(--line);padding:0;cursor:default"></div>';
  tutti.forEach((n) => {
    const rep = operatoriRepartoMap[n] || 'entrambi';
    const badge =
      rep === 'slots'
        ? ' <span style="font-size:.65rem;color:#1a4a7a;font-weight:700">S</span>'
        : rep === 'tavoli'
          ? ' <span style="font-size:.65rem;color:#8e44ad;font-weight:700">T</span>'
          : '';
    h +=
      '<div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()"><input type="checkbox" class="conv-group-cb" value="' +
      escP(n).replace(/"/g, '&quot;') +
      '" onchange="_aggiornaGruppoBtn()" style="cursor:pointer;width:16px;height:16px;flex-shrink:0"><span onclick="apriConversazione(\'' +
      escP(n).replace(/'/g, "\\'") +
      "');document.getElementById('conv-new-dropdown').style.display='none'\" style=\"flex:1;cursor:pointer\">" +
      escP(n) +
      badge +
      '</span></div>';
  });
  h +=
    '<div id="conv-group-action" style="display:none;padding:8px 12px;border-top:1px solid var(--line);text-align:center"><button onclick="event.stopPropagation();_apriGruppoSelezionato()" style="padding:6px 16px;background:var(--accent2);color:white;border:none;border-radius:2px;cursor:pointer;font-size:.84rem;font-weight:600;font-family:Source Sans 3,sans-serif">Crea gruppo (<span id="conv-group-count">0</span>)</button></div>';
  dd.innerHTML = h;
  dd.style.display = 'block';
  // Close on outside click
  setTimeout(() => {
    document.addEventListener(
      'click',
      function _cl() {
        dd.style.display = 'none';
        document.removeEventListener('click', _cl);
      },
      { once: true },
    );
  }, 0);
}
async function _rinominaGruppo(gid, partner) {
  const nomeAttuale = _getGruppoNome(gid) || '';
  const nuovo = prompt('Nuovo nome del gruppo:', nomeAttuale);
  if (nuovo === null) return;
  const label = nuovo.trim();
  if (label) localStorage.setItem('_gruppo_nome_' + gid, label);
  else localStorage.removeItem('_gruppo_nome_' + gid);
  // ENTERPRISE: aggiorna nome direttamente su chat_groups + invia messaggio sistema GNAME
  const op = getOperatore();
  const group = chatGroupsCache.find((g) => g.legacy_gid === gid || String(g.id) === gid);
  if (group && label) {
    try {
      await secPatch('chat_groups', 'id=eq.' + group.id, { nome: label });
      group.nome = label;
    } catch (e) {
      console.warn('Update nome gruppo:', e.message);
    }
  }
  if (group && label) {
    const msgTxt = '[GNAME:' + label + ']Gruppo rinominato in "' + label + '"';
    const msgEnc = await encryptNota(msgTxt);
    try {
      await _chatInsertMessage({ da: op, partner: 'gruppo:' + gid, messaggioCifrato: msgEnc, messaggioPlain: msgTxt });
    } catch (e) {
      console.warn('Send GNAME message:', e.message);
    }
  }
  logAzione('Gruppo rinominato', (nomeAttuale || 'senza nome') + ' → ' + (label || 'nomi automatici'));
  renderNoteChat(partner);
  renderNoteCollega();
  toast('Gruppo rinominato');
}
function _apriRimuoviMembri(gid, partner) {
  const op = getOperatore();
  const allGruppo = noteColleghiCache.filter((x) => x.gruppo_id === gid);
  const membri = new Set();
  allGruppo.forEach((n) => {
    if (n.da_operatore !== op) membri.add(n.da_operatore);
    if (n.a_operatore !== op) membri.add(n.a_operatore);
  });
  const arr = [...membri].sort();
  if (arr.length < 2) {
    toast('Il gruppo deve avere almeno 2 membri');
    return;
  }
  const mc = document.getElementById('pwd-modal-content');
  let html = '<h3>Rimuovi dal gruppo</h3>';
  html +=
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Seleziona chi rimuovere. I messaggi futuri non verranno più inviati a questa persona.</p>';
  html += '<div style="max-height:250px;overflow-y:auto">';
  arr.forEach((n) => {
    html +=
      '<div style="padding:6px 0;display:flex;align-items:center;gap:8px"><input type="checkbox" class="rm-member-cb" value="' +
      escP(n).replace(/"/g, '&quot;') +
      '" style="width:16px;height:16px"><span>' +
      escP(n) +
      '</span></div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" style="background:var(--accent)" onclick="_confermaRimuoviMembri(\'' +
    escP(gid).replace(/'/g, "\\'") +
    "','" +
    escP(partner).replace(/'/g, "\\'") +
    '\')">Rimuovi</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _confermaRimuoviMembri(gid, partner) {
  const cbs = document.querySelectorAll('.rm-member-cb:checked');
  const daRimuovere = [...cbs].map((cb) => cb.value);
  if (!daRimuovere.length) {
    toast('Seleziona almeno una persona');
    return;
  }
  const op = getOperatore();
  // ENTERPRISE: rimuovi membri direttamente da chat_group_members
  const group = chatGroupsCache.find((g) => g.legacy_gid === gid || String(g.id) === gid);
  if (!group) {
    toast('Gruppo non trovato');
    return;
  }
  for (const m of daRimuovere) {
    try {
      await secDel('chat_group_members', 'group_id=eq.' + group.id + '&operatore=eq.' + encodeURIComponent(m));
      chatGroupMembersCache = chatGroupMembersCache.filter((x) => !(x.group_id === group.id && x.operatore === m));
    } catch (e) {
      console.warn('Remove member fallita:', e.message);
    }
  }
  // Manda messaggio di sistema notificando la rimozione
  const msgTxt =
    daRimuovere.map((n) => _nomeBreve(n)).join(', ') +
    ' rimoss' +
    (daRimuovere.length === 1 ? 'o/a' : 'i') +
    ' dal gruppo';
  const msgEnc = await encryptNota(msgTxt);
  try {
    await _chatInsertMessage({ da: op, partner: 'gruppo:' + gid, messaggioCifrato: msgEnc, messaggioPlain: msgTxt });
  } catch (e) {}
  document.getElementById('pwd-modal').classList.add('hidden');
  logAzione('Membro rimosso dal gruppo', daRimuovere.join(', ') + ' rimossi da ' + (_getGruppoNome(gid) || 'gruppo'));
  renderNoteChat(partner);
  renderNoteCollega();
  toast(daRimuovere.map((n) => _nomeBreve(n)).join(', ') + ' rimoss' + (daRimuovere.length === 1 ? 'o/a' : 'i'));
}
function _aggiornaGruppoBtn() {
  const cbs = document.querySelectorAll('.conv-group-cb:checked');
  const action = document.getElementById('conv-group-action');
  const count = document.getElementById('conv-group-count');
  if (action) {
    action.style.display = cbs.length >= 2 ? 'block' : 'none';
  }
  if (count) count.textContent = cbs.length;
}
function _apriGruppoSelezionato() {
  const cbs = document.querySelectorAll('.conv-group-cb:checked');
  const dests = [...cbs].map((cb) => cb.value);
  if (dests.length < 2) {
    toast('Seleziona almeno 2 persone');
    return;
  }
  // Chiedi nome gruppo
  const nomeDefault =
    dests.length <= 3
      ? dests.map((n) => _nomeBreve(n)).join(', ')
      : _nomeBreve(dests[0]) + ', ' + _nomeBreve(dests[1]) + ' +' + (dests.length - 2);
  const nomeGruppo = prompt('Nome del gruppo (oppure lascia vuoto):', nomeDefault);
  if (nomeGruppo === null) return; // annullato
  const label = nomeGruppo.trim() || nomeDefault;
  const op = getOperatore();
  const membri = [op, ...dests].sort().join('|');
  // FIX EDGE CASE #3: per gruppi corti il gid e' come prima (backward compat),
  // per gruppi lunghi (>60 char puliti) appende un hash deterministico per evitare collisioni di troncamento.
  const _cleanMembri = membri.replace(/[^a-zA-Z0-9]/g, '_');
  let gid;
  if (_cleanMembri.length <= 60) {
    gid = '__gruppo_custom_' + _cleanMembri;
  } else {
    // Hash djb2 short, alphanumeric — guarantees uniqueness anche per truncation collisions
    let _h = 5381;
    for (let _i = 0; _i < _cleanMembri.length; _i++) _h = ((_h << 5) + _h + _cleanMembri.charCodeAt(_i)) | 0;
    const _hash = Math.abs(_h).toString(36);
    gid = '__gruppo_custom_' + _cleanMembri.substring(0, 50) + '_' + _hash;
  }
  // Salva nome gruppo in localStorage + nel gid per condividerlo
  localStorage.setItem('_gruppo_nome_' + gid, label);
  window._noteConvGruppo = { reparto: 'custom', dests: dests, gid: gid, label: label };
  window._noteConvAttiva = 'gruppo:' + gid;
  const dd = document.getElementById('conv-new-dropdown');
  if (dd) dd.style.display = 'none';
  _chatShowArea();
  renderNoteChat(window._noteConvAttiva);
  renderNoteCollega();
}
function _getGruppoNome(gid) {
  const ls = localStorage.getItem('_gruppo_nome_' + gid);
  if (ls) return ls;
  // Cerca il nome più recente nei messaggi del gruppo (tag [GNAME:...])
  const notes = noteColleghiCache
    .filter((n) => n.gruppo_id === gid && (n.messaggio || '').includes('[GNAME:'))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (notes.length) {
    const gm = (notes[0].messaggio || '').match(/\[GNAME:([^\]]+)\]/);
    if (gm) {
      localStorage.setItem('_gruppo_nome_' + gid, gm[1]);
      return gm[1];
    }
  }
  return '';
}
function _apriAggiungiMembri(gid, partner) {
  const op = getOperatore();
  // Trova membri attuali dal DB
  const allGruppo = noteColleghiCache.filter((x) => x.gruppo_id === gid);
  const membriAttuali = new Set();
  membriAttuali.add(op);
  allGruppo.forEach((n) => {
    membriAttuali.add(n.da_operatore);
    membriAttuali.add(n.a_operatore);
  });
  // Tutti gli operatori disponibili
  const tutti = operatoriAuthCache
    .map((o) => o.nome)
    .sort()
    .filter((n) => n && !membriAttuali.has(n));
  if (!tutti.length) {
    toast('Tutti gli operatori sono già nel gruppo');
    return;
  }
  const mc = document.getElementById('pwd-modal-content');
  let html = '<h3>Aggiungi al gruppo</h3>';
  html +=
    '<p style="color:var(--muted);font-size:.84rem;margin-bottom:12px">Membri attuali: ' +
    [...membriAttuali].map((n) => escP(_nomeBreve(n))).join(', ') +
    '</p>';
  html += '<div style="max-height:250px;overflow-y:auto">';
  tutti.forEach((n) => {
    const rep = operatoriRepartoMap[n] || 'entrambi';
    const badge =
      rep === 'slots'
        ? ' <span style="font-size:.65rem;color:#1a4a7a;font-weight:700">S</span>'
        : rep === 'tavoli'
          ? ' <span style="font-size:.65rem;color:#8e44ad;font-weight:700">T</span>'
          : '';
    html +=
      '<div style="padding:6px 0;display:flex;align-items:center;gap:8px"><input type="checkbox" class="add-member-cb" value="' +
      escP(n).replace(/"/g, '&quot;') +
      '" style="width:16px;height:16px"><span>' +
      escP(n) +
      badge +
      '</span></div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="_confermaAggiungiMembri(\'' +
    escP(gid).replace(/'/g, "\\'") +
    "','" +
    escP(partner).replace(/'/g, "\\'") +
    '\')">Aggiungi</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _confermaAggiungiMembri(gid, partner) {
  const cbs = document.querySelectorAll('.add-member-cb:checked');
  const nuovi = [...cbs].map((cb) => cb.value);
  if (!nuovi.length) {
    toast('Seleziona almeno una persona');
    return;
  }
  const op = getOperatore();
  const msgTxt =
    nuovi.map((n) => _nomeBreve(n)).join(', ') + ' aggiunt' + (nuovi.length === 1 ? 'o/a' : 'i') + ' al gruppo';
  const msgEnc = await encryptNota(msgTxt);
  try {
    // ENTERPRISE: aggiungi membri direttamente in chat_group_members + invia messaggio sistema
    const group = chatGroupsCache.find((g) => g.legacy_gid === gid || String(g.id) === gid);
    if (group) {
      for (const m of nuovi) {
        if (!chatGroupMembersCache.some((x) => x.group_id === group.id && x.operatore === m)) {
          try {
            await secPost('chat_group_members', { group_id: group.id, operatore: m });
            chatGroupMembersCache.push({ group_id: group.id, operatore: m, joined_at: new Date().toISOString() });
          } catch (e) {
            console.warn('Add member fallita:', e.message);
          }
        }
      }
    }
    // Messaggio di sistema notificando l'aggiunta
    await _chatInsertMessage({ da: op, partner: 'gruppo:' + gid, messaggioCifrato: msgEnc, messaggioPlain: msgTxt });
    document.getElementById('pwd-modal').classList.add('hidden');
    // Aggiorna nome gruppo se salvato
    const nomeGruppo = _getGruppoNome(gid);
    if (!nomeGruppo) {
      const allMembri = new Set();
      noteColleghiCache
        .filter((x) => x.gruppo_id === gid)
        .forEach((n) => {
          if (n.da_operatore !== op) allMembri.add(n.da_operatore);
          if (n.a_operatore !== op) allMembri.add(n.a_operatore);
        });
      const arr = [...allMembri];
      const newLabel =
        arr.length <= 3
          ? arr.map((n) => _nomeBreve(n)).join(', ')
          : _nomeBreve(arr[0]) + ', ' + _nomeBreve(arr[1]) + ' +' + (arr.length - 2);
      // Non salva in localStorage, si ricalcola automaticamente
    }
    renderNoteChat(partner);
    renderNoteCollega();
    toast(nuovi.map((n) => _nomeBreve(n)).join(', ') + ' aggiunt' + (nuovi.length === 1 ? 'o/a' : 'i') + ' al gruppo');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
function apriConversazioneGruppo(reparto) {
  const op = getOperatore();
  const dests = operatoriAuthCache
    .map((o) => o.nome)
    .filter((n) => {
      if (!n || n === op) return false;
      if (reparto === 'tutti') return true;
      const r = operatoriRepartoMap[n] || 'entrambi';
      return r === reparto || r === 'entrambi';
    });
  if (!dests.length) {
    toast('Nessun operatore');
    return;
  }
  const gid = '__gruppo_' + reparto;
  window._noteConvGruppo = { reparto: reparto, dests: dests, gid: gid };
  window._noteConvAttiva = 'gruppo:' + gid;
  const dd = document.getElementById('conv-new-dropdown');
  if (dd) dd.style.display = 'none';
  _chatShowArea();
  renderNoteChat(window._noteConvAttiva);
  renderNoteCollega();
}
function apriConversazione(partner) {
  window._noteConvAttiva = partner;
  window._noteConvGruppo = null;
  const dd = document.getElementById('conv-new-dropdown');
  if (dd) dd.style.display = 'none';
  // ENTERPRISE: marca come letti i messaggi non ancora letti dall'operatore corrente
  const op = getOperatore();
  const ora = new Date().toISOString();
  const conv = _getConvNotes(partner, op);
  // Filtra: messaggi diretti a me oppure messaggi gruppo non miei che non ho ancora letto
  const daLeggere = conv.filter((n) => n.a_operatore === op && !n.letta && n.da_operatore !== op);
  if (daLeggere.length) {
    // Optimistic: aggiungi entry in chatLettiCache
    const tk = getOpToken();
    const messageIds = [...new Set(daLeggere.map((n) => n._chat_id || n.id))];
    for (const mid of messageIds) {
      if (!chatLettiCache.some((l) => l.message_id === mid && l.operatore === op)) {
        chatLettiCache.push({ message_id: mid, operatore: op, letta_at: ora });
      }
    }
    _chatBuildNoteCache();
    aggiornaNoteBadge();
    (async () => {
      const failed = [];
      for (const mid of messageIds) {
        try {
          await sbRpc('chat_mark_letta', { p_token: tk, p_message_id: mid });
        } catch (e) {
          console.error('chat_mark_letta fallito per id ' + mid + ':', e.message);
          failed.push(mid);
        }
      }
      if (failed.length) {
        // Rollback dei falliti
        chatLettiCache = chatLettiCache.filter((l) => !(failed.includes(l.message_id) && l.operatore === op));
        _chatBuildNoteCache();
        aggiornaNoteBadge();
        const pg = localStorage.getItem('pagina_corrente');
        if (pg === 'note-collega') renderNoteCollega();
        toast(failed.length + ' messaggi non marcati letti (errore rete)');
      }
    })();
  }
  // Show chat area on mobile
  _chatShowArea();
  renderNoteChat(partner);
  renderNoteCollega();
  // Se c'è una ricerca attiva, trova e scrolla al primo messaggio che matcha
  if (_convSearchQuery) {
    const ql = _convSearchQuery;
    requestAnimationFrame(() => {
      const bubbles = document.querySelectorAll('.chat-bubble');
      let found = null;
      bubbles.forEach((b) => {
        if (found) return;
        const txt = (b.textContent || '').toLowerCase();
        if (txt.includes(ql)) found = b;
      });
      if (found) {
        found.scrollIntoView({ behavior: 'smooth', block: 'center' });
        found.style.transition = 'background .3s';
        found.style.background = 'rgba(46,204,113,0.4)';
        setTimeout(() => {
          found.style.background = '';
        }, 2000);
      }
      // Pulisci la ricerca dopo
      _convSearchQuery = '';
      const si = document.getElementById('conv-search-input');
      if (si) si.value = '';
      document.querySelectorAll('.conv-item').forEach((el) => (el.style.display = ''));
    });
  }
}
function _chatShowArea() {
  if (window.innerWidth <= 700) {
    document.getElementById('note-conv-list').classList.add('chat-hidden');
    document.getElementById('note-chat-area').classList.remove('chat-hidden');
  } else {
    document.getElementById('note-chat-area').classList.remove('chat-hidden');
  }
}
function _chatBackToList() {
  window._noteConvAttiva = null;
  window._noteConvGruppo = null;
  document.getElementById('note-conv-list').classList.remove('chat-hidden');
  document.getElementById('note-chat-area').classList.add('chat-hidden');
  renderNoteCollega();
}
function _getConvNotes(partner, op) {
  if (partner.startsWith('gruppo:')) {
    const gid = partner.replace('gruppo:', '');
    // Persistent group: get all messages, deduplicate intelligente
    if (gid.startsWith('__gruppo_')) {
      const all = noteColleghiCache.filter(
        (n) =>
          n.gruppo_id === gid &&
          ((n.da_operatore === op && !n.nascosta_mitt) || (n.a_operatore === op && !n.nascosta_dest)),
      );
      // FIX BUG #1 + REGRESSIONE: dedup per inviati con doppio approccio:
      // 1. Nuovi messaggi (post-fix): hanno created_at IDENTICO su tutte le righe del batch (set esplicito in inviaNotaChat) → match esatto
      // 2. Messaggi vecchi (pre-fix): timestamp leggermente diversi → fallback con contenuto + finestra 30s
      // Per ricevuti ogni riga e' unica per id (no dedup needed).
      // Sort cronologico desc per gestire correttamente la finestra
      const sorted = all.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const seen = new Set();
      const seenSent = new Map(); // key=da_op|gid|content50, value=last_ts_ms
      const result = [];
      sorted.forEach((n) => {
        const isSent = n.da_operatore === op;
        if (isSent) {
          // Step 1: prova match esatto (nuovi messaggi col batch_ts esplicito)
          const exactKey = 's:' + n.da_operatore + '|' + n.gruppo_id + '|' + (n.created_at || '');
          if (seen.has(exactKey)) return;
          // Step 2: fallback per messaggi vecchi - finestra 30s su (sender + content)
          const contentKey = n.da_operatore + '|' + n.gruppo_id + '|' + (n.messaggio || '').substring(0, 80);
          const currTs = new Date(n.created_at || 0).getTime();
          const lastTs = seenSent.get(contentKey);
          if (lastTs !== undefined && Math.abs(currTs - lastTs) < 30000) return; // stesso batch (entro 30s, stesso contenuto)
          seen.add(exactKey);
          seenSent.set(contentKey, currTs);
          result.push(n);
        } else {
          // Ricevuti: ogni riga unica, no dedup
          const key = 'r:' + n.id;
          if (!seen.has(key)) {
            seen.add(key);
            result.push(n);
          }
        }
      });
      // Restore chronological order ascending (oldest first) per la chat
      return result.reverse();
    }
    return noteColleghiCache.filter(
      (n) =>
        n.gruppo_id === gid &&
        ((n.da_operatore === op && !n.nascosta_mitt) || (n.a_operatore === op && !n.nascosta_dest)),
    );
  }
  return noteColleghiCache.filter((n) => {
    // Escludi messaggi di gruppi persistenti dalle chat 1-a-1
    if (n.gruppo_id && n.gruppo_id.startsWith('__gruppo_')) return false;
    const isSent = n.da_operatore === op && n.a_operatore === partner && !n.nascosta_mitt;
    const isRecv = n.a_operatore === op && n.da_operatore === partner && !n.nascosta_dest;
    return isSent || isRecv;
  });
}
function renderNoteChat(partner) {
  const op = getOperatore();
  const chatArea = document.getElementById('note-chat-area');
  const header = document.getElementById('note-chat-header');
  const msgsEl = document.getElementById('note-chat-messages');
  const inp = document.getElementById('note-chat-input');
  chatArea.classList.remove('chat-hidden');
  // Show star filter bar
  const _sfBar = document.getElementById('note-chat-star-filter');
  if (_sfBar) _sfBar.style.display = 'block';
  // Header
  const isGroup = partner.startsWith('gruppo:');
  const _gidChat = isGroup ? partner.replace('gruppo:', '') : '';
  const isPersistentGroup = _gidChat.startsWith('__gruppo_');
  let headerLabel = '';
  let _groupMembersHtml = '';
  let _grpAdmin = '';
  const isCustomGroup = _gidChat.startsWith('__gruppo_custom_');
  if (isPersistentGroup) {
    let headerGruppo = '',
      membri = [];
    if (isCustomGroup) {
      // Custom group: derive members from notes or from _noteConvGruppo
      if (window._noteConvGruppo && window._noteConvGruppo.gid === _gidChat) {
        headerGruppo = window._noteConvGruppo.label || _getGruppoNome(_gidChat) || 'Gruppo';
        membri = window._noteConvGruppo.dests || [];
      } else {
        // Cerca tutti i membri dal DB originale (non deduplicato)
        const allGruppo = noteColleghiCache.filter((x) => x.gruppo_id === _gidChat);
        const ps = new Set();
        allGruppo.forEach((n) => {
          if (n.da_operatore !== op) ps.add(n.da_operatore);
          if (n.a_operatore !== op) ps.add(n.a_operatore);
        });
        membri = [...ps];
        headerGruppo =
          _getGruppoNome(_gidChat) ||
          (membri.length <= 3
            ? membri.map((n) => _nomeBreve(n)).join(', ')
            : _nomeBreve(membri[0]) + ', ' + _nomeBreve(membri[1]) + ' +' + (membri.length - 2));
      }
      headerLabel = headerGruppo;
    } else {
      const rep = _gidChat.replace('__gruppo_', '');
      headerLabel = rep === 'tutti' ? 'Tutti' : 'Tutti ' + (rep === 'slots' ? 'Slots' : 'Tavoli');
      membri = operatoriAuthCache
        .map((o) => o.nome)
        .filter((n) => {
          if (!n || n === op) return false;
          if (rep === 'tutti') return true;
          const r = operatoriRepartoMap[n] || 'entrambi';
          return r === rep || r === 'entrambi';
        });
    }
    // Trova admin del gruppo (creatore = primo messaggio)
    const _allGrpNotes = noteColleghiCache
      .filter((x) => x.gruppo_id === _gidChat)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    _grpAdmin = _allGrpNotes.length ? _allGrpNotes[0].da_operatore : '';
    const _isMyAdmin = _grpAdmin === op;
    const _adminBadge =
      '<span style="background:var(--accent2);color:white;font-size:.6rem;padding:0 4px;border-radius:8px;margin-left:2px;font-weight:700;vertical-align:middle">A</span>';
    _groupMembersHtml =
      '<div class="group-members-tooltip" style="display:none;position:absolute;top:100%;left:0;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:100;font-size:.82rem;max-width:300px;line-height:1.6">' +
      ['Tu' + (_isMyAdmin ? _adminBadge : '')]
        .concat(membri.sort().map((n) => escP(n) + (n === _grpAdmin ? _adminBadge : '')))
        .map(
          (n) =>
            '<span style="display:inline-block;margin:2px 4px;padding:1px 8px;background:var(--paper2);border-radius:12px;font-size:.78rem">' +
            n +
            '</span>',
        )
        .join('') +
      '</div>';
  } else if (isGroup) {
    const conv = _getConvNotes(partner, op);
    const partners = new Set();
    conv.forEach((n) => {
      if (n.da_operatore !== op) partners.add(n.da_operatore);
      if (n.a_operatore !== op) partners.add(n.a_operatore);
    });
    headerLabel = [...partners].join(', ');
  } else {
    headerLabel = escP(partner);
  }
  // Ultimo visto da log_attivita
  let _lastSeenHtml = '';
  if (!isGroup) {
    const _lastLog = logCache.find((l) => l.operatore === partner);
    if (_lastLog) {
      const _lsDate = new Date(_lastLog.created_at);
      const _now = new Date();
      const _diffMin = Math.round((_now - _lsDate) / 60000);
      let _lsText = '';
      if (_diffMin < 2) _lsText = 'online';
      else if (_diffMin < 60) _lsText = 'attivo ' + _diffMin + ' min fa';
      else if (_diffMin < 1440) {
        const h = Math.floor(_diffMin / 60);
        _lsText = 'attivo ' + h + 'h fa';
      } else {
        _lsText =
          'visto il ' +
          _lsDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
          ' alle ' +
          _lsDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      }
      const _lsColor = _diffMin < 5 ? '#2c6e49' : _diffMin < 60 ? '#e67e22' : 'var(--muted)';
      const _lsDot =
        _diffMin < 5
          ? ' <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2c6e49;vertical-align:middle"></span>'
          : '';
      _lastSeenHtml =
        '<div style="font-size:.75rem;color:' + _lsColor + ';font-weight:400">' + _lsText + _lsDot + '</div>';
    }
  }
  const backBtn =
    '<button class="chat-back-btn" onclick="_chatBackToList()" style="display:none;background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--ink);padding:4px 8px" title="Indietro">&#8592;</button>';
  const searchBtn =
    '<button onclick="apriCercaChat()" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--muted);padding:4px 8px" title="Cerca">&#128269;</button>';
  const _gpEsc = escP(_gidChat).replace(/'/g, "\\'");
  const _ptEsc = escP(partner).replace(/'/g, "\\'");
  const _amIAdmin = isCustomGroup && _grpAdmin === op;
  const addMemberBtn =
    isCustomGroup && _amIAdmin
      ? '<button onclick="_apriAggiungiMembri(\'' +
        _gpEsc +
        "','" +
        _ptEsc +
        '\')" style="background:none;border:none;cursor:pointer;font-size:1rem;color:var(--accent2);padding:4px 6px" title="Aggiungi membri">&#43;</button><button onclick="_rinominaGruppo(\'' +
        _gpEsc +
        "','" +
        _ptEsc +
        '\')" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--muted);padding:4px 6px" title="Rinomina gruppo">&#9998;</button><button onclick="_apriRimuoviMembri(\'' +
        _gpEsc +
        "','" +
        _ptEsc +
        '\')" style="background:none;border:none;cursor:pointer;font-size:.9rem;color:var(--muted);padding:4px 6px" title="Rimuovi membro">&#128101;</button>'
      : '';
  const starFilterBtn =
    '<button class="btn-star-filter' +
    (_starFilterActive ? ' active' : '') +
    '" onclick="toggleStarFilter()" style="margin-left:4px" title="Filtra importanti">&#9733;</button>';
  header.innerHTML =
    backBtn +
    '<div style="flex:1;position:relative"><div style="cursor:' +
    (isPersistentGroup ? 'pointer' : 'default') +
    "\" onclick=\"var t=this.parentElement.querySelector('.group-members-tooltip');if(t)t.style.display=t.style.display==='none'?'block':'none'\" onmouseenter=\"var t=this.parentElement.querySelector('.group-members-tooltip');if(t)t.style.display='block'\" onmouseleave=\"var t=this.parentElement.querySelector('.group-members-tooltip');if(t)t.style.display='none'\">" +
    headerLabel +
    (isPersistentGroup ? ' <span style="font-size:.7rem;color:var(--muted)">&#9660;</span>' : '') +
    '</div>' +
    _groupMembersHtml +
    _lastSeenHtml +
    '</div>' +
    addMemberBtn +
    starFilterBtn +
    searchBtn;
  // Show input
  inp.style.display = 'flex';
  // Messages
  if (isPersistentGroup && !_getConvNotes(partner, op).length) {
    msgsEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.9rem">Scrivi un messaggio al gruppo</div>';
    return;
  }
  let notes = _getConvNotes(partner, op).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  if (_starFilterActive) notes = notes.filter((n) => n.importante);
  if (!notes.length) {
    msgsEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.9rem">' +
      (_starFilterActive ? 'Nessun messaggio importante' : 'Nessun messaggio. Inizia la conversazione!') +
      '</div>';
    return;
  }
  let html = '';
  let lastDate = '';
  notes.forEach((n) => {
    const dateStr = (n.created_at || '').substring(0, 10);
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      html += '<div class="chat-date-sep">' + _chatDateLabel(n.created_at) + '</div>';
    }
    const isSent = n.da_operatore === op;
    const cls = isSent ? 'sent' : 'received';
    const time = new Date(n.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    // Ticks for sent messages
    let ticks = '';
    if (isSent) {
      if (n.letta) ticks = '<span class="chat-ticks read">&#10003;&#10003;</span>';
      else ticks = '<span class="chat-ticks unread">&#10003;</span>';
    }
    // Sender label for group chats (WhatsApp style)
    let senderLabel = '';
    if (isGroup && !isSent) senderLabel = '<div class="chat-sender-label">' + escP(n.da_operatore) + '</div>';
    if (isGroup && isSent) senderLabel = '<div class="chat-sender-label" style="color:#b8860b">Tu</div>';
    // Group read status: aggregated (3/5 letti)
    let destLabel = '';
    if (isSent && n.gruppo_id && isGroup) {
      // Trova tutte le copie di questo messaggio (stesso gruppo_id, stesso mittente, stesso testo)
      const _nTimeR = new Date(n.created_at || 0).getTime();
      const gNotes = noteColleghiCache.filter(
        (x) =>
          x.gruppo_id === n.gruppo_id &&
          x.da_operatore === op &&
          (x.messaggio || '') === (n.messaggio || '') &&
          Math.abs(new Date(x.created_at || 0).getTime() - _nTimeR) < 10000,
      );
      // Deduplicare per destinatario (evita nomi doppi)
      const _byDest = {};
      gNotes.forEach((x) => {
        if (!_byDest[x.a_operatore]) _byDest[x.a_operatore] = x;
      });
      const gNotesUniq = Object.values(_byDest);
      if (gNotesUniq.length > 1) {
        const lettiList = [...new Set(gNotesUniq.filter((x) => x.letta).map((x) => x.a_operatore))];
        const nonLettiList = [...new Set(gNotesUniq.filter((x) => !x.letta).map((x) => x.a_operatore))];
        const letti = lettiList.length;
        const tooltipId = 'read-tip-' + n.id;
        let tooltipHtml =
          '<div id="' +
          tooltipId +
          '" style="display:none;position:absolute;bottom:100%;left:0;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:100;font-size:.78rem;min-width:160px;max-width:280px">';
        if (lettiList.length)
          tooltipHtml +=
            '<div style="color:#2c6e49;margin-bottom:4px"><strong>&#10003;&#10003; Letto da:</strong></div>' +
            lettiList.map((n) => '<div style="padding:1px 0">' + escP(n) + '</div>').join('');
        if (nonLettiList.length)
          tooltipHtml +=
            '<div style="color:var(--muted);margin-top:6px"><strong>&#10003; Non letto:</strong></div>' +
            nonLettiList.map((n) => '<div style="padding:1px 0">' + escP(n) + '</div>').join('');
        tooltipHtml += '</div>';
        destLabel =
          '<div class="chat-group-label" style="font-size:.7rem;color:var(--muted);cursor:pointer;position:relative" onmouseenter="document.getElementById(\'' +
          tooltipId +
          "').style.display='block'\" onmouseleave=\"document.getElementById('" +
          tooltipId +
          "').style.display='none'\" onclick=\"var t=document.getElementById('" +
          tooltipId +
          "');t.style.display=t.style.display==='none'?'block':'none'\">" +
          letti +
          '/' +
          gNotesUniq.length +
          ' letti' +
          tooltipHtml +
          '</div>';
      }
    }
    // Action buttons
    const _qualcunoLetto =
      isSent && n.gruppo_id
        ? noteColleghiCache.some(
            (x) =>
              x.gruppo_id === n.gruppo_id &&
              x.da_operatore === op &&
              (x.messaggio || '') === (n.messaggio || '') &&
              x.letta,
          )
        : n.letta;
    const canEdit = isSent && !_qualcunoLetto;
    let actions = '<div class="chat-msg-actions">';
    actions +=
      '<button class="btn-act" style="font-size:.65rem;padding:2px 6px;color:#d4a017;border-color:#d4a017" onclick="event.stopPropagation();toggleImportante(' +
      n.id +
      ')" title="' +
      (n.importante ? 'Rimuovi importante' : 'Segna importante') +
      '">' +
      (n.importante ? '&#9733;' : '&#9734;') +
      '</button>';
    if (canEdit)
      actions +=
        '<button class="btn-act tipo" style="font-size:.65rem;padding:2px 6px" onclick="event.stopPropagation();modificaNotaCollega(' +
        n.id +
        ')" title="Modifica">&#9998;</button>';
    if (isSent)
      actions +=
        '<button class="btn-act del" style="font-size:.65rem;padding:2px 6px" onclick="event.stopPropagation();eliminaNotaSmart(' +
        n.id +
        ')" title="Elimina">&#128465;</button>';
    else
      actions +=
        '<button class="btn-act" style="font-size:.65rem;padding:2px 6px;color:var(--muted);border-color:var(--muted)" onclick="event.stopPropagation();eliminaNotaCollega(' +
        n.id +
        ',\'dest\')" title="Elimina per me">&#128465;</button>';
    actions +=
      '<button class="btn-act" style="font-size:.65rem;padding:2px 6px;color:var(--accent2);border-color:var(--accent2)" onclick="event.stopPropagation();rispondiAMessaggio(' +
      n.id +
      ')" title="Rispondi">&#8617;</button>';
    actions +=
      '<button class="btn-act" style="font-size:.65rem;padding:2px 6px;color:var(--muted);border-color:var(--muted)" onclick="event.stopPropagation();inoltraMessaggio(' +
      n.id +
      ')" title="Inoltra">&#10132;</button>';
    actions += '</div>';
    // Parse reply quote
    let msgText = (n.messaggio || '').replace(/\[GNAME:[^\]]*\]/g, '');
    let quoteHtml = '';
    const replyMatch = msgText.match(/^\[REPLY:(\d+):([^:]*):([^\]]*)\]/);
    if (replyMatch) {
      msgText = msgText.substring(replyMatch[0].length);
      quoteHtml =
        '<div class="chat-quote" onclick="scrollToNote(' +
        replyMatch[1] +
        ')"><div class="quote-name">' +
        escP(replyMatch[2]) +
        '</div><div>' +
        escP(replyMatch[3].substring(0, 80)) +
        '</div></div>';
    }
    // Render reactions
    let reactionsHtml = renderReazioni(n);
    const _extraCls = (n.importante ? ' importante' : '') + (n.urgente ? ' urgente' : '');
    html +=
      '<div class="chat-bubble ' +
      cls +
      _extraCls +
      '" id="note-bubble-' +
      n.id +
      '" style="position:relative" ontouchstart="_reactionTouchStart(event,' +
      n.id +
      ')" ontouchend="_reactionTouchEnd(' +
      n.id +
      ')" ontouchmove="_reactionTouchCancel(' +
      n.id +
      ')">';
    html +=
      '<div class="reaction-picker" id="reaction-picker-' +
      n.id +
      '">' +
      _REACTION_EMOJIS
        .map(
          (e) =>
            '<button onclick="event.stopPropagation();toggleReazione(' + n.id + ",'" + e + '\')">' + e + '</button>',
        )
        .join('') +
      '</div>';
    if (n.urgente) html += '<div class="urgente-label">&#10071; URGENTE</div>';
    html += senderLabel + destLabel + quoteHtml;
    html += '<div>' + esc(msgText) + '</div>';
    const _starIcon = n.importante
      ? '<span class="chat-star-icon" onclick="event.stopPropagation();toggleImportante(' +
        n.id +
        ')" title="Importante">&#9733;</span>'
      : '';
    html += '<div class="chat-time">' + _starIcon + time + ' ' + ticks + '</div>';
    html += reactionsHtml;
    html += actions;
    html += '</div>';
  });
  msgsEl.innerHTML = html;
  // Auto-scroll to bottom (con delay per rendering DOM)
  requestAnimationFrame(() => {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  });
  // Desktop hover per reaction picker: doppio click
  if (window.innerWidth > 700) {
    msgsEl.querySelectorAll('.chat-bubble').forEach((bubble) => {
      bubble.addEventListener('dblclick', function (e) {
        if (
          e.target.closest('.chat-msg-actions') ||
          e.target.closest('.reaction-badge') ||
          e.target.closest('.reaction-picker')
        )
          return;
        _closeAllReactionPickers();
        const picker = bubble.querySelector('.reaction-picker');
        if (picker) picker.classList.add('show');
        e.preventDefault();
      });
    });
  }
}
// Reply state
let _replyToNote = null;
function rispondiAMessaggio(noteId) {
  const note = noteColleghiCache.find((n) => n.id === noteId);
  if (!note) return;
  _replyToNote = note;
  const bar = document.getElementById('note-chat-reply-bar');
  const nameEl = document.getElementById('reply-preview-name');
  const textEl = document.getElementById('reply-preview-text');
  if (bar && nameEl && textEl) {
    nameEl.textContent = note.da_operatore;
    let previewMsg = note.messaggio || '';
    const rm = previewMsg.match(/^\[REPLY:\d+:[^:]*:[^\]]*\]/);
    if (rm) previewMsg = previewMsg.substring(rm[0].length);
    textEl.textContent = previewMsg.substring(0, 80) + (previewMsg.length > 80 ? '...' : '');
    bar.style.display = 'flex';
  }
  document.getElementById('nota-msg-chat').focus();
}
function annullaRispondi() {
  _replyToNote = null;
  const bar = document.getElementById('note-chat-reply-bar');
  if (bar) bar.style.display = 'none';
}
function scrollToNote(noteId) {
  const el = document.getElementById('note-bubble-' + noteId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.background = 'rgba(184,134,11,0.15)';
    setTimeout(() => (el.style.background = ''), 1500);
  }
}
// ===== EMOJI REACTIONS =====
const _REACTION_EMOJIS = ['👍', '✅', '❤️', '😂', '😮', '🙏'];
let _reactionTimers = {};
function _reactionTouchStart(e, noteId) {
  if (
    e.target.closest('.chat-msg-actions') ||
    e.target.closest('.reaction-badge') ||
    e.target.closest('.reaction-picker')
  )
    return;
  _reactionTimers[noteId] = setTimeout(() => {
    _closeAllReactionPickers();
    const picker = document.getElementById('reaction-picker-' + noteId);
    if (picker) picker.classList.add('show');
    _reactionTimers[noteId] = null;
  }, 500);
}
function _reactionTouchEnd(noteId) {
  if (_reactionTimers[noteId]) {
    clearTimeout(_reactionTimers[noteId]);
    _reactionTimers[noteId] = null;
  }
}
function _reactionTouchCancel(noteId) {
  if (_reactionTimers[noteId]) {
    clearTimeout(_reactionTimers[noteId]);
    _reactionTimers[noteId] = null;
  }
}
function _closeAllReactionPickers() {
  document.querySelectorAll('.reaction-picker.show').forEach((p) => p.classList.remove('show'));
}
document.addEventListener('click', function (e) {
  if (!e.target.closest('.reaction-picker') && !e.target.closest('.reaction-badge')) _closeAllReactionPickers();
});
async function toggleReazione(noteId, emoji) {
  const op = getOperatore();
  if (!op) return;
  const n = noteColleghiCache.find((x) => x.id === noteId);
  if (!n) return;
  // FIX BUG #16: salva lo stato precedente per rollback in caso di fallimento PATCH
  const _reazioniPrecedenti = n.reazioni;
  let reazioni = n.reazioni || {};
  if (typeof reazioni === 'string') {
    try {
      reazioni = JSON.parse(reazioni);
    } catch (e) {
      reazioni = {};
    }
  }
  reazioni = { ...reazioni };
  if (!reazioni[emoji]) reazioni[emoji] = [];
  else reazioni[emoji] = [...reazioni[emoji]];
  const idx = reazioni[emoji].indexOf(op);
  if (idx >= 0) reazioni[emoji].splice(idx, 1);
  else reazioni[emoji].push(op);
  if (reazioni[emoji].length === 0) delete reazioni[emoji];
  n.reazioni = reazioni;
  _closeAllReactionPickers();
  // Update UI immediately (optimistic)
  const bubbleEl = document.getElementById('note-bubble-' + noteId);
  if (bubbleEl) {
    const oldR = bubbleEl.querySelector('.chat-reactions');
    const newR = document.createElement('div');
    newR.innerHTML = renderReazioni(n);
    const newEl = newR.firstChild;
    if (oldR && newEl) oldR.replaceWith(newEl);
    else if (oldR && !newEl) oldR.remove();
    else if (!oldR && newEl) {
      const timeEl = bubbleEl.querySelector('.chat-time');
      if (timeEl) timeEl.after(newEl);
    }
  }
  // Save to DB - ENTERPRISE: aggiorna chat_messages.reazioni
  try {
    await _chatPatchMessage(noteId, { reazioni: reazioni });
  } catch (e) {
    console.error('Errore salvataggio reazione:', e);
    // Rollback cache + UI
    n.reazioni = _reazioniPrecedenti;
    const cm = chatMessagesCache.find((x) => x.id === noteId);
    if (cm) cm.reazioni = _reazioniPrecedenti;
    _chatBuildNoteCache();
    if (bubbleEl) {
      const oldR = bubbleEl.querySelector('.chat-reactions');
      const newR = document.createElement('div');
      newR.innerHTML = renderReazioni(n);
      const newEl = newR.firstChild;
      if (oldR && newEl) oldR.replaceWith(newEl);
      else if (oldR && !newEl) oldR.remove();
      else if (!oldR && newEl) {
        const timeEl = bubbleEl.querySelector('.chat-time');
        if (timeEl) timeEl.after(newEl);
      }
    }
    toast('Errore salvataggio reazione, riprova');
  }
}
function renderReazioni(note) {
  let reazioni = note.reazioni || {};
  if (typeof reazioni === 'string') {
    try {
      reazioni = JSON.parse(reazioni);
    } catch (e) {
      reazioni = {};
    }
  }
  const keys = Object.keys(reazioni).filter((k) => reazioni[k] && reazioni[k].length > 0);
  if (!keys.length) return '';
  const op = getOperatore();
  let html = '<div class="chat-reactions">';
  keys.forEach((emoji) => {
    const nomi = reazioni[emoji];
    const isMine = nomi.includes(op);
    const tooltipText = nomi.join(', ');
    html +=
      '<span class="reaction-badge' +
      (isMine ? ' mine' : '') +
      '" onclick="event.stopPropagation();toggleReazione(' +
      note.id +
      ",'" +
      emoji +
      '\')">';
    html += '<span class="reaction-tooltip">' + escP(tooltipText) + '</span>';
    html += '<span class="r-emoji">' + emoji + '</span>';
    if (nomi.length > 1) html += '<span class="r-count">' + nomi.length + '</span>';
    html += '</span>';
  });
  html += '</div>';
  return html;
}
// ===== MESSAGE FORWARDING =====
function inoltraMessaggio(noteId) {
  const n = noteColleghiCache.find((x) => x.id === noteId);
  if (!n) return;
  const op = getOperatore();
  // Get clean message text
  let msgText = (n.messaggio || '')
    .replace(/\[GNAME:[^\]]*\]/g, '')
    .replace(/\[REPLY:\d+:[^:]*:[^\]]*\]/g, '')
    .trim();
  // Build modal with conversation list
  const mc = document.getElementById('pwd-modal-content');
  let html = '<h3>Inoltra messaggio</h3>';
  html += '<p style="color:var(--muted);font-size:.84rem;margin-bottom:4px">Messaggio:</p>';
  html +=
    '<div style="background:var(--paper2);border-left:3px solid var(--accent2);padding:8px 12px;border-radius:0 4px 4px 0;font-size:.85rem;margin-bottom:14px;max-height:80px;overflow:hidden;color:var(--ink)">' +
    escP(msgText.substring(0, 200)) +
    (msgText.length > 200 ? '...' : '') +
    '</div>';
  html += '<p style="color:var(--muted);font-size:.84rem;margin-bottom:8px">Inoltra a:</p>';
  html += '<div style="max-height:280px;overflow-y:auto">';
  // Groups
  html +=
    '<div onclick="_eseguiInoltro(' +
    noteId +
    ',\'gruppo:__gruppo_tutti\')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-weight:600" onmouseenter="this.style.background=\'rgba(184,134,11,.08)\'" onmouseleave="this.style.background=\'\'">Tutti</div>';
  html +=
    '<div onclick="_eseguiInoltro(' +
    noteId +
    ',\'gruppo:__gruppo_slots\')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-weight:600;color:#1a4a7a" onmouseenter="this.style.background=\'rgba(184,134,11,.08)\'" onmouseleave="this.style.background=\'\'">Tutti Slots</div>';
  html +=
    '<div onclick="_eseguiInoltro(' +
    noteId +
    ',\'gruppo:__gruppo_tavoli\')" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-weight:600;color:#8e44ad" onmouseenter="this.style.background=\'rgba(184,134,11,.08)\'" onmouseleave="this.style.background=\'\'">Tutti Tavoli</div>';
  html += '<div style="height:1px;background:var(--line)"></div>';
  // Individual operators
  const tutti = operatoriAuthCache
    .map((o) => o.nome)
    .sort()
    .filter((x) => x && x !== op);
  tutti.forEach((nome) => {
    const rep = operatoriRepartoMap[nome] || 'entrambi';
    const badge =
      rep === 'slots'
        ? ' <span style="font-size:.65rem;color:#1a4a7a;font-weight:700">S</span>'
        : rep === 'tavoli'
          ? ' <span style="font-size:.65rem;color:#8e44ad;font-weight:700">T</span>'
          : '';
    html +=
      '<div onclick="_eseguiInoltro(' +
      noteId +
      ",'" +
      escP(nome).replace(/'/g, "\\'") +
      '\',true)" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--line);font-size:.88rem" onmouseenter="this.style.background=\'rgba(184,134,11,.08)\'" onmouseleave="this.style.background=\'\'">' +
      escP(nome) +
      badge +
      '</div>';
  });
  html += '</div>';
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button></div>';
  mc.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function _eseguiInoltro(noteId, destKey, isSingle) {
  const n = noteColleghiCache.find((x) => x.id === noteId);
  if (!n) return;
  const op = getOperatore();
  let msgText = (n.messaggio || '')
    .replace(/\[GNAME:[^\]]*\]/g, '')
    .replace(/\[REPLY:\d+:[^:]*:[^\]]*\]/g, '')
    .trim();
  const fwdMsg = 'Inoltrato da ' + _nomeBreve(n.da_operatore) + ':\n' + msgText;
  const msgEnc = await encryptNota(fwdMsg);
  // ENTERPRISE: usa _chatInsertMessage per 1 sola INSERT (per gruppi) o N (per singoli)
  try {
    let dests = [];
    if (isSingle) {
      // 1-to-1
      await _chatInsertMessage({ da: op, partner: destKey, messaggioCifrato: msgEnc, messaggioPlain: fwdMsg });
      dests = [destKey];
    } else {
      // Gruppo persistente
      const gidKey = destKey.replace('gruppo:', '');
      // Calcola membri per il chat_get_or_create_group
      let members = [];
      if (gidKey === '__gruppo_tutti') members = operatoriAuthCache.map((o) => o.nome).filter((x) => x);
      else if (gidKey === '__gruppo_slots')
        members = operatoriAuthCache
          .map((o) => o.nome)
          .filter((x) => {
            if (!x) return false;
            const r = operatoriRepartoMap[x] || 'entrambi';
            return r === 'slots' || r === 'entrambi';
          });
      else if (gidKey === '__gruppo_tavoli')
        members = operatoriAuthCache
          .map((o) => o.nome)
          .filter((x) => {
            if (!x) return false;
            const r = operatoriRepartoMap[x] || 'entrambi';
            return r === 'tavoli' || r === 'entrambi';
          });
      await _chatInsertMessage({
        da: op,
        partner: destKey,
        messaggioCifrato: msgEnc,
        messaggioPlain: fwdMsg,
        gruppoMembers: members,
      });
      dests = members.filter((x) => x !== op);
    }
    document.getElementById('pwd-modal').classList.add('hidden');
    renderNoteCollega();
    toast('Messaggio inoltrato');
    inviaPush(dests, 'Nota da ' + op, '[Inoltrato] ' + msgText.substring(0, 100), 'nota', true);
  } catch (e) {
    toast('Errore inoltro: ' + e.message);
  }
}
async function inviaNotaChat() {
  const ta = document.getElementById('nota-msg-chat');
  if (!ta) return;
  let msg = ta.value.trim();
  if (!msg) {
    toast('Scrivi un messaggio');
    return;
  }
  if (_replyToNote) {
    let origMsg = _replyToNote.messaggio || '';
    const rm = origMsg.match(/^\[REPLY:\d+:[^:]*:[^\]]*\]/);
    if (rm) origMsg = origMsg.substring(rm[0].length);
    // FIX EDGE CASE #4: sanitize anche il NOME del mittente nella citation REPLY
    // (prima solo il testo veniva sanitizzato, il nome poteva contenere : o ] e rompere il regex)
    const _replySafeName = (_replyToNote.da_operatore || '').replace(/[\[\]:]/g, '');
    const _replySafeMsg = origMsg.substring(0, 60).replace(/[\[\]:]/g, '');
    msg = '[REPLY:' + _replyToNote.id + ':' + _replySafeName + ':' + _replySafeMsg + ']' + msg;
  }
  const op = getOperatore();
  if (!op) {
    toast('Seleziona prima un operatore');
    return;
  }
  const partner = window._noteConvAttiva;
  if (!partner) {
    toast('Seleziona una conversazione');
    return;
  }
  // Per nuovi gruppi custom: includi tag nome nel primo messaggio
  const _isNewCustom =
    partner.startsWith('gruppo:__gruppo_custom_') &&
    !noteColleghiCache.some((n) => n.gruppo_id === partner.replace('gruppo:', ''));
  const _gName = _isNewCustom ? _getGruppoNome(partner.replace('gruppo:', '')) || '' : '';
  if (_gName && !msg.includes('[GNAME:')) msg = '[GNAME:' + _gName + ']' + msg;
  const msgEnc = await encryptNota(msg);
  let dests = [];
  let gid = null;
  const isGroup = partner.startsWith('gruppo:');
  const _gidSend = isGroup ? partner.replace('gruppo:', '') : '';
  const isPersGroup = _gidSend.startsWith('__gruppo_');
  if (isPersGroup && _gidSend.startsWith('__gruppo_custom_')) {
    // Custom group: get members from DB originale (non deduplicato)
    const allGruppo = noteColleghiCache.filter((x) => x.gruppo_id === _gidSend);
    const ps = new Set();
    allGruppo.forEach((n) => {
      if (n.a_operatore !== op) ps.add(n.a_operatore);
      if (n.da_operatore !== op) ps.add(n.da_operatore);
    });
    dests = [...ps];
    // If new group (no notes yet), use stored dests
    if (!dests.length && window._noteConvGruppo) dests = window._noteConvGruppo.dests || [];
    gid = _gidSend;
  } else if (isPersGroup) {
    // Department group: send to all current members
    const rep = _gidSend.replace('__gruppo_', '');
    dests = operatoriAuthCache
      .map((o) => o.nome)
      .filter((n) => {
        if (!n || n === op) return false;
        if (rep === 'tutti') return true;
        const r = operatoriRepartoMap[n] || 'entrambi';
        return r === rep || r === 'entrambi';
      });
    gid = _gidSend;
  } else if (isGroup) {
    const gNotes = _getConvNotes(partner, op);
    const ps = new Set();
    gNotes.forEach((n) => {
      if (n.a_operatore !== op) ps.add(n.a_operatore);
      if (n.da_operatore !== op) ps.add(n.da_operatore);
    });
    dests = [...ps];
    gid = crypto.randomUUID();
  } else if (window._noteConvGruppo && window._noteConvGruppo.gid) {
    dests = window._noteConvGruppo.dests;
    gid = window._noteConvGruppo.gid;
  } else {
    dests = [partner];
  }
  if (!dests.length) {
    toast('Nessun destinatario');
    return;
  }
  if (!gid && dests.length > 1) gid = crypto.randomUUID();
  const _sendUrgent = _isUrgentMode;
  // ENTERPRISE CHAT: scrivi UNA SOLA riga in chat_messages (1-to-1 o gruppo)
  // Per gruppi, prima trova/crea il chat_groups corrispondente con chat_get_or_create_group RPC
  const _batchCreatedAt = new Date().toISOString();
  try {
    let chatGroupId = null;
    if (isGroup) {
      // Cerca chat_groups esistente per legacy_gid
      let existingGroup = chatGroupsCache.find((g) => g.legacy_gid === gid);
      if (!existingGroup) {
        // Crea nuovo gruppo via RPC
        let tipo = 'custom';
        let nome = null;
        if (gid === '__gruppo_slots') {
          tipo = 'slots';
          nome = 'Tutti Slots';
        } else if (gid === '__gruppo_tavoli') {
          tipo = 'tavoli';
          nome = 'Tutti Tavoli';
        } else if (gid === '__gruppo_tutti') {
          tipo = 'tutti';
          nome = 'Tutti';
        } else if (gid.startsWith('__gruppo_custom_')) {
          nome = _getGruppoNome(gid) || 'Gruppo personalizzato';
        }
        const tk = getOpToken();
        const newGroupId = await sbRpc('chat_get_or_create_group', {
          p_token: tk,
          p_tipo: tipo,
          p_legacy_gid: gid,
          p_nome: nome,
          p_members: [op, ...dests],
        });
        chatGroupId = newGroupId;
        // Aggiorna cache locale
        existingGroup = { id: newGroupId, nome, tipo, legacy_gid: gid, creato_da: op, created_at: _batchCreatedAt };
        chatGroupsCache.push(existingGroup);
        for (const m of [op, ...dests]) {
          if (!chatGroupMembersCache.some((x) => x.group_id === newGroupId && x.operatore === m)) {
            chatGroupMembersCache.push({ group_id: newGroupId, operatore: m, joined_at: _batchCreatedAt });
          }
        }
      } else {
        chatGroupId = existingGroup.id;
        // Assicura che dests siano membri (in caso il gruppo persistente abbia nuovi reparti)
        for (const m of dests) {
          if (!chatGroupMembersCache.some((x) => x.group_id === chatGroupId && x.operatore === m)) {
            // Aggiungi al DB e cache
            try {
              await secPost('chat_group_members', { group_id: chatGroupId, operatore: m });
              chatGroupMembersCache.push({ group_id: chatGroupId, operatore: m, joined_at: _batchCreatedAt });
            } catch (_) {}
          }
        }
      }
    }
    // Crea il record chat_messages
    const rec = {
      da_operatore: op,
      messaggio: msgEnc,
      created_at: _batchCreatedAt,
    };
    if (_sendUrgent) rec.urgente = true;
    if (isGroup) {
      rec.group_id = chatGroupId;
    } else {
      rec.a_operatore = dests[0];
    }
    const r = await secPost('chat_messages', rec);
    const newMsg = r[0];
    // Decifra localmente per uso immediato
    newMsg.messaggio = msg;
    newMsg._decrypted = true;
    chatMessagesCache.unshift(newMsg);
    // Rigenera la cache sintetizzata per il rendering
    _chatBuildNoteCache();
    ta.value = '';
    ta.style.height = 'auto';
    annullaRispondi();
    // Reset urgent mode after sending
    if (_isUrgentMode) {
      _isUrgentMode = false;
      const ub = document.getElementById('btn-urgent-mode');
      if (ub) ub.classList.remove('active');
      ta.placeholder = 'Scrivi un messaggio...';
    }
    // Switch to persistent group conversation
    if (isPersGroup || (_gidSend && !isPersGroup)) {
      /* already on correct conv */
    } else if (window._noteConvGruppo && window._noteConvGruppo.gid) {
      window._noteConvAttiva = 'gruppo:' + window._noteConvGruppo.gid;
      window._noteConvGruppo = null;
    }
    renderNoteCollega();
    toast(_sendUrgent ? 'Messaggio urgente inviato' : 'Nota inviata');
    inviaPush(dests, (_sendUrgent ? '\u26A0\uFE0F URGENTE da ' : 'Nota da ') + op, msg.substring(0, 120), 'nota', true);
  } catch (e) {
    toast('Errore invio');
  }
}
// Filtra conversazioni nella lista (cerca in nome + tutti i messaggi)
let _convSearchQuery = '';
function filtraConversazioni() {
  const q = (document.getElementById('conv-search-input') || {}).value || '';
  const ql = q.trim().toLowerCase();
  _convSearchQuery = ql;
  if (!ql) {
    document.querySelectorAll('.conv-item').forEach((el) => (el.style.display = ''));
    return;
  }
  const op = getOperatore();
  // Trova quali partner hanno messaggi che contengono la query
  const partnerConMatch = new Set();
  noteColleghiCache.forEach((n) => {
    if (
      (n.messaggio || '').toLowerCase().includes(ql) ||
      (n.da_operatore || '').toLowerCase().includes(ql) ||
      (n.a_operatore || '').toLowerCase().includes(ql)
    ) {
      if (n.da_operatore === op) partnerConMatch.add(n.a_operatore.toLowerCase());
      else if (n.a_operatore === op) partnerConMatch.add(n.da_operatore.toLowerCase());
      if (n.gruppo_id) partnerConMatch.add('gruppo:' + n.gruppo_id);
    }
  });
  document.querySelectorAll('.conv-item').forEach((el) => {
    const name = el.getAttribute('data-conv-name') || '';
    // FIX BUG #11: prima usava name.split(' ')[0] che prendeva solo il primo cognome,
    // mancando match per nomi composti tipo "Pisano Pamela". Ora controlla se uno
    // qualsiasi dei partner con match e' contenuto in name.
    let show = name.includes(ql);
    if (!show)
      for (const p of partnerConMatch) {
        if (name.includes(p)) {
          show = true;
          break;
        }
      }
    el.style.display = show ? '' : 'none';
  });
}
// Ricerca nella chat
let _chatSearchResults = [],
  _chatSearchIdx = -1;
function apriCercaChat() {
  const bar = document.getElementById('note-chat-search-bar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('note-chat-search').focus();
  }
}
function chiudiCercaChat() {
  const bar = document.getElementById('note-chat-search-bar');
  if (bar) {
    bar.style.display = 'none';
    document.getElementById('note-chat-search').value = '';
  }
  _chatSearchResults = [];
  _chatSearchIdx = -1;
  document.getElementById('note-search-count').textContent = '';
  // Rimuovi evidenziazioni
  document.querySelectorAll('.chat-bubble .chat-highlight').forEach((el) => {
    el.outerHTML = el.textContent;
  });
}
function cercaInChat() {
  const q = (document.getElementById('note-chat-search').value || '').trim().toLowerCase();
  const countEl = document.getElementById('note-search-count');
  // Pulisci precedenti
  document.querySelectorAll('.chat-bubble .chat-highlight').forEach((el) => {
    el.outerHTML = el.textContent;
  });
  _chatSearchResults = [];
  _chatSearchIdx = -1;
  if (!q || q.length < 2) {
    countEl.textContent = '';
    return;
  }
  // Evidenzia e raccogli risultati
  document.querySelectorAll('.chat-bubble').forEach((bubble) => {
    const textNodes = [];
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.classList.contains('chat-time') || node.parentElement.classList.contains('chat-ticks'))
        continue;
      if (node.textContent.toLowerCase().includes(q)) textNodes.push(node);
    }
    textNodes.forEach((tn) => {
      const txt = tn.textContent;
      const idx = txt.toLowerCase().indexOf(q);
      if (idx === -1) return;
      const before = txt.substring(0, idx);
      const match = txt.substring(idx, idx + q.length);
      const after = txt.substring(idx + q.length);
      const span = document.createElement('span');
      span.innerHTML =
        escP(before) +
        '<mark class="chat-highlight" style="background:#f1c40f;padding:0 2px;border-radius:2px">' +
        escP(match) +
        '</mark>' +
        escP(after);
      tn.parentNode.replaceChild(span, tn);
      _chatSearchResults.push(span.querySelector('.chat-highlight'));
    });
  });
  countEl.textContent = _chatSearchResults.length
    ? (_chatSearchIdx + 1 < 1 ? 1 : _chatSearchIdx + 1) + '/' + _chatSearchResults.length
    : '0 risultati';
  if (_chatSearchResults.length) {
    _chatSearchIdx = 0;
    _chatSearchResults[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function cercaInChatNav(dir) {
  if (!_chatSearchResults.length) return;
  if (_chatSearchResults[_chatSearchIdx]) _chatSearchResults[_chatSearchIdx].style.background = '#f1c40f';
  _chatSearchIdx = (_chatSearchIdx + dir + _chatSearchResults.length) % _chatSearchResults.length;
  _chatSearchResults[_chatSearchIdx].style.background = '#e67e22';
  _chatSearchResults[_chatSearchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('note-search-count').textContent = _chatSearchIdx + 1 + '/' + _chatSearchResults.length;
}
// ===== STAR / IMPORTANT MESSAGES =====
let _starFilterActive = false;
function toggleStarFilter() {
  _starFilterActive = !_starFilterActive;
  const btn = document.querySelector('#note-chat-star-filter .btn-star-filter');
  if (btn) btn.classList.toggle('active', _starFilterActive);
  if (window._noteConvAttiva) renderNoteChat(window._noteConvAttiva);
}
async function toggleImportante(noteId) {
  const n = noteColleghiCache.find((x) => x.id === noteId);
  if (!n) return;
  const nuovoVal = !n.importante;
  // Optimistic update
  const cm = chatMessagesCache.find((x) => x.id === noteId);
  if (cm) cm.importante = nuovoVal;
  _chatBuildNoteCache();
  if (window._noteConvAttiva) renderNoteChat(window._noteConvAttiva);
  try {
    await _chatPatchMessage(noteId, { importante: nuovoVal });
  } catch (e) {
    // Rollback
    if (cm) cm.importante = !nuovoVal;
    _chatBuildNoteCache();
    toast('Errore salvataggio');
    if (window._noteConvAttiva) renderNoteChat(window._noteConvAttiva);
  }
}
// ===== URGENT MODE =====
let _isUrgentMode = false;
function toggleUrgentMode() {
  _isUrgentMode = !_isUrgentMode;
  const btn = document.getElementById('btn-urgent-mode');
  if (btn) btn.classList.toggle('active', _isUrgentMode);
  const ta = document.getElementById('nota-msg-chat');
  if (ta) ta.placeholder = _isUrgentMode ? 'Messaggio URGENTE...' : 'Scrivi un messaggio...';
}
let _noteFpInit = false;
function initNoteFlatpickr() {
  _noteFpInit = true;
}
function resetNoteFiltri(tipo) {
  renderNoteCollega();
}
let _consFpInit = false;
function initConsFlatpickr() {
  if (_consFpInit || !window.flatpickr) return;
  _consFpInit = true;
  const o = {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
    onChange: () => renderConsegne(),
  };
  flatpickr('#cons-filt-dal', o);
  flatpickr('#cons-filt-al', o);
}
function resetConsFiltri() {
  ['cons-filt-dal', 'cons-filt-al'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
  renderConsegne();
}
function aggiornaNoteBadge() {
  const op = getOperatore();
  const badge = document.getElementById('note-badge');
  if (!badge || !op) return;
  const nonLette = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && !n.nascosta_dest).length;
  if (nonLette > 0) {
    badge.style.display = 'inline';
    badge.textContent = nonLette;
  } else {
    badge.style.display = 'none';
  }
}
// ========================
// SCHEDA COLLABORATORE
// ========================
let _schedaCharts = {};
function _destroySchedaCharts() {
  Object.values(_schedaCharts).forEach((c) => {
    try {
      c.destroy();
    } catch (e) {}
  });
  _schedaCharts = {};
}

function apriSchedaCollaboratore(nome) {
  _destroySchedaCharts();
  const allData = getDatiReparto();
  const entries = allData.filter((e) => e.nome === nome);
  const moduli = getModuliReparto().filter(
    (m) => m.collaboratore && m.collaboratore.toLowerCase() === nome.toLowerCase(),
  );
  const now = new Date();
  const tipoErr = nomeCorrente('Errore'),
    tipoMal = nomeCorrente('Malattia'),
    tipoAmm = nomeCorrente('Ammonimento Verbale');

  // KPI counts
  const totReg = entries.length;
  const errori = entries.filter((e) => e.tipo === tipoErr);
  const totErr = errori.length;
  const totErrCost = errori.reduce((s, e) => s + (parseFloat(e.importo) || 0), 0);
  const totMal = _contaTotaleMalattie(entries, tipoMal);
  const totAmm = entries.filter((e) => e.tipo === tipoAmm).length;
  const tipoND = nomeCorrente('Non Disponibilità');
  const totND = entries.filter((e) => e.tipo === tipoND).length;
  const allineamenti = moduli.filter((m) => m.tipo === 'allineamento').length;
  const apprezzamenti = moduli.filter((m) => m.tipo === 'apprezzamento').length;
  const rdiCount = moduli.filter((m) => m.tipo === 'rdi').length;
  const totNeg = totErr + totAmm + allineamenti + rdiCount;
  const ratio = totNeg > 0 ? apprezzamenti / totNeg : apprezzamenti > 0 ? 999 : 0;

  // Birthday - check collaboratoriCache
  const collabRec = collaboratoriCache.find((c) => c.nome === nome);
  const dataNascita = collabRec && collabRec.data_nascita ? collabRec.data_nascita : '';
  const isBirthday = dataNascita ? _isCompleannoOggi(dataNascita) : false;
  const neS = nome.replace(/'/g, "\\'");

  // HEADER
  let html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;flex-wrap:wrap;gap:8px">';
  html +=
    '<div><h3 style="font-size:1.6rem">' +
    escP(nome) +
    (isBirthday ? ' <span style="font-size:1.2rem" title="Compleanno oggi!">&#127874;</span>' : '') +
    '</h3>';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">';
  html += '<span style="font-size:.82rem;color:var(--muted)">Data di nascita:</span>';
  const dnDisplay = dataNascita ? new Date(dataNascita + 'T12:00:00').toLocaleDateString('it-IT') : '';
  html +=
    '<input type="text" id="scheda-nascita" value="' +
    escP(dnDisplay) +
    '" data-iso-value="' +
    escP(dataNascita) +
    '" placeholder="es: 12.01.1997" style="padding:4px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper2);color:var(--ink);width:120px">';
  html +=
    '<button class="btn-salva" onclick="salvaSchedaNascita(\'' +
    neS +
    '\')" style="font-size:.78rem;padding:5px 14px;background:var(--accent2)">Salva</button>';
  if (dataNascita) {
    html +=
      '<span style="font-size:.82rem;color:var(--muted)">' +
      new Date(dataNascita + 'T12:00:00').toLocaleDateString('it-IT') +
      '</span>';
  }
  html += '</div></div>';
  html +=
    '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-export btn-export-pdf" onclick="stampaSchedaPDF(\'' +
    neS +
    '\')" style="font-size:.78rem;padding:5px 14px">PDF</button>';
  html +=
    '<button class="btn-export" onclick="apriConfrontoScheda(\'' +
    neS +
    '\')" style="font-size:.78rem;padding:5px 14px;border-color:#1a7a6d;color:#1a7a6d">Confronta</button>';
  html +=
    '<button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\');_destroySchedaCharts()" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div></div>';

  // Calcola giorni malattia totali
  const _malEntries = entries.filter((e) => e.tipo === tipoMal);
  let _totGiorniMal = 0;
  _malEntries.forEach((e) => {
    const rm = (e.testo || '').match(/(\d+)\s*giorni/);
    if (rm) _totGiorniMal += parseInt(rm[1]);
    else _totGiorniMal++;
  });
  const _malColor = totMal >= 5 ? 'var(--accent)' : totMal >= 3 ? '#e67e22' : '#1a7a6d';
  // Ultima registrazione
  const _lastEntry = entries.length ? entries.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0] : null;
  const _lastDateStr = _lastEntry ? new Date(_lastEntry.data).toLocaleDateString('it-IT') : '—';
  const _lastTipo = _lastEntry ? _lastEntry.tipo : '';
  // KPI CARDS
  html += '<div class="scheda-kpi-grid">';
  html +=
    '<div class="scheda-kpi"><div class="kpi-val" style="color:var(--ink)">' +
    totReg +
    '</div><div class="kpi-lbl">Registrazioni</div></div>';
  html +=
    '<div class="scheda-kpi"><div class="kpi-val" style="color:var(--accent)">' +
    totErr +
    '</div><div class="kpi-lbl">Errori</div></div>';
  if (totErrCost)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:var(--accent)">' +
      fmtCHF(totErrCost) +
      ' CHF</div><div class="kpi-lbl">Costo errori</div></div>';
  html +=
    '<div class="scheda-kpi"><div class="kpi-val" style="color:' +
    _malColor +
    '">' +
    totMal +
    (_totGiorniMal > totMal ? ' <span style="font-size:.7rem;font-weight:400">(' + _totGiorniMal + 'gg)</span>' : '') +
    '</div><div class="kpi-lbl">Malattie</div></div>';
  if (totAmm)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:#7b2d8b">' +
      totAmm +
      '</div><div class="kpi-lbl">Amm. verbali</div></div>';
  if (totND)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:#5d6d7e">' +
      totND +
      '</div><div class="kpi-lbl">Non disponib.</div></div>';
  if (allineamenti)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:#1a4a7a">' +
      allineamenti +
      '</div><div class="kpi-lbl">Allineamenti</div></div>';
  if (apprezzamenti)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:#b8860b">' +
      apprezzamenti +
      '</div><div class="kpi-lbl">Apprezzamenti</div></div>';
  if (apprezzamenti && totNeg) {
    const ratioColor = ratio >= 1 ? '#2c6e49' : 'var(--accent)';
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:' +
      ratioColor +
      '">' +
      (ratio >= 999 ? '&#8734;' : ratio.toFixed(1)) +
      '</div><div class="kpi-lbl">Pos/Neg ratio</div></div>';
  }
  if (_lastEntry)
    html +=
      '<div class="scheda-kpi"><div class="kpi-val" style="color:var(--ink);font-size:.9rem">' +
      _lastDateStr +
      '</div><div class="kpi-lbl">Ultima reg. (' +
      _lastTipo +
      ')</div></div>';
  html += '</div>';

  // MONTHLY TREND CHART (last 6 months) — solo se ci sono dati significativi
  const _hasChartData = totErr > 0 || allineamenti > 0 || rdiCount > 0 || apprezzamenti > 0 || totReg >= 3;
  if (_hasChartData) {
    html += '<div class="scheda-section"><h4>Andamento mensile (ultimi 6 mesi)</h4>';
    html += '<div class="scheda-chart-wrap"><canvas id="scheda-chart-trend"></canvas></div>';

    // Month-over-month comparison
    const curMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const errCur = entries.filter((e) => {
      const d = new Date(e.data);
      return e.tipo === tipoErr && d.getMonth() === curMonth.getMonth() && d.getFullYear() === curMonth.getFullYear();
    }).length;
    const errPrev = entries.filter((e) => {
      const d = new Date(e.data);
      return e.tipo === tipoErr && d.getMonth() === prevMonth.getMonth() && d.getFullYear() === prevMonth.getFullYear();
    }).length;
    const momDiff = errPrev > 0 ? Math.round(((errCur - errPrev) / errPrev) * 100) : errCur > 0 ? 100 : 0;
    html += '<div class="scheda-mom">';
    html +=
      '<div class="scheda-mom-card" style="background:' +
      (momDiff > 0
        ? 'rgba(192,57,43,0.1);color:var(--accent)'
        : momDiff < 0
          ? 'rgba(44,110,73,0.1);color:#2c6e49'
          : 'rgba(138,125,107,0.1);color:var(--muted)') +
      '">' +
      MESI[curMonth.getMonth()] +
      ' vs ' +
      MESI[prevMonth.getMonth()] +
      ': ' +
      (momDiff > 0 ? '+' : '') +
      momDiff +
      '% errori</div>';
    html +=
      '<span style="font-size:.82rem;color:var(--muted)">' +
      errCur +
      ' errori questo mese, ' +
      errPrev +
      ' il mese scorso</span>';
    html += '</div></div>';
  } // fine _hasChartData

  // DISCIPLINARY PATH — solo se c'è almeno 1 evento
  if (totAmm || allineamenti || rdiCount) {
    html += '<div class="scheda-section"><h4>Percorso disciplinare</h4>';
    html += '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">';
    html +=
      '<span class="scheda-path-step" style="background:rgba(123,45,139,0.12);color:#7b2d8b">' +
      totAmm +
      ' Amm. verbali</span>';
    html += '<span class="scheda-path-arrow">&#10132;</span>';
    html +=
      '<span class="scheda-path-step" style="background:rgba(26,74,122,0.12);color:#1a4a7a">' +
      allineamenti +
      ' Allineamenti</span>';
    html += '<span class="scheda-path-arrow">&#10132;</span>';
    html +=
      '<span class="scheda-path-step" style="background:rgba(192,57,43,0.12);color:var(--accent)">' +
      rdiCount +
      ' RDI</span>';
    html += '</div>';

    // Auto-suggestions (basate su stesso motivo)
    const _ammEntries = entries.filter((e) => e.tipo === tipoAmm);
    const _ammGruppi = [];
    _ammEntries.forEach((e) => {
      let trovato = false;
      for (const g of _ammGruppi) {
        if (_motivoSimile(e.testo, g.motivo, nome)) {
          g.count++;
          trovato = true;
          break;
        }
      }
      if (!trovato) _ammGruppi.push({ motivo: e.testo, count: 1 });
    });
    const _ammMaxSame = _ammGruppi.reduce((mx, g) => Math.max(mx, g.count), 0);
    if (_ammMaxSame >= 2 && allineamenti === 0) {
      html +=
        '<div class="scheda-suggestion" style="background:rgba(230,126,34,0.12);color:#e67e22">&#9888; ' +
        _ammMaxSame +
        ' ammonimenti stesso motivo senza allineamento &#8594; Preparare allineamento</div>';
    }
    // Allineamenti → RDI
    const _allinMods = moduli.filter((m) => m.tipo === 'allineamento');
    const _allinGruppi = [];
    _allinMods.forEach((m) => {
      let trovato = false;
      for (const g of _allinGruppi) {
        if (_motivoSimile(m.non_conformita || '', g.motivo, nome)) {
          g.count++;
          trovato = true;
          break;
        }
      }
      if (!trovato) _allinGruppi.push({ motivo: m.non_conformita || '', count: 1 });
    });
    const _allinMaxSame = _allinGruppi.reduce((mx, g) => Math.max(mx, g.count), 0);
    if (_allinMaxSame >= 3 && rdiCount === 0) {
      html +=
        '<div class="scheda-suggestion" style="background:rgba(192,57,43,0.12);color:var(--accent)">&#9888; ' +
        _allinMaxSame +
        ' allineamenti stesso motivo senza RDI &#8594; Recidiva, preparare RDI</div>';
    } else if (_allinMods.length >= 3 && rdiCount === 0) {
      html +=
        '<div class="scheda-suggestion" style="background:rgba(230,126,34,0.12);color:#e67e22">&#9888; ' +
        _allinMods.length +
        ' allineamenti totali senza RDI &#8594; Valutare RDI</div>';
    }
    // Check last 3 months for 0 errors + appreciations
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const recentErr = entries.filter((e) => e.tipo === tipoErr && new Date(e.data) >= threeMonthsAgo).length;
    const recentApprMod = moduli.filter(
      (m) => m.tipo === 'apprezzamento' && new Date(m.created_at) >= threeMonthsAgo,
    ).length;
    if (recentErr === 0 && recentApprMod > 0) {
      html +=
        '<div class="scheda-suggestion" style="background:rgba(44,110,73,0.12);color:#2c6e49">&#11088; 0 errori da 3 mesi + ' +
        recentApprMod +
        ' apprezzamenti &#8594; Candidato per premio</div>';
    } else if (recentErr === 0 && totReg > 5) {
      html +=
        '<div class="scheda-suggestion" style="background:rgba(44,110,73,0.12);color:#2c6e49">&#9989; 0 errori negli ultimi 3 mesi</div>';
    }
    html += '</div>';
  } // fine percorso disciplinare

  // SICK DAY PATTERNS
  if (totMal > 0) {
    html += '<div class="scheda-section"><h4>Pattern malattie</h4>';
    const malEntries = entries.filter((e) => e.tipo === tipoMal);
    const dayDist = [0, 0, 0, 0, 0, 0, 0];
    malEntries.forEach((e) => {
      // Espandi range: "dal DD/MM/YYYY al DD/MM/YYYY (N giorni)"
      const rangeM = (e.testo || '').match(/dal\s+(\d{2})\/(\d{2})\/(\d{4})\s+al\s+(\d{2})\/(\d{2})\/(\d{4})/);
      if (rangeM) {
        const dI = new Date(rangeM[3] + '-' + rangeM[2] + '-' + rangeM[1] + 'T12:00:00');
        const dF = new Date(rangeM[6] + '-' + rangeM[5] + '-' + rangeM[4] + 'T12:00:00');
        for (let d = new Date(dI); d <= dF; d.setDate(d.getDate() + 1)) dayDist[d.getDay()]++;
      } else {
        dayDist[new Date(e.data).getDay()]++;
      }
    });
    const lunVen = dayDist[1] + dayDist[5];
    const lunVenPct = totMal > 0 ? Math.round((lunVen / totMal) * 100) : 0;
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0">';
    const go = [1, 2, 3, 4, 5, 6, 0];
    go.forEach((i) => {
      const pct = totMal > 0 ? Math.round((dayDist[i] / totMal) * 100) : 0;
      html +=
        '<div style="text-align:center;min-width:45px"><div style="font-weight:700;font-size:.9rem;color:var(--ink)">' +
        dayDist[i] +
        '</div><div style="font-size:.7rem;color:var(--muted)">' +
        GIORNI_SHORT[i] +
        '</div><div style="font-size:.65rem;color:var(--muted)">' +
        pct +
        '%</div></div>';
    });
    html += '</div>';
    if (lunVenPct > 50) {
      html +=
        '<div class="scheda-sick-flag" style="background:rgba(192,57,43,0.1);color:var(--accent)">&#9888; ' +
        lunVenPct +
        '% delle malattie cade di Lunedi o Venerdi (' +
        lunVen +
        '/' +
        totMal +
        ')</div>';
    }
    // Team average comparison
    const teamMal = _contaTotaleMalattie(allData, tipoMal);
    const teamCollabs = new Set(allData.map((e) => e.nome)).size;
    const avgMal = teamCollabs > 0 ? teamMal / teamCollabs : 0;
    html +=
      '<div style="font-size:.82rem;color:var(--muted);margin-top:6px">Media team: ' +
      avgMal.toFixed(1) +
      ' malattie/collaboratore — ' +
      (totMal > avgMal
        ? '<span style="color:var(--accent);font-weight:600">Sopra media</span>'
        : '<span style="color:#2c6e49;font-weight:600">Nella norma</span>') +
      '</div>';
    html += '</div>';
  }

  // TIMELINE with date filter
  html += '<div class="scheda-section"><h4>Cronologia completa</h4>';
  html += '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">';
  html += '<span style="font-size:.78rem;color:var(--muted);font-weight:600">FILTRO:</span>';
  html +=
    '<input type="text" id="scheda-tl-dal" placeholder="Dal..." readonly style="cursor:pointer;padding:4px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper2);color:var(--ink);width:120px">';
  html +=
    '<input type="text" id="scheda-tl-al" placeholder="Al..." readonly style="cursor:pointer;padding:4px 10px;border:1px solid var(--line);border-radius:2px;font-size:.82rem;background:var(--paper2);color:var(--ink);width:120px">';
  html += '<button class="btn-reset" onclick="schedaResetTlFilter(\'' + neS + '\')">Reset</button>';
  html += '</div>';
  html +=
    '<div id="scheda-timeline" class="profilo-entries" style="max-height:350px">' +
    _renderSchedaTimeline(nome, entries, moduli, '', '') +
    '</div>';
  html += '</div>';

  const box = document.getElementById('profilo-content');
  box.className = 'profilo-box scheda-wide';
  box.innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');

  // Init flatpickrs
  setTimeout(function () {
    if (window.flatpickr) {
      _initNascitaInput('scheda-nascita');
      var tlOpts = {
        locale: 'it',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/Y',
        allowInput: false,
        onChange: function () {
          _schedaFilterTimeline(nome);
        },
      };
      flatpickr('#scheda-tl-dal', tlOpts);
      flatpickr('#scheda-tl-al', tlOpts);
    }
    // Render trend chart (solo se canvas esiste)
    if (document.getElementById('scheda-chart-trend')) _renderSchedaTrendChart(nome, entries);
  }, 120);
}

function _renderSchedaTimeline(nome, entries, moduli, dal, al) {
  // Merge entries + moduli into unified timeline
  var items = [];
  entries.forEach(function (e) {
    items.push({
      date: e.data,
      tipo: e.tipo,
      text: e.testo,
      source: 'reg',
      operatore: e.operatore || '',
      importo: e.importo,
      valuta: e.valuta,
      reparto: e.reparto,
    });
  });
  moduli.forEach(function (m) {
    var label = { allineamento: 'Allineamento', apprezzamento: 'Apprezzamento', rdi: 'RDI' }[m.tipo] || m.tipo;
    items.push({
      date: m.created_at || m.data_modulo,
      tipo: label,
      text: 'Modulo ' + label + (m.resp_settore ? ' — Resp: ' + m.resp_settore : ''),
      source: 'mod',
      operatore: m.operatore || '',
    });
  });
  items.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
  if (dal)
    items = items.filter(function (i) {
      return i.date >= dal;
    });
  if (al)
    items = items.filter(function (i) {
      return i.date <= al + 'T23:59:59';
    });
  if (!items.length)
    return '<div style="padding:14px;text-align:center;color:var(--muted)">Nessun evento nel periodo selezionato</div>';
  return items
    .map(function (i) {
      var d = new Date(i.date);
      var dateStr =
        d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      var bgCol =
        i.source === 'mod'
          ? i.tipo === 'RDI'
            ? '#c0392b'
            : i.tipo === 'Allineamento'
              ? '#1a4a7a'
              : '#b8860b'
          : getColore(i.tipo);
      var impBadge =
        i.importo && parseFloat(i.importo)
          ? '<span style="margin-left:4px;padding:1px 6px;background:var(--accent);color:white;border-radius:2px;font-size:.72rem;font-weight:700">' +
            fmtCHF(i.importo) +
            ' ' +
            (i.valuta || 'CHF') +
            '</span>'
          : '';
      var repBadge = i.reparto
        ? '<span style="margin-left:4px;padding:1px 6px;background:var(--muted);color:white;border-radius:2px;font-size:.72rem">' +
          escP(i.reparto) +
          '</span>'
        : '';
      var srcBadge =
        i.source === 'mod'
          ? '<span style="margin-left:4px;padding:1px 5px;border:1px solid var(--line);border-radius:2px;font-size:.65rem;color:var(--muted)">MODULO</span>'
          : '';
      return (
        '<div class="scheda-timeline-item"><span style="font-size:.78rem;color:var(--muted);min-width:100px">' +
        dateStr +
        '</span><span class="mini-badge" style="background:' +
        bgCol +
        '">' +
        escP(i.tipo) +
        '</span>' +
        srcBadge +
        repBadge +
        impBadge +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis">' +
        esc(i.text) +
        '</span>' +
        (i.operatore ? '<span style="font-size:.72rem;color:var(--accent2)">' + escP(i.operatore) + '</span>' : '') +
        '</div>'
      );
    })
    .join('');
}

function _schedaFilterTimeline(nome) {
  var dalEl = document.getElementById('scheda-tl-dal'),
    alEl = document.getElementById('scheda-tl-al');
  var dal = dalEl ? dalEl.value : '',
    al = alEl ? alEl.value : '';
  var entries = getDatiReparto().filter(function (e) {
    return e.nome === nome;
  });
  var moduli = getModuliReparto().filter(function (m) {
    return m.collaboratore && m.collaboratore.toLowerCase() === nome.toLowerCase();
  });
  var tl = document.getElementById('scheda-timeline');
  if (tl) tl.innerHTML = _renderSchedaTimeline(nome, entries, moduli, dal, al);
}

function schedaResetTlFilter(nome) {
  ['scheda-tl-dal', 'scheda-tl-al'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.value = '';
      if (el._flatpickr) el._flatpickr.clear();
    }
  });
  _schedaFilterTimeline(nome);
}

function _renderSchedaTrendChart(nome, entries) {
  var tipoErr = nomeCorrente('Errore');
  var moduli = getModuliReparto().filter(function (m) {
    return m.collaboratore && m.collaboratore.toLowerCase() === nome.toLowerCase();
  });
  var now = new Date();
  var labels = [],
    errData = [],
    apprData = [],
    allinData = [],
    rdiData = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MESI[d.getMonth()] + ' ' + d.getFullYear());
    var mErr = 0,
      mAppr = 0,
      mAllin = 0,
      mRdi = 0;
    entries.forEach(function (e) {
      var ed = new Date(e.data);
      if (ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear()) {
        if (e.tipo === tipoErr) mErr++;
      }
    });
    moduli.forEach(function (m) {
      var md = new Date(m.created_at);
      if (md.getMonth() === d.getMonth() && md.getFullYear() === d.getFullYear()) {
        if (m.tipo === 'apprezzamento') mAppr++;
        else if (m.tipo === 'allineamento') mAllin++;
        else if (m.tipo === 'rdi') mRdi++;
      }
    });
    errData.push(mErr);
    apprData.push(mAppr);
    allinData.push(mAllin);
    rdiData.push(mRdi);
  }
  // Trend direction
  var trendImproving = errData.length >= 2 && errData[errData.length - 1] <= errData[errData.length - 2];
  var el = document.getElementById('scheda-chart-trend');
  if (!el) return;
  if (_schedaCharts.trend) _schedaCharts.trend.destroy();
  _schedaCharts.trend = new Chart(el, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Errori',
          data: errData,
          borderColor: '#c0392b',
          backgroundColor: 'rgba(192,57,43,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#c0392b',
        },
        {
          label: 'Allineamenti',
          data: allinData,
          borderColor: '#1a4a7a',
          backgroundColor: 'rgba(26,74,122,0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#1a4a7a',
          borderDash: [5, 3],
        },
        {
          label: 'RDI',
          data: rdiData,
          borderColor: '#7b2d8b',
          backgroundColor: 'rgba(123,45,139,0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#7b2d8b',
          borderDash: [2, 2],
        },
        {
          label: 'Apprezzamenti',
          data: apprData,
          borderColor: '#b8860b',
          backgroundColor: 'rgba(184,134,11,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#b8860b',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

async function salvaSchedaNascita(nome) {
  var inp = document.getElementById('scheda-nascita');
  if (!inp) return;
  var val = _parseDataNascita(inp.value) || inp.dataset.isoValue || '';
  if (inp.value.trim() && !val) {
    toast('Formato data non valido');
    return;
  }
  var coll = collaboratoriCache.find(function (c) {
    return c.nome === nome;
  });
  if (coll) {
    try {
      await secPatch('collaboratori', 'id=eq.' + coll.id, { data_nascita: val || null });
      coll.data_nascita = val || null;
      logAzione('Data nascita collaboratore', nome + ' → ' + (val || 'rimossa'));
      toast('Data nascita salvata');
    } catch (e) {
      toast('Errore salvataggio');
    }
  } else {
    try {
      var r = await secPost('collaboratori', { nome: nome, attivo: true, data_nascita: val || null });
      if (r && r[0]) collaboratoriCache.push(r[0]);
      toast('Data nascita salvata');
    } catch (e) {
      toast('Errore salvataggio');
    }
  }
}

function stampaSchedaPDF(nome) {
  if (!window.jspdf) {
    toast('Libreria PDF non caricata');
    return;
  }
  var allData = getDatiReparto();
  var entries = allData.filter(function (e) {
    return e.nome === nome;
  });
  var moduli = getModuliReparto().filter(function (m) {
    return m.collaboratore && m.collaboratore.toLowerCase() === nome.toLowerCase();
  });
  var tipoErr = nomeCorrente('Errore'),
    tipoMal = nomeCorrente('Malattia'),
    tipoAmm = nomeCorrente('Ammonimento Verbale');
  var totErr = entries.filter(function (e) {
    return e.tipo === tipoErr;
  }).length;
  var totMal = _contaTotaleMalattie(entries, tipoMal);
  var totAmm = entries.filter(function (e) {
    return e.tipo === tipoAmm;
  }).length;
  var totErrCost = entries
    .filter(function (e) {
      return e.tipo === tipoErr;
    })
    .reduce(function (s, e) {
      return s + (parseFloat(e.importo) || 0);
    }, 0);
  var allin = moduli.filter(function (m) {
    return m.tipo === 'allineamento';
  }).length;
  var apprMod = moduli.filter(function (m) {
    return m.tipo === 'apprezzamento';
  }).length;
  var rdi = moduli.filter(function (m) {
    return m.tipo === 'rdi';
  }).length;

  // Optional date range filter
  var dal = document.getElementById('scheda-tl-dal') ? document.getElementById('scheda-tl-dal').value : '';
  var al = document.getElementById('scheda-tl-al') ? document.getElementById('scheda-tl-al').value : '';

  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF('portrait', 'mm', 'a4');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Scheda Collaboratore', 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Casino Lugano SA — ' + new Date().toLocaleDateString('it-IT'), 14, 25);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(nome, 14, 35);
  if (dal || al) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Periodo: ' + (dal || 'inizio') + ' — ' + (al || 'oggi'), 14, 41);
  }

  // KPI table
  doc.autoTable({
    theme: 'grid',
    startY: dal || al ? 45 : 40,
    head: [
      ['Registrazioni', 'Errori', 'Costo Errori', 'Malattie', 'Amm. Verbali', 'Allineamenti', 'Apprezzamenti', 'RDI'],
    ],
    body: [
      [entries.length, totErr, totErrCost ? 'CHF ' + fmtCHF(totErrCost) : '0', totMal, totAmm, allin, apprMod, rdi],
    ],
    theme: 'grid',
    headStyles: { fillColor: [26, 74, 122], fontSize: 7 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  // Timeline table
  var items = [];
  var filteredEntries = entries;
  var filteredModuli = moduli;
  if (dal) {
    filteredEntries = filteredEntries.filter(function (e) {
      return e.data >= dal;
    });
    filteredModuli = filteredModuli.filter(function (m) {
      return (m.created_at || m.data_modulo) >= dal;
    });
  }
  if (al) {
    filteredEntries = filteredEntries.filter(function (e) {
      return e.data <= al + 'T23:59:59';
    });
    filteredModuli = filteredModuli.filter(function (m) {
      return (m.created_at || m.data_modulo) <= al + 'T23:59:59';
    });
  }
  filteredEntries.forEach(function (e) {
    items.push([new Date(e.data).toLocaleDateString('it-IT'), e.tipo, e.testo.substring(0, 80), e.operatore || '']);
  });
  filteredModuli.forEach(function (m) {
    var label = { allineamento: 'Allineamento', apprezzamento: 'Apprezzamento', rdi: 'RDI' }[m.tipo] || m.tipo;
    items.push([
      new Date(m.created_at || m.data_modulo).toLocaleDateString('it-IT'),
      '[Modulo] ' + label,
      m.resp_settore || '',
      m.operatore || '',
    ]);
  });
  items.sort(function (a, b) {
    return b[0].split('/').reverse().join('').localeCompare(a[0].split('/').reverse().join(''));
  });

  if (items.length) {
    doc.autoTable({
      theme: 'grid',
      startY: doc.lastAutoTable.finalY + 6,
      head: [['Data', 'Tipo', 'Descrizione', 'Operatore']],
      body: items,
      theme: 'striped',
      headStyles: { fillColor: [26, 74, 122], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: { 2: { cellWidth: 80 } },
      margin: { left: 14, right: 14 },
    });
  }

  mostraPdfPreview(
    doc,
    'scheda_' + nome.replace(/\s+/g, '_') + '_' + new Date().toLocaleDateString('it-IT').replace(/\//g, '-') + '.pdf',
    'Scheda ' + nome,
  );
}

// CONFRONTO COLLABORATORI
function apriConfrontoScheda(nomeIniziale) {
  var nomi = getNomiLista();
  var mc = document.getElementById('pwd-modal-content');
  var optHtml = nomi
    .map(function (n) {
      return '<option value="' + escP(n) + '"' + (n === nomeIniziale ? ' selected' : '') + '>' + escP(n) + '</option>';
    })
    .join('');
  var h =
    '<h3>Confronta collaboratori</h3><p style="color:var(--muted);margin-bottom:14px">Seleziona 2-3 collaboratori da confrontare</p>';
  h +=
    '<div class="modulo-field"><label>Collaboratore 1</label><select id="conf-c1" style="padding:10px">' +
    optHtml +
    '</select></div>';
  h +=
    '<div class="modulo-field"><label>Collaboratore 2</label><select id="conf-c2" style="padding:10px"><option value="">&#8212; Seleziona &#8212;</option>' +
    optHtml +
    '</select></div>';
  h +=
    '<div class="modulo-field"><label>Collaboratore 3 (opzionale)</label><select id="conf-c3" style="padding:10px"><option value="">&#8212; Nessuno &#8212;</option>' +
    optHtml +
    '</select></div>';
  h +=
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="eseguiConfronto()">Confronta</button></div>';
  mc.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}

function eseguiConfronto() {
  var c1 = (document.getElementById('conf-c1') || {}).value || '';
  var c2 = (document.getElementById('conf-c2') || {}).value || '';
  var c3 = (document.getElementById('conf-c3') || {}).value || '';
  if (!c1 || !c2) {
    toast('Seleziona almeno 2 collaboratori');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  var selezione = [c1, c2];
  if (c3) selezione.push(c3);
  _mostraConfronto(selezione);
}

function _mostraConfronto(nomi) {
  _destroySchedaCharts();
  var allData = getDatiReparto();
  var tipoErr = nomeCorrente('Errore');
  var now = new Date();
  var labels = [];
  var datasets = [];
  var colors = ['#c0392b', '#1a4a7a', '#b8860b'];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MESI[d.getMonth()] + ' ' + d.getFullYear());
  }
  nomi.forEach(function (nome, idx) {
    var entries = allData.filter(function (e) {
      return e.nome === nome;
    });
    var data = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      data.push(
        entries.filter(function (e) {
          var ed = new Date(e.data);
          return e.tipo === tipoErr && ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
        }).length,
      );
    }
    datasets.push({
      label: nome,
      data: data,
      borderColor: colors[idx],
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: colors[idx],
    });
  });

  // Build KPI comparison table
  var tipoMal = nomeCorrente('Malattia'),
    tipoAmm = nomeCorrente('Ammonimento Verbale');
  var tableRows = nomi
    .map(function (nome) {
      var entries = allData.filter(function (e) {
        return e.nome === nome;
      });
      var moduli = getModuliReparto().filter(function (m) {
        return m.collaboratore && m.collaboratore.toLowerCase() === nome.toLowerCase();
      });
      return (
        '<tr><td><strong>' +
        escP(nome) +
        '</strong></td><td class="num">' +
        entries.length +
        '</td><td class="num">' +
        entries.filter(function (e) {
          return e.tipo === tipoErr;
        }).length +
        '</td><td class="num">' +
        entries.filter(function (e) {
          return e.tipo === tipoMal;
        }).length +
        '</td><td class="num">' +
        entries.filter(function (e) {
          return e.tipo === tipoAmm;
        }).length +
        '</td><td class="num">' +
        moduli.filter(function (m) {
          return m.tipo === 'allineamento';
        }).length +
        '</td><td class="num">' +
        moduli.filter(function (m) {
          return m.tipo === 'apprezzamento';
        }).length +
        '</td></tr>'
      );
    })
    .join('');

  var html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3>Confronto collaboratori</h3><p style="color:var(--muted);font-size:.82rem">' +
    nomi.join(' vs ') +
    '</p></div>';
  html +=
    '<button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\');_destroySchedaCharts()" style="padding:6px 12px;font-size:.75rem">Chiudi</button></div>';
  html +=
    '<table class="collab-table" style="margin-bottom:16px"><thead><tr><th>Collaboratore</th><th class="num">Tot</th><th class="num">Errori</th><th class="num">Malattie</th><th class="num">Amm. Verb.</th><th class="num">Allineam.</th><th class="num">Appr.</th></tr></thead><tbody>' +
    tableRows +
    '</tbody></table>';
  html +=
    '<h4 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:8px">Errori/mese (ultimi 6 mesi)</h4>';
  html += '<div class="scheda-chart-wrap"><canvas id="scheda-chart-confronto"></canvas></div>';

  var box = document.getElementById('profilo-content');
  box.className = 'profilo-box scheda-wide';
  box.innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
  setTimeout(function () {
    var el = document.getElementById('scheda-chart-confronto');
    if (!el) return;
    if (_schedaCharts.confronto) _schedaCharts.confronto.destroy();
    _schedaCharts.confronto = new Chart(el, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration: 400 },
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { font: { size: 10 } } } },
      },
    });
  }, 100);
}

// BIRTHDAY ALERTS BANNER
function checkCompleanniBanner() {
  var banner = document.getElementById('compleanni-banner');
  if (!banner) return;
  var compleanni = [];
  collaboratoriCache.forEach(function (c) {
    if (!c.data_nascita) return;
    if (_isCompleannoOggi(c.data_nascita)) compleanni.push(c.nome);
  });
  if (compleanni.length) {
    banner.textContent = '&#127874; Buon compleanno a: ' + compleanni.join(', ') + '!';
    banner.innerHTML =
      '&#127874; Buon compleanno a: <strong>' +
      compleanni
        .map(function (n) {
          return escP(n);
        })
        .join(', ') +
      '</strong>!';
    banner.classList.remove('hidden');
    banner.style.display = 'flex';
  } else {
    banner.classList.add('hidden');
    banner.style.display = 'none';
  }
}

// NOTIFICHE BROWSER + WEB PUSH
function urlBase64ToUint8Array(b) {
  var p = '='.repeat((4 - (b.length % 4)) % 4);
  var b64 = (b + p).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(b64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function registraPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return;
  }
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') return;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    var j = sub.toJSON();
    var op = getOperatore();
    if (!op || !j.endpoint || !j.keys) return;
    await fetch(SB_URL + '/functions/v1/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, 'x-push-secret': PUSH_SECRET },
      body: JSON.stringify({
        action: 'register',
        operatore: op,
        reparto_dip: currentReparto,
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
      }),
    });
  } catch (e) {
    console.error('Push reg:', e);
  }
}
function inviaPush(destinatari, titolo, corpo, tipo, crossReparto) {
  var op = getOperatore();
  if (!op) return;
  var body = {
    destinatari: Array.isArray(destinatari) ? destinatari : [destinatari],
    titolo: titolo,
    corpo: (corpo || '').substring(0, 200),
    mittente: op,
    tipo: tipo || 'general',
  };
  if (!crossReparto) body.reparto_dip = currentReparto;
  fetch(SB_URL + '/functions/v1/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, 'x-push-secret': PUSH_SECRET },
    body: JSON.stringify(body),
  }).catch(function () {});
}
function checkBudgetPushAfterInsert(nomeCliente) {
  var budget = getBudgetReparto().find(function (b) {
    return b.nome.toLowerCase() === nomeCliente.toLowerCase();
  });
  if (!budget || !budget.budget_chf) return;
  var now = new Date(),
    meseStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
  var spent = getMaisonRepartoExpanded()
    .filter(function (r) {
      return r.nome.toLowerCase() === nomeCliente.toLowerCase() && r.data_giornata >= meseStart;
    })
    .reduce(function (s, r) {
      return s + parseFloat(r.costo || 0);
    }, 0);
  if (spent >= budget.budget_chf)
    inviaPush(
      ['tutti'],
      'Budget superato: ' + nomeCliente,
      nomeCliente + ' ' + spent.toFixed(0) + '/' + budget.budget_chf.toFixed(0) + ' CHF',
      'budget',
    );
}
function inviaNotifica(titolo, corpo, onClick) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(titolo, { body: corpo, icon: 'icon-192.png', badge: 'icon-192.png' });
    if (onClick)
      n.onclick = function () {
        window.focus();
        onClick();
        n.close();
      };
  } catch (e) {}
}
async function pollNuoveNote() {
  if (sessionStorage.getItem('diario_auth') !== '1') return;
  try {
    const op = getOperatore();
    // ENTERPRISE: refetch da chat_messages + chat_message_letti + chat_message_hidden
    const [msgs, letti, hidden] = await Promise.all([
      secGet('chat_messages?order=created_at.desc'),
      secGet('chat_message_letti?order=letta_at.desc'),
      secGet('chat_message_hidden?order=hidden_at.desc'),
    ]);
    const vecchieNonLette = noteColleghiCache.filter(
      (n) => n.a_operatore === op && !n.letta && !n.nascosta_dest,
    ).length;
    chatMessagesCache = msgs || [];
    chatLettiCache = letti || [];
    chatHiddenCache = hidden || [];
    await decryptChatMessagesCache();
    _chatBuildNoteCache();
    aggiornaNoteBadge();
    const nuoveNonLette = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && !n.nascosta_dest).length;
    if (nuoveNonLette > vecchieNonLette) {
      toast('Hai ' + nuoveNonLette + ' nota/e non letta/e!');
      const nuoveArr = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && !n.nascosta_dest);
      if (nuoveArr.length)
        inviaNotifica('Nuova nota da ' + nuoveArr[0].da_operatore, (nuoveArr[0].messaggio || '').substring(0, 80));
    }
    const pg = localStorage.getItem('pagina_corrente');
    if (pg === 'note-collega') renderNoteCollega();
  } catch (e) {}
}
function mostraNoteNonLette() {
  const op = getOperatore();
  if (!op) return;
  if (sessionStorage.getItem('note_popup_shown')) return;
  const nonLette = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && !n.nascosta_dest);
  if (!nonLette.length) return;
  sessionStorage.setItem('note_popup_shown', '1');
  const mc = document.getElementById('note-modal-content');
  // Segna tutte come lette automaticamente all'apertura del popup
  segnaNoteLette();
  // FIX BUG #2: pulisci il testo da tag [REPLY:id:nome:testo] e [GNAME:nome] prima di mostrarlo
  // FIX BUG #3: indica se il messaggio era in un gruppo (label gruppo accanto al mittente)
  const _pulisciTesto = (t) =>
    (t || '')
      .replace(/\[REPLY:\d+:[^:]*:[^\]]*\]/g, '')
      .replace(/\[GNAME:[^\]]*\]/g, '')
      .trim();
  const _gruppoLabel = (n) => {
    if (!n.gruppo_id || !n.gruppo_id.startsWith('__gruppo_')) return '';
    const gid = n.gruppo_id;
    if (gid === '__gruppo_slots') return ' (in Tutti Slots)';
    if (gid === '__gruppo_tavoli') return ' (in Tutti Tavoli)';
    if (gid === '__gruppo_tutti') return ' (in Tutti)';
    if (gid.startsWith('__gruppo_custom_')) {
      const nm = _getGruppoNome(gid);
      return nm ? ' (in ' + escP(nm) + ')' : ' (in gruppo)';
    }
    return ' (in gruppo)';
  };
  mc.innerHTML =
    '<h3 style="margin-bottom:4px">Hai ' +
    nonLette.length +
    ' nota/e non letta/e</h3><p style="color:var(--muted);font-size:.82rem;margin-bottom:16px">Messaggi dai tuoi colleghi</p>' +
    nonLette
      .map((n) => {
        const testoPulito = _pulisciTesto(n.messaggio);
        const ctxGruppo = _gruppoLabel(n);
        return (
          '<div style="background:var(--paper2);border-radius:3px;padding:12px;margin-bottom:10px;border-left:3px solid var(--accent2)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="color:var(--accent2)">Da: ' +
          escP(n.da_operatore) +
          '<span style="font-weight:400;color:var(--muted);font-size:.82rem">' +
          ctxGruppo +
          '</span></strong><span style="font-size:.75rem;color:var(--muted)">' +
          new Date(n.created_at).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }) +
          '</span></div><div style="font-size:.95rem">' +
          esc(testoPulito) +
          "</div><button style=\"margin-top:8px;color:var(--accent2);border:1px solid var(--accent2);background:none;padding:4px 14px;border-radius:2px;font-size:.78rem;font-weight:600;cursor:pointer;font-family:Source Sans 3,sans-serif\" onclick=\"document.getElementById('note-modal').classList.add('hidden');switchPage('note-collega');setTimeout(function(){rispondiNota('" +
          escP(n.da_operatore).replace(/'/g, "\\'") +
          "'," +
          n.id +
          ')},300)">Rispondi</button></div>'
        );
      })
      .join('') +
    '<div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'note-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  document.getElementById('note-modal').classList.remove('hidden');
}
async function segnaNoteLette() {
  // ENTERPRISE: marca tutti i messaggi non letti dell'operatore corrente via chat_mark_letta
  const op = getOperatore();
  const tk = getOpToken();
  const nonLette = noteColleghiCache.filter((n) => n.a_operatore === op && !n.letta && n.da_operatore !== op);
  const messageIds = [...new Set(nonLette.map((n) => n._chat_id || n.id))];
  const ora = new Date().toISOString();
  const failed = [];
  for (const mid of messageIds) {
    try {
      await sbRpc('chat_mark_letta', { p_token: tk, p_message_id: mid });
      if (!chatLettiCache.some((l) => l.message_id === mid && l.operatore === op)) {
        chatLettiCache.push({ message_id: mid, operatore: op, letta_at: ora });
      }
    } catch (e) {
      console.error('chat_mark_letta fallita per id ' + mid + ':', e.message);
      failed.push(mid);
    }
  }
  if (failed.length) toast(failed.length + ' note non marcate lette (errore rete)');
  _chatBuildNoteCache();
  renderNoteCollega();
}
