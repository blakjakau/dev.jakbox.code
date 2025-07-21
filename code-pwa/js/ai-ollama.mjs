import AI from './ai.mjs';
import systemPrompt from "./ollamaSystemPrompt.mjs"

// Define default models in the new object format with estimated maxTokens
const defaultModels = [
    { value: "", label: "Select a model", maxTokens: 8192 }, 
    // { value: "codegemma:7b-code", label: "CodeGemma 7b Code", maxTokens: 8192 },
    // { value: "codegemma:7b-instruct", label: "CodeGemma 7b Instruct", maxTokens: 8192 },
    // { value: "codegemma:code", label: "CodeGemma Code", maxTokens: 8192 },
    // { value: "codegemma:assist", label: "CodeGemma Assist", maxTokens: 8192 },
    // { value: "gemma3:1b-it-qat", label: "Gemma 3 1b IT QAT", maxTokens: 8192 },
    // { value: "gemma3:4b-it-qat", label: "Gemma 3 4b IT QAT", maxTokens: 8192 },
    // // Add other common Ollama models you expect to list with estimated context lengths
];

class Ollama extends AI {
	constructor() {
		super();
		this.config = {
			server: "http://localhost:11434",
			model: "", //defaultModels[0].value, // default model
			system: systemPrompt
		};
		this.context = null; // For /api/generate context (Ollama's internal context)
        // this.messages = []; // AIManager will now manage the full history
        this.MAX_CONTEXT_TOKENS = 0; // This will be dynamically set by _queryModelCapability
        this.contextUsed = 0; // For /api/generate context usage percentage

        this._settingsSchema = {
            server: { type: "string", label: "Ollama Server", default: "http://localhost:11434" },
            model: { 
                type: "enum", 
                label: "Model", 
                default: "", // defaultModels[0].value, 
                enum: defaultModels, // Initial enum uses the object format
                lookupCallback: this._getAvailableModels.bind(this) 
            },
            system: { type: "string", label: "System Prompt", default: systemPrompt, multiline: true },
        };
	}

    isConfigured() {
    	return this.config.server != "" && this.config.model != ""
    }


    async _getAvailableModels() {
        // ... (No change - same as before) ...
        try {
            const tagsEndpoint = `${this.config.server}/api/tags`;
            const response = await fetch(tagsEndpoint);
            if (!response.ok) {
                console.error(`Ollama API error fetching tags: ${response.status}`);
                return JSON.parse(JSON.stringify(defaultModels)); // Return copy of defaults on error
            }
            const data = await response.json();
            
            const fetchedModels = data.models.map(m => ({ 
                value: m.name, 
                label: m.name // You can parse m.name for a nicer label if desired (e.g. m.name.split(':')[0])
                // maxTokens is not available directly from /api/tags, will be filled in by _queryModelCapability
            }));

            // Deduplicate and combine with defaultModels, preferring fetched ones
            const uniqueModelsMap = new Map();
            defaultModels.forEach(m => uniqueModelsMap.set(m.value, m)); // Add defaults first
            fetchedModels.forEach(m => uniqueModelsMap.set(m.value, m)); // Overwrite with fetched, or add new

            // Ensure the currently configured model is in the list, even if not fetched
            const currentModelValue = this.config.model;
            if (!uniqueModelsMap.has(currentModelValue)) {
                 // Try to find it in the original _settingsSchema.model.enum if it was there initially
                const initialModel = this._settingsSchema.model.enum.find(m => m.value === currentModelValue);
                if (initialModel) {
                    uniqueModelsMap.set(currentModelValue, initialModel);
                } else {
                    // Fallback for completely unknown model if API didn't return it
                    uniqueModelsMap.set(currentModelValue, { 
                        value: currentModelValue, 
                        label: `${currentModelValue} (unknown k)`, 
                        maxTokens: this.MAX_CONTEXT_TOKENS || 4096 // Use current MAX_CONTEXT_TOKENS or a guess
                    });
                }
            }

            const finalModels = Array.from(uniqueModelsMap.values());
            finalModels.sort((a,b) => a.label.localeCompare(b.label)); // Sort for consistent display
			finalModels.sort((a,b)=>a==""?1:-1)
			
            return finalModels;
        } catch (error) {
            console.error("Error fetching Ollama models:", error);
            return JSON.parse(JSON.stringify(defaultModels)); // Return copy of defaults on error
        }
    }

	async init() {
        // Query capability for the currently set model to get initial MAX_CONTEXT_TOKENS
		await this._queryModelCapability();
	}

	async _queryModelCapability() {
		// ... (No change - same as before) ...
        try {
			const showEndpoint = `${this.config.server}/api/show`;
			const response = await fetch(showEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: this.config.model
				})
			});

			if (!response.ok) {
				console.error(`Ollama API error showing model capability: ${response.status} - ${await response.text()}`);
                this.MAX_CONTEXT_TOKENS = 0; // Clear previous context max on error
				return false;
			}

			const modelCaps = await response.json(); 
            this._modelCaps = modelCaps; // Store it for other potential uses

			// Ollama context length is typically found in model_info
			if (modelCaps?.details?.families?.[0] && modelCaps?.model_info) {
				const family = modelCaps.details.families[0]; 
				if (modelCaps.model_info[`${family}.context_length`]) {
					this.MAX_CONTEXT_TOKENS = modelCaps.model_info[`${family}.context_length`];
				} else {
                    this.MAX_CONTEXT_TOKENS = 0; // Or a default like 4096 / 8192
                    console.warn(`Could not find context_length for model ${this.config.model}.`);
                }
			} else {
                 this.MAX_CONTEXT_TOKENS = 0;
            }

			console.debug("Model Capabilities:", modelCaps, `MAX_CONTEXT_TOKENS: ${this.MAX_CONTEXT_TOKENS}`);
            return true;
		} catch (error) {
			console.error("Error querying Ollama model capabilities:", error);
			this._modelCaps = null; // Ensure it's null on error
            this.MAX_CONTEXT_TOKENS = 0; // Reset context max on error
            return false;
		}
	}

    /**
     * Generates content using the Ollama model (for 'generate' mode).
     * The prompt is expected to have all context inlined by AIManager._getContextualPrompt.
     * @param {string} prompt - The user's prompt (with context inlined).
     * @param {object} callbacks - An object with callback functions.
     */
	async generate(prompt, callbacks = {}) {
        const { onStart, onUpdate, onDone, onError, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

		try {
			const requestBody = {
				model: this.config?.model,
				system: this.config?.system,
				template: this.config?.template,
				options: this.config?.options,
				prompt: prompt, // Use the already processed prompt
				stream: true,
			};

			if (this.context) { 
				requestBody.context = this.context;
			}
            
            if (onContextRatioUpdate) {
                onContextRatioUpdate(0); // Indicate 0% used initially or N/A
            }

			const response = await fetch(`${this.config.server}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			let partialResponse = '', lastChunk, fullResponse = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
                    let finalContextRatioPercent = null; 

                    if (lastChunk?.eval_count !== undefined && lastChunk?.prompt_eval_count !== undefined && this.MAX_CONTEXT_TOKENS > 0) {
                        const totalTokensUsedInThisRequest = lastChunk.eval_count + lastChunk.prompt_eval_count;
                        this.contextUsed = Math.round((totalTokensUsedInThisRequest / this.MAX_CONTEXT_TOKENS) * 100);
                        finalContextRatioPercent = this.contextUsed;

                        if (onContextRatioUpdate) {
                            onContextRatioUpdate(finalContextRatioPercent / 100); 
                        }
                    } else if (this.MAX_CONTEXT_TOKENS > 0) { 
                        this.contextUsed = 0; 
                        finalContextRatioPercent = 0; 
                        if (onContextRatioUpdate) onContextRatioUpdate(0);
                    }

                    if (onDone) onDone(fullResponse, finalContextRatioPercent);
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
							if (onUpdate) onUpdate(fullResponse);
						} catch (e) {
							console.error('Error parsing JSON chunk from generate stream:', e, jsonObject);
						}
					}
				}
				partialResponse = jsonObjects[jsonObjects.length - 1]; 
			}

		} catch (error) {
			console.error("Error in Ollama generate:", error);
			if (onError) onError(error);
		}
	}

    /**
     * Manages a chat conversation with the Ollama model (for 'chat' mode).
     * Accepts a pre-filtered array of messages (chat history + current context items + user prompt).
     * @param {Array<Object>} messages - The prepared array of messages for this turn.
     * @param {object} callbacks - An object with callback functions.
     */
    async chat(messages, callbacks = {}) {
        const { onStart, onUpdate, onDone, onError, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            // Ollama's /api/chat expects messages in { role: "user", content: "..." } or { role: "assistant", content: "..." }
            // So, file_context messages need to be formatted as user messages.
            const messagesToSend = messages.map(msg => {
                if (msg.type === 'file_context') {
                    return {
                        role: 'user',
                        content: `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``
                    };
                }
                return { role: msg.role, content: msg.content };
            });

            const requestBody = {
                model: this.config?.model,
                messages: messagesToSend, // Send full history prepared by AIManager
                stream: true,
            };

            // Cannot provide contextRatio for Ollama /api/chat as token counts are not exposed.
            if (onContextRatioUpdate) {
                onContextRatioUpdate(null); 
            }

            const response = await fetch(`${this.config.server}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let partialResponse = '', fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // Call onDone with the full response and null for context ratio
                    if (onDone) onDone(fullResponse, null); 
                    break;
                }

                partialResponse += decoder.decode(value, { stream: true });

                let jsonObjects = partialResponse.split('\n');

                for (let i = 0; i < jsonObjects.length - 1; i++) {
                    const jsonObject = jsonObjects[i];
                    if (jsonObject) {
                        try {
                            const parsed = JSON.parse(jsonObject);
                            if (parsed.message?.content) {
                                fullResponse += parsed.message.content;
                                if (onUpdate) onUpdate(fullResponse);
                            }
                        } catch (e) {
                            console.error('Error parsing JSON chunk from chat stream:', e, jsonObject);
                        }
                    }
                }
                partialResponse = jsonObjects[jsonObjects.length - 1]; 
            }
        } catch (error) { 
            console.error("Error in Ollama chat:", error);
            if (onError) onError(error);
        }
    }

    async setOptions(newConfig, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
        // ... (No change - same as before) ...
        for (const name in newConfig) {
            this.setOption(name, newConfig[name]); 
        }
        this._settingsSource = source; 
        // clearContext(); // AIManager will handle this

        const querySuccess = await this._queryModelCapability(); 
        
        if (!querySuccess || this.MAX_CONTEXT_TOKENS === 0) {
            this.MAX_CONTEXT_TOKENS = 4096; 
            console.warn(`Could not determine MAX_CONTEXT_TOKENS for Ollama model: ${this.config.model}. Using default ${this.MAX_CONTEXT_TOKENS}.`);
        }

        if (!querySuccess && onErrorCallback) {
            onErrorCallback(`Unable to talk to the server at ${this.config.server} or query model ${this.config.model}. Please check the server address and ensure Ollama is running and the model is downloaded.`);
        } else if (onSuccessCallback) {
            onSuccessCallback(`Connected to ${this.config.server}, using model: ${this.config.model}`);
        }
        
        const event = new CustomEvent('setting-changed', {
            detail: {
                settingsName: 'ollamaConfig',
                settings: { ...this.config }, 
                useWorkspaceSettings: useWorkspaceSettings,
                source: this._settingsSource 
            }
        });
        window.dispatchEvent(event);
    }

    clearContext() {
        this.context = null; // For /api/generate
        // this.messages = [];  // AIManager now manages the history
        this.contextUsed = 0; // Reset context usage
        console.log("Ollama internal context cleared (AIManager manages chat history).");
    }

    async refreshModels() {
        // ... (No change - same as before) ...
        this._settingsSchema.model.enum = await this._getAvailableModels();
    }
}

export default Ollama;

