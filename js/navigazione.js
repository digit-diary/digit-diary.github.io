/**
 * Diario Collaboratori · Casino Lugano SA
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
