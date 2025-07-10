export class Effects extends HTMLElement {
	constructor() {
		super()
	}
}

export class Effect extends HTMLElement {
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

customElements.define("effect-base", Effects);
customElements.define("effect-effect", Effect);