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
let _pianoRighe = []; // righe del mese/settore correnti
let _pianoMeseSel = new Date().toISOString().substring(0, 7);
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
  return isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_regole'));
}
function puoGestireFestivi() {
  return isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_festivi'));
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
function puoGestirePiano() {
  return typeof puoModificare === 'function' ? puoModificare('gestione_piano') : isAdmin();
}
// BRIEFING: permesso separato dal piano · gli operatori possono compilare e
// modificare il foglio del giorno senza toccare la griglia dei turni
function puoGestireBriefing() {
  return puoGestirePiano() || (typeof puoModificare === 'function' && puoModificare('gestione_briefing'));
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
    evidCfg,
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
  const mGiorni = testo.match(/(\d+)\s*giorni/i);
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
    // via le M salvate nei giorni sbagliati
    for (const d of daTogliere) {
      const righe =
        (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + d + '&codice=eq.M')) || [];
      for (const r of righe) {
        await secDel('piano', 'id=eq.' + r.id);
        tolte++;
      }
    }
    // M protetta sui giorni corretti (solo se nel piano esiste gia' qualcosa
    // o il mese e' pianificato: altrimenti la M automatica dal Diario basta)
    for (const d of daMettere) {
      const righe = (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + d)) || [];
      const r = righe[0];
      if (r && r.codice !== 'M') {
        await secPatch('piano', 'id=eq.' + r.id, {
          codice: 'M',
          protetto: true,
          generato: false,
          commento: ('Malattia (data corretta) · era ' + r.codice).substring(0, 400),
          operatore: getOperatore(),
          updated_at: new Date().toISOString(),
        });
        messe++;
      }
    }
    if (tolte || messe) {
      logAzione('Malattia corretta: piano allineato', nome + ' · ' + tolte + ' M tolte, ' + messe + ' M spostate');
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
  _pianoTab = t;
  localStorage.setItem('piano_tab', t);
  renderPiano();
}
// Le 13 tab raggruppate in 3 famiglie: si trova tutto a colpo d'occhio
const PIANO_TAB_GRUPPI = [
  ['Giornata', ['calendario', 'briefing']],
  ['Gestione', ['vacanze', 'saldo', 'recupero', 'timbrature', 'statistiche', 'benessere', 'storico', 'formulari']],
  ['Configurazione', ['turni', 'regole', 'festivi', 'impostazioni', 'guida']],
];
function _pianoTabBar() {
  const tabHtml = (k) => {
    const t = _PIANO_TABS.find((x) => x[0] === k);
    if (!t) return '';
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
    PIANO_TAB_GRUPPI.map(
      ([lbl, keys]) =>
        '<div class="piano-tabgroup"><span class="piano-tabgroup-label">' +
        lbl +
        '</span><div class="piano-tabgroup-tabs">' +
        keys.map(tabHtml).join('') +
        '</div></div>',
    ).join('<div class="piano-tabsep"></div>') +
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
    res.slice(0, grp.length).forEach((rr) => rr && righe.push(...rr));
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
  const recAnno = (await secGet('piano_recupero_ore?data=gte.' + _daA + '&data=lt.' + fine + '&limit=20000')) || [];
  recAnno.forEach((x) => {
    const m = parseInt(String(x.data).split('-')[1]);
    const k = x.collaboratore + '|' + m;
    recMese[k] = (recMese[k] || 0) + (parseFloat(x.ore) || 0);
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
        logAzione('Ore reali del mese tolte', nome + ' ' + ym);
        toast('Rettifica tolta: torna alle ore del piano');
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
      logAzione('Ore reali del mese', nome + ' ' + ym + ' = ' + ore + 'h' + (dati.nota ? ' (' + dati.nota + ')' : ''));
      toast('Ore reali registrate: ' + ore + 'h');
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
    const ym = _pianoMeseSel;
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
          '" oninput="pianoCercaFiltra(this.value)" title="Mostra solo i collaboratori il cui nome contiene il testo, oppure chi ha quella sigla nel mese (es. C8). Vuoto = tutti" style="font-size:.82rem;padding:4px 8px;border:1px solid var(--line);border-radius:3px;background:var(--paper);color:var(--ink);width:150px;margin-left:6px">';
        const ssnap = (window._pianoSessSnap || {})[_pianoMeseSel + '|' + _pianoReparto()];
        if (ssnap)
          h +=
            '<button class="btn-export" style="font-size:.82rem;padding:3px 9px;border-color:#c0392b;color:#c0392b" title="Riporta questo mese a com\'era quando hai iniziato a modificarlo in questa sessione (' +
            ssnap.n +
            ' operazioni tue)" onclick="pianoAnnullaTutto()">Annulla tutto (' +
            ssnap.n +
            ')</button>';
      }
      // barra comandi ORDINATA in gruppi: Pianifica · Controlla · Strumenti · Esporta
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
      const psep = '<span class="pbar-sep"></span>';
      if (puoMod) {
        h += psep;
        h += pbtn(
          'Genera bozza',
          'generaBozzaPiano()',
          'pbar-ok',
          'Riempie il fabbisogno con i collaboratori di questo settore (chi copre da altri settori NON viene usato)',
        );
        if (collaboratoriCache.some((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoCoperturaCfg(c)))
          h += pbtn(
            'Completa con coperture',
            'completaConCoperture()',
            '',
            'Tappa i buchi rimasti usando i collaboratori di altri settori abilitati a coprire qui. Da usare DOPO aver generato i piani dei loro reparti',
          );
        h += pbtn(
          'Migliora ore',
          'miglioraOrePiano()',
          '',
          'Dopo la bozza: scambia turni generati tra chi è sopra e chi è sotto le ore dovute (stesso giorno, regole rispettate)',
        );
        h += pbtn('Valida regole', 'validaPiano()', '');
        h += psep;
        h += pbtn('Copertura malattia', 'apriCoperturaMalattia()', '');
        h += pbtn('Cancella piano', 'cancellaBozzaPiano()', 'pbar-warn');
        h += psep;
        h += pbtn(
          'Ordine predefinito',
          'ripristinaOrdinePiano()',
          '',
          'Trascina i nomi per riordinare; questo pulsante ripristina SUP, BO, poi gli altri',
        );
        h += _pianoColoriBarHtml();
      }
      h += psep;
      h += pbtn('Copia per Excel', 'copiaPianoExcel()', 'pbar-soft');
      h += pbtn('Stampa PDF', 'stampaPianoPDF()', 'pbar-soft');
      if (puoMod) {
        h += pbtn('Importa piano', "document.getElementById('piano-imp-file').click()", 'pbar-soft');
        h +=
          '<input type="file" id="piano-imp-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="importaPianoExcel(this)">';
      }
      h +=
        '<span style="font-size:.8rem;color:var(--muted);margin-left:auto">' +
        _pianoRighe.length +
        ' assegnazioni' +
        (puoMod ? ' · click modifica, trascina o Shift+click per selezionare' : ' · sola lettura') +
        '</span></div>';
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
          '</div></th>';
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
              ore += parseFloat(t.durata_ore) || 0;
              oreLav += _pianoOreEffettiveTurno(t, r);
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
      h += '<div id="piano-config">' + _renderPianoBenessereCard() + '</div>';
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
    if (_pianoTab === 'recupero' && typeof _pianoRecuperoTotaliGenerali === 'function') _pianoRecuperoTotaliGenerali();
    if (_pianoTab === 'briefing') _briefSelezioneBind();
    if (_pianoTab === 'benessere' && typeof caricaBenesserePiano === 'function')
      setTimeout(() => caricaBenesserePiano(), 60);
    if (_pianoTab === 'statistiche' && typeof caricaStatisticheAnnoPiano === 'function')
      setTimeout(() => caricaStatisticheAnnoPiano(), 50);
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
  _pianoUndoSnap('rimozione cella');
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
    if (r.codice === 'M' || r.codice === 'M1') await _pianoMalattiaViaDiario(sel.nome, [sel.data]);
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

// ================================================================
// FASE 2 · VALIDATORE REGOLE (dai manuali Turnivo/Casino Lugano)
// ================================================================
let _pianoViolCelle = {}; // 'nome|data' -> [messaggi]
let _pianoViolLista = null; // ultima validazione (null = mai eseguita)

function _pianoOra(hhmm) {
  if (!hhmm) return null;
  const p = String(hhmm).split(':');
  return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
}
// Giorno del mese entro cui i Jolly consegnano le non disponibilita':
// regola 'nd_jolly_giorno' modificabile dall'admin (direttiva 16-007)
function _pianoGiornoNd() {
  const v = parseInt(_pianoRegolaVal('nd_jolly_giorno'));
  return v > 0 && v <= 28 ? v : 3;
}
// Valore di una regola PER IL SETTORE CORRENTE. Se esiste una regola scritta
// apposta per questo settore vince lei; altrimenti vale quella generale (campo
// settori vuoto). Una regola spenta non si applica.
function _pianoRegolaSettori(r) {
  return String((r && r.settori) || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
function _pianoRegolaVal(nome, rep) {
  const settore = (rep || (typeof _pianoReparto === 'function' ? _pianoReparto() : 'slots') || '').toLowerCase();
  const candidate = pianoRegoleCache.filter((x) => x.nome === nome);
  // 1) regola specifica del settore (ha la precedenza)
  const spec = candidate.find((x) => _pianoRegolaSettori(x).includes(settore));
  if (spec) return spec.attivo === false ? null : spec.valore;
  // 2) regola generale (nessun settore indicato)
  const gen = candidate.find((x) => !_pianoRegolaSettori(x).length);
  if (!gen || gen.attivo === false) return null;
  return gen.valore;
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
// Il sabato "chiude entro le 23"? Se il turno finisce oltre (o dopo la
// mezzanotte), la domenica seguente NON conta tra le 12 libere (LL art. 18)
function _pianoSabatoEntro23(codice) {
  if (!codice) return true;
  const t = _pianoTurnoInfo(codice);
  if (!t) return true; // codici speciali: niente lavoro
  if (t.oltre23) return false;
  const fi = _pianoOra(String(t.ora_fine || '').substring(0, 5));
  const ii = _pianoOra(String(t.ora_inizio || '').substring(0, 5));
  if (fi == null) return true;
  if (ii != null && fi < ii) return false; // finisce dopo mezzanotte
  return fi <= 23; // _pianoOra e' in ore decimali
}
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
      // chi copre da un altro settore ed e' segnato "accompagnato" non deve
      // restare da solo nel gruppo, esattamente come sopra
      const copAcc = _pianoCoperturaCfg(infoAcc);
      if (copAcc && copAcc.accompagnato) r._accGruppo = gr;
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
  // NON DISPONIBILITA': un turno assegnato in un giorno dichiarato ND
  const ndV = _pianoNdMese(ym);
  _pianoRighe.forEach((r) => {
    if (!_pianoTurnoInfo(r.codice)) return;
    if (ndV[r.collaboratore + '|' + r.data])
      aggiungi(
        r.collaboratore,
        parseInt(r.data.split('-')[2]),
        "turno su un giorno di NON disponibilita' (dal Diario)",
      );
  });
  // DOMENICHE LIBERE (OLL2 art. 24: minimo 12 all'anno · regola aziendale:
  // la domenica conta solo se il sabato si finisce entro le 23)
  if (_pianoRegolaVal('domeniche_libere_anno') != null) {
    const chkSab = _pianoRegolaVal('turno_prima_domenica_libera') === 'TRUE';
    Object.keys(perNome).forEach((nome) => {
      const info = _pianoCollabInfo(nome);
      if (!info || info.funzione === 'RESP') return;
      let libere = 0;
      let ultimaDom = 0;
      for (let g = 1; g <= nGiorni; g++) {
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        if (dow !== 0) continue;
        ultimaDom = g;
        const cod = perNome[nome][g];
        const lavora = cod && _pianoTurnoInfo(cod);
        if (lavora) continue;
        if (cod === 'V') continue; // in vacanza: non conta tra le 12
        const codSab = g > 1 ? perNome[nome][g - 1] : null;
        if (chkSab && !_pianoSabatoEntro23(codSab)) {
          aggiungi(nome, g, 'domenica non conteggiabile come libera: il sabato finisce oltre le 23');
          continue;
        }
        libere++;
      }
      if (ultimaDom && libere === 0)
        aggiungi(nome, ultimaDom, "nessuna domenica libera valida nel mese (minimo 12 all'anno)");
    });
  }

  return { celle: celle, lista: lista };
}

function validaPiano() {
  setTimeout(() => controllaFormazioniCompletate(true), 800);
  const r = _pianoCalcolaViolazioni();
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  logAzione('Piano validato', _pianoMeseSel + ' · ' + r.lista.length + ' violazioni');
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
    h += '<div>• <strong>' + escP(v.nome) + '</strong> · giorno ' + v.giorno + ': ' + escP(v.msg) + '</div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
}

// ================================================================
// FASE 2 · GENERA BOZZA (euristica istantanea, non il solver)
// Riempie i fabbisogni del mese rispettando: riposo 11h, max
// consecutivi, idoneità storica (gruppi già fatti), equità ore.
// Le celle esistenti (V, protette, malattie Diario) non si toccano.
// ================================================================
async function completaConCoperture() {
  if (!puoGestirePiano()) return;
  const chi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoCoperturaCfg(c))
    .map((c) => c.nome + ' (' + repartoLabel(c.reparto_dip || 'slots') + ')');
  if (!chi.length) {
    toast('Nessun collaboratore abilitato a coprire in questo settore');
    return;
  }
  if (
    !confirm(
      'Tappo i buchi rimasti di ' +
        _pianoMeseSel +
        ' usando chi copre da altri settori:\n\n' +
        chi.map((x) => '\u2022 ' + x).join('\n') +
        "\n\nI turni gia' inseriti non vengono toccati. Fallo DOPO aver generato i piani dei loro reparti, cosi' si vede chi e' davvero libero.",
    )
  )
    return;
  await generaBozzaPiano(true);
}
// usaCoperture = false (predefinito): riempie SOLO con i collaboratori del
// reparto, cosi' l'ordine con cui generi i piani non toglie nessuno al suo
// settore d'origine. Con true (bottone "Completa con coperture") si tappano i
// buchi rimasti usando chi e' abilitato a coprire da altri settori.
async function generaBozzaPiano(usaCoperture) {
  _pianoUndoSnap((usaCoperture ? 'coperture ' : 'genera bozza ') + _pianoMeseSel);
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
  // (stessa funzione scalabile di renderPiano)
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, _pianoReparto());
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
  const ndDiario = _pianoNdMese(ym);
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
  await _pianoCaricaOreMese(_pianoMeseSel);
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
            if (ndDiario[n + '|' + dstr]) return false; // non disponibile (dal Diario)
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
            // COPERTURA da un altro settore: rispetta i gruppi ammessi e il
            // tetto mensile di turni impostati nella scheda del collaboratore
            const cop = _pianoCoperturaCfg(infoC);
            if (cop && !usaCoperture) return false; // prima il reparto, le coperture in un secondo passaggio
            if (cop) {
              if (cop.gruppi && String(cop.gruppi).toUpperCase() !== (t.gruppo || '').toUpperCase()) return false;
              if (cop.max_turni) {
                let fatti = 0;
                for (let k = 1; k <= nGiorni; k++) {
                  const cod = cella[n + '|' + k];
                  const tk = cod && _pianoTurniReparto().find((x) => x.codice === cod);
                  if (tk) fatti++;
                }
                if (fatti >= cop.max_turni) return false;
              }
            }
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
            // accompagnato SOLO dove copre (spunta nella scheda): stessa regola
            if (cop && cop.accompagnato && !(contaGiornoTot[gruppoT + '|' + g] || 0)) return false;
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
            // chi COPRE da un altro settore va usato solo se il settore non ha
            // nessun altro disponibile: cosi' l'ordine di generazione dei piani
            // non toglie una persona al suo reparto d'origine
            const cx = _pianoCoperturaCfg(_pianoCollabInfo(x)) ? 1 : 0;
            const cy = _pianoCoperturaCfg(_pianoCollabInfo(y)) ? 1 : 0;
            return (
              cx - cy ||
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
  // festivo di DOMENICA: mai CGF (regola aziendale), qualunque sia il flag
  const festiviCgf = new Set(
    pianoFestiviCache.filter((f) => f.cgf !== false && _festivoCgfDefault(f.data)).map((f) => f.data),
  );
  const annoCorr = ym.split('-')[0];
  const annoPrec = String(Number(annoCorr) - 1);
  const cgfDovuti = {}; // nome -> [{daGiorno}]
  // saldo (maturati - goduti) su anno precedente + corrente: così un festivo
  // lavorato a fine dicembre viene compensato anche generando gennaio
  const contaturaCgf = {};
  storia.forEach((r) => {
    if (!r.data.startsWith(annoCorr) && !r.data.startsWith(annoPrec)) return;
    if (!_pianoMaturaCgf(_pianoCollabInfo(r.collaboratore))) return; // jolly: 50% in busta, niente recupero
    if (festiviCgf.has(r.data) && _pianoTurnoInfo(r.codice))
      contaturaCgf[r.collaboratore] = (contaturaCgf[r.collaboratore] || 0) + 1;
    if (r.codice === 'CGF') contaturaCgf[r.collaboratore] = (contaturaCgf[r.collaboratore] || 0) - 1;
  });
  nomi.forEach((n) => {
    if (!_pianoMaturaCgf(_pianoCollabInfo(n))) return;
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
          reparto_dip: _pianoReparto(),
        });
        nCgfAuto++;
        break;
      }
    });
  });

  // RIEMPIMENTO C: come nei piani fatti a mano, nessuna cella resta vuota ·
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
      // COMPLEANNO: il congedo di quel giorno porta la nota, cosi' si vede
      // subito nel piano e nel briefing (la data di nascita e' in scheda)
      const _dnMD = infoN.data_nascita ? String(infoN.data_nascita).substring(5, 10) : '';
      nuove.push({
        collaboratore: n,
        data: dstrG,
        codice: 'C',
        protetto: false,
        generato: true,
        commento: _dnMD && _dnMD === dstrG.substring(5, 10) ? 'Compleanno' : null,
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
    logAzione('Piano: bozza generata', ym + ' · ' + nuove.length + ' turni, ' + scoperti.length + ' scoperti');
    toast(
      'Bozza generata: ' +
        ((r && r.inserite) || nuove.length) +
        ' turni' +
        (scoperti.length ? ' · ' + scoperti.length + ' scoperti' : ''),
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
    '<h3>Cancella piano · ' +
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
    (isAdmin()
      ? '<button class="btn-modal-ok" style="background:var(--accent)" onclick="eseguiCancellaPiano(true)">TUTTE (' +
        _pianoRighe.length +
        ')</button>'
      : '') +
    '</div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCancellaPiano(tutto) {
  // cancellare ANCHE le celle protette (piano reale) e' riservato all'admin
  if (tutto && !isAdmin()) return;
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
  _pianoUndoSnap('cancella piano ' + _pianoMeseSel + (tutto ? ' (tutto)' : ''));
  try {
    await secDel(
      'piano',
      'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + (tutto ? '' : '&protetto=eq.false'),
    );
    logAzione('Piano: cancellato', ym + ' · ' + n + ' celle (tutto=' + tutto + ')');
    toast('Piano cancellato: ' + n + ' celle rimosse');
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}

// ================================================================
// REGOLE DEL PIANO · card admin: elenco ordinato, valori e stato
// modificabili. Etichetta onesta su DOVE ogni regola è applicata.
// ================================================================
// Fonte normativa di ogni regola: si legge accanto al valore, cosi' chi la
// modifica sa da dove viene (RAP, direttiva interna, legge sul lavoro)
const PIANO_REGOLE_FONTE = {
  jolly_indennita_vacanze_4sett: 'RAP Allegato 1: indennita vacanze 8.33% (4 settimane) sul salario orario',
  jolly_indennita_vacanze_5sett: 'RAP Allegato 1: indennita vacanze 10.65% (5 settimane) sul salario orario',
  jolly_indennita_tredicesima: 'RAP Allegato 1: tredicesima 8.33% sul salario orario',
  notte_inizio: 'RAP Allegato 1 (personale ausiliario) · fascia notturna di legge',
  notte_fine: 'RAP Allegato 1 (personale ausiliario) · fascia notturna di legge',
  notte_percentuale: 'RAP Allegato 1: 10% del tempo di lavoro notturno come tempo libero pagato',
  min_riposo_ore: 'LL art. 15a · direttiva 16-007',
  max_consecutivi: 'LL art. 21 · OLL1 art. 20',
  domeniche_libere_anno: 'OLL2 art. 24 cpv. 2 · direttiva 16-007',
  turno_prima_domenica_libera: 'LL art. 18: la domenica libera vale se il sabato si finisce entro le 23:00',
  nd_jolly_giorno: 'Direttiva 16-007 · formulario HR 1187',
  jolly_ore_min: 'RAP All. 1 · personale ausiliario',
  jolly_ore_max: 'RAP All. 1 · personale ausiliario',
  tolleranza_ore: 'RAP 3.1: 41 ore settimanali su media mensile',
  tolleranza_ore_sopra: 'RAP 3.1: max 45 ore in alta stagione',
};
const PIANO_REGOLE_DOVE = {
  jolly_indennita_vacanze_4sett: 'Statistiche anno (colonna Ore lavorate ausiliari)',
  jolly_indennita_vacanze_5sett: 'Statistiche anno (colonna Ore lavorate ausiliari)',
  jolly_indennita_tredicesima: 'Statistiche anno (colonna Ore lavorate ausiliari)',
  notte_inizio: 'Statistiche anno (colonna Notte 10%)',
  notte_fine: 'Statistiche anno (colonna Notte 10%)',
  notte_percentuale: 'Statistiche anno (colonna Notte 10%)',
  domeniche_libere_anno: 'Validatore + Statistiche',
  turno_prima_domenica_libera: 'Validatore + Statistiche',
  nd_jolly_giorno: 'Formulario non disponibilità (scheda Formulari + PDF)',
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
  if (!puoGestireRegole()) return _pianoSchedaRiservata('Regole del piano', 'Regole del piano');
  const ordineTipo = { HARD: 1, SOFT: 2, PIPELINE: 3 };
  const tutteRegole = pianoRegoleCache
    .slice()
    .sort((a, b) => (ordineTipo[a.tipo] || 9) - (ordineTipo[b.tipo] || 9) || (b.peso || 0) - (a.peso || 0));
  // le regole non ancora attive nel Diario ("Solver Fase 3") sono rumore per
  // chi consulta: nascoste dietro un interruttore
  const nonAttive = tutteRegole.filter((r) => _pianoRegoleDove(r.nome).indexOf('Fase 3') !== -1);
  const regole = window._pianoRegoleMostraTutte
    ? tutteRegole
    : tutteRegole.filter((r) => _pianoRegoleDove(r.nome).indexOf('Fase 3') === -1);
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole del piano (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">HARD = mai violabili (il validatore le segnala). SOFT = preferenze con peso. PIPELINE = usate dal generatore.' +
    (nonAttive.length
      ? ' <a href="#" style="color:#8b6914;font-weight:700" onclick="window._pianoRegoleMostraTutte=!window._pianoRegoleMostraTutte;renderPiano();return false">' +
        (window._pianoRegoleMostraTutte
          ? 'Nascondi le regole non attive'
          : 'Mostra anche ' + nonAttive.length + ' regole conservate ma non ancora attive (Solver Fase 3)') +
        '</a>'
      : '') +
    '</p>';
  let tipoCorr = '';
  h += '<div style="overflow-x:auto"><table class="piano-table" style="min-width:720px;font-size:.85rem">';
  h +=
    '<thead><tr><th style="text-align:left">Regola</th><th style="text-align:left">Descrizione</th><th>Valore</th><th style="min-width:150px">Vale per</th><th>Peso</th><th>Attiva</th><th>Applicata da</th></tr></thead><tbody>';
  regole.forEach((r) => {
    if (r.tipo !== tipoCorr) {
      tipoCorr = r.tipo;
      h +=
        '<tr><td colspan="7" style="text-align:left;background:var(--paper2);font-weight:700;letter-spacing:.06em">' +
        escP(tipoCorr) +
        '</td></tr>';
    }
    const settR = _pianoRegolaSettori(r);
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(r.nome) +
      (settR.length
        ? ' <span style="font-weight:400;font-size:.82rem;color:#8b6914">(solo ' + escP(settR.join(', ')) + ')</span>'
        : '') +
      '</td><td style="text-align:left;white-space:normal;min-width:220px">' +
      escP(r.descrizione || '') +
      '</td><td><input type="text" value="' +
      escP(r.valore || '') +
      '" onchange="salvaPianoRegola(' +
      r.id +
      ',\'valore\',this.value)" style="width:64px;padding:3px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left;font-size:.8rem">' +
      (settR.length
        ? escP(settR.map((s) => repartoLabel(s)).join(', ')) +
          ' <button class="btn-del-tipo" style="font-size:.82rem;padding:1px 6px" onclick="pianoRegolaSettoriEdit(' +
          r.id +
          ')">cambia</button>'
        : '<span style="color:var(--muted)">tutti i settori</span> <button class="btn-del-tipo" style="font-size:.82rem;padding:1px 6px" onclick="pianoRegolaEccezione(\'' +
          escP(r.nome) +
          '\')">eccezione per un settore</button>') +
      '</td><td>' +
      (r.peso || 0) +
      '</td><td><input type="checkbox"' +
      (r.attivo !== false ? ' checked' : '') +
      ' onchange="salvaPianoRegola(' +
      r.id +
      ',\'attivo\',this.checked)"></td><td style="font-size:.82rem;color:' +
      (_pianoRegoleDove(r.nome).indexOf('Fase 3') === -1 ? '#2c6e49;font-weight:700' : 'var(--muted)') +
      ';text-align:left">' +
      _pianoRegoleDove(r.nome) +
      (PIANO_REGOLE_FONTE[r.nome]
        ? '<br><span style="font-weight:400;color:var(--muted);font-size:.82rem">' +
          escP(PIANO_REGOLE_FONTE[r.nome]) +
          '</span>'
        : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div></div></div>';
  return h;
}
// Crea una regola SPECIFICA per uno o piu' settori a partire da quella
// generale: la generale resta e continua a valere ovunque, la nuova vince nei
// settori indicati. Non si duplicano tutte le regole, solo l'eccezione.
async function pianoRegolaEccezione(nome) {
  if (!isAdmin()) return;
  const gen = pianoRegoleCache.find((x) => x.nome === nome && !_pianoRegolaSettori(x).length);
  if (!gen) return;
  const elenco = (typeof getReparti === 'function' ? getReparti() : []).map((r) => r.key).join(', ');
  const sett = prompt(
    'Per quali settori vale l\'eccezione a "' +
      nome +
      '"?\n\nScrivi i settori separati da virgola.' +
      (elenco ? '\nDisponibili: ' + elenco : ''),
    typeof _pianoReparto === 'function' ? _pianoReparto() : '',
  );
  if (sett === null) return;
  const pulito = String(sett)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
  if (!pulito) return;
  const val = prompt('Valore di "' + nome + '" per ' + pulito + ':', gen.valore || '');
  if (val === null) return;
  try {
    const nuova = await secPost('piano_regole', {
      nome: nome,
      valore: String(val).trim(),
      tipo: gen.tipo,
      peso: gen.peso,
      attivo: true,
      descrizione: gen.descrizione,
      settori: pulito,
    });
    if (nuova && nuova[0]) pianoRegoleCache.push(nuova[0]);
    logAzione('Regola per settore', nome + ' = ' + val + ' per ' + pulito);
    toast('Eccezione creata: ' + nome + ' = ' + val + ' per ' + pulito);
    renderPiano();
  } catch (e) {
    toast('Errore: esiste gia\' una regola "' + nome + '" per quei settori');
  }
}
// Cambia i settori di una regola specifica (vuoto = torna generale)
async function pianoRegolaSettoriEdit(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleCache.find((x) => x.id === id);
  if (!r) return;
  const sett = prompt(
    'Settori per la regola "' + r.nome + '" (vuoto = vale per tutti i settori):',
    _pianoRegolaSettori(r).join(','),
  );
  if (sett === null) return;
  const pulito = String(sett)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
  try {
    await secPatch('piano_regole', 'id=eq.' + id, { settori: pulito || null });
    r.settori = pulito || null;
    logAzione('Regola per settore', r.nome + ' -> ' + (pulito || 'tutti i settori'));
    toast(pulito ? 'Ora vale per: ' + pulito : 'Ora vale per tutti i settori');
    renderPiano();
  } catch (e) {
    toast('Errore aggiornamento settori');
  }
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
// PERSONALIZZAZIONE COMPLETA · fabbisogni, turni, codici, festivi
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

// Import fabbisogno da CSV/Excel · formato Turnivo (upload_fabbisogno):
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
          (foglioMese ? '' : ' · manca il foglio del mese selezionato') +
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
          '\n\nATTENZIONE: il fabbisogno esistente del mese viene SOSTITUITO.',
      )
    )
      return;
    const da = ym + '-01';
    const a = ym + '-' + String(nGiorni).padStart(2, '0');
    await secDel('piano_fabbisogni', 'data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto());
    for (let i = 0; i < nuovi.length; i += 10)
      await Promise.all(nuovi.slice(i, i + 10).map((f) => secPost('piano_fabbisogni', f)));
    logAzione('Fabbisogno importato', ym + ' · ' + nuovi.length + ' celle');
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
    const saltatiDisattivati = []; // disattivati con soli riposi nel file: righe di riempimento, non si importano
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
        // disattivato con SOLI riposi nel file: e' la riga di riempimento del
        // foglio HR (es. tutto C dopo che ha smesso), non va importata,
        // altrimenti il collaboratore riappare nel piano con mesi di sole C
        const soloRiposi = celle.every((c) => {
          if (c.cod === 'C' || c.cod === 'V' || c.cod === 'WD') return true;
          const cs = _pianoCodiceInfo(c.cod);
          return !!(cs && cs.is_riposo);
        });
        if (soloRiposi) {
          saltatiDisattivati.push(hit.nome);
          return;
        }
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
          (saltatiDisattivati.length
            ? '\n• Saltati (disattivati, nel file solo riposi): ' + saltatiDisattivati.join(', ')
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
    logAzione('Piano importato da Excel', ym + ' · ' + ((r && r.inserite) || 0) + '/' + nuove.length + ' celle');
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
    logAzione('Fabbisogno eliminato', ym + ' · ' + n + ' celle');
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
// ===== CONTROLLO DEL SUPPLEMENTO NOTTURNO NELLE DURATE DEI TURNI =====
// Chi lavora nella fascia notturna matura il 10% di quelle ore in piu': il
// supplemento e' compreso nella DURATA del turno, quindi entra da solo nelle
// ore del mese e nel saldo. Qui si verifica turno per turno che la durata
// dichiarata corrisponda a "ore effettive + 10% delle ore notturne".
function _pianoDurataAttesa(t) {
  const i = _pianoOra(t.ora_inizio);
  let f = _pianoOra(t.ora_fine);
  if (i == null || f == null) return null;
  if (f <= i) f += 24;
  const eff = f - i;
  const nott = _pianoOreNotturneTurno(t);
  return Math.round((eff + _pianoNotteRecupero(nott)) * 100) / 100;
}
// Ore decimali scritte come le legge una persona: 8.5 -> "8h30".
// Serve a controllare i turni in sessantesimi, che e' come si ragiona sui turni.
function _pianoOreHm(ore) {
  const v = parseFloat(ore);
  if (isNaN(v)) return '-';
  const segno = v < 0 ? '-' : '';
  const min = Math.round(Math.abs(v) * 60);
  return segno + Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
}
// Durata dall'orologio: differenza fra entrata e uscita, senza supplementi
function _pianoDurataOrologio(t) {
  const e = _pianoOra(t.ora_inizio);
  const u = _pianoOra(t.ora_fine);
  if (e == null || u == null) return null;
  return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
}
async function pianoVerificaDurateNotte() {
  if (!isAdmin()) return;
  const tutti = pianoTurniCache.filter((t) => t.attivo !== false && t.ora_inizio && t.ora_fine);
  const perc = parseFloat(_pianoRegolaVal('notte_percentuale')) || 10;
  const problemi = [];
  tutti.forEach((t) => {
    // si controllano TUTTI i turni con orario, anche quelli senza ore notturne:
    // una durata sbagliata di un turno diurno vale come una di un notturno
    const nott = _pianoOreNotturneTurno(t);
    const attesa = _pianoDurataAttesa(t);
    const dich = parseFloat(t.durata_ore);
    if (attesa == null || isNaN(dich)) return;
    const diff = Math.round((attesa - dich) * 100) / 100;
    // sotto i 3 minuti e' arrotondamento, non un errore
    if (Math.abs(diff) * 60 >= 3) problemi.push({ t: t, nott: nott, attesa: attesa, dich: dich, diff: diff });
  });
  const conNotte = tutti.length;
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Supplemento notturno del ' +
    perc +
    '%</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Fascia notturna ' +
    (parseFloat(_pianoRegolaVal('notte_inizio')) || 23) +
    ':00-' +
    (parseFloat(_pianoRegolaVal('notte_fine')) || 6) +
    ':00. Turni con orario: <b>' +
    conNotte +
    '</b>, di cui <b>' +
    problemi.length +
    '</b> con durata da sistemare (scarto di almeno 3 minuti; sotto e arrotondamento).</p>';
  if (!problemi.length) {
    h +=
      '<p style="font-size:.9rem;color:#2c6e49;font-weight:700">Tutte le durate comprendono correttamente il supplemento notturno.</p>';
  } else {
    h +=
      '<div style="max-height:48vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.82rem"><thead><tr><th style="text-align:left">Turno</th><th>Orario</th><th title="Dall entrata all uscita">Durata reale</th><th>Ore notturne</th><th title="10% delle ore notturne">Supplemento</th><th>Durata scritta ora</th><th>Durata corretta</th><th>Differenza</th></tr></thead><tbody>';
    problemi.forEach((p) => {
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(p.t.codice) +
        ' <span style="font-weight:400;color:var(--muted)">' +
        escP(repartoLabel(p.t.reparto_dip || 'slots')) +
        '</span></td><td>' +
        (p.t.ora_inizio || '').substring(0, 5) +
        '-' +
        (p.t.ora_fine || '').substring(0, 5) +
        '</td><td>' +
        _pianoOreHm(_pianoDurataOrologio(p.t)) +
        '</td><td>' +
        _pianoOreHm(p.nott) +
        '</td><td>' +
        _pianoOreHm(_pianoNotteRecupero(p.nott)) +
        '</td><td>' +
        _pianoOreHm(p.dich) +
        ' <span style="color:var(--muted)">(' +
        p.dich +
        ')</span></td><td style="font-weight:700">' +
        _pianoOreHm(p.attesa) +
        ' <span style="font-weight:400;color:var(--muted)">(' +
        p.attesa +
        ')</span></td><td style="font-weight:700;color:' +
        (p.diff > 0 ? '#c0392b' : '#8b6914') +
        '">' +
        (p.diff > 0 ? '+' : '') +
        Math.round(p.diff * 60) +
        ' min</td></tr>';
    });
    h += '</tbody></table></div>';
    h +=
      '<p style="font-size:.8rem;color:var(--muted);margin-top:8px">In rosso i turni in cui manca il supplemento (le ore andrebbero aumentate), in giallo quelli che ne hanno piu\' del previsto. Controlla prima di correggere: un turno puo\' avere una durata diversa per accordi particolari (per esempio pause non pagate).</p>';
    h +=
      '<div class="pwd-modal-btns" style="margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button>' +
      '<button class="btn-modal-ok" onclick="pianoCorreggiDurateNotte()">Correggi tutte le durate</button></div>';
    window._pianoDurateDaFixare = problemi.map((p) => ({ id: p.t.id, codice: p.t.codice, attesa: p.attesa }));
    b.innerHTML = h;
    document.getElementById('pwd-modal').classList.remove('hidden');
    return;
  }
  h +=
    '<div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function pianoCorreggiDurateNotte() {
  if (!isAdmin()) return;
  const lista = window._pianoDurateDaFixare || [];
  if (!lista.length) return;
  if (
    !confirm(
      'Aggiorno la durata di ' +
        lista.length +
        " turni con il supplemento notturno compreso?\n\nLe ore gia' salvate nei piani non cambiano da sole: il nuovo valore vale dai prossimi conteggi.",
    )
  )
    return;
  document.getElementById('pwd-modal').classList.add('hidden');
  let fatti = 0;
  try {
    for (const x of lista) {
      await secPatch('piano_turni', 'id=eq.' + x.id, { durata_ore: x.attesa });
      const t = pianoTurniCache.find((y) => y.id === x.id);
      if (t) t.durata_ore = x.attesa;
      fatti++;
    }
    logAzione('Turni: durate con supplemento notturno', fatti + ' turni aggiornati');
    toast(fatti + ' durate aggiornate');
    window._pianoDurateDaFixare = [];
    renderPiano();
  } catch (e) {
    toast('Errore: aggiornati ' + fatti + ' su ' + lista.length);
  }
}
// ===== BENESSERE DEI COLLABORATORI =====
// Fotografia oggettiva di come e' distribuito il carico di lavoro nell'anno,
// separata tra personale fisso e ausiliario perche' hanno regole diverse.
// Il punteggio (0-100) lo calcola il motore PianoRegole.indiceBenessere: qui
// si raccolgono solo i dati dal piano.
function _renderPianoBenessereCard() {
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px">Benessere · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' ' +
    escP(_pianoMeseSel.split('-')[0]) +
    '<button class="btn-act pin" onclick="pianoBenessereAnno(-1)">&larr;</button><button class="btn-act pin" onclick="pianoBenessereAnno(1)">&rarr;</button>' +
    '<input type="text" id="benessere-cerca" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoBenessereFiltra(this.value)">' +
    '</div><div style="padding:10px 14px" id="piano-benessere-body"><p style="color:var(--muted);font-size:.85rem">Caricamento...</p></div></div>'
  );
}
function pianoBenessereAnno(d) {
  window._pianoBenessereAnno = (window._pianoBenessereAnno || parseInt(_pianoMeseSel.split('-')[0])) + d;
  caricaBenesserePiano();
}
async function caricaBenesserePiano() {
  const el = document.getElementById('piano-benessere-body');
  if (!el) return;
  const anno = window._pianoBenessereAnno || parseInt(_pianoMeseSel.split('-')[0]);
  el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Calcolo del ' + anno + ' in corso...</p>';
  try {
    const righe =
      (await secGet(
        'piano?data=gte.' +
          anno +
          '-01-01&data=lte.' +
          anno +
          '-12-31&reparto_dip=eq.' +
          _pianoReparto() +
          '&limit=40000',
      )) || [];
    const nomi = collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && c.funzione !== 'RESP')
      .map((c) => c.nome);
    // dati per persona
    const per = {};
    nomi.forEach((n) => (per[n] = { giorni: {}, lav: 0, notti: 0, we: 0, vac: 0, mal: 0, domLib: 0, oreLav: 0 }));
    righe.forEach((r) => {
      const p = per[r.collaboratore];
      if (!p) return;
      p.giorni[r.data] = r.codice;
    });
    const domeniche = {};
    for (let m = 0; m < 12; m++) {
      const ultimo = new Date(anno, m + 1, 0).getDate();
      for (let g = 1; g <= ultimo; g++) {
        const d = new Date(anno, m, g);
        if (d.getDay() === 0)
          domeniche[
            d.getFullYear() +
              '-' +
              String(d.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(d.getDate()).padStart(2, '0')
          ] = true;
      }
    }
    // PERIODO CONSIDERATO: solo i MESI CON PIANO COMPLETO (tutti i giorni del
    // mese hanno una cella), anche se sono nel futuro. Un mese a meta' o non
    // ancora pianificato falserebbe medie e conteggi, quindi resta fuori.
    const giorniDelMese = {};
    for (let m = 1; m <= 12; m++) {
      const ym = anno + '-' + String(m).padStart(2, '0');
      giorniDelMese[ym] = new Date(anno, m, 0).getDate();
    }
    nomi.forEach((n) => {
      const p = per[n];
      const date = Object.keys(p.giorni).sort();
      // mesi completi di questa persona
      const perMese = {};
      date.forEach((d) => {
        const ym = d.substring(0, 7);
        perMese[ym] = (perMese[ym] || 0) + 1;
      });
      const mesiOk = new Set(Object.keys(perMese).filter((ym) => perMese[ym] >= giorniDelMese[ym]));
      p.mesiPiano = mesiOk.size;
      p.mesiElenco = [...mesiOk].sort();
      let serie = 0;
      p.serieMax = 0;
      p.riposiIsolati = 0;
      date.forEach((d, i) => {
        if (!mesiOk.has(d.substring(0, 7))) return; // mese non completo: fuori
        const cod = p.giorni[d];
        const t = _pianoTurnoInfo(cod);
        if (t) {
          p.lav++;
          p.oreLav += _pianoOreEffettiveTurno(t, { codice: cod });
          if (t.tipo === 'NOTTURNO') p.notti++;
          const dow = new Date(d + 'T12:00:00').getDay();
          if (dow === 0 || dow === 6) p.we++;
          if (dow === 0) p.domLav = (p.domLav || 0) + 1;
          serie++;
          if (serie > p.serieMax) p.serieMax = serie;
        } else {
          serie = 0;
          if (cod === 'V') p.vac++;
          if (cod === 'M' || cod === 'M1') p.mal++;
          const prima = _pianoTurnoInfo(p.giorni[date[i - 1]]);
          const dopo = _pianoTurnoInfo(p.giorni[date[i + 1]]);
          const cs = _pianoCodiceInfo(cod);
          if (cs && cs.is_riposo && prima && dopo) p.riposiIsolati++;
        }
      });
      // DOMENICHE LIBERE nei soli mesi completi. Vale la regola LL art. 18: la
      // domenica libera conta solo se il sabato prima si finisce entro le 23.
      p.domTot = 0;
      p.domTardi = 0;
      Object.keys(domeniche).forEach((d) => {
        if (!mesiOk.has(d.substring(0, 7))) return;
        const cod = p.giorni[d];
        // Una domenica passata in VACANZA (o in malattia) non e' un riposo
        // settimanale: non conta ne' come libera ne' nel totale.
        if (cod === 'V' || cod === 'M' || cod === 'M1') {
          p.domAssenza = (p.domAssenza || 0) + 1;
          return;
        }
        p.domTot++;
        if (_pianoTurnoInfo(cod)) return; // domenica lavorata
        const sab = new Date(d + 'T12:00:00');
        sab.setDate(sab.getDate() - 1);
        const isoSab =
          sab.getFullYear() +
          '-' +
          String(sab.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(sab.getDate()).padStart(2, '0');
        if (!_pianoSabatoEntro23(p.giorni[isoSab])) {
          p.domTardi++;
          return;
        }
        p.domLib++;
      });
    });
    const conPiano = nomi.filter((n) => per[n].lav > 0);
    const mediaWe = conPiano.length ? conPiano.reduce((s, n) => s + per[n].we, 0) / conPiano.length : 0;
    const soglie = {
      domenicheAnno: parseInt(_pianoRegolaVal('domeniche_libere_anno')) || 12,
      maxConsecutivi: parseInt(_pianoRegolaVal('max_consecutivi')) || 5,
      vacanzeAnno: parseInt(_pianoRegolaVal('vacanze_giorni_anno')) || 20,
    };
    const calcolati = conPiano
      .map((n) => {
        const p = per[n];
        const info = _pianoCollabInfo(n) || {};
        const res = PianoRegole.indiceBenessere(
          {
            domenicheLibere: p.domLib,
            weekendLavorati: p.we,
            weekendMediaSettore: mediaWe,
            notti: p.notti,
            giorniLavorati: p.lav,
            riposiIsolati: p.riposiIsolati,
            serieMax: p.serieMax,
            vacanzeGiorni: p.vac,
          },
          soglie,
        );
        return { nome: n, jolly: !!(info.is_jolly || info.impiego === 'jolly'), p: p, res: res };
      })
      .sort((a, b) => {
        const so = window._benessereSort;
        if (!so) return a.res.punteggio - b.res.punteggio; // default: prima i piu critici
        const val = (x) =>
          so.campo === 'nome' ? x.nome : so.campo === 'indice' ? x.res.punteggio : x.p[so.campo] || 0;
        const va = val(a);
        const vb = val(b);
        if (typeof va === 'string') return so.dir * va.localeCompare(vb);
        return so.dir * (va - vb);
      });
    if (!calcolati.length) {
      el.innerHTML = '<p style="font-size:.85rem">Nessun piano nel ' + anno + ' per questo settore.</p>';
      return;
    }
    const colore = (v) => (v >= 75 ? '#2c6e49' : v >= 55 ? '#b8860b' : '#c0392b');
    const etichetta = (v) => (v >= 75 ? 'buono' : v >= 55 ? "da tenere d'occhio" : 'critico');
    const tabella = (lista, titolo) => {
      if (!lista.length) return '';
      const media = Math.round(lista.reduce((s, x) => s + x.res.punteggio, 0) / lista.length);
      let t =
        '<p style="font-size:.85rem;font-weight:700;margin:14px 0 6px">' +
        titolo +
        ' <span style="font-weight:400;color:var(--muted)">· ' +
        lista.length +
        ' persone, media ' +
        '<b style="color:' +
        colore(media) +
        '">' +
        media +
        '/100</b></span></p>';
      const thOrd = (campo, testo, tip) =>
        '<th style="cursor:pointer" title="' +
        (tip || '') +
        ' · clicca per ordinare" onclick="pianoBenessereOrdina(\'' +
        campo +
        '\')">' +
        testo +
        (window._benessereSort && window._benessereSort.campo === campo
          ? window._benessereSort.dir > 0
            ? ' &#9650;'
            : ' &#9660;'
          : '') +
        '</th>';
      t +=
        '<div style="overflow-x:auto"><table class="piano-table benessere-tab" style="min-width:860px;font-size:.95rem"><thead><tr>' +
        '<th style="text-align:left;cursor:pointer" onclick="pianoBenessereOrdina(\'nome\')">Collaboratore' +
        (window._benessereSort && window._benessereSort.campo === 'nome'
          ? window._benessereSort.dir > 0
            ? ' &#9650;'
            : ' &#9660;'
          : '') +
        '</th>' +
        thOrd('indice', 'Indice', 'Punteggio complessivo, 100 = carico ben distribuito') +
        thOrd('domLib', 'Dom. libere', 'Domeniche libere gia trascorse quest anno') +
        thOrd('domLav', 'Dom. lavorate', 'Domeniche in cui ha lavorato') +
        thOrd('we', 'Weekend', 'Sabati e domeniche lavorati (giornate, non fine settimana interi)') +
        thOrd('notti', 'Notti', 'Turni notturni') +
        thOrd('riposiIsolati', 'Riposi isolati', 'Riposi di un solo giorno tra due periodi di lavoro') +
        thOrd('serieMax', 'Serie max', 'Serie piu lunga di giorni consecutivi') +
        thOrd('vac', 'Vacanze', 'Giorni di vacanza goduti') +
        thOrd('mal', 'Malattie', 'Giorni di malattia: segnale da leggere, non tolgono punti') +
        thOrd('oreLav', 'Ore lavorate', 'Ore effettivamente lavorate nell anno') +
        '</tr></thead><tbody>';
      lista.forEach((x) => {
        t +=
          '<tr title="' +
          escP(x.res.voci.map((v) => v.nome + ': ' + v.punti + '/' + v.max + ' (' + v.valore + ')').join(' · ')) +
          '" data-nome="' +
          escP(x.nome) +
          '"><td style="text-align:left;font-weight:600">' +
          escP(x.nome) +
          '</td><td style="min-width:120px"><div style="display:flex;align-items:center;gap:6px">' +
          '<div style="flex:1;height:7px;background:var(--line);border-radius:4px;overflow:hidden"><div style="width:' +
          x.res.punteggio +
          '%;height:100%;background:' +
          colore(x.res.punteggio) +
          '"></div></div><b style="color:' +
          colore(x.res.punteggio) +
          '">' +
          x.res.punteggio +
          '</b></div><div style="font-size:.8rem;color:var(--muted);text-align:center">' +
          etichetta(x.res.punteggio) +
          '</div></td><td title="' +
          x.p.domLib +
          ' libere su ' +
          (x.p.domTot || 0) +
          ' domeniche nei mesi con piano completo (' +
          (x.p.mesiPiano || 0) +
          ' mesi)' +
          (x.p.domTardi ? ' · ' + x.p.domTardi + ' non valide: il sabato si finisce dopo le 23' : '') +
          (x.p.domAssenza ? ' · ' + x.p.domAssenza + ' escluse perche in vacanza o malattia' : '') +
          '">' +
          x.p.domLib +
          '<span style="font-weight:400;color:var(--muted);font-size:.85rem">/' +
          (x.p.domTot || 0) +
          '</span></td><td>' +
          (x.p.domLav || 0) +
          '</td><td>' +
          x.p.we +
          '</td><td>' +
          x.p.notti +
          '</td><td' +
          (x.p.riposiIsolati > 2 ? ' style="color:#c0392b;font-weight:700"' : '') +
          '>' +
          x.p.riposiIsolati +
          '</td><td' +
          (x.p.serieMax > soglie.maxConsecutivi ? ' style="color:#c0392b;font-weight:700"' : '') +
          '>' +
          x.p.serieMax +
          '</td><td>' +
          x.p.vac +
          '</td><td' +
          (x.p.mal > 20 ? ' style="color:#b8860b;font-weight:700"' : '') +
          '>' +
          x.p.mal +
          '</td><td>' +
          Math.round(x.p.oreLav) +
          'h</td></tr>';
      });
      t += '</tbody></table></div>';
      return t;
    };
    let h =
      '<p style="font-size:.88rem;color:var(--muted);margin-bottom:6px">' +
      _benesserePeriodoLbl(calcolati, anno) +
      ' ' +
      ', su dati del piano. L indice va da 0 a 100 e pesa: domeniche libere (25), equita nei weekend (20), carico notturno (15), qualita del riposo (15), giorni consecutivi (15), vacanze godute (10). ' +
      'Le <b>malattie non tolgono punti</b>: sono un segnale da leggere insieme al resto, non una colpa. Passa il mouse su una riga per il dettaglio dei punti.</p>';
    h += '<div style="margin:8px 0 10px;max-width:720px"><canvas id="benessere-chart" height="150"></canvas></div>';
    h += tabella(
      calcolati.filter((x) => !x.jolly),
      'Personale fisso',
    );
    h += tabella(
      calcolati.filter((x) => x.jolly),
      'Personale ausiliario (jolly)',
    );
    const critici = calcolati.filter((x) => x.res.punteggio < 55);
    if (critici.length)
      h +=
        '<p style="font-size:.85rem;margin-top:12px;padding:8px 10px;background:#fdecea;border-left:3px solid #c0392b;border-radius:2px"><b>Da guardare per primi:</b> ' +
        escP(critici.map((x) => x.nome.split(' ')[0] + ' (' + x.res.punteggio + ')').join(', ')) +
        '</p>';
    el.innerHTML = h;
    if (typeof Chart !== 'undefined' && document.getElementById('benessere-chart')) {
      // Grafico compatto: la MEDIA di ogni indicatore, in percentuale del suo
      // massimo, confrontando personale fisso e ausiliari. Dice a colpo d'occhio
      // dove il settore e' solido e dove no, senza una barra per ogni persona.
      const medieDi = (lista) => {
        if (!lista.length) return null;
        const n = lista[0].res.voci.length;
        const out = [];
        for (let k = 0; k < n; k++) {
          const somma = lista.reduce((sm, x) => sm + x.res.voci[k].punti, 0);
          out.push(Math.round((somma / lista.length / lista[0].res.voci[k].max) * 100));
        }
        return out;
      };
      const fissi = calcolati.filter((x) => !x.jolly);
      const jolly = calcolati.filter((x) => x.jolly);
      const etichette = calcolati[0].res.voci.map((v) => v.nome);
      const dataset = [];
      const mf = medieDi(fissi);
      const mj = medieDi(jolly);
      if (mf)
        dataset.push({ label: 'Fissi (' + fissi.length + ')', data: mf, backgroundColor: '#1a4a7a', borderRadius: 3 });
      if (mj)
        dataset.push({
          label: 'Ausiliari (' + jolly.length + ')',
          data: mj,
          backgroundColor: '#b8860b',
          borderRadius: 3,
        });
      renderChart(
        'benessere-chart',
        'bar',
        { labels: etichette, datasets: dataset },
        {
          plugins: {
            legend: { position: 'top', labels: { font: { size: 12 }, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + c.parsed.y + '% del massimo' } },
          },
          scales: {
            y: { min: 0, max: 100, ticks: { stepSize: 25, font: { size: 11 }, callback: (v) => v + '%' } },
            x: { ticks: { font: { size: 11 } } },
          },
        },
      );
    }
  } catch (e) {
    console.error(e);
    el.innerHTML =
      '<p style="color:var(--accent);font-size:.85rem">Errore nel calcolo: ' + escP(e.message || '') + '</p>';
  }
}
// Etichetta del periodo davvero considerato: solo i mesi con piano completo
function _benesserePeriodoLbl(calcolati, anno) {
  const MESI_N = [
    'gennaio',
    'febbraio',
    'marzo',
    'aprile',
    'maggio',
    'giugno',
    'luglio',
    'agosto',
    'settembre',
    'ottobre',
    'novembre',
    'dicembre',
  ];
  const tutti = new Set();
  calcolati.forEach((x) => (x.p.mesiElenco || []).forEach((m) => tutti.add(m)));
  const lista = [...tutti].sort();
  if (!lista.length) return '<b>Nessun mese con piano completo nel ' + anno + '.</b>';
  const nome = (ym) => MESI_N[parseInt(ym.split('-')[1]) - 1];
  const periodo = lista.length === 1 ? nome(lista[0]) : 'da ' + nome(lista[0]) + ' a ' + nome(lista[lista.length - 1]);
  return (
    '<b>Periodo considerato: ' +
    periodo +
    ' ' +
    anno +
    '</b> (' +
    lista.length +
    (lista.length === 1 ? ' mese con piano completo' : ' mesi con piano completo') +
    '). I mesi incompleti o non ancora pianificati restano fuori dal conteggio, cosi i confronti sono corretti.'
  );
}
// Ordina le tabelle del benessere SENZA ricaricare i dati: si riordinano le
// righe gia' presenti, cosi' la pagina non sfarfalla.
function pianoBenessereOrdina(campo) {
  const so = window._benessereSort;
  const dir = so && so.campo === campo ? -so.dir : campo === 'nome' ? 1 : -1;
  window._benessereSort = { campo: campo, dir: dir };
  // indice di colonna corrispondente al campo
  const col = {
    nome: 0,
    indice: 1,
    domLib: 2,
    domLav: 3,
    we: 4,
    notti: 5,
    riposiIsolati: 6,
    serieMax: 7,
    vac: 8,
    mal: 9,
    oreLav: 10,
  }[campo];
  if (col == null) return;
  document.querySelectorAll('#piano-benessere-body table').forEach((tab) => {
    const tbody = tab.querySelector('tbody');
    if (!tbody) return;
    const righe = [...tbody.querySelectorAll('tr[data-nome]')];
    const val = (tr) => {
      const testo = (tr.cells[col] || {}).textContent || '';
      if (campo === 'nome') return tr.dataset.nome.toLowerCase();
      const n = parseFloat(
        String(testo)
          .replace(',', '.')
          .replace(/[^0-9.\-]/g, ''),
      );
      return isNaN(n) ? 0 : n;
    };
    righe
      .sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        return typeof va === 'string' ? dir * va.localeCompare(vb) : dir * (va - vb);
      })
      .forEach((tr) => tbody.appendChild(tr));
    // freccia sull'intestazione ordinata
    [...tab.querySelectorAll('thead th')].forEach((th, i) => {
      th.innerHTML = th.innerHTML.replace(/\s*[▲▼]\s*$/, '');
      if (i === col) th.innerHTML += dir > 0 ? ' ▲' : ' ▼';
    });
  });
}
function pianoBenessereFiltra(q) {
  const testo = (q || '').trim().toLowerCase();
  document.querySelectorAll('#piano-benessere-body table tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = !testo || tr.dataset.nome.toLowerCase().includes(testo) ? '' : 'none';
  });
}
function _renderPianoTurniCard() {
  if (!isAdmin()) {
    // operatori: vedono i turni del PROPRIO settore in sola lettura
    const turniRO = _pianoTurniReparto()
      .slice()
      .sort((x, y) => (x.gruppo || '').localeCompare(y.gruppo || '') || x.codice.localeCompare(y.codice));
    let hRO =
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni · ' +
      escP(repartoLabel(_pianoReparto())) +
      '</div><div style="padding:10px 14px"><div style="overflow-x:auto"><table class="piano-table" style="min-width:520px;font-size:.85rem"><thead><tr><th>Codice</th><th>Gruppo</th><th>Inizio</th><th>Fine</th><th>Ore</th><th>Tipo</th></tr></thead><tbody>';
    turniRO.forEach((t) => {
      hRO +=
        '<tr><td style="font-weight:700;background:' +
        (t.colore || 'transparent') +
        ';color:#000">' +
        escP(t.codice) +
        '</td><td>' +
        escP(t.gruppo || '') +
        '</td><td>' +
        (t.ora_inizio || '-').substring(0, 5) +
        '</td><td>' +
        (t.ora_fine || '-').substring(0, 5) +
        '</td><td>' +
        (t.durata_ore || 0) +
        '</td><td>' +
        escP(t.tipo || '') +
        '</td></tr>';
    });
    hRO +=
      '</tbody></table></div><p style="font-size:.82rem;color:var(--muted);margin-top:6px">Sola lettura: i turni si modificano solo da admin o da chi ha il permesso.</p></div></div>';
    return hRO;
  }
  const turni = _pianoTurniReparto();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (admin)</div><div style="padding:10px 14px">';
  // Il supplemento del 10% sul lavoro notturno (23:00-06:00) e' incluso nella
  // DURATA del turno: questo controllo verifica che tutte le durate lo
  // rispettino e propone la correzione dove manca.
  h +=
    '<div style="background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:10px 12px;margin-bottom:12px">' +
    '<b style="font-size:.9rem">Supplemento notturno del 10%</b>' +
    '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 8px">Chi lavora nella fascia notturna (23:00-06:00) matura il 10% di quelle ore in piu\', e questo supplemento deve essere gia\' compreso nella durata del turno. Il controllo confronta ogni turno con la durata attesa.</p>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoVerificaDurateNotte()">Controlla le durate dei turni</button>' +
    '</div>';
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
// ===== CGF PER IL PIANO FATTO A MANO =====
// Stessa contabilita' del generatore automatico, ma applicabile da sola: si
// contano i festivi lavorati e i CGF gia' goduti dall'inizio dell'anno (anche
// dei mesi precedenti e del dicembre passato), cosi' il saldo e' sempre giusto
// e non si assegnano recuperi doppi. Vale solo per il personale FISSO: gli
// ausiliari prendono il supplemento del 50% (RAP Allegato 1), non il recupero.
async function _pianoSaldoCgf(ym) {
  const annoCorr = ym.split('-')[0];
  const annoPrec = String(Number(annoCorr) - 1);
  const festiviCgf = new Set(
    pianoFestiviCache.filter((f) => f.cgf !== false && _festivoCgfDefault(f.data)).map((f) => f.data),
  );
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c))
    .map((c) => c.nome);
  const storia =
    (await secGet(
      'piano?data=gte.' +
        annoPrec +
        '-01-01&data=lte.' +
        annoCorr +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=40000',
    )) || [];
  const saldo = {};
  nomi.forEach((n) => (saldo[n] = { maturati: 0, goduti: 0, festiviMese: [] }));
  storia.forEach((r) => {
    const s = saldo[r.collaboratore];
    if (!s) return;
    if (festiviCgf.has(r.data) && _pianoTurnoInfo(r.codice)) {
      s.maturati++;
      if (String(r.data).startsWith(ym)) s.festiviMese.push(parseInt(r.data.split('-')[2]));
    }
    if (r.codice === 'CGF') s.goduti++;
  });
  return { saldo: saldo, storia: storia, nomi: nomi };
}
// Elenco informativo: chi ha diritto a un recupero e quanti
async function pianoElencoCgfDaDare() {
  if (!puoGestirePiano()) return;
  toast('Calcolo i recuperi...');
  const { saldo, nomi } = await _pianoSaldoCgf(_pianoMeseSel);
  const righe = nomi
    .map((n) => ({ nome: n, ...saldo[n], resta: saldo[n].maturati - saldo[n].goduti }))
    .filter((x) => x.maturati || x.goduti)
    .sort((a, b) => b.resta - a.resta || a.nome.localeCompare(b.nome));
  const b = document.getElementById('pwd-modal-content');
  let h =
    '<h3>Recuperi festivi (CGF) · ' +
    escP(_pianoMeseSel.split('-')[0]) +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Conteggio da gennaio (piu\' il dicembre precedente): festivi lavorati meno recuperi gia\' goduti. Solo personale fisso.</p>';
  if (!righe.length) h += '<p style="font-size:.85rem">Nessun festivo lavorato quest\'anno.</p>';
  else {
    h +=
      '<div style="max-height:52vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Maturati</th><th>Goduti</th><th>Da dare</th></tr></thead><tbody>';
    righe.forEach((r) => {
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        escP(r.nome) +
        '</td><td>' +
        r.maturati +
        '</td><td>' +
        r.goduti +
        '</td><td style="font-weight:700;color:' +
        (r.resta > 0 ? '#c0392b' : r.resta < 0 ? '#8b6914' : '#2c6e49') +
        '">' +
        (r.resta > 0 ? r.resta : r.resta < 0 ? r.resta + " (in piu')" : '0') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h +=
    '<div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
// Assegna i CGF mancanti nei giorni liberi del mese aperto
async function pianoAssegnaCgfMese() {
  if (!puoGestirePiano()) return;
  const ym = _pianoMeseSel;
  toast('Calcolo i recuperi da assegnare...');
  const { saldo, nomi } = await _pianoSaldoCgf(ym);
  const nGiorni = _pianoUltimoGiorno(ym);
  const malattie = _pianoMalattieMese(ym);
  const occupato = {};
  _pianoRighe.forEach((r) => (occupato[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
  const daFare = [];
  nomi.forEach((n) => {
    const s = saldo[n];
    let resta = s.maturati - s.goduti;
    if (resta <= 0) return;
    // prima i giorni dopo i festivi lavorati questo mese, poi qualsiasi buco
    const partenze = s.festiviMese.map((g) => g + 1).concat([1]);
    for (const p of partenze) {
      if (resta <= 0) break;
      for (let g = Math.max(1, p); g <= nGiorni && resta > 0; g++) {
        const dstrG = ym + '-' + String(g).padStart(2, '0');
        if (occupato[n + '|' + g]) continue;
        if (malattie[n + '|' + dstrG]) continue;
        if (daFare.some((x) => x.nome === n && x.giorno === g)) continue;
        daFare.push({ nome: n, giorno: g, data: dstrG });
        resta--;
        break;
      }
    }
  });
  if (!daFare.length) {
    alert(
      'Nessun recupero da assegnare in ' +
        ym +
        ".\n\nO i saldi sono gia' a posto, oppure non ci sono giorni liberi dove metterli (le celle gia' occupate non vengono toccate).",
    );
    return;
  }
  const elenco = daFare
    .slice(0, 25)
    .map((x) => '• ' + x.nome.split(' ')[0] + ' → giorno ' + x.giorno)
    .join('\n');
  if (
    !confirm(
      'Assegno ' +
        daFare.length +
        ' recuper' +
        (daFare.length === 1 ? 'o' : 'i') +
        ' (CGF) nei giorni liberi di ' +
        ym +
        ':\n\n' +
        elenco +
        (daFare.length > 25 ? '\n... e altri ' + (daFare.length - 25) : '') +
        "\n\nIl conteggio tiene conto dei recuperi gia' dati nei mesi precedenti. Le celle occupate non vengono toccate.",
    )
  )
    return;
  _pianoUndoSnap('assegnazione CGF ' + ym);
  let fatti = 0;
  try {
    for (const x of daFare) {
      const nuovo = await _pianoInserisciCella({
        collaboratore: x.nome,
        data: x.data,
        codice: 'CGF',
        protetto: false,
        generato: true,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
      fatti++;
    }
    logAzione('Piano: CGF assegnati a mano', ym + ' · ' + fatti + ' recuperi');
    toast(fatti + ' recuperi assegnati');
    renderPiano();
  } catch (e) {
    toast('Errore: assegnati ' + fatti + ' su ' + daFare.length);
  }
}
function _renderPianoFestiviCard() {
  if (!puoGestireFestivi()) return _pianoSchedaRiservata('Festivi e CGF', 'Festivi e CGF');
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
  // Chi compila il piano A MANO non passa dalla generazione automatica: con
  // questi pulsanti assegna i CGF del mese senza rifare il piano.
  h +=
    '<div style="background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:10px 12px;margin-bottom:12px">' +
    '<b style="font-size:.9rem">Recuperi festivi (CGF) sul piano</b>' +
    '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 8px">Per chi compila il piano a mano: assegna i giorni di recupero ai <b>fissi</b> che hanno lavorato nei festivi, senza rigenerare nulla. Gli ausiliari non ricevono CGF: per loro vale il supplemento del 50% (RAP Allegato 1), che si legge nelle Statistiche.</p>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoAssegnaCgfMese()">Assegna i CGF del mese di ' +
    escP(_pianoMeseSel) +
    '</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="pianoElencoCgfDaDare()">Chi ha diritto a un recupero</button>' +
    '</div>';
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
        ' · ' +
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
// SETTORE DEL PIANO · un operatore autorizzato può vedere/gestire
// il piano di un altro settore (es. supervisor Tavoli sul piano
// Slots) senza cambiare login: il selettore vale solo per il Piano.
// ================================================================
let _pianoRepartoSel = null; // null = segue il settore corrente dell'app
function _pianoReparto() {
  return _pianoRepartoSel || currentReparto;
}
// reparti che l'operatore può guardare nel piano: il suo + gli accessi extra
// (admin e operatori senza reparto assegnato: tutti)
function _pianoRepartiAmmessi() {
  const tutti = getReparti().map((r) => r.key);
  if (isAdmin()) return tutti;
  const op = getOperatore();
  const proprio = (typeof operatoriRepartoMap !== 'undefined' && operatoriRepartoMap[op]) || 'entrambi';
  if (proprio === 'entrambi') return tutti;
  const extra = typeof _accessiExtraDi === 'function' ? _accessiExtraDi(op) : null;
  return tutti.filter((k) => k === proprio || !!(extra && extra[k]));
}
function pianoCambiaReparto(rep) {
  if (!_pianoRepartiAmmessi().includes(rep)) return;
  _pianoRepartoSel = rep === currentReparto ? null : rep;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ================================================================
// FESTIVI AUTOMATICI · genera i festivi di un anno con un click.
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
  // FESTIVI DEL CANTON TICINO (richiesta utente 04/09/2026): la lista segue
  // il calendario cantonale ufficiale — le feste fisse sono di legge, quelle
  // mobili si calcolano da Pasqua, quindi risultano sempre esatte anno per anno
  return [
    { data: anno + '-01-01', descrizione: 'Capodanno' },
    { data: anno + '-01-06', descrizione: 'Epifania' },
    { data: anno + '-03-19', descrizione: 'San Giuseppe' },
    { data: add(pasqua, 1), descrizione: 'Lunedì di Pasqua' },
    { data: anno + '-05-01', descrizione: 'Festa del Lavoro' },
    { data: add(pasqua, 39), descrizione: 'Ascensione' },
    { data: add(pasqua, 50), descrizione: 'Lunedì di Pentecoste' },
    { data: add(pasqua, 60), descrizione: 'Corpus Domini' },
    { data: anno + '-06-29', descrizione: 'SS. Pietro e Paolo' },
    { data: anno + '-08-01', descrizione: 'Festa nazionale' },
    { data: anno + '-08-15', descrizione: 'Assunzione' },
    { data: anno + '-11-01', descrizione: 'Ognissanti' },
    { data: anno + '-12-08', descrizione: 'Immacolata Concezione' },
    { data: anno + '-12-25', descrizione: 'Natale' },
    { data: anno + '-12-26', descrizione: 'Santo Stefano' },
  ];
}
// ===========================================================================
// RECUPERO ORE (griglia giornaliera, come il foglio Excel di slots e tavoli)
// Ogni giorno si segna lo scostamento dal turno previsto: -1 se ha fatto un ora
// in meno, +3 se ne ha fatte tre in piu. Il totale del mese entra nel saldo.
// ===========================================================================
let _pianoRecupero = {}; // 'nome|YYYY-MM-DD' -> record
let _pianoRecuperoMese = null;
async function _pianoCaricaRecupero(ym) {
  if (_pianoRecuperoMese === ym) return;
  const da = ym + '-01';
  const a = ym + '-31';
  const r = (await secGet('piano_recupero_ore?data=gte.' + da + '&data=lte.' + a + '&limit=5000')) || [];
  _pianoRecupero = {};
  r.forEach((x) => (_pianoRecupero[x.collaboratore + '|' + String(x.data).substring(0, 10)] = x));
  _pianoRecuperoMese = ym;
}
// totale del mese per un collaboratore (0 se non ha scostamenti)
function _pianoRecuperoTotale(nome, ym) {
  let t = 0;
  Object.keys(_pianoRecupero).forEach((k) => {
    if (k.indexOf(nome + '|') !== 0) return;
    if (k.substring(nome.length + 1, nome.length + 8) !== (ym || _pianoMeseSel)) return;
    t += parseFloat(_pianoRecupero[k].ore) || 0;
  });
  return Math.round(t * 100) / 100;
}
// Converte quello che scrive l'operatore in ore decimali.
// '1:30' e '-1:30' -> 1.5 / -1.5 (sessantesimi) · '1,5' e '1.5' -> 1.5
// Ritorna stringa vuota quando il campo e' vuoto.
function _pianoOreDaTesto(valore) {
  let t = String(valore == null ? '' : valore).trim();
  if (t === '') return '';
  t = t.replace(',', '.');
  const m = t.match(/^([+-]?)(\d+):([0-5]?\d)$/);
  if (m) {
    const segno = m[1] === '-' ? -1 : 1;
    const ore = parseInt(m[2]) + parseInt(m[3]) / 60;
    return String(segno * (Math.round(ore * 100) / 100));
  }
  return t;
}
// Scrive/aggiorna/cancella uno scostamento del giorno
async function pianoRecuperoScrivi(nome, dstr, valore) {
  if (!puoGestirePiano() && !isAdmin()) {
    toast('Non hai il permesso di modificare il piano');
    return false;
  }
  const _info = _pianoCollabInfo(nome) || {};
  if (_info.is_jolly || _info.impiego === 'jolly') {
    toast('Gli ausiliari non hanno ore dovute: nessun recupero da registrare');
    return false;
  }
  const chiave = nome + '|' + dstr;
  const att = _pianoRecupero[chiave];
  // si accetta sia il decimale (1.5) sia l'orologio (1:30): un'ora e mezza si
  // puo' scrivere in tutti e due i modi, cosi' nessuno sbaglia scrivendo 1.30
  const testo = _pianoOreDaTesto(valore);
  try {
    if (testo === '' || parseFloat(testo) === 0) {
      if (att) {
        await secDel('piano_recupero_ore', 'id=eq.' + att.id);
        delete _pianoRecupero[chiave];
        logAzione('Recupero ore tolto', nome + ' ' + dstr);
      }
      return true;
    }
    const ore = parseFloat(testo);
    if (isNaN(ore) || ore < -24 || ore > 24) {
      toast('Valore fuori scala (da -24 a +24)');
      return false;
    }
    if (att) {
      await secPatch('piano_recupero_ore', 'id=eq.' + att.id, {
        ore: ore,
        operatore: getOperatore(),
        modificato_il: new Date().toISOString(),
      });
      att.ore = ore;
    } else {
      const nuovo = await secPost('piano_recupero_ore', {
        collaboratore: nome,
        data: dstr,
        ore: ore,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      _pianoRecupero[chiave] = (nuovo && nuovo[0]) || { collaboratore: nome, data: dstr, ore: ore };
    }
    logAzione('Recupero ore', nome + ' ' + dstr + ': ' + (ore > 0 ? '+' : '') + ore + 'h');
    return true;
  } catch (e) {
    console.error('recupero ore', e);
    toast('Errore nel salvataggio');
    return false;
  }
}
// modifica dalla cella della griglia
async function pianoRecuperoCella(el, nome, dstr) {
  const ok = await pianoRecuperoScrivi(nome, dstr, el.value);
  if (!ok) {
    const att = _pianoRecupero[nome + '|' + dstr];
    el.value = att ? att.ore : '';
    return;
  }
  _pianoYtdKey = ''; // il saldo dei mesi seguenti cambia
  _pianoRecuperoAggiornaRiga(nome);
}
// aggiorna colori e totali della riga senza ridisegnare tutta la pagina
function _pianoRecuperoAggiornaRiga(nome) {
  const tr = document.querySelector('#piano-recupero-table tbody tr[data-nome="' + CSS.escape(nome) + '"]');
  if (!tr) return;
  tr.querySelectorAll('input[data-data]').forEach((inp) => {
    const v = parseFloat(inp.value);
    inp.className = 'rec-cella' + (v > 0 ? ' rec-piu' : v < 0 ? ' rec-meno' : '');
  });
  const tot = _pianoRecuperoTotale(nome, _pianoMeseSel);
  const cel = tr.querySelector('.rec-totale');
  if (cel) {
    cel.textContent = tot ? (tot > 0 ? '+' : '') + tot.toFixed(2).replace(/\.00$/, '') : '';
    cel.className = 'rec-totale' + (tot > 0 ? ' rec-piu' : tot < 0 ? ' rec-meno' : '');
  }
  _pianoRecuperoTotaliGenerali();
}
function _pianoRecuperoTotaliGenerali() {
  const box = document.getElementById('piano-recupero-riepilogo');
  if (!box) return;
  let piu = 0;
  let meno = 0;
  Object.keys(_pianoRecupero).forEach((k) => {
    const v = parseFloat(_pianoRecupero[k].ore) || 0;
    if (v > 0) piu += v;
    else meno += v;
  });
  const netto = Math.round((piu + meno) * 100) / 100;
  box.innerHTML =
    '<span class="rec-piu">+' +
    Math.round(piu * 100) / 100 +
    'h</span> in piu &middot; <span class="rec-meno">' +
    Math.round(meno * 100) / 100 +
    'h</span> in meno &middot; saldo del settore <b>' +
    (netto > 0 ? '+' : '') +
    netto +
    'h</b>';
}
function pianoRecuperoOrdina(campo) {
  window._pianoRecuperoOrdine = campo;
  renderPiano();
}
async function _renderPianoRecuperoTab() {
  const ym = _pianoMeseSel;
  await _pianoCaricaRecupero(ym);
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const nGiorni = new Date(anno, mese, 0).getDate();
  const GG3 = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
  const MESI_L = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const puoMod = puoGestirePiano() || isAdmin();
  // SOLO PERSONALE FISSO: gli ausiliari non hanno ore dovute, quindi non esiste
  // uno scostamento dal turno da recuperare. Le loro ore si contano su quelle
  // effettivamente lavorate (RAP Allegato 1).
  let nomi = ordineCollabPiano(
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && !(c.is_jolly || c.impiego === 'jolly'))
      .map((c) => c.nome),
    _pianoReparto(),
  );
  // ordinamento scelto dall'operatore (resta finche' non lo cambia)
  const _ord = window._pianoRecuperoOrdine || 'nome';
  if (_ord === 'totale') {
    nomi = nomi.slice().sort((a5, b5) => _pianoRecuperoTotale(a5, ym) - _pianoRecuperoTotale(b5, ym));
  } else if (_ord === 'percentuale') {
    nomi = nomi
      .slice()
      .sort(
        (a5, b5) =>
          (parseFloat((_pianoCollabInfo(b5) || {}).percentuale) || 1) -
            (parseFloat((_pianoCollabInfo(a5) || {}).percentuale) || 1) || a5.localeCompare(b5),
      );
  }
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">Recupero ore &middot; personale fisso &middot; ' +
    (MESI_L[parseInt(ym.split('-')[1]) - 1] || ym) +
    ' ' +
    ym.split('-')[0] +
    '<span id="piano-recupero-riepilogo" style="margin-left:auto;font-size:.85rem;font-weight:400"></span></div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Si aggiorna <b>ogni giorno</b>: nella casella del giorno si scrive quanto il collaboratore ha lavorato in piu o in meno rispetto al turno previsto. <b>-1</b> significa un ora in meno (rosso), <b>+3</b> tre ore in piu (verde). Casella vuota = ha fatto esattamente il suo turno. Il totale del mese entra nel <b>saldo ore</b>, quindi il conteggio resta aggiornato senza aspettare la fine del mese.</p>';
  if (!nomi.length) {
    h += '<p style="color:var(--muted);padding:10px 0">Nessun collaboratore in questo settore.</p></div></div>';
    return h;
  }
  h +=
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
    '<span style="font-size:.85rem;color:var(--muted)">Ordina per</span>' +
    '<select onchange="pianoRecuperoOrdina(this.value)" style="padding:5px 9px;font-size:.85rem;border:1px solid var(--line);border-radius:3px;background:var(--paper);color:var(--ink)">' +
    [
      ['nome', 'Nome'],
      ['totale', 'Totale del mese'],
      ['percentuale', 'Percentuale'],
    ]
      .map(
        (o) =>
          '<option value="' +
          o[0] +
          '"' +
          ((window._pianoRecuperoOrdine || 'nome') === o[0] ? ' selected' : '') +
          '>' +
          o[1] +
          '</option>',
      )
      .join('') +
    '</select>' +
    '<input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-recupero-table\')">' +
    '</div>';
  h +=
    '<div style="overflow-x:auto"><table id="piano-recupero-table" class="piano-table" style="width:' +
    (270 + 46 * nGiorni + 90) +
    'px"><thead><tr><th class="piano-nome" style="width:210px">Collaboratore</th><th style="width:60px" title="Percentuale d impiego: le ore dovute si calcolano su questa">%</th>';
  for (let g = 1; g <= nGiorni; g++) {
    const dstr = ym + '-' + String(g).padStart(2, '0');
    const dow = new Date(dstr + 'T12:00:00').getDay();
    h +=
      '<th style="width:46px' +
      (dow === 0 ? ';background:#7a2e2e;color:#fff' : dow === 6 ? ';background:#5a4a3a;color:#fff' : '') +
      '"><div>' +
      GG3[dow] +
      '</div><div>' +
      g +
      '</div></th>';
  }
  h += '<th style="width:90px" title="Somma degli scostamenti del mese">Totale</th></tr></thead><tbody>';
  nomi.forEach((nome) => {
    const _infoR = _pianoCollabInfo(nome) || {};
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td class="piano-nome" style="text-align:left">' +
      escP(nome) +
      '</td><td style="color:var(--muted)">' +
      Math.round((parseFloat(_infoR.percentuale) || 1) * 100) +
      '%</td>';
    for (let g = 1; g <= nGiorni; g++) {
      const dstr = ym + '-' + String(g).padStart(2, '0');
      const r = _pianoRecupero[nome + '|' + dstr];
      const v = r ? parseFloat(r.ore) : '';
      h +=
        '<td style="padding:1px"><input class="rec-cella' +
        (v > 0 ? ' rec-piu' : v < 0 ? ' rec-meno' : '') +
        '" data-data="' +
        dstr +
        '" type="text" inputmode="decimal" value="' +
        (v === '' ? '' : v) +
        '"' +
        (puoMod
          ? ' onchange="pianoRecuperoCella(this,\'' + escP(nome).replace(/'/g, "\\'") + "','" + dstr + '\')"'
          : ' readonly') +
        ' title="' +
        escP(nome) +
        ' &middot; ' +
        dstr.split('-').reverse().join('.') +
        (r && r.operatore ? ' &middot; ' + escP(r.operatore) : '') +
        '"></td>';
    }
    const tot = _pianoRecuperoTotale(nome, ym);
    h +=
      '<td class="rec-totale' +
      (tot > 0 ? ' rec-piu' : tot < 0 ? ' rec-meno' : '') +
      '">' +
      (tot ? (tot > 0 ? '+' : '') + String(tot).replace(/\.00$/, '') : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);margin-top:10px">Le stesse ore compaiono nella colonna <b>SM</b> del calendario e nella scheda <b>Saldo</b>, sommate alle ore del piano. Chi scrive e quando resta nel registro.</p>';
  h += '</div></div>';
  return h;
}
// ===========================================================================
// FESTIVITA' E ORARI DI CHIUSURA
// Giorni in cui si chiude alle 05:00 invece che alle 04:00 (o alle 07:00 il 31
// dicembre). Servono a sapere in anticipo quando mettere piu' personale.
// ===========================================================================
let pianoFestivitaCache = [];
let _pianoFestivitaAnnoCaricato = null;
async function _pianoCaricaFestivita(anno) {
  if (_pianoFestivitaAnnoCaricato === anno) return pianoFestivitaCache;
  const r = (await secGet('piano_festivita?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=500')) || [];
  pianoFestivitaCache = r;
  _pianoFestivitaAnnoCaricato = anno;
  return r;
}
// mappa { 'YYYY-MM-DD': nome } delle sole festivita' attive
function _pianoFestivitaMappa() {
  const m = {};
  (pianoFestivitaCache || []).forEach((f) => {
    if (f.attivo !== false) m[String(f.data).substring(0, 10)] = f.nome;
  });
  return m;
}
// configurazione degli orari, modificabile dalle regole
function _pianoChiusuraCfg() {
  const giorni = String(_pianoRegolaVal('chiusura_giorni_tardi') || '5,6')
    .split(',')
    .map((x) => parseInt(x.trim()))
    .filter((x) => !isNaN(x));
  return {
    oraNormale: parseFloat(_pianoRegolaVal('chiusura_ora_normale')) || 4,
    oraTardi: parseFloat(_pianoRegolaVal('chiusura_ora_tardi')) || 5,
    oraFineAnno: parseFloat(_pianoRegolaVal('chiusura_ora_fine_anno')) || 7,
    giorniTardi: giorni.length ? giorni : [5, 6],
  };
}
function _pianoChiusuraGiorno(dstr) {
  return PianoRegole.chiusuraDelGiorno(dstr, _pianoFestivitaMappa(), _pianoChiusuraCfg());
}
// ELENCHI FORNITI DALLA DIREZIONE (2026 e 2027). Per gli altri anni il
// programma calcola le dodici festivita' italiane di legge (Pasqua compresa).
const PIANO_FESTIVITA_ELENCHI = {
  2026: [
    ['2026-01-01', 'Capodanno'],
    ['2026-01-06', 'Epifania del Signore'],
    ['2026-03-08', 'Festa internazionale della donna'],
    ['2026-04-05', 'Pasqua'],
    ['2026-04-06', "Lunedi dell'Angelo"],
    ['2026-04-25', 'Festa della Liberazione'],
    ['2026-05-01', 'Festa del Lavoro'],
    ['2026-06-02', 'Festa della Repubblica Italiana'],
    ['2026-08-15', 'Ferragosto'],
    ['2026-08-24', "Giorno dell'indipendenza dell'Ucraina"],
    ['2026-10-01', "Giornata dei difensori dell'Ucraina"],
    ['2026-10-04', "Festa nazionale San Francesco d'Assisi"],
    ['2026-11-01', 'Tutti i Santi'],
    ['2026-12-08', 'Immacolata Concezione'],
    ['2026-12-25', 'Natale'],
    ['2026-12-26', 'Santo Stefano'],
  ],
  2027: [
    ['2027-01-01', 'Capodanno'],
    ['2027-01-06', 'Epifania'],
    ['2027-03-28', 'Pasqua'],
    ['2027-03-29', "Lunedi dell'Angelo"],
    ['2027-04-25', 'Festa della Liberazione'],
    ['2027-05-01', 'Festa dei Lavoratori'],
    ['2027-06-02', 'Festa della Repubblica'],
    ['2027-08-15', 'Ferragosto'],
    ['2027-11-01', 'Tutti i Santi'],
    ['2027-12-08', 'Immacolata Concezione'],
    ['2027-12-25', 'Natale'],
    ['2027-12-26', 'Santo Stefano'],
  ],
};
function _pianoFestivitaProposte(anno) {
  const elenco = PIANO_FESTIVITA_ELENCHI[anno];
  if (elenco) return elenco.map((x) => ({ data: x[0], nome: x[1] }));
  return PianoRegole.festivitaItaliane(anno);
}
async function pianoImportaFestivita(anno) {
  if (!puoGestireFestivi()) {
    toast('Serve il permesso Festivi e CGF');
    return;
  }
  await _pianoCaricaFestivita(anno);
  const gia = new Set((pianoFestivitaCache || []).map((f) => String(f.data).substring(0, 10) + '|' + f.nome));
  const nuovi = _pianoFestivitaProposte(anno).filter((f) => !gia.has(f.data + '|' + f.nome));
  if (!nuovi.length) {
    toast('Le festivita del ' + anno + ' sono gia inserite');
    return;
  }
  if (
    !confirm(
      'Inserisco ' +
        nuovi.length +
        ' festivita per il ' +
        anno +
        ':\n\n' +
        nuovi.map((f) => '\u2022 ' + f.data.split('-').reverse().join('.') + '  ' + f.nome).join('\n') +
        '\n\nQuelle gia presenti non vengono toccate.',
    )
  )
    return;
  let n = 0;
  for (const f of nuovi) {
    try {
      await secPost('piano_festivita', {
        data: f.data,
        nome: f.nome,
        paese: 'IT',
        attivo: true,
        operatore: getOperatore(),
      });
      n++;
    } catch (e) {
      console.warn('festivita', f.data, e && e.message);
    }
  }
  _pianoFestivitaAnnoCaricato = null;
  await _pianoCaricaFestivita(anno);
  logAzione('Festivita importate', anno + ': ' + n + ' giorni');
  toast(n + ' festivita inserite per il ' + anno);
  renderPiano();
}
async function pianoFestivitaToggle(id) {
  if (!puoGestireFestivi()) return;
  const f = (pianoFestivitaCache || []).find((x) => x.id === id);
  if (!f) return;
  const nuovo = f.attivo === false;
  await secPatch('piano_festivita', 'id=eq.' + id, { attivo: nuovo });
  f.attivo = nuovo;
  logAzione('Festivita ' + (nuovo ? 'riattivata' : 'disattivata'), f.nome + ' ' + f.data);
  renderPiano();
}
async function pianoFestivitaElimina(id) {
  if (!puoGestireFestivi()) return;
  const f = (pianoFestivitaCache || []).find((x) => x.id === id);
  if (!f) return;
  if (!confirm('Elimino "' + f.nome + '" del ' + String(f.data).split('-').reverse().join('.') + '?')) return;
  await secDel('piano_festivita', 'id=eq.' + id);
  pianoFestivitaCache = pianoFestivitaCache.filter((x) => x.id !== id);
  logAzione('Festivita eliminata', f.nome + ' ' + f.data);
  renderPiano();
}
async function pianoFestivitaAggiungi() {
  if (!puoGestireFestivi()) return;
  const data = (document.getElementById('festivita-data') || {}).value;
  const nome = ((document.getElementById('festivita-nome') || {}).value || '').trim();
  const ora = (document.getElementById('festivita-ora') || {}).value;
  if (!data || !nome) {
    toast('Servono data e nome');
    return;
  }
  try {
    await secPost('piano_festivita', {
      data: data,
      nome: nome,
      paese: 'IT',
      ora_chiusura: ora ? parseFloat(ora) : null,
      attivo: true,
      operatore: getOperatore(),
    });
    _pianoFestivitaAnnoCaricato = null;
    await _pianoCaricaFestivita(parseInt(data.split('-')[0]));
    logAzione('Festivita aggiunta', nome + ' ' + data);
    toast('Aggiunta: ' + nome);
    renderPiano();
  } catch (e) {
    toast('Gia presente o errore');
  }
}
function _renderPianoFestivitaCard() {
  if (!puoGestireFestivi()) return '';
  const anno = window._pianoFestiviAnnoSel || parseInt(_pianoMeseSel.split('-')[0]);
  const cfg = _pianoChiusuraCfg();
  const GG = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const righe = (pianoFestivitaCache || [])
    .filter((f) => parseInt(String(f.data).substring(0, 4)) === anno)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Festivita e orari di chiusura ' +
    anno +
    '</div><div style="padding:12px 16px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);line-height:1.55;margin-bottom:10px">Si chiude alle <b>' +
    cfg.oraNormale +
    ':00</b> nei giorni feriali e alle <b>' +
    cfg.oraTardi +
    ':00</b> il ' +
    cfg.giorniTardi.map((g) => GG[g]).join(' e il ') +
    '. <b>La notte prima di un giorno di festa</b> si chiude alle <b>' +
    cfg.oraTardi +
    ':00</b> anche in mezzo alla settimana, perche e quella la sera in cui la gente esce; il <b>31 dicembre</b> si chiude alle <b>' +
    cfg.oraFineAnno +
    ':00</b>. Quei giorni compaiono nel calendario con il marcatore <b>CH' +
    cfg.oraTardi +
    '</b> in cima alla colonna, cosi si sa dove serve piu personale. Gli orari si cambiano nella scheda Regole.</p>';
  h +=
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">' +
    '<button class="btn-export" onclick="pianoImportaFestivita(' +
    anno +
    ')">Inserisci le festivita del ' +
    anno +
    '</button>' +
    '<span style="font-size:.82rem;color:var(--muted)">' +
    (PIANO_FESTIVITA_ELENCHI[anno]
      ? 'elenco fornito dalla direzione'
      : 'calcolate: dodici festivita italiane di legge, Pasqua compresa') +
    '</span></div>';
  if (!righe.length) {
    h += '<p style="padding:8px 0;color:var(--muted)">Nessuna festivita registrata per il ' + anno + '.</p>';
  } else {
    h +=
      '<div style="overflow-x:auto"><table class="piano-table" style="min-width:560px"><thead><tr>' +
      '<th style="text-align:left">Data</th><th>Giorno</th><th style="text-align:left">Festivita</th><th title="Il giorno prima della festa: e quella la notte in cui si chiude piu tardi">Si chiude tardi il</th><th title="Cosa compare in cima alla colonna del calendario, quel giorno">Nel piano</th><th></th></tr></thead><tbody>';
    righe.forEach((f) => {
      const d = String(f.data).substring(0, 10);
      // il marcatore si mette la VIGILIA, cioe' il giorno prima della festa
      const vig = new Date(d + 'T12:00:00');
      vig.setDate(vig.getDate() - 1);
      const dVig =
        vig.getFullYear() +
        '-' +
        String(vig.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(vig.getDate()).padStart(2, '0');
      const ch = _pianoChiusuraGiorno(dVig);
      const spento = f.attivo === false;
      h +=
        '<tr style="' +
        (spento ? 'opacity:.45' : '') +
        '"><td style="text-align:left">' +
        d.split('-').reverse().join('.') +
        '</td><td>' +
        GG[new Date(d + 'T12:00:00').getDay()] +
        '</td><td style="text-align:left;font-weight:600">' +
        escP(f.nome) +
        '</td><td' +
        (spento
          ? ''
          : ' title="notte fra il ' +
            dVig.split('-').reverse().join('.') +
            ' e il ' +
            d.split('-').reverse().join('.') +
            '"') +
        '>' +
        (spento
          ? '-'
          : GG[new Date(dVig + 'T12:00:00').getDay()] +
            ' ' +
            dVig.split('-').reverse().join('.') +
            ' &middot; ' +
            ch.ora +
            ':00') +
        '</td><td>' +
        (spento
          ? '<span style="color:var(--muted)">spenta</span>'
          : ch.marcatore
            ? '<b style="background:#8b4a8b;color:#fff;padding:2px 8px;border-radius:2px">' + ch.marcatore + '</b>'
            : '<span style="color:var(--muted)" title="quella notte si chiude gia tardi per prassi: non serve segnalarlo">-</span>') +
        '</td><td style="white-space:nowrap"><button class="btn-act" style="font-size:.82rem" onclick="pianoFestivitaToggle(' +
        f.id +
        ')">' +
        (spento ? 'Riattiva' : 'Spegni') +
        '</button> <button class="btn-act del" style="font-size:.82rem" onclick="pianoFestivitaElimina(' +
        f.id +
        ')">Elimina</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h +=
    '<div class="add-tipo-row" style="margin-top:12px"><div class="field"><label>Data</label><input type="date" id="festivita-data"></div>' +
    '<div class="field"><label>Festivita</label><input type="text" id="festivita-nome" placeholder="Es. Santo patrono"></div>' +
    '<div class="field"><label>Chiusura (facoltativa)</label><input type="number" id="festivita-ora" step="0.5" min="0" max="12" placeholder="' +
    cfg.oraTardi +
    '"></div>' +
    '<button class="btn-add-tipo" onclick="pianoFestivitaAggiungi()">+ Aggiungi</button></div>';
  h += '</div></div>';
  return h;
}
// REGOLA CGF: il festivo che cade di DOMENICA non matura compensazione
function _festivoCgfDefault(dstr) {
  return new Date(dstr + 'T12:00:00').getDay() !== 0;
}
// FESTIVI PARIFICATI ALLE DOMENICHE — RAP Allegato 1 (Personale ausiliario,
// versione 3.0 del 1° gennaio 2022). Sono i SOLI nove giorni per cui il
// personale ausiliario (jolly) che lavora ha diritto al supplemento del 50%
// sul salario orario lordo. Gli altri festivi cantonali (San Giuseppe, Festa
// del Lavoro, Pentecoste, Corpus Domini, SS. Pietro e Paolo, Immacolata) NON
// sono parificati e non danno il supplemento.
const PIANO_FESTIVI_PARIFICATI = [
  'capodanno',
  'epifania',
  'lunedì di pasqua',
  'lunedi di pasqua',
  'ascensione',
  'festa nazionale', // 1° agosto
  '1 agosto',
  'assunzione',
  'ognissanti',
  'natale',
  'santo stefano',
];
// ORE DI LAVORO NOTTURNO di un turno, cioe' quante ore cadono nella fascia
// notturna (per legge 23:00-06:00, modificabile dalle regole notte_inizio /
// notte_fine). Serve per il supplemento del 10% in tempo libero pagato dovuto
// al personale ausiliario (RAP Allegato 1).
// ORE EFFETTIVAMENTE LAVORATE di un turno: dalla timbratura di entrata a
// quella di uscita, SENZA il supplemento del 10% sul lavoro notturno (che e'
// compreso nella durata contrattuale del turno). Se la cella ha orari suoi
// (turno personalizzato, JG) valgono quelli.
function _pianoOreEffettiveTurno(t, riga) {
  const oi = (riga && riga.ora_inizio) || (t && t.ora_inizio);
  const of = (riga && riga.ora_fine) || (t && t.ora_fine);
  const i = _pianoOra(oi);
  let f = _pianoOra(of);
  if (i == null || f == null) return 0;
  if (f <= i) f += 24;
  return Math.round((f - i) * 100) / 100;
}
function _pianoOreNotturneTurno(t) {
  if (!t) return 0;
  const ni = parseFloat(_pianoRegolaVal('notte_inizio'));
  const nf = parseFloat(_pianoRegolaVal('notte_fine'));
  const inizioN = !isNaN(ni) ? ni : 23;
  const fineN = !isNaN(nf) ? nf : 6;
  const i = _pianoOra(t.ora_inizio);
  let f = _pianoOra(t.ora_fine);
  if (i == null || f == null) return 0;
  if (f <= i) f += 24; // turno che passa la mezzanotte
  // due finestre notturne: quella della notte in corso e quella del mattino
  const finestre = [
    [inizioN, fineN + 24],
    [inizioN - 24, fineN],
  ];
  let ore = 0;
  finestre.forEach((w) => {
    const a = Math.max(i, w[0]);
    const b = Math.min(f, w[1]);
    if (b > a) ore += b - a;
  });
  return Math.round(ore * 100) / 100;
}
// Tempo libero pagato maturato sulle ore notturne: 10% (RAP Allegato 1),
// percentuale modificabile dalle regole (notte_percentuale)
function _pianoNotteRecupero(oreNotturne) {
  const p = parseFloat(_pianoRegolaVal('notte_percentuale'));
  const perc = !isNaN(p) && p > 0 ? p : 10;
  return Math.round((((oreNotturne || 0) * perc) / 100) * 100) / 100;
}
// INDENNITA' DEGLI AUSILIARI (RAP Allegato 1): si calcolano in percentuale
// sulle ore effettivamente lavorate, perche' gli ausiliari non hanno una
// percentuale contrattuale. Percentuali modificabili dalle regole.
function _pianoIndennitaJolly(oreLavorate) {
  const v4 = parseFloat(_pianoRegolaVal('jolly_indennita_vacanze_4sett'));
  const v5 = parseFloat(_pianoRegolaVal('jolly_indennita_vacanze_5sett'));
  const t13 = parseFloat(_pianoRegolaVal('jolly_indennita_tredicesima'));
  const pV4 = !isNaN(v4) ? v4 : 8.33;
  const pV5 = !isNaN(v5) ? v5 : 10.65;
  const pT = !isNaN(t13) ? t13 : 8.33;
  const h = (p) => Math.round(((oreLavorate * p) / 100) * 100) / 100;
  return (
    Math.round(oreLavorate * 10) / 10 +
    'h lavorate · vacanze ' +
    pV4 +
    '% = ' +
    h(pV4) +
    'h (con 5 settimane ' +
    pV5 +
    '% = ' +
    h(pV5) +
    'h) · tredicesima ' +
    pT +
    '% = ' +
    h(pT) +
    'h'
  );
}
function _pianoFestivoParificato(fest) {
  if (!fest) return false;
  const d = String(fest.descrizione || '')
    .trim()
    .toLowerCase();
  if (PIANO_FESTIVI_PARIFICATI.includes(d)) return true;
  // riconoscimento anche dalla data, per festivi rinominati a mano
  const md = String(fest.data || '').substring(5);
  return ['01-01', '01-06', '08-01', '08-15', '11-01', '12-25', '12-26'].includes(md);
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
      const r = await secPost('piano_festivi', {
        data: f.data,
        descrizione: f.descrizione,
        cgf: _festivoCgfDefault(f.data),
      });
      if (r && r[0]) pianoFestiviCache.push(r[0]);
    }
    if (nuovi.length) {
      logAzione('Piano: festivi generati automaticamente', anno + ' · ' + nuovi.length);
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
          .map((f) => new Date(f.data + 'T12:00:00').toLocaleDateString('it-IT') + ' · ' + f.descrizione)
          .join('\n') +
        '\n\n(tutti con CGF attivo; quelli già presenti non vengono toccati)',
    )
  )
    return;
  try {
    for (const f of nuovi) {
      const r = await secPost('piano_festivi', {
        data: f.data,
        descrizione: f.descrizione,
        cgf: _festivoCgfDefault(f.data),
      });
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

async function stampaPianoPDF(soloNomi) {
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
  let nomi = [...new Set(_pianoRighe.map((r) => r.collaboratore))].filter((n) => !nasc.nomi.includes(n)).sort();
  // stampa di una SELEZIONE di collaboratori (barra della selezione multipla)
  if (Array.isArray(soloNomi) && soloNomi.length) nomi = nomi.filter((n) => soloNomi.includes(n));
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
  doc.text('Piano di lavoro · ' + label + ' · ' + repartoLabel(_pianoReparto()), 148, 10, { align: 'center' });
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
        const stC = ovr ? _stileCella(ovr) : null;
        if (stC && (stC.b || stC.i))
          d.cell.styles.fontStyle = stC.b && stC.i ? 'bolditalic' : stC.b ? 'bold' : 'italic';
        if (stC && stC.t && stC.t[0] === '#') {
          const ht = stC.t.replace('#', '');
          d.cell.styles.textColor = [
            parseInt(ht.substring(0, 2), 16),
            parseInt(ht.substring(2, 4), 16),
            parseInt(ht.substring(4, 6), 16),
          ];
        }
        const col = (stC && stC.c) || _pianoColore(String(d.cell.raw));
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
  doc.text('Casino Lugano SA · Piano di lavoro · generato il ' + new Date().toLocaleDateString('it-IT'), 4, 205);
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
  if (dati.autorizzato) {
    // spunta gia' marcata: il cambio e' stato applicato nel piano,
    // il foglio si stampa e si firma
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(34, 34, 34);
    doc.text('X', M + 7.2, yy);
    doc.setFont('helvetica', 'normal');
  }
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
  doc.text('Casino Lugano SA · Richiesto da: ' + (dati.richiesto || getOperatore()), 105, ph - 9, {
    align: 'center',
  });
  return doc;
}

// ---- CERCA CAMBIO · "vorrei essere libero il giorno X" ----
// Il collaboratore chiede il giorno libero: il sistema trova i colleghi a
// riposo (C) quel giorno che possono coprire il suo turno e propone i giorni
// di RESTITUZIONE (stesso mese o successivo) in cui lui prende un turno del
// collega. Tutto verificato: idoneita', riposo minimo, massimo consecutivi.
let _ccDati = null;
async function apriCercaCambioLibero() {
  const sel = _pianoCellaSel;
  if (!sel || !puoGestirePiano()) return;
  const r = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === sel.data);
  const tMio = r ? _pianoTurnoInfo(r.codice) : null;
  if (!tMio) {
    toast('La cella deve avere un turno da coprire');
    return;
  }
  toast("Cerco con chi puo' cambiare...");
  const ym = _pianoMeseSel;
  const anno = parseInt(ym.split('-')[0]);
  const mese = parseInt(ym.split('-')[1]);
  const fineMeseSucc = new Date(anno, mese + 1, 0);
  const iso = (d) => d.toISOString().substring(0, 10);
  const daRange = new Date(sel.data + 'T12:00:00');
  daRange.setDate(daRange.getDate() - 8);
  const righeTutte =
    (await secGet(
      'piano?data=gte.' +
        iso(daRange) +
        '&data=lte.' +
        iso(fineMeseSucc) +
        '&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=8000',
    )) || [];
  const mappe = {}; // nome -> {data: codice}
  righeTutte.forEach((x) => ((mappe[x.collaboratore] = mappe[x.collaboratore] || {})[x.data] = x.codice));
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const giornoRel = (dstr, n) => {
    const d = new Date(dstr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const riposoTra = (codA, codB) => {
    const t1 = _pianoTurnoInfo(codA);
    const t2 = _pianoTurnoInfo(codB);
    if (!t1 || !t2) return null;
    const fine1 = _pianoOra(t1.ora_fine);
    const inizio2 = _pianoOra(t2.ora_inizio);
    if (fine1 == null || inizio2 == null) return null;
    const fineAbs = t1.oltre23 || fine1 < _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
    return 24 + inizio2 - fineAbs;
  };
  // simula: nella mappa di "nome", il giorno dstr diventa "codice"; ritorna
  // l'eventuale problema (riposo o consecutivi), null se tutto ok
  const problema = (mappa, dstr, codice) => {
    const m2 = Object.assign({}, mappa);
    m2[dstr] = codice;
    if (_pianoTurnoInfo(codice)) {
      const rP = riposoTra(m2[giornoRel(dstr, -1)], codice);
      if (rP != null && rP < minRiposo) return 'riposo ' + rP.toFixed(1) + 'h';
      const rD = riposoTra(codice, m2[giornoRel(dstr, 1)]);
      if (rD != null && rD < minRiposo) return 'riposo ' + rD.toFixed(1) + 'h';
      let cons = 1;
      for (let n = -1; n >= -maxCons - 2 && _pianoIsLavoro(m2[giornoRel(dstr, n)] || ''); n--) cons++;
      for (let n = 1; n <= maxCons + 2 && _pianoIsLavoro(m2[giornoRel(dstr, n)] || ''); n++) cons++;
      if (cons > maxCons) return cons + ' consecutivi';
    }
    return null;
  };
  const eLibero = (cod) => !cod || (!_pianoTurnoInfo(cod) && ['C', ''].includes(String(cod)));
  // CANDIDATI: a riposo il giorno X, idonei al turno, regole rispettate
  const candidati = [];
  collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && c.nome !== sel.nome && c.funzione !== 'RESP')
    .forEach((c) => {
      const mia = mappe[c.nome] || {};
      if (!eLibero(mia[sel.data])) return;
      if (!_pianoIdoneoPerTurno(c.nome, tMio)) return;
      const prob = problema(mia, sel.data, r.codice);
      if (prob) return;
      // accompagnamento il giorno X: il richiedente esce (C), il collega entra
      if (
        _pianoAccompagnamentoAvviso([
          { nome: sel.nome, data: sel.data, codice: 'C' },
          { nome: c.nome, data: sel.data, codice: r.codice },
        ]).length
      )
        return;
      // RESTITUZIONI: giorni dopo X (fino a fine mese successivo) dove il
      // collega lavora e il richiedente e' libero, con scambio inverso valido
      const mioPiano = Object.assign({}, mappe[sel.nome] || {});
      mioPiano[sel.data] = 'C'; // dopo il cambio il richiedente e' libero il giorno X
      const suoPiano = Object.assign({}, mia);
      suoPiano[sel.data] = r.codice;
      const rest = [];
      let d = new Date(sel.data + 'T12:00:00');
      for (let k = 0; k < 62 && rest.length < 14; k++) {
        d.setDate(d.getDate() + 1);
        const y = iso(d);
        if (y > iso(fineMeseSucc)) break;
        const codSuo = suoPiano[y];
        const tSuo = _pianoTurnoInfo(codSuo);
        if (!tSuo) continue;
        if (!eLibero(mioPiano[y])) continue;
        if (!_pianoIdoneoPerTurno(sel.nome, tSuo)) continue;
        if (problema(mioPiano, y, codSuo)) continue;
        // accompagnamento il giorno di restituzione: il collega esce (C), il
        // richiedente entra prendendo il turno del collega
        if (
          _pianoAccompagnamentoAvviso([
            { nome: c.nome, data: y, codice: 'C' },
            { nome: sel.nome, data: y, codice: codSuo },
          ]).length
        )
          continue;
        rest.push({ data: y, codice: codSuo, stesso: codSuo === r.codice, meseDopo: y.substring(0, 7) !== ym });
      }
      rest.sort((a, b) => (b.stesso ? 1 : 0) - (a.stesso ? 1 : 0) || (a.data < b.data ? -1 : 1));
      candidati.push({ nome: c.nome, jolly: c.impiego === 'jolly' || c.is_jolly, rest: rest });
    });
  candidati.sort((a, b) => b.rest.length - a.rest.length || a.nome.localeCompare(b.nome));
  if (!candidati.length) {
    toast("Nessun collega a riposo quel giorno puo' coprire " + r.codice + ' rispettando le regole');
    return;
  }
  _ccDati = { nome: sel.nome, data: sel.data, codice: r.codice, candidati: candidati };
  const dataIt = sel.data.split('-').reverse().join('.');
  let h =
    '<h3>Cerca cambio · ' +
    escP(sel.nome) +
    ' libero il ' +
    dataIt +
    '</h3><p style="font-size:.85rem;margin-bottom:10px">' +
    escP(sel.nome.split(' ')[0]) +
    ' cede il turno <b>' +
    escP(r.codice) +
    '</b> a un collega a riposo e lo restituisce prendendo un turno del collega in un altro giorno. Tutte le proposte rispettano idoneità, riposo minimo e giorni consecutivi.</p>' +
    '<div class="field" style="text-align:left"><label>Chi copre il ' +
    dataIt +
    '</label><select id="cc-collega" style="width:100%;padding:9px" onchange="ccAggiornaRestituzioni()">' +
    candidati
      .map(
        (c, i) =>
          '<option value="' +
          i +
          '">' +
          escP(c.nome) +
          (c.jolly ? ' (jolly)' : '') +
          ' · ' +
          c.rest.length +
          ' date possibili per la restituzione</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Giorno di restituzione</label><select id="cc-rest" style="width:100%;padding:9px"></select></div>' +
    '<div class="field" style="text-align:left;margin-top:8px"><label>Motivazione</label><input type="text" id="cc-motivo" placeholder="Es: esigenze personali..."></div>' +
    '<p style="font-size:.82rem;color:var(--muted);margin-top:8px">Puoi stampare la lista dei colleghi con cui puo\' cambiare e consegnarla al collaboratore: lui chiede a chi vuole, poi si torna qui e si conferma. Alla conferma: celle aggiornate col commento del cambio, formulario cambio turno gia\' compilato da stampare e firmare, conteggio nel limite cambi del richiedente.</p>' +
    '<div class="pwd-modal-btns" style="margin-top:12px;flex-wrap:wrap;gap:6px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button>' +
    '<button class="btn-export" style="padding:8px 14px" onclick="stampaListaCambioLibero()">Stampa lista colleghi</button>' +
    '<button class="btn-modal-ok" onclick="confermaCercaCambioLibero()">Applica cambio</button></div>';
  document.getElementById('pwd-modal-content').innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
  ccAggiornaRestituzioni();
}
// PDF della lista colleghi con cui il collaboratore puo' cambiare il giorno X,
// da consegnargli PRIMA di confermare: lui chiede, poi si torna e si applica
async function stampaListaCambioLibero() {
  if (!_ccDati) return;
  if (!window.jspdf) await caricaJsPDF();
  const doc = new window.jspdf.jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const dataIt = _ccDati.data.split('-').reverse().join('.');
  doc.setFontSize(13);
  doc.text('Cambio turno · colleghi disponibili', pw / 2, 16, { align: 'center' });
  doc.setFontSize(10);
  doc.text(_ccDati.nome + ' chiede di essere libero il ' + dataIt + ' (turno ' + _ccDati.codice + ')', pw / 2, 24, {
    align: 'center',
  });
  doc.setFontSize(8.5);
  doc.text(
    'Questi colleghi sono a riposo quel giorno e possono coprire rispettando le regole. ' +
      'Il turno va restituito prendendo un turno del collega in una delle date indicate.',
    pw / 2,
    31,
    { align: 'center', maxWidth: pw - 28 },
  );
  doc.autoTable({
    theme: 'grid',
    startY: 38,
    head: [['Collega', 'Tipo', 'Date possibili per restituire il turno']],
    body: _ccDati.candidati.map((c) => [
      c.nome,
      c.jolly ? 'jolly' : 'fisso',
      c.rest.length
        ? c.rest
            .slice(0, 10)
            .map((rr) => rr.data.split('-').reverse().join('.') + ' (' + rr.codice + ')' + (rr.stesso ? ' =' : ''))
            .join(',  ') + (c.rest.length > 10 ? '  ...' : '')
        : 'nessuna data compatibile',
    ]),
    headStyles: { fillColor: [26, 74, 122], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { cellWidth: 105 } },
    margin: { left: 12, right: 12 },
  });
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8.5);
  doc.text('"=" indica una data in cui il collega fa lo stesso turno (' + _ccDati.codice + ').', 14, y);
  y += 12;
  doc.text('Collega scelto: ______________________     Data restituzione: ______________', 14, y);
  y += 10;
  doc.text('Firma richiedente: __________________     Firma collega: __________________', 14, y);
  doc.setFontSize(8);
  doc.text(
    'Casino Lugano SA · lista informativa, il cambio va confermato dal responsabile',
    14,
    doc.internal.pageSize.getHeight() - 8,
  );
  mostraPdfPreview(doc, 'colleghi_cambio_' + _ccDati.data + '.pdf', 'Colleghi per il cambio');
}
function ccAggiornaRestituzioni() {
  if (!_ccDati) return;
  const i = parseInt((document.getElementById('cc-collega') || {}).value) || 0;
  const c = _ccDati.candidati[i];
  const sel = document.getElementById('cc-rest');
  if (!sel || !c) return;
  sel.innerHTML =
    '<option value="">senza restituzione (solo copertura)</option>' +
    c.rest
      .map(
        (x) =>
          '<option value="' +
          x.data +
          '">' +
          x.data.split('-').reverse().join('.') +
          ' · prende ' +
          escP(x.codice) +
          (x.stesso ? ' (stesso turno)' : '') +
          (x.meseDopo ? ' · mese successivo' : '') +
          '</option>',
      )
      .join('');
}
async function confermaCercaCambioLibero() {
  if (!_ccDati || !puoGestirePiano()) return;
  const i = parseInt((document.getElementById('cc-collega') || {}).value) || 0;
  const cand = _ccDati.candidati[i];
  const dataRest = (document.getElementById('cc-rest') || {}).value || '';
  const motivo = ((document.getElementById('cc-motivo') || {}).value || '').trim();
  const rInfo = cand.rest.find((x) => x.data === dataRest);
  const dataIt = _ccDati.data.split('-').reverse().join('.');
  const op = getOperatore();
  // limite cambi mensile: a carico di chi RICHIEDE il giorno libero
  const maxC = _pianoMaxCambi();
  if (maxC > 0) {
    const richiesti = await _pianoCambiRichiesti(_pianoMeseSel);
    const n = richiesti[_ccDati.nome] || 0;
    if (n >= maxC) {
      if (
        !confirm(
          'ATTENZIONE: ' +
            _ccDati.nome +
            " ha gia' richiesto " +
            n +
            '/' +
            maxC +
            " cambi questo mese.\n\nAutorizzi comunque il cambio come responsabile? (verra' registrato nello storico come autorizzazione in deroga)",
        )
      )
        return;
      logAzione('Piano: scambio autorizzato oltre limite', _ccDati.nome + ' (' + (n + 1) + '/' + maxC + ') da ' + op);
    }
  }
  let msg =
    _ccDati.nome + " sara' LIBERO (C) il " + dataIt + ';\n' + cand.nome + " coprira' il turno " + _ccDati.codice + '.';
  if (rInfo)
    msg +=
      '\n\nRESTITUZIONE il ' +
      dataRest.split('-').reverse().join('.') +
      ': ' +
      _ccDati.nome.split(' ')[0] +
      ' prende il turno ' +
      rInfo.codice +
      ' di ' +
      cand.nome.split(' ')[0] +
      ', che va a riposo (C).';
  else msg += '\n\nSenza restituzione automatica.';
  if (!confirm(msg + "\n\nConfermi? Verra' generato il formulario cambio turno da stampare e firmare.")) return;
  _pianoUndoSnap('cerca cambio ' + _ccDati.data);
  const scrivi = async (nome, dstr, codice, exCod, commento) => {
    const righe =
      (await secGet('piano?collaboratore=eq.' + encodeURIComponent(nome) + '&data=eq.' + dstr + '&limit=5')) || [];
    const r0 = righe[0];
    const body = {
      codice: codice,
      protetto: true,
      generato: false,
      commento: commento.substring(0, 400),
      operatore: op,
    };
    if (r0) {
      body.updated_at = new Date().toISOString();
      await secPatch('piano', 'id=eq.' + r0.id, body);
      const inMem = _pianoRighe.find((x) => x.id === r0.id);
      if (inMem) Object.assign(inMem, body);
    } else {
      body.collaboratore = nome;
      body.data = dstr;
      body.reparto_dip = _pianoReparto();
      await _pianoInserisciCella(body);
    }
  };
  try {
    // commenti nello stesso formato dello scambio classico: Ex <vecchio> - cambio con <nome> - <operatore>
    await scrivi(
      _ccDati.nome,
      _ccDati.data,
      'C',
      _ccDati.codice,
      'Ex ' + _ccDati.codice + ' - cambio con ' + cand.nome + ' - ' + op,
    );
    await scrivi(cand.nome, _ccDati.data, _ccDati.codice, 'C', 'Ex C - cambio con ' + _ccDati.nome + ' - ' + op);
    if (rInfo) {
      await scrivi(
        cand.nome,
        dataRest,
        'C',
        rInfo.codice,
        'Ex ' + rInfo.codice + ' - restituzione cambio con ' + _ccDati.nome + ' - ' + op,
      );
      await scrivi(
        _ccDati.nome,
        dataRest,
        rInfo.codice,
        'C',
        'Ex C - restituzione cambio con ' + cand.nome + ' - ' + op,
      );
    }
    logAzione(
      'Piano: scambio turno',
      _ccDati.nome +
        ' (giorno libero il ' +
        _ccDati.data +
        ' coperto da ' +
        cand.nome +
        (dataRest ? ', restituzione ' + dataRest : ', senza restituzione') +
        ')',
    );
    document.getElementById('pwd-modal').classList.add('hidden');
    // FORMULARIO gia' compilato, con la spunta Autorizzato: si stampa e si firma
    if (!window.jspdf) await caricaJsPDF();
    if (window.jspdf) {
      const t = _pianoTurnoInfo(_ccDati.codice);
      const fmtOra = (tt) =>
        tt
          ? '(' +
            (tt.ora_inizio || '').substring(0, 5) +
            '-' +
            (tt.ora_fine || '').substring(0, 5) +
            ', ' +
            (tt.gruppo || '') +
            ')'
          : '';
      const datiPdf = {
        tipo: 'SCAMBIO',
        data: new Date(_ccDati.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: _ccDati.nome, settore: repartoLabel(_pianoReparto()), turno: _ccDati.codice, orari: fmtOra(t) },
        b: { nome: cand.nome, settore: repartoLabel(_pianoReparto()), turno: 'C (riposo)', orari: '' },
        motivo: motivo || 'Richiesta giorno libero',
        richiesto: op,
        autorizzato: true,
        restituzione: rInfo
          ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') +
            ' \u00b7 ' +
            _ccDati.nome.split(' ')[0] +
            ' prende il turno ' +
            rInfo.codice +
            ' di ' +
            cand.nome.split(' ')[0]
          : null,
      };
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + _ccDati.data + '.pdf', 'Cambio turno ' + _ccDati.data);
      await _salvaFoglioCambio(datiPdf, _ccDati.nome, _ccDati.data);
    }
    toast('Cambio applicato' + (rInfo ? ' con restituzione' : ''));
    _ccDati = null;
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore applicazione cambio');
  }
}

// Il foglio del cambio resta ARCHIVIATO (tabella moduli, tipo cambio_turno):
// si ristampa in qualsiasi momento dal menu della cella
async function _salvaFoglioCambio(datiPdf, collaboratore, dataCambio) {
  try {
    const rec = {
      tipo: 'cambio_turno',
      collaboratore: collaboratore,
      data_modulo: dataCambio,
      dati: datiPdf,
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    const saved = await secPost('moduli', rec);
    if (saved && saved[0] && typeof moduliCache !== 'undefined') moduliCache.unshift(saved[0]);
  } catch (e) {
    console.error('archivio foglio cambio', e);
  }
}
async function ristampaFoglioCambio(nome, dstr) {
  try {
    let tutti = (await secGet('moduli?tipo=eq.cambio_turno&data_modulo=eq.' + dstr + '&limit=50')) || [];
    const perNome = (lista) =>
      lista.filter(
        (m) =>
          !m.eliminato &&
          m.dati &&
          ((m.dati.a && m.dati.a.nome === nome) || (m.dati.b && m.dati.b.nome === nome) || m.collaboratore === nome),
      );
    let miei = perNome(tutti);
    if (!miei.length) {
      // cella della RESTITUZIONE: il foglio e' archiviato sul giorno del
      // cambio, ma la data di restituzione compare nel campo dedicato
      const dataIt = new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT');
      const recenti = (await secGet('moduli?tipo=eq.cambio_turno&order=created_at.desc&limit=100')) || [];
      miei = perNome(recenti).filter((m) => String(m.dati.restituzione || '').includes(dataIt));
    }
    miei = miei.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (!miei.length) {
      toast('Nessun foglio cambio archiviato per ' + nome.split(' ')[0] + ' in questa data');
      return;
    }
    if (!window.jspdf) await caricaJsPDF();
    const doc = _pdfCambioTurno(miei[0].dati);
    mostraPdfPreview(doc, 'cambio_turno_' + dstr + '.pdf', 'Cambio turno ' + dstr);
  } catch (e) {
    console.error(e);
    toast('Errore ristampa foglio');
  }
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
    '<h3>Scambio turno · ' +
    new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT') +
    '</h3><p style="margin-bottom:10px;font-size:.86rem"><strong>' +
    escP(sel.nome) +
    '</strong> (' +
    escP(r.codice) +
    ') scambia con:</p>' +
    (maxCambi > 0
      ? '<p style="font-size:.82rem;color:' +
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
          ' · ' +
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
  // STESSE REGOLE DEL PIANO MANUALE, per TUTTI E DUE i lati dello scambio:
  // avviso + conferma del responsabile e violazione scritta nel commento
  let nota1 = '';
  let nota2 = '';
  if (typeof _pianoAvvisaViolazioniCella === 'function') {
    const av1 = _pianoTurnoInfo(c2) ? await _pianoAvvisaViolazioniCella(sel.nome, sel.data, c2) : [];
    const av2 = _pianoTurnoInfo(c1) ? await _pianoAvvisaViolazioniCella(collega, sel.data, c1) : [];
    // accompagnamento: valutato UNA volta con ENTRAMBE le celle scambiate,
    // instradato nel lato giusto per collaboratore
    _pianoAccompagnamentoAvviso([
      { nome: sel.nome, data: sel.data, codice: c2 },
      { nome: collega, data: sel.data, codice: c1 },
    ]).forEach((a) => (a.nome === collega ? av2 : av1).push(a.testo));
    if (av1.length || av2.length) {
      const dettagli = []
        .concat(av1.map((a) => sel.nome.split(' ')[0] + ': ' + a))
        .concat(av2.map((a) => collega.split(' ')[0] + ': ' + a));
      if (
        !confirm(
          '⚠ ATTENZIONE · scambio ' +
            sel.data.split('-').reverse().join('.') +
            ':\n\n• ' +
            dettagli.join('\n• ') +
            "\n\nConfermi comunque lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        )
      )
        return;
      if (av1.length) nota1 = '⚠ ' + av1.join(' · ') + ' · ';
      if (av2.length) nota2 = '⚠ ' + av2.join(' · ') + ' · ';
    }
  }
  // Restituzione: valido lo scambio inverso del giorno di restituzione PRIMA di
  // applicare qualsiasi cosa, cosi' se l'operatore annulla non e' stato toccato
  // nulla. Le note vanno poi nei commenti delle celle di restituzione.
  let notaRa = '';
  let notaRb = '';
  if (dataRest && typeof _pianoAvvisaViolazioniCella === 'function') {
    const raPre = _pianoRighe.find((x) => x.collaboratore === sel.nome && x.data === dataRest);
    const rbPre = _pianoRighe.find((x) => x.collaboratore === collega && x.data === dataRest);
    const caPre = raPre ? raPre.codice : '';
    const cbPre = rbPre ? rbPre.codice : '';
    const avA = _pianoTurnoInfo(cbPre) ? await _pianoAvvisaViolazioniCella(sel.nome, dataRest, cbPre) : [];
    const avB = _pianoTurnoInfo(caPre) ? await _pianoAvvisaViolazioniCella(collega, dataRest, caPre) : [];
    _pianoAccompagnamentoAvviso([
      { nome: sel.nome, data: dataRest, codice: cbPre },
      { nome: collega, data: dataRest, codice: caPre },
    ]).forEach((a) => (a.nome === collega ? avB : avA).push(a.testo));
    if (avA.length || avB.length) {
      const det = []
        .concat(avA.map((a) => sel.nome.split(' ')[0] + ': ' + a))
        .concat(avB.map((a) => collega.split(' ')[0] + ': ' + a));
      if (
        !confirm(
          '⚠ ATTENZIONE · restituzione del ' +
            dataRest.split('-').reverse().join('.') +
            ':\n\n• ' +
            det.join('\n• ') +
            "\n\nConfermi comunque tutto lo scambio? La segnalazione restera' scritta nel commento delle celle.",
        )
      )
        return;
      if (avA.length) notaRa = '⚠ ' + avA.join(' · ') + ' · ';
      if (avB.length) notaRb = '⚠ ' + avB.join(' · ') + ' · ';
    }
  }
  try {
    await secPatch('piano', 'id=eq.' + r1.id, {
      codice: c2,
      protetto: true,
      commento: (nota1 + (c1 ? 'Ex ' + c1 + ' - ' : '') + 'cambio con ' + collega + ' - ' + getOperatore()).substring(
        0,
        400,
      ),
      operatore: getOperatore(),
      updated_at: new Date().toISOString(),
    });
    await secPatch('piano', 'id=eq.' + r2.id, {
      codice: c1,
      protetto: true,
      commento: (nota2 + (c2 ? 'Ex ' + c2 + ' - ' : '') + 'cambio con ' + sel.nome + ' - ' + getOperatore()).substring(
        0,
        400,
      ),
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
      const applica = async (riga, nomeC, nuovoCod, exCod, altroNome, notaR) => {
        const commento = (notaR || '') + 'Ex ' + exCod + ' - restituzione cambio con ' + altroNome + ' - ' + op;
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
          const n = await _pianoInserisciCella({
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
      await applica(ra, sel.nome, cb, ca, collega, notaRa);
      await applica(rb, collega, ca, cb, sel.nome, notaRb);
      logAzione('Piano: restituzione programmata', sel.nome + ' <-> ' + collega + ' il ' + dataRest);
    }
    logAzione('Piano: scambio turno', sel.nome + ' (' + c1 + ') <-> ' + collega + ' (' + c2 + ') il ' + sel.data);
    toast(
      'Turni scambiati' +
        (dataRest ? ' · restituzione il ' + new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : ''),
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
      const datiPdf = {
        tipo: 'SCAMBIO',
        data: new Date(sel.data + 'T12:00:00').toLocaleDateString('it-IT'),
        a: { nome: sel.nome, settore: repartoLabel(_pianoReparto()), turno: c1, orari: fmtOra(t1) },
        b: { nome: collega, settore: repartoLabel(_pianoReparto()), turno: c2, orari: fmtOra(t2) },
        motivo: motivo,
        richiesto: getOperatore(),
        autorizzato: true,
        restituzione: dataRest ? new Date(dataRest + 'T12:00:00').toLocaleDateString('it-IT') : null,
      };
      const doc = _pdfCambioTurno(datiPdf);
      mostraPdfPreview(doc, 'cambio_turno_' + sel.data + '.pdf', 'Cambio turno ' + sel.data);
      await _salvaFoglioCambio(datiPdf, sel.nome, sel.data);
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
// COPERTURA MALATTIA · port di malattia_cerca/malattia_conferma di
// Turnivo: per ogni giorno del periodo propone il miglior sostituto
// libero e idoneo (greedy: meno ore mese + meno giorni consecutivi),
// alla conferma mette M al malato e i turni (protetti) ai sostituti.
// ================================================================
function _pianoIdoneoPerTurno(nome, turno) {
  // idoneita' (settori, regole di gruppo, solo_diurni, turni bloccati, mappatura
  // funzione, regola L1): la logica vive nel motore puro PianoRegole, qui si
  // iniettano solo gli accessi allo stato dell'app
  const info = _pianoCollabInfo(nome) || {};
  return PianoRegole.idoneoPerTurno(info, turno, {
    settoriDi: (i) => _pianoSettoriEffettivi(i),
    regoleGruppoDi: (gr) => _pianoRegoleGruppoDi(gr),
    campoOk: (i, v) => _pianoCampoOk(i, v),
    mappFunzione: (fz) => _pianoMappFunzione(fz),
    regolaVal: (n) => _pianoRegolaVal(n),
  });
}
function apriCoperturaMalattia() {
  if (!puoGestirePiano()) return;
  const nomi = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome);
  const nGiorni = _pianoUltimoGiorno(_pianoMeseSel);
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Copertura malattia · ' +
    _pianoMeseSel +
    '</h3><p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Cerca i migliori sostituti liberi per i turni del collaboratore malato.</p>' +
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
  // CROSS-MESE: carico gli ultimi giorni del mese precedente e i primi del
  // successivo con indice continuo (0, -1... e oltre l'ultimo del mese), cosi'
  // riposo e consecutivi valgono anche a cavallo tra un mese e l'altro
  const _primoDelMese = new Date(ym + '-01T12:00:00');
  const _nGiorniMese = _pianoUltimoGiorno(ym);
  const _isoB = (d) => d.toISOString().substring(0, 10);
  const _bDa = new Date(_primoDelMese);
  _bDa.setDate(_bDa.getDate() - 8);
  const _bAl = new Date(_primoDelMese);
  _bAl.setDate(_bAl.getDate() + _nGiorniMese + 7);
  try {
    const _righeBordo =
      (await secGet(
        'piano?data=gte.' + _isoB(_bDa) + '&data=lt.' + ym + '-01&reparto_dip=eq.' + _pianoReparto() + '&limit=4000',
      )) || [];
    const _righeBordo2 =
      (await secGet(
        'piano?data=gt.' +
          ym +
          '-' +
          String(_nGiorniMese).padStart(2, '0') +
          '&data=lte.' +
          _isoB(_bAl) +
          '&reparto_dip=eq.' +
          _pianoReparto() +
          '&limit=4000',
      )) || [];
    [..._righeBordo, ..._righeBordo2].forEach((r) => {
      const idx = Math.round((new Date(r.data + 'T12:00:00') - _primoDelMese) / 86400000) + 1;
      cella[r.collaboratore + '|' + idx] = r.codice;
    });
  } catch (e) {}
  const oreMese = {};
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) oreMese[r.collaboratore] = (oreMese[r.collaboratore] || 0) + (parseFloat(t.durata_ore) || 0);
  });
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 5;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 11;
  const consecFinoA = (n, g) => {
    let c = 0;
    // scende anche nel mese precedente (indici 0, -1, ...) per i consecutivi
    for (let k = g - 1; k >= g - 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) c++;
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
  // controllo COMPLETO per la persona n attorno al giorno g0, leggendo la
  // mappa `cella` gia' simulata: riposo 11h (prima e dopo) E max consecutivi.
  // Usato dalle mosse a catena per verificare TUTTI i collaboratori toccati.
  const regolaOkSost = (n, g0) => {
    const cod0 = cella[n + '|' + g0] || '';
    const t0 = _pianoTurnoInfo(cod0);
    if (t0) {
      const tPrev = _pianoTurnoInfo(cella[n + '|' + (g0 - 1)] || '');
      if (tPrev) {
        const fp = _pianoOra(tPrev.ora_fine);
        const fpAbs = tPrev.oltre23 || fp < _pianoOra(tPrev.ora_inizio) ? 24 + fp : fp;
        if (24 + _pianoOra(t0.ora_inizio) - fpAbs < minRiposo) return false;
      }
      const tNext = _pianoTurnoInfo(cella[n + '|' + (g0 + 1)] || '');
      if (tNext) {
        const f0 = _pianoOra(t0.ora_fine);
        const f0Abs = t0.oltre23 || f0 < _pianoOra(t0.ora_inizio) ? 24 + f0 : f0;
        if (24 + _pianoOra(tNext.ora_inizio) - f0Abs < minRiposo) return false;
      }
    }
    if (_pianoIsLavoro(cod0)) {
      let cons = 1;
      // conta a cavallo del mese in entrambe le direzioni
      for (let k = g0 - 1; k >= g0 - 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) cons++;
      for (let k = g0 + 1; k <= g0 + 40 && _pianoIsLavoro(cella[n + '|' + k] || ''); k++) cons++;
      if (cons > maxCons) return false;
    }
    return true;
  };
  // ACCOMPAGNAMENTO nella simulazione `cella`: nel giorno g0 nessun collega
  // "accompagnato" deve restare da solo nel suo gruppo
  const accompagnamentoOkSost = (g0) => {
    const conta = {};
    const accs = [];
    for (const nm of nomi) {
      const tt = _pianoTurnoInfo(cella[nm + '|' + g0] || '');
      if (!tt) continue;
      const gr = (tt.gruppo || '').toUpperCase();
      if (!gr) continue;
      conta[gr] = (conta[gr] || 0) + 1;
      const info = _pianoCollabInfo(nm);
      if (!info) continue;
      let acc = !!(info.accompagnamento_settori && _pianoAccompagnamentoDi(info).includes(gr));
      const cop = _pianoCoperturaCfg(info);
      if (cop && cop.accompagnato) acc = true;
      if (acc) accs.push(gr);
    }
    return accs.every((gr) => (conta[gr] || 0) > 1);
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
      // accompagnamento: simula malato→M e sostituto→turno, poi verifica
      const _accM = cella[nome + '|' + g];
      const _accN = cella[n + '|' + g];
      cella[nome + '|' + g] = 'M';
      cella[n + '|' + g] = cod;
      const _accOk = accompagnamentoOkSost(g);
      cella[nome + '|' + g] = _accM;
      cella[n + '|' + g] = _accN;
      if (!_accOk) continue;
      const punteggio = (oreMese[n] || 0) + consecFinoA(n, g) * 10;
      if (punteggio < migliorePunteggio) {
        migliorePunteggio = punteggio;
        migliore = n;
      }
    }
    // SOLUZIONE A CATENA: nessun candidato diretto. Provo a liberare chi
    // avrebbe il giorno libero ma e' bloccato dal turno del giorno prima
    // (es. notte): quel turno si scambia con un collega o passa a un terzo,
    // sempre rispettando idoneita', riposo 11h e consecutivi.
    let catena = null;
    if (!migliore) {
      for (const x of nomi) {
        if (catena) break;
        if (x === nome) continue;
        const codX = cella[x + '|' + g] || '';
        if (codX) {
          const csX = _pianoCodiceInfo(codX);
          const rX = rigaDi[x + '|' + g];
          if (!(csX && csX.is_riposo && !(rX && rX.protetto && codX === 'V'))) continue;
        }
        if (!_pianoIdoneoPerTurno(x, t)) continue;
        if (consecFinoA(x, g) >= maxCons) continue;
        const codP = cella[x + '|' + (g - 1)] || '';
        const tP = _pianoTurnoInfo(codP);
        if (!tP) continue; // non e' bloccato da un turno del giorno prima
        if (riposoOkSost(x, g, t)) continue; // sarebbe gia' un candidato diretto
        const salvaP = cella[x + '|' + (g - 1)];
        cella[x + '|' + (g - 1)] = '';
        const sbloccato = riposoOkSost(x, g, t);
        cella[x + '|' + (g - 1)] = salvaP;
        if (!sbloccato) continue;
        // opzione 1: SCAMBIO alla pari del giorno prima con un collega. Dopo
        // lo scambio si controllano TUTTE le regole (riposo + consecutivi) per
        // x (giorno prima e giorno della copertura) e per z (giorno prima)
        for (const z of nomi) {
          if (z === x || z === nome) continue;
          const codS = cella[z + '|' + (g - 1)] || '';
          const tS = _pianoTurnoInfo(codS);
          if (!tS || codS === codP) continue;
          if (!_pianoIdoneoPerTurno(x, tS) || !_pianoIdoneoPerTurno(z, tP)) continue;
          const s1 = cella[x + '|' + (g - 1)];
          const s2 = cella[z + '|' + (g - 1)];
          const sG = cella[x + '|' + g];
          const sMal = cella[nome + '|' + g];
          cella[x + '|' + (g - 1)] = codS;
          cella[z + '|' + (g - 1)] = codP;
          cella[x + '|' + g] = cod; // x copre la malattia il giorno g
          cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
          const ok =
            regolaOkSost(x, g - 1) &&
            regolaOkSost(x, g) &&
            regolaOkSost(z, g - 1) &&
            regolaOkSost(z, g) &&
            accompagnamentoOkSost(g) &&
            accompagnamentoOkSost(g - 1);
          cella[x + '|' + (g - 1)] = s1;
          cella[z + '|' + (g - 1)] = s2;
          cella[x + '|' + g] = sG;
          cella[nome + '|' + g] = sMal;
          if (ok) {
            catena = { tipo: 'scambio', g1: g - 1, turnoX: codP, con: z, turnoCon: codS };
            break;
          }
        }
        // opzione 2: il turno del giorno prima PASSA a un terzo libero. Si
        // controllano TUTTE le regole per il terzo (che si carica il turno) e
        // per x (liberato il giorno prima, che copre il giorno g)
        if (!catena) {
          for (const y of nomi) {
            if (y === x || y === nome) continue;
            const codY = cella[y + '|' + (g - 1)] || '';
            if (codY) {
              const csY = _pianoCodiceInfo(codY);
              const rY = rigaDi[y + '|' + (g - 1)];
              if (!(csY && csY.is_riposo && !(rY && rY.protetto && codY === 'V'))) continue;
            }
            if (!_pianoIdoneoPerTurno(y, tP)) continue;
            const sy = cella[y + '|' + (g - 1)];
            const sx1 = cella[x + '|' + (g - 1)];
            const sxG = cella[x + '|' + g];
            const sMal2 = cella[nome + '|' + g];
            cella[y + '|' + (g - 1)] = codP; // il terzo prende il turno
            cella[x + '|' + (g - 1)] = 'C'; // x liberato il giorno prima
            cella[x + '|' + g] = cod; // x copre la malattia
            cella[nome + '|' + g] = 'M'; // il malato esce dal gruppo
            const ok =
              regolaOkSost(y, g - 1) &&
              regolaOkSost(x, g - 1) &&
              regolaOkSost(x, g) &&
              accompagnamentoOkSost(g) &&
              accompagnamentoOkSost(g - 1);
            cella[y + '|' + (g - 1)] = sy;
            cella[x + '|' + (g - 1)] = sx1;
            cella[x + '|' + g] = sxG;
            cella[nome + '|' + g] = sMal2;
            if (ok) {
              catena = { tipo: 'riassegna', g1: g - 1, turnoX: codP, con: y, eraCon: cella[y + '|' + (g - 1)] || '' };
              break;
            }
          }
        }
        if (catena) {
          migliore = x;
          // aggiorno la simulazione progressiva anche per la mossa a catena
          if (catena.tipo === 'scambio') {
            cella[x + '|' + (g - 1)] = catena.turnoCon;
            cella[catena.con + '|' + (g - 1)] = catena.turnoX;
          } else {
            cella[x + '|' + (g - 1)] = 'C';
            cella[catena.con + '|' + (g - 1)] = catena.turnoX;
            oreMese[catena.con] = (oreMese[catena.con] || 0) + (parseFloat(tP.durata_ore) || 0);
            oreMese[x] = Math.max(0, (oreMese[x] || 0) - (parseFloat(tP.durata_ore) || 0));
          }
        }
      }
    }
    if (migliore) {
      giorni.push({
        g: g,
        codice: cod,
        orari: (t.ora_inizio || '').substring(0, 5) + '-' + (t.ora_fine || '').substring(0, 5),
        sostituto: migliore,
        era: cella[migliore + '|' + g] || '',
        catena: catena,
      });
      cella[migliore + '|' + g] = cod; // override progressivo, come il greedy Turnivo
      oreMese[migliore] = (oreMese[migliore] || 0) + (parseFloat(t.durata_ore) || 0);
    } else {
      giorni.push({ g: g, codice: cod, scoperto: true });
    }
  }
  _malattiaPiano = { nome: nome, da: da, al: al, giorni: giorni };
  const descCatena = (d) =>
    !d.catena
      ? ''
      : d.catena.tipo === 'scambio'
        ? "In piu' il " +
          d.catena.g1 +
          ': ' +
          d.sostituto.split(' ')[0] +
          ' fa ' +
          d.catena.turnoCon +
          ' e ' +
          d.catena.con.split(' ')[0] +
          ' fa ' +
          d.catena.turnoX +
          ' (scambio alla pari)'
        : "In piu' il " +
          d.catena.g1 +
          ': il turno ' +
          d.catena.turnoX +
          ' di ' +
          d.sostituto.split(' ')[0] +
          ' passa a ' +
          d.catena.con.split(' ')[0] +
          ", cosi' " +
          d.sostituto.split(' ')[0] +
          " puo' coprire";
  _malattiaPiano.descCatena = descCatena;
  let h =
    '<table class="piano-table" style="min-width:100%;font-size:.82rem"><thead><tr><th></th><th>Giorno</th><th>Turno</th><th style="text-align:left">Sostituto proposto</th></tr></thead><tbody>';
  giorni.forEach((d) => {
    if (d.salta)
      h +=
        '<tr><td></td><td>' +
        d.g +
        '</td><td colspan="2" style="color:var(--muted);text-align:left">' +
        d.salta +
        '</td></tr>';
    else if (d.scoperto)
      h +=
        '<tr><td></td><td>' +
        d.g +
        '</td><td>' +
        escP(d.codice) +
        '</td><td style="color:#c0392b;font-weight:700;text-align:left">NESSUN SOSTITUTO DISPONIBILE (nemmeno con cambi a catena)</td></tr>';
    else
      h +=
        '<tr><td><input type="checkbox" class="mal-sel" data-g="' +
        d.g +
        '" checked title="Togli la spunta per NON applicare questa soluzione (la M al malato resta)"></td><td>' +
        d.g +
        '</td><td><b>' +
        escP(d.codice) +
        '</b> ' +
        d.orari +
        '</td><td style="text-align:left;color:#2c6e49;font-weight:700">' +
        escP(d.sostituto) +
        (d.era ? ' <span style="color:var(--muted);font-weight:400">(era ' + escP(d.era) + ')</span>' : '') +
        (d.catena
          ? '<div style="font-weight:400;color:#b8860b;font-size:.82rem">' + escP(descCatena(d)) + '</div>'
          : '') +
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
    '. Alla conferma: M (protetta) al malato su tutti i giorni; turni protetti SOLO per le soluzioni con la spunta' +
    (coperti ? ', punti incentivo con conferma' : '') +
    '. Le mosse a catena scrivono il commento anche sulle celle del giorno prima.</p>';
  h +=
    '<button class="btn-export" style="font-size:.8rem;padding:5px 14px;margin-top:4px" onclick="stampaPropostaCopertura()">Stampa proposta</button>';
  out.innerHTML = h;
  document.getElementById('mal-btn-conferma').style.display = coperti || giorni.some((d) => d.codice) ? '' : 'none';
}
// PDF della proposta di copertura: lista giorni, sostituti e mosse a catena,
// da stampare e discutere prima di confermare
async function stampaPropostaCopertura() {
  const m = _malattiaPiano;
  if (!m) return;
  if (!window.jspdf) await caricaJsPDF();
  const doc = new window.jspdf.jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  doc.setFontSize(13);
  doc.text('Proposta copertura malattia', pw / 2, 16, { align: 'center' });
  doc.setFontSize(9);
  doc.text(
    m.nome +
      ' · giorni ' +
      m.da +
      '-' +
      m.al +
      ' ' +
      _pianoMeseSel +
      ' · settore ' +
      repartoLabel(_pianoReparto()) +
      ' · preparata da ' +
      getOperatore() +
      ' il ' +
      new Date().toLocaleDateString('it-IT'),
    pw / 2,
    23,
    { align: 'center' },
  );
  doc.autoTable({
    theme: 'grid',
    startY: 30,
    head: [['Giorno', 'Turno', 'Sostituto proposto', 'Mossa aggiuntiva']],
    body: m.giorni.map((d) => [
      d.g,
      d.salta ? '-' : d.codice + (d.orari ? ' ' + d.orari : ''),
      d.salta ? d.salta : d.scoperto ? 'NESSUN SOSTITUTO' : d.sostituto + (d.era ? ' (era ' + d.era + ')' : ''),
      d.catena ? m.descCatena(d) : '',
    ]),
    headStyles: { fillColor: [26, 74, 122], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 12, right: 12 },
  });
  doc.setFontSize(8);
  doc.text('Casino Lugano SA · proposta operativa, non vincolante', 14, doc.internal.pageSize.getHeight() - 8);
  mostraPdfPreview(doc, 'proposta_copertura_' + _pianoMeseSel + '.pdf', 'Proposta copertura');
}
// PIANO → DIARIO: una malattia scritta nel piano si registra anche nel Diario,
// cosi' la scheda collaboratore conta i giorni (i giorni C dentro il range,
// mostrati come MC, sono inclusi). Un giorno gia' registrato non si duplica.
async function _pianoMalattiaNelDiario(nome, dal, al, chiedi) {
  if (typeof datiCache === 'undefined' || typeof secPost !== 'function') return 0;
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const dI = new Date(dal + 'T12:00:00'),
    dF = new Date(al + 'T12:00:00');
  const giorniNuovi = [];
  for (let d = new Date(dI); d <= dF; d.setDate(d.getDate() + 1)) {
    const dStr =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const esiste = datiCache.find(
      (e) =>
        (e.nome || '').toLowerCase() === nome.toLowerCase() &&
        e.tipo === tipoMal &&
        String(e.data || '').startsWith(dStr),
    );
    if (!esiste) giorniNuovi.push(dStr);
  }
  if (!giorniNuovi.length) return 0;
  if (
    chiedi &&
    !confirm(
      'Registrare la malattia anche nel Diario di ' +
        nome +
        ' (' +
        giorniNuovi.length +
        (giorniNuovi.length === 1 ? ' giorno' : ' giorni') +
        ")?\n\nCosi' i giorni contano nella scheda del collaboratore.",
    )
  )
    return 0;
  const lbl = ' (dal ' + dI.toLocaleDateString('it-IT') + ' al ' + dF.toLocaleDateString('it-IT') + ')';
  let creati = 0;
  for (const dStr of giorniNuovi) {
    const rec = {
      id: Date.now() + creati,
      nome: nome,
      tipo: tipoMal,
      testo: 'Malattia registrata dal piano' + lbl,
      data: dStr + 'T08:00:00.000Z',
      operatore: getOperatore(),
      reparto_dip: _pianoReparto(),
    };
    try {
      await secPost('registrazioni', rec);
      datiCache.unshift(rec);
      creati++;
    } catch (e) {}
  }
  if (creati) logAzione('Malattia dal piano', nome + ' · ' + creati + ' giorni registrati nel Diario');
  return creati;
}
// PIANO → DIARIO anche in rimozione: se una M sparisce dal piano (tolta o
// sovrascritta con un turno), il programma propone di togliere quei giorni
// anche dal Diario. Le registrazioni finiscono nel Cestino, recuperabili.
async function _pianoMalattiaViaDiario(nome, giorniDstr) {
  if (typeof datiCache === 'undefined' || typeof secPatch !== 'function') return 0;
  const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
  const daTogliere = datiCache.filter(
    (e) =>
      (e.nome || '').toLowerCase() === nome.toLowerCase() &&
      e.tipo === tipoMal &&
      !e.eliminato &&
      giorniDstr.some((d) => String(e.data || '').startsWith(d)),
  );
  if (!daTogliere.length) return 0;
  const gg = daTogliere
    .map((e) => String(e.data).substring(8, 10) + '/' + String(e.data).substring(5, 7))
    .sort()
    .join(', ');
  const nG = daTogliere.length;
  if (
    !confirm(
      'Nel Diario ' +
        nome +
        ' risulta in malattia ' +
        (nG === 1 ? 'il giorno ' : 'nei giorni ') +
        gg +
        '.\n\nTogliere ' +
        (nG === 1 ? 'questo giorno' : 'questi ' + nG + ' giorni') +
        " anche dal Diario? Le registrazioni finiscono nel Cestino (recuperabili) e la scheda del collaboratore si aggiorna.\n\nOK = togli anche dal Diario · Annulla = il Diario resta com'e'",
    )
  )
    return 0;
  const op = getOperatore();
  const now = new Date().toISOString();
  let tolte = 0;
  for (const e of daTogliere) {
    try {
      await secPatch('registrazioni', 'id=eq.' + e.id, { eliminato: true, eliminato_da: op, eliminato_at: now });
      e.eliminato = true;
      tolte++;
    } catch (err) {}
  }
  datiCache = datiCache.filter((e) => !e.eliminato);
  if (tolte) {
    logAzione('Malattia tolta dal piano', nome + ' · ' + tolte + ' giorni spostati nel cestino del Diario');
    toast('Diario aggiornato: ' + tolte + (tolte === 1 ? ' giorno' : ' giorni') + ' di malattia nel Cestino');
  }
  return tolte;
}
async function confermaCoperturaMalattia() {
  const m = _malattiaPiano;
  if (!m) return;
  // soluzioni selezionate: senza spunta la M resta ma il sostituto non si tocca
  const selGiorni = new Set([...document.querySelectorAll('.mal-sel:checked')].map((c) => parseInt(c.dataset.g)));
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
          commento: ('Ex ' + d.codice + ' - assenza - ' + op).substring(0, 400),
          operatore: op,
          updated_at: new Date().toISOString(),
        });
      } else {
        await _pianoInserisciCella({
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
      // turno al sostituto (protetto), SOLO se la soluzione ha la spunta
      if (d.sostituto && selGiorni.has(d.g)) {
        // MOSSA A CATENA sul giorno prima, se prevista dalla proposta
        if (d.catena) {
          const g1 = d.catena.g1;
          const rX1 = rigaDi[d.sostituto + '|' + g1];
          if (d.catena.tipo === 'scambio') {
            const rZ = rigaDi[d.catena.con + '|' + g1];
            if (rX1 && rZ) {
              await secPatch('piano', 'id=eq.' + rX1.id, {
                codice: d.catena.turnoCon,
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoX +
                  ' - scambio per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
              await secPatch('piano', 'id=eq.' + rZ.id, {
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoCon +
                  ' - scambio per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            }
          } else {
            // riassegna: il sostituto viene liberato, il suo turno passa al terzo
            if (rX1)
              await secPatch('piano', 'id=eq.' + rX1.id, {
                codice: 'C',
                protetto: true,
                generato: false,
                commento: (
                  'Ex ' +
                  d.catena.turnoX +
                  ' - liberato per coprire malattia di ' +
                  m.nome +
                  ' - ' +
                  op
                ).substring(0, 400),
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            const rY = rigaDi[d.catena.con + '|' + g1];
            const commY = (
              (d.catena.eraCon ? 'Ex ' + d.catena.eraCon + ' - ' : '') +
              'prende il turno di ' +
              d.sostituto.split(' ')[0] +
              ' (copertura malattia di ' +
              m.nome.split(' ')[0] +
              ') - ' +
              op
            ).substring(0, 400);
            if (rY) {
              await secPatch('piano', 'id=eq.' + rY.id, {
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: commY,
                operatore: op,
                updated_at: new Date().toISOString(),
              });
            } else {
              await _pianoInserisciCella({
                collaboratore: d.catena.con,
                data: dstrDi(g1),
                codice: d.catena.turnoX,
                protetto: true,
                generato: false,
                commento: commY,
                reparto_dip: _pianoReparto(),
                operatore: op,
              });
            }
            sostituti.add(d.catena.con); // si carica un turno in piu': incentivi con conferma
          }
        }
        const rS = rigaDi[d.sostituto + '|' + d.g];
        const commento = ('Ex ' + (d.era || '-') + ' - cambio per esigenze operative - ' + op).substring(0, 400);
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
          await _pianoInserisciCella({
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
    // punti incentivo: MAI automatici, il responsabile conferma prima; e solo
    // se il sistema incentivi (e l'azione copertura) e' acceso
    let puntiDati = false;
    if (
      typeof _insertPuntiEvento === 'function' &&
      typeof getPuntiConfig === 'function' &&
      sostituti.size &&
      (typeof incentiviAttivi !== 'function' || incentiviAttivi('copertura'))
    ) {
      const az = (getPuntiConfig().azioni || []).find((a) => a.key === 'copertura');
      const dataLbl = new Date(ym + '-' + String(m.da).padStart(2, '0') + 'T12:00:00').toLocaleDateString('it-IT');
      if (
        az &&
        confirm(
          'Incentivi: assegnare +' +
            az.punti +
            ' punti (copertura) a ' +
            [...sostituti].join(', ') +
            "?\n\nAnnulla = nessun punto ora (si puo' fare dopo dal popup o da Formazione).",
        )
      ) {
        for (const n of sostituti) {
          const ok = await _insertPuntiEvento(
            n,
            az.punti,
            'copertura',
            'Copertura malattia di ' + m.nome + ' del ' + dataLbl + ' (giorni ' + m.da + '-' + m.al + ' ' + ym + ')',
          );
          if (ok) puntiDati = true;
        }
      }
    }
    logAzione(
      'Copertura malattia',
      m.nome + ' ' + m.da + '-' + m.al + ' ' + ym + ': ' + nM + ' M, ' + nSost + ' sostituzioni',
    );
    // piano e Diario sempre allineati: la malattia si registra anche nel Diario
    const nDiario = await _pianoMalattiaNelDiario(m.nome, dstrDi(m.da), dstrDi(m.al), false);
    toast(
      'Copertura registrata: ' +
        nM +
        ' giorni M, ' +
        nSost +
        ' sostituzioni' +
        (nDiario ? ', ' + nDiario + ' giorni nel Diario' : '') +
        (puntiDati ? ', punti assegnati' : ''),
    );
    // popup incentivi come per la malattia dal rapporto: i sostituti hanno
    // gia' i punti (compaiono in "Gia' registrato"), qui si segnano i rifiuti
    if (typeof apriPopupCopertura === 'function')
      setTimeout(() => apriPopupCopertura(m.nome, ym + '-' + String(m.da).padStart(2, '0')), 500);
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
// LARGHEZZA AUTOMATICA delle due colonne fisse (nome e funzione): si misura
// il testo piu' lungo prima di disegnare, perche' le tabelle del piano hanno
// colonne a larghezza fissa (servono ad allineare i giorni con fabbisogno,
// differenze ed effettivi: la somma nome+funzione dev'essere uguale ovunque)
function _pianoMisura(txt, font) {
  const c = (window._pianoCanvasMis = window._pianoCanvasMis || document.createElement('canvas'));
  const ctx = c.getContext('2d');
  ctx.font = font;
  return ctx.measureText(txt || '').width;
}
function _pianoCalcolaLarghezze(nomi) {
  const ff = ' system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  let maxN = 0;
  let maxF = 0;
  (nomi || []).forEach((n) => {
    const info = _pianoCollabInfo(n);
    let w = _pianoMisura(n, '600 14px' + ff);
    if (info && info.lingue) w += 6 + _pianoMisura(info.lingue, '700 10px' + ff);
    if (w > maxN) maxN = w;
    const perc = info ? parseFloat(info.percentuale) || 1 : 1;
    const t = (
      (info && info.is_jolly ? 'JOLLY' : (info && info.funzione) || '') +
      ' ' +
      Math.round(perc * 100) +
      '%'
    ).trim();
    const wf = _pianoMisura(t, '700 11.5px' + ff);
    if (wf > maxF) maxF = wf;
  });
  // icona stampa + margini nel nome, respiro nella colonna funzione
  window._pianoLargCol = {
    nome: Math.min(330, Math.max(150, Math.ceil(maxN + 36))),
    fun: Math.min(110, Math.max(44, Math.ceil(maxF + 14))),
  };
  window._pianoLargCol.tot = window._pianoLargCol.nome + window._pianoLargCol.fun;
  return window._pianoLargCol;
}
function _pianoLC() {
  return window._pianoLargCol || { nome: 150, fun: 44, tot: 194 };
}
// La colonna del nome si allarga da sola in base al nome piu' lungo (CSS):
// qui si riallinea la colonna Fun (funzione + percentuale), che resta
// appiccicata subito dopo, alla larghezza reale che il browser ha calcolato
function _pianoLarghezzaNomi() {
  document.querySelectorAll('#piano-content .piano-wrap table').forEach((tab) => {
    const nome = tab.querySelector('.piano-nome');
    if (!nome) return;
    const w = Math.round(nome.getBoundingClientRect().width);
    if (!w) return;
    tab.querySelectorAll('.piano-fun').forEach((el) => {
      if (el.style.left !== w + 'px') el.style.left = w + 'px';
    });
  });
}
function _pianoInitSticky() {
  requestAnimationFrame(_pianoLarghezzaNomi);
  if (!window._pianoLargBound) {
    window._pianoLargBound = true;
    window.addEventListener('resize', () => requestAnimationFrame(_pianoLarghezzaNomi), { passive: true });
  }
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
  // piano-wrap · griglia collaboratori E fabbisogno. Le COLONNE data sono
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
        // Ctrl/Cmd+click: selezione SPARSA di giorni con barra azioni
        if ((e.ctrlKey || e.metaKey) && g) {
          _pianoSparseToggleGiorno(g);
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
      // doppio clic su ore pianificate o saldo: si scrivono le ore reali del mese
      riga.querySelectorAll('td.piano-op, td.piano-sm').forEach((td) => {
        td.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (riga.dataset.nome) pianoScriviOreMese(riga.dataset.nome);
        });
      });
      const nomeCella = riga.querySelector('.piano-nome');
      if (!nomeCella) return;
      nomeCella.style.cursor = 'pointer';
      // doppio clic sul nome: scheda del collaboratore (il clic singolo resta
      // la selezione della riga, con Ctrl/Shift per piu' collaboratori)
      nomeCella.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (riga.dataset.nome && typeof apriSchedaCollaboratore === 'function')
          apriSchedaCollaboratore(riga.dataset.nome);
      });
      if (riga.dataset.nome) nomeCella.addEventListener('contextmenu', (e) => mostraPianoCtxNome(e, riga.dataset.nome));
      nomeCella.addEventListener('click', (e) => {
        if (e.target.closest('a, .piano-pdf-ico')) return;
        e.stopPropagation();
        // Ctrl/Cmd+click: selezione SPARSA di collaboratori con barra azioni
        if ((e.ctrlKey || e.metaKey) && riga.dataset.nome) {
          _pianoSparseToggleNome(riga.dataset.nome, riga);
          return;
        }
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
      cel.title = (cel.title ? cel.title + ' · ' : '') + 'trascina per riordinare';
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
      // celle dei TOTALI (Ore, D, N, OD, OP, SM, YTD): selezione sparsa come
      // Excel (click = solo quella, Ctrl/Cmd+click = aggiungi o togli); la
      // barra di calcolo mostra somma e media anche di queste
      const tdTot = e.target.closest('#piano-content tbody td.piano-tot');
      if (tdTot) {
        if (window._pianoTotDragged) {
          // click di rilascio subito dopo un trascinamento: si ignora una
          // volta sola, la selezione trascinata resta
          window._pianoTotDragged = false;
          return;
        }
        if (e.ctrlKey || e.metaKey) tdTot.classList.toggle('tot-sel');
        else {
          document.querySelectorAll('#piano-content .tot-sel').forEach((x) => x.classList.remove('tot-sel'));
          tdTot.classList.add('tot-sel');
        }
        setTimeout(_pianoStatSelezione, 30);
        return;
      }
      if (!e.target.closest('#piano-content .piano-table')) {
        document
          .querySelectorAll('#piano-content .col-selected, #piano-content .col-selected-header')
          .forEach((el) => el.classList.remove('col-selected', 'col-selected-header'));
        document.querySelectorAll('#piano-content .row-selected').forEach((el) => el.classList.remove('row-selected'));
        if (document.querySelector('#piano-content .tot-sel')) {
          document.querySelectorAll('#piano-content .tot-sel').forEach((el) => el.classList.remove('tot-sel'));
          setTimeout(_pianoStatSelezione, 30);
        }
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
// TIMBRATURE · inserimento manuale, upload da timbratrice, confronto
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
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Timbrature · confronto con il piano</div><div style="padding:10px 14px" id="piano-timb-body">';
  h +=
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px" onclick="caricaConfrontoTimbrature()">Carica confronto del mese</button>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'timb-file\').click()">Importa file timbratrice</button>' +
    '<input type="file" id="timb-file" accept=".csv,.xlsx,.xls" style="display:none" onchange="importaTimbrature(this)">' +
    '<span style="font-size:.8rem;color:var(--muted)">CSV o Excel con colonne nome / data / entrata / uscita (riconosciute in automatico)</span></div>';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:10px">Collegamento automatico alla timbratrice: nel pacchetto IT c\'è lo script <b>sync_timbratrice.py</b> che legge gli export della timbratrice e carica le timbrature qui da solo (in automatico ogni pochi minuti, lo configura l\'IT).</p>';
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
  ordineCollabPiano(Object.keys(timbOre), _pianoReparto()).forEach((n) => {
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
          escP(p ? p.codice : '-') +
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
    '<p style="font-size:.82rem;color:var(--muted);margin-top:6px">Differenza = timbrate − pianificate del mese (' +
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
    '</button><div id="piano-stat-anno"></div></div></div>' +
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Confronto anni · ' +
    escP(repartoLabel(_pianoReparto())) +
    '<span id="piano-confronto-sel"></span></div>' +
    '<div style="padding:10px 14px" id="piano-confronto-anni"><p style="color:var(--muted);font-size:.8rem">Caricamento confronto...</p></div></div>'
  );
}
// due anni QUALSIASI, scelti liberamente dalle tendine (non solo adiacenti)
function _pianoConfrontoSelHtml() {
  const annoBase = parseInt(_pianoMeseSel.split('-')[0]);
  const a = window._pianoConfrontoAnno || annoBase;
  const b = window._pianoConfrontoAnnoB != null ? window._pianoConfrontoAnnoB : a - 1;
  const opt = (sel) => {
    let s = '';
    for (let y = annoBase + 1; y >= annoBase - 8; y--)
      s += '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>' + y + '</option>';
    return s;
  };
  return (
    '<label style="font-size:.8rem;font-weight:400">confronta <select onchange="window._pianoConfrontoAnnoB=parseInt(this.value);caricaConfrontoAnniPiano()" style="padding:3px 6px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">' +
    opt(b) +
    '</select> con <select onchange="window._pianoConfrontoAnno=parseInt(this.value);caricaConfrontoAnniPiano()" style="padding:3px 6px;font-size:.8rem;border:1px solid #d4b86a;border-radius:2px;background:transparent;color:#d4b86a">' +
    opt(a) +
    '</select></label>'
  );
}
// Aggregati di un anno del settore corrente, per il confronto anno su anno
async function _pianoAggregatiAnno(anno) {
  const righe =
    (await secGet(
      'piano?data=gte.' +
        anno +
        '-01-01&data=lte.' +
        anno +
        '-12-31&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=40000',
    )) || [];
  const tot = {
    ore: 0,
    oreTimb: 0,
    collab: new Set(),
    jolly: new Set(),
    mal: 0,
    weekend: 0,
    domeniche: 0,
    vac: 0,
    cgf: 0,
    mesi: new Set(),
  };
  righe.forEach((r) => {
    const cod = r.codice;
    if (!cod) return;
    tot.mesi.add(String(r.data).substring(0, 7));
    const info = _pianoCollabInfo(r.collaboratore) || {};
    tot.ore += _pianoOreDiRiga(r, parseFloat(info.percentuale) || 1);
    if (cod === 'M' || cod === 'M1') {
      tot.mal++;
      return;
    }
    if (cod === 'V') {
      tot.vac++;
      return;
    }
    if (cod === 'CGF') {
      tot.cgf++;
      return;
    }
    if (!_pianoTurnoInfo(cod)) return;
    tot.collab.add(r.collaboratore);
    if (info.is_jolly || info.impiego === 'jolly') tot.jolly.add(r.collaboratore);
    const gw = new Date(r.data + 'T12:00:00').getDay();
    if (gw === 0) {
      tot.domeniche++;
      tot.weekend++;
    } else if (gw === 6) tot.weekend++;
  });
  const nomiSettore = tot.collab;
  const timb =
    (await secGet('piano_timbrature?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=20000')) || [];
  timb.forEach((t) => {
    if (nomiSettore.has(t.collaboratore)) tot.oreTimb += parseFloat(t.ore) || 0;
  });
  return tot;
}
async function caricaConfrontoAnniPiano() {
  const el = document.getElementById('piano-confronto-anni');
  if (!el) return;
  const selBox = document.getElementById('piano-confronto-sel');
  if (selBox) selBox.innerHTML = _pianoConfrontoSelHtml();
  const anno = window._pianoConfrontoAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const annoB = window._pianoConfrontoAnnoB != null ? window._pianoConfrontoAnnoB : anno - 1;
  el.innerHTML =
    '<p style="color:var(--muted);font-size:.8rem">Caricamento confronto ' + annoB + ' / ' + anno + '...</p>';
  try {
    const [prec, corr] = await Promise.all([_pianoAggregatiAnno(annoB), _pianoAggregatiAnno(anno)]);
    const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('de-CH');
    // verso: +1 se crescere e' positivo (verde), -1 se e' negativo (rosso,
    // es. malattie), 0 se neutro (grigio)
    const voci = [
      ['Ore pianificate', prec.ore, corr.ore, 1, f1],
      ['Ore timbrate', prec.oreTimb, corr.oreTimb, 1, f1],
      ['Collaboratori con turni', prec.collab.size, corr.collab.size, 1, (v) => v],
      ['di cui jolly', prec.jolly.size, corr.jolly.size, 0, (v) => v],
      ['Giorni di malattia', prec.mal, corr.mal, -1, (v) => v],
      ['Weekend lavorati (turni sab+dom)', prec.weekend, corr.weekend, 0, (v) => v],
      ['di cui domeniche', prec.domeniche, corr.domeniche, 0, (v) => v],
      ['Giorni di vacanza (V)', prec.vac, corr.vac, 0, (v) => v],
      ['Recuperi festivi goduti (CGF)', prec.cgf, corr.cgf, 0, (v) => v],
    ];
    let h =
      '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Confronto sui piani presenti in archivio: ' +
      annoB +
      ' (' +
      prec.mesi.size +
      ' mesi) contro ' +
      anno +
      ' (' +
      corr.mesi.size +
      ' mesi). Se un anno ha meno mesi pianificati, il confronto va letto di conseguenza.</p>';
    h +=
      '<div style="overflow-x:auto"><table class="piano-table" style="min-width:560px;font-size:.85rem"><thead><tr><th style="text-align:left">Voce</th><th>' +
      annoB +
      '</th><th>' +
      anno +
      '</th><th>Differenza</th></tr></thead><tbody>';
    voci.forEach(([label, a, b, verso, fmt]) => {
      const d = Math.round((b - a) * 10) / 10;
      const colD = d === 0 || verso === 0 ? 'var(--muted)' : d * verso > 0 ? '#2c6e49' : '#c0392b';
      const pct = a > 0 ? Math.round((d / a) * 100) : null;
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
        label +
        '</td><td>' +
        fmt(a) +
        '</td><td>' +
        fmt(b) +
        '</td><td style="color:' +
        colD +
        ';font-weight:700">' +
        (d > 0 ? '+' : '') +
        fmt(d) +
        (pct != null && d !== 0 ? ' (' + (pct > 0 ? '+' : '') + pct + '%)' : '') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent);font-size:.8rem">Errore confronto: ' + escP(e.message || '') + '</p>';
  }
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
      '<button class="btn-export" style="font-size:.82rem;padding:4px 10px;' +
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
  // malattie di tutto l'anno: un CGF che cade in malattia non e' goduto
  const malattieAnno = {};
  for (let m = 1; m <= 12; m++)
    Object.assign(malattieAnno, _pianoMalattieMese(anno + '-' + String(m).padStart(2, '0')));
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
      cgfPersi: 0,
      sup50: 0,
      oreNotte: 0,
      oreLav: 0,
    });
    const dow = new Date(r.data + 'T12:00:00').getDay();
    const info = _pianoCollabInfo(r.collaboratore) || {};
    const _mese = String(r.data).substring(0, 7);
    const _addMese = (q) => {
      if (!o.perMese) o.perMese = {};
      o.perMese[_mese] = (o.perMese[_mese] || 0) + q;
    };
    if (t) {
      o.ore += parseFloat(t.durata_ore) || 0;
      _addMese(parseFloat(t.durata_ore) || 0);
      o.gg++;
      if (t.tipo === 'NOTTURNO') o.n++;
      else o.d++;
      if (_pianoGiorniWeekend().includes(dow)) o.we++;
      if (dow === 0) o.dom++;
      // CGF MATURATO: ha lavorato in un festivo con flag CGF (automatico)
      const fest = pianoFestiviCache.find((f) => f.data === r.data);
      // DUE MONDI SEPARATI:
      // FISSI (RAP 4.3): recupero CGF sui festivi con il flag attivo, esclusi
      // quelli che cadono di domenica.
      if (fest && fest.cgf !== false && _festivoCgfDefault(fest.data) && _pianoMaturaCgf(info)) o.cgfMat++;
      // AUSILIARI/JOLLY (RAP Allegato 1): supplemento del 50% sul salario orario
      // per i NOVE festivi parificati alle domeniche. Lista fissa che non cambia
      // di anno in anno, e vale SEMPRE, anche quando il festivo cade di domenica.
      if (fest && !_pianoMaturaCgf(info) && _pianoFestivoParificato(fest)) o.sup50++;
      // ore di lavoro notturno degli ausiliari: il 10% matura come tempo
      // libero pagato (RAP Allegato 1)
      if (!_pianoMaturaCgf(info)) o.oreNotte += _pianoOreNotturneTurno(t);
      // ore realmente lavorate: base per le indennita' degli ausiliari
      o.oreLav += _pianoOreEffettiveTurno(t, r);
    } else if (cs) {
      if (r.codice === 'V' || r.codice === 'V1') o.v++;
      if (r.codice === 'M' || r.codice === 'M1') o.m++;
      // CGF goduto, ma se quel giorno c'e' malattia il recupero non e' stato
      // goduto e il credito resta (come per le vacanze)
      if (r.codice === 'CGF') {
        if (malattieAnno[r.collaboratore + '|' + r.data]) o.cgfPersi++;
        else o.cgfGod++;
      }
      const _oCs = _pianoOreCodiceSpeciale(cs, info, r.codice);
      o.ore += _oCs;
      _addMese(_oCs);
    }
  });
  // ORE REALI SCRITTE A MANO: dove esistono, sostituiscono le ore del piano di
  // quel mese, cosi' le statistiche dell'anno dicono lo stesso numero del saldo
  // e del calendario. Un dato solo, in tutto il programma.
  // scostamenti giornalieri dell'anno: entrano nelle ore, mese per mese
  const recStat =
    (await secGet('piano_recupero_ore?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&limit=20000')) || [];
  recStat.forEach((x) => {
    const o = st[x.collaboratore];
    if (!o) return;
    const meseK = String(x.data).substring(0, 7);
    const v = parseFloat(x.ore) || 0;
    o.ore = Math.round((o.ore + v) * 100) / 100;
    if (!o.perMese) o.perMese = {};
    o.perMese[meseK] = (o.perMese[meseK] || 0) + v;
  });
  const rettAnno =
    (await secGet('piano_ore_mese?anno_mese=gte.' + anno + '-01&anno_mese=lte.' + anno + '-12&limit=5000')) || [];
  rettAnno.forEach((x) => {
    const o = st[x.collaboratore];
    if (!o || !o.perMese) return;
    const pian = o.perMese[x.anno_mese] || 0;
    o.ore = Math.round((o.ore - pian + (parseFloat(x.ore_reali) || 0)) * 100) / 100;
    o.rettifiche = (o.rettifiche || 0) + 1;
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
    '<div style="display:flex;padding:6px 0"><input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-statanno-table\')"></div>';
  h +=
    '<div style="overflow-x:auto"><table id="piano-statanno-table" class="piano-table" style="min-width:760px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Ore anno</th><th title="Sui mesi con un piano">Ore dovute</th><th>Giorni lavorati</th><th>Diurni</th><th>Notturni</th><th>Weekend</th><th>Domeniche</th><th>Vacanze</th><th>Malattie</th><th title="Festivi lavorati che danno diritto al recupero (solo personale fisso)">CGF maturati</th><th title="Giorni CGF effettivamente goduti (quelli caduti in malattia non contano)">CGF goduti</th><th title="Maturati − goduti: quanti recuperi restano da dare">Saldo CGF</th><th title="Festivi parificati alle domeniche lavorati dagli ausiliari (jolly): danno diritto al supplemento del 50% sul salario orario lordo (RAP Allegato 1). Sono nove giorni fissi e valgono anche di domenica">Suppl. 50%</th><th title="Ore lavorate nella fascia notturna (23:00-06:00). Il supplemento del 10% e gia compreso nella durata dei turni: questa colonna serve da controllo, non e un credito da dare a parte">Ore notte</th><th title="Solo ausiliari (jolly): ore effettivamente lavorate nell anno e indennita calcolate su quel totale secondo il RAP Allegato 1 (vacanze 8.33% con 4 settimane o 10.65% con 5, tredicesima 8.33%). I jolly non hanno una percentuale contrattuale: tutto si calcola sulle ore fatte">Ore lavorate · indennita</th></tr></thead><tbody>';
  ordineCollabPiano(Object.keys(st), _pianoReparto()).forEach((n) => {
    const o = st[n];
    const info = _pianoCollabInfo(n) || {};
    h +=
      '<tr data-nome="' +
      escP(n) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(n) +
      '</td><td' +
      (o.rettifiche
        ? ' title="Comprende ' +
          o.rettifiche +
          (o.rettifiche === 1 ? ' mese con ore reali scritte a mano"' : ' mesi con ore reali scritte a mano"')
        : '') +
      '>' +
      o.ore.toFixed(1) +
      (o.rettifiche ? '<span class="piano-rett">*</span>' : '') +
      '</td><td style="color:var(--muted)">' +
      (dovuteDi(n) ? dovuteDi(n).toFixed(1) : '-') +
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
      '</td><td' +
      (o.cgfPersi ? ' title="' + o.cgfPersi + ' recuperi caduti in malattia: restano a credito"' : '') +
      '>' +
      (o.cgfGod || '') +
      (o.cgfPersi ? ' <span style="color:#c0392b;font-size:.82rem">+' + o.cgfPersi + ' in malattia</span>' : '') +
      '</td><td style="font-weight:700;color:' +
      (o.cgfMat - o.cgfGod > 0 ? '#2c6e49' : o.cgfMat - o.cgfGod < 0 ? '#c0392b' : 'var(--muted)') +
      '">' +
      (o.cgfMat || o.cgfGod ? o.cgfMat - o.cgfGod : '') +
      '</td><td style="font-weight:700;color:' +
      (o.sup50 ? '#8b6914' : 'var(--muted)') +
      '" title="Festivi parificati lavorati come personale ausiliario">' +
      (o.sup50 || '') +
      '</td><td style="font-weight:700;color:' +
      (o.oreNotte ? '#1a4a7a' : 'var(--muted)') +
      '" title="' +
      (o.oreNotte
        ? Math.round(o.oreNotte * 10) / 10 +
          'h nella fascia notturna: il supplemento del 10% (' +
          _pianoNotteRecupero(o.oreNotte) +
          "h) e' gia' compreso nelle ore dei turni"
        : '') +
      '">' +
      (o.oreNotte ? Math.round(o.oreNotte * 10) / 10 + 'h' : '') +
      '</td><td style="font-weight:700;color:' +
      (!_pianoMaturaCgf(info) && o.oreLav ? '#8b6914' : 'var(--muted)') +
      '" title="' +
      (!_pianoMaturaCgf(info) && o.oreLav ? _pianoIndennitaJolly(o.oreLav) : '') +
      '">' +
      (!_pianoMaturaCgf(info) && o.oreLav ? Math.round(o.oreLav * 10) / 10 + 'h' : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-top:6px">Weekend: giallo da 12, rosso oltre 20 (equità). Click su un mese per aprirlo.</p>';
  el.innerHTML = h;
}

// ================================================================
// IMPORT VACANZE DA EXCEL (col A cognome, col B nome, col F-BE = settimane 1-52 con X)
// ================================================================
// ================================================================
// TAB VACANZE · identica alla pagina Vacanze di Turnivo: settimane ISO
// per collaboratore per anno, conferma, elimina, import Excel,
// applicazione V+C+WD al piano (port di step_vacanze.py)
// ================================================================
let _pianoVacCache = [];
function _vacDateSettimana(anno, settimana) {
  const gg = _pianoGiorniSettimana(anno, settimana);
  const f = (x) => x.split('-')[2] + '/' + x.split('-')[1];
  return 'dal ' + f(gg[0]) + ' al ' + f(gg[6]);
}
// GIORNI DI VACANZA SPETTANTI (personale fisso): quanti ne matura ciascuno
// nell'anno secondo anzianita', e quanti ne ha gia' pianificati nel piano.
function _pianoVacDirittoCard(anno) {
  const cfg = {
    base1: parseFloat(_pianoRegolaVal('vacanze_giorni_primi2anni')) || 28,
    base2: parseFloat(_pianoRegolaVal('vacanze_giorni_base')) || 35,
    bonus: [
      { anni: 10, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_10anni')) || 1 },
      { anni: 15, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_15anni')) || 2 },
      { anni: 20, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_20anni')) || 3 },
      { anni: 25, giorni: parseFloat(_pianoRegolaVal('vacanze_bonus_25anni')) || 4 },
    ],
  };
  // giorni V gia' presenti nel piano dell'anno (dal mese caricato in memoria
  // non basta: si contano quelli del settore gia' noti)
  const gia = {};
  (_pianoRighe || []).forEach((r) => {
    if (r.codice === 'V' && String(r.data).startsWith(String(anno)))
      gia[r.collaboratore] = (gia[r.collaboratore] || 0) + 1;
  });
  const righe = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c) && c.data_assunzione)
    .map((c) => ({
      c: c,
      r: PianoRegole.giorniVacanzaSpettanti(String(c.data_assunzione).substring(0, 10), anno, {
        ...cfg,
        mesiCongedo: c.mesi_congedo_non_pagato,
      }),
    }))
    .filter((x) => x.r)
    .sort((a, b2) => a.c.nome.localeCompare(b2.c.nome));
  const senzaData = collaboratoriCache.filter(
    (c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && _pianoMaturaCgf(c) && !c.data_assunzione,
  ).length;
  let h =
    '<div class="main-card" style="margin-bottom:14px"><div class="card-header">Giorni di vacanza spettanti ' +
    anno +
    ' · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Primi due anni ' +
    cfg.base1 +
    ' giorni, poi ' +
    cfg.base2 +
    '; nell anno del passaggio si matura mese per mese. Giorni in piu per anzianita, NON cumulativi (vale lo scaglione piu alto raggiunto) e pieni dall anno dell anniversario: 10 anni +' +
    cfg.bonus[0].giorni +
    ', 15 anni +' +
    cfg.bonus[1].giorni +
    ', 20 anni +' +
    cfg.bonus[2].giorni +
    ', 25 anni +' +
    cfg.bonus[3].giorni +
    '. Gli ausiliari non compaiono: hanno l indennita in percentuale sulle ore.</p>';
  if (!righe.length) {
    h +=
      '<p style="font-size:.85rem">Nessun calcolo possibile: manca la data di inizio contratto nelle schede.</p></div></div>';
    return h;
  }
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:640px;font-size:.9rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>In servizio dal</th><th>Anni</th><th>Spettanti</th><th>Pianificati</th><th>Restano</th></tr></thead><tbody>';
  righe.forEach((x) => {
    const dal = String(x.c.data_assunzione).substring(0, 10);
    const anni = Math.floor((new Date(anno, 11, 31) - new Date(dal + 'T12:00:00')) / (365.25 * 86400000));
    const pian = gia[x.c.nome] || 0;
    const resta = Math.round((x.r.giorni - pian) * 10) / 10;
    h +=
      '<tr title="' +
      x.r.base +
      ' giorni di base' +
      (x.r.bonus
        ? ' + ' + x.r.bonus + ' per anzianita (' + x.r.voci.map((v) => v.anni + ' anni dal ' + v.dal).join(', ') + ')'
        : '') +
      '" data-nome="' +
      escP(x.c.nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(x.c.nome) +
      '</td><td>' +
      dal.split('-').reverse().join('.') +
      '</td><td>' +
      anni +
      '</td><td style="font-weight:700">' +
      x.r.giorni +
      '</td><td>' +
      (pian || '') +
      '</td><td style="font-weight:700;color:' +
      (resta > 0 ? '#8b6914' : resta < 0 ? '#c0392b' : '#2c6e49') +
      '">' +
      (pian ? resta : '') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  if (senzaData)
    h +=
      '<p style="font-size:.82rem;color:#c0392b;margin-top:8px">' +
      senzaData +
      ' collaboratori non compaiono perche manca la data di inizio contratto nella loro scheda.</p>';
  // AVVISO DI OTTOBRE: quando si pianificano le vacanze dell'anno dopo serve
  // sapere in anticipo chi cambia scaglione, per non assegnare giorni sbagliati
  const mese = new Date().getMonth() + 1;
  const annoOggi = new Date().getFullYear();
  if (mese >= 10 && anno === annoOggi) {
    const cambi = righe
      .map((x) => {
        const pros = PianoRegole.giorniVacanzaSpettanti(String(x.c.data_assunzione).substring(0, 10), anno + 1, {
          ...cfg,
          mesiCongedo: x.c.mesi_congedo_non_pagato,
        });
        // si segnala solo chi SUPERA la base dei primi due anni: chi arriva a 28
        // sta semplicemente completando l'anno intero, non e' una novita' da
        // tenere presente per la pianificazione
        return pros && pros.giorni > x.r.giorni && pros.giorni > cfg.base1
          ? { nome: x.c.nome, da: x.r.giorni, a: pros.giorni, diff: Math.round((pros.giorni - x.r.giorni) * 10) / 10 }
          : null;
      })
      .filter(Boolean)
      .sort((p, q) => q.diff - p.diff);
    if (cambi.length)
      h +=
        '<div style="margin-top:12px;padding:10px 12px;background:#fff8e1;border-left:4px solid #b8860b;border-radius:3px">' +
        '<b style="font-size:.92rem">Da tenere presente per il ' +
        (anno + 1) +
        '</b><p style="font-size:.86rem;margin:4px 0 0">Nel pianificare le vacanze del prossimo anno, ' +
        cambi.length +
        (cambi.length === 1 ? ' collaboratore avra' : ' collaboratori avranno') +
        ' piu giorni:</p><ul style="margin:6px 0 0 18px;font-size:.88rem">' +
        cambi
          .map(
            (x) =>
              '<li><b>' + escP(x.nome) + '</b>: da ' + x.da + ' a <b>' + x.a + '</b> giorni (+' + x.diff + ')</li>',
          )
          .join('') +
        '</ul></div>';
  }
  h += '</div></div>';
  return h;
}
async function _renderPianoVacanzeTab() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  window._pianoVacAnno = anno;
  _pianoVacCache =
    (await secGet('piano_vacanze?anno=eq.' + anno + '&order=collaboratore.asc,settimana.asc&limit=2000')) || [];
  const puoMod = puoGestirePiano();
  const nomiRep = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome);
  // ogni settore vede SOLO le vacanze dei propri collaboratori
  _pianoVacCache = _pianoVacCache.filter((v) => nomiRep.includes(v.collaboratore));
  const filtro = window._pianoVacFiltro || '';
  const vac = filtro ? _pianoVacCache.filter((v) => v.collaboratore === filtro) : _pianoVacCache;
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
    _pianoVacDirittoCard(anno) +
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
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#d4b86a;color:#d4b86a" onclick="document.getElementById(\'vac-file\').click()">Importa (Excel o PDF)</button>' +
      '<input type="file" id="vac-file" accept=".xlsx,.xls,.pdf" style="display:none" onchange="importaVacanzePiano(this)">' +
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" title="Scarica il piano vacanze del settore nello stesso formato del file HR" onclick="esportaVacanzeExcel()">Scarica Excel</button>' +
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#1a4a7a;color:#7ea8d8" onclick="esportaVacanzePdf()">Scarica PDF</button>';
    h +=
      '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:#1a4a7a;color:#7ea8d8" onclick="applicaVacanzePiano()">Applica al piano · ' +
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
    '<p style="font-size:.8rem;color:var(--muted);padding:8px 14px 0">Le vacanze sono settimane intere (lun-dom). "Applica al piano" scrive le V (protette) del mese scelto nel Calendario e i congedi C prima/dopo secondo le regole (1 C prima per i fissi, 2 per i jolly; C dopo scalati per percentuale). Import Excel: colonna A cognome, B nome, colonne F-BE settimane 1-52 con X.</p>';
  if (!gruppi.length) h += '<p style="padding:14px;color:var(--muted)">Nessuna vacanza per il ' + anno + '.</p>';
  gruppi.forEach((nome) => {
    const lista = perCollab[nome];
    h +=
      '<div style="margin:10px 14px;border:1px solid var(--line);border-radius:3px;overflow:hidden"><div data-collab="' +
      escP(nome) +
      '" title="Apri la scheda di ' +
      escP(nome) +
      '" style="background:#ffc107;color:#212529;padding:6px 10px;font-weight:700;font-size:.82rem">' +
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
// TAB SALDO · come la pagina Saldo Ore di Turnivo: dovute/pianificate/saldo
// del mese per collaboratore + totali (YTD dalla stessa mappa della griglia)
async function _renderPianoSaldoTab() {
  const ym = _pianoMeseSel;
  await _pianoCaricaRecupero(ym);
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
  await _pianoCaricaOreMese(_pianoMeseSel);
  // come Turnivo: ore LAVORATE = timbrate del mese se presenti, altrimenti piano
  const da = ym + '-01';
  const aFine = ym + '-' + String(nGiorni).padStart(2, '0');
  const timbrateMese = (await secGet('piano_timbrature?data=gte.' + da + '&data=lte.' + aFine + '&limit=5000')) || [];
  const timbNome = {};
  timbrateMese.forEach(
    (t) => (timbNome[t.collaboratore] = (timbNome[t.collaboratore] || 0) + (parseFloat(t.ore) || 0)),
  );
  let h =
    '<div class="main-card"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Saldo ore · ' +
    escP(label) +
    '<button class="btn-act pin" onclick="pianoCambiaMese(-1)">&larr;</button><button class="btn-act pin" onclick="pianoCambiaMese(1)">&rarr;</button>' +
    '<input type="text" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="pianoTabellaFiltra(this.value,\'piano-saldo-table\')"></div>';
  h +=
    '<div style="overflow-x:auto;padding:0 6px 8px"><table id="piano-saldo-table" class="piano-table" style="min-width:760px;font-size:.8rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Fun</th><th>%</th><th>Ore dovute</th><th title="Timbrate se presenti, altrimenti piano">Ore lavorate</th><th>Saldo mese</th><th>Saldo anno (YTD)</th></tr></thead><tbody>';
  let totD = 0;
  let totP = 0;
  let totS = 0;
  nomi.forEach((nome) => {
    const info = _pianoCollabInfo(nome) || {};
    const pct = parseFloat(info.percentuale) || 1;
    const righeMese = perNome[nome] || [];
    // mese fatto SOLO di congedo C senza commenti, turni, malattie, vacanze o
    // CGF, e senza timbrature: il collaboratore non e' in servizio quel mese
    // (es. uscito ma non ancora disattivato), non si conteggia nel saldo
    if (
      righeMese.length &&
      righeMese.every((r) => r.codice === 'C' && !(r.commento || '').trim()) &&
      timbNome[nome] == null
    )
      return;
    let op = 0;
    righeMese.forEach((r) => {
      op += _pianoOreDiRiga(r, pct);
    });
    op += _pianoRecuperoTotale(nome, ym); // scostamenti giornalieri
    if (timbNome[nome] != null) op = timbNome[nome]; // timbrate del mese: hanno la precedenza
    // ore reali scritte a mano: precedenza su tutto, come nel calendario
    const rettSaldo = _pianoRettificaMese(nome);
    if (rettSaldo) op = Math.round(parseFloat(rettSaldo.ore_reali) * 100) / 100;
    // stesso arrotondamento del calendario (una cifra decimale sulle ore
    // dovute), altrimenti la stessa persona mostra due saldi diversi nelle due
    // schede per un centesimo di differenza
    const od = info.is_jolly ? 0 : Math.round((nGiorni / 7) * _pianoOreSett * pct * 10) / 10;
    const sm = Math.round((Math.round(op * 100) / 100 - od) * 10) / 10;
    const ytd = Math.round(((_pianoYtdMap[nome] || 0) + sm) * 10) / 10;
    totD += od;
    totP += op;
    totS += sm;
    const col = (v) => (v > 0 ? '#2c6e49' : v < 0 ? '#c0392b' : 'var(--muted)');
    h +=
      '<tr data-nome="' +
      escP(nome) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(nome) +
      '</td><td>' +
      escP(info.is_jolly ? 'JOLLY' : info.funzione || '') +
      '</td><td>' +
      Math.round(pct * 100) +
      '%</td><td>' +
      (od ? od.toFixed(1) : '-') +
      '</td><td>' +
      (op ? op.toFixed(1) : '') +
      (rettSaldo
        ? '<span class="piano-rett" title="Ore reali scritte da ' +
          escP(rettSaldo.operatore || '') +
          (rettSaldo.nota ? ' · ' + escP(rettSaldo.nota) : '') +
          '">*</span>'
        : '') +
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

// TAB STORICO · come la pagina Storico di Turnivo: log delle modifiche al
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
  // ogni settore vede il SUO storico; i log vecchi (senza settore) restano visibili
  const logsTutti =
    (await secGet(
      'log_attivita?or=(azione.ilike.Piano*,azione.ilike.Vacanz*,azione.ilike.*piano*)&order=created_at.desc&limit=400',
    )) || [];
  const repCorr = _pianoReparto();
  const logs = logsTutti.filter((l) => !l.reparto_dip || l.reparto_dip === repCorr);
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

// Formulario RICHIESTA CAMBIO VACANZA · replica di cambio_vacanza_pdf.html
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
          ['Periodo vacanza:', c.dal + '  ·  ' + c.al],
        ]
      : [
          ['Nome:', linea],
          ['Settore:', linea],
          ['Numero settimana:', '__________________'],
          ['Periodo vacanza:', '____/____/________  ·  ____/____/________'],
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
  doc.text('Casino Lugano SA · formulario cambio vacanza', 105, 287, { align: 'center' });
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
        ' · settimana ' +
        v.settimana +
        ' (' +
        _vacDateSettimana(v.anno, v.settimana) +
        ')</option>',
    )
    .join('');
  const b = document.getElementById('pwd-modal-content');
  b.innerHTML =
    '<h3>Scambia settimane di vacanza · ' +
    window._pianoVacAnno +
    '</h3><div class="field" style="text-align:left"><label>Collaboratore A (richiedente)</label><select id="ss-a" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div><div class="field" style="text-align:left;margin-top:8px"><label>Collaboratore B (accetta lo scambio)</label><select id="ss-b" style="width:100%;padding:8px">' +
    opzioni +
    '</select></div>' +
    '<p style="font-size:.82rem;color:var(--muted);margin-top:8px">Le due settimane vengono scambiate; nei mesi già pianificati le V e i congedi vengono sistemati di conseguenza. Alla fine si genera il modulo PDF precompilato per le firme.</p>' +
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
    '<h3>Nuova vacanza · ' +
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
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  // V ORFANE: se una vacanza e' stata spostata o tolta dalla scheda Vacanze,
  // le V rimaste nel piano senza settimana corrispondente vengono rimosse
  let nOrfane = 0;
  {
    const righeV =
      (await secGet(
        'piano?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + _pianoReparto() + '&codice=eq.V&limit=2000',
      )) || [];
    const orfane = righeV.filter((r) => {
      if (!nomiRep.includes(r.collaboratore)) return false;
      const g = parseInt(r.data.split('-')[2]);
      return !(vacGiorni[r.collaboratore] && vacGiorni[r.collaboratore].has(g));
    });
    for (let i = 0; i < orfane.length; i += 10) {
      await Promise.all(orfane.slice(i, i + 10).map((r) => secDel('piano', 'id=eq.' + r.id)));
    }
    nOrfane = orfane.length;
    if (nOrfane) logAzione('Vacanze: V rimosse', ym + ' · ' + nOrfane + " giorni non piu' in vacanza");
  }
  // via le V/C/WD dei giri precedenti: i WD (non protetti) e i C scritti da
  // "Applica" (protetti ma generati); gli inserimenti a mano restano
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
  await secDel(
    'piano',
    'data=gte.' +
      da +
      '&data=lte.' +
      a +
      '&reparto_dip=eq.' +
      _pianoReparto() +
      '&protetto=eq.true&generato=eq.true&codice=eq.C',
  );
  if (!Object.keys(vacGiorni).length) {
    if (interattivo)
      toast(
        nOrfane
          ? nOrfane + ' V rimosse (vacanze spostate); nessuna vacanza cade in ' + ym
          : 'Nessuna vacanza cade in ' + ym + ' per questo settore',
      );
    return { v: 0, c: 0, wd: 0, orfane: nOrfane };
  }
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
      const n = await _pianoInserisciCella({
        collaboratore: nome,
        data: dstrDi(g),
        codice: codice,
        protetto: protetto,
        generato: generato,
        reparto_dip: _pianoReparto(),
        operatore: op,
      });
      if (n) perCella[nome + '|' + g] = n;
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
        await _pianoInserisciCella({
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
  logAzione('Piano: vacanze applicate', ym + ' · ' + nV + ' V, ' + nC + ' C, ' + nWdP + ' WD');
  return { v: nV, c: nC, wd: nWdP, orfane: nOrfane };
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
  _pianoUndoSnap('applica vacanze ' + _pianoMeseSel);
  const r = await _applicaVacanzeMese(true);
  if (r)
    toast(
      'Piazzate ' +
        r.v +
        ' V, ' +
        r.c +
        ' C, ' +
        r.wd +
        ' WD' +
        (r.orfane ? ' · rimosse ' + r.orfane + ' V di vacanze spostate' : ''),
    );
  _pianoTab = 'calendario';
  localStorage.setItem('piano_tab', 'calendario');
  renderPiano();
}

// Abbinamento del nome scritto nel file HR con l'anagrafica: tollera refusi
// (Blader/Bledar), nomi invertiti, abbreviazioni (AZEVEDO M. / MARCO P.) e
// cerca prima nel settore, poi in tutta l'anagrafica, perche' chi copre altri
// reparti compare anche nei loro fogli vacanze.
function _vacNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _vacLev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function _vacSimile(a, b) {
  if (a === b) return 3;
  if (a.length > 3 && b.length > 3) {
    const d = _vacLev(a, b);
    if (d === 1) return 2.5;
    if (d === 2 && Math.min(a.length, b.length) > 5) return 2;
  }
  if (a.startsWith(b) || b.startsWith(a)) return 2;
  return 0;
}
function _vacAbbina(cognome, nome, rep) {
  const tok = (_vacNorm(cognome) + ' ' + _vacNorm(nome)).split(' ').filter((x) => x.length > 1);
  if (!tok.length) return null;
  const punteggio = (c) => {
    const ct = _vacNorm(c.nome).split(' ');
    const usati = new Set();
    let s = 0;
    tok.forEach((w) => {
      let best = 0;
      let bi = -1;
      ct.forEach((y, i) => {
        if (usati.has(i)) return;
        const v = _vacSimile(w, y);
        if (v > best) {
          best = v;
          bi = i;
        }
      });
      if (best > 0) {
        s += best;
        usati.add(bi);
      }
    });
    return s;
  };
  const cerca = (lista) => {
    let best = null;
    let bs = 0;
    lista.forEach((c) => {
      const s = punteggio(c);
      if (s > bs) {
        bs = s;
        best = c;
      }
    });
    return bs >= 4 ? { c: best, score: bs } : null;
  };
  const attivi = collaboratoriCache.filter((c) => c.attivo !== false);
  const delRep = attivi.filter((c) => (c.reparto_dip || 'slots') === (rep || _pianoReparto()));
  return cerca(delRep) || cerca(attivi) || cerca(collaboratoriCache);
}
// ===== IMPORT VACANZE (Excel o PDF nel formato HR) =====
// Formato ufficiale: riga di intestazione con COGNOME | NOME | anno |
// Pianificate | 52 | 1..52, poi una riga per persona con la X sulle settimane.
// Vale sia per il file Excel sia per il PDF stampato dallo stesso foglio.
function _vacRigheDaExcel(wb) {
  // il foglio giusto e' quello che contiene l'intestazione COGNOME/NOME
  let rows = null;
  for (const sn of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    if (r.some((x) => /cognome/i.test(String(x[0] || '')) && /nome/i.test(String(x[1] || '')))) {
      rows = r;
      break;
    }
  }
  if (!rows) rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const out = [];
  rows.forEach((r) => {
    const cognome = String(r[0] || '').trim();
    const nome = String(r[1] || '').trim();
    if (!cognome || /cognome/i.test(cognome)) return;
    const sett = [];
    for (let w = 1; w <= 52; w++) {
      if (
        String(r[4 + w] || '')
          .trim()
          .toUpperCase() === 'X'
      )
        sett.push(w);
    }
    if (sett.length) out.push({ cognome: cognome, nome: nome, settimane: sett });
  });
  return out;
}
async function _vacRigheDaPdf(file) {
  // pdf.js: si prendono le posizioni orizzontali dei numeri di settimana
  // nell'intestazione e si assegna ogni X alla colonna piu' vicina
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!lib) throw new Error('lettore PDF non disponibile');
  lib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  const out = [];
  for (let np = 1; np <= pdf.numPages; np++) {
    const page = await pdf.getPage(np);
    const txt = await page.getTextContent();
    const items = txt.items
      .map((i) => ({ s: String(i.str || '').trim(), x: i.transform[4], y: Math.round(i.transform[5]) }))
      .filter((i) => i.s);
    // righe: raggruppo per y (tolleranza 3 punti)
    const righe = [];
    items.forEach((i) => {
      let r = righe.find((x) => Math.abs(x.y - i.y) <= 3);
      if (!r) {
        r = { y: i.y, items: [] };
        righe.push(r);
      }
      r.items.push(i);
    });
    righe.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    righe.sort((a, b) => b.y - a.y);
    // intestazione: la riga che contiene i numeri 1..52 in sequenza
    let head = null;
    for (const r of righe) {
      const nums = r.items.filter((i) => /^\d{1,2}$/.test(i.s)).map((i) => ({ n: parseInt(i.s), x: i.x }));
      if (nums.length >= 40 && nums.some((v) => v.n === 1) && nums.some((v) => v.n === 52)) {
        head = nums;
        break;
      }
    }
    if (!head) continue;
    const colonne = {};
    head.forEach((v) => {
      if (v.n >= 1 && v.n <= 52 && colonne[v.n] == null) colonne[v.n] = v.x;
    });
    const headY = righe.find((r) => r.items.some((i) => head.some((h) => h.x === i.x)))?.y;
    righe.forEach((r) => {
      if (headY != null && r.y >= headY) return; // sopra l'intestazione: titoli
      const testo = r.items.filter((i) => /[A-Za-zÀ-ÿ.]{2,}/.test(i.s) && !/^x$/i.test(i.s));
      if (!testo.length) return;
      const cognome = testo[0].s;
      const nome = testo[1] && testo[1].x < (colonne[1] || 9999) ? testo[1].s : '';
      const sett = [];
      r.items
        .filter((i) => /^x$/i.test(i.s))
        .forEach((i) => {
          let best = null;
          let bd = 1e9;
          Object.keys(colonne).forEach((w) => {
            const d = Math.abs(colonne[w] - i.x);
            if (d < bd) {
              bd = d;
              best = parseInt(w);
            }
          });
          if (best && bd < 12) sett.push(best);
        });
      if (sett.length) out.push({ cognome: cognome, nome: nome, settimane: [...new Set(sett)].sort((a, b) => a - b) });
    });
  }
  return out;
}
async function importaVacanzePiano(input) {
  if (!puoGestirePiano()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  try {
    const isPdf = /\.pdf$/i.test(file.name);
    let righe;
    if (isPdf) {
      righe = await _vacRigheDaPdf(file);
    } else {
      if (!window.XLSX) return;
      righe = _vacRigheDaExcel(XLSX.read(await file.arrayBuffer()));
    }
    if (!righe.length) {
      toast('Nessuna settimana trovata nel file');
      return;
    }
    // abbinamento con l'anagrafica
    const trovati = [];
    const persi = [];
    const deboli = [];
    righe.forEach((r) => {
      const m = _vacAbbina(r.cognome, r.nome);
      if (!m) {
        persi.push((r.cognome + ' ' + r.nome).trim() + ' (' + r.settimane.length + ' settimane)');
        return;
      }
      if (m.score < 6) deboli.push((r.cognome + ' ' + r.nome).trim() + ' letto come ' + m.c.nome);
      const g = trovati.find((t) => t.nome === m.c.nome);
      if (g) g.settimane = [...new Set(g.settimane.concat(r.settimane))].sort((a, b) => a - b);
      else trovati.push({ nome: m.c.nome, settimane: r.settimane.slice() });
    });
    if (!trovati.length) {
      toast('Nessun collaboratore riconosciuto nel file');
      return;
    }
    const nSett = trovati.reduce((s, t) => s + t.settimane.length, 0);
    const gia = _pianoVacCache.filter((v) => trovati.some((t) => t.nome === v.collaboratore)).length;
    let msg =
      'File ' +
      (isPdf ? 'PDF' : 'Excel') +
      ' letto per l’anno ' +
      anno +
      ':\n\n• ' +
      trovati.length +
      ' collaboratori riconosciuti\n• ' +
      nSett +
      ' settimane nel file';
    if (gia) msg += '\n• ' + gia + ' settimane gia’ in archivio per queste persone';
    if (deboli.length)
      msg += '\n\nLetti con piccole differenze di scrittura:\n' + deboli.map((x) => '  ' + x).join('\n');
    if (persi.length) msg += '\n\nNON riconosciuti (restano fuori):\n' + persi.map((x) => '  ' + x).join('\n');
    msg += gia
      ? '\n\nOK = SOSTITUISCO le settimane di queste persone con quelle del file.\nAnnulla = non faccio nulla.'
      : '\n\nProcedo con l’inserimento?';
    if (!confirm(msg)) return;
    // sostituzione: si toccano solo le persone presenti nel file
    for (const t of trovati) {
      const vecchie = _pianoVacCache.filter((v) => v.collaboratore === t.nome && v.anno === anno);
      for (const v of vecchie) await secDel('piano_vacanze', 'id=eq.' + v.id);
    }
    let ins = 0;
    for (const t of trovati) {
      for (const w of t.settimane) {
        await secPost('piano_vacanze', {
          collaboratore: t.nome,
          settimana: w,
          anno: anno,
          confermata: true,
          operatore: getOperatore(),
        });
        ins++;
      }
    }
    logAzione('Vacanze importate', anno + ' · ' + ins + ' settimane · ' + trovati.length + ' collaboratori');
    toast('Vacanze importate: ' + ins + ' settimane');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore lettura file vacanze: ' + (e.message || ''));
  }
}
// ===== ESPORTAZIONE nello stesso formato del file HR =====
// La scheda esportata replica il file ufficiale: istruzioni in alto, titolo,
// intestazione con le settimane 1-52, X sulle settimane, fasce colorate dei
// periodi (Natale rosso, Carnevale/Pasqua/autunno arancio, estate verde) e
// legenda a destra con le date di ogni settimana.
var VAC_COLORI_FASCE = { rosso: 'FF0000', arancio: 'FFC000', verde: 'C5E0B4', giallo: 'FFFF00', azzurro: '9DC3E6' };
// fasce del file HR 2026 (estratte dal file ufficiale); per gli altri anni si
// calcolano dalle feste: Natale/Capodanno rosso, Carnevale e la settimana del
// Lunedi' di Pasqua arancio, estate (giugno-agosto) verde, autunno arancio
function _vacFasce(anno) {
  if (anno === 2026) {
    var m = {
      0: 'rosso',
      1: 'rosso',
      8: 'arancio',
      15: 'arancio',
      45: 'arancio',
      49: 'azzurro',
      51: 'rosso',
      52: 'rosso',
    };
    for (var w = 22; w <= 37; w++) m[w] = 'verde';
    for (var w2 = 46; w2 <= 48; w2++) m[w2] = 'giallo';
    return m;
  }
  var out = { 0: 'rosso', 1: 'rosso', 51: 'rosso', 52: 'rosso' };
  var settDi = function (dstr) {
    for (var w3 = 1; w3 <= 52; w3++) if (_pianoGiorniSettimana(anno, w3).includes(dstr)) return w3;
    return null;
  };
  try {
    var pasqua = _pianoPasqua ? _pianoPasqua(anno) : null;
    if (pasqua) {
      var lun = new Date(pasqua.getTime() + 86400000);
      var lstr =
        lun.getFullYear() +
        '-' +
        String(lun.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(lun.getDate()).padStart(2, '0');
      var wP = settDi(lstr);
      if (wP) out[wP] = 'arancio';
      var mart = new Date(pasqua.getTime() - 47 * 86400000); // martedi' grasso
      var mstr =
        mart.getFullYear() +
        '-' +
        String(mart.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(mart.getDate()).padStart(2, '0');
      var wC = settDi(mstr);
      if (wC) out[wC] = 'arancio';
    }
  } catch (e) {}
  var wN = settDi(anno + '-11-02');
  if (wN) out[wN] = 'arancio'; // vacanze autunnali
  for (var w4 = 1; w4 <= 52; w4++) {
    var gg = _pianoGiorniSettimana(anno, w4);
    var mm = parseInt(gg[0].split('-')[1]);
    if (mm >= 6 && mm <= 8 && !out[w4]) out[w4] = 'verde';
  }
  return out;
}
function _vacDatiEsport(anno) {
  const collab = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return collab.map((c) => {
    const parti = c.nome.trim().split(/\s+/);
    const cognome = parti.length > 1 ? parti.slice(0, -1).join(' ') : parti[0];
    const nome = parti.length > 1 ? parti[parti.length - 1] : '';
    const sett = _pianoVacCache
      .filter((v) => v.collaboratore === c.nome && v.anno === anno)
      .map((v) => v.settimana)
      .sort((a, b) => a - b);
    return { cognome: cognome.toUpperCase(), nome: nome.toUpperCase(), settimane: sett };
  });
}
function _vacDataIt(dstr) {
  const p = dstr.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}
// libreria Excel CON stili (colori): si carica solo quando serve, senza
// toccare la XLSX globale usata da tutto il resto del programma
function _vacXlsxStyle() {
  return new Promise((resolve, reject) => {
    if (window._XLSXStyle) return resolve(window._XLSXStyle);
    const orig = window.XLSX;
    const s = document.createElement('script');
    s.src = 'libs/xlsx-style.min.js';
    s.onload = () => {
      window._XLSXStyle = window.XLSX;
      window.XLSX = orig;
      resolve(window._XLSXStyle);
    };
    s.onerror = () => {
      window.XLSX = orig;
      reject(new Error('libreria stili non caricata'));
    };
    document.head.appendChild(s);
  });
}
async function esportaVacanzeExcel() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  let XS;
  try {
    XS = await _vacXlsxStyle();
  } catch (e) {
    toast('Libreria per i colori non disponibile');
    return;
  }
  const dati = _vacDatiEsport(anno);
  const fasce = _vacFasce(anno);
  const bordo = {
    top: { style: 'thin' },
    bottom: { style: 'thin' },
    left: { style: 'thin' },
    right: { style: 'thin' },
  };
  const fillDi = (w) => (fasce[w] ? { patternType: 'solid', fgColor: { rgb: VAC_COLORI_FASCE[fasce[w]] } } : undefined);
  const ws = {};
  const set = (r, c, v, stile) => {
    const a = XS.utils.encode_cell({ r: r, c: c });
    ws[a] = { v: v === undefined ? '' : v, t: typeof v === 'number' ? 'n' : 's' };
    if (stile) ws[a].s = stile;
  };
  // istruzioni (identiche al file HR)
  set(
    0,
    0,
    '1) Selezionare la settimana di preferenza con una X. Scegliere 5 settimane in modo da facilitare la pianificazione.',
    { font: { sz: 9, italic: true } },
  );
  set(
    1,
    0,
    '2) Devono essere effettuate 2 settimane consecutive . Durante le vacanze scolastiche si darà precedenza a genitori con i figli in età scolastica.',
    { font: { sz: 9, italic: true } },
  );
  // titolo
  set(3, 0, repartoLabel(_pianoReparto()).toUpperCase(), { font: { bold: true, sz: 12 } });
  set(3, 3, ' PIANIFICAZIONE VACANZE ANNO ' + anno, { font: { bold: true, sz: 14 } });
  // intestazione riga 5: COGNOME NOME anno Pianificate 52 1..52
  const hStile = (w) => ({
    font: { bold: true, sz: 9 },
    alignment: { horizontal: 'center' },
    border: bordo,
    fill: fillDi(w),
  });
  set(4, 0, 'COGNOME', { font: { bold: true }, border: bordo });
  set(4, 1, 'NOME', { font: { bold: true }, border: bordo });
  set(4, 2, String(anno), { font: { bold: true }, alignment: { horizontal: 'center' }, border: bordo });
  set(4, 3, 'Pianificate', { font: { bold: true }, alignment: { horizontal: 'center' }, border: bordo });
  set(4, 4, 52, hStile(0));
  for (let w = 1; w <= 52; w++) set(4, 4 + w, w, hStile(w));
  // righe collaboratori
  dati.forEach((d, i) => {
    const r = 5 + i;
    set(r, 0, d.cognome, { border: bordo });
    set(r, 1, d.nome, { border: bordo });
    set(r, 2, '', { border: bordo });
    set(r, 3, d.settimane.length, { alignment: { horizontal: 'center' }, border: bordo });
    set(r, 4, '', { border: bordo, fill: fillDi(0) });
    for (let w = 1; w <= 52; w++) {
      const stile = { alignment: { horizontal: 'center' }, border: bordo, font: { bold: true, sz: 9 } };
      const f = fillDi(w);
      if (f) stile.fill = f;
      set(r, 4 + w, d.settimane.includes(w) ? 'X' : '', stile);
    }
  });
  // LEGENDA a destra (colonne BH-BJ come nel file)
  const cL = 59;
  set(0, cL, 'LEGENDA', { font: { bold: true } });
  set(1, cL, 'N° Sett.', { font: { bold: true, sz: 9 }, border: bordo });
  set(1, cL + 1, 'dal', { font: { bold: true, sz: 9 }, border: bordo });
  set(1, cL + 2, 'al', { font: { bold: true, sz: 9 }, border: bordo });
  const legRiga = (rr, w, wLbl, annoW) => {
    const gg = _pianoGiorniSettimana(annoW, w);
    const f = fillDi(wLbl);
    set(rr, cL, wLbl === 0 ? 52 : wLbl, { alignment: { horizontal: 'center' }, border: bordo, font: { sz: 9 } });
    const stD = { border: bordo, font: { sz: 9 } };
    if (f) stD.fill = f;
    set(rr, cL + 1, _vacDataIt(gg[0]), stD);
    set(rr, cL + 2, _vacDataIt(gg[6]), Object.assign({}, stD));
  };
  legRiga(2, 52, 0, anno - 1); // settimana 52 dell'anno precedente
  for (let w = 1; w <= 52; w++) legRiga(2 + w, w, w, anno);
  ws['!ref'] = XS.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(5 + dati.length, 55), c: cL + 2 } });
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 9 }, { wch: 11 }].concat(
    Array.from({ length: 53 }, () => ({ wch: 3.2 })),
    [{ wch: 2 }, { wch: 2 }],
    [{ wch: 8 }, { wch: 11 }, { wch: 11 }],
  );
  ws['!merges'] = [{ s: { r: 3, c: 3 }, e: { r: 3, c: 56 } }];
  const wb = XS.utils.book_new();
  XS.utils.book_append_sheet(wb, ws, 'preferenze');
  XS.writeFile(wb, 'VACANZE ' + repartoLabel(_pianoReparto()).toUpperCase() + ' ' + anno + '.xlsx');
  logAzione('Vacanze esportate', anno + ' · Excel · ' + dati.length + ' collaboratori');
  toast('File Excel creato (formato HR con colori)');
}
function esportaVacanzePdf() {
  const anno = window._pianoVacAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const dati = _vacDatiEsport(anno);
  const fasce = _vacFasce(anno);
  const rgbDi = (w) => {
    if (!fasce[w]) return null;
    const hex = VAC_COLORI_FASCE[fasce[w]];
    return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
  };
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape', 'mm', 'a3');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PIANIFICAZIONE VACANZE ANNO ' + anno + ' · ' + repartoLabel(_pianoReparto()).toUpperCase(), 180, 9, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(
    '1) Selezionare la settimana di preferenza con una X. Scegliere 5 settimane in modo da facilitare la pianificazione.',
    8,
    14,
  );
  doc.text(
    '2) Devono essere effettuate 2 settimane consecutive. Durante le vacanze scolastiche si darà precedenza a genitori con i figli in età scolastica.',
    8,
    17.5,
  );
  const head = ['COGNOME', 'NOME', 'Pianificate', '52'];
  for (let w = 1; w <= 52; w++) head.push(String(w));
  const body = dati.map((d) => {
    const r = [d.cognome, d.nome, String(d.settimane.length), ''];
    for (let w = 1; w <= 52; w++) r.push(d.settimane.includes(w) ? 'X' : '');
    return r;
  });
  const colStyles = {
    0: { cellWidth: 28, halign: 'left' },
    1: { cellWidth: 21, halign: 'left' },
    2: { cellWidth: 11 },
  };
  for (let i = 3; i < 57; i++) colStyles[i] = { cellWidth: 4.6 };
  doc.autoTable({
    startY: 20,
    head: [head],
    body: body,
    theme: 'grid',
    margin: { left: 6, right: 60 },
    styles: {
      fontSize: 5.2,
      cellPadding: 0.6,
      halign: 'center',
      lineColor: [130, 130, 130],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 5 },
    columnStyles: colStyles,
    didParseCell: (d) => {
      if (d.column.index < 3) return;
      const w = d.column.index === 3 ? 0 : d.column.index - 3;
      const rgb = rgbDi(w);
      if (rgb) d.cell.styles.fillColor = rgb;
      if (d.section === 'body' && d.cell.raw === 'X') d.cell.styles.fontStyle = 'bold';
    },
  });
  // LEGENDA a destra
  const legBody = [];
  const gg52 = _pianoGiorniSettimana(anno - 1, 52);
  legBody.push(['52', _vacDataIt(gg52[0]), _vacDataIt(gg52[6])]);
  for (let w = 1; w <= 52; w++) {
    const gg = _pianoGiorniSettimana(anno, w);
    legBody.push([String(w), _vacDataIt(gg[0]), _vacDataIt(gg[6])]);
  }
  doc.autoTable({
    startY: 20,
    margin: { left: 366 },
    tableWidth: 48,
    head: [['N° Sett.', 'dal', 'al']],
    body: legBody,
    theme: 'grid',
    styles: {
      fontSize: 4.6,
      cellPadding: 0.5,
      halign: 'center',
      lineColor: [130, 130, 130],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
    },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 4.8 },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const w = d.row.index === 0 ? 0 : d.row.index;
      const rgb = rgbDi(w);
      if (rgb && d.column.index > 0) d.cell.styles.fillColor = rgb;
    },
  });
  const nomeFile = 'VACANZE_' + repartoLabel(_pianoReparto()).toUpperCase() + '_' + anno + '.pdf';
  if (typeof mostraPdfPreview === 'function') mostraPdfPreview(doc, nomeFile, 'Vacanze ' + anno);
  else doc.save(nomeFile);
  logAzione('Vacanze esportate', anno + ' · PDF · ' + dati.length + ' collaboratori');
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
            ' · clicca per rimuovere" onclick="rimuoviPianoMappatura(' +
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
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Colonne evidenziate in verde nel calendario e conteggio weekend nelle statistiche. La domenica ha sempre il suo colore.</p>' +
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
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Chi ha la competenza CERTIFICATA in Formazione diventa idoneo anche al gruppo indicato (in aggiunta ai suoi Settori). "-" = nessun collegamento.</p>';
  // solo i gruppi dei turni DI QUESTO settore (i turni sono divisi per settore)
  const gruppiDisp = [
    ...new Set(
      _pianoTurniReparto()
        .map((t) => (t.gruppo || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
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
        '\',this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">-</option>' +
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
    '<p style="font-size:.82rem;color:var(--muted);margin-top:8px">Gli import si fanno nelle rispettive schermate: fabbisogno nel Calendario, vacanze nella tab Vacanze, timbrature nella tab Timbrature (o in automatico dalla timbratrice). L\'export copre anche il backup completo in Impostazioni del Diario.</p>';
  h += '</div></div>';
  return h;
}

const _REGOLE_GRUPPO_TIPI = {
  richiede_funzione: 'Solo queste funzioni (es: SUP oppure BO,SUP) · la storia nel gruppo vale come consenso',
  blocca_tipo_turno: 'Vieta un tipo di turno nel gruppo (es: NOTTURNO)',
  richiede_campo: 'Richiede un campo del collaboratore (es: accoglienza>0)',
  limite_funzione_giorno: 'Max N di una funzione al giorno (es: SUP:1)',
  limite_funzione_mese: 'Max N persone di una funzione al mese (es: SUP:1)',
  minimo_funzione_mese: 'Almeno N di una funzione al mese (es: SUP:1)',
  minimo_funzione_giorno: 'Almeno N al giorno, con filtri (es: SUP:1:NOTTURNO:4,5 · 4,5=ven,sab)',
};
// TAB GUIDA · manuale rapido della sezione Piano (come la Guida di Turnivo)
// ================================================================
// TAB FORMULARI · moduli stampabili standard (come i formulari vuoti di
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
    'Modulo ufficiale HR 1187: i jolly indicano i giorni del mese in cui non sono disponibili (da consegnare entro il ' +
      _pianoGiornoNd() +
      '° giorno del mese).',
    'pdfNonDisponibilitaJolly()',
  );
  const rigaProtocollo = (titolo, nomeOriginale, chiave) =>
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:260px"><b>' +
    titolo +
    '</b><br><span style="font-size:.8rem;color:var(--muted)">Modulo ufficiale Word da stampare/compilare. In alternativa, la versione Excel si compila al computer e si reimporta in Formazione per la certificazione automatica.</span></div>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 14px;border-color:#1a4a7a;color:#1a4a7a" onclick="apriFormularioPerNome(\'' +
    nomeOriginale.replace(/'/g, "\\'") +
    '\')">Scarica Word (originale)</button>' +
    '<button class="btn-export" style="font-size:.82rem;padding:4px 10px" onclick="pianoScaricaProtocollo(\'' +
    chiave +
    '\')">Excel per import</button></div>';
  h += rigaProtocollo(
    'Protocollo formazione · Slot Attendant',
    'Formazione Slot Attendant nuovi impiegati (originale)',
    'sala',
  );
  h += rigaProtocollo(
    'Protocollo formazione · Reception',
    'Formazione Reception nuovi impiegati (originale)',
    'reception',
  );
  h += rigaProtocollo('Protocollo formazione · Cassa', 'Protocollo Formazione Cassa (originale)', 'cassa');
  h += '</div></div>';

  // ARCHIVIO personalizzato
  h +=
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">I tuoi formulari · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (' +
    _pianoFormulariCache.length +
    ')';
  if (puoMod)
    h +=
      '<button class="btn-export" style="font-size:.82rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'form-arch-file\').click()">Carica formulario</button>' +
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
          ' <span style="font-size:.82rem;color:var(--muted)">(' +
          Math.round((f.dimensione || 0) / 1024) +
          ' KB)</span></span>' +
          '<button class="btn-export" style="font-size:.82rem;padding:3px 10px" onclick="apriFormulario(' +
          f.id +
          ')">' +
          (f.mime === 'application/pdf' ? 'Apri / Stampa' : 'Scarica') +
          '</button>' +
          (puoMod
            ? '<button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:#1a4a7a;color:#1a4a7a" onclick="rinominaFormulario(' +
              f.id +
              ')">Rinomina/Sposta</button><button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFormulario(' +
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
// LISTA DI NON DISPONIBILITÀ (JOLLY) · replica del modulo ufficiale
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
  doc.text(
    '- da trasmettere al massimo entro il ' + _pianoGiornoNd() + '° giorno del mese al Responsabile di settore -',
    105,
    y,
    {
      align: 'center',
    },
  );
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
    restituzione: '____/____/________  con turno _________',
  });
  mostraPdfPreview(doc, 'cambio_turno_vuoto.pdf', 'Formulario cambio turno');
}

function _renderPianoGuidaTab() {
  // la guida e' una sola, in js/guida.js: qui si mostrano i capitoli del piano
  if (typeof renderGuidaHtml === 'function') return renderGuidaHtml('piano');
  return '<div class="main-card"><div style="padding:16px">Guida non disponibile.</div></div>';
}
function _renderPianoRegoleGruppoCard() {
  if (!puoGestireRegole()) return '';
  const gruppi = [
    ...new Set(
      _pianoTurniReparto()
        .map((t) => (t.gruppo || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole di gruppo (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Regole di idoneità per settore/gruppo: chi può lavorare in un gruppo, limiti e minimi per funzione. Applicate dalla bozza automatica e dal validatore.</p>';
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
    '<p id="rg-aiuto" style="font-size:.82rem;color:var(--muted);margin-top:4px">' +
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
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Preferenze collaboratori · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<div style="display:flex;margin-bottom:8px"><input type="text" id="pref-collab-cerca" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="_filtraPrefCollab(this.value)"></div>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" id="pref-collab-table" style="min-width:760px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th><th>Solo diurni</th><th style="text-align:left">Turni bloccati (CSV)</th><th title="La bozza le privilegia sui turni L1">Preferisce L1</th><th title="Livello accoglienza (0-2): serve per il gruppo ACCOGLIENZA">Accoglienza</th><th style="text-align:left" title="Gruppi dove NON può lavorare da solo (CSV, es: REC)">Accompagnamento</th><th style="text-align:left" title="Altri reparti in cui lavora (CSV, es: valet): appare anche nei loro piani e le ore si sommano">Reparti extra</th><th style="text-align:left" title="Derivati dalle competenze certificate in Formazione (sola lettura)">Settori</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    h +=
      '<tr data-pref-nome="' +
      escP(c.nome.toLowerCase()) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td>' +
      escP(c.funzione || '-') +
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
      ',\'accompagnamento_settori\',this.value)" style="width:90px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left">' +
      (typeof apriCoperturaCollab === 'function'
        ? '<button class="btn-export" style="font-size:.82rem;padding:2px 8px" title="Copertura altri settori: si imposta qui e in Gestione collaboratori (stessa finestra)" onclick="apriCoperturaCollab(' +
          c.id +
          ')">' +
          escP(
            String(c.reparti_extra || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .map((k) => repartoLabel(k))
              .join(', ') || 'imposta...',
          ) +
          '</button>'
        : escP(c.reparti_extra || '-')) +
      '</td><td style="text-align:left;font-size:.82rem;color:var(--muted)" title="Si gestiscono con le spunte in Formazione">' +
      escP((_pianoSettoriEffettivi(c) || []).join(', ') || '-') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-top:6px">"Solo diurni" e i turni bloccati vengono rispettati dalla bozza automatica. Funzione e percentuale si modificano in Impostazioni del Diario → Gestione collaboratori; i <b>Settori</b> derivano dalle competenze certificate in <b>Formazione</b> (spunta = idoneo, sola lettura qui).</p>';
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
      // stampa PULITA: righe bianche per tutti i settori (niente verdi/arancio
      // weekend-festivi · richiesta utente); resta solo la zebra leggerissima
      fill: g % 2 === 0 ? [248, 249, 250] : [255, 255, 255],
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
  doc.text(repartoLabel(_pianoReparto()) + (info && info.funzione ? ' · ' + info.funzione : ''), 45, y);
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
        'Casino Lugano SA · Piano turni ' +
          meseNome +
          ' ' +
          anno +
          ' · Generato il ' +
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
      const nuovo = await _pianoInserisciCella({
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
// MENU CONTESTUALE (tasto destro) · come Turnivo cap. 17.4:
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
  h += voce('Cerca cambio · giorno libero', 'icx-cerca', "pianoCtxAzione('liberogiorno')", puoMod && !!haTurno);
  // solo dove c'e' stato un cambio (commento "cambio con" o restituzione)
  const _haCambio = !!(r && /cambio con/i.test(r.commento || ''));
  if (_haCambio) h += voce('Ristampa foglio cambio', 'icx-stampa', "pianoCtxAzione('ristampaCambio')", puoMod);
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
    ' · ' +
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
  } else if (azione === 'liberogiorno') {
    _pianoCellaSel = { nome: sel.nome, data: sel.data };
    apriCercaCambioLibero();
  } else if (azione === 'ristampaCambio') ristampaFoglioCambio(sel.nome, sel.data);
  else if (azione === 'esigenze') apriCambioEsigenze(sel.nome, sel.data);
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
    '</strong> · ' +
    new Date(dstr + 'T12:00:00').toLocaleDateString('it-IT') +
    ' · turno attuale: <strong>' +
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
          ')' +
          (_pianoIdoneoPerTurno(nome, t) ? '' : ' ⚠ NON FORMATO') +
          '</option>',
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
  // STESSE REGOLE DEL PIANO MANUALE: se il nuovo turno viola riposo 11h,
  // consecutivi o le altre regole, avviso + conferma e violazione a verbale
  let notaRegole = '';
  if (typeof _pianoAvvisaViolazioniCella === 'function') {
    const avvisi = await _pianoAvvisaViolazioniCella(sel.nome, sel.data, nuovo);
    _pianoAccompagnamentoAvviso([{ nome: sel.nome, data: sel.data, codice: nuovo }]).forEach((a) =>
      avvisi.push(a.testo),
    );
    if (avvisi.length) {
      if (
        !confirm(
          '⚠ ATTENZIONE · ' +
            sel.nome +
            ' · ' +
            sel.data.split('-').reverse().join('.') +
            ':\n\n• ' +
            avvisi.join('\n• ') +
            '\n\nConfermi comunque il cambio per esigenze in ' +
            nuovo +
            "? La segnalazione restera' scritta nel commento della cella.",
        )
      )
        return;
      notaRegole = '⚠ ' + avvisi.join(' · ') + ' · ';
    }
  }
  try {
    await secPatch('piano', 'id=eq.' + r.id, {
      codice: nuovo,
      protetto: true,
      commento: (
        notaRegole +
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
    // incentivi: chi accetta il cambio prende i punti "Cambio turno
    // accettato", chi ha rifiutato si segna nello stesso popup
    if (typeof apriPopupCopertura === 'function')
      setTimeout(() => apriPopupCopertura(sel.nome, sel.data, 'cambio'), 400);
    // niente formulario: e' una decisione dell'operatore, basta il commento
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
// CONTROLLO IMMEDIATO delle regole quando si scrive un turno A MANO:
// riposo minimo con il giorno prima e dopo, massimo di giorni consecutivi.
// Legge i giorni vicini dal database, quindi vale anche a cavallo di mese
// ACCOMPAGNAMENTO: chi e' segnato "accompagnato" in un gruppo (o copre da un
// altro settore con la spunta accompagnato) non deve restare DA SOLO in quel
// gruppo in un dato giorno. Simula uno o piu' cambi di cella insieme (override)
// e ritorna gli avvisi per il giorno. Usa il piano in memoria (_pianoRighe).
function _pianoAccompagnamentoAvviso(overrides) {
  try {
    if (typeof _pianoRighe === 'undefined' || !overrides || !overrides.length) return [];
    // solo i giorni toccati dai cambi
    const giorni = [...new Set(overrides.map((o) => o.data))];
    const avvisi = [];
    for (const dstr of giorni) {
      const g = parseInt(dstr.split('-')[2]);
      // stato del giorno dal piano, poi applico gli override
      const perNome = {};
      _pianoRighe.forEach((r) => {
        if (r.data === dstr) perNome[r.collaboratore] = r.codice;
      });
      overrides.forEach((o) => {
        if (o.data === dstr) perNome[o.nome] = o.codice || '';
      });
      // il conteggio per gruppo e chi resta solo lo calcola il motore puro
      const soli = PianoRegole.violazioniAccompagnamento({
        perNome: perNome,
        turnoDi: (c) => _pianoTurnoInfo(c),
        gruppoDi: (c) => {
          const t = _pianoTurnoInfo(c);
          return t ? (t.gruppo || '').toUpperCase() : '';
        },
        isAccompagnato: (nm, gr) => {
          const info = _pianoCollabInfo(nm);
          if (!info) return false;
          if (info.accompagnamento_settori && _pianoAccompagnamentoDi(info).includes(gr)) return true;
          const cop = _pianoCoperturaCfg(info);
          return !!(cop && cop.accompagnato);
        },
      });
      soli.forEach((a) =>
        avvisi.push({
          nome: a.nome,
          testo: 'resta da solo nel gruppo ' + a.gruppo + ' il ' + g + ' ma richiede accompagnamento',
        }),
      );
    }
    return avvisi;
  } catch (e) {
    return [];
  }
}
async function _pianoAvvisaViolazioniCella(nome, dstr, codiceNuovo) {
  try {
    const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
    const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
    if (!maxCons && !minRiposo) return [];
    const d0 = new Date(dstr + 'T12:00:00');
    const iso = (d) => d.toISOString().substring(0, 10);
    const da = new Date(d0);
    da.setDate(da.getDate() - Math.max(7, maxCons + 1));
    const fin = new Date(d0);
    fin.setDate(fin.getDate() + Math.max(7, maxCons + 1));
    const righe =
      (await secGet(
        'piano?collaboratore=eq.' +
          encodeURIComponent(nome) +
          '&data=gte.' +
          iso(da) +
          '&data=lte.' +
          iso(fin) +
          '&limit=100',
      )) || [];
    const mappa = {};
    const codPrec = {};
    righe.forEach((r) => {
      mappa[r.data] = r.codice;
      codPrec[r.data] = r.codice; // stato PRIMA della modifica, per i controlli sotto
    });
    if (codiceNuovo !== undefined) mappa[dstr] = codiceNuovo; // simulazione prima del salvataggio
    // CONGEDI DEDICATI ALLE VACANZE: le C (e i WD) messi prima e dopo un
    // periodo di vacanza servono al riposo previsto dalle regole. Scriverci
    // sopra un turno toglie quel riposo, quindi si avvisa.
    const avvisiExtra = [];
    const codOra = codPrec[dstr];
    if (codiceNuovo && _pianoTurnoInfo(codiceNuovo) && (codOra === 'C' || codOra === 'WD')) {
      const info = _pianoCollabInfo(nome) || {};
      const pct = parseFloat(info.percentuale) || 1;
      const nPrima =
        (info.is_jolly ? parseInt(_pianoRegolaVal('c_prima_jolly')) : parseInt(_pianoRegolaVal('c_prima_fissi'))) || 1;
      const nDopo =
        parseInt(
          _pianoRegolaVal(pct >= 1 ? 'c_dopo_100' : pct >= 0.8 ? 'c_dopo_80' : pct >= 0.6 ? 'c_dopo_60' : 'c_dopo_40'),
        ) || 1;
      const nWd = parseInt(_pianoRegolaVal('wd_prima_vacanza')) || 0;
      const rel = (n) => {
        const d = new Date(dstr + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().substring(0, 10);
      };
      let dedicato = '';
      // vacanza che INIZIA nei giorni successivi: questo e' un congedo "prima"
      for (let k = 1; k <= nPrima + nWd && !dedicato; k++)
        if (codPrec[rel(k)] === 'V')
          dedicato = 'congedo previsto PRIMA delle vacanze (' + (codOra === 'WD' ? 'WD' : 'C') + ')';
      // vacanza che FINISCE nei giorni precedenti: congedo "dopo"
      for (let k = 1; k <= nDopo && !dedicato; k++)
        if (codPrec[rel(-k)] === 'V') dedicato = 'congedo di recupero DOPO le vacanze';
      if (dedicato)
        avvisiExtra.push(
          "questo giorno e' un " + dedicato + ': assegnandogli il turno ' + codiceNuovo + ' quel riposo viene tolto',
        );
    }
    // la logica riposo/consecutivi/idoneita' vive nel motore puro PianoRegole
    const tNuovo = codiceNuovo !== undefined ? _pianoTurnoInfo(codiceNuovo) : null;
    return avvisiExtra.concat(
      PianoRegole.violazioniCella({
        mappaGiorni: mappa,
        giorno: dstr,
        minRiposo: minRiposo,
        maxCons: maxCons,
        turnoDi: (c) => _pianoTurnoInfo(c),
        isLavoro: (c) => _pianoIsLavoro(c),
        idoneo: tNuovo ? _pianoIdoneoPerTurno(nome, tNuovo) : null,
        codiceNuovo: codiceNuovo,
      }),
    );
  } catch (e) {
    return [];
  }
}
async function pianoSalvaCella(nome, dstr, codice) {
  if (!puoGestirePiano()) return false;
  // le sigle si possono scrivere in minuscolo: nel piano restano sempre MAIUSCOLE
  codice = String(codice == null ? '' : codice)
    .trim()
    .toUpperCase();
  _pianoUndoSnap('modifica cella ' + nome.split(' ')[0] + ' ' + dstr.substring(8));
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
  // REGOLE ANCHE A MANO: controllo prima di salvare (riposo minimo e
  // consecutivi, anche a cavallo di mese); se si conferma comunque, la
  // violazione resta scritta nel commento della cella
  let commentoRegole = '';
  if (codice && _pianoTurnoInfo(codice)) {
    const avvisi = await _pianoAvvisaViolazioniCella(nome, dstr, codice);
    _pianoAccompagnamentoAvviso([{ nome: nome, data: dstr, codice: codice }]).forEach((a) => avvisi.push(a.testo));
    if (avvisi.length) {
      if (
        !confirm(
          '\u26a0 ATTENZIONE \u00b7 ' +
            nome +
            ' \u00b7 ' +
            dstr.split('-').reverse().join('.') +
            ':\n\n\u2022 ' +
            avvisi.join('\n\u2022 ') +
            '\n\nConfermi comunque il turno ' +
            codice +
            "? La segnalazione restera' scritta nel commento della cella.",
        )
      )
        return false;
      commentoRegole = '\u26a0 ' + avvisi.join(' \u00b7 ');
    }
  }
  try {
    if (!codice) {
      if (r) {
        await secDel('piano', 'id=eq.' + r.id);
        _pianoRighe = _pianoRighe.filter((x) => x.id !== r.id);
        logAzione('Piano: turno rimosso', nome + ' ' + dstr + ' (era ' + attuale + ')');
        // era una malattia: proposta di toglierla anche dal Diario
        if (attuale === 'M' || attuale === 'M1') await _pianoMalattiaViaDiario(nome, [dstr]);
        renderPiano();
      }
      return;
    }
    if (codice === attuale) return;
    if (r) {
      const patchCella = {
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        operatore: getOperatore(),
        updated_at: new Date().toISOString(),
      };
      if (commentoRegole)
        patchCella.commento = (commentoRegole + (r.commento ? ' \u00b7 ' + r.commento : '')).substring(0, 400);
      await secPatch('piano', 'id=eq.' + r.id, patchCella);
      if (commentoRegole) r.commento = patchCella.commento;
      r.codice = codice;
      r.protetto = true;
      r.ora_inizio = orarioJG ? orarioJG.ora_inizio : null;
      r.ora_fine = orarioJG ? orarioJG.ora_fine : null;
    } else {
      const nuovo = await _pianoInserisciCella({
        collaboratore: nome,
        data: dstr,
        codice: codice,
        protetto: true,
        generato: false,
        ora_inizio: orarioJG ? orarioJG.ora_inizio : null,
        ora_fine: orarioJG ? orarioJG.ora_fine : null,
        commento: commentoRegole ? commentoRegole.substring(0, 400) : null,
        reparto_dip: _pianoReparto(),
        operatore: getOperatore(),
      });
      if (nuovo && nuovo[0]) _pianoRighe.push(nuovo[0]);
    }
    logAzione('Piano modificato', nome + ' ' + dstr + ' → ' + codice);
    // M scritta a mano nel piano: proposta di registrarla anche nel Diario,
    // cosi' piano, Diario e scheda collaboratore restano allineati
    if (codice === 'M' || codice === 'M1') {
      const nDia = await _pianoMalattiaNelDiario(nome, dstr, dstr, true);
      if (nDia) toast('Malattia registrata anche nel Diario: conta nella scheda di ' + nome);
    } else if (attuale === 'M' || attuale === 'M1') {
      // la M e' stata sovrascritta con un turno: il giorno non e' piu' malattia
      await _pianoMalattiaViaDiario(nome, [dstr]);
    }
    renderPiano();
    // rivalidazione del mese se era attiva (tutte le altre regole)
    if (_pianoViolLista !== null) {
      const rv = _pianoCalcolaViolazioni();
      _pianoViolCelle = rv.celle;
      _pianoViolLista = rv.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
      _pianoRenderViolazioni();
    }
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
  // la cella cliccata resta SELEZIONATA (come la cella attiva di Excel):
  // cosi' "clicco la cella e poi scelgo il colore" funziona al primo colpo
  window._pianoBlocco = { tab: 'piano', t1: el, t2: el, completo: true };
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
// TAB BRIEFING · briefing giornaliero + pause (da Excel Musa)
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
// EVIDENZIAZIONI DAL PIANO AL BRIEFING
// Regole per settore: una cella colorata nel piano puo' arrivare sul briefing
// con un ALTRO colore e un'etichetta (es. valet: coordinatore segnato in rosso
// nel piano, sul foglio del briefing si vede verde). Configurabili dalla tab
// Briefing. Impostazione 'brief_evidenziazioni':
//   { valet: [ { da:'#FF6B6B', a:'#95E06C', label:'Coordinatore' } ] }
function _briefEvidenziazioni(rep) {
  const cfg = window._briefEvidCfg || {};
  const lista = cfg[rep || _pianoReparto()];
  return Array.isArray(lista) ? lista : [];
}
function _briefColoreDaPiano(colorePiano) {
  if (!colorePiano) return '';
  const su = String(colorePiano).toUpperCase();
  const reg = _briefEvidenziazioni().find((x) => String(x.da || '').toUpperCase() === su);
  if (reg) return reg.a || colorePiano;
  // senza regole configurate il valet mantiene il comportamento di sempre
  // (il colore del piano arriva tale e quale); gli altri settori no
  return _pianoReparto() === 'valet' ? colorePiano : '';
}
function _briefEtichettaColore(coloreBriefing) {
  if (!coloreBriefing) return '';
  const su = String(coloreBriefing).toUpperCase();
  const reg = _briefEvidenziazioni().find((x) => String(x.a || '').toUpperCase() === su);
  return reg && reg.label ? reg.label : '';
}
function _briefComponi(pianoRighe) {
  const righe = [];
  (pianoRighe || []).forEach((r) => {
    // regola multi-reparto: si finisce nel briefing del REPARTO DEL TURNO,
    // non del reparto d'origine (Balliu con X1 valet → solo briefing valet,
    // mai in quello slots). Niente fallback sui turni degli altri reparti.
    const t = _pianoTurniReparto().find((x) => x.codice === r.codice);
    // stesso CODICE usato da due reparti (es. "9" esiste sia in slots sia in
    // tavoli): la riga resta al reparto suo, altrimenti i colleghi degli altri
    // settori finirebbero in questo briefing solo per omonimia di sigla
    const repRiga = r.reparto_dip || 'slots';
    if (t && repRiga !== _pianoReparto()) {
      const suoTurno = pianoTurniCache.some(
        (x) => x.codice === r.codice && (x.reparto_dip || 'slots') === repRiga && x.attivo !== false,
      );
      if (suoTurno) return;
    }
    // JG: sempre nel briefing quando è nel piano del reparto (con l'orario
    // della cella se c'è, altrimenti da scrivere a mano sul foglio)
    const isJg = String(r.codice).toUpperCase() === 'JG' && (r.reparto_dip || 'slots') === _pianoReparto();
    const custom = (!t && r.ora_inizio && r.ora_fine && (r.reparto_dip || 'slots') === _pianoReparto()) || (!t && isJg);
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
      // Il colore dato alla cella del PIANO arriva sul briefing. Con le
      // "evidenziazioni" configurate (Briefing → Evidenziazioni dal piano) un
      // colore del piano puo' diventarne un altro sul briefing: es. valet,
      // coordinatore segnato in rosso nel piano che sul foglio si vede verde.
      col: (r.colore && _briefColoreDaPiano(_stileCella(r.colore).c)) || undefined,
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
  // La rotazione NON dipende dall'aver salvato ieri: si ricostruisce la
  // catena "chi chiude riapre" all'indietro (max 14 giorni) dall'ultimo
  // briefing salvato; nei giorni senza salvataggio vale la regola pura e,
  // se nel piano c'erano C8, la cassa del presto resta anche il giorno dopo.
  const giorni = [];
  for (let gi = 14; gi >= 1; gi--) {
    const d0 = new Date(dstr + 'T12:00:00');
    d0.setDate(d0.getDate() - gi);
    giorni.push(
      d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0'),
    );
  }
  let salvatiRange = [];
  let pianoRange = [];
  try {
    [salvatiRange, pianoRange] = await Promise.all([
      secGet(
        'piano_briefing?data=gte.' +
          giorni[0] +
          '&data=lte.' +
          giorni[giorni.length - 1] +
          '&sezione=eq.briefing&reparto_dip=eq.' +
          _pianoReparto(),
      ),
      secGet(
        'piano?data=gte.' + giorni[0] + '&data=lte.' + giorni[giorni.length - 1] + '&reparto_dip=eq.' + _pianoReparto(),
      ),
    ]);
  } catch (e) {}
  const salvatoDi = {};
  (salvatiRange || []).forEach((s) => {
    if (s.contenuto && Array.isArray(s.contenuto.righe) && s.contenuto.righe.length)
      salvatoDi[String(s.data).substring(0, 10)] = s.contenuto.righe;
  });
  const c8Nei = new Set(
    (pianoRange || [])
      .filter((r) => String(r.codice || '').toUpperCase() === 'C8')
      .map((r) => String(r.data).substring(0, 10)),
  );
  const trovaOggi = (turno) => righe.find((x) => String(x.turno).toUpperCase() === turno);
  const apreCds = [];
  const coppieCalc = [];
  cfg.coppie.forEach((cp) => {
    const [a, b] = cp.cd.map(String);
    const altroCd = (n) => (n === a ? b : a);
    // REGOLA: la cassa che CHIUDE un giorno e' quella che APRE il giorno dopo.
    // Si leggono i numeri EFFETTIVI del briefing di ieri (anche se cambiati a
    // mano e diversi dalla coppia configurata): comanda quello che c'e' scritto,
    // non la configurazione. La coppia serve solo a sapere QUALI turni aprono e
    // chiudono, e come punto di partenza quando non esiste alcuno storico.
    const apreDomaniDa = (rr) => {
      const cdDi = (turno) => {
        const x = rr.find((y) => String(y.turno).toUpperCase() === turno && String(y.cd || '').trim());
        return x ? String(x.cd).trim() : '';
      };
      // il C8 chiude piu' tardi di tutti: se c'e' ed e' su una cassa di questa
      // postazione (quella che apriva o chiudeva ieri), riapre lui domani
      const cdApriva = cdDi(cp.apre.toUpperCase());
      const cdChiudeva = cdDi(cp.chiude.toUpperCase());
      const c8 = rr.filter((y) => String(y.turno).toUpperCase() === 'C8' && String(y.cd || '').trim());
      const c8Qui = c8.find((y) => [cdApriva, cdChiudeva].includes(String(y.cd).trim()));
      if (c8Qui)
        return { apre: String(c8Qui.cd).trim(), altra: cdApriva === String(c8Qui.cd).trim() ? cdChiudeva : cdApriva };
      if (cdChiudeva) return { apre: cdChiudeva, altra: cdApriva || altroCd(cdChiudeva) };
      if (cdApriva) return { apre: altroCd(cdApriva), altra: cdApriva };
      return null;
    };
    let apreCd = '';
    let altraCd = '';
    let anc = -1;
    for (let gi = giorni.length - 1; gi >= 0 && !apreCd; gi--) {
      if (salvatoDi[giorni[gi]]) {
        const res = apreDomaniDa(salvatoDi[giorni[gi]]);
        if (res && res.apre) {
          apreCd = res.apre;
          altraCd = res.altra || altroCd(res.apre);
          anc = gi;
        }
      }
    }
    if (!apreCd) {
      // nessun briefing salvato nel periodo: alternanza deterministica per data
      const ep = Math.floor(new Date(giorni[0] + 'T12:00:00').getTime() / 86400000);
      apreCd = ep % 2 === 0 ? a : b;
      altraCd = apreCd === a ? b : a;
      anc = -1;
    }
    // propaga la rotazione dai giorni SENZA briefing salvato fino a ieri: ogni
    // giorno senza C8 le due casse si scambiano, con C8 restano come sono
    const scambia = () => {
      const t = apreCd;
      apreCd = altraCd;
      altraCd = t;
    };
    for (let gi = anc + 1; gi < giorni.length; gi++) {
      if (!c8Nei.has(giorni[gi])) scambia();
    }
    const chiudeCd = altraCd || altroCd(apreCd);
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
    if (!valetR && rep === 'slots') await _briefAssegnaCd(righe, dstr);
    salvato = false;
  }
  _briefState = {
    id: rigaBrief ? rigaBrief.id : null,
    righe: righe,
    pause: rigaPause || null,
    pianoRighe: pianoRighe || [],
    chiave: dstr + '|' + rep,
  };
  // se il briefing era gia' salvato, controlla che i numeri cassa seguano
  // ancora la rotazione (ieri potrebbe essere stato corretto a mano)
  let cdDaAggiornare = false;
  if (salvato && !valetR && rep === 'slots') {
    try {
      const clone = righe.map((r) => Object.assign({}, r, { cd: '' }));
      await _briefAssegnaCd(clone, dstr);
      const diverse = clone
        .map((c, i) => ({
          i: i,
          atteso: String(c.cd || '').trim(),
          attuale: String((righe[i] && righe[i].cd) || '').trim(),
        }))
        .filter((x) => x.atteso && x.attuale && x.atteso !== x.attuale);
      if (diverse.length) {
        // I numeri cassa seguono la rotazione (chi chiude riapre il giorno
        // dopo): se ieri e' cambiato, oggi si aggiorna DA SOLO, senza premere
        // nulla. Se pero' i numeri di oggi sono stati scritti a mano, non si
        // sovrascrive niente: si avvisa e decide l'operatore.
        if (_briefState && _briefState.cdManuale) {
          cdDaAggiornare = true;
        } else {
          diverse.forEach((x) => {
            righe[x.i].cd = x.atteso;
          });
          if (_briefState) _briefState.righe = righe;
          clearTimeout(_briefSaveTimer);
          await briefSalvaBriefing();
          logAzione('Briefing: numeri cassa allineati', dstr + ' (' + diverse.length + ' celle, rotazione di ieri)');
          toast('Numeri cassa aggiornati dalla rotazione di ieri');
        }
      }
    } catch (e) {}
  }
  const puo = puoGestireBriefing();
  const valet = _briefIsValet();
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Briefing · ' +
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
        '<input type="file" id="brief-xlsx" accept=".xlsx,.xls,.xlsm" style="display:none" onchange="importaBriefingExcel(this)">' +
        '<span style="position:relative;display:inline-flex;align-items:center"><button class="btn-export" style="font-size:.82rem;padding:4px 10px;border-color:#e67e22;color:#e67e22" title="Applica alle celle o righe marcate il colore mostrato nella barretta (per cambiarlo usa la freccia accanto)" onclick="event.stopPropagation();briefColoreApplica(_colUltimo() || null)"><span style="display:flex;flex-direction:column;gap:3px;min-width:44px">Colora' +
        _colChipHtml() +
        '</span></button>' +
        '<button class="btn-export" style="font-size:.82rem;padding:5px 7px;border-color:#e67e22;color:#e67e22" title="Scegli colore o formato" onclick="event.stopPropagation();briefColoriToggle()">&#9662;</button>' +
        '<div id="brief-colori-bar" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
        PIANO_COLORI_CELLA.map(
          (c) =>
            '<span data-c="' +
            c +
            '" onclick="briefColoreApplica(\'' +
            c +
            '\')" style="display:inline-block;width:22px;height:22px;background:' +
            c +
            ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
        ).join('') +
        '<button data-c="" class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="briefColoreApplica(null)">Nessuno</button>' +
        '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
        '<button class="btn-export" style="font-size:.82rem;font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'b\')">G</button> ' +
        '<button class="btn-export" style="font-size:.82rem;font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulle celle o righe marcate (vista e stampa)" onclick="briefFormatoApplica(\'i\')">C</button>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<span style="font-size:.82rem;color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
        PIANO_COLORI_TESTO.map(
          (c) =>
            '<span title="Colore del testo" onclick="briefTestoApplica(\'' +
            c +
            '\')" style="display:inline-block;width:18px;height:18px;background:' +
            c +
            ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
        ).join('') +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:4px;vertical-align:middle" onclick="briefTestoApplica(null)">Auto</button>' +
        '</div>' +
        '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Memorizza il formato della prima cella marcata" onclick="briefCopiaFormato()">Copia formato</button> ' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Applica il formato memorizzato alle celle marcate" onclick="briefIncollaFormato()">Incolla formato</button> ' +
        '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle;border-color:#c0392b;color:#c0392b" title="Toglie colori e formato dalle celle o righe marcate" onclick="briefCancellaFormato()">Cancella formato</button>' +
        '</div>' +
        '</div></span>'
      : '') +
    (puo && !valet && rep === 'slots' && salvato
      ? '<button class="btn-export" style="font-size:.82rem;padding:4px 10px" title="Riassegna la colonna CD con la rotazione (chi ha chiuso ieri riapre oggi), lasciando intatto tutto il resto" onclick="briefAggiornaCd()">Aggiorna numeri cassa</button>'
      : '') +
    (cdDaAggiornare
      ? '<span style="font-size:.82rem;background:#ffd166;color:#5a4300;padding:3px 10px;border-radius:3px;font-weight:700">I numeri cassa di ieri sono cambiati: premi "Aggiorna numeri cassa"</span>'
      : '') +
    '<span id="brief-stato" style="font-size:.82rem;color:var(--muted)">' +
    (salvato
      ? 'Salvato'
      : righe.length
        ? 'Compilato dal piano · modifica una cella per salvare'
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
      ';padding:4px 8px;font-size:.82rem">' +
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
    // stile della SINGOLA cella (r.cs[campo] = "#RRGGBB|bi") combinato col
    // formato dell'intera riga (r.bold / r.ital) e con i default della colonna
    const stDi = (campo) => _stileCella(r.cs && r.cs[campo]);
    const inp = (campo, val, larghezza, extra, bgDef, fwDef) => {
      const stC = stDi(campo);
      const bg = stC.c || bgDef || '';
      return (
        '<td data-campo="' +
        campo +
        '" style="border:1px solid #999;padding:0' +
        (bg ? ';background:' + bg : '') +
        '"><input ' +
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
        'px;border:none;background:transparent;padding:4px 6px;font:inherit;color:inherit' +
        (stC.b || r.bold || fwDef ? ';font-weight:700' : '') +
        (stC.i || r.ital ? ';font-style:italic' : '') +
        (stC.t || r.colT ? ';color:' + (stC.t || r.colT) : '') +
        '"></td>'
      );
    };
    h += '<tr data-bidx="' + i + '">';
    // E e U si spuntano A PENNA sul foglio stampato: celle vuote
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    h += '<td style="border:1px solid #999;width:34px;padding:3px 4px">&nbsp;</td>';
    const stNome = stDi('nome');
    const bgNome = stNome.c || r.col || (r.fm ? '#FFFF00' : '');
    if (r.fm || bgNome) {
      // in formazione (giallo) o colorata: sfondo sulla cella del nome
      h +=
        '<td data-campo="nome" style="border:1px solid #999;padding:0;white-space:nowrap;background:' +
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
        'px;border:none;background:transparent;padding:4px 2px 4px 6px;font:inherit;color:#000' +
        (stNome.b || r.bold || r.fm ? ';font-weight:700' : '') +
        (stNome.i || r.ital ? ';font-style:italic' : '') +
        (stNome.t || r.colT ? ';color:' + (stNome.t || r.colT) : '') +
        '">' +
        (r.fm
          ? '<span style="font-size:.82rem;font-weight:700;color:#000;padding-right:3px">(formazione)</span>'
          : '') +
        '</td>';
    } else h += inp('nome', r.nome, 150);
    const colTurno = _pianoColore(r.turno) || '';
    h += inp('turno', r.turno, 52, '', colTurno, true);
    if (valet) {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
      h += inp('radio', r.radio, 60);
      h += inp('badge', r.badge, 60);
    } else if (rep !== 'slots') {
      h += inp('uscita', r.uscita, 70);
      h += inp('firma', r.firma, 90);
    } else {
      h += inp('cd', r.cd, 40, '', r.cd ? '#FFFF00' : '', true);
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
        ')">×</span></td>';
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
    '<div><table style="border-collapse:collapse;font-size:.8rem"><thead><tr><th colspan="3" style="border:1px solid #999;background:#FFFF00;color:#000;padding:4px 10px;font-size:.82rem">ORARI</th></tr></thead><tbody>';
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
  h += _briefRenderEvidCard();
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
  if (!puoGestireBriefing() || !_briefState) return;
  _briefState.righe[i][campo] = val;
  if (campo === 'nome') _briefState.righe[i].nomeFull = null; // ri-matcha al salvataggio timbratura
  // numero cassa scritto a mano: da qui in poi la rotazione non lo sovrascrive
  // da sola, ma avvisa e lascia decidere (bottone "Aggiorna numeri cassa")
  if (campo === 'cd') _briefState.cdManuale = true;
  _briefDirtySalva();
}
function _briefDirtySalva() {
  clearTimeout(_briefSaveTimer);
  const el = document.getElementById('brief-stato');
  if (el) el.textContent = 'salvataggio…';
  _briefSaveTimer = setTimeout(briefSalvaBriefing, 900);
}
// SALVATAGGI IN SOSPESO. Il piano salva a ogni cella; il briefing aspetta
// 900ms dall'ultimo tasto per non scrivere a ogni lettera. Prima di cambiare
// pagina o tab, o di chiudere l'app, si forza il salvataggio: cosi' non si
// perde mai neanche l'ultima battitura.
function _pianoFlushSalva() {
  try {
    // cella del piano ancora aperta in modifica: si conferma e si salva
    document.querySelectorAll('#piano-content td.piano-cella input').forEach((el) => {
      el.blur();
      el.dispatchEvent(new FocusEvent('blur'));
    });
    if (_briefSaveTimer) {
      clearTimeout(_briefSaveTimer);
      _briefSaveTimer = null;
      if (_briefState) briefSalvaBriefing();
    }
  } catch (e) {}
}
if (!window._pianoUnloadBound) {
  window._pianoUnloadBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _pianoFlushSalva();
  });
  window.addEventListener('pagehide', _pianoFlushSalva);
  // unico caso in cui si avvisa prima di uscire: un salvataggio e' ancora
  // in corso in questo istante (meno di un secondo)
  window.addEventListener('beforeunload', (e) => {
    if (_briefSaveTimer || _briefSaving) {
      _pianoFlushSalva();
      e.preventDefault();
      e.returnValue = '';
    }
  });
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
// COLORE DEL TESTO nel briefing: sulle celle marcate (r.cs) o sull'intera
// riga (r.colT), come nel piano
async function briefTestoApplica(col) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe, poi scegli il colore del testo');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC.t = col || '';
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)].colT = col || null;
      n++;
    }
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast(col ? 'Testo colorato (' + n + ')' : 'Colore del testo tolto (' + n + ')');
  renderPiano();
}
function briefCopiaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  const selC = _briefCelleSel();
  if (!selC.size || !_briefState) {
    toast('Marca prima la cella da cui copiare il formato');
    return;
  }
  const k = [...selC][0];
  const r = _briefState.righe[parseInt(k.split('|')[0])];
  window._briefFormatoCopiato = (r && r.cs && r.cs[k.split('|')[1]]) || null;
  const st = _stileCella(window._briefFormatoCopiato);
  toast(
    'Formato copiato' +
      (st.c || st.b || st.i || st.t
        ? ' (' +
          [st.c ? 'sfondo' : '', st.t ? 'testo' : '', st.b ? 'grassetto' : '', st.i ? 'corsivo' : '']
            .filter(Boolean)
            .join(', ') +
          ')'
        : ' (nessuno: incollandolo si pulisce)'),
  );
}
async function briefIncollaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  if (window._briefFormatoCopiato === undefined) {
    toast('Prima usa "Copia formato" su una cella');
    return;
  }
  const selC = _briefCelleSel();
  if (!selC.size) {
    toast('Marca le celle a cui applicare il formato');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (!r) return;
    r.cs = r.cs || {};
    if (window._briefFormatoCopiato) r.cs[k.split('|')[1]] = window._briefFormatoCopiato;
    else delete r.cs[k.split('|')[1]];
    n++;
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast('Formato applicato a ' + n + ' celle');
  renderPiano();
}
async function briefCancellaFormato() {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima marca le celle o le righe da pulire');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (r && r.cs) {
      delete r.cs[k.split('|')[1]];
      n++;
    }
  });
  sel.forEach((i) => {
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.col = null;
    r.colT = null;
    r.bold = false;
    r.ital = false;
    r.cs = undefined;
    n++;
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast('Formato tolto (' + n + ')');
  renderPiano();
}
async function briefInserisciRiga(i) {
  if (!_briefState || !puoGestireBriefing()) return;
  _briefState.righe.splice(i + 1, 0, _briefRigaVuota());
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
function briefColoriToggle() {
  const b = document.getElementById('brief-colori-bar');
  if (!b) return;
  if (b.style.display !== 'none') {
    b.style.display = 'none';
    return;
  }
  // all'apertura si evidenzia il colore che le celle/righe marcate hanno adesso
  const cc = [];
  _briefCelleSel().forEach((k) => {
    const r = _briefState && _briefState.righe[parseInt(k.split('|')[0])];
    if (r) cc.push(_stileCella(r.cs && r.cs[k.split('|')[1]]).c);
  });
  _briefRigheSel().forEach((i) => {
    const r = _briefState && _briefState.righe[parseInt(i)];
    if (r) cc.push(r.col || '');
  });
  const cur = cc.length && cc.every((x) => x === cc[0]) ? cc[0] : '__misto__';
  b.querySelectorAll('[data-c]').forEach((s) => {
    const on = s.dataset.c === cur;
    s.style.outline = on ? '2.5px solid #1a4a7a' : 'none';
    s.style.outlineOffset = on ? '1px' : '0';
  });
  b.style.display = 'block';
}
// SEMPLICE come nel piano: clicchi le righe per MARCARLE (bordo arancione),
// poi scegli il colore in alto e si applica alle righe marcate
function _briefRigheSel() {
  if (!window._briefSelSet) window._briefSelSet = new Set();
  return window._briefSelSet;
}
function _briefCelleSel() {
  if (!window._briefCelleSet) window._briefCelleSet = new Set();
  return window._briefCelleSet;
}
function _briefSelPulisci() {
  _briefRigheSel().clear();
  _briefCelleSel().clear();
  document.querySelectorAll('.brief-riga-sel').forEach((x) => x.classList.remove('brief-riga-sel'));
  document.querySelectorAll('.brief-cella-sel').forEach((x) => x.classList.remove('brief-cella-sel'));
}
function _briefSelezioneBind() {
  if (window._briefSelBound) return;
  window._briefSelBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('select, textarea, button, a, span[onclick], #brief-colori-bar')) return;
    const tr = e.target.closest('tr[data-bidx]');
    if (!tr) {
      // click fuori dal briefing: deseleziona tutto (gli input di altre
      // pagine non c'entrano con la selezione)
      if (e.target.closest('input')) return;
      if (_briefRigheSel().size || _briefCelleSel().size) _briefSelPulisci();
      return;
    }
    if (!puoGestireBriefing()) return;
    // come Excel: il click semplice seleziona SOLO quella cella o riga,
    // con Ctrl (o Cmd) si aggiunge o toglie dalla selezione
    const multi = e.ctrlKey || e.metaKey;
    const td = e.target.closest('td[data-campo]');
    if (td && e.target.closest('input')) {
      const selC = _briefCelleSel();
      const k = tr.dataset.bidx + '|' + td.dataset.campo;
      if (multi && selC.has(k)) {
        selC.delete(k);
        td.classList.remove('brief-cella-sel');
        return;
      }
      if (!multi) _briefSelPulisci();
      selC.add(k);
      td.classList.add('brief-cella-sel');
      return;
    }
    if (e.target.closest('input')) return;
    const sel = _briefRigheSel();
    const i = tr.dataset.bidx;
    if (multi && sel.has(i)) {
      sel.delete(i);
      tr.classList.remove('brief-riga-sel');
      return;
    }
    if (!multi) _briefSelPulisci();
    sel.add(i);
    tr.classList.add('brief-riga-sel');
  });
}
async function briefColoreApplica(col) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe da colorare, poi scegli il colore');
    return;
  }
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC.c = col || '';
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)].col = col || null;
      n++;
    }
  });
  _briefSelPulisci();
  _colUltimoSet(col || '');
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast(col ? 'Colore applicato (' + n + ')' : 'Colore tolto (' + n + ')');
  renderPiano();
}
// GRASSETTO / CORSIVO come Excel: celle marcate (o righe intere); se tutto
// il selezionato ha gia' il formato lo toglie, altrimenti lo applica
async function briefFormatoApplica(f) {
  const b = document.getElementById('brief-colori-bar');
  if (b) b.style.display = 'none';
  if (!puoGestireBriefing() || !_briefState) return;
  const sel = _briefRigheSel();
  const selC = _briefCelleSel();
  if (!sel.size && !selC.size) {
    toast('Prima clicca le celle o le righe, poi scegli il formato');
    return;
  }
  const prop = f === 'b' ? 'bold' : 'ital';
  let tutte = true;
  selC.forEach((k) => {
    const r = _briefState.righe[parseInt(k.split('|')[0])];
    if (r && !_stileCella(r.cs && r.cs[k.split('|')[1]])[f]) tutte = false;
  });
  sel.forEach((i) => {
    const r = _briefState.righe[parseInt(i)];
    if (r && !r[prop]) tutte = false;
  });
  const on = !tutte;
  let n = 0;
  selC.forEach((k) => {
    const i = k.split('|')[0];
    const campo = k.split('|')[1];
    const r = _briefState.righe[parseInt(i)];
    if (!r) return;
    r.cs = r.cs || {};
    const stC = _stileCella(r.cs[campo]);
    stC[f] = on;
    const s = _stileStr(stC);
    if (s) r.cs[campo] = s;
    else delete r.cs[campo];
    n++;
  });
  sel.forEach((i) => {
    if (_briefState.righe[parseInt(i)]) {
      _briefState.righe[parseInt(i)][prop] = on;
      n++;
    }
  });
  _briefSelPulisci();
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  toast((f === 'b' ? 'Grassetto' : 'Corsivo') + (on ? ' applicato (' : ' tolto (') + n + ')');
  renderPiano();
}
async function briefMuoviRiga(i, delta) {
  if (!_briefState || !puoGestireBriefing()) return;
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
  if (!_briefState || !puoGestireBriefing()) return;
  _briefState.righe.splice(i, 1);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// RICALCOLO dei soli numeri cassa su un briefing gia' salvato: si usa
// quando i CD di ieri sono stati cambiati a mano e la rotazione di oggi
// deve seguire. Le righe (nomi, turni, orari, colori) restano intatte.
async function briefAggiornaCd() {
  if (!_briefState || !puoGestireBriefing() || _briefIsValet()) return;
  if (
    !confirm(
      'Ricalcolo i numeri cassa di questo briefing con la rotazione aggiornata (chi ha chiuso ieri riapre oggi)?\n\nI nomi e i turni restano come sono; solo la colonna CD viene riassegnata.',
    )
  )
    return;
  _briefState.righe.forEach((r) => {
    r.cd = '';
  });
  await _briefAssegnaCd(_briefState.righe, _briefData);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  logAzione('Briefing: numeri cassa ricalcolati', _briefData);
  toast('Numeri cassa aggiornati');
  renderPiano();
}
async function briefCompila() {
  if (!_briefState || !puoGestireBriefing()) return;
  if (_briefState.righe.length && !confirm('Sostituisco le righe attuali con i turni del piano di ' + _briefData + '?'))
    return;
  _briefState.righe = _briefComponi(_briefState.pianoRighe);
  await _briefAggiungiScoperti(_briefState.righe, _briefData);
  if (!_briefIsValet() && _pianoReparto() === 'slots') await _briefAssegnaCd(_briefState.righe, _briefData);
  clearTimeout(_briefSaveTimer);
  await briefSalvaBriefing();
  renderPiano();
}
// Card di configurazione delle evidenziazioni: quale colore messo nel PIANO
// diventa quale colore sul BRIEFING, con un'etichetta che dice cosa significa
function _briefRenderEvidCard() {
  if (!puoGestireBriefing()) return '';
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep);
  const opz = (sel, cb) =>
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<option value="' +
        c +
        '"' +
        (String(sel).toUpperCase() === c.toUpperCase() ? ' selected' : '') +
        ' style="background:' +
        c +
        '">' +
        c +
        '</option>',
    ).join('');
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Evidenziazioni dal piano · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:12px 14px">' +
    '<p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Quando una cella del piano ha un colore, sul briefing il nome di quella persona si evidenzia. Qui si decide <b>con quale colore</b> e <b>che cosa significa</b>: per esempio nel valet il coordinatore si segna in rosso sul piano e sul foglio del briefing appare in verde.</p>';
  if (!lista.length)
    h += '<p style="font-size:.85rem;color:var(--muted)">Nessuna evidenziazione configurata per questo settore.</p>';
  lista.forEach((ev, i) => {
    h +=
      '<div class="tipo-item"><span style="font-size:.85rem">nel piano</span> <select onchange="briefEvidSalva(' +
      i +
      ',\'da\',this.value)" style="padding:3px;background:' +
      escP(ev.da || '') +
      '">' +
      opz(ev.da) +
      '</select> <span style="font-size:.85rem">sul briefing diventa</span> <select onchange="briefEvidSalva(' +
      i +
      ',\'a\',this.value)" style="padding:3px;background:' +
      escP(ev.a || '') +
      '">' +
      opz(ev.a) +
      '</select> <input type="text" value="' +
      escP(ev.label || '') +
      '" placeholder="Significato (es. Coordinatore)" onchange="briefEvidSalva(' +
      i +
      ',\'label\',this.value)" style="flex:1;min-width:150px;padding:4px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"> <button class="btn-del-tipo" onclick="briefEvidRimuovi(' +
      i +
      ')">Rimuovi</button></div>';
  });
  h +=
    '<button class="btn-add-tipo" style="margin-top:8px" onclick="briefEvidAggiungi()">+ Aggiungi evidenziazione</button>';
  h += '</div></div>';
  return h;
}
async function _briefEvidPersisti(rep, lista) {
  const cfg = window._briefEvidCfg || {};
  cfg[rep] = lista;
  window._briefEvidCfg = cfg;
  await setImp('brief_evidenziazioni', JSON.stringify(cfg));
}
async function briefEvidAggiungi() {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  lista.push({ da: PIANO_COLORI_CELLA[0], a: PIANO_COLORI_CELLA[3], label: '' });
  await _briefEvidPersisti(rep, lista);
  toast('Evidenziazione aggiunta');
  renderPiano();
}
async function briefEvidSalva(i, campo, val) {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  if (!lista[i]) return;
  lista[i][campo] = String(val || '').trim();
  await _briefEvidPersisti(rep, lista);
  logAzione('Briefing: evidenziazione', rep + ' ' + (lista[i].label || '') + ' ' + lista[i].da + ' -> ' + lista[i].a);
  toast('Evidenziazione aggiornata');
  renderPiano();
}
async function briefEvidRimuovi(i) {
  if (!puoGestireBriefing()) return;
  const rep = _pianoReparto();
  const lista = _briefEvidenziazioni(rep).slice();
  if (!lista[i]) return;
  if (!confirm('Rimuovere questa evidenziazione?')) return;
  lista.splice(i, 1);
  await _briefEvidPersisti(rep, lista);
  toast('Evidenziazione rimossa');
  renderPiano();
}
function _briefRenderPauseCard() {
  let h =
    '<div class="main-card" style="margin-top:14px"><div class="card-header">Pause · ' +
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
// CORSI (CS, LRD, ANTINCENDIO...) · pianificatore: scegli codice,
// data, orario e partecipanti; le sigle finiscono da sole nel piano
// ============================================================
function _corsiLista() {
  const lista = Array.isArray(window._pianoCorsiLista) ? window._pianoCorsiLista : ['CS', 'LRD', 'ANTINCENDIO'];
  return lista
    .map((cod) => {
      const info = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod && x.attivo !== false);
      return info ? { codice: info.codice, descrizione: info.descrizione || '', ore: info.ore } : null;
    })
    .filter(Boolean);
}
// orario del corso aggiornabile anche dagli operatori (è solo il riferimento
// proposto alla prossima pianificazione, non tocca il piano)
async function corsoOrarioRapido(cod, inizio, fine) {
  const cur = ((window._pianoCorsiOrari || {})[cod] || '').split('-');
  const oi = inizio != null ? inizio : cur[0] || '';
  const of2 = fine != null ? fine : cur[1] || '';
  window._pianoCorsiOrari = window._pianoCorsiOrari || {};
  window._pianoCorsiOrari[cod] = oi && of2 ? oi + '-' + of2 : oi || of2 || '';
  try {
    await setImp('piano_corsi_orari', JSON.stringify(window._pianoCorsiOrari));
    logAzione('Corsi', cod + ' orario aggiornato: ' + window._pianoCorsiOrari[cod]);
    toast('Orario corso ' + cod + ' salvato');
  } catch (e) {
    toast('Errore salvataggio orario');
  }
}
async function _corsiSalvaLista() {
  await setImp('piano_corsi_lista', window._pianoCorsiLista.join(','));
}
async function corsoAggiungi() {
  if (!isAdmin()) return;
  const cod = ((document.getElementById('corso-nuovo-cod') || {}).value || '').trim().toUpperCase();
  const desc = ((document.getElementById('corso-nuovo-desc') || {}).value || '').trim();
  const ore = parseFloat((document.getElementById('corso-nuovo-ore') || {}).value) || 0;
  if (!cod) {
    toast('Inserisci la sigla del corso');
    return;
  }
  if ((window._pianoCorsiLista || []).includes(cod)) {
    toast('Corso già in lista');
    return;
  }
  try {
    const esiste = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod);
    if (!esiste) {
      const nuovo = await secPost('piano_codici', {
        codice: cod,
        descrizione: desc || 'Corso ' + cod,
        ore: ore,
        scala_percentuale: false,
        protetto: false,
        is_riposo: false,
        attivo: true,
        richiede_orario: false,
      });
      if (nuovo && nuovo[0]) pianoCodiciCache.push(nuovo[0]);
    } else if (desc) {
      await secPatch('piano_codici', 'id=eq.' + esiste.id, { descrizione: desc });
      esiste.descrizione = desc;
    }
    window._pianoCorsiLista = [...(window._pianoCorsiLista || []), cod];
    await _corsiSalvaLista();
    logAzione('Corsi', 'Aggiunto corso ' + cod + ' (' + ore + 'h)');
    toast('Corso ' + cod + ' aggiunto');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta corso');
  }
}
async function corsoRinomina(cod, desc) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod.toUpperCase());
  if (!c) return;
  try {
    await secPatch('piano_codici', 'id=eq.' + c.id, { descrizione: (desc || '').trim() });
    c.descrizione = (desc || '').trim();
    logAzione('Corsi', cod + ' rinominato: ' + desc);
    toast('Descrizione salvata');
  } catch (e) {
    toast('Errore salvataggio');
  }
}
async function corsoOre(cod, ore) {
  if (!isAdmin()) return;
  const c = pianoCodiciCache.find((x) => x.codice.toUpperCase() === cod.toUpperCase());
  if (!c) return;
  try {
    await secPatch('piano_codici', 'id=eq.' + c.id, { ore: parseFloat(ore) || 0 });
    c.ore = parseFloat(ore) || 0;
    logAzione('Corsi', cod + ' ore → ' + ore);
    toast('Ore corso salvate');
  } catch (e) {
    toast('Errore salvataggio');
  }
}
async function corsoRimuovi(cod) {
  if (!isAdmin()) return;
  if (!confirm('Togliere ' + cod + ' dalla lista corsi? (il codice resta tra i codici del piano)')) return;
  window._pianoCorsiLista = (window._pianoCorsiLista || []).filter((x) => x !== cod);
  await _corsiSalvaLista();
  logAzione('Corsi', 'Rimosso dalla lista: ' + cod);
  renderPiano();
}
function _renderPianoCorsiCard() {
  const corsi = _corsiLista();
  const puoCorsi = puoGestirePiano() || (typeof puoModificare === 'function' && puoModificare('gestione_corsi'));
  // operatori senza permesso corsi: elenco in sola lettura (orario aggiornabile)
  if (!puoCorsi) {
    let hRO =
      '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi</div><div style="padding:12px 14px"><table class="piano-table" style="min-width:420px;font-size:.85rem"><thead><tr><th>Sigla</th><th style="text-align:left">Descrizione</th><th>Ore</th><th>Orario</th></tr></thead><tbody>';
    corsi.forEach((c) => {
      const orario = ((window._pianoCorsiOrari || {})[c.codice] || '').split('-');
      hRO +=
        '<tr><td style="font-weight:700">' +
        escP(c.codice) +
        '</td><td style="text-align:left">' +
        escP(c.descrizione) +
        '</td><td>' +
        (c.ore || 0) +
        '</td><td style="white-space:nowrap"><input type="time" value="' +
        (orario[0] || '') +
        '" onchange="corsoOrarioRapido(\'' +
        c.codice +
        '\',this.value,null)" style="padding:2px 4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"> - <input type="time" value="' +
        (orario[1] || '') +
        '" onchange="corsoOrarioRapido(\'' +
        c.codice +
        '\',null,this.value)" style="padding:2px 4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td></tr>';
    });
    hRO +=
      '</tbody></table><p style="font-size:.82rem;color:var(--muted);margin-top:6px">L&#39;orario del corso cambia di volta in volta: qui puoi aggiornarlo, viene proposto alla prossima pianificazione.</p></div></div>';
    return hRO;
  }
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Corsi · inserimento automatico nel piano</div><div style="padding:12px 14px">';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-bottom:10px">Scegli il corso, la data, l&#39;orario e i partecipanti: la sigla viene scritta da sola nelle loro celle del piano (protetta, con orario e ore contate).</p>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">';
  h +=
    '<div class="field"><label>Corso</label><select id="corso-cod" style="padding:8px" onchange="corsoPrefillOrari()">' +
    corsi.map((c) => '<option' + (c.codice === 'CS' ? ' selected' : '') + '>' + escP(c.codice) + '</option>').join('') +
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
    '<button class="btn-export" style="font-size:.82rem;padding:4px 10px" title="La prossima volta questo corso partirà con questo orario" onclick="corsoSalvaOrarioDefault()">Salva orario predefinito</button>';
  h += '</div>';
  h +=
    '<div style="margin-bottom:6px;font-size:.82rem"><b>Partecipanti</b> · <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=true)">tutti</span> / <span style="cursor:pointer;color:#1a4a7a;text-decoration:underline" onclick="document.querySelectorAll(\'.corso-part\').forEach(c=>c.checked=false)">nessuno</span></div>';
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
  // gestione della LISTA corsi (admin): aggiungi sigla, rinomina, rimuovi
  if (isAdmin()) {
    h +=
      '<p style="font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:16px 0 6px">Gestisci corsi (admin)</p>';
    corsi.forEach((c) => {
      h +=
        '<div class="tipo-item"><div class="tipo-item-name" style="min-width:90px;font-weight:700">' +
        escP(c.codice) +
        '</div><input type="text" value="' +
        escP(c.descrizione) +
        '" placeholder="descrizione" onchange="corsoRinomina(\'' +
        c.codice +
        '\',this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><input type="number" step="0.5" min="0" value="' +
        (c.ore || 0) +
        '" title="Ore conteggiate per il corso" onchange="corsoOre(\'' +
        c.codice +
        '\',this.value)" style="width:70px;padding:5px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"><button class="btn-del-tipo" onclick="corsoRimuovi(\'' +
        c.codice +
        '\')">Rimuovi</button></div>';
    });
    h +=
      '<div class="add-tipo-row" style="margin:6px 0 0"><div class="field"><label>Nuova sigla corso</label><input type="text" id="corso-nuovo-cod" placeholder="Es: PRIMO SOCCORSO" maxlength="14" style="width:150px"></div><div class="field"><label>Descrizione</label><input type="text" id="corso-nuovo-desc" placeholder="descrizione"></div><div class="field"><label>Ore</label><input type="number" id="corso-nuovo-ore" value="2" step="0.5" min="0" style="width:70px"></div><button class="btn-add-tipo" onclick="corsoAggiungi()">+ Aggiungi</button></div>';
    h +=
      '<p style="font-size:.82rem;color:var(--muted);margin:4px 0 0">Rimuovere un corso lo toglie solo da questa lista: il codice resta tra i codici del piano e le celle gi&agrave; inserite non cambiano.</p>';
  }
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
  if (!puoGestirePiano() && !(typeof puoModificare === 'function' && puoModificare('gestione_corsi'))) return;
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
      cod + ' ' + data + ' · ' + inseriti + ' celle, ' + annotati + ' annotati sul turno',
    );
    toast('Corso ' + cod + ': ' + inseriti + ' celle' + (annotati ? ' + ' + annotati + ' annotati sul turno' : ''));
    if (_pianoMeseSel === data.substring(0, 7)) renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore inserimento corso');
  }
}

// ============================================================
// COPIA / INCOLLA a blocchi · Shift+click su due celle = blocco
// (piano o fabbisogno), tasto destro = Copia / Incolla. L'incolla
// accetta anche celle copiate da Excel (formato tab-separato).
// ============================================================
window._pianoBlocco = null; // {tab, t1, t2, completo}
// BARRA DI CALCOLO (come la barra di stato di Excel): con una selezione
// attiva mostra in basso Conteggio, Somma e Media dei valori selezionati;
// per le celle coi turni la somma usa le ORE del turno
function _pianoStatSelezione() {
  let box = document.getElementById('piano-statbar');
  const sel = [
    ...document.querySelectorAll('#piano-content .blocco-sel, #piano-content .col-selected, #piano-content .tot-sel'),
  ];
  const valori = [];
  let piene = 0;
  sel.forEach((td) => {
    const txt = (td.textContent || '').trim();
    if (!txt) return;
    piene++;
    const num = parseFloat(txt.replace(',', '.'));
    if (!isNaN(num) && /^[-+]?[0-9.,]+$/.test(txt)) {
      valori.push(num);
    } else {
      const t = _pianoTurnoInfo(txt.toUpperCase());
      if (t && parseFloat(t.durata_ore)) valori.push(parseFloat(t.durata_ore));
    }
  });
  if (!sel.length) {
    if (box) box.style.display = 'none';
    return;
  }
  if (!box) {
    box = document.createElement('div');
    box.id = 'piano-statbar';
    document.body.appendChild(box);
  }
  const somma = Math.round(valori.reduce((a, b) => a + b, 0) * 100) / 100;
  const media = valori.length ? Math.round((somma / valori.length) * 100) / 100 : 0;
  box.innerHTML =
    '<b>' +
    sel.length +
    '</b> celle (' +
    piene +
    ' piene)' +
    (valori.length
      ? ' &nbsp;&middot;&nbsp; Somma <b>' + somma + '</b> &nbsp;&middot;&nbsp; Media <b>' + media + '</b>'
      : '') +
    (valori.length > 1
      ? ' &nbsp;&middot;&nbsp; Min <b>' +
        Math.min.apply(null, valori) +
        '</b> &nbsp;&middot;&nbsp; Max <b>' +
        Math.max.apply(null, valori) +
        '</b>'
      : '');
  box.style.display = 'block';
}
// ================= ANNULLA / RIPRISTINA (stile Excel) =================
// Prima di ogni modifica al piano si salva una copia del mese (dalla memoria,
// costo zero): le frecce nella barra riportano il mese a com'era, avanti e
// indietro fino a 15 passi. Vale per il mese e il settore correnti.
function _pianoStatoMese() {
  const rep = _pianoReparto();
  return {
    ym: _pianoMeseSel,
    rep: rep,
    righe: (_pianoRighe || [])
      .filter((r) => (r.reparto_dip || 'slots') === rep)
      .map((r) => ({
        collaboratore: r.collaboratore,
        data: r.data,
        codice: r.codice,
        protetto: r.protetto,
        generato: r.generato,
        ora_inizio: r.ora_inizio,
        ora_fine: r.ora_fine,
        commento: r.commento,
        colore: r.colore,
        reparto_dip: rep,
      })),
  };
}
function _pianoUndoSnap(label) {
  try {
    const st = _pianoStatoMese();
    st.label = label;
    window._pianoUndo = window._pianoUndo || [];
    window._pianoUndo.push(st);
    if (window._pianoUndo.length > 15) window._pianoUndo.shift();
    window._pianoRedo = [];
    // prima modifica di questo mese+settore nella sessione: si conserva lo
    // stato di partenza per "Annulla tutto" (non limitato ai 15 passi)
    window._pianoSessSnap = window._pianoSessSnap || {};
    const k = st.ym + '|' + st.rep;
    if (!window._pianoSessSnap[k])
      window._pianoSessSnap[k] = { ym: st.ym, rep: st.rep, righe: st.righe, label: 'inizio sessione', n: 0 };
    window._pianoSessSnap[k].n++;
    _pianoSalvatoFlash();
  } catch (e) {}
}
// Feedback visivo del salvataggio automatico: "Salvato" per qualche secondo
function _pianoSalvatoFlash() {
  clearTimeout(window._pasT);
  window._pasT = setTimeout(() => {
    const el = document.getElementById('piano-autosave');
    if (!el) return;
    el.textContent = 'Salvato \u2713';
    el.classList.add('pas-on');
    clearTimeout(window._pasT2);
    window._pasT2 = setTimeout(() => {
      const el2 = document.getElementById('piano-autosave');
      if (!el2) return;
      el2.textContent = 'Salvataggio automatico';
      el2.classList.remove('pas-on');
    }, 2600);
  }, 900);
}
async function _pianoRipristinaStato(st) {
  const fine = st.ym + '-' + String(_pianoUltimoGiorno(st.ym)).padStart(2, '0');
  await secDel('piano', 'data=gte.' + st.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + st.rep);
  for (let i = 0; i < st.righe.length; i += 2000) {
    await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: st.righe.slice(i, i + 2000) });
  }
}
function _pianoMappaRighe(rows, rep) {
  return rows.map((r) => ({
    collaboratore: r.collaboratore,
    data: r.data,
    codice: r.codice,
    protetto: r.protetto,
    generato: r.generato,
    ora_inizio: r.ora_inizio,
    ora_fine: r.ora_fine,
    commento: r.commento,
    colore: r.colore,
    reparto_dip: rep,
  }));
}
async function pianoAnnulla() {
  const u = window._pianoUndo || [];
  if (!u.length) {
    toast('Niente da annullare');
    return;
  }
  if (!puoGestirePiano()) return;
  const st = u.pop();
  // torna al mese/settore dell'operazione se nel frattempo sei altrove
  _pianoMeseSel = st.ym;
  if (st.rep !== currentReparto) _pianoRepartoSel = st.rep;
  else _pianoRepartoSel = _pianoRepartoSel === null ? null : st.rep;
  // lo stato corrente (dal DB) diventa il "Ripristina"
  try {
    const fine = st.ym + '-' + String(_pianoUltimoGiorno(st.ym)).padStart(2, '0');
    const cur =
      (await secGet(
        'piano?data=gte.' + st.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + st.rep + '&limit=8000',
      )) || [];
    window._pianoRedo = window._pianoRedo || [];
    window._pianoRedo.push({ ym: st.ym, rep: st.rep, label: st.label, righe: _pianoMappaRighe(cur, st.rep) });
  } catch (e) {}
  await _pianoRipristinaStato(st);
  logAzione('Piano: annullato', st.label + ' (' + st.ym + ')');
  toast('Annullato: ' + st.label);
  renderPiano();
}
// ANNULLA TUTTO: riporta il mese visualizzato a com'era all'inizio della
// sessione. Il bottone appare SOLO a chi ha fatto modifiche qui (lo stato
// vive nel browser di chi le ha fatte) e sparisce dopo l'uso o al rientro
async function pianoAnnullaTutto() {
  if (!puoGestirePiano()) return;
  const k = _pianoMeseSel + '|' + _pianoReparto();
  const snap = (window._pianoSessSnap || {})[k];
  if (!snap) return;
  if (
    !confirm(
      'Riporto il piano di ' +
        snap.ym +
        ' (' +
        repartoLabel(snap.rep) +
        ") a com'era all'inizio di questa sessione, annullando le tue " +
        snap.n +
        ' operazioni.\n\nATTENZIONE: se un altro operatore ha modificato questo stesso mese nel frattempo, anche le sue modifiche verranno sovrascritte.\n\nConfermare?',
    )
  )
    return;
  // lo stato attuale (dal DB) finisce sulla freccia Ripristina: si puo' tornare avanti
  try {
    const fine = snap.ym + '-' + String(_pianoUltimoGiorno(snap.ym)).padStart(2, '0');
    const cur =
      (await secGet(
        'piano?data=gte.' + snap.ym + '-01&data=lte.' + fine + '&reparto_dip=eq.' + snap.rep + '&limit=8000',
      )) || [];
    window._pianoRedo = window._pianoRedo || [];
    window._pianoRedo.push({
      ym: snap.ym,
      rep: snap.rep,
      label: 'annulla tutte le modifiche',
      righe: _pianoMappaRighe(cur, snap.rep),
    });
  } catch (e) {}
  await _pianoRipristinaStato(snap);
  window._pianoUndo = (window._pianoUndo || []).filter((s) => !(s.ym === snap.ym && s.rep === snap.rep));
  delete window._pianoSessSnap[k];
  logAzione('Piano: annullate tutte le modifiche della sessione', snap.ym + ' · ' + snap.n + ' operazioni');
  toast('Piano riportato a inizio sessione (' + snap.n + ' operazioni annullate)');
  renderPiano();
}
async function pianoRipristina() {
  const rd = window._pianoRedo || [];
  if (!rd.length) {
    toast('Niente da ripristinare');
    return;
  }
  if (!puoGestirePiano()) return;
  const st = rd.pop();
  _pianoMeseSel = st.ym;
  if (st.rep !== currentReparto) _pianoRepartoSel = st.rep;
  // lo stato corrente torna sull'Annulla (senza svuotare il redo)
  try {
    const prima = _pianoStatoMese();
    prima.label = st.label;
    window._pianoUndo = window._pianoUndo || [];
    window._pianoUndo.push(prima);
  } catch (e) {}
  await _pianoRipristinaStato(st);
  logAzione('Piano: ripristinato', st.label + ' (' + st.ym + ')');
  toast('Ripristinato: ' + st.label);
  renderPiano();
}
// CANC sulla selezione: cancella tutte le celle del blocco (con conferma)
async function pianoCancellaSelezione() {
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano' || !puoGestirePiano()) return;
  const celle = _pianoBloccoCelle();
  const daCanc = [];
  celle.forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !tr.dataset.nome || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) daCanc.push(r);
    }),
  );
  if (!daCanc.length) {
    toast('Nessuna cella piena nella selezione');
    return;
  }
  const prot = daCanc.filter((r) => r.protetto).length;
  if (
    !confirm(
      'Cancellare ' + daCanc.length + ' celle selezionate' + (prot ? ' (di cui ' + prot + ' protette)' : '') + '?',
    )
  )
    return;
  _pianoUndoSnap('cancellazione di ' + daCanc.length + ' celle');
  try {
    const ids = daCanc.map((r) => r.id);
    // il canale sicuro accetta solo filtri semplici: cancellazione per id, a gruppi
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map((idr) => secDel('piano', 'id=eq.' + idr)));
    }
    _pianoRighe = _pianoRighe.filter((r) => !ids.includes(r.id));
    logAzione('Piano: celle cancellate da selezione', daCanc.length + ' celle (' + _pianoMeseSel + ')');
    toast('Cancellate ' + daCanc.length + ' celle');
    // tra le celle cancellate c'erano malattie: proposta di aggiornare il
    // Diario, una domanda per collaboratore con l'elenco dei giorni
    const perNomeM = {};
    daCanc.forEach((r) => {
      if (r.codice === 'M' || r.codice === 'M1')
        (perNomeM[r.collaboratore] = perNomeM[r.collaboratore] || []).push(r.data);
    });
    for (const nomeM of Object.keys(perNomeM)) await _pianoMalattiaViaDiario(nomeM, perNomeM[nomeM]);
    renderPiano();
  } catch (e) {
    toast('Errore cancellazione');
  }
}
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
// Stile di una cella in un'unica stringa ("#RRGGBB|bi": colore + flag
// b=grassetto i=corsivo), salvata dov'era il solo colore: nessun campo nuovo
function _stileCella(s) {
  const out = { c: '', b: false, i: false, t: '' };
  if (!s) return out;
  const parti = String(s).split('|');
  if (parti[0] && parti[0][0] === '#') out.c = parti[0];
  const f = parti[1] || '';
  out.b = f.indexOf('b') >= 0;
  out.i = f.indexOf('i') >= 0;
  if (parti[2] && parti[2][0] === '#') out.t = parti[2];
  return out;
}
function _stileStr(st) {
  const f = (st.b ? 'b' : '') + (st.i ? 'i' : '');
  if (!st.c && !f && !st.t) return null;
  return (st.c || '') + '|' + f + (st.t ? '|' + st.t : '');
}
// Ultimo colore usato (secchiello stile Excel, condiviso piano+briefing).
// Ricorda anche "nessuno" ('' = barretta bianca barrata, il bottone toglie il colore)
function _colUltimo() {
  const v = localStorage.getItem('piano_col_ult');
  return v === null ? PIANO_COLORI_CELLA[0] : v;
}
function _colChipPaint(el, c) {
  el.style.background = c || '#fff';
  el.style.backgroundImage = c ? 'none' : 'linear-gradient(to top right, #fff 44%, #c0392b 47%, #c0392b 53%, #fff 56%)';
}
function _colUltimoSet(c) {
  localStorage.setItem('piano_col_ult', c || '');
  document.querySelectorAll('.col-ultimo-chip').forEach((el) => _colChipPaint(el, c));
}
function _colChipHtml() {
  const c = _colUltimo();
  return (
    '<span class="col-ultimo-chip" style="display:block;width:100%;height:4px;border:1px solid #999;border-radius:2px;background:' +
    (c || '#fff') +
    (c ? '' : ';background-image:linear-gradient(to top right, #fff 44%, #c0392b 47%, #c0392b 53%, #fff 56%)') +
    '"></span>'
  );
}
const PIANO_COLORI_CELLA = ['#FF6B6B', '#FFB86B', '#FFF06B', '#95E06C', '#6BCBFF', '#B39DDB', '#F48FB1', '#D7CCC8'];
function _pianoColoriBarHtml() {
  // secchiello stile Excel: il bottone applica subito l'ultimo colore usato
  // (chip colorata), la freccia apre la palette con formato G/C
  return (
    '<span style="position:relative;display:inline-flex;align-items:center">' +
    '<button class="btn-export pbar-btn pbar-color" title="Applica alle celle selezionate il colore mostrato nella barretta (per cambiarlo usa la freccia accanto)" onclick="event.stopPropagation();pianoApplicaColore(_colUltimo() || null)"><span style="display:flex;flex-direction:column;gap:3px;min-width:44px">Colora' +
    _colChipHtml() +
    '</span></button>' +
    '<button class="btn-export pbar-btn pbar-color" style="padding-left:6px;padding-right:6px" title="Scegli un altro colore o il formato (grassetto, corsivo)" onclick="event.stopPropagation();pianoColoriToggle()">&#9662;</button>' +
    '<div id="piano-colori-pop" style="display:none;position:absolute;top:110%;left:0;z-index:1000;background:var(--paper);border:1px solid var(--line);border-radius:4px;padding:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">' +
    PIANO_COLORI_CELLA.map(
      (c) =>
        '<span data-c="' +
        c +
        '" onclick="pianoApplicaColore(\'' +
        c +
        '\')" style="display:inline-block;width:22px;height:22px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button data-c="" class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:6px;vertical-align:middle" onclick="pianoApplicaColore(null)">Colore del turno</button>' +
    '<span style="display:inline-block;width:1px;height:20px;background:var(--line);margin:0 8px;vertical-align:middle"></span>' +
    '<button class="btn-export" style="font-size:.82rem;font-weight:700;padding:2px 10px;vertical-align:middle" title="Grassetto sulle celle selezionate (vista e stampa)" onclick="pianoApplicaFormato(\'b\')">G</button> ' +
    '<button class="btn-export" style="font-size:.82rem;font-style:italic;padding:2px 10px;vertical-align:middle" title="Corsivo sulle celle selezionate (vista e stampa)" onclick="pianoApplicaFormato(\'i\')">C</button>' +
    '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
    '<span style="font-size:.82rem;color:var(--muted);vertical-align:middle;margin-right:4px">Testo:</span>' +
    PIANO_COLORI_TESTO.map(
      (c) =>
        '<span title="Colore del testo" onclick="pianoApplicaColoreTesto(\'' +
        c +
        '\')" style="display:inline-block;width:18px;height:18px;background:' +
        c +
        ';border:1px solid #999;border-radius:3px;margin:2px;cursor:pointer;vertical-align:middle"></span>',
    ).join('') +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 8px;margin-left:4px;vertical-align:middle" onclick="pianoApplicaColoreTesto(null)">Auto</button>' +
    '</div>' +
    '<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--line)">' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Memorizza colore e formato della prima cella selezionata" onclick="pianoCopiaFormato()">Copia formato</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle" title="Applica il formato memorizzato alle celle selezionate" onclick="pianoIncollaFormato()">Incolla formato</button> ' +
    '<button class="btn-export" style="font-size:.82rem;padding:2px 10px;vertical-align:middle;border-color:#c0392b;color:#c0392b" title="Toglie colori, grassetto e corsivo dalle celle selezionate (i turni non cambiano)" onclick="pianoCancellaFormato()">Cancella formato</button>' +
    '</div>' +
    '</div></span>'
  );
}
const PIANO_COLORI_TESTO = ['#000000', '#c0392b', '#1a4a7a', '#2c6e49', '#e67e22', '#8e44ad', '#ffffff'];
// helper comune: righe del piano dentro la selezione corrente della griglia
function _pianoRigheSelezione() {
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') return null;
  const righe = [];
  _pianoBloccoCelle().forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) righe.push(r);
    }),
  );
  return righe;
}
async function _pianoScriviStili(righe, trasforma, label, msg) {
  _pianoUndoSnap(label);
  let fatte = 0;
  try {
    for (const r of righe) {
      const nuovo = trasforma(_stileCella(r.colore));
      if ((r.colore || null) === nuovo) continue;
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
      fatte++;
    }
    logAzione('Piano: ' + label, fatte + ' celle');
    toast(msg.replace('{n}', fatte));
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio formato');
  }
}
async function pianoApplicaColoreTesto(colore) {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima le celle nella griglia');
    return;
  }
  await _pianoScriviStili(
    righe,
    (st) => {
      st.t = colore || '';
      return _stileStr(st);
    },
    colore ? 'colore testo' : 'colore testo tolto',
    colore ? 'Testo colorato su {n} celle' : 'Colore del testo tolto da {n} celle',
  );
}
function pianoCopiaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima la cella da cui copiare il formato');
    return;
  }
  window._pianoFormatoCopiato = righe[0].colore || null;
  const st = _stileCella(window._pianoFormatoCopiato);
  toast(
    'Formato copiato' +
      (st.c || st.b || st.i || st.t
        ? ' (' +
          [st.c ? 'sfondo' : '', st.t ? 'testo' : '', st.b ? 'grassetto' : '', st.i ? 'corsivo' : '']
            .filter(Boolean)
            .join(', ') +
          ')'
        : ' (nessuno: incollandolo si pulisce)'),
  );
}
async function pianoIncollaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  if (window._pianoFormatoCopiato === undefined) {
    toast('Prima usa "Copia formato" su una cella');
    return;
  }
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona le celle a cui applicare il formato');
    return;
  }
  const f = window._pianoFormatoCopiato;
  await _pianoScriviStili(righe, () => f, 'incolla formato', 'Formato applicato a {n} celle');
}
async function pianoCancellaFormato() {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const righe = _pianoRigheSelezione();
  if (!righe || !righe.length) {
    toast('Seleziona prima le celle nella griglia');
    return;
  }
  await _pianoScriviStili(righe, () => null, 'cancella formato', 'Formato tolto da {n} celle');
}
// i pannelli a comparsa (palette colori del piano e del briefing) si
// chiudono cliccando in un punto qualsiasi fuori dal pannello
if (!window._popupCloseBound) {
  window._popupCloseBound = true;
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('piano-colori-pop');
    if (
      pop &&
      pop.style.display !== 'none' &&
      !e.target.closest('#piano-colori-pop') &&
      !e.target.closest('.pbar-color')
    )
      pop.style.display = 'none';
    const bb = document.getElementById('brief-colori-bar');
    if (
      bb &&
      bb.style.display !== 'none' &&
      !e.target.closest('#brief-colori-bar') &&
      !e.target.closest('[onclick*="briefColoriToggle"], [onclick*="briefColoreApplica(_colUltimo"]')
    )
      bb.style.display = 'none';
  });
}
function pianoColoriToggle() {
  const p = document.getElementById('piano-colori-pop');
  if (!p) return;
  if (p.style.display !== 'none') {
    p.style.display = 'none';
    return;
  }
  // all'apertura si evidenzia il colore che le celle selezionate hanno adesso
  const cc = [];
  const b = window._pianoBlocco;
  if (b && b.completo && b.tab === 'piano') {
    _pianoBloccoCelle().forEach((rigaC) =>
      rigaC.forEach((td) => {
        const tr = td.closest('tr');
        const g = parseInt(td.dataset.g);
        if (!tr || !g) return;
        const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
        const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
        cc.push(r ? _stileCella(r.colore).c : '');
      }),
    );
  }
  const cur = cc.length && cc.every((x) => x === cc[0]) ? cc[0] : '__misto__';
  p.querySelectorAll('[data-c]').forEach((s) => {
    const on = s.dataset.c === cur;
    s.style.outline = on ? '2.5px solid #1a4a7a' : 'none';
    s.style.outlineOffset = on ? '1px' : '0';
  });
  p.style.display = 'block';
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
  _pianoUndoSnap(colore ? 'colore celle' : 'rimozione colore');
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
        const stC = _stileCella(r.colore);
        stC.c = colore || '';
        const nuovo = _stileStr(stC);
        if ((r.colore || null) === nuovo) continue;
        await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
        r.colore = nuovo;
        fatte++;
      }
    }
    _colUltimoSet(colore || '');
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
// GRASSETTO / CORSIVO sulle celle selezionate (come Excel: se tutte le
// celle piene hanno gia' il formato lo toglie, altrimenti lo applica)
async function pianoApplicaFormato(f) {
  const p2 = document.getElementById('piano-colori-pop');
  if (p2) p2.style.display = 'none';
  if (!puoGestirePiano()) return;
  const b = window._pianoBlocco;
  if (!b || !b.completo || b.tab !== 'piano') {
    toast('Seleziona prima le celle nella griglia (click o trascinamento)');
    return;
  }
  const righeSel = [];
  _pianoBloccoCelle().forEach((rigaC) =>
    rigaC.forEach((td) => {
      const tr = td.closest('tr');
      const g = parseInt(td.dataset.g);
      if (!tr || !g) return;
      const dstr = _pianoMeseSel + '-' + String(g).padStart(2, '0');
      const r = _pianoRighe.find((x) => x.collaboratore === tr.dataset.nome && x.data === dstr);
      if (r) righeSel.push(r);
    }),
  );
  if (!righeSel.length) {
    toast('Nessuna cella piena nella selezione');
    return;
  }
  const on = !righeSel.every((r) => _stileCella(r.colore)[f]);
  _pianoUndoSnap(f === 'b' ? 'grassetto celle' : 'corsivo celle');
  try {
    for (const r of righeSel) {
      const stC = _stileCella(r.colore);
      if (stC[f] === on) continue;
      stC[f] = on;
      const nuovo = _stileStr(stC);
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
    }
    logAzione(
      'Piano: formato celle',
      (f === 'b' ? 'grassetto ' : 'corsivo ') + (on ? 'applicato' : 'tolto') + ' su ' + righeSel.length + ' celle',
    );
    toast((f === 'b' ? 'Grassetto' : 'Corsivo') + (on ? ' su ' : ' tolto da ') + righeSel.length + ' celle');
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio formato');
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
  setTimeout(_pianoStatSelezione, 30);
}
function _pianoBloccoPulisci() {
  document.querySelectorAll('#piano-content .tot-sel').forEach((el) => el.classList.remove('tot-sel'));
  document
    .querySelectorAll('.blocco-sel, .bs-t, .bs-b, .bs-l, .bs-r, .blocco-sel-head')
    .forEach((c) => c.classList.remove('blocco-sel', 'bs-t', 'bs-b', 'bs-l', 'bs-r', 'blocco-sel-head'));
  window._pianoBlocco = null;
  setTimeout(_pianoStatSelezione, 30);
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
    if (!e.target.closest('table[data-seltab], #piano-ctx, #piano-colori-pop')) {
      if (window._pianoBlocco) _pianoBloccoPulisci();
    }
    setTimeout(_pianoStatSelezione, 60);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window._pianoBlocco) _pianoBloccoPulisci();
    // CANC/Backspace: cancella le celle selezionate (con conferma)
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      window._pianoBlocco &&
      window._pianoBlocco.completo &&
      window._pianoBlocco.tab === 'piano' &&
      !e.target.closest('input,textarea,select')
    ) {
      e.preventDefault();
      pianoCancellaSelezione();
    }
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
  const estendi = (td) => {
    if (!drag || !td || td.closest('table') !== drag.table) return;
    if (td === drag.start && !drag.moved) return;
    drag.moved = true;
    drag.table.classList.add('sel-noselect');
    _pianoBloccoPulisci();
    window._pianoBlocco = { tab: drag.tab, t1: drag.start, t2: td, completo: true };
    _pianoBloccoEvidenzia();
  };
  document.addEventListener('mouseover', (e) => {
    if (!drag) return;
    estendi(e.target.closest('td[data-g]'));
  });
  // AUTO-SCROLL: trascinando verso il bordo la pagina scorre da sola e la
  // selezione continua (in basso/alto la finestra, a destra/sinistra la griglia)
  let scrollTimer = null;
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    drag.cx = e.clientX;
    drag.cy = e.clientY;
    if (!scrollTimer) {
      scrollTimer = setInterval(() => {
        if (!drag || !drag.moved) return;
        const M = 70;
        let dy = 0;
        if (drag.cy > window.innerHeight - M) dy = 24;
        else if (drag.cy < 130) dy = -24;
        if (dy) window.scrollBy(0, dy);
        const wrap = drag.table.closest('.piano-wrap');
        let dx = 0;
        if (drag.cx > window.innerWidth - M) dx = 24;
        else if (drag.cx < M) dx = -24;
        if (dx && wrap) wrap.scrollLeft += dx;
        if (dy || dx) {
          const sotto = document.elementFromPoint(drag.cx, drag.cy);
          if (sotto) estendi(sotto.closest && sotto.closest('td[data-g]'));
        }
      }, 60);
    }
  });
  // TOTALI (Ore, D, N, OD, OP, SM, YTD): selezione a trascinamento come
  // nella griglia, oltre a click e Ctrl+click. Rettangolo righe x colonne.
  let dragT = null;
  const totCelle = (t) => [...t.querySelectorAll('tbody td[data-tot]')];
  const estendiTot = (td) => {
    if (!dragT || !td || td.closest('table') !== dragT.table) return;
    if (td === dragT.start && !dragT.moved) return;
    dragT.moved = true;
    dragT.table.classList.add('sel-noselect');
    const rIdx = (x) => [...dragT.table.querySelectorAll('tbody tr')].indexOf(x.closest('tr'));
    const r1 = rIdx(dragT.start);
    const r2 = rIdx(td);
    const c1 = parseInt(dragT.start.dataset.tot);
    const c2 = parseInt(td.dataset.tot);
    document.querySelectorAll('#piano-content .tot-sel').forEach((x) => x.classList.remove('tot-sel'));
    totCelle(dragT.table).forEach((x) => {
      const ri = rIdx(x);
      const ci = parseInt(x.dataset.tot);
      if (ri >= Math.min(r1, r2) && ri <= Math.max(r1, r2) && ci >= Math.min(c1, c2) && ci <= Math.max(c1, c2))
        x.classList.add('tot-sel');
    });
    _pianoStatSelezione();
  };
  document.addEventListener('mousedown', (e) => {
    window._pianoTotDragged = false;
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const td = e.target.closest('td[data-tot]');
    if (!td) return;
    e.preventDefault();
    dragT = { table: td.closest('table'), start: td, moved: false };
  });
  document.addEventListener('mouseover', (e) => {
    if (!dragT) return;
    estendiTot(e.target.closest('td[data-tot]'));
  });
  // trascinando verso il bordo la pagina scorre da sola, come nella griglia
  let scrollTimerT = null;
  document.addEventListener('mousemove', (e) => {
    if (!dragT) return;
    dragT.cx = e.clientX;
    dragT.cy = e.clientY;
    if (!scrollTimerT) {
      scrollTimerT = setInterval(() => {
        if (!dragT || !dragT.moved) return;
        const M = 70;
        let dy = 0;
        if (dragT.cy > window.innerHeight - M) dy = 24;
        else if (dragT.cy < 130) dy = -24;
        if (dy) window.scrollBy(0, dy);
        const wrap = dragT.table.closest('.piano-wrap');
        let dx = 0;
        if (dragT.cx > window.innerWidth - M) dx = 24;
        else if (dragT.cx < M) dx = -24;
        if (dx && wrap) wrap.scrollLeft += dx;
        if (dy || dx) {
          const sotto = document.elementFromPoint(dragT.cx, dragT.cy);
          if (sotto && sotto.closest) estendiTot(sotto.closest('td[data-tot]'));
        }
      }, 60);
    }
  });
  document.addEventListener('mouseup', () => {
    if (scrollTimerT) {
      clearInterval(scrollTimerT);
      scrollTimerT = null;
    }
    if (!dragT) return;
    if (dragT.moved) {
      dragT.table.classList.remove('sel-noselect');
      // il click di rilascio non deve ridurre la selezione a una sola cella
      window._pianoTotDragged = true;
    }
    dragT = null;
  });
  document.addEventListener('mouseup', () => {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
    }
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
// ===== SELEZIONE MULTIPLA SPARSA (Ctrl+click su nomi e giorni) =====
// Shift+click prende un intervallo (gia' presente); Ctrl/Cmd+click aggiunge
// righe o giorni anche non vicini, e compare la barra con le azioni in blocco.
function _pianoSparse() {
  if (!window._pianoSparseSel) window._pianoSparseSel = { nomi: [], giorni: [] };
  return window._pianoSparseSel;
}
function _pianoSparseToggleNome(nome, riga) {
  const s = _pianoSparse();
  const i = s.nomi.indexOf(nome);
  if (i >= 0) {
    s.nomi.splice(i, 1);
    if (riga) riga.classList.remove('row-selected');
  } else {
    s.nomi.push(nome);
    if (riga) riga.classList.add('row-selected');
  }
  _pianoSparseBar();
}
function _pianoSparseToggleGiorno(g) {
  const s = _pianoSparse();
  const i = s.giorni.indexOf(g);
  if (i >= 0) s.giorni.splice(i, 1);
  else s.giorni.push(g);
  document.querySelectorAll('#piano-content table[data-seltab]').forEach((t) => {
    const th = t.querySelector('thead th[data-g="' + g + '"]');
    if (th) th.classList.toggle('col-selected-header', i < 0);
    t.querySelectorAll('tbody td[data-g="' + g + '"]').forEach((c) => c.classList.toggle('col-selected', i < 0));
  });
  _pianoSparseBar();
}
function _pianoSparseBar() {
  const s = _pianoSparse();
  let bar = document.getElementById('piano-multibar');
  if (!s.nomi.length && !s.giorni.length) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'piano-multibar';
    document.body.appendChild(bar);
  }
  const b = (label, onclick, rosso) =>
    '<button class="btn-export" style="font-size:.82rem;padding:4px 12px' +
    (rosso ? ';border-color:#c0392b;color:#c0392b' : '') +
    '" onclick="' +
    onclick +
    '">' +
    label +
    '</button>';
  let h = '';
  if (s.nomi.length) {
    h +=
      '<b>' +
      s.nomi.length +
      (s.nomi.length === 1 ? ' collaboratore' : ' collaboratori') +
      '</b> ' +
      b('Nascondi', 'pianoSparseNascondi()') +
      b('Stampa PDF', 'pianoSparseStampa()') +
      b('Colora celle', 'pianoSparseColora()');
  }
  if (s.giorni.length) {
    h +=
      (s.nomi.length ? ' &nbsp;&middot;&nbsp; ' : '') +
      '<b>' +
      s.giorni.length +
      (s.giorni.length === 1 ? ' giorno' : ' giorni') +
      '</b> ' +
      b('Nascondi giorni', 'pianoSparseNascondiGiorni()');
  }
  h += b('&#10005;', 'pianoSparsePulisci()', true);
  bar.innerHTML = h;
}
// ===== TROVA NEL PIANO =====
// Filtra le righe per nome oppure per sigla presente nel mese (es. "C8"):
// le celle che corrispondono alla sigla vengono evidenziate
// Ricerca dentro le tabelle riepilogo (Saldo, Statistiche): mostra solo le
// righe del collaboratore cercato; le righe senza data-nome (totali) restano
function pianoTabellaFiltra(q, tableId) {
  const testo = (q || '').trim().toLowerCase();
  const tab = document.getElementById(tableId);
  if (!tab) return;
  tab.querySelectorAll('tbody tr[data-nome]').forEach((tr) => {
    tr.style.display = !testo || tr.dataset.nome.toLowerCase().includes(testo) ? '' : 'none';
  });
}
function pianoCercaFiltra(q) {
  window._pianoCercaTesto = q || '';
  const testo = (q || '').trim().toLowerCase();
  const tab = document.querySelector('#piano-content table[data-seltab="piano"]');
  if (!tab) return;
  tab.querySelectorAll('td.cerca-hit').forEach((c) => c.classList.remove('cerca-hit'));
  tab.querySelectorAll('tbody tr[data-nome]').forEach((tr) => {
    if (!testo) {
      tr.style.display = '';
      return;
    }
    const nomeOk = tr.dataset.nome.toLowerCase().includes(testo);
    let siglaOk = false;
    if (!nomeOk) {
      tr.querySelectorAll('td[data-g]').forEach((td) => {
        if (td.textContent.trim().toLowerCase() === testo) {
          siglaOk = true;
          td.classList.add('cerca-hit');
        }
      });
    }
    tr.style.display = nomeOk || siglaOk ? '' : 'none';
  });
}
function pianoSparsePulisci() {
  const s = _pianoSparse();
  s.nomi = [];
  s.giorni = [];
  document.querySelectorAll('#piano-content .row-selected').forEach((el) => el.classList.remove('row-selected'));
  document
    .querySelectorAll('#piano-content .col-selected, #piano-content .col-selected-header')
    .forEach((el) => el.classList.remove('col-selected', 'col-selected-header'));
  _pianoSparseBar();
}
function pianoSparseNascondi() {
  const s = _pianoSparse();
  if (s.nomi.length) pianoNascondiRighe(s.nomi.slice());
  pianoSparsePulisci();
}
function pianoSparseNascondiGiorni() {
  const s = _pianoSparse();
  if (s.giorni.length) pianoNascondiGiorni(s.giorni.slice());
  pianoSparsePulisci();
}
function pianoSparseStampa() {
  const s = _pianoSparse();
  if (s.nomi.length) stampaPianoPDF(s.nomi.slice());
}
async function pianoSparseColora() {
  const s = _pianoSparse();
  if (!s.nomi.length || !puoGestirePiano()) return;
  const colore = _colUltimo() || null;
  const righe = _pianoRighe.filter((r) => s.nomi.includes(r.collaboratore));
  if (!righe.length) {
    toast('Nessuna cella piena per i collaboratori selezionati');
    return;
  }
  if (
    !confirm(
      (colore ? 'Applico il colore del secchiello a ' : 'Tolgo il colore da ') +
        righe.length +
        ' celle di ' +
        s.nomi.length +
        ' collaboratori (mese ' +
        _pianoMeseSel +
        ')?',
    )
  )
    return;
  _pianoUndoSnap('colore righe selezionate');
  let fatte = 0;
  try {
    for (const r of righe) {
      const stC = _stileCella(r.colore);
      stC.c = colore || '';
      const nuovo = _stileStr(stC);
      if ((r.colore || null) === nuovo) continue;
      await secPatch('piano', 'id=eq.' + r.id, { colore: nuovo });
      r.colore = nuovo;
      fatte++;
    }
    logAzione('Piano: colore righe multiple', s.nomi.length + ' collaboratori · ' + fatte + ' celle');
    toast('Colorate ' + fatte + ' celle');
    pianoSparsePulisci();
    renderPiano();
  } catch (e) {
    toast('Errore salvataggio colore');
  }
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
function pianoMostraGiorni(gg) {
  const o = _pianoNascosti();
  o.giorni = o.giorni.filter((g) => !gg.includes(g));
  _pianoSalvaNascosti(o);
  _pianoApplicaNascosti();
  toast('Giorni rimostrati: ' + gg.join(', '));
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
  // GIORNI nascosti: chip sull'intestazione (come per le righe), cosi' si
  // vede subito che mancano colonne e si rimostrano con un click
  document.querySelectorAll('.chip-giorni-nascosti').forEach((c) => c.remove());
  const tabG = document.querySelector('#piano-content table[data-seltab="piano"]');
  if (tabG && o.giorni.length) {
    const ordinati = [...o.giorni].sort((a, b) => a - b);
    // gruppi contigui
    const gruppi = [];
    let cur = [ordinati[0]];
    ordinati.slice(1).forEach((g) => {
      if (g === cur[cur.length - 1] + 1) cur.push(g);
      else {
        gruppi.push(cur);
        cur = [g];
      }
    });
    gruppi.push(cur);
    gruppi.forEach((gr) => {
      // aggancio: il primo giorno visibile dopo il gruppo (o prima, se in coda)
      let th = null;
      for (let g = gr[gr.length - 1] + 1; g <= 31 && !th; g++)
        if (!o.giorni.includes(g)) th = tabG.querySelector('thead th[data-g="' + g + '"]');
      let inCoda = false;
      if (!th) {
        inCoda = true;
        for (let g = gr[0] - 1; g >= 1 && !th; g--)
          if (!o.giorni.includes(g)) th = tabG.querySelector('thead th[data-g="' + g + '"]');
      }
      if (!th) return;
      const chip = document.createElement('span');
      chip.className = 'chip-giorni-nascosti';
      chip.textContent = (inCoda ? '\u25c2' : '\u25b8') + gr.length;
      chip.title = 'Giorni nascosti: ' + gr.join(', ') + ' \u00b7 clicca per rimostrarli';
      const gr2 = gr.slice();
      chip.onclick = (e) => {
        e.stopPropagation();
        pianoMostraGiorni(gr2);
      };
      th.style.position = 'relative';
      th.prepend(chip);
    });
  }
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
    '<span style="font-size:.82rem;color:var(--muted)">Nascosti: ' +
    (o.nomi.length ? o.nomi.length + ' righe' : '') +
    (o.nomi.length && o.giorni.length ? ' + ' : '') +
    (o.giorni.length ? o.giorni.length + ' giorni (' + o.giorni.sort((a, b) => a - b).join(', ') + ')' : '') +
    '</span> <button class="btn-export" style="font-size:.82rem;padding:2px 10px;margin-left:8px" onclick="pianoMostraNascosti()">Mostra tutto</button>';
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
  _pianoUndoSnap('incolla nel piano');
  try {
    for (let i = 0; i < daPatch.length; i += 10)
      await Promise.all(
        daPatch
          .slice(i, i + 10)
          .map((p) => secPatch('piano', 'id=eq.' + p.id, { codice: p.codice, protetto: true, generato: false })),
      );
    if (daInserire.length) await sbRpc('piano_bulk_upsert', { p_token: getOpToken(), p_rows: daInserire });
    logAzione('Incolla nel piano', target.nome + ' g' + g0 + ' · ' + (daPatch.length + daInserire.length) + ' celle');
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
    ' · ' +
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
    logAzione('Incolla fabbisogno', target.codice + ' g' + g0 + ' · ' + ops.length + ' celle');
    toast('Fabbisogno incollato: ' + ops.length + ' celle');
    _pianoBloccoPulisci();
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore incolla fabbisogno');
  }
}

// ============================================================
// MIGLIORA ORE · secondo passaggio dopo la bozza: sposta turni
// GENERATI (non protetti) da chi è sopra le ore dovute a chi è
// sotto, stesso giorno e stesse regole (idoneità, consecutivi,
// riposo 11h, tolleranza). La copertura del fabbisogno non cambia.
// ============================================================
async function miglioraOrePiano() {
  _pianoUndoSnap('migliora ore ' + _pianoMeseSel);
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
  await _pianoCaricaOreMese(_pianoMeseSel);
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
            await _pianoInserisciCella({
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
      ym + ' · ' + scambi.length + ' scambi, scarto ' + mediaPrima.toFixed(1) + '→' + mediaDopo.toFixed(1),
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
          ', dai commenti del piano).\n\nVuoi certificarlo in Formazione?\n(OK = certifica · ti chiederà formatore e punti)',
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
