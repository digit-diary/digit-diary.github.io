/**
 * Diario Collaboratori — Casino Lugano SA
 * File: alerts.js
 * Alert disciplinari: cassa, rischio, ammonimenti
 * Righe: 581
 */

function checkCassaAlerts() {
  const alerts = [];
  const tipoErr = nomeCorrente('Errore');
  const errori = getDatiReparto().filter(
    (e) =>
      e.tipo === tipoErr &&
      (e.reparto === 'Cassa' || (e.testo || '').toLowerCase().includes('differenza cassa')) &&
      (parseFloat(e.importo) || 0) > 0
  );
  const byNome = {};
  errori.forEach((e) => {
    const k = e.nome.toLowerCase();
    if (!byNome[k]) byNome[k] = { nome: e.nome, errs: [] };
    byNome[k].errs.push(e);
  });
  Object.values(byNome).forEach(({ nome, errs }) => {
    const lastAllin = getModuliReparto()
      .filter((m) => m.tipo === 'allineamento' && m.collaboratore.toLowerCase() === nome.toLowerCase())
      .sort((a, b) => (b.created_at || b.data_modulo || '').localeCompare(a.created_at || a.data_modulo || ''))[0];
    const lastAllinDate = lastAllin ? lastAllin.created_at || lastAllin.data_modulo || '' : '';
    const lastRdi = getModuliReparto()
      .filter((m) => m.tipo === 'rdi' && m.collaboratore.toLowerCase() === nome.toLowerCase())
      .sort((a, b) => (b.created_at || b.data_modulo || '').localeCompare(a.created_at || a.data_modulo || ''))[0];
    const lastRdiDate = lastRdi ? lastRdi.created_at || lastRdi.data_modulo || '' : '';
    // Solo errori ≥90 contano per il percorso disciplinare
    const errsSinceAllin = (lastAllinDate ? errs.filter((e) => (e.data || '') > lastAllinDate) : errs).filter(
      (e) => (parseFloat(e.importo) || 0) >= 90
    );
    const errsSinceRdi = (lastRdiDate ? errs.filter((e) => (e.data || '') > lastRdiDate) : errs).filter(
      (e) => (parseFloat(e.importo) || 0) >= 90
    );
    const cumTotal = errsSinceRdi.reduce((s, e) => s + (parseFloat(e.importo) || 0), 0);
    // Se cumulativo ≥500 → solo RDI
    if (cumTotal >= 500) alerts.push({ type: 'rdi', nome, importo: cumTotal, count: errsSinceRdi.length });
    // Altrimenti: un alert per ogni errore ≥90
    else {
      errsSinceAllin.forEach((e) => {
        const imp = parseFloat(e.importo) || 0;
        if (imp >= 90) {
          const dt = e.data ? new Date(e.data).toLocaleDateString('it-IT') : '';
          alerts.push({ type: 'allineamento', nome, importo: imp, count: 1, dataErr: dt });
        }
      });
    }
  });
  return alerts;
}
function renderCassaAlerts() {
  const container = document.getElementById('cassa-alerts-container');
  if (!container) return;
  const alerts = checkCassaAlerts();
  if (!alerts.length) {
    container.innerHTML = '';
    return;
  }
  const allinAlerts = alerts.filter((a) => a.type === 'allineamento');
  const rdiAlerts = alerts.filter((a) => a.type === 'rdi');
  let html = '';
  if (allinAlerts.length) {
    html +=
      '<div class="cassa-alert-banner allin" onclick="toggleCassaDD(\'allin\')">&#9888;&#65039; ' +
      allinAlerts.length +
      ' collaboratore/i con differenza cassa &#8805; CHF 90 &#8212; Preparare allineamento <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="cassa-alerts-dropdown hidden" id="cassa-allin-dd">';
    allinAlerts.forEach((a) => {
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">Differenza: ' +
        fmtCHF(a.importo) +
        ' CHF' +
        (a.dataErr ? ' del ' + a.dataErr : '') +
        '</span><button class="alert-action" onclick="apriModuloVeloce(\'allineamento\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea Allineamento</button></div>';
    });
    html += '</div>';
  }
  if (rdiAlerts.length) {
    html +=
      '<div class="cassa-alert-banner rdi" onclick="toggleCassaDD(\'rdi\')">&#9888;&#65039; ' +
      rdiAlerts.length +
      ' collaboratore/i con differenze cumulative &#8805; CHF 500 &#8212; Fare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="cassa-alerts-dropdown hidden" id="cassa-rdi-dd">';
    rdiAlerts.forEach((a) => {
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">Totale cumulativo: ' +
        fmtCHF(a.importo) +
        ' CHF (' +
        a.count +
        ' errori dal ultimo RDI)</span><button class="alert-action" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button></div>';
    });
    html += '</div>';
  }
  container.innerHTML = html;
}
function toggleCassaDD(type) {
  const dd = document.getElementById('cassa-' + type + '-dd');
  if (dd) dd.classList.toggle('hidden');
}
function apriModuloVeloce(tipo, nome) {
  switchPage('moduli');
  setTimeout(() => {
    apriModulo(tipo);
    setTimeout(() => {
      const ci = document.getElementById('mod-collaboratore');
      if (ci) ci.value = nome;
    }, 100);
  }, 200);
}

// KEYWORDS MOTIVO: estrae parole significative per confronto motivi
const _STOP_WORDS = new Set([
  'il',
  'lo',
  'la',
  'le',
  'li',
  'gli',
  'i',
  'un',
  'uno',
  'una',
  'di',
  'da',
  'del',
  'della',
  'dello',
  'dei',
  'degli',
  'delle',
  'dal',
  'dalla',
  'con',
  'e',
  'in',
  'per',
  'a',
  'al',
  'alla',
  'allo',
  'che',
  'non',
  'si',
  'ha',
  'è',
  'sono',
  'stato',
  'stata',
  'stati',
  'nel',
  'nella',
  'sul',
  'sulla',
  'come',
  'questo',
  'questa',
  'durante',
  'dopo',
  'prima',
  'tra',
  'fra',
  'essere',
  'avere',
  'suo',
  'sua',
  'suoi',
  'sue',
  'ogni',
  'anche',
  'più',
  'già',
  'senza',
  'presso',
  'fatto',
  'data',
  'turno',
  'servizio',
  'collaboratore',
  'collaboratrice',
]);
function _estraiKeywords(testo) {
  if (!testo) return [];
  return testo
    .toLowerCase()
    .replace(/[^a-zàèéìòù\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !_STOP_WORDS.has(w));
}
// Categorie semantiche: parole diverse ma stesso ambito disciplinare
const _SINONIMI_MOTIVO = {
  ritardo: ['ritardo', 'ritardi', 'tardi', 'puntualità', 'orario', 'orari', 'timbratura', 'timbrare'],
  uniforme: [
    'uniforme',
    'divisa',
    'camicia',
    'abbigliamento',
    'vestito',
    'scarpe',
    'cravatta',
    'badge',
    'targhetta',
    'decoro',
  ],
  cassa: ['cassa', 'conteggio', 'ammanco', 'eccedenza', 'differenza', 'discrepanza', 'mancante', 'mancanza'],
  assenza: ['assenza', 'assente', 'malattia', 'certificato', 'giustificativo'],
  comportamento: [
    'comportamento',
    'condotta',
    'atteggiamento',
    'maleducazione',
    'scortese',
    'scortesia',
    'litigio',
    'insulto',
    'aggressivo',
  ],
  procedura: ['procedura', 'protocollo', 'regolamento', 'normativa', 'istruzione'],
  pulizia: ['pulizia', 'mani', 'igiene', 'sfregamento', 'palmi'],
  identificazione: ['identificazione', 'documento', 'identità', 'lrd', 'verifica', 'kyc'],
  cellulare: ['cellulare', 'telefono', 'smartphone', 'telefonate'],
};
function _normalizzaKeywords(keywords) {
  return keywords.map((w) => {
    for (const [cat, sinonimi] of Object.entries(_SINONIMI_MOTIVO)) {
      if (sinonimi.some((s) => w.includes(s) || s.includes(w))) return '__' + cat;
    }
    return w;
  });
}
function _motivoSimile(t1, t2, nomeCollab) {
  let k1 = _estraiKeywords(t1),
    k2 = _estraiKeywords(t2);
  // Rimuovi parole del nome collaboratore dal confronto
  if (nomeCollab) {
    const nk = new Set(
      nomeCollab
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
    k1 = k1.filter((w) => !nk.has(w));
    k2 = k2.filter((w) => !nk.has(w));
  }
  // Normalizza sinonimi (divisa→__uniforme, ritardo→__ritardo, ecc.)
  k1 = _normalizzaKeywords(k1);
  k2 = _normalizzaKeywords(k2);
  if (!k1.length || !k2.length) return false;
  const set2 = new Set(k2);
  let comuni = 0;
  k1.forEach((w) => {
    if (set2.has(w)) comuni++;
  });
  return comuni >= 2 || (comuni >= 1 && Math.min(k1.length, k2.length) <= 3);
}

// ALERT COLLABORATORE A RISCHIO (allineamenti → RDI)
function checkRischioAlerts() {
  const alerts = [];
  const nomiSet = new Set(
    getModuliReparto()
      .filter((m) => m.tipo === 'allineamento')
      .map((m) => m.collaboratore.toLowerCase())
  );
  nomiSet.forEach((nomeLc) => {
    const allins = getModuliReparto()
      .filter((m) => m.tipo === 'allineamento' && m.collaboratore.toLowerCase() === nomeLc)
      .sort((a, b) => (a.created_at || a.data_modulo || '').localeCompare(b.created_at || b.data_modulo || ''));
    if (allins.length < 2) return;
    const nome = allins[0].collaboratore;
    const lastAllin = allins[allins.length - 1];
    const lastDate = lastAllin.created_at || lastAllin.data_modulo || '';
    const hasRdi = getModuliReparto().some(
      (m) =>
        m.tipo === 'rdi' && m.collaboratore.toLowerCase() === nomeLc && (m.created_at || m.data_modulo || '') > lastDate
    );
    if (hasRdi) return;
    // 1) Recidiva: 3+ allineamenti stesso motivo → RDI obbligatorio
    const gruppi = [];
    allins.forEach((a) => {
      const nc = a.non_conformita || '';
      let trovato = false;
      for (const g of gruppi) {
        if (_motivoSimile(nc, g.motivo, nome)) {
          g.items.push(a);
          trovato = true;
          break;
        }
      }
      if (!trovato) gruppi.push({ motivo: nc, items: [a] });
    });
    const recidiva = gruppi.find((g) => g.items.length >= 3);
    if (recidiva) {
      const motBrv = _estraiKeywords(recidiva.motivo).slice(0, 4).join(', ');
      alerts.push({
        nome,
        count: recidiva.items.length,
        lastDate: lastAllin.data_modulo || lastDate,
        motivo: motBrv || 'stesso motivo',
        tipo: 'recidiva',
      });
      return;
    }
    // 2) Accumulo: 3+ allineamenti totali (motivi diversi) → segnalazione rischio
    if (allins.length >= 3) {
      alerts.push({
        nome,
        count: allins.length,
        lastDate: lastAllin.data_modulo || lastDate,
        motivo: '',
        tipo: 'accumulo',
      });
    }
  });
  return alerts;
}
function renderRischioAlerts() {
  const container = document.getElementById('rischio-alerts-container');
  if (!container) return;
  var oldRischio = document.getElementById('rischio-alerts-block');
  if (oldRischio) oldRischio.remove();
  const alerts = checkRischioAlerts();
  if (!alerts.length) return;
  const recidive = alerts.filter((a) => a.tipo === 'recidiva'),
    accumuli = alerts.filter((a) => a.tipo === 'accumulo');
  let html = '<div id="rischio-alerts-block">';
  if (recidive.length) {
    html +=
      '<div class="rischio-alert-banner" style="background:#8e44ad" onclick="toggleRischioDD()">&#9888;&#65039; ' +
      recidive.length +
      ' collaboratore/i con 3+ allineamenti stesso motivo — Preparare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="rischio-alerts-dropdown hidden" id="rischio-dd">';
    recidive.forEach((a) => {
      const dt = a.lastDate ? new Date(a.lastDate + 'T12:00:00').toLocaleDateString('it-IT') : '';
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">' +
        a.count +
        ' allineamenti per: ' +
        escP(a.motivo) +
        ' (ultimo: ' +
        dt +
        '). Recidiva — preparare RDI.</span><button class="alert-action" style="background:#8e44ad" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button></div>';
    });
    html += '</div>';
  }
  if (accumuli.length) {
    html +=
      '<div class="rischio-alert-banner" style="background:#e67e22;margin-top:6px" onclick="toggleAccDD()">&#9888;&#65039; ' +
      accumuli.length +
      ' collaboratore/i con 3+ allineamenti totali — Valutare RDI <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
    html += '<div class="rischio-alerts-dropdown hidden" id="acc-dd">';
    accumuli.forEach((a) => {
      const dt = a.lastDate ? new Date(a.lastDate + 'T12:00:00').toLocaleDateString('it-IT') : '';
      const _ignKey = '_alert_ign_' + a.nome.toLowerCase().replace(/\s/g, '_') + '_acc';
      if (localStorage.getItem(_ignKey)) return;
      html +=
        '<div class="cassa-alert-item"><span class="alert-name">' +
        escP(a.nome) +
        '</span><span class="alert-detail">' +
        a.count +
        ' allineamenti totali (ultimo: ' +
        dt +
        '). Valutare provvedimento.</span><button class="alert-action" style="background:#e67e22" onclick="apriModuloVeloce(\'rdi\',\'' +
        a.nome.replace(/'/g, "\\'") +
        '\')">Crea RDI</button><button class="alert-action" style="background:var(--muted);margin-left:4px" onclick="ignoraAlertSuggerimento(\'' +
        escP(a.nome).replace(/'/g, "\\'") +
        "','acc')\">Ignora</button></div>";
    });
    html += '</div>';
  }
  html += '</div>';
  container.insertAdjacentHTML('beforeend', html);
}
function ignoraAlertSuggerimento(nome, tipo) {
  if (!confirm('Ignorare questo suggerimento per ' + nome + '?\nVerrà registrato nel log.')) return;
  const _ignKey = '_alert_ign_' + nome.toLowerCase().replace(/\s/g, '_') + '_' + tipo;
  localStorage.setItem(_ignKey, '1');
  logAzione('Alert ignorato', nome + ' — suggerimento ' + tipo + ' ignorato da ' + getOperatore());
  renderRischioAlerts();
  renderAmmonimentiAlerts();
  toast('Suggerimento ignorato per ' + nome);
}
function toggleAccDD() {
  const dd = document.getElementById('acc-dd');
  if (dd) dd.classList.toggle('hidden');
}
function toggleRischioDD() {
  const dd = document.getElementById('rischio-dd');
  if (dd) dd.classList.toggle('hidden');
}

// ALERT AMMONIMENTI VERBALI RECIDIVI (2+ stesso motivo → preparare allineamento)
function checkAmmonimentiAlerts() {
  const tipoAmm = nomeCorrente('Ammonimento Verbale');
  const alerts = [];
  // Raggruppa ammonimenti per collaboratore
  const byNome = {};
  getDatiReparto()
    .filter((e) => e.tipo === tipoAmm)
    .forEach((e) => {
      const k = e.nome.toLowerCase();
      if (!byNome[k]) byNome[k] = { nome: e.nome, entries: [] };
      byNome[k].entries.push(e);
    });
  Object.values(byNome).forEach((a) => {
    if (a.entries.length < 2) return;
    // Raggruppa per motivo simile
    const gruppi = [];
    a.entries.forEach((e) => {
      let trovato = false;
      for (const g of gruppi) {
        if (_motivoSimile(e.testo, g.motivo, a.nome)) {
          g.items.push(e);
          trovato = true;
          break;
        }
      }
      if (!trovato) gruppi.push({ motivo: e.testo, items: [e] });
    });
    // Alert solo per gruppi con 2+ ammonimenti stesso motivo
    gruppi
      .filter((g) => g.items.length >= 2)
      .forEach((g) => {
        const last = g.items.sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
        // Controlla se c'è già un allineamento dopo l'ultimo ammonimento di questo gruppo
        const hasAllin = getModuliReparto().some(
          (m) =>
            m.tipo === 'allineamento' &&
            m.collaboratore.toLowerCase() === a.nome.toLowerCase() &&
            (m.created_at || m.data_modulo || '') > last.data
        );
        if (!hasAllin) {
          const motBrv = _estraiKeywords(g.motivo).slice(0, 4).join(', ');
          alerts.push({ nome: a.nome, count: g.items.length, last: last.data, motivo: motBrv || 'stesso motivo' });
        }
      });
  });
  return alerts;
}
function renderAmmonimentiAlerts() {
  var old = document.getElementById('amm-alerts-block');
  if (old) old.remove();
  const container = document.getElementById('rischio-alerts-container');
  if (!container) return;
  const ammAlerts = checkAmmonimentiAlerts();
  if (!ammAlerts.length) return;
  let html = '<div id="amm-alerts-block">';
  html +=
    '<div class="cassa-alert-banner" style="background:#e67e22;margin-bottom:8px;cursor:pointer" onclick="toggleAmmDD()">&#9888; ' +
    ammAlerts.length +
    ' collaboratore/i con 2+ ammonimenti stesso motivo — Preparare allineamento <span style="font-size:.75rem;opacity:.8">&#9660;</span></div>';
  html += '<div class="cassa-alerts-dropdown hidden" id="amm-dd">';
  ammAlerts.forEach((a) => {
    const dt = a.last ? new Date(a.last).toLocaleDateString('it-IT') : '';
    html +=
      '<div class="cassa-alert-item"><span class="alert-name">' +
      escP(a.nome) +
      '</span><span class="alert-detail">' +
      a.count +
      ' ammonimenti per: ' +
      escP(a.motivo) +
      ' (ultimo: ' +
      dt +
      ')</span><button class="alert-action" style="background:#e67e22" onclick="apriModuloVeloce(\'allineamento\',\'' +
      a.nome.replace(/'/g, "\\'") +
      '\')">Crea Allineamento</button></div>';
  });
  html += '</div></div>';
  container.insertAdjacentHTML('beforeend', html);
}
function toggleAmmDD() {
  const dd = document.getElementById('amm-dd');
  if (dd) dd.classList.toggle('hidden');
}

// TEMPLATE RAPIDI
const TEMPLATES_RAPIDI = {
  cassa_errore: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, durante il turno di servizio, è stata rilevata una differenza di cassa a carico del collaboratore. L'importo della differenza ammonta a CHF ___. Tale discrepanza è stata accertata a seguito del conteggio di fine turno.",
    obiettivo:
      'Il collaboratore si impegna a prestare maggiore attenzione durante le operazioni di cassa, verificando ogni transazione e controllando il conteggio prima della chiusura del turno.',
    scadenza: 'A partire da subito',
  },
  ritardo: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, il collaboratore si è presentato al posto di lavoro con un ritardo di ___ minuti rispetto all'orario previsto dal turno assegnato, senza aver comunicato preventivamente l'impossibilità di presentarsi in orario.",
    obiettivo:
      'Il collaboratore si impegna a rispettare rigorosamente gli orari di servizio e a comunicare tempestivamente eventuali ritardi al responsabile di turno.',
    scadenza: 'A partire da subito',
  },
  uniforme: {
    tipo: 'allineamento',
    non_conf:
      "In data {data}, il collaboratore si è presentato al turno di servizio con l'uniforme non conforme alle disposizioni aziendali.",
    obiettivo:
      "Il collaboratore si impegna a presentarsi al lavoro indossando l'uniforme completa e conforme al regolamento aziendale.",
    scadenza: 'A partire da subito',
  },
  comportamento: {
    tipo: 'allineamento',
    non_conf:
      'In data {data}, è stato rilevato un comportamento inadeguato da parte del collaboratore durante il turno di servizio.',
    obiettivo:
      'Il collaboratore si impegna a mantenere un comportamento professionale e rispettoso nei confronti di colleghi e clienti.',
    scadenza: 'A partire da subito',
  },
  procedura: {
    tipo: 'allineamento',
    non_conf: 'In data {data}, il collaboratore non ha rispettato la procedura prevista per ___.',
    obiettivo: 'Il collaboratore si impegna a seguire scrupolosamente le procedure operative stabilite.',
    scadenza: 'A partire da subito',
  },
  prestazione: {
    tipo: 'apprezzamento',
    descrizione:
      'Si desidera riconoscere la prestazione eccellente del collaboratore, il quale ha dimostrato particolare impegno e professionalità nello svolgimento delle proprie mansioni.',
    osservazioni:
      'Il responsabile di settore esprime piena soddisfazione per il lavoro svolto e incoraggia il collaboratore a mantenere questo livello di eccellenza.',
  },
  cliente: {
    tipo: 'apprezzamento',
    descrizione:
      "A seguito di un feedback positivo ricevuto da un cliente, si desidera riconoscere l'atteggiamento professionale e cortese del collaboratore che ha contribuito a un'esperienza positiva per il cliente.",
    osservazioni: "Il responsabile di settore ringrazia il collaboratore per l'attenzione dedicata alla clientela.",
  },
  recidiva: {
    tipo: 'rdi',
    non_conf:
      'Il collaboratore è stato già oggetto di precedenti allineamenti per la medesima non conformità. Nonostante i colloqui di allineamento effettuati, la non conformità si è ripetuta in data {data}.',
    obiettivo:
      'Il collaboratore è consapevole che ulteriori recidive potranno comportare provvedimenti disciplinari di grado superiore.',
    scadenza: 'A partire da subito',
    livello: 'I',
  },
};
function templateRapido(tipo, templateKey) {
  const tmpl = TEMPLATES_RAPIDI[templateKey];
  if (!tmpl) return;
  apriModulo(tipo);
  const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  setTimeout(() => {
    if (tmpl.non_conf) {
      const el = document.getElementById('mod-non-conf');
      if (el) el.value = tmpl.non_conf.replace('{data}', oggi);
    }
    if (tmpl.obiettivo) {
      const el = document.getElementById('mod-obiettivo');
      if (el) el.value = tmpl.obiettivo;
    }
    if (tmpl.scadenza) {
      const el = document.getElementById('mod-scadenza');
      if (el) el.value = tmpl.scadenza;
    }
    if (tmpl.descrizione) {
      const el = document.getElementById('mod-descrizione');
      if (el) el.value = tmpl.descrizione;
    }
    if (tmpl.osservazioni) {
      const el = document.getElementById('mod-osservazioni');
      if (el) el.value = tmpl.osservazioni;
    }
    if (tmpl.livello) {
      const el = document.getElementById('mod-livello');
      if (el) el.value = tmpl.livello;
    }
  }, 150);
}

// RICERCA GLOBALE
let _rgTimeout = null;
