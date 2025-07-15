import { Block, Button } from "./elements.mjs"
class Ollama {
	constructor() {
		this.endpoint = "http://localhost:11434/api/generate"
		this.model = "codegemma:latest" // default model
		this.prompts = []
		this.panel = null
		this.promptArea = null
		this.responseArea = null
		this.submitButton = null
	}
	init(panel) {
		this.panel = panel
		this._setupPanel()
		this._createUI()
	}
	_setupPanel() {
		this.panel.style.display = "flex"
		this.panel.style.flexDirection = "column"
		this.panel.style.padding = "8px"
		this.panel.style.boxSizing = "border-box"
	}
	_createUI() {
		const promptContainer = this._createPromptContainer()
		this.responseArea = this._createResponseArea()
		this.panel.append(promptContainer)
		this.panel.append(this.responseArea)
	}
	_createPromptContainer() {
		const promptContainer = new Block()
		promptContainer.style.display = "flex"
		promptContainer.style.flexDirection = "column"
		promptContainer.style.height = "30%"
		promptContainer.style.minHeight = "100px"
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
	_createResponseArea() {
		const responseArea = new Block()
		responseArea.style.flex = "1"
		responseArea.style.overflowY = "auto"
		responseArea.style.border = "1px solid var(--border-color)"
		responseArea.style.padding = "8px"
		responseArea.style.marginTop = "8px"
		responseArea.style.borderRadius = "var(--border-radius)"
		return responseArea
	}
	async generate() {
		const prompt = this.promptArea.value
		if (!prompt) {
			return
		}
		this.prompts.push(prompt);
		this.promptArea.value = '';
		this.responseArea.innerHTML = ''
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
							this.responseArea.innerHTML += parsed.response
						} catch (e) {
							console.error('Error parsing JSON chunk:', e, jsonObject)
						}
					}
				}
				
				partialResponse = jsonObjects[jsonObjects.length - 1]
			}


		} catch (error) {
			this.responseArea.innerHTML = `Error: ${error.message}`
			console.error('Error calling Ollama API:', error)
		}
	}
}
export default new Ollama()
