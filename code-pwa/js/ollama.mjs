// Styles for this module are located in css/ai-panel.css
import { Block, Button } from "./elements.mjs"

class Ollama {
	constructor() {
		
		// TODO: make the endpoint and model(s) configurable on workspace or app settings
		this.endpoint = "http://localhost:11434/api/generate"
		this.model = "codegemma:latest" // default model
		this.prompts = []
		this.promptIndex = -1 // -1 indicates no prompt from history is currently displayed
		this.panel = null
		this.promptArea = null
		this.conversationArea = null
		this.submitButton = null
		this.md = window.markdownit();
	}

	init(panel) {
		this.panel = panel
		this._setupPanel()
		this._createUI()
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

		promptContainer.append(this.promptArea);
		promptContainer.append(buttonContainer);

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
		})
		return clearButton
	}

	async generate() {
		const prompt = this.promptArea.value
		if (!prompt) {
			return
		}
		this.prompts.push(prompt);
		this.promptArea.value = '';
		this.promptIndex = this.prompts.length; // Reset index to the end of the array

		const promptPill = new Block();
		promptPill.classList.add('prompt-pill');
		promptPill.innerHTML = prompt;
		this.conversationArea.append(promptPill);

		const responseBlock = new Block();
		responseBlock.classList.add('response-block');
		this.conversationArea.append(responseBlock);

		let fullResponse = ''

		try {
			const response = await fetch(this.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: this.model, prompt: prompt, stream: true }),
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
			}

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
						try {
							const parsed = JSON.parse(jsonObject)
							fullResponse += parsed.response
							responseBlock.innerHTML = this.md.render(fullResponse)
							this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
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
}

export default new Ollama()
