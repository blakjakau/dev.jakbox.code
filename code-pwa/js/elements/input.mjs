import { Element } from './element.mjs';

let inputCount = 0
export class Input extends Element {
	// input handler with base input element and built in validation hooks
	constructor(content) {
		super()
		this._id = "ui_input_" + inputCount++
		const input = (this._input = document.createElement("input"))
		const label = (this._label = document.createElement("label"))
		this.id = this._id
	}
	connectedCallback() {
		super.connectedCallback()
		super.append.apply(this, [this._label, this._input])
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
	set type(v) {
		this._input.setAttribute("type", v)
	}
	focus() {
		this._input.focus()
	}
}

customElements.define("ui-input", Input);