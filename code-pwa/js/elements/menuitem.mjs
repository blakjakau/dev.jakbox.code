import { Button } from './button.mjs';
import { Inline } from './element.mjs';
import { Icon } from './icon.mjs';

export class MenuItem extends Button {
	constructor(content) {
		super(content)
		this._icon = new Icon()
		this._tag = new Inline()
		this.addEventListener("click", () => {
			// find first Menu ancestor, max 5 levels to allow for some nesting and dynamism in the menu object
			let parent = this.parentElement, steps = 0;
			while(parent.tagName != "UI-MENU" && steps<4) { parent = parent.parentElement; steps++ }
			if(parent.tagName != "UI-MENU") return
			
			if (this.getAttribute("command")) {
				parent.click(this.getAttribute("command"))
			} else {
				parent.click(this)
			}
		})
	}

	connectedCallback() {
		super.connectedCallback.apply(this)

		this._icon.innerHTML = this.getAttribute("icon")
		this._tag.innerHTML = this.getAttribute("keyTag")
		this._tag.hook = "right"

		this.prepend(this._icon)
		this.append(this._tag)
	}
}

customElements.define("ui-menu-item", MenuItem);