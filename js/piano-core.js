/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano.js
 */

// ================================================================
// SEZIONE 25: PIANO DI LAVORO (ereditato dal progetto Turnivo)
// Griglia mensile collaboratori × giorni: codici turno (S22, R4...)
// e codici speciali (V, M, C, F...). Dati on-demand, NON in loadAll.
// Fase 1: griglia + modifica manuale + malattie dal Diario +
// tabella fabbisogno vs assegnati. (Fase 2: validatore + bozza)
// ================================================================

let _pianoCfgCaricata = false;
let pianoTurniCache = [];
let pianoCodiciCache = [];
let pianoFestiviCache = [];
let pianoRegoleCache = [];
let _pianoCongediNp = []; // congedi non pagati (RAP 5.14), tutti i settori
let _pianoRighe = []; // righe del mese/settore correnti
// Data di oggi in ORA LOCALE: toISOString() e' UTC e fra mezzanotte e le 2
// del 1 del mese restituiva ancora il mese prima.
function _pianoOggiStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _pianoYmOggi() {
  return _pianoOggiStr().substring(0, 7);
}
let _pianoMeseSel = _pianoYmOggi();
let _pianoCellaSel = null; // {nome, data} in modifica

// Colori dei codici speciali · PALETTE ORIGINALE TURNIVO (= formattazione
// condizionale dell'Excel del casinò). I codici non elencati restano bianchi.
const PIANO_COLORI_SPECIALI = {
  V: '#00B0F0',
  V1: '#00B0F0',
  CGF: '#00B0F0',
  M: '#FFFF00',
  M1: '#FFFF00',
  I: '#FFFF00',
  I1: '#FFFF00',
  LRD: '#FFFF00',
  JG: '#FFFF00',
  C: '#FBD4B4',
  RC: '#FFC000',
  ND: '#F2DBDB',
};

// REGOLE e FESTIVI: erano riservati ad admin e per gli altri la scheda restava
// completamente vuota, senza spiegazione. Ora sono permessi delegabili (es. al
// responsabile o a HR) dalle Impostazioni, e chi non li ha legge il perche'.
function puoGestireRegole() {
  return (isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_regole'))) && _pianoModTabOk();
}
function puoGestireFestivi() {
  return (isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_festivi'))) && _pianoModTabOk();
}
function _pianoSchedaRiservata(titolo, permesso) {
  return (
    '<div class="main-card"><div class="card-header">' +
    titolo +
    '</div><div style="padding:18px 20px;font-size:.9rem;line-height:1.6">' +
    '<p>Questa scheda e riservata. Serve il permesso <b>' +
    permesso +
    '</b>.</p>' +
    '<p style="color:var(--muted);font-size:.85rem;margin-top:8px">Lo assegna un amministratore da <b>Impostazioni · Visibilita e permessi</b>, scegliendo "Operatori selezionati" e aggiungendo il tuo nome.</p>' +
    '</div></div>'
  );
}
// GIORNI CHIUSI: passata la giornata di gioco (piu' il respiro fino all'ora
// limite del giorno dopo), il piano di quel giorno si modifica solo con uno
// sblocco motivato e tracciato. Permesso dedicato, assegnabile per nome.
// SCHEDE DEL PIANO personalizzabili (Impostazioni · Visibilita e permessi):
// ogni scheda puo' essere nascosta, visibile a tutti o a operatori scelti, e la
// modifica puo' essere ristretta separatamente (chi resta fuori vede in sola
// lettura). L'admin vede e modifica sempre; i permessi esistenti (gestione
// piano, regole, festivi...) continuano a valere IN AGGIUNTA.
function _pianoVisOk(chiave) {
  if (isAdmin()) return true;
  const v = typeof visGet === 'function' ? visGet(chiave) : 'tutti';
  if (v === 'nascosto' || v === 'admin') return false;
  if (v && typeof v === 'object' && v.tipo === 'selezionati')
    return !!(v.operatori && v.operatori.includes(getOperatore()));
  return true;
}
function pianoTabVisibile(id) {
  return _pianoVisOk('ptab_' + id);
}
function pianoTabModificabile(id) {
  return _pianoVisOk('ptabmod_' + id);
}
// La restrizione di modifica vale per le AZIONI fatte dentro la pagina Piano:
// le scritture di sistema (es. la malattia registrata dal Diario che si
// sincronizza nel piano) non c'entrano con la scheda aperta e passano.
function _pianoModTabOk() {
  if (isAdmin()) return true;
  const pg = document.querySelector('.page.active');
  if (pg && pg.id && pg.id !== 'page-piano') return true;
  return pianoTabModificabile(_pianoTab);
}
function puoSbloccareGiorniChiusi() {
  return isAdmin() || (typeof puoModificare === 'function' && puoModificare('sblocco_piano_chiuso'));
}
// Cella che coperture, scambi e ricerche NON devono usare: bloccata con
// motivo (visita medica, corso...) oppure il congedo del compleanno.
function _pianoCellaRiservata(r) {
  if (!r) return '';
  if (r.motivo_blocco) return r.motivo_blocco;
  if (
    String(r.commento || '')
      .trim()
      .toLowerCase() === 'compleanno'
  )
    return 'Compleanno';
  return '';
}
function _pianoGiornoBloccato(dstr) {
  return PianoRegole.giornoBloccato(dstr, new Date(), {
    attivo: String(_pianoRegolaVal('blocco_giorni_chiusi')).toUpperCase() !== 'FALSE',
    oraLimite: parseFloat(_pianoRegolaVal('blocco_ora_limite')) || 12,
  });
}
// giorni sbloccati in questa sessione: { 'YYYY-MM-DD': scadenza in ms }
let _pianoSbloccati = {};
function _pianoGiornoSbloccato(dstr) {
  const fino = _pianoSbloccati[dstr];
  if (!fino) return false;
  if (Date.now() > fino) {
    delete _pianoSbloccati[dstr];
    return false;
  }
  return true;
}
// Controllo unico prima di ogni scrittura sul piano. Ritorna true se si puo'
// procedere; se il giorno e' chiuso e l'operatore ha il permesso, chiede il
// motivo e sblocca per dieci minuti (tutto finisce nel registro).
// MESE CHIUSO: stesso principio dei giorni, applicato al saldo del mese.
// Passato il mese (piu' il respiro), il saldo di quel mese si corregge solo con
// motivo tracciato: e' un dato che finisce in busta paga.
function _pianoMeseBloccato(ym) {
  return PianoRegole.meseBloccato(ym, new Date(), {
    attivo: String(_pianoRegolaVal('blocco_giorni_chiusi')).toUpperCase() !== 'FALSE',
    oraLimite: parseFloat(_pianoRegolaVal('blocco_ora_limite')) || 12,
  });
}
function _pianoConsentiSaldoMese(ym) {
  if (!_pianoMeseBloccato(ym)) return true;
  const chiave = 'mese-' + ym;
  if (_pianoGiornoSbloccato(chiave)) return true;
  const MESI = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const lbl = (MESI[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  if (!puoSbloccareGiorniChiusi()) {
    toast('Il mese di ' + lbl + ' e chiuso: per correggerlo serve il permesso "Giorni chiusi"');
    return false;
  }
  const motivo = prompt(
    'MESE CHIUSO \u00b7 ' +
      lbl +
      "\n\nIl saldo di un mese passato e' un dato consolidato: si corregge solo con un motivo, che resta nel registro.\n\nScrivi il MOTIVO della correzione (obbligatorio):",
  );
  if (motivo === null || !String(motivo).trim()) {
    toast('Correzione annullata: senza motivo il mese resta chiuso');
    return false;
  }
  _pianoSbloccati[chiave] = Date.now() + 10 * 60 * 1000;
  logAzione('Mese chiuso sbloccato', ym + ': ' + String(motivo).trim().substring(0, 200));
  toast('Mese ' + lbl + ' sbloccato per 10 minuti');
  return true;
}
function _pianoConsentiScrittura(dstr, silenzioso) {
  if (!dstr || !_pianoGiornoBloccato(dstr)) return true;
  if (_pianoGiornoSbloccato(dstr)) return true;
  const dataIt = String(dstr).split('-').reverse().join('.');
  if (!puoSbloccareGiorniChiusi()) {
    if (!silenzioso) toast('Giornata del ' + dataIt + ' chiusa: per correggerla serve il permesso "Giorni chiusi"');
    return false;
  }
  if (silenzioso) return false;
  const motivo = prompt(
    'GIORNATA CHIUSA \u00b7 ' +
      dataIt +
      "\n\nIl piano dei giorni passati non si modifica piu' per distrazione: e' un documento.\n\nScrivi il MOTIVO della correzione (obbligatorio, resta nel registro).\nIl giorno restera' sbloccato per dieci minuti:",
  );
  if (motivo === null || !String(motivo).trim()) {
    toast('Correzione annullata: senza motivo il giorno resta chiuso');
    return false;
  }
  _pianoSbloccati[dstr] = Date.now() + 10 * 60 * 1000;
  logAzione('Giorno chiuso sbloccato', dstr + ': ' + String(motivo).trim().substring(0, 200));
  toast('Giorno ' + dataIt + ' sbloccato per 10 minuti');
  return true;
}
function puoGestirePiano() {
  const base = typeof puoModificare === 'function' ? puoModificare('gestione_piano') : isAdmin();
  return base && _pianoModTabOk();
}
// BRIEFING: permesso separato dal piano · gli operatori possono compilare e
// modificare il foglio del giorno senza toccare la griglia dei turni
function puoGestireBriefing() {
  return (
    (puoGestirePiano() || (typeof puoModificare === 'function' && puoModificare('gestione_briefing'))) &&
    _pianoModTabOk()
  );
}

let pianoMappatureCache = [];
let pianoRegoleGruppoCache = [];
// regole attive per un gruppo (maiuscolo), port di eligibility.py
// regole "chi fa cosa" del settore aperto (turni_solo_funzioni, funzione_turni_giorni)
function _pianoRegoleTurnoFunzione() {
  return pianoRegoleGruppoCache.filter(
    (r) =>
      r.attivo !== false &&
      (r.reparto_dip || 'slots') === _pianoReparto() &&
      /^(turni_solo_funzioni|funzione_turni_giorni)$/.test(String(r.tipo_regola || '').toLowerCase()),
  );
}
// Funzioni che a mano possono fare qualsiasi turno (regola funzioni_fanno_tutto):
// il Supervisor copre anche i livelli sotto, come in Formazione
function _pianoFunzioniFannoTutto() {
  const v = _pianoRegolaVal('funzioni_fanno_tutto');
  const testo = v == null ? 'SUP,RESP' : String(v);
  return new Set(
    testo
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );
}
// motivo della violazione per 'nome' con il turno t nel giorno dow (JS, 0=dom), o null.
// automatica = true quando decide la bozza: li' le regole del settore valgono
// per tutti; a mano (scrittura, validatore, cambi) chi "fa tutto" passa.
function _pianoViolazioneFunzioneTurno(nome, t, dow, automatica) {
  const info = _pianoCollabInfo(nome) || {};
  const fz = String(info.funzione || '').toUpperCase();
  if (!automatica && fz && _pianoFunzioniFannoTutto().has(fz)) return null;
  const infoS = Object.assign({}, info, { _settori: _pianoSettoriEffettivi(info) || [] });
  return PianoRegole.violazioneFunzioneTurno(infoS, t, dow, _pianoRegoleTurnoFunzione());
}
function _pianoRegoleGruppoDi(gruppo) {
  const g = (gruppo || '').toUpperCase();
  return pianoRegoleGruppoCache.filter(
    (r) => r.attivo !== false && (r.gruppo || '').toUpperCase() === g && (r.reparto_dip || 'slots') === _pianoReparto(),
  );
}
// Competenze certificate in Formazione -> gruppi del piano.
// Mappatura personalizzabile (imp 'piano_competenze_gruppi'); default per
// le competenze standard dei reparti.
const _COMPETENZE_GRUPPI_DEFAULT = {
  sala: 'SALA',
  reception: 'REC',
  cassa: 'CASSA',
  bo: 'BO',
  sup: 'SUP',
  croupier: 'SALA',
  ispettore: 'SALA',
  cassa_tavoli: 'CASSA',
  valet_servizio: 'VALET',
  valet_accoglienza: 'ACCOGLIENZA',
};
function _pianoCompetenzeGruppi() {
  const cfg = window._pianoCompGruppiCfg;
  return cfg && typeof cfg === 'object'
    ? Object.assign({}, _COMPETENZE_GRUPPI_DEFAULT, cfg)
    : _COMPETENZE_GRUPPI_DEFAULT;
}
// Settori EFFETTIVI: settori assegnati (fonte di verità, M2M Turnivo) +
// gruppi sbloccati dalle competenze CERTIFICATE in Formazione.
// null = nessuna configurazione (si usa la storia dei turni).
function _pianoSettoriEffettivi(info) {
  if (!info) return null;
  let base = info.settori_piano
    ? info.settori_piano
        .toUpperCase()
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const mappa = _pianoCompetenzeGruppi();
  const comp = info.competenze || {};
  const chiaviMappate = Object.keys(mappa).filter((k) => mappa[k]);
  const haFormazione = chiaviMappate.some((k) => comp[k] === true);
  if (haFormazione) {
    // La FORMAZIONE comanda sui gruppi collegati: spunta = idoneo, senza
    // spunta = escluso (es. tolto dalla cassa). I settori importati restano
    // validi solo per i gruppi NON collegati a una competenza.
    const gruppiMappati = [...new Set(chiaviMappate.map((k) => mappa[k].toUpperCase()))];
    base = base.filter((g) => !gruppiMappati.includes(g));
    chiaviMappate.forEach((k) => {
      if (comp[k] === true && !base.includes(mappa[k].toUpperCase())) base.push(mappa[k].toUpperCase());
    });
  }
  return base.length || info.settori_piano != null ? base : null;
}
function _pianoCampoOk(info, valore) {
  // 'campo>N' / 'campo>=N' -> true se il collaboratore PASSA il controllo
  for (const op of ['>=', '>']) {
    const i = valore.indexOf(op);
    if (i > 0) {
      const campo = valore.substring(0, i).trim();
      const soglia = parseFloat(valore.substring(i + op.length));
      if (isNaN(soglia)) return true;
      const v = parseFloat((info || {})[campo]) || 0;
      return op === '>=' ? v >= soglia : v > soglia;
    }
  }
  return true;
}
let _pianoOreSett = 41; // ore settimanali contratto (imp 'piano_ore_settimanali')
async function _pianoCaricaCfg() {
  if (_pianoCfgCaricata) return;
  const [
    turni,
    codici,
    festivi,
    regole,
    mappature,
    oreSett,
    funzioni,
    ordineCollab,
    regoleGruppo,
    compGruppi,
    maxCambi,
    giorniWk,
    giornoMarker,
    corsiOrari,
    ggFormazione,
    cdConfig,
    evidCfg,
    solverUrl,
  ] = await Promise.all([
    secGet('piano_turni?order=ordine.asc&limit=500'),
    secGet('piano_codici?order=codice.asc&limit=200'),
    secGet('piano_festivi?order=data.asc&limit=200'),
    secGet('piano_regole?order=id.asc&limit=200'),
    secGet('piano_mappature?order=funzione.asc&limit=500'),
    getImp('piano_ore_settimanali'),
    getImp('piano_funzioni'),
    getImp('piano_ordine_collab'),
    secGet('piano_regole_gruppo?order=gruppo.asc,id.asc&limit=200'),
    getImp('piano_competenze_gruppi'),
    getImp('piano_max_cambi_mese'),
    getImp('piano_giorni_weekend'),
    getImp('piano_giorno_marker'),
    getImp('piano_corsi_orari'),
    getImp('piano_giorni_formazione'),
    getImp('piano_cd_config'),
    getImp('brief_evidenziazioni'),
    getImp('piano_solver_url'),
  ]);
  pianoRegoleGruppoCache = regoleGruppo || [];
  try {
    window._pianoCompGruppiCfg = compGruppi ? JSON.parse(compGruppi) : null;
  } catch (e) {
    window._pianoCompGruppiCfg = null;
  }
  try {
    window._briefEvidCfg = evidCfg ? JSON.parse(evidCfg) : {};
  } catch (e) {
    window._briefEvidCfg = {};
  }
  window._pianoMaxCambiCfg = parseInt(maxCambi) || 0;
  window._pianoSolverUrl = (solverUrl || '').trim(); // motore esterno (server interno), vuoto = non collegato
  try {
    window._pianoWeekendCfg = giorniWk ? JSON.parse(giorniWk) : null;
  } catch (e) {
    window._pianoWeekendCfg = null;
  }
  try {
    window._pianoGiornoMarker = giornoMarker ? JSON.parse(giornoMarker) : {};
  } catch (e) {
    window._pianoGiornoMarker = {};
  }
  try {
    window._pianoCorsiOrari = corsiOrari ? JSON.parse(corsiOrari) : {};
  } catch (e) {
    window._pianoCorsiOrari = {};
  }
  if (!window._pianoCorsiOrari.CS) window._pianoCorsiOrari.CS = '14:30-17:30';
  // lista CORSI personalizzabile (admin): solo queste sigle appaiono nel
  // pianificatore corsi; gli altri codici restano codici normali
  try {
    const cl = await getImp('piano_corsi_lista');
    window._pianoCorsiLista = cl
      ? cl
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean)
      : ['CS', 'LRD', 'ANTINCENDIO'];
  } catch (e) {
    window._pianoCorsiLista = ['CS', 'LRD', 'ANTINCENDIO'];
  }
  window._pianoGgFormazione = parseInt(ggFormazione) || 5;
  try {
    window._pianoCdCfg = cdConfig ? JSON.parse(cdConfig) : null;
  } catch (e) {
    window._pianoCdCfg = null;
  }
  if (!window._pianoCdCfg || !Array.isArray(window._pianoCdCfg.coppie))
    window._pianoCdCfg = {
      coppie: [
        { cd: ['2', '7'], apre: 'C0', chiude: 'C5' },
        { cd: ['3', '4'], apre: 'C23', chiude: 'C20' },
        { cd: ['8', '9'], apre: 'C4', chiude: 'C15' },
      ],
    };
  if (!window._pianoCorsiOrari.LRD) window._pianoCorsiOrari.LRD = '';
  try {
    window._pianoOrdineCollab = ordineCollab ? JSON.parse(ordineCollab) : {};
  } catch (e) {
    window._pianoOrdineCollab = {};
  }
  pianoTurniCache = turni || [];
  pianoCodiciCache = codici || [];
  pianoFestiviCache = festivi || [];
  pianoRegoleCache = regole || [];
  pianoMappatureCache = mappature || [];
  try {
    _pianoCongediNp = (await secGet('collab_congedi_np?order=dal.desc&limit=5000')) || [];
  } catch (e) {
    _pianoCongediNp = [];
  }
  _pianoOreSett = parseFloat(oreSett) || 41;
  try {
    window._pianoFunzioni = funzioni ? JSON.parse(funzioni) : null;
  } catch (e) {}
  if (!Array.isArray(window._pianoFunzioni) || !window._pianoFunzioni.length)
    window._pianoFunzioni = ['RESP', 'SUP', 'BO', 'HOST'];
  _pianoCfgCaricata = true;
}
// mappature del SETTORE aperto: ogni settore ha le sue sigle
function _pianoMappFunzione(funzione, rep) {
  if (!funzione) return null;
  const settore = rep || _pianoReparto();
  const m = pianoMappatureCache.filter((x) => x.funzione === funzione && (x.reparto_dip || 'slots') === settore);
  return m.length ? m : null;
}
// multi-reparto: appartiene al reparto corrente se è il suo principale
// oppure se elencato nei suoi "reparti extra" (es. valet che fa anche slots)
// Condizioni di copertura in un settore che NON e' il suo (impostate in
// Gestione collaboratori): tetto mensile di turni, gruppi ammessi, accompagnato
function _pianoCoperturaCfg(info, rep) {
  const r = rep || _pianoReparto();
  if (!info || (info.reparto_dip || 'slots') === r) return null;
  let o = info.copertura_reparti;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch (e) {
      o = null;
    }
  }
  return (o && o[r]) || {};
}
function _pianoAppartieneAlReparto(c, rep) {
  const r = rep || _pianoReparto();
  if ((c.reparto_dip || 'slots') === r) return true;
  return String(c.reparti_extra || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .includes(r);
}
// accompagnamento_settori: accetta CSV ("REC") e vecchio JSON (["REC"])
function _pianoAccompagnamentoDi(info) {
  const raw = info && info.accompagnamento_settori;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim().toUpperCase());
  const str = String(raw).trim();
  if (str.startsWith('[')) {
    try {
      return JSON.parse(str).map((x) => String(x).trim().toUpperCase());
    } catch (e) {}
  }
  return str
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}
// loadAll tiene in memoria solo i collaboratori ATTIVI: per distinguere
// "non attivo" da "non esiste" si tiene un elenco leggero dei disattivati
async function _pianoCaricaInattivi() {
  if (window._collabInattivi) return;
  window._collabInattivi = [];
  try {
    window._collabInattivi = (await secGet('collaboratori?attivo=eq.false&select=nome,reparto_dip')) || [];
  } catch (e) {}
}
function _pianoInattivoInfo(nome) {
  return (window._collabInattivi || []).find((c) => (c.nome || '').toLowerCase() === nome.toLowerCase());
}
// CGF = riposo compensativo per i festivi (RAP 4.3): spetta al personale
// d'esercizio FISSO. Il personale ausiliario (jolly) non lo matura: per il
// RAP Allegato 1 prende il supplemento del 50% sul salario orario.
function _pianoMaturaCgf(info) {
  if (!info) return false;
  if (info.impiego === 'jolly') return false;
  if (info.impiego === 'fisso') return true;
  return !info.is_jolly; // schede senza impiego indicato: vale il vecchio campo
}
function _pianoCollabInfo(nome) {
  return collaboratoriCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
}

function _pianoTurniReparto() {
  return pianoTurniCache.filter((t) => t.attivo !== false && (t.reparto_dip || 'slots') === _pianoReparto());
}
function _pianoTurnoInfo(codice) {
  return _pianoTurniReparto().find((t) => t.codice === codice) || pianoTurniCache.find((t) => t.codice === codice);
}
function _pianoCodiceInfo(codice) {
  return pianoCodiciCache.find((c) => c.codice === codice);
}
// Giorni in cui una certa sigla e' presente nel piano: { 'Z12': {'2026-09-11':1} }.
// Si riempie con le righe che vengono caricate, cosi' vale anche per i mesi che
// il saldo annuale e le statistiche attraversano.
let _pianoGiorniConTurno = {};
function _pianoRegistraGiorniTurno(righe) {
  const sigle = (pianoTurniCache || []).map((t) => t.prolunga_se_turno).filter(Boolean);
  if (!sigle.length || !righe || !righe.length) return;
  const cerca = new Set(sigle.map((x) => String(x).toUpperCase()));
  righe.forEach((r) => {
    const cod = String(r.codice || '').toUpperCase();
    if (!cerca.has(cod)) return;
    if (!_pianoGiorniConTurno[cod]) _pianoGiorniConTurno[cod] = {};
    _pianoGiorniConTurno[cod][String(r.data).substring(0, 10)] = 1;
  });
}
function _pianoTurnoPresenteIlGiorno(codice, dstr) {
  if (!codice || !dstr) return false;
  const m = _pianoGiorniConTurno[String(codice).toUpperCase()];
  return !!(m && m[dstr]);
}
// GIORNI DI CHIUSURA TARDI: venerdi e sabato per prassi, le vigilie di
// festivita' e il 31 dicembre. Sono i giorni in cui alcuni turni finiscono piu'
// tardi (es. Z0 alle 20:30 invece che alle 19:45).
function _pianoGiornoChiusuraTardi(dstr) {
  if (!dstr) return false;
  try {
    const cfg = _pianoChiusuraCfg();
    return _pianoChiusuraGiorno(dstr).ora > cfg.oraNormale;
  } catch (e) {
    return false;
  }
}
// Orario e durata EFFETTIVI di un turno in un dato giorno: se il turno ha un
// orario prolungato e quel giorno si chiude tardi, valgono quelli.
function _pianoTurnoDelGiorno(t, dstr) {
  if (!t) return null;
  const base = {
    ora_inizio: t.ora_inizio,
    ora_fine: t.ora_fine,
    durata: parseFloat(t.durata_ore) || 0,
    prolungato: false,
    oltre23: t.oltre23,
    tipo: t.tipo,
  };
  // due criteri, uno solo basta: il giorno chiude tardi, oppure nel piano di
  // quel giorno c'e' il turno che da' il cambio (es. Z12 per Z0)
  const siProlunga =
    !!t.ora_fine_tardi && (_pianoGiornoChiusuraTardi(dstr) || _pianoTurnoPresenteIlGiorno(t.prolunga_se_turno, dstr));
  if (!siProlunga) return base;
  const durataTardi =
    t.durata_ore_tardi != null && t.durata_ore_tardi !== ''
      ? parseFloat(t.durata_ore_tardi)
      : (() => {
          // senza durata scritta si somma la differenza fra i due orari di fine,
          // cosi' resta dentro qualunque correzione gia' presente nella durata
          const f1 = _pianoOra(t.ora_fine);
          const f2 = _pianoOra(t.ora_fine_tardi);
          if (f1 == null || f2 == null) return base.durata;
          const extra = f2 >= f1 ? f2 - f1 : 24 + f2 - f1;
          return Math.round((base.durata + extra) * 100) / 100;
        })();
  return {
    ora_inizio: t.ora_inizio,
    ora_fine: t.ora_fine_tardi,
    durata: durataTardi,
    prolungato: true,
    oltre23: t.oltre23,
    tipo: t.tipo,
  };
}
// Ore pianificate di una RIGA del piano: turno → durata del turno;
// codice con orario personalizzato (es. JG con inizio/fine) → differenza;
// altrimenti ore CCL del codice speciale (scalate per percentuale se previsto)
function _pianoOreDiRiga(r, pct) {
  const t = _pianoTurnoInfo(r.codice);
  if (t) {
    // il turno puo' finire piu' tardi nei giorni di chiusura alle 5
    const eff = _pianoTurnoDelGiorno(t, r.data ? String(r.data).substring(0, 10) : '');
    return eff ? eff.durata : parseFloat(t.durata_ore) || 0;
  }
  if (r.ora_inizio && r.ora_fine) {
    const e = _pianoOra(r.ora_inizio);
    const u = _pianoOra(r.ora_fine);
    if (e != null && u != null) return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
  }
  const cs = _pianoCodiceInfo(r.codice);
  if (cs && parseFloat(cs.ore) > 0) {
    const infoR = r && r.collaboratore ? _pianoCollabInfo(r.collaboratore) : null;
    return _pianoOreCodiceSpeciale(cs, infoR || { percentuale: pct }, r.codice);
  }
  return 0;
}
// Codici che per gli AUSILIARI (jolly) valgono ZERO ore, perche' l'indennita'
// e' gia' compresa e pagata nel salario orario dei giorni lavorati (RAP
// Allegato 1): le vacanze di un jolly non sono giornate pagate a parte, quindi
// contarle in ore le farebbe risultare due volte. Elenco modificabile dalle
// regole (jolly_codici_gia_pagati) senza toccare il programma.
function _pianoCodiciGiaNellaPagaJolly() {
  const v = _pianoRegolaVal('jolly_codici_gia_pagati');
  return String(v == null || v === '' ? 'V,V1' : v)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
// Ore di un codice speciale per un dato collaboratore. Unico punto di verita':
// lo usano sia il piano mensile sia le statistiche dell'anno.
function _pianoOreCodiceSpeciale(cs, info, codice) {
  if (!cs) return 0;
  const ore = parseFloat(cs.ore) || 0;
  if (!ore) return 0;
  const jolly = !!(info && (info.is_jolly || info.impiego === 'jolly'));
  const cod = String(codice || cs.codice || '').toUpperCase();
  if (jolly && _pianoCodiciGiaNellaPagaJolly().indexOf(cod) >= 0) return 0;
  if (!cs.scala_percentuale) return ore;
  // AUSILIARI (jolly): non hanno una percentuale contrattuale. Quella scritta
  // in scheda serve solo da indicazione per la generazione del piano, quindi
  // NON deve ridurre il valore delle assenze: per loro si conta il valore
  // pieno, e le indennita' si calcolano in percentuale sulle ore lavorate.
  if (jolly) return ore;
  return ore * (parseFloat(info && info.percentuale) || 1);
}
function _pianoColore(codice) {
  const t = _pianoTurnoInfo(codice);
  if (t) return t.colore || '';
  return PIANO_COLORI_SPECIALI[codice] || ''; // '' = cella bianca (come Turnivo/Excel)
}
// marcatore del giorno importato dall'Excel (riga 2 del foglio: CS = concessione
// sociale, MN, LRD...) · mostrato nelle intestazioni dei giorni
function _pianoMarkerGiorno(ym, g) {
  const m = (window._pianoGiornoMarker || {})[ym];
  return m ? m[g] || m[String(g)] || '' : '';
}
// colonne a larghezza FISSA condivise da griglia/fabbisogno/differenze/
// effettivi: i giorni si incolonnano alla perfezione tra le tabelle
function _pianoColgroupGiorni(nGiorni) {
  let cg = '';
  for (let g = 1; g <= nGiorni; g++) cg += '<col style="width:37px">';
  return cg;
}
// modifica manuale del marcatore (doppio click sull'intestazione del giorno)
async function pianoMarkerEdit(g) {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const attuale = _pianoMarkerGiorno(ym, g);
  const v = prompt('Marcatore per il giorno ' + g + ' (es. CS, MN, LRD · vuoto per togliere):', attuale);
  if (v === null) return;
  const tutti = window._pianoGiornoMarker || {};
  tutti[ym] = tutti[ym] || {};
  if (v.trim()) tutti[ym][g] = v.trim().toUpperCase();
  else {
    delete tutti[ym][g];
    delete tutti[ym][String(g)];
  }
  window._pianoGiornoMarker = tutti;
  if (!(await salvaImp('piano_giorno_marker', JSON.stringify(tutti)))) return;
  logAzione('Marcatore giorno', ym + '-' + g + ': ' + (v.trim() || '(rimosso)'));
  renderPiano();
}
function _pianoUltimoGiorno(ym) {
  const p = ym.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]), 0).getDate();
}

// Malattie registrate nel Diario → celle "M" automatiche (solo visuali, non salvate).
// Legge le registrazioni tipo Malattia: range "dal gg/mm/aaaa al gg/mm/aaaa" nel testo,
// oppure "N giorni" dalla data della registrazione, altrimenti il singolo giorno.
// NON DISPONIBILITA' dal Diario: le date sono scritte nel testo della
// registrazione ("(2 giorni: 05/10/2026, 07/10/2026)"): si estraggono e la
// cella del piano mostra ND in automatico; il generatore non assegna turni
function _pianoNdMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoNd = typeof nomeCorrente === 'function' ? nomeCorrente('Non Disponibilità') : 'Non Disponibilità';
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoNd || e.eliminato) return;
    const m = String(e.testo || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g);
    if (!m) return;
    m.forEach((dd) => {
      const par = dd.split('/');
      const dstr = par[2] + '-' + par[1].padStart(2, '0') + '-' + par[0].padStart(2, '0');
      if (dstr.startsWith(ym)) out[e.nome + '|' + dstr] = true;
    });
  });
  return out;
}
// Date coperte da una registrazione di malattia: "dal X al Y", "il X (1
// giorno)", "N giorni" dalla data della registrazione
function _pianoDateMalattia(testo, dataReg) {
  testo = String(testo || '');
  let da = String(dataReg || '').substring(0, 10);
  let a = da;
  const mRange = testo.match(/dal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+al\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  const mIl = testo.match(/\bil\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
  const mGiorni = testo.match(/(\d+)\s*giorn[oi]/i);
  if (mRange) {
    da = mRange[3] + '-' + mRange[2].padStart(2, '0') + '-' + mRange[1].padStart(2, '0');
    a = mRange[6] + '-' + mRange[5].padStart(2, '0') + '-' + mRange[4].padStart(2, '0');
  } else if (mIl) {
    da = mIl[3] + '-' + mIl[2].padStart(2, '0') + '-' + mIl[1].padStart(2, '0');
    a = da;
  } else if (mGiorni && da) {
    const d = new Date(da + 'T12:00:00');
    d.setDate(d.getDate() + parseInt(mGiorni[1]) - 1);
    a = d.toISOString().substring(0, 10);
  }
  const out = [];
  if (!da) return out;
  const cur = new Date(da + 'T12:00:00');
  let n = 0;
  while (cur.toISOString().substring(0, 10) <= a && n < 400) {
    out.push(cur.toISOString().substring(0, 10));
    cur.setDate(cur.getDate() + 1);
    n++;
  }
  return out;
}
// SINCRONIZZAZIONE PIANO dopo la correzione di una malattia nel Diario:
// le M salvate nei giorni non piu' coperti vengono tolte, i giorni nuovi
// ricevono la M protetta. Chiamata da salvaModificaRegistrazione
async function sincronizzaMalattiaPiano(nome, testoVecchio, dataVecchia, testoNuovo) {
  try {
    const vecchie = _pianoDateMalattia(testoVecchio, dataVecchia);
    const nuove = _pianoDateMalattia(testoNuovo, dataVecchia);
    if (!vecchie.length && !nuove.length) return null;
    const daTogliere = vecchie.filter((d) => !nuove.includes(d));
    const daMettere = nuove.filter((d) => !vecchie.includes(d));
    if (!daTogliere.length && !daMettere.length) return null;
    const info = collaboratoriCache.find((c) => c.nome.toLowerCase() === String(nome).toLowerCase());
    const rep = (info && info.reparto_dip) || 'slots';
    let tolte = 0;
    let messe = 0;
    // via le M salvate nei giorni sbagliati, MA solo se nessun'altra
    // registrazione di malattia copre ancora quel giorno: un periodo lungo e'
    // salvato nel Diario come una registrazione per giorno, e accorciarne una
    // non deve cancellare le M dei giorni delle altre
    const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
    const dataVecchiaStr = String(dataVecchia || '').substring(0, 10);
    const copertoAltrove = (d) =>
      (typeof datiCache !== 'undefined' ? datiCache : []).some(
        (e) =>
          e.tipo === tipoMal &&
          !e.eliminato &&
          String(e.nome || '').toLowerCase() === String(nome).toLowerCase() &&
          String(e.data || '').substring(0, 10) !== dataVecchiaStr &&
          _pianoDateMalattia(e.testo || '', e.data).includes(d),
      );
    for (const d of daTogliere) {
      if (copertoAltrove(d)) continue;
      const righe =
        (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + d + '&codice=eq.M')) || [];
      for (const r of righe) {
        // la M aveva coperto un altra sigla (turno, V, CGF, JG...): quella torna al suo posto
        const era = String(r.commento || '').match(/^Malattia dal Diario \u00b7 era ([A-Z0-9]+)/);
        if (era && era[1] && era[1] !== 'M') {
          await secPatch('piano', 'id=eq.' + r.id, {
            codice: era[1],
            protetto: ['V', 'V1', 'CGF'].includes(era[1]),
            commento: '',
            operatore: getOperatore(),
            updated_at: new Date().toISOString(),
          });
        } else await secDel('piano', 'id=eq.' + r.id);
        tolte++;
      }
    }
    // M protetta su QUALSIASI sigla del giorno: turno, vacanza V, CGF, JG, C...
    // La malattia prevale (regola del casino): il giorno di vacanza viene
    // restituito, il CGF resta a credito, il turno perso diventa malattia.
    // La sigla coperta resta scritta nel commento ("era V") cosi, se la
    // malattia viene tolta dal Diario, torna al suo posto. Senza cella, basta
    // la M automatica dal Diario.
    for (const d of daMettere) {
      const righe = (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + d)) || [];
      const r = righe[0];
      if (r && r.codice !== 'M' && r.codice !== 'M1') {
        await secPatch('piano', 'id=eq.' + r.id, {
          codice: 'M',
          protetto: true,
          generato: false,
          motivo_blocco: null, // la malattia scioglie il blocco con motivo
          commento: ('Malattia dal Diario · era ' + r.codice).substring(0, 400),
          operatore: getOperatore(),
          updated_at: new Date().toISOString(),
        });
        messe++;
      }
    }
    // festivo saltato per malattia: i recuperi automatici in piu' tornano C
    for (const ymM of new Set(nuove.map((d) => d.substring(0, 7)))) await _pianoRiconciliaCgf(nome, ymM);
    if (tolte || messe) {
      logAzione('Malattia: piano allineato', nome + ' · ' + tolte + ' M tolte, ' + messe + ' celle diventate M');
      if (typeof _pianoRighe !== 'undefined' && _pianoRighe.length && typeof renderPiano === 'function') {
        _pianoRighe = _pianoRighe.filter(
          (r) => !(r.collaboratore === nome && r.codice === 'M' && daTogliere.includes(r.data)),
        );
        renderPiano();
      }
    }
    return { tolte: tolte, messe: messe };
  } catch (e) {
    console.error('sync malattia piano', e);
    return null;
  }
}
function _pianoMalattieMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  // stesso parser della sincronizzazione (_pianoDateMalattia): "dal X al Y",
  // "il X" (giorno singolo corretto dal Diario) e "N giorni". Prima "il X"
  // non veniva capito e la M restava sul giorno della registrazione.
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoMal || e.eliminato) return;
    _pianoDateMalattia(e.testo || '', e.data).forEach((d) => {
      if (d >= inizio && d <= fine) out[e.nome + '|' + d] = true;
    });
  });
  return out;
}

// Tab della sezione Piano (come la navbar di Turnivo: ogni voce una schermata)
let _pianoTab = localStorage.getItem('piano_tab') || 'calendario';
// Icone = Bootstrap Icons (le stesse della navbar di Turnivo), incorporate SVG
const _PIANO_TABS = [
  [
    'crediti',
    'Crediti',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1H1zm7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V5zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V7a2 2 0 0 1-2-2H3z"/></svg>',
  ],
  [
    'recupero',
    'Recupero ore',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>',
  ],
  [
    'calendario',
    'Calendario',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/></svg>',
  ],
  [
    'briefing',
    'Briefing',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M13 2.5a1.5 1.5 0 0 1 3 0v11a1.5 1.5 0 0 1-3 0v-.214c-2.162-1.241-4.49-1.843-6.912-2.083l.405 2.712A1 1 0 0 1 5.51 15.1h-.548a1 1 0 0 1-.916-.599l-1.85-3.49-.202-.003A2.014 2.014 0 0 1 0 9V7a2.02 2.02 0 0 1 1.992-2.013 75 75 0 0 0 2.483-.075c3.043-.154 6.148-.849 8.525-2.199zm1 0v11a.5.5 0 0 0 1 0v-11a.5.5 0 0 0-1 0m-1 1.35c-2.344 1.205-5.209 1.842-8 2.033v4.233q.27.015.537.036c2.568.189 5.093.744 7.463 1.993zm-9 6.215v-4.13a95 95 0 0 1-1.992.052A1.02 1.02 0 0 0 1 7v2c0 .55.448 1.002 1.006 1.009A61 61 0 0 1 4 10.065m1.09 1.047 1.278.245.401 2.688-.548.002z"/></svg>',
  ],
  [
    'vacanze',
    'Vacanze',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/></svg>',
  ],
  [
    'turni',
    'Turni',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>',
  ],
  [
    'regole',
    'Regole',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M9.05 3a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0V3zM4.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M2.05 8a2.5 2.5 0 0 1 4.9 0H16v1H6.95a2.5 2.5 0 0 1-4.9 0H0V8zm9.45 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m-2.45 1a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0v-1z"/></svg>',
  ],
  [
    'festivi',
    'Festivi',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4 .5a.5.5 0 0 0-1 0V1H2a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V1H4zM1 14V4h14v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1m7-6.507c1.664-1.711 5.825 1.283 0 5.132-5.825-3.85-1.664-6.843 0-5.132"/></svg>',
  ],
  [
    'timbrature',
    'Timbrature',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.06 6.5a.5.5 0 0 1 .5.5v.776a11.5 11.5 0 0 1-.552 3.519l-1.331 4.14a.5.5 0 0 1-.952-.305l1.33-4.141a10.5 10.5 0 0 0 .504-3.213V7a.5.5 0 0 1 .5-.5Z"/><path d="M6.06 7a2 2 0 1 1 4 0 .5.5 0 1 1-1 0 1 1 0 1 0-2 0v.332q0 .613-.066 1.221A.5.5 0 0 1 6 8.447q.06-.555.06-1.115zm3.509 1a.5.5 0 0 1 .487.513 11.5 11.5 0 0 1-.587 3.339l-1.266 3.8a.5.5 0 0 1-.949-.317l1.267-3.8a10.5 10.5 0 0 0 .535-3.048A.5.5 0 0 1 9.569 8m-3.356 2.115a.5.5 0 0 1 .33.626L5.24 14.939a.5.5 0 1 1-.955-.296l1.303-4.199a.5.5 0 0 1 .625-.329"/><path d="M4.759 5.833A3.501 3.501 0 0 1 11.559 7a.5.5 0 0 1-1 0 2.5 2.5 0 0 0-4.857-.833.5.5 0 1 1-.943-.334m.3 1.67a.5.5 0 0 1 .449.546 10.7 10.7 0 0 1-.4 2.031l-1.222 4.072a.5.5 0 1 1-.958-.287L4.15 9.793a9.7 9.7 0 0 0 .363-1.842.5.5 0 0 1 .546-.449Zm6 .647a.5.5 0 0 1 .5.5c0 1.28-.213 2.552-.632 3.762l-1.09 3.145a.5.5 0 0 1-.944-.327l1.089-3.145c.382-1.105.578-2.266.578-3.435a.5.5 0 0 1 .5-.5Z"/><path d="M3.902 4.222a5 5 0 0 1 5.202-2.113.5.5 0 0 1-.208.979 4 4 0 0 0-4.163 1.69.5.5 0 0 1-.831-.556m6.72-.955a.5.5 0 0 1 .705-.052A4.99 4.99 0 0 1 13.059 7v1.5a.5.5 0 1 1-1 0V7a3.99 3.99 0 0 0-1.386-3.028.5.5 0 0 1-.051-.705M3.68 5.842a.5.5 0 0 1 .422.568q-.044.289-.044.59c0 .71-.1 1.417-.298 2.1l-1.14 3.923a.5.5 0 1 1-.96-.279L2.8 8.821A6.5 6.5 0 0 0 3.058 7q0-.375.054-.736a.5.5 0 0 1 .568-.422m8.882 3.66a.5.5 0 0 1 .456.54c-.084 1-.298 1.986-.64 2.934l-.744 2.068a.5.5 0 0 1-.941-.338l.745-2.07a10.5 10.5 0 0 0 .584-2.678.5.5 0 0 1 .54-.456"/><path d="M4.81 1.37A6.5 6.5 0 0 1 14.56 7a.5.5 0 1 1-1 0 5.5 5.5 0 0 0-8.25-4.765.5.5 0 0 1-.5-.865m-.89 1.257a.5.5 0 0 1 .04.706A5.48 5.48 0 0 0 2.56 7a.5.5 0 0 1-1 0c0-1.664.626-3.184 1.655-4.333a.5.5 0 0 1 .706-.04ZM1.915 8.02a.5.5 0 0 1 .346.616l-.779 2.767a.5.5 0 1 1-.962-.27l.778-2.767a.5.5 0 0 1 .617-.346m12.15.481a.5.5 0 0 1 .49.51c-.03 1.499-.161 3.025-.727 4.533l-.07.187a.5.5 0 0 1-.936-.351l.07-.187c.506-1.35.634-2.74.663-4.202a.5.5 0 0 1 .51-.49"/></svg>',
  ],
  [
    'saldo',
    'Saldo',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/><path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/><path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/></svg>',
  ],
  [
    'statistiche',
    'Statistiche',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12h.5a.5.5 0 0 1 0 1H.5a.5.5 0 0 1 0-1H1v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7h1zm1 12h2V2h-2zm-3 0V7H7v7zm-5 0v-3H2v3z"/></svg>',
  ],
  [
    'benessere',
    'Benessere',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"/></svg>',
  ],
  [
    'storico',
    'Storico',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/></svg>',
  ],
  [
    'formulari',
    'Formulari',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 7a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1zM5 9.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/><path d="M9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5zm0 1v2A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/></svg>',
  ],
  [
    'guida',
    'Guida',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783"/></svg>',
  ],
  [
    'impostazioni',
    'Impostazioni',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/></svg>',
  ],
];
function pianoCambiaTab(t) {
  _pianoFlushSalva();
  if (!pianoTabVisibile(t)) {
    toast('Questa scheda non e visibile per il tuo operatore');
    return;
  }
  _pianoTab = t;
  localStorage.setItem('piano_tab', t);
  renderPiano();
}
// Le 13 tab raggruppate in 3 famiglie: si trova tutto a colpo d'occhio
const PIANO_TAB_GRUPPI = [
  ['Giornata', ['calendario', 'briefing']],
  [
    'Gestione',
    ['crediti', 'vacanze', 'saldo', 'recupero', 'timbrature', 'statistiche', 'benessere', 'storico', 'formulari'],
  ],
  ['Configurazione', ['turni', 'regole', 'festivi', 'impostazioni', 'guida']],
];
function _pianoTabBar() {
  const tabHtml = (k) => {
    const t = _PIANO_TABS.find((x) => x[0] === k);
    if (!t) return '';
    if (!pianoTabVisibile(k)) return ''; // scheda nascosta a questo operatore
    return (
      '<span class="piano-tab' +
      (k === _pianoTab ? ' attiva' : '') +
      '" onclick="pianoCambiaTab(\'' +
      k +
      '\')">' +
      (t[2] || '') +
      ' ' +
      t[1] +
      '</span>'
    );
  };
  const inGruppi = PIANO_TAB_GRUPPI.flatMap(([, keys]) => keys);
  const fuori = _PIANO_TABS.map(([k]) => k).filter((k) => !inGruppi.includes(k));
  return (
    '<div class="piano-tabs">' +
    PIANO_TAB_GRUPPI.map(([lbl, keys]) => {
      const dentro = keys.map(tabHtml).join('');
      if (!dentro) return ''; // nessuna scheda visibile in questo gruppo
      return (
        '<div class="piano-tabgroup"><span class="piano-tabgroup-label">' +
        lbl +
        '</span><div class="piano-tabgroup-tabs">' +
        dentro +
        '</div></div>'
      );
    })
      .filter(Boolean)
      .join('<div class="piano-tabsep"></div>') +
    (fuori.length
      ? '<div class="piano-tabsep"></div><div class="piano-tabgroup"><span class="piano-tabgroup-label">&nbsp;</span><div class="piano-tabgroup-tabs">' +
        fuori.map(tabHtml).join('') +
        '</div></div>'
      : '') +
    '</div>'
  );
}

// ORE REALI DEL MESE scritte a mano (tabella piano_ore_mese). Finche' la
// timbratrice non e' collegata, chi gestisce il piano puo' correggere il totale
// del mese: dove esiste una rettifica, saldo del mese e YTD usano quella invece
// delle ore pianificate. Si tiene traccia di chi ha scritto e quando.
let _pianoOreMese = {}; // 'nome|YYYY-MM' -> record
let _pianoOreMeseKey = '';
async function _pianoCaricaOreMese(ym) {
  if (_pianoOreMeseKey === ym) return;
  _pianoOreMeseKey = ym;
  _pianoOreMese = {};
  const r = (await secGet('piano_ore_mese?anno_mese=eq.' + ym + '&limit=3000')) || [];
  r.forEach((x) => (_pianoOreMese[x.collaboratore + '|' + x.anno_mese] = x));
}
// Rettifica del mese per un collaboratore (null se non c'e')
function _pianoRettificaMese(nome, ym) {
  return _pianoOreMese[nome + '|' + (ym || _pianoMeseSel)] || null;
}

// YTD saldo cumulato da gennaio al mese precedente (port di
// compute_ytd_saldo_map di Turnivo): per ogni mese usa le ore timbrate se
// presenti, altrimenti le ore piano (turni + codici speciali scalati);
// saldo_mese = ore - dovute; jolly esclusi.
let _pianoYtdMap = {};
let _pianoYtdKey = '';
async function _pianoAggiornaYtd(nomi) {
  const ym = _pianoMeseSel;
  // servono per sapere quali giorni chiudono tardi (turni con orario prolungato)
  await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
  const chiave = ym + '|' + _pianoReparto();
  if (_pianoYtdKey === chiave) return;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  _pianoYtdMap = {};
  _pianoYtdKey = chiave;
  if (mese <= 1) return;
  const fine = ym + '-01';
  // SCALA CON MOLTI SETTORI: le ore YTD di un collaboratore possono stare in
  // piu' reparti (coperture), quindi si caricano per collaboratore (solo i nomi
  // del settore corrente) a piccoli gruppi, senza scaricare l'intero anno di
  // tutti i settori (che con 20+ settori troncherebbe e falserebbe il saldo)
  const righe = [];
  const timbrate = [];
  const _daA = anno + '-01-01';
  for (let i = 0; i < nomi.length; i += 8) {
    const grp = nomi.slice(i, i + 8);
    const res = await Promise.all(
      grp
        .map((n) =>
          secGet(
            'piano?collaboratore=eq.' + encodeURIComponent(n) + '&data=gte.' + _daA + '&data=lt.' + fine + '&limit=500',
          ),
        )
        .concat(
          grp.map((n) =>
            secGet(
              'piano_timbrature?collaboratore=eq.' +
                encodeURIComponent(n) +
                '&data=gte.' +
                _daA +
                '&data=lt.' +
                fine +
                '&limit=500',
            ),
          ),
        ),
    );
    res.slice(0, grp.length).forEach((rr) => {
      if (rr) {
        righe.push(...rr);
        _pianoRegistraGiorniTurno(rr);
      }
    });
    res.slice(grp.length).forEach((rr) => rr && timbrate.push(...rr));
  }
  const perMese = {}; // nome|m -> ore piano
  (righe || []).forEach((r) => {
    const m = parseInt(r.data.split('-')[1]);
    const info = _pianoCollabInfo(r.collaboratore) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const o = _pianoOreDiRiga(r, pct);
    if (o) perMese[r.collaboratore + '|' + m] = (perMese[r.collaboratore + '|' + m] || 0) + o;
  });
  const timbMese = {}; // nome|m -> ore timbrate
  (timbrate || []).forEach((t) => {
    const m = parseInt(t.data.split('-')[1]);
    timbMese[t.collaboratore + '|' + m] = (timbMese[t.collaboratore + '|' + m] || 0) + (parseFloat(t.ore) || 0);
  });
  // ore reali scritte a mano nei mesi passati: hanno la precedenza su tutto,
  // perche' sono il totale verificato da chi gestisce il piano
  const rettMese = {}; // nome|m -> ore reali
  const rett = (await secGet('piano_ore_mese?anno_mese=gte.' + anno + '-01&anno_mese=lt.' + ym + '&limit=5000')) || [];
  rett.forEach((x) => {
    const m = parseInt(String(x.anno_mese).split('-')[1]);
    rettMese[x.collaboratore + '|' + m] = parseFloat(x.ore_reali) || 0;
  });
  // scostamenti giornalieri dei mesi gia' passati (scheda Recupero ore)
  const recMese = {}; // nome|m -> ore in piu'/in meno
  const recAnno =
    (await secGet(
      'piano_recupero_ore?data=gte.' +
        _daA +
        '&data=lt.' +
        fine +
        '&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=20000',
    )) || [];
  recAnno.forEach((x) => {
    const m = parseInt(String(x.data).split('-')[1]);
    const k = x.collaboratore + '|' + m;
    recMese[k] = (recMese[k] || 0) + (parseFloat(x.ore) || 0);
  });
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    if (info.is_jolly) return;
    const pct = parseFloat(info.percentuale) || 1; // senza percentuale vale 100%, come nel calcolo del mese
    let cum = 0;
    for (let m = 1; m < mese; m++) {
      const dim = _pianoGgDovuti(n, anno + '-' + String(m).padStart(2, '0')); // meno i giorni di congedo non pagato
      const dovute = Math.round((dim / 7) * _pianoOreSett * pct * 100) / 100;
      const k = n + '|' + m;
      const effettive =
        rettMese[k] != null ? rettMese[k] : timbMese[k] != null ? timbMese[k] : (perMese[k] || 0) + (recMese[k] || 0);
      cum += effettive - dovute;
    }
    _pianoYtdMap[n] = Math.round(cum * 100) / 100;
  });
}

// Scrive le ORE REALI di un mese per un collaboratore. Il saldo del mese e'
// un valore calcolato (ore meno dovute): si corregge la causa, cioe' le ore,
// non l'effetto. Cosi' il numero resta spiegabile e continua ad aggiornarsi.
async function pianoScriviOreMese(nome) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return;
  }
  const ym = _pianoMeseSel;
  const info = _pianoCollabInfo(nome) || {};
  if (info.is_jolly) {
    // per gli ausiliari non esistono ore dovute, quindi non esiste un saldo da
    // correggere: le loro ore sono quelle che risultano dai turni fatti
    toast('Gli ausiliari non hanno ore dovute: il saldo non si applica');
    return;
  }
  // mese passato: si corregge solo con motivo tracciato
  if (!_pianoConsentiSaldoMese(ym)) return;
  const att = _pianoRettificaMese(nome, ym);
  const riga = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(nome) + '"]');
  const pianificate = riga ? (riga.querySelector('td[data-tot="4"]') || {}).textContent : '';
  const val = prompt(
    'Ore realmente lavorate da ' +
      nome +
      ' nel mese ' +
      ym +
      '.\n\nPianificate dal programma: ' +
      String(pianificate || '').replace('*', '') +
      ' ore.\nScrivi il totale reale (vuoto = torna alle ore del piano):',
    att ? String(att.ore_reali) : '',
  );
  if (val === null) return;
  const testo = String(val).trim().replace(',', '.');
  try {
    if (testo === '') {
      if (att) {
        await secDel('piano_ore_mese', 'id=eq.' + att.id);
        delete _pianoOreMese[nome + '|' + ym];
        logAzione('Ore reali del mese tolte', nome + ' ' + ym + ' (erano ' + att.ore_reali + 'h)');
        _pianoRegistraModifica('Saldo ore', nome, 'ore reali ' + ym, att.ore_reali + 'h', 'ore del piano');
        toast('Salvato \u00b7 rettifica tolta: ' + nome + ' torna alle ore del piano');
      }
    } else {
      const ore = parseFloat(testo);
      if (isNaN(ore) || ore < 0 || ore > 400) {
        toast('Valore non valido');
        return;
      }
      const nota = prompt('Motivo della correzione (facoltativo, resta nello storico):', (att && att.nota) || '');
      if (nota === null) return;
      const dati = {
        collaboratore: nome,
        anno_mese: ym,
        ore_reali: ore,
        nota: String(nota).trim() || null,
        operatore: getOperatore(),
        reparto_dip: _pianoReparto(),
        modificato_il: new Date().toISOString(),
      };
      if (att) {
        await secPatch('piano_ore_mese', 'id=eq.' + att.id, dati);
        _pianoOreMese[nome + '|' + ym] = Object.assign({}, att, dati);
      } else {
        const nuovo = await secPost('piano_ore_mese', dati);
        _pianoOreMese[nome + '|' + ym] = (nuovo && nuovo[0]) || Object.assign({ creato_il: dati.modificato_il }, dati);
      }
      logAzione(
        'Ore reali del mese',
        nome +
          ' ' +
          ym +
          ': ' +
          (att ? att.ore_reali + 'h' : 'ore del piano') +
          ' \u2192 ' +
          ore +
          'h' +
          (dati.nota ? ' (' + dati.nota + ')' : ''),
      );
      _pianoRegistraModifica(
        'Saldo ore',
        nome,
        'ore reali ' + ym,
        att ? att.ore_reali + 'h' : 'ore del piano',
        ore + 'h',
      );
      toast('Salvato \u00b7 ' + nome + ' ' + ym + ': ' + ore + 'h (' + _pianoOreHm(ore) + ')');
    }
    _pianoYtdKey = ''; // l'YTD dei mesi seguenti cambia: si ricalcola
    renderPiano();
  } catch (e) {
    toast('Errore nel salvataggio (la tabella piano_ore_mese esiste?)');
    console.error('pianoScriviOreMese', e);
  }
}

// Scrive una cella del piano gestendo il caso "riga gia' presente": puo'
// succedere quando la riga esiste in un ALTRO settore (coperture) e quindi non
// e' tra quelle caricate in memoria. In quel caso si aggiorna invece di
// inserire, cosi' una generazione non si ferma a meta' lavoro.
async function _pianoInserisciCella(dati) {
  // stessa regola dei giorni chiusi per OGNI inserimento, da qualunque flusso
  // arrivi (bozza, scambi, coperture): il controllo sta nel punto unico
  if (dati && dati.data && !_pianoConsentiScrittura(String(dati.data).substring(0, 10)))
    throw new Error('giorno chiuso: ' + dati.data);
  try {
    const n = await secPost('piano', dati);
    return n && n[0] ? n[0] : null;
  } catch (e) {
    const msg = (e && (e.message || String(e))) || '';
    if (!/duplicate key|already exists|23505/i.test(msg)) throw e;
    const filtro = 'collaboratore=eq.' + encodeURIComponent(dati.collaboratore) + '&data=eq.' + dati.data;
    const patch = Object.assign({}, dati);
    delete patch.collaboratore;
    delete patch.data;
    patch.updated_at = new Date().toISOString();
    await secPatch('piano', filtro, patch);
    const ora = await secGet('piano?' + filtro + '&limit=1');
    return ora && ora[0] ? ora[0] : null;
  }
}

// Carica le righe di un mese per un settore, in modo che SCALI con molti
// settori. Una query filtrata per il settore corrente, piu' le righe dei
// collaboratori di ALTRI settori che coprono qui (reparti_extra): di ognuno si
// caricano TUTTE le righe del mese, in qualunque settore lavori, cosi' si vede
// quando e' gia' occupato altrove e non lo si assegna due volte. Le query dei
// coprenti girano in parallelo a gruppi: il tempo dipende dai coprenti del
// settore aperto, non dal numero totale di settori, e non c'e' troncamento.
async function _pianoCaricaMeseSettore(da, a, rep) {
  const righe =
    (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + rep + '&limit=20000')) || [];
  // subito, PRIMA di qualunque uscita anticipata: serve a sapere in quali giorni
  // e' previsto il turno che fa prolungare un altro (es. Z12 per Z0)
  _pianoRegistraGiorniTurno(righe);
  const coprenti = collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') !== rep && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  if (!coprenti.length) return righe;
  // dedup per id: una copertura del coprente gia' nel settore corrente e' gia'
  // tra le righe caricate sopra e non va aggiunta due volte
  const visti = new Set(righe.map((r) => r.id));
  for (let i = 0; i < coprenti.length; i += 25) {
    const blocchi = await Promise.all(
      coprenti
        .slice(i, i + 25)
        .map((n) =>
          secGet(
            'piano?collaboratore=eq.' + encodeURIComponent(n) + '&data=gte.' + da + '&data=lte.' + a + '&limit=400',
          ),
        ),
    );
    blocchi.forEach(
      (rr) =>
        rr &&
        rr.forEach((r) => {
          if (!visti.has(r.id)) {
            visti.add(r.id);
            righe.push(r);
          }
        }),
    );
  }
  return righe;
}
async function renderPiano() {
  const el = document.getElementById('piano-content');
  if (!el) return;
  // dati non ancora arrivati (login appena fatto): mostra l'attesa e riprova
  // da solo · a caricamento finito loadAll richiama comunque renderPiano
  if (!window._loadAllDone && (!collaboratoriCache || !collaboratoriCache.length)) {
    el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento dati&hellip;</p>';
    clearTimeout(window._pianoAttesaTimer);
    window._pianoAttesaTimer = setTimeout(() => renderPiano(), 800);
    return;
  }
  // niente "Caricamento" che accorcia la pagina (faceva saltare lo scroll
  // in cima a ogni cambio giorno/mese): il contenuto vecchio resta visibile
  // sbiadito finché il nuovo non è pronto, poi lo scroll viene ripristinato
  const scrollPrec = window.scrollY;
  if (!el.firstChild) el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento piano...</p>';
  else el.style.opacity = '0.55';
  try {
    await _pianoCaricaCfg();
    // la scheda ricordata potrebbe essere stata nascosta a questo operatore
    if (!pianoTabVisibile(_pianoTab)) {
      const prima = _PIANO_TABS.map((x) => x[0]).find((k) => pianoTabVisibile(k));
      _pianoTab = prima || 'calendario';
    }
    const ym = _pianoMeseSel;
    // FESTIVITA' PRIMA DI TUTTO: da queste dipende quali giorni chiudono tardi,
    // e quindi la durata dei turni che si prolungano. Se il dato non c'e', le
    // ore risulterebbero corte senza che nessuno se ne accorga: va caricato per
    // OGNI scheda, non solo per il calendario.
    await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
    const nGiorni = _pianoUltimoGiorno(ym);
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    _pianoRighe = await _pianoCaricaMeseSettore(da, a, _pianoReparto());
    const mappa = {}; // 'nome|data' -> riga
    _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + r.data] = r));
    const malattie = _pianoMalattieMese(ym);
    const ndMap = _pianoNdMese(ym);
    const festiviSet = {};
    pianoFestiviCache.forEach((f) => (festiviSet[f.data] = f.descrizione));

    // righe: collaboratori attivi del settore + eventuali nomi presenti solo nel piano
    // ordine predefinito: prima i SUP, poi i BO, poi gli altri (alfabetico);
    // se l'operatore ha riordinato a mano (drag della riga) vale quell'ordine
    const rangoFn = (n) => {
      const info = _pianoCollabInfo(n) || {};
      if (info.is_jolly) return 3; // i jolly in fondo, come nel foglio Excel
      const f = ((info.funzione || '') + '').toUpperCase();
      if (f === 'RESP' || f === 'VICERESP') return 0;
      return f === 'SUP' ? 0 : f === 'BO' ? 1 : 2;
    };
    const ordinePred = (x, y) => rangoFn(x) - rangoFn(y) || x.localeCompare(y);
    const collabs = collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
      .map((c) => c.nome)
      .sort(ordinePred);
    const extra = [...new Set(_pianoRighe.map((r) => r.collaboratore))]
      .filter((n) => !collabs.includes(n))
      .sort(ordinePred);
    let nomi = collabs.concat(extra);
    const ordineSalvato = (window._pianoOrdineCollab || {})[_pianoReparto()];
    if (Array.isArray(ordineSalvato) && ordineSalvato.length) {
      const pos = {};
      ordineSalvato.forEach((n, i) => (pos[n] = i));
      nomi = nomi
        .slice()
        .sort((x, y) => (pos[x] != null ? pos[x] : 9999) - (pos[y] != null ? pos[y] : 9999) || ordinePred(x, y));
    }
    const puoMod = puoGestirePiano();
    const GG = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
    const GG3 = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']; // come Turnivo (GIORNI_SETT)
    const MESI_L = MESI_FULL || [];
    const label = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];

    let h = _pianoTabBar() + _pianoModificheHtml();
    if (_pianoTab === 'calendario') {
      h += '<div class="main-card"><div class="card-header pbar"><div class="pbar-riga">';
      h +=
        '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><span style="min-width:150px;text-align:center;font-weight:700">' +
        escP(label) +
        '</span><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>';
      h +=
        '<select onchange="pianoCambiaReparto(this.value)" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
      const ammessiRep = _pianoRepartiAmmessi();
      getReparti()
        .filter((rp) => ammessiRep.includes(rp.key))
        .forEach((rp) => {
          h +=
            '<option value="' +
            rp.key +
            '"' +
            (rp.key === _pianoReparto() ? ' selected' : '') +
            ' style="color:#000">' +
            escP(rp.label) +
            '</option>';
        });
      h += '</select>';
      if (puoMod) {
        const nU = (window._pianoUndo || []).length;
        const nR = (window._pianoRedo || []).length;
        h +=
          '<button class="btn-act pin pundo' +
          (nU ? ' pundo-on' : '') +
          '" title="' +
          (nU ? 'Annulla: ' + escP(window._pianoUndo[nU - 1].label) : 'Niente da annullare') +
          '"' +
          (nU ? '' : ' disabled') +
          ' onclick="pianoAnnulla()">&#8630;</button>' +
          '<button class="btn-act pin pundo' +
          (nR ? ' pundo-on' : '') +
          '" title="' +
          (nR ? 'Ripristina: ' + escP(window._pianoRedo[nR - 1].label) : 'Niente da ripristinare') +
          '"' +
          (nR ? '' : ' disabled') +
          ' onclick="pianoRipristina()">&#8631;</button>' +
          '<span id="piano-autosave" title="Ogni modifica al piano si salva da sola nel database, subito. Le frecce servono per tornare indietro o avanti se sbagli.">Salvataggio automatico</span>' +
          '<input type="text" id="piano-cerca" placeholder="Cerca nome o sigla..." value="' +
          escP(window._pianoCercaTesto || '') +
          '" oninput="pianoCercaFiltra(this.value)" title="Mostra solo i collaboratori il cui nome contiene il testo, oppure chi ha quella sigla nel mese (es. C8). Vuoto = tutti">';
        const ssnap = (window._pianoSessSnap || {})[_pianoMeseSel + '|' + _pianoReparto()];
        if (ssnap)
          h +=
            '<button class="btn-export" style="font-size:.82rem;padding:3px 9px;border-color:#c0392b;color:#c0392b" title="Riporta questo mese a com\'era quando hai iniziato a modificarlo in questa sessione (' +
            ssnap.n +
            ' operazioni tue)" onclick="pianoAnnullaTutto()">Annulla tutto (' +
            ssnap.n +
            ')</button>';
      }
      h += '</div>'; // fine riga navigazione
      // barra comandi in gruppi etichettati: Pianifica · Controlla · Strumenti · Esporta
      const pbtn = (label, onclick, tipo, title) =>
        '<button class="btn-export pbar-btn' +
        (tipo ? ' ' + tipo : '') +
        '"' +
        (title ? ' title="' + title + '"' : '') +
        ' onclick="' +
        onclick +
        '">' +
        label +
        '</button>';
      const pgrp = (label, inner) =>
        inner ? '<span class="pbar-grp"><span class="pbar-grp-lbl">' + label + '</span>' + inner + '</span>' : '';
      h += '<div class="pbar-riga">';
      if (puoMod) {
        let g = pbtn(
          'Genera bozza',
          'generaBozzaPiano()',
          'pbar-ok',
          'Riempie il fabbisogno con i collaboratori di questo settore (chi copre da altri settori NON viene usato)',
        );
        if (window._pianoSolverUrl)
          g += pbtn(
            'Genera con il solver',
            'generaConSolver()',
            'pbar-ok',
            'Motore di ottimizzazione sul server interno (OR-Tools): piano ottimo del mese, equita garantita. Usa le stesse regole del settore e non tocca le celle esistenti',
          );
        if (collaboratoriCache.some((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoCoperturaCfg(c)))
          g += pbtn(
            'Completa con coperture',
            'completaConCoperture()',
            '',
            'Tappa i buchi rimasti usando i collaboratori di altri settori abilitati a coprire qui. Da usare DOPO aver generato i piani dei loro reparti',
          );
        g += pbtn(
          'Migliora ore',
          'miglioraOrePiano()',
          '',
          'Dopo la bozza: scambia turni generati tra chi è sopra e chi è sotto le ore dovute (stesso giorno, regole rispettate)',
        );
        h += pgrp('Pianifica', g);
        h += pgrp(
          'Controlla',
          pbtn(
            'Valida regole',
            'validaPiano()',
            '',
            'Controlla tutto il mese contro le regole del settore e mostra le violazioni',
          ) +
            pbtn(
              'Copertura malattia',
              'apriCoperturaMalattia()',
              '',
              'Trova chi puo coprire i turni di un collaboratore in malattia',
            ),
        );
        h += pgrp(
          'Strumenti',
          pbtn(
            'Ordine predefinito',
            'ripristinaOrdinePiano()',
            '',
            'Trascina i nomi per riordinare; questo pulsante ripristina SUP, BO, poi gli altri',
          ) +
            _pianoColoriBarHtml() +
            pbtn(
              'Cancella piano',
              'cancellaBozzaPiano()',
              'pbar-warn',
              'Svuota il mese di questo settore (si puo annullare)',
            ),
        );
      }
      let ge =
        pbtn('Copia per Excel', 'copiaPianoExcel()', 'pbar-soft') + pbtn('Stampa PDF', 'stampaPianoPDF()', 'pbar-soft');
      if (puoMod) {
        ge += pbtn('Importa piano', "document.getElementById('piano-imp-file').click()", 'pbar-soft');
        ge +=
          '<input type="file" id="piano-imp-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importaPianoExcel(this)">';
      }
      h += pgrp('Esporta', ge);
      h +=
        '<span class="pbar-info">' +
        _pianoRighe.length +
        ' assegnazioni' +
        (puoMod ? ' · click modifica, trascina o Shift+click per selezionare' : ' · sola lettura') +
        '</span></div></div>';
      h += '<div id="piano-violazioni"></div>';

      // NON DISPONIBILITA' JOLLY: promemoria discreto (una riga, chiudibile),
      // scadenza dalla regola nd_jolly_giorno. Niente toni allarmistici.
      if (puoMod && localStorage.getItem('piano_nd_banner_off') !== ym) {
        const oggi = new Date();
        const gLim = _pianoGiornoNd();
        const prossimo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 15);
        const ymNext = prossimo.getFullYear() + '-' + String(prossimo.getMonth() + 1).padStart(2, '0');
        const ndNext = _pianoNdMese(ymNext);
        const consegnato = new Set(Object.keys(ndNext).map((k) => k.split('|')[0].toLowerCase()));
        const jollyMancanti = collaboratoriCache
          .filter(
            (c) =>
              c.attivo !== false &&
              (c.reparto_dip || 'slots') === _pianoReparto() &&
              (c.impiego === 'jolly' || (!c.impiego && c.is_jolly)) &&
              !consegnato.has(c.nome.toLowerCase()),
          )
          .map((c) => c.nome.split(' ')[0]);
        if (jollyMancanti.length) {
          const lblNext = (MESI_FULL[prossimo.getMonth()] || '') + ' ' + prossimo.getFullYear();
          const inTempo = oggi.getDate() <= gLim;
          h +=
            '<div style="margin:6px 0;padding:4px 10px;font-size:.82rem;color:var(--muted);border-left:3px solid ' +
            (inTempo ? '#d4b86a' : '#c0392b') +
            '">Non disponibilita\' ' +
            escP(lblNext) +
            ' (termine: il ' +
            gLim +
            ' del mese)' +
            (inTempo ? '' : ' \u00b7 termine passato') +
            ' \u00b7 senza giorni registrati: ' +
            jollyMancanti.length +
            ' jolly <span title="' +
            escP(jollyMancanti.join(', ')) +
            '" style="cursor:help;text-decoration:underline dotted">(quali?)</span> \u00b7 si registrano dal Diario' +
            ' <a href="#" style="color:inherit;font-weight:700;margin-left:6px" onclick="localStorage.setItem(\'piano_nd_banner_off\',\'' +
            ym +
            '\');renderPiano();return false" title="Nascondi per questo mese">\u2715</a></div>';
        }
      }
      // GRIGLIA
      // le festivita' servono PRIMA di disegnare l'intestazione: e' li' che
      // compare il marcatore di chiusura (CH5/CH7) sopra il numero del giorno
      await _pianoCaricaFestivita(parseInt(ym.split('-')[0]));
      await _pianoCaricaRecupero(ym);
      const LC = _pianoCalcolaLarghezze(nomi);
      h +=
        '<div class="piano-wrap"><table data-seltab="piano" class="piano-table piano-fixed" style="width:' +
        (LC.tot + 37 * nGiorni + 326) +
        'px"><colgroup><col style="width:' +
        LC.nome +
        'px"><col style="width:' +
        LC.fun +
        'px">' +
        _pianoColgroupGiorni(nGiorni) +
        '<col style="width:54px"><col style="width:30px"><col style="width:30px"><col style="width:54px"><col style="width:54px"><col style="width:50px"><col style="width:54px"></colgroup><thead><tr><th class="piano-nome">Collaboratore</th><th class="piano-fun">Fun</th>';
      for (let g = 1; g <= nGiorni; g++) {
        const dstr = ym + '-' + String(g).padStart(2, '0');
        const dow = new Date(dstr + 'T12:00:00').getDay();
        let cls = '';
        if (festiviSet[dstr]) cls = 'piano-festivo';
        else if (dow === 0) cls = 'piano-domenica';
        else if (_pianoGiorniWeekend().includes(dow)) cls = 'piano-weekend';
        if (g === 1) cls += ' piano-sep-left';
        h +=
          '<th class="' +
          cls +
          '" data-g="' +
          g +
          '"' +
          (() => {
            // il suggerimento riunisce festivo cantonale e orario di chiusura
            const _ch = _pianoChiusuraGiorno(dstr);
            const _voci = [];
            if (festiviSet[dstr]) _voci.push(escP(festiviSet[dstr]));
            if (_ch.motivo) _voci.push(escP(_ch.motivo) + ': si chiude alle ' + _ch.ora + ':00');
            else if (_ch.ora !== _pianoChiusuraCfg().oraNormale) _voci.push('si chiude alle ' + _ch.ora + ':00');
            if (_pianoGiornoBloccato(dstr)) _voci.push('GIORNATA CHIUSA: si modifica solo con lo sblocco motivato');
            _voci.push('Doppio click: marcatore del giorno (CS, MN, LRD...)');
            return ' title="' + _voci.join(' \u00b7 ') + '"';
          })() +
          (puoMod ? ' ondblclick="pianoMarkerEdit(' + g + ')"' : '') +
          '>' +
          (_pianoMarkerGiorno(ym, g)
            ? '<div style="font-size:.82rem;background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
              escP(_pianoMarkerGiorno(ym, g)) +
              '</div>'
            : '') +
          // CHIUSURA PIU' TARDI: si segnala solo quando NON e' gia' scontato
          // (venerdi e sabato chiudono alle 5 per prassi, non serve dirlo)
          (_pianoChiusuraGiorno(dstr).marcatore
            ? '<div style="font-size:.82rem;background:#8b4a8b;color:#fff;font-weight:bold;line-height:1.1" title="' +
              escP(_pianoChiusuraGiorno(dstr).motivo || 'chiusura posticipata') +
              '">' +
              _pianoChiusuraGiorno(dstr).marcatore +
              '</div>'
            : '') +
          '<div>' +
          GG3[dow] +
          '</div><div>' +
          g +
          '</div>' +
          (_pianoGiornoBloccato(dstr)
            ? '<div style="font-size:.6rem;line-height:1;opacity:.55" title="Giornata chiusa">&#128274;</div>'
            : '') +
          '</th>';
      }
      h +=
        '<th class="piano-tot piano-sep-left" title="Ore effettivamente lavorate: dall\'entrata all\'uscita, senza il supplemento del 10% e senza malattie, vacanze, CGF, permessi, maternita, matrimonio, militare, nascita, protezione civile, trasloco e assistenza familiare">OL</th>' +
        '<th class="piano-tot" title="Turni diurni">D</th><th class="piano-tot" title="Turni notturni">N</th>' +
        '<th class="piano-tot" title="Ore Dovute">OD</th><th class="piano-tot" title="Ore Pianificate">OP</th>' +
        '<th class="piano-tot" title="Saldo Mensile">SM</th><th class="piano-tot" title="Saldo Anno">YTD</th></tr></thead><tbody>';

      await _pianoAggiornaYtd(nomi);
      await _pianoCaricaOreMese(_pianoMeseSel);
      nomi.forEach((nome) => {
        const ne = nome.replace(/'/g, "\\'");
        const infoC0 = _pianoCollabInfo(nome);
        const perc0 = infoC0 ? parseFloat(infoC0.percentuale) || 1 : 1;
        let ore = 0; // solo turni (colonna Ore = ore_stimate Turnivo)
        // OL = ore EFFETTIVAMENTE lavorate: solo turni di lavoro, senza il
        // supplemento del 10% notturno e senza nessuna assenza retribuita
        // (malattia, vacanza, CGF, maternita', matrimonio, militare, nascita,
        // permesso, protezione civile, trasloco, assistenza familiare)
        let oreLav = 0;
        let oreSpec = 0; // codici speciali (scala_percentuale come Turnivo)
        let nD = 0;
        let nN = 0;
        let riga = '';
        for (let g = 1; g <= nGiorni; g++) {
          const dstr = ym + '-' + String(g).padStart(2, '0');
          const r = mappa[nome + '|' + dstr];
          const codice = r ? r.codice : '';
          let cella = '';
          let stile = '';
          let cls = 'piano-cella';
          if (g === 1) cls += ' piano-sep-left';
          let titolo = '';
          if (r) {
            const t = _pianoTurnoInfo(codice);
            const cs = _pianoCodiceInfo(codice);
            cella = escP(codice);
            const _col = _pianoColore(codice);
            if (_col) stile = 'background:' + _col;
            if (t) {
              // orario del GIORNO: alcuni turni finiscono piu' tardi quando il
              // casino chiude alle 5 (o quando c'e' il turno che da' il cambio)
              const _eff = _pianoTurnoDelGiorno(t, dstr);
              ore += _eff ? _eff.durata : parseFloat(t.durata_ore) || 0;
              oreLav += _pianoOreEffettiveTurno(t, r);
              if (t.tipo === 'NOTTURNO') nN++;
              else nD++;
              titolo =
                codice +
                ' ' +
                (_eff.ora_inizio || '').substring(0, 5) +
                '-' +
                (_eff.ora_fine || '').substring(0, 5) +
                (_eff.prolungato ? ' (prolungato: chiusura tardi) ' + _eff.durata + 'h' : '');
            } else if (cs) {
              oreSpec += _pianoOreDiRiga(r, perc0);
              titolo =
                (cs.descrizione || codice) + (r.ora_inizio && r.ora_fine ? ' ' + r.ora_inizio + '-' + r.ora_fine : '');
            }
            // DUE COSE DIVERSE: "bloccata con motivo" (lucchetto rosso, l'ha
            // chiesto un operatore: visita medica, corso...) e "protetta"
            // (consolidata dall'importazione o dalle vacanze: nessun segno,
            // solo la conferma quando la si sovrascrive)
            if (r.motivo_blocco) {
              cls += ' piano-bloccata';
              titolo += (titolo ? ' \u00b7 ' : '') + 'BLOCCATA: ' + r.motivo_blocco;
            } else if (r.protetto) {
              cls += ' piano-prot';
            }
            if ((r.reparto_dip || 'slots') !== _pianoReparto()) {
              // cella dell'ALTRO reparto di un collaboratore multi-reparto
              stile += (stile ? ';' : '') + 'opacity:.65;font-style:italic';
              titolo = '[' + repartoLabel(r.reparto_dip) + '] ' + titolo;
            }
            if (r.commento) {
              cls += ' piano-comm';
              titolo += (titolo ? ' · ' : '') + r.commento;
            }
            // MALATTIA SU GIORNO DI CONGEDO: il giorno C dentro un periodo di
            // malattia si mostra come MC (0 ore, la C resta nei dati) così la
            // malattia si vede anche dove non c'era un turno da coprire
            if (codice === 'C' && malattie[nome + '|' + dstr]) {
              cella = 'MC';
              cls += ' piano-malattia-c';
              stile = '';
              titolo = 'Malattia su giorno di congedo (C) · 0 ore · dal Diario' + (titolo ? ' · ' + titolo : '');
            }
            // MALATTIA SU GIORNO DI CGF: il recupero non e' stato goduto, il
            // credito resta. Si mostra MCG e non conta come CGF preso
            if (codice === 'CGF' && malattie[nome + '|' + dstr]) {
              cella = 'MCG';
              cls += ' piano-malattia-c';
              stile = '';
              titolo =
                "Malattia nel giorno di recupero festivo (CGF): il recupero non e' goduto e resta a credito" +
                (titolo ? ' · ' + titolo : '');
            }
          } else if (malattie[nome + '|' + dstr]) {
            cella = 'M';
            cls += ' piano-malattia-auto';
            titolo = 'Malattia registrata nel Diario (automatica, non salvata nel piano)';
          } else if (ndMap[nome + '|' + dstr]) {
            cella = 'ND';
            cls += ' piano-nd-auto';
            titolo = "Non disponibilita' registrata nel Diario (automatica): la bozza non assegna turni";
          }
          const violMsg = _pianoViolCelle[nome + '|' + dstr];
          if (violMsg) {
            cls += ' piano-viol';
            titolo += (titolo ? ' · ' : '') + '⚠ ' + violMsg.join(' | ');
          }
          // stile personalizzato della cella: colore (vince sul turno) + formato
          if (r && r.colore) {
            const stC = _stileCella(r.colore);
            if (stC.c) stile += (stile ? ';' : '') + 'background:' + stC.c;
            if (stC.b) stile += ';font-weight:700';
            if (stC.i) stile += ';font-style:italic';
            if (stC.t) stile += ';color:' + stC.t;
          }
          riga +=
            '<td class="' +
            cls +
            '" data-g="' +
            g +
            '" style="' +
            stile +
            '"' +
            (titolo ? ' title="' + escP(titolo) + '"' : '') +
            (r && r.commento ? ' data-commento="' + escP(r.commento) + '"' : '') +
            (puoMod
              ? ' onclick="pianoCellaInline(\'' + ne + "','" + dstr + '\',this)"'
              : ' onclick="pianoCellaClick(\'' + ne + "','" + dstr + '\',this)"') +
            '>' +
            cella +
            '</td>';
        }
        const infoC = infoC0;
        const perc = perc0;
        // come Turnivo: OD=(giorni/7)*ore_sett*pct (jolly=0), OP=turni+speciali, SM=OP-OD, YTD=cumulato da gennaio
        const dovute = infoC && infoC.is_jolly ? 0 : Math.round(((_pianoOreSett * perc * nGiorni) / 7) * 10) / 10;
        const _rett = _pianoRettificaMese(nome);
        // scostamenti giornaliati (scheda Recupero ore): sommati alle ore del
        // piano, cosi' il saldo e' aggiornato giorno per giorno
        const _rec = _pianoRecuperoTotale(nome, ym);
        const orePianificate = Math.round((ore + oreSpec + _rec) * 100) / 100;
        // dove c'e' una rettifica scritta a mano, vale quella: e' il totale
        // reale del mese, quello che finisce in busta paga
        const orePiano = _rett ? Math.round(parseFloat(_rett.ore_reali) * 100) / 100 : orePianificate;
        const saldo = Math.round((orePiano - dovute) * 10) / 10;
        const ytd = Math.round(((_pianoYtdMap[nome] || 0) + saldo) * 10) / 10;
        const _clsRiga =
          infoC && infoC.funzione === 'SUP'
            ? ' class="piano-row-sup"'
            : infoC && infoC.funzione === 'BO'
              ? ' class="piano-row-bo"'
              : '';
        h +=
          '<tr' +
          _clsRiga +
          ' data-nome="' +
          escP(nome) +
          '"><td class="piano-nome" title="' +
          escP(nome) +
          '"><i class="icx icx-stampa piano-pdf-ico" title="Stampa il piano di ' +
          escP(nome) +
          '" onclick="event.stopPropagation();stampaPianoCollaboratore(\'' +
          ne +
          '\')"></i>' +
          escP(nome) +
          (infoC && infoC.lingue
            ? ' <span style="font-size:.82rem;color:var(--muted);font-weight:700">' + escP(infoC.lingue) + '</span>'
            : '') +
          // il collaboratore non e' dell'anagrafica di QUESTO settore (o non
          // c'e' affatto): si segnala, cosi' l'anomalia non passa inosservata
          (!infoC
            ? (() => {
                const ina = _pianoInattivoInfo(nome);
                if (!ina)
                  return '<span class="piano-estraneo" title="Non presente in Gestione collaboratori: funzione, percentuale e ore dovute non vengono calcolate">fuori anagrafica</span>';
                const repIna = ina.reparto_dip || 'slots';
                return (
                  '<span class="piano-estraneo" title="Disattivato in Gestione collaboratori ma presente nel piano' +
                  (repIna !== _pianoReparto() ? ' · settore ' + escP(repartoLabel(repIna)) : '') +
                  '">non attivo' +
                  (repIna !== _pianoReparto() ? ' · ' + escP(repartoLabel(repIna)) : '') +
                  '</span>'
                );
              })()
            : (infoC.reparto_dip || 'slots') !== _pianoReparto()
              ? _pianoAppartieneAlReparto(infoC)
                ? // copertura prevista in Gestione collaboratori: normale, non un errore
                  (() => {
                    const cop = _pianoCoperturaCfg(infoC) || {};
                    return (
                      '<span class="piano-copre" title="Collaboratore ' +
                      escP(repartoLabel(infoC.reparto_dip || 'slots')) +
                      ' abilitato a coprire in questo settore' +
                      (cop.max_turni ? ' · max ' + cop.max_turni + ' turni al mese' : '') +
                      (cop.gruppi ? ' · solo ' + escP(String(cop.gruppi).toUpperCase()) : '') +
                      (cop.accompagnato ? ' · accompagnato' : '') +
                      '">copre &middot; ' +
                      escP(repartoLabel(infoC.reparto_dip || 'slots')) +
                      '</span>'
                    );
                  })()
                : '<span class="piano-estraneo" title="Collaboratore del settore ' +
                  escP(repartoLabel(infoC.reparto_dip || 'slots')) +
                  ': non e\' abilitato a coprire qui, il suo piano dovrebbe stare nel suo settore">' +
                  escP(repartoLabel(infoC.reparto_dip || 'slots')) +
                  '</span>'
              : '') +
          '</td><td class="piano-fun"><strong>' +
          escP(infoC && infoC.is_jolly ? 'JOLLY' : (infoC && infoC.funzione) || '') +
          '</strong> <span style="font-size:.82rem">' +
          Math.round(perc * 100) +
          '%</span></td>' +
          riga +
          '<td class="piano-tot piano-sep-left" data-tot="0" title="ore effettivamente lavorate">' +
          (oreLav ? oreLav.toFixed(1) : '') +
          '</td><td class="piano-tot" data-tot="1">' +
          (nD || '') +
          '</td><td class="piano-tot" data-tot="2">' +
          (nN || '') +
          '</td><td class="piano-tot" data-tot="3" style="color:var(--muted)">' +
          (dovute ? dovute.toFixed(1) : '') +
          '</td><td class="piano-tot piano-op" data-tot="4"' +
          (_rett
            ? ' title="Ore reali del mese scritte da ' +
              escP(_rett.operatore || '') +
              ' il ' +
              String(_rett.creato_il || '').substring(0, 10) +
              (_rett.nota ? ' · ' + escP(_rett.nota) : '') +
              ' · pianificate ' +
              orePianificate.toFixed(1) +
              'h · doppio clic per correggere"'
            : _rec
              ? ' title="Ore del piano ' +
                Math.round((orePianificate - _rec) * 100) / 100 +
                'h con ' +
                (_rec > 0 ? '+' : '') +
                _rec +
                'h dalla scheda Recupero ore. Doppio clic per scrivere le ore realmente fatte nel mese"'
              : ' title="Ore pianificate. Doppio clic per scrivere le ore realmente fatte nel mese"') +
          '>' +
          (orePiano ? orePiano.toFixed(1) : '') +
          (_rett ? '<span class="piano-rett" title="valore scritto a mano">*</span>' : '') +
          '</td><td class="piano-tot piano-sm" data-tot="5" title="Saldo del mese. Doppio clic per scrivere le ore realmente fatte" style="color:' +
          (saldo > 0 ? '#2c6e49' : saldo < 0 ? '#c0392b' : 'var(--muted)') +
          '">' +
          (orePiano || dovute ? (saldo > 0 ? '+' : '') + saldo.toFixed(1) : '') +
          '</td><td class="piano-tot" data-tot="6" style="font-weight:700;color:' +
          (ytd > 0 ? '#2c6e49' : ytd < 0 ? '#c0392b' : 'var(--muted)') +
          '">' +
          (orePiano || _pianoYtdMap[nome] ? (ytd > 0 ? '+' : '') + ytd.toFixed(1) : '') +
          '</td></tr>';
      });
      h += '</tbody></table></div>';

      // legenda
      h += '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;font-size:.8rem;color:var(--muted)">';

      h +=
        '<span><span class="piano-leg piano-comm" style="background:var(--paper2)"></span> triangolo = commento (passa il mouse)</span>';
      h += '<span><span class="piano-leg piano-malattia-c"></span> MC = malattia su giorno di congedo (0 ore)</span>';
      h +=
        '<span><span class="piano-leg piano-malattia-auto" style="background:var(--paper2)">M</span> = malattia dal Diario (automatica)</span>';
      h += '<span>icona rossa = stampa piano del collaboratore · tasto destro su una cella = menu opzioni</span>';
      h += '</div></div>';

      // FABBISOGNO vs ASSEGNATI (editabile: click sulla cella per impostare le persone necessarie)
      const fabb =
        (await secGet(
          'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
        )) || [];
      _pianoFabbCache = fabb;
      const turniRep = _pianoTurniReparto();
      if (turniRep.length) {
        const fabbMap = {}; // codice -> {giorno: quantita}
        fabb.forEach((f) => {
          const g = parseInt(f.data.split('-')[2]);
          (fabbMap[f.turno_codice] = fabbMap[f.turno_codice] || {})[g] = f.quantita;
        });
        const assMap = {}; // codice -> {giorno: n}
        _pianoRighe.forEach((r) => {
          const g = parseInt(r.data.split('-')[2]);
          (assMap[r.codice] = assMap[r.codice] || {})[g] =
            (assMap[r.codice] && assMap[r.codice][g] ? assMap[r.codice][g] : 0) + 1;
        });
        let hFabb = '';
        hFabb +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Pianificazione (fabbisogno) vs assegnati · ' +
          escP(label);
        if (puoMod)
          hFabb +=
            '<button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:#d4b86a;color:#d4b86a" onclick="copiaFabbisognoMese()">Copia dal mese precedente</button>' +
            '<button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'fabb-file\').click()">Importa da Excel</button>' +
            '<input type="file" id="fabb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaFabbisognoExcel(this)">' +
            '<button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFabbisognoMese()">Svuota mese</button>' +
            '<span style="font-size:.82rem;color:#b8a98a;font-weight:400">clicca una cella per impostare le persone necessarie</span>';
        hFabb += '</div>';
        // testata giorni con sigla settimana (D/L/M...), festivi e weekend:
        // usata da fabbisogno, differenze ed effettivi
        const testataGiorni = (conTot) => {
          let t = '<thead><tr><th class="piano-nome">Turno</th>';
          for (let g = 1; g <= nGiorni; g++) {
            const dstr = ym + '-' + String(g).padStart(2, '0');
            const dow = new Date(dstr + 'T12:00:00').getDay();
            let cls = '';
            if (festiviSet[dstr]) cls = 'piano-festivo';
            else if (dow === 0) cls = 'piano-domenica';
            else if (_pianoGiorniWeekend().includes(dow)) cls = 'piano-weekend';
            if (g === 1) cls += ' piano-sep-left';
            t +=
              '<th class="' +
              cls +
              '" data-g="' +
              g +
              '"' +
              (festiviSet[dstr] ? ' title="' + escP(festiviSet[dstr]) + '"' : '') +
              '>' +
              (_pianoMarkerGiorno(ym, g)
                ? '<div style="font-size:.82rem;background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
                  escP(_pianoMarkerGiorno(ym, g)) +
                  '</div>'
                : '') +
              '<div>' +
              GG3[dow] +
              '</div><div>' +
              g +
              '</div></th>';
          }
          if (conTot) t += '<th>Tot</th>';
          return t + '</tr></thead>';
        };
        hFabb +=
          '<div class="piano-wrap"><table data-seltab="fabb" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '</colgroup>' +
          testataGiorni(false) +
          '<tbody>';
        const gruppoOrd = {};
        turniRep.forEach((t, i) => (gruppoOrd[t.codice] = (t.gruppo || '') + '|' + String(i).padStart(3, '0')));
        turniRep
          .slice()
          .sort((x, y) => (gruppoOrd[x.codice] || '').localeCompare(gruppoOrd[y.codice] || ''))
          .forEach((t) => {
            const cod = t.codice;
            hFabb +=
              '<tr><td class="piano-nome" title="' +
              escP(
                (t.gruppo || '') +
                  ' ' +
                  (t.ora_inizio || '').substring(0, 5) +
                  '-' +
                  (t.ora_fine || '').substring(0, 5),
              ) +
              '">' +
              escP(cod) +
              '</td>';
            for (let g = 1; g <= nGiorni; g++) {
              const req = (fabbMap[cod] || {})[g] || 0;
              const ass = (assMap[cod] || {})[g] || 0;
              const cls = g === 1 ? 'piano-sep-left' : '';
              const dstr = ym + '-' + String(g).padStart(2, '0');
              // colori della PIANIFICAZIONE Excel: celle gialle, weekend verdi;
              // la carenza resta segnalata dal numero rosso
              const dow = new Date(dstr + 'T12:00:00').getDay();
              let stile = '';
              if (req) {
                const bg = dow === 0 || _pianoGiorniWeekend().includes(dow) ? '#92D050' : '#FFFF00';
                stile =
                  'background:' + bg + ' !important;font-weight:bold;color:' + (ass >= req ? '#000' : '#c0392b') + ';';
              }
              hFabb +=
                '<td class="' +
                cls +
                '" data-g="' +
                g +
                '"' +
                ' style="' +
                stile +
                (puoMod ? 'cursor:pointer' : '') +
                '"' +
                (puoMod
                  ? ' onclick="fabbisognoInline(\'' + escP(cod) + "','" + dstr + '\',this)"'
                  : ' onclick="fabbCellaClick(\'' + escP(cod) + "','" + dstr + '\',this)"') +
                ' oncontextmenu="fabbCtxMenu(event,\'' +
                escP(cod) +
                "','" +
                dstr +
                '\')"' +
                '>' +
                (req ? ass + '/' + req : '') +
                '</td>';
            }
            hFabb += '</tr>';
          });
        hFabb += '</tbody></table></div>';
        hFabb +=
          '<p style="font-size:.8rem;color:var(--muted);padding:8px 14px">assegnati/richiesti · celle gialle (weekend verdi) come la PIANIFICAZIONE dell&#39;Excel; numero <span style="color:#c0392b;font-weight:700">rosso</span> = carenza. Il fabbisogno guida "Genera bozza".</p></div>';

        // DIFFERENZE + EFFETTIVI · schema IDENTICO a Turnivo (calendario.html):
        // differenze = effettivi - pianificazione (verde >0, rosso <0, vuoto 0),
        // effettivi = conteggio persone per turno/giorno con colonna Tot
        const turniOrdinati = turniRep
          .slice()
          .sort((x, y) => (gruppoOrd[x.codice] || '').localeCompare(gruppoOrd[y.codice] || ''));
        const clsCella = (g) => {
          const dstr = ym + '-' + String(g).padStart(2, '0');
          const dow = new Date(dstr + 'T12:00:00').getDay();
          const sep = g === 1 ? ' piano-sep-left' : '';
          if (dow === 0) return 'piano-cel-dom' + sep;
          if (_pianoGiorniWeekend().includes(dow)) return 'piano-cel-we' + sep;
          return sep.trim();
        };
        const cellaTurno = (t) =>
          '<td class="piano-nome" title="' +
          escP(
            (t.gruppo || '') + ' ' + (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
          ) +
          '">' +
          escP(t.codice) +
          '</td>';

        h +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Differenze · ' +
          escP(label) +
          ' <span style="font-size:.82rem;color:#b8a98a;font-weight:400">(effettivi − pianificazione)</span></div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="diff" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '</colgroup>' +
          testataGiorni(false) +
          '<tbody>';
        turniOrdinati.forEach((t) => {
          h += '<tr>' + cellaTurno(t);
          for (let g = 1; g <= nGiorni; g++) {
            const diff = ((assMap[t.codice] || {})[g] || 0) - ((fabbMap[t.codice] || {})[g] || 0);
            // colori identici all'Excel: negativo bordeaux/bianco, positivo grigio/blu
            const col =
              diff < 0
                ? 'background:#993366 !important;color:#fff'
                : diff > 0
                  ? 'background:#C0C0C0 !important;color:#333399'
                  : '';
            h +=
              '<td class="' +
              clsCella(g) +
              '" data-g="' +
              g +
              '" onclick="if(window.event&&window.event.shiftKey)pianoBloccoClick(\'diff\',this)" style="font-weight:bold;' +
              col +
              '">' +
              (diff !== 0 ? diff : '') +
              '</td>';
          }
          h += '</tr>';
        });
        h += '</tbody></table></div></div>';

        h +=
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Effettivi · ' +
          escP(label) +
          '</div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="eff" class="piano-table piano-fixed" style="width:' +
          (_pianoLC().tot + 37 * nGiorni + 44) +
          'px"><colgroup><col style="width:' +
          _pianoLC().tot +
          'px">' +
          _pianoColgroupGiorni(nGiorni) +
          '<col style="width:44px"></colgroup>' +
          testataGiorni(true) +
          '<tbody>';
        turniOrdinati.forEach((t) => {
          h += '<tr>' + cellaTurno(t);
          let tot = 0;
          for (let g = 1; g <= nGiorni; g++) {
            const q = (assMap[t.codice] || {})[g] || 0;
            tot += q;
            h +=
              '<td class="' +
              clsCella(g) +
              '" data-g="' +
              g +
              '" onclick="if(window.event&&window.event.shiftKey)pianoBloccoClick(\'eff\',this)"' +
              (q > 0 ? ' style="font-weight:bold;background:#335593 !important;color:#fff"' : '') +
              '>' +
              (q > 0 ? q : '') +
              '</td>';
          }
          h += '<td><strong>' + tot + '</strong></td></tr>';
        });
        h += '</tbody></table></div></div>';
        // ordine come nell'Excel: DIFFERENZE, EFFETTIVI, poi PIANIFICAZIONE
        h += hFabb;
      }
    } else if (_pianoTab === 'briefing') {
      h += await _renderPianoBriefingTab();
    } else if (_pianoTab === 'crediti') {
      h += await _renderPianoCreditiTab();
    } else if (_pianoTab === 'vacanze') {
      h += await _renderPianoVacanzeTab();
    } else if (_pianoTab === 'turni') {
      h +=
        '<div id="piano-config">' +
        _renderPianoTurniCard() +
        _renderPianoCodiciCard() +
        _renderPianoCorsiCard() +
        '</div>';
    } else if (_pianoTab === 'regole') {
      h += '<div id="piano-config">' + _renderPianoRegoleCard() + _renderPianoRegoleGruppoCard() + '</div>';
    } else if (_pianoTab === 'festivi') {
      await _generaFestiviSeMancanti();
      await _pianoCaricaFestivita(window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]));
      h += '<div id="piano-config">' + _renderPianoFestiviCard() + _renderPianoFestivitaCard() + '</div>';
    } else if (_pianoTab === 'timbrature') {
      h += '<div id="piano-config">' + _renderPianoTimbratureCard() + '</div>';
    } else if (_pianoTab === 'benessere') {
      h += '<div id="piano-config">' + _renderPianoBenessereCard() + _renderPianoDomenicheCard() + '</div>';
    } else if (_pianoTab === 'statistiche') {
      h += '<div id="piano-config">' + _renderPianoStatCard() + '</div>';
    } else if (_pianoTab === 'saldo') {
      h += await _renderPianoSaldoTab();
    } else if (_pianoTab === 'recupero') {
      h += await _renderPianoRecuperoTab();
    } else if (_pianoTab === 'storico') {
      h += await _renderPianoStoricoTab();
    } else if (_pianoTab === 'formulari') {
      h += await _renderPianoFormulariTab();
    } else if (_pianoTab === 'guida') {
      h += _renderPianoGuidaTab();
    } else if (_pianoTab === 'impostazioni') {
      h +=
        '<div id="piano-config">' +
        _renderPianoImportExportCard() +
        _renderPianoMappatureCard() +
        _renderPianoPreferenzeCard() +
        _renderPianoCongediNpCard() +
        _renderPianoImpostazioniCard() +
        '</div>';
    }
    el.innerHTML = h;
    el.style.opacity = '';
    if (scrollPrec) requestAnimationFrame(() => window.scrollTo(0, scrollPrec));
    if (typeof initCardRichiudibili === 'function' && document.getElementById('piano-config'))
      initCardRichiudibili('piano-config', []);
    if (_pianoTab === 'calendario') {
      _pianoCaricaInattivi().then(() => {
        if (!window._collabInattiviReso && (window._collabInattivi || []).length) {
          window._collabInattiviReso = true;
          renderPiano();
        }
      });
      _pianoInitSelezione();
      _pianoInitSticky();
      _pianoRenderViolazioni();
      _pianoDragBind();
      _pianoTipBind();
      _pianoApplicaNascosti();
    }
    if (_pianoTab === 'recupero' && typeof _pianoRecuperoTotaliGenerali === 'function') {
      _pianoRecuperoTotaliGenerali();
      _recApplicaColoriDom();
      _recDragBind();
    }
    if (_pianoTab === 'saldo') _pianoSaldoBind();
    if (_pianoTab === 'briefing') _briefSelezioneBind();
    if (_pianoTab === 'benessere' && typeof caricaBenesserePiano === 'function')
      setTimeout(() => caricaBenesserePiano(), 60);
    if (_pianoTab === 'benessere' && typeof pianoCaricaDomenicheAnno === 'function')
      setTimeout(() => pianoCaricaDomenicheAnno(), 90);
    if (_pianoTab === 'statistiche' && typeof caricaStatisticheAnnoPiano === 'function')
      setTimeout(() => caricaStatisticheAnnoPiano(true), 50);
    if (_pianoTab === 'statistiche' && typeof caricaConfrontoAnniPiano === 'function')
      setTimeout(() => caricaConfrontoAnniPiano(), 80);
    if (_pianoTab === 'timbrature' && typeof caricaConfrontoTimbrature === 'function')
      setTimeout(() => caricaConfrontoTimbrature(), 50);
  } catch (e) {
    console.error('Errore piano:', e);
    el.style.opacity = '';
    el.innerHTML = '<p style="color:var(--accent);padding:20px">Errore caricamento piano</p>';
  }
}

// Torna al mese in corso da qualunque scheda (frecce del Recupero ore)
function pianoVaiMeseCorrente() {
  _pianoMeseSel = _pianoYmOggi();
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}
function pianoCambiaMese(delta) {
  const p = _pianoMeseSel.split('-');
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1 + delta, 15);
  _pianoMeseSel = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// (la vecchia finestra di modifica cella è stata sostituita dalla
// scrittura diretta nella cella · pianoCellaInline / pianoSalvaCella)
async function rimuoviPianoCella(giaChiuso) {
  const sel = _pianoCellaSel;
  if (!sel) return;
  // GIORNO CHIUSO: la cancellazione e' una modifica come le altre e passa dallo
  // stesso controllo della scrittura (prima sfuggiva, si poteva cancellare una
  // cella di un mese passato senza sblocco motivato)
  if (!_pianoConsentiScrittura(sel.data)) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  // CELLA PROTETTA: non si cancella per sbaglio. Si puo' fare, ma con una
  // conferma esplicita che dice cosa si sta togliendo.
  if (
    r.protetto &&
    !confirm(
      'CELLA PROTETTA\n\n' +
        sel.nome +
        ' · ' +
        String(sel.data).split('-').reverse().join('.') +
        ' · ' +
        r.codice +
        (r.motivo_blocco
          ? '\n\nE BLOCCATA per: ' + r.motivo_blocco
          : '\n\nE una cella protetta (piano consolidato, vacanza o assenza confermata).') +
        '\nCancellarla comunque?',
    )
  )
    return;
  _pianoUndoSnap('rimozione cella');
  if (!giaChiuso) document.getElementById('pwd-modal').classList.add('hidden');
  try {
    await secDel('piano', 'id=eq.' + r.id);
    _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
    logAzione('Piano: cella rimossa', sel.nome + ' ' + sel.data + ' (era ' + r.codice + ')');
    toast('Cella rimossa');
    if (r.codice === 'M' || r.codice === 'M1') await _pianoMalattiaViaDiario(sel.nome, [sel.data]);
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}
