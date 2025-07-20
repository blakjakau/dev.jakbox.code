const APP_VERSION = "0.3.8"
const CACHE_PRELOAD = "preload_resources"
const CACHE_OFFLINE = "offline_access"

const OFFLINE_URL = "offline.html"
const MAIN_URL = "index.html"
const FILE_URL = "openFile.html"

const deploy = true

// --- List of hostnames for services that should NOT be cached ---
const NON_CACHEABLE_HOSTS = [
    "generativelanguage.googleapis.com", // Gemini API hostname
    // Add other external API hostnames here, e.g.:
    // "maps.googleapis.com",
    // "api.stripe.com",
    // "my-custom-external-service.com",
];


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
	"https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
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
					// IMPORTANT: Do NOT add URLs from NON_CACHEABLE_HOSTS here,
                    // as the goal is to prevent caching them.
					// Check if the static asset should be cached
                    const assetUrl = new URL(staticAssets[i], self.location.origin);
                    if (!NON_CACHEABLE_HOSTS.includes(assetUrl.hostname)) {
                        await cache.add(new Request(staticAssets[i]))
                        await offline.add(new Request(staticAssets[i]))
                    } else {
                        console.debug("[service] Not pre-caching non-cacheable static asset:", staticAssets[i]);
                    }
				} catch (e) {
					console.error("failed to add cache", staticAssets[i], e)
				}
			}

			// force cache these only if we're deployed
			if (deploy) {
				for (let i = 0, l = essential.length; i < l; i++) {
					try {
                        // IMPORTANT: Do NOT add URLs from NON_CACHEABLE_HOSTS here.
                        const essentialUrl = new URL(essential[i], self.location.origin);
                        if (!NON_CACHEABLE_HOSTS.includes(essentialUrl.hostname)) {
						    await cache.add(new Request(essential[i], { cache: "reload" }))
						    await offline.add(new Request(essential[i]))
                        } else {
                            console.debug("[service] Not pre-caching non-cacheable essential asset:", essential[i]);
                        }
					} catch (e) {
						console.error("failed to add cache", essential[i], e)
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
	const url = new URL(event.request.url)

	// Special handler for version request
	if (url.pathname === "/version.json") {
		const responseBody = { appName: "code.jakbox.dev", version: APP_VERSION, }
		const jsonResponse = new Response(JSON.stringify(responseBody), {
			headers: { "Content-Type": "application/json" },
		})
		event.respondWith(jsonResponse)
		return
	}

    // --- NEW: Do not cache calls to external APIs like Gemini ---
    if (NON_CACHEABLE_HOSTS.includes(url.hostname)) {
        console.debug("[service] Bypassing cache for external API:", url.href);
        event.respondWith(fetch(event.request)); // Go directly to network
        return; // Important: Exit here to prevent any further caching logic for this request
    }

	// Do not cache Ollama API requests (your existing logic)
	// This specifically targets your local /api/ path, which is good.
	if (url.pathname.startsWith("/api/")) {
		console.debug("[service] Bypassing cache for internal API:", url.href);
		event.respondWith(fetch(event.request));
		return;
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
                    // For navigation requests, assume they are internal and cacheable.
                    // This is less likely to be an external API but could be.
                    // If navigation leads to an external domain, the NON_CACHEABLE_HOSTS check above handles it.
					await cache.add(new Request(event.request.url)) // Or use put if you have the response already
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
					if (event.request.url.indexOf("http") === 0) { // Ensures it's an HTTP/S request
                        // Only cache GET requests and non-cacheable hosts are already filtered out
                        // by the check at the top of the fetch listener.
                        // However, a double-check here adds robustness.
                        if (event.request.method === 'GET' && !NON_CACHEABLE_HOSTS.includes(url.hostname)) {
                            // --- MODIFICATION: Using .put() with .clone() ---
                            // We clone the response because networkResponse will be consumed when returned.
                            // If we want to also put it in cache, we need a separate copy.
                            await offline.put(event.request.url, networkResponse.clone());
                            console.debug("[service] Cached via .put():", event.request.url);
                        }
					}
					return networkResponse
				}

				// Fallback to cache if network failed and no other response found
                const cached = await offline.match(event.request.url) // Re-check if it's in offline cache
                if (cached) {
                    console.debug("[service] [cached] (fallback)", event.request.url);
                    return cached;
                }

				console.error("[service] No response found for", event.request.url);
				return null; // If neither network nor cache has it
			})()
		)
	}
})

