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
    // il giorno dopo si aggiunge solo se il turno finisce dopo la mezzanotte
    // (fine <= inizio): il flag "oltre le 23" e' vero anche per chi chiude
    // alle 23:30 e dava un riposo negativo
    const fineAbs = fine1 <= oraNum(t1.ora_inizio) ? 24 + fine1 : fine1;
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
  // REGOLE "CHI FA COSA" (regole di gruppo, per settore, create dall'utente):
  //   turni_solo_funzioni   'L1,9:BO,SUP'          -> quei turni solo a quelle funzioni
  //   funzione_turni_giorni 'SUP:Z*,L1,9:0,1,2,3'  -> in quei giorni (0=lun..6=dom,
  //                         vuoto = sempre) la funzione fa SOLO turni che
  //                         combaciano con i modelli (Z* = tutte le sigle che
  //                         iniziano con Z)
  // dow: giorno JS (0=dom) oppure null quando il giorno non e' noto (in quel
  // caso le regole a giorni non si applicano). Ritorna il motivo o null.
  function violazioneFunzioneTurno(info, turno, dow, regole) {
    if (!turno || !turno.codice || !Array.isArray(regole) || !regole.length) return null;
    const cod = String(turno.codice).toUpperCase();
    const fz = String((info && info.funzione) || '').toUpperCase();
    const settori = Array.isArray(info && info._settori) ? info._settori : [];
    const combacia = (modello) => {
      const m = String(modello || '')
        .trim()
        .toUpperCase();
      if (!m) return false;
      if (m.endsWith('*')) return cod.startsWith(m.slice(0, -1));
      return cod === m;
    };
    const dowPy = dow == null ? null : (dow + 6) % 7;
    for (const rg of regole) {
      if (rg.attivo === false) continue;
      const tipo = String(rg.tipo_regola || '').toLowerCase();
      const parti = String(rg.valore || '').split(':');
      if (tipo === 'turni_solo_funzioni') {
        const turni = (parti[0] || '').split(',').map((x) => x.trim());
        const funzioni = (parti[1] || '')
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
        if (!turni.some(combacia)) continue;
        if (funzioni.includes(fz) || settori.some((x) => funzioni.includes(String(x).toUpperCase()))) continue;
        return 'turno ' + cod + ' riservato a ' + funzioni.join(', ') + ' (funzione: ' + (fz || 'nessuna') + ')';
      }
      if (tipo === 'funzione_turni_giorni') {
        if (dowPy == null) continue;
        const funzione = (parti[0] || '').trim().toUpperCase();
        if (funzione !== fz) continue;
        const modelli = (parti[1] || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        const giorni = (parti[2] || '')
          .split(',')
          .map((x) => parseInt(x))
          .filter((x) => !isNaN(x));
        if (giorni.length && !giorni.includes(dowPy)) continue;
        if (modelli.some(combacia)) continue;
        return (
          fz + ' con turno ' + cod + (giorni.length ? ' in questo giorno' : '') + ': ammessi solo ' + modelli.join(', ')
        );
      }
    }
    return null;
  }
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
        // "Funzioni ammesse": chi ha la funzione fa i turni del gruppo anche
        // senza averlo fra i settori; chi non ce l'ha deve avere il gruppo fra
        // i settori. Prima la funzione non dava mai il permesso (la riga finale
        // bloccava comunque chi non aveva il gruppo).
        const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
        if (ammesse.includes(fzU)) campoGrant = true;
        else if (!haSettore) return false;
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
    // regole "chi fa cosa" del settore (senza giorno: solo turni_solo_funzioni)
    if (typeof ctx.regoleTurnoFunzione === 'function') {
      const infoS = Object.assign({}, info, { _settori: settoriC || [] });
      if (violazioneFunzioneTurno(infoS, turno, null, ctx.regoleTurnoFunzione())) return false;
    }
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
          { anni: 25, giorni: 4 },
        ];
    if (!dataAssunzione) return null;
    const ass = new Date(dataAssunzione + 'T12:00:00');
    if (isNaN(ass.getTime())) return null;
    // CONGEDO NON PAGATO (RAP 5.14): solo i congedi oltre la soglia in mesi
    // spostano l'anzianita' (cfg.giorniAnzianita, in giorni); cfg.mesiCongedo
    // resta per compatibilita' con il vecchio conteggio a mesi.
    const mesiFermo = Math.max(0, parseInt(c.mesiCongedo) || 0);
    if (mesiFermo) ass.setMonth(ass.getMonth() + mesiFermo);
    const ggAnz = Math.max(0, parseInt(c.giorniAnzianita) || 0);
    if (ggAnz) ass.setDate(ass.getDate() + ggAnz);
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
    // bonus: NON si sommano tra loro, lo scaglione nuovo SOSTITUISCE il vecchio.
    // Chi ha 10 anni ha 1 giorno; quando arriva a 15 ne ha 2 in tutto, non 3.
    // Vale quindi lo scaglione piu' alto gia' raggiunto entro la fine dell'anno.
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
          totBonus = parseFloat(b.giorni) || 0;
          voci.length = 0;
          voci.push({ anni: parseInt(b.anni), giorni: parseFloat(b.giorni) || 0, dal: dataB.getFullYear() });
        }
      });
    // ARROTONDAMENTO AL GIORNO PIENO (regola aziendale): dalla soglia in su si
    // arrotonda in alto, a favore del collaboratore (32.67 -> 33, 32.37 -> 33),
    // sotto la soglia si tiene il giorno intero (32.3 -> 32). La soglia e'
    // configurabile; senza soglia si mostra il valore esatto.
    // congedo non pagato oltre la soglia: "il diritto alle vacanze decade per
    // tutta la durata del congedo" -> in proporzione ai giorni di congedo
    // dell'anno (cfg.giorniCongedo), sull'intero diritto
    const ggCong = Math.max(0, parseInt(c.giorniCongedo) || 0);
    const fattoreCongedo = ggCong ? Math.max(0, (365 - ggCong) / 365) : 1;
    const esatti = Math.round((parteBase + totBonus) * fattoreCongedo * 100) / 100;
    let giorniFinali = esatti;
    if (c.arrotondaDa != null && c.arrotondaDa !== '') {
      const soglia = parseFloat(c.arrotondaDa);
      if (!isNaN(soglia)) {
        const frazione = esatti - Math.floor(esatti);
        giorniFinali = frazione >= soglia - 0.001 ? Math.ceil(esatti) : Math.floor(esatti);
      }
    }
    return {
      giorni: giorniFinali,
      giorniEsatti: esatti,
      base: Math.round(parteBase * 100) / 100,
      bonus: totBonus,
      giorniCongedo: ggCong,
      voci: voci,
      mesiBase1: mesiBase1,
      mesiBase2: mesiBase2,
    };
  }

  // ---------------------------------------------------------------------------
  // FESTIVITA' E ORARI DI CHIUSURA
  //
  // Il casino chiude alle 04:00 nei giorni feriali e alle 05:00 il venerdi' e
  // il sabato. Nei giorni di festivita' (soprattutto quelle italiane, per la
  // clientela di frontiera) la chiusura e' alle 05:00 anche se cade in un altro
  // giorno della settimana, e il 31 dicembre alle 07:00. Sapere in anticipo
  // quali sono quei giorni serve a mettere piu' personale a lavorare.
  // ---------------------------------------------------------------------------

  // Pasqua (algoritmo di Meeus, calendario gregoriano) -> 'YYYY-MM-DD'
  function pasqua(anno) {
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
    return anno + '-' + String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');
  }

  function _piu(dstr, giorni) {
    const d = new Date(dstr + 'T12:00:00');
    d.setDate(d.getDate() + giorni);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  }

  // Festivita' italiane di un anno: fisse di legge piu' Pasqua e Lunedi
  // dell'Angelo calcolati. Sono i giorni in cui la clientela italiana e' in
  // vacanza, quindi il casino chiude piu' tardi.
  function festivitaItaliane(anno) {
    const p = pasqua(anno);
    return [
      { data: anno + '-01-01', nome: 'Capodanno' },
      { data: anno + '-01-06', nome: 'Epifania' },
      { data: p, nome: 'Pasqua' },
      { data: _piu(p, 1), nome: "Lunedi dell'Angelo" },
      { data: anno + '-04-25', nome: 'Festa della Liberazione' },
      { data: anno + '-05-01', nome: 'Festa del Lavoro' },
      { data: anno + '-06-02', nome: 'Festa della Repubblica' },
      { data: anno + '-08-15', nome: 'Ferragosto' },
      { data: anno + '-11-01', nome: 'Tutti i Santi' },
      { data: anno + '-12-08', nome: 'Immacolata Concezione' },
      { data: anno + '-12-25', nome: 'Natale' },
      { data: anno + '-12-26', nome: 'Santo Stefano' },
    ];
  }

  // Orario di chiusura di un giorno.
  //   dstr        : 'YYYY-MM-DD'
  //   festivita   : { 'YYYY-MM-DD': 'nome' }  (elenco in vigore, modificabile)
  //   cfg.giorniTardi : giorni della settimana che chiudono tardi (default ven=5, sab=6)
  //   cfg.oraNormale / cfg.oraTardi / cfg.oraFineAnno
  // Ritorna { ora, motivo, marcatore } dove marcatore e' cio' che si scrive in
  // cima alla colonna del giorno nel piano ('' quando non serve segnalare
  // niente, cioe' quando l'orario e' quello che tutti gia' conoscono).
  function chiusuraDelGiorno(dstr, festivita, cfg) {
    const c = cfg || {};
    const oraNormale = c.oraNormale != null ? c.oraNormale : 4;
    const oraTardi = c.oraTardi != null ? c.oraTardi : 5;
    const oraFineAnno = c.oraFineAnno != null ? c.oraFineAnno : 7;
    const giorniTardi = Array.isArray(c.giorniTardi) ? c.giorniTardi : [5, 6];
    if (!dstr) return { ora: oraNormale, motivo: '', marcatore: '' };
    const d = new Date(dstr + 'T12:00:00');
    if (isNaN(d.getTime())) return { ora: oraNormale, motivo: '', marcatore: '' };
    const mmgg = dstr.substring(5);
    // 31 dicembre: chiusura piu' lunga, vale sempre e va segnalata sempre
    if (mmgg === '12-31') return { ora: oraFineAnno, motivo: 'ultimo dell anno', marcatore: 'CH' + oraFineAnno };
    const tardiPerGiorno = giorniTardi.indexOf(d.getDay()) >= 0;
    // LA NOTTE PRIMA DEL FESTIVO: il casino chiude alle 05:00 la notte che
    // PRECEDE il giorno di festa, non la notte del giorno di festa. Il primo
    // gennaio la gente esce la sera del 31; la sera del primo, se il 2 si
    // lavora, si chiude all'orario normale.
    const domani = new Date(d);
    domani.setDate(domani.getDate() + 1);
    const dstrDomani =
      domani.getFullYear() +
      '-' +
      String(domani.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(domani.getDate()).padStart(2, '0');
    const festaDomani = (festivita || {})[dstrDomani] || '';
    if (festaDomani) {
      // orario proprio della festivita' (campo "Chiusura" della scheda), se
      // c'e'; altrimenti la chiusura tardi standard
      const oraProp = c.orePerData && c.orePerData[dstrDomani] != null ? c.orePerData[dstrDomani] : null;
      const oraV = oraProp != null && !isNaN(oraProp) ? oraProp : oraTardi;
      // gia' venerdi o sabato con l'orario solito: nessun marcatore, ma il
      // motivo resta perche' serve comunque a prevedere l'affluenza
      return {
        ora: oraV,
        motivo: 'vigilia di ' + festaDomani,
        marcatore: tardiPerGiorno && oraV === oraTardi ? '' : 'CH' + oraV,
      };
    }
    return { ora: tardiPerGiorno ? oraTardi : oraNormale, motivo: '', marcatore: '' };
  }

  // ---------------------------------------------------------------------------
  // GIORNI CHIUSI (piano bloccato)
  //
  // Passata la giornata di gioco, il piano di quel giorno e' un documento: non
  // si modifica piu' per distrazione, solo con uno sblocco motivato e tracciato.
  // La giornata di gioco del giorno D si chiude la mattina di D+1 (alle 4, alle
  // 5 o alle 7), poi resta un margine di respiro fino all'ora limite di D+1:
  // chi apre al mattino sistema le ultime cose senza sbloccare niente.
  //
  //   dstr    : 'YYYY-MM-DD' del giorno da controllare
  //   adesso  : Date corrente (iniettata, cosi' la funzione e' testabile)
  //   cfg.oraLimite : ora di D+1 oltre la quale D e' chiuso (default 12)
  //   cfg.attivo    : false = blocco spento del tutto
  // ---------------------------------------------------------------------------
  function giornoBloccato(dstr, adesso, cfg) {
    const c = cfg || {};
    if (c.attivo === false) return false;
    if (!dstr || !adesso) return false;
    const oraLimite = c.oraLimite != null ? c.oraLimite : 12;
    const soglia = new Date(dstr + 'T12:00:00');
    if (isNaN(soglia.getTime())) return false;
    soglia.setDate(soglia.getDate() + 1);
    soglia.setHours(Math.floor(oraLimite), Math.round((oraLimite % 1) * 60), 0, 0);
    return adesso.getTime() >= soglia.getTime();
  }

  // MESE CHIUSO: come il giorno, ma sull'ultimo giorno del mese. Settembre e'
  // chiuso dal 1 ottobre (piu' il respiro fino all'ora limite): da li' il saldo
  // di settembre si corregge solo con motivo tracciato.
  //   ym : 'YYYY-MM'
  function meseBloccato(ym, adesso, cfg) {
    if (!ym || !adesso) return false;
    const p = String(ym).split('-');
    if (p.length < 2) return false;
    const ultimo = new Date(parseInt(p[0]), parseInt(p[1]), 0, 12);
    const iso =
      ultimo.getFullYear() +
      '-' +
      String(ultimo.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(ultimo.getDate()).padStart(2, '0');
    return giornoBloccato(iso, adesso, cfg);
  }

  return {
    oraNum,
    riposoOre,
    violazioniCella,
    violazioniAccompagnamento,
    idoneoPerTurno,
    violazioneFunzioneTurno,
    indiceBenessere,
    giorniVacanzaSpettanti,
    pasqua,
    festivitaItaliane,
    chiusuraDelGiorno,
    giornoBloccato,
    meseBloccato,
  };
});
