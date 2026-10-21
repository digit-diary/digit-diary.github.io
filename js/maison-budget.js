/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: maison-budget.js
 * Maison: budget, categorie, profilo
 */

// CATEGORIE DEI CLIENTI MAISON (21/10/2026): le tre fisse (Full Maison, Maison, Direzione)
// e UNA PER OGNI TIPO DI BUONO configurato in Impostazioni > valori buoni Maison (BU, BL,
// CG, WL e quelli aggiunti), con chiave = sigla in minuscolo (bu, bl, cg...). Una categoria
// di buono, scegliendo il cliente nell inserimento dei costi, propone il tipo di buono e fa
// calcolare il numero di buoni dall importo (_preimpostaTipoMaison, _autoCalcolaBuoniManuale).
// Unica fonte per menu, gruppi, colori, CSV e PDF: prima ogni schermata aveva la sua mappa
// con solo BU e BL (CG e WL non si potevano assegnare).
const MAISON_CAT_FISSE = [
  { key: 'full_maison', label: 'Full Maison', breve: 'Full Maison', colore: '#b8860b', buono: '' },
  { key: 'maison', label: 'Maison', breve: 'Maison', colore: '#2980b9', buono: '' },
  { key: 'direzione', label: 'Direzione', breve: 'Direzione', colore: '#8e44ad', buono: '' },
];
const _MAISON_CAT_COLORI_LIBERI = ['#c0392b', '#1a7a6d', '#5a6b7a', '#8b6914', '#7b2d8b', '#b5651d'];
function _maisonCatDiBuono(t) {
  // colore del buono; se coincide con una categoria fissa (CG viola come Direzione, WL blu
  // come Maison) se ne prende uno libero, cosi i gruppi si distinguono
  let colore = typeof buonoColore === 'function' ? buonoColore(t.codice) : 'var(--muted)';
  if (MAISON_CAT_FISSE.some((c) => c.colore.toLowerCase() === String(colore).toLowerCase())) {
    const i = Math.max(
      0,
      BUONI_TIPI.findIndex((x) => x.codice === t.codice),
    );
    colore = _MAISON_CAT_COLORI_LIBERI[i % _MAISON_CAT_COLORI_LIBERI.length];
  }
  return { key: t.codice.toLowerCase(), label: t.nome || t.codice, breve: t.codice, colore: colore, buono: t.codice };
}
// la categoria (oggetto) da una chiave salvata; null se vuota
function maisonCatInfo(cat) {
  if (!cat) return null;
  const k = String(cat).toLowerCase();
  const f = MAISON_CAT_FISSE.find((c) => c.key === k);
  if (f) return f;
  const t = (typeof BUONI_TIPI !== 'undefined' ? BUONI_TIPI : []).find((x) => x.codice.toLowerCase() === k);
  if (t) return _maisonCatDiBuono(t);
  // sigla non piu configurata: resta leggibile, ma non fa calcolare buoni
  return { key: k, label: k.toUpperCase(), breve: k.toUpperCase(), colore: 'var(--muted)', buono: '' };
}
// elenco per menu e gruppi: le fisse, poi i tipi di buono attivi nel settore aperto; con
// righe (clienti) anche le categorie gia assegnate che non sono piu fra queste
function maisonCategorie(righe) {
  const out = MAISON_CAT_FISSE.slice();
  (typeof buoniTipi === 'function' ? buoniTipi(false) : []).forEach((t) => {
    if (!out.some((c) => c.key === t.codice.toLowerCase())) out.push(_maisonCatDiBuono(t));
  });
  (righe || []).forEach((b) => {
    const k = b && b.categoria ? String(b.categoria).toLowerCase() : '';
    if (k && !out.some((c) => c.key === k)) out.push(maisonCatInfo(k));
  });
  return out;
}
function maisonCatLabel(cat) {
  const c = maisonCatInfo(cat);
  return c ? c.label : '';
}
function _maisonCatLabel(cat) {
  return maisonCatLabel(cat);
}
// nome corto per i distintivi (Full Maison, Maison, Direzione, BU, BL, CG...)
function maisonCatBreve(cat) {
  const c = maisonCatInfo(cat);
  return c ? c.breve : '';
}
function maisonCatColore(cat) {
  const c = maisonCatInfo(cat);
  return c ? c.colore : 'var(--muted)';
}
// tipo di buono della categoria ('BU', 'CG'...), '' per Full Maison, Maison, Direzione
function maisonCatTipoBuono(cat) {
  const c = maisonCatInfo(cat);
  return (c && c.buono) || '';
}
// colore per jsPDF ([r, g, b]) e sfondo leggero per le righe
function maisonCatRgb(cat) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(maisonCatColore(cat));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [100, 100, 100];
}
function maisonCatSfondo(cat) {
  return 'rgba(' + maisonCatRgb(cat).join(',') + ',0.15)';
}
// <option> del menu Categoria: vuota (-), fisse, tipi di buono; la categoria gia salvata
// resta scelta anche se il suo tipo di buono e stato disattivato
function maisonCatOpzioniHtml(selezionata) {
  const sel = selezionata ? String(selezionata).toLowerCase() : '';
  return (
    '<option value=""' +
    (sel ? '' : ' selected') +
    '>-</option>' +
    maisonCategorie(sel ? [{ categoria: sel }] : [])
      .map(
        (c) =>
          '<option value="' +
          escP(c.key) +
          '"' +
          (c.key === sel ? ' selected' : '') +
          '>' +
          escP(c.label + (c.buono ? ' (' + c.buono + ')' : '')) +
          '</option>',
      )
      .join('')
  );
}
// mappa chiave -> etichetta / nome corto / colore / [r,g,b] di TUTTE le categorie conosciute
// (fisse e ogni tipo di buono, anche disattivato): per le schermate che leggono b.categoria
function maisonCatMappa(campo) {
  const out = {};
  MAISON_CAT_FISSE.concat((typeof BUONI_TIPI !== 'undefined' ? BUONI_TIPI : []).map(_maisonCatDiBuono)).forEach((c) => {
    if (out[c.key] !== undefined) return;
    out[c.key] = campo === 'rgb' ? maisonCatRgb(c.key) : c[campo];
  });
  return out;
}
// distintivo della categoria (vuoto senza categoria)
function maisonCatBadgeHtml(cat, stile) {
  if (!cat) return '';
  return (
    ' <span class="mini-badge" style="background:' +
    maisonCatColore(cat) +
    ';' +
    (stile || 'font-size:var(--fs-sm,.8125rem)') +
    '">' +
    escP(maisonCatLabel(cat)) +
    '</span>'
  );
}
// riempie i menu Categoria della pagina (aggiunta cliente) al cambio di settore o di tipi
function maisonCatRiempiSelect() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('maison-budget-cat');
  if (el) el.innerHTML = maisonCatOpzioniHtml(el.value);
}
// SCHEDA CLIENTI MAISON: i clienti del settore aperto (i tolti sono nel Cestino), raggruppati
// per categoria; filtro per categoria (anche "Senza categoria") e per nome
function renderMaisonBudgetUI() {
  maisonCatRiempiSelect();
  const el = document.getElementById('maison-budget-list');
  if (!el) return;
  const _br = getBudgetReparto(),
    _mr = getMaisonRepartoExpanded();
  const clientiCat = _br.filter((b) => b.categoria);
  const senzaCat = _br.filter((b) => !b.categoria);
  if (!_br.length && !_mr.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessun cliente nella scheda</p><small>Aggiungi un cliente qui sotto (nome e categoria) o clicca sul nome di un cliente nella tabella sopra per assegnare una categoria</small></div>';
    return;
  }
  const categorie = maisonCategorie(_br);
  let filtCat = (document.getElementById('maison-filt-cat-lista') || {}).value || '';
  if (filtCat && filtCat !== '_senza' && !categorie.some((c) => c.key === filtCat)) filtCat = '';
  const _filtNomeBudget = (document.getElementById('maison-filt-nome-budget') || {}).value || '';
  const opz = (val, testo) =>
    '<option value="' + escP(val) + '"' + (filtCat === val ? ' selected' : '') + '>' + escP(testo) + '</option>';
  let html =
    '<div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap"><select id="maison-filt-cat-lista" aria-label="Categoria" onchange="renderMaisonBudgetUI()" style="padding:6px 10px;border:1px solid var(--line);border-radius:2px;font-size:var(--fs-md,.875rem);background:var(--paper);color:var(--ink)">' +
    opz('', 'Tutti categorizzati (' + clientiCat.length + ')') +
    categorie
      .map((c) => opz(c.key, c.label + ' (' + clientiCat.filter((b) => b.categoria === c.key).length + ')'))
      .join('') +
    opz('_senza', 'Senza categoria (' + senzaCat.length + ')') +
    '</select><input type="text" id="maison-filt-nome-budget" placeholder="Cerca cliente..." value="' +
    escP(_filtNomeBudget) +
    '" oninput="renderMaisonBudgetUI()" class="campo-cerca"></div>';
  // Budget mensile: la percentuale si calcola sullo speso di questo mese, non sullo storico
  const clients = (filtCat === '_senza' ? senzaCat : clientiCat)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((b) => ({ nome: b.nome, b, spent: _spesoPerBudget(b.nome), cat: b.categoria || '' }));
  let filtered = filtCat && filtCat !== '_senza' ? clients.filter((c) => c.cat === filtCat) : clients;
  if (_filtNomeBudget) {
    const _fnl = _filtNomeBudget.toLowerCase();
    filtered = filtered.filter((c) => c.nome.toLowerCase().includes(_fnl));
  }
  function renderClientRow(c, idx) {
    const pct = c.b && c.b.budget_chf ? Math.round((c.spent / c.b.budget_chf) * 100) : 0;
    const pctColor = pct >= 100 ? 'var(--accent)' : pct >= 80 ? 'var(--c-arancio,#e67e22)' : 'var(--c-verde,#2c6e49)';
    const borderColor = c.cat ? maisonCatColore(c.cat) : 'var(--muted)';
    const nascitaLabel =
      c.b && c.b.data_nascita
        ? new Date(c.b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
        : '';
    const isBday = c.b ? _isCompleannoOggi(c.b.data_nascita) : false;
    const ne = _jsArg(c.nome);
    const budgetBar =
      c.b && c.b.budget_chf
        ? '<div class="budget-bar"><div class="budget-bar-fill" style="width:' +
          Math.min(pct, 100) +
          '%;background:' +
          pctColor +
          '"></div></div>'
        : '';
    const bgColor = c.cat ? maisonCatSfondo(c.cat) : idx % 2 ? 'rgba(0,0,0,0.03)' : 'var(--paper)';
    const _catBadgeRow = c.cat
      ? '<span class="mini-badge" style="background:' +
        borderColor +
        ';font-size:var(--fs-sm,.8125rem);margin-left:6px">' +
        escP(maisonCatBreve(c.cat)) +
        '</span>'
      : '';
    return (
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' +
      bgColor +
      ';border-radius:3px;margin-bottom:4px;border-left:3px solid ' +
      borderColor +
      ';flex-wrap:wrap"><span style="font-weight:600;min-width:150px;cursor:pointer" class="entry-name" onclick="apriDettaglioMaison(\'' +
      ne +
      '\')">' +
      escP(c.nome) +
      _catBadgeRow +
      (isBday ? ' <span style="font-size:var(--fs-lg,1.0625rem)"><i class="icx icx-torta"></i></span>' : '') +
      '</span>' +
      (c.spent
        ? '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
          fmtCHF(c.spent) +
          ' CHF questo mese</span>'
        : '') +
      (c.b && c.b.budget_chf
        ? '<span style="font-size:var(--fs-sm,.8125rem);color:' +
          pctColor +
          ';font-weight:600">' +
          pct +
          '%</span>' +
          budgetBar
        : '') +
      (nascitaLabel
        ? '<span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)"><i class="icx icx-torta"></i> ' +
          nascitaLabel +
          '</span>'
        : '') +
      '<button class="btn-del-tipo" style="color:var(--accent2);border-color:var(--accent2);font-size:var(--fs-sm,.8125rem)" onclick="modificaMaisonInfo(' +
      c.b.id +
      ')">Modifica</button>' +
      '<button class="btn-del-tipo pericolo" style="font-size:var(--fs-sm,.8125rem)" title="Toglie il cliente dalla scheda: va nel Cestino e si può ripristinare" onclick="rimuoviMaisonBudget(' +
      c.b.id +
      ')">Togli</button>' +
      '</div>'
    );
  }
  if (filtCat) {
    html += filtered.length
      ? filtered.map(renderClientRow).join('')
      : '<p style="color:var(--muted);padding:8px 0">Nessun cliente</p>';
  } else {
    categorie.forEach((cd) => {
      const group = filtered.filter((c) => c.cat === cd.key);
      if (!group.length) return;
      html +=
        '<div class="cat-group-header testo-cat" style="--cat:' +
        cd.colore +
        '">' +
        escP(cd.label) +
        ' <span class="cat-count" style="background:' +
        cd.colore +
        '">' +
        group.length +
        '</span></div>';
      html += group.map(renderClientRow).join('');
    });
  }
  el.innerHTML = html;
  // Ripristina focus sul campo ricerca se era attivo
  if (_filtNomeBudget) {
    const _ri = document.getElementById('maison-filt-nome-budget');
    if (_ri) {
      _ri.focus();
      _ri.setSelectionRange(_ri.value.length, _ri.value.length);
    }
  }
}
// dopo un aggiunta o una modifica: scheda, alert del budget e cruscotto della Maison
function _maisonClientiAggiornaViste() {
  renderMaisonBudgetUI();
  if (typeof renderMaisonDashboard === 'function') renderMaisonDashboard();
  if (typeof renderMaisonBudgetAlerts === 'function') renderMaisonBudgetAlerts();
}
// NOME GIA USATO (il nome del cliente e unico in tutto il database): se e un cliente tolto
// di questo settore si propone di rimetterlo, altrimenti si dice dove e. Ritorna la riga
// rimessa nella scheda, o null.
async function _maisonClienteNomeOccupato(nome) {
  let righe = [];
  try {
    righe = (await secGet('maison_budget?nome=eq.' + encodeURIComponent(nome))) || [];
  } catch (e) {}
  const r = righe[0];
  if (r && r.eliminato && (r.reparto_dip || 'slots') === currentReparto) {
    if (
      !(await chiediConferma(
        nome +
          ' era stato tolto dalla scheda clienti' +
          (r.eliminato_da ? ' da ' + r.eliminato_da : '') +
          ' ed è nel Cestino.\n\nRimetterlo nella scheda con i dati inseriti?',
      ))
    )
      return null;
    await secPatch('maison_budget', 'id=eq.' + r.id, { eliminato: false, eliminato_da: null, eliminato_at: null });
    Object.assign(r, { eliminato: false, eliminato_da: null, eliminato_at: null });
    if (!maisonBudgetCache.some((x) => x.id === r.id)) maisonBudgetCache.push(r);
    return r;
  }
  toastErrore(
    'Cliente non aggiunto: il nome "' +
      nome +
      '" è già usato' +
      (r && (r.reparto_dip || 'slots') !== currentReparto
        ? ' nel settore ' + repartoLabel(r.reparto_dip || 'slots')
        : r && r.eliminato
          ? ' da un cliente nel Cestino di un altro settore'
          : '') +
      '. Il nome deve essere unico: aggiungi il nome di battesimo o un’iniziale.',
    9000,
  );
  return null;
}
// AGGIUNGI CLIENTE A MANO (scheda clienti): nome, categoria, budget e massimi del mese,
// data di nascita. Un cliente gia nella scheda si aggiorna con i campi compilati.
// Compare subito fra i nomi dell inserimento dei costi, con il calcolo dei buoni.
// un salvataggio alla volta: il doppio click creava righe doppie (unaVoltaSola in utils.js)
function salvaMaisonBudget() {
  return unaVoltaSola('maison-budget-salva', () => _salvaMaisonBudgetEsegui());
}
async function _salvaMaisonBudgetEsegui() {
  const val = (id) => (document.getElementById(id) || {}).value || '';
  const nome = capitalizzaNome(val('maison-budget-nome').trim());
  const chf = parseFloat(val('maison-budget-chf')) || null;
  const bu = parseInt(val('maison-budget-bu')) || null;
  const bl = parseInt(val('maison-budget-bl')) || null;
  const nascita = _getNascitaValue('maison-budget-nascita') || null;
  const cat = val('maison-budget-cat') || null;
  if (!nome) {
    toast('Inserisci il nome del cliente');
    return;
  }
  if (!chf && !bu && !bl && !nascita && !cat) {
    toast('Scegli la categoria (o un budget, un massimo o la data di nascita)');
    return;
  }
  const dati = { aggiornato_da: getOperatore(), aggiornato_at: new Date().toISOString() };
  if (cat) dati.categoria = cat;
  if (chf) dati.budget_chf = chf;
  if (bu) dati.budget_bu = bu;
  if (bl) dati.budget_bl = bl;
  if (nascita) dati.data_nascita = nascita;
  const esiste = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
  let riga = null;
  let rimesso = false;
  try {
    if (esiste) {
      // prima: "Gia esistente, rimuovi prima il vecchio" (e si perdevano budget e compleanno)
      if (
        !(await chiediConferma(
          esiste.nome +
            ' è già nella scheda clienti' +
            (esiste.categoria ? ' (' + maisonCatLabel(esiste.categoria) + ')' : '') +
            '.\n\nAggiornarlo con i dati inseriti? I campi lasciati vuoti restano come sono.',
        ))
      )
        return;
      await secPatch('maison_budget', 'id=eq.' + esiste.id, dati);
      Object.assign(esiste, dati);
      riga = esiste;
      logAzione('Cliente Maison aggiornato', esiste.nome + (cat ? ' · ' + maisonCatLabel(cat) : ''));
    } else {
      try {
        const r = await secPost('maison_budget', Object.assign({ nome, reparto_dip: currentReparto }, dati));
        riga = r && r[0];
        if (riga) maisonBudgetCache.push(riga);
      } catch (e) {
        if (!/duplicate|unique|23505|esiste gia/i.test((e && e.message) || '')) throw e;
        riga = await _maisonClienteNomeOccupato(nome);
        if (!riga) return;
        await secPatch('maison_budget', 'id=eq.' + riga.id, dati);
        Object.assign(riga, dati);
        rimesso = true;
      }
      logAzione(
        rimesso ? 'Cliente Maison rimesso dal Cestino' : 'Cliente Maison aggiunto',
        nome + (cat ? ' · ' + maisonCatLabel(cat) : ''),
      );
    }
  } catch (e) {
    toastErrore('Cliente non salvato: ' + ((e && e.message) || 'errore del database'));
    return;
  }
  ['maison-budget-nome', 'maison-budget-chf', 'maison-budget-bu', 'maison-budget-bl', 'maison-budget-cat'].forEach(
    (id) => {
      const x = document.getElementById(id);
      if (x) x.value = '';
    },
  );
  const nbFp = document.getElementById('maison-budget-nascita');
  if (nbFp && nbFp._flatpickr) nbFp._flatpickr.clear();
  else if (nbFp) nbFp.value = '';
  _maisonClientiAggiornaViste();
  toast(
    (esiste ? 'Aggiornato ' : rimesso ? 'Rimesso nella scheda ' : 'Aggiunto ') +
      nome +
      (riga && riga.categoria ? ' · ' + maisonCatLabel(riga.categoria) : ''),
  );
}
// categoria al volo per un nome che non e nella scheda (Assegna)
function assegnaCatRapida(nome) {
  const mc = document.getElementById('pwd-modal-content');
  mc.innerHTML =
    '<h3>Assegna categoria</h3><p style="color:var(--muted);margin-bottom:16px">' +
    escP(nome) +
    '</p><div style="display:flex;flex-direction:column;gap:10px">' +
    maisonCategorie()
      .map(
        (c) =>
          '<button class="btn-salva" style="background:' +
          c.colore +
          '" onclick="salvaAssegnaCat(\'' +
          _jsArg(nome) +
          "','" +
          _jsArg(c.key) +
          '\')">' +
          escP(c.label + (c.buono ? ' (' + c.buono + ')' : '')) +
          '</button>',
      )
      .join('') +
    '<button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
}
async function salvaAssegnaCat(nome, cat) {
  const dati = { categoria: cat, aggiornato_da: getOperatore(), aggiornato_at: new Date().toISOString() };
  try {
    const esiste = getBudgetReparto().find((b) => b.nome.toLowerCase() === nome.toLowerCase());
    if (esiste) {
      await secPatch('maison_budget', 'id=eq.' + esiste.id, dati);
      Object.assign(esiste, dati);
    } else {
      try {
        const r = await secPost('maison_budget', Object.assign({ nome, reparto_dip: currentReparto }, dati));
        if (r && r[0]) maisonBudgetCache.push(r[0]);
      } catch (e) {
        if (!/duplicate|unique|23505|esiste gia/i.test((e && e.message) || '')) throw e;
        const riga = await _maisonClienteNomeOccupato(nome);
        if (!riga) return;
        await secPatch('maison_budget', 'id=eq.' + riga.id, dati);
        Object.assign(riga, dati);
      }
    }
    document.getElementById('pwd-modal').classList.add('hidden');
    _maisonClientiAggiornaViste();
    logAzione('Categoria maison', nome + ' → ' + maisonCatLabel(cat));
    toast(nome + ' → ' + maisonCatLabel(cat));
  } catch (e) {
    toastErrore('Categoria non assegnata: ' + ((e && e.message) || 'errore del database'));
  }
}
// MODIFICA CLIENTE: categoria (anche togliere la categoria), budget, massimi, nascita
function modificaMaisonInfo(id) {
  const b = maisonBudgetCache.find((x) => x.id === id);
  if (!b) return;
  const mc = document.getElementById('pwd-modal-content');
  const nascitaDisplay = b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '';
  mc.innerHTML =
    '<h3>Modifica cliente</h3><div class="pwd-field"><label>Cliente</label><input type="text" value="' +
    escP(b.nome) +
    '" readonly style="background:var(--paper2);color:var(--muted)"></div><div class="pwd-field"><label>Categoria</label><select id="edit-mb-cat" style="width:100%;padding:8px">' +
    maisonCatOpzioniHtml(b.categoria) +
    '</select><small style="color:var(--muted)">Con una categoria di buono (BU, BL, CG...) l’inserimento dei costi propone il buono e ne calcola il numero dall importo.</small></div><div style="display:flex;gap:10px"><div class="pwd-field" style="flex:1"><label>Budget CHF/mese</label><input type="number" id="edit-mb-chf" value="' +
    (b.budget_chf || '') +
    '" step="0.01"></div><div class="pwd-field" style="flex:1"><label>Max BU/mese</label><input type="number" id="edit-mb-bu" value="' +
    (b.budget_bu || '') +
    '"></div><div class="pwd-field" style="flex:1"><label>Max BL/mese</label><input type="number" id="edit-mb-bl" value="' +
    (b.budget_bl || '') +
    '"></div></div><p style="font-size:var(--fs-sm,.8125rem);color:var(--muted);margin:4px 0 8px">I valori sono mensili. Per il controllo annuale il sistema moltiplica &times;12.</p><div class="pwd-field"><label>Data nascita</label><input type="text" id="edit-mb-nascita" value="' +
    nascitaDisplay +
    '" placeholder="es: 12.01.1997"></div><div class="pwd-modal-btns"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" onclick="salvaModificaMaisonInfo(' +
    id +
    ')">Salva</button></div>';
  document.getElementById('pwd-modal').classList.remove('hidden');
  _initNascitaInput('edit-mb-nascita');
  if (b.data_nascita) {
    const el = document.getElementById('edit-mb-nascita');
    if (el) el.dataset.isoValue = b.data_nascita;
  }
}
async function salvaModificaMaisonInfo(id) {
  const cat = document.getElementById('edit-mb-cat').value || null;
  const chf = parseFloat(document.getElementById('edit-mb-chf').value) || null;
  const bu = parseInt(document.getElementById('edit-mb-bu').value) || null;
  const bl = parseInt(document.getElementById('edit-mb-bl').value) || null;
  const nascita = _getNascitaValue('edit-mb-nascita') || null;
  const b = maisonBudgetCache.find((x) => x.id === id);
  const prima = b ? b.categoria : null;
  try {
    const dati = {
      categoria: cat,
      budget_chf: chf,
      budget_bu: bu,
      budget_bl: bl,
      data_nascita: nascita,
      aggiornato_da: getOperatore(),
      aggiornato_at: new Date().toISOString(),
    };
    await secPatch('maison_budget', 'id=eq.' + id, dati);
    if (b) Object.assign(b, dati);
    document.getElementById('pwd-modal').classList.add('hidden');
    _maisonClientiAggiornaViste();
    logAzione(
      'Modifica cliente maison',
      (b ? b.nome : 'ID ' + id) +
        ((prima || null) !== cat
          ? ' · categoria ' + (maisonCatLabel(prima) || '-') + ' → ' + (maisonCatLabel(cat) || '-')
          : ''),
    );
    toast('Cliente aggiornato');
  } catch (e) {
    toastErrore('Cliente non aggiornato: ' + ((e && e.message) || 'errore del database'));
  }
}
function apriListaClientiMaison() {
  const _br = getBudgetReparto();
  const gruppi = maisonCategorie(_br).map((c) => ({
    c,
    items: _br.filter((b) => b.categoria === c.key).sort((a, b) => a.nome.localeCompare(b.nome)),
  }));
  const tot = gruppi.reduce((s, g) => s + g.items.length, 0);
  let html =
    '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px"><div><h3 style="font-family:Playfair Display,serif;color:var(--ink);margin-bottom:4px">Clienti Categorizzati</h3><p style="color:var(--muted);font-size:var(--fs-sm,.8125rem)">' +
    tot +
    ' clienti' +
    gruppi
      .filter((g) => g.items.length)
      .map((g) => ' · ' + g.items.length + ' ' + escP(g.c.breve))
      .join('') +
    '</p></div><button class="btn-modal-cancel" onclick="document.getElementById(\'profilo-modal\').classList.add(\'hidden\')" style="padding:6px 12px;font-size:var(--fs-sm,.8125rem)">Chiudi</button></div>';
  html +=
    '<div style="display:flex;gap:10px;margin-bottom:16px"><button class="btn-export" onclick="esportaListaMaisonCSV()" style="font-size:var(--fs-sm,.8125rem);padding:5px 14px">CSV</button><button class="btn-export btn-export-pdf" onclick="esportaListaMaisonPDF()" style="font-size:var(--fs-sm,.8125rem);padding:5px 14px">PDF</button></div>';
  function renderCatBlock(items, label, color) {
    if (!items.length) return '';
    let h =
      '<div style="margin-bottom:16px"><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.1em;text-transform:uppercase;--cat:' +
      color +
      ';color:var(--cat);font-weight:700;margin-bottom:8px;border-bottom:2px solid ' +
      color +
      ';padding-bottom:4px">' +
      label +
      ' (' +
      items.length +
      ')</div>';
    items.forEach(function (b) {
      var nascita = b.data_nascita
        ? '  ·  <i class="icx icx-torta"></i> ' +
          new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
        : '';
      h +=
        '<div style="padding:8px 12px;margin-bottom:4px;border-radius:3px;border-left:3px solid ' +
        color +
        ';background:' +
        color +
        '0F;display:flex;align-items:center;gap:10px"><strong>' +
        escP(b.nome) +
        '</strong>' +
        nascita +
        '</div>';
    });
    return h + '</div>';
  }
  gruppi.forEach((g) => (html += renderCatBlock(g.items, escP(g.c.label), g.c.colore)));
  if (!tot)
    html +=
      '<p style="color:var(--muted);text-align:center;padding:20px">Nessun cliente categorizzato. Assegna le categorie dalla scheda clienti.</p>';
  document.getElementById('profilo-content').innerHTML = html;
  document.getElementById('profilo-modal').classList.remove('hidden');
}
function esportaListaMaisonCSV() {
  const _br = getBudgetReparto();
  if (!_br.length) {
    toast('Nessun cliente');
    return;
  }
  const rows = [['Cliente', 'Categoria', 'Budget CHF', 'Max BU', 'Max BL', 'Data nascita']];
  _br.forEach((b) => {
    rows.push([
      b.nome,
      _maisonCatLabel(b.categoria),
      b.budget_chf || '',
      b.budget_bu || '',
      b.budget_bl || '',
      b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '',
    ]);
  });
  const blob = new Blob(
    ['\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: 'clienti_maison.csv',
  }).click();
  toast('Lista CSV esportata!');
}
async function esportaListaMaisonPDF() {
  const _br = getBudgetReparto();
  if (!_br.length) {
    toast('Nessun cliente');
    return;
  }
  if (!window.jspdf) {
    toast('Caricamento PDF...');
    if (!(await caricaJsPDF())) {
      toastErrore('Non riesco a preparare il PDF: controlla la connessione internet e riprova');
      return;
    }
  }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    let y = 14;
    identitaLogoPdf(doc, pw / 2, y, 40, 22.5, true);
    y += 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Clienti Maison', pw / 2, y, { align: 'center' });
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(identita().azienda + ' · ' + _br.length + ' clienti', pw / 2, y, { align: 'center' });
    y += 10;
    doc.setTextColor(0);
    const catOrder = maisonCategorie(_br).map((c) => c.key);
    const sorted = _br
      .filter((b) => b.categoria)
      .sort((a, b) => catOrder.indexOf(a.categoria) - catOrder.indexOf(b.categoria) || a.nome.localeCompare(b.nome));
    const body = sorted.map((b) => [
      b.nome,
      _maisonCatLabel(b.categoria) || '-',
      b.budget_chf ? parseFloat(b.budget_chf).toFixed(0) : '-',
      b.data_nascita ? new Date(b.data_nascita + 'T12:00:00').toLocaleDateString('it-IT') : '',
    ]);
    doc.autoTable({
      theme: 'grid',
      startY: y,
      margin: { left: 16, right: 16 },
      head: [['Cliente', 'Categoria', 'Budget CHF', 'Nascita']],
      body,
      headStyles: { fillColor: [26, 18, 8] },
      styles: { lineColor: [220, 215, 205], lineWidth: 0.15, fontSize: 10, cellPadding: 4 },
      didParseCell: function (d) {
        // colore della categoria della riga (stesso della scheda clienti)
        if (d.section === 'body' && d.column.index === 1 && sorted[d.row.index]) {
          d.cell.styles.textColor = maisonCatRgb(sorted[d.row.index].categoria);
          d.cell.styles.fontStyle = 'bold';
        }
      },
      alternateRowStyles: { fillColor: [250, 247, 242] },
    });
    const tp = doc.internal.getNumberOfPages();
    for (let i = 1; i <= tp; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        identita().azienda + ' · Clienti Maison · Pag. ' + i + '/' + tp,
        16,
        doc.internal.pageSize.getHeight() - 8,
      );
    }
    mostraPdfPreview(doc, 'clienti_maison.pdf', 'Lista Clienti Maison');
  } catch (e) {
    toast('Errore PDF');
  }
}
// Titolo di colonna (o di gruppo) con il nome di un tipo di buono configurato oltre a BU e BL,
// gia riconosciuti sopra: "COUPON GOURMET" -> cg; con laSigla anche la sola sigla ("CG")
function _maisonCatDaTitolo(vUp, laSigla) {
  const t = (typeof BUONI_TIPI !== 'undefined' ? BUONI_TIPI : []).find(
    (x) =>
      !['BU', 'BL'].includes(x.codice) &&
      ((laSigla && vUp === x.codice) || (x.nome && x.nome.length >= 4 && vUp.includes(x.nome.toUpperCase()))),
  );
  return t ? t.codice.toLowerCase() : '';
}
// IMPORTA CATEGORIE DA FILE EXCEL (Maison slots)
async function importaCategorieMaison(input) {
  if (!(await assicuraLibreria('xlsx'))) return;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const XLSX = window.XLSX;
  if (!XLSX) {
    toast('Libreria XLSX non caricata');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const catMap = {}; // {nome: categoria}
    // Cerca in tutti i fogli
    for (const sn of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      if (!data.length) continue;
      // Trova riga intestazione con le categorie
      let catCols = {}; // {colIdx: categoria}
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j++) {
          const v = String(row[j]).trim().toUpperCase();
          if (v.includes('FULL MAISON')) catCols[j] = 'full_maison';
          else if (v === 'MAISON' || (v.includes('MAISON') && !v.includes('FULL') && !v.includes('BUON')))
            catCols[j] = 'maison';
          else if (v.includes('BUONI LOUNGE') || v.includes('BUONO LOUNGE') || v === 'BL') catCols[j] = 'bl';
          else if (v.includes('BUONO UNICO') || v.includes('BUONI UNICI') || v === 'BU') catCols[j] = 'bu';
          else if (v.includes('DIREZIONE')) catCols[j] = 'direzione';
          else if (_maisonCatDaTitolo(v, true)) catCols[j] = _maisonCatDaTitolo(v, true);
        }
      }
      if (!Object.keys(catCols).length) continue;
      // Parole da escludere (non sono nomi cliente)
      const _escludiNomi =
        /^(consumazion|mangia|slot[is]?|buoni|full|maison|direzione|buono|lounge|unic[oi]|unici|tavol[oi]|bar|ristorante|totale|note|data|nome|cognome|px|costo|gruppo)$/i;
      // Per ogni colonna con nomi, traccia la categoria corrente (può cambiare con sub-header)
      const catGroups = {};
      // Identifica le colonne nomi (colonna adiacente a quella con intestazione categoria)
      const colToCat = {}; // {colIdx: catIniziale}
      for (const [ci, cat] of Object.entries(catCols)) {
        const colIdx = parseInt(ci);
        // La colonna nomi è tipicamente quella dopo l'intestazione, o la stessa
        if (!catCols[colIdx + 1]) colToCat[colIdx + 1] = cat;
        colToCat[colIdx] = cat;
      }
      // Leggi riga per riga, aggiorna la categoria se trovi un sub-header
      const activeCat = {}; // {colIdx: categoriaCorrente}
      for (const [ci, cat] of Object.entries(colToCat)) activeCat[ci] = cat;
      for (let i = 1; i < data.length; i++) {
        for (const ci of Object.keys(colToCat)) {
          const cc = parseInt(ci);
          const v = String(data[i][cc] || '').trim();
          if (!v) continue;
          const vUp = v.toUpperCase().replace(/\*+/g, '').trim();
          // Sub-header? Cambia la categoria per questa colonna
          if (vUp.includes('BUONO UNICO') || vUp.includes('BUONI UNICI') || vUp === 'BU') {
            activeCat[cc] = 'bu';
            continue;
          }
          if (vUp.includes('BUONI LOUNGE') || vUp.includes('BUONO LOUNGE')) {
            activeCat[cc] = 'bl';
            continue;
          }
          if (vUp.includes('FULL MAISON')) {
            activeCat[cc] = 'full_maison';
            continue;
          }
          if (vUp === 'MAISON') {
            activeCat[cc] = 'maison';
            continue;
          }
          if (vUp === 'DIREZIONE') {
            activeCat[cc] = 'direzione';
            continue;
          }
          // altri tipi di buono configurati (Coupon Gourmet, Welcome Lounge...) per nome
          if (_maisonCatDaTitolo(vUp, false)) {
            activeCat[cc] = _maisonCatDaTitolo(vUp, false);
            continue;
          }
          // CONSUMAZIONI/MANGIA AL BAR = non è una categoria, disattiva
          if (vUp.includes('CONSUMAZION') || vUp.includes('MANGIA AL BAR')) {
            activeCat[cc] = null;
            continue;
          }
          // Salta marcatori tipo BL/BU isolati e parole non-nome
          if (/^(BL|BU|CG|WL)$/i.test(vUp)) continue;
          if (_escludiNomi.test(vUp)) continue;
          // Pulisci e aggiungi
          let nome = v
            .replace(/\*+/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();
          if (!nome || nome.length < 2) continue;
          const cat = activeCat[cc];
          if (!cat) continue;
          if (!catGroups[cat]) catGroups[cat] = new Set();
          if (nome.includes('/')) {
            nome.split('/').forEach((n) => {
              n = n.trim();
              if (n && n.length >= 3 && !_escludiNomi.test(n)) catGroups[cat].add(capitalizzaNome(n));
            });
          } else if (nome.length >= 3) {
            catGroups[cat].add(capitalizzaNome(nome));
          }
        }
      }
      for (const [cat, nomi] of Object.entries(catGroups)) {
        for (const nome of nomi) {
          if (nome.length >= 3) catMap[nome] = cat;
        }
      }
    }
    const nomi = Object.keys(catMap);
    if (!nomi.length) {
      toast('Nessun cliente trovato nel file');
      return;
    }
    // Mostra anteprima professionale
    const mc = document.getElementById('pwd-modal-content');
    const byCat = {};
    nomi.forEach((n) => {
      const c = catMap[n];
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(n.trim());
    });
    const catLabels = {};
    const catColors = {};
    Object.keys(byCat).forEach((k) => {
      catLabels[k] = maisonCatLabel(k);
      catColors[k] = maisonCatColore(k);
    });
    const esist = nomi.filter((n) =>
      maisonBudgetCache.find(
        (b) => b.nome.toLowerCase() === n.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto,
      ),
    );
    const nNuovi = nomi.length - esist.length;
    let prev =
      '<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Categorie Clienti</h3><p style="color:var(--muted);font-size:var(--fs-md,.875rem)">File: ' +
      escP(file.name) +
      '</p></div>';
    // KPI cards
    prev += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--ink)">' +
      nomi.length +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Totale</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--c-verde,#2c6e49)">' +
      nNuovi +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Nuovi</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--accent2)">' +
      esist.length +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Aggiornati</div></div>';
    prev += '</div>';
    // Categorie con lista espandibile
    prev += '<div style="max-height:350px;overflow-y:auto">';
    for (const [cat, lista] of Object.entries(byCat)) {
      lista.sort();
      prev += '<div style="margin-bottom:12px;border-left:3px solid ' + catColors[cat] + ';padding-left:12px">';
      prev +=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="mini-badge" style="background:' +
        catColors[cat] +
        ';font-size:var(--fs-sm,.8125rem);padding:3px 10px">' +
        catLabels[cat] +
        '</span><span style="font-size:var(--fs-sm,.8125rem);color:var(--muted)">' +
        lista.length +
        ' clienti</span></div>';
      prev += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      lista.forEach((n) => {
        const isExist = esist.includes(n);
        prev +=
          '<span style="font-size:var(--fs-sm,.8125rem);padding:2px 8px;border-radius:2px;background:' +
          (isExist ? catColors[cat] + '15' : 'var(--paper2)') +
          ';color:' +
          (isExist ? catColors[cat] : 'var(--ink)') +
          ';border:1px solid ' +
          (isExist ? catColors[cat] + '40' : 'var(--line)') +
          '">' +
          escP(n) +
          (isExist ? ' &#8635;' : '') +
          '</span>';
      });
      prev += '</div></div>';
    }
    prev += '</div>';
    // Barra progresso (nascosta)
    prev +=
      '<div id="import-cat-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-cat-bar" style="height:100%;width:0%;background:#b8860b;border-radius:3px;transition:width .2s"></div></div><p id="import-cat-status" style="text-align:center;font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px"></p></div>';
    prev +=
      '<div id="import-cat-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-cat">Importa ' +
      nomi.length +
      ' clienti</button></div>';
    mc.innerHTML = prev;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('btn-conf-import-cat').onclick = async function () {
      document.getElementById('import-cat-btns').style.display = 'none';
      document.getElementById('import-cat-progress').style.display = 'block';
      const bar = document.getElementById('import-cat-bar');
      const status = document.getElementById('import-cat-status');
      // Refresh cache dal server per evitare duplicati
      status.textContent = 'Caricamento dati...';
      // clienti tolti (nel Cestino): un nome del file che e fra questi torna nella scheda
      // con la categoria del file (prima l inserimento falliva: il nome e unico)
      let _tolti = [];
      try {
        const _tutti = (await secGet('maison_budget?order=nome.asc')) || [];
        maisonBudgetCache = _tutti.filter((b) => !b.eliminato);
        _tolti = _tutti.filter((b) => b.eliminato);
      } catch (e) {}
      let nuovi = 0,
        aggiornati = 0,
        errori = 0,
        done = 0;
      for (const nome of nomi) {
        const cat = catMap[nome];
        const existing = maisonBudgetCache.find(
          (b) => b.nome.toLowerCase() === nome.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto,
        );
        const tolto =
          !existing &&
          _tolti.find(
            (b) => b.nome.toLowerCase() === nome.toLowerCase() && (b.reparto_dip || 'slots') === currentReparto,
          );
        if (tolto) {
          try {
            const dati = {
              categoria: cat,
              eliminato: false,
              eliminato_da: null,
              eliminato_at: null,
              aggiornato_da: getOperatore(),
              aggiornato_at: new Date().toISOString(),
            };
            await secPatch('maison_budget', 'id=eq.' + tolto.id, dati);
            Object.assign(tolto, dati);
            maisonBudgetCache.push(tolto);
            aggiornati++;
          } catch (e) {
            errori++;
          }
        } else if (existing) {
          if (existing.categoria !== cat) {
            try {
              await secPatch('maison_budget', 'id=eq.' + existing.id, {
                categoria: cat,
                aggiornato_da: getOperatore(),
                aggiornato_at: new Date().toISOString(),
              });
              existing.categoria = cat;
              aggiornati++;
            } catch (e) {
              errori++;
            }
          }
        } else {
          try {
            const postData = { nome: nome, categoria: cat, reparto_dip: currentReparto };
            try {
              postData.aggiornato_da = getOperatore();
              postData.aggiornato_at = new Date().toISOString();
            } catch (e2) {}
            const r = await secPost('maison_budget', postData);
            if (r && r.length && r[0] && r[0].id) {
              maisonBudgetCache.push(r[0]);
              nuovi++;
            } else {
              // secPost ritornò dati vuoti, riprova senza campi extra
              const r2 = await secPost('maison_budget', { nome: nome, categoria: cat, reparto_dip: currentReparto });
              if (r2 && r2.length && r2[0] && r2[0].id) {
                maisonBudgetCache.push(r2[0]);
                nuovi++;
              } else {
                errori++;
              }
            }
          } catch (e) {
            console.error('Import cat errore:', nome, e.message);
            errori++;
          }
        }
        done++;
        bar.style.width = Math.round((done / nomi.length) * 100) + '%';
        status.textContent = done + '/' + nomi.length + ' · ' + nome;
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 50));
      }
      // Riepilogo finale
      mc.innerHTML =
        '<div style="text-align:center;padding:20px"><div style="font-size:var(--fs-4xl,2.5rem);margin-bottom:8px">' +
        (errori ? '<i class="icx icx-avviso"></i>' : '<i class="icx icx-check"></i>') +
        '</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Importazione completata</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--c-verde,#2c6e49)">' +
        nuovi +
        '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Nuovi</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--accent2)">' +
        aggiornati +
        '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Aggiornati</div></div>' +
        (errori
          ? '<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--accent)">' +
            errori +
            '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Errori</div></div>'
          : '') +
        '</div><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione('Importa categorie', nomi.length + ' clienti (' + nuovi + ' nuovi, ' + aggiornati + ' aggiornati)');
    };
  } catch (e) {
    toast('Errore lettura file: ' + e.message);
  }
}
// IMPORTA COMPLEANNI DA FILE EXCEL
async function importaCompleanniMaison(input) {
  if (!(await assicuraLibreria('xlsx'))) return;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const XLSX = window.XLSX;
  if (!XLSX) {
    toast('Libreria XLSX non caricata');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const compleanni = []; // [{nome, data}]
    const mesiIt = [
      'GENNAIO',
      'FEBBRAIO',
      'MARZO',
      'APRILE',
      'MAGGIO',
      'GIUGNO',
      'LUGLIO',
      'AGOSTO',
      'SETTEMBRE',
      'OTTOBRE',
      'NOVEMBRE',
      'DICEMBRE',
    ];
    for (const sn of wb.SheetNames) {
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false });
      if (!data.length) continue;
      // Formato: coppie colonne (nome, data) per ogni mese
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j += 2) {
          const nomeRaw = String(row[j] || '').trim();
          const cellVal = row[j + 1];
          // Salta intestazioni mese
          if (!nomeRaw || mesiIt.includes(nomeRaw.toUpperCase()) || nomeRaw.toUpperCase() === 'COMPLEANNI') continue;
          if (cellVal === undefined || cellVal === null || cellVal === '') continue;
          // Parsa la data in vari formati
          let isoDate = null;
          // Se è un oggetto Date (cellDates:true) · usa getFullYear/Month/Date locali per evitare shift UTC
          if (cellVal instanceof Date && !isNaN(cellVal)) {
            isoDate =
              cellVal.getFullYear() +
              '-' +
              String(cellVal.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(cellVal.getDate()).padStart(2, '0');
          }
          // Se è un numero seriale Excel
          if (!isoDate && typeof cellVal === 'number' && cellVal > 1000 && cellVal < 100000) {
            const d = new Date((cellVal - 25569) * 86400000 + 43200000);
            if (!isNaN(d))
              isoDate =
                d.getFullYear() +
                '-' +
                String(d.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(d.getDate()).padStart(2, '0');
          }
          // Se è stringa
          if (!isoDate && typeof cellVal === 'string') {
            const dataRaw = cellVal.trim();
            // YYYY-MM-DD HH:MM:SS o YYYY-MM-DD
            const dm = dataRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dm) isoDate = dm[1] + '-' + dm[2] + '-' + dm[3];
            // DD.MM.YYYY o DD/MM/YYYY
            if (!isoDate) {
              const dm2 = dataRaw.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
              if (dm2) isoDate = dm2[3] + '-' + dm2[2].padStart(2, '0') + '-' + dm2[1].padStart(2, '0');
            }
            // MM-DD-YY o MM/DD/YY (formato mm-dd-yy di Excel)
            if (!isoDate) {
              const dm3 = dataRaw.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
              if (dm3) {
                let y = parseInt(dm3[3]);
                if (y < 100) y = annoNascitaDaDueCifre(y); // prima 43 -> 2043
                isoDate = y + '-' + dm3[1].padStart(2, '0') + '-' + dm3[2].padStart(2, '0');
              }
            }
          }
          if (!isoDate) continue;
          isoDate = nascitaNonFutura(isoDate); // anche le date gia convertite da Excel
          // Pulisci nome
          let nome = capitalizzaNome(nomeRaw.replace(/\*+/g, '').trim());
          if (nome.length < 2) continue;
          compleanni.push({ nome, data: isoDate });
        }
      }
    }
    if (!compleanni.length) {
      toast('Nessun compleanno trovato nel file');
      return;
    }
    // Si aggiorna in automatico SOLO il nome completo identico (case-insensitive). Un match
    // "simile" (es. "Rossi" per "Rossi Mario") va confermato voce per voce: prima sovrascriveva
    // la data di nascita del cliente con quella di un familiare e lo rinominava pure.
    const matched = [];
    compleanni.forEach((c, idx) => {
      const found = getBudgetReparto().find((b) => b.nome.toLowerCase() === c.nome.toLowerCase());
      if (found) {
        matched.push({ ...c, idx, budgetId: found.id, nomeDB: found.nome, isNew: false, simile: null });
        return;
      }
      const sim = _trovaNomeSimileMaison(c.nome);
      const bSim =
        sim && sim.tipo === 'simile'
          ? getBudgetReparto().find((b) => b.nome.toLowerCase() === sim.nome.toLowerCase())
          : null;
      if (bSim) matched.push({ ...c, idx, budgetId: null, nomeDB: bSim.nome, isNew: false, simile: bSim });
      else matched.push({ ...c, idx, budgetId: null, nomeDB: null, isNew: true, simile: null });
    });
    const nuovi = matched.filter((m) => m.isNew);
    const esistenti = matched.filter((m) => m.budgetId);
    const daConfermare = matched.filter((m) => m.simile);
    // Mostra anteprima professionale
    const mc = document.getElementById('pwd-modal-content');
    const mesiNomi = [
      'Gennaio',
      'Febbraio',
      'Marzo',
      'Aprile',
      'Maggio',
      'Giugno',
      'Luglio',
      'Agosto',
      'Settembre',
      'Ottobre',
      'Novembre',
      'Dicembre',
    ];
    let prev =
      '<div style="text-align:center;margin-bottom:16px"><h3 style="font-family:Playfair Display,serif;margin-bottom:4px">Importa Compleanni</h3><p style="color:var(--muted);font-size:var(--fs-md,.875rem)">File: ' +
      escP(file.name) +
      '</p></div>';
    // KPI cards
    prev += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--ink)">' +
      compleanni.length +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Compleanni</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--c-verde,#2c6e49)">' +
      esistenti.length +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Clienti esistenti</div></div>';
    prev +=
      '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--c-azzurro,#1f6fa3)">' +
      nuovi.length +
      '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Familiari / Nuovi</div></div>';
    if (daConfermare.length)
      prev +=
        '<div style="flex:1;min-width:80px;background:var(--paper2);border-radius:3px;padding:10px;text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-xl,1.25rem);font-weight:700;color:var(--c-arancio,#b85c0e)">' +
        daConfermare.length +
        '</div><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Da confermare</div></div>';
    prev += '</div>';
    // Nomi simili: l'operatore decide per ognuno (default: salta). Nessuna rinomina automatica.
    if (daConfermare.length) {
      prev +=
        '<div style="margin-bottom:12px;padding:10px;background:rgba(230,126,34,0.08);border-left:3px solid #e67e22;border-radius:3px"><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.06em;text-transform:uppercase;color:var(--c-arancio,#b85c0e);font-weight:700;margin-bottom:6px">Nomi simili: conferma cosa fare</div>';
      daConfermare.forEach((m) => {
        prev +=
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;font-size:var(--fs-md,.875rem)"><strong>' +
          escP(m.nome) +
          '</strong><span style="color:var(--muted)">' +
          new Date(m.data + 'T12:00:00').toLocaleDateString('it-IT') +
          '</span><select class="import-compl-scelta" data-idx="' +
          m.idx +
          '" style="padding:3px 6px;border:1px solid var(--line);border-radius:2px;font-size:var(--fs-sm,.8125rem);background:var(--paper);color:var(--ink)"><option value="salta" selected>Salta</option><option value="aggiorna">Aggiorna data di ' +
          escP(m.nomeDB) +
          '</option><option value="nuovo">Crea nuovo cliente ' +
          escP(m.nome) +
          '</option></select></div>';
      });
      prev += '</div>';
    }
    // Raggruppa per mese
    const byMese = {};
    matched.forEach((m) => {
      const d = new Date(m.data + 'T12:00:00');
      const k = d.getMonth();
      if (!byMese[k]) byMese[k] = [];
      byMese[k].push(m);
    });
    prev += '<div style="max-height:350px;overflow-y:auto">';
    for (let mi = 0; mi < 12; mi++) {
      if (!byMese[mi] || !byMese[mi].length) continue;
      const lista = byMese[mi].sort((a, b) => {
        const da = new Date(a.data + 'T12:00:00').getDate();
        const db = new Date(b.data + 'T12:00:00').getDate();
        return da - db;
      });
      prev +=
        '<div style="margin-bottom:12px"><div style="font-size:var(--fs-sm,.8125rem);letter-spacing:.08em;text-transform:uppercase;color:var(--c-oro,#8b6914);font-weight:700;margin-bottom:6px;border-bottom:1px solid var(--line);padding-bottom:4px">' +
        mesiNomi[mi] +
        ' (' +
        lista.length +
        ')</div>';
      prev += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      lista.forEach((m) => {
        const d = new Date(m.data + 'T12:00:00');
        const giorno = d.getDate();
        const bg = m.simile ? 'rgba(230,126,34,0.1)' : m.isNew ? 'rgba(41,128,185,0.1)' : 'rgba(44,110,73,0.1)';
        const border = m.simile ? '#e67e22' : m.isNew ? '#2980b9' : '#2c6e49';
        const fuzzyNote = m.simile ? ' title="Simile a: ' + escP(m.nomeDB) + '" style="cursor:help"' : '';
        prev +=
          '<span style="font-size:var(--fs-sm,.8125rem);padding:3px 8px;border-radius:2px;background:' +
          bg +
          ';border:1px solid ' +
          border +
          '30;display:inline-flex;align-items:center;gap:4px"' +
          fuzzyNote +
          '><strong style="--cat:' +
          border +
          ';color:var(--cat)">' +
          giorno +
          '</strong> ' +
          escP(m.nome) +
          (m.isNew
            ? ' <span style="font-size:var(--fs-sm,.8125rem);color:var(--c-azzurro,#1f6fa3);font-weight:700">NEW</span>'
            : '') +
          (m.simile
            ? ' <span style="font-size:var(--fs-sm,.8125rem);color:var(--c-arancio,#b85c0e);font-weight:700">?</span>'
            : '') +
          '</span>';
      });
      prev += '</div></div>';
    }
    prev += '</div>';
    // Barra progresso
    prev +=
      '<div id="import-compl-progress" style="display:none;margin-top:12px"><div style="height:6px;border-radius:3px;background:var(--line);overflow:hidden"><div id="import-compl-bar" style="height:100%;width:0%;background:#8e44ad;border-radius:3px;transition:width .2s"></div></div><p id="import-compl-status" style="text-align:center;font-size:var(--fs-sm,.8125rem);color:var(--muted);margin-top:4px"></p></div>';
    prev +=
      '<div id="import-compl-btns" class="pwd-modal-btns" style="margin-top:16px"><button class="btn-modal-cancel" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')">Annulla</button><button class="btn-modal-ok" id="btn-conf-import-compl">Importa ' +
      compleanni.length +
      ' compleanni</button></div>';
    mc.innerHTML = prev;
    document.getElementById('pwd-modal').classList.remove('hidden');
    document.getElementById('btn-conf-import-compl').onclick = async function () {
      // Scelte sui nomi simili: aggiorna il cliente indicato, crea nuovo, oppure salta
      document.querySelectorAll('.import-compl-scelta').forEach((sel) => {
        const m = matched.find((x) => x.idx === parseInt(sel.dataset.idx));
        if (!m) return;
        if (sel.value === 'aggiorna') m.budgetId = m.simile.id;
        else if (sel.value === 'nuovo') m.isNew = true;
        else m.salta = true;
      });
      document.getElementById('import-compl-btns').style.display = 'none';
      document.getElementById('import-compl-progress').style.display = 'block';
      const bar = document.getElementById('import-compl-bar');
      const status = document.getElementById('import-compl-status');
      let nAggiornati = 0,
        nNuovi = 0,
        nSaltati = 0,
        nErrori = 0,
        done = 0;
      for (const m of matched) {
        if (m.salta) {
          nSaltati++;
        } else if (m.budgetId) {
          try {
            // Solo la data di nascita: il nome del cliente non si tocca mai in automatico
            const updateData = {
              data_nascita: m.data,
              aggiornato_da: getOperatore(),
              aggiornato_at: new Date().toISOString(),
            };
            const b = maisonBudgetCache.find((x) => x.id === m.budgetId);
            await secPatch('maison_budget', 'id=eq.' + m.budgetId, updateData);
            if (b) b.data_nascita = m.data;
            nAggiornati++;
          } catch (e) {
            nErrori++;
          }
        } else {
          try {
            const r = await secPost('maison_budget', {
              nome: m.nome,
              data_nascita: m.data,
              reparto_dip: currentReparto,
              aggiornato_da: getOperatore(),
              aggiornato_at: new Date().toISOString(),
            });
            if (r && r.length && r[0] && r[0].id) maisonBudgetCache.push(r[0]);
            nNuovi++;
          } catch (e) {
            nErrori++;
          }
        }
        done++;
        bar.style.width = Math.round((done / matched.length) * 100) + '%';
        status.textContent = done + '/' + matched.length + ' · ' + m.nome;
        if (done % 5 === 0) await new Promise((r) => setTimeout(r, 50));
      }
      // Riepilogo finale
      mc.innerHTML =
        '<div style="text-align:center;padding:20px"><div style="font-size:var(--fs-4xl,2.5rem);margin-bottom:8px">' +
        (nErrori ? '<i class="icx icx-avviso"></i>' : '<i class="icx icx-torta"></i>') +
        '</div><h3 style="font-family:Playfair Display,serif;margin-bottom:12px">Compleanni importati</h3><div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px"><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--c-verde,#2c6e49)">' +
        nAggiornati +
        '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Aggiornati</div></div><div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--c-azzurro,#1f6fa3)">' +
        nNuovi +
        '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Nuovi / Familiari</div></div>' +
        (nSaltati
          ? '<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--c-arancio,#b85c0e)">' +
            nSaltati +
            '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Saltati</div></div>'
          : '') +
        (nErrori
          ? '<div style="text-align:center"><div style="font-family:Playfair Display,serif;font-size:var(--fs-2xl,1.5rem);font-weight:700;color:var(--accent)">' +
            nErrori +
            '</div><div style="font-size:var(--fs-sm,.8125rem);color:var(--muted);text-transform:uppercase">Errori</div></div>'
          : '') +
        '</div><p style="font-size:var(--fs-md,.875rem);color:var(--muted)">I compleanni appariranno nella dashboard e nelle notifiche.</p><button class="btn-modal-ok" onclick="document.getElementById(\'pwd-modal\').classList.add(\'hidden\')" style="margin-top:12px">Chiudi</button></div>';
      renderMaisonBudgetUI();
      renderMaisonDashboard();
      logAzione(
        'Importa compleanni',
        compleanni.length + ' (' + nAggiornati + ' aggiornati, ' + nNuovi + ' nuovi, ' + nSaltati + ' saltati)',
      );
    };
  } catch (e) {
    toast('Errore lettura file: ' + e.message);
  }
}
// RIALLINEA NOMI: corregge nomi vecchi in costi_maison e spese_extra usando maison_budget come riferimento
// Correggi solo il cognome, non aggiungere nome di battesimo
function _soloCorrezioneCognome(nomeVecchio, matchBudget) {
  const tokensVecchio = nomeVecchio.trim().split(/\s+/);
  const tokensBudget = matchBudget.trim().split(/\s+/);
  // Se il vecchio è solo cognome e il budget ha cognome+nome, usa il cognome corretto (non aggiungere nome)
  // MA se il cognome è identico, ritorna il cognome (nessuna correzione ortografica necessaria)
  if (tokensVecchio.length === 1) {
    const cogCorretto = capitalizzaNome(tokensBudget[0]);
    if (cogCorretto.toLowerCase() === nomeVecchio.toLowerCase()) return nomeVecchio; // stesso cognome, nessun fix ortografico
    return cogCorretto;
  }
  return tokensVecchio
    .map((tv) => {
      const best =
        tokensBudget.find((tb) => tb.toLowerCase() === tv.toLowerCase()) ||
        tokensBudget.find((tb) => _levenshtein(tv.toLowerCase(), tb.toLowerCase()) <= 1) ||
        tokensBudget.find((tb) => tb.toLowerCase().replace(/\s/g, '') === tv.toLowerCase().replace(/\s/g, ''));
      return best ? capitalizzaNome(best) : capitalizzaNome(tv);
    })
    .join(' ');
}
// === COMPLETA NOME DA BUDGET (per nomi multipli con /) ===
// Usata quando l'utente scrive "Bonomelli/Grignani" → cerca i nomi completi "Bonomelli Pierluigi" e "Grignani [nome]"
// Ritorna: { nome: 'Cognome Nome' (esatto match unico), candidates: [...], needDisambiguation: boolean }
