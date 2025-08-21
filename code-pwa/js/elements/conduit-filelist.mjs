import { ContentFill, Block } from './element.mjs';
import { FileItem } from './fileitem.mjs';
import { isFunction, getIconForFileName } from './utils.mjs';
import conduit from '../conduit-client.mjs';

// Helper to build paths for Conduit
const conduitBuildPath = (parentPath, name) => {
    if (parentPath === '.' || parentPath === '/') {
        // Handle root case where parentPath might be just '.'
        return name;
    }
    // Avoid double slashes if parentPath already ends with one
    if (parentPath.endsWith('/')) {
        return `${parentPath}${name}`;
    }
    return `${parentPath}/${name}`;
};

export class ConduitFileList extends ContentFill {
    constructor() {
        super();
        this._inner = new Block();
        this._inner.classList.add("inner");
        this._inner.setAttribute("slim", "true");
        
        this._rootPath = '.';
        this._open = null; // Callback for opening files
        this._context = null; // Callback for context menu
        this._contextElement = null;
        
        this.on("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        this.itemContextMenu = (ev) => {
            ev.preventDefault();
            if (isFunction(this._context)) {
                this._contextElement = ev.currentTarget;
                this._context(ev);
            }
        };
    }

    connectedCallback() {
        this.append(this._inner);
        this.render(); // Initial render
    }

    set open(v) {
        if (!isFunction(v)) throw new Error("open must be a function");
        this._open = v;
    }
    
    get open() {
        return this._open;
    }

    set context(v) {
        if (!isFunction(v)) throw new Error("context must be a function");
        this._context = v;
    }

    get contextElement() {
        return this._contextElement;
    }
    
    // The `files` property in this component will take a root path string.
    set files(rootPath) {
        this._rootPath = rootPath || '.';
        this.render();
    }
    
    async render(base = this._inner, path = this._rootPath) {
        if (base === this._inner) {
            base.empty(); // Clear only on root render
        }
        
        try {
            // Use wsList for directory listing
            const response = await conduit.wsList(path);
            const items = response.data;
            if (!items) return;

            // Sort items: folders first, then files, alphabetically.
            items.sort((a, b) => {
                if (a.isDir !== b.isDir) {
                    return a.isDir ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            items.forEach(item => {
                const itemPath = conduitBuildPath(path, item.name);
                const e = new FileItem();
                e.setAttribute("title", itemPath);
                e.text = " " + item.name;
                // Store conduit info. The `kind` property is added for compatibility
                // with any existing logic that might check it.
                e.item = { ...item, path: itemPath, kind: item.isDir ? 'directory' : 'file' }; 
                e.on("contextmenu", this.itemContextMenu);

                if (item.isDir) {
                    e.icon = "folder";
                    e.holder = new Block();
                    e.holder.setAttribute("slim", "true");
                    e.holder.style.paddingLeft = "12px";
                    base.append(e, e.holder);
                    
                    e.on("click", async () => {
                        e.item.open = !e.item.open;
                        if (e.item.open) {
                            e.icon = "folder_open";
                            e.setAttribute("loading", "true");
                            await this.render(e.holder, itemPath);
                            e.removeAttribute("loading");
                        } else {
                            e.icon = "folder";
                            e.holder.empty();
                        }
                    });
                } else {
                    e.icon = getIconForFileName(item.name);
                    base.append(e);

                    e.on("click", async () => {
                        if (isFunction(this._open)) {
                            e.setAttribute("loading", "true");
                            // The `open` handler will need to be adapted to handle Conduit items.
                            // The item passed is { name, isDir, size, modTime, path, kind }
                            await this._open(e.item);
                            e.removeAttribute("loading");
                        }
                    });
                }
            });

        } catch (error) {
            console.error(`[ConduitFileList] Error listing path "${path}":`, error);
            const errorItem = new FileItem(`Error: ${error.message}`);
            errorItem.style.color = 'var(--color-error)';
            errorItem.icon = 'error';
            base.append(errorItem);
        }
    }
}

customElements.define("ui-conduit-file-list", ConduitFileList);
