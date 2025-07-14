const APP_VERSION = "0.3.8"
const CACHE_PRELOAD = "preload_resources"
const CACHE_OFFLINE = "offline_access"

const OFFLINE_URL = "offline.html"
const MAIN_URL = "index.html"
const FILE_URL = "openFile.html"

const deploy = true

// Files here will be kept fresh every time the serviceworker is updated
const essential = [
	"/",
	"index.html",
	"js/main.mjs",
	"js/ui-main.mjs",
	"js/elements.mjs",
	"css/elements.css",
	"css/main.css",
	"/favicon.png",
	"ace/ext-settings_menu.js",
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
	"ace/ext-language_tools.js",
	"ace/keybinding-sublime.js",
	"ace/worker-javascript.js",

	"images/code-192.png",
	"images/code-192-blue.svg",
	"images/code-192-teal.png",
	"images/code-192-simple.svg",
	// "images/screen-small-720x540.png",
	// "images/screen-mid-1024x662.png",

	"https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm",

	"https://fonts.googleapis.com/icon?family=Material+Icons",
	"https://fonts.googleapis.com/css2?family=Roboto+Mono&family=Roboto:wght@300;400&display=swap",
	"https://fonts.gstatic.com/s/robotomono/v13/L0xuDF4xlVMF-BfR8bXMIhJHg45mwgGEFl0_3vq_ROW4.woff2",
	"https://fonts.gstatic.com/s/materialicons/v107/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2",
	"https://fonts.gstatic.com/s/roboto/v29/KFOmCnqEu92Fr1Mu4mxK.woff2",

	"https://unpkg.com/prettier@2.4.1/esm/standalone.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-babel.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-html.mjs",
	"https://unpkg.com/prettier@2.4.1/esm/parser-postcss.mjs",
]

self.addEventListener("install", function (event) {
	console.debug("[service] Installing")

	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_PRELOAD)
			const offline = await caches.open(CACHE_OFFLINE)

			// await caches.delete(CACHE_PRELOAD);
			// await caches.delete(CACHE_OFFLINE);

			// Setting {cache: 'reload'} in the new request will ensure that the response
			// isn't fulfilled from the HTTP cache; i.e., it will be from the network.
			await cache.add(new Request(OFFLINE_URL, { cache: "reload" }))
			await cache.add(new Request(MAIN_URL, { cache: "reload" }))
			await cache.add(new Request(FILE_URL, { cache: "reload" }))

			// always cache these static assets
			for (let i = 0, l = staticAssets.length; i < l; i++) {
				try {
					await cache.add(new Request(staticAssets[i])) //, { cache: "reload" }))
					await offline.add(new Request(staticAssets[i]))
				} catch (e) {
					console.error("failed to add cache", staticAssets[i])
				}
			}

			// force cache these only if we're deployed

			if (deploy) {
				for (let i = 0, l = essential.length; i < l; i++) {
					try {
						await cache.add(new Request(essential[i], { cache: "reload" }))
						await offline.add(new Request(essential[i]))
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
	console.debug("[service] Ready")
	event.waitUntil(
		(async () => {
			// Enable navigation preload if it's supported.
			// See https://developers.google.com/web/updates/2017/02/navigation-preload
			if ("navigationPreload" in self.registration) {
				await self.registration.navigationPreload.enable()
			}
		})()
	)

	// Tell the active serviceworker to take control of the page immediately.
	self.clients.claim()
})

self.addEventListener("fetch", function (event) {

	// special handler for version request to read the variable in here
	// Check if the request is for /version.json
	const url = new URL(event.request.url)
	if (url.pathname === "/version.json") {
		const responseBody = { appName: "code.jakbox.dev", version: APP_VERSION, }
		const jsonResponse = new Response(JSON.stringify(responseBody), {
			headers: { "Content-Type": "application/json" },
		})
		event.respondWith(jsonResponse)
		return
	}

	
	if (event.request.mode === "navigate") {
		event.respondWith(
			(async () => {
				console.debug("[service]", event.request.mode, event.request.url)
				const cache = await caches.open(CACHE_PRELOAD)

				const preloadResponse = await event.preloadResponse.catch(console.warn)
				if (preloadResponse) {
					return preloadResponse
				}

				const networkResponse = await fetch(event.request).catch(console.warn)
				const cached = await cache.match(event.request.url)

				if (networkResponse && !cached) {
					console.warn("[service] [request]", event.request.url, "updating cache")
					cache.add(new Request(event.request.url))
					return networkResponse
				}

				if (!cached) {
					const offline = await cache.match(OFFLINE_URL)
					return offline
				}
				console.debug("[service] [cached]", event.request.url)
				return cached
			})()
		)
	} else {
		event.respondWith(
			(async () => {
				const preload = await caches.open(CACHE_PRELOAD)
				const offline = await caches.open(CACHE_OFFLINE)

				// filter some url's for DEV
				const dev = self.location.hostname == "localhost"
				if (dev) {
					let substitute
					if (event.request.url.indexOf("manifest.json") > 0) {
						substitute = event.request.url.replace("manifest.json", "manifest_dev.json")
					}
					if (event.request.url.indexOf("favicon.png") > 0) {
						substitute = event.request.url.replace("favicon.png", "favicon_dev.png")
					}

					if (substitute) {
						console.log("[service] [dev-substitute]", substitute)
						return fetch(new Request(substitute)).catch(console.warn)
					}
				}

				const preloadResponse = await event.preloadResponse
				if (preloadResponse) {
					return preloadResponse
				}

				const preloaded = await preload.match(event.request.url)

				if (preloaded) {
					console.debug("[service] [cache] preload", event.request.url)
					return preloaded
				}

				if (!navigator.onLine) {
					const cached = await offline.match(event.request.url)
					if (cached) {
						console.debug("[service] [cache] offline", event.request.url)
						return cached
					} else {
						console.error("[service] resource not cached :( ", event.request.url)
						return null
					}
				}

				const networkResponse = await fetch(event.request).catch(console.warn)

				if (networkResponse) {
					console.debug("[service] [updating] ", event.request.url)
					if (event.request.url.indexOf("http") === 0) {
						// let's only cache HTTP/S content
						offline.add(new Request(event.request.url))
					}
					return networkResponse
				}

				if (cached) {
					console.debug("[service] [cached]", event.request.url)
					return cached
				}

				return cached
			})()
		)
	}
})
