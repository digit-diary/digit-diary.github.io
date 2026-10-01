/**
 * Diario Collaboratori · Casino Lugano SA
 * File: api.js
 */

// ================================================================
// SEZIONE 5: API E CARICAMENTO DATI
// secGet, secPost, secPatch, secDel, loadAll
// ================================================================
// DATA LOADING
// DIARIO A FINESTRA: all avvio si leggono gli ultimi 24 mesi (tutti i settori),
// piu SEMPRE l intera storia di ammonimenti verbali e differenze di cassa, perche
// gli avvisi disciplinari e di cassa contano su tutta la storia. Il resto
// dell archivio entra in memoria quando serve: scheda del collaboratore (tutta
// la sua storia), statistiche (tutto), filtro "dal" piu vecchio, ricerca, e il
// pulsante "Mostra registrazioni piu vecchie" in fondo al Diario. Niente sparisce.
const DIARIO_FINESTRA_MESI = 24;
let diarioFinestraDa = null; // 'YYYY-MM-DD': in memoria tutto da qui in poi (null = archivio completo)
function _diarioInizioFinestra() {
  const d = new Date();
  d.setMonth(d.getMonth() - DIARIO_FINESTRA_MESI);
  return dataLocaleISO(d);
}
async function _diarioLeggiIniziale() {
  const da = _diarioInizioFinestra();
  const sempre = [nomeCorrente('Ammonimento Verbale'), nomeCorrente('Errore')];
  const [recenti, storiaDisc] = await Promise.all([
    secGet('registrazioni?data=gte.' + da + '&order=data.desc'),
    secGet(
      'registrazioni?data=lt.' +
        da +
        '&tipo=in.(' +
        sempre.map((t) => encodeURIComponent(t)).join(',') +
        ')&order=data.desc',
    ),
  ]);
  diarioFinestraDa = da;
  return (recenti || []).concat(storiaDisc || []);
}
function _diarioUnisci(righe) {
  const ids = new Set(datiCache.map((e) => e.id));
  let n = 0;
  (righe || []).forEach((r) => {
    if (r.eliminato || ids.has(r.id)) return;
    datiCache.push(r);
    ids.add(r.id);
    n++;
  });
  if (n) datiCache.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return n;
}
// porta in memoria le registrazioni dal giorno indicato fino all inizio della finestra
async function diarioCaricaDal(dataISO) {
  if (!diarioFinestraDa || !dataISO || dataISO >= diarioFinestraDa) return 0;
  const righe = await secGet('registrazioni?data=gte.' + dataISO + '&data=lt.' + diarioFinestraDa + '&order=data.desc');
  const n = _diarioUnisci(righe);
  diarioFinestraDa = dataISO;
  return n;
}
async function diarioCaricaTutto() {
  if (!diarioFinestraDa) return 0;
  const righe = await secGet('registrazioni?data=lt.' + diarioFinestraDa + '&order=data.desc');
  const n = _diarioUnisci(righe);
  diarioFinestraDa = null;
  return n;
}
// tutta la storia di una persona (scheda del collaboratore)
async function diarioCaricaPersona(nome) {
  if (!diarioFinestraDa || !nome) return 0;
  return _diarioUnisci(
    await secGet('registrazioni?nome=eq.' + encodeURIComponent(nome) + '&data=lt.' + diarioFinestraDa),
  );
}
// ricerca nell archivio (nome o testo) prima della finestra
async function diarioCercaArchivio(q) {
  if (!diarioFinestraDa || !q || q.length < 3) return 0;
  // jolly * (il canale sicuro lo traduce in % di SQL)
  const pat = encodeURIComponent('*' + q.replace(/[*%_,()\\]/g, ' ').trim() + '*');
  const [a, b] = await Promise.all([
    secGet('registrazioni?nome=ilike.' + pat + '&data=lt.' + diarioFinestraDa + '&limit=200'),
    secGet('registrazioni?testo=ilike.' + pat + '&data=lt.' + diarioFinestraDa + '&limit=200'),
  ]);
  return _diarioUnisci((a || []).concat(b || []));
}
async function loadAll() {
  // Caricamento parallelo: impostazioni + dati + tabelle.
  // secGet ora lancia se il database rifiuta: se la lettura fallisce si avvisa
  // e si esce lasciando in memoria le impostazioni e le cache gia' presenti,
  // invece di ripartire con tutto azzerato come se non ci fossero dati
  let impostazioni;
  try {
    impostazioni = await getImpMolte([
      'tipi_personalizzati',
      'colori_override',
      'operatori_lista',
      'campi_rapporto_extra',
      'tipi_nascosti',
      'campi_nascosti',
      'tipi_ordine',
      'campi_ordine',
      'campi_label_override',
      'tipi_rinominati',
      'visibilita',
      'profili_operatori',
      'moduli_responsabili',
      'competenze_config',
      'formazione_livelli_nomi',
      'punti_config',
      'maison_auto_delete_giorni',
      'inventario_categorie_extra',
      'soglie_alert',
      'soglie_disciplinari',
      'buono_valori',
      'equita_mesi',
      'reparti_config',
      'reparti_pagine',
      'reparti_nomi_documenti',
      'giubileo_config',
      'giubileo_preavviso',
      'conservazione_anni',
      'conservazione_giorni_grazia',
    ]);
  } catch (e) {
    toastErrore('Caricamento dati non riuscito: ' + e.message);
    return;
  }
  const [
    tp,
    co,
    ops,
    cr,
    tn,
    cn,
    to,
    cmo,
    clo,
    tr,
    vis,
    profOp,
    modResp,
    compCfg,
    livNomi,
    pntCfg,
    maisonAd,
    invCatExtra,
    soglieAl,
    soglieDis,
    buonoVal,
    eqMesi,
    repCfg,
    repPag,
    repNomiDoc,
    giubCfg,
    giubPre,
    consAnni,
    consGrazia,
  ] = impostazioni;
  if (tp)
    try {
      tipiPersonalizzati = JSON.parse(tp);
    } catch (e) {}
  if (co)
    try {
      coloriOverride = JSON.parse(co);
    } catch (e) {}
  if (ops)
    try {
      operatoriSalvati = JSON.parse(ops);
    } catch (e) {}
  if (cr)
    try {
      campiRapportoExtra = JSON.parse(cr);
    } catch (e) {}
  if (tn)
    try {
      tipiNascosti = JSON.parse(tn);
    } catch (e) {}
  if (cn)
    try {
      campiNascosti = JSON.parse(cn);
    } catch (e) {}
  if (to)
    try {
      tipiOrdine = JSON.parse(to);
    } catch (e) {}
  if (cmo)
    try {
      campiOrdine = JSON.parse(cmo);
    } catch (e) {}
  if (clo)
    try {
      campiLabelOverride = JSON.parse(clo);
    } catch (e) {}
  if (tr)
    try {
      tipiRinominati = JSON.parse(tr);
    } catch (e) {}
  if (vis)
    try {
      visibilitaConfig = JSON.parse(vis);
    } catch (e) {}
  if (profOp)
    try {
      profiliOperatori = JSON.parse(profOp);
    } catch (e) {}
  if (modResp)
    try {
      moduliRespCfg = JSON.parse(modResp);
    } catch (e) {}
  if (livNomi)
    try {
      window._livelliNomiCfg = JSON.parse(livNomi);
    } catch (e) {}
  if (compCfg)
    try {
      competenzeConfig = JSON.parse(compCfg);
    } catch (e) {}
  if (pntCfg)
    try {
      puntiConfig = JSON.parse(pntCfg);
    } catch (e) {}
  maisonAutoDeleteGiorni = parseInt(maisonAd) || 0;
  if (invCatExtra)
    try {
      inventarioCategorieExtra = JSON.parse(invCatExtra) || [];
    } catch (e) {}
  if (soglieAl)
    try {
      soglieAlertCfg = JSON.parse(soglieAl);
    } catch (e) {}
  if (soglieDis)
    try {
      soglieDisciplinariCfg = JSON.parse(soglieDis);
    } catch (e) {}
  if (buonoVal)
    try {
      const bv = JSON.parse(buonoVal);
      if (bv && typeof BUONO_VALORI !== 'undefined') Object.assign(BUONO_VALORI, bv);
    } catch (e) {}
  if (eqMesi && parseInt(eqMesi) > 0) equitaMesi = parseInt(eqMesi);
  if (repCfg)
    try {
      const rc = JSON.parse(repCfg);
      if (Array.isArray(rc)) repartiConfig = rc;
    } catch (e) {}
  if (repPag)
    try {
      repartiPagineCfg = JSON.parse(repPag);
    } catch (e) {}
  try {
    repartiNomiDocumenti = (repNomiDoc && JSON.parse(repNomiDoc)) || {};
  } catch (e) {
    repartiNomiDocumenti = {};
  }
  if (giubCfg)
    try {
      const gc = JSON.parse(giubCfg);
      if (Array.isArray(gc)) giubileoConfig = gc;
    } catch (e) {}
  if (giubPre != null && giubPre !== '' && !isNaN(parseInt(giubPre))) giubileoPreavviso = parseInt(giubPre);
  if (consAnni != null && consAnni !== '' && !isNaN(parseInt(consAnni))) conservazioneAnniCfg = parseInt(consAnni);
  if (consGrazia != null && consGrazia !== '' && !isNaN(parseInt(consGrazia)))
    conservazioneGraziaCfg = parseInt(consGrazia);
  try {
    const cmr = await getImp('campi_rapporto_reparti');
    if (cmr) campiReparti = JSON.parse(cmr);
  } catch (e) {}
  if (typeof _salvaCacheReparti === 'function') _salvaCacheReparti();
  if (typeof popolaLoginSettore === 'function') popolaLoginSettore();
  // La mappa operatori/reparto si considera "letta" solo se arriva dal server:
  // da cache locale non va mai riscritta (una copia vecchia sovrascriveva quella vera)
  let opRep = null,
    opRepDalServer = false;
  try {
    opRep = await getImp('operatori_reparto');
    opRepDalServer = true;
  } catch (e) {}
  try {
    const accExtra = await getImp('operatori_accessi_extra');
    if (accExtra) {
      window._operatoriAccessiExtra = JSON.parse(accExtra);
      localStorage.setItem('_cache_operatori_accessi_extra', accExtra);
    } else {
      const cachedAE = localStorage.getItem('_cache_operatori_accessi_extra');
      if (cachedAE) window._operatoriAccessiExtra = JSON.parse(cachedAE);
    }
  } catch (e) {
    try {
      const cachedAE = localStorage.getItem('_cache_operatori_accessi_extra');
      if (cachedAE) window._operatoriAccessiExtra = JSON.parse(cachedAE);
    } catch (e2) {}
  }
  if (opRep) {
    try {
      operatoriRepartoMap = JSON.parse(opRep);
      localStorage.setItem('_cache_operatori_reparto', opRep);
    } catch (e) {}
  } else {
    try {
      const cached = localStorage.getItem('_cache_operatori_reparto');
      if (cached) operatoriRepartoMap = JSON.parse(cached);
    } catch (e) {}
  }
  const [
    dati,
    pins,
    chatMsgs,
    chatGrps,
    chatGrpMembers,
    chatLetti,
    chatHidden,
    opAuth,
    collabs,
    moduli,
    logs,
    maisonD,
    maisonB,
    promemoriaD,
    consegneD,
    speseD,
    regaliD,
    noteClD,
    inventarioD,
    valutazioniD,
    puntiD,
    hrEv,
  ] = await Promise.all([
    // niente ripiego silenzioso: se una tabella non si legge, l'errore ferma
    // il caricamento (catch qui sotto) e le cache precedenti restano intatte
    _diarioLeggiIniziale(),
    secGet('note_fissate?select=registrazione_id'),
    // ENTERPRISE CHAT: carica le 5 nuove tabelle invece di note_colleghi
    secGet('chat_messages?order=created_at.desc'),
    secGet('chat_groups?order=id.asc'),
    secGet('chat_group_members?order=group_id.asc'),
    secGet('chat_message_letti?order=letta_at.desc'),
    secGet('chat_message_hidden?order=hidden_at.desc'),
    sbRpc('list_operators'),
    secGet('collaboratori?attivo=eq.true&order=nome.asc'),
    secGet('moduli?order=created_at.desc'),
    secGet('log_attivita?order=created_at.desc&limit=500'),
    secGet('costi_maison?order=data_giornata.desc'),
    secGet('maison_budget?order=nome.asc'),
    secGet('promemoria?order=data_scadenza.asc'),
    secGet('consegne_turno?order=created_at.desc&limit=50'),
    secGet('spese_extra?order=data_spesa.desc'),
    secGet('regali_maison?order=created_at.desc'),
    secGet('note_clienti?order=created_at.desc'),
    secGet('inventario?order=data_movimento.desc'),
    secGet('valutazioni?order=anno.desc'),
    secGet('punti_eventi?order=data_evento.desc'),
    secGet('hr_eventi?order=data_evento.desc'),
  ]).catch((e) => {
    toastErrore('Caricamento dati non riuscito: ' + e.message);
    return [];
  });
  // lettura fallita: si esce senza toccare le cache (dati resta undefined)
  if (!dati) return;
  datiCache = (dati || []).filter((e) => !e.eliminato);
  pinnedIds = new Set(pins.map((p) => p.registrazione_id));
  // le vecchie "scadenze" del Diario non si caricano piu: i follow-up sono Promemoria
  scadenzeCache = [];
  // ENTERPRISE CHAT: popola caches enterprise
  chatMessagesCache = chatMsgs || [];
  chatGroupsCache = chatGrps || [];
  chatGroupMembersCache = chatGrpMembers || [];
  chatLettiCache = chatLetti || [];
  chatHiddenCache = chatHidden || [];
  operatoriAuthCache = opAuth && opAuth.length ? opAuth : [];
  // Cache operatori in localStorage per fallback login
  if (operatoriAuthCache.length) localStorage.setItem('_cache_operatori_auth', JSON.stringify(operatoriAuthCache));
  else {
    try {
      const cached = localStorage.getItem('_cache_operatori_auth');
      if (cached) operatoriAuthCache = JSON.parse(cached);
    } catch (e) {}
  }
  // Sync: gli operatori senza reparto valgono 'entrambi' per questa sessione.
  // L'impostazione globale la scrive SOLO l'admin e SOLO se la mappa e' stata
  // letta dal server: prima qualsiasi operatore, anche partendo dalla cache
  // locale vecchia, riscriveva la mappa di tutti
  let _mapChanged = false;
  operatoriAuthCache.forEach((o) => {
    if (!operatoriRepartoMap[o.nome]) {
      operatoriRepartoMap[o.nome] = 'entrambi';
      _mapChanged = true;
    }
  });
  if (
    _mapChanged &&
    opRepDalServer &&
    isAdmin() &&
    (await salvaImp('operatori_reparto', JSON.stringify(operatoriRepartoMap)))
  ) {
    localStorage.setItem('_cache_operatori_reparto', JSON.stringify(operatoriRepartoMap));
  }
  collaboratoriCache = collabs;
  moduliCache = (moduli || []).filter((m) => !m.eliminato);
  logCache = logs;
  maisonCache = maisonD || [];
  maisonBudgetCache = maisonB || [];
  promemoriaCache = promemoriaD || [];
  consegneCache = consegneD || [];
  speseExtraCache = speseD || [];
  regaliCache = regaliD || [];
  noteClientiCache = noteClD || [];
  inventarioCache = inventarioD || [];
  valutazioniCache = valutazioniD || [];
  puntiEventiCache = puntiD || [];
  hrEventiCache = hrEv || [];
  // ENTERPRISE CHAT: decifra chat_messages e sintetizza noteColleghiCache
  await decryptChatMessagesCache();
  _chatBuildNoteCache();
  await loadGroqKey();
  _loadLogo();
  // Pulizia automatica: sessioni scadute + log > 12 mesi
  sbRpc('cleanup_old_data').catch(() => {});
  // Maison: auto-cancellazione GD precedenti se configurata (privacy)
  if (typeof _maisonAutoCleanup === 'function') _maisonAutoCleanup().catch(() => {});
  // Giubilei in arrivo: notifica una tantum agli operatori HR (se configurato il preavviso)
  if (typeof _checkGiubileiNotifiche === 'function') _checkGiubileiNotifiche().catch(() => {});
  // Health check silenzioso (solo se loggato)
  if (getOpToken()) _healthCheck();
  // dati pronti: se l'utente ha già aperto il Piano (era vuoto in attesa
  // dei dati), lo ridisegniamo ora che collaboratori e cache ci sono
  window._loadAllDone = true;
  if (typeof preparaLibrerie === 'function') preparaLibrerie();
  // backup automatico: parte da solo (solo admin) senza intralciare il login
  if (typeof _backupAutoCheck === 'function') setTimeout(() => _backupAutoCheck(), 6000);
  try {
    if ((localStorage.getItem('pagina_corrente') || '') === 'piano' && typeof renderPiano === 'function') renderPiano();
  } catch (e) {}
}
