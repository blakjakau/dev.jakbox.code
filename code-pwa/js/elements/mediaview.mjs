import { Panel } from './panel.mjs';
import { isset } from './utils.mjs';

export class MediaView extends Panel {
    constructor(content) {
        super()
        if (isset(content)) this.innerHTML = content
        this.image = new Image();
        this.image.style.maxWidth = "100%";
        this.image.style.maxHeight = "100%";
        this.image.style.objectFit = "contain";
        
        this.image.style.cursor = "grab";
        this.image.style.pointerEvents = "none";
        this.append(this.image);

        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;

        this.image.onload = () => {
            setTimeout(() => {
                this.resetTransform();
            }, 0);
        };

        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target === this) {
                    setTimeout(() => {
                        this.resetTransform();
                    }, 0);
                }
            }
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this.style.overflow = "hidden";
        // this.style.display = "flex";
        this.style.justifyContent = "center";
        this.style.alignItems = "center";
        this.resizeObserver.observe(this);
    }

    setImage(src) {
        this.image.src = src;
        // resetTransform will be called by onload
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver.disconnect();
    }

    resetTransform() {
        this.scale = 1;
        const viewWidth = this.offsetWidth;
        const viewHeight = this.offsetHeight;
        const imageRenderedWidth = this.image.offsetWidth;
        const imageRenderedHeight = this.image.offsetHeight;

        this.translateX = (viewWidth - imageRenderedWidth) / 2;
        this.translateY = (viewHeight - imageRenderedHeight) / 2;
        this.applyTransform();
    }

    applyTransform() {
        this.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    handlePointerDown(event) {
        if (event.button === 0) { // Left mouse button
            this.isDragging = true;
            this.lastPointerX = event.clientX;
            this.lastPointerY = event.clientY;
            this.image.style.cursor = "grabbing";
            this.setPointerCapture(event.pointerId);
        }
    }

    handlePointerMove(event) {
        if (!this.isDragging) return;

        const dx = event.clientX - this.lastPointerX;
        const dy = event.clientY - this.lastPointerY;

        this.translateX += dx;
        this.translateY += dy;

        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;

        this.applyTransform();
    }

    handlePointerUp() {
        this.isDragging = false;
        this.image.style.cursor = "grab";
    }

    
    
    setImage(src) {
        this.image.src = src;
        this.resetTransform();
    }
}

customElements.define("ui-media-view", MediaView);