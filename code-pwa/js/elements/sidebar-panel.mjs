import { Block } from './element.mjs';

export class SidebarPanel extends Block {
	constructor() {
		super();
		this.classList.add('sidebar-panel');
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

customElements.define('ui-sidebar-panel', SidebarPanel);