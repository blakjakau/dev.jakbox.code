import { Element, Inline } from './element.mjs';
import { Effects } from './effect.mjs';
import { Ripple } from './ripple.mjs';
import { Icon } from './icon.mjs';

export class Button extends Element {
	constructor(content) {
		super()
		// like a regular button, but automatically maintains an internal icon/text sub-elements
		
		this._initialContent = content
		this._icon = new Icon()
		this._text = new Inline()

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

		if (this._initialContent) {
			this._text.innerHTML = this._initialContent
			this.innerHTML = ""
		}

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

customElements.define("ui-button", Button);