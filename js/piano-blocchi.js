/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-blocchi.js
 *
 * BOZZA A BLOCCHI (prototipo 23/10/2026). La bozza classica assegna un giorno alla volta e un
 * posto alla volta: i blocchi di lavoro escono per caso e Migliora, coprendo i posti, li spezza
 * (diagnosi del 23/10/2026 su novembre Slots: dei 120 buchi finali 95 li crea Migliora; un modello
 * esatto trova con la stessa copertura circa 30 buchi).
 * Qui si lavora in due tempi, come chi pianifica a mano:
 *  1. SCHEMA: per ogni persona una sequenza lavoro/riposo a blocchi (4+2, 5+2, piu corti per chi
 *     ha poche ore), con il tipo del blocco (presto, giorno, notte: un blocco va solo in avanti,
 *     mai dalla notte al giorno). Lo schema rispetta le celle fisse (vacanze, protette, a mano),
 *     i giorni in cui la persona puo lavorare (turni ammessi del programma, _ricercaPrepara), i
 *     giorni di fila, il 4+1+1, le domeniche dovute, le ore del mese, i riposi non troppo lunghi
 *     e, come preferenza, le abitudini dei mesi passati (giorni della settimana). Le fasi si
 *     scelgono per coprire il fabbisogno: ogni giorno e per ogni tipo si calcola quanti posti si
 *     coprono davvero con chi lavora (abbinamento persona-turno sui turni ammessi).
 *  2. TURNI: la bozza di sempre (generaBozzaPiano, stesse regole: candidatoOk) mette i turni
 *     precisi solo nei giorni di lavoro dello schema e del tipo giusto; i posti rimasti scoperti
 *     alla fine si riprovano con tutti (la copertura viene prima dei blocchi).
 * Le regole non sono scritte qui: idoneita, giorni ammessi, buchi (PianoRegole.blocchiSpezzati),
 * domeniche e ore vengono dalle funzioni del programma. Lo schema e solo un aiuto alla bozza.
 */

// tipo di un turno per lo schema: P presto (inizia prima delle 10), D giorno, N notte
function _pianoBlocchiTipoTurno(t) {
  if (!t) return '';
  if (String(t.tipo || '').toUpperCase() === 'NOTTURNO') return 'N';
  const h = typeof _pianoOra === 'function' ? _pianoOra(String(t.ora_inizio || '').substring(0, 5)) : null;
  return h != null && h < 10 ? 'P' : 'D';
}
// RIPOSO PIU LUNGO ACCETTATO per una persona nel mese (decisione del titolare 23/10/2026: chi ha
// poche ore non fa tutto il lavoro di fila e poi 20 giorni a casa; 50% = 2-3 giorni di lavoro e
// 2-4 liberi). Dalla quota delle ore del mese sul tempo pieno: 100% -> 3, 60% -> 4, 40% -> 5.
function _pianoRiposoMassimo(nome, nGiorni, lim) {
  lim = lim || _pianoLimitiOre(nome, nGiorni);
  const pieno = typeof _pianoOreSett !== 'undefined' && _pianoOreSett ? (nGiorni / 7) * _pianoOreSett : 0;
  const info = _pianoCollabInfo(nome) || {};
  const quota = lim && lim.obiettivo != null && pieno ? lim.obiettivo / pieno : parseFloat(info.percentuale) || 1;
  return Math.min(5, Math.max(3, Math.ceil(1.5 / Math.max(0.25, Math.min(1, quota))) + 1));
}
// GIORNI DI RIPOSO OLTRE IL MASSIMO in una sequenza di tipi (come per i buchi: 'L' lavoro, 'R'
// riposo, 'X' vacanze e assenze, 'Z' giorno in cui non puo lavorare: non conta e non interrompe,
// 'U' fuori dal mese senza cella). Un riposo attaccato a una vacanza non si giudica; uno che
// arriva alla fine (o dall inizio) del mese si giudica per i giorni del mese. da, a: indici
// del primo e dell ultimo giorno del mese. Ritorna la somma dei giorni oltre il massimo.
function _pianoRiposiLunghi(tipi, da, a, max) {
  let tot = 0;
  let k = 0;
  while (k < tipi.length) {
    if (tipi[k] !== 'R' && tipi[k] !== 'Z') {
      k++;
      continue;
    }
    let j = k;
    let lung = 0;
    let dentro = 0;
    while (j < tipi.length && (tipi[j] === 'R' || tipi[j] === 'Z')) {
      if (tipi[j] === 'R') {
        lung++;
        if (j >= da && j <= a) dentro++;
      }
      j++;
    }
    const prima = k > 0 ? tipi[k - 1] : 'U';
    const dopo = j < tipi.length ? tipi[j] : 'U';
    if (dentro && prima !== 'X' && dopo !== 'X' && lung > max) tot += Math.min(dentro, lung - max);
    k = j;
  }
  return tot;
}
// ordine dei tipi in un blocco: si va solo in avanti (P -> D -> N), mai indietro
const PIANO_SCHEMA_ORDINE = { P: 0, D: 1, N: 2 };
// PESI DELLO SCHEMA (stessa scala della ricerca: un posto scoperto 300, un buco 60)
const PIANO_SCHEMA_PESI = {
  scoperto: 300,
  riservato: 600,
  inPiu: 110, // chi e al lavoro nello schema ma senza un posto per lui: il giorno salta (buco e ore)
  giornoSotto: 45, // un giorno di lavoro sotto l obiettivo (fissi)
  giornoSottoMin: 220, // sotto il minimo del mese (fissi)
  giornoSopra: 25,
  giornoSopraMax: 400,
  jollySopra: 35,
  jollySotto: 6,
  domenica: 500, // domenica libera mancante
  riposoLungo: 70, // per giorno oltre il riposo massimo della persona
  abitudine: 12, // lavoro in un giorno della settimana di solito libero
  oreSettimana: 120,
  sabatoTardi: 150, // domenica persa per il sabato oltre le 23 (avviso) // per ora oltre il massimo della settimana (stima)
};

// abitudini dai mesi passati (piano del settore, ultimi 6 mesi): per persona la quota di giorni
// lavorati per giorno della settimana, la lunghezza tipica dei blocchi e dei riposi, la quota di notti
async function _pianoAbitudini(ym, rep) {
  const da = new Date(ym + '-01T12:00:00');
  da.setMonth(da.getMonth() - 6);
  const righe =
    (await secGet(
      'piano?data=gte.' +
        dataLocaleISO(da) +
        '&data=lt.' +
        ym +
        '-01&reparto_dip=eq.' +
        encodeURIComponent(rep) +
        '&select=collaboratore,data,codice&limit=40000',
    )) || [];
  const per = {};
  righe.forEach((r) => {
    const p = (per[r.collaboratore] = per[r.collaboratore] || {
      lav: [0, 0, 0, 0, 0, 0, 0],
      tot: [0, 0, 0, 0, 0, 0, 0],
      notti: 0,
      turni: 0,
    });
    const tipo = _pianoTipoGiornoBlocchi(r.codice);
    if (tipo === 'X') return;
    const w = new Date(String(r.data).substring(0, 10) + 'T12:00:00').getDay();
    p.tot[w]++;
    if (tipo === 'L') {
      p.lav[w]++;
      const t = _pianoTurnoInfo(r.codice);
      if (t) {
        p.turni++;
        if (_pianoBlocchiTipoTurno(t) === 'N') p.notti++;
      }
    }
  });
  const out = {};
  Object.keys(per).forEach((n) => {
    const p = per[n];
    const q = p.lav.map((x, i) => (p.tot[i] >= 4 ? x / p.tot[i] : null));
    const val = q.filter((x) => x != null);
    const media = val.length ? val.reduce((a, b) => a + b, 0) / val.length : null;
    out[n] = {
      giorno: q.map((x) => (x == null || media == null ? 0 : x - media)),
      notti: p.turni ? p.notti / p.turni : null,
    };
  });
  return out;
}

// abbinamento massimo persona-posto di un giorno e di un tipo (Kuhn): posti = [{ c, ris }],
// chi = [indici persona], ok(i, c) = la persona puo fare il turno. Prima i posti riservati.
function _pianoSchemaAbbina(posti, chi, ok) {
  const assegnato = new Map(); // persona -> indice posto
  const postoDi = new Array(posti.length).fill(-1);
  const prova = (k, visti) => {
    for (const i of chi) {
      if (visti.has(i) || !ok(i, posti[k].c)) continue;
      visti.add(i);
      const altro = assegnato.has(i) ? assegnato.get(i) : -1;
      if (altro < 0 || prova(altro, visti)) {
        assegnato.set(i, k);
        postoDi[k] = i;
        return true;
      }
    }
    return false;
  };
  let scop = 0;
  let scopR = 0;
  for (let k = 0; k < posti.length; k++) {
    if (!prova(k, new Set())) {
      if (posti[k].ris) scopR++;
      else scop++;
    }
  }
  return { scop: scop, scopR: scopR, inPiu: chi.length - assegnato.size, assegnato: assegnato };
}

// SCHEMA DEL MESE APERTO. Ritorna { cella: { 'nome|g': 'R' | 'P' | 'D' | 'N' }, info }
// opz: { secondi (ricerca, predefinito 20), seme }
async function pianoSchemaBlocchi(opz) {
  opz = opz || {};
  const t0 = Date.now();
  const prep = await _ricercaPrepara({});
  const P = prep.problema;
  const ym = prep.ym;
  const rep = prep.reparto;
  const nG = _pianoUltimoGiorno(ym);
  const ds = (g) => {
    const d = new Date(ym + '-01T12:00:00');
    d.setDate(d.getDate() + g - 1);
    return dataLocaleISO(d);
  };
  const { maxCons } = _pianoLimitiLegge();
  const no411 = String(_pianoRegolaVal('no_4w1c1w')).toUpperCase() === 'TRUE';
  const parBl = _pianoBlocchiParam();
  const parBS = _pianoBlocchiPar(parBl.attivo ? parBl : Object.assign({}, parBl, { attivo: true }), 14, 13 + nG, true);
  const pesoBl = parBl.peso || 60;
  await _pianoCaricaDomAnno(ym, rep).catch(() => {});
  const domAnno = _pianoDomAnnoDi(ym, rep);
  const esenti = _pianoFunzioniEsentiRiposi();
  const abit = await _pianoAbitudini(ym, rep).catch(() => ({}));
  const nomi = P.persone.filter((n) => !_pianoBlocchiEsente(n));
  const N = nomi.length;
  const L = nG + 28; // giorni da -13 a nG+14 (indice = g + 13)
  const idx = (g) => g + 13;
  // posti del mese per giorno e tipo, tolti quelli coperti da celle fisse dei partecipanti
  const coperti = {};
  P.persone.forEach((n) => {
    for (let g = 1; g <= nG; g++) {
      const d = ds(g);
      if (P.modificabile(n, d)) continue;
      const c = (P.stato[n] || {})[d];
      if (c && c[0] !== '#') coperti[d + '|' + c] = (coperti[d + '|' + c] || 0) + 1;
    }
  });
  const posti = {}; // g -> { P: [], D: [], N: [] }
  const tipoCod = {};
  for (let g = 1; g <= nG; g++) {
    const d = ds(g);
    posti[g] = { P: [], D: [], N: [] };
    Object.keys(P.fabbisogno[d] || {}).forEach((c) => {
      const t = _pianoTurnoInfo(c);
      if (!t) return;
      const ti = (tipoCod[c] = _pianoBlocchiTipoTurno(t));
      const q = Math.max(0, (P.fabbisogno[d][c] || 0) - (coperti[d + '|' + c] || 0));
      const ris = !!(prep.riservati[d] && prep.riservati[d][c]);
      for (let k = 0; k < q; k++) posti[g][ti].push({ c: c, ris: ris });
    });
    ['P', 'D', 'N'].forEach((ti) => posti[g][ti].sort((a, b) => (b.ris ? 1 : 0) - (a.ris ? 1 : 0)));
  }
  // per persona: celle fisse (tipo L/R/X e tipo del turno), turni ammessi per giorno e tipo
  const maxSett = _pianoOreSettimanaMax();
  const conNotte = _pianoSettimanaConNotturno();
  const oreSettCella = (r) => _pianoOreLavorateCella(r) + (conNotte ? _pianoNotturnoCella(r) : 0);
  const oreSettFisse = []; // [i][k] ore della settimana delle celle fisse
  const utile = []; // [i][g] la persona puo lavorare quel giorno (almeno un turno dello schema)
  const ignoto = []; // [i][k] giorno fuori dal mese senza cella (non e una vacanza)
  const oreSettMin = []; // [i][g] -> { P, D, N } ore del turno ammesso piu corto
  const settimane = []; // indici k delle settimane lunedi-domenica che toccano il mese
  for (let g = 1; g <= nG; g++) {
    const w = new Date(ds(g) + 'T12:00:00').getDay();
    if (g === 1 || w === 1) {
      const lun = g - ((w + 6) % 7);
      settimane.push([0, 1, 2, 3, 4, 5, 6].map((x) => idx(lun + x)).filter((k) => k >= 0 && k < L));
    }
  }
  const domeniche = [];
  for (let g = 1; g <= nG; g++) if (new Date(ds(g) + 'T12:00:00').getDay() === 0) domeniche.push(g);
  const fisso = []; // [i][k] -> null (mobile) | 'L' | 'R' | 'X'
  const fissoTipo = []; // [i][k] -> P/D/N del turno fisso
  const amm = []; // [i][g] -> { P: Set, D: Set, N: Set } (solo celle mobili)
  const wd = []; // [i][g] -> true se la cella e un WD (deve lavorare di giorno)
  const pers = [];
  const bordo = {};
  (window._pianoRigheBordo || []).forEach((r) => (bordo[r.collaboratore + '|' + String(r.data).substring(0, 10)] = r));
  for (let i = 0; i < N; i++) {
    const n = nomi[i];
    const info = _pianoCollabInfo(n) || {};
    const pct = parseFloat(info.percentuale) || 1;
    oreSettFisse.push(new Array(L).fill(0));
    utile.push({});
    ignoto.push(new Array(L).fill(false));
    oreSettMin.push({});
    fisso.push(new Array(L).fill(null));
    fissoTipo.push(new Array(L).fill(''));
    amm.push({});
    wd.push({});
    const righeM = prep.righePersona(n, {});
    const cellaM = {};
    righeM.forEach((r) => (cellaM[String(r.data).substring(0, 10)] = r));
    let oreFisse = 0;
    let oreMedie = 0;
    let nOre = 0;
    let giorniUtili = 0;
    for (let g = -13; g <= nG + 14; g++) {
      const k = idx(g);
      const d = ds(g);
      if (g >= 1 && g <= nG && P.modificabile(n, d)) {
        const a = { P: new Set(), D: new Set(), N: new Set() };
        P.ammessi(n, d).forEach((c) => {
          if (!c || c === 'WD' || !tipoCod[c]) return;
          // turno "solo se serve" (Turni consentiti): non entra nello schema, lo usa la bozza per ultimo
          if (typeof _pianoSoloSeServe === 'function' && _pianoSoloSeServe(n, c)) return;
          a[tipoCod[c]].add(c);
          const t = _pianoTurnoInfo(c);
          oreMedie += _pianoOreDiRiga({ codice: c, data: d }, pct) || parseFloat(t.durata_ore) || 0;
          nOre++;
        });
        amm[i][g] = a;
        const om = {};
        ['P', 'D', 'N'].forEach((ti) =>
          a[ti].forEach((c) => {
            const h = oreSettCella({ codice: c, data: d });
            if (om[ti] == null || h < om[ti]) om[ti] = h;
          }),
        );
        oreSettMin[i][g] = om;
        if ((P.stato[n] || {})[d] === 'WD') wd[i][g] = true;
        if (a.P.size || a.D.size || a.N.size) {
          giorniUtili++;
          utile[i][g] = true;
        }
        continue;
      }
      const r = g >= 1 && g <= nG ? cellaM[d] : bordo[n + '|' + d];
      if (!r) {
        fisso[i][k] = g >= 1 && g <= nG ? 'R' : 'X';
        if (g < 1 || g > nG) ignoto[i][k] = true;
        continue;
      }
      const ti = _pianoTipoGiornoBlocchi(r.codice);
      fisso[i][k] = ti;
      if (ti === 'L') {
        fissoTipo[i][k] = _pianoBlocchiTipoTurno(_pianoTurnoInfo(r.codice)) || 'D';
        oreSettFisse[i][k] = oreSettCella(r) || 0;
      }
      if (g >= 1 && g <= nG) oreFisse += _pianoOreDiRiga(r, pct) || 0;
    }
    const lim = _pianoLimitiOre(n, nG);
    const h = nOre ? oreMedie / nOre : 8;
    const giorni = (x) => (x == null ? null : Math.max(0, (x - oreFisse) / h));
    const sospesa = typeof _pianoDomSospesaMese === 'function' && _pianoDomSospesaMese(n, ym);
    const conto = domAnno && !sospesa && !_pianoEsenteRiposi(info, esenti) ? _pianoDomAttese(n, ym, domAnno) : null;
    const target = giorni(lim.obiettivo);
    // riposo massimo della persona (decisione del titolare 23/10/2026: chi ha poche ore non fa
    // tutto il lavoro di fila e poi 20 giorni a casa): dalla quota di giorni da lavorare
    const riposoMax = _pianoRiposoMassimo(n, nG, lim);
    pers.push({
      n: n,
      jolly: !!info.is_jolly,
      target: target,
      min: lim.jolly ? null : giorni(lim.min),
      // il massimo come nella bozza: per i fissi segue il saldo dell anno (mai sotto il minimo)
      max: giorni(
        lim.max != null && lim.obiettivo != null && !lim.jolly && typeof _pianoYtdMap !== 'undefined'
          ? Math.min(lim.max, Math.max(lim.max - (_pianoYtdMap[n] || 0), lim.min != null ? lim.min : 0))
          : lim.max,
      ),
      serveDom: conto ? (conto.attese || 0) - (conto.prima || 0) : 0,
      recupera:
        conto && _pianoDomSabatoParam().copertura
          ? (conto.diritto || 0) - (conto.prima || 0) - (conto.restanti || 0)
          : null,
      // chi non arriva alle domeniche dovute nemmeno lasciandole tutte libere (la bozza lo fa lavorare)
      raggiungibile:
        !conto ||
        (conto.attese || 0) - (conto.prima || 0) <=
          domeniche.filter((g) => {
            const f = fisso[i][idx(g)];
            return f ? f === 'R' : true;
          }).length,
      riposoMax: riposoMax,
      abit: abit[n] || null,
    });
  }
  const dowDi = [];
  for (let g = 1; g <= nG; g++) dowDi[g] = new Date(ds(g) + 'T12:00:00').getDay();

  // ----- stato: s[i][g] in '', 'P', 'D', 'N' per le celle mobili ('' = riposo) -----
  const s = [];
  const tipoGiorno = (i, k) => {
    // L/R/X e tipo del turno per l indice k
    const f = fisso[i][k];
    if (f) return f;
    return s[i][k - 13] ? 'L' : 'R';
  };
  const tipoTurno = (i, k) => (fisso[i][k] ? fissoTipo[i][k] : s[i][k - 13] || '');
  const ammessoTipo = (i, g, ti) => !!(amm[i][g] && amm[i][g][ti] && amm[i][g][ti].size);
  // vincoli duri di una persona attorno al giorno g: giorni di fila, 4+1+1, tipi in avanti
  const legale = (i, g) => {
    const k0 = idx(g);
    for (let k = Math.max(1, k0 - maxCons - 1); k <= Math.min(L - 1, k0 + 1); k++) {
      // tipi: dal giorno k-1 al giorno k mai all indietro (notte -> giorno, giorno -> presto)
      const a = tipoTurno(i, k - 1);
      const b = tipoTurno(i, k);
      if (
        a &&
        b &&
        tipoGiorno(i, k - 1) === 'L' &&
        tipoGiorno(i, k) === 'L' &&
        PIANO_SCHEMA_ORDINE[b] < PIANO_SCHEMA_ORDINE[a]
      )
        return false;
    }
    // giorni di fila attraverso g
    let run = 0;
    for (let k = Math.max(0, k0 - maxCons); k <= Math.min(L - 1, k0 + maxCons); k++) {
      if (tipoGiorno(i, k) === 'L') {
        run++;
        if (run > maxCons) return false;
      } else run = 0;
    }
    if (no411) {
      for (let k = Math.max(4, k0 - 1); k <= Math.min(L - 2, k0 + 5); k++) {
        if (tipoGiorno(i, k) === 'L' || tipoGiorno(i, k + 1) !== 'L') continue;
        let c = 0;
        for (let j = k - 1; j >= 0 && tipoGiorno(i, j) === 'L'; j--) c++;
        if (c >= 4 && (fisso[i][k + 1] == null || fisso[i][k] == null || fisso[i][k - 1] == null)) return false;
      }
    }
    return true;
  };
  // costo di una persona (senza la copertura)
  const costoPersona = (i) => {
    const p = pers[i];
    const tipi = [];
    for (let k = 0; k < L; k++) tipi.push(tipoGiorno(i, k));
    let c = 0;
    PianoRegole.blocchiSpezzati(tipi, parBS).forEach((v) => (c += pesoBl * _pianoPesoBuco(v)));
    // giorni di lavoro del mese contro l obiettivo
    let lav = 0;
    for (let g = 1; g <= nG; g++) if (s[i][g]) lav++;
    if (p.target != null) {
      const dlt = lav - p.target;
      if (p.jolly) c += dlt > 0 ? PIANO_SCHEMA_PESI.jollySopra * dlt : -PIANO_SCHEMA_PESI.jollySotto * dlt;
      else c += dlt < 0 ? -PIANO_SCHEMA_PESI.giornoSotto * dlt : PIANO_SCHEMA_PESI.giornoSopra * dlt;
      if (p.min != null && lav < p.min) c += PIANO_SCHEMA_PESI.giornoSottoMin * (p.min - lav);
    }
    if (p.max != null && lav > p.max) c += PIANO_SCHEMA_PESI.giornoSopraMax * (lav - p.max);
    // domeniche libere dovute nel mese
    if (p.serveDom > 0) {
      let lib = 0;
      let libere = 0;
      domeniche.forEach((g) => {
        const f = fisso[i][idx(g)];
        // valida solo se il sabato prima non finisce oltre le 23 (turno di notte)
        if (f ? f === 'R' : !s[i][g]) {
          libere++;
          if (tipoTurno(i, idx(g) - 1) !== 'N') lib++;
        }
      });
      // come il verdetto del programma: le domeniche non lavorate bastano se a fine anno si
      // come la bozza (candidatoOk): valgono le domeniche valide; chi e gia indietro senza rimedio
      // puo lavorare (costo piu basso, la domenica la recupera nei mesi dopo)
      // con "consenti in caso di copertura": le domeniche non lavorate bastano se a fine anno si
      // recupera (il sabato oltre le 23 e un avviso, come in Controlla le regole)
      const ok = p.recupera != null && lib >= p.recupera ? libere : lib;
      const manca = Math.max(0, p.serveDom - ok);
      if (manca) c += (p.raggiungibile ? PIANO_SCHEMA_PESI.domenica : PIANO_SCHEMA_PESI.sabatoTardi) * manca;
      if (lib < p.serveDom) c += PIANO_SCHEMA_PESI.sabatoTardi * (p.serveDom - lib);
    }
    // ore della settimana (lunedi-domenica, con il 10% notturno): stima col turno piu corto ammesso
    if (maxSett)
      for (const sett of settimane) {
        let h = 0;
        for (const k of sett) {
          if (fisso[i][k]) h += oreSettFisse[i][k] || 0;
          else if (s[i][k - 13]) h += oreSettMin[i][k - 13][s[i][k - 13]] || 0;
        }
        if (h > maxSett + 0.01) c += PIANO_SCHEMA_PESI.oreSettimana * (h - maxSett);
      }
    // riposi troppo lunghi (vacanze, assenze e giorni in cui non puo lavorare esclusi)
    const tr = tipi.slice();
    for (let g = 1; g <= nG; g++) if (!fisso[i][idx(g)] && !s[i][g] && !utile[i][g]) tr[idx(g)] = 'Z';
    for (let k = 0; k < L; k++) if (fisso[i][k] === 'X' && ignoto[i][k]) tr[k] = 'U';
    c += PIANO_SCHEMA_PESI.riposoLungo * _pianoRiposiLunghi(tr, 14, 13 + nG, p.riposoMax);
    // abitudini: lavoro nei giorni della settimana di solito liberi (preferenza leggera)
    if (p.abit)
      for (let g = 1; g <= nG; g++) if (s[i][g]) c += -PIANO_SCHEMA_PESI.abitudine * (p.abit.giorno[dowDi[g]] || 0);
    // WD: giorno di lavoro obbligato
    for (let g = 1; g <= nG; g++) if (wd[i][g] && !s[i][g]) c += 400;
    return c;
  };
  // costo di copertura di un giorno e di un tipo
  const costoGiornoTipo = (g, ti) => {
    const chi = [];
    for (let i = 0; i < N; i++) if (s[i][g] === ti) chi.push(i);
    const a = _pianoSchemaAbbina(posti[g][ti], chi, (i, c) => amm[i][g][ti].has(c));
    return (
      a.scop * PIANO_SCHEMA_PESI.scoperto + a.scopR * PIANO_SCHEMA_PESI.riservato + a.inPiu * PIANO_SCHEMA_PESI.inPiu
    );
  };

  // ----- SCHEMA DI PARTENZA: per persona il ciclo (blocco, riposo, fase) che copre di piu -----
  const domanda = {}; // g|ti -> posti ancora senza nessuno (stima per la costruzione)
  for (let g = 1; g <= nG; g++) ['P', 'D', 'N'].forEach((ti) => (domanda[g + '|' + ti] = posti[g][ti].length));
  for (let i = 0; i < N; i++) s.push(new Array(nG + 1).fill(''));
  const ordine = nomi
    .map((n, i) => i)
    .sort((a, b) => {
      const u = (i) => {
        let x = 0;
        for (let g = 1; g <= nG; g++) if (amm[i][g]) x += ['P', 'D', 'N'].filter((ti) => ammessoTipo(i, g, ti)).length;
        return x;
      };
      return u(a) - u(b);
    });
  for (const i of ordine) {
    const p = pers[i];
    let meglio = null;
    const lunghi = p.target != null && p.target > nG * 0.62 ? [5, 4] : [4, 3];
    const riposi = p.target != null && p.target < nG * 0.45 ? [3, 4, 2] : [2, 3];
    for (const bl of lunghi)
      for (const rp of riposi)
        for (let fase = 0; fase < bl + rp; fase++) {
          const prova = new Array(nG + 1).fill('');
          let guadagno = 0;
          let tipoBlocco = '';
          for (let g = 1; g <= nG; g++) {
            const inBlocco = (g + fase) % (bl + rp) < bl;
            if (!inBlocco) {
              tipoBlocco = '';
              continue;
            }
            if (!amm[i][g]) continue; // cella fissa
            // il tipo: quello con piu posti ancora scoperti, mai all indietro nel blocco
            let best = '';
            let bv = -1;
            ['P', 'D', 'N'].forEach((ti) => {
              if (!ammessoTipo(i, g, ti)) return;
              if (tipoBlocco && PIANO_SCHEMA_ORDINE[ti] < PIANO_SCHEMA_ORDINE[tipoBlocco]) return;
              const v = domanda[g + '|' + ti] + (ti === tipoBlocco ? 0.5 : 0);
              if (v > bv) {
                bv = v;
                best = ti;
              }
            });
            if (!best) continue;
            prova[g] = best;
            tipoBlocco = best;
            guadagno += domanda[g + '|' + best] > 0 ? 1 : -0.6;
          }
          for (let g = 1; g <= nG; g++) if (wd[i][g] && !prova[g] && ammessoTipo(i, g, 'D')) prova[g] = 'D';
          const vecchio = s[i];
          s[i] = prova;
          const c = costoPersona(i) - guadagno * PIANO_SCHEMA_PESI.scoperto * 0.8;
          s[i] = vecchio;
          if (!meglio || c < meglio.c) meglio = { c: c, s: prova };
        }
    s[i] = meglio.s;
    // le celle che rompono i vincoli duri tornano riposo
    for (let g = 1; g <= nG; g++)
      if (s[i][g] && !legale(i, g)) {
        s[i][g] = '';
      }
    for (let g = 1; g <= nG; g++) if (s[i][g]) domanda[g + '|' + s[i][g]]--;
  }

  // ----- RICERCA LOCALE (raffreddamento) sullo schema -----
  const cP = [];
  for (let i = 0; i < N; i++) cP.push(costoPersona(i));
  const cG = {};
  for (let g = 1; g <= nG; g++) ['P', 'D', 'N'].forEach((ti) => (cG[g + '|' + ti] = costoGiornoTipo(g, ti)));
  const totale = () => cP.reduce((a, b) => a + b, 0) + Object.values(cG).reduce((a, b) => a + b, 0);
  let cor = totale();
  let migliore = { c: cor, s: s.map((x) => x.slice()) };
  let seme = (opz.seme != null ? opz.seme : PianoRicerca.semeRicerca(ym, rep, 0)) >>> 0 || 1;
  const rnd = () => {
    seme = (seme + 0x6d2b79f5) >>> 0;
    let t = seme;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mobili = [];
  for (let i = 0; i < N; i++) for (let g = 1; g <= nG; g++) if (amm[i][g]) mobili.push([i, g]);
  const msTot = Math.max(1, opz.secondi != null ? opz.secondi : 20) * 1000;
  const inizio = Date.now();
  let it = 0;
  let accettate = 0;
  // una mossa: celle cambiate [[i, g, nuovo]]; ritorna true se tenuta
  const applica = (mosse, temp) => {
    const vecchi = mosse.map(([i, g]) => s[i][g]);
    mosse.forEach(([i, g, v]) => (s[i][g] = v));
    for (const [i, g] of mosse) {
      if (s[i][g] && !ammessoTipo(i, g, s[i][g])) return (annulla(mosse, vecchi), false);
      if (!legale(i, g)) return (annulla(mosse, vecchi), false);
    }
    const persone = [...new Set(mosse.map((m) => m[0]))];
    const giorniTipo = new Set();
    mosse.forEach(([i, g, v], k) => {
      if (vecchi[k]) giorniTipo.add(g + '|' + vecchi[k]);
      if (v) giorniTipo.add(g + '|' + v);
    });
    const nP = persone.map((i) => costoPersona(i));
    const nGT = [...giorniTipo].map((x) => {
      const [g, ti] = x.split('|');
      return costoGiornoTipo(parseInt(g), ti);
    });
    let delta = 0;
    persone.forEach((i, k) => (delta += nP[k] - cP[i]));
    [...giorniTipo].forEach((x, k) => (delta += nGT[k] - cG[x]));
    if (delta <= 0 || rnd() < Math.exp(-delta / temp)) {
      persone.forEach((i, k) => (cP[i] = nP[k]));
      [...giorniTipo].forEach((x, k) => (cG[x] = nGT[k]));
      cor += delta;
      accettate++;
      return true;
    }
    annulla(mosse, vecchi);
    return false;
  };
  const annulla = (mosse, vecchi) => mosse.forEach(([i, g], k) => (s[i][g] = vecchi[k]));
  const tipiAmm = (i, g) => ['P', 'D', 'N'].filter((ti) => ammessoTipo(i, g, ti));
  let tPausa = Date.now();
  while (Date.now() - inizio < msTot) {
    for (let rip = 0; rip < 200; rip++) {
      it++;
      const fr = Math.min(1, (Date.now() - inizio) / msTot);
      const temp = 120 * Math.pow(0.01, fr) + 0.5;
      const [i, g] = mobili[Math.floor(rnd() * mobili.length)];
      const r = rnd();
      if (r < 0.35) {
        // cambia la cella: riposo o un tipo ammesso
        const opz2 = [''].concat(tipiAmm(i, g)).filter((v) => v !== s[i][g]);
        if (!opz2.length) continue;
        applica([[i, g, opz2[Math.floor(rnd() * opz2.length)]]], temp);
      } else if (r < 0.6) {
        // scambio con un collega nello stesso giorno
        const j = Math.floor(rnd() * N);
        if (j === i || !amm[j][g] || s[j][g] === s[i][g]) continue;
        applica(
          [
            [i, g, s[j][g]],
            [j, g, s[i][g]],
          ],
          temp,
        );
      } else if (r < 0.8) {
        // sposta un blocco di un giorno (avanti o indietro)
        if (!s[i][g]) continue;
        let a = g;
        while (a - 1 >= 1 && s[i][a - 1] && amm[i][a - 1]) a--;
        let b = g;
        while (b + 1 <= nG && s[i][b + 1] && amm[i][b + 1]) b++;
        const avanti = rnd() < 0.5;
        if (avanti && b + 1 <= nG && amm[i][b + 1] && !s[i][b + 1])
          applica(
            [
              [i, a, ''],
              [i, b + 1, s[i][b]],
            ],
            temp,
          );
        else if (!avanti && a - 1 >= 1 && amm[i][a - 1] && !s[i][a - 1])
          applica(
            [
              [i, b, ''],
              [i, a - 1, s[i][a]],
            ],
            temp,
          );
      } else {
        // scambia una finestra di giorni con un collega (stessi posti, blocchi diversi)
        const j = Math.floor(rnd() * N);
        if (j === i) continue;
        const lung = 2 + Math.floor(rnd() * 5);
        const mosse = [];
        let ok = true;
        for (let h = g; h < g + lung && h <= nG; h++) {
          if (!amm[i][h] || !amm[j][h]) {
            ok = false;
            break;
          }
          if (s[i][h] !== s[j][h]) mosse.push([i, h, s[j][h]], [j, h, s[i][h]]);
        }
        if (ok && mosse.length) applica(mosse, temp);
      }
      if (cor < migliore.c - 1e-9) migliore = { c: cor, s: s.map((x) => x.slice()) };
    }
    if (Date.now() - tPausa > 40) {
      await pianoCedi();
      tPausa = Date.now();
    }
  }
  // il migliore trovato
  for (let i = 0; i < N; i++) s[i] = migliore.s[i];
  const cella = {};
  let scop = 0;
  let inPiu = 0;
  for (let i = 0; i < N; i++) for (let g = 1; g <= nG; g++) if (amm[i][g]) cella[nomi[i] + '|' + g] = s[i][g] || 'R';
  for (let g = 1; g <= nG; g++)
    ['P', 'D', 'N'].forEach((ti) => {
      const chi = [];
      for (let i = 0; i < N; i++) if (s[i][g] === ti) chi.push(i);
      const a = _pianoSchemaAbbina(posti[g][ti], chi, (i, c) => amm[i][g][ti].has(c));
      scop += a.scop + a.scopR;
      inPiu += a.inPiu;
    });
  let buchi = 0;
  for (let i = 0; i < N; i++) {
    const tipi = [];
    for (let k = 0; k < L; k++) tipi.push(tipoGiorno(i, k));
    buchi += PianoRegole.blocchiSpezzati(tipi, _pianoBlocchiPar(parBl, 14, 13 + nG, false)).length;
  }
  return {
    cella: cella,
    info: {
      persone: N,
      iterazioni: it,
      accettate: accettate,
      costo: Math.round(migliore.c),
      scopertiStimati: scop,
      inPiu: inPiu,
      buchi: buchi,
      secondi: Math.round((Date.now() - t0) / 100) / 10,
    },
  };
}

// la regola "Prepara il mese a blocchi" (bozza_a_blocchi, predefinita Si) del settore aperto
function _pianoBozzaABlocchi() {
  const v = typeof _pianoRegolaOPred === 'function' ? _pianoRegolaOPred('bozza_a_blocchi') : null;
  return String(v == null ? 'TRUE' : v).toUpperCase() === 'TRUE';
}
// BOZZA A BLOCCHI: la bozza di sempre con lo schema (generaBozzaPiano lo calcola dopo le vacanze,
// dentro lo stesso passo di Annulla). opz: { secondi } tempo dello schema
async function pianoBozzaBlocchi(opz) {
  opz = opz || {};
  await generaBozzaPiano(false, { blocchi: true, secondiSchema: opz.secondi });
  return null;
}
