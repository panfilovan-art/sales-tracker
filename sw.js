/* Дела продаж — service worker: приложение открывается без интернета.
   ВАЖНО: при каждой выкладке повышайте VERSION (v1 → v2 → v3 …),
   иначе телефон продолжит показывать старую версию. */
var VERSION = 'v3';
var CACHE = 'dela-prodazh-' + VERSION;
var FONT_CACHE = 'dela-prodazh-fonts';

var FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k !== FONT_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Шрифты Google: берём из запаса, в фоне обновляем
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { c.put(req, res.clone()); return res; })
          .catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // data.json (календарь): сначала интернет — там свежие данные; без сети — последняя сохранённая копия
  if (url.pathname.endsWith('/data.json')) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return fetch(req).then(function (res) {
        if (res.ok) c.put('./data.json', res.clone());
        return res;
      }).catch(function () { return c.match('./data.json'); });
    }));
    return;
  }

  // Страница: сначала интернет (свежая версия), без сети — из запаса
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    }));
    return;
  }

  // Остальные файлы: из запаса, если нет — из интернета
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
