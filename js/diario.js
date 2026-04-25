/**
 * Diario Collaboratori — Casino Lugano SA
 * File: diario.js
 * Diario: salva, modifica, elimina registrazioni
 * Righe: 855
 */

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
