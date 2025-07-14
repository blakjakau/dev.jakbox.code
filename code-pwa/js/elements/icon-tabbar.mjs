import { Block } from './element.mjs';

export class IconTabBar extends Block {
	constructor() {
		super();
		this.classList.add('icon-tabbar');
		this._tabs = [];
		this.on('click', this._onClick.bind(this));
	}

	addTab(tab) {
		this._tabs.push(tab);
		this.append(tab);
	}

	_onClick(event) {
		const tab = event.target.closest('ui-icon-tab');
		if (tab) {
			this.activeTab = tab
		}
	}
	
	get activeTab() {
		return this._tabs.filter(t=>t.active)?.pop()
	}

	set activeTab(tab) {
		this._tabs.forEach(t => t.active = false);
		tab.active = true;
		this.dispatch('tabs-updated', { tab });
	}

	set activeTabById(id) {
		const tabToActivate = this._tabs.find(tab => tab.iconId === id);
		if (tabToActivate) {
			this.activeTab = tabToActivate;
		}
	}
}

customElements.define('ui-icon-tabbar', IconTabBar);