// ai-manager.mjs
// Styles for this module are located in css/ai-manager.css
import { Block, Button, Icon } from "./elements.mjs"
import Ollama from "./ai-ollama.mjs" // Assuming this file exists and has isConfigured()
import Gemini from "./ai-gemini.mjs" // Assuming this file exists and has isConfigured()
import AIManagerHistory, { MAX_RECENT_MESSAGES_TO_PRESERVE } from "./ai-manager-history.mjs"

const MAX_PROMPT_HISTORY = 50

class AIManager {
	constructor() {
		this.ai = null
		this.aiProvider = "ollama" // Default AI provider
		this.aiProviders = {
			ollama: Ollama,
			gemini: Gemini,
		}
		this._settingsSchema = {
			aiProvider: { type: "enum", label: "AI Provider", default: "ollama", enum: Object.keys(this.aiProviders) },
			// NEW: Summarization settings
			summarizeThreshold: { type: "number", label: "Summarize History When Context Reaches (%)", default: 85 },
			summarizeTargetPercentage: { type: "number", label: "Percentage of Old History to Summarize", default: 50 },
		}

		this.prompts = [] // Stores raw user prompt strings for history navigation (Ctrl+Up/Down)
		this.promptIndex = -1 // -1 indicates no prompt from history is currently displayed
		this.historyManager = new AIManagerHistory(this)

		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit()
		this.settingsPanel = null
		this._settingsForm = null // NEW: Reference to the settings form element
		this._workspaceSettingsCheckbox = null // NEW: Reference to the checkbox
		this.useWorkspaceSettings = false
		this.userScrolled = false
		this._isProcessing = false // NEW: Flag to track if AI is busy (generating or summarizing)

		// NEW: Reference to the AI info display element
		this.aiInfoDisplay = null;

		// NEW: Load summarization settings defaults
		this.config = {
			summarizeThreshold: this._settingsSchema.summarizeThreshold.default,
			summarizeTargetPercentage: this._settingsSchema.summarizeTargetPercentage.default,
		}
	}

	async init(panel) {
		this.panel = panel
		await this.loadSettings()
		
		// Initialize the AI provider instance
		this.ai = new this.aiProviders[this.aiProvider]();
		await this.ai.init(); // Initialize with loaded settings

		// NEW: Load summarization settings from storage, overriding defaults
		const storedSummarizeThreshold = localStorage.getItem("summarizeThreshold")
		if (storedSummarizeThreshold !== null) {
			this.config.summarizeThreshold = parseInt(storedSummarizeThreshold);
		}
		const storedSummarizeTargetPercentage = localStorage.getItem("summarizeTargetPercentage")
		if (storedSummarizeTargetPercentage !== null) {
			this.config.summarizeTargetPercentage = parseInt(storedSummarizeTargetPercentage);
		}

		this._createUI(); // Creates UI elements, including aiInfoDisplay
		this._setupPanel();
		
		// NEW: Update the AI info display once UI elements are available and AI is initialized
		this._updateAIInfoDisplay();

		// If there's any initial history to display, render it
		this.historyManager.render();
		this._dispatchContextUpdate("init"); // NEW: Dispatch initial context state

		// ADDITION: Listen for external setting changes (e.g., from main.mjs loading workspace config)
		window.addEventListener('setting-changed', this._handleSettingChangedExternally.bind(this));
	}

	set editor(editor) {
		this.ai.editor = editor
	}

	get editor() {
		return this.ai.editor
	}

	focus() {
		this.promptArea?.focus()
	}

	_setupPanel() {
		this.panel.setAttribute("id", "ai-panel")
	}

	_createUI() {
		this.conversationArea = this._createConversationArea()
		const promptContainer = this._createPromptContainer()
		this.settingsPanel = this._createSettingsPanel() // Settings panel is created, but not populated yet
		this.panel.append(this.conversationArea)
		this.panel.append(this.settingsPanel)
		this.panel.append(promptContainer)
	}

	_createConversationArea() {
		const conversationArea = new Block()
		conversationArea.classList.add("conversation-area")
		return conversationArea
	}

	_createPromptContainer() {
		const promptContainer = new Block()
		promptContainer.classList.add("prompt-container")

		this.progressBar = document.createElement("div")
		this.progressBar.classList.add("progress-bar")
		this.progressBar.setAttribute("title", "Context window utilization")
		this.progressBar.style.display = "block" // Now always visible


		const progressBarInner = document.createElement("div")
		progressBarInner.classList.add("progress-bar-inner")
		this.progressBar.appendChild(progressBarInner)
		promptContainer.appendChild(this.progressBar)

		this.promptArea = this._createPromptArea()
		
		const buttonContainer = new Block()
		buttonContainer.classList.add("button-container")
		
		const spacer = new Block()
		spacer.classList.add("spacer")

		this.summarizeButton = this._createSummarizeButton() // NEW: Summarize button
		this.submitButton = this._createSubmitButton()
		this.clearButton = this._createClearButton()

		// MODIFIED: Removed text/attribute setting here.
		// The content will be managed by _updateAIInfoDisplay().
		this.aiInfoDisplay = document.createElement("span");
		this.aiInfoDisplay.classList.add("ai-info-display");


		buttonContainer.append(this.clearButton)
		buttonContainer.append(this.summarizeButton) // NEW: Add summarize button
		buttonContainer.append(this.aiInfoDisplay); // Element is created, but content will be set by _updateAIInfoDisplay()
		buttonContainer.append(spacer)
		buttonContainer.append(this.submitButton)

		// Settings button remains last on the right
		const settingsButton = new Button()
		settingsButton.classList.add("settings-button")
		settingsButton.icon = "settings"
		settingsButton.on("click", () => this.toggleSettingsPanel())
		buttonContainer.append(settingsButton) // Append settings button to the right

		promptContainer.append(this.promptArea)
		promptContainer.append(buttonContainer)

		return promptContainer
	}

	_createPromptArea() {
		const promptArea = document.createElement("textarea")
		promptArea.classList.add("prompt-area")
		// NEW: Update placeholder based on AI configuration
		this._updatePromptAreaPlaceholder(promptArea);

		// MODIFIED: Moved the resize logic into a new method _resizePromptArea
		promptArea.addEventListener("keydown", (e) => {
			if (e.shiftKey && e.key === "Enter") {
				return
			}

			if (e.key === "Enter") {
				e.preventDefault()
				this.generate()
				return
			}
			if (e.ctrlKey && e.key === "ArrowUp") {
				e.preventDefault()
				if (this.prompts.length > 0) {
					this.promptIndex = Math.max(0, this.promptIndex - 1)
					this.promptArea.value = this.prompts[this.promptIndex]
					this._resizePromptArea() // Call the new method
				}
				return
			}
			if (e.ctrlKey && e.key === "ArrowDown") {
				e.preventDefault()
				if (this.prompts.length > 0) {
					this.promptIndex = Math.min(this.prompts.length - 1, this.promptIndex + 1)
					if (this.promptIndex === this.prompts.length) {
						this.promptArea.value = ""
					} else {
						this.promptArea.value = this.prompts[this.promptIndex]
					}
					this._resizePromptArea() // Call the new method
				}
				return
			}
		})
		promptArea.addEventListener("input", () => {
			this._resizePromptArea() // Call the new method
		})
		return promptArea
	}

	// NEW METHOD: Encapsulates prompt area resizing logic
	_resizePromptArea() {
		if (this.promptArea) {
			this.promptArea.style.minHeight = "auto" // Reset min-height to allow shrinking
			void this.promptArea.offsetHeight // Force reflow to get accurate scrollHeight
			this.promptArea.style.minHeight = Math.min(360, this.promptArea.scrollHeight) + "px"
		}
	}

    // NEW METHOD: Updates the prompt area placeholder text based on AI configuration
    _updatePromptAreaPlaceholder(promptArea = this.promptArea) {
        if (!promptArea) return;

        if (this.ai && this.ai.isConfigured()) {
            promptArea.placeholder = "Enter your prompt here...";
            promptArea.removeAttribute('disabled');
        } else {
            promptArea.placeholder = "AI is not configured. Go to Settings (gear icon) to set up a provider.";
            promptArea.setAttribute('disabled', 'true');
        }
    }

	// NEW: Manual Summarize Button
	_createSummarizeButton() {
		const summarizeButton = new Button("Summarize")
		summarizeButton.icon = "compress" // Using a suitable icon
		summarizeButton.classList.add("summarize-button", "theme-button")
		summarizeButton.on("click", () => this.historyManager.performSummarization())
		this._setButtonsDisabledState(this._isProcessing) // Initial state
		return summarizeButton
	}

	_createSubmitButton() {
		const submitButton = new Button("Send")
		submitButton.icon = "send"
		submitButton.classList.add("submit-button", "theme-button")
		submitButton.on("click", () => this.generate())
		this._setButtonsDisabledState(this._isProcessing) // Initial state
		return submitButton
	}

	_createClearButton() {
		const clearButton = new Button("Clear")
		clearButton.classList.add("clear-button")
		clearButton.on("click", () => {
			this.historyManager.clear()
		})
		this._setButtonsDisabledState(this._isProcessing) // Initial state
		return clearButton
	}

	// NEW: Helper to disable/enable relevant buttons
	_setButtonsDisabledState(disabled) {
        const isAIConfigured = this.ai && this.ai.isConfigured();

		if (this.submitButton) this.submitButton.disabled = disabled || !isAIConfigured;
		if (this.clearButton) this.clearButton.disabled = disabled; // Clear is always enabled
		
		// Also disable all history delete buttons while processing
		if(this.conversationArea) {
			this.conversationArea.querySelectorAll('.delete-history-button').forEach(btn => btn.disabled = disabled);
		}

		if (this.summarizeButton) {
			const eligibleMessages = this.historyManager.chatHistory.filter(
				(msg) => msg.type === "user" || msg.type === "model"
			)

			// NEW, more accurate condition:
			// Summarization is only possible if the number of messages we can potentially summarize
			// (i.e., total messages minus the ones we must preserve) is at least 2 (a user/model pair).
			const summarizableMessageCount = eligibleMessages.length - MAX_RECENT_MESSAGES_TO_PRESERVE
			const canSummarize = summarizableMessageCount >= 2 && isAIConfigured; // Must be configured to summarize

			this.summarizeButton.disabled = disabled || !canSummarize
		}
        this._updatePromptAreaPlaceholder(); // Update prompt area disabled state
	}

	_createSettingsPanel() {
		const settingsPanel = new Block()
		settingsPanel.classList.add("settings-panel")

		const form = document.createElement("form")
		this._settingsForm = form // Store reference to the form

		const workspaceSettingsCheckbox = document.createElement("input")
		workspaceSettingsCheckbox.type = "checkbox"
		workspaceSettingsCheckbox.id = "use-workspace-settings"
		workspaceSettingsCheckbox.checked = this.useWorkspaceSettings
		this._workspaceSettingsCheckbox = workspaceSettingsCheckbox // Store reference
		const workspaceSettingsLabel = document.createElement("label")
		workspaceSettingsLabel.htmlFor = "use-workspace-settings"
		workspaceSettingsLabel.textContent = "Use workspace-specific settings"
		workspaceSettingsLabel.prepend(workspaceSettingsCheckbox)
		form.appendChild(workspaceSettingsLabel)

		const toggleInputs = (disabled) => {
			const inputs = form.querySelectorAll("input:not(#use-workspace-settings), textarea, select")
			inputs.forEach((input) => {
				input.disabled = disabled
			})
		}

		workspaceSettingsCheckbox.addEventListener("change", () => {
			this.useWorkspaceSettings = workspaceSettingsCheckbox.checked
			toggleInputs(this.useWorkspaceSettings)
		})

		// Do NOT call renderSettingsForm() here. It will be called when the panel is shown.

		settingsPanel.appendChild(form)
		return settingsPanel
	}

	/**
	 * NEW: Private method to render the settings form content.
	 * This is called whenever the settings panel is made visible.
	 */
	async _renderSettingsForm() {
		const form = this._settingsForm;
		const workspaceSettingsCheckbox = this._workspaceSettingsCheckbox;
		const workspaceSettingsLabel = form.querySelector("label[for='use-workspace-settings']"); // Re-select label as its content will be cleared

		// Clear all form content except the workspace settings checkbox and its label
		form.innerHTML = '';
		form.appendChild(workspaceSettingsLabel);

		// Re-apply the disabled state based on the current checkbox state
		const toggleInputs = (disabled) => {
			const inputs = form.querySelectorAll("input:not(#use-workspace-settings), textarea, select");
			inputs.forEach((input) => {
				input.disabled = disabled;
			});
		};

		// Add AI Provider selection
		const aiProviderLabel = document.createElement("label")
		aiProviderLabel.textContent = `AI Provider: `
		const aiProviderSelect = document.createElement("select")
		aiProviderSelect.id = `ai-provider`
		const providerOptions = this._settingsSchema.aiProvider.enum
		providerOptions.forEach((optionValue) => {
			const option = document.createElement("option")
			option.value = optionValue
			option.textContent = optionValue.charAt(0).toUpperCase() + optionValue.slice(1)
			if (optionValue === this.aiProvider) {
				option.selected = true
			}
			aiProviderSelect.appendChild(option)
		})
		// MODIFIED: Changed listener to correctly update AI, add system message, and update UI display
		aiProviderSelect.addEventListener("change", async () => {
			const oldProviderName = this.aiProvider; // Store old provider name

			this.aiProvider = aiProviderSelect.value
			localStorage.setItem("aiProvider", this.aiProvider)

			// Create new AI instance, maintaining history for it.
			const newAIInstance = new this.aiProviders[this.aiProvider]();
			this.ai = newAIInstance;
			await this.ai.init(); // Initialize the new AI with its settings

			// --- NEW CODE: Add system message on provider switch ---
			// Check if the provider actually changed and we have a valid new AI instance
			if (oldProviderName !== this.aiProvider && this.ai) {
				// Add a system message to the history to inform the user about the AI provider change
				this.historyManager.addMessage({
					type: "system_message",
					content: `AI Provider switched to: **${this.aiProvider.charAt(0).toUpperCase() + this.aiProvider.slice(1)}**`,
					timestamp: Date.now()
				});
				// _dispatchContextUpdate is called within addMessage for system messages,
				// but we can also dispatch explicitly to ensure AI status UI is updated.
				this._dispatchContextUpdate("ai_provider_switched");
			}
			// --- END NEW CODE ---

			this._renderSettingsForm() // Re-render settings for the new provider
			this._updateAIInfoDisplay(); // NEW: Update the display element for the new AI/model
            this.historyManager.render(); // Re-render history to show/hide welcome message
		})
		aiProviderLabel.appendChild(aiProviderSelect)
		form.appendChild(aiProviderLabel)

		// NEW: Render summarization settings
		const summarizeThresholdSetting = this._settingsSchema.summarizeThreshold
		const summarizeThresholdLabel = document.createElement("label")
		summarizeThresholdLabel.textContent = `${summarizeThresholdSetting.label}: `
		const summarizeThresholdInput = document.createElement("input")
		summarizeThresholdInput.type = "number"
		summarizeThresholdInput.id = "summarizeThreshold"
		summarizeThresholdInput.min = "0"
		summarizeThresholdInput.max = "100"
		summarizeThresholdInput.value = this.config.summarizeThreshold
		summarizeThresholdLabel.appendChild(summarizeThresholdInput)
		form.appendChild(summarizeThresholdLabel)

		const summarizeTargetPercentageSetting = this._settingsSchema.summarizeTargetPercentage
		const summarizeTargetPercentageLabel = document.createElement("label")
		summarizeTargetPercentageLabel.textContent = `${summarizeTargetPercentageSetting.label}: `
		const summarizeTargetPercentageInput = document.createElement("input")
		summarizeTargetPercentageInput.type = "number"
		summarizeTargetPercentageInput.id = "summarizeTargetPercentage"
		summarizeTargetPercentageInput.min = "0"
		summarizeTargetPercentageInput.max = "100"
		summarizeTargetPercentageInput.value = this.config.summarizeTargetPercentage
		summarizeTargetPercentageLabel.appendChild(summarizeTargetPercentageInput)
		form.appendChild(summarizeTargetPercentageLabel)
		// END NEW

		// Render AI-specific settings
		const options = await this.ai.getOptions()
		for (const key in options) {
			const setting = options[key]
			const label = document.createElement("label")
			label.textContent = `${setting.label}: `

			let inputElement
			if (setting.type === "enum") {
				inputElement = document.createElement("select")
				inputElement.id = `${this.aiProvider}-${key}`
				const currentEnumOptions = setting.enum || []
				currentEnumOptions.forEach((optionObj) => {
					const option = document.createElement("option")
					option.value = optionObj.value
					option.textContent = optionObj.label || optionObj.value
					if (optionObj.value === setting.value) {
						option.selected = true
					}
					inputElement.appendChild(option)
				})
				if (key === "model") {
					const refreshButton = new Button()
					refreshButton.icon = "refresh"
					refreshButton.classList.add("theme-button")
					refreshButton.on("click", async () => {
						this._setButtonsDisabledState(true)
						try {
							await this.ai.refreshModels()
							this._renderSettingsForm() // Re-render to show updated model list
							this._updateAIInfoDisplay(); // Update display after refresh
							this._dispatchContextUpdate("settings_change")
                            this.historyManager.render(); // Re-render history to show/hide welcome message
						} finally {
							this._setButtonsDisabledState(false)
						}
					})
					label.appendChild(refreshButton)
				}
			} else if (setting.multiline) {
				inputElement = document.createElement("textarea")
				inputElement.id = `${this.aiProvider}-${key}`
				inputElement.value = setting.value
			} else if (setting.type === "string") {
				inputElement = document.createElement("input")
				inputElement.type = "text"
				inputElement.id = `${this.aiProvider}-${key}`
				inputElement.value = setting.value
			} else if (setting.type === "number") {
				inputElement = document.createElement("input")
				inputElement.type = "number"
				inputElement.id = `${this.aiProvider}-${key}`
				inputElement.value = setting.value
			} else {
				inputElement = document.createElement("input")
				inputElement.type = setting.type
				inputElement.id = `${this.aiProvider}-${key}`
				inputElement.value = setting.value
			}
			if (setting.secret) {
				inputElement.type = "password"
			}
			label.appendChild(inputElement)
			form.appendChild(label)
		}

		toggleInputs(this.useWorkspaceSettings) // Apply initial disabled state based on checkbox

		const saveButton = new Button("Save Settings")
		saveButton.icon = "save"
		saveButton.classList.add("theme-button")
		saveButton.on("click", async () => {
			const newSettings = {}
			const currentOptions = await this.ai.getOptions()
			for (const key in currentOptions) {
				const input = form.querySelector(`#${this.aiProvider}-${key}`)
				if (input) {
					newSettings[key] = input.value
				}
			}
			// NEW: Read new summarization settings
			this.config.summarizeThreshold = parseInt(form.querySelector("#summarizeThreshold").value)
			this.config.summarizeTargetPercentage = parseInt(form.querySelector("#summarizeTargetPercentage").value)
			localStorage.setItem("summarizeThreshold", this.config.summarizeThreshold)
			localStorage.setItem("summarizeTargetPercentage", this.config.summarizeTargetPercentage)

			// MODIFIED: Pass `this.ai.settingsSource` to setOptions if it's available and relevant
			this.ai.setOptions(
				newSettings,
				(errorMessage) => {
					const errorBlock = new Block()
					errorBlock.classList.add("response-block")
					errorBlock.innerHTML = `Error: ${errorMessage}`
					this.conversationArea.append(errorBlock)
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight
					this._dispatchContextUpdate("settings_save_error")
				},
				(successMessage) => {
					const successBlock = new Block()
					successBlock.classList.add("response-block")
					successBlock.innerHTML = successMessage
					this.conversationArea.append(successBlock)
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight
					this._dispatchContextUpdate("settings_save_success")
				},
				this.useWorkspaceSettings,
				this.ai.settingsSource // Pass source for correct persistence
			)
			this.toggleSettingsPanel() // Hide settings panel after saving
		})
		form.appendChild(saveButton)
	}


	toggleSettingsPanel() {
		this.conversationArea.classList.toggle("hidden")
		this.settingsPanel.classList.toggle("active")
		// If settings panel is being hidden, re-render chat history to refresh any potential content/token changes
		if (!this.settingsPanel.classList.contains("active")) {
			this.historyManager.render() // Re-render history to show/hide welcome message
			this._dispatchContextUpdate("settings_closed") // NEW: Dispatch on settings panel close
		} else {
			// NEW: If settings panel is being shown, re-render its content to reflect current values
			this._renderSettingsForm()
			this._updateAIInfoDisplay(); // NEW: Ensure display is updated when panel opens
			this._dispatchContextUpdate("settings_opened") // NEW: Dispatch on settings panel open
		}
	}

	// NEW: Helper method to update progress bar color based on percentage
	_updateProgressBarColor(progressBarInner, percentage) {
		// Remove all color classes first
		progressBarInner.classList.remove("threshold-yellow", "threshold-orange", "threshold-red")

		if (percentage >= 90) {
			progressBarInner.classList.add("threshold-red")
		} else if (percentage >= 80) {
			progressBarInner.classList.add("threshold-orange")
		} else if (percentage >= 66) {
			progressBarInner.classList.add("threshold-yellow")
		}
		// If percentage is below 66, no specific color class is added,
		// and it will default to the original --theme color defined in CSS.
	}

	/**
	 * NEW (FIX): Centralized method to update context-sensitive UI elements like the progress bar and AI info display.
	 * This is now called directly by _dispatchContextUpdate.
	 * @param {object} detail - The event detail object from _dispatchContextUpdate.
	 */
	_updateContextUI(detail) {
		// Update Progress Bar
		if (this.progressBar && this.ai) {
			const { estimatedTokensFullHistory, maxContextTokens } = detail
			const progressBarInner = this.progressBar.querySelector(".progress-bar-inner")

            // Only show progress bar if AI is configured, otherwise hide or set to 0
            if (this.ai.isConfigured() && maxContextTokens > 0) {
                this.progressBar.style.display = "block";
                const percentage = Math.min(100, (estimatedTokensFullHistory / maxContextTokens) * 100)
                progressBarInner.style.width = `${percentage}%`
                this.progressBar.setAttribute(
                    "title",
                    `Context: ${estimatedTokensFullHistory} / ${maxContextTokens} tokens (${Math.round(percentage)}%)`
                )
                this._updateProgressBarColor(progressBarInner, percentage)
            } else {
                this.progressBar.style.display = "none"; // Hide progress bar if not configured
                progressBarInner.style.width = "0%";
                this.progressBar.setAttribute("title", `AI not configured or max tokens unknown.`);
                this._updateProgressBarColor(progressBarInner, 0); // Reset color
            }
		}
		// Update AI Info Display (This is called by _updateAIInfoDisplay() directly, not here)
	}

	// NEW: Method to update the AI info display element
	_updateAIInfoDisplay() {
		if (this.aiInfoDisplay && this.ai) {
            if (this.ai.isConfigured()) {
                const providerName = this.aiProvider;
                const modelName = this.ai.config?.model || "Unknown Model"; // Fallback
                this.aiInfoDisplay.textContent = `AI: ${modelName}`;
                this.aiInfoDisplay.setAttribute("title", `AI Provider: ${providerName}, Model: ${modelName}`);
            } else {
                this.aiInfoDisplay.textContent = `AI: Not Configured`;
                this.aiInfoDisplay.setAttribute("title", `AI Provider: ${this.aiProvider}, Status: Not Configured. Go to Settings.`);
            }
		} else if (this.aiInfoDisplay) {
			// Fallback if ai hasn't been initialized yet or something went wrong
            this.aiInfoDisplay.textContent = `AI: Loading...`;
            this.aiInfoDisplay.setAttribute("title", `AI Provider: ${this.aiProvider}, Status: Loading or Error.`);
		}
	}

	// ADDITION: Handler for 'setting-changed' events dispatched by AI provider instances
	_handleSettingChangedExternally(event) {
		// This event is fired by AI providers when their internal config changes,
		// e.g., when main.mjs applies appConfig/workspaceConfig to the AI instance.
		// We need to re-render the AI info display to reflect the new model.
		this._updateAIInfoDisplay();
		// Also ensure context update is dispatched to refresh progress bar etc.,
		// as model change can affect MAX_CONTEXT_TOKENS.
		this._dispatchContextUpdate("settings_change_external");
        this.historyManager.render(); // Re-render history to show/hide welcome message
	}


	/**
	 * Dispatches a custom 'context-update' event with the current chat state.
	 * @param {string} type - The type of update (e.g., 'append_user', 'summarize', 'clear', 'settings_change').
	 * @param {object} [details={}] - Additional details relevant to the update type (e.g., summaryDetails).
	 */
	_dispatchContextUpdate(type, details = {}) {
		// Ensure ai and historyManager are available before proceeding
		if (!this.ai || !this.historyManager) {
			console.warn("Attempted to dispatch context update before AI or History Manager was ready.");
			return;
		}

		// Only calculate tokens if AI is configured, otherwise they are irrelevant
		const estimatedTokensFullHistory = this.ai.isConfigured() ? this.ai.estimateTokens(this.historyManager.chatHistory) : 0;
		const maxContextTokens = this.ai.isConfigured() ? this.ai.MAX_CONTEXT_TOKENS : 0;

		const eventDetail = {
			chatHistory: JSON.parse(JSON.stringify(this.historyManager.chatHistory)), // Deep copy for immutability
			aiProvider: this.aiProvider,
			runMode: "chat", // Always chat mode now
			estimatedTokensFullHistory: estimatedTokensFullHistory,
			maxContextTokens: maxContextTokens,
			type: type,
			...details,
		}

		// FIX: Directly update the AIManager's own UI (progress bar) before dispatching the event for external listeners.
		this._updateContextUI(eventDetail);
		// Also update button states, as context changes can affect summarization eligibility.
		this._setButtonsDisabledState(this._isProcessing);

		// MODIFIED: Added setTimeout for scrolling to bottom after UI updates
		// removed autoscroll after ui update, it's jarring AF when deleting old items.
		// if (this.conversationArea && !this.settingsPanel?.classList.contains("active")) {
		// 	setTimeout(() => {
		// 		this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
		// 	}, 0);
		// }

		this.panel.dispatchEvent(new CustomEvent("context-update", { detail: eventDetail }))
	}

	async generate() {
		if (this._isProcessing) {
			// NEW: Prevent multiple concurrent AI requests
			console.warn("AI is currently processing another request. Please wait.")
			return
		}
        // NEW: Check if AI is configured before proceeding with generation
        if (!this.ai || !this.ai.isConfigured()) {
            console.warn("AI is not configured. Cannot generate response.");
            this.historyManager.addMessage({
                type: "system_message",
                content: `AI is not configured. Please set up your AI provider in the settings.`,
                timestamp: Date.now(),
            });
            this._dispatchContextUpdate("generation_error_not_configured"); // Dispatch error type
            this._isProcessing = false; // Release lock
            this._setButtonsDisabledState(false); // Re-enable buttons
            return;
        }

		this._isProcessing = true
		this._setButtonsDisabledState(true) // Disable buttons immediately

		const userPrompt = this.promptArea.value.trim()

		if (!userPrompt) {
			this._isProcessing = false // NEW: Release lock if no prompt
			this._setButtonsDisabledState(false)
			return
		}

		const lastPrompt = this.prompts.length > 0 ? this.prompts[this.prompts.length - 1].trim() : null

		if (lastPrompt && lastPrompt === userPrompt) {
			console.log("Skipping adding duplicate contiguous prompt to history.")
			this.promptIndex = this.prompts.length
		} else {
			this.prompts.push(userPrompt)

			while (this.prompts.length > MAX_PROMPT_HISTORY) {
				this.prompts.shift()
				if (this.promptIndex > 0) {
					this.promptIndex--
				}
			}

			this.promptIndex = this.prompts.length
		}

		// MODIFIED: Reset the promptArea height after submitting the prompt
		this.promptArea.value = ""
		this._resizePromptArea(); // Call the new resize method after clearing the value

		this.panel.dispatchEvent(new CustomEvent("new-prompt", { detail: this.prompts }))

		// NEW: Check for automatic summarization before processing the new prompt
		const estimatedTokensBeforeNewPrompt = this.ai.estimateTokens(this.historyManager.chatHistory)
		const maxContextTokens = this.ai.MAX_CONTEXT_TOKENS
		if (
			maxContextTokens > 0 &&
			(estimatedTokensBeforeNewPrompt / maxContextTokens) * 100 >= this.config.summarizeThreshold
		) {
			console.log(
				`Context at ${Math.round(
					(estimatedTokensBeforeNewPrompt / maxContextTokens) * 100
				)}%, triggering summarization.`
			)
			await this.historyManager.performSummarization() // Await summarization before continuing
		}

		// Step 1: Process prompt for @ tags, always using "chat" logic now.
		const { processedPrompt, contextItems } = await this.ai._getContextualPrompt(userPrompt, "chat")

		// Step 2: Update internal chatHistory (AIManager is source of truth)
		// Add new context files to history
		contextItems.forEach((item) => this.historyManager.addContextFile(item))
		// Add the user's processed prompt to history
		this.historyManager.addMessage({ role: "user", type: "user", content: processedPrompt, timestamp: Date.now() })

		// Render updated history in UI and dispatch event
		this.historyManager.render()
		this._dispatchContextUpdate("append_user")

		// Prepare placeholder for AI response and spinner
		const responseBlock = new Block()
		responseBlock.classList.add("response-block")
		this.conversationArea.append(responseBlock)

		const spinner = new Block()
		spinner.classList.add("spinner")
		this.conversationArea.append(spinner)

		this.conversationArea.scrollTop = this.conversationArea.scrollHeight

		this.userScrolled = false
		const scrollHandler = () => {
			const { scrollTop, clientHeight, scrollHeight } = this.conversationArea
			const isAtBottom = scrollTop + clientHeight >= scrollHeight - 32
			this.userScrolled = !isAtBottom
		}
		this.conversationArea.addEventListener("scroll", scrollHandler)

		const callbacks = {
			onUpdate: (fullResponse) => {
				responseBlock.innerHTML = this.md.render(fullResponse)
				// Ensure code block buttons are added even during update if content changes (e.g. for long streaming responses)
				// though usually they're added once onDone. For this scenario, we might need a debounce or smarter check.
				// For now, let's keep it simple and assume onDone is where final buttons are applied.
				if (!this.userScrolled) {
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight
				}
			},
			onDone: (fullResponse, contextRatioPercent) => {
				this._addCodeBlockButtons(responseBlock) // Add buttons after final response is rendered

				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

				// Add AI response to chatHistory for persistence
				this.historyManager.addMessage({
					role: "model",
					type: "model",
					content: fullResponse,
					timestamp: Date.now(),
				})
				this._dispatchContextUpdate("append_model") // NEW: Dispatch after model response

				this._isProcessing = false // NEW: Release lock
				this._setButtonsDisabledState(false) // NEW: Re-enable buttons
			},
			onError: (error) => {
				responseBlock.innerHTML = `Error: ${error.message}`
				console.error(`Error calling ${this.ai.config.model} API:`, error)
				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

				// Optional: Add error message to chatHistory if you want it persistent
				this.historyManager.addMessage({
					role: "error",
					type: "error",
					content: `Error: ${error.message}`,
					timestamp: Date.now(),
				})
				this._dispatchContextUpdate("append_error") // NEW: Dispatch after error

				this._isProcessing = false // NEW: Release lock
				this._setButtonsDisabledState(false) // NEW: Re-enable buttons
			},
			onContextRatioUpdate: (ratio) => {
				// This callback is now redundant.
				// The progress bar will be updated whenever the context changes via _dispatchContextUpdate.
				// We can keep it here for compatibility if AI providers still call it, but it does nothing.
			},
		}

		// Always use the chat method.
		const messagesForAI = this.historyManager.prepareMessagesForAI()
		this.ai.chat(messagesForAI, callbacks)
	}

	_addCodeBlockButtons(responseBlock) {
		const preElements = responseBlock.querySelectorAll("pre")
		preElements.forEach((pre) => {
			const buttonContainer = new Block()
			buttonContainer.classList.add("code-buttons")

			const copyButton = new Button()
			copyButton.classList.add("code-button")
			copyButton.icon = "content_copy"
			copyButton.title = "Copy code"
			copyButton.on("click", () => {
				const code = pre.querySelector("code").innerText
				navigator.clipboard.writeText(code)
				copyButton.icon = "done"
				setTimeout(() => {
					copyButton.icon = "content_copy"
				}, 1000)
			})

			const insertButton = new Button()
			insertButton.classList.add("code-button")
			insertButton.icon = "input"
			insertButton.title = "Insert into editor"
			insertButton.on("click", () => {
				const code = pre.querySelector("code").innerText
				const event = new CustomEvent("insert-snippet", { detail: code })
				window.dispatchEvent(event)
				insertButton.icon = "done"
				setTimeout(() => {
					insertButton.icon = "input"
				}, 1000)
			})

            // NEW: Expand/Collapse button
            const expandCollapseButton = new Button();
            expandCollapseButton.classList.add("code-button", "expand-collapse-button");
            // Set initial state based on whether 'expanded' attribute is present (it won't be initially)
            const isExpanded = pre.hasAttribute("expanded");
            expandCollapseButton.icon = isExpanded ? "unfold_less" : "unfold_more";
            expandCollapseButton.title = isExpanded ? "Collapse code block" : "Expand code block";

            expandCollapseButton.on("click", () => {
                const currentlyExpanded = pre.hasAttribute("expanded");
                if (currentlyExpanded) {
                    pre.removeAttribute("expanded");
                    expandCollapseButton.icon = "unfold_more";
                    expandCollapseButton.title = "Collapse code block";
                } else {
                    pre.setAttribute("expanded", ""); // Set attribute without value
                    expandCollapseButton.icon = "unfold_less";
                    expandilmesi.title = "Collapse code block";
                }
            });


			buttonContainer.append(insertButton)
			buttonContainer.append(copyButton)
            buttonContainer.append(expandCollapseButton) // Append the new button
			pre.prepend(buttonContainer)
		})
	}

	set promptHistory(history) {
		this.prompts = history
		this.promptIndex = history.length
	}

	get promptHistory() {
		return this.prompts
	}

	async loadSettings() {
		const storedProvider = localStorage.getItem("aiProvider")
		if (storedProvider && this.aiProviders[storedProvider]) {
			this.aiProvider = storedProvider
		}
		// NEW: Load summarization settings
		const storedSummarizeThreshold = localStorage.getItem("summarizeThreshold")
		if (storedSummarizeThreshold !== null) {
			this.config.summarizeThreshold = parseInt(storedSummarizeThreshold)
		}
		const storedSummarizeTargetPercentage = localStorage.getItem("summarizeTargetPercentage")
		if (storedSummarizeTargetPercentage !== null) {
			this.config.summarizeTargetPercentage = parseInt(storedSummarizeTargetPercentage)
		}
	}
}

export default new AIManager()
