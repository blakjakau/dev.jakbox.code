// File: tabitem.mjs
import { Button } from './button.mjs';
import { Icon } from './icon.mjs';
// import { TabBar } from './tabbar.mjs'; // TabBar is not directly used in TabItem, can be removed if not imported elsewhere
import { isset } from './utils.mjs';

export class TabItem extends Button {
	constructor(content) {
		super()
        // Initialize _name. The setter will handle initial content and subsequent updates.
        this._name = ''; 
        if (isset(content)) {
            // Use the setter if content is provided to ensure innerHTML update
            this.name = content; 
        }

		this._close = new Icon()
		this._close.innerHTML = "close"
		this._close.style.visibility = "visible"
		this._close.setAttribute("close", "close")
		this._close.setAttribute("size", "tiny")
		this.setAttribute("draggable", true)

		this.ondragstart = (e) => {
			this.originalParent = this.parentElement;
			this.dropPosition = ""
			e.dataTransfer.effectAllowed = "move"
			e.dataTransfer.setData("text/plain", this.getAttribute("id"))
			e.dataTransfer.setData("application/x-tab-item", this.getAttribute("id"))
			
			if(this.parentElement.exclusiveDropType != null) {
				e.dataTransfer.setData("application/x-exclusive-drop-type", this.parentElement.exclusiveDropType)
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
		this._effect.remove()
		this.append(this._close) // Ensure _close is appended after initial innerHTML set by 'name' setter
	}

    /**
     * Sets the displayed name of the tab and updates its internal state.
     * @param {string} newName The new name for the tab.
     */
    set name(newName) {
        if (this._name === newName) {
            return; // No change needed
        }
        this._name = newName;
        // Safely update innerHTML by detaching and re-appending the close button.
        // const closeButtonReference = this._close;
        // if (closeButtonReference.parentElement === this) {
        //     closeButtonReference.remove(); // Temporarily remove the close button
        // }
        this.innerHTML = newName; // Update the text content of the tab
        this.append(this._close); // Re-append the close button

        // Also update the config.name to keep consistency with the tab's configuration
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

	set changed(v) {
		this._changed = !!v;
		// Update the icon based on both internal 'changed' and external 'fileModified'
		if (this.config && this.config.fileModified) {
			this._close.innerHTML = "sync"; // Or "warning", "refresh", etc.
			this._close.style.color = "orange"; // Optional: add a color hint
		} else if (this._changed) {
			this._close.innerHTML = "circle";
			this._close.style.color = ""; // Reset color
		} else {
			this._close.innerHTML = "close";
			this._close.style.color = ""; // Reset color
		}
	}

	get changed() {
		return this._changed
	}

	set showClose(v) {
		if (!!v) {
			this._close.style.visibility = "visible"
		} else {
			this._close.style.visibility = "hidden"
		}
	}

	get close() {
		return this._close
	}
}

customElements.define("ui-tab-item", TabItem);
