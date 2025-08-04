import { ContentFill, Block } from './element.mjs';
import { Icon } from './icon.mjs';
import { FileItem } from './fileitem.mjs';
import { isFunction, getIconForFileName } from './utils.mjs';
import { readAndOrderDirectory, readAndOrderDirectoryRecursive, buildPath } from './utils.mjs';

let tabIndexGroup = 1;

export class FileList extends ContentFill {
	constructor(content) {
		super(content)
		const inner = (this._inner = new Block()) //document.createElement("div")
		const indexing = (this._indexing = new Icon("find_in_page"))
		indexing.setAttribute("title", "indexing files")
		
		indexing.classList.add("indexing")
		inner.classList.add("inner")
		indexing.hide();
		
		this._expandLevels = 0
		this._active = [] // maintain a list of the active files
		this.tabGroup = tabIndexGroup++
		this._contextElement = null
        this._openFolders = new Set(); // New: To store paths of expanded folders
		this.on("contextmenu", (e) => {
			e.preventDefault() && e.stopPropagation()
		})

		this.itemContextMenu = (ev) => {
			ev.preventDefault()
			//  ev.stopPropagation();
			if ("function" == typeof this._context) {
				this._contextElement = ev.srcElement
				this._context(ev)
				//  e.on("blur", e=>{
				//      setTimeout(
				//  })
			}
		}
	}
	connectedCallback() {
		this.append(this._inner)
		this.append(this._indexing)
		// this.append(this._progress);
		this._inner.setAttribute("slim", "true")
	}
	
	set autoExpand(v) {
		if(~isNaN(v)) {
			this._expandLevels = v
		}
	}

	get autoExpand() {
		return this._expandLevels
	}

	set unlock(v) {
		if (!isFunction(v)) throw new Error("unlock must be a function")
		this._unlock = v
	}

	set unsupported(v) {
		if (!isFunction(v)) throw new Error("unsupported must be a function")
		this._unsupported = v
	}

	set open(v) {
		if (!isFunction(v)) throw new Error("open must be a function")
		this._open = v
	}

	get open() {
		return this._open
	}

	set close(v) {
		if (!isFunction(v)) throw new Error("close must be a function")
		this._close = v
	}

	get close() {
		return this._close
	}
	
	set expand(v) {
		if (!isFunction(v)) throw new Error("expand must be a function")
		this._expand = v
	}

	get expand() {
		return this._expand
	}

	set context(v) {
		if (!isFunction(v)) throw new Error("open must be a function")
		this._context = v
	}

	get contextElement() {
		return this._contextElement
	}

	get activeItem() {
		const active = this.querySelector("ui-file-item[active]")
		return active
	}

	byTitle(title) {
		const file = this.querySelector(`ui-file-item[title="${title}"`)
		if (!file) console.warn("No match found for", title)
		return file
	}

	async refreshAll() {
	    const items = this.querySelectorAll("ui-file-item")
	    for(const item of items) {
	        if(item.getAttribute("icon").indexOf("folder") == 0) await item.refresh.click()
	    }
	}

	async refreshFolder(folderHandle) {
		if (!folderHandle) return;
		const path = buildPath(folderHandle);
		const folderItem = this.querySelector(`ui-file-item[title="${path}"]`);
		if (folderItem && folderItem.item.kind === 'directory') {
			folderItem.setAttribute("loading", "true");
			folderItem.item.tree = await readAndOrderDirectory(folderItem.item);
			if (folderItem.item.open) {
				this._render(folderItem.holder, folderItem.item.tree);
			}
			folderItem.removeAttribute("loading");
		}
	}

	set supported(v) {
		let ok = true,
			extensions = [],
			regexes = []
		if (!Array.isArray(v) || v.length < 1) ok = false
		if (ok) {
			v.forEach((r) => {
				if ("string" == typeof r) {
					if (extensions.indexOf(r) === -1) extensions.push(r)
					return
				}
				if (r instanceof RegExp) {
					if (regexes.indexOf(r) === -1) regexes.push(r)
					return
				}
				// anything else is a fail!
				ok = false
			})
		}
		if (!ok) throw new Error("supported requires an Array() of String or RegEx objects")

		this._supported = {
			ext: extensions,
			reg: regexes,
		}
	}
	
	async generateIndex(src) {
		if(this.indexing == true) {
			this.indexIsStale = true
			return null
		}
		
		setTimeout((self)=>{ self.indexing = false }, 500, [this])
		
		try {
			this.indexing = true
			this.indexIsStale = false
			this._indexing.show()
			
			const tree = await readAndOrderDirectoryRecursive(this._tree)
			
			this._indexing.hide()
			this.indexing = false
			
			// now flatten the tree into a single layer index file!
			const files = []
			const folders = []
			const flatten = (tree)=>{
				for(let item of tree) {
					if(item.kind == "directory") {
						folders.push(item)
						if(item.tree) flatten(item.tree)
					} else {
						files.push(item)
					}
				}
			}
			flatten(tree)
			
			this.index = {
				tree: tree,
				folders: folders,
				files: files,
			}

			if(this.indexIsStale) {
				return this.generateIndex(this._tree)
			} else {
				return this.index
			}
		} catch(e) {
			console.warn("unable to generate files index:", e.message)
			this.indexing = false	
			return null
		}
	}

	openPaths() {
		const open = []
		const openNodes = this._inner.querySelectorAll("[open-folder]")
		openNodes.forEach(node=>{
			const path = node.getAttribute("title")
			open.push(path)
		})
		return open
	}

	_render(base, tree, depth=0) {
		// trigger an index generation (if not already done)
		const hideMask = "Zone.Identifier .swo .swp".split(" ");
		this._contextElement = null
		if (base.empty) {
			base.empty()
		}
		
		tree?.forEach((item) => {
		    
		    for(const hidden of hideMask) {
		        if(item.name.indexOf(hidden)>-1)
		        return
		    }
		    
			if (item.kind == "directory") {
				let e = new FileItem()
				
				const itemPath = buildPath(item)
				e.icon = "folder"
				e.text = " " + item.name
				e.showRefresh = false
				e.holder = new Block()
				e.holder.setAttribute("slim", "true")
				e.holder.style.paddingLeft = "12px"
				e.setAttribute("tabindex", this.tabGroup)
				e.open = false
				e.item = item
				
				e.setAttribute("title", itemPath)
				// e.setAttribute("title", buildPath(item));
				base.append(e, e.holder)

				e.on("contextmenu", this.itemContextMenu)

				if (item.locked) {
					e.icon = "lock"
					e.on("click", async () => {
						if ("function" == typeof this._unlock) {
							e.setAttribute("loading", "true")
							if (await this._unlock(item)) {
								item.locked = false
								item.tree = await readAndOrderDirectory(item)
								item.open = true
								e.setAttribute("open-folder", "true")
								this._openFolders.add(itemPath);
								this._render(base, tree,depth+1)
								this.generateIndex(this._tree)
							}
							e.removeAttribute("loading")
							if ("function" == typeof this.expand) {
    							this.expand(e.item)
    						}
						} else {
							console.warn(
								"FileTree has no unlock function. Please provide an unlock to grant file access"
							)
						}
					})
				} else { // not locked
					if (this._openFolders.has(itemPath)) {
						e.icon = "folder_open";
						item.open = true;
						e.open = true;
						e.setAttribute("open-folder", "true");
						(async () => {
							if (!item.tree) { e.setAttribute("loading", "true"); item.tree = await readAndOrderDirectory(item); e.removeAttribute("loading"); }
							this._render(e.holder, item.tree, depth + 1);
						})();
					}
					// } else if(depth<this._expandLevels) {
					// 	(async()=>{
					// 		if (!item.tree) { e.setAttribute("loading", "true"); item.tree = await readAndOrderDirectory(item) }
					// 		e.icon = "folder_open"
					// 		e.setAttribute("open-folder", "true")
					// 		this._render(e.holder, item.tree,depth+1)
					// 		if ("function" == typeof this.expand) { this.expand(e.item) }
					// 		e.removeAttribute("loading")
					// 		item.open = true
					// 	})()
					// }

					e.on("click", async (event) => {
						item.open = !item.open
						if (item.open) {
							e.setAttribute("open-folder", "true")
							this._openFolders.add(itemPath); // Add to set when opened
							if (!item.tree) { e.setAttribute("loading", "true"); item.tree = await readAndOrderDirectory(item) }
							e.icon = "folder_open"
							this._render(e.holder, item.tree,depth+1)
							e.removeAttribute("loading")
							if ("function" == typeof this.expand) { this.expand(e.item) }

						} else {
							e.removeAttribute("open-folder")
							this._openFolders.delete(itemPath); // Remove from set when closed
							e.icon = "folder"
							e.showRefresh = false
							e.holder.empty()
						}
					})

					e.refresh.on("click", async (event) => {
						event.stopPropagation()
						e.setAttribute("loading", "true")
						item.tree = await readAndOrderDirectory(item)
						if (item.open) {
							this._render(e.holder, item.tree)
						}
						e.removeAttribute("loading")
					})
				}
			} else {
				const e = new FileItem()
				const path = buildPath(item)
				e.setAttribute("tabindex", this.tabGroup)
				e.setAttribute("title", path)
				e.refresh.innerHTML = "radio_button_unchecked"
				e.item = item

				e.on("contextmenu", this.itemContextMenu)

				if (this._active.indexOf(path) > -1) {
					e.showRefresh = true
					e.setAttribute("open", "")
					e.refresh.on("pointerdown", () => {
						console.warn("close file from filelist")
						if ("function" == typeof this.close) {
							this.close(e.item)
						}
					})
				} else {
					e.showRefresh = false
				}

				if (this._current == path) {
					e.setAttribute("active", "")
				}

				let triggerOpen = false
				// first we check for SUPPORTED files...
				if (this._supported && this._supported.ext.length > 0) {
					// check extensions for a match
					if (this._supported.ext.indexOf(item.name.split(".").pop()) !== -1) {
						// this is a supported file
						triggerOpen = true
					}
				}
				if (!triggerOpen && this._supported && this._supported.reg.length > 0) {
					const reg = this._supported.reg
					for (let i = 0, l = reg.length; i < l; i++) {
						if (item.name.match(reg[i]) !== null) {
							triggerOpen = true
							i == l
						}
					}
				}

				if (triggerOpen) {
					e.on("click", async (event) => {
						if ("function" == typeof this._open) {
							e.setAttribute("loading", "true")
							await this._open(item)
							e.removeAttribute("loading")
						} else {
							console.warn("FileList.open() handler hasn't been set")
						}
					})
				} else {
					e.on("click", async (event) => {
						e.setAttribute("loading", "true")
						if ("function" == typeof this._unsupported) {
							await this._unsupported(item)
							e.removeAttribute("loading")
						} else {
							setTimeout(() => {
								e.removeAttribute("loading")
								if (!this._supported) {
									console.warn(
										"No supported files specified, set FileList.supported to enable open callbck"
									)
								} else {
									console.warn(
										"Unsupported file extension. Set FileList.unsupported to add a handler"
									)
								}
							}, 300)
						}
					})
				}
				e.icon = getIconForFileName(item.name);
				e.text = " " + item.name

				base.append(e)
			}
		})
	}

	set active(v) {
		if (v instanceof FileSystemFileHandle) {
			const target = buildPath(v)
			const selector = `[title="${target}"]`
			const match = this.querySelector(selector)
			const current = this.querySelectorAll("[active]")
			if (current.length > 0) {
				for (let item of current) item.removeAttribute("active")
			}
			if (match) {
				if (this._active.indexOf(target) == -1) {
					this._active.push(target)
				}
				match.setAttribute("active", "")
				match.setAttribute("open", "")
				match.showRefresh = true
			}
			this._current = target
		}
	}
	set inactive(v) {
		if (v instanceof FileSystemFileHandle) {
			const target = buildPath(v)
			const selector = `[title="${target}"]`
			const match = this.querySelector(selector)
			if (match) {
				match.removeAttribute("open")
				match.showRefresh = false
			}
			const index = this._active.indexOf(target)
			if (index > -1) {
				this._active.splice(index, 1)
			}
		}
	}

	set files(tree) {
		// file handles tree
		this.index = null
		this._tree = tree
		this._render(this._inner, tree)
		this.generateIndex(this._tree)
	}

	get openFolders() {
		return Array.from(this._openFolders);
	}

	set openFolders(paths) {
		this._openFolders.clear();
		if (paths) {
			paths.forEach(path => this._openFolders.add(path));
		}
		if (this._tree) {
			this._render(this._inner, this._tree);
		}
	}
	
	find(match) {
		const matches = []
		if(!this?.index?.files) return []
		
		for(let item of this.index.files) {
			if(item?.name?.indexOf(match)>-1 || item?.path?.indexOf(match)>-1) {
				matches.push(item)
			}
		}
		
		
		// alphabetise
		matches.sort((a, b)=>{ return a.name < b.name ? -1 : 1 } )
		// then lowset position in string
		matches.sort((a, b)=>{ 
			if(a.name.indexOf(match) == -1) return 1
			if(b.name.indexOf(match) == -1) return 0
			return a.name.indexOf(match) < b.name.indexOf(match) ? -1 : 1 } )

		return matches
	}
	
	
}

customElements.define("ui-file-list", FileList);