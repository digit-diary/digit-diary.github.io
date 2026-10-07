/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-impostazioni.js
 * PIANO · mappature e impostazioni, solver esterno, formulari, card congedi non pagati
 * Parte del modulo Piano: i file piano-*.js si caricano in ordine (index.html) e condividono lo stesso ambito globale.
 */
// ================================================================
// MAPPATURE TURNO-FUNZIONE + IMPOSTAZIONI PIANO (personalizzabili)
// ================================================================
function _renderPianoMappatureCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Turni per funzione · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Valgono per il settore aperto: ogni settore ha le sue sigle. PRINCIPALE = turni normali della funzione. AMMESSO = permessi quando serve. PREFERITO = la bozza li privilegia. Chi ha una funzione con mappature riceve SOLO i turni elencati; chi non ne ha segue i settori abilitati e le regole di gruppo.</p>';
  const ordine = { PRINCIPALE: 1, AMMESSO: 2, PREFERITO: 3 };
  const perFz = {};
  pianoMappatureCache
    .filter((m) => (m.reparto_dip || 'slots') === _pianoReparto())
    .forEach((m) => (perFz[m.funzione] = (perFz[m.funzione] || []).concat(m)));
  Object.keys(perFz)
    .sort()
    .forEach((fz) => {
      h +=
        '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin:8px 0 4px">' +
        escP(fz) +
        '</p><div style="display:flex;gap:6px;flex-wrap:wrap">';
      perFz[fz]
        .sort((a, b) => (ordine[a.tipo] || 9) - (ordine[b.tipo] || 9) || a.turno_codice.localeCompare(b.turno_codice))
        .forEach((m) => {
          const col = m.tipo === 'PRINCIPALE' ? '#2c6e49' : m.tipo === 'AMMESSO' ? '#b39b00' : '#1a4a7a';
          h +=
            '<span class="mini-badge" style="background:' +
            col +
            ';cursor:pointer" title="' +
            m.tipo +
            ' · clicca per rimuovere" onclick="rimuoviPianoMappatura(' +
            m.id +
            ')">' +
            escP(m.turno_codice) +
            '</span>';
        });
      h += '</div>';
    });
  h +=
    '<div class="add-tipo-row" style="margin-top:10px"><div class="field"><label>Funzione</label><select id="mp-funzione" style="padding:8px">' +
    (window._pianoFunzioni || ['RESP', 'SUP', 'BO', 'HOST']).map((f) => '<option>' + escP(f) + '</option>').join('') +
    '</select></div><div class="field"><label>Turno</label><select id="mp-turno" style="padding:8px">' +
    _pianoTurniReparto()
      .slice()
      .sort((a, b) => String(a.codice).localeCompare(String(b.codice)))
      .map(
        (t) => '<option value="' + escP(t.codice) + '">' + escP(t.codice) + ' (' + escP(t.gruppo || '') + ')</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field"><label>Tipo</label><select id="mp-tipo" style="padding:8px"><option>PRINCIPALE</option><option>AMMESSO</option><option>PREFERITO</option></select></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiPianoMappatura()">+ Aggiungi</button></div>';
  h += '</div></div>';
  return h;
}
async function aggiungiPianoMappatura() {
  if (!isAdmin()) return;
  const fz = (document.getElementById('mp-funzione') || {}).value;
  const turno = ((document.getElementById('mp-turno') || {}).value || '').trim().toUpperCase();
  const tipo = (document.getElementById('mp-tipo') || {}).value || 'PRINCIPALE';
  if (!fz || !turno) {
    toastErrore('Compila funzione e turno');
    return;
  }
  if (!_pianoTurniReparto().some((t) => String(t.codice).toUpperCase() === turno)) {
    toastErrore(
      'Il turno ' +
        turno +
        ' non esiste in ' +
        repartoLabel(_pianoReparto()) +
        ': le mappature usano le sigle del settore',
    );
    return;
  }
  if (
    pianoMappatureCache.some(
      (m) => m.funzione === fz && m.turno_codice === turno && (m.reparto_dip || 'slots') === _pianoReparto(),
    )
  ) {
    toastErrore('Mappatura gia presente: ' + fz + ' → ' + turno);
    return;
  }
  try {
    const r = await secPost('piano_mappature', {
      funzione: fz,
      turno_codice: turno,
      tipo: tipo,
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoMappatureCache.push(r[0]);
    logAzione('Piano: mappatura aggiunta', repartoLabel(_pianoReparto()) + ' · ' + fz + ' ' + turno + ' ' + tipo);
    _pianoRegistraModifica(
      'Impostazioni',
      'Turni per funzione (' + repartoLabel(_pianoReparto()) + ')',
      fz + ' → ' + turno,
      'assente',
      tipo,
    );
    toast('Mappatura aggiunta');
    renderPiano();
  } catch (e) {
    toastErrore('Errore nel salvataggio della mappatura: ' + (e.message || ''));
  }
}
async function rimuoviPianoMappatura(id) {
  if (!isAdmin()) return;
  const m = pianoMappatureCache.find((x) => x.id === id);
  if (!m || !(await chiediConferma('Rimuovere ' + m.funzione + ' → ' + m.turno_codice + ' (' + m.tipo + ')?'))) return;
  try {
    await secDel('piano_mappature', 'id=eq.' + id);
    pianoMappatureCache = pianoMappatureCache.filter((x) => x.id !== id);
    logAzione('Piano: mappatura rimossa', m.funzione + ' ' + m.turno_codice);
    toast('Mappatura rimossa');
    renderPiano();
  } catch (e) {
    toast('Errore rimozione');
  }
}

function _renderPianoImpostazioniCard() {
  if (!isAdmin()) return '';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Impostazioni piano (admin)</div><div style="padding:10px 14px">';
  h +=
    '<div class="add-tipo-row"><div class="field"><label>Ore settimanali contratto (per il saldo ore)</label><input type="number" step="0.5" id="pi-ore-sett" value="' +
    _pianoOreSett +
    '" style="width:90px" onchange="salvaOreSettimanali(this.value)"></div>' +
    '<div class="field" style="flex:1;min-width:220px"><label>Funzioni disponibili (separate da virgola)</label><input type="text" id="pi-funzioni" value="' +
    escP((window._pianoFunzioni || []).join(', ')) +
    '" onchange="salvaPianoFunzioni(this.value)"></div>' +
    '<div class="field"><label title="0 = illimitati">Max cambi turno al mese</label><input type="number" min="0" max="99" value="' +
    _pianoMaxCambi() +
    '" style="width:80px" onchange="salvaMaxCambi(this.value)"></div>' +
    '<div class="field" style="flex:1;min-width:260px"><label title="Indirizzo del servizio solver sul server interno (es. http://diario.casinolg.local:8765). Vuoto = pulsante nascosto, resta la bozza integrata">Solver esterno (server interno), indirizzo</label><input type="text" id="pi-solver-url" placeholder="http://server:8765" value="' +
    escP(window._pianoSolverUrl || '') +
    '" onchange="salvaSolverUrl(this.value)"></div>' +
    '<div class="field"><label title="Giorni di affiancamento (dai commenti con formazione) prima della proposta di certificazione">Giorni formazione per certificare</label><input type="number" min="1" max="30" id="imp-gg-formazione" value="' +
    (window._pianoGgFormazione || 5) +
    '" style="width:80px" onchange="salvaGiorniFormazione()"></div></div>';
  // giorni weekend configurabili (come get_giorni_weekend di Turnivo)
  const GG_LBL = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const wk = _pianoGiorniWeekend();
  h +=
    '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin:12px 0 4px">Giorni weekend</p>' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Colonne evidenziate in verde nel calendario e conteggio weekend nelle statistiche. La domenica ha sempre il suo colore.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    [1, 2, 3, 4, 5, 6, 0]
      .map(
        (d) =>
          '<label style="font-size:var(--fs-sm,.8125rem)"><input type="checkbox"' +
          (wk.includes(d) ? ' checked' : '') +
          ' onchange="salvaGiornoWeekend(' +
          d +
          ',this.checked)"> ' +
          GG_LBL[d] +
          '</label>',
      )
      .join('') +
    '</div>';
  // competenze Formazione -> gruppi del piano
  h +=
    '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin:12px 0 4px">Competenze Formazione → gruppi del piano</p>' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Chi ha la competenza CERTIFICATA in Formazione diventa idoneo anche al gruppo indicato (in aggiunta ai suoi Settori). "-" = nessun collegamento.</p>';
  // solo i gruppi dei turni DI QUESTO settore (i turni sono divisi per settore)
  const gruppiDisp = [
    ...new Set(
      _pianoTurniReparto()
        .map((t) => (t.gruppo || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  const mappaCG = _pianoCompetenzeGruppiGrezze();
  const compRep0 = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll()[_pianoReparto()] || [] : [];
  const compRep = typeof _compOrdinate === 'function' ? _compOrdinate(compRep0) : compRep0;
  if (compRep.length) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    compRep.forEach((k) => {
      h +=
        '<label style="font-size:var(--fs-sm,.8125rem);display:flex;align-items:center;gap:4px">' +
        escP(k.label) +
        ' → <select onchange="salvaCompetenzaGruppo(\'' +
        escP(k.key) +
        '\',this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">-</option>' +
        gruppiDisp
          .map(
            (g) => '<option' + ((mappaCG[k.key] || '').toUpperCase() === g ? ' selected' : '') + '>' + g + '</option>',
          )
          .join('') +
        // collegamento salvato a un gruppo che qui non esiste: si vede (e non vale)
        (mappaCG[k.key] && !gruppiDisp.includes(String(mappaCG[k.key]).toUpperCase())
          ? '<option selected value="' +
            escP(mappaCG[k.key]) +
            '">' +
            escP(mappaCG[k.key]) +
            ' (non e un gruppo di questo settore: non vale)</option>'
          : '') +
        '</select></label>';
    });
    h += '</div>';
  }
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:10px">Le funzioni compaiono nei menu di Gestione collaboratori e nelle mappature. Preferenze per collaboratore (solo diurni, turni bloccati, settori...) nella card qui sotto.</p>';
  h += '</div></div>';
  // generazione automatica (js/piano-auto.js): scheda propria, si riempie da sola
  if (typeof _pianoAutoCardSegnaposto === 'function') h += _pianoAutoCardSegnaposto();
  return h;
}
// Cambi RICHIESTI nel mese per collaboratore (dal Registro: nel log dello
// scambio il richiedente è il primo nome). Chi ACCETTA non consuma il limite.
async function _pianoCambiRichiesti(ym) {
  const logs =
    (await secGet(
      'log_attivita?azione=eq.' +
        encodeURIComponent('Piano: scambio turno') +
        '&dettaglio=like.' +
        encodeURIComponent('%il ' + ym + '-%') +
        '&limit=1000',
    )) || [];
  const conta = {};
  logs.forEach((l) => {
    const nome = (l.dettaglio || '').split(' (')[0].trim();
    if (nome) conta[nome] = (conta[nome] || 0) + 1;
  });
  return conta;
}
function _pianoMaxCambi() {
  const v = parseInt(window._pianoMaxCambiCfg);
  return isNaN(v) ? 0 : v;
}
// ===== SOLVER ESTERNO (server interno, OR-Tools) =====
// Il programma resta indipendente: con l'indirizzo vuoto la bozza integrata
// fa tutto. Se l'IT attiva il servizio (cartella IT/solver), basta scrivere
// qui l'indirizzo: compare il pulsante "Genera con il solver".
async function salvaSolverUrl(v) {
  if (!isAdmin()) return;
  const url = String(v || '')
    .trim()
    .replace(/\/+$/, '');
  if (url && !/^https?:\/\/[^\s]+$/.test(url)) {
    toastErrore('Indirizzo non valido: deve iniziare con http:// o https://');
    renderPiano();
    return;
  }
  const prima = window._pianoSolverUrl || '';
  if (!(await salvaImp('piano_solver_url', url))) return;
  window._pianoSolverUrl = url;
  logAzione('Piano: solver esterno', (prima || 'vuoto') + ' \u2192 ' + (url || 'vuoto'));
  _pianoRegistraModifica('Impostazioni', 'Solver esterno', 'indirizzo', prima || 'vuoto', url || 'vuoto');
  toast(url ? 'Solver collegato: ' + url : 'Solver scollegato: resta la bozza integrata');
  renderPiano();
}
async function generaConSolver() {
  if (!_pianoAzioneAutoConsentita('genera')) return; // azione automatica: permesso apposito
  if (!puoGestirePiano()) return;
  const url = window._pianoSolverUrl;
  if (!url) return;
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  if (
    !(await chiediConferma(
      'Genero il piano di ' +
        ym +
        ' (' +
        repartoLabel(rep) +
        ') con il solver sul server interno?\n\nLe celle esistenti (vacanze, protette, malattie, blocchi) non vengono toccate; le celle generate da una bozza precedente vengono sostituite. Il calcolo puo durare fino a due minuti.',
    ))
  )
    return;
  _pianoUndoSnap('solver ' + ym);
  toast('Solver in esecuzione, attendi...', 6000);
  try {
    const risposta = await fetch(url + '/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anno: parseInt(ym.split('-')[0]),
        mese: parseInt(ym.split('-')[1]),
        settore: rep,
        sostituisci: true,
        timeout: 120,
        operatore: getOperatore(),
        token: getOpToken(),
      }),
    });
    const testo = await risposta.text();
    let r = null;
    try {
      r = JSON.parse(testo);
    } catch (e) {}
    if (!risposta.ok || !r || r.ok === false) {
      toastErrore(
        'Solver: ' + ((r && (r.errore || r.error)) || testo.substring(0, 200) || 'risposta non valida'),
        10000,
      );
      return;
    }
    logAzione(
      'Piano: solver esterno eseguito',
      ym + ' · ' + (r.inserite != null ? r.inserite + ' celle' : 'ok') + (r.stato ? ' · ' + r.stato : ''),
    );
    toast(
      'Solver: ' +
        (r.inserite != null ? r.inserite + ' celle scritte' : 'fatto') +
        (r.stato ? ' (' + r.stato + ')' : ''),
    );
    _pianoViolCelle = {};
    _pianoViolLista = null;
    renderPiano();
  } catch (e) {
    toastErrore('Solver non raggiungibile (' + (e.message || '') + '). Resta disponibile "Genera bozza".', 10000);
  }
}
async function salvaMaxCambi(v) {
  if (!isAdmin()) return;
  const n = parseInt(v);
  if (isNaN(n) || n < 0 || n > 31) {
    toastErrore('Il massimo di cambi al mese va da 0 (illimitati) a 31');
    renderPiano();
    return;
  }
  const prima = window._pianoMaxCambiCfg;
  window._pianoMaxCambiCfg = n;
  if (!(await salvaImp('piano_max_cambi_mese', String(n)))) return;
  logAzione('Piano: max cambi mese', (prima != null ? prima : 'vuoto') + ' \u2192 ' + n);
  _pianoRegistraModifica(
    'Impostazioni',
    'Cambi turno',
    'massimo al mese',
    prima != null ? prima : 'vuoto',
    n || 'illimitati',
  );
  toast('Salvato \u00b7 ' + (n ? 'massimo ' + n + ' cambi al mese' : 'cambi illimitati'));
}
function _pianoGiorniWeekend() {
  const v = window._pianoWeekendCfg;
  if (Array.isArray(v) && v.length) return v;
  return [5, 6]; // default: venerdì e sabato (la domenica ha il suo colore)
}
async function salvaGiornoWeekend(dow, attivo) {
  if (!isAdmin()) return;
  let wk = _pianoGiorniWeekend().slice();
  if (attivo && !wk.includes(dow)) wk.push(dow);
  if (!attivo) wk = wk.filter((x) => x !== dow);
  const primaW = _pianoGiorniWeekend().join(',');
  window._pianoWeekendCfg = wk;
  if (!(await salvaImp('piano_giorni_weekend', JSON.stringify(wk)))) return;
  const _gg = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
  const nomi = (v) =>
    v
      ? v
          .split(',')
          .map((x) => _gg[parseInt(x)] || x)
          .join(', ')
      : 'nessuno';
  logAzione('Piano: giorni weekend', primaW + ' \u2192 ' + wk.join(','));
  _pianoRegistraModifica('Impostazioni', 'Weekend', 'giorni', nomi(primaW), nomi(wk.join(',')));
  toast('Salvato \u00b7 weekend: ' + nomi(wk.join(',')));
  renderPiano();
}
async function salvaCompetenzaGruppo(chiave, gruppo) {
  if (!isAdmin()) return;
  const cfg = Object.assign({}, window._pianoCompGruppiCfg || {});
  const primaG = cfg[chiave] || 'nessuno';
  cfg[chiave] = gruppo || '';
  window._pianoCompGruppiCfg = cfg;
  if (!(await salvaImp('piano_competenze_gruppi', JSON.stringify(cfg)))) return;
  logAzione('Piano: competenza-gruppo', chiave + ': ' + primaG + ' \u2192 ' + (gruppo || 'nessuno'));
  _pianoRegistraModifica('Impostazioni', chiave, 'gruppo di turni', primaG, gruppo || 'nessuno');
  toast('Salvato \u00b7 ' + chiave + ': ' + primaG + ' \u2192 ' + (gruppo || 'nessuno'));
}
async function salvaOreSettimanali(v) {
  if (!isAdmin()) return;
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n) || n < 1 || n > 60) {
    toastErrore('Le ore settimanali vanno da 1 a 60 (contratto: 41). Resta ' + _pianoOreSett + '.');
    renderPiano();
    return;
  }
  const primaO = _pianoOreSett;
  _pianoOreSett = n;
  if (!(await salvaImp('piano_ore_settimanali', String(n)))) return;
  logAzione('Piano: ore settimanali', primaO + ' \u2192 ' + n);
  _pianoRegistraModifica('Impostazioni', 'Orario', 'ore settimanali', primaO, n);
  toast('Salvato \u00b7 ore settimanali: ' + primaO + ' \u2192 ' + n);
  renderPiano();
}
async function salvaPianoFunzioni(v) {
  if (!isAdmin()) return;
  const lista = String(v)
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (!lista.length) {
    toastErrore('Inserisci almeno una funzione');
    return;
  }
  const nonValide = lista.filter((f) => !/^[A-Z0-9_]{1,12}$/.test(f));
  if (nonValide.length) {
    toastErrore('Funzioni non valide (solo lettere, cifre e _, max 12): ' + nonValide.join(', '));
    return;
  }
  // una funzione ancora assegnata a qualcuno non si toglie per sbaglio
  const inUso = [
    ...new Set(
      collaboratoriCache.filter((c) => c.attivo !== false && c.funzione).map((c) => String(c.funzione).toUpperCase()),
    ),
  ];
  const tolteInUso = inUso.filter((f) => !lista.includes(f));
  if (
    tolteInUso.length &&
    !(await chiediConferma(
      'Queste funzioni sono assegnate a collaboratori attivi: ' +
        tolteInUso.join(', ') +
        '.\n\nToglierle dall elenco? (le schede le mantengono, ma non compariranno piu nei menu)',
    ))
  ) {
    renderPiano();
    return;
  }
  window._pianoFunzioni = lista;
  if (!(await salvaImp('piano_funzioni', JSON.stringify(lista)))) return;
  logAzione('Piano: funzioni', lista.join(','));
  toast('Funzioni aggiornate');
}

// Preferenze per collaboratore: solo diurni + turni bloccati
// ---- IMPORT / EXPORT (come la pagina Import/wizard di Turnivo) ----
function _scaricaFile(nomeFile, contenuto, mime) {
  const blob = new Blob(['\ufeff' + contenuto], { type: mime || 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomeFile;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function _csv(righe) {
  return righe
    .map((r) =>
      r
        .map((v) => {
          const s2 = v == null ? '' : String(v);
          return /[";\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
        })
        .join(';'),
    )
    .join('\n');
}
async function esportaPianoDati(tipo) {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  const anno = parseInt(ym.split('-')[0]);
  try {
    if (tipo === 'collaboratori') {
      const righe = [
        [
          'Nome',
          'Funzione',
          'Percentuale',
          'Jolly',
          'Solo diurni',
          'Solo notturni',
          'Giorni di lavoro',
          'Giorni a settimana',
          'Turni bloccati',
          'Turni consentiti',
          'Preferisce L1',
          'Accoglienza',
          'Accompagnamento',
          'Lingue',
        ],
      ];
      // Preferisce L1 e Accoglienza: solo slot
      const soloSlotsCsv = _pianoReparto() === 'slots';
      if (!soloSlotsCsv) righe[0].splice(10, 2);
      collaboratoriCache
        .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
        .forEach((c) =>
          righe.push([
            c.nome,
            c.funzione || '',
            Math.round((parseFloat(c.percentuale) || 1) * 100) + '%',
            c.is_jolly ? 'SI' : '',
            c.solo_diurni ? 'SI' : '',
            c.solo_notti ? 'SI' : '',
            _pianoGiorniLavoroTesto(c.giorni_lavoro),
            c.giorni_settimana || '',
            c.turni_bloccati || '',
            c.turni_consentiti || '',
            ...(soloSlotsCsv ? [c.prefers_l1 ? 'SI' : '', c.accoglienza || 0] : []),
            c.accompagnamento_settori || '',
            c.lingue || '',
          ]),
        );
      _scaricaFile('collaboratori_' + _pianoReparto() + '.csv', _csv(righe));
    } else if (tipo === 'turni') {
      const righe = [['Codice', 'Gruppo', 'Inizio', 'Fine', 'Ore', 'Tipo', 'Oltre23', 'Colore', 'Attivo']];
      _pianoTurniReparto().forEach((t) =>
        righe.push([
          t.codice,
          t.gruppo || '',
          (t.ora_inizio || '').substring(0, 5),
          (t.ora_fine || '').substring(0, 5),
          t.durata_ore || 0,
          t.tipo || '',
          t.oltre23 ? 'SI' : '',
          t.colore || '',
          t.attivo !== false ? 'SI' : 'NO',
        ]),
      );
      _scaricaFile('turni_' + _pianoReparto() + '.csv', _csv(righe));
    } else if (tipo === 'codici') {
      const righe = [['Codice', 'Descrizione', 'Ore', 'Scala %', 'Riposo', 'Attivo']];
      pianoCodiciCache.forEach((c) =>
        righe.push([
          c.codice,
          c.descrizione || '',
          c.ore || 0,
          c.scala_percentuale ? 'SI' : '',
          c.is_riposo ? 'SI' : '',
          c.attivo !== false ? 'SI' : 'NO',
        ]),
      );
      _scaricaFile('codici_speciali.csv', _csv(righe));
    } else if (tipo === 'fabbisogno') {
      const fabb =
        (await secGet(
          'piano_fabbisogni?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nGiorni).padStart(2, '0') +
            '&reparto_dip=eq.' +
            _pianoReparto() +
            '&limit=3000',
        )) || [];
      const perCod = {};
      fabb.forEach(
        (f) => ((perCod[f.turno_codice] = perCod[f.turno_codice] || {})[parseInt(f.data.split('-')[2])] = f.quantita),
      );
      const testata = ['Turno'];
      for (let g = 1; g <= nGiorni; g++) testata.push(g);
      const righe = [testata];
      Object.keys(perCod)
        .sort()
        .forEach((cod) => {
          const r = [cod];
          for (let g = 1; g <= nGiorni; g++) r.push(perCod[cod][g] || '');
          righe.push(r);
        });
      _scaricaFile('fabbisogno_' + ym + '.csv', _csv(righe));
    } else if (tipo === 'vacanze') {
      const vac =
        (await secGet('piano_vacanze?anno=eq.' + anno + '&order=collaboratore.asc,settimana.asc&limit=2000')) || [];
      const righe = [['Collaboratore', 'Settimana', 'Anno', 'Dal', 'Al', 'Confermata']];
      vac.forEach((v) => {
        const gg = _pianoGiorniSettimana(v.anno, v.settimana);
        righe.push([v.collaboratore, v.settimana, v.anno, gg[0], gg[6], v.confermata ? 'SI' : 'NO']);
      });
      _scaricaFile('vacanze_' + anno + '.csv', _csv(righe));
    } else if (tipo === 'piano') {
      const testata = ['Collaboratore'];
      for (let g = 1; g <= nGiorni; g++) testata.push(g);
      const righe = [testata];
      const mappa2 = {};
      _pianoRighe.forEach((r) => (mappa2[r.collaboratore + '|' + parseInt(r.data.split('-')[2])] = r.codice));
      const nomi2 = [...new Set(_pianoRighe.map((r) => r.collaboratore))].sort();
      nomi2.forEach((n) => {
        const r = [n];
        for (let g = 1; g <= nGiorni; g++) r.push(mappa2[n + '|' + g] || '');
        righe.push(r);
      });
      _scaricaFile('piano_' + ym + '.csv', _csv(righe));
    } else if (tipo === 'timbrature') {
      const t2 =
        (await secGet(
          'piano_timbrature?data=gte.' +
            ym +
            '-01&data=lte.' +
            ym +
            '-' +
            String(nGiorni).padStart(2, '0') +
            '&limit=5000',
        )) || [];
      const righe = [['Collaboratore', 'Data', 'Entrata', 'Uscita', 'Ore', 'Fonte']];
      t2.forEach((t) =>
        righe.push([
          t.collaboratore,
          t.data,
          (t.ora_entrata || '').substring(0, 5),
          (t.ora_uscita || '').substring(0, 5),
          t.ore || 0,
          t.fonte || '',
        ]),
      );
      _scaricaFile('timbrature_' + ym + '.csv', _csv(righe));
    }
    logAzione('Export dati piano', tipo + ' ' + ym);
  } catch (e) {
    console.error(e);
    toast('Errore export');
  }
}
function scaricaTemplatePiano(tipo) {
  const ym = _pianoMeseSel;
  const nGiorni = _pianoUltimoGiorno(ym);
  if (tipo === 'fabbisogno') {
    const testata = ['Turno'];
    for (let g = 1; g <= nGiorni; g++) testata.push(g);
    const righe = [testata];
    _pianoTurniReparto()
      .slice(0, 5)
      .forEach((t) => {
        const r = [t.codice];
        for (let g = 1; g <= nGiorni; g++) r.push('');
        righe.push(r);
      });
    _scaricaFile('template_fabbisogno.csv', _csv(righe));
  } else if (tipo === 'vacanze') {
    const testata = ['Cognome', 'Nome', '', '', ''];
    for (let w = 1; w <= 52; w++) testata.push('Sett ' + w);
    const righe = [testata];
    collaboratoriCache
      .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
      .slice(0, 5)
      .forEach((c) => {
        const parti = c.nome.split(' ');
        const r = [parti[0], parti.slice(1).join(' '), '', '', ''];
        for (let w = 1; w <= 52; w++) r.push('');
        righe.push(r);
      });
    _scaricaFile('template_vacanze.csv', _csv(righe));
  } else if (tipo === 'timbrature') {
    _scaricaFile(
      'template_timbrature.csv',
      _csv([
        ['Nome', 'Data', 'Entrata', 'Uscita'],
        ['Bushi Musa', ym + '-01', '14:00', '22:15'],
      ]),
    );
  }
}
function _renderPianoImportExportCard() {
  if (!puoGestirePiano()) return '';
  const btn = (testo, onclick, colore) =>
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:' +
    (colore || '#b8a98a') +
    ';color:' +
    (colore || '#b8a98a') +
    '" onclick="' +
    onclick +
    '">' +
    testo +
    '</button>';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Import / Export dati</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin-bottom:6px">Esporta (CSV, apribile in Excel)</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Piano del mese', "esportaPianoDati('piano')");
  h += btn('Fabbisogno del mese', "esportaPianoDati('fabbisogno')");
  h += btn('Collaboratori', "esportaPianoDati('collaboratori')");
  h += btn('Turni', "esportaPianoDati('turni')");
  h += btn('Codici speciali', "esportaPianoDati('codici')");
  h += btn('Vacanze anno', "esportaPianoDati('vacanze')");
  h += btn('Timbrature del mese', "esportaPianoDati('timbrature')");
  h += '</div>';
  h +=
    '<p style="font-size:var(--fs-md,.875rem);font-weight:700;margin:12px 0 6px">Template per l\'import</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Template fabbisogno', "scaricaTemplatePiano('fabbisogno')", '#2c6e49');
  h += btn('Template vacanze', "scaricaTemplatePiano('vacanze')", '#2c6e49');
  h += btn('Template timbrature', "scaricaTemplatePiano('timbrature')", '#2c6e49');
  h += '</div>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:8px">Gli import si fanno nelle rispettive schermate: fabbisogno nel Calendario, vacanze nella tab Vacanze, timbrature nella tab Timbrature (o in automatico dalla timbratrice). L\'export copre anche il backup completo in Impostazioni del Diario.</p>';
  h += '</div></div>';
  return h;
}

const _REGOLE_GRUPPO_TIPI = {
  richiede_funzione:
    'Funzioni ammesse anche senza il gruppo fra i settori (es: SUP oppure BO,SUP) · chi non le ha deve avere il gruppo fra i settori',
  blocca_tipo_turno: 'Vieta un tipo di turno nel gruppo (es: NOTTURNO)',
  richiede_campo: 'Richiede un campo del collaboratore (es: accoglienza>0)',
  limite_funzione_giorno: 'Max N di una funzione al giorno (es: SUP:1)',
  limite_funzione_mese: 'Max N persone di una funzione al mese (es: SUP:1)',
  minimo_funzione_mese: 'Almeno N di una funzione al mese (es: SUP:1)',
  minimo_funzione_giorno: 'Almeno N al giorno, con filtri (es: SUP:1:NOTTURNO:4,5 · 4,5=ven,sab)',
  turni_solo_funzioni: 'Questi turni solo a queste funzioni (es: L1,9:BO,SUP · gruppo "tutti" = qualsiasi)',
  funzione_turni_giorni:
    'In questi giorni la funzione fa SOLO questi turni (es: SUP:Z*,L1,9:0,1,2,3 · Z* = tutte le sigle che iniziano con Z · giorni 0=lun ... 6=dom, vuoto = sempre)',
  livello_turni:
    'Questi turni solo da un livello di Formazione in su (es: 10,10C,9:L2 · L1-L2 = solo L1 e L2 · eccezioni per persona in Preferenze, Turni consentiti)',
  minimo_livello_giorno:
    'Almeno N persone di un livello di Formazione al giorno, con filtri (es: L3:2:NOTTURNO:4,5 = 2 di livello L3 o piu sui turni notturni, venerdi e sabato · 0=lun ... 6=dom)',
};
// Etichette in italiano per la scheda (la lingua di chi la usa)
const _REGOLE_GRUPPO_ETICHETTE = {
  richiede_funzione: 'Funzioni ammesse nel gruppo',
  blocca_tipo_turno: 'Tipo di turno vietato nel gruppo',
  richiede_campo: 'Requisito sulla scheda del collaboratore',
  limite_funzione_giorno: 'Massimo di una funzione al giorno',
  limite_funzione_mese: 'Massimo persone di una funzione al mese',
  minimo_funzione_mese: 'Minimo di una funzione al mese',
  minimo_funzione_giorno: 'Minimo di una funzione al giorno',
  turni_solo_funzioni: 'Turni riservati a certe funzioni',
  funzione_turni_giorni: 'Una funzione fa solo certi turni (per giorno)',
  livello_turni: 'Turni per livello di Formazione',
  minimo_livello_giorno: 'Minimo di un livello al giorno',
};
// TAB GUIDA · manuale rapido della sezione Piano (come la Guida di Turnivo)
// ================================================================
// TAB FORMULARI · moduli stampabili standard (come i formulari vuoti di
// Turnivo) + ARCHIVIO personalizzato: carichi i tuoi formulari (PDF,
// Word, Excel ≤2MB), li organizzi in cartelle nominabili per settore,
// li apri/stampi (PDF direttamente, Word/Excel in download) e li elimini.
// ================================================================
let _pianoFormulariCache = [];
async function _renderPianoFormulariTab() {
  _pianoFormulariCache =
    (await secGet('piano_formulari?reparto_dip=eq.' + _pianoReparto() + '&order=cartella.asc,nome.asc&limit=500')) ||
    [];
  const puoMod = puoGestirePiano() || isAdmin();
  const riga = (titolo, desc, onclick, etichetta) =>
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:260px"><b>' +
    titolo +
    '</b><br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
    desc +
    '</span></div><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 14px" onclick="' +
    onclick +
    '">' +
    (etichetta || 'Stampa PDF') +
    '</button></div>';
  let h = '<div class="main-card"><div class="card-header">Moduli standard</div><div style="padding:6px 16px 14px">';
  h += riga(
    'Richiesta cambio turno (modulo vuoto)',
    'Da compilare a mano e far firmare: collaboratori A e B, motivazione, autorizzazione.',
    'pdfCambioTurnoVuoto()',
  );
  h += riga(
    'Richiesta cambio vacanza (modulo vuoto)',
    'Scambio di settimana di vacanza tra due collaboratori, con firme e autorizzazione.',
    'pdfCambioVacanza()',
  );
  h += riga(
    'Lista di non disponibilità (Jolly)',
    'Modulo ufficiale HR 1187: i jolly indicano i giorni del mese in cui non sono disponibili (da consegnare entro il ' +
      _pianoGiornoNd() +
      '° giorno del mese).',
    'pdfNonDisponibilitaJolly()',
  );
  const rigaProtocollo = (titolo, nomeOriginale, chiave) =>
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:260px"><b>' +
    titolo +
    '</b><br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">Modulo ufficiale Word da stampare/compilare. In alternativa, la versione Excel si compila al computer e si reimporta in Formazione per la certificazione automatica.</span></div>' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:5px 14px;border-color:var(--c-blu,#1a4a7a);color:var(--c-blu,#1a4a7a)" onclick="apriFormularioPerNome(\'' +
    _jsArg(nomeOriginale) +
    '\')">Scarica Word (originale)</button>' +
    '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 10px" onclick="pianoScaricaProtocollo(\'' +
    chiave +
    '\')">Excel per import</button></div>';
  h += rigaProtocollo(
    'Protocollo formazione · Slot Attendant',
    'Formazione Slot Attendant nuovi impiegati (originale)',
    'sala',
  );
  h += rigaProtocollo(
    'Protocollo formazione · Reception',
    'Formazione Reception nuovi impiegati (originale)',
    'reception',
  );
  h += rigaProtocollo('Protocollo formazione · Cassa', 'Protocollo Formazione Cassa (originale)', 'cassa');
  h += '</div></div>';

  // ARCHIVIO personalizzato
  h +=
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">I tuoi formulari · ' +
    escP(repartoLabel(_pianoReparto())) +
    ' (' +
    _pianoFormulariCache.length +
    ')';
  if (puoMod)
    h +=
      '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="document.getElementById(\'form-arch-file\').click()">Carica formulario</button>' +
      '<input type="file" id="form-arch-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" style="display:none" onchange="caricaFormulario(this)">';
  h += '</div><div style="padding:6px 16px 14px">';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">PDF, Word ed Excel fino a 2 MB, organizzati in cartelle per settore. I PDF si aprono e stampano direttamente; Word ed Excel si scaricano e si stampano dal programma.</p>';
  if (!_pianoFormulariCache.length) h += '<p style="color:var(--muted);padding:8px 0">Nessun formulario caricato.</p>';
  const perCartella = {};
  _pianoFormulariCache.forEach(
    (f) => (perCartella[f.cartella || 'Generale'] = (perCartella[f.cartella || 'Generale'] || []).concat(f)),
  );
  Object.keys(perCartella)
    .sort()
    .forEach((cart) => {
      h +=
        '<div style="margin:10px 0 4px;font-weight:700;font-size:var(--fs-md,.875rem)"><i class="icx icx-file"></i> ' +
        escP(cart) +
        ' <span style="font-weight:400;color:var(--muted)">(' +
        perCartella[cart].length +
        ')</span></div>';
      perCartella[cart].forEach((f) => {
        const icona =
          f.mime && f.mime.includes('sheet') ? '<i class="icx icx-stats"></i>' : '<i class="icx icx-file"></i>';
        h +=
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0 6px 14px;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:220px">' +
          icona +
          ' ' +
          escP(f.nome) +
          ' <span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">(' +
          Math.round((f.dimensione || 0) / 1024) +
          ' KB)</span></span>' +
          '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px" onclick="apriFormulario(' +
          f.id +
          ')">' +
          (f.mime === 'application/pdf' ? 'Apri / Stampa' : 'Scarica') +
          '</button>' +
          (puoMod
            ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px;border-color:var(--c-blu,#1a4a7a);color:var(--c-blu,#1a4a7a)" onclick="rinominaFormulario(' +
              f.id +
              ')">Rinomina/Sposta</button><button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFormulario(' +
              f.id +
              ')">Elimina</button>'
            : '') +
          '</div>';
      });
    });
  h += '</div></div>';
  return h;
}
function pianoScaricaProtocollo(k) {
  if (typeof scaricaProtocolloExcel === 'function') scaricaProtocolloExcel(k);
}
async function apriFormularioPerNome(nome) {
  let f = _pianoFormulariCache.find((x) => x.nome === nome);
  if (!f) {
    const r = await secGet('piano_formulari?nome=eq.' + encodeURIComponent(nome));
    f = r && r[0];
    if (f) _pianoFormulariCache.push(f);
  }
  if (!f) {
    toast('Originale non trovato nell\'archivio: caricalo con "Carica formulario"');
    return;
  }
  apriFormulario(f.id);
}
async function caricaFormulario(input) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('File troppo grande (max 2 MB)');
    return;
  }
  const cartella = ((await chiediTesto('Cartella (es. Cambi, Formazione, HR...):', 'Generale')) || '').trim();
  if (cartella === '') return;
  const nome = ((await chiediTesto('Nome del formulario:', file.name.replace(/\.[^.]+$/, ''))) || '').trim();
  if (!nome) return;
  try {
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    const b64 = btoa(bin);
    const r = await secPost('piano_formulari', {
      nome: nome,
      cartella: cartella,
      mime: file.type || 'application/octet-stream',
      estensione: (file.name.split('.').pop() || '').toLowerCase(),
      dimensione: file.size,
      contenuto: b64,
      reparto_dip: _pianoReparto(),
      operatore: getOperatore(),
    });
    if (r && r[0]) _pianoFormulariCache.push(r[0]);
    logAzione('Formulario caricato', nome + ' (' + cartella + ')');
    toast('Formulario "' + nome + '" caricato');
    renderPiano();
  } catch (e) {
    console.error(e);
    toast('Errore caricamento formulario');
  }
}
async function apriFormulario(id) {
  let f = _pianoFormulariCache.find((x) => x.id === id);
  if (f && !f.contenuto) f = null;
  if (!f) {
    const r = await secGet('piano_formulari?id=eq.' + id);
    f = r && r[0];
  }
  if (!f) return;
  try {
    const bin = atob(f.contenuto);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: f.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    if (f.mime === 'application/pdf') {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = f.nome + (f.estensione ? '.' + f.estensione : '');
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast('Errore apertura formulario');
  }
}
async function rinominaFormulario(id) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const f = _pianoFormulariCache.find((x) => x.id === id);
  if (!f) return;
  const nome = ((await chiediTesto('Nome:', f.nome)) || '').trim();
  if (!nome) return;
  const cartella = ((await chiediTesto('Cartella:', f.cartella || 'Generale')) || '').trim() || 'Generale';
  try {
    await secPatch('piano_formulari', 'id=eq.' + id, { nome: nome, cartella: cartella });
    f.nome = nome;
    f.cartella = cartella;
    logAzione('Formulario rinominato', nome + ' (' + cartella + ')');
    renderPiano();
  } catch (e) {
    toast('Errore');
  }
}
async function eliminaFormulario(id) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const f = _pianoFormulariCache.find((x) => x.id === id);
  if (!f || !(await chiediConferma('Eliminare il formulario "' + f.nome + '"?'))) return;
  try {
    await secDel('piano_formulari', 'id=eq.' + id);
    _pianoFormulariCache = _pianoFormulariCache.filter((x) => x.id !== id);
    logAzione('Formulario eliminato', f.nome);
    toast('Formulario eliminato');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
// LISTA DI NON DISPONIBILITÀ (JOLLY) · replica del modulo ufficiale
// HR 1187 del Casinò (giorni 1-31 con casella e osservazioni, firme)
async function pdfNonDisponibilitaJolly() {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const M = 16;
  let y = 14;
  // intestazione documento ufficiale
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(140, 20, 50);
  doc.text('CASINÒ LUGANO', M, y);
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Data: ' + new Date().toLocaleDateString('it-IT'), 150, y - 2);
  doc.text('Red.  O. Sampietro', 150, y + 2);
  doc.text('Appr. Direttore', 150, y + 6);
  y += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(9);
  doc.text('4 - Human Resources', M, y);
  y += 4.5;
  doc.setFont('helvetica', 'italic');
  doc.text('1187 - LISTA NON DISPONIBILITA JOLLY', M + 6, y);
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(34, 34, 34);
  doc.text('LISTA DI NON DISPONIBILITÀ (JOLLY)', 105, y, { align: 'center' });
  y += 5;
  doc.setFontSize(8.5);
  doc.text(
    '- da trasmettere al massimo entro il ' + _pianoGiornoNd() + '° giorno del mese al Responsabile di settore -',
    105,
    y,
    {
      align: 'center',
    },
  );
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Nome e Cognome: ' + '.'.repeat(95), M, y);
  y += 7;
  doc.text('Mese di riferimento: ' + '.'.repeat(92), M, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('vi informo che NON sarò disponibile per la pianificazione durante i giorni seguenti.', M, y);
  y += 8;
  doc.setFontSize(8.5);
  doc.text('Giorno', M, y);
  doc.text('Non sarò disponibile', M + 14, y);
  doc.text('Eventuali osservazioni', M + 55, y);
  doc.setDrawColor(51, 51, 51);
  doc.line(M, y + 1.2, 194, y + 1.2);
  y += 5.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (let g = 1; g <= 31; g++) {
    doc.text(String(g), M + 2, y);
    doc.setLineWidth(0.3);
    doc.rect(M + 20, y - 2.6, 3.2, 3.2); // casella
    doc.setTextColor(120, 120, 120);
    doc.text('.'.repeat(118), M + 40, y);
    doc.setTextColor(34, 34, 34);
    y += 5.55;
  }
  y += 4;
  doc.setFontSize(9);
  doc.text('Firma collaboratore (Jolly): ' + '.'.repeat(75), M, y);
  y += 8;
  doc.text('Data: ' + '.'.repeat(24), M, y);
  doc.text('Visto Resp. Settore: ' + '.'.repeat(35), 105, y);
  mostraPdfPreview(doc, 'non_disponibilita_jolly.pdf', 'Lista non disponibilità Jolly');
}

// Modulo VUOTO di richiesta cambio turno (come cambio_turno_pdf_vuoto di Turnivo)
async function pdfCambioTurnoVuoto() {
  if (!window.jspdf) await caricaJsPDF();
  if (!window.jspdf) return;
  const linea = '___________________________________________';
  const doc = _pdfCambioTurno({
    tipo: 'SCAMBIO',
    data: '____/____/________',
    a: { nome: linea, settore: repartoNomeDocumento(_pianoReparto()), turno: '_____', orari: '' },
    b: { nome: linea, settore: repartoNomeDocumento(_pianoReparto()), turno: '_____', orari: '' },
    motivo: linea + '___________________',
    richiesto: '',
    restituzione: '____/____/________  con turno _________',
  });
  mostraPdfPreview(doc, 'cambio_turno_vuoto.pdf', 'Formulario cambio turno');
}

function _renderPianoGuidaTab() {
  // la guida e' una sola, in js/guida.js: qui si mostrano i capitoli del piano
  if (typeof renderGuidaHtml === 'function') return renderGuidaHtml('piano');
  return '<div class="main-card"><div style="padding:16px">Guida non disponibile.</div></div>';
}
function _renderPianoRegoleGruppoCard() {
  if (!puoGestireRegole()) return '';
  const gruppi = [
    ...new Set(
      _pianoTurniReparto()
        .map((t) => (t.gruppo || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Regole di gruppo (admin)</div><div style="padding:10px 14px">';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Regole di idoneità per settore/gruppo: chi può lavorare in un gruppo, limiti e minimi per funzione. Applicate dalla bozza automatica e dal validatore.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:680px;font-size:var(--fs-md,.875rem)"><thead><tr><th>Gruppo</th><th style="text-align:left">Regola</th><th style="text-align:left">Valore</th><th>Attiva</th><th></th></tr></thead><tbody>';
  pianoRegoleGruppoCache
    .filter((r) => (r.reparto_dip || 'slots') === _pianoReparto())
    .sort((a, b) => (a.gruppo || '').localeCompare(b.gruppo || '') || a.id - b.id)
    .forEach((r) => {
      h +=
        '<tr><td style="font-weight:700">' +
        escP(r.gruppo === '*' ? 'tutti' : r.gruppo) +
        '</td><td style="text-align:left" title="' +
        escP(_REGOLE_GRUPPO_TIPI[r.tipo_regola] || '') +
        '"><b>' +
        escP(_REGOLE_GRUPPO_ETICHETTE[r.tipo_regola] || r.tipo_regola) +
        '</b><br><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        escP(r.tipo_regola) +
        '</span></td><td style="text-align:left"><input type="text" value="' +
        escP(r.valore || '') +
        '" onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'valore\',this.value)" style="width:170px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
        _pianoRegolaLivelloChi(r) +
        '</td><td><input type="checkbox"' +
        (r.attivo !== false ? ' checked' : '') +
        ' onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaRegolaGruppo(' +
        r.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<details style="margin:10px 0;background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700;font-size:var(--fs-md,.875rem)">Come si crea una regola di gruppo (esempi)</summary>' +
    '<ol style="font-size:var(--fs-md,.875rem);margin:8px 0 4px 18px;line-height:1.5">' +
    '<li>Scegli il <b>gruppo</b> di turni a cui la regola si riferisce (quello scritto nella scheda Turni, colonna Gruppo). "tutti" vale per ogni gruppo del settore.</li>' +
    '<li>Scegli il <b>tipo</b>: sotto compare la spiegazione con un esempio del valore.</li>' +
    '<li>Scrivi il <b>valore</b> nel formato dell esempio e premi Aggiungi. Il programma controlla che gruppo, funzioni e sigle esistano in questo settore: se qualcosa non torna te lo dice.</li>' +
    '<li>Esempi: <b>Turni riservati</b> con valore <code>L1,9:BO,SUP</code> = i turni L1 e 9 li fanno solo Back Office e Supervisor. <b>Una funzione fa solo certi turni</b> con <code>SUP:Z*,L1,9:0,1,2,3</code> = da lunedi a giovedi i Supervisor fanno solo turni che iniziano con Z (oppure L1 e 9); con <code>SUP:Z*,S*,L1,9:4,5</code> venerdi e sabato anche i turni S. <b>Massimo al giorno</b> con <code>SUP:1</code> nel gruppo BO = al massimo un Supervisor al giorno in Back Office.</li>' +
    '<li><b>Livelli di Formazione</b> (il livello di ognuno e quello di Formazione: L2 = tutte le competenze fino a L2 certificate). <b>Turni per livello</b> con <code>10,10C,9:L2</code> = quei turni dal livello L2 in su; <code>1,21:L1-L2</code> = solo L1 e L2 (es. turni da principianti). Chi deve fare un turno anche senza il livello lo trova in Preferenze collaboratori, <b>Turni consentiti</b>. <b>Minimo di un livello al giorno</b> con <code>L3:2:NOTTURNO:4,5</code> = venerdi e sabato almeno 2 persone di livello L3 o piu sui turni notturni. Quando un collaboratore sale di livello in Formazione, i turni si aprono da soli. Sotto il valore si vede quante persone soddisfano la regola.</li>' +
    '<li>Le regole valgono per il <b>settore aperto</b>: ogni settore ha le sue, con le sue sigle e le sue funzioni. Agiscono nel validatore, nella bozza, nei cambi turno e nella scrittura manuale (avviso).</li>' +
    '</ol></details>' +
    '<div class="add-tipo-row" style="margin-top:8px"><div class="field"><label>Gruppo</label><select id="rg-gruppo" style="padding:8px">' +
    gruppi.map((g) => '<option>' + escP(g) + '</option>').join('') +
    '<option value="*">tutti</option>' +
    '</select></div><div class="field"><label>Regola</label><select id="rg-tipo" style="padding:8px" onchange="document.getElementById(\'rg-aiuto\').textContent=_REGOLE_GRUPPO_TIPI[this.value]||\'\'" >' +
    Object.keys(_REGOLE_GRUPPO_TIPI)
      .map((t) => '<option value="' + t + '">' + escP(_REGOLE_GRUPPO_ETICHETTE[t] || t) + '</option>')
      .join('') +
    '</select></div><div class="field"><label>Valore</label><input type="text" id="rg-valore" placeholder="SUP:1" style="width:150px"></div>' +
    '<button class="btn-add-tipo" onclick="aggiungiRegolaGruppo()">+ Aggiungi regola</button></div>' +
    '<p id="rg-aiuto" style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px">' +
    _REGOLE_GRUPPO_TIPI.richiede_funzione +
    '</p>';
  h += '</div></div>';
  return h;
}
// REGOLE DI LIVELLO: quante persone del settore le soddisfano oggi (livello da
// Formazione), cosi si vede subito se una regola e troppo stretta
function _pianoRegolaLivelloChi(r) {
  const tipo = String(r.tipo_regola || '').toLowerCase();
  if (tipo !== 'livello_turni' && tipo !== 'minimo_livello_giorno') return '';
  const parti = String(r.valore || '').split(':');
  const [mi, ma] = String((tipo === 'livello_turni' ? parti[1] : parti[0]) || '').split('-');
  const min = _pianoLivelloDaTesto(mi);
  const max = tipo === 'livello_turni' ? _pianoLivelloDaTesto(ma) : 0;
  const persone = collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c));
  if (!persone.some((c) => _pianoLivelloNelSettore(c) != null))
    return '<div style="font-size:var(--fs-xs,.75rem);color:#c0392b">Il settore non ha livelli in Formazione: la regola non si applica</div>';
  const ok = persone.filter((c) => {
    const lv = _pianoLivelloNelSettore(c) || 0;
    return lv >= min && (!max || lv <= max);
  });
  const eccezioni =
    tipo === 'livello_turni'
      ? persone.filter(
          (c) =>
            !ok.includes(c) &&
            String(c.turni_consentiti || '')
              .toUpperCase()
              .split(',')
              .map((x) => x.trim())
              .some((x) => parti[0].toUpperCase().split(',').includes(x)),
        ).length
      : 0;
  const nMin = tipo === 'minimo_livello_giorno' ? parseInt(parti[1]) || 1 : 1;
  const poche = ok.length < nMin;
  return (
    '<div style="font-size:var(--fs-xs,.75rem);color:' +
    (poche ? '#c0392b' : 'var(--muted)') +
    '" title="' +
    escP(ok.map((c) => c.nome).join(', ')) +
    '">' +
    ok.length +
    ' persone con ' +
    (max ? 'livello L' + min + '-L' + max : 'livello L' + min + ' o piu') +
    (eccezioni ? ' + ' + eccezioni + ' eccezioni' : '') +
    (poche ? ' · troppo poche' : '') +
    '</div>'
  );
}
// Il valore di una regola di gruppo deve avere il formato del suo tipo e
// parlare di gruppi, funzioni e turni che nel settore esistono davvero.
function _pianoValidaRegolaGruppo(gruppo, tipo, valore, settore) {
  const ctx = _pianoContestoSettore(settore);
  const gr = String(gruppo || '').toUpperCase();
  const v = String(valore || '')
    .trim()
    .toUpperCase();
  if (gr !== '*' && !ctx.gruppi.has(gr))
    return 'Il gruppo ' + gr + ' non esiste fra i turni di ' + ctx.label + ' (scheda Turni, colonna Gruppo)';
  const funzioniNote = new Set(
    (Array.isArray(window._pianoFunzioni) ? window._pianoFunzioni : [])
      .map((f) => String(f).toUpperCase())
      .concat([...ctx.funzioni]),
  );
  const fzOk = (f) => funzioniNote.has(f);
  const t = String(tipo || '').toLowerCase();
  if (t === 'richiede_funzione') {
    const ignote = v
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && !fzOk(x));
    if (!v) return 'Scrivi una o piu funzioni separate da virgola (es. SUP oppure BO,SUP)';
    if (ignote.length)
      return (
        'Funzioni sconosciute in ' +
        ctx.label +
        ': ' +
        ignote.join(', ') +
        ' (Impostazioni del piano, Funzioni disponibili)'
      );
    return null;
  }
  if (t === 'blocca_tipo_turno') {
    const ignoti = v
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && x !== 'DIURNO' && x !== 'NOTTURNO');
    if (!v || ignoti.length)
      return 'Il tipo di turno puo essere solo DIURNO o NOTTURNO (anche entrambi: DIURNO,NOTTURNO)';
    return null;
  }
  if (t === 'richiede_campo') {
    if (!/^[A-Z_][A-Z0-9_]*\s*(>|>=|<|<=|=|!=)\s*[A-Z0-9_.]+$/.test(v))
      return 'Scrivi campo, confronto e valore, per esempio ACCOGLIENZA>0 oppure LINGUE=EN';
    return null;
  }
  if (t === 'limite_funzione_giorno' || t === 'limite_funzione_mese' || t === 'minimo_funzione_mese') {
    const m = v.match(/^([A-Z0-9_]+):(\d+)$/);
    if (!m) return 'Formato atteso FUNZIONE:NUMERO, per esempio SUP:1';
    if (!fzOk(m[1])) return 'Funzione sconosciuta in ' + ctx.label + ': ' + m[1];
    return null;
  }
  const sigleIgnote = (lista) =>
    lista.filter((m) => {
      const mm = m.toUpperCase();
      if (mm.endsWith('*')) return ![...ctx.codici].some((c) => c.startsWith(mm.slice(0, -1)));
      return !ctx.codici.has(mm);
    });
  if (t === 'turni_solo_funzioni') {
    const parti = v.split(':');
    if (parti.length !== 2) return 'Formato atteso TURNI:FUNZIONI, per esempio L1,9:BO,SUP';
    const turni = parti[0]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const funzioni = parti[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!turni.length || !funzioni.length) return 'Servono almeno un turno e una funzione (es. L1,9:BO,SUP)';
    const ign = sigleIgnote(turni);
    if (ign.length) return 'Sigle di turno che in ' + ctx.label + ' non esistono: ' + ign.join(', ');
    const fzIgn = funzioni.filter((f) => !fzOk(f));
    if (fzIgn.length) return 'Funzioni sconosciute in ' + ctx.label + ': ' + fzIgn.join(', ');
    return null;
  }
  // livelli: la scala e quella delle competenze del settore in Formazione
  const maxLv = typeof _lvMaxReparto === 'function' ? _lvMaxReparto(settore) : 9;
  const lvOk = (x) => {
    const n = _pianoLivelloDaTesto(x);
    return n >= 1 && n <= maxLv;
  };
  if (t === 'livello_turni') {
    const parti = v.split(':');
    if (parti.length !== 2) return 'Formato atteso TURNI:LIVELLO, per esempio 10,10C,9:L2 (oppure 1,21:L1-L2)';
    const turni = parti[0]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!turni.length) return 'Scrivi almeno un turno (es. 10,10C:L2)';
    const ign = sigleIgnote(turni);
    if (ign.length) return 'Sigle di turno che in ' + ctx.label + ' non esistono: ' + ign.join(', ');
    const [mi, ma] = parti[1].split('-');
    if (!lvOk(mi) || (ma != null && (!lvOk(ma) || _pianoLivelloDaTesto(ma) < _pianoLivelloDaTesto(mi))))
      return 'Livello non valido: in ' + ctx.label + ' la scala va da L1 a L' + maxLv + ' (Formazione, competenze)';
    return null;
  }
  if (t === 'minimo_livello_giorno') {
    const m = v.match(/^(L?\d+):(\d+)(?::(DIURNO|NOTTURNO)?)?(?::([0-6](,[0-6])*))?$/);
    if (!m)
      return 'Formato atteso LIVELLO:NUMERO[:DIURNO|NOTTURNO[:giorni]], per esempio L3:2:NOTTURNO:4,5 (0=lunedi ... 6=domenica)';
    if (!lvOk(m[1])) return 'Livello non valido: in ' + ctx.label + ' la scala va da L1 a L' + maxLv;
    return null;
  }
  if (t === 'funzione_turni_giorni') {
    const parti = v.split(':');
    if (parti.length < 2 || parti.length > 3)
      return 'Formato atteso FUNZIONE:TURNI[:giorni], per esempio SUP:Z*,L1,9:0,1,2,3';
    if (!fzOk(parti[0].trim())) return 'Funzione sconosciuta in ' + ctx.label + ': ' + parti[0];
    const modelli = parti[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!modelli.length) return 'Scrivi almeno una sigla o un modello (es. Z* per tutte le sigle che iniziano con Z)';
    const ign = sigleIgnote(modelli);
    if (ign.length) return 'Sigle o modelli senza riscontro fra i turni di ' + ctx.label + ': ' + ign.join(', ');
    if (parti[2] != null && parti[2].trim() !== '') {
      const gg = parti[2].split(',').map((x) => x.trim());
      if (gg.some((x) => !/^[0-6]$/.test(x)))
        return 'I giorni vanno scritti come numeri da 0 (lunedi) a 6 (domenica), separati da virgola';
    }
    return null;
  }
  if (t === 'minimo_funzione_giorno') {
    const m = v.match(/^([A-Z0-9_]+):(\d+)(?::(DIURNO|NOTTURNO)?)?(?::([0-6](,[0-6])*))?$/);
    if (!m)
      return 'Formato atteso FUNZIONE:NUMERO[:DIURNO|NOTTURNO[:giorni]], per esempio SUP:1:NOTTURNO:4,5 (0=lunedi ... 6=domenica)';
    if (!fzOk(m[1])) return 'Funzione sconosciuta in ' + ctx.label + ': ' + m[1];
    return null;
  }
  return 'Tipo di regola sconosciuto';
}
async function salvaRegolaGruppo(id, campo, valore) {
  if (!isAdmin()) return;
  const rV = pianoRegoleGruppoCache.find((x) => x.id === id);
  if (campo === 'valore' && rV) {
    const errore = _pianoValidaRegolaGruppo(rV.gruppo, rV.tipo_regola, valore, rV.reparto_dip || _pianoReparto());
    if (errore) {
      toastErrore(errore + '. Il valore precedente (' + String(rV.valore) + ') resta in vigore.', 9000);
      renderPiano();
      return;
    }
  }
  try {
    const patch = {};
    patch[campo] = campo === 'attivo' ? !!valore : String(valore).trim().toUpperCase();
    await secPatch('piano_regole_gruppo', 'id=eq.' + id, patch);
    const r = pianoRegoleGruppoCache.find((x) => x.id === id);
    if (r) r[campo] = patch[campo];
    logAzione('Regola gruppo modificata', (r ? r.gruppo + ' ' + r.tipo_regola : id) + ' ' + campo);
    toast('Regola aggiornata');
  } catch (e) {
    toast('Errore salvataggio regola');
  }
}
async function aggiungiRegolaGruppo() {
  if (!isAdmin()) return;
  const gruppo = (document.getElementById('rg-gruppo') || {}).value;
  const tipo = (document.getElementById('rg-tipo') || {}).value;
  const valore = ((document.getElementById('rg-valore') || {}).value || '').trim().toUpperCase();
  if (!gruppo || !tipo || !valore) {
    toast('Compila gruppo, regola e valore');
    return;
  }
  const errore = _pianoValidaRegolaGruppo(gruppo, tipo, valore, _pianoReparto());
  if (errore) {
    toastErrore(errore, 9000);
    return;
  }
  try {
    const r = await secPost('piano_regole_gruppo', {
      gruppo: gruppo,
      tipo_regola: tipo,
      valore: valore,
      attivo: true,
      reparto_dip: _pianoReparto(),
    });
    if (r && r[0]) pianoRegoleGruppoCache.push(r[0]);
    logAzione('Regola gruppo aggiunta', gruppo + ' ' + tipo + ' ' + valore);
    toast('Regola aggiunta');
    renderPiano();
  } catch (e) {
    toast('Errore aggiunta regola');
  }
}
async function eliminaRegolaGruppo(id) {
  if (!isAdmin()) return;
  const r = pianoRegoleGruppoCache.find((x) => x.id === id);
  if (!r || !(await chiediConferma('Eliminare la regola ' + r.gruppo + ' ' + r.tipo_regola + ' = ' + r.valore + '?')))
    return;
  try {
    await secDel('piano_regole_gruppo', 'id=eq.' + id);
    pianoRegoleGruppoCache = pianoRegoleGruppoCache.filter((x) => x.id !== id);
    logAzione('Regola gruppo eliminata', r.gruppo + ' ' + r.tipo_regola);
    toast('Regola eliminata');
    renderPiano();
  } catch (e) {
    toast('Errore eliminazione regola');
  }
}

// ===== CARD CONGEDI NON PAGATI =====
function _renderPianoCongediNpCard() {
  // chi vede la scheda Congedi vede l elenco; registra ed elimina solo chi gestisce il piano
  // registrare ed eliminare i congedi non pagati: Storico HR, modificare (v348)
  const puoModCnp = typeof puoModificareStoricoHr === 'function' && puoModificareStoricoHr();
  const rep = _pianoReparto();
  const lista = _pianoCongediNp
    .filter((c) => (c.reparto_dip || 'slots') === rep)
    .slice()
    .sort((a, b) => String(b.dal).localeCompare(String(a.dal)));
  const sogliaGg = parseInt(_pianoRegolaVal('congedo_np_giorni_vacanze'));
  const sogliaMesi = parseInt(_pianoRegolaVal('congedo_np_mesi_anzianita'));
  const sg = isNaN(sogliaGg) ? 10 : sogliaGg;
  const sm = isNaN(sogliaMesi) ? 6 : sogliaMesi;
  const nomi = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome)
    .sort();
  const fmt = (d) => String(d).substring(0, 10).split('-').reverse().join('.');
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:10px">Congedi non pagati · ' +
    escP(repartoLabel(rep)) +
    (lista.length
      ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:4px 12px" onclick="esportaTabellaExcel(\'piano-congedi-table\',\'congedi_' +
        rep +
        '\')">Excel</button>'
      : '') +
    '</div><div style="padding:10px 14px">' +
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:8px">Regolamento aziendale 5.14: domanda scritta, concessione della Direzione. Nel piano i giorni diventano <b>CNP</b> (zero ore, non contano fra le ore dovute). ' +
    (sg
      ? 'Oltre <b>' + sg + ' giorni</b> il diritto vacanze dell anno si riduce in proporzione; '
      : '<b>Ogni giorno</b> di congedo riduce in proporzione il diritto vacanze dell anno; ') +
    (sm
      ? 'oltre <b>' + sm + ' mesi</b> l anzianita di servizio si sposta in avanti di tutta la durata'
      : '<b>ogni giorno</b> di congedo sposta in avanti l anzianita di servizio') +
    ' (giubilei e giorni di vacanza in piu). Le due soglie si cambiano nella scheda Regole. Il congedo si registra anche dalla scheda del collaboratore.</p>';
  if (!puoModCnp)
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 10px">Registrare o eliminare un congedo: serve il permesso Storico HR (modificare).</p>';
  if (puoModCnp)
    h +=
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px">' +
      '<div class="field" style="margin:0"><label>Collaboratore</label><select id="cnp-nome" style="padding:6px">' +
      nomi.map((n) => '<option value="' + escP(n) + '">' + escP(n) + '</option>').join('') +
      '</select></div>' +
      '<div class="field" style="margin:0"><label>Dal</label><input type="date" id="cnp-dal" style="padding:6px"></div>' +
      '<div class="field" style="margin:0"><label>Al</label><input type="date" id="cnp-al" style="padding:6px"></div>' +
      '<div class="field" style="margin:0;min-width:180px"><label>Motivo</label><input type="text" id="cnp-motivo" placeholder="es. viaggio, famiglia, studio" style="padding:6px"></div>' +
      '<div class="field" style="margin:0"><label>Autorizzato da</label><input type="text" id="cnp-aut" placeholder="Direzione" style="padding:6px"></div>' +
      '<button class="btn-add-tipo" onclick="aggiungiCongedoNp()">Registra congedo</button></div>';
  if (!lista.length)
    h +=
      '<p style="font-size:var(--fs-md,.875rem);color:var(--muted)">Nessun congedo registrato in questo settore.</p>';
  else {
    // riepilogo per persona: giorni di congedo per anno
    const tot = {};
    lista.forEach((c) => {
      const k = c.collaboratore + '|' + String(c.dal).substring(0, 4);
      tot[k] = (tot[k] || 0) + _pianoGiorniCongedo(c);
    });
    h +=
      '<p style="font-size:var(--fs-md,.875rem);margin:6px 0">' +
      Object.keys(tot)
        .sort()
        .map((k) => '<b>' + escP(k.split('|')[0]) + '</b> ' + k.split('|')[1] + ': ' + tot[k] + ' giorni')
        .join(' &middot; ') +
      '</p><input type="search" class="campo-cerca" placeholder="Cerca collaboratore o motivo..." oninput="pianoTabellaFiltra(this.value,\'piano-congedi-table\')" style="min-width:260px;margin-bottom:8px">';
    h +=
      '<div style="overflow-x:auto"><table id="piano-congedi-table" class="piano-table" style="min-width:700px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Dal</th><th>Al</th><th>Giorni</th><th style="text-align:left">Motivo</th><th style="text-align:left">Autorizzato da</th><th style="text-align:left">Effetti</th><th></th></tr></thead><tbody>';
    lista.forEach((c) => {
      const gg = _pianoGiorniCongedo(c);
      const eff = [];
      if (gg > sg) {
        // per ogni anno toccato: giorni di vacanza tolti (proporzione sui 365)
        const anni = [...new Set([String(c.dal).substring(0, 4), String(c.al).substring(0, 4)])];
        anni.forEach((a) => {
          const info = _pianoCollabInfo(c.collaboratore) || {};
          const effA = _pianoCongedoNpEffetti(c.collaboratore, parseInt(a));
          const base =
            info.data_assunzione && typeof PianoRegole !== 'undefined'
              ? PianoRegole.giorniVacanzaSpettanti(
                  String(info.data_assunzione).substring(0, 10),
                  parseInt(a),
                  _pianoVacCfg(),
                )
              : null;
          const ridotte =
            info.data_assunzione && typeof PianoRegole !== 'undefined'
              ? PianoRegole.giorniVacanzaSpettanti(
                  String(info.data_assunzione).substring(0, 10),
                  parseInt(a),
                  Object.assign({}, _pianoVacCfg(), {
                    giorniCongedo: effA.giorniVacanze,
                    giorniAnzianita: effA.giorniAnzianita,
                  }),
                )
              : null;
          eff.push(
            base && ridotte
              ? 'vacanze ' + a + ': ' + base.giorni + ' -> ' + ridotte.giorni
              : 'vacanze ' + a + ' ridotte in proporzione',
          );
        });
      }
      if (gg > sm * 30.44) eff.push('anzianita spostata di ' + gg + ' giorni');
      if (!eff.length) eff.push('solo piano (CNP)');
      h +=
        '<tr data-nome="' +
        escP(String(c.collaboratore).toLowerCase() + ' ' + (c.motivo || '').toLowerCase()) +
        '"><td style="text-align:left;font-weight:600">' +
        escP(c.collaboratore) +
        '</td><td>' +
        fmt(c.dal) +
        '</td><td>' +
        fmt(c.al) +
        '</td><td>' +
        gg +
        '</td><td style="text-align:left">' +
        escP(c.motivo || '') +
        '</td><td style="text-align:left">' +
        escP(c.autorizzato_da || '') +
        '</td><td style="text-align:left;font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        escP(eff.join(', ')) +
        '</td><td>' +
        (puoModCnp ? '<button class="btn-del-tipo" onclick="eliminaCongedoNp(' + c.id + ')">Elimina</button>' : '') +
        '</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div></div>';
  return h;
}
async function aggiungiCongedoNp() {
  if (!puoModificareStoricoHr()) return;
  const ok = await registraCongedoNp({
    nome: (document.getElementById('cnp-nome') || {}).value,
    dal: (document.getElementById('cnp-dal') || {}).value,
    al: (document.getElementById('cnp-al') || {}).value,
    motivo: ((document.getElementById('cnp-motivo') || {}).value || '').trim(),
    aut: ((document.getElementById('cnp-aut') || {}).value || '').trim(),
  });
  if (ok) renderPiano();
}
// dalla scheda del collaboratore: finestra con dal, al, motivo, autorizzato da
async function apriCongedoNpScheda(nome) {
  if (!puoModificareStoricoHr()) {
    toast('Serve il permesso Storico HR (modificare)');
    return;
  }
  const r = await chiediModulo(
    'Congedo non pagato di ' +
      nome +
      ': nel piano i giorni diventano CNP (zero ore) e non contano per l anzianita (giubilei e giorni di vacanza in piu).',
    [
      {
        titolo: 'Periodo',
        campi: [
          { id: 'dal', tipo: 'testo', etichetta: 'dal', segnaposto: 'gg.mm.aaaa', larghezza: 110 },
          { id: 'al', tipo: 'testo', etichetta: 'al', segnaposto: 'gg.mm.aaaa', larghezza: 110 },
        ],
      },
      {
        titolo: 'Dettagli',
        campi: [
          { id: 'motivo', tipo: 'testo', etichetta: 'motivo', segnaposto: 'es. viaggio, famiglia', larghezza: 200 },
          { id: 'aut', tipo: 'testo', etichetta: 'autorizzato da', segnaposto: 'Direzione', larghezza: 140 },
        ],
      },
    ],
    { titolo: 'Registra congedo non pagato', ok: 'Registra' },
  );
  if (!r) return;
  const iso = (t) => {
    const m = String(t || '')
      .trim()
      .match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (!m) return '';
    const a = m[3].length === 2 ? '20' + m[3] : m[3];
    return a + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  };
  const ok = await registraCongedoNp({
    nome: nome,
    dal: iso(r.dal),
    al: iso(r.al),
    motivo: (r.motivo || '').trim(),
    aut: (r.aut || '').trim(),
  });
  if (ok && typeof apriSchedaCollaboratoreSicuro === 'function') apriSchedaCollaboratoreSicuro(nome);
}
// salvataggio unico del congedo (Piano e scheda): controlli, conferma, piano CNP, storico HR
async function registraCongedoNp(x) {
  if (!puoModificareStoricoHr()) {
    toast('Serve il permesso Storico HR (modificare)');
    return false;
  }
  const nome = x.nome;
  const dal = x.dal;
  const al = x.al;
  const motivo = x.motivo;
  const aut = x.aut;
  if (!nome || !dal || !al) {
    toastErrore('Servono collaboratore, data di inizio e data di fine (gg.mm.aaaa)');
    return false;
  }
  if (al < dal) {
    toastErrore('La data di fine e prima di quella di inizio');
    return false;
  }
  const gg = Math.round((new Date(al + 'T12:00:00') - new Date(dal + 'T12:00:00')) / 86400000) + 1;
  if (gg > 366) {
    toastErrore('Un congedo di piu di un anno non e previsto dal regolamento');
    return false;
  }
  if (!motivo) {
    toastErrore('Scrivi il motivo: serve per la scheda e per HR');
    return false;
  }
  const sovrapposto = _pianoCongediDi(nome).find(
    (c) => !(String(c.al).substring(0, 10) < dal || String(c.dal).substring(0, 10) > al),
  );
  if (sovrapposto) {
    toastErrore(
      'Si sovrappone a un congedo gia registrato (' +
        String(sovrapposto.dal).substring(0, 10) +
        ' / ' +
        String(sovrapposto.al).substring(0, 10) +
        ')',
    );
    return false;
  }
  const sogliaMesi = parseInt(_pianoRegolaVal('congedo_np_mesi_anzianita'));
  const sm = isNaN(sogliaMesi) ? 6 : sogliaMesi;
  const avviso =
    gg > sm * 30.44
      ? '\n\nL anzianita di servizio si sposta in avanti di ' + gg + ' giorni (giubilei e giorni di vacanza in piu).'
      : '';
  if (
    !(await chiediConferma(
      'Registro il congedo non pagato di ' +
        nome +
        ' dal ' +
        dal.split('-').reverse().join('.') +
        ' al ' +
        al.split('-').reverse().join('.') +
        ' (' +
        gg +
        ' giorni)?\n\nNel piano i giorni diventano CNP e non contano fra le ore dovute.' +
        avviso,
    ))
  )
    return false;
  const info = (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : []).find((c) => c.nome === nome) || {};
  const rep = info.reparto_dip || _pianoReparto();
  try {
    const nuovo = await secPost('collab_congedi_np', {
      collaboratore: nome,
      reparto_dip: rep,
      dal: dal,
      al: al,
      motivo: motivo,
      autorizzato_da: aut || null,
      operatore: getOperatore(),
    });
    const rec = (nuovo && nuovo[0]) || { collaboratore: nome, reparto_dip: rep, dal: dal, al: al, motivo: motivo };
    _pianoCongediNp.push(rec);
    const celle = await _pianoSincronizzaCongedoNp(rec, false);
    logAzione('Congedo non pagato registrato', nome + ' ' + dal + ' / ' + al + ' (' + gg + ' giorni): ' + motivo);
    if (typeof _insertHrEvento === 'function')
      // (nome, tipo, descrizione, data): prima riceveva un oggetto e la riga
      // nello storico HR non veniva scritta
      await _insertHrEvento(
        nome,
        'congedo_np',
        'Congedo non pagato dal ' +
          dal.split('-').reverse().join('.') +
          ' al ' +
          al.split('-').reverse().join('.') +
          ' (' +
          gg +
          ' giorni): ' +
          motivo,
        dal,
      );
    toast('Congedo registrato · ' + celle + ' giorni segnati CNP nel piano');
    return true;
  } catch (e) {
    toastErrore('Errore nel salvataggio del congedo: ' + (e.message || ''));
    return false;
  }
}
async function eliminaCongedoNp(id) {
  if (!puoModificareStoricoHr()) return;
  const c = _pianoCongediNp.find((x) => x.id === id);
  if (!c) return;
  if (
    !(await chiediConferma(
      'Eliminare il congedo di ' +
        c.collaboratore +
        ' dal ' +
        String(c.dal).substring(0, 10) +
        ' al ' +
        String(c.al).substring(0, 10) +
        '?\n\nI giorni CNP nel piano vengono tolti.',
    ))
  )
    return;
  try {
    await secDel('collab_congedi_np', 'id=eq.' + id);
    _pianoCongediNp = _pianoCongediNp.filter((x) => x.id !== id);
    const tolte = await _pianoSincronizzaCongedoNp(c, true);
    logAzione(
      'Congedo non pagato eliminato',
      c.collaboratore + ' ' + String(c.dal).substring(0, 10) + ' / ' + String(c.al).substring(0, 10),
    );
    toast('Congedo eliminato · ' + tolte + ' giorni CNP tolti dal piano');
    renderPiano();
  } catch (e) {
    toastErrore('Errore: ' + (e.message || ''));
  }
}
function _renderPianoPreferenzeCard() {
  if (!puoVedereStoricoHr()) return '';
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Preferenze collaboratori · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  // turni bloccati di partenza e requisiti (solo amministratore)
  if (isAdmin()) {
    const rep = _pianoReparto();
    const bc = _pianoBloccatiCfg(rep);
    const inp = (id, campo, val, ph, w) =>
      '<input type="text" id="' +
      id +
      '" value="' +
      escP(val) +
      '" placeholder="' +
      ph +
      '" onchange="salvaBloccatiNuovi(\'' +
      campo +
      '\',this.value)" style="width:' +
      w +
      'px;padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">';
    h +=
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:var(--paper2);border-radius:3px;font-size:var(--fs-md,.875rem)">' +
      '<label for="pref-bloccati-nuovi">Turni bloccati</label>' +
      inp('pref-bloccati-nuovi', 'codici', bc.codici, 'Es: S1, S3', 100) +
      '<label for="pref-bloccati-gruppi" title="Reparti dei turni: competenza certificata in Formazione oppure turni di quel reparto nel piano dell ultimo anno">a chi non copre</label>' +
      inp('pref-bloccati-gruppi', 'gruppi', bc.gruppi, 'Es: SALA, REC, CASSA', 150) +
      '<button class="btn-act" onclick="pianoBloccaSenzaRequisiti()" title="Mostra chi oggi non ha i requisiti e, dopo la conferma, aggiunge i turni bloccati">Applica ora</button>' +
      '<span style="flex-basis:100%;font-size:var(--fs-xs,.75rem);color:var(--muted)">I collaboratori nuovi partono con questi turni bloccati (all import Excel non chi nel file fa gia tutti quei reparti); poi si cambiano nella loro riga.</span></div>';
  }
  h +=
    '<div style="display:flex;margin-bottom:8px"><input type="text" id="pref-collab-cerca" class="piano-cerca campo-cerca" placeholder="Cerca collaboratore..." oninput="_filtraPrefCollab(this.value)"></div>';
  // Preferisce L1 e Accoglienza riguardano solo le slot (turni L1, gruppo ACCOGLIENZA)
  const soloSlots = _pianoReparto() === 'slots';
  // chi vede lo Storico HR senza poterlo modificare (e senza gestire il piano) legge le
  // preferenze ma non le cambia: campi disattivati (prima li spuntava e il salvataggio
  // veniva rifiutato con la spunta che restava a schermo)
  const prefSolaLettura = !puoGestirePiano() && !puoModificareStoricoHr();
  if (prefSolaLettura)
    h +=
      '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-bottom:6px">Sola lettura: le preferenze le cambia chi gestisce il piano o chi puo modificare lo Storico HR.</p>';
  h +=
    '<fieldset' +
    (prefSolaLettura ? ' disabled' : '') +
    ' style="border:0;padding:0;margin:0;min-width:0"><div style="overflow-x:auto"><table class="piano-table" id="pref-collab-table" style="min-width:760px;font-size:var(--fs-md,.875rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th><th>Solo diurni</th><th title="Solo turni notturni">Solo notturni</th><th style="text-align:left" title="Giorni in cui lavora: negli altri non viene mai proposto (bozza, Migliora, generazione automatica, cerca cambio, copertura malattia, formazioni). Nessuna spunta = tutti i giorni">Giorni di lavoro</th><th style="text-align:left">Turni bloccati (CSV)</th><th style="text-align:left" title="Eccezioni alle regole Turni per livello: questi turni li puo fare anche senza il livello richiesto (CSV)">Turni consentiti</th>' +
    (soloSlots
      ? '<th title="La bozza le privilegia sui turni L1">Preferisce L1</th><th title="Livello accoglienza (0-2): serve per il gruppo ACCOGLIENZA">Accoglienza</th>'
      : '') +
    '<th style="text-align:left" title="Gruppi dove NON può lavorare da solo (CSV, es: REC)">Accompagnamento</th><th style="text-align:left" title="Altri reparti in cui lavora (CSV, es: valet): appare anche nei loro piani e le ore si sommano">Reparti extra</th><th style="text-align:left" title="Derivati dalle competenze certificate in Formazione (sola lettura)">Settori</th></tr></thead><tbody>';
  collabs.forEach((c) => {
    h +=
      '<tr data-pref-nome="' +
      escP(c.nome.toLowerCase()) +
      '"><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td>' +
      escP(c.funzione || '-') +
      '</td><td>' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</td><td><input type="checkbox"' +
      (c.solo_diurni ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'solo_diurni\',this.checked)"></td><td><input type="checkbox"' +
      (c.solo_notti ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'solo_notti\',this.checked)"></td><td style="text-align:left;white-space:nowrap">' +
      _pianoGiorniLavoroChips(c) +
      _pianoGiorniSettSelect(c) +
      '</td><td style="text-align:left"><input type="text" value="' +
      escP(c.turni_bloccati || '') +
      '" placeholder="Es: S8,S7C" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'turni_bloccati\',this.value)" style="width:140px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.turni_consentiti || '') +
      '" placeholder="Es: 10,9" title="Turni che puo fare anche senza il livello richiesto (regole Turni per livello)" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'turni_consentiti\',this.value)" style="width:100px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td>' +
      (soloSlots
        ? '<td><input type="checkbox"' +
          (c.prefers_l1 ? ' checked' : '') +
          ' onchange="salvaPreferenzaCollab(' +
          c.id +
          ',\'prefers_l1\',this.checked)"></td><td><input type="number" min="0" max="2" value="' +
          (parseInt(c.accoglienza) || 0) +
          '" onchange="salvaPreferenzaCollab(' +
          c.id +
          ',\'accoglienza\',this.value)" style="width:52px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td>'
        : '') +
      '<td style="text-align:left"><input type="text" value="' +
      escP(c.accompagnamento_settori || '') +
      '" placeholder="Es: REC" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'accompagnamento_settori\',this.value)" style="width:90px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left">' +
      (typeof apriCoperturaCollab === 'function'
        ? '<button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:2px 8px" title="Copertura altri settori: si imposta qui e in Gestione collaboratori (stessa finestra)" onclick="apriCoperturaCollab(' +
          c.id +
          ')">' +
          escP(
            String(c.reparti_extra || '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .map((k) => repartoLabel(k))
              .join(', ') || 'imposta...',
          ) +
          '</button>'
        : escP(c.reparti_extra || '-')) +
      '</td><td style="text-align:left;font-size:var(--fs-sm,.8125rem);color:var(--muted)" title="Si gestiscono con le spunte in Formazione">' +
      escP((_pianoSettoriEffettivi(c) || []).join(', ') || '-') +
      '</td></tr>';
  });
  h += '</tbody></table></div></fieldset>';
  h +=
    '<p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:6px">"Solo diurni" e i turni bloccati vengono rispettati dalla bozza automatica. Funzione e percentuale si modificano in Impostazioni del Diario → Gestione collaboratori; i <b>Settori</b> derivano dalle competenze certificate in <b>Formazione</b> (spunta = idoneo, sola lettura qui).</p>';
  h += '</div></div>';
  return h;
}
// filtro live della tabella preferenze (solo visivo)
function _filtraPrefCollab(testo) {
  const q = (testo || '').trim().toLowerCase();
  document.querySelectorAll('#pref-collab-table tbody tr').forEach((tr) => {
    tr.style.display = !q || (tr.dataset.prefNome || '').includes(q) ? '' : 'none';
  });
}
// TURNI BLOCCATI DI PARTENZA (v365): per settore, i turni che si possono fare solo
// coprendo alcuni reparti (Slots: S1 e S3 danno le pause in cassa e reception, quindi
// servono sala, reception e cassa). Un reparto e coperto se la competenza e
// certificata in Formazione OPPURE se nell ultimo anno (giorni gia passati) la persona
// ha lavorato turni di quel reparto (dai piani importati). All import Excel contano le
// sigle del file. Chi non li copre tutti li ha bloccati:
//  - ogni collaboratore nuovo li riceve da solo (_collabNuovoConBloccati in
//    realtime.js); all import Excel non li riceve chi nel file fa gia tutti i reparti;
//  - il pulsante li aggiunge a chi oggi non ha i requisiti (elenco prima di salvare).
// Poi si cambiano a mano nella riga del collaboratore. Responsabili esclusi.
// Impostazione piano_turni_bloccati_nuovi = { settore: { codici, gruppi } }.
const PIANO_BLOCCATI_NUOVI_BASE = { slots: { codici: 'S1, S3', gruppi: 'SALA, REC, CASSA' } };
function _pianoBloccatiCfg(rep) {
  const cfg =
    window._pianoBloccatiNuovi && typeof window._pianoBloccatiNuovi === 'object'
      ? window._pianoBloccatiNuovi
      : PIANO_BLOCCATI_NUOVI_BASE;
  const v = cfg[rep || 'slots'];
  if (!v) return { codici: '', gruppi: '' };
  if (typeof v === 'string') return { codici: v, gruppi: '' }; // forma semplice
  return { codici: String(v.codici || ''), gruppi: String(v.gruppi || '') };
}
function pianoBloccatiDiPartenza(rep) {
  return _pianoBloccatiCfg(rep).codici.trim();
}
function _pianoListaCodici(v) {
  return [
    ...new Set(
      String(v || '')
        .split(/[,\s]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}
// reparti dei turni (gruppo) che una lista di sigle copre, nel settore rep
function _pianoGruppiDiCodici(codici, rep) {
  const perCod = {};
  (pianoTurniCache || [])
    .filter((t) => (t.reparto_dip || 'slots') === rep)
    .forEach((t) => (perCod[String(t.codice).toUpperCase()] = String(t.gruppo || '').toUpperCase()));
  const out = new Set();
  codici.forEach((c) => {
    const g = perCod[String(c).toUpperCase()];
    if (g) out.add(g);
  });
  return out;
}
// requisiti mancanti per i turni bloccati di partenza: [] = li puo fare.
// codiciFatti: sigle lavorate (piano o file); c: collaboratore (competenze)
function _pianoRequisitiMancanti(c, rep, codiciFatti) {
  const cfg = _pianoBloccatiCfg(rep);
  const gruppi = _pianoListaCodici(cfg.gruppi);
  // contano solo i reparti: avere fatto un S1 o S3 non basta (puo essere stato un
  // errore del piano, es. un S3 dato a chi non ha mai fatto cassa)
  const fatti = (codiciFatti || []).map((x) => String(x).toUpperCase());
  const daTurni = _pianoGruppiDiCodici(fatti, rep);
  const sp = (c && c.competenze) || {};
  const comps = (typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {})[rep] || [];
  const daComp = new Set(
    comps
      .filter((k) => sp[k.key] === true)
      .map((k) => (typeof _formGruppoDi === 'function' ? _formGruppoDi(k) : null))
      .filter(Boolean),
  );
  return gruppi.filter((g) => !daTurni.has(g) && !daComp.has(g));
}
async function salvaBloccatiNuovi(campo, valore) {
  if (!isAdmin()) return;
  const rep = _pianoReparto();
  const lista = _pianoListaCodici(valore);
  const ammessi =
    campo === 'codici'
      ? new Set(_pianoTurniReparto().map((t) => String(t.codice).toUpperCase()))
      : new Set(_pianoTurniReparto().map((t) => String(t.gruppo || '').toUpperCase()));
  const sbagliati = lista.filter((c) => !ammessi.has(c));
  if (sbagliati.length) {
    toastErrore(
      (campo === 'codici' ? 'Non sono turni di ' : 'Non sono reparti dei turni di ') +
        repartoLabel(rep) +
        ': ' +
        sbagliati.join(', '),
    );
    renderPiano();
    return;
  }
  const base =
    window._pianoBloccatiNuovi && typeof window._pianoBloccatiNuovi === 'object'
      ? window._pianoBloccatiNuovi
      : PIANO_BLOCCATI_NUOVI_BASE;
  const cfg = JSON.parse(JSON.stringify(base));
  const prima = _pianoBloccatiCfg(rep);
  cfg[rep] = { codici: prima.codici, gruppi: prima.gruppi };
  cfg[rep][campo] = lista.join(', ');
  if (!(await salvaImp('piano_turni_bloccati_nuovi', JSON.stringify(cfg)))) return;
  window._pianoBloccatiNuovi = cfg;
  logAzione(
    'Piano: turni bloccati dei nuovi',
    rep + ' · ' + campo + ' ' + (prima[campo] || 'nessuno') + ' → ' + (cfg[rep][campo] || 'nessuno'),
  );
  toast('Salvato');
}
// chi oggi non ha i requisiti: elenco con le spunte e il motivo, poi si salva
async function pianoBloccaSenzaRequisiti() {
  if (!isAdmin()) return;
  const rep = _pianoReparto();
  const cfg = _pianoBloccatiCfg(rep);
  const codici = _pianoListaCodici(cfg.codici);
  if (!codici.length || !_pianoListaCodici(cfg.gruppi).length) {
    toastErrore('Scrivi prima i turni (es. S1, S3) e i reparti che servono (es. SALA, REC, CASSA)');
    return;
  }
  // turni LAVORATI nel settore nell ultimo anno: solo giorni passati (una bozza o il
  // piano dei prossimi mesi non dimostrano che la persona sa fare quel reparto)
  const da = new Date();
  da.setFullYear(da.getFullYear() - 1);
  const oggi = oggiLocale();
  let storia;
  try {
    storia =
      (await secGet(
        'piano?reparto_dip=eq.' +
          rep +
          '&data=gte.' +
          dataLocaleISO(da) +
          '&data=lt.' +
          oggi +
          '&select=collaboratore,codice&limit=60000',
      )) || [];
  } catch (e) {
    toastErrore('Lettura del piano non riuscita: ' + (e.message || e));
    return;
  }
  const fatti = {};
  storia.forEach((r) => (fatti[r.collaboratore] = fatti[r.collaboratore] || new Set()).add(r.codice));
  const ha = (c) => _pianoListaCodici(c.turni_bloccati);
  const nomi = [];
  const motivo = {};
  collaboratoriCache
    .filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === rep)
    .filter((c) => !['RESP', 'VICERESP'].includes(String(c.funzione || '').toUpperCase()))
    .filter((c) => !codici.every((x) => ha(c).includes(x)))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach((c) => {
      const manca = _pianoRequisitiMancanti(c, rep, [...(fatti[c.nome] || [])]);
      if (!manca.length) return;
      nomi.push(c.nome);
      motivo[c.nome] = 'manca ' + manca.join(', ');
    });
  if (!nomi.length) {
    toast('Tutti quelli senza ' + cfg.gruppi + ' hanno gia ' + codici.join(', ') + ' bloccati');
    return;
  }
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="width:min(560px,100%)"><h3>Bloccare ' +
    escP(codici.join(', ')) +
    '</h3><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 10px">Collaboratori di ' +
    escP(repartoLabel(rep)) +
    ' che non coprono ' +
    escP(cfg.gruppi) +
    ': ne la competenza certificata in Formazione, ne turni di quel reparto nel piano dell ultimo anno. Togli la spunta a chi vuoi lasciare libero; i turni bloccati che hanno gia restano.</p>' +
    _selPersHtml('blk-sel', [{ titolo: 'Da bloccare', nomi: nomi }], nomi, { dettagli: motivo }) +
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no" id="blk-no">Annulla</button><button type="button" class="finestra-ok" id="blk-ok">Blocca ' +
    escP(codici.join(', ')) +
    '</button></div></div>';
  document.body.appendChild(velo);
  selPersDisegna('blk-sel');
  const scelti = await new Promise((fine) => {
    document.getElementById('blk-no').onclick = () => fine(null);
    document.getElementById('blk-ok').onclick = () => fine(selPersValori('blk-sel'));
  });
  velo.remove();
  if (!scelti || !scelti.length) return;
  let n = 0;
  try {
    for (const nome of scelti) {
      const c = collaboratoriCache.find((x) => x.nome === nome && x.attivo !== false);
      if (!c) continue;
      const val = ha(c)
        .concat(codici.filter((x) => !ha(c).includes(x)))
        .join(',');
      await secPatch('collaboratori', 'id=eq.' + c.id, { turni_bloccati: val });
      c.turni_bloccati = val;
      n++;
    }
  } catch (e) {
    toastErrore('Salvataggio interrotto dopo ' + n + ' collaboratori: ' + (e.message || e));
    renderPiano();
    return;
  }
  logAzione(
    'Piano: turni bloccati a chi non ha i requisiti',
    rep + ' · ' + codici.join(', ') + ' · ' + scelti.join(', '),
  );
  toast(codici.join(', ') + ' bloccati a ' + n + (n === 1 ? ' collaboratore' : ' collaboratori'));
  renderPiano();
}
// GIORNI DI LAVORO (preferenza): L M M G V S D, numeri di getDay (1 lunedi ... 0 domenica)
const _PIANO_GIORNI_SETT = [
  [1, 'L', 'lunedi'],
  [2, 'M', 'martedi'],
  [3, 'M', 'mercoledi'],
  [4, 'G', 'giovedi'],
  [5, 'V', 'venerdi'],
  [6, 'S', 'sabato'],
  [0, 'D', 'domenica'],
];
function _pianoGiorniLavoroTesto(v) {
  const set = String(v || '')
    .split(',')
    .map((x) => (parseInt(x) === 7 ? 0 : parseInt(x))) // domenica: 0 (o 7)
    .filter((x) => !isNaN(x));
  return _PIANO_GIORNI_SETT
    .filter((g) => set.includes(g[0]))
    .map((g) => g[2])
    .join(', ');
}
function _pianoGiorniLavoroChips(c) {
  const set = String(c.giorni_lavoro || '')
    .split(',')
    .map((x) => (parseInt(x) === 7 ? 0 : parseInt(x))) // domenica: 0 (o 7)
    .filter((x) => !isNaN(x));
  return _PIANO_GIORNI_SETT
    .map(
      (g) =>
        '<label title="' +
        g[2] +
        '" style="display:inline-flex;flex-direction:column;align-items:center;margin-right:4px;font-size:var(--fs-xs,.75rem);line-height:1.1;cursor:pointer"><input type="checkbox" style="margin:0 0 2px" data-giorno="' +
        g[0] +
        '"' +
        (set.includes(g[0]) ? ' checked' : '') +
        ' onchange="salvaGiorniLavoro(' +
        c.id +
        ',this)">' +
        g[1] +
        '</label>',
    )
    .join('');
}
// quanti giorni a settimana al massimo (vuoto = nessun limite): con piu giorni
// spuntati che giorni a settimana il programma sceglie ogni settimana quali dare
function _pianoGiorniSettSelect(c) {
  const v = parseInt(c.giorni_settimana) || 0;
  let o = '<option value=""' + (v ? '' : ' selected') + '>tutti</option>';
  for (let k = 1; k <= 6; k++) o += '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + k + '</option>';
  return (
    '<label style="margin-left:8px;font-size:var(--fs-xs,.75rem);white-space:nowrap" title="Giorni di lavoro al massimo nella settimana lunedi-domenica. Con piu giorni spuntati (es. G V S D e 3) il programma sceglie ogni settimana quali, cosi puo lasciare libere anche delle domeniche">a settimana <select onchange="salvaPreferenzaCollab(' +
    c.id +
    ',\'giorni_settimana\',this.value)" style="padding:1px 2px">' +
    o +
    '</select></label>'
  );
}
async function salvaGiorniLavoro(id, el) {
  const td = el.closest('td');
  const scelti = [...td.querySelectorAll('input[data-giorno]:checked')].map((x) => x.dataset.giorno);
  // tutti o nessuno = tutti i giorni (nessun limite)
  await salvaPreferenzaCollab(id, 'giorni_lavoro', scelti.length === 7 ? '' : scelti.join(','));
}
// DOMENICHE LIBERE: chi puo lavorare la domenica e ha tanti giorni a settimana quanti
// i giorni spuntati lavora ogni fine settimana, e le domeniche libere del
// regolamento (minimo all anno) non sono garantite. Si avvisa con la soluzione.
function _pianoAvvisoDomenicheGiorni(c) {
  if (!c || _pianoRegolaVal('domeniche_libere_anno') == null) return;
  const set = String(c.giorni_lavoro || '')
    .split(',')
    .map((x) => (parseInt(x) === 7 ? 0 : parseInt(x))) // domenica: 0 (o 7)
    .filter((x) => x >= 0 && x <= 6);
  if (!set.length || !set.includes(0)) return; // nessun limite o domenica esclusa
  const max = parseInt(c.giorni_settimana) || 0;
  if (max && max < set.length) return; // il programma puo scegliere: domeniche libere possibili
  const min = parseInt(_pianoRegolaVal('domeniche_libere_anno')) || 12;
  mostraAvviso(
    c.nome +
      ' lavora solo ' +
      _pianoGiorniLavoroTesto(c.giorni_lavoro) +
      (max ? ', ' + max + ' giorni a settimana' : '') +
      '.\n\nCosi lavora tutte le domeniche: le domeniche libere del regolamento (almeno ' +
      min +
      ' all anno, con il sabato che finisce entro le 23) non sono garantite e Valida regole le segnalera.\n\nSoluzione: spunta un giorno in piu (es. giovedi) e scegli "a settimana" ' +
      set.length +
      ': ogni settimana il programma sceglie quali ' +
      set.length +
      ' giorni dare e puo lasciare libere alcune domeniche.',
    { titolo: 'Domeniche libere non garantite' },
  );
}
async function salvaPreferenzaCollab(id, campo, valore) {
  // preferenze del piano (es. solo diurni): chi gestisce il piano o lo Storico HR
  if (!puoGestirePiano() && !puoModificareStoricoHr()) {
    toast('Non hai il permesso');
    return;
  }
  try {
    const patch = {};
    if (campo === 'solo_diurni' || campo === 'solo_notti' || campo === 'prefers_l1') patch[campo] = !!valore;
    else if (campo === 'giorni_lavoro') patch[campo] = String(valore || '').trim() || null;
    else if (campo === 'giorni_settimana') patch[campo] = parseInt(valore) > 0 ? Math.min(6, parseInt(valore)) : null;
    else if (campo === 'accoglienza') patch[campo] = Math.max(0, Math.min(2, parseInt(valore) || 0));
    else patch[campo] = String(valore).trim().toUpperCase() || null;
    // solo diurni e solo notti non vanno insieme: scegliendone uno si toglie l altro
    if (campo === 'solo_diurni' && patch[campo]) patch.solo_notti = false;
    if (campo === 'solo_notti' && patch[campo]) patch.solo_diurni = false;
    await secPatch('collaboratori', 'id=eq.' + id, patch);
    const c = collaboratoriCache.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
    if ((campo === 'solo_diurni' || campo === 'solo_notti') && patch[campo] && typeof renderPiano === 'function')
      renderPiano();
    logAzione('Piano: preferenza collaboratore', (c ? c.nome : id) + ' ' + campo);
    toast('Preferenza salvata');
    if (campo === 'giorni_lavoro' || campo === 'giorni_settimana') _pianoAvvisoDomenicheGiorni(c);
  } catch (e) {
    toast('Errore salvataggio preferenza');
  }
}
