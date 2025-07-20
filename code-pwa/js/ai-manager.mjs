// ai-manager.mjs
// Styles for this module are located in css/ai-manager.css
import { Block, Button, Icon } from "./elements.mjs"
import Ollama from "./ai-ollama.mjs"
import Gemini from "./ai-gemini.mjs"

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
		}

		this.prompts = [] // Stores raw user prompt strings for history navigation (Ctrl+Up/Down)
		this.promptIndex = -1 // -1 indicates no prompt from history is currently displayed
		this.chatHistory = [] // NEW: Stores structured history of ALL messages (user, AI, file context)

		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit()
		this.runMode = "chat" // chat or generate
		this.settingsPanel = null
		this.useWorkspaceSettings = false
		this.userScrolled = false
	}

	async init(panel) {
		this.panel = panel
		await this.loadSettings()
		this.ai = new this.aiProviders[this.aiProvider]()
		await this.ai.init()
		this._createUI()
		this._setupPanel()
        // If there's any initial history to display, render it
        this._renderChatHistory();
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
		this.progressBar.style.display = "none"

		const progressBarInner = document.createElement("div")
		progressBarInner.classList.add("progress-bar-inner")
		this.progressBar.appendChild(progressBarInner)
		promptContainer.appendChild(this.progressBar)

		this.promptArea = this._createPromptArea()
		const buttonContainer = new Block()
		buttonContainer.classList.add("button-container")

		this.runModeButton = this._createRunModeButton()
		this.submitButton = this._createSubmitButton()
		this.clearButton = this._createClearButton()

		buttonContainer.append(this.runModeButton)
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

	_createRunModeButton() {
		const runModeButton = new Button("Chat")
		runModeButton.icon = "chat"
		runModeButton.classList.add("run-mode-button", "theme-button")
		runModeButton.on("click", () => {
			if (this.runMode === "chat") {
				this.runMode = "generate"
				runModeButton.text = "Generate"
				runModeButton.icon = "code"
				this.progressBar.style.display = "block" // Generate mode shows context
			} else {
				this.runMode = "chat"
				runModeButton.text = "Chat"
				runModeButton.icon = "chat"
				this.progressBar.style.display = "none" // Chat mode bar will be managed by specific callbacks
			}
		})
		return runModeButton
	}

	_createSubmitButton() {
		const submitButton = new Button("Send")
		submitButton.icon = "send"
		submitButton.classList.add("submit-button", "theme-button")
		submitButton.on("click", () => this.generate())
		return submitButton
	}

	_createClearButton() {
		const clearButton = new Button("Clear")
		clearButton.classList.add("clear-button")
		clearButton.on("click", () => {
			this.conversationArea.innerHTML = ""
			this.chatHistory = [] // Clear main chat history
			this.ai.clearContext() // Delegate to AI for its internal context (e.g., Ollama's `context` array)
            this._resetProgressBar();
		})
		return clearButton
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
				const oldProvider = this.aiProvider;
				this.aiProvider = aiProviderSelect.value
				localStorage.setItem("aiProvider", this.aiProvider)
				
				// Create new AI instance, maintaining history for it.
				const newAIInstance = new this.aiProviders[this.aiProvider]();
				// AIManager already holds the chatHistory, so no need to pass it explicitly to newAIInstance.
				// The _prepareMessagesForAI will retrieve and prune from this.chatHistory on each call.
				this.ai = newAIInstance; 
				await this.ai.init(); // Initialize the new AI with its settings

				renderSettingsForm(); // Re-render settings for the new provider
				this._resetProgressBar(); // Reset progress bar as context might be different
			})
			aiProviderLabel.appendChild(aiProviderSelect)
			form.appendChild(aiProviderLabel)

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
					const currentEnumOptions = setting.enum || []; // Use provided enum, or empty array
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
							await this.ai.refreshModels()
							renderSettingsForm() // Re-render to show updated model list
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
				// The setOptions method now correctly updates MAX_CONTEXT_TOKENS internally in AI providers
				this.ai.setOptions(
					newSettings,
					(errorMessage) => {
						const errorBlock = new Block()
						errorBlock.classList.add("response-block")
						errorBlock.innerHTML = `Error: ${errorMessage}`
						this.conversationArea.append(errorBlock)
						this.conversationArea.scrollTop = this.conversationArea.scrollHeight
					},
					(successMessage) => {
						const successBlock = new Block()
						successBlock.classList.add("response-block")
						successBlock.innerHTML = successMessage
						this.conversationArea.append(successBlock)
						this.conversationArea.scrollTop = this.conversationArea.scrollHeight
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
	}
	
    // NEW: Helper method to update progress bar color based on percentage
    _updateProgressBarColor(progressBarInner, percentage) {
        // Remove all color classes first
        progressBarInner.classList.remove('threshold-yellow', 'threshold-orange', 'threshold-red');

        if (percentage >= 90) {
            progressBarInner.classList.add('threshold-red');
        } else if (percentage >= 80) {
            progressBarInner.classList.add('threshold-orange');
        } else if (percentage >= 66) {
            progressBarInner.classList.add('threshold-yellow');
        }
        // If percentage is below 66, no specific color class is added,
        // and it will default to the original --theme color defined in CSS.
    }

    _resetProgressBar() {
        this.progressBar.style.display = this.runMode === "generate" ? "block" : "none";
        const progressBarInner = this.progressBar.querySelector(".progress-bar-inner");
        progressBarInner.style.width = "0%";
        // NEW: Reset color when the progress bar is reset
        this._updateProgressBarColor(progressBarInner, 0); // Reset to default (0%)
    }

    _renderChatHistory() {
        this.conversationArea.innerHTML = ""; // Clear existing UI
        this.chatHistory.forEach(message => {
            if (message.type === 'user' || message.type === 'model') {
                const messageBlock = new Block();
                messageBlock.classList.add(message.type === 'user' ? 'prompt-pill' : 'response-block');
                messageBlock.innerHTML = this.md.render(message.content);
                this.conversationArea.append(messageBlock);
                if (message.type === 'model') {
                    this._addCodeBlockButtons(messageBlock);
                }
            } else if (message.type === 'file_context') {
                this._appendFileContextUI(message);
            }
        });
        this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
    }

    _appendFileContextUI(fileContext) {
        // NEW: Create a wrapper for the file pill and its action buttons
        const wrapperBlock = new Block();
        wrapperBlock.classList.add("context-file-wrapper"); // A new class for styling the wrapper

        const fileBlock = new Block();
        // Add both prompt-pill for base styling and context-file-pill for overrides
        fileBlock.classList.add("prompt-pill", "context-file-pill");
        fileBlock.dataset.fileId = fileContext.id; // Store ID for removal/update

        // Set the full content as a title attribute for tooltip on hover
        // Truncate content for the title attribute to max 7 lines
        const lines = fileContext.content.split('\n');
        const truncatedContent = lines.length > 7
            ? lines.slice(0, 7).join('\n') + '\n...'
            : fileContext.content;

        fileBlock.setAttribute("title", truncatedContent);

        const header = document.createElement("div");
        header.classList.add("context-file-header");
        const filenameText = document.createElement("p");
        filenameText.textContent = `Included File: ${fileContext.filename || fileContext.id}`;
        header.appendChild(filenameText);

        // Calculate and add file size
        const fileSize = fileContext.content.length;
        let sizeText = '';
        if (fileSize < 1024) {
            sizeText = `${fileSize} B`;
        } else {
            sizeText = `${(fileSize / 1024).toFixed(1)} KB`;
        }
        const fileSizeSpan = document.createElement("span");
        fileSizeSpan.classList.add("file-size"); // Apply size styling if needed
        fileSizeSpan.textContent = ` (${sizeText})`;
        filenameText.appendChild(fileSizeSpan); // Append size to the filename span

        const timestampSpan = document.createElement("span");
        timestampSpan.classList.add("timestamp");
        timestampSpan.textContent = new Date(fileContext.timestamp).toLocaleTimeString();
        header.appendChild(timestampSpan);
        
        fileBlock.append(header);

        // REMOVED: The code snippet preview element `contentPreview`
        // REMOVED: The buttonsDiv and its content were here.

        // Append the fileBlock to the new wrapper
        wrapperBlock.append(fileBlock);

        // NEW: Create the external icon-only buttons
        const copyButton = new Button(); // No text argument
        copyButton.icon = "content_copy";
        copyButton.title = "Copy Content"; // Add title for tooltip
        copyButton.classList.add("context-file-action-button");
        copyButton.on("click", () => {
            navigator.clipboard.writeText(fileContext.content);
            copyButton.icon = "done";
            setTimeout(() => copyButton.icon = "content_copy", 1000);
        });

        const insertButton = new Button(); // No text argument
        insertButton.icon = "input";
        insertButton.title = "Insert into Editor"; // Add title for tooltip
        insertButton.classList.add("context-file-action-button");
        insertButton.on("click", () => {
            const event = new CustomEvent("insert-snippet", { detail: fileContext.content });
            window.dispatchEvent(event);
            insertButton.icon = "done";
            setTimeout(() => insertButton.icon = "input", 1000);
        });

        // Append these new buttons to the wrapper
        wrapperBlock.append(copyButton, insertButton);

        // Finally, append the wrapper to the conversation area
        this.conversationArea.append(wrapperBlock);
    }

    /**
     * Prepares the messages array for sending to the AI, handling pruning for context limits.
     * @returns {Array<Object>} The messages array, pruned if necessary.
     */
    _prepareMessagesForAI() {
        // Start with a copy of the raw chat history, before converting file_context to user messages
        let prunableHistory = [...this.chatHistory]; 

        // Filter out any pending AI response messages before pruning, as they are not input
        prunableHistory = prunableHistory.filter(msg => msg.role !== 'temp_ai_response');

        const maxTokens = this.ai.MAX_CONTEXT_TOKENS || 4096; // Fallback if MAX_CONTEXT_TOKENS not set

        let currentTokens = this.ai.estimateTokens(prunableHistory);
        
        // The last message in prunableHistory should always be the current user's prompt (type: 'user').
        // We must keep at least the current user prompt.
        const minimumMessagesToKeep = 1; 

        // Pruning Pass 1: Prioritize removing oldest conversational (user/model) messages
        let oldestMessageIndex = 0;
        // Loop condition: still over limit AND there are prunable messages (not including the last N minimum)
        while (currentTokens > maxTokens && oldestMessageIndex < prunableHistory.length - minimumMessagesToKeep) {
            const messageToRemove = prunableHistory[oldestMessageIndex];

            // If it's a conversational message, remove it.
            if (messageToRemove.type === 'user' || messageToRemove.type === 'model') {
                prunableHistory.splice(oldestMessageIndex, 1); // Remove it
                currentTokens = this.ai.estimateTokens(prunableHistory); // Re-estimate tokens
                // Do NOT increment oldestMessageIndex, as the next message has shifted to this position
            } else if (messageToRemove.type === 'file_context') {
                // If it's a file_context, skip it for this pass and move to the next message
                oldestMessageIndex++;
            } else {
                // For any other unexpected types, skip and move to the next.
                oldestMessageIndex++;
            }
        }
        
        // Pruning Pass 2: If still over limit, remove oldest remaining messages (now including file_context)
        // This handles cases where file_context + user prompt are too large.
        oldestMessageIndex = 0; // Reset index to start from the beginning of the remaining history
        while (currentTokens > maxTokens && oldestMessageIndex < prunableHistory.length - minimumMessagesToKeep) {
            // Remove the oldest message regardless of its type (as long as it's not the last one)
            prunableHistory.splice(oldestMessageIndex, 1);
            currentTokens = this.ai.estimateTokens(prunableHistory);
            // Do NOT increment oldestMessageIndex
        }

        // Final check and warning if still over limit (should ideally not happen frequently after two passes)
        if (currentTokens > maxTokens) {
            console.warn(`Context window exceeded even after aggressive pruning. Estimated tokens: ${currentTokens}, Max: ${maxTokens}`);
            // Optionally, consider adding a UI warning here.
        }

        // Now, convert the pruned history into the format expected by the AI provider
        const messagesForAI = prunableHistory.map(msg => {
            if (msg.type === 'file_context') {
                return { 
                    role: 'user', 
                    content: `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``
                };
            }
            // For user/model messages, just return role and content
            return { role: msg.role, content: msg.content };
        });

        return messagesForAI;
    }

	async generate() {
		const userPrompt = this.promptArea.value.trim()

		if (!userPrompt) {
			return
		}

		const MAX_PROMPT_HISTORY = 50

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

        // Step 1: Process prompt for @ tags based on runMode
		const { processedPrompt, contextItems } = await this.ai._getContextualPrompt(userPrompt, this.runMode);

        // Step 2: Update internal chatHistory (AIManager is source of truth)
        if (this.runMode === "chat") {
            // Remove invalidated copies of context files
            contextItems.forEach(newItem => {
                this.chatHistory = this.chatHistory.filter(oldItem => 
                    !(oldItem.type === 'file_context' && oldItem.id === newItem.id)
                );
            });
            // Add new context files to history
            contextItems.forEach(item => {
                this.chatHistory.push({ 
                    type: 'file_context', 
                    id: item.id, 
                    filename: item.filename, 
                    language: item.language, 
                    content: item.content, 
                    timestamp: Date.now() 
                });
            });
            // Add the user's processed prompt to history
            this.chatHistory.push({ role: "user", type: "user", content: processedPrompt, timestamp: Date.now() });

            // Render updated history in UI
            this._renderChatHistory();

        } else { // 'generate' mode
            // For 'generate' mode, the prompt itself contains the inlined context.
            // We just add the user's original prompt string for UI.
            this.chatHistory.push({ role: "user", type: "user", content: userPrompt, timestamp: Date.now() });
            this._renderChatHistory(); // Render the single user prompt for generate
        }

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
				if (contextRatioPercent !== null && contextRatioPercent !== undefined) {
					const progressBarInner = this.progressBar.querySelector(".progress-bar-inner")
					progressBarInner.style.width = contextRatioPercent + "%"
                    this.progressBar.style.display = "block"; // Ensure visible if ratio is given
				} else {
					this.progressBar.style.display = "none"; // Hide if no ratio available (e.g., Ollama chat)
				}
				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

                // Add AI response to chatHistory for persistence
                this.chatHistory.push({ role: "model", type: "model", content: fullResponse, timestamp: Date.now() });
			},
			onError: (error) => {
				responseBlock.innerHTML = `Error: ${error.message}`
				console.error(`Error calling ${this.ai.config.model} API:`, error)
				spinner.remove()
				this.conversationArea.removeEventListener("scroll", scrollHandler)

                // Optional: Add error message to chatHistory if you want it persistent
                this.chatHistory.push({ role: "error", type: "error", content: `Error: ${error.message}`, timestamp: Date.now() });
			},
			onContextRatioUpdate: (ratio) => {
				if (ratio !== null && ratio !== undefined) {
					this.progressBar.style.display = "block"
					const progressBarInner = this.progressBar.querySelector(".progress-bar-inner")
					progressBarInner.style.width = ratio * 100 + "%"
                    this._updateProgressBarColor(progressBarInner, ratio * 100); // NEW: Update color
				} else {
					this.progressBar.style.display = "none"
				}
			},
		}

		if (this.runMode === "chat") {
            const messagesForAI = this._prepareMessagesForAI();
			this.ai.chat(messagesForAI, callbacks);
		} else {
            // For generate mode, processedPrompt already contains the inlined context.
            // The AI generate method just needs this single prompt string.
			this.ai.generate(processedPrompt, callbacks);
		}
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
	}
}

export default new AIManager()
