/**
 * Diario Collaboratori · Casino Lugano SA
 * File: mini-scheda.js
 *
 * MINI-SCHEDA DEL COLLABORATORE: fermandosi mezzo secondo con il mouse su un nome
 * (ovunque nel programma) compare un riquadro con le informazioni essenziali; sul
 * telefono si apre tenendo premuto. Un clic sul nome apre la scheda completa come
 * prima. Un solo meccanismo per tutte le pagine:
 *  - nomi segnati esplicitamente (data-collab, riga del calendario);
 *  - qualsiasi testo breve che coincide con il nome di un collaboratore.
 * I dati seguono i permessi: turni solo a chi vede il Piano, vacanze/CGF/saldo
 * solo a chi vede Crediti; i dati riservati (categoria, giubilei, storico HR)
 * restano nella scheda completa.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  const ATTESA_MS = 500; // fermo sul nome prima di aprire
  const PRESSIONE_MS = 600; // telefono: tieni premuto
  const VALIDO_MS = 5 * 60 * 1000; // dati per persona tenuti 5 minuti
  let timer = null;
  let attivo = null; // elemento sotto il mouse
  let box = null;
  const cacheDati = {}; // nome -> { t, turni, crediti }

  // ---------- riconoscimento del nome ----------
  function _norm(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  function _mappaNomi() {
    const elenco = (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : []).map((c) => c.nome);
    if (_mappaNomi._n === elenco.length && _mappaNomi._m) return _mappaNomi._m;
    const m = new Map();
    elenco.forEach((n) => n && m.set(_norm(n), n));
    _mappaNomi._m = m;
    _mappaNomi._n = elenco.length;
    return m;
  }
  // nome del collaboratore indicato dall elemento (o null)
  function nomeDi(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.closest('#mini-scheda, input, textarea, select, option, .finestra-box')) return null;
    const segnato = el.closest('[data-collab], [data-mini]');
    if (segnato) return segnato.getAttribute('data-collab') || segnato.getAttribute('data-mini');
    // calendario del Piano: la cella con il nome
    const cellaNome = el.closest('td.piano-nome');
    if (cellaNome) {
      const tr = cellaNome.closest('tr[data-nome]');
      if (tr) return tr.dataset.nome;
    }
    // testo breve che coincide con un nome (anche con un piccolo seguito: "Rossi Mario *")
    let x = el;
    for (let i = 0; i < 2 && x; i++, x = x.parentElement) {
      if (x.children.length > 3) break;
      const t = _norm(x.textContent);
      if (!t || t.length > 70) continue;
      const m = _mappaNomi();
      if (m.has(t)) return m.get(t);
      // "nome" seguito da un segno o da una nota breve tra parentesi
      const pulito = t.replace(/\s*[*·(].*$/, '').trim();
      if (pulito && m.has(pulito)) return m.get(pulito);
    }
    return null;
  }

  // ---------- dati ----------
  function _oggi() {
    return typeof oggiLocale === 'function' ? oggiLocale() : new Date().toISOString().substring(0, 10);
  }
  function _piu(dstr, n) {
    const d = new Date(dstr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return typeof dataLocaleISO === 'function' ? dataLocaleISO(d) : d.toISOString().substring(0, 10);
  }
  function _vedePiano() {
    return typeof isVis !== 'function' || isVis('piano');
  }
  function _vedeCrediti() {
    return _vedePiano() && typeof pianoTabVisibile === 'function' && pianoTabVisibile('crediti');
  }
  async function _datiLenti(nome) {
    const c = cacheDati[nome];
    if (c && Date.now() - c.t < VALIDO_MS) return c;
    const out = { t: Date.now(), turni: null, crediti: null };
    try {
      if (typeof _pianoCaricaCfg === 'function') await _pianoCaricaCfg();
    } catch (e) {}
    if (_vedePiano()) {
      try {
        const oggi = _oggi();
        const righe =
          (await secGet(
            'piano?collaboratore=eq.' +
              encodeURIComponent(nome) +
              '&data=gte.' +
              oggi +
              '&data=lte.' +
              _piu(oggi, 3) +
              '&order=data.asc',
          )) || [];
        out.turni = righe;
      } catch (e) {
        out.turni = null;
      }
    }
    const info = (typeof _pianoCollabInfo === 'function' && _pianoCollabInfo(nome)) || null;
    if (
      _vedeCrediti() &&
      info &&
      typeof _pianoAppartieneAlReparto === 'function' &&
      _pianoAppartieneAlReparto(info) &&
      typeof _pianoCreditiDati === 'function'
    ) {
      try {
        const anno = parseInt(_oggi().substring(0, 4));
        const d = await _pianoCreditiDati(anno, [nome]);
        out.crediti = d && d[0] ? d[0] : null;
      } catch (e) {
        out.crediti = null;
      }
    }
    cacheDati[nome] = out;
    return out;
  }
  // avvisi del mese aperto nel Piano (se e caricato) + malattia in corso dal Diario
  function _avvisi(nome) {
    const out = [];
    try {
      if (
        typeof _pianoRighe !== 'undefined' &&
        _pianoRighe &&
        _pianoRighe.length &&
        typeof _pianoAvvisiVeloci === 'function'
      ) {
        const k =
          (typeof _pianoMeseSel !== 'undefined' ? _pianoMeseSel : '') + '|' + (_pianoReparto ? _pianoReparto() : '');
        if (!_avvisi._c || _avvisi._c.k !== k || Date.now() - _avvisi._c.t > 60000)
          _avvisi._c = { k: k, t: Date.now(), v: _pianoAvvisiVeloci() };
        const v = _avvisi._c.v;
        v.sett
          .filter((s) => s.nome === nome)
          .forEach((s) =>
            out.push('settimana ' + _pianoGgMm(s.lunedi) + ' oltre ' + v.max + ' ore (' + s.totale.toFixed(1) + ')'),
          );
        v.riposo
          .filter((s) => s.nome === nome)
          .forEach((s) => out.push('riposo attorno alla domenica ' + _pianoGgMm(s.domenica) + ' sotto il minimo'));
        const nReg = v.regole.filter((s) => s.nome === nome).length;
        if (nReg) out.push(nReg + (nReg === 1 ? ' regola' : ' regole') + ' da controllare nel mese');
      }
    } catch (e) {}
    try {
      const oggi = _oggi();
      const tipoMal = typeof nomeCorrente === 'function' ? nomeCorrente('Malattia') : 'Malattia';
      const inMal = (typeof datiCache !== 'undefined' ? datiCache : []).some(
        (e) =>
          e.nome === nome &&
          e.tipo === tipoMal &&
          typeof _pianoDateMalattia === 'function' &&
          _pianoDateMalattia(e.testo || '', e.data).includes(oggi),
      );
      if (inMal) out.push('in malattia oggi');
    } catch (e) {}
    return out;
  }

  // ---------- riquadro ----------
  function _esc(s) {
    return typeof escP === 'function' ? escP(s) : String(s || '').replace(/[<>&"]/g, '');
  }
  function _gg(dstr) {
    const g = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(dstr + 'T12:00:00').getDay()];
    return g + ' ' + dstr.substring(8, 10) + '.' + dstr.substring(5, 7);
  }
  function _html(nome, lenti) {
    const c = (typeof collaboratoriCache !== 'undefined' ? collaboratoriCache : []).find((x) => x.nome === nome) || {};
    const jolly = c.is_jolly || c.impiego === 'jolly';
    const settore = typeof repartoLabel === 'function' ? repartoLabel(c.reparto_dip || 'slots') : c.reparto_dip || '';
    const pct = c.percentuale != null && !jolly ? Math.round((parseFloat(c.percentuale) || 1) * 100) + '%' : '';
    const fine = c.data_fine_rapporto ? String(c.data_fine_rapporto).substring(0, 10) : '';
    let h = '<div class="ms-testa"><b>' + _esc(nome) + '</b>';
    h +=
      '<span class="ms-sotto">' +
      [settore, c.funzione, pct, jolly ? 'jolly' : 'fisso'].filter(Boolean).map(_esc).join(' · ') +
      '</span>';
    // data di fine contratto: solo per chi vede i dati HR (come nella scheda)
    if (fine && typeof puoVedereStoricoHr === 'function' && puoVedereStoricoHr())
      h += '<span class="ms-chip ms-rosso">ultimo giorno ' + _esc(fine.split('-').reverse().join('.')) + '</span>';
    h += '</div>';
    // turni
    if (_vedePiano()) {
      h += '<div class="ms-blocco"><div class="ms-et">Turni</div>';
      if (!lenti) h += '<div class="ms-attesa">caricamento...</div>';
      else if (!lenti.turni) h += '<div class="ms-attesa">non disponibili</div>';
      else {
        const per = {};
        lenti.turni.forEach((r) => (per[String(r.data).substring(0, 10)] = r));
        h += '<div class="ms-turni">';
        for (let i = 0; i < 4; i++) {
          const d = _piu(_oggi(), i);
          const r = per[d];
          const t = r && typeof _pianoTurnoInfo === 'function' ? _pianoTurnoInfo(r.codice) : null;
          const orario =
            r && r.ora_inizio && r.ora_fine
              ? String(r.ora_inizio).substring(0, 5) + '-' + String(r.ora_fine).substring(0, 5)
              : t
                ? String(t.ora_inizio).substring(0, 5) + '-' + String(t.ora_fine).substring(0, 5)
                : '';
          h +=
            '<div class="ms-giorno' +
            (i === 0 ? ' ms-oggi' : '') +
            '"><span>' +
            (i === 0 ? 'oggi' : _gg(d)) +
            '</span><b>' +
            _esc(r ? r.codice : '-') +
            '</b><small>' +
            _esc(orario) +
            '</small></div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    // crediti
    if (_vedeCrediti()) {
      const cr = lenti && lenti.crediti;
      if (!lenti)
        h += '<div class="ms-blocco"><div class="ms-et">Crediti</div><div class="ms-attesa">caricamento...</div></div>';
      else if (cr) {
        const voce = (et, v, u) =>
          v == null
            ? ''
            : '<div class="ms-voce"><span>' + et + '</span><b>' + _esc(String(v)) + (u || '') + '</b></div>';
        const saldo =
          cr.saldoOre != null ? voce('Saldo ore anno', (cr.saldoOre > 0 ? '+' : '') + cr.saldoOre, ' h') : '';
        h +=
          '<div class="ms-blocco"><div class="ms-et">Crediti ' +
          _oggi().substring(0, 4) +
          '</div>' +
          voce('Vacanze restano', cr.vac ? cr.vac.resta : null, ' g') +
          voce('CGF da dare', cr.cgf ? cr.cgf.resta : null) +
          saldo +
          (cr.cnp ? voce('Congedo non pagato', cr.cnp, ' g') : '') +
          '</div>';
      }
    }
    const av = _avvisi(nome);
    if (av.length)
      h +=
        '<div class="ms-blocco"><div class="ms-et">Da guardare</div>' +
        av.map((a) => '<div class="ms-avviso">' + _esc(a) + '</div>').join('') +
        '</div>';
    h += '<div class="ms-piede">clic sul nome: scheda completa</div>';
    return h;
  }
  function _posiziona(el, x, y) {
    if (!box) return;
    const r = el.getBoundingClientRect();
    const w = box.offsetWidth;
    const hgt = box.offsetHeight;
    let left = x != null ? x + 14 : r.left;
    let top = y != null ? y + 18 : r.bottom + 6;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, (y != null ? y : r.top) - hgt - 10);
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }
  async function apri(el, nome, x, y) {
    if (!box) {
      box = document.createElement('div');
      box.id = 'mini-scheda';
      box.setAttribute('role', 'tooltip');
      document.body.appendChild(box);
    }
    box.dataset.nome = nome;
    const pronti = cacheDati[nome] && Date.now() - cacheDati[nome].t < VALIDO_MS ? cacheDati[nome] : null;
    box.innerHTML = _html(nome, pronti);
    box.hidden = false;
    _posiziona(el, x, y);
    if (!pronti) {
      const lenti = await _datiLenti(nome);
      if (box && !box.hidden && box.dataset.nome === nome) {
        box.innerHTML = _html(nome, lenti);
        _posiziona(el, x, y);
      }
    }
  }
  function chiudi() {
    clearTimeout(timer);
    timer = null;
    attivo = null;
    if (box) box.hidden = true;
  }
  // esposta: cosi le pagine possono invalidare i dati dopo una modifica
  window.miniSchedaDimentica = function (nome) {
    if (nome) delete cacheDati[nome];
    else Object.keys(cacheDati).forEach((k) => delete cacheDati[k]);
  };

  // ---------- mouse ----------
  let ultimoTocco = 0; // sul telefono il tocco genera anche un finto "mouse sopra": si ignora
  document.addEventListener('mouseover', (ev) => {
    if (Date.now() - ultimoTocco < 1000) return;
    const nome = nomeDi(ev.target);
    if (!nome) {
      if (attivo && !attivo.contains(ev.target)) chiudi();
      return;
    }
    const el = ev.target;
    if (attivo === el) return;
    chiudi();
    attivo = el;
    const x = ev.clientX;
    const y = ev.clientY;
    timer = setTimeout(() => {
      if (attivo === el) apri(el, nome, x, y);
    }, ATTESA_MS);
  });
  document.addEventListener('mouseout', (ev) => {
    if (attivo && (!ev.relatedTarget || !attivo.contains(ev.relatedTarget))) chiudi();
  });
  document.addEventListener('scroll', chiudi, true);
  document.addEventListener('keydown', (ev) => ev.key === 'Escape' && chiudi());
  document.addEventListener('mousedown', chiudi, true);

  // ---------- telefono: tieni premuto ----------
  let premuto = null;
  document.addEventListener(
    'touchstart',
    (ev) => {
      ultimoTocco = Date.now();
      const t = ev.touches && ev.touches[0];
      const nome = nomeDi(ev.target);
      if (!nome || !t) {
        if (box && !box.hidden && !(ev.target.closest && ev.target.closest('#mini-scheda'))) chiudi();
        return;
      }
      const el = ev.target;
      premuto = setTimeout(() => {
        premuto = 'aperto';
        apri(el, nome, t.clientX, t.clientY);
      }, PRESSIONE_MS);
    },
    { passive: true },
  );
  const annullaPressione = () => {
    if (premuto && premuto !== 'aperto') clearTimeout(premuto);
    if (premuto !== 'aperto') premuto = null;
  };
  document.addEventListener('touchmove', annullaPressione, { passive: true });
  document.addEventListener('touchend', (ev) => {
    if (premuto === 'aperto') {
      // la pressione lunga non diventa anche un clic sul nome
      ev.preventDefault();
      premuto = null;
      return;
    }
    annullaPressione();
  });
  document.addEventListener('contextmenu', (ev) => {
    if (box && !box.hidden && ev.target.closest && !ev.target.closest('td.piano-cella')) ev.preventDefault();
  });

  // per le prove automatiche
  window._miniScheda = { nomeDi: nomeDi, apri: apri, chiudi: chiudi, html: _html, dati: _datiLenti };
})();
