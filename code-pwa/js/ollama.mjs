// Styles for this module are located in css/ai-panel.css
import { Block, Button, Icon } from "./elements.mjs"

const models = {
	"7b": "codegemma:7b",
	"7b-code": "codegemma:7b-code",
	"7b-instruct": "codegemma:7b-instruct",
	"code": "codegemma:code",
	"assist": "codegemma:assist",
	"1b-it-qat": "gemma3:1b-it-qat",
	"4b-it-qat": "gemma3:4b-it-qat",
}

class Ollama {
	constructor() {
		
		// TODO: make the endpoint and model(s) configurable on workspace or app settings
		this.config = {
			endpoint: "http://localhost:11434/api/generate",
			model: models["4b-it-qat"], // default model
			system: "You are an AI assistant specialized in JavaScript, HTML, and CSS code changes and refactoring. When asked to review, update, change or modify code, always provide a revised code block as the primary output. Keep explanations minimal.",
			// template: `<start_of_turn>user\n{{ if .System }}{{ .System }} {{ end }}{{ .Prompt }}<end_of_turn>\n<start_of_turn>model\n{{ .Response }}<end_of_turn>`,
			/*options: {
				num_predict: 512,
				top_k: 20,
				top_p: 0.9,
				temp: 0.5,
				repeat_last_n: 32,
				repeat_penalty: 1.2,
				mirostat: 0,
				mirostat_tau: 5,
				mirostat_eta: 0.1,
				num_ctx: 2048,
			},*/
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
		this._setupGlobalShortcuts()
		this._queryModelCapability()
	}

	async _queryModelCapability() {
		try {
			const showEndpoint = this.config.endpoint.replace("/api/generate", "/api/show");
			const response = await fetch(showEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: this.config.model
				})
			});
			
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			this._modelCaps = await response.json();
			
			if(this._modelCaps?.template)  this.config.template = this._modelCaps.template
			if(this._modelCaps?.model_info)  this._modelInfo = this._modelCaps.model_info
			
			if(this._modelCaps?.details) this.modelDetails = this._modelCaps?.details
			
			if(this._modelInfo?.[`${this.modelDetails?.family}.context_length`]) {
				this.contextMax = this._modelInfo?.[`${this.modelDetails?.family}.context_length`]
			}
			
			console.debug("Model Capabilities:", this._modelCaps, this._modelInfo);
		} catch (error) {
			console.error("Error querying model capabilities:", error);
			this._modelCaps = null; // Ensure it's null on error
		}
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

		const settingsButton = new Button('Settings');
		settingsButton.on('click', () => this.toggleSettingsPanel());
		buttonContainer.append(settingsButton);

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
	
	// In the Ollama class
	toggleSettingsPanel() {
	  this.panel.classList.toggle('settings-open');
	  this.conversationArea.classList.toggle('hidden');
	}
	
	set fileReader(fileReader) {
		// TODO recieve a custom fileReader object
		// asign to a local variable and implement usage in this._readFile(filename)
	}
	
	async _readFile(filename) {
		// TODO pass filename to the fileReader.readFile()
		// if a filename and content is returned, it should be passed back to the calling function
	}
	
	
	// reimplementation of the previous "smartContext" logic from the generate() method
	async _readEditor() {
		if(!this.editor) return
		// read  either the selection, or the full text
		const selection = this.editor.getSelectionRange();
		const selectedText = this.editor.session.getTextRange(selection);
		const fileContent = selectedText || this.editor.getValue(); 
		
		// get the current mode and code language
		const mode = this.editor.getOption("mode"); // e.g., "ace/mode/javascript"
		const language = mode.split('/').pop(); // e.g., "javascript"

		if(fileContent) {
			if(selectedText) {
				return { source: "selection", type: "code", language: language, content: fileContent }
			} else {
				const filename = this.editor?.tabs?.activeTab?.config?.name || "unknown"
				return { source: filename, type: "file", language:language, content: fileContent }
			}
		}
		return
	}
	
	async #tagReader(prompt) {
		
		const contextItems = []
		
		if(prompt.includes("@code")) {
			// this is the baseline @code tag
			// it signifies the user's intent to read from the currentEditor
			// this "smartContext" read is either the text selection OR full text 
			// of this.editor (an ACE editor instance) if no text selection exists
			const item = await this._readEditor()
			if(item) contextItems.push(item)
			
			prompt = prompt.replace(/@code/ig, "code")
		}
		const m = prompt.match(/\@(^code)/gi)
		if(m) {
			// TODO prompt includes other @ tags, we need to look for file matches, let's start with the active
			// tabs, then we can address the fileList's index of files
			// we should look for exact matches first (based on filename)
			// then expand to partial matches, selecting the closest/best match
			// the actual logic for this should be contained in the fileReader object (TBA)
			console.log(m)
		}
		
		return contextItems
	}

	async generate() {
		const userPrompt = this.promptArea.value;
		if (!userPrompt) {
			return;
		}

		let fullPrompt = userPrompt;
		if (this.config.useSmartContext && this.editor && userPrompt.match(/\@/i)) {

			// let's intelligently interpret the @ tag(s) for @code @FILENAME etc
			const context = await this.#tagReader(userPrompt)
			let contextString = ""
			if(context.length > 0) {
				for(const item of context) {
					const { source, type, language, content } = item
					fullPrompt += `\n\n// ------ ${type} context: ${language}\n\n${content}\n//------ end of ${type} context`
				}
			}
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

		let fullResponse = ''

		try {
			const requestBody = {
				model: this.config?.model,
				system: this.config?.system,
				template: this.config?.template,
				options: this.config?.options,
				prompt: fullPrompt,
				stream: true,
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

			let partialResponse = '', lastChunk
			
			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					// add code buttons here, rather than every update
					this._addCodeBlockButtons(responseBlock);
					spinner.remove(); // Remove the spinner
					break
				}
				
				partialResponse += decoder.decode(value, { stream: true })
				
				let jsonObjects = partialResponse.split('\n')
				
				for (let i = 0; i < jsonObjects.length - 1; i++) {
					const jsonObject = jsonObjects[i]
					if (jsonObject) {
						// console.log(jsonObject)
						try {
							const parsed = JSON.parse(jsonObject)
							lastChunk = parsed
							if (parsed.context) {
								this.context = parsed.context;
							}
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
			
			if(lastChunk?.eval_count && lastChunk?.prompt_eval_count) {
				this.contextCurrent = lastChunk?.eval_count + lastChunk?.prompt_eval_count
				this.contextUsed = ((this.contextCurrent/this.contextMax*100))>>0
				
				console.log(this.contextCurrent, this.contextMax, this.contextUsed+"%")
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

	_setupGlobalShortcuts() {
		document.addEventListener('keydown', (e) => {
			
			if (e.altKey && e.key === 'Z') {
			  e.preventDefault();
			  this.toggleSettingsPanel();
			}

			// Alt + Shift + S to toggle Smart Context
			if (e.altKey && e.shiftKey && e.key === 'S') {
				e.preventDefault();
				this.smartContextCheckbox.checked = !this.smartContextCheckbox.checked;
				this.config.useSmartContext = this.smartContextCheckbox.checked;
			}
			// Alt + Shift + C to toggle Conversational Context
			if (e.altKey && e.shiftKey && e.key === 'C') {
				e.preventDefault();
				this.conversationalContextCheckbox.checked = !this.conversationalContextCheckbox.checked;
				this.config.useConversationalContext = this.conversationalContextCheckbox.checked;
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

export default new Ollama()
