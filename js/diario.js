/**
 * Diario Collaboratori · Casino Lugano SA
 * File: diario.js
 * Diario: salva, modifica, elimina registrazioni
 */

// un salvataggio alla volta: il doppio click creava righe doppie (unaVoltaSola in utils.js)
function salva() {
  return unaVoltaSola('diario-salva', () => _salvaEsegui());
}
async function _salvaEsegui() {
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
        !(await chiediConferma(
          nome +
            ': registrare ' +
            nGiorni +
            ' giorni di malattia dal ' +
            dInizio.toLocaleDateString('it-IT') +
            ' al ' +
            dFine.toLocaleDateString('it-IT') +
            '?',
        ))
      )
        return;
      let creati = 0;
      const nonSalvati = []; // giorni che il database non ha salvato: si dicono
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
            giornoDi(e.data) === dStr,
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
          } catch (e) {
            console.error('Malattia del ' + dStr + ' non salvata:', e);
            nonSalvati.push(dStr.split('-').reverse().join('.'));
          }
        }
      }
      if (!getCollaboratoriReparto().find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
        try {
          const cr = await secPost('collaboratori', {
            nome,
            attivo: true,
            reparto_dip: currentReparto,
          });
          collaboratoriCache.push(cr[0]);
        } catch (e2) {}
      }
      document.getElementById('inp-testo').value = '';
      resetMalFiltri();
      logAzione('Malattia range', nome + ' · ' + creati + ' giorni');
      // PIANO: i giorni con un turno diventano M protetta, i C restano C (MC),
      // i CGF in piu' tornano C. Prima succedeva solo correggendo la registrazione.
      if (creati && typeof sincronizzaMalattiaPiano === 'function') {
        try {
          const sync = await sincronizzaMalattiaPiano(
            nome,
            '',
            malDal,
            'dal ' + dInizio.toLocaleDateString('it-IT') + ' al ' + dFine.toLocaleDateString('it-IT'),
          );
          if (sync && sync.messe) toast(nome + ': ' + sync.messe + ' turni del piano segnati M', 5000);
        } catch (e) {
          toastErrore('Piano non allineato alla malattia: ' + (e.message || ''));
        }
      }
      if (nonSalvati.length)
        toastErrore(
          nome +
            ': ' +
            creati +
            ' giorni registrati, NON salvati: ' +
            nonSalvati.join(', ') +
            '. Riprova per quei giorni.',
          9000,
        );
      else toast(nome + ': ' + creati + ' giorni malattia registrati');
      aggiornaNomi();
      render();
      updateStats();
      // Popup copertura turno: chi copre / chi ha rifiutato
      if (creati && typeof apriPopupCopertura === 'function') apriPopupCopertura(nome, malDal);
      return;
    }
  }
  // Non Disponibilità con giorni selezionati dal calendario
  if (tipoSelezionato === nomeCorrente('Non Disponibilità') && _ndSelectedDates.length) {
    // ND solo ai jolly (decisione del titolare, come nel calendario del Piano)
    if (typeof _pianoEJolly === 'function' && _pianoCollabInfo(nome) && !_pianoEJolly(nome)) {
      await mostraAvviso(
        nome +
          ' non e un jolly: la non disponibilità (ND) vale solo per i jolly. Per un collaboratore fisso si usa un congedo o un cambio turno.',
        { titolo: 'Non disponibilità' },
      );
      return;
    }
    // nome che non e (ancora) un collaboratore: verrebbe creato come fisso con la ND.
    // Prima si crea il collaboratore come jolly (Gestione collaboratori), poi la ND.
    if (typeof _pianoCollabInfo === 'function' && !_pianoCollabInfo(nome)) {
      await mostraAvviso(
        nome +
          ' non e fra i collaboratori attivi. La non disponibilità vale solo per i jolly: crealo prima come jolly in Gestione collaboratori (o controlla il nome), poi registra la ND.',
        { titolo: 'Non disponibilità' },
      );
      return;
    }
    const sorted = [..._ndSelectedDates].sort();
    const dateLabel = sorted.map((ds) => new Date(ds + 'T12:00:00').toLocaleDateString('it-IT')).join(', ');
    const nGiorni = sorted.length;
    // giorni oltre il termine di consegna: si registrano lo stesso, ma con
    // conferma esplicita e nota "fuori termine" che resta nella registrazione
    const fuoriT = typeof ndGiornoFuoriTempo === 'function' ? sorted.filter((ds) => ndGiornoFuoriTempo(ds)) : [];
    if (fuoriT.length) {
      if (
        !(await chiediConferma(
          '\u26a0 ' +
            fuoriT.length +
            (fuoriT.length === 1 ? " giorno e'" : ' giorni sono') +
            ' FUORI TEMPO (il termine di consegna era già passato):\n\n' +
            fuoriT.map((ds) => '\u2022 ' + new Date(ds + 'T12:00:00').toLocaleDateString('it-IT')).join('\n') +
            '\n\nRegistro comunque? La nota "fuori termine" restera\' scritta.',
        ))
      )
        return;
    }
    const descDate =
      ' (' +
      nGiorni +
      ' giorn' +
      (nGiorni === 1 ? 'o' : 'i') +
      ': ' +
      dateLabel +
      ')' +
      (fuoriT.length ? ' [consegna fuori termine]' : '');
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
      if (!getCollaboratoriReparto().find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
        try {
          const cr = await secPost('collaboratori', {
            nome,
            attivo: true,
            reparto_dip: currentReparto,
          });
          collaboratoriCache.push(cr[0]);
        } catch (e2) {}
      }
      document.getElementById('inp-testo').value = '';
      resetNdFiltri();
      // modulo di non disponibilita del mese (uno per mese toccato), salvato nella scheda.
      // Registrazione e modulo sono UNA azione per Annulla: prima il modulo arrivava
      // dopo come azione separata e Annulla toglieva solo quello
      const mesiNd = [...new Set(sorted.map((ds) => ds.substring(0, 7)))];
      if (typeof ndSincronizzaPersona === 'function')
        for (const ym of mesiNd) await ndSincronizzaPersona(nome, ym, { senzaLog: true });
      logAzione('Non disponibilità', nome + descDate);
      toast(nome + ': non disponibilità registrata (' + nGiorni + ' giorni)');
      await _diarioNdNelPiano(nome, sorted);
      aggiornaNomi();
      render();
      updateStats();
    } catch (e) {
      toast('Errore salvataggio');
    }
    return;
  }
  // Controllo duplicati: stesso nome + stesso tipo + oggi. "data" e un istante in
  // UTC: il giorno si confronta in ora locale (giornoDi), altrimenti fra mezzanotte
  // e le 2 una registrazione di oggi risultava di ieri e il doppione passava.
  const oggi = oggiLocale();
  const dupExact = getDatiReparto().find(
    (e) =>
      e.nome.toLowerCase() === nome.toLowerCase() &&
      e.tipo === tipoSelezionato &&
      e.testo === testo &&
      giornoDi(e.data) === oggi,
  );
  if (dupExact) {
    toast('Registrazione identica già presente per oggi');
    return;
  }
  const dupSimile = getDatiReparto().filter(
    (e) => e.nome.toLowerCase() === nome.toLowerCase() && e.tipo === tipoSelezionato && giornoDi(e.data) === oggi,
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
    if (!(await chiediConferma(msg))) return;
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
    // malattia di un giorno solo: stesso allineamento del piano del periodo
    if (tipoSelezionato === nomeCorrente('Malattia') && typeof sincronizzaMalattiaPiano === 'function') {
      try {
        await sincronizzaMalattiaPiano(nome, '', rec.data, rec.testo || '');
      } catch (e) {
        toastErrore('Piano non allineato alla malattia: ' + (e.message || ''));
      }
    }
    document.getElementById('inp-testo').value = '';
    document.getElementById('inp-importo').value = '';
    document.getElementById('inp-reparto').value = '';
    if (!collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      try {
        const cr = await secPost('collaboratori', {
          nome,
          attivo: true,
          reparto_dip: currentReparto,
        });
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
    // Malattia (giorno singolo) → popup copertura turno
    if (tipoSelezionato === nomeCorrente('Malattia') && typeof apriPopupCopertura === 'function') {
      apriPopupCopertura(nome, oggiLocale());
    }
  } catch (e) {
    toast('Errore salvataggio');
  }
}
function _suggerisciFollowUp(nome, testo) {
  const b = document.getElementById('pwd-modal-content');
  const testoBreve = testo.substring(0, 80);
  const fra3 = dataLocaleISO(new Date(Date.now() + 3 * 86400000));
  const fra7 = dataLocaleISO(new Date(Date.now() + 7 * 86400000));
  const fra14 = dataLocaleISO(new Date(Date.now() + 14 * 86400000));
  const fra30 = dataLocaleISO(new Date(Date.now() + 30 * 86400000));
  function _fmtD(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
    });
  }
  const opzioni = [
    [fra3, 'Fra 3 giorni'],
    [fra7, 'Fra 1 settimana'],
    [fra14, 'Fra 2 settimane'],
    [fra30, 'Fra 1 mese'],
  ];
  // Niente dati dentro onclick: un a-capo o una virgoletta nel testo della
  // richiesta rendeva morti tutti i bottoni. Nome e testo restano in chiusura.
  b.innerHTML =
    '<h3>Scadenza della verifica</h3><p style="margin-bottom:14px">Richiesta registrata per <strong>' +
    escP(nome) +
    '</strong>. Entro quando va risolta?</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
    opzioni
      .map(
        ([iso, label]) =>
          '<button class="btn-salva" style="background:var(--accent2);padding:10px" data-followup-data="' +
          iso +
          '">' +
          label +
          '<br><small style="opacity:.7">' +
          _fmtD(iso) +
          '</small></button>',
      )
      .join('') +
    '</div><div class="pwd-field"><label>Oppure data personalizzata</label><input type="text" id="followup-data" placeholder="Seleziona..." readonly style="cursor:pointer"></div><div class="pwd-modal-btns"><button class="btn-modal-ok" data-followup-data="">Crea con data personalizzata</button><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Nessun promemoria</button></div>';
  b.querySelectorAll('[data-followup-data]').forEach((btn) => {
    btn.addEventListener('click', () => _creaFollowUp(nome, testoBreve, btn.dataset.followupData));
  });
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
    toast('Promemoria di verifica creato per ' + nome);
  } catch (e) {
    toast('Errore creazione promemoria');
  }
}
async function elimina(id) {
  if (!(await chiediConferma('Eliminare? Sarà spostata nel cestino.'))) return;
  const _e = datiCache.find((x) => x.id === id);
  const op = getOperatore();
  const now = new Date().toISOString();
  try {
    await secPatch('registrazioni', 'id=eq.' + id, {
      eliminato: true,
      eliminato_da: op,
      eliminato_at: now,
    });
    if (_e) {
      _e.eliminato = true;
      _e.eliminato_da = op;
      _e.eliminato_at = now;
    }
    datiCache = datiCache.filter((e) => !e.eliminato);
    _diarioTogliArchivioLeggero(id);
    pinnedIds.delete(id);
    // ND cancellata: modulo e piano tornano come prima ("Ex R22")
    if (_e && _e.tipo === nomeCorrente('Non Disponibilità')) await _diarioNdRiallinea([_e]);
    // malattia cancellata: nel Piano tornano le sigle che la M aveva coperto ("Ex R23")
    if (_e && _e.tipo === nomeCorrente('Malattia') && typeof sincronizzaMalattiaPiano === 'function') {
      try {
        await sincronizzaMalattiaPiano(_e.nome, _e.testo || '', _e.data, '');
      } catch (e2) {
        toastErrore('Registrazione nel cestino, ma il piano non e allineato: ' + ((e2 && e2.message) || e2));
      }
    }
    // nata dal Rapporto giornaliero: la persona sparisce anche da li
    const _rap = _e && typeof _rapportoTogliRegistrazione === 'function' ? await _rapportoTogliRegistrazione(_e) : null;
    // il registro chiude l azione per Annulla: DOPO modulo ND e Rapporto, cosi Annulla
    // rimette insieme registrazione, modulo e Rapporto (prima erano due azioni e Annulla
    // annullava solo modulo e Rapporto, lasciando la registrazione nel cestino)
    if (_e) logAzione('Registrazione nel cestino', _e.nome + ' - ' + _e.tipo + ' (da ' + op + ')');
    if (_rap)
      setTimeout(
        () =>
          toast(_e.nome + ' tolto anche dal Rapporto ' + _rap.turno + ' del ' + _rap.ds.split('-').reverse().join('.')),
        900,
      );
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
    /dal\s+(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})\s+al\s+(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})/,
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
  // Stato copertura attuale (mostrato nel modal per le malattie)
  let _copStatusHtml = '';
  if (_isMalattia && typeof eventiCopertura === 'function') {
    const _per = typeof _periodoCopertura === 'function' ? _periodoCopertura(e) : null;
    const _ev = _per ? eventiCopertura(e.nome, _per.dal, _per.al) : eventiCopertura(e.nome, _dataRifCopertura(e));
    const _cop = _ev.find((p) => p.azione === 'copertura');
    const _rif = _ev.filter((p) => p.azione === 'disponibilita_negata').length;
    _copStatusHtml =
      '<div style="margin-top:8px;padding:8px 12px;background:var(--paper2);border-radius:3px;border-left:3px solid ' +
      (_cop ? '#1a7a6d' : 'var(--muted)') +
      ';font-size:var(--fs-md,.875rem)"><strong>Copertura turno:</strong> ' +
      (_cop
        ? '<span style="color:var(--c-verdeacqua,#1a7a6d);font-weight:700">' +
          escP(_cop.collaboratore) +
          ' (+' +
          _cop.punti +
          ')</span>'
        : '<span style="color:var(--muted)">nessuna registrata</span>') +
      (_rif
        ? ' · <span style="color:var(--accent);font-weight:600">' +
          _rif +
          ' rifiut' +
          (_rif === 1 ? 'o' : 'i') +
          '</span>'
        : '') +
      '<br><span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Usa "Salva + Copertura" per inserire o correggere</span></div>';
  }
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
          '</button>',
      )
      .join('') +
    '</div></div><div id="edit-malattia-dates" style="display:' +
    (_isMalattia ? 'flex' : 'none') +
    ';gap:10px;margin-top:8px"><div class="pwd-field" style="flex:1"><label>Dal</label><input type="text" id="edit-mal-dal" value="' +
    (_malDal ? new Date(_malDal + 'T12:00:00').toLocaleDateString('it-IT') : '') +
    '" placeholder="GG/MM/AAAA" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div><div class="pwd-field" style="flex:1"><label>Al</label><input type="text" id="edit-mal-al" value="' +
    (_malAl ? new Date(_malAl + 'T12:00:00').toLocaleDateString('it-IT') : '') +
    '" placeholder="GG/MM/AAAA" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:2px;background:var(--paper2);color:var(--ink)"></div></div>' +
    _copStatusHtml +
    '<div class="pwd-field"><label>Descrizione</label><textarea id="edit-testo" rows="4" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:2px;font-family:Source Sans 3,sans-serif;font-size:var(--fs-md,.875rem);background:var(--paper2);color:var(--ink);resize:vertical">' +
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
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    (_isMalattia
      ? '<button class="btn-modal-ok" style="background:#1a7a6d" onclick="salvaModificaRegistrazione(' +
        id +
        ',true)">Salva + Copertura</button>'
      : '') +
    '<button class="btn-modal-ok" onclick="salvaModificaRegistrazione(' +
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
async function salvaModificaRegistrazione(id, conCopertura) {
  const nome = document.getElementById('edit-nome').value.trim();
  let testo = document.getElementById('edit-testo').value.trim();
  const tipo = window._editTipoCorrente;
  let _copDataRef = null;
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
            '',
          )
          .trim();
        testo = testo.replace(/\s*\(\d+ giorni[^)]*\)/gi, '').trim();
        if (nGiorni > 1) testo += ' dal ' + dalFmt + ' al ' + alFmt + ' (' + nGiorni + ' giorni)';
        else if (nGiorni === 1) testo += ' il ' + dalFmt + ' (1 giorno)';
        _copDataRef =
          d1.getFullYear() +
          '-' +
          String(d1.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d1.getDate()).padStart(2, '0');
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
    const eV = datiCache.find((x) => x.id === id);
    const testoVecchio = eV ? eV.testo : '';
    const dataVecchia = eV ? eV.data : '';
    const nomeVecchio = eV ? eV.nome : '';
    const importoVecchio = eV ? parseFloat(eV.importo) || 0 : 0;
    await secPatch('registrazioni', 'id=eq.' + id, update);
    const e = datiCache.find((x) => x.id === id);
    if (e) Object.assign(e, update);
    // malattia con date corrette: il piano si allinea da solo (le M salvate
    // nei giorni sbagliati vengono tolte, i giorni giusti ricevono la M)
    const sync = await _diarioAllineaMalattiaPiano(
      { nome: nomeVecchio, tipo: eV ? eV.tipo : '', testo: testoVecchio, data: dataVecchia },
      { nome: nome, tipo: tipo, testo: testo, data: dataVecchia },
    );
    if (sync && (sync.tolte || sync.messe))
      toast('Piano allineato: ' + sync.tolte + ' M tolte, ' + sync.messe + ' M messe');
    // ND modificata (date, persona o tipo): vecchi e nuovi mesi riallineati
    await _diarioNdRiallinea([
      { nome: nomeVecchio, tipo: eV ? eV.tipo : '', testo: testoVecchio },
      { nome: nome, tipo: tipo, testo: testo },
    ]);
    logAzione('Modifica registrazione', nome + ' - ' + tipo + ': ' + testo.substring(0, 60));
    // nata dal Rapporto giornaliero: si chiede se correggere anche il Rapporto
    const _rapO = e && typeof _rapportoOrigineDi === 'function' ? _rapportoOrigineDi(e) : null;
    if (
      _rapO &&
      (testoVecchio !== testo ||
        nomeVecchio !== nome ||
        (impEl && importoVecchio !== (parseFloat(update.importo) || 0))) &&
      (await chiediConferma(
        'Questa registrazione viene dal Rapporto ' +
          _rapO.turno +
          ' del ' +
          _rapO.ds.split('-').reverse().join('.') +
          ': la correggo anche li?',
        { titolo: 'Correggere anche il Rapporto', ok: 'Si, correggi il Rapporto', annulla: 'No' },
      ))
    ) {
      if (await _rapportoCorreggiRegistrazione(e, nomeVecchio)) toast('Rapporto corretto');
    }
    document.getElementById('pwd-modal').classList.add('hidden');
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    toast('Registrazione modificata');
    // "Salva + Copertura": apre il popup chi copre / chi ha rifiutato
    if (conCopertura && tipo === nomeCorrente('Malattia') && typeof apriPopupCopertura === 'function') {
      const dataRef = _copDataRef || (e && e.data ? giornoDi(e.data) : oggiLocale());
      setTimeout(() => apriPopupCopertura(nome, dataRef), 150);
    }
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
// ND NEL PIANO GIA FATTO: se nei giorni di non disponibilita il jolly ha gia un turno
// (piano del mese pubblicato), il programma lo dice e propone subito chi lo copre
// (Copertura, gia compilata: alla conferma ND al jolly e turno al sostituto). Senza
// copertura i turni diventano ND e i posti restano da coprire (Valida/Migliora).
async function _diarioNdNelPiano(nome, giorni) {
  if (typeof ndTurniNeiGiorni !== 'function') return;
  let turni = [];
  try {
    turni = await ndTurniNeiGiorni(nome, giorni);
  } catch (e) {
    return;
  }
  const mesi = [...new Set(giorni.map((d) => d.substring(0, 7)))];
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
  if (!turni.length) {
    for (const ym of mesi) await ndAllineaPiano(nome, ym).catch(() => null);
    return;
  }
  const elenco = turni.map((t) => gg(t.data) + ' ' + t.codice).join(', ');
  const puo = typeof puoGestirePiano === 'function' && puoGestirePiano();
  if (puo && turni.every((t) => t.data.substring(0, 7) === turni[0].data.substring(0, 7))) {
    const cerca = await chiediConferma(
      nome +
        ' ha già dei turni nel piano in quei giorni: ' +
        elenco +
        '.\n\nCerco subito chi li copre? Alla conferma ' +
        nome +
        ' risulta non disponibile (ND) e il turno passa al sostituto. Altrimenti i turni diventano ND e i posti restano da coprire.',
      { ok: 'Cerca chi copre', annulla: 'Lascia i posti scoperti', titolo: 'Turni da coprire' },
    );
    if (cerca) {
      const g = turni.map((t) => parseInt(t.data.substring(8, 10)));
      await apriCoperturaAssenza(nome, turni[0].data.substring(0, 7), Math.min(...g), Math.max(...g));
      return;
    }
  }
  let r = { messe: 0, riservate: [] };
  try {
    for (const ym of mesi) {
      const x = await ndAllineaPiano(nome, ym);
      if (x) {
        r.messe += x.messe;
        r.riservate = r.riservate.concat(x.riservate || []);
      }
    }
  } catch (e) {
    toastErrore('Piano non aggiornato per la ND (' + elenco + '): da sistemare da chi gestisce il piano.');
    return;
  }
  if (r.messe) toast(nome + ': ' + r.messe + ' turni diventati ND (' + elenco + '), posti da coprire', 6000);
  // celle con lucchetto (visita medica, corso...) non si cambiano in ND: si dice
  if (r.riservate.length)
    await mostraAvviso(
      nome +
        ': la ND cade su celle bloccate con motivo, rimaste come sono:\n' +
        r.riservate
          .map((x) => x.data.split('-').reverse().join('.') + ' ' + x.codice + ' (' + x.motivo + ')')
          .join('\n') +
        '\n\nSe la ND vale comunque, togli il lucchetto dalla cella nel piano.',
      { titolo: 'ND e celle bloccate' },
    );
}
// ND tolta o cambiata (elimina, modifica, Annulla): modulo e piano dei mesi toccati
// tornano allineati alle registrazioni rimaste (i turni coperti dalla ND tornano)
async function _diarioNdRiallinea(righe) {
  const tipoNd = nomeCorrente('Non Disponibilità');
  const da = {};
  (righe || []).forEach((e) => {
    if (!e || e.tipo !== tipoNd || !e.nome) return;
    (String(e.testo || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g) || []).forEach((dd) => {
      const p = dd.split('/');
      (da[e.nome] = da[e.nome] || new Set()).add(p[2] + '-' + p[1].padStart(2, '0'));
    });
  });
  for (const nome of Object.keys(da))
    for (const ym of da[nome]) {
      try {
        // prima il piano (le ND scritte sopra i turni tornano al turno), poi il modulo,
        // che legge anche le ND del piano
        if (typeof ndAllineaPiano === 'function') await ndAllineaPiano(nome, ym);
        if (typeof ndSincronizzaPersona === 'function') await ndSincronizzaPersona(nome, ym, { senzaLog: true });
      } catch (e) {
        toastErrore('ND di ' + nome + ' ' + ym + ': piano non riallineato (' + ((e && e.message) || e) + ')');
      }
    }
}
// PIANO ALLINEATO A OGNI MODIFICA DI UNA MALATTIA nel Diario: date cambiate,
// persona cambiata (le M del nome vecchio si tolgono), tipo cambiato da o verso
// Malattia. Prima si allineava solo quando cambiava il testo, e sul nome nuovo.
async function _diarioAllineaMalattiaPiano(vecchia, nuova) {
  if (typeof sincronizzaMalattiaPiano !== 'function') return null;
  const malT = nomeCorrente('Malattia');
  const eraMal = vecchia.tipo === malT;
  const eMal = nuova.tipo === malT;
  const altraPersona = String(vecchia.nome || '').toLowerCase() !== String(nuova.nome || '').toLowerCase();
  const tot = { tolte: 0, messe: 0 };
  const somma = (r) => {
    if (r) {
      tot.tolte += r.tolte || 0;
      tot.messe += r.messe || 0;
    }
  };
  try {
    if (eraMal && eMal && !altraPersona) {
      if (vecchia.testo !== nuova.testo)
        somma(await sincronizzaMalattiaPiano(nuova.nome, vecchia.testo, vecchia.data, nuova.testo));
      return tot;
    }
    if (eraMal) somma(await sincronizzaMalattiaPiano(vecchia.nome, vecchia.testo, vecchia.data, ''));
    if (eMal) somma(await sincronizzaMalattiaPiano(nuova.nome, '', nuova.data, nuova.testo));
  } catch (e) {
    toastErrore('Piano non allineato alla malattia: ' + ((e && e.message) || e));
  }
  return tot;
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
  const tipoNd = nomeCorrente('Non Disponibilità');
  const e0 = datiCache.find((x) => x.id === modalEntryId);
  // l ND vale solo per i jolly: come alla registrazione
  if (
    modalTipoSel === tipoNd &&
    e0 &&
    typeof _pianoEJolly === 'function' &&
    _pianoCollabInfo(e0.nome) &&
    !_pianoEJolly(e0.nome)
  ) {
    toastErrore(e0.nome + ' e fisso: la non disponibilità vale solo per i jolly.');
    return;
  }
  try {
    await secPatch('registrazioni', 'id=eq.' + modalEntryId, {
      tipo: modalTipoSel,
      modificato_da: mod,
    });
    const e = datiCache.find((e) => e.id === modalEntryId);
    const tipoVecchio = e ? e.tipo : '';
    if (e) {
      e.tipo = modalTipoSel;
      e.modificato_da = mod;
      // diventata (o non piu) malattia: il piano si allinea come nelle altre strade
      await _diarioAllineaMalattiaPiano(
        { nome: e.nome, tipo: tipoVecchio, testo: e.testo, data: e.data },
        { nome: e.nome, tipo: modalTipoSel, testo: e.testo, data: e.data },
      );
      // diventata (o non piu) ND: modulo ND e piano dei mesi toccati si riallineano
      if ((tipoVecchio === tipoNd || modalTipoSel === tipoNd) && typeof _diarioNdRiallinea === 'function')
        await _diarioNdRiallinea([{ nome: e.nome, tipo: tipoNd, testo: e.testo, data: e.data }]);
    }
    render();
    updateStats();
    toast('Tipo aggiornato');
  } catch (e) {
    toast('Errore cambio tipo');
  }
  chiudiModal();
}

// SCADENZE: sostituite dal pulsante "Promemoria" su ogni registrazione
// (promemoriaDaRegistrazione in promemoria.js). La tabella scadenze resta nel
// database (vuota in produzione al 01.10.2026) e nei backup.

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
// RICONOSCIMENTO DEI NOMI scritti nel rapporto ("Somma -50", "Rossi malato").
// Stessi passi di prima (nome intero, cognome, cognome di piu parole, inizio
// del nome, errore di battitura), ma ogni passo raccoglie TUTTI i collaboratori
// che corrispondono: con due "Somma" non si sceglie piu il primo dell elenco.
function candidatiCollaboratore(testo) {
  const t = String(testo || '')
    .trim()
    .toLowerCase();
  if (!t) return { nomi: [], battitura: false };
  const tutti = collaboratoriCache || [];
  const parole = (c) => c.nome.toLowerCase().split(/\s+/);
  const solo = (l) => ({ nomi: [...new Set(l.map((c) => c.nome))], battitura: false });
  const esatto = tutti.filter((c) => c.nome.toLowerCase() === t);
  if (esatto.length) return solo(esatto);
  const parola = tutti.filter((c) => parole(c).includes(t));
  if (parola.length) return solo(parola);
  if (t.includes(' ')) {
    const multi = tutti.filter((c) => c.nome.toLowerCase().startsWith(t + ' '));
    if (multi.length) return solo(multi);
  }
  // inizio del nome (almeno 4 lettere: "Mai" non diventa "Maira")
  if (t.length >= 4) {
    const pref = tutti.filter((c) => parole(c).some((w) => w.startsWith(t)));
    if (pref.length) return solo(pref);
  }
  // errore di battitura: tutti quelli alla distanza minima. Al massimo 1 lettera
  // sotto le 6 (con 2 "Rossi" diventava "Sassi"), 2 per le parole piu lunghe
  if (t.length >= 3) {
    const maxD = t.length < 6 ? 1 : 2;
    let min = maxD + 1;
    let vicini = [];
    tutti.forEach((c) =>
      parole(c).forEach((w) => {
        if (w.length < 3) return;
        const d = _levenshtein(t, w);
        if (d > maxD) return;
        if (d < min) {
          min = d;
          vicini = [c];
        } else if (d === min && !vicini.includes(c)) vicini.push(c);
      }),
    );
    if (vicini.length) return { nomi: [...new Set(vicini.map((c) => c.nome))], battitura: true };
  }
  return { nomi: [], battitura: false };
}
function _collabNelSettoreAperto(nome) {
  const c = (collaboratoriCache || []).find((x) => x.nome === nome);
  if (!c) return false;
  if ((c.reparto_dip || 'slots') === currentReparto) return true;
  return String(c.reparti_extra || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .includes(currentReparto);
}
// Sceglie SENZA chiedere quando la scelta e sicura: un solo candidato, uno solo
// nel settore aperto, uno solo fra i "preferiti" (es. chi ha gia la registrazione
// di questo rapporto), oppure la scelta gia fatta dall operatore (scelte).
// Ritorna { nome } oppure { ambigui: [nomi] } oppure null (nessuno).
function scegliCollaboratore(testo, preferiti, scelte) {
  const chiave = String(testo || '')
    .trim()
    .toLowerCase();
  if (scelte && Object.prototype.hasOwnProperty.call(scelte, chiave)) return { nome: scelte[chiave] };
  const c = candidatiCollaboratore(testo);
  if (!c.nomi.length) return null;
  let pool = c.nomi;
  const nelSettore = pool.filter(_collabNelSettoreAperto);
  if (nelSettore.length) pool = nelSettore;
  if (pool.length > 1 && preferiti && preferiti.length) {
    const pref = pool.filter((n) => preferiti.some((p) => String(p).toLowerCase() === n.toLowerCase()));
    if (pref.length === 1) pool = pref;
  }
  if (pool.length === 1) {
    if (c.battitura) toast('Corretto: "' + capitalizzaNome(chiave) + '" \u2192 ' + pool[0] + ' (errore battitura)');
    return { nome: pool[0] };
  }
  return { ambigui: pool };
}
// Solo quando il nome e davvero ambiguo: finestra con i candidati (settore e
// funzione accanto al nome). Ritorna il nome scelto, oppure null se si salta.
// chiave (facoltativa): la risposta, anche "salta", vale per tutta la sessione,
// cosi il salvataggio automatico del rapporto non ripropone la stessa domanda.
const _omonimiRisposte = {};
async function chiediOmonimo(testo, nomi, contesto, chiave) {
  if (chiave && Object.prototype.hasOwnProperty.call(_omonimiRisposte, chiave)) {
    const g = _omonimiRisposte[chiave];
    return g && nomi.includes(g) ? g : null;
  }
  const info = (n) => {
    const c = (collaboratoriCache || []).find((x) => x.nome === n) || {};
    const rep = typeof repartoLabel === 'function' ? repartoLabel(c.reparto_dip || 'slots') : c.reparto_dip || '';
    return n + ' (' + [rep, c.funzione].filter(Boolean).join(', ') + ')';
  };
  const r = await chiediModulo(
    '"' + testo + '"' + (contesto ? ' ' + contesto : '') + ' corrisponde a più collaboratori. Chi e?',
    [
      {
        titolo: 'Collaboratore',
        campi: [{ id: 'n', tipo: 'scelta', opzioni: nomi.map((n) => ({ valore: n, etichetta: info(n) })) }],
      },
    ],
    { titolo: 'Nome da chiarire', ok: 'Conferma' },
  );
  const scelto = r && r.n ? r.n : null;
  if (chiave) _omonimiRisposte[chiave] = scelto;
  return scelto;
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
      const direction = sign === '+' ? 'eccedenza' : 'ammanco';
      const _rappRef = 'da rapporto ' + turno + ' del ' + new Date(ds + 'T12:00:00').toLocaleDateString('it-IT');
      // OMONIMI: chi ha gia la differenza di QUESTO rapporto vale come scelta fatta
      // (risalvando il rapporto non si richiede); altrimenti si chiede una volta sola
      const _gia = datiCache
        .filter((e) => e.tipo === nomeCorrente('Errore') && e.reparto === 'Cassa' && (e.testo || '').includes(_rappRef))
        .map((e) => e.nome);
      const _sc = scegliCollaboratore(cognome, _gia);
      let nomeCompleto = _sc && _sc.nome;
      // si chiede solo con il nome intero (parola completa in tutti i candidati):
      // "Som" a meta battitura non apre la finestra
      const _parolaIntera = (n) =>
        String(n)
          .toLowerCase()
          .split(/[\s'-]+/)
          .includes(cognome.toLowerCase());
      if (_sc && _sc.ambigui && _sc.ambigui.every(_parolaIntera))
        nomeCompleto = await chiediOmonimo(
          cognome,
          _sc.ambigui,
          'nelle differenze di cassa',
          'cassa|' + _rappRef + '|' + cognome.toLowerCase(),
        );
      if (!nomeCompleto) {
        toast(
          'Differenza: "' +
            cognome +
            '" ' +
            (_sc && _sc.ambigui ? 'saltata (nome da chiarire)' : 'non trovato tra i collaboratori'),
        );
        continue;
      }
      // FIX: check per nome + turno/data rapporto (non per importo esatto). Se cambi importo → aggiorna, non duplica.
      const esiste = datiCache.find(
        (e) =>
          e.nome.toLowerCase() === nomeCompleto.toLowerCase() &&
          e.tipo === nomeCorrente('Errore') &&
          e.reparto === 'Cassa' &&
          (e.testo || '').includes(_rappRef),
      );
      const newTesto = 'Differenza cassa: ' + direction + ' di ' + amount.toFixed(2) + ' CHF (' + _rappRef + ')';
      if (esiste) {
        // Aggiorna importo e testo se cambiati
        if (Math.abs(parseFloat(esiste.importo) || 0) !== amount || esiste.testo !== newTesto) {
          try {
            await secPatch('registrazioni', 'id=eq.' + esiste.id, {
              importo: amount,
              testo: newTesto,
            });
            esiste.importo = amount;
            esiste.testo = newTesto;
          } catch (e) {
            toastErrore(
              'Differenza cassa di ' + nomeCompleto + ' NON aggiornata nel Diario: ' + ((e && e.message) || e),
              8000,
            );
          }
        }
        continue;
      }
      const rec = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        nome: nomeCompleto,
        tipo: nomeCorrente('Errore'),
        testo: newTesto,
        // giorno del rapporto con l ora locale, convertito come le altre
        // registrazioni (prima l ora locale era marcata UTC: dopo le 22 la
        // differenza finiva sul giorno dopo)
        data: new Date(ds + 'T' + new Date().toTimeString().slice(0, 8)).toISOString(),
        operatore: getOperatore(),
        importo: amount,
        valuta: 'CHF',
        reparto: 'Cassa',
        reparto_dip: currentReparto,
      };
      try {
        await secPost('registrazioni', rec);
        datiCache.unshift(rec);
        logAzione('Auto-registrazione differenza cassa', nomeCompleto + ' ' + amount.toFixed(2) + ' CHF');
      } catch (e) {
        toastErrore(
          'Differenza cassa di ' +
            nomeCompleto +
            ' NON registrata nel Diario: registrala a mano (' +
            ((e && e.message) || e) +
            ')',
          10000,
        );
      }
    }
  }
  render();
  updateStats();
}
