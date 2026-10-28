const BUILD = 'ddf6898d810f1c63';
const ROOT = new URL('./', self.registration.scope);
const INDEX = new URL('index.html', ROOT).href;
const PREFIX = `st-nook-shell:${ROOT.pathname}:`;
const SHELL = PREFIX + BUILD;
const FONTS = `st-nook-fonts:${ROOT.pathname}`;

function fontURL(value) {
 try {
  const url = new URL(value);
  return url.origin === 'https://fontsapi.zeoseven.com' && /^\/(256|292|22)\/main\/(result\.css|[a-z\d._-]+\.woff2)$/i.test(url.pathname);
 } catch { return false; }
}

function buildOf(html) {
 return /<meta\s+name="st-nook-build"\s+content="([^"]+)"/.exec(html)?.[1] || BUILD;
}

async function refreshShell() {
 const response = await fetch(INDEX, { cache: 'no-cache', credentials: 'same-origin' });
 if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('无法下载阅读器页面');
 const html = await response.text();
 if (!html.includes('ST Nook') || !html.includes('id="app"')) throw Error('收到的不是阅读器页面');
 const cache = await caches.open(SHELL), previous = await cache.match(INDEX);
 const changed = !previous || await previous.text() !== html;
 const headers = new Headers(response.headers);
 headers.delete('content-length'); headers.delete('content-encoding');
 headers.set('content-type', 'text/html; charset=utf-8');
 // Rebuild the response so a host's /index.html redirect can also serve navigation requests.
 await cache.put(INDEX, new Response(html, { status: 200, headers }));
 return { cached: true, changed, build: buildOf(html) };
}

async function status() {
 const response = await (await caches.open(SHELL)).match(INDEX);
 return { cached: !!response, build: response ? buildOf(await response.text()) : BUILD };
}

async function saveFont(cache, request, response) {
 if (!response.ok) return;
 const url = typeof request === 'string' ? request : request.url;
 if (url.endsWith('.css') && !response.headers.get('content-type')?.includes('text/css')) return;
 if (!(await response.clone().arrayBuffer()).byteLength) return;
 await cache.put(request, response.clone()).catch(() => {});
}

self.addEventListener('install', event => {
 event.waitUntil(refreshShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== SHELL).map(key => caches.delete(key)));
  await self.clients.claim();
  const state = await status();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'st-nook-offline-ready', ...state });
 })());
});

self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 const url = new URL(event.request.url);
 if (url.origin === ROOT.origin && (url.pathname === ROOT.pathname || url.href.split('?')[0] === INDEX)) {
  event.respondWith((async () => {
   const cache = await caches.open(SHELL), saved = await cache.match(INDEX);
   if (saved) return saved;
   await refreshShell();
   return cache.match(INDEX);
  })());
 } else if (fontURL(url.href)) {
  event.respondWith((async () => {
   const cache = await caches.open(FONTS), saved = await cache.match(event.request);
   if (saved) return saved;
   const response = await fetch(event.request, { referrerPolicy: 'no-referrer' });
   await saveFont(cache, event.request, response);
   return response;
  })());
 }
});

self.addEventListener('message', event => {
 const data = event.data;
 if (!['st-nook-status', 'st-nook-refresh', 'st-nook-cache-fonts'].includes(data?.type)) return;
 event.waitUntil((async () => {
  try {
   let result;
   if (data.type === 'st-nook-status') result = await status();
   else if (data.type === 'st-nook-refresh') result = await refreshShell();
   else {
    const cache = await caches.open(FONTS);
    const urls = [...new Set(Array.isArray(data.urls) ? data.urls : [])].filter(fontURL).slice(0, 256);
    await Promise.all(urls.map(async url => {
     if (await cache.match(url)) return;
     try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache', referrerPolicy: 'no-referrer' });
      await saveFont(cache, url, response);
     } catch {}
    }));
    result = { cached: true };
   }
   event.ports[0]?.postMessage({ ok: true, ...result });
  } catch (error) { event.ports[0]?.postMessage({ ok: false, error: error.message }); }
 })());
});
