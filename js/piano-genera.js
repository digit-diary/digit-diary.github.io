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
// GIORNI A SETTIMANA (preferenza collaboratore, es. 3 fra giovedi e domenica): quanti
// giorni di lavoro al massimo nella settimana lunedi-domenica; 0 = nessun limite
function _pianoMaxGiorniSett(nome) {
  const v = parseInt((_pianoCollabInfo(nome) || {}).giorni_settimana);
  return v > 0 && v < 7 ? v : 0;
}
// mettendo un turno a "nome" il giorno dstr resta entro i giorni a settimana?
// codRel(off) = codice della persona off giorni prima/dopo dstr (gli altri giorni
// della stessa settimana lunedi-domenica, anche nel mese prima o dopo)
function _pianoGiorniSettOk(nome, dstr, codRel) {
  const max = _pianoMaxGiorniSett(nome);
  if (!max) return true;
  const i = (new Date(String(dstr).substring(0, 10) + 'T12:00:00').getDay() + 6) % 7; // lunedi = 0
  let n = 1;
  for (let off = -i; off <= 6 - i; off++) if (off !== 0 && _pianoIsLavoro(codRel(off) || '')) n++;
  return n <= max;
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
  if (r.ora_inizio && r.ora_fine && (t || _pianoIsLavoro(r.codice))) {
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
// GIORNO DI LAVORO (decisione del titolare 05.10): un turno, oppure un codice di
// lavoro che non e un turno (JG, ufficio, uscita per servizio, corsi, formazione).
// Conta ovunque allo stesso modo: giorni di fila, riposo minimo, 4+1+1, domenica non
// libera. Elenco nella regola "codici_lavoro" (sigle separate da virgola); senza
// regola valgono quelle qui sotto. Una cella vuota NON e lavoro (= riposo).
const _PIANO_CODICI_LAVORO = 'JG,U,US,CS,LRD,F,1F';
let _pianoCodLavCache = null;
function _pianoCodiciLavoro() {
  // si rilegge solo se cambiano le regole o il settore (si chiama migliaia di volte)
  const regole = typeof pianoRegoleCache !== 'undefined' ? pianoRegoleCache : null;
  const rep = typeof _pianoReparto === 'function' ? _pianoReparto() : '';
  const c = _pianoCodLavCache;
  if (c && c.regole === regole && c.rep === rep && c.n === (regole ? regole.length : 0)) return c.set;
  const v = regole ? _pianoRegolaVal('codici_lavoro') : null;
  const testo = String(v == null ? _PIANO_CODICI_LAVORO : v).toUpperCase();
  _pianoCodLavCache = {
    regole: regole,
    rep: rep,
    n: regole ? regole.length : 0,
    set: new Set(testo.split(/[\s,;]+/).filter(Boolean)),
  };
  return _pianoCodLavCache.set;
}
function _pianoIsLavoro(codice) {
  if (!codice) return false;
  if (_pianoTurnoInfo(codice)) return true;
  return _pianoCodiciLavoro().has(String(codice).toUpperCase().trim());
}
// LEGGE SEMPRE ATTIVA (decisione del titolare 05.10): riposo minimo fra due giorni di
// lavoro e massimo di giorni di fila valgono in tutti i controlli e motori con il
// valore delle Regole; se la regola e spenta o a 0 vale il minimo di legge (11 h, 5).
function _pianoLimitiLegge() {
  const mc = parseInt(_pianoRegolaVal('max_consecutivi'));
  const mr = parseFloat(_pianoRegolaVal('min_riposo_ore'));
  return { maxCons: mc > 0 ? mc : 5, minRiposo: mr > 0 ? mr : 11 };
}
// ore di riposo fra due celle di lavoro (righe o {codice, data, ora_inizio?, ora_fine?}),
// con gli orari VERI del giorno (prolungamenti, orario scritto sulla cella, JG).
// null = non si sa (codice di lavoro senza orario): nessun avviso.
function _pianoRiposoOreTra(a, b) {
  const x = _pianoIntervalloLavoro(a);
  const y = _pianoIntervalloLavoro(b);
  if (!x || !y) return null;
  return Math.round((y.ini - x.fin) * 100) / 100;
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
  // decisione del titolare 05.10: la domenica libera valida e C, CGF o ND (vuota =
  // riposo). Prima bastava che non fosse un turno: JG, U, F (lavoro) e WD, PC... contavano
  const cDom = String(codDom || '')
    .trim()
    .toUpperCase();
  if (cDom && !['C', 'CGF', 'ND'].includes(cDom)) return false;
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
  // si avvisa per il lavoro (turni, JG, U, corsi) e per un sabato che finisce dopo le 23;
  // una V o una M scritte di domenica non sono una "domenica persa" da segnalare
  if (!_pianoIsLavoro(codiceNuovo) && !(dow === 6 && !_pianoSabatoEntro23(codiceNuovo, sab, null))) return null;
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
// CONTROLLO DELLE REGOLE (Valida regole) diviso in due parti riutilizzabili,
// cosi la ricerca della bozza e le proposte di cambio usano le STESSE regole:
//  - _pianoViolazioniPersona: tutto quello che riguarda una persona sola
//    (riposi, consecutivi, ore della settimana e del mese, domeniche, chi fa
//    cosa, non disponibilita);
//  - _pianoViolazioniGruppi: le regole fra persone (accompagnamento, limiti e
//    minimi per gruppo).
// Ogni voce: { nome, giorno, msg, celle: [date segnate nel calendario] }.
function _pianoCtxViolazioni(ym) {
  return {
    ym: ym,
    nGiorni: _pianoUltimoGiorno(ym),
    maxCons: _pianoLimitiLegge().maxCons,
    minRiposo: _pianoLimitiLegge().minRiposo,
    no4w1c1w: _pianoRegolaVal('no_4w1c1w') === 'TRUE',
    diurnoPreV: _pianoRegolaVal('diurno_prima_vacanza') === 'TRUE',
    maxSett: _pianoOreSettimanaMax(),
    ndV: _pianoNdMese(ym),
    domeniche: _pianoRegolaVal('domeniche_libere_anno') != null,
  };
}
// righeMese: celle della persona nel mese; righeSett: le stesse piu i giorni delle
// settimane a cavallo (mese prima e dopo)
function _pianoViolazioniPersona(nome, righeMese, righeSett, ctx) {
  const ym = ctx.ym;
  const nGiorni = ctx.nGiorni;
  const out = [];
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  const aggiungi = (giorno, msg) => out.push({ nome: nome, giorno: giorno, msg: msg, celle: [dstrDi(giorno)] });
  const giorni = {};
  const righeG = {}; // g -> riga (orari veri per il riposo)
  righeMese.forEach((r) => {
    giorni[parseInt(r.data.split('-')[2])] = r.codice;
    righeG[parseInt(r.data.split('-')[2])] = r;
  });
  // FINE DEL MESE PRIMA (dalle settimane a cavallo): giorno 0 = ultimo giorno del mese
  // prima, -1 il penultimo... Contano per i giorni di fila, il riposo fra l ultimo
  // turno del mese prima e il primo di questo e il riposo singolo 4+1+1. Prima questi
  // controlli si fermavano al giorno 1: un turno di notte il 31 seguito da un turno
  // alle 6 dell 1 non risultava. Le violazioni si segnano sempre nei giorni del mese.
  const inizioMese = new Date(ym + '-01T12:00:00');
  (righeSett || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    if (d >= ym + '-01') return;
    const diff = Math.round((inizioMese - new Date(d + 'T12:00:00')) / 86400000);
    if (diff >= 1 && diff <= 14) {
      giorni[1 - diff] = r.codice;
      righeG[1 - diff] = r;
    }
  });
  // INIZIO DEL MESE DOPO (gia pianificato): i giorni nGiorni+1... continuano le serie
  // di giorni di fila e il riposo dell ultimo giorno del mese
  const fineMese = new Date(dstrDi(nGiorni) + 'T12:00:00');
  (righeSett || []).forEach((r) => {
    const d = String(r.data).substring(0, 10);
    if (d <= dstrDi(nGiorni)) return;
    const diff = Math.round((new Date(d + 'T12:00:00') - fineMese) / 86400000);
    if (diff >= 1 && diff <= 14) {
      giorni[nGiorni + diff] = r.codice;
      righeG[nGiorni + diff] = r;
    }
  });
  const rigaDi = (g) => righeG[g] || { codice: giorni[g] || '', data: dstrDi(g) };
  // riposo settimanale attorno alla domenica (35 / 47 ore)
  _pianoRiposiSettimanali(righeSett).forEach((v) => {
    const g = v.domenica;
    if (!g.startsWith(ym)) return;
    out.push({ nome: v.nome, giorno: parseInt(g.substring(8, 10)), msg: _pianoTestoRiposo(v), celle: [g] });
  });
  // ore lavorate nella settimana lunedi-domenica oltre il massimo (45.1)
  const maxSett = ctx.maxSett;
  _pianoSettimaneOltre(righeSett, maxSett).forEach((s) => {
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
    out.push({ nome: s.nome, giorno: parseInt(nelMese[0].substring(8, 10)), msg: msg, celle: nelMese });
  });
  // giorni di lavoro nella settimana oltre la preferenza "giorni a settimana" (una
  // voce per settimana, anche a cavallo del mese: i giorni fuori dal mese contano)
  const maxGS = _pianoMaxGiorniSett(nome);
  if (maxGS) {
    const dow1 = (new Date(dstrDi(1) + 'T12:00:00').getDay() + 6) % 7; // lunedi = 0
    for (let lun = 1 - dow1; lun <= nGiorni; lun += 7) {
      const lav = [];
      for (let k = lun; k < lun + 7; k++) if (_pianoIsLavoro(giorni[k] || '')) lav.push(k);
      if (lav.length <= maxGS) continue;
      const nelMese = lav.filter((k) => k >= 1 && k <= nGiorni);
      if (!nelMese.length) continue;
      out.push({
        nome: nome,
        giorno: nelMese[0],
        msg:
          lav.length +
          ' giorni di lavoro nella settimana ' +
          _pianoGgMm(_pianoLunediDi(dstrDi(nelMese[0]))) +
          ' (preferenza: massimo ' +
          maxGS +
          ' a settimana)',
        celle: nelMese.map(dstrDi),
      });
    }
  }
  if (righeMese.length) {
    const maxCons = ctx.maxCons;
    const minRiposo = ctx.minRiposo;
    let consec = 0;
    let segnalata = false;
    // giorni di fila gia lavorati alla fine del mese prima
    for (let k = 0; k >= -13 && _pianoIsLavoro(giorni[k] || ''); k--) consec++;
    // da g = 0: il riposo fra l ultimo giorno del mese prima e il primo di questo
    for (let g = 0; g <= nGiorni; g++) {
      const cod = giorni[g] || '';
      const lavoro = _pianoIsLavoro(cod);
      // 1) massimo giorni lavorativi consecutivi: una volta per serie, nel primo giorno
      //    oltre il massimo (anche se la serie arriva gia lunga dal mese prima), con la
      //    lunghezza vera della serie (contando anche il mese dopo gia pianificato)
      if (g === 0) {
        // giorno del mese prima: gia contato sopra
      } else if (lavoro) {
        consec++;
        if (maxCons && consec > maxCons && !segnalata) {
          let tot = consec;
          for (let k = g + 1; k <= nGiorni + 14 && _pianoIsLavoro(giorni[k] || ''); k++) tot++;
          aggiungi(g, tot + ' giorni lavorativi consecutivi (max ' + maxCons + ')');
          segnalata = true;
        }
      } else {
        consec = 0;
        segnalata = false;
      }
      // 2) riposo minimo fra due giorni di lavoro, con gli orari veri delle celle
      if (minRiposo && lavoro && _pianoIsLavoro(giorni[g + 1] || '')) {
        const riposo = _pianoRiposoOreTra(rigaDi(g), rigaDi(g + 1));
        if (riposo != null && riposo < minRiposo - 0.001)
          aggiungi(
            Math.min(g + 1, nGiorni),
            'solo ' + riposo.toFixed(1) + 'h di riposo dopo ' + cod + ' (min ' + minRiposo + 'h)',
          );
      }
      // 3) vietato 4 lavoro + 1 riposo + 1 lavoro (una cella vuota e un riposo)
      if (ctx.no4w1c1w && !lavoro && g >= 1) {
        let prima = 0;
        for (let k = g - 1; k >= -13 && _pianoIsLavoro(giorni[k] || ''); k--) prima++;
        if (prima >= 4 && _pianoIsLavoro(giorni[g + 1] || ''))
          aggiungi(g, 'riposo singolo dopo ' + prima + ' giorni di lavoro (vietato 4+1+1)');
      }
      // 4) turno diurno il giorno prima delle vacanze
      // (il giorno prima nel mese prima resta del mese prima: si segna li)
      if (
        g >= 2 &&
        ctx.diurnoPreV &&
        (cod === 'V' || cod === 'V1') &&
        (giorni[g - 1] || '') &&
        _pianoIsLavoro(giorni[g - 1])
      ) {
        const tp = _pianoTurnoInfo(giorni[g - 1]);
        if (tp && tp.tipo === 'NOTTURNO')
          aggiungi(g - 1, 'turno notturno il giorno prima delle vacanze (deve essere diurno)');
      }
      // 5) regole "chi fa cosa" del settore (regole di gruppo turni_solo_funzioni
      //    e funzione_turni_giorni: create e modificate dalla scheda Regole di gruppo)
      if (lavoro && g >= 1) {
        const t = _pianoTurnoInfo(cod);
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        const vfz = t ? _pianoViolazioneFunzioneTurno(nome, t, dow, false) : null;
        if (vfz) aggiungi(g, vfz);
      }
    }
  }
  // TOLLERANZA ORE (regole personalizzabili: tolleranza_ore ±, tolleranza_ore_sopra/
  // sotto per fissi e jolly con %, jolly_ore_min/max)
  {
    const info = _pianoCollabInfo(nome) || {};
    const pct = parseFloat(info.percentuale) || 1;
    let ore = 0;
    let conOre = false;
    righeMese.forEach((r) => {
      const o = _pianoOreDiRiga(r, pct);
      if (o) {
        ore += o;
        conOre = true;
      }
    });
    if (conOre) {
      const lim = _pianoLimitiOre(nome, nGiorni);
      if (lim.min != null || lim.max != null) {
        const oreT = Math.round(ore * 10) / 10;
        const arr = (x) => Math.round(x * 10) / 10;
        const coda = 'h (regole tolleranza' + (lim.obiettivo == null ? ' jolly' : '') + ')';
        if (lim.max != null && oreT > lim.max)
          out.push({
            nome: nome,
            giorno: 0,
            msg: 'ore mese ' + oreT + 'h SOPRA il massimo ' + arr(lim.max) + coda,
            celle: [],
          });
        else if (lim.min != null && oreT < lim.min)
          out.push({
            nome: nome,
            giorno: 0,
            msg: 'ore mese ' + oreT + 'h SOTTO il minimo ' + arr(lim.min) + coda,
            celle: [],
          });
      }
    }
  }
  // NON DISPONIBILITA': un turno assegnato in un giorno dichiarato ND
  // (anche JG, U, corsi: e lavoro come un turno, decisione del 05.10)
  righeMese.forEach((r) => {
    if (!_pianoIsLavoro(r.codice) || r.codice === 'ND') return;
    if (ctx.ndV[r.collaboratore + '|' + r.data])
      aggiungi(parseInt(r.data.split('-')[2]), r.codice + " su un giorno di NON disponibilita' (dal Diario)");
  });
  // DOMENICHE LIBERE (OLL2 art. 24: minimo 12 all'anno · regola aziendale:
  // la domenica conta solo se il sabato si finisce entro le 23)
  if (ctx.domeniche && righeMese.length) {
    const info = _pianoCollabInfo(nome);
    if (info && info.funzione !== 'RESP') {
      let libere = 0;
      let ultimaDom = 0;
      for (let g = 1; g <= nGiorni; g++) {
        const dow = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00').getDay();
        if (dow !== 0) continue;
        ultimaDom = g;
        const cod = giorni[g];
        const lavora = cod && _pianoTurnoInfo(cod);
        if (lavora) continue;
        if (_pianoDomenicaEsclusa(cod)) continue; // vacanza o malattia: non conta tra le 12
        // il sabato prima (per la prima domenica del mese: dal mese precedente)
        const dSab = new Date(ym + '-' + String(g).padStart(2, '0') + 'T12:00:00');
        dSab.setDate(dSab.getDate() - 1);
        const isoSab = dSab.toISOString().substring(0, 10);
        const rSab = righeSett.find((r) => r.collaboratore === nome && String(r.data).startsWith(isoSab));
        const codSab = rSab ? rSab.codice : g > 1 ? giorni[g - 1] : null;
        if (!_pianoDomenicaValida(cod, codSab, isoSab, rSab, undefined, nome)) {
          aggiungi(g, 'domenica non conteggiabile come libera: il sabato finisce oltre le 23');
          continue;
        }
        libere++;
      }
      if (ultimaDom && libere === 0)
        aggiungi(ultimaDom, "nessuna domenica libera valida nel mese (minimo 12 all'anno)");
    }
  }
  return out;
}
// regole fra persone: accompagnamento, limiti e minimi per gruppo (righe del mese)
function _pianoViolazioniGruppi(righe, ctx) {
  const ym = ctx.ym;
  const nGiorni = ctx.nGiorni;
  const _pianoRighe = righe;
  const out = [];
  const lista = { push: (x) => out.push({ nome: x.nome, giorno: x.giorno, msg: x.msg, celle: [] }) };
  const aggiungi = (nome, giorno, msg) =>
    out.push({ nome: nome, giorno: giorno, msg: msg, celle: [ym + '-' + String(giorno).padStart(2, '0')] });
  // ===== REGOLE DI GRUPPO (come il solver Turnivo) =====
  if (pianoRegoleGruppoCache.length) {
    const perGruppoGiornoFz = {}; // GRUPPO|FZ|g -> [nomi]
    const perGruppoMeseFz = {}; // GRUPPO|FZ -> Set(nomi)
    const perGruppoGiornoTot = {}; // GRUPPO|g -> n
    _pianoRighe.forEach((r) => {
      if (!_pianoCopreQui(r)) return; // copertura: solo i turni di questo settore
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
              if (!_pianoCopreQui(r)) return;
              const t = _pianoTurnoInfo(r.codice);
              if (!t || (t.gruppo || '').toUpperCase() !== gr) return;
              if (tipoF && (t.tipo || '').toUpperCase() !== tipoF) return;
              if ((((_pianoCollabInfo(r.collaboratore) || {}).funzione || '') + '').toUpperCase() === fu) conta++;
            });
            // segnala solo se quel giorno il gruppo ha turni del tipo richiesto
            let turniQuelGiorno = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g) return;
              if (!_pianoCopreQui(r)) return;
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
        } else if (tipoR === 'minimo_livello_giorno') {
          // 'L3:2:NOTTURNO:4,5' = almeno 2 persone di livello L3 o piu (Formazione) sui
          // turni NOTTURNO del gruppo, venerdi e sabato (0 = lunedi); tipo e giorni facoltativi
          const lvMin = _pianoLivelloDaTesto(parti[0]);
          const tipoF = (parti[2] || '').toUpperCase();
          const dows = parti[3] ? parti[3].split(',').map((x) => parseInt(x)) : null;
          const nelGruppo = (t) =>
            t &&
            (gr === '*' || (t.gruppo || '').toUpperCase() === gr) &&
            (!tipoF || (t.tipo || '').toUpperCase() === tipoF);
          for (let g = 1; g <= nGiorni; g++) {
            const dstr = ym + '-' + String(g).padStart(2, '0');
            const dowPy = (new Date(dstr + 'T12:00:00').getDay() + 6) % 7;
            if (dows && !dows.includes(dowPy)) continue;
            let conta = 0;
            let turniQuelGiorno = 0;
            _pianoRighe.forEach((r) => {
              if (parseInt(r.data.split('-')[2]) !== g || !_pianoCopreQui(r)) return;
              if (!nelGruppo(_pianoTurnoInfo(r.codice))) return;
              turniQuelGiorno++;
              const lv = _pianoLivelloNelSettore(_pianoCollabInfo(r.collaboratore));
              if (lv != null && lv >= lvMin) conta++;
            });
            if (turniQuelGiorno && conta < nVal)
              lista.push({
                nome: '(' + (gr === '*' ? 'settore' : gr) + ')',
                giorno: g,
                msg:
                  'giorno ' +
                  g +
                  ': servono ' +
                  nVal +
                  ' di livello L' +
                  lvMin +
                  ' o piu' +
                  (gr !== '*' ? ' nel gruppo ' + gr : '') +
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
  return out;
}
function _pianoCalcolaViolazioni() {
  const ym = _pianoMeseSel;
  const ctx = _pianoCtxViolazioni(ym);
  const celle = {};
  const lista = [];
  const metti = (v) => {
    v.celle.forEach((d) => (celle[v.nome + '|' + d] = celle[v.nome + '|' + d] || []).push(v.msg));
    lista.push({ nome: v.nome, giorno: v.giorno, msg: v.msg });
  };
  const mese = {};
  _pianoRighe.forEach((r) => (mese[r.collaboratore] = mese[r.collaboratore] || []).push(r));
  const sett = {};
  _pianoRigheSettimane().forEach((r) => (sett[r.collaboratore] = sett[r.collaboratore] || []).push(r));
  Object.keys(Object.assign({}, sett, mese)).forEach((nome) =>
    _pianoViolazioniPersona(nome, mese[nome] || [], sett[nome] || [], ctx).forEach(metti),
  );
  _pianoViolazioniGruppi(_pianoRighe, ctx).forEach(metti);
  // PREFERENZE del collaboratore (solo diurni, solo notturni, giorni di lavoro): la
  // bozza le rispetta, ma un turno scritto a mano o rimasto da una bozza fatta prima
  // di cambiare la preferenza si segnala qui
  const NOMI_G = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  _pianoRighe.forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    const info = t && _pianoCollabInfo(r.collaboratore);
    if (!info) return;
    const dstr = String(r.data).substring(0, 10);
    if (dstr.substring(0, 7) !== ym) return;
    const dow = new Date(dstr + 'T12:00:00').getDay();
    let msg = null;
    if (!PianoRegole.lavoraNelGiorno(info, dow))
      msg =
        'preferenza giorni di lavoro: ' +
        r.codice +
        ' di ' +
        NOMI_G[dow] +
        ' (lavora solo ' +
        (typeof _pianoGiorniLavoroTesto === 'function'
          ? _pianoGiorniLavoroTesto(info.giorni_lavoro)
          : info.giorni_lavoro) +
        ')';
    else if (info.solo_diurni && t.tipo === 'NOTTURNO') msg = 'preferenza solo diurni: ' + r.codice + ' e notturno';
    else if (info.solo_notti && t.tipo !== 'NOTTURNO')
      msg = 'preferenza solo notturni: ' + r.codice + ' non e notturno';
    // fuori dal contratto (dopo la fine o prima dell assunzione): arriva da incolla vecchi o
    // dall import; a mano e bloccato
    else if (!_pianoOperativoIl(r.collaboratore, dstr))
      msg = r.codice + ': ' + _pianoMotivoFuoriRapporto(r.collaboratore, dstr);
    // gruppo non idoneo (settori, competenze, regole di gruppo): come l avviso a mano
    // "non risulta formato". I turni bloccati della persona non contano: a mano si possono
    // scrivere senza avviso (decisione S1/S3)
    else if (_pianoCopreQui(r) && !_pianoIdoneoAMano(r.collaboratore, t))
      msg = r.codice + ': non risulta formato/idoneo per il gruppo ' + (t.gruppo || '');
    if (msg) metti({ nome: r.collaboratore, giorno: parseInt(dstr.substring(8, 10)), msg: msg, celle: [dstr] });
  });
  return { celle: celle, lista: lista };
}

// CANDIDATO VALIDO (cerca cambio, copertura malattia/ND, Migliora ore): le violazioni
// di una persona come le vede Valida (_pianoViolazioniPersona: riposo con gli orari
// veri, giorni di fila nei due sensi, 4+1+1, ore della settimana, riposo attorno alla
// domenica, giorni a settimana, chi fa cosa, ND...) come insieme di chiavi giorno|regola.
// Uno spostamento e valido se dopo non c e nessuna chiave nuova per nessuna delle
// persone toccate. Le ore del mese sotto il minimo non contano (spostare un turno serve
// proprio a quello). codIdx(k) / rigaIdx(k): codice e riga della persona nel giorno k
// del mese ym (0, -1... = mese prima, oltre l ultimo = mese dopo, fino a 14 giorni).
function _pianoChiaviViolazioni(nome, ym, codIdx, rigaIdx, ctxV) {
  const nG = _pianoUltimoGiorno(ym);
  const primo = new Date(ym + '-01T12:00:00');
  const dataIdx = (k) => {
    const d = new Date(primo);
    d.setDate(d.getDate() + k - 1);
    return dataLocaleISO(d);
  };
  const mese = [];
  const sett = [];
  for (let k = -13; k <= nG + 14; k++) {
    const c = codIdx(k);
    if (!c || c === 'FINE') continue;
    const r = rigaIdx ? rigaIdx(k) : null;
    const riga = r && r.codice === c ? r : { collaboratore: nome, data: dataIdx(k), codice: c };
    sett.push(riga);
    if (k >= 1 && k <= nG) mese.push(riga);
  }
  return new Set(
    _pianoViolazioniPersona(nome, mese, sett, ctxV || _pianoCtxViolazioni(ym))
      .filter((v) => !/SOTTO il minimo/.test(v.msg))
      .map((v) => v.giorno + '|' + v.msg.replace(/[0-9]+([.,][0-9]+)?/g, '#')),
  );
}
function _pianoViolazioniNuove(prima, dopo) {
  return [...dopo].filter((k) => !prima.has(k));
}
// ASSENZE che rendono una persona non disponibile in un giorno anche se la cella del
// piano e libera: ND e malattie registrate nel Diario, congedi non pagati, fuori dal
// contratto. Una funzione per ricerca, con i mesi letti una volta sola.
function _pianoAssenzeLettore() {
  const perMese = {};
  const di = (ym) =>
    perMese[ym] ||
    (perMese[ym] = Object.assign(
      {},
      _pianoNdMese(ym),
      _pianoMalattieMese(ym),
      typeof _pianoCnpMese === 'function' ? _pianoCnpMese(ym) : {},
    ));
  return (nome, dstr) => !!di(String(dstr).substring(0, 7))[nome + '|' + dstr] || !_pianoOperativoIl(nome, dstr);
}
function validaPiano() {
  if (!_pianoAzioneAutoConsentita('genera')) return; // Valida regole: con il permesso Genera
  setTimeout(() => controllaFormazioniCompletate(true), 800);
  const r = _pianoCalcolaViolazioni();
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  logAzione('Piano validato', _pianoMeseSel + ' · ' + r.lista.length + ' violazioni');
  renderPiano();
}

// CONTROLLO DI BASE DEL PIANO (v374), come il file "CONTROLLO PIANO SLOT/VALET AUTO"
// del titolare: solo riposo minimo fra due turni e giorni lavorativi di fila, con il
// mese precedente. Regole dal programma (min_riposo_ore, max_consecutivi, sempre
// attive: _pianoLimitiLegge). Decisione del titolare 05.10: una cella VUOTA e un
// riposo (prima, come nell Excel, non azzerava); i codici di lavoro che non sono turni
// (JG, U, corsi...) contano come lavoro; ogni altro codice (C, V, M, CGF...) azzera.
// piano: { nome: { 'YYYY-MM-DD': { cod, ini, fin } } } con il mese ym e i giorni prima.
// Ritorna [{ nome, data, errore, dettagli, turni, daPrima }], una riga per riposo
// insufficiente e una per periodo di troppi giorni di fila.
function _pianoControlloBase(ym, piano) {
  const { minRiposo, maxCons } = _pianoLimitiLegge();
  const MESI_L = typeof MESI_FULL !== 'undefined' ? MESI_FULL : [];
  const pr = new Date(ym + '-01T12:00:00');
  pr.setMonth(pr.getMonth() - 1);
  const nomePrima = (MESI_L[pr.getMonth()] || '').toLowerCase();
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
  const ora = (hhmm) => {
    const p = String(hhmm || '').split(':');
    return p.length >= 2 ? parseInt(p[0]) * 60 + parseInt(p[1]) : null;
  };
  const out = [];
  Object.keys(piano)
    .sort((a, b) => a.localeCompare(b))
    .forEach((nome) => {
      const giorni = Object.keys(piano[nome]).sort();
      if (!giorni.length) return;
      // tutti i giorni dal primo noto all ultimo del mese, anche quelli senza cella
      const tutti = [];
      const d0 = new Date(giorni[0] + 'T12:00:00');
      const ultimo = giorni[giorni.length - 1];
      for (let d = new Date(d0); dataLocaleISO(d) <= ultimo; d.setDate(d.getDate() + 1)) tutti.push(dataLocaleISO(d));
      let cons = 0;
      let inizioSerie = null;
      let fineAss = null; // minuti assoluti dalla mezzanotte del primo giorno
      let codPrec = '';
      let dataPrec = '';
      let serieSegnata = null;
      const chiudiSerie = () => {
        if (serieSegnata) out.push(serieSegnata);
        serieSegnata = null;
      };
      tutti.forEach((dstr, i) => {
        const cella = piano[nome][dstr];
        const cod = cella ? String(cella.cod || '').toUpperCase() : '';
        const t = _pianoTurnoInfo(cod);
        if (!_pianoIsLavoro(cod)) {
          // giorno di riposo, assenza o cella vuota: azzera
          chiudiSerie();
          cons = 0;
          inizioSerie = null;
          fineAss = null;
          codPrec = '';
          dataPrec = '';
          return;
        }
        cons++;
        if (cons === 1) inizioSerie = dstr;
        const nelMese = dstr.startsWith(ym);
        if (cons > maxCons) {
          if (!serieSegnata && nelMese)
            serieSegnata = {
              nome: nome,
              data: dstr,
              errore: 'Troppi giorni di fila',
              dettagli: '',
              turni: '',
              daPrima: !inizioSerie.startsWith(ym),
              _inizio: inizioSerie,
            };
          if (serieSegnata) {
            serieSegnata._fine = dstr;
            serieSegnata.dettagli =
              cons +
              ' giorni di fila dal ' +
              gg(serieSegnata._inizio) +
              ' al ' +
              gg(dstr) +
              ' (max ' +
              maxCons +
              ')' +
              (serieSegnata.daPrima ? ' (da ' + nomePrima + ')' : '');
          }
        }
        // orario: quello scritto sulla cella, altrimenti quello del turno; un codice di
        // lavoro senza orario (es. U) conta per i giorni di fila ma non per il riposo
        const ini = ora((cella && cella.ini) || (t && t.ora_inizio));
        const fin = ora((cella && cella.fin) || (t && t.ora_fine));
        if (ini == null || fin == null) {
          fineAss = null;
          return;
        }
        const inizioAss = i * 1440 + ini;
        if (fineAss != null && nelMese) {
          const riposo = (inizioAss - fineAss) / 60;
          if (riposo >= 0 && riposo < minRiposo && riposo <= 48)
            out.push({
              nome: nome,
              data: dstr,
              errore: 'Riposo insufficiente',
              dettagli:
                'Solo ' +
                riposo.toFixed(1) +
                ' ore tra turni (min ' +
                minRiposo +
                ')' +
                (dataPrec && !dataPrec.startsWith(ym) ? ' (da ' + nomePrima + ')' : ''),
              turni: codPrec + ' -> ' + cod,
              daPrima: !!(dataPrec && !dataPrec.startsWith(ym)),
            });
        }
        fineAss = i * 1440 + (fin <= ini ? fin + 1440 : fin);
        codPrec = cod;
        dataPrec = dstr;
      });
      chiudiSerie();
    });
  return out.sort((a, b) => a.nome.localeCompare(b.nome) || a.data.localeCompare(b.data));
}

// finestra con la tabella come il foglio "Errori Turni": Importa com e / Importa e
// proponi correzioni / Annulla. Ritorna 'importa' | 'correggi' | null
function _pianoFinestraControllo(titolo, testo, errori) {
  return new Promise((fine) => {
    const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
    const velo = document.createElement('div');
    velo.className = 'finestra-velo';
    velo.innerHTML =
      '<div class="finestra-box" role="dialog" aria-modal="true" style="width:min(860px,100%);max-height:90vh"><h3>' +
      escP(titolo) +
      '</h3><div class="finestra-testo" style="margin-bottom:8px">' +
      escP(testo) +
      '</div><div class="fzp-scorri" style="max-height:46vh"><table class="fzp-tab" style="width:100%"><thead><tr><th>Collaboratore</th><th>Data</th><th>Errore</th><th>Dettagli</th><th>Turni</th></tr></thead><tbody>' +
      errori
        .map(
          (e) =>
            '<tr><td>' +
            escP(e.nome) +
            '</td><td>' +
            gg(e.data) +
            '</td><td>' +
            escP(e.errore) +
            '</td><td>' +
            escP(e.dettagli) +
            '</td><td>' +
            escP(e.turni || '') +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div><div class="finestra-pulsanti" style="flex-wrap:wrap;gap:8px"><button type="button" class="finestra-no" data-s="">Annulla</button><button type="button" class="finestra-no" data-s="importa">Importa com e</button><button type="button" class="finestra-ok" data-s="correggi">Importa e proponi correzioni</button></div></div>';
    document.body.appendChild(velo);
    velo.querySelectorAll('button[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        velo.remove();
        fine(b.dataset.s || null);
      }),
    );
  });
}

// PROPOSTA DI CORREZIONE dopo l import: la ricerca lavora solo attorno ai giorni con
// un errore (3 giorni prima e dopo), puo spostare anche le celle del file e i C
// (non vacanze, malattie, celle bloccate, giorni chiusi), con pochi cambi. Mostra
// prima/dopo e scrive solo con Applica.
async function pianoProponiCorrezioniImport(ym, errori) {
  if (_pianoMeseSel !== ym || !errori.length) return;
  // MIRATA: solo i giorni degli errori (riposo: anche il giorno prima; giorni di fila:
  // tutto il periodo), cosi i cambi restano pochi e vicini al problema
  const giorni = new Set();
  const aggiungi = (dstr) => dstr.startsWith(ym) && giorni.add(dstr);
  errori.forEach((e) => {
    const d = new Date(e.data + 'T12:00:00');
    aggiungi(e.data);
    d.setDate(d.getDate() - 1);
    aggiungi(dataLocaleISO(d));
    if (e._inizio && e._fine)
      for (let x = new Date(e._inizio + 'T12:00:00'); dataLocaleISO(x) <= e._fine; x.setDate(x.getDate() + 1))
        aggiungi(dataLocaleISO(x));
  });
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" style="max-width:460px"><h3>Cerco le correzioni</h3><div class="finestra-testo" id="imp-cor">Preparo il mese...</div></div>';
  document.body.appendChild(velo);
  let res;
  try {
    res = await pianoRicercaCalcola(
      60,
      (x) => {
        const el = document.getElementById('imp-cor');
        if (el) el.textContent = 'Provo combinazioni: ' + Math.round(x.frazione * 100) + '%';
      },
      {
        prepara: { estesa: true, cMobili: true, cMobiliPer: new Set(errori.map((e) => e.nome)), giorni: giorni },
        motore: { pesoCambio: 2000 },
        // stesso metro del controllo di base: solo riposi e giorni di fila (con il mese
        // prima); gli altri controlli li fa la verifica finale
        costoPersona: (prep) => {
          const coda = {};
          _pianoRigheSettimane().forEach((r) => {
            const d = String(r.data).substring(0, 10);
            if (d < ym + '-01') (coda[r.collaboratore] = coda[r.collaboratore] || {})[d] = { cod: r.codice };
          });
          return (nome, mappa) => {
            const p = Object.assign({}, coda[nome] || {});
            Object.keys(mappa || {}).forEach((d) => {
              const c = String(mappa[d] || '').replace(/^[#~]/, '');
              p[d] = { cod: c || (prep.conRiempimento ? 'C' : '') };
            });
            return 300000 * _pianoControlloBase(ym, { [nome]: p }).length;
          };
        },
      },
    );
  } catch (e) {
    velo.remove();
    toastErrore('Ricerca non riuscita: ' + (e.message || e));
    return;
  }
  velo.remove();
  // stesso controllo di base prima e dopo i cambi proposti
  const mappa = (righe) => {
    const m = {};
    righe.forEach((r) => {
      if ((r.reparto_dip || 'slots') !== _pianoReparto() && !_pianoCopreQui(r)) return;
      (m[r.collaboratore] = m[r.collaboratore] || {})[String(r.data).substring(0, 10)] = {
        cod: r.codice,
        ini: r.ora_inizio,
        fin: r.ora_fine,
      };
    });
    return m;
  };
  const primaRighe = _pianoRigheSettimane();
  const prima = _pianoControlloBase(ym, mappa(primaRighe));
  const dopoMappa = mappa(primaRighe);
  res.cambi.forEach((c) => {
    const cod = c.dopo || (res.prep.conRiempimento ? 'C' : '');
    (dopoMappa[c.nome] = dopoMappa[c.nome] || {})[c.data] = cod ? { cod: cod } : undefined;
  });
  const dopo = _pianoControlloBase(ym, dopoMappa);
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
  // si accetta solo se gli errori calano e non ne nasce nessuno nuovo
  // per persona e tipo: una serie di giorni di fila spezzata da un cambio puo
  // cominciare un altro giorno, ma non e un errore nuovo
  const chiave = (e) => e.nome + '|' + e.errore;
  const contaPer = (lista) => {
    const m = {};
    lista.forEach((e) => (m[chiave(e)] = (m[chiave(e)] || 0) + 1));
    return m;
  };
  const cPrima = contaPer(prima);
  const cDopo = contaPer(dopo);
  const nuoviErrori = Object.keys(cDopo)
    .filter((k) => cDopo[k] > (cPrima[k] || 0))
    .map((k) => ({ nome: k.split('|')[0], data: '', errore: k.split('|')[1] }));
  // traccia per capire una proposta scartata (console del browser)
  window._ultimaCorrezioneImport = {
    migliore: res.migliore,
    cambi: res.cambi.map((c) => c.nome + ' ' + c.data + ' ' + (c.prima || '-') + '>' + (c.dopo || '-')),
    prima: prima.length,
    dopo: dopo.length,
    nuovi: nuoviErrori.map((e) => e.nome + ' ' + e.errore),
    legge: res.prima.legge + '>' + res.dopo.legge,
    scoperti: res.prima.scoperti + '>' + res.dopo.scoperti,
  };
  // NESSUNA VIOLAZIONE NUOVA del programma per le persone toccate (controllo 05.10: la
  // proposta Rondinella 9 -> S7 toglieva un riposo corto ma creava 45.6 ore nella
  // settimana, e la finestra diceva "Nessuna altra regola peggiora"): per ogni persona
  // cambiata si confrontano le violazioni per tipo prima e dopo
  const tipoDi = (msg) => {
    const i = _PIANO_TIPI_VIOLAZIONE.findIndex((t) => t[1].test(msg));
    return i < 0 ? 'altro' : _PIANO_TIPI_VIOLAZIONE[i][0];
  };
  const nuoveRegole = [];
  try {
    const toccate = [...new Set(res.cambi.map((c) => c.nome))];
    const prob = res.prep.problema;
    toccate.forEach((n) => {
      const conta = (lista) => {
        const m = {};
        lista.forEach((v) => (m[tipoDi(v.msg)] = (m[tipoDi(v.msg)] || 0) + 1));
        return m;
      };
      const pA = conta(res.prep.dettaglioPersona(n, prob.stato[n] || {}));
      const pB = conta(res.prep.dettaglioPersona(n, (res.stato || {})[n] || {}));
      Object.keys(pB).forEach((t) => {
        if (pB[t] > (pA[t] || 0)) nuoveRegole.push(n + ': ' + t);
      });
    });
  } catch (e) {
    nuoveRegole.push('controllo non riuscito (' + ((e && e.message) || e) + ')');
  }
  window._ultimaCorrezioneImport.nuoveRegole = nuoveRegole;
  // e le regole di legge del programma non devono peggiorare rispetto al file
  if (
    !res.cambi.length ||
    dopo.length >= prima.length ||
    nuoviErrori.length ||
    nuoveRegole.length ||
    res.dopo.legge > res.prima.legge ||
    res.dopo.regole > res.prima.regole ||
    (res.dopo.eccesso || 0) > (res.prima.eccesso || 0) ||
    res.dopo.scoperti > res.prima.scoperti
  ) {
    await mostraAvviso(
      'Non ho trovato correzioni sicure: ogni cambio provato avrebbe peggiorato un altra regola o lasciato un posto scoperto. Il piano resta come nel file.\n\nI ' +
        prima.length +
        ' errori di riposo e giorni di fila restano da sistemare a mano: li trovi con Valida regole.',
      { titolo: 'Correzioni del piano importato', ok: 'Ho capito' },
    );
    return;
  }
  const cambi = res.cambi
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome) || a.data.localeCompare(b.data))
    .map(
      (c) =>
        '<tr><td>' +
        escP(c.nome) +
        '</td><td>' +
        gg(c.data) +
        '</td><td>' +
        escP(c.prima || (res.prep.conRiempimento ? 'C' : 'riposo')) +
        '</td><td class="fzp-dopo">' +
        escP(c.dopo || (res.prep.conRiempimento ? 'C' : 'riposo')) +
        '</td></tr>',
    )
    .join('');
  const scelta = await new Promise((fine) => {
    const v = document.createElement('div');
    v.className = 'finestra-velo';
    v.innerHTML =
      '<div class="finestra-box" role="dialog" aria-modal="true" style="width:min(720px,100%);max-height:90vh"><h3>Correzioni proposte</h3><div class="finestra-testo">Errori di riposo e giorni di fila: <b>' +
      prima.length +
      ' → ' +
      dopo.length +
      '</b> · posti scoperti: ' +
      res.prima.scoperti +
      ' → ' +
      res.dopo.scoperti +
      ' · celle che cambiano: ' +
      res.cambi.length +
      '\nNessuna altra regola peggiora. Niente cambia finche non premi Applica.</div><div class="fzp-scorri" style="max-height:46vh;margin-top:8px"><table class="fzp-tab" style="width:100%"><thead><tr><th>Collaboratore</th><th>Giorno</th><th>Nel file</th><th>Proposto</th></tr></thead><tbody>' +
      cambi +
      '</tbody></table></div><div class="finestra-pulsanti"><button type="button" class="finestra-no" data-s="">Lascia il piano del file</button><button type="button" class="finestra-ok" data-s="ok">Applica</button></div></div>';
    document.body.appendChild(v);
    v.querySelectorAll('button[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        v.remove();
        fine(b.dataset.s);
      }),
    );
  });
  if (scelta !== 'ok') {
    toast('Piano lasciato come nel file');
    return;
  }
  await _ricercaScrivi(res);
  logAzione(
    'Piano: correzioni dopo import',
    ym + ' ' + _pianoReparto() + ' · errori ' + prima.length + '>' + dopo.length,
  );
}

// RIEPILOGO DELLE VIOLAZIONI del mese aperto, per tipo (dopo l import da Excel, in
// ogni settore): una finestra con i numeri e "Mostra nel calendario", che evidenzia
// le celle come Valida regole. Conta anche la fine del mese prima (riposo fra il 31
// e l 1, giorni di fila, 4+1+1).
const _PIANO_TIPI_VIOLAZIONE = [
  ['riposo sotto il minimo fra due turni', /di riposo dopo/],
  ['troppi giorni lavorativi di fila', /giorni lavorativi consecutivi/],
  ['riposo singolo dopo 4 o piu giorni (4+1+1)', /riposo singolo dopo/],
  ['troppe ore nella settimana', /lavorate nella settimana/],
  ['riposo attorno alla domenica o domeniche libere', /domenica/i],
  ['ore del mese fuori tolleranza', /ore mese/],
  ['idoneita, accompagnamento e regole del settore', /./],
];
async function pianoRiepilogoViolazioni(ym, titolo) {
  if (_pianoMeseSel !== ym) return;
  const r = _pianoCalcolaViolazioni();
  if (!r.lista.length) {
    toast('Controllo delle regole: nessuna violazione in ' + ym);
    return;
  }
  const conta = {};
  r.lista.forEach((v) => {
    const t = _PIANO_TIPI_VIOLAZIONE.find(([, re]) => re.test(v.msg));
    conta[t[0]] = (conta[t[0]] || 0) + 1;
  });
  const perPersona = {};
  r.lista.forEach((v) => (perPersona[v.nome] = (perPersona[v.nome] || 0) + 1));
  const persone = Object.keys(perPersona).length;
  const righe = _PIANO_TIPI_VIOLAZIONE.filter(([et]) => conta[et]).map(([et]) => '• ' + conta[et] + ' ' + et);
  const chi = Object.entries(perPersona)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 8)
    .map(([n, k]) => n + ' (' + k + ')');
  const meseNome =
    ((typeof MESI_FULL !== 'undefined' && MESI_FULL[parseInt(ym.split('-')[1]) - 1]) || ym) + ' ' + ym.split('-')[0];
  const vedi = await chiediConferma(
    repartoLabel(_pianoReparto()) +
      ', ' +
      meseNome +
      ': ' +
      r.lista.length +
      (r.lista.length === 1 ? ' regola non rispettata' : ' regole non rispettate') +
      ' (' +
      persone +
      (persone === 1 ? ' persona' : ' persone') +
      '):\n' +
      righe.join('\n') +
      '\n\nPiu coinvolti: ' +
      chi.join(', ') +
      (persone > chi.length ? ' e altri ' + (persone - chi.length) : '') +
      '.\n\nCon "Mostra nel calendario" le celle si colorano in rosso e sotto compare l elenco con nome, giorno e motivo. Il piano e stato importato com e: il programma non sposta le celle importate.',
    { titolo: titolo || 'Controllo delle regole', ok: 'Mostra nel calendario', annulla: 'Piu tardi' },
  );
  if (!vedi || _pianoMeseSel !== ym) return;
  _pianoViolCelle = r.celle;
  _pianoViolLista = r.lista.sort((a, b) => a.nome.localeCompare(b.nome) || a.giorno - b.giorno);
  if (typeof pianoCambiaTab === 'function' && _pianoTab !== 'calendario') pianoCambiaTab('calendario');
  else renderPiano();
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
  if (!_pianoAzioneAutoConsentita('genera')) return; // azione automatica: permesso apposito
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
// IDONEITA "STATICA" di una persona per un turno in un giorno, cioe quello che non
// dipende dal resto del piano: preferenze (solo diurni, turni bloccati), regole
// "chi fa cosa", settori del collaboratore o, se non sono impostati, i gruppi
// gia fatti (storia), regole di gruppo, mappature per funzione. La usano la bozza
// e la ricerca sul piano: stesso criterio. idoneita = { nome: Set(gruppi fatti) }.
function _pianoIdoneoStatico(n, t, dowG, idoneita) {
  const infoC = _pianoCollabInfo(n);
  if (infoC && infoC.solo_diurni && t.tipo === 'NOTTURNO') return false;
  if (infoC && infoC.solo_notti && t.tipo !== 'NOTTURNO') return false;
  if (infoC && dowG != null && !PianoRegole.lavoraNelGiorno(infoC, dowG)) return false;
  if (
    infoC &&
    infoC.turni_bloccati &&
    infoC.turni_bloccati
      .split(',')
      .map((x) => x.trim())
      .includes(t.codice)
  )
    return false;
  // regole "chi fa cosa" del settore (turni riservati, funzione-turni-giorni)
  if (_pianoViolazioneFunzioneTurno(n, t, dowG, true)) return false;
  const fz = infoC && infoC.funzione;
  const gruppoT = (t.gruppo || '').toUpperCase();
  const fzU = (fz || '').toUpperCase();
  // REGOLE DI GRUPPO (port di eligibility.py Turnivo): i settori assegnati al
  // collaboratore sono la fonte di verita; la storia vale solo se non ci sono
  const settoriC = _pianoSettoriEffettivi(infoC);
  const haStoria = settoriC ? settoriC.includes(gruppoT) : !!(idoneita && idoneita[n] && idoneita[n].has(t.gruppo));
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
    }
  }
  // MAPPATURE PER FUNZIONE: limitano la funzione ai suoi turni SOLO se elencano turni
  // principali o ammessi (SUP, BO). Una mappatura con soli turni PREFERITI (es. HOST:
  // S22, S31, S7, Z5) e una preferenza, non un lasciapassare: valgono i reparti della
  // persona (settori, competenze, turni gia fatti). Prima la sola presenza della
  // mappatura saltava questo controllo: per un HOST ogni turno era idoneo, anche di
  // cassa o reception senza formazione (bozza, Migliora, formazioni).
  const mapp = _pianoMappFunzione(fz);
  const voci = mapp
    ? mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO').map((m) => m.turno_codice)
    : [];
  if (voci.length) {
    if (!voci.includes(t.codice)) return false;
  } else if (!haStoria && !campoGrant) return false;
  return true;
}
async function generaBozzaPiano(usaCoperture) {
  // GENERAZIONE AUTOMATICA (js/piano-auto.js): niente domande e niente messaggi,
  // il risultato va nel resoconto; i permessi li controlla il database
  // (lasciapassare limitato al mese e al settore prenotati)
  const auto = window._pianoAutoInCorso || null;
  if (!auto) {
    if (!_pianoAzioneAutoConsentita('genera')) return; // azione automatica: permesso apposito
    if (!puoGestirePiano()) return;
  }
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
    if (auto) {
      auto.bozza = { saltata: 'nessun fabbisogno configurato per il mese' };
      return;
    }
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
  // le C di RIEMPIMENTO generate da una bozza precedente si tolgono e si
  // rimettono alla fine: così rigenerare non trova i giorni "occupati". Solo nei
  // giorni APERTI, a tratti: con un giorno passato sbloccato (es. il 3, oggi il 10) i
  // giorni chiusi in mezzo restano com erano (prima si cancellava dal primo giorno
  // aperto a fine mese e le C dei giorni chiusi sparivano: il riempimento li salta)
  for (let g = primoApertoG; g <= nGiorni; g++) {
    if (giorniChiusi.has(g)) continue;
    let g2 = g;
    while (g2 + 1 <= nGiorni && !giorniChiusi.has(g2 + 1)) g2++;
    await secDel(
      'piano',
      'data=gte.' +
        ym +
        '-' +
        String(g).padStart(2, '0') +
        '&data=lte.' +
        ym +
        '-' +
        String(g2).padStart(2, '0') +
        '&reparto_dip=eq.' +
        _pianoReparto() +
        '&codice=eq.C&generato=eq.true&protetto=eq.false',
    );
    g = g2;
  }
  // Step 0 come Turnivo: prima le vacanze (V protette + C + WD)
  await _applicaVacanzeMese(false);
  // ricarico includendo le celle degli ALTRI reparti dei multi-reparto
  // (stessa funzione scalabile di renderPiano)
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, _pianoReparto());
  const { maxCons, minRiposo } = _pianoLimitiLegge();
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
    if (!_pianoCopreQui(r)) altroSettore[k] = true; // la sigla e di un altro settore
  });
  const nomiCellaSet = new Set(_pianoRighe.map((r) => r.collaboratore)); // completata con i nomi del settore piu sotto
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
  nomi.forEach((n) => nomiCellaSet.add(n));
  const nomiCella = [...nomiCellaSet];
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
  // BORDO DEL MESE (controllo completo 05.10): la fine del mese prima (giorni 0, -1...)
  // e l inizio del mese dopo gia pianificato (nGiorni+1...) contano per giorni di fila,
  // riposo minimo e 4+1+1. Prima la bozza si fermava al giorno 1 e all ultimo: l 1.11
  // un L1 alle 06:00 dopo un S7 finito alle 04:10 del 31.10, serie di 8 giorni.
  const primoG = new Date(ym + '-01T12:00:00');
  const dataDiG = (g) => {
    const d = new Date(primoG);
    d.setDate(d.getDate() + g - 1);
    return dataLocaleISO(d);
  };
  const bordoRiga = {}; // 'nome|g' (g <= 0 o > nGiorni) -> riga
  (window._pianoRigheBordo || []).forEach((r) => {
    const g = 1 + Math.round((new Date(String(r.data).substring(0, 10) + 'T12:00:00') - primoG) / 86400000);
    if (g >= 1 && g <= nGiorni) return;
    bordoRiga[r.collaboratore + '|' + g] = r;
  });
  const codDi = (nome, g) =>
    g >= 1 && g <= nGiorni ? cella[nome + '|' + g] || '' : (bordoRiga[nome + '|' + g] || {}).codice || '';
  // la cella come riga (orari veri): quella letta se e la stessa, altrimenti codice e data
  const rigaCella = (nome, g) => {
    if (g < 1 || g > nGiorni) return bordoRiga[nome + '|' + g] || { codice: '', data: dataDiG(g) };
    const k = nome + '|' + g;
    const r = rigaDi[k];
    return r && r.codice === cella[k] ? r : { codice: cella[k] || '', data: dataDiG(g) };
  };
  const consecPrima = (nome, g) => {
    let n = 0;
    for (let k = g - 1; k >= -13 && _pianoIsLavoro(codDi(nome, k)); k--) n++;
    return n;
  };
  const consecDopo = (nome, g) => {
    let n = 0;
    for (let k = g + 1; k <= nGiorni + 14 && _pianoIsLavoro(codDi(nome, k)); k++) n++;
    return n;
  };
  const riposoOk = (nome, g, t) => {
    const qui = { codice: t.codice, data: dataDiG(g) };
    // verso il giorno prima e verso il giorno dopo (gia scritto, anche nel mese dopo)
    for (const [x, y] of [
      [rigaCella(nome, g - 1), qui],
      [qui, rigaCella(nome, g + 1)],
    ]) {
      if (!_pianoIsLavoro(x.codice) || !_pianoIsLavoro(y.codice)) continue;
      const ore = _pianoRiposoOreTra(x, y);
      if (ore != null && ore < minRiposo - 0.001) return false;
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
      if (_pianoIsLavoro(cella[n + '|' + d] || '')) k++; // anche JG, U, corsi: domenica lavorata
    }
    return k;
  };
  // livello di Formazione di ogni persona (regole di livello), calcolato una volta
  const _livCache = {};
  const livelloDi = (x) =>
    x in _livCache ? _livCache[x] : (_livCache[x] = _pianoLivelloNelSettore(_pianoCollabInfo(x)));
  const nomiLv = [...new Set(nomi.concat(nomiCella))]; // chi puo avere turni nel settore (anche coperture)
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
    // chi puo fare questo turno (preferenze, chi fa cosa, settori o storia, regole
    // di gruppo, mappature): stesso criterio della ricerca sul piano
    if (!_pianoIdoneoStatico(n, t, dowG, idoneita)) return false;
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
    // giorni di lavoro nella settimana (preferenza "giorni a settimana")
    if (!_pianoGiorniSettOk(n, dstr, (off) => codDi(n, g + off))) return false;
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
    const fz = infoC && infoC.funzione;
    // regola HARD no_4w1c1w: niente rientro dopo UN solo giorno di riposo
    // se prima c'erano 4+ giorni di lavoro consecutivi
    if (String(_pianoRegolaVal('no_4w1c1w')).toUpperCase() === 'TRUE') {
      const cp0 = consecPrima(n, g);
      if (cp0 === 0 && !_pianoIsLavoro(codDi(n, g - 1))) {
        let streakPrec = 0;
        for (let k = g - 2; k >= -13 && _pianoIsLavoro(codDi(n, k)); k--) streakPrec++;
        if (streakPrec >= 4) return false;
      }
      // anche IN AVANTI: il turno allunga una serie che finisce con un riposo
      // singolo gia fissato e un rientro (succedeva tappando i buchi dopo)
      let fineSerie = g;
      while (fineSerie + 1 <= nGiorni + 14 && _pianoIsLavoro(codDi(n, fineSerie + 1))) fineSerie++;
      const riposo = fineSerie + 1;
      if (fineSerie - g + 1 + cp0 >= 4 && _pianoIsLavoro(codDi(n, riposo + 1))) return false;
    }
    // REGOLE DI GRUPPO (port di eligibility.py Turnivo): i settori
    // assegnati al collaboratore (settori_piano, M2M di Turnivo) sono la
    // fonte di verità; la storia vale solo se i settori non sono configurati
    const gruppoT = (t.gruppo || '').toUpperCase();
    const fzU = (fz || '').toUpperCase();
    for (const rg of _pianoRegoleGruppoDi(gruppoT)) {
      const tipoR = (rg.tipo_regola || '').toLowerCase();
      if (tipoR === 'limite_funzione_giorno') {
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
    // giorni di fila contando IN AVANTI: il turno puo unire due serie (le passate di
    // riparazione riempivano un giorno con i giorni dopo gia pieni: serie di 6)
    return consecPrima(n, g) + 1 + consecDopo(n, g) <= maxCons && riposoOk(n, g, t);
  };
  for (let g = 1; g <= nGiorni; g++) {
    if (giorniChiusi.has(g)) continue; // giorno chiuso: resta com'e'
    (fabbG[g] || []).forEach((f) => {
      const t = _pianoTurnoInfo(f.turno_codice);
      if (!t) return;
      const dstr = ym + '-' + String(g).padStart(2, '0');
      // contano anche le persone di altri settori che fanno un turno di questo
      // (es. Papa del Valet su R22): hanno la cella, ma non sono tra i nomi del settore
      let have = nomiCella.filter((n) => cella[n + '|' + g] === f.turno_codice && !altroSettore[n + '|' + g]).length;
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
              // minimo_livello_giorno non ancora soddisfatto: privilegia chi ha il livello
              for (const rg of _pianoRegoleGruppoDi((t.gruppo || '').toUpperCase()).concat(_pianoRegoleGruppoDi('*'))) {
                if ((rg.tipo_regola || '').toLowerCase() !== 'minimo_livello_giorno') continue;
                const pL = rg.valore.split(':');
                const lvMin = _pianoLivelloDaTesto(pL[0]);
                const tipoL = (pL[2] || '').toUpperCase();
                const dowsL = pL[3] ? pL[3].split(',').map((x) => parseInt(x)) : null;
                if (tipoL && (t.tipo || '').toUpperCase() !== tipoL) continue;
                if (dowsL && !dowsL.includes((dowG + 6) % 7)) continue;
                const lvP = livelloDi(n);
                if (lvP == null || lvP < lvMin) continue;
                const grR = (rg.gruppo || '').toUpperCase();
                let gia = 0;
                for (const x of nomiLv) {
                  const tx = _pianoTurnoInfo(cella[x + '|' + g] || '');
                  if (!tx || (tipoL && (tx.tipo || '').toUpperCase() !== tipoL)) continue;
                  if (grR !== '*' && (tx.gruppo || '').toUpperCase() !== grR) continue;
                  const lx = livelloDi(x);
                  if (lx != null && lx >= lvMin) gia++;
                }
                if (gia < (parseInt(pL[1]) || 1)) p -= 3;
              }
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
    if (auto) {
      auto.bozza = { celle: 0, scoperti: scoperti.length };
      return;
    }
    toast(
      'Niente da generare: fabbisogni già coperti' +
        (scoperti.length ? ' (' + scoperti.length + ' scoperti senza candidati)' : ''),
    );
    renderPiano();
    return;
  }
  if (
    !auto &&
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
    if (inseriteTot < nuove.length && !auto)
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
    logAzione(
      auto ? 'Piano: bozza generata in automatico' : 'Piano: bozza generata',
      ym + ' · ' + nuove.length + ' turni, ' + scoperti.length + ' scoperti',
    );
    if (auto) {
      auto.bozza = {
        celle: inseriteTot,
        volute: nuove.length,
        scoperti: scoperti.length,
        cgf: nCgfAuto,
        congedi: nCongedi,
        riposiDaSistemare: riposiRestano.slice(),
      };
      return;
    }
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
    if (auto) throw e;
    toast('Errore generazione bozza');
  }
}

async function cancellaBozzaPiano() {
  if (!_pianoAzioneAutoConsentita('genera')) return; // azione automatica: permesso apposito
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
    (puoAzioniAutoPiano('cancella')
      ? '<button class="btn-modal-ok" style="background:var(--accent)" onclick="eseguiCancellaPiano(true)">TUTTE (' +
        _pianoRighe.length +
        ')</button>'
      : '') +
    '</div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function eseguiCancellaPiano(tutto) {
  // solo le celle generate = Genera piano; anche le protette = Cancellazioni di massa
  if (!_pianoAzioneAutoConsentita(tutto ? 'cancella' : 'genera')) return;
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
