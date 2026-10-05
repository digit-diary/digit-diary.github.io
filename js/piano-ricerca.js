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
 * Opzioni:
 *   pesoScoperto  punti per ogni posto del fabbisogno senza nessuno (default 300)
 *   pesoEccesso   punti per ogni persona IN PIU del fabbisogno su un turno (default
 *                 1.000.000 = vietato): prima la ricerca aggiungeva turni gia coperti per
 *                 dare ore a chi era sotto il minimo del mese (40 doppioni in un minuto su
 *                 novembre Slots). Le ore mancanti con un fabbisogno pieno sono un tema di
 *                 organico, non si risolvono con doppioni.
 *   pesoCambio    punti per ogni cella diversa dal piano di partenza (default 0;
 *                 per le proposte su un piano gia sistemato: meno cambi possibile)
 *   maxScoperti   il risultato non puo lasciare piu posti scoperti di cosi
 *                 (default: quelli di partenza): la ricerca puo passarci in mezzo,
 *                 ma il piano migliore si sceglie solo fra quelli che lo rispettano
 *   seme          numero per rendere la ricerca ripetibile (test)
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

  function crea(problema, opzioni) {
    const P = problema;
    const o = Object.assign({ pesoScoperto: 300, pesoEccesso: 1000000, pesoCambio: 0, seme: 1 }, opzioni || {});
    const rnd = casuale(o.seme);
    const scegli = (arr) => arr[Math.floor(rnd() * arr.length)];
    const giorni = P.giorni.slice();
    const persone = P.persone.slice();
    const riposo = P.riposo || 'C';
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
    const eccG = {};
    // regole sul mese intero (facoltative): ricalcolate a ogni mossa
    let costoM = P.costoMese ? P.costoMese(stato) : 0;
    persone.forEach((n) => (costoP[n] = P.costoPersona(n, stato[n]) + o.pesoCambio * cambiPersona(n)));
    giorni.forEach((d) => {
      costoG[d] = P.costoGiorno ? P.costoGiorno(d, perNomeGiorno(d)) : 0;
      scopG[d] = scopertiGiorno(d);
      eccG[d] = eccessoGiorno(d);
    });
    const somma = (obj) => Object.keys(obj).reduce((t, k) => t + obj[k], 0);
    let totale = somma(costoP) + somma(costoG) + costoM + o.pesoScoperto * somma(scopG) + o.pesoEccesso * somma(eccG);
    const misura = () => ({
      punteggio: totale,
      scoperti: somma(scopG),
      eccesso: somma(eccG),
      regole: somma(costoP) + somma(costoG) + costoM,
    });
    const iniziale = misura();
    const maxScop = o.maxScoperti != null ? o.maxScoperti : iniziale.scoperti;
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
      const primaS = gg.map((d) => scopG[d]);
      const primaE = gg.map((d) => eccG[d]);
      // applica
      mossa.forEach((m, i) => {
        const v = vecchi[i];
        if (v) assegnati[m.d][v]--;
        if (m.c) assegnati[m.d][m.c] = (assegnati[m.d][m.c] || 0) + 1;
        stato[m.n][m.d] = m.c;
      });
      const dopoP = nomi.map((n) => P.costoPersona(n, stato[n]) + o.pesoCambio * cambiPersona(n));
      const dopoG = gg.map((d) => (P.costoGiorno ? P.costoGiorno(d, perNomeGiorno(d)) : 0));
      const dopoS = gg.map((d) => scopertiGiorno(d));
      const dopoE = gg.map((d) => eccessoGiorno(d));
      // regole del mese: solo se la mossa tocca chi conta (es. le funzioni con un limite nel mese)
      const dopoM = P.costoMese && (!P.toccaMese || nomi.some((n) => P.toccaMese(n))) ? P.costoMese(stato) : costoM;
      let delta = dopoM - costoM;
      nomi.forEach((n, i) => (delta += dopoP[i] - primaP[i]));
      gg.forEach(
        (d, i) =>
          (delta +=
            dopoG[i] - primaG[i] + o.pesoScoperto * (dopoS[i] - primaS[i]) + o.pesoEccesso * (dopoE[i] - primaE[i])),
      );
      const tieni = delta <= 0 || (temperatura > 0 && rnd() < Math.exp(-delta / temperatura));
      if (!tieni) {
        mossa.forEach((m, i) => {
          if (m.c) assegnati[m.d][m.c]--;
          if (vecchi[i]) assegnati[m.d][vecchi[i]] = (assegnati[m.d][vecchi[i]] || 0) + 1;
          stato[m.n][m.d] = vecchi[i];
        });
        return false;
      }
      nomi.forEach((n, i) => (costoP[n] = dopoP[i]));
      costoM = dopoM;
      gg.forEach((d, i) => {
        costoG[d] = dopoG[i];
        scopG[d] = dopoS[i];
        eccG[d] = dopoE[i];
      });
      totale += delta;
      accettate++;
      if (totale < migliore.punteggio - 1e-9 && somma(scopG) <= maxScop)
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
        eccG[d] = eccessoGiorno(d);
      });
      costoM = P.costoMese ? P.costoMese(stato) : 0;
      totale = somma(costoP) + somma(costoG) + costoM + o.pesoScoperto * somma(scopG) + o.pesoEccesso * somma(eccG);
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
      let ecc = 0;
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
        Object.keys(f).forEach((c) => (scop += Math.max(0, (f[c] || 0) - (cnt[c] || 0))));
        Object.keys(f).forEach((c) => (ecc += Math.max(0, (cnt[c] || 0) - (f[c] || 0))));
      });
      return {
        stato: s,
        cambi: cambi,
        prima: iniziale,
        dopo: {
          scoperti: scop,
          eccesso: ecc,
          regole: regole,
          punteggio: regole + o.pesoScoperto * scop + o.pesoEccesso * ecc + o.pesoCambio * cambi.length,
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

  return { crea: crea, cerca: cerca, casuale: casuale };
});
