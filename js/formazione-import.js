/**
 * Diario Collaboratori · Casino Lugano SA
 * File: formazione-import.js
 * Formazione: import delle competenze da un file Excel "a matrice" (un collaboratore per
 * riga, una competenza per colonna, una X dove la persona la sa fare), per qualsiasi
 * settore (richiesta del titolare 09/10/2026: file dei Tavoli con SUP, PB, DI, ISP 1-3,
 * CR 1-2, poker, cambi...). Le colonne si collegano alle competenze di Formazione dal
 * modulo, le scelte restano per la volta dopo (in questo browser), anteprima persona per
 * persona prima di salvare, nota nello storico e "Annulla l ultimo import".
 */

// una cella "vale" se c e qualcosa che non e un no (X, x, SI, 1, ✓...)
function _fziSi(v) {
  const s = String(v == null ? '' : v).trim();
  return !!s && !/^(0|no|n|-|falso|false)$/i.test(s);
}
function _fziLettera(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function _fziChiaveComp(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function _fziNorma(t) {
  return typeof _compNomeNorm === 'function'
    ? _compNomeNorm(t)
    : String(t || '')
        .toLowerCase()
        .trim();
}
let _fzi = null; // stato dell import in corso

// competenze del settore in ordine (livelli e Extra)
function _fziComp(rep) {
  const l = (getCompetenzeConfigAll()[rep] || []).slice();
  return typeof _compOrdinate === 'function' ? _compOrdinate(l) : l;
}
// livello di una persona nel settore con un certo insieme di spunte (stessa regola di
// livelloDiCollaboratore: il livello piu alto con tutte le competenze fino a li)
function _fziLivello(rep, spunte) {
  const comps = _fziComp(rep).filter((k) => (parseInt(k.livello) || 0) >= 1);
  const livelli = [...new Set(comps.map((k) => parseInt(k.livello) || 0))].sort((a, b) => a - b);
  let lv = 0;
  for (const n of livelli) {
    if (comps.filter((k) => (parseInt(k.livello) || 0) <= n).every((k) => spunte[k.key] === true)) lv = n;
    else break;
  }
  return lv;
}
function _fziCollabDelSettore(rep) {
  return collaboratoriCache.filter((c) => c.attivo !== false && (c.reparto_dip || 'slots') === rep);
}

async function formImportaMatrice(input, rep) {
  if (!isAdmin()) {
    toast('Solo l amministratore importa le competenze da file');
    input.value = '';
    return;
  }
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (typeof assicuraLibreria === 'function' && !(await assicuraLibreria('xlsx'))) return;
  let wb;
  try {
    wb = XLSX.read(await file.arrayBuffer());
  } catch (e) {
    toastErrore('Il file non si legge come Excel: ' + ((e && e.message) || e));
    return;
  }
  _fzi = { rep: rep, wb: wb, nomeFile: file.name, foglio: wb.SheetNames[0], cumulativo: true, sostituisci: true };
  _fziPreparaFoglio();
  _fziMostraColonne();
}

// righe del foglio, riga dei titoli, colonna dei nomi, colonne con le loro X
function _fziPreparaFoglio(rigaTitoli, colNome) {
  const z = _fzi;
  z.righe = XLSX.utils.sheet_to_json(z.wb.Sheets[z.foglio], { header: 1, defval: '', raw: false });
  const testo = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s && s.length <= 24 && isNaN(Number(s.replace(',', '.')));
  };
  if (rigaTitoli == null) {
    let migliore = 0;
    let max = -1;
    for (let r = 0; r < Math.min(15, z.righe.length); r++) {
      const n = (z.righe[r] || []).filter(testo).length;
      if (n > max) {
        max = n;
        migliore = r;
      }
    }
    rigaTitoli = migliore;
  }
  z.rigaTitoli = rigaTitoli;
  const dati = z.righe.slice(rigaTitoli + 1);
  const nCol = Math.max(0, ...z.righe.map((r) => r.length));
  if (colNome == null) {
    // la colonna con piu nomi riconosciuti fra i collaboratori del settore
    const lista = _fziCollabDelSettore(z.rep);
    let migliore = 0;
    let max = -1;
    for (let c = 0; c < nCol; c++) {
      let n = 0;
      dati.forEach((r) => {
        const v = String(r[c] || '').trim();
        if (v.length > 3 && isNaN(Number(v)) && _xlsTrovaCollab(v, lista)) n++;
      });
      if (n > max) {
        max = n;
        migliore = c;
      }
    }
    colNome = migliore;
  }
  z.colNome = colNome;
  z.persone = dati.filter((r) => String(r[colNome] || '').trim().length > 2);
  // colonne con un titolo (non i nomi): titoli ripetuti diventano "PK (2)", "PK (3)"...
  const visti = {};
  const titoli = z.righe[rigaTitoli] || [];
  const salvate = (() => {
    try {
      return JSON.parse(localStorage.getItem('fzi_mappa_' + z.rep) || '{}') || {};
    } catch (e) {
      return {};
    }
  })();
  const comps = _fziComp(z.rep);
  z.colonne = [];
  for (let c = 0; c < nCol; c++) {
    if (c === colNome) continue;
    const t = String(titoli[c] || '').trim();
    if (!t) continue;
    visti[_fziNorma(t)] = (visti[_fziNorma(t)] || 0) + 1;
    const titolo = visti[_fziNorma(t)] > 1 ? t + ' (' + visti[_fziNorma(t)] + ')' : t;
    const conX = z.persone.filter((r) => _fziSi(r[c])).length;
    if (!conX) continue; // colonna di dati (funzione, percentuale...) senza X: non e una competenza
    let comp = salvate[_fziNorma(titolo)];
    if (comp === undefined) {
      // stesso nome anche con spazi diversi (CR1 = CR 1, ISP 3 = ISP3)
      const senzaSpazi = (x) => _fziNorma(x).replace(/\s+/g, '');
      const k = comps.find(
        (x) => senzaSpazi(x.label) === senzaSpazi(t) || x.key.replace(/_/g, '') === _fziChiaveComp(t).replace(/_/g, ''),
      );
      comp = k ? k.key : '';
    }
    if (comp && comp !== '__nuova' && !comps.some((x) => x.key === comp)) comp = '';
    z.colonne.push({ c: c, titolo: titolo, base: t, conX: conX, comp: comp || '' });
  }
}

function _fziApriFinestra(html) {
  const b = document.getElementById('pwd-modal-content');
  b.classList.add('pwd-largo');
  if (!window._pwdLargoObs) {
    const modale = document.getElementById('pwd-modal');
    window._pwdLargoObs = new MutationObserver(() => {
      if (modale.classList.contains('hidden')) b.classList.remove('pwd-largo');
    });
    window._pwdLargoObs.observe(modale, { attributes: true, attributeFilter: ['class'] });
  }
  b.innerHTML = html;
  document.getElementById('pwd-modal').classList.remove('hidden');
}
function _fziChiudi() {
  document.getElementById('pwd-modal').classList.add('hidden');
}

function _fziMostraColonne() {
  const z = _fzi;
  const comps = _fziComp(z.rep);
  const lvTesto = (k) => ((parseInt(k.livello) || 0) >= 1 ? 'L' + k.livello : 'Extra');
  const titoli = z.righe[z.rigaTitoli] || [];
  const nCol = Math.max(0, ...z.righe.map((r) => r.length));
  const opzComp = (scelta, titolo) =>
    '<option value=""' +
    (!scelta ? ' selected' : '') +
    '>non importare</option>' +
    comps
      .map(
        (k) =>
          '<option value="' +
          escP(k.key) +
          '"' +
          (scelta === k.key ? ' selected' : '') +
          '>' +
          escP(lvTesto(k) + ' · ' + k.label) +
          '</option>',
      )
      .join('') +
    '<option value="__nuova"' +
    (scelta === '__nuova' ? ' selected' : '') +
    '>+ nuova specialita (Extra): ' +
    escP(titolo) +
    '</option>';
  const sel = 'padding:6px 8px;max-width:100%;box-sizing:border-box';
  let h =
    '<h3>Importa competenze · ' +
    escP(repartoLabel(z.rep)) +
    '</h3><p style="color:var(--muted);margin-bottom:10px">' +
    escP(z.nomeFile) +
    ' · ' +
    z.persone.length +
    ' righe con un nome</p>' +
    '<div class="add-tipo-row" style="margin-bottom:10px">' +
    '<div class="field"><label>Foglio</label><select id="fzi-foglio" style="' +
    sel +
    '" onchange="_fziCambia()">' +
    z.wb.SheetNames.map((s) => '<option' + (s === z.foglio ? ' selected' : '') + '>' + escP(s) + '</option>').join('') +
    '</select></div>' +
    '<div class="field"><label>Riga dei titoli</label><select id="fzi-riga" style="' +
    sel +
    '" onchange="_fziCambia()">' +
    Array.from({ length: Math.min(15, z.righe.length) }, (_, r) => r)
      .map(
        (r) => '<option value="' + r + '"' + (r === z.rigaTitoli ? ' selected' : '') + '>Riga ' + (r + 1) + '</option>',
      )
      .join('') +
    '</select></div>' +
    '<div class="field"><label>Colonna dei nomi</label><select id="fzi-nome" style="' +
    sel +
    '" onchange="_fziCambia()">' +
    Array.from({ length: nCol }, (_, c) => c)
      .map(
        (c) =>
          '<option value="' +
          c +
          '"' +
          (c === z.colNome ? ' selected' : '') +
          '>' +
          _fziLettera(c) +
          (String(titoli[c] || '').trim() ? ' · ' + escP(String(titoli[c]).trim()) : '') +
          '</option>',
      )
      .join('') +
    '</select></div></div>';
  if (!z.colonne.length) {
    h +=
      '<p>Nessuna colonna con delle X in questo foglio. Controlla il foglio e la riga dei titoli.</p><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="_fziChiudi()">Chiudi</button></div>';
    _fziApriFinestra(h);
    return;
  }
  h +=
    '<p style="margin-bottom:6px">Per ogni colonna del file scegli la competenza di Formazione che corrisponde. Le scelte restano per la prossima volta.</p>' +
    '<div style="overflow-x:auto;max-height:46vh;overflow-y:auto;border:1px solid var(--line);border-radius:3px"><table class="fzi-tab"><thead><tr><th>Colonna del file</th><th>Con la X</th><th>Competenza nel Diario</th></tr></thead><tbody>' +
    z.colonne
      .map(
        (col, i) =>
          '<tr><td><b>' +
          escP(col.titolo) +
          '</b> <span style="color:var(--muted)">(' +
          _fziLettera(col.c) +
          ')</span></td><td style="font-variant-numeric:tabular-nums">' +
          col.conX +
          '</td><td><select id="fzi-col-' +
          i +
          '" style="' +
          sel +
          '">' +
          opzComp(col.comp, col.base) +
          '</select></td></tr>',
      )
      .join('') +
    '</tbody></table></div>' +
    '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" id="fzi-cumul"' +
    (z.cumulativo ? ' checked' : '') +
    '><span>Chi ha un livello ha anche tutti quelli sotto (ISP 3 comprende ISP 2 e ISP 1, e cosi via)</span></label>' +
    '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:6px"><input type="checkbox" id="fzi-sost"' +
    (z.sostituisci ? ' checked' : '') +
    '><span>Il file vale per le colonne scelte: dove manca la X la competenza si toglie (le altre competenze restano)</span></label>' +
    '<div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="_fziChiudi()">Annulla</button><button class="btn-modal-ok" onclick="_fziAnteprima()">Anteprima</button></div>';
  _fziApriFinestra(h);
}
function _fziLeggiScelte() {
  const z = _fzi;
  z.colonne.forEach((col, i) => {
    const el = document.getElementById('fzi-col-' + i);
    if (el) col.comp = el.value;
  });
  const cu = document.getElementById('fzi-cumul');
  const so = document.getElementById('fzi-sost');
  if (cu) z.cumulativo = cu.checked;
  if (so) z.sostituisci = so.checked;
}
function _fziCambia() {
  const z = _fzi;
  _fziLeggiScelte();
  const f = document.getElementById('fzi-foglio').value;
  if (f !== z.foglio) {
    z.foglio = f;
    _fziPreparaFoglio();
  } else
    _fziPreparaFoglio(
      parseInt(document.getElementById('fzi-riga').value),
      parseInt(document.getElementById('fzi-nome').value),
    );
  _fziMostraColonne();
}

// calcolo di quello che cambierebbe (nessuna scrittura)
function _fziCalcola() {
  const z = _fzi;
  const comps = _fziComp(z.rep);
  const lvDi = {};
  comps.forEach((k) => (lvDi[k.key] = parseInt(k.livello) || 0));
  // specialita nuove: chiave dal titolo (come "Aggiungi competenza")
  const nuoveComp = [];
  z.colonne.forEach((col) => {
    col.chiave = col.comp === '__nuova' ? _fziChiaveComp(col.base) : col.comp;
    if (col.comp === '__nuova' && col.chiave && !comps.some((k) => k.key === col.chiave)) {
      if (!nuoveComp.some((x) => x.key === col.chiave))
        nuoveComp.push({ key: col.chiave, label: col.base, livello: 0 });
      lvDi[col.chiave] = 0;
    }
  });
  const usate = z.colonne.filter((col) => col.chiave);
  const lista = _fziCollabDelSettore(z.rep);
  const etichetta = (k) => {
    const c = comps.find((x) => x.key === k) || nuoveComp.find((x) => x.key === k);
    return c ? c.label : k;
  };
  const righe = [];
  z.persone.forEach((r) => {
    const nomeFile = String(r[z.colNome] || '').trim();
    const c = _xlsTrovaCollab(nomeFile, lista);
    const prima = Object.assign({}, (c && c.competenze) || {});
    const dopo = Object.assign({}, prima);
    const conX = new Set(usate.filter((col) => _fziSi(r[col.c])).map((col) => col.chiave));
    const toccate = new Set(usate.map((col) => col.chiave));
    toccate.forEach((k) => {
      if (conX.has(k)) dopo[k] = true;
      else if (z.sostituisci) dopo[k] = false;
    });
    if (z.cumulativo) {
      const max = Math.max(0, ...[...conX].map((k) => lvDi[k] || 0));
      comps.forEach((k) => {
        const lv = parseInt(k.livello) || 0;
        if (lv >= 1 && lv <= max) dopo[k.key] = true;
      });
    }
    const piu = Object.keys(dopo).filter((k) => dopo[k] === true && prima[k] !== true);
    const meno = Object.keys(dopo).filter((k) => dopo[k] !== true && prima[k] === true);
    righe.push({
      nomeFile: nomeFile,
      collab: c,
      prima: prima,
      dopo: dopo,
      piu: piu.map(etichetta),
      meno: meno.map(etichetta),
      piuK: piu,
      lvPrima: c ? _fziLivello(z.rep, prima) : 0,
      lvDopo: _fziLivelloConNuove(z.rep, dopo, nuoveComp),
    });
  });
  return { righe: righe, nuoveComp: nuoveComp };
}
function _fziLivelloConNuove(rep, spunte) {
  return _fziLivello(rep, spunte); // le specialita nuove sono Extra: non cambiano il livello
}

function _fziAnteprima() {
  _fziLeggiScelte();
  const z = _fzi;
  if (!z.colonne.some((col) => col.comp)) {
    toast('Scegli almeno una colonna da importare');
    return;
  }
  const r = _fziCalcola();
  z.calcolo = r;
  const trovati = r.righe.filter((x) => x.collab);
  const nuovi = r.righe.filter((x) => !x.collab);
  const conModifiche = trovati.filter((x) => x.piu.length || x.meno.length);
  const lvChip = (lv) =>
    '<span class="mini-badge" style="background:' +
    (typeof _lvColore === 'function' ? _lvColore(lv) : '#1a4a7a') +
    '">' +
    (lv ? 'L' + lv : 'nessun livello') +
    '</span>';
  const riga = (x, i) =>
    '<tr><td>' +
    (x.collab
      ? escP(x.collab.nome) +
        (_xlsNormaNome(x.collab.nome) !== _xlsNormaNome(x.nomeFile)
          ? ' <span style="color:var(--muted)">(nel file: ' + escP(x.nomeFile) + ')</span>'
          : '')
      : '<label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="fzi-nuovo-' +
        i +
        '" checked> ' +
        escP(capitalizzaNome(x.nomeFile.toLowerCase())) +
        ' <span style="color:var(--muted)">(nuovo)</span></label>') +
    '</td><td style="white-space:nowrap">' +
    (x.collab ? lvChip(x.lvPrima) + ' &rarr; ' : '') +
    lvChip(x.lvDopo) +
    '</td><td>' +
    (x.piu.length ? '<span style="color:var(--c-verde,#2c6e49)">+ ' + escP(x.piu.join(', ')) + '</span>' : '') +
    (x.piu.length && x.meno.length ? '<br>' : '') +
    (x.meno.length ? '<span style="color:var(--c-rosso,#c0392b)">&minus; ' + escP(x.meno.join(', ')) + '</span>' : '') +
    (!x.piu.length && !x.meno.length ? '<span style="color:var(--muted)">nessun cambiamento</span>' : '') +
    '</td></tr>';
  const tab = (lista) =>
    '<div style="overflow-x:auto"><table class="fzi-tab"><thead><tr><th>Collaboratore</th><th>Livello</th><th>Competenze</th></tr></thead><tbody>' +
    lista.map((x) => riga(x, r.righe.indexOf(x))).join('') +
    '</tbody></table></div>';
  const senza = trovati.filter((x) => !x.piu.length && !x.meno.length);
  let h =
    '<h3>Anteprima · ' +
    escP(repartoLabel(z.rep)) +
    '</h3><p style="margin-bottom:8px">' +
    trovati.length +
    ' riconosciuti, di cui <b>' +
    conModifiche.length +
    ' con modifiche</b> · ' +
    nuovi.length +
    ' nomi nuovi' +
    (r.nuoveComp.length ? ' · specialita nuove: ' + escP(r.nuoveComp.map((k) => k.label).join(', ')) : '') +
    '</p>' +
    _fziAvvisoGruppi(z) +
    '<div style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:3px;padding:0 6px">' +
    (nuovi.length
      ? '<p style="font-weight:700;margin:8px 0 4px">Nomi non trovati fra i collaboratori di ' +
        escP(repartoLabel(z.rep)) +
        ' (spuntati = si creano come nuovi)</p>' +
        tab(nuovi)
      : '') +
    (conModifiche.length ? '<p style="font-weight:700;margin:8px 0 4px">Con modifiche</p>' + tab(conModifiche) : '') +
    (senza.length
      ? '<details style="margin:8px 0"><summary style="cursor:pointer">Senza modifiche (' +
        senza.length +
        ')</summary>' +
        tab(senza) +
        '</details>'
      : '') +
    '</div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="_fziMostraColonne()">Indietro</button><button class="btn-modal-ok" onclick="_fziApplica()">Applica</button></div>';
  _fziApriFinestra(h);
}

// competenze con livello usate dall import ma non collegate a un gruppo di turni: la bozza
// non le vede come abilitazione finche non si collegano (Piano > Impostazioni)
function _fziSenzaGruppo(z) {
  const cfgG = window._pianoCompGruppiCfg || {};
  const comps = _fziComp(z.rep);
  const usate = new Set(z.colonne.map((c) => c.comp).filter((k) => k && k !== '__nuova'));
  return comps.filter(
    (k) =>
      (parseInt(k.livello) || 0) >= 1 &&
      usate.has(k.key) &&
      !cfgG[k.key] &&
      !(typeof _COMPETENZE_GRUPPI_DEFAULT !== 'undefined' && _COMPETENZE_GRUPPI_DEFAULT[k.key]),
  );
}
function _fziAvvisoGruppi(z) {
  const senza = _fziSenzaGruppo(z);
  if (!senza.length) return '';
  return (
    '<p style="margin:0 0 8px;padding:8px 10px;border-radius:3px;background:var(--paper2);border-left:3px solid var(--c-rosso,#c0392b)"><b>Da fare dopo l import:</b> ' +
    escP(senza.map((k) => k.label).join(', ')) +
    (senza.length === 1 ? ' non e collegata' : ' non sono collegate') +
    ' a un gruppo di turni. Finche non le colleghi (Piano &gt; Impostazioni, competenze e gruppi, per esempio al gruppo ' +
    escP(
      [...new Set((pianoTurniCache || []).filter((t) => (t.reparto_dip || 'slots') === z.rep).map((t) => t.gruppo))]
        .filter(Boolean)
        .join(', ') || 'del settore',
    ) +
    ') la bozza non le considera per abilitare le persone ai turni.</p>'
  );
}
async function _fziApplica() {
  const z = _fzi;
  const r = z.calcolo;
  if (!r) return;
  const nuoviSi = r.righe.filter((x, i) => !x.collab && (document.getElementById('fzi-nuovo-' + i) || {}).checked);
  const daFare = r.righe.filter((x) => x.collab && (x.piu.length || x.meno.length));
  if (!daFare.length && !nuoviSi.length && !r.nuoveComp.length) {
    toast('Niente da cambiare');
    return;
  }
  _fziChiudi();
  const backup = []; // per "Annulla l ultimo import"
  let scritti = 0;
  const errori = [];
  try {
    // 1) specialita nuove in Formazione (Extra)
    if (r.nuoveComp.length) {
      const cfg = getCompetenzeConfigAll();
      cfg[z.rep] = (cfg[z.rep] || []).concat(
        r.nuoveComp.filter((k) => !(cfg[z.rep] || []).some((x) => x.key === k.key)),
      );
      if (typeof _compOrdinate === 'function') cfg[z.rep] = _compOrdinate(cfg[z.rep]);
      await saveCompetenzeConfig(cfg);
    }
    // 2) collaboratori nuovi
    for (const x of nuoviSi) {
      const nome = capitalizzaNome(x.nomeFile.toLowerCase());
      if (collaboratoriCache.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) continue;
      try {
        const cr = await secPost('collaboratori', { nome: nome, attivo: true, reparto_dip: z.rep });
        const nuovo = cr && cr[0];
        if (!nuovo) continue;
        collaboratoriCache.push(nuovo);
        const dopo = Object.assign({}, nuovo.competenze || {}, x.dopo);
        await secPatch('collaboratori', 'id=eq.' + nuovo.id, { competenze: dopo });
        nuovo.competenze = dopo;
        backup.push({ id: nuovo.id, nome: nome, prima: null });
        scritti++;
        logAzione('Collaboratore aggiunto', nome + ' (import competenze ' + repartoLabel(z.rep) + ')');
      } catch (e) {
        errori.push(nome);
      }
    }
    // 3) competenze dei collaboratori trovati
    for (let i = 0; i < daFare.length; i += 8) {
      await Promise.all(
        daFare.slice(i, i + 8).map(async (x) => {
          try {
            await secPatch('collaboratori', 'id=eq.' + x.collab.id, { competenze: x.dopo });
            backup.push({ id: x.collab.id, nome: x.collab.nome, prima: x.prima });
            x.collab.competenze = x.dopo;
            scritti++;
            if (x.piu.length && typeof _insertHrEvento === 'function')
              _insertHrEvento(
                x.collab.nome,
                'formazione',
                'Competenze da file (' + z.nomeFile + '): ' + x.piu.join(', '),
              );
          } catch (e) {
            errori.push(x.collab.nome);
          }
        }),
      );
    }
  } finally {
    // le scelte delle colonne restano per la prossima volta (in questo browser)
    try {
      const m = {};
      z.colonne.forEach((col) => (m[_fziNorma(col.titolo)] = col.comp));
      localStorage.setItem('fzi_mappa_' + z.rep, JSON.stringify(m));
      localStorage.setItem(
        'fzi_ultimo',
        JSON.stringify({ rep: z.rep, file: z.nomeFile, quando: new Date().toISOString(), backup: backup }),
      );
    } catch (e) {}
  }
  logAzione(
    'Formazione: competenze importate',
    repartoLabel(z.rep) + ' · ' + scritti + ' collaboratori dal file ' + z.nomeFile,
  );
  if (errori.length) toastErrore('Non salvati: ' + errori.join(', ') + '. Riprova per loro.', 9000);
  else toast('Competenze importate: ' + scritti + (scritti === 1 ? ' collaboratore' : ' collaboratori'));
  if (typeof renderFormazione === 'function') renderFormazione();
}

// ANNULLA L ULTIMO IMPORT: le competenze tornano com erano (i collaboratori creati restano,
// si disattivano a mano se servono)
async function formAnnullaUltimoImport() {
  if (!isAdmin()) return;
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem('fzi_ultimo') || 'null');
  } catch (e) {}
  if (!u || !u.backup || !u.backup.length) {
    toast('Nessun import da annullare in questo browser');
    return;
  }
  const daRipristinare = u.backup.filter((b) => b.prima);
  const creati = u.backup.filter((b) => !b.prima).map((b) => b.nome);
  if (
    !(await chiediConferma(
      'Annullare l import di ' +
        u.file +
        ' (' +
        new Date(u.quando).toLocaleString('it-IT') +
        ')?\n\nLe competenze di ' +
        daRipristinare.length +
        ' collaboratori tornano com erano.' +
        (creati.length
          ? '\nI collaboratori creati restano (' + creati.join(', ') + '): si disattivano a mano se servono.'
          : ''),
    ))
  )
    return;
  let ok = 0;
  for (const b of daRipristinare) {
    try {
      await secPatch('collaboratori', 'id=eq.' + b.id, { competenze: b.prima });
      const c = collaboratoriCache.find((x) => x.id === b.id);
      if (c) c.competenze = b.prima;
      ok++;
    } catch (e) {}
  }
  try {
    localStorage.removeItem('fzi_ultimo');
  } catch (e) {}
  logAzione('Formazione: import annullato', u.file + ' · ' + ok + ' collaboratori');
  toast('Import annullato: ' + ok + ' collaboratori come prima');
  if (typeof renderFormazione === 'function') renderFormazione();
}
function _fziUltimoImport() {
  try {
    const u = JSON.parse(localStorage.getItem('fzi_ultimo') || 'null');
    return u && u.backup && u.backup.length ? u : null;
  } catch (e) {
    return null;
  }
}
