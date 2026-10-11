/**
 * Diario Collaboratori · Casino Lugano SA
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
 *   toccaMese     (nome) -> bool             (facoltativo) la persona conta per le regole del mese
 *   fissi         { nome: { dstr: codice } } (facoltativo) celle obbligate (formazioni)
 *   riservati     { dstr: { codice: true } } (facoltativo) POSTI RISERVATI: turni che possono
 *                 fare solo persone che li hanno fra i turni PRINCIPALI (es. Z dei Supervisor
 *                 delle Slots, 21/81/911 dei SUP dei Tavoli). Vedi maxRiservati.
 *   tipoNotte     (codice) -> 1 notte, 0 turno di giorno, null non e un turno (facoltativo,
 *                 per l equita delle notti)
 *   gruppoEquita  (nome) -> chiave del gruppo di persone comparabili o null (facoltativo)
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
 *   pesoNotti     punti per l equita delle notti (default 0 = spenta): somma, per gruppo
 *                 di persone comparabili, dei quadrati degli scarti della quota di notti
 *                 dalla media del gruppo (punti percentuali al quadrato / 100; vedi scartoNotti)
 *   minTurniNotti chi ha meno turni pesa in proporzione nell equita (default 8)
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
    const costoP = {};
    const costoG = {};
    const scopG = {};
    const scopW = {}; // scoperti pesati (posti rari valgono di piu): solo per il punteggio
    const eccG = {};
    const risG = {}; // posti riservati scoperti per giorno
    // regole sul mese intero (facoltative): ricalcolate a ogni mossa
    let costoM = P.costoMese ? P.costoMese(stato) : 0;
    persone.forEach((n) => (costoP[n] = P.costoPersona(n, stato[n]) + o.pesoCambio * cambiPersona(n)));
    giorni.forEach((d) => {
      costoG[d] = P.costoGiorno ? P.costoGiorno(d, perNomeGiorno(d)) : 0;
      scopG[d] = scopertiGiorno(d);
      scopW[d] = scopertiPesoGiorno(d);
      eccG[d] = eccessoGiorno(d);
      risG[d] = riservatiGiorno(d);
    });
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
    let totale = totaleDaCapo();
    const misura = () => ({
      punteggio: totale,
      scoperti: somma(scopG),
      eccesso: somma(eccG),
      riservati: somma(risG),
      notti: Math.round(somma(costoNG) * 100) / 100,
      regole: somma(costoP) + somma(costoG) + costoM,
    });
    const iniziale = misura();
    const maxScop = o.maxScoperti != null ? o.maxScoperti : iniziale.scoperti;
    const maxRis = o.maxRiservati != null ? o.maxRiservati : iniziale.riservati;
    let migliore = { punteggio: totale, stato: JSON.parse(JSON.stringify(stato)) };
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
      const dopoP = nomi.map((n) => P.costoPersona(n, stato[n]) + o.pesoCambio * cambiPersona(n));
      const dopoG = gg.map((d) => (P.costoGiorno ? P.costoGiorno(d, perNomeGiorno(d)) : 0));
      const dopoS = gg.map((d) => scopertiPesoGiorno(d));
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
      const dopoM = P.costoMese && (!P.toccaMese || nomi.some((n) => P.toccaMese(n))) ? P.costoMese(stato) : costoM;
      let delta = dopoM - costoM;
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
        return false;
      }
      nomi.forEach((n, i) => (costoP[n] = dopoP[i]));
      costoM = dopoM;
      gg.forEach((d, i) => {
        costoG[d] = dopoG[i];
        scopW[d] = dopoS[i];
        scopG[d] = scopertiGiorno(d);
        eccG[d] = dopoE[i];
        risG[d] = dopoR[i];
      });
      if (conNotti) gruppiN.forEach((k, i) => (costoNG[k] = dopoNG[i]));
      totale += delta;
      accettate++;
      // il migliore si sceglie solo fra i piani che non scoprono piu posti (e piu posti
      // riservati) di quelli di partenza
      if (totale < migliore.punteggio - 1e-9 && somma(scopG) <= maxScop && somma(risG) <= maxRis)
        migliore = { punteggio: totale, stato: JSON.parse(JSON.stringify(stato)) };
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
      persone.forEach((n) => (costoP[n] = P.costoPersona(n, stato[n]) + o.pesoCambio * cambiPersona(n)));
      giorni.forEach((d) => {
        costoG[d] = P.costoGiorno ? P.costoGiorno(d, perNomeGiorno(d)) : 0;
        scopG[d] = scopertiGiorno(d);
        scopW[d] = scopertiPesoGiorno(d);
        eccG[d] = eccessoGiorno(d);
        risG[d] = riservatiGiorno(d);
      });
      costoM = P.costoMese ? P.costoMese(stato) : 0;
      ricalcolaNotti();
      totale = totaleDaCapo();
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
      let k = 0;
      while ((maxIter ? k < maxIter : Date.now() < fine) && totale > 0) {
        const mossa = scegli(MOSSE)();
        k++;
        iterazioni++;
        if (mossa) prova(mossa, t0);
      }
      return misura();
    }
    // il risultato: il piano migliore trovato e le celle cambiate
    function risultato() {
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
      let regole = P.costoMese ? P.costoMese(s) : 0;
      persone.forEach((n) => (regole += P.costoPersona(n, s[n])));
      let scop = 0;
      let scopPeso = 0;
      let ecc = 0;
      let ris = 0;
      giorni.forEach((d) => {
        const x = {};
        persone.forEach((n) => (x[n] = s[n][d] || ''));
        if (P.costoGiorno) regole += P.costoGiorno(d, x);
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
        dopo: {
          scoperti: scop,
          eccesso: ecc,
          riservati: ris,
          notti: Math.round(notti * 100) / 100,
          regole: regole,
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
