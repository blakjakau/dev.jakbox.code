// ai-manager-settings.mjs
import { Block, Button } from "./elements.mjs"
import { SettingsPanel } from "./elements/settings-panel.mjs"

/**
 * Manages the UI and logic for the AIManager's settings panel.
 */
class AIManagerSettings {
    constructor(aiManager) {
        this.aiManager = aiManager; // Reference to the main AI manager
        this.panel = null;
        this._settingsContentPanel = null
    }

    /**
     * Creates the main panel element for settings.
     * @returns {HTMLElement} The settings panel element.
     */
    createPanel() {
        this.panel = new Block();
        this.panel.classList.add("settings-panel");

        this._settingsContentPanel = new SettingsPanel()
        this.panel.append(this._settingsContentPanel)

        // Listen for events from the settings panel
        this._settingsContentPanel.on("settings-saved", (e) => this.saveSettings(e.detail))
        this._settingsContentPanel.on("switch-ai-provider", (e) => {
            this.aiManager.switchAiProvider(e.detail.value)
        })
        this._settingsContentPanel.on("refresh-models", (e) => this._refreshModels(e.detail.element))

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
        const { aiManager } = this
        // Determine if workspace settings are in use
        const useWorkspaceSettings = !!(
            window.workspace?.aiConfig?.[aiManager.aiProvider] ||
            (window.workspace?.systemPromptConfig &&
                Object.keys(window.workspace.systemPromptConfig).length > 0)
        )
        aiManager.useWorkspaceSettings = useWorkspaceSettings
        
        const systemPromptConfig = aiManager.getSystemPromptConfig()
        const providerOptions = await aiManager.ai.getOptions()

        // Build the values object to populate the form
        const values = {
            "use-workspace-settings": useWorkspaceSettings,
            summarizeThreshold: aiManager.config.summarizeThreshold,
            summarizeTargetPercentage: aiManager.config.summarizeTargetPercentage,
            systemPromptSpecialization: systemPromptConfig.specialization,
            systemPromptTechnologies: (systemPromptConfig.technologies || []).join(", "),
            systemPromptAvoidedTechnologies: (systemPromptConfig.avoidedTechnologies || []).join(", "),
            systemPromptTone: (systemPromptConfig.tone || ["warm", "playful", "cheeky"]).join(", "),
            "ai-provider": aiManager.aiProvider,
        }
        for (const key in providerOptions) {
            values[`${aiManager.aiProvider}-${key}`] = providerOptions[key].value
        }
        
        // Build the schema that defines the form structure
        const schema = [
            { type: "checkbox", id: "use-workspace-settings", label: "Use workspace-specific settings" },
            { type: "number", id: "summarizeThreshold", label: "Summarize History When Context Reaches (%)" },
            { type: "number", id: "summarizeTargetPercentage", label: "Percentage of Old History to Summarize" },
            { type: "heading", label: "Prompt Customisation" },
            {
                type: "select",
                id: "systemPromptSpecialization",
                label: "AI Focus",
                options: [
                    "Web Frontend (HTML, CSS, JavaScript, etc)",
                    "Web Backend (Node.js, PHP, etc)",
                    "Full-Stack Web Development",
                    "Embedded Systems",
                    "Systems Architecture",
                ].map((v) => ({ value: v, text: v })),
            },
            { type: "text", id: "systemPromptTechnologies", label: "Preferred Technologies (comma-separated)" },
            { type: "text", id: "systemPromptAvoidedTechnologies", label: "Avoid Technologies (comma-separated)" },
            { type: "text", id: "systemPromptTone", label: "AI Tone (comma-separated)" },
            {
                type: "select",
                id: "ai-provider",
                label: "AI Provider",
                options: Object.keys(aiManager.aiProviders).map((p) => ({
                    value: p,
                    text: p.charAt(0).toUpperCase() + p.slice(1),
                })),
                onChangeEvent: "switch-ai-provider",
            },
            { type: "heading", label: "AI Provider Settings" },
        ]

        for (const key in providerOptions) {
            const setting = providerOptions[key]
            const id = `${aiManager.aiProvider}-${key}`

            if (setting.type === "enum") {
                schema.push({
                    type: "select",
                    id: id,
                    label: setting.label,
                    options: (setting.enum || []).map((opt) => ({ value: opt.value, text: opt.label || opt.value })),
                })
                if (key === "model") {
                    schema.push({
                        type: "button",
                        id: "refresh-models-btn",
                        label: "Refresh Models",
                        icon: "refresh",
                        className: "theme-button",
                        onClickEvent: "refresh-models",
                    })
                }
            } else {
                schema.push({
                    type: setting.multiline ? "textarea" : setting.secret ? "password" : "text",
                    id: id,
                    label: setting.label,
                })
            }
        }
        
        this._settingsContentPanel.render(schema, values)

        const checkbox = this.panel.querySelector("#use-workspace-settings")
        checkbox.addEventListener("change", () => {
            this.aiManager.useWorkspaceSettings = checkbox.checked
            this._toggleInputs(checkbox.checked)
        })
        this._toggleInputs(useWorkspaceSettings)
    }

    /**
     * Saves all settings from the form, dispatching events and calling back to the AI manager.
     * @param {object} values - An object containing the new settings from the form.
     */
    async saveSettings(values) {
        const { aiManager } = this;

        // --- Save Generic Settings (Summarization) ---
        aiManager.config.summarizeThreshold = parseInt(values.summarizeThreshold);
        aiManager.config.summarizeTargetPercentage = parseInt(values.summarizeTargetPercentage);
        localStorage.setItem("summarizeThreshold", aiManager.config.summarizeThreshold);
        localStorage.setItem("summarizeTargetPercentage", aiManager.config.summarizeTargetPercentage);

        // --- Save System Prompt Settings ---
        const systemPromptConfig = {
            specialization: values.systemPromptSpecialization,
            technologies: values.systemPromptTechnologies.split(",").map((t) => t.trim()).filter(Boolean),
            avoidedTechnologies: values.systemPromptAvoidedTechnologies.split(",").map((t) => t.trim()).filter(Boolean),
            tone: values.systemPromptTone.split(",").map((t) => t.trim()).filter(Boolean),
        };
        aiManager.saveSystemPromptConfig(systemPromptConfig, aiManager.useWorkspaceSettings);

        // --- Save Provider-Specific Settings ---
        const oldModel = aiManager.ai.config.model;
        const newProviderSettings = {};
        const currentOptions = await aiManager.ai.getOptions();

        for (const key in currentOptions) {
            const valueKey = `${aiManager.aiProvider}-${key}`
            if (values.hasOwnProperty(valueKey)) {
                newProviderSettings[key] = values[valueKey];
            }
        }

        aiManager.ai.setOptions(
            newProviderSettings, // onError
            (errorMessage) => {
                const errorBlock = new Block();
                errorBlock.classList.add("response-block", "error-block");
                errorBlock.innerHTML = `Error: ${errorMessage}`;
                aiManager.conversationArea.append(errorBlock);
                aiManager.conversationArea.scrollTop = aiManager.conversationArea.scrollHeight;
                aiManager._dispatchContextUpdate("settings_save_error");
                aiManager._setButtonsDisabledState(aiManager._isProcessing);
            }, // onSuccess
            (successMessage) => {
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
    
    async _refreshModels(button) {
        const { aiManager } = this;
        button.disabled = true;
        aiManager._setButtonsDisabledState(true);
        try {
            await aiManager.ai.refreshModels();
            this.renderForm(); // Re-render to show updated model list
        } finally {
            // The button is re-created by renderForm, so no need to explicitly re-enable it.
            aiManager._setButtonsDisabledState(false);
            aiManager._updateAIInfoDisplay();
            aiManager._dispatchContextUpdate("settings_change");
            aiManager.historyManager.render();
        }
    }

    // --- UI Helper Methods ---
    _toggleInputs(disabled) {
        // The settings panel component creates a form, which we can query into.
        const form = this._settingsContentPanel.querySelector("form")
        if (!form) return;
        const inputs = form.querySelectorAll("input:not(#use-workspace-settings), textarea, select, ui-button")
        inputs.forEach((input) => {
            input.disabled = disabled;
        });
    }
}

export default AIManagerSettings;
