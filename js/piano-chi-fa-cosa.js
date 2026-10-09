/**
 * Diario Collaboratori · Casino Lugano SA
 * File: piano-chi-fa-cosa.js
 * Piano > Regole: "Chi puo fare cosa" (sola lettura, controllo del 09/10/2026). Per un
 * collaboratore, ogni turno del settore con l esito (si / solo se serve / no) e il MOTIVO
 * in parole, con il posto dove si cambia; oppure, per un turno, chi puo farlo e perche
 * gli altri no. La spiegazione segue passo per passo il controllo della bozza
 * (_pianoIdoneoStatico) e alla fine verifica di arrivare allo stesso risultato; accanto
 * c e il risultato "scritto a mano" (_pianoIdoneoAMano), che puo essere diverso.
 */

const _PCFC_GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
let _pcfcStato = { vista: 'persona', nome: '', turno: '', dow: null };

function _pcfcLista(v) {
  return String(v || '')
    .toUpperCase()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
// competenze di Formazione collegate a un area di lavoro (gruppo)
function _pcfcCompetenzeDelGruppo(gruppo) {
  const m = typeof _pianoCompetenzeGruppi === 'function' ? _pianoCompetenzeGruppi() : {};
  const g = String(gruppo || '').toUpperCase();
  const tutte = typeof getCompetenzeConfigAll === 'function' ? getCompetenzeConfigAll() : {};
  const label = (k) => {
    for (const rep of Object.keys(tutte)) {
      const c = (tutte[rep] || []).find((x) => x.key === k);
      if (c) return c.label;
    }
    return k;
  };
  return Object.keys(m)
    .filter((k) => String(m[k] || '').toUpperCase() === g)
    .map((k) => ({ key: k, label: label(k) }));
}

// PERCHE: stessi passi e stesso ordine di _pianoIdoneoStatico (piano-genera.js)
function _pcfcSpiega(nome, t, dowG, idoneita) {
  const info = _pianoCollabInfo(nome) || {};
  const cod = String(t.codice);
  const gruppoT = String(t.gruppo || '').toUpperCase();
  const fz = String(info.funzione || '').toUpperCase();
  const no = (motivo, dove) => ({ esito: 'no', motivo: motivo, dove: dove });
  if (info.turni_solo_a_mano)
    return no('"Turni solo a mano": la bozza non gli assegna turni (si scrivono a mano)', 'pref');
  if (info.solo_diurni && t.tipo === 'NOTTURNO') return no('fa solo turni diurni', 'pref');
  if (info.solo_notti && t.tipo !== 'NOTTURNO') return no('fa solo turni notturni', 'pref');
  if (dowG != null && !PianoRegole.lavoraNelGiorno(info, dowG))
    return no('non lavora di ' + _PCFC_GIORNI[dowG] + ' (Giorni di lavoro)', 'pref');
  if (_pcfcLista(info.turni_bloccati).includes(cod.toUpperCase()))
    return no('turno bloccato nelle sue preferenze', 'pref');
  if (PianoRegole.sceltoPerTurno(info, t, _pianoRegoleTurnoFunzione()))
    return { esito: 'si', motivo: 'scelto per nome (regola Turni riservati a collaboratori scelti)', dove: 'regole' };
  const vf = _pianoViolazioneFunzioneTurno(nome, t, dowG, true);
  if (vf) return no(vf + ' (Regole di gruppo)', 'regole');
  // abilitazione all area di lavoro
  const settoriC = _pianoSettoriEffettivi(info);
  const haArea = settoriC ? settoriC.includes(gruppoT) : !!(idoneita[nome] && idoneita[nome].has(t.gruppo));
  let lasciapassare = '';
  for (const rg of _pianoRegoleGruppoDi(gruppoT)) {
    const tipoR = String(rg.tipo_regola || '').toLowerCase();
    if (tipoR === 'richiede_funzione') {
      const ammesse = rg.valore.split(',').map((x) => x.trim().toUpperCase());
      if (ammesse.includes(fz)) lasciapassare = 'la sua funzione ' + fz + ' e ammessa nell area ' + gruppoT;
      else if (!haArea)
        return no(
          'l area ' + gruppoT + ' e aperta alle funzioni ' + ammesse.join(', ') + ' e lui non vi e abilitato',
          'regole',
        );
    } else if (tipoR === 'blocca_tipo_turno') {
      const tipi = rg.valore.split(',').map((x) => x.trim().toUpperCase());
      if (tipi.includes(String(t.tipo || '').toUpperCase()))
        return no('turni ' + String(t.tipo).toLowerCase() + ' vietati nell area ' + gruppoT, 'regole');
    } else if (tipoR === 'richiede_campo') {
      if (!_pianoCampoOk(info, rg.valore))
        return no('requisito sulla scheda non soddisfatto (' + String(rg.valore).toLowerCase() + ')', 'regole');
      lasciapassare = 'requisito sulla scheda soddisfatto (' + String(rg.valore).toLowerCase() + ')';
    }
  }
  const mapp = _pianoMappFunzione(info.funzione) || [];
  const voci = mapp.filter((m) => m.tipo === 'PRINCIPALE' || m.tipo === 'AMMESSO');
  const preferito = mapp.some((m) => m.tipo === 'PREFERITO' && m.turno_codice === cod);
  const conAffianc = _pcfcLista(info.accompagnamento_settori).includes(gruppoT)
    ? ' · affiancato: mai da solo in ' + gruppoT
    : '';
  if (voci.length) {
    const m = voci.find((x) => x.turno_codice === cod);
    if (!m)
      return no(
        'la funzione ' + fz + ' fa solo ' + voci.map((x) => x.turno_codice).join(', ') + ' (Turni per funzione)',
        'mapp',
      );
    return m.tipo === 'AMMESSO'
      ? { esito: 'serve', motivo: 'turno ammesso per la funzione ' + fz + ': solo se serve' + conAffianc, dove: 'mapp' }
      : { esito: 'si', motivo: 'turno abituale della funzione ' + fz + conAffianc, dove: 'mapp' };
  }
  if (!haArea && !lasciapassare) {
    const comps = _pcfcCompetenzeDelGruppo(gruppoT);
    if (settoriC && comps.length)
      return no(
        'area ' +
          gruppoT +
          ' non abilitata: competenza ' +
          comps.map((c) => c.label).join(' o ') +
          ' non certificata in Formazione',
        'formazione',
      );
    if (settoriC) return no('area ' + gruppoT + ' non fra i suoi Settori (Preferenze)', 'pref');
    return no(
      'nessuna abilitazione all area ' + gruppoT + ' (ne Formazione ne Settori) e non ci ha mai lavorato',
      'formazione',
    );
  }
  let perche = lasciapassare;
  if (!perche) {
    const comps = _pcfcCompetenzeDelGruppo(gruppoT).filter((c) => (info.competenze || {})[c.key] === true);
    if (settoriC && comps.length)
      perche = 'competenza ' + comps.map((c) => c.label).join(', ') + ' certificata in Formazione';
    else if (settoriC) perche = 'area ' + gruppoT + ' fra i suoi Settori';
    else perche = 'ha gia lavorato nell area ' + gruppoT + ' (storia dei turni)';
  }
  return {
    esito: 'si',
    motivo: perche + (preferito ? ' · turno preferito della funzione ' + fz : '') + conAffianc,
    dove: lasciapassare ? 'regole' : settoriC && _pcfcCompetenzeDelGruppo(gruppoT).length ? 'formazione' : 'pref',
  };
}

function _pcfcChip(esito) {
  const m = { si: ['pcfc-si', '✓ si'], serve: ['pcfc-serve', '~ se serve'], no: ['pcfc-no', '✗ no'] }[esito];
  return '<span class="pcfc-chip ' + m[0] + '">' + m[1] + '</span>';
}
const _PCFC_DOVE = {
  pref: 'Preferenze',
  regole: 'Regole di gruppo',
  mapp: 'Turni per funzione',
  formazione: 'Formazione',
};
function pcfcVai(dove) {
  if (dove === 'formazione') {
    switchPage('formazione');
    return;
  }
  _pianoTab = dove === 'regole' ? 'regole' : 'impostazioni';
  renderPiano();
}

function _pianoChiFaCosaSegnaposto() {
  setTimeout(() => _pcfcRender(), 0);
  return '<div id="pcfc-card"></div>';
}
async function _pcfcRender() {
  const box = document.getElementById('pcfc-card');
  if (!box) return;
  const rep = _pianoReparto();
  try {
    await _pianoCaricaStoriaGruppi(rep);
  } catch (e) {}
  const persone = ordineCollabPiano(
    collaboratoriCache.filter((c) => c.attivo !== false && _pianoAppartieneAlReparto(c)).map((c) => c.nome),
    rep,
  );
  const turni = _pianoTurniReparto()
    .filter((t) => t.attivo !== false)
    .sort(
      (a, b) =>
        String(a.gruppo || '').localeCompare(String(b.gruppo || '')) ||
        String(a.codice).localeCompare(String(b.codice)),
    );
  const st = _pcfcStato;
  if (!persone.includes(st.nome)) st.nome = persone[0] || '';
  if (!turni.some((t) => t.codice === st.turno)) st.turno = (turni[0] || {}).codice || '';
  if (st.dow == null) st.dow = new Date().getDay();
  const idoneita = {};
  persone.forEach((n) => {
    const s = typeof _pianoStoriaGruppiDi === 'function' ? _pianoStoriaGruppiDi(n) : null;
    if (s) idoneita[n] = s;
  });
  const riga = (nome, t) => {
    const sp = _pcfcSpiega(nome, t, st.dow, idoneita);
    // controllo di coerenza con il motore della bozza
    const bozza = _pianoIdoneoStatico(nome, t, st.dow, idoneita);
    const aMano = typeof _pianoIdoneoAMano === 'function' ? _pianoIdoneoAMano(nome, t) : bozza;
    const diverso = bozza !== (sp.esito !== 'no');
    return { sp: sp, aMano: aMano, diverso: diverso };
  };
  const sel = 'padding:6px 8px;max-width:100%;box-sizing:border-box';
  let h =
    '<div class="main-card" style="margin-top:16px"><div class="card-header">Chi puo fare cosa</div><div style="padding:10px 14px">' +
    '<p style="font-size:var(--fs-md,.875rem);color:var(--muted);margin-bottom:8px">Sola lettura: per ogni turno dice se la bozza puo darlo alla persona e perche, con il posto dove si cambia. "A mano" e il controllo quando si scrive la cella a mano (puo essere piu largo).</p>' +
    '<div class="add-tipo-row" style="margin-bottom:8px">' +
    '<div class="field"><label>Vista</label><select id="pcfc-vista" style="' +
    sel +
    '" onchange="_pcfcStato.vista=this.value;_pcfcRender()"><option value="persona"' +
    (st.vista === 'persona' ? ' selected' : '') +
    '>Per collaboratore</option><option value="turno"' +
    (st.vista === 'turno' ? ' selected' : '') +
    '>Per turno</option></select></div>' +
    (st.vista === 'persona'
      ? '<div class="field"><label>Collaboratore</label><select id="pcfc-nome" style="' +
        sel +
        '" onchange="_pcfcStato.nome=this.value;_pcfcRender()">' +
        persone.map((n) => '<option' + (n === st.nome ? ' selected' : '') + '>' + escP(n) + '</option>').join('') +
        '</select></div>'
      : '<div class="field"><label>Turno</label><select id="pcfc-turno" style="' +
        sel +
        '" onchange="_pcfcStato.turno=this.value;_pcfcRender()">' +
        turni
          .map(
            (t) =>
              '<option value="' +
              escP(t.codice) +
              '"' +
              (t.codice === st.turno ? ' selected' : '') +
              '>' +
              escP(t.codice + ' · ' + (t.gruppo || '-')) +
              '</option>',
          )
          .join('') +
        '</select></div>') +
    '<div class="field"><label>Giorno</label><select id="pcfc-dow" style="' +
    sel +
    '" onchange="_pcfcStato.dow=parseInt(this.value);_pcfcRender()">' +
    [1, 2, 3, 4, 5, 6, 0]
      .map((d) => '<option value="' + d + '"' + (d === st.dow ? ' selected' : '') + '>' + _PCFC_GIORNI[d] + '</option>')
      .join('') +
    '</select></div></div>';
  const tab = (righe, primaCol) =>
    '<div style="overflow-x:auto"><table class="pcfc-tab"><thead><tr><th>' +
    primaCol +
    '</th><th>Bozza</th><th>Perche</th><th>A mano</th><th></th></tr></thead><tbody>' +
    righe.join('') +
    '</tbody></table></div>';
  const cella = (titolo, r) =>
    '<tr><td><b>' +
    titolo +
    '</b></td><td>' +
    _pcfcChip(r.sp.esito) +
    '</td><td>' +
    escP(r.sp.motivo) +
    (r.diverso
      ? ' <span style="color:var(--c-rosso,#c0392b)">(da verificare: la bozza decide diversamente)</span>'
      : '') +
    '</td><td>' +
    (r.aMano === (r.sp.esito !== 'no') ? '<span style="color:var(--muted)">uguale</span>' : r.aMano ? '✓ si' : '✗ no') +
    '</td><td>' +
    (r.sp.dove
      ? '<button class="btn-act" style="padding:2px 8px;white-space:nowrap" onclick="pcfcVai(\'' +
        r.sp.dove +
        '\')">' +
        _PCFC_DOVE[r.sp.dove] +
        '</button>'
      : '') +
    '</td></tr>';
  if (st.vista === 'persona' && st.nome) {
    const info = _pianoCollabInfo(st.nome) || {};
    const lv = typeof _pianoLivelloNelSettore === 'function' ? _pianoLivelloNelSettore(info) : null;
    const sett = _pianoSettoriEffettivi(info);
    h +=
      '<p style="margin:4px 0 8px">' +
      escP(st.nome) +
      ' · funzione ' +
      escP(info.funzione || '-') +
      (lv ? ' · livello L' + lv : '') +
      ' · aree abilitate: ' +
      escP(sett ? sett.join(', ') || 'nessuna' : 'dalla storia dei turni') +
      '</p>';
    const conteggi = { si: 0, serve: 0, no: 0 };
    const righe = turni.map((t) => {
      const r = riga(st.nome, t);
      conteggi[r.sp.esito]++;
      return cella(
        escP(t.codice) + ' <span style="color:var(--muted);font-weight:400">' + escP(t.gruppo || '') + '</span>',
        r,
      );
    });
    h +=
      '<p style="margin-bottom:6px;color:var(--muted)">' +
      conteggi.si +
      ' si, ' +
      conteggi.serve +
      ' solo se serve, ' +
      conteggi.no +
      ' no</p>' +
      tab(righe, 'Turno');
  } else if (st.turno) {
    const t = turni.find((x) => x.codice === st.turno);
    const ris = persone.map((n) => ({ n: n, r: riga(n, t) }));
    const ord = { si: 0, serve: 1, no: 2 };
    ris.sort((a, b) => ord[a.r.sp.esito] - ord[b.r.sp.esito] || a.n.localeCompare(b.n));
    h +=
      '<p style="margin:4px 0 6px;color:var(--muted)">' +
      ris.filter((x) => x.r.sp.esito !== 'no').length +
      ' su ' +
      ris.length +
      ' possono fare ' +
      escP(t.codice) +
      ' di ' +
      _PCFC_GIORNI[st.dow] +
      '</p>' +
      tab(
        ris.map((x) => cella(escP(x.n), x.r)),
        'Collaboratore',
      );
  }
  h += '</div></div>';
  box.innerHTML = h;
}
