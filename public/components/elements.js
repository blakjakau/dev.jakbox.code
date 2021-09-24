

const isset = (v)=>{return ('undefined'!=typeof v) }
const isNotNull = (v)=>{return (isset(v) && v != null) }
const isFunction = (v)=>{return (isset(v) && 'function'==typeof v) }
const isElement = (v)=>{return (isset(v) && v instanceof Element) }
const clone = (e)=>{return JSON.parse(JSON.stringify(e))}

// add a stylesheet with a promise return
const addStylesheet = (u,id)=>{ return new Promise((i,n)=>{
	let s=document.createElement("link");
	s.addEventListener("load",e=>{i(e)});
	s.rel='stylesheet';
	if(isset(id)){s.setAttribute("id", id)};
	
	// find first style elements
	let f = document.head.querySelector("style")
	if(f!==null) {
		s.href=u;document.head.insertBefore(s,f);
	} else {
		s.href=u;document.head.append(s,f);
	}
})}
	
// addStylesheet("//fonts.googleapis.com/icon?family=Material+Icons+Outlined").then((e,u)=>{console.warn("Material Icons stylesheet loaded")})
addStylesheet("//tools.jakbox.net/components/elements.css").then((e,u)=>{console.warn("elements stylesheet loaded")});

async function readAndOrderDirectory(handle) {
	let tree = [];
	for await (const entry of handle.values()) {
		// set the parent folder
		entry.container = handle
		tree.push(entry)
	}
	tree.sort((a,b)=>{ return a.name < b.name?-1:1 })
	tree.sort((a,b)=>{ return a.kind == "file"?1:-1 })
	return tree;
}

class Element extends HTMLElement {
	constructor(content) {
		super();
		if(isset(content)) this.innerHTML = content;
		this.on = this.addEventListener;
		this.off = this.removeEventListener
		this._displayType = "inline-block";
	}
	setHook(v) { this.hook = v; return this }
	set hook(v) {
		// this.removeClass("float-right", "float-left");
		this.removeAttribute("hook")
		switch(v) {
			case "left":
				// this.addClass("float-left");
				this.setAttribute("hook", "left")
			break;
			case "right":
				// this.addClass("float-right");
				this.setAttribute("hook", "right")
			break;
			default: break;
		}
		return this
	}
	connectedCallback() {
		this._inDOM = true;
		// this.addClass("ui", "element")
	}
	disconnectedCallback() { this._inDOM = false; }
	set displayType(v) { this.style.display = this._displayType; }
	addClass() { for(let i in arguments) { let a=arguments[i]; this.classList.add(a) }; return this }
	removeClass() { for(let i in arguments) { let a=arguments[i]; this.classList.remove(a) }; return this }
	hasClass(c) { return this.classList.contains(c) }
	toggleClass(c) { if(this.hasClass(c)) { this.removeClass(c); } else { this.addClass(c); } return this }
	hide() { this.style.display = "none"; return this; }
	show() { this.style.display = this._displayType; return this; }
	prepend() {  for(let i in arguments) { let e=arguments[i]; if(e instanceof HTMLElement) this.insertBefore(e, this.firstElementChild); }; return this;	}
	append() {  for(let i in arguments) { let e=arguments[i]; if(e instanceof HTMLElement) this.appendChild(e)}; return this; }
	appendTo(e) { if(e instanceof HTMLElement) { e.appendChild(this) } return this; }
	remove() { if(this.parentElement!==null) { this.parentElement.removeChild(this); } return this; }
	empty() { while(this.hasChildNodes()) { this.removeChild(this.lastChild) } return this }
	get visible() { if(this._inDOM && this.style.display != "none") { return true; } else { return false; } }

}

// An Effects element is a holder of Effects
// it is used to prevent effects breaking the bounds of the containing element
class Effects extends HTMLElement {
	constructor() { super(); }
}

class Effect extends HTMLElement {
	constructor() {
		super();
		this.on = this.addEventListener;
		this.off = this.removeEventListener
		this._animating;
		this.on("webkitAnimationEnd", ()=>{ this._animating = false; this.removeAttribute("active"); })
		this.on("animationend", ()=>{ this._animating = false; this.removeAttribute("active"); })
	}
	activate(event) {
		if(this._animating) return;
		if(event) {
			let x = parseInt(event.layerX,10), y = parseInt(event.layerY,10);
			this.style.top = y+"px";
			this.style.left = x+"px";
		}
		this.removeAttribute("active"); setTimeout(()=>{this.setAttribute("active", "true")})
		this._animating = true;
	}
	deactivate(event) { this.removeAttribute("active"); this._animating = false}
	appendTo(v) { if(v instanceof HTMLElement) { v.append(this) } }
}

class Ripple extends Effect {
	constructor() { super();
		// animationend
	}
}

class Inline extends Element {
	constructor(content) {
		super(content);
		this._displayType = "inline";
	}
}

class Block extends Element {
	constructor(content) {
		super(content);
		this._displayType = "block";
	}
}

class View extends Block {
	constructor(content) {
		super(content);
	}
}

class ContentFill extends Block {
	constructor(content) {
		super(content);
	}
}

let inputCount=0;
class Input extends Element {
	// input handler with base input element and built in validation hooks
	constructor(content) {
		super(content);
		this._id = "ui_input_"+inputCount++;
		const input = this._input = document.createElement("input");
		const label = this._label = document.createElement("label");
		this.id = this._id;
		super.append.apply(this, [label, input]);
	}
	append() { return console.error("Input can't contain additional elements"); }
	prepend() { return console.error("Input can't contain additional elements"); }
	addEventListener(e,f,o) { this._input.addEventListener(e,f,o); }
	removeEventListener(e,f) { this._input.removeEventListener(e,f); }
	set id(v) { this._id = v; this._input.setAttribute("id", v); this._label.setAttribute("for", v); }
	set label(v) { this._label.innerHTML = v }
	set placeholder(v) { this._input.setAttribute("placeholder", v); }
	set value(v) { this._input.value = v; }
	get style() { return this._input.style; }
	get value() { return this._input.value; }
	focus() { this._input.focus(); }
}

class Button extends Element {
	constructor(content) {
		super(content);
		// like a regular button, but automatically maintains an internal icon/text sub-elements
		this._icon = new Icon();
		this._text = new Inline();
		this._text.innerHTML = this.innerHTML;
		this.innerHTML = ""
		if(isset(content)) this._text.innerHTML = content;
		
		this._effect = new Effects();
		this._ripple = new Ripple();
		this._effect.append(this._ripple);
		
		
		this.on("pointerdown", (event)=>{this._ripple.activate(event)} )
		this.on("focus", ()=>{this._ripple.activate()} )
		this.on("blur", ()=>{ this._ripple.deactivate()} )
		this.on("keypress", (e)=>{
			if("Space Enter".indexOf(e.code)>-1) {
				e.preventDefault();
				this.click();
			} else {
			}
		})
		// this.setAttribute("tabindex",0);
		return this;
	}
	
	connectedCallback() {
		super.connectedCallback.apply(this)
		
		this.append(this._effect);
		this.prepend(this._text, this._icon)
		
		let icon = this.getAttribute("icon");
		if(icon!=null) {
			this._icon.innerHTML = icon
		}
	}
	setIcon(v) { this.icon = v;	return this }
	
	set id(v) { this.setAttribute("id", v); }
	set icon(v) { this._icon.innerHTML = v; }
	set text(v) {
		if(v.indexOf("<br>")>-1 || v.indexOf("<br/>")>-1) { this.setAttribute("multiline", "multiline");	} else { this.removeAttribute("multiline") }
		if(v==""||v==undefined||v==null) { this._text.remove() } else if(this._text.innerHTML=="") { this.append(this._text); }
		this._text.innerHTML = v;
	}
	// get innerHTML() { return this._text.innerHTML }
}

class FileItem extends Button {
	constructor(content) {
		super(content);
		this._refresh = new Icon()
		this._refresh.innerHTML = "refresh"
		this._refresh.style.visibility = "hidden"
		this._refresh.hook = "right"
		this._refresh.setAttribute("size", "tiny")
		
		return this;
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		this.append(this._refresh)
	}
	
	set showRefresh(v) {
		if(!!v) {
			this._refresh.style.visibility = "visible"
		} else {
			this._refresh.style.visibility = "hidden"
		}
	}
	get refresh() {
		return this._refresh
	}
}



 // scoping for tab function handlers

const dragenter = (e) => { e.stopPropagation(); e.preventDefault(); }
const dragover = (e) => { e.stopPropagation(); e.preventDefault(); }
const dragleave = (e) => { e.stopPropagation(); e.preventDefault(); }
const drop = (e) => { console.log(e) }

class TabItem extends Button {
	constructor(content) {
		super(content);
		this._close = new Icon()
		this._close.innerHTML = "close"
		this._close.style.visibility = "visible"
		this._close.setAttribute("close", "close")
		this._close.setAttribute("size", "tiny")
		this.setAttribute("draggable", true)

		this.ondragstart = (e)=>{
			// this.style.display="none";
			e.dataTransfer.dropEffect = "copy";
			e.dataTransfer.effectAllowed = "all";
		}
		
		this.ondragover = dragover
		this.ondragleave = dragleave
		this.ondragenter = dragenter
		// this.ondrop = (e)=>{ this.style.display=""; drop(e) }
		
		return this;
	}
	
	connectedCallback() {
		super.connectedCallback.apply(this)
		this._effect.remove()
		this.append(this._close)
	}
	
	set changed(v) {
		this._changed = !!v
		if(this._changed) {
			this._close.innerHTML = "circle"
		} else {
			this._close.innerHTML = "close"
		}
	}
	
	get changed() { return this._changed }
	
	set showClose(v) {
		if(!!v) {
			this._close.style.visibility = "visible"
		} else {
			this._close.style.visibility = "hidden"
		}
	}
	
	get close() {
		return this._close
	}
}



class CounterButton extends Button {
	constructor(content) {
		super(content);
		this._counter = new Element()
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		this.append(this._counter);
	}
	set count(v) {
		if(v=="") { return this._counter.innerHTML = "" }
		if(!isNaN(v)) {
			this._counter.innerHTML = v;
			this.append(this._counter);
		} else {
			this._counter.innerHTML = "";
		}
	}
	get count() {
		if(this._counter.innerHTML == "") return 0;
		return parseInt(this._counter.innerHTML,10);
	}
}

class Icon extends Element {
	constructor(content) {
		super(content);
	}
}

class Panel extends Block {
	constructor(content) {
		super(content);
	}
}

const actionBars = [];
let actionBarResize=null;
window.addEventListener("resize", e=>{
	clearTimeout(actionBarResize);
	actionBars.forEach(bar=>{
		bar.btnOverflow.remove()
	})
	actionBarResize = setTimeout(()=>{
		actionBars.forEach(bar=>{
			bar.update(true);
		})
	});
})


let tabIndexGroup = 1;
class ActionBar extends Block {
	constructor(content) {
		super(content);
		this.tabGroup = tabIndexGroup++;
		// default to top bar if not specified
		this.btnOverflow = new Button();
		this.pnlOverflow = new Panel();
		this.btnOverflow.icon = "more_vert";
		this.btnOverflow.setAttribute("overflow", "true")
		this.btnOverflow.setAttribute("hook", "right");
		this.btnOverflow.hide();
		this._overflow = true;
		
		this.hideOverflow = ()=>{
			this.overflowOpen = false;
			this.removeAttribute("open")
			this.pnlOverflow.hide();
		}
		
		this.showOverflow = ()=>{
			this.overflowOpen = true;
			this.setAttribute("open", "open")
			this.pnlOverflow.show();
			let clicked = false;
			setTimeout(()=>{
				this.pnlOverflow.addEventListener("click", ()=>{ clicked = true; setTimeout(this.hideOverflow,333) }, {once:true});
				document.addEventListener("click", ()=>{ if(!clicked) setTimeout(this.hideOverflow,1) }, {once:true});
			});
		}
		this.btnOverflow.on("click", (e)=>{
			if(!this.overflowOpen) {
				this.showOverflow()
			} else {
				this.hideOverflow()
			}
		});
		actionBars.push(this);
		return this;
	}
	connectedCallback() {
		super.connectedCallback.apply(this);
		setTimeout(()=>{
			// this.hook = "top";
			this.overflowOpen = false;
			this.hideOverflow();
			this.update(true)
		},100);
	}
	prepend() {
		for(let i in arguments) {
			if(!(arguments[i] instanceof Button) && !(arguments[i] instanceof Inline)) {
				return console.error("ActionBar can only contain objects of type Button or Inline");
			}
		}
		super.prepend.apply(this, arguments);
		this.update(this._inDOM)
		setTimeout(()=>{this.update(this._inDOM)}, 1000)
		return this
	}
	append() {
		for(let i in arguments) {
			if(!(arguments[i] instanceof Button) && !(arguments[i] instanceof Inline)) {
				return console.error("ActionBar can only contain objects of type Button or Inline");
			}
		}
		super.append.apply(this, arguments)
		this.update(this._inDOM)
		setTimeout(()=>{this.update(this._inDOM)}, 1000)
		return this
	}
	update(resize=false) {
		// keep the overflow elements always at the end of the bar
		
		// let ts=1, first=true;
		if(this._overflow) {
			if(resize) {
				// this.btnOverflow.style.opacity=0
				if(this.childElementCount<=2) return;
				// first attach all the elements to the bar!
				while(this.pnlOverflow.childElementCount>0) {
					super.append.apply(this, [this.pnlOverflow.firstElementChild]);
				}
				// then get the current width of the bar and add elements until it's full
				let t=0, w = this.offsetWidth - (48+8);
				let skip = false;
				// then iterate until we need to overflow
				this.btnOverflow.setAttribute("tabindex", this.tabGroup);
				for(let i=0;i<this.childElementCount;i++) {
					let child = this.children[i];
					if(child instanceof Button) {
						// add a tabindex to the element if it's a button
						child.setAttribute("tabindex", this.tabGroup);
					}
					
					if(child == this.btnOverflow || child == this.pnlOverflow) continue;
					if(i==2) {
						// if it's the FIRST child always show it
						t += child.offsetWidth;
						continue;
					}
					if((t+child.offsetWidth) < w && !skip) {
						t += child.offsetWidth;
					} else {
						i--;
						skip = true;
						this.pnlOverflow.append(child);
					}
				};
			}
			super.append.apply(this, [this.btnOverflow, this.pnlOverflow])
			// setTimeout(()=>{this.btnOverflow.style.opacity=1})
		} else {
			
		}

		// only show the overflow if it's relevant
		if(this.pnlOverflow.childElementCount>0) {
			this.btnOverflow.show();
		} else {
			this.btnOverflow.hide();
		}
		return this
	}
	
	set overflow(v) {
		this._overflow = (v?true:false);
		if(this._overflow) {
			this.setAttribute("overflow", true);
		} else {
			this.removeAttribute("overflow")
		}
	}
	
	set hook(v) {
		switch(v) {
			case "top": v=0; break;
			case "bottom": v=-1; break;
			default:
				if(isNaN(v)) v=0;
			break;
		}
		if(v>=0) {
			this.addClass("top");
			this.style.top = v+"px";
			this.style.bottom = "auto";
		} else {
			this.addClass("bottom");
			this.style.top = "auto";
			this.style.bottom = (-(v+1))+"px";
		}
		return this
	}
}

class TabBar extends Block {
	constructor(content) {
		super();
		this._tabs = []
		this.addEventListener("mousewheel", (e)=>{
			if(!e.shiftKey) {
				this.scrollLeft += e.deltaY
			}
		})
	}
	get tabs() {
		return this._tabs
	}
	
	set close(v) {
		if(!isFunction(v)) throw new Error("close must be a function");
		this._close = v
	}

	set click(v) {
		if(!isFunction(v)) throw new Error("click must be a function");
		this._click = v
	}
	get activeIndex() {
		for(let i=0,l=this._tabs.length;i<l;i++) {
			if(this._tabs[i].getAttribute("active")!==null) {
				return i
			}
		}
	}
	
	get activeTab() {
		let i = this.activeIndex;
		return this._tabs[i]
	}
	
	next() {
		let i = this.activeIndex; i++;
		if(i>this._tabs.length-1) { i=0; }
		this.tabs[i].click()
	}
	
	prev() {
		let i = this.activeIndex; i--;
		if(i<0) { i=this._tabs.length-1; }
		this.tabs[i].click()
	}

	add(config) {
		const tab = new TabItem(config.name)
		tab.config = config
		this._tabs.push(tab)
		this.append(tab)
		
		tab.onclick = (event)=>{
			this._tabs.forEach(t=>{t.removeAttribute("active")})
			tab.setAttribute("active", "active")
			if('function' == typeof this._click) {
				event.tab = tab
				this._click(event)
			}
		}
		
		tab.oncontextmenu = (event)=>{
			event.preventDefault();
			event.stopPropagation()
		}
		
		tab.onpointerup = event=>{
			console.log(event.which)
			if(event.which==2) {
				event.stopPropagation();
				event.tab = tab
				if('function' == typeof this._close) {
					event.tab = tab
					this._close(event)
				}
			}
		}
		
		tab.close.onclick = (event)=>{
			event.stopPropagation();
			event.tab = tab
			if('function' == typeof this._close) {
				event.tab = tab
				this._close(event)
			}
		}
		return tab
	}
	
	remove(tab) {
		for(let i=0,l=this._tabs.length; i<l; i++) {
			if(this._tabs[i] == tab) {
				this._tabs.splice(i, 1)
				i--;
				if(tab.getAttribute("active")!=null) {
					if(this._tabs[i]) {
						this._tabs[i].click()
					} else if(this._tabs[i+1]) {
						this._tabs[i+1].click()
					} else if(this._tabs[i-1]) {
						this._tabs[i-1].click()
					}
				}
			}
		}
		tab.remove();
	}
}


class Menu extends Panel {
	constructor(content) {
		super(content);
	}
	
	connectedCallback() {
		super.connectedCallback.apply(this)
	}
	
	set options(v) {
		
	}
	
	showAt(element) {
		if(!(element instanceof HTMLElement)) { throw new Error("showAt requires an HTMLElement in the current DOM") }
		
		this.setAttribute("visible", "true");
	}
}


// file selection list, takes an array of file/folder handles and produces a directory tree
// lazily loads subfolders on request

class FileList extends ContentFill {
	constructor(content) {
		super(content)
		const inner = this._inner = new Block(); //document.createElement("div")
		inner.classList.add("inner")

		// const progress = this._progress = document.createElement("div");
		// progress.classList.add("progress");
		// progress.innerHTML = "progress";
	}
	connectedCallback() {
		this.append(this._inner);
		// this.append(this._progress);
		this._inner.setAttribute("slim", "true")
	}
	
	set unlock(v) {
		if(!isFunction(v)) throw new Error("unlock must be a function");
		this._unlock = v
	}
	set open(v) {
		if(!isFunction(v)) throw new Error("open must be a function");
		this._open = v
	}
	
	get open() { return this._open }
	
	_render(base, tree) {
		const codeFiles = "json js mjs c cpp h hpp css html".split(" ")
		const imageFiles = "jpg jpeg gif tiff png ico bmp".split(" ")
		if(base.empty) { base.empty() }
		tree.forEach(item=>{
			if(item.kind=="directory") {
				
				let e = new FileItem();
				e.icon = "folder"
				e.text = " "+item.name
				e.showRefresh = false
				e.holder = new Block()
				e.holder.setAttribute("slim", "true")
				e.holder.style.paddingLeft = "12px"
				e.open = false;
				base.append(e, e.holder)
				
				if(item.locked) {
					e.icon = "lock"
					e.addEventListener("click", async ()=>{
						if('function' == typeof this._unlock) {
							e.setAttribute("loading", "true")
							if(await this._unlock(item)) {
								item.locked = false
								item.tree = await readAndOrderDirectory(item);
								item.open = true
								this._render(base, tree)
							}
							e.removeAttribute("loading")
						} else {
							console.warn("FileTree has no unlock function. Please provide an unlock to grant file access")
						}
					})
				} else {
				
					if(item.tree && item.open) {
						e.icon = "folder_open"
						e.showRefresh = true
						this._render(e.holder, item.tree)
					}
					
					e.addEventListener("click", async (event)=>{
						item.open = !item.open
						if(item.open) {
							if(!item.tree) {
								e.setAttribute("loading", "true")
								item.tree = await readAndOrderDirectory(item);
							}
							e.icon = "folder_open"
							e.showRefresh = true
							this._render(e.holder, item.tree)
							e.removeAttribute("loading")
						} else {
							e.icon = "folder"
							e.showRefresh = false
							e.holder.empty()
						}
					})
					
					e.refresh.addEventListener("click", async (event)=>{
						event.stopPropagation()
						e.setAttribute("loading", "true")
						item.tree = await readAndOrderDirectory(item);
						this._render(e.holder, item.tree)
						e.removeAttribute("loading")
					})
					
				}
				
			} else {
				
				let e = new FileItem();
				e.showRefresh = false
				if(codeFiles.indexOf(item.name.split(".").pop())!==-1) {
					e.icon = "code"
					e.addEventListener("click", async event=>{
						if('function'==typeof this._open) {
							e.setAttribute("loading", "true")
							await this._open(item);
							e.removeAttribute("loading")
						}
					})
				} else if(imageFiles.indexOf(item.name.split(".").pop())!==-1) {
					e.icon = "image"
					e.addEventListener("click", e=>{
						alert("unsupported or unknown file type")
					})
				} else {
					e.icon = "description"
					e.addEventListener("click", async event=>{
						if('function'==typeof this._open) {
							e.setAttribute("loading", "true")
							await this._open(item);
							e.removeAttribute("loading")
						}
					})
				}
				e.text = " "+item.name
				
				base.append(e)
			}
		})
		
	}
	
	set files(tree) {
		// file handles tree
		this._tree = tree
		this._render(this._inner, tree)
	}
	
	
}


// Drag & Drop file uploader box
class FileUploadList extends ContentFill {
	constructor(content) {
		super(content)
		
		const inner = this._inner = document.createElement("div")
		inner.classList.add("inner")
		
		this._autoUpload = false;
		this._uploadURL = null;
		this._uploadFilter = (f)=>{
			return true;
		};
		
		const progress = document.createElement("div");
		progress.classList.add("progress");
		progress.innerHTML = "progress";
		inner.appendChild(progress);
		
		this._dragItemStart = function(e) {
			let file = this.getAttribute("download");
			e.dataTransfer.dropEffect = "copy";
			e.dataTransfer.effectAllowed = "all";
			e.dataTransfer.setData("DownloadURL", file);
			console.debug(file);
		}
	
		const uploadFile = (file)=>{
			let url = this._uploadURL;
			let formData = new FormData()
			
			formData.append('upload', file)
			formData.append('path', this._list.path)
		
			return new Promise((accept, reject)=>{
				if(!this._uploadFilter(file)) {
					return reject("wrong file type");
				}
				fetch(url, {
					method: 'POST',
					body: formData
				})
				.then(async response => {
					if(response.status == 200) {
						accept(await response.text());
					} else {
						reject(await response.text())
					}
				})
				.catch(e => { reject(e) })
			})
		}
	
		const dragenter = (e) => { e.stopPropagation(); e.preventDefault(); }
		const dragover = (e) => { e.stopPropagation(); e.preventDefault(); inner.classList.add("hover") }
		const dragleave = (e) => { e.stopPropagation(); e.preventDefault(); inner.classList.remove("hover") }
		const drop = (e) => {
			inner.classList.remove("hover")
			e.stopPropagation();
			e.preventDefault();
			const dt = e.dataTransfer;
			const files = dt.files;
			// handleFiles(files);
			
			if(this._autoUpload && this._uploadURL && files && files.length > 0) {
				// handle uploading to a server...
				// use 1 connection per file upload
				let count = files.length;
				let complete = 0;
				
				const updateProgress = (res)=>{
					progress.style.width=`${(complete/(count-1))*100}%`;
					complete++;
					console.debug(res);
					if(complete == count) {
						setTimeout(()=>{
							progress.style.opacity = '0';
							setTimeout(()=>{
								progress.style.width = '0px';
								progress.style.height = '0px';
							}, 333);
						}, 250);
						if('function'==typeof this._onuploaded) {
							this._onuploaded(files);
						}
					}
				}

				progress.style.opacity = '1';
				progress.style.width = '8px';
				progress.style.height = '8px';
				([...files]).forEach(file=>{
					uploadFile(file).then(updateProgress).catch(console.warn)
				})
			} else {
				if(files && files.length > 0) {
					if('function'==typeof this._onupload) {
						this._onupload(files);
					} else {
						console.debug("Upload request ", files);
					}
				}
			}
		}

		inner.addEventListener("dragleave", dragleave, false);
		inner.addEventListener("dragenter", dragenter, false);
		inner.addEventListener("dragover", dragover, false);
		inner.addEventListener("drop", drop, false);
		
		
		this._tiles = [];
		this._renderList = ()=>{
			let list = this._list;
			list.files.forEach(item=>{
				let base = document.createElement("a");
				let filename = item.split("/").pop();
				let ext = filename.split(".").pop().toLowerCase();
				let type = "text/plain";
				switch(ext) {
					case "jpg": case "jpeg":
						type = "image/jpg";
					break;
					case "png":
						type = "image/png";
					break;
					case "model":
					case "zip":
						type = "application/zip";
					break;
					default:
						type = "text/plain";
					break;
				}
				let downloadURL =`${type}:${filename}:${window.location.origin}${list.path}${item}`
				
				base.src = `${window.location.origin}${list.path}${item}`;
				base.setAttribute("href", `${window.location.origin}${list.path}${item}`)
				base.innerHTML = `<label>${filename}</label>`
				base.setAttribute("title", filename);
				base.setAttribute("draggable", true)
				base.setAttribute("download", downloadURL);
				
				if(list.thumbpath) {
					base.style.backgroundImage = `url(${list.thumbpath}${item})`;
				} else {
					base.style.backgroundImage = `url(${list.path}${item})`;
				}
				base.ondragstart = this._dragItemStart;
				inner.append(base);
			})
		}
		
		return this;
	}
	
	connectedCallback() {
		this.append(this._inner);
	}
	
	on(e, f, o) {
		if(e == "upload" && 'function' == typeof f) {
			this._onupload = f
		} else {
			super.on.apply(this, [e,f,o])
		}
	}
	
	set uploadURL(v) { this._uploadURL = v; }
	set autoUpload(v) { this._autoUpload = (v?true:false); }
	set uploadFilter(f) { if('function'==typeof(f)) { this._uploadFilter = f } }
	set onuploaded(f) { if('function'==typeof(f)) { this._onuploaded = f } }
	set onupload(f) { if('function'==typeof(f)) { this._onupload = f } }
	
	get list() { return this._list; }
	set list(v) {
		if(v && v.path && v.files && Array.isArray(v.files)) {
			this._list = v;
			// generate child elements base on v.files
			this._renderList();
		}
	}
	
	set ondrop(f) {
		if(!isFunction(f)) throw new Error("ondrop must be a function");
		this._ondrop = f
	}
}

// custom element MUST be registered, or the browser will throw an exception on constructor()
customElements.define("ui-element", Element);
customElements.define("ui-inline", Inline);
customElements.define("ui-block", Block);
customElements.define("ui-view", View);
customElements.define("ui-content-fill", ContentFill);
customElements.define("ui-actionbar", ActionBar);
customElements.define("ui-tabbar", TabBar);
customElements.define("ui-menu", Menu);
customElements.define("ui-button", Button);
customElements.define("ui-button-counter", CounterButton);
customElements.define("ui-file-list", FileList);
customElements.define("ui-file-item", FileItem);
customElements.define("ui-tab-item", TabItem);
customElements.define("ui-file-upload-list", FileUploadList);

customElements.define("ui-panel", Panel);
customElements.define("ui-icon", Icon);
customElements.define("ui-input", Input);
customElements.define("effect-base", Effects);
customElements.define("effect-effect", Effect);
customElements.define("effect-ripple", Ripple);

const ui = {
	"readAndOrderDirectory": readAndOrderDirectory,
	"Element": Element,
	"Inline": Inline,
	"Icon":Icon,
	"Input":Input,
	"Block": Block,
	"View": View,
	"ContentFill": ContentFill,
	
	"TabBar": TabBar,
	"TabItem": TabItem,
	"ActionBar": ActionBar,
	
	"Button": Button,
	"Menu": Menu,
	"CounterButton": CounterButton,
	"Panel": Panel,
	"FileList": FileList,
	"FileListItem": FileItem,
	"FileUploadList": FileUploadList
}
window.__ui = ui;
// export { ui, Element, Inline, Block, View, ContentFill, ActionBar, Button, Panel, FileList }
// export default ui;