// elements/filechip.mjs
import { Button } from './button.mjs';
import { Icon } from './icon.mjs';

export class FileChip extends Button {
    constructor(config) {
        super();
        this.config = config;
        this.id = `filechip-${config.id}`; // Use the message id for the element id, prefixed for clarity

        const textContent = `${config.filename} (${(config.content.length / 1024).toFixed(1)} KB)`;
        this.setAttribute('title', textContent);
        
        const textElement = document.createElement('span');
        textElement.textContent = config.filename;
        
        this._close = new Icon();
        this._close.innerHTML = "close";
        this._close.setAttribute("close", "close");
        this._close.setAttribute("size", "tiny");

        this.append(textElement, this._close);

        this.onclick = (e) => {
            if (e.target !== this._close) {
                // Potentially do something on chip click, like scroll to file in file list
            }
        };

        this._close.onclick = (e) => {
            e.stopPropagation();
            this.dispatch('chip-close');
        };
    }
}

customElements.define("ui-filechip", FileChip);
