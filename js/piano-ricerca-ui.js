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
// QUALITA (regole equilibrio_livelli e minimo_competenza_giorno: forti in ogni fascia, livello
// medio, competenze per fascia): sono preferenze di organizzazione, non regole. Prima pesavano
// 20.000 per fascia come una regola vera: Migliora scopriva un posto (300) pur di aggiustare
// un livello medio. Ora 150: meno di un posto scoperto (300, fino a 1.500 se raro), cosi un
// posto non si scambia mai per una fascia piu equilibrata; piu delle ore verso l obiettivo
// (2 all ora: un turno spostato = 16) e dell equita delle notti, cosi a parita di posti una
// fascia equilibrata vince.
// RISERVATO: un posto riservato (turno PRINCIPALE di poche funzioni, es. le Z dei Supervisor
// o i 21/81/911 dei SUP dei Tavoli) scoperto pesa 30.000 in piu: sopra ogni altra regola
// (20.000) e sotto la legge (60.000): si copre a costo di un altra regola, mai violando la
// legge. In piu e un vincolo duro: il risultato non scopre piu posti riservati di prima.
// NOTTI: equita delle notti fra persone comparabili (stessa funzione), 3 punti per ogni
// (punto percentuale di scarto)^2 / 100: spostare una persona da +30 a +25 punti sopra la
// media vale ~8, come 4 ore verso l obiettivo; mai quanto un posto o una regola. Si cambia
// con l impostazione del piano equita_notti_peso (0 = spenta).
// VINCOLI (v450): il risultato non puo avere piu regole di legge di prima, tipo per tipo, ne
// piu regole vere in tutto, piu posti scoperti, riservati o doppioni (RICERCA_VINCOLI, gli
// stessi per il motore e per il controllo finale). La ricerca puo attraversare piani fuori
// dai vincoli, ma restituisce il migliore che li rispetta; SFORO: ogni unita fuori dai
// vincoli costa fino a 1.000.000 di punti, che crescono con la ricerca (0 all inizio, pieni
// alla fine), e dal 30% della ricerca uno stato fuori dai vincoli si lascia per il migliore
// ammesso: cosi la ricerca lavora fra i piani applicabili (prima finiva su un piano con 13
// scoperti e una legge in piu, scartato tutto: restavano 41 scoperti).
const RICERCA_PESI = {
  legge: 60000,
  regola: 20000,
  qualita: 150,
  riservato: 30000,
  oreSotto: 200,
  scoperto: 300,
  oraObiettivo: 2,
  notti: 3,
  sforo: 1000000,
};
// iterazioni al minuto del tempo scelto (circa un minuto su un PC d ufficio, novembre Slots:
// ~700 al secondo). La ricerca conta le iterazioni, non i secondi: con lo stesso seme e lo
// stesso piano di partenza il risultato e identico. Il tempo resta un freno (al massimo il
// doppio di quello scelto): su un PC lento si ferma prima e lo dice (risultato non ripetibile).
const RICERCA_ITER_MINUTO = 42000;
const RICERCA_TEMPO_FRENO = 2;
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
// regole di QUALITA fra persone (equilibrio_livelli, minimo_competenza_giorno): peso proprio
function _ricercaRegolaDiQualita(msg) {
  const m = String(msg || '');
  return (
    /^giorno \d+, .*: .*(di livello L\d+ o più \(minimo|livello medio )/.test(m) ||
    /^giorno \d+: servono \d+ con /.test(m)
  );
}
// TURNO DI NOTTE per l equita: finisce dopo la mezzanotte, alle 2 o piu tardi (ai Tavoli quasi
// tutti i turni sono di tipo NOTTURNO, anche il 14-23:45: il tipo non distingue la notte vera)
function _ricercaTurnoDiNotte(t) {
  if (!t || !t.ora_inizio || !t.ora_fine) return false;
  const i = _pianoOra(String(t.ora_inizio).substring(0, 5));
  const f = _pianoOra(String(t.ora_fine).substring(0, 5));
  return i != null && f != null && f < i && f >= 2;
}
// peso di un insieme di violazioni fra persone (regole e qualita)
function _ricercaPesoGruppi(viol) {
  let c = 0;
  viol.forEach((v) => (c += _ricercaPuntiDi(v.msg)));
  return c;
}
function _ricercaRegolaDiLegge(msg) {
  return /di riposo dopo|giorni lavorativi consecutivi|riposo singolo dopo|lavorate nella settimana|domenica .*lavorata|domenica libera:|riposo di .* ore|preferenza: massimo \d+ a settimana/.test(
    String(msg || ''),
  );
}
// TIPO DI UNA VIOLAZIONE, UNA SOLA DEFINIZIONE per il punteggio della ricerca, i vincoli del
// motore e il controllo finale (v450): oreSotto (ore del mese sotto il minimo), qualita
// (livelli, competenze per fascia), legge_dom (domeniche libere dell anno), legge_riposo
// (riposo di 11 ore), legge_sett (riposo attorno alla domenica), legge_altre (giorni di
// fila, 4+1+1, ore della settimana, giorni a settimana), regola (tutte le altre).
function _ricercaTipoViolazione(msg) {
  const m = String(msg || '');
  if (/ SOTTO il minimo /.test(m)) return 'oreSotto';
  if (_ricercaRegolaDiQualita(m)) return 'qualita';
  if (_ricercaRegolaDiLegge(m)) {
    const o = _ricercaPesoOrdine(m);
    return o >= 2 ? 'legge_dom' : o >= 1.5 ? 'legge_riposo' : o > 1 ? 'legge_sett' : 'legge_altre';
  }
  return 'regola';
}
const RICERCA_TIPI_LEGGE = ['legge_dom', 'legge_riposo', 'legge_sett', 'legge_altre'];
// VINCOLI DI MIGLIORA (motore e controllo finale, la stessa lista): per ogni tipo di regola
// di legge le segnalazioni non aumentano (una domenica libera non si scambia con un riposo di
// 11 ore, ne il contrario); le DOMENICHE LIBERE MANCANTI in tutto non aumentano; le regole
// vere tutte insieme (legge + altre regole) non aumentano. Si conta per tipo e non per
// persona: una violazione puo passare da un collega a un altro, il numero no.
// Prima il controllo finale guardava solo il totale delle leggi e il motore nessuna: il
// migliore della ricerca poteva avere una legge in piu e veniva scartato tutto.
const RICERCA_VINCOLI = RICERCA_TIPI_LEGGE.map((k) => [k]).concat([
  ['legge_dom_mancanti'],
  RICERCA_TIPI_LEGGE.concat(['regola']),
]);
// DOMENICHE LIBERE MANCANTI in una segnalazione (attese - avute; 0 se non e una domenica
// libera): chi e gia indietro e ne perde un altra peggiora. Prima contava solo SE una persona
// era indietro: Migliora toglieva una domenica libera a chi era gia sotto (Andrea Molinari da
// 2 a 1) senza che ne il punteggio ne il controllo finale lo vedessero.
function _ricercaDomMancanti(msg) {
  const m = /domenica libera: (\d+) nell anno su (\d+) attese/.exec(String(msg || ''));
  return m ? Math.max(1, parseInt(m[2], 10) - parseInt(m[1], 10)) : 0;
}
// violazioni contate per tipo: { legge_dom: n, legge_dom_mancanti: domeniche, legge_riposo: n,
// ..., regola: n, qualita: n, oreSotto: n }
function _ricercaContiDi(viol) {
  const c = {};
  (viol || []).forEach((v) => {
    const k = _ricercaTipoViolazione(v.msg);
    c[k] = (c[k] || 0) + 1;
    const dm = _ricercaDomMancanti(v.msg);
    if (dm) c.legge_dom_mancanti = (c.legge_dom_mancanti || 0) + dm;
  });
  return c;
}
// punti di una violazione nel punteggio della ricerca (priorita: legge > riservati > regole >
// scoperti > ore; qualita sotto un posto scoperto)
function _ricercaPuntiDi(msg) {
  const k = _ricercaTipoViolazione(msg);
  if (k === 'oreSotto') return RICERCA_PESI.oreSotto;
  if (k === 'qualita') return RICERCA_PESI.qualita;
  if (k === 'regola') return RICERCA_PESI.regola;
  // le domeniche libere: per ogni domenica mancante
  return RICERCA_PESI.legge * _ricercaPesoOrdine(msg) * Math.max(1, _ricercaDomMancanti(msg));
}
// VINCOLI ROTTI fra due misure ufficiali (_ricercaMisuraUfficiale): [] = il risultato si puo
// usare. Stessi vincoli del motore (RICERCA_VINCOLI) piu posti scoperti, riservati e persone
// oltre il fabbisogno (eccesso: dal motore, { prima, dopo })
function _ricercaVincoliRotti(prima, dopo, eccesso) {
  const rotti = [];
  const somma = (c, g) => g.reduce((t, k) => t + ((c || {})[k] || 0), 0);
  const NOMI = {
    legge_dom: 'persone indietro con le domeniche libere',
    legge_dom_mancanti: 'domeniche libere mancanti',
    legge_riposo: 'riposo minimo fra due turni',
    legge_sett: 'riposo attorno alla domenica',
    legge_altre: 'altre regole di legge',
  };
  RICERCA_VINCOLI.forEach((g) => {
    const a = somma(prima.conti, g);
    const b = somma(dopo.conti, g);
    if (b > a) rotti.push((g.length === 1 ? NOMI[g[0]] || g[0] : 'regole violate in tutto') + ' ' + a + ' → ' + b);
  });
  if (dopo.scoperti > prima.scoperti) rotti.push('posti scoperti ' + prima.scoperti + ' → ' + dopo.scoperti);
  if (dopo.riservati > prima.riservati) rotti.push('posti riservati ' + prima.riservati + ' → ' + dopo.riservati);
  if (eccesso && eccesso.dopo > eccesso.prima) rotti.push('doppioni ' + eccesso.prima + ' → ' + eccesso.dopo);
  return rotti;
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
  const _ammessiMemo = {};
  const ammessi = (n, d) => {
    const km = n + '|' + d;
    if (_ammessiMemo[km]) return _ammessiMemo[km].slice();
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
    _ammessiMemo[km] = out;
    return out.slice();
  };
  // POSTI RISERVATI: un turno del fabbisogno che possono fare solo persone che lo hanno fra i
  // turni PRINCIPALI della loro funzione (stesso criterio della bozza, postoRiservato)
  const tipoPrincipale = (n, c) =>
    (_pianoMappFunzione((_pianoCollabInfo(n) || {}).funzione) || []).some(
      (v) => v.turno_codice === c && v.tipo === 'PRINCIPALE',
    );
  const riservati = {};
  Object.keys(fabbisogno).forEach((d) =>
    Object.keys(fabbisogno[d]).forEach((c) => {
      if (!(fabbisogno[d][c] > 0)) return;
      const chi = nomi.filter((n) => (stato[n] || {})[d] === c || ammessi(n, d).includes(c));
      if (chi.length && chi.every((n) => tipoPrincipale(n, c))) (riservati[d] = riservati[d] || {})[c] = true;
    }),
  );
  // EQUITA DELLE NOTTI: 1 turno di notte, 0 turno di giorno, null altro (riposo, assenze, altri
  // settori, l allievo in formazione); gruppo = funzione, solo chi puo fare turni di notte
  const tipoNotte = (c) => {
    if (!c || c[0] === '#' || c[0] === '~') return null;
    const t = turnoInfoDi[c];
    if (!t) return null;
    return _ricercaTurnoDiNotte(t) ? 1 : 0;
  };
  const gruppoEquita = (n) => {
    const info = _pianoCollabInfo(n) || {};
    if (_pianoCoperturaCfg(info)) return null;
    if (!giorniAperti.some((d) => ammessi(n, d).some((c) => tipoNotte(c) === 1))) return null;
    return String(info.funzione || '-').toUpperCase();
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
  // costo della persona e violazioni per tipo (stessi tipi del controllo finale)
  const valutaPersona = (n, mappa) => {
    const mese = righePersona(n, mappa);
    const viol = _pianoViolazioniPersona(n, mese, mese.concat(bordoDi[n] || []), ctx);
    let costo = 0;
    viol.forEach((v) => (costo += _ricercaPuntiDi(v.msg)));
    if (obiettivo[n] != null) {
      const infoO = _pianoCollabInfo(n) || {};
      const pct = parseFloat(infoO.percentuale) || 1;
      const ore = mese.reduce((t, r) => t + (_pianoOreDiRiga(r, pct) || 0), 0);
      const scarto = ore - obiettivo[n];
      // i fissi devono raggiungere le ore (sotto pesa il doppio); i jolly coprono i
      // buchi: costa solo andare oltre l 80% (decisione del titolare 08/10/2026)
      costo += RICERCA_PESI.oraObiettivo * (infoO.is_jolly ? Math.max(0, scarto) : scarto < 0 ? -2 * scarto : scarto);
    }
    return { costo: costo, conti: _ricercaContiDi(viol) };
  };
  const costoPersona = (n, mappa) => valutaPersona(n, mappa).costo;
  // REGOLE FRA PERSONE nel giorno (accompagnamento, limiti per gruppo): solo se il
  // settore ne ha; quelle sul mese intero le controlla la verifica finale
  const conGruppi = (pianoRegoleGruppoCache || []).some(
    (r) => r.attivo !== false && (r.reparto_dip || 'slots') === rep,
  );
  const estranei = _pianoRighe.filter((r) => !nomiSet.has(r.collaboratore));
  const valutaGiorno = conGruppi
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
        const viol = _pianoViolazioniGruppi(righe, ctx).filter((v) => v.giorno === g);
        return { costo: _ricercaPesoGruppi(viol), conti: _ricercaContiDi(viol) };
      }
    : null;
  const costoGiorno = valutaGiorno ? (d, perNome) => valutaGiorno(d, perNome).costo : null;
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
  const valutaMese = conGruppiMese
    ? (statoTutto) => {
        const righe = estranei.slice();
        nomi.forEach((n) => righePersona(n, statoTutto[n]).forEach((r) => righe.push(r)));
        const viol = _pianoViolazioniGruppi(righe, ctx).filter((v) => v.giorno === 0);
        return { costo: _ricercaPesoGruppi(viol), conti: _ricercaContiDi(viol) };
      }
    : null;
  const costoMese = valutaMese ? (st) => valutaMese(st).costo : null;
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
    // le regole con i conti per tipo ({ costo, conti }): le usa Migliora (pianoRicercaCalcola)
    // per i vincoli del motore; il problema resta con i soli costi (formazioni)
    valuta: opz.soloPeggioramenti ? null : { persona: valutaPersona, giorno: valutaGiorno, mese: valutaMese },
    // posti riservati: li usa pianoRicercaCalcola (vincolo di Migliora), non le formazioni
    riservati: riservati,
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
      tipoNotte: tipoNotte,
      gruppoEquita: gruppoEquita,
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

// posti RISERVATI scoperti (riservati = { dstr: { codice: true } })
function _ricercaScopertiRiservati(righe, fabbisogno, riservati) {
  if (!riservati) return 0;
  const cnt = {};
  righe.forEach((r) => {
    if (!_pianoCopreQui(r)) return;
    const k = String(r.data).substring(0, 10) + '|' + r.codice;
    cnt[k] = (cnt[k] || 0) + 1;
  });
  let s = 0;
  Object.keys(riservati).forEach((d) =>
    Object.keys(riservati[d]).forEach(
      (c) => (s += Math.max(0, ((fabbisogno[d] || {})[c] || 0) - (cnt[d + '|' + c] || 0))),
    ),
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
function _ricercaMisuraUfficiale(righe, fabbOriginale, riservati) {
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
    // conti per tipo: la stessa definizione dei vincoli del motore (_ricercaTipoViolazione)
    const conti = _ricercaContiDi(v.lista);
    const sotto = conti.oreSotto || 0;
    return {
      violazioni: v.lista.length,
      conti: conti,
      // regole di legge violate (quante segnalazioni, come in Controlla le regole)
      legge: v.lista.filter((x) => _ricercaRegolaDiLegge(x.msg)).length,
      // regole di qualita (livelli, competenze per fascia): contano in regole, peso proprio
      qualita: conti.qualita || 0,
      riservati: _ricercaScopertiRiservati(righe, fabbOriginale, riservati),
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
// opz.variante: 0 (predefinita) = il seme del mese e del settore; 1, 2... = altri semi per
// "riprova con un altro seme" (stesso input e stessa variante = stesso risultato).
// opz.seme: seme esplicito (test). opz.iterazioni: numero di iterazioni (senza: dai secondi).
async function pianoRicercaCalcola(secondi, onPasso, opz) {
  opz = opz || {};
  const prep = await _ricercaPrepara(opz.prepara);
  prep.problema.riservati = prep.riservati;
  // REGOLE CON I CONTI PER TIPO: il motore tiene come migliore solo i piani che rispettano
  // gli stessi vincoli del controllo finale (RICERCA_VINCOLI), cosi il migliore trovato e
  // anche applicabile
  if (prep.valuta) {
    prep.problema.costoPersona = prep.valuta.persona;
    prep.problema.costoGiorno = prep.valuta.giorno;
    prep.problema.costoMese = prep.valuta.mese;
  }
  // metro diverso per le persone (es. correzioni dopo l import: solo riposi e giorni
  // di fila): opz.costoPersona(prep) -> (nome, mappa) => costo; i gruppi non contano
  if (typeof opz.costoPersona === 'function') {
    const base = prep.problema.costoPersona;
    const extra = opz.costoPersona(prep);
    // il metro richiesto pesa di piu, le regole di sempre restano (non si peggiorano)
    prep.problema.costoPersona = (n, mappa) => {
      const b = base(n, mappa);
      return b && typeof b === 'object' ? { costo: extra(n, mappa) + b.costo, conti: b.conti } : extra(n, mappa) + b;
    };
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
  const prima = _ricercaMisuraUfficiale(_pianoRighe, fabbOriginale, prep.riservati);
  // SEME FISSO per mese e settore (prima Date.now(): due Migliora sullo stesso piano davano
  // risultati diversi). La variante cambia il seme (riprova).
  const variante = parseInt(opz.variante) || 0;
  const seme = opz.seme != null ? opz.seme : PianoRicerca.semeRicerca(prep.ym, prep.reparto, variante);
  const pn = parseFloat(_pianoRegolaVal('equita_notti_peso'));
  const motore = PianoRicerca.crea(
    prep.problema,
    Object.assign(
      {
        pesoScoperto: RICERCA_PESI.scoperto,
        pesoRiservato: RICERCA_PESI.riservato,
        pesoNotti: pn >= 0 ? pn : RICERCA_PESI.notti,
        vincoli: RICERCA_VINCOLI,
        pesoSforo: RICERCA_PESI.sforo,
        // sforo che cresce in linea retta e, dal 30% della ricerca, ritorno al migliore ammesso
        // se lo stato corrente e fuori dai vincoli (Slots novembre 2026, stessa bozza e seme:
        // 15 scoperti contro 17 con lo sforo pieno da subito, 19 in quadrato, 36 senza sforo)
        sforoCurva: 'lineare',
        tornaAlMigliore: 0.3,
        seme: seme,
      },
      opz.motore || {},
    ),
  );
  // ITERAZIONI, non secondi: stesso numero di passi = stesso risultato (ripetibile)
  const totIter = Math.max(1, opz.iterazioni || Math.round((Math.max(1, secondi) / 60) * RICERCA_ITER_MINUTO));
  const msFreno = Math.max(1, secondi) * 1000 * RICERCA_TEMPO_FRENO;
  const FETTA = 25; // ~30 ms: la pagina resta usabile
  const inizio = Date.now();
  let fatte = 0;
  let troncata = false;
  window._ricercaFerma = false;
  while (fatte < totIter && !window._ricercaFerma) {
    if (Date.now() - inizio > msFreno) {
      troncata = true;
      break;
    }
    const n = Math.min(FETTA, totIter - fatte);
    const m = motore.passo(0, fatte / totIter, n);
    fatte += n;
    if (onPasso) onPasso({ frazione: fatte / totIter, scoperti: m.scoperti, punteggio: m.punteggio });
    await new Promise((x) => setTimeout(x, 0));
  }
  const fermata = !!window._ricercaFerma;
  const ris = motore.risultato();
  const righeDopo = _ricercaRigheDa(prep, ris.stato);
  const dopo = _ricercaMisuraUfficiale(righeDopo, fabbOriginale, prep.riservati);
  // si usa solo se non rompe nessun vincolo (gli stessi del motore: nessun tipo di regola di
  // legge aumenta, le regole vere in tutto nemmeno, posti scoperti, riservati e doppioni
  // non aumentano) e qualcosa migliora; le regole di qualita hanno il loro peso nel
  // punteggio (possono cedere a un posto coperto)
  const eccesso = { prima: ris.prima.eccesso || 0, dopo: ris.dopo.eccesso || 0 };
  const motivi = _ricercaVincoliRotti(prima, dopo, eccesso);
  const migliore =
    !motivi.length &&
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
    eccesso: eccesso,
    notti: { prima: ris.prima.notti || 0, dopo: ris.dopo.notti || 0 },
    migliore: migliore,
    // vincoli rotti dal risultato (vuoto se applicabile): il motore restituisce solo piani
    // ammessi, quindi qui resta qualcosa solo se il conteggio ufficiale vede altro
    motivi: motivi,
    seme: seme,
    variante: variante,
    // ripetibile: lavoro completo (non fermato, non frenato dal tempo)
    ripetibile: !troncata && !fermata,
    troncata: troncata,
  };
}

// ---------------------------------------------------------------- bottone
// MIGLIORA LA BOZZA: si sceglie il tempo, la ricerca lavora (la pagina resta
// usabile, si puo fermare), poi si vede prima/dopo controllato con "Valida
// regole" e si decide se applicare. Si puo annullare con Annulla del piano.
// opz.variante: seme diverso (vedi pianoMiglioraRiprova); senza, il seme del mese e settore
// opz.minuti: durata gia scelta (riprova): non si richiede
async function pianoMigliora(opz) {
  opz = opz && typeof opz === 'object' ? opz : {};
  if (!_pianoAzioneAutoConsentita('genera')) return;
  if (!puoGestirePiano()) return;
  let minuti = parseInt(opz.minuti) || 0;
  if (!minuti) {
    // il tempo e indicativo: la ricerca conta le prove (RICERCA_ITER_MINUTO), non i secondi
    const scelta = await chiediModulo(
      'Il programma prova scambi e spostamenti fra le celle della bozza di ' +
        _pianoMeseSel +
        ' e tiene solo quelli che migliorano: prima le regole (riposi, giorni di fila, ore della settimana, domeniche), poi i posti scoperti, poi le ore di ognuno.\n\nNon tocca vacanze, malattie, celle protette o bloccate, inserimenti a mano, giorni chiusi. Più tempo ha, più combinazioni prova.\n\nIl tempo è indicativo: il programma fa sempre lo stesso numero di prove, così lo stesso piano dà sempre lo stesso risultato. Su un computer lento ci mette di più (al massimo il doppio, poi si ferma).',
      [
        {
          titolo: 'Tempo a disposizione',
          campi: [
            {
              id: 'min',
              tipo: 'scelta',
              valore: '3',
              opzioni: [
                { valore: '1', etichetta: 'circa 1 minuto' },
                { valore: '3', etichetta: 'circa 3 minuti (consigliato)' },
                { valore: '5', etichetta: 'circa 5 minuti' },
                { valore: '10', etichetta: 'circa 10 minuti' },
              ],
            },
          ],
        },
      ],
      { titolo: 'Migliora la bozza', ok: 'Avvia' },
    );
    if (!scelta) return;
    minuti = parseInt(scelta.min) || 3;
  }
  _ricercaUltimiMinuti[_pianoMeseSel + '|' + _pianoReparto()] = minuti;
  const secondi = minuti * 60;
  // finestra di avanzamento con Ferma
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:460px"><h3>Migliora la bozza' +
    (opz.variante ? ' · tentativo ' + (opz.variante + 1) : '') +
    '</h3>' +
    '<div class="finestra-testo" id="ric-testo">Preparo i dati del mese...</div>' +
    '<div style="height:8px;background:var(--line,#ddd);border-radius:4px;overflow:hidden;margin:10px 0"><div id="ric-barra" style="height:100%;width:0;background:var(--accent2,#1a4a7a);transition:width .3s"></div></div>' +
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no" onclick="window._ricercaFerma=true;this.disabled=true;this.textContent=\'Mi fermo...\'">Ferma e mostra il risultato</button></div></div>';
  document.body.appendChild(velo);
  const testo = document.getElementById('ric-testo');
  const barra = document.getElementById('ric-barra');
  let res;
  try {
    const t0 = Date.now();
    res = await pianoRicercaCalcola(
      secondi,
      (x) => {
        const pass = Math.round((Date.now() - t0) / 1000);
        barra.style.width = Math.round(x.frazione * 100) + '%';
        testo.textContent =
          'Sto cercando: ' +
          Math.round(x.frazione * 100) +
          '% (' +
          pass +
          ' secondi). Posti scoperti in questo momento: ' +
          x.scoperti +
          '.';
      },
      { variante: opz.variante || 0 },
    );
  } catch (e) {
    velo.remove();
    toastErrore('Ricerca non riuscita: ' + (e.message || e));
    return;
  }
  velo.remove();
  const P = res.prima;
  const D = res.dopo;
  const riga = (et, a, b) => '\n• ' + et + ': ' + a + ' → ' + b;
  // equita delle notti: stesso valore che legge pianoRicercaCalcola (equita_notti_peso)
  const pesoNotti = parseFloat(_pianoRegolaVal('equita_notti_peso'));
  const nottiAccese = !(pesoNotti >= 0) || pesoNotti > 0;
  // perche la ricerca non e arrivata in fondo, in parole semplici
  const fermataDaTe = !res.ripetibile && !res.troncata;
  const riepilogo =
    'Risultato controllato con "Controlla le regole":' +
    riga('Regole di legge violate (riposi, giorni di fila, ore della settimana, domenica)', P.legge, D.legge) +
    riga('Altre regole violate', P.regole - P.legge - P.qualita, D.regole - D.legge - D.qualita) +
    riga('Regole di qualità (livelli, competenze per fascia)', P.qualita, D.qualita) +
    riga('Posti del fabbisogno scoperti', P.scoperti, D.scoperti) +
    riga('di cui posti riservati (es. Supervisor)', P.riservati, D.riservati) +
    riga('Persone sotto il minimo di ore', P.oreSotto, D.oreSotto) +
    riga('Turni oltre il fabbisogno (doppioni)', res.eccesso.prima, res.eccesso.dopo) +
    (nottiAccese
      ? riga('Squilibrio delle notti fra colleghi (più basso è meglio)', res.notti.prima, res.notti.dopo)
      : '\n• Divisione delle notti: non considerata (impostazione nelle Regole a 0)') +
    '\n• Celle cambiate: ' +
    res.cambi.length +
    (res.variante ? ' (tentativo ' + (res.variante + 1) + ')' : '') +
    (res.troncata
      ? '\n\nIl computer è stato più lento del previsto: la ricerca si è fermata al limite di tempo (il doppio di quello scelto) prima di finire tutte le prove. Rifacendola il risultato può cambiare.'
      : fermataDaTe
        ? '\n\nHai fermato la ricerca prima della fine: rifacendola il risultato può cambiare.'
        : '');
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
      ' · seme ' +
      res.seme +
      (res.migliore ? '' : ' · non applicabile'),
  );
  const RIPROVA = { valore: 'riprova', testo: 'Riprova con un altro tentativo' };
  const titoloEsito = 'Migliora la bozza' + (res.variante ? ' · tentativo ' + (res.variante + 1) : '');
  if (!res.migliore || !res.cambi.length) {
    const esito = await _ricercaFinestraEsito(
      titoloEsito,
      riepilogo +
        "\n\nNessun miglioramento sicuro: il piano resta com'è. (Si applica solo se nessuna regola peggiora e i posti scoperti non aumentano" +
        (res.motivi && res.motivi.length ? '; qui: ' + res.motivi.join(', ') : '') +
        '.) Un altro tentativo parte da combinazioni diverse e può trovare di meglio.',
      [{ valore: 'chiudi', testo: 'Ho capito', annulla: true }, Object.assign({ primario: true }, RIPROVA)],
    );
    if (esito === 'riprova') return pianoMiglioraRiprova();
    return;
  }
  const esito = await _ricercaFinestraEsito(
    titoloEsito,
    riepilogo +
      "\n\nVacanze, malattie, celle protette e inserimenti a mano non sono stati toccati. Applico? Si può annullare con Annulla del piano. Con un altro tentativo il piano resta com'è e la ricerca riparte da combinazioni diverse.",
    [
      { valore: 'lascia', testo: "Lascia com'è", annulla: true },
      RIPROVA,
      { valore: 'applica', testo: 'Applica', primario: true },
    ],
  );
  if (esito === 'riprova') return pianoMiglioraRiprova();
  if (esito !== 'applica') return;
  await _ricercaScrivi(res);
}

// FINESTRA DEL RISULTATO con piu di due pulsanti (Lascia, Riprova, Applica): stesso aspetto
// delle finestre del programma (finestre.js). pulsanti: [{ valore, testo, primario, annulla }];
// Esc sceglie quello con annulla, Invio quello primario. Ritorna il valore scelto.
function _ricercaFinestraEsito(titolo, testo, pulsanti) {
  return new Promise((risolvi) => {
    const velo = document.createElement('div');
    velo.className = 'finestra-velo';
    const box = document.createElement('div');
    box.className = 'finestra-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'ric-esito-titolo');
    box.style.width = 'min(560px, 100%)';
    const h = document.createElement('h3');
    h.id = 'ric-esito-titolo';
    h.textContent = titolo;
    const t = document.createElement('div');
    t.className = 'finestra-testo';
    t.textContent = testo;
    const puls = document.createElement('div');
    puls.className = 'finestra-pulsanti';
    puls.style.flexWrap = 'wrap';
    box.appendChild(h);
    box.appendChild(t);
    box.appendChild(puls);
    velo.appendChild(box);
    const primaFocus = document.activeElement;
    const chiudi = (v) => {
      document.removeEventListener('keydown', tasti, true);
      velo.remove();
      try {
        if (primaFocus && primaFocus.focus) primaFocus.focus();
      } catch (e) {}
      risolvi(v);
    };
    let bPrimario = null;
    pulsanti.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = p.primario ? 'finestra-ok' : 'finestra-no';
      b.textContent = p.testo;
      b.addEventListener('click', () => chiudi(p.valore));
      puls.appendChild(b);
      if (p.primario) bPrimario = b;
    });
    const annulla = (pulsanti.find((p) => p.annulla) || {}).valore || null;
    const tasti = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        chiudi(annulla);
      } else if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'BUTTON') {
        e.preventDefault();
        e.stopPropagation();
        if (bPrimario) bPrimario.click();
      } else if (e.key === 'Tab') {
        const el = [...velo.querySelectorAll('button')];
        const i = el.indexOf(document.activeElement);
        e.preventDefault();
        el[(i + (e.shiftKey ? -1 : 1) + el.length) % el.length].focus();
      }
    };
    document.addEventListener('keydown', tasti, true);
    document.body.appendChild(velo);
    (bPrimario || puls.querySelector('button')).focus();
  });
}

// RIPROVA CON UN ALTRO SEME: stesso mese e settore, variante successiva (0, 1, 2...). Il
// pulsante "Riprova con un altro tentativo" accanto a Migliora chiama questa funzione.
const _ricercaVarianti = {}; // 'ym|settore' -> ultima variante usata
const _ricercaUltimiMinuti = {}; // 'ym|settore' -> durata scelta l ultima volta (riprova non la richiede)
async function pianoMiglioraRiprova() {
  const k = _pianoMeseSel + '|' + _pianoReparto();
  _ricercaVarianti[k] = (_ricercaVarianti[k] || 0) + 1;
  return pianoMigliora({ variante: _ricercaVarianti[k], minuti: _ricercaUltimiMinuti[k] });
}

// SCRIVE LE CELLE CAMBIATE (solo celle generate o vuote), con la fotografia per Annulla.
// Dalla v450 passa da _pianoScriviCelle (piano_scrivi_celle, migrazione 20260912): UNA
// transazione, tutto o niente, e ogni cella si scrive solo se e ancora come la ricerca l ha
// letta (sigla, protetto, blocco, generata, nota; vuota per le celle nuove). Prima tre
// giri di scritture separate (cancella, modifica, inserisci): un errore a meta lasciava il
// piano mezzo cambiato. Se un collega ha cambiato qualche cella mentre la ricerca lavorava
// non si scrive niente e si avvisa con chi e cosa: si sceglie se applicare gli altri cambi
// (le sue celle restano come le ha scritte) o lasciare tutto; la generazione automatica
// applica gli altri e le elenca (res.saltate), come prima.
// Ritorna true se ha scritto (anche in parte), false se niente.
async function _ricercaScrivi(res) {
  const prep = res.prep;
  const op = getOperatore();
  const ora = new Date().toISOString();
  const auto = !!window._pianoAutoInCorso;
  const ops = [];
  res.cambi.forEach((c) => {
    const r = (prep.righeDi[c.nome + '|' + c.data] || [])[0];
    const cod = c.dopo || (prep.conRiempimento ? 'C' : '');
    if (r) {
      if (cod === r.codice) return;
      ops.push({
        collaboratore: c.nome,
        data: c.data,
        // la cella come l ha letta la ricerca: si scrive solo se e ancora cosi
        atteso: Object.assign(_pianoAttesoDi(r), { generato: !!r.generato, commento: r.commento || null }),
        dati: cod ? { codice: cod, operatore: op, updated_at: ora } : null,
      });
    } else if (cod)
      ops.push({
        collaboratore: c.nome,
        data: c.data,
        atteso: null, // vuota quando la ricerca l ha letta
        dati: {
          codice: cod,
          protetto: false,
          generato: true,
          reparto_dip: prep.reparto,
          operatore: op,
          updated_at: ora,
        },
      });
  });
  res.saltate = [];
  if (!ops.length) return false;
  const passo = _pianoUndoSnap('migliora bozza ' + prep.ym);
  const chiave = (x) => x.collaboratore + '|' + String(x.data).substring(0, 10);
  let scritte = 0;
  const fatte = []; // operazioni scritte davvero
  let lasciaTutto = false;
  try {
    // al massimo 2500 celle per transazione (il database ne accetta 3000)
    for (let i = 0; i < ops.length && !lasciaTutto; i += 2500) {
      let blocco = ops.slice(i, i + 2500);
      for (let giro = 0; blocco.length && giro < 4; giro++) {
        const es = await _pianoScriviCelle(blocco);
        if (es.ok) {
          scritte += blocco.length;
          blocco.forEach((o) => fatte.push(o));
          blocco = [];
          break;
        }
        const conf = es.conflitti || [];
        const via = new Set(conf.map(chiave));
        if (!via.size) throw _pianoErroreConflitto(conf);
        conf.forEach((c) => res.saltate.push({ nome: c.collaboratore, data: String(c.data).substring(0, 10) }));
        const applica =
          auto ||
          (await chiediConferma(
            'Mentre la ricerca lavorava un collega ha cambiato ' +
              (conf.length === 1 ? '1 cella' : conf.length + ' celle') +
              ' che Migliora voleva modificare:\n\n• ' +
              conf.slice(0, 12).map(_pianoConflittoTesto).join('\n• ') +
              (conf.length > 12 ? '\n... e altre ' + (conf.length - 12) : '') +
              '\n\nNon ho scritto niente. Conferma = applico gli altri cambi e le sue celle restano come le ha scritte (poi conviene ricontrollare le regole). Annulla = lascio il piano com era (puoi rifare Migliora).',
            { titolo: 'Piano cambiato da un collega' },
          ));
        if (!applica) {
          lasciaTutto = true;
          blocco = [];
          break;
        }
        blocco = blocco.filter((o) => !via.has(chiave(o)));
      }
      if (blocco.length) throw new Error('celle cambiate di continuo da un collega: riprova fra poco');
    }
  } catch (e) {
    if (!scritte) _pianoUndoScarta(passo);
    if (auto) throw e;
    _pianoErroreScrittura(
      scritte ? 'Scrittura interrotta (con Annulla del piano si torna a prima): ' : 'Bozza NON migliorata: ',
      e,
    );
    await renderPiano();
    return scritte > 0;
  }
  if (!scritte) {
    _pianoUndoScarta(passo);
    await renderPiano();
    return false;
  }
  const n = { cambiate: 0, nuove: 0, tolte: 0 };
  fatte.forEach((o) => (o.atteso === null ? n.nuove++ : o.dati === null ? n.tolte++ : n.cambiate++));
  const saltate = res.saltate;
  logAzione(
    'Piano: bozza migliorata',
    prep.ym +
      ' ' +
      prep.reparto +
      ' · ' +
      scritte +
      ' celle (' +
      n.cambiate +
      ' cambiate, ' +
      n.nuove +
      ' nuove, ' +
      n.tolte +
      ' tolte' +
      (saltate.length ? ', ' + saltate.length + ' lasciate perché modificate nel frattempo' : '') +
      ')',
  );
  if (!auto)
    toast(
      'Bozza migliorata: ' +
        scritte +
        ' celle' +
        (saltate.length ? ' · ' + saltate.length + ' lasciate come sono perché modificate a mano nel frattempo' : ''),
    );
  _pianoViolCelle = {};
  _pianoViolLista = null;
  await renderPiano();
  return true;
}
