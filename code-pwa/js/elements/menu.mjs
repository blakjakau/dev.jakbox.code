import { Panel } from './panel.mjs';
import { isFunction } from './utils.mjs';

let MenuOpen = false
let CurrentMenu = null
export class Menu extends Panel {
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
		if (attach) {
			const el = document.querySelector(attach)
			if (el) {
				el.on("click", () => {
					if (MenuOpen && CurrentMenu == this) return
					setTimeout(() => {
						MenuOpen = false
						this.showAt(el)
					})
				})
			}
			if (el) {
				el.on("pointerover", () => {
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

		setTimeout(() => {
			if (CurrentMenu === this) {
				CurrentMenu.removeAttribute("active")
				CurrentMenu = null
				return
			}

			let clicked = false
			MenuOpen = true
			CurrentMenu = this
			this.on("click",
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
			document.on("click",
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
			document.on("contextmenu",
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

customElements.define("ui-menu", Menu);