// Uygulama dosyalarını önbelleğe alır; internet yokken de açılır.
// Uygulamayı güncellediğinde SURUM'u değiştir.
const SURUM = "ziyaret-v4";
const DOSYALAR = ["./", "index.html", "css/style.css", "js/app.js", "js/store.js", "js/excel.js", "js/metin.js",
  "js/firebase-config.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SURUM).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
// Kendi dosyalarımız: önce internetten dene (güncel kalsın), olmazsa önbellekten
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const kopya = r.clone();
      caches.open(SURUM).then(c => c.put(e.request, kopya));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
