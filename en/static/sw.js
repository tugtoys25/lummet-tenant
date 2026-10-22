const CACHE_NAME =
  `platform-${self.location.hostname}-v3`;

// Nothing is precached: CSS/JS URLs carry ?v=<hash> (see worker/static-assets.js),
// so they are cached on first use and a new release gets new URLs.
const STATIC_ASSETS = [];

// ----------------------------------------------------------
// INSTALL
// ----------------------------------------------------------

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(
            STATIC_ASSETS
          )
        )
    );

    self.skipWaiting();
  }
);

// ----------------------------------------------------------
// ACTIVATE
// ----------------------------------------------------------

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(

      caches.keys()
        .then(keys =>

          Promise.all(

            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(
                key =>
                  caches.delete(key)
              )
          )
        )
    );

    self.clients.claim();
  }
);

// ----------------------------------------------------------
// FETCH
// ----------------------------------------------------------

self.addEventListener(
  "fetch",
  event => {

    if (
      event.request.method !==
      "GET"
    ) {
      return;
    }

    const request =
      event.request;

    const url =
      new URL(request.url);

    // ------------------------------------------------------
    // Never cache dynamic tenant branding/PWA endpoints.
    // ------------------------------------------------------

    if (
      url.pathname ===
        "/site.webmanifest" ||

      url.pathname.startsWith(
        "/api/"
      )
    ) {
      event.respondWith(
        fetch(request)
      );

      return;
    }

    // ------------------------------------------------------
    // Network-first for HTML navigation.
    // ------------------------------------------------------

    if (
      request.mode ===
        "navigate"
    ) {

      event.respondWith(

        fetch(request)
          .then(response => {

            if (
              response &&
              response.status === 200
            ) {

              const clone =
                response.clone();

              caches.open(
                CACHE_NAME
              ).then(cache => {

                cache.put(
                  request,
                  clone
                );

              });
            }

            return response;
          })

          .catch(() =>
            caches.match(
              request
            ).then(cached =>
              cached ||
              caches.match("/")
            )
          )
      );

      return;
    }

    // ------------------------------------------------------
    // Static resources.
    //   ?v=<hash> URLs never change -> cache-first.
    //   Anything else -> stale-while-revalidate, so a changed file is
    //   fetched in the background and used on the next load.
    // ------------------------------------------------------

    if (
      url.pathname.startsWith(
        "/static/"
      ) &&
      url.pathname !== "/static/sw.js"
    ) {

      const versioned = url.searchParams.has("v");

      event.respondWith(
        caches.match(request).then(cached => {
          if (cached && versioned) return cached;

          const network = fetch(request).then(response => {
            if (response.status === 200 && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          });

          if (cached) {
            network.catch(() => {});
            return cached;
          }
          return network;
        })
      );

      return;
    }

    // ------------------------------------------------------
    // Default: network first.
    // ------------------------------------------------------

    event.respondWith(
      fetch(request)
        .catch(() =>
          caches.match(request)
        )
    );
  }
);
