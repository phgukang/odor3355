// Service Worker - odor3355 (cache v4, network-first)
// 개발·시범 운영 단계에 적합한 캐시 전략

const CACHE_NAME = "odor3355-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json"
];

// 설치: 필수 자산만 사전 캐시
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      )
    )
  );
  self.clients.claim();
});

// fetch: 네트워크 우선, 실패 시 캐시
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // HTML, JS, CSS 등은 항상 최신 우선
  event.respondWith(
    fetch(req)
      .then((res) => {
        // 성공 시 캐시 갱신
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
