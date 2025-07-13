import { Block } from './element.mjs';
import { Button } from './button.mjs';
import { Panel } from './panel.mjs';
import { Icon } from './icon.mjs';
import { Inline } from './element.mjs';

let tabIndexGroup = 1
export class ActionBar extends Block {
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

export const actionBars = []
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

customElements.define("ui-actionbar", ActionBar);