import { Button } from './button.mjs';
import { Element } from './element.mjs';

export class CounterButton extends Button {
	constructor(content) {
		super()
		if (isset(content)) this.innerHTML = content
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

customElements.define("ui-button-counter", CounterButton);