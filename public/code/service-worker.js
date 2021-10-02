const CACHE_PRELOAD = "preload_resources"
const CACHE_OFFLINE = "offline_access"

const OFFLINE_URL = "offline.html"
const MAIN_URL = "index.html"
const FILE_URL = "openFile.html"

const deploy = false

// Files here will be kept fresh every time the service worker is updated
const essential = [
	"index.html",
	"js/main.mjs",
	"js/ui-main.mjs",
	"js/elements.js",
	"css/elements.css",
	"css/main.css",
	"/favicon.png",
]

// Files here will be cached indefinitely. move to the other list if update needed
const staticAssets = [
	"manifest.json",

	"ace/ace.js",
	"ace/mode-json.js",
	"ace/mode-html.js",
	"ace/mode-css.js",
	"ace/mode-javascript.js",

	"ace/theme-code.js",
	"ace/ext-settings_menu.js",
	"ace/ext-language_tools.js",
	"ace/keybinding-sublime.js",
	"ace/worker-javascript.js",

	"/idb-keyval/index.js",

	"images/code-192.png",
	"images/code-192-blue.svg",
	"images/code-192-teal.png",
	"images/code-192-simple.svg",
	"images/screen-small-720x540.png",
	"images/screen-mid-1024x662.png",

	"https://fonts.googleapis.com/icon?family=Material+Icons",
	"https://fonts.googleapis.com/css2?family=Roboto+Mono&family=Roboto:wght@300;400&display=swap",
	"https://fonts.gstatic.com/s/robotomono/v13/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW4.woff2",
	"https://fonts.gstatic.com/s/materialicons/v107/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2",
	"https://fonts.gstatic.com/s/roboto/v29/KFOmCnqEu92Fr1Mu4mxK.woff2",

	"https://unpkg.com/prettier@2.4.1/esm/standalone.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-babel.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-html.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-postcss.mjs",
	"https://code.jakbox.dev/code-dev/",
	"https://code.jakbox.dev/code/",
]

self.addEventListener("install", function (event) {
	console.debug("[ServiceWorker] Install or Update triggered")

	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_PRELOAD)
			// Setting {cache: 'reload'} in the new request will ensure that the response
			// isn't fulfilled from the HTTP cache; i.e., it will be from the network.
			await cache.add(new Request(OFFLINE_URL, { cache: "reload" }))
			await cache.add(new Request(MAIN_URL, { cache: "reload" }))
			await cache.add(new Request(FILE_URL, { cache: "reload" }))

			// always cache these static assets
			for (let i = 0, l = staticAssets.length; i < l; i++) {
				try {
					await cache.add(new Request(staticAssets[i])) //, { cache: "reload" }))
				} catch (e) {
					console.error("failed to add cache", staticAssets[i])
				}
			}

			// force cache theres only if we're deployed
			if (deploy) {
				for (let i = 0, l = essential.length; i < l; i++) {
					try {
						await cache.add(new Request(essential[i], { cache: "reload" }))
					} catch (e) {
						console.error("failed to add cache", essential[i])
					}
				}
			}
		})()
	)

	self.skipWaiting()
})

self.addEventListener("activate", (event) => {
	console.debug("[ServiceWorker] Install complete")
	event.waitUntil(
		(async () => {
			// Enable navigation preload if it's supported.
			// See https://developers.google.com/web/updates/2017/02/navigation-preload
			if ("navigationPreload" in self.registration) {
				await self.registration.navigationPreload.enable()
			}
		})()
	)

	// Tell the active service worker to take control of the page immediately.
	self.clients.claim()
})

self.addEventListener("fetch", function (event) {
	if (event.request.mode === "navigate") {
		event.respondWith(
			(async () => {
				console.debug("[Service Worker]", event.request.mode, event.request.url)
				const cache = await caches.open(CACHE_PRELOAD)

				const preloadResponse = await event.preloadResponse.catch(console.warn)
				if (preloadResponse) {
					return preloadResponse
				}

				const networkResponse = await fetch(event.request).catch(console.warn)
				const cached = await cache.match(event.request.url)

				if (networkResponse && !cached) {
					console.warn("network access", event.request.url, "updating cache")
					cache.add(new Request(event.request.url))
					return networkResponse
				}

				if (!cached) {
					const offline = await cache.match(OFFLINE_URL)
					return offline
				}
				console.debug("using cached", event.request.url)
				return cached
			})()
		)
	} else {
		event.respondWith(
			(async () => {
				const preload = await caches.open(CACHE_PRELOAD)
				const offline = await caches.open(CACHE_OFFLINE)

				const preloadResponse = await event.preloadResponse
				if (preloadResponse) {
					return preloadResponse
				}

				const preloaded = await preload.match(event.request.url)

				if (preloaded) {
					console.debug("[Service Worker] using preload cache", event.request.url)
					return preloaded
				}

				if(!navigator.onLine) {
					const cached = await offline.match(event.request.url)
					if(cached) {
						console.debug("[Service Worker] using offline cache", event.request.url)
						return cached
					} else {
						console.error("[Service Worker] resource not cached :( ", event.request.url)
						return null
					}
				}
				
				const networkResponse = await fetch(event.request).catch(console.warn)

				if (networkResponse) {
					console.debug("[Service Worker] network access", event.request.url, "updating cache")
					offline.add(new Request(event.request.url))
					return networkResponse
				}

				if (cached) {
					console.debug("[Service Worker] using cached", event.request.url)
					return cached
				}

				return cached
			})()
		)
	}
})
