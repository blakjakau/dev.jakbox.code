import { isset } from './utils.mjs';

export class Element extends HTMLElement {
	constructor(content) {
		super()
		this._initialContent = content;
		// It's generally safer to set innerHTML in connectedCallback or after the element is appended to the DOM
		// However, given the existing structure, we'll keep it here for now, but be aware of potential future issues.
		// If this continues to cause problems, we might need to defer setting innerHTML.
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
		if (isset(this._initialContent)) this.innerHTML = this._initialContent
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

export class Inline extends Element {
	constructor(content) {
		super(content)
		this._displayType = "inline"
	}
}

export class Block extends Element {
	constructor(content) {
		super(content)
		this._displayType = "block"
	}
}

export class View extends Block {
	constructor(content) {
		super(content)
	}
}

export class ContentFill extends Block {
	constructor(content) {
		super(content)
	}
}

customElements.define("ui-element", Element);
customElements.define("ui-inline", Inline);
customElements.define("ui-block", Block);
customElements.define("ui-view", View);
customElements.define("ui-content-fill", ContentFill);