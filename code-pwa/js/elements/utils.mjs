export const isset = (v) => {
	return "undefined" != typeof v
}
export const isNotNull = (v) => {
	return isset(v) && v != null
}
export const isFunction = (v) => {
	return isset(v) && "function" == typeof v
}
export const isElement = (v) => {
	return isset(v) && v instanceof Element
}
export const clone = (e) => {
	return JSON.parse(JSON.stringify(e))
}

// add a stylesheet with a promise return
export const addStylesheet = (u, id) => {
	return new Promise((i, n) => {
		let s = document.createElement("link")
		s.addEventListener("load", (e) => {
			i(e)
		})
		s.rel = "stylesheet"
		if (isset(id)) {
			s.setAttribute("id", id)
		}

		// find first style elements
		let f = document.head.querySelector("style")
		if (f !== null) {
			s.href = u
			document.head.insertBefore(s, f)
		} else {
			s.href = u
			document.head.append(s, f)
		}
	})
}

// Load a script dynamically with a promise return
export const loadScript = (src) => {
	return new Promise((resolve, reject) => {
		// if the script already exists, resolve immediately
		if (document.querySelector(`script[src="${src}"]`)) {
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Script load error for ${src}`));
		document.head.append(script);
	});
}

export function sortOnName(a, b) { return a.name < b.name ? -1 : 1 }

export async function readAndOrderDirectory(handle) {
	let files = [],
		folders = []
	for await (const entry of handle.values()) {
		// set the parent folder
		entry.container = handle
		if (entry.kind == "file") {
			files.push(entry)
		} else {
			folders.push(entry)
		}
	}
	files.sort(sortOnName)
	folders.sort(sortOnName)
	
	return [...folders, ...files]
}

export async function readAndOrderDirectoryRecursive(handle) {
	let files = [],
		folders = [];
	const noindex = [".git", "node_modules"];
	
	try {
		for await (const entry of handle.values()) {
			// set the parent folder
			entry.container = handle
			entry.path = buildPath(entry)
			
			if (entry.kind == "file") {
				files.push(entry)
			} else {
				folders.push(entry)
			}
		}
	} catch(e) {
		throw(e)
		return null
	}
		
	files.sort(sortOnName)
	folders.sort(sortOnName)
	
	for(let folder of folders) {
		if(folder.name.substr(0,1)==="." || noindex.indexOf(folder.name)>-1) continue
		try {
			folder.tree = await readAndOrderDirectoryRecursive(folder)
		} catch(e) {
			console.warn("Unable to generate subindex", e.message)
		}
	}
	handle.tree = [...folders, ...files] 
	return [...folders, ...files]
	
}

export const buildPath = (f) => {
	if (!(f instanceof FileSystemFileHandle || f instanceof FileSystemDirectoryHandle)) {
		return ""
	}
	let n = f.name
	if (f.container) n = buildPath(f.container) + "/" + n
	return n
}
