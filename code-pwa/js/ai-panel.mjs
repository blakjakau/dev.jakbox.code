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
        this.settingsPanel = null;
        this.useWorkspaceSettings = false; // New property
	}

	init(panel, ai) {
		this.panel = panel;
        this.ai = ai;
        this.ai.init();
		this._createUI()
		this._setupPanel()
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
        this.settingsPanel = this._createSettingsPanel();
		this.panel.append(this.conversationArea)
        this.panel.append(this.settingsPanel);
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

    _createSettingsPanel() {
    	
    	const settingsPanel = new Block();
    	settingsPanel.classList.add('settings-panel');
    	
        const form = document.createElement('form');

        const workspaceSettingsCheckbox = document.createElement('input');
        workspaceSettingsCheckbox.type = 'checkbox';
        workspaceSettingsCheckbox.id = 'use-workspace-settings';
        workspaceSettingsCheckbox.checked = this.useWorkspaceSettings;
        const workspaceSettingsLabel = document.createElement('label');
        workspaceSettingsLabel.htmlFor = 'use-workspace-settings';
        workspaceSettingsLabel.textContent = 'Use workspace-specific settings';
        workspaceSettingsLabel.prepend(workspaceSettingsCheckbox);
        form.appendChild(workspaceSettingsLabel);

        const toggleInputs = (disabled) => {
            const inputs = form.querySelectorAll('input:not(#use-workspace-settings), textarea, select');
            inputs.forEach(input => {
                input.disabled = disabled;
            });
        };

        workspaceSettingsCheckbox.addEventListener('change', () => {
            this.useWorkspaceSettings = workspaceSettingsCheckbox.checked;
            toggleInputs(this.useWorkspaceSettings);
        });

        const renderSettingsForm = async () => {
            form.innerHTML = ''; // Clear existing form content
            form.appendChild(workspaceSettingsLabel); // Re-add checkbox

            const options = await this.ai.getOptions();
            for (const key in options) {
                const setting = options[key];
                const label = document.createElement('label');
                label.textContent = `${setting.label}: `;

                let inputElement;
                if (setting.type === 'enum') {
                    inputElement = document.createElement('select');
                    inputElement.id = `ollama-${key}`;
                    setting.enum.forEach(optionValue => {
                        const option = document.createElement('option');
                        option.value = optionValue;
                        option.textContent = optionValue;
                        if (optionValue === setting.value) {
                            option.selected = true;
                        }
                        inputElement.appendChild(option);
                    });
                    if (key === 'model') { // Add refresh button for model select
                        const refreshButton = new Button();
                        refreshButton.icon = 'refresh';
                        refreshButton.classList.add('theme-button');
                        refreshButton.on('click', async () => {
                            await this.ai.refreshModels();
                            renderSettingsForm(); // Re-render the form to update model list
                        });
                        label.appendChild(refreshButton);
                    }
                } else if (setting.multiline) {
                    inputElement = document.createElement('textarea');
                    inputElement.id = `ollama-${key}`;
                    inputElement.value = setting.value;
                } else if (setting.type === 'string') {
                    inputElement = document.createElement('input');
                    inputElement.type = 'text';
                    inputElement.id = `ollama-${key}`;
                    inputElement.value = setting.value;
                } else {
                    inputElement = document.createElement('input');
                    inputElement.type = setting.type;
                    inputElement.id = `ollama-${key}`;
                    inputElement.value = setting.value;
                }
                label.appendChild(inputElement);
                form.appendChild(label);
            }

            toggleInputs(this.useWorkspaceSettings); // Initial state

            const saveButton = new Button('Save Settings');
            saveButton.icon = 'save'; // Add an icon
            saveButton.classList.add('theme-button');
            saveButton.on('click', async () => {
                const newSettings = {};
                const currentOptions = await this.ai.getOptions(); // Re-fetch current options to get latest values
                for (const key in currentOptions) {
                    const input = form.querySelector(`#ollama-${key}`);
                    if (input) {
                        newSettings[key] = input.value;
                    }
                }
                this.ai.setOptions(newSettings, (errorMessage) => {
                    const errorBlock = new Block();
                    errorBlock.classList.add('response-block');
                    errorBlock.innerHTML = `Error: ${errorMessage}`;
                    this.conversationArea.append(errorBlock);
                    this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
                }, (successMessage) => {
                    const successBlock = new Block();
                    successBlock.classList.add('response-block');
                    successBlock.innerHTML = successMessage;
                    this.conversationArea.append(successBlock);
                    this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
                }, this.useWorkspaceSettings, this.ai.settingsSource);
                this.toggleSettingsPanel();
            });
            form.appendChild(saveButton);
        };

        renderSettingsForm(); // Initial render

        settingsPanel.appendChild(form);
        return settingsPanel;
    }

	toggleSettingsPanel() {
	  this.conversationArea.classList.toggle('hidden');
	  this.settingsPanel.classList.toggle('active');
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
		// document.addEventListener('keydown', (e) => {
		// 	if (e.altKey && e.key === 'Z') {
		// 	  e.preventDefault();
		// 	  this.toggleSettingsPanel();
		// 	}
		// });
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