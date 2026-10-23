/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: diario.js
 * Diario: salva, modifica, elimina registrazioni
 */

// un salvataggio alla volta: il doppio click creava righe doppie (unaVoltaSola in utils.js)
function salva() {
  return unaVoltaSola('diario-salva', () => _salvaEsegui());
}
async function _salvaEsegui() {
  let nome = capitalizzaNome(document.getElementById('inp-nome').value.trim());
  let testo = document.getElementById('inp-testo').value.trim();
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
  // MALATTIA DAL/AL: date controllate PRIMA di tutto. Prima, con "Al" prima di "Dal" (o con
  // una sola delle due) si saltava il periodo e si salvava una malattia di OGGI (e nel Piano
  // il turno di oggi diventava M).
  let malDal = '',
    malAl = '';
  // ASSENZA (attesa certificato): stesso periodo Dal/Al della malattia
  const eAss = tipoSelezionato === nomeCorrente('Assenza');
  if (_diarioTipoConPeriodo(tipoSelezionato)) {
    malDal = ((document.getElementById('inp-mal-dal') || {}).value || '').trim();
    malAl = ((document.getElementById('inp-mal-al') || {}).value || '').trim();
    if (malDal && malAl && malDal > malAl) {
      toastErrore(
        (eAss ? 'Assenza' : 'Malattia') +
          ' non salvata: la data "Al" (' +
          malAl.split('-').reverse().join('.') +
          ') è prima della data "Dal" (' +
          malDal.split('-').reverse().join('.') +
          '). Correggi le date.',
        8000,
      );
      _highlightField('inp-mal-al');
      return;
    }
    // una sola data: malattia di quel giorno (non di oggi)
    if (malDal && !malAl) malAl = malDal;
    if (malAl && !malDal) malDal = malAl;
  }
  // NON DISPONIBILITA SENZA GIORNI: errore (prima diventava una registrazione qualsiasi,
  // senza date e senza effetto sul Piano, A11)
  if (tipoSelezionato === nomeCorrente('Non Disponibilità') && !_ndSelectedDates.length) {
    toastErrore('Non disponibilità non salvata: scegli almeno un giorno nel calendario.', 7000);
    return;
  }
  // NESSUNA DATA SCELTA MA UN PERIODO NEL TESTO («resta a casa 4 giorni»): si chiede. Prima il
  // Piano leggeva il periodo dal testo (4 M) e il Diario registrava un giorno solo (A13).
  let _periodoConfermato = false;
  if (_diarioTipoConPeriodo(tipoSelezionato) && !malDal && typeof _pianoDateMalattia === 'function') {
    const gg = _pianoDateMalattia(testo, new Date().toISOString());
    if (gg.length > 1) {
      const f = (d) => d.split('-').reverse().join('.');
      const scelta = await chiediScelta(
        'Il testo indica ' +
          gg.length +
          ' giorni (dal ' +
          f(gg[0]) +
          ' al ' +
          f(gg[gg.length - 1]) +
          ') ma Dal e Al sono vuoti. Cosa registro?',
        [
          { valore: 'periodo', etichetta: 'Tutto il periodo (' + gg.length + ' giorni)' },
          { valore: 'oggi', etichetta: 'Solo oggi' },
        ],
        { titolo: eAss ? 'Assenza' : 'Malattia' },
      );
      if (!scelta) return; // finestra chiusa: non si salva
      if (scelta === 'periodo') {
        malDal = gg[0];
        malAl = gg[gg.length - 1];
        _periodoConfermato = true;
      } else testo += ' (il ' + new Date().toLocaleDateString('it-IT') + ')';
    }
  }
  nome = await _verificaNome(nome, true);
  if (!nome) return; // finestra del nome chiusa senza scegliere: non si salva
  document.getElementById('inp-nome').value = nome;
  // MALATTIA SOPRA UN ASSENZA IN ATTESA DI CERTIFICATO: la trasforma solo l HR (Certificato
  // ricevuto), come nel database
  if (
    tipoSelezionato === nomeCorrente('Malattia') &&
    (await _diarioMalattiaSopraAss(nome, { dal: malDal || oggiLocale(), al: malAl || malDal || oggiLocale() }))
  )
    return;
  const importo = parseFloat(document.getElementById('inp-importo').value) || 0;
  const valuta = importo ? document.getElementById('inp-valuta').value : '';
  const reparto = document.getElementById('inp-reparto').value;
  // Malattia (o Assenza) con range Dal/Al → crea registrazione per ogni giorno
  if (_diarioTipoConPeriodo(tipoSelezionato)) {
    if (malDal && malAl) {
      const dInizio = new Date(malDal + 'T12:00:00'),
        dFine = new Date(malAl + 'T12:00:00');
      const nGiorni = Math.round((dFine - dInizio) / 86400000) + 1;
      if (
        !_periodoConfermato &&
        !(await chiediConferma(
          nome +
            ': registrare ' +
            (nGiorni === 1
              ? '1 giorno di ' +
                (eAss ? 'assenza (attesa certificato)' : 'malattia') +
                ' il ' +
                dInizio.toLocaleDateString('it-IT')
              : nGiorni +
                (eAss ? ' giorni di assenza (attesa certificato) dal ' : ' giorni di malattia dal ') +
                dInizio.toLocaleDateString('it-IT') +
                ' al ' +
                dFine.toLocaleDateString('it-IT')) +
            '?',
        ))
      )
        return;
      let creati = 0;
      const nonSalvati = []; // giorni che il database non ha salvato: si dicono
      // collegamento al Rapporto del primo giorno (A9)
      const _orig = await _diarioOrigineNuova(nome, malDal);
      for (let d = new Date(dInizio); d <= dFine; d.setDate(d.getDate() + 1)) {
        const dStr =
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0');
        // gia registrato quel giorno: una riga di quel giorno o una che copre il periodo (Rapporto)
        const esiste = datiCache.find(
          (e) =>
            !e.eliminato &&
            e.nome.toLowerCase() === nome.toLowerCase() &&
            e.tipo === tipoSelezionato &&
            (giornoDi(e.data) === dStr ||
              (typeof _pianoGiorniRegistrazione === 'function' &&
                _pianoGiorniRegistrazione(e.testo || '', e.data).includes(dStr))),
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
          if (_orig) rec.origine = _orig;
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
      // nel Rapporto del primo giorno, PRIMA del registro: Annulla toglie tutto insieme
      if (_orig && creati) await _diarioRapportoAllinea(_orig, nome, tipoSelezionato);
      logAzione(
        eAss ? 'Assenza registrata' : 'Malattia registrata',
        nome + ' · ' + creati + (creati === 1 ? ' giorno' : ' giorni'),
      );
      // PIANO: i giorni con un turno diventano M protetta, i C restano C (MC),
      // i CGF in piu' tornano C. Prima succedeva solo correggendo la registrazione.
      // Assenza: ASS solo sui giorni con un turno, nei giorni liberi niente.
      if (creati && typeof sincronizzaMalattiaPiano === 'function') {
        try {
          const sync = await sincronizzaMalattiaPiano(
            nome,
            '',
            malDal,
            'dal ' + dInizio.toLocaleDateString('it-IT') + ' al ' + dFine.toLocaleDateString('it-IT'),
            _diarioOpzSync(tipoSelezionato),
          );
          if (sync && sync.messe)
            toast(
              nome +
                ': ' +
                sync.messe +
                (sync.messe === 1 ? ' turno del piano segnato ' : ' turni del piano segnati ') +
                (eAss ? 'ASS' : 'M'),
              5000,
            );
        } catch (e) {
          toastErrore('Piano non allineato ' + (eAss ? 'all assenza: ' : 'alla malattia: ') + (e.message || ''));
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
      else
        toast(
          nome +
            ': ' +
            creati +
            (eAss
              ? creati === 1
                ? ' giorno di assenza (attesa certificato) registrato'
                : ' giorni di assenza (attesa certificato) registrati'
              : creati === 1
                ? ' giorno di malattia registrato'
                : ' giorni di malattia registrati'),
        );
      aggiornaNomi();
      render();
      updateStats();
      // COPERTURA: se la malattia ha lasciato scoperti dei turni nel piano, si propone
      // subito chi li copre (Sostituisci chi e in malattia, gia compilata: il turno passa al
      // collega). Altrimenti, o se si rinuncia, il popup dei punti come prima.
      if (creati) _diarioAvvisoCopertura(nome, malDal, malAl);
      return;
    }
  }
  // Non Disponibilità con giorni selezionati dal calendario
  if (tipoSelezionato === nomeCorrente('Non Disponibilità') && _ndSelectedDates.length) {
    // ND solo ai jolly (decisione del titolare, come nel calendario del Piano)
    if (typeof _pianoEJolly === 'function' && _pianoCollabInfo(nome) && !_pianoEJolly(nome)) {
      await mostraAvviso(
        nome +
          ' non è un jolly: la non disponibilità (ND) vale solo per i jolly. Per un collaboratore fisso si usa un congedo o un cambio turno.',
        { titolo: 'Non disponibilità' },
      );
      return;
    }
    // nome che non e (ancora) un collaboratore: verrebbe creato come fisso con la ND.
    // Prima si crea il collaboratore come jolly (Gestione collaboratori), poi la ND.
    if (typeof _pianoCollabInfo === 'function' && !_pianoCollabInfo(nome)) {
      await mostraAvviso(
        nome +
          ' non è fra i collaboratori attivi. La non disponibilità vale solo per i jolly: crealo prima come jolly in Gestione collaboratori (o controlla il nome), poi registra la ND.',
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
            (fuoriT.length === 1 ? ' giorno è' : ' giorni sono') +
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
    const _origNd = await _diarioOrigineNuova(nome, sorted[0]);
    if (_origNd) rec.origine = _origNd;
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
      if (_origNd) await _diarioRapportoAllinea(_origNd, nome, tipoSelezionato);
      logAzione('Non disponibilità', nome + descDate);
      toast(nome + ': non disponibilità registrata (' + nGiorni + (nGiorni === 1 ? ' giorno)' : ' giorni)'));
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
    let msg =
      nome +
      ' ha già ' +
      dupSimile.length +
      (dupSimile.length === 1 ? ' registrazione "' : ' registrazioni "') +
      tipoSelezionato +
      '" oggi.';
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
  // malattia o assenza di oggi: anche nel Rapporto di oggi (A9)
  const _origG = _diarioTipoConPeriodo(tipoSelezionato) ? await _diarioOrigineNuova(nome, oggiLocale()) : null;
  if (_origG) rec.origine = _origG;
  try {
    await secPost('registrazioni', rec);
    datiCache.unshift(rec);
    if (_origG) await _diarioRapportoAllinea(_origG, nome, tipoSelezionato);
    // malattia (o assenza) di un giorno solo: stesso allineamento del piano del periodo
    if (_diarioTipoConPeriodo(tipoSelezionato) && typeof sincronizzaMalattiaPiano === 'function') {
      try {
        await sincronizzaMalattiaPiano(nome, '', rec.data, rec.testo || '', _diarioOpzSync(tipoSelezionato));
      } catch (e) {
        toastErrore('Piano non allineato ' + (eAss ? 'all assenza: ' : 'alla malattia: ') + (e.message || ''));
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
    // Malattia o Assenza (giorno singolo) → copertura del turno nel piano o popup dei punti
    if (_diarioTipoConPeriodo(tipoSelezionato)) {
      const oggiM = oggiLocale();
      _diarioAvvisoCopertura(nome, oggiM, oggiM);
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
    // un promemoria solo (A-N3): il doppio clic su «Fra 3 giorni» ne creava due. Tutti i
    // pulsanti si spengono al primo clic e si riaccendono solo se il salvataggio non riesce
    btn.addEventListener('click', () =>
      unaVoltaSola('diario-followup', async () => {
        const tutti = [...b.querySelectorAll('[data-followup-data]')];
        tutti.forEach((x) => (x.disabled = true));
        const ok = await _creaFollowUp(nome, testoBreve, btn.dataset.followupData);
        if (!ok) tutti.forEach((x) => (x.disabled = false));
      }),
    );
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
    return false;
  }
  try {
    const rec = {
      titolo: 'Follow-up: ' + nome,
      descrizione: testo + '\nPromemoria: 1 giorno prima alle 08:00',
      data_scadenza: data,
      assegnato_a: getOperatore(),
      creato_da: getOperatore(),
      // del settore aperto, come i promemoria creati dalla pagina (prima NULL: si vedeva
      // anche negli altri settori, A17)
      reparto_dip: currentReparto,
    };
    const r = await secPost('promemoria', rec);
    promemoriaCache.push(r[0]);
    document.getElementById('pwd-modal').classList.add('hidden');
    aggiornaPromemoriaBadge();
    toast('Promemoria di verifica creato per ' + nome);
    return true;
  } catch (e) {
    toast('Errore creazione promemoria');
    return false;
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
    // malattia (o assenza) cancellata: nel Piano tornano le sigle che la M aveva coperto ("Ex R23")
    if (_e && _diarioTipoConPeriodo(_e.tipo) && typeof sincronizzaMalattiaPiano === 'function') {
      try {
        await sincronizzaMalattiaPiano(_e.nome, _e.testo || '', _e.data, '', _diarioOpzSync(_e.tipo));
      } catch (e2) {
        toastErrore('Registrazione nel cestino, ma il piano non è allineato: ' + ((e2 && e2.message) || e2));
      }
      // un giorno di un periodo «un giorno per riga»: le altre righe prendono il periodo che resta
      const _fratelli = _diarioRigheDelPeriodo(_e);
      if (_fratelli && _fratelli.length)
        await _diarioRietichettaPeriodo(_fratelli).catch((e3) =>
          toastErrore('Periodo delle altre righe non aggiornato: ' + ((e3 && e3.message) || e3)),
        );
    }
    // nata dal Rapporto giornaliero: la persona sparisce anche da li
    const _rap = _e && typeof _rapportoTogliRegistrazione === 'function' ? await _rapportoTogliRegistrazione(_e) : null;
    // registrata dal Diario: la voce del Rapporto si riscrive con i giorni che restano (A9)
    if (_e && _diarioOrigineRapporto(_e)) await _diarioRapportoAllinea(_e.origine, _e.nome, _e.tipo);
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
  const _conPeriodo = _diarioTipoConPeriodo(e.tipo);
  // TURNI DA COPRIRE (Malattia e Assenza): lo stato giorno per giorno dal Piano, con Copri i
  // turni e, per l Assenza, il certificato. Si riempie dopo l apertura (_diarioCopTurniCarica).
  let _copStatusHtml = _conPeriodo
    ? '<div id="edit-cop-turni" class="cop-turni" aria-live="polite">' + _diarioCopTurniHtml(e, null, false) + '</div>'
    : '';
  // PUNTI DELLA COPERTURA (incentivi): chi ha coperto e chi ha rifiutato, separati dai turni
  const _conPunti =
    _conPeriodo &&
    typeof eventiCopertura === 'function' &&
    typeof apriPopupCopertura === 'function' &&
    (typeof incentiviAttivi !== 'function' || incentiviAttivi('copertura'));
  if (_conPunti) {
    const _per = typeof _periodoCopertura === 'function' ? _periodoCopertura(e) : null;
    const _ev = _per ? eventiCopertura(e.nome, _per.dal, _per.al) : eventiCopertura(e.nome, _dataRifCopertura(e));
    const _cop = _ev.find((p) => p.azione === 'copertura');
    const _rif = _ev.filter((p) => p.azione === 'disponibilita_negata').length;
    _copStatusHtml +=
      '<div class="cop-punti"><strong>Punti copertura:</strong> ' +
      (_cop
        ? '<span style="color:var(--c-verdeacqua,#1a7a6d);font-weight:700">' +
          escP(_cop.collaboratore) +
          ' (+' +
          _cop.punti +
          ')</span>'
        : '<span style="color:var(--muted)">nessuno segnato</span>') +
      (_rif
        ? ' · <span style="color:var(--accent);font-weight:600">' +
          _rif +
          ' rifiut' +
          (_rif === 1 ? 'o' : 'i') +
          '</span>'
        : '') +
      ' <span style="color:var(--muted)">· con «Salva + punti»</span></div>';
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
    (_conPeriodo ? 'flex' : 'none') +
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
    (_conPunti
      ? '<button class="btn-modal-ok" style="background:#1a7a6d" title="Salva e segna chi ha coperto o rifiutato (punti degli incentivi)" onclick="salvaModificaRegistrazione(' +
        id +
        ',true)">Salva + punti</button>'
      : '') +
    '<button class="btn-modal-ok" onclick="salvaModificaRegistrazione(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  if (_conPeriodo) _diarioCopTurniCarica(e, document.getElementById('edit-cop-turni'), false);
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
      if (malDiv) malDiv.style.display = _diarioTipoConPeriodo(btn.dataset.tipo) ? 'flex' : 'none';
    };
  });
}
async function salvaModificaRegistrazione(id, conCopertura) {
  const nome = document.getElementById('edit-nome').value.trim();
  let testo = document.getElementById('edit-testo').value.trim();
  const tipo = window._editTipoCorrente;
  let _copDataRef = null;
  let _copAlRef = null;
  let _periodoGruppo = null;
  if (!nome) {
    toast('Inserisci il nome');
    return;
  }
  if (!testo) {
    toast('Inserisci una descrizione');
    return;
  }
  // Se malattia (o assenza) con dal/al, aggiorna la descrizione
  if (_diarioTipoConPeriodo(tipo)) {
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
        // date invertite: errore come nella registrazione nuova (prima si salvava e il testo
        // perdeva il periodo, A10)
        if (d2 < d1) {
          toastErrore(
            'Non salvata: la data "Al" (' +
              d2.toLocaleDateString('it-IT') +
              ') è prima della data "Dal" (' +
              d1.toLocaleDateString('it-IT') +
              '). Correggi le date.',
            8000,
          );
          return;
        }
        const nGiorni = Math.round((d2 - d1) / 86400000) + 1;
        const dalFmt = d1.toLocaleDateString('it-IT'),
          alFmt = d2.toLocaleDateString('it-IT');
        // REGISTRAZIONE «UN GIORNO PER RIGA» (periodo come etichetta finale «(dal .. al ..)»):
        // con le stesse date il testo resta com e; con date nuove l etichetta si toglie (prima
        // restava davanti al periodo nuovo e il Piano leggeva ancora le date vecchie)
        const _rpg = testo.match(
          /\(dal (\d{1,2})[\/.](\d{1,2})[\/.](\d{4}) al (\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\)\s*$/,
        );
        const _stesse =
          _rpg &&
          new Date(+_rpg[3], +_rpg[2] - 1, +_rpg[1], 12).getTime() === d1.getTime() &&
          new Date(+_rpg[6], +_rpg[5] - 1, +_rpg[4], 12).getTime() === d2.getTime();
        const _eV0 = datiCache.find((x) => x.id === id);
        if (
          !_stesse &&
          _rpg &&
          _eV0 &&
          _eV0.tipo === tipo &&
          String(_eV0.nome).toLowerCase() === nome.toLowerCase() &&
          _diarioRigheDelPeriodo(_eV0)
        ) {
          // UN GIORNO PER RIGA: le date nuove valgono per TUTTO il periodo (A4): le righe dei
          // giorni tolti vanno nel Cestino, quelle dei giorni nuovi si aggiungono, tutte
          // con l etichetta nuova. Prima cambiava solo questa riga e le altre tenevano il
          // periodo vecchio (e la M nel Piano).
          _periodoGruppo = { d1, d2, base: testo.substring(0, _rpg.index).trim() };
          testo = _periodoGruppo.base + ' (dal ' + dalFmt + ' al ' + alFmt + ')';
          _copAlRef = dataLocaleISO(d2);
        } else if (!_stesse) {
          if (_rpg) testo = testo.substring(0, _rpg.index).trim();
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
        }
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
    const tipoVecchio = eV ? eV.tipo : '';
    const importoVecchio = eV ? parseFloat(eV.importo) || 0 : 0;
    // MALATTIA SOPRA UN ASSENZA (tipo cambiato da Assenza, o date allargate): solo l HR, con
    // Certificato ricevuto (come nel database)
    if (
      tipo === nomeCorrente('Malattia') &&
      (await _diarioMalattiaSopraAss(nome, _pianoDateMalattia(testo, dataVecchia), eV && eV.tipo === tipo ? eV : null))
    )
      return;
    let e, sync;
    if (_periodoGruppo && eV) {
      sync = await _diarioModificaPeriodo(eV, _periodoGruppo, update);
      e = datiCache.find((x) => x.id === id && !x.eliminato) || null;
    } else {
      await secPatch('registrazioni', 'id=eq.' + id, update);
      e = datiCache.find((x) => x.id === id);
      if (e) Object.assign(e, update);
      // malattia con date corrette: il piano si allinea da solo (le M salvate
      // nei giorni sbagliati vengono tolte, i giorni giusti ricevono la M)
      sync = await _diarioAllineaMalattiaPiano(
        { nome: nomeVecchio, tipo: eV ? eV.tipo : '', testo: testoVecchio, data: dataVecchia },
        { nome: nome, tipo: tipo, testo: testo, data: dataVecchia },
      );
    }
    if (sync && (sync.tolte || sync.messe))
      toast(
        'Piano allineato: ' +
          sync.tolte +
          (tipo === nomeCorrente('Assenza') ? ' celle tolte, ' : ' M tolte, ') +
          sync.messe +
          (tipo === nomeCorrente('Assenza') ? ' ASS messe' : ' M messe'),
      );
    // ND modificata (date, persona o tipo): vecchi e nuovi mesi riallineati
    await _diarioNdRiallinea([
      { nome: nomeVecchio, tipo: eV ? eV.tipo : '', testo: testoVecchio },
      { nome: nome, tipo: tipo, testo: testo },
    ]);
    // registrata dal Diario: il Rapporto segue date, persona e tipo nuovi (A9), prima del registro
    if (eV && _diarioOrigineRapporto(eV)) {
      await _diarioRapportoDopoModifica(eV.origine, nomeVecchio, tipoVecchio);
      if (nomeVecchio !== nome || tipoVecchio !== tipo) await _diarioRapportoDopoModifica(eV.origine, nome, tipo);
    }
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
    if (conCopertura && _diarioTipoConPeriodo(tipo) && typeof apriPopupCopertura === 'function') {
      const dataRef = _copDataRef || (e && e.data ? giornoDi(e.data) : oggiLocale());
      // turni ancora scoperti nel piano: prima chi li copre, poi i punti
      const perC = e && typeof _periodoCopertura === 'function' ? _periodoCopertura(e) : null;
      const alRef = _copAlRef || (perC && perC.al ? perC.al : dataRef);
      setTimeout(async () => {
        // chiesto con il pulsante: il popup dei punti si apre; i turni ancora scoperti
        // restano nell avviso della pagina
        apriPopupCopertura(nome, dataRef);
        _diarioAvvisoCopertura(nome, dataRef, alRef);
      }, 150);
    }
  } catch (e) {
    toast('Errore salvataggio');
  }
}

// PERIODO «UN GIORNO PER RIGA» (Malattia e Assenza dal Diario o dal Piano): le righe dello
// stesso periodo, cioe stessa persona, stesso tipo e stessa etichetta finale «(dal .. al ..)».
// null se la registrazione non e di quel tipo.
function _diarioRigheDelPeriodo(e) {
  const m = String((e && e.testo) || '').match(
    /\((dal \d{1,2}[./]\d{1,2}[./]\d{4} al \d{1,2}[./]\d{1,2}[./]\d{4})\)\s*$/,
  );
  if (!m) return null;
  const fine = '(' + m[1] + ')';
  return datiCache.filter(
    (x) =>
      !x.eliminato &&
      x.tipo === e.tipo &&
      String(x.nome || '').toLowerCase() === String(e.nome || '').toLowerCase() &&
      (x.reparto_dip || currentReparto) === (e.reparto_dip || currentReparto) &&
      String(x.testo || '')
        .trimEnd()
        .endsWith(fine),
  );
}
// etichetta di ogni giorno: il tratto di giorni consecutivi che lo contiene
// (giorni AAAA-MM-GG) -> { giorno: '(dal 3/2/2027 al 4/2/2027)' }
function _diarioEtichettePeriodo(giorni) {
  const gg = [...new Set(giorni)].sort();
  const it = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT');
  const out = {};
  let i = 0;
  while (i < gg.length) {
    let j = i;
    while (
      j + 1 < gg.length &&
      Math.round((new Date(gg[j + 1] + 'T12:00:00') - new Date(gg[j] + 'T12:00:00')) / 864e5) === 1
    )
      j++;
    for (let k = i; k <= j; k++) out[gg[k]] = '(dal ' + it(gg[i]) + ' al ' + it(gg[j]) + ')';
    i = j + 1;
  }
  return out;
}
// testo della riga senza l etichetta finale del periodo
function _diarioSenzaEtichetta(t) {
  return String(t || '')
    .replace(/\s*\(dal \d{1,2}[./]\d{1,2}[./]\d{4} al \d{1,2}[./]\d{1,2}[./]\d{4}\)\s*$/, '')
    .trim();
}
// riga del periodo cancellata: le altre righe prendono l etichetta del loro tratto («dal 3 al
// 5» senza il 5 diventa «dal 3 al 4»), cosi la Modifica propone le date giuste
async function _diarioRietichettaPeriodo(righe) {
  const lbl = _diarioEtichettePeriodo(righe.map((x) => giornoDi(x.data)));
  for (const x of righe) {
    const nuovo = _diarioSenzaEtichetta(x.testo) + ' ' + lbl[giornoDi(x.data)];
    if (nuovo === x.testo) continue;
    await secPatch('registrazioni', 'id=eq.' + x.id, { testo: nuovo });
    x.testo = nuovo;
  }
}
// MODIFICA DELLE DATE di una riga «un giorno per riga»: il periodo nuovo vale per tutte le
// righe (giorni tolti nel Cestino, giorni nuovi aggiunti, etichetta nuova) e il Piano segue
// tutto il periodo. Ritorna { tolte, messe } del Piano.
async function _diarioModificaPeriodo(eV, per, update) {
  const righe = _diarioRigheDelPeriodo(eV) || [eV];
  const vecchiGiorni = righe.map((x) => giornoDi(x.data)).sort();
  const nuoviGiorni = [];
  for (let d = new Date(per.d1); d <= per.d2 && nuoviGiorni.length < 400; d.setDate(d.getDate() + 1))
    nuoviGiorni.push(dataLocaleISO(d));
  const lbl = ' (dal ' + per.d1.toLocaleDateString('it-IT') + ' al ' + per.d2.toLocaleDateString('it-IT') + ')';
  const op = getOperatore();
  const ora = new Date().toISOString();
  for (const x of righe) {
    const g = giornoDi(x.data);
    if (!nuoviGiorni.includes(g)) {
      await secPatch('registrazioni', 'id=eq.' + x.id, { eliminato: true, eliminato_da: op, eliminato_at: ora });
      Object.assign(x, { eliminato: true, eliminato_da: op, eliminato_at: ora });
      continue;
    }
    const dati = { testo: (x === eV ? per.base : _diarioSenzaEtichetta(x.testo)) + lbl };
    if (x === eV) dati.modificato_da = update.modificato_da;
    await secPatch('registrazioni', 'id=eq.' + x.id, dati);
    Object.assign(x, dati);
  }
  let n = 0;
  for (const g of nuoviGiorni) {
    if (vecchiGiorni.includes(g)) continue;
    const rec = {
      id: Date.now() + n++,
      nome: eV.nome,
      tipo: eV.tipo,
      testo: per.base + lbl,
      data: g + 'T08:00:00.000Z',
      operatore: op,
      reparto_dip: eV.reparto_dip || currentReparto,
    };
    if (eV.origine) rec.origine = eV.origine;
    await secPost('registrazioni', rec);
    datiCache.unshift(rec);
  }
  datiCache = datiCache.filter((x) => !x.eliminato);
  righe.filter((x) => x.eliminato).forEach((x) => _diarioTogliArchivioLeggero(x.id));
  if (typeof sincronizzaMalattiaPiano !== 'function') return null;
  // il Piano segue i giorni tolti e quelli aggiunti, un tratto di giorni consecutivi alla
  // volta (idReg -1: nessuna riga esclusa, quelle dei giorni tolti sono gia nel Cestino)
  const tratti = (gg) => [...new Set(Object.values(_diarioEtichettePeriodo(gg)))].map((t) => t.slice(1, -1));
  const opz = Object.assign({ idReg: -1 }, _diarioOpzSync(eV.tipo) || {});
  const tot = { tolte: 0, messe: 0 };
  try {
    for (const t of tratti(vecchiGiorni.filter((g) => !nuoviGiorni.includes(g)))) {
      const r = await sincronizzaMalattiaPiano(eV.nome, t, vecchiGiorni[0] + 'T08:00:00.000Z', '', opz);
      if (r) tot.tolte += r.tolte || 0;
    }
    for (const t of tratti(nuoviGiorni.filter((g) => !vecchiGiorni.includes(g)))) {
      const r = await sincronizzaMalattiaPiano(eV.nome, '', nuoviGiorni[0] + 'T08:00:00.000Z', t, opz);
      if (r) tot.messe += r.messe || 0;
    }
  } catch (er) {
    toastErrore('Piano non allineato: ' + ((er && er.message) || er));
  }
  return tot;
}

// ===== DIARIO -> RAPPORTO (decisione del titolare 23.10, A9) =====
// Malattia, Assenza e Non Disponibilità registrate nel Diario entrano anche nelle assenze del
// Rapporto giornaliero del PRIMO giorno, nel turno della persona quel giorno (PRESTO se il
// turno e diurno, un riposo o non c e; NOTTE se notturno: la stessa regola della M scritta
// nel Piano). Il collegamento sta nella colonna origine delle righe: 'diario|PRESTO|2027-05-03'
// (le righe nate dal Rapporto hanno invece «da rapporto PRESTO del ...» nel testo). La voce
// del Rapporto si riscrive SEMPRE da tutte le righe vive del collegamento (_diarioRapportoAllinea):
// registrare, modificare, cancellare, ripristinare dal Cestino danno sempre lo stesso testo.
// Il Rapporto riconosce la voce come gia registrata nel Diario e non crea niente (niente doppioni).
// Le scritture passano da secPatch/secPost: Annulla le rimette insieme alla registrazione.
function _diarioOrigineRapporto(e) {
  const m = String((e && e.origine) || '').match(/^diario\|(PRESTO|NOTTE)\|(\d{4}-\d{2}-\d{2})$/);
  return m ? { turno: m[1], ds: m[2], reparto: (e && e.reparto_dip) || currentReparto, campo: 'assenze' } : null;
}
function _diarioTipoNelRapporto(t) {
  return _diarioTipoConPeriodo(t) || t === nomeCorrente('Non Disponibilità');
}
// il database lascia scrivere il Rapporto solo a chi ha la pagina
function _diarioPuoRapporto() {
  const si = typeof isVis !== 'function' || isVis('rapporto');
  if (!si && typeof _avvisoUnaVolta === 'function')
    _avvisoUnaVolta(
      'diario-rapporto-permesso',
      'Registrato nel Diario. Il Rapporto giornaliero non si aggiorna: per scriverlo serve il permesso della pagina Rapporto.',
    );
  return si;
}
// turno della persona quel giorno dal Piano (la sigla sotto una M, ASS o ND: «Ex S24»)
async function _diarioTurnoRapporto(nome, ds) {
  try {
    const r = ((await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + ds + '&limit=1')) ||
      [])[0];
    if (!r) return 'PRESTO';
    let cod = r.codice;
    const ex = String(r.commento || '').match(/^(?:Malattia dal Diario · era|Ex) ([A-Z0-9]+)\b/);
    if (/^(M|M1|ASS|ND)$/.test(cod) && ex) cod = ex[1];
    if (typeof pianoTurniCache !== 'undefined' && !pianoTurniCache.length && typeof _pianoCaricaCfg === 'function')
      await _pianoCaricaCfg().catch(() => {});
    const turni = typeof pianoTurniCache !== 'undefined' ? pianoTurniCache : [];
    const rep = r.reparto_dip || currentReparto;
    const t =
      turni.find((x) => x.codice === cod && (x.reparto_dip || 'slots') === rep) || turni.find((x) => x.codice === cod);
    return t && String(t.tipo || '').toUpperCase() === 'NOTTURNO' ? 'NOTTE' : 'PRESTO';
  } catch (e) {
    return 'PRESTO';
  }
}
// giorni di una registrazione per il Rapporto (ND: le date scritte; le altre i giorni propri)
function _diarioGiorniPerRapporto(e) {
  if (e.tipo === nomeCorrente('Non Disponibilità'))
    return (String(e.testo || '').match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).map((d) => {
      const p = d.split('/');
      return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
    });
  return typeof _pianoGiorniRegistrazione === 'function'
    ? _pianoGiorniRegistrazione(e.testo || '', e.data)
    : [giornoDi(e.data)];
}
// voce del Rapporto per le righe collegate (stessa persona e tipo): null se non ne restano
function _diarioVoceRapporto(nome, tipo, righe) {
  const gg = [...new Set(righe.flatMap(_diarioGiorniPerRapporto))].sort();
  if (!gg.length) return null;
  const f = (d) => d.split('-').reverse().join('/');
  if (tipo === nomeCorrente('Non Disponibilità')) return nome + ' non disponibile (ND) il ' + gg.map(f).join(' e ');
  const tratti = [...new Set(Object.values(_diarioEtichettePeriodo(gg)))].map((t) => {
    const m = t.match(/dal (\S+) al (\S+)\)/);
    const it = (x) => {
      const p = x.split('/');
      return p[0].padStart(2, '0') + '/' + p[1].padStart(2, '0') + '/' + p[2];
    };
    return 'dal ' + it(m[1]) + ' al ' + it(m[2]);
  });
  const parola =
    tipo === nomeCorrente('Assenza')
      ? ' assente '
      : righe.some((r) => /certificat/i.test(r.testo || ''))
        ? ' malato con certificato '
        : ' malato ';
  return nome + parola + tratti.join(' e ');
}
// scrive il campo assenze del Rapporto partendo dal testo appena letto; se un collega lo ha
// cambiato nel frattempo (updated_at diverso) si rilegge e si rifà (fino a 3 volte)
async function _diarioScriviAssenzeRapporto(o, calcola) {
  for (let prova = 0; prova < 3; prova++) {
    const riga = await _rapportoRiga(o);
    const vecchio = riga ? riga.assenze || '' : '';
    const nuovo = calcola(vecchio);
    if (nuovo === vecchio) return riga;
    if (!riga) {
      if (!nuovo) return null;
      try {
        await secPost('rapporti_giornalieri', {
          data_rapporto: o.ds,
          turno: o.turno,
          reparto_dip: o.reparto,
          operatore: getOperatore(),
          updated_at: new Date().toISOString(),
          assenze: nuovo,
        });
        _rapportoCacheSet(o.ds, o.turno, { data_rapporto: o.ds, turno: o.turno, assenze: nuovo });
        return true;
      } catch (e) {
        if (!/duplicate key|already exists|23505/i.test((e && e.message) || '')) throw e;
        continue; // un collega lo ha appena creato: si rilegge
      }
    }
    // filtro consentito dal database (giorno, turno e settore: 20260928 accetta solo questo);
    // subito prima di scrivere si controlla che nessun collega l abbia cambiato nel frattempo
    const filtro = 'data_rapporto=eq.' + o.ds + '&turno=eq.' + o.turno + '&reparto_dip=eq.' + o.reparto;
    const prima = await _rapportoRiga(o);
    if (!prima || (prima.updated_at || '') !== (riga.updated_at || '') || (prima.assenze || '') !== vecchio) continue;
    const patch = { assenze: nuovo, operatore: getOperatore(), updated_at: new Date().toISOString() };
    await secPatch('rapporti_giornalieri', filtro, patch);
    const ora = await _rapportoRiga(o);
    if (ora && (ora.assenze || '') === nuovo) {
      if (o.reparto === currentReparto) _rapportoCacheSet(o.ds, o.turno, ora);
      return ora;
    }
  }
  throw new Error('il Rapporto è cambiato mentre lo si aggiornava, riprova');
}
// LA VOCE DEL RAPPORTO SEGUE IL DIARIO: dalle righe vive con quel collegamento, persona e tipo
async function _diarioRapportoAllinea(origine, nome, tipo) {
  const o = _diarioOrigineRapporto({ origine: origine });
  if (!o || !_diarioPuoRapporto() || !_diarioTipoNelRapporto(tipo)) return false;
  const righe = datiCache.filter(
    (x) =>
      !x.eliminato &&
      x.origine === origine &&
      x.tipo === tipo &&
      String(x.nome || '').toLowerCase() === String(nome || '').toLowerCase(),
  );
  const voce = _diarioVoceRapporto(nome, tipo, righe);
  try {
    await _diarioScriviAssenzeRapporto(o, (vecchio) => {
      const c = _rapportoParolaNome(vecchio, nome);
      if (!voce) return c ? _rapportoTogliNome(vecchio, nome).testo : vecchio;
      if (c) return _rapportoTogliNome(vecchio, nome, voce).testo;
      return (vecchio.trim() ? vecchio.replace(/\s+$/, '') + '\n' : '') + voce;
    });
    return o;
  } catch (e) {
    // senza il permesso del Rapporto (lo decide il database): una nota, non un errore
    if (/permesso/i.test((e && e.message) || '')) {
      _avvisoUnaVolta(
        'diario-rapporto-permesso',
        'Registrato nel Diario. Il Rapporto giornaliero non si aggiorna: per scriverlo serve il permesso della pagina Rapporto.',
      );
      return false;
    }
    toastErrore(
      'Rapporto ' +
        o.turno +
        ' del ' +
        o.ds.split('-').reverse().join('.') +
        ' non aggiornato: ' +
        ((e && e.message) || e),
    );
    return false;
  }
}
// registrazione nuova del Diario: collegamento (primo giorno e turno) per le righe appena create
async function _diarioOrigineNuova(nome, primoGiorno) {
  if (!_diarioPuoRapporto()) return null;
  return 'diario|' + (await _diarioTurnoRapporto(nome, primoGiorno)) + '|' + primoGiorno;
}
// dopo una modifica: se il primo giorno e cambiato la voce passa al Rapporto del primo giorno nuovo
async function _diarioRapportoDopoModifica(origine, nome, tipo) {
  const o = _diarioOrigineRapporto({ origine: origine });
  if (!o) return;
  const righe = datiCache.filter(
    (x) =>
      !x.eliminato &&
      x.origine === origine &&
      x.tipo === tipo &&
      String(x.nome || '').toLowerCase() === String(nome || '').toLowerCase(),
  );
  const primo = [...new Set(righe.flatMap(_diarioGiorniPerRapporto))].sort()[0];
  if (primo && primo !== o.ds) {
    const nuova = await _diarioOrigineNuova(nome, primo);
    if (nuova && nuova !== origine) {
      for (const x of righe) {
        await secPatch('registrazioni', 'id=eq.' + x.id, { origine: nuova });
        x.origine = nuova;
      }
      await _diarioRapportoAllinea(origine, nome, tipo); // via dal Rapporto di prima
      await _diarioRapportoAllinea(nuova, nome, tipo);
      return;
    }
  }
  await _diarioRapportoAllinea(origine, nome, tipo);
}

// MODAL TIPO
function apriModal(id, tipo) {
  modalEntryId = id;
  modalTipoSel = tipo;
  renderTipiUI();
  document.getElementById('modal-overlay').classList.remove('hidden');
}
// MALATTIA REGISTRATA: avviso discreto nella pagina (js/piano-cambi.js) con i turni da
// coprire (Copri ora · Più tardi) o i punti della copertura. Mai una finestra.
function _diarioAvvisoCopertura(nome, dal, al) {
  if (typeof _pianoAvvisoCopertura === 'function')
    _pianoAvvisoCopertura(nome, dal, al || dal).catch((e) => console.error('avviso copertura', e));
  else if (typeof apriPopupCopertura === 'function') apriPopupCopertura(nome, dal);
}
// ================= TURNI DA COPRIRE (Malattia e Assenza nel Diario) =================
// Decisione del titolare 15.10: aprendo una malattia o un assenza (riga del Diario e
// Modifica) si vede subito chi copre i turni, giorno per giorno («11.01 · Ex S7 · coperto da
// Bianchi» oppure «da coprire»), con «Copri i turni» (Sostituisci chi è in malattia già
// compilata) e, per l Assenza, il certificato (Storico HR · modificare). Lo stato si legge dal
// Piano per il periodo SALVATO: cambiando le date nella Modifica si aggiorna dopo Salva.
// Senza il permesso del Piano: sola lettura, con la spiegazione.
// giorni della registrazione: tutto il periodo (Modifica) o solo i suoi (riga per giorno)
function _diarioCopGiorni(e, soloPropri) {
  if (soloPropri && typeof _assGiorniPropri === 'function') return _assGiorniPropri(e);
  return _pianoDateMalattia(e.testo || '', e.data);
}
function _diarioCopGg(d) {
  const g = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(d + 'T12:00:00').getDay()];
  return g + ' ' + d.substring(8, 10) + '.' + d.substring(5, 7);
}
// HTML del riquadro. stato: null = in lettura, { errore } = non letto, altrimenti l elenco di
// _pianoStatoTurniMalattia per i giorni della registrazione. compatto = riga del Diario.
function _diarioCopTurniHtml(e, stato, compatto) {
  const giorni = _diarioCopGiorni(e, compatto);
  const eAss = e.tipo === nomeCorrente('Assenza');
  const oggi = oggiLocale();
  const gestisce = typeof puoGestirePiano === 'function' && puoGestirePiano();
  const hr = eAss && typeof puoRegistrareCertificato === 'function' && puoRegistrareCertificato();
  const titolo = '<span class="cop-turni-tit">Turni da coprire</span>';
  if (!stato)
    return '<div class="cop-turni-testa">' + titolo + '<span class="cop-turni-nota">lettura del Piano…</span></div>';
  if (stato.errore)
    return (
      '<div class="cop-turni-testa">' +
      titolo +
      '<span class="cop-turni-nota">Piano non letto: ' +
      escP(stato.errore) +
      '</span></div>'
    );
  const per = new Map(stato.map((x) => [x.data, x]));
  const conTurno = stato.filter((x) => !x.libero);
  const daCoprire = conTurno.filter((x) => !x.da && x.data >= oggi);
  const nonCoperti = conTurno.filter((x) => !x.da && x.data < oggi);
  const coperti = conTurno.filter((x) => x.da);
  let chip;
  if (!conTurno.length)
    chip =
      '<span class="cop-chip cop-chip-neutro">' +
      (stato.length ? 'nessun turno da coprire' : 'nessun turno nel Piano') +
      '</span>';
  else if (daCoprire.length)
    chip =
      '<span class="cop-chip cop-chip-rosso">' +
      daCoprire.length +
      (daCoprire.length === 1 ? ' da coprire' : ' da coprire') +
      '</span>' +
      (coperti.length ? '<span class="cop-chip cop-chip-verde">' + coperti.length + ' coperti</span>' : '');
  else if (!nonCoperti.length) chip = '<span class="cop-chip cop-chip-verde">tutti coperti</span>';
  else
    chip =
      (coperti.length ? '<span class="cop-chip cop-chip-verde">' + coperti.length + ' coperti</span>' : '') +
      '<span class="cop-chip cop-chip-neutro">' +
      nonCoperti.length +
      ' passati senza copertura</span>';
  // giorni: nella riga solo quelli con un turno (i liberi si contano), nella Modifica tutti
  const righe = (compatto ? giorni.filter((d) => per.has(d) && !per.get(d).libero) : giorni).map((d) => {
    const x = per.get(d);
    let stTxt;
    let cls;
    if (!x) {
      stTxt = 'nessun turno nel Piano';
      cls = 'cop-neutro';
    } else if (x.libero) {
      stTxt = 'giorno libero' + (x.codice ? ' (' + escP(x.codice) + ')' : '') + ', niente da coprire';
      cls = 'cop-neutro';
    } else if (x.da) {
      stTxt = 'coperto da <b>' + escP(x.da) + '</b>';
      cls = 'cop-ok';
    } else if (d < oggi) {
      stTxt = 'non coperto (giorno passato)';
      cls = 'cop-neutro';
    } else {
      stTxt = 'da coprire';
      cls = 'cop-ko';
    }
    return (
      '<li class="' +
      cls +
      '"><span class="cop-g">' +
      _diarioCopGg(d) +
      '</span>' +
      (x && !x.libero ? '<span class="cop-ex">Ex ' + escP(x.codice) + '</span>' : '') +
      '<span class="cop-st">' +
      stTxt +
      '</span>' +
      (x && x.nonGiust ? '<span class="cop-chip cop-chip-ng">non giustificata</span>' : '') +
      '</li>'
    );
  });
  const liberi = compatto ? giorni.filter((d) => per.has(d) && per.get(d).libero).length : 0;
  const idArg = _jsArg(String(e.id));
  let azioni = '';
  if (daCoprire.length && gestisce)
    azioni +=
      '<button type="button" class="btn-act cop-btn-copri" onclick="diarioCopriTurni(\'' +
      idArg +
      '\')">Copri i turni</button>';
  if (hr)
    azioni +=
      '<button type="button" class="btn-act" onclick="diarioCertificato(\'' +
      idArg +
      '\',false)" title="Il certificato è arrivato: le ASS diventano malattia">Certificato ricevuto</button>' +
      '<button type="button" class="btn-act" onclick="diarioCertificato(\'' +
      idArg +
      '\',true)" title="Il certificato non arriva: restano ASS a 0 ore, non giustificate">Certificato non ricevuto</button>';
  const info = typeof _pianoCollabInfo === 'function' ? _pianoCollabInfo(e.nome) : null;
  const sett = info && info.reparto_dip && typeof repartoLabel === 'function' ? repartoLabel(info.reparto_dip) : '';
  const solaLettura =
    !gestisce && daCoprire.length
      ? '<p class="cop-turni-nota">Sola lettura: i turni li copre chi gestisce il Piano' +
        (sett ? ' del settore ' + escP(sett) : '') +
        ' (permesso Gestione piano). Li trova anche in Piano › Avvisi › Malattie da coprire.</p>'
      : '';
  const piede = compatto
    ? ''
    : '<p class="cop-turni-nota">Dal Piano, per il periodo salvato (' +
      _diarioCopGg(giorni[0]) +
      (giorni.length > 1 ? ' – ' + _diarioCopGg(giorni[giorni.length - 1]) : '') +
      '). Se cambi le date, il riquadro si aggiorna dopo Salva.</p>';
  return (
    '<div class="cop-turni-testa">' +
    titolo +
    chip +
    '</div>' +
    (righe.length ? '<ul class="cop-turni-lista">' + righe.join('') + '</ul>' : '') +
    (liberi
      ? '<p class="cop-turni-nota">' +
        liberi +
        (liberi === 1 ? ' giorno libero' : ' giorni liberi') +
        ', niente da coprire.</p>'
      : '') +
    solaLettura +
    (azioni ? '<div class="cop-turni-azioni">' + azioni + '</div>' : '') +
    piede
  );
}
async function _diarioCopTurniCarica(e, el, compatto) {
  if (!el) return;
  const giorni = _diarioCopGiorni(e, false);
  let html;
  try {
    const st = giorni.length ? await _pianoStatoTurniMalattia(e.nome, giorni[0], giorni[giorni.length - 1]) : [];
    html = _diarioCopTurniHtml(e, st, compatto);
  } catch (er) {
    html = _diarioCopTurniHtml(e, { errore: (er && er.message) || String(er) }, compatto);
  }
  if (el.isConnected) el.innerHTML = html;
}
// RIGA DEL DIARIO: segnaposto (con l ultimo stato letto, niente salti) riempito dopo il
// disegno da _diarioCopTurniRiempi, con due letture per tutte le righe visibili. Solo le
// assenze recenti o future (dal 7 giorni fa): le vecchie restano pulite (Modifica le mostra).
window._diarioCopCache = window._diarioCopCache || {};
function _diarioCopTurniSegnaposto(e) {
  if (!e || e.eliminato || !_diarioTipoConPeriodo(e.tipo)) return '';
  const gg = _diarioCopGiorni(e, true);
  if (!gg.length || gg[gg.length - 1] < _assSposta(oggiLocale(), -7)) return '';
  const k = e.id + '|' + e.tipo + '|' + e.testo;
  const c = window._diarioCopCache[k];
  return (
    '<div class="cop-turni cop-turni-riga" data-cop-reg="' +
    escP(String(e.id)) +
    '" data-cop-k="' +
    escP(k) +
    '">' +
    (c || _diarioCopTurniHtml(e, null, true)) +
    '</div>'
  );
}
function _diarioCopTurniRiempi() {
  clearTimeout(window._diarioCopTimer);
  window._diarioCopTimer = setTimeout(_diarioCopTurniRiempiOra, 120);
}
async function _diarioCopTurniRiempiOra() {
  const box = [...document.querySelectorAll('#entries-list .cop-turni-riga')].slice(0, 40);
  if (!box.length) return;
  const voci = box
    .map((el) => ({ el: el, e: datiCache.find((x) => String(x.id) === el.dataset.copReg) }))
    .filter((v) => v.e);
  voci.forEach((v) => (v.giorni = _diarioCopGiorni(v.e, true)));
  const nomi = [...new Set(voci.map((v) => v.e.nome))];
  const tutti = [...new Set([].concat(...voci.map((v) => v.giorni)))].sort();
  if (!nomi.length || !tutti.length) return;
  let righe;
  let giorno;
  try {
    righe =
      (await secGet(
        'piano?collaboratore=in.(' +
          nomi.map((n) => encodeURIComponent(n)).join(',') +
          ')&data=gte.' +
          tutti[0] +
          '&data=lte.' +
          tutti[tutti.length - 1] +
          '&codice=in.(M,M1,ASS)',
      )) || [];
    const gM = [...new Set(righe.map((r) => String(r.data).substring(0, 10)))];
    giorno = gM.length
      ? (await secGet(
          'piano?data=in.(' + gM.join(',') + ')&commento=like.*copre*&select=collaboratore,data,commento',
        )) || []
      : [];
  } catch (er) {
    return; // senza rete resta lo stato di prima
  }
  voci.forEach((v) => {
    const st = _pianoStatoTurniDaRighe(
      v.e.nome,
      righe.filter((r) => r.collaboratore === v.e.nome && v.giorni.includes(String(r.data).substring(0, 10))),
      giorno,
    );
    const html = _diarioCopTurniHtml(v.e, st, true);
    window._diarioCopCache[v.el.dataset.copK] = html;
    if (v.el.isConnected) v.el.innerHTML = html;
  });
}
// PUNTI DELLA COPERTURA (incentivi accesi): pulsante «Punti» e, se segnati, il badge
function _diarioConPunti(e) {
  return (
    !!e &&
    _diarioTipoConPeriodo(e.tipo) &&
    typeof apriPopupCopertura === 'function' &&
    (typeof incentiviAttivi !== 'function' || incentiviAttivi('copertura'))
  );
}
function _diarioBadgePunti(e) {
  if (!_diarioConPunti(e) || typeof eventiCopertura !== 'function' || typeof _periodoCopertura !== 'function')
    return '';
  const per = _periodoCopertura(e);
  const cop = eventiCopertura(e.nome, per.dal, per.al).find((p) => p.azione === 'copertura');
  return cop
    ? '<span class="cop-chip cop-chip-verde" style="margin-left:6px" title="Punti degli incentivi">Punti: ' +
        escP(cop.collaboratore) +
        '</span>'
    : '';
}
// «Copri i turni»: Sostituisci chi è in malattia già compilata (persona, mese, giorni,
// Registra come: ASS per l Assenza, M per la Malattia). Un mese alla volta.
async function diarioCopriTurni(id) {
  const e = datiCache.find((x) => String(x.id) === String(id));
  if (!e) return;
  if (typeof puoGestirePiano !== 'function' || !puoGestirePiano()) {
    toast('I turni li copre chi gestisce il Piano');
    return;
  }
  const giorni = _diarioCopGiorni(e, false);
  let st;
  try {
    st = await _pianoStatoTurniMalattia(e.nome, giorni[0], giorni[giorni.length - 1]);
  } catch (er) {
    toastErrore('Piano non letto: ' + ((er && er.message) || er));
    return;
  }
  const oggi = oggiLocale();
  const da = st.filter((x) => !x.libero && !x.da && x.data >= oggi);
  if (!da.length) {
    toast('Nessun turno da coprire per ' + e.nome);
    render();
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = da[0].data.substring(0, 7);
  const g = da.filter((x) => x.data.startsWith(ym)).map((x) => parseInt(x.data.substring(8, 10)));
  const altri = [...new Set(da.filter((x) => !x.data.startsWith(ym)).map((x) => x.data.substring(0, 7)))];
  await _pianoApriCopertura(
    e.nome,
    ym,
    Math.min(...g),
    Math.max(...g),
    null,
    e.tipo === nomeCorrente('Assenza') ? 'ASS' : 'M',
  );
  if (altri.length)
    toast('Dopo questo mese restano turni da coprire in ' + altri.join(', ') + ': di nuovo «Copri i turni»', 8000);
}
// «Certificato ricevuto» / «Certificato non ricevuto» dalla registrazione Assenza
function diarioCertificato(id, non) {
  const e = datiCache.find((x) => String(x.id) === String(id));
  if (!e) return;
  document.getElementById('pwd-modal').classList.add('hidden');
  const d = _diarioCopGiorni(e, true)[0] || giornoDi(e.data);
  return non ? apriCertificatoNonRicevuto(e.nome, d) : apriCertificatoRicevuto(e.nome, d);
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
      // FINESTRA CHIUSA SENZA CONFERMARE (Annulla, clic fuori): vale «Lascia i posti scoperti»,
      // i turni diventano ND. Prima restava il turno: né ND né sostituto (A12).
      const marca = window._coperturaAssenza;
      const modal = document.getElementById('pwd-modal');
      if (marca && modal && typeof MutationObserver === 'function') {
        const oss = new MutationObserver(() => {
          if (!modal.classList.contains('hidden')) return;
          oss.disconnect();
          // la conferma azzera _coperturaAssenza subito dopo aver chiuso la finestra
          setTimeout(() => {
            if (window._coperturaAssenza !== marca) return;
            window._coperturaAssenza = null;
            _diarioNdLasciaScoperti(nome, mesi, elenco).catch((e) => console.error('ND nel piano', e));
          }, 50);
        });
        oss.observe(modal, { attributes: true, attributeFilter: ['class'] });
      }
      return;
    }
  }
  await _diarioNdLasciaScoperti(nome, mesi, elenco);
}
// ND sopra dei turni senza copertura: i turni diventano ND e i posti restano da coprire
async function _diarioNdLasciaScoperti(nome, mesi, elenco) {
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
  // il numero e quello delle celle cambiate (anche di una ND di prima rimasta indietro):
  // l elenco dei turni si scrive solo se sono proprio quelli
  const nTurni = (elenco || '').split(', ').filter(Boolean).length;
  if (r.messe)
    toast(
      nome +
        ': ' +
        r.messe +
        (r.messe === 1 ? ' turno diventato ND' : ' turni diventati ND') +
        (r.messe === nTurni ? ' (' + elenco + ')' : '') +
        ', ' +
        (r.messe === 1 ? 'posto da coprire' : 'posti da coprire'),
      6000,
    );
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
// Lo stesso per l ASSENZA (attesa certificato, celle ASS). Prima la malattia, poi l assenza:
// Assenza -> Malattia (HR) trasforma gli ASS in M; Malattia -> Assenza riporta le M dei
// turni ad ASS e le M dei giorni liberi alla sigla di prima.
async function _diarioAllineaMalattiaPiano(vecchia, nuova) {
  if (typeof sincronizzaMalattiaPiano !== 'function') return null;
  const altraPersona = String(vecchia.nome || '').toLowerCase() !== String(nuova.nome || '').toLowerCase();
  const tot = { tolte: 0, messe: 0 };
  const somma = (r) => {
    if (r) {
      tot.tolte += r.tolte || 0;
      tot.messe += r.messe || 0;
    }
  };
  try {
    for (const tipoX of [nomeCorrente('Malattia'), nomeCorrente('Assenza')]) {
      const opz = _diarioOpzSync(tipoX);
      const eraX = vecchia.tipo === tipoX;
      const eX = nuova.tipo === tipoX;
      if (eraX && eX && !altraPersona) {
        if (vecchia.testo !== nuova.testo)
          somma(await sincronizzaMalattiaPiano(nuova.nome, vecchia.testo, vecchia.data, nuova.testo, opz));
        continue;
      }
      if (eraX) somma(await sincronizzaMalattiaPiano(vecchia.nome, vecchia.testo, vecchia.data, '', opz));
      if (eX) somma(await sincronizzaMalattiaPiano(nuova.nome, '', nuova.data, nuova.testo, opz));
    }
  } catch (e) {
    toastErrore('Piano non allineato alla malattia: ' + ((e && e.message) || e));
  }
  return tot;
}
// tipo con il periodo Dal/Al e le celle nel Piano: Malattia (M) o Assenza (ASS)
function _diarioTipoConPeriodo(t) {
  return !!t && (t === nomeCorrente('Malattia') || t === nomeCorrente('Assenza'));
}
// opzioni della sincronizzazione del Piano per il tipo (Assenza = celle ASS)
function _diarioOpzSync(tipo) {
  return tipo === nomeCorrente('Assenza') ? { codice: 'ASS' } : undefined;
}
// MALATTIA SOPRA UN ASSENZA IN ATTESA DI CERTIFICATO (senza Storico HR · modificare): la
// malattia la registra l HR con «Certificato ricevuto».
// esclusa: la registrazione che si sta modificando. true = fermato (avviso mostrato).
// giorni: { dal, al } (date ISO) oppure l elenco delle date
async function _diarioMalattiaSopraAss(nome, giorni, esclusa) {
  if (typeof puoModificareStoricoHr === 'function' && puoModificareStoricoHr()) return false;
  let gg = [];
  if (Array.isArray(giorni)) gg = giorni.slice();
  else if (giorni && giorni.dal) {
    // { dal, al } dal form: tutti i giorni del periodo
    const d = new Date(giorni.dal + 'T12:00:00');
    for (let n = 0; n < 400 && dataLocaleISO(d) <= (giorni.al || giorni.dal); n++, d.setDate(d.getDate() + 1))
      gg.push(dataLocaleISO(d));
  }
  if (!gg.length) return false;
  gg = [...new Set(gg)].sort();
  const tipoAss = nomeCorrente('Assenza');
  const conAss = new Set();
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.eliminato || e.tipo !== tipoAss || (esclusa && e.id === esclusa.id)) return;
    if (String(e.nome || '').toLowerCase() !== String(nome).toLowerCase()) return;
    _pianoDateMalattia(e.testo || '', e.data).forEach((d) => gg.includes(d) && conAss.add(d));
  });
  try {
    const celle =
      (await secGet(
        'piano?collaboratore=eq.' +
          encodeURIComponent(nome) +
          '&codice=eq.ASS&data=gte.' +
          gg[0] +
          '&data=lte.' +
          gg[gg.length - 1] +
          '&select=data',
      )) || [];
    celle.forEach((r) => gg.includes(String(r.data).substring(0, 10)) && conAss.add(String(r.data).substring(0, 10)));
  } catch (e) {
    /* senza lettura del piano: valgono le registrazioni */
  }
  if (!conAss.size) return false;
  const elenco = [...conAss]
    .sort()
    .map((d) => d.substring(8, 10) + '.' + d.substring(5, 7))
    .join(', ');
  await mostraAvviso(
    nome +
      ' ha un assenza in attesa di certificato (ASS) il ' +
      elenco +
      '.\n\nLa malattia sopra un assenza la registra chi ha lo Storico HR (modificare), con «Certificato ricevuto» nella scheda del collaboratore o sulla cella ASS del Piano, quando arriva il certificato. Niente è stato salvato.',
    { titolo: 'Assenza in attesa di certificato' },
  );
  return true;
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
    toastErrore(e0.nome + ' è fisso: la non disponibilità vale solo per i jolly.');
    return;
  }
  // Assenza (attesa certificato) -> Malattia: solo l HR (Certificato ricevuto)
  if (
    e0 &&
    modalTipoSel === nomeCorrente('Malattia') &&
    e0.tipo !== modalTipoSel &&
    (await _diarioMalattiaSopraAss(e0.nome, _pianoDateMalattia(e0.testo || '', e0.data)))
  )
    return;
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
    '"' + testo + '"' + (contesto ? ' ' + contesto : '') + ' corrisponde a più collaboratori. Chi è?',
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
// NOMI DENTRO UNA FRASE LIBERA («Oggi ha chiamato Provetti, non sta bene», «cassa 3 Rossi
// ammanco 20»): le persone nominate, nell ordine della frase. Per ognuna { testo, nomi }:
// testo = le parole del nome scritte nella frase, nomi = i collaboratori con piu parole
// trovate. Con due «Provetti» e solo il cognome restano tutti e due: chi chiama passa testo a
// scegliCollaboratore, che sceglie se e sicuro e altrimenti fa chiedere (A5 del 23.10: prima
// si prendeva il primo collaboratore dell elenco, anche di un altro settore).
function nominatiInFrase(frase) {
  const f = String(frase || '');
  const escR = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pos = {};
  const dove = (w) => {
    if (!(w in pos)) {
      const m = new RegExp('(^|[^a-zà-ü])' + escR(w) + '(?![a-zà-ü])', 'i').exec(f);
      pos[w] = m ? m.index + m[1].length : -1;
    }
    return pos[w];
  };
  const trovati = [];
  for (const c of collaboratoriCache || []) {
    const ws = [
      ...new Set(
        String(c.nome || '')
          .toLowerCase()
          .split(/\s+/)
          // le particelle («del», «della») non sono un nome: «malato del turno» non nomina Del Prete
          .filter((w) => w.length >= 3 && !(typeof _NOMI_PARTICELLE !== 'undefined' && _NOMI_PARTICELLE.includes(w))),
      ),
    ];
    const qui = ws.filter((w) => dove(w) >= 0);
    if (qui.length) trovati.push({ nome: c.nome, parole: qui });
  }
  const parole = [...new Set(trovati.flatMap((t) => t.parole))].sort((a, b) => dove(a) - dove(b));
  const usate = new Set();
  const out = [];
  for (const w of parole) {
    if (usate.has(w)) continue;
    const cand = trovati.filter((t) => t.parole.includes(w) && !t.parole.some((x) => usate.has(x) && x !== w));
    if (!cand.length) continue;
    const max = Math.max(...cand.map((t) => t.parole.length));
    const best = cand.filter((t) => t.parole.length === max);
    const gruppo = [...new Set(best.flatMap((t) => t.parole))].sort((a, b) => dove(a) - dove(b));
    gruppo.forEach((x) => usate.add(x));
    out.push({ testo: gruppo.join(' '), nomi: [...new Set(best.map((t) => t.nome))] });
  }
  return out;
}
// IMPORTO DI UNA FRASE LIBERA della cassa: il numero dopo «ammanco», «eccedenza», «differenza»
// (anche «ammanco di 20») o seguito da CHF; con un numero solo, quello. Piu numeri senza
// indicazione = da chiarire (A7: «cassa 3 Rossi ammanco 20» dava 3 CHF). Ritorna
// { segno, importo } oppure { ambiguo: true } oppure null.
function _cassaImportoInFrase(part) {
  const N = '([+-])?\\s*(\\d+(?:[.,]\\d{1,2})?)';
  const k = String(part).match(
    new RegExp(
      '\\b(ammanco|mancanza|mancante|manca(?:no)?|eccedenza|eccesso|avanzo|differenza|meno|pi[uù])(?:\\s+(?:di|da|per))?\\s*' +
        N +
        '(?!\\d)',
      'i',
    ),
  );
  const c = String(part).match(new RegExp(N + '\\s*(?:chf|fr\\.?|franchi)(?![a-z])', 'i'));
  const tutti = String(part).match(/\d+(?:[.,]\d{1,2})?/g) || [];
  let segno = null,
    num = null;
  if (k) {
    segno = k[2] || null;
    num = k[3];
  } else if (c) {
    segno = c[1] || null;
    num = c[2];
  } else if (tutti.length === 1) {
    const u = String(part).match(new RegExp(N));
    segno = u[1] || null;
    num = u[2];
  } else if (tutti.length > 1) return { ambiguo: true };
  if (num == null) return null;
  const importo = parseFloat(num.replace(',', '.'));
  return importo >= 0.01 ? { segno, importo } : null;
}
// segno dalle parole: «ammanco» = -, «eccedenza» = +, altrimenti quello scritto (o niente)
function _cassaSegnoDaParole(part, segno) {
  if (segno) return segno;
  if (/\b(ammanco|mancante|mancanza|manca|negativ[oa]|meno|sotto)\b/i.test(part)) return '-';
  if (/\b(eccedenza|eccesso|positiv[oa]|più|piu|sopra|avanzo|avanza)\b/i.test(part)) return '+';
  return null;
}
// VOCI DEL CAMPO «Differenze Cassa» (senza database): [{ part, cognome, segno, importo }]
// oppure { part, cognome, ambiguo } (importo da chiarire) oppure { part, nonCapita }.
// La virgola dei decimali («Rossi -12,50») resta parte dell importo: prima il testo si
// divideva a ogni virgola e l importo diventava 12.00 (A2).
function _cassaVociDaTesto(text) {
  const voci = [];
  // la virgola dei decimali («-12,50») diventa un segno a parte prima di dividere per virgola;
  // negli avvisi resta il testo come e stato scritto («1.250,50», non «1.250.50»: A-N4)
  const entries = String(text || '')
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1\u0001$2')
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const entry of entries) {
    // Separa per virgola, "e" tra due differenze, o "/"
    const parts = entry
      .split(/,|\be\b(?=\s+[A-Za-zÀ-ü])|\/(?=\s*[A-Za-zÀ-ü])/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const scritto of parts) {
      const part = scritto.replace(/\u0001/g, '.');
      const comeScritto = scritto.replace(/\u0001/g, ',');
      if (/^(nessun[oa]|niente|nulla|no|n\/a|-+|\/+|\.+|ok)$/i.test(part)) continue;
      // 1. Formato classico: "Cognome +/-importo" o "Cognome importo" (anche con CHF)
      let m = part.match(/^([A-Za-zÀ-ü\s.'-]+?)\s*([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:chf|fr\.?|franchi)?\s*$/i);
      // 2. Formato invertito: "-170.44 Cognome" o "+50 Cognome"
      if (!m) {
        const _inv = part.match(
          /^\s*([+-])?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:chf|fr\.?|franchi)?\s+([A-Za-zÀ-ü\s.'-]+?)\s*$/i,
        );
        if (_inv) m = [part, _inv[3], _inv[1], _inv[2]];
      }
      if (m && m[1]) {
        // parole che non sono il nome ("Rossi ammanco 20", "chiude con -5")
        const _cleaned = m[1]
          .replace(/\b(chiude|chiuso|con|ha|aveva|fatto|differenza|cassa|ammanco|eccedenza|di)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (_cleaned.length >= 2) m[1] = _cleaned;
        const imp = parseFloat(m[3].replace(',', '.'));
        // parole in piu prima del nome («alla cassa Rossi -5»): vale il collaboratore nominato
        let cognome = m[1].trim();
        if (!candidatiCollaboratore(cognome).nomi.length) {
          const chi = nominatiInFrase(cognome)[0];
          if (chi) cognome = chi.nomi.length === 1 ? chi.nomi[0] : capitalizzaNome(chi.testo);
        }
        if (imp >= 0.01)
          voci.push({ part: comeScritto, cognome, segno: _cassaSegnoDaParole(part, m[2]), importo: imp });
        continue;
      }
      // 3. Frase libera: la persona nominata e l importo
      const chi = nominatiInFrase(part)[0];
      if (!chi) {
        if (/\d/.test(part)) voci.push({ part: comeScritto, nonCapita: true });
        continue;
      }
      const cognome = chi.nomi.length === 1 ? chi.nomi[0] : capitalizzaNome(chi.testo);
      const imp = _cassaImportoInFrase(part);
      if (!imp) continue;
      if (imp.ambiguo) {
        voci.push({ part: comeScritto, cognome, ambiguo: true });
        continue;
      }
      voci.push({ part: comeScritto, cognome, segno: _cassaSegnoDaParole(part, imp.segno), importo: imp.importo });
    }
  }
  return voci;
}
// avviso detto una volta per sessione (il rapporto si salva mentre si scrive: senza, lo
// stesso «nome da chiarire» tornava a ogni salvataggio)
const _avvisiDetti = new Set();
function _avvisoUnaVolta(chiave, testo) {
  if (_avvisiDetti.has(chiave)) return;
  _avvisiDetti.add(chiave);
  toast(testo, 6000);
}
async function parseDifferenzeCassa(text, ds, turno) {
  const _rappRef = 'da rapporto ' + turno + ' del ' + new Date(ds + 'T12:00:00').toLocaleDateString('it-IT');
  const _tipoErr = nomeCorrente('Errore');
  // le differenze gia registrate da QUESTO rapporto (del settore aperto)
  const _gia = datiCache.filter(
    (e) =>
      e.tipo === _tipoErr &&
      e.reparto === 'Cassa' &&
      !e.eliminato &&
      (e.reparto_dip || currentReparto) === currentReparto &&
      (e.testo || '').includes(_rappRef),
  );
  const _gianomi = _gia.map((e) => e.nome);
  // persone ancora nel campo (anche con l importo o il nome da chiarire): la loro
  // registrazione resta; le altre si staccano dal Rapporto (A8)
  const restano = new Set();
  let incerte = false;
  const voci = _cassaVociDaTesto(text);
  if (!voci.length && !_gia.length) return;
  for (const v of voci) {
    if (v.nonCapita) {
      incerte = true;
      _avvisoUnaVolta(
        'cassa-nc|' + _rappRef + '|' + v.part,
        'Differenze cassa: "' + v.part + '" non capito, controlla a mano',
      );
      continue;
    }
    const cognome = v.cognome;
    // OMONIMI: chi ha gia la differenza di QUESTO rapporto vale come scelta fatta
    // (risalvando il rapporto non si richiede); altrimenti si chiede una volta sola
    const _sc = scegliCollaboratore(cognome, _gianomi);
    let nomeCompleto = _sc && _sc.nome;
    // si chiede solo con il nome intero (parola completa in tutti i candidati):
    // "Som" a meta battitura non apre la finestra
    const _parolaIntera = (n) =>
      String(cognome)
        .toLowerCase()
        .split(/\s+/)
        .every((w) =>
          String(n)
            .toLowerCase()
            .split(/[\s'-]+/)
            .includes(w),
        );
    if (_sc && _sc.ambigui) {
      _sc.ambigui.forEach((n) => restano.add(n.toLowerCase()));
      if (_sc.ambigui.every(_parolaIntera))
        nomeCompleto = await chiediOmonimo(
          cognome,
          _sc.ambigui,
          'nelle differenze di cassa',
          'cassa|' + _rappRef + '|' + cognome.toLowerCase(),
        );
    }
    if (!nomeCompleto) {
      if (!_sc) incerte = true;
      _avvisoUnaVolta(
        'cassa-nome|' + _rappRef + '|' + cognome.toLowerCase(),
        'Differenze cassa: "' +
          cognome +
          '" ' +
          (_sc && _sc.ambigui ? 'saltata (nome da chiarire)' : 'non trovato tra i collaboratori'),
      );
      continue;
    }
    restano.add(nomeCompleto.toLowerCase());
    if (v.ambiguo) {
      _avvisoUnaVolta(
        'cassa-imp|' + _rappRef + '|' + v.part,
        'Differenze cassa di ' +
          nomeCompleto +
          ': importo da chiarire in "' +
          v.part +
          '" (scrivi per esempio "' +
          nomeCompleto +
          ' -20")',
      );
      continue;
    }
    const amount = v.importo;
    const direction = v.segno === '+' ? 'eccedenza' : 'ammanco';
    // FIX: check per nome + turno/data rapporto (non per importo esatto). Se cambi importo → aggiorna, non duplica.
    const esiste = _gia.find((e) => e.nome.toLowerCase() === nomeCompleto.toLowerCase());
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
      tipo: _tipoErr,
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
      _gia.push(rec);
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
  // TOLTE DAL RAPPORTO (come le assenze e come dice la Guida): il Diario resta, la
  // registrazione si stacca («tolta dal rapporto») e un avviso lo dice. Con una voce non
  // capita nel campo non si stacca niente (potrebbe essere proprio quella persona).
  if (!incerte)
    for (const e of _gia) {
      if (restano.has(String(e.nome).toLowerCase())) continue;
      const nuovoTesto = String(e.testo || '').replace(/\bda rapporto (PRESTO|NOTTE)/, 'tolta dal rapporto $1');
      try {
        await secPatch('registrazioni', 'id=eq.' + e.id, { testo: nuovoTesto });
        e.testo = nuovoTesto;
        toast(e.nome + ' tolto dalle differenze del Rapporto: nel Diario la registrazione resta', 6000);
        logAzione(
          'Differenza cassa tolta dal rapporto (Diario invariato)',
          e.nome + ' · rapporto ' + turno + ' del ' + ds,
        );
      } catch (er) {
        toastErrore(
          e.nome + ': differenza non staccata dal Rapporto, ' + ((er && er.message) || 'errore del database'),
        );
      }
    }
  render();
  updateStats();
}
