/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-regole.js
 *
 * MOTORE DELLE REGOLE del piano di lavoro, in funzioni PURE e testabili.
 * Non tocca il DOM, il database o le variabili globali dell'app: riceve tutto
 * come parametri e ritorna risultati. Cosi' l'IT puo' verificarlo con Node
 * ("node test/piano-regole.test.js") in millisecondi, senza browser ne server,
 * e vale identico sia in cloud sia sul server locale del casino.
 *
 * I wrapper in piano.js leggono lo stato dell'app (turni, collaboratori,
 * regole) e chiamano queste funzioni: la logica delle regole vive qui, in un
 * solo posto, cosi' modificarla o correggerla e' semplice e sicuro.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.PianoRegole = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // "HH:MM" -> ore decimali (08:30 -> 8.5). null se vuoto.
  function oraNum(hhmm) {
    if (!hhmm) return null;
    const p = String(hhmm).split(':');
    return parseInt(p[0]) + (parseInt(p[1]) || 0) / 60;
  }

  // Ore di riposo tra la FINE del turno t1 e l'INIZIO del turno t2 (giorni
  // adiacenti). t1/t2 sono oggetti {ora_inizio, ora_fine, oltre23} o null.
  // null se uno dei due non e' un turno di lavoro.
  function riposoOre(t1, t2) {
    if (!t1 || !t2) return null;
    const fine1 = oraNum(t1.ora_fine);
    const inizio2 = oraNum(t2.ora_inizio);
    if (fine1 == null || inizio2 == null) return null;
    const fineAbs = t1.oltre23 || fine1 < oraNum(t1.ora_inizio) ? 24 + fine1 : fine1;
    return 24 + inizio2 - fineAbs;
  }

  // Violazioni di riposo, consecutivi e idoneita' per la cella (nome, giorno).
  // Tutto iniettato, cosi' e' puro:
  //   opts.mappaGiorni : { 'YYYY-MM-DD': codice }  (stato attorno al giorno)
  //   opts.giorno      : 'YYYY-MM-DD' della cella
  //   opts.minRiposo   : ore minime tra due turni (0 = regola spenta)
  //   opts.maxCons     : giorni consecutivi massimi (0 = regola spenta)
  //   opts.turnoDi(cod): -> oggetto turno {ora_inizio,ora_fine,oltre23,tipo,...} o null
  //   opts.isLavoro(cod): -> bool (true se il codice e' un turno di lavoro)
  //   opts.idoneo      : (opzionale) bool: false = "non formato" per il turno nuovo
  //   opts.codiceNuovo : (opzionale) codice della cella, per il messaggio idoneita'
  // Ritorna un array di stringhe (avvisi). Vuoto = nessuna violazione.
  function violazioniCella(opts) {
    const mappa = opts.mappaGiorni || {};
    const giorno = opts.giorno;
    const minRiposo = opts.minRiposo || 0;
    const maxCons = opts.maxCons || 0;
    const turnoDi = opts.turnoDi;
    const isLavoro = opts.isLavoro;
    const avvisi = [];
    if (!maxCons && !minRiposo && opts.idoneo == null) return avvisi;
    const iso = (d) => {
      const x = new Date(giorno + 'T12:00:00');
      x.setDate(x.getDate() + d);
      return x.toISOString().substring(0, 10);
    };
    const riposoTra = (codA, codB) => riposoOre(turnoDi(codA), turnoDi(codB));
    // riposo minimo tra turni adiacenti (prima e dopo)
    if (minRiposo && mappa[giorno]) {
      const rPrima = riposoTra(mappa[iso(-1)], mappa[giorno]);
      if (rPrima != null && rPrima < minRiposo)
        avvisi.push(
          'solo ' + rPrima.toFixed(1) + 'h di riposo dopo il turno del giorno prima (minimo ' + minRiposo + 'h)',
        );
      const rDopo = riposoTra(mappa[giorno], mappa[iso(1)]);
      if (rDopo != null && rDopo < minRiposo)
        avvisi.push(
          'solo ' + rDopo.toFixed(1) + 'h di riposo prima del turno del giorno dopo (minimo ' + minRiposo + 'h)',
        );
    }
    // idoneita' / formazione alla posizione
    if (opts.idoneo === false)
      avvisi.push(
        'non risulta formato/idoneo per il turno ' +
          (opts.codiceNuovo || '') +
          ' (settore, regole di gruppo o turni bloccati in Gestione collaboratori)',
      );
    // massimo giorni consecutivi (attraversa i confini del mese)
    if (maxCons && isLavoro(mappa[giorno] || '')) {
      let cons = 1;
      for (let n = -1; n >= -maxCons - 2 && isLavoro(mappa[iso(n)] || ''); n--) cons++;
      for (let n = 1; n <= maxCons + 2 && isLavoro(mappa[iso(n)] || ''); n++) cons++;
      if (cons > maxCons) avvisi.push(cons + ' giorni di lavoro consecutivi (massimo ' + maxCons + ')');
    }
    return avvisi;
  }

  // Accompagnamento: chi e' "accompagnato" in un gruppo non deve restare DA
  // SOLO in quel gruppo in un dato giorno. Iniettato:
  //   opts.perNome     : { nome: codice } (stato del giorno, gia' con override)
  //   opts.turnoDi(cod): -> oggetto turno o null
  //   opts.gruppoDi(cod): -> gruppo maiuscolo del turno ('' se nessuno)
  //   opts.isAccompagnato(nome, gruppo): -> bool
  // Ritorna [{nome, gruppo}] di chi resta solo.
  function violazioniAccompagnamento(opts) {
    const perNome = opts.perNome || {};
    const conta = {};
    const accs = [];
    Object.keys(perNome).forEach((nm) => {
      const t = opts.turnoDi(perNome[nm]);
      if (!t) return;
      const gr = opts.gruppoDi(perNome[nm]);
      if (!gr) return;
      conta[gr] = (conta[gr] || 0) + 1;
      if (opts.isAccompagnato(nm, gr)) accs.push({ nome: nm, gruppo: gr });
    });
    return accs.filter((a) => (conta[a.gruppo] || 0) <= 1);
  }

  // Idoneita' alla posizione (settori assegnati, regole di gruppo, solo diurni,
  // turni bloccati, mappatura funzione, regola L1). Iniettato:
  //   info  : record collaboratore
  //   turno : {codice, tipo, gruppo}
  //   ctx.settoriDi(info)        : -> array gruppi o null
  //   ctx.regoleGruppoDi(gruppo) : -> array regole {tipo_regola, valore}
  //   ctx.campoOk(info, valore)  : -> bool
  //   ctx.mappFunzione(funzione) : -> array {tipo, turno_codice} o null
  //   ctx.regolaVal(nome)        : -> valore regola o null
  function idoneoPerTurno(info, turno, ctx) {
    info = info || {};
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
    const settoriC = ctx.settoriDi(info);
    const haSettore = settoriC ? settoriC.includes(gruppoT) : true;
    let campoGrant = false;
    for (const rg of ctx.regoleGruppoDi(gruppoT)) {
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
        if (!ctx.campoOk(info, rg.valore)) return false;
        campoGrant = true;
      }
    }
    if (settoriC && !haSettore && !campoGrant) return false;
    const mapp = ctx.mappFunzione(info.funzione);
    if (mapp) {
      const voci = mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO').map((m) => m.turno_codice);
      if (voci.length && !voci.includes(turno.codice)) return false;
    }
    if (
      (turno.codice === 'L1' || turno.codice === '9') &&
      String(ctx.regolaVal('l1_solo_bo_sup')).toUpperCase() === 'TRUE' &&
      fzU !== 'SUP' &&
      fzU !== 'BO' &&
      !(settoriC || []).some((x) => x === 'BO' || x === 'SUP')
    )
      return false;
    return true;
  }

  // ===== INDICE DI BENESSERE =====
  // Misura, su dati oggettivi del piano, quanto e' sostenibile il carico di una
  // persona. Non giudica la persona: fotografa come e' distribuito il lavoro.
  // Le malattie NON tolgono punti (non sono una colpa): si mostrano a parte
  // come segnale da leggere insieme al resto.
  //
  // dati: {
  //   domenicheLibere, domenicheTot,   // riposo domenicale
  //   weekendLavorati, weekendMediaSettore,
  //   notti, giorniLavorati,
  //   riposiIsolati,                   // riposo di UN solo giorno tra due periodi di lavoro
  //   serieMax,                        // giorni consecutivi piu' lunga serie
  //   vacanzeGiorni,
  //   cambiRitmo                       // passaggi notte->giorno ravvicinati
  // }
  // soglie: { domenicheAnno, maxConsecutivi, vacanzeAnno }
  // Ritorna { punteggio 0-100, voci: [{nome, punti, max, valore, nota}] }
  function indiceBenessere(dati, soglie) {
    const s = soglie || {};
    const domObiettivo = s.domenicheAnno || 12;
    const maxCons = s.maxConsecutivi || 5;
    const vacObiettivo = s.vacanzeAnno || 20;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const voci = [];
    // 1) DOMENICHE LIBERE (25): diritto al riposo domenicale
    const dom = clamp((dati.domenicheLibere || 0) / domObiettivo);
    voci.push({
      nome: 'Domeniche libere',
      punti: Math.round(dom * 25),
      max: 25,
      valore: (dati.domenicheLibere || 0) + ' su ' + domObiettivo + ' attese',
      nota: dom >= 1 ? 'nella norma' : 'sotto il minimo previsto',
    });
    // 2) EQUITA' WEEKEND (20): quanto si discosta dalla media del settore
    let eqW = 1;
    if (dati.weekendMediaSettore > 0) {
      const scarto = (dati.weekendLavorati - dati.weekendMediaSettore) / dati.weekendMediaSettore;
      eqW = clamp(1 - Math.max(0, scarto) / 0.5); // +50% sulla media = 0 punti
    }
    voci.push({
      nome: 'Equita nei weekend',
      punti: Math.round(eqW * 20),
      max: 20,
      valore:
        (dati.weekendLavorati || 0) + ' weekend (media settore ' + Math.round(dati.weekendMediaSettore || 0) + ')',
      nota: eqW >= 0.8 ? 'in linea col settore' : 'piu carico della media',
    });
    // 3) CARICO NOTTURNO (15): quota di notti sui giorni lavorati
    const quotaN = dati.giorniLavorati > 0 ? (dati.notti || 0) / dati.giorniLavorati : 0;
    const notti = clamp(1 - Math.max(0, quotaN - 0.3) / 0.4); // oltre il 30% inizia a pesare
    voci.push({
      nome: 'Carico notturno',
      punti: Math.round(notti * 15),
      max: 15,
      valore:
        (dati.notti || 0) + ' notti su ' + (dati.giorniLavorati || 0) + ' giorni (' + Math.round(quotaN * 100) + '%)',
      nota: quotaN <= 0.3 ? 'sostenibile' : 'quota notturna elevata',
    });
    // 4) QUALITA' DEL RIPOSO (15): i riposi isolati recuperano poco
    const isolati = clamp(1 - (dati.riposiIsolati || 0) / 8);
    voci.push({
      nome: 'Qualita del riposo',
      punti: Math.round(isolati * 15),
      max: 15,
      valore: (dati.riposiIsolati || 0) + ' riposi di un solo giorno',
      nota: (dati.riposiIsolati || 0) <= 2 ? 'riposi ben raggruppati' : 'troppi riposi isolati',
    });
    // 5) SERIE DI LAVORO (15): giorni consecutivi
    const serie = clamp(1 - Math.max(0, (dati.serieMax || 0) - maxCons) / 3);
    voci.push({
      nome: 'Giorni consecutivi',
      punti: Math.round(serie * 15),
      max: 15,
      valore: 'serie piu lunga: ' + (dati.serieMax || 0) + ' giorni (limite ' + maxCons + ')',
      nota: (dati.serieMax || 0) <= maxCons ? 'entro il limite' : 'oltre il limite',
    });
    // 6) VACANZE GODUTE (10): staccare davvero
    const vac = clamp((dati.vacanzeGiorni || 0) / vacObiettivo);
    voci.push({
      nome: 'Vacanze godute',
      punti: Math.round(vac * 10),
      max: 10,
      valore: (dati.vacanzeGiorni || 0) + ' giorni',
      nota: vac >= 0.8 ? 'stacca regolarmente' : 'ha goduto poche vacanze',
    });
    const punteggio = voci.reduce((s2, v) => s2 + v.punti, 0);
    return { punteggio: punteggio, voci: voci };
  }

  // ===== GIORNI DI VACANZA SPETTANTI (personale fisso) =====
  // Regola aziendale:
  //  - primi 2 anni di contratto: 28 giorni all'anno
  //  - dal compimento dei 2 anni: 35 giorni all'anno
  //  - nell'anno del passaggio il diritto si matura mese per mese (pro rata):
  //    i mesi prima dell'anniversario valgono 28/12, quelli dopo 35/12
  //  - giorni in piu' per anzianita', CUMULATIVI e riconosciuti per intero
  //    nell'anno in cui cade l'anniversario: 10 anni +1, 15 anni +2,
  //    20 anni +3, 25 anni +5 (quindi 36, 38, 41, 46 giorni)
  // Gli ausiliari non rientrano: hanno l'indennita' in percentuale (RAP All. 1).
  //
  // dataAssunzione: 'YYYY-MM-DD' · anno: anno civile da calcolare
  // cfg: { base1: 28, base2: 35, bonus: [{anni:10,giorni:1}, ...] }
  // cfg.mesiCongedo: mesi di congedo non pagato, che non maturano anzianita' e
  // spostano in avanti sia i giubilei sia gli scaglioni delle vacanze (sono la
  // stessa anzianita' di servizio).
  function giorniVacanzaSpettanti(dataAssunzione, anno, cfg) {
    const c = cfg || {};
    const base1 = c.base1 != null ? c.base1 : 28;
    const base2 = c.base2 != null ? c.base2 : 35;
    const bonus = Array.isArray(c.bonus)
      ? c.bonus
      : [
          { anni: 10, giorni: 1 },
          { anni: 15, giorni: 2 },
          { anni: 20, giorni: 3 },
          { anni: 25, giorni: 5 },
        ];
    if (!dataAssunzione) return null;
    const ass = new Date(dataAssunzione + 'T12:00:00');
    if (isNaN(ass.getTime())) return null;
    // i mesi fermi spostano in avanti la maturazione, come per i giubilei
    const mesiFermo = Math.max(0, parseInt(c.mesiCongedo) || 0);
    if (mesiFermo) ass.setMonth(ass.getMonth() + mesiFermo);
    // se assunto dopo l'anno richiesto: nessun diritto
    if (ass.getFullYear() > anno) return { giorni: 0, base: 0, bonus: 0, voci: [], mesi: 0 };
    // data in cui compie 2 anni
    const dueAnni = new Date(ass);
    dueAnni.setFullYear(ass.getFullYear() + 2);
    let mesiBase1 = 0;
    let mesiBase2 = 0;
    for (let m = 1; m <= 12; m++) {
      // il mese conta solo se il rapporto era gia' in corso
      const fineMese = new Date(anno, m, 0, 12);
      if (fineMese < ass) continue;
      // il mese in cui cade l'anniversario matura gia' alla quota nuova
      const inizioMese = new Date(anno, m - 1, 1, 12);
      const fineM = new Date(anno, m, 0, 12);
      if (fineM >= dueAnni) mesiBase2++;
      else mesiBase1++;
      void inizioMese;
    }
    const parteBase = (base1 / 12) * mesiBase1 + (base2 / 12) * mesiBase2;
    // bonus: tutti quelli il cui anniversario cade entro la fine dell'anno
    const fineAnno = new Date(anno, 11, 31, 12);
    const voci = [];
    let totBonus = 0;
    bonus
      .slice()
      .sort((x, y) => x.anni - y.anni)
      .forEach((b) => {
        const dataB = new Date(ass);
        dataB.setFullYear(ass.getFullYear() + parseInt(b.anni));
        // il giorno in piu' spetta DAL GIORNO DOPO l'anniversario: se cade il
        // 31 dicembre, vale dall'anno seguente
        dataB.setDate(dataB.getDate() + 1);
        if (dataB <= fineAnno) {
          totBonus += parseFloat(b.giorni) || 0;
          voci.push({ anni: parseInt(b.anni), giorni: parseFloat(b.giorni) || 0, dal: dataB.getFullYear() });
        }
      });
    return {
      giorni: Math.round((parteBase + totBonus) * 100) / 100,
      base: Math.round(parteBase * 100) / 100,
      bonus: totBonus,
      voci: voci,
      mesiBase1: mesiBase1,
      mesiBase2: mesiBase2,
    };
  }

  return {
    oraNum,
    riposoOre,
    violazioniCella,
    violazioniAccompagnamento,
    idoneoPerTurno,
    indiceBenessere,
    giorniVacanzaSpettanti,
  };
});
