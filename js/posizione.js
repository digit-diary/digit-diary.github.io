/**
 * Diario Collaboratori · Casino Lugano SA
 * File: posizione.js
 *
 * LA PAGINA NON SI MUOVE DA SOLA. Quando il programma ridisegna o aggiorna una
 * pagina (salvataggio, colore, cambio di una cella, aggiornamento arrivato da un
 * altro operatore...) tutto torna dov'era: lo scorrimento della finestra e
 * quello di ogni riquadro che scorre, anche in orizzontale (es. il calendario
 * del Piano scorso fino al giorno 29 non torna al giorno 1).
 * Anche ricaricando la pagina del browser si torna allo stesso punto.
 * Restano liberi: il cambio di pagina dal menu (si parte dall inizio) e gli
 * spostamenti voluti dal programma (es. la ricerca globale che porta in vista
 * il risultato): quelli non vengono rimessi indietro.
 *
 * Come: ogni funzione che ridisegna o aggiorna una pagina (render..., refresh...,
 * aggiorna...) e avvolta da una funzione che prima fotografa le posizioni e
 * dopo le rimette. Le posizioni si salvano anche nella sessione del browser.
 * Deve essere caricato per ultimo (dopo tutti i moduli).
 */
(function () {
  'use strict';
  const CHIAVE = 'diario_posizione';

  const paginaAttiva = () => {
    const p = document.querySelector('.page.active');
    return p ? p.id : '';
  };
  const schedaPiano = () => (typeof _pianoTab !== 'undefined' ? _pianoTab : '');

  // spostamenti voluti dal programma: annullano i ripristini in attesa
  let generazione = 0;
  let interno = false;
  const liberaPosizione = () => generazione++;
  const origScrollTo = window.scrollTo.bind(window);
  const scrollaA = (x, y) => {
    interno = true;
    try {
      origScrollTo(x, y);
    } finally {
      interno = false;
    }
  };
  ['scrollTo', 'scroll'].forEach((m) => {
    const o = window[m].bind(window);
    window[m] = function () {
      if (!interno) liberaPosizione();
      return o.apply(window, arguments);
    };
  });
  // anche chi sposta un riquadro scrivendo scrollTop o scrollLeft (es. la chat che
  // scende all ultimo messaggio) lo fa apposta
  ['scrollTop', 'scrollLeft'].forEach((prop) => {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, prop);
    if (!d || !d.set) return;
    Object.defineProperty(Element.prototype, prop, {
      configurable: true,
      enumerable: d.enumerable,
      get: d.get,
      set: function (v) {
        if (!interno) liberaPosizione();
        d.set.call(this, v);
      },
    });
  });
  const origIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    liberaPosizione();
    return origIntoView.apply(this, arguments);
  };

  // indirizzo stabile di un elemento: antenato con id e indici dei figli; in piu
  // la tabella che contiene (data-seltab) per ritrovarlo anche se la pagina cambia
  function indirizzo(el) {
    const passi = [];
    let n = el;
    while (n && n !== document.body && !n.id) {
      const p = n.parentElement;
      if (!p) break;
      passi.unshift(Array.prototype.indexOf.call(p.children, n));
      n = p;
    }
    const tab = el.querySelector && el.querySelector('table[data-seltab]');
    return { id: n && n.id ? n.id : '', passi: passi, tab: tab ? tab.getAttribute('data-seltab') : '' };
  }
  function trova(ind) {
    if (ind.tab) {
      // il riquadro e quello della sua tabella: se la tabella non c e ancora, si aspetta
      const t = document.querySelector('table[data-seltab="' + ind.tab + '"]');
      if (!t) return null;
      let p = t.parentElement;
      while (p && p !== document.body) {
        if (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return null;
    }
    let n = ind.id ? document.getElementById(ind.id) : document.body;
    for (const i of ind.passi) {
      if (!n || !n.children[i]) return null;
      n = n.children[i];
    }
    return n;
  }
  // tutti i riquadri scorsi della pagina attiva
  function foto() {
    const pag = document.querySelector('.page.active') || document.body;
    const interni = [];
    pag.querySelectorAll('*').forEach((el) => {
      if (el.scrollLeft > 0 || el.scrollTop > 0)
        interni.push({ ind: indirizzo(el), l: el.scrollLeft, t: el.scrollTop });
    });
    return { pagina: paginaAttiva(), scheda: schedaPiano(), x: window.scrollX, y: window.scrollY, interni: interni };
  }
  // rimette le posizioni; restituisce true se tutto e tornato dov'era
  function rimetti(f) {
    if (!f || f.pagina !== paginaAttiva()) return true;
    let tutto = true;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (Math.abs(window.scrollY - f.y) > 2) scrollaA(f.x || 0, Math.min(f.y, Math.max(0, maxY)));
    if (Math.abs(window.scrollY - f.y) > 2) tutto = false;
    f.interni.forEach((i) => {
      const el = trova(i.ind);
      if (!el) {
        tutto = false;
        return;
      }
      interno = true;
      try {
        if (el.scrollLeft !== i.l) el.scrollLeft = i.l;
        if (el.scrollTop !== i.t) el.scrollTop = i.t;
      } finally {
        interno = false;
      }
      if (Math.abs(el.scrollLeft - i.l) > 2 || Math.abs(el.scrollTop - i.t) > 2) tutto = false;
    });
    return tutto;
  }
  // dopo un ridisegno: subito, al fotogramma successivo e poco dopo (il contenuto
  // puo arrivare un attimo dopo); si ferma se nel frattempo il programma ha
  // spostato apposta la pagina
  function rimettiPiuVolte(f, g) {
    const passo = () => {
      if (g === generazione) rimetti(f);
    };
    passo();
    requestAnimationFrame(passo);
    setTimeout(passo, 120);
    setTimeout(passo, 400);
  }

  // cambio di pagina o di scheda dal menu: nessun ripristino (si parte dall inizio)
  let cambioPagina = 0;
  ['switchPage', 'pianoCambiaTab', '_settingsMostraGruppo'].forEach((nome) => {
    if (typeof window[nome] !== 'function') return;
    const orig = window[nome];
    window[nome] = function () {
      cambioPagina++;
      liberaPosizione();
      try {
        return orig.apply(this, arguments);
      } finally {
        setTimeout(() => cambioPagina--, 0);
      }
    };
  });

  // ogni funzione che ridisegna o aggiorna una pagina
  const DA_AVVOLGERE = /^_?(render|refresh|aggiorna)[A-Z_]|^_[a-z]+(Refresh|Render)[A-Z]/;
  const avvolte = [];
  Object.keys(window).forEach((nome) => {
    if (!(DA_AVVOLGERE.test(nome) || nome === 'render') || typeof window[nome] !== 'function') return;
    if (window[nome]._conservaPosizione) return;
    const orig = window[nome];
    const avvolta = function () {
      if (cambioPagina) return orig.apply(this, arguments);
      const f = foto();
      // la generazione si fotografa PRIMA del ridisegno: se il ridisegno sposta
      // apposta la pagina (es. chat all ultimo messaggio) non si rimette indietro
      const g = generazione;
      let r;
      try {
        r = orig.apply(this, arguments);
      } finally {
        if (r && typeof r.then === 'function')
          r.then(
            () => rimettiPiuVolte(f, g),
            () => rimettiPiuVolte(f, g),
          );
        else rimettiPiuVolte(f, g);
      }
      return r;
    };
    avvolta._conservaPosizione = true;
    window[nome] = avvolta;
    avvolte.push(nome);
  });

  // RICARICA DELLA PAGINA: la posizione si salva mentre si scorre e si rimette
  // quando la stessa pagina e di nuovo disegnata, mantenendola finche la pagina
  // non ha finito di caricarsi (se l operatore scorre da solo ci si ferma)
  let timer = null;
  const salva = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        sessionStorage.setItem(CHIAVE, JSON.stringify(foto()));
      } catch (e) {}
    }, 250);
  };
  let daRicarica = null;
  try {
    daRicarica = JSON.parse(sessionStorage.getItem(CHIAVE) || 'null');
  } catch (e) {}
  // finche si rimette la posizione della ricarica non si salva quella provvisoria
  let ricaricaFinita = !daRicarica;
  if (daRicarica) {
    const ferma = () => (ricaricaFinita = true);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((ev) =>
      window.addEventListener(ev, ferma, { once: true, capture: true }),
    );
    const inizio = Date.now();
    const tieni = () => {
      if (ricaricaFinita || Date.now() - inizio > 20000) {
        ricaricaFinita = true;
        return;
      }
      if (daRicarica.pagina === paginaAttiva() && daRicarica.scheda === schedaPiano()) rimetti(daRicarica);
      setTimeout(tieni, 250);
    };
    setTimeout(tieni, 200);
  }
  document.addEventListener(
    'scroll',
    () => {
      if (ricaricaFinita) salva();
    },
    true,
  );
  window.addEventListener('pagehide', () => {
    if (!ricaricaFinita) return;
    try {
      sessionStorage.setItem(CHIAVE, JSON.stringify(foto()));
    } catch (e) {}
  });

  window._posizioneFoto = foto;
  window._posizioneRimetti = rimetti;
  window._posizioneLibera = liberaPosizione;
  window._posizioneAvvolte = avvolte;
})();
