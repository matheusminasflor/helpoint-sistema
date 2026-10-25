// Service worker do Helpoint como aplicativo (PWA, decisão 6 do dono, 2026-10-24).
//
// O que faz, e só isso:
//   - a página (navegação) vem sempre da rede; sem internet, abre a última versão guardada — nunca uma versão velha
//     com internet, que é o risco clássico de service worker;
//   - os arquivos de `/assets/` têm nome com hash (mudam a cada versão), então podem vir da cópia guardada;
//   - nada do banco (Supabase) passa por aqui: dado é sempre o da hora.
// ponytail: guardar o que foi escrito sem internet e mandar depois (Background Sync) fica para quando pedirem.
const VERSAO = 'helpoint-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== VERSAO) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(VERSAO);
        cache.put('/index.html', resp.clone());
        return resp;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const guardado = await caches.match(req);
      if (guardado) return guardado;
      const resp = await fetch(req);
      if (resp.ok) (await caches.open(VERSAO)).put(req, resp.clone());
      return resp;
    })());
  }
});
