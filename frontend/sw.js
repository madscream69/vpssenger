// Service Worker: офлайн-шелл + push.
// Кэшируем ТОЛЬКО статику приложения. API (/messages, /auth, /ws) — никогда.

const CACHE = "fsm-shell-v7"; 
const SHELL = [
  "./",
  "./index.html",
  "./test.html",
  "./css/style.css",
  "./js/app.js",
  "./js/api.js",
  "./js/crypto.js",
  "./js/seed.js",
  "./js/state.js",
  "./js/ws.js",
  "./js/contacts.js",
  "./manifest.json",
  "./js/call.js",
  "./js/callSignaling.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Никогда не кэшируем API и WS — они всегда идут в сеть.
  if (url.pathname.startsWith("/auth") ||
      url.pathname.startsWith("/messages") ||
      url.pathname.startsWith("/profile") ||
      url.pathname.startsWith("/ws") ||
      url.pathname.startsWith("/health")) {
    return; // браузер сам пойдёт в сеть
  }

  // Cache-first для статики своего origin.
  if (url.origin === self.location.origin && e.request.method === "GET") {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        // Некритично, но приятно: подкладываем свежую версию в кэш.
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html")))
    );
  }
});

// Пока пусто: заполним в 5.3.
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  const title = "Family Messenger";
  const body = data.kind === "new_message" ? "Новое сообщение" : "Уведомление";
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: "fsm-message",          // склеиваем уведомления, чтобы не спамить
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});