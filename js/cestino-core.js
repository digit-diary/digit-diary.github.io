/**
 * Diario Collaboratori · Casino Lugano SA
 * File: cestino.js
 */

// ================================================================
// SEZIONE 6: CESTINO (soft delete)
// Registrazioni e moduli eliminati, ripristino
// ================================================================
// CESTINO
/**
 * Diario Collaboratori · Casino Lugano SA
 * File: cestino-core.js
 * Cestino: soft delete, ripristino, DB stats
 */

let _cestinoModuli = [],
  _cestinoReg = [];
async function caricaCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  try {
    const modDel = await secGet(
      'moduli?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
    );
    const regDel = await secGet(
      'registrazioni?eliminato=eq.true&reparto_dip=eq.' + currentReparto + '&order=eliminato_at.desc',
    );
    _cestinoModuli = modDel || [];
    _cestinoReg = regDel || [];
    renderCestino();
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Errore caricamento cestino</p>';
  }
}
function renderCestino() {
  const el = document.getElementById('cestino-content');
  if (!el) return;
  const ft = (document.getElementById('cestino-filt-tipo') || {}).value || '';
  const fn = (document.getElementById('cestino-filt-nome') || {}).value || '';
  const fc = (document.getElementById('cestino-filt-chi') || {}).value || '';
  const fnl = fn.toLowerCase(),
    fcl = fc.toLowerCase();
  let filtReg = _cestinoReg;
  let filtMod = _cestinoModuli;
  if (ft === 'registrazioni') filtMod = [];
  if (ft === 'moduli') filtReg = [];
  if (fn) {
    filtReg = filtReg.filter(
      (r) => (r.nome || '').toLowerCase().includes(fnl) || (r.testo || '').toLowerCase().includes(fnl),
    );
    filtMod = filtMod.filter((m) => (m.collaboratore || '').toLowerCase().includes(fnl));
  }
  if (fc) {
    filtReg = filtReg.filter((r) => (r.eliminato_da || '').toLowerCase().includes(fcl));
    filtMod = filtMod.filter((m) => (m.eliminato_da || '').toLowerCase().includes(fcl));
  }
  if (!filtMod.length && !filtReg.length) {
    el.innerHTML =
      '<p style="color:#2c6e49;font-weight:600">' +
      (_cestinoModuli.length || _cestinoReg.length ? 'Nessun risultato con i filtri applicati' : 'Cestino vuoto') +
      '</p>';
    return;
  }
  let html = '';
  if (filtReg.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Registrazioni (' + filtReg.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtReg.forEach((r) => {
      const d = r.data ? new Date(r.data).toLocaleDateString('it-IT') : '';
      const delAt = r.eliminato_at
        ? new Date(r.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(r.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:.85rem"><div style="flex:1"><strong>' +
        escP(r.nome || '') +
        '</strong> · <span style="color:var(--muted)">' +
        escP(r.tipo || '') +
        '</span> · ' +
        d +
        '<div style="font-size:.75rem;color:var(--muted)">' +
        escP((r.testo || '').substring(0, 60)) +
        '</div><div style="font-size:.78rem;color:var(--accent)">Eliminato da ' +
        escP(r.eliminato_da || '') +
        ' il ' +
        delAt +
        '</div></div><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:#2c6e49" onclick="ripristinaCestino(\'registrazioni\',' +
        r.id +
        ')">Ripristina</button><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:var(--accent)" onclick="eliminaDefinitivo(\'registrazioni\',' +
        r.id +
        ')">Elimina</button></div>';
    });
    html += '</div>';
  }
  if (filtMod.length) {
    html += '<h5 style="margin:12px 0 8px;color:var(--ink)">Moduli (' + filtMod.length + ')</h5>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    filtMod.forEach((m) => {
      const delAt = m.eliminato_at
        ? new Date(m.eliminato_at).toLocaleDateString('it-IT') +
          ' ' +
          new Date(m.eliminato_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        : '';
      html +=
        '<div style="padding:8px 10px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-size:.85rem"><div style="flex:1"><strong>' +
        escP(m.collaboratore || '') +
        '</strong> · <span style="color:var(--muted)">' +
        escP(m.tipo || '') +
        '</span> · ' +
        escP(m.data_modulo || '') +
        '<div style="font-size:.78rem;color:var(--accent)">Eliminato da ' +
        escP(m.eliminato_da || '') +
        ' il ' +
        delAt +
        '</div></div><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:#2c6e49" onclick="ripristinaCestino(\'moduli\',' +
        m.id +
        ')">Ripristina</button><button class="btn-salva" style="font-size:.75rem;padding:4px 10px;background:var(--accent)" onclick="eliminaDefinitivo(\'moduli\',' +
        m.id +
        ')">Elimina</button></div>';
    });
    html += '</div>';
  }
  html +=
    '<div style="margin-top:16px;display:flex;gap:8px"><button class="btn-salva" style="background:var(--accent);font-size:.82rem;padding:8px 16px" onclick="svuotaCestino()">Svuota cestino</button></div>';
  el.innerHTML = html;
}
async function ripristinaCestino(tabella, id) {
  if (!confirm('Ripristinare questo elemento?')) return;
  try {
    await secPatch(tabella, 'id=eq.' + id, { eliminato: false, eliminato_da: null, eliminato_at: null });
    if (tabella === 'moduli') {
      const m = _cestinoModuli.find((x) => x.id === id);
      if (m) {
        m.eliminato = false;
        m.eliminato_da = null;
        m.eliminato_at = null;
        moduliCache.push(m);
        _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
      }
    } else {
      const r = _cestinoReg.find((x) => x.id === id);
      if (r) {
        r.eliminato = false;
        r.eliminato_da = null;
        r.eliminato_at = null;
        datiCache.unshift(r);
        _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
      }
    }
    logAzione('Ripristinato da cestino', tabella + ' ID ' + id);
    renderCestino();
    aggiornaNomi();
    render();
    updateStats();
    renderCassaAlerts();
    renderRischioAlerts();
    renderAmmonimentiAlerts();
    aggiornaModuliLista();
    toast('Ripristinato!');
  } catch (e) {
    toast('Errore ripristino');
  }
}
async function eliminaDefinitivo(tabella, id) {
  // CONSERVAZIONE (regolamento aziendale / RAP): un record dell'archivio degli
  // ultimi N anni non si cancella. Restano eliminabili le voci inserite da poco
  // (correzioni di battitura), che archivio non sono.
  const rec = tabella === 'moduli' ? _cestinoModuli.find((x) => x.id === id) : _cestinoReg.find((x) => x.id === id);
  const dataRec = rec ? rec.data || rec.data_modulo || rec.created_at : null;
  if (typeof inArchivioProtetto === 'function' && dataRec && inArchivioProtetto(dataRec)) {
    alert(
      "Non si puo' eliminare definitivamente.\n\nQuesta voce fa parte dell'archivio da conservare per " +
        conservazioneAnni() +
        " anni (regolamento aziendale).\n\nResta nel Cestino e si puo' ripristinare in qualsiasi momento.",
    );
    return;
  }
  if (!confirm('Eliminare DEFINITIVAMENTE? Non potrà essere recuperato.')) return;
  try {
    await secDel(tabella, 'id=eq.' + id);
    if (tabella === 'moduli') _cestinoModuli = _cestinoModuli.filter((x) => x.id !== id);
    else _cestinoReg = _cestinoReg.filter((x) => x.id !== id);
    logAzione('Eliminato definitivamente', tabella + ' ID ' + id);
    renderCestino();
    toast('Eliminato definitivamente');
  } catch (e) {
    toast('Errore eliminazione');
  }
}
async function svuotaCestino() {
  const tot = _cestinoModuli.length + _cestinoReg.length;
  if (!tot) {
    toast('Cestino già vuoto');
    return;
  }
  // CONSERVAZIONE: si svuota solo cio' che NON e' archivio protetto; le voci
  // degli ultimi N anni restano nel Cestino e si possono sempre ripristinare
  const protetto = (r) =>
    typeof inArchivioProtetto === 'function' && inArchivioProtetto(r.data || r.data_modulo || r.created_at);
  const modOk = _cestinoModuli.filter((m) => !protetto(m));
  const regOk = _cestinoReg.filter((r) => !protetto(r));
  const nProt = tot - modOk.length - regOk.length;
  if (!modOk.length && !regOk.length) {
    alert(
      'Niente da svuotare.\n\nTutte le ' +
        tot +
        " voci nel Cestino fanno parte dell'archivio da conservare per " +
        conservazioneAnni() +
        ' anni (regolamento aziendale): restano disponibili e si possono ripristinare.',
    );
    return;
  }
  if (
    !confirm(
      'Svuotare il cestino? ' +
        (modOk.length + regOk.length) +
        ' element' +
        (modOk.length + regOk.length === 1 ? 'o verra' : 'i verranno') +
        ' eliminat' +
        (modOk.length + regOk.length === 1 ? 'o' : 'i') +
        ' DEFINITIVAMENTE.' +
        (nProt
          ? '\n\n' +
            nProt +
            " voci NON vengono toccate: fanno parte dell'archivio da conservare per " +
            conservazioneAnni() +
            ' anni.'
          : ''),
    )
  )
    return;
  try {
    for (const m of modOk) {
      await secDel('moduli', 'id=eq.' + m.id);
    }
    for (const r of regOk) {
      await secDel('registrazioni', 'id=eq.' + r.id);
    }
    logAzione(
      'Cestino svuotato',
      modOk.length + regOk.length + ' elementi eliminati definitivamente' + (nProt ? ', ' + nProt + ' protetti' : ''),
    );
    const idsM = new Set(modOk.map((m) => m.id));
    const idsR = new Set(regOk.map((r) => r.id));
    _cestinoModuli = _cestinoModuli.filter((m) => !idsM.has(m.id));
    _cestinoReg = _cestinoReg.filter((r) => !idsR.has(r.id));
    renderCestino();
    toast('Cestino svuotato' + (nProt ? ' (' + nProt + ' voci protette restano)' : ''));
  } catch (e) {
    toast('Errore svuotamento');
  }
}
// ===== SISTEMAZIONE GUIDATA DEI DATI =====
// Due strumenti richiamati dal controllo salute: assegnare l'impiego a chi
// non ce l'ha e sistemare i nomi che hanno turni ma nessuna scheda.
async function apriFixImpiego() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tutti =
    (await secGet(
      'collaboratori?select=id,nome,reparto_dip,is_jolly,percentuale,funzione,impiego,attivo&limit=2000',
    )) || [];
  const senza = tutti
    .filter((c) => c.attivo !== false && !c.impiego)
    .sort((a, b) => (a.reparto_dip || '').localeCompare(b.reparto_dip || '') || a.nome.localeCompare(b.nome));
  if (!senza.length) {
    el.innerHTML =
      '<p style="color:#2c6e49;font-weight:700">Tutti i collaboratori attivi hanno gia&#39; l&#39;impiego indicato.</p>';
    return;
  }
  let h =
    '<p style="font-size:.85rem;margin-bottom:10px"><b>' +
    senza.length +
    ' collaboratori senza impiego.</b> La proposta qui sotto &egrave; gi&agrave; compilata in base al vecchio campo del piano: correggi le righe sbagliate e salva. Serve per i recuperi festivi (CGF) e per i limiti di ore.</p>' +
    '<div style="margin-bottom:10px"><button class="btn-salva" style="font-size:.8rem;padding:6px 14px" onclick="salvaFixImpiego()">Salva tutti</button> ' +
    '<button class="btn-export" style="font-size:.8rem;padding:6px 14px" onclick="controlloSalute()">Annulla</button></div>';
  let repCorr = '';
  senza.forEach((c) => {
    const rep = c.reparto_dip || 'slots';
    if (rep !== repCorr) {
      repCorr = rep;
      h +=
        '<p style="font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:12px 0 4px">' +
        escP(repartoLabel(rep)) +
        '</p>';
    }
    h +=
      '<div style="display:flex;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">' +
      '<span style="flex:1;font-size:.85rem">' +
      escP(c.nome) +
      ' <span style="color:var(--muted);font-size:.76rem">' +
      escP(c.funzione || '-') +
      ' &middot; ' +
      Math.round((parseFloat(c.percentuale) || 1) * 100) +
      '%</span></span>' +
      '<select data-fix-imp="' +
      c.id +
      '" style="font-size:.8rem;padding:3px 8px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)">' +
      '<option value="fisso"' +
      (c.is_jolly ? '' : ' selected') +
      '>Fisso</option>' +
      '<option value="jolly"' +
      (c.is_jolly ? ' selected' : '') +
      '>Jolly</option>' +
      '<option value="">Non indicare</option></select></div>';
  });
  el.innerHTML = h;
}
async function salvaFixImpiego() {
  const sel = [...document.querySelectorAll('[data-fix-imp]')];
  if (!sel.length) return;
  if (!confirm("Salvo l'impiego di " + sel.length + ' collaboratori?')) return;
  let n = 0;
  for (const s of sel) {
    const id = parseInt(s.dataset.fixImp);
    const val = s.value;
    if (!val) continue;
    try {
      await secPatch('collaboratori', 'id=eq.' + id, { impiego: val, is_jolly: val === 'jolly' });
      const c = collaboratoriCache.find((x) => x.id === id);
      if (c) {
        c.impiego = val;
        c.is_jolly = val === 'jolly';
      }
      n++;
    } catch (e) {}
  }
  logAzione('Impiego assegnato in blocco', n + ' collaboratori');
  toast('Impiego salvato per ' + n + ' collaboratori');
  controlloSalute();
}
// I disattivati con mesi interi di soli riposi (C/V/WD senza commento) sono
// righe di riempimento arrivate dagli import Excel: si tolgono dal piano,
// i mesi con turni veri restano come storia di lavoro
async function pulisciPianoDisattivati() {
  try {
    const [collab, righe] = await Promise.all([
      secGet('collaboratori?select=nome,attivo&limit=2000'),
      secGet('piano?select=id,collaboratore,data,codice,commento&limit=40000'),
    ]);
    const inattivi = new Set((collab || []).filter((c) => c.attivo === false).map((c) => (c.nome || '').toLowerCase()));
    const isRiposo = (cod) => {
      if (cod === 'C' || cod === 'V' || cod === 'WD') return true;
      const cs = typeof _pianoCodiceInfo === 'function' ? _pianoCodiceInfo(cod) : null;
      return !!(cs && cs.is_riposo);
    };
    const mesi = {};
    (righe || []).forEach((r) => {
      if (!inattivi.has((r.collaboratore || '').toLowerCase())) return;
      const k = r.collaboratore + '|' + String(r.data).substring(0, 7);
      if (!mesi[k]) mesi[k] = { ids: [], solo: true };
      mesi[k].ids.push(r.id);
      if (!isRiposo(r.codice) || (r.commento || '').trim()) mesi[k].solo = false;
    });
    const daPulire = Object.entries(mesi).filter(([, v]) => v.solo);
    if (!daPulire.length) {
      toast('Niente da pulire: nessun mese di soli riposi tra i disattivati');
      return;
    }
    const perNome = {};
    daPulire.forEach(([k]) => {
      const [n, m] = k.split('|');
      (perNome[n] = perNome[n] || []).push(m);
    });
    const elenco = Object.entries(perNome)
      .map(([n, ms]) => '• ' + n + ': ' + ms.sort().join(', '))
      .join('\n');
    const totIds = daPulire.reduce((s, [, v]) => s + v.ids.length, 0);
    if (
      !confirm(
        'Questi mesi contengono SOLO riposi (C/V) senza commenti: sono righe di riempimento degli import, non storia di lavoro.\n\n' +
          elenco +
          '\n\nTogliere queste ' +
          totIds +
          ' celle dal piano? I mesi con turni veri restano.',
      )
    )
      return;
    const ids = daPulire.flatMap(([, v]) => v.ids);
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map((id) => secDel('piano', 'id=eq.' + id)));
    }
    if (typeof _pianoRighe !== 'undefined') {
      const idsSet = new Set(ids);
      _pianoRighe = _pianoRighe.filter((r) => !idsSet.has(r.id));
    }
    logAzione(
      'Pulizia piani disattivati',
      totIds + ' celle di solo riposo tolte (' + Object.keys(perNome).length + ' collaboratori)',
    );
    toast('Tolte ' + totIds + ' celle di riempimento');
    controlloSalute();
  } catch (e) {
    toast('Errore pulizia: ' + (e.message || ''));
  }
}
// ===== CONGEDO NON PAGATO E GIUBILEI =====
// Un mese intero senza turni e senza assenze retribuite (solo C) e' congedo non
// pagato: non matura anzianita', quindi sposta in avanti i giubilei. Qui si
// leggono dal piano i mesi cosi' fatti e si propone di registrarli sulla scheda.
// Elenco compatto per inserire le date di nascita mancanti: servono per i
// compleanni (nota nel piano) e per gli auguri. Si compila e si salva tutto
// insieme, senza aprire la scheda di ognuno.
async function apriFixDateNascita() {
  const mancanti = (collaboratoriCache || [])
    .filter((c) => c.attivo !== false && !c.data_nascita && !/^sig\.|^cognome/i.test(c.nome))
    .sort((a, b) => (a.reparto_dip || '').localeCompare(b.reparto_dip || '') || a.nome.localeCompare(b.nome));
  const b = document.getElementById('pwd-modal-content');
  if (!mancanti.length) {
    alert('Tutti i collaboratori attivi hanno la data di nascita.');
    return;
  }
  let h =
    '<h3>Date di nascita mancanti (' +
    mancanti.length +
    ')</h3><p style="font-size:.85rem;color:var(--muted);margin-bottom:8px">Scrivi giorno e mese (per esempio 02.03) oppure la data completa (02.03.1985). Servono per i compleanni: il giorno del compleanno il piano segna il congedo con la nota. Si salvano solo le righe compilate.</p>' +
    '<div style="max-height:52vh;overflow:auto"><table class="piano-table" style="min-width:100%;font-size:.9rem"><thead><tr><th style="text-align:left">Collaboratore</th><th>Settore</th><th>Data di nascita</th></tr></thead><tbody>';
  mancanti.forEach((c) => {
    h +=
      '<tr><td style="text-align:left;font-weight:600">' +
      escP(c.nome) +
      '</td><td style="font-size:.85rem;color:var(--muted)">' +
      escP(repartoLabel(c.reparto_dip || 'slots')) +
      '</td><td><input type="text" data-nasc-id="' +
      c.id +
      '" placeholder="gg.mm" style="width:110px;padding:4px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink);text-align:center"></td></tr>';
  });
  h +=
    '</tbody></table></div><div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button><button class="btn-modal-ok" onclick="salvaFixDateNascita()">Salva le date inserite</button></div>';
  b.innerHTML = h;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaFixDateNascita() {
  const campi = [...document.querySelectorAll('input[data-nasc-id]')].filter((i) => i.value.trim());
  if (!campi.length) {
    toast('Nessuna data inserita');
    return;
  }
  let ok = 0;
  const errori = [];
  for (const inp of campi) {
    const v = inp.value.trim();
    const m = v.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
    if (!m) {
      errori.push(v);
      continue;
    }
    const gg = String(parseInt(m[1])).padStart(2, '0');
    const mm = String(parseInt(m[2])).padStart(2, '0');
    let anno = m[3] ? parseInt(m[3]) : 1900;
    if (anno < 100) anno += anno > 30 ? 1900 : 2000;
    const iso = anno + '-' + mm + '-' + gg;
    try {
      await secPatch('collaboratori', 'id=eq.' + inp.dataset.nascId, { data_nascita: iso });
      const c = collaboratoriCache.find((x) => String(x.id) === String(inp.dataset.nascId));
      if (c) c.data_nascita = iso;
      ok++;
    } catch (e) {
      errori.push(v);
    }
  }
  logAzione('Date di nascita inserite', ok + ' collaboratori');
  document.getElementById('pwd-modal').classList.add('hidden');
  toast(ok + ' date salvate' + (errori.length ? ', ' + errori.length + ' non valide' : ''));
  if (errori.length)
    alert('Non ho capito questi valori: ' + errori.join(', ') + '\n\nUsa il formato gg.mm oppure gg.mm.aaaa');
  if (typeof controlloSalute === 'function') controlloSalute();
}
async function pianoRilevaCongedoNonPagato() {
  try {
    const [collab, righe] = await Promise.all([
      secGet('collaboratori?select=id,nome,attivo,data_assunzione,mesi_congedo_non_pagato&limit=2000'),
      secGet('piano?select=collaboratore,data,codice,commento&limit=40000'),
    ]);
    const perMese = {};
    (righe || []).forEach((r) => {
      const k = r.collaboratore + '|' + String(r.data).substring(0, 7);
      if (!perMese[k]) perMese[k] = { tot: 0, soloC: true };
      perMese[k].tot++;
      const cod = String(r.codice || '').toUpperCase();
      if (cod !== 'C' || (r.commento || '').trim()) perMese[k].soloC = false;
    });
    const fermiDi = {};
    Object.keys(perMese).forEach((k) => {
      const [nome, ym] = k.split('|');
      const m = perMese[k];
      // mese "pieno" di sole C: almeno 26 celle, tutte C senza commento
      if (m.soloC && m.tot >= 26) (fermiDi[nome] = fermiDi[nome] || []).push(ym);
    });
    const proposte = (collab || [])
      .filter((c) => fermiDi[c.nome] && fermiDi[c.nome].length)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        attivo: c.attivo,
        mesi: fermiDi[c.nome].sort(),
        attuale: parseInt(c.mesi_congedo_non_pagato) || 0,
      }))
      .filter((x) => x.mesi.length !== x.attuale);
    if (!proposte.length) {
      alert(
        'Nessun congedo non pagato da registrare.\n\nNel piano non risultano mesi interi di sola "C" diversi da quanto gia\' segnato nelle schede.',
      );
      return;
    }
    const elenco = proposte
      .slice(0, 20)
      .map(
        (x) =>
          '• ' +
          x.nome +
          ': ' +
          x.mesi.length +
          ' mes' +
          (x.mesi.length === 1 ? 'e' : 'i') +
          ' (' +
          x.mesi.join(', ') +
          ')' +
          (x.attuale ? ' — ora segnati ' + x.attuale : ''),
      )
      .join('\n');
    if (
      !confirm(
        'CONGEDO NON PAGATO (mesi interi di sola "C" nel piano)\n\n' +
          elenco +
          (proposte.length > 20 ? '\n... e altri ' + (proposte.length - 20) : '') +
          "\n\nRegistro questi mesi sulle schede? I giubilei si sposteranno in avanti di altrettanto.\n\nATTENZIONE: il piano copre solo gli anni presenti nel programma. I congedi piu' vecchi vanno aggiunti a mano nella scheda del collaboratore.",
      )
    )
      return;
    let fatti = 0;
    for (const x of proposte) {
      try {
        await secPatch('collaboratori', 'id=eq.' + x.id, { mesi_congedo_non_pagato: x.mesi.length });
        const c = collaboratoriCache.find((y) => y.id === x.id);
        if (c) c.mesi_congedo_non_pagato = x.mesi.length;
        fatti++;
      } catch (e) {}
    }
    logAzione('Congedo non pagato registrato', fatti + ' collaboratori aggiornati');
    toast(fatti + ' schede aggiornate: i giubilei tengono conto dei mesi fermi');
    controlloSalute();
  } catch (e) {
    toast('Errore rilevamento: ' + (e.message || ''));
  }
}
async function apriFixOrfani() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const [collab, righe] = await Promise.all([
    secGet('collaboratori?select=nome,attivo,reparto_dip&limit=2000'),
    secGet('piano?select=collaboratore,data,reparto_dip&limit=40000'),
  ]);
  const esiste = new Set((collab || []).map((c) => c.nome.toLowerCase()));
  const orf = {};
  (righe || []).forEach((r) => {
    if (esiste.has(r.collaboratore.toLowerCase())) return;
    const o = (orf[r.collaboratore] = orf[r.collaboratore] || {
      n: 0,
      rep: r.reparto_dip || 'slots',
      da: r.data,
      a: r.data,
    });
    o.n++;
    if (r.data < o.da) o.da = r.data;
    if (r.data > o.a) o.a = r.data;
  });
  const lista = Object.entries(orf).sort((a, b) => b[1].n - a[1].n);
  if (!lista.length) {
    el.innerHTML =
      '<p style="color:#2c6e49;font-weight:700">Nessun nome senza scheda: tutti i turni appartengono a un collaboratore.</p>';
    return;
  }
  const attivi = (collab || [])
    .filter((c) => c.attivo !== false)
    .map((c) => c.nome)
    .sort();
  let h =
    '<p style="font-size:.85rem;margin-bottom:10px"><b>' +
    lista.length +
    ' nomi hanno turni ma nessuna scheda.</b> Per ognuno puoi creare la scheda, spostare i turni su un collaboratore esistente (se &egrave; un nome scritto male) oppure eliminare i turni se non &egrave; una persona.</p>' +
    '<div style="margin-bottom:10px"><button class="btn-export" style="font-size:.8rem;padding:6px 14px" onclick="controlloSalute()">Torna al controllo</button></div>';
  lista.forEach(([nome, o], i) => {
    const nomeJs = nome.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    h +=
      '<div style="padding:8px 0;border-bottom:1px solid var(--line)">' +
      '<b style="font-size:.9rem">' +
      escP(nome) +
      '</b> <span style="font-size:.78rem;color:var(--muted)">' +
      o.n +
      ' turni &middot; ' +
      escP(repartoLabel(o.rep)) +
      ' &middot; dal ' +
      o.da.split('-').reverse().join('.') +
      ' al ' +
      o.a.split('-').reverse().join('.') +
      '</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">' +
      '<button class="btn-export" style="font-size:.76rem;padding:4px 10px;border-color:#2c6e49;color:#2c6e49" onclick="orfanoCreaScheda(\'' +
      nomeJs +
      "','" +
      o.rep +
      '\')">Crea la scheda</button>' +
      '<select id="orf-dest-' +
      i +
      '" style="font-size:.76rem;padding:3px 6px;border:1px solid var(--line);border-radius:2px;background:var(--paper);color:var(--ink)"><option value="">sposta i turni su...</option>' +
      attivi.map((n) => '<option value="' + escP(n) + '">' + escP(n) + '</option>').join('') +
      '</select>' +
      '<button class="btn-export" style="font-size:.76rem;padding:4px 10px" onclick="orfanoSposta(\'' +
      nomeJs +
      "'," +
      i +
      ')">Sposta</button>' +
      '<button class="btn-export" style="font-size:.76rem;padding:4px 10px;border-color:#c0392b;color:#c0392b" onclick="orfanoElimina(\'' +
      nomeJs +
      "'," +
      o.n +
      ')">Elimina i turni</button></div></div>';
  });
  el.innerHTML = h;
}
async function orfanoCreaScheda(nome, rep) {
  if (
    !confirm(
      'Creo la scheda di "' +
        nome +
        '" nel settore ' +
        repartoLabel(rep) +
        '?\n\nI suoi turni resteranno dove sono e da ora verranno conteggiati.',
    )
  )
    return;
  try {
    const r = await secPost('collaboratori', { nome: nome, attivo: true, reparto_dip: rep, percentuale: 1 });
    if (r && r[0]) collaboratoriCache.push(r[0]);
    logAzione('Collaboratore creato da turni orfani', nome + ' (' + rep + ')');
    toast('Scheda creata: ' + nome);
    apriFixOrfani();
  } catch (e) {
    toast('Errore creazione scheda');
  }
}
async function orfanoSposta(nome, idx) {
  const sel = document.getElementById('orf-dest-' + idx);
  const dest = sel ? sel.value : '';
  if (!dest) {
    toast('Scegli prima su chi spostare i turni');
    return;
  }
  if (
    !confirm(
      'Sposto tutti i turni di "' + nome + '" su "' + dest + '"?\n\nSi usa quando il nome era scritto in modo diverso.',
    )
  )
    return;
  try {
    await secPatch('piano', 'collaboratore=eq.' + encodeURIComponent(nome), { collaboratore: dest });
    logAzione('Turni riassegnati', nome + ' -> ' + dest);
    toast('Turni spostati su ' + dest);
    apriFixOrfani();
  } catch (e) {
    toast('Errore spostamento turni');
  }
}
async function orfanoElimina(nome, n) {
  if (
    !confirm(
      'ATTENZIONE: elimino ' +
        n +
        ' turni intestati a "' +
        nome +
        "\".\n\nDa fare solo se non e' una persona (righe rimaste da vecchie importazioni). L'operazione non si annulla.",
    )
  )
    return;
  if (!confirm("Confermi definitivamente l'eliminazione dei " + n + ' turni di "' + nome + '"?')) return;
  try {
    await secDel('piano', 'collaboratore=eq.' + encodeURIComponent(nome));
    logAzione('Turni orfani eliminati', nome + ' (' + n + ' righe)');
    toast(n + ' turni eliminati');
    apriFixOrfani();
  } catch (e) {
    toast('Errore eliminazione');
  }
}
// ===== CONTROLLO SALUTE DEL SISTEMA =====
// Verifiche automatiche sui dati: l'app segnala da sola le incoerenze che
// altrimenti nessuno vedrebbe (schede incomplete, turni orfani, festivi
// mancanti per l'anno prossimo...). Solo lettura: non modifica niente.
async function controlloSalute() {
  const el = document.getElementById('salute-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Controllo in corso...</p>';
  const esiti = [];
  const add = (stato, titolo, dettaglio, azione) => esiti.push({ stato, titolo, dettaglio, azione });
  try {
    const oggi = new Date();
    const ym = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0');
    const annoPross = oggi.getFullYear() + 1;
    const [collab, righe, festivi, turni] = await Promise.all([
      secGet(
        'collaboratori?select=nome,attivo,impiego,is_jolly,reparto_dip,reparti_extra,percentuale,mesi_congedo_non_pagato,data_nascita&limit=2000',
      ),
      secGet('piano?data=gte.' + ym + '-01&limit=20000'),
      secGet('piano_festivi?select=data&limit=500'),
      secGet('piano_turni?select=codice,reparto_dip,attivo&limit=500'),
    ]);
    const attivi = (collab || []).filter((c) => c.attivo !== false);
    const perNome = {};
    (collab || []).forEach((c) => (perNome[c.nome.toLowerCase()] = c));

    // 1) impiego non indicato (serve per CGF, limiti ore, report)
    const senzaImpiego = attivi.filter((c) => !c.impiego);
    add(
      senzaImpiego.length ? 'ko' : 'ok',
      'Impiego (fisso o jolly) indicato',
      senzaImpiego.length
        ? senzaImpiego.length +
            ' collaboratori attivi senza impiego: ' +
            senzaImpiego
              .slice(0, 6)
              .map((c) => c.nome)
              .join(', ') +
            (senzaImpiego.length > 6 ? ' e altri' : '') +
            '. Senza questo dato i CGF e i limiti di ore non si calcolano correttamente.'
        : "Tutti i collaboratori attivi hanno l'impiego indicato.",
      senzaImpiego.length ? "FIX:apriFixImpiego()|Assegna l'impiego adesso" : '',
    );

    // 2) i due campi impiego/jolly in contraddizione
    const contrad = attivi.filter(
      (c) => (c.impiego === 'fisso' && c.is_jolly) || (c.impiego === 'jolly' && !c.is_jolly),
    );
    add(
      contrad.length ? 'attenzione' : 'ok',
      'Coerenza fisso/jolly',
      contrad.length
        ? contrad.map((c) => c.nome).join(', ') + ": la scheda dice una cosa e il piano un'altra."
        : 'Nessuna contraddizione tra scheda e piano.',
      contrad.length ? 'Gestione Collaboratori' : '',
    );

    // 3) turni di persone che non esistono in anagrafica
    const orfani = [...new Set((righe || []).map((r) => r.collaboratore).filter((n) => !perNome[n.toLowerCase()]))];
    add(
      orfani.length ? 'ko' : 'ok',
      'Turni collegati a una scheda',
      orfani.length
        ? orfani.slice(0, 6).join(', ') + ': hanno turni nel piano ma non esistono in Gestione collaboratori.'
        : 'Ogni turno del piano appartiene a un collaboratore esistente.',
      orfani.length ? 'FIX:apriFixOrfani()|Sistema questi nomi' : '',
    );

    // 3-bis) congedo non pagato: mesi interi di sola C che non maturano anzianita'
    const perMeseC = {};
    (righe || []).forEach((r) => {
      const k = r.collaboratore + '|' + String(r.data).substring(0, 7);
      if (!perMeseC[k]) perMeseC[k] = { tot: 0, soloC: true };
      perMeseC[k].tot++;
      if (String(r.codice || '').toUpperCase() !== 'C') perMeseC[k].soloC = false;
    });
    const fermi = {};
    Object.keys(perMeseC).forEach((k) => {
      const [nome] = k.split('|');
      if (perMeseC[k].soloC && perMeseC[k].tot >= 26) fermi[nome] = (fermi[nome] || 0) + 1;
    });
    const daRegistrare = Object.keys(fermi).filter((n) => {
      const c = perNome[n.toLowerCase()];
      return c && (parseInt(c.mesi_congedo_non_pagato) || 0) !== fermi[n];
    });
    add(
      daRegistrare.length ? 'attenzione' : 'ok',
      'Congedo non pagato e giubilei',
      daRegistrare.length
        ? daRegistrare.slice(0, 6).join(', ') +
            ': nel piano risultano mesi interi senza lavoro (solo C). Sono congedo non pagato e non maturano anzianita, quindi spostano in avanti i giubilei.'
        : 'I mesi di congedo non pagato risultano registrati sulle schede.',
      daRegistrare.length ? 'FIX:pianoRilevaCongedoNonPagato()|Registra i mesi di congedo' : '',
    );

    // 3-ter) date di nascita mancanti (servono per i compleanni)
    const senzaNascita = attivi.filter((c) => !c.data_nascita && !/^sig\.|^cognome/i.test(c.nome));
    add(
      senzaNascita.length ? 'attenzione' : 'ok',
      'Date di nascita per i compleanni',
      senzaNascita.length
        ? senzaNascita.length +
            ' collaboratori attivi senza data di nascita (' +
            senzaNascita
              .slice(0, 5)
              .map((c) => c.nome)
              .join(', ') +
            (senzaNascita.length > 5 ? ' e altri' : '') +
            '). Senza la data il compleanno non viene segnato nel piano.'
        : 'Tutti hanno la data di nascita.',
      senzaNascita.length ? 'FIX:apriFixDateNascita()|Inserisci le date mancanti' : '',
    );

    // 4) disattivati che hanno ancora turni
    const disattiviConTurni = [
      ...new Set(
        (righe || [])
          .map((r) => perNome[r.collaboratore.toLowerCase()])
          .filter((c) => c && c.attivo === false)
          .map((c) => c.nome),
      ),
    ];
    add(
      disattiviConTurni.length ? 'attenzione' : 'ok',
      'Collaboratori disattivati senza turni',
      disattiviConTurni.length
        ? disattiviConTurni.slice(0, 6).join(', ') +
            ': risultano disattivati ma hanno turni pianificati. Se sono mesi di soli riposi (righe di riempimento degli import) si tolgono col bottone qui sotto; se invece devono lavorare vanno riattivati in Gestione Collaboratori.'
        : 'Nessun disattivato ha turni pianificati.',
      disattiviConTurni.length ? 'FIX:pulisciPianoDisattivati()|Togli i mesi di solo riposo' : '',
    );

    // 5) turni in un settore non suo e senza copertura configurata
    const fuoriSettore = [
      ...new Set(
        (righe || [])
          .filter((r) => {
            const c = perNome[r.collaboratore.toLowerCase()];
            if (!c) return false;
            const suo = c.reparto_dip || 'slots';
            const rep = r.reparto_dip || 'slots';
            if (suo === rep) return false;
            return !String(c.reparti_extra || '')
              .split(',')
              .map((x) => x.trim())
              .includes(rep);
          })
          .map((r) => r.collaboratore),
      ),
    ];
    add(
      fuoriSettore.length ? 'attenzione' : 'ok',
      'Turni nel settore giusto',
      fuoriSettore.length
        ? fuoriSettore.slice(0, 6).join(', ') +
            ": hanno turni in un settore che non e' il loro e senza copertura configurata."
        : 'Nessun turno in un settore non previsto.',
      fuoriSettore.length ? 'Gestione Collaboratori' : '',
    );

    // 6) festivi dell'anno prossimo
    const haFestiviPross = (festivi || []).some((f) => String(f.data).startsWith(String(annoPross)));
    add(
      haFestiviPross ? 'ok' : 'attenzione',
      "Giorni festivi dell'anno prossimo",
      haFestiviPross
        ? 'I festivi ' + annoPross + " sono gia' in archivio."
        : 'Mancano i festivi ' + annoPross + ": si creano da soli aprendo Piano → Festivi con quell'anno selezionato.",
      haFestiviPross ? '' : 'Piano · Festivi',
    );

    // 7) sigle turno usate da piu' settori (fonte di confusione nei briefing)
    const perCodice = {};
    (turni || [])
      .filter((t) => t.attivo !== false)
      .forEach((t) => {
        (perCodice[t.codice] = perCodice[t.codice] || new Set()).add(t.reparto_dip || 'slots');
      });
    const doppi = Object.entries(perCodice).filter(([, s]) => s.size > 1);
    add(
      doppi.length ? 'info' : 'ok',
      "Sigle turno uguali in piu' settori",
      doppi.length
        ? doppi.map(([c, s]) => c + ' (' + [...s].join(', ') + ')').join(' · ') +
            '. Il programma li tiene separati, ma attenzione quando si leggono i piani.'
        : 'Nessuna sigla usata da due settori.',
      '',
    );

    // 8) schede di prova rimaste
    const prova = attivi.filter((c) => /^(sig\.|test|mario rossi|zztest)/i.test(c.nome.trim()));
    add(
      prova.length ? 'attenzione' : 'ok',
      'Schede di prova',
      prova.length
        ? prova.map((c) => c.nome).join(', ') + ': sembrano schede segnaposto ancora attive.'
        : 'Nessuna scheda di prova attiva.',
      prova.length ? 'Gestione Collaboratori' : '',
    );

    const ko = esiti.filter((e) => e.stato === 'ko').length;
    const att = esiti.filter((e) => e.stato === 'attenzione').length;
    const col = { ok: '#2c6e49', attenzione: '#e67e22', ko: '#c0392b', info: '#1a4a7a' };
    const lbl = { ok: 'OK', attenzione: 'DA VEDERE', ko: 'DA SISTEMARE', info: 'NOTA' };
    let h =
      '<p style="font-size:.85rem;margin-bottom:10px"><b>' +
      (ko || att ? ko + ' da sistemare, ' + att + ' da vedere' : 'Tutto in ordine') +
      '</b> · controllo del ' +
      new Date().toLocaleString('it-CH') +
      '</p>';
    esiti.forEach((e) => {
      h +=
        '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)">' +
        '<span style="flex:0 0 auto;font-size:.75rem;font-weight:700;letter-spacing:.04em;color:#fff;background:' +
        col[e.stato] +
        ';padding:2px 7px;border-radius:3px;margin-top:2px">' +
        lbl[e.stato] +
        '</span><div style="flex:1"><b style="font-size:.88rem">' +
        escP(e.titolo) +
        '</b><br><span style="font-size:.82rem;color:var(--muted)">' +
        escP(e.dettaglio) +
        '</span>' +
        (e.azione
          ? e.azione.indexOf('FIX:') === 0
            ? '<br><button class="btn-export" style="font-size:.76rem;padding:4px 12px;margin-top:5px;border-color:#1a4a7a;color:#1a4a7a" onclick="' +
              e.azione.split('|')[0].substring(4) +
              '">' +
              escP(e.azione.split('|')[1] || 'Sistema') +
              '</button>'
            : '<br><span style="font-size:.78rem;color:#1a4a7a;font-weight:700">Dove sistemarlo: ' +
              escP(e.azione) +
              '</span>'
          : '') +
        '</div></div>';
    });
    el.innerHTML = h;
  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent)">Errore durante il controllo: ' + escP(e.message || '') + '</p>';
  }
}
async function caricaDbStats() {
  const el = document.getElementById('db-stats-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted)">Caricamento...</p>';
  const tk = getAdminToken();
  if (!tk) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun token admin. Esci e rientra come admin.</p>';
    return;
  }
  const rpcR = await fetch(SB_URL + '/rest/v1/rpc/get_db_stats', {
    method: 'POST',
    headers: sbH(),
    body: JSON.stringify({ p_token: tk }),
  });
  if (!rpcR.ok) {
    const errTxt = await rpcR.text();
    console.error('DB stats error:', errTxt);
    if (errTxt.includes('Solo admin')) {
      el.innerHTML = '<p style="color:var(--accent)">Sessione admin scaduta. Esci e rientra come admin.</p>';
    } else {
      el.innerHTML = '<p style="color:var(--accent)">Errore: ' + (JSON.parse(errTxt).message || 'sconosciuto') + '</p>';
    }
    return;
  }
  const r = await rpcR.json();
  if (!r) {
    el.innerHTML = '<p style="color:var(--accent)">Nessun dato ricevuto</p>';
    return;
  }
  const sizeMatch = (r.db_size || '').match(/([\d.]+)\s*(MB|GB|kB)/);
  let usedMB = 0;
  if (sizeMatch) {
    usedMB = parseFloat(sizeMatch[1]);
    if (sizeMatch[2] === 'GB') usedMB *= 1024;
    if (sizeMatch[2] === 'kB') usedMB /= 1024;
  }
  const pct = Math.min(Math.round((usedMB / 500) * 100), 100);
  const barColor = pct >= 90 ? 'var(--accent)' : pct >= 70 ? '#e67e22' : '#2c6e49';
  let h =
    '<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong>' +
    r.db_size +
    ' / 500 MB</strong><span style="color:' +
    barColor +
    ';font-weight:700">' +
    pct +
    '%</span></div>';
  h +=
    '<div style="background:var(--line);border-radius:4px;height:8px;overflow:hidden"><div style="background:' +
    barColor +
    ';height:100%;width:' +
    pct +
    '%;border-radius:4px;transition:width .5s"></div></div></div>';
  const tables = r.tables || [];
  const labelMap = {
    registrazioni: 'Registrazioni',
    costi_maison: 'Costi Maison',
    moduli: 'Moduli',
    note_colleghi: 'Note Colleghi',
    consegne_turno: 'Consegne',
    promemoria: 'Promemoria',
    spese_extra: 'Spese Extra',
    log_attivita: 'Log Attivita',
    operatori_auth: 'Operatori',
    operator_sessions: 'Sessioni',
    impostazioni: 'Impostazioni',
    maison_budget: 'Budget Maison',
    regali_maison: 'Regali',
    note_clienti: 'Note Clienti',
    rapporti_giornalieri: 'Rapporti',
    collaboratori: 'Collaboratori',
    scadenze: 'Scadenze',
    note_fissate: 'Note Fissate',
    push_subscriptions: 'Push',
    login_attempts: 'Tentativi Login',
  };
  // Calcola totale dati reali (somma dimensioni tabelle)
  const totalDataBytes = tables.reduce((s, t) => s + (t.bytes || 0), 0);
  const totalDataMB = (totalDataBytes / 1024 / 1024).toFixed(1);
  h +=
    '<p style="color:var(--muted);font-size:.85rem;margin-bottom:14px">Di cui dati reali: <strong style="color:var(--ink)">' +
    totalDataMB +
    ' MB</strong> · il resto e overhead PostgreSQL (fisso, non cresce)</p>';
  // Card grid con conteggio + dimensione
  h +=
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px">';
  tables.forEach((t) => {
    h +=
      '<div style="background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:1.3rem;font-weight:700;color:var(--ink)">' +
      t.righe +
      '</div><div style="font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:2px">' +
      (labelMap[t.nome] || t.nome) +
      '</div><div style="font-size:.78rem;color:var(--accent2);font-weight:600;margin-top:3px">' +
      t.dimensione +
      '</div></div>';
  });
  h += '</div>';
  h += '<p style="color:var(--muted);font-size:.78rem">Sessioni attive: ' + r.sessioni_attive + '</p>';
  el.innerHTML = h;
}
async function _healthCheck() {
  const problems = [];
  // 1. Supabase connessione (verifica tramite dati caricati, no fetch extra)
  // 2. Librerie CDN
  if (!window.jspdf && !document.querySelector('script[src*="jspdf"]'))
    problems.push('Libreria PDF (jsPDF) non caricata');
  if (!window.Chart) problems.push('Libreria grafici (Chart.js) non caricata');
  if (!window.flatpickr) problems.push('Libreria calendario (Flatpickr) non caricata');
  if (!window.XLSX) problems.push('Libreria Excel (XLSX) non caricata');
  // 3. Groq AI (solo se configurata)
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: 'Bearer ' + groqKey },
      });
      if (!r.ok) problems.push('API Groq AI non risponde (chiave scaduta?)');
    } catch (e) {
      problems.push('API Groq AI non raggiungibile');
    }
  }
  // 4. Token sessione
  const tk = getOpToken();
  if (!tk) problems.push('Nessun token sessione attivo');
  // 5. Dati caricati
  if (!datiCache.length && !maisonCache.length && !collaboratoriCache.length)
    problems.push('Nessun dato caricato (verifica connessione)');
  // Mostra avviso solo se ci sono problemi
  if (problems.length) {
    console.warn('Health check:', problems);
    toast('Attenzione: ' + problems[0]);
  }
}

// PASSWORD
