/* Cache somente da estrutura pública e dos bundles imutáveis. Nunca cachear APIs,
   Server Actions, RSC ou HTML autenticado. */
const CACHE = 'revenda-shell-v1';
const SHELL = '/operacao';
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(SHELL, {
        cache: 'reload',
        credentials: 'omit',
      });
      if (!response.ok) throw new Error('Estrutura offline indisponível');
      const html = await response.clone().text();
      await cache.put(SHELL, response);
      const assets = [
        ...html.matchAll(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+)"/g),
      ].map(
        (match) =>
          new URL(match[1].replaceAll('&amp;', '&'), self.location.origin).href,
      );
      await cache.addAll(
        [...new Set(assets)].filter(
          (url) => new URL(url).origin === self.location.origin,
        ),
      );
    })(),
  );
  // Não forçar atualização enquanto uma aba pode estar gravando fatos.
});
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin)
    return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE),
          saved = await cache.match(event.request);
        if (saved) return saved;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })(),
    );
  } else if (
    event.request.mode === 'navigate' &&
    !url.pathname.startsWith('/api/')
  ) {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.open(CACHE)).match(SHELL),
      ),
    );
  }
});
self.addEventListener('push', (event) => {
  // Texto fixo: payload nunca expõe nomes ou valores na tela bloqueada.
  event.waitUntil(
    self.registration.showNotification('Revenda Fácil', {
      body: 'Há uma conferência disponível. Abra o aplicativo para consultar.',
      tag: 'receivables-review',
      data: { url: '/receber' },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/receber'));
});
