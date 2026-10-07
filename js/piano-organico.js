/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-organico.js
 *
 * SCHEDA ORGANICO del Piano: legge i dati del settore (fabbisogno, turni,
 * collaboratori, piano dell anno, vacanze, CGF, congedi, malattie) e li passa
 * al motore puro OrganicoModello (organico-modello.js). Mostra il bilancio mese
 * per mese, i suggerimenti con il loro effetto, un simulatore, la verifica sui
 * mesi passati e il metodo, con Excel e rapporto PDF per la Direzione.
 *
 * Si attiva o disattiva in Piano > Impostazioni (impostazione
 * piano_organico_attivo, solo amministratore); chi la vede si decide in
 * Visibilita e permessi (scheda Piano · Organico).
 */
let _orgStato = null; // { chiave, dati, par, base, sugg, verifica, scenario }

function organicoAttivo() {
  return window._organicoAttivo !== false;
}
async function organicoImpostaAttivo(on) {
  if (!isAdmin()) return;
  if (!(await salvaImp('piano_organico_attivo', on ? 'true' : 'false'))) return;
  window._organicoAttivo = !!on;
  logAzione('Piano: analisi organico', on ? 'attivata' : 'disattivata');
  toast(on ? 'Analisi organico attivata' : 'Analisi organico disattivata');
  if (!on && _pianoTab === 'organico') _pianoTab = 'calendario';
  renderPiano();
}

// interruttore (solo amministratore) in Piano > Impostazioni
function _renderOrganicoInterruttoreCard() {
  if (!isAdmin()) return '';
  const on = organicoAttivo();
  return (
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Analisi organico (admin)</div><div style="padding:10px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
    '<span style="font-size:var(--fs-md,.875rem)">La scheda <b>Organico</b> del Piano e <b style="color:' +
    (on ? 'var(--c-verde,#2c6e49)' : 'var(--c-rosso,#c0392b)') +
    '">' +
    (on ? 'attiva' : 'disattivata') +
    '</b>. Chi la vede si decide in Visibilita e permessi (Piano · Organico).</span>' +
    '<button class="btn-export" onclick="organicoImpostaAttivo(' +
    (on ? 'false' : 'true') +
    ')">' +
    (on ? 'Disattiva' : 'Attiva') +
    '</button></div></div>'
  );
}

const _orgOre = (x) => (Math.round(x || 0) || 0).toLocaleString('de-CH');
const _orgUno = (x) => (Math.round((x || 0) * 10) / 10).toFixed(1);
const _orgSegno = (x, f) => (x > 0 ? '+' : '') + f(x);
const _orgMeseNome = (m) => (typeof MESI_FULL !== 'undefined' && MESI_FULL[m - 1]) || String(m);
const _orgMeseBreve = (m) => (typeof MESI !== 'undefined' && MESI[m - 1]) || String(m);
const _orgCHF = (x) => 'CHF ' + (Math.round(x || 0) || 0).toLocaleString('de-CH');
// costo di una proposta in parole (solo con i costi inseriti dall amministratore)
function _organicoCostoTesto(c) {
  if (!c) return '';
  if (!c.chf) return 'nessun costo in piu (le ore di contratto restano le stesse)';
  return (
    _orgCHF(c.chf) +
    ' nei mesi rimasti (' +
    _orgOre(c.ore) +
    ' ore pagate in piu)' +
    (c.perOra ? ' · ' + _orgCHF(c.perOra) + ' per ora di carenza coperta' : '')
  );
}

// COSTI PER LE STIME (facoltativi): costo annuo di un tempo pieno (oneri compresi)
// e costo orario di un ausiliario. Li inserisce l amministratore; li legge solo chi
// vede la scheda Organico (anche nel database, migrazione 20260890).
async function _organicoCaricaCosti() {
  let c = null;
  try {
    c = JSON.parse((await getImp('piano_organico_costi')) || 'null');
  } catch (e) {
    c = null;
  }
  window._organicoCosti = c && typeof c === 'object' ? c : null;
}
function _organicoCostiAttivi() {
  const c = window._organicoCosti;
  return c && c.attivo && (c.fissoAnno > 0 || c.ausiliarioOra > 0)
    ? { fissoAnno: +c.fissoAnno || 0, ausiliarioOra: +c.ausiliarioOra || 0 }
    : null;
}
function _organicoCostiCardHtml() {
  if (!isAdmin()) return '';
  const c = window._organicoCosti || {};
  const on = !!c.attivo;
  return (
    '<h4 style="margin:16px 0 8px">Costi per le stime (facoltativo, solo amministratore)</h4>' +
    '<div style="border:1px solid var(--line);border-radius:3px;padding:10px 12px;background:var(--paper2);font-size:var(--fs-sm,.8125rem)">' +
    '<p style="margin:0 0 8px;color:var(--muted);max-width:900px">Con i costi accesi ogni proposta e il simulatore mostrano quanto costano nei mesi rimasti e quanto costa ogni ora di carenza coperta: si confrontano le soluzioni anche in franchi. Sono costi medi, non stipendi di persone. Li vede solo chi vede questa scheda. Il costo annuo dei fissi comprende gli oneri del datore di lavoro; il costo orario degli ausiliari e il prezzo pagato all ora (nel calcolo si sceglie se e di base o comprensivo di vacanze e tredicesima, RAP Allegato 1) e non comprende gli oneri.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">' +
    '<label><input type="checkbox" id="org-costi-on"' +
    (on ? ' checked' : '') +
    '> Mostra i costi</label>' +
    '<label>Costo annuo di un tempo pieno (CHF, oneri compresi)<br><input id="org-costi-fisso" class="finestra-campo" style="width:140px;margin:0" inputmode="decimal" value="' +
    (c.fissoAnno || '') +
    '"></label>' +
    '<label>Costo orario di un ausiliario (CHF, prezzo pagato all ora)<br><input id="org-costi-aus" class="finestra-campo" style="width:140px;margin:0" inputmode="decimal" value="' +
    (c.ausiliarioOra || '') +
    '"></label>' +
    '<button class="btn-export" onclick="organicoSalvaCosti()">Salva</button></div></div>'
  );
}
async function organicoSalvaCosti() {
  if (!isAdmin()) return;
  const num = (id) => {
    const v = parseFloat(
      String((document.getElementById(id) || {}).value || '')
        .replace(/'/g, '')
        .replace(',', '.'),
    );
    return isNaN(v) || v < 0 ? 0 : v;
  };
  const c = {
    attivo: !!(document.getElementById('org-costi-on') || {}).checked,
    fissoAnno: num('org-costi-fisso'),
    ausiliarioOra: num('org-costi-aus'),
  };
  if (c.attivo && !c.fissoAnno && !c.ausiliarioOra) {
    toastErrore('Per mostrare i costi inserisci almeno un costo');
    return;
  }
  if (!(await salvaImp('piano_organico_costi', JSON.stringify(c)))) return;
  window._organicoCosti = c;
  logAzione('Piano: costi organico', c.attivo ? 'mostrati' : 'nascosti');
  toast('Costi salvati');
  await _organicoCalcola(true);
  renderPiano();
}

// ---------------------------------------------------------------- dati
async function _organicoCaricaDati(anno) {
  const rep = _pianoReparto();
  const oggi = oggiLocale();
  await _pianoCaricaFestivita(anno);
  // TURNI del settore: durata, notte/giorno, gruppo
  const turni = {};
  pianoTurniCache
    .filter((t) => t.attivo !== false && (t.reparto_dip || 'slots') === rep)
    .forEach(
      (t) =>
        (turni[t.codice] = {
          durata: parseFloat(t.durata_ore) || 0,
          tipo: t.tipo || '',
          gruppo: (t.gruppo || 'ALTRO').toUpperCase(),
        }),
    );
  const sigle = Object.keys(turni);
  // ORGANICO del settore: i collaboratori di casa (chi copre da un altro settore
  // resta nell organico del suo)
  const membri = collaboratoriCache.filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === rep);
  const nomi = membri.map((c) => c.nome);
  const [fabbRighe, righe, copertura] = await Promise.all([
    secGet('piano_fabbisogni?data=gte.' + anno + '-01-01&data=lte.' + anno + '-12-31&reparto_dip=eq.' + rep),
    nomi.length
      ? secGet(
          'piano?collaboratore=in.(' +
            nomi.map((n) => encodeURIComponent(n)).join(',') +
            ')&data=gte.' +
            (anno - 1) +
            '-01-01&data=lte.' +
            anno +
            '-12-31',
        )
      : [],
    // posti coperti davvero nei mesi passati (anche da chi viene da altri settori)
    sigle.length && oggi >= anno + '-01-01'
      ? secGet(
          'piano?codice=in.(' +
            sigle.map((s) => encodeURIComponent(s)).join(',') +
            ')&data=gte.' +
            anno +
            '-01-01&data=lte.' +
            (oggi < anno + '-12-31' ? oggi : anno + '-12-31'),
        )
      : [],
  ]);
  _pianoRegistraGiorniTurno((righe || []).concat(copertura || []));
  const durataGiorno = (cod, d) => {
    const t = (pianoTurniCache || []).find((x) => x.codice === cod && (x.reparto_dip || 'slots') === rep);
    const e = t && typeof _pianoTurnoDelGiorno === 'function' ? _pianoTurnoDelGiorno(t, d) : null;
    return e && e.durata ? e.durata : null;
  };
  // celle di un turno di un ALTRO settore: quel giorno la persona lavora altrove
  const righeModello = (righe || []).map((r) => {
    const cod = String(r.codice || '');
    if (_pianoTurnoInfo(cod) && !_pianoCopreQui(r, rep))
      return { collaboratore: r.collaboratore, data: r.data, codice: 'ALTRO_SETTORE' };
    return r;
  });
  const cfgVac = typeof _pianoVacCfg === 'function' ? _pianoVacCfg() : {};
  const persone = membri.map((c) => {
    const jolly = !!(c.is_jolly || c.impiego === 'jolly');
    let vacanzeAnno = 0;
    if (!jolly) {
      const eff = typeof _pianoCongedoNpEffetti === 'function' ? _pianoCongedoNpEffetti(c.nome, anno) : {};
      const dir = c.data_assunzione
        ? PianoRegole.giorniVacanzaSpettanti(String(c.data_assunzione).substring(0, 10), anno, {
            ...cfgVac,
            giorniCongedo: eff.giorniVacanze,
            giorniAnzianita: eff.giorniAnzianita,
          })
        : null;
      vacanzeAnno = dir && dir.giorni != null ? dir.giorni : parseInt(_pianoRegolaVal('vacanze_giorni_base')) || 35;
    }
    const cnp = {};
    for (let m = 1; m <= 12; m++) cnp[m] = _pianoGiorniCnp(c.nome, anno + '-' + String(m).padStart(2, '0'));
    return {
      nome: c.nome,
      pct: parseFloat(c.percentuale) || 1,
      jolly: jolly,
      funzione: c.funzione || '',
      gruppi: typeof _pianoSettoriEffettivi === 'function' ? _pianoSettoriEffettivi(c) : null,
      assunzione: c.data_assunzione ? String(c.data_assunzione).substring(0, 10) : null,
      fine: c.data_fine_rapporto ? String(c.data_fine_rapporto).substring(0, 10) : null,
      vacanzeAnno: vacanzeAnno,
      cnp: cnp,
    };
  });
  const festiviAnno = (pianoFestiviCache || []).filter(
    (f) => String(f.data).startsWith(anno + '-') && (typeof _pianoFestivoDaCgf !== 'function' || _pianoFestivoDaCgf(f)),
  ).length;
  // CONSUNTIVO dei mesi chiusi: ore di posti scoperti e ore fatte oltre il contratto
  const consuntivo = {};
  const fabbisogni = (fabbRighe || []).map((f) => ({ data: f.data, codice: f.turno_codice, quantita: f.quantita }));
  const coperti = {};
  (copertura || []).forEach((r) => {
    if (!_pianoCopreQui(r, rep)) return;
    const k = String(r.data).substring(0, 10) + '|' + r.codice;
    coperti[k] = (coperti[k] || 0) + 1;
  });
  for (let m = 1; m <= 12; m++) {
    const ym = anno + '-' + String(m).padStart(2, '0');
    if (ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0') > oggi) continue;
    let scop = 0;
    fabbisogni.forEach((f) => {
      const d = String(f.data).substring(0, 10);
      if (!d.startsWith(ym)) return;
      const manca = (parseInt(f.quantita) || 0) - (coperti[d + '|' + f.codice] || 0);
      if (manca > 0) scop += manca * (durataGiorno(f.codice, d) || (turni[f.codice] || {}).durata || 0);
    });
    let extra = 0;
    let sotto = 0; // ore di contratto non usate (fissi sotto le ore dovute)
    membri.forEach((c) => {
      if (c.is_jolly || c.impiego === 'jolly') return; // gli ausiliari non hanno ore dovute
      const pct = parseFloat(c.percentuale) || 1;
      const ore = (righe || [])
        .filter((r) => r.collaboratore === c.nome && String(r.data).startsWith(ym))
        .reduce((s, r) => s + (_pianoOreDiRiga(r, pct) || 0), 0);
      const dovute = (_pianoGgDovuti(c.nome, ym) / 7) * _pianoOreSett * pct;
      if (ore > dovute) extra += ore - dovute;
      else sotto += dovute - ore;
    });
    consuntivo[m] = { scopertiOre: scop, oreExtra: extra, oreSotto: sotto };
  }
  // gruppi gia lavorati da ognuno (righe dell anno prima e di quest anno)
  const storiaGruppi = {};
  (righe || []).forEach((r) => {
    const t = turni[r.codice];
    if (!t || !_pianoCopreQui(r, rep)) return;
    (storiaGruppi[r.collaboratore] = storiaGruppi[r.collaboratore] || {})[t.gruppo] = true;
  });
  return {
    anno: anno,
    reparto: rep,
    storiaGruppi: storiaGruppi,
    turni: turni,
    durataGiorno: durataGiorno,
    fabbisogni: fabbisogni,
    persone: persone,
    righe: righeModello,
    festiviAnno: festiviAnno,
    consuntivo: consuntivo,
  };
}

function _organicoParametri() {
  const P = OrganicoModello.PARAMETRI_PREDEFINITI;
  const num = (k, d) => {
    const v = parseFloat(_pianoRegolaVal(k));
    return isNaN(v) ? d : v;
  };
  return {
    oggi: oggiLocale(),
    oreSett: _pianoOreSett || 41,
    domenicheLibere: num('domeniche_libere_anno', 12),
    jollyPct: num('jolly_percentuale_piano', 0.8),
    livelloServizio: window._organicoLivello || 0.95,
    codiciImpegni: P.codiciImpegni.concat(['ALTRO_SETTORE']),
    costi: _organicoCostiAttivi(),
  };
}

async function _organicoCalcola(forza) {
  const anno = window._organicoAnno || parseInt(_pianoMeseSel.split('-')[0]);
  const chiave = anno + '|' + _pianoReparto();
  if (!forza && _orgStato && _orgStato.chiave === chiave) return _orgStato;
  const [dati] = await Promise.all([_organicoCaricaDati(anno), _organicoCaricaCosti()]);
  const par = _organicoParametri();
  const base = OrganicoModello.analizza(dati, par);
  _orgStato = {
    chiave: chiave,
    dati: dati,
    par: par,
    base: base,
    sugg: OrganicoModello.suggerimenti(dati, par, base),
    verifica: OrganicoModello.verifica(base),
    scenario: (_orgStato && _orgStato.chiave === chiave && _orgStato.scenario) || { aggiunte: [], percentuali: {} },
  };
  _organicoRicalcolaScenario();
  return _orgStato;
}
function _organicoRicalcolaScenario() {
  const s = _orgStato;
  const sc = s.scenario;
  const vuoto =
    !sc.aggiunte.length &&
    !Object.keys(sc.percentuali).length &&
    !(sc.vacanzeSposta || []).length &&
    !Object.keys(sc.jollyPctMesi || {}).length;
  s.ipotesi = vuoto ? null : OrganicoModello.analizza(s.dati, s.par, s.scenario);
}

// ---------------------------------------------------------------- vista
async function _renderPianoOrganicoTab() {
  if (!organicoAttivo())
    return '<div class="main-card"><div class="card-header">Organico</div><p style="padding:14px;color:var(--muted)">L analisi dell organico e disattivata. L amministratore la attiva in Piano &gt; Impostazioni.</p></div>';
  let s;
  try {
    s = await _organicoCalcola(false);
  } catch (e) {
    console.error('organico', e);
    return (
      '<div class="main-card"><div class="card-header">Organico</div><p style="padding:14px;color:var(--c-rosso,#c0392b)">Analisi non riuscita: ' +
      escP(e.message || String(e)) +
      '</p></div>'
    );
  }
  const A = s.base;
  const anno = A.anno;
  const repLbl = typeof repartoLabel === 'function' ? repartoLabel(s.dati.reparto) : s.dati.reparto;
  const futuri = A.mesi.filter((x) => !x.passato && x.oreRichieste);
  const conteggio = { sotto: 0, 'in equilibrio': 0, margine: 0 };
  futuri.forEach((x) => (conteggio[OrganicoModello.statoMese(x)] = (conteggio[OrganicoModello.statoMese(x)] || 0) + 1));
  const media = (f) => (futuri.length ? futuri.reduce((t, x) => t + f(x), 0) / futuri.length : 0);
  const persone = s.dati.persone;
  const fteContratto = persone.reduce((t, x) => t + (x.jolly ? s.par.jollyPct : x.pct), 0);
  const shrink = media((x) => 1 - x.quotaNetta);

  let h =
    '<div class="main-card" style="margin-bottom:14px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Organico · ' +
    escP(repLbl) +
    ' · ';
  h +=
    '<select onchange="window._organicoAnno=parseInt(this.value);renderPiano()" style="padding:3px 8px;font-size:var(--fs-sm,.8125rem)">';
  const annoOggi = parseInt(oggiLocale().substring(0, 4));
  for (let a = annoOggi - 1; a <= annoOggi + 1; a++)
    h += '<option value="' + a + '"' + (a === anno ? ' selected' : '') + '>' + a + '</option>';
  h += '</select>';
  h +=
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="organicoRicalcola()">Ricalcola</button>';
  h +=
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="organicoEsportaExcel()">Excel</button>';
  h +=
    '<button class="btn-export btn-export-pdf" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="organicoRapportoPdf()">Rapporto PDF</button>';
  h += '</div><div style="padding:12px 14px">';
  // TRE PASSI (06.10, richiesta del titolare: "e professionale? non e complicato?"):
  // 1 Situazione (la risposta in parole semplici), 2 Prova una soluzione (cosa serve,
  // quanto costa, cosa cambia), 3 Dettagli (tabelle complete, verifica, metodo, costi)
  if (!window._orgVista)
    try {
      window._orgVista = localStorage.getItem('organico_vista') || 'situazione';
    } catch (e) {
      window._orgVista = 'situazione';
    }
  const vista = window._orgVista;
  const passo = (k, n, t) =>
    '<button class="btn-act' +
    (vista === k ? ' attivo' : '') +
    '" style="' +
    (vista === k ? 'background:var(--ink);color:var(--paper);border-color:var(--ink);' : '') +
    'font-size:var(--fs-md,.875rem);padding:6px 14px" onclick="organicoVista(\'' +
    k +
    '\')">' +
    n +
    ' · ' +
    t +
    '</button>';
  h +=
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px">' +
    passo('situazione', '1', 'Situazione') +
    passo('soluzione', '2', 'Prova una soluzione') +
    passo('dettagli', '3', 'Dettagli e metodo') +
    '</div>';
  if (vista === 'soluzione') h += _organicoVistaSoluzione(s);
  else if (vista === 'dettagli') h += _organicoVistaDettagli(s);
  else h += _organicoVistaSituazione(s, { futuri, conteggio, media, persone, fteContratto, shrink });
  h += '</div></div>';
  return h;
}

function organicoVista(v) {
  window._orgVista = v;
  try {
    localStorage.setItem('organico_vista', v);
  } catch (e) {}
  renderPiano();
}
// 1 · SITUAZIONE: la risposta in parole semplici, poi cosa conviene fare e i mesi
function _organicoVistaSituazione(s, x) {
  const A = s.base;
  const anno = A.anno;
  const mesiSotto = x.futuri.filter((m) => OrganicoModello.statoMese(m) === 'sotto');
  const G = OrganicoModello.gruppi(s.dati, s.base);
  const gruppiCorti = G.filter((g) => g.servono > 0);
  const ok = !mesiSotto.length && !gruppiCorti.length;
  let h =
    '<div style="border:1px solid var(--line);border-left:5px solid ' +
    (ok ? 'var(--c-verde,#2c6e49)' : 'var(--c-rosso,#c0392b)') +
    ';border-radius:3px;padding:12px 14px;margin-bottom:12px;background:var(--paper2);font-size:var(--fs-md,.875rem)">';
  if (!x.futuri.length) h += '<b>Nessun mese rimasto con fabbisogno nel ' + anno + '.</b>';
  else if (ok)
    h +=
      '<b>Il personale basta.</b> Nei ' +
      x.futuri.length +
      ' mesi rimasti del ' +
      anno +
      ' il fabbisogno e coperto, anche contando vacanze, malattie e impegni.';
  else
    h +=
      '<b>Manca personale.</b> ' +
      (mesiSotto.length
        ? 'Ore insufficienti in ' +
          mesiSotto.length +
          ' mesi: ' +
          mesiSotto.map((m) => _orgMeseNome(m.mese)).join(', ') +
          '. '
        : '') +
      (gruppiCorti.length
        ? 'Persone abilitate insufficienti per: ' +
          gruppiCorti.map((g) => g.gruppo + ' (ne mancano ' + g.servono + ')').join(', ') +
          '.'
        : '') +
      ' Sotto, cosa conviene fare.';
  h += '</div>';
  const tile = (val, lbl, sotto, col) =>
    '<div class="scheda-kpi" style="min-width:170px"><div class="kpi-val" style="color:' +
    (col || 'var(--ink)') +
    '">' +
    val +
    '</div><div class="kpi-lbl">' +
    lbl +
    '</div>' +
    (sotto ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + sotto + '</div>' : '') +
    '</div>';
  const serv = x.media((m) => m.fteNecessari);
  const disp = x.media((m) => m.fteDisponibili);
  h += '<div class="scheda-kpi-grid" style="margin-bottom:14px">';
  h += tile(
    x.persone.length,
    'Persone in organico',
    'di cui ' + x.persone.filter((p) => p.jolly).length + ' ausiliari',
  );
  h += tile(_orgUno(serv), 'Ne servono', 'a tempo pieno');
  h += tile(
    _orgUno(disp),
    'Ce ne sono',
    'a tempo pieno, tolte le assenze',
    disp >= serv ? 'var(--c-verde,#2c6e49)' : 'var(--c-rosso,#c0392b)',
  );
  h += tile(
    mesiSotto.length + ' su ' + x.futuri.length,
    'Mesi scoperti',
    'mesi rimasti del ' + anno,
    mesiSotto.length ? 'var(--c-rosso,#c0392b)' : 'var(--c-verde,#2c6e49)',
  );
  h += '</div>';
  // COSA CONVIENE FARE (suggerimenti)
  h += '<h4 style="margin:6px 0 8px">Cosa conviene fare</h4>';
  if (!s.sugg.length)
    h += '<p style="color:var(--muted)">Niente da fare: il fabbisogno e coperto nei mesi rimasti.</p>';
  s.sugg.forEach((g, i) => {
    const colore = g.informativo ? 'var(--line)' : g.tipo === 'margine' ? 'var(--c-verde,#2c6e49)' : 'var(--accent2)';
    h +=
      '<div style="border:1px solid var(--line);border-left:4px solid ' +
      colore +
      ';border-radius:3px;padding:10px 12px;margin-bottom:8px;background:var(--paper2)">';
    h +=
      '<b style="font-size:var(--fs-md,.875rem)">' +
      escP(g.titolo) +
      '</b>' +
      (g.consigliato
        ? ' <span class="mini-badge" style="background:var(--c-verde,#2c6e49);font-size:11px;vertical-align:middle" title="Tra le proposte che risolvono di piu, quella con meno costi e cambiamenti">la piu leggera</span>'
        : '');
    h += '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px">' + escP(g.motivo) + '</div>';
    if (g.alternativa)
      h +=
        '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:2px">' +
        escP(g.alternativa) +
        '</div>';
    if (g.effetto)
      h +=
        '<div style="font-size:var(--fs-sm,.8125rem);margin-top:6px"><b>Effetto:</b> mesi scoperti da ' +
        g.effetto.mesiSottoPrima +
        ' a ' +
        g.effetto.mesiSottoDopo +
        ' · ' +
        _orgOre(g.effetto.oreCoperte) +
        ' ore mancanti coperte' +
        (g.effetto.costo ? '<br><b>Costo stimato:</b> ' + escP(_organicoCostoTesto(g.effetto.costo)) : '') +
        (g.scenario
          ? ' <button class="btn-act" style="margin-left:8px" onclick="organicoProvaSuggerimento(' +
            i +
            ')">Prova questa soluzione</button>'
          : '') +
        '</div>';
    if (g.effettoTesto)
      h +=
        '<div style="font-size:var(--fs-sm,.8125rem);margin-top:6px"><b>Effetto:</b> ' +
        escP(g.effettoTesto) +
        (g.tipo === 'gruppo' && typeof puoPianificareFormazioni === 'function' && puoPianificareFormazioni()
          ? ' <button class="btn-act" style="margin-left:8px" onclick="formazioniApriDaOrganico(' +
            _jsArg(g.gruppo) +
            ',' +
            _jsArg((g.formare || [])[0] || '') +
            ')">Pianifica formazione</button>'
          : '') +
        '</div>';
    h += '</div>';
  });
  // MESE PER MESE in breve
  h += '<h4 style="margin:14px 0 8px">Mese per mese</h4>';
  h += _organicoTabellaSemplice(A, null);
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:4px 0 0">Tutte le colonne (vacanze, CGF, malattie, persone minime, riserva) e i gruppi dei turni: <a href="#" onclick="organicoVista(\'dettagli\');return false">3 · Dettagli e metodo</a>.</p>';
  return h;
}
// tabella breve: le ore che servono, quelle che ci sono, la differenza e lo stato
function _organicoTabellaSemplice(A, B) {
  let h =
    '<div style="overflow:auto"><table class="piano-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Mese</th><th title="Posti del fabbisogno per la durata dei turni">Ore che servono</th><th title="Ore di contratto meno vacanze, CGF, malattie e impegni">Ore che ci sono</th><th>Differenza</th><th>Stato</th>' +
    (B ? '<th>Con la soluzione</th>' : '') +
    '</tr></thead><tbody>';
  A.mesi.forEach((x, i) => {
    if (!x.oreRichieste) return;
    const st = OrganicoModello.statoMese(x);
    const col = st === 'sotto' ? 'var(--c-rosso,#c0392b)' : st === 'margine' ? 'var(--c-verde,#2c6e49)' : 'var(--ink)';
    const parola = st === 'sotto' ? 'manca personale' : st === 'margine' ? 'coperto, con margine' : 'coperto';
    h +=
      '<tr' +
      (x.passato ? ' style="opacity:.6"' : '') +
      '><td style="text-align:left;font-weight:600">' +
      _orgMeseNome(x.mese) +
      (x.passato ? ' <span style="font-weight:400;color:var(--muted)">passato</span>' : '') +
      '</td><td>' +
      _orgOre(x.oreRichieste) +
      '</td><td>' +
      _orgOre(x.oreNette) +
      '</td><td style="color:' +
      (x.differenzaOre < 0 ? 'var(--c-rosso,#c0392b)' : 'var(--c-verde,#2c6e49)') +
      '">' +
      _orgSegno(Math.round(x.differenzaOre), _orgOre) +
      ' ore</td><td style="color:' +
      col +
      '">' +
      parola +
      '</td>';
    if (B) {
      const y = B.mesi[i];
      const st2 = OrganicoModello.statoMese(y);
      h +=
        '<td style="color:' +
        (st2 === 'sotto' ? 'var(--c-rosso,#c0392b)' : 'var(--c-verde,#2c6e49)') +
        '">' +
        _orgSegno(Math.round(y.differenzaOre), _orgOre) +
        ' ore · ' +
        (st2 === 'sotto' ? 'manca personale' : 'coperto') +
        '</td>';
    }
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}
// 2 · PROVA UNA SOLUZIONE: cosa serve (calcolo) e confronto mese per mese
function _organicoVistaSoluzione(s) {
  let h =
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin:0 0 10px;max-width:900px">Scrivi le postazioni che servono: il programma dice quante persone ci vogliono e quanto costano. Con "Aggiungi al confronto" vedi cosa cambia mese per mese.</p>';
  h += _organicoCalcoloHtml(s);
  h += _organicoSimulatoreHtml(s);
  return h;
}
// 3 · DETTAGLI: tabelle complete, verifica sui mesi passati, metodo, costi
function _organicoVistaDettagli(s) {
  let h = '<h4 style="margin:0 0 8px">Mese per mese, tutte le colonne</h4>';
  h += _organicoTabellaMesi(s.base, s.ipotesi);
  h += '<h4 style="margin:14px 0 8px">Per gruppo dei turni</h4>';
  h += _organicoTabellaGruppi(s);
  h += _organicoVerificaHtml(s);
  h += _organicoMetodoHtml(s);
  h += _organicoCostiCardHtml();
  return h;
}
function _organicoTabellaMesi(A, B) {
  const th = (t, tip) => '<th' + (tip ? ' title="' + escP(tip) + '"' : '') + '>' + t + '</th>';
  let h =
    '<div style="overflow:auto"><table id="organico-mesi" class="piano-table" style="min-width:1100px;font-size:var(--fs-sm,.8125rem)"><thead><tr>';
  h += th('Mese') + th('Ore richieste', 'Posti del fabbisogno per la durata dei turni');
  h += th(
    'Ore di contratto',
    'Somma delle ore di contratto dell organico del mese (ausiliari alla percentuale di pianificazione)',
  );
  h +=
    th('Vacanze') +
    th('CGF') +
    th('Malattie', 'Mesi passati: quelle vere. Mesi futuri: tasso storico del mese') +
    th('Altri impegni', 'Corsi, formazione, JG, ufficio, permessi, turni in altri settori');
  h +=
    th('Ore nette', 'Ore di contratto meno le assenze') +
    th('Differenza ore') +
    th('Differenza tempi pieni', 'In tempi pieni netti del mese');
  h += th('Persone', 'In organico / minime per il giorno di punta / minime per le domeniche');
  h += th('Riserva malattie', 'Persone a chiamata perche nel 95% dei giorni ogni malattia improvvisa abbia copertura');
  h += th('Stato');
  if (B) h += th('Con le ipotesi', 'Differenza in tempi pieni e stato con le ipotesi del simulatore');
  h += '</tr></thead><tbody>';
  A.mesi.forEach((x, i) => {
    const st = OrganicoModello.statoMese(x);
    const col = st === 'sotto' ? 'var(--c-rosso,#c0392b)' : st === 'margine' ? 'var(--c-verde,#2c6e49)' : 'var(--ink)';
    const o = x.offerta;
    h +=
      '<tr' +
      (x.passato ? ' style="opacity:.75"' : '') +
      '><td style="text-align:left;font-weight:600">' +
      _orgMeseNome(x.mese) +
      (x.passato ? ' <span style="font-weight:400;color:var(--muted)">consuntivo</span>' : '') +
      '</td>';
    h +=
      '<td>' +
      _orgOre(x.oreRichieste) +
      '</td><td>' +
      _orgOre(o.contratto) +
      '</td><td>' +
      _orgOre(o.vacanze) +
      '</td><td>' +
      _orgOre(o.cgf) +
      '</td><td>' +
      _orgOre(o.malattia) +
      '</td><td>' +
      _orgOre(o.impegni) +
      '</td>';
    h += '<td><b>' + _orgOre(x.oreNette) + '</b></td>';
    h +=
      '<td style="color:' +
      (x.differenzaOre < 0 ? 'var(--c-rosso,#c0392b)' : 'var(--c-verde,#2c6e49)') +
      '">' +
      _orgSegno(Math.round(x.differenzaOre), _orgOre) +
      '</td>';
    h +=
      '<td style="color:' +
      col +
      ';font-weight:600">' +
      (x.oreRichieste ? _orgSegno(x.differenzaFte, _orgUno) : '') +
      '</td>';
    const testeOk = x.teste >= Math.max(x.testeMinPunta, x.testeMinDomenica);
    h +=
      '<td style="color:' +
      (testeOk ? 'inherit' : 'var(--c-rosso,#c0392b)') +
      '">' +
      x.teste +
      ' / ' +
      x.testeMinPunta +
      ' / ' +
      x.testeMinDomenica +
      '</td>';
    h +=
      '<td title="' +
      escP(
        'Malattie attese nel mese: ' +
          _orgUno(x.malattieAttese) +
          ' turni; giorni con almeno una malattia: ' +
          _orgUno(x.giorniConMalattia),
      ) +
      '">' +
      x.riservaMalattia +
      '</td>';
    h += '<td style="color:' + col + '">' + st + '</td>';
    if (B) {
      const y = B.mesi[i];
      const st2 = OrganicoModello.statoMese(y);
      h +=
        '<td style="color:' +
        (st2 === 'sotto' ? 'var(--c-rosso,#c0392b)' : 'var(--c-verde,#2c6e49)') +
        '">' +
        (y.oreRichieste ? _orgSegno(y.differenzaFte, _orgUno) + ' · ' + st2 : '') +
        '</td>';
    }
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function _organicoTabellaGruppi(s) {
  // stesso calcolo dei suggerimenti per gruppo (OrganicoModello.gruppi)
  const G = OrganicoModello.gruppi(s.dati, s.base);
  if (!G.length) return '<p style="color:var(--muted)">Nessun fabbisogno nei mesi rimasti.</p>';
  let h =
    '<div style="overflow:auto"><table id="organico-gruppi" class="piano-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Gruppo</th><th>Ore richieste (mesi rimasti)</th><th title="Ore richieste diviso le ore nette di un tempo pieno">Tempi pieni netti</th><th>Posti massimi in un giorno</th><th title="Posti del giorno di punta divisi per la quota di presenza media">Persone minime</th><th title="Collaboratori abilitati a quel gruppo: settori del piano, competenze o turni gia fatti in quel gruppo">Persone abilitate</th><th title="Persone abilitate in piu che servono: per il giorno di punta o perche le ore del gruppo superano le ore degli abilitati">Mancano</th><th style="text-align:left" title="Collaboratori gia in organico non abilitati, prima chi ha piu ore nette">Si potrebbero formare</th></tr></thead><tbody>';
  G.forEach((g) => {
    const rosso = g.servono > 0;
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(g.gruppo) +
      '</td><td>' +
      _orgOre(g.ore) +
      '</td><td>' +
      _orgUno(g.fte) +
      '</td><td>' +
      g.postiMax +
      '</td><td>' +
      g.minime +
      '</td><td style="color:' +
      (rosso ? 'var(--c-rosso,#c0392b)' : 'inherit') +
      '" title="' +
      escP(g.nomiAbilitati.join(', ')) +
      '">' +
      g.abilitati +
      '</td><td style="color:' +
      (rosso ? 'var(--c-rosso,#c0392b);font-weight:600' : 'inherit') +
      '">' +
      (g.servono || '') +
      '</td><td style="text-align:left">' +
      (g.servono ? escP(g.candidati.slice(0, Math.max(g.servono, 3)).join(', ') || 'nessuno: cercare fuori') : '') +
      '</td></tr>';
  });
  h +=
    '</tbody></table></div><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:4px 0 0">In rosso: servono persone abilitate in piu (per il giorno di punta o perche le ore del gruppo superano tutte le ore degli abilitati). Passa il mouse sul numero degli abilitati per vedere chi sono. Senza settori impostati una persona vale per tutti i gruppi.</p>';
  return h;
}

function _organicoSimulatoreHtml(s) {
  const opMese = (sel) => {
    let o = '';
    for (let m = 1; m <= 12; m++)
      o += '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + _orgMeseBreve(m) + '</option>';
    return o;
  };
  const meseOggi = parseInt(oggiLocale().substring(5, 7));
  const da = s.base.anno === parseInt(oggiLocale().substring(0, 4)) ? Math.min(12, meseOggi + 1) : 1;
  let h =
    '<h4 style="margin:16px 0 8px">Confronto mese per mese</h4><div style="border:1px solid var(--line);border-radius:3px;padding:10px 12px;background:var(--paper2)">';
  h += _organicoConfrontoHtml(s);
  h +=
    '<details style="margin-top:10px"' +
    (window._orgManoAperta ? ' open' : '') +
    ' ontoggle="window._orgManoAperta=this.open"><summary style="cursor:pointer;font-size:var(--fs-sm,.8125rem);font-weight:600">Aggiungi persone a mano o cambia la percentuale di un collaboratore</summary>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:8px">';
  // IPOTESI (05.10, richiesta del titolare): tipo, quante persone, dal / al come date,
  // orario dalle / alle con i giorni a settimana (oppure la percentuale) e il costo
  // orario di quell ipotesi. L orario diventa la percentuale: 20:00-02:00 per 5
  // giorni = 30 ore a settimana.
  const lab = (t, campo) => '<label style="font-size:var(--fs-sm,.8125rem)">' + t + '<br>' + campo + '</label>';
  const annoS = s.base.anno;
  const dalDef = annoS + '-' + String(da).padStart(2, '0') + '-01';
  const costi = s.par.costi || {};
  const oraFissoDef =
    costi.fissoAnno > 0 ? Math.round((costi.fissoAnno / ((s.par.oreSett || 41) * 52)) * 100) / 100 : '';
  h += lab(
    'Ipotesi',
    '<select id="org-tipo" onchange="organicoCostoDefault()"><option value="jolly">Ausiliario (jolly)</option><option value="fisso">Fisso</option></select>',
  );
  h += lab('Quanti', '<input type="number" id="org-quanti" min="1" max="50" value="1" style="width:56px">');
  h += lab('Dal', '<input type="date" id="org-dal" value="' + dalDef + '">');
  h += lab('Al', '<input type="date" id="org-al" value="' + annoS + '-12-31">');
  h += lab('Orario dalle', '<input type="time" id="org-ora-da" style="width:96px">');
  h += lab('alle', '<input type="time" id="org-ora-a" style="width:96px">');
  h += lab(
    'Giorni/sett.',
    '<select id="org-giorni">' +
      [1, 2, 3, 4, 5, 6, 7].map((g) => '<option' + (g === 5 ? ' selected' : '') + '>' + g + '</option>').join('') +
      '</select>',
  );
  h += lab(
    'oppure %',
    '<select id="org-pct">' +
      [100, 90, 80, 70, 60, 50, 40, 30, 20]
        .map((p) => '<option value="' + p / 100 + '"' + (p === 80 ? ' selected' : '') + '>' + p + '%</option>')
        .join('') +
      '</select>',
  );
  h += lab(
    'Costo orario CHF',
    '<input type="number" id="org-costo-ora" min="0" step="0.5" style="width:80px" data-fisso="' +
      oraFissoDef +
      '" data-aus="' +
      (costi.ausiliarioOra || '') +
      '" value="' +
      (costi.ausiliarioOra || '') +
      '">',
  );
  h += lab('Prezzo orario (ausiliari)', _orgSelPrezzo('org-prezzo', 'base'));
  h += lab('Vacanze (RAP)', _orgSelVac('org-vac', false));
  h += '<button class="btn-export" onclick="organicoAggiungiIpotesi()">Aggiungi</button>';
  h += '<span style="width:16px"></span>';
  h +=
    '<label style="font-size:var(--fs-sm,.8125rem)">Percentuale di un collaboratore<br><select id="org-pers">' +
    s.dati.persone
      .filter((p) => !p.jolly)
      .map(
        (p) => '<option value="' + escP(p.nome) + '">' + escP(p.nome) + ' (' + Math.round(p.pct * 100) + '%)</option>',
      )
      .join('') +
    '</select></label>';
  h +=
    '<label style="font-size:var(--fs-sm,.8125rem)">Nuova<br><select id="org-pers-pct">' +
    [100, 90, 80, 70, 60, 50].map((p) => '<option value="' + p / 100 + '">' + p + '%</option>').join('') +
    '</select></label>';
  h += '<button class="btn-export" onclick="organicoCambiaPercentuale()">Applica</button>';
  h += '</div></details></div>';
  return h;
}
// ipotesi applicate, risultato e tabella breve con la colonna "Con la soluzione"
function _organicoConfrontoHtml(s) {
  let h = '';
  const sc = s.scenario;
  const costoS = s.ipotesi ? OrganicoModello.costoScenario(s.base, s.ipotesi, s.par.costi, s.par) : null;
  // ipotesi nate dal calcolo con ausiliari: costo delle ore delle postazioni
  if (costoS)
    sc.aggiunte.forEach((a, i) => {
      if (!a.costoCalcolato) return;
      const d = (costoS.dettaglio || {})[i] || { chf: 0, ore: 0 };
      costoS.chf += a.costoCalcolato.chf - d.chf;
      costoS.ore += a.costoCalcolato.ore - d.ore;
      (costoS.dettaglio = costoS.dettaglio || {})[i] = { chf: a.costoCalcolato.chf, ore: a.costoCalcolato.ore };
    });
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7);
  const voci = sc.aggiunte
    .map(
      (a, i) =>
        '<span class="mini-badge" style="background:var(--accent2);font-size:var(--fs-sm,.8125rem)">' +
        escP(
          ((a.quanti || 1) > 1 ? a.quanti + ' x ' : '') +
            (a.jolly ? 'Ausiliario ' : 'Fisso ') +
            (a.orario
              ? a.orario.da + '-' + a.orario.a + ' ' + a.orario.giorni + ' g/sett. (' + Math.round(a.pct * 100) + '%) '
              : Math.round(a.pct * 100) + '% ') +
            gg(a.dal) +
            '-' +
            gg(a.al) +
            (a.oraCosto ? ' · ' + a.oraCosto + ' CHF/h' + (a.prezzoTipo === 'comprensivo' ? ' comprensivo' : '') : '') +
            (a.oraCosto && a.maggiorazioni
              ? [
                  a.maggiorazioni.notte
                    ? 'notturno 10% su ' + a.orario.notte + ' h di notte (+' + a.maggiorazioni.notte + '%)'
                    : '',
                  a.maggiorazioni.vacanze ? '+' + a.maggiorazioni.vacanze + '% vacanze' : '',
                  a.maggiorazioni.tredicesima ? '+' + a.maggiorazioni.tredicesima + '% 13a' : '',
                ]
                  .filter(Boolean)
                  .map((x) => ' ' + x)
                  .join('')
              : '') +
            (costoS && costoS.dettaglio && costoS.dettaglio[i] && costoS.dettaglio[i].chf
              ? ' = ' + _orgCHF(costoS.dettaglio[i].chf) + ' (' + _orgOre(costoS.dettaglio[i].ore) + ' h)'
              : ''),
        ) +
        ' <a href="#" style="color:#fff" onclick="organicoTogliIpotesi(' +
        i +
        ');return false">x</a></span>',
    )
    .concat(
      Object.keys(sc.percentuali).map(
        (n) =>
          '<span class="mini-badge" style="background:#1a7a6d;font-size:var(--fs-sm,.8125rem)">' +
          escP(n + ' ' + Math.round(sc.percentuali[n] * 100) + '%') +
          ' <a href="#" style="color:#fff" onclick="organicoTogliPercentuale(\'' +
          _jsArg(n) +
          '\');return false">x</a></span>',
      ),
    )
    .concat(
      (sc.vacanzeSposta || []).length
        ? [
            '<span class="mini-badge" style="background:#8b6914;font-size:var(--fs-sm,.8125rem)">' +
              escP(
                'Vacanze spostate: ' +
                  sc.vacanzeSposta
                    .map((v) => _orgMeseBreve(v.da) + '>' + _orgMeseBreve(v.a) + ' ' + Math.round(v.ore) + 'h')
                    .join(', '),
              ) +
              '</span>',
          ]
        : [],
    )
    .concat(
      Object.keys(sc.jollyPctMesi || {}).length
        ? [
            '<span class="mini-badge" style="background:#7b2d8b;font-size:var(--fs-sm,.8125rem)">' +
              escP(
                'Ausiliari: ' +
                  Object.keys(sc.jollyPctMesi)
                    .map((m) => _orgMeseBreve(+m) + ' ' + Math.round(sc.jollyPctMesi[m] * 100) + '%')
                    .join(', '),
              ) +
              '</span>',
          ]
        : [],
    );
  h +=
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    (voci.length
      ? voci.join(' ') + ' <button class="btn-act" onclick="organicoSvuotaIpotesi()">Togli tutte</button>'
      : '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">Ancora niente da confrontare: calcola cosa serve qui sopra e premi "Aggiungi al confronto", oppure prova una soluzione dalla Situazione.</span>') +
    '</div>';
  if (s.ipotesi) {
    const futuri = (A) => A.mesi.filter((x) => !x.passato && x.oreRichieste);
    const sotto = (A) => futuri(A).filter((x) => OrganicoModello.statoMese(x) === 'sotto').length;
    const ore = futuri(s.ipotesi).reduce((t, x, i) => t + (x.oreNette - futuri(s.base)[i].oreNette), 0);
    h +=
      '<div style="margin-top:8px;font-size:var(--fs-md,.875rem)"><b>Risultato:</b> mesi scoperti da ' +
      sotto(s.base) +
      ' a ' +
      sotto(s.ipotesi) +
      ' · ' +
      _orgSegno(Math.round(ore), _orgOre) +
      ' ore disponibili nei mesi rimasti' +
      (costoS ? ' · <b>Costo stimato:</b> ' + escP(_organicoCostoTesto(costoS)) : '') +
      '</div>';
    h += '<div style="margin-top:8px">' + _organicoTabellaSemplice(s.base, s.ipotesi) + '</div>';
  }
  return h;
}

function _organicoVerificaHtml(s) {
  const v = s.verifica;
  let h = '<h4 style="margin:16px 0 8px">Verifica sui mesi passati</h4>';
  if (!v.righe.length)
    return h + '<p style="color:var(--muted)">Nessun mese chiuso con fabbisogno nel ' + s.base.anno + '.</p>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 6px;max-width:900px">Per ogni mese chiuso: la carenza di ore che il modello calcola con le assenze vere, accanto a quello che e successo davvero. Ore scoperte = posti del fabbisogno rimasti senza nessuno; ore oltre contratto = ore fatte in piu dai fissi; ore non usate = ore di contratto dei fissi rimaste sotto il dovuto. La diagnosi dice da dove venivano i buchi.</p>';
  const DIAG = {
    organico: [
      'mancavano ore',
      'var(--c-rosso,#c0392b)',
      'Le ore nette del mese non bastavano per il fabbisogno: carenza di organico.',
    ],
    distribuzione: [
      'ore disponibili non usate',
      '#b8860b',
      'Ci sono stati posti scoperti mentre i fissi restavano sotto le ore dovute: i turni non sono finiti a chi aveva ore libere (distribuzione o abilitazioni ai gruppi), non mancavano persone.',
    ],
    misto: [
      'in parte',
      'var(--muted)',
      'Ore sufficienti nel complesso ma alcuni posti scoperti: da guardare giorno per giorno.',
    ],
    'in ordine': ['in ordine', 'var(--c-verde,#2c6e49)', 'Fabbisogno coperto.'],
  };
  h +=
    '<div style="overflow:auto"><table id="organico-verifica" class="piano-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Mese</th><th>Carenza secondo il modello</th><th>Ore scoperte</th><th>Ore oltre contratto</th><th>Ore non usate</th><th>Diagnosi</th></tr></thead><tbody>';
  v.righe.forEach((r) => {
    const d = DIAG[r.diagnosi] || DIAG['in ordine'];
    h +=
      '<tr><td style="text-align:left">' +
      _orgMeseNome(r.mese) +
      '</td><td>' +
      _orgOre(r.mancanzaModello) +
      '</td><td>' +
      _orgOre(r.scopertiOre) +
      '</td><td>' +
      _orgOre(r.oreExtra) +
      '</td><td>' +
      _orgOre(r.oreSotto) +
      '</td><td style="color:' +
      d[1] +
      ';text-align:left" title="' +
      escP(d[2]) +
      '">' +
      d[0] +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  const nDist = v.righe.filter((r) => r.diagnosi === 'distribuzione').length;
  const nOrg = v.righe.filter((r) => r.diagnosi === 'organico').length;
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);margin:6px 0 0">' +
    (nOrg ? '<b>' + nOrg + '</b> mesi con ore mancanti (organico). ' : '') +
    (nDist
      ? '<b>' +
        nDist +
        '</b> mesi con posti scoperti mentre c erano ore libere: li conviene guardare la distribuzione dei turni e le abilitazioni ai gruppi (tabella per reparto interno), prima di aggiungere persone. '
      : '') +
    (v.correlazione != null
      ? 'Correlazione tra carenza del modello e pressione reale (ore scoperte + ore oltre contratto): ' +
        v.correlazione.toFixed(2) +
        ' su ' +
        v.righe.length +
        ' mesi.'
      : '') +
    '</p>';
  return h;
}

function _organicoMetodoHtml(s) {
  const P = s.par;
  let h =
    '<h4 style="margin:16px 0 8px">Metodo e ipotesi</h4><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);max-width:900px;line-height:1.55">';
  h +=
    '<p style="margin:0 0 6px"><b>1. Ore.</b> Ore richieste = posti del fabbisogno per la durata dei turni (anche i giorni che chiudono piu tardi). Ore nette = ore di contratto (' +
    P.oreSett +
    ' ore settimanali per la percentuale; ausiliari al ' +
    Math.round(P.jollyPct * 100) +
    '%) meno vacanze, CGF, malattie, altri impegni e congedi non pagati. Differenza in tempi pieni = differenza di ore diviso le ore nette di un tempo pieno del mese.</p>';
  h +=
    '<p style="margin:0 0 6px"><b>2. Persone.</b> Il giorno di punta chiede almeno posti / quota di presenza; le domeniche almeno posti / (' +
    (52 - P.domenicheLibere) +
    '/52 x quota di presenza), perche ognuno ha ' +
    P.domenicheLibere +
    ' domeniche libere all anno. Una persona a tempo parziale conta come una persona intera nel giorno in cui lavora.</p>';
  h +=
    '<p style="margin:0 0 6px"><b>3. Affidabilita.</b> Le malattie arrivano a caso: con la distribuzione binomiale (posti del giorno, tasso di malattia del mese) si calcola quante persone a chiamata servono perche nel ' +
    Math.round(P.livelloServizio * 100) +
    '% dei giorni ogni assenza improvvisa trovi copertura. <select onchange="window._organicoLivello=parseFloat(this.value);organicoRicalcola()" style="font-size:var(--fs-sm,.8125rem)">' +
    [0.9, 0.95, 0.99]
      .map(
        (x) =>
          '<option value="' +
          x +
          '"' +
          (x === P.livelloServizio ? ' selected' : '') +
          '>' +
          Math.round(x * 100) +
          '%</option>',
      )
      .join('') +
    '</select></p>';
  h +=
    '<p style="margin:0 0 6px"><b>Dati.</b> Mesi passati: assenze vere dal piano. Mesi futuri: vacanze, CGF e congedi gia nel piano; dove il mese non e ancora pianificato, la quota media del diritto annuo; malattie e impegni dal tasso storico del mese, avvicinato alla media annua quando i giorni osservati sono pochi. I turni fatti in un altro settore contano come impegni. Organico = collaboratori di questo settore (chi copre da un altro resta nel suo).</p>';
  h +=
    '<p style="margin:0 0 6px"><b>Suggerimenti.</b> Una carenza presente in tutti i mesi rimasti diventa un fisso (o percentuali piu alte per chi lo desidera); una carenza solo in alcuni mesi un ausiliario per quel periodo; poche persone per domeniche e punte un ausiliario a percentuale bassa. Ogni suggerimento mostra l effetto ricalcolato. Sono proposte da valutare, non decisioni automatiche.</p>' +
    '<p style="margin:0 0 6px"><b>Per gruppo.</b> Per ogni gruppo dei turni (sala, cassa, accoglienza...) servono abbastanza persone abilitate per il giorno di punta, e le loro ore nette devono bastare per le ore del gruppo (lavorano anche negli altri gruppi, quindi e il minimo). Quando mancano, prima si propone di formare chi c e gia, partendo da chi ha piu ore libere; se non basta, le proposte di assunzione dicono quale profilo cercare.</p>' +
    (P.costi
      ? '<p style="margin:0 0 6px"><b>Costi.</b> Ore di contratto in piu nei mesi rimasti per il costo orario: fisso = ' +
        _orgCHF(P.costi.fissoAnno) +
        ' all anno / ' +
        P.oreSett * 52 +
        ' ore; ausiliario = ' +
        _orgCHF(P.costi.ausiliarioOra) +
        ' all ora sulle ore pianificate. Spostare vacanze e formare chi c e gia non aggiungono ore di contratto (la formazione ha costi propri, non calcolati).</p>'
      : '');
  h += '</div>';
  return h;
}

// ---------------------------------------------------------------- azioni
async function organicoRicalcola() {
  await _organicoCalcola(true);
  renderPiano();
}
function organicoProvaSuggerimento(i) {
  const g = _orgStato && _orgStato.sugg[i];
  if (!g || !g.scenario) return;
  const sc = _orgStato.scenario;
  sc.aggiunte = sc.aggiunte.concat(g.scenario.aggiunte || []);
  Object.assign(sc.percentuali, g.scenario.percentuali || {});
  if (g.scenario.vacanzeSposta) sc.vacanzeSposta = (sc.vacanzeSposta || []).concat(g.scenario.vacanzeSposta);
  if (g.scenario.jollyPctMesi) sc.jollyPctMesi = Object.assign({}, sc.jollyPctMesi || {}, g.scenario.jollyPctMesi);
  _organicoRicalcolaScenario();
  window._orgVista = 'soluzione';
  renderPiano();
}
// costo orario proposto secondo il tipo (medio dell ausiliario o del fisso)
function organicoCostoDefault() {
  const c = document.getElementById('org-costo-ora');
  const t = (document.getElementById('org-tipo') || {}).value;
  if (c) c.value = t === 'fisso' ? c.dataset.fisso || '' : c.dataset.aus || '';
}
function organicoAggiungiIpotesi() {
  if (!_orgStato) return;
  const anno = _orgStato.base.anno;
  const v = (id) => (document.getElementById(id) || {}).value;
  const dal = v('org-dal') || anno + '-01-01';
  const al = v('org-al') || anno + '-12-31';
  if (al < dal) {
    toast('La data "al" e prima di "dal"');
    return;
  }
  if (dal.substring(0, 4) !== String(anno) || al.substring(0, 4) !== String(anno)) {
    toast('Le date devono stare nel ' + anno + ' (l anno dell analisi)');
    return;
  }
  // orario dalle / alle: ore al giorno per i giorni a settimana = la percentuale
  const oraDa = v('org-ora-da');
  const oraA = v('org-ora-a');
  let pct = parseFloat(v('org-pct'));
  let orario = null;
  if (oraDa && oraA) {
    const min = (x) => parseInt(x.substring(0, 2)) * 60 + parseInt(x.substring(3, 5));
    let ore = (min(oraA) - min(oraDa)) / 60;
    if (ore <= 0) ore += 24; // oltre la mezzanotte
    const gg = parseInt(v('org-giorni')) || 5;
    const oreSett = _orgStato.par.oreSett || 41;
    pct = Math.round(Math.min(1, (ore * gg) / oreSett) * 1000) / 1000;
    orario = { da: oraDa, a: oraA, ore: Math.round(ore * 100) / 100, giorni: gg };
  } else if (oraDa || oraA) {
    toast('Orario: servono sia "dalle" sia "alle" (oppure nessuno dei due e la percentuale)');
    return;
  }
  const costo = parseFloat(v('org-costo-ora'));
  // MAGGIORAZIONI sul costo orario (dalle Regole, come nel piano): notturno sulle ore
  // fra notte_inizio e notte_fine (10%); per gli ausiliari anche le indennita di
  // vacanze (4 settimane, 8.33%) e tredicesima (8.33%) del RAP Allegato 1
  const jolly = v('org-tipo') === 'jolly';
  const prezzoTipo = v('org-prezzo') || 'base';
  const rap = _orgRapPercentuali(jolly, prezzoTipo, v('org-vac') === '5');
  let pNotte = 0;
  if (orario && typeof _pianoOreNotturneTurno === 'function') {
    const oreN = _pianoOreNotturneTurno({ ora_inizio: orario.da, ora_fine: orario.a });
    if (oreN && orario.ore) pNotte = ((oreN * rap.notte) / 100 / orario.ore) * 100;
    orario.notte = Math.round(oreN * 100) / 100;
  }
  const pVac = rap.vacanze;
  const p13 = rap.tredicesima;
  const maggiorazioni = {
    notte: Math.round(pNotte * 100) / 100,
    vacanze: pVac,
    tredicesima: p13,
  };
  const fattoreCosto = (1 + pNotte / 100) * (1 + (pVac + p13) / 100);
  const quanti = Math.max(1, Math.min(50, parseInt(v('org-quanti')) || 1));
  // AUSILIARIO CON ORARIO E COSTO ORARIO: si paga solo il lavorato, come nel calcolatore
  // (prima si pagavano le ore di contratto, assenze comprese, e lo stesso ausiliario
  // costava diverso nei due strumenti). Ore = orario x giorni a settimana nel periodo;
  // i festivi parificati che cadono nei giorni di lavoro hanno il 50% in piu (RAP).
  let costoCalcolato = null;
  if (jolly && orario && costo > 0) {
    let giorniPeriodo = 0;
    for (let d = new Date(dal + 'T12:00:00'); dataLocaleISO(d) <= al; d.setDate(d.getDate() + 1)) giorniPeriodo++;
    const quotaGiorni = (orario.giorni || 5) / 7;
    const oreTot = orario.ore * giorniPeriodo * quotaGiorni * quanti;
    const festPar = (typeof pianoFestiviCache !== 'undefined' ? pianoFestiviCache : []).filter(
      (f) =>
        f.data >= dal && f.data <= al && typeof _pianoFestivoParificato === 'function' && _pianoFestivoParificato(f),
    ).length;
    const oreFestivi = orario.ore * festPar * quotaGiorni * quanti;
    costoCalcolato = {
      ore: Math.round(oreTot),
      chf: Math.round(oreTot * costo * fattoreCosto + oreFestivi * costo * 0.5),
    };
  }
  _orgStato.scenario.aggiunte.push({
    maggiorazioni: maggiorazioni,
    prezzoTipo: jolly ? prezzoTipo : null,
    // indennita RAP calcolate anche sul supplemento notturno (salario delle ore lavorate)
    fattoreCosto: fattoreCosto,
    jolly: jolly,
    pct: pct,
    quanti: quanti,
    dal: dal,
    al: al,
    orario: orario,
    oraCosto: costo > 0 ? costo : null,
    costoCalcolato: costoCalcolato,
  });
  _organicoRicalcolaScenario();
  renderPiano();
}
function organicoTogliIpotesi(i) {
  _orgStato.scenario.aggiunte.splice(i, 1);
  _organicoRicalcolaScenario();
  renderPiano();
}
function organicoCambiaPercentuale() {
  const n = (document.getElementById('org-pers') || {}).value;
  const p = parseFloat((document.getElementById('org-pers-pct') || {}).value);
  if (!n || !p) return;
  _orgStato.scenario.percentuali[n] = p;
  _organicoRicalcolaScenario();
  renderPiano();
}
function organicoTogliPercentuale(n) {
  delete _orgStato.scenario.percentuali[n];
  _organicoRicalcolaScenario();
  renderPiano();
}
function organicoSvuotaIpotesi() {
  _orgStato.scenario = { aggiunte: [], percentuali: {} };
  _organicoRicalcolaScenario();
  renderPiano();
}
async function organicoEsportaExcel() {
  if (!_orgStato) return;
  if (!(await assicuraLibreria('xlsx'))) return;
  const wb = XLSX.utils.book_new();
  // le tabelle complete si costruiscono qui: a schermo c e solo il passo aperto
  const box = document.createElement('div');
  box.innerHTML =
    _organicoTabellaMesi(_orgStato.base, null) + _organicoTabellaGruppi(_orgStato) + _organicoVerificaHtml(_orgStato);
  ['organico-mesi', 'organico-gruppi', 'organico-verifica'].forEach((id, i) => {
    const t = box.querySelector('#' + id);
    if (!t) return;
    const ws = XLSX.utils.table_to_sheet(t, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws, ['Mese per mese', 'Gruppi', 'Verifica'][i]);
  });
  const nome = 'organico_' + _orgStato.dati.reparto + '_' + _orgStato.base.anno + '_' + oggiLocale() + '.xlsx';
  XLSX.writeFile(wb, nome);
  logAzione('Esportazione Excel', nome);
  toast('Esportato: ' + nome);
}
async function organicoRapportoPdf() {
  if (!_orgStato) return;
  if (!(await assicuraLibreria('jspdf'))) return;
  const s = _orgStato;
  const A = s.base;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const repLbl = typeof repartoLabel === 'function' ? repartoLabel(s.dati.reparto) : s.dati.reparto;
  doc.setFontSize(15);
  doc.text('Analisi dell organico · ' + repLbl + ' · ' + A.anno, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    'Casino Lugano SA · generata il ' +
      new Date().toLocaleDateString('it-IT') +
      ' da ' +
      (getOperatore() || '') +
      ' · dati del piano di lavoro',
    14,
    22,
  );
  doc.setTextColor(0);
  let y = 28;
  const testo = (t, size) => {
    doc.setFontSize(size || 9);
    const righe = doc.splitTextToSize(t, pw - 28);
    if (y + righe.length * 4.2 > 195) {
      doc.addPage();
      y = 16;
    }
    doc.text(righe, 14, y);
    y += righe.length * 4.2 + 2;
  };
  testo('Suggerimenti', 11);
  if (!s.sugg.length) testo('Nessun intervento suggerito: il fabbisogno e coperto nei mesi rimasti.');
  s.sugg.forEach((g) => {
    testo(
      '- ' +
        g.titolo +
        '. ' +
        g.motivo +
        (g.effetto
          ? ' Effetto calcolato: mesi sotto il fabbisogno da ' +
            g.effetto.mesiSottoPrima +
            ' a ' +
            g.effetto.mesiSottoDopo +
            ', ' +
            _orgOre(g.effetto.oreCoperte) +
            ' ore di carenza coperte.' +
            (g.effetto.costo ? ' Costo stimato: ' + _organicoCostoTesto(g.effetto.costo) + '.' : '')
          : '') +
        (g.effettoTesto ? ' Effetto: ' + g.effettoTesto + '.' : ''),
    );
  });
  doc.autoTable({
    startY: y + 2,
    theme: 'grid',
    head: [
      [
        'Mese',
        'Ore richieste',
        'Contratto',
        'Vacanze',
        'CGF',
        'Malattie',
        'Impegni',
        'Ore nette',
        'Diff. ore',
        'Diff. tempi pieni',
        'Persone (organico/punta/domeniche)',
        'Riserva malattie',
        'Stato',
      ],
    ],
    body: A.mesi.map((x) => [
      _orgMeseNome(x.mese) + (x.passato ? ' (consuntivo)' : ''),
      _orgOre(x.oreRichieste),
      _orgOre(x.offerta.contratto),
      _orgOre(x.offerta.vacanze),
      _orgOre(x.offerta.cgf),
      _orgOre(x.offerta.malattia),
      _orgOre(x.offerta.impegni),
      _orgOre(x.oreNette),
      _orgSegno(Math.round(x.differenzaOre), _orgOre),
      x.oreRichieste ? _orgSegno(x.differenzaFte, _orgUno) : '',
      x.teste + ' / ' + x.testeMinPunta + ' / ' + x.testeMinDomenica,
      x.riservaMalattia,
      OrganicoModello.statoMese(x),
    ]),
    headStyles: { fillColor: [26, 74, 122], fontSize: 7 },
    bodyStyles: { fontSize: 7.5, halign: 'center' },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 6;
  const GP = OrganicoModello.gruppi(s.dati, A);
  if (GP.length) {
    testo('Per gruppo (mesi rimasti)', 11);
    doc.autoTable({
      startY: y,
      theme: 'grid',
      head: [
        [
          'Gruppo',
          'Ore richieste',
          'Tempi pieni netti',
          'Persone minime',
          'Abilitate',
          'Mancano',
          'Si potrebbero formare',
        ],
      ],
      body: GP.map((g) => [
        g.gruppo,
        _orgOre(g.ore),
        _orgUno(g.fte),
        g.minime,
        g.abilitati,
        g.servono || '',
        g.servono ? g.candidati.slice(0, Math.max(g.servono, 3)).join(', ') || 'nessuno: cercare fuori' : '',
      ]),
      headStyles: { fillColor: [26, 74, 122], fontSize: 7 },
      bodyStyles: { fontSize: 7.5, halign: 'center' },
      columnStyles: { 6: { halign: 'left' } },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  if (s.verifica.righe.length) {
    testo(
      'Verifica sui mesi passati' +
        (s.verifica.correlazione != null ? ' (correlazione ' + s.verifica.correlazione.toFixed(2) + ')' : ''),
      11,
    );
    doc.autoTable({
      startY: y,
      theme: 'grid',
      head: [['Mese', 'Carenza secondo il modello', 'Ore scoperte', 'Ore oltre contratto', 'Pressione reale']],
      body: s.verifica.righe.map((r) => [
        _orgMeseNome(r.mese),
        _orgOre(r.mancanzaModello),
        _orgOre(r.scopertiOre),
        _orgOre(r.oreExtra),
        _orgOre(r.pressioneReale),
      ]),
      headStyles: { fillColor: [139, 105, 20], fontSize: 7 },
      bodyStyles: { fontSize: 7.5, halign: 'center' },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  testo('Metodo', 11);
  testo(
    'Ore: ore richieste dal fabbisogno contro ore nette (contratto meno vacanze, CGF, malattie, altri impegni e congedi non pagati). Persone: minimo di presenti per il giorno di punta e per le domeniche (' +
      s.par.domenicheLibere +
      ' libere all anno a testa). Affidabilita: riserva a chiamata per coprire le malattie improvvise nel ' +
      Math.round(s.par.livelloServizio * 100) +
      '% dei giorni (distribuzione binomiale). Mesi passati con i dati veri, mesi futuri con le assenze note piu le malattie attese dallo storico. Tasso di malattia osservato: ' +
      _orgUno(A.tassi.media.malattia * 100) +
      '% dei giorni di servizio. I suggerimenti sono proposte da valutare.',
  );
  const nome = 'analisi_organico_' + s.dati.reparto + '_' + A.anno + '.pdf';
  doc.save(nome);
  logAzione('Rapporto organico PDF', nome);
}

// MAGGIORAZIONI SECONDO IL RAP (Allegato 1), percentuali dalle Regole:
//  - ausiliari: indennita vacanze 8.33% (4 settimane) o 10.65% (5) e tredicesima 8.33%
//    sul salario orario, pagate con le ore lavorate. Si aggiungono solo se il prezzo
//    inserito e il SALARIO DI BASE; con il prezzo COMPRENSIVO sono gia dentro;
//  - notturno: 10% delle ore fra notte_inizio e notte_fine (tempo libero pagato);
//  - festivi (ausiliari): +50% nelle ore dei nove festivi parificati alle domeniche.
function _orgRapPercentuali(jolly, prezzoTipo, vac5) {
  const regola = (n, def) => {
    const x = parseFloat(typeof _pianoRegolaVal === 'function' ? _pianoRegolaVal(n) : NaN);
    return !isNaN(x) ? x : def;
  };
  const base = jolly && prezzoTipo !== 'comprensivo';
  return {
    vacanze: base
      ? vac5
        ? regola('jolly_indennita_vacanze_5sett', 10.65)
        : regola('jolly_indennita_vacanze_4sett', 8.33)
      : 0,
    tredicesima: base ? regola('jolly_indennita_tredicesima', 8.33) : 0,
    notte: regola('notte_percentuale', 10),
    festivo: jolly ? 50 : 0,
  };
}
function _orgSelPrezzo(id, val) {
  return (
    '<select id="' +
    id +
    '" title="RAP Allegato 1: con il salario di base si aggiungono indennita vacanze e tredicesima; il prezzo comprensivo le contiene gia"><option value="base"' +
    (val !== 'comprensivo' ? ' selected' : '') +
    '>Salario di base (+ indennita RAP)</option><option value="comprensivo"' +
    (val === 'comprensivo' ? ' selected' : '') +
    '>Comprensivo di vacanze e 13a</option></select>'
  );
}
function _orgSelVac(id, v5) {
  return (
    '<select id="' +
    id +
    '"><option value="4"' +
    (!v5 ? ' selected' : '') +
    '>4 settimane (8.33%)</option><option value="5"' +
    (v5 ? ' selected' : '') +
    '>5 settimane (10.65%)</option></select>'
  );
}
// CALCOLO DEL FABBISOGNO (05.10, richiesta del titolare): "mi servono due persone, una
// dalle 15 alle 18 e una dalle 16 alle 22, dal lunedi al giovedi, da ... a ...":
// ore sui giorni veri del periodo (anche di notte), quanti collaboratori servono
// (percentuale scelta, assenze medie dello storico, persone insieme negli orari che si
// sovrappongono) e costo con notturno e indennita degli ausiliari (Regole).
const _ORG_GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']; // lunedi = 0
let _orgCalc = null;
function _orgCalcStato(s) {
  if (!_orgCalc) {
    const anno = s.base.anno;
    const m = Math.min(12, parseInt(oggiLocale().substring(5, 7)) + 1);
    _orgCalc = {
      dal: anno + '-' + String(m).padStart(2, '0') + '-01',
      al: anno + '-12-31',
      tipo: 'jolly',
      pct: 0.8,
      costo: (s.par.costi || {}).ausiliarioOra || '',
      righe: [{ da: '15:00', a: '18:00', giorni: [0, 1, 2, 3], quante: 1 }],
      esito: null,
    };
  }
  return _orgCalc;
}
function _organicoCalcoloHtml(s) {
  const c = _orgCalcStato(s);
  const lab = (t, campo) => '<label style="font-size:var(--fs-sm,.8125rem)">' + t + '<br>' + campo + '</label>';
  let h =
    '<h4 style="margin:0 0 8px">Cosa serve</h4>' +
    '<div style="border:1px solid var(--line);border-radius:3px;padding:10px 12px;background:var(--paper2)">' +
    '<p style="margin:0 0 8px;color:var(--muted);font-size:var(--fs-sm,.8125rem)">Le postazioni che servono (orario, giorni, quante persone insieme) nel periodo: il programma calcola le ore, quante persone servono e il costo.</p>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">';
  h += lab('Dal', '<input type="date" id="orgc-dal" value="' + c.dal + '" onchange="organicoCalcSalva()">');
  h += lab('Al', '<input type="date" id="orgc-al" value="' + c.al + '" onchange="organicoCalcSalva()">');
  h += lab(
    'Con',
    '<select id="orgc-tipo" onchange="organicoCalcSalva(true)"><option value="jolly"' +
      (c.tipo === 'jolly' ? ' selected' : '') +
      '>Ausiliari (jolly)</option><option value="fisso"' +
      (c.tipo === 'fisso' ? ' selected' : '') +
      '>Fissi</option></select>',
  );
  h += lab(
    'Percentuale di ognuno',
    '<select id="orgc-pct" onchange="organicoCalcSalva()">' +
      [100, 90, 80, 70, 60, 50, 40, 30, 20]
        .map(
          (p) =>
            '<option value="' +
            p / 100 +
            '"' +
            (Math.round(c.pct * 100) === p ? ' selected' : '') +
            '>' +
            p +
            '%</option>',
        )
        .join('') +
      '</select>',
  );
  h += lab(
    'Costo orario CHF',
    '<input type="number" id="orgc-costo" min="0" step="0.5" style="width:80px" value="' +
      escP(String(c.costo)) +
      '" onchange="organicoCalcSalva()">',
  );
  if (c.tipo === 'jolly') {
    h += lab(
      'Prezzo orario',
      _orgSelPrezzo('orgc-prezzo', c.prezzoTipo).replace('<select ', '<select onchange="organicoCalcSalva()" '),
    );
    h += lab(
      'Vacanze (RAP)',
      _orgSelVac('orgc-vac', c.vac5).replace('<select ', '<select onchange="organicoCalcSalva()" '),
    );
  }
  h +=
    '</div><table class="fzp-tab" style="margin-top:8px"><thead><tr><th>Dalle</th><th>Alle</th><th>Giorni</th><th>Persone insieme</th><th></th></tr></thead><tbody>';
  c.righe.forEach((r, i) => {
    h +=
      '<tr><td><input type="time" value="' +
      r.da +
      '" onchange="organicoCalcRiga(' +
      i +
      ',\'da\',this.value)"></td><td><input type="time" value="' +
      r.a +
      '" onchange="organicoCalcRiga(' +
      i +
      ',\'a\',this.value)"></td><td style="white-space:nowrap">' +
      _ORG_GIORNI
        .map(
          (g, k) =>
            '<label style="margin-right:4px"><input type="checkbox"' +
            (r.giorni.includes(k) ? ' checked' : '') +
            ' onchange="organicoCalcGiorno(' +
            i +
            ',' +
            k +
            ',this.checked)">' +
            g +
            '</label>',
        )
        .join('') +
      '</td><td><input type="number" min="1" max="20" value="' +
      r.quante +
      '" style="width:56px" onchange="organicoCalcRiga(' +
      i +
      ',\'quante\',this.value)"></td><td><button class="btn-del-tipo" onclick="organicoCalcTogli(' +
      i +
      ')">Togli</button></td></tr>';
  });
  h +=
    '</tbody></table><div style="margin-top:8px;display:flex;gap:8px"><button class="btn-act" onclick="organicoCalcAggiungi()">+ Postazione</button><button class="btn-export" onclick="organicoCalcola()">Calcola</button></div>';
  if (c.esito) h += c.esito;
  h += '</div>';
  return h;
}
function organicoCalcSalva(tipoCambiato) {
  const c = _orgCalc;
  if (!c) return;
  const v = (id) => (document.getElementById(id) || {}).value;
  c.dal = v('orgc-dal') || c.dal;
  c.al = v('orgc-al') || c.al;
  c.tipo = v('orgc-tipo') || c.tipo;
  c.pct = parseFloat(v('orgc-pct')) || c.pct;
  c.costo = v('orgc-costo');
  if (document.getElementById('orgc-prezzo')) c.prezzoTipo = v('orgc-prezzo');
  if (document.getElementById('orgc-vac')) c.vac5 = v('orgc-vac') === '5';
  if (tipoCambiato && _orgStato) {
    const k = _orgStato.par.costi || {};
    c.costo =
      c.tipo === 'fisso'
        ? k.fissoAnno > 0
          ? Math.round((k.fissoAnno / ((_orgStato.par.oreSett || 41) * 52)) * 100) / 100
          : ''
        : k.ausiliarioOra || '';
    c.pct = c.tipo === 'fisso' ? 1 : 0.8;
    renderPiano();
  }
}
function organicoCalcRiga(i, campo, val) {
  const r = _orgCalc && _orgCalc.righe[i];
  if (!r) return;
  r[campo] = campo === 'quante' ? Math.max(1, Math.min(20, parseInt(val) || 1)) : val;
}
function organicoCalcGiorno(i, k, si) {
  const r = _orgCalc && _orgCalc.righe[i];
  if (!r) return;
  r.giorni = si ? [...new Set(r.giorni.concat([k]))].sort() : r.giorni.filter((x) => x !== k);
}
function organicoCalcAggiungi() {
  organicoCalcSalva();
  _orgCalc.righe.push({ da: '16:00', a: '22:00', giorni: [0, 1, 2, 3], quante: 1 });
  renderPiano();
}
function organicoCalcTogli(i) {
  organicoCalcSalva();
  _orgCalc.righe.splice(i, 1);
  renderPiano();
}
function organicoCalcola() {
  if (!_orgStato || !_orgCalc) return;
  organicoCalcSalva();
  const c = _orgCalc;
  const s = _orgStato;
  if (!c.dal || !c.al || c.al < c.dal) {
    toast('Periodo: la data "al" e prima di "dal"');
    return;
  }
  const min = (x) => parseInt(String(x).substring(0, 2)) * 60 + parseInt(String(x).substring(3, 5));
  const righe = c.righe.filter((r) => r.da && r.a && r.giorni.length);
  if (!righe.length) {
    toast('Aggiungi almeno una postazione con orario e giorni');
    return;
  }
  // giorni del periodo per giorno della settimana
  const perDow = [0, 0, 0, 0, 0, 0, 0];
  let nGiorni = 0;
  for (let d = new Date(c.dal + 'T12:00:00'); dataLocaleISO(d) <= c.al; d.setDate(d.getDate() + 1)) {
    perDow[(d.getDay() + 6) % 7]++;
    nGiorni++;
  }
  // festivi parificati del periodo (supplemento 50% degli ausiliari)
  const festPar = (typeof pianoFestiviCache !== 'undefined' ? pianoFestiviCache : []).filter(
    (f) =>
      f.data >= c.dal && f.data <= c.al && typeof _pianoFestivoParificato === 'function' && _pianoFestivoParificato(f),
  );
  let oreFestivi = 0;
  let ore = 0;
  let oreNotte = 0;
  const dettagli = righe.map((r) => {
    let durata = (min(r.a) - min(r.da)) / 60;
    if (durata <= 0) durata += 24;
    const notte =
      typeof _pianoOreNotturneTurno === 'function' ? _pianoOreNotturneTurno({ ora_inizio: r.da, ora_fine: r.a }) : 0;
    const giorni = r.giorni.reduce((t, k) => t + perDow[k], 0);
    const o = durata * giorni * r.quante;
    const n = notte * giorni * r.quante;
    festPar.forEach((f) => {
      if (r.giorni.includes((new Date(f.data + 'T12:00:00').getDay() + 6) % 7)) oreFestivi += durata * r.quante;
    });
    ore += o;
    oreNotte += n;
    return { r: r, durata: durata, giorni: giorni, ore: o, notte: n };
  });
  // persone insieme: il massimo di postazioni aperte nello stesso quarto d ora, su una
  // settimana intera (lunedi 00.00 - domenica 24.00, poi si ricomincia): chi lavora oltre
  // la mezzanotte si somma a chi comincia il giorno dopo (prima no) e gli orari non al
  // quarto d ora (15.10) occupano tutto il quarto (prima l indice non era intero e il
  // conteggio si perdeva)
  const Q = 7 * 96;
  const conta = new Array(Q).fill(0);
  righe.forEach((r) =>
    r.giorni.forEach((k) => {
      const a = Math.floor(min(r.da) / 15);
      let b = Math.ceil(min(r.a) / 15);
      if (b <= a) b += 96;
      for (let q = a; q < b; q++) conta[(k * 96 + q) % Q] += r.quante;
    }),
  );
  const insieme = Math.max(0, ...conta);
  // quota netta (assenze medie: malattie, impegni, vacanze dei fissi) dallo storico
  // del settore, solo i mesi rimasti e il tipo di persona scelto
  const jolly = c.tipo === 'jolly';
  let contr = 0;
  let netto = 0;
  s.base.mesi.forEach((x) => {
    if (x.passato) return;
    (x.offerta.persone || [])
      .filter((p) => !!p.jolly === jolly && !p.ipotetica)
      .forEach((p) => {
        contr += p.contratto;
        netto += p.netto;
      });
  });
  const quota = contr > 0 ? netto / contr : jolly ? 0.9 : 0.8;
  const oreSett = s.par.oreSett || 41;
  const oreNettePersona = nGiorni * (oreSett / 7) * c.pct * quota;
  const perOre = oreNettePersona > 0 ? Math.ceil(ore / oreNettePersona - 0.001) : 0;
  const perInsieme = Math.ceil(insieme / Math.max(0.5, quota) - 0.001);
  const persone = Math.max(perOre, perInsieme);
  const fte = oreNettePersona > 0 ? ore / (nGiorni * (oreSett / 7) * quota) : 0;
  // costo: ore per il costo orario + notturno + (ausiliari) indennita
  const prezzo = parseFloat(c.costo) || 0;
  const rap = _orgRapPercentuali(jolly, c.prezzoTipo, c.vac5);
  const pNotte = rap.notte;
  const pVac = rap.vacanze;
  const p13 = rap.tredicesima;
  const base = ore * prezzo;
  const cNotte = oreNotte * prezzo * (pNotte / 100);
  const cFest = oreFestivi * prezzo * (rap.festivo / 100);
  // indennita RAP sul salario delle ore lavorate (con supplementi), solo con il salario di base
  const cInd = (base + cNotte + cFest) * ((pVac + p13) / 100);
  const tot = base + cNotte + cFest + cInd;
  const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('it-CH');
  const gg = (d) => d.substring(8, 10) + '.' + d.substring(5, 7) + '.' + d.substring(0, 4);
  let e =
    '<div style="margin-top:10px;font-size:var(--fs-md,.875rem);line-height:1.6"><b>Periodo ' +
    gg(c.dal) +
    ' - ' +
    gg(c.al) +
    '</b> (' +
    nGiorni +
    ' giorni)<br>' +
    dettagli
      .map(
        (d) =>
          '&bull; ' +
          d.r.da +
          '-' +
          d.r.a +
          ' ' +
          d.r.giorni.map((k) => _ORG_GIORNI[k]).join('') +
          (d.r.quante > 1 ? ' x ' + d.r.quante : '') +
          ': ' +
          d.giorni +
          ' giorni, ' +
          f1(d.ore) +
          ' ore' +
          (d.notte ? ' (di notte ' + f1(d.notte) + ')' : ''),
      )
      .join('<br>') +
    '<br><b>Totale: ' +
    f1(ore) +
    ' ore</b>' +
    (oreNotte ? ', di cui ' + f1(oreNotte) + ' di notte' : '') +
    '<br><b>Servono ' +
    persone +
    ' ' +
    (jolly ? 'ausiliari' : 'fissi') +
    ' al ' +
    Math.round(c.pct * 100) +
    '%</b> (' +
    perOre +
    ' per le ore, ' +
    perInsieme +
    ' per avere sempre ' +
    insieme +
    (insieme === 1 ? ' persona' : ' persone insieme') +
    ' anche con le assenze) · pari a ' +
    f1(fte) +
    ' tempi pieni · assenze medie dello storico ' +
    Math.round((1 - quota) * 100) +
    '%';
  if (prezzo)
    e +=
      '<br><b>Costo: ' +
      _orgCHF(Math.round(tot)) +
      '</b> = ' +
      f1(ore) +
      ' h x ' +
      prezzo +
      ' CHF (' +
      _orgCHF(Math.round(base)) +
      ')' +
      (cNotte ? ' + notturno ' + pNotte + '% su ' + f1(oreNotte) + ' h (' + _orgCHF(Math.round(cNotte)) + ')' : '') +
      (cFest
        ? ' + festivi parificati ' +
          rap.festivo +
          '% su ' +
          f1(oreFestivi) +
          ' h (' +
          festPar.map((f) => f.data.substring(8, 10) + '.' + f.data.substring(5, 7)).join(', ') +
          ': ' +
          _orgCHF(Math.round(cFest)) +
          ')'
        : '') +
      (cInd ? ' + vacanze ' + pVac + '% e tredicesima ' + p13 + '% (' + _orgCHF(Math.round(cInd)) + ')' : '') +
      (jolly && c.prezzoTipo === 'comprensivo' ? ' · prezzo comprensivo: vacanze e tredicesima gia dentro (RAP)' : '');
  else e += '<br><span style="color:var(--muted)">Inserisci il costo orario per avere il costo.</span>';
  // testo del risultato per la stampa (senza pulsanti)
  c.stampa = e + '</div>';
  c.ultimoCosto = prezzo ? { chf: Math.round(tot), ore: Math.round(ore) } : null;
  e +=
    '<br><button class="btn-export" style="margin-top:6px;margin-right:6px" onclick="organicoCalcStampa()">Stampa</button>' +
    '<button class="btn-export" style="margin-top:6px" onclick="organicoCalcNelSimulatore(' +
    persone +
    ',' +
    (base > 0 ? Math.round((tot / base) * 10000) / 10000 : 1) +
    ')">Aggiungi al confronto</button></div>';
  c.esito = e;
  renderPiano();
}
// STAMPA del calcolo (06.10, richiesta del titolare): settore, dati inseriti, postazioni,
// risultato con persone necessarie e costo, come si legge e cosa non comprende
function organicoCalcStampa() {
  const c = _orgCalc;
  if (!c || !c.stampa) return;
  const w = window.open('', '_blank');
  if (!w) {
    toastErrore('Finestra bloccata dal browser: consenti i popup');
    return;
  }
  const jolly = c.tipo === 'jolly';
  const postazioni = c.righe
    .filter((r) => r.da && r.a && r.giorni.length)
    .map(
      (r) =>
        '<tr><td>' +
        r.da +
        '</td><td>' +
        r.a +
        '</td><td>' +
        r.giorni.map((k) => ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][k]).join(', ') +
        '</td><td>' +
        r.quante +
        '</td></tr>',
    )
    .join('');
  w.document.write(
    '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Calcolo del fabbisogno</title><style>@page{size:A4;margin:14mm}body{font-family:Georgia,serif;font-size:12px;color:#000;margin:0;line-height:1.5}h1{font-size:17px;margin:0 0 4px}h2{font-size:13px;margin:14px 0 4px}p{margin:0 0 6px;color:#333}table{border-collapse:collapse;margin:4px 0}th,td{border:1px solid #888;padding:3px 8px;text-align:left}th{background:#eee}.nota{font-size:10.5px;color:#444}</style></head><body><h1>Calcolo del fabbisogno · ' +
      escP(repartoNomeDocumento(_pianoReparto())) +
      '</h1><p>Stampato il ' +
      new Date().toLocaleDateString('it-IT') +
      ' da ' +
      escP(getOperatore() || '') +
      '</p><h2>Dati</h2><p>' +
      (jolly ? 'Ausiliari (jolly)' : 'Fissi') +
      ' al ' +
      Math.round(c.pct * 100) +
      '% · costo orario ' +
      (parseFloat(c.costo) > 0 ? escP(String(c.costo)) + ' CHF' : 'non indicato') +
      (jolly
        ? ' · prezzo ' +
          (c.prezzoTipo === 'comprensivo'
            ? 'comprensivo di vacanze e tredicesima'
            : 'salario di base (+ indennita RAP, vacanze ' + (c.vac5 ? '5' : '4') + ' settimane)')
        : '') +
      '</p><table><thead><tr><th>Dalle</th><th>Alle</th><th>Giorni</th><th>Persone insieme</th></tr></thead><tbody>' +
      postazioni +
      '</tbody></table><h2>Risultato</h2>' +
      c.stampa.replace(/ style="[^"]*"/g, '').replace(/<button[^>]*>.*?<\/button>/g, '') +
      '<h2>Come si legge</h2><p class="nota">Le persone necessarie sono il piu alto di due conti: le ore delle postazioni divise per le ore nette di una persona (giorni del periodo x ore settimanali di un tempo pieno / 7 x percentuale, meno le assenze medie dello storico del settore: malattie, impegni, vacanze), e le persone che devono essere presenti insieme nelle ore piu cariche, sempre con le assenze. Riposi settimanali, malattie e vacanze sono quindi gia compresi. Costi secondo il RAP (Allegato 1): notturno 10% sulle ore fra le 23 e le 6; per gli ausiliari 50% nei festivi parificati alle domeniche e, con il salario di base, indennita vacanze e tredicesima. Per gli ausiliari non comprende gli oneri sociali del datore di lavoro. E un calcolo su ore e presenze: il rispetto di riposi minimi e giorni di fila persona per persona si verifica con il piano.</p></body></html>',
  );
  w.document.close();
  setTimeout(() => w.print(), 300);
}
function organicoCalcNelSimulatore(persone, fattore) {
  const ultimo = _orgCalc && _orgCalc.ultimoCosto;
  if (!_orgStato || !_orgCalc) return;
  const c = _orgCalc;
  _orgStato.scenario.aggiunte.push({
    jolly: c.tipo === 'jolly',
    pct: c.pct,
    quanti: persone,
    dal: c.dal,
    al: c.al,
    oraCosto: parseFloat(c.costo) > 0 ? parseFloat(c.costo) : null,
    fattoreCosto: fattore || 1,
    // gli ausiliari sono pagati per le ore lavorate: il costo e quello delle postazioni
    // calcolate (non tutte le ore di contratto delle persone)
    costoCalcolato: c.tipo === 'jolly' && ultimo ? ultimo : null,
  });
  _organicoRicalcolaScenario();
  renderPiano();
  toast(persone + ' ' + (c.tipo === 'jolly' ? 'ausiliari' : 'fissi') + ' aggiunti al confronto qui sotto');
}
