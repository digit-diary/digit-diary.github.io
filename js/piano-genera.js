/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-genera.js
 * PIANO · validatore regole e generatore della bozza (prenotazioni, passata di riparazione)
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
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
// ORE LAVORATE NELLA SETTIMANA (lunedi-domenica), regola ore_settimana_max (45.1):
// contano solo le ore LAVORATE, da orologio e SENZA il 10% notturno: i turni (con
// l orario del giorno, anche prolungato) e le celle con orario proprio (JG); non
// contano vacanze, malattie, CGF, riposi. Un turno che passa la mezzanotte conta
// nella settimana in cui inizia.
function _pianoOreSettimanaMax() {
  const v = parseFloat(_pianoRegolaVal('ore_settimana_max'));
  return v > 0 ? v : 0;
}
function _pianoLunediDi(dstr) {
  const d = new Date(String(dstr).substring(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().substring(0, 10);
}
function _pianoOreLavorateCella(r) {
  if (!r || !r.codice) return 0;
  const t = _pianoTurnoInfo(r.codice);
  if (t) return _pianoOreEffettiveTurno(t, r);
  if (String(r.codice).toUpperCase() === 'JG' && r.ora_inizio && r.ora_fine) {
    const e = _pianoOra(r.ora_inizio);
    const u = _pianoOra(r.ora_fine);
    if (e != null && u != null) return Math.round((u >= e ? u - e : 24 + u - e) * 100) / 100;
  }
  return 0;
}
// supplemento notturno (10% delle ore fra le 23 e le 6) di una cella lavorata
function _pianoNotturnoCella(r) {
  if (!r || !r.codice) return 0;
  const t = _pianoTurnoInfo(r.codice);
  let orari = null;
  if (t) {
    const eff = _pianoTurnoDelGiorno(t, String(r.data || '').substring(0, 10));
    orari = {
      ora_inizio: r.ora_inizio || (eff && eff.ora_inizio) || t.ora_inizio,
      ora_fine: r.ora_fine || (eff && eff.ora_fine) || t.ora_fine,
    };
  } else if (String(r.codice).toUpperCase() === 'JG' && r.ora_inizio && r.ora_fine)
    orari = { ora_inizio: r.ora_inizio, ora_fine: r.ora_fine };
  return orari ? _pianoNotteRecupero(_pianoOreNotturneTurno(orari)) : 0;
}
// il massimo si confronta con il totale compreso il 10% notturno (di base) o con le
// sole ore da orologio (regola ore_settimana_con_notturno)
function _pianoSettimanaConNotturno() {
  const v = _pianoRegolaVal('ore_settimana_con_notturno');
  return v == null || String(v).toUpperCase() !== 'FALSE';
}
// settimane oltre il massimo: [{ nome, lunedi, domenica, ore (da orologio), notte (10%),
// totale, conta (il numero confrontato con il massimo), giorni: [date lavorate] }]
function _pianoSettimaneOltre(righe, max) {
  max = max == null ? _pianoOreSettimanaMax() : max;
  if (!max) return [];
  const conNotte = _pianoSettimanaConNotturno();
  const visti = new Set();
  const sett = {};
  (righe || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    const k0 = r.collaboratore + '|' + d;
    if (visti.has(k0)) return;
    visti.add(k0);
    const ore = _pianoOreLavorateCella(r);
    if (!ore) return;
    const k = r.collaboratore + '|' + _pianoLunediDi(d);
    const s = (sett[k] = sett[k] || { nome: r.collaboratore, lunedi: _pianoLunediDi(d), ore: 0, notte: 0, giorni: [] });
    s.ore += ore;
    s.notte += _pianoNotturnoCella(r);
    s.giorni.push(d);
  });
  const r2 = (x) => Math.round(x * 100) / 100;
  return Object.values(sett)
    .map((s) => {
      const dom = new Date(s.lunedi + 'T12:00:00');
      dom.setDate(dom.getDate() + 6);
      const totale = s.ore + s.notte;
      return Object.assign(s, {
        ore: r2(s.ore),
        notte: r2(s.notte),
        totale: r2(totale),
        conta: r2(conNotte ? totale : s.ore),
        domenica: dom.toISOString().substring(0, 10),
      });
    })
    .filter((s) => s.conta > max + 0.001);
}
// "51.68 ore (49.18 da orologio + 2.50 notturno)"
function _pianoTestoOreSettimana(s) {
  return s.totale.toFixed(2) + ' ore (' + s.ore.toFixed(2) + ' da orologio + ' + s.notte.toFixed(2) + ' notturno)';
}
// RIPOSO SETTIMANALE ATTORNO ALLA DOMENICA (regole riposo_domenica_libera_ore 35 e
// riposo_domenica_lavorata_ore 47): ore consecutive dalla fine dell ultimo turno prima
// del riposo all inizio del turno successivo, con gli orari veri (prolungamenti, JG).
//  - domenica libera (nessun lavoro dalle 23 del sabato alle 23 della domenica): il
//    riposo che comprende quell intervallo deve durare almeno 35 ore;
//  - domenica lavorata (anche con il sabato oltre le 23): nella settimana prima
//    (lunedi-sabato) OPPURE in quella dopo (lunedi-sabato) ci deve essere un riposo di
//    almeno 47 ore consecutive (36 settimanali + 11 giornaliere).
function _pianoIntervalloLavoro(r) {
  if (!r || !r.codice) return null;
  const d = String(r.data).substring(0, 10);
  const t = _pianoTurnoInfo(r.codice);
  let ini = null;
  let fin = null;
  if (r.ora_inizio && r.ora_fine && (t || String(r.codice).toUpperCase() === 'JG')) {
    ini = r.ora_inizio;
    fin = r.ora_fine;
  } else if (t) {
    const eff = _pianoTurnoDelGiorno(t, d);
    ini = (eff && eff.ora_inizio) || t.ora_inizio;
    fin = (eff && eff.ora_fine) || t.ora_fine;
  } else return null;
  const i = _pianoOra(String(ini || '').substring(0, 5));
  let f = _pianoOra(String(fin || '').substring(0, 5));
  if (i == null || f == null) return null;
  if (f <= i) f += 24;
  const base = new Date(d + 'T00:00:00').getTime() / 3600000; // ore
  return { ini: base + i, fin: base + f, data: d };
}
function _pianoRiposiSettimanali(righe) {
  const minLib = parseFloat(_pianoRegolaVal('riposo_domenica_libera_ore')) || 0;
  const minLav = parseFloat(_pianoRegolaVal('riposo_domenica_lavorata_ore')) || 0;
  if (!minLib && !minLav) return [];
  const per = {};
  const visti = new Set();
  (righe || []).forEach((r) => {
    const k0 = r.collaboratore + '|' + String(r.data).substring(0, 10);
    if (visti.has(k0)) return;
    visti.add(k0);
    const iv = _pianoIntervalloLavoro(r);
    if (iv) (per[r.collaboratore] = per[r.collaboratore] || []).push(iv);
  });
  const out = [];
  const oraDi = (dstr, h) => new Date(dstr + 'T00:00:00').getTime() / 3600000 + h;
  const r1 = (x) => Math.round(x * 10) / 10;
  Object.keys(per).forEach((nome) => {
    const info = _pianoCollabInfo(nome);
    if (info && info.funzione === 'RESP') return;
    const iv = per[nome].sort((a, b) => a.ini - b.ini);
    // riposi = intervalli fra un turno e il successivo
    const riposi = [];
    for (let k = 1; k < iv.length; k++) if (iv[k].ini > iv[k - 1].fin) riposi.push({ da: iv[k - 1].fin, a: iv[k].ini });
    // settimane con almeno un turno
    const settimane = new Set(iv.map((x) => _pianoLunediDi(x.data)));
    settimane.forEach((lun) => {
      const dom = new Date(lun + 'T12:00:00');
      dom.setDate(dom.getDate() + 6);
      const domS = dom.toISOString().substring(0, 10);
      const sab = new Date(lun + 'T12:00:00');
      sab.setDate(sab.getDate() + 5);
      const sabS = sab.toISOString().substring(0, 10);
      const w0 = oraDi(sabS, 23);
      const w1 = oraDi(domS, 23);
      const lavoraDom = iv.some((x) => x.ini < w1 && x.fin > w0);
      if (!lavoraDom) {
        if (!minLib) return;
        // il riposo che comprende 23 sab - 23 dom: serve un turno prima e uno dopo
        const prima = iv.filter((x) => x.fin <= w0).pop();
        const dopo = iv.find((x) => x.ini >= w1);
        if (!prima || !dopo) return;
        const ore = dopo.ini - prima.fin;
        if (ore < minLib - 0.001)
          out.push({
            nome: nome,
            lunedi: lun,
            domenica: domS,
            tipo: 'libera',
            ore: r1(ore),
            min: minLib,
            dal: prima.fin,
            al: dopo.ini,
          });
      } else {
        if (!minLav) return;
        // domenica lavorata: 47 ore consecutive nella settimana PRIMA (lunedi-sabato)
        // oppure in quella DOPO (lunedi-sabato); conta la parte di ogni riposo che cade
        // dentro quei giorni. Se la settimana dopo non e ancora pianificata non si giudica.
        const p0 = oraDi(lun, 0);
        const p1 = oraDi(domS, 0);
        const d0 = oraDi(domS, 24);
        const d1 = oraDi(domS, 24 + 6 * 24);
        const maxIn = (a, b) => riposi.reduce((m, x) => Math.max(m, Math.min(x.a, b) - Math.max(x.da, a)), 0);
        const miglior = (a, b) =>
          riposi
            .filter((x) => x.a > a && x.da < b)
            .sort((x, y) => Math.min(y.a, b) - Math.max(y.da, a) - (Math.min(x.a, b) - Math.max(x.da, a)))[0];
        const prima = maxIn(p0, p1);
        const dopo = maxIn(d0, d1);
        if (prima >= minLav - 0.001 || dopo >= minLav - 0.001) return;
        if (!iv.some((x) => x.ini >= d1) || !iv.some((x) => x.fin <= p0)) return;
        const mp = miglior(p0, p1);
        const md = miglior(d0, d1);
        // da/a: le ore contate (la parte del riposo dentro la settimana prima o dopo)
        const usa = prima >= dopo ? { r: mp, a: p0, b: p1 } : { r: md, a: d0, b: d1 };
        out.push({
          nome: nome,
          lunedi: lun,
          domenica: domS,
          tipo: 'lavorata',
          ore: r1(Math.max(prima, dopo)),
          prima: r1(prima),
          dopo: r1(dopo),
          min: minLav,
          dal: usa.r ? Math.max(usa.r.da, usa.a) : null,
          al: usa.r ? Math.min(usa.r.a, usa.b) : null,
        });
      }
    });
  });
  return out;
}
function _pianoTestoRiposo(v) {
  return v.tipo === 'libera'
    ? 'domenica ' +
        _pianoGgMm(v.domenica) +
        ' libera: riposo di ' +
        v.ore +
        ' ore consecutive (minimo ' +
        v.min +
        ', comprese le 23 del sabato e le 23 della domenica)'
    : 'domenica ' +
        _pianoGgMm(v.domenica) +
        ' lavorata: nessun riposo di ' +
        v.min +
        ' ore ne nella settimana prima ne in quella dopo (il piu lungo: prima ' +
        v.prima +
        ', dopo ' +
        v.dopo +
        ' ore)';
}
// "ven 18.09 ore 14.00" da ore assolute
function _pianoOraLeggibile(h) {
  if (h == null) return '';
  const d = new Date(h * 3600000);
  const gg = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()];
  return (
    gg +
    ' ' +
    String(d.getDate()).padStart(2, '0') +
    '.' +
    String(d.getMonth() + 1).padStart(2, '0') +
    ' ore ' +
    String(d.getHours()).padStart(2, '0') +
    '.' +
    String(d.getMinutes()).padStart(2, '0')
  );
}
// righe del mese aperto piu i giorni delle settimane a cavallo (mese prima e dopo)
function _pianoRigheSettimane() {
  return (typeof _pianoRighe !== 'undefined' ? _pianoRighe : []).concat(window._pianoRigheBordo || []);
}
function _pianoGgMm(d) {
  return String(d).substring(8, 10) + '.' + String(d).substring(5, 7);
}
// Limiti ORE MENSILI personalizzabili (pannello Regole):
// - fissi e jolly CON percentuale: obiettivo = giorni/7 × ore sett × %;
//   max = obiettivo + tolleranza_ore_sopra, min = obiettivo − tolleranza_ore_sotto
//   (se sopra/sotto sono spente vale la tolleranza_ore simmetrica ±);
// - jolly SENZA percentuale: range assoluto jolly_ore_min / jolly_ore_max.
// min/max null = nessun limite su quel lato (regole spente).
// OBIETTIVO ORE DEL MESE CON IL SALDO (riporto + mesi passati): chi e in piu
// riceve meno ore, chi e in meno di piu, ma sempre DENTRO la tolleranza del mese
// (tolleranza_ore_sopra/sotto). Il saldo si recupera un po per mese invece di
// creare mesi fuori regola. base = ore dovute del mese.
function _pianoObiettivoConSaldo(nome, base, nGiorni) {
  const ytd = _pianoYtdMap[nome] || 0;
  let ob = base - ytd;
  const lim = _pianoLimitiOre(nome, nGiorni);
  if (lim.obiettivo == null) return ob; // jolly puri: range assoluto, come prima
  if (lim.min != null) ob = Math.max(ob, lim.min);
  if (lim.max != null) ob = Math.min(ob, lim.max);
  return ob;
}
function _pianoLimitiOre(nome, nGiorni) {
  const info = _pianoCollabInfo(nome) || {};
  // jolly con percentuale PIENA (o vuota) = jolly puro → range assoluto;
  // jolly con percentuale ridotta (es. 80%) = obiettivo % come i fissi
  const pctJ = parseFloat(info.percentuale);
  let jollySenzaPct = info.is_jolly && !(pctJ > 0 && pctJ < 1);
  // AUSILIARI: nella generazione del piano si punta a una percentuale, perche'
  // di norma un jolly fa circa l'80% di un tempo pieno. Vale SOLO qui, per
  // decidere quanti turni proporgli: le loro ore dovute restano zero e le
  // assenze continuano a contare per intero. La percentuale si cambia dalla
  // scheda Regole; lasciandola vuota si torna al vecchio range assoluto
  // jolly_ore_min / jolly_ore_max.
  const pctJollyPiano = parseFloat(_pianoRegolaVal('jolly_percentuale_piano'));
  if (jollySenzaPct && pctJollyPiano > 0 && pctJollyPiano <= 1) jollySenzaPct = false;
  if (jollySenzaPct) {
    const jMin = parseFloat(_pianoRegolaVal('jolly_ore_min'));
    const jMax = parseFloat(_pianoRegolaVal('jolly_ore_max'));
    return { obiettivo: null, min: isNaN(jMin) ? null : jMin, max: isNaN(jMax) ? null : jMax };
  }
  const pct = info.is_jolly && !(pctJ > 0 && pctJ < 1) ? pctJollyPiano : parseFloat(info.percentuale) || 1;
  const obiettivo = (_pianoGgDovuti(nome, _pianoMeseSel) / 7) * _pianoOreSett * pct;
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
// il sabato finisce entro le 23? (domenica libera valida solo se il riposo comprende
// le 23 del sabato - art. 21 OLL 1). Si guarda l orario VERO di quel sabato: il turno
// prolungato nelle sere di chiusura tardi e l orario scritto sulla cella (es. JG).
// dstrSab e riga sono facoltativi (senza, vale l orario di base del turno).
function _pianoSabatoEntro23(codice, dstrSab, riga) {
  if (!codice) return true;
  const t = _pianoTurnoInfo(codice);
  // codice di assenza (M, V, C...): quel sabato non si lavora, anche se la cella
  // tiene ancora l orario del turno sostituito. Fanno eccezione i codici con
  // l orario scritto a mano (JG, corsi): quelli sono lavoro vero.
  if (!t) {
    const cs = typeof _pianoCodiceInfo === 'function' ? _pianoCodiceInfo(codice) : null;
    if (cs && !cs.richiede_orario) return true;
  }
  let ini = null;
  let fin = null;
  if (riga && riga.ora_inizio && riga.ora_fine) {
    ini = riga.ora_inizio;
    fin = riga.ora_fine;
  } else if (t) {
    const eff = dstrSab ? _pianoTurnoDelGiorno(t, dstrSab) : null;
    if (t.oltre23 && !(eff && eff.prolungato)) return false;
    ini = (eff && eff.ora_inizio) || t.ora_inizio;
    fin = (eff && eff.ora_fine) || t.ora_fine;
    if (eff && eff.prolungato && t.oltre23) return false;
  } else return true; // codici speciali: niente lavoro
  const fi = _pianoOra(String(fin || '').substring(0, 5));
  const ii = _pianoOra(String(ini || '').substring(0, 5));
  if (fi == null) return true;
  if (ii != null && fi < ii) return false; // finisce dopo mezzanotte
  return fi <= 23; // _pianoOra e' in ore decimali
}
// DOMENICA LIBERA VALIDA: una di quelle che contano per le 12 dell anno. La domenica
// non si lavora, non e vacanza o malattia, e il sabato prima si finisce entro le 23
// (regola turno_prima_domenica_libera). Un sabato di malattia o vacanza non si
// lavora: la domenica dopo conta. sabatoMalato = malattia registrata nel Diario.
function _pianoDomenicaValida(codDom, codSab, dstrSab, rigaSab, sabatoMalato, nome) {
  if (codDom && _pianoTurnoInfo(codDom)) return false;
  if (_pianoDomenicaEsclusa(codDom)) return false;
  // malattia del sabato registrata solo nel Diario (non ancora nel piano):
  // vale come nel calendario, in ogni controllo che passa il nome
  if (sabatoMalato === undefined && nome && dstrSab) sabatoMalato = _pianoSabatoMalatoDiario(nome, dstrSab);
  if (sabatoMalato) return true;
  if (String(_pianoRegolaVal('turno_prima_domenica_libera')).toUpperCase() !== 'TRUE') return true;
  return _pianoSabatoEntro23(codSab, dstrSab, rigaSab);
}
// Mappa malattie del Diario per mese, ricalcolata quando cambia il Diario
// (lunghezza/oggetto di datiCache) o dopo 10 secondi.
const _pianoMalDiarioCache = {};
function _pianoSabatoMalatoDiario(nome, dstr) {
  if (typeof _pianoMalattieMese !== 'function') return false;
  const ym = String(dstr).substring(0, 7);
  const dc = typeof datiCache !== 'undefined' ? datiCache : null;
  const c = _pianoMalDiarioCache[ym];
  if (!c || c.rif !== dc || c.n !== (dc ? dc.length : 0) || Date.now() - c.t > 10000) {
    _pianoMalDiarioCache[ym] = { rif: dc, n: dc ? dc.length : 0, t: Date.now(), mappa: _pianoMalattieMese(ym) };
  }
  return !!_pianoMalDiarioCache[ym].mappa[nome + '|' + dstr];
}
function _pianoGiornoPrima(dstr, n) {
  const d = new Date(dstr + 'T12:00:00');
  d.setDate(d.getDate() - (n || 1));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Domeniche libere valide dell anno (tutte le domeniche gia pianificate) di una persona.
async function _pianoDomenicheValideAnno(nome, anno) {
  const righe =
    (await secGet(
      'piano?collaboratore=eq.' +
        encodeURIComponent(nome) +
        '&data=gte.' +
        (anno - 1) +
        '-12-31&data=lte.' +
        anno +
        '-12-31&select=data,codice,ora_inizio,ora_fine&limit=500',
    )) || [];
  const per = {};
  righe.forEach((r) => (per[String(r.data).substring(0, 10)] = r));
  let n = 0;
  let daPianificare = 0; // domeniche dell anno ancora senza cella: possono diventare libere
  for (let d = new Date(anno, 0, 1, 12); d.getFullYear() === anno; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) continue;
    const ds = anno + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!per[ds]) {
      daPianificare++;
      continue;
    }
    const sab = _pianoGiornoPrima(ds);
    const rs = per[sab];
    if (_pianoDomenicaValida(per[ds].codice, rs && rs.codice, sab, rs, undefined, nome)) n++;
  }
  return { valide: n, daPianificare: daPianificare };
}
// Un cambio toglie una domenica libera valida? Guarda la domenica della cella (se la
// cella e domenica) o quella dopo (se la cella e sabato). righe = celle della persona
// attorno al giorno, PRIMA del cambio. Ritorna la data della domenica persa o null.
function _pianoDomenicaPersa(dstr, codiceNuovo, righe, nomeP) {
  const dow = new Date(dstr + 'T12:00:00').getDay();
  if (dow !== 0 && dow !== 6) return null;
  const per = {};
  (righe || []).forEach((r) => (per[String(r.data).substring(0, 10)] = r));
  const dom = dow === 0 ? dstr : _pianoGiornoPrima(dstr, -1);
  const sab = _pianoGiornoPrima(dom);
  const rd = per[dom];
  const rs = per[sab];
  const nome = nomeP || ((righe || []).find((r) => r && r.collaboratore) || {}).collaboratore;
  if (!_pianoDomenicaValida(rd && rd.codice, rs && rs.codice, sab, rs, undefined, nome)) return null;
  const nuovoDom = dow === 0 ? codiceNuovo : rd && rd.codice;
  const nuovoSab = dow === 6 ? { codice: codiceNuovo } : rs;
  // la riga nuova del sabato non ha ancora l orario scritto: vale quello del turno
  if (_pianoDomenicaValida(nuovoDom, nuovoSab && nuovoSab.codice, sab, dow === 6 ? null : rs, undefined, nome))
    return null;
  if (!_pianoTurnoInfo(codiceNuovo) && !(dow === 6 && !_pianoSabatoEntro23(codiceNuovo, sab, null))) return null;
  return dom;
}
// Testo dell avviso: quante domeniche valide resterebbero nell anno.
async function _pianoTestoDomenicaPersa(nome, dom) {
  const anno = parseInt(dom.substring(0, 4));
  const min = parseInt(_pianoRegolaVal('domeniche_libere_anno')) || 12;
  const conto = await _pianoDomenicheValideAnno(nome, anno);
  const ora = conto.valide;
  const dopo = Math.max(0, ora - 1);
  // sotto il minimo solo se neanche le domeniche ancora da pianificare bastano
  const sotto = dopo + conto.daPianificare < min;
  return (
    (sotto ? 'ATTENZIONE, NON ARRIVA PIU AL MINIMO: ' : '') +
    nome +
    ' perde la domenica libera del ' +
    dom.split('-').reverse().join('.') +
    ' (una di quelle che contano): le domeniche libere valide del ' +
    anno +
    ' scenderebbero da ' +
    ora +
    ' a ' +
    dopo +
    ' (minimo ' +
    min +
    (conto.daPianificare ? ', ancora ' + conto.daPianificare + ' domeniche da pianificare' : '') +
    ')'
  );
}
// Stesso controllo per piu mosse insieme (cerca cambio, copertura malattia):
// mosse = [{nome, data, codice}]. Ritorna i testi degli avvisi.
async function _pianoAvvisiDomenichePerse(mosse) {
  const out = [];
  for (const m of mosse || []) {
    const dow = new Date(m.data + 'T12:00:00').getDay();
    if ((dow !== 0 && dow !== 6) || !m.codice) continue;
    const righe =
      (await secGet(
        'piano?collaboratore=eq.' +
          encodeURIComponent(m.nome) +
          '&data=gte.' +
          _pianoGiornoPrima(m.data, 2) +
          '&data=lte.' +
          _pianoGiornoPrima(m.data, -2) +
          '&limit=20',
      )) || [];
    const dom = _pianoDomenicaPersa(m.data, m.codice, righe, m.nome);
    if (dom) out.push(await _pianoTestoDomenicaPersa(m.nome, dom));
  }
  return out;
}
function _pianoCalcolaViolazioni() {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const maxCons = parseInt(_pianoRegolaVal('max_consecutivi')) || 0;
  const minRiposo = parseFloat(_pianoRegolaVal('min_riposo_ore')) || 0;
  const no4w1c1w = _pianoRegolaVal('no_4w1c1w') === 'TRUE';
  const diurnoPreV = _pianoRegolaVal('diurno_prima_vacanza') === 'TRUE';
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
  // riposo settimanale attorno alla domenica (35 / 47 ore)
  _pianoRiposiSettimanali(_pianoRigheSettimane()).forEach((v) => {
    const g = v.tipo === 'libera' ? v.domenica : v.domenica;
    if (!g.startsWith(ym)) return;
    const msg = _pianoTestoRiposo(v);
    (celle[v.nome + '|' + g] = celle[v.nome + '|' + g] || []).push(msg);
    lista.push({ nome: v.nome, giorno: parseInt(g.substring(8, 10)), msg: msg });
  });
  // ore lavorate nella settimana lunedi-domenica oltre il massimo (45.1)
  const maxSett = _pianoOreSettimanaMax();
  _pianoSettimaneOltre(_pianoRigheSettimane(), maxSett).forEach((s) => {
    const nelMese = s.giorni.filter((d) => d.startsWith(ym)).sort();
    if (!nelMese.length) return;
    const msg =
      _pianoTestoOreSettimana(s) +
      ' lavorate nella settimana ' +
      _pianoGgMm(s.lunedi) +
      '-' +
      _pianoGgMm(s.domenica) +
      ' (max ' +
      maxSett +
      (_pianoSettimanaConNotturno() ? ' compreso il 10%' : ' da orologio') +
      ')';
    nelMese.forEach((d) => (celle[s.nome + '|' + d] = celle[s.nome + '|' + d] || []).push(msg));
    lista.push({ nome: s.nome, giorno: parseInt(nelMese[0].substring(8, 10)), msg: msg });
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
          // fine oltre mezzanotte = fine prima dell'inizio. Il flag "oltre le 23"
          // vale anche per un turno che chiude alle 23:30 e NON sposta il giorno
          const fineAbs = fine1 <= _pianoOra(t1.ora_inizio) ? 24 + fine1 : fine1;
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
      // 5) regole "chi fa cosa" del settore (regole di gruppo turni_solo_funzioni
      //    e funzione_turni_giorni: create e modificate dalla scheda Regole di gruppo)
      if (lavoro) {
        const t = _pianoTurnoInfo(cod);
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        const vfz = t ? _pianoViolazioneFunzioneTurno(nome, t, dow, false) : null;
        if (vfz) aggiungi(nome, g, vfz);
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
      if ((r.reparto_dip || 'slots') !== _pianoReparto()) return; // copertura: solo le celle di questo settore
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
              if ((r.reparto_dip || 'slots') !== _pianoReparto()) return;
              const t = _pianoTurnoInfo(r.codice);
              if (!t || (t.gruppo || '').toUpperCase() !== gr) return;
              if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) return;
              if ((((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase() === fu) conta++;
            });
            // segnala solo se quel giorno il gruppo ha turni del tipo richiesto
            let turniQuelGiorno = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              if ((r.reparto_dip || 'slots') !== _pianoReparto()) return;
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
        if (_pianoDomenicaEsclusa(cod)) continue; // vacanza o malattia: non conta tra le 12
        // il sabato prima (per la prima domenica del mese: dal mese precedente)
        const dSab = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00');
        dSab.setDate(dSab.getDate() - 1);
        const isoSab = dSab.toISOString().substring(0, 10);
        const rSab = _pianoRigheSettimane().find((r) => r.collaboratore === nome && String(r.data).startsWith(isoSab));
        const codSab = rSab ? rSab.codice : g > 1 ? perNome[nome][g - 1] : null;
        if (!_pianoDomenicaValida(cod, codSab, isoSab, rSab, undefined, nome)) {
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
      '<p style="padding:8px 14px;font-size:var(--fs-sm,.8125rem);color:var(--c-verde,#2c6e49);font-weight:600"><i class="icx icx-check"></i> Nessuna violazione delle regole attive nel mese.</p>';
    return;
  }
  let h =
    '<div style="padding:8px 14px"><p style="font-size:var(--fs-sm,.8125rem);font-weight:700;color:var(--accent);margin-bottom:6px">' +
    _pianoViolLista.length +
    ' violazioni (celle evidenziate in rosso):</p><div style="max-height:180px;overflow-y:auto;font-size:var(--fs-md,.875rem);line-height:1.7">';
  _pianoViolLista.forEach((v) => {
    const dV = v.giorno ? _pianoMeseSel + '-' + String(v.giorno).padStart(2, '0') : '';
    h +=
      '<div' +
      (typeof _attrCella === 'function' && dV ? _attrCella(v.nome, dV) : '') +
      '>• <strong>' +
      escP(v.nome) +
      '</strong> · giorno ' +
      v.giorno +
      ': ' +
      escP(v.msg) +
      '</div>';
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
    !(await chiediConferma(
      'Tappo i buchi rimasti di ' +
        _pianoMeseSel +
        ' usando chi copre da altri settori:\n\n' +
        chi.map((x) => '\u2022 ' + x).join('\n') +
        "\n\nI turni gia' inseriti non vengono toccati. Fallo DOPO aver generato i piani dei loro reparti, cosi' si vede chi e' davvero libero.",
    ))
  )
    return;
  await generaBozzaPiano(true);
}
// usaCoperture = false (predefinito): riempie SOLO con i collaboratori del
// reparto, cosi' l'ordine con cui generi i piani non toglie nessuno al suo
// settore d'origine. Con true (bottone "Completa con coperture") si tappano i
// buchi rimasti usando chi e' abilitato a coprire da altri settori.
async function generaBozzaPiano(usaCoperture) {
  if (!puoGestirePiano()) return;
  _pianoUndoSnap((usaCoperture ? 'coperture ' : 'genera bozza ') + _pianoMeseSel);
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
  // GIORNI CHIUSI (gia' passati): la bozza non li tocca, ne' cancellando ne'
  // assegnando. Prima cancellava e riempiva anche il passato senza motivo.
  const giorniChiusi = new Set();
  for (let g = 1; g <= nGiorni; g++) {
    const dstrG = ym + '-' + String(g).padStart(2, '0');
    if (_pianoGiornoBloccato(dstrG) && !_pianoGiornoSbloccato(dstrG)) giorniChiusi.add(g);
  }
  if (giorniChiusi.size === nGiorni) {
    toastErrore('Tutti i giorni di ' + ym + ' sono chiusi: niente da generare');
    return;
  }
  let primoApertoG = 1;
  while (giorniChiusi.has(primoApertoG)) primoApertoG++;
  const primoAperto = ym + '-' + String(primoApertoG).padStart(2, '0');
  // le C di RIEMPIMENTO generate da una bozza precedente si tolgono e si
  // rimettono alla fine: così rigenerare non trova i giorni "occupati"
  await secDel(
    'piano',
    'data=gte.' +
      primoAperto +
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
  // malattie, congedi non pagati e giorni dopo la fine del rapporto: non assegnabili
  const malattie = Object.assign(_pianoMalattieMese(ym), _pianoCnpMese(ym), _pianoFineMese(ym));
  const ndDiario = _pianoNdMese(ym);
  // stato griglia: esistenti + assegnazioni della bozza
  const cella = {}; // 'nome|g' -> codice
  const rigaDi = {}; // 'nome|g' -> riga (per sostituire i segnaposto WD)
  // giorni passati in un ALTRO settore: la persona e occupata (non si assegna,
  // contano per ore e riposi) ma NON copre i posti di questo settore, anche se
  // la sigla e uguale (al Valet ci sono R23 e C15 come agli Slots)
  const altroSettore = {}; // 'nome|g' -> true
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + parseInt(r.data.split('-')[2]);
    cella[k] = r.codice;
    rigaDi[k] = r;
    if ((r.reparto_dip || 'slots') !== _pianoReparto()) altroSettore[k] = true;
  });
  const oreMese = {}; // equità: ore gia' nel mese, turni E codici speciali (V, M, CGF...)
  Object.keys(cella).forEach((k) => {
    const nomeK = k.substring(0, k.lastIndexOf('|'));
    const t = _pianoTurnoInfo(cella[k]);
    if (t) oreMese[nomeK] = (oreMese[nomeK] || 0) + (parseFloat(t.durata_ore) || 0);
    else {
      // vacanze, malattie, CGF valgono ore: chi ha 10 giorni di V non deve
      // ricevere turni fino all'obiettivo pieno (validatore e calendario li contano)
      const cs = _pianoCodiceInfo(cella[k]);
      if (cs)
        oreMese[nomeK] =
          (oreMese[nomeK] || 0) +
          _pianoOreSpecialeDelGiorno(rigaDi[k] || { codice: cella[k] }, cs, _pianoCollabInfo(nomeK) || {});
    }
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
    obiettivo[n] = _pianoObiettivoConSaldo(n, (_pianoGgDovuti(n, ym) / 7) * _pianoOreSett * pct, nGiorni);
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
      const fineAbs = finePrev <= _pianoOra(prev.ora_inizio) ? 24 + finePrev : finePrev;
      if (24 + _pianoOra(t.ora_inizio) - fineAbs < minRiposo) return false;
    }
    // verso il giorno dopo (se già assegnato, es. cella protetta)
    const next = _pianoTurnoInfo(cella[nome + '|' + (g + 1)] || '');
    if (next) {
      const fine = _pianoOra(t.ora_fine);
      const fineAbs = fine <= _pianoOra(t.ora_inizio) ? 24 + fine : fine;
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
  const scopertiObj = []; // posti scoperti da provare a riparare spostando un turno
  const assegnatiRun = new Set(); // 'nome|g' assegnati da QUESTA bozza (spostabili)
  // regole di preferenza lette UNA volta (Si/No) e contatori sul mese
  const regSi = (nome) => {
    const v = _pianoRegolaVal(nome);
    return v == null ? false : String(v).toUpperCase() === 'TRUE';
  };
  const patternLavoro = parseInt(_pianoRegolaVal('pattern_lavoro')) || 99;
  const contaTipo = (n, tipo) => {
    let k = 0;
    for (let d = 1; d <= nGiorni; d++) {
      const tt = _pianoTurnoInfo(cella[n + '|' + d] || '');
      if (tt && tt.tipo === tipo) k++;
    }
    return k;
  };
  const contaDomeniche = (n) => {
    let k = 0;
    for (let d = 1; d <= nGiorni; d++) {
      if (new Date(ym + '-' + String(d).padStart(2, '0') + 'T12:00:00').getDay() !== 0) continue;
      if (_pianoTurnoInfo(cella[n + '|' + d] || '')) k++;
    }
    return k;
  };
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
    if (altroSettore[k]) return; // non copre i posti di questo settore
    const [nomeK, gK] = [k.substring(0, k.lastIndexOf('|')), parseInt(k.substring(k.lastIndexOf('|') + 1))];
    registraAssegnazione(nomeK, cella[k], gK);
  });
  // ===== PRENOTAZIONI PRIMA DEI TURNI =====
  // Come le vacanze: i giorni che spettano si fissano PRIMA di distribuire i
  // turni, altrimenti la bozza li occupa e il diritto salta.
  // 1) COMPLEANNO: congedo C con la nota, per tutti (anche chi lavora in due
  //    settori: la cella e' una sola e si vede in entrambi i piani)
  const compleanni = {}; // nome|g -> true
  const annoBozza = ym.split('-')[0];
  const fabbTot = {}; // g -> posti richiesti (per scegliere i giorni di recupero)
  Object.keys(fabbG).forEach((g) => (fabbTot[g] = fabbG[g].reduce((a, f) => a + (parseInt(f.quantita) || 0), 0)));
  nomi.forEach((n) => {
    const infoN = _pianoCollabInfo(n) || {};
    const md = infoN.data_nascita ? String(infoN.data_nascita).substring(5, 10) : '';
    if (!md || md.substring(0, 2) !== ym.substring(5, 7)) return;
    const g = parseInt(md.substring(3, 5));
    if (!g || g > nGiorni) return;
    compleanni[n + '|' + g] = true;
    const dstrG = ym + '-' + String(g).padStart(2, '0');
    if (giorniChiusi.has(g) || cella[n + '|' + g] || malattie[n + '|' + dstrG]) return;
    cella[n + '|' + g] = 'C';
    nuove.push({
      collaboratore: n,
      data: dstrG,
      codice: 'C',
      protetto: false,
      generato: true,
      commento: 'Compleanno',
      reparto_dip: _pianoReparto(),
    });
  });
  // 2) CGF ARRETRATI: recuperi maturati nei mesi (e nell'anno) precedenti e
  //    non ancora goduti, con la contabilita' unica e le regole cgf_*
  await _pianoCaricaCgfRiporto(annoBozza);
  // solo i mesi PRIMA di questo: il mese si legge dalla griglia, il futuro mai
  const righeCgf = (await _pianoCaricaRigheCgf(annoBozza, da)).filter((r) => !String(r.data).startsWith(ym));
  const nomiCgf = nomi.filter((n) => _pianoMaturaCgf(_pianoCollabInfo(n)));
  const contoCgf = _pianoContabilitaCgf(righeCgf, nomiCgf, annoBozza, da);
  const daCancellareCgf = []; // CGF generati che non spettano piu' (festivo saltato per malattia)
  const festiviCgf = _pianoFestiviCgfSet();
  let nCgfAuto = 0;
  const ctxCgf = {
    ym: ym,
    nGiorni: nGiorni,
    cella: cella,
    malattie: malattie,
    compleanni: compleanni,
    fabbTot: fabbTot,
    chiusi: giorniChiusi,
  };
  const scriviCgf = (n, giorni) => {
    giorni.forEach((g) => {
      nuove.push({
        collaboratore: n,
        data: ym + '-' + String(g).padStart(2, '0'),
        codice: 'CGF',
        protetto: false,
        generato: true,
        reparto_dip: _pianoReparto(),
      });
      nCgfAuto++;
    });
  };
  nomiCgf.forEach((n) => {
    // credito arretrato = resta dei mesi precedenti + festivi gia' nel mese
    // (celle esistenti, non in malattia) - CGF gia' presenti nel mese
    let credito = contoCgf[n].resta;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = cella[n + '|' + g];
      if (!cod) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (festiviCgf.has(dstrG) && _pianoTurnoInfo(cod) && !malattie[n + '|' + dstrG]) credito++;
      if (cod === 'CGF') credito--;
    }
    if (credito > 0) scriviCgf(n, _pianoPiazzaCgf(n, credito, ctxCgf));
    // credito negativo: recuperi automatici dati per un festivo poi saltato
    // (malattia). Si tolgono i CGF generati e non protetti, dall'ultimo
    if (credito < 0) {
      for (let g = nGiorni; g >= 1 && credito < 0; g--) {
        const rg = rigaDi[n + '|' + g];
        if (rg && rg.codice === 'CGF' && rg.generato && !rg.protetto && !giorniChiusi.has(g)) {
          daCancellareCgf.push(rg.id);
          delete cella[n + '|' + g];
          delete rigaDi[n + '|' + g];
          credito++;
        }
      }
    }
  });
  // IDONEITA' DI UN CANDIDATO per il turno f (oggetto con turno_codice) nel
  // giorno g. E' l'unico posto in cui la bozza decide chi puo' fare cosa:
  // lo usano il giro principale e la passata di riparazione (che chiede
  // ignoraOccupato = true per chi ha gia' un turno da spostare, con oreDelta
  // = ore del turno che lascia, negative).
  const riposoDomAttivo =
    !!parseFloat(_pianoRegolaVal('riposo_domenica_libera_ore')) ||
    !!parseFloat(_pianoRegolaVal('riposo_domenica_lavorata_ore'));
  const candidatoOk = (n, f, t, g, dstr, dowG, ignoraOccupato, oreDelta) => {
    const esistente = cella[n + '|' + g];
    if (altroSettore[n + '|' + g]) return false; // quel giorno lavora in un altro settore
    if (malattie[n + '|' + dstr]) return false;
    if (ndDiario[n + '|' + dstr]) return false; // non disponibile (dal Diario)
    if (!ignoraOccupato && esistente && esistente !== 'WD') return false;
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
    // ore lavorate nella settimana lunedi-domenica: mai oltre il massimo (45.1)
    const maxSettB = _pianoOreSettimanaMax();
    if (maxSettB) {
      const lun = _pianoLunediDi(dstr);
      const conNotteB = _pianoSettimanaConNotturno();
      const oreCella = (rr) => _pianoOreLavorateCella(rr) + (conNotteB ? _pianoNotturnoCella(rr) : 0);
      let oreSett = oreCella({ codice: t.codice, data: dstr });
      for (let k = 0; k < 7; k++) {
        const dd = new Date(lun + 'T12:00:00');
        dd.setDate(dd.getDate() + k);
        const dk = dd.toISOString().substring(0, 10);
        if (dk === dstr) continue;
        if (dk.startsWith(ym)) {
          const cod = cella[n + '|' + parseInt(dk.substring(8, 10))];
          const rg = rigaDi[n + '|' + parseInt(dk.substring(8, 10))];
          if (cod) oreSett += oreCella(rg && rg.codice === cod ? rg : { codice: cod, data: dk });
        } else {
          const rb = (window._pianoRigheBordo || []).find(
            (x) => x.collaboratore === n && String(x.data).startsWith(dk),
          );
          if (rb) oreSett += oreCella(rb);
        }
      }
      if (oreSett > maxSettB + 0.001) return false;
    }
    // riposo settimanale attorno alla domenica (35 / 47 ore): mai un turno che crea un
    // riposo troppo corto per una domenica vicina (quelli gia presenti non bloccano)
    if (riposoDomAttivo) {
      const righeN = [];
      for (let k = 1; k <= nGiorni; k++) {
        const cod = cella[n + '|' + k];
        if (!cod) continue;
        const rg = rigaDi[n + '|' + k];
        righeN.push(
          rg && rg.codice === cod ? rg : { collaboratore: n, data: ym + '-' + String(k).padStart(2, '0'), codice: cod },
        );
      }
      (window._pianoRigheBordo || []).forEach((x) => {
        if (x.collaboratore === n) righeN.push(x);
      });
      const vicina = (v) => Math.abs(new Date(v.domenica + 'T12:00:00') - new Date(dstr + 'T12:00:00')) <= 8 * 86400000;
      const prima = _pianoRiposiSettimanali(righeN).filter(vicina);
      const dopo = _pianoRiposiSettimanali(
        righeN
          .filter((x) => String(x.data).substring(0, 10) !== dstr)
          .concat([{ collaboratore: n, data: dstr, codice: t.codice }]),
      ).filter(vicina);
      if (dopo.some((x) => !prima.some((y) => y.domenica === x.domenica && y.tipo === x.tipo))) return false;
    }
    // mappature per funzione (SUP/BO limitati ai loro turni; regole settimana SUP)
    const fz = infoC && infoC.funzione;
    // regole "chi fa cosa" del settore (turni riservati, funzione-turni-giorni)
    if (_pianoViolazioneFunzioneTurno(n, t, dowG, true)) return false;
    // regola HARD no_4w1c1w: niente rientro dopo UN solo giorno di riposo
    // se prima c'erano 4+ giorni di lavoro consecutivi
    if (String(_pianoRegolaVal('no_4w1c1w')).toUpperCase() === 'TRUE') {
      const cp0 = consecPrima(n, g);
      if (cp0 === 0 && !_pianoIsLavoro(cella[n + '|' + (g - 1)] || '')) {
        let streakPrec = 0;
        for (let k = g - 2; k >= 1 && _pianoIsLavoro(cella[n + '|' + k] || ''); k--) streakPrec++;
        if (streakPrec >= 4) return false;
      }
      // anche IN AVANTI: il turno allunga una serie che finisce con un riposo
      // singolo gia fissato e un rientro (succedeva tappando i buchi dopo)
      let fineSerie = g;
      while (fineSerie + 1 <= nGiorni && _pianoIsLavoro(cella[n + '|' + (fineSerie + 1)] || '')) fineSerie++;
      const riposo = fineSerie + 1;
      if (riposo + 1 <= nGiorni && fineSerie - g + 1 + cp0 >= 4 && _pianoIsLavoro(cella[n + '|' + (riposo + 1)] || ''))
        return false;
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
        // come in PianoRegole: la funzione ammessa e' un lasciapassare
        const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
        if (ammesse.includes(fzU)) campoGrant = true;
        else if (!haStoria) return false;
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
        // con il saldo, ma mai oltre il massimo del mese ne sotto il minimo
        const maxEff =
          limN.obiettivo != null
            ? Math.min(limN.max, Math.max(limN.max - (_pianoYtdMap[n] || 0), limN.min != null ? limN.min : 0))
            : limN.max;
        if ((oreMese[n] || 0) + (oreDelta || 0) + (parseFloat(t.durata_ore) || 0) > maxEff) return false;
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
      const voci = mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO').map((m) => m.turno_codice);
      if (voci.length && !voci.includes(f.turno_codice)) return false;
    } else if (!haStoria && !campoGrant) return false;
    return consecPrima(n, g) < maxCons && riposoOk(n, g, t);
  };
  for (let g = 1; g <= nGiorni; g++) {
    if (giorniChiusi.has(g)) continue; // giorno chiuso: resta com'e'
    (fabbG[g] || []).forEach((f) => {
      const t = _pianoTurnoInfo(f.turno_codice);
      if (!t) return;
      const dstr = ym + '-' + String(g).padStart(2, '0');
      let have = nomi.filter((n) => cella[n + '|' + g] === f.turno_codice && !altroSettore[n + '|' + g]).length;
      while (have < f.quantita) {
        const dowG = new Date(dstr + 'T12:00:00').getDay();
        const candidati = nomi
          .filter((n) => candidatoOk(n, f, t, g, dstr, dowG, false, 0))
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
              // REGOLE DI PREFERENZA (scheda Regole): prima erano scritte ma
              // il generatore non le leggeva. Ognuna sposta il punteggio.
              // equilibrio notti / diurni-notturni: chi ne ha fatte meno viene prima
              if (t.tipo === 'NOTTURNO' && regSi('equilibrio_notti')) p += contaTipo(n, 'NOTTURNO') * 0.5;
              if (regSi('equilibrio_diurni_notturni'))
                p += (contaTipo(n, t.tipo) - contaTipo(n, t.tipo === 'NOTTURNO' ? 'DIURNO' : 'NOTTURNO')) * 0.25;
              // notte, un riposo, poi un turno che inizia presto: da evitare
              if (regSi('no_notte_riposo_presto') && _pianoOra(t.ora_inizio) < 10) {
                const t2 = _pianoTurnoInfo(cella[n + '|' + (g - 2)] || '');
                if (t2 && t2.tipo === 'NOTTURNO' && !_pianoIsLavoro(cella[n + '|' + (g - 1)] || '')) p += 4;
              }
              // domeniche: chi ne ha gia' lavorate di piu' nel mese viene dopo
              if (dowG === 0 && _pianoRegolaVal('domeniche_libere_anno') != null) p += contaDomeniche(n) * 1.5;
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
              // blocchi compatti: chi ha lavorato ieri continua il blocco fino
              // alla lunghezza ideale (pattern_lavoro), poi non oltre
              if (regSi('blocchi_compatti') && cp > 0 && cp < Math.min(maxCons, patternLavoro)) return p - 3;
              // riposo isolato: chi ha riposato UN solo giorno non viene richiamato subito
              if (regSi('penalita_riposo_isolato') && cp === 0 && _pianoIsLavoro(cella[n + '|' + (g - 2)] || ''))
                return p + 2;
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
          scopertiObj.push({ codice: f.turno_codice, t: t, g: g, dstr: dstr, dowG: dowG });
          break;
        }
        const scelto = candidati[0];
        const eraWd = cella[scelto + '|' + g] === 'WD';
        cella[scelto + '|' + g] = f.turno_codice;
        assegnatiRun.add(scelto + '|' + g);
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
  // ===== PASSATA DI RIPARAZIONE =====
  // Il giro principale decide un giorno alla volta e non torna indietro: un
  // posto resta scoperto anche quando basterebbe spostare un turno. Qui, per
  // ogni scoperto, si cerca A (assegnato da questa bozza nello stesso giorno,
  // idoneo al turno scoperto) e B (libero quel giorno, idoneo al turno di A):
  // A passa al turno scoperto, B prende il turno di A. Tutte le regole
  // valgono per entrambi. Niente catene piu' lunghe: restano scoperti.
  let riparati = 0;
  const scopertiRestanti = [];
  scopertiObj.forEach((sc) => {
    let fatto = false;
    for (const a of nomi) {
      if (fatto) break;
      const kA = a + '|' + sc.g;
      if (!assegnatiRun.has(kA)) continue;
      const codA = cella[kA];
      const tA = _pianoTurnoInfo(codA);
      if (!tA || codA === sc.codice) continue;
      const durA = parseFloat(tA.durata_ore) || 0;
      if (!candidatoOk(a, { turno_codice: sc.codice }, sc.t, sc.g, sc.dstr, sc.dowG, true, -durA)) continue;
      for (const b of nomi) {
        if (b === a || cella[b + '|' + sc.g]) continue;
        if (!candidatoOk(b, { turno_codice: codA }, tA, sc.g, sc.dstr, sc.dowG, false, 0)) continue;
        // A: dal turno codA al turno scoperto
        cella[kA] = sc.codice;
        const nA = nuove.find((x) => x.collaboratore === a && x.data === sc.dstr);
        if (nA) nA.codice = sc.codice;
        else {
          const sw = rigaDi[kA] && sostituzioniWd.find((x) => x.id === rigaDi[kA].id);
          if (sw) sw.codice = sc.codice;
        }
        const grA = (tA.gruppo || '').toUpperCase();
        const fzA = (((_pianoCollabInfo(a) || {}).funzione || '') + '').toUpperCase();
        contaGiornoFz[grA + '|' + fzA + '|' + sc.g] = Math.max(
          0,
          (contaGiornoFz[grA + '|' + fzA + '|' + sc.g] || 0) - 1,
        );
        contaGiornoTot[grA + '|' + sc.g] = Math.max(0, (contaGiornoTot[grA + '|' + sc.g] || 0) - 1);
        registraAssegnazione(a, sc.codice, sc.g);
        oreMese[a] = (oreMese[a] || 0) - durA + (parseFloat(sc.t.durata_ore) || 0);
        // B: prende il turno lasciato da A
        cella[b + '|' + sc.g] = codA;
        assegnatiRun.add(b + '|' + sc.g);
        registraAssegnazione(b, codA, sc.g);
        oreMese[b] = (oreMese[b] || 0) + durA;
        nuove.push({
          collaboratore: b,
          data: sc.dstr,
          codice: codA,
          protetto: false,
          generato: true,
          reparto_dip: _pianoReparto(),
        });
        riparati++;
        fatto = true;
        break;
      }
    }
    if (!fatto) scopertiRestanti.push(sc.codice + ' giorno ' + sc.g);
  });
  scoperti.length = 0;
  scopertiRestanti.forEach((x) => scoperti.push(x));
  // ===== RIPOSO SETTIMANALE: PASSATA DI SISTEMAZIONE =====
  // La bozza decide un giorno alla volta: quando assegna un turno i giorni dopo sono
  // ancora vuoti e sembrano riposo, quindi il riposo attorno alla domenica (35 ore se
  // libera, 47 nella settimana prima o dopo se lavorata) si vede solo a mese finito.
  // Qui, per ogni domenica senza il riposo giusto, si cerca nei giorni vicini un turno
  // messo da QUESTA bozza che, tolto, crea il riposo; il turno passa a un collega libero
  // quel giorno per cui tutte le regole valgono. Le celle esistenti non si toccano.
  let riposiSistemati = 0;
  const riposiRestano = [];
  if (riposoDomAttivo) {
    const righeDiN = (n) => {
      const out = [];
      for (let k = 1; k <= nGiorni; k++) {
        const cod = cella[n + '|' + k];
        if (!cod) continue;
        const rg = rigaDi[n + '|' + k];
        out.push(
          rg && rg.codice === cod ? rg : { collaboratore: n, data: ym + '-' + String(k).padStart(2, '0'), codice: cod },
        );
      }
      (window._pianoRigheBordo || []).forEach((x) => {
        if (x.collaboratore === n) out.push(x);
      });
      return out;
    };
    const nelMese = (v) => {
      const d = new Date(v.domenica + 'T12:00:00');
      const da = new Date(d);
      da.setDate(da.getDate() - 6);
      const a = new Date(d);
      a.setDate(a.getDate() + 6);
      return a.toISOString().substring(0, 7) >= ym && da.toISOString().substring(0, 7) <= ym;
    };
    nomi.forEach((n) => {
      for (let giro = 0; giro < 8; giro++) {
        const viol = _pianoRiposiSettimanali(righeDiN(n)).filter(nelMese);
        if (!viol.length) return;
        const v = viol[0];
        const dom = new Date(v.domenica + 'T12:00:00');
        let risolto = false;
        // giorni vicini alla domenica (prima i piu vicini), solo turni messi da questa bozza
        const giorni = [];
        for (let off = 1; off <= 6; off++)
          [-off, off].forEach((o) => {
            const d = new Date(dom);
            d.setDate(d.getDate() + o);
            const iso = d.toISOString().substring(0, 10);
            if (iso.startsWith(ym)) giorni.push(parseInt(iso.substring(8, 10)));
          });
        for (const g of giorni) {
          if (risolto) break;
          const kN = n + '|' + g;
          if (!assegnatiRun.has(kN)) continue;
          const cod = cella[kN];
          const t = _pianoTurnoInfo(cod);
          if (!t) continue;
          const dstrG = ym + '-' + String(g).padStart(2, '0');
          // togliendo questo turno la domenica ha il suo riposo?
          const senza = righeDiN(n).filter((x) => String(x.data).substring(0, 10) !== dstrG);
          if (_pianoRiposiSettimanali(senza).some((x) => x.domenica === v.domenica && x.tipo === v.tipo)) continue;
          const dowG = new Date(dstrG + 'T12:00:00').getDay();
          for (const b of nomi) {
            if (b === n || cella[b + '|' + g]) continue;
            if (!candidatoOk(b, { turno_codice: cod }, t, g, dstrG, dowG, false, 0)) continue;
            const dur = parseFloat(t.durata_ore) || 0;
            // n: il turno si toglie (a fine bozza ricevera C)
            delete cella[kN];
            assegnatiRun.delete(kN);
            const iN = nuove.findIndex((x) => x.collaboratore === n && x.data === dstrG && x.codice === cod);
            if (iN >= 0) nuove.splice(iN, 1);
            const grT = (t.gruppo || '').toUpperCase();
            const fzN = (((_pianoCollabInfo(n) || {}).funzione || '') + '').toUpperCase();
            contaGiornoFz[grT + '|' + fzN + '|' + g] = Math.max(0, (contaGiornoFz[grT + '|' + fzN + '|' + g] || 0) - 1);
            contaGiornoTot[grT + '|' + g] = Math.max(0, (contaGiornoTot[grT + '|' + g] || 0) - 1);
            oreMese[n] = (oreMese[n] || 0) - dur;
            // b: prende il turno
            cella[b + '|' + g] = cod;
            assegnatiRun.add(b + '|' + g);
            registraAssegnazione(b, cod, g);
            oreMese[b] = (oreMese[b] || 0) + dur;
            nuove.push({
              collaboratore: b,
              data: dstrG,
              codice: cod,
              protetto: false,
              generato: true,
              reparto_dip: _pianoReparto(),
            });
            riposiSistemati++;
            risolto = true;
            break;
          }
        }
        if (!risolto) {
          riposiRestano.push(n.split(' ')[0] + ' domenica ' + _pianoGgMm(v.domenica));
          return;
        }
      }
    });
  }
  // ===== CGF DEI FESTIVI LAVORATI IN QUESTO MESE =====
  // Chi ha appena ricevuto un turno in un festivo con diritto matura un
  // recupero: si mette nei giorni DOPO il festivo, con le stesse regole.
  nomiCgf.forEach((n) => {
    const festiviLav = [];
    let cgfMese = 0;
    for (let g = 1; g <= nGiorni; g++) {
      const cod = cella[n + '|' + g];
      if (!cod) continue;
      const dstrG = ym + '-' + String(g).padStart(2, '0');
      if (festiviCgf.has(dstrG) && _pianoTurnoInfo(cod) && !malattie[n + '|' + dstrG]) festiviLav.push(g);
      if (cod === 'CGF') cgfMese++;
    }
    // quanti restano da dare per il mese: festivi del mese + resta precedente - CGF gia' nel mese
    const dovuti = contoCgf[n].resta + festiviLav.length - cgfMese;
    if (dovuti <= 0) return;
    const preferiti = [];
    festiviLav.forEach((g) => {
      for (let k = g + 1; k <= Math.min(nGiorni, g + 10); k++) preferiti.push(k);
    });
    scriviCgf(n, _pianoPiazzaCgf(n, dovuti, Object.assign({}, ctxCgf, { preferiti: preferiti })));
  });

  // RIEMPIMENTO C: come nei piani fatti a mano, nessuna cella resta vuota ·
  // ogni giorno senza turno/assenza riceve C (congedo, 0 ore, rigenerabile)
  let nCongedi = 0;
  nomi.forEach((n) => {
    const infoN = _pianoCollabInfo(n) || {};
    if (String(infoN.reparti_extra || '').trim()) return; // multi-reparto: niente C automatiche
    for (let g = 1; g <= nGiorni; g++) {
      if (giorniChiusi.has(g)) continue;
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
    !(await chiediConferma(
      'Genera bozza per ' +
        ym +
        ' (' +
        repartoLabel(_pianoReparto()) +
        '):\n\n• ' +
        (nuove.length + sostituzioniWd.length - nCgfAuto - nCongedi) +
        ' turni da assegnare' +
        (nCgfAuto ? '\n• ' + nCgfAuto + ' CGF automatici (compensazione festivi lavorati)' : '') +
        (daCancellareCgf.length
          ? '\n• ' + daCancellareCgf.length + ' CGF automatici tolti (festivo non lavorato)'
          : '') +
        (nCongedi ? '\n• ' + nCongedi + ' congedi C di riempimento (giorni senza turno)' : '') +
        '\n• ' +
        scoperti.length +
        ' posti senza candidato idoneo' +
        (riparati ? ' (altri ' + riparati + ' risolti spostando un turno)' : '') +
        (riposiSistemati
          ? '\n• ' + riposiSistemati + ' riposi attorno alla domenica sistemati spostando un turno a un collega'
          : '') +
        (riposiRestano.length
          ? '\n• riposo attorno alla domenica ancora da sistemare a mano: ' + riposiRestano.join(', ')
          : '') +
        '\n\nLe celle esistenti (vacanze, protette, malattie) NON vengono toccate.\nLa bozza si può eliminare con "Cancella piano". Procedere?',
    ))
  ) {
    // Le C di riempimento e le vacanze sono gia' state riscritte per poter
    // calcolare la bozza: chi rinuncia deve ritrovare il mese com'era.
    await _pianoRipristinaUltimoSnapshot("Bozza annullata: il mese e' tornato com'era");
    return;
  }
  try {
    for (const idC of daCancellareCgf) await secDel('piano', 'id=eq.' + idC);
    let inseriteTot = 0;
    for (let i = 0; i < nuove.length; i += 2500) {
      const r2 = await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove.slice(i, i + 2500) });
      inseriteTot += (r2 && r2.inserite) || 0;
    }
    const r = { inserite: inseriteTot };
    if (nuove.length && !inseriteTot) throw new Error('nessuna cella scritta dal database');
    // il database non sovrascrive una cella gia presente (una per persona e giorno):
    // se qualcuna e stata scartata si dice, invece di lasciare un buco nascosto
    if (inseriteTot < nuove.length)
      toastErrore(
        nuove.length -
          inseriteTot +
          ' celle della bozza non scritte: in quei giorni c era gia una cella (scritta da un altro settore o nel frattempo). Controlla gli Avvisi',
      );
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
        r.inserite +
        ' celle scritte' +
        (r.inserite < nuove.length ? ' su ' + nuove.length + " (le altre esistevano gia')" : '') +
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
    '</h3><p style="margin-bottom:14px;font-size:var(--fs-md,.875rem)">' +
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
  const mie = _pianoRighe.filter((r) => (r.reparto_dip || 'slots') === _pianoReparto()); // non le celle degli altri settori
  const n = tutto ? mie.length : mie.filter((r) => !r.protetto).length;
  if (!n) {
    toast('Niente da cancellare');
    return;
  }
  if (
    tutto &&
    !(await chiediConferma(
      'ATTENZIONE: verranno eliminate ANCHE le celle protette (vacanze, inserimenti manuali). Confermi?',
    ))
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
