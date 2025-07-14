import { Element } from './element.mjs';
import { Icon } from './icon.mjs';

export class IconTab extends Element {
	constructor(icon) {
		super();
		this.classList.add('icon-tab');
		this._iconId = icon; // Store the icon ID
		this._icon = new Icon(icon);
		this.append(this._icon);
		console.log("IconTab created with iconId:", this._iconId); // ADD THIS LINE
	}

	get iconId() {
		return this._iconId;
	}

	get active() {
		return this.hasAttribute('active');
	}

	set active(value) {
		if (value) {
			this.setAttribute('active', '');
		} else {
			this.removeAttribute('active');
		}
	}
}

customElements.define('ui-icon-tab', IconTab);