/**
 * Diario Collaboratori — Casino Lugano SA
 * File: api.js
 * Righe originali: 77
 * Estratto automaticamente da index.html
 */
// SEZIONE 5: API E CARICAMENTO DATI
// secGet, secPost, secPatch, secDel, loadAll
// ================================================================
// DATA LOADING
async function loadAll() {
  // Caricamento parallelo: impostazioni + dati + tabelle
  const [tp, co, ops, cr, tn, cn, to, cmo, clo, tr, vis] = await Promise.all([
    getImp('tipi_personalizzati'),
    getImp('colori_override'),
    getImp('operatori_lista'),
    getImp('campi_rapporto_extra'),
    getImp('tipi_nascosti'),
    getImp('campi_nascosti'),
    getImp('tipi_ordine'),
    getImp('campi_ordine'),
    getImp('campi_label_override'),
    getImp('tipi_rinominati'),
    getImp('visibilita'),
  ]);
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
  const opRep = await getImp('operatori_reparto');
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
    scadenze,
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
  ] = await Promise.all([
    secGet('registrazioni?order=data.desc'),
    secGet('note_fissate?select=registrazione_id'),
    secGet('scadenze?order=data_scadenza.asc'),
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
  ]);
  datiCache = (dati || []).filter((e) => !e.eliminato);
  pinnedIds = new Set(pins.map((p) => p.registrazione_id));
  scadenzeCache = scadenze;
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
  // Sync: assicura che tutti gli operatori abbiano un reparto nella mappa
  let _mapChanged = false;
  operatoriAuthCache.forEach((o) => {
    if (!operatoriRepartoMap[o.nome]) {
      operatoriRepartoMap[o.nome] = 'entrambi';
      _mapChanged = true;
    }
  });
  if (_mapChanged) {
    setImp('operatori_reparto', JSON.stringify(operatoriRepartoMap));
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
  // ENTERPRISE CHAT: decifra chat_messages e sintetizza noteColleghiCache
  await decryptChatMessagesCache();
  _chatBuildNoteCache();
  await loadGroqKey();
  _loadLogo();
  // Pulizia automatica: sessioni scadute + log > 12 mesi
  sbRpc('cleanup_old_data').catch(() => {});
  // Health check silenzioso (solo se loggato)
  if (getOpToken()) _healthCheck();
}
// ================================================================
