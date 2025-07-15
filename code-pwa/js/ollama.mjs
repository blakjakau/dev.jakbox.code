// Styles for this module are located in css/ai-panel.css
import { Block, Button, Icon } from "./elements.mjs"

class Ollama {
	constructor() {
		
		// TODO: make the endpoint and model(s) configurable on workspace or app settings
		this.config = {
			endpoint: "http://localhost:11434/api/generate",
			model: "codegemma:7b-code", // default model
			useOpenBuffers: false,
			useSmartContext: true,
			useConversationalContext: true
		}
		this.prompts = []
		this.promptIndex = -1 // -1 indicates no prompt from history is currently displayed
		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit();
		this.editor = null; // To hold the current ACE editor instance
		this.context = null; // To hold the conversational context
	}

	init(panel) {
		this.panel = panel
		this._setupPanel()
		this._createUI()
	}

	set editor(editor) {
		this._editor = editor;
	}

	get editor() {
		return this._editor;
	}

	get settings() {
		return this.config;
	}

	set settings(newConfig) {
		this.config = { ...this.config, ...newConfig };
		// Potentially save to localStorage or trigger a UI update here in the future
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

		this.promptArea = this._createPromptArea()
		const buttonContainer = new Block();
		buttonContainer.classList.add("button-container");

		this.submitButton = this._createSubmitButton();
		this.clearButton = this._createClearButton();

		buttonContainer.append(this.clearButton);
		buttonContainer.append(this.submitButton);

		const checkboxContainer = new Block();
		checkboxContainer.classList.add("checkbox-container");

		this.smartContextCheckbox = this._createSmartContextCheckbox();
		this.conversationalContextCheckbox = this._createConversationalContextCheckbox();

		checkboxContainer.append(this.smartContextCheckbox);
		checkboxContainer.append(this.conversationalContextCheckbox);

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

	_createSubmitButton() {
		const submitButton = new Button("Send")
		submitButton.classList.add("submit-button")
		submitButton.on("click", () => this.generate())
		return submitButton
	}

	_createClearButton() {
		const clearButton = new Button("Clear")
		clearButton.classList.add("clear-button")
		clearButton.on("click", () => {
			this.conversationArea.innerHTML = ""; // Clear all response blocks
			this.prompts = []; // Clear stored prompts
			this.context = null; // Clear the context
		})
		return clearButton
	}

	_createSmartContextCheckbox() {
		const label = document.createElement("label");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = "useSmartContext";
		checkbox.checked = this.config.useSmartContext;
		checkbox.addEventListener('change', (e) => {
			this.config.useSmartContext = e.target.checked;
		});
		label.append(checkbox);
		label.append(document.createTextNode(" Use Smart Context"));
		return label;
	}

	_createConversationalContextCheckbox() {
		const label = document.createElement("label");
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = "useConversationalContext";
		checkbox.checked = this.config.useConversationalContext;
		checkbox.addEventListener('change', (e) => {
			this.config.useConversationalContext = e.target.checked;
		});
		label.append(checkbox);
		label.append(document.createTextNode(" Use Conversational Context"));
		return label;
	}

	async generate() {
		const userPrompt = this.promptArea.value;
		if (!userPrompt) {
			return;
		}

		let fullPrompt = userPrompt;
		if (this.config.useSmartContext && this.editor) {
			const selection = this.editor.getSelectionRange();
			const selectedText = this.editor.session.getTextRange(selection);
			const fileContext = selectedText || this.editor.getValue();
			fullPrompt += `\n\nFile context:\n${fileContext}`;
		}

		this.prompts.push(userPrompt);
		this.promptArea.value = '';
		this.promptIndex = this.prompts.length; // Reset index to the end of the array

		const promptPill = new Block();
		promptPill.classList.add('prompt-pill');
		promptPill.innerHTML = userPrompt;
		this.conversationArea.append(promptPill);

		const responseBlock = new Block();
		responseBlock.classList.add('response-block');
		this.conversationArea.append(responseBlock);

		let fullResponse = ''

		try {
			const requestBody = {
				model: this.config.model,
				prompt: fullPrompt,
				system: "Engage warmly, respond concisely, occasionally flirty.",
				stream: true
			};

			if (this.config.useConversationalContext && this.context) {
				requestBody.context = this.context;
			}

			const response = await fetch(this.config.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			const reader = response.body.getReader()
			const decoder = new TextDecoder()

			let partialResponse = ''
			
			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}
				
				partialResponse += decoder.decode(value, { stream: true })
				
				let jsonObjects = partialResponse.split('\n')
				
				for (let i = 0; i < jsonObjects.length - 1; i++) {
					const jsonObject = jsonObjects[i]
					if (jsonObject) {
						console.log(jsonObject)
						try {
							const parsed = JSON.parse(jsonObject)
							if (parsed.context) {
								this.context = parsed.context;
							}
							fullResponse += parsed.response
							responseBlock.innerHTML = this.md.render(fullResponse)
							this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
							this._addCodeBlockButtons(responseBlock);
						} catch (e) {
							console.error('Error parsing JSON chunk:', e, jsonObject)
						}
					}
				}
				
				partialResponse = jsonObjects[jsonObjects.length - 1]
			}


		} catch (error) {
			responseBlock.innerHTML = `Error: ${error.message}`
			console.error('Error calling Ollama API:', error)
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
}

export default new Ollama()
