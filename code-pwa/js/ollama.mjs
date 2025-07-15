import { Block, Button } from "./elements.mjs"

class Ollama {
	constructor() {
		this.endpoint = "http://localhost:11434/api/generate"
		this.model = "codegemma:latest" // default model
		this.prompts = []
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
		this.panel.style.display = "flex"
		this.panel.style.flexDirection = "column"
		this.panel.style.position = "relative"
		this.panel.style.height = "100%"
	}

	_createUI() {
		this.conversationArea = this._createConversationArea()
		const promptContainer = this._createPromptContainer()
		this.panel.append(this.conversationArea)
		this.panel.append(promptContainer)
	}

	_createConversationArea() {
		const conversationArea = new Block()
		conversationArea.addClass('conversation-area');
		conversationArea.style.flex = "1"
		conversationArea.style.overflowY = "auto"
		conversationArea.style.padding = "8px"
		return conversationArea
	}

	_createPromptContainer() {
		const promptContainer = new Block()
		promptContainer.style.position = "sticky"
		promptContainer.style.bottom = "0"
		promptContainer.style.left = "0"
		promptContainer.style.right = "0"
		promptContainer.style.padding = "8px"
		promptContainer.style.backgroundColor = "var(--background-color)"
		promptContainer.style.borderTop = "1px solid var(--border-color)"
		promptContainer.style.display = "flex"
		promptContainer.style.flexDirection = "column"

		this.promptArea = this._createPromptArea()
		this.submitButton = this._createSubmitButton()

		promptContainer.append(this.promptArea)
		promptContainer.append(this.submitButton)

		return promptContainer
	}

	_createPromptArea() {
		const promptArea = document.createElement("textarea")
		promptArea.placeholder = "Enter your prompt here..."
		promptArea.style.flex = "1"
		promptArea.style.marginBottom = "8px"
		promptArea.style.boxSizing = "border-box"
		promptArea.style.width = "100%"
		promptArea.style.border = "1px solid var(--border-color)"
		promptArea.style.borderRadius = "var(--border-radius)"
		promptArea.style.backgroundColor = "var(--background-color)"
		promptArea.style.color = "var(--text-color)"
		promptArea.style.fontFamily = "var(--font-family)"
		promptArea.addEventListener('keydown', (e) => {
			if (e.ctrlKey && e.key === 'Enter') {
				e.preventDefault();
				this.generate();
			}
		});
		return promptArea
	}

	_createSubmitButton() {
		const submitButton = new Button("Send")
		submitButton.style.alignSelf = "flex-end"
		submitButton.on("click", () => this.generate())
		return submitButton
	}

	async generate() {
		const prompt = this.promptArea.value
		if (!prompt) {
			return
		}
		this.prompts.push(prompt);
		this.promptArea.value = '';

		const responseBlock = new Block();
		responseBlock.style.marginBottom = '16px';
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