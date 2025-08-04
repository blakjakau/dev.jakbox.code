// File: tabitem.mjs
import { Button } from './button.mjs';
import { Icon } from './icon.mjs';
import { Inline } from './element.mjs';
import { isset } from './utils.mjs';

export class TabItem extends Button {
	constructor(content) {
		super();
		
		this._statusIcon = new Icon();
		this._defaultStatusIcon = 'draft'; // Private property to hold the default icon
		this._statusIcon.innerHTML = this._defaultStatusIcon; // Initialize with the default 'draft' icon
		this._statusIcon.classList.add('status-icon');

		this._text = new Inline();
		this._name = '';
		if (isset(content)) {
			this._text.textContent = content;
			this._name = content;
		}

		this._close = new Icon()
		this._close.innerHTML = "close"
		this._close.setAttribute("close", "close")
		this.setAttribute("draggable", true);
		this.ondragstart = (e) => {
			this.originalParent = this.parentElement;
			this.dropPosition = "";
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", this.getAttribute("id"));
			e.dataTransfer.setData("application/x-tab-item", this.getAttribute("id"));

			if (this.parentElement.exclusiveDropType != null) {
				e.dataTransfer.setData("application/x-exclusive-drop-type", this.parentElement.exclusiveDropType);
			}

			this.parentElement.animating = true
			this.parentElement.setAttribute("dragging", "true")
			this.parentElement.movingItem = this
			this.parentElement.movingWidth = this.offsetWidth + 2
			this.parentElement.dropTarget = null
			this.parentElement.dropPosition = null
			setTimeout(() => {
				this.style.display = "none"
				if (this.nextElementSibling && this.nextElementSibling instanceof TabItem) {
					this.nextElementSibling.style.transition = "none"
					this.nextElementSibling.style.marginLeft = this.parentElement.movingWidth + "px"
					setTimeout(() => {
						this.nextElementSibling.style.transition = ""
					}, 150)
				}
				setTimeout(() => {
					if(this.parentElement) this.parentElement.animating = false
				}, 150)
			})
		}
		this.ondragend = (e) => {
			const newParent = this.parentElement;
			if(newParent) {
				newParent.removeAttribute("dragging")
				newParent.movingItem = undefined
				// Disable transitions for instant reset
				for (const tab of newParent.children) {
					if (tab instanceof TabItem) {
						tab.style.transition = "none";
					}
				}
				if(newParent.resetMargins) newParent.resetMargins();
				// Re-enable transitions after a short delay
				setTimeout(() => {
					for (const tab of newParent.children) {
						if (tab instanceof TabItem) {
							tab.style.transition = ""; // Revert to CSS defined transition
						}
					}
				}, 0);
				// Remove drop highlight from all tabs in the new parent
				for (const tab of newParent.children) {
					if (tab instanceof TabItem) {
						tab.classList.remove("drop-highlight");
					}
				}
			}
			
			if(this.originalParent && this.originalParent !== newParent && this.originalParent.resetMargins) {
				// Disable transitions for instant reset
				for (const tab of this.originalParent.children) {
					if (tab instanceof TabItem) {
						tab.style.transition = "none";
					}
				}
				this.originalParent.resetMargins();
				// Re-enable transitions after a short delay
				setTimeout(() => {
					if(!this?.originalParent?.children) return
					for (const tab of this.originalParent?.children) {
						if (tab instanceof TabItem) {
							tab.style.transition = ""; // Revert to CSS defined transition
						}
					}
				}, 0);
				// Remove drop highlight from all tabs in the original parent
				for (const tab of this.originalParent?.children) {
					if (tab instanceof TabItem) {
						tab.classList.remove("drop-highlight");
					}
				}
			}
			
			this.style.display = ""
			this.originalParent = null;
		}

		this.ondragover = (e) => {
			e.stopPropagation();
			e.preventDefault();

			const parent = this.parentElement;
			if (!parent) return;

			const moving = parent.movingItem;
			if (moving === this) return;

			e.dataTransfer.dropEffect = "move";

			const parentRect = parent.getBoundingClientRect();
			const cursorXInParent = e.clientX - parentRect.left;
			const midpoint = this.offsetLeft + (this.offsetWidth / 2);

			parent.dropTarget = this;

			// Remove drop highlight from all siblings and reset margins
			for (const tab of parent.children) {
				if (tab instanceof TabItem) {
					tab.classList.remove("drop-highlight");
					tab.style.marginLeft = "";
					tab.style.marginRight = "";
				}
			}

			this.classList.add("drop-highlight");

			if (cursorXInParent < midpoint) {
				parent.dropPosition = "before";
				this.style.marginLeft = parent.movingWidth + "px";
			} else {
				parent.dropPosition = "after";
				this.style.marginRight = parent.movingWidth + "px";
			}
		}
		this.ondragenter = this.ondragover
		this.ondrop = (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.parentElement && typeof this.parentElement.tabDrop === 'function') {
				this.parentElement.tabDrop(e);
			}
		}

		return this
	}

	connectedCallback() {
		super.connectedCallback.apply(this)
		this.append(this._statusIcon, this._text, this._close);
		this._effect.remove(); // Removes the ripple effect element, not the button itself.
	}

	/**
	 * Sets the default icon for the status indicator when the tab is not 'changed'.
	 * @param {string} iconName The name of the Material Symbols icon (e.g., 'description', 'javascript', etc.).
	 */
	set defaultStatusIcon(iconName) {
		if (this._defaultStatusIcon === iconName) return; // No change needed
		this._defaultStatusIcon = iconName;
		this.setAttribute('data-status-icon-type', iconName);
		// Only update the displayed icon if the tab is currently not in a 'changed' state
		if (!this._changed) {
			this._statusIcon.innerHTML = iconName;
		}
	}

	set name(newName) {
		if (this._name === newName) {
			return; // No change needed
		}
		this._name = newName;
		this._text.textContent = newName;

		if (this.config) {
			this.config.name = newName;
		}
	}

    /**
     * Gets the displayed name of the tab.
     * @returns {string} The current name of the tab.
     */
    get name() {
        return this._name;
    }

	get textElement() {
		return this._text;
	}

	set changed(v) {
		this._changed = !!v;
		// Status icon: 'draft' for clean, 'circle' for dirty (unsaved changes)
		if (this._changed) {
			this._statusIcon.innerHTML = 'do_not_disturb_on_total_silence';
			this.setAttribute('is-changed', '');
		} else { // If not changed, use the set defaultStatusIcon
			this._statusIcon.innerHTML = this._defaultStatusIcon;
			this.removeAttribute('is-changed');
		}

		// Close icon: 'sync' for externally modified, 'close' otherwise
		if (this.config && this.config.fileModified) {
			this._close.innerHTML = "sync"; // Or "warning", "refresh", etc.
			this._close.style.color = "orange"; // Optional: add a color hint
		} else {
			this._close.innerHTML = "close";
			this._close.style.color = ""; // Reset color
		}
	}

	get changed() {
		return this._changed
	}

	get close() {
		return this._close
	}
}

customElements.define("ui-tab-item", TabItem);
