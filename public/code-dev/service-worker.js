const CACHE_NAME = 'offline';
const OFFLINE_URL = 'offline.html';
const MAIN_URL = 'index.html';
const FILE_URL = 'openFile.html';

const deploy = false

const essential = [
	"manifest.json",
    "ui-main.mjs",
    "main.mjs",
    "../components/elements.js",
    "../components/elements.css",
    "css/main.css",
    "/favicon.ico",
    "ace/theme-code.js",
]


const staticAssets = [
	"index.html",
    "ace/ace.js",
    "ace/ext-language_tools.js",
    "ace/mode-javascript.js",
    "ace/mode-json.js",
    "ace/mode-html.js",
    "ace/mode-css.js",
    
    "https://fonts.googleapis.com/icon?family=Material+Icons",
    "https://fonts.googleapis.com/css2?family=Roboto+Mono&family=Roboto:wght@300;400&display=swap",
]


self.addEventListener('install', function(event) {
  console.debug('[ServiceWorker] Install');
  
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Setting {cache: 'reload'} in the new request will ensure that the response
    // isn't fulfilled from the HTTP cache; i.e., it will be from the network.
    await cache.add(new Request(OFFLINE_URL, {cache: 'reload'}))
    await cache.add(new Request(MAIN_URL, {cache: 'reload'}))
    await cache.add(new Request(FILE_URL, {cache: 'reload'}))
    
	// always cache these static assets
	for(let i=0,l=staticAssets.length;i<l;i++) {
		await cache.add(new Request(staticAssets[i], {cache:'reload'}))
	}

    // force cache theres only if we're deployed
    if(deploy) {
    	for(let i=0,l=essential.length;i<l;i++) {
    		await cache.add(new Request(essential[i], {cache:'reload'}))
    	}
    }
    
  })());
  
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.debug('[ServiceWorker] Activate');
  event.waitUntil((async () => {
    // Enable navigation preload if it's supported.
    // See https://developers.google.com/web/updates/2017/02/navigation-preload
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());

  // Tell the active service worker to take control of the page immediately.
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
	
	if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
		console.debug('[Service Worker]', event.request.mode, event.request.url);
    	const cache = await caches.open(CACHE_NAME);
    	
		const preloadResponse = await event.preloadResponse.catch(console.warn);
		if (preloadResponse) { return preloadResponse; }
		
		const networkResponse = await fetch(event.request).catch(console.warn)
		const cached = await cache.match(event.request.url)
		
		if(networkResponse && !cached) { return networkResponse }
		if(!cached) {  const offline = await cache.match(OFFLINE_URL); return offline }
		
		console.debug("using cached", event.request.url)
		return cached
	
    })())
  } else {
	event.respondWith((async()=>{
		const cache = await caches.open(CACHE_NAME);
		const preloadResponse = await event.preloadResponse;
		if (preloadResponse) { return preloadResponse; }
		
		const cached = await cache.match(event.request.url)
		if(cached) {
			console.debug("using cached", event.request.url)
			return cached
		}
		const networkResponse = await fetch(event.request).catch(console.warn)
		if(networkResponse) { return networkResponse }
		return cached
	})())
  	
  }
});