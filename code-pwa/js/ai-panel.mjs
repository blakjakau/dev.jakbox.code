// Styles for this module are located in css/ai-panel.css
import { Block, Button, Icon } from "./elements.mjs"


class AIPanel {
	constructor() {
        this.ai = null;
		this.prompts = []
		this.promptIndex = -1 // -1 indicates no prompt from history is currently displayed
		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit();
        this.runMode = "chat"; // chat or generate
	}

	init(panel, ai) {
		this.panel = panel;
        this.ai = ai;
        this.ai.init();
		this._setupPanel()
		this._createUI()
		this._setupGlobalShortcuts()
	}

	set editor(editor) {
		this.ai.editor = editor;
	}

	get editor() {
		return this.ai.editor;
	}

	focus() {
		this.promptArea.focus()
	}

	_setupPanel() {
		//this.panel.style.display = "flex"
		this.panel.setAttribute("id", "ai-panel")
	}

	_createUI() {
		this.conversationArea = this._createConversationArea()
		const promptContainer = this._createPromptContainer()
		this.panel.append(this.conversationArea)
		this.panel.append(promptContainer)
	}

	_createConversationArea() {
		const conversationArea = new Block()
		conversationArea.classList.add('conversation-area');
		return conversationArea
	}

	_createPromptContainer() {
		const promptContainer = new Block()
		promptContainer.classList.add("prompt-container")

        this.progressBar = document.createElement("div");
		this.progressBar.classList.add("progress-bar");
		this.progressBar.setAttribute("title", "context window utilization");
        this.progressBar.style.display = 'none';

        const progressBarInner = document.createElement("div");
		progressBarInner.classList.add("progress-bar-inner");
        this.progressBar.appendChild(progressBarInner);
        promptContainer.appendChild(this.progressBar);

		this.promptArea = this._createPromptArea()
		const buttonContainer = new Block();
		buttonContainer.classList.add("button-container");

        this.runModeButton = this._createRunModeButton();
		this.submitButton = this._createSubmitButton();
		this.clearButton = this._createClearButton();

        buttonContainer.append(this.runModeButton);
        const spacer = new Block();
        spacer.classList.add("spacer");
        buttonContainer.append(spacer);
		buttonContainer.append(this.clearButton);
		buttonContainer.append(this.submitButton);

		const checkboxContainer = new Block();
		checkboxContainer.classList.add("checkbox-container");

		const settingsButton = new Button();
		settingsButton.classList.add('settings-button');
		settingsButton.icon = 'settings';
		settingsButton.on('click', () => this.toggleSettingsPanel());
		buttonContainer.prepend(settingsButton);

		promptContainer.append(this.promptArea);
		promptContainer.append(buttonContainer);
		promptContainer.append(checkboxContainer);

		return promptContainer
	}

	_createPromptArea() {
		const promptArea = document.createElement("textarea")
		promptArea.classList.add("prompt-area")
		promptArea.placeholder = "Enter your prompt here..."
		promptArea.addEventListener('keydown', (e) => {
			if (e.ctrlKey && e.key === 'Enter') {
				e.preventDefault();
				this.generate();
			} else if (e.ctrlKey && e.key === 'ArrowUp') {
				e.preventDefault();
				if (this.prompts.length > 0) {
					this.promptIndex = Math.max(0, this.promptIndex - 1);
					this.promptArea.value = this.prompts[this.promptIndex];
					this.promptArea.style.height = 'auto'; // Reset height to recalculate
					this.promptArea.style.height = this.promptArea.scrollHeight + 'px';
				}
			} else if (e.ctrlKey && e.key === 'ArrowDown') {
				e.preventDefault();
				if (this.prompts.length > 0) {
					this.promptIndex = Math.min(this.prompts.length - 1, this.promptIndex + 1);
					this.promptArea.value = this.prompts[this.promptIndex];
					this.promptArea.style.height = 'auto'; // Reset height to recalculate
					this.promptArea.style.height = this.promptArea.scrollHeight + 'px';
				}
			}
		});
		promptArea.addEventListener('input', () => {
			promptArea.style.height = 'auto';
			promptArea.style.height = promptArea.scrollHeight + 'px';
		});
		return promptArea
	}

    _createRunModeButton() {
        const runModeButton = new Button("Chat");
        runModeButton.icon = "chat";
        runModeButton.classList.add("run-mode-button", "theme-button");
        runModeButton.on("click", () => {
            if (this.runMode === "chat") {
                this.runMode = "generate";
                runModeButton.text = "Generate";
                runModeButton.icon = "code";
                this.progressBar.style.display = 'block';
            } else {
                this.runMode = "chat";
                runModeButton.text = "Chat";
                runModeButton.icon = "chat";
                this.progressBar.style.display = 'none';
            }
        });
        return runModeButton;
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
			this.conversationArea.innerHTML = ""; // Clear all response blocks
			this.ai.clearContext();
		})
		return clearButton
	}

	toggleSettingsPanel() {
	  this.panel.classList.toggle('settings-open');
	  this.conversationArea.classList.toggle('hidden');
	}

	async generate() {
		const userPrompt = this.promptArea.value;
		if (!userPrompt) {
			return;
		}

		this.prompts.push(userPrompt);
		this.promptArea.value = '';
		this.panel.dispatchEvent(new CustomEvent('new-prompt', { detail: this.prompts }));
		this.promptIndex = this.prompts.length; // Reset index to the end of the array

		const promptPill = new Block();
		promptPill.classList.add('prompt-pill');
		promptPill.innerHTML = userPrompt;
		this.conversationArea.append(promptPill);

		const responseBlock = new Block();
		responseBlock.classList.add('response-block');
		this.conversationArea.append(responseBlock);

		const spinner = new Block();
		spinner.classList.add('spinner');
		this.conversationArea.append(spinner);

        const callbacks = {
            onUpdate: (fullResponse) => {
                responseBlock.innerHTML = this.md.render(fullResponse);
                this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
            },
            onDone: (contextRatio) => {
                this._addCodeBlockButtons(responseBlock);
                if(contextRatio) {
					const progressBarInner = this.progressBar.querySelector(".progress-bar-inner");
					progressBarInner.style.width = (contextRatio*100)+"%"; // Set initial progress
				}
                spinner.remove();
            },
            onError: (error) => {
                responseBlock.innerHTML = `Error: ${error.message}`;
			    console.error('Error calling Ollama API:', error);
                spinner.remove();
            }
        };

        if (this.runMode === "chat") {
            this.ai.chat(userPrompt, callbacks);
        } else {
    		this.ai.generate(userPrompt, callbacks);
        }
	}

	_addCodeBlockButtons(responseBlock) {
		const preElements = responseBlock.querySelectorAll('pre');
		preElements.forEach(pre => {
			const buttonContainer = new Block();
			buttonContainer.classList.add('code-buttons');

			const copyButton = new Button();
			copyButton.classList.add('code-button');
			copyButton.icon = 'content_copy';
			copyButton.title = 'Copy code';
			copyButton.on('click', () => {
				const code = pre.querySelector('code').innerText;
				navigator.clipboard.writeText(code);
				// Optionally, provide visual feedback
				copyButton.icon = 'done';
				setTimeout(() => { copyButton.icon = 'content_copy'; }, 1000);
			});

			const insertButton = new Button();
			insertButton.classList.add('code-button');
			insertButton.icon = 'input';
			insertButton.title = 'Insert into editor';
			insertButton.on('click', () => {
				const code = pre.querySelector('code').innerText;
				const event = new CustomEvent('insert-snippet', { detail: code });
				window.dispatchEvent(event);
				// Optionally, provide visual feedback
				insertButton.icon = 'done';
				setTimeout(() => { insertButton.icon = 'input'; }, 1000);
			});

			buttonContainer.append(copyButton);
			buttonContainer.append(insertButton);
			pre.prepend(buttonContainer); // Prepend to place it at the top-right
		});
	}

	_setupGlobalShortcuts() {
		document.addEventListener('keydown', (e) => {
			if (e.altKey && e.key === 'Z') {
			  e.preventDefault();
			  this.toggleSettingsPanel();
			}
		});
	}
	set promptHistory(history) {
		this.prompts = history;
		this.promptIndex = history.length+1
	}

	get promptHistory() {
		return this.prompts;
	}
}

export default new AIPanel()