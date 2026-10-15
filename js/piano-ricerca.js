/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-ricerca.js
 *
 * RICERCA SUL PIANO: parte da un piano (per esempio la bozza appena generata) e
 * lo migliora provando cambi di turno, tenendo solo quello che fa scendere il
 * punteggio. Piu tempo ha, piu combinazioni prova (ricerca locale con
 * "raffreddamento": all inizio accetta anche qualche passo peggiore per uscire
 * dai vicoli ciechi, poi solo miglioramenti; alla fine resta il piano migliore
 * trovato).
 *
 * Funzioni PURE, come piano-regole.js e organico-modello.js: le REGOLE non sono
 * scritte qui. Arrivano dal programma come funzioni (costoPersona, costoGiorno)
 * che usano lo stesso controllo di "Valida regole": una regola si scrive una
 * volta sola e vale per i controlli, per la bozza e per la ricerca.
 * Si verifica con Node (node test/piano-ricerca.test.js).
 *
 * Problema:
 *   giorni        ['YYYY-MM-DD', ...]          giorni su cui si puo agire
 *   persone       ['Nome', ...]
 *   stato         { nome: { 'YYYY-MM-DD': codice } }  piano di partenza
 *   modificabile  (nome, dstr) -> bool        celle che la ricerca puo cambiare
 *   ammessi       (nome, dstr) -> [codici]    codici possibili in quella cella
 *                                             (turni idonei e il codice di riposo)
 *   riposo        codice di riposo ('C')
 *   fabbisogno    { dstr: { codice: quantita } }
 *   costoPersona  (nome, mappa) -> numero    regole della persona (mappa = { dstr: codice })
 *   costoGiorno   (dstr, perNome) -> numero  (facoltativo) regole fra persone nel giorno
 *   costoMese     (stato) -> numero          (facoltativo) regole sul mese intero
 *                 Le tre funzioni possono anche ritornare { costo, conti }: conti = { chiave:
 *                 numero } (es. { legge_dom: 1, regola: 2 }), le violazioni contate per tipo
 *                 con lo stesso metro del controllo finale. Vedi l opzione vincoli.
 *   toccaMese     (nome) -> bool             (facoltativo) la persona conta per le regole del mese
 *   fissi         { nome: { dstr: codice } } (facoltativo) celle obbligate (formazioni)
 *   riservati     { dstr: { codice: true } } (facoltativo) POSTI RISERVATI: turni che possono
 *                 fare solo persone che li hanno fra i turni PRINCIPALI (es. Z dei Supervisor
 *                 delle Slots, 21/81/911 dei SUP dei Tavoli). Vedi maxRiservati.
 *   tipoNotte     (codice) -> 1 notte, 0 turno di giorno, null non e un turno (facoltativo,
 *                 per l equita delle notti)
 *   gruppoEquita  (nome) -> chiave del gruppo di persone comparabili o null (facoltativo)
 *   primaDellaRifinitura () -> niente (facoltativo): chiamata prima della rifinitura con gli
 *                 scambi di giorni, per cambiare i pesi delle regole (costi ricalcolati dopo)
 * Opzioni:
 *   pesoScoperto  punti per ogni posto del fabbisogno senza nessuno (default 300)
 *   pesoEccesso   punti per ogni persona IN PIU del fabbisogno su un turno (default
 *                 1.000.000 = vietato): prima la ricerca aggiungeva turni gia coperti per
 *                 dare ore a chi era sotto il minimo del mese (40 doppioni in un minuto su
 *                 novembre Slots). Le ore mancanti con un fabbisogno pieno sono un tema di
 *                 organico, non si risolvono con doppioni.
 *   pesoCambio    punti per ogni cella diversa dal piano di partenza (default 0;
 *                 per le proposte su un piano gia sistemato: meno cambi possibile)
 *   pesoRaro      quanto puo valere al massimo un posto che possono coprire in pochi
 *                 (default 5): un posto scoperto vale (persone che possono fare un
 *                 turno medio del mese) / (persone che possono fare quel turno), fra 1 e
 *                 pesoRaro. Senza, Migliora lasciava scoperto un 21 dei SUP dei Tavoli
 *                 (5 persone) per coprire un 8 che possono fare in 40. Per i posti
 *                 riservati il tetto e il doppio (le Z prima dell L1).
 *   maxScoperti   il risultato non puo lasciare piu posti scoperti di cosi
 *                 (default: quelli di partenza): la ricerca puo passarci in mezzo,
 *                 ma il piano migliore si sceglie solo fra quelli che lo rispettano
 *   pesoRiservato punti in piu per ogni posto riservato scoperto (default 0)
 *   maxRiservati  il risultato non puo lasciare piu posti riservati scoperti di cosi
 *                 (default: quelli di partenza). Vincolo duro come maxScoperti: dalla v444 i
 *                 posti rari pesavano al massimo 5 volte un posto normale, una regola di legge
 *                 60.000: Migliora lasciava un giorno dei Tavoli con un solo SUP.
 *   maxEccesso    il risultato non puo avere piu persone oltre il fabbisogno di cosi
 *                 (default: quelle di partenza)
 *   vincoli       [[chiave, ...], ...] gruppi di chiavi dei conti: per ogni gruppo la somma
 *                 nel risultato non puo superare quella di partenza (default: ogni chiave da
 *                 sola). Es. le regole di legge per tipo e, insieme, tutte le regole vere.
 *   pesoSforo     punti per ogni unita oltre un vincolo (scoperti, riservati, eccesso,
 *                 conti), che crescono con l avanzare della ricerca (0 all inizio, il valore
 *                 pieno alla fine, in quadrato): all inizio la ricerca puo attraversare stati
 *                 non ammessi, alla fine ci torna dentro e migliora fra quelli ammessi
 *                 (default 0 = solo il filtro sul migliore). Senza, una ricerca entrata in
 *                 uno stato non ammesso con meno punti non ne usciva piu: il migliore
 *                 ammesso restava quello di prima.
 *   sforoCurva    come cresce il peso dello sforo: 'quadrato' (default), 'lineare', 'subito'
 *                 (pieno dall inizio: la ricerca resta sempre fra gli stati ammessi)
 *   tornaAlMigliore frazione della ricerca (0-1) dopo la quale uno stato fuori dai vincoli si
 *                 abbandona e si riparte dal migliore ammesso (default: mai)
 *   IL MIGLIORE: la ricerca puo passare da stati che violano i vincoli (maxScoperti,
 *   maxRiservati, maxEccesso, vincoli), ma il piano restituito e sempre il migliore fra
 *   quelli che li rispettano TUTTI (dalla v450; prima solo scoperti e riservati: Migliora
 *   restituiva un piano con una domenica libera in meno e il controllo finale lo scartava
 *   tutto, anche se durante la ricerca era passata da piani buoni e legali).
 *   pesoNotti     punti per l equita delle notti (default 0 = spenta): somma, per gruppo
 *                 di persone comparabili, dei quadrati degli scarti della quota di notti
 *                 dalla media del gruppo (punti percentuali al quadrato / 100; vedi scartoNotti)
 *   minTurniNotti chi ha meno turni pesa in proporzione nell equita (default 8)
 *   scambioGiorniDa frazione della ricerca (0-1) da cui si usa lo scambio di giorni (default 0)
 *   scambioGiorni false = senza la mossa "scambio di giorni" fra due persone (default con:
 *                 sposta un giorno isolato accanto a un blocco, posti e ore invariati)
 *   rifinituraScambi quante prove nella rifinitura finale (scambi di giorni e di turno; default 60000,
 *                 0 = niente): dal migliore, tutti gli scambi di giorni vicini, solo i miglioramenti
 *   seme          numero per rendere la ricerca ripetibile (stesso seme e stesse iterazioni
 *                 = stesso risultato; vedi semeRicerca)
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.PianoRicerca = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // generatore di numeri casuali con seme (mulberry32): stessa sequenza a parita di seme
  function casuale(seme) {
    let a = seme >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ===== EQUITA DELLE NOTTI (Migliora) =====
  // Scarto della quota di turni di notte fra persone comparabili (stessa funzione): somma dei
  // quadrati degli scarti dalla media del gruppo, in punti percentuali al quadrato / 100.
  // conti: { nome: { notti, turni } }; gruppoDi(nome) -> chiave del gruppo o null (fuori).
  // Chi non ha turni non conta; chi ne ha meno di minTurni (default 8) pesa in proporzione
  // (una persona con 2 turni, uno di notte, non e al 50% come chi ne ha 20 su 40).
  // Ritorna { totale, gruppi: { chiave: costo } }.
  function scartoNotti(conti, gruppoDi, minTurni) {
    const minT = minTurni > 0 ? minTurni : 8;
    const gruppi = {};
    Object.keys(conti || {}).forEach((n) => {
      const k = gruppoDi ? gruppoDi(n) : '*';
      const c = conti[n];
      if (k == null || !c || !(c.turni > 0)) return;
      (gruppi[k] = gruppi[k] || []).push({ q: (100 * c.notti) / c.turni, w: Math.min(1, c.turni / minT) });
    });
    const out = { totale: 0, gruppi: {} };
    Object.keys(gruppi).forEach((k) => {
      const v = costoGruppoNotti(gruppi[k]);
      out.gruppi[k] = v;
      out.totale += v;
    });
    return out;
  }
  // costo di un gruppo: [{ q: quota in %, w: peso }] -> somma pesata degli scarti al quadrato / 100
  function costoGruppoNotti(voci) {
    let sw = 0;
    let sq = 0;
    voci.forEach((x) => {
      sw += x.w;
      sq += x.w * x.q;
    });
    if (!sw) return 0;
    const m = sq / sw;
    return voci.reduce((a, x) => a + x.w * (x.q - m) * (x.q - m), 0) / 100;
  }

  // SEME DELLA RICERCA: stesso mese e settore = stesso seme (risultato ripetibile); la variante
  // (0, 1, 2...) da un altro seme per "riprova". Hash FNV-1a a 32 bit, mai 0.
  function semeRicerca(ym, settore, variante) {
    const testo = String(ym || '') + '|' + String(settore || '') + '|' + String(variante || 0);
    let h = 0x811c9dc5;
    for (let i = 0; i < testo.length; i++) {
      h ^= testo.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h || 1;
  }

  // somma i conti c nell oggetto tot
  function aggiungiA(tot, c) {
    if (c) Object.keys(c).forEach((k) => (tot[k] = (tot[k] || 0) + (c[k] || 0)));
  }

  function crea(problema, opzioni) {
    const P = problema;
    const o = Object.assign(
      {
        pesoScoperto: 300,
        pesoEccesso: 1000000,
        pesoCambio: 0,
        pesoRaro: 5,
        pesoRiservato: 0,
        pesoNotti: 0,
        pesoSforo: 0,
        minTurniNotti: 8,
        seme: 1,
      },
      opzioni || {},
    );
    const rnd = casuale(o.seme);
    const scegli = (arr) => arr[Math.floor(rnd() * arr.length)];
    const giorni = P.giorni.slice();
    const persone = P.persone.slice();
    // codice di riposo del problema: '' (cella vuota) o 'C'. Prima '' diventava 'C': gli
    // scambi lavoro/riposo non erano mai possibili e comparivano cambi finti '' -> 'C'
    const riposo = P.riposo != null ? P.riposo : 'C';
    const fissi = P.fissi || {};
    // stato corrente (copia) e piano di partenza
    const stato = {};
    const partenza = {};
    persone.forEach((n) => {
      stato[n] = Object.assign({}, P.stato[n] || {});
      partenza[n] = Object.assign({}, P.stato[n] || {});
      Object.keys(fissi[n] || {}).forEach((d) => (stato[n][d] = fissi[n][d]));
    });
    const puo = (n, d) => !(fissi[n] && fissi[n][d] != null) && P.modificabile(n, d);
    // celle su cui si puo agire, per giorno
    const mobili = {};
    giorni.forEach((d) => (mobili[d] = persone.filter((n) => puo(n, d))));
    const ammessiCache = {};
    const ammessi = (n, d) => {
      const k = n + '|' + d;
      if (!ammessiCache[k]) ammessiCache[k] = P.ammessi(n, d) || [];
      return ammessiCache[k];
    };
    // COPERTURA: quante persone su ogni codice del fabbisogno, per giorno
    const fab = P.fabbisogno || {};
    const assegnati = {};
    giorni.forEach((d) => {
      assegnati[d] = {};
      persone.forEach((n) => {
        const c = stato[n][d];
        if (c) assegnati[d][c] = (assegnati[d][c] || 0) + 1;
      });
    });
    const scopertiGiorno = (d) => {
      let s = 0;
      const f = fab[d] || {};
      Object.keys(f).forEach((c) => (s += Math.max(0, (f[c] || 0) - (assegnati[d][c] || 0))));
      return s;
    };
    // POSTI RARI: quante persone possono coprire ogni turno del fabbisogno quel giorno
    // (fra chi ha la cella libera da cambiare o ce l ha gia); il posto scoperto pesa di piu
    // quando i possibili sono pochi rispetto a un turno medio del mese
    const riserv = P.riservati || {};
    const pesoPosto = {};
    (() => {
      const conteggi = [];
      giorni.forEach((d) => {
        pesoPosto[d] = {};
        Object.keys(fab[d] || {}).forEach((c) => {
          if (!(fab[d][c] > 0)) return;
          const k = persone.filter((n) => stato[n][d] === c || (puo(n, d) && ammessi(n, d).includes(c))).length;
          pesoPosto[d][c] = k;
          conteggi.push(k);
        });
      });
      conteggi.sort((a, b) => a - b);
      const medio = conteggi.length ? conteggi[Math.floor(conteggi.length / 2)] : 1;
      giorni.forEach((d) =>
        Object.keys(pesoPosto[d]).forEach((c) => {
          const k = pesoPosto[d][c];
          // fra i posti RISERVATI la rarita conta fino al doppio (le Z che fanno in 5 Supervisor
          // prima dell L1 che fanno in 8, decisione del titolare: i SUP fanno prima le Z);
          // tutti e due erano al tetto di 5 e valevano uguale
          const tetto = (riserv[d] || {})[c] ? 2 * o.pesoRaro : o.pesoRaro;
          pesoPosto[d][c] = Math.min(tetto, Math.max(1, k ? medio / k : tetto));
        }),
      );
    })();
    const scopertiPesoGiorno = (d) => {
      let s = 0;
      const f = fab[d] || {};
      Object.keys(f).forEach(
        (c) => (s += Math.max(0, (f[c] || 0) - (assegnati[d][c] || 0)) * ((pesoPosto[d] || {})[c] || 1)),
      );
      return s;
    };
    // POSTI RISERVATI scoperti nel giorno (turni PRINCIPALI di poche funzioni, es. le Z)
    const riservatiGiorno = (d) => {
      const r = riserv[d];
      if (!r) return 0;
      const f = fab[d] || {};
      let s = 0;
      Object.keys(r).forEach((c) => (s += Math.max(0, (f[c] || 0) - (assegnati[d][c] || 0))));
      return s;
    };
    // EQUITA DELLE NOTTI: turni e notti di ogni persona (tutto il mese, anche le celle che non
    // si cambiano) e costo di ogni gruppo di persone comparabili
    const conNotti = o.pesoNotti > 0 && typeof P.tipoNotte === 'function';
    const _tipoNotteMemo = {};
    const tipoNotte = (c) => {
      if (!c) return null;
      if (!(c in _tipoNotteMemo)) _tipoNotteMemo[c] = P.tipoNotte(c);
      return _tipoNotteMemo[c];
    };
    const contaNotti = (mappa) => {
      let notti = 0;
      let turni = 0;
      Object.keys(mappa || {}).forEach((d) => {
        const v = tipoNotte(mappa[d]);
        if (v == null) return;
        turni++;
        if (v) notti++;
      });
      return { notti: notti, turni: turni };
    };
    const gruppoN = {}; // nome -> gruppo (o null)
    const membri = {}; // gruppo -> [nomi]
    if (conNotti)
      persone.forEach((n) => {
        const k = P.gruppoEquita ? P.gruppoEquita(n) : '*';
        gruppoN[n] = k == null ? null : k;
        if (k != null) (membri[k] = membri[k] || []).push(n);
      });
    const contiN = {};
    const costoGruppoDa = (k, conti) =>
      costoGruppoNotti(
        membri[k]
          .filter((n) => conti[n].turni > 0)
          .map((n) => ({
            q: (100 * conti[n].notti) / conti[n].turni,
            w: Math.min(1, conti[n].turni / o.minTurniNotti),
          })),
      );
    const costoNG = {};
    const costoNottiDi = (st) => {
      if (!conNotti) return 0;
      const conti = {};
      persone.forEach((n) => (conti[n] = contaNotti(st[n])));
      return Object.keys(membri).reduce((t, k) => t + costoGruppoDa(k, conti), 0);
    };
    // persone in piu del fabbisogno sui turni del fabbisogno di quel giorno
    const eccessoGiorno = (d) => {
      let e = 0;
      const f = fab[d] || {};
      Object.keys(f).forEach((c) => (e += Math.max(0, (assegnati[d][c] || 0) - (f[c] || 0))));
      return e;
    };
    const cambiPersona = (n) => {
      if (!o.pesoCambio) return 0;
      let k = 0;
      giorni.forEach((d) => {
        if ((stato[n][d] || '') !== (partenza[n][d] || '')) k++;
      });
      return k;
    };
    const perNomeGiorno = (d) => {
      const x = {};
      persone.forEach((n) => (x[n] = stato[n][d] || ''));
      return x;
    };
    // costo e conti per tipo di una funzione delle regole (numero oppure { costo, conti })
    const leggi = (x) =>
      x && typeof x === 'object' ? { costo: +x.costo || 0, conti: x.conti || null } : { costo: +x || 0, conti: null };
    const valP = (n) => leggi(P.costoPersona(n, stato[n]));
    const valG = (d) => (P.costoGiorno ? leggi(P.costoGiorno(d, perNomeGiorno(d))) : { costo: 0, conti: null });
    const valM = (st) => (P.costoMese ? leggi(P.costoMese(st)) : { costo: 0, conti: null });
    // CONTI PER TIPO (violazioni contate come le conta il controllo finale): per persona, per
    // giorno, per il mese, e la somma di tutto il piano
    const contiP = {};
    const contiG = {};
    let contiM = null;
    const contiTot = {};
    const aggiungiConti = (c, segno) => {
      if (c) Object.keys(c).forEach((k) => (contiTot[k] = (contiTot[k] || 0) + segno * (c[k] || 0)));
    };
    const costoP = {};
    const costoG = {};
    const scopG = {};
    const scopW = {}; // scoperti pesati (posti rari valgono di piu): solo per il punteggio
    const eccG = {};
    const risG = {}; // posti riservati scoperti per giorno
    // regole sul mese intero (facoltative): ricalcolate a ogni mossa
    let costoM = 0;
    // costi e conti da capo (partenza e ricarica del migliore)
    function calcolaDaCapo() {
      Object.keys(contiTot).forEach((k) => delete contiTot[k]);
      const m = valM(stato);
      costoM = m.costo;
      contiM = m.conti;
      aggiungiConti(contiM, 1);
      persone.forEach((n) => {
        const v = valP(n);
        costoP[n] = v.costo + o.pesoCambio * cambiPersona(n);
        contiP[n] = v.conti;
        aggiungiConti(v.conti, 1);
      });
      giorni.forEach((d) => {
        const v = valG(d);
        costoG[d] = v.costo;
        contiG[d] = v.conti;
        aggiungiConti(v.conti, 1);
        scopG[d] = scopertiGiorno(d);
        scopW[d] = scopertiPesoGiorno(d);
        eccG[d] = eccessoGiorno(d);
        risG[d] = riservatiGiorno(d);
      });
    }
    calcolaDaCapo();
    const somma = (obj) => Object.keys(obj).reduce((t, k) => t + obj[k], 0);
    const ricalcolaNotti = () => {
      if (!conNotti) return;
      persone.forEach((n) => (contiN[n] = contaNotti(stato[n])));
      Object.keys(membri).forEach((k) => (costoNG[k] = costoGruppoDa(k, contiN)));
    };
    ricalcolaNotti();
    const totaleDaCapo = () =>
      somma(costoP) +
      somma(costoG) +
      costoM +
      o.pesoScoperto * somma(scopW) +
      o.pesoEccesso * somma(eccG) +
      o.pesoRiservato * somma(risG) +
      o.pesoNotti * somma(costoNG);
    const copiaConti = () => {
      const c = {};
      Object.keys(contiTot).forEach((k) => (c[k] = contiTot[k]));
      return c;
    };
    const misura = () => ({
      punteggio: totale,
      scoperti: somma(scopG),
      eccesso: somma(eccG),
      riservati: somma(risG),
      notti: Math.round(somma(costoNG) * 100) / 100,
      regole: somma(costoP) + somma(costoG) + costoM,
      conti: copiaConti(),
      sforo: sforoOra,
    });
    // VINCOLI DEL RISULTATO: posti scoperti, riservati, persone in piu e conti per tipo non
    // oltre i limiti (di default quelli di partenza). sforo = di quanto si e fuori in tutto
    // (0 = stato ammesso)
    const contiIniziali = copiaConti();
    const maxScop = o.maxScoperti != null ? o.maxScoperti : somma(scopG);
    const maxRis = o.maxRiservati != null ? o.maxRiservati : somma(risG);
    const maxEcc = o.maxEccesso != null ? o.maxEccesso : somma(eccG);
    const gruppiVincoli = Array.isArray(o.vincoli) ? o.vincoli.map((g) => [].concat(g)) : null;
    const sommaGruppo = (c, g) => g.reduce((t, k) => t + (c[k] || 0), 0);
    const limitiVincoli = gruppiVincoli ? gruppiVincoli.map((g) => sommaGruppo(contiIniziali, g)) : null;
    const sforoConti = (c) => {
      let s = 0;
      if (gruppiVincoli) gruppiVincoli.forEach((g, i) => (s += Math.max(0, sommaGruppo(c, g) - limitiVincoli[i])));
      else Object.keys(c).forEach((k) => (s += Math.max(0, (c[k] || 0) - (contiIniziali[k] || 0))));
      return s;
    };
    const sforoDi = (scop, ris, ecc, conti) =>
      Math.max(0, scop - maxScop) + Math.max(0, ris - maxRis) + Math.max(0, ecc - maxEcc) + sforoConti(conti);
    let sforoOra = sforoDi(somma(scopG), somma(risG), somma(eccG), contiTot);
    // peso dello sforo in questo momento della ricerca (cresce fino a pesoSforo alla fine)
    let pesoSforoOra = 0;
    let totale = totaleDaCapo() + pesoSforoOra * sforoOra;
    const iniziale = misura();
    // il piano di partenza e il migliore finche non se ne trova uno ammesso con meno punti
    // (se la partenza non e ammessa, es. maxScoperti piu basso, vince il primo ammesso)
    let migliore = { punteggio: totale, stato: JSON.parse(JSON.stringify(stato)), ammesso: sforoOra === 0 };
    const aggiornaMigliore = () => {
      if (sforoOra > 0) return;
      if (migliore.ammesso && !(totale < migliore.punteggio - 1e-9)) return;
      migliore = { punteggio: totale, stato: JSON.parse(JSON.stringify(stato)), ammesso: true };
    };
    let iterazioni = 0;
    let accettate = 0;

    // prova una mossa (lista di {n, d, c}); la tiene se conviene
    function prova(mossa, temperatura) {
      const vecchi = mossa.map((m) => stato[m.n][m.d] || '');
      if (mossa.every((m, i) => (m.c || '') === vecchi[i])) return false;
      const nomi = [...new Set(mossa.map((m) => m.n))];
      const gg = [...new Set(mossa.map((m) => m.d))];
      const primaP = nomi.map((n) => costoP[n]);
      const primaG = gg.map((d) => costoG[d]);
      const primaS = gg.map((d) => scopW[d]);
      const primaE = gg.map((d) => eccG[d]);
      const primaR = gg.map((d) => risG[d]);
      // applica
      mossa.forEach((m, i) => {
        const v = vecchi[i];
        if (v) assegnati[m.d][v]--;
        if (m.c) assegnati[m.d][m.c] = (assegnati[m.d][m.c] || 0) + 1;
        stato[m.n][m.d] = m.c;
      });
      const valDopoP = nomi.map((n) => valP(n));
      const valDopoG = gg.map((d) => valG(d));
      const dopoP = nomi.map((n, i) => valDopoP[i].costo + o.pesoCambio * cambiPersona(n));
      const dopoG = valDopoG.map((v) => v.costo);
      const dopoS = gg.map((d) => scopertiPesoGiorno(d));
      const dopoSN = gg.map((d) => scopertiGiorno(d));
      const dopoE = gg.map((d) => eccessoGiorno(d));
      const dopoR = gg.map((d) => riservatiGiorno(d));
      // equita delle notti: solo i gruppi delle persone toccate
      let primaCN = null;
      let gruppiN = null;
      let dopoNG = null;
      if (conNotti) {
        primaCN = nomi.map((n) => contiN[n]);
        nomi.forEach((n) => (contiN[n] = contaNotti(stato[n])));
        gruppiN = [...new Set(nomi.map((n) => gruppoN[n]).filter((k) => k != null))];
        dopoNG = gruppiN.map((k) => costoGruppoDa(k, contiN));
      }
      // regole del mese: solo se la mossa tocca chi conta (es. le funzioni con un limite nel mese)
      const valDopoM =
        P.costoMese && (!P.toccaMese || nomi.some((n) => P.toccaMese(n)))
          ? valM(stato)
          : { costo: costoM, conti: contiM };
      const dopoM = valDopoM.costo;
      // conti per tipo dopo la mossa (provvisori: si tolgono se la mossa non si tiene)
      nomi.forEach((n, i) => {
        aggiungiConti(contiP[n], -1);
        aggiungiConti(valDopoP[i].conti, 1);
      });
      gg.forEach((d, i) => {
        aggiungiConti(contiG[d], -1);
        aggiungiConti(valDopoG[i].conti, 1);
      });
      aggiungiConti(contiM, -1);
      aggiungiConti(valDopoM.conti, 1);
      let scopT = 0;
      let risT = 0;
      let eccT = 0;
      giorni.forEach((d) => {
        scopT += scopG[d];
        risT += risG[d];
        eccT += eccG[d];
      });
      gg.forEach((d, i) => {
        scopT += dopoSN[i] - scopG[d];
        risT += dopoR[i] - risG[d];
        eccT += dopoE[i] - eccG[d];
      });
      const sforoDopo = sforoDi(scopT, risT, eccT, contiTot);
      let delta = dopoM - costoM + pesoSforoOra * (sforoDopo - sforoOra);
      nomi.forEach((n, i) => (delta += dopoP[i] - primaP[i]));
      gg.forEach(
        (d, i) =>
          (delta +=
            dopoG[i] -
            primaG[i] +
            o.pesoScoperto * (dopoS[i] - primaS[i]) +
            o.pesoEccesso * (dopoE[i] - primaE[i]) +
            o.pesoRiservato * (dopoR[i] - primaR[i])),
      );
      if (conNotti) gruppiN.forEach((k, i) => (delta += o.pesoNotti * (dopoNG[i] - costoNG[k])));
      const tieni = delta <= 0 || (temperatura > 0 && rnd() < Math.exp(-delta / temperatura));
      if (!tieni) {
        mossa.forEach((m, i) => {
          if (m.c) assegnati[m.d][m.c]--;
          if (vecchi[i]) assegnati[m.d][vecchi[i]] = (assegnati[m.d][vecchi[i]] || 0) + 1;
          stato[m.n][m.d] = vecchi[i];
        });
        if (conNotti) nomi.forEach((n, i) => (contiN[n] = primaCN[i]));
        aggiungiConti(valDopoM.conti, -1);
        aggiungiConti(contiM, 1);
        gg.forEach((d, i) => {
          aggiungiConti(valDopoG[i].conti, -1);
          aggiungiConti(contiG[d], 1);
        });
        nomi.forEach((n, i) => {
          aggiungiConti(valDopoP[i].conti, -1);
          aggiungiConti(contiP[n], 1);
        });
        return false;
      }
      nomi.forEach((n, i) => {
        costoP[n] = dopoP[i];
        contiP[n] = valDopoP[i].conti;
      });
      costoM = dopoM;
      contiM = valDopoM.conti;
      sforoOra = sforoDopo;
      gg.forEach((d, i) => {
        costoG[d] = dopoG[i];
        contiG[d] = valDopoG[i].conti;
        scopW[d] = dopoS[i];
        scopG[d] = dopoSN[i];
        eccG[d] = dopoE[i];
        risG[d] = dopoR[i];
      });
      if (conNotti) gruppiN.forEach((k, i) => (costoNG[k] = dopoNG[i]));
      totale += delta;
      accettate++;
      // il migliore si sceglie solo fra i piani AMMESSI: nessun vincolo oltre il limite
      // (posti scoperti, riservati, persone in piu, regole per tipo come il controllo finale)
      aggiornaMigliore();
      return true;
    }

    // MOSSE
    // 1) scambio: due persone si scambiano il turno dello stesso giorno
    function mossaScambio() {
      const d = scegli(giorni);
      const m = mobili[d];
      if (m.length < 2) return null;
      const a = scegli(m);
      const b = scegli(m);
      if (a === b) return null;
      const ca = stato[a][d] || '';
      const cb = stato[b][d] || '';
      if (ca === cb) return null;
      if (!ammessi(a, d).includes(cb || riposo) || !ammessi(b, d).includes(ca || riposo)) return null;
      return [
        { n: a, d: d, c: cb || riposo },
        { n: b, d: d, c: ca || riposo },
      ];
    }
    // 2) copri un posto scoperto con chi quel giorno riposa
    function mossaCopri() {
      const scop = giorni.filter((d) => scopG[d] > 0);
      if (!scop.length) return null;
      const d = scegli(scop);
      const f = fab[d] || {};
      const mancano = Object.keys(f).filter((c) => (f[c] || 0) > (assegnati[d][c] || 0));
      const c = scegli(mancano);
      const liberi = mobili[d].filter((n) => (stato[n][d] || riposo) === riposo && ammessi(n, d).includes(c));
      if (!liberi.length) return null;
      return [{ n: scegli(liberi), d: d, c: c }];
    }
    // 3) cambia il turno di una persona in un altro ammesso (o in riposo)
    function mossaCambia() {
      const d = scegli(giorni);
      const m = mobili[d];
      if (!m.length) return null;
      const n = scegli(m);
      const amm = ammessi(n, d);
      if (!amm.length) return null;
      const c = scegli(amm);
      return [{ n: n, d: d, c: c }];
    }
    // 4) sposta un giorno di lavoro: la persona lavora un altro giorno e riposa in
    //    questo (le ore restano le stesse); chi riposava la sostituisce
    function mossaSposta() {
      const n = scegli(persone);
      const lav = giorni.filter((d) => puo(n, d) && stato[n][d] && stato[n][d] !== riposo);
      const rip = giorni.filter((d) => puo(n, d) && (stato[n][d] || riposo) === riposo);
      if (!lav.length || !rip.length) return null;
      const d1 = scegli(lav);
      const d2 = scegli(rip);
      const c1 = stato[n][d1];
      // nel giorno nuovo: un turno ammesso, meglio se scoperto
      const f = fab[d2] || {};
      const amm2 = ammessi(n, d2).filter((c) => c !== riposo);
      if (!amm2.length) return null;
      const scop2 = amm2.filter((c) => (f[c] || 0) > (assegnati[d2][c] || 0));
      const c2 = scop2.length ? scegli(scop2) : amm2.includes(c1) ? c1 : scegli(amm2);
      const mossa = [
        { n: n, d: d1, c: riposo },
        { n: n, d: d2, c: c2 },
      ];
      // chi riposa nel giorno lasciato prende il turno, se puo
      const sost = mobili[d1].filter(
        (x) => x !== n && (stato[x][d1] || riposo) === riposo && ammessi(x, d1).includes(c1),
      );
      if (sost.length && rnd() < 0.7) mossa.push({ n: scegli(sost), d: d1, c: c1 });
      return mossa;
    }
    // 6) mirata: si lavora su chi ha un problema (punteggio della persona sopra zero):
    //    un suo giorno cambia (anche in riposo) e, se lascia scoperto un posto, lo prende
    //    chi quel giorno e libero. Le mosse a caso su 40 persone e 30 giorni trovano
    //    raramente proprio la cella giusta.
    function mossaMirata() {
      const problemi = persone.filter((n) => costoP[n] > 1e-6);
      if (!problemi.length) return null;
      const n = scegli(problemi);
      const gg = giorni.filter((d) => puo(n, d));
      if (!gg.length) return null;
      const d = scegli(gg);
      const amm = ammessi(n, d);
      if (!amm.length) return null;
      const vecchio = stato[n][d] || '';
      const c = scegli(amm);
      if ((c || '') === vecchio) return null;
      const mossa = [{ n: n, d: d, c: c }];
      const f = fab[d] || {};
      if (vecchio && (f[vecchio] || 0) > 0) {
        const sost = mobili[d].filter(
          (x) => x !== n && (stato[x][d] || riposo) === riposo && ammessi(x, d).includes(vecchio),
        );
        if (sost.length) mossa.push({ n: scegli(sost), d: d, c: vecchio });
      }
      return mossa;
    }
    // 7) SCAMBIO DI GIORNI fra due persone (v453, blocchi compatti): n lavora d1 e riposa d2, x
    //    il contrario; si scambiano i giorni (n prende il turno di x in d2, x quello di n in d1).
    //    Le ore restano quasi uguali e i posti coperti identici: e la mossa con cui un
    //    pianificatore sposta un giorno isolato accanto a un blocco. Prima non c era: per
    //    spostare un giorno con i posti gia coperti servivano due mosse, la prima peggiore.
    //    Meta delle volte d1 e un giorno di lavoro isolato di n e d2 un riposo accanto a un suo
    //    blocco (il caso dei "buchi"), l altra meta due giorni a caso.
    const indiceGiorno = {};
    giorni.forEach((d, i) => (indiceGiorno[d] = i));
    const accanto = (d, k) => {
      const x = new Date(d + 'T12:00:00');
      x.setDate(x.getDate() + k);
      return x.toISOString().substring(0, 10);
    };
    const lavora = (n, d) => {
      const c = stato[n][d];
      return !!c && c !== riposo && c[0] !== '#';
    };
    function mossaScambioGiorni() {
      const n = scegli(persone);
      const lav = giorni.filter((d) => puo(n, d) && lavora(n, d));
      const rip = giorni.filter((d) => puo(n, d) && (stato[n][d] || riposo) === riposo);
      if (!lav.length || !rip.length) return null;
      let d1;
      let d2;
      if (rnd() < 0.5) {
        const isolati = lav.filter((d) => !lavora(n, accanto(d, -1)) || !lavora(n, accanto(d, 1)));
        const vicini = rip.filter((d) => lavora(n, accanto(d, -1)) || lavora(n, accanto(d, 1)));
        if (!isolati.length || !vicini.length) return null;
        d1 = scegli(isolati);
        d2 = scegli(vicini);
      } else {
        d1 = scegli(lav);
        d2 = scegli(rip);
      }
      if (indiceGiorno[d1] == null || indiceGiorno[d2] == null) return null;
      const c1 = stato[n][d1];
      const x = persone.filter(
        (y) =>
          y !== n &&
          puo(y, d1) &&
          puo(y, d2) &&
          (stato[y][d1] || riposo) === riposo &&
          lavora(y, d2) &&
          ammessi(y, d1).includes(c1) &&
          ammessi(n, d2).includes(stato[y][d2]),
      );
      if (!x.length) return null;
      const y = scegli(x);
      const c2 = stato[y][d2];
      return [
        { n: n, d: d1, c: riposo },
        { n: n, d: d2, c: c2 },
        { n: y, d: d2, c: riposo },
        { n: y, d: d1, c: c1 },
      ];
    }
    // 5) ripristina: una cella cambiata torna com era (con il peso dei cambi: meno cambi)
    function mossaRipristina() {
      const cand = [];
      giorni.forEach((d) =>
        mobili[d].forEach((n) => {
          if ((stato[n][d] || '') !== (partenza[n][d] || '')) cand.push([n, d]);
        }),
      );
      if (!cand.length) return null;
      const [n, d] = scegli(cand);
      return [{ n: n, d: d, c: partenza[n][d] || '' }];
    }
    const MOSSE = [
      mossaScambio,
      mossaScambio,
      mossaCopri,
      mossaCambia,
      mossaSposta,
      mossaSposta,
      mossaMirata,
      mossaMirata,
    ].concat(o.pesoCambio ? [mossaRipristina, mossaRipristina] : []);
    // con lo scambio di giorni (dalla frazione o.scambioGiorniDa della ricerca, default da subito):
    // prima solo le mosse di sempre (misura dicembre 2026 Tavoli: lo scambio di giorni da subito
    // lasciava 3 posti scoperti in piu), poi anche lo scambio, per compattare i blocchi
    const MOSSE_CON_SCAMBIO =
      o.scambioGiorni === false ? MOSSE : MOSSE.concat([mossaScambioGiorni, mossaScambioGiorni]);
    // ricarica lo stato migliore trovato (per la rifinitura finale)
    function ricaricaMigliore() {
      persone.forEach((n) => (stato[n] = Object.assign({}, migliore.stato[n])));
      giorni.forEach((d) => {
        assegnati[d] = {};
        persone.forEach((n) => {
          const c = stato[n][d];
          if (c) assegnati[d][c] = (assegnati[d][c] || 0) + 1;
        });
      });
      calcolaDaCapo();
      ricalcolaNotti();
      sforoOra = sforoDi(somma(scopG), somma(risG), somma(eccG), contiTot);
      totale = totaleDaCapo() + pesoSforoOra * sforoOra;
    }
    // RIFINITURA: ogni cella cambiata prova a tornare com era (da sola, poi insieme a
    // un altra cella cambiata dello stesso giorno, come negli scambi): resta solo se
    // niente peggiora. Toglie i cambi non necessari.
    function rifinisci() {
      ricaricaMigliore();
      let giro = true;
      for (let volte = 0; giro && volte < 4; volte++) {
        giro = false;
        const cambiate = [];
        giorni.forEach((d) =>
          mobili[d].forEach((n) => {
            if ((stato[n][d] || '') !== (partenza[n][d] || '')) cambiate.push([n, d]);
          }),
        );
        for (const [n, d] of cambiate) {
          if ((stato[n][d] || '') === (partenza[n][d] || '')) continue;
          if (prova([{ n: n, d: d, c: partenza[n][d] || '' }], 0)) {
            giro = true;
            continue;
          }
          const stessoGiorno = cambiate.filter(
            ([n2, d2]) => d2 === d && n2 !== n && (stato[n2][d2] || '') !== (partenza[n2][d2] || ''),
          );
          for (const [n2] of stessoGiorno)
            if (
              prova(
                [
                  { n: n, d: d, c: partenza[n][d] || '' },
                  { n: n2, d: d, c: partenza[n2][d] || '' },
                ],
                0,
              )
            ) {
              giro = true;
              break;
            }
        }
      }
    }

    // lavora per ms millisecondi (o per un numero di iterazioni nei test)
    // temperatura: alta all inizio (frazione 0), zero alla fine (frazione 1)
    function passo(ms, frazione, maxIter) {
      const fine = Date.now() + (ms || 0);
      // temperatura dell ordine di una regola all inizio (attraversa i passaggi
      // peggiori per uscire dai vicoli ciechi), poi scende a zero
      const f0 = 1 - Math.min(1, Math.max(0, frazione || 0));
      const t0 = (o.temperatura != null ? o.temperatura : 600) * f0 * f0;
      // peso dello sforo dei vincoli in questo momento (vedi sforoCurva)
      const fr = 1 - f0;
      const ps = (o.pesoSforo || 0) * (o.sforoCurva === 'subito' ? 1 : o.sforoCurva === 'lineare' ? fr : fr * fr);
      if (ps !== pesoSforoOra) {
        totale += (ps - pesoSforoOra) * sforoOra;
        pesoSforoOra = ps;
      }
      // TORNA AL MIGLIORE: dopo questa frazione della ricerca, uno stato fuori dai vincoli si
      // lascia e si riparte dal migliore ammesso (una legge in piu spesso non si ripara con
      // le mosse semplici: servono piu celle insieme)
      if (o.tornaAlMigliore != null && fr >= o.tornaAlMigliore && sforoOra > 0 && migliore.ammesso) ricaricaMigliore();
      let k = 0;
      while ((maxIter ? k < maxIter : Date.now() < fine) && totale > 0) {
        const mossa = scegli(fr >= (o.scambioGiorniDa || 0) ? MOSSE_CON_SCAMBIO : MOSSE)();
        k++;
        iterazioni++;
        if (mossa) prova(mossa, t0);
      }
      return misura();
    }
    // il risultato: il piano migliore trovato e le celle cambiate
    // RIFINITURA CON GLI SCAMBI DI GIORNI (v453): dal migliore trovato, si provano in ordine
    // tutti gli scambi di giorni vicini (al massimo 5 giorni di distanza) fra due persone e gli scambi di turno nello stesso giorno, a
    // temperatura zero: resta solo quello che fa scendere il punteggio, e il migliore cambia
    // solo con un piano ammesso (stessi vincoli). La ricerca a caso trova raramente proprio lo
    // scambio che chiude un buco nei blocchi; qui si guardano tutti. o.rifinituraScambi: quante
    // prove al massimo (default 30000; 0 = niente rifinitura).
    function rifinisciScambi() {
      const maxProve = o.rifinituraScambi != null ? o.rifinituraScambi : 60000;
      if (!(maxProve > 0)) return;
      // il problema puo cambiare i pesi per la rifinitura (P.primaDellaRifinitura): i costi si
      // ricalcolano da capo e il migliore riparte dal suo punteggio con i pesi nuovi
      if (typeof P.primaDellaRifinitura === 'function') P.primaDellaRifinitura();
      ricaricaMigliore();
      if (migliore.ammesso) migliore.punteggio = totale;
      let prove = 0;
      // una mossa resta solo se il punteggio scende davvero; a pari si torna indietro
      const provaStretta = (mossa) => {
        prove++;
        const primaT = totale;
        const vecchi = mossa.map((m) => ({ n: m.n, d: m.d, c: stato[m.n][m.d] || '' }));
        if (!prova(mossa, 0)) return false;
        if (totale < primaT - 1e-9) return true;
        prova(vecchi, 0);
        return false;
      };
      for (let giro = 0; giro < 3 && prove < maxProve; giro++) {
        let migliorati = 0;
        for (const n of persone) {
          for (const d1 of giorni) {
            if (prove >= maxProve) break;
            if (!puo(n, d1) || !lavora(n, d1)) continue;
            // SCAMBIO DI GIORNI con chi riposa d1 e lavora d2 (fino a 5 giorni di distanza)
            for (let k = -5; k <= 5 && lavora(n, d1); k++) {
              if (!k) continue;
              const c1 = stato[n][d1];
              const d2 = accanto(d1, k);
              if (indiceGiorno[d2] == null || !puo(n, d2) || (stato[n][d2] || riposo) !== riposo) continue;
              for (const y of mobili[d2]) {
                if (y === n || !puo(y, d1) || (stato[y][d1] || riposo) !== riposo || !lavora(y, d2)) continue;
                const c2 = stato[y][d2];
                if (!ammessi(y, d1).includes(c1) || !ammessi(n, d2).includes(c2)) continue;
                if (
                  provaStretta([
                    { n: n, d: d1, c: riposo },
                    { n: n, d: d2, c: c2 },
                    { n: y, d: d2, c: riposo },
                    { n: y, d: d1, c: c1 },
                  ])
                ) {
                  migliorati++;
                  break;
                }
              }
            }
            // SCAMBIO DI DUE GIORNI DI FILA (d1, d1+1 con d2, d2+1): sposta un pezzo di blocco
            // intero, con la sua sequenza di turni (dopo una notte non si rientra il mattino: i
            // giorni presi uno alla volta spesso non passano il riposo di 11 ore)
            const d1b = accanto(d1, 1);
            if (lavora(n, d1) && indiceGiorno[d1b] != null && puo(n, d1b) && lavora(n, d1b)) {
              for (let k = -6; k <= 6; k++) {
                if (Math.abs(k) < 2) continue;
                const d2 = accanto(d1, k);
                const d2b = accanto(d1, k + 1);
                if (indiceGiorno[d2] == null || indiceGiorno[d2b] == null) continue;
                if (!puo(n, d2) || !puo(n, d2b) || lavora(n, d2) || lavora(n, d2b)) continue;
                if ((stato[n][d2] || riposo) !== riposo || (stato[n][d2b] || riposo) !== riposo) continue;
                const a1 = stato[n][d1];
                const a2 = stato[n][d1b];
                const y = mobili[d2].find(
                  (x) =>
                    x !== n &&
                    [d1, d1b, d2b].every((d) => puo(x, d)) &&
                    (stato[x][d1] || riposo) === riposo &&
                    (stato[x][d1b] || riposo) === riposo &&
                    lavora(x, d2) &&
                    lavora(x, d2b) &&
                    ammessi(x, d1).includes(a1) &&
                    ammessi(x, d1b).includes(a2) &&
                    ammessi(n, d2).includes(stato[x][d2]) &&
                    ammessi(n, d2b).includes(stato[x][d2b]),
                );
                if (!y) continue;
                const b1 = stato[y][d2];
                const b2 = stato[y][d2b];
                if (
                  provaStretta([
                    { n: n, d: d1, c: riposo },
                    { n: n, d: d1b, c: riposo },
                    { n: n, d: d2, c: b1 },
                    { n: n, d: d2b, c: b2 },
                    { n: y, d: d2, c: riposo },
                    { n: y, d: d2b, c: riposo },
                    { n: y, d: d1, c: a1 },
                    { n: y, d: d1b, c: a2 },
                  ])
                ) {
                  migliorati++;
                  break;
                }
              }
            }
            // SCAMBIO DI TURNO nello stesso giorno con un collega che lavora (es. notte e mattino):
            // cambia la sequenza dei turni e apre altri scambi di giorni (riposo di 11 ore)
            if (!lavora(n, d1)) continue;
            for (const y of mobili[d1]) {
              const c1 = stato[n][d1];
              const c2 = stato[y][d1];
              if (y === n || !lavora(y, d1) || c1 === c2) continue;
              if (!ammessi(y, d1).includes(c1) || !ammessi(n, d1).includes(c2)) continue;
              if (
                provaStretta([
                  { n: n, d: d1, c: c2 },
                  { n: y, d: d1, c: c1 },
                ])
              ) {
                migliorati++;
                break;
              }
            }
          }
        }
        if (!migliorati) break;
      }
    }
    function risultato() {
      rifinisciScambi();
      if (o.pesoCambio) rifinisci();
      const cambi = [];
      persone.forEach((n) =>
        giorni.forEach((d) => {
          const c = migliore.stato[n][d] || '';
          if (c !== (partenza[n][d] || '')) cambi.push({ nome: n, data: d, prima: partenza[n][d] || '', dopo: c });
        }),
      );
      // misura del migliore, ricalcolata da capo
      const s = migliore.stato;
      const conti = {};
      const somma1 = (v) => {
        aggiungiA(conti, v.conti);
        return v.costo;
      };
      let regole = P.costoMese ? somma1(leggi(P.costoMese(s))) : 0;
      persone.forEach((n) => (regole += somma1(leggi(P.costoPersona(n, s[n])))));
      let scop = 0;
      let scopPeso = 0;
      let ecc = 0;
      let ris = 0;
      giorni.forEach((d) => {
        const x = {};
        persone.forEach((n) => (x[n] = s[n][d] || ''));
        if (P.costoGiorno) regole += somma1(leggi(P.costoGiorno(d, x)));
        const f = fab[d] || {};
        const cnt = {};
        persone.forEach((n) => {
          const c = s[n][d];
          if (c) cnt[c] = (cnt[c] || 0) + 1;
        });
        Object.keys(f).forEach((c) => {
          const manca = Math.max(0, (f[c] || 0) - (cnt[c] || 0));
          scop += manca;
          scopPeso += manca * ((pesoPosto[d] || {})[c] || 1);
          if ((riserv[d] || {})[c]) ris += manca;
        });
        Object.keys(f).forEach((c) => (ecc += Math.max(0, (cnt[c] || 0) - (f[c] || 0))));
      });
      const notti = costoNottiDi(s);
      return {
        stato: s,
        cambi: cambi,
        prima: iniziale,
        // ammesso: rispetta tutti i vincoli (sempre, se la partenza li rispettava)
        ammesso: sforoDi(scop, ris, ecc, conti) === 0,
        dopo: {
          scoperti: scop,
          eccesso: ecc,
          riservati: ris,
          notti: Math.round(notti * 100) / 100,
          regole: regole,
          conti: conti,
          punteggio:
            regole +
            o.pesoScoperto * scopPeso +
            o.pesoEccesso * ecc +
            o.pesoCambio * cambi.length +
            o.pesoRiservato * ris +
            o.pesoNotti * notti,
        },
        iterazioni: iterazioni,
        accettate: accettate,
      };
    }
    return { passo: passo, risultato: risultato, misura: misura };
  }

  // ricerca completa con un numero di iterazioni (test e uso semplice)
  function cerca(problema, opzioni, iterazioni) {
    const r = crea(problema, opzioni);
    const n = iterazioni || 20000;
    const fette = 20;
    for (let i = 0; i < fette; i++) r.passo(0, i / fette, Math.ceil(n / fette));
    return r.risultato();
  }

  return { crea: crea, cerca: cerca, casuale: casuale, scartoNotti: scartoNotti, semeRicerca: semeRicerca };
});
