const CACHE_NAME = 'diario-cl-v3';
const SHELL_URLS = ['/', '/manifest.json', '/logo_casino.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always network-first for API calls
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
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
