// ai-manager.mjs
// Styles for this module are located in css/ai-manager.css
import { Block, Button, Icon, TabBar, TabItem } from "./elements.mjs" // Added TabBar, TabItem
import Ollama from "./ai-ollama.mjs" 
import Gemini from "./ai-gemini.mjs"
import AIManagerHistory, { MAX_RECENT_MESSAGES_TO_PRESERVE } from "./ai-manager-history.mjs"
import { get, set, del } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm"
import DiffHandler from "./tools/diff-handler.mjs" // Import DiffHandler

const MAX_PROMPT_HISTORY = 50 // This is now PER-SESSION

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
			// Summarization settings
			summarizeThreshold: { type: "number", label: "Summarize History When Context Reaches (%)", default: 85 },
			summarizeTargetPercentage: { type: "number", label: "Percentage of Old History to Summarize", default: 50 },
		}

		this.historyManager = new AIManagerHistory(this)
		

		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit()
		this.settingsPanel = null
		this.contextStaleNotice = null; // New element for context currency check
		this._contextStaleResolve = null; // To resolve/reject the context stale promise
		this._settingsForm = null // Reference to the settings form element
		this._workspaceSettingsCheckbox = null // Reference to the checkbox
		this.useWorkspaceSettings = false
		this.userScrolled = false
		this._isProcessing = false // Flag to track if AI is busy (generating or summarizing)

		// Reference to the AI info display element
		this.aiInfoDisplay = null;

		// Load summarization settings defaults
		this.config = {
			summarizeThreshold: this._settingsSchema.summarizeThreshold.default,
			summarizeTargetPercentage: this._settingsSchema.summarizeTargetPercentage.default,
		}

		// NEW: Session Management Properties
		this.allSessionMetadata = []; // Array of {id, name, createdAt, lastModified} - used for UI list
		this.activeSessionId = null; // ID of the currently active session
		this.activeSession = null; // The full active session object {id, name, messages, promptInput, promptHistory}
		this.promptIndex = -1; // Index for the current session's prompt history (Ctrl+Up/Down)

		// NEW: Session TabBar properties
		this.sessionTabBar = null;
		this.newSessionButton = null;

		this.saveWorkspaceTimeout = null; // For debouncing workspace saves from _dispatchContextUpdate
	}

	async init(panel) {
		this.panel = panel
		await this.loadSettings()
		
		// Initialize the AI provider instance
		this.ai = new this.aiProviders[this.aiProvider]();
		await this.ai.init(); // Initialize with loaded settings

		// Load summarization settings from storage, overriding defaults
		const storedSummarizeThreshold = localStorage.getItem("summarizeThreshold")
		if (storedSummarizeThreshold !== null) {
			this.config.summarizeThreshold = parseInt(storedSummarizeThreshold);
		}
		const storedSummarizeTargetPercentage = localStorage.getItem("summarizeTargetPercentage")
		if (storedSummarizeTargetPercentage !== null) {
			this.config.summarizeTargetPercentage = parseInt(storedSummarizeTargetPercentage);
		}

		this._createUI();
		this._setupPanel();
		
		this._updateAIInfoDisplay();
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
		// --- Session TabBar UI ---
		// const sessionTabContainer = new Block();
		// sessionTabContainer.classList.add('ai-session-tab-container');

		this.sessionTabBar = new TabBar();
		this.sessionTabBar.setAttribute('slim', '');
		this.sessionTabBar.classList.add('tabs-inverted');
		this.sessionTabBar.exclusiveDropType = "ai-tab"

		// This is the core of the new logic. The TabBar handles the UI change,
		// and we just handle the data change in response.
		this.sessionTabBar.click = (e) => this.switchSession(e.tab.config.id);
		this.sessionTabBar.close = (e) => this.deleteSession(e.tab.config.id, e.tab);

		this.newSessionButton = new Button("");
		this.newSessionButton.icon = "add_comment";
		this.newSessionButton.title = "New Chat";
		this.newSessionButton.classList.add('new-session-button');
		this.newSessionButton.on('click', () => this.createNewSession());
		
		this.sessionTabBar.append(this.newSessionButton)
		// sessionTabContainer.append(this.sessionTabBar);

		// --- Other UI Elements ---
		this.conversationArea = this._createConversationArea();
		const promptContainer = this._createPromptContainer();
		this.settingsPanel = this._createSettingsPanel();

		this.panel.append(this.conversationArea, this.settingsPanel, this.sessionTabBar, promptContainer);
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
		buttonContainer.classList.add("button-container");

		// NEW: Context Stale Notice Bar
		this.contextStaleNotice = this._createContextStaleNotice();

		const spacer = new Block()
		spacer.classList.add("spacer")

		this.summarizeButton = this._createSummarizeButton() // Summarize button
		this.submitButton = this._createSubmitButton()
		this.clearButton = this._createClearButton()

		this.aiInfoDisplay = document.createElement("span");
		this.aiInfoDisplay.classList.add("ai-info-display");


		buttonContainer.append(this.clearButton)
		buttonContainer.append(this.summarizeButton) // Add summarize button
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
		promptContainer.append(this.contextStaleNotice); // Add the new notice bar here
		promptContainer.append(buttonContainer)

		return promptContainer
	}

	_createPromptArea() {
		const promptArea = document.createElement("textarea")
		promptArea.classList.add("prompt-area")
		// Update placeholder based on AI configuration
		this._updatePromptAreaPlaceholder(promptArea);

		// Moved the resize logic into a new method _resizePromptArea
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
				// Use active session's prompt history
				if (this.activeSession?.promptHistory && this.activeSession.promptHistory.length > 0) {
					this.promptIndex = Math.max(0, this.promptIndex - 1)
					this.promptArea.value = this.activeSession.promptHistory[this.promptIndex]
					this._resizePromptArea()
				}
				return
			}
			if (e.ctrlKey && e.key === "ArrowDown") {
				e.preventDefault()
				// Use active session's prompt history
				if (this.activeSession?.promptHistory && this.activeSession.promptHistory.length > 0) {
					this.promptIndex = Math.min(this.activeSession.promptHistory.length, this.promptIndex + 1) // Allow going one past history for empty
					if (this.promptIndex === this.activeSession.promptHistory.length) {
						this.promptArea.value = ""
					} else {
						this.promptArea.value = this.activeSession.promptHistory[this.promptIndex]
					}
					this._resizePromptArea()
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

	// Manual Summarize Button
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

	/**
	 * NEW METHOD: Creates the UI element for displaying context currency warnings.
	 */
	_createContextStaleNotice() {
		const noticeBar = document.createElement("div");
		noticeBar.classList.add("notice-bar", "context-stale-notice");
		noticeBar.style.display = "none"; // Hidden by default
		noticeBar.innerHTML = `
			<span class="message">Some files in the chat context have changed or are no longer available.</span>
			<button class="update-button">Update Context</button>
			<button class="keep-old-button">Keep Old</button>
		`;

		noticeBar.querySelector(".update-button").addEventListener("click", () => {
			if (this._contextStaleResolve) {
				this._contextStaleResolve(true); // User chose to update
				this._hideContextStaleNotice();
			}
		});

		noticeBar.querySelector(".keep-old-button").addEventListener("click", () => {
			if (this._contextStaleResolve) {
				this._contextStaleResolve(false); // User chose to keep old
				this._hideContextStaleNotice();
			}
		});
		return noticeBar;
	}

	_showContextStaleNotice(message) {
		this.contextStaleNotice.querySelector(".message").textContent = message;
		this.contextStaleNotice.style.display = "flex";
	}
	_hideContextStaleNotice() { this.contextStaleNotice.style.display = "none"; }

	// Helper to disable/enable relevant buttons
	_setButtonsDisabledState(disabled) {
        const isAIConfigured = this.ai && this.ai.isConfigured();

		if (this.submitButton) this.submitButton.disabled = disabled || !isAIConfigured;
		if (this.clearButton) this.clearButton.disabled = disabled || !this.activeSession?.messages?.length; // Clear is disabled if no messages
		
		// Also disable all history delete buttons while processing
		if(this.conversationArea) {
			this.conversationArea.querySelectorAll('.delete-history-button').forEach(btn => btn.disabled = disabled);
		}

		if (this.summarizeButton) {
			// Check activeSession exists before accessing its messages
			const eligibleMessages = this.activeSession?.messages?.filter(
				(msg) => msg.type === "user" || msg.type === "model"
			) || []; // Default to empty array if no active session or messages

			// NEW, more accurate condition:
			// Summarization is only possible if the number of messages we can potentially summarize
			// (i.e., total messages minus the ones we must preserve) is at least 2 (a user/model pair).
			const summarizableMessageCount = eligibleMessages.length - MAX_RECENT_MESSAGES_TO_PRESERVE
			const canSummarize = summarizableMessageCount >= 2 && isAIConfigured; // Must be configured to summarize

			this.summarizeButton.disabled = disabled || !canSummarize
		}

		// Disable session management buttons while processing
		if (this.newSessionButton) this.newSessionButton.disabled = disabled;
		if (this.sessionTabBar) {
			this.sessionTabBar.querySelectorAll('ui-tab-item').forEach(tab => {
				tab.close.style.pointerEvents = disabled ? 'none' : 'auto';
				tab.style.pointerEvents = disabled ? 'none' : 'auto';
			});
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

		settingsPanel.appendChild(form)
		return settingsPanel
	}

	/**
	 * Private method to render the settings form content.
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
		// Changed listener to correctly update AI, add system message, and update UI display
		aiProviderSelect.addEventListener("change", async () => {
			const oldProviderName = this.aiProvider; // Store old provider name

			this.aiProvider = aiProviderSelect.value
			localStorage.setItem("aiProvider", this.aiProvider)

			// Create new AI instance, maintaining history for it.
			const newAIInstance = new this.aiProviders[this.aiProvider]();
			this.ai = newAIInstance;
			await this.ai.init(); // Initialize the new AI with its settings

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
			this._renderSettingsForm() // Re-render settings for the new provider
			this._updateAIInfoDisplay(); // Update the display element for the new AI/model
            this.historyManager.render(); // Re-render history to show/hide welcome message
		})
		aiProviderLabel.appendChild(aiProviderSelect)
		form.appendChild(aiProviderLabel)

		// Render summarization settings
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
			// Read new summarization settings
			this.config.summarizeThreshold = parseInt(form.querySelector("#summarizeThreshold").value)
			this.config.summarizeTargetPercentage = parseInt(form.querySelector("#summarizeTargetPercentage").value)
			localStorage.setItem("summarizeThreshold", this.config.summarizeThreshold)
			localStorage.setItem("summarizeTargetPercentage", this.config.summarizeTargetPercentage)

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
			this._dispatchContextUpdate("settings_closed") // Dispatch on settings panel close
		} else {
			// If settings panel is being shown, re-render its content to reflect current values
			this._renderSettingsForm()
			this._updateAIInfoDisplay(); // Ensure display is updated when panel opens
			this._dispatchContextUpdate("settings_opened") // Dispatch on settings panel open
		}
	}

	// Helper method to update progress bar color based on percentage
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
	 * Centralized method to update context-sensitive UI elements like the progress bar and AI info display.
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
		// AI Info Display is updated by _updateAIInfoDisplay() directly.
	}

	// Method to update the AI info display element
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

	// Handler for 'setting-changed' events dispatched by AI provider instances
	_handleSettingChangedExternally(event) {
		this._updateAIInfoDisplay();
		this._dispatchContextUpdate("settings_change_external");
        this.historyManager.render(); // Re-render history to show/hide welcome message
	}

	/**
	 * Manages initial session loading, populates the UI, and activates the correct session.
	 */
	async loadSessions(aiSessionsMetadata = [], activeSessionId = null) {
		this.allSessionMetadata = aiSessionsMetadata;
		
		// 1. Create the tab UI elements from the metadata.
		this._populateInitialTabs();

		let idToActivate = activeSessionId;

		// 2. Determine which session to activate.
		// If the intended active session doesn't exist in the metadata, fall back to the most recent.
		if (!this.allSessionMetadata.some(s => s.id === idToActivate)) {
			const sortedSessions = [...this.allSessionMetadata].sort((a, b) => b.lastModified - a.lastModified);
			idToActivate = sortedSessions.length > 0 ? sortedSessions[0].id : null;
		}

		// 3. Activate the chosen session or create a new one.
		if (idToActivate) {
			const tabToActivate = this.sessionTabBar.tabs.find(t => t.config.id === idToActivate);
			if (tabToActivate) {
				// Clicking the tab programmatically triggers the whole cascade correctly:
				// TabBar sets its active state -> our click handler calls switchSession -> data loads.
				tabToActivate.click(); 
			}
		} else {
			// If no sessions exist at all, create one.
			await this.createNewSession();
		}
	}

    /**
     * Populates the TabBar with tabs from the metadata.
     * This is only for the initial setup.
     */
    _populateInitialTabs() {
        const sortedSessions = [...this.allSessionMetadata].sort((a, b) => b.lastModified - a.lastModified);
        sortedSessions.forEach(meta => {
            const tab = this.sessionTabBar.add({ name: meta.name, id: meta.id });
            tab.on('dblclick', () => this.renameCurrentSession());
        });
    }

	/**
	 * Creates a new session, adds its tab to the UI, and activates it by simulating a click.
	 */
	async createNewSession() {
		const newId = `ai-session-${crypto.randomUUID()}`;
		const newName = `Chat ${this.allSessionMetadata.length + 1}`;
		const newSessionData = { // Initialize with scrollTop 0 for new sessions
			id: newId, name: newName, createdAt: Date.now(), lastModified: Date.now(),
			messages: [], promptInput: "", promptHistory: [], scrollTop: 0,
		};

		await set(`ai-session-${newId}`, newSessionData);
		this.allSessionMetadata.push({ id: newId, name: newName, createdAt: newSessionData.createdAt, lastModified: newSessionData.lastModified });

		// Add the tab to the UI.
        const newTab = this.sessionTabBar.add({ name: newName, id: newId });
        newTab.on('dblclick', () => this.renameCurrentSession());

        // Activate it using the component's own mechanism.
        newTab.click();
	}

	/**
	 * SIMPLIFIED: Switches session DATA. The UI state is already handled by the TabBar component.
	 */
	async switchSession(sessionId) {
		// If we are already on this session, do nothing.
		// The TabBar might fire a click on an already-active tab.
		if (this.activeSessionId === sessionId) return;

		// Save the state of the *current* active session (if any)
		if (this.activeSession && this.activeSession.id) {
			this.activeSession.promptInput = this.promptArea.value;
			this.activeSession.scrollTop = this.conversationArea.scrollTop; // Save current scroll position
			const currentSessionMeta = this.allSessionMetadata.find(s => s.id === this.activeSession.id);
			if (currentSessionMeta) currentSessionMeta.lastModified = Date.now();
			await set(`ai-session-${this.activeSession.id}`, this.activeSession);
		}

		// Load the new session's data
		const newSessionData = await get(`ai-session-${sessionId}`);
		if (!newSessionData) {
			// This is a recovery case. The tab exists but data is gone.
			console.error(`Data for session ID ${sessionId} not found!`);
			const staleTab = this.sessionTabBar.tabs.find(t => t.config.id === sessionId);
			if(staleTab) this.deleteSession(sessionId, staleTab); // Trigger a proper delete.
			return; // Abort this switch.
		}

		// Update manager's state
		this.activeSession = newSessionData;
		this.activeSessionId = sessionId;
		
		// Update the rest of the UI based on the new data
		// Do NOT auto-scroll to bottom. Instead, restore saved scroll position.
		this.historyManager.loadSessionMessages(this.activeSession.messages, false); 
		// Restore scroll position after content has been rendered
		// A small timeout ensures the DOM has updated before setting scroll.
		setTimeout(() => { this.conversationArea.scrollTop = this.activeSession.scrollTop || 0; }, 0); 
		this.promptArea.value = this.activeSession.promptInput || "";
		this.promptIndex = (this.activeSession.promptHistory?.length || 0);
		this._resizePromptArea();
        this._setButtonsDisabledState(this._isProcessing);
		this._dispatchContextUpdate("session_switched");
	}

	/**
	 * Deletes a session and tells the TabBar to remove its UI tab.
	 * The TabBar will then automatically activate another tab, triggering our switchSession handler.
	 */
	async deleteSession(sessionId, tab) {
		if (this.allSessionMetadata.length <= 1) {
			alert("Cannot delete the last remaining chat session.");
			return;
		}

		const sessionMeta = this.allSessionMetadata.find(s => s.id === sessionId);
        // Find the full session data to check its message count
        const fullSessionData = await get(`ai-session-${sessionId}`);

        // Only ask for confirmation if the session has a history AND it's not the only session left
        if (fullSessionData?.messages?.length > 0) {
            if (!confirm(`Are you sure you want to delete the chat "${sessionMeta.name}"? This chat has history.`)) {
                return;
            }
        }
		
		// Delete data
		await del(`ai-session-${sessionId}`);
		this.allSessionMetadata = this.allSessionMetadata.filter(s => s.id !== sessionId);

		// Remove UI element. The TabBar component handles activating the next tab and firing its click event.
		this.sessionTabBar.remove(tab);
		
		this._dispatchContextUpdate("session_deleted");
	}

	/**
	 * Renames the current session and updates the specific tab's text via its property.
	 */
	async renameCurrentSession() {
		if (!this.activeSession) return;
		const newName = prompt("Enter new chat name:", this.activeSession.name);

		if (newName && newName.trim() !== "") {
            const trimmedName = newName.trim();
			
			// Update data
			this.activeSession.name = trimmedName;
			const meta = this.allSessionMetadata.find(s => s.id === this.activeSession.id);
			if (meta) {
				meta.name = trimmedName;
				meta.lastModified = Date.now();
			}
			await set(`ai-session-${this.activeSession.id}`, this.activeSession);

            // Update the UI via the component's API
            const tabToRename = this.sessionTabBar.tabs.find(t => t.config.id === this.activeSessionId);
            if (tabToRename) {
                tabToRename.name = trimmedName; // This uses the TabItem's setter
            }

			this._dispatchContextUpdate("session_renamed");
		}
	}

	// The old _updateSessionUI method is no longer needed and has been removed.


	/**
	 * Dispatches a custom 'context-update' event with the current chat state.
	 * This now also includes the metadata for workspace and full data for the active session.
	 * @param {string} type - The type of update (e.g., 'append_user', 'summarize', 'clear', 'settings_change').
	 * @param {object} [details={}] - Additional details relevant to the update type.
	 */
	_dispatchContextUpdate(type, details = {}) {
		// Ensure ai, historyManager, and activeSession are available
		if (!this.ai || !this.historyManager || !this.activeSession) {
			console.warn("Attempted to dispatch context update before AI, History Manager, or active session was ready.");
			return;
		}

		// Calculate tokens based on the active session's messages
		const estimatedTokensFullHistory = this.ai.isConfigured() ? this.ai.estimateTokens(this.activeSession.messages) : 0;
		const maxContextTokens = this.ai.isConfigured() ? this.ai.MAX_CONTEXT_TOKENS : 0;

		const eventDetail = {
			aiProvider: this.aiProvider,
			runMode: "chat", // Always chat mode now
			estimatedTokensFullHistory: estimatedTokensFullHistory,
			maxContextTokens: maxContextTokens,
			type: type,
			// NEW: Pass the metadata for workspace and a deep copy of the full active session for IndexedDB save
			aiSessionsMetadata: {
				activeSessionId: this.activeSessionId,
				sessions: JSON.parse(JSON.stringify(this.allSessionMetadata)) // Deep copy to prevent mutation issues
			},
			activeSessionData: JSON.parse(JSON.stringify(this.activeSession)), // Deep copy of active session
			...details,
		};

		// Directly update the AIManager's own UI (progress bar) before dispatching
		this._updateContextUI(eventDetail);
		this._setButtonsDisabledState(this._isProcessing);

		this.panel.dispatchEvent(new CustomEvent("context-update", { detail: eventDetail }))
	}

	async generate() {
		if (this._isProcessing) {
			console.warn("AI is currently processing another request. Please wait.")
			return
		}
        // Check if AI is configured and activeSession exists before proceeding with generation
        if (!this.ai || !this.ai.isConfigured() || !this.activeSession) {
            console.warn("AI is not configured or no active session. Cannot generate response.");
            this.historyManager.addMessage({
                type: "system_message",
                content: `AI is not configured or no active session. Please set up your AI provider in the settings or create a new chat.`,
                timestamp: Date.now(),
            });
            this._dispatchContextUpdate("generation_error_not_configured");
            this._isProcessing = false;
            this._setButtonsDisabledState(false);
            return;
        }

		this._isProcessing = true
		this._setButtonsDisabledState(true)

		const userPrompt = this.promptArea.value.trim()

		if (!userPrompt) {
			this._isProcessing = false
			this._setButtonsDisabledState(false)
			return
		}

		// Use the active session's prompt history
		const activePromptHistory = this.activeSession.promptHistory;
		const lastPrompt = activePromptHistory.length > 0 ? activePromptHistory[activePromptHistory.length - 1].trim() : null;

		if (lastPrompt && lastPrompt === userPrompt) {
			console.log("Skipping adding duplicate contiguous prompt to history.");
			this.promptIndex = activePromptHistory.length; // Keep index at end
		} else {
			activePromptHistory.push(userPrompt);
			while (activePromptHistory.length > MAX_PROMPT_HISTORY) {
				activePromptHistory.shift();
				if (this.promptIndex > 0) {
					this.promptIndex--;
				}
			}
			this.promptIndex = activePromptHistory.length; // Set index to end after adding
		}

		// Reset the promptArea height after submitting the prompt
		this.promptArea.value = ""
		this._resizePromptArea();

		// No longer dispatch "new-prompt" globally, prompt history is per-session

		// Check for automatic summarization before processing the new prompt
		const estimatedTokensBeforeNewPrompt = this.ai.estimateTokens(this.activeSession.messages)
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

		// Process prompt for @ tags, always using "chat" logic now.
		const { processedPrompt, contextItems } = await this.ai._getContextualPrompt(userPrompt, "chat")
		
		// NEW: Check for stale context files and handle user interaction
		await this._checkForStaleContextFiles(); // This will block if user interaction is needed

		// NEW: Remove any existing context items for the same files being added in this turn
		if (contextItems.length > 0) {
			const newFileIds = new Set(contextItems.map(item => item.id));
			this.activeSession.messages = this.activeSession.messages.filter(msg => 
				!(msg.type === "file_context" && newFileIds.has(msg.id))
			);
		}

		// Update active session's messages
		contextItems.forEach((item) => {
			const contextMessage = {
				type: "file_context",
				id: item.id, // This is the unique path
				filename: item.filename,
				language: item.language,
				content: item.content,
				timestamp: Date.now(),
			};
			this.activeSession.messages.push(contextMessage);
			this.historyManager.appendMessageElement(contextMessage); // Dynamically append
		});
		
		let userMessage = null;
		if(processedPrompt) {
			userMessage = { role: "user", type: "user", content: processedPrompt, timestamp: Date.now(), id: crypto.randomUUID() };
			this.activeSession.messages.push(userMessage);
			this.historyManager.appendMessageElement(userMessage); // Dynamically append
		}

		// The `processedPrompt` is the cleaned prompt after @-tags. Add it as the user's message.

		// Update lastModified timestamp for the session
		this.activeSession.lastModified = Date.now();
		// Save the active session to IndexedDB immediately after adding user prompt and context
		await set(`ai-session-${this.activeSession.id}`, this.activeSession);

		// Render updated history in UI and dispatch event
		// this.historyManager.render(); // NO LONGER NEEDED, using dynamic appends
		this._dispatchContextUpdate("append_user"); // This will also save workspace metadata

		// Prepare placeholder for AI response and spinner
		const modelMessageId = crypto.randomUUID(); // Pre-generate ID for the upcoming model response
		const responseBlock = new Block()
		responseBlock.classList.add("response-block")
		responseBlock.dataset.messageId = modelMessageId; // Assign ID for future reference
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
                // NEW: _addCodeBlockButtons will now also handle diff rendering for streaming updates
                this._addCodeBlockButtons(responseBlock) 
				if (!this.userScrolled) {
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight
				}
			},
			onDone: async (fullResponse, contextRatioPercent) => { // Mark async to await set
				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

				responseBlock.innerHTML = this.md.render(fullResponse) // Final render
				this._addCodeBlockButtons(responseBlock) // Add buttons after final response is rendered

				// Add AI response to activeSession's messages for persistence
				const modelMessage = {
					id: modelMessageId, // Use the pre-generated ID
					role: "model",
					type: "model",
					content: fullResponse,
					timestamp: Date.now(),
				};
				this.activeSession.messages.push(modelMessage);
				// Update lastModified timestamp and save the active session
				this.historyManager.addInteractionToLastUserMessage(userMessage); // Add delete button to user prompt
				this.activeSession.lastModified = Date.now();
				await set(`ai-session-${this.activeSession.id}`, this.activeSession);
				
				this._dispatchContextUpdate("append_model") // Dispatch after model response

				this._isProcessing = false // Release lock
				this._setButtonsDisabledState(false) // Re-enable buttons
			},
			onError: async (error) => { // Mark async to await set
				responseBlock.innerHTML = `Error: ${error.message}`
				console.error(`Error calling ${this.ai.config.model} API:`, error)
				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

				const errorMessage = {
					id: modelMessageId, // Use the pre-generated ID for the block
					role: "error",
					type: "error",
					content: `Error: ${error.message}`,
					timestamp: Date.now(),
				};
				this.activeSession.messages.push(errorMessage);
				// Update lastModified timestamp and save the active session
				// No interaction added for errors.
				this.activeSession.lastModified = Date.now();
				await set(`ai-session-${this.activeSession.id}`, this.activeSession);

				this._dispatchContextUpdate("append_error")

				this._isProcessing = false
				this._setButtonsDisabledState(false)
			},
			onContextRatioUpdate: (ratio) => { /* ... */ },
		}

		
		// Always use the chat method.
		if(processedPrompt) {
			const messagesForAI = this.historyManager.prepareMessagesForAI()
			this.ai.chat(messagesForAI, callbacks)
		} else {
			// Scenario: Context items were added, but no user prompt was given.
			// In this case, we don't call the AI, but acknowledge the context addition.
			this.historyManager.addMessage({
				type: "system_message",
				content: `Files added to context for future reference.`,
				timestamp: Date.now(),
			});
	
			// Update lastModified timestamp for the session
			this.activeSession.lastModified = Date.now();
			// Save the active session to IndexedDB immediately after adding user prompt and context
			await set(`ai-session-${this.activeSession.id}`, this.activeSession);
	
			// Render updated history in UI and dispatch event
			this.historyManager.render();
			// this._dispatchContextUpdate("files_added_to_context");
	
			this._isProcessing = false; // Release lock
			this._setButtonsDisabledState(false); // Re-enable buttons
	
			return; // Exit the function as AI chat is not needed.
		}
	}

	_addCodeBlockButtons(responseBlock) {
		const preElements = responseBlock.querySelectorAll("pre")
		preElements.forEach((pre) => {
            // Check if buttons are already added to this <pre> element
            if (pre.querySelector('.code-buttons')) {
                return; // Skip if buttons already exist
            }

			const codeElement = pre.querySelector("code") // Get the code element inside pre

			const buttonContainer = new Block()
			buttonContainer.classList.add("code-buttons")

			// Common buttons for all code blocks
			const copyButton = new Button()
			copyButton.classList.add("code-button")
			copyButton.icon = "content_copy"
			copyButton.title = "Copy code"
			copyButton.on("click", () => {
				const code = codeElement ? codeElement.innerText : pre.innerText; // Use codeElement if exists
				navigator.clipboard.writeText(code)
				copyButton.icon = "done"
				setTimeout(() => {
					copyButton.icon = "content_copy"
				}, 1000)
			})
			buttonContainer.append(copyButton);

			const insertButton = new Button()
			insertButton.classList.add("code-button")
			insertButton.icon = "input"
			insertButton.title = "Insert into editor"
			insertButton.on("click", () => {
				const code = codeElement ? codeElement.innerText : pre.innerText; // Use codeElement if exists
				const event = new CustomEvent("insert-snippet", { detail: code })
				window.dispatchEvent(event)
				insertButton.icon = "done"
				setTimeout(() => {
					insertButton.icon = "input"
				}, 1000)
			})
			buttonContainer.append(insertButton);

            // Expand/Collapse button
            const expandCollapseButton = new Button();
            expandCollapseButton.classList.add("code-button", "expand-collapse-button");

            const codeContent = codeElement ? codeElement.innerText : pre.innerText;
            const lineCount = codeContent.split('\n').length;
            const codeLanguage = codeElement ? Array.from(codeElement.classList).find(cls => cls.startsWith('language-'))?.substring(9) : '';

            // Determine initial state and button visibility
            if (lineCount < 30) {
                pre.setAttribute("expanded", ""); // Apply expanded state
                expandCollapseButton.style.display = "none"; // Hide button
            } else if (codeLanguage === "diff") {
                pre.setAttribute("expanded", ""); // Apply expanded state for diffs
                expandCollapseButton.icon = "unfold_less";
                expandCollapseButton.title = "Collapse code block";
            } else {
                pre.setAttribute("collapsed", ""); // Apply collapsed state by default
                expandCollapseButton.icon = "unfold_more";
                expandCollapseButton.title = "Expand code block";
            }

            expandCollapseButton.on("click", () => {
                if (pre.hasAttribute("collapsed")) {
                    pre.removeAttribute("collapsed");
                    // Default state (30em)
                    expandCollapseButton.icon = "unfold_more"; // Still "unfold_more" to go to expanded next
                    expandCollapseButton.title = "Expand code block";
                } else if (!pre.hasAttribute("expanded")) {
                    // Currently in default (30em) state, go to expanded
                    pre.setAttribute("expanded", "");
                    expandCollapseButton.icon = "unfold_less";
                    expandCollapseButton.title = "Collapse code block";
                } else {
                    // Currently expanded, go to collapsed
                    pre.removeAttribute("expanded");
                    pre.setAttribute("collapsed", "");
                    expandCollapseButton.icon = "unfold_more";
                    expandCollapseButton.title = "Expand code block";
                }
            });
            buttonContainer.append(expandCollapseButton) // Append the new button


            // NEW: Diff specific handling
            if (codeElement && codeElement.classList.contains('language-diff')) {
                const originalDiffString = codeElement.textContent; // Get the raw diff content

                // Render the diff using DiffHandler and replace the pre's innerHTML
                const renderedDiffHtml = DiffHandler.renderStateless(originalDiffString, 'html');
                // Create a temporary div to parse the HTML and extract the inner content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = renderedDiffHtml;
                const newPreContent = tempDiv.querySelector('.diff-output')?.innerHTML || '';
                
                if (newPreContent) {
                	// pre.tagName = "ui-block"
                    pre.innerHTML = newPreContent; // Replace with styled diff content
                    pre.classList.add('diff-output'); // Add a class for specific styling
                    // Store the original raw diff string on the pre element for the apply button
                    pre.dataset.originalDiffContent = originalDiffString; 
                } else {
                    console.warn("DiffHandler.renderStateless returned unexpected output for diff block.");
                }

                // Add "Apply Diff" button
                const applyDiffButton = new Button();
                applyDiffButton.classList.add("code-button");
                applyDiffButton.icon = "merge"; // Suitable icon for applying changes
                applyDiffButton.title = "Apply diff to file";
                applyDiffButton.on("click", async () => {
                    const rawDiff = pre.dataset.originalDiffContent;
                    if (!rawDiff) {
                        alert("Error: Could not retrieve original diff content to apply.");
                        return;
                    }

                    // Extract target path from diff header (e.g., +++ b/path/to/file)
                    const targetPathMatch = rawDiff.match(/^\+\+\+ b\/(.+)$/m);
                    if (!targetPathMatch || !targetPathMatch[1]) {
                        alert("Error: Could not determine target file path from diff header. Ensure the diff starts with '+++ b/filename'.");
                        return;
                    }
                    const targetPath = targetPathMatch[1];

                    // --- NEW LOGIC START ---
                    // 1. Find the ORIGINAL content from the chat history (what the AI saw)
                    let originalContentFromContext = null;
                    // Iterate backward to get the MOST RECENT context entry for this file
                    for (let i = this.activeSession.messages.length - 1; i >= 0; i--) {
                        const msg = this.activeSession.messages[i];
                        if (msg.type === "file_context" && msg.filename === targetPath) {
                            originalContentFromContext = msg.content;
                            break;
                        }
                    }

                    if (!originalContentFromContext) {
                        alert(`Error: The original content for "${targetPath}" was not found in this chat session's context history. Cannot apply diff.`);
                        return;
                    }
                    // --- NEW LOGIC END ---

                    // 2. Find the LIVE editor tab using the AI's helper
                    const tabToUpdate = await this.ai._getTabSessionByPath(targetPath);
                    if (!tabToUpdate) {
                        alert(`Error: File "${targetPath}" is not currently open in the editor. Please open the file to apply the diff.`);
                        return;
                    }

                    // 3. Apply the diff using DiffHandler, using content from history
                    const newFileContentFromDiff = DiffHandler.applyStatelessFuzzy(originalContentFromContext, rawDiff);

                    if (newFileContentFromDiff === null) {
                        alert(`Failed to apply diff to "${targetPath}". There might be a content mismatch with the file as it was originally sent to AI. Please review the diff manually.`);
                        console.error("Diff application failed:", { originalContentFromContext, rawDiff });
                    } else {
                    	
                    	// 4. Update the live file content in the editor
                        tabToUpdate.config.session.setValue(newFileContentFromDiff);
                        
                        // applyCodeDiffToAceSession(tabToUpdate.config.session, tabToUpdate.config.session.getValue(), newFileContentFromDiff);
                        
                        // IMPORTANT: DO NOT call session.markClean() here.
                        // setValue marks it dirty, which is correct because it's not saved to disk yet.
                        // The user should manually save after applying.

                        // Provide visual feedback
                        applyDiffButton.icon = "done"; 
                        applyDiffButton.title = "Diff applied successfully!";
                        setTimeout(() => {
                            applyDiffButton.icon = "merge";
                            applyDiffButton.title = "Apply diff to file";
                        }, 2000);
                        // Add a system message to chat history for persistent feedback
                        this.historyManager.addMessage({
                            type: "system_message",
                            content: `Diff successfully applied to **${targetPath}**. Remember to save the file.`,
                            timestamp: Date.now(),
                        });
                    }
                });
                buttonContainer.append(applyDiffButton);
            }

			pre.prepend(buttonContainer)
		})
	}

	/**
	 * NEW METHOD: Updates or removes stale file context messages in the active session.
	 * @param {Array<Object>} staleFileContexts - Array of objects containing { message, liveContent, tabInfo }.
	 */
	_updateStaleContextFiles(staleFileContexts) {
		if (!this.activeSession) return;

		// Create a new array for messages to avoid issues with splice while iterating
		let updatedMessages = [...this.activeSession.messages];
		let changesMade = false;

		for (const staleItem of staleFileContexts) {
			const messageIndex = updatedMessages.findIndex(msg =>
				msg.type === "file_context" && msg.id === staleItem.message.id
			);

			if (messageIndex !== -1) {
				if (staleItem.liveContent !== null) {
					updatedMessages[messageIndex].content = staleItem.liveContent;
				} else {
					updatedMessages.splice(messageIndex, 1); // Remove if file is no longer available
				}
				changesMade = true;
			}
		}
		if (changesMade) {
			this.activeSession.messages = updatedMessages;
			this.activeSession.lastModified = Date.now(); // Update last modified timestamp
			this.historyManager.render(); // Re-render the UI
			this._dispatchContextUpdate("context_files_updated"); // Dispatch event
		}
	}
	
	/**
	 * NEW METHOD: Checks if any file context messages in the current session are stale
	 * (i.e., their content no longer matches the live file on disk).
	 * If stale files are found, it presents a confirmation dialog to the user.
	 * Returns a Promise that resolves when the user has made a choice.
	 */
	async _checkForStaleContextFiles() {
		if (!this.activeSession) return;

		const staleFileContexts = [];
		for (const message of this.activeSession.messages) {
			if (message.type === "file_context" && message.filename) {
				try {
					const tabInfo = await this.ai._getTabSessionByPath(message.filename);
					if (tabInfo && tabInfo.config.session) {
						const liveContent = tabInfo.config.session.getValue();
						if (liveContent !== message.content) {
							staleFileContexts.push({
								message,
								liveContent,
								tabInfo,
							});
						}
					} else {
						// File is no longer open or available, mark as stale for removal/update
						staleFileContexts.push({
							message,
							liveContent: null, // Indicates file not found/open
							tabInfo: null,
						});
					}
				} catch (e) {
					console.warn(`Error checking currency for file ${message.filename}:`, e);
					// Consider it stale if an error occurs fetching live content
					staleFileContexts.push({
						message,
						liveContent: null,
						tabInfo: null,
					});
				}
			}
		}

		if (staleFileContexts.length > 0) {
			this._setButtonsDisabledState(true); // Disable main buttons during interaction
			this._isProcessing = true; // Keep processing flag true

			let message = `**${staleFileContexts.length} file(s)** in this chat's context have changed or are no longer open.`;
			if (staleFileContexts.some(f => f.liveContent !== null)) {
				message += ` Would you like to update the context with the latest versions?`;
			} else {
				message += ` They will be removed from context if you continue.`;
			}
			
			this._showContextStaleNotice(message);

			const userChoice = await new Promise(resolve => {
				this._contextStaleResolve = resolve;
			});

			if (userChoice) { // User chose to update
				this._updateStaleContextFiles(staleFileContexts);
			}
			// If userChoice is false, do nothing; the old context will be used.
		}
	}
	
	async loadSettings() {
		const storedProvider = localStorage.getItem("aiProvider")
		if (storedProvider && this.aiProviders[storedProvider]) {
			this.aiProvider = storedProvider
		}
		// Load summarization settings
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
