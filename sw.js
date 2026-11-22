/* Finance Tracker service worker (build 98): lets the app open with no signal.
   Network first, always: when online you get the newest files (so updates arrive straight away);
   only when the network fails does it answer from the copy saved on the phone.
   Your data never goes through here — it lives in the browser's storage and Firebase. */
var CACHE = "finance-v3";
var SHELL = ["./", "./index.html", "./manifest.json", "./favicon.svg"];
var FIREBASE_HOST = "www.gstatic.com"; // the Firebase scripts, so cloud sync code still loads offline

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // One missing file must not stop the rest from being saved.
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: "no-store" })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url), own = url.origin === location.origin;
  if (!own && url.hostname !== FIREBASE_HOST) return; // Firestore, Google sign-in etc. go straight to the network
  // Our own files are saved without "?v=123" so the self-update check doesn't fill the cache with copies.
  var key = own ? url.origin + url.pathname : req.url;
  var net = own ? fetch(url.href, { cache: "no-store", credentials: "same-origin" }) : fetch(req);
  e.respondWith(net.then(function (resp) {
    // Browsers reject a redirected response for a page load, so re-wrap it as a plain one.
    if (resp && resp.redirected && req.mode === "navigate") {
      return resp.blob().then(function (b) {
        var plain = new Response(b, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
        caches.open(CACHE).then(function (c) { return c.put(key, plain.clone()); });
        return plain;
      });
    }
    if (resp && resp.ok) { var copy = resp.clone(); caches.open(CACHE).then(function (c) { return c.put(key, copy); }); }
    return resp;
  }).catch(function () {
    return caches.match(key, { ignoreSearch: true }).then(function (r) {
      if (r) return r;
      if (req.mode === "navigate") return caches.match(new URL("./index.html", location.href).href);
      return Response.error();
    });
  }));
});
