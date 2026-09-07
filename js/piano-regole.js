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

  return { oraNum, riposoOre, violazioniCella, violazioniAccompagnamento, idoneoPerTurno };
});
