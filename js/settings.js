/**
 * Diario Collaboratori · Casino Lugano SA
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
    inventario: 'Inventario',
    registro: 'Registro attività',
  },
  funzioni: {
    ricerca_globale: 'Ricerca globale',
    alert_cassa: 'Avvisi cassa',
    alert_rischio: 'Avvisi di rischio',
    alert_compleanni: 'Compleanni maison',
    template_rapidi: 'Testi pronti',
    firma_digitale: 'Firma digitale',
    qr_code: 'Codice QR sui PDF',
    ai_moduli: 'Intelligenza artificiale nei moduli (scrive e migliora il testo)',
  },
  // Permessi di MODIFICA: chi non è abilitato vede comunque i dati in sola lettura.
  // Default: solo admin. "Operatori selezionati" = es. l'operatore HR.
  permessi: {
    gestione_punti: 'Punti e premi · assegnare/registrare incentivi',
    gestione_impiego: 'Impiego · assegnare Jolly / Fisso ai collaboratori (es. supervisor)',
    gestione_categorie: 'Categorie · assegnare la categoria professionale 5ª–1ª (es. HR)',
    vista_categorie: 'Categorie · vedere la categoria dei collaboratori (badge in scheda, matrice e PDF)',
    gestione_competenze: 'Competenze · certificare le spunte in matrice',
    gestione_valutazioni: 'Valutazioni · inserire e importare schede',
    gestione_formazioni: 'Formazioni · registrare sessioni formative svolte (es. supervisor)',
    gestione_piano: 'Piano di lavoro · modificare la griglia turni del mese (es. supervisor)',
    piano_auto_genera:
      'Piano · PREPARARE IL MESE (BOZZA): prepara il mese, migliora la bozza, prepara con il motore avanzato, copri i buchi con altri settori, sistema le ore, controlla le regole, svuota il mese (celle non protette)',
    piano_auto_vacanze:
      'Piano · VACANZE E CGF AUTOMATICI: importa il file vacanze, applica le vacanze del mese al piano, assegna i CGF del mese (la V di una persona dagli Avvisi resta libera)',
    piano_auto_import:
      'Piano · Importare da file: importa il piano da Excel, il fabbisogno da Excel e il file della timbratrice (copiare, incollare ed esportare restano liberi)',
    piano_formazioni:
      'Piano · PIANIFICARE FORMAZIONI: nuova formazione, proposte di cambi e applica, annulla, segna svolta (con certificazione della competenza), formatori e modelli',
    piano_fabbisogno:
      'Piano · MODIFICARE IL FABBISOGNO: le celle del fabbisogno (persone necessarie per turno), incolla, copia dal mese precedente, import e svuota (il fabbisogno lo vedono tutti)',
    piano_auto_cancella:
      'Piano · CANCELLAZIONI DI MASSA: cancella il piano intero (anche le celle protette), elimina tutte le vacanze, svuota il fabbisogno del mese, togli i mesi dei disattivati',
    gestione_regole:
      'Regole del piano · vedere e modificare le regole (riposo minimo, giorni consecutivi, RAP, vacanze)',
    gestione_festivi: 'Festivi e CGF · gestire il calendario dei giorni festivi e i recuperi',
    sblocco_piano_chiuso:
      'Giorni chiusi · sbloccare un giorno passato del piano per correggerlo (con motivo obbligatorio, tracciato nel registro)',
    vista_malattie_pct:
      'Andamento delle malattie · percentuali per giorno della settimana, avviso Lunedì/Venerdì e confronto con la media del team nella scheda collaboratore (analisi riservata, richiesta HR)',
    gestione_corsi: 'Corsi · pianificare corsi nel piano: data, orario e partecipanti (es. supervisor)',
    gestione_briefing:
      'Briefing · compilare e modificare il foglio del giorno e le pause (senza toccare la griglia turni)',
    storico_hr:
      'Storico HR · VEDERE: contratto, anzianità, giubilei, congedi, allegati, costo errori, malattie e percorso disciplinare nella scheda (sezione riservata)',
    storico_hr_modifica:
      'Storico HR · MODIFICARE: inizio e fine contratto, data di nascita, giubilei, congedi non pagati (es. HR)',
    vista_valutazioni: 'Valutazioni · VEDERE le valutazioni annuali (chi le gestisce le vede comunque)',
  },
  // Schede del PIANO: chi le VEDE. Default 'tutti'; 'nascosto' le toglie dal
  // menu, 'operatori selezionati' le mostra solo a quei nomi. L'admin vede
  // sempre tutto. La separazione per settore resta quella dei dati: ogni
  // operatore lavora comunque solo sui collaboratori del suo settore.
  piano_schede: {
    ptab_calendario: 'Piano · Calendario',
    ptab_briefing: 'Piano · Briefing',
    ptab_avvisi: 'Piano · Avvisi (ore settimanali oltre il massimo, regole del mese)',
    ptab_crediti: 'Piano · Crediti (vacanze, CGF, saldo, recupero)',
    ptab_congedi: 'Piano · Congedi non pagati (chi, quando, quanti giorni, effetti)',
    ptab_vacanze: 'Piano · Vacanze',
    ptab_saldo: 'Piano · Saldo',
    ptab_recupero: 'Piano · Recupero ore',
    ptab_timbrature: 'Piano · Timbrature',
    ptab_statistiche: 'Piano · Statistiche',
    ptab_organico: 'Piano · Organico (analisi del personale necessario, suggerimenti, rapporto per la Direzione)',
    ptab_formazioni: 'Piano · Formazioni (pianificate, svolte, storico di ognuno)',
    ptab_benessere: 'Piano · Benessere',
    ptab_storico: 'Piano · Storico',
    ptab_cambi: 'Piano · Cambi turno (fogli archiviati)',
    ptab_formulari: 'Piano · Formulari',
    ptab_turni: 'Piano · Turni',
    ptab_regole: 'Piano · Regole',
    ptab_festivi: 'Piano · Festivi',
    ptab_impostazioni: 'Piano · Impostazioni',
    ptab_guida: 'Piano · Guida',
  },
  // Schede del PIANO: chi le puo' MODIFICARE, in aggiunta ai permessi che gia'
  // esistono (gestione piano, regole, festivi...). Default 'tutti' = nessuna
  // restrizione in piu'; restringendo, la scheda per gli altri resta in sola
  // lettura. Solo le schede dove si modifica qualcosa.
  piano_modifica: {
    ptabmod_calendario: 'Piano · Calendario (modifica turni)',
    ptabmod_briefing: 'Piano · Briefing (compilazione)',
    ptabmod_vacanze: 'Piano · Vacanze (import e applica)',
    ptabmod_saldo: 'Piano · Saldo (ore reali del mese)',
    ptabmod_recupero: 'Piano · Recupero ore (scostamenti)',
    ptabmod_timbrature: 'Piano · Timbrature (inserimento)',
    ptabmod_turni: 'Piano · Turni (durate e orari)',
    ptabmod_regole: 'Piano · Regole (valori)',
    ptabmod_festivi: 'Piano · Festivi (calendario e festività)',
    ptabmod_impostazioni: 'Piano · Impostazioni (preferenze e mappature)',
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
// v356: le azioni automatiche del piano divise in quattro permessi. Finche una
// voce nuova non e salvata in Visibilita vale il permesso unico di prima
// (piano_azioni_auto: Responsabile e Sostituto). Stessa regola nel database
// (migrazione 20260891).
const PIANO_AUTO_EREDITATI = [
  'piano_auto_genera',
  'piano_auto_vacanze',
  'piano_auto_import',
  'piano_auto_cancella',
  'piano_fabbisogno',
  'piano_formazioni',
];
function _visEreditata(key, nome) {
  const v = visibilitaConfig.piano_azioni_auto || 'admin';
  let ha = false;
  if (v === 'tutti') ha = true;
  else if (typeof v === 'object' && v.tipo === 'selezionati') ha = !!(v.operatori && v.operatori.includes(nome));
  return ha;
}
function puoModificare(key) {
  if (isAdmin()) return true;
  if (_inRepartoExtra() && !_extraPuoModificare()) return false; // extra in sola lettura
  if (visibilitaConfig[key] == null && PIANO_AUTO_EREDITATI.includes(key)) return _visEreditata(key, getOperatore());
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
  const curTipo = typeof v === 'object' ? 'selezionati' : v || 'tutti';
  const opzioni = [
    ['tutti', 'Tutti'],
    ['admin', 'Solo admin'],
    ['selezionati', 'Operatori selezionati'],
    ['nascosto', 'Nascosto'],
  ];
  let html =
    '<select onchange="cambiaVisibilita(\'' +
    k +
    '\',this.value)" aria-label="Chi">' +
    opzioni
      .map(
        ([opt, label]) =>
          '<option value="' + opt + '"' + (curTipo === opt ? ' selected' : '') + '>' + label + '</option>',
      )
      .join('') +
    '</select>';
  // Operatori (visibili solo con "Operatori selezionati")
  const selOps = typeof v === 'object' && v.operatori ? v.operatori : [];
  html +=
    '<div id="vis-ops-' +
    k +
    '" class="vis-ops" style="display:' +
    (curTipo === 'selezionati' ? 'flex' : 'none') +
    '">';
  opList.forEach((nome) => {
    html +=
      '<label><input type="checkbox" value="' +
      escP(nome) +
      '"' +
      (selOps.includes(nome) ? ' checked' : '') +
      ' onchange="aggiornaVisOps(\'' +
      k +
      '\')"> ' +
      escP(nome) +
      '</label>';
  });
  if (!opList.length)
    html += '<span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Nessun operatore creato</span>';
  html += '</div>';
  return html;
}
// ---------------------------------------------------------------------------
// PROFILI · le cinque figure del documento "Profili e permessi"
// Ogni voce dice cosa fa quel profilo: 'M' modifica, 'V' vede in sola lettura,
// '-' non la vede. Assegnando un profilo a un operatore e premendo "Applica i
// profili" tutte le righe qui sotto (Visibilita e permessi) vengono riscritte
// da sole: e' la stessa tabella firmata su carta, tradotta nel programma.
// L'admin vede sempre tutto e non e' toccato da questa tabella.
// ---------------------------------------------------------------------------
const PROFILI = {
  direzione: 'Direzione',
  resp: 'Responsabile FoBoSlot',
  sost: 'Sostituto Responsabile',
  sup: 'Supervisor',
  hr: 'HR',
};
const PROFILI_ORDINE = ['direzione', 'resp', 'sost', 'sup', 'hr'];
// chiave voce -> [Direzione, Resp, Sost, SUP, HR]
const MATRICE_PROFILI = {
  // 1 - Pagine del Diario
  rapporto: ['V', 'M', 'M', 'M', '-'],
  note_collega: ['V', 'V', 'M', 'M', '-'],
  statistiche: ['V', 'M', 'M', 'M', 'V'],
  moduli: ['V', 'M', 'M', 'M', 'V'],
  formazione: ['V', 'M', 'M', 'V', 'V'],
  piano: ['V', 'M', 'M', 'M', 'M'],
  assistente: ['M', 'M', 'M', 'M', 'M'],
  consegna: ['-', 'M', 'M', 'M', '-'],
  promemoria: ['V', 'M', 'M', 'M', 'V'],
  maison: ['V', 'M', 'M', 'M', '-'],
  inventario: ['V', 'M', 'M', 'M', 'M'],
  registro: ['-', '-', '-', '-', '-'],
  // 2 - Funzioni
  ricerca_globale: ['M', 'M', 'M', 'M', 'M'],
  alert_cassa: ['-', 'M', 'M', 'M', '-'],
  alert_rischio: ['-', 'M', 'M', 'M', '-'],
  alert_compleanni: ['V', 'M', 'M', 'M', 'V'],
  template_rapidi: ['-', 'M', 'M', 'M', '-'],
  firma_digitale: ['-', 'M', 'M', 'M', '-'],
  qr_code: ['V', 'M', 'M', 'V', 'V'],
  ai_moduli: ['-', 'M', 'M', 'M', '-'],
  // 3 - Piano di lavoro: le quindici schede (chi la vede)
  ptab_calendario: ['V', 'M', 'M', 'M', 'V'],
  ptab_briefing: ['V', 'M', 'M', 'M', '-'],
  ptab_avvisi: ['V', 'M', 'M', 'V', 'M'],
  ptab_crediti: ['V', 'M', 'M', 'V', 'M'],
  ptab_congedi: ['V', 'M', 'M', 'V', 'M'],
  ptab_vacanze: ['V', 'M', 'M', 'V', 'V'],
  ptab_saldo: ['V', 'M', 'M', 'V', 'M'],
  ptab_recupero: ['-', 'M', 'M', 'V', '-'],
  ptab_timbrature: ['V', 'M', 'M', 'M', 'M'],
  ptab_statistiche: ['V', 'M', 'M', 'V', 'V'],
  ptab_formazioni: ['V', 'M', 'M', 'V', 'V'],
  ptab_organico: ['V', 'V', 'V', '-', 'V'],
  ptab_benessere: ['V', 'M', 'M', 'V', 'V'],
  ptab_storico: ['-', 'M', 'M', 'V', '-'],
  ptab_formulari: ['V', 'M', 'M', 'V', 'V'],
  ptab_turni: ['V', 'M', 'M', 'V', 'M'],
  ptab_regole: ['V', 'M', 'M', 'V', 'M'],
  ptab_festivi: ['V', 'M', 'M', 'V', 'M'],
  ptab_impostazioni: ['-', 'M', 'M', 'V', 'M'],
  ptab_guida: ['V', 'V', 'V', 'V', 'V'],
  // 3 - le stesse schede, ma chi le puo' MODIFICARE (solo le M qui sopra)
  ptabmod_calendario: ['V', 'M', 'M', 'M', 'V'],
  ptabmod_briefing: ['V', 'M', 'M', 'M', '-'],
  ptabmod_vacanze: ['V', 'M', 'M', 'V', 'V'],
  ptabmod_saldo: ['V', 'M', 'M', 'V', 'M'],
  ptabmod_recupero: ['-', 'M', 'M', 'V', '-'],
  ptabmod_timbrature: ['V', 'M', 'M', 'M', 'M'],
  ptabmod_turni: ['V', 'M', 'M', 'V', 'M'],
  ptabmod_regole: ['V', 'M', 'M', 'V', 'M'],
  ptabmod_festivi: ['V', 'M', 'M', 'V', 'M'],
  ptabmod_impostazioni: ['-', 'M', 'M', 'V', 'M'],
  // 4 - Permessi delegabili
  gestione_punti: ['V', 'M', 'M', 'V', 'M'],
  gestione_impiego: ['V', 'M', 'M', 'V', 'M'],
  gestione_categorie: ['V', 'M', 'M', '-', '-'],
  vista_categorie: ['V', 'V', 'V', '-', '-'],
  gestione_competenze: ['V', 'M', 'M', 'V', 'V'],
  gestione_valutazioni: ['V', 'M', 'M', 'V', 'V'],
  gestione_formazioni: ['V', 'M', 'M', 'V', 'V'],
  gestione_piano: ['V', 'M', 'M', 'M', 'V'],
  piano_auto_genera: ['-', 'M', 'M', '-', '-'],
  piano_auto_vacanze: ['-', 'M', 'M', '-', '-'],
  piano_auto_import: ['-', 'M', 'M', '-', '-'],
  piano_auto_cancella: ['-', 'M', 'M', '-', '-'],
  piano_fabbisogno: ['-', 'M', 'M', '-', '-'],
  piano_formazioni: ['-', 'M', 'M', '-', '-'],
  gestione_corsi: ['V', 'M', 'M', 'M', 'M'],
  gestione_briefing: ['-', 'M', 'M', 'M', '-'],
  storico_hr: ['V', 'V', 'V', 'V', 'M'],
  storico_hr_modifica: ['-', '-', '-', '-', 'M'],
  vista_valutazioni: ['V', 'V', 'V', '-', 'V'],
  gestione_regole: ['-', 'M', 'M', '-', 'M'],
  gestione_festivi: ['V', 'M', 'M', 'V', 'M'],
  sblocco_piano_chiuso: ['V', 'M', 'M', 'V', 'M'],
  vista_malattie_pct: ['V', 'V', 'V', '-', 'V'],
};
// Le voci dove basta la V per essere abilitati: sono viste riservate, non
// azioni di modifica. Tutte le altre "gestione_*" richiedono la M.
const PROFILI_VOCI_DI_SOLA_VISTA = ['vista_categorie', 'vista_malattie_pct', 'storico_hr', 'vista_valutazioni'];

// Un profilo concede la voce? Le pagine, le funzioni e le schede del Piano si
// aprono sia con V sia con M; i permessi di modifica solo con M, tranne le
// viste riservate qui sopra.
// ---------------------------------------------------------------------------
// PROFILI PERSONALIZZATI · figure in piu (es. Compliance, Segretariato) create
// dall admin in Visibilita e permessi, impostazione profili_custom:
//   { id: { nome, voci: { chiave: 'M' | 'V' | '-' } } }
// I cinque profili del documento restano fissi; un profilo personalizzato si
// usa esattamente come loro (assegnazione, Applica i profili, scheda stampata).
// ---------------------------------------------------------------------------
function _profiliCustom() {
  return window._profiliCustom || {};
}
async function _caricaProfiliCustom() {
  if (window._profiliCustom != null) return;
  window._profiliCustom = {};
  try {
    const v = await getImp('profili_custom');
    if (v) window._profiliCustom = JSON.parse(v) || {};
  } catch (e) {}
}
function _profiloNome(p) {
  return PROFILI[p] || (_profiliCustom()[p] || {}).nome || '';
}
function _profiliTuttiIds() {
  return PROFILI_ORDINE.concat(
    Object.keys(_profiliCustom()).sort((a, b) => _profiloNome(a).localeCompare(_profiloNome(b))),
  );
}
// valore 'M' | 'V' | '-' della voce per un profilo (fisso o personalizzato)
function _profiloVoce(key, prof) {
  if (PROFILI[prof]) {
    const riga = MATRICE_PROFILI[key];
    if (!riga) return null;
    return riga[PROFILI_ORDINE.indexOf(prof)];
  }
  const c = _profiliCustom()[prof];
  if (!c) return null;
  return (c.voci || {})[key] || '-';
}
function _profiloConcede(key, prof) {
  const val = _profiloVoce(key, prof);
  if (val == null) return null;
  if (val === '-') return false;
  if (val === 'M') return true;
  const soloModifica =
    (VIS_ITEMS.piano_modifica && VIS_ITEMS.piano_modifica[key]) ||
    (VIS_ITEMS.permessi && VIS_ITEMS.permessi[key] && PROFILI_VOCI_DI_SOLA_VISTA.indexOf(key) < 0);
  return !soloModifica;
}
// Con la configurazione di oggi, questo operatore ha accesso alla voce?
// Serve per non toccare chi non ha un profilo assegnato.
function _visHaAccessoOggi(key, nome) {
  if (visibilitaConfig[key] == null && PIANO_AUTO_EREDITATI.includes(key)) return _visEreditata(key, nome);
  const permesso = !!(VIS_ITEMS.permessi && VIS_ITEMS.permessi[key]);
  const v = visibilitaConfig[key] != null ? visibilitaConfig[key] : permesso ? 'admin' : 'tutti';
  if (v === 'tutti') return true;
  if (v === 'admin' || v === 'nascosto') return false;
  if (typeof v === 'object' && v.tipo === 'selezionati') return !!(v.operatori && v.operatori.indexOf(nome) >= 0);
  return true;
}
function _profiloDi(nome) {
  const p = profiliOperatori && profiliOperatori[nome];
  return _profiloNome(p) ? p : '';
}
async function cambiaProfiloOperatore(nome, prof) {
  if (prof && !_profiloNome(prof)) return;
  if (prof) profiliOperatori[nome] = prof;
  else delete profiliOperatori[nome];
  if (!(await salvaImp('profili_operatori', JSON.stringify(profiliOperatori)))) return;
  renderVisibilitaUI();
}
// Nucleo: riscrive ogni voce di Visibilita applicando il profilo SOLO agli
// operatori indicati; tutti gli altri conservano l accesso che hanno oggi.
async function _applicaProfiliA(nomi) {
  const tutti = operatoriAuthCache.map((o) => o.nome);
  const daProfilo = (nomi || []).filter((n) => _profiloDi(n));
  const altri = tutti.filter((n) => daProfilo.indexOf(n) < 0);
  Object.keys(MATRICE_PROFILI).forEach((key) => {
    const lista = [];
    altri.forEach((n) => {
      if (_visHaAccessoOggi(key, n)) lista.push(n);
    });
    daProfilo.forEach((n) => {
      if (_profiloConcede(key, _profiloDi(n))) lista.push(n);
    });
    if (!lista.length) visibilitaConfig[key] = 'admin';
    else if (lista.length === tutti.length) visibilitaConfig[key] = 'tutti';
    else visibilitaConfig[key] = { tipo: 'selezionati', operatori: lista.slice().sort() };
  });
  if (!(await salvaImp('visibilita', JSON.stringify(visibilitaConfig)))) return false;
  applicaVisibilita();
  return true;
}
// Riscrive Visibilita e permessi partendo dai profili assegnati. Chi non ha un
// profilo resta esattamente com'e' adesso: si tocca solo chi e' stato deciso.
async function applicaProfili() {
  const tutti = operatoriAuthCache.map((o) => o.nome);
  const conProfilo = tutti.filter((n) => _profiloDi(n));
  if (!conProfilo.length) {
    toast('Assegna prima un profilo ad almeno un operatore');
    return;
  }
  const senzaProfilo = tutti.filter((n) => !_profiloDi(n));
  const elenco = conProfilo.map((n) => n + ' = ' + _profiloNome(_profiloDi(n))).join('\n');
  const ok = await chiediConferma(
    'Applicare i profili?\n\n' +
      elenco +
      '\n\nVengono riscritte tutte le righe di Visibilità e permessi per questi ' +
      conProfilo.length +
      ' operatori.' +
      (senzaProfilo.length ? ' Gli altri ' + senzaProfilo.length + ' restano come sono adesso.' : ''),
  );
  if (!ok) return;
  if (!(await _applicaProfiliA(conProfilo))) return;
  renderVisibilitaUI();
  toast('Profili applicati a ' + conProfilo.length + (conProfilo.length === 1 ? ' operatore' : ' operatori'));
  if (typeof logAzione === 'function') logAzione('Profili permessi applicati', elenco.replace(/\n/g, '; '));
}
function renderProfiliUI(opList) {
  let html = '<div class="vis-gruppo">Profili</div>';
  html +=
    '<p class="sez-desc" style="margin-bottom:10px">Assegna a ogni operatore la sua figura, poi premi "Applica i profili": tutte le righe qui sotto vengono impostate da sole come nel documento firmato. Chi resta senza profilo non viene toccato. Dopo, si può sempre correggere la singola riga a mano.</p>';
  html += '<div style="margin-bottom:12px">';
  opList.forEach((nome) => {
    html +=
      '<div class="prof-riga"><span class="vis-nome">' +
      escP(nome) +
      '</span><select onchange="cambiaProfiloOperatore(\'' +
      _jsArg(nome) +
      '\', this.value)"><option value="">Nessun profilo</option>';
    _profiliTuttiIds().forEach((p) => {
      html +=
        '<option value="' +
        p +
        '"' +
        (_profiloDi(nome) === p ? ' selected' : '') +
        '>' +
        escP(_profiloNome(p)) +
        (PROFILI[p] ? '' : ' (personalizzato)') +
        '</option>';
    });
    html += '</select></div>';
  });
  if (!opList.length)
    html += '<span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">Nessun operatore creato</span>';
  html += '</div>';
  html +=
    '<button class="btn-add-tipo" onclick="applicaProfili()" style="margin-bottom:8px">Applica i profili</button>';
  html += _profiliCustomHtml();
  return html;
}
// ---- profili personalizzati: elenco, creazione, tabella voce per voce ----
const _PROF_VAL_LBL = { M: 'Modifica', V: 'Vede', '-': 'No' };
function _profCustomOpzioni(gruppo, key) {
  // dove la V ha un senso: pagine, funzioni, schede del Piano e le viste riservate
  if (gruppo === 'pagine' || gruppo === 'funzioni' || gruppo === 'piano_schede') return ['M', 'V', '-'];
  if (gruppo === 'permessi' && PROFILI_VOCI_DI_SOLA_VISTA.indexOf(key) >= 0) return ['M', 'V', '-'];
  return ['M', '-'];
}
function _profiliCustomHtml() {
  const cust = _profiliCustom();
  const ids = Object.keys(cust).sort((a, b) => _profiloNome(a).localeCompare(_profiloNome(b)));
  let h = '<div class="vis-gruppo">Profili personalizzati</div>';
  h +=
    '<p class="sez-desc" style="margin-bottom:10px">I cinque profili del documento firmato sono fissi. Qui si creano altre figure (per esempio Compliance o Segretariato) partendo da una copia di un profilo esistente e decidendo voce per voce cosa vede e cosa modifica. Poi si assegnano agli operatori come gli altri.</p>';
  h += '<div class="tipo-list" style="margin-bottom:10px">';
  ids.forEach((id) => {
    const voci = cust[id].voci || {};
    const nM = Object.values(voci).filter((v) => v === 'M').length;
    const nV = Object.values(voci).filter((v) => v === 'V').length;
    const usato = Object.keys(profiliOperatori || {}).filter((n) => profiliOperatori[n] === id);
    h +=
      '<div class="tipo-item"><span class="tipo-item-name">' +
      escP(cust[id].nome) +
      '</span><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
      nM +
      ' voci in modifica · ' +
      nV +
      ' in sola vista' +
      (usato.length ? ' · assegnato a ' + escP(usato.join(', ')) : '') +
      '</span><span style="flex:1"></span><button class="btn-del-tipo" onclick="profCustomModifica(\'' +
      id +
      '\')">Modifica</button><button class="btn-del-tipo pericolo" style="margin-left:4px" onclick="profCustomElimina(\'' +
      id +
      '\')">Elimina</button></div>';
  });
  if (!ids.length)
    h += '<p style="color:var(--muted);font-size:var(--fs-md,.875rem);margin:0">Nessun profilo personalizzato.</p>';
  h += '</div>';
  h +=
    '<div class="add-tipo-row sez-form"><div class="field"><label>Nome del nuovo profilo</label><input type="text" id="prof-nuovo-nome" placeholder="es. Compliance"></div><div class="field"><label>Parti da una copia di</label><select id="prof-nuovo-base">' +
    _profiliTuttiIds()
      .map((p) => '<option value="' + p + '">' + escP(_profiloNome(p)) + '</option>')
      .join('') +
    '<option value="">Tutto a No</option></select></div><button class="btn-add-tipo" onclick="profCustomCrea()">Crea e apri la tabella</button></div>';
  h += '<div id="prof-editor">' + (window._profCustomEdit ? _profCustomEditorHtml() : '') + '</div>';
  return h;
}
function _profCustomEditorHtml() {
  const ed = window._profCustomEdit;
  if (!ed) return '';
  const gruppi = [
    ['pagine', 'Pagine'],
    ['funzioni', 'Funzioni'],
    ['piano_schede', 'Piano · schede visibili'],
    ['piano_modifica', 'Piano · schede modificabili'],
    ['permessi', 'Permessi di modifica'],
  ];
  let h =
    '<div class="sez-box" style="margin-top:12px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><b>' +
    (ed.id ? 'Modifica profilo' : 'Nuovo profilo') +
    '</b><input type="text" id="prof-edit-nome" value="' +
    escP(ed.nome) +
    '" style="padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);min-width:220px"><span style="flex:1"></span>' +
    '<button class="btn-add-tipo" onclick="profCustomSalva()">Salva profilo</button><button class="btn-secondario" onclick="profCustomAnnulla()">Annulla</button></div>' +
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:var(--fs-md,.875rem)"><span>Parti da una copia di:</span><select id="prof-edit-base" style="padding:5px 8px"><option value="">scegli</option><optgroup label="Profilo">' +
    _profiliTuttiIds()
      .filter((p) => p !== ed.id)
      .map((p) => '<option value="prof:' + p + '">' + escP(_profiloNome(p)) + '</option>')
      .join('') +
    '</optgroup><optgroup label="Permessi reali di un operatore">' +
    operatoriAuthCache
      .map((o) => o.nome)
      .sort()
      .map((o) => '<option value="op:' + escP(o) + '">Come ' + escP(o) + '</option>')
      .join('') +
    '</optgroup></select><button class="btn-secondario" onclick="profCustomPrecompila()">Riempi la tabella</button><span style="color:var(--muted)">Riempie le caselle qui sotto; poi cambi quello che vuoi e salvi.</span></div>' +
    '<p class="sez-desc" style="margin-bottom:8px">Modifica = può cambiare; Vede = solo lettura; No = non la vede. Le voci di modifica del Piano e i permessi non hanno la sola vista, tranne le viste riservate.</p>';
  gruppi.forEach(([g, titolo]) => {
    const voci = VIS_ITEMS[g] || {};
    h +=
      '<div class="vis-gruppo">' +
      titolo +
      '</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 16px">';
    Object.entries(voci).forEach(([k, label]) => {
      const cur = ed.voci[k] || '-';
      h +=
        '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;background:var(--paper);border:1px solid var(--line);border-radius:3px;font-size:var(--fs-md,.875rem)"><span>' +
        label +
        '</span><select class="prof-edit-voce" data-k="' +
        k +
        '" style="padding:3px 6px">' +
        _profCustomOpzioni(g, k)
          .map(
            (v) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + _PROF_VAL_LBL[v] + '</option>',
          )
          .join('') +
        '</select></label>';
    });
    h += '</div>';
  });
  h += '</div>';
  return h;
}
// permessi REALI di un operatore tradotti in valori della tabella
function _profCustomVociDaOperatore(nome) {
  const voci = {};
  Object.keys(MATRICE_PROFILI).forEach((k) => {
    if (!_visHaAccessoOggi(k, nome)) voci[k] = '-';
    else voci[k] = PROFILI_VOCI_DI_SOLA_VISTA.indexOf(k) >= 0 ? 'V' : 'M';
  });
  return voci;
}
function profCustomPrecompila() {
  const val = (document.getElementById('prof-edit-base') || {}).value || '';
  if (!val) {
    toast('Scegli da cosa partire');
    return;
  }
  const voci =
    val.indexOf('op:') === 0 ? _profCustomVociDaOperatore(val.substring(3)) : _profCustomVociDa(val.substring(5));
  let n = 0;
  document.querySelectorAll('.prof-edit-voce').forEach((sel) => {
    const v = voci[sel.dataset.k] || '-';
    const ok = [...sel.options].some((o) => o.value === v);
    sel.value = ok ? v : v === 'V' ? 'M' : '-';
    n++;
  });
  toast('Tabella riempita (' + n + ' voci): ora cambia quello che vuoi e salva');
}
function _profCustomVociDa(base) {
  const voci = {};
  Object.keys(MATRICE_PROFILI).forEach((k) => {
    voci[k] = base ? _profiloVoce(k, base) || '-' : '-';
  });
  return voci;
}
function profCustomCrea() {
  if (!isAdmin()) return;
  const nome = ((document.getElementById('prof-nuovo-nome') || {}).value || '').trim();
  const base = (document.getElementById('prof-nuovo-base') || {}).value || '';
  if (!nome) {
    toast('Scrivi il nome del profilo');
    return;
  }
  if (_profiliTuttiIds().some((p) => _profiloNome(p).toLowerCase() === nome.toLowerCase())) {
    toast('Esiste già un profilo con questo nome');
    return;
  }
  window._profCustomEdit = { id: '', nome: nome, voci: _profCustomVociDa(base) };
  renderVisibilitaUI();
  setTimeout(() => {
    const el = document.getElementById('prof-editor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}
function profCustomModifica(id) {
  const c = _profiliCustom()[id];
  if (!c) return;
  window._profCustomEdit = { id: id, nome: c.nome, voci: Object.assign(_profCustomVociDa(''), c.voci || {}) };
  renderVisibilitaUI();
}
function profCustomAnnulla() {
  window._profCustomEdit = null;
  window._profCustomAssegnaA = null;
  renderVisibilitaUI();
}
async function _salvaProfiliCustom(obj) {
  if (!(await salvaImp('profili_custom', JSON.stringify(obj)))) return false;
  window._profiliCustom = obj;
  return true;
}
async function profCustomSalva() {
  if (!isAdmin()) return;
  const ed = window._profCustomEdit;
  if (!ed) return;
  const nome = ((document.getElementById('prof-edit-nome') || {}).value || '').trim();
  if (!nome) {
    toast('Scrivi il nome del profilo');
    return;
  }
  const doppio = _profiliTuttiIds().some((p) => p !== ed.id && _profiloNome(p).toLowerCase() === nome.toLowerCase());
  if (doppio) {
    toast('Esiste già un profilo con questo nome');
    return;
  }
  const voci = {};
  document.querySelectorAll('.prof-edit-voce').forEach((sel) => (voci[sel.dataset.k] = sel.value));
  if (
    !Object.values(voci).some((v) => v !== '-') &&
    !(await chiediConferma('Il profilo non concede nessuna voce: chi lo riceve non vede nulla. Salvare lo stesso?'))
  )
    return;
  const id =
    ed.id ||
    'p_' +
      nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
      '_' +
      Date.now().toString(36);
  const obj = Object.assign({}, _profiliCustom());
  obj[id] = { nome: nome, voci: voci };
  if (!(await _salvaProfiliCustom(obj))) return;
  logAzione('Profili personalizzati', (ed.id ? 'modificato ' : 'creato ') + nome);
  const assegnaA = window._profCustomAssegnaA;
  window._profCustomAssegnaA = null;
  if (assegnaA && operatoriAuthCache.some((o) => o.nome === assegnaA)) {
    profiliOperatori[assegnaA] = id;
    await salvaImp('profili_operatori', JSON.stringify(profiliOperatori));
    await _applicaProfiliA([assegnaA]);
    toast('Profilo "' + nome + '" salvato e applicato a ' + assegnaA);
  } else toast('Profilo "' + nome + '" salvato. Assegnalo agli operatori e premi "Applica i profili"');
  window._profCustomEdit = null;
  renderVisibilitaUI();
  renderOperatoriUI();
}
async function profCustomElimina(id) {
  if (!isAdmin()) return;
  const c = _profiliCustom()[id];
  if (!c) return;
  const usato = Object.keys(profiliOperatori || {}).filter((n) => profiliOperatori[n] === id);
  const msg =
    'Eliminare il profilo "' +
    c.nome +
    '"?' +
    (usato.length
      ? '\n\nE assegnato a: ' +
        usato.join(', ') +
        '. Questi operatori restano senza profilo; i loro permessi attuali non cambiano finché non premi "Applica i profili".'
      : '');
  if (!(await chiediConferma(msg))) return;
  const obj = Object.assign({}, _profiliCustom());
  delete obj[id];
  if (!(await _salvaProfiliCustom(obj))) return;
  if (usato.length) {
    usato.forEach((n) => delete profiliOperatori[n]);
    await salvaImp('profili_operatori', JSON.stringify(profiliOperatori));
  }
  logAzione('Profili personalizzati', 'eliminato ' + c.nome);
  toast('Profilo eliminato');
  renderVisibilitaUI();
}
// RESPONSABILE DI SETTORE NEI MODULI
// Allineamenti, RDI e apprezzamenti propongono un nome gia' scritto nel campo
// "Resp. Settore". Prima era fisso dentro il programma, quindi Tavoli, Valet e
// Cleaning si trovavano davanti il responsabile degli Slot e bisognava
// correggerlo a mano ogni volta.
function renderModuliRespUI() {
  const el = document.getElementById('moduli-resp-list');
  if (!el) return;
  let html = '';
  getReparti().forEach((r) => {
    const v =
      (moduliRespCfg && moduliRespCfg[r.key]) ||
      (typeof MODULI_RESP_DEFAULT !== 'undefined' ? MODULI_RESP_DEFAULT[r.key] || '' : '');
    html +=
      '<div class="tipo-item"><div class="tipo-item-name" style="min-width:120px">' +
      escP(r.label) +
      '</div><input type="text" value="' +
      escP(v) +
      '" placeholder="Es: Sig.ra Cognome Nome (vuoto = da compilare ogni volta)" onchange="salvaModuloResp(\'' +
      r.key +
      '\',this.value)" style="flex:1"></div>';
  });
  el.innerHTML = html;
}
async function salvaModuloResp(rep, val) {
  if (!isAdmin()) return;
  const cfg = Object.assign({}, moduliRespCfg || {});
  const prima = cfg[rep] || '';
  const v = String(val || '').trim();
  if (v) cfg[rep] = v;
  else delete cfg[rep];
  moduliRespCfg = cfg;
  if (!(await salvaImp('moduli_responsabili', JSON.stringify(cfg)))) return;
  logAzione('Moduli: responsabile di settore', repartoLabel(rep) + ': ' + (prima || 'vuoto') + ' → ' + (v || 'vuoto'));
  toast('Salvato · ' + repartoLabel(rep) + ': ' + (v || 'nessun nome proposto'));
}
async function renderVisibilitaUI() {
  const el = document.getElementById('visibilita-list');
  if (!el) return;
  await _caricaProfiliCustom();
  const opList = operatoriAuthCache.map((o) => o.nome).sort();
  let html = renderProfiliUI(opList);
  html += '<div class="vis-gruppo">Pagine</div>';
  Object.entries(VIS_ITEMS.pagine).forEach(([k, label]) => {
    html += '<div class="vis-riga"><span class="vis-nome">' + label + '</span>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  html += '<div class="vis-gruppo">Funzioni</div>';
  Object.entries(VIS_ITEMS.funzioni).forEach(([k, label]) => {
    html += '<div class="vis-riga"><span class="vis-nome">' + label + '</span>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  html += '<div class="vis-gruppo">Piano &middot; schede visibili</div>';
  html +=
    '<p class="sez-desc" style="margin-bottom:10px">Chi vede ogni scheda del Piano. "Nascosto" la toglie dal menu; con "Operatori selezionati" la vedono solo quei nomi. L\'admin vede sempre tutto, e ogni operatore lavora comunque solo sui collaboratori del suo settore.</p>';
  Object.entries(VIS_ITEMS.piano_schede).forEach(([k, label]) => {
    html += '<div class="vis-riga"><span class="vis-nome">' + label + '</span>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  html += '<div class="vis-gruppo">Piano &middot; schede modificabili</div>';
  html +=
    '<p class="sez-desc" style="margin-bottom:10px">Restringe la MODIFICA di una scheda senza nasconderla: chi resta fuori la vede in sola lettura. Vale in aggiunta ai permessi qui sotto (chi non ha "Piano di lavoro" non modifica comunque). "Tutti" = nessuna restrizione in più.</p>';
  Object.entries(VIS_ITEMS.piano_modifica).forEach(([k, label]) => {
    html += '<div class="vis-riga"><span class="vis-nome">' + label + '</span>';
    html += _visRadioHtml(k, visGet(k), opList);
    html += '</div>';
  });
  html += '<div class="vis-gruppo">Permessi di modifica</div>';
  html +=
    '<p class="sez-desc" style="margin-bottom:10px">Chi non è abilitato vede comunque punti, premi, categorie, competenze e valutazioni in sola lettura. Usa "Operatori selezionati" per delegare, ad esempio, all\'operatore HR.</p>';
  Object.entries(VIS_ITEMS.permessi).forEach(([k, label]) => {
    html += '<div class="vis-riga"><span class="vis-nome">' + label + '</span>';
    html += _visRadioHtml(k, visibilitaConfig[k] || 'admin', opList);
    html += '</div>';
  });
  el.innerHTML = html;
}
async function cambiaVisibilita(key, val) {
  // il controllo era solo nell'interfaccia: la funzione resta richiamabile dalla console
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
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
  if (!(await salvaImp('visibilita', JSON.stringify(visibilitaConfig)))) return;
  applicaVisibilita();
  toast('Visibilità aggiornata');
}
async function aggiornaVisOps(key) {
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
  const box = document.getElementById('vis-ops-' + key);
  if (!box) return;
  const checked = [...box.querySelectorAll('input[type=checkbox]:checked')].map((cb) => cb.value);
  visibilitaConfig[key] = { tipo: 'selezionati', operatori: checked };
  if (!(await salvaImp('visibilita', JSON.stringify(visibilitaConfig)))) return;
  applicaVisibilita();
}
async function aggiungiOperatoreConPwd() {
  const n = document.getElementById('new-operatore-nome').value.trim(),
    p = document.getElementById('new-operatore-pwd').value,
    p2 = document.getElementById('new-operatore-pwd2').value;
  if (!n) {
    toast('Scrivi il nome del nuovo operatore');
    return;
  }
  // messaggi distinti: "minimo 4 caratteri" con il campo vuoto faceva pensare a
  // una password rifiutata, mentre il campo non era stato compilato
  if (!p) {
    toast('Manca la password: scrivila nel campo Password');
    const el = document.getElementById('new-operatore-pwd');
    if (el) el.focus();
    return;
  }
  if (p.length < 4) {
    toast('La password deve avere almeno 4 caratteri (ne hai scritti ' + p.length + ')');
    return;
  }
  if (!p2) {
    toast('Manca la conferma: ripeti la password nel campo Conferma password');
    const el2 = document.getElementById('new-operatore-pwd2');
    if (el2) el2.focus();
    return;
  }
  if (p !== p2) {
    toast('Le due password non coincidono');
    return;
  }
  if (operatoriAuthCache.find((o) => o.nome.toLowerCase() === n.toLowerCase())) {
    toast('Operatore già esistente');
    return;
  }
  const h = await secureHash(p, n);
  try {
    try {
      await _rpcConEsito('add_operator', {
        p_nome: n,
        p_hash: h,
        p_token: getAdminToken(),
      });
    } catch (e) {
      // l operatore non esiste nel database: niente in memoria, niente "creato"
      toastErrore('Operatore non creato: ' + (e.message || e));
      return;
    }
    operatoriAuthCache.push({ nome: n, ruolo: 'operatore' });
    if (!operatoriSalvati.includes(n)) {
      operatoriSalvati.push(n);
      operatoriSalvati.sort();
      await saveOperatori();
    }
    let rep = document.getElementById('new-operatore-rep').value || 'entrambi';
    const scelta = (document.getElementById('new-operatore-prof') || {}).value || '';
    let esito = '';
    if (scelta.indexOf('copia:') === 0) {
      // stessi accessi di un collega: settore (se non scelto), profilo, accessi extra, voci selezionate
      const src = scelta.substring(6);
      if (rep === 'entrambi' && operatoriRepartoMap[src]) rep = operatoriRepartoMap[src];
      esito = ' · accessi copiati da ' + src;
    }
    operatoriRepartoMap[n] = rep;
    await setImp('operatori_reparto', JSON.stringify(operatoriRepartoMap));
    if (scelta.indexOf('copia:') === 0) await _copiaAccessiDa(scelta.substring(6), n);
    else if (scelta.indexOf('prof:') === 0) {
      const pid = scelta.substring(5);
      if (_profiloNome(pid)) {
        profiliOperatori[n] = pid;
        await salvaImp('profili_operatori', JSON.stringify(profiliOperatori));
        await _applicaProfiliA([n]);
        esito = ' · profilo ' + _profiloNome(pid) + ' applicato';
      }
    }
    logAzione('Operatore creato', n + ' (' + rep + ')' + esito);
    document.getElementById('new-operatore-nome').value = '';
    document.getElementById('new-operatore-pwd').value = '';
    document.getElementById('new-operatore-pwd2').value = '';
    const selP = document.getElementById('new-operatore-prof');
    if (selP) selP.value = '';
    renderOperatoriUI();
    toast('Operatore "' + n + '" creato (' + rep + ')' + esito);
    if (scelta === 'nuovo') {
      // apre subito la tabella del nuovo profilo: al salvataggio viene assegnato a questo operatore
      window._profCustomEdit = { id: '', nome: '', voci: _profCustomVociDa('') };
      window._profCustomAssegnaA = n;
      await renderVisibilitaUI();
      _settingsVai('visibilita-section');
      setTimeout(() => {
        const el = document.getElementById('prof-editor');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const nm = document.getElementById('prof-edit-nome');
        if (nm) nm.focus();
      }, 400);
      toast('Scrivi il nome del nuovo profilo e scegli le voci: al salvataggio viene assegnato a ' + n, 6000);
    }
  } catch (e) {
    toastErrore('Operatore creato, ma impostazioni non completate: ' + (e.message || e));
  }
}
// Copia da un collega: profilo, accessi extra e presenza nelle voci "Operatori
// selezionati" di Visibilita. Il settore lo decide chi crea l operatore.
async function _copiaAccessiDa(src, dst) {
  if (profiliOperatori[src]) {
    profiliOperatori[dst] = profiliOperatori[src];
    await salvaImp('profili_operatori', JSON.stringify(profiliOperatori));
  }
  const extra = window._operatoriAccessiExtra || {};
  if (extra[src]) {
    extra[dst] = JSON.parse(JSON.stringify(extra[src]));
    window._operatoriAccessiExtra = extra;
    await salvaImp('operatori_accessi_extra', JSON.stringify(extra));
    localStorage.setItem('_cache_operatori_accessi_extra', JSON.stringify(extra));
  }
  let toccate = 0;
  Object.keys(visibilitaConfig).forEach((k) => {
    const v = visibilitaConfig[k];
    if (v && typeof v === 'object' && v.tipo === 'selezionati' && (v.operatori || []).indexOf(src) >= 0) {
      if (v.operatori.indexOf(dst) < 0) v.operatori = v.operatori.concat([dst]).sort();
      toccate++;
    }
  });
  if (toccate && !(await salvaImp('visibilita', JSON.stringify(visibilitaConfig)))) return false;
  applicaVisibilita();
  logAzione('Accessi copiati', dst + ' come ' + src + ' (' + toccate + ' voci)');
  return true;
}
// menu "Posizione e permessi" del nuovo operatore: profili fissi e
// personalizzati, copia da un collega, nuovo profilo
async function _popolaSelectProfiloNuovoOp() {
  const sel = document.getElementById('new-operatore-prof');
  if (!sel) return;
  await _caricaProfiliCustom();
  const cur = sel.value;
  let h = '<option value="">Da impostare dopo</option><optgroup label="Profilo">';
  _profiliTuttiIds().forEach((p) => {
    h +=
      '<option value="prof:' + p + '">' + escP(_profiloNome(p)) + (PROFILI[p] ? '' : ' (personalizzato)') + '</option>';
  });
  h += '<option value="nuovo">Nuovo profilo personalizzato...</option></optgroup>';
  const ops = operatoriAuthCache.map((o) => o.nome).sort();
  if (ops.length) {
    h += '<optgroup label="Stessi accessi di un collega">';
    ops.forEach((o) => {
      h += '<option value="copia:' + escP(o) + '">Come ' + escP(o) + '</option>';
    });
    h += '</optgroup>';
  }
  sel.innerHTML = h;
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
// ---- Accessi extra: modal di configurazione per operatore ----
function apriAccessiExtra(nome) {
  if (!isAdmin()) return;
  const proprio = operatoriRepartoMap[nome] || 'entrambi';
  if (proprio === 'entrambi') {
    toast(nome + ' vede già tutti i settori');
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
    '<h3>Accessi extra · ' +
    escP(nome) +
    '</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:10px">Settore principale: <b>' +
    escP(repartoLabel(proprio)) +
    '</b>. Concedi l\'accesso a sezioni di altri settori: tutte, oppure solo quelle che spunti. Senza "può modificare" l\'accesso è in sola lettura.</p>' +
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
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><b style="min-width:80px;--cat:' +
      repartoColore(r.key) +
      ';color:var(--cat)">' +
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
      '<label style="font-size:var(--fs-sm,.8125rem)"><input type="checkbox" id="ae-scrivi-' +
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
            '<label style="font-size:var(--fs-sm,.8125rem);background:var(--paper2);padding:3px 8px;border-radius:10px;border:1px solid var(--line)"><input type="checkbox" class="ae-pag-' +
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
    _jsArg(nome) +
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
  if (!(await salvaImp('operatori_accessi_extra', JSON.stringify(window._operatoriAccessiExtra)))) return;
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
  if (!(await salvaImp('operatori_reparto', JSON.stringify(operatoriRepartoMap)))) return;
  renderOperatoriUI();
  toast(nome + ' → ' + rep);
}
async function rimuoviOperatore(n) {
  if (!(await chiediConferma('Rimuovere operatore "' + n + '"?'))) return;
  // prima l accesso (la password nel database): se il database rifiuta,
  // l operatore resta com era, in elenco e in memoria, e lo si dice
  try {
    await _rpcConEsito('remove_operator', { p_nome: n, p_token: getAdminToken() });
  } catch (e) {
    toastErrore('Operatore non rimosso: ' + (e.message || e));
    return;
  }
  operatoriAuthCache = operatoriAuthCache.filter((o) => o.nome !== n);
  const primaLista = operatoriSalvati;
  operatoriSalvati = operatoriSalvati.filter((o) => o !== n);
  if (!(await saveOperatori())) {
    operatoriSalvati = primaLista;
    renderOperatoriUI();
    return;
  }
  delete operatoriRepartoMap[n];
  if (!(await salvaImp('operatori_reparto', JSON.stringify(operatoriRepartoMap)))) return;
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
  // la vecchia impronta SHA-256 non serve piu: il primo accesso la converte (migrazione 20260911)
  const oh = await secureHash(o, op);
  if (p1.length < 4) {
    err.textContent = 'Troppo corta';
    return;
  }
  if (p1 !== p2) {
    err.textContent = 'Non coincidono';
    return;
  }
  const nh = await secureHash(p1, op);
  // con il token di chi cambia: le altre sessioni e i dispositivi biometrici della
  // persona si chiudono, questa resta aperta (v407)
  const res = await sbRpc('change_op_pwd', {
    p_nome: op,
    p_old_hash: oh,
    p_new_hash: nh,
    p_token: getOpToken(),
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
          const ne = _jsArg(n);
          return (
            '<div class="tipo-item" style="flex-wrap:wrap' +
            (n === cur ? ';border-color:var(--accent2)' : '') +
            '"><span class="tipo-item-name" style="flex:0 1 auto;font-weight:' +
            (n === cur ? '700' : '600') +
            '">' +
            escP(n) +
            '</span>' +
            // l admin cambia il settore dalla tendina qui a destra: il badge ripeteva la stessa cosa
            (admin ? '' : repBadge) +
            (hasAuth
              ? '<span style="font-size:var(--fs-sm,.8125rem);color:var(--c-verde,#2c6e49);font-weight:600">Con password</span>'
              : '') +
            (admin
              ? '<span style="flex:1"></span><button class="btn-del-tipo" onclick="apriAccessiExtra(\'' +
                ne +
                '\')">Accessi extra' +
                (Object.keys((window._operatoriAccessiExtra || {})[n] || {}).length
                  ? ' (' + Object.keys((window._operatoriAccessiExtra || {})[n] || {}).length + ')'
                  : '') +
                '</button><select onchange="cambiaRepartoOperatore(\'' +
                ne +
                '\',this.value)" title="Settore dell\'operatore" aria-label="Settore di ' +
                escP(n) +
                '">' +
                opzioniRepartoHtml(rep, true) +
                '</select>'
              : '') +
            (admin && hasAuth
              ? '<button class="btn-del-tipo" onclick="resetPasswordOperatore(\'' + ne + '\')">Nuova password</button>'
              : '') +
            (admin
              ? '<button class="btn-del-tipo pericolo" onclick="rimuoviOperatore(\'' + ne + '\')">Rimuovi</button>'
              : '') +
            '</div>'
          );
        })
        .join('')
    : '<p style="color:var(--muted);font-size:var(--fs-md,.875rem)">Nessun operatore.</p>';
  // Nascondi form creazione se non admin
  const addRow = el.parentElement.querySelector('.add-tipo-row');
  if (addRow) addRow.style.display = admin ? '' : 'none';
  if (admin) _popolaSelectProfiloNuovoOp();
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
  if (!(await salvaImp('campi_rapporto_reparti', JSON.stringify(campiReparti)))) return;
  logAzione('Campi rapporto', key + ' → settori: ' + (campiReparti[key] ? campiReparti[key].join(',') : 'tutti'));
  renderCampiRapportoUI();
}
async function saveCampiExtra() {
  return salvaImp('campi_rapporto_extra', JSON.stringify(campiRapportoExtra));
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
  if (!(await saveCampiExtra())) return;
  document.getElementById('new-campo-nome').value = '';
  renderCampiRapportoUI();
  toast('Campo aggiunto');
}
async function rimuoviCampoRapporto(key) {
  if (!(await chiediConferma('Rimuovere questo campo?'))) return;
  campiRapportoExtra = campiRapportoExtra.filter((c) => c.key !== key);
  if (!(await saveCampiExtra())) return;
  renderCampiRapportoUI();
  toast('Campo rimosso');
}
async function nascondiCampoDefault(key) {
  const d = CAMPI_RAPPORTO_DEFAULT.find((x) => x.key === key);
  if (
    !(await chiediConferma(
      'Nascondere il campo "' + (d ? d.label : key) + '"? I dati esistenti non verranno eliminati.',
    ))
  )
    return;
  campiNascosti.push(key);
  if (!(await salvaImp('campi_nascosti', JSON.stringify(campiNascosti)))) return;
  renderCampiRapportoUI();
  toast('Campo nascosto');
}
async function ripristinaCampoDefault(key) {
  campiNascosti = campiNascosti.filter((k) => k !== key);
  if (!(await salvaImp('campi_nascosti', JSON.stringify(campiNascosti)))) return;
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
  if (!(await salvaImp('tipi_ordine', JSON.stringify(tipiOrdine)))) return;
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
  if (!(await salvaImp('campi_ordine', JSON.stringify(campiOrdine)))) return;
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
    if (!(await salvaImp('campi_label_override', JSON.stringify(campiLabelOverride)))) return;
  } else {
    const c = campiRapportoExtra.find((x) => x.key === key);
    if (c) {
      c.label = val;
      if (!(await saveCampiExtra())) return;
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
    _jsArg(nome) +
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
    if (!(await salvaImp('tipi_rinominati', JSON.stringify(tipiRinominati)))) return;
    if (coloriOverride[vecchioNome]) {
      coloriOverride[nomeOriginale] = coloriOverride[vecchioNome];
      if (vecchioNome !== nomeOriginale) delete coloriOverride[vecchioNome];
      if (!(await saveColoriOverride())) return;
    }
    const oi = tipiOrdine.indexOf(vecchioNome);
    if (oi !== -1) {
      tipiOrdine[oi] = nuovoNome;
      if (!(await salvaImp('tipi_ordine', JSON.stringify(tipiOrdine)))) return;
    }
    // Aggiorna registrazioni nel DB e nella cache
    // le registrazioni con il tipo vecchio: se il database non le aggiorna, si dice (prima
    // restavano orfane mentre la pagina mostrava il nome nuovo)
    try {
      await secPatch('registrazioni', 'tipo=eq.' + encodeURIComponent(vecchioNome), { tipo: nuovoNome });
      datiCache.forEach((e) => {
        if (e.tipo === vecchioNome) e.tipo = nuovoNome;
      });
    } catch (e) {
      toastErrore(
        'Le registrazioni con il tipo ' + vecchioNome + ' NON sono state rinominate: ' + ((e && e.message) || e),
        10000,
      );
    }
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
      if (!(await saveTipiP())) return;
      if (!(await saveColoriOverride())) return;
      if (tipiOrdine.length && !(await salvaImp('tipi_ordine', JSON.stringify(tipiOrdine)))) return;
      // le registrazioni con il tipo vecchio: se il database non le aggiorna, si dice (prima
      // restavano orfane mentre la pagina mostrava il nome nuovo)
      try {
        await secPatch('registrazioni', 'tipo=eq.' + encodeURIComponent(vecchioNome), { tipo: nuovoNome });
        datiCache.forEach((e) => {
          if (e.tipo === vecchioNome) e.tipo = nuovoNome;
        });
      } catch (e) {
        toastErrore(
          'Le registrazioni con il tipo ' + vecchioNome + ' NON sono state rinominate: ' + ((e && e.message) || e),
          10000,
        );
      }
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
              '<label style="display:inline-flex;align-items:center;gap:3px;font-size:var(--fs-sm,.8125rem);color:var(--muted);cursor:pointer" title="Il campo appare nel rapporto di questo settore"><input type="checkbox"' +
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
            '\')">Rinomina</button><button class="btn-del-tipo' +
            // i campi predefiniti non si eliminano: si nascondono (e si rimettono dall elenco
            // "Campi nascosti" qui sotto). "Rimuovi" solo per quelli aggiunti a mano.
            (isDefault ? '" title="Nasconde il campo dal rapporto; i dati restano e si può rimettere"' : ' pericolo"') +
            ' style="margin-left:4px" onclick="' +
            (isDefault ? 'nascondiCampoDefault' : 'rimuoviCampoRapporto') +
            "('" +
            c.key +
            '\')">' +
            (isDefault ? 'Nascondi' : 'Rimuovi') +
            '</button>'
          : '') +
        '</div>'
      );
    })
    .join('');
  if (adm && campiNascosti.length) {
    cHtml +=
      '<div style="margin-top:12px;padding:10px;background:var(--paper2);border-radius:3px"><small style="color:var(--muted);display:block;margin-bottom:6px">Campi nascosti (clicca per rimetterli nel rapporto):</small>' +
      campiNascosti
        .map((k) => {
          const d = CAMPI_RAPPORTO_DEFAULT.find((x) => x.key === k);
          return (
            '<button style="margin:2px 4px;padding:3px 10px;font-size:var(--fs-sm,.8125rem);cursor:pointer;border:1px dashed var(--accent2);color:var(--accent2);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif" onclick="ripristinaCampoDefault(\'' +
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
  graficiColoriTema();
}
// GRAFICI: scritte e griglia con i colori del tema attivo (nel tema scuro il
// grigio predefinito di Chart.js non si leggeva). Vale per i grafici nuovi e
// aggiorna quelli gia disegnati.
function graficiColoriTema() {
  if (typeof Chart === 'undefined') return;
  const cs = getComputedStyle(document.body);
  const testo = cs.getPropertyValue('--ink').trim() || '#1a1208';
  const griglia = cs.getPropertyValue('--line').trim() || '#e8dfd0';
  Chart.defaults.color = testo;
  Chart.defaults.borderColor = griglia;
  // il carattere del programma (prima Arial) e numeri interi sugli assi dei conteggi
  Chart.defaults.font.family = "'Source Sans 3', sans-serif";
  if (Chart.defaults.scales && Chart.defaults.scales.linear) Chart.defaults.scales.linear.ticks.precision = 0;
  Object.values(Chart.instances || {}).forEach((ch) => {
    try {
      ch.options.color = testo;
      Object.values(ch.options.scales || {}).forEach((sc) => {
        if (sc.ticks) sc.ticks.color = testo;
        if (sc.title) sc.title.color = testo; // titoli degli assi: prima scuri anche al buio
        if (sc.pointLabels) sc.pointLabels.color = testo;
        if (sc.grid) sc.grid.color = griglia;
      });
      if (ch.options.plugins && ch.options.plugins.legend && ch.options.plugins.legend.labels)
        ch.options.plugins.legend.labels.color = testo;
      ch.update('none');
    } catch (e) {}
  });
}
// DIMENSIONE DEL TESTO PER OPERATORE: dal 90% al 130%. Si applica cambiando la
// base di tutte le misure (--scala-testo). Salvata sul dispositivo, per partire
// subito, e nel database, cosi segue l operatore su ogni PC.
const TESTO_SCALE = [0.9, 1, 1.1, 1.2, 1.3];
function _testoChiave() {
  return 'testo_operatore_' + (getOperatore() || 'default');
}
function applicaDimensioneTesto(v) {
  const n = TESTO_SCALE.includes(Number(v)) ? Number(v) : 1;
  document.documentElement.style.setProperty('--scala-testo', String(n));
  const lbl = document.getElementById('testo-dim-lbl');
  if (lbl) lbl.textContent = Math.round(n * 100) + '%';
  return n;
}
async function cambiaDimensioneTesto(passo) {
  const ora = Number(getComputedStyle(document.documentElement).getPropertyValue('--scala-testo')) || 1;
  const i = Math.max(0, Math.min(TESTO_SCALE.length - 1, TESTO_SCALE.indexOf(ora) + passo));
  const v = applicaDimensioneTesto(TESTO_SCALE[i < 0 ? 1 : i]);
  try {
    localStorage.setItem(_testoChiave(), String(v));
  } catch (e) {}
  // preferenza personale: fuori da Annulla (_setImpRaw), come il tema
  if (getOperatore() && typeof _setImpRaw === 'function') {
    try {
      await _setImpRaw(_testoChiave(), String(v));
    } catch (e) {
      console.warn('Dimensione testo non salvata nel database:', e.message);
    }
  }
}
async function caricaDimensioneTesto() {
  let v = null;
  try {
    v = localStorage.getItem(_testoChiave());
  } catch (e) {}
  applicaDimensioneTesto(v || 1);
  if (!getOperatore()) return;
  try {
    const db = await getImp(_testoChiave());
    if (db && db !== v) {
      applicaDimensioneTesto(db);
      try {
        localStorage.setItem(_testoChiave(), db);
      } catch (e) {}
    }
  } catch (e) {}
}
function applicaTemaOperatore() {
  caricaDimensioneTesto();
  const t = localStorage.getItem(getTemaKey()) || localStorage.getItem('tema') || 'light';
  if (t === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('btn-tema').innerHTML = '<i class="icx icx-sole"></i> Tema chiaro';
  } else {
    document.body.classList.remove('dark-theme');
    document.getElementById('btn-tema').innerHTML = '<i class="icx icx-luna"></i> Tema scuro';
  }
  graficiColoriTema();
}

// NAVIGATION

// ================================================================
// PERSONALIZZAZIONI ADMIN: valori buoni Maison + backup completo
// ================================================================
// TIPI DI BUONO (admin): sigla bloccata, nome, valore, attivo, parole chiave per
// riconoscere un tipo nuovo nel file Maison importato
function renderBuoniTipiUI() {
  const box = document.getElementById('buoni-tipi-box');
  if (!box || typeof BUONI_TIPI === 'undefined') return;
  const inp = (cls, val, w, extra) =>
    '<input class="' +
    cls +
    '" value="' +
    escP(val == null ? '' : String(val)) +
    '" style="width:' +
    w +
    'px;padding:6px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"' +
    (extra || '') +
    '>';
  let h =
    '<div style="overflow:auto"><table class="piano-table" style="font-size:var(--fs-md,.875rem);min-width:640px"><thead><tr><th>Sigla</th><th style="text-align:left">Nome</th><th>Valore CHF</th><th>Attivo</th><th style="text-align:left" title="Settori in cui il buono compare nei menu (Maison, Inventario). Nessuna spunta = tutti">Settori</th><th style="text-align:left" title="Per i tipi aggiunti: parole che, scritte nel file Maison, indicano questo buono (separate da virgola). La sigla con la quantità (es. 2 XX) si riconosce sempre">Parole nel file importato</th></tr></thead><tbody>';
  BUONI_TIPI.forEach((t) => {
    const base = BUONI_TIPI_BASE.some((b) => b.codice === t.codice);
    h +=
      '<tr data-codice="' +
      escP(t.codice) +
      '"><td style="font-weight:700">' +
      escP(t.codice) +
      '</td><td style="text-align:left">' +
      inp('bt-nome', t.nome, 200) +
      '</td><td>' +
      inp('bt-valore', t.valore, 80, ' type="number" min="0" step="0.5"') +
      '</td><td><input type="checkbox" class="bt-attivo"' +
      (t.attivo !== false ? ' checked' : '') +
      '></td><td style="text-align:left;white-space:nowrap">' +
      _buoniSettoriMaison()
        .map(
          (r) =>
            '<label style="margin-right:8px;font-size:var(--fs-sm,.8125rem)"><input type="checkbox" class="bt-settore" value="' +
            escP(r.key) +
            '"' +
            (Array.isArray(t.settori) && t.settori.includes(r.key) ? ' checked' : '') +
            '> ' +
            escP(r.label) +
            '</label>',
        )
        .join('') +
      '</td><td style="text-align:left">' +
      (base
        ? '<span style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">riconoscimento integrato</span>'
        : inp('bt-parole', t.parole, 220, ' placeholder="es. brunch, colazione"')) +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px"><button class="btn-add-tipo" onclick="salvaBuonoValori()">Salva</button></div>';
  h +=
    '<div class="add-tipo-row sez-form" style="margin-top:12px"><div class="field"><label>Nuova sigla</label><input id="bt-nuovo-cod" maxlength="6" placeholder="es. BR" style="width:90px;text-transform:uppercase"></div><div class="field"><label>Nome</label><input id="bt-nuovo-nome" placeholder="es. Buono Brunch"></div><div class="field"><label>Valore CHF</label><input id="bt-nuovo-val" type="number" min="0" step="0.5" style="width:90px"></div><div class="field"><label>Parole nel file (facoltative)</label><input id="bt-nuovo-parole" placeholder="es. brunch"></div><button class="btn-add-tipo" onclick="aggiungiBuonoTipo()">+ Aggiungi</button></div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:6px 0 0">La sigla non si può cambiare dopo l\'aggiunta: è scritta nelle registrazioni. Un tipo che non si usa più si disattiva: sparisce dai menu ma resta leggibile nello storico, nelle statistiche e negli export. Con le spunte dei Settori un buono compare solo nei menu di quei settori (nessuna spunta = in tutti).</p>';
  box.innerHTML = h;
}
// settori con la Maison (buoni): quelli dove l inventario ha la categoria Buoni
function _buoniSettoriMaison() {
  return (typeof getReparti === 'function' ? getReparti() : []).filter((r) => repartoConMaison(r.key));
}
function _buoniLeggiTabella() {
  const out = [];
  document.querySelectorAll('#buoni-tipi-box tr[data-codice]').forEach((tr) => {
    const t = BUONI_TIPI.find((x) => x.codice === tr.dataset.codice) || { codice: tr.dataset.codice };
    const v = parseFloat(String((tr.querySelector('.bt-valore') || {}).value || '').replace(',', '.'));
    out.push({
      codice: t.codice,
      nome: ((tr.querySelector('.bt-nome') || {}).value || '').trim() || t.codice,
      valore: isNaN(v) ? 0 : v,
      attivo: !!(tr.querySelector('.bt-attivo') || {}).checked,
      parole: ((tr.querySelector('.bt-parole') || {}).value || t.parole || '').trim(),
      settori: [...tr.querySelectorAll('.bt-settore:checked')].map((x) => x.value),
    });
  });
  return out;
}
async function _buoniSalvaLista(lista, cosa) {
  for (const t of lista)
    if (t.attivo && !(t.valore > 0)) {
      toast('Inserisci un valore valido per ' + t.codice);
      return false;
    }
  const bv = {};
  lista.forEach((t) => (bv[t.codice] = t.valore));
  bv._tipi = lista.map((t) => ({
    codice: t.codice,
    nome: t.nome,
    attivo: t.attivo,
    parole: t.parole || '',
    settori: Array.isArray(t.settori) && t.settori.length ? t.settori : undefined,
  }));
  if (!(await salvaImp('buono_valori', JSON.stringify(bv)))) return false;
  _buoniDaImpostazione(bv);
  logAzione(
    'Tipi di buono Maison',
    (cosa ? cosa + ' · ' : '') +
      lista.map((t) => t.codice + ' ' + t.nome + ' ' + t.valore + (t.attivo ? '' : ' (disattivato)')).join(' / '),
  );
  renderBuoniTipiUI();
  if (typeof renderMaisonDashboard === 'function' && document.getElementById('maison-filt-tipo')) {
    try {
      renderMaisonDashboard();
    } catch (e) {}
  }
  return true;
}
async function salvaBuonoValori() {
  if (!isAdmin()) return;
  if (await _buoniSalvaLista(_buoniLeggiTabella())) toast('Tipi di buono salvati');
}
async function aggiungiBuonoTipo() {
  if (!isAdmin()) return;
  const cod = String((document.getElementById('bt-nuovo-cod') || {}).value || '')
    .trim()
    .toUpperCase();
  const nome = String((document.getElementById('bt-nuovo-nome') || {}).value || '').trim();
  const val = parseFloat(String((document.getElementById('bt-nuovo-val') || {}).value || '').replace(',', '.'));
  const parole = String((document.getElementById('bt-nuovo-parole') || {}).value || '').trim();
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(cod)) {
    toast('Sigla: da 2 a 6 lettere o cifre, inizia con una lettera');
    return;
  }
  if (BUONI_TIPI.some((t) => t.codice === cod)) {
    toast('La sigla ' + cod + ' esiste già');
    return;
  }
  if (!nome) {
    toast('Scrivi il nome del buono');
    return;
  }
  if (!(val > 0)) {
    toast('Inserisci il valore in CHF');
    return;
  }
  const lista = _buoniLeggiTabella();
  lista.push({ codice: cod, nome: nome, valore: val, attivo: true, parole: parole });
  if (await _buoniSalvaLista(lista, 'aggiunto ' + cod)) toast('Buono ' + cod + ' aggiunto');
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
  // tabelle del Piano aggiunte a settembre 2026: senza queste il backup era incompleto
  'piano_ore_mese',
  'piano_festivita',
  'piano_recupero_ore',
  'piano_saldo_iniziale',
  'piano_cgf_riporto',
  'collab_congedi_np',
  'hr_allegati',
  'push_subscriptions',
  'chat_message_letti',
  'chat_message_hidden',
  // note tra colleghi: il canale sicuro restituisce solo quelle visibili a
  // chi esporta; i messaggi chat restano cifrati anche nel backup
  'note_colleghi',
];
// operatori_auth NON passa dall'app per sicurezza (contiene le password):
// per la migrazione completa c'e' il backup server nel pacchetto IT
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
      app: 'Diario Collaboratori · Casino Lugano SA',
      esportato_il: new Date().toISOString(),
      esportato_da: getOperatore(),
      tabelle: dati,
    };
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'diario_backup_' + oggiLocale() + '.json',
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
// ===== CONSERVAZIONE DATI (regolamento aziendale / RAP) =====
function renderConservazioneUI() {
  const a = document.getElementById('conservazione-anni');
  const g = document.getElementById('conservazione-grazia');
  const st = document.getElementById('conservazione-stato');
  const anni = typeof conservazioneAnni === 'function' ? conservazioneAnni() : 5;
  const gg = typeof conservazioneGiorniGrazia === 'function' ? conservazioneGiorniGrazia() : 30;
  if (a) a.value = String(anni);
  if (g) g.value = String(gg);
  if (st)
    st.textContent = anni
      ? 'Protezione ATTIVA: le voci più vecchie di ' +
        gg +
        ' giorni e degli ultimi ' +
        anni +
        ' anni non si possono eliminare definitivamente.'
      : 'Protezione DISATTIVATA: tutto è eliminabile definitivamente dal Cestino.';
}
async function salvaConservazioneAnni(v) {
  if (!isAdmin()) return;
  const n = Math.max(0, Math.min(30, parseInt(v) || 0));
  if (
    n < 5 &&
    !(await chiediConferma(
      'Il regolamento chiede almeno 5 anni.\n\nConfermi comunque ' + n + (n === 1 ? ' anno?' : ' anni?'),
    ))
  ) {
    renderConservazioneUI();
    return;
  }
  conservazioneAnniCfg = n;
  if (!(await salvaImp('conservazione_anni', String(n)))) return;
  logAzione('Conservazione dati', n ? 'minimo ' + n + ' anni' : 'protezione disattivata');
  toast(n ? 'Conservazione: ' + n + (n === 1 ? ' anno' : ' anni') : 'Protezione conservazione disattivata');
  renderConservazioneUI();
}
async function salvaConservazioneGrazia(v) {
  if (!isAdmin()) return;
  const n = Math.max(0, Math.min(365, parseInt(v) || 0));
  conservazioneGraziaCfg = n;
  if (!(await salvaImp('conservazione_giorni_grazia', String(n)))) return;
  logAzione('Conservazione dati', 'finestra correzione ' + n + ' giorni');
  toast('Correzione possibile entro ' + n + (n === 1 ? ' giorno' : ' giorni'));
  renderConservazioneUI();
}
async function salvaBackupAutoGiorni(v) {
  if (!isAdmin()) return;
  const n = Math.max(0, Math.min(90, parseInt(v) || 0));
  if (!(await salvaImp('backup_auto_giorni', String(n)))) return;
  logAzione('Backup automatico', n ? 'ogni ' + n + ' giorni' : 'disattivato');
  toast(
    n
      ? n === 1
        ? 'Backup automatico: ogni giorno'
        : 'Backup automatico: ogni ' + n + ' giorni'
      : 'Backup automatico disattivato',
  );
}
// ================================================================
// SETTORI (admin): aggiungi/rinomina/colore/disattiva + pagine per settore
// ================================================================
function renderSettoriUI() {
  const el = document.getElementById('settori-list');
  if (!el || !isAdmin()) return;
  let html = '';
  getRepartiTutti().forEach((r) => {
    const custom = !r.fisso;
    const disattivo = custom && r.attivo === false;
    const nDati =
      collaboratoriCache.filter((c) => c.reparto_dip === r.key).length +
      datiCache.filter((d) => d.reparto_dip === r.key).length;
    html +=
      '<div class="tipo-item" style="flex-direction:column;align-items:stretch;margin-bottom:8px' +
      (disattivo ? ';opacity:.55' : '') +
      '"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">';
    html +=
      '<span class="mini-badge" style="background:' +
      r.colore +
      ';font-size:var(--fs-sm,.8125rem)">' +
      escP(r.label) +
      '</span>';
    if (custom) {
      html += '<input type="text" id="settore-label-' + r.key + '" value="' + escP(r.label) + '" style="width:170px">';
    } else {
      html += '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">settore di base (fisso)</span>';
    }
    html +=
      '<input type="color" id="settore-colore-' +
      r.key +
      '" value="' +
      (r.colore || '#8a7d6b') +
      '" style="width:40px;height:30px;border:1px solid var(--line);border-radius:2px;cursor:pointer;background:var(--paper2)" title="Colore del settore">';
    html +=
      '<label class="settore-doc" title="Nome ufficiale usato nei fogli di cambio turno e nelle stampe (piano, briefing, vacanze, crediti). Vuoto = ' +
      escP(r.label) +
      '">Nome nei documenti <input type="text" id="settore-doc-' +
      r.key +
      '" value="' +
      escP((repartiNomiDocumenti || {})[r.key] || '') +
      '" placeholder="' +
      escP(r.label) +
      '"></label>';
    html += '<button class="btn-del-tipo" onclick="salvaSettore(\'' + r.key + '\')">Salva</button>';
    if (custom) {
      html +=
        '<button class="btn-del-tipo" onclick="toggleAttivoSettore(\'' +
        r.key +
        '\')" style="margin-left:4px">' +
        (disattivo ? 'Riattiva' : 'Disattiva') +
        '</button>';
      if (nDati)
        html +=
          '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)" title="Collaboratori e registrazioni di questo settore: disattivarlo non li cancella">' +
          nDati +
          ' dati collegati</span>';
    }
    html += '</div>';
    // MAISON (buoni e sigarette): per i settori aggiunti si sceglie qui (maison:true/false
    // in reparti_config, letto da repartoConMaison); Slots e Tavoli l hanno sempre
    const conMaison = typeof repartoConMaison === 'function' ? repartoConMaison(r.key) : !custom;
    html +=
      '<label class="st-maison" title="' +
      (custom
        ? 'Se spuntata, il settore usa la Maison: buoni, sigarette e i loro movimenti'
        : 'Nei settori di base la Maison è sempre attiva') +
      '"><input type="checkbox"' +
      (conMaison ? ' checked' : '') +
      (custom ? ' onchange="salvaMaisonSettore(\'' + r.key + '\',this.checked)"' : ' disabled') +
      '> <b>Buoni e sigarette (Maison)</b>' +
      (custom ? '' : ' <span>sempre attivi nei settori di base</span>') +
      '</label>';
    // pagine abilitate per questo settore
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px 14px;padding-left:4px">';
    Object.entries(PAGINE_REPARTO).forEach(([pk, plabel]) => {
      html +=
        '<label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-sm,.8125rem);color:var(--muted);cursor:pointer"><input type="checkbox"' +
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
    '<div class="add-tipo-row sez-form"><div class="field"><label>Nuovo settore</label><input type="text" id="nuovo-settore-nome" placeholder="Es: Bar, Sicurezza, Reception"></div><div class="field" style="flex:0 0 auto;min-width:0"><label>Colore</label><input type="color" id="nuovo-settore-colore" value="#b8860b"></div><button class="btn-add-tipo" onclick="aggiungiSettore()">Aggiungi settore</button></div>';
  el.innerHTML = html;
}
async function _salvaRepartiConfig() {
  if (!(await salvaImp('reparti_config', JSON.stringify(getRepartiCustom())))) return false;
  _salvaCacheReparti();
  if (typeof renderRepartoSwitch === 'function') renderRepartoSwitch();
  if (typeof applicaVisibilita === 'function') applicaVisibilita();
  if (typeof aggiornaMenuMobile === 'function') aggiornaMenuMobile();
  popolaLoginSettore();
  return true;
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
  if (!(await _salvaRepartiConfig())) return;
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
  if (!(await _salvaRepartiConfig())) return;
  // nome nei documenti (vale anche per i settori di base)
  const nomeDoc = ((document.getElementById('settore-doc-' + key) || {}).value || '').trim();
  const nomi = Object.assign({}, repartiNomiDocumenti || {});
  if (nomeDoc) nomi[key] = nomeDoc;
  else delete nomi[key];
  if (JSON.stringify(nomi) !== JSON.stringify(repartiNomiDocumenti || {})) {
    if (!(await salvaImp('reparti_nomi_documenti', JSON.stringify(nomi)))) return;
    repartiNomiDocumenti = nomi;
  }
  logAzione('Settore modificato', key + (nomeDoc ? ' · nei documenti: ' + nomeDoc : ''));
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
      !(await chiediConferma(
        'Disattivare il settore "' +
          r.label +
          '"?\n\nSparisce dallo switch e dai menu ma NESSUN dato viene toccato' +
          (nDati ? ' (' + nDati + ' record restano al sicuro)' : '') +
          '. Puoi riattivarlo quando vuoi.',
      ))
    )
      return;
  }
  r.attivo = !disattiva ? true : false;
  repartiConfig = lista;
  if (currentReparto === key && disattiva) currentReparto = 'slots';
  if (!(await _salvaRepartiConfig())) return;
  logAzione('Settore ' + (disattiva ? 'disattivato' : 'riattivato'), r.label);
  renderSettoriUI();
  toast('Settore ' + (disattiva ? 'disattivato' : 'riattivato'));
}
// Casella "Buoni e sigarette (Maison)" di un settore aggiunto: scrive maison true/false
// nel settore (reparti_config), la stessa proprieta che repartoConMaison legge
async function salvaMaisonSettore(key, on) {
  if (!isAdmin()) {
    toast('Non hai il permesso');
    renderSettoriUI();
    return;
  }
  const lista = getRepartiCustom().map((x) => Object.assign({}, x));
  const r = lista.find((x) => x.key === key);
  if (!r) return;
  r.maison = !!on;
  const prima = repartiConfig;
  repartiConfig = lista;
  if (!(await _salvaRepartiConfig())) {
    repartiConfig = prima;
    renderSettoriUI();
    return;
  }
  logAzione('Settore: Maison', r.label + ' · buoni e sigarette ' + (on ? 'attivi' : 'non attivi'));
  renderSettoriUI();
  toast(r.label + ': buoni e sigarette ' + (on ? 'attivi' : 'non attivi'));
}
async function salvaPaginaSettore(repKey, pageKey, abilitata) {
  if (!repartiPagineCfg || typeof repartiPagineCfg !== 'object') repartiPagineCfg = {};
  if (!repartiPagineCfg[repKey]) repartiPagineCfg[repKey] = {};
  if (abilitata) delete repartiPagineCfg[repKey][pageKey];
  else repartiPagineCfg[repKey][pageKey] = false;
  if (!Object.keys(repartiPagineCfg[repKey]).length) delete repartiPagineCfg[repKey];
  if (!(await salvaImp('reparti_pagine', JSON.stringify(repartiPagineCfg)))) return;
  logAzione('Pagine settore', repartoLabel(repKey) + ' · ' + pageKey + ': ' + (abilitata ? 'attiva' : 'disattivata'));
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
            ',this.value)" style="width:110px;text-align:center"> <span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">CHF</span><span style="flex:1"></span><button class="btn-del-tipo pericolo" onclick="rimuoviGiubileo(' +
            i +
            ')">Rimuovi</button></div>',
        )
        .join('')
    : '<p style="color:var(--muted);font-size:var(--fs-md,.875rem)">Nessuno scaglione configurato.</p>';
}
async function _salvaGiubileoConfig(cfg) {
  giubileoConfig = cfg;
  if (!(await salvaImp('giubileo_config', JSON.stringify(cfg)))) return false;
  renderGiubileoUI();
  return true;
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
  if (!(await _salvaGiubileoConfig(cfg.sort((a, b) => a.anni - b.anni)))) return;
  logAzione('Giubileo: scaglione aggiunto', anni + ' anni = ' + fmtCHF(importo) + ' CHF');
  toast('Scaglione ' + anni + ' anni aggiunto');
}
async function modificaGiubileo(idx, val) {
  const cfg = getGiubileoConfig();
  const n = parseFloat(val);
  if (!cfg[idx] || !(n >= 0)) return;
  cfg[idx].importo = n;
  if (!(await _salvaGiubileoConfig(cfg))) return;
  logAzione('Giubileo: importo modificato', cfg[idx].anni + ' anni = ' + fmtCHF(n) + ' CHF');
  toast('Importo aggiornato');
}
async function rimuoviGiubileo(idx) {
  const cfg = getGiubileoConfig();
  if (!cfg[idx]) return;
  if (!(await chiediConferma('Rimuovere lo scaglione ' + cfg[idx].anni + ' anni?'))) return;
  const rimosso = cfg.splice(idx, 1)[0];
  if (!(await _salvaGiubileoConfig(cfg))) return;
  logAzione('Giubileo: scaglione rimosso', rimosso.anni + ' anni');
}

async function salvaGiubileoPreavviso(val) {
  const g = parseInt(val) || 0;
  giubileoPreavviso = g;
  if (!(await salvaImp('giubileo_preavviso', String(g)))) return;
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
  // (impronta del dispositivo, personale), e il Cestino (chi cestina deve poter ripristinare,
  // decisione del titolare 11/10)
  if (rootId === 'page-impostazioni' && !isAdmin()) {
    // il titolo sta dentro l intestazione della sezione (.sez-head): prima si cercava solo
    // un h4 figlio diretto e con un nome vecchio, cosi non si nascondeva nessuna sezione
    const perOperatori = ['gestione collaboratori', 'collaboratori', 'sicurezza', 'cestino'];
    root.querySelectorAll('.settings-section').forEach((sec) => {
      const h = sec.querySelector('h4');
      if (!h) return;
      const titolo = (h.childNodes[0].textContent || '').trim().toLowerCase();
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

// ===== INDICE DELLE IMPOSTAZIONI =====
// La pagina ha molte sezioni: in cima compare un indice a gruppi (Registrazioni,
// Persone, Accessi, Settori e moduli, Dati) costruito dai titoli delle
// sezioni visibili, e prima di ogni gruppo un'etichetta. Niente da mantenere a
// mano: aggiungendo una sezione con data-gruppo compare da sola.
// SOTTO MENU DELLE IMPOSTAZIONI · cinque schede (Registrazioni, Persone e
// accessi, Maison, Personale, Sistema): si vede solo il gruppo scelto, con
// dentro le chip delle sue sezioni. L ultimo gruppo aperto viene ricordato.
// quattro schede (controllo del 09/10/2026; prima sei, con Altro): persone, accessi, configurazione, dati
const SETTINGS_GRUPPI = ['Persone', 'Accessi', 'Settori e moduli', 'Dati', 'Altro'];
function _settingsGruppiVisibili() {
  const page = document.getElementById('page-impostazioni');
  const perGruppo = {};
  if (!page) return perGruppo;
  page.querySelectorAll('.settings-section').forEach((sec, i) => {
    if (sec.style.display === 'none') return;
    const h4 = sec.querySelector('h4');
    if (!h4) return;
    if (!sec.id) sec.id = 'settings-sez-' + i;
    const g = sec.getAttribute('data-gruppo') || 'Altro';
    (perGruppo[g] = perGruppo[g] || []).push({ id: sec.id, titolo: h4.textContent.trim(), el: sec });
  });
  return perGruppo;
}
function _settingsAggiornaIndice() {
  const nav = document.getElementById('settings-indice');
  const page = document.getElementById('page-impostazioni');
  if (!nav || !page) return;
  page.querySelectorAll('.settings-gruppo-titolo').forEach((el) => el.remove());
  const perGruppo = _settingsGruppiVisibili();
  const gruppi = SETTINGS_GRUPPI.filter((g) => perGruppo[g] && perGruppo[g].length);
  if (!gruppi.length) {
    nav.innerHTML = '';
    return;
  }
  let attivo = localStorage.getItem('settings_gruppo');
  if (gruppi.indexOf(attivo) < 0) attivo = gruppi[0];
  let h = '<div class="settings-tabs">';
  gruppi.forEach((g) => {
    h +=
      '<button type="button" class="settings-tab" data-gruppo="' +
      escP(g) +
      '" onclick="_settingsMostraGruppo(\'' +
      _jsArg(g) +
      '\')">' +
      escP(g) +
      '<span class="settings-tab-n">' +
      perGruppo[g].length +
      '</span></button>';
  });
  h += '</div><div class="settings-indice-gruppo" id="settings-indice-chip"></div>';
  nav.innerHTML = h;
  _settingsMostraGruppo(attivo);
}
function _settingsMostraGruppo(g) {
  const page = document.getElementById('page-impostazioni');
  if (!page) return;
  const perGruppo = _settingsGruppiVisibili();
  page.querySelectorAll('.settings-section').forEach((sec) => {
    const mio = (sec.getAttribute('data-gruppo') || 'Altro') === g;
    if (mio) sec.removeAttribute('data-fuori-gruppo');
    else sec.setAttribute('data-fuori-gruppo', '1');
  });
  document.querySelectorAll('.settings-tab').forEach((b) => b.classList.toggle('attiva', b.dataset.gruppo === g));
  const chip = document.getElementById('settings-indice-chip');
  if (chip)
    chip.innerHTML = (perGruppo[g] || [])
      .map(
        (v) =>
          '<button type="button" class="settings-chip" onclick="_settingsVai(\'' +
          v.id +
          '\')">' +
          escP(v.titolo) +
          '</button>',
      )
      .join('');
  localStorage.setItem('settings_gruppo', g);
}
function _settingsVai(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // la sezione puo stare in un altro gruppo: prima si apre quello
  const g = el.getAttribute('data-gruppo') || 'Altro';
  if (el.hasAttribute('data-fuori-gruppo')) _settingsMostraGruppo(g);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('settings-evidenzia');
  void el.offsetWidth;
  el.classList.add('settings-evidenzia');
  setTimeout(() => el.classList.remove('settings-evidenzia'), 1600);
}

// ===== SCHEDA PERMESSI STAMPABILE =====
// Lo stato REALE dei permessi (non la matrice dei profili): per ogni
// operatore, cosa vede e cosa puo fare, con profilo, settori e accessi
// extra. Si apre in una finestra pronta per la stampa o il PDF.
// operatori della scheda dei permessi (stampa e scheda da compilare)
function _schedaPermessiOperatori() {
  return [
    ...new Set(
      (typeof operatoriSalvati !== 'undefined' ? operatoriSalvati : []).concat(
        (typeof operatoriAuthCache !== 'undefined' ? operatoriAuthCache : []).map((o) => o.nome),
      ),
    ),
  ]
    .filter(Boolean)
    .sort();
}
// SCHEDA DA COMPILARE: file HTML gia spuntato con i permessi di adesso (caselle Si/no
// modificabili, note, firme, Salva copia compilata), dal modello unico js/scheda-permessi.js
function scaricaSchedaPermessiCompilabile() {
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
  const nomiProf = Object.assign({}, PROFILI);
  Object.keys(_profiliCustom()).forEach((id) => (nomiProf[id] = _profiliCustom()[id].nome + ' (personalizzato)'));
  const ops = _schedaPermessiOperatori();
  const oggi = new Date()
    .toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '.');
  const pagina = SchedaPermessi.html({
    ops: ops,
    nomiProfili: nomiProf,
    profili: typeof profiliOperatori !== 'undefined' && profiliOperatori ? profiliOperatori : {},
    settori: typeof operatoriRepartoMap !== 'undefined' && operatoriRepartoMap ? operatoriRepartoMap : {},
    extra: window._operatoriAccessiExtra || {},
    vis: visibilitaConfig,
    voci: VIS_ITEMS,
    ereditati: PIANO_AUTO_EREDITATI,
    oggi: oggi,
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([pagina], { type: 'text/html;charset=utf-8' }));
  a.download = 'SCHEDA_PERMESSI_' + oggi.split('.').reverse().join('-') + '.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  logAzione('Scheda permessi scaricata', ops.length + ' operatori');
  toast('Scheda scaricata: aprila, controlla le caselle e usa Salva copia compilata');
}
function stampaSchedaPermessi() {
  if (!isAdmin()) {
    toast("Riservato all'amministratore");
    return;
  }
  const ops = _schedaPermessiOperatori();
  const prof = typeof profiliOperatori !== 'undefined' && profiliOperatori ? profiliOperatori : {};
  const rep = typeof operatoriRepartoMap !== 'undefined' && operatoriRepartoMap ? operatoriRepartoMap : {};
  const extra = window._operatoriAccessiExtra || {};
  const nomiProf = Object.assign({}, typeof PROFILI !== 'undefined' ? PROFILI : {});
  Object.keys(_profiliCustom()).forEach((id) => (nomiProf[id] = _profiliCustom()[id].nome));
  // stesse regole del programma e della scheda da compilare (js/scheda-permessi.js)
  const _vDi = (key) => SchedaPermessi.valore(visibilitaConfig, key, VIS_ITEMS, PIANO_AUTO_EREDITATI);
  const concesso = (key, op) => SchedaPermessi.concesso(visibilitaConfig, key, op, VIS_ITEMS, PIANO_AUTO_EREDITATI);
  const impostazione = (key) => {
    const v = _vDi(key);
    return v === 'tutti'
      ? 'tutti'
      : v === 'admin'
        ? 'solo amministratore'
        : v === 'nascosto'
          ? 'nascosta'
          : 'selezionati';
  };
  const gruppi = [
    ['Pagine', VIS_ITEMS.pagine],
    ['Funzioni', VIS_ITEMS.funzioni],
    ['Permessi', VIS_ITEMS.permessi],
    ['Piano: schede visibili', VIS_ITEMS.piano_schede],
    ['Piano: schede modificabili', VIS_ITEMS.piano_modifica],
  ];
  const oggi = new Date().toLocaleDateString('it-IT');
  let h =
    '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Scheda permessi</title><style>body{font-family:Georgia,serif;color:#1c1a17;margin:24px;font-size:13px}h1{font-size:var(--fs-xl,1.25rem);margin:0 0 4px}h2{font-size:var(--fs-lg,1.0625rem);margin:22px 0 6px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:11.5px}th,td{border:1px solid #999;padding:3px 6px;text-align:center}th{background:#eee}td.l{text-align:left}tr.g td{background:#f3efe6;text-align:left;font-weight:700}.si{background:#e3f0e8;font-weight:700}.no{color:#999}p{margin:4px 0;color:#444}.nb{margin:12px 0}@media print{.nb{display:none}body{margin:10mm}table{font-size:10px}}@page{size:A4 landscape;margin:9mm}@media print{html,body{width:auto!important;margin:0!important}table{width:100%!important;table-layout:fixed;font-size:9px!important}td,th{overflow-wrap:anywhere;word-break:break-word;padding:2px 3px!important}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}</style></head><body>' +
    '<h1>Diario Collaboratori · scheda dei permessi attuali</h1><p>Stato delle Impostazioni al ' +
    oggi +
    '. Sì = può (vedere la pagina o la scheda, oppure eseguire la funzione); vuoto = no. L\'amministratore può tutto ed è escluso dalla tabella.</p><div class="nb"><button onclick="window.print()">Stampa / PDF</button></div>';
  h +=
    '<h2>Operatori, profilo e settori</h2><table><tr><th>Operatore</th><th>Profilo</th><th>Settori</th><th>Accessi extra</th></tr>';
  ops.forEach((o) => {
    const ex = extra[o] && typeof extra[o] === 'object' ? extra[o] : {};
    const ext = Object.keys(ex)
      .map((k) => k + ': ' + (ex[k] && ex[k].modifica ? 'modifica' : 'sola lettura'))
      .join(', ');
    h +=
      '<tr><td class="l"><b>' +
      escP(o) +
      '</b></td><td>' +
      escP(nomiProf[prof[o]] || 'nessuno') +
      '</td><td>' +
      escP(rep[o] || '?') +
      '</td><td class="l">' +
      (escP(ext) || '-') +
      '</td></tr>';
  });
  h +=
    '</table><h2>Cosa può vedere e fare ognuno</h2><table><tr><th style="text-align:left">Voce</th><th>Impostazione</th>' +
    ops.map((o) => '<th>' + escP(o) + '</th>').join('') +
    '</tr>';
  gruppi.forEach(([gt, voci]) => {
    h += '<tr class="g"><td colspan="' + (ops.length + 2) + '">' + escP(gt) + '</td></tr>';
    Object.keys(voci).forEach((k) => {
      h +=
        '<tr><td class="l">' +
        escP(voci[k]) +
        '</td><td style="font-size:10px;color:#555">' +
        escP(impostazione(k)) +
        '</td>' +
        ops.map((o) => (concesso(k, o) ? '<td class="si">Sì</td>' : '<td class="no"></td>')).join('') +
        '</tr>';
    });
  });
  h += '</table></body></html>';
  const w = window.open('', '_blank');
  if (!w) {
    toastErrore('Il browser ha bloccato la finestra: consenti le finestre a comparsa per questo sito');
    return;
  }
  w.document.write(h);
  w.document.close();
  logAzione('Scheda permessi stampata', ops.length + ' operatori');
}

// ================================================================
// GESTIONE COLLABORATORI · elenco in sola lettura + scheda con Salva (ondata 3)
// Prima ogni riga aveva una decina di menu che salvavano al primo clic: un clic
// sbagliato cambiava un dato. Ora l elenco si legge soltanto; un clic apre la scheda
// della persona, si cambia quello che serve e si conferma con Salva (Annulla = niente).
// I salvataggi passano dalle STESSE funzioni di prima (cambiaImpiegoCollaboratore,
// cambiaCategoriaCollaboratore, cambiaFunzioneCollaboratore, ... in moduli.js), con
// gli stessi controlli dei permessi, registro attivita e storico HR.
// ================================================================
// sigle delle funzioni piu comuni scritte per esteso (le altre restano come sono)
const _GC_FUNZIONI_NOMI = {
  RESP: 'Responsabile',
  SUP: 'Supervisore',
  BO: 'Back Office',
  CR: 'Croupier',
  ISP: 'Ispettore',
};
function _gcFunzioneTesto(f) {
  const s = String(f || '').toUpperCase();
  // nome scritto in Piano › Impostazioni › Funzioni del settore, poi i nomi noti
  const nome = (typeof funzioneNomeEsteso === 'function' && funzioneNomeEsteso(s)) || _GC_FUNZIONI_NOMI[s];
  return s && nome ? s + ' · ' + nome : s;
}
function _gcSettoreTesto(rep) {
  return rep === 'entrambi' ? 'Tutti i settori' : repartoLabel(rep || 'slots');
}
// percentuale scritta com e salvata (0,875 = 87,5%): prima si arrotondava a 88% e ogni
// Salva riscriveva 0,88 con un evento nello Storico HR
function _gcPercValTesto(v) {
  return String(Math.round((parseFloat(v) || 1) * 1000) / 10).replace('.', ',') + '%';
}
function _gcPercTesto(c) {
  return _gcPercValTesto(c.percentuale);
}
function _gcDataIt(d) {
  return d ? String(d).substring(0, 10).split('-').reverse().join('.') : '';
}
// permessi calcolati una volta da renderCollaboratoriUI (moduli.js) e riusati dalla scheda
function _gcPermessi() {
  return window._gcPerm || {};
}
// righe dell elenco (sola lettura). p = permessi, lista = collaboratori attivi del settore
function _gcElencoHtml(attivi, inattivi, p) {
  const puoVedereCat = p.puoCat || (typeof puoVedereCategorie === 'function' && puoVedereCategorie());
  // colonna Categoria solo se almeno una persona ce l ha: tutta "-" non diceva niente
  const vedeCat = puoVedereCat && attivi.some((c) => c.categoria);
  const ordina = (arr) =>
    arr
      .slice()
      .sort((a, b) =>
        vedeCat
          ? (a.categoria || 9) - (b.categoria || 9) || a.nome.localeCompare(b.nome)
          : a.nome.localeCompare(b.nome),
      );
  const testa =
    '<thead><tr><th>Collaboratore</th><th>Funzione nel piano</th>' +
    (vedeCat ? '<th>Categoria</th>' : '') +
    '<th class="num">Percentuale</th><th>Settore</th><th>Livello</th><th class="gc-col-apri"><span class="fz-sr">Apri</span></th></tr></thead>';
  const riga = (c) => {
    const lv = typeof livelloDiCollaboratore === 'function' ? livelloDiCollaboratore(c) : 0;
    const cop = typeof _coperturaSettori === 'function' ? _coperturaSettori(c) : [];
    return (
      '<tr class="collab-riga gc-riga" tabindex="0" role="button" data-nome="' +
      escP(c.nome.toLowerCase()) +
      '" onclick="gcApriScheda(' +
      c.id +
      ")\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();gcApriScheda(" +
      c.id +
      ')}" title="Apri la scheda per modificare">' +
      '<td data-et="Collaboratore"><span class="gc-nome">' +
      escP(c.nome) +
      '</span>' +
      (c.data_fine_rapporto
        ? ' <span class="gc-etichetta gc-fine" title="Ultimo giorno di lavoro: dal giorno dopo non è più nel piano e nelle ore dovute">fine contratto ' +
          _gcDataIt(c.data_fine_rapporto) +
          '</span>'
        : '') +
      (cop.length
        ? '<span class="gc-sotto">Copre anche: ' + cop.map((k) => escP(repartoLabel(k))).join(', ') + '</span>'
        : '') +
      '</td><td data-et="Funzione nel piano">' +
      (c.funzione ? escP(_gcFunzioneTesto(c.funzione)) : '<span class="gc-manca">da indicare</span>') +
      '</td>' +
      (vedeCat
        ? '<td data-et="Categoria">' +
          (c.categoria ? c.categoria + '&ordf;' : '<span class="gc-manca">-</span>') +
          '</td>'
        : '') +
      '<td data-et="Percentuale" class="num">' +
      _gcPercTesto(c) +
      '</td><td data-et="Settore">' +
      escP(_gcSettoreTesto(c.reparto_dip)) +
      '</td><td data-et="Livello">' +
      (typeof _lvBadge === 'function' ? _lvBadge(lv) : lv ? 'Livello ' + lv : 'Senza livello') +
      '</td><td class="gc-col-apri" aria-hidden="true">&rsaquo;</td></tr>'
    );
  };
  const gruppo = (titolo, arr, spiega) =>
    arr.length
      ? '<h5 class="gc-gruppo">' +
        titolo +
        ' <span>' +
        arr.length +
        (spiega ? ' · ' + spiega : '') +
        '</span></h5><table class="gc-tab">' +
        testa +
        '<tbody>' +
        ordina(arr).map(riga).join('') +
        '</tbody></table>'
      : '';
  let h =
    // l istruzione (clic sul nome, Salva) sta una volta sola, nella descrizione della sezione
    '<p class="gc-intro">' +
    (puoVedereCat && !vedeCat && attivi.length
      ? 'Nessuno ha ancora la categoria: si indica nella scheda di ciascuno, poi compare la colonna. '
      : '') +
    'Vai a: <a href="#" onclick="switchPage(\'formazione\');return false">Formazione</a> · <a href="#" onclick="switchPage(\'piano\');if(typeof pianoCambiaTab===\'function\')pianoCambiaTab(\'impostazioni\');return false">Piano › Impostazioni</a></p>';
  if (attivi.length > 8)
    h +=
      '<input type="text" id="collab-cerca" placeholder="Cerca collaboratore..." aria-label="Cerca collaboratore" oninput="filtraCollaboratoriUI(this.value)" class="campo-cerca">';
  const fissi = attivi.filter((c) => c.impiego === 'fisso');
  const jolly = attivi.filter((c) => c.impiego === 'jolly');
  const senza = attivi.filter((c) => !c.impiego);
  h += gruppo('Fissi', fissi);
  h += gruppo('Jolly', jolly, 'chiamati quando serve');
  h += gruppo('Impiego da indicare', senza, 'apri la scheda e scegli Fisso o Jolly');
  if (!attivi.length) h += '<p class="gc-intro">Nessun collaboratore in questo settore.</p>';
  if (inattivi.length && p.adminFull)
    h +=
      '<div class="gc-disattivati"><h5 class="gc-gruppo">Disattivati <span>' +
      inattivi.length +
      ' · clicca un nome per riattivarlo (chiede conferma)</span></h5><div class="gc-disattivati-lista">' +
      inattivi
        .map(
          (c) =>
            '<button type="button" class="gc-btn-riattiva" onclick="gcRiattiva(\'' +
            _jsArg(c.nome) +
            '\')">' +
            escP(c.nome) +
            '</button>',
        )
        .join('') +
      '</div></div>';
  return h;
}
async function gcRiattiva(nome) {
  if (
    !(await chiediConferma('Riattivare ' + nome + '?\n\nTorna negli elenchi, nel piano e nelle scelte dei nomi.', {
      ok: 'Riattiva',
    }))
  )
    return;
  if (typeof riattivaCollaboratore === 'function') await riattivaCollaboratore(nome);
}
// ---- scheda (finestra) ----
function _gcCerca(id) {
  return (window._gcRecords || []).find((x) => x.id === id) || (collaboratoriCache || []).find((x) => x.id === id);
}
function gcApriScheda(id) {
  const c = _gcCerca(id);
  if (!c) return;
  const p = _gcPermessi();
  const vedeCat = p.puoCat || (typeof puoVedereCategorie === 'function' && puoVedereCategorie());
  const imp = c.impiego || '';
  const cat = c.categoria || '';
  const sel = (id2, opz, abil, extra) =>
    '<select id="' + id2 + '"' + (abil ? '' : ' disabled') + (extra || '') + '>' + opz + '</select>';
  const opt = (v, t, cur) =>
    '<option value="' + escP(String(v)) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + t + '</option>';
  const campo = (et, html, aiuto) =>
    '<label class="gc-campo"><span class="gc-campo-et">' +
    et +
    '</span>' +
    html +
    (aiuto ? '<span class="gc-campo-aiuto">' + aiuto + '</span>' : '') +
    '</label>';
  const funzioni =
    typeof _pianoFunzioniDi === 'function'
      ? _pianoFunzioniDi(c.reparto_dip || 'slots')
      : window._pianoFunzioni || ['RESP', 'SUP', 'BO', 'HOST'];
  if (c.funzione && !funzioni.includes(c.funzione)) funzioni.push(c.funzione);
  // PERCENTUALE: il valore salvato resta esatto (0,875 non diventa 0,88). Prima la
  // scheda arrotondava al centesimo e ogni Salva lo riscriveva con un evento HR.
  const percCur = parseFloat(c.percentuale) || 1;
  const percOpz = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
  if (!percOpz.some((v) => Math.abs(v - percCur) < 1e-9)) percOpz.unshift(percCur);
  const percSel = String(percOpz.find((v) => Math.abs(v - percCur) < 1e-9));
  // SETTORE: un settore disattivato non e fra quelli attivi ma resta quello della persona:
  // si mostra "(disattivato)" e non cambia finche non lo si sceglie diverso. Prima la
  // persona finiva su "Tutti i settori" al primo Salva senza accorgersene.
  const repCur = c.reparto_dip || 'slots';
  let settOpz = opt('entrambi', 'Tutti i settori', repCur);
  const repAttivi = getReparti();
  repAttivi.forEach((r) => (settOpz += opt(r.key, escP(r.label), repCur)));
  if (repCur !== 'entrambi' && !repAttivi.some((r) => r.key === repCur))
    settOpz += opt(repCur, escP(repartoLabel(repCur)) + ' (disattivato)', repCur);
  const lv = typeof livelloDiCollaboratore === 'function' ? livelloDiCollaboratore(c) : 0;
  let h =
    '<div class="fz-fin-testa"><div><h3 id="gc-titolo">' +
    escP(c.nome) +
    '</h3><p>' +
    (typeof _lvBadge === 'function' ? _lvBadge(lv) + ' · ' : '') +
    escP(_gcSettoreTesto(c.reparto_dip)) +
    (c.data_fine_rapporto ? ' · <b>fine contratto ' + _gcDataIt(c.data_fine_rapporto) + '</b>' : '') +
    '</p></div><button type="button" class="fz-chiudi" aria-label="Chiudi senza salvare" onclick="gcChiudiScheda()">&times;</button></div>';
  h +=
    '<form class="gc-form" onsubmit="event.preventDefault();gcSalvaScheda(' +
    c.id +
    ')" oninput="_gcSegnaModifica()" onchange="_gcSegnaModifica()">';
  h += '<fieldset><legend>Contratto</legend><div class="gc-griglia">';
  h += campo(
    'Impiego',
    sel(
      'gc-impiego',
      opt('', 'Da indicare', imp) + opt('fisso', 'Fisso', imp) + opt('jolly', 'Jolly (chiamato quando serve)', imp),
      p.puoImp,
    ),
  );
  if (vedeCat)
    h += campo(
      'Categoria',
      sel(
        'gc-categoria',
        opt('', 'Nessuna', cat) + [5, 4, 3, 2, 1].map((n) => opt(n, n + 'ª categoria', cat)).join(''),
        p.puoCat,
      ),
      '5ª = ingresso, 1ª = la più alta',
    );
  if (p.puoImpiegoDati) {
    h += campo(
      'Funzione nel piano',
      sel(
        'gc-funzione',
        opt('', 'Da indicare', c.funzione || '') +
          funzioni.map((f) => opt(f, escP(_gcFunzioneTesto(f)), c.funzione || '')).join(''),
        true,
      ),
      'La sigla usata dal Piano di lavoro per le regole dei turni (es. BO, SUP)',
    );
    h += campo(
      'Percentuale d’impiego',
      sel('gc-perc', percOpz.map((v) => opt(v, _gcPercValTesto(v), percSel)).join(''), true),
      'Per il saldo delle ore e i codici del contratto',
    );
    h += campo(
      'Lingue parlate',
      '<input type="text" id="gc-lingue" maxlength="20" placeholder="IT, EN" value="' + escP(c.lingue || '') + '">',
      'Sigle separate da spazio o virgola (IT italiano, EN inglese, DE tedesco, FR francese)',
    );
  }
  if (p.adminFull)
    h += campo('Settore', sel('gc-settore', settOpz, true), 'Il settore dove ha il contratto e le ore dovute');
  h += '</div></fieldset>';
  if (p.puoHrMod)
    h +=
      '<fieldset><legend>Date</legend><div class="gc-griglia">' +
      campo(
        'Data di nascita',
        '<input type="text" id="gc-nascita" placeholder="12.01.1997" value="' +
          escP(c.data_nascita ? dataNascitaLabel(c.data_nascita, false) : '') +
          '">',
        'Basta giorno e mese (12.01) se l’anno non si conosce',
      ) +
      campo(
        'Inizio attività',
        '<input type="text" id="gc-inizio" placeholder="01.05.2024" value="' +
          escP(_gcDataIt(c.data_assunzione)) +
          '">',
        'Serve per anzianità, giubilei e giorni di vacanza',
      ) +
      '</div></fieldset>';
  h +=
    '<div class="gc-pulsanti"><button type="button" class="btn-secondario" onclick="gcChiudiScheda()">Annulla</button><button type="submit" class="btn-add-tipo" id="gc-salva">Salva</button></div></form>';
  // ALTRE AZIONI (amministratore): aprono la loro finestra, con le loro conferme
  if (p.adminFull) {
    const cop = typeof _coperturaSettori === 'function' ? _coperturaSettori(c) : [];
    h +=
      '<div class="gc-azioni"><h4>Altre azioni</h4>' +
      '<div class="gc-azione"><div><b>Copertura di altri settori</b><span>' +
      (cop.length
        ? 'Può coprire i buchi in: ' + cop.map((k) => escP(repartoLabel(k))).join(', ')
        : 'Per ora lavora solo nel suo settore') +
      '</span></div><button type="button" class="btn-secondario fz-btn-piccolo" onclick="gcAltraAzione(\'copertura\',' +
      c.id +
      ')">Imposta copertura</button></div>' +
      '<div class="gc-azione"><div><b>Cambia il nome</b><span>Il nuovo nome vale ovunque: piano, Diario, storico</span></div><button type="button" class="btn-secondario fz-btn-piccolo" onclick="gcAltraAzione(\'rinomina\',' +
      c.id +
      ')">Rinomina</button></div>' +
      '<div class="gc-azione"><div><b>' +
      (c.data_fine_rapporto ? 'Fine contratto' : 'Disattiva o fine contratto') +
      '</b><span>' +
      (c.data_fine_rapporto
        ? 'Ultimo giorno ' + _gcDataIt(c.data_fine_rapporto) + ': puoi cambiare la data o toglierla'
        : 'Chiede l’ultimo giorno di lavoro: fino a quel giorno resta tutto') +
      '</span></div><button type="button" class="btn-secondario fz-btn-piccolo fz-btn-pericolo" onclick="gcAltraAzione(\'disattiva\',' +
      c.id +
      ')">' +
      (c.data_fine_rapporto ? 'Cambia' : 'Disattiva') +
      '</button></div>' +
      '</div>';
  }
  let velo = document.getElementById('gc-velo');
  if (!velo) {
    velo = document.createElement('div');
    velo.id = 'gc-velo';
    velo.className = 'fz-velo';
    velo.innerHTML =
      '<div class="fz-finestra gc-finestra" role="dialog" aria-modal="true" aria-labelledby="gc-titolo"><div id="gc-corpo"></div></div>';
    velo.addEventListener('mousedown', (e) => {
      if (e.target === velo) gcChiudiScheda();
    });
    document.body.appendChild(velo);
    document.addEventListener('keydown', _gcTasti, true);
  }
  document.getElementById('gc-corpo').innerHTML = h;
  window._gcModificata = false;
  const primo = velo.querySelector('select:not([disabled]),input');
  if (primo) primo.focus();
}
function _gcSegnaModifica() {
  window._gcModificata = true;
}
function _gcTasti(e) {
  if (
    e.key === 'Escape' &&
    !document.querySelector('.finestra-velo') &&
    document.getElementById('pwd-modal').classList.contains('hidden')
  ) {
    e.preventDefault();
    gcChiudiScheda();
  }
}
async function gcChiudiScheda(forza) {
  if (!forza && window._gcModificata) {
    if (
      !(await chiediConferma('Ci sono modifiche non salvate. Chiudere la scheda senza salvarle?', {
        ok: 'Chiudi senza salvare',
      }))
    )
      return false;
  }
  const v = document.getElementById('gc-velo');
  if (v) v.remove();
  document.removeEventListener('keydown', _gcTasti, true);
  window._gcModificata = false;
  return true;
}
// rinomina, copertura e disattivazione hanno le loro finestre e conferme: si chiude la
// scheda (chiedendo se ci sono modifiche non salvate) e si apre la loro
async function gcAltraAzione(cosa, id) {
  const c = _gcCerca(id);
  if (!c || !(await gcChiudiScheda())) return;
  if (cosa === 'copertura' && typeof apriCoperturaCollab === 'function') apriCoperturaCollab(id);
  else if (cosa === 'rinomina' && typeof rinominaCollaboratore === 'function') rinominaCollaboratore(c.nome);
  else if (cosa === 'disattiva' && typeof disattivaCollaboratore === 'function') disattivaCollaboratore(c.nome);
}
// SALVA: per ogni campo cambiato si chiama la funzione di sempre, una alla volta.
// Alla fine si controlla che i valori siano davvero arrivati (le funzioni mostrano da
// sole l errore o chiedono conferma per le date): se qualcosa non e passato la scheda resta aperta.
async function gcSalvaScheda(id) {
  const c = _gcCerca(id);
  if (!c) return;
  const p = _gcPermessi();
  const val = (k) => {
    const el = document.getElementById(k);
    return el && !el.disabled ? el.value : undefined;
  };
  const prima = {
    impiego: c.impiego || '',
    categoria: c.categoria ? String(c.categoria) : '',
    funzione: c.funzione || '',
    percentuale: String(parseFloat(c.percentuale) || 1),
    lingue: c.lingue || '',
    reparto_dip: c.reparto_dip || 'slots',
    data_nascita: c.data_nascita ? dataNascitaLabel(c.data_nascita, false) : '',
    data_assunzione: _gcDataIt(c.data_assunzione),
  };
  const dopo = {
    impiego: val('gc-impiego'),
    categoria: val('gc-categoria'),
    funzione: val('gc-funzione'),
    percentuale: val('gc-perc') !== undefined ? String(parseFloat(val('gc-perc'))) : undefined,
    lingue: val('gc-lingue') !== undefined ? val('gc-lingue').trim() : undefined,
    reparto_dip: val('gc-settore'),
    data_nascita: val('gc-nascita') !== undefined ? val('gc-nascita').trim() : undefined,
    data_assunzione: val('gc-inizio') !== undefined ? val('gc-inizio').trim() : undefined,
  };
  const cambiati = Object.keys(dopo).filter((k) => dopo[k] !== undefined && dopo[k] !== prima[k]);
  if (!cambiati.length) {
    gcChiudiScheda(true);
    toast('Nessuna modifica');
    return;
  }
  const b = document.getElementById('gc-salva');
  if (b) b.disabled = true;
  // ogni campo cambiato passa dalla sua funzione (stessi controlli e storico di prima), in
  // modo "scheda": niente messaggi sparsi, ritorna l esito e il motivo (opz.errore)
  const esiti = {};
  for (const k of cambiati) {
    const opz = { scheda: true };
    let ok = false;
    if (k === 'impiego' && p.puoImp) ok = await cambiaImpiegoCollaboratore(id, dopo.impiego, opz);
    else if (k === 'categoria' && p.puoCat) ok = await cambiaCategoriaCollaboratore(id, dopo.categoria, opz);
    else if (k === 'funzione') ok = await cambiaFunzioneCollaboratore(id, dopo.funzione, opz);
    else if (k === 'percentuale') ok = await cambiaPercentualeCollaboratore(id, dopo.percentuale, opz);
    else if (k === 'lingue') ok = await cambiaLingueCollaboratore(id, dopo.lingue, opz);
    else if (k === 'data_nascita' || k === 'data_assunzione') ok = await cambiaDataCollaboratore(id, k, dopo[k], opz);
    else if (k === 'reparto_dip' && p.adminFull) ok = await cambiaRepartoCollaboratore(id, dopo.reparto_dip, opz);
    else opz.errore = 'permesso';
    esiti[k] = { ok: ok === true, errore: opz.errore };
  }
  // verifica: rileggo dal database i campi cambiati. Una riga che non si rilegge e esclusa
  // dai permessi (altro settore): non e salvato niente, anche se nessuno ha dato errore.
  let rec = null;
  let letto = false;
  try {
    const r = await secGet('collaboratori?id=eq.' + id + '&limit=1');
    rec = Array.isArray(r) ? r[0] || null : null;
    letto = true;
  } catch (e) {}
  const nonSalvati = [];
  cambiati.forEach((k) => {
    if (!esiti[k].ok) nonSalvati.push(k);
  });
  if (rec) {
    const ora = {
      impiego: rec.impiego || '',
      categoria: rec.categoria ? String(rec.categoria) : '',
      funzione: rec.funzione || '',
      percentuale: String(parseFloat(rec.percentuale) || 1),
      reparto_dip: rec.reparto_dip || 'slots',
    };
    cambiati.forEach((k) => {
      if (nonSalvati.includes(k)) return;
      if (ora[k] !== undefined && ora[k] !== dopo[k]) nonSalvati.push(k);
      if (k === 'data_nascita' || k === 'data_assunzione') {
        // stessa lettura di cambiaDataCollaboratore: 12.01.1997, 12/01/1997, solo 12.01
        const atteso = dopo[k] ? _parseDataNascita(dopo[k]) : null;
        if (String(rec[k] || '').substring(0, 10) !== String(atteso || '')) nonSalvati.push(k);
      }
    });
    Object.assign(c, rec);
    const inCache = (collaboratoriCache || []).find((x) => x.id === id);
    if (inCache && inCache !== c) Object.assign(inCache, rec);
  }
  if (b) b.disabled = false;
  const permesso = (letto && !rec) || cambiati.some((k) => !esiti[k].ok && collabErrorePermesso(esiti[k].errore));
  if (permesso) {
    // la scheda resta aperta: si vede cosa si voleva cambiare
    toastErrore('Non hai il permesso di modificare questo collaboratore');
    renderCollaboratoriUI();
    return;
  }
  if (nonSalvati.length) {
    const nomi = {
      impiego: 'impiego',
      categoria: 'categoria',
      funzione: 'funzione',
      percentuale: 'percentuale',
      lingue: 'lingue',
      reparto_dip: 'settore',
      data_nascita: 'data di nascita',
      data_assunzione: 'inizio attività',
    };
    const salvati = cambiati.filter((k) => !nonSalvati.includes(k));
    // una data che si e scelto di non cambiare (Annulla nella domanda) non e un errore
    const soloAnnullati = nonSalvati.every((k) => esiti[k].errore === 'annullato');
    const motivo = nonSalvati.map((k) => esiti[k].errore).find((e) => e && typeof e === 'object' && e.message);
    if (soloAnnullati && !salvati.length) return;
    toastErrore(
      (salvati.length ? 'Salvato: ' + salvati.map((k) => nomi[k] || k).join(', ') + '. ' : '') +
        'Non salvato: ' +
        nonSalvati.map((k) => nomi[k] || k).join(', ') +
        (motivo ? ' (' + String(motivo.message).substring(0, 120) + ')' : '') +
        '. Controlla e riprova.',
    );
    renderCollaboratoriUI();
    return;
  }
  window._gcModificata = false;
  gcChiudiScheda(true);
  toast('Scheda di ' + c.nome + ' salvata');
  renderCollaboratoriUI();
}
