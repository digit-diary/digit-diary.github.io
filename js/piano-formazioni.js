/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-formazioni.js
 *
 * SCHEDA FORMAZIONI del Piano: si sceglie l allievo, la competenza (dalla
 * configurazione della scheda Formazione: reparti, competenze e livelli sono gli
 * stessi), il formatore (anche uno per i diurni e uno per le notti), quanti giorni e
 * in che periodo. Il programma:
 *  - prende la sequenza dei turni dal MODELLO del reparto (dai piani veri: cassa
 *    C0, C4, C23 poi C15, C5; rec R22 x2 poi R23 x3; sala S22 x2 poi S7 x3),
 *    prima i diurni poi le notti, le notti se possibile nel fine settimana;
 *  - cerca i giorni migliori nel periodo e, se il piano e gia fatto, le PROPOSTE DI
 *    CAMBI con lo stesso motore della bozza (piano-ricerca.js) e le stesse regole di
 *    Valida regole, toccando meno celle possibile. L allievo e IN PIU rispetto al
 *    fabbisogno: il posto lo copre il formatore.
 *  - ogni proposta si stampa PRIMA di confermare; Annulla = non cambia niente;
 *  - applicata: celle con il commento "FORMAZIONE CASSA con ..." (al formatore il nome
 *    dell allievo, all allievo il nome del formatore), Annulla del piano;
 *  - finita: formazione svolta nella scheda Formazione (storico HR), competenza
 *    certificata (il livello si aggiorna da solo), punti a formatore e allievo se gli
 *    incentivi sono attivi.
 * Le formazioni si salvano nella tabella moduli (tipo formazione_piano), come i fogli
 * dei cambi turno: resta lo storico di ognuno.
 */
const FORM_TIPO = 'formazione_piano';
// modelli predefiniti, dai piani di luglio-ottobre 2026; modificabili nella scheda
const FORM_MODELLI_BASE = {
  CASSA: { diurni: ['C0', 'C4', 'C23'], notti: ['C15', 'C5'] },
  REC: { diurni: ['R22', 'R22'], notti: ['R23', 'R23', 'R23'] },
  SALA: { diurni: ['S22', 'S22'], notti: ['S7', 'S7', 'S7'] },
};
// codici di assenza: in quei giorni non si mette una formazione
const FORM_ASSENZE = ['V', 'V1', 'M', 'M1', 'I', 'I1', 'ND', 'CGF', 'CNP', 'F', '1F', 'CS', 'LRD', 'FU', 'TR', 'AF'];

function puoPianificareFormazioni() {
  return typeof puoAzioniAutoPiano === 'function' && puoAzioniAutoPiano('formazioni');
}

// ---------------------------------------------------------------- competenze e gruppi
// la competenza (scheda Formazione) e il gruppo dei turni del settore
function _formGruppoDi(comp) {
  const gruppi = [...new Set(_pianoTurniReparto().map((t) => String(t.gruppo || '').toUpperCase()))].filter(Boolean);
  const k = String(comp.key || '') + ' ' + String(comp.label || '');
  const prova = [
    [/cass/i, 'CASSA'],
    [/(recep|ricez|\brec\b)/i, 'REC'],
    [/(sala|slot)/i, 'SALA'],
    [/accogl/i, 'ACCOGLIENZA'],
    [/(\bbo\b|back)/i, 'BO'],
    [/(\bsup\b|superv)/i, 'SUP'],
  ];
  for (const [re, g] of prova) if (re.test(k) && gruppi.includes(g)) return g;
  const diretto = String(comp.key || '').toUpperCase();
  return gruppi.includes(diretto) ? diretto : null;
}
function _formCompetenze() {
  const comps = typeof getCompetenzeReparto === 'function' ? getCompetenzeReparto() : [];
  return comps.map((c) => Object.assign({}, c, { gruppo: _formGruppoDi(c) })).filter((c) => c.gruppo);
}
// modello del gruppo: impostazione del settore, altrimenti i predefiniti, altrimenti
// i turni piu usati del gruppo (un diurno e una notte)
function _formModello(gruppo) {
  const cfg = (window._formModelli || {})[_pianoReparto()] || {};
  if (cfg[gruppo] && (cfg[gruppo].diurni || []).length) return cfg[gruppo];
  if (FORM_MODELLI_BASE[gruppo]) return FORM_MODELLI_BASE[gruppo];
  const turni = _pianoTurniReparto().filter(
    (t) => String(t.gruppo || '').toUpperCase() === gruppo && t.attivo !== false,
  );
  const d = turni.find((t) => t.tipo !== 'NOTTURNO');
  const n = turni.find((t) => t.tipo === 'NOTTURNO');
  return { diurni: d ? [d.codice, d.codice] : [], notti: n ? [n.codice, n.codice, n.codice] : [] };
}
// sequenza dei turni per n giorni: prima i diurni poi le notti, nella proporzione del modello
function _formSequenza(gruppo, n) {
  const m = _formModello(gruppo);
  const lD = (m.diurni || []).length;
  const lN = (m.notti || []).length;
  if (!lD && !lN) return [];
  let nd = lN ? Math.round((n * lD) / (lD + lN)) : n;
  if (lD && lN && n >= 2) nd = Math.min(n - 1, Math.max(1, nd));
  if (!lD) nd = 0;
  const out = [];
  for (let i = 0; i < nd; i++) out.push({ codice: m.diurni[i % lD], fase: 'D' });
  for (let i = 0; i < n - nd; i++) out.push({ codice: m.notti[i % lN], fase: 'N' });
  return out;
}
// formatori di una competenza: spunta fmt_<chiave> nelle competenze del collaboratore
function _formFormatori(compKey) {
  return collaboratoriCache
    .filter((c) => c.attivo !== false && (c.competenze || {})['fmt_' + compKey] === true)
    .map((c) => c.nome);
}
function _formNomeReparto(comp) {
  return String((comp && comp.label) || '').toUpperCase();
}

// ---------------------------------------------------------------- archivio
function _formTutte() {
  return (typeof moduliCache !== 'undefined' ? moduliCache : []).filter(
    (m) => m.tipo === FORM_TIPO && !m.eliminato && (m.reparto_dip || 'slots') === _pianoReparto(),
  );
}
const _formGg = (d) => String(d || '').slice(8, 10) + '.' + String(d || '').slice(5, 7);
function _formPeriodo(f) {
  const g = (f.dati || {}).giorni || [];
  return g.length ? _formGg(g[0].data) + (g.length > 1 ? '-' + _formGg(g[g.length - 1].data) : '') : '';
}

// ---------------------------------------------------------------- vista
async function _renderPianoFormazioniTab() {
  await _formCaricaConfig();
  await _formCompletaFinite();
  const puo = puoPianificareFormazioni();
  const tutte = _formTutte().sort((a, b) => String(b.data_modulo).localeCompare(String(a.data_modulo)));
  const oggi = oggiLocale();
  let h =
    '<div class="main-card" style="margin-bottom:14px"><div class="card-header" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Formazioni' +
    (puo
      ? ' <button class="btn-export" style="font-size:var(--fs-sm,.8125rem);padding:3px 12px;border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="formazioneNuova()">Nuova formazione</button>'
      : '') +
    '</div><div style="padding:12px 14px">';
  h +=
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin:0 0 10px;max-width:950px">Scegli allievo, competenza, formatore, quanti giorni e il periodo: il programma mette i turni del modello del reparto (prima i diurni, poi le notti, se possibile nel fine settimana). Se il piano e gia fatto propone i cambi necessari rispettando tutte le regole, con meno cambi possibile: ogni proposta si stampa prima di confermare. L allievo e in piu rispetto al fabbisogno. A formazione finita la competenza viene certificata e il livello si aggiorna nella scheda Formazione.</p>';
  // in corso e pianificate
  const attive = tutte.filter((f) => (f.dati || {}).stato === 'pianificata');
  const svolte = tutte.filter((f) => (f.dati || {}).stato === 'svolta');
  const riga = (f) => {
    const d = f.dati || {};
    const fmt = [...new Set((d.giorni || []).map((g) => g.formatore))].join(' / ');
    const fine = ((d.giorni || []).slice(-1)[0] || {}).data || '';
    const stato =
      d.stato === 'svolta'
        ? '<span style="color:var(--c-verde,#2c6e49)">svolta' +
          (d.svolta && d.svolta.certificata ? ', certificata' : '') +
          '</span>'
        : fine < oggi
          ? '<span style="color:#b8860b">finita, da certificare</span>'
          : (d.giorni || []).some((g) => g.data <= oggi)
            ? 'in corso'
            : 'pianificata';
    return (
      '<tr><td style="text-align:left"><b>' +
      escP(d.allievo || f.collaboratore) +
      '</b></td><td style="text-align:left">' +
      escP((d.comp || {}).label || '') +
      '</td><td style="text-align:left">' +
      escP(fmt) +
      '</td><td title="' +
      escP((d.giorni || []).map((g) => _formGg(g.data) + ' ' + g.codice + ' con ' + g.formatore).join('\n')) +
      '">' +
      _formPeriodo(f) +
      ' · ' +
      escP((d.giorni || []).map((g) => g.codice).join(', ')) +
      '</td><td>' +
      stato +
      '</td><td style="white-space:nowrap"><button class="btn-act" onclick="formazioneStampa(' +
      Number(f.id) +
      ')">Stampa</button>' +
      (puo && d.stato === 'pianificata' && fine < oggi
        ? ' <button class="btn-act" onclick="formazioneSegnaSvolta(' + Number(f.id) + ')">Segna svolta</button>'
        : '') +
      (puo && d.stato === 'pianificata'
        ? ' <button class="btn-act del" onclick="formazioneAnnulla(' + Number(f.id) + ')">Annulla</button>'
        : '') +
      '</td></tr>'
    );
  };
  const tabella = (lista, vuoto) =>
    lista.length
      ? '<div style="overflow:auto"><table class="piano-table" style="font-size:var(--fs-sm,.8125rem);min-width:820px"><thead><tr><th style="text-align:left">Allievo</th><th style="text-align:left">Competenza</th><th style="text-align:left">Formatore</th><th>Giorni e turni</th><th>Stato</th><th></th></tr></thead><tbody>' +
        lista.map(riga).join('') +
        '</tbody></table></div>'
      : '<p style="color:var(--muted)">' + vuoto + '</p>';
  h += '<h4 style="margin:6px 0 8px">Pianificate e in corso</h4>' + tabella(attive, 'Nessuna formazione pianificata.');
  h += '<h4 style="margin:14px 0 8px">Svolte</h4>' + tabella(svolte.slice(0, 30), 'Nessuna formazione svolta.');
  h += _formStoricoHtml(tutte);
  h += _formFormatoriHtml(puo);
  h += _formModelliHtml(puo);
  h += '</div></div>';
  return h;
}
// STORICO di ognuno: quante formazioni da formatore e da allievo; col mouse con chi e quando
function _formStoricoHtml(tutte) {
  const per = {};
  const voce = (n) => (per[n] = per[n] || { fmt: [], all: [] });
  tutte
    .filter((f) => (f.dati || {}).stato !== 'annullata')
    .forEach((f) => {
      const d = f.dati || {};
      const comp = (d.comp || {}).label || '';
      voce(d.allievo).all.push(
        comp + ' ' + _formPeriodo(f) + ' con ' + [...new Set((d.giorni || []).map((g) => g.formatore))].join(' / '),
      );
      [...new Set((d.giorni || []).map((g) => g.formatore))].forEach((fm) => {
        const giorni = (d.giorni || []).filter((g) => g.formatore === fm).map((g) => _formGg(g.data));
        voce(fm).fmt.push(comp + ' con ' + d.allievo + ': ' + giorni.join(', '));
      });
    });
  const nomi = Object.keys(per)
    .filter(Boolean)
    .sort(
      (a, b) => per[b].fmt.length + per[b].all.length - (per[a].fmt.length + per[a].all.length) || a.localeCompare(b),
    );
  if (!nomi.length) return '';
  let h =
    '<h4 style="margin:14px 0 8px">Storico di ognuno</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 6px">Passa il mouse sul numero per vedere con chi e in quali giorni.</p><div style="overflow:auto"><table class="piano-table" style="font-size:var(--fs-sm,.8125rem)"><thead><tr><th style="text-align:left">Collaboratore</th><th>Da formatore</th><th>Da allievo</th></tr></thead><tbody>';
  nomi.forEach((n) => {
    const p = per[n];
    h +=
      '<tr><td style="text-align:left">' +
      escP(n) +
      '</td><td title="' +
      escP(p.fmt.join('\n')) +
      '" style="cursor:help">' +
      (p.fmt.length || '') +
      '</td><td title="' +
      escP(p.all.join('\n')) +
      '" style="cursor:help">' +
      (p.all.length || '') +
      '</td></tr>';
  });
  return h + '</tbody></table></div>';
}
// FORMATORI ABILITATI per competenza (spunta nella scheda del collaboratore)
function _formFormatoriHtml(puo) {
  const comps = _formCompetenze();
  if (!comps.length) return '';
  let h =
    '<h4 style="margin:14px 0 8px">Formatori</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 6px">Chi puo formare per ogni competenza: vengono proposti per primi, ma come formatore si puo scegliere chiunque sia abilitato a quel reparto.</p>';
  comps.forEach((c) => {
    const fm = _formFormatori(c.key);
    h +=
      '<div style="margin:6px 0;font-size:var(--fs-md,.875rem)"><b style="display:inline-block;min-width:170px">' +
      escP(c.label) +
      '</b> ' +
      (fm.length ? escP(fm.join(', ')) : '<span style="color:var(--muted)">nessuno</span>') +
      (puo
        ? ' <button class="btn-act" style="margin-left:6px" onclick="formazioneScegliFormatori(\'' +
          escP(c.key) +
          '\')">Modifica</button>'
        : '') +
      '</div>';
  });
  return h;
}
// MODELLI per reparto: turni dei diurni e delle notti
function _formModelliHtml(puo) {
  const comps = _formCompetenze();
  if (!comps.length) return '';
  const gruppi = [...new Set(comps.map((c) => c.gruppo))];
  let h =
    '<h4 style="margin:14px 0 8px">Modelli dei turni</h4><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:0 0 6px">I turni della formazione, nell ordine: prima i diurni, poi le notti. Con un numero di giorni diverso si tiene la stessa proporzione.</p>';
  gruppi.forEach((g) => {
    const m = _formModello(g);
    h +=
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:var(--fs-md,.875rem)"><b style="min-width:120px">' +
      escP(g) +
      '</b>diurni <input id="fm-d-' +
      escP(g) +
      '" value="' +
      escP((m.diurni || []).join(', ')) +
      '"' +
      (puo ? '' : ' disabled') +
      ' style="width:170px;padding:4px 6px"> notti <input id="fm-n-' +
      escP(g) +
      '" value="' +
      escP((m.notti || []).join(', ')) +
      '"' +
      (puo ? '' : ' disabled') +
      ' style="width:170px;padding:4px 6px"></div>';
  });
  if (puo)
    h += '<button class="btn-export" style="margin-top:6px" onclick="formazioneSalvaModelli()">Salva modelli</button>';
  return h;
}

// ---------------------------------------------------------------- configurazione
async function _formCaricaConfig() {
  if (window._formModelli !== undefined) return;
  try {
    window._formModelli = JSON.parse((await getImp('piano_formazione_modelli')) || '{}') || {};
  } catch (e) {
    window._formModelli = {};
  }
}
async function formazioneSalvaModelli() {
  if (!_pianoAzioneAutoConsentita('formazioni')) return;
  const rep = _pianoReparto();
  const cfg = Object.assign({}, window._formModelli || {});
  cfg[rep] = Object.assign({}, cfg[rep] || {});
  const sigle = new Set(_pianoTurniReparto().map((t) => t.codice));
  const lista = (id) =>
    String((document.getElementById(id) || {}).value || '')
      .split(/[,\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
  const sbagliate = [];
  [...new Set(_formCompetenze().map((c) => c.gruppo))].forEach((g) => {
    const d = lista('fm-d-' + g);
    const n = lista('fm-n-' + g);
    d.concat(n).forEach((x) => {
      if (!sigle.has(x)) sbagliate.push(x);
    });
    cfg[rep][g] = { diurni: d, notti: n };
  });
  if (sbagliate.length) {
    toastErrore('Sigle che non sono turni di questo settore: ' + [...new Set(sbagliate)].join(', '));
    return;
  }
  if (!(await salvaImp('piano_formazione_modelli', JSON.stringify(cfg)))) return;
  window._formModelli = cfg;
  logAzione('Formazioni: modelli dei turni', rep);
  toast('Modelli salvati');
  renderPiano();
}
async function formazioneScegliFormatori(compKey) {
  if (!_pianoAzioneAutoConsentita('formazioni')) return;
  const comp = _formCompetenze().find((c) => c.key === compKey);
  if (!comp) return;
  const membri = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const scelta = await chiediModulo(
    'Formatori per ' +
      comp.label +
      ': scrivi i nomi separati da virgola (cognome e nome come in Gestione collaboratori).',
    [
      {
        titolo: 'Formatori',
        campi: [{ id: 'nomi', etichetta: '', valore: _formFormatori(compKey).join(', '), larghezza: 520 }],
      },
    ],
    { titolo: 'Formatori · ' + comp.label, ok: 'Salva' },
  );
  if (!scelta) return;
  const voluti = String(scelta.nomi || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const trovati = [];
  const non = [];
  voluti.forEach((v) => {
    const c = typeof _xlsTrovaCollab === 'function' ? _xlsTrovaCollab(v, membri) : membri.find((m) => m.nome === v);
    if (c) trovati.push(c.nome);
    else non.push(v);
  });
  if (non.length) {
    toastErrore('Non trovati nel settore: ' + non.join(', '));
    return;
  }
  const chiave = 'fmt_' + compKey;
  for (const c of membri) {
    const ha = (c.competenze || {})[chiave] === true;
    const deve = trovati.includes(c.nome);
    if (ha === deve) continue;
    const nuove = Object.assign({}, c.competenze || {});
    if (deve) nuove[chiave] = true;
    else delete nuove[chiave];
    await secPatch('collaboratori', 'id=eq.' + c.id, { competenze: nuove });
    c.competenze = nuove;
  }
  logAzione('Formazioni: formatori', comp.label + ': ' + (trovati.join(', ') || 'nessuno'));
  toast('Formatori salvati');
  renderPiano();
}

// ---------------------------------------------------------------- nuova formazione
async function formazioneNuova(pre) {
  if (!_pianoAzioneAutoConsentita('formazioni')) return;
  await _formCaricaConfig();
  pre = pre || {};
  const comps = _formCompetenze();
  if (!comps.length) {
    toastErrore('Nessuna competenza di questo settore corrisponde a un reparto dei turni');
    return;
  }
  const membri = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c))
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b));
  const ym = _pianoMeseSel;
  const oggi = oggiLocale();
  const ultimo = ym + '-' + String(_pianoUltimoGiorno(ym)).padStart(2, '0');
  const dal = pre.dal || (oggi > ym + '-01' && oggi.startsWith(ym) ? oggi : ym + '-01');
  const compPre = pre.compKey ? comps.find((c) => c.key === pre.compKey) : comps.find((c) => c.gruppo === pre.gruppo);
  const opt = (lista, sel) =>
    lista
      .map((n) => '<option value="' + escP(n) + '"' + (n === sel ? ' selected' : '') + '>' + escP(n) + '</option>')
      .join('');
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:640px"><h3>Nuova formazione</h3>' +
    '<div style="display:grid;grid-template-columns:150px 1fr;gap:8px 10px;align-items:center;font-size:var(--fs-md,.875rem)">' +
    '<label>Allievo</label><input id="fz-allievo" list="fz-nomi" value="' +
    escP(pre.allievo || '') +
    '" placeholder="Cerca collaboratore..." autocomplete="off">' +
    '<datalist id="fz-nomi">' +
    opt(membri, '') +
    '</datalist>' +
    '<label>Competenza</label><select id="fz-comp" onchange="formazioneAggiornaFormatori()">' +
    comps
      .map(
        (c) =>
          '<option value="' +
          escP(c.key) +
          '"' +
          (compPre && compPre.key === c.key ? ' selected' : '') +
          '>' +
          escP(c.label) +
          ' (' +
          escP(c.gruppo) +
          ')</option>',
      )
      .join('') +
    '</select>' +
    '<label>Formatore diurni</label><select id="fz-fmt-d"></select>' +
    '<label>Formatore notti</label><select id="fz-fmt-n"></select>' +
    '<label>Giorni</label><input id="fz-n" type="number" min="1" max="10" value="5" style="width:80px">' +
    '<label>Periodo</label><span><input id="fz-dal" type="date" value="' +
    dal +
    '" min="' +
    ym +
    '-01" max="' +
    ultimo +
    '"> al <input id="fz-al" type="date" value="' +
    ultimo +
    '" min="' +
    ym +
    '-01" max="' +
    ultimo +
    '"></span>' +
    '<label>Preferenze</label><span><label><input type="checkbox" id="fz-weekend" checked> notti nel fine settimana se possibile</label></span>' +
    '<label>Tempo di ricerca</label><select id="fz-tempo"><option value="20">20 secondi</option><option value="45" selected>45 secondi</option><option value="90">90 secondi</option></select>' +
    '</div><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:8px 0 0">I giorni sono di fila, nel mese aperto nel piano (' +
    escP(ym) +
    '). Nella proposta vedi le celle che cambiano; puoi stamparla prima di confermare.</p>' +
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no" id="fz-no">Annulla</button><button type="button" class="finestra-ok" id="fz-ok">Cerca proposte</button></div></div>';
  document.body.appendChild(velo);
  formazioneAggiornaFormatori(pre.formatore);
  await new Promise((fine) => {
    document.getElementById('fz-no').onclick = () => {
      velo.remove();
      fine();
    };
    document.getElementById('fz-ok').onclick = async () => {
      const v = (id) => (document.getElementById(id) || {}).value;
      const allievoIn = String(v('fz-allievo') || '').trim();
      const trovato =
        typeof _xlsTrovaCollab === 'function'
          ? _xlsTrovaCollab(
              allievoIn,
              collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)),
            )
          : null;
      if (!trovato) {
        toastErrore('Allievo non trovato nel settore');
        return;
      }
      const richiesta = {
        allievo: trovato.nome,
        comp: comps.find((c) => c.key === v('fz-comp')),
        fmtD: v('fz-fmt-d'),
        fmtN: v('fz-fmt-n') || v('fz-fmt-d'),
        n: Math.max(1, Math.min(10, parseInt(v('fz-n')) || 5)),
        dal: v('fz-dal'),
        al: v('fz-al'),
        weekend: !!(document.getElementById('fz-weekend') || {}).checked,
        secondi: parseInt(v('fz-tempo')) || 45,
      };
      if (!richiesta.fmtD) {
        toastErrore('Scegli il formatore');
        return;
      }
      if (richiesta.fmtD === richiesta.allievo || richiesta.fmtN === richiesta.allievo) {
        toastErrore('Formatore e allievo devono essere persone diverse');
        return;
      }
      if (!richiesta.dal || !richiesta.al || richiesta.al < richiesta.dal) {
        toastErrore('Periodo non valido');
        return;
      }
      // numero di giorni: si conferma prima di generare
      const seq = _formSequenza(richiesta.comp.gruppo, richiesta.n);
      if (!seq.length) {
        toastErrore('Nessun modello di turni per ' + richiesta.comp.gruppo);
        return;
      }
      const ok = await chiediConferma(
        richiesta.allievo +
          ' · ' +
          richiesta.comp.label +
          ': ' +
          richiesta.n +
          (richiesta.n === 1 ? ' giorno' : ' giorni') +
          ' con questi turni: ' +
          seq.map((x) => x.codice).join(', ') +
          '\nFormatore: ' +
          richiesta.fmtD +
          (richiesta.fmtN !== richiesta.fmtD ? ' (diurni), ' + richiesta.fmtN + ' (notti)' : '') +
          '\n\nCerco le proposte?',
        { titolo: 'Nuova formazione' },
      );
      if (!ok) return;
      velo.remove();
      fine();
      await _formCercaProposte(richiesta, seq);
    };
  });
}
// formatori proposti per la competenza scelta: prima i formatori, poi gli abilitati
function formazioneAggiornaFormatori(preferito) {
  const sel = document.getElementById('fz-comp');
  if (!sel) return;
  const comp = _formCompetenze().find((c) => c.key === sel.value);
  if (!comp) return;
  const fm = _formFormatori(comp.key);
  const t = _pianoTurniReparto().find((x) => String(x.gruppo || '').toUpperCase() === comp.gruppo);
  const abil = collaboratoriCache
    .filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c) && !fm.includes(c.nome))
    .filter((c) => !t || _pianoIdoneoStatico(c.nome, t, null, null))
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b));
  const html =
    (fm.length
      ? '<optgroup label="Formatori">' + fm.map((n) => '<option>' + escP(n) + '</option>').join('') + '</optgroup>'
      : '') +
    '<optgroup label="Altri abilitati">' +
    abil.map((n) => '<option>' + escP(n) + '</option>').join('') +
    '</optgroup>';
  ['fz-fmt-d', 'fz-fmt-n'].forEach((id) => {
    const s = document.getElementById(id);
    if (!s) return;
    s.innerHTML = (id === 'fz-fmt-n' ? '<option value="">come i diurni</option>' : '') + html;
    if (id === 'fz-fmt-d' && preferito) s.value = preferito;
  });
}

// ---------------------------------------------------------------- proposte
// giorni candidati: n giorni di fila nel periodo, senza assenze di allievo e formatori
async function _formCandidati(r, seq) {
  const out = [];
  const ym = _pianoMeseSel;
  const malattie = Object.assign({}, _pianoMalattieMese(ym), _pianoCnpMese(ym), _pianoFineMese(ym), _pianoNdMese(ym));
  const cellaDi = (n, d) => _pianoRighe.find((x) => x.collaboratore === n && String(x.data).startsWith(d));
  const piu = (d, k) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + k);
    return dataLocaleISO(x);
  };
  for (let s = r.dal; piu(s, seq.length - 1) <= r.al; s = piu(s, 1)) {
    const giorni = seq.map((x, i) => Object.assign({ data: piu(s, i) }, x));
    if (!giorni.every((g) => g.data.startsWith(ym))) break;
    let ok = true;
    let conflitti = 0;
    let weekend = 0;
    giorni.forEach((g) => {
      if (_pianoGiornoBloccato(g.data) && !_pianoGiornoSbloccato(g.data)) ok = false;
      g.formatore = g.fase === 'N' ? r.fmtN : r.fmtD;
      [r.allievo, g.formatore].forEach((n) => {
        if (malattie[n + '|' + g.data]) ok = false;
        const c = cellaDi(n, g.data);
        if (!c) return;
        if (c.motivo_blocco || FORM_ASSENZE.includes(String(c.codice).toUpperCase()) || !_pianoCopreQui(c)) ok = false;
        else if (c.codice !== g.codice) conflitti++;
      });
      // notte di venerdi, sabato o domenica: piu lavoro, si vede di piu
      const dow = new Date(g.data + 'T12:00:00').getDay();
      if (g.fase === 'N' && (dow === 5 || dow === 6 || dow === 0)) weekend++;
    });
    if (ok) out.push({ inizio: s, giorni: giorni, conflitti: conflitti, weekend: weekend });
  }
  out.sort(
    (a, b) =>
      (r.weekend ? b.weekend - a.weekend : 0) * 2 + (a.conflitti - b.conflitti) || a.inizio.localeCompare(b.inizio),
  );
  return out;
}
async function _formCercaProposte(r, seq) {
  const reparto = _formNomeReparto(r.comp);
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.innerHTML =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:480px"><h3>Cerco le proposte</h3><div class="finestra-testo" id="fz-prog">Preparo il mese...</div><div style="height:8px;background:var(--line,#ddd);border-radius:4px;overflow:hidden;margin:10px 0"><div id="fz-barra" style="height:100%;width:0;background:var(--accent2,#1a4a7a)"></div></div></div>';
  document.body.appendChild(velo);
  const prog = (t, f) => {
    const a = document.getElementById('fz-prog');
    const b = document.getElementById('fz-barra');
    if (a) a.textContent = t;
    if (b) b.style.width = Math.round(f * 100) + '%';
  };
  const proposte = [];
  try {
    _pianoRighe = await _pianoCaricaMeseSettore(
      _pianoMeseSel + '-01',
      _pianoMeseSel + '-' + String(_pianoUltimoGiorno(_pianoMeseSel)).padStart(2, '0'),
      _pianoReparto(),
    );
    const cand = (await _formCandidati(r, seq)).slice(0, 5);
    if (!cand.length) {
      velo.remove();
      toastErrore(
        'Nessun periodo possibile: nei giorni scelti allievo o formatore sono assenti (vacanze, malattie, ND, CGF) o i giorni sono chiusi',
      );
      return;
    }
    const fabb = await _formFabbisogno();
    const righePrima = _pianoRighe.slice();
    const primaUff = _formMisura(righePrima, fabb, null);
    const ms = (r.secondi * 1000) / cand.length;
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i];
      prog('Proposta ' + (i + 1) + ' di ' + cand.length + ': dal ' + _formGg(c.inizio), i / cand.length);
      const fissi = {};
      c.giorni.forEach((g) => {
        (fissi[g.formatore] = fissi[g.formatore] || {})[g.data] = g.codice;
        (fissi[r.allievo] = fissi[r.allievo] || {})[g.data] = '~' + g.codice;
      });
      // si cambia solo attorno alla formazione: i suoi giorni e quello prima e dopo
      const finestra = new Set();
      c.giorni.forEach((g) => [-1, 0, 1].forEach((k) => finestra.add(_formPiu(g.data, k))));
      // formatore e allievo: anche la settimana prima e dopo (giorni di fila, ore della
      // settimana, riposo attorno alla domenica guardano piu lontano)
      const settimane = new Set();
      for (let k = -7; k < c.giorni.length + 7; k++) settimane.add(_formPiu(c.giorni[0].data, k));
      const giorniPersona = {};
      Object.keys(fissi).forEach((n) => (giorniPersona[n] = settimane));
      const prep = await _ricercaPrepara({
        estesa: true,
        fissi: fissi,
        giorni: finestra,
        giorniPersona: giorniPersona,
        soloNuoviBuchi: true,
        soloPeggioramenti: true,
      });
      // un buco lasciato dalla formazione si copre (1000) anche se serve un cambio (400);
      // una regola violata pesa sempre di piu
      const motore = PianoRicerca.crea(prep.problema, { pesoScoperto: 1000, pesoCambio: 400, seme: 7 + i });
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        motore.passo(40, (Date.now() - t0) / ms);
        prog(
          'Proposta ' + (i + 1) + ' di ' + cand.length + ': dal ' + _formGg(c.inizio),
          (i + (Date.now() - t0) / ms) / cand.length,
        );
        await new Promise((x) => setTimeout(x, 0));
      }
      const ris = motore.risultato();
      const righeDopo = _ricercaRigheDa(prep, ris.stato);
      const dopoUff = _formMisura(righeDopo, fabb, { allievo: r.allievo, giorni: c.giorni });
      const altri = ris.cambi.filter((x) => !(fissi[x.nome] && fissi[x.nome][x.data] != null));
      // violazioni che ci sono dopo e non prima: stesso tipo per la stessa persona e lo
      // stesso giorno = non e nuova (le ore del mese cambiano di qualche decimale ma non
      // sono una violazione nuova). Si mostrano nella proposta e in stampa.
      const chiave = (x) =>
        x.replace(/: .*$/, '') + ': ' + x.replace(/^[^:]*: /, '').replace(/[0-9]+([.,][0-9]+)?/g, '#');
      const restoPrima = (primaUff.voci || []).map(chiave);
      const violNuove = (dopoUff.voci || []).filter((x) => {
        const k = restoPrima.indexOf(chiave(x));
        if (k >= 0) {
          restoPrima.splice(k, 1);
          return false;
        }
        return true;
      });
      const sotto = (x) => / SOTTO il minimo /.test(x);
      proposte.push({
        candidato: c,
        prep: prep,
        cambi: ris.cambi.map((x) => Object.assign({}, x, { dopo: String(x.dopo || '').replace(/^~/, '') })),
        altri: altri,
        persone: [...new Set(altri.map((x) => x.nome))],
        prima: primaUff,
        dopo: dopoUff,
        violNuove: violNuove,
        nuoveLegge: violNuove.filter((x) => _ricercaRegolaDiLegge(x)).length,
        nuoveRegole: violNuove.filter((x) => !_ricercaRegolaDiLegge(x) && !sotto(x)).length,
        nuoveOre: violNuove.filter(sotto).length,
      });
    }
  } catch (e) {
    velo.remove();
    console.error(e);
    toastErrore('Ricerca non riuscita: ' + (e.message || e));
    return;
  }
  velo.remove();
  // le migliori: prima nessuna regola peggiorata, poi meno cambi, poi le notti nel weekend
  proposte.sort(
    (a, b) =>
      a.nuoveLegge - b.nuoveLegge ||
      a.nuoveRegole - b.nuoveRegole ||
      a.dopo.scoperti - b.dopo.scoperti ||
      a.altri.length - b.altri.length ||
      b.candidato.weekend - a.candidato.weekend,
  );
  window._formProposte = { richiesta: r, reparto: reparto, lista: proposte.slice(0, 3) };
  _formMostraProposte();
}
async function _formFabbisogno() {
  const ym = _pianoMeseSel;
  const fr =
    (await secGet(
      'piano_fabbisogni?data=gte.' +
        ym +
        '-01&data=lte.' +
        ym +
        '-' +
        String(_pianoUltimoGiorno(ym)).padStart(2, '0') +
        '&reparto_dip=eq.' +
        _pianoReparto() +
        '&limit=3000',
    )) || [];
  const f = {};
  fr.forEach((x) => {
    const q = parseInt(x.quantita) || 0;
    if (q) (f[String(x.data).substring(0, 10)] = f[String(x.data).substring(0, 10)] || {})[x.turno_codice] = q;
  });
  return f;
}
function _formPiu(d, k) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + k);
  return dataLocaleISO(x);
}
// conteggio ufficiale: Valida regole + posti scoperti (l allievo non copre un posto)
function _formMisura(righe, fabb, form) {
  const giorniForm = form ? new Set(form.giorni.map((g) => g.data)) : null;
  const perCopertura = form
    ? righe.filter((x) => !(x.collaboratore === form.allievo && giorniForm.has(String(x.data).substring(0, 10))))
    : righe;
  const m = _ricercaMisuraUfficiale(righe, fabb);
  m.scoperti = _ricercaScoperti(perCopertura, fabb);
  return m;
}
function _formMostraProposte() {
  const P = window._formProposte;
  if (!P) return;
  const r = P.richiesta;
  const velo = document.createElement('div');
  velo.className = 'finestra-velo';
  velo.id = 'fz-proposte';
  let h =
    '<div class="finestra-box" role="dialog" aria-modal="true" style="max-width:760px;max-height:88vh;overflow:auto"><h3>Proposte · ' +
    escP(r.allievo) +
    ' · ' +
    escP(r.comp.label) +
    '</h3>';
  if (!P.lista.length) h += '<p>Nessuna proposta trovata.</p>';
  P.lista.forEach((p, i) => {
    const c = p.candidato;
    const ok = !p.nuoveLegge && !p.nuoveRegole;
    h +=
      '<div style="border:1px solid var(--line);border-left:4px solid ' +
      (ok ? 'var(--c-verde,#2c6e49)' : '#b8860b') +
      ';border-radius:3px;padding:10px 12px;margin:10px 0;background:var(--paper2)">' +
      '<b>Proposta ' +
      (i + 1) +
      ': dal ' +
      _formGg(c.giorni[0].data) +
      ' al ' +
      _formGg(c.giorni[c.giorni.length - 1].data) +
      '</b>' +
      (c.weekend ? ' · ' + c.weekend + (c.weekend === 1 ? ' notte' : ' notti') + ' nel fine settimana' : '') +
      '<div style="font-size:var(--fs-sm,.8125rem);margin-top:4px">' +
      c.giorni
        .map(
          (g) =>
            _formGg(g.data) +
            ' ' +
            GIORNI[new Date(g.data + 'T12:00:00').getDay()].slice(0, 3) +
            ' <b>' +
            g.codice +
            '</b> con ' +
            escP(g.formatore),
        )
        .join(' · ') +
      '</div><div style="font-size:var(--fs-sm,.8125rem);margin-top:6px">' +
      (p.altri.length
        ? '<b>' + p.altri.length + ' altre celle cambiano</b> (' + escP(p.persone.join(', ')) + ')'
        : '<b>Nessun altro cambio</b>') +
      ' · regole: ' +
      (ok
        ? '<span style="color:var(--c-verde,#2c6e49)">nessuna violazione nuova</span>'
        : '<span style="color:#b8860b">' + (p.nuoveLegge + p.nuoveRegole) + ' violazioni nuove</span>') +
      ' · posti scoperti: ' +
      p.prima.scoperti +
      ' → ' +
      p.dopo.scoperti +
      '</div>' +
      ((p.violNuove || []).length
        ? '<div style="font-size:var(--fs-sm,.8125rem);color:#8a6d0b;margin-top:4px">' +
          p.violNuove.map((x) => escP(x)).join('<br>') +
          '</div>'
        : '') +
      (p.altri.length
        ? '<div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px">' +
          p.altri
            .slice(0, 12)
            .map(
              (x) => escP(x.nome) + ' ' + _formGg(x.data) + ': ' + (x.prima || 'riposo') + ' → ' + (x.dopo || 'riposo'),
            )
            .join('; ') +
          (p.altri.length > 12 ? ' e altri ' + (p.altri.length - 12) : '') +
          '</div>'
        : '') +
      '<div style="margin-top:8px;display:flex;gap:8px"><button class="btn-export" onclick="formazioneStampaProposta(' +
      i +
      ')">Stampa</button><button class="btn-export" style="border-color:var(--c-verde,#2c6e49);color:var(--c-verde,#2c6e49)" onclick="formazioneApplicaProposta(' +
      i +
      ')">Applica</button></div></div>';
  });
  h +=
    '<div class="finestra-pulsanti"><button type="button" class="finestra-no" onclick="document.getElementById(\'fz-proposte\').remove();window._formProposte=null;toast(\'Nessuna modifica: proposte chiuse\')">Annulla</button></div></div>';
  velo.innerHTML = h;
  document.body.appendChild(velo);
}
// stampa della proposta, prima di confermare
async function formazioneStampaProposta(i) {
  const P = window._formProposte;
  const p = P && P.lista[i];
  if (!p) return;
  if (!(await assicuraLibreria('jspdf'))) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const r = P.richiesta;
  doc.setFontSize(15);
  doc.text('Proposta di formazione', 14, 16);
  doc.setFontSize(10);
  doc.text(
    'Allievo: ' +
      r.allievo +
      '   Competenza: ' +
      r.comp.label +
      '   Settore: ' +
      (typeof repartoLabel === 'function' ? repartoLabel(_pianoReparto()) : _pianoReparto()),
    14,
    24,
  );
  doc.text(
    'Stampata il ' + new Date().toLocaleDateString('it-IT') + ' da ' + (getOperatore() || '') + ' · da confermare',
    14,
    30,
  );
  doc.autoTable({
    startY: 35,
    theme: 'grid',
    head: [['Giorno', 'Turno', 'Formatore', 'Commento nel piano']],
    body: p.candidato.giorni.map((g) => [
      new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }),
      g.codice,
      g.formatore,
      'FORMAZIONE ' + P.reparto + ' con ' + g.formatore + ' / con ' + r.allievo,
    ]),
    headStyles: { fillColor: [26, 74, 122] },
    styles: { fontSize: 9 },
  });
  let y = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(11);
  doc.text(p.altri.length ? 'Altri cambi necessari (' + p.altri.length + ')' : 'Nessun altro cambio necessario', 14, y);
  if (p.altri.length) {
    doc.autoTable({
      startY: y + 3,
      theme: 'grid',
      head: [['Collaboratore', 'Giorno', 'Prima', 'Dopo']],
      body: p.altri.map((x) => [
        x.nome,
        new Date(x.data + 'T12:00:00').toLocaleDateString('it-IT'),
        x.prima || 'riposo',
        x.dopo || 'riposo',
      ]),
      headStyles: { fillColor: [139, 105, 20] },
      styles: { fontSize: 9 },
    });
    y = doc.lastAutoTable.finalY + 6;
  } else y += 6;
  doc.setFontSize(10);
  doc.text(
    'Controllo regole (come Valida regole): violazioni ' +
      p.prima.violazioni +
      ' -> ' +
      p.dopo.violazioni +
      ' · regole di legge ' +
      p.prima.legge +
      ' -> ' +
      p.dopo.legge +
      ' · posti scoperti ' +
      p.prima.scoperti +
      ' -> ' +
      p.dopo.scoperti,
    14,
    y,
  );
  if ((p.violNuove || []).length) {
    y += 6;
    doc.setFontSize(11);
    doc.text('Violazioni nuove con questa proposta (' + p.violNuove.length + ')', 14, y);
    doc.setFontSize(9);
    p.violNuove.forEach((v) => {
      y += 5;
      doc.text(doc.splitTextToSize('- ' + v, 180)[0], 14, y);
    });
  }
  mostraPdfPreview(
    doc,
    'proposta_formazione_' + r.allievo.replace(/\s+/g, '_') + '.pdf',
    'Proposta di formazione ' + r.allievo,
  );
}
// APPLICA: celle della formazione con il commento, altri cambi, fotografia per Annulla
async function formazioneApplicaProposta(i) {
  const P = window._formProposte;
  const p = P && P.lista[i];
  if (!p || !_pianoAzioneAutoConsentita('formazioni')) return;
  const r = P.richiesta;
  const prep = p.prep;
  const box = document.getElementById('fz-proposte');
  if (box) box.remove();
  _pianoUndoSnap('formazione ' + r.allievo);
  const op = getOperatore();
  const ora = new Date().toISOString();
  const ripristino = [];
  try {
    const giorniForm = new Set(p.candidato.giorni.map((g) => g.data));
    // celle della formazione (formatore e allievo)
    for (const g of p.candidato.giorni) {
      for (const [nome, commento] of [
        [g.formatore, 'FORMAZIONE ' + P.reparto + ' con ' + r.allievo],
        [r.allievo, 'FORMAZIONE ' + P.reparto + ' con ' + g.formatore],
      ]) {
        const esist = (prep.righeDi[nome + '|' + g.data] || [])[0];
        ripristino.push({
          nome: nome,
          data: g.data,
          codice: esist ? esist.codice : '',
          commento: esist ? esist.commento || '' : '',
        });
        const campi = {
          codice: g.codice,
          commento: commento,
          protetto: true,
          generato: false,
          operatore: op,
          updated_at: ora,
        };
        if (esist) await secPatch('piano', 'id=eq.' + esist.id, campi);
        else
          await secPost(
            'piano',
            Object.assign({ collaboratore: nome, data: g.data, reparto_dip: _pianoReparto() }, campi),
          );
      }
    }
    // altri cambi proposti (stessa scrittura della bozza migliorata)
    for (const c of p.altri) {
      if (
        giorniForm.has(c.data) &&
        (c.nome === r.allievo || p.candidato.giorni.some((g) => g.formatore === c.nome && g.data === c.data))
      )
        continue;
      const esist = (prep.righeDi[c.nome + '|' + c.data] || [])[0];
      const cod = c.dopo || (prep.conRiempimento ? 'C' : '');
      if (esist) {
        if (!cod) await secDel('piano', 'id=eq.' + esist.id);
        else if (cod !== esist.codice)
          await secPatch('piano', 'id=eq.' + esist.id, { codice: cod, operatore: op, updated_at: ora });
      } else if (cod)
        await secPost('piano', {
          collaboratore: c.nome,
          data: c.data,
          codice: cod,
          protetto: false,
          generato: true,
          reparto_dip: _pianoReparto(),
          operatore: op,
        });
    }
    const dati = {
      allievo: r.allievo,
      comp: { key: r.comp.key, label: r.comp.label },
      gruppo: r.comp.gruppo,
      reparto: P.reparto,
      giorni: p.candidato.giorni.map((g) => ({ data: g.data, codice: g.codice, formatore: g.formatore, fase: g.fase })),
      stato: 'pianificata',
      altriCambi: p.altri.map((x) => ({ nome: x.nome, data: x.data, prima: x.prima, dopo: x.dopo })),
      ripristino: ripristino,
      applicata: ora,
    };
    const salvato = await secPost('moduli', {
      tipo: FORM_TIPO,
      collaboratore: r.allievo,
      data_modulo: p.candidato.giorni[0].data,
      dati: dati,
      operatore: op,
      reparto_dip: _pianoReparto(),
    });
    if (salvato && salvato[0] && typeof moduliCache !== 'undefined') moduliCache.unshift(salvato[0]);
    logAzione(
      'Formazione pianificata',
      r.allievo +
        ' · ' +
        r.comp.label +
        ' · ' +
        _formGg(p.candidato.giorni[0].data) +
        '-' +
        _formGg(p.candidato.giorni.slice(-1)[0].data) +
        ' · altri cambi ' +
        p.altri.length,
    );
    toast('Formazione messa nel piano');
  } catch (e) {
    console.error(e);
    toastErrore('Scrittura interrotta: ' + (e.message || e) + '. Con Annulla del piano si torna a prima.');
  }
  window._formProposte = null;
  _pianoViolCelle = {};
  _pianoViolLista = null;
  renderPiano();
}

// ---------------------------------------------------------------- stampa, annulla, svolta
async function formazioneStampa(id) {
  const f = _formTutte().find((x) => x.id === id) || (moduliCache || []).find((x) => x.id === id);
  if (!f) return;
  if (!(await assicuraLibreria('jspdf'))) return;
  const d = f.dati || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text('Formazione ' + ((d.comp || {}).label || ''), 14, 16);
  doc.setFontSize(10);
  doc.text('Allievo: ' + (d.allievo || '') + '   Stato: ' + (d.stato || ''), 14, 24);
  doc.autoTable({
    startY: 30,
    theme: 'grid',
    head: [['Giorno', 'Turno', 'Formatore']],
    body: (d.giorni || []).map((g) => [
      new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      g.codice,
      g.formatore,
    ]),
    headStyles: { fillColor: [26, 74, 122] },
  });
  mostraPdfPreview(
    doc,
    'formazione_' + String(d.allievo || '').replace(/\s+/g, '_') + '.pdf',
    'Formazione ' + (d.allievo || ''),
  );
}
async function formazioneAnnulla(id) {
  if (!_pianoAzioneAutoConsentita('formazioni')) return;
  const f = _formTutte().find((x) => x.id === id);
  if (!f) return;
  const d = f.dati || {};
  if (
    !(await chiediConferma(
      'Annullare la formazione di ' +
        d.allievo +
        ' (' +
        _formPeriodo(f) +
        ')?\n\nLe celle della formazione tornano come erano prima (se nel frattempo non sono state cambiate a mano). Gli altri cambi fatti per farle posto restano: si correggono dal calendario.',
    ))
  )
    return;
  _pianoUndoSnap('annulla formazione ' + d.allievo);
  let tornate = 0;
  for (const x of d.ripristino || []) {
    const righe = (await secGet('piano?collaboratore=eq.' + encodeURIComponent(x.nome) + '&data=eq.' + x.data)) || [];
    const cella = righe.find((y) => /^FORMAZIONE /.test(String(y.commento || '')));
    if (!cella) continue;
    if (x.codice) await secPatch('piano', 'id=eq.' + cella.id, { codice: x.codice, commento: x.commento || null });
    else await secDel('piano', 'id=eq.' + cella.id);
    tornate++;
  }
  const nuovi = Object.assign({}, d, { stato: 'annullata', annullata: new Date().toISOString() });
  await secPatch('moduli', 'id=eq.' + id, { dati: nuovi });
  f.dati = nuovi;
  logAzione('Formazione annullata', d.allievo + ' · ' + _formPeriodo(f) + ' · celle rimesse ' + tornate);
  toast('Formazione annullata');
  renderPiano();
}
// FINE FORMAZIONE: svolta nello storico HR, competenza certificata (livelli inferiori
// compresi, il livello si aggiorna da solo), punti se gli incentivi sono attivi
async function formazioneSegnaSvolta(id, automatica) {
  const f = (moduliCache || []).find((x) => x.id === id);
  if (!f) return false;
  const d = f.dati || {};
  if (d.stato !== 'pianificata') return false;
  const puoCert = isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_competenze'));
  const puoPunti = isAdmin() || (typeof puoModificare === 'function' && puoModificare('gestione_punti'));
  const formatori = [...new Set((d.giorni || []).map((g) => g.formatore))];
  const periodo = _formPeriodo(f);
  const testo = 'Formazione ' + ((d.comp || {}).label || '') + ' ' + periodo + ' · formatore: ' + formatori.join(', ');
  try {
    if (typeof _insertHrEvento === 'function')
      await _insertHrEvento(d.allievo, 'formazione', testo, ((d.giorni || []).slice(-1)[0] || {}).data);
    let certificata = false;
    const c = collaboratoriCache.find((x) => x.nome === d.allievo);
    if (puoCert && c && d.comp && d.comp.key) {
      const nuove = Object.assign({}, c.competenze || {});
      nuove[d.comp.key] = true;
      // un livello implica quelli sotto, come nella matrice della scheda Formazione
      const comps = getCompetenzeReparto();
      const lv = parseInt((comps.find((k) => k.key === d.comp.key) || {}).livello) || 0;
      comps.forEach((k) => {
        const l = parseInt(k.livello) || 0;
        if (l > 0 && l < lv) nuove[k.key] = true;
      });
      await secPatch('collaboratori', 'id=eq.' + c.id, { competenze: nuove });
      c.competenze = nuove;
      certificata = true;
      logAzione('Competenza certificata', d.allievo + ' · ' + d.comp.label + ' (formazione ' + periodo + ')');
    }
    if (puoPunti && typeof incentiviAttivi === 'function' && typeof _insertPuntiEvento === 'function') {
      const cfgP = getPuntiConfig();
      const azF = cfgP.azioni.find((a) => a.key === 'formatore');
      if (incentiviAttivi('formatore') && azF && azF.punti)
        for (const fm of formatori)
          await _insertPuntiEvento(fm, azF.punti, 'formatore', 'Formatore: ' + testo + ' a ' + d.allievo);
      const azA = cfgP.azioni.find((a) => a.key === 'sessione_formativa');
      if (incentiviAttivi('sessione_formativa') && azA && azA.punti)
        await _insertPuntiEvento(d.allievo, azA.punti, 'sessione_formativa', testo);
    }
    const nuovi = Object.assign({}, d, {
      stato: 'svolta',
      svolta: { data: oggiLocale(), certificata: certificata, da: getOperatore(), automatica: !!automatica },
    });
    await secPatch('moduli', 'id=eq.' + id, { dati: nuovi });
    f.dati = nuovi;
    logAzione(
      'Formazione svolta',
      d.allievo + ' · ' + testo + (certificata ? ' · competenza certificata' : ' · da certificare'),
    );
    if (!automatica) {
      toast('Formazione segnata come svolta' + (certificata ? ': competenza certificata' : ''));
      renderPiano();
    }
    return true;
  } catch (e) {
    console.error(e);
    if (!automatica) toastErrore('Non riuscito: ' + (e.message || e));
    return false;
  }
}
// all apertura della scheda: le formazioni finite (ultimo giorno passato) diventano
// svolte da sole, se chi apre ha il permesso
async function _formCompletaFinite() {
  if (!puoPianificareFormazioni()) return;
  const oggi = oggiLocale();
  const finite = _formTutte().filter(
    (f) => (f.dati || {}).stato === 'pianificata' && (((f.dati || {}).giorni || []).slice(-1)[0] || {}).data < oggi,
  );
  let n = 0;
  for (const f of finite) if (await formazioneSegnaSvolta(f.id, true)) n++;
  if (n)
    toast(
      n + (n === 1 ? ' formazione finita registrata' : ' formazioni finite registrate') + ' nella scheda Formazione',
    );
}
// dall Organico: "Pianifica formazione" per un gruppo scoperto
function formazioniApriDaOrganico(gruppo, allievo) {
  pianoCambiaTab('formazioni');
  setTimeout(() => formazioneNuova({ gruppo: gruppo, allievo: allievo || '' }), 600);
}
