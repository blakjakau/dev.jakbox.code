import { Block } from './element.mjs';
import { TabItem } from './tabitem.mjs';
import { isFunction, buildPath } from './utils.mjs';

let tabCounter = 0;

export class TabBar extends Block {
	constructor(content) {
		super()
		this._tabs = []
		this.onEmpty = null;
		this.splitViewDragEnabled = false;
		this.on("mousewheel", (e) => {
			if (!e.shiftKey) {
				e.preventDefault()
				this.scrollLeft += e.deltaY
			}
		}, {passive:false})
		
		this.ondragover = (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";

			// Reset dropPosition and remove split view indicator at the beginning of every dragover event
			this.dropPosition = null;
			this.classList.remove('show-split-view-indicator');

			// If split view is active, disable the split view drag functionality
			if (document.body.classList.contains('showSplitView')) {
				return;
			}

			const rect = this.getBoundingClientRect();
			const x = e.clientX - rect.left;

			if (this.splitViewDragEnabled && x > (rect.width - 100)) {
				this.classList.add('show-split-view-indicator');
				this.dropTarget = null;
				this.dropPosition = 'split';
				return;
			}

			// If not in split view drag area, proceed with normal tab reordering logic
			let targetTab = null;
			if (e.target instanceof TabItem) {
				targetTab = e.target;
			} else if (e.target.parentElement instanceof TabItem) {
				targetTab = e.target.parentElement;
			} else {
				let closestTab = null;
				let minDistance = Infinity;
				for (const tab of this._tabs) {
					if (tab === this.movingItem) continue;
					const rect = tab.getBoundingClientRect();
					const mid = rect.left + rect.width / 2;
					const distance = Math.abs(e.clientX - mid);
					if (distance < minDistance) {
						minDistance = distance;
						closestTab = tab;
					}
				}
				targetTab = closestTab;
			}
		
			if (targetTab) {
				const parent = targetTab.parentElement;
				if (!parent) return;

				const moving = parent.movingItem;
				if (moving === targetTab) return;

				const parentRect = parent.getBoundingClientRect();
				const cursorXInParent = e.clientX - parentRect.left;
				const midpoint = targetTab.offsetLeft + (targetTab.offsetWidth / 2);

				parent.dropTarget = targetTab;

				// Remove drop indicator from all siblings
				for (const tab of parent.children) {
					if (tab instanceof TabItem) {
						tab.classList.remove("drop-indicator-before", "drop-indicator-after");
					}
				}

				if (cursorXInParent < midpoint) {
					parent.dropPosition = "before";
					targetTab.classList.add("drop-indicator-before");
				} else {
					parent.dropPosition = "after";
					targetTab.classList.add("drop-indicator-after");
				}
			} else if (this._tabs.length > 0) {
				let last = this._tabs[this._tabs.length - 1];
				if (last === this.movingItem) {
					if (this._tabs.length > 1) {
						last = this._tabs[this._tabs.length - 2];
					} else {
						return;
					}
				}
				this.dropTarget = last;
				this.dropPosition = "after";
			} else {
				this.dropTarget = null;
				this.dropPosition = "before";
			}
		}
		this.ondrop = this.tabDrop
		this.on("contextmenu", (e) => {
			e.preventDefault() && e.stopPropagation()
		})
		// Add a reference to the defaultTab function from main.mjs
		this.defaultTab = null;
	}

	// Method to be called when the tab bar becomes empty
	defaultTab() {
		if (typeof this._defaultTab === 'function') {
			this._defaultTab(this);
		}
	}

	set _defaultTab(v) {
		if (!isFunction(v)) throw new Error("defaultTab must be a function")
		this.__defaultTab = v
	}

	get _defaultTab() {
		return this.__defaultTab
	}

	async tabDrop(e) {
		e.stopPropagation()
		e.preventDefault()

		// Remove drop highlight from all tabs in this TabBar
		for (const tab of this.children) {
			if (tab instanceof TabItem) {
				tab.classList.remove("drop-highlight");
			}
		}
		this.classList.remove('show-split-view-indicator'); // Remove split view indicator

		console.debug("tabDrop event triggered", e);
		console.debug("dropTarget:", this.dropTarget);
		console.debug("dropPosition:", this.dropPosition);

		const items = e.dataTransfer.items
		const delayed = []
		for (let i = 0, l = items.length; i < l; i++) {
			let item = items[i]
			if (item.kind === "file") {
				delayed.push(item.getAsFileSystemHandle())
			}
		}
		if (delayed.length > 0) {
			Promise.all(delayed).then((res) => {
				res.forEach(this.dropFileHandle)
			})
		} else {
			let movingTabId = e.dataTransfer.getData("text/plain")
			let movingTab = document.getElementById(movingTabId)
			
			if (this.dropPosition === 'split') {
				window.ui.toggleSplitView(true);
				const rightTabs = window.ui.rightTabs;
				const leftTabs = window.ui.leftTabs;
				
				// Remove from old TabBar's _tabs array
				let oldTabBar = movingTab.parentElement;
				if(oldTabBar && oldTabBar instanceof TabBar) {
					const wasActive = movingTab.hasAttribute("active");
					oldTabBar._tabs = oldTabBar._tabs.filter(tab => tab !== movingTab);
					if(wasActive && oldTabBar._tabs.length > 0) {
						oldTabBar._tabs[0].click();
					} else if (oldTabBar._tabs.length === 0) {
						if (typeof oldTabBar.onEmpty === 'function') {
                            oldTabBar.onEmpty();
                        }
					}
				}

				rightTabs.append(movingTab);
				movingTab.tabBar = rightTabs;
				movingTab.config.side = 'right';
				rightTabs._tabs = Array.from(rightTabs.children).filter(child => child instanceof TabItem);
				rightTabs.resetMargins();
				movingTab.click();
				window.ui.currentEditor = window.ui.rightEdit;

			} else if (movingTab && movingTab.parentElement !== this) {
				// Remove from old TabBar's _tabs array
				let oldTabBar = movingTab.parentElement
				if(oldTabBar && oldTabBar instanceof TabBar) {
					const wasActive = movingTab.hasAttribute("active");
					oldTabBar._tabs = oldTabBar._tabs.filter(tab => tab !== movingTab)
					if(wasActive && oldTabBar._tabs.length > 0) {
						oldTabBar._tabs[0].click();
					} else if (oldTabBar._tabs.length === 0) {
						if (typeof oldTabBar.onEmpty === 'function') {
                            oldTabBar.onEmpty();
                        }
					}
				}
				
				let dropTarget = this.dropTarget;
				if (dropTarget && !(dropTarget instanceof TabItem)) {
					if(dropTarget.parentElement instanceof TabItem) {
						dropTarget = dropTarget.parentElement;
					} else {
						dropTarget = null;
					}
				}

				movingTab.tabBar = this
                movingTab.config.side = this.id === 'leftTabs' ? 'left' : 'right'; // Update tab.config.side

				if (this?.dropPosition == "before" && dropTarget) {
					this.insertBefore(movingTab, dropTarget)
				} else if (dropTarget?.nextElementSibling) {
					this.insertBefore(movingTab, dropTarget.nextElementSibling)
				} else {
					this.appendChild(movingTab)
				}
				
				// Rebuild _tabs array for the new TabBar
				this._tabs = Array.from(this.children).filter(child => child instanceof TabItem)
				this.resetMargins();
				movingTab.click()
			} else if (this.movingItem instanceof HTMLElement) {
				let dropTarget = this.dropTarget;
				if (dropTarget && !(dropTarget instanceof TabItem)) {
					if(dropTarget.parentElement instanceof TabItem) {
						dropTarget = dropTarget.parentElement;
					} else {
						dropTarget = null;
					}
				}
				if (this?.dropPosition == "before" && dropTarget) {
					this.insertBefore(this.movingItem, dropTarget)
				} else {
					if (dropTarget?.nextElementSibling) {
						this.insertBefore(this.movingItem, dropTarget.nextElementSibling)
					} else {
						this.appendChild(this.movingItem)
					}
				}

				// rebuilt the _tabs array with the new item order
				while (this._tabs.length > 0) {
					this._tabs.pop()
				}
				let tabs = this.children
				for (let i = 0, l = tabs.length; i < l; i++) {
					if (!(tabs[i] instanceof TabItem)) continue
					this._tabs.push(tabs[i])
				}
				this.resetMargins();
				this.movingItem.click()
			}
		}
		// Dispatch custom event after tab is dropped and handled
		this.dispatchEvent(new CustomEvent('tabdroppedonbar', { bubbles: true }));
	}

	get tabs() {
		return this._tabs
	}

	set close(v) {
		if (!isFunction(v)) throw new Error("close must be a function")
		this._close = v
	}

	set click(v) {
		if (!isFunction(v)) throw new Error("click must be a function")
		this._click = v
	}

	get activeIndex() {
		for (let i = 0, l = this._tabs.length; i < l; i++) {
			if (this._tabs[i].getAttribute("active") !== null) {
				return i
			}
		}
	}

	get activeTab() {
		const active = this.querySelector("ui-tab-item[active]")
		return active
	}

	byTitle(title) {
		const tab = this.querySelector(`ui-tab-item[title="${title}"`)
		if (!tab) console.warn("No match found for", title)
		return tab
	}

	next() {
		let i = this.activeIndex
		i++
		if (i > this._tabs.length - 1) {
			i = 0
		}
		this._tabs[i].click()
	}

	prev() {
		let i = this.activeIndex
		i--
		if (i < 0) {
			i = this._tabs.length - 1
		}
		this._tabs[i].click()
	}

	add(config) {
		const tab = new TabItem(config.name)
		if (config.handle) tab.setAttribute("title", buildPath(config.handle))
		tab.config = config
		tab.id = `tab-${tabCounter++}`;
		tab.setAttribute("id", `tab-${tabCounter++}`);
		tab.tabBar = this
		this._tabs.push(tab)
		this.append(tab)

		tab.onclick = (event) => {
			const tabBar = tab.parentElement;
			if (!tabBar || !(tabBar instanceof TabBar)) return;
			
			tabBar.tabs.forEach((t) => {
				t.removeAttribute("active")
			})
			tab.setAttribute("active", "active")
			if ("function" == typeof tabBar._click) {
				event.tab = tab
				tabBar._click(event)
			}
		}

		tab.oncontextmenu = (event) => {
			event.preventDefault()
			event.stopPropagation()
		}

		tab.onpointerdown = (event) => {
    		if (event.which == 2) {
				event.stopPropagation()
				event.preventDefault()
			    return
			}
			tab.click()
		}

		tab.onpointerup = (event) => {
			if (event.which == 2) {
				event.stopPropagation()
				event.preventDefault()
				event.tab = tab
				if ("function" == typeof this._close) {
					event.tab = tab
					this._close(event)
				}
			}
		}

		tab.close.onclick = async (event) => {
			event.stopPropagation()
			event.tab = tab
			if ("function" == typeof this._close) {
				event.tab = tab
				this._close(event)
			}
		}
		return tab
	}

	remove(tab, suppressDefaultTabCreation = false) {
		const wasActive = tab.getAttribute("active") != null;
		const index = this._tabs.indexOf(tab);

		if (index === -1) {
			tab.remove(); // remove from DOM even if not in _tabs array
		} else {
			this._tabs.splice(index, 1);
			if (wasActive) {
				const nextActiveTab = this._tabs[index] || this._tabs[index - 1];
				if (nextActiveTab) {
					nextActiveTab.click();
				}
			}
			tab.remove();
		}

		if (this._tabs.length === 0) {
			if (typeof this.onEmpty === 'function') {
				this.onEmpty();
			}
		}

		this.resetMargins();
	}

	resetMargins() {
		// Reset margins on all tabs to prevent visual gaps from interrupted drag operations.
		const sibs = this.children
		for (let i = 0, l = sibs.length; i < l; i++) {
			const sib = sibs[i]
			if (sib instanceof TabItem) {
				sib.style.transition = "none";
				sib.style.marginLeft = "";
				sib.style.marginRight = "";
				// Force reflow
				void sib.offsetHeight;
				sib.style.transition = "";
			}
		}
	}

	moveAllTabsTo(otherTabBar, mark, suppressDefaultTab = false) {
		if (!(otherTabBar instanceof TabBar)) {
			console.error("Target is not a TabBar");
			return;
		}

		const tabsToMove = [...this.tabs];
		if (tabsToMove.length === 0) return;

		const activeTabInSource = this.activeTab;

		tabsToMove.forEach(tab => {
            if (mark) {
                tab.setAttribute("data-original-parent", mark);
            }
			otherTabBar.append(tab);
		});

		this._tabs = [];
		otherTabBar._tabs = Array.from(otherTabBar.children).filter(child => child instanceof TabItem);

		if (activeTabInSource) {
			activeTabInSource.click();
		} else if (otherTabBar.tabs.length > 0 && !otherTabBar.activeTab) {
            otherTabBar.tabs[0].click();
        }

        // Update notice bar for the target tab bar
        if (otherTabBar.activeTab && otherTabBar.activeTab.config.fileModified) {
            window.ui.showFileModifiedNotice(otherTabBar.activeTab, otherTabBar.activeTab.config.side);
        } else {
            window.ui.hideFileModifiedNotice(otherTabBar.activeTab?.config?.side || (otherTabBar.id === 'leftTabs' ? 'left' : 'right'));
        }

        if (this.tabs.length === 0) {
            if (suppressDefaultTab) {
                if (typeof this.onEmpty === 'function') {
                    this.onEmpty();
                }
            } else {
                this.defaultTab();
            }
            // Hide notice bar for the source tab bar if it becomes empty
            window.ui.hideFileModifiedNotice(this.id === 'leftTabs' ? 'left' : 'right');
        }
	}

    reclaimTabs(sourceTabBar, mark) {
        if (!(sourceTabBar instanceof TabBar)) {
            console.error("Source is not a TabBar");
            return;
        }

        const tabsToMove = [];
        sourceTabBar.tabs.forEach(tab => {
            if (tab.getAttribute("data-original-parent") === mark) {
                tabsToMove.push(tab);
            }
        });

        if (tabsToMove.length === 0) return;

        const sourceActiveTab = sourceTabBar.activeTab;
        let activeTabIsMoving = tabsToMove.includes(sourceActiveTab);

        tabsToMove.forEach(tab => {
            this.append(tab);
            tab.removeAttribute("data-original-parent");
            tab.config.side = this.id === 'leftTabs' ? 'left' : 'right'; // Update tab.config.side
        });

        // Update tab arrays for both tab bars
        this._tabs = Array.from(this.children).filter(child => child instanceof TabItem);
        sourceTabBar._tabs = Array.from(sourceTabBar.children).filter(child => child instanceof TabItem);

        // Handle active tab
        if (activeTabIsMoving) {
            sourceActiveTab.click(); // click it in its new home
            if (sourceTabBar.tabs.length > 0) {
                sourceTabBar.tabs[0].click();
            }
        } else {
            // if source has no active tab, but still has tabs, activate one
            if (sourceTabBar.tabs.length > 0 && !sourceTabBar.activeTab) {
                sourceTabBar.tabs[0].click();
            }
            // if this tab bar has no active tab, but now has tabs, activate one
            if (this.tabs.length > 0 && !this.activeTab) {
                this.tabs[0].click();
            }
        }
        
        // Update notice bar for the target tab bar
        if (this.activeTab && this.activeTab.config.fileModified) {
            window.ui.showFileModifiedNotice(this.activeTab, this.activeTab.config.side);
        } else {
            window.ui.hideFileModifiedNotice(this.id === 'leftTabs' ? 'left' : 'right');
        }

        if (sourceTabBar.tabs.length === 0) {
            sourceTabBar.defaultTab();
            // Hide notice bar for the source tab bar if it becomes empty
            window.ui.hideFileModifiedNotice(sourceTabBar.id === 'leftTabs' ? 'left' : 'right');
        } else if (sourceTabBar.activeTab && sourceTabBar.activeTab.config.fileModified) {
            window.ui.showFileModifiedNotice(sourceTabBar.activeTab, sourceTabBar.activeTab.config.side);
        } else {
            window.ui.hideFileModifiedNotice(sourceTabBar.id === 'leftTabs' ? 'left' : 'right');
        }
    }
}

customElements.define("ui-tabbar", TabBar);