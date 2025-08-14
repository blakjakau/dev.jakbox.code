// ai-manager.mjs
// Styles for this module are located in css/ai-manager.css
import { Block, Button, Icon, TabBar, TabItem, FileBar } from "./elements.mjs"
import Ollama from "./ai-ollama.mjs"
import Claude from "./ai-claude.mjs"
import Gemini from "./ai-gemini.mjs"
import AIManagerHistory, { MAX_RECENT_MESSAGES_TO_PRESERVE } from "./ai-manager-history.mjs"
import AIManagerSettings from "./ai-manager-settings.mjs" // NEW: Settings manager
import { get, set, del } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm"

import DiffHandler from "./tools/diff-handler.mjs"
import systemPromptBuilder from './genericSystemPrompt.mjs'; // NEW: For building prompts
import hljs from "./tools/highlightjs.mjs"
const MAX_PROMPT_HISTORY = 50 // This is now PER-SESSION

const promptEditorSettings = {
	useSoftTabs: false,
	tabSize: 4,
	newLineMode: "auto",
	fontSize: 12,
	fontFamily: "roboto mono",
	minLines: 3,
	maxLines: 20,
	wrap: true,
	indentedSoftWrap: false,
	showGutter: false,
	highlightActiveLine: false,
	showPrintMargin: false,

	enableBasicAutocompletion: true,
	enableLiveAutocompletion: true
}

class AIManager {
	constructor() {
		this.ai = null
		this.aiProvider = "ollama" // Default AI provider
		this.aiProviders = {
			ollama: Ollama,
			claude: Claude,
			gemini: Gemini,
		}
		// NEW: Settings logic is moved to AIManagerSettings
		this.settingsManager = new AIManagerSettings(this);

		// NEW: Default system prompt config
		this.systemPromptConfig = {
            specialization: "JavaScript (ECMAScript), HTML, CSS, and Node.js", technologies: [], avoidedTechnologies: [], tone: ["warm", "playful", "cheeky"],
        };

		this.panel = null
		this.promptEditor = null // Will hold the ACE editor instance
		this.conversationArea = null
		this.chatContainer = null;
		this.fileBar = null; // NEW: for file context chips
		this.submitButton = null
		// Initialize markdown-it with highlight.js for code highlighting
		this.md = window.markdownit({ // hljs is available globally via <script> tag
			highlight: function (str, lang) {
				if (lang && hljs.getLanguage(lang)) {
					return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
				}
				// For 'diff' or other unhandled languages, return empty string to let markdown-it
				// perform its default escaping. The raw content is then read by _addCodeBlockButtons.
				return '';
			}
		});
		
		this.historyManager = new AIManagerHistory(this)
		
		this.contextStaleNotice = null; // New element for context currency check
		this._emptyStateElement = null; // NEW: For empty state background
		this._contextStaleResolve = null; // To resolve/reject the context stale promise		
		this.useWorkspaceSettings = false
		this._isProcessing = false // Flag to track if AI is busy (generating or summarizing)

		// Reference to the AI info display element
		this.aiInfoDisplay = null;

		// Load summarization settings defaults
		this.config = {
			summarizeThreshold: 85,
			summarizeTargetPercentage: 50,
		}

		// NEW: Session Management Properties
		this.allSessionMetadata = []; // Array of {id, name, createdAt, lastModified} - used for UI list
		this.activeSessionId = null; // ID of the currently active session
		this.activeSession = null; // The full active session object {id, name, messages, promptInput, promptHistory}
		this.promptIndex = -1; // Index for the current session's prompt history (Ctrl+Up/Down)
		this._unsentPromptBuffer = null; // NEW: To store unsubmitted prompt during history navigation

		// NEW: Session TabBar properties
		this.sessionTabBar = null;
		this.newSessionButton = null;
		this.settingsButton = null; // NEW: Reference for settings button

		this.saveWorkspaceTimeout = null; // For debouncing workspace saves from _dispatchContextUpdate
	}

	async init(panel) {
		this.panel = panel
		await this.loadSettings()
		this._loadSystemPromptConfig(); // NEW: Load prompt settings
		
		// Initialize the AI provider instance
		this.ai = new this.aiProviders[this.aiProvider]();
		
		// Wrap AI initialization in try-catch to prevent UI freeze on configuration errors
		try {
			await this.ai.init(); // Initialize with loaded settings. This is where the Ollama error occurs.
		} catch (error) {
			console.error("AIManager: Error initializing AI provider:", error);
			// Display an error message to the user in the conversation area
            this.historyManager.addMessage({
                type: "system_message",
                content: `Error initializing AI provider (${this.aiProvider}). Please check your settings. Details: ${error.message}`,
                timestamp: Date.now(),
            }, false);
            // Ensure UI is not blocked
            this._isProcessing = false;
            this._setButtonsDisabledState(false);
		}

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
		this._initPromptEditor();
		this.settingsManager.init(); // NEW: Initialize settings manager
		this._setupPanel();
		
		this._updateAIInfoDisplay();
        this._updatePromptAreaPlaceholder(); // Ensure placeholder is correct after init
		window.addEventListener('setting-changed', this._handleSettingChangedExternally.bind(this));
	}

    /**
     * NEW: Generates the system prompt based on current settings.
     * This is intended to be called by the History Manager or AI Provider before making a request.
     * @returns {string} The complete system prompt string.
     */
    getSystemPrompt() {
        return systemPromptBuilder(this.getSystemPromptConfig());
    }

    /**
     * NEW: Gets the active system prompt configuration, checking workspace first.
     * @returns {object} The active system prompt configuration.
     */
    getSystemPromptConfig() {
        const hasWorkspaceConfig = window.workspace?.systemPromptConfig && Object.keys(window.workspace.systemPromptConfig).length > 0;
        return hasWorkspaceConfig ? window.workspace.systemPromptConfig : (window.app?.systemPromptConfig || this.systemPromptConfig);
    }

    /**
     * NEW: Loads the system prompt config from the correct source (workspace or app).
     */
    _loadSystemPromptConfig() {
        const hasWorkspaceConfig = !!(window.workspace?.systemPromptConfig && Object.keys(window.workspace.systemPromptConfig).length > 0);
        this.systemPromptConfig = hasWorkspaceConfig ? window.workspace.systemPromptConfig : (window.app?.systemPromptConfig || this.systemPromptConfig);
    }

    /**
     * NEW: Callback for the settings manager to save system prompt settings.
     * @param {object} config - The new system prompt configuration.
     * @param {boolean} useWorkspaceSettings - Whether to save to workspace or global app config.
     */
    saveSystemPromptConfig(config, useWorkspaceSettings) {
        if (useWorkspaceSettings) {
            window.workspace.systemPromptConfig = config;
            if (window.app.systemPromptConfig) delete window.app.systemPromptConfig; // Clear global if using workspace
            if(window.saveWorkspace) window.saveWorkspace();
        } else {
            window.app.systemPromptConfig = config;
            if (window.workspace.systemPromptConfig) delete window.workspace.systemPromptConfig; // Clear workspace if using global
            if(window.saveAppConfig) window.saveAppConfig(); // Persist global settings
        }
    }

	set editor(editor) {
		this.ai.editor = editor
	}

	get editor() {
		return this.ai.editor
	}

	focus() {
		this.promptEditor?.focus()
	}

	_setupPanel() {
		this.panel.setAttribute("id", "ai-panel")
	}

	_createUI() {
		// --- Session TabBar UI ---
		this.sessionTabBar = new TabBar();
		this.sessionTabBar.classList.add('ai-session-tabs');
		this.sessionTabBar.setAttribute('slim', '');
		this.sessionTabBar.classList.add('tabs-inverted');
		this.sessionTabBar.exclusiveDropType = "ai-tab"
		this.sessionTabBar.click = (e) => this.switchSession(e.tab.config.id);
		this.sessionTabBar.close = (e) => this.deleteSession(e.tab.config.id, e.tab);

		this.newSessionButton = new Button("");
		this.newSessionButton.icon = "add_comment";
		this.newSessionButton.title = "New Chat";
		this.newSessionButton.classList.add('new-session-button');
		this.newSessionButton.on('click', () => this.createNewSession());
		
		this.settingsButton = new Button("");
		this.settingsButton.icon = "settings";
		this.settingsButton.classList.add("settings-button");
		this.settingsButton.onclick = () => this.toggleSettingsPanel();

		this.sessionTabBar.append(this.newSessionButton, this.settingsButton)
		
		// --- NEW FileBar and Context Progress Bar ---
		const fileBarContainer = new Block();
		fileBarContainer.classList.add('ai-filebar-container');

		this.fileBar = new FileBar();
		this.fileBar.classList.add('ai-file-context-bar');
		// Listen for requests to remove a file, originating from a chip's close button
		this.fileBar.on('file-remove-request', (e) => {
			const fileId = e.detail.fileId;
			// Find the message before it gets deleted to retrieve the filename
			const fileMessage = this.activeSession?.messages.find(m => m.id === fileId);
			if (fileMessage) {
				this.historyManager.addMessage({
					type: 'system_message',
					content: `**${fileMessage.filename}** removed from this context.`,
					timestamp: Date.now()
				}, false);
			}
			// Proceed with the deletion
			this.historyManager._handleDeleteFileContextItem(fileId);
		});
		this.progressBar = this._createProgressBar();
		fileBarContainer.append(this.fileBar, this.progressBar);

		// --- Other UI Elements ---
		this.conversationArea = this._createConversationArea();
		const promptContainer = this._createPromptContainer();
		this.settingsPanel = this.settingsManager.createPanel(); // NEW: Create panel via manager

		this.chatContainer = new Block();
		this.chatContainer.classList.add('ai-chat-container');
		this._emptyStateElement = this._createEmptyStateElement();
		this.chatContainer.append(fileBarContainer, this.conversationArea, this._emptyStateElement);

		this.panel.append(this.chatContainer, this.settingsPanel, this.sessionTabBar, promptContainer);
	}
	
	_createConversationArea() {
		const conversationArea = new Block()
		conversationArea.classList.add("conversation-area")
		return conversationArea
	}

	_createProgressBar() {
		const progressBar = document.createElement("div")
		progressBar.classList.add("progress-bar")
		progressBar.setAttribute("title", "Context window utilization")
		progressBar.style.display = "block" // Now always visible

		const progressBarInner = document.createElement("div")
		progressBarInner.classList.add("progress-bar-inner")
		progressBar.appendChild(progressBarInner)
		return progressBar;
	}

	/**
	 * Creates a new spinner element wrapped in a container for centering.
	 * @returns {HTMLElement} The spinner container element.
	 */
	_createSpinner() {
		const spinnerContainer = document.createElement('div');
		spinnerContainer.classList.add('spinner-container');
		const spinner = document.createElement('div');
		spinner.classList.add('loading-spinner');
		spinnerContainer.append(spinner);
		return spinnerContainer;
	}

	_createPromptContainer() {
		const promptContainer = new Block()
		promptContainer.classList.add("prompt-container")

		this.promptArea = this._createPromptArea()
		
		const buttonContainer = new Block()
		buttonContainer.classList.add("button-container");

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

		promptContainer.append(this.promptArea)
		promptContainer.append(buttonContainer)

		return promptContainer
	}

	_createPromptArea() {
		// This now creates the container for the ACE editor.
		const promptAreaContainer = document.createElement("div")
		promptAreaContainer.classList.add("prompt-area")
		promptAreaContainer.setAttribute("id", "ai-prompt-editor-container")
		// The editor instance is created and configured in _initPromptEditor
		return promptAreaContainer;
	}

	// NEW METHOD: Initialize the ACE editor for the prompt area
	_initPromptEditor() {
		if (!window.ace || !this.promptArea) return; // Ensure ACE and container are ready

		this.promptEditor = ace.edit(this.promptArea);
		this.promptEditor.id = "ai-prompt-editor"
		this.promptEditor.session.setMode("ace/mode/markdown");
		this.promptEditor.setOptions(promptEditorSettings)
		this.promptEditor.renderer.setScrollMargin(4, 4, 4, 4);

		// Sync theme and keybindings with the main editor
		if (window.editors && window.editors.length > 0) {
			const mainEditor = window.editors[0];
			this.promptEditor.setTheme(mainEditor.getTheme());
			// disabled this, we actually don't want to sync the keyboard handler
			// this.promptEditor.setKeyboardHandler(mainEditor.getKeyboardHandler());
			if (!window.editors.includes(this.promptEditor)) {
				window.editors.push(this.promptEditor);
			}
		}
		
		// NEW: Remove default conflicting keybindings before adding our own.
		this.promptEditor.on("ready", ()=>{
			console.log("removing some default commands")
			this.promptEditor.commands.removeCommand('movelinesup');
			this.promptEditor.commands.removeCommand('movelinesdown');
		})

		this.promptEditor.commands.addCommand({
			name: "submitPrompt",
			bindKey: { win: "Ctrl-Enter", mac: "Ctrl-Enter|Command-Enter" },
			exec: () => this.generate(),
		});

		this.promptEditor.commands.addCommand({
			name: "promptHistoryUp",
			bindKey: { win: "Alt-Up", mac: "Alt-Up" },
			exec: () => {
				if (this.activeSession?.promptHistory?.length > 0) {
					// If we are at the "new prompt" line, save the current input before navigating up.
					if (this.promptIndex === this.activeSession.promptHistory.length) {
						this._unsentPromptBuffer = this.promptEditor.getValue();
					}
					this.promptIndex = Math.max(0, this.promptIndex - 1);
					this.promptEditor.setValue(this.activeSession.promptHistory[this.promptIndex] || "", -1);
				}
			},
		});

		this.promptEditor.commands.addCommand({
			name: "promptHistoryDown",
			bindKey: { win: "Alt-Down", mac: "Alt-Down" },
			exec: () => {
				if (this.activeSession?.promptHistory?.length > 0) {
					this.promptIndex = Math.min(this.activeSession.promptHistory.length, this.promptIndex + 1);
					// If we navigate to the end, restore the unsent buffer; otherwise, use history.
					const prompt = this.promptIndex === this.activeSession.promptHistory.length 
						? (this._unsentPromptBuffer || "") 
						: this.activeSession.promptHistory[this.promptIndex];
					this.promptEditor.setValue(prompt || "", -1);
				}
			},
		});

		this.promptEditor.on("change", () => this._resizePromptArea());
		this.promptEditor.resize(); // Perform initial resize
	}

	// NEW METHOD: Encapsulates prompt area resizing logic
	_resizePromptArea() {
		if (this.promptEditor) {
			// ACE's auto-resize is handled by minLines/maxLines options.
			// We just need to call resize() to trigger it.
			this.promptEditor.resize();
			// --- Custom & EXCLUSIVE Autocompleter for @file context ---
			const langTools = ace.require("ace/ext/language_tools");
			const fileContextCompleter = {
				// This regex tells ACE what constitutes a "word" for this completer.
				// It will activate on '@' and replace the whole token.
				identifierRegexps: [/@[\w.]*/],
				getCompletions: (editor, session, pos, prefix, callback) => {
					// Only activate this completer for our AI prompt editor
					if (editor.id !== "ai-prompt-editor") {
						return callback(null, []);
					}
					// Check if the cursor is inside an @-word
					const line = session.getLine(pos.row).substring(0, pos.column);
					const match = line.match(/@(\S*)$/);
					if (!match) {
						// No @-word found, so we provide no completions.
						return callback(null, []);
					}
					// ACE automatically provides the text after the '@' as the prefix.
					const searchTerm = prefix;
					const fileResults = window.ui.fileList.find(searchTerm, 20);
					const fileCompletions = fileResults.map(item => ({
						caption: item.name,
						value: item.path, // Insert the full path when selected.
						meta: "File Context"
					}));
					// 2. Define and filter our default static options.
					const defaultContextOptions = [
						{ value: 'open', caption: '@open', meta: 'All open files' },
						{ value: 'code', caption: '@code', meta: 'Current file/selection' }
					];
					const filteredDefaults = defaultContextOptions.filter(opt =>
						opt.caption.startsWith(`@${searchTerm}`)
					);

					// 3. Combine the static options and the file results.
					const allCompletions = [...filteredDefaults, ...fileCompletions];
					callback(null, allCompletions);				
				}
			};
			// By setting the completers array directly on the editor instance,
			// we prevent the default ACE completers (keywords, snippets) from running.
			this.promptEditor.completers = [fileContextCompleter];
		}
	}

    // NEW METHOD: Updates the prompt area placeholder text based on AI configuration
    _updatePromptAreaPlaceholder() {
        if (!this.promptEditor) return;

        if (this.ai && this.ai.isConfigured()) {
			this.promptEditor.setReadOnly(false);
            this.promptEditor.setOption("placeholder", "Enter your prompt here...");
        } else {
			this.promptEditor.setReadOnly(true);
            this.promptEditor.setOption("placeholder", "AI is not configured. Go to Settings (gear icon) to set up a provider.");
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
	_createContextStaleNoticeElement() {
		const noticeBlock = new Block();
		// This notice is now an inline chat message. It reuses system-message styling
		// and removes the old 'notice-bar' class to avoid CSS conflicts.
		noticeBlock.classList.add("system-message-block", "context-stale-notice");
		noticeBlock.innerHTML = `
			<span class="message"></span>
			<div class="button-group">
				<button class="update-button theme-button">Update Context</button>
				<button class="keep-old-button theme-button">Keep Old</button>
				<button class="cancel-button">Cancel</button>
			</div>
		`;

		noticeBlock.querySelector(".update-button").addEventListener("click", () => {
			if (this._contextStaleResolve) {
				this._contextStaleResolve(true); // User chose to update
				this._hideContextStaleNotice();
			}
		});

		noticeBlock.querySelector(".keep-old-button").addEventListener("click", () => {
			if (this._contextStaleResolve) {
				this._contextStaleResolve(false); // User chose to keep old
				this._hideContextStaleNotice();
			}
		});
		noticeBlock.querySelector(".cancel-button").addEventListener("click", () => {
			if (this._contextStaleResolve) {
				this._contextStaleResolve('cancel'); // User chose to cancel
				this._hideContextStaleNotice();
			}
		});		
		return noticeBlock;
	}
	
	// NEW: Create the background element for when the chat is empty
	_createEmptyStateElement() {
		const el = document.createElement('div');
		el.className = 'ai-background-element';
		el.innerHTML = `
			<ui-icon icon="developer_board" style="font-size: 48px; opacity: 0.5;">developer_board</ui-icon>
			<div class="caption">AI Assistant Ready<br/>Type a prompt to begin.</div>
		`;
		el.style.display = 'none'; // Initially hidden
		return el;
	}

	_showContextStaleNotice(message) {
		this.contextStaleNotice = this._createContextStaleNoticeElement();
		const messageElement = this.contextStaleNotice.querySelector(".message");
        const updateButton = this.contextStaleNotice.querySelector(".update-button");

		messageElement.innerHTML = this.md.render(message);
		this.conversationArea.append(this.contextStaleNotice);

        // Focus the update button so the user can just press Enter to accept the update.
        // A slight delay ensures the element is fully rendered and focusable.
        setTimeout(() => updateButton.focus(), 100);
	}

	_hideContextStaleNotice() {
		if (this.contextStaleNotice && this.contextStaleNotice.parentElement) {
			this.contextStaleNotice.remove();
		}
		this.contextStaleNotice = null;
	}

	// Helper to disable/enable relevant buttons
	_setButtonsDisabledState(disabled) {
        const isAIConfigured = this.ai && this.ai.isConfigured() && !this._isProcessing; // Also consider overall processing state

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
				tab.close.style.pointerEvents = disabled ? 'none' : '';
				tab.style.pointerEvents = disabled ? 'none' : 'auto';
			});
		}

        this._updatePromptAreaPlaceholder(); // Update prompt area disabled state
	}

    /**
     * NEW: Switches the AI provider, re-initializes it, and updates the UI.
     * This is called by the settings manager.
     * @param {string} newProviderValue - The key for the new provider (e.g., 'ollama').
     */
    async switchAiProvider(newProviderValue) {
        this.aiProvider = newProviderValue;
        localStorage.setItem("aiProvider", this.aiProvider);

        this.ai = new this.aiProviders[this.aiProvider]();

        try {
            const providerConfig = window.workspace.aiConfig?.[this.aiProvider] || window.app.aiConfig?.[this.aiProvider];
            if (providerConfig) {
                const useWorkspaceSettings = !!window.workspace.aiConfig?.[this.aiProvider];
                await this.ai.setOptions(providerConfig, null, null, useWorkspaceSettings, useWorkspaceSettings ? 'workspace' : 'global');
            }
            await this.ai.init();
            this.historyManager.addMessage({
                type: "system_message",
                content: `AI provider switched to **${this.aiProvider}**. ` +
                         (this.ai.isConfigured()
                            ? `Current model: **${this.ai.config.model}**`
                            : `Please configure the provider settings.`),
                timestamp: Date.now()
            }, false);
        } catch (error) {
            console.error("AIManager: Error initializing new AI provider during switch:", error);
            this.historyManager.addMessage({
                type: "system_message",
                content: `Error switching to ${this.aiProvider} provider. Check settings. Details: ${error.message}`,
                timestamp: Date.now()
            }, false);
        } finally {
            // Always re-render settings form, update UI, and dispatch events
            this.settingsManager.renderForm();
            this._updateAIInfoDisplay();
            this._dispatchContextUpdate("ai_provider_switched");
            this.historyManager.render();
            this._setButtonsDisabledState(this._isProcessing);
            this._updatePromptAreaPlaceholder();
        }
    }

	toggleSettingsPanel() {
		this.chatContainer.classList.toggle("hidden")
        this.settingsManager.toggle(); // NEW: Use the manager
        
        // If settings panel is being hidden, re-render chat history
		if (!this.settingsPanel.classList.contains("active")) {
			this.historyManager.render() // Re-render history to show/hide welcome message
			this._dispatchContextUpdate("settings_closed") // Dispatch on settings panel close
		} else {
			// If settings panel is being shown, (re)render its content to reflect current values
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
                const modelName = this.ai.config?.model || "No Model Selected"; // Fallback
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
        this._setButtonsDisabledState(this._isProcessing); // Ensure buttons are updated
        this._updatePromptAreaPlaceholder(); // Update placeholder
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
            const tab = this.sessionTabBar.add({ name: meta.name, id: meta.id, defaultStatusIcon: 'developer_board' });
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
        const newTab = this.sessionTabBar.add({ name: newName, id: newId, defaultStatusIcon: 'developer_board' });
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
		if (this.activeSessionId === sessionId && this.activeSession) return;

		// Save the state of the *current* active session (if any)
		if (this.activeSession && this.activeSession.id) {
			this.activeSession.promptInput = this.promptEditor.getValue();
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
		this._unsentPromptBuffer = null; // Clear any pending unsent prompt from the previous session

		// disapear the panel first		
		this.conversationArea.style.scrollBehavior = 'auto'; // Make scroll instant
		this.conversationArea.style.transition = "opacity 100ms linear"
		this.conversationArea.style.opacity = 0
		
		setTimeout(()=>{
			void this.conversationArea.scrollTop
			// Update the rest of the UI based on the new data
			// Do NOT auto-scroll to bottom. Instead, restore saved scroll position.
			this.historyManager.loadSessionMessages(this.activeSession.messages, false); 
			
			// Restore scroll position after content has been rendered
			// A small timeout ensures the DOM has updated before setting scroll.
			setTimeout(()=>{
				void this.conversationArea.scrollTop
				this.conversationArea.scrollTop = this.activeSession.scrollTop || 0;
				this.conversationArea.style.scrollBehavior = ''; // Restore smooth scrolling
				this.conversationArea.style.opacity = 1
			}, 100)
		}, 100)
		
		this.promptEditor.setValue(this.activeSession.promptInput || "", -1);
		this.promptIndex = (this.activeSession.promptHistory?.length || 0);
		this._resizePromptArea();
        this._setButtonsDisabledState(this._isProcessing);
        this._updatePromptAreaPlaceholder(); // Update placeholder after session switch
		this._dispatchContextUpdate("session_switched");
		this.promptEditor.focus(); // Ensure focus returns to the prompt editor after a switch
	}

	/**
	 * Deletes a session and tells the TabBar to remove its UI tab.
	 * The TabBar will then automatically activate another tab, triggering our switchSession handler.
	 */
	async deleteSession(sessionId, tab) {
		// if (this.allSessionMetadata.length <= 1) {
		// 	alert("Cannot delete the last remaining chat session.");
		// 	return;
		// }

		const sessionMeta = this.allSessionMetadata.find(s => s.id === sessionId);
        // Find the full session data to check its message count
        const fullSessionData = await get(`ai-session-${sessionId}`);

        // Only ask for confirmation if the session has a history AND it's not the only session left
        if (fullSessionData?.messages?.length > 0) {
			if (!confirm(`Are you sure you want to delete the chat "${sessionMeta.name}"? This action cannot be undone.`)) {
				return;
            }
        }
		
		// Delete data
		await del(`ai-session-${sessionId}`);
		this.allSessionMetadata = this.allSessionMetadata.filter(s => s.id !== sessionId);

		// If that was the last tab, we need to manually clean up the state.
		if (this.allSessionMetadata.length === 0) {
			this.activeSession = null;
			this.activeSessionId = null;
			this.historyManager.clear(true); // Force clear the UI without confirmation
		}

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
            }, false);
            this._dispatchContextUpdate("generation_error_not_configured");
            this._isProcessing = false;
            this._setButtonsDisabledState(false);
            return;
        }

		// Clear min-height from all previous response blocks to let them reflow naturally.
		this.conversationArea.querySelectorAll('.response-block').forEach(block => {
			block.style.minHeight = '';
		});
		// // NEW: Clear min-height from the previous response block if it exists
		// const lastResponseBlockInHistory = this.conversationArea.lastElementChild;
		// if (lastResponseBlockInHistory && lastResponseBlockInHistory.classList.contains("response-block")) {
		// 	lastResponseBlockInHistory.style.minHeight = '';
		// }
		// Also, clean up any loader bar that might still be present from a previous aborted generation
		this.conversationArea.querySelector('ui-loader-bar')?.remove();

		this._unsentPromptBuffer = null; // Clear the unsent prompt buffer on submission.
		this._isProcessing = true
		this._setButtonsDisabledState(true)

		const userPrompt = this.promptEditor.getValue().trim()

		if (!userPrompt) {
			this._isProcessing = false
			this._setButtonsDisabledState(false)
			return
		}

		// if (lastPrompt && lastPrompt === userPrompt) {
		// 	console.log("Skipping adding duplicate contiguous prompt to history.");
		// 	this.promptIndex = activePromptHistory.length; // Keep index at end
		// } else {
		// 	activePromptHistory.push(userPrompt);
		// 	while (activePromptHistory.length > MAX_PROMPT_HISTORY) {
		// 		activePromptHistory.shift();
		// 		if (this.promptIndex > 0) {
		// 			this.promptIndex--;
		// 		}
		// 	}
		// 	this.promptIndex = activePromptHistory.length; // Set index to end after adding
		// }

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
		// NEW: Check for stale context files and handle user interaction
		const proceed = await this._checkForStaleContextFiles(userPrompt);
		if (!proceed) {
			// Abort was chosen. _checkForStaleContextFiles handles restoration.
			return;
		}
		// Now that checks are passed, add prompt to history and clear the editor
		const activePromptHistory = this.activeSession.promptHistory;
		const lastPrompt = activePromptHistory.length > 0 ? activePromptHistory[activePromptHistory.length - 1].trim() : null;
		if (lastPrompt && lastPrompt === userPrompt) {
			console.log("Skipping adding duplicate contiguous prompt to history.");
			this.promptIndex = activePromptHistory.length; // Keep index at end
		} else {
			activePromptHistory.push(userPrompt);
			while (activePromptHistory.length > MAX_PROMPT_HISTORY) {
				activePromptHistory.shift();
				if (this.promptIndex > 0) this.promptIndex--;
			}
			this.promptIndex = activePromptHistory.length; // Set index to end after adding
		}
		this.promptEditor.setValue("");
		this._resizePromptArea();
		// Process prompt for @ tags, always using "chat" logic now.
		const { processedPrompt, contextItems } = await this.ai._getContextualPrompt(userPrompt, "chat")

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
			// NEW: Add context files to the file bar instead of the main chat area
			this.fileBar.add(contextMessage);
		});
		
		let userMessage = null;
		let userMessageElement = null; // To hold the DOM element of the user's prompt
		if(processedPrompt) {
			userMessage = { role: "user", type: "user", content: processedPrompt, timestamp: Date.now(), id: crypto.randomUUID() };
			this.activeSession.messages.push(userMessage);
			userMessageElement = this.historyManager.appendMessageElement(userMessage);
		} else {
			// Scenario: Context items were added, but no user prompt was given.
			// In this case, we don't call the AI, acknowledge the context addition, and abort.
			if (contextItems.length > 0) {
				const fileNames = contextItems.map(item => `**${item.filename}**`).join(', ');
				this.historyManager.addMessage({
					type: "system_message",
					content: `Files added to context: ${fileNames}.`,
					timestamp: Date.now(),
				}, false);
				// We still need to save the session since context items were added.
				this.activeSession.lastModified = Date.now();
				await set(`ai-session-${this.activeSession.id}`, this.activeSession);
				this._dispatchContextUpdate("context_files_updated");
			}
			this._isProcessing = false; // Release lock
			this._setButtonsDisabledState(false); // Re-enable buttons
			return; // Exit the function as there's no prompt to send to the AI.
		}

		// Save session and dispatch update now that we've confirmed there's a user prompt.
		// Update lastModified timestamp for the session
		this.activeSession.lastModified = Date.now();
		// Save the active session to IndexedDB immediately after adding user prompt and context
		await set(`ai-session-${this.activeSession.id}`, this.activeSession);

		// Render updated history in UI and dispatch event
		// this.historyManager.render(); // NO LONGER NEEDED, using dynamic appends
		this._dispatchContextUpdate("append_user"); // This will also save workspace metadata
		// NEW: Create and append the new ui-loader-bar *before* the response block
		// Ensure we calculate the space needed for the loader + response block, accounting for the file bar.
		const fileBarContainer = this.panel.querySelector('.ai-filebar-container');
		const fileBarHeight = fileBarContainer ? fileBarContainer.offsetHeight : 0;
		const availableHeightForResponse = this.conversationArea.clientHeight - (fileBarHeight+16);

		// Prepare placeholder for AI response
		const modelMessageId = crypto.randomUUID(); // Pre-generate ID for the upcoming model response
		const responseBlock = new Block();
		responseBlock.classList.add("response-block");
		responseBlock.dataset.messageId = modelMessageId; // Assign ID for future reference
		const spinner = this._createSpinner(); // Create the new spinner
		responseBlock.append(spinner); // Add spinner to the response block
		// NEW: Set a temporary min-height to ensure the scroll area is large enough
		this.conversationArea.append(responseBlock);
		responseBlock.style.minHeight = `${Math.max(50, availableHeightForResponse)}px`; // Ensure a minimum of 50px

		// NEW: Scroll the conversation area so the user's prompt is near the top.
		if (userMessageElement) {
			// We account for the sticky file bar's height, just like you remembered!
			const fileBarContainer = this.panel.querySelector('.ai-filebar-container');
			const fileBarOffset = fileBarContainer ? fileBarContainer.offsetHeight : 0;
			const PADDING_FROM_TOP = 8; // A little extra breathing room
			this.conversationArea.scrollTop = userMessageElement.offsetTop - fileBarOffset - PADDING_FROM_TOP;
		}

		const callbacks = {
			onUpdate: (fullResponse) => { // Update the responseBlock directly
				if (spinner.parentNode) spinner.remove(); // Remove spinner on first stream chunk
                // NEW: _addCodeBlockButtons will now also handle diff rendering for streaming updates
                responseBlock.innerHTML = this.md.render(fullResponse);
                this._addCodeBlockButtons(responseBlock) 
			},
			onDone: async (fullResponse, contextRatioPercent) => { // Mark async to await set
				// First, update the session data and add the delete button to the user's prompt.
				// This is safer than doing it after rendering, which could fail.
				// The spinner is removed when innerHTML is set, so no explicit removal is needed here.
				const modelMessage = { id: modelMessageId, role: "model", type: "model", content: fullResponse, diffStatuses: [], timestamp: Date.now() };
				this.activeSession.messages.push(modelMessage);
				this.historyManager.addInteractionToLastUserMessage(userMessage); // Add delete button to user prompt
				this.activeSession.lastModified = Date.now();
				await set(`ai-session-${this.activeSession.id}`, this.activeSession);

				// Now, render the final response in the UI.
				// DEV: For visual debugging, let's pop a loader bar on top of every model response.
				responseBlock.innerHTML = this.md.render(fullResponse);
				
				this._addCodeBlockButtons(responseBlock, modelMessage); // Pass the message object here to read/write persistent state
				
				this._dispatchContextUpdate("append_model") // Dispatch after model response

				this._isProcessing = false // Release lock
				this._setButtonsDisabledState(false) // Re-enable buttons
			},
			onError: async (error) => { // Mark async to await set
				// The spinner is also removed here when innerHTML is overwritten.
				responseBlock.style.minHeight = ''; // Reset min-height on error too
				responseBlock.innerHTML = `Error: ${error.message}`
				console.error(`Error calling ${this.ai.config.model} API:`, error);

				const errorMessage = {
					id: modelMessageId, // Use the pre-generated ID for the block
					role: "error",
					type: "error",
					content: `Error: ${error.message}`,
					timestamp: Date.now(),
					diffStatuses: [], // Initialize even for errors, though no diffs expected here
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

		// Since we now return early if `processedPrompt` is empty, we can unconditionally call the AI here.
		const messagesForAI = this.historyManager.prepareMessagesForAI()
		const systemPrompt = this.getSystemPrompt();
		this.ai.chat(messagesForAI, callbacks, systemPrompt)
	}

	_addCodeBlockButtons(responseBlock, messageObject = null) { // Add messageObject parameter
		const preElements = responseBlock.querySelectorAll("pre")
		preElements.forEach((pre, index) => {
            // Check if buttons are already added to this <pre> element
            if (pre.querySelector('.code-buttons')) {
                return; // Skip if buttons already exist
            }

			const codeElement = pre.querySelector("code") // Get the code element inside pre
			const isDiff = codeElement && codeElement.classList.contains('language-diff');

			const buttonContainer = new Block()

            // Ensure messageObject.diffStatuses exists and is an array
            if (messageObject && !Array.isArray(messageObject.diffStatuses)) {
                messageObject.diffStatuses = [];
            }
			buttonContainer.classList.add("code-buttons")

			if (!isDiff) {
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
			}

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
            if (isDiff) {
                const originalDiffString = codeElement.textContent; // Get the raw diff content

                // Infer the language from the '+++ b/path/to/file.ext' line in the diff.
                const highlightLang = this._inferLanguageFromDiff(originalDiffString);

                // Render the diff using DiffHandler, passing the inferred language for highlighting
                const renderedDiffHtml = DiffHandler.renderStateless(originalDiffString, 'html', highlightLang, hljs);
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

                // Check state from messageObject if available
                if (messageObject && messageObject.diffStatuses && messageObject.diffStatuses[index]) {
                    applyDiffButton.icon = "done";
                    applyDiffButton.title = "Diff applied successfully!";

                    // If diff is applied, start it in collapsed state
                    pre.removeAttribute("expanded"); // Remove any expanded state
                    pre.setAttribute("collapsed", ""); // Apply collapsed state
                    expandCollapseButton.icon = "unfold_more";
                    expandCollapseButton.title = "Expand code block";

                } else {
                    applyDiffButton.icon = "merge"; // Suitable icon for applying changes
                    applyDiffButton.title = "Apply diff to file";
                }

                applyDiffButton.on("click", async () => {
                    const rawDiff = pre.dataset.originalDiffContent;
                    if (!rawDiff) {
                        alert("Error: Could not retrieve original diff content to apply.");
                        return;
                    }

                    // Extract target path from diff header (e.g., +++ b/path/to/file)
                    const targetPathMatch = rawDiff.match(/^\+\+\+ b\/(.+)$/m) || rawDiff.match(/^\+\+\+ (.+)$/m);
                    if (!targetPathMatch || !targetPathMatch[1]) {
                        alert("Error: Could not determine target file path from diff header. Ensure the diff starts with '+++ b/filename'.");
                        return;
                    }
                    const targetPath = targetPathMatch[1];

                    // 1. Find the ORIGINAL content from the chat history using a robust search.
                    let originalContentFromContext = null;
                    const normalizedTargetPath = targetPath.startsWith('/') ? targetPath.substring(1) : targetPath;

                    let exactMatch = null;
                    let partialMatches = [];

                    // Iterate backward to find the most recent matching file context.
                    for (let i = this.activeSession.messages.length - 1; i >= 0; i--) {
                        const msg = this.activeSession.messages[i];
                        if (msg.type === "file_context" && msg.id) {
                            const normalizedMsgId = msg.id.startsWith('/') ? msg.id.substring(1) : msg.id;
                            if (normalizedMsgId === normalizedTargetPath) {
                                exactMatch = msg.content;
                                break; // Found exact match, this is the best case.
                            }
                            if (normalizedMsgId.endsWith(normalizedTargetPath)) {
                                partialMatches.push(msg.content);
                            }
                        }
                    }

                    if (exactMatch) {
                        originalContentFromContext = exactMatch;
                    } else if (partialMatches.length > 0) {
                        // Use the most recent partial match (first one found when iterating backwards).
                        originalContentFromContext = partialMatches[0];
                    }

                    if (!originalContentFromContext) {
                        alert(`Error: The original content for "${targetPath}" was not found in this chat session's context history. Cannot apply diff.`);
                        return;
                    }
                    // 2. Find the LIVE editor tab using the AI's helper.
                    // This is made resilient to diffs that may omit the leading slash.
                    let tabToUpdate = await this.ai._getTabSessionByPath(targetPath);
                    // If the path from the diff doesn't match, try adding a leading slash.
                    if (!tabToUpdate && !targetPath.startsWith('/')) {
                        tabToUpdate = await this.ai._getTabSessionByPath(`/${targetPath}`);
                    }
                    
                    if (!tabToUpdate) {
                        alert(`Error: File "${targetPath}" is not currently open in the editor. Please open the file to apply the diff.`);
                        return;
                    }

                    // 3. Apply the diff using DiffHandler, using content from history
                    const newFileContentFromDiff = DiffHandler.applyAIResponseDiff(originalContentFromContext, rawDiff);

                    if (newFileContentFromDiff === null) {
                        alert(`Failed to apply diff to "${targetPath}". There might be a content mismatch with the file as it was originally sent to AI. Please review the diff manually.`);
                        console.error("Diff application failed:", { originalContentFromContext, rawDiff });
                        applyDiffButton.classList.remove("diff-apply-success"); // Ensure success state is removed
                        applyDiffButton.classList.add("diff-apply-failed");
                    } else {
                    	
                        // 4. Update the live file content in the editor, preserving undo history.
                        const session = tabToUpdate.config.session;
                        const doc = session.getDocument();
                        const lastRow = doc.getLength() - 1;
                        const lastCol = doc.getLine(lastRow).length;
                        const fullRange = new window.ace.Range(0, 0, lastRow, lastCol);
                        session.replace(fullRange, newFileContentFromDiff);
                        
                        // IMPORTANT: DO NOT call session.markClean() here.
                        // replace() marks it dirty, which is correct because it's not saved to disk yet.
                        // The user should manually save after applying.

                        // Provide visual feedback
                        applyDiffButton.classList.remove("diff-apply-failed"); // Ensure failure state is removed
                        applyDiffButton.classList.add("diff-apply-success");
                        applyDiffButton.icon = "done"; 
                        applyDiffButton.title = "Diff applied successfully!";
                        // NEW: Update the diff status in the message object and save
                        if (messageObject) {
                            messageObject.diffStatuses[index] = true;
                            await set(`ai-session-${this.activeSession.id}`, this.activeSession); // Save the session immediately
                        }
                        // Add a system message to chat history for persistent feedback
                        this.historyManager.addMessage({
                            type: "system_message",
                            content: `Diff successfully applied to **${targetPath}**. Remember to save the file.`,
                            timestamp: Date.now(),
                        }, false); // Auto-scroll is now automatically suppressed for system messages
                    }
                });
                buttonContainer.append(applyDiffButton);
            }

			pre.prepend(buttonContainer)
		})
	}

	/**
	 * NEW METHOD: Infers the programming language from a diff string by parsing the
	 * '+++' line and matching the file extension against the global window.ace_modes.
	 * @param {string} diffContent - The full text content of the diff.
	 * @returns {string|null} The inferred language name (e.g., "javascript") or null if not found.
	 */
	_inferLanguageFromDiff(diffContent) {
		if (!window.ace_modes) {
			console.warn("AIManager: window.ace_modes is not available. Cannot infer language for diff highlighting.");
			return null;
		}

		// Regex to find the filename from the '+++' line.
		const filenameMatch = diffContent.match(/^\+\+\+\s(?:b\/)?(.+?)(?:\t.*)?$/m);
		if (!filenameMatch || !filenameMatch[1]) {
			return null; // Could not find a filename in the diff header.
		}
		const filename = filenameMatch[1];

		// Iterate through ace_modes to find a matching language.
		for (const lang in window.ace_modes) {
			const mode = window.ace_modes[lang];
			if (mode && mode.extRe instanceof RegExp) {
				// IMPORTANT: Reset lastIndex for global regexes to avoid state issues.
				mode.extRe.lastIndex = 0;
				if (mode.extRe.test(filename)) {
					// Return the language name compatible with highlight.js
					// (ace_modes keys are generally compatible).
					return lang;
				}
			}
		}

		// No language matched the file extension.
		return null;
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
			// Just update the file bar, which is the only visual representation of file context.
			this.historyManager.populateFileBar();
			this._dispatchContextUpdate("context_files_updated"); // Dispatch event
		}
	}
	
	/**
	 * NEW METHOD: Checks if any file context messages in the current session are stale
	 * (i.e., their content no longer matches the live file on disk).
	 * If stale files are found, it presents a confirmation dialog to the user.
	 * Returns a Promise that resolves when the user has made a choice.
	 */
	async _checkForStaleContextFiles(originalPrompt) {
		if (!this.activeSession) return true;

		const staleFileContexts = [];
		for (const message of this.activeSession.messages) {
			if (message.type === "file_context" && message.filename) {
				try {
					// Use message.id, which holds the full path, to find the tab.
					const tabInfo = await this.ai._getTabSessionByPath(message.id);
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

			const modifiedFiles = staleFileContexts.filter(f => f.liveContent !== null);
			const removedFiles = staleFileContexts.filter(f => f.liveContent === null);

			let message = `**Context Update Needed**\n\n`;
			if (modifiedFiles.length > 0) {
				message += `The following file(s) have been modified:\n`;
				modifiedFiles.forEach(stale => {
					message += `* \`${stale.message.filename}\`\n`;
				});
			}
			if (removedFiles.length > 0) {
				if (modifiedFiles.length > 0) message += `\n`;
				message += `The following file(s) are no longer open and will be removed from context:\n`;
				removedFiles.forEach(stale => {
					message += `* \`${stale.message.filename}\`\n`;
				});
			}
			message += `\nDo you want to apply these updates before proceeding?`;
			this._showContextStaleNotice(message);

			const userChoice = await new Promise(resolve => {
				this._contextStaleResolve = resolve;
			});

			if (userChoice === 'cancel') {
				// this.promptEditor.setValue(originalPrompt, -1); // Restore prompt - no longer needed as editor is not cleared yet
				this._isProcessing = false;
				this._setButtonsDisabledState(false);
				return false; // Signal to abort
			}
			if (userChoice === true) { // User chose to update
				this._updateStaleContextFiles(staleFileContexts);
			}
			// If userChoice is false, do nothing; the old context will be used.
			return true; // Signal to proceed
		}
		return true; // No stale files, proceed
	}
	
	async loadSettings() {
		const storedProvider = localStorage.getItem("aiProvider")
		if (storedProvider && this.aiProviders[storedProvider]) {
			this.aiProvider = storedProvider
		}

        // NEW: System prompt config is now loaded in init via _loadSystemPromptConfig()
        // to ensure it happens after workspace data is available in main.js.
        // The values will be correctly picked up from app/workspace objects.

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
