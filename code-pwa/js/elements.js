const isset = (v) => {
	return "undefined" != typeof v
}
const isNotNull = (v) => {
	return isset(v) && v != null
}
const isFunction = (v) => {
	return isset(v) && "function" == typeof v
}
const isElement = (v) => {
	return isset(v) && v instanceof Element
}
const clone = (e) => {
	return JSON.parse(JSON.stringify(e))
}

// add a stylesheet with a promise return
const addStylesheet = (u, id) => {
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

function sortOnName(a, b) { return a.name < b.name ? -1 : 1 }

async function readAndOrderDirectory(handle) {
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

async function readAndOrderDirectoryRecursive(handle) {
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



class Element extends HTMLElement {
	constructor(content) {
		super(content)
		if (isset(content)) this.innerHTML = content
		this.on = this.addEventListener
		this.off = this.removeEventListener
		this._displayType = "inline-block"
	}
	setHook(v) {
		this.hook = v
		return this
	}
	set hook(v) {
		// this.removeClass("float-right", "float-left");
		this.removeAttribute("hook")
		switch (v) {
			case "left":
				// this.addClass("float-left");
				this.setAttribute("hook", "left")
				break
			case "right":
				// this.addClass("float-right");
				this.setAttribute("hook", "right")
				break
			default:
				break
		}
		return this
	}
	connectedCallback() {
		this._inDOM = true
		// this.addClass("ui", "element")
	}
	disconnectedCallback() {
		this._inDOM = false
	}
	set displayType(v) {
		this.style.display = this._displayType
	}
	addClass() {
		for (let i in arguments) {
			let a = arguments[i]
			this.classList.add(a)
		}
		return this
	}
	removeClass() {
		for (let i in arguments) {
			let a = arguments[i]
			this.classList.remove(a)
		}
		return this
	}
	hasClass(c) {
		return this.classList.contains(c)
	}
	toggleClass(c) {
		if (this.hasClass(c)) {
			this.removeClass(c)
		} else {
			this.addClass(c)
		}
		return this
	}
	hide() {
		this.style.display = "none"
		return this
	}
	show() {
		this.style.display = this._displayType
		return this
	}
	prepend() {
		for (let i in arguments) {
			let e = arguments[i]
			if (e instanceof HTMLElement) this.insertBefore(e, this.firstElementChild)
		}
		return this
	}
	append() {
		for (let i in arguments) {
			let e = arguments[i]
			if (e instanceof HTMLElement) this.appendChild(e)
		}
		return this
	}
	appendTo(e) {
		if (e instanceof HTMLElement) {
			e.appendChild(this)
		}
		return this
	}
	remove() {
		if (this.parentElement !== null) {
			this.parentElement.removeChild(this)
		}
		return this
	}
	empty() {
		while (this.hasChildNodes()) {
			this.removeChild(this.lastChild)
		}
		return this
	}
	get visible() {
		if (this._inDOM && this.style.display != "none") {
			return true
		} else {
			return false
		}
	}
}

// An Effects element is a holder of Effects
// it is used to prevent effects breaking the bounds of the containing element
class Effects extends HTMLElement {
	constructor() {
		super()
	}
}

class Effect extends HTMLElement {
	constructor() {
		super()
		this.on = this.addEventListener
		this.off = this.removeEventListener
		this._animating
		this.on("webkitAnimationEnd", () => {
			this._animating = false
			this.removeAttribute("active")
		})
		this.on("animationend", () => {
			this._animating = false
			this.removeAttribute("active")
		})
	}
	activate(event) {
		if (this._animating) return
		if (event) {
			let x = parseInt(event.layerX, 10),
				y = parseInt(event.layerY, 10)
			this.style.top = y + "px"
			this.style.left = x + "px"
		}
		this.removeAttribute("active")
		setTimeout(() => {
			this.setAttribute("active", "true")
		})
		this._animating = true
	}
	deactivate(event) {
		this.removeAttribute("active")
		this._animating = false
	}
	appendTo(v) {
		if (v instanceof HTMLElement) {
			v.append(this)
		}
	}
}

class Ripple extends Effect {
	constructor() {
		super()
		// animationend
	}
}

class Inline extends Element {
	constructor(content) {
		super(content)
		this._displayType = "inline"
	}
}

class Block extends Element {
	constructor(content) {
		super(content)
		this._displayType = "block"
	}
}

class View extends Block {
	constructor(content) {
		super(content)
	}
}

class ContentFill extends Block {
	constructor(content) {
		super(content)
	}
}

let inputCount = 0
class Input extends Element {
	// input handler with base input element and built in validation hooks
	constructor(content) {
		super(content)
		this._id = "ui_input_" + inputCount++
		const input = (this._input = document.createElement("input"))
		const label = (this._label = document.createElement("label"))
		this.id = this._id
		super.append.apply(this, [label, input])
	}
	setSelectionRange(x, y) {
		this._input.setSelectionRange(x, y)
	}
	append() {
		return console.error("Input can't contain additional elements")
	}
	prepend() {
		return console.error("Input can't contain additional elements")
	}
	addEventListener(e, f, o) {
		this._input.addEventListener(e, f, o)
	}
	removeEventListener(e, f) {
		this._input.removeEventListener(e, f)
	}
	set id(v) {
		this._id = v
		this._input.setAttribute("id", v)
		this._label.setAttribute("for", v)
	}
	set label(v) {
		this._label.innerHTML = v
	}
	set placeholder(v) {
		this._input.setAttribute("placeholder", v)
	}
	set value(v) {
		this._input.value = v
	}
	get style() {
		return this._input.style
	}
	get value() {
		return this._input.value
	}
	focus() {
		this._input.focus()
	}
}

class Button extends Element {
	constructor(content) {
		super(content)
		// like a regular button, but automatically maintains an internal icon/text sub-elements
		this._icon = new Icon()
		this._text = new Inline()
		this._text.innerHTML = this.innerHTML
		this.innerHTML = ""
		if (isset(content)) this._text.innerHTML = content

		this._effect = new Effects()
		this._ripple = new Ripple()
		this._effect.append(this._ripple)

		this.on("pointerdown", (event) => {
			this._ripple.activate(event)
		})
		this.on("focus", () => {
			this._ripple.activate()
		})
		this.on("blur", () => {
			this._ripple.deactivate()
		})
		this.on("keypress", (e) => {
			if ("Space Enter".indexOf(e.code) > -1) {
				e.preventDefault()
				this.click()
			} else {
			}
		})
		// this.setAttribute("tabindex",0);
		return this
	}

	connectedCallback() {
		super.connectedCallback.apply(this)

		this.append(this._effect)
		this.prepend(this._text, this._icon)

		let icon = this.getAttribute("icon")
		if (icon != null) {
			this._icon.innerHTML = icon
		}
	}
	setIcon(v) {
		this.icon = v
		return this
	}

	set id(v) {
		this.setAttribute("id", v)
	}

	set icon(v) {
		this.setAttribute("icon", v)
		this._icon.innerHTML = v
	}

	set text(v) {
		if (v.indexOf("<br>") > -1 || v.indexOf("<br/>") > -1) {
			this.setAttribute("multiline", "multiline")
		} else {
			this.removeAttribute("multiline")
		}
		if (v == "" || v == undefined || v == null) {
			this._text.remove()
		} else if (this._text.innerHTML == "") {
			this.append(this._text)
		}
		this._text.innerHTML = v
	}
	get text() {
		return this._text.innerHTML
	}
	// get innerHTML() { return this._text.innerHTML }
}

class FileItem extends Button {
	constructor(content) {
		super(content)
		this._refresh = new Icon()
		this._refresh.innerHTML = "refresh"
		this._refresh.style.visibility = "hidden"
		this._refresh.hook = "right"
		this._refresh.setAttribute("size", "tiny")
		this.on("keydown", (e) => {
			if (e.code == "ArrowUp") {
				e.preventDefault()
				if (this.previousElementSibling instanceof FileItem) {
					return this.previousElementSibling.focus()
				}
				if (this.previousElementSibling instanceof Block) {
					if (this.previousElementSibling?.lastElementChild instanceof FileItem)
						return this.previousElementSibling.lastElementChild.focus()
				}
				if (this.previousElementSibling?.previousElementSibling instanceof FileItem) {
					return this.previousElementSibling.previousElementSibling.focus()
				}
				if (this.parentElement.previousElementSibling instanceof FileItem) {
					return this.parentElement.previousElementSibling.focus()
				}
			}
			if (e.code == "ArrowDown") {
				e.preventDefault()
				if (this.nextElementSibling instanceof FileItem) {
					return this.nextElementSibling.focus()
				}
				if (this.nextElementSibling instanceof Block) {
					if (this.nextElementSibling?.firstElementChild instanceof FileItem)
						return this.nextElementSibling.firstElementChild.focus()
				}
				if (this.nextElementSibling?.nextElementSibling instanceof FileItem) {
					return this.nextElementSibling.nextElementSibling.focus()
				}
				if (this.parentElement.nextElementSibling instanceof FileItem) {
					return this.parentElement.nextElementSibling.focus()
				}
			}
		})
		return this
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		this.append(this._refresh)
	}

	set changed(v) {
		this._changed = !!v
		if (this._changed) {
			this._refresh.innerHTML = "circle"
		} else {
			this._refresh.innerHTML = "radio_button_unchecked"
		}
	}

	get changed() {
		return this._changed
	}

	set showRefresh(v) {
		if (!!v) {
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

const dragenter = function (e) {
	e.stopPropagation()
	e.preventDefault()
}
const dragover = function (e) {
	e.stopPropagation()
	e.preventDefault()
	if (this.parentElement.animating === true) return

	let target = e.target
	let moving = this.parentElement.movingItem
	let width = this.parentElement.movingWidth
	if (moving == this) {
		return
	}

	e.dataTransfer.dropEffect = "move"

	let sibs = target.parentElement.children
	for (let i = 0, l = sibs.length; i < l; i++) {
		if (sibs[i] === this) continue
		sibs[i].style.marginLeft = ""
		sibs[i].style.marginRight = ""
	}

	let pre =
		target.previousElementSibling && target.previousElementSibling instanceof TabItem
			? target.previousElementSibling
			: null
	let next =
		target.nextElementSibling && target.nextElementSibling instanceof TabItem ? target.nextElementSibling : null

	if (next && next == moving) {
		if (next.nextElementSibling && next.nextElementSibling instanceof TabItem) {
			next = next.nextElementSibling
		}
	}
	this.parentElement.dropTarget = this
	if (target.style.marginLeft == `${width}px`) {
		this.parentElement.dropPosition = "after"
		target.style.marginLeft = ""
		if (next) {
			next.style.marginLeft = `${width}px`
		}
	} else {
		this.parentElement.dropPosition = "before"
		target.style.marginLeft = `${width}px`
		if (next) {
			next.style.marginLeft = ""
		}
	}
	this.parentElement.animating = true
	setTimeout(() => {
		this.parentElement.animating = false
	}, 150)
}
const dragleave = function (e) {
	let target = e.target
	let moving = this.parentElement.movingItem
	if (moving == this) {
		return
	}
}

// const drop = function(e) {  this.parentElement.tabDrop(e) }

class TabItem extends Button {
	constructor(content) {
		super(content)
		this._close = new Icon()
		this._close.innerHTML = "close"
		this._close.style.visibility = "visible"
		this._close.setAttribute("close", "close")
		this._close.setAttribute("size", "tiny")
		this.setAttribute("draggable", true)

		this.ondragstart = (e) => {
			this.ondrop = this.parentElement.tabDrop
			e.dataTransfer.effectAllowed = "move"
			e.dataTransfer.setData("movingTab", this)

			this.parentElement.animating = true
			this.parentElement.setAttribute("dragging", "true")
			this.parentElement.movingItem = this
			this.parentElement.movingWidth = this.offsetWidth + 2
			this.parentElement.dropTarget = null
			this.parentElement.dropPosition = null
			setTimeout(() => {
				this.style.display = "none"
				if (this.nextElementSibling && this.nextElementSibling instanceof TabItem) {
					this.nextElementSibling.style.transition = "none"
					this.nextElementSibling.style.marginLeft = this.parentElement.movingWidth + "px"
					setTimeout(() => {
						this.nextElementSibling.style.transition = ""
					}, 150)
				}
				setTimeout(() => {
					this.parentElement.animating = false
				}, 150)
			})
		}
		this.ondragend = (e) => {
			//  this.parentElement.tabDrop(e);

			this.parentElement.removeAttribute("dragging")
			this.parentElement.movingItem = undefined
			this.style.display = ""
			let sibs = this.parentElement.children
			for (let i = 0, l = sibs.length; i < l; i++) {
				sibs[i].style.marginLeft = ""
				sibs[i].style.marginRight = ""
			}
		}

		this.ondragover = dragover
		this.ondragleave = dragleave
		this.ondragenter = dragover

		return this
	}

	connectedCallback() {
		super.connectedCallback.apply(this)
		this._effect.remove()
		this.append(this._close)
	}

	set changed(v) {
		this._changed = !!v
		if (this._changed) {
			this._close.innerHTML = "circle"
		} else {
			this._close.innerHTML = "close"
		}
	}

	get changed() {
		return this._changed
	}

	set showClose(v) {
		if (!!v) {
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
		super(content)
		this._counter = new Element()
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		this.append(this._counter)
	}
	set count(v) {
		if (v == "") {
			return (this._counter.innerHTML = "")
		}
		if (!isNaN(v)) {
			this._counter.innerHTML = v
			this.append(this._counter)
		} else {
			this._counter.innerHTML = ""
		}
	}
	get count() {
		if (this._counter.innerHTML == "") return 0
		return parseInt(this._counter.innerHTML, 10)
	}
}

class Icon extends Element {
	constructor(content) {
		super(content)
	}
}

class Inner extends Block {
	constructor(content) {
		super(content)
	}
}

class Blank extends Block {
	constructor(content) {
		super(content)
	}
}

class Panel extends Block {
	constructor(content) {
		super(content)
		this.blanker = new Blank()
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		if (this.hasAttribute("blank")) {
			this.parentNode.insertBefore(this.blanker, this.nextElementSibling)
		} else {
			this.blanker.remove()
		}
	}

	attributeChangedCallback() {
		if (this.hasAttribute("blank")) {
			this.parentNode.insertBefore(this.blanker, this.nextElementSibling)
		} else {
			this.blanker.remove()
		}
	}
}

const actionBars = []
let actionBarResize = null
window.addEventListener("resize", (e) => {
	clearTimeout(actionBarResize)
	actionBars.forEach((bar) => {
		bar.btnOverflow.remove()
	})
	actionBarResize = setTimeout(() => {
		actionBars.forEach((bar) => {
			bar.update(true)
		})
	})
})

let tabIndexGroup = 1
class ActionBar extends Block {
	constructor(content) {
		super(content)
		this.tabGroup = tabIndexGroup++
		// default to top bar if not specified
		this.btnOverflow = new Button()
		this.pnlOverflow = new Panel()
		this.btnOverflow.icon = "more_vert"
		this.btnOverflow.setAttribute("overflow", "true")
		this.btnOverflow.setAttribute("hook", "right")
		this.btnOverflow.hide()
		this._overflow = true

		this.hideOverflow = () => {
			this.overflowOpen = false
			this.removeAttribute("open")
			this.pnlOverflow.hide()
		}

		this.showOverflow = () => {
			this.overflowOpen = true
			this.setAttribute("open", "open")
			this.pnlOverflow.show()
			let clicked = false
			setTimeout(() => {
				this.pnlOverflow.addEventListener(
					"click",
					() => {
						clicked = true
						setTimeout(this.hideOverflow, 333)
					},
					{ once: true }
				)
				document.addEventListener(
					"click",
					() => {
						if (!clicked) setTimeout(this.hideOverflow, 1)
					},
					{ once: true }
				)
			})
		}
		this.btnOverflow.on("click", (e) => {
			if (!this.overflowOpen) {
				this.showOverflow()
			} else {
				this.hideOverflow()
			}
		})
		actionBars.push(this)
		this.on("contextmenu", (e) => {
			e.preventDefault() && e.stopPropagation()
		})
		return this
	}
	connectedCallback() {
		super.connectedCallback.apply(this)
		setTimeout(() => {
			// this.hook = "top";
			this.overflowOpen = false
			this.hideOverflow()
			this.update(true)
		}, 100)
	}
	prepend() {
		for (let i in arguments) {
			if (!(arguments[i] instanceof Button) && !(arguments[i] instanceof Inline)) {
				return console.error("ActionBar can only contain objects of type Button or Inline")
			}
		}
		super.prepend.apply(this, arguments)
		this.update(this._inDOM)
		setTimeout(() => {
			this.update(this._inDOM)
		}, 1000)
		return this
	}
	append() {
		for (let i in arguments) {
			if (!(arguments[i] instanceof Button) && !(arguments[i] instanceof Inline)) {
				return console.error("ActionBar can only contain objects of type Button or Inline")
			}
		}
		super.append.apply(this, arguments)
		this.update(this._inDOM)
		setTimeout(() => {
			this.update(this._inDOM)
		}, 1000)
		return this
	}
	update(resize = false) {
		// keep the overflow elements always at the end of the bar

		// let ts=1, first=true;
		if (this._overflow) {
			if (resize) {
				// this.btnOverflow.style.opacity=0
				if (this.childElementCount <= 2) return
				// first attach all the elements to the bar!
				while (this.pnlOverflow.childElementCount > 0) {
					super.append.apply(this, [this.pnlOverflow.firstElementChild])
				}
				// then get the current width of the bar and add elements until it's full
				let t = 0,
					w = this.offsetWidth - (48 + 8)
				let skip = false
				// then iterate until we need to overflow
				this.btnOverflow.setAttribute("tabindex", this.tabGroup)
				for (let i = 0; i < this.childElementCount; i++) {
					let child = this.children[i]
					if (child instanceof Button) {
						// add a tabindex to the element if it's a button
						child.setAttribute("tabindex", this.tabGroup)
					}

					if (child == this.btnOverflow || child == this.pnlOverflow) continue
					if (i == 2) {
						// if it's the FIRST child always show it
						t += child.offsetWidth
						continue
					}
					if (t + child.offsetWidth < w && !skip) {
						t += child.offsetWidth
					} else {
						i--
						skip = true
						this.pnlOverflow.append(child)
					}
				}
			}
			super.append.apply(this, [this.btnOverflow, this.pnlOverflow])
			// setTimeout(()=>{this.btnOverflow.style.opacity=1})
		} else {
		}

		// only show the overflow if it's relevant
		if (this.pnlOverflow.childElementCount > 0) {
			this.btnOverflow.show()
		} else {
			this.btnOverflow.hide()
		}
		return this
	}

	set overflow(v) {
		this._overflow = v ? true : false
		if (this._overflow) {
			this.setAttribute("overflow", true)
		} else {
			this.removeAttribute("overflow")
		}
	}

	set hook(v) {
		switch (v) {
			case "top":
				v = 0
				break
			case "bottom":
				v = -1
				break
			case "bottom-sticky":
				v = -2
			default:
				if (isNaN(v)) v = 0
				break
		}
		if (v >= 0) {
			this.addClass("top")
			this.style.top = v + "px"
			this.style.bottom = "auto"
		} else {
			this.addClass("bottom")
			if (v == -1) this.addClass("sticky")
			this.style.top = "auto"
			this.style.bottom = -(v + 1) + "px"
		}
		return this
	}
}

const buildPath = (f) => {
	if (!(f instanceof FileSystemFileHandle || f instanceof FileSystemDirectoryHandle)) {
		return ""
	}
	let n = f.name
	if (f.container) n = buildPath(f.container) + "/" + n
	return n
}

class TabBar extends Block {
	constructor(content) {
		super()
		this._tabs = []
		this.addEventListener("mousewheel", (e) => {
			if (!e.shiftKey) {
				e.preventDefault()
				this.scrollLeft += e.deltaY
			}
		}, {passive:false})
		// this.ondragleave = (e)=>{
		//     this.dropTarget = undefined
		// }
		this.ondragover = (e) => {
			e.preventDefault()
			e.dataTransfer.dropEffect = "all"

			let last = this._tabs[this._tabs.length - 1]
			if (last == this.movingItem) {
				if (this.length < 2) {
					return
				}
				last = this._tabs[this._tabs.length - 2]
			}

			if (e.layerX > last.offsetLeft + last.offsetWidth) {
				this._tabs.forEach((tab) => {
					tab.style.marginLeft = ""
				})
				this.dropTarget = last
				this.dropPostition = "after"
			}
			//  console.log(e)
		}
		this.ondrop = this.tabDrop
		this.on("contextmenu", (e) => {
			e.preventDefault() && e.stopPropagation()
		})
	}

	async tabDrop(e) {
		e.stopPropagation()
		e.preventDefault()
		const items = e.dataTransfer.items
		const delayed = []
		for (let i = 0, l = items.length; i < l; i++) {
			let item = items[i]
			if (item.kind === "file") {
				delayed.push(item.getAsFileSystemHandle())
			}
		}
		if (delayed.length > 0) {
			Promise.all(delayed).then((res) => {
				res.forEach(this.dropFileHandle)
			})
		} else if (this.movingItem instanceof HTMLElement) {
			if (this?.dropPosition == "before") {
				this.insertBefore(this.movingItem, this.dropTarget)
			} else {
				if (this?.dropTarget?.nextElementSibling) {
					this.insertBefore(this.movingItem, this.dropTarget.nextElementSibling)
				} else {
					this.appendChild(this.movingItem)
				}
			}

			// rebuilt the _tabs array with the new item order
			while (this._tabs.length > 0) {
				this._tabs.pop()
			}
			let tabs = this.children
			for (let i = 0, l = tabs.length; i < l; i++) {
				if (!(tabs[i] instanceof TabItem)) continue
				this._tabs.push(tabs[i])
			}
			this.movingItem.click()
		}
	}

	get tabs() {
		return this._tabs
	}

	set close(v) {
		if (!isFunction(v)) throw new Error("close must be a function")
		this._close = v
	}

	set click(v) {
		if (!isFunction(v)) throw new Error("click must be a function")
		this._click = v
	}

	get activeIndex() {
		for (let i = 0, l = this._tabs.length; i < l; i++) {
			if (this._tabs[i].getAttribute("active") !== null) {
				return i
			}
		}
	}

	get activeTab() {
		const active = this.querySelector("ui-tab-item[active]")
		return active
	}

	byTitle(title) {
		const tab = this.querySelector(`ui-tab-item[title="${title}"`)
		if (!tab) console.warn("No match found for", title)
		return tab
	}

	next() {
		let i = this.activeIndex
		i++
		if (i > this._tabs.length - 1) {
			i = 0
		}
		this._tabs[i].click()
	}

	prev() {
		let i = this.activeIndex
		i--
		if (i < 0) {
			i = this._tabs.length - 1
		}
		this._tabs[i].click()
	}

	add(config) {
		const tab = new TabItem(config.name)
		if (config.handle) tab.setAttribute("title", buildPath(config.handle))
		tab.config = config
		this._tabs.push(tab)
		this.append(tab)

		tab.onclick = (event) => {
			this._tabs.forEach((t) => {
				t.removeAttribute("active")
			})
			tab.setAttribute("active", "active")
			if ("function" == typeof this._click) {
				event.tab = tab
				this._click(event)
			}
		}

		tab.oncontextmenu = (event) => {
			event.preventDefault()
			event.stopPropagation()
		}

		tab.onpointerdown = (event) => {
    		if (event.which == 2) {
				event.stopPropagation()
				event.preventDefault()
			    return
			}
			tab.click()
		}

		tab.onpointerup = (event) => {
			if (event.which == 2) {
				event.stopPropagation()
				event.preventDefault()
				event.tab = tab
				if ("function" == typeof this._close) {
					event.tab = tab
					this._close(event)
				}
			}
		}

		tab.close.onclick = async (event) => {
			event.stopPropagation()
			event.tab = tab
			if ("function" == typeof this._close) {
				event.tab = tab
				this._close(event)
			}
		}
		return tab
	}

	remove(tab) {
		for (let i = 0, l = this._tabs.length; i < l; i++) {
			if (this._tabs[i] == tab) {
				this._tabs.splice(i, 1)
				if (tab.getAttribute("active") != null) {
					if (this._tabs[i]) {
						this._tabs[i].click()
					} else if (this._tabs[i + 1]) {
						this._tabs[i + 1].click()
					} else if (this._tabs[i - 1]) {
						this._tabs[i - 1].click()
					}
				}
				i--
			}
		}
		tab.remove()
	}
}

// file selection list, takes an array of file/folder handles and produces a directory tree
// lazily loads subfolders on request

class FileList extends ContentFill {
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

	_render(base, tree, depth=0, openPaths=null) {
		// trigger an index generation (if not already done)
		
		if(!openPaths) openPaths = this.openPaths()
		
		const fileTypes = {
		    "javascript": "js mjs jsm".split(" "),
		    "code": "c cpp h hpp".split(" "),
		    "html": "htm html dhtml".split(" "),
		    "css":"css".split(" "),
		    "php":"php".split(" "),
		    "picture_as_pdf":"pdf".split(" "),
		    "data_object": "json".split(" "),
		    "image": "svg jpg jpeg gif tiff png ico bmp webp webm".split(" "),
		    "movie": "avi mp4 webm wmv mov flv f4v mkv 3gp".split(" "),
		    "music_note": "mp3 acc wma ogg wav flac".split(" "),
		}
		
		const hideMask = "Zone.Identifier .swo .swp".split(" ");
		
		const codeFiles = "json js mjs c cpp h hpp css html".split(" ")
		const imageFiles = "svg jpg jpeg gif tiff png ico bmp webp webm".split(" ")
		const videoFiles = "avi mp4 webm wmv mov flv f4v mkv 3gp".split(" ")
		const audioFiles = "mp3 aac wma ogg wav flac".split(" ")


		this._contextElement = null
		if (base.empty) {
			base.empty()
		}
		
		tree.forEach((item) => {
		    
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
					e.addEventListener("click", async () => {
						if ("function" == typeof this._unlock) {
							e.setAttribute("loading", "true")
							if (await this._unlock(item)) {
								item.locked = false
								item.tree = await readAndOrderDirectory(item)
								item.open = true
								e.setAttribute("open-folder", "true")
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
				} else {
					if (item.tree && item.open) { 
						e.icon = "folder_open"
						e.setAttribute("open-folder", "true")
						this._render(e.holder, item.tree,depth+1, openPaths)
					} else if(openPaths.includes(itemPath)) {
						(async()=>{
							if (!item.tree) { e.setAttribute("loading", "true"); item.tree = await readAndOrderDirectory(item) }
							e.icon = "folder_open"
							e.setAttribute("open-folder", "true")
							this._render(e.holder, item.tree,depth+1, openPaths)
							if ("function" == typeof this.expand) { this.expand(e.item) }
							e.removeAttribute("loading")
							item.open = true
						})()
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

					e.addEventListener("click", async (event) => {
						item.open = !item.open
						if (item.open) {
							e.setAttribute("open-folder", "true")
							if (!item.tree) { e.setAttribute("loading", "true"); item.tree = await readAndOrderDirectory(item) }
							e.icon = "folder_open"
							this._render(e.holder, item.tree,depth+1)
							e.removeAttribute("loading")
							if ("function" == typeof this.expand) { this.expand(e.item) }

						} else {
							e.removeAttribute("open-folder")
							e.icon = "folder"
							e.showRefresh = false
							e.holder.empty()
						}
					})

					e.refresh.addEventListener("click", async (event) => {
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
					e.addEventListener("click", async (event) => {
						if ("function" == typeof this._open) {
							e.setAttribute("loading", "true")
							await this._open(item)
							e.removeAttribute("loading")
						} else {
							console.warn("FileList.open() handler hasn't been set")
						}
					})
				} else {
					e.addEventListener("click", async (event) => {
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

				e.icon = "insert_drive_file"
				if (triggerOpen) e.icon = "description"
				
				for(const key in fileTypes) {
				    const type = fileTypes[key]
				    if(type.indexOf(item.name.split(".").pop()) !== -1) e.icon = key
				}
				
				// if (codeFiles.indexOf(item.name.split(".").pop()) !== -1) e.icon = "code"
				if (imageFiles.indexOf(item.name.split(".").pop()) !== -1)
					e.icon = triggerOpen ? "image" : "image_not_supported"
				// if (videoFiles.indexOf(item.name.split(".").pop()) !== -1) e.icon = "movie"
				// if (audioFiles.indexOf(item.name.split(".").pop()) !== -1) e.icon = "music_note"

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

// Drag & Drop file uploader box
class FileUploadList extends ContentFill {
	constructor(content) {
		super(content)

		const inner = (this._inner = document.createElement("div"))
		inner.classList.add("inner")

		this._autoUpload = false
		this._uploadURL = null
		this._uploadFilter = (f) => {
			return true
		}

		const progress = document.createElement("div")
		progress.classList.add("progress")
		progress.innerHTML = "progress"
		inner.appendChild(progress)

		this._dragItemStart = function (e) {
			let file = this.getAttribute("download")
			e.dataTransfer.dropEffect = "copy"
			e.dataTransfer.effectAllowed = "all"
			e.dataTransfer.setData("DownloadURL", file)
			console.debug(file)
		}

		const uploadFile = (file) => {
			let url = this._uploadURL
			let formData = new FormData()

			formData.append("upload", file)
			formData.append("path", this._list.path)

			return new Promise((accept, reject) => {
				if (!this._uploadFilter(file)) {
					return reject("wrong file type")
				}
				fetch(url, {
					method: "POST",
					body: formData,
				})
					.then(async (response) => {
						if (response.status == 200) {
							accept(await response.text())
						} else {
							reject(await response.text())
						}
					})
					.catch((e) => {
						reject(e)
					})
			})
		}

		const dragenter = (e) => {
			e.stopPropagation()
			e.preventDefault()
		}
		const dragover = (e) => {
			e.stopPropagation()
			e.preventDefault()
			inner.classList.add("hover")
		}
		const dragleave = (e) => {
			e.stopPropagation()
			e.preventDefault()
			inner.classList.remove("hover")
		}
		const drop = (e) => {
			inner.classList.remove("hover")
			e.stopPropagation()
			e.preventDefault()
			const dt = e.dataTransfer
			const files = dt.files
			// handleFiles(files);

			if (this._autoUpload && this._uploadURL && files && files.length > 0) {
				// handle uploading to a server...
				// use 1 connection per file upload
				let count = files.length
				let complete = 0

				const updateProgress = (res) => {
					progress.style.width = `${(complete / (count - 1)) * 100}%`
					complete++
					console.debug(res)
					if (complete == count) {
						setTimeout(() => {
							progress.style.opacity = "0"
							setTimeout(() => {
								progress.style.width = "0px"
								progress.style.height = "0px"
							}, 333)
						}, 250)
						if ("function" == typeof this._onuploaded) {
							this._onuploaded(files)
						}
					}
				}

				progress.style.opacity = "1"
				progress.style.width = "8px"
				progress.style.height = "8px"
				;[...files].forEach((file) => {
					uploadFile(file).then(updateProgress).catch(console.warn)
				})
			} else {
				if (files && files.length > 0) {
					if ("function" == typeof this._onupload) {
						this._onupload(files)
					} else {
						console.debug("Upload request ", files)
					}
				}
			}
		}

		inner.addEventListener("dragleave", dragleave, false)
		inner.addEventListener("dragenter", dragenter, false)
		inner.addEventListener("dragover", dragover, false)
		inner.addEventListener("drop", drop, false)

		this._tiles = []
		this._renderList = () => {
			let list = this._list
			list.files.forEach((item) => {
				let base = document.createElement("a")
				let filename = item.split("/").pop()
				let ext = filename.split(".").pop().toLowerCase()
				let type = "text/plain"
				switch (ext) {
					case "jpg":
					case "jpeg":
						type = "image/jpg"
						break
					case "png":
						type = "image/png"
						break
					case "model":
					case "zip":
						type = "application/zip"
						break
					default:
						type = "text/plain"
						break
				}
				let downloadURL = `${type}:${filename}:${window.location.origin}${list.path}${item}`

				base.src = `${window.location.origin}${list.path}${item}`
				base.setAttribute("href", `${window.location.origin}${list.path}${item}`)
				base.innerHTML = `<label>${filename}</label>`
				base.setAttribute("title", filename)
				base.setAttribute("draggable", true)
				base.setAttribute("download", downloadURL)

				if (list.thumbpath) {
					base.style.backgroundImage = `url(${list.thumbpath}${item})`
				} else {
					base.style.backgroundImage = `url(${list.path}${item})`
				}
				base.ondragstart = this._dragItemStart
				inner.append(base)
			})
		}

		return this
	}

	connectedCallback() {
		this.append(this._inner)
	}

	on(e, f, o) {
		if (e == "upload" && "function" == typeof f) {
			this._onupload = f
		} else {
			super.on.apply(this, [e, f, o])
		}
	}

	set uploadURL(v) {
		this._uploadURL = v
	}
	set autoUpload(v) {
		this._autoUpload = v ? true : false
	}
	set uploadFilter(f) {
		if ("function" == typeof f) {
			this._uploadFilter = f
		}
	}
	set onuploaded(f) {
		if ("function" == typeof f) {
			this._onuploaded = f
		}
	}
	set onupload(f) {
		if ("function" == typeof f) {
			this._onupload = f
		}
	}

	get list() {
		return this._list
	}
	set list(v) {
		if (v && v.path && v.files && Array.isArray(v.files)) {
			this._list = v
			// generate child elements base on v.files
			this._renderList()
		}
	}

	set ondrop(f) {
		if (!isFunction(f)) throw new Error("ondrop must be a function")
		this._ondrop = f
	}
}

const getWindowY = (e) => {
	let y = e.offsetTop
	return e.parentNode instanceof HTMLElement ? y + getWindowY(e.parentNode) : y
}
const getWindowX = (e) => {
	let x = e.offsetLeft
	return e.parentNode instanceof HTMLElement ? x + getWindowX(e.parentNode) : x
}

const getPosition = (el) => {
	let x = getWindowX(el)
	let y = getWindowY(el)
	return {
		x: x,
		y: y,
		w: el.offsetWidth,
		h: el.offsetHeight,
	}
}

let MenuOpen = false
let CurrentMenu = null
class Menu extends Panel {
	constructor(content) {
		super(content)
		this.on("contextmenu", (e) => {
			e.preventDefault()
		})
	}

	connectedCallback() {
		super.connectedCallback.apply(this)
		const origin = this.getAttribute("showAt")
		if (origin) {
			const el = document.querySelector(origin)
			this.showAt(el)
		}
		const attach = this.getAttribute("attachTo")
		// 		console.log("attach to", attach)
		if (attach) {
			const el = document.querySelector(attach)
			//  console.log("attached to", attach, el)
			if (el) {
				el.addEventListener("click", () => {
					if (MenuOpen && CurrentMenu == this) return
					setTimeout(() => {
						MenuOpen = false
						this.showAt(el)
					})
				})
			}
			if (el) {
				el.addEventListener("pointerover", () => {
					if (MenuOpen && CurrentMenu == this) return
					if (MenuOpen) {
						el.focus()
						el.click()
					}
				})
			}
		}

		const click = this.getAttribute("onclick")
		if (click) {
			this._click = eval(click)
		}
	}

	set click(v) {
		if (!isFunction(v)) throw new Error("click must be a function")
		this._click = v
	}

	click(command) {
		if ("function" == typeof this._click) {
			this._click(command)
		}
	}

	showAt(origin) {
		// const self = this
		let p

		// clear styling for left/up combos
		this.removeAttribute("left")
		this.removeAttribute("up")

		if (origin instanceof PointerEvent) {
			p = {
				x: origin.clientX + 2,
				y: origin.clientY + 2,
				w: 0,
				h: 0,
			}
			this.style.left = `${p.x}px`
			this.style.top = `${p.y + p.h}px`
			this.style.bottom = ""
			// this.style.maxHeight = `calc(100vh - ${p.y + p.h + 8}px)`
		} else if (origin instanceof HTMLElement) {
			p = getPosition(origin)
			this.style.left = `${p.x}px`
			this.style.top = `${p.y + p.h}px`
			this.style.bottom = ""
		} else {
			throw new Error("showAt requires an HTMLElement in the current DOM or a PointerEvent")
		}

		setTimeout(() => {
			if (p.x + this.offsetWidth > window.innerWidth) {
				this.setAttribute("left", "")
				this.style.left = p.x + p.w - this.offsetWidth
			}
			if (p.y + p.h + this.offsetHeight > window.innerHeight) {
				if (p.y + p.h > window.innerHeight / 2) {
					// displat ABOVE the orgin
					this.setAttribute("up", "")
					this.style.top = "auto" //p.y - (this.offsetHeight-32)
					this.style.bottom = `${window.innerHeight - p.y}px`
					this.style.maxHeight = `calc(100vh - ${window.innerHeight - p.y + 16}px)`
				} else {
					this.style.maxHeight = `calc(100vh - ${p.y + p.h + 16}px)`
				}
			} else {
				this.style.maxHeight = `calc(100vh - ${p.y + p.h + 16}px)`
			}
		})

		const event = new CustomEvent("show")
		this.dispatchEvent(event)
		// console.log(event)

		setTimeout(() => {
			if (CurrentMenu === this) {
				CurrentMenu.removeAttribute("active")
				CurrentMenu = null
				return
			}

			let clicked = false
			MenuOpen = true
			CurrentMenu = this
			this.addEventListener(
				"click",
				() => {
					clicked = true
					MenuOpen = false
					CurrentMenu = null
					setTimeout(() => {
						this.removeAttribute("active")
					}, 333)
				},
				{ once: true }
			)
			document.addEventListener(
				"click",
				() => {
					if (!clicked && MenuOpen) {
						setTimeout(() => {
							this.removeAttribute("active")
							MenuOpen = false
							CurrentMenu = null
						})
					}
				},
				{ once: true }
			)
			document.addEventListener(
				"contextmenu",
				() => {
					if (CurrentMenu == this) {
						CurrentMenu.removeAttribute("active")
						return
					}
					if (!clicked && MenuOpen) {
						setTimeout(() => {
							this.removeAttribute("active")
							MenuOpen = false
							CurrentMenu = null
						})
					}
				},
				{ once: true }
			)
		})
		this.setAttribute("active", "true")
	}
}

class MenuItem extends Button {
	constructor(content) {
		super(content)
		this._icon = new Icon()
		this._tag = new Inline()
		this.addEventListener("click", () => {
			// find first Menu ancestor, max 5 levels to allow for some nesting and dynamism in the menu object
			let parent = this.parentElement, steps = 0;
			while(parent.tagName != "UI-MENU" && steps<4) { parent = parent.parentElement; steps++ }
			if(parent.tagName != "UI-MENU") return
			
			if (this.getAttribute("command")) {
				parent.click(this.getAttribute("command"))
			} else {
				parent.click(this)
			}
		})
	}

	connectedCallback() {
		super.connectedCallback.apply(this)

		this._icon.innerHTML = this.getAttribute("icon")
		this._tag.innerHTML = this.getAttribute("keyTag")
		this._tag.hook = "right"

		this.prepend(this._icon)
		this.append(this._tag)
	}
}

// custom element MUST be registered, or the browser will throw an exception on constructor()
customElements.define("ui-element", Element)
customElements.define("ui-inline", Inline)
customElements.define("ui-block", Block)
customElements.define("ui-view", View)
customElements.define("ui-content-fill", ContentFill)
customElements.define("ui-actionbar", ActionBar)
customElements.define("ui-tabbar", TabBar)
customElements.define("ui-menu", Menu)
customElements.define("ui-menu-item", MenuItem)
customElements.define("ui-button", Button)
customElements.define("ui-button-counter", CounterButton)
customElements.define("ui-file-list", FileList)
customElements.define("ui-file-item", FileItem)
customElements.define("ui-tab-item", TabItem)
customElements.define("ui-file-upload-list", FileUploadList)

customElements.define("ui-panel", Panel)
customElements.define("ui-inner", Inner)
customElements.define("ui-blank", Blank)
customElements.define("ui-icon", Icon)
customElements.define("ui-input", Input)
customElements.define("effect-base", Effects)
customElements.define("effect-effect", Effect)
customElements.define("effect-ripple", Ripple)

const ui = {
	readAndOrderDirectory: readAndOrderDirectory,
	Element: Element,
	Inline: Inline,
	Icon: Icon,
	Input: Input,
	Block: Block,
	View: View,
	ContentFill: ContentFill,

	TabBar: TabBar,
	TabItem: TabItem,

	ActionBar: ActionBar,

	Button: Button,
	CounterButton: CounterButton,
	Panel: Panel,

	Menu: Menu,
	MenuItem: MenuItem,

	FileList: FileList,
	FileListItem: FileItem,

	FileUploadList: FileUploadList,
}
window.__ui = ui
// export { ui, Element, Inline, Block, View, ContentFill, ActionBar, Button, Panel, FileList }
// export default ui;
