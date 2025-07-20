// ai-manager.mjs
// Styles for this module are located in css/ai-manager.css
import { Block, Button, Icon } from "./elements.mjs"
import Ollama from "./ai-ollama.mjs"
import Gemini from "./ai-gemini.mjs"
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
		// this.runMode is REMOVED
		this.settingsPanel = null
		this.useWorkspaceSettings = false
		this.userScrolled = false
		this._isProcessing = false // NEW: Flag to track if AI is busy (generating or summarizing)

		// NEW: Load summarization settings defaults
		this.config = {
			summarizeThreshold: this._settingsSchema.summarizeThreshold.default,
			summarizeTargetPercentage: this._settingsSchema.summarizeTargetPercentage.default,
		}
	}

	async init(panel) {
		this.panel = panel
		await this.loadSettings()
		this.ai = new this.aiProviders[this.aiProvider]()
		await this.ai.init()

		// NEW: Load summarization settings from storage, overriding defaults
		const storedSummarizeThreshold = localStorage.getItem("summarizeThreshold")
		if (storedSummarizeThreshold !== null) {
			this.config.summarizeThreshold = parseInt(storedSummarizeThreshold)
		}
		const storedSummarizeTargetPercentage = localStorage.getItem("summarizeTargetPercentage")
		if (storedSummarizeTargetPercentage !== null) {
			this.config.summarizeTargetPercentage = parseInt(storedSummarizeTargetPercentage)
		}

		this._createUI()
		this._setupPanel()
		// If there's any initial history to display, render it
		this.historyManager.render()
		this._dispatchContextUpdate("init") // NEW: Dispatch initial context state
	}

	set editor(editor) {
		this.ai.editor = editor
	}

	get editor() {
		return this.ai.editor
	}

	focus() {
		this.promptArea.focus()
	}

	_setupPanel() {
		this.panel.setAttribute("id", "ai-panel")
	}

	_createUI() {
		this.conversationArea = this._createConversationArea()
		const promptContainer = this._createPromptContainer()
		this.settingsPanel = this._createSettingsPanel()
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
		this.progressBar.setAttribute("title", "context window utilization")
		this.progressBar.style.display = "block" // Now always visible

		const progressBarInner = document.createElement("div")
		progressBarInner.classList.add("progress-bar-inner")
		this.progressBar.appendChild(progressBarInner)
		promptContainer.appendChild(this.progressBar)

		this.promptArea = this._createPromptArea()
		const buttonContainer = new Block()
		buttonContainer.classList.add("button-container")

		// this.runModeButton is REMOVED
		this.summarizeButton = this._createSummarizeButton() // NEW: Summarize button
		this.submitButton = this._createSubmitButton()
		this.clearButton = this._createClearButton()

		// Append order updated
		buttonContainer.append(this.summarizeButton) // NEW: Add summarize button
		const spacer = new Block()
		spacer.classList.add("spacer")
		buttonContainer.append(spacer)
		buttonContainer.append(this.clearButton)
		buttonContainer.append(this.submitButton)

		const settingsButton = new Button()
		settingsButton.classList.add("settings-button")
		settingsButton.icon = "settings"
		settingsButton.on("click", () => this.toggleSettingsPanel())
		buttonContainer.prepend(settingsButton)

		promptContainer.append(this.promptArea)
		promptContainer.append(buttonContainer)

		return promptContainer
	}

	_createPromptArea() {
		const promptArea = document.createElement("textarea")
		promptArea.classList.add("prompt-area")
		promptArea.placeholder = "Enter your prompt here..."

		const resizePromptArea = () => {
			promptArea.style.minHeight = "auto" // Reset min-height to allow shrinking
			void promptArea.offsetHeight // Force reflow to get accurate scrollHeight
			promptArea.style.minHeight = Math.min(360, promptArea.scrollHeight) + "px"
		}

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
					resizePromptArea()
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
					resizePromptArea()
				}
				return
			}
		})
		promptArea.addEventListener("input", () => {
			resizePromptArea()
		})
		return promptArea
	}

	// The _createRunModeButton() method has been REMOVED

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
		const clearButton = new Button("New Context")
		clearButton.classList.add("clear-button")
		clearButton.on("click", () => {
			this.historyManager.clear()
		})
		this._setButtonsDisabledState(this._isProcessing) // Initial state
		return clearButton
	}

	// NEW: Helper to disable/enable relevant buttons
	_setButtonsDisabledState(disabled) {
		if (this.submitButton) this.submitButton.disabled = disabled
		if (this.clearButton) this.clearButton.disabled = disabled
		if (this.summarizeButton) {
			const eligibleMessages = this.historyManager.chatHistory.filter(
				(msg) => msg.type === "user" || msg.type === "model"
			)

			// NEW, more accurate condition:
			// Summarization is only possible if the number of messages we can potentially summarize
			// (i.e., total messages minus the ones we must preserve) is at least 2 (a user/model pair).
			const summarizableMessageCount = eligibleMessages.length - MAX_RECENT_MESSAGES_TO_PRESERVE
			const canSummarize = summarizableMessageCount >= 2

			this.summarizeButton.disabled = disabled || !canSummarize
		}
	}

	_createSettingsPanel() {
		const settingsPanel = new Block()
		settingsPanel.classList.add("settings-panel")

		const form = document.createElement("form")

		const workspaceSettingsCheckbox = document.createElement("input")
		workspaceSettingsCheckbox.type = "checkbox"
		workspaceSettingsCheckbox.id = "use-workspace-settings"
		workspaceSettingsCheckbox.checked = this.useWorkspaceSettings
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

		const renderSettingsForm = async () => {
			form.innerHTML = ""
			form.appendChild(workspaceSettingsLabel)

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
			aiProviderSelect.addEventListener("change", async () => {
				const oldProvider = this.aiProvider
				this.aiProvider = aiProviderSelect.value
				localStorage.setItem("aiProvider", this.aiProvider)

				// Create new AI instance, maintaining history for it.
				const newAIInstance = new this.aiProviders[this.aiProvider]()
				// AIManager already holds the chatHistory, so no need to pass it explicitly to newAIInstance.
				// The _prepareMessagesForAI will retrieve and prune from this.chatHistory on each call.
				this.ai = newAIInstance
				await this.ai.init() // Initialize the new AI with its settings

				renderSettingsForm() // Re-render settings for the new provider
				this._resetProgressBar() // Reset progress bar as context might be different
				this._dispatchContextUpdate("settings_change") // NEW: Dispatch on AI provider change
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
					// Ensure enum options are updated from the lookupCallback
					const currentEnumOptions = setting.enum || [] // Use provided enum, or empty array
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
							this._setButtonsDisabledState(true) // Disable buttons during model refresh
							try {
								await this.ai.refreshModels()
								renderSettingsForm() // Re-render to show updated model list
								this._dispatchContextUpdate("settings_change") // NEW: Dispatch on model refresh
							} finally {
								this._setButtonsDisabledState(false) // Re-enable buttons
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

			toggleInputs(this.useWorkspaceSettings)

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

				// The setOptions method now correctly updates MAX_CONTEXT_TOKENS internally in AI providers
				this.ai.setOptions(
					newSettings,
					(errorMessage) => {
						const errorBlock = new Block()
						errorBlock.classList.add("response-block")
						errorBlock.innerHTML = `Error: ${errorMessage}`
						this.conversationArea.append(errorBlock)
						this.conversationArea.scrollTop = this.conversationArea.scrollHeight
						this._dispatchContextUpdate("settings_save_error") // NEW: Dispatch error state
					},
					(successMessage) => {
						const successBlock = new Block()
						successBlock.classList.add("response-block")
						successBlock.innerHTML = successMessage
						this.conversationArea.append(successBlock)
						this.conversationArea.scrollTop = this.conversationArea.scrollHeight
						this._dispatchContextUpdate("settings_save_success") // NEW: Dispatch success state
					},
					this.useWorkspaceSettings,
					this.ai.settingsSource
				)
				this.toggleSettingsPanel()
			})
			form.appendChild(saveButton)
		}

		renderSettingsForm()

		settingsPanel.appendChild(form)
		return settingsPanel
	}

	toggleSettingsPanel() {
		this.conversationArea.classList.toggle("hidden")
		this.settingsPanel.classList.toggle("active")
		// If settings panel is being hidden, re-render chat history to refresh any potential content/token changes
		if (!this.settingsPanel.classList.contains("active")) {
			this.historyManager.render()
			this._dispatchContextUpdate("settings_closed") // NEW: Dispatch on settings panel close
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

	_resetProgressBar() {
		this.progressBar.style.display = "block"
		const progressBarInner = this.progressBar.querySelector(".progress-bar-inner")
		progressBarInner.style.width = "0%"
		// NEW: Reset color when the progress bar is reset
		this._updateProgressBarColor(progressBarInner, 0) // Reset to default (0%)
	}

	/**
	 * Dispatches a custom 'context-update' event with the current chat state.
	 * @param {string} type - The type of update (e.g., 'append_user', 'summarize', 'clear', 'settings_change').
	 * @param {object} [details={}] - Additional details relevant to the update type (e.g., summaryDetails).
	 */
	_dispatchContextUpdate(type, details = {}) {
		const estimatedTokensFullHistory = this.ai.estimateTokens(this.historyManager.chatHistory)
		const maxContextTokens = this.ai.MAX_CONTEXT_TOKENS

		const eventDetail = {
			chatHistory: JSON.parse(JSON.stringify(this.historyManager.chatHistory)), // Deep copy for immutability
			aiProvider: this.aiProvider,
			runMode: "chat", // Always chat mode now
			estimatedTokensFullHistory: estimatedTokensFullHistory,
			maxContextTokens: maxContextTokens,
			type: type,
			...details,
		}
		this.panel.dispatchEvent(new CustomEvent("context-update", { detail: eventDetail }))
	}

	async generate() {
		if (this._isProcessing) {
			// NEW: Prevent multiple concurrent AI requests
			console.warn("AI is currently processing another request. Please wait.")
			return
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

		this.promptArea.value = ""
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
				if (!this.userScrolled) {
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight
				}
			},
			onDone: (fullResponse, contextRatioPercent) => {
				this._addCodeBlockButtons(responseBlock)

				// Progress bar is now updated via _dispatchContextUpdate, simplifying this.
				// We'll update it based on the final history state.

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

			buttonContainer.append(copyButton)
			buttonContainer.append(insertButton)
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
		// NEW: Load summarization settings from local storage
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
