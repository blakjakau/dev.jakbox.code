// ai-manager-settings.mjs
import { Block, Button } from "./elements.mjs";

/**
 * Manages the UI and logic for the AIManager's settings panel.
 */
class AIManagerSettings {
    constructor(aiManager) {
        this.aiManager = aiManager; // Reference to the main AI manager
        this.panel = null;
        this._form = null;
        this._workspaceSettingsCheckbox = null;
    }

    /**
     * Creates the main panel element for settings.
     * @returns {HTMLElement} The settings panel element.
     */
    createPanel() {
        this.panel = new Block();
        this.panel.classList.add("settings-panel");

        this._form = document.createElement("form");
        this.panel.append(this._form);
        return this.panel;
    }

    /**
     * Initializes the settings manager after the AI provider is ready.
     */
    init() {
        // The form is already created by createPanel, just need to render its content.
        this.renderForm();
    }
    
    /**
     * Toggles visibility of the settings panel and refreshes its content.
     */
    toggle() {
        const isActive = this.panel.classList.toggle("active");
        if (isActive) {
            this.renderForm();
        }
    }

    /**
     * Renders the complete settings form, including generic, system prompt, and provider-specific settings.
     */
    async renderForm() {
        this._form.innerHTML = ''; // Clear previous content

        // --- Workspace Settings Checkbox ---
        const workspaceSettingsLabel = this._createWorkspaceCheckbox();
        this._form.appendChild(workspaceSettingsLabel);
        
        // --- Generic AI Manager Settings (Summarization, System Prompt) ---
        this._renderGenericSettings();
        
        // --- AI Provider Selection ---
        this._renderProviderSelection();

        // --- Provider-Specific Settings ---
        await this._renderProviderSpecificSettings();

        // --- Save Button ---
        const saveButton = new Button("Save Settings");
        saveButton.icon = "save";
        saveButton.classList.add("theme-button");
        saveButton.on("click", () => this.saveSettings());
        
        const label = document.createElement("label"); // This label acts as a container for alignment
        label.classList.add("save-button-wrapper"); // Add a class for specific styling
        label.appendChild(saveButton);
        this._form.appendChild(label);

        // --- Initial State ---
        this._toggleInputs(this.aiManager.useWorkspaceSettings);
    }

    /**
     * Saves all settings from the form, dispatching events and calling back to the AI manager.
     */
    async saveSettings() {
        const { aiManager } = this;
        const form = this._form;

        // --- Save Generic Settings (Summarization) ---
        aiManager.config.summarizeThreshold = parseInt(form.querySelector("#summarizeThreshold").value);
        aiManager.config.summarizeTargetPercentage = parseInt(form.querySelector("#summarizeTargetPercentage").value);
        localStorage.setItem("summarizeThreshold", aiManager.config.summarizeThreshold);
        localStorage.setItem("summarizeTargetPercentage", aiManager.config.summarizeTargetPercentage);

        // --- Save System Prompt Settings ---
        const systemPromptConfig = {
            specialization: form.querySelector("#systemPromptSpecialization").value,
            technologies: form.querySelector("#systemPromptTechnologies").value.split(',').map(t => t.trim()).filter(Boolean),
            avoidedTechnologies: form.querySelector("#systemPromptAvoidedTechnologies").value.split(',').map(t => t.trim()).filter(Boolean),
            tone: form.querySelector("#systemPromptTone").value.split(',').map(t => t.trim()).filter(Boolean),
        };
        aiManager.saveSystemPromptConfig(systemPromptConfig, aiManager.useWorkspaceSettings);

        // --- Save Provider-Specific Settings ---
        const oldModel = aiManager.ai.config.model;
        const newProviderSettings = {};
        const currentOptions = await aiManager.ai.getOptions();
        for (const key in currentOptions) {
            const input = form.querySelector(`#${aiManager.aiProvider}-${key}`);
            if (input) {
                newProviderSettings[key] = input.value;
            }
        }

        aiManager.ai.setOptions(
            newProviderSettings,
            (errorMessage) => { // onError
                const errorBlock = new Block();
                errorBlock.classList.add("response-block", "error-block");
                errorBlock.innerHTML = `Error: ${errorMessage}`;
                aiManager.conversationArea.append(errorBlock);
                aiManager.conversationArea.scrollTop = aiManager.conversationArea.scrollHeight;
                aiManager._dispatchContextUpdate("settings_save_error");
                aiManager._setButtonsDisabledState(aiManager._isProcessing);
            },
            (successMessage) => { // onSuccess
                const newModel = aiManager.ai.config.model;
                let messageContent = successMessage;
                if (newModel && newModel !== oldModel) {
                    messageContent = `AI model switched to **${newModel}**.`;
                }
                aiManager.historyManager.addMessage({
                    type: "system_message",
                    content: messageContent,
                    timestamp: Date.now()
                }, false);
                aiManager._dispatchContextUpdate("settings_save_success");
                aiManager._setButtonsDisabledState(aiManager._isProcessing);
            },
            aiManager.useWorkspaceSettings,
            aiManager.ai.settingsSource
        );

        aiManager.toggleSettingsPanel(); // Hide panel after saving
    }
    
    _createWorkspaceCheckbox() {
        const label = document.createElement("label");
        label.htmlFor = "use-workspace-settings";
        label.textContent = "Use workspace-specific settings";
        
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = "use-workspace-settings";
        // Determine initial state based on whether ANY workspace config exists
        this.aiManager.useWorkspaceSettings = !!(window.workspace?.aiConfig?.[this.aiManager.aiProvider] || window.workspace?.systemPromptConfig && Object.keys(window.workspace.systemPromptConfig).length > 0);
        checkbox.checked = this.aiManager.useWorkspaceSettings;

        checkbox.addEventListener("change", () => {
            this.aiManager.useWorkspaceSettings = checkbox.checked;
            this._toggleInputs(checkbox.checked);
        });

        this._workspaceSettingsCheckbox = checkbox;
        label.prepend(checkbox);
        return label;
    }

    _renderGenericSettings() {
        const { aiManager, _form } = this;
        // Summarization
        this._createInput(_form, 'summarizeThreshold', 'Summarize History When Context Reaches (%)', aiManager.config.summarizeThreshold, 'number');
        this._createInput(_form, 'summarizeTargetPercentage', 'Percentage of Old History to Summarize', aiManager.config.summarizeTargetPercentage, 'number');

        const promptHeader = document.createElement("h3");
        promptHeader.textContent = "Prompt Customisation";
        _form.appendChild(promptHeader);

        // System Prompt
        const systemPromptConfig = aiManager.getSystemPromptConfig();
        this._createSelect(_form, 'systemPromptSpecialization', 'AI Focus', systemPromptConfig.specialization, [
            "Web Frontend (HTML, CSS, JavaScript, etc)", 
            "Web Backend (Node.js, PHP, etc)",
            "Full-Stack Web Development",
            "Embedded Systems",
            "Systems Architecture"
        ]);
        this._createInput(_form, 'systemPromptTechnologies', 'Preferred Technologies (comma-separated)', (systemPromptConfig.technologies || []).join(', '), 'text', true);
        this._createInput(_form, 'systemPromptAvoidedTechnologies', 'Avoid Technologies (comma-separated)', (systemPromptConfig.avoidedTechnologies || []).join(', '), 'text', true);
        this._createInput(_form, 'systemPromptTone', 'AI Tone (comma-separated)', (systemPromptConfig.tone || ["warm", "playful", "cheeky"]).join(', '), 'text', true);
    }
    
    async _renderProviderSelection() {
        const { aiManager, _form } = this;
        const providerOptions = Object.keys(aiManager.aiProviders);
        this._createSelect(_form, 'ai-provider', 'AI Provider', aiManager.aiProvider, providerOptions, (value) => {
            aiManager.switchAiProvider(value);
            // The switch triggers a re-render of the form, so no need to do more here.
        });
    }

    async _renderProviderSpecificSettings() {
        const providerHeader = document.createElement("h3");
        providerHeader.textContent = "AI Provider Settings";
        this._form.appendChild(providerHeader);

        const { aiManager, _form } = this;
        const options = await aiManager.ai.getOptions();
        for (const key in options) {
            const setting = options[key];
            const id = `${aiManager.aiProvider}-${key}`;

            if (setting.type === "enum") {
                const enumOptions = (setting.enum || []).map(opt => ({ value: opt.value, label: opt.label || opt.value }));
                const select = this._createSelect(_form, id, setting.label, setting.value, enumOptions);
                if (key === "model") {
                    const refreshButton = new Button();
                    refreshButton.icon = "refresh";
                    refreshButton.classList.add("theme-button");
                    refreshButton.on("click", async () => {
                        aiManager._setButtonsDisabledState(true);
                        try {
                            await aiManager.ai.refreshModels();
                            this.renderForm(); // Re-render to show updated model list
                        } finally {
                            aiManager._setButtonsDisabledState(false);
                            aiManager._updateAIInfoDisplay();
                            aiManager._dispatchContextUpdate("settings_change");
                            aiManager.historyManager.render();
                        }
                    });

                    // Wrap the select and the refresh button in a container
                    // to position the button to the left of the select.
                    const label = select.parentElement;
                    const inputContainer = document.createElement('div');
                    inputContainer.classList.add('input-with-button');

                    // Move the original select into the new container
                    label.removeChild(select);
                    inputContainer.appendChild(refreshButton);
                    inputContainer.appendChild(select);
                    label.appendChild(inputContainer);
                }
            } else {
                this._createInput(_form, id, setting.label, setting.value, setting.type, setting.multiline, setting.secret);
            }
        }
    }
    
    // --- UI Helper Methods ---
    _createInput(parent, id, labelText, value, type = 'text', multiline = false, secret = false) {
        const label = document.createElement("label");
        const span = document.createElement("span");
        span.textContent = `${labelText}:`;
        label.appendChild(span);

        let input;
        if (multiline) {
            input = document.createElement("textarea");
        } else {
            input = document.createElement("input");
            input.type = secret ? 'password' : type;
        }
        input.id = id;
        input.value = value;
        label.appendChild(input);
        parent.appendChild(label);
        return input;
    }

    _createSelect(parent, id, labelText, value, options, onChange = null) {
        const label = document.createElement("label");
        const span = document.createElement("span");
        span.textContent = `${labelText}:`;
        label.appendChild(span);

        const select = document.createElement("select");
        select.id = id;

        options.forEach(opt => {
            const option = document.createElement("option");
            if (typeof opt === 'string') {
                option.value = opt;
                option.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
            } else { // object {value, label}
                option.value = opt.value;
                option.textContent = opt.label;
            }
            if (option.value === value) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        if (onChange) {
            select.addEventListener('change', () => onChange(select.value));
        }

        label.appendChild(select);
        parent.appendChild(label);
        return select;
    }
    
    _toggleInputs(disabled) {
        const inputs = this._form.querySelectorAll("input:not(#use-workspace-settings), textarea, select");
        inputs.forEach(input => {
            input.disabled = disabled;
        });
    }
}

export default AIManagerSettings;
