// Permite instalar Megmart Pedidos en el celular y abrirlo aunque se corte internet.
// Siempre se intenta primero la red (así nunca queda una versión vieja); si no hay internet, se usa lo guardado.
// Los pedidos no pasan por acá: vienen de Supabase.
const CACHE = 'megmart-v2';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'logica.js', 'config.js', 'icono.png', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return res;
  }).catch(async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('./');
    return new Response('', { status: 503 });
  }));
});
