/**
 * Diario Collaboratori · Casino Lugano SA
 * File: organico-modello.js
 *
 * ANALISI DELL ORGANICO: quante persone servono per coprire il fabbisogno del
 * piano rispettando ore, riposi e domeniche, con le assenze reali (vacanze,
 * CGF, malattie, congedi non pagati, altri impegni). Funzioni PURE, come
 * piano-regole.js: niente DOM ne database, tutto arriva come parametro, cosi
 * si verifica con Node (node test/organico.test.js).
 *
 * Metodo (pianificazione del personale, tre livelli di verifica):
 *  1. ORE: ore richieste dal fabbisogno contro ore nette disponibili
 *     (ore di contratto meno le assenze: "shrinkage"). La differenza in ore si
 *     legge anche in tempi pieni (FTE) netti.
 *  2. PERSONE: il giorno di punta e le domeniche (ognuno ne ha N libere
 *     all anno) chiedono un numero minimo di persone, non solo di ore: una
 *     persona al 50% copre comunque una domenica intera.
 *  3. AFFIDABILITA: le malattie arrivano a caso. Con la distribuzione
 *     binomiale si calcola quante persone a chiamata servono perche nel 95%
 *     dei giorni ogni assenza improvvisa abbia una copertura.
 * I mesi gia passati si calcolano con le assenze vere (consuntivo), i mesi
 * futuri con quelle note (vacanze, CGF, congedi gia nel piano) piu le
 * malattie attese dal tasso storico del mese.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.OrganicoModello = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PARAMETRI_PREDEFINITI = {
    oreSett: 41, // ore settimanali di un tempo pieno
    domenicheLibere: 12, // domeniche libere all anno per persona
    jollyPct: 0.8, // ausiliari: percentuale su cui si pianifica
    livelloServizio: 0.95, // giorni in cui una malattia improvvisa deve trovare copertura
    codiciMalattia: ['M', 'M1', 'I', 'I1'],
    codiciVacanza: ['V', 'V1'],
    codiciCgf: ['CGF'],
    codiciCongedoNp: ['CNP'],
    // assenze retribuite o impegni fuori dai turni del fabbisogno
    codiciImpegni: ['F', '1F', 'CS', 'LRD', 'JG', 'U', 'US', 'P', 'MI', 'PC', 'FU', 'TR', 'MT', 'NS', 'AF', 'MA'],
    pesoStorico: 400, // giorni-persona: quanto il tasso del singolo mese si avvicina alla media annua
  };

  const giorniNelMese = (anno, m) => new Date(anno, m, 0).getDate();
  const NOMI_MESI = [
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
  // "novembre" · "novembre e dicembre" · "ottobre, novembre e dicembre"
  function elencoMesi(mesi) {
    const n = mesi.map((m) => NOMI_MESI[+m - 1]);
    return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
  }
  // "A" · "A e B" · "A, B e C"
  function elencoMesiTesto(v) {
    return v.length <= 1 ? v.join('') : v.slice(0, -1).join(', ') + ' e ' + v[v.length - 1];
  }
  // "a novembre" · "nei mesi di novembre e dicembre"
  const neiMesi = (mesi) => (mesi.length === 1 ? 'a ' : 'nei mesi di ') + elencoMesi(mesi);
  const iso = (anno, m, g) => anno + '-' + String(m).padStart(2, '0') + '-' + String(g).padStart(2, '0');
  const arr1 = (x) => Math.round(x * 10) / 10;

  // P(X <= k) per X ~ Binomiale(n, p)
  function binomCdf(k, n, p) {
    if (k < 0) return 0;
    if (k >= n) return 1;
    let q = Math.pow(1 - p, n);
    let s = q;
    for (let i = 1; i <= k; i++) {
      q = (q * (n - i + 1) * p) / (i * (1 - p));
      s += q;
    }
    return Math.min(1, s);
  }
  // persone a chiamata perche le assenze improvvise del giorno siano coperte con probabilita >= livello
  function riservaPerLivello(n, p, livello) {
    if (!n || !p) return 0;
    for (let k = 0; k <= n; k++) if (binomCdf(k, n, p) >= livello) return k;
    return n;
  }

  // persona in servizio in quel giorno? (assunzione, fine contratto)
  function inServizio(persona, d) {
    if (persona.assunzione && d < persona.assunzione) return false;
    if (persona.fine && d > persona.fine) return false;
    return true;
  }

  // TASSI STORICI dai giorni gia passati: malattia e altri impegni, per mese
  // dell anno, avvicinati alla media annua quando i giorni sono pochi.
  function tassiStorici(righe, persone, par) {
    const P = Object.assign({}, PARAMETRI_PREDEFINITI, par || {});
    const mal = new Set(P.codiciMalattia);
    const imp = new Set(P.codiciImpegni);
    const cnp = new Set(P.codiciCongedoNp);
    const inOrganico = new Set(persone.map((x) => x.nome));
    const perMese = {}; // MM -> {giorni, malattia, impegni}
    let tot = { giorni: 0, malattia: 0, impegni: 0 };
    (righe || []).forEach((r) => {
      const d = String(r.data).substring(0, 10);
      if (P.oggi && d > P.oggi) return; // solo il consuntivo
      if (!inOrganico.has(r.collaboratore)) return;
      const cod = String(r.codice || '').toUpperCase();
      if (cnp.has(cod)) return; // congedo non pagato: non e servizio
      const mm = d.substring(5, 7);
      const x = (perMese[mm] = perMese[mm] || { giorni: 0, malattia: 0, impegni: 0 });
      x.giorni++;
      tot.giorni++;
      if (mal.has(cod)) {
        x.malattia++;
        tot.malattia++;
      } else if (imp.has(cod)) {
        x.impegni++;
        tot.impegni++;
      }
    });
    const media = {
      malattia: tot.giorni ? tot.malattia / tot.giorni : 0,
      impegni: tot.giorni ? tot.impegni / tot.giorni : 0,
    };
    const k = P.pesoStorico;
    const mesi = {};
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const x = perMese[mm] || { giorni: 0, malattia: 0, impegni: 0 };
      mesi[m] = {
        malattia: (x.malattia + k * media.malattia) / (x.giorni + k),
        impegni: (x.impegni + k * media.impegni) / (x.giorni + k),
        giorniOsservati: x.giorni,
      };
    }
    return { media: media, mesi: mesi, giorniOsservati: tot.giorni };
  }

  // CARICO del mese: ore e posti richiesti dal fabbisogno
  function caricoMese(anno, m, fabbisogni, turni, durataGiorno) {
    const nG = giorniNelMese(anno, m);
    const posti = new Array(nG + 1).fill(0);
    const perGruppo = {};
    const perGruppoPosti = {}; // gruppo -> [posti per giorno]
    let ore = 0;
    let oreNotte = 0;
    (fabbisogni || []).forEach((f) => {
      const d = String(f.data).substring(0, 10);
      if (+d.substring(0, 4) !== anno || +d.substring(5, 7) !== m) return;
      const t = turni[f.codice];
      if (!t) return;
      const q = parseInt(f.quantita) || 0;
      if (!q) return;
      const g = +d.substring(8, 10);
      const h = (durataGiorno ? durataGiorno(f.codice, d) : null) || t.durata || 0;
      posti[g] += q;
      ore += q * h;
      if (t.tipo === 'NOTTURNO') oreNotte += q * h;
      const gr = t.gruppo || 'ALTRO';
      perGruppo[gr] = (perGruppo[gr] || 0) + q * h;
      (perGruppoPosti[gr] = perGruppoPosti[gr] || new Array(nG + 1).fill(0))[g] += q;
    });
    let postiMax = 0;
    let postiDomMax = 0;
    let giorniConFabb = 0;
    for (let g = 1; g <= nG; g++) {
      if (posti[g]) giorniConFabb++;
      postiMax = Math.max(postiMax, posti[g]);
      if (new Date(anno, m - 1, g, 12).getDay() === 0) postiDomMax = Math.max(postiDomMax, posti[g]);
    }
    return {
      giorni: nG,
      posti: posti,
      ore: ore,
      oreNotte: oreNotte,
      postiMax: postiMax,
      postiDomMax: postiDomMax,
      giorniConFabb: giorniConFabb,
      perGruppo: perGruppo,
      perGruppoPosti: perGruppoPosti,
    };
  }

  // OFFERTA del mese: ore di contratto e assenze, persona per persona
  // persone: [{nome, pct, jolly, assunzione, fine, vacanzeAnno, cnp: {MM: giorni}}]
  // righePer: { 'nome|YYYY-MM-DD': codice } dal piano (vacanze, CGF, malattie gia note)
  function offertaMese(anno, m, persone, righePer, tassi, par, opz) {
    const P = Object.assign({}, PARAMETRI_PREDEFINITI, par || {});
    const o = opz || {};
    const nG = giorniNelMese(anno, m);
    const orePieno = P.oreSett / 7; // ore di contratto di un giorno di calendario a tempo pieno
    const vac = new Set(P.codiciVacanza);
    const cgf = new Set(P.codiciCgf);
    const mal = new Set(P.codiciMalattia);
    const imp = new Set(P.codiciImpegni);
    const cnp = new Set(P.codiciCongedoNp);
    const passato = P.oggi ? iso(anno, m, nG) <= P.oggi : false;
    const tM = tassi.mesi[m] || { malattia: tassi.media.malattia, impegni: tassi.media.impegni };
    const res = {
      contratto: 0,
      vacanze: 0,
      cgf: 0,
      malattia: 0,
      impegni: 0,
      netto: 0,
      teste: 0,
      fte: 0,
      malattiaNota: 0,
      persone: [],
      passato: passato,
    };
    (persone || []).forEach((x) => {
      const pct = x.jolly ? (x.pctPiano != null ? x.pctPiano : P.jollyPct) : x.pct || 1;
      let giorni = 0;
      let gV = 0;
      let gCgf = 0;
      let gMal = 0;
      let gImp = 0;
      let gCnp = 0;
      let pianoNoto = false;
      for (let g = 1; g <= nG; g++) {
        const d = iso(anno, m, g);
        if (!inServizio(x, d)) continue;
        if (x.dal && d < x.dal) continue; // persona ipotetica: dal mese scelto
        if (x.al && d > x.al) continue;
        const cod = String(righePer[x.nome + '|' + d] || '').toUpperCase();
        if (cnp.has(cod)) {
          gCnp++;
          continue;
        }
        giorni++;
        if (cod) pianoNoto = true;
        if (vac.has(cod)) gV++;
        else if (cgf.has(cod)) gCgf++;
        else if (mal.has(cod)) gMal++;
        else if (imp.has(cod)) gImp++;
      }
      // congedi registrati ma non ancora scritti nel piano
      const cnpReg = Math.max(0, ((x.cnp || {})[m] || 0) - gCnp);
      giorni = Math.max(0, giorni - cnpReg);
      if (!giorni) return;
      const contratto = giorni * orePieno * pct;
      // VACANZE: quelle nel piano; se il mese non e ancora pianificato, la quota
      // media del diritto annuo (gli ausiliari: quello che risulta dal piano)
      let oreV = gV * orePieno * pct;
      if (!passato && !gV && !x.jolly && x.vacanzeAnno) oreV = (x.vacanzeAnno / 365) * giorni * orePieno * pct;
      // CGF: nel piano; altrimenti la quota media dei festivi dell anno (solo fissi)
      let oreCgf = gCgf * orePieno * pct;
      if (!passato && !gCgf && !x.jolly && o.festiviAnno) oreCgf = (o.festiviAnno / 365) * giorni * orePieno * pct;
      const disponibili = Math.max(0, contratto - oreV - oreCgf);
      // MALATTIE e IMPEGNI: veri nei mesi passati, attesi dal tasso storico negli altri
      // (piu quelli gia scritti nel piano, es. una malattia lunga in corso)
      const oreMalNota = gMal * orePieno * pct;
      const oreMal = passato ? oreMalNota : Math.max(oreMalNota, disponibili * tM.malattia);
      const oreImp = passato ? gImp * orePieno * pct : Math.max(gImp * orePieno * pct, disponibili * tM.impegni);
      const netto = Math.max(0, disponibili - oreMal - oreImp);
      res.contratto += contratto;
      res.vacanze += oreV;
      res.cgf += oreCgf;
      res.malattia += oreMal;
      res.malattiaNota += oreMalNota;
      res.impegni += oreImp;
      res.netto += netto;
      res.teste++;
      res.fte += (pct * giorni) / nG;
      res.persone.push({
        nome: x.nome,
        pct: pct,
        jolly: !!x.jolly,
        contratto: contratto,
        netto: netto,
        pianoNoto: pianoNoto,
        ipotetica: !!x.ipotetica,
        gruppo: x.gruppo,
        oraCosto: x.oraCosto || null,
        fattoreCosto: x.fattoreCosto || 1,
      });
    });
    return res;
  }

  // ANALISI COMPLETA di un anno
  // dati: { anno, fabbisogni, turni, durataGiorno, persone, righe, festiviAnno,
  //         consuntivo: { m: { scopertiOre, oreExtra } } }
  function analizza(dati, par, scenario) {
    const P = Object.assign({}, PARAMETRI_PREDEFINITI, par || {});
    const anno = dati.anno;
    // scenario: persone in piu e percentuali cambiate
    let persone = (dati.persone || []).map((x) => Object.assign({}, x));
    const sc = scenario || {};
    if (sc.percentuali)
      persone.forEach((x) => {
        if (sc.percentuali[x.nome] != null) x.pct = sc.percentuali[x.nome];
      });
    // ipotesi del simulatore: quante persone uguali (quanti), dal / al come date,
    // costo orario proprio (oraCosto, facoltativo: senza vale il costo medio)
    (sc.aggiunte || []).forEach((a, i) => {
      const n = Math.max(1, Math.min(50, parseInt(a.quanti) || 1));
      for (let k = 0; k < n; k++)
        persone.push({
          nome: (a.nome || 'Ipotesi ' + (i + 1)) + (n > 1 ? ' / ' + (k + 1) : ''),
          pct: a.jolly ? 1 : a.pct,
          pctPiano: a.jolly ? a.pct : undefined,
          jolly: !!a.jolly,
          dal: a.dal || iso(anno, 1, 1),
          al: a.al || iso(anno, 12, 31),
          vacanzeAnno: a.jolly ? 0 : a.vacanzeAnno != null ? a.vacanzeAnno : 35,
          ipotetica: true,
          gruppo: i,
          oraCosto: parseFloat(a.oraCosto) > 0 ? parseFloat(a.oraCosto) : null,
          fattoreCosto: parseFloat(a.fattoreCosto) > 0 ? parseFloat(a.fattoreCosto) : 1,
        });
    });
    const righePer = {};
    (dati.righe || []).forEach((r) => (righePer[r.collaboratore + '|' + String(r.data).substring(0, 10)] = r.codice));
    const tassi = tassiStorici(dati.righe, dati.persone || [], P);
    const fattoreDom = (52 - P.domenicheLibere) / 52; // quota di domeniche che una persona puo lavorare
    // scenario: ore di vacanza spostate da un mese all altro (+ = meno vacanze nel mese)
    const vacSposta = {};
    (sc.vacanzeSposta || []).forEach((v) => {
      vacSposta[v.da] = (vacSposta[v.da] || 0) + v.ore;
      vacSposta[v.a] = (vacSposta[v.a] || 0) - v.ore;
    });
    const mesi = [];
    for (let m = 1; m <= 12; m++) {
      const c = caricoMese(anno, m, dati.fabbisogni, dati.turni, dati.durataGiorno);
      // scenario: disponibilita diversa degli ausiliari in quel mese
      const Pm =
        sc.jollyPctMesi && sc.jollyPctMesi[m] != null ? Object.assign({}, P, { jollyPct: sc.jollyPctMesi[m] }) : P;
      const off = offertaMese(anno, m, persone, righePer, tassi, Pm, { festiviAnno: dati.festiviAnno });
      if (vacSposta[m]) {
        const tM = tassi.mesi[m] || tassi.media;
        // si possono togliere al massimo le vacanze che ci sono; aggiungerne sempre
        const ore = vacSposta[m] > 0 ? Math.min(vacSposta[m], off.vacanze) : vacSposta[m];
        off.vacanze -= ore;
        off.netto += ore * (1 - (tM.malattia || 0) - (tM.impegni || 0));
      }
      const orePieno = (c.giorni / 7) * P.oreSett; // ore di un tempo pieno nel mese
      const quotaNetta = off.contratto ? off.netto / off.contratto : 0; // 1 - shrinkage
      const fteNetto = orePieno * (quotaNetta || 0.85); // ore nette di un tempo pieno
      const differenzaOre = off.netto - c.ore;
      // persone presenti in media in un giorno (assenze comprese)
      const assenteGiorno = 1 - (quotaNetta || 0.85);
      const testeMinPunta = c.postiMax ? Math.ceil(c.postiMax / (1 - assenteGiorno)) : 0;
      const testeMinDom = c.postiDomMax ? Math.ceil(c.postiDomMax / (fattoreDom * (1 - assenteGiorno))) : 0;
      // affidabilita: malattie improvvise per giorno, probabilita giornaliera del mese
      const pMal = (tassi.mesi[m] || {}).malattia || tassi.media.malattia;
      let riservaMax = 0;
      let malattieAttese = 0;
      let giorniConMalattia = 0;
      for (let g = 1; g <= c.giorni; g++) {
        const n = c.posti[g];
        if (!n) continue;
        riservaMax = Math.max(riservaMax, riservaPerLivello(n, pMal, P.livelloServizio));
        malattieAttese += n * pMal;
        giorniConMalattia += 1 - Math.pow(1 - pMal, n);
      }
      const cons = (dati.consuntivo || {})[m] || null;
      mesi.push({
        mese: m,
        passato: off.passato,
        carico: c,
        offerta: off,
        orePieno: orePieno,
        quotaNetta: quotaNetta,
        oreRichieste: c.ore,
        oreNette: off.netto,
        differenzaOre: differenzaOre,
        differenzaFte: fteNetto ? differenzaOre / fteNetto : 0,
        fteNecessari: fteNetto ? c.ore / fteNetto : 0,
        fteDisponibili: fteNetto ? off.netto / fteNetto : 0,
        teste: off.teste,
        testeMinPunta: testeMinPunta,
        testeMinDomenica: testeMinDom,
        tassoMalattia: pMal,
        riservaMalattia: riservaMax,
        malattieAttese: malattieAttese,
        giorniConMalattia: giorniConMalattia,
        consuntivo: cons,
      });
    }
    return { anno: anno, parametri: P, tassi: tassi, mesi: mesi, persone: persone };
  }

  // stato del mese in parole, senza giudizi: equilibrio, margine, scoperto
  function statoMese(x, soglia) {
    const s = soglia == null ? 0.25 : soglia;
    if (!x.oreRichieste) return 'nessun fabbisogno';
    const teste = x.teste >= Math.max(x.testeMinPunta, x.testeMinDomenica);
    if (x.differenzaFte < -s || !teste) return 'sotto';
    if (x.differenzaFte > 1) return 'margine';
    return 'in equilibrio';
  }

  // persona abilitata a un gruppo: settori del piano o competenze, oppure ha gia
  // fatto turni di quel gruppo (stesso criterio della bozza quando i settori non bastano)
  function abilitato(p, g, storia) {
    return !p.gruppi || p.gruppi.includes(g) || !!((storia || {})[p.nome] || {})[g];
  }
  // GRUPPI (reparti interni dei turni: sala, cassa, accoglienza...) nei mesi
  // rimasti: ore e persone che servono contro le persone abilitate. Dice di quale
  // TIPO di persona c e bisogno, non solo quante.
  function gruppi(dati, analisi) {
    const A = analisi;
    const futuri = A.mesi.filter((x) => !x.passato && x.oreRichieste);
    const tot = {};
    const postiMax = {};
    futuri.forEach((x) => {
      Object.keys(x.carico.perGruppo).forEach((g) => (tot[g] = (tot[g] || 0) + x.carico.perGruppo[g]));
      Object.keys(x.carico.perGruppoPosti).forEach(
        (g) => (postiMax[g] = Math.max(postiMax[g] || 0, Math.max.apply(null, x.carico.perGruppoPosti[g]))),
      );
    });
    const oreNetteFte = futuri.reduce((t, x) => t + x.orePieno * (x.quotaNetta || 0.85), 0) || 1;
    const quota = futuri.length ? futuri.reduce((t, x) => t + (x.quotaNetta || 0.85), 0) / futuri.length : 0.85;
    // ore nette di ognuno nei mesi rimasti
    const netto = {};
    futuri.forEach((x) => x.offerta.persone.forEach((p) => (netto[p.nome] = (netto[p.nome] || 0) + p.netto)));
    const persone = (dati.persone || []).filter((p) => netto[p.nome] > 0);
    const storia = dati.storiaGruppi || {};
    const oreMedia = persone.length ? persone.reduce((t, p) => t + netto[p.nome], 0) / persone.length : 0;
    return Object.keys(tot)
      .sort((a, b) => tot[b] - tot[a])
      .map((g) => {
        const abil = persone.filter((p) => abilitato(p, g, storia));
        const oreAbil = abil.reduce((t, p) => t + netto[p.nome], 0);
        const minime = Math.ceil((postiMax[g] || 0) / quota);
        const mancaPersone = Math.max(0, minime - abil.length);
        // ore del gruppo oltre tutte le ore degli abilitati (che lavorano anche altrove)
        const mancaOre = Math.max(0, tot[g] - oreAbil);
        const perOre = oreMedia ? Math.ceil(mancaOre / oreMedia) : 0;
        // da formare: chi c e gia e non e abilitato, prima chi ha piu ore nette
        const candidati = persone
          .filter((p) => !abilitato(p, g, storia))
          .sort((a, b) => netto[b.nome] - netto[a.nome])
          .map((p) => p.nome);
        return {
          gruppo: g,
          ore: tot[g],
          fte: tot[g] / oreNetteFte,
          postiMax: postiMax[g] || 0,
          minime: minime,
          abilitati: abil.length,
          nomiAbilitati: abil.map((p) => p.nome),
          oreAbilitati: oreAbil,
          mancaPersone: mancaPersone,
          mancaOre: mancaOre,
          servono: Math.max(mancaPersone, perOre),
          candidati: candidati,
        };
      });
  }
  // COSTO di uno scenario (facoltativo, con i costi inseriti dall amministratore):
  // ore di contratto in piu nei mesi rimasti per il costo orario di un fisso
  // (costo annuo di un tempo pieno / ore dell anno) o di un ausiliario.
  // Spostare vacanze non costa: le ore di contratto restano le stesse.
  // Un ipotesi del simulatore con il suo costo orario (oraCosto) costa le sue ore di
  // contratto per quel prezzo; dettaglio = costo e ore per ogni ipotesi (gruppo).
  function costoScenario(A, B, costi, par) {
    if (!B) return null;
    const c = costi || {};
    const proprie = B.mesi.some((x) => x.offerta.persone.some((p) => p.ipotetica && p.oraCosto > 0));
    if (!proprie && !(c.fissoAnno > 0 || c.ausiliarioOra > 0)) return null;
    const P = Object.assign({}, PARAMETRI_PREDEFINITI, par || {});
    const oraFisso = (c.fissoAnno || 0) / (P.oreSett * 52);
    const oraAus = c.ausiliarioOra || 0;
    const media = (p) => !(p.ipotetica && p.oraCosto > 0);
    const somma = (o, j) => o.persone.filter((p) => p.jolly === j && media(p)).reduce((t, p) => t + p.contratto, 0);
    let chf = 0;
    let ore = 0;
    const dettaglio = {};
    B.mesi.forEach((x, i) => {
      const a = A.mesi[i];
      if (a.passato) return;
      const dF = somma(x.offerta, false) - somma(a.offerta, false);
      const dJ = somma(x.offerta, true) - somma(a.offerta, true);
      chf += dF * oraFisso + dJ * oraAus;
      ore += dF + dJ;
      x.offerta.persone.forEach((p) => {
        if (!p.ipotetica) return;
        // maggiorazioni dell ipotesi (notturno 10%, indennita degli ausiliari) solo sul
        // suo costo orario proprio; il costo medio le comprende gia
        const prezzo = p.oraCosto > 0 ? p.oraCosto * (p.fattoreCosto || 1) : p.jolly ? oraAus : oraFisso;
        if (p.oraCosto > 0) {
          chf += p.contratto * prezzo;
          ore += p.contratto;
        }
        const d = (dettaglio[p.gruppo] = dettaglio[p.gruppo] || { chf: 0, ore: 0 });
        d.chf += p.contratto * prezzo;
        d.ore += p.contratto;
      });
    });
    Object.keys(dettaglio).forEach((k) => {
      dettaglio[k].chf = Math.round(dettaglio[k].chf);
      dettaglio[k].ore = Math.round(dettaglio[k].ore);
    });
    return { chf: Math.round(chf), ore: Math.round(ore), dettaglio: dettaglio };
  }

  // SUGGERIMENTI: la soluzione piu leggera che copre i mesi sotto, con l effetto
  // calcolato rifacendo l analisi con la proposta dentro.
  function suggerimenti(dati, par, analisi) {
    const P = Object.assign({}, PARAMETRI_PREDEFINITI, par || {});
    const A = analisi || analizza(dati, P);
    const anno = A.anno;
    const futuri = A.mesi.filter((x) => !x.passato && x.oreRichieste);
    const out = [];
    if (!futuri.length) return out;
    const deficit = futuri.map((x) => Math.max(0, -x.differenzaFte));
    const strutturale = Math.min.apply(null, deficit); // presente in tutti i mesi rimasti
    const soglia = 0.25;
    const arrPct = (f) => Math.min(1, Math.max(0.4, Math.ceil(f * 10) / 10));
    const effetto = (scenario) => {
      const B = analizza(dati, P, scenario);
      const prima = A.mesi.filter((x) => !x.passato && statoMese(x) === 'sotto').length;
      const dopo = B.mesi.filter((x) => !x.passato && statoMese(x) === 'sotto').length;
      const oreCoperte = B.mesi.reduce((s, x, i) => {
        const a = A.mesi[i];
        if (a.passato) return s;
        return s + Math.max(0, Math.min(-a.differenzaOre, x.oreNette - a.oreNette));
      }, 0);
      const costo = costoScenario(A, B, P.costi, P);
      if (costo) costo.perOra = oreCoperte > 0 ? Math.round((costo.chf / oreCoperte) * 10) / 10 : null;
      return {
        mesiSottoPrima: prima,
        mesiSottoDopo: dopo,
        oreCoperte: Math.round(oreCoperte),
        analisi: B,
        costo: costo,
      };
    };
    const primoFuturo = futuri[0].mese;
    const meseOggi = P.oggi && +P.oggi.substring(0, 4) === anno ? +P.oggi.substring(5, 7) : 0;
    // mesi su cui si puo ancora intervenire (non quello in corso)
    const spostabili = futuri.filter((x) => x.mese > meseOggi);
    const sottoOre = spostabili.filter((x) => x.differenzaOre < 0 && -x.differenzaFte > soglia);
    // A) SPOSTARE VACANZE: un mese sotto con piu vacanze della media, e altri mesi
    //    con margine: nessun costo, solo pianificazione
    if (sottoOre.length) {
      const mediaVac = spostabili.reduce((s, x) => s + x.offerta.vacanze, 0) / spostabili.length;
      const margini = spostabili
        .filter((x) => x.differenzaOre > 0)
        .map((x) => ({ mese: x.mese, ore: x.differenzaOre * 0.8 }));
      const sposta = [];
      sottoOre.forEach((x) => {
        let resta = Math.min(-x.differenzaOre, Math.max(0, x.offerta.vacanze - mediaVac));
        margini
          .slice()
          .sort((a, b) => Math.abs(a.mese - x.mese) - Math.abs(b.mese - x.mese))
          .forEach((t) => {
            if (resta <= 0 || t.ore <= 0) return;
            const ore = Math.min(resta, t.ore);
            sposta.push({ da: x.mese, a: t.mese, ore: ore });
            t.ore -= ore;
            resta -= ore;
          });
      });
      const totOre = sposta.reduce((s, v) => s + v.ore, 0);
      if (totOre > P.oreSett) {
        const settimane = Math.round(totOre / P.oreSett);
        const da = [...new Set(sposta.map((v) => v.da))];
        const a = [...new Set(sposta.map((v) => v.a))];
        out.push({
          tipo: 'vacanze',
          titolo: 'Spostare circa ' + settimane + (settimane === 1 ? ' settimana' : ' settimane') + ' di vacanza',
          motivo:
            'Da ' +
            elencoMesi(da) +
            ' (più vacanze della media e ore che non bastano) verso ' +
            elencoMesi(a) +
            ' (ore in più del fabbisogno). Spostando una parte delle vacanze, d accordo con i collaboratori, il carico si distribuisce senza costi.',
          scenario: { vacanzeSposta: sposta },
          effetto: effetto({ vacanzeSposta: sposta }),
        });
      }
    }
    // B) PIU DISPONIBILITA DEGLI AUSILIARI ATTUALI nei mesi sotto
    const jolly = (dati.persone || []).filter((x) => x.jolly).length;
    if (sottoOre.length && jolly) {
      const perMese = {};
      let massimo = 0;
      sottoOre.forEach((x) => {
        const pct = Math.min(1, Math.ceil((P.jollyPct + -x.differenzaFte / jolly) * 20) / 20);
        perMese[x.mese] = pct;
        massimo = Math.max(massimo, pct);
      });
      if (massimo > P.jollyPct)
        out.push({
          tipo: 'disponibilita',
          titolo:
            'Chiedere più disponibilità ai ' +
            jolly +
            ' ausiliari attuali (fino al ' +
            Math.round(massimo * 100) +
            '%)',
          motivo:
            neiMesi(Object.keys(perMese)).charAt(0).toUpperCase() +
            neiMesi(Object.keys(perMese)).slice(1) +
            ' gli ausiliari pianificati al ' +
            Math.round(P.jollyPct * 100) +
            '% non bastano. Se sono disponibili per qualche turno in più, la carenza si copre con chi conosce già il lavoro, senza nuove assunzioni.',
          scenario: { jollyPctMesi: perMese },
          effetto: effetto({ jollyPctMesi: perMese }),
        });
    }
    // C) COMBINAZIONE: prima le vacanze spostate, poi solo la carenza che resta
    //    (ausiliari attuali piu disponibili, altrimenti un ausiliario stagionale piu piccolo)
    const vacG = out.find((g) => g.tipo === 'vacanze');
    if (vacG && vacG.effetto.mesiSottoDopo > 0) {
      const dopo = vacG.effetto.analisi.mesi.filter(
        (x) => !x.passato && x.mese > meseOggi && x.oreRichieste && x.differenzaOre < 0,
      );
      if (dopo.length) {
        const sc = { vacanzeSposta: vacG.scenario.vacanzeSposta };
        let come;
        if (jolly) {
          sc.jollyPctMesi = {};
          dopo.forEach(
            (x) =>
              (sc.jollyPctMesi[x.mese] = Math.min(1, Math.ceil((P.jollyPct + -x.differenzaFte / jolly) * 20) / 20)),
          );
          come = 'più disponibilità degli ausiliari attuali ' + neiMesi(dopo.map((x) => x.mese));
        } else {
          const mediaR = dopo.reduce((s, x) => s + -x.differenzaFte, 0) / dopo.length;
          const ultimo = dopo[dopo.length - 1].mese;
          sc.aggiunte = [
            {
              jolly: true,
              pct: arrPct(mediaR),
              dal: iso(anno, dopo[0].mese, 1),
              al: iso(anno, ultimo, giorniNelMese(anno, ultimo)),
              nome: 'Ausiliario',
            },
          ];
          come = 'un ausiliario al ' + Math.round(arrPct(mediaR) * 100) + '% ' + neiMesi(dopo.map((x) => x.mese));
        }
        out.push({
          tipo: 'combinata',
          titolo: 'Vacanze spostate e ' + come,
          motivo: 'Spostare le vacanze copre già una parte della carenza senza costi; per il resto basta ' + come + '.',
          scenario: sc,
          effetto: effetto(sc),
        });
      }
    }
    // 1) carenza STRUTTURALE (tutti i mesi rimasti): un fisso o percentuali piu alte
    if (strutturale > soglia) {
      const n = Math.floor(strutturale);
      const resto = strutturale - n;
      const agg = [];
      for (let i = 0; i < n; i++)
        agg.push({ jolly: false, pct: 1, dal: iso(anno, primoFuturo, 1), nome: 'Fisso ' + (i + 1) });
      if (resto > 0.15)
        agg.push({ jolly: false, pct: arrPct(resto), dal: iso(anno, primoFuturo, 1), nome: 'Fisso ' + (n + 1) });
      out.push({
        tipo: 'strutturale',
        titolo:
          agg.length === 1
            ? 'Un collaboratore fisso al ' + Math.round(agg[0].pct * 100) + '%'
            : agg.length + ' collaboratori fissi (' + agg.map((a) => Math.round(a.pct * 100) + '%').join(' + ') + ')',
        motivo:
          'In tutti i mesi rimasti mancano almeno ' +
          arr1(strutturale) +
          ' tempi pieni netti: e una carenza stabile, non stagionale.',
        alternativa:
          'In alternativa, la stessa quantità di ore aumentando la percentuale di chi oggi lavora a tempo parziale e lo desidera.',
        scenario: { aggiunte: agg },
        effetto: effetto({ aggiunte: agg }),
      });
    }
    // 2) carenza STAGIONALE (solo alcuni mesi): un ausiliario per quei mesi
    const mesiPicco = futuri.filter((x) => -x.differenzaFte - (strutturale > soglia ? strutturale : 0) > soglia);
    if (mesiPicco.length && mesiPicco.length < futuri.length + (strutturale > soglia ? 1 : 0)) {
      const media =
        mesiPicco.reduce((s, x) => s + (-x.differenzaFte - (strutturale > soglia ? strutturale : 0)), 0) /
        mesiPicco.length;
      const nJ = Math.max(1, Math.ceil(media - 0.05));
      const pct = arrPct(media / nJ);
      const dal = iso(anno, mesiPicco[0].mese, 1);
      const ultimo = mesiPicco[mesiPicco.length - 1].mese;
      const al = iso(anno, ultimo, giorniNelMese(anno, ultimo));
      const agg = [];
      for (let i = 0; i < nJ; i++) agg.push({ jolly: true, pct: pct, dal: dal, al: al, nome: 'Ausiliario ' + (i + 1) });
      const nomiMesi = mesiPicco.map((x) => x.mese);
      out.push({
        tipo: 'stagionale',
        titolo:
          (nJ === 1 ? 'Un ausiliario (jolly)' : nJ + ' ausiliari (jolly)') +
          ' al ' +
          Math.round(pct * 100) +
          '% nei mesi di punta',
        motivo:
          'Più richiesta che ore nette ' +
          neiMesi(nomiMesi) +
          '. In media ' +
          arr1(media) +
          ' tempi pieni in più, solo in quel periodo: un ausiliario segue la stagione senza ore dovute negli altri mesi.',
        scenario: { aggiunte: agg },
        mesi: nomiMesi,
        effetto: effetto({ aggiunte: agg }),
      });
    }
    // 3) PERSONE per domeniche e giorno di punta (anche se le ore bastano)
    const corti = futuri.filter((x) => x.teste < Math.max(x.testeMinPunta, x.testeMinDomenica));
    if (corti.length) {
      const manca = Math.max.apply(
        null,
        corti.map((x) => Math.max(x.testeMinPunta, x.testeMinDomenica) - x.teste),
      );
      const agg = [];
      for (let i = 0; i < manca; i++)
        agg.push({ jolly: true, pct: 0.4, dal: iso(anno, corti[0].mese, 1), nome: 'Weekend ' + (i + 1) });
      out.push({
        tipo: 'persone',
        titolo:
          manca === 1
            ? 'Una persona in più per le domeniche e i giorni di punta'
            : manca + ' persone in più per le domeniche e i giorni di punta',
        motivo:
          'Con ' +
          corti[0].teste +
          ' persone e ' +
          P.domenicheLibere +
          ' domeniche libere a testa, nei giorni di punta non si arriva al numero di presenti richiesto, anche se le ore del mese bastano. Basta un ausiliario a percentuale bassa disponibile nel fine settimana.',
        scenario: { aggiunte: agg },
        effetto: effetto({ aggiunte: agg }),
      });
    }
    // 4) MALATTIE IMPROVVISE: riserva a chiamata
    const riserva = Math.max.apply(
      null,
      futuri.map((x) => x.riservaMalattia),
    );
    const jollyOggi = (dati.persone || []).filter((x) => x.jolly).length;
    if (riserva > 0)
      out.push({
        tipo: 'riserva',
        titolo:
          'Riserva per le malattie: ' +
          riserva +
          (riserva === 1 ? ' persona' : ' persone') +
          ' a chiamata nei giorni pieni',
        motivo:
          'Con il tasso di malattia osservato (' +
          arr1(A.tassi.media.malattia * 100) +
          '% dei giorni), nel ' +
          Math.round(P.livelloServizio * 100) +
          '% dei giorni le assenze improvvise sono al massimo ' +
          riserva +
          '. Oggi gli ausiliari sono ' +
          jollyOggi +
          (jollyOggi >= riserva
            ? ': la riserva c e, conviene tenerli disponibili a chiamata.'
            : ': la riserva va completata.'),
        informativo: jollyOggi >= riserva,
      });
    // 6) GRUPPI: che TIPO di persona serve. Prima si guarda chi c e gia e si
    //    potrebbe formare (costa meno di assumere); se non basta, il profilo da cercare.
    const G = gruppi(dati, A);
    const scoperti = G.filter((g) => g.servono > 0);
    scoperti.forEach((g) => {
      const nome = g.gruppo;
      const daFormare = g.candidati.slice(0, g.servono);
      const perche =
        (g.mancaPersone
          ? 'Nel giorno di punta servono ' +
            g.minime +
            ' persone abilitate a ' +
            nome +
            ', oggi sono ' +
            g.abilitati +
            '. '
          : '') +
        (g.mancaOre
          ? 'Le ore di ' +
            nome +
            ' nei mesi rimasti (' +
            Math.round(g.ore) +
            ') superano tutte le ore nette degli abilitati (' +
            Math.round(g.oreAbilitati) +
            '), che lavorano anche in altri gruppi. '
          : '');
      if (daFormare.length >= g.servono)
        out.push({
          tipo: 'gruppo',
          gruppo: nome,
          titolo:
            nome +
            ': formare ' +
            (g.servono === 1 ? 'un collaboratore' : g.servono + ' collaboratori') +
            ' già in organico',
          motivo:
            perche +
            'Si possono abilitare persone che ci sono già (prima chi ha più ore libere): ' +
            daFormare.join(', ') +
            '. Formare chi conosce già il casino costa meno di una nuova assunzione.',
          effettoTesto: 'persone abilitate a ' + nome + ' da ' + g.abilitati + ' a ' + (g.abilitati + g.servono),
          formare: daFormare,
          informativo: false,
        });
      else
        out.push({
          tipo: 'gruppo',
          gruppo: nome,
          titolo: nome + ': serve ' + (g.servono === 1 ? 'una persona' : g.servono + ' persone') + ' abilitate in più',
          motivo:
            perche +
            (daFormare.length
              ? 'Formando chi c e già (' + daFormare.join(', ') + ') non si arriva al numero: '
              : 'Non ci sono altri collaboratori da formare: ') +
            'nelle nuove ricerche conviene cercare persone abilitate a ' +
            nome +
            '.',
          effettoTesto: 'persone abilitate a ' + nome + ' da ' + g.abilitati + ' a ' + (g.abilitati + g.servono),
          formare: daFormare,
          informativo: false,
        });
    });
    // profilo per le proposte di assunzione: i gruppi scoperti senza abbastanza
    // persone da formare, poi gli altri scoperti, altrimenti il gruppo con piu ore
    const profilo = scoperti
      .slice()
      .sort((a, b) => (a.candidati.length >= a.servono) - (b.candidati.length >= b.servono))
      .map((g) => g.gruppo);
    const testoProfilo = profilo.length
      ? 'Profilo da cercare: abilitato a ' + elencoMesiTesto(profilo.slice(0, 3)) + '.'
      : G.length
        ? 'Profilo: il gruppo con più ore e ' + G[0].gruppo + '.'
        : '';
    out.forEach((g) => {
      if (testoProfilo && g.scenario && (g.scenario.aggiunte || []).length) {
        g.profilo = profilo.length ? profilo.slice(0, 3) : G.length ? [G[0].gruppo] : [];
        g.motivo += ' ' + testoProfilo;
      }
    });
    // 5) MARGINE: mesi con capacita in piu (recuperi, formazione, vacanze)
    const margine = futuri.filter((x) => statoMese(x) === 'margine');
    if (margine.length)
      out.push({
        tipo: 'margine',
        titolo: 'Capacità in più in ' + margine.length + (margine.length === 1 ? ' mese' : ' mesi'),
        motivo:
          neiMesi(margine.map((x) => x.mese))
            .charAt(0)
            .toUpperCase() +
          neiMesi(margine.map((x) => x.mese)).slice(1) +
          ' le ore nette superano il fabbisogno di oltre un tempo pieno: spazio per recuperare saldi ore, formazione e vacanze fuori stagione.',
        informativo: true,
      });
    // la proposta piu leggera che risolve di piu: prima per mesi risolti, poi per costo
    const costo = { vacanze: 0, disponibilita: 1, combinata: 2, stagionale: 3, persone: 4, strutturale: 5 };
    const azioni = out.filter((g) => g.effetto && !g.informativo);
    if (azioni.length) {
      const migliore = azioni
        .slice()
        .sort(
          (a, b) =>
            a.effetto.mesiSottoDopo - b.effetto.mesiSottoDopo ||
            (a.effetto.costo && b.effetto.costo ? a.effetto.costo.chf - b.effetto.costo.chf : 0) ||
            (costo[a.tipo] || 9) - (costo[b.tipo] || 9),
        )[0];
      migliore.consigliato = true;
    }
    return out;
  }

  // VERIFICA SUI MESI PASSATI: il bilancio delle ore del modello contro quello
  // che e successo davvero (posti scoperti e ore fatte oltre il contratto)
  function verifica(analisi) {
    const righe = analisi.mesi
      .filter((x) => x.passato && x.consuntivo && x.oreRichieste)
      .map((x) => ({
        mese: x.mese,
        mancanzaModello: Math.max(0, -x.differenzaOre),
        pressioneReale: (x.consuntivo.scopertiOre || 0) + (x.consuntivo.oreExtra || 0),
        scopertiOre: x.consuntivo.scopertiOre || 0,
        oreExtra: x.consuntivo.oreExtra || 0,
        oreSotto: x.consuntivo.oreSotto || 0,
        // perche ci sono stati buchi: mancavano ore (organico) o le ore c erano
        // ma non sono finite sui posti scoperti (distribuzione, abilitazioni)
        diagnosi:
          x.differenzaOre < 0
            ? 'organico'
            : (x.consuntivo.scopertiOre || 0) > 0 &&
                (x.consuntivo.oreSotto || 0) >= (x.consuntivo.scopertiOre || 0) * 0.5
              ? 'distribuzione'
              : (x.consuntivo.scopertiOre || 0) > 0
                ? 'misto'
                : 'in ordine',
      }));
    let r = null;
    if (righe.length >= 3) {
      const a = righe.map((x) => x.mancanzaModello);
      const b = righe.map((x) => x.pressioneReale);
      const ma = a.reduce((s, x) => s + x, 0) / a.length;
      const mb = b.reduce((s, x) => s + x, 0) / b.length;
      let num = 0;
      let da = 0;
      let db = 0;
      for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
      }
      r = da && db ? num / Math.sqrt(da * db) : null;
    }
    return { righe: righe, correlazione: r };
  }

  return {
    PARAMETRI_PREDEFINITI: PARAMETRI_PREDEFINITI,
    binomCdf: binomCdf,
    riservaPerLivello: riservaPerLivello,
    tassiStorici: tassiStorici,
    caricoMese: caricoMese,
    offertaMese: offertaMese,
    analizza: analizza,
    statoMese: statoMese,
    suggerimenti: suggerimenti,
    verifica: verifica,
    elencoMesi: elencoMesi,
    gruppi: gruppi,
    costoScenario: costoScenario,
  };
});
