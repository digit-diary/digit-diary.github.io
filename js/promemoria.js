/**
 * Diario Collaboratori — Casino Lugano SA
 * File: promemoria.js
 * Righe originali: 370
 * Estratto automaticamente da index.html
 */
// SEZIONE 12: PROMEMORIA E SCADENZE
// Promemoria, assegnazione operatori, notifiche push
// ================================================================
// PROMEMORIA OPERATORI
// ========================
let _pmFpInit = false;
function initPromemoriaUI() {
  // Flatpickr scadenza
  if (!_pmFpInit && window.flatpickr) {
    _pmFpInit = true;
    flatpickr('#pm-scadenza', {
      locale: 'it',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      allowInput: false,
      minDate: 'today',
    });
  }
  // Default assegnatario "tutti" (il widget custom multi-select gestisce il resto)
  const hidden = document.getElementById('pm-assegnato');
  if (hidden && !hidden.value) hidden.value = 'tutti';
  const btn = document.getElementById('pm-assegnato-btn');
  if (btn && hidden.value === 'tutti') btn.textContent = 'Tutti gli operatori';
  // Filtro operatori (questo resta un select normale)
  const ops = operatoriAuthCache
    .map((o) => o.nome)
    .filter((n) => {
      const rep = operatoriRepartoMap[n] || 'entrambi';
      return rep === currentReparto || rep === 'entrambi';
    })
    .sort();
  const fSel = document.getElementById('pm-filt-op');
  if (fSel) {
    const fcv = fSel.value;
    fSel.innerHTML =
      '<option value="">Tutti</option>' +
      ops.map((n) => '<option' + (n === fcv ? ' selected' : '') + '>' + escP(n) + '</option>').join('');
  }
}
async function salvaPromemoria() {
  const titolo = document.getElementById('pm-titolo').value.trim();
  const scadenza = document.getElementById('pm-scadenza').value;
  const descrizione = document.getElementById('pm-descrizione').value.trim();
  const assegnato = document.getElementById('pm-assegnato').value;
  const remindGiorni = parseInt((document.getElementById('pm-remind') || {}).value) || 0;
  const remindOra = (document.getElementById('pm-remind-ora') || {}).value || '08:00';
  if (!titolo) {
    toast('Inserisci un titolo');
    _highlightField('pm-titolo');
    return;
  }
  if (!scadenza) {
    toast('Seleziona una data di scadenza');
    _highlightField('pm-scadenza');
    return;
  }
  // Calcola data promemoria effettiva
  const dScad = new Date(scadenza + 'T12:00:00');
  dScad.setDate(dScad.getDate() - remindGiorni);
  const dataRemind =
    dScad.getFullYear() +
    '-' +
    String(dScad.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(dScad.getDate()).padStart(2, '0');
  const ripetizione = (document.getElementById('pm-ripetizione') || {}).value || null;
  const remindLabel =
    remindGiorni === 0 ? 'il giorno stesso alle ' + remindOra : remindGiorni + ' giorno/i prima alle ' + remindOra;
  const ripLabel = ripetizione
    ? {
        giornaliero: 'ogni giorno',
        settimanale: 'ogni settimana',
        mensile: 'ogni mese',
        semestrale: 'ogni 6 mesi',
        annuale: 'ogni anno',
      }[ripetizione]
    : '';
  const descFull =
    descrizione + (descrizione ? '\n' : '') + 'Promemoria: ' + remindLabel + (ripLabel ? '\nRipeti: ' + ripLabel : '');
  try {
    const rec = {
      titolo,
      descrizione: descFull,
      data_scadenza: scadenza,
      assegnato_a: assegnato,
      creato_da: getOperatore(),
      ripetizione,
    };
    const r = await secPost('promemoria', rec);
    promemoriaCache.push(r[0]);
    promemoriaCache.sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza));
    document.getElementById('pm-titolo').value = '';
    document.getElementById('pm-descrizione').value = '';
    const fp = document.getElementById('pm-scadenza');
    if (fp && fp._flatpickr) fp._flatpickr.clear();
    else fp.value = '';
    logAzione('Promemoria creato', titolo + ' → ' + assegnato + ' (' + scadenza + ')');
    renderPromemoria();
    aggiornaPromemoriaBadge();
    toast('Promemoria creato');
    // Push: gestisci CSV multi-destinatario
    const pushDests =
      assegnato === 'tutti'
        ? ['tutti']
        : assegnato
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s);
    inviaPush(pushDests, 'Promemoria: ' + titolo, (descrizione || titolo).substring(0, 120), 'promemoria', true);
  } catch (e) {
    toast('Errore creazione promemoria');
  }
}
async function completaPromemoria(id) {
  const op = getOperatore();
  try {
    await secPatch('promemoria', 'id=eq.' + id, {
      completata: true,
      completata_da: op,
      completata_at: new Date().toISOString(),
    });
    const p = promemoriaCache.find((x) => x.id === id);
    if (p) {
      p.completata = true;
      p.completata_da = op;
      p.completata_at = new Date().toISOString();
      // Se ripetitivo → crea prossima occorrenza
      if (p.ripetizione) {
        const d = new Date(p.data_scadenza + 'T12:00:00');
        if (p.ripetizione === 'giornaliero') d.setDate(d.getDate() + 1);
        else if (p.ripetizione === 'settimanale') d.setDate(d.getDate() + 7);
        else if (p.ripetizione === 'mensile') d.setMonth(d.getMonth() + 1);
        else if (p.ripetizione === 'semestrale') d.setMonth(d.getMonth() + 6);
        else if (p.ripetizione === 'annuale') d.setFullYear(d.getFullYear() + 1);
        const nuovaData =
          d.getFullYear() +
          '-' +
          String(d.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(d.getDate()).padStart(2, '0');
        try {
          const nr = await secPost('promemoria', {
            titolo: p.titolo,
            descrizione: p.descrizione,
            data_scadenza: nuovaData,
            assegnato_a: p.assegnato_a,
            creato_da: p.creato_da,
            ripetizione: p.ripetizione,
          });
          promemoriaCache.push(nr[0]);
          toast('Prossimo: ' + nuovaData);
        } catch (e) {}
      }
    }
    logAzione('Promemoria completato', p ? p.titolo : '');
    renderPromemoria();
    aggiornaPromemoriaBadge();
    toast('Completato!');
  } catch (e) {
    toast('Errore completamento');
  }
}
async function riattivaPromemoria(id) {
  try {
    await secPatch('promemoria', 'id=eq.' + id, { completata: false, completata_da: null, completata_at: null });
    const p = promemoriaCache.find((x) => x.id === id);
    if (p) {
      p.completata = false;
      p.completata_da = null;
      p.completata_at = null;
    }
    renderPromemoria();
    aggiornaPromemoriaBadge();
  } catch (e) {
    toast('Errore aggiornamento promemoria');
  }
}
async function eliminaPromemoria(id) {
  if (!confirm('Eliminare questo promemoria?')) return;
  try {
    await secDel('promemoria', 'id=eq.' + id);
    promemoriaCache = promemoriaCache.filter((x) => x.id !== id);
    logAzione('Promemoria eliminato', 'ID ' + id);
    renderPromemoria();
    aggiornaPromemoriaBadge();
    toast('Eliminato');
  } catch (e) {
    toast('Errore eliminazione promemoria');
  }
}
function getPromemoriaFiltrati() {
  const op = getOperatore();
  const admin = isAdmin();
  const stato = (document.getElementById('pm-filt-stato') || {}).value || 'attivi';
  const filtOp = (document.getElementById('pm-filt-op') || {}).value || '';
  return promemoriaCache.filter((p) => {
    if (stato === 'attivi' && p.completata) return false;
    if (stato === 'completati' && !p.completata) return false;
    if (filtOp && p.assegnato_a !== filtOp && p.assegnato_a !== 'tutti') return false;
    // Operatore: vede solo i suoi (assegnati a lui o a "tutti")
    // Admin: vede tutto
    if (!admin && p.assegnato_a !== op && p.assegnato_a !== 'tutti') return false;
    return true;
  });
}
function renderPromemoria() {
  const data = getPromemoriaFiltrati();
  const el = document.getElementById('promemoria-list');
  if (!el) return;
  const oggi = new Date().toISOString().split('T')[0];
  const op = getOperatore();
  const admin = isAdmin();
  if (!data.length) {
    el.innerHTML =
      '<div class="empty-state"><p>Nessun promemoria</p><small>Crea un nuovo promemoria per assegnare compiti agli operatori</small></div>';
    return;
  }
  el.innerHTML = data
    .map((p) => {
      const scaduto = !p.completata && p.data_scadenza < oggi;
      const prossimo =
        !p.completata && !scaduto && p.data_scadenza <= new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      const mio = _includeOpInCsv(p.assegnato_a, op);
      const bgStyle = p.completata
        ? 'opacity:.6;border-left:3px solid #2c6e49'
        : scaduto
          ? 'border-left:3px solid var(--accent);background:rgba(192,57,43,0.05)'
          : prossimo
            ? 'border-left:3px solid #e67e22;background:rgba(230,126,34,0.05)'
            : 'border-left:3px solid var(--line)';
      return (
        '<div class="scad-item" style="' +
        bgStyle +
        ';padding:14px 0;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:10px;width:100%;flex-wrap:wrap"><span class="scad-date' +
        (scaduto ? ' overdue' : '') +
        '">' +
        new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span><strong style="flex:1;font-size:1rem;' +
        (p.completata ? 'text-decoration:line-through' : '') +
        '">' +
        escP(p.titolo) +
        '</strong><span style="font-size:.78rem;padding:2px 8px;border-radius:2px;background:' +
        (p.assegnato_a === 'tutti' ? 'var(--accent2)' : '#2980b9') +
        ';color:white;font-weight:600">' +
        escP(p.assegnato_a === 'tutti' ? 'Tutti' : p.assegnato_a) +
        '</span>' +
        (scaduto ? '<span style="font-size:.75rem;color:var(--accent);font-weight:700">SCADUTO</span>' : '') +
        (p.completata
          ? '<span style="font-size:.78rem;color:#2c6e49;font-weight:600">Fatto da ' +
            escP(p.completata_da || '?') +
            ' il ' +
            new Date(p.completata_at).toLocaleDateString('it-IT') +
            '</span>'
          : '') +
        '<div style="display:flex;gap:6px">' +
        (!p.completata
          ? '<button class="btn-act pin" onclick="completaPromemoria(' +
            p.id +
            ')" style="color:#2c6e49;border-color:#2c6e49">Fatto</button>'
          : '<button class="btn-act tipo" onclick="riattivaPromemoria(' + p.id + ')">Riattiva</button>') +
        (admin ? '<button class="btn-act del" onclick="eliminaPromemoria(' + p.id + ')">Elimina</button>' : '') +
        '</div></div>' +
        (p.descrizione
          ? '<div style="width:100%;padding:6px 0 0;color:var(--muted);font-size:.88rem">' +
            esc(p.descrizione) +
            '</div>'
          : '') +
        '<div style="width:100%;font-size:.72rem;color:var(--muted);margin-top:4px">Creato da ' +
        escP(p.creato_da || 'Admin') +
        '</div></div>'
      );
    })
    .join('');
}
function aggiornaPromemoriaBadge() {
  const op = getOperatore();
  const oggi = new Date().toISOString().split('T')[0];
  const miei = promemoriaCache.filter((p) => !p.completata && _includeOpInCsv(p.assegnato_a, op));
  const scaduti = miei.filter((p) => p.data_scadenza < oggi);
  const badge = document.getElementById('promemoria-badge');
  if (!badge) return;
  if (miei.length) {
    badge.style.display = 'inline';
    badge.textContent = miei.length;
    badge.style.background = scaduti.length ? 'var(--accent)' : 'var(--accent2)';
  } else {
    badge.style.display = 'none';
  }
}
function _getDataRemindGlobal(p) {
  const m = (p.descrizione || '').match(/Promemoria: (\d+) giorno\/i prima/);
  if (m) {
    const d = new Date(p.data_scadenza + 'T12:00:00');
    d.setDate(d.getDate() - parseInt(m[1]));
    return d.toISOString().split('T')[0];
  }
  if ((p.descrizione || '').includes('il giorno stesso')) return p.data_scadenza;
  return p.data_scadenza;
}
function mostraPromemoriaLogin() {
  const op = getOperatore();
  if (!op) return;
  const oggi = new Date().toISOString().split('T')[0];
  const miei = promemoriaCache.filter((p) => !p.completata && _includeOpInCsv(p.assegnato_a, op));
  // Solo scaduti (data passata) + quelli il cui reminder è per oggi
  const scaduti = miei.filter((p) => p.data_scadenza < oggi);
  const reminderOggi = miei.filter((p) => {
    const dr = _getDataRemindGlobal(p);
    return dr <= oggi && p.data_scadenza >= oggi;
  });
  const lista = [...scaduti, ...reminderOggi];
  if (!lista.length) return;
  if (scaduti.length) {
    mostraNotifBanner(
      'promemoria',
      'Promemoria scaduti',
      scaduti.length +
        ' scadut' +
        (scaduti.length === 1 ? 'o' : 'i') +
        ': ' +
        scaduti
          .map((p) => p.titolo)
          .join(', ')
          .substring(0, 60),
      () => switchPage('promemoria')
    );
    inviaNotifica(
      'Promemoria scaduti',
      scaduti.length +
        ' promemoria scadut' +
        (scaduti.length === 1 ? 'o' : 'i') +
        ': ' +
        scaduti
          .map((p) => p.titolo)
          .join(', ')
          .substring(0, 80)
    );
  } else if (reminderOggi.length) {
    mostraNotifBanner(
      'promemoria',
      'Promemoria',
      reminderOggi
        .map((p) => p.titolo)
        .join(', ')
        .substring(0, 60),
      () => switchPage('promemoria')
    );
  }
  const mc = document.getElementById('note-modal-content');
  let html = '<h3 style="margin-bottom:4px">Promemoria</h3>';
  if (scaduti.length)
    html +=
      '<p style="color:var(--accent);font-size:.85rem;margin-bottom:12px;font-weight:600">' +
      scaduti.length +
      ' promemoria scadut' +
      (scaduti.length === 1 ? 'o' : 'i') +
      '!</p>';
  else html += '<p style="color:var(--muted);font-size:.82rem;margin-bottom:12px">Promemoria per oggi</p>';
  html += lista
    .map((p) => {
      const scaduto = p.data_scadenza < oggi;
      return (
        '<div style="background:var(--paper2);border-radius:3px;padding:12px;margin-bottom:8px;border-left:3px solid ' +
        (scaduto ? 'var(--accent)' : '#e67e22') +
        '"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><strong>' +
        escP(p.titolo) +
        '</strong><span style="font-size:.78rem;color:' +
        (scaduto ? 'var(--accent)' : '#e67e22') +
        ';font-weight:600">' +
        new Date(p.data_scadenza + 'T12:00:00').toLocaleDateString('it-IT') +
        '</span></div>' +
        (p.descrizione ? '<div style="font-size:.85rem;color:var(--muted)">' + esc(p.descrizione) + '</div>' : '') +
        '</div>'
      );
    })
    .join('');
  html +=
    '<div class="pwd-modal-btns"><button class="btn-modal-ok" onclick="document.getElementById(\'note-modal\').classList.add(\'hidden\');switchPage(\'promemoria\')">Vedi tutti</button><button class="btn-modal-cancel" onclick="document.getElementById(\'note-modal\').classList.add(\'hidden\')">Chiudi</button></div>';
  mc.innerHTML = html;
  document.getElementById('note-modal').classList.remove('hidden');
}

// ========================
// COSTI MAISON
// ========================
let _maisonFpInit = false;
function initMaisonFlatpickr() {
  if (_maisonFpInit || !window.flatpickr) return;
  _maisonFpInit = true;
  const o = {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
    onChange: () => renderMaisonDashboard(),
  };
  flatpickr('#maison-filt-dal', o);
  flatpickr('#maison-filt-al', o);
  _initNascitaInput('maison-budget-nascita');
  flatpickr('#maison-man-data', {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
    defaultDate: getGiornataCasino(),
  });
  flatpickr('#regalo-data', {
    locale: 'it',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    allowInput: false,
  });
}
function _trovaNomeSimileMaison(nome) {
  const nomi = [
    ...new Set(
      getMaisonReparto()
        .map((r) => r.nome)
        .concat(getBudgetReparto().map((b) => b.nome))
    ),
  ];
  const nl = nome.toLowerCase();
  const nlNoSp = nl.replace(/\s/g, '');
  const exact = nomi.find((n) => n.toLowerCase() === nl);
  if (exact) return { nome: exact, tipo: 'esatto' };
  // Match senza spazi (Delledonne = Delle Donne)
  for (const n of nomi) {
    if (n.toLowerCase().replace(/\s/g, '') === nlNoSp) return { nome: n, tipo: 'simile' };
  }
  // Levenshtein RIMOSSO su richiesta utente: causava falsi positivi tipo Sala→Sula, Erba→Urba.
  // Cognomi corti non possono essere corretti via fuzzy senza errori.
  // Restano: match esatto, senza spazi, contenuto parziale, cognome, any-token.
  // Contenuto parziale
  for (const n of nomi) {
    if (
      nl.length >= 4 &&
      (n.toLowerCase().includes(nl) || nl.includes(n.toLowerCase())) &&
      Math.abs(n.length - nome.length) <= 3
    )
      return { nome: n, tipo: 'simile' };
  }
  // Match cognome (primo token): "Leccese" → "Leccese Pietro"
  const _cognome = nl.split(/\s+/)[0];
  if (_cognome.length >= 3) {
    for (const n of nomi) {
      if (n.toLowerCase().split(/\s+/)[0] === _cognome) return { nome: n, tipo: 'simile' };
    }
  }
  // Match su qualsiasi token: "Baroni" → "Micheli Baroni Cristina"
  if (_cognome.length >= 3) {
    for (const n of nomi) {
      const tokens = n.toLowerCase().split(/\s+/);
      if (tokens.some((t) => t === _cognome)) return { nome: n, tipo: 'simile' };
    }
  }
  return null;
}
const BUONO_VALORI = { BU: 15, BL: 40, CG: 80, WL: 40 };
function _contaBuoni(righe, tipo) {
  return righe
    .filter((r) => r.tipo_buono === tipo)
    .reduce((s, r) => {
      const m = (r.note || '').match(/(\d+)\s*(?:BU|BL|CG|WL)/i);
      return s + (m ? parseInt(m[1]) : 1);
    }, 0);
}
function _parseMaisonNome(raw) {
  let nome = raw.trim(),
    tipoBuono = null,
    note = '',
    isSeven = false;
  const tipiBuono = []; // Array di {tipo, qty} per righe con più tipi
  // 0. Rimuovi info prezzo tra parentesi: (CHF 202.15 + CHF 50.40), (chf..), ecc.
  nome = nome.replace(/\([^)]*(?:chf|fr\.?)[^)]*\)/gi, '').trim();
  // 0b. Rimuovi "del DD.MM.YYYY" o "del DD/MM" alla fine (es. "Degustazione Giapponese del 14.02.2026")
  nome = nome.replace(/\s+del\s+\d{1,2}[.\/]\d{1,2}(?:[.\/]\d{2,4})?\s*$/i, '').trim();
  // 1. Estrai note tra parentesi (quelle rimaste dopo step 0)
  const pMatch = nome.match(/\(([^)]+)\)/);
  if (pMatch) {
    note = pMatch[1].trim();
    nome = nome.replace(pMatch[0], '').trim();
  }
  // 2. SEVEN — qualsiasi variante (seven, Seven, SEVEN, attaccato, separato) — cerca anche in note
  if (/seven/i.test(nome) || /seven/i.test(note) || /\(se\b/i.test(raw)) {
    isSeven = true;
    nome = nome.replace(/seven/gi, '').trim();
  }
  // 3. WELCOME LOUNGE — cerca in nome, note e raw
  const _checkWL = nome + ' ' + note + ' ' + raw;
  const _wlM = (nome + ' ' + note).match(/(\d*)\s*(?:welcome\s*lounge|w\.?\s*lounge|\bw\.?\s*l\.?\b)/i);
  if (_wlM || /welcome\s*lounge|w\.?\s*lounge|\bw\.?\s*l\.?\b/i.test(_checkWL)) {
    const _wlQty = _wlM && _wlM[1] ? parseInt(_wlM[1]) : 1;
    tipiBuono.push({ tipo: 'WL', qty: _wlQty });
    if (!tipoBuono) tipoBuono = 'WL';
    note = (note ? note + ', ' : '') + 'Welcome Lounge';
    nome = nome.replace(/\d*\s*(?:welcome\s*lounge|w\.?\s*lounge|\bw\.?\s*l\.?\b)/gi, '').trim();
  }
  // 4. COUPON GOURMET — cerca in nome, note e raw
  const _checkCG = nome + ' ' + note;
  const _cgM = (nome + ' ' + note).match(
    /(\d*)\s*(?:\b(?:coupon[ea]?|cpupon|cupon|coup|cena|buono|b\.?)\s*)*(?:gou?r?met|gouret|gourme\w?t?)\b/i
  );
  if (_cgM || /gou?r?met|gouret|gourme\w?t?\b/i.test(_checkCG)) {
    const _cgQty = _cgM && _cgM[1] ? parseInt(_cgM[1]) : 1;
    tipiBuono.push({ tipo: 'CG', qty: _cgQty || 1 });
    if (!tipoBuono) tipoBuono = 'CG';
    note = (note ? note + ', ' : '') + 'C. Gourmet';
    nome = nome
      .replace(
        /\d*\s*(?:\b(?:coupon[ea]?|cpupon|cupon|coup|cena|buono|b\.?)\s*)*(?:gou?r?met|gouret|gourme\w?t?)\b/gi,
        ''
      )
      .trim();
  }
  // 5. COUPON (senza gourmet) — coupon omaggio, coup, ecc.
  if (!tipoBuono) {
    const coupM = nome.match(/\b(coupon\s*\S*|coup)\b/gi);
    if (coupM) {
      note = (note ? note + ', ' : '') + coupM[0].trim();
      nome = nome.replace(coupM[0], '').trim();
    }
  }
  // 6. BU — qualsiasi variante
  const buM = nome.match(/\s*\+?\s*(\d*)\s*b\.?\s*u(?:nico)?\b/i);
  if (buM) {
    const _buQty = buM[1] ? parseInt(buM[1]) : 1;
    tipiBuono.push({ tipo: 'BU', qty: _buQty || 1 });
    if (!tipoBuono) tipoBuono = 'BU';
    note = (note ? note + ', ' : '') + (_buQty || 1) + 'BU';
    nome = nome.replace(buM[0], '').trim();
  }
  // 7. BL — qualsiasi variante
  const blM = nome.match(/\s*\+?\s*(\d*)\s*b\.?\s*l+(?:ounge)?\b/i);
  if (blM) {
    const _blQty = blM[1] ? parseInt(blM[1]) : 1;
    tipiBuono.push({ tipo: 'BL', qty: _blQty || 1 });
    if (!tipoBuono) tipoBuono = 'BL';
    note = (note ? note + ', ' : '') + (_blQty || 1) + 'BL';
    nome = nome.replace(blM[0], '').trim();
  }
  // 8. Note aggiuntive: direzione, pranzo, GD
  const noteM = nome.match(/\b(direzione|pranzo\s*\w*|GD)\b/gi);
  if (noteM) {
    note = (note ? note + ', ' : '') + noteM.join(', ');
    noteM.forEach((m) => {
      nome = nome.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });
    nome = nome.trim();
  }
  // 9. Pulizia: numeri isolati, +, virgolette, punti finali, "gruppo", e keyword buono rimaste
  nome = nome
    .replace(/\b\d+\b/g, '')
    .replace(/\+/g, '')
    .replace(/["''""«»]/g, '')
    .replace(/\.{2,}/g, '')
    .replace(/\.\s*$/, '')
    .trim();
  // Rimuovi keyword tipo buono rimaste nel nome (coupon, cena, gourmet, welcome, lounge, bl, bu, ecc.) incluso numeri attaccati
  nome = nome
    .replace(
      /\d*(coupon[ea]?|cpupon|cupon|coup|cena|gourmet|gouret|gourme\w*|welcome|lounge|buono|b\.?u\.?|b\.?l\.?)\b/gi,
      ''
    )
    .trim();
  nome = nome.replace(/^gruppo\s+/i, '').trim();
  nome = nome.replace(/\s{2,}/g, ' ').trim();
  // 10. Se resta solo keyword → vuoto
  if (
    /^(coupon|gourmet|cena|pranzo|coup|direzione|gd|cupon|cpupon|welcome|lounge|gruppo|seven|buono|unico)$/i.test(nome)
  )
    nome = '';
  return { nome: nome ? capitalizzaNome(nome) : '', tipoBuono, tipiBuono, note, isSeven };
}
async function caricaMaisonFile(input, forzaSostituisci) {
  const file = input.files[0];
  if (!file && !forzaSostituisci) return;
  if (forzaSostituisci && window._maisonPendingFile) {
    /* usa file pendente */
  } else {
    window._maisonPendingFile = file;
  }
  const f = window._maisonPendingFile;
  if (!f) return;
  const status = document.getElementById('maison-upload-status');
  status.textContent = 'Lettura file...';
  try {
    const XLSX = window.XLSX;
    if (!XLSX) {
      toast('Libreria XLSX non caricata');
      status.textContent = '';
      return;
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    // --- Pre-scan: disambiguazione nomi con cognome multiplo ---
    if (!window._maisonDisambigua) window._maisonDisambigua = {};
    if (!forzaSostituisci || !window._maisonDisambiguaDone) {
      const _budgetList = getBudgetReparto();
      const _cognomeBudgetMap = {};
      _budgetList.forEach((b) => {
        const cog = b.nome.toLowerCase().split(/\s+/)[0];
        if (!_cognomeBudgetMap[cog]) _cognomeBudgetMap[cog] = [];
        _cognomeBudgetMap[cog].push(b);
      });
      // Raccogli tutti i nomi dal file
      const _allFileNames = new Set();
      for (const sheetName of wb.SheetNames) {
        const dm = sheetName.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dm) continue;
        const sdata = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        let sRow = -1;
        for (let i = 0; i < Math.min(sdata.length, 5); i++) {
          const row = sdata[i];
          if (
            row.some((c) => String(c).toLowerCase().includes('cognome') || String(c).toLowerCase().includes('costo'))
          ) {
            sRow = i + 1;
            break;
          }
        }
        if (sRow === -1) sRow = 3;
        for (let i = sRow; i < sdata.length; i++) {
          const rn = String(sdata[i][0] || '').trim();
          if (!rn) continue;
          rn.split(/\s*\/\s*/).forEach((nr) => {
            const p = _parseMaisonNome(nr);
            if (p.nome && !p.isSeven) _allFileNames.add(p.nome);
          });
        }
      }
      // Controlla ambiguità
      const _ambigui = {};
      _allFileNames.forEach((nome) => {
        const nl = nome.toLowerCase();
        const cog = nl.split(/\s+/)[0];
        if (cog.length < 3) return;
        // Già nome completo che matcha esattamente? No disambigua
        if (_budgetList.find((b) => b.nome.toLowerCase() === nl)) return;
        // Già disambiguato in precedenza? Skip
        if (window._maisonDisambigua[cog]) return;
        const matches = _cognomeBudgetMap[cog];
        if (matches && matches.length > 1) {
          _ambigui[cog] = { fileName: nome, matches: matches };
        }
      });
      if (Object.keys(_ambigui).length > 0) {
        // Mostra modal disambiguazione
        const _catLabelsD = {
          full_maison: 'Full Maison',
          maison: 'Maison',
          direzione: 'Direzione',
          bu: 'Buono Unico',
          bl: 'Buono Lounge',
        };
        const _catColorsD = {
          full_maison: '#b8860b',
          maison: '#2980b9',
          direzione: '#8e44ad',
          bu: '#e67e22',
          bl: '#2c6e49',
        };
        let mHtml = '<h3>Nomi ambigui trovati</h3><div style="max-height:60vh;overflow-y:auto;text-align:left">';
        Object.entries(_ambigui).forEach(([cog, info]) => {
          mHtml += '<div style="margin-bottom:16px;padding:10px;background:var(--paper2);border-radius:4px">';
          mHtml +=
            '<div style="font-weight:600;margin-bottom:8px">&laquo;' +
            escP(info.fileName) +
            '&raquo; &rarr; ' +
            info.matches.length +
            ' clienti:</div>';
          info.matches.forEach((b, idx) => {
            const catLabel = b.categoria ? _catLabelsD[b.categoria] || '' : '—';
            const catColor = b.categoria ? _catColorsD[b.categoria] || 'var(--muted)' : 'var(--muted)';
            const badge =
              '<span class="mini-badge" style="background:' +
              catColor +
              ';margin-left:6px;font-size:.7rem">' +
              escP(catLabel) +
              '</span>';
            mHtml +=
              '<label style="display:block;padding:4px 0 4px 8px;cursor:pointer"><input type="radio" name="disamb_' +
              escP(cog) +
              '" value="' +
              escP(b.nome) +
              '" ' +
              (idx === 0 ? 'checked' : '') +
              ' style="margin-right:8px">' +
              escP(b.nome) +
              badge +
              '</label>';
          });
          mHtml += '</div>';
        });
        mHtml +=
          '</div><div class="pwd-modal-btns" style="margin-top:12px"><button class="btn-modal-ok" id="disamb-continua-btn">Continua importazione</button></div>';
        const modalBox = document.getElementById('pwd-modal-content');
        modalBox.innerHTML = mHtml;
        document.getElementById('pwd-modal').classList.remove('hidden');
        // Aspetta click su "Continua importazione"
        await new Promise((resolve) => {
          document.getElementById('disamb-continua-btn').onclick = function () {
            // Salva selezioni
            Object.keys(_ambigui).forEach((cog) => {
              const sel = document.querySelector('input[name="disamb_' + cog + '"]:checked');
              if (sel) window._maisonDisambigua[cog] = sel.value;
            });
            document.getElementById('pwd-modal').classList.add('hidden');
            resolve();
          };
        });
        window._maisonDisambiguaDone = true;
      }
    }
    // --- Fine pre-scan disambiguazione ---
    let totalRows = 0,
      warnings = [],
      giorniNuovi = 0,
      giorniSaltati = [],
      giorniSostituiti = 0,
      sevenCount = 0,
      dupCount = 0;
    // Rileva giorni già presenti nel DB
    const giorniEsistenti = new Set(getMaisonReparto().map((r) => r.data_giornata));
    for (const sheetName of wb.SheetNames) {
      const dm = sheetName.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dm) continue;
      const dataGiornata = dm[3] + '-' + dm[2].padStart(2, '0') + '-' + dm[1].padStart(2, '0');
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      // Controlla se ci sono dati nel foglio
      let startRow = -1;
      for (let i = 0; i < Math.min(data.length, 5); i++) {
        const row = data[i];
        if (row.some((c) => String(c).toLowerCase().includes('cognome') || String(c).toLowerCase().includes('costo'))) {
          startRow = i + 1;
          break;
        }
      }
      if (startRow === -1) startRow = 3;
      let hasDati = false;
      for (let i = startRow; i < data.length; i++) {
        const rn = String(data[i][0] || '').trim();
        const px = parseInt(data[i][1]) || 0;
        const co = parseFloat(String(data[i][2]).replace(',', '.')) || 0;
        if (rn && (px || co)) {
          hasDati = true;
          break;
        }
      }
      if (!hasDati) continue;
      // Se giorno già esiste e non forzato → salta
      if (giorniEsistenti.has(dataGiornata) && !forzaSostituisci) {
        giorniSaltati.push(new Date(dataGiornata + 'T12:00:00').toLocaleDateString('it-IT'));
        continue;
      }
      if (giorniEsistenti.has(dataGiornata)) {
        giorniSostituiti++;
      } else {
        giorniNuovi++;
      }
      // Cancella dati esistenti per questa data (solo reparto corrente)
      await secDel('costi_maison', 'data_giornata=eq.' + dataGiornata + '&reparto_dip=eq.' + currentReparto);
      // Cancella anche spese_extra Seven di questa data (evita duplicati su reimport)
      await secDel(
        'spese_extra',
        'data_spesa=eq.' + dataGiornata + '&reparto_dip=eq.' + currentReparto + '&luogo=eq.Ristorante%20Seven'
      );
      // Parsing righe
      const _giornoDuplicati = new Set();
      for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        const rawNome = String(row[0] || '').trim();
        if (!rawNome) continue;
        const px = parseInt(row[1]) || 0;
        const costo = parseFloat(String(row[2]).replace(',', '.')) || 0;
        if (!px && !costo) continue;
        if (!rawNome && costo) continue;
        const nomiRaw = rawNome.split(/\s*\/\s*/);
        // Parsa tutti i nomi e conta quelli non-Seven
        const parsedAll = nomiRaw.map((nr) => _parseMaisonNome(nr));
        const nNomiNoSeven = parsedAll.filter((p) => !p.isSeven && p.nome).length;
        const nNomi = nNomiNoSeven || 1;
        const rigaHaSeven = parsedAll.some((p) => p.isSeven);
        // Auto-calcola quantità buoni dal costo se non specificata nel testo
        parsedAll.forEach((p) => {
          if (p.tipoBuono && BUONO_VALORI[p.tipoBuono]) {
            const valBuono = BUONO_VALORI[p.tipoBuono];
            // Calcola qty dal costo: se supera il valore di 1 buono, sono 2+
            if (p.tipiBuono && p.tipiBuono.length === 1 && p.tipiBuono[0].qty <= 1) {
              const calcQty = Math.ceil(costo / valBuono);
              if (calcQty >= 1) {
                p.tipiBuono[0].qty = calcQty;
                p.note = calcQty + p.tipoBuono;
              }
            }
          }
        });
        // Se un nome nel gruppo ha tipo_buono, calcola splitting intelligente
        const gruppoTipo = parsedAll.find((p) => p.tipoBuono);
        let _grpBuonoCosto = 0,
          _grpRestoCosto = costo;
        if (gruppoTipo && nNomi > 1 && BUONO_VALORI[gruppoTipo.tipoBuono]) {
          const qMatch = (gruppoTipo.note || '').match(/(\d+)\s*(BU|BL|CG|WL)/i);
          const qTot = qMatch ? parseInt(qMatch[1]) : 1;
          _grpBuonoCosto = Math.min(qTot * BUONO_VALORI[gruppoTipo.tipoBuono], costo);
          _grpRestoCosto = costo - _grpBuonoCosto;
        }
        for (let _ni = 0; _ni < nomiRaw.length; _ni++) {
          const parsed = parsedAll[_ni];
          if (!parsed.nome) continue;
          // Se questo nome è Seven stesso (solo "Seven" senza cognome) → skip
          if (parsed.isSeven && !parsed.nome) continue;
          // Se la riga contiene Seven → tutti i nomi vanno in spese_extra
          if (rigaHaSeven) {
            const _isPranzo = /pranzo/i.test(rawNome) || /pranzo/i.test(parsed.note);
            const seRec = {
              beneficiario: parsed.nome,
              tipo: _isPranzo ? 'pranzo_esterno' : 'cena_esterna',
              descrizione:
                'Ristorante Seven' +
                (_isPranzo ? ' (pranzo)' : '') +
                ' (da formulario)' +
                (parsed.note ? ', ' + parsed.note : ''),
              importo: Math.round((costo / nNomi) * 100) / 100,
              data_spesa: dataGiornata,
              luogo: 'Ristorante Seven',
              operatore: getOperatore(),
              reparto_dip: currentReparto,
            };
            try {
              await secPost('spese_extra', seRec);
              totalRows++;
              sevenCount++;
            } catch (e) {}
            continue;
          }
          // Disambiguazione: se il cognome è stato scelto dall'utente, usa quello
          if (window._maisonDisambigua) {
            const _dCog = parsed.nome.toLowerCase().split(/\s+/)[0];
            if (_dCog.length >= 3 && window._maisonDisambigua[_dCog]) {
              const _chosenName = window._maisonDisambigua[_dCog];
              if (parsed.nome.toLowerCase() !== _chosenName.toLowerCase()) {
                warnings.push(parsed.nome + ' → disambiguato in "' + _chosenName + '"');
                parsed.nome = _chosenName;
              }
            }
          }
          const simile = _trovaNomeSimileMaison(parsed.nome);
          if (simile && simile.tipo === 'simile') {
            // Correggi solo il cognome, non aggiungere il nome di battesimo
            const _corretto = _soloCorrezioneCognome(parsed.nome, simile.nome);
            if (_corretto.toLowerCase() !== parsed.nome.toLowerCase()) {
              warnings.push(parsed.nome + ' → corretto in "' + _corretto + '"');
              parsed.nome = _corretto;
            }
          }
          const _dupKey = parsed.nome.toLowerCase() + '|' + dataGiornata;
          if (_giornoDuplicati.has(_dupKey)) {
            dupCount++;
            warnings.push(
              'Duplicato: ' +
                parsed.nome +
                ' (' +
                new Date(dataGiornata + 'T12:00:00').toLocaleDateString('it-IT') +
                ')'
            );
          } else {
            _giornoDuplicati.add(_dupKey);
          }
          // Calcola costo per questo nome nel gruppo
          let _nomeCosto;
          if (gruppoTipo && nNomi > 1 && BUONO_VALORI[gruppoTipo.tipoBuono]) {
            _nomeCosto = parsed.tipoBuono
              ? Math.round(_grpBuonoCosto * 100) / 100
              : Math.round((_grpRestoCosto / (nNomi - 1)) * 100) / 100;
          } else {
            _nomeCosto = Math.round((costo / nNomi) * 100) / 100;
          }
          // Se ha più tipi buono (es. 1BL + 2CG), crea righe separate
          if (parsed.tipiBuono && parsed.tipiBuono.length > 1) {
            const totQty = parsed.tipiBuono.reduce((s, t) => s + t.qty, 0);
            for (const tb of parsed.tipiBuono) {
              const quotaCosto = Math.round(((_nomeCosto * tb.qty) / totQty) * 100) / 100;
              const rec = {
                data_giornata: dataGiornata,
                nome: parsed.nome,
                px: Math.round(((px / nNomi) * tb.qty) / totQty) || 1,
                costo: quotaCosto,
                tipo_buono: tb.tipo,
                note:
                  tb.qty +
                  tb.tipo +
                  (parsed.tipiBuono.length > 1
                    ? ' (da ' + parsed.tipiBuono.map((t) => t.qty + t.tipo).join('+') + ')'
                    : ''),
                gruppo: nNomi > 1 ? capitalizzaNome(rawNome) : '',
                operatore: getOperatore(),
                reparto_dip: currentReparto,
              };
              try {
                await secPost('costi_maison', rec);
                totalRows++;
              } catch (e) {}
            }
          } else {
            const rec = {
              data_giornata: dataGiornata,
              nome: parsed.nome,
              px: Math.round(px / nNomi) || 1,
              costo: _nomeCosto,
              tipo_buono: parsed.tipoBuono,
              note: parsed.note,
              gruppo: nNomi > 1 ? capitalizzaNome(rawNome) : '',
              operatore: getOperatore(),
              reparto_dip: currentReparto,
            };
            try {
              await secPost('costi_maison', rec);
              totalRows++;
            } catch (e) {}
          }
        }
      }
    }
    maisonCache = await secGet('costi_maison?order=data_giornata.desc');
    if (sevenCount) speseExtraCache = await secGet('spese_extra?order=data_spesa.desc');
    // Riepilogo
    let msg = '';
    if (totalRows)
      msg +=
        '<span style="color:#2c6e49;font-weight:600">' +
        totalRows +
        ' righe importate' +
        (giorniNuovi ? ' (' + giorniNuovi + ' giorni nuovi)' : '') +
        (giorniSostituiti ? ' (' + giorniSostituiti + ' giorni aggiornati)' : '') +
        '</span>';
    if (giorniSaltati.length) {
      msg +=
        '<br><span style="color:var(--accent2);font-size:.82rem">Giorni già presenti (saltati): ' +
        giorniSaltati.join(', ') +
        '</span>';
      msg +=
        ' <button onclick="caricaMaisonFile(document.getElementById(\'maison-file-input\'),true)" style="font-size:.78rem;padding:3px 10px;cursor:pointer;border:1px solid var(--accent);color:var(--accent);background:none;border-radius:2px;font-family:Source Sans 3,sans-serif;font-weight:600;margin-left:6px">Sostituisci tutto</button>';
    }
    if (!totalRows && !giorniSaltati.length) msg = '<span style="color:var(--muted)">Nessun dato nuovo trovato</span>';
    if (dupCount) {
      msg +=
        '<br><span style="color:#c0392b;font-size:.82rem;font-weight:600">⚠ ' +
        dupCount +
        ' duplicati trovati nello stesso giorno (inseriti comunque)</span>';
    }
    const warnSimili = warnings.filter((w) => !w.startsWith('Duplicato:'));
    if (warnSimili.length) {
      const uniq = [...new Set(warnSimili)];
      msg +=
        '<br><span style="color:var(--accent);font-size:.82rem">Nomi simili: ' +
        uniq.slice(0, 5).join('; ') +
        '</span>';
    }
    if (sevenCount)
      msg +=
        '<br><span style="color:#8e44ad;font-size:.82rem">' +
        sevenCount +
        ' righe "Seven" spostate in Spese Extra</span>';
    status.innerHTML = msg;
    if (totalRows) {
      toast(totalRows + ' righe importate');
      logAzione('Import Maison', totalRows + ' righe da ' + f.name);
    } else if (giorniSaltati.length) toast(giorniSaltati.length + ' giorni già presenti (saltati)');
    renderMaisonDashboard();
    renderMaisonBudgetUI();
    renderMaisonBudgetAlerts();
    renderSpeseExtra();
    if (totalRows)
      getBudgetReparto().forEach(function (b) {
        checkBudgetPushAfterInsert(b.nome);
      });
    if (forzaSostituisci || !giorniSaltati.length) {
      window._maisonPendingFile = null;
      window._maisonDisambigua = {};
      window._maisonDisambiguaDone = false;
    }
  } catch (e) {
    console.error(e);
    status.textContent = 'Errore: ' + e.message;
    toast('Errore importazione');
  }
  input.value = '';
}
// TOGGLE SEZIONI
function toggleSezione(id, btn) {
  var el = document.getElementById(id);
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? '' : 'none';
  if (btn) btn.innerHTML = hidden ? '&#9650; Nascondi' : '&#9660; Mostra';
}
// ================================================================
