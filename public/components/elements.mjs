

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
addStylesheet("//build.jakbox.net/elements/elements.css").then((e,u)=>{console.warn("elements stylesheet loaded")});

class Element extends HTMLElement {
	constructor(content) {
		super();
		if(isset(content)) this.innerHTML = content;
		this.on = this.addEventListener;
		this.off = this.removeEventListener
		this._displayType = "inline-block";
	}
	setHook(v) { this.hook = v; return this }
	set hook(v) { this.removeClass("float-right", "float-left"); switch(v) { case "left": this.addClass("float-left"); break; case "right": this.addClass("float-right"); break; default: break; } return this }
	connectedCallback() {
		this._inDOM = true;
		this.addClass("ui", "element")
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
		this.on("webkitAnimationEnd", ()=>{ this._animating = false;  })
		this.on("animationend", ()=>{ this._animating = false; })
	}
	activate(event) {
		if(this._animating) return;
		// console.log(event);
		if(event) {
			let x = parseInt(event.layerX,10), y = parseInt(event.layerY,10);
			// console.log(event, x,y);
			this.style.top = y+"px";
			this.style.left = x+"px";
		}
		this.classList.remove("active"); setTimeout(()=>{this.classList.add("active")})
		this._animating = true;
	}
	deactivate(event) { this.classList.remove("active"); this._animating = false}
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
		super();
		// like a regular button, but automatically maintains an internal icon/text sub-elements
		this._icon = new Icon();
		this._text = new Inline();
		if(content) {
			this.innerHTML = content;
		}
		
		let icon = this.getAttribute("icon");
		// console.log(icon);

		// if(isset(content)) this._text.innerHTML = content;
		this.append(this._icon, this._text)
		
		this._effect = new Effects();
		this._ripple = new Ripple();
		this._effect.append(this._ripple);
		
		this.append(this._effect);
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
		this.setAttribute("tabindex",0);
		return this;
	}
	setIcon(v) { this.icon = v;	return this }
	// setHook(v) { this.hook = v; return this }
	// set hook(v) {
	// 	this.removeClass("float-right", "float-left")
	// 	switch(v) {
	// 		case "left": this.addClass("float-left"); break;
	// 		case "right": this.addClass("float-right"); break;
	// 		default: break;
	// 	}
	// 	return this
	// }
	set id(v) { this.setAttribute("id", v); }
	set icon(v) { this._icon.innerHTML = v; }
	set innerHTML(v) {
		if(v.indexOf("<br>")>-1 || v.indexOf("<br/>")>-1) { this.addClass("multiline");	}
		this._text.innerHTML = v; if(v==""||v==undefined||v==null) { this._text.remove() } else { this.append(this._text); }
	}
	get innerHTML() { return this._text.innerHTML }
}

class CounterButton extends Button {
	constructor(content) {
		super(content);
		this._counter = new Element().addClass("counter");
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
		this.addClass("material-icons");
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
	actionBarResize = setTimeout(()=>{
		actionBars.forEach(bar=>{
			bar.update(true);
		})
	});
})

class ActionBar extends Block {
	constructor(content) {
		super(content);
		// default to top bar if not specified
		this.btnOverflow = new Button();
		this.pnlOverflow = new Panel();
		this.btnOverflow.icon = "more_vert";
		this.btnOverflow.hook = "right";
		this.btnOverflow.hide();
		this._overflow = true;
		// super.append.apply(this, this.btnOverflow);
		// super.append.apply(this, this.pnlOverflow);

		this.hideOverflow = ()=>{
			this.overflowOpen = false;
			this.removeClass("open");
			this.pnlOverflow.hide();
		}
		
		this.showOverflow = ()=>{
			this.overflowOpen = true;
			this.addClass("open");
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
			this.hook = "top";
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
		
		if(this._overflow) {
			super.prepend.apply(this, [this.pnlOverflow, this.btnOverflow])
	
			if(resize) {
				if(this.childElementCount<=2) return;
				// first attach all the elements to the bar!
				while(this.pnlOverflow.childElementCount>0) {
					super.append.apply(this, [this.pnlOverflow.firstElementChild]);
				}
				
				
				// then get the current width of the bar and add elements until it's full
				let t=0, w = this.offsetWidth - 48;
				let skip = false;
				
				// console.log(this.children);
				// then iterate until we need to overflow
				for(let i=0;i<this.childElementCount;i++) {
					let child = this.children[i];
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
		console.log(this._overflow);
		
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


class FileList extends ContentFill {
	constructor(content) {
		super(content)
		
		const inner = document.createElement("div")
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
			console.log(file);
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
					console.log(res);
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
						console.log("Upload request ", files);
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
		
		this.append(inner);
		return this;
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
customElements.define("ui-button", Button);
customElements.define("ui-button-counter", CounterButton);
customElements.define("ui-file-list", FileList);

customElements.define("ui-panel", Panel);
customElements.define("ui-icon", Icon);
customElements.define("ui-input", Input);
customElements.define("effect-base", Effects);
customElements.define("effect-effect", Effect);
customElements.define("effect-ripple", Ripple);

const ui = {
	"Element": Element,
	"Inline": Inline,
	"Icon":Icon,
	"Input":Input,
	"Block": Block,
	"View": View,
	"ContentFill": ContentFill,
	"ActionBar": ActionBar,
	"Button": Button,
	"CounterButton": CounterButton,
	"Panel": Panel,
	"FileList": FileList
}
window.__ui = ui;
export { ui, Element, Inline, Block, View, ContentFill, ActionBar, Button, Panel, FileList }
export default ui;