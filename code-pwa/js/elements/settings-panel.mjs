import { ContentFill, Block } from "./element.mjs";
import { Button } from "./button.mjs";

export class SettingsPanel extends ContentFill {
    constructor() {
        super();
        this.classList.add('settings-panel-content'); // Add a class for styling
        this._schema = null;
        this._form = document.createElement('form');
        this._form.addEventListener('submit', (e) => e.preventDefault());
        this.append(this._form);
    }

    render(schema, values = {}) {
        this._schema = schema;
        this._form.innerHTML = ''; // Clear previous content

        for (const item of schema) {
            const container = new Block();
            container.classList.add('setting-item', `setting-type-${item.type}`);
            
            let label, input;

            if (item.label && item.type !== 'heading') {
                label = document.createElement('label');
                label.textContent = item.label;
                label.setAttribute('for', item.id);
            }

            switch (item.type) {
                case 'heading':
                    const heading = document.createElement('h3');
                    heading.textContent = item.label;
                    container.append(heading);
                    break;
                case 'text':
                case 'number':
                case 'password':
                    input = document.createElement('input');
                    input.type = item.type;
                    input.id = item.id;
                    input.name = item.id;
                    input.value = values[item.id] || '';
                    if (item.placeholder) input.placeholder = item.placeholder;
                    if(label) container.append(label);
                    container.append(input);
                    break;
                case 'textarea':
                    input = document.createElement('textarea');
                    input.id = item.id;
                    input.name = item.id;
                    input.value = values[item.id] || '';
                    if (item.rows) input.rows = item.rows;
                    if(label) container.append(label);
                    container.append(input);
                    break;
                case 'boolean':
				case 'checkbox':
					if (label) container.append(label); // Create the top label if item.label is provided
					const checkboxDedicatedWrapper = new Block();
					const checkboxDedicatedInnerLabel = document.createElement('label');
					input = document.createElement('input');
					input.type = 'checkbox';
					input.id = item.id;
					input.name = item.id;
					input.checked = !!values[item.id];
					checkboxDedicatedInnerLabel.append(input, ` ${item.text || ''}`); // Uses item.text for inline label for checkboxes
					checkboxDedicatedWrapper.append(checkboxDedicatedInnerLabel);
					container.append(checkboxDedicatedWrapper);
					break;
                case 'select':
                    input = document.createElement('select');
                    input.id = item.id;
                    input.name = item.id;
                    if (item.options) {
                        for (const opt of item.options) {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.text;
                            if (values[item.id] === opt.value) {
                                option.selected = true;
                            }
                            input.append(option);
                        }
                    }
                    if (item.onChangeEvent) {
                        input.addEventListener('change', (e) => this.dispatch(item.onChangeEvent, { id: item.id, value: e.target.value }));
                    }
                    if(label) container.append(label);
                    container.append(input);
                    break;
                case 'button':
                    if (label) container.append(label);
                    const button = new Button(item.text || item.label);
                    if (item.icon) button.icon = item.icon;
                    if (item.className) button.classList.add(...item.className.split(' '));
                    if (item.onClickEvent) {
                        button.on('click', () => this.dispatch(item.onClickEvent, { id: item.id, element: button }));
                    }
                    container.append(button);
                    break;
                case 'info':
                    const info = new Block();
                    info.innerHTML = item.content; // Allow HTML content
                    container.append(info);
                    break;
            }
            if (item.help) {
                const helpText = document.createElement('p');
                helpText.className = 'help-text';
                helpText.textContent = item.help;
                container.append(helpText);
            }
            this._form.append(container);
        }

        // Add a general Save button if there are any savable fields
        const hasInputs = schema.some(item => ['textarea', 'checkbox', 'select', 'text', 'number', 'password'].includes(item.type));
        if (hasInputs) {
            const saveButton = new Button("Save Settings");
            saveButton.icon = "save";
            saveButton.classList.add("theme-button");
            saveButton.on('click', () => this._save());
            this._form.append(saveButton);
        }
    }

    _save() {
        const values = {};
        for (const item of this._schema) {
            if (['textarea', 'checkbox', 'boolean', 'select', 'text', 'number', 'password'].includes(item.type)) {
                const input = this._form.querySelector(`[name="${item.id}"]`);
                if (input) {
                    if (item.type === 'checkbox' || item.type === 'boolean') {
                        values[item.id] = input.checked;
                    } else {
                        values[item.id] = input.value;
                    }
                }
            }
        }
        this.dispatch('settings-saved', values);
    }
}

customElements.define('ui-settings-panel', SettingsPanel);
