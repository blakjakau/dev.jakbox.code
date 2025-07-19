import { Block } from './element.mjs';
import { Blank } from './blank.mjs';
import { isset } from './utils.mjs';

export class Panel extends Block {
	#minSize = 50
	#maxSize = 500
	constructor(content) {
		super()
		if (isset(content)) this.innerHTML = content
		
		this.blanker = new Blank()
		this.resizeListeners = []
		this.resizeEndListeners= []
		this.resize = false
		this.borderHandleSize = 8
		this.borderHandleVisual = 4
		this.activeBorder = `${this.borderHandleVisual}px solid var(--theme)`;
		this.inactiveBorder = `${this.borderHandleVisual}px solid var(--dark)`;
		this.active;
		
		this.on("pointerleave", (e)=>{
			if(this.active) return
			if(this.resize=="left") {
				this.style.borderLeft = this.inactiveBorder
			} else if (this.resize=="right") {
				this.style.borderRight = this.inactiveBorder
			} else if (this.resize=="top") {
				this.style.borderTop = this.inactiveBorder
			} else if (this.resize=="bottom") {
				this.style.borderBottom = this.inactiveBorder
			}
		})
		
		this.on("pointermove", (e)=>{
			if(!this.resize) { 
				document.body.style.cursor = ""
				return 
			}
			
			if(this.hotSpot(e)) {
				if(this.resize=="left") {
					this.style.borderLeft = this.activeBorder
					document.body.style.cursor = "ew-resize"
				} else if (this.resize=="right") {
					this.style.borderRight = this.activeBorder
					document.body.style.cursor = "ew-resize"
				} else if (this.resize=="top") {
					this.style.borderTop = this.activeBorder
					document.body.style.cursor = "ns-resize"
				} else if (this.resize=="bottom") {
					this.style.borderBottom = this.activeBorder
					document.body.style.cursor = "ns-resize"
				}
			} else {
				if(this.active) return
				if(this.resize=="left") {
					this.style.borderLeft = this.inactiveBorder
				} else if (this.resize=="right") {
					this.style.borderRight = this.inactiveBorder
				} else if (this.resize=="top") {
					this.style.borderTop = this.inactiveBorder
				} else if (this.resize=="bottom") {
					this.style.borderBottom = this.inactiveBorder
				}
				document.body.style.cursor = ""
			}
		})
		
		this.on("pointerdown", (e)=>{
			if(!this.hotSpot(e) || !this.resize) {
				document.body.style.cursor = ""
				return
			}
			this.style.transition = "none"
			this.style.webkitUserSelect = "none"
			this.active = true
			
			const move = (e)=>{
				if(this.resize == "left" || this.resize == "right") { // horizontal
					let nw;
					if (this.resize === "left") {
						nw = (this.offsetWidth - e.movementX - this.borderHandleVisual)
					} else {
						nw = (this.offsetWidth + e.movementX - this.borderHandleVisual)
					}
					this.style.width = Math.max(this.#minSize, Math.min(this.#maxSize, nw))+"px"
					this.resizeListeners.forEach(f=>{
						f(this.offsetWidth)
					})
				} else { // vertical
					let nh;
					if (this.resize === "top") {
						nh = (this.offsetHeight - e.movementY - this.borderHandleVisual)
					} else {
						nh = (this.offsetHeight + e.movementY - this.borderHandleVisual)
					}
					this.style.height = Math.max(this.#minSize, Math.min(this.#maxSize, nh))+"px"
					this.resizeListeners.forEach(f=>{
						f(this.offsetHeight)
					})
				}
			}
			const release = (e) =>{
				document.removeEventListener("pointermove", move)
				document.removeEventListener("pointerup", release)
				document.body.style.cursor = ""
				this.style.transition = ""
				this.style.webkitUserSelect = ""
				this.active = false
				if(this.resize == "left" || this.resize == "right") {
					this.resizeEndListeners.forEach(f=>{ f(this.offsetWidth) })
				} else {
					this.resizeEndListeners.forEach(f=>{ f(this.offsetHeight) })
				}
			}
			
			if(this.resize == "left" || this.resize == "right") {
				document.body.style.cursor = "ew-resize"
			} else {
				document.body.style.cursor = "ns-resize"
			}
			
			document.addEventListener("pointermove", move)
			document.addEventListener("pointerup", release)
		})

	}
	resizeListener(f) {
		if("function" == typeof f) {
			if(!this.resizeListeners.includes(f)) this.resizeListeners.push(f)
		}
	}

	resizeEndListener(f) {
		if("function" == typeof f) {
			if(!this.resizeEndListeners.includes(f)) this.resizeEndListeners.push(f)
		}
	}
	
	hotSpot(e) {
		if(e.target !== this) return false
		if(this.resize == "left" && e?.layerX < this.borderHandleSize) { return true }
		if(this.resize == "right" && e?.layerX > this.offsetWidth - this.borderHandleSize) { return true }
		if(this.resize == "top" && e?.layerY < this.borderHandleSize) { return true }
		if(this.resize == "bottom" && e?.layerY > this.offsetHeight - this.borderHandleSize) { return true }
		return false
	}
	
	set maxSize(v) {
		if(isNaN(v)) return
		if(v > this.#minSize) this.#maxSize = v
	}
	
	set minSize(v) {
		if(isNaN(v) || v<0) return
		if(v < this.#maxSize) this.#minSize = v
	}
	
	set resizable(state) {
		switch(state) {
			case 0: case false: case "none": this.resize = false; break;
			case 1: case "left": this.resize = "left"; this.style.borderLeft = this.inactiveBorder; break;
			case 2: case "right": this.resize = "right"; this.style.borderRight = this.inactiveBorder; break;
			case 3: case "top": this.resize = "top"; this.style.borderTop = this.inactiveBorder; break;
			case 4: case "bottom": this.resize = "bottom"; this.style.borderBottom = this.inactiveBorder; break;
			default: this.resize = state; break;
		}
	}
	get resizable() {
		return this.resize
	}
	
	set width(value) {
		this.style.width = `${value}px`;
		this.resizeListeners.forEach(f => f(value));
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

customElements.define("ui-panel", Panel);