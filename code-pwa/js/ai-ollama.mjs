import AI from './ai.mjs';
import systemPrompt from "./ollamaSystemPrompt.mjs"

const models = {
	"7b": "codegemma:7b",
	"7b-code": "codegemma:7b-code",
	"7b-instruct": "codegemma:7b-instruct",
	"code": "codegemma:code",
	"assist": "codegemma:assist",
	"1b-it-qat": "gemma3:1b-it-qat",
	"4b-it-qat": "gemma3:4b-it-qat",
}

class Ollama extends AI {
	constructor() {
		super();
		this.config = {
			endpoint: "http://localhost:11434/api/generate",
			model: models["7b"], // default model
			system: systemPrompt,
			useOpenBuffers: false
		};
		this.context = null;
        this.messages = [];
	}

	async init() {
		await this._queryModelCapability();
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

			if (this._modelCaps?.template) this.config.template = this._modelCaps.template;
			if (this._modelCaps?.model_info) this._modelInfo = this._modelCaps.model_info;
			if (this._modelCaps?.details) this.modelDetails = this._modelCaps?.details;

			if (this._modelInfo?.[`${this.modelDetails?.family}.context_length`]) {
				this.contextMax = this._modelInfo?.[`${this.modelDetails?.family}.context_length`];
			}

			console.debug("Model Capabilities:", this._modelCaps, this._modelInfo);
		} catch (error) {
			console.error("Error querying model capabilities:", error);
			this._modelCaps = null; // Ensure it's null on error
		}
	}

	async generate(prompt, callbacks) {
		const fullPrompt = await this._getContextualPrompt(prompt);

		try {
			const requestBody = {
				model: this.config?.model,
				system: this.config?.system,
				template: this.config?.template,
				options: this.config?.options,
				prompt: fullPrompt,
				stream: true,
			};

			if (this.context) {
				requestBody.context = this.context;
			}

			const response = await fetch(this.config.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			let partialResponse = '', lastChunk, fullResponse = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
                    if (lastChunk?.eval_count && lastChunk?.prompt_eval_count) {
                        this.contextCurrent = lastChunk?.eval_count + lastChunk?.prompt_eval_count;
                        this.contextUsed = ((this.contextCurrent / this.contextMax * 100)) >> 0;
                        if (callbacks.onDone) callbacks.onDone(this.contextUsed / 100);
                    } else {
                        if (callbacks.onDone) callbacks.onDone();
                    }
					break;
				}

				partialResponse += decoder.decode(value, { stream: true });

				let jsonObjects = partialResponse.split('\n');

				for (let i = 0; i < jsonObjects.length - 1; i++) {
					const jsonObject = jsonObjects[i];
					if (jsonObject) {
						try {
							const parsed = JSON.parse(jsonObject);
							lastChunk = parsed;
							if (parsed.context) {
								this.context = parsed.context;
							}
							fullResponse += parsed.response;
							if (callbacks.onUpdate) callbacks.onUpdate(fullResponse);
						} catch (e) {
							console.error('Error parsing JSON chunk:', e, jsonObject);
						}
					}
				}

				partialResponse = jsonObjects[jsonObjects.length - 1];
			}

		} catch (error) {
			if (callbacks.onError) callbacks.onError(error);
		}
	}

    async chat(prompt, callbacks) {
        const fullPrompt = await this._getContextualPrompt(prompt);
        this.messages.push({ role: "user", content: fullPrompt });

        try {
            const requestBody = {
                model: this.config?.model,
                messages: this.messages,
                stream: true,
            };

            const response = await fetch(this.config.endpoint.replace('generate', 'chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let partialResponse = '', lastChunk, fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    this.messages.push({ role: "assistant", content: fullResponse });
                    if (callbacks.onDone) callbacks.onDone();
                    break;
                }

                partialResponse += decoder.decode(value, { stream: true });

                let jsonObjects = partialResponse.split('\n');

                for (let i = 0; i < jsonObjects.length - 1; i++) {
                    const jsonObject = jsonObjects[i];
                    if (jsonObject) {
                        try {
                            const parsed = JSON.parse(jsonObject);
                            lastChunk = parsed;
                            fullResponse += parsed.message.content;
                            if (callbacks.onUpdate) callbacks.onUpdate(fullResponse);
                        } catch (e) {
                            console.error('Error parsing JSON chunk:', e, jsonObject);
                        }
                    }
                }

                partialResponse = jsonObjects[jsonObjects.length - 1];
            }
        } catch (error) { 
            if (callbacks.onError) callbacks.onError(error);
        }
    }

    clearContext() {
        this.context = null;
        this.messages = [];
    }
}

export default new Ollama();