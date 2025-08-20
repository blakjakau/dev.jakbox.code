import { Panel } from './panel.mjs';
import { Inner } from './inner.mjs';
import { ActionBar } from './actionbar.mjs';
import { Button } from './button.mjs';
import { Input } from './input.mjs';

class Modal {
    #promiseResolve = null;
    #promiseReject = null;
    #panel = null;

    constructor() {
        this.#panel = new Panel();
        this.#panel.setAttribute('type', 'modal');
        this.#panel.setAttribute('blank', '');

        this.inner = new Inner();
        this.actionBar = new ActionBar();
        this.#panel.append(this.inner, this.actionBar);

        // Close on escape key
        this.escListener = (e) => {
            if (e.key === 'Escape') {
                this.hide(false); // Resolve with false or null on escape
            }
        };
    }

    show() {
        document.body.append(this.#panel);
        // A teeny delay to allow the element to be in the DOM for the CSS transition
        setTimeout(() => this.#panel.setAttribute('active', ''), 10);
        document.addEventListener('keydown', this.escListener);
        return new Promise((resolve, reject) => {
            this.#promiseResolve = resolve;
            this.#promiseReject = reject;
        });
    }

    hide(resolutionValue) {
        this.#panel.removeAttribute('active');
        document.removeEventListener('keydown', this.escListener);
        this.#panel.blanker.remove();
        // Let CSS animation finish before removing from DOM
        setTimeout(() => this.#panel.remove(), 300);
        if (this.#promiseResolve) {
            this.#promiseResolve(resolutionValue);
        }
    }

    notice(content, title = 'Notice') {
        this.inner.innerHTML = `<h1>${title}</h1>${content}`;
        this.actionBar.innerHTML = ''; // Clear previous buttons

        const okButton = new Button('Ok');
        okButton.classList.add('themed');
        okButton.on('click', () => this.hide(true));
        this.actionBar.append(okButton);
        
        return this.show();
    }

    confirm(content, title = 'Confirm', buttons = ['Ok', 'Cancel']) {
        this.inner.innerHTML = `<h1>${title}</h1>${content}`;
        this.actionBar.innerHTML = '';

        const okButton = new Button(buttons[0]);
        okButton.classList.add('themed');
        okButton.on('click', () => this.hide(true));

        const cancelButton = new Button(buttons[1]);
        cancelButton.classList.add('cancel');
        cancelButton.on('click', () => this.hide(false));

        this.actionBar.append(okButton, cancelButton);
        
        return this.show();
    }

    prompt(content, title = 'Prompt', defaultValue = '') {
        // Clear previous content
        this.inner.innerHTML = '';
        this.actionBar.innerHTML = '';

        // Create and append title
        const titleElement = document.createElement('h1');
        titleElement.innerHTML = title;
        this.inner.append(titleElement);

        // Create and append content paragraph
        const contentElement = document.createElement('p');
        contentElement.innerHTML = content;
        this.inner.append(contentElement);

        // Create and append the Input custom element
        const inputElement = new Input();
        inputElement.type = 'text'; // Set type for the internal input
        inputElement.value = defaultValue;
        this.inner.append(inputElement);
        
        const okButton = new Button('Ok');
        okButton.classList.add('themed');
        
        const submit = () => {
            this.hide(inputElement.value); // Get value from the Input custom element
        }
        
        okButton.on('click', submit);
        // Listen for 'Enter' key on the internal input element for submission
        inputElement._input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), submit()));

        const cancelButton = new Button('Cancel');
        cancelButton.classList.add('cancel');
        cancelButton.on('click', () => this.hide(null));

        this.actionBar.append(okButton, cancelButton);
        
        const promise = this.show(); // Show the modal panel
        setTimeout(() => inputElement.focus(), 50); // Focus the input after it's rendered
        return promise;
    }
}

const modal = new Modal

export default modal
export { modal as Modal }