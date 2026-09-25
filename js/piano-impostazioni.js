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
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Valgono per il settore aperto: ogni settore ha le sue sigle. PRINCIPALE = turni normali della funzione. AMMESSO = permessi quando serve. PREFERITO = la bozza li privilegia. Chi ha una funzione con mappature riceve SOLO i turni elencati; chi non ne ha segue i settori abilitati e le regole di gruppo.</p>';
  const ordine = { PRINCIPALE: 1, AMMESSO: 2, PREFERITO: 3 };
  const perFz = {};
  pianoMappatureCache
    .filter((m) => (m.reparto_dip || 'slots') === _pianoReparto())
    .forEach((m) => (perFz[m.funzione] = (perFz[m.funzione] || []).concat(m)));
  Object.keys(perFz)
    .sort()
    .forEach((fz) => {
      h +=
        '<p style="font-size:.85rem;font-weight:700;margin:8px 0 4px">' +
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
  if (!m || !confirm('Rimuovere ' + m.funzione + ' → ' + m.turno_codice + ' (' + m.tipo + ')?')) return;
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
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 4px">Giorni weekend</p>' +
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Colonne evidenziate in verde nel calendario e conteggio weekend nelle statistiche. La domenica ha sempre il suo colore.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    [1, 2, 3, 4, 5, 6, 0]
      .map(
        (d) =>
          '<label style="font-size:.82rem"><input type="checkbox"' +
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
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 4px">Competenze Formazione → gruppi del piano</p>' +
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Chi ha la competenza CERTIFICATA in Formazione diventa idoneo anche al gruppo indicato (in aggiunta ai suoi Settori). "-" = nessun collegamento.</p>';
  // solo i gruppi dei turni DI QUESTO settore (i turni sono divisi per settore)
  const gruppiDisp = [
    ...new Set(
      _pianoTurniReparto()
        .map((t) => (t.gruppo || '').toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  const mappaCG = _pianoCompetenzeGruppi();
  const compRep = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll()[_pianoReparto()] || [] : [];
  if (compRep.length) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    compRep.forEach((k) => {
      h +=
        '<label style="font-size:.8rem;display:flex;align-items:center;gap:4px">' +
        escP(k.label) +
        ' → <select onchange="salvaCompetenzaGruppo(\'' +
        escP(k.key) +
        '\',this.value)" style="padding:4px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">-</option>' +
        gruppiDisp
          .map(
            (g) => '<option' + ((mappaCG[k.key] || '').toUpperCase() === g ? ' selected' : '') + '>' + g + '</option>',
          )
          .join('') +
        '</select></label>';
    });
    h += '</div>';
  }
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-top:10px">Le funzioni compaiono nei menu di Gestione collaboratori e nelle mappature. Preferenze per collaboratore (solo diurni, turni bloccati, settori...) nella card qui sotto.</p>';
  h += '</div></div>';
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
  if (!puoGestirePiano()) return;
  const url = window._pianoSolverUrl;
  if (!url) return;
  const ym = _pianoMeseSel;
  const rep = _pianoReparto();
  if (
    !confirm(
      'Genero il piano di ' +
        ym +
        ' (' +
        repartoLabel(rep) +
        ') con il solver sul server interno?\n\nLe celle esistenti (vacanze, protette, malattie, blocchi) non vengono toccate; le celle generate da una bozza precedente vengono sostituite. Il calcolo puo durare fino a due minuti.',
    )
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
    !confirm(
      'Queste funzioni sono assegnate a collaboratori attivi: ' +
        tolteInUso.join(', ') +
        '.\n\nToglierle dall elenco? (le schede le mantengono, ma non compariranno piu nei menu)',
    )
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
          'Turni bloccati',
          'Preferisce L1',
          'Accoglienza',
          'Accompagnamento',
          'Lingue',
        ],
      ];
      collaboratoriCache
        .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
        .forEach((c) =>
          righe.push([
            c.nome,
            c.funzione || '',
            Math.round((parseFloat(c.percentuale) || 1) * 100) + '%',
            c.is_jolly ? 'SI' : '',
            c.solo_diurni ? 'SI' : '',
            c.turni_bloccati || '',
            c.prefers_l1 ? 'SI' : '',
            c.accoglienza || 0,
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
    '<button class="btn-export" style="font-size:.8rem;padding:4px 12px;border-color:' +
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
    '<p style="font-size:.85rem;font-weight:700;margin-bottom:6px">Esporta (CSV, apribile in Excel)</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Piano del mese', "esportaPianoDati('piano')");
  h += btn('Fabbisogno del mese', "esportaPianoDati('fabbisogno')");
  h += btn('Collaboratori', "esportaPianoDati('collaboratori')");
  h += btn('Turni', "esportaPianoDati('turni')");
  h += btn('Codici speciali', "esportaPianoDati('codici')");
  h += btn('Vacanze anno', "esportaPianoDati('vacanze')");
  h += btn('Timbrature del mese', "esportaPianoDati('timbrature')");
  h += '</div>';
  h +=
    '<p style="font-size:.85rem;font-weight:700;margin:12px 0 6px">Template per l\'import</p><div style="display:flex;gap:8px;flex-wrap:wrap">';
  h += btn('Template fabbisogno', "scaricaTemplatePiano('fabbisogno')", '#2c6e49');
  h += btn('Template vacanze', "scaricaTemplatePiano('vacanze')", '#2c6e49');
  h += btn('Template timbrature', "scaricaTemplatePiano('timbrature')", '#2c6e49');
  h += '</div>';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-top:8px">Gli import si fanno nelle rispettive schermate: fabbisogno nel Calendario, vacanze nella tab Vacanze, timbrature nella tab Timbrature (o in automatico dalla timbratrice). L\'export copre anche il backup completo in Impostazioni del Diario.</p>';
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
    '</b><br><span style="font-size:.8rem;color:var(--muted)">' +
    desc +
    '</span></div><button class="btn-export" style="font-size:.82rem;padding:5px 14px" onclick="' +
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
    '</b><br><span style="font-size:.8rem;color:var(--muted)">Modulo ufficiale Word da stampare/compilare. In alternativa, la versione Excel si compila al computer e si reimporta in Formazione per la certificazione automatica.</span></div>' +
    '<button class="btn-export" style="font-size:.82rem;padding:5px 14px;border-color:#1a4a7a;color:#1a4a7a" onclick="apriFormularioPerNome(\'' +
    nomeOriginale.replace(/'/g, "\\'") +
    '\')">Scarica Word (originale)</button>' +
    '<button class="btn-export" style="font-size:.82rem;padding:4px 10px" onclick="pianoScaricaProtocollo(\'' +
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
      '<button class="btn-export" style="font-size:.82rem;padding:4px 12px;border-color:#2c6e49;color:#2c6e49" onclick="document.getElementById(\'form-arch-file\').click()">Carica formulario</button>' +
      '<input type="file" id="form-arch-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" style="display:none" onchange="caricaFormulario(this)">';
  h += '</div><div style="padding:6px 16px 14px">';
  h +=
    '<p style="font-size:.8rem;color:var(--muted);margin-bottom:8px">PDF, Word ed Excel fino a 2 MB, organizzati in cartelle per settore. I PDF si aprono e stampano direttamente; Word ed Excel si scaricano e si stampano dal programma.</p>';
  if (!_pianoFormulariCache.length) h += '<p style="color:var(--muted);padding:8px 0">Nessun formulario caricato.</p>';
  const perCartella = {};
  _pianoFormulariCache.forEach(
    (f) => (perCartella[f.cartella || 'Generale'] = (perCartella[f.cartella || 'Generale'] || []).concat(f)),
  );
  Object.keys(perCartella)
    .sort()
    .forEach((cart) => {
      h +=
        '<div style="margin:10px 0 4px;font-weight:700;font-size:.9rem">📁 ' +
        escP(cart) +
        ' <span style="font-weight:400;color:var(--muted)">(' +
        perCartella[cart].length +
        ')</span></div>';
      perCartella[cart].forEach((f) => {
        const icona = f.mime === 'application/pdf' ? '📄' : f.mime && f.mime.includes('sheet') ? '📊' : '📝';
        h +=
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0 6px 14px;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:220px">' +
          icona +
          ' ' +
          escP(f.nome) +
          ' <span style="font-size:.82rem;color:var(--muted)">(' +
          Math.round((f.dimensione || 0) / 1024) +
          ' KB)</span></span>' +
          '<button class="btn-export" style="font-size:.82rem;padding:3px 10px" onclick="apriFormulario(' +
          f.id +
          ')">' +
          (f.mime === 'application/pdf' ? 'Apri / Stampa' : 'Scarica') +
          '</button>' +
          (puoMod
            ? '<button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:#1a4a7a;color:#1a4a7a" onclick="rinominaFormulario(' +
              f.id +
              ')">Rinomina/Sposta</button><button class="btn-export" style="font-size:.82rem;padding:3px 10px;border-color:var(--accent);color:var(--accent)" onclick="eliminaFormulario(' +
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
  const cartella = (prompt('Cartella (es. Cambi, Formazione, HR...):', 'Generale') || '').trim();
  if (cartella === '') return;
  const nome = (prompt('Nome del formulario:', file.name.replace(/\.[^.]+$/, '')) || '').trim();
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
  const nome = (prompt('Nome:', f.nome) || '').trim();
  if (!nome) return;
  const cartella = (prompt('Cartella:', f.cartella || 'Generale') || '').trim() || 'Generale';
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
  if (!f || !confirm('Eliminare il formulario "' + f.nome + '"?')) return;
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
    a: { nome: linea, settore: '', turno: '_____', orari: '' },
    b: { nome: linea, settore: '', turno: '_____', orari: '' },
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
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:6px">Regole di idoneità per settore/gruppo: chi può lavorare in un gruppo, limiti e minimi per funzione. Applicate dalla bozza automatica e dal validatore.</p>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" style="min-width:680px;font-size:.85rem"><thead><tr><th>Gruppo</th><th style="text-align:left">Regola</th><th style="text-align:left">Valore</th><th>Attiva</th><th></th></tr></thead><tbody>';
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
        '</b><br><span style="font-size:.78rem;color:var(--muted)">' +
        escP(r.tipo_regola) +
        '</span></td><td style="text-align:left"><input type="text" value="' +
        escP(r.valore || '') +
        '" onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'valore\',this.value)" style="width:170px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
        (r.attivo !== false ? ' checked' : '') +
        ' onchange="salvaRegolaGruppo(' +
        r.id +
        ',\'attivo\',this.checked)"></td><td><button class="btn-del-tipo" onclick="eliminaRegolaGruppo(' +
        r.id +
        ')">Elimina</button></td></tr>';
    });
  h += '</tbody></table></div>';
  h +=
    '<details style="margin:10px 0;background:var(--paper2);border:1px solid var(--line);border-radius:3px;padding:8px 12px"><summary style="cursor:pointer;font-weight:700;font-size:.9rem">Come si crea una regola di gruppo (esempi)</summary>' +
    '<ol style="font-size:.85rem;margin:8px 0 4px 18px;line-height:1.5">' +
    '<li>Scegli il <b>gruppo</b> di turni a cui la regola si riferisce (quello scritto nella scheda Turni, colonna Gruppo). "tutti" vale per ogni gruppo del settore.</li>' +
    '<li>Scegli il <b>tipo</b>: sotto compare la spiegazione con un esempio del valore.</li>' +
    '<li>Scrivi il <b>valore</b> nel formato dell esempio e premi Aggiungi. Il programma controlla che gruppo, funzioni e sigle esistano in questo settore: se qualcosa non torna te lo dice.</li>' +
    '<li>Esempi: <b>Turni riservati</b> con valore <code>L1,9:BO,SUP</code> = i turni L1 e 9 li fanno solo Back Office e Supervisor. <b>Una funzione fa solo certi turni</b> con <code>SUP:Z*,L1,9:0,1,2,3</code> = da lunedi a giovedi i Supervisor fanno solo turni che iniziano con Z (oppure L1 e 9); con <code>SUP:Z*,S*,L1,9:4,5</code> venerdi e sabato anche i turni S. <b>Massimo al giorno</b> con <code>SUP:1</code> nel gruppo BO = al massimo un Supervisor al giorno in Back Office.</li>' +
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
    '<p id="rg-aiuto" style="font-size:.82rem;color:var(--muted);margin-top:4px">' +
    _REGOLE_GRUPPO_TIPI.richiede_funzione +
    '</p>';
  h += '</div></div>';
  return h;
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
  if (!r || !confirm('Eliminare la regola ' + r.gruppo + ' ' + r.tipo_regola + ' = ' + r.valore + '?')) return;
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
  if (!puoGestirePiano() && !isAdmin()) return '';
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
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Congedi non pagati · ' +
    escP(repartoLabel(rep)) +
    '</div><div style="padding:10px 14px">' +
    '<p style="font-size:.82rem;color:var(--muted);margin-bottom:8px">Regolamento aziendale 5.14: domanda scritta, concessione della Direzione. Nel piano i giorni diventano <b>CNP</b> (zero ore, non contano fra le ore dovute). Oltre <b>' +
    sg +
    ' giorni</b> il diritto vacanze dell anno si riduce in proporzione; oltre <b>' +
    sm +
    ' mesi</b> l anzianita di servizio si sposta in avanti di tutta la durata (giubilei e scaglioni vacanze). Le due soglie si cambiano nella scheda Regole.</p>';
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
    h += '<p style="font-size:.85rem;color:var(--muted)">Nessun congedo registrato in questo settore.</p>';
  else {
    h +=
      '<div style="overflow-x:auto"><table class="piano-table" style="min-width:700px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Dal</th><th>Al</th><th>Giorni</th><th style="text-align:left">Motivo</th><th style="text-align:left">Autorizzato da</th><th style="text-align:left">Effetti</th><th></th></tr></thead><tbody>';
    lista.forEach((c) => {
      const gg = _pianoGiorniCongedo(c);
      const eff = [];
      if (gg > sg) eff.push('vacanze ridotte');
      if (gg > sm * 30.44) eff.push('anzianita spostata di ' + gg + ' giorni');
      if (!eff.length) eff.push('solo piano (CNP)');
      h +=
        '<tr><td style="text-align:left;font-weight:600">' +
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
        '</td><td style="text-align:left;font-size:.8rem;color:var(--muted)">' +
        escP(eff.join(', ')) +
        '</td><td><button class="btn-del-tipo" onclick="eliminaCongedoNp(' +
        c.id +
        ')">Elimina</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div></div>';
  return h;
}
async function aggiungiCongedoNp() {
  if (!puoGestirePiano() && !isAdmin()) return;
  const nome = (document.getElementById('cnp-nome') || {}).value;
  const dal = (document.getElementById('cnp-dal') || {}).value;
  const al = (document.getElementById('cnp-al') || {}).value;
  const motivo = ((document.getElementById('cnp-motivo') || {}).value || '').trim();
  const aut = ((document.getElementById('cnp-aut') || {}).value || '').trim();
  if (!nome || !dal || !al) {
    toastErrore('Servono collaboratore, data di inizio e data di fine');
    return;
  }
  if (al < dal) {
    toastErrore('La data di fine e prima di quella di inizio');
    return;
  }
  const gg = Math.round((new Date(al + 'T12:00:00') - new Date(dal + 'T12:00:00')) / 86400000) + 1;
  if (gg > 366) {
    toastErrore('Un congedo di piu di un anno non e previsto dal regolamento (massimo 6 mesi concordati)');
    return;
  }
  if (!motivo) {
    toastErrore('Scrivi il motivo: serve per la scheda e per HR');
    return;
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
    return;
  }
  const sogliaMesi = parseInt(_pianoRegolaVal('congedo_np_mesi_anzianita'));
  const sm = isNaN(sogliaMesi) ? 6 : sogliaMesi;
  const avviso =
    gg > sm * 30.44
      ? '\n\nATTENZIONE: supera ' +
        sm +
        ' mesi: l anzianita di servizio si sposta in avanti di ' +
        gg +
        ' giorni (giubilei e scaglioni vacanze).'
      : '';
  if (
    !confirm(
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
    )
  )
    return;
  try {
    const nuovo = await secPost('collab_congedi_np', {
      collaboratore: nome,
      reparto_dip: _pianoReparto(),
      dal: dal,
      al: al,
      motivo: motivo,
      autorizzato_da: aut || null,
      operatore: getOperatore(),
    });
    const rec = (nuovo && nuovo[0]) || {
      collaboratore: nome,
      reparto_dip: _pianoReparto(),
      dal: dal,
      al: al,
      motivo: motivo,
    };
    _pianoCongediNp.push(rec);
    const celle = await _pianoSincronizzaCongedoNp(rec, false);
    logAzione('Congedo non pagato registrato', nome + ' ' + dal + ' / ' + al + ' (' + gg + ' giorni): ' + motivo);
    if (typeof _insertHrEvento === 'function')
      _insertHrEvento({
        tipo: 'congedo_np',
        collaboratore: nome,
        descrizione: 'Congedo non pagato dal ' + dal + ' al ' + al + ' (' + gg + ' giorni): ' + motivo,
      });
    toast('Congedo registrato · ' + celle + ' giorni segnati CNP nel piano');
    renderPiano();
  } catch (e) {
    toastErrore('Errore nel salvataggio del congedo: ' + (e.message || ''));
  }
}
async function eliminaCongedoNp(id) {
  if (!puoGestirePiano() && !isAdmin()) return;
  const c = _pianoCongediNp.find((x) => x.id === id);
  if (!c) return;
  if (
    !confirm(
      'Eliminare il congedo di ' +
        c.collaboratore +
        ' dal ' +
        String(c.dal).substring(0, 10) +
        ' al ' +
        String(c.al).substring(0, 10) +
        '?\n\nI giorni CNP nel piano vengono tolti.',
    )
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
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return '';
  const collabs = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Preferenze collaboratori · ' +
    escP(repartoLabel(_pianoReparto())) +
    '</div><div style="padding:10px 14px">';
  h +=
    '<div style="display:flex;margin-bottom:8px"><input type="text" id="pref-collab-cerca" class="piano-cerca" placeholder="Cerca collaboratore..." oninput="_filtraPrefCollab(this.value)"></div>';
  h +=
    '<div style="overflow-x:auto"><table class="piano-table" id="pref-collab-table" style="min-width:760px;font-size:.85rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Funzione</th><th>%</th><th>Solo diurni</th><th style="text-align:left">Turni bloccati (CSV)</th><th title="La bozza le privilegia sui turni L1">Preferisce L1</th><th title="Livello accoglienza (0-2): serve per il gruppo ACCOGLIENZA">Accoglienza</th><th style="text-align:left" title="Gruppi dove NON può lavorare da solo (CSV, es: REC)">Accompagnamento</th><th style="text-align:left" title="Altri reparti in cui lavora (CSV, es: valet): appare anche nei loro piani e le ore si sommano">Reparti extra</th><th style="text-align:left" title="Derivati dalle competenze certificate in Formazione (sola lettura)">Settori</th></tr></thead><tbody>';
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
      ',\'solo_diurni\',this.checked)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.turni_bloccati || '') +
      '" placeholder="Es: S8,S7C" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'turni_bloccati\',this.value)" style="width:140px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td><input type="checkbox"' +
      (c.prefers_l1 ? ' checked' : '') +
      ' onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'prefers_l1\',this.checked)"></td><td><input type="number" min="0" max="2" value="' +
      (parseInt(c.accoglienza) || 0) +
      '" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'accoglienza\',this.value)" style="width:52px;padding:2px;text-align:center;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left"><input type="text" value="' +
      escP(c.accompagnamento_settori || '') +
      '" placeholder="Es: REC" onchange="salvaPreferenzaCollab(' +
      c.id +
      ',\'accompagnamento_settori\',this.value)" style="width:90px;padding:2px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"></td><td style="text-align:left">' +
      (typeof apriCoperturaCollab === 'function'
        ? '<button class="btn-export" style="font-size:.82rem;padding:2px 8px" title="Copertura altri settori: si imposta qui e in Gestione collaboratori (stessa finestra)" onclick="apriCoperturaCollab(' +
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
      '</td><td style="text-align:left;font-size:.82rem;color:var(--muted)" title="Si gestiscono con le spunte in Formazione">' +
      escP((_pianoSettoriEffettivi(c) || []).join(', ') || '-') +
      '</td></tr>';
  });
  h += '</tbody></table></div>';
  h +=
    '<p style="font-size:.82rem;color:var(--muted);margin-top:6px">"Solo diurni" e i turni bloccati vengono rispettati dalla bozza automatica. Funzione e percentuale si modificano in Impostazioni del Diario → Gestione collaboratori; i <b>Settori</b> derivano dalle competenze certificate in <b>Formazione</b> (spunta = idoneo, sola lettura qui).</p>';
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
async function salvaPreferenzaCollab(id, campo, valore) {
  if (!isAdmin() && !(typeof puoModificare === 'function' && puoModificare('storico_hr'))) return;
  try {
    const patch = {};
    if (campo === 'solo_diurni' || campo === 'prefers_l1') patch[campo] = !!valore;
    else if (campo === 'accoglienza') patch[campo] = Math.max(0, Math.min(2, parseInt(valore) || 0));
    else patch[campo] = String(valore).trim().toUpperCase() || null;
    await secPatch('collaboratori', 'id=eq.' + id, patch);
    const c = collaboratoriCache.find((x) => x.id === id);
    if (c) c[campo] = patch[campo];
    logAzione('Piano: preferenza collaboratore', (c ? c.nome : id) + ' ' + campo);
    toast('Preferenza salvata');
  } catch (e) {
    toast('Errore salvataggio preferenza');
  }
}
