/**
 * Diario Collaboratori — Casino Lugano SA
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
let _pianoRighe = []; // righe del mese/settore correnti
let _pianoMeseSel = new Date().toISOString().substring(0, 7);
let _pianoCellaSel = null; // {nome, data} in modifica

// Colori dei codici speciali — PALETTE ORIGINALE TURNIVO (= formattazione
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

function puoGestirePiano() {
  return typeof puoModificare === 'function' ? puoModificare('gestione_piano') : isAdmin();
}

let pianoMappatureCache = [];
let pianoRegoleGruppoCache = [];
// regole attive per un gruppo (maiuscolo), port di eligibility.py
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
  ]);
  pianoRegoleGruppoCache = regoleGruppo || [];
  try {
    window._pianoCompGruppiCfg = compGruppi ? JSON.parse(compGruppi) : null;
  } catch (e) {
    window._pianoCompGruppiCfg = null;
  }
  window._pianoMaxCambiCfg = parseInt(maxCambi) || 0;
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
  _pianoOreSett = parseFloat(oreSett) || 41;
  try {
    window._pianoFunzioni = funzioni ? JSON.parse(funzioni) : null;
  } catch (e) {}
  if (!Array.isArray(window._pianoFunzioni) || !window._pianoFunzioni.length)
    window._pianoFunzioni = ['RESP', 'SUP', 'BO', 'HOST'];
  _pianoCfgCaricata = true;
}
function _pianoMappFunzione(funzione) {
  if (!funzione) return null;
  const m = pianoMappatureCache.filter((x) => x.funzione === funzione);
  return m.length ? m : null;
}
// multi-reparto: appartiene al reparto corrente se è il suo principale
// oppure se elencato nei suoi "reparti extra" (es. valet che fa anche slots)
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
// Ore pianificate di una RIGA del piano: turno → durata del turno;
// codice con orario personalizzato (es. JG con inizio/fine) → differenza;
// altrimenti ore CCL del codice speciale (scalate per percentuale se previsto)
function _pianoOreDiRiga(r, pct) {
  const t = _pianoTurnoInfo(r.codice);
  if (t) return parseFloat(t.durata_ore) || 0;
  if (r.ora_inizio && r.ora_fine) {
    const e = _pianoOra(r.ora_inizio);
    const u = _pianoOra(r.ora_fine);
    if (e != null && u != null) return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
  }
  const cs = _pianoCodiceInfo(r.codice);
  if (cs && parseFloat(cs.ore) > 0)
    return cs.scala_percentuale ? (parseFloat(cs.ore) || 0) * (pct || 1) : parseFloat(cs.ore) || 0;
  return 0;
}
function _pianoColore(codice) {
  const t = _pianoTurnoInfo(codice);
  if (t) return t.colore || '';
  return PIANO_COLORI_SPECIALI[codice] || ''; // '' = cella bianca (come Turnivo/Excel)
}
// marcatore del giorno importato dall'Excel (riga 2 del foglio: CS = concessione
// sociale, MN, LRD...) — mostrato nelle intestazioni dei giorni
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
  const v = prompt('Marcatore per il giorno ' + g + ' (es. CS, MN, LRD — vuoto per togliere):', attuale);
  if (v === null) return;
  const tutti = window._pianoGiornoMarker || {};
  tutti[ym] = tutti[ym] || {};
  if (v.trim()) tutti[ym][g] = v.trim().toUpperCase();
  else {
    delete tutti[ym][g];
    delete tutti[ym][String(g)];
  }
  window._pianoGiornoMarker = tutti;
  await setImp('piano_giorno_marker', JSON.stringify(tutti));
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
function _pianoMalattieMese(ym) {
  const out = {}; // 'nome|YYYY-MM-DD' -> true
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const inizio = ym + '-01';
  const fine = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  (typeof datiCache !== 'undefined' ? datiCache : []).forEach((e) => {
    if (e.tipo !== tipoMal || e.eliminato) return;
    const testo = e.testo || '';
    let da = (e.data || '').substring(0, 10);
    let a = da;
    const mRange = testo.match(/dal\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+al\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i);
    const mGiorni = testo.match(/(\d+)\s*giorni/i);
    if (mRange) {
      da = mRange[3] + '-' + mRange[2].padStart(2, '0') + '-' + mRange[1].padStart(2, '0');
      a = mRange[6] + '-' + mRange[5].padStart(2, '0') + '-' + mRange[4].padStart(2, '0');
    } else if (mGiorni && da) {
      const d = new Date(da + 'T12:00:00');
      d.setDate(d.getDate() + parseInt(mGiorni[1]) - 1);
      a = d.toISOString().substring(0, 10);
    }
    if (!da || a < inizio || da > fine) return;
    const cur = new Date((da < inizio ? inizio : da) + 'T12:00:00');
    const stop = a > fine ? fine : a;
    while (cur.toISOString().substring(0, 10) <= stop) {
      out[e.nome + '|' + cur.toISOString().substring(0, 10)] = true;
      cur.setDate(cur.getDate() + 1);
    }
  });
  return out;
}

// Tab della sezione Piano (come la navbar di Turnivo: ogni voce una schermata)
let _pianoTab = localStorage.getItem('piano_tab') || 'calendario';
// Icone = Bootstrap Icons (le stesse della navbar di Turnivo), incorporate SVG
const _PIANO_TABS = [
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
  _pianoTab = t;
  localStorage.setItem('piano_tab', t);
  renderPiano();
}
function _pianoTabBar() {
  return (
    '<div class="piano-tabs">' +
    _PIANO_TABS
      .map(
        ([k, lbl, ico]) =>
          '<span class="piano-tab' +
          (k === _pianoTab ? ' attiva' : '') +
          '" onclick="pianoCambiaTab(\'' +
          k +
          '\')">' +
          (ico || '') +
          ' ' +
          lbl +
          '</span>',
      )
      .join('') +
    '</div>'
  );
}

// YTD saldo cumulato da gennaio al mese precedente (port di
// compute_ytd_saldo_map di Turnivo): per ogni mese usa le ore timbrate se
// presenti, altrimenti le ore piano (turni + codici speciali scalati);
// saldo_mese = ore - dovute; jolly esclusi.
let _pianoYtdMap = {};
let _pianoYtdKey = '';
async function _pianoAggiornaYtd(nomi) {
  const ym = _pianoMeseSel;
  const chiave = ym + '|' + _pianoReparto();
  if (_pianoYtdKey === chiave) return;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  _pianoYtdMap = {};
  _pianoYtdKey = chiave;
  if (mese <= 1) return;
  const fine = ym + '-01';
  const [righe, timbrate] = await Promise.all([
    secGet('piano?data=gte.' + anno + '-01-01&data=lt.' + fine + '&limit=40000'),
    secGet('piano_timbrature?data=gte.' + anno + '-01-01&data=lt.' + fine + '&limit=20000'),
  ]);
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
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    if (info.is_jolly) return;
    const pct = parseFloat(info.percentuale) || 0;
    if (!pct) return;
    let cum = 0;
    for (let m = 1; m < mese; m++) {
      const dim = new Date(anno, m, 0).getDate();
      const dovute = Math.round((dim / 7) * _pianoOreSett * pct * 100) / 100;
      const k = n + '|' + m;
      const effettive = timbMese[k] != null ? timbMese[k] : perMese[k] || 0;
      cum += effettive - dovute;
    }
    _pianoYtdMap[n] = Math.round(cum * 100) / 100;
  });
}

async function renderPiano() {
  const el = document.getElementById('piano-content');
  if (!el) return;
  // niente "Caricamento" che accorcia la pagina (faceva saltare lo scroll
  // in cima a ogni cambio giorno/mese): il contenuto vecchio resta visibile
  // sbiadito finché il nuovo non è pronto, poi lo scroll viene ripristinato
  const scrollPrec = window.scrollY;
  if (!el.firstChild) el.innerHTML = '<p style="color:var(--muted);padding:20px">Caricamento piano...</p>';
  else el.style.opacity = '0.55';
  try {
    await _pianoCaricaCfg();
    const ym = _pianoMeseSel;
    const nGiorni = _pianoUltimoGiorno(ym);
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    {
      const tutteRighe = (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&limit=8000')) || [];
      const rep = _pianoReparto();
      _pianoRighe = tutteRighe.filter((r) => {
        if ((r.reparto_dip || 'slots') === rep) return true;
        const info = _pianoCollabInfo(r.collaboratore);
        return !!(info && String(info.reparti_extra || '').trim() && _pianoAppartieneAlReparto(info));
      });
    }
    const mappa = {}; // 'nome|data' -> riga
    _pianoRighe.forEach((r) => (mappa[r.collaboratore + '|' + r.data] = r));
    const malattie = _pianoMalattieMese(ym);
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

    let h = _pianoTabBar();
    if (_pianoTab === 'calendario') {
      h +=
        '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
      h +=
        '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><span style="min-width:150px;text-align:center;font-weight:700">' +
        escP(label) +
        '</span><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>';
      h +=
        '<select onchange="pianoCambiaReparto(this.value)" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
      getReparti().forEach((rp) => {
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
        h +=
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#d4b86a;color:#d4b86a" onclick="validaPiano()">Valida regole</button>' +
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#c0392b;color:#e07b6d" onclick="apriCoperturaMalattia()">Copertura malattia</button>';
        h +=
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="generaBozzaPiano()">Genera bozza</button>' +
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#8e44ad;color:#8e44ad" title="Dopo la bozza: scambia turni generati tra chi è sopra e chi è sotto le ore dovute (stesso giorno, regole rispettate)" onclick="miglioraOrePiano()">Migliora ore</button>';
        h +=
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:var(--accent);color:var(--accent)" onclick="cancellaBozzaPiano()">Cancella piano</button>' +
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#d4b86a;color:#d4b86a" title="Trascina i nomi per riordinare; questo pulsante ripristina SUP, BO, poi gli altri" onclick="ripristinaOrdinePiano()">Ordine predefinito</button>';
      }
      if (puoMod) h += _pianoColoriBarHtml();
      h +=
        '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#b8a98a;color:#b8a98a" onclick="copiaPianoExcel()">Copia per Excel</button>';
      h +=
        '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#b8a98a;color:#b8a98a" onclick="stampaPianoPDF()">Stampa PDF</button>';
      if (puoMod)
        h +=
          '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#b8a98a;color:#b8a98a" onclick="document.getElementById(\'piano-imp-file\').click()">Importa piano</button>' +
          '<input type="file" id="piano-imp-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importaPianoExcel(this)">';
      h +=
        '<span style="font-size:.8rem;color:var(--muted);margin-left:auto">' +
        _pianoRighe.length +
        ' assegnazioni' +
        (puoMod ? ' — click seleziona, doppio click modifica' : ' — sola lettura') +
        '</span></div>';
      h += '<div id="piano-violazioni"></div>';

      // GRIGLIA
      h +=
        '<div class="piano-wrap"><table data-seltab="piano" class="piano-table piano-fixed" style="width:' +
        (194 + 37 * nGiorni + 326) +
        'px"><colgroup><col style="width:150px"><col style="width:44px">' +
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
          (festiviSet[dstr]
            ? ' title="' + escP(festiviSet[dstr]) + '"'
            : ' title="Doppio click: marcatore del giorno (CS, MN, LRD...)"') +
          (puoMod ? ' ondblclick="pianoMarkerEdit(' + g + ')"' : '') +
          '>' +
          (_pianoMarkerGiorno(ym, g)
            ? '<div style="font-size:.58rem;background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
              escP(_pianoMarkerGiorno(ym, g)) +
              '</div>'
            : '') +
          '<div>' +
          GG3[dow] +
          '</div><div>' +
          g +
          '</div></th>';
      }
      h +=
        '<th class="piano-tot piano-sep-left">Ore</th><th class="piano-tot">D</th><th class="piano-tot">N</th>' +
        '<th class="piano-tot" title="Ore Dovute">OD</th><th class="piano-tot" title="Ore Pianificate">OP</th>' +
        '<th class="piano-tot" title="Saldo Mensile">SM</th><th class="piano-tot" title="Saldo Anno">YTD</th></tr></thead><tbody>';

      await _pianoAggiornaYtd(nomi);
      nomi.forEach((nome) => {
        const ne = nome.replace(/'/g, "\\'");
        const infoC0 = _pianoCollabInfo(nome);
        const perc0 = infoC0 ? parseFloat(infoC0.percentuale) || 1 : 1;
        let ore = 0; // solo turni (colonna Ore = ore_stimate Turnivo)
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
              ore += parseFloat(t.durata_ore) || 0;
              if (t.tipo === 'NOTTURNO') nN++;
              else nD++;
              titolo = codice + ' ' + (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5);
            } else if (cs) {
              oreSpec += _pianoOreDiRiga(r, perc0);
              titolo =
                (cs.descrizione || codice) + (r.ora_inizio && r.ora_fine ? ' ' + r.ora_inizio + '-' + r.ora_fine : '');
            }
            if (r.protetto) cls += ' piano-prot';
            if ((r.reparto_dip || 'slots') !== _pianoReparto()) {
              // cella dell'ALTRO reparto di un collaboratore multi-reparto
              stile += (stile ? ';' : '') + 'opacity:.65;font-style:italic';
              titolo = '[' + repartoLabel(r.reparto_dip) + '] ' + titolo;
            }
            if (r.commento) {
              cls += ' piano-comm';
              titolo += (titolo ? ' — ' : '') + r.commento;
            }
          } else if (malattie[nome + '|' + dstr]) {
            cella = 'M';
            cls += ' piano-malattia-auto';
            titolo = 'Malattia registrata nel Diario (automatica, non salvata nel piano)';
          }
          const violMsg = _pianoViolCelle[nome + '|' + dstr];
          if (violMsg) {
            cls += ' piano-viol';
            titolo += (titolo ? ' — ' : '') + '⚠ ' + violMsg.join(' | ');
          }
          // colore personalizzato della cella: vince sul colore del turno (solo qui nel piano)
          if (r && r.colore) stile += (stile ? ';' : '') + 'background:' + r.colore;
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
            ' onclick="pianoCellaClick(\'' +
            ne +
            "','" +
            dstr +
            '\',this)"' +
            (puoMod ? ' ondblclick="pianoCellaInline(\'' + ne + "','" + dstr + '\',this)"' : '') +
            '>' +
            cella +
            '</td>';
        }
        const infoC = infoC0;
        const perc = perc0;
        // come Turnivo: OD=(giorni/7)*ore_sett*pct (jolly=0), OP=turni+speciali, SM=OP-OD, YTD=cumulato da gennaio
        const dovute = infoC && infoC.is_jolly ? 0 : Math.round(((_pianoOreSett * perc * nGiorni) / 7) * 10) / 10;
        const orePiano = Math.round((ore + oreSpec) * 100) / 100;
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
          escP(nome.length > 20 ? nome.substring(0, 20) : nome) +
          (infoC && infoC.lingue
            ? ' <span style="font-size:.62rem;color:var(--muted);font-weight:700">' + escP(infoC.lingue) + '</span>'
            : '') +
          '</td><td class="piano-fun"><strong>' +
          escP(infoC && infoC.is_jolly ? 'JOLLY' : (infoC && infoC.funzione) || '') +
          '</strong> <span style="font-size:.7rem">' +
          Math.round(perc * 100) +
          '%</span></td>' +
          riga +
          '<td class="piano-tot piano-sep-left">' +
          (ore ? ore.toFixed(1) : '') +
          '</td><td class="piano-tot">' +
          (nD || '') +
          '</td><td class="piano-tot">' +
          (nN || '') +
          '</td><td class="piano-tot" style="color:var(--muted)">' +
          (dovute ? dovute.toFixed(1) : '') +
          '</td><td class="piano-tot">' +
          (orePiano ? orePiano.toFixed(1) : '') +
          '</td><td class="piano-tot" style="color:' +
          (saldo > 0 ? '#2c6e49' : saldo < 0 ? '#c0392b' : 'var(--muted)') +
          '">' +
          (orePiano || dovute ? (saldo > 0 ? '+' : '') + saldo.toFixed(1) : '') +
          '</td><td class="piano-tot" style="font-weight:700;color:' +
          (ytd > 0 ? '#2c6e49' : ytd < 0 ? '#c0392b' : 'var(--muted)') +
          '">' +
          (orePiano || _pianoYtdMap[nome] ? (ytd > 0 ? '+' : '') + ytd.toFixed(1) : '') +
          '</td></tr>';
      });
      h += '</tbody></table></div>';

      // legenda
      h += '<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;font-size:.8rem;color:var(--muted)">';
      h +=
        '<span><span class="piano-leg piano-prot" style="background:var(--paper2)"></span> bordo rosso = inserito a mano (protetto)</span>';
      h +=
        '<span><span class="piano-leg piano-comm" style="background:var(--paper2)"></span> triangolo = commento (passa il mouse)</span>';
      h +=
        '<span><span class="piano-leg piano-malattia-auto" style="background:var(--paper2)">M</span> = malattia dal Diario (automatica)</span>';
      h += '<span>icona rossa = stampa piano del collaboratore — tasto destro su una cella = menu opzioni</span>';
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
          '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Pianificazione (fabbisogno) vs assegnati — ' +
          escP(label);
        if (puoMod)
          hFabb +=
            '<button class="btn-export" style="font-size:.78rem;padding:3px 10px;border-color:#d4b86a;color:#d4b86a" onclick="copiaFabbisognoMese()">Copia dal mese precedente</button>' +
            '<button class="btn-export" style="font-size:.78rem;padding:3px 10px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'fabb-file\').click()">Importa da Excel</button>' +
            '<input type="file" id="fabb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaFabbisognoExcel(this)">' +
            '<button class="btn-export" style="font-size:.78rem;padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFabbisognoMese()">Svuota mese</button>' +
            '<span style="font-size:.76rem;color:#b8a98a;font-weight:400">clicca una cella per impostare le persone necessarie</span>';
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
                ? '<div style="font-size:.58rem;background:#FFFF00;color:#000;font-weight:bold;line-height:1.1">' +
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
          (194 + 37 * nGiorni) +
          'px"><colgroup><col style="width:194px">' +
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
                ' onclick="fabbCellaClick(\'' +
                escP(cod) +
                "','" +
                dstr +
                '\',this)"' +
                (puoMod ? ' ondblclick="fabbisognoInline(\'' + escP(cod) + "','" + dstr + '\',this)"' : '') +
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
          '<p style="font-size:.8rem;color:var(--muted);padding:8px 14px">assegnati/richiesti — celle gialle (weekend verdi) come la PIANIFICAZIONE dell&#39;Excel; numero <span style="color:#c0392b;font-weight:700">rosso</span> = carenza. Il fabbisogno guida "Genera bozza".</p></div>';

        // DIFFERENZE + EFFETTIVI — schema IDENTICO a Turnivo (calendario.html):
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
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Differenze — ' +
          escP(label) +
          ' <span style="font-size:.76rem;color:#b8a98a;font-weight:400">(effettivi − pianificazione)</span></div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="diff" class="piano-table piano-fixed" style="width:' +
          (194 + 37 * nGiorni) +
          'px"><colgroup><col style="width:194px">' +
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
          '<div class="main-card" style="margin-top:16px"><div class="card-header">Effettivi — ' +
          escP(label) +
          '</div>';
        h +=
          '<div class="piano-wrap"><table data-seltab="eff" class="piano-table piano-fixed" style="width:' +
          (194 + 37 * nGiorni + 44) +
          'px"><colgroup><col style="width:194px">' +
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
      h += '<div id="piano-config">' + _renderPianoFestiviCard() + '</div>';
    } else if (_pianoTab === 'timbrature') {
      h += '<div id="piano-config">' + _renderPianoTimbratureCard() + '</div>';
    } else if (_pianoTab === 'statistiche') {
      h += '<div id="piano-config">' + _renderPianoStatCard() + '</div>';
    } else if (_pianoTab === 'saldo') {
      h += await _renderPianoSaldoTab();
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
        _renderPianoImpostazioniCard() +
        '</div>';
    }
    el.innerHTML = h;
    el.style.opacity = '';
    if (scrollPrec) requestAnimationFrame(() => window.scrollTo(0, scrollPrec));
    if (typeof initCardRichiudibili === 'function' && document.getElementById('piano-config'))
      initCardRichiudibili('piano-config', []);
    if (_pianoTab === 'calendario') {
      _pianoInitSelezione();
      _pianoInitSticky();
      _pianoRenderViolazioni();
      _pianoDragBind();
      _pianoTipBind();
      _pianoApplicaNascosti();
    }
    if (_pianoTab === 'statistiche' && typeof caricaStatisticheAnnoPiano === 'function')
      setTimeout(() => caricaStatisticheAnnoPiano(), 50);
    if (_pianoTab === 'timbrature' && typeof caricaConfrontoTimbrature === 'function')
      setTimeout(() => caricaConfrontoTimbrature(), 50);
  } catch (e) {
    console.error('Errore piano:', e);
    el.style.opacity = '';
    el.innerHTML = '<p style="color:var(--accent);padding:20px">Errore caricamento piano</p>';
  }
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
// scrittura diretta nella cella — pianoCellaInline / pianoSalvaCella)
async function rimuoviPianoCella(giaChiuso) {
  const sel = _pianoCellaSel;
  if (!sel) return;
  if (!giaChiuso) document.getElementById('pwd-modal').classList.add('hidden');
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  try {
    await secDel('piano', 'id=eq.' + r.id);
    _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
    logAzione('Piano: cella rimossa', sel.nome + ' ' + sel.data + ' (era ' + r.codice + ')');
    toast('Cella rimossa');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

// ================================================================
// FASE 2 — VALIDATORE REGOLE (dai manuali Turnivo/Casino Lugano)
// ================================================================
let _pianoViolCelle = {}; // 'nome|data' -> [messaggi]
let _pianoViolLista = null; // ultima validazione (null = mai eseguita)

function _pianoOra(hhmm) {
  if (!hhmm) return null;
  const p = String(hhmm).split(':');
  return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
}
function _pianoRegolaVal(nome) {
  const r = pianoRegoleCache.find((x) => x.nome === nome);
  if (!r || r.attivo === false) return null;
  return r.valore;
}
// Limiti ORE MENSILI personalizzabili (pannello Regole):
// - fissi e jolly CON percentuale: obiettivo = giorni/7 × ore sett × %;
//   max = obiettivo + tolleranza_ore_sopra, min = obiettivo − tolleranza_ore_sotto
//   (se sopra/sotto sono spente vale la tolleranza_ore simmetrica ±);
// - jolly SENZA percentuale: range assoluto jolly_ore_min / jolly_ore_max.
// min/max null = nessun limite su quel lato (regole spente).
function _pianoLimitiOre(nome, nGiorni) {
  const info = _pianoCollabInfo(nome) || {};
  // jolly con percentuale PIENA (o vuota) = jolly puro → range assoluto;
  // jolly con percentuale ridotta (es. 80%) = obiettivo % come i fissi
  const pctJ = parseFloat(info.percentuale);
  const jollySenzaPct = info.is_jolly && !(pctJ > 0 && pctJ < 1);
  if (jollySenzaPct) {
    const jMin = parseFloat(_pianoRegolaVal('jolly_ore_min'));
    const jMax = parseFloat(_pianoRegolaVal('jolly_ore_max'));
    return { obiettivo: null, min: isNaN(jMin) ? null : jMin, max: isNaN(jMax) ? null : jMax };
  }
  const pct = parseFloat(info.percentuale) || 1;
  const obiettivo = (nGiorni / 7) * _pianoOreSett * pct;
  const sim = parseFloat(_pianoRegolaVal('tolleranza_ore'));
  const sopra = parseFloat(_pianoRegolaVal('tolleranza_ore_sopra'));
  const sotto = parseFloat(_pianoRegolaVal('tolleranza_ore_sotto'));
  const su = !isNaN(sopra) ? sopra : !isNaN(sim) ? sim : NaN;
  const giu = !isNaN(sotto) ? sotto : !isNaN(sim) ? sim : NaN;
  return {
    obiettivo: obiettivo,
    min: isNaN(giu) ? null : obiettivo - giu,
    max: isNaN(su) ? null : obiettivo + su,
  };
}
function _pianoIsLavoro(codice) {
  return !!_pianoTurnoInfo(codice);
}

// Calcola le violazioni del mese corrente. Ritorna la lista e riempie _pianoViolCelle.
function _pianoCalcolaViolazioni() {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
  const no4w1c1w = _pianoRegolaVal('no_4w1c1w') === 'TRUE';
  const diurnoPreV = _pianoRegolaVal('diurno_prima_vacanza') === 'TRUE';
  const supSoloZ = _pianoRegolaVal('sup_solo_z_settimana') === 'TRUE';
  const supVenSab = _pianoRegolaVal('sup_ven_sab_z_e_s') === 'TRUE';
  const l1SoloBoSup = _pianoRegolaVal('l1_solo_bo_sup') === 'TRUE';
  const celle = {};
  const lista = [];
  const aggiungi = (nome, giorno, msg) => {
    const dstr = ym + '-' + String(giorno).padStart(2, '0');
    (celle[nome + '|' + dstr] = celle[nome + '|' + dstr] || []).push(msg);
    lista.push({ nome: nome, giorno: giorno, msg: msg });
  };
  const perNome = {};
  _pianoRighe.forEach((r) => {
    const g = parseInt(r.data.split('-')[2]);
    (perNome[r.collaboratore] = perNome[r.collaboratore] || {})[g] = r.codice;
  });
  Object.keys(perNome).forEach((nome) => {
    const giorni = perNome[nome];
    let consec = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = giorni[g] || '';
      const lavoro = _pianoIsLavoro(cod);
      // 1) massimo giorni lavorativi consecutivi
      if (lavoro) {
        consec++;
        if (maxCons && consec === maxCons + 1)
          aggiungi(nome, g, consec - 1 + '+ giorni lavorativi consecutivi (max ' + maxCons + ')');
      } else {
        consec = 0;
      }
      // 2) riposo minimo tra due turni consecutivi
      if (minRiposo && lavoro && giorni[g + 1] && _pianoIsLavoro(giorni[g + 1])) {
        const t1 = _pianoTurnoInfo(cod);
        const t2 = _pianoTurnoInfo(giorni[g + 1]);
        const fine1 = _pianoOra(t1.ora_fine);
        const inizio2 = _pianoOra(t2.ora_inizio);
        if (fine1 != null && inizio2 != null) {
          const fineAbs = t1.oltre23 || fine1 < _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
          const riposo = 24 + inizio2 - fineAbs;
          if (riposo < minRiposo)
            aggiungi(
              nome,
              g + 1,
              'solo ' + riposo.toFixed(1) + 'h di riposo dopo ' + cod + ' (min ' + minRiposo + 'h)',
            );
        }
      }
      // 3) vietato 4 lavoro + 1 riposo + 1 lavoro
      if (no4w1c1w && !lavoro && cod && g >= 5) {
        let prima = 0;
        for (let k = g - 1; k >= 1 && _pianoIsLavoro(giorni[k]); k--) prima++;
        if (prima >= 4 && _pianoIsLavoro(giorni[g + 1] || ''))
          aggiungi(nome, g, 'riposo singolo dopo ' + prima + ' giorni di lavoro (vietato 4+1+1)');
      }
      // 4) turno diurno il giorno prima delle vacanze
      if (diurnoPreV && (cod === 'V' || cod === 'V1') && (giorni[g - 1] || '') && _pianoIsLavoro(giorni[g - 1])) {
        const tp = _pianoTurnoInfo(giorni[g - 1]);
        if (tp && tp.tipo === 'NOTTURNO')
          aggiungi(nome, g - 1, 'turno notturno il giorno prima delle vacanze (deve essere diurno)');
      }
      // 5) regole per funzione (SUP solo turni Z in settimana; L1/9 solo BO e SUP)
      if (lavoro) {
        const infoC = _pianoCollabInfo(nome);
        const fz = infoC && infoC.funzione;
        const t = _pianoTurnoInfo(cod);
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        if (supSoloZ && fz === 'SUP' && t && dow >= 1 && dow <= 4) {
          // lun-gio: SUP solo turni Z (o BO L1/9)
          if (!(cod[0] === 'Z' || cod === 'L1' || cod === '9'))
            aggiungi(nome, g, 'SUP con turno ' + cod + ' in settimana (lun-gio solo turni Z)');
        }
        if (supVenSab && fz === 'SUP' && t && _pianoGiorniWeekend().includes(dow)) {
          if (!(cod[0] === 'Z' || cod[0] === 'S' || cod === 'L1' || cod === '9'))
            aggiungi(nome, g, 'SUP con turno ' + cod + ' nel weekend (ven/sab solo Z o S)');
        }
        if (l1SoloBoSup && (cod === 'L1' || cod === '9') && fz !== 'BO' && fz !== 'SUP' && fz !== 'RESP')
          aggiungi(nome, g, 'turno ' + cod + ' riservato a BO e SUP (funzione: ' + (fz || 'nessuna') + ')');
      }
    }
  });

  // ===== TOLLERANZA ORE (regole personalizzabili: tolleranza_ore ±,
  // tolleranza_ore_sopra/sotto per fissi e jolly con %, jolly_ore_min/max) =====
  {
    const orePerNome = {};
    _pianoRighe.forEach((r) => {
      const info = _pianoCollabInfo(r.collaboratore) || {};
      const pct = parseFloat(info.percentuale) || 1;
      const o = _pianoOreDiRiga(r, pct);
      if (o) orePerNome[r.collaboratore] = (orePerNome[r.collaboratore] || 0) + o;
    });
    Object.keys(orePerNome).forEach((nome) => {
      const lim = _pianoLimitiOre(nome, nGiorni);
      if (lim.min == null && lim.max == null) return; // regole spente per questo profilo
      const oreT = Math.round(orePerNome[nome] * 10) / 10;
      const arr = (x) => Math.round(x * 10) / 10;
      if (lim.max != null && oreT > lim.max)
        lista.push({
          nome: nome,
          giorno: 0,
          msg:
            'ore mese ' +
            oreT +
            'h SOPRA il massimo ' +
            arr(lim.max) +
            'h (regole tolleranza' +
            (lim.obiettivo == null ? ' jolly' : '') +
            ')',
        });
      else if (lim.min != null && oreT < lim.min)
        lista.push({
          nome: nome,
          giorno: 0,
          msg:
            'ore mese ' +
            oreT +
            'h SOTTO il minimo ' +
            arr(lim.min) +
            'h (regole tolleranza' +
            (lim.obiettivo == null ? ' jolly' : '') +
            ')',
        });
    });
  }
  // ===== REGOLE DI GRUPPO (come il solver Turnivo) =====
  if (pianoRegoleGruppoCache.length) {
    const perGruppoGiornoFz = {}; // GRUPPO|FZ|g -> [nomi]
    const perGruppoMeseFz = {}; // GRUPPO|FZ -> Set(nomi)
    const perGruppoGiornoTot = {}; // GRUPPO|g -> n
    _pianoRighe.forEach((r) => {
      const t = _pianoTurnoInfo(r.codice);
      if (!t) return;
      const gr = (t.gruppo || '').toUpperCase();
      const g = parseInt(r.data.split('-')[2]);
      const fz = (((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase();
      (perGruppoGiornoFz[gr + '|' + fz + '|' + g] = perGruppoGiornoFz[gr + '|' + fz + '|' + g] || []).push(
        r.collaboratore,
      );
      (perGruppoMeseFz[gr + '|' + fz] = perGruppoMeseFz[gr + '|' + fz] || new Set()).add(r.collaboratore);
      perGruppoGiornoTot[gr + '|' + g] = (perGruppoGiornoTot[gr + '|' + g] || 0) + 1;
      // blocca_tipo_turno + richiede_campo + accompagnamento: controlli per cella
      for (const rg of _pianoRegoleGruppoDi(gr)) {
        const tipoR = (rg.tipo_regola || '').toLowerCase();
        if (tipoR === 'blocca_tipo_turno') {
          const tipi = rg.valore.split(',').map((x) => x.trim().toUpperCase());
          if (tipi.includes((t.tipo || '').toUpperCase()))
            aggiungi(r.collaboratore, g, 'turno ' + r.codice + ' di tipo ' + t.tipo + ' vietato nel gruppo ' + gr);
        } else if (tipoR === 'richiede_campo') {
          if (!_pianoCampoOk(_pianoCollabInfo(r.collaboratore), rg.valore))
            aggiungi(r.collaboratore, g, 'gruppo ' + gr + ' richiede ' + rg.valore);
        }
      }
      const infoAcc = _pianoCollabInfo(r.collaboratore);
      if (infoAcc && infoAcc.accompagnamento_settori) {
        const grAcc = _pianoAccompagnamentoDi(infoAcc);
        if (grAcc.includes(gr)) r._accGruppo = gr;
      }
    });
    // accompagnamento: da solo nel gruppo quel giorno
    _pianoRighe.forEach((r) => {
      if (!r._accGruppo) return;
      const g = parseInt(r.data.split('-')[2]);
      if ((perGruppoGiornoTot[r._accGruppo + '|' + g] || 0) <= 1)
        aggiungi(r.collaboratore, g, 'richiede accompagnamento nel gruppo ' + r._accGruppo + ' ma è da solo');
      delete r._accGruppo;
    });
    // limiti e minimi per gruppo
    const gruppi = [...new Set(pianoRegoleGruppoCache.map((r) => (r.gruppo || '').toUpperCase()))];
    for (const gr of gruppi) {
      for (const rg of _pianoRegoleGruppoDi(gr)) {
        const tipoR = (rg.tipo_regola || '').toLowerCase();
        const parti = rg.valore.split(':');
        const fu = (parti[0] || '').toUpperCase();
        const nVal = parseInt(parti[1]) || 1;
        if (tipoR === 'limite_funzione_giorno') {
          for (let g = 1; g <= nGiorni; g++) {
            const lista2 = perGruppoGiornoFz[gr + '|' + fu + '|' + g] || [];
            if (lista2.length > nVal)
              lista2.forEach((nome) =>
                aggiungi(nome, g, 'più di ' + nVal + ' ' + fu + ' nel gruppo ' + gr + ' lo stesso giorno'),
              );
          }
        } else if (tipoR === 'limite_funzione_mese') {
          const set = perGruppoMeseFz[gr + '|' + fu];
          if (set && set.size > nVal)
            lista.push({
              nome: '(' + gr + ')',
              giorno: 0,
              msg:
                set.size +
                ' ' +
                fu +
                ' diversi nel gruppo ' +
                gr +
                ' nel mese (max ' +
                nVal +
                '): ' +
                [...set].join(', '),
            });
        } else if (tipoR === 'minimo_funzione_mese') {
          const set = perGruppoMeseFz[gr + '|' + fu];
          if (!set || set.size < nVal)
            lista.push({
              nome: '(' + gr + ')',
              giorno: 0,
              msg:
                'nel gruppo ' +
                gr +
                ' servono almeno ' +
                nVal +
                ' ' +
                fu +
                ' nel mese (trovati ' +
                (set ? set.size : 0) +
                ')',
            });
        } else if (tipoR === 'minimo_funzione_giorno') {
          const tipoF = (parti[2] || '').toUpperCase();
          const dows = parti[3] ? parti[3].split(',').map((x) => parseInt(x)) : null;
          for (let g = 1; g <= nGiorni; g++) {
            const dstr = ym + '-' + String(g).padStart(2, '0');
            const dowPy = (new Date(dstr + 'T12:00:00').getDay() + 6) % 7;
            if (dows && !dows.includes(dowPy)) continue;
            // conta la funzione richiesta su turni del tipo filtrato nel gruppo
            let conta = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              const t = _pianoTurnoInfo(r.codice);
              if (!t || (t.gruppo || '').toUpperCase() !== gr) return;
              if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) return;
              if ((((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase() === fu) conta++;
            });
            // segnala solo se quel giorno il gruppo ha turni del tipo richiesto
            let turniQuelGiorno = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              const t = _pianoTurnoInfo(r.codice);
              if (t && (t.gruppo || '').toUpperCase() === gr && (!tipoF || (t.tipo || '').toUpperCase() === tipoF))
                turniQuelGiorno++;
            });
            if (turniQuelGiorno && conta < nVal)
              lista.push({
                nome: '(' + gr + ')',
                giorno: g,
                msg:
                  'giorno ' +
                  g +
                  ': nel gruppo ' +
                  gr +
                  ' servono ' +
                  nVal +
                  ' ' +
                  fu +
                  (tipoF ? ' sui turni ' + tipoF : '') +
                  ' (trovati ' +
                  conta +
                  ')',
              });
          }
        }
      }
    }
  }
  return { celle: celle, lista: lista };
}

function validaPiano() {
  setTimeout(() => controllaFormazioniCompletate(true), 800);
  const r = _pianoCalcolaViolazioni();
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  logAzione('Piano validato', _pianoMeseSel + ' — ' + r.lista.length + ' violazioni');
  renderPiano();
}

function _pianoRenderViolazioni() {
  const el = document.getElementById('piano-violazioni');
  if (!el || _pianoViolLista === null) return;
  if (!_pianoViolLista.length) {
    el.innerHTML =
      '<p style="padding:8px 14px;font-size:.82rem;color:#2c6e49;font-weight:600">✓ Nessuna violazione delle regole attive nel mese.</p>';
    return;
  }
  let h =
    '<div style="padding:8px 14px"><p style="font-size:.82rem;font-weight:700;color:var(--accent);margin-bottom:6px">' +
    _pianoViolLista.length +
    ' violazioni (celle evidenziate in rosso):</p><div style="max-height:180px;overflow-y:auto;font-size:.85rem;line-height:1.7">';
  _pianoViolLista.forEach((v) => {
    h += '<div>• <strong>' + escP(v.nome) + '</strong> — giorno ' + v.giorno + ': ' + escP(v.msg) + '</div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
}

// ================================================================
// FASE 2 — GENERA BOZZA (euristica istantanea, non il solver)
// Riempie i fabbisogni del mese rispettando: riposo 11h, max
// consecutivi, idoneità storica (gruppi già fatti), equità ore.
// Le celle esistenti (V, protette, malattie Diario) non si toccano.
// ================================================================
async function generaBozzaPiano() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  const fabb =
    (await secGet(
      'piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!fabb.length) {
    toast('Nessun fabbisogno configurato per questo mese: la bozza non sa cosa riempire');
    return;
  }
  // le C di RIEMPIMENTO generate da una bozza precedente si tolgono e si
  // rimettono alla fine: così rigenerare non trova i giorni "occupati"
  await secDel(
    'piano',
    'data=gte.' +
      da +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&codice=eq.C&generato=eq.true&protetto=eq.false',
  );
  // Step 0 come Turnivo: prima le vacanze (V protette + C + WD)
  await _applicaVacanzeMese(false);
  // ricarico includendo le celle degli ALTRI reparti dei multi-reparto
  {
    const tutteRighe = (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&limit=8000')) || [];
    const repG = _pianoReparto();
    _pianoRighe = tutteRighe.filter((r) => {
      if ((r.reparto_dip || 'slots') === repG) return true;
      const infoG = _pianoCollabInfo(r.collaboratore);
      return !!(infoG && String(infoG.reparti_extra || '').trim() && _pianoAppartieneAlReparto(infoG));
    });
  }
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  // storia per idoneità (chi ha già fatto quel gruppo) e familiarità:
  // tutte le assegnazioni passate del settore (le più recenti prima)
  const storia =
    (await secGet('piano?data=lt.' + da + '&reparto_dip=eq.' + _pianoReparto() + '&order=data.desc&limit=20000')) || [];
  const idoneita = {}; // nome -> Set(gruppi)
  const familiarita = {}; // nome|codice -> n
  storia.concat(_pianoRighe).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t) return;
    (idoneita[r.collaboratore] = idoneita[r.collaboratore] || new Set()).add(t.gruppo);
    familiarita[r.collaboratore + '|' + r.codice] = (familiarita[r.collaboratore + '|' + r.codice] || 0) + 1;
  });
  const malattie = _pianoMalattieMese(ym);
  // stato griglia: esistenti + assegnazioni della bozza
  const cella = {}; // 'nome|g' -> codice
  const rigaDi = {}; // 'nome|g' -> riga (per sostituire i segnaposto WD)
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  const oreMese = {}; // equità
  Object.keys(cella).forEach((k) => {
    const t = _pianoTurnoInfo(cella[k]);
    if (t) oreMese[k.split('|')[0]] = (oreMese[k.split('|')[0]] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  // OBIETTIVO ORE mensile (come la tolleranza ore del solver Turnivo):
  // giorni/7 × ore settimanali × percentuale, corretto col saldo cumulato
  // dei mesi precedenti. La bozza dà i turni a chi è più LONTANO dal
  // proprio obiettivo: prima i fissi al 100%, i jolly coprono il resto.
  await _pianoAggiornaYtd(nomi);
  const obiettivo = {};
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    const pct = parseFloat(info.percentuale) || 1;
    obiettivo[n] = (nGiorni / 7) * _pianoOreSett * pct - (_pianoYtdMap[n] || 0);
  });
  const gapOre = (n) => (obiettivo[n] || 0) - (oreMese[n] || 0);
  const consecPrima = (nome, g) => {
    let n = 0;
    for (let k = g - 1; k >= 1 && _pianoIsLavoro(cella[nome + '|' + k] || ''); k--) n++;
    return n;
  };
  const riposoOk = (nome, g, t) => {
    // verso il giorno prima
    const prev = _pianoTurnoInfo(cella[nome + '|' + (g - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = prev.oltre23 || finePrev < _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    // verso il giorno dopo (se già assegnato, es. cella protetta)
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = t.oltre23 || fine < _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  // fabbisogno per giorno
  const fabbG = {}; // g -> [{codice, quantita}]
  fabb.forEach((f) => {
    const g = parseInt(f.data.split('-')[2]);
    (fabbG[g] = fabbG[g] || []).push(f);
  });
  const nuove = [];
  const sostituzioniWd = [];
  const scoperti = [];
  // contatori per le regole di gruppo (limite/minimo funzione per giorno/mese)
  const contaGiornoFz = {}; // gruppo|FZ|g -> n assegnati
  const contaGiornoTot = {}; // gruppo|g -> n assegnati (per accompagnamento)
  const collabMeseFz = {}; // gruppo|FZ -> Set(nomi)
  const registraAssegnazione = (nomeC, codiceT, giorno) => {
    const tt = _pianoTurnoInfo(codiceT);
    if (!tt) return;
    const gr = (tt.gruppo || '').toUpperCase();
    const fzC = (((_pianoCollabInfo(nomeC) || {}).funzione || '') + '').toUpperCase();
    contaGiornoFz[gr + '|' + fzC + '|' + giorno] = (contaGiornoFz[gr + '|' + fzC + '|' + giorno] || 0) + 1;
    contaGiornoTot[gr + '|' + giorno] = (contaGiornoTot[gr + '|' + giorno] || 0) + 1;
    (collabMeseFz[gr + '|' + fzC] = collabMeseFz[gr + '|' + fzC] || new Set()).add(nomeC);
  };
  Object.keys(cella).forEach((k) => {
    const [nomeK, gK] = [k.substring(0, k.lastIndexOf('|')), parseInt(k.substring(k.lastIndexOf('|') + 1))];
    registraAssegnazione(nomeK, cella[k], gK);
  });
  for (let g = 1; g <= nGiorni; g++) {
    (fabbG[g] || []).forEach((f) => {
      const t = _pianoTurnoInfo(f.turno_codice);
      if (!t) return;
      const dstr = ym + '-' + String(g).padStart(2, '0');
      let have = nomi.filter((n) => cella[n + '|' + g] === f.turno_codice).length;
      while (have < f.quantita) {
        const dowG = new Date(dstr + 'T12:00:00').getDay();
        const candidati = nomi
          .filter((n) => {
            const esistente = cella[n + '|' + g];
            if (malattie[n + '|' + dstr]) return false;
            if (esistente && esistente !== 'WD') return false;
            if (esistente === 'WD' && t.tipo === 'NOTTURNO') return false; // WD = diurno forzato
            const infoC = _pianoCollabInfo(n);
            // preferenze collaboratore
            if (infoC && infoC.solo_diurni && t.tipo === 'NOTTURNO') return false;
            if (
              infoC &&
              infoC.turni_bloccati &&
              infoC.turni_bloccati
                .split(',')
                .map((x) => x.trim())
                .includes(f.turno_codice)
            )
              return false;
            // mappature per funzione (SUP/BO limitati ai loro turni; regole settimana SUP)
            const fz = infoC && infoC.funzione;
            // regola HARD l1_solo_bo_sup: L1 e 9 riservati a BO e SUP
            if (
              (f.turno_codice === 'L1' || f.turno_codice === '9') &&
              String(_pianoRegolaVal('l1_solo_bo_sup')).toUpperCase() === 'TRUE' &&
              fz !== 'SUP' &&
              fz !== 'BO' &&
              !(_pianoSettoriEffettivi(infoC) || []).some((x) => x === 'BO' || x === 'SUP')
            )
              return false;
            // regola HARD no_4w1c1w: niente rientro dopo UN solo giorno di riposo
            // se prima c'erano 4+ giorni di lavoro consecutivi
            if (String(_pianoRegolaVal('no_4w1c1w')).toUpperCase() === 'TRUE') {
              const cp0 = consecPrima(n, g);
              if (cp0 === 0 && !_pianoIsLavoro(cella[n + '|' + (g - 1)] || '')) {
                let streakPrec = 0;
                for (let k = g - 2; k >= 1 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) streakPrec++;
                if (streakPrec >= 4) return false;
              }
            }
            // REGOLE DI GRUPPO (port di eligibility.py Turnivo): i settori
            // assegnati al collaboratore (settori_piano, M2M di Turnivo) sono la
            // fonte di verità; la storia vale solo se i settori non sono configurati
            const gruppoT = (t.gruppo || '').toUpperCase();
            const fzU = (fz || '').toUpperCase();
            const settoriC = _pianoSettoriEffettivi(infoC);
            const haStoria = settoriC ? settoriC.includes(gruppoT) : !!(idoneita[n] && idoneita[n].has(t.gruppo));
            let campoGrant = false;
            for (const rg of _pianoRegoleGruppoDi(gruppoT)) {
              const tipoR = (rg.tipo_regola || '').toLowerCase();
              if (tipoR === 'richiede_funzione') {
                const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
                if (!haStoria && !ammesse.includes(fzU)) return false;
              } else if (tipoR === 'blocca_tipo_turno') {
                const tipi = rg.valore.split(',').map((x) => x.trim().toUpperCase());
                if (tipi.includes((t.tipo || '').toUpperCase())) return false;
              } else if (tipoR === 'richiede_campo') {
                if (!_pianoCampoOk(infoC, rg.valore)) return false;
                campoGrant = true;
              } else if (tipoR === 'limite_funzione_giorno') {
                const [fu, nMax] = rg.valore.split(':');
                if (
                  fzU === (fu || '').toUpperCase() &&
                  (contaGiornoFz[gruppoT + '|' + fzU + '|' + g] || 0) >= (parseInt(nMax) || 99)
                )
                  return false;
              } else if (tipoR === 'limite_funzione_mese') {
                const [fu, nMax] = rg.valore.split(':');
                if (fzU === (fu || '').toUpperCase()) {
                  const set = collabMeseFz[gruppoT + '|' + fzU];
                  if (set && set.size >= (parseInt(nMax) || 99) && !set.has(n)) return false;
                }
              }
            }
            // limiti ore (regole tolleranza_ore/_sopra, jolly_ore_max):
            // nessuno supera il PROPRIO massimo mensile; i jolly senza
            // regola restano liberi di coprire il fabbisogno (come Turnivo)
            {
              const limN = _pianoLimitiOre(n, nGiorni);
              if (limN.max != null) {
                // per chi ha obiettivo il max segue anche il saldo cumulato (YTD)
                const maxEff = limN.obiettivo != null ? limN.max - (_pianoYtdMap[n] || 0) : limN.max;
                if ((oreMese[n] || 0) + (parseFloat(t.durata_ore) || 0) > maxEff) return false;
              }
            }
            // accompagnamento: nei gruppi indicati non puo essere il primo/solo
            if (infoC && infoC.accompagnamento_settori) {
              const grAcc = _pianoAccompagnamentoDi(infoC);
              if (grAcc.includes(gruppoT) && !(contaGiornoTot[gruppoT + '|' + g] || 0)) return false;
            }
            const mapp = _pianoMappFunzione(fz);
            if (mapp) {
              const voci = mapp
                .filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO')
                .map((m) => m.turno_codice);
              if (voci.length && !voci.includes(f.turno_codice)) return false;
              if (
                fz === 'SUP' &&
                dowG >= 1 &&
                dowG <= 4 &&
                !(f.turno_codice[0] === 'Z' || f.turno_codice === 'L1' || f.turno_codice === '9')
              )
                return false;
            } else if (!haStoria && !campoGrant) return false;
            return consecPrima(n, g) < maxCons && riposoOk(n, g, t);
          })
          .sort((x, y) => {
            const mx = _pianoMappFunzione((_pianoCollabInfo(x) || {}).funzione);
            const my = _pianoMappFunzione((_pianoCollabInfo(y) || {}).funzione);
            const bonus = (m) =>
              m
                ? m.some(
                    (v) => v.turno_codice === f.turno_codice && (v.tipo === 'PRINCIPALE' || v.tipo === 'PREFERITO'),
                  )
                  ? -1
                  : 0
                : 0;
            // Pattern a BLOCCHI (anti-scacchiera): chi ha lavorato ieri continua
            // il blocco (fino a max consecutivi); chi ha riposato UN solo giorno
            // non viene richiamato subito (i riposi vanno a coppie, stile 4L+2R)
            const pattern = (n) => {
              if (cella[n + '|' + g] === 'WD') return -5; // WD = qui DEVE lavorare diurno: priorità massima
              let p = 0;
              const infoP = _pianoCollabInfo(n) || {};
              // preferisce L1 (2 collaboratrici in produzione Turnivo)
              if (f.turno_codice === 'L1' && infoP.prefers_l1) p -= 1;
              // minimo_funzione_giorno non ancora soddisfatto: privilegia la funzione richiesta
              const grT = (t.gruppo || '').toUpperCase();
              for (const rg of _pianoRegoleGruppoDi(grT)) {
                if ((rg.tipo_regola || '').toLowerCase() !== 'minimo_funzione_giorno') continue;
                const parti = rg.valore.split(':');
                const fu = (parti[0] || '').toUpperCase();
                const nMin = parseInt(parti[1]) || 1;
                const tipoF = (parti[2] || '').toUpperCase();
                const dows = parti[3] ? parti[3].split(',').map((x) => parseInt(x)) : null;
                const dowPy = (dowG + 6) % 7; // JS dom=0 -> Python lun=0
                if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) continue;
                if (dows && !dows.includes(dowPy)) continue;
                if (
                  ((infoP.funzione || '') + '').toUpperCase() === fu &&
                  (contaGiornoFz[grT + '|' + fu + '|' + g] || 0) < nMin
                )
                  p -= 2;
              }
              const cp = consecPrima(n, g);
              if (cp > 0 && cp < maxCons) return p - 3;
              if (cp === 0 && _pianoIsLavoro(cella[n + '|' + (g - 2)] || '')) return p + 2;
              return p;
            };
            const jx = (_pianoCollabInfo(x) || {}).is_jolly ? 1 : 0;
            const jy = (_pianoCollabInfo(y) || {}).is_jolly ? 1 : 0;
            return (
              pattern(x) - pattern(y) ||
              bonus(mx) - bonus(my) ||
              gapOre(y) - gapOre(x) || // chi è più lontano dal proprio obiettivo ore viene prima
              jx - jy || // a parità di gap, i fissi prima dei jolly
              (familiarita[y + '|' + f.turno_codice] || 0) - (familiarita[x + '|' + f.turno_codice] || 0)
            );
          });
        if (!candidati.length) {
          scoperti.push(f.turno_codice + ' giorno ' + g);
          break;
        }
        const scelto = candidati[0];
        const eraWd = cella[scelto + '|' + g] === 'WD';
        cella[scelto + '|' + g] = f.turno_codice;
        registraAssegnazione(scelto, f.turno_codice, g);
        oreMese[scelto] = (oreMese[scelto] || 0) + (parseFloat(t.durata_ore) || 0);
        if (eraWd && rigaDi[scelto + '|' + g]) {
          sostituzioniWd.push({ id: rigaDi[scelto + '|' + g].id, codice: f.turno_codice });
        } else {
          nuove.push({
            collaboratore: scelto,
            data: dstr,
            codice: f.turno_codice,
            protetto: false,
            generato: true,
            reparto_dip: _pianoReparto(),
          });
        }
        have++;
      }
    });
  }
  // ===== CGF AUTOMATICI =====
  // Chi ha lavorato un giorno festivo (flag CGF) matura una compensazione:
  // la bozza gliela assegna da sola nei BUCHI del mese (giorni senza turno),
  // nei giorni successivi al festivo. I CGF già goduti vengono scalati.
  const festiviCgf = new Set(pianoFestiviCache.filter((f) => f.cgf !== false).map((f) => f.data));
  const annoCorr = ym.split('-')[0];
  const annoPrec = String(Number(annoCorr) - 1);
  const cgfDovuti = {}; // nome -> [{daGiorno}]
  // saldo (maturati - goduti) su anno precedente + corrente: così un festivo
  // lavorato a fine dicembre viene compensato anche generando gennaio
  const contaturaCgf = {};
  storia.forEach((r) => {
    if (!r.data.startsWith(annoCorr) && !r.data.startsWith(annoPrec)) return;
    if (festiviCgf.has(r.data) && _pianoTurnoInfo(r.codice))
      contaturaCgf[r.collaboratore] = (contaturaCgf[r.collaboratore] || 0) + 1;
    if (r.codice === 'CGF') contaturaCgf[r.collaboratore] = (contaturaCgf[r.collaboratore] || 0) - 1;
  });
  nomi.forEach((n) => {
    // mese corrente: festivi lavorati (celle esistenti + appena generate) e CGF già presenti
    const eventiMese = [];
    let cgfPresentiMese = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = cella[n + '|' + g];
      if (!cod) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (festiviCgf.has(dstrG) && _pianoTurnoInfo(cod)) eventiMese.push(g + 1);
      if (cod === 'CGF') cgfPresentiMese++;
    }
    // bilancio TOTALE anno: crediti dei mesi passati + festivi del mese −
    // CGF già goduti (passati e del mese): mai doppi se uno è già a mano
    const totale = (contaturaCgf[n] || 0) + eventiMese.length - cgfPresentiMese;
    if (totale <= 0) return;
    // prima gli eventi del mese (nei giorni successivi al festivo),
    // poi i crediti residui dei mesi precedenti in qualsiasi buco
    const lista = [];
    eventiMese.slice(-Math.min(totale, eventiMese.length)).forEach((daG) => lista.push({ daGiorno: daG }));
    for (let k = lista.length; k < totale; k++) lista.push({ daGiorno: 1 });
    cgfDovuti[n] = lista;
  });
  let nCgfAuto = 0;
  nomi.forEach((n) => {
    (cgfDovuti[n] || []).forEach((dovuto) => {
      for (let g = Math.max(1, dovuto.daGiorno); g <= nGiorni; g++) {
        if (cella[n + '|' + g]) continue;
        const dstrG = ym + '-' + String(g).padStart(2, '0');
        if (malattie[n + '|' + dstrG]) continue;
        cella[n + '|' + g] = 'CGF';
        nuove.push({
          collaboratore: n,
          data: dstrG,
          codice: 'CGF',
          protetto: false,
          generato: true,
          commento: 'CGF automatico (compensazione festivo lavorato)',
          reparto_dip: _pianoReparto(),
        });
        nCgfAuto++;
        break;
      }
    });
  });

  // RIEMPIMENTO C: come nei piani fatti a mano, nessuna cella resta vuota —
  // ogni giorno senza turno/assenza riceve C (congedo, 0 ore, rigenerabile)
  let nCongedi = 0;
  nomi.forEach((n) => {
    const infoN = _pianoCollabInfo(n) || {};
    if (String(infoN.reparti_extra || '').trim()) return; // multi-reparto: niente C automatiche
    for (let g = 1; g <= nGiorni; g++) {
      if (cella[n + '|' + g]) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (malattie[n + '|' + dstrG]) continue;
      cella[n + '|' + g] = 'C';
      nuove.push({
        collaboratore: n,
        data: dstrG,
        codice: 'C',
        protetto: false,
        generato: true,
        reparto_dip: _pianoReparto(),
      });
      nCongedi++;
    }
  });
  if (!nuove.length && !sostituzioniWd.length) {
    toast(
      'Niente da generare: fabbisogni già coperti' +
        (scoperti.length ? ' (' + scoperti.length + ' scoperti senza candidati)' : ''),
    );
    renderPiano();
    return;
  }
  if (
    !confirm(
      'Genera bozza per ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        '):\n\n• ' +
        (nuove.length + sostituzioniWd.length - nCgfAuto - nCongedi) +
        ' turni da assegnare' +
        (nCgfAuto ? '\n• ' + nCgfAuto + ' CGF automatici (compensazione festivi lavorati)' : '') +
        (nCongedi ? '\n• ' + nCongedi + ' congedi C di riempimento (giorni senza turno)' : '') +
        '\n• ' +
        scoperti.length +
        ' posti senza candidato idoneo\n\nLe celle esistenti (vacanze, protette, malattie) NON vengono toccate.\nLa bozza si può eliminare con "Cancella piano". Procedere?',
    )
  )
    return;
  try {
    let inseriteTot = 0;
    for (let i = 0; i < nuove.length; i += 2500) {
      const r2 = await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove.slice(i, i + 2500) });
      inseriteTot += (r2 && r2.inserite) || 0;
    }
    const r = { inserite: inseriteTot };
    for (const sw of sostituzioniWd) {
      await secPatch('piano', 'id=eq.' + sw.id, {
        codice: sw.codice,
        protetto: false,
        generato: true,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    }
    logAzione('Piano: bozza generata', ym + ' — ' + nuove.length + ' turni, ' + scoperti.length + ' scoperti');
    toast(
      'Bozza generata: ' +
        ((r && r.inserite) || nuove.length) +
        ' turni' +
        (scoperti.length ? ' — ' + scoperti.length + ' scoperti' : ''),
    );
    _pianoViolLista = null;
    _pianoViolCelle = {};
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore generazione bozza');
  }
}

async function cancellaBozzaPiano() {
  // IDENTICO a Turnivo (cancella_piano): elimina le celle NON protette del mese;
  // opzione "cancella tutto" per includere anche le protette.
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const nonProtette = _pianoRighe.filter((r) => !r.protetto).length;
  const protette = _pianoRighe.length - nonProtette;
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cancella piano — ' +
    ym +
    '</h3><p style="margin-bottom:14px;font-size:.88rem">' +
    nonProtette +
    ' celle generate/non protette, ' +
    protette +
    ' protette (manuali/vacanze).</p>' +
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" onclick="eseguiCancellaPiano(false)">Solo non protette (' +
    nonProtette +
    ')</button>' +
    '<button class="btn-modal-ok" style="background:var(--accent)" onclick="eseguiCancellaPiano(true)">TUTTE (' +
    _pianoRighe.length +
    ')</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCancellaPiano(tutto) {
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const n = tutto ? _pianoRighe.length : _pianoRighe.filter((r) => !r.protetto).length;
  if (!n) {
    toast('Niente da cancellare');
    return;
  }
  if (
    tutto &&
    !confirm('ATTENZIONE: verranno eliminate ANCHE le celle protette (vacanze, inserimenti manuali). Confermi?')
  )
    return;
  try {
    await secDel(
      'piano',
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + (tutto ? '' : '&protetto=eq.false'),
    );
    logAzione('Piano: cancellato', ym + ' — ' + n + ' celle (tutto=' + tutto + ')');
    toast('Piano cancellato: ' + n + ' celle rimosse');
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}

// ================================================================
// REGOLE DEL PIANO — card admin: elenco ordinato, valori e stato
// modificabili. Etichetta onesta su DOVE ogni regola è applicata.
// ================================================================
const PIANO_REGOLE_DOVE = {
  tolleranza_ore: 'Validatore + Bozza + Migliora ore',
  tolleranza_ore_sopra: 'Validatore + Bozza + Migliora ore',
  tolleranza_ore_sotto: 'Validatore',
  jolly_ore_min: 'Validatore',
  jolly_ore_max: 'Validatore + Bozza',
  max_consecutivi: 'Validatore + Bozza',
  min_riposo_ore: 'Validatore + Bozza',
  no_4w1c1w: 'Validatore',
  diurno_prima_vacanza: 'Validatore',
  sup_solo_z_settimana: 'Validatore + Bozza',
  sup_ven_sab_z_e_s: 'Validatore + Bozza',
  l1_solo_bo_sup: 'Validatore + Bozza',
};
function _pianoRegoleDove(nome) {
  return PIANO_REGOLE_DOVE[nome] || 'Solver (Fase 3)';
}
function _renderPianoRegoleCard() {
  if (!isAdmin()) return '';
  const ordineTipo = { HARD: 1, SOFT: 2, PIPELINE: 3 };
  const regole = pianoRegoleCache
    .slice()
    .sort((a, b) => (ordineTipo[a.tipo] || 9) - (ordineTipo[b.tipo] || 9) || (b.peso || 0) - (a.peso || 0));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole del piano (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">HARD = mai violabili (il validatore le segnala). SOFT = preferenze con peso. PIPELINE = usate dal generatore. La colonna "Applicata da" dice onestamente dove ogni regola agisce oggi: quelle marcate "Solver (Fase 3)" sono conservate ma non ancora attive nel Diario.</p>';
  let tipoCorr = '';
  h += '<div style="overflow-x:auto"><table class="piano-table" style="min-width:720px;font-size:.85rem">';
  h +=
    '<thead><tr><th style="text-align:left">Regola</th><th style="text-align:left">Descrizione</th><th>Valore</th><th>Peso</th><th>Attiva</th><th>Applicata da</th></tr></thead><tbody>';
  regole.forEach((r) => {
    if (r.tipo !== tipoCorr) {
      tipoCorr = r.tipo;
      h +=
        '<tr><td colspan="6" style="text-align:left;background:var(--paper2);font-weight:700;letter-spacing:.06em">' +
        escP(tipoCorr) +
        '</td></tr>';
    }
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(r.nome) +
      '</td><td style="text-align:left;white-space:normal;min-width:220px">' +
      escP(r.descrizione || '') +
      '</td><td><input type="text" value="' +
      escP(r.valore || '') +
      '" onchange="salvaPianoRegola(' +
      r.id +
      ',\'valore\',this.value)" style="width:64px;padding:3px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td>' +
      (r.peso || 0) +
      '</td><td><input type="checkbox"' +
      (r.attivo !== false ? ' checked' : '') +
      ' onchange="salvaPianoRegola(' +
      r.id +
      ',\'attivo\',this.checked)"></td><td style="font-size:.78rem;color:' +
      (_pianoRegoleDove(r.nome).indexOf('Fase 3') === -1 ? '#2c6e49;font-weight:700' : 'var(--muted)') +
      '">' +
      _pianoRegoleDove(r.nome) +
      '</td></tr>';
  });
  h += '</tbody></table></div></div></div>';
  return h;
}
async function salvaPianoRegola(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    patch[campo] = campo === 'attivo' ? !!valore : String(valore).trim();
    await secPatch('piano_regole', 'id=eq.' + id, patch);
    const r = pianoRegoleCache.find((x) => x.id === id);
    if (r) r[campo] = patch[campo];
    logAzione('Piano: regola modificata', (r ? r.nome : id) + ' ' + campo + ' → ' + patch[campo]);
    toast('Regola aggiornata');
    _pianoViolCelle = {};
    _pianoViolLista = null;
  } catch (e) {
    toast('Errore salvataggio regola');
  }
}

// ================================================================
// PERSONALIZZAZIONE COMPLETA — fabbisogni, turni, codici, festivi
// ================================================================
let _pianoFabbCache = [];

async function setPianoFabbisogno(codice, dstr, qDiretta) {
  if (!puoGestirePiano()) return;
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  let q;
  if (qDiretta != null) {
    q = qDiretta;
  } else {
    const v = prompt(
      'Persone necessarie per ' +
        codice +
        ' il ' +
        new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
        ' (0 = rimuovi):',
      String(attuale),
    );
    if (v === null) return;
    q = parseInt(v);
  }
  if (isNaN(q) || q < 0 || q > 99) {
    toast('Inserisci un numero tra 0 e 99');
    return;
  }
  if (q === attuale) {
    renderPiano();
    return;
  }
  try {
    if (esistente && q === 0) {
      await secDel('piano_fabbisogni', 'id=eq.' + esistente.id);
    } else if (esistente) {
      await secPatch('piano_fabbisogni', 'id=eq.' + esistente.id, { quantita: q });
    } else if (q > 0) {
      await secPost('piano_fabbisogni', {
        data: dstr,
        turno_codice: codice,
        quantita: q,
        reparto_dip: _pianoReparto(),
      });
    } else return;
    logAzione('Piano: fabbisogno', codice + ' ' + dstr + ' → ' + q);
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio fabbisogno');
  }
}

// Modifica INLINE del fabbisogno: click sulla cella = scrivi il numero lì
function fabbisognoInline(codice, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('fabb', el);
    return;
  }
  if (!puoGestirePiano() || !el || el.querySelector('input')) return;
  _pianoBloccoPulisci();
  const esistente = _pianoFabbCache.find(
    (f) => f.turno_codice === codice && f.data === dstr && (f.reparto_dip || 'slots') === _pianoReparto(),
  );
  const attuale = esistente ? esistente.quantita : 0;
  const vecchio = el.innerHTML;
  el.innerHTML =
    '<input type="text" inputmode="numeric" value="' +
    (attuale || '') +
    '" size="1" maxlength="2" style="width:100%;min-width:0;box-sizing:border-box;border:1px solid #1a4a7a;border-radius:0;padding:0;margin:0;font:inherit;font-weight:700;text-align:center;background:transparent;color:inherit">';
  const inp = el.querySelector('input');
  inp.focus();
  inp.select();
  let chiuso = false;
  const conferma = async () => {
    if (chiuso) return;
    chiuso = true;
    const v = inp.value.trim();
    const q = v === '' ? 0 : parseInt(v);
    if (q === attuale || (v !== '' && isNaN(q))) {
      el.innerHTML = vecchio;
      if (v !== '' && isNaN(q)) toast('Inserisci un numero tra 0 e 99');
      return;
    }
    await setPianoFabbisogno(codice, dstr, q);
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      conferma();
    } else if (e.key === 'Escape') {
      chiuso = true;
      el.innerHTML = vecchio;
    }
  });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', conferma);
}

// Import fabbisogno da CSV/Excel — formato Turnivo (upload_fabbisogno):
// prima colonna = codice turno, colonne successive = quantità per i giorni
// 1..N del mese. SOSTITUISCE il fabbisogno del mese per questo settore.

// ---- lettura dei file Excel REALI (PIANO SLOTS/VALET 2026) ----
// I fogli sono per mese ("SETTEMBRE 2026"), l'intestazione giorni è una riga
// di date seriali (1..31) e le sigle sono spesso minuscole.
function _xlsFoglioMese(wb, ym) {
  const MESI_L = (typeof MESI_FULL !== 'undefined' ? MESI_FULL : []).map((m) => String(m).toUpperCase());
  const mese = MESI_L[parseInt(ym.split('-')[1]) - 1] || '';
  const anno = ym.split('-')[0];
  const hit = wb.SheetNames.find((n) => {
    const u = n.toUpperCase().trim();
    return mese && u.startsWith(mese) && u.includes(anno);
  });
  return hit || null;
}
// trova in una riga la mappa giorno -> indice colonna (valori 1..31 crescenti)
function _xlsMappaGiorni(riga, nGiorni) {
  const mappa = {};
  let trovati = 0;
  let atteso = 1;
  for (let c = 0; c < (riga || []).length && atteso <= nGiorni; c++) {
    let v = riga[c];
    if (v instanceof Date) v = Math.round((v - new Date(Date.UTC(1899, 11, 31))) / 86400000);
    const n = typeof v === 'number' ? Math.round(v) : parseInt(v);
    if (n === atteso) {
      mappa[atteso] = c;
      trovati++;
      atteso++;
    }
  }
  return trovati >= Math.min(10, nGiorni) ? mappa : null;
}
function _xlsCercaMappaGiorni(dati, nGiorni, daRiga, aRiga) {
  for (let r = daRiga; r <= Math.min(aRiga, dati.length - 1); r++) {
    const m = _xlsMappaGiorni(dati[r], nGiorni);
    if (m) return m;
  }
  return null;
}
function _xlsNormaNome(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

async function importaFabbisognoExcel(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!window.XLSX) {
    toast('Libreria Excel non caricata: controlla la connessione e ricarica');
    return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const codiciValidi = new Set(pianoTurniCache.map((t) => t.codice.toUpperCase()));
    const nuovi = [];
    let errori = 0;
    let fonte = '';
    // 1) file REALE (PIANO SLOTS/VALET): foglio del mese + sezione PIANIFICAZIONE
    const foglioMese = _xlsFoglioMese(wb, ym);
    let smartOk = false;
    if (foglioMese) {
      const dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
      let rPian = -1;
      for (let r = 0; r < dati.length; r++) {
        if ((dati[r] || []).some((v) => String(v).toUpperCase().includes('PIANIFICAZIONE'))) {
          rPian = r;
          break;
        }
      }
      if (rPian >= 0) {
        const mappa = _xlsMappaGiorni(dati[rPian], nGiorni) || _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
        if (mappa) {
          let vuoteConsecutive = 0;
          for (let r = rPian + 1; r < dati.length && vuoteConsecutive < 10; r++) {
            const riga = dati[r] || [];
            let cod = '';
            for (let c = 0; c < 6; c++) {
              const cand = String(riga[c] || '')
                .trim()
                .toUpperCase();
              if (cand === 'TOT') {
                cod = 'TOT';
                break;
              }
              if (codiciValidi.has(cand)) {
                cod = cand;
                break;
              }
            }
            if (cod === 'TOT') break;
            if (!cod) {
              vuoteConsecutive++;
              continue;
            }
            vuoteConsecutive = 0;
            for (let g = 1; g <= nGiorni; g++) {
              const q = parseInt(riga[mappa[g]]);
              if (!isNaN(q) && q > 0)
                nuovi.push({
                  data: ym + '-' + String(g).padStart(2, '0'),
                  turno_codice: cod,
                  quantita: q,
                  reparto_dip: _pianoReparto(),
                });
            }
          }
          smartOk = true;
          fonte = 'foglio "' + foglioMese + '" (sezione PIANIFICAZIONE)';
        }
      }
    }
    // 2) ripiego: formato semplice (prima colonna = turno, colonne = giorni 1..N)
    if (!smartOk) {
      const dati = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      let inizio = 0;
      const prima = String((dati[0] || [])[0] || '').toUpperCase();
      if (prima === 'TURNO' || prima === 'CODICE' || prima === 'SHIFT' || prima === '') inizio = 1;
      for (const riga of dati.slice(inizio)) {
        const cod = String(riga[0] || '')
          .trim()
          .toUpperCase();
        if (!cod) continue;
        if (!codiciValidi.has(cod)) {
          errori++;
          continue;
        }
        for (let g = 1; g <= nGiorni; g++) {
          const q = parseInt(riga[g]);
          if (!isNaN(q) && q > 0)
            nuovi.push({
              data: ym + '-' + String(g).padStart(2, '0'),
              turno_codice: cod,
              quantita: q,
              reparto_dip: _pianoReparto(),
            });
        }
      }
      fonte = 'formato semplice (turno + giorni)';
    }
    if (!nuovi.length) {
      toast(
        'Nessuna quantità riconosciuta nel file' +
          (foglioMese ? '' : ' — manca il foglio del mese selezionato') +
          (errori ? ' (' + errori + ' codici turno sconosciuti)' : ''),
      );
      return;
    }
    const MESI_L = MESI_FULL || [];
    const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
    if (
      !confirm(
        'Importare il fabbisogno di ' +
          lbl +
          '?\n\n• Letto da: ' +
          fonte +
          '\n• ' +
          nuovi.length +
          ' celle da caricare' +
          (errori ? '\n• ' + errori + ' righe con codice turno sconosciuto (saltate)' : '') +
          '\n\nATTENZIONE: il fabbisogno esistente del mese viene SOSTITUITO (come in Turnivo).',
      )
    )
      return;
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    await secDel('piano_fabbisogni', 'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto());
    for (let i = 0; i < nuovi.length; i += 10)
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    logAzione('Fabbisogno importato', ym + ' — ' + nuovi.length + ' celle');
    toast('Fabbisogno importato: ' + nuovi.length + ' celle');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file fabbisogno');
  }
}
// IMPORT PIANO da Excel/CSV (come l'import del foglio PIANO SLOTS in
// Turnivo): prima colonna = collaboratore, colonne successive = giorni
// 1..N con le sigle. Le celle esistenti NON vengono toccate; sigle
// sconosciute e nomi non riconosciuti vengono scartati e conteggiati.
// L'ordine delle righe resta quello predefinito (SUP, BO, poi gli
// altri) e si può sempre riordinare trascinando i nomi.
async function importaPianoExcel(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const collabs = collaboratoriCache.filter((c) => c.attivo !== false);
    // match nomi robusto: maiuscole/minuscole, ordine parole, refusi tipo 0/O e 1/I
    const trova = (nome) => {
      const n = _xlsNormaNome(nome).toLowerCase();
      if (!n) return null;
      return (
        collabs.find((c) => {
          const cn = _xlsNormaNome(c.nome).toLowerCase();
          return cn === n || (n.split(' ').length > 1 && n.split(' ').every((p) => cn.includes(p)));
        }) || null
      );
    };
    // layout: file REALE (foglio del mese, giorni da riga seriale, nomi nella
    // colonna con più riscontri) oppure formato semplice (nome + giorni 1..N)
    const foglioMese = _xlsFoglioMese(wb, ym);
    let dati, mappa, colNome, inizio, fonte;
    if (foglioMese) {
      dati = XLSX.utils.sheet_to_json(wb.Sheets[foglioMese], { header: 1, defval: '', raw: true });
      mappa = _xlsCercaMappaGiorni(dati, nGiorni, 0, 8);
    }
    const wsCommenti = foglioMese ? wb.Sheets[foglioMese] : null;
    const commentoCella = (rIdx, cIdx) => {
      if (!wsCommenti) return '';
      try {
        const cel = wsCommenti[XLSX.utils.encode_cell({ r: rIdx, c: cIdx })];
        if (!cel || !cel.c || !cel.c.length) return '';
        return String(cel.c.map((x) => x.t || '').join(' '))
          .replace(/^[^:\n]{0,20}:\s*/, '')
          .replace(/\r/g, '')
          .replace(/\n+/g, ' ')
          .trim();
      } catch (e) {
        return '';
      }
    };
    if (foglioMese && mappa) {
      const primoGiornoCol = mappa[1];
      let rIntest = 0;
      for (let r = 0; r <= 8; r++) if (_xlsMappaGiorni(dati[r], nGiorni)) rIntest = r;
      // colonna nomi = quella a sinistra dei giorni con più collaboratori riconosciuti
      colNome = 1;
      let bestHit = -1;
      for (let c = 0; c < primoGiornoCol; c++) {
        let hit = 0;
        for (let r = rIntest + 1; r < Math.min(dati.length, rIntest + 80); r++) if (trova((dati[r] || [])[c])) hit++;
        if (hit > bestHit) {
          bestHit = hit;
          colNome = c;
        }
      }
      inizio = rIntest + 1;
      fonte = 'foglio "' + foglioMese + '"';
    } else {
      dati = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      mappa = null;
      colNome = 0;
      inizio = 0;
      const prima = String((dati[0] || [])[0] || '').toLowerCase();
      if (!prima || prima.includes('collaborator') || prima.includes('nome')) inizio = 1;
      fonte = 'formato semplice';
    }
    // match anche sui DISATTIVATI (da riattivare) e raccolta dei NUOVI
    const tuttiCollabs = collaboratoriCache;
    const trovaTutti = (nome) => {
      const nrm = _xlsNormaNome(nome).toLowerCase();
      if (!nrm) return null;
      return (
        tuttiCollabs.find((c) => {
          const cn = _xlsNormaNome(c.nome).toLowerCase();
          return cn === nrm || (nrm.split(' ').length > 1 && nrm.split(' ').every((p) => cn.includes(p)));
        }) || null
      );
    };
    const titolo = (str) =>
      _xlsNormaNome(str)
        .toLowerCase()
        .replace(/(^|[\s.'-])(\w)/g, (m, a, b) => a + b.toUpperCase());
    const righeCollab = []; // {nome, celle:[{g,cod}], stato:'ok'|'riattiva'|'nuovo', funzione, percentuale, ref}
    const nomiOk = new Set();
    let sigleScartate = 0;
    dati.slice(inizio).forEach((riga, idxRiga) => {
      const raw = String(riga[colNome] || '').trim();
      if (!raw || raw.length < 4 || /^\d/.test(raw)) return;
      const celle = [];
      for (let g = 1; g <= nGiorni; g++) {
        const cod = String(riga[mappa ? mappa[g] : g] || '')
          .trim()
          .toUpperCase();
        if (!cod) continue;
        if (!_pianoTurnoInfo(cod) && !_pianoCodiceInfo(cod)) {
          sigleScartate++;
          continue;
        }
        celle.push({ g: g, cod: cod, commento: mappa ? commentoCella(inizio + idxRiga, mappa[g]) : '' });
      }
      const hit = trovaTutti(raw);
      if (hit && hit.attivo !== false) {
        if (!celle.length) return;
        righeCollab.push({ nome: hit.nome, celle: celle, stato: 'ok' });
        nomiOk.add(hit.nome);
      } else if (hit) {
        if (!celle.length) return;
        righeCollab.push({ nome: hit.nome, celle: celle, stato: 'riattiva', ref: hit });
      } else if (celle.length >= 3 && celle.some((c) => c.cod !== 'C')) {
        // collaboratore NUOVO trovato nel file: funzione e % dalle colonne
        // accanto (chi ha solo congedo C non viene creato)
        const fz = String(riga[colNome + 1] || '')
          .trim()
          .toUpperCase();
        const funzioni = window._pianoFunzioni || ['RESP', 'SOSTRESP', 'SUP', 'BO', 'HOST'];
        const pct = parseFloat(riga[colNome + 2]);
        righeCollab.push({
          nome: titolo(raw),
          celle: celle,
          stato: 'nuovo',
          funzione: funzioni.includes(fz) ? fz : 'HOST',
          percentuale: !isNaN(pct) && pct > 0 && pct <= 1 ? pct : 1,
          isJolly: isNaN(pct) || !pct,
        });
      }
    });
    const nuoviCollab = righeCollab.filter((r) => r.stato === 'nuovo');
    const daRiattivare = righeCollab.filter((r) => r.stato === 'riattiva');
    const nuove = [];
    righeCollab.forEach((rc) =>
      rc.celle.forEach((c) =>
        nuove.push({
          collaboratore: rc.nome,
          data: ym + '-' + String(c.g).padStart(2, '0'),
          codice: c.cod,
          protetto: true,
          generato: false,
          commento: c.commento || null,
          reparto_dip: _pianoReparto(),
        }),
      ),
    );
    if (!nuove.length) {
      toast('Nessuna cella riconosciuta nel file');
      return;
    }
    const MESI_L = MESI_FULL || [];
    const lbl = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
    if (
      !confirm(
        'Importare il piano di ' +
          lbl +
          '?\n\n• Letto da: ' +
          fonte +
          '\n• ' +
          nomiOk.size +
          ' collaboratori riconosciuti\n• ' +
          nuove.length +
          ' celle da importare (protette)' +
          (sigleScartate ? '\n• ' + sigleScartate + ' sigle sconosciute scartate' : '') +
          (nuoviCollab.length
            ? '\n• NUOVI collaboratori da creare: ' +
              nuoviCollab.map((x) => x.nome + ' (' + x.funzione + ')').join(', ')
            : '') +
          (daRiattivare.length
            ? '\n• Da RIATTIVARE (disattivati ma presenti nel file): ' + daRiattivare.map((x) => x.nome).join(', ')
            : '') +
          '\n\nLe celle già presenti NON vengono toccate.',
      )
    )
      return;
    for (const nc of nuoviCollab) {
      const creato = await secPost('collaboratori', {
        nome: nc.nome,
        attivo: true,
        reparto_dip: _pianoReparto(),
        funzione: nc.funzione,
        percentuale: nc.percentuale,
        is_jolly: !!nc.isJolly,
      });
      if (creato && creato[0]) collaboratoriCache.push(creato[0]);
      logAzione('Collaboratore creato da import piano', nc.nome + ' (' + nc.funzione + ')');
    }
    if (
      daRiattivare.length &&
      confirm(
        'Riattivo anche i collaboratori disattivati presenti nel file?\n\n' +
          daRiattivare.map((x) => '• ' + x.nome).join('\n') +
          '\n\n(Se rispondi Annulla, le loro celle vengono importate comunque ma restano disattivati)',
      )
    ) {
      for (const rc of daRiattivare) {
        await secPatch('collaboratori', 'id=eq.' + rc.ref.id, { attivo: true });
        rc.ref.attivo = true;
        logAzione('Collaboratore riattivato da import piano', rc.nome);
      }
    }
    // proposta di disattivazione: chi è attivo ma NON compare nel file,
    // oppure compare ma ha SOLO congedo (tutto il mese a C, nessun turno
    // né malattia)
    const lavoranti = new Set(righeCollab.filter((x) => x.celle.some((c) => c.cod !== 'C')).map((x) => x.nome));
    const daDisattivare = collaboratoriCache.filter(
      (c) =>
        c.attivo !== false &&
        (c.reparto_dip || 'slots') === _pianoReparto() &&
        !lavoranti.has(c.nome) &&
        !String(c.reparti_extra || '').trim(), // i multi-reparto lavorano altrove
    );
    if (
      daDisattivare.length &&
      confirm(
        'Questi collaboratori attivi NON hanno turni nel file (assenti o con solo congedo C): li disattivo?\n\n' +
          daDisattivare.map((x) => '• ' + x.nome).join('\n') +
          '\n\n(Se rispondi Annulla restano attivi)',
      )
    ) {
      for (const c of daDisattivare) {
        await secPatch('collaboratori', 'id=eq.' + c.id, { attivo: false });
        c.attivo = false;
        logAzione('Collaboratore disattivato da import piano', c.nome + ' (assente dal file ' + ym + ')');
      }
    }
    const r = await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove });
    logAzione('Piano importato da Excel', ym + ' — ' + ((r && r.inserite) || 0) + '/' + nuove.length + ' celle');
    toast('Piano importato: ' + ((r && r.inserite) || 0) + ' celle nuove');
    setTimeout(async () => {
      await _pianoProponiCertificazioniBulk(
        nuove.map((x) => ({ nome: x.collaboratore, codice: x.codice, commento: x.commento || '' })),
      );
      await controllaFormazioniCompletate(true);
    }, 400);
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file piano');
  }
}

// come fabbisogno.elimina di Turnivo: cancella tutto il fabbisogno del mese
async function eliminaFabbisognoMese() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const n = _pianoFabbCache.length;
  if (!n) {
    toast('Nessun fabbisogno da eliminare per ' + ym);
    return;
  }
  if (
    !confirm(
      'Eliminare TUTTO il fabbisogno di ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        ')?\n\n' +
        n +
        ' celle verranno rimosse. Il piano già generato NON viene toccato.',
    )
  )
    return;
  try {
    const nG = _pianoUltimoGiorno(ym);
    await secDel(
      'piano_fabbisogni',
      'data=gte.' +
        ym +
        '-01&data=lte.' +
        ym +
        '-' +
        String(nG).padStart(2, '0') +
        '&reparto_dip=eq.' +
        _pianoReparto(),
    );
    logAzione('Fabbisogno eliminato', ym + ' — ' + n + ' celle');
    toast('Fabbisogno eliminato: ' + n + ' celle');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione fabbisogno');
  }
}
async function copiaFabbisognoMese() {
  if (!puoGestirePiano()) return;
  const p = _pianoMeseSel.split('-');
  const dPrec = new Date(parseInt(p[0]), parseInt(p[1]) - 2, 15);
  const ymPrec = dPrec.getFullYear() + '-' + String(dPrec.getMonth() + 1).padStart(2, '0');
  const daP = ymPrec + '-01';
  const aP = ymPrec + '-' + String(_pianoUltimoGiorno(ymPrec)).padStart(2, '0');
  const prec =
    (await secGet(
      'piano_fabbisogni?data=gte.' + daP + '&data=lte.' + aP + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
  if (!prec.length) {
    toast('Nessun fabbisogno nel mese precedente (' + ymPrec + ')');
    return;
  }
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const giaPresenti = new Set(_pianoFabbCache.map((f) => f.data + '|' + f.turno_codice));
  const nuovi = prec
    .map((f) => ({ giorno: parseInt(f.data.split('-')[2]), turno_codice: f.turno_codice, quantita: f.quantita }))
    .filter((f) => f.giorno <= nGiorni)
    .map((f) => ({
      data: _pianoMeseSel + '-' + String(f.giorno).padStart(2, '0'),
      turno_codice: f.turno_codice,
      quantita: f.quantita,
      reparto_dip: _pianoReparto(),
    }))
    .filter((f) => !giaPresenti.has(f.data + '|' + f.turno_codice));
  if (!nuovi.length) {
    toast('Fabbisogno già presente per tutte le celle del mese');
    return;
  }
  if (
    !confirm(
      'Copiare ' +
        nuovi.length +
        ' fabbisogni da ' +
        ymPrec +
        ' a ' +
        _pianoMeseSel +
        '?\n(le celle già impostate non vengono toccate)',
    )
  )
    return;
  try {
    for (let i = 0; i < nuovi.length; i += 10) {
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    }
    logAzione('Piano: fabbisogno copiato', ymPrec + ' → ' + _pianoMeseSel + ' (' + nuovi.length + ' celle)');
    toast('Fabbisogno copiato (' + nuovi.length + ' celle)');
    renderPiano();
  } catch (e) {
    toast('Errore copia fabbisogno');
  }
}

// ---- Card TURNI (admin) ----
function _renderPianoTurniCard() {
  if (!isAdmin()) return '';
  const turni = _pianoTurniReparto();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni — ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (admin)</div><div style="padding:10px 14px">';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:720px;font-size:.85rem"><thead><tr><th>Codice</th><th>Gruppo</th><th>Inizio</th><th>Fine</th><th>Ore</th><th>Tipo</th><th>Colore</th><th>Oltre 23</th><th>Attivo</th><th></th></tr></thead><tbody>';
  turni
    .slice()
    .sort((x, y) => (x.gruppo || '').localeCompare(y.gruppo || '') || x.codice.localeCompare(y.codice))
    .forEach((t) => {
      h +=
        '<tr><td style="font-weight:700;background:' +
        (t.colore || '#fff') +
        '">' +
        escP(t.codice) +
        '</td><td><input type="text" value="' +
        escP(t.gruppo || '') +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'gruppo\',this.value.toUpperCase())" style="width:86px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_inizio || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_inizio\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="time" value="' +
        escP((t.ora_fine || '').substring(0, 5)) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'ora_fine\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="number" step="0.25" value="' +
        (t.durata_ore || 0) +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'durata_ore\',this.value)" style="width:58px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><select onchange="salvaPianoTurno(' +
        t.id +
        ',\'tipo\',this.value)" style="padding:2px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option' +
        (t.tipo === 'DIURNO' ? ' selected' : '') +
        '>DIURNO</option><option' +
        (t.tipo === 'NOTTURNO' ? ' selected' : '') +
        '>NOTTURNO</option></select></td><td><input type="color" value="' +
        (t.colore && /^#[0-9a-fA-F]{6}$/.test(t.colore) ? t.colore : '#ffffff') +
        '" onchange="salvaPianoTurno(' +
        t.id +
        ',\'colore\',this.value)" title="Colore di sfondo della sigla nel piano" style="width:38px;height:26px;padding:0;border:1px solid var(--line);cursor:pointer"></td><td><input type="checkbox"' +
        (t.oltre23 ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'oltre23\',this.checked)"></td><td><input type="checkbox"' +
        (t.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoTurno(' +
        t.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaPianoTurno(' +
        t.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Codice</label><input type="text" id="pt-nuovo-codice" placeholder="S9" style="width:80px"></div>' +
    '<div class="field"><label>Gruppo</label><input type="text" id="pt-nuovo-gruppo" placeholder="SALA" style="width:110px"></div>' +
    '<div class="field"><label>Inizio</label><input type="time" id="pt-nuovo-inizio"></div>' +
    '<div class="field"><label>Fine</label><input type="time" id="pt-nuovo-fine"></div>' +
    '<div class="field"><label>Ore</label><input type="number" step="0.25" id="pt-nuovo-ore" value="8.25" style="width:70px"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoTurno()">+ Aggiungi turno</button></div>';
  h += '</div></div>';
  return h;
}
async function salvaPianoTurno(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'oltre23') patch[campo] = !!valore;
    else if (campo === 'durata_ore') patch[campo] = parseFloat(valore) || 0;
    else patch[campo] = String(valore).trim();
    await secPatch('piano_turni', 'id=eq.' + id, patch);
    const t = pianoTurniCache.find((x) => x.id === id);
    if (t) t[campo] = patch[campo];
    logAzione('Piano: turno modificato', (t ? t.codice : id) + ' ' + campo + ' → ' + patch[campo]);
    toast('Turno aggiornato');
  } catch (e) {
    toast('Errore salvataggio turno');
  }
}
async function aggiungiPianoTurno() {
  if (!isAdmin()) return;
  const codice = ((document.getElementById('pt-nuovo-codice') || {}).value || '').trim().toUpperCase();
  const gruppo = ((document.getElementById('pt-nuovo-gruppo') || {}).value || '').trim().toUpperCase();
  const inizio = (document.getElementById('pt-nuovo-inizio') || {}).value || '';
  const fine = (document.getElementById('pt-nuovo-fine') || {}).value || '';
  const oreV = parseFloat((document.getElementById('pt-nuovo-ore') || {}).value) || 8.25;
  if (!codice || !gruppo || !inizio || !fine) {
    toast('Compila codice, gruppo e orari');
    return;
  }
  if (pianoTurniCache.some((t) => t.codice === codice && (t.reparto_dip || 'slots') === _pianoReparto())) {
    toast('Codice turno già esistente in questo settore');
    return;
  }
  const oltre23 = _pianoOra(fine) < _pianoOra(inizio) || _pianoOra(fine) > 23;
  try {
    const r = await secPost('piano_turni', {
      codice: codice,
      gruppo: gruppo,
      ora_inizio: inizio,
      ora_fine: fine,
      durata_ore: oreV,
      tipo: _pianoOra(inizio) >= 15 || oltre23 ? 'NOTTURNO' : 'DIURNO',
      oltre23: oltre23,
      colore: PIANO_COLORI_GRUPPO[gruppo] || '#EEEEEE',
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoTurniCache.push(r[0]);
    logAzione('Piano: turno aggiunto', codice + ' (' + gruppo + ')');
    toast('Turno ' + codice + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta turno');
  }
}
const PIANO_COLORI_GRUPPO = {
  SALA: '#F2DBDB',
  REC: '#FF99CC',
  CASSA: '#FBD4B4',
  SUP: '#B8CCE4',
  ACCOGLIENZA: '#C6EFCE',
  BO: '#CCC0D9',
  VALET: '#343a40',
};
async function eliminaPianoTurno(id) {
  if (!isAdmin()) return;
  const t = pianoTurniCache.find((x) => x.id === id);
  if (!t) return;
  const usato = (await secGet('piano?codice=eq.' + encodeURIComponent(t.codice) + '&limit=1')) || [];
  if (usato.length) {
    toast('Il turno ' + t.codice + ' è usato nel piano: disattivalo invece di eliminarlo');
    return;
  }
  if (!confirm('Eliminare il turno ' + t.codice + '? (mai usato nel piano)')) return;
  try {
    await secDel('piano_turni', 'id=eq.' + id);
    pianoTurniCache = pianoTurniCache.filter((x) => x.id !== id);
    logAzione('Piano: turno eliminato', t.codice);
    toast('Turno eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione turno');
  }
}

// ---- Card CODICI SPECIALI (admin) ----
function _renderPianoCodiciCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Codici speciali (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Assenze e situazioni non lavorative. "Riposo" = il codice conta come giorno di riposo per le regole. Le ore seguono le formule CCL originali.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:640px;font-size:.85rem"><thead><tr><th>Codice</th><th style="text-align:left">Descrizione</th><th>Ore</th><th title="Le ore vengono scalate per la percentuale d\'impiego">Scala %</th><th title="Inserendolo nel piano chiede orario di inizio e fine (es. JG)">Chiede orario</th><th>Riposo</th><th>Attivo</th><th></th></tr></thead><tbody>';
  pianoCodiciCache
    .slice()
    .sort((x, y) => x.codice.localeCompare(y.codice))
    .forEach((c) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(c.codice) +
        '</td><td style="text-align:left"><input type="text" value="' +
        escP(c.descrizione || '') +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'descrizione\',this.value)" style="width:200px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="number" step="0.001" value="' +
        (c.ore || 0) +
        '" onchange="salvaPianoCodice(' +
        c.id +
        ',\'ore\',this.value)" style="width:70px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
        (c.scala_percentuale ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'scala_percentuale\',this.checked)"></td><td><input type="checkbox"' +
        (c.richiede_orario ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'richiede_orario\',this.checked)"></td><td><input type="checkbox"' +
        (c.is_riposo ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'is_riposo\',this.checked)"></td><td><input type="checkbox"' +
        (c.attivo !== false ? ' checked' : '') +
        ' onchange="salvaPianoCodice(' +
        c.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaPianoCodice(' +
        c.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Codice</label><input type="text" id="pc-nuovo-codice" placeholder="XX" style="width:70px"></div>' +
    '<div class="field"><label>Descrizione</label><input type="text" id="pc-nuovo-desc" placeholder="Es: Permesso studio" style="width:200px"></div>' +
    '<div class="field"><label>Ore</label><input type="number" step="0.001" id="pc-nuovo-ore" value="0" style="width:80px"></div>' +
    '<label style="font-size:.85rem"><input type="checkbox" id="pc-nuovo-scala"> Scala %</label>' +
    '<label style="font-size:.85rem"><input type="checkbox" id="pc-nuovo-riposo"> Riposo</label>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoCodice()">+ Aggiungi codice</button></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoCodice() {
  if (!isAdmin()) return;
  const codice = ((document.getElementById('pc-nuovo-codice') || {}).value || '').trim().toUpperCase();
  const desc = ((document.getElementById('pc-nuovo-desc') || {}).value || '').trim();
  const oreV = parseFloat((document.getElementById('pc-nuovo-ore') || {}).value) || 0;
  const scala = (document.getElementById('pc-nuovo-scala') || {}).checked;
  const riposo = (document.getElementById('pc-nuovo-riposo') || {}).checked;
  if (!codice) {
    toast('Inserisci il codice');
    return;
  }
  if (pianoCodiciCache.some((c) => c.codice === codice)) {
    toast('Codice già esistente');
    return;
  }
  try {
    const r = await secPost('piano_codici', {
      codice: codice,
      descrizione: desc,
      ore: oreV,
      scala_percentuale: !!scala,
      is_riposo: !!riposo,
      attivo: true,
    });
    if (r && r[0]) pianoCodiciCache.push(r[0]);
    logAzione('Piano: codice aggiunto', codice);
    toast('Codice ' + codice + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta codice');
  }
}
async function eliminaPianoCodice(id) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.id === id);
  if (!c) return;
  const usato = (await secGet('piano?codice=eq.' + encodeURIComponent(c.codice) + '&limit=1')) || [];
  if (usato.length) {
    toast('Il codice ' + c.codice + ' è usato nel piano: disattivalo invece di eliminarlo');
    return;
  }
  if (!confirm('Eliminare il codice ' + c.codice + '?')) return;
  try {
    await secDel('piano_codici', 'id=eq.' + id);
    pianoCodiciCache = pianoCodiciCache.filter((x) => x.id !== id);
    logAzione('Piano: codice eliminato', c.codice);
    toast('Codice eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione codice');
  }
}
async function salvaPianoCodice(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    if (campo === 'attivo' || campo === 'is_riposo' || campo === 'scala_percentuale' || campo === 'richiede_orario')
      patch[campo] = !!valore;
    else if (campo === 'ore') patch[campo] = parseFloat(valore) || 0;
    else patch[campo] = String(valore).trim();
    await secPatch('piano_codici', 'id=eq.' + id, patch);
    const c = pianoCodiciCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: codice modificato', (c ? c.codice : id) + ' ' + campo);
    toast('Codice aggiornato');
  } catch (e) {
    toast('Errore salvataggio codice');
  }
}

// ---- Card FESTIVI (admin) ----
function _renderPianoFestiviCard() {
  if (!isAdmin()) return '';
  // selettore anno: si vedono (e generano) anche i festivi degli anni futuri
  const anniPresenti = [...new Set(pianoFestiviCache.map((f) => parseInt(f.data.split('-')[0])))];
  const annoCorrente = parseInt(_pianoMeseSel.split('-')[0]);
  const anni = [...new Set(anniPresenti.concat([annoCorrente]))].sort();
  const annoSel =
    window._pianoFestiviAnnoSel && anni.concat([window._pianoFestiviAnnoSel])
      ? window._pianoFestiviAnnoSel
      : annoCorrente;
  window._pianoFestiviAnnoSel = annoSel;
  const visibili = pianoFestiviCache.filter((f) => parseInt(f.data.split('-')[0]) === annoSel);
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px">Festivi ' +
    annoSel +
    ' (' +
    visibili.length +
    ')';
  h +=
    '<select onchange="window._pianoFestiviAnnoSel=parseInt(this.value);renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
  for (let a = 2024; a <= 2032; a++)
    h +=
      '<option value="' +
      a +
      '"' +
      (a === annoSel ? ' selected' : '') +
      '>' +
      a +
      (anniPresenti.includes(a) ? '' : ' (vuoto)') +
      '</option>';
  h += '</select></div><div style="padding:10px 14px">';
  if (!visibili.length)
    h +=
      '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Nessun festivo per il ' +
      annoSel +
      ': generali con il pulsante qui sotto.</p>';
  visibili
    .slice()
    .sort((x, y) => x.data.localeCompare(y.data))
    .forEach((f) => {
      h +=
        '<div class="tipo-item"><div class="tipo-item-name">' +
        new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') +
        ' — ' +
        escP(f.descrizione || '') +
        (f.cgf ? ' <span class="tipo-item-default">(CGF)</span>' : '') +
        '</div><button class="btn-del-tipo" onclick="eliminaPianoFestivo(' +
        f.id +
        ')">Rimuovi</button></div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Data</label><input type="date" id="pf-nuova-data"></div>' +
    '<div class="field"><label>Descrizione</label><input type="text" id="pf-nuova-desc" placeholder="Es: Natale"></div>' +
    '<label style="display:flex;align-items:center;gap:4px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="pf-nuovo-cgf" checked> CGF</label>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoFestivo()">+ Aggiungi</button></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:6px;border-top:1px solid var(--line);padding-top:8px"><div class="field"><label>Genera automaticamente i festivi di un anno</label><input type="number" id="pf-genera-anno" value="' +
    annoSel +
    '" min="2024" max="2050" style="width:90px"></div>' +
    '<button class="btn-add-tipo" onclick="generaPianoFestivi()">Genera festivi anno</button>' +
    '<span style="font-size:.8rem;color:var(--muted)">11 festivi italiani (Lunedì dell&#39;Angelo calcolato dalla Pasqua)</span></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoFestivo() {
  if (!isAdmin()) return;
  const data = (document.getElementById('pf-nuova-data') || {}).value || '';
  const desc = ((document.getElementById('pf-nuova-desc') || {}).value || '').trim();
  const cgf = !!(document.getElementById('pf-nuovo-cgf') || {}).checked;
  if (!data || !desc) {
    toast('Compila data e descrizione');
    return;
  }
  try {
    const r = await secPost('piano_festivi', { data: data, descrizione: desc, cgf: cgf });
    if (r && r[0]) pianoFestiviCache.push(r[0]);
    logAzione('Piano: festivo aggiunto', data + ' ' + desc);
    toast('Festivo aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore (data già presente?)');
  }
}
async function eliminaPianoFestivo(id) {
  if (!isAdmin()) return;
  const f = pianoFestiviCache.find((x) => x.id === id);
  if (!f || !confirm('Rimuovere il festivo ' + f.data + ' (' + (f.descrizione || '') + ')?')) return;
  try {
    await secDel('piano_festivi', 'id=eq.' + id);
    pianoFestiviCache = pianoFestiviCache.filter((x) => x.id !== id);
    logAzione('Piano: festivo rimosso', f.data);
    toast('Festivo rimosso');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione festivo');
  }
}

// ================================================================
// SETTORE DEL PIANO — un operatore autorizzato può vedere/gestire
// il piano di un altro settore (es. supervisor Tavoli sul piano
// Slots) senza cambiare login: il selettore vale solo per il Piano.
// ================================================================
let _pianoRepartoSel = null; // null = segue il settore corrente dell'app
function _pianoReparto() {
  return _pianoRepartoSel || currentReparto;
}
function pianoCambiaReparto(rep) {
  _pianoRepartoSel = rep === currentReparto ? null : rep;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ================================================================
// FESTIVI AUTOMATICI — genera i festivi di un anno con un click.
// Lista = quella osservata dal casinò (da Turnivo 2026): 7 fissi +
// Lunedì di Pasqua e Ascensione calcolati dalla data di Pasqua.
// ================================================================
function _pianoPasqua(anno) {
  // algoritmo di Meeus (calendario gregoriano)
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mese = Math.floor((hh + l - 7 * m + 114) / 31);
  const giorno = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno, 12);
}
function _pianoFestiviAnno(anno) {
  const pasqua = _pianoPasqua(anno);
  const add = (base, giorni) => {
    const d = new Date(base);
    d.setDate(d.getDate() + giorni);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  };
  // FESTIVI ITALIANI (scelta confermata dall'utente il 29/08/2026)
  return [
    { data: anno + '-01-01', descrizione: 'Capodanno' },
    { data: anno + '-01-06', descrizione: 'Epifania' },
    { data: add(pasqua, 1), descrizione: "Lunedì dell'Angelo" },
    { data: anno + '-04-25', descrizione: 'Festa della Liberazione' },
    { data: anno + '-05-01', descrizione: 'Festa del Lavoro' },
    { data: anno + '-06-02', descrizione: 'Festa della Repubblica' },
    { data: anno + '-08-15', descrizione: 'Ferragosto' },
    { data: anno + '-11-01', descrizione: 'Ognissanti' },
    { data: anno + '-12-08', descrizione: 'Immacolata Concezione' },
    { data: anno + '-12-25', descrizione: 'Natale' },
    { data: anno + '-12-26', descrizione: 'Santo Stefano' },
  ];
}
// Se l'anno selezionato non ha festivi li genera da solo (sono deterministici)
async function _generaFestiviSeMancanti() {
  if (!isAdmin()) return;
  const anno = window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]);
  if (pianoFestiviCache.some((f) => parseInt(f.data.split('-')[0]) === anno)) return;
  const esistenti = new Set(pianoFestiviCache.map((f) => f.data));
  const nuovi = _pianoFestiviAnno(anno).filter((f) => !esistenti.has(f.data));
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', { data: f.data, descrizione: f.descrizione, cgf: true });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    if (nuovi.length) {
      logAzione('Piano: festivi generati automaticamente', anno + ' — ' + nuovi.length);
      toast('Festivi ' + anno + ' generati automaticamente (' + nuovi.length + ')');
    }
  } catch (e) {}
}
async function generaPianoFestivi() {
  if (!isAdmin()) return;
  const anno = parseInt((document.getElementById('pf-genera-anno') || {}).value);
  if (!anno || anno < 2024 || anno > 2050) {
    toast('Inserisci un anno valido (2024-2050)');
    return;
  }
  const esistenti = new Set(pianoFestiviCache.map((f) => f.data));
  const nuovi = _pianoFestiviAnno(anno).filter((f) => !esistenti.has(f.data));
  if (!nuovi.length) {
    toast('Festivi ' + anno + ' già tutti presenti');
    return;
  }
  if (
    !confirm(
      'Generare ' +
        nuovi.length +
        ' festivi per il ' +
        anno +
        '?\n\n' +
        nuovi
          .map((f) => new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') + ' — ' + f.descrizione)
          .join('\n') +
        '\n\n(tutti con CGF attivo; quelli già presenti non vengono toccati)',
    )
  )
    return;
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', { data: f.data, descrizione: f.descrizione, cgf: true });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    logAzione('Piano: festivi generati', anno + ' (' + nuovi.length + ')');
    toast('Generati ' + nuovi.length + ' festivi per il ' + anno);
    renderPiano();
  } catch (e) {
    toast('Errore generazione festivi');
  }
}

// ================================================================
// COPIA PER EXCEL / STAMPA PDF / SCAMBIO TURNO / SELEZIONE RIGA
// ================================================================
function copiaPianoExcel() {
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab) return;
  const righe = [];
  tab.querySelectorAll('tr').forEach((tr) => {
    const celle = [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim().replace(/\n/g, ' '));
    righe.push(celle.join('\t'));
  });
  navigator.clipboard
    .writeText(righe.join('\n'))
    .then(() => toast('Piano copiato: incollalo in Excel'))
    .catch(() => toast('Copia non riuscita'));
}

async function stampaPianoPDF() {
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toast('Errore libreria PDF');
      return;
    }
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const label = (MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const mappa = {};
  const mappaCol = {};
  _pianoRighe.forEach((r) => {
    mappa[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice;
    if (r.colore) mappaCol[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.colore;
  });
  // righe/giorni NASCOSTI nella griglia restano fuori anche dalla stampa
  // (serve p.es. per stampare il piano senza i SUP)
  const nasc = _pianoNascosti();
  const nomi = [...new Set(_pianoRighe.map((r) => r.collaboratore))].filter((n) => !nasc.nomi.includes(n)).sort();
  const giorniVis = [];
  for (let g = 1; g <= nGiorni; g++) if (!nasc.giorni.includes(g)) giorniVis.push(g);
  const head = ['Collaboratore'];
  giorniVis.forEach((g) => head.push(String(g)));
  const body = nomi.map((n) => {
    const riga = [n];
    giorniVis.forEach((g) => riga.push(mappa[n + '|' + g] || ''));
    return riga;
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Piano di lavoro — ' + label + ' — ' + repartoLabel(_pianoReparto()), 148, 10, { align: 'center' });
  doc.autoTable({
    startY: 14,
    head: [head],
    body: body,
    theme: 'grid',
    margin: { left: 4, right: 4 },
    styles: { fontSize: 5.2, cellPadding: 0.6, halign: 'center', lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fillColor: [26, 18, 8], textColor: [255, 255, 255], fontSize: 5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 26, fontSize: 5 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index > 0 && d.cell.raw) {
        // colore personalizzato della cella: vince sul colore del turno anche in stampa
        const ovr = mappaCol[nomi[d.row.index] + '|' + giorniVis[d.column.index - 1]];
        const col = ovr || _pianoColore(String(d.cell.raw));
        if (col) {
          const hex = col.replace('#', '');
          d.cell.styles.fillColor = [
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16),
          ];
        }
      }
    },
  });
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text('Casino Lugano SA — Piano di lavoro — generato il ' + new Date().toLocaleDateString('it-IT'), 4, 205);
  logAzione('Piano stampato', label + ' (' + _pianoReparto() + ')');
  mostraPdfPreview(doc, 'piano_' + ym + '_' + _pianoReparto() + '.pdf', 'Piano ' + label);
}

// Formulario cambio turno IDENTICO a Turnivo (template cambio_turno_pdf.html):
// header centrato, sezioni con barra colorata (A blu, B arancio, motivazione
// verde, autorizzazione viola con checkbox), chip turni, firme con data.
function _pdfCambioTurno(dati) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  // header centrato
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text('Casino Lugano SA', 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text(dati.tipo === 'ESIGENZE' ? 'CAMBIO TURNO PER ESIGENZE OPERATIVE' : 'RICHIESTA CAMBIO TURNO', 105, y, {
    align: 'center',
  });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text(
    'Generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    105,
    y,
    { align: 'center' },
  );
  y += 5;
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(1);
  doc.line(M, y, 210 - M, y);
  y += 10;

  const chip = (x, yy, testo, bg, fg) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const w = doc.getTextWidth(testo) + 5;
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(x, yy - 4.2, w, 6, 1.2, 1.2, 'F');
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(testo, x + 2.5, yy);
    doc.setTextColor(34, 34, 34);
    return w;
  };
  const sezione = (titolo, barra, sfondo, righe) => {
    const altezza = 12 + righe.length * 6.5 + 3;
    doc.setFillColor(sfondo[0], sfondo[1], sfondo[2]);
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, y, W, altezza, 1.8, 1.8, 'FD');
    doc.setFillColor(barra[0], barra[1], barra[2]);
    doc.rect(M, y, 1.6, altezza, 'F');
    let yy = y + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(titolo, M + 6, yy);
    doc.setDrawColor(221, 221, 221);
    doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
    yy += 8;
    doc.setFontSize(10);
    righe.forEach((r) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 51, 51);
      doc.text(r[0], M + 6, yy);
      if (r[2] === 'chip') {
        const w = chip(M + 6 + 42, yy, r[1], [232, 244, 253], [21, 101, 192]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else if (r[2] === 'chiprosso') {
        const w = chip(M + 6 + 42, yy, r[1], [253, 232, 232], [192, 57, 43]);
        if (r[3]) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(85, 85, 85);
          doc.text(r[3], M + 6 + 42 + w + 2, yy);
          doc.setFontSize(10);
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 34, 34);
        doc.text(String(r[1]), M + 6 + 42, yy);
      }
      yy += 6.5;
    });
    y += altezza + 6;
  };

  if (dati.tipo === 'ESIGENZE') {
    sezione(
      'Collaboratore',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
        ['Nuovo turno:', dati.nuovoTurno, 'chiprosso', dati.nuovoOrari],
      ],
    );
  } else {
    sezione(
      'Collaboratore A (richiedente)',
      [52, 152, 219],
      [250, 250, 250],
      [
        ['Nome:', dati.a.nome],
        ['Settore:', dati.a.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.a.turno, 'chip', dati.a.orari],
      ],
    );
    sezione(
      'Collaboratore B (accetta lo scambio)',
      [230, 126, 34],
      [250, 250, 250],
      [
        ['Nome:', dati.b.nome],
        ['Settore:', dati.b.settore],
        ['Data turno:', dati.data],
        ['Turno originale:', dati.b.turno, 'chip', dati.b.orari],
      ],
    );
  }
  if (dati.restituzione) {
    // IDENTICA a Turnivo: barra viola #8e44ad, sfondo #f8f0ff
    sezione(
      'Restituzione',
      [142, 68, 173],
      [248, 240, 255],
      [
        ['Data restituzione:', dati.restituzione],
        ['', 'In questa data i turni verranno scambiati nuovamente tra i due collaboratori.'],
      ],
    );
  }
  sezione('Motivazione', [46, 204, 113], [240, 250, 240], [['', dati.motivo || 'Nessuna motivazione specificata']]);
  // Autorizzazione con checkbox
  const hAut = 30;
  doc.setFillColor(250, 248, 252);
  doc.setDrawColor(221, 221, 221);
  doc.roundedRect(M, y, W, hAut, 1.8, 1.8, 'FD');
  doc.setFillColor(142, 68, 173);
  doc.rect(M, y, 1.6, hAut, 'F');
  let yy = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(44, 62, 80);
  doc.text('Autorizzazione', M + 6, yy);
  doc.setDrawColor(221, 221, 221);
  doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
  yy += 9;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.rect(M + 6, yy - 4, 5, 5);
  doc.setFontSize(11);
  doc.setTextColor(34, 34, 34);
  doc.text('Autorizzato', M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text('Non autorizzato', M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Motivo:', M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________________________________________________________________', M + 22, yy);
  y += hAut + 14;
  // firme
  const firme =
    dati.tipo === 'ESIGENZE'
      ? [
          ['Firma Collaboratore', dati.a.nome],
          ['Firma Responsabile', ''],
        ]
      : [
          ['Firma Collaboratore A', dati.a.nome],
          ['Firma Collaboratore B', dati.b.nome],
          ['Firma Responsabile', ''],
        ];
  const wBox = firme.length === 2 ? W * 0.45 : W * 0.3;
  const gap = (W - wBox * firme.length) / (firme.length - 1);
  y += 18;
  firme.forEach((f, i) => {
    const x = M + i * (wBox + gap);
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.35);
    doc.line(x, y, x + wBox, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text(f[0], x + wBox / 2, y + 4.5, { align: 'center' });
    if (f[1]) {
      doc.setFont('helvetica', 'bold');
      doc.text(f[1], x + wBox / 2, y + 9, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Data: ____/____/________', x + wBox / 2, y + (f[1] ? 13.5 : 9), { align: 'center' });
  });
  // footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(221, 221, 221);
  doc.line(M, ph - 14, 210 - M, ph - 14);
  doc.setFontSize(7.5);
  doc.setTextColor(85, 85, 85);
  doc.text(
    'Generato da Turnivo — Casino Lugano SA — Richiesto da: ' + (dati.richiesto || getOperatore()),
    105,
    ph - 9,
    {
      align: 'center',
    },
  );
  return doc;
}

// ---- Scambio turno tra colleghi (come Turnivo cap. 19) ----
async function apriScambioTurno() {
  const sel = _pianoCellaSel;
  if (!sel) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  // colleghi con un TURNO quel giorno (scambio turno-turno)
  const colleghi = _pianoRighe.filter(
    (x) => x.data === sel.data && x.collaboratore !== sel.nome && _pianoTurnoInfo(x.codice),
  );
  if (!colleghi.length) {
    toast('Nessun collega con un turno quel giorno');
    return;
  }
  // come "Cerca cambio turno" di Turnivo: verifica per ogni collega se lo
  // scambio sarebbe valido (idoneità ai turni incrociati + riposo 11h)
  const g = parseInt(sel.data.split('-')[2]);
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const cellaMese = {};
  _pianoRighe.forEach((x) => (cellaMese[x.collaboratore + '|' + parseInt(x.data.split('-')[2])] = x.codice));
  const riposoOkCon = (nomeX, gX, t) => {
    const prev = _pianoTurnoInfo(cellaMese[nomeX + '|' + (gX - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = prev.oltre23 || finePrev < _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cellaMese[nomeX + '|' + (gX + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = t.oltre23 || fine < _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  const tMio = _pianoTurnoInfo(r.codice);
  // limite cambi al mese: conta solo i cambi RICHIESTI dal collaboratore
  // (es. limite 3: Mario chiede 3 cambi e li esaurisce, Paolo che ha solo
  // accettato può ancora chiederne 3 a sua volta)
  const maxCambi = _pianoMaxCambi();
  const cambiRichiesti = maxCambi > 0 ? await _pianoCambiRichiesti(_pianoMeseSel) : {};
  const mieiCambi = cambiRichiesti[sel.nome] || 0;
  const problemaCon = (c) => {
    if (maxCambi > 0 && mieiCambi >= maxCambi)
      return 'limite superato (' + mieiCambi + '/' + maxCambi + '): serve autorizzazione';
    const tSuo = _pianoTurnoInfo(c.codice);
    if (!_pianoIdoneoPerTurno(sel.nome, tSuo)) return 'tu non sei idoneo a ' + c.codice;
    if (!_pianoIdoneoPerTurno(c.collaboratore, tMio)) return 'non idoneo a ' + r.codice;
    if (!riposoOkCon(sel.nome, g, tSuo) || !riposoOkCon(c.collaboratore, g, tMio)) return 'riposo 11h violato';
    return null;
  };
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambio turno — ' +
    new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(sel.nome) +
    '</strong> (' +
    escP(r.codice) +
    ') scambia con:</p>' +
    (maxCambi > 0
      ? '<p style="font-size:.78rem;color:' +
        (mieiCambi >= maxCambi ? '#c0392b' : 'var(--muted)') +
        ';margin-bottom:6px">Cambi richiesti da ' +
        escP(sel.nome.split(' ')[0]) +
        ' questo mese: ' +
        mieiCambi +
        '/' +
        maxCambi +
        ' (chi accetta non consuma il suo limite)</p>'
      : '') +
    '<select id="scambio-collega" style="width:100%;padding:10px">' +
    colleghi
      .map((c) => {
        const prob = problemaCon(c);
        return (
          '<option value="' +
          escP(c.collaboratore) +
          '"' +
          (prob ? ' style="color:#c0392b"' : '') +
          '>' +
          escP(c.collaboratore) +
          ' — ' +
          escP(c.codice) +
          (prob ? ' ⚠ ' + prob : ' ✓') +
          '</option>'
        );
      })
      .join('') +
    '</select><div class="field" style="text-align:left;margin-top:10px"><label>Motivazione</label><input type="text" id="scambio-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<div style="text-align:left;margin-top:10px"><label style="font-weight:700;font-size:.86rem"><input type="checkbox" id="scambio-restituito" onchange="document.getElementById(\'scambio-rest-wrap\').style.display=this.checked?\'block\':\'none\'"> Con restituzione</label>' +
    '<div id="scambio-rest-wrap" style="display:none;margin-top:6px"><label style="font-size:.8rem">Data restituzione:</label> <input type="date" id="scambio-data-rest" style="padding:6px;max-width:180px"></div></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioTurno()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaScambioTurno() {
  const sel = _pianoCellaSel;
  const collega = (document.getElementById('scambio-collega') || {}).value;
  const motivo = ((document.getElementById('scambio-motivo') || {}).value || '').trim();
  const conRest = (document.getElementById('scambio-restituito') || {}).checked;
  let dataRest = conRest ? (document.getElementById('scambio-data-rest') || {}).value || '' : '';
  if (conRest && dataRest && dataRest <= sel.data) {
    toast('La data di restituzione deve essere successiva al giorno del cambio');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !collega) return;
  const maxC = _pianoMaxCambi();
  if (maxC > 0) {
    const richiesti = await _pianoCambiRichiesti(_pianoMeseSel);
    const n = richiesti[sel.nome] || 0;
    if (n >= maxC) {
      // niente blocco duro: il responsabile può autorizzare l'eccezione
      if (
        !confirm(
          'ATTENZIONE: ' +
            sel.nome +
            ' ha già richiesto ' +
            n +
            '/' +
            maxC +
            ' cambi questo mese.\n\nAutorizzi comunque lo scambio come responsabile? (verrà registrato nello storico come autorizzazione in deroga)',
        )
      )
        return;
      logAzione(
        'Piano: scambio autorizzato oltre limite',
        sel.nome + ' (' + (n + 1) + '/' + maxC + ') da ' + getOperatore(),
      );
    }
  }
  const r1 = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  const r2 = _pianoRighe.find((x) => x.collaboratore === collega && x.data === sel.data);
  if (!r1 || !r2) return;
  const c1 = r1.codice;
  const c2 = r2.codice;
  try {
    await secPatch('piano', 'id=eq.' + r1.id, {
      codice: c2,
      protetto: true,
      commento: ((c1 ? 'Ex ' + c1 + ' - ' : '') + 'cambio con ' + collega + ' - ' + getOperatore()).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    await secPatch('piano', 'id=eq.' + r2.id, {
      codice: c1,
      protetto: true,
      commento: ((c2 ? 'Ex ' + c2 + ' - ' : '') + 'cambio con ' + sel.nome + ' - ' + getOperatore()).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r1.codice = c2;
    r2.codice = c1;
    r1.protetto = r2.protetto = true;
    // Restituzione: come Turnivo, scambio inverso applicato subito alla data indicata
    if (dataRest) {
      const op = getOperatore();
      const ra = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === dataRest);
      const rb = _pianoRighe.find((x) => x.collaboratore === collega && x.data === dataRest);
      const ca = ra ? ra.codice : '';
      const cb = rb ? rb.codice : '';
      const applica = async (riga, nomeC, nuovoCod, exCod, altroNome) => {
        const commento = 'Ex ' + exCod + ' - restituzione cambio con ' + altroNome + ' - ' + op;
        if (riga) {
          await secPatch('piano', 'id=eq.' + riga.id, {
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            operatore: op,
            updated_at: new Date().toISOString(),
          });
          riga.codice = nuovoCod;
          riga.protetto = true;
          riga.commento = commento;
        } else if (nuovoCod) {
          const n = await secPost('piano', {
            collaboratore: nomeC,
            data: dataRest,
            codice: nuovoCod,
            protetto: true,
            generato: false,
            commento: commento,
            reparto_dip: _pianoReparto(),
            operatore: op,
          });
          if (n && n[0]) _pianoRighe.push(n[0]);
        }
      };
      await applica(ra, sel.nome, cb, ca, collega);
      await applica(rb, collega, ca, cb, sel.nome);
      logAzione('Piano: restituzione programmata', sel.nome + ' <-> ' + collega + ' il ' + dataRest);
    }
    logAzione('Piano: scambio turno', sel.nome + ' (' + c1 + ') <-> ' + collega + ' (' + c2 + ') il ' + sel.data);
    toast(
      'Turni scambiati' +
        (dataRest ? ' — restituzione il ' + new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : ''),
    );
    // Formulario IDENTICO a Turnivo
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const t1 = _pianoTurnoInfo(c1);
      const t2 = _pianoTurnoInfo(c2);
      const fmtOra = (t) =>
        t
          ? '(' +
            (t.ora_inizio || '').substring(0, 5) +
            '-' +
            (t.ora_fine || '').substring(0, 5) +
            ', ' +
            (t.gruppo || '') +
            ')'
          : '';
      const doc = _pdfCambioTurno({
        tipo: 'SCAMBIO',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: c1, orari: fmtOra(t1) },
        b: { nome: collega, settore: repartoLabel(_pianoReparto()), turno: c2, orari: fmtOra(t2) },
        motivo: motivo,
        richiesto: getOperatore(),
        restituzione: dataRest ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : null,
      });
      mostraPdfPreview(doc, 'cambio_turno_' + sel.data + '.pdf', 'Cambio turno ' + sel.data);
    }
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore scambio turno');
  }
}

// ---- Selezione riga/colonna stile Excel (come Turnivo) ----
async function salvaOrdinePiano(nomi) {
  if (!puoGestirePiano()) return;
  window._pianoOrdineCollab = window._pianoOrdineCollab || {};
  window._pianoOrdineCollab[_pianoReparto()] = nomi;
  await setImp('piano_ordine_collab', JSON.stringify(window._pianoOrdineCollab));
  logAzione('Piano: ordine collaboratori', _pianoReparto());
  toast('Ordine salvato');
}
async function ripristinaOrdinePiano() {
  if (!puoGestirePiano()) return;
  window._pianoOrdineCollab = window._pianoOrdineCollab || {};
  delete window._pianoOrdineCollab[_pianoReparto()];
  await setImp('piano_ordine_collab', JSON.stringify(window._pianoOrdineCollab));
  logAzione('Piano: ordine predefinito', _pianoReparto());
  toast('Ordine predefinito: SUP, BO, poi gli altri');
  renderPiano();
}

// ================================================================
// COPERTURA MALATTIA — port di malattia_cerca/malattia_conferma di
// Turnivo: per ogni giorno del periodo propone il miglior sostituto
// libero e idoneo (greedy: meno ore mese + meno giorni consecutivi),
// alla conferma mette M al malato e i turni (protetti) ai sostituti.
// ================================================================
function _pianoIdoneoPerTurno(nome, turno) {
  // idoneità come il generatore: settori (fonte di verità), regole di
  // gruppo, solo_diurni, turni bloccati
  const info = _pianoCollabInfo(nome) || {};
  if (info.solo_diurni && turno.tipo === 'NOTTURNO') return false;
  if (
    info.turni_bloccati &&
    info.turni_bloccati
      .split(',')
      .map((x) => x.trim())
      .includes(turno.codice)
  )
    return false;
  const gruppoT = (turno.gruppo || '').toUpperCase();
  const fzU = ((info.funzione || '') + '').toUpperCase();
  const settoriC = _pianoSettoriEffettivi(info);
  const haSettore = settoriC ? settoriC.includes(gruppoT) : true;
  let campoGrant = false;
  for (const rg of _pianoRegoleGruppoDi(gruppoT)) {
    const tipoR = (rg.tipo_regola || '').toLowerCase();
    if (tipoR === 'richiede_funzione') {
      const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
      if (!haSettore && !ammesse.includes(fzU)) return false;
    } else if (tipoR === 'blocca_tipo_turno') {
      if (
        rg.valore
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .includes((turno.tipo || '').toUpperCase())
      )
        return false;
    } else if (tipoR === 'richiede_campo') {
      if (!_pianoCampoOk(info, rg.valore)) return false;
      campoGrant = true;
    }
  }
  if (settoriC && !haSettore && !campoGrant) return false;
  const mapp = _pianoMappFunzione(info.funzione);
  if (mapp) {
    const voci = mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO').map((m) => m.turno_codice);
    if (voci.length && !voci.includes(turno.codice)) return false;
  }
  if (
    (turno.codice === 'L1' || turno.codice === '9') &&
    String(_pianoRegolaVal('l1_solo_bo_sup')).toUpperCase() === 'TRUE' &&
    fzU !== 'SUP' &&
    fzU !== 'BO' &&
    !(settoriC || []).some((x) => x === 'BO' || x === 'SUP')
  )
    return false;
  return true;
}
function apriCoperturaMalattia() {
  if (!puoGestirePiano()) return;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Copertura malattia — ' +
    _pianoMeseSel +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Cerca i migliori sostituti liberi per i turni del collaboratore malato (come in Turnivo).</p>' +
    '<div class="field" style="text-align:left"><label>Collaboratore malato</label><select id="mal-collab" style="width:100%;padding:8px">' +
    nomi.map((n) => '<option>' + escP(n) + '</option>').join('') +
    '</select></div>' +
    '<div style="display:flex;gap:10px;margin-top:8px"><div class="field" style="text-align:left"><label>Dal giorno</label><input type="number" id="mal-da" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div>' +
    '<div class="field" style="text-align:left"><label>Al giorno</label><input type="number" id="mal-al" min="1" max="' +
    nGiorni +
    '" style="width:80px;padding:8px"></div></div>' +
    '<div id="mal-risultati" style="text-align:left;margin-top:10px;max-height:40vh;overflow:auto"></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button>' +
    '<button class="btn-modal-ok" id="mal-btn-cerca" onclick="cercaSostitutiMalattia()">Cerca sostituti</button>' +
    '<button class="btn-modal-ok" id="mal-btn-conferma" style="display:none;background:#c0392b" onclick="confermaCoperturaMalattia()">Conferma copertura</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
let _malattiaPiano = null;
async function cercaSostitutiMalattia() {
  const nome = (document.getElementById('mal-collab') || {}).value;
  const da = parseInt((document.getElementById('mal-da') || {}).value);
  const al = parseInt((document.getElementById('mal-al') || {}).value);
  const out = document.getElementById('mal-risultati');
  if (!nome || isNaN(da) || isNaN(al) || da > al) {
    toast('Compila collaboratore e periodo (dal ≤ al)');
    return;
  }
  out.innerHTML = '<p style="color:var(--muted)">Ricerca in corso...</p>';
  const ym = _pianoMeseSel;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const cella = {}; // nome|g -> codice (con overrides progressivi)
  const rigaDi = {};
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  const oreMese = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) oreMese[r.collaboratore] = (oreMese[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const consecFinoA = (n, g) => {
    let c = 0;
    for (let k = g - 1; k >= 1 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) c++;
    return c;
  };
  const riposoOkSost = (n, g, t) => {
    const prev = _pianoTurnoInfo(cella[n + '|' + (g - 1)] || '');
    if (prev) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = prev.oltre23 || finePrev < _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cella[n + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = t.oltre23 || fine < _pianoOra(t.ora_inizio) ? 24 + fine : fine;
      if (24 + _pianoOra(next.ora_inizio) - fineAbs < minRiposo) return false;
    }
    return true;
  };
  const giorni = [];
  for (let g = da; g <= al; g++) {
    const cod = cella[nome + '|' + g] || '';
    const t = _pianoTurnoInfo(cod);
    if (!cod) {
      giorni.push({ g: g, salta: 'Nessun turno assegnato' });
      continue;
    }
    if (cod === 'M' || cod === 'M1') {
      giorni.push({ g: g, salta: 'Già in malattia' });
      continue;
    }
    if (!t) {
      const cs = _pianoCodiceInfo(cod);
      giorni.push({
        g: g,
        salta: cs && cs.is_riposo ? 'Giorno di riposo (' + cod + ')' : 'Codice speciale (' + cod + ')',
      });
      continue;
    }
    // candidati: liberi quel giorno (nessuna cella o codice di riposo non protetto)
    let migliore = null;
    let migliorePunteggio = Infinity;
    for (const n of nomi) {
      if (n === nome) continue;
      const codC = cella[n + '|' + g] || '';
      if (codC) {
        const csC = _pianoCodiceInfo(codC);
        const rC = rigaDi[n + '|' + g];
        if (!(csC && csC.is_riposo && !(rC && rC.protetto && codC === 'V'))) continue; // occupato o vacanza protetta
      }
      if (!_pianoIdoneoPerTurno(n, t)) continue;
      if (consecFinoA(n, g) >= maxCons) continue;
      if (!riposoOkSost(n, g, t)) continue;
      const punteggio = (oreMese[n] || 0) + consecFinoA(n, g) * 10;
      if (punteggio < migliorePunteggio) {
        migliorePunteggio = punteggio;
        migliore = n;
      }
    }
    if (migliore) {
      giorni.push({
        g: g,
        codice: cod,
        orari: (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
        sostituto: migliore,
        era: cella[migliore + '|' + g] || '',
      });
      cella[migliore + '|' + g] = cod; // override progressivo, come il greedy Turnivo
      oreMese[migliore] = (oreMese[migliore] || 0) + (parseFloat(t.durata_ore) || 0);
    } else {
      giorni.push({ g: g, codice: cod, scoperto: true });
    }
  }
  _malattiaPiano = { nome: nome, da: da, al: al, giorni: giorni };
  let h =
    '<table class="piano-table" style="min-width:100%;font-size:.82rem"><thead><tr><th>Giorno</th><th>Turno</th><th style="text-align:left">Sostituto proposto</th></tr></thead><tbody>';
  giorni.forEach((d) => {
    if (d.salta)
      h +=
        '<tr><td>' + d.g + '</td><td colspan="2" style="color:var(--muted);text-align:left">' + d.salta + '</td></tr>';
    else if (d.scoperto)
      h +=
        '<tr><td>' +
        d.g +
        '</td><td>' +
        escP(d.codice) +
        '</td><td style="color:#c0392b;font-weight:700;text-align:left">NESSUN SOSTITUTO DISPONIBILE</td></tr>';
    else
      h +=
        '<tr><td>' +
        d.g +
        '</td><td><b>' +
        escP(d.codice) +
        '</b> ' +
        d.orari +
        '</td><td style="text-align:left;color:#2c6e49;font-weight:700">' +
        escP(d.sostituto) +
        (d.era ? ' <span style="color:var(--muted);font-weight:400">(era ' + escP(d.era) + ')</span>' : '') +
        '</td></tr>';
  });
  h += '</tbody></table>';
  const coperti = giorni.filter((d) => d.sostituto).length;
  const scoperti = giorni.filter((d) => d.scoperto).length;
  h +=
    '<p style="font-size:.8rem;margin-top:6px">' +
    coperti +
    ' giorni coperti' +
    (scoperti ? ', <b style="color:#c0392b">' + scoperti + ' scoperti</b>' : '') +
    '. Alla conferma: M (protetta) al malato, turni protetti ai sostituti' +
    (coperti ? ' e punti incentivo per la copertura' : '') +
    '.</p>';
  out.innerHTML = h;
  document.getElementById('mal-btn-conferma').style.display = coperti || giorni.some((d) => d.codice) ? '' : 'none';
}
async function confermaCoperturaMalattia() {
  const m = _malattiaPiano;
  if (!m) return;
  document.getElementById('pwd-modal').classList.add('hidden');
  const ym = _pianoMeseSel;
  const op = getOperatore();
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  const rigaDi = {};
  _pianoRighe.forEach((r) => (rigaDi[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
  let nM = 0;
  let nSost = 0;
  const sostituti = new Set();
  try {
    for (const d of m.giorni) {
      if (d.salta) continue;
      // M al malato (protetta)
      const rMal = rigaDi[m.nome + '|' + d.g];
      if (rMal) {
        await secPatch('piano', 'id=eq.' + rMal.id, {
          codice: 'M',
          protetto: true,
          generato: false,
          commento: ('Malattia — era ' + d.codice + ' - ' + op).substring(0, 400),
          operatore: op,
          updated_at: new Date().toISOString(),
        });
      } else {
        await secPost('piano', {
          collaboratore: m.nome,
          data: dstrDi(d.g),
          codice: 'M',
          protetto: true,
          generato: false,
          reparto_dip: _pianoReparto(),
          operatore: op,
        });
      }
      nM++;
      // turno al sostituto (protetto)
      if (d.sostituto) {
        const rS = rigaDi[d.sostituto + '|' + d.g];
        const commento = (
          'Copertura malattia di ' +
          m.nome +
          (d.era ? ' (era ' + d.era + ')' : '') +
          ' - ' +
          op
        ).substring(0, 400);
        if (rS) {
          await secPatch('piano', 'id=eq.' + rS.id, {
            codice: d.codice,
            protetto: true,
            generato: false,
            commento: commento,
            operatore: op,
            updated_at: new Date().toISOString(),
          });
        } else {
          await secPost('piano', {
            collaboratore: d.sostituto,
            data: dstrDi(d.g),
            codice: d.codice,
            protetto: true,
            generato: false,
            commento: commento,
            reparto_dip: _pianoReparto(),
            operatore: op,
          });
        }
        sostituti.add(d.sostituto);
        nSost++;
      }
    }
    // punti incentivo (azione 'copertura' della sezione Formazione)
    if (typeof _insertPuntiEvento === 'function' && typeof getPuntiConfig === 'function') {
      const az = (getPuntiConfig().azioni || []).find((a) => a.key === 'copertura');
      if (az)
        for (const n of sostituti)
          await _insertPuntiEvento(
            n,
            az.punti,
            'copertura',
            'Copertura malattia di ' + m.nome + ' (' + m.da + '-' + m.al + ' ' + ym + ')',
          );
    }
    logAzione(
      'Copertura malattia',
      m.nome + ' ' + m.da + '-' + m.al + ' ' + ym + ': ' + nM + ' M, ' + nSost + ' sostituzioni',
    );
    toast(
      'Copertura registrata: ' +
        nM +
        ' giorni M, ' +
        nSost +
        ' sostituzioni' +
        (sostituti.size ? ', punti assegnati' : ''),
    );
    _malattiaPiano = null;
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore registrazione copertura');
  }
}

// Barra delle date sempre visibile durante lo scorrimento della PAGINA:
// il piano scorre col resto della pagina (nessuno scrollbox interno) e le
// intestazioni vengono traslate per restare in cima allo schermo. Vale per
// tutte le tabelle piano-wrap (griglia collaboratori e fabbisogno).
function _pianoInitSticky() {
  const wraps = document.querySelectorAll('#piano-content .piano-wrap');
  window._pianoStickyEls = [...wraps]
    .map((w) => {
      const tab = w.querySelector('table');
      return tab ? { tab: tab, ths: tab.querySelectorAll('thead th') } : null;
    })
    .filter(Boolean);
  if (window._pianoStickyBound) return;
  window._pianoStickyBound = true;
  const applica = () => {
    (window._pianoStickyEls || []).forEach((o) => {
      if (!o.tab || !o.tab.isConnected) return;
      const r = o.tab.getBoundingClientRect();
      const hHead = o.ths[0] ? o.ths[0].offsetHeight : 24;
      let y = 0;
      if (r.top < 0) y = Math.min(-r.top, r.height - hHead * 2);
      if (y < 0) y = 0;
      const t = y ? 'translateY(' + Math.round(y) + 'px)' : '';
      o.ths.forEach((th) => {
        if (th.style.transform !== t) th.style.transform = t;
      });
    });
  };
  window.addEventListener('scroll', applica, { passive: true, capture: true });
  window.addEventListener('resize', applica, { passive: true });
}

function _pianoInitSelezione() {
  // IDENTICA a Turnivo (main.js data-selectable): click header giorno =
  // colonna con velo azzurro + header blu; click nome = riga; ri-click =
  // deseleziona; riga e colonna mutuamente esclusive; click fuori dalla
  // tabella = deseleziona. La stampa avviene SOLO dall'icona rossa.
  // Come Turnivo (table[data-selectable]): vale per TUTTE le tabelle in
  // piano-wrap — griglia collaboratori E fabbisogno. Le COLONNE data sono
  // COLLEGATE: selezionando un giorno nel piano l'evidenziazione arriva
  // fino in fondo al fabbisogno (stessa colonna) e viceversa, così si
  // capisce la corrispondenza giorno-fabbisogno.
  const tabelle = [...document.querySelectorAll('#piano-content .piano-wrap > .piano-table')].filter(
    (t) => !t.dataset.selInit,
  );
  if (!tabelle.length) return;
  tabelle.forEach((t, i) => (t.dataset.selInit = String(i + 1)));
  let selTipo = '';
  let selIdx = -1;
  let selTab = null;
  const clearAll = () => {
    tabelle.forEach((t) => {
      t.querySelectorAll('.col-selected, .col-selected-header').forEach((el) =>
        el.classList.remove('col-selected', 'col-selected-header'),
      );
      t.querySelectorAll('.row-selected').forEach((el) => el.classList.remove('row-selected'));
    });
    selTipo = '';
    selIdx = -1;
    selTab = null;
  };
  const selezionaColonna = (thCliccata, tabProprio, colIdx) => {
    const g = thCliccata.dataset.g;
    if (g) {
      // colonna GIORNO: collegata su tutte le tabelle via data-g
      tabelle.forEach((t) => {
        const th = t.querySelector('thead th[data-g="' + g + '"]');
        if (th) th.classList.add('col-selected-header');
        t.querySelectorAll('tbody td[data-g="' + g + '"]').forEach((c) => c.classList.add('col-selected'));
      });
    } else {
      // colonne totali (Ore/D/N/OD/OP/SM/YTD/Tot): solo nella propria tabella
      thCliccata.classList.add('col-selected-header');
      tabProprio
        .querySelector('tbody')
        .querySelectorAll('tr')
        .forEach((riga) => {
          const celle = riga.querySelectorAll('td, th');
          if (celle[colIdx]) celle[colIdx].classList.add('col-selected');
        });
    }
  };
  tabelle.forEach((tab) => {
    const thead = tab.querySelector('thead');
    const tbody = tab.querySelector('tbody');
    if (!thead || !tbody) return;
    thead.querySelectorAll('tr th').forEach((th, colIdx) => {
      if (th.classList.contains('piano-nome') || th.classList.contains('piano-fun')) return;
      th.style.cursor = 'pointer';
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = parseInt(th.dataset.g) || 0;
        // Shift+click su un altro giorno = intervallo di colonne (come Excel), pronto da copiare
        if (e.shiftKey && g && selTipo === 'col' && String(selIdx).charAt(0) === 'g') {
          const g0 = parseInt(String(selIdx).substring(1)) || g;
          const ga = Math.min(g0, g);
          const gb = Math.max(g0, g);
          clearAll();
          _pianoBloccoPulisci();
          selTipo = 'col';
          selIdx = 'g' + g0;
          for (let gi = ga; gi <= gb; gi++) {
            tabelle.forEach((t) => {
              const thx = t.querySelector('thead th[data-g="' + gi + '"]');
              if (thx) thx.classList.add('col-selected-header');
              t.querySelectorAll('tbody td[data-g="' + gi + '"]').forEach((c) => c.classList.add('col-selected'));
            });
          }
          _pianoBloccoDaColonne(tab, ga, gb);
          return;
        }
        const idSel = g ? 'g' + g : tab.dataset.selInit + ':' + colIdx;
        const era = selTipo === 'col' && idSel === selIdx;
        clearAll();
        _pianoBloccoPulisci();
        if (era) return;
        selTipo = 'col';
        selIdx = idSel;
        selezionaColonna(th, tab, colIdx);
        if (g) _pianoBloccoDaColonne(tab, g, g);
      });
    });
    tbody.querySelectorAll('tr').forEach((riga, rowIdx) => {
      const nomeCella = riga.querySelector('.piano-nome');
      if (!nomeCella) return;
      nomeCella.style.cursor = 'pointer';
      if (riga.dataset.nome) nomeCella.addEventListener('contextmenu', (e) => mostraPianoCtxNome(e, riga.dataset.nome));
      nomeCella.addEventListener('click', (e) => {
        if (e.target.closest('a, .piano-pdf-ico')) return;
        e.stopPropagation();
        const righeT = [...tbody.querySelectorAll('tr')];
        // Shift+click su un altro nome = intervallo di righe (come Excel), pronto da copiare
        if (e.shiftKey && selTipo === 'row' && selTab === tab && selIdx >= 0 && selIdx !== rowIdx) {
          const a = Math.min(selIdx, rowIdx);
          const b2 = Math.max(selIdx, rowIdx);
          const ancora = selIdx;
          clearAll();
          _pianoBloccoPulisci();
          selTipo = 'row';
          selIdx = ancora;
          selTab = tab;
          for (let ri = a; ri <= b2; ri++) righeT[ri].classList.add('row-selected');
          _pianoBloccoDaRighe(tab, righeT[a], righeT[b2]);
          return;
        }
        const era = selTipo === 'row' && rowIdx === selIdx && selTab === tab;
        clearAll();
        _pianoBloccoPulisci();
        if (era) return;
        selTipo = 'row';
        selIdx = rowIdx;
        selTab = tab;
        riga.classList.add('row-selected');
        _pianoBloccoDaRighe(tab, riga, riga);
      });
    });
  });
  const tab = document.querySelector('#piano-content .piano-table');
  if (!tab) return;
  // Riordino collaboratori: trascina la riga dal nome (solo chi gestisce il piano)
  if (puoGestirePiano()) {
    const tbodyG = tab.querySelector('tbody');
    let trDrag = null;
    tbodyG.querySelectorAll('tr[data-nome]').forEach((tr) => {
      const cel = tr.querySelector('.piano-nome');
      if (!cel) return;
      cel.draggable = true;
      cel.title = (cel.title ? cel.title + ' — ' : '') + 'trascina per riordinare';
      cel.addEventListener('dragstart', (e) => {
        trDrag = tr;
        tr.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      cel.addEventListener('dragend', async () => {
        tr.style.opacity = '';
        if (!trDrag) return;
        trDrag = null;
        const nuovi = [...tbodyG.querySelectorAll('tr[data-nome]')].map((r) => r.dataset.nome);
        await salvaOrdinePiano(nuovi);
      });
      tr.addEventListener('dragover', (e) => {
        if (!trDrag || trDrag === tr) return;
        e.preventDefault();
        const r = tr.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) tbodyG.insertBefore(trDrag, tr);
        else tbodyG.insertBefore(trDrag, tr.nextSibling);
      });
    });
  }
  if (!window._pianoSelDocClick) {
    window._pianoSelDocClick = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#piano-content .piano-table')) {
        document
          .querySelectorAll('#piano-content .col-selected, #piano-content .col-selected-header')
          .forEach((el) => el.classList.remove('col-selected', 'col-selected-header'));
        document.querySelectorAll('#piano-content .row-selected').forEach((el) => el.classList.remove('row-selected'));
      }
    });
  }
  tab.querySelectorAll('tbody .piano-cella').forEach((cella) => {
    cella.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tr = cella.closest('tr');
      const giorno = parseInt(cella.dataset.g);
      if (!tr.dataset.nome || !giorno) return;
      mostraPianoCtx(e, tr.dataset.nome, _pianoMeseSel + '-' + String(giorno).padStart(2, '0'));
    });
    // Mobile: long-press (>500ms) = menu contestuale, come Turnivo
    let lpTimer = null;
    let lpFired = false;
    cella.addEventListener(
      'touchstart',
      (e) => {
        lpFired = false;
        lpTimer = setTimeout(() => {
          lpFired = true;
          if (navigator.vibrate) navigator.vibrate(50);
          const tocco = e.changedTouches[0] || e.touches[0];
          const tr = cella.closest('tr');
          const giorno = parseInt(cella.dataset.g);
          if (!tr.dataset.nome || !giorno || !tocco) return;
          mostraPianoCtx(
            { preventDefault: () => {}, clientX: tocco.clientX, clientY: tocco.clientY },
            tr.dataset.nome,
            _pianoMeseSel + '-' + String(giorno).padStart(2, '0'),
          );
        }, 500);
      },
      { passive: true },
    );
    cella.addEventListener('touchend', (e) => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      if (lpFired) {
        e.preventDefault();
        lpFired = false;
      }
    });
    cella.addEventListener(
      'touchmove',
      () => {
        if (lpTimer) {
          clearTimeout(lpTimer);
          lpTimer = null;
        }
      },
      { passive: true },
    );
  });
}

// ================================================================
// TIMBRATURE — inserimento manuale, upload da timbratrice, confronto
// ore timbrate vs pianificate (come Turnivo cap. 22)
// ================================================================
let _pianoTimbrature = []; // mese corrente

async function _pianoCaricaTimbrature() {
  const ym = _pianoMeseSel;
  const da = ym + '-01';
  const a = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  _pianoTimbrature =
    (await secGet(
      'piano_timbrature?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=3000',
    )) || [];
}
async function eliminaTimbratura(id) {
  if (!puoGestirePiano()) return;
  const t = _pianoTimbrature.find((x) => x.id === id);
  if (!t || !confirm('Eliminare la timbratura di ' + t.collaboratore + ' del ' + t.data + '?')) return;
  try {
    await secDel('piano_timbrature', 'id=eq.' + id);
    _pianoTimbrature = _pianoTimbrature.filter((x) => x.id !== id);
    logAzione('Timbratura eliminata', t.collaboratore + ' ' + t.data);
    toast('Timbratura eliminata');
    caricaConfrontoTimbrature();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
function _pianoOreTimbrata(entrata, uscita) {
  const e = _pianoOra(entrata);
  const u = _pianoOra(uscita);
  if (e == null || u == null) return 0;
  return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
}
// Ore timbrate CON LA REGOLA DEL TURNO: chi timbra PRIMA dell'inizio del
// proprio turno viene conteggiato dall'inizio turno (la timbratura resta
// registrata com'è); l'uscita oltre il fine turno conta tutta (straordinario).
// Con JG o altri codici senza orari (o senza turno) si conta dalla timbratura.
function _pianoOreTimbrataPerGiorno(nome, dstr, entrata, uscita) {
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  // orario personalizzato (es. JG con inizio dichiarato): stesso aggancio del turno
  if (r && !_pianoTurnoInfo(r.codice) && r.ora_inizio) {
    const e0 = _pianoOra(entrata);
    const i0 = _pianoOra(r.ora_inizio);
    if (e0 != null && i0 != null) {
      const anticipo = i0 - e0;
      if (anticipo > 0 && anticipo < 6) return _pianoOreTimbrata(r.ora_inizio, uscita);
    }
    return _pianoOreTimbrata(entrata, uscita);
  }
  const t = r ? _pianoTurnoInfo(r.codice) : null;
  if (t && t.ora_inizio) {
    const e = _pianoOra(entrata);
    const inizio = _pianoOra(t.ora_inizio);
    if (e != null && inizio != null) {
      // "prima dell'inizio" tenendo conto della mezzanotte: se la differenza
      // è piccola (< 6h) l'entrata anticipata si aggancia all'inizio turno
      const anticipo = inizio - e;
      const eEff = anticipo > 0 && anticipo < 6 ? t.ora_inizio.substring(0, 5) : entrata;
      return _pianoOreTimbrata(eEff, uscita);
    }
  }
  return _pianoOreTimbrata(entrata, uscita);
}
function _renderPianoTimbratureCard() {
  if (!puoGestirePiano() && !isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Timbrature — confronto con il piano</div><div style="padding:10px 14px" id="piano-timb-body">';
  h +=
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="caricaConfrontoTimbrature()">Carica confronto del mese</button>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'timb-file\').click()">Importa file timbratrice</button>' +
    '<input type="file" id="timb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaTimbrature(this)">' +
    '<span style="font-size:.8rem;color:var(--muted)">CSV o Excel con colonne nome / data / entrata / uscita (riconosciute in automatico)</span></div>';
  h +=
    '<p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Collegamento automatico alla timbratrice: nel pacchetto IT c\'è lo script <b>sync_timbratrice.py</b> che legge gli export della timbratrice e carica le timbrature qui da solo (in automatico ogni pochi minuti, lo configura l\'IT).</p>';
  // inserimento manuale
  h +=
    '<div class="add-tipo-row"><div class="field"><label>Collaboratore</label><select id="timb-collab" style="padding:8px">' +
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
      .map((c) => '<option>' + escP(c.nome) + '</option>')
      .join('') +
    '</select></div>' +
    '<div class="field"><label>Data</label><input type="date" id="timb-data"></div>' +
    '<div class="field"><label>Entrata</label><input type="time" id="timb-entrata"></div>' +
    '<div class="field"><label>Uscita</label><input type="time" id="timb-uscita"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiTimbratura()">+ Registra</button></div>';
  h += '<div id="timb-confronto"></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiTimbratura() {
  if (!puoGestirePiano()) return;
  const nome = (document.getElementById('timb-collab') || {}).value;
  const data = (document.getElementById('timb-data') || {}).value;
  const entrata = (document.getElementById('timb-entrata') || {}).value;
  const uscita = (document.getElementById('timb-uscita') || {}).value;
  if (!nome || !data || !entrata || !uscita) {
    toast('Compila tutti i campi');
    return;
  }
  try {
    await secPost('piano_timbrature', {
      collaboratore: nome,
      data: data,
      ora_entrata: entrata,
      ora_uscita: uscita,
      ore: _pianoOreTimbrataPerGiorno(nome, data, entrata, uscita),
      fonte: 'manuale',
      reparto_dip: _pianoReparto(),
      operatore: getOperatore(),
    });
    logAzione('Timbratura registrata', nome + ' ' + data + ' ' + entrata + '-' + uscita);
    toast('Timbratura registrata');
    caricaConfrontoTimbrature();
  } catch (e) {
    toast('Errore (timbratura già presente per quel giorno?)');
  }
}
async function importaTimbrature(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    if (data.length < 2) {
      toast('File vuoto');
      return;
    }
    // riconoscimento colonne (fuzzy, come Turnivo)
    const head = data[0].map((c) => String(c).toLowerCase());
    const trova = (parole) => head.findIndex((c) => parole.some((p) => c.includes(p)));
    const iNome = trova(['nome', 'collaboratore', 'dipendente']);
    const iData = trova(['data', 'giorno', 'date']);
    const iIn = trova(['entrata', 'ingresso', 'inizio', 'in']);
    const iOut = trova(['uscita', 'fine', 'out']);
    if (iNome === -1 || iData === -1 || iIn === -1 || iOut === -1) {
      toast('Colonne non riconosciute: servono nome, data, entrata, uscita');
      return;
    }
    const nomi = collaboratoriCache.filter((c) => c.attivo !== false);
    const matchNome = (n) => {
      const nn = String(n).toLowerCase().trim();
      const parti = nn.split(/\s+/);
      const hit = nomi.find(
        (c) =>
          c.nome.toLowerCase() === nn ||
          c.nome.toLowerCase() === parti.slice().reverse().join(' ') ||
          parti.every((p) => c.nome.toLowerCase().includes(p)),
      );
      return hit ? hit.nome : null;
    };
    const normOra = (v) => {
      if (v instanceof Date)
        return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
      if (typeof v === 'number') {
        const min = Math.round(v * 24 * 60);
        return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
      }
      const m = String(v).match(/(\d{1,2})[:.](\d{2})/);
      return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
    };
    const normData = (v) => {
      if (v instanceof Date) return v.toISOString().substring(0, 10);
      if (typeof v === 'number' && v > 40000)
        return new Date(Math.round((v - 25569) * 86400000)).toISOString().substring(0, 10);
      const m = String(v).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (m)
        return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
      const iso = String(v).match(/(\d{4})-(\d{2})-(\d{2})/);
      return iso ? iso[0] : null;
    };
    const valide = [];
    const scartate = [];
    data.slice(1).forEach((row) => {
      const nome = matchNome(row[iNome]);
      const dt = normData(row[iData]);
      const oin = normOra(row[iIn]);
      const oout = normOra(row[iOut]);
      if (nome && dt && oin && oout) valide.push({ nome, dt, oin, oout });
      else if (String(row[iNome] || '').trim()) scartate.push(String(row[iNome]));
    });
    if (!valide.length) {
      toast('Nessuna riga valida nel file');
      return;
    }
    if (
      !confirm(
        'Importare ' +
          valide.length +
          ' timbrature?' +
          (scartate.length ? '\n(' + scartate.length + ' righe scartate: nome/data non riconosciuti)' : '') +
          '\nLe timbrature già presenti per lo stesso giorno non vengono toccate.',
      )
    )
      return;
    let ok = 0;
    for (let i = 0; i < valide.length; i += 10) {
      const blocco = valide.slice(i, i + 10);
      const esiti = await Promise.all(
        blocco.map((v) =>
          secPost('piano_timbrature', {
            collaboratore: v.nome,
            data: v.dt,
            ora_entrata: v.oin,
            ora_uscita: v.oout,
            ore: _pianoOreTimbrataPerGiorno(v.nome, v.dt, v.oin, v.oout),
            fonte: 'import',
            reparto_dip: _pianoReparto(),
            operatore: getOperatore(),
          }).then(
            () => 1,
            () => 0,
          ),
        ),
      );
      ok += esiti.reduce((s, x) => s + x, 0);
    }
    logAzione('Timbrature importate', ok + '/' + valide.length + ' da ' + file.name);
    toast(
      'Importate ' +
        ok +
        ' timbrature' +
        (valide.length - ok ? ' (' + (valide.length - ok) + ' duplicate saltate)' : ''),
    );
    caricaConfrontoTimbrature();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file timbrature');
  }
}
async function caricaConfrontoTimbrature() {
  const el = document.getElementById('timb-confronto');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Caricamento...</p>';
  await _pianoCaricaTimbrature();
  if (!_pianoTimbrature.length) {
    el.innerHTML =
      '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Nessuna timbratura per ' + _pianoMeseSel + '.</p>';
    return;
  }
  // ore pianificate per collaboratore (turni del mese)
  const pianOre = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) pianOre[r.collaboratore] = (pianOre[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const timbOre = {};
  const timbGg = {};
  _pianoTimbrature.forEach((t) => {
    timbOre[t.collaboratore] = (timbOre[t.collaboratore] || 0) + (parseFloat(t.ore) || 0);
    timbGg[t.collaboratore] = (timbGg[t.collaboratore] || 0) + 1;
  });
  // pianificato per giorno (per il dettaglio, come timbrate.html di Turnivo)
  const pianoGiorno = {}; // nome|data -> {codice, ore}
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) pianoGiorno[r.collaboratore + '|' + r.data] = { codice: r.codice, ore: parseFloat(t.durata_ore) || 0 };
  });
  const perNomeT = {};
  _pianoTimbrature.forEach((t) => (perNomeT[t.collaboratore] = (perNomeT[t.collaboratore] || []).concat(t)));
  let h =
    '<div style="overflow-x:auto;margin-top:8px"><table class="piano-table" style="min-width:560px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Giorni timbrati</th><th>Ore timbrate</th><th>Ore pianificate</th><th>Differenza</th></tr></thead><tbody>';
  let iDet = 0;
  Object.keys(timbOre)
    .sort()
    .forEach((n) => {
      const diff = Math.round((timbOre[n] - (pianOre[n] || 0)) * 10) / 10;
      iDet++;
      h +=
        '<tr style="cursor:pointer" title="Clicca per il dettaglio dei giorni" onclick="const d=document.getElementById(\'timb-det-' +
        iDet +
        "');d.style.display=d.style.display==='none'?'':'none'\"><td style=\"text-align:left;font-weight:600\">▸ " +
        escP(n) +
        '</td><td>' +
        timbGg[n] +
        '</td><td>' +
        timbOre[n].toFixed(1) +
        '</td><td>' +
        (pianOre[n] || 0).toFixed(1) +
        '</td><td style="font-weight:700;color:' +
        (diff > 0 ? '#2c6e49' : diff < 0 ? '#c0392b' : 'var(--muted)') +
        '">' +
        (diff > 0 ? '+' : '') +
        diff.toFixed(1) +
        '</td></tr>';
      // dettaglio per giorno (chiuso di default, per non fare confusione)
      let det =
        '<table class="piano-table" style="min-width:100%;font-size:.8rem"><thead><tr><th>Giorno</th><th>Turno</th><th>Entrata</th><th>Uscita</th><th>Ore eff.</th><th>Ore pian.</th><th>Diff</th><th></th></tr></thead><tbody>';
      (perNomeT[n] || [])
        .slice()
        .sort((x, y) => x.data.localeCompare(y.data))
        .forEach((t) => {
          const p = pianoGiorno[n + '|' + t.data];
          const dg = Math.round(((parseFloat(t.ore) || 0) - (p ? p.ore : 0)) * 100) / 100;
          det +=
            '<tr><td>' +
            t.data.split('-')[2] +
            '</td><td>' +
            escP(p ? p.codice : '—') +
            '</td><td>' +
            escP((t.ora_entrata || '').substring(0, 5)) +
            '</td><td>' +
            escP((t.ora_uscita || '').substring(0, 5)) +
            '</td><td style="font-weight:700">' +
            (parseFloat(t.ore) || 0).toFixed(2) +
            '</td><td>' +
            (p ? p.ore.toFixed(2) : '') +
            '</td><td style="color:' +
            (dg > 0 ? '#2c6e49' : dg < 0 ? '#c0392b' : 'var(--muted)') +
            '">' +
            (dg > 0 ? '+' : '') +
            dg.toFixed(2) +
            '</td><td><button class="btn-del-tipo" onclick="eliminaTimbratura(' +
            t.id +
            ')">Elimina</button></td></tr>';
        });
      det += '</tbody></table>';
      h +=
        '<tr id="timb-det-' +
        iDet +
        '" style="display:none"><td colspan="5" style="padding:6px 10px;background:var(--paper2)">' +
        det +
        '</td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.78rem;color:var(--muted);margin-top:6px">Differenza = timbrate − pianificate del mese (' +
    _pianoMeseSel +
    ', ' +
    escP(repartoLabel(_pianoReparto())) +
    ')</p>';
  el.innerHTML = h;
}

// ================================================================
// STATISTICHE ANNUALI + PANORAMICA MESI (come Turnivo cap. 7.4 e 20)
// ================================================================
function _renderPianoStatCard() {
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Statistiche anno e panoramica mesi</div><div style="padding:10px 14px" id="piano-stat-body">' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="caricaStatisticheAnnoPiano()">Carica statistiche ' +
    _pianoMeseSel.split('-')[0] +
    '</button><div id="piano-stat-anno"></div></div></div>'
  );
}
async function caricaStatisticheAnnoPiano() {
  const el = document.getElementById('piano-stat-anno');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);font-size:.8rem;padding:6px 0">Caricamento anno...</p>';
  const anno = _pianoMeseSel.split('-')[0];
  const righe =
    (await secGet(
      'piano?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=20000',
    )) || [];
  const fabb =
    (await secGet(
      'piano_fabbisogni?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=5000',
    )) || [];
  // panoramica mesi
  const mesiDati = {};
  righe.forEach((r) => (mesiDati[r.data.substring(5, 7)] = (mesiDati[r.data.substring(5, 7)] || 0) + 1));
  const mesiFabb = {};
  fabb.forEach((f) => (mesiFabb[f.data.substring(5, 7)] = true));
  let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">';
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const ha = mesiDati[mm];
    h +=
      '<button class="btn-export" style="font-size:.78rem;padding:4px 10px;' +
      (ha ? 'border-color:#2c6e49;color:#2c6e49;font-weight:700' : 'color:var(--muted)') +
      '" onclick="_pianoMeseSel=\'' +
      anno +
      '-' +
      mm +
      '\';_pianoViolCelle={};_pianoViolLista=null;renderPiano()">' +
      (MESI[m - 1] || mm) +
      (ha ? ' (' + ha + ')' : '') +
      (mesiFabb[mm] ? ' <span style="color:#d4b86a">F</span>' : '') +
      '</button>';
  }
  h += '</div>';
  // statistiche per collaboratore
  const st = {};
  const mesiConPiano = new Set(righe.map((r) => r.data.substring(5, 7)));
  righe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    const cs = _pianoCodiceInfo(r.codice);
    const o = (st[r.collaboratore] = st[r.collaboratore] || {
      ore: 0,
      gg: 0,
      d: 0,
      n: 0,
      we: 0,
      dom: 0,
      v: 0,
      m: 0,
      cgfMat: 0,
      cgfGod: 0,
    });
    const dow = new Date(r.data + 'T12:00:00').getDay();
    const info = _pianoCollabInfo(r.collaboratore) || {};
    if (t) {
      o.ore += parseFloat(t.durata_ore) || 0;
      o.gg++;
      if (t.tipo === 'NOTTURNO') o.n++;
      else o.d++;
      if (_pianoGiorniWeekend().includes(dow)) o.we++;
      if (dow === 0) o.dom++;
      // CGF MATURATO: ha lavorato in un festivo con flag CGF (automatico)
      const fest = pianoFestiviCache.find((f) => f.data === r.data);
      if (fest && fest.cgf !== false) o.cgfMat++;
    } else if (cs) {
      if (r.codice === 'V' || r.codice === 'V1') o.v++;
      if (r.codice === 'M' || r.codice === 'M1') o.m++;
      if (r.codice === 'CGF') o.cgfGod++; // CGF goduto
      const oCs = parseFloat(cs.ore) || 0;
      o.ore += cs.scala_percentuale ? oCs * (parseFloat(info.percentuale) || 1) : oCs;
    }
  });
  // ore dovute sull'anno: solo sui mesi che hanno un piano (come confronto sensato)
  let ggDovuti = 0;
  mesiConPiano.forEach((mm) => (ggDovuti += new Date(parseInt(anno), parseInt(mm), 0).getDate()));
  const dovuteDi = (nome) => {
    const info = _pianoCollabInfo(nome) || {};
    if (info.is_jolly) return 0;
    return Math.round((ggDovuti / 7) * _pianoOreSett * (parseFloat(info.percentuale) || 1) * 10) / 10;
  };
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:760px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Ore anno</th><th title="Sui mesi con un piano">Ore dovute</th><th>Giorni lavorati</th><th>Diurni</th><th>Notturni</th><th>Weekend</th><th>Domeniche</th><th>Vacanze</th><th>Malattie</th><th title="Festivi con flag CGF lavorati (maturati automaticamente)">CGF maturati</th><th title="Giorni CGF presi nel piano">CGF goduti</th><th title="Maturati − goduti">Saldo CGF</th></tr></thead><tbody>';
  Object.keys(st)
    .sort()
    .forEach((n) => {
      const o = st[n];
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(n) +
        '</td><td>' +
        o.ore.toFixed(1) +
        '</td><td style="color:var(--muted)">' +
        (dovuteDi(n) ? dovuteDi(n).toFixed(1) : '—') +
        '</td><td>' +
        o.gg +
        '</td><td>' +
        o.d +
        '</td><td>' +
        o.n +
        '</td><td' +
        (o.we > 20
          ? ' style="color:#c0392b;font-weight:700"'
          : o.we >= 12
            ? ' style="color:#b39b00;font-weight:700"'
            : '') +
        '>' +
        o.we +
        '</td><td>' +
        o.dom +
        '</td><td>' +
        o.v +
        '</td><td>' +
        o.m +
        '</td><td>' +
        (o.cgfMat || '') +
        '</td><td>' +
        (o.cgfGod || '') +
        '</td><td style="font-weight:700;color:' +
        (o.cgfMat - o.cgfGod > 0 ? '#2c6e49' : o.cgfMat - o.cgfGod < 0 ? '#c0392b' : 'var(--muted)') +
        '">' +
        (o.cgfMat || o.cgfGod ? o.cgfMat - o.cgfGod : '') +
        '</td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.78rem;color:var(--muted);margin-top:6px">Weekend: giallo da 12, rosso oltre 20 (equità). Click su un mese per aprirlo.</p>';
  el.innerHTML = h;
}

// ================================================================
// IMPORT VACANZE DA EXCEL (col A cognome, col B nome, col F-BE = settimane 1-52 con X)
// ================================================================
// ================================================================
// TAB VACANZE — identica alla pagina Vacanze di Turnivo: settimane ISO
// per collaboratore per anno, conferma, elimina, import Excel,
// applicazione V+C+WD al piano (port di step_vacanze.py)
// ================================================================
let _pianoVacCache = [];
function _vacDateSettimana(anno, settimana) {
  const gg = _pianoGiorniSettimana(anno, settimana);
  const f = (x) => x.split('-')[2] + '/' + x.split('-')[1];
  return 'dal ' + f(gg[0]) + ' al ' + f(gg[6]);
}
async function _renderPianoVacanzeTab() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  window._pianoVacAnno = anno;
  _pianoVacCache =
    (await secGet('piano_vacanze?anno=eq.' + anno + '&order=collaboratore.asc,settimana.asc&limit=2000')) || [];
  const filtro = window._pianoVacFiltro || '';
  const vac = filtro ? _pianoVacCache.filter((v) => v.collaboratore === filtro) : _pianoVacCache;
  const puoMod = puoGestirePiano();
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  // ordine come nel piano (ordine salvato, poi SUP/BO/altri)
  const ordSalv = (window._pianoOrdineCollab || {})[_pianoReparto()] || [];
  const pos = {};
  ordSalv.forEach((n, i) => (pos[n] = i));
  const perCollab = {};
  vac.forEach((v) => (perCollab[v.collaboratore] = (perCollab[v.collaboratore] || []).concat(v)));
  const gruppi = Object.keys(perCollab).sort(
    (x, y) => (pos[x] != null ? pos[x] : 9999) - (pos[y] != null ? pos[y] : 9999) || x.localeCompare(y),
  );
  const MESI_L = MESI_FULL || [];
  const meseLbl = (MESI_L[parseInt(_pianoMeseSel.split('-')[1]) - 1] || '') + ' ' + _pianoMeseSel.split('-')[0];

  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Vacanze ' +
    anno +
    ' (' +
    vac.length +
    ')';
  h +=
    '<select onchange="window._pianoVacAnno=parseInt(this.value);renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">';
  for (let a = 2025; a <= 2031; a++)
    h += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  h += '</select>';
  h +=
    '<select onchange="window._pianoVacFiltro=this.value;renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a;max-width:220px"><option value="">Tutti i collaboratori</option>' +
    nomiRep
      .map((n) => '<option value="' + escP(n) + '"' + (filtro === n ? ' selected' : '') + '>' + escP(n) + '</option>')
      .join('') +
    '</select>';
  if (puoMod) {
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="apriNuovaVacanza()">Nuova vacanza</button>';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#d4b86a;color:#d4b86a" onclick="document.getElementById(\'vac-file\').click()">Importa da Excel</button>' +
      '<input type="file" id="vac-file" accept=".xlsx,.xls" style="display:none" onchange="importaVacanzePiano(this)">';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#1a4a7a;color:#7ea8d8" onclick="applicaVacanzePiano()">Applica al piano — ' +
      escP(meseLbl) +
      '</button>';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#8e44ad;color:#b07cc7" onclick="apriScambioSettimane()">Scambia settimane</button>';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#8e44ad;color:#b07cc7" onclick="pdfCambioVacanza()">Formulario cambio vacanza</button>';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:var(--accent);color:var(--accent)" onclick="eliminaTutteVacanze()">Elimina tutte</button>';
  }
  h += '</div>';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);padding:8px 14px 0">Le vacanze sono settimane intere (lun-dom). "Applica al piano" scrive le V (protette) del mese scelto nel Calendario e i congedi C prima/dopo secondo le regole (1 C prima per i fissi, 2 per i jolly; C dopo scalati per percentuale). Import Excel formato Turnivo: colonna A cognome, B nome, colonne F-BE settimane 1-52 con X.</p>';
  if (!gruppi.length) h += '<p style="padding:14px;color:var(--muted)">Nessuna vacanza per il ' + anno + '.</p>';
  gruppi.forEach((nome) => {
    const lista = perCollab[nome];
    h +=
      '<div style="margin:10px 14px;border:1px solid var(--line);border-radius:3px;overflow:hidden"><div style="background:#ffc107;color:#212529;padding:6px 10px;font-weight:700;font-size:.82rem">' +
      escP(nome) +
      ' (' +
      lista.length +
      ' settimane)</div>';
    h +=
      '<table class="piano-table" style="min-width:100%;font-size:.85rem"><thead><tr><th style="text-align:left">Settimana</th><th>Confermata</th>' +
      (puoMod ? '<th>Azioni</th>' : '') +
      '</tr></thead><tbody>';
    lista.forEach((v) => {
      h +=
        '<tr><td style="text-align:left"><strong>Settimana ' +
        v.settimana +
        '</strong> <span style="color:var(--muted);font-size:.8rem">(' +
        _vacDateSettimana(anno, v.settimana) +
        ')</span></td>';
      h +=
        '<td>' +
        (puoMod
          ? '<span class="mini-badge" style="cursor:pointer;background:' +
            (v.confermata ? '#2c6e49' : '#888') +
            '" onclick="toggleVacanzaConfermata(' +
            v.id +
            ')">' +
            (v.confermata ? 'Sì' : 'No') +
            '</span>'
          : v.confermata
            ? 'Sì'
            : 'No') +
        '</td>';
      if (puoMod)
        h +=
          '<td><button class="btn-export" style="font-size:.8rem;padding:2px 10px;border-color:#1a4a7a;color:#1a4a7a;margin-right:6px" onclick="modificaVacanza(' +
          v.id +
          ')">Modifica</button><button class="btn-export" style="font-size:.8rem;padding:2px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaVacanza(' +
          v.id +
          ')">Elimina</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  h += '</div>';
  return h;
}
// TAB SALDO — come la pagina Saldo Ore di Turnivo: dovute/pianificate/saldo
// del mese per collaboratore + totali (YTD dalla stessa mappa della griglia)
async function _renderPianoSaldoTab() {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const MESI_L = MESI_FULL || [];
  const label = (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) + ' ' + ym.split('-')[0];
  const perNome = {};
  _pianoRighe.forEach((r) => (perNome[r.collaboratore] = (perNome[r.collaboratore] || []).concat(r)));
  const ordSalv = (window._pianoOrdineCollab || {})[_pianoReparto()] || [];
  const pos = {};
  ordSalv.forEach((n, i) => (pos[n] = i));
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome)
    .sort((x, y) => (pos[x] != null ? pos[x] : 9999) - (pos[y] != null ? pos[y] : 9999) || x.localeCompare(y));
  await _pianoAggiornaYtd(nomi);
  // come Turnivo: ore LAVORATE = timbrate del mese se presenti, altrimenti piano
  const da = ym + '-01';
  const aFine = ym + '-' + String(nGiorni).padStart(2, '0');
  const timbrateMese = (await secGet('piano_timbrature?data=gte.' + da + '&data=lte.' + aFine + '&limit=5000')) || [];
  const timbNome = {};
  timbrateMese.forEach(
    (t) => (timbNome[t.collaboratore] = (timbNome[t.collaboratore] || 0) + (parseFloat(t.ore) || 0)),
  );
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px">Saldo ore — ' +
    escP(label) +
    '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button></div>';
  h +=
    '<div style="overflow-x:auto;padding:0 6px 8px"><table class="piano-table" style="min-width:760px;font-size:.8rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Fun</th><th>%</th><th>Ore dovute</th><th title="Timbrate se presenti, altrimenti piano">Ore lavorate</th><th>Saldo mese</th><th>Saldo anno (YTD)</th></tr></thead><tbody>';
  let totD = 0;
  let totP = 0;
  let totS = 0;
  nomi.forEach((nome) => {
    const info = _pianoCollabInfo(nome) || {};
    const pct = parseFloat(info.percentuale) || 1;
    let op = 0;
    (perNome[nome] || []).forEach((r) => {
      op += _pianoOreDiRiga(r, pct);
    });
    if (timbNome[nome] != null) op = timbNome[nome]; // timbrate del mese: hanno la precedenza
    const od = info.is_jolly ? 0 : Math.round((nGiorni / 7) * _pianoOreSett * pct * 100) / 100;
    const sm = Math.round((op - od) * 10) / 10;
    const ytd = Math.round(((_pianoYtdMap[nome] || 0) + sm) * 10) / 10;
    totD += od;
    totP += op;
    totS += sm;
    const col = (v) => (v > 0 ? '#2c6e49' : v < 0 ? '#c0392b' : 'var(--muted)');
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(nome) +
      '</td><td>' +
      escP(info.is_jolly ? 'JOLLY' : info.funzione || '') +
      '</td><td>' +
      Math.round(pct * 100) +
      '%</td><td>' +
      (od ? od.toFixed(1) : '—') +
      '</td><td>' +
      (op ? op.toFixed(1) : '') +
      '</td><td style="font-weight:700;color:' +
      col(sm) +
      '">' +
      (op || od ? (sm > 0 ? '+' : '') + sm.toFixed(1) : '') +
      '</td><td style="font-weight:700;color:' +
      col(ytd) +
      '">' +
      (op || _pianoYtdMap[nome] ? (ytd > 0 ? '+' : '') + ytd.toFixed(1) : '') +
      '</td></tr>';
  });
  h +=
    '<tr style="border-top:2px solid #000"><td style="text-align:left;font-weight:700">TOTALE</td><td></td><td></td><td style="font-weight:700">' +
    totD.toFixed(1) +
    '</td><td style="font-weight:700">' +
    totP.toFixed(1) +
    '</td><td style="font-weight:700;color:' +
    (totS > 0 ? '#2c6e49' : totS < 0 ? '#c0392b' : 'inherit') +
    '">' +
    (totS > 0 ? '+' : '') +
    totS.toFixed(1) +
    '</td><td></td></tr>';
  h +=
    '</tbody></table></div><p style="font-size:.8rem;color:var(--muted);padding:8px 14px">Dovute = giorni/7 × ' +
    _pianoOreSett +
    'h × percentuale (jolly esclusi). Pianificate = ore turni + codici speciali (V, M... scalati per percentuale). YTD = cumulato da gennaio: nei mesi passati valgono le ore timbrate se presenti, altrimenti il piano.</p></div>';
  return h;
}

// TAB STORICO — come la pagina Storico di Turnivo: log delle modifiche al
// piano (dal Registro del Diario, filtrato sulle azioni del piano)
// ordinamento per colonna dello storico: 1° clic decrescente, 2° crescente
function pianoStoricoSort(campo) {
  const s0 = window._pianoStoricoSort || { campo: 'created_at', dir: -1 };
  window._pianoStoricoSort = { campo: campo, dir: s0.campo === campo ? -s0.dir : campo === 'created_at' ? -1 : 1 };
  renderPiano();
}
async function _renderPianoStoricoTab() {
  const filtro = window._pianoStoricoFiltro || '';
  const cerca = (window._pianoStoricoCerca || '').toLowerCase();
  const srt = window._pianoStoricoSort || { campo: 'created_at', dir: -1 };
  const logs =
    (await secGet(
      'log_attivita?or=(azione.ilike.Piano*,azione.ilike.Vacanz*,azione.ilike.*piano*)&order=created_at.desc&limit=300',
    )) || [];
  let visibili = filtro ? logs.filter((l) => l.azione === filtro) : logs;
  if (cerca)
    visibili = visibili.filter((l) =>
      ((l.operatore || '') + ' ' + (l.azione || '') + ' ' + (l.dettaglio || '')).toLowerCase().includes(cerca),
    );
  visibili = visibili
    .slice()
    .sort(
      (a, b) =>
        srt.dir * String(a[srt.campo] || '').localeCompare(String(b[srt.campo] || '')) ||
        (b.created_at || '').localeCompare(a.created_at || ''),
    );
  const azioni = [...new Set(logs.map((l) => l.azione))].sort();
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Storico modifiche piano (' +
    visibili.length +
    ')';
  h +=
    '<select onchange="window._pianoStoricoFiltro=this.value;renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a"><option value="">Tutte le azioni</option>' +
    azioni
      .map((a) => '<option value="' + escP(a) + '"' + (filtro === a ? ' selected' : '') + '>' + escP(a) + '</option>')
      .join('') +
    '</select>';
  h +=
    '<input type="text" value="' +
    escP(window._pianoStoricoCerca || '') +
    '" placeholder="Cerca nome o voce..." onchange="window._pianoStoricoCerca=this.value;renderPiano()" style="padding:4px 8px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a;width:170px">';
  h += '</div>';
  h +=
    '<div style="overflow-x:auto;padding:0 6px 8px"><table class="piano-table" style="min-width:700px;font-size:.85rem"><thead><tr>' +
    [
      ['created_at', 'Data e ora', ''],
      ['operatore', 'Operatore', ''],
      ['azione', 'Azione', 'text-align:left'],
      ['dettaglio', 'Dettaglio', 'text-align:left'],
    ]
      .map(
        ([campo, label, st]) =>
          '<th style="cursor:pointer;' +
          st +
          '" title="Clicca per ordinare" onclick="pianoStoricoSort(\'' +
          campo +
          '\')">' +
          label +
          (srt.campo === campo
            ? srt.dir === 1
              ? ' &#9650;'
              : ' &#9660;'
            : ' <span style="opacity:.35">&#8597;</span>') +
          '</th>',
      )
      .join('') +
    '</tr></thead><tbody>';
  visibili.forEach((l) => {
    const d = l.created_at ? new Date(l.created_at) : null;
    h +=
      '<tr><td>' +
      (d
        ? d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '') +
      '</td><td>' +
      escP(l.operatore || '') +
      '</td><td style="text-align:left;font-weight:600">' +
      escP(l.azione || '') +
      '</td><td style="text-align:left">' +
      escP(l.dettaglio || '') +
      '</td></tr>';
  });
  if (!visibili.length)
    h += '<tr><td colspan="4" style="padding:14px;color:var(--muted)">Nessuna modifica registrata</td></tr>';
  h += '</tbody></table></div></div>';
  return h;
}

// Formulario RICHIESTA CAMBIO VACANZA — replica di cambio_vacanza_pdf.html
// di Turnivo (modulo vuoto da compilare a mano, stesse sezioni colorate)
async function pdfCambioVacanza(dati) {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 15;
  const W = 210 - 2 * M;
  let y = 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text('Casino Lugano SA', 105, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text('RICHIESTA CAMBIO VACANZA', 105, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 51, 51);
  doc.text(
    'Generato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' ' +
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    105,
    y,
    { align: 'center' },
  );
  y += 5;
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(1);
  doc.line(M, y, 210 - M, y);
  y += 10;
  const linea = '___________________________________________';
  const sezione = (titolo, barra, righe, altezzaExtra) => {
    const altezza = 12 + righe.length * 7 + (altezzaExtra || 3);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.25);
    doc.roundedRect(M, y, W, altezza, 1.8, 1.8, 'FD');
    doc.setFillColor(barra[0], barra[1], barra[2]);
    doc.rect(M, y, 1.6, altezza, 'F');
    let yy = y + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(titolo, M + 6, yy);
    doc.setDrawColor(221, 221, 221);
    doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
    yy += 8;
    doc.setFontSize(10);
    righe.forEach((r) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 51, 51);
      doc.text(r[0], M + 6, yy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(34, 34, 34);
      doc.text(r[1], M + 6 + 44, yy);
      yy += 7;
    });
    y += altezza + 6;
    return yy;
  };
  const campiDi = (c) =>
    c
      ? [
          ['Nome:', c.nome],
          ['Settore:', c.settore || repartoLabel(_pianoReparto())],
          ['Numero settimana:', 'Settimana ' + c.settimana],
          ['Periodo vacanza:', c.dal + '  —  ' + c.al],
        ]
      : [
          ['Nome:', linea],
          ['Settore:', linea],
          ['Numero settimana:', '__________________'],
          ['Periodo vacanza:', '____/____/________  —  ____/____/________'],
        ];
  sezione('Collaboratore A (richiedente)', [52, 152, 219], campiDi(dati && dati.a));
  sezione('Collaboratore B (accetta lo scambio)', [230, 126, 34], campiDi(dati && dati.b));
  sezione(
    'Motivazione',
    [46, 204, 113],
    [
      ['', linea + '__________________'],
      ['', linea + '__________________'],
    ],
  );
  // Autorizzazione con checkbox (viola, come il cambio turno)
  const hAut = 30;
  doc.setFillColor(250, 248, 252);
  doc.setDrawColor(221, 221, 221);
  doc.roundedRect(M, y, W, hAut, 1.8, 1.8, 'FD');
  doc.setFillColor(142, 68, 173);
  doc.rect(M, y, 1.6, hAut, 'F');
  let yy = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(44, 62, 80);
  doc.text('Autorizzazione', M + 6, yy);
  doc.setDrawColor(221, 221, 221);
  doc.line(M + 6, yy + 2, 210 - M - 6, yy + 2);
  yy += 9;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.rect(M + 6, yy - 4, 5, 5);
  doc.setFontSize(11);
  doc.setTextColor(34, 34, 34);
  doc.text('Autorizzato', M + 14, yy);
  doc.rect(M + 52, yy - 4, 5, 5);
  doc.text('Non autorizzato', M + 60, yy);
  yy += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Motivo:', M + 6, yy);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________________________________________________________________', M + 22, yy);
  y += hAut + 20;
  // firme A / B / Responsabile
  const firme = ['Firma Collaboratore A', 'Firma Collaboratore B', 'Firma Responsabile'];
  const wBox = W * 0.3;
  const gap = (W - wBox * 3) / 2;
  firme.forEach((f, i) => {
    const x = M + i * (wBox + gap);
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(0.35);
    doc.line(x, y, x + wBox, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 51, 51);
    doc.text(f, x + wBox / 2, y + 5, { align: 'center' });
    doc.text('Data: ____/____/________', x + wBox / 2, y + 11, { align: 'center' });
  });
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Generato dal Diario Collaboratori — formulario cambio vacanza', 105, 287, { align: 'center' });
  mostraPdfPreview(doc, 'cambio_vacanza.pdf', 'Formulario cambio vacanza');
}

// SCAMBIO SETTIMANE tra due collaboratori (meglio del solo formulario di
// Turnivo): scambia le righe vacanza, sistema le celle V/C/WD nei mesi già
// pianificati e genera il modulo PDF PRECOMPILATO per le firme.
function apriScambioSettimane() {
  if (!puoGestirePiano()) return;
  if (_pianoVacCache.length < 2) {
    toast("Servono almeno due vacanze nell'anno selezionato");
    return;
  }
  const opzioni = _pianoVacCache
    .slice()
    .sort((a, b) => a.collaboratore.localeCompare(b.collaboratore) || a.settimana - b.settimana)
    .map(
      (v) =>
        '<option value="' +
        v.id +
        '">' +
        escP(v.collaboratore) +
        ' — settimana ' +
        v.settimana +
        ' (' +
        _vacDateSettimana(v.anno, v.settimana) +
        ')</option>',
    )
    .join('');
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambia settimane di vacanza — ' +
    window._pianoVacAnno +
    '</h3><div class="field" style="text-align:left"><label>Collaboratore A (richiedente)</label><select id="ss-a" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div><div class="field" style="text-align:left;margin-top:8px"><label>Collaboratore B (accetta lo scambio)</label><select id="ss-b" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div>' +
    '<p style="font-size:.78rem;color:var(--muted);margin-top:8px">Le due settimane vengono scambiate; nei mesi già pianificati le V e i congedi vengono sistemati di conseguenza. Alla fine si genera il modulo PDF precompilato per le firme.</p>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaScambioSettimane()">Scambia</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaScambioSettimane() {
  const idA = parseInt((document.getElementById('ss-a') || {}).value);
  const idB = parseInt((document.getElementById('ss-b') || {}).value);
  document.getElementById('pwd-modal').classList.add('hidden');
  const vA = _pianoVacCache.find((x) => x.id === idA);
  const vB = _pianoVacCache.find((x) => x.id === idB);
  if (!vA || !vB || vA.id === vB.id) {
    toast('Scegli due vacanze diverse');
    return;
  }
  if (vA.collaboratore === vB.collaboratore) {
    toast('Le due vacanze appartengono alla stessa persona: usa Modifica');
    return;
  }
  // duplicati: A non deve già avere la settimana di B e viceversa
  if (
    _pianoVacCache.some(
      (x) => x.collaboratore === vA.collaboratore && x.settimana === vB.settimana && x.id !== vA.id,
    ) ||
    _pianoVacCache.some((x) => x.collaboratore === vB.collaboratore && x.settimana === vA.settimana && x.id !== vB.id)
  ) {
    toast("Uno dei due ha già la settimana dell'altro");
    return;
  }
  const op = getOperatore();
  try {
    await secPatch('piano_vacanze', 'id=eq.' + vA.id, { settimana: vB.settimana });
    await secPatch('piano_vacanze', 'id=eq.' + vB.id, { settimana: vA.settimana });
    logAzione(
      'Vacanze: scambio settimane',
      vA.collaboratore + ' (sett. ' + vA.settimana + ') <-> ' + vB.collaboratore + ' (sett. ' + vB.settimana + ')',
    );
    // sistemare i mesi già pianificati: via le V della vecchia settimana e i
    // C/WD generati dei due collaboratori, poi riapplico le vacanze
    const anno = window._pianoVacAnno;
    const mesi = new Set();
    [vA.settimana, vB.settimana].forEach((sett) =>
      _pianoGiorniSettimana(anno, sett).forEach((dstr) => {
        if (dstr.startsWith(String(anno))) mesi.add(dstr.substring(0, 7));
      }),
    );
    const meseCorrente = _pianoMeseSel;
    for (const ym of mesi) {
      const nG = _pianoUltimoGiorno(ym);
      const righeMese =
        (await secGet(
          'piano?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nG).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=5000',
        )) || [];
      if (!righeMese.length) continue; // mese non ancora pianificato: le V arriveranno con Applica/Genera
      for (const nome of [vA.collaboratore, vB.collaboratore]) {
        for (const r of righeMese.filter(
          (x) =>
            x.collaboratore === nome && (x.codice === 'V' || ((x.codice === 'C' || x.codice === 'WD') && x.generato)),
        )) {
          await secDel('piano', 'id=eq.' + r.id);
        }
      }
      _pianoMeseSel = ym;
      _pianoRighe =
        (await secGet(
          'piano?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nG).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=5000',
        )) || [];
      await _applicaVacanzeMese(false);
    }
    _pianoMeseSel = meseCorrente;
    // PDF precompilato identico al modulo
    const ggA = _pianoGiorniSettimana(anno, vB.settimana); // nuova settimana di A
    const ggB = _pianoGiorniSettimana(anno, vA.settimana);
    const fmt = (d) => d.split('-').reverse().join('/');
    await pdfCambioVacanza({
      a: { nome: vA.collaboratore, settimana: vB.settimana, dal: fmt(ggA[0]), al: fmt(ggA[6]) },
      b: { nome: vB.collaboratore, settimana: vA.settimana, dal: fmt(ggB[0]), al: fmt(ggB[6]) },
    });
    toast('Settimane scambiate' + (mesi.size ? ' e piano aggiornato' : ''));
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore scambio settimane');
  }
}

function apriNuovaVacanza() {
  if (!puoGestirePiano()) return;
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Nuova vacanza — ' +
    window._pianoVacAnno +
    '</h3><div class="field" style="text-align:left"><label>Collaboratore</label><select id="nv-collab" style="width:100%;padding:8px">' +
    nomiRep.map((n) => '<option value="' + escP(n) + '">' + escP(n) + '</option>').join('') +
    '</select></div><div class="field" style="text-align:left;margin-top:8px"><label>Settimana (1-53)</label><input type="number" id="nv-sett" min="1" max="53" style="width:110px;padding:8px"></div>' +
    '<div style="text-align:left;margin-top:8px"><label style="font-size:.82rem"><input type="checkbox" id="nv-conf" checked> Confermata</label></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaNuovaVacanza()">Aggiungi</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  setTimeout(() => {
    const el = document.getElementById('nv-sett');
    if (el) el.focus();
  }, 100);
}
async function salvaNuovaVacanza() {
  const nome = (document.getElementById('nv-collab') || {}).value;
  const sett = parseInt((document.getElementById('nv-sett') || {}).value);
  const conf = (document.getElementById('nv-conf') || {}).checked;
  if (!nome || isNaN(sett) || sett < 1 || sett > 53) {
    toast('Collaboratore e settimana (1-53) obbligatori');
    return;
  }
  document.getElementById('pwd-modal').classList.add('hidden');
  if (_pianoVacCache.find((v) => v.collaboratore === nome && v.settimana === sett)) {
    toast('Vacanza già inserita per questa settimana');
    return;
  }
  try {
    await secPost('piano_vacanze', {
      collaboratore: nome,
      settimana: sett,
      anno: window._pianoVacAnno,
      confermata: conf,
      operatore: getOperatore(),
    });
    logAzione('Vacanza aggiunta', nome + ' settimana ' + sett + '/' + window._pianoVacAnno);
    toast('Vacanza settimana ' + sett + ' aggiunta per ' + nome);
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio vacanza');
  }
}
async function toggleVacanzaConfermata(id) {
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v) return;
  try {
    await secPatch('piano_vacanze', 'id=eq.' + id, { confermata: !v.confermata });
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
async function modificaVacanza(id) {
  // come vacanze.modifica di Turnivo: cambia la settimana, controllo duplicati
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v) return;
  const risp = prompt('Nuova settimana per ' + v.collaboratore + ' (1-53):', String(v.settimana));
  if (risp === null) return;
  const sett = parseInt(risp);
  if (isNaN(sett) || sett < 1 || sett > 53) {
    toast('Settimana non valida (1-53)');
    return;
  }
  if (sett === v.settimana) return;
  if (_pianoVacCache.find((x) => x.collaboratore === v.collaboratore && x.settimana === sett && x.id !== id)) {
    toast('Settimana ' + sett + ' già assegnata a questo collaboratore');
    return;
  }
  try {
    await secPatch('piano_vacanze', 'id=eq.' + id, { settimana: sett });
    logAzione('Vacanza modificata', v.collaboratore + ' settimana ' + v.settimana + ' → ' + sett);
    toast('Vacanza aggiornata a settimana ' + sett);
    renderPiano();
  } catch (e) {
    toast('Errore modifica vacanza');
  }
}
async function eliminaVacanza(id) {
  if (!puoGestirePiano()) return;
  const v = _pianoVacCache.find((x) => x.id === id);
  if (!v || !confirm('Eliminare la vacanza di ' + v.collaboratore + ' settimana ' + v.settimana + '?')) return;
  try {
    await secDel('piano_vacanze', 'id=eq.' + id);
    logAzione('Vacanza eliminata', v.collaboratore + ' settimana ' + v.settimana + '/' + v.anno);
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
async function eliminaTutteVacanze() {
  if (!puoGestirePiano()) return;
  const anno = window._pianoVacAnno;
  if (!confirm('Eliminare TUTTE le vacanze del ' + anno + '? (' + _pianoVacCache.length + ' settimane)')) return;
  try {
    await secDel('piano_vacanze', 'anno=eq.' + anno);
    logAzione('Vacanze: eliminate tutte', String(anno));
    toast('Vacanze ' + anno + ' eliminate');
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}

function _pianoGiorniSettimana(anno, settimana) {
  // ISO 8601: settimana 1 = quella che contiene il 4 gennaio; lunedì = primo giorno
  const d = new Date(anno, 0, 4, 12);
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1 + (settimana - 1) * 7);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}
// Port 1:1 di step_vacanze.py (Turnivo "Ferie e Riposi"): piazza V protette
// dai blocchi settimana, C prima (1 fissi / 2 jolly, con riporto sul mese
// precedente) e dopo (scala per percentuale 100->1, 80->2, 60->3, 40->4),
// WD (diurno forzato, non protetto) nei giorni prima dei C pre-vacanza.
async function _applicaVacanzeMese(interattivo) {
  if (!puoGestirePiano()) return null;
  const ym = _pianoMeseSel;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const nGiorni = _pianoUltimoGiorno(ym);
  const cPrimaFissi = parseInt(_pianoRegolaVal('c_prima_fissi')) || 1;
  const cPrimaJolly = parseInt(_pianoRegolaVal('c_prima_jolly')) || 2;
  const cDopo = {
    100: parseInt(_pianoRegolaVal('c_dopo_100')) || 1,
    80: parseInt(_pianoRegolaVal('c_dopo_80')) || 2,
    60: parseInt(_pianoRegolaVal('c_dopo_60')) || 3,
    40: parseInt(_pianoRegolaVal('c_dopo_40')) || 4,
  };
  const wdPrima = parseInt(_pianoRegolaVal('wd_prima_vacanza'));
  const nWd = isNaN(wdPrima) ? 4 : wdPrima;
  const vacanze = (await secGet('piano_vacanze?anno=eq.' + anno + '&limit=2000')) || [];
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  // settimane -> giorni del mese corrente
  const vacGiorni = {}; // nome -> Set(giorno)
  vacanze.forEach((v) => {
    if (!nomiRep.includes(v.collaboratore)) return;
    _pianoGiorniSettimana(anno, v.settimana).forEach((dstr) => {
      const p = dstr.split('-');
      if (parseInt(p[0]) === anno && parseInt(p[1]) === mese)
        (vacGiorni[v.collaboratore] = vacGiorni[v.collaboratore] || new Set()).add(parseInt(p[2]));
    });
  });
  if (!Object.keys(vacGiorni).length) {
    if (interattivo) toast('Nessuna vacanza cade in ' + ym + ' per questo settore');
    return { v: 0, c: 0, wd: 0 };
  }
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  // come Turnivo: via le V/C/WD auto non protette rimaste da giri precedenti
  await secDel(
    'piano',
    'data=gte.' +
      da +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&protetto=eq.false&generato=eq.true&codice=in.(V,C,WD)',
  );
  const righe =
    (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&limit=5000')) ||
    [];
  const perCella = {}; // nome|g -> riga
  righe.forEach((r) => (perCella[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r));
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  let nV = 0;
  let nC = 0;
  let nWdP = 0;
  const op = getOperatore();
  const scrivi = async (nome, g, codice, protetto, generato) => {
    const r = perCella[nome + '|' + g];
    if (r) {
      if (r.protetto) return false; // mai toccare le protette
      if (r.codice === codice) return false;
      await secPatch('piano', 'id=eq.' + r.id, {
        codice: codice,
        protetto: protetto,
        generato: generato,
        operatore: op,
        updated_at: new Date().toISOString(),
      });
      r.codice = codice;
      r.protetto = protetto;
    } else {
      const n = await secPost('piano', {
        collaboratore: nome,
        data: dstrDi(g),
        codice: codice,
        protetto: protetto,
        generato: generato,
        reparto_dip: _pianoReparto(),
        operatore: op,
      });
      if (n && n[0]) perCella[nome + '|' + g] = n[0];
    }
    return true;
  };
  for (const nome of Object.keys(vacGiorni)) {
    const giorni = [...vacGiorni[nome]].sort((x, y) => x - y);
    const info = _pianoCollabInfo(nome) || {};
    // V protette su ogni giorno di vacanza (le protette esistenti restano)
    for (const g of giorni) {
      const r = perCella[nome + '|' + g];
      if (r && r.protetto) continue;
      if (await scrivi(nome, g, 'V', true, false)) nV++;
    }
    // blocchi contigui
    const blocchi = [];
    let bIni = giorni[0];
    let bFine = giorni[0];
    for (const g of giorni.slice(1)) {
      if (g === bFine + 1) bFine = g;
      else {
        blocchi.push([bIni, bFine]);
        bIni = g;
        bFine = g;
      }
    }
    blocchi.push([bIni, bFine]);
    const pct = info.percentuale != null ? info.percentuale : 1.0;
    const nCPrima = info.is_jolly ? cPrimaJolly : cPrimaFissi;
    const nCDopo = pct >= 1.0 ? cDopo[100] : pct >= 0.8 ? cDopo[80] : pct >= 0.6 ? cDopo[60] : cDopo[40];
    const setVac = vacGiorni[nome];
    const cGiorni = new Set();
    const cMesePrec = []; // giorni del mese precedente
    const dPrec = new Date(anno, mese - 2, 15);
    const nGiorniPrec = new Date(dPrec.getFullYear(), dPrec.getMonth() + 1, 0).getDate();
    for (const [bstart, bend] of blocchi) {
      for (let off = 1; off <= nCPrima; off++) {
        const prima = bstart - off;
        if (prima >= 1 && prima <= nGiorni && !setVac.has(prima)) cGiorni.add(prima);
        else if (prima < 1) {
          const gPrec = nGiorniPrec + prima;
          if (gPrec >= 1 && gPrec <= nGiorniPrec) cMesePrec.push(gPrec);
        }
      }
      for (let off = 1; off <= nCDopo; off++) {
        const dopo = bend + off;
        if (dopo >= 1 && dopo <= nGiorni && !setVac.has(dopo)) cGiorni.add(dopo);
      }
    }
    for (const g of [...cGiorni].sort((x, y) => x - y)) {
      if (await scrivi(nome, g, 'C', true, true)) nC++;
    }
    // WD: diurni forzati prima dei C pre-vacanza (non protetti)
    if (nWd > 0) {
      const wdSet = new Set();
      for (const [bstart] of blocchi) {
        const primoC = bstart - nCPrima;
        for (let off = 1; off <= nWd; off++) {
          const g = primoC - off;
          if (g >= 1 && g <= nGiorni && !setVac.has(g) && !cGiorni.has(g)) wdSet.add(g);
        }
      }
      for (const g of [...wdSet].sort((x, y) => x - y)) {
        if (await scrivi(nome, g, 'WD', false, true)) nWdP++;
      }
    }
    // C a cavallo del mese precedente
    for (const gPrec of cMesePrec) {
      const ymPrec = dPrec.getFullYear() + '-' + String(dPrec.getMonth() + 1).padStart(2, '0');
      const dstrP = ymPrec + '-' + String(gPrec).padStart(2, '0');
      const es = (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + dstrP)) || [];
      if (es.length) {
        if (!es[0].protetto) {
          await secPatch('piano', 'id=eq.' + es[0].id, { codice: 'C', generato: true, operatore: op });
          nC++;
        }
      } else {
        await secPost('piano', {
          collaboratore: nome,
          data: dstrP,
          codice: 'C',
          protetto: false,
          generato: true,
          reparto_dip: _pianoReparto(),
          operatore: op,
        });
        nC++;
      }
    }
  }
  logAzione('Piano: vacanze applicate', ym + ' — ' + nV + ' V, ' + nC + ' C, ' + nWdP + ' WD');
  return { v: nV, c: nC, wd: nWdP };
}
async function applicaVacanzePiano() {
  const MESI_L = MESI_FULL || [];
  const lbl = (MESI_L[parseInt(_pianoMeseSel.split('-')[1]) - 1] || '') + ' ' + _pianoMeseSel.split('-')[0];
  if (
    !confirm(
      'Applicare le vacanze a ' +
        lbl +
        ' (' +
        repartoLabel(_pianoReparto()) +
        ')?\n\nScrive le V (protette) sui giorni di vacanza, i congedi C prima/dopo i blocchi e i WD (diurno forzato) secondo le regole. Le celle protette esistenti non vengono toccate.',
    )
  )
    return;
  const r = await _applicaVacanzeMese(true);
  if (r) toast('Piazzate ' + r.v + ' V, ' + r.c + ' C, ' + r.wd + ' WD');
  _pianoTab = 'calendario';
  localStorage.setItem('piano_tab', 'calendario');
  renderPiano();
}

async function importaVacanzePiano(input) {
  // IDENTICO a Turnivo (vacanze.importa_excel): colonna A cognome, B nome,
  // colonne F-BE = settimane 1-52 con X. Scrive settimane in piano_vacanze
  // (confermata=true); le V arrivano nel piano con "Applica al piano".
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file || !window.XLSX) return;
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const nomi = collaboratoriCache.filter((c) => c.attivo !== false);
    const nuove = [];
    let collabTrovati = 0;
    data.forEach((row) => {
      const cognome = String(row[0] || '').trim();
      const nome = String(row[1] || '').trim();
      if (!cognome) return;
      const completo = (cognome + ' ' + nome).toLowerCase().trim();
      const hit = nomi.find(
        (c) =>
          c.nome.toLowerCase() === completo ||
          c.nome.toLowerCase() === (nome + ' ' + cognome).toLowerCase().trim() ||
          (new Set(c.nome.toLowerCase().split(/\s+/)).size === new Set(completo.split(/\s+/)).size &&
            completo.split(/\s+/).every((p) => c.nome.toLowerCase().includes(p))),
      );
      if (!hit) return;
      collabTrovati++;
      for (let w = 1; w <= 52; w++) {
        const cella = String(row[4 + w] || '')
          .trim()
          .toUpperCase(); // col F = indice 5 = settimana 1
        if (cella !== 'X') continue;
        if (_pianoVacCache.find((v) => v.collaboratore === hit.nome && v.settimana === w)) continue;
        nuove.push({ collaboratore: hit.nome, settimana: w, anno: anno, confermata: true, operatore: getOperatore() });
      }
    });
    if (!nuove.length) {
      toast('Nessuna settimana nuova nel file (' + collabTrovati + ' collaboratori riconosciuti)');
      return;
    }
    if (
      !confirm(
        'Importare le vacanze ' +
          anno +
          '?\n\n• ' +
          collabTrovati +
          ' collaboratori riconosciuti\n• ' +
          nuove.length +
          ' settimane da inserire\n\nPoi usa "Applica al piano" per scrivere le V nel calendario.',
      )
    )
      return;
    for (const v of nuove) await secPost('piano_vacanze', v);
    logAzione('Vacanze importate', anno + ' — ' + nuove.length + ' settimane');
    toast('Vacanze importate: ' + nuove.length + ' settimane');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file vacanze');
  }
}

// ================================================================
// MAPPATURE TURNO-FUNZIONE + IMPOSTAZIONI PIANO (personalizzabili)
// ================================================================
function _renderPianoMappatureCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni per funzione (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">PRINCIPALE = turni normali della funzione. AMMESSO = permessi quando serve. PREFERITO = la bozza li privilegia. Chi ha una funzione con mappature riceve SOLO i turni elencati; chi non ne ha segue la storia dei gruppi.</p>';
  const ordine = { PRINCIPALE: 1, AMMESSO: 2, PREFERITO: 3 };
  const perFz = {};
  pianoMappatureCache.forEach((m) => (perFz[m.funzione] = (perFz[m.funzione] || []).concat(m)));
  Object.keys(perFz)
    .sort()
    .forEach((fz) => {
      h +=
        '<p style="font-size:.85rem;font-weight:700;margin:8px 0 4px">' +
        escP(fz) +
        '</p><div style="display:flex;gap:6px;flex-wrap:wrap">';
      perFz[fz]
        .sort((a, b) => (ordine[a.tipo] || 9) - (ordine[b.tipo] || 9) || a.turno_codice.localeCompare(b.turno_codice))
        .forEach((m) => {
          const col = m.tipo === 'PRINCIPALE' ? '#2c6e49' : m.tipo === 'AMMESSO' ? '#b39b00' : '#1a4a7a';
          h +=
            '<span class="mini-badge" style="background:' +
            col +
            ';cursor:pointer" title="' +
            m.tipo +
            ' — clicca per rimuovere" onclick="rimuoviPianoMappatura(' +
            m.id +
            ')">' +
            escP(m.turno_codice) +
            '</span>';
        });
      h += '</div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:10px"><div class="field"><label>Funzione</label><select id="mp-funzione" style="padding:8px">' +
    (window._pianoFunzioni || ['RESP', 'SUP', 'BO', 'HOST']).map((f) => '<option>' + escP(f) + '</option>').join('') +
    '</select></div><div class="field"><label>Turno</label><input type="text" id="mp-turno" placeholder="S22" style="width:80px"></div>' +
    '<div class="field"><label>Tipo</label><select id="mp-tipo" style="padding:8px"><option>PRINCIPALE</option><option>AMMESSO</option><option>PREFERITO</option></select></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoMappatura()">+ Aggiungi</button></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoMappatura() {
  if (!isAdmin()) return;
  const fz = (document.getElementById('mp-funzione') || {}).value;
  const turno = ((document.getElementById('mp-turno') || {}).value || '').trim().toUpperCase();
  const tipo = (document.getElementById('mp-tipo') || {}).value || 'PRINCIPALE';
  if (!fz || !turno) {
    toast('Compila funzione e turno');
    return;
  }
  try {
    const r = await secPost('piano_mappature', { funzione: fz, turno_codice: turno, tipo: tipo });
    if (r && r[0]) pianoMappatureCache.push(r[0]);
    logAzione('Piano: mappatura aggiunta', fz + ' ' + turno + ' ' + tipo);
    toast('Mappatura aggiunta');
    renderPiano();
  } catch (e) {
    toast('Errore (mappatura già presente?)');
  }
}
async function rimuoviPianoMappatura(id) {
  if (!isAdmin()) return;
  const m = pianoMappatureCache.find((x) => x.id === id);
  if (!m || !confirm('Rimuovere ' + m.funzione + ' → ' + m.turno_codice + ' (' + m.tipo + ')?')) return;
  try {
    await secDel('piano_mappature', 'id=eq.' + id);
    pianoMappatureCache = pianoMappatureCache.filter((x) => x.id !== id);
    logAzione('Piano: mappatura rimossa', m.funzione + ' ' + m.turno_codice);
    toast('Mappatura rimossa');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

function _renderPianoImpostazioniCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Impostazioni piano (admin)</div><div style="padding:10px 14px">';
  h +=
    '<div class="add-tipo-row"><div class="field"><label>Ore settimanali contratto (per il saldo ore)</label><input type="number" step="0.5" id="pi-ore-sett" value="' +
    _pianoOreSett +
    '" style="width:90px" onchange="salvaOreSettimanali(this.value)"></div>' +
    '<div class="field" style="flex:1;min-width:220px"><label>Funzioni disponibili (separate da virgola)</label><input type="text" id="pi-funzioni" value="' +
    escP((window._pianoFunzioni || []).join(', ')) +
    '" onchange="salvaPianoFunzioni(this.value)"></div>' +
    '<div class="field"><label title="0 = illimitati">Max cambi turno al mese</label><input type="number" min="0" max="99" value="' +
    _pianoMaxCambi() +
    '" style="width:80px" onchange="salvaMaxCambi(this.value)"></div>' +
    '<div class="field"><label title="Giorni di affiancamento (dai commenti con formazione) prima della proposta di certificazione">Giorni formazione per certificare</label><input type="number" min="1" max="30" id="imp-gg-formazione" value="' +
    (window._pianoGgFormazione || 5) +
    '" style="width:80px" onchange="salvaGiorniFormazione()"></div></div>';
  // giorni weekend configurabili (come get_giorni_weekend di Turnivo)
  const GG_LBL = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const wk = _pianoGiorniWeekend();
  h +=
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 4px">Giorni weekend</p>' +
    '<p style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Colonne evidenziate in verde nel calendario e conteggio weekend nelle statistiche. La domenica ha sempre il suo colore.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    [1, 2, 3, 4, 5, 6, 0]
      .map(
        (d) =>
          '<label style="font-size:.82rem"><input type="checkbox"' +
          (wk.includes(d) ? ' checked' : '') +
          ' onchange="salvaGiornoWeekend(' +
          d +
          ',this.checked)"> ' +
          GG_LBL[d] +
          '</label>',
      )
      .join('') +
    '</div>';
  // competenze Formazione -> gruppi del piano
  h +=
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 4px">Competenze Formazione → gruppi del piano</p>' +
    '<p style="font-size:.78rem;color:var(--muted);margin-bottom:6px">Chi ha la competenza CERTIFICATA in Formazione diventa idoneo anche al gruppo indicato (in aggiunta ai suoi Settori). "—" = nessun collegamento.</p>';
  const gruppiDisp = [...new Set(pianoTurniCache.map((t) => (t.gruppo || '').toUpperCase()).filter(Boolean))].sort();
  const mappaCG = _pianoCompetenzeGruppi();
  const compRep = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll()[_pianoReparto()] || [] : [];
  if (compRep.length) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    compRep.forEach((k) => {
      h +=
        '<label style="font-size:.8rem;display:flex;align-items:center;gap:4px">' +
        escP(k.label) +
        ' → <select onchange="salvaCompetenzaGruppo(\'' +
        escP(k.key) +
        '\',this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">—</option>' +
        gruppiDisp
          .map(
            (g) => '<option' + ((mappaCG[k.key] || '').toUpperCase() === g ? ' selected' : '') + '>' + g + '</option>',
          )
          .join('') +
        '</select></label>';
    });
    h += '</div>';
  }
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-top:10px">Le funzioni compaiono nei menu di Gestione collaboratori e nelle mappature. Preferenze per collaboratore (solo diurni, turni bloccati, settori...) nella card qui sotto.</p>';
  h += '</div></div>';
  return h;
}
// Cambi RICHIESTI nel mese per collaboratore (dal Registro: nel log dello
// scambio il richiedente è il primo nome). Chi ACCETTA non consuma il limite.
async function _pianoCambiRichiesti(ym) {
  const logs =
    (await secGet(
      'log_attivita?azione=eq.' +
        encodeURIComponent('Piano: scambio turno') +
        '&dettaglio=like.' +
        encodeURIComponent('%il ' + ym + '-%') +
        '&limit=1000',
    )) || [];
  const conta = {};
  logs.forEach((l) => {
    const nome = (l.dettaglio || '').split(' (')[0].trim();
    if (nome) conta[nome] = (conta[nome] || 0) + 1;
  });
  return conta;
}
function _pianoMaxCambi() {
  const v = parseInt(window._pianoMaxCambiCfg);
  return isNaN(v) ? 0 : v;
}
async function salvaMaxCambi(v) {
  if (!isAdmin()) return;
  const n = Math.max(0, parseInt(v) || 0);
  window._pianoMaxCambiCfg = n;
  await setImp('piano_max_cambi_mese', String(n));
  logAzione('Piano: max cambi mese', String(n));
  toast(n ? 'Massimo ' + n + ' cambi al mese' : 'Cambi illimitati');
}
function _pianoGiorniWeekend() {
  const v = window._pianoWeekendCfg;
  if (Array.isArray(v) && v.length) return v;
  return [5, 6]; // default: venerdì e sabato (la domenica ha il suo colore)
}
async function salvaGiornoWeekend(dow, attivo) {
  if (!isAdmin()) return;
  let wk = _pianoGiorniWeekend().slice();
  if (attivo && !wk.includes(dow)) wk.push(dow);
  if (!attivo) wk = wk.filter((x) => x !== dow);
  window._pianoWeekendCfg = wk;
  await setImp('piano_giorni_weekend', JSON.stringify(wk));
  logAzione('Piano: giorni weekend', wk.join(','));
  toast('Giorni weekend aggiornati');
  renderPiano();
}
async function salvaCompetenzaGruppo(chiave, gruppo) {
  if (!isAdmin()) return;
  const cfg = Object.assign({}, window._pianoCompGruppiCfg || {});
  cfg[chiave] = gruppo || '';
  window._pianoCompGruppiCfg = cfg;
  await setImp('piano_competenze_gruppi', JSON.stringify(cfg));
  logAzione('Piano: competenza-gruppo', chiave + ' → ' + (gruppo || 'nessuno'));
  toast('Collegamento salvato');
}
async function salvaOreSettimanali(v) {
  if (!isAdmin()) return;
  const n = parseFloat(v) || 41;
  _pianoOreSett = n;
  await setImp('piano_ore_settimanali', String(n));
  logAzione('Piano: ore settimanali', String(n));
  toast('Ore settimanali: ' + n);
  renderPiano();
}
async function salvaPianoFunzioni(v) {
  if (!isAdmin()) return;
  const lista = String(v)
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (!lista.length) {
    toast('Inserisci almeno una funzione');
    return;
  }
  window._pianoFunzioni = lista;
  await setImp('piano_funzioni', JSON.stringify(lista));
  logAzione('Piano: funzioni', lista.join(','));
  toast('Funzioni aggiornate');
}

// Preferenze per collaboratore: solo diurni + turni bloccati
// ---- IMPORT / EXPORT (come la pagina Import/wizard di Turnivo) ----
function _scaricaFile(nomeFile, contenuto, mime) {
  const blob = new Blob(['\ufeff' + contenuto], { type: mime || 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function _csv(righe) {
  return righe
    .map((r) =>
      r
        .map((v) => {
          const s2 = v == null ? '' : String(v);
          return /[";\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
        })
        .join(';'),
    )
    .join('\n');
}
async function esportaPianoDati(tipo) {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const anno = parseInt(ym.split('-')[0]);
  try {
    if (tipo === 'collaboratori') {
      const righe = [
        [
          'Nome',
          'Funzione',
          'Percentuale',
          'Jolly',
          'Solo diurni',
          'Turni bloccati',
          'Preferisce L1',
          'Accoglienza',
          'Accompagnamento',
          'Lingue',
        ],
      ];
      collaboratoriCache
        .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
        .forEach((c) =>
          righe.push([
            c.nome,
            c.funzione || '',
            Math.round((parseFloat(c.percentuale) || 1) * 100) + '%',
            c.is_jolly ? 'SI' : '',
            c.solo_diurni ? 'SI' : '',
            c.turni_bloccati || '',
            c.prefers_l1 ? 'SI' : '',
            c.accoglienza || 0,
            c.accompagnamento_settori || '',
            c.lingue || '',
          ]),
        );
      _scaricaFile('collaboratori_' + _pianoReparto() + '.csv', _csv(righe));
    } else if (tipo === 'turni') {
      const righe = [['Codice', 'Gruppo', 'Inizio', 'Fine', 'Ore', 'Tipo', 'Oltre23', 'Colore', 'Attivo']];
      _pianoTurniReparto().forEach((t) =>
        righe.push([
          t.codice,
          t.gruppo || '',
          (t.ora_inizio || '').substring(0, 5),
          (t.ora_fine || '').substring(0, 5),
          t.durata_ore || 0,
          t.tipo || '',
          t.oltre23 ? 'SI' : '',
          t.colore || '',
          t.attivo !== false ? 'SI' : 'NO',
        ]),
      );
      _scaricaFile('turni_' + _pianoReparto() + '.csv', _csv(righe));
    } else if (tipo === 'codici') {
      const righe = [['Codice', 'Descrizione', 'Ore', 'Scala %', 'Riposo', 'Attivo']];
      pianoCodiciCache.forEach((c) =>
        righe.push([
          c.codice,
          c.descrizione || '',
          c.ore || 0,
          c.scala_percentuale ? 'SI' : '',
          c.is_riposo ? 'SI' : '',
          c.attivo !== false ? 'SI' : 'NO',
        ]),
      );
      _scaricaFile('codici_speciali.csv', _csv(righe));
    } else if (tipo === 'fabbisogno') {
      const fabb =
        (await secGet(
          'piano_fabbisogni?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nGiorni).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=3000',
        )) || [];
      const perCod = {};
      fabb.forEach(
        (f) => ((perCod[f.turno_codice] = perCod[f.turno_codice] || {})[parseInt(f.data.split('-')[2])] = f.quantita),
      );
      const testata = ['Turno'];
      for (let g = 1; g <= nGiorni; g++) testata.push(g);
      const righe = [testata];
      Object.keys(perCod)
        .sort()
        .forEach((cod) => {
          const r = [cod];
          for (let g = 1; g <= nGiorni; g++) r.push(perCod[cod][g] || '');
          righe.push(r);
        });
      _scaricaFile('fabbisogno_' + ym + '.csv', _csv(righe));
    } else if (tipo === 'vacanze') {
      const vac =
        (await secGet('piano_vacanze?anno=eq.' + anno + '&order=collaboratore.asc,settimana.asc&limit=2000')) || [];
      const righe = [['Collaboratore', 'Settimana', 'Anno', 'Dal', 'Al', 'Confermata']];
      vac.forEach((v) => {
        const gg = _pianoGiorniSettimana(v.anno, v.settimana);
        righe.push([v.collaboratore, v.settimana, v.anno, gg[0], gg[6], v.confermata ? 'SI' : 'NO']);
      });
      _scaricaFile('vacanze_' + anno + '.csv', _csv(righe));
    } else if (tipo === 'piano') {
      const testata = ['Collaboratore'];
      for (let g = 1; g <= nGiorni; g++) testata.push(g);
      const righe = [testata];
      const mappa2 = {};
      _pianoRighe.forEach((r) => (mappa2[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
      const nomi2 = [...new Set(_pianoRighe.map((r) => r.collaboratore))].sort();
      nomi2.forEach((n) => {
        const r = [n];
        for (let g = 1; g <= nGiorni; g++) r.push(mappa2[n + '|' + g] || '');
        righe.push(r);
      });
      _scaricaFile('piano_' + ym + '.csv', _csv(righe));
    } else if (tipo === 'timbrature') {
      const t2 =
        (await secGet(
          'piano_timbrature?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nGiorni).padStart(2, '0') +
            '&limit=5000',
        )) || [];
      const righe = [['Collaboratore', 'Data', 'Entrata', 'Uscita', 'Ore', 'Fonte']];
      t2.forEach((t) =>
        righe.push([
          t.collaboratore,
          t.data,
          (t.ora_entrata || '').substring(0, 5),
          (t.ora_uscita || '').substring(0, 5),
          t.ore || 0,
          t.fonte || '',
        ]),
      );
      _scaricaFile('timbrature_' + ym + '.csv', _csv(righe));
    }
    logAzione('Export dati piano', tipo + ' ' + ym);
  } catch (e) {
    console.error(e);
    toast('Errore export');
  }
}
function scaricaTemplatePiano(tipo) {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  if (tipo === 'fabbisogno') {
    const testata = ['Turno'];
    for (let g = 1; g <= nGiorni; g++) testata.push(g);
    const righe = [testata];
    _pianoTurniReparto()
      .slice(0, 5)
      .forEach((t) => {
        const r = [t.codice];
        for (let g = 1; g <= nGiorni; g++) r.push('');
        righe.push(r);
      });
    _scaricaFile('template_fabbisogno.csv', _csv(righe));
  } else if (tipo === 'vacanze') {
    const testata = ['Cognome', 'Nome', '', '', ''];
    for (let w = 1; w <= 52; w++) testata.push('Sett ' + w);
    const righe = [testata];
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
      .slice(0, 5)
      .forEach((c) => {
        const parti = c.nome.split(' ');
        const r = [parti[0], parti.slice(1).join(' '), '', '', ''];
        for (let w = 1; w <= 52; w++) r.push('');
        righe.push(r);
      });
    _scaricaFile('template_vacanze.csv', _csv(righe));
  } else if (tipo === 'timbrature') {
    _scaricaFile(
      'template_timbrature.csv',
      _csv([
        ['Nome', 'Data', 'Entrata', 'Uscita'],
        ['Bushi Musa', ym + '-01', '14:00', '22:15'],
      ]),
    );
  }
}
function _renderPianoImportExportCard() {
  if (!puoGestirePiano()) return '';
  const btn = (testo, onclick, colore) =>
    '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:' +
    (colore || '#b8a98a') +
    ';color:' +
    (colore || '#b8a98a') +
    '" onclick="' +
    onclick +
    '">' +
    testo +
    '</button>';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Import / Export dati</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;font-weight:700;margin-bottom:6px">Esporta (CSV, apribile in Excel)</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Piano del mese', "esportaPianoDati('piano')");
  h += btn('Fabbisogno del mese', "esportaPianoDati('fabbisogno')");
  h += btn('Collaboratori', "esportaPianoDati('collaboratori')");
  h += btn('Turni', "esportaPianoDati('turni')");
  h += btn('Codici speciali', "esportaPianoDati('codici')");
  h += btn('Vacanze anno', "esportaPianoDati('vacanze')");
  h += btn('Timbrature del mese', "esportaPianoDati('timbrature')");
  h += '</div>';
  h +=
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 6px">Template per l\'import</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Template fabbisogno', "scaricaTemplatePiano('fabbisogno')", '#2c6e49');
  h += btn('Template vacanze', "scaricaTemplatePiano('vacanze')", '#2c6e49');
  h += btn('Template timbrature', "scaricaTemplatePiano('timbrature')", '#2c6e49');
  h += '</div>';
  h +=
    '<p style="font-size:.78rem;color:var(--muted);margin-top:8px">Gli import si fanno nelle rispettive schermate: fabbisogno nel Calendario, vacanze nella tab Vacanze, timbrature nella tab Timbrature (o in automatico dalla timbratrice). L\'export copre anche il backup completo in Impostazioni del Diario.</p>';
  h += '</div></div>';
  return h;
}

const _REGOLE_GRUPPO_TIPI = {
  richiede_funzione: 'Solo queste funzioni (es: SUP oppure BO,SUP) — la storia nel gruppo vale come consenso',
  blocca_tipo_turno: 'Vieta un tipo di turno nel gruppo (es: NOTTURNO)',
  richiede_campo: 'Richiede un campo del collaboratore (es: accoglienza>0)',
  limite_funzione_giorno: 'Max N di una funzione al giorno (es: SUP:1)',
  limite_funzione_mese: 'Max N persone di una funzione al mese (es: SUP:1)',
  minimo_funzione_mese: 'Almeno N di una funzione al mese (es: SUP:1)',
  minimo_funzione_giorno: 'Almeno N al giorno, con filtri (es: SUP:1:NOTTURNO:4,5 — 4,5=ven,sab)',
};
// TAB GUIDA — manuale rapido della sezione Piano (come la Guida di Turnivo)
// ================================================================
// TAB FORMULARI — moduli stampabili standard (come i formulari vuoti di
// Turnivo) + ARCHIVIO personalizzato: carichi i tuoi formulari (PDF,
// Word, Excel ≤2MB), li organizzi in cartelle nominabili per settore,
// li apri/stampi (PDF direttamente, Word/Excel in download) e li elimini.
// ================================================================
let _pianoFormulariCache = [];
async function _renderPianoFormulariTab() {
  _pianoFormulariCache =
    (await secGet('piano_formulari?reparto_dip=eq.' + _pianoReparto() + '&order=cartella.asc,nome.asc&limit=500')) ||
    [];
  const puoMod = puoGestirePiano() || isAdmin();
  const riga = (titolo, desc, onclick, etichetta) =>
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:260px"><b>' +
    titolo +
    '</b><br><span style="font-size:.8rem;color:var(--muted)">' +
    desc +
    '</span></div><button class="btn-export" style="font-size:.82rem;padding:5px 14px" onclick="' +
    onclick +
    '">' +
    (etichetta || 'Stampa PDF') +
    '</button></div>';
  let h = '<div class="main-card"><div class="card-header">Moduli standard</div><div style="padding:6px 16px 14px">';
  h += riga(
    'Richiesta cambio turno (modulo vuoto)',
    'Da compilare a mano e far firmare: collaboratori A e B, motivazione, autorizzazione.',
    'pdfCambioTurnoVuoto()',
  );
  h += riga(
    'Richiesta cambio vacanza (modulo vuoto)',
    'Scambio di settimana di vacanza tra due collaboratori, con firme e autorizzazione.',
    'pdfCambioVacanza()',
  );
  h += riga(
    'Lista di non disponibilità (Jolly)',
    'Modulo ufficiale HR 1187: i jolly indicano i giorni del mese in cui non sono disponibili (da consegnare entro il 3° giorno del mese).',
    'pdfNonDisponibilitaJolly()',
  );
  const rigaProtocollo = (titolo, nomeOriginale, chiave) =>
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:260px"><b>' +
    titolo +
    '</b><br><span style="font-size:.8rem;color:var(--muted)">Modulo ufficiale Word da stampare/compilare. In alternativa, la versione Excel si compila al computer e si reimporta in Formazione per la certificazione automatica.</span></div>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 14px;border-color:#1a4a7a;color:#1a4a7a" onclick="apriFormularioPerNome(\'' +
    nomeOriginale.replace(/'/g, "\\'") +
    '\')">Scarica Word (originale)</button>' +
    '<button class="btn-export" style="font-size:.78rem;padding:4px 10px" onclick="pianoScaricaProtocollo(\'' +
    chiave +
    '\')">Excel per import</button></div>';
  h += rigaProtocollo(
    'Protocollo formazione — Slot Attendant',
    'Formazione Slot Attendant nuovi impiegati (originale)',
    'sala',
  );
  h += rigaProtocollo(
    'Protocollo formazione — Reception',
    'Formazione Reception nuovi impiegati (originale)',
    'reception',
  );
  h += rigaProtocollo('Protocollo formazione — Cassa', 'Protocollo Formazione Cassa (originale)', 'cassa');
  h += '</div></div>';

  // ARCHIVIO personalizzato
  h +=
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">I tuoi formulari — ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (' +
    _pianoFormulariCache.length +
    ')';
  if (puoMod)
    h +=
      '<button class="btn-export" style="font-size:.78rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'form-arch-file\').click()">Carica formulario</button>' +
      '<input type="file" id="form-arch-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" style="display:none" onchange="caricaFormulario(this)">';
  h += '</div><div style="padding:6px 16px 14px">';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-bottom:8px">PDF, Word ed Excel fino a 2 MB, organizzati in cartelle per settore. I PDF si aprono e stampano direttamente; Word ed Excel si scaricano e si stampano dal programma.</p>';
  if (!_pianoFormulariCache.length) h += '<p style="color:var(--muted);padding:8px 0">Nessun formulario caricato.</p>';
  const perCartella = {};
  _pianoFormulariCache.forEach(
    (f) => (perCartella[f.cartella || 'Generale'] = (perCartella[f.cartella || 'Generale'] || []).concat(f)),
  );
  Object.keys(perCartella)
    .sort()
    .forEach((cart) => {
      h +=
        '<div style="margin:10px 0 4px;font-weight:700;font-size:.9rem">📁 ' +
        escP(cart) +
        ' <span style="font-weight:400;color:var(--muted)">(' +
        perCartella[cart].length +
        ')</span></div>';
      perCartella[cart].forEach((f) => {
        const icona = f.mime === 'application/pdf' ? '📄' : f.mime && f.mime.includes('sheet') ? '📊' : '📝';
        h +=
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0 6px 14px;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:220px">' +
          icona +
          ' ' +
          escP(f.nome) +
          ' <span style="font-size:.72rem;color:var(--muted)">(' +
          Math.round((f.dimensione || 0) / 1024) +
          ' KB)</span></span>' +
          '<button class="btn-export" style="font-size:.76rem;padding:3px 10px" onclick="apriFormulario(' +
          f.id +
          ')">' +
          (f.mime === 'application/pdf' ? 'Apri / Stampa' : 'Scarica') +
          '</button>' +
          (puoMod
            ? '<button class="btn-export" style="font-size:.76rem;padding:3px 10px;border-color:#1a4a7a;color:#1a4a7a" onclick="rinominaFormulario(' +
              f.id +
              ')">Rinomina/Sposta</button><button class="btn-export" style="font-size:.76rem;padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFormulario(' +
              f.id +
              ')">Elimina</button>'
            : '') +
          '</div>';
      });
    });
  h += '</div></div>';
  return h;
}
function pianoScaricaProtocollo(k) {
  if (typeof scaricaProtocolloExcel === 'function') scaricaProtocolloExcel(k);
}
async function apriFormularioPerNome(nome) {
  let f = _pianoFormulariCache.find((x) => x.nome === nome);
  if (!f) {
    const r = await secGet('piano_formulari?nome=eq.' + encodeURIComponent(nome));
    f = r && r[0];
    if (f) _pianoFormulariCache.push(f);
  }
  if (!f) {
    toast('Originale non trovato nell\'archivio: caricalo con "Carica formulario"');
    return;
  }
  apriFormulario(f.id);
}
async function caricaFormulario(input) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('File troppo grande (max 2 MB)');
    return;
  }
  const cartella = (prompt('Cartella (es. Cambi, Formazione, HR...):', 'Generale') || '').trim();
  if (cartella === '') return;
  const nome = (prompt('Nome del formulario:', file.name.replace(/\.[^.]+$/, '')) || '').trim();
  if (!nome) return;
  try {
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    const b64 = btoa(bin);
    const r = await secPost('piano_formulari', {
      nome: nome,
      cartella: cartella,
      mime: file.type || 'application/octet-stream',
      estensione: (file.name.split('.').pop() || '').toLowerCase(),
      dimensione: file.size,
      contenuto: b64,
      reparto_dip: _pianoReparto(),
      operatore: getOperatore(),
    });
    if (r && r[0]) _pianoFormulariCache.push(r[0]);
    logAzione('Formulario caricato', nome + ' (' + cartella + ')');
    toast('Formulario "' + nome + '" caricato');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore caricamento formulario');
  }
}
async function apriFormulario(id) {
  let f = _pianoFormulariCache.find((x) => x.id === id);
  if (f && !f.contenuto) f = null;
  if (!f) {
    const r = await secGet('piano_formulari?id=eq.' + id);
    f = r && r[0];
  }
  if (!f) return;
  try {
    const bin = atob(f.contenuto);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: f.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if (f.mime === 'application/pdf') {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = f.nome + (f.estensione ? '.' + f.estensione : '');
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast('Errore apertura formulario');
  }
}
async function rinominaFormulario(id) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const f = _pianoFormulariCache.find((x) => x.id === id);
  if (!f) return;
  const nome = (prompt('Nome:', f.nome) || '').trim();
  if (!nome) return;
  const cartella = (prompt('Cartella:', f.cartella || 'Generale') || '').trim() || 'Generale';
  try {
    await secPatch('piano_formulari', 'id=eq.' + id, { nome: nome, cartella: cartella });
    f.nome = nome;
    f.cartella = cartella;
    logAzione('Formulario rinominato', nome + ' (' + cartella + ')');
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
async function eliminaFormulario(id) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const f = _pianoFormulariCache.find((x) => x.id === id);
  if (!f || !confirm('Eliminare il formulario "' + f.nome + '"?')) return;
  try {
    await secDel('piano_formulari', 'id=eq.' + id);
    _pianoFormulariCache = _pianoFormulariCache.filter((x) => x.id !== id);
    logAzione('Formulario eliminato', f.nome);
    toast('Formulario eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
// LISTA DI NON DISPONIBILITÀ (JOLLY) — replica del modulo ufficiale
// HR 1187 del Casinò (giorni 1-31 con casella e osservazioni, firme)
async function pdfNonDisponibilitaJolly() {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 16;
  let y = 14;
  // intestazione documento ufficiale
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(140, 20, 50);
  doc.text('CASINÒ LUGANO', M, y);
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Data: ' + new Date().toLocaleDateString('it-IT'), 150, y - 2);
  doc.text('Red.  O. Sampietro', 150, y + 2);
  doc.text('Appr. Direttore', 150, y + 6);
  y += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(9);
  doc.text('4 - Human Resources', M, y);
  y += 4.5;
  doc.setFont('helvetica', 'italic');
  doc.text('1187 - LISTA NON DISPONIBILITA JOLLY', M + 6, y);
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(34, 34, 34);
  doc.text('LISTA DI NON DISPONIBILITÀ (JOLLY)', 105, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8.5);
  doc.text('- da trasmettere al massimo entro il 3° giorno del mese al Responsabile di settore -', 105, y, {
    align: 'center',
  });
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Nome e Cognome: ' + '.'.repeat(95), M, y);
  y += 7;
  doc.text('Mese di riferimento: ' + '.'.repeat(92), M, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('vi informo che NON sarò disponibile per la pianificazione durante i giorni seguenti.', M, y);
  y += 8;
  doc.setFontSize(8.5);
  doc.text('Giorno', M, y);
  doc.text('Non sarò disponibile', M + 14, y);
  doc.text('Eventuali osservazioni', M + 55, y);
  doc.setDrawColor(51, 51, 51);
  doc.line(M, y + 1.2, 194, y + 1.2);
  y += 5.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (let g = 1; g <= 31; g++) {
    doc.text(String(g), M + 2, y);
    doc.setLineWidth(0.3);
    doc.rect(M + 20, y - 2.6, 3.2, 3.2); // casella
    doc.setTextColor(120, 120, 120);
    doc.text('.'.repeat(118), M + 40, y);
    doc.setTextColor(34, 34, 34);
    y += 5.55;
  }
  y += 4;
  doc.setFontSize(9);
  doc.text('Firma collaboratore (Jolly): ' + '.'.repeat(75), M, y);
  y += 8;
  doc.text('Data: ' + '.'.repeat(24), M, y);
  doc.text('Visto Resp. Settore: ' + '.'.repeat(35), 105, y);
  mostraPdfPreview(doc, 'non_disponibilita_jolly.pdf', 'Lista non disponibilità Jolly');
}

// Modulo VUOTO di richiesta cambio turno (come cambio_turno_pdf_vuoto di Turnivo)
async function pdfCambioTurnoVuoto() {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const linea = '___________________________________________';
  const doc = _pdfCambioTurno({
    tipo: 'SCAMBIO',
    data: '____/____/________',
    a: { nome: linea, settore: '', turno: '_____', orari: '' },
    b: { nome: linea, settore: '', turno: '_____', orari: '' },
    motivo: linea + '___________________',
    richiesto: '',
  });
  mostraPdfPreview(doc, 'cambio_turno_vuoto.pdf', 'Formulario cambio turno');
}

function _renderPianoGuidaTab() {
  const sez = (titolo, righe) =>
    '<div class="main-card" style="margin-top:12px"><div class="card-header">' +
    titolo +
    '</div><div style="padding:10px 16px;font-size:.9rem;line-height:1.55">' +
    righe.map((r) => '<p style="margin:4px 0">• ' + r + '</p>').join('') +
    '</div></div>';
  let h = '';
  h += sez('Briefing', [
    'La data parte da <b>domani</b> (frecce o calendario per cambiarla). <b>Compila dal piano</b> riempie nomi e turni del giorno; ogni cella è modificabile e ogni riga ha + (inserisci sotto), le frecce per riordinare e × per eliminare. Tutto si salva da solo: una versione per data, rigenerare sovrascrive.',
    'Le colonne <b>E</b> e <b>U</b> restano vuote: si spuntano <b>a penna</b> sul foglio stampato il giorno dopo, per confermare le timbrature di entrata e uscita.',
    '<b>Genera pause</b> crea la distribuzione: per Slots usa i tuoi schemi (distributori S1/S22, S3, S7C…), per Valet e gli altri reparti il motore automatico (durata pause per fascia, minimo 45 minuti fra le pause, mai due in pausa insieme, ven/sab evita la fascia 23–01). Anche le pause sono modificabili cella per cella, con inserimento/eliminazione righe.',
    'In fondo alla card Pause trovi <b>Regole — turni, orari e pause spettanti</b>: la tabella mostra la pausa di ogni turno e puoi personalizzarla per singolo turno (es. S3 = 15+15) o per fascia di durata. Gli orari dei turni si cambiano nella tab Turni e tutto si aggiorna da solo.',
    '<b>Stampa briefing</b> e <b>Stampa pause</b> generano i PDF A4 da appendere/firmare; <b>Importa da Excel</b> legge nomi e turni da un foglio esistente.',
  ]);
  h += sez('Calendario', [
    '<b>Clicca una cella</b> e scrivi direttamente la sigla del turno (Invio salva, Esc annulla, vuoto elimina). Le sigle inesistenti vengono rifiutate.',
    '<b>Tasto destro</b> (o pressione lunga sul tablet) su una cella: modifica, commento, cambio turno con collega (con eventuale restituzione), cambio per esigenze operative, rimozione, stampa.',
    "L'<b>icona rossa</b> prima del nome stampa il piano del collaboratore in PDF; i nomi si possono <b>riordinare trascinandoli</b> (pulsante Ordine predefinito per tornare a SUP, BO, poi gli altri).",
    "Clicca l'intestazione di un giorno per evidenziare la colonna su tutte le tabelle; clicca un nome per evidenziare la riga.",
    'Bordo rosso = cella protetta (inserita a mano); triangolo = commento; M gialla = malattia dal Diario (automatica).',
    '<b>Genera bozza</b>: applica prima le vacanze (V + congedi C + WD), poi riempie il fabbisogno rispettando tutte le regole. <b>Valida regole</b> elenca le violazioni. <b>Cancella piano</b> rimuove le celle non protette (o tutte).',
    'Sotto la griglia: <b>Fabbisogno vs assegnati</b> (clicca una cella per impostare le persone necessarie, import da Excel), <b>Differenze</b> (verde surplus, rosso carenza) ed <b>Effettivi</b>.',
    'Colonne finali: Ore (solo turni), D/N (diurni/notturni), OD (ore dovute), OP (ore pianificate), SM (saldo mese), YTD (saldo da inizio anno).',
  ]);
  h += sez('Vacanze', [
    'Le vacanze sono <b>settimane intere</b> (lun-dom) per collaboratore per anno, con spunta di conferma.',
    '<b>Applica al piano</b> scrive le V (protette) del mese e i congedi C prima (1 per i fissi, 2 per i jolly) e dopo (in base alla percentuale: 100%→1, 80%→2, 60%→3, 40%→4), più i WD (giorni a turno diurno obbligato prima della vacanza). Anche Genera bozza lo fa da sola.',
    'Import da Excel formato Turnivo (colonna A cognome, B nome, colonne F-BE con X sulle settimane).',
    '<b>Formulario cambio vacanza</b> stampa il modulo vuoto da far firmare.',
  ]);
  h += sez('Turni, Codici e Regole', [
    '<b>Turni</b>: orari, ore, tipo (diurno/notturno), colore della sigla nel piano — tutto modificabile; nuovi turni con + Aggiungi.',
    "<b>Codici speciali</b> (V, M, C, ...): ore CCL, Scala % = le ore seguono la percentuale d'impiego, Riposo = conta come giorno di riposo.",
    '<b>Regole del piano</b>: le regole HARD/SOFT con i pesi (max consecutivi, riposo 11h, 4+1+1, L1 solo BO/SUP, congedi C, ...).',
    '<b>Regole di gruppo</b>: chi può lavorare in ogni settore (es. SUP richiesto nel gruppo SUP, niente notturni in BO, massimo 1 SUP al giorno in BO, almeno 1 SUP nei notturni di venerdì e sabato in SALA).',
  ]);
  h += sez('Timbrature e Saldo', [
    "Timbrature a mano, da file della timbratrice, o <b>in automatico</b> con lo script collegato alla timbratrice (chiedere all'IT).",
    'Clicca un collaboratore nel confronto per il dettaglio giorno per giorno (entrata, uscita, ore effettive vs pianificate).',
    'Nel <b>Saldo</b> le ore lavorate sono le timbrate quando esistono, altrimenti il piano. YTD = cumulato da gennaio.',
  ]);
  h += sez('Festivi, Statistiche, Storico, Impostazioni', [
    "I <b>festivi italiani</b> si generano da soli per ogni anno (Lunedì dell'Angelo calcolato dalla Pasqua); si possono aggiungere date manuali.",
    "<b>Statistiche</b>: totali per collaboratore sull'anno e panoramica dei 12 mesi.",
    '<b>Storico</b>: chi ha modificato cosa e quando, filtrabile per azione.',
    '<b>Impostazioni</b>: export/import dati e template, turni per funzione (mappature), preferenze collaboratori (solo diurni, turni bloccati, preferisce L1, accoglienza, accompagnamento), ore settimanali del contratto.',
  ]);
  h += sez('Import dai file Excel reali', [
    'Nella tab Calendario, <b>Importa piano</b> legge direttamente il file <b>PIANO SLOTS/VALET 2026.xlsx</b>: riconosce da solo il foglio del mese selezionato, le colonne dei giorni e i nomi (anche con maiuscole o piccoli refusi). Le celle esistenti non vengono toccate.',
    'Se nel file ci sono <b>collaboratori nuovi</b> li crea (funzione e percentuale lette dal file); quelli <b>disattivati ma presenti</b> te li propone da riattivare; quelli <b>attivi ma assenti dal file</b> te li propone da disattivare. Ogni passo ha la sua conferma.',
    'Nella tab Calendario (fabbisogno), <b>Importa fabbisogno</b> legge la sezione <b>PIANIFICAZIONE</b> del foglio del mese dello stesso file e SOSTITUISCE il fabbisogno del mese. Funziona anche col formato semplice (turno + giorni).',
  ]);
  h += sez('Formulari e CGF', [
    'La tab <b>Formulari</b> raccoglie i moduli standard (cambio turno, cambio vacanza, non-disponibilità jolly 1187, protocolli formazione) e un archivio per cartelle dove caricare Word/PDF/Excel, rinominarli e stamparli.',
    'I <b>CGF</b> sono automatici: chi lavora un festivo (con flag CGF) matura il compenso e la bozza glielo piazza nel primo buco dopo il festivo; i crediti passano ai mesi successivi, anche a cavallo d&#39;anno. Il conteggio maturati/goduti/saldo è nelle Statistiche.',
  ]);
  h += sez('Permessi e sicurezza', [
    'La sezione Piano si può nascondere o limitare da Impostazioni del Diario → Visibilità.',
    'Ogni modifica è protetta dal login operatore e registrata nello Storico.',
  ]);
  return h;
}

function _renderPianoRegoleGruppoCard() {
  if (!isAdmin()) return '';
  const gruppi = [...new Set(pianoTurniCache.map((t) => (t.gruppo || '').toUpperCase()).filter(Boolean))].sort();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole di gruppo (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Regole di idoneità per settore/gruppo, come in Turnivo: chi può lavorare in un gruppo, limiti e minimi per funzione. Applicate dalla bozza automatica e dal validatore.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:680px;font-size:.85rem"><thead><tr><th>Gruppo</th><th style="text-align:left">Regola</th><th style="text-align:left">Valore</th><th>Attiva</th><th></th></tr></thead><tbody>';
  pianoRegoleGruppoCache
    .filter((r) => (r.reparto_dip || 'slots') === _pianoReparto())
    .sort((a, b) => (a.gruppo || '').localeCompare(b.gruppo || '') || a.id - b.id)
    .forEach((r) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(r.gruppo) +
        '</td><td style="text-align:left" title="' +
        escP(_REGOLE_GRUPPO_TIPI[r.tipo_regola] || '') +
        '">' +
        escP(r.tipo_regola) +
        '</td><td style="text-align:left"><input type="text" value="' +
        escP(r.valore || '') +
        '" onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'valore\',this.value)" style="width:170px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
        (r.attivo !== false ? ' checked' : '') +
        ' onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaRegolaGruppo(' +
        r.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Gruppo</label><select id="rg-gruppo" style="padding:8px">' +
    gruppi.map((g) => '<option>' + escP(g) + '</option>').join('') +
    '</select></div><div class="field"><label>Regola</label><select id="rg-tipo" style="padding:8px" onchange="document.getElementById(\'rg-aiuto\').textContent=_REGOLE_GRUPPO_TIPI[this.value]||\'\'" >' +
    Object.keys(_REGOLE_GRUPPO_TIPI)
      .map((t) => '<option>' + t + '</option>')
      .join('') +
    '</select></div><div class="field"><label>Valore</label><input type="text" id="rg-valore" placeholder="SUP:1" style="width:150px"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiRegolaGruppo()">+ Aggiungi regola</button></div>' +
    '<p id="rg-aiuto" style="font-size:.78rem;color:var(--muted);margin-top:4px">' +
    _REGOLE_GRUPPO_TIPI.richiede_funzione +
    '</p>';
  h += '</div></div>';
  return h;
}
async function salvaRegolaGruppo(id, campo, valore) {
  if (!isAdmin()) return;
  try {
    const patch = {};
    patch[campo] = campo === 'attivo' ? !!valore : String(valore).trim().toUpperCase();
    await secPatch('piano_regole_gruppo', 'id=eq.' + id, patch);
    const r = pianoRegoleGruppoCache.find((x) => x.id === id);
    if (r) r[campo] = patch[campo];
    logAzione('Regola gruppo modificata', (r ? r.gruppo + ' ' + r.tipo_regola : id) + ' ' + campo);
    toast('Regola aggiornata');
  } catch (e) {
    toast('Errore salvataggio regola');
  }
}
async function aggiungiRegolaGruppo() {
  if (!isAdmin()) return;
  const gruppo = (document.getElementById('rg-gruppo') || {}).value;
  const tipo = (document.getElementById('rg-tipo') || {}).value;
  const valore = ((document.getElementById('rg-valore') || {}).value || '').trim().toUpperCase();
  if (!gruppo || !tipo || !valore) {
    toast('Compila gruppo, regola e valore');
    return;
  }
  try {
    const r = await secPost('piano_regole_gruppo', {
      gruppo: gruppo,
      tipo_regola: tipo,
      valore: valore,
      attivo: true,
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoRegoleGruppoCache.push(r[0]);
    logAzione('Regola gruppo aggiunta', gruppo + ' ' + tipo + ' ' + valore);
    toast('Regola aggiunta');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta regola');
  }
}
async function eliminaRegolaGruppo(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleGruppoCache.find((x) => x.id === id);
  if (!r || !confirm('Eliminare la regola ' + r.gruppo + ' ' + r.tipo_regola + ' = ' + r.valore + '?')) return;
  try {
    await secDel('piano_regole_gruppo', 'id=eq.' + id);
    pianoRegoleGruppoCache = pianoRegoleGruppoCache.filter((x) => x.id !== id);
    logAzione('Regola gruppo eliminata', r.gruppo + ' ' + r.tipo_regola);
    toast('Regola eliminata');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione regola');
  }
}

function _renderPianoPreferenzeCard() {
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return '';
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Preferenze collaboratori — ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<input type="text" id="pref-collab-cerca" placeholder="Cerca collaboratore..." oninput="_filtraPrefCollab(this.value)" style="width:100%;max-width:260px;padding:6px 10px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);font-size:.85rem;margin-bottom:8px">';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" id="pref-collab-table" style="min-width:760px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th><th>Solo diurni</th><th style="text-align:left">Turni bloccati (CSV)</th><th title="La bozza le privilegia sui turni L1">Preferisce L1</th><th title="Livello accoglienza (0-2): serve per il gruppo ACCOGLIENZA">Accoglienza</th><th style="text-align:left" title="Gruppi dove NON può lavorare da solo (CSV, es: REC)">Accompagnamento</th><th style="text-align:left" title="Altri reparti in cui lavora (CSV, es: valet): appare anche nei loro piani e le ore si sommano">Reparti extra</th><th style="text-align:left" title="Derivati dalle competenze certificate in Formazione (sola lettura)">Settori</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    h +=
      '<tr data-pref-nome="' +
      escP(c.nome.toLowerCase()) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td>' +
      escP(c.funzione || '—') +
      '</td><td>' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</td><td><input type="checkbox"' +
      (c.solo_diurni ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'solo_diurni\',this.checked)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.turni_bloccati || '') +
      '" placeholder="Es: S8,S7C" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'turni_bloccati\',this.value)" style="width:140px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
      (c.prefers_l1 ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'prefers_l1\',this.checked)"></td><td><input type="number" min="0" max="2" value="' +
      (parseInt(c.accoglienza) || 0) +
      '" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'accoglienza\',this.value)" style="width:52px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.accompagnamento_settori || '') +
      '" placeholder="Es: REC" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'accompagnamento_settori\',this.value)" style="width:90px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.reparti_extra || '') +
      '" placeholder="Es: valet" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'reparti_extra\',this.value)" style="width:90px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left;font-size:.78rem;color:var(--muted)" title="Si gestiscono con le spunte in Formazione">' +
      escP((_pianoSettoriEffettivi(c) || []).join(', ') || '—') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.78rem;color:var(--muted);margin-top:6px">"Solo diurni" e i turni bloccati vengono rispettati dalla bozza automatica. Funzione e percentuale si modificano in Impostazioni del Diario → Gestione collaboratori; i <b>Settori</b> derivano dalle competenze certificate in <b>Formazione</b> (spunta = idoneo, sola lettura qui).</p>';
  h += '</div></div>';
  return h;
}
// filtro live della tabella preferenze (solo visivo)
function _filtraPrefCollab(testo) {
  const q = (testo || '').trim().toLowerCase();
  document.querySelectorAll('#pref-collab-table tbody tr').forEach((tr) => {
    tr.style.display = !q || (tr.dataset.prefNome || '').includes(q) ? '' : 'none';
  });
}
async function salvaPreferenzaCollab(id, campo, valore) {
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return;
  try {
    const patch = {};
    if (campo === 'solo_diurni' || campo === 'prefers_l1') patch[campo] = !!valore;
    else if (campo === 'accoglienza') patch[campo] = Math.max(0, Math.min(2, parseInt(valore) || 0));
    else patch[campo] = String(valore).trim().toUpperCase() || null;
    await secPatch('collaboratori', 'id=eq.' + id, patch);
    const c = collaboratoriCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: preferenza collaboratore', (c ? c.nome : id) + ' ' + campo);
    toast('Preferenza salvata');
  } catch (e) {
    toast('Errore salvataggio preferenza');
  }
}

// ================================================================
// STAMPA PIANO DEL SINGOLO COLLABORATORE (icona rossa prima del nome)
// + NOTA RAPIDA con tasto destro sulla cella (come Turnivo)
// ================================================================
async function stampaPianoCollaboratore(nome) {
  // PDF IDENTICO a Turnivo (template pdf_turni.html): A4 verticale,
  // intestazione con nome, tabella Data | Turno | Commenti, righe colorate
  // (weekend verde, domenica arancio, festivo rosa, con commento azzurro)
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const anno = ym.split('-')[0];
  const meseNome = MESI_FULL[parseInt(ym.split('-')[1]) - 1] || ym;
  const meseNomeLower = meseNome.toLowerCase();
  const mappa = {};
  _pianoRighe.filter((r) => r.collaboratore === nome).forEach((r) => (mappa[parseInt(r.data.split('-')[2])] = r));
  const festiviSet = {};
  pianoFestiviCache.forEach((f) => {
    if (f.data.startsWith(ym)) festiviSet[parseInt(f.data.split('-')[2])] = true;
  });
  const GG_FULL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const info = _pianoCollabInfo(nome);
  const righePdf = [];
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = ym + '-' + String(g).padStart(2, '0');
    const dow = new Date(dstr + 'T12:00:00').getDay();
    const r = mappa[g];
    const codice = r ? r.codice : '';
    const t = codice ? _pianoTurnoInfo(codice) : null;
    const cs = codice && !t ? _pianoCodiceInfo(codice) : null;
    let desc = '';
    if (t)
      desc =
        '(' +
        (t.gruppo || '') +
        ' ' +
        (t.ora_inizio || '').substring(0, 5) +
        '-' +
        (t.ora_fine || '').substring(0, 5) +
        ')';
    else if (cs) desc = '(' + (cs.descrizione || '') + ')';
    righePdf.push({
      data: GG_FULL[dow] + ' ' + g + ' ' + meseNomeLower + ' ' + anno,
      codice: codice || '-',
      desc: desc,
      commento: (r && r.commento) || '',
      fill:
        r && r.commento
          ? [187, 222, 251] // azzurro: riga con commento
          : festiviSet[g]
            ? [252, 228, 236] // rosa: festivo
            : dow === 0
              ? [255, 243, 224] // arancio: domenica
              : _pianoGiorniWeekend().includes(dow)
                ? [232, 245, 233] // verde: weekend
                : g % 2 === 0
                  ? [248, 249, 250]
                  : [255, 255, 255],
      vuoto: !codice,
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  let y = 16;
  // intestazione stile Turnivo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(26, 26, 26);
  doc.text(nome, 12, y);
  y += 3;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.6);
  doc.line(12, y, 198, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(85, 85, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('Persona:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(nome, 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Settore/Dipartimento:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(repartoLabel(_pianoReparto()) + (info && info.funzione ? ' — ' + info.funzione : ''), 45, y);
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Mese selezionato:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(meseNome, 45, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 102, 204);
  doc.text(anno, 12, y);
  doc.setTextColor(0);
  y += 4;
  doc.autoTable({
    startY: y,
    head: [['DATA', 'TURNO', 'COMMENTI']],
    body: righePdf.map((r) => [r.data, ' ', r.commento]),
    theme: 'plain',
    margin: { left: 12, right: 12 },
    styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 }, lineWidth: 0 },
    headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 75 }, 2: { cellWidth: 46 } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const r = righePdf[d.row.index];
      d.cell.styles.fillColor = r.fill;
      if (d.column.index === 0) d.cell.styles.textColor = [80, 80, 80];
      if (d.column.index === 2) {
        d.cell.styles.textColor = [102, 102, 102];
        d.cell.styles.fontStyle = 'italic';
        d.cell.styles.fontSize = 8.5;
      }
    },
    didDrawCell: (d) => {
      // colonna Turno: codice blu grassetto + descrizione grigia (come Turnivo)
      if (d.section !== 'body' || d.column.index !== 1) return;
      const r = righePdf[d.row.index];
      const x = d.cell.x + 2.5;
      const yy = d.cell.y + d.cell.height / 2 + 1.2;
      if (r.vuoto) {
        d.doc.setTextColor(170, 170, 170);
        d.doc.setFont('helvetica', 'normal');
        d.doc.setFontSize(9);
        d.doc.text('-', x, yy);
      } else {
        d.doc.setFont('helvetica', 'bold');
        d.doc.setFontSize(9);
        d.doc.setTextColor(21, 101, 192);
        d.doc.text(r.codice, x, yy);
        if (r.desc) {
          const w = d.doc.getTextWidth(r.codice);
          d.doc.setFont('helvetica', 'normal');
          d.doc.setFontSize(8.5);
          d.doc.setTextColor(85, 85, 85);
          d.doc.text(' ' + r.desc, x + w + 1, yy);
        }
      }
      d.doc.setTextColor(0);
    },
    didDrawPage: () => {
      const ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor(221, 221, 221);
      doc.setLineWidth(0.2);
      doc.line(12, ph - 12, 198, ph - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(153, 153, 153);
      doc.text(
        'Casino Lugano SA — Piano turni ' +
          meseNome +
          ' ' +
          anno +
          ' — Generato il ' +
          new Date().toLocaleDateString('it-IT') +
          ' ' +
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        105,
        ph - 8,
        { align: 'center' },
      );
      doc.setTextColor(0);
    },
  });
  logAzione('Piano collaboratore stampato', nome + ' ' + ym);
  mostraPdfPreview(doc, 'piano_' + nome.replace(/\s+/g, '_') + '_' + ym + '.pdf', 'Piano ' + nome);
}

// Nota rapida col tasto destro (senza aprire il popup completo)
async function _pianoNotaRapida(nome, dstr) {
  // IDENTICO a Turnivo (commentCell/modifica_commento): "Commento per <codice>",
  // firma automatica "- <operatore>", il commento su cella vuota crea la riga.
  if (!puoGestirePiano()) return;
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = (r && r.commento) || '';
  const v = prompt('Commento per ' + (r && r.codice ? r.codice : 'giorno ' + g) + ':', attuale);
  if (v === null) return;
  let commento = v.trim();
  const op = getOperatore();
  if (commento && !commento.endsWith('- ' + op)) commento = commento + ' - ' + op;
  try {
    if (!r) {
      if (!commento) return;
      const nuovo = await secPost('piano', {
        collaboratore: nome,
        data: dstr,
        codice: '',
        protetto: false,
        generato: false,
        commento: commento,
        reparto_dip: _pianoReparto(),
        operatore: op,
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    } else {
      await secPatch('piano', 'id=eq.' + r.id, {
        commento: commento || null,
        operatore: op,
        updated_at: new Date().toISOString(),
      });
      r.commento = commento;
    }
    if (commento) logAzione('Piano: commento', nome + ' ' + dstr + ': "' + commento + '"');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio nota');
  }
}

// ================================================================
// MENU CONTESTUALE (tasto destro) — come Turnivo cap. 17.4:
// Modifica turno / Commento / Cambia turno con... / Cambio per
// esigenze / Stampa piano collaboratore
// ================================================================
let _pianoCtxSel = null; // {nome, data}

function mostraPianoCtx(e, nome, dstr) {
  _pianoCtxSel = { nome: nome, data: dstr };
  let menu = document.getElementById('piano-ctx');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'piano-ctx';
    document.body.appendChild(menu);
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('#piano-ctx')) nascondiPianoCtx();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') nascondiPianoCtx();
    });
  }
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const haTurno = r && _pianoTurnoInfo(r.codice);
  const puoMod = puoGestirePiano();
  let h = '';
  const voce = (label, icona, azione, attiva) =>
    attiva
      ? '<div class="piano-ctx-item" onclick="' + azione + '"><i class="icx ' + icona + '"></i> ' + label + '</div>'
      : '';
  h += voce('Modifica turno', 'icx-modifica', "pianoCtxAzione('modifica')", puoMod);
  if (r && (r.commento || '').trim()) {
    h += voce('Modifica commento', 'icx-penna', "pianoCtxAzione('nota')", puoMod);
    h += voce('Elimina commento', 'icx-cestino', "pianoCtxAzione('commentoElimina')", puoMod);
  } else {
    h += voce('Aggiungi commento', 'icx-penna', "pianoCtxAzione('nota')", puoMod && !!r);
  }
  h += voce(
    'Colore cella' + (r && r.colore ? ' (attivo)' : ''),
    'icx-penna',
    "pianoCtxAzione('colore')",
    puoMod && !!r,
  );
  h += voce('Cambia turno con...', 'icx-refresh', "pianoCtxAzione('scambio')", puoMod && !!haTurno);
  h += voce('Cambio per esigenze', 'icx-settings', "pianoCtxAzione('esigenze')", puoMod && !!haTurno);
  h += voce('Rimuovi cella', 'icx-cestino', "pianoCtxAzione('rimuovi')", puoMod && !!r);
  h += voce('Copia cella', 'icx-modifica', "pianoCtxAzione('copia')", !!r);
  h += voce(
    'Copia blocco selezionato',
    'icx-modifica',
    "pianoCtxAzione('copiaBlocco')",
    !!(window._pianoBlocco && window._pianoBlocco.completo),
  );
  h += voce('Incolla qui (Excel/blocco)', 'icx-refresh', "pianoCtxAzione('incolla')", puoMod);
  const nascN = _pianoNascosti();
  const conBlocco = !!(window._pianoBlocco && window._pianoBlocco.completo);
  h += voce('Nascondi riga (' + escP(nome.split(' ')[0]) + ')', 'icx-settings', "pianoCtxAzione('nascondiRiga')", true);
  h += voce(
    'Nascondi giorno ' + parseInt(dstr.split('-')[2]),
    'icx-settings',
    "pianoCtxAzione('nascondiGiorno')",
    true,
  );
  h += voce('Nascondi righe selezionate', 'icx-settings', "pianoCtxAzione('nascondiRigheSel')", conBlocco);
  h += voce('Nascondi giorni selezionati', 'icx-settings', "pianoCtxAzione('nascondiGiorniSel')", conBlocco);
  h += voce(
    'Mostra nascosti (' + (nascN.nomi.length + nascN.giorni.length) + ')',
    'icx-refresh',
    'pianoMostraNascosti()',
    nascN.nomi.length + nascN.giorni.length > 0,
  );
  h += voce('Stampa piano di ' + escP(nome.split(' ')[0]), 'icx-stampa', "pianoCtxAzione('stampa')", true);
  menu.innerHTML =
    '<div class="piano-ctx-head">' +
    escP(nome) +
    ' — ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    (r ? ' (' + escP(r.codice) + ')' : '') +
    '</div>' +
    h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
function nascondiPianoCtx() {
  const menu = document.getElementById('piano-ctx');
  if (menu) menu.style.display = 'none';
}
// Tasto destro sul NOME del collaboratore: menu della riga (nascondi, stampa...)
function mostraPianoCtxNome(e, nome) {
  e.preventDefault();
  _pianoCtxSel = { nome: nome, data: _pianoMeseSel + '-01' };
  let menu = document.getElementById('piano-ctx');
  if (!menu) {
    mostraPianoCtx(e, nome, _pianoMeseSel + '-01');
    _pianoCtxSel = { nome: nome, data: _pianoMeseSel + '-01' };
  }
  menu = document.getElementById('piano-ctx');
  const voce = (label, icona, azione, attiva) =>
    attiva
      ? '<div class="piano-ctx-item" onclick="' + azione + '"><i class="icx ' + icona + '"></i> ' + label + '</div>'
      : '';
  const nasc = _pianoNascosti();
  const conBlocco = !!(window._pianoBlocco && window._pianoBlocco.completo);
  let h = '';
  h += voce('Nascondi riga (' + escP(nome.split(' ')[0]) + ')', 'icx-settings', "pianoCtxAzione('nascondiRiga')", true);
  h += voce('Nascondi righe selezionate', 'icx-settings', "pianoCtxAzione('nascondiRigheSel')", conBlocco);
  h += voce(
    'Mostra nascosti (' + (nasc.nomi.length + nasc.giorni.length) + ')',
    'icx-refresh',
    'pianoMostraNascosti()',
    nasc.nomi.length + nasc.giorni.length > 0,
  );
  h += voce('Stampa piano di ' + escP(nome.split(' ')[0]), 'icx-stampa', "pianoCtxAzione('stampa')", true);
  menu.innerHTML = '<div class="piano-ctx-head">' + escP(nome) + '</div>' + h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 10) + 'px';
}
function pianoCtxAzione(azione) {
  nascondiPianoCtx();
  const sel = _pianoCtxSel;
  if (!sel) return;
  if (azione === 'modifica') {
    const tr = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(sel.nome) + '"]');
    const cel = tr ? tr.querySelector('td[data-g="' + parseInt(sel.data.split('-')[2]) + '"]') : null;
    if (cel) pianoCellaInline(sel.nome, sel.data, cel);
    else pianoCellaPrompt(sel.nome, sel.data);
  } else if (azione === 'nota') _pianoNotaRapida(sel.nome, sel.data);
  else if (azione === 'commentoElimina') {
    (async () => {
      const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
      if (!r || !confirm('Eliminare il commento di ' + sel.nome + ' del ' + sel.data + '?')) return;
      try {
        await secPatch('piano', 'id=eq.' + r.id, { commento: null });
        r.commento = null;
        logAzione('Piano: commento eliminato', sel.nome + ' ' + sel.data);
        toast('Commento eliminato');
        renderPiano();
      } catch (e) {
        toast('Errore eliminazione commento');
      }
    })();
  } else if (azione === 'colore') {
    // seleziona la cella e apre la palette in alto (stessa di Excel)
    const tr = document.querySelector('#piano-content .piano-table tbody tr[data-nome="' + CSS.escape(sel.nome) + '"]');
    const cel = tr ? tr.querySelector('td[data-g="' + parseInt(sel.data.split('-')[2]) + '"]') : null;
    if (cel) {
      _pianoBloccoPulisci();
      window._pianoBlocco = { tab: 'piano', t1: cel, t2: cel, completo: true };
      _pianoBloccoEvidenzia();
    }
    pianoColoriToggle();
  } else if (azione === 'nascondiRiga') pianoNascondiRighe([sel.nome]);
  else if (azione === 'nascondiGiorno') pianoNascondiGiorni([parseInt(sel.data.split('-')[2])]);
  else if (azione === 'nascondiRigheSel' || azione === 'nascondiGiorniSel') {
    const b = window._pianoBlocco;
    if (!b || !b.completo) return;
    if (azione === 'nascondiRigheSel') {
      const nomi = [
        ...new Set(
          _pianoBloccoCelle()
            .map((r) => (r[0] && r[0].closest('tr') ? r[0].closest('tr').dataset.nome : null))
            .filter(Boolean),
        ),
      ];
      if (nomi.length) pianoNascondiRighe(nomi);
      else toast('La selezione non è sulla griglia dei collaboratori');
    } else {
      let g1 = parseInt(b.t1.dataset.g);
      let g2 = parseInt(b.t2.dataset.g);
      if (g1 > g2) [g1, g2] = [g2, g1];
      const gg = [];
      for (let g = g1; g <= g2; g++) gg.push(g);
      pianoNascondiGiorni(gg);
    }
  } else if (azione === 'stampa') stampaPianoCollaboratore(sel.nome);
  else if (azione === 'scambio') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    apriScambioTurno();
  } else if (azione === 'esigenze') apriCambioEsigenze(sel.nome, sel.data);
  else if (azione === 'copia') {
    const r2 = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
    if (r2) navigator.clipboard.writeText(r2.codice).then(() => toast('Copiato: ' + r2.codice));
  } else if (azione === 'copiaBlocco') pianoCopiaBlocco();
  else if (azione === 'incolla') pianoIncollaDaClipboard(sel);
  else if (azione === 'rimuovi') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    if (
      confirm(
        'Rimuovere la cella di ' +
          sel.nome +
          ' del ' +
          new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
          '?',
      )
    )
      rimuoviPianoCella(true);
  }
}

// Cambio per esigenze operative (come Turnivo): il turno della cella viene
// sostituito con un altro, con commento automatico "Ex <vecchio>" e PDF firma
function apriCambioEsigenze(nome, dstr) {
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  if (!r || !_pianoTurnoInfo(r.codice)) return;
  _pianoCtxSel = { nome: nome, data: dstr };
  const turni = _pianoTurniReparto().filter((t) => t.codice !== r.codice);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Cambio per esigenze operative</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(nome) +
    '</strong> — ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    ' — turno attuale: <strong>' +
    escP(r.codice) +
    '</strong></p>' +
    '<div class="field" style="text-align:left"><label>Nuovo turno</label><select id="esig-turno" style="width:100%;padding:10px">' +
    turni
      .map(
        (t) =>
          '<option value="' +
          escP(t.codice) +
          '">' +
          escP(t.codice) +
          ' (' +
          (t.ora_inizio || '').substring(0, 5) +
          '-' +
          (t.ora_fine || '').substring(0, 5) +
          ')</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Motivazione</label><input type="text" id="esig-motivo" placeholder="Es: copertura cassa, evento speciale..."></div>' +
    '<div class="pwd-modal-btns" style="margin-top:14px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="confermaCambioEsigenze()">Cambia turno</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function confermaCambioEsigenze() {
  const sel = _pianoCtxSel;
  const nuovo = (document.getElementById('esig-turno') || {}).value;
  const motivo = ((document.getElementById('esig-motivo') || {}).value || '').trim();
  document.getElementById('pwd-modal').classList.add('hidden');
  if (!sel || !nuovo) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  if (!r) return;
  const vecchio = r.codice;
  try {
    await secPatch('piano', 'id=eq.' + r.id, {
      codice: nuovo,
      protetto: true,
      commento: (
        (vecchio ? 'Ex ' + vecchio + ' - ' : '') +
        'cambio per esigenze operative - ' +
        getOperatore()
      ).substring(0, 400),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    r.codice = nuovo;
    r.protetto = true;
    logAzione('Piano: cambio per esigenze', sel.nome + ' ' + sel.data + ': ' + vecchio + ' -> ' + nuovo);
    toast('Turno cambiato: ' + vecchio + ' -> ' + nuovo);
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const tv = _pianoTurnoInfo(vecchio);
      const tn = _pianoTurnoInfo(nuovo);
      const fmtOra = (t) =>
        t
          ? '(' +
            (t.ora_inizio || '').substring(0, 5) +
            '-' +
            (t.ora_fine || '').substring(0, 5) +
            ', ' +
            (t.gruppo || '') +
            ')'
          : '';
      const doc = _pdfCambioTurno({
        tipo: 'ESIGENZE',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: vecchio, orari: fmtOra(tv) },
        nuovoTurno: nuovo,
        nuovoOrari: fmtOra(tn),
        motivo: motivo,
        richiesto: getOperatore(),
      });
      mostraPdfPreview(doc, 'cambio_esigenze_' + sel.data + '.pdf', 'Cambio per esigenze ' + sel.data);
    }
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore cambio turno');
  }
}

// ================================================================
// MODIFICA RAPIDA STILE TURNIVO: click sulla cella = prompt in cui
// si scrive direttamente il codice (S22, V, C...). Vuoto = rimuovi.
// La finestra completa resta nel menu del tasto destro.
// ================================================================
// Salvataggio cella (regole Turnivo: vuoto elimina senza conferma, nessuna
// validazione del codice, commento conservato, cella protetta)
async function pianoSalvaCella(nome, dstr, codice) {
  if (!puoGestirePiano()) return false;
  // sigla inesistente (né turno né codice speciale) = errore, niente salvataggio
  // (solo a config caricata: con le cache vuote non si blocca nulla)
  if (
    codice &&
    (pianoTurniCache.length || pianoCodiciCache.length) &&
    !_pianoTurnoInfo(codice) &&
    !_pianoCodiceInfo(codice)
  ) {
    toast('Errore: la sigla "' + codice + '" non esiste (né turno né codice speciale)');
    return false;
  }
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = r ? r.codice : '';
  _pianoCellaSel = { nome: nome, data: dstr };
  // codici con orario personalizzato (es. JG): chiedi inizio e fine
  let orarioJG = null;
  const csOr = codice ? _pianoCodiceInfo(codice) : null;
  if (csOr && csOr.richiede_orario) {
    const ini = prompt('Orario di INIZIO per ' + codice + ' (es. 10:00):', (r && r.ora_inizio) || '10:00');
    if (ini === null) return;
    const fin = prompt('Orario di FINE per ' + codice + ' (es. 18:00):', (r && r.ora_fine) || '18:00');
    if (fin === null) return;
    const okOra = (v) => /^\d{1,2}[:.]\d{2}$/.test(String(v).trim());
    if (!okOra(ini) || !okOra(fin)) {
      toast('Orario non valido (usa hh:mm)');
      return;
    }
    orarioJG = { ora_inizio: String(ini).trim().replace('.', ':'), ora_fine: String(fin).trim().replace('.', ':') };
  }
  try {
    if (!codice) {
      if (r) {
        await secDel('piano', 'id=eq.' + r.id);
        _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
        logAzione('Piano: turno rimosso', nome + ' ' + dstr + ' (era ' + attuale + ')');
        renderPiano();
      }
      return;
    }
    if (codice === attuale) return;
    if (r) {
      await secPatch('piano', 'id=eq.' + r.id, {
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
      r.codice = codice;
      r.protetto = true;
      r.ora_inizio = orarioJG ? orarioJG.ora_inizio : null;
      r.ora_fine = orarioJG ? orarioJG.ora_fine : null;
    } else {
      const nuovo = await secPost('piano', {
        collaboratore: nome,
        data: dstr,
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    }
    logAzione('Piano modificato', nome + ' ' + dstr + ' → ' + codice);
    renderPiano();
    // formazione: avvisa se il collaboratore non risulta formato per il settore
    const gNF = _pianoGruppoNonFormato(nome, codice, '');
    if (gNF) setTimeout(() => _pianoProponiCertificazione(nome, gNF), 300);
  } catch (e) {
    console.error(e);
    toast('Errore salvataggio piano');
  }
}
async function pianoCellaPrompt(nome, dstr) {
  // usato dal menu contestuale quando la cella non è raggiungibile
  if (!puoGestirePiano()) return;
  const g = parseInt(dstr.split('-')[2]);
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const v = prompt('Turno per giorno ' + g + ' (vuoto per rimuovere):', r ? r.codice : '');
  if (v === null) return;
  await pianoSalvaCella(nome, dstr, v.trim().toUpperCase());
}
// Modifica INLINE: click sulla cella = si scrive direttamente lì (niente finestra)
function pianoCellaInline(nome, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('piano', el);
    return;
  }
  if (!puoGestirePiano() || !el || el.querySelector('input')) return;
  _pianoBloccoPulisci();
  const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
  const attuale = r ? r.codice : '';
  const vecchio = el.innerHTML;
  el.innerHTML =
    '<input type="text" value="' +
    escP(attuale) +
    '" size="1" maxlength="6" style="width:100%;min-width:0;box-sizing:border-box;border:1px solid #1a4a7a;border-radius:0;padding:0;margin:0;font:inherit;font-weight:700;text-transform:uppercase;text-align:center;background:transparent;color:inherit">';
  const inp = el.querySelector('input');
  inp.focus();
  inp.select();
  let chiuso = false;
  const conferma = async () => {
    if (chiuso) return;
    chiuso = true;
    const v = inp.value.trim().toUpperCase();
    if (v === attuale) {
      el.innerHTML = vecchio;
      return;
    }
    const ok = await pianoSalvaCella(nome, dstr, v);
    if (ok === false) el.innerHTML = vecchio;
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      conferma();
    } else if (e.key === 'Escape') {
      chiuso = true;
      el.innerHTML = vecchio;
    }
  });
  inp.addEventListener('click', (e) => e.stopPropagation());
  inp.addEventListener('blur', conferma);
}

// ============================================================
// TAB BRIEFING — briefing giornaliero + pause (da Excel Musa)
// Una riga piano_briefing per (data, reparto, sezione): il
// contenuto è tutto editabile e si salva da solo; le colonne
// E/U scrivono anche le timbrature (regola entrata anticipata).
// ============================================================
let _briefData = null;
let _briefState = null;
let _briefSaveTimer = null;
let _briefSaving = false;

function _briefDomani() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _briefGiornoLbl(dstr) {
  const d = new Date(dstr + 'T12:00:00');
  return ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'][d.getDay()];
}
function _briefIsValet() {
  return _pianoReparto() === 'valet';
}
function _briefGruppo(cod) {
  if (!cod) return 9;
  const u = String(cod).toUpperCase();
  if (u === '9' || u === 'L1') return 3;
  if (u[0] === 'Z') return 4;
  if (u[0] === 'C') return 0;
  if (u[0] === 'S') return 1;
  if (u[0] === 'R') return 2;
  if (u[0] === 'X') return 1;
  return 5;
}
function _briefOrarioHM(s) {
  return s ? String(s).substring(0, 5) : '';
}
function _briefComponi(pianoRighe) {
  const righe = [];
  (pianoRighe || []).forEach((r) => {
    // regola multi-reparto: si finisce nel briefing del REPARTO DEL TURNO,
    // non del reparto d'origine (Balliu con X1 valet → solo briefing valet,
    // mai in quello slots). Niente fallback sui turni degli altri reparti.
    const t = _pianoTurniReparto().find((x) => x.codice === r.codice);
    const custom = !t && r.ora_inizio && r.ora_fine && (r.reparto_dip || 'slots') === _pianoReparto();
    if (!t && !custom) return;
    const info = _pianoCollabInfo(r.collaboratore);
    if (info && info.attivo === false) return;
    if (info && info.funzione === 'RESP') return;
    const parole = r.collaboratore.trim().split(/\s+/);
    const cognome = (parole.length > 1 ? parole.slice(0, -1).join(' ') : parole[0]).toUpperCase();
    righe.push({
      e: '',
      u: '',
      nome: cognome,
      nomeFull: r.collaboratore,
      turno: r.codice,
      oi: r.ora_inizio ? _briefOrarioHM(r.ora_inizio) : '',
      of: r.ora_fine ? _briefOrarioHM(r.ora_fine) : '',
      cd: '',
      uscita: '',
      firma: '',
      radio: '',
      badge: '',
      fm: /formazion|affianc/i.test(r.commento || '') || undefined,
      // SOLO VALET: il colore dato alla cella del PIANO (es. X1 rosso =
      // coordinatore) arriva anche sul briefing; negli altri reparti il
      // colore riga si mette solo a mano col quadratino
      col: (_pianoReparto() === 'valet' && r.colore) || undefined,
    });
  });
  // cognomi uguali di persone diverse (es. BIANCHI Milena e BIANCHI Chiara):
  // aggiungi l'iniziale del nome; se coincide anche quella, il nome intero
  const perCognome = {};
  righe.forEach((r) => {
    (perCognome[r.nome] = perCognome[r.nome] || new Set()).add(r.nomeFull || r.nome);
  });
  righe.forEach((r) => {
    if (perCognome[r.nome] && perCognome[r.nome].size > 1 && r.nomeFull) {
      const parole = r.nomeFull.trim().split(/\s+/);
      const proprio = parole[parole.length - 1];
      const iniziali = [...perCognome[r.nome]].map((n) => {
        const p = n.trim().split(/\s+/);
        return p[p.length - 1].charAt(0).toUpperCase();
      });
      const doppiaIni = iniziali.filter((x) => x === proprio.charAt(0).toUpperCase()).length > 1;
      r.nome = r.nome + ' ' + (doppiaIni ? proprio.toUpperCase() : proprio.charAt(0).toUpperCase() + '.');
    }
  });
  _briefOrdina(righe);
  return righe;
}
// Ordine del foglio: gruppi, dentro il gruppo prima i presti poi le notti;
// aperture e chiusure seguono l'ordine delle coppie CD (C0,C23,C4 poi C5,C20,C15)
function _briefOrdina(righe) {
  const inizioDi = (r) => {
    const t = _pianoTurnoInfo(r.turno);
    const o = t ? t.ora_inizio : r.oi;
    const m = _pianoOra(o ? String(o).substring(0, 5) : '');
    return m == null ? 99 : m;
  };
  const cfgCd = window._pianoCdCfg && Array.isArray(window._pianoCdCfg.coppie) ? window._pianoCdCfg.coppie : [];
  const ordineCd = cfgCd
    .map((cp) => String(cp.apre || '').toUpperCase())
    .concat(cfgCd.map((cp) => String(cp.chiude || '').toUpperCase()))
    .filter(Boolean);
  const rangoCd = (t) => ordineCd.indexOf(String(t).toUpperCase());
  righe.sort((a, b) => {
    const g = _briefGruppo(a.turno) - _briefGruppo(b.turno);
    if (g) return g;
    const ra = rangoCd(a.turno);
    const rb = rangoCd(b.turno);
    if (ra >= 0 || rb >= 0) {
      if (ra >= 0 && rb >= 0 && ra !== rb) return ra - rb;
      if (ra >= 0 !== rb >= 0) return ra >= 0 ? -1 : 1;
    }
    const o = inizioDi(a) - inizioDi(b);
    if (o) return o;
    if (a.turno !== b.turno) return a.turno < b.turno ? -1 : 1;
    // chi è in formazione sta VICINO al collega dello stesso turno (in fondo al gruppo turno)
    if (!!a.fm !== !!b.fm) return a.fm ? 1 : -1;
    return a.nome < b.nome ? -1 : 1;
  });
  return righe;
}
// Posizioni del fabbisogno SCOPERTE (es. manca il C0 quel giorno): riga
// segnaposto 'XXX' così sul foglio il buco si vede. Le pause NON la considerano.
async function _briefAggiungiScoperti(righe, dstr) {
  try {
    const fabb = (await secGet('piano_fabbisogni?data=eq.' + dstr + '&reparto_dip=eq.' + _pianoReparto())) || [];
    let aggiunte = false;
    fabb.forEach((f) => {
      const cod = String(f.turno_codice || '').toUpperCase();
      if (!_pianoTurnoInfo(cod)) return;
      const have = righe.filter((r) => String(r.turno || '').toUpperCase() === cod).length;
      for (let k = have; k < (parseInt(f.quantita) || 0); k++) {
        righe.push({
          e: '',
          u: '',
          nome: 'XXX',
          nomeFull: null,
          turno: f.turno_codice,
          oi: '',
          of: '',
          cd: '',
          uscita: '',
          firma: '',
          radio: '',
          badge: '',
        });
        aggiunte = true;
      }
    });
    if (aggiunte) _briefOrdina(righe);
  } catch (e) {}
}
// NUMERI CASSA (CD) automatici: chi ha CHIUSO ieri RIAPRE oggi.
// Coppie configurabili (default 2/7 su C0-C5, 3/4 su C23-C20, 8/9 su C4-C15);
// i C8 di ven/sab prendono in ordine l'altra cassa di ogni coppia.
// Tutto resta editabile: domani si riparte dai valori salvati oggi.
async function _briefAssegnaCd(righe, dstr) {
  const cfg = window._pianoCdCfg;
  if (!cfg || !cfg.coppie || !cfg.coppie.length) return;
  const ieriD = new Date(dstr + 'T12:00:00');
  ieriD.setDate(ieriD.getDate() - 1);
  const ieriStr =
    ieriD.getFullYear() +
    '-' +
    String(ieriD.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(ieriD.getDate()).padStart(2, '0');
  let ieriRighe = [];
  try {
    const sv = await secGet(
      'piano_briefing?data=eq.' + ieriStr + '&sezione=eq.briefing&reparto_dip=eq.' + _pianoReparto(),
    );
    if (sv && sv[0] && sv[0].contenuto && Array.isArray(sv[0].contenuto.righe)) ieriRighe = sv[0].contenuto.righe;
  } catch (e) {}
  const cdIeriDi = (turno) => {
    const r = ieriRighe.find((x) => String(x.turno).toUpperCase() === turno && String(x.cd || '').trim());
    return r ? String(r.cd).trim() : '';
  };
  const trovaOggi = (turno) => righe.find((x) => String(x.turno).toUpperCase() === turno);
  const apreCds = [];
  const coppieCalc = [];
  cfg.coppie.forEach((cp) => {
    const [a, b] = cp.cd.map(String);
    // chi ha chiuso ieri riapre oggi (fallback: primo numero della coppia)
    const chiusoIeri = cdIeriDi(cp.chiude.toUpperCase()) || cdIeriDi(cp.apre.toUpperCase());
    const apreCd = chiusoIeri === a || chiusoIeri === b ? chiusoIeri : a;
    const chiudeCd = apreCd === a ? b : a;
    apreCds.push(apreCd);
    coppieCalc.push({ apreCd, chiudeCd });
    const rA = trovaOggi(cp.apre.toUpperCase());
    const rC = trovaOggi(cp.chiude.toUpperCase());
    if (rA && !String(rA.cd || '').trim()) rA.cd = apreCd;
    if (rC && !String(rC.cd || '').trim()) rC.cd = chiudeCd;
  });
  // C8 in ordine: riapre la cassa del presto di ogni coppia
  let k = 0;
  righe.forEach((r) => {
    if (String(r.turno).toUpperCase() === 'C8' && !String(r.cd || '').trim() && k < apreCds.length) {
      r.cd = apreCds[k];
      k++;
    }
  });
  // coppie in FORMAZIONE sullo stesso turno: lavorano sulla STESSA cassa
  righe.forEach((r) => {
    if (!r.fm || String(r.cd || '').trim()) return;
    const collega = righe.find(
      (x) => x !== r && String(x.turno).toUpperCase() === String(r.turno).toUpperCase() && String(x.cd || '').trim(),
    );
    if (collega) r.cd = String(collega.cd).trim();
  });
  // turni di chiusura doppi (es. due C5): il secondo prende una cassa LIBERA
  // delle altre coppie (prima quella che chiuderebbe oggi, es. la 3 o la 4)
  const usati = new Set(righe.map((r) => String(r.cd || '').trim()).filter(Boolean));
  cfg.coppie.forEach((cp, i) => {
    const doppi = righe.filter(
      (x) => String(x.turno).toUpperCase() === cp.chiude.toUpperCase() && !String(x.cd || '').trim(),
    );
    doppi.forEach((rx) => {
      for (let j = 1; j < cfg.coppie.length && !String(rx.cd || '').trim(); j++) {
        const cc = coppieCalc[(i + j) % cfg.coppie.length];
        for (const n of [cc.chiudeCd, cc.apreCd]) {
          if (n && !usati.has(n)) {
            rx.cd = n;
            usati.add(n);
            break;
          }
        }
      }
    });
  });
}
async function _renderPianoBriefingTab() {
  if (!_briefData) _briefData = _briefDomani();
  const dstr = _briefData;
  const rep = _pianoReparto();
  const [salvati, pianoRighe, pauseCfg] = await Promise.all([
    secGet('piano_briefing?data=eq.' + dstr + '&reparto_dip=eq.' + rep),
    // senza filtro reparto: i multi-reparto (es. Balliu) entrano nel briefing
    // del reparto del TURNO che fanno quel giorno; _briefComponi filtra per turno
    secGet('piano?data=eq.' + dstr),
    getImp('piano_pause_cfg'),
  ]);
  try {
    window._briefPauseCfgObj = pauseCfg ? JSON.parse(pauseCfg) : {};
  } catch (e) {
    window._briefPauseCfgObj = {};
  }
  const valetR = _briefIsValet();
  const rigaBrief = (salvati || []).find((x) => x.sezione === 'briefing');
  const rigaPause = (salvati || []).find((x) => x.sezione === 'pause');
  let righe, salvato;
  if (
    rigaBrief &&
    rigaBrief.contenuto &&
    Array.isArray(rigaBrief.contenuto.righe) &&
    rigaBrief.contenuto.righe.length
  ) {
    righe = rigaBrief.contenuto.righe;
    salvato = true;
  } else {
    righe = _briefComponi(pianoRighe);
    await _briefAggiungiScoperti(righe, dstr);
    if (!valetR) await _briefAssegnaCd(righe, dstr);
    salvato = false;
  }
  _briefState = {
    id: rigaBrief ? rigaBrief.id : null,
    righe: righe,
    pause: rigaPause || null,
    pianoRighe: pianoRighe || [],
    chiave: dstr + '|' + rep,
  };
  const puo = puoGestirePiano();
  const valet = _briefIsValet();
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Briefing — ' +
    escP(rep.toUpperCase()) +
    '</div><div style="padding:12px 14px">';
  h +=
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn-export" style="padding:4px 10px" onclick="briefCambiaData(-1)">◀</button>' +
    '<input type="date" id="brief-data" value="' +
    dstr +
    '" onchange="briefSetData(this.value)" style="padding:6px">' +
    '<button class="btn-export" style="padding:4px 10px" onclick="briefCambiaData(1)">▶</button>' +
    '<strong style="font-size:1.1rem;background:#FFFF00;color:#000;padding:3px 12px;border:1px solid #999">' +
    _briefGiornoLbl(dstr) +
    ' ' +
    dstr.split('-').reverse().join('.') +
    '</strong>' +
    (puo
      ? '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="briefCompila()">Compila dal piano</button>' +
        '<button class="btn-export" style="font-size:.82rem;padding:5px 12px;border-color:#2c6e49;color:#2c6e49" onclick="briefGeneraPause()">Genera pause</button>' +
        '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pdfBriefingGiorno()">Stampa briefing</button>' +
        '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="document.getElementById(\'brief-xlsx\').click()">Importa da Excel</button>' +
        '<input type="file" id="brief-xlsx" accept=".xlsx,.xls,.xlsm" style="display:none" onchange="importaBriefingExcel(this)">'
      : '') +
    '<span id="brief-stato" style="font-size:.78rem;color:var(--muted)">' +
    (salvato
      ? 'Salvato'
      : righe.length
        ? 'Compilato dal piano — modifica una cella per salvare'
        : 'Nessun turno nel piano per questa data') +
    '</span></div>';
  // tabella briefing + tabella orari affiancate (stessa vista dell'Excel)
  h += '<div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap"><div style="overflow-x:auto">';
  h += '<table class="brief-table" style="border-collapse:collapse;font-size:.85rem"><thead><tr>';
  // ogni reparto ha il SUO briefing: slots con CD (numeri cassa), valet con
  // radio/badge, gli altri (es. tavoli, senza casse) tabella essenziale
  const cols = valet
    ? ['E', 'U', 'COLLABORATORE', 'TURNO', 'USCITA', 'FIRMA', 'RADIO', 'BADGE']
    : rep === 'slots'
      ? ['E', 'U', 'HOST', 'T', 'CD', 'USCITA', 'FIRMA']
      : ['E', 'U', 'COLLABORATORE', 'T', 'USCITA', 'FIRMA'];
  cols.forEach((c) => {
    const bg = c === 'E' ? '#00B050' : c === 'U' ? '#FF0000' : '#FFFF00';
    const fg = c === 'E' || c === 'U' ? '#fff' : '#000';
    h +=
      '<th style="border:1px solid #999;background:' +
      bg +
      ';color:' +
      fg +
      ';padding:4px 8px;font-size:.78rem">' +
      c +
      '</th>';
  });
  h += (puo ? '<th style="border:none"></th>' : '') + '</tr></thead><tbody>';
  let gPrec = null;
  righe.forEach((r, i) => {
    const g = _briefGruppo(r.turno);
    if (gPrec !== null && g !== gPrec)
      h +=
        '<tr>' +
        cols.map(() => '<td style="border:1px solid #999;padding:0;height:11px"></td>').join('') +
        (puo ? '<td style="border:none"></td>' : '') +
        '</tr>';
    gPrec = g;
    const inp = (campo, val, larghezza, extra) =>
      '<td style="border:1px solid #999;padding:0"><input ' +
      (puo ? '' : 'disabled ') +
      (extra || '') +
      ' value="' +
      escP(val || '') +
      '" oninput="briefCella(' +
      i +
      ",'" +
      campo +
      '\',this.value)" ' +
      'style="width:' +
      larghezza +
      'px;border:none;background:transparent;padding:4px 6px;font:inherit;color:inherit"></td>';
    h += '<tr>';
    // E e U si spuntano A PENNA sul foglio stampato: celle vuote
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    const bgNome = r.col || (r.fm ? '#FFFF00' : '');
    if (r.fm || bgNome) {
      // in formazione (giallo) o colorata a mano: sfondo sulla cella del nome
      h +=
        '<td style="border:1px solid #999;padding:0;white-space:nowrap;background:' +
        (bgNome || 'transparent') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        'value="' +
        escP(r.nome || '') +
        '" oninput="briefCella(' +
        i +
        ",'nome',this.value)\" " +
        'style="width:' +
        (r.fm ? 86 : 138) +
        'px;border:none;background:transparent;padding:4px 2px 4px 6px;font:inherit;color:#000">' +
        (r.fm
          ? '<span style="font-size:.66rem;font-weight:700;color:#000;padding-right:3px">(formazione)</span>'
          : '') +
        '</td>';
    } else h += inp('nome', r.nome, 150);
    const colTurno = _pianoColore(r.turno) || '';
    h =
      h.substring(0) +
      '<td style="border:1px solid #999;padding:0;background:' +
      colTurno +
      '"><input ' +
      (puo ? '' : 'disabled ') +
      'value="' +
      escP(r.turno || '') +
      '" oninput="briefCella(' +
      i +
      ",'turno',this.value)\" " +
      'style="width:52px;border:none;background:transparent;padding:4px 6px;font:inherit;font-weight:bold;color:inherit"></td>';
    if (valet) {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
      h += inp('radio', r.radio, 60);
      h += inp('badge', r.badge, 60);
    } else if (rep !== 'slots') {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
    } else {
      h +=
        '<td style="border:1px solid #999;padding:0;background:' +
        (r.cd ? '#FFFF00' : 'transparent') +
        '"><input ' +
        (puo ? '' : 'disabled ') +
        'value="' +
        escP(r.cd || '') +
        '" oninput="briefCella(' +
        i +
        ",'cd',this.value)\" " +
        'style="width:40px;border:none;background:transparent;padding:4px 6px;font:inherit;font-weight:bold;color:inherit"></td>';
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
    }
    if (puo)
      h +=
        '<td style="border:none;padding:0 5px;white-space:nowrap;font-size:.85rem">' +
        '<span style="cursor:pointer;color:#2c6e49;font-weight:bold" title="Inserisci riga sotto" onclick="briefInserisciRiga(' +
        i +
        ')">+</span> ' +
        '<span style="cursor:pointer;color:var(--muted)" title="Sposta su" onclick="briefMuoviRiga(' +
        i +
        ',-1)">▲</span> ' +
        '<span style="cursor:pointer;color:var(--muted)" title="Sposta giù" onclick="briefMuoviRiga(' +
        i +
        ',1)">▼</span> ' +
        '<span style="cursor:pointer;color:#c0392b;font-weight:bold" title="Elimina riga" onclick="briefEliminaRiga(' +
        i +
        ')">×</span> ' +
        '<span style="cursor:pointer;display:inline-block;width:15px;height:15px;border:1.5px solid #777;border-radius:3px;vertical-align:middle;background:' +
        (r.col || 'transparent') +
        '" title="Colore riga: apri la palette" onclick="briefColoreRiga(' +
        i +
        ',event)">' +
        (r.col
          ? ''
          : '<span style="font-size:.6rem;color:#999;line-height:15px;display:block;text-align:center">🎨</span>') +
        '</span></td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  if (puo)
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;margin-top:8px" onclick="briefAggiungiRiga()">+ Aggiungi riga</button>';
  h += '</div>';
  // tabella ORARI (da piano_turni, sola lettura): SOLO i turni presenti
  // nel briefing di oggi
  const turniPresenti = {};
  righe.forEach((r) => {
    if (r.turno) turniPresenti[String(r.turno).trim().toUpperCase()] = true;
  });
  const turni = _pianoTurniReparto()
    .filter((t) => turniPresenti[t.codice.toUpperCase()])
    .sort((a, b) => {
      const g = _briefGruppo(a.codice) - _briefGruppo(b.codice);
      if (g) return g;
      const oa = _pianoOra((a.ora_inizio || '').substring(0, 5));
      const ob = _pianoOra((b.ora_inizio || '').substring(0, 5));
      const o = (oa == null ? 99 : oa) - (ob == null ? 99 : ob);
      if (o) return o;
      return a.codice < b.codice ? -1 : 1;
    });
  h +=
    '<div><table style="border-collapse:collapse;font-size:.8rem"><thead><tr><th colspan="3" style="border:1px solid #999;background:#FFFF00;color:#000;padding:4px 10px;font-size:.78rem">ORARI</th></tr></thead><tbody>';
  let gT = null;
  turni.forEach((t) => {
    const g = _briefGruppo(t.codice);
    if (gT !== null && g !== gT)
      h +=
        '<tr><td style="border:1px solid #999;height:9px"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td></tr>';
    gT = g;
    h +=
      '<tr><td style="border:1px solid #999;padding:2px 10px;font-weight:bold;background:' +
      (_pianoColore(t.codice) || '') +
      '">' +
      escP(t.codice) +
      '</td><td style="border:1px solid #999;padding:2px 10px">' +
      _briefOrarioHM(t.ora_inizio) +
      '</td><td style="border:1px solid #999;padding:2px 10px">' +
      _briefOrarioHM(t.ora_fine) +
      '</td></tr>';
  });
  h += '</tbody></table></div></div>';
  h += '</div></div>';
  h += _briefRenderPauseCard();
  return h;
}
function briefCambiaData(delta) {
  const d = new Date(_briefData + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  _briefData =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  renderPiano();
}
function briefSetData(v) {
  if (!v) return;
  _briefData = v;
  renderPiano();
}
function briefCella(i, campo, val) {
  if (!puoGestirePiano() || !_briefState) return;
  _briefState.righe[i][campo] = val;
  if (campo === 'nome') _briefState.righe[i].nomeFull = null; // ri-matcha al salvataggio timbratura
  _briefDirtySalva();
}
function _briefDirtySalva() {
  clearTimeout(_briefSaveTimer);
  const el = document.getElementById('brief-stato');
  if (el) el.textContent = 'salvataggio…';
  _briefSaveTimer = setTimeout(briefSalvaBriefing, 900);
}
async function briefSalvaBriefing() {
  if (!_briefState || _briefSaving) {
    if (_briefSaving) _briefSaveTimer = setTimeout(briefSalvaBriefing, 500);
    return;
  }
  _briefSaving = true;
  try {
    const contenuto = { righe: _briefState.righe };
    if (_briefState.id) {
      await secPatch('piano_briefing', 'id=eq.' + _briefState.id, {
        contenuto: contenuto,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      });
    } else {
      const nuovo = await secPost('piano_briefing', {
        data: _briefData,
        reparto_dip: _pianoReparto(),
        sezione: 'briefing',
        contenuto: contenuto,
        operatore: getOperatore(),
      });
      _briefState.id = nuovo && nuovo[0] ? nuovo[0].id : null;
    }
    const el = document.getElementById('brief-stato');
    if (el) el.textContent = 'Salvato ✓';
  } catch (e) {
    const el = document.getElementById('brief-stato');
    if (el) el.textContent = 'ERRORE salvataggio';
  }
  _briefSaving = false;
}
async function briefAggiungiRiga() {
  if (!_briefState) return;
  _briefState.righe.push({
    e: '',
    u: '',
    nome: '',
    nomeFull: null,
    turno: '',
    cd: '',
    uscita: '',
    firma: '',
    radio: '',
    badge: '',
  });
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function _briefRigaVuota() {
  return { e: '', u: '', nome: '', nomeFull: null, turno: '', cd: '', uscita: '', firma: '', radio: '', badge: '' };
}
async function briefInserisciRiga(i) {
  if (!_briefState || !puoGestirePiano()) return;
  _briefState.righe.splice(i + 1, 0, _briefRigaVuota());
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// Colore della riga del briefing: il quadratino apre la STESSA palette
// del piano, con scelta diretta del colore (vista + PDF)
function briefColoreRiga(i, ev) {
  if (!_briefState || !puoGestirePiano()) return;
  if (ev) ev.stopPropagation();
  let pop = document.getElementById('brief-colori-pop');
  if (pop) pop.remove();
  pop = document.createElement('div');
  pop.id = 'brief-colori-pop';
  pop.style.cssText =
    'position:fixed;z-index:10001;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap';
  pop.innerHTML =
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<span onclick="briefColoreRigaSet(' +
        i +
        ",'" +
        c +
        '\')" style="display:inline-block;width:22px;height:22px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.7rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="briefColoreRigaSet(' +
    i +
    ',null)">Nessuno</button>';
  document.body.appendChild(pop);
  const x = ev ? ev.clientX : 200;
  const y = ev ? ev.clientY : 200;
  pop.style.left = Math.min(x, window.innerWidth - 300) + 'px';
  pop.style.top = Math.min(y + 8, window.innerHeight - 60) + 'px';
  setTimeout(() => {
    const chiudi = (e2) => {
      if (!e2.target.closest('#brief-colori-pop')) {
        pop.remove();
        document.removeEventListener('click', chiudi);
      }
    };
    document.addEventListener('click', chiudi);
  }, 50);
}
async function briefColoreRigaSet(i, col) {
  const pop = document.getElementById('brief-colori-pop');
  if (pop) pop.remove();
  if (!_briefState || !_briefState.righe[i]) return;
  _briefState.righe[i].col = col || null;
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
async function briefMuoviRiga(i, delta) {
  if (!_briefState || !puoGestirePiano()) return;
  const j = i + delta;
  if (j < 0 || j >= _briefState.righe.length) return;
  const tmp = _briefState.righe[i];
  _briefState.righe[i] = _briefState.righe[j];
  _briefState.righe[j] = tmp;
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
async function briefEliminaRiga(i) {
  if (!_briefState) return;
  _briefState.righe.splice(i, 1);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
async function briefCompila() {
  if (!_briefState) return;
  if (_briefState.righe.length && !confirm('Sostituisco le righe attuali con i turni del piano di ' + _briefData + '?'))
    return;
  _briefState.righe = _briefComponi(_briefState.pianoRighe);
  await _briefAggiungiScoperti(_briefState.righe, _briefData);
  if (!_briefIsValet()) await _briefAssegnaCd(_briefState.righe, _briefData);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function _briefRenderPauseCard() {
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Pause — ' +
    escP(_pianoReparto().toUpperCase()) +
    '</div><div style="padding:12px 14px" id="brief-pause-body">';
  h += _briefPauseBodyHtml();
  h += '</div></div>';
  return h;
}
function _briefPauseBodyHtml() {
  let h = '';
  const p = _briefState && _briefState.pause;
  if (p && p.contenuto && p.contenuto.tipo) {
    h +=
      '<div style="margin-bottom:8px"><button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pdfPauseGiorno()">Stampa pause</button></div>';
    h += _briefRenderPause(p.contenuto);
  } else {
    h +=
      '<p style="font-size:.85rem;color:var(--muted)">Nessuna pausa generata per questa data. Compila il briefing e premi <b>Genera pause</b>.</p>';
  }
  h += _briefRenderPauseCfg();
  return h;
}

// ============================================================
// CORSI (CS, LRD, ANTINCENDIO...) — pianificatore: scegli codice,
// data, orario e partecipanti; le sigle finiscono da sole nel piano
// ============================================================
function _renderPianoCorsiCard() {
  if (!puoGestirePiano()) return '';
  const codici = pianoCodiciCache.filter((c) => c.attivo !== false);
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi — inserimento automatico nel piano</div><div style="padding:12px 14px">';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-bottom:10px">Scegli il corso (CS, LRD, ANTINCENDIO...), la data, l&#39;orario e i partecipanti: la sigla viene scritta da sola nelle loro celle del piano (protetta, con orario e ore contate).</p>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">';
  h +=
    '<div class="field"><label>Corso</label><select id="corso-cod" style="padding:8px" onchange="corsoPrefillOrari()">' +
    codici
      .map((c) => '<option' + (c.codice === 'CS' ? ' selected' : '') + '>' + escP(c.codice) + '</option>')
      .join('') +
    '</select></div>';
  h += '<div class="field"><label>Data</label><input type="date" id="corso-data"></div>';
  const preCS = ((window._pianoCorsiOrari || {})['CS'] || '14:30-17:30').split('-');
  h +=
    '<div class="field"><label>Inizio</label><input type="time" id="corso-inizio" value="' +
    (preCS[0] || '') +
    '"></div>';
  h +=
    '<div class="field"><label>Fine</label><input type="time" id="corso-fine" value="' + (preCS[1] || '') + '"></div>';
  h +=
    '<button class="btn-export" style="font-size:.72rem;padding:4px 10px" title="La prossima volta questo corso partirà con questo orario" onclick="corsoSalvaOrarioDefault()">Salva orario predefinito</button>';
  h += '</div>';
  h +=
    '<div style="margin-bottom:6px;font-size:.82rem"><b>Partecipanti</b> — <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=true)">tutti</span> / <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=false)">nessuno</span></div>';
  h +=
    '<div style="max-height:180px;overflow-y:auto;border:1px solid var(--border,#ccc);padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 12px;font-size:.84rem">';
  collabs.forEach((c) => {
    h +=
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="corso-part" value="' +
      escP(c.nome) +
      '">' +
      escP(c.nome) +
      '</label>';
  });
  h += '</div>';
  h +=
    '<button class="btn-export" style="font-size:.85rem;padding:6px 16px;margin-top:10px;border-color:#2c6e49;color:#2c6e49" onclick="pianoInserisciCorso()">Inserisci nel piano</button>';
  h += '</div></div>';
  return h;
}
function corsoPrefillOrari() {
  const cod = (document.getElementById('corso-cod') || {}).value;
  const pre = (window._pianoCorsiOrari || {})[cod] || '';
  const p = pre.split('-');
  document.getElementById('corso-inizio').value = p[0] || '';
  document.getElementById('corso-fine').value = p[1] || '';
}
// salva l'orario attuale come predefinito del corso selezionato
async function corsoSalvaOrarioDefault() {
  if (!puoGestirePiano()) return;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const inizio = (document.getElementById('corso-inizio') || {}).value;
  const fine = (document.getElementById('corso-fine') || {}).value;
  if (!cod) return;
  window._pianoCorsiOrari = window._pianoCorsiOrari || {};
  if (inizio && fine) window._pianoCorsiOrari[cod] = inizio + '-' + fine;
  else delete window._pianoCorsiOrari[cod];
  await setImp('piano_corsi_orari', JSON.stringify(window._pianoCorsiOrari));
  toast('Orario predefinito di ' + cod + (inizio && fine ? ': ' + inizio + '-' + fine : ' rimosso'));
}
async function pianoInserisciCorso() {
  if (!puoGestirePiano()) return;
  const cod = (document.getElementById('corso-cod') || {}).value;
  const data = (document.getElementById('corso-data') || {}).value;
  const inizio = (document.getElementById('corso-inizio') || {}).value;
  const fine = (document.getElementById('corso-fine') || {}).value;
  const nomi = [...document.querySelectorAll('.corso-part:checked')].map((c) => c.value);
  if (!cod || !data || !nomi.length) {
    toast('Scegli corso, data e almeno un partecipante');
    return;
  }
  try {
    const esistenti = (await secGet('piano?data=eq.' + data + '&reparto_dip=eq.' + _pianoReparto())) || [];
    const etichettaCorso = 'Corso ' + cod + (inizio && fine ? ' ' + inizio + '-' + fine : '');
    const ci = _pianoOra(inizio);
    const cf = _pianoOra(fine);
    // classifica: liberi / turno COMPATIBILE (corso nel commento, turno
    // intatto) / turno SOVRAPPOSTO (avviso!) / altre celle (assenze...)
    const liberi = [];
    const compatibili = [];
    const conflitti = [];
    const occupateAltre = [];
    for (const nome of nomi) {
      const ex = esistenti.find((r) => r.collaboratore === nome);
      if (!ex) {
        liberi.push(nome);
        continue;
      }
      const t = _pianoTurnoInfo(ex.codice);
      if (t && t.ora_inizio && ci != null && cf != null) {
        const ti = _pianoOra(t.ora_inizio);
        let tf = _pianoOra(t.ora_fine);
        if (tf <= ti) tf += 24;
        if (ci < tf && ti < cf) conflitti.push({ nome: nome, ex: ex, t: t });
        else compatibili.push({ nome: nome, ex: ex });
      } else {
        occupateAltre.push({ nome: nome, ex: ex });
      }
    }
    if (
      !confirm(
        etichettaCorso +
          ' del ' +
          data.split('-').reverse().join('.') +
          '\n\n• ' +
          liberi.length +
          ' con giorno libero: ricevono la cella ' +
          cod +
          (compatibili.length
            ? '\n• ' +
              compatibili.length +
              ' con turno COMPATIBILE (turno intatto, corso nel commento): ' +
              compatibili.map((x) => x.nome + ' (' + x.ex.codice + ')').join(', ')
            : '') +
          (conflitti.length
            ? '\n\nATTENZIONE - turno SOVRAPPOSTO al corso, NON lo ricevono: ' +
              conflitti
                .map(
                  (x) =>
                    x.nome +
                    ' (' +
                    x.ex.codice +
                    ' ' +
                    _briefOrarioHM(x.t.ora_inizio) +
                    '-' +
                    _briefOrarioHM(x.t.ora_fine) +
                    ')',
                )
                .join(', ')
            : '') +
          (occupateAltre.length
            ? '\n• Altre celle (assenze/congedi), esclusi: ' +
              occupateAltre.map((x) => x.nome + ' (' + x.ex.codice + ')').join(', ')
            : ''),
      )
    )
      return;
    let sovrascrivi = false;
    if (conflitti.length || occupateAltre.length)
      sovrascrivi = confirm(
        'Sovrascrivo comunque le celle di chi ha turno sovrapposto o altra cella?\n(Annulla = restano come sono, consigliato)',
      );
    let inseriti = 0;
    let annotati = 0;
    const datiCorso = {
      codice: cod,
      ora_inizio: inizio || null,
      ora_fine: fine || null,
      protetto: true,
      generato: false,
      commento: etichettaCorso + ' - ' + getOperatore(),
    };
    for (const nome of liberi) {
      await secPost(
        'piano',
        Object.assign({ collaboratore: nome, data: data, reparto_dip: _pianoReparto() }, datiCorso),
      );
      inseriti++;
    }
    for (const cx of compatibili) {
      await secPatch('piano', 'id=eq.' + cx.ex.id, {
        commento: etichettaCorso + ' poi ' + cx.ex.codice + ' - ' + getOperatore(),
        protetto: true,
      });
      annotati++;
    }
    if (sovrascrivi) {
      for (const cx of conflitti.concat(occupateAltre)) {
        await secPatch('piano', 'id=eq.' + cx.ex.id, datiCorso);
        inseriti++;
      }
    }
    logAzione(
      'Corso inserito nel piano',
      cod + ' ' + data + ' — ' + inseriti + ' celle, ' + annotati + ' annotati sul turno',
    );
    toast('Corso ' + cod + ': ' + inseriti + ' celle' + (annotati ? ' + ' + annotati + ' annotati sul turno' : ''));
    if (_pianoMeseSel === data.substring(0, 7)) renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore inserimento corso');
  }
}

// ============================================================
// COPIA / INCOLLA a blocchi — Shift+click su due celle = blocco
// (piano o fabbisogno), tasto destro = Copia / Incolla. L'incolla
// accetta anche celle copiate da Excel (formato tab-separato).
// ============================================================
window._pianoBlocco = null; // {tab, t1, t2, completo}
function pianoBloccoClick(tab, el) {
  const b = window._pianoBlocco;
  if (b && b.tab === tab && b.t1.closest('table') === el.closest('table')) {
    // Shift+click: estende dalla cella àncora (come Excel)
    const t1 = b.t1;
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: tab, t1: t1, t2: el, completo: true };
    _pianoBloccoEvidenzia();
  } else {
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: tab, t1: el, t2: el, completo: true };
    _pianoBloccoEvidenzia();
  }
}
// === COLORI CELLE (come il secchiello di Excel): palette in alto, si
// applica alle celle SELEZIONATE; solo visivo per quella cella del piano,
// il colore predefinito del turno non cambia mai ===
const PIANO_COLORI_CELLA = ['#FF6B6B', '#FFB86B', '#FFF06B', '#95E06C', '#6BCBFF', '#B39DDB', '#F48FB1', '#D7CCC8'];
function _pianoColoriBarHtml() {
  return (
    '<span style="position:relative;display:inline-flex;align-items:center"><button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#e67e22;color:#e67e22" title="Colora le celle selezionate (solo qui nel piano, il turno non cambia)" onclick="event.stopPropagation();pianoColoriToggle()">Colori</button>' +
    '<div id="piano-colori-pop" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<span onclick="pianoApplicaColore(\'' +
        c +
        '\')" style="display:inline-block;width:22px;height:22px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.7rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="pianoApplicaColore(null)">Colore del turno</button>' +
    '</div></span>'
  );
}
function pianoColoriToggle() {
  const p = document.getElementById('piano-colori-pop');
  if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
async function pianoApplicaColore(colore) {
  const p = document.getElementById('piano-colori-pop');
  if (p) p.style.display = 'none';
  if (!puoGestirePiano()) return;
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') {
    toast('Seleziona prima le celle nella griglia (click o trascinamento)');
    return;
  }
  const celle = _pianoBloccoCelle();
  let fatte = 0;
  let senza = 0;
  try {
    for (const rigaC of celle) {
      for (const td of rigaC) {
        const tr = td.closest('tr');
        const nome = tr ? tr.dataset.nome : null;
        const g = parseInt(td.dataset.g);
        if (!nome || !g) continue;
        const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
        const r = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
        if (!r) {
          senza++;
          continue;
        }
        if ((r.colore || null) === colore) continue;
        await secPatch('piano', 'id=eq.' + r.id, { colore: colore });
        r.colore = colore;
        fatte++;
      }
    }
    logAzione('Piano: colore celle', (colore || 'rimosso') + ' su ' + fatte + ' celle');
    toast(
      colore
        ? 'Colorate ' + fatte + ' celle' + (senza ? ' (' + senza + ' vuote saltate)' : '')
        : 'Colore rimosso da ' + fatte + ' celle',
    );
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio colore');
  }
}
// Click SINGOLO sulla cella della griglia: la MARCA soltanto (come Excel);
// la modifica manuale parte col DOPPIO click
function pianoCellaClick(nome, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('piano', el);
    return;
  }
  _pianoBloccoPulisci();
  window._pianoBlocco = { tab: 'piano', t1: el, t2: el, completo: true };
  _pianoBloccoEvidenzia();
}
function fabbCellaClick(codice, dstr, el) {
  if (window.event && window.event.shiftKey) {
    pianoBloccoClick('fabb', el);
    return;
  }
  _pianoBloccoPulisci();
  window._pianoBlocco = { tab: 'fabb', t1: el, t2: el, completo: true };
  _pianoBloccoEvidenzia();
}
function _pianoBloccoCelle() {
  const b = window._pianoBlocco;
  if (!b || !b.completo) return [];
  const tbody = b.t1.closest('tbody');
  const righe = [...tbody.rows];
  let r1 = righe.indexOf(b.t1.closest('tr'));
  let r2 = righe.indexOf(b.t2.closest('tr'));
  if (r1 > r2) [r1, r2] = [r2, r1];
  let g1 = parseInt(b.t1.dataset.g);
  let g2 = parseInt(b.t2.dataset.g);
  if (g1 > g2) [g1, g2] = [g2, g1];
  const out = [];
  for (let ri = r1; ri <= r2; ri++) {
    const riga = [];
    for (let g = g1; g <= g2; g++) {
      const cel = righe[ri].querySelector('td[data-g="' + g + '"]');
      if (cel) riga.push(cel);
    }
    if (riga.length) out.push(riga);
  }
  return out;
}
function _pianoBloccoEvidenzia() {
  const celle = _pianoBloccoCelle();
  celle.forEach((riga, ri) =>
    riga.forEach((c, ci) => {
      c.classList.add('blocco-sel');
      // quadrante in grassetto: bordi marcati sul perimetro della selezione
      if (ri === 0) c.classList.add('bs-t');
      if (ri === celle.length - 1) c.classList.add('bs-b');
      if (ci === 0) c.classList.add('bs-l');
      if (ci === riga.length - 1) c.classList.add('bs-r');
    }),
  );
  // intestazioni della selezione in evidenza (giorni sopra, nome a sinistra)
  const b = window._pianoBlocco;
  if (!b || !celle.length) return;
  const table = b.t1.closest('table');
  let g1 = parseInt(b.t1.dataset.g);
  let g2 = parseInt(b.t2.dataset.g);
  if (g1 > g2) [g1, g2] = [g2, g1];
  for (let g = g1; g <= g2; g++) {
    const th = table.querySelector('thead th[data-g="' + g + '"]');
    if (th) th.classList.add('blocco-sel-head');
  }
  celle.forEach((riga) => {
    const primo = riga[0] && riga[0].closest('tr') && riga[0].closest('tr').firstElementChild;
    if (primo && !primo.dataset.g) primo.classList.add('blocco-sel-head');
  });
}
function _pianoBloccoPulisci() {
  document
    .querySelectorAll('.blocco-sel, .bs-t, .bs-b, .bs-l, .bs-r, .blocco-sel-head')
    .forEach((c) => c.classList.remove('blocco-sel', 'bs-t', 'bs-b', 'bs-l', 'bs-r', 'blocco-sel-head'));
  window._pianoBlocco = null;
}
// === SELEZIONE COL TRASCINAMENTO (come Excel): mousedown su una cella e
// trascina; il click semplice continua ad aprire l'editor della cella ===
function _pianoDragBind() {
  if (window._pianoDragBound) return;
  window._pianoDragBound = true;
  let drag = null; // {tab, table, start, moved}
  const swallow = (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener('click', swallow, true);
  };
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.shiftKey) return;
    if (e.target.closest('input,select,textarea,button,a')) return;
    const td = e.target.closest('td[data-g]');
    const tabEl = e.target.closest('table[data-seltab]');
    if (!td || !tabEl) return;
    // niente selezione del TESTO del browser (prenderebbe anche i nomi):
    // si copia solo il blocco marcato. Se c'è un editor aperto, lasciamo
    // partire il blur (il preventDefault bloccherebbe il cambio di focus)
    const att = document.activeElement;
    if (!att || att.tagName !== 'INPUT' || !att.closest('td')) e.preventDefault();
    drag = { tab: tabEl.dataset.seltab, table: tabEl, start: td, moved: false };
  });
  // click fuori dalle tabelle = deseleziona (come Excel); Esc idem
  document.addEventListener('click', (e) => {
    if (e.target.closest('table[data-seltab], #piano-ctx, #piano-colori-pop')) return;
    if (window._pianoBlocco) _pianoBloccoPulisci();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window._pianoBlocco) _pianoBloccoPulisci();
    // Ctrl/Cmd+C copia il blocco marcato (solo le celle, mai i nomi)
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'c' || e.key === 'C') &&
      window._pianoBlocco &&
      window._pianoBlocco.completo &&
      !e.target.closest('input,textarea,select') &&
      String(window.getSelection ? window.getSelection() : '') === ''
    ) {
      e.preventDefault();
      pianoCopiaBlocco();
    }
  });
  document.addEventListener('mouseover', (e) => {
    if (!drag) return;
    const td = e.target.closest('td[data-g]');
    if (!td || td.closest('table') !== drag.table) return;
    if (td === drag.start && !drag.moved) return;
    drag.moved = true;
    drag.table.classList.add('sel-noselect');
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: drag.tab, t1: drag.start, t2: td, completo: true };
    _pianoBloccoEvidenzia();
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.moved) {
      drag.table.classList.remove('sel-noselect');
      // il click che segue il rilascio NON deve aprire l'editor della cella
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 300);
    }
    drag = null;
  });
}
// Selezione "riga intera" / "colonne intere" impostata come blocco: così
// il tasto destro → Copia blocco funziona anche da qui (come Excel)
function _pianoBloccoDaColonne(tabEl, g1, g2) {
  if (!tabEl || !tabEl.dataset.seltab) return;
  const rows = [...tabEl.querySelectorAll('tbody tr')].filter((r) => r.querySelector('td[data-g]'));
  if (!rows.length) return;
  const t1 = rows[0].querySelector('td[data-g="' + g1 + '"]');
  const t2 = rows[rows.length - 1].querySelector('td[data-g="' + g2 + '"]');
  if (t1 && t2) window._pianoBlocco = { tab: tabEl.dataset.seltab, t1: t1, t2: t2, completo: true };
}
function _pianoBloccoDaRighe(tabEl, tr1, tr2) {
  if (!tabEl || !tabEl.dataset.seltab) return;
  const c1 = tr1.querySelectorAll('td[data-g]');
  const c2 = tr2.querySelectorAll('td[data-g]');
  if (!c1.length || !c2.length) return;
  window._pianoBlocco = { tab: tabEl.dataset.seltab, t1: c1[0], t2: c2[c2.length - 1], completo: true };
}
// === ANTEPRIMA IMMEDIATA DEI COMMENTI: al passaggio del mouse su una cella
// con commento la nota appare SUBITO (il tooltip del browser tarda secondi) ===
function _pianoTipBind() {
  if (window._pianoTipBound) return;
  window._pianoTipBound = true;
  let tip = null;
  const nascondi = () => {
    if (tip) tip.style.display = 'none';
  };
  document.addEventListener('mouseover', (e) => {
    const td = e.target.closest('td[data-commento]');
    if (!td) {
      nascondi();
      return;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'piano-tip';
      document.body.appendChild(tip);
    }
    tip.textContent = td.dataset.commento;
    tip.style.display = 'block';
    const rc = td.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(rc.left, window.innerWidth - 264)) + 'px';
    tip.style.top = rc.bottom + 4 + 'px';
    // sospende il tooltip nativo (doppione): torna al mouseout
    if (td.title) {
      td.dataset.titSalvo = td.title;
      td.removeAttribute('title');
    }
  });
  document.addEventListener('mouseout', (e) => {
    const td = e.target.closest('td[data-commento]');
    if (td && td.dataset.titSalvo) {
      td.title = td.dataset.titSalvo;
      delete td.dataset.titSalvo;
    }
  });
  document.addEventListener('scroll', nascondi, true);
}
// === RIGHE E GIORNI NASCOSTI (come nascondere righe/colonne in Excel):
// solo visivo e per questo browser, i dati non si toccano mai ===
function _pianoNascostiKey() {
  return 'piano_nascosti_' + _pianoReparto();
}
function _pianoNascosti() {
  try {
    const o = JSON.parse(localStorage.getItem(_pianoNascostiKey()) || '{}');
    return { nomi: Array.isArray(o.nomi) ? o.nomi : [], giorni: Array.isArray(o.giorni) ? o.giorni : [] };
  } catch (e) {
    return { nomi: [], giorni: [] };
  }
}
function _pianoSalvaNascosti(o) {
  localStorage.setItem(_pianoNascostiKey(), JSON.stringify(o));
}
function pianoNascondiRighe(nomi) {
  const o = _pianoNascosti();
  nomi.forEach((n) => {
    if (!o.nomi.includes(n)) o.nomi.push(n);
  });
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast(nomi.length + (nomi.length === 1 ? ' riga nascosta' : ' righe nascoste'));
}
function pianoNascondiGiorni(gg) {
  const o = _pianoNascosti();
  gg.forEach((g) => {
    if (!o.giorni.includes(g)) o.giorni.push(g);
  });
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast(gg.length + (gg.length === 1 ? ' giorno nascosto' : ' giorni nascosti'));
}
// rimostra SOLO alcune righe (dal chip sul confine, come Excel)
function pianoMostraRighe(nomi) {
  const o = _pianoNascosti();
  o.nomi = o.nomi.filter((n) => !nomi.includes(n));
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast('Mostrate: ' + nomi.join(', '));
}
function pianoMostraNascosti() {
  _pianoSalvaNascosti({ nomi: [], giorni: [] });
  _pianoApplicaNascosti();
  toast('Righe e giorni di nuovo tutti visibili');
}
function _pianoApplicaNascosti() {
  const o = _pianoNascosti();
  _pianoBloccoPulisci();
  // giorni: colonne collegate su TUTTE le tabelle (griglia, differenze, effettivi, pianificazione);
  // con table-layout:fixed va azzerata anche la <col> e ridotta la larghezza tabella
  document.querySelectorAll('#piano-content table[data-seltab]').forEach((t) => {
    t.querySelectorAll('th[data-g], td[data-g]').forEach((c) => {
      c.classList.toggle('col-nascosta', o.giorni.includes(parseInt(c.dataset.g)));
    });
    const offset = t.dataset.seltab === 'piano' ? 2 : 1;
    const cols = t.querySelectorAll('colgroup col');
    if (!t.dataset.wOrig) t.dataset.wOrig = parseInt(t.style.width) || t.offsetWidth;
    let tolti = 0;
    cols.forEach((col, i) => {
      const g = i - offset + 1;
      if (g < 1) return;
      if (!col.dataset.wOrig) col.dataset.wOrig = col.style.width || '37px';
      if (o.giorni.includes(g) && parseInt(col.dataset.wOrig)) {
        col.style.width = '0px';
        tolti += parseInt(col.dataset.wOrig) || 37;
      } else if (col.style.width === '0px') {
        col.style.width = col.dataset.wOrig;
      }
    });
    t.style.width = parseInt(t.dataset.wOrig) - tolti + 'px';
  });
  // righe: solo la griglia collaboratori
  document.querySelectorAll('#piano-content table[data-seltab="piano"] tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = o.nomi.includes(tr.dataset.nome) ? 'none' : '';
  });
  // confine visibile come Excel: linea marcata + chip a sinistra del nome
  // che al passaggio dice chi c'è sotto ("Mostra: Andrade...") e al click li rimostra
  document.querySelectorAll('.chip-nascoste').forEach((c) => c.remove());
  document.querySelectorAll('.riga-dopo-nascoste').forEach((r) => r.classList.remove('riga-dopo-nascoste'));
  document.querySelectorAll('.riga-prima-nascoste').forEach((r) => r.classList.remove('riga-prima-nascoste'));
  const tbodyG = document.querySelector('#piano-content table[data-seltab="piano"] tbody');
  if (tbodyG && o.nomi.length) {
    const mettiChip = (tr, gruppo, inCoda) => {
      tr.classList.add(inCoda ? 'riga-prima-nascoste' : 'riga-dopo-nascoste');
      const cel = tr.querySelector('.piano-nome');
      if (!cel) return;
      const chip = document.createElement('span');
      chip.className = 'chip-nascoste';
      chip.textContent = (inCoda ? '▾' : '▸') + gruppo.length;
      chip.title = 'Mostra: ' + gruppo.join(', ');
      const g2 = gruppo.slice();
      chip.onclick = (e) => {
        e.stopPropagation();
        pianoMostraRighe(g2);
      };
      cel.prepend(chip);
    };
    const rows = [...tbodyG.querySelectorAll('tr[data-nome]')];
    let gruppo = [];
    let ultimaVisibile = null;
    rows.forEach((tr) => {
      if (o.nomi.includes(tr.dataset.nome)) {
        gruppo.push(tr.dataset.nome);
        return;
      }
      if (gruppo.length) {
        mettiChip(tr, gruppo, false);
        gruppo = [];
      }
      ultimaVisibile = tr;
    });
    if (gruppo.length && ultimaVisibile) mettiChip(ultimaVisibile, gruppo, true);
  }
  // barra "mostra tutto"
  const n = o.nomi.length + o.giorni.length;
  let bar = document.getElementById('piano-nascosti-bar');
  if (!n) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    const wrap = document.querySelector('#piano-content table[data-seltab="piano"]');
    if (!wrap) return;
    bar = document.createElement('div');
    bar.id = 'piano-nascosti-bar';
    wrap.closest('.piano-wrap').parentNode.insertBefore(bar, wrap.closest('.piano-wrap'));
  }
  bar.innerHTML =
    '<span style="font-size:.78rem;color:var(--muted)">Nascosti: ' +
    (o.nomi.length ? o.nomi.length + ' righe' : '') +
    (o.nomi.length && o.giorni.length ? ' + ' : '') +
    (o.giorni.length ? o.giorni.length + ' giorni (' + o.giorni.sort((a, b) => a - b).join(', ') + ')' : '') +
    '</span> <button class="btn-export" style="font-size:.72rem;padding:2px 10px;margin-left:8px" onclick="pianoMostraNascosti()">Mostra tutto</button>';
  bar.style.cssText = 'padding:4px 2px 6px';
}
function pianoCopiaBlocco() {
  const celle = _pianoBloccoCelle();
  if (!celle.length) {
    toast('Nessun blocco: Shift+click su due celle per selezionarlo');
    return;
  }
  const tab = window._pianoBlocco.tab;
  const tsv = celle
    .map((riga) =>
      riga
        .map((c) => {
          let t = (c.textContent || '').trim();
          if (tab === 'fabb' && t.includes('/')) t = t.split('/').pop();
          return t;
        })
        .join('\t'),
    )
    .join('\n');
  navigator.clipboard.writeText(tsv).then(
    () => toast('Copiate ' + celle.length * celle[0].length + ' celle (incollabili anche in Excel)'),
    () => toast('Clipboard non disponibile'),
  );
}
// testo dagli appunti, con ripiego manuale se il browser nega la lettura
async function _pianoTestoAppunti() {
  try {
    const t = await navigator.clipboard.readText();
    if (t && t.trim()) return t;
  } catch (e) {}
  return new Promise((res) => {
    const m = document.getElementById('pwd-modal');
    const mc = document.getElementById('pwd-modal-content');
    if (!m || !mc) {
      res(prompt('Incolla qui il contenuto copiato (una riga per collaboratore, celle separate da TAB):') || '');
      return;
    }
    mc.innerHTML =
      '<h3 style="margin-bottom:8px">Incolla</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Premi Ctrl+V (Cmd+V su Mac) nel riquadro: puoi incollare celle copiate da Excel o dal Diario.</p>' +
      '<textarea id="incolla-txt" style="width:100%;height:140px;font-family:monospace;font-size:.85rem;padding:8px"></textarea>' +
      '<div style="margin-top:10px;display:flex;gap:10px"><button class="btn-export" onclick="window._incollaOk()">Incolla</button><button class="btn-export" style="border-color:#c0392b;color:#c0392b" onclick="window._incollaAnnulla()">Annulla</button></div>';
    m.classList.remove('hidden');
    setTimeout(() => document.getElementById('incolla-txt').focus(), 100);
    window._incollaOk = () => {
      const v = document.getElementById('incolla-txt').value;
      m.classList.add('hidden');
      res(v);
    };
    window._incollaAnnulla = () => {
      m.classList.add('hidden');
      res('');
    };
  });
}
function _pianoParseTsv(testo) {
  return testo
    .replace(/\r/g, '')
    .split('\n')
    .map((r) => r.split('\t').map((x) => x.trim()));
}
// incolla nel PIANO a partire dalla cella target (righe = collaboratori in
// ordine visivo, colonne = giorni)
async function pianoIncollaDaClipboard(target) {
  if (!puoGestirePiano()) return;
  const testo = await _pianoTestoAppunti();
  if (!testo.trim()) return;
  const grid = _pianoParseTsv(testo);
  const nomiVis = [...document.querySelectorAll('#piano-content .piano-table tbody tr[data-nome]')].map(
    (tr) => tr.dataset.nome,
  );
  const start = nomiVis.indexOf(target.nome);
  if (start < 0) {
    toast('Cella di partenza non trovata');
    return;
  }
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const g0 = parseInt(target.data.split('-')[2]);
  const daPatch = [];
  const daInserire = [];
  let scartate = 0;
  let fuori = 0;
  grid.forEach((riga, i) => {
    const nome = nomiVis[start + i];
    if (!nome) {
      fuori += riga.filter((x) => x).length;
      return;
    }
    riga.forEach((val, j) => {
      const g = g0 + j;
      const cod = String(val || '')
        .trim()
        .toUpperCase();
      if (!cod) return;
      if (g > nGiorni) {
        fuori++;
        return;
      }
      if (!_pianoTurnoInfo(cod) && !_pianoCodiceInfo(cod)) {
        scartate++;
        return;
      }
      const dstr = ym + '-' + String(g).padStart(2, '0');
      const ex = _pianoRighe.find((x) => x.collaboratore === nome && x.data === dstr);
      if (ex) {
        if (ex.codice !== cod) daPatch.push({ id: ex.id, codice: cod, nomeRef: nome });
      } else {
        daInserire.push({
          collaboratore: nome,
          data: dstr,
          codice: cod,
          protetto: true,
          generato: false,
          reparto_dip: _pianoReparto(),
        });
      }
    });
  });
  if (!daPatch.length && !daInserire.length) {
    toast('Niente da incollare' + (scartate ? ' (' + scartate + ' sigle sconosciute)' : ''));
    return;
  }
  if (
    !confirm(
      'Incollo a partire da ' +
        target.nome +
        ' / giorno ' +
        g0 +
        '?\n\n• ' +
        daInserire.length +
        ' celle nuove\n• ' +
        daPatch.length +
        ' celle sovrascritte' +
        (scartate ? '\n• ' + scartate + ' sigle sconosciute scartate' : '') +
        (fuori ? '\n• ' + fuori + ' celle oltre i bordi del mese/lista (ignorate)' : ''),
    )
  )
    return;
  try {
    for (let i = 0; i < daPatch.length; i += 10)
      await Promise.all(
        daPatch
          .slice(i, i + 10)
          .map((p) => secPatch('piano', 'id=eq.' + p.id, { codice: p.codice, protetto: true, generato: false })),
      );
    if (daInserire.length) await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: daInserire });
    logAzione('Incolla nel piano', target.nome + ' g' + g0 + ' — ' + (daPatch.length + daInserire.length) + ' celle');
    toast('Incollate ' + (daPatch.length + daInserire.length) + ' celle');
    _pianoBloccoPulisci();
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
    const coppieNF = daInserire
      .map((x) => ({ nome: x.collaboratore, codice: x.codice, commento: '' }))
      .concat(daPatch.map((p) => ({ nome: p.nomeRef || '', codice: p.codice, commento: '' })));
    setTimeout(async () => {
      await _pianoProponiCertificazioniBulk(coppieNF);
      await controllaFormazioniCompletate(true);
    }, 400);
  } catch (e) {
    console.error(e);
    toast('Errore incolla');
  }
}
// menu contestuale sul FABBISOGNO: copia blocco / incolla numeri
function fabbCtxMenu(e, codice, dstr) {
  e.preventDefault();
  let menu = document.getElementById('piano-ctx');
  if (!menu) return;
  window._fabbCtxSel = { codice: codice, dstr: dstr };
  const puoMod = puoGestirePiano();
  let h =
    '<div class="piano-ctx-head">Fabbisogno ' +
    escP(codice) +
    ' — ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    '</div>';
  if (window._pianoBlocco && window._pianoBlocco.completo)
    h +=
      '<div class="piano-ctx-item" onclick="nascondiPianoCtx();pianoCopiaBlocco()"><i class="icx icx-modifica"></i> Copia blocco selezionato</div>';
  if (puoMod)
    h +=
      '<div class="piano-ctx-item" onclick="nascondiPianoCtx();fabbIncollaDaClipboard()"><i class="icx icx-refresh"></i> Incolla numeri qui (Excel/blocco)</div>';
  menu.innerHTML = h;
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 230) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
}
async function fabbIncollaDaClipboard() {
  if (!puoGestirePiano() || !window._fabbCtxSel) return;
  const target = window._fabbCtxSel;
  const testo = await _pianoTestoAppunti();
  if (!testo.trim()) return;
  const grid = _pianoParseTsv(testo);
  // ordine dei turni come mostrati nella tabella fabbisogno
  const tabelle = [...document.querySelectorAll('#piano-content .piano-table')];
  const tavFabb = tabelle.find((t) => t.querySelector('td[onclick*="fabbisognoInline"]'));
  if (!tavFabb) return;
  const codiciVis = [...tavFabb.querySelectorAll('tbody tr')].map((tr) =>
    (tr.querySelector('.piano-nome') || {}).textContent ? tr.querySelector('.piano-nome').textContent.trim() : '',
  );
  const start = codiciVis.indexOf(target.codice);
  if (start < 0) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const g0 = parseInt(target.dstr.split('-')[2]);
  const ops = [];
  let scartate = 0;
  grid.forEach((riga, i) => {
    const cod = codiciVis[start + i];
    if (!cod) return;
    riga.forEach((val, j) => {
      const g = g0 + j;
      if (g > nGiorni) return;
      const v = String(val || '').trim();
      if (v === '') return;
      const q = parseInt(v);
      if (isNaN(q) || q < 0) {
        scartate++;
        return;
      }
      ops.push({ codice: cod, data: ym + '-' + String(g).padStart(2, '0'), q: q });
    });
  });
  if (!ops.length) {
    toast('Nessun numero da incollare');
    return;
  }
  if (
    !confirm(
      'Incollo il fabbisogno da ' +
        target.codice +
        ' / giorno ' +
        g0 +
        '?\n\n• ' +
        ops.length +
        ' celle (0 = rimuove)' +
        (scartate ? '\n• ' + scartate + ' valori non numerici scartati' : ''),
    )
  )
    return;
  try {
    for (let i = 0; i < ops.length; i += 10)
      await Promise.all(
        ops.slice(i, i + 10).map(async (op) => {
          await secDel(
            'piano_fabbisogni',
            'data=eq.' + op.data + '&turno_codice=eq.' + op.codice + '&reparto_dip=eq.' + _pianoReparto(),
          );
          if (op.q > 0)
            await secPost('piano_fabbisogni', {
              data: op.data,
              turno_codice: op.codice,
              quantita: op.q,
              reparto_dip: _pianoReparto(),
            });
        }),
      );
    logAzione('Incolla fabbisogno', target.codice + ' g' + g0 + ' — ' + ops.length + ' celle');
    toast('Fabbisogno incollato: ' + ops.length + ' celle');
    _pianoBloccoPulisci();
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore incolla fabbisogno');
  }
}

// ============================================================
// MIGLIORA ORE — secondo passaggio dopo la bozza: sposta turni
// GENERATI (non protetti) da chi è sopra le ore dovute a chi è
// sotto, stesso giorno e stesse regole (idoneità, consecutivi,
// riposo 11h, tolleranza). La copertura del fabbisogno non cambia.
// ============================================================
async function miglioraOrePiano() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  let righe;
  {
    const tutteRighe = (await secGet('piano?data=gte.' + da + '&data=lte.' + a + '&limit=8000')) || [];
    const repM = _pianoReparto();
    righe = tutteRighe.filter((r) => {
      if ((r.reparto_dip || 'slots') === repM) return true;
      const infoM = _pianoCollabInfo(r.collaboratore);
      return !!(infoM && String(infoM.reparti_extra || '').trim() && _pianoAppartieneAlReparto(infoM));
    });
  }
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const cella = {};
  const rigaDi = {};
  righe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
  });
  const infoDi = {};
  nomi.forEach((n) => (infoDi[n] = _pianoCollabInfo(n) || {}));
  const ore = {};
  righe.forEach((r) => {
    if (!nomi.includes(r.collaboratore)) return;
    const pct = parseFloat((infoDi[r.collaboratore] || {}).percentuale) || 1;
    ore[r.collaboratore] = (ore[r.collaboratore] || 0) + _pianoOreDiRiga(r, pct);
  });
  await _pianoAggiornaYtd(nomi);
  const saldo = {};
  const fissi = nomi.filter((n) => !infoDi[n].is_jolly);
  fissi.forEach((n) => {
    const pct = parseFloat(infoDi[n].percentuale) || 1;
    const obiettivo = (nGiorni / 7) * _pianoOreSett * pct - (_pianoYtdMap[n] || 0);
    saldo[n] = (ore[n] || 0) - obiettivo;
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const lavora = (cod) => !!_pianoTurnoInfo(cod);
  const consecOk = (nome, g) => {
    // catena consecutiva risultante aggiungendo un turno il giorno g
    let n = 1;
    for (let k = g - 1; k >= 1 && lavora(cella[nome + '|' + k] || ''); k--) n++;
    for (let k = g + 1; k <= nGiorni && lavora(cella[nome + '|' + k] || ''); k++) n++;
    return n <= maxCons;
  };
  const riposoOk = (nome, g, t) => {
    const prev = _pianoTurnoInfo(cella[nome + '|' + (g - 1)] || '');
    if (prev && prev.ora_fine && t.ora_inizio) {
      const finePrev = _pianoOra(prev.ora_fine);
      const fineAbs = prev.oltre23 || finePrev < _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next && next.ora_fine && t.ora_fine) {
      const fineT = _pianoOra(t.ora_fine);
      const fineTAbs = t.oltre23 || fineT < _pianoOra(t.ora_inizio) ? 24 + fineT : fineT;
      if (24 + _pianoOra(next.ora_inizio) - fineTAbs < minRiposo) return false;
    }
    return true;
  };
  const malattie = _pianoMalattieMese(ym);
  // donatori: turni GENERATI non protetti di chi è sopra (fissi sopra o jolly)
  const donatrici = righe
    .filter(
      (r) =>
        r.generato &&
        !r.protetto &&
        _pianoTurnoInfo(r.codice) &&
        nomi.includes(r.collaboratore) &&
        (infoDi[r.collaboratore].is_jolly || (saldo[r.collaboratore] || 0) > 1),
    )
    .sort(
      (x, y) =>
        (saldo[y.collaboratore] === undefined ? 999 : saldo[y.collaboratore]) -
        (saldo[x.collaboratore] === undefined ? 999 : saldo[x.collaboratore]),
    );
  const scambi = [];
  const mediaPrima = fissi.reduce((acc, n) => acc + Math.abs(saldo[n] || 0), 0) / (fissi.length || 1);
  for (const rT of donatrici) {
    const t = _pianoTurnoInfo(rT.codice);
    const g = parseInt(rT.data.split('-')[2]);
    const oT = parseFloat(t.durata_ore) || 0;
    const donatore = rT.collaboratore;
    const sD = infoDi[donatore].is_jolly ? 999 : saldo[donatore] || 0;
    if (sD !== 999 && sD - oT < -1) continue; // il donatore andrebbe troppo sotto
    // riceventi: fissi sotto le ore, ordinati dal più sotto
    const cand = fissi
      .filter((n) => n !== donatore && (saldo[n] || 0) < -1)
      .sort((x, y) => (saldo[x] || 0) - (saldo[y] || 0));
    for (const ric of cand) {
      const kR = ric + '|' + g;
      const celR = cella[kR] || '';
      const rigaR = rigaDi[kR];
      const libera = !celR || (celR === 'C' && rigaR && rigaR.generato && !rigaR.protetto);
      if (!libera) continue;
      if (malattie[ric + '|' + rT.data]) continue;
      if (!_pianoIdoneoPerTurno(ric, t)) continue;
      if (!consecOk(ric, g)) continue;
      if (!riposoOk(ric, g, t)) continue;
      // il ricevente non supera il proprio massimo (tolleranza_ore_sopra o simmetrica)
      const limR = _pianoLimitiOre(ric, nGiorni);
      if (limR.obiettivo != null && limR.max != null && (saldo[ric] || 0) + oT > limR.max - limR.obiettivo) continue;
      const sR = saldo[ric] || 0;
      const dopoD = sD === 999 ? 0 : Math.abs(sD - oT) - Math.abs(sD);
      const dopoR = Math.abs(sR + oT) - Math.abs(sR);
      if (dopoD + dopoR >= -0.25) continue; // deve migliorare davvero
      scambi.push({ rT: rT, rigaR: rigaR, ric: ric, g: g, cod: rT.codice });
      // aggiorna lo stato per i prossimi scambi
      cella[donatore + '|' + g] = 'C';
      cella[kR] = rT.codice;
      if (sD !== 999) saldo[donatore] = sD - oT;
      saldo[ric] = sR + oT;
      const pctD = parseFloat(infoDi[donatore].percentuale) || 1;
      ore[donatore] = (ore[donatore] || 0) - oT;
      ore[ric] = (ore[ric] || 0) + oT;
      break;
    }
  }
  if (!scambi.length) {
    toast('Nessuno scambio utile trovato: le ore sono già bilanciate al meglio');
    return;
  }
  const mediaDopo = fissi.reduce((acc, n) => acc + Math.abs(saldo[n] || 0), 0) / (fissi.length || 1);
  if (
    !confirm(
      'Migliora ore (' +
        ym +
        '):\n\n• ' +
        scambi.length +
        ' turni spostati da chi è sopra a chi è sotto le ore dovute (stesso giorno, regole rispettate)\n• Scarto medio dalle ore dovute: ' +
        mediaPrima.toFixed(1) +
        ' → ' +
        mediaDopo.toFixed(1) +
        ' ore\n\nSolo celle GENERATE, mai quelle protette. Procedere?',
    )
  )
    return;
  try {
    for (let i = 0; i < scambi.length; i += 8)
      await Promise.all(
        scambi.slice(i, i + 8).map(async (sc) => {
          await secPatch('piano', 'id=eq.' + sc.rT.id, { codice: 'C' });
          if (sc.rigaR) await secPatch('piano', 'id=eq.' + sc.rigaR.id, { codice: sc.cod });
          else
            await secPost('piano', {
              collaboratore: sc.ric,
              data: ym + '-' + String(sc.g).padStart(2, '0'),
              codice: sc.cod,
              protetto: false,
              generato: true,
              reparto_dip: _pianoReparto(),
            });
        }),
      );
    logAzione(
      'Piano: migliora ore',
      ym + ' — ' + scambi.length + ' scambi, scarto ' + mediaPrima.toFixed(1) + '→' + mediaDopo.toFixed(1),
    );
    toast(
      'Migliorato: ' +
        scambi.length +
        ' scambi (scarto medio ' +
        mediaPrima.toFixed(1) +
        '→' +
        mediaDopo.toFixed(1) +
        ' ore)',
    );
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore migliora ore');
  }
}

// ============================================================
// FORMAZIONE ↔ PIANO: avviso "non formato per il settore" e
// contatore dei giorni di formazione dai commenti
// ============================================================
function _pianoGruppoCompInv() {
  const m = _pianoCompetenzeGruppi();
  const inv = {};
  Object.entries(m).forEach(([k, g]) => {
    if (!inv[g]) inv[g] = k;
  });
  return inv;
}
// ritorna il gruppo (SALA/REC/CASSA) per cui il collaboratore NON risulta
// formato, oppure null. I commenti di formazione/affiancamento non contano.
function _pianoGruppoNonFormato(nome, codTurno, commento) {
  const t = _pianoTurnoInfo(codTurno);
  if (!t) return null;
  const g = (t.gruppo || '').toUpperCase();
  if (!['SALA', 'REC', 'CASSA'].includes(g)) return null;
  if (/formazion|affianc/i.test(commento || '')) return null;
  const info = _pianoCollabInfo(nome);
  if (!info) return null;
  const fz = ((info.funzione || '') + '').toUpperCase();
  if (['SUP', 'SOSTRESP', 'RESP'].includes(fz)) return null;
  // chi lavora quel settore IN ACCOMPAGNAMENTO (es. guardaroba con la rec)
  // è una situazione voluta: nessun avviso
  if (_pianoAccompagnamentoDi(info).includes(g)) return null;
  const sett = _pianoSettoriEffettivi(info);
  if (!sett || sett.includes(g)) return null;
  return g;
}
async function _pianoProponiCertificazione(nome, gruppo) {
  if (
    !confirm(
      nome +
        ' non risulta formato per ' +
        gruppo +
        '.\nVuoi aggiungerlo in Formazione?\n\nOK = certifica (ti chiederà formatore e punti, come dalla Formazione)\nAnnulla = il turno resta ma la Formazione non cambia',
    )
  )
    return;
  const key = _pianoGruppoCompInv()[gruppo];
  if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(nome, key, true);
}
// riepilogo bulk (import/incolla): certificazione SENZA punti
async function _pianoProponiCertificazioniBulk(coppie) {
  const mancanti = [];
  const visti = new Set();
  coppie.forEach((c) => {
    const g = _pianoGruppoNonFormato(c.nome, c.codice, c.commento);
    if (g && !visti.has(c.nome + '|' + g)) {
      visti.add(c.nome + '|' + g);
      mancanti.push({ nome: c.nome, gruppo: g });
    }
  });
  if (!mancanti.length) return;
  if (
    !confirm(
      'Alcuni collaboratori hanno ricevuto turni di settori per cui NON risultano formati:\n\n' +
        mancanti.map((x) => '• ' + x.nome + ' → ' + x.gruppo).join('\n') +
        '\n\nVuoi certificarli in Formazione? (senza punti: i punti si assegnano poi dalla pagina Formazione)',
    )
  )
    return;
  const inv = _pianoGruppoCompInv();
  for (const m of mancanti) {
    const key = inv[m.gruppo];
    if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(m.nome, key, false);
  }
}
// FORMAZIONI COMPLETATE dai commenti: cella con turno + commento
// "formazione/affianc..." = giorno di affiancamento; al raggiungimento
// della soglia (personalizzabile, default 5) propone la certificazione
function _pianoSettoreDaCommento(commento, gruppoTurno) {
  const c = (commento || '').toLowerCase();
  if (/cass/.test(c)) return 'CASSA';
  if (/rec/.test(c)) return 'REC';
  if (/sala/.test(c)) return 'SALA';
  if (/acc/.test(c)) return 'ACCOGLIENZA';
  return gruppoTurno;
}
async function controllaFormazioniCompletate(silenzioso) {
  const soglia = window._pianoGgFormazione || parseInt(await getImp('piano_giorni_formazione')) || 5;
  const rep = _pianoReparto();
  const pattern = ['%ormazion%', '%ORMAZION%', '%ffianc%', '%FFIANC%'];
  const tutte = [];
  for (const p of pattern) {
    const r = (await secGet('piano?commento=like.' + p + '&reparto_dip=eq.' + rep + '&limit=5000')) || [];
    r.forEach((x) => tutte.push(x));
  }
  const perId = {};
  tutte.forEach((r) => (perId[r.id] = r));
  const gruppi = {}; // nome|settore -> {giorni:Set, ultimo}
  Object.values(perId).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (!t) return;
    const sett = _pianoSettoreDaCommento(r.commento, (t.gruppo || '').toUpperCase());
    if (!['SALA', 'REC', 'CASSA'].includes(sett)) return;
    const k = r.collaboratore + '|' + sett;
    gruppi[k] = gruppi[k] || { giorni: new Set(), ultimo: '' };
    gruppi[k].giorni.add(r.data);
    if (r.data > gruppi[k].ultimo) gruppi[k].ultimo = r.data;
  });
  const oggi = new Date();
  const oggiStr =
    oggi.getFullYear() +
    '-' +
    String(oggi.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(oggi.getDate()).padStart(2, '0');
  const complete = [];
  Object.entries(gruppi).forEach(([k, v]) => {
    const [nome, sett] = k.split('|');
    if (v.giorni.size < soglia) return;
    if (v.ultimo > oggiStr) return; // la formazione deve essere FINITA
    const info = _pianoCollabInfo(nome);
    if (!info || info.attivo === false) return;
    const eff = _pianoSettoriEffettivi(info);
    if (eff && eff.includes(sett)) return; // già formato/certificato
    complete.push({ nome: nome, sett: sett, giorni: v.giorni.size, ultimo: v.ultimo });
  });
  if (!complete.length) {
    if (!silenzioso) toast('Nessuna formazione completata da certificare (soglia ' + soglia + ' giorni)');
    return;
  }
  for (const f of complete) {
    if (
      confirm(
        f.nome +
          ' ha COMPLETATO la formazione in ' +
          f.sett +
          ': ' +
          f.giorni +
          ' giorni di affiancamento (ultimo il ' +
          f.ultimo.split('-').reverse().join('.') +
          ', dai commenti del piano).\n\nVuoi certificarlo in Formazione?\n(OK = certifica — ti chiederà formatore e punti)',
      )
    ) {
      const key = _pianoGruppoCompInv()[f.sett];
      if (key && typeof certificaCompetenzaDaPiano === 'function') await certificaCompetenzaDaPiano(f.nome, key, true);
    }
  }
}
async function salvaGiorniFormazione() {
  const v = parseInt((document.getElementById('imp-gg-formazione') || {}).value);
  if (!v || v < 1) {
    toast('Inserisci un numero di giorni valido');
    return;
  }
  await setImp('piano_giorni_formazione', String(v));
  window._pianoGgFormazione = v;
  toast('Soglia giorni di formazione: ' + v);
}
