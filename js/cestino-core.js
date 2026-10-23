/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: cestino.js
 */

// ================================================================
// SEZIONE 6: CESTINO (soft delete)
// Registrazioni e moduli eliminati, ripristino
// ================================================================
// CESTINO
/**
 * Diario Collaboratori · Casino Lugano SA
 * File: cestino-core.js
 * Cestino: soft delete, ripristino, DB stats
 */

let _cestinoModuli = [],
  _cestinoValutazioni = [],
  _cestinoReg = [],
  _cestinoClienti = [],
  _cestinoClientiErrore = '',
  _cestinoSchede = [];
// SCHEDE COLLABORATORE TOLTE DA «UNISCI SCHEDE» (23/10/2026): le vede, le ripristina e le
// elimina solo l amministratore (funzioni collaboratori_cestino_*, migrazione 20260930_c)
function _cestinoVedeSchede() {
  return typeof isAdmin === 'function' && isAdmin();
}
// CHI USA IL CESTINO (decisione del titolare 11/10: "uno deve poter cestinare quello che
// vuole cestinare"): chi puo cestinare puo anche ripristinare. Registrazioni del Diario:
// tutti (il database mostra le righe del proprio settore); moduli: chi scrive i moduli.
// Elimina definitivamente e Svuota: solo l amministratore (il database lo impone).
function _cestinoVedeModuli() {
  return isAdmin() || (typeof _puoScrivereModuli === 'function' && _puoScrivereModuli());
}
// VALUTAZIONI (23/10/2026, decisione del titolare): le vede e le rimette chi le gestisce
// (Valutazioni · inserire e importare schede); il database fa lo stesso controllo
function _cestinoVedeValutazioni() {
  return isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_valutazioni'));
}
// CLIENTI MAISON TOLTI (21/10/2026): li vede e li rimette chi ha la pagina Maison nel
// settore aperto (gli stessi permessi della scheda clienti)
function _cestinoVedeClienti() {
  return typeof isVis === 'function' && isVis('maison');
}
// filtro "Tipo": le voci Moduli e Clienti Maison solo a chi li vede
function cestinoPreparaFiltri() {
  const sel = document.getElementById('cestino-filt-tipo');
  if (!sel) return;
  const opMod = sel.querySelector('option[value="moduli"]');
  if (opMod) opMod.hidden = !_cestinoVedeModuli();
  if (sel.value === 'moduli' && !_cestinoVedeModuli()) sel.value = '';
  const opVal = sel.querySelector('option[value="valutazioni"]');
  if (opVal) opVal.hidden = !_cestinoVedeValutazioni();
  if (sel.value === 'valutazioni' && !_cestinoVedeValutazioni()) sel.value = '';
  const opCli = sel.querySelector('option[value="clienti_maison"]');
  if (opCli) opCli.hidden = !_cestinoVedeClienti();
  if (sel.value === 'clienti_maison' && !_cestinoVedeClienti()) sel.value = '';
  const opSch = sel.querySelector('option[value="schede_collaboratori"]');
  if (opSch) opSch.hidden = !_cestinoVedeSchede();
  if (sel.value === 'schede_collaboratori' && !_cestinoVedeSchede()) sel.value = '';
}
async function caricaCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  cestinoPreparaFiltri();
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  try {
    const modDel = !_cestinoVedeModuli()
      ? []
      : await secGet('moduli?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc');
    const regDel = await secGet(
      'registrazioni?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
    );
    _cestinoModuli = modDel || [];
    _cestinoReg = regDel || [];
    // valutazioni nel Cestino: come i clienti, se la lettura non riesce (database non ancora
    // aggiornato) il resto del Cestino si vede lo stesso
    _cestinoValutazioni = [];
    if (_cestinoVedeValutazioni()) {
      try {
        _cestinoValutazioni =
          (await secGet(
            'valutazioni?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
          )) || [];
      } catch (e) {
        _cestinoValutazioni = [];
      }
    }
    // clienti Maison tolti: se la lettura non riesce il resto del Cestino si vede lo stesso,
    // con l avviso (es. database non ancora aggiornato: colonna eliminato mancante)
    _cestinoClienti = [];
    _cestinoClientiErrore = '';
    if (_cestinoVedeClienti()) {
      try {
        _cestinoClienti =
          (await secGet(
            'maison_budget?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
          )) || [];
      } catch (e) {
        _cestinoClientiErrore = (e && e.message) || 'errore del database';
      }
    }
    // schede unite: database senza la migrazione = nessuna (il resto si vede lo stesso)
    _cestinoSchede = [];
    if (_cestinoVedeSchede()) {
      try {
        _cestinoSchede = (await _rpcSicura('collaboratori_cestino_leggi', { p_token: getOpToken() })) || [];
      } catch (e) {
        _cestinoSchede = [];
      }
    }
    renderCestino();
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Errore caricamento cestino</p>';
  }
}
// "Eliminato da X il ...": senza autore o data (voci vecchie) si scrive solo quello che c e
function _cestinoChiQuando(chi, quando) {
  return 'Eliminato' + (chi ? ' da ' + escP(chi) : '') + (quando ? ' il ' + quando : '');
}
function renderCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  const ft = (document.getElementById('cestino-filt-tipo') || {}).value || '';
  const fn = (document.getElementById('cestino-filt-nome') || {}).value || '';
  const fc = (document.getElementById('cestino-filt-chi') || {}).value || '';
  const fnl = fn.toLowerCase(),
    fcl = fc.toLowerCase();
  let filtReg = _cestinoReg;
  let filtMod = _cestinoModuli;
  let filtVal = _cestinoVedeValutazioni() ? _cestinoValutazioni : [];
  let filtCli = _cestinoVedeClienti() ? _cestinoClienti : [];
  let filtSch = _cestinoVedeSchede() ? _cestinoSchede : [];
  if (ft && ft !== 'schede_collaboratori') filtSch = [];
  if (ft && ft !== 'registrazioni') filtReg = [];
  if (ft && ft !== 'moduli') filtMod = [];
  if (ft && ft !== 'valutazioni') filtVal = [];
  if (ft && ft !== 'clienti_maison') filtCli = [];
  if (fn) {
    filtReg = filtReg.filter(
      (r) => (r.nome || '').toLowerCase().includes(fnl) || (r.testo || '').toLowerCase().includes(fnl),
    );
    filtMod = filtMod.filter((m) => (m.collaboratore || '').toLowerCase().includes(fnl));
    filtVal = filtVal.filter((v) => (v.collaboratore || '').toLowerCase().includes(fnl));
    filtCli = filtCli.filter((c) => (c.nome || '').toLowerCase().includes(fnl));
    filtSch = filtSch.filter(
      (c) => (c.nome || '').toLowerCase().includes(fnl) || (c.unito_in || '').toLowerCase().includes(fnl),
    );
  }
  if (fc) {
    filtReg = filtReg.filter((r) => (r.eliminato_da || '').toLowerCase().includes(fcl));
    filtMod = filtMod.filter((m) => (m.eliminato_da || '').toLowerCase().includes(fcl));
    filtVal = filtVal.filter((v) => (v.eliminato_da || '').toLowerCase().includes(fcl));
    filtCli = filtCli.filter((c) => (c.eliminato_da || '').toLowerCase().includes(fcl));
    filtSch = filtSch.filter((c) => (c.eliminato_da || '').toLowerCase().includes(fcl));
  }
  const avvisoCli = _cestinoClientiErrore
    ? '<p style="color:var(--accent);font-size:var(--fs-sm,.8125rem)">Clienti Maison tolti non letti: ' +
      escP(_cestinoClientiErrore) +
      '</p>'
    : '';
  if (!filtMod.length && !filtReg.length && !filtCli.length && !filtVal.length && !filtSch.length) {
    el.innerHTML =
      avvisoCli +
      '<p style="color:var(--c-verde,#2c6e49);font-weight:600">' +
      (_cestinoModuli.length ||
      _cestinoReg.length ||
      _cestinoClienti.length ||
      _cestinoValutazioni.length ||
      _cestinoSchede.length
        ? 'Nessun risultato con i filtri applicati'
        : 'Cestino vuoto') +
      '</p>';
    return;
  }
  const adm = isAdmin();
  // Elimina definitivamente: solo l amministratore (all operatore il pulsante non c e)
  const btnElimina = (tab, id) =>
    adm
      ? '<button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;background:var(--accent)" onclick="eliminaDefinitivo(\'' +
        tab +
        "'," +
        id +
        ')">Elimina</button>'
      : '';
  let html = avvisoCli;
  if (filtReg.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Registrazioni (' + filtReg.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtReg.forEach((r) => {
      const d = r.data ? new Date(r.data).toLocaleDateString('it-IT') : '';
      const delAt = r.eliminato_at
        ? new Date(r.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(r.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:var(--fs-md,.875rem)"><div style="flex:1"><strong>' +
        escP(r.nome || '') +
        '</strong> · <span style="color:var(--muted)">' +
        escP(r.tipo || '') +
        '</span> · ' +
        d +
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        escP((r.testo || '').substring(0, 60)) +
        '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">' +
        _cestinoChiQuando(r.eliminato_da, delAt) +
        '</div></div><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="ripristinaCestino(\'registrazioni\',' +
        r.id +
        ')">Ripristina</button>' +
        btnElimina('registrazioni', r.id) +
        '</div>';
    });
    html += '</div>';
  }
  if (filtMod.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Moduli (' + filtMod.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtMod.forEach((m) => {
      const delAt = m.eliminato_at
        ? new Date(m.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(m.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:var(--fs-md,.875rem)"><div style="flex:1"><strong>' +
        escP(m.collaboratore || '') +
        '</strong> · <span style="color:var(--muted)">' +
        escP(m.tipo || '') +
        '</span> · ' +
        escP(m.data_modulo || '') +
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">' +
        _cestinoChiQuando(m.eliminato_da, delAt) +
        '</div></div><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="ripristinaCestino(\'moduli\',' +
        m.id +
        ')">Ripristina</button>' +
        btnElimina('moduli', m.id) +
        '</div>';
    });
    html += '</div>';
  }
  if (filtVal.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Valutazioni (' + filtVal.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtVal.forEach((v) => {
      const delAt = v.eliminato_at
        ? new Date(v.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(v.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:var(--fs-md,.875rem)"><div style="flex:1"><strong>' +
        escP(v.collaboratore || '') +
        '</strong> · <span style="color:var(--muted)">' +
        escP(v.tipo || 'valutazione') +
        ' ' +
        escP(String(v.anno || '')) +
        '</span>' +
        (v.valutatore ? ' · ' + escP(v.valutatore) : '') +
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">' +
        _cestinoChiQuando(v.eliminato_da, delAt) +
        '</div></div><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="ripristinaCestino(\'valutazioni\',' +
        v.id +
        ')">Ripristina</button>' +
        btnElimina('valutazioni', v.id) +
        '</div>';
    });
    html += '</div>';
  }
  if (filtCli.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Clienti Maison (' + filtCli.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtCli.forEach((c) => {
      const delAt = c.eliminato_at
        ? new Date(c.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(c.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      const cat = typeof maisonCatLabel === 'function' ? maisonCatLabel(c.categoria) : c.categoria || '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:var(--fs-md,.875rem)"><div style="flex:1"><strong>' +
        escP(c.nome || '') +
        '</strong>' +
        (cat ? ' · <span style="color:var(--muted)">' + escP(cat) + '</span>' : '') +
        (c.budget_chf ? ' · ' + fmtCHF(c.budget_chf) + ' CHF/mese' : '') +
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">' +
        _cestinoChiQuando(c.eliminato_da, delAt) +
        '</div></div><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="ripristinaCestino(\'maison_budget\',' +
        c.id +
        ')">Ripristina</button>' +
        btnElimina('maison_budget', c.id) +
        '</div>';
    });
    html += '</div>';
  }
  if (filtSch.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Schede collaboratore unite (' + filtSch.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtSch.forEach((c) => {
      const delAt = c.eliminato_at
        ? new Date(c.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(c.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:var(--fs-md,.875rem)"><div style="flex:1"><strong>' +
        escP(c.nome || '') +
        '</strong> · <span style="color:var(--muted)">unita in ' +
        escP(c.unito_in || '') +
        (c.righe_tolte ? ' · ' + c.righe_tolte + ' righe doppie' : '') +
        '</span><div style="font-size:var(--fs-sm,.8125rem);color:var(--accent)">' +
        _cestinoChiQuando(c.eliminato_da, delAt) +
        '</div></div><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="ripristinaSchedaCestino(' +
        c.id +
        ')">Ripristina</button><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px;background:var(--accent)" onclick="eliminaSchedaCestino(' +
        c.id +
        ')">Elimina</button></div>';
    });
    html += '</div>';
  }
  html += adm
    ? '<div style="margin-top:16px;display:flex;gap:8px"><button class="btn-salva" style="background:var(--accent);font-size:var(--fs-sm,.8125rem);padding:8px 16px" onclick="svuotaCestino()">Svuota cestino</button></div>'
    : '<p style="margin-top:12px;font-size:var(--fs-sm,.8125rem);color:var(--muted)">L’eliminazione definitiva è riservata all’amministratore.</p>';
  el.innerHTML = html;
}
async function _cestinoRiallineaRegistrazione(r) {
  // registrata dal Diario: la voce torna nel Rapporto del primo giorno (A9), per prima e da sola
  // (un errore del Piano non la blocca)
  if (typeof _diarioOrigineRapporto === 'function' && _diarioOrigineRapporto(r))
    await _diarioRapportoAllinea(r.origine, r.nome, r.tipo).catch((e) => console.error('rapporto: ripristino', e));
  try {
    if (r.tipo === nomeCorrente('Non Disponibilità') && typeof _diarioNdRiallinea === 'function')
      await _diarioNdRiallinea([r]);
    if (r.tipo === nomeCorrente('Malattia') && typeof sincronizzaMalattiaPiano === 'function')
      await sincronizzaMalattiaPiano(r.nome, '', r.data, r.testo || '');
    // assenza in attesa di certificato: tornano le ASS sui turni
    if (r.tipo === nomeCorrente('Assenza') && typeof sincronizzaMalattiaPiano === 'function')
      await sincronizzaMalattiaPiano(r.nome, '', r.data, r.testo || '', { codice: 'ASS' });
    if (typeof _rapportoRimettiRegistrazione === 'function') await _rapportoRimettiRegistrazione(r);
  } catch (e) {
    toastErrore('Ripristinata, ma piano o Rapporto non allineati: ' + ((e && e.message) || e));
  }
}
// un ripristino alla volta: il doppio click ripeteva il riallineamento di piano e Rapporto
function ripristinaCestino(tabella, id) {
  return unaVoltaSola('cestino-ripristina|' + tabella + '|' + id, () => _ripristinaCestinoEsegui(tabella, id));
}
async function _ripristinaCestinoEsegui(tabella, id) {
  if (
    (tabella === 'moduli' && !_cestinoVedeModuli()) ||
    (tabella === 'maison_budget' && !_cestinoVedeClienti()) ||
    (tabella === 'valutazioni' && !_cestinoVedeValutazioni())
  ) {
    toastErrore('Non hai il permesso di ripristinare questo elemento: chiedi all’amministratore');
    return;
  }
  // una sola scheda viva per collaboratore, anno e tipo: se nel frattempo e' stata rifatta, il
  // ripristino si ferma con il motivo (il database lo rifiuterebbe come doppione)
  const valR = tabella === 'valutazioni' ? _cestinoValutazioni.find((x) => x.id === id) : null;
  if (
    valR &&
    valutazioniCache.some(
      (x) =>
        x.id !== id &&
        (x.collaboratore || '').toLowerCase() === (valR.collaboratore || '').toLowerCase() &&
        x.anno === valR.anno &&
        x.tipo === valR.tipo &&
        (x.reparto_dip || 'slots') === (valR.reparto_dip || 'slots'),
    )
  ) {
    toastErrore(
      'Non ripristinata: ' +
        valR.collaboratore +
        ' ha già una ' +
        valR.tipo +
        ' ' +
        valR.anno +
        '. Elimina prima quella, poi ripristina questa.',
      9000,
    );
    return;
  }
  if (!(await chiediConferma('Ripristinare questo elemento?'))) return;
  try {
    await secPatch(tabella, 'id=eq.' + id, { eliminato: false, eliminato_da: null, eliminato_at: null });
    if (tabella === 'valutazioni') {
      if (valR) {
        valR.eliminato = false;
        valR.eliminato_da = null;
        valR.eliminato_at = null;
        if (!valutazioniCache.some((x) => x.id === id)) valutazioniCache.unshift(valR);
        _cestinoValutazioni = _cestinoValutazioni.filter((x) => x.id !== id);
      }
      logAzione(
        'Valutazione ripristinata',
        valR ? valR.collaboratore + ' · ' + valR.tipo + ' ' + valR.anno : 'ID ' + id,
      );
      renderCestino();
      toast('Ripristinata');
      return;
    }
    if (tabella === 'maison_budget') {
      // il cliente torna nella scheda clienti e nell elenco dei nomi della Maison
      const c = _cestinoClienti.find((x) => x.id === id);
      if (c) {
        c.eliminato = false;
        c.eliminato_da = null;
        c.eliminato_at = null;
        if (!maisonBudgetCache.some((x) => x.id === id)) maisonBudgetCache.push(c);
        _cestinoClienti = _cestinoClienti.filter((x) => x.id !== id);
      }
      logAzione('Cliente Maison ripristinato', (c && c.nome) || 'ID ' + id);
      renderCestino();
      if (typeof renderMaisonBudgetUI === 'function') renderMaisonBudgetUI();
      if (typeof renderMaisonDashboard === 'function') renderMaisonDashboard();
      toast('Ripristinato');
      return;
    }
    if (tabella === 'moduli') {
      const m = _cestinoModuli.find((x) => x.id === id);
      if (m) {
        m.eliminato = false;
        m.eliminato_da = null;
        m.eliminato_at = null;
        moduliCache.push(m);
        _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
      }
    } else {
      const r = _cestinoReg.find((x) => x.id === id);
      if (r) {
        r.eliminato = false;
        r.eliminato_da = null;
        r.eliminato_at = null;
        datiCache.unshift(r);
        _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
        // la registrazione torna valida: piano, modulo ND e Rapporto come alla creazione
        // (prima tornava solo nel Diario: la ND o la malattia restavano fuori dal piano)
        await _cestinoRiallineaRegistrazione(r);
      }
    }
    logAzione('Ripristinato da cestino', tabella + ' ID ' + id);
    renderCestino();
    aggiornaNomi();
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    aggiornaModuliLista();
    toast('Ripristinato');
  } catch (e) {
    toastErrore('Non ripristinato: ' + ((e && e.message) || 'errore del database'));
  }
}
// voce del Cestino nell archivio da conservare: archivio sulla data del fatto, correzione
// ammessa per cio che e stato INSERITO da poco (created_at), non per i fatti recenti (C16)
function _cestinoProtetto(r) {
  if (typeof inArchivioProtetto !== 'function' || !r) return false;
  const data = r.data || r.data_modulo || r.created_at;
  return !!data && inArchivioProtetto(data, r.created_at);
}
// valutazione vista dalla conservazione: il fatto e' la data della scheda (data_valutazione)
function _cestinoValProt(v) {
  return v ? { data: v.data_valutazione || null, created_at: v.created_at } : null;
}
// voce del Cestino descritta per il Registro (riverifica C-N5): prima «registrazioni ID
// 1792011407771», senza dire cosa fosse. Ora tipo, persona e data (il numero resta in fondo)
function _cestinoDescriviVoce(tabella, id) {
  const fmt = (d) =>
    d
      ? (String(d).length > 10 && typeof giornoDi === 'function' ? giornoDi(d) : String(d).substring(0, 10))
          .split('-')
          .reverse()
          .join('.')
      : '';
  let parti = [];
  if (tabella === 'moduli') {
    const m = _cestinoModuli.find((x) => x.id === id) || {};
    parti = ['Modulo ' + (m.tipo || ''), m.collaboratore, fmt(m.data_modulo)];
  } else if (tabella === 'valutazioni') {
    const v = _cestinoValutazioni.find((x) => x.id === id) || {};
    parti = ['Valutazione' + (v.anno ? ' ' + v.anno : ''), v.collaboratore, fmt(v.data_valutazione)];
  } else if (tabella === 'maison_budget') {
    const c = _cestinoClienti.find((x) => x.id === id) || {};
    parti = ['Cliente Maison', c.nome];
  } else {
    const r = _cestinoReg.find((x) => x.id === id) || {};
    parti = ['Registrazione ' + (r.tipo || ''), r.nome, fmt(r.data)];
  }
  return (
    parti
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .join(' · ') +
    ' (' +
    tabella +
    ' n. ' +
    id +
    ')'
  );
}
async function eliminaDefinitivo(tabella, id) {
  // il controllo era solo nell'interfaccia: la funzione resta richiamabile dalla console
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
  // CONSERVAZIONE (regolamento aziendale / RAP): un record dell'archivio degli
  // ultimi N anni non si cancella. Restano eliminabili le voci inserite da poco
  // (correzioni di battitura), che archivio non sono.
  const rec =
    tabella === 'moduli'
      ? _cestinoModuli.find((x) => x.id === id)
      : tabella === 'maison_budget'
        ? null // scheda di un cliente, non archivio: nessun vincolo di conservazione
        : tabella === 'valutazioni'
          ? _cestinoValProt(_cestinoValutazioni.find((x) => x.id === id))
          : _cestinoReg.find((x) => x.id === id);
  if (rec && _cestinoProtetto(rec)) {
    await mostraAvviso(
      "Non si può eliminare definitivamente.\n\nQuesta voce fa parte dell'archivio da conservare per " +
        conservazioneAnni() +
        ' anni (regolamento aziendale).\n\nResta nel Cestino e si può ripristinare in qualsiasi momento.',
    );
    return;
  }
  if (!(await chiediConferma('Eliminare DEFINITIVAMENTE? Non potrà essere recuperato.'))) return;
  const descr = _cestinoDescriviVoce(tabella, id);
  try {
    await secDel(tabella, 'id=eq.' + id);
    if (tabella === 'moduli') _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
    else if (tabella === 'valutazioni') _cestinoValutazioni = _cestinoValutazioni.filter((x) => x.id !== id);
    else if (tabella === 'maison_budget') _cestinoClienti = _cestinoClienti.filter((x) => x.id !== id);
    else _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
    // nel Registro cosa era (riverifica C-N5): nome, tipo e data, non solo il numero
    logAzione('Eliminato definitivamente', descr);
    renderCestino();
    toast('Eliminato definitivamente');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
async function svuotaCestino() {
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
  const tot = _cestinoModuli.length + _cestinoReg.length + _cestinoClienti.length + _cestinoValutazioni.length;
  if (!tot) {
    toast('Cestino già vuoto');
    return;
  }
  // CONSERVAZIONE: si svuota solo cio' che NON e' archivio protetto; le voci
  // degli ultimi N anni restano nel Cestino e si possono sempre ripristinare
  const modOk = _cestinoModuli.filter((m) => !_cestinoProtetto(m));
  const regOk = _cestinoReg.filter((r) => !_cestinoProtetto(r));
  const valOk = _cestinoValutazioni.filter((v) => !_cestinoProtetto(_cestinoValProt(v)));
  // clienti Maison tolti: schede, non archivio (nessuna conservazione)
  const cliOk = _cestinoClienti.slice();
  const nProt = tot - modOk.length - regOk.length - cliOk.length - valOk.length;
  const nVia = modOk.length + regOk.length + cliOk.length + valOk.length;
  if (!nVia) {
    await mostraAvviso(
      'Niente da svuotare.\n\nTutte le ' +
        tot +
        " voci nel Cestino fanno parte dell'archivio da conservare per " +
        conservazioneAnni() +
        ' anni (regolamento aziendale): restano disponibili e si possono ripristinare.',
    );
    return;
  }
  if (
    !(await chiediConferma(
      'Svuotare il cestino? ' +
        nVia +
        ' element' +
        (nVia === 1 ? 'o verrà' : 'i verranno') +
        ' eliminat' +
        (nVia === 1 ? 'o' : 'i') +
        ' DEFINITIVAMENTE.' +
        (nProt
          ? '\n\n' +
            nProt +
            " voci NON vengono toccate: fanno parte dell'archivio da conservare per " +
            conservazioneAnni() +
            ' anni.'
          : ''),
    ))
  )
    return;
  try {
    for (const m of modOk) {
      await secDel('moduli', 'id=eq.' + m.id);
    }
    for (const r of regOk) {
      await secDel('registrazioni', 'id=eq.' + r.id);
    }
    for (const c of cliOk) {
      await secDel('maison_budget', 'id=eq.' + c.id);
    }
    for (const v of valOk) {
      await secDel('valutazioni', 'id=eq.' + v.id);
    }
    logAzione(
      'Cestino svuotato',
      nVia + ' elementi eliminati definitivamente' + (nProt ? ', ' + nProt + ' protetti' : ''),
    );
    _cestinoClienti = [];
    const idsV = new Set(valOk.map((v) => v.id));
    _cestinoValutazioni = _cestinoValutazioni.filter((v) => !idsV.has(v.id));
    const idsM = new Set(modOk.map((m) => m.id));
    const idsR = new Set(regOk.map((r) => r.id));
    _cestinoModuli = _cestinoModuli.filter((m) => !idsM.has(m.id));
    _cestinoReg = _cestinoReg.filter((r) => !idsR.has(r.id));
    renderCestino();
    toast('Cestino svuotato' + (nProt ? ' (' + nProt + ' voci protette restano)' : ''));
  } catch (e) {
    toast('Errore svuotamento');
  }
}
// ===== SISTEMAZIONE GUIDATA DEI DATI =====
// Due strumenti richiamati dal controllo salute: assegnare l'impiego a chi
// non ce l'ha e sistemare i nomi che hanno turni ma nessuna scheda.
async function apriFixImpiego() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tutti =
    (await secGet(
      'collaboratori?select=id,nome,reparto_dip,is_jolly,percentuale,funzione,impiego,attivo&limit=2000',
    )) || [];
  const senza = tutti
    .filter((c) => c.attivo !== false && !c.impiego)
    .sort((a, b) => (a.reparto_dip || '').localeCompare(b.reparto_dip || '') || a.nome.localeCompare(b.nome));
  if (!senza.length) {
    el.innerHTML =
      '<p style="color:var(--c-verde,#2c6e49);font-weight:700">Tutti i collaboratori attivi hanno già&#39; l&#39;impiego indicato.</p>';
    return;
  }
  let h =
    '<p style="font-size:var(--fs-md,.875rem);margin-bottom:10px"><b>' +
    senza.length +
    ' collaboratori senza impiego.</b> La proposta qui sotto &egrave; gi&agrave; compilata in base al vecchio campo del piano: correggi le righe sbagliate e salva. Serve per i recuperi festivi (CGF) e per i limiti di ore.</p>' +
    '<div style="margin-bottom:10px"><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="salvaFixImpiego()">Salva tutti</button> ' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="controlloSalute()">Annulla</button></div>';
  let repCorr = '';
  senza.forEach((c) => {
    const rep = c.reparto_dip || 'slots';
    if (rep !== repCorr) {
      repCorr = rep;
      h +=
        '<p style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:12px 0 4px">' +
        escP(repartoLabel(rep)) +
        '</p>';
    }
    h +=
      '<div style="display:flex;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">' +
      '<span style="flex:1;font-size:var(--fs-md,.875rem)">' +
      escP(c.nome) +
      ' <span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">' +
      escP(c.funzione || '-') +
      ' &middot; ' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</span></span>' +
      '<select data-fix-imp="' +
      c.id +
      '" style="font-size:var(--fs-sm,.8125rem);padding:3px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
      '<option value="fisso"' +
      (c.is_jolly ? '' : ' selected') +
      '>Fisso</option>' +
      '<option value="jolly"' +
      (c.is_jolly ? ' selected' : '') +
      '>Jolly</option>' +
      '<option value="">Non indicare</option></select></div>';
  });
  el.innerHTML = h;
}
// FISSO/JOLLY IN CONTRADDIZIONE (C14): impiego della scheda (elenco) e is_jolly (piano, ore
// dovute, C attorno alle vacanze, CGF) diversi, oppure impiego da indicare con il piano che
// lo tratta da Jolly. Dalla 20260929_c_jolly_fisso il database li tiene allineati a ogni
// scrittura: qui si sistemano le schede di prima, mostrando prima cosa cambia.
function _jollyDaAllineare(c) {
  if (!c || c.attivo === false) return false;
  if (c.impiego === 'jolly') return !c.is_jolly;
  if (c.impiego === 'fisso') return !!c.is_jolly;
  return !!c.is_jolly;
}
async function apriFixJolly() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tutti =
    (await secGet(
      'collaboratori?select=id,nome,reparto_dip,is_jolly,percentuale,funzione,impiego,attivo&limit=2000',
    )) || [];
  const lista = tutti
    .filter(_jollyDaAllineare)
    .sort((a, b) => (a.reparto_dip || '').localeCompare(b.reparto_dip || '') || a.nome.localeCompare(b.nome));
  if (!lista.length) {
    el.innerHTML =
      '<p style="color:var(--c-verde,#2c6e49);font-weight:700">Nessuna contraddizione: elenco e piano dicono la stessa cosa per tutti.</p>';
    return;
  }
  const lbl = (v) => (v === 'jolly' ? 'Jolly' : v === 'fisso' ? 'Fisso' : 'da indicare');
  let h =
    '<p style="font-size:var(--fs-md,.875rem);margin-bottom:6px"><b>' +
    lista.length +
    (lista.length === 1 ? ' collaboratore' : ' collaboratori') +
    ' con elenco e piano in contraddizione.</b> Nella colonna «Diventa» c&egrave; la proposta: dove la scheda indica gi&agrave; Fisso o Jolly vale la scheda (cambia il piano); dove l&#39;impiego &egrave; da indicare vale il piano (cambia l&#39;elenco). Correggi le righe sbagliate e salva.</p>' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:10px">Jolly: niente ore dovute, C e CGF dei fissi. Fisso: ore dovute secondo la percentuale. Ogni cambio va nello Storico HR e nel Registro.</p>' +
    '<div style="margin-bottom:10px"><button class="btn-salva" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="salvaFixJolly()">Allinea</button> ' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="controlloSalute()">Annulla</button></div>' +
    '<div style="overflow-x:auto"><table class="collab-table" style="font-size:var(--fs-md,.875rem)"><thead><tr><th>Collaboratore</th><th>Settore</th><th>Elenco (scheda)</th><th>Piano oggi</th><th>Diventa</th></tr></thead><tbody>';
  lista.forEach((c) => {
    const proposta = c.impiego === 'jolly' || c.impiego === 'fisso' ? c.impiego : c.is_jolly ? 'jolly' : 'fisso';
    const opt = (v, t) => '<option value="' + v + '"' + (v === proposta ? ' selected' : '') + '>' + t + '</option>';
    h +=
      '<tr><td><b>' +
      escP(c.nome) +
      '</b> <span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">' +
      escP(c.funzione || '-') +
      ' &middot; ' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</span></td><td>' +
      escP(repartoLabel(c.reparto_dip || 'slots')) +
      '</td><td>' +
      lbl(c.impiego) +
      '</td><td>' +
      (c.is_jolly ? 'Jolly' : 'Fisso') +
      '</td><td><select data-fix-jolly="' +
      c.id +
      '" data-nome="' +
      escP(c.nome) +
      '" style="font-size:var(--fs-sm,.8125rem);padding:3px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
      opt('fisso', 'Fisso') +
      opt('jolly', 'Jolly') +
      '<option value="">Non toccare</option></select></td></tr>';
  });
  el.innerHTML = h + '</tbody></table></div>';
}
async function salvaFixJolly() {
  // stesso permesso della scheda collaboratore (Impiego)
  if (!puoModificare('gestione_impiego')) {
    toastErrore('Non hai il permesso per questa azione');
    return;
  }
  const sel = [...document.querySelectorAll('[data-fix-jolly]')].filter((s) => s.value);
  if (!sel.length) return toast('Nessuna riga da allineare');
  if (
    !(await chiediConferma(
      'Allineo elenco e piano di ' +
        sel.length +
        (sel.length === 1 ? ' collaboratore' : ' collaboratori') +
        '?\n\n' +
        sel.map((s) => '• ' + s.dataset.nome + ' → ' + (s.value === 'jolly' ? 'Jolly' : 'Fisso')).join('\n'),
      { ok: 'Allinea' },
    ))
  )
    return;
  let n = 0;
  const falliti = [];
  for (const s of sel) {
    const id = parseInt(s.dataset.fixJolly);
    const opz = { scheda: true };
    // la funzione della scheda: permesso, Storico HR (se l impiego cambia), Registro
    const ok = typeof cambiaImpiegoCollaboratore === 'function' && (await cambiaImpiegoCollaboratore(id, s.value, opz));
    // verifica nel database: i due campi devono dire la stessa cosa
    let r = null;
    try {
      r = ((await secGet('collaboratori?id=eq.' + id + '&select=id,impiego,is_jolly&limit=1')) || [])[0] || null;
    } catch (e) {}
    if (ok && r && r.impiego === s.value && !!r.is_jolly === (s.value === 'jolly')) {
      n++;
      const c = collaboratoriCache.find((x) => x.id === id);
      if (c) Object.assign(c, { impiego: r.impiego, is_jolly: r.is_jolly });
    } else falliti.push(s.dataset.nome);
  }
  logAzione(
    'Fisso/jolly allineati',
    n + ' collaboratori' + (falliti.length ? ', NON allineati: ' + falliti.join(', ') : ''),
  );
  _esitoInBlocco('Elenco e piano allineati per ' + n + (n === 1 ? ' collaboratore' : ' collaboratori'), falliti);
  controlloSalute();
}
// Esito di un salvataggio fatto collaboratore per collaboratore: se qualcuno non
// e stato salvato lo si dice per nome (in rosso), mai un "salvato" che non e vero
function _esitoInBlocco(msgOk, falliti) {
  if (!falliti.length) return toast(msgOk);
  toastErrore(
    msgOk +
      '. NON salvati (' +
      falliti.length +
      '): ' +
      falliti.slice(0, 8).join(', ') +
      (falliti.length > 8 ? '...' : ''),
    9000,
  );
}
async function salvaFixImpiego() {
  // stesso permesso della scheda collaboratore (Impiego)
  if (!puoModificare('gestione_impiego')) {
    toastErrore('Non hai il permesso per questa azione');
    return;
  }
  const sel = [...document.querySelectorAll('[data-fix-imp]')];
  if (!sel.length) return;
  if (
    !(await chiediConferma(
      "Salvo l'impiego di " + sel.length + (sel.length === 1 ? ' collaboratore?' : ' collaboratori?'),
    ))
  )
    return;
  let n = 0;
  const falliti = [];
  for (const s of sel) {
    const id = parseInt(s.dataset.fixImp);
    const val = s.value;
    if (!val) continue;
    const c = collaboratoriCache.find((x) => x.id === id);
    try {
      await secPatch('collaboratori', 'id=eq.' + id, { impiego: val, is_jolly: val === 'jolly' });
      if (c) {
        c.impiego = val;
        c.is_jolly = val === 'jolly';
      }
      n++;
    } catch (e) {
      console.error('Impiego non salvato (id ' + id + '):', e);
      falliti.push(c ? c.nome : 'id ' + id);
    }
  }
  logAzione(
    'Impiego assegnato in blocco',
    n + ' collaboratori' + (falliti.length ? ', NON salvati: ' + falliti.join(', ') : ''),
  );
  _esitoInBlocco('Impiego salvato per ' + n + (n === 1 ? ' collaboratore' : ' collaboratori'), falliti);
  controlloSalute();
}
// I disattivati con mesi interi di soli riposi (C/V/WD senza commento) sono
// righe di riempimento arrivate dagli import Excel: si tolgono dal piano,
// i mesi con turni veri restano come storia di lavoro
async function pulisciPianoDisattivati() {
  if (!_pianoAzioneAutoConsentita('cancella')) return; // azione automatica: permesso apposito
  // cancella righe del piano: stesso permesso della griglia turni
  if (!puoModificare('gestione_piano')) {
    toastErrore('Non hai il permesso per questa azione');
    return;
  }
  try {
    // il piano si legge TUTTO (senza limite secGet legge a pagine in ordine
    // stabile): con un tetto fisso i mesi oltre il tetto non venivano visti
    const [collab, righe] = await Promise.all([
      secGet('collaboratori?select=nome,attivo&limit=2000'),
      secGet('piano?select=id,collaboratore,data,codice,commento'),
    ]);
    const inattivi = new Set((collab || []).filter((c) => c.attivo === false).map((c) => (c.nome || '').toLowerCase()));
    const isRiposo = (cod) => {
      if (cod === 'C' || cod === 'V' || cod === 'WD') return true;
      const cs = typeof _pianoCodiceInfo === 'function' ? _pianoCodiceInfo(cod) : null;
      return !!(cs && cs.is_riposo);
    };
    const mesi = {};
    (righe || []).forEach((r) => {
      if (!inattivi.has((r.collaboratore || '').toLowerCase())) return;
      const k = r.collaboratore + '|' + String(r.data).substring(0, 7);
      if (!mesi[k]) mesi[k] = { ids: [], solo: true };
      mesi[k].ids.push(r.id);
      if (!isRiposo(r.codice) || (r.commento || '').trim()) mesi[k].solo = false;
    });
    const daPulire = Object.entries(mesi).filter(([, v]) => v.solo);
    if (!daPulire.length) {
      toast('Niente da pulire: nessun mese di soli riposi tra i disattivati');
      return;
    }
    const perNome = {};
    daPulire.forEach(([k]) => {
      const [n, m] = k.split('|');
      (perNome[n] = perNome[n] || []).push(m);
    });
    const elenco = Object.entries(perNome)
      .map(([n, ms]) => '• ' + n + ': ' + ms.sort().join(', '))
      .join('\n');
    const totIds = daPulire.reduce((s, [, v]) => s + v.ids.length, 0);
    if (
      !(await chiediConferma(
        'Questi mesi contengono SOLO riposi (C/V) senza commenti: sono righe di riempimento degli import, non storia di lavoro.\n\n' +
          elenco +
          '\n\nTogliere queste ' +
          totIds +
          ' celle dal piano? I mesi con turni veri restano.',
      ))
    )
      return;
    const ids = daPulire.flatMap(([, v]) => v.ids);
    // si contano le cancellazioni riuscite: solo quelle escono dalla memoria
    const tolti = new Set();
    let nonTolte = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const parte = ids.slice(i, i + 10);
      const esiti = await Promise.allSettled(parte.map((id) => secDel('piano', 'id=eq.' + id)));
      esiti.forEach((e, j) => {
        if (e.status === 'fulfilled') tolti.add(parte[j]);
        else {
          nonTolte++;
          console.error('Cella del piano non tolta (id ' + parte[j] + '):', e.reason);
        }
      });
    }
    if (typeof _pianoRighe !== 'undefined') _pianoRighe = _pianoRighe.filter((r) => !tolti.has(r.id));
    logAzione(
      'Pulizia piani disattivati',
      tolti.size +
        ' celle di solo riposo tolte (' +
        Object.keys(perNome).length +
        ' collaboratori)' +
        (nonTolte ? ', ' + nonTolte + ' NON tolte' : ''),
    );
    if (nonTolte)
      toastErrore(
        'Tolte ' + tolti.size + ' celle di riempimento, ' + nonTolte + ' NON tolte: riprova la pulizia',
        9000,
      );
    else toast('Tolte ' + tolti.size + ' celle di riempimento');
    controlloSalute();
  } catch (e) {
    toast('Errore pulizia: ' + (e.message || ''));
  }
}
// ===== CONGEDO NON PAGATO E GIUBILEI =====
// Un mese intero senza turni e senza assenze retribuite (solo C) e' congedo non
// pagato: non matura anzianita', quindi sposta in avanti i giubilei. Qui si
// leggono dal piano i mesi cosi' fatti e si propone di registrarli sulla scheda.
// Elenco compatto per inserire le date di nascita mancanti: servono per i
// compleanni (nota nel piano) e per gli auguri. Si compila e si salva tutto
// insieme, senza aprire la scheda di ognuno.
async function apriFixDateNascita() {
  const mancanti = (collaboratoriCache || [])
    .filter((c) => c.attivo !== false && !c.data_nascita && !/^sig\.|^cognome/i.test(c.nome))
    .sort((a, b) => (a.reparto_dip || '').localeCompare(b.reparto_dip || '') || a.nome.localeCompare(b.nome));
  const b = document.getElementById('pwd-modal-content');
  if (!mancanti.length) {
    await mostraAvviso('Tutti i collaboratori attivi hanno la data di nascita.');
    return;
  }
  let h =
    '<h3>Date di nascita mancanti (' +
    mancanti.length +
    ')</h3><p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Scrivi giorno e mese (per esempio 02.03) oppure la data completa (02.03.1985). Servono per i compleanni: il giorno del compleanno il piano segna il congedo con la nota. Si salvano solo le righe compilate.</p>' +
    '<div style="max-height:52vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Settore</th><th>Data di nascita</th></tr></thead><tbody>';
  mancanti.forEach((c) => {
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td style="font-size:var(--fs-md,.875rem);color:var(--muted)">' +
      escP(repartoLabel(c.reparto_dip || 'slots')) +
      '</td><td><input type="text" data-nasc-id="' +
      c.id +
      '" placeholder="gg.mm" style="width:110px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"></td></tr>';
  });
  h +=
    '</tbody></table></div><div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button><button class="btn-modal-ok" onclick="salvaFixDateNascita()">Salva le date inserite</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaFixDateNascita() {
  const campi = [...document.querySelectorAll('input[data-nasc-id]')].filter((i) => i.value.trim());
  if (!campi.length) {
    toast('Nessuna data inserita');
    return;
  }
  let ok = 0;
  const errori = []; // valori non capiti
  const nonSalvate = []; // valori giusti che il database non ha salvato
  for (const inp of campi) {
    const v = inp.value.trim();
    const m = v.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
    if (!m) {
      errori.push(v);
      continue;
    }
    const gg = String(parseInt(m[1])).padStart(2, '0');
    const mm = String(parseInt(m[2])).padStart(2, '0');
    let anno = m[3] ? parseInt(m[3]) : 1900;
    if (anno < 100) anno += anno > 30 ? 1900 : 2000;
    const iso = anno + '-' + mm + '-' + gg;
    try {
      await secPatch('collaboratori', 'id=eq.' + inp.dataset.nascId, { data_nascita: iso });
      const c = collaboratoriCache.find((x) => String(x.id) === String(inp.dataset.nascId));
      if (c) c.data_nascita = iso;
      ok++;
    } catch (e) {
      // non e un valore sbagliato: e il database che non l ha salvato
      const c = collaboratoriCache.find((x) => String(x.id) === String(inp.dataset.nascId));
      console.error('Data di nascita non salvata:', e);
      nonSalvate.push((c ? c.nome : 'id ' + inp.dataset.nascId) + ' (' + (e.message || 'errore') + ')');
    }
  }
  logAzione(
    'Date di nascita inserite',
    ok + ' collaboratori' + (nonSalvate.length ? ', NON salvate: ' + nonSalvate.length : ''),
  );
  document.getElementById('pwd-modal').classList.add('hidden');
  const msg =
    ok +
    ' date salvate' +
    (errori.length ? ', ' + errori.length + ' non valide' : '') +
    (nonSalvate.length ? ', ' + nonSalvate.length + ' NON salvate' : '');
  if (nonSalvate.length) toastErrore(msg, 9000);
  else toast(msg);
  if (errori.length || nonSalvate.length)
    await mostraAvviso(
      (errori.length
        ? 'Non ho capito questi valori: ' + errori.join(', ') + '\n\nUsa il formato gg.mm oppure gg.mm.aaaa'
        : '') +
        (nonSalvate.length
          ? (errori.length ? '\n\n' : '') + 'Il database NON ha salvato: ' + nonSalvate.join(', ')
          : ''),
    );
  if (typeof controlloSalute === 'function') controlloSalute();
}
async function apriFixOrfani() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const [collab, righe] = await Promise.all([
    secGet('collaboratori?select=nome,attivo,reparto_dip&limit=2000'),
    secGet('piano?select=collaboratore,data,reparto_dip'),
  ]);
  // una riga del piano senza nome (collaboratore nullo) non deve far saltare
  // tutto il controllo: si raggruppa a parte e si segnala come "senza nome"
  const esiste = new Set((collab || []).map((c) => String(c.nome || '').toLowerCase()));
  const orf = {};
  (righe || []).forEach((r) => {
    const nomeRiga = String(r.collaboratore || '').trim();
    if (nomeRiga && esiste.has(nomeRiga.toLowerCase())) return;
    const o = (orf[nomeRiga] = orf[nomeRiga] || {
      n: 0,
      rep: r.reparto_dip || 'slots',
      da: r.data,
      a: r.data,
    });
    o.n++;
    if (r.data < o.da) o.da = r.data;
    if (r.data > o.a) o.a = r.data;
  });
  const lista = Object.entries(orf).sort((a, b) => b[1].n - a[1].n);
  if (!lista.length) {
    el.innerHTML =
      '<p style="color:var(--c-verde,#2c6e49);font-weight:700">Nessun nome senza scheda: tutti i turni appartengono a un collaboratore.</p>';
    return;
  }
  const attivi = (collab || [])
    .filter((c) => c.attivo !== false)
    .map((c) => c.nome)
    .sort();
  let h =
    '<p style="font-size:var(--fs-md,.875rem);margin-bottom:10px"><b>' +
    lista.length +
    ' nomi hanno turni ma nessuna scheda.</b> Per ognuno puoi creare la scheda, spostare i turni su un collaboratore esistente (se &egrave; un nome scritto male) oppure eliminare i turni se non &egrave; una persona.</p>' +
    '<div style="margin-bottom:10px"><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:6px 14px" onclick="controlloSalute()">Torna al controllo</button></div>';
  lista.forEach(([nome, o], i) => {
    const nomeJs = _jsArg(nome);
    h +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line)">' +
      '<b style="font-size:var(--fs-md,.875rem)">' +
      (nome ? escP(nome) : '(senza nome)') +
      '</b> <span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
      o.n +
      ' turni &middot; ' +
      escP(repartoLabel(o.rep)) +
      ' &middot; dal ' +
      String(o.da || '')
        .split('-')
        .reverse()
        .join('.') +
      ' al ' +
      String(o.a || '')
        .split('-')
        .reverse()
        .join('.') +
      '</span>';
    if (!nome) {
      // senza nome non c'e' niente su cui creare, spostare o filtrare: solo segnalazione
      h +=
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px">Righe del piano senza collaboratore: vanno corrette nel piano.</div></div>';
      return;
    }
    h +=
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">' +
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="orfanoCreaScheda(\'' +
      nomeJs +
      "','" +
      o.rep +
      '\')">Crea la scheda</button>' +
      '<select id="orf-dest-' +
      i +
      '" style="font-size:var(--fs-sm,.8125rem);padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">sposta i turni su...</option>' +
      attivi.map((n) => '<option value="' + escP(n) + '">' + escP(n) + '</option>').join('') +
      '</select>' +
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="orfanoSposta(\'' +
      nomeJs +
      "'," +
      i +
      ')">Sposta</button>' +
      '<button class="btn-export btn-pericolo" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="orfanoElimina(\'' +
      nomeJs +
      "'," +
      o.n +
      ')">Elimina i turni</button></div></div>';
  });
  el.innerHTML = h;
}
// un salvataggio alla volta: il doppio click creava righe doppie (unaVoltaSola in utils.js)
function orfanoCreaScheda(nome, rep) {
  return unaVoltaSola('orfano-scheda|' + nome, () => _orfanoCreaSchedaEsegui(nome, rep));
}
async function _orfanoCreaSchedaEsegui(nome, rep) {
  if (
    !(await chiediConferma(
      'Creo la scheda di "' +
        nome +
        '" nel settore ' +
        repartoLabel(rep) +
        '?\n\nI suoi turni resteranno dove sono e da ora verranno conteggiati.',
    ))
  )
    return;
  try {
    const r = await secPost('collaboratori', { nome: nome, attivo: true, reparto_dip: rep, percentuale: 1 });
    if (r && r[0]) collaboratoriCache.push(r[0]);
    logAzione('Collaboratore creato da turni orfani', nome + ' (' + rep + ')');
    toast('Scheda creata: ' + nome);
    apriFixOrfani();
  } catch (e) {
    toast('Errore creazione scheda');
  }
}
async function orfanoSposta(nome, idx) {
  const sel = document.getElementById('orf-dest-' + idx);
  const dest = sel ? sel.value : '';
  if (!dest) {
    toast('Scegli prima su chi spostare i turni');
    return;
  }
  if (
    !(await chiediConferma(
      'Sposto tutti i turni di "' + nome + '" su "' + dest + '"?\n\nSi usa quando il nome era scritto in modo diverso.',
    ))
  )
    return;
  try {
    await secPatch('piano', 'collaboratore=eq.' + encodeURIComponent(nome), { collaboratore: dest });
    logAzione('Turni riassegnati', nome + ' -> ' + dest);
    toast('Turni spostati su ' + dest);
    apriFixOrfani();
  } catch (e) {
    toast('Errore spostamento turni');
  }
}
async function orfanoElimina(nome, n) {
  // cancella righe del piano: stesso permesso della griglia turni
  if (!puoModificare('gestione_piano')) {
    toastErrore('Non hai il permesso per questa azione');
    return;
  }
  if (
    !(await chiediConferma(
      'ATTENZIONE: elimino ' +
        n +
        ' turni intestati a "' +
        nome +
        '".\n\nDa fare solo se non è una persona (righe rimaste da vecchie importazioni). L\'operazione non si annulla.',
    ))
  )
    return;
  if (
    !(await chiediConferma(
      (n === 1
        ? 'Confermi definitivamente l\'eliminazione del turno di "'
        : "Confermi definitivamente l'eliminazione dei " + n + ' turni di "') +
        nome +
        '"?',
      {
        pericolo: true,
        ok: 'Elimina',
      },
    ))
  )
    return;
  try {
    await secDel('piano', 'collaboratore=eq.' + encodeURIComponent(nome));
    logAzione('Turni orfani eliminati', nome + ' (' + n + ' righe)');
    toast(n + (n === 1 ? ' turno eliminato' : ' turni eliminati'));
    apriFixOrfani();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
// ===== CONTROLLO SALUTE DEL SISTEMA =====
// Verifiche automatiche sui dati: l'app segnala da sola le incoerenze che
// altrimenti nessuno vedrebbe (schede incomplete, turni orfani, festivi
// mancanti per l'anno prossimo...). Solo lettura: non modifica niente.
async function controlloSalute() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Controllo in corso...</p>';
  const esiti = [];
  const add = (stato, titolo, dettaglio, azione) => esiti.push({ stato, titolo, dettaglio, azione });
  try {
    const oggi = new Date();
    const ym = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0');
    const annoPross = oggi.getFullYear() + 1;
    const [collab, righe, festivi, turni] = await Promise.all([
      secGet(
        'collaboratori?select=nome,attivo,impiego,is_jolly,reparto_dip,reparti_extra,percentuale,mesi_congedo_non_pagato,data_nascita&limit=2000',
      ),
      secGet('piano?data=gte.' + ym + '-01'),
      secGet('piano_festivi?select=data&limit=500'),
      secGet('piano_turni?select=codice,reparto_dip,attivo&limit=500'),
    ]);
    const attivi = (collab || []).filter((c) => c.attivo !== false);
    // nomi sempre come stringa: una scheda o una riga del piano senza nome
    // faceva fallire l'intero controllo su .toLowerCase()
    const nomeDi = (x) => String(x || '').trim();
    const perNome = {};
    (collab || []).forEach((c) => (perNome[nomeDi(c.nome).toLowerCase()] = c));

    // 1) impiego non indicato (serve per CGF, limiti ore, report)
    const senzaImpiego = attivi.filter((c) => !c.impiego);
    add(
      senzaImpiego.length ? 'ko' : 'ok',
      'Impiego (fisso o jolly) indicato',
      senzaImpiego.length
        ? senzaImpiego.length +
            ' collaboratori attivi senza impiego: ' +
            senzaImpiego
              .slice(0, 6)
              .map((c) => c.nome)
              .join(', ') +
            (senzaImpiego.length > 6 ? ' e altri' : '') +
            '. Senza questo dato i CGF e i limiti di ore non si calcolano correttamente.'
        : "Tutti i collaboratori attivi hanno l'impiego indicato.",
      senzaImpiego.length ? "FIX:apriFixImpiego()|Assegna l'impiego adesso" : '',
    );

    // 2) i due campi impiego/jolly in contraddizione (anche impiego da indicare con il piano
    // che lo tratta da Jolly). Prima rimandava a Gestione Collaboratori, dove la scheda
    // mostrava gia il valore giusto e Salva rispondeva "Nessuna modifica" (C14)
    const contrad = attivi.filter(_jollyDaAllineare);
    add(
      contrad.length ? 'attenzione' : 'ok',
      'Coerenza fisso/jolly',
      contrad.length
        ? contrad.map((c) => c.nome).join(', ') +
            ": l'elenco dei collaboratori dice una cosa e il piano (ore dovute, C, CGF) un'altra."
        : 'Nessuna contraddizione tra elenco e piano.',
      contrad.length ? 'FIX:apriFixJolly()|Allinea (prima mostra cosa cambia)' : '',
    );

    // 3) turni di persone che non esistono in anagrafica
    const orfani = [
      ...new Set(
        (righe || [])
          .map((r) => nomeDi(r.collaboratore) || '(senza nome)')
          .filter((n) => n === '(senza nome)' || !perNome[n.toLowerCase()]),
      ),
    ];
    add(
      orfani.length ? 'ko' : 'ok',
      'Turni collegati a una scheda',
      orfani.length
        ? orfani.slice(0, 6).join(', ') + ': hanno turni nel piano ma non esistono in Gestione collaboratori.'
        : 'Ogni turno del piano appartiene a un collaboratore esistente.',
      orfani.length ? 'FIX:apriFixOrfani()|Sistema questi nomi' : '',
    );

    // 3-bis) mesi interi di sola C nel piano: solo informativo. Trattarli in
    // automatico come congedo non pagato che sposta i giubilei e' contrario al
    // regolamento (RAP 5.14: un congedo fino a 6 mesi NON interrompe
    // l'anzianita'), quindi niente FIX automatico: se ne occupera' la sezione
    // Congedi non pagati in arrivo
    const perMeseC = {};
    (righe || []).forEach((r) => {
      const k = nomeDi(r.collaboratore) + '|' + String(r.data).substring(0, 7);
      if (!perMeseC[k]) perMeseC[k] = { tot: 0, soloC: true };
      perMeseC[k].tot++;
      if (String(r.codice || '').toUpperCase() !== 'C') perMeseC[k].soloC = false;
    });
    let mesiFermi = 0;
    Object.keys(perMeseC).forEach((k) => {
      if (perMeseC[k].soloC && perMeseC[k].tot >= 26) mesiFermi++;
    });
    add(
      'ok',
      'Congedo non pagato e giubilei',
      mesiFermi
        ? 'Mesi senza turni rilevati: ' +
            mesiFermi +
            ' (da verificare in Piano › Impostazioni › Congedi non pagati: un congedo fino a 6 mesi non interrompe l anzianità)'
        : 'Nessun mese intero senza turni nel piano.',
      '',
    );

    // 3-ter) date di nascita mancanti (servono per i compleanni)
    const senzaNascita = attivi.filter((c) => !c.data_nascita && !/^sig\.|^cognome/i.test(c.nome));
    add(
      senzaNascita.length ? 'attenzione' : 'ok',
      'Date di nascita per i compleanni',
      senzaNascita.length
        ? senzaNascita.length +
            ' collaboratori attivi senza data di nascita (' +
            senzaNascita
              .slice(0, 5)
              .map((c) => c.nome)
              .join(', ') +
            (senzaNascita.length > 5 ? ' e altri' : '') +
            '). Senza la data il compleanno non viene segnato nel piano.'
        : 'Tutti hanno la data di nascita.',
      senzaNascita.length ? 'FIX:apriFixDateNascita()|Inserisci le date mancanti' : '',
    );

    // 3-ter) COERENZA DIARIO/PIANO (controllo 23/10/2026, D27-D29): M nel piano senza
    // registrazione, malattie del Diario non nel piano, cognomi del foglio, ex collaboratori
    // senza fine rapporto. Qui solo il conto: la correzione si propone una per una
    if (typeof coerenzaDiarioPianoConta === 'function') {
      try {
        const co = await coerenzaDiarioPianoConta();
        const parti = [
          [co.c.senzaDiario.length, 'M o ASS nel piano senza registrazione nel Diario'],
          [co.c.senzaPiano.length, 'malattie o assenze del Diario non segnate nel piano'],
          [co.c.cognomi.length, 'cognomi del foglio da controllare'],
          [co.c.ex.length, 'ex collaboratori senza fine rapporto'],
        ].filter((x) => x[0]);
        add(
          co.n ? 'attenzione' : 'ok',
          'Coerenza Diario/Piano',
          co.n
            ? parti.map((x) => x[0] + ' ' + x[1]).join('; ') + '. Ogni correzione si conferma una per una.'
            : 'Diario e Piano dicono la stessa cosa (malattie, assenze, cognomi, fine rapporto).',
          co.n ? 'FIX:apriCoerenzaDiarioPiano()|Rivedi uno per uno' : '',
        );
      } catch (e) {
        add('attenzione', 'Coerenza Diario/Piano', 'Controllo non riuscito: ' + ((e && e.message) || e), '');
      }
    }

    // 4) disattivati che hanno ancora turni
    const disattiviConTurni = [
      ...new Set(
        (righe || [])
          .map((r) => perNome[nomeDi(r.collaboratore).toLowerCase()])
          .filter((c) => c && c.attivo === false)
          .map((c) => c.nome),
      ),
    ];
    add(
      disattiviConTurni.length ? 'attenzione' : 'ok',
      'Collaboratori disattivati senza turni',
      disattiviConTurni.length
        ? disattiviConTurni.slice(0, 6).join(', ') +
            ': risultano disattivati ma hanno turni pianificati. Se sono mesi di soli riposi (righe di riempimento degli import) si tolgono col bottone qui sotto; se invece devono lavorare vanno riattivati in Gestione Collaboratori.'
        : 'Nessun disattivato ha turni pianificati.',
      disattiviConTurni.length ? 'FIX:pulisciPianoDisattivati()|Togli i mesi di solo riposo' : '',
    );

    // 5) turni in un settore non suo e senza copertura configurata
    const fuoriSettore = [
      ...new Set(
        (righe || [])
          .filter((r) => {
            const c = perNome[nomeDi(r.collaboratore).toLowerCase()];
            if (!c) return false;
            const suo = c.reparto_dip || 'slots';
            const rep = r.reparto_dip || 'slots';
            if (suo === rep) return false;
            return !String(c.reparti_extra || '')
              .split(',')
              .map((x) => x.trim())
              .includes(rep);
          })
          .map((r) => r.collaboratore),
      ),
    ];
    add(
      fuoriSettore.length ? 'attenzione' : 'ok',
      'Turni nel settore giusto',
      fuoriSettore.length
        ? fuoriSettore.slice(0, 6).join(', ') +
            ': hanno turni in un settore che non è il loro e senza copertura configurata.'
        : 'Nessun turno in un settore non previsto.',
      fuoriSettore.length ? 'Gestione Collaboratori' : '',
    );

    // 6) festivi dell'anno prossimo
    const haFestiviPross = (festivi || []).some((f) => String(f.data).startsWith(String(annoPross)));
    add(
      haFestiviPross ? 'ok' : 'attenzione',
      "Giorni festivi dell'anno prossimo",
      haFestiviPross
        ? 'I festivi ' + annoPross + ' sono già in archivio.'
        : 'Mancano i festivi ' + annoPross + ": si creano da soli aprendo Piano → Festivi con quell'anno selezionato.",
      haFestiviPross ? '' : 'Piano · Festivi',
    );

    // 7) sigle turno usate da piu' settori (fonte di confusione nei briefing)
    const perCodice = {};
    (turni || [])
      .filter((t) => t.attivo !== false)
      .forEach((t) => {
        (perCodice[t.codice] = perCodice[t.codice] || new Set()).add(t.reparto_dip || 'slots');
      });
    const doppi = Object.entries(perCodice).filter(([, s]) => s.size > 1);
    add(
      doppi.length ? 'info' : 'ok',
      'Sigle turno uguali in più settori',
      doppi.length
        ? doppi.map(([c, s]) => c + ' (' + [...s].join(', ') + ')').join(' · ') +
            '. Il programma li tiene separati, ma attenzione quando si leggono i piani.'
        : 'Nessuna sigla usata da due settori.',
      '',
    );

    // 8) schede di prova rimaste
    // nomi segnaposto e dati di prova: QA-..., QAFIX-..., TEST..., Xxxxx, "Cognome Nome",
    // nomi di una sola parola tutta di lettere ripetute (C31: prima QA-... e Xxxxxxxxx passavano)
    const _nomeDiProva = (n) =>
      /^(sig\.|test\b|mario rossi|zztest|qa[a-z]*[-_ ]|prova\b|cognome\b|nome cognome)/i.test(n) ||
      /^x{3,}$/i.test(n.replace(/\s+/g, '')) ||
      /^(.)\1{3,}$/i.test(n.replace(/\s+/g, ''));
    const prova = attivi.filter((c) => _nomeDiProva(nomeDi(c.nome)));
    add(
      prova.length ? 'attenzione' : 'ok',
      'Schede di prova',
      prova.length
        ? prova.map((c) => c.nome).join(', ') + ': sembrano schede segnaposto ancora attive.'
        : 'Nessuna scheda di prova attiva.',
      prova.length ? 'Gestione Collaboratori' : '',
    );

    const ko = esiti.filter((e) => e.stato === 'ko').length;
    const att = esiti.filter((e) => e.stato === 'attenzione').length;
    const col = { ok: '#2c6e49', attenzione: '#e67e22', ko: '#c0392b', info: '#1a4a7a' };
    const lbl = { ok: 'OK', attenzione: 'DA VEDERE', ko: 'DA SISTEMARE', info: 'NOTA' };
    let h =
      '<p style="font-size:var(--fs-md,.875rem);margin-bottom:10px"><b>' +
      (ko || att ? ko + ' da sistemare, ' + att + ' da vedere' : 'Tutto in ordine') +
      '</b> · controllo del ' +
      new Date().toLocaleString('it-CH') +
      '</p>';
    esiti.forEach((e) => {
      h +=
        '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<span style="flex:0 0 auto;font-size:var(--fs-sm,.8125rem);font-weight:700;letter-spacing:.04em;color:#fff;background:' +
        col[e.stato] +
        ';padding:2px 7px;border-radius:3px;margin-top:2px">' +
        lbl[e.stato] +
        '</span><div style="flex:1"><b style="font-size:var(--fs-md,.875rem)">' +
        escP(e.titolo) +
        '</b><br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        escP(e.dettaglio) +
        '</span>' +
        (e.azione
          ? e.azione.indexOf('FIX:') === 0
            ? '<br><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;margin-top:5px" onclick="' +
              e.azione.split('|')[0].substring(4) +
              '">' +
              escP(e.azione.split('|')[1] || 'Sistema') +
              '</button>'
            : '<br><span style="font-size:var(--fs-sm,.8125rem);color:var(--c-blu,#1a4a7a);font-weight:700">Dove sistemarlo: ' +
              escP(e.azione) +
              '</span>'
          : '') +
        '</div></div>';
    });
    el.innerHTML = h;
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Errore durante il controllo: ' + escP(e.message || '') + '</p>';
  }
}
async function caricaDbStats() {
  const el = document.getElementById('db-stats-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tk = getAdminToken();
  if (!tk) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun token admin. Esci e rientra come admin.</p>';
    return;
  }
  const rpcR = await fetch(SB_URL + '/rest/v1/rpc/get_db_stats', {
    method: 'POST',
    headers: sbH(),
    body: JSON.stringify({ p_token: tk }),
  });
  if (!rpcR.ok) {
    const errTxt = await rpcR.text();
    console.error('DB stats error:', errTxt);
    if (errTxt.includes('Solo admin')) {
      el.innerHTML = '<p style="color:var(--accent)">Sessione admin scaduta. Esci e rientra come admin.</p>';
    } else {
      el.innerHTML = '<p style="color:var(--accent)">Errore: ' + (JSON.parse(errTxt).message || 'sconosciuto') + '</p>';
    }
    return;
  }
  const r = await rpcR.json();
  if (!r) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun dato ricevuto</p>';
    return;
  }
  const sizeMatch = (r.db_size || '').match(/([\d.]+)\s*(MB|GB|kB)/);
  let usedMB = 0;
  if (sizeMatch) {
    usedMB = parseFloat(sizeMatch[1]);
    if (sizeMatch[2] === 'GB') usedMB *= 1024;
    if (sizeMatch[2] === 'kB') usedMB /= 1024;
  }
  // il tetto di 500 MB vale solo per il database in cloud (piano gratuito); sul server
  // interno dell IT lo spazio e quello del disco: si mostra solo quanto occupa
  const inCloud = typeof SB_URL === 'string' && /supabase\.co/i.test(SB_URL);
  const pct = inCloud ? Math.min(Math.round((usedMB / 500) * 100), 100) : 0;
  const barColor = pct >= 90 ? 'var(--accent)' : pct >= 70 ? 'var(--c-arancio)' : 'var(--c-verde)';
  let h =
    '<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong>' +
    r.db_size +
    (inCloud ? ' / 500 MB' : ' occupati') +
    '</strong>' +
    (inCloud ? '<span style="color:' + barColor + ';font-weight:700">' + pct + '%</span>' : '') +
    '</div>';
  if (inCloud)
    h +=
      '<div style="background:var(--line);border-radius:4px;height:8px;overflow:hidden"><div style="background:' +
      barColor +
      ';height:100%;width:' +
      pct +
      '%;border-radius:4px;transition:width .5s"></div></div>';
  h += '</div>';
  const tables = r.tables || [];
  const labelMap = {
    registrazioni: 'Registrazioni',
    costi_maison: 'Costi Maison',
    moduli: 'Moduli',
    note_colleghi: 'Note Colleghi',
    consegne_turno: 'Consegne',
    promemoria: 'Promemoria',
    spese_extra: 'Spese Extra',
    log_attivita: 'Log Attività',
    operatori_auth: 'Operatori',
    operator_sessions: 'Sessioni',
    impostazioni: 'Impostazioni',
    maison_budget: 'Budget Maison',
    regali_maison: 'Regali',
    note_clienti: 'Note Clienti',
    rapporti_giornalieri: 'Rapporti',
    collaboratori: 'Collaboratori',
    scadenze: 'Scadenze',
    note_fissate: 'Note Fissate',
    push_subscriptions: 'Push',
    login_attempts: 'Tentativi Login',
  };
  // Calcola totale dati reali (somma dimensioni tabelle)
  const totalDataBytes = tables.reduce((s, t) => s + (t.bytes || 0), 0);
  const totalDataMB = (totalDataBytes / 1024 / 1024).toFixed(1);
  h +=
    '<p style="color:var(--muted);font-size:var(--fs-md,.875rem);margin-bottom:14px">Di cui dati reali: <strong style="color:var(--ink)">' +
    totalDataMB +
    ' MB</strong> · il resto e overhead PostgreSQL (fisso, non cresce)</p>';
  // Card grid con conteggio + dimensione
  h +=
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">';
  tables.forEach((t) => {
    h +=
      '<div style="background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--ink)">' +
      t.righe +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">' +
      (labelMap[t.nome] || t.nome) +
      '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--accent2);font-weight:600;margin-top:3px">' +
      t.dimensione +
      '</div></div>';
  });
  h += '</div>';
  h += '<p style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Sessioni attive: ' + r.sessioni_attive + '</p>';
  el.innerHTML = h;
}
async function _healthCheck() {
  const problems = [];
  // 1. Supabase connessione (verifica tramite dati caricati, no fetch extra)
  // 2. Librerie CDN
  // librerie a richiesta: si prova davvero a caricarle (dalla cache, in pochi ms)
  for (const [lib, lbl] of [
    ['jspdf', 'PDF (jsPDF)'],
    ['xlsx', 'Excel (XLSX)'],
  ]) {
    try {
      await libreria(lib);
    } catch (e) {
      problems.push('Libreria ' + lbl + ' non caricabile');
    }
  }
  if (!window.Chart) problems.push('Libreria grafici (Chart.js) non caricata');
  if (!window.flatpickr) problems.push('Libreria calendario (Flatpickr) non caricata');
  // 3. Intelligenza artificiale (solo se configurata): prova il fornitore in uso
  // una vera domanda al modello: una volta al giorno (prima a ogni accesso, anche degli operatori)
  if (typeof aiPronta === 'function' && aiPronta() && _unaVoltaAlGiorno('prova_ai')) {
    const f = aiFornitoreAttivo();
    const e = await aiProva(f.id);
    if (!e.ok) problems.push('Intelligenza artificiale (' + f.nome + ') non risponde: ' + e.errore);
  }
  // 4. Token sessione
  const tk = getOpToken();
  if (!tk) problems.push('Nessun token sessione attivo');
  // 5. Dati caricati
  if (!datiCache.length && !maisonCache.length && !collaboratoriCache.length)
    problems.push('Nessun dato caricato (verifica connessione)');
  // Mostra avviso solo se ci sono problemi
  if (problems.length) {
    console.warn('Health check:', problems);
    toast('Attenzione: ' + problems[0]);
  }
}

// PASSWORD

// SCHEDA UNITA: torna con il suo numero e le righe doppie tolte; i dati spostati restano alla
// scheda tenuta (si dice prima)
function ripristinaSchedaCestino(id) {
  return unaVoltaSola('cestino-scheda|' + id, async () => {
    const c = _cestinoSchede.find((x) => x.id === id);
    if (!c || !_cestinoVedeSchede()) return;
    if (
      !(await chiediConferma(
        'Ripristinare la scheda «' +
          c.nome +
          '»?\n\nTorna con le ' +
          (c.righe_tolte || 0) +
          ' righe doppie che erano state tolte. I dati spostati in «' +
          (c.unito_in || '') +
          '» restano lì.',
        { titolo: 'Cestino', ok: 'Ripristina' },
      ))
    )
      return;
    try {
      await _rpcSicura('collaboratori_cestino_ripristina', { p_token: getOpToken(), p_id: id });
      toast('Scheda «' + c.nome + '» ripristinata');
      if (typeof loadAll === 'function') await loadAll();
    } catch (e) {
      toastNonRiuscito('Scheda NON ripristinata', e);
    }
    caricaCestino();
  });
}
function eliminaSchedaCestino(id) {
  return unaVoltaSola('cestino-scheda|' + id, async () => {
    const c = _cestinoSchede.find((x) => x.id === id);
    if (!c || !_cestinoVedeSchede()) return;
    if (
      !(await chiediConferma(
        'Eliminare per sempre la scheda «' +
          c.nome +
          '» dal Cestino?\n\nLe ' +
          (c.righe_tolte || 0) +
          ' righe doppie si perdono; i dati spostati in «' +
          (c.unito_in || '') +
          '» restano.',
        { titolo: 'Cestino', ok: 'Elimina per sempre' },
      ))
    )
      return;
    try {
      await _rpcSicura('collaboratori_cestino_elimina', { p_token: getOpToken(), p_id: id });
      toast('Scheda eliminata dal Cestino');
    } catch (e) {
      toastNonRiuscito('Scheda NON eliminata', e);
    }
    caricaCestino();
  });
}
