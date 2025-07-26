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
	"css/ai-manager.css",
	"css/diff-output.css",
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

self.addEventListener("fetch", (event) => {
	event.respondWith(
		(async () => {
			const url = new URL(event.request.url);

			// --- Priority 1: Special Handlers (that don't touch cache) ---

			// Special handler for version request. This is top priority.
			if (url.pathname.endsWith("/version.json")) {
				console.debug("[service] Intercepting and responding to /version.json");
				const responseBody = { appName: "code.jakbox.dev", version: APP_VERSION };
				return new Response(JSON.stringify(responseBody), {
					headers: { "Content-Type": "application/json" },
				});
			}

			// Do not cache calls to external or internal APIs.
			if (NON_CACHEABLE_HOSTS.includes(url.hostname) || url.pathname.startsWith("/api/")) {
				console.debug("[service] Bypassing cache for API request:", url.href);
				return fetch(event.request);
			}

			// --- Priority 2: Handle Navigation Requests ---

			if (event.request.mode === "navigate") {
				try {
					// Try network first for navigation.
					const networkResponse = await fetch(event.request);
					// If successful, update the cache.
					const cache = await caches.open(CACHE_PRELOAD);
					cache.put(event.request, networkResponse.clone());
					return networkResponse;
				} catch (error) {
					// Network failed, serve the offline page from the cache.
					console.warn("[service] Navigation failed, serving offline page.", error);
					const cache = await caches.open(CACHE_PRELOAD);
					return await cache.match(OFFLINE_URL);
				}
			}

			// --- Priority 3: Handle All Other Requests (Assets, etc.) ---

			// Development-specific substitutions
			const isDev = self.location.hostname === "localhost";
			if (isDev) {
				let substituteUrl;
				if (event.request.url.includes("manifest.json")) {
					substituteUrl = event.request.url.replace("manifest.json", "manifest_dev.json");
				} else if (event.request.url.includes("favicon.png")) {
					substituteUrl = event.request.url.replace("favicon.png", "favicon_dev.png");
				}
				if (substituteUrl) {
					console.log("[service] [dev-substitute]", substituteUrl);
					return fetch(substituteUrl);
				}
			}

			// Cache-first strategy for assets
			const cache = await caches.open(CACHE_OFFLINE);
			const cachedResponse = await cache.match(event.request);
			if (cachedResponse) {
				console.debug("[service] [cache] Serving from cache:", event.request.url);
				return cachedResponse;
			}

			// If not in cache, fetch from network, cache it, and return it.
			try {
				const networkResponse = await fetch(event.request);
				// Check for valid response before caching
				if (networkResponse && networkResponse.status === 200) {
					console.debug("[service] [network] Caching new asset:", event.request.url);
					await cache.put(event.request, networkResponse.clone());
				}
				return networkResponse;
			} catch (error) {
				console.error("[service] Asset fetch failed, and not in cache:", event.request.url, error);
				return new Response("", { status: 404, statusText: "Not Found" });
			}
		})()
	);
})

