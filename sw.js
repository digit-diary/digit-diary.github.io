const CACHE_NAME = 'diario-cl-v400';
const SHELL_URLS = ['/', '/manifest.json', '/logo_casino.png', '/icon-192.png', '/icon-512.png',
  '/css/style.css',
  '/js/config.js', '/js/finestre.js', '/js/crypto.js', '/js/chat-core.js', '/js/annulla.js', '/js/realtime.js',
  '/js/api.js', '/js/utils.js', '/js/auth.js', '/js/cestino-core.js', '/js/settings.js',
  '/js/app.js', '/js/diario.js', '/js/alerts.js', '/js/search.js',
  '/js/chat-ui.js', '/js/ai.js', '/js/moduli.js', '/js/formazione.js', '/js/valutazioni.js',
  '/js/rapporto.js', '/js/stats.js',
  '/js/consegna.js', '/js/promemoria.js',
  '/js/maison-core.js', '/js/maison-budget.js', '/js/maison-helpers.js', '/js/piano-regole.js', '/js/organico-modello.js', '/js/piano-core.js', '/js/piano-genera.js', '/js/piano-ricerca.js', '/js/piano-ricerca-ui.js', '/js/modulo-nd.js', '/js/piano-formazioni.js', '/js/piano-auto.js', '/js/piano-confine.js', '/js/piano-config.js', '/js/piano-gestione.js', '/js/piano-cambi.js', '/js/piano-schede.js', '/js/piano-impostazioni.js', '/js/piano-celle.js', '/js/griglia-excel.js', '/js/piano-briefing-ui.js', '/js/piano-extra.js', '/js/piano-organico.js', '/js/pause-controlli.js', '/js/pause-engine.js', '/js/mini-scheda.js', '/js/posizione.js',
  '/js/guida.js',
  '/libs/supabase.min.js', '/libs/chart.umd.min.js', '/libs/flatpickr.min.css', '/libs/flatpickr.min.js',
  '/libs/flatpickr.it.js', '/libs/qrcode.min.js', '/libs/xlsx.full.min.js', '/libs/jspdf.umd.min.js',
  '/libs/jspdf.plugin.autotable.min.js', '/libs/mammoth.browser.min.js', '/libs/pdf.min.js', '/libs/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Il service worker serve SOLO i file del programma. Tutto il resto va dritto alla
// rete, senza passare di qui: le chiamate al database e ai servizi (stesso
// indirizzo sul server interno: /rest/, /ai/, /solver/, /functions/), ogni metodo
// diverso da GET (POST/PATCH/DELETE: cache.put fallirebbe) e gli altri siti.
// Prima bastava includes('supabase.co'): sul server interno non scattava piu e le
// risposte con i dati personali finivano nella Cache Storage del browser.
const _PERCORSI_SERVIZI = ['rest/', 'ai/', 'solver/', 'functions/', 'auth/', 'storage/', 'realtime/'];
const _SHELL_PERCORSI = new Set(SHELL_URLS);
function _percorsoRelativo(url) {
  // percorso rispetto alla cartella del programma (anche se non e la radice del sito)
  const base = new URL(self.registration.scope).pathname;
  return url.pathname.startsWith(base) ? url.pathname.substring(base.length) : url.pathname.replace(/^\//, '');
}
function _eFileDelProgramma(url) {
  if (_SHELL_PERCORSI.has(url.pathname)) return true;
  const p = _percorsoRelativo(url);
  return /^(js|css|libs)\/[^?]+\.(js|css|map|woff2?|ttf)$/.test(p) || /^[\w.-]+\.(png|ico|svg|json)$/.test(p);
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const rel = _percorsoRelativo(url);
  if (_PERCORSI_SERVIZI.some(p => rel.startsWith(p))) return;
  // Bypassa la cache HTTP rivalidando con l'ETag: gli aggiornamenti arrivano al
  // primo reload invece che dopo 10 minuti.
  const fetchOpts = { cache: 'no-cache' };
  // Pagine: sempre dalla rete; senza rete la pagina principale salvata
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, fetchOpts).catch(() =>
        caches.match(e.request).then(r => r || caches.match('/')).then(r => r || Response.error())
      )
    );
    return;
  }
  // Altro dello stesso sito che non e un file del programma: rete, mai in cache
  if (!_eFileDelProgramma(url)) return;
  // File del programma: dalla rete, con la copia salvata se manca la rete
  e.respondWith(
    fetch(e.request, fetchOpts).then(r => {
      if (r.ok && r.type === 'basic') {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || Response.error()))
  );
});

// PUSH NOTIFICATION HANDLER
self.addEventListener('push', function(event) {
  if (!event.data) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      var isVisible = clientList.some(function(c) { return c.visibilityState === 'visible'; });
      try {
        var data = event.data.json();
        // App visible: forward to client as toast, skip system notification
        if (isVisible) {
          clientList.forEach(function(c) { c.postMessage({ action: 'push', data: data }); });
          return;
        }
        var titolo = data.titolo || 'Diario Collaboratori';
        var options = {
          body: data.corpo || '',
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          tag: data.tipo || 'general',
          renotify: true,
          data: { tipo: data.tipo, mittente: data.mittente }
        };
        return self.registration.showNotification(titolo, options);
      } catch (e) {
        return self.registration.showNotification('Diario Collaboratori', {
          body: event.data.text(),
          icon: 'icon-192.png'
        });
      }
    })
  );
});

// NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var tipo = event.notification.data ? event.notification.data.tipo : '';
  var page = '';
  if (tipo === 'nota') page = 'note-collega';
  else if (tipo === 'consegna') page = 'consegna';
  else if (tipo === 'promemoria') page = 'promemoria';
  else if (tipo === 'budget') page = 'maison';
  else if (tipo === 'compleanno') page = 'dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if (page) client.postMessage({ action: 'navigate', page: page });
          return;
        }
      }
      return self.clients.openWindow('/' + (page ? '#' + page : ''));
    })
  );
});
