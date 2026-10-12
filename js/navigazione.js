/**
 * Diario Collaboratori · Casino Lugano SA
 * © 2026 Suisse Prestige Sagl, Via Rinaldo Simen 18, 6900 Lugano, Svizzera. Tutti i diritti riservati.
 * Uso consentito solo con licenza (vedi il file LICENZA).
 * File: navigazione.js
 * Freccia Indietro del browser e del telefono (09/10/2026, richiesta del titolare: "se premo
 * la freccia mi esce dal Diario"). Ogni cambio di pagina e di scheda del Piano entra nella
 * cronologia: Indietro e Avanti riportano alla pagina e alla scheda di prima invece di
 * uscire. In piu il "vai a" con contesto: l elemento di arrivo si apre, si porta in vista e
 * si evidenzia, e una barra in basso spiega perche si e li e riporta indietro (usato da
 * Piano > Regole, Chi puo fare cosa).
 */

let _navDaStoria = false;
let _navBarra = null; // { dest: {pagina, pianoTab}, origine: {...}, alRitorno: fn }

function _navStatoCorrente() {
  const pg = document.querySelector('.page.active');
  const pagina = pg ? pg.id.replace(/^page-/, '') : '';
  return {
    diario: 1,
    pagina: pagina,
    pianoTab: pagina === 'piano' && typeof _pianoTab !== 'undefined' ? _pianoTab : null,
  };
}
function _navUguali(a, b) {
  return !!a && !!b && a.pagina === b.pagina && (a.pianoTab || null) === (b.pianoTab || null);
}

// chiamata da switchPage e dal cambio di scheda del Piano
function navRegistra() {
  const s = _navStatoCorrente();
  if (_navBarra && !_navUguali(s, _navBarra.dest) && !_navUguali(s, _navBarra.origine)) navChiudiBarra();
  if (_navDaStoria || !s.pagina) return;
  const h = history.state;
  if (_navUguali(h, s)) return;
  try {
    // la prima pagina dopo l accesso sostituisce la voce iniziale: Indietro da li esce, come ogni sito
    if (!h || !h.diario) history.replaceState(s, '');
    else history.pushState(s, '');
  } catch (e) {}
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (!s || !s.diario || !s.pagina) return;
  if (typeof getOperatore === 'function' && !getOperatore()) return;
  _navDaStoria = true;
  try {
    const attuale = _navStatoCorrente();
    if (s.pagina === 'piano' && s.pianoTab && typeof _pianoTab !== 'undefined') {
      if (typeof _pianoFlushSalva === 'function') _pianoFlushSalva();
      _pianoTab = s.pianoTab;
      try {
        localStorage.setItem('piano_tab', s.pianoTab);
      } catch (err) {}
    }
    if (attuale.pagina !== s.pagina) switchPage(s.pagina);
    else if (s.pagina === 'piano' && typeof renderPiano === 'function') renderPiano();
  } finally {
    _navDaStoria = false;
  }
  if (_navBarra && _navUguali(s, _navBarra.origine)) {
    const fn = _navBarra.alRitorno;
    navChiudiBarra();
    if (fn) setTimeout(fn, 0);
  } else if (_navBarra && !_navUguali(s, _navBarra.dest)) navChiudiBarra();
});

// Apre le card chiuse che contengono l elemento, lo porta in vista e lo evidenzia.
// trova() puo restituire un elemento o un elenco; si riprova finche la pagina e disegnata.
// Ogni nuova evidenza annulla i tentativi di quella prima (_navEvidGen).
let _navEvidGen = 0;
function navEvidenzia(trova) {
  _navEvidenziaPasso(trova, ++_navEvidGen, 25, true);
}
function _navEvidenziaPasso(trova, gen, tentativi, scorri) {
  if (gen !== _navEvidGen) return;
  let els = null;
  try {
    els = trova();
  } catch (e) {}
  if (els && !els.length && els.nodeType) els = [els];
  els = els ? Array.from(els).filter(Boolean) : [];
  if (!els.length) {
    if (tentativi > 0) setTimeout(() => _navEvidenziaPasso(trova, gen, tentativi - 1, scorri), 120);
    return;
  }
  document.querySelectorAll('.nav-evidenza').forEach((x) => x.classList.remove('nav-evidenza'));
  els.forEach((el) => {
    let c = el.closest('.card-collapsed');
    while (c) {
      c.classList.remove('card-collapsed');
      c = c.parentElement && c.parentElement.closest('.card-collapsed');
    }
    el.classList.add('nav-evidenza');
  });
  if (scorri)
    setTimeout(() => {
      if (gen !== _navEvidGen) return;
      try {
        els[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch (e) {
        els[0].scrollIntoView();
      }
    }, 60);
  // la pagina puo ridisegnarsi subito dopo (caricamenti, ridisegno automatico): se gli
  // elementi evidenziati spariscono, si ritrovano e si evidenziano di nuovo
  [700, 1600, 3000].forEach((ms) =>
    setTimeout(() => {
      if (gen === _navEvidGen && els.some((el) => !el.isConnected)) _navEvidenziaPasso(trova, gen, 5, false);
    }, ms),
  );
}
function navTogliEvidenza() {
  _navEvidGen++;
  document.querySelectorAll('.nav-evidenza').forEach((x) => x.classList.remove('nav-evidenza'));
}

// Barra in basso: perche si e qui e un pulsante per tornare (anche la freccia Indietro torna).
function navMostraBarra(opz) {
  navChiudiBarra();
  _navBarra = { dest: _navStatoCorrente(), origine: opz.origine, alRitorno: opz.alRitorno };
  const d = document.createElement('div');
  d.id = 'nav-ritorno';
  d.setAttribute('role', 'status');
  d.innerHTML =
    '<div class="nav-ritorno-testo">' +
    (opz.html || '') +
    '</div><div class="nav-ritorno-azioni"><button class="btn-act nav-ritorno-torna" type="button">' +
    escP(opz.etichetta || 'Torna indietro') +
    '</button><button class="nav-ritorno-chiudi" type="button" aria-label="Chiudi" title="Chiudi">' +
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg></button></div>';
  d.querySelector('.nav-ritorno-torna').onclick = navTorna;
  d.querySelector('.nav-ritorno-chiudi').onclick = navChiudiBarra;
  document.body.appendChild(d);
}
function navChiudiBarra() {
  const d = document.getElementById('nav-ritorno');
  if (d) d.remove();
  navTogliEvidenza();
  _navBarra = null;
}
function navTorna() {
  if (!_navBarra) return;
  const b = _navBarra;
  // se la voce di prima nella cronologia e l origine, si torna come con la freccia
  if (!_navUguali(b.dest, b.origine) && _navUguali(history.state, b.dest)) {
    history.back();
    return;
  }
  navChiudiBarra();
  if (b.alRitorno) b.alRitorno();
}

// ================================================================
// MENU DELLE PAGINE (ondata 3, 11/10/2026)
// Al computer il menu sta su una riga: le pagine di ogni giorno sempre in vista, Maison e
// Inventario e gli strumenti (Statistiche, Registro, Guida, Impostazioni) in due menu a
// tendina. Le voci restano .nav-tab con data-page: i permessi le nascondono come prima
// (applicaVisibilita in settings.js); qui si decide solo come si vedono i gruppi.
// ================================================================
function _navVoceVisibile(el) {
  if (!el) return false;
  if (el.classList.contains('nav-gruppo')) return !el.hidden;
  return el.classList.contains('nav-tab') && el.style.display !== 'none';
}
function _navImposta(el, attr, val) {
  // si scrive solo se cambia: l osservatore qui sotto non deve girare a vuoto
  if (val === null) {
    if (el.hasAttribute(attr)) el.removeAttribute(attr);
  } else if (el.getAttribute(attr) !== val) el.setAttribute(attr, val);
}
function navAggiornaMenu() {
  const nav = document.querySelector('.nav-tabs');
  if (!nav) return;
  nav
    .querySelectorAll('.nav-tab')
    .forEach((t) => _navImposta(t, 'aria-current', t.classList.contains('active') ? 'page' : null));
  nav.querySelectorAll('.nav-gruppo').forEach((g) => {
    const voci = [...g.querySelectorAll('.nav-tab')].filter(_navVoceVisibile);
    _navImposta(g, 'hidden', voci.length ? null : '');
    // una voce sola (per esempio un operatore che vede solo l Inventario): niente tendina,
    // la voce sta nella riga come le altre
    const singolo = voci.length === 1;
    if (g.classList.contains('nav-gruppo-singolo') !== singolo) g.classList.toggle('nav-gruppo-singolo', singolo);
    const attivo = voci.some((t) => t.classList.contains('active'));
    if (g.classList.contains('attivo') !== attivo) g.classList.toggle('attivo', attivo);
  });
  // separatori: solo tra due gruppi che hanno qualcosa da mostrare
  let primaVisibile = false;
  let sepInAttesa = null;
  [...nav.children].forEach((el) => {
    if (el.classList.contains('nav-sep')) {
      _navImposta(el, 'hidden', '');
      if (primaVisibile && !sepInAttesa) sepInAttesa = el;
      return;
    }
    if (_navVoceVisibile(el)) {
      if (sepInAttesa) _navImposta(sepInAttesa, 'hidden', null);
      sepInAttesa = null;
      primaVisibile = true;
    }
  });
}
function navChiudiGruppi(tranne) {
  document.querySelectorAll('.nav-gruppo.aperto').forEach((g) => {
    if (g.dataset.gruppo === tranne) return;
    g.classList.remove('aperto');
    const b = g.querySelector('.nav-gruppo-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}
function navGruppoApriChiudi(key, apri, fuocoSu) {
  const g = document.querySelector('.nav-gruppo[data-gruppo="' + key + '"]');
  if (!g) return;
  const ora = apri === undefined ? !g.classList.contains('aperto') : !!apri;
  navChiudiGruppi(key);
  g.classList.toggle('aperto', ora);
  const b = g.querySelector('.nav-gruppo-btn');
  if (b) b.setAttribute('aria-expanded', ora ? 'true' : 'false');
  if (ora && fuocoSu) {
    const voci = [...g.querySelectorAll('.nav-gruppo-menu .nav-tab')].filter(_navVoceVisibile);
    const v =
      fuocoSu === 'ultima' ? voci[voci.length - 1] : voci.find((x) => x.classList.contains('active')) || voci[0];
    if (v) v.focus();
  }
}
// tastiera: frecce dentro la tendina, Esc chiude e torna al pulsante, Tab esce e chiude
document.addEventListener('keydown', (e) => {
  const g = e.target && e.target.closest ? e.target.closest('.nav-gruppo') : null;
  if (!g || g.classList.contains('nav-gruppo-singolo')) return;
  const key = g.dataset.gruppo;
  const btn = g.querySelector('.nav-gruppo-btn');
  const voci = [...g.querySelectorAll('.nav-gruppo-menu .nav-tab')].filter(_navVoceVisibile);
  if (e.target === btn) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navGruppoApriChiudi(key, true, e.key === 'ArrowUp' ? 'ultima' : 'prima');
    } else if (e.key === 'Escape' && g.classList.contains('aperto')) {
      e.preventDefault();
      navGruppoApriChiudi(key, false);
    }
    return;
  }
  const i = voci.indexOf(e.target);
  if (i < 0) return;
  let dest = null;
  if (e.key === 'ArrowDown') dest = voci[(i + 1) % voci.length];
  else if (e.key === 'ArrowUp') dest = voci[(i - 1 + voci.length) % voci.length];
  else if (e.key === 'Home') dest = voci[0];
  else if (e.key === 'End') dest = voci[voci.length - 1];
  else if (e.key === 'Escape') {
    e.preventDefault();
    navGruppoApriChiudi(key, false);
    btn.focus();
    return;
  }
  if (dest) {
    e.preventDefault();
    dest.focus();
  }
});
document.addEventListener('focusin', (e) => {
  const g = e.target && e.target.closest ? e.target.closest('.nav-gruppo') : null;
  navChiudiGruppi(g ? g.dataset.gruppo : null);
});
document.addEventListener('click', (e) => {
  const g = e.target && e.target.closest ? e.target.closest('.nav-gruppo') : null;
  // scelta una voce della tendina: si chiude; clic fuori: si chiude
  if (!g || e.target.closest('.nav-gruppo-menu')) navChiudiGruppi(null);
  // scelta fatta: il fuoco torna sul pulsante della tendina (chi usa la tastiera non si perde)
  if (g && e.target.closest('.nav-gruppo-menu .nav-tab') && !g.classList.contains('nav-gruppo-singolo')) {
    const b = g.querySelector('.nav-gruppo-btn');
    if (b) b.focus();
  }
});

// BARRA DEL TELEFONO: ricerca a icona e segnalazioni come contatore
function navApriRicercaTelefono(apri) {
  const ora = apri === undefined ? !document.body.classList.contains('ricerca-aperta') : !!apri;
  document.body.classList.toggle('ricerca-aperta', ora);
  const b = document.getElementById('btn-ricerca-tel');
  if (b) b.setAttribute('aria-expanded', ora ? 'true' : 'false');
  if (ora) {
    const i = document.getElementById('ricerca-globale');
    if (i) setTimeout(() => i.focus(), 0);
  }
}
function _navContaSegnalazioni() {
  let n = 0;
  const vis = (k) => typeof isVis !== 'function' || isVis(k);
  const ca = document.getElementById('cassa-alerts-container');
  const ra = document.getElementById('rischio-alerts-container');
  if (ca && vis('alert_cassa')) n += ca.querySelectorAll('.cassa-alert-banner').length;
  if (ra && vis('alert_rischio')) n += ra.querySelectorAll('.rischio-alert-banner, .cassa-alert-banner').length;
  return n;
}
function navAggiornaBarraTelefono() {
  const n = _navContaSegnalazioni();
  const b = document.getElementById('btn-segnalazioni-tel');
  if (b) {
    const num = document.getElementById('segnalazioni-tel-num');
    if (num && num.textContent !== String(n)) num.textContent = n;
    if (b.hidden !== !n) b.hidden = !n;
    const et = n === 1 ? '1 segnalazione operativa' : n + ' segnalazioni operative';
    _navImposta(b, 'aria-label', et + (document.body.classList.contains('segn-aperte') ? ': nascondi' : ': mostra'));
    _navImposta(b, 'title', et);
    if (!n && document.body.classList.contains('segn-aperte')) document.body.classList.remove('segn-aperte');
  }
  // la lente compare solo a chi ha la ricerca globale
  const rg = document.querySelector('.ricerca-globale-wrap');
  const br = document.getElementById('btn-ricerca-tel');
  if (br && rg) {
    const nasc = rg.style.display === 'none';
    if (br.hidden !== nasc) br.hidden = nasc;
  }
}
function navApriSegnalazioniTelefono() {
  const ora = !document.body.classList.contains('segn-aperte');
  document.body.classList.toggle('segn-aperte', ora);
  const b = document.getElementById('btn-segnalazioni-tel');
  if (b) b.setAttribute('aria-expanded', ora ? 'true' : 'false');
  // con 2 o piu segnalazioni c e la striscia compatta: aperta qui, aperta anche lei
  if (document.getElementById('alert-compatto') && typeof renderAlertCompatti === 'function') {
    window._alertEspansi = ora;
    renderAlertCompatti();
  }
  navAggiornaBarraTelefono();
  if (ora) {
    const ca = document.getElementById('cassa-alerts-container');
    if (ca) ca.scrollIntoView({ block: 'nearest' });
  }
}

// un solo osservatore: quando i permessi o la pagina cambiano, menu e barra si riallineano
(function () {
  let inCoda = false;
  const aggiorna = () => {
    if (inCoda) return;
    inCoda = true;
    requestAnimationFrame(() => {
      inCoda = false;
      navAggiornaMenu();
      navAggiornaBarraTelefono();
    });
  };
  const nav = document.querySelector('.nav-tabs');
  if (nav && window.MutationObserver) {
    new MutationObserver(aggiorna).observe(nav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    ['cassa-alerts-container', 'rischio-alerts-container'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) new MutationObserver(aggiorna).observe(el, { childList: true, subtree: true });
    });
    const rg = document.querySelector('.ricerca-globale-wrap');
    if (rg) new MutationObserver(aggiorna).observe(rg, { attributes: true, attributeFilter: ['style'] });
  }
  aggiorna();
})();
