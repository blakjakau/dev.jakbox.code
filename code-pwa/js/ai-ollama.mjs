import AI from './ai.mjs';
import systemPrompt from "./ollamaSystemPrompt.mjs"

// Define default models in the new object format with estimated maxTokens
const defaultModels = [
    { value: "codegemma:7b", label: "CodeGemma 7b", maxTokens: 8192 }, 
    { value: "codegemma:7b-code", label: "CodeGemma 7b Code", maxTokens: 8192 },
    { value: "codegemma:7b-instruct", label: "CodeGemma 7b Instruct", maxTokens: 8192 },
    { value: "codegemma:code", label: "CodeGemma Code", maxTokens: 8192 },
    { value: "codegemma:assist", label: "CodeGemma Assist", maxTokens: 8192 },
    { value: "gemma3:1b-it-qat", label: "Gemma 3 1b IT QAT", maxTokens: 8192 },
    { value: "gemma3:4b-it-qat", label: "Gemma 3 4b IT QAT", maxTokens: 8192 },
    // Add other common Ollama models you expect to list with estimated context lengths
    // { value: "llama2:7b", label: "Llama2 7B", maxTokens: 4096 },
    // { value: "mistral:7b", label: "Mistral 7B", maxTokens: 8192 },
];

class Ollama extends AI {
	constructor() {
		super();
		this.config = {
			server: "http://localhost:11434",
			model: defaultModels[0].value, // default model
			system: systemPrompt,
			useOpenBuffers: false
		};
		this.context = null; // For /api/generate context
        this.messages = []; // For /api/chat messages
        this.MAX_CONTEXT_TOKENS = 0; // This will be dynamically set by _queryModelCapability
        this.contextUsed = 0; // For /api/generate context usage percentage

        this._settingsSchema = {
            server: { type: "string", label: "Ollama Server", default: "http://localhost:11434" },
            model: { 
                type: "enum", 
                label: "Model", 
                default: defaultModels[0].value, 
                enum: defaultModels, // Initial enum uses the object format
                lookupCallback: this._getAvailableModels.bind(this) 
            },
            system: { type: "string", label: "System Prompt", default: systemPrompt, multiline: true },
        };
	}

    // Updated to return objects {value, label, maxTokens?}
    async _getAvailableModels() {
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

    // NOTE: For /api/generate, Ollama reports eval_count and prompt_eval_count in the *final* chunk.
    // This means we can only provide the context ratio *after* the generation is complete.
	async generate(prompt, callbacks = {}) {
        const { onStart, onUpdate, onDone, onError, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

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
            
            // For generate, we can only update the ratio at the end of the response.
            // Provide a placeholder or 0 initially for the progress bar.
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

                    // Calculate context utilization if eval_count and prompt_eval_count are available
                    if (lastChunk?.eval_count !== undefined && lastChunk?.prompt_eval_count !== undefined && this.MAX_CONTEXT_TOKENS > 0) {
                        const totalTokensUsedInThisRequest = lastChunk.eval_count + lastChunk.prompt_eval_count;
                        this.contextUsed = Math.round((totalTokensUsedInThisRequest / this.MAX_CONTEXT_TOKENS) * 100);
                        finalContextRatioPercent = this.contextUsed;

                        if (onContextRatioUpdate) {
                            onContextRatioUpdate(finalContextRatioPercent / 100); // Send final ratio (0-1)
                        }
                    } else if (this.MAX_CONTEXT_TOKENS > 0) { 
                        // If model has a max context but no counts reported for some reason
                        this.contextUsed = 0; // Reset
                        finalContextRatioPercent = 0; // Explicitly 0%
                        if (onContextRatioUpdate) onContextRatioUpdate(0);
                    }

                    // Call onDone with the full response and the calculated percentage (0-100)
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
								this.context = parsed.context; // Update context for next *generate* call
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

    // NOTE: For /api/chat, Ollama does NOT report token counts in the streaming response.
    // Thus, context ratio cannot be provided for this endpoint using current Ollama API.
    async chat(prompt, callbacks = {}) {
        const { onStart, onUpdate, onDone, onError, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        const fullPrompt = await this._getContextualPrompt(prompt);
        this.messages.push({ role: "user", content: fullPrompt }); // Add user prompt to history

        try {
            const requestBody = {
                model: this.config?.model,
                messages: this.messages, // Send full history
                stream: true,
            };

            // Cannot provide contextRatio for Ollama /api/chat as token counts are not exposed.
            if (onContextRatioUpdate) {
                onContextRatioUpdate(null); // Indicate that context ratio is not available (will hide progress bar)
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
                    this.messages.push({ role: "assistant", content: fullResponse });
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

    // Override setOptions to set MAX_CONTEXT_TOKENS after model capability is queried
    async setOptions(newConfig, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
        // Apply new config first
        for (const name in newConfig) {
            this.setOption(name, newConfig[name]); 
        }
        this._settingsSource = source; 
        this.clearContext(); // Clear context as model or server may have changed

        // Query model capability for the *newly set* model
        const querySuccess = await this._queryModelCapability(); 
        
        // MAX_CONTEXT_TOKENS is now directly set by _queryModelCapability
        if (!querySuccess || this.MAX_CONTEXT_TOKENS === 0) {
            // Fallback: If contextMax isn't found or query failed, use a reasonable default.
            // This ensures contextRatio doesn't divide by zero.
            this.MAX_CONTEXT_TOKENS = 4096; // Common default for many models
            console.warn(`Could not determine MAX_CONTEXT_TOKENS for Ollama model: ${this.config.model}. Using default ${this.MAX_CONTEXT_TOKENS}.`);
        }

        if (!querySuccess && onErrorCallback) {
            onErrorCallback(`Unable to talk to the server at ${this.config.server} or query model ${this.config.model}. Please check the server address and ensure Ollama is running and the model is downloaded.`);
        } else if (onSuccessCallback) {
            onSuccessCallback(`Connected to ${this.config.server}, using model: ${this.config.model}`);
        }
        
        // Dispatch event for persistence
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
        this.messages = [];  // For /api/chat
        this.contextUsed = 0; // Reset context usage
        console.log("Ollama chat context cleared.");
    }

    async refreshModels() {
        // Calling _getAvailableModels will update the internal list in _settingsSchema.model.enum.
        // It's then crucial to re-render the settings form in AIManager
        // so the dropdown reflects the new list.
        this._settingsSchema.model.enum = await this._getAvailableModels();
    }
}

export default Ollama;
