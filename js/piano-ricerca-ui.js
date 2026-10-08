/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-ricerca-ui.js
 *
 * COLLEGAMENTO fra il piano del mese e il motore di ricerca (piano-ricerca.js).
 * Prepara il problema con le STESSE regole del programma:
 *  - chi puo fare quale turno: _pianoIdoneoStatico (lo stesso criterio della bozza);
 *  - le regole di ogni persona e fra persone: _pianoViolazioniPersona e
 *    _pianoViolazioniGruppi (le stesse di "Valida regole");
 *  - quali celle si possono cambiare: solo quelle generate da una bozza e i giorni
 *    vuoti, nei giorni aperti. Mai vacanze, malattie, celle protette o bloccate,
 *    inserimenti a mano, giorni passati in un altro settore.
 * Alla fine il risultato si controlla con "Valida regole" vero: se ci fossero piu
 * violazioni o piu posti scoperti di prima, non si usa (non puo peggiorare).
 */

// pesi del punteggio: una regola violata pesa piu di un posto scoperto (la ricerca
// non scambia mai una regola per una copertura), le ore fuori tolleranza meno,
// la distanza dall obiettivo di ore pochissimo (serve solo a distribuire meglio)
// (una regola pesa piu di tutti i posti che si potrebbero coprire violandola);
// ore SOPRA il massimo contano come una regola (la bozza non le supera mai), ore
// SOTTO il minimo meno (coprire i posti le fa salire)
const RICERCA_PESI = { legge: 60000, regola: 20000, oreSotto: 200, scoperto: 300, oraObiettivo: 2 };
// REGOLE DI LEGGE e di riposo: non possono mai aumentare (riposo minimo fra due
// turni, giorni consecutivi, riposo singolo dopo 4 giorni, ore della settimana,
// riposo attorno alla domenica). Con lo stesso peso la preferenza "giorni a
// settimana": Migliora non la scambia con un'altra regola per coprire un posto
// ORDINE DI IMPORTANZA fra le regole di legge (decisione del titolare 08/10/2026): prima
// le domeniche libere dell anno, poi il riposo di 11 ore, poi le 36 ore della settimana,
// poi le altre. Se Migliora deve scegliere, sacrifica per ultima la piu importante.
function _ricercaPesoOrdine(msg) {
  const m = String(msg || '');
  if (/domenica libera:/.test(m)) return 2;
  if (/di riposo dopo/.test(m)) return 1.5;
  if (/domenica .*lavorata|riposo di .* ore/.test(m)) return 1.2;
  return 1;
}
function _ricercaRegolaDiLegge(msg) {
  return /di riposo dopo|giorni lavorativi consecutivi|riposo singolo dopo|lavorate nella settimana|domenica .*lavorata|domenica libera:|riposo di .* ore|preferenza: massimo \d+ a settimana/.test(
    String(msg || ''),
  );
}

// prepara il problema del mese aperto (settore del piano). Ritorna { problema, ... }
// opz.estesa: anche i turni inseriti a mano si possono spostare (proposte su un
// piano gia sistemato, con il peso dei cambi); mai assenze, blocchi, giorni chiusi.
// opz.giorni: Set di date: solo in quei giorni si possono cambiare celle (formazioni:
// i giorni della formazione e quelli accanto, per i riposi).
// opz.giorniPersona: { nome: Set di date } giorni in piu per alcune persone (formatore e
// allievo: la settimana prima e dopo, per giorni di fila, ore della settimana e riposi).
// opz.soloNuoviBuchi: un posto conta come scoperto solo se la modifica lo lascia
// scoperto; i buchi che c erano gia non si cercano di coprire.
// opz.soloPeggioramenti: ogni persona, giorno e mese parte dal suo punteggio di oggi e
// conta solo quello che peggiora (non si correggono le violazioni gia presenti:
// per quello c e Migliora la bozza).
// opz.fissi: { nome: { dstr: codice } } celle obbligate (formazioni); un codice che
// comincia con ~ e il turno dell allievo: conta per le sue regole e ore, ma non
// copre un posto del fabbisogno (l allievo e in piu).
async function _ricercaPrepara(opz) {
  opz = opz || {};
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  await _pianoCaricaDomAnno(ym, rep).catch(() => {}); // domeniche libere nell anno (Valida)
  const nGiorni = _pianoUltimoGiorno(ym);
  const da = ym + '-01';
  const a = ym + '-' + String(nGiorni).padStart(2, '0');
  const dstrDi = (g) => ym + '-' + String(g).padStart(2, '0');
  // stato del mese con le celle degli altri settori e le settimane a cavallo
  _pianoRighe = await _pianoCaricaMeseSettore(da, a, rep);
  const [fabbRighe, storia] = await Promise.all([
    secGet('piano_fabbisogni?data=gte.' + da + '&data=lte.' + a + '&reparto_dip=eq.' + rep + '&limit=3000'),
    secGet('piano?data=lt.' + da + '&reparto_dip=eq.' + rep + '&order=data.desc&limit=20000'),
  ]);
  // storia per l idoneita: i gruppi gia fatti (come la bozza)
  const idoneita = {};
  (storia || []).concat(_pianoRighe).forEach((r) => {
    const t = _pianoTurnoInfo(r.codice);
    if (t) (idoneita[r.collaboratore] = idoneita[r.collaboratore] || new Set()).add(t.gruppo);
  });
  // chi partecipa: i collaboratori del settore (chi copre da un altro settore resta com e)
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && !_pianoCoperturaCfg(c) && !c.turni_solo_a_mano)
    .map((c) => c.nome);
  // GIORNI CHE SI POSSONO CAMBIARE: solo da domani in poi (controllo 05.10: Migliora
  // cambiava 23 celle di oggi, turni gia finiti o in corso, e i giorni passati quando un
  // giorno era sbloccato). Oggi e il passato restano come sono; il blocco dei giorni
  // chiusi vale in piu per le modifiche a mano
  const oggi = oggiLocale();
  const giorniAperti = [];
  for (let g = 1; g <= nGiorni; g++) {
    const d = dstrDi(g);
    if (d <= oggi) continue;
    if (!(_pianoGiornoBloccato(d) && !_pianoGiornoSbloccato(d))) giorniAperti.push(d);
  }
  const assenze = Object.assign({}, _pianoMalattieMese(ym), _pianoCnpMese(ym), _pianoFineMese(ym), _pianoNdMese(ym));
  // celle originali per persona e giorno
  const righeDi = {}; // nome|dstr -> [righe]
  _pianoRighe.forEach((r) => {
    const k = r.collaboratore + '|' + String(r.data).substring(0, 10);
    (righeDi[k] = righeDi[k] || []).push(r);
  });
  const bordoDi = {};
  (window._pianoRigheBordo || []).forEach((r) => (bordoDi[r.collaboratore] = bordoDi[r.collaboratore] || []).push(r));
  // celle che la ricerca puo cambiare
  const turniSettore = new Set(_pianoTurniReparto().map((t) => t.codice));
  // C DI RIEMPIMENTO: la bozza segna i giorni di riposo con una C generata (non
  // protetta). Sono riposi della bozza, quindi spostabili; le C protette (congedi
  // legati alle vacanze, inserite a mano) restano come sono
  // opz.cMobili (correzioni dopo l import): anche i C del file, senza nota e senza
  // blocco, sono riposi che si possono spostare; un riposo si scrive come C
  // opz.cMobiliPer (Set di nomi): i C del file si spostano solo per queste persone
  // (chi ha l errore), mai quelli dei colleghi
  // il congedo del compleanno e le celle con motivo sono riservati (_pianoCellaRiservata):
  // mai spostati (prima la C del compleanno, generata e non protetta, poteva diventare turno)
  const riempimento = (r) =>
    r.codice === 'C' &&
    !_pianoCellaRiservata(r) &&
    ((r.generato && !r.protetto) ||
      (opz.cMobili && !String(r.commento || '').trim() && (!opz.cMobiliPer || opz.cMobiliPer.has(r.collaboratore))));
  const conRiempimento = !!opz.cMobili || _pianoRighe.some((r) => (r.reparto_dip || 'slots') === rep && riempimento(r));
  const apertiSet = new Set(giorniAperti);
  const mobile = {};
  nomi.forEach((n) => {
    const info = _pianoCollabInfo(n) || {};
    giorniAperti.forEach((d) => {
      if (opz.giorni && !opz.giorni.has(d) && !(opz.giorniPersona && (opz.giorniPersona[n] || new Set()).has(d)))
        return;
      if (assenze[n + '|' + d]) return;
      if (info.data_assunzione && d < String(info.data_assunzione).substring(0, 10)) return;
      const rr = righeDi[n + '|' + d] || [];
      if (!rr.length) {
        // correzioni mirate: un giorno vuoto si riempie solo per chi ha l errore
        if (!opz.cMobiliPer || opz.cMobiliPer.has(n)) mobile[n + '|' + d] = true;
        return;
      }
      if (rr.length > 1) return;
      const r = rr[0];
      if (!_pianoCopreQui(r)) return; // giorno passato in un altro settore
      if (_pianoCellaRiservata(r)) return;
      if (!opz.estesa && (!r.generato || r.protetto)) return;
      if (r.codice === 'WD' || turniSettore.has(r.codice) || riempimento(r)) mobile[n + '|' + d] = true;
    });
  });
  // le celle obbligate (formazioni) sono sempre della ricerca (controllate prima)
  Object.keys(opz.fissi || {}).forEach((n) =>
    Object.keys(opz.fissi[n]).forEach((d) => {
      if (nomi.includes(n)) mobile[n + '|' + d] = true;
    }),
  );
  // stato di partenza: i codici delle celle mobili ('' = riposo); le altre celle
  // entrano con un segno, cosi non contano per il fabbisogno del settore
  const stato = {};
  nomi.forEach((n) => {
    stato[n] = {};
    for (let g = 1; g <= nGiorni; g++) {
      const d = dstrDi(g);
      const rr = righeDi[n + '|' + d] || [];
      if (mobile[n + '|' + d]) stato[n][d] = rr.length && !riempimento(rr[0]) ? rr[0].codice : '';
      else if (rr.length) stato[n][d] = (_pianoCopreQui(rr[0]) ? '' : '#') + rr[0].codice;
    }
  });
  // fabbisogno, tolti i posti gia coperti da chi non partecipa (coperture da altri settori)
  const fabbisogno = {};
  (fabbRighe || []).forEach((f) => {
    const d = String(f.data).substring(0, 10);
    if (!apertiSet.has(d)) return;
    const q = parseInt(f.quantita) || 0;
    if (q) (fabbisogno[d] = fabbisogno[d] || {})[f.turno_codice] = q;
  });
  const nomiSet = new Set(nomi);
  _pianoRighe.forEach((r) => {
    const d = String(r.data).substring(0, 10);
    if (nomiSet.has(r.collaboratore) || !fabbisogno[d] || !fabbisogno[d][r.codice] || !_pianoCopreQui(r)) return;
    fabbisogno[d][r.codice] = Math.max(0, fabbisogno[d][r.codice] - 1);
  });
  // solo i buchi nuovi: il fabbisogno non supera quanti posti sono coperti oggi
  if (opz.soloNuoviBuchi) {
    const oggiCoperti = {};
    _pianoRighe.forEach((r) => {
      if (!_pianoCopreQui(r)) return;
      const k = String(r.data).substring(0, 10) + '|' + r.codice;
      oggiCoperti[k] = (oggiCoperti[k] || 0) + 1;
    });
    Object.keys(fabbisogno).forEach((d) =>
      Object.keys(fabbisogno[d]).forEach((c) => {
        // i posti coperti da chi non partecipa sono gia stati tolti sopra
        const esterni = _pianoRighe.filter(
          (r) => !nomiSet.has(r.collaboratore) && String(r.data).startsWith(d) && r.codice === c && _pianoCopreQui(r),
        ).length;
        fabbisogno[d][c] = Math.min(fabbisogno[d][c], Math.max(0, (oggiCoperti[d + '|' + c] || 0) - esterni));
      }),
    );
  }
  // chi puo fare cosa, giorno per giorno: i turni che servono quel giorno e per cui
  // la persona e idonea (stesso criterio della bozza), piu il riposo
  const turnoInfoDi = {};
  _pianoTurniReparto().forEach((t) => (turnoInfoDi[t.codice] = t));
  const ammessi = (n, d) => {
    const dow = new Date(d + 'T12:00:00').getDay();
    const wd = (righeDi[n + '|' + d] || [])[0];
    const isWd = wd && wd.codice === 'WD';
    const out = Object.keys(fabbisogno[d] || {}).filter((c) => {
      const t = turnoInfoDi[c];
      if (!t) return false;
      if (isWd && t.tipo === 'NOTTURNO') return false; // WD = qui deve lavorare di giorno
      return _pianoIdoneoStatico(n, t, dow, idoneita);
    });
    out.push(isWd ? 'WD' : '');
    return out;
  };
  // REGOLE della persona, con lo stesso controllo di "Valida regole"
  const ctx = _pianoCtxViolazioni(ym);
  const obiettivo = {};
  await _pianoAggiornaYtd(nomi);
  await _pianoCaricaOreMese(ym);
  nomi.forEach((n) => {
    const lim = _pianoLimitiOre(n, nGiorni);
    obiettivo[n] = lim.obiettivo != null ? lim.obiettivo : null;
  });
  const righePersona = (n, mappa) => {
    const out = [];
    for (let g = 1; g <= nGiorni; g++) {
      const d = dstrDi(g);
      if (mobile[n + '|' + d]) {
        // riposo: la C di riempimento come la scrive la bozza
        let c = mappa[d] || (conRiempimento ? 'C' : '');
        if (c && c[0] === '~') c = c.slice(1); // turno dell allievo in formazione
        if (c) out.push({ collaboratore: n, data: d, codice: c, reparto_dip: rep, generato: true, protetto: false });
      } else (righeDi[n + '|' + d] || []).forEach((r) => out.push(r));
    }
    return out;
  };
  const dettaglioPersona = (n, mappa) => {
    const mese = righePersona(n, mappa);
    return _pianoViolazioniPersona(n, mese, mese.concat(bordoDi[n] || []), ctx);
  };
  const costoPersona = (n, mappa) => {
    const mese = righePersona(n, mappa);
    const viol = _pianoViolazioniPersona(n, mese, mese.concat(bordoDi[n] || []), ctx);
    let costo = 0;
    viol.forEach(
      (v) =>
        (costo += / SOTTO il minimo /.test(v.msg)
          ? RICERCA_PESI.oreSotto
          : _ricercaRegolaDiLegge(v.msg)
            ? RICERCA_PESI.legge * _ricercaPesoOrdine(v.msg)
            : RICERCA_PESI.regola),
    );
    if (obiettivo[n] != null) {
      const infoO = _pianoCollabInfo(n) || {};
      const pct = parseFloat(infoO.percentuale) || 1;
      const ore = mese.reduce((t, r) => t + (_pianoOreDiRiga(r, pct) || 0), 0);
      const scarto = ore - obiettivo[n];
      // i fissi devono raggiungere le ore (sotto pesa il doppio); i jolly coprono i
      // buchi: costa solo andare oltre l 80% (decisione del titolare 08/10/2026)
      costo += RICERCA_PESI.oraObiettivo * (infoO.is_jolly ? Math.max(0, scarto) : scarto < 0 ? -2 * scarto : scarto);
    }
    return costo;
  };
  // REGOLE FRA PERSONE nel giorno (accompagnamento, limiti per gruppo): solo se il
  // settore ne ha; quelle sul mese intero le controlla la verifica finale
  const conGruppi = (pianoRegoleGruppoCache || []).some(
    (r) => r.attivo !== false && (r.reparto_dip || 'slots') === rep,
  );
  const estranei = _pianoRighe.filter((r) => !nomiSet.has(r.collaboratore));
  const costoGiorno = conGruppi
    ? (d, perNome) => {
        const g = parseInt(d.substring(8, 10));
        const righe = estranei.filter((r) => String(r.data).startsWith(d));
        Object.keys(perNome).forEach((n) => {
          if (mobile[n + '|' + d]) {
            // l allievo in formazione (~) non conta per le regole fra persone
            if (perNome[n] && perNome[n][0] !== '~')
              righe.push({ collaboratore: n, data: d, codice: perNome[n], reparto_dip: rep });
          } else (righeDi[n + '|' + d] || []).forEach((r) => righe.push(r));
        });
        return RICERCA_PESI.regola * _pianoViolazioniGruppi(righe, ctx).filter((v) => v.giorno === g).length;
      }
    : null;
  // regole di gruppo sul MESE intero (limite e minimo di una funzione nel mese)
  const conGruppiMese = (pianoRegoleGruppoCache || []).some(
    (r) =>
      r.attivo !== false &&
      (r.reparto_dip || 'slots') === rep &&
      /_mese$/.test(String(r.tipo_regola || '').toLowerCase()),
  );
  const funzioniMese = new Set(
    (pianoRegoleGruppoCache || [])
      .filter(
        (r) =>
          r.attivo !== false &&
          (r.reparto_dip || 'slots') === rep &&
          /_mese$/.test(String(r.tipo_regola || '').toLowerCase()),
      )
      .map((r) =>
        String(r.valore || '')
          .split(':')[0]
          .trim()
          .toUpperCase(),
      ),
  );
  const toccaMese = (n) => funzioniMese.has(String((_pianoCollabInfo(n) || {}).funzione || '').toUpperCase());
  const costoMese = conGruppiMese
    ? (statoTutto) => {
        const righe = estranei.slice();
        nomi.forEach((n) => righePersona(n, statoTutto[n]).forEach((r) => righe.push(r)));
        return RICERCA_PESI.regola * _pianoViolazioniGruppi(righe, ctx).filter((v) => v.giorno === 0).length;
      }
    : null;
  // solo peggioramenti: punteggio di partenza (piano di oggi, senza le celle obbligate)
  let cP = costoPersona;
  let cG = costoGiorno;
  let cM = costoMese;
  if (opz.soloPeggioramenti) {
    const baseP = {};
    nomi.forEach((n) => (baseP[n] = costoPersona(n, stato[n])));
    cP = (n, mappa) => Math.max(0, costoPersona(n, mappa) - (baseP[n] || 0));
    if (costoGiorno) {
      const baseG = {};
      giorniAperti.forEach((d) => {
        const x = {};
        nomi.forEach((n) => (x[n] = stato[n][d] || ''));
        baseG[d] = costoGiorno(d, x);
      });
      cG = (d, x) => Math.max(0, costoGiorno(d, x) - (baseG[d] || 0));
    }
    if (costoMese) {
      const baseM = costoMese(stato);
      cM = (st) => Math.max(0, costoMese(st) - baseM);
    }
  }
  return {
    ym: ym,
    reparto: rep,
    conRiempimento: conRiempimento,
    mobile: mobile,
    righeDi: righeDi,
    righePersona: righePersona,
    dettaglioPersona: dettaglioPersona,
    problema: {
      giorni: giorniAperti,
      persone: nomi,
      stato: stato,
      riposo: '',
      fabbisogno: fabbisogno,
      modificabile: (n, d) => !!mobile[n + '|' + d],
      ammessi: ammessi,
      costoPersona: cP,
      costoGiorno: cG,
      costoMese: cM,
      toccaMese: toccaMese,
      fissi: opz.fissi || null,
    },
  };
}

// posti del fabbisogno scoperti con le righe date (stesso conteggio del calendario)
function _ricercaScoperti(righe, fabbisogno) {
  const cnt = {};
  righe.forEach((r) => {
    if (!_pianoCopreQui(r)) return;
    const k = String(r.data).substring(0, 10) + '|' + r.codice;
    cnt[k] = (cnt[k] || 0) + 1;
  });
  let s = 0;
  Object.keys(fabbisogno).forEach((d) =>
    Object.keys(fabbisogno[d]).forEach((c) => (s += Math.max(0, fabbisogno[d][c] - (cnt[d + '|' + c] || 0)))),
  );
  return s;
}

// righe del mese con lo stato trovato dalla ricerca (per la verifica finale)
function _ricercaRigheDa(prep, stato) {
  const out = _pianoRighe.filter((r) => !prep.problema.persone.includes(r.collaboratore));
  prep.problema.persone.forEach((n) => prep.righePersona(n, stato[n]).forEach((r) => out.push(r)));
  return out;
}

// conteggio ufficiale (Valida regole + posti scoperti) per un insieme di righe del mese
function _ricercaMisuraUfficiale(righe, fabbOriginale) {
  const salva = _pianoRighe;
  try {
    _pianoRighe = righe;
    const v = _pianoCalcolaViolazioni();
    // per tipo: le ore del mese fuori tolleranza a parte dalle altre regole
    const tipi = {};
    v.lista.forEach((x) => {
      const k = x.msg
        .replace(/[0-9]+([.,][0-9]+)?/g, '#')
        .replace(/\(.*\)/, '')
        .trim();
      tipi[k] = (tipi[k] || 0) + 1;
    });
    const sotto = v.lista.filter((x) => / SOTTO il minimo /.test(x.msg)).length;
    return {
      violazioni: v.lista.length,
      legge: v.lista.filter((x) => _ricercaRegolaDiLegge(x.msg)).length,
      voci: v.lista.map((x) => x.nome + (x.giorno ? ' ' + x.giorno : '') + ': ' + x.msg),
      regole: v.lista.length - sotto,
      oreSotto: sotto,
      tipi: tipi,
      scoperti: _ricercaScoperti(righe, fabbOriginale),
    };
  } finally {
    _pianoRighe = salva;
  }
}

// RICERCA sul mese aperto, senza scrivere niente: ritorna prima/dopo e i cambi.
// secondi: tempo a disposizione; onPasso(stato) per la barra di avanzamento;
// opz (facoltativo): { prepara: opzioni di _ricercaPrepara, motore: opzioni del
// motore, es. pesoCambio } per le correzioni mirate (confine fra due mesi)
async function pianoRicercaCalcola(secondi, onPasso, opz) {
  opz = opz || {};
  const prep = await _ricercaPrepara(opz.prepara);
  // metro diverso per le persone (es. correzioni dopo l import: solo riposi e giorni
  // di fila): opz.costoPersona(prep) -> (nome, mappa) => costo; i gruppi non contano
  if (typeof opz.costoPersona === 'function') {
    const base = prep.problema.costoPersona;
    const extra = opz.costoPersona(prep);
    // il metro richiesto pesa di piu, le regole di sempre restano (non si peggiorano)
    prep.problema.costoPersona = (n, mappa) => extra(n, mappa) + base(n, mappa);
  }
  const fabbOriginale = {};
  // fabbisogno intero (con i posti coperti da altri settori) per il conteggio ufficiale
  const fr =
    (await secGet(
      'piano_fabbisogni?data=gte.' +
        prep.ym +
        '-01&data=lte.' +
        prep.ym +
        '-' +
        String(_pianoUltimoGiorno(prep.ym)).padStart(2, '0') +
        '&reparto_dip=eq.' +
        prep.reparto +
        '&limit=3000',
    )) || [];
  fr.forEach((f) => {
    const q = parseInt(f.quantita) || 0;
    if (q)
      (fabbOriginale[String(f.data).substring(0, 10)] = fabbOriginale[String(f.data).substring(0, 10)] || {})[
        f.turno_codice
      ] = q;
  });
  const prima = _ricercaMisuraUfficiale(_pianoRighe, fabbOriginale);
  const motore = PianoRicerca.crea(
    prep.problema,
    Object.assign({ pesoScoperto: RICERCA_PESI.scoperto, seme: Date.now() % 100000 }, opz.motore || {}),
  );
  const ms = Math.max(1, secondi) * 1000;
  const inizio = Date.now();
  // a fette da 40 ms: la pagina resta usabile
  window._ricercaFerma = false;
  while (Date.now() - inizio < ms && !window._ricercaFerma) {
    const frazione = (Date.now() - inizio) / ms;
    const m = motore.passo(40, frazione);
    if (onPasso) onPasso({ frazione: frazione, scoperti: m.scoperti, punteggio: m.punteggio });
    await new Promise((x) => setTimeout(x, 0));
  }
  const ris = motore.risultato();
  const righeDopo = _ricercaRigheDa(prep, ris.stato);
  const dopo = _ricercaMisuraUfficiale(righeDopo, fabbOriginale);
  // si usa solo se nessuna regola peggiora e i posti scoperti non aumentano
  const migliore =
    // mai persone in piu del fabbisogno rispetto a prima (doppioni)
    (ris.dopo.eccesso || 0) <= (ris.prima.eccesso || 0) &&
    dopo.legge <= prima.legge &&
    dopo.regole <= prima.regole &&
    dopo.scoperti <= prima.scoperti &&
    (dopo.regole < prima.regole ||
      dopo.scoperti < prima.scoperti ||
      dopo.oreSotto < prima.oreSotto ||
      ris.dopo.punteggio < ris.prima.punteggio);
  return {
    prep: prep,
    prima: prima,
    dopo: dopo,
    cambi: ris.cambi,
    iterazioni: ris.iterazioni,
    punteggio: { prima: ris.prima.punteggio, dopo: ris.dopo.punteggio },
    eccesso: { prima: ris.prima.eccesso || 0, dopo: ris.dopo.eccesso || 0 },
    migliore: migliore,
  };
}

// ---------------------------------------------------------------- bottone
// MIGLIORA LA BOZZA: si sceglie il tempo, la ricerca lavora (la pagina resta
// usabile, si puo fermare), poi si vede prima/dopo controllato con "Valida
// regole" e si decide se applicare. Si puo annullare con Annulla del piano.
async function pianoMigliora() {
  if (!_pianoAzioneAutoConsentita('genera')) return;
  if (!puoGestirePiano()) return;
  const scelta = await chiediModulo(
    'Il programma prova scambi e spostamenti fra le celle della bozza di ' +
      _pianoMeseSel +
      ' e tiene solo quelli che migliorano: prima le regole (riposi, giorni di fila, ore della settimana, domeniche), poi i posti scoperti, poi le ore di ognuno.\n\nNon tocca vacanze, malattie, celle protette o bloccate, inserimenti a mano, giorni chiusi. Piu tempo ha, piu combinazioni prova.',
    [
      {
        titolo: 'Tempo a disposizione',
        campi: [
          {
            id: 'min',
            tipo: 'scelta',
            valore: '3',
            opzioni: [
              { valore: '1', etichetta: '1 minuto' },
              { valore: '3', etichetta: '3 minuti (consigliato)' },
              { valore: '5', etichetta: '5 minuti' },
              { valore: '10', etichetta: '10 minuti' },
            ],
          },
        ],
      },
    ],
    { titolo: 'Migliora la bozza', ok: 'Avvia' },
  );
  if (!scelta) return;
  const secondi = (parseInt(scelta.min) || 3) * 60;
  // finestra di avanzamento con Ferma
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:460px"><h3>Migliora la bozza</h3>' +
    '<div class="finestra-testo" id="ric-testo">Preparo i dati del mese...</div>' +
    '<div style="height:8px;background:var(--line,#ddd);border-radius:4px;overflow:hidden;margin:10px 0"><div id="ric-barra" style="height:100%;width:0;background:var(--accent2,#1a4a7a);transition:width .3s"></div></div>' +
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no" onclick="window._ricercaFerma=true;this.disabled=true;this.textContent=\'Mi fermo...\'">Ferma e mostra il risultato</button></div></div>';
  document.body.appendChild(velo);
  const testo = document.getElementById('ric-testo');
  const barra = document.getElementById('ric-barra');
  let res;
  try {
    const t0 = Date.now();
    res = await pianoRicercaCalcola(secondi, (x) => {
      const pass = Math.round((Date.now() - t0) / 1000);
      barra.style.width = Math.round(x.frazione * 100) + '%';
      testo.textContent =
        'Sto cercando: ' + pass + ' di ' + secondi + ' secondi. Posti scoperti in questo momento: ' + x.scoperti + '.';
    });
  } catch (e) {
    velo.remove();
    toastErrore('Ricerca non riuscita: ' + (e.message || e));
    return;
  }
  velo.remove();
  const P = res.prima;
  const D = res.dopo;
  const riga = (et, a, b) => '\n• ' + et + ': ' + a + ' → ' + b;
  const riepilogo =
    'Risultato controllato con "Valida regole":' +
    riga('Regole di legge violate (riposi, giorni di fila, ore della settimana, domenica)', P.legge, D.legge) +
    riga('Altre regole violate', P.regole - P.legge, D.regole - D.legge) +
    riga('Posti del fabbisogno scoperti', P.scoperti, D.scoperti) +
    riga('Persone sotto il minimo di ore', P.oreSotto, D.oreSotto) +
    riga('Turni oltre il fabbisogno (doppioni)', res.eccesso.prima, res.eccesso.dopo) +
    '\n• Celle cambiate: ' +
    res.cambi.length;
  logAzione(
    'Piano: ricerca sulla bozza',
    _pianoMeseSel +
      ' ' +
      _pianoReparto() +
      ' · ' +
      secondi +
      's · legge ' +
      P.legge +
      '>' +
      D.legge +
      ', scoperti ' +
      P.scoperti +
      '>' +
      D.scoperti +
      (res.migliore ? '' : ' · non applicabile'),
  );
  if (!res.migliore || !res.cambi.length) {
    await mostraAvviso(
      riepilogo +
        '\n\nNessun miglioramento sicuro: il piano resta com e. (Si applica solo se nessuna regola peggiora e i posti scoperti non aumentano.)',
      { titolo: 'Migliora la bozza', ok: 'Ho capito' },
    );
    return;
  }
  const ok = await chiediModulo(
    riepilogo +
      '\n\nVacanze, malattie, celle protette e inserimenti a mano non sono stati toccati. Applico? Si puo annullare con Annulla del piano.',
    [],
    { titolo: 'Migliora la bozza', ok: 'Applica', annulla: 'Lascia com e' },
  );
  if (!ok) return;
  await _ricercaScrivi(res);
}

// scrive le celle cambiate (solo celle generate o vuote), con la fotografia per Annulla
async function _ricercaScrivi(res) {
  const prep = res.prep;
  const op = getOperatore();
  const ora = new Date().toISOString();
  _pianoUndoSnap('migliora bozza ' + prep.ym);
  const nuove = [];
  let cambia = [];
  let togli = [];
  const attesa = {}; // id -> cella come la ricerca l ha letta (codice, generato, nome, data)
  res.cambi.forEach((c) => {
    const r = (prep.righeDi[c.nome + '|' + c.data] || [])[0];
    const cod = c.dopo || (prep.conRiempimento ? 'C' : '');
    if (r) {
      attesa[r.id] = {
        codice: r.codice,
        generato: r.generato,
        protetto: !!r.protetto,
        blocco: r.motivo_blocco || '',
        commento: r.commento || '',
        nome: c.nome,
        data: c.data,
      };
      if (!cod) togli.push(r.id);
      else if (cod !== r.codice) cambia.push({ id: r.id, codice: cod });
    } else if (cod)
      nuove.push({
        collaboratore: c.nome,
        data: c.data,
        codice: cod,
        protetto: false,
        generato: true,
        reparto_dip: prep.reparto,
      });
  });
  // SCRITTURA PRUDENTE: la ricerca ha lavorato per minuti su una fotografia del mese.
  // Una cella cambiata nel frattempo (da un collega, a mano) non si tocca: vince la
  // modifica fatta a mano. Le celle nuove le protegge gia il database (una cella per
  // persona e giorno: se nel frattempo c e, l inserimento si scarta).
  const saltate = [];
  try {
    const ids = togli.concat(cambia.map((x) => x.id));
    const ora2 = {};
    for (let i = 0; i < ids.length; i += 150) {
      const righe =
        (await secGet(
          'piano?id=in.(' +
            ids.slice(i, i + 150).join(',') +
            ')&select=id,codice,generato,protetto,motivo_blocco,commento&limit=1000',
        )) || [];
      righe.forEach((r) => (ora2[r.id] = r));
    }
    const intatta = (id) => {
      const a = attesa[id];
      const c = ora2[id];
      // intatta = stesso codice, ancora del programma, non protetta, non bloccata e con la
      // stessa nota di quando la ricerca l ha letta (prima si guardava solo il codice: una
      // cella bloccata o protetta nel frattempo veniva sovrascritta)
      return !!(
        a &&
        c &&
        c.codice === a.codice &&
        !(a.generato && c.generato === false) &&
        !!c.protetto === a.protetto &&
        (c.motivo_blocco || '') === a.blocco &&
        (c.commento || '') === a.commento
      );
    };
    ids.filter((id) => !intatta(id)).forEach((id) => saltate.push(attesa[id]));
    togli = togli.filter(intatta);
    cambia = cambia.filter((x) => intatta(x.id));
  } catch (e) {
    toastErrore('Controllo delle celle non riuscito: ' + (e.message || e) + '. Niente scritto.');
    return;
  }
  res.saltate = saltate;
  try {
    for (let i = 0; i < togli.length; i += 50)
      await secDel('piano', 'id=in.(' + togli.slice(i, i + 50).join(',') + ')');
    for (let i = 0; i < cambia.length; i += 10)
      await Promise.all(
        cambia
          .slice(i, i + 10)
          // anche qui solo se la cella ha ancora il codice letto (un cambio arrivato
          // nell ultimo istante non viene sovrascritto)
          .map((x) =>
            secPatch(
              'piano',
              'id=eq.' +
                x.id +
                '&codice=eq.' +
                encodeURIComponent(attesa[x.id].codice) +
                '&motivo_blocco=is.null&protetto=eq.' +
                attesa[x.id].protetto,
              {
                codice: x.codice,
                operatore: op,
                updated_at: ora,
              },
            ),
          ),
      );
    for (let i = 0; i < nuove.length; i += 2500)
      await _rpcSicura('piano_bulk_upsert', { p_token: getOpToken(), p_rows: nuove.slice(i, i + 2500) });
    logAzione(
      'Piano: bozza migliorata',
      prep.ym +
        ' ' +
        prep.reparto +
        ' · ' +
        res.cambi.length +
        ' celle (' +
        cambia.length +
        ' cambiate, ' +
        nuove.length +
        ' nuove, ' +
        togli.length +
        ' tolte' +
        (saltate.length ? ', ' + saltate.length + ' lasciate perche modificate nel frattempo' : '') +
        ')',
    );
    if (!window._pianoAutoInCorso)
      toast(
        'Bozza migliorata: ' +
          (res.cambi.length - saltate.length) +
          ' celle' +
          (saltate.length ? ' · ' + saltate.length + ' lasciate come sono perche modificate a mano nel frattempo' : ''),
      );
  } catch (e) {
    if (window._pianoAutoInCorso) throw e;
    toastErrore('Scrittura interrotta: ' + (e.message || e) + '. Con Annulla del piano si torna a prima.');
  }
  _pianoViolCelle = {};
  _pianoViolLista = null;
  await renderPiano();
}
