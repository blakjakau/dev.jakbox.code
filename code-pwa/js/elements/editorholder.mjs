import { Panel } from './panel.mjs';
import { MediaView } from './mediaview.mjs';
import { TabItem } from './tabitem.mjs';
import { TabBar } from './tabbar.mjs';

export class EditorHolder extends Panel {
    constructor() {
        super();
        this.editorElement = document.createElement("div");
        this.editorElement.classList.add("loading");
        this.mediaView = new MediaView();
        this.appendChild(this.editorElement);
        this.appendChild(this.mediaView);

        this.dragCounter = 0;

        this.on("dragenter", (e) => {
            if (e.dataTransfer.types.includes("application/x-tab-item")) {
                e.preventDefault();
                this.dragCounter++;
                this.classList.add("drag-over");
            }
        });

        this.on("dragleave", (e) => {
            if (e.dataTransfer.types.includes("application/x-tab-item")) {
                e.preventDefault();
                this.dragCounter--;
                if (this.dragCounter === 0) {
                    this.classList.remove("drag-over");
                }
            }
        });

        this.on("dragover", (e) => {
            if (e.dataTransfer.types.includes("application/x-tab-item")) {
                e.preventDefault();
            }
        });

        this.on("drop", async (e) => {
            e.preventDefault();
            this.dragCounter = 0;
            this.classList.remove("drag-over");

            const tabId = e.dataTransfer.getData("application/x-tab-item");
            const tab = document.getElementById(tabId);

            if (tab && tab.parentElement !== this.tabs) {
                const sourceTabBar = tab.parentElement;

                if (sourceTabBar && sourceTabBar.tagName === 'UI-TABBAR') {
                    const index = sourceTabBar._tabs.indexOf(tab);
                    if (index > -1) {
                        const wasActive = tab.hasAttribute("active");
                        sourceTabBar._tabs.splice(index, 1);

                        if (wasActive && sourceTabBar._tabs.length > 0) {
                            const nextActiveTab = sourceTabBar._tabs[index] || sourceTabBar._tabs[index - 1];
                            if (nextActiveTab) {
                                nextActiveTab.click();
                            }
                        } else if (sourceTabBar._tabs.length === 0) {
                            if (typeof sourceTabBar.onEmpty === 'function') {
                                sourceTabBar.onEmpty();
                            }
                        }
                    }
                }

                this.tabs.append(tab);
                this.tabs._tabs.push(tab);
                tab.tabBar = this.tabs;
                tab.config.side = this.id === 'leftHolder' ? 'left' : 'right';
                tab.click();
            }
        });
    }

    set editor(aceEditorInstance) {
        this._editor = aceEditorInstance;
        this.editorElement.setAttribute("id", aceEditorInstance.container.id);
    }

    get editor() {
        return this._editor;
    }

    set tabs(tabBarInstance) {
        this._tabs = tabBarInstance;
        this.appendChild(tabBarInstance);
    }

    get tabs() {
        return this._tabs;
    }

    set media(mediaViewInstance) {
        this._media = mediaViewInstance;
        this.mediaView.setAttribute("id", mediaViewInstance.id);
    }

    get media() {
        return this._media;
    }

    set side(value) {
        this._side = value;
        this.setAttribute("side", value);
    }

    get side() {
        return this._side;
    }

    connectedCallback() {
        super.connectedCallback();
        // Add background element for empty state
        const backgroundElement = document.createElement("div");
        backgroundElement.classList.add("background-element");
        const image = document.createElement("img");
        image.src = "/images/code-192.png";
        const caption = document.createElement("div");
        caption.classList.add("caption");
        caption.innerHTML = "CTRL+O to open a file <br/> CTRL+N to create a new file";
        backgroundElement.appendChild(image);
        backgroundElement.appendChild(caption);
        this.appendChild(backgroundElement);

        // Add overlay for drag-over effect
        const overlay = document.createElement("div");
        overlay.classList.add("holder-overlay");
        this.appendChild(overlay);

        // Add file modified notice bar
        const noticeBar = document.createElement("div");
        noticeBar.setAttribute("id", `${this.id}FileModifiedNotice`);
        noticeBar.classList.add("notice-bar");
        noticeBar.style.display = "none";
        noticeBar.innerHTML = `
            <span>This file has been modified outside the editor.</span>
            <button rel="reload">Reload</button> <button rel="dismiss">X</button> `;
        this.appendChild(noticeBar);
    }
}

customElements.define("ui-editor-holder", EditorHolder);