import { Button } from './button.mjs';
import { Block } from './element.mjs';
import { Icon } from './icon.mjs';
import { isset } from './utils.mjs';

export class FileItem extends Button {
	constructor(content) {
		super()
		if (isset(content)) this.innerHTML = content
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

customElements.define("ui-file-item", FileItem);