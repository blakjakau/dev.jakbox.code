// elements/filebar.mjs
import { Block } from './element.mjs';
import { FileChip } from './filechip.mjs';

export class FileBar extends Block {
    constructor() {
        super();
        this._chips = new Map();
        this.style.display = 'none'; // Initially hidden
    }

    add(config) {
        if (this._chips.has(config.id)) {
            // Chip for this file already exists
            return this._chips.get(config.id);
        }

        const chip = new FileChip(config);
        chip.on('chip-close', () => {
            // Let the parent (ai-manager) handle removal from history first
            this.dispatch('file-remove-request', { fileId: config.id });
        });
        
        this._chips.set(config.id, chip);
        this.append(chip);
        
        if (this.style.display === 'none') {
            this.style.display = 'flex'; // Make visible if it was hidden
        }
        return chip;
    }

    remove(chipOrId) {
        const chipId = (chipOrId instanceof FileChip) ? chipOrId.config.id : chipOrId;
        
        if (this._chips.has(chipId)) {
            const chip = this._chips.get(chipId);
            chip.remove();
            this._chips.delete(chipId);
        }

        if (this._chips.size === 0) {
            this.style.display = 'none'; // Hide if no chips are left
        }
    }

    clear() {
        this.innerHTML = '';
        this._chips.clear();
        this.style.display = 'none'; // Hide after clearing
    }
}

customElements.define("ui-filebar", FileBar);
