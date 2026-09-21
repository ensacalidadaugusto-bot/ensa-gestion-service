/* =====================================================================
   MOTOR DE LA APLICACIÓN INSTALADA (service worker)

   Hace dos cosas y nada más:
     · guarda una copia de la aplicación para que abra aunque no haya
       internet (los datos ya se manejan aparte, con su propia cola);
     · avisa cuando hay una versión nueva publicada.

   Regla importante: NUNCA guarda copias de las consultas a la base.
   Sólo toca lo que vive en este mismo sitio.
   ===================================================================== */
const VERSION = '8b8c42d71499';
const CACHE = 'ensa-service-' + VERSION;
const BASICOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icono-192.png',
  './icono-512.png',
  './icono-maskable.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // si alguno falla (por ejemplo, un ícono que no subió) no se cae la instalación
    await Promise.allSettled(BASICOS.map(u => c.add(new Request(u, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const viejas = (await caches.keys()).filter(k => k.startsWith('ensa-service-') && k !== CACHE);
    await Promise.all(viejas.map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

/* La página pide pasar a la versión nueva sin esperar */
self.addEventListener('message', ev => {
  if (ev.data === 'actualizar-ya') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // todo lo que no sea de este sitio (la base de datos, sobre todo) pasa de largo
  if (url.origin !== self.location.origin) return;

  // La página: primero se busca la versión publicada, y si no hay internet
  // se abre la copia guardada. Así una actualización se toma sola.
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const fresca = (await ev.preloadResponse) || await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresca.clone());
        return fresca;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./'))
          || new Response('<meta charset="utf-8"><p style="font:16px system-ui;padding:2rem">'
             + 'No hay internet y todavía no quedó una copia guardada de la aplicación.</p>',
             { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // Íconos y demás archivos del sitio: primero la copia, y se refresca por atrás
  ev.respondWith((async () => {
    const guardada = await caches.match(req);
    const red = fetch(req).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => null);
    return guardada || (await red) || new Response('', { status: 504 });
  })());
});
