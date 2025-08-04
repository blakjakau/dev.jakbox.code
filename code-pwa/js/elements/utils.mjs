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

export function sortOnName(a, b) { return a.name < b.name ? -1 : 1 }

export async function readAndOrderDirectory(handle) {
	let files = [],
		folders = []
	for await (const entry of handle.values()) {
		// set the parent folder
		if(entry != handle) entry.container = handle
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
			
			if(entry != handle) entry.container = handle
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

// Add this function to your utils.mjs file

/**
 * Determines a Material Symbols icon name for a file based on its extension.
 * @param {string} name - The full name of the file (e.g., 'styles.css').
 * @returns {string} The name of the icon.
 */
export function getIconForFileName(name) {
    // This map is now the single source of truth for file extension icons!
    const fileTypes = {
        "javascript": ["js", "mjs", "cjs"],
        "code": ["c", "cpp", "h", "hpp", "cs", "java", "py", "rb", "go", "rs", "sh"],
        "html": ["htm", "html", "dhtml"],
        "css": ["css", "scss", "less"],
        "php": ["php"],
        "picture_as_pdf": ["pdf"],
        "data_object": ["json", "xml", "yaml", "yml"],
        "image": ["svg", "jpg", "jpeg", "gif", "tiff", "png", "ico", "bmp", "webp"],
        "movie": ["avi", "mp4", "webm", "wmv", "mov", "flv", "f4v", "mkv", "3gp"],
        "music_note": ["mp3", "aac", "wma", "ogg", "wav", "flac"],
        "folder_zip": ["zip", "rar", "7z", "tar", "gz"],
        "table": ["csv", "xls", "xlsx"],
    };

    const extension = name.split('.').pop().toLowerCase();

    for (const icon in fileTypes) {
        if (fileTypes[icon].includes(extension)) {
            return icon;
        }
    }

    // Default icon for any other file type.
    return 'description';
}
