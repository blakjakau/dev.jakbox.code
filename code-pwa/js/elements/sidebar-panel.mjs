import { Panel } from './panel.mjs';

export class SidebarPanel extends Panel {
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