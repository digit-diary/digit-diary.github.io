/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: piano-benessere.js
 * PIANO · benessere dei collaboratori: UN SOLO calcolo per la scheda Benessere e per ogni altro
 * punto che lo mostra. Parte pura (PianoBenessere: misura, profilo, confronto, valuta), provata
 * in test/benessere.test.js; parte del browser (pianoBenessereCalcola) che legge piano e regole.
 *
 * COME RAGIONA (v457, richiesta del titolare 15/10/2026)
 * Il benessere non giudica la persona e non giudica le sue scelte: guarda se il carico che il
 * piano le da e sostenibile, confrontandolo con quello che LEI ha scelto (solo notti, solo
 * diurni, giorni fissi, giorni a settimana, turni bloccati, turni scritti a mano) e con quello che
 * fanno i colleghi alla stessa percentuale di impiego (i conteggi dipendono da quanto si lavora)
 * e con quello che fanno i colleghi con la stessa funzione e la stessa categoria (fissi con
 * fissi, ausiliari con ausiliari).
 *  - LIMITI DI LEGGE E DI SALUTE, validi per tutti anche se scelti: rientri sotto le ore minime
 *    di riposo, giorni di fila oltre il massimo, troppe notti di fila, poco recupero dopo un
 *    blocco di notti, domeniche libere dell anno arretrate. Per chi ha scelto il testo e neutro.
 *  - EQUILIBRIO RISPETTO AI COLLEGHI, solo se NON viene da una scelta: quota di notti, weekend
 *    lavorati, riposi isolati di un giorno. Per una scelta: al massimo una nota informativa.
 *  - INFORMAZIONI, mai un allarme: turni del mattino, malattie.
 * Ogni segnalazione porta il perche in una riga. Nessun punteggio inventato: lo stato e il
 * livello piu alto fra le voci (buono, da tenere d occhio, critico); le note non cambiano lo stato.
 * SCELTE NEL TEMPO: ogni parte del periodo si giudica con le scelte valide allora (storico in
 * js/piano-scelte.js): le notti di agosto non sono un anomalia se "solo diurni" e di novembre.
 * Sostituisce PianoRegole.indiceBenessere (0-100 con pesi fissi, che dava "critico" a tutto un
 * settore che lavora di sera e contava sull anno soglie pensate per un mese).
 */
(function (root) {
  'use strict';

  // Valori predefiniti. Le soglie del gruppo Benessere si cambiano per settore in Piano ›
  // Regole; quelle di legge vengono dalle regole di legge (uguali per tutti i settori).
  const PREDEFINITI = {
    minRiposo: 11, // min_riposo_ore (LL art. 15a)
    maxConsecutivi: 5, // max_consecutivi (LL art. 21)
    domenicheAnno: 12, // domeniche_libere_anno (OLL2 art. 24)
    notteInizio: 23, // notte_inizio: fascia notturna di legge
    notteFine: 6, // notte_fine
    notteOreMin: 3, // "notte" = almeno 3 ore nella fascia notturna (definizione della dir. UE 2003/88)
    nottiFila: 5, // benessere_notti_fila
    bloccoNotti: 3, // benessere_blocco_notti
    recuperoOre: 46, // benessere_recupero_notti_ore: due sonni pieni dopo un blocco di notti
    nottiScarto: 20, // benessere_notti_scarto (punti %)
    weekendScarto: 20, // benessere_weekend_scarto (punti %)
    isolatiMese: 3, // benessere_isolati_mese (ogni 4 settimane)
    rientriCritico: 3, // benessere_rientri_critico
  };
  const ORDINE = { critico: 3, attenzione: 2, nota: 1, ok: 0 };
  const ETICHETTA = { critico: 'critico', attenzione: "da tenere d'occhio", nota: 'buono', ok: 'buono' };
  const GIORNI_N = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  const num = (v, d) => {
    const x = parseFloat(v);
    return isNaN(x) ? d : x;
  };
  const pct = (x) => Math.round((x || 0) * 100);
  const dec = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  const dataBreve = (iso) => parseInt(String(iso).substring(8, 10)) + '.' + String(iso).substring(5, 7);
  const elencoDate = (lista, max) => {
    const k = max || 3;
    return (
      lista
        .slice(0, k)
        .map((x) => dataBreve(x.data))
        .join(', ') + (lista.length > k ? '…' : '')
    );
  };
  const piu = (iso, n) => {
    const d = new Date(String(iso).substring(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return (
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    );
  };

  // ore di lavoro notturno nella fascia di legge. int: { ini, fin } in ore dalla mezzanotte del
  // giorno del turno (fin oltre 24 se passa la mezzanotte: 20-05 = { ini: 20, fin: 29 })
  function oreNotturne(int, inizio, fine) {
    if (!int) return 0;
    const ini = num(inizio, 23);
    const fin = num(fine, 6);
    const durata = (fin <= ini ? fin + 24 : fin) - ini;
    let ore = 0;
    // finestre notturne che possono toccare il turno: della sera prima, del giorno, del dopo
    for (let k = -1; k <= 1; k++) {
      const a = k * 24 + ini;
      ore += Math.max(0, Math.min(a + durata, int.fin) - Math.max(a, int.ini));
    }
    return Math.round(ore * 100) / 100;
  }

  // ===== MISURA: i fatti del periodo, dal piano della persona =====
  // giorni: giorni di calendario CONSECUTIVI, anche prima e dopo il periodo (serie, notti di
  // fila e rientri a cavallo; recupero dopo l ultima notte), ognuno:
  //   { data:'AAAA-MM-GG', dow:0-6, stato:'lavoro'|'riposo'|'assenza'|'ignoto',
  //     assenza:'V'|'M'|null, sceltoNd:bool (riposo chiesto: ND), int:{ini,fin}|null (ore
  //     assolute, come _pianoIntervalloLavoro), notte:bool, presto:bool,
  //     domenica:'libera'|'lavoro'|'esclusa'|'non_valida'|'sabato_tardi'|null }
  // opz: { da, a } periodo (compresi), oggi (le domeniche future senza piano contano come ancora
  // disponibili per il minimo dell anno) piu le soglie (minRiposo, recuperoOre, bloccoNotti)
  function misura(giorni, opz) {
    const o = Object.assign({}, PREDEFINITI, opz || {});
    const g = giorni || [];
    const da = o.da || (g[0] && g[0].data) || '';
    const a = o.a || (g.length && g[g.length - 1].data) || '';
    const dentro = (d) => d.data >= da && d.data <= a;
    const m = {
      da: da,
      a: a,
      giorni: 0,
      lavorati: 0,
      notti: 0,
      presti: 0,
      serieMax: 0,
      nottiFilaMax: 0,
      rientri: [],
      recuperiBrevi: [],
      blocchiNotti: 0,
      isolati: 0,
      isolatiNd: 0,
      weLav: 0,
      weTot: 0,
      domLib: 0,
      domTot: 0,
      domLav: 0,
      domTardi: 0,
      domAssenza: 0,
      domFuture: 0,
      vac: 0,
      mal: 0,
    };
    let serie = 0;
    let fila = 0;
    for (let i = 0; i < g.length; i++) {
      const d = g[i];
      const lav = d.stato === 'lavoro';
      serie = lav ? serie + 1 : 0;
      fila = lav && d.notte ? fila + 1 : 0;
      if (!dentro(d)) continue;
      if (d.stato !== 'ignoto') m.giorni++;
      const p = g[i - 1];
      const s = g[i + 1];
      if (lav) {
        m.lavorati++;
        if (d.notte) m.notti++;
        if (d.presto) m.presti++;
        if (serie > m.serieMax) m.serieMax = serie;
        if (fila > m.nottiFilaMax) m.nottiFilaMax = fila;
        // rientro breve: riposo fra la fine del turno di ieri e l inizio di quello di oggi
        if (p && p.stato === 'lavoro' && p.int && d.int) {
          const ore = d.int.ini - p.int.fin;
          if (ore < o.minRiposo) m.rientri.push({ data: d.data, ore: Math.round(ore * 10) / 10 });
        }
        // fine di un blocco di notti seguito da almeno un giorno libero: quante ore libere prima
        // di ricominciare? (se il giorno dopo si lavora ancora la serie continua: lo guardano
        // i giorni di fila e il riposo fra i turni)
        if (d.notte && fila >= o.bloccoNotti && s && s.stato !== 'lavoro') {
          m.blocchiNotti++;
          for (let k = i + 1; k < g.length && k <= i + 4; k++) {
            const x = g[k];
            if (x.stato === 'ignoto' || x.stato === 'assenza') break;
            if (x.stato !== 'lavoro') continue;
            if (x.int && d.int && x.int.ini - d.int.fin < o.recuperoOre)
              m.recuperiBrevi.push({ data: d.data, ore: Math.round(x.int.ini - d.int.fin) });
            break;
          }
        }
      } else if (d.stato === 'assenza') {
        if (d.assenza === 'V') m.vac++;
        else if (d.assenza === 'M') m.mal++;
      } else if (d.stato === 'riposo' && p && s && p.stato === 'lavoro' && s.stato === 'lavoro') {
        // riposo di un giorno solo fra due giorni di lavoro; se e un ND l ha chiesto la persona
        if (d.sceltoNd) m.isolatiNd++;
        else m.isolati++;
      }
      // fine settimana: il sabato con la domenica dopo (conta lavorato se lavora uno dei due)
      if (d.dow === 6 && s && dentro(s)) {
        if (d.stato !== 'ignoto' && s.stato !== 'ignoto' && !(d.stato === 'assenza' && s.stato === 'assenza')) {
          m.weTot++;
          if (lav || s.stato === 'lavoro') m.weLav++;
        }
      }
      // domenica futura ancora senza piano: puo ancora diventare libera
      if (d.dow === 0 && d.stato === 'ignoto' && o.oggi && d.data > o.oggi) m.domFuture++;
      if (d.dow === 0 && d.stato !== 'ignoto') {
        if (d.domenica === 'esclusa' || d.stato === 'assenza') m.domAssenza++;
        else {
          m.domTot++;
          if (lav) m.domLav++;
          else if (d.domenica === 'libera' || d.domenica == null) m.domLib++;
          else m.domTardi++;
        }
      }
    }
    m.quotaNotti = m.lavorati ? m.notti / m.lavorati : 0;
    m.quotaWeekend = m.weTot ? m.weLav / m.weTot : 0;
    return m;
  }

  // FASCE DI PERCENTUALE per il confronto a parita di impiego: fino al 55% (meta tempo),
  // 56-75%, 76-90%, oltre il 90% (tempo pieno)
  function fasciaPct(x) {
    const v = num(x, 1) || 1;
    return v <= 0.55 ? 1 : v <= 0.75 ? 2 : v <= 0.9 ? 3 : 4;
  }
  // "al 50%" o "al 60-70%" dalle percentuali dei colleghi del confronto
  function etichettaPct(lista) {
    const v = lista.map((x) => pct(x));
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return 'al ' + (lo === hi ? lo : lo + '-' + hi) + '%';
  }

  // ===== PROFILO: le scelte della persona che cambiano il metro di giudizio =====
  // info: riga del collaboratore. turnoDi(codice) facoltativo: dice se i turni bloccati sono
  // di giorno (chi blocca i turni di giorno sceglie, in parte, le sue notti)
  function profilo(info, turnoDi) {
    const c = info || {};
    const giorni = String(c.giorni_lavoro || '')
      .split(',')
      .map((x) => parseInt(x))
      .filter((x) => !isNaN(x))
      .map((x) => (x === 7 ? 0 : x));
    const unici = [...new Set(giorni)].sort();
    const gl = unici.length && unici.length < 7 ? unici : null;
    const gs = parseInt(c.giorni_settimana) || 0;
    const bloccati = String(c.turni_bloccati || '')
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    const p = {
      funzione: String(c.funzione || '').toUpperCase(),
      soloNotti: !!c.solo_notti,
      soloDiurni: !!c.solo_diurni,
      giorniLavoro: gl,
      giorniSettimana: gs > 0 && gs < 7 ? gs : 0,
      aMano: !!c.turni_solo_a_mano,
      percentuale: num(c.percentuale, 1) || 1,
      jolly: !!(c.is_jolly || c.impiego === 'jolly'),
      bloccatiDiurni: bloccati.filter((k) => {
        const t = typeof turnoDi === 'function' ? turnoDi(k) : null;
        return t && t.tipo !== 'NOTTURNO';
      }),
    };
    p.weekendScelto = !!(gl && (gl.includes(6) || gl.includes(0)));
    p.domenicaScelta = !!(gl && gl.includes(0));
    // giorni sparsi per scelta: giorni fissi o giorni a settimana. La PERCENTUALE non e una scelta
    // (v457, titolare 15/10/2026): conta come quantita di lavoro, e i conteggi si confrontano con i
    // colleghi alla stessa percentuale (fascia) o si riportano alla percentuale
    p.giorniScelti = !!(gl || p.giorniSettimana);
    p.fascia = fasciaPct(p.percentuale);
    p.scelte = [];
    if (p.soloNotti) p.scelte.push('solo notti');
    if (p.soloDiurni) p.scelte.push('solo diurni');
    if (gl) p.scelte.push('lavora ' + gl.map((x) => GIORNI_N[x]).join(', '));
    if (p.giorniSettimana) p.scelte.push(p.giorniSettimana + ' giorni a settimana');
    if (p.aMano) p.scelte.push('turni scritti a mano');
    return p;
  }

  // ===== CONFRONTO: le medie dei colleghi =====
  // persone: [{ m, p }]. Gruppo di confronto: stessa funzione e stessa categoria (fissi o
  // ausiliari); con meno di 4 persone la categoria intera, con meno di 3 tutto il settore. Dalla
  // media di un indicatore escono le persone per cui quel valore e una scelta.
  function confronto(persone) {
    const tutti = (persone || []).filter((x) => x.m && x.m.lavorati > 0);
    const media = (lista, f) => (lista.length ? lista.reduce((s, x) => s + f(x), 0) / lista.length : null);
    const calcola = (g, nome) => {
      const nott = g.filter((x) => !x.p.soloNotti && !x.p.soloDiurni && !x.p.aMano);
      const we = g.filter((x) => !x.p.weekendScelto && !x.p.aMano && x.m.weTot > 0);
      const iso = g.filter((x) => !x.p.giorniScelti && !x.p.aMano && x.m.giorni >= 14);
      // turni bloccati diffusi nel gruppo (piu di meta): regola del gruppo, non scelta personale
      const freq = {};
      g.forEach((x) => x.p.bloccatiDiurni.forEach((k) => (freq[k] = (freq[k] || 0) + 1)));
      return {
        gruppo: nome,
        persone: g.length,
        quotaNotti: media(nott, (x) => x.m.quotaNotti),
        quotaWeekend: media(we, (x) => x.m.quotaWeekend),
        we: we,
        isolati4: media(iso, (x) => x.m.isolati / (x.m.giorni / 28)),
        bloccatiComuni: Object.keys(freq).filter((k) => freq[k] > g.length / 2),
      };
    };
    const gruppi = {};
    const di = (x) => {
      const chiave = x.p.funzione + '|' + (x.p.jolly ? 'J' : 'F');
      if (gruppi[chiave]) return gruppi[chiave];
      let g = tutti.filter((y) => y.p.funzione === x.p.funzione && y.p.jolly === x.p.jolly);
      let nome = (x.p.funzione || 'senza funzione') + (x.p.jolly ? ', ausiliari' : ', fissi');
      if (g.length < 4) {
        g = tutti.filter((y) => y.p.jolly === x.p.jolly);
        nome = x.p.jolly ? 'ausiliari del settore' : 'fissi del settore';
      }
      if (g.length < 3) {
        g = tutti;
        nome = 'tutto il settore';
      }
      return (gruppi[chiave] = calcola(g, nome));
    };
    // WEEKEND A PARITA DI PERCENTUALE: chi lavora al 50% fa meno giorni e quindi meno weekend.
    // Si confronta con i colleghi della stessa fascia di percentuale: prima nel gruppo (funzione e
    // categoria), poi nel settore; se nella fascia sono meno di 3, la media del gruppo si riporta
    // alla percentuale della persona (media x sua percentuale / percentuale media del gruppo).
    const weTutti = tutti.filter((x) => !x.p.weekendScelto && !x.p.aMano && x.m.weTot > 0);
    const diPct = (x) => {
      const base = di(x);
      const io = (y) => y === x;
      const stessa = (lista) => lista.filter((y) => y.p.fascia === x.p.fascia && !io(y));
      let pari = stessa(base.we || []);
      if (pari.length < 3) pari = stessa(weTutti);
      const out = Object.assign({}, base);
      if (pari.length >= 3) {
        out.quotaWeekend = media(pari, (y) => y.m.quotaWeekend);
        out.weekendCon = 'colleghi ' + etichettaPct(pari.map((y) => y.p.percentuale));
      } else if (base.quotaWeekend != null && base.we && base.we.length) {
        const pm = media(base.we, (y) => y.p.percentuale) || 1;
        out.quotaWeekend = Math.min(1, (base.quotaWeekend * x.p.percentuale) / pm);
        out.weekendCon = 'colleghi riportati al ' + pct(x.p.percentuale) + '%';
      }
      return out;
    };
    return { di: diPct, gruppi: gruppi };
  }

  // domeniche dal giorno dopo "a" a fine anno (per dire se l arretrato e ancora recuperabile)
  function domenicheRestanti(a) {
    const anno = String(a).substring(0, 4);
    let n = 0;
    for (let d = piu(a, 1); d.substring(0, 4) === anno; d = piu(d, 1))
      if (new Date(d + 'T12:00:00').getDay() === 0) n++;
    return n;
  }

  // ===== VALUTA: una voce per indicatore, con il perche in una riga =====
  // m: misura del periodo; mAnno: misura da gennaio alla fine del periodo (domeniche libere,
  // diritto annuale); p: profilo; c: gruppo di confronto (confronto(...).di(persona)); s: soglie
  function valuta(m, mAnno, p, c, s) {
    const so = Object.assign({}, PREDEFINITI, s || {});
    const cf = c || {};
    const voci = [];
    const voce = (chiave, nome, livello, testo, legge) =>
      voci.push({ chiave: chiave, nome: nome, livello: livello, testo: testo, legge: !!legge });
    const scelta = (t) => ' (scelta: ' + t + ')';
    // per i limiti di legge: la scelta si nomina in modo neutro, non toglie il limite
    const conScelta = (lista) => {
      const l = lista.filter(Boolean);
      return l.length ? ' · vale anche con la scelta ' + l.join(', ') : '';
    };
    const sceltaRitmo = conScelta([
      p.soloNotti && 'solo notti',
      p.aMano && 'turni scritti a mano',
      p.giorniLavoro && 'lavora ' + p.giorniLavoro.map((x) => GIORNI_N[x]).join(', '),
    ]);
    const quattro = Math.max(1, m.giorni / 28); // periodi di 4 settimane

    // 1) RIPOSO FRA I TURNI (legge)
    const nr = m.rientri.length;
    if (nr)
      voce(
        'rientri',
        'Riposo fra i turni',
        nr >= so.rientriCritico ? 'critico' : 'attenzione',
        nr +
          (nr === 1 ? ' rientro' : ' rientri') +
          ' con meno di ' +
          so.minRiposo +
          ' ore di riposo (' +
          elencoDate(m.rientri) +
          ', minimo ' +
          dec(Math.min(...m.rientri.map((x) => x.ore))) +
          ' h) · limite di legge' +
          sceltaRitmo,
        true,
      );
    else if (m.lavorati)
      voce('rientri', 'Riposo fra i turni', 'ok', 'almeno ' + so.minRiposo + ' ore fra i turni', true);

    // 2) GIORNI DI FILA (legge)
    if (m.serieMax > so.maxConsecutivi)
      voce(
        'serie',
        'Giorni di fila',
        m.serieMax >= so.maxConsecutivi + 2 ? 'critico' : 'attenzione',
        m.serieMax + ' giorni di lavoro di fila (massimo ' + so.maxConsecutivi + ') · limite di legge' + sceltaRitmo,
        true,
      );
    else if (m.lavorati) voce('serie', 'Giorni di fila', 'ok', 'al massimo ' + m.serieMax + ' giorni di fila', true);

    // 3) NOTTI DI FILA (salute: vale anche per chi ha scelto le notti)
    if (m.nottiFilaMax > so.nottiFila)
      voce(
        'notti_fila',
        'Notti di fila',
        m.nottiFilaMax >= so.nottiFila + 2 ? 'critico' : 'attenzione',
        m.nottiFilaMax + ' notti di fila (consigliate al massimo ' + so.nottiFila + ')' + sceltaRitmo,
        true,
      );
    else if (m.notti)
      voce('notti_fila', 'Notti di fila', 'ok', 'al massimo ' + m.nottiFilaMax + ' notti di fila', true);

    // 4) RECUPERO DOPO UN BLOCCO DI NOTTI (salute): una volta ogni tanto capita, spesso pesa
    const rb = m.recuperiBrevi.length;
    if (rb) {
      const spesso = rb > quattro; // piu di una volta ogni 4 settimane
      voce(
        'recupero',
        'Recupero dopo le notti',
        spesso ? 'attenzione' : 'nota',
        rb +
          (rb === 1 ? ' volta' : ' volte') +
          ' meno di ' +
          so.recuperoOre +
          ' ore libere dopo ' +
          so.bloccoNotti +
          ' o più notti di fila (' +
          elencoDate(m.recuperiBrevi) +
          ', minimo ' +
          Math.min(...m.recuperiBrevi.map((x) => x.ore)) +
          ' h)' +
          sceltaRitmo,
        true,
      );
    } else if (m.blocchiNotti)
      voce('recupero', 'Recupero dopo le notti', 'ok', 'riposo fra i blocchi di notti regolare', true);

    // 5) DOMENICHE LIBERE (legge, diritto ANNUALE: si guarda da gennaio alla fine del periodo,
    //    come la tabella Domeniche e Controlla le regole; arretrato recuperabile fino a dicembre)
    const ma = mAnno || m;
    const domConosciute = ma.domTot + ma.domAssenza;
    if (domConosciute > 0) {
      const attese = Math.floor((so.domenicheAnno * domConosciute) / 52);
      const manca = attese - ma.domLib;
      // diritto dell anno in proporzione alle domeniche in cui la persona c e (chi entra a meta
      // anno ne ha meno): bastano le domeniche che restano fino a dicembre?
      const restanti = domenicheRestanti(ma.a) + (ma.domFuture || 0);
      const dirittoAnno = Math.floor((so.domenicheAnno * Math.min(52, domConosciute + restanti)) / 52);
      // quante delle domeniche che restano fino a dicembre devono essere libere per arrivare al
      // minimo? Fino a meta: si recupera senza sforzo (nota). Oltre meta: da tenere d occhio.
      // Piu di quelle che restano: il minimo dell anno non si raggiunge piu (critico).
      const servono = dirittoAnno - ma.domLib;
      let testo =
        ma.domLib +
        ' domeniche libere da gennaio (attese ' +
        attese +
        (ma.domTardi ? ', ' + ma.domTardi + ' non valide per il sabato oltre le 23' : '') +
        ')';
      let liv = 'ok';
      if (manca >= 1 && servono > 0) {
        liv = servono > restanti ? 'critico' : servono > restanti / 2 ? 'attenzione' : 'nota';
        testo += ' · ' + (manca === 1 ? 'ne manca 1' : 'ne mancano ' + manca);
        testo +=
          servono > restanti
            ? ', minimo dell anno non più raggiungibile'
            : ': servono ' + servono + ' domeniche libere sulle ' + restanti + ' che restano';
      }
      // giorni fissi con il sabato o la domenica: il minimo di legge resta, ma una scelta non e mai
      // critica (al massimo da tenere d occhio, da parlarne con la persona)
      if (p.weekendScelto) {
        if (liv === 'critico') liv = 'attenzione';
        testo += ' · vale anche con la scelta lavora ' + p.giorniLavoro.map((x) => GIORNI_N[x]).join(', ');
      }
      voce('domeniche', 'Domeniche libere', liv, testo, true);
    }

    // 6) NOTTI rispetto ai colleghi (equilibrio): mai un allarme per chi le ha scelte
    // con meno di 8 giorni lavorati una quota non dice niente (1 notte su 1 giorno = 100%)
    if (m.lavorati >= 8 || (p.soloDiurni && m.notti)) {
      const base = m.notti + ' notti su ' + m.lavorati + ' giorni';
      if (p.soloNotti) voce('notti', 'Notti', 'nota', base + scelta('solo notti'));
      else if (p.soloDiurni)
        voce(
          'notti',
          'Notti',
          m.notti ? 'attenzione' : 'ok',
          m.notti
            ? (m.notti === 1 ? '1 notte' : m.notti + ' notti') + ' malgrado la scelta solo diurni'
            : 'nessuna notte' + scelta('solo diurni'),
        );
      else if (p.aMano) voce('notti', 'Notti', 'nota', base + scelta('turni scritti a mano'));
      else if (cf.quotaNotti != null) {
        const scarto = (m.quotaNotti - cf.quotaNotti) * 100;
        let liv = 'ok';
        if (scarto >= so.nottiScarto + 15 && m.quotaNotti >= 0.6) liv = 'critico';
        else if (scarto >= so.nottiScarto && m.quotaNotti >= 0.5) liv = 'attenzione';
        let testo =
          base +
          ' (' +
          pct(m.quotaNotti) +
          '%' +
          (liv === 'ok' ? ', ' : ', più dei colleghi: ') +
          cf.gruppo +
          ' ' +
          pct(cf.quotaNotti) +
          '%)';
        // turni di giorno bloccati da lei (non dalla regola del gruppo): le notti sono in parte scelte
        const propri = p.bloccatiDiurni.filter((k) => !(cf.bloccatiComuni || []).includes(k));
        if (liv !== 'ok' && propri.length) {
          liv = 'nota';
          testo += scelta('turni di giorno bloccati ' + propri.join(', '));
        }
        voce('notti', 'Notti', liv, testo);
      }
    }

    // 7) WEEKEND rispetto ai colleghi (equilibrio)
    if (m.weTot) {
      const base = m.weLav + ' weekend lavorati su ' + m.weTot;
      if (p.weekendScelto)
        voce(
          'weekend',
          'Weekend',
          'nota',
          base + scelta('lavora ' + p.giorniLavoro.map((x) => GIORNI_N[x]).join(', ')),
        );
      else if (p.aMano) voce('weekend', 'Weekend', 'nota', base + scelta('turni scritti a mano'));
      else if (cf.quotaWeekend != null) {
        const attesi = cf.quotaWeekend * m.weTot;
        const extra = m.weLav - attesi;
        const scarto = (m.quotaWeekend - cf.quotaWeekend) * 100;
        let liv = 'ok';
        if (scarto >= so.weekendScarto + 15 && extra >= 3) liv = 'critico';
        else if (scarto >= so.weekendScarto && extra >= 2) liv = 'attenzione';
        voce('weekend', 'Weekend', liv, base + ' · ' + (cf.weekendCon || 'colleghi') + ': media ' + dec(attesi));
      }
    }

    // 8) RIPOSI ISOLATI: un giorno solo fra due giorni di lavoro, ogni 4 settimane. Chi ha giorni
    //    scelti (giorni fissi, giorni a settimana) li ha per scelta; per chi lavora a tempo parziale
    //    il limite si riporta alla percentuale (al 50% il doppio: ha piu giorni liberi); agli
    //    ausiliari i riposi sparsi vengono dal lavoro a chiamata: si segnala chi ne ha molti piu
    //    dei colleghi ausiliari. I riposi chiesti (ND) non contano.
    if (m.giorni >= 14) {
      const tasso = m.isolati / quattro;
      const testo =
        m.isolati +
        (m.isolati === 1 ? ' riposo' : ' riposi') +
        ' di un giorno solo fra due giorni di lavoro' +
        (m.giorni > 34 ? ' (' + dec(tasso) + ' ogni 4 settimane)' : '') +
        (m.isolatiNd ? ', più ' + m.isolatiNd + ' ND chiesti' : '');
      let lim = so.isolatiMese / Math.max(0.3, Math.min(1, p.percentuale));
      if (p.jolly && cf.isolati4 != null) lim = Math.max(lim, cf.isolati4 + 2);
      if (tasso > lim && (p.giorniScelti || p.aMano)) {
        const sc = [
          p.giorniLavoro && 'lavora ' + p.giorniLavoro.map((x) => GIORNI_N[x]).join(', '),
          p.giorniSettimana && p.giorniSettimana + ' giorni a settimana',
          p.aMano && 'turni scritti a mano',
        ].filter(Boolean);
        voce('isolati', 'Riposi isolati', 'nota', testo + scelta(sc.join(', ')));
      } else
        voce(
          'isolati',
          'Riposi isolati',
          tasso > lim * 1.6 ? 'critico' : tasso > lim ? 'attenzione' : 'ok',
          testo +
            (tasso > lim && p.jolly ? ' (colleghi ausiliari ' + dec(cf.isolati4 || 0) + ')' : '') +
            (tasso > lim && p.percentuale < 1 ? ' (limite al ' + pct(p.percentuale) + '%: ' + dec(lim) + ')' : ''),
        );
    }

    // 9) INFORMAZIONI: mai un allarme
    if (m.presti) voce('presti', 'Turni del mattino', 'ok', m.presti + ' turni del mattino: nessun peso');
    if (m.mal) voce('malattie', 'Malattie', 'nota', m.mal + ' giorni di malattia: da leggere, non pesano');

    return chiudi(voci, p.scelte);
  }
  // stato (la voce piu alta, le note non contano) e perche in una riga
  function chiudi(voci, scelte) {
    const stato = voci.reduce((x, v) => (v.livello !== 'nota' && ORDINE[v.livello] > ORDINE[x] ? v.livello : x), 'ok');
    const segnali = voci.filter((v) => v.livello !== 'ok').sort((x, y) => ORDINE[y.livello] - ORDINE[x.livello]);
    // il perche in una riga: prima i segnali; se va tutto bene lo dice con un fatto rassicurante
    const rassicura = ['recupero', 'notti_fila', 'weekend']
      .map((k) => voci.find((v) => v.livello === 'ok' && v.chiave === k))
      .find(Boolean);
    let perche = segnali.map((v) => v.testo).join(' · ');
    if (!perche) perche = 'carico regolare' + (rassicura ? ' · ' + rassicura.testo : '');
    else if (stato === 'ok' && rassicura) perche += ' · ' + rassicura.testo;
    return { stato: stato, etichetta: ETICHETTA[stato], voci: voci, perche: perche, scelte: scelte || [] };
  }

  // SCELTE CAMBIATE NEL PERIODO (js/piano-scelte.js): ogni tratto si giudica con le scelte di
  // allora. Le voci che dipendono da una scelta (notti, weekend, riposi isolati) si calcolano
  // tratto per tratto e resta la piu seria, con le date del tratto; i limiti di legge e le
  // domeniche dell anno restano sul periodo intero (una serie o un rientro non si spezzano).
  const VOCI_SCELTA = ['notti', 'weekend', 'isolati'];
  const intervallo = (t) => dataBreve(t.da) + '–' + dataBreve(t.a);
  function profiloPeriodo(tratti, turnoDi) {
    // per il confronto con i colleghi e per i limiti di legge: una scelta valida in una parte del
    // periodo conta (chi ha avuto solo notti per un mese non fa da metro per le notti)
    const ultimo = tratti[tratti.length - 1].info || {};
    const unione = Object.assign({}, ultimo);
    ['solo_notti', 'solo_diurni', 'turni_solo_a_mano'].forEach(
      (k) => (unione[k] = tratti.some((t) => t.info && t.info[k])),
    );
    ['giorni_lavoro', 'giorni_settimana'].forEach((k) => {
      const t = tratti
        .slice()
        .reverse()
        .find((x) => x.info && x.info[k]);
      unione[k] = t ? t.info[k] : null;
    });
    return profilo(unione, turnoDi);
  }
  function valutaATratti(x, so, giorni, opz) {
    const res = valuta(x.m, x.mAnno, x.p, x.c, so);
    const perTratto = x.tratti.map((t) => {
      const m = misura(giorni, Object.assign({}, so, { da: t.da, a: t.a, oggi: opz.oggi }));
      const p = profilo(t.info, opz.turnoDi);
      return { t: t, p: p, r: valuta(m, x.mAnno, p, x.c, so) };
    });
    const voci = res.voci.filter((v) => VOCI_SCELTA.indexOf(v.chiave) < 0);
    VOCI_SCELTA.forEach((k) => {
      let migliore = null;
      perTratto.forEach((y) => {
        const v = y.r.voci.find((z) => z.chiave === k);
        if (!v) return;
        const w = Object.assign({}, v, { testo: intervallo(y.t) + ': ' + v.testo, tratto: { da: y.t.da, a: y.t.a } });
        if (!migliore || ORDINE[w.livello] >= ORDINE[migliore.livello]) migliore = w;
      });
      if (migliore) voci.push(migliore);
    });
    const scelte = [];
    perTratto.forEach((y) => y.p.scelte.forEach((s) => scelte.push(s + ' (' + intervallo(y.t) + ')')));
    return chiudi(voci, scelte);
  }

  // soglie dalle regole: leggi(nome) ritorna il valore della regola (o il predefinito) o null
  function soglieDa(leggi) {
    const L = typeof leggi === 'function' ? leggi : () => null;
    const v = (nome, d, min) => {
      const grezzo = L(nome);
      const x = parseFloat(String(grezzo == null ? '' : grezzo).replace(',', '.'));
      return isNaN(x) || x < min ? d : x;
    };
    const P = PREDEFINITI;
    return {
      minRiposo: v('min_riposo_ore', P.minRiposo, 1),
      maxConsecutivi: v('max_consecutivi', P.maxConsecutivi, 1),
      domenicheAnno: v('domeniche_libere_anno', P.domenicheAnno, 0),
      notteInizio: v('notte_inizio', P.notteInizio, 0),
      notteFine: v('notte_fine', P.notteFine, 0),
      notteOreMin: P.notteOreMin,
      nottiFila: v('benessere_notti_fila', P.nottiFila, 1),
      bloccoNotti: v('benessere_blocco_notti', P.bloccoNotti, 1),
      recuperoOre: v('benessere_recupero_notti_ore', P.recuperoOre, 1),
      nottiScarto: v('benessere_notti_scarto', P.nottiScarto, 1),
      weekendScarto: v('benessere_weekend_scarto', P.weekendScarto, 1),
      isolatiMese: v('benessere_isolati_mese', P.isolatiMese, 0),
      rientriCritico: v('benessere_rientri_critico', P.rientriCritico, 1),
    };
  }

  // tutto il settore in un colpo: persone [{ nome, giorni, info }] -> [{ ..., m, mAnno, p, c, res }]
  // (la stessa strada per il browser e per i test)
  function valutaSettore(persone, opz) {
    const o = opz || {};
    const so = Object.assign({}, PREDEFINITI, o.soglie || {});
    const inizioAnno = String(o.a).substring(0, 4) + '-01-01';
    const lista = (persone || []).map((x) => {
      const m = misura(x.giorni, Object.assign({}, so, { da: o.da, a: o.a, oggi: o.oggi }));
      const mAnno = misura(x.giorni, Object.assign({}, so, { da: inizioAnno, a: o.a, oggi: o.oggi }));
      // x.tratti (facoltativo): [{ da, a, info }] con le scelte valide in ogni parte del periodo
      // (PianoScelte.segmenti). Un tratto solo: le scelte di quel periodo, non quelle di oggi
      const tratti = Array.isArray(x.tratti) && x.tratti.length ? x.tratti : null;
      const p =
        tratti && tratti.length > 1
          ? profiloPeriodo(tratti, o.turnoDi)
          : profilo(tratti ? tratti[0].info : x.info, o.turnoDi);
      return Object.assign({}, x, { m: m, mAnno: mAnno, p: p, tratti: tratti });
    });
    const attive = lista.filter((x) => x.m.lavorati > 0);
    const conf = confronto(attive);
    attive.forEach((x) => {
      x.c = conf.di(x);
      x.res = x.tratti && x.tratti.length > 1 ? valutaATratti(x, so, x.giorni, o) : valuta(x.m, x.mAnno, x.p, x.c, so);
    });
    return attive;
  }

  const API = {
    PREDEFINITI,
    ETICHETTA,
    oreNotturne,
    misura,
    profilo,
    confronto,
    valuta,
    chiudi,
    valutaSettore,
    soglieDa,
    domenicheRestanti,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.PianoBenessere = API;
})(typeof window !== 'undefined' ? window : globalThis);
// ================================================================
// PARTE DEL BROWSER: soglie in Piano › Regole e raccolta dei dati
// ================================================================
if (typeof window !== 'undefined') {
  // le soglie del benessere nella scheda Regole (gruppo Benessere, valori per settore)
  try {
    if (typeof PIANO_REGOLE_GUIDA !== 'undefined') {
      const d = 'Scheda Benessere';
      Object.assign(PIANO_REGOLE_GUIDA, {
        benessere_notti_scarto: {
          g: 'Benessere',
          n: 'Quota di notti sopra i colleghi (punti %) da cui il benessere segnala lo squilibrio',
          s: 'Si confronta con i colleghi della stessa categoria che non hanno scelto solo notti o solo diurni. 20 = da tenere d occhio se fa il 20% di notti in più (e almeno metà dei turni di notte); critico con 15 punti in più. Una scelta della persona non è mai critica.',
          t: 'numero',
          p: '20',
          d: d,
        },
        benessere_weekend_scarto: {
          g: 'Benessere',
          n: 'Quota di weekend lavorati sopra i colleghi (punti %) da cui il benessere segnala lo squilibrio',
          s: 'Weekend = sabato e domenica; conta lavorato se lavora uno dei due giorni. 20 = da tenere d occhio con il 20% di weekend in più dei colleghi (almeno 2 weekend in più); critico con 15 punti in più.',
          t: 'numero',
          p: '20',
          d: d,
        },
        benessere_notti_fila: {
          g: 'Benessere',
          n: 'Notti di fila oltre le quali il benessere avvisa (vale anche per chi fa solo notti)',
          s: 'Notte = almeno 3 ore di lavoro nella fascia notturna (notte_inizio - notte_fine). La medicina del lavoro consiglia blocchi corti (3-4 notti); 5 = una settimana di lavoro.',
          t: 'numero',
          p: '5',
          d: d,
        },
        benessere_blocco_notti: {
          g: 'Benessere',
          n: 'Da quante notti di fila serve un recupero lungo prima del turno dopo',
          t: 'numero',
          p: '3',
          d: d,
        },
        benessere_recupero_notti_ore: {
          g: 'Benessere',
          n: 'Ore libere dopo un blocco di notti (due sonni pieni)',
          s: 'Dalla fine dell ultima notte all inizio del turno dopo. 46 ore = due notti di sonno vero prima di ricominciare.',
          t: 'numero',
          p: '46',
          d: d,
        },
        benessere_isolati_mese: {
          g: 'Benessere',
          n: 'Riposi di un giorno solo (fra due giorni di lavoro) ogni 4 settimane oltre i quali il benessere avvisa',
          s: 'Per chi lavora a tempo parziale il limite si riporta alla percentuale (al 50% il doppio). Per chi ha giorni fissi o giorni a settimana i riposi sparsi sono una scelta: solo una nota.',
          t: 'numero',
          p: '3',
          d: d,
        },
        benessere_rientri_critico: {
          g: 'Benessere',
          n: 'Rientri sotto le ore minime di riposo da cui la situazione è critica (uno solo: da tenere d occhio)',
          t: 'numero',
          p: '3',
          d: d,
        },
      });
    }
    if (typeof PIANO_REGOLE_LIMITI !== 'undefined')
      Object.assign(PIANO_REGOLE_LIMITI, {
        benessere_notti_scarto: [5, 60],
        benessere_weekend_scarto: [5, 60],
        benessere_notti_fila: [1, 7],
        benessere_blocco_notti: [1, 7],
        benessere_recupero_notti_ore: [24, 96],
        benessere_isolati_mese: [0, 10],
        benessere_rientri_critico: [1, 20],
      });
    if (typeof PIANO_REGOLE_GRUPPI_ORDINE !== 'undefined' && !PIANO_REGOLE_GRUPPI_ORDINE.includes('Benessere'))
      PIANO_REGOLE_GRUPPI_ORDINE.push('Benessere');
  } catch (e) {
    console.warn('benessere: soglie non registrate', e);
  }
}

function _benPiu(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// soglie del settore: regole di legge e gruppo Benessere (con i predefiniti del catalogo)
function pianoBenessereSoglie(rep) {
  return PianoBenessere.soglieDa((nome) => {
    const v = typeof _pianoRegolaVal === 'function' ? _pianoRegolaVal(nome, rep) : null;
    if (v != null) return v;
    return typeof _pianoRegolaPredefinita === 'function' ? _pianoRegolaPredefinita(nome) : null;
  });
}

// IL CALCOLO DEL BENESSERE (una sola funzione per tutto il Diario). Solo lettura del piano.
// opz: { reparto, da:'AAAA-MM-GG', a:'AAAA-MM-GG' }
// Ritorna { da, a, reparto, soglie, persone: [{ nome, jolly, info, m, mAnno, p, c, res }] }
//   m = fatti del periodo, mAnno = da gennaio alla fine del periodo (domeniche libere),
//   p = scelte della persona, c = gruppo di confronto, res = { stato, voci, perche }
async function pianoBenessereCalcola(opz) {
  const o = opz || {};
  const rep = o.reparto || _pianoReparto();
  const da = o.da;
  const a = o.a;
  const inizioAnno = a.substring(0, 4) + '-01-01';
  // due settimane prima (serie, notti di fila e rientri a cavallo) e qualche giorno dopo (il
  // recupero dopo l ultima notte del periodo)
  const prima = _benPiu(da < inizioAnno ? da : inizioAnno, -14);
  const dopo = _benPiu(a, 4);
  // i turni (orari, tipo) si leggono nel settore richiesto: per un altro settore si apre lui
  // per il tempo del calcolo (stesso _pianoTurnoInfo di tutto il piano)
  const repPrima = typeof _pianoRepartoSel !== 'undefined' ? _pianoRepartoSel : undefined;
  const cambia = rep !== _pianoReparto();
  try {
    if (cambia) _pianoRepartoSel = rep;
    // storico delle scelte riletto a ogni calcolo (una lettura sola: anche i cambi fatti da altri)
    if (typeof pianoScelteCarica === 'function') await pianoScelteCarica(true);
    if (cambia) _pianoRepartoSel = rep;
    const soglie = pianoBenessereSoglie(rep);
    const righe =
      (await secGet(
        'piano?data=gte.' +
          prima +
          '&data=lte.' +
          dopo +
          '&reparto_dip=eq.' +
          encodeURIComponent(rep) +
          '&limit=80000&select=collaboratore,data,codice,ora_inizio,ora_fine,reparto_dip',
      )) || [];
    if (cambia) _pianoRepartoSel = rep; // durante l attesa qualcuno potrebbe aver cambiato settore
    const collab = collaboratoriCache.filter(
      (c) => c.attivo !== false && _pianoAppartieneAlReparto(c, rep) && c.funzione !== 'RESP',
    );
    const perNome = {};
    collab.forEach((c) => (perNome[c.nome] = {}));
    righe.forEach((r) => {
      if (perNome[r.collaboratore]) perNome[r.collaboratore][String(r.data).substring(0, 10)] = r;
    });
    const date = [];
    for (let d = prima; d <= dopo; d = _benPiu(d, 1)) date.push(d);
    const persone = collab.map((c) => {
      const celle = perNome[c.nome];
      const giorni = date.map((d) => {
        const r = celle[d];
        const cod = r && r.codice ? String(r.codice).trim() : '';
        const dow = new Date(d + 'T12:00:00').getDay();
        const g = { data: d, dow: dow, stato: 'ignoto' };
        if (!cod) return g;
        if (_pianoIsLavoro(cod)) {
          g.stato = 'lavoro';
          g.int = _pianoIntervalloLavoro(Object.assign({}, r, { data: d }));
          const t = typeof _pianoTurnoInfoRiga === 'function' ? _pianoTurnoInfoRiga(r) : _pianoTurnoInfo(cod);
          // orario rispetto alla mezzanotte del giorno (l intervallo e in ore assolute)
          const base = new Date(d + 'T00:00:00').getTime() / 3600000;
          const rel = g.int ? { ini: g.int.ini - base, fin: g.int.fin - base } : null;
          g.notte = rel
            ? PianoBenessere.oreNotturne(rel, soglie.notteInizio, soglie.notteFine) >= soglie.notteOreMin
            : !!(t && t.tipo === 'NOTTURNO');
          // turno del mattino: tipo PRESTO o inizio prima delle 8
          g.presto = !!(t && t.tipo === 'PRESTO') || !!(rel && rel.ini < 8);
        } else if (_pianoDomenicaEsclusa(cod)) {
          g.stato = 'assenza';
          g.assenza = /^V/.test(cod) ? 'V' : 'M';
        } else {
          g.stato = 'riposo';
          g.sceltoNd = cod.toUpperCase() === 'ND';
        }
        if (dow === 0 && typeof _pianoStatoDomenica === 'function') {
          const isoSab = _benPiu(d, -1);
          const rs = celle[isoSab];
          g.domenica = _pianoStatoDomenica(cod, rs ? rs.codice : '', isoSab, rs, c.nome);
        }
        return g;
      });
      // scelte valide in ogni parte del periodo (solo notti, solo diurni, giorni... messe o
      // tolte nel tempo: js/piano-scelte.js), non quelle di oggi
      const tratti = typeof pianoScelteSegmenti === 'function' ? pianoScelteSegmenti(c, da, a) : null;
      return { nome: c.nome, info: c, giorni: giorni, tratti: tratti };
    });
    const valutate = PianoBenessere.valutaSettore(persone, {
      da: da,
      a: a,
      soglie: soglie,
      oggi: typeof _pianoOggiStr === 'function' ? _pianoOggiStr() : new Date().toISOString().substring(0, 10),
      turnoDi: (k) => _pianoTurnoInfo(k),
    });
    valutate.forEach((x) => {
      x.jolly = x.p.jolly;
      delete x.giorni; // non servono piu: la memoria resta leggera
    });
    return { da: da, a: a, reparto: rep, soglie: soglie, persone: valutate };
  } finally {
    if (cambia) _pianoRepartoSel = repPrima;
  }
}
