import AI from './ai.mjs';

class Gemini extends AI {
    constructor() {
        super();
        this.config = {
            apiKey: "",
            model: "gemini-2.5-flash",
            server: "https://generativelanguage.googleapis.com", 
            system: "You are a helpful AI assistant.",
        };
        // this.messages = []; // AIManager will now manage the full history
        this.MAX_CONTEXT_TOKENS = 32768; // Initial default, updated on model load

        this._settingsSchema = {
            apiKey: { type: "string", label: "Gemini API Key", default: "", secret: true },
            server: { type: "string", label: "Gemini API Server", default: "https://generativelanguage.googleapis.com" },
            model: { 
                type: "enum", 
                label: "Model", 
                default: "gemini-2.5-flash", 
                enum: [
                	{ value: "gemini-2.5-flash", label: "Gemini Flash (32k)", maxTokens: 32768 },
                    { value: "gemini-2.5-pro", label: "Gemini Pro (32k)", maxTokens: 32768 },
                    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (1M)", maxTokens: 1048576 },
                    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (1M)", maxTokens: 1048576 },
                ],
                lookupCallback: this._getAvailableModels.bind(this) 
            },
            system: { type: "string", label: "System Prompt", default: "You are a helpful AI assistant.", multiline: true },
        };
    }

    async _getAvailableModels() {
        const fallbackModels = [
        	{ value: "gemini-2.5-flash", label: "Gemini Flash (32k)", maxTokens: 32768 },
            { value: "gemini-2.5-pro", label: "Gemini Pro (32k)", maxTokens: 32768 },
            { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (1M)", maxTokens: 1048576 },
            { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (1M)", maxTokens: 1048576 },
        ]; 

        if (!this.config.apiKey) {
            return fallbackModels;
        }

        const modelsApiUrl = `${this.config.server}/v1beta/models?key=${this.config.apiKey}`;

        try {
            const response = await fetch(modelsApiUrl);

            if (!response.ok) {
                return fallbackModels;
            }

            const data = await response.json();
            
            if (!data.models || !Array.isArray(data.models)) {
                return fallbackModels;
            }

            const availableModels = data.models
                .filter(model => model.supportedGenerationMethods && model.supportedGenerationMethods.includes("GENERATE_CONTENT"))
                .map(model => ({
                    value: model.name, 
                    label: `${model.displayName || model.name} (${model.inputTokenLimit / 1000}k)`,
                    maxTokens: model.inputTokenLimit
                }));

            const finalModels = [...new Set([
                ...availableModels.map(m => JSON.stringify(m)),
                ...fallbackModels.map(m => JSON.stringify(m))
            ])].map(s => JSON.parse(s));

            return finalModels;

        } catch (error) {
            return fallbackModels;
        }
    }

    async init() {
        // No specific initialization needed for Gemini.
    }
    
    get _streamApiUrl() {
        return `${this.config.server}/v1beta/models/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}`;
    }

    get _countTokensApiUrl() {
        return `${this.config.server}/v1beta/models/${this.config.model}:countTokens?key=${this.config.apiKey}`;
    }

    /**
     * Converts internal message format to Gemini's `contents` array format.
     * @param {Array<Object>} messages - Internal chat history messages.
     * @returns {Array<Object>} - Gemini API `contents` array.
     */
    _toGeminiContents(messages) {
        const contents = [];
        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'model') {
                contents.push({ role: msg.role, parts: [{ text: msg.content }] });
            } else if (msg.type === 'file_context') {
                // Gemini does not have a 'file_context' role, treat as part of user input
                const fileContent = `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``;
                // If the previous message was 'user', append to its parts, otherwise create new.
                // This simplifies token counting for Gemini which often lumps user inputs.
                if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
                    contents[contents.length - 1].parts.push({ text: fileContent });
                } else {
                    contents.push({ role: 'user', parts: [{ text: fileContent }] });
                }
            }
        }
        return contents;
    }

    /**
     * Internal helper to make the Gemini countTokens API call.
     * @param {Array<Object>} messages - The array of messages (in internal format) to count tokens for.
     * @returns {Promise<number>} - The total number of tokens.
     */
    async _countTokens(messages) {
        if (!this.config.apiKey) {
            return 0;
        }
        try {
            const contents = this._toGeminiContents(messages);
            const response = await fetch(this._countTokensApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contents }),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`Gemini API Error (countTokens): ${response.status} ${response.statusText} - ${errorBody.error?.message || JSON.stringify(errorBody)}`);
            }

            const data = await response.json();
            return data.totalTokens || 0;
        } catch (error) {
            console.error("Error in Gemini _countTokens:", error);
            // Fallback to rough estimate if API call fails
            return this.estimateTokens(messages); 
        }
    }

    /**
     * Processes a ReadableStream from a Gemini API response, parsing JSON chunks.
     * @param {ReadableStreamDefaultReader} reader - The reader for the API response body.
     * @param {object} callbacks - Contains onUpdate, onError functions.
     * @returns {Promise<string>} - Resolves with the full accumulated text response.
     */
    async _processApiResponseStream(reader, callbacks) {
        // ... (No change - same as before) ...
        const { onUpdate, onError } = callbacks;
        let buffer = '';
        const decoder = new TextDecoder('utf-8');
        let fullResponseAccumulator = '';
        let processedIndex = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                buffer += decoder.decode(value, { stream: true }); 

                while (true) {
                    const objectStartIndex = buffer.indexOf('{', processedIndex);
                    if (objectStartIndex === -1) {
                        break;
                    }

                    let braceCount = 0;
                    let objectEndIndex = -1;
                    let inString = false; 

                    for (let i = objectStartIndex; i < buffer.length; i++) {
                        const char = buffer[i];
                        
                        if (char === '"' && (i === 0 || buffer[i - 1] !== '\\')) {
                            inString = !inString;
                        }

                        if (!inString) {
                            if (char === '{') {
                                braceCount++;
                            } else if (char === '}') {
                                braceCount--;
                            }
                        }

                        if (braceCount === 0) {
                            objectEndIndex = i;
                            break;
                        }
                    }

                    if (objectEndIndex !== -1) {
                        const jsonString = buffer.substring(objectStartIndex, objectEndIndex + 1);
                        
                        try {
                            const parsed = JSON.parse(jsonString);
                            if (parsed.candidates && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
                                for (const part of parsed.candidates[0].content.parts) {
                                    if (part.text) {
                                        fullResponseAccumulator += part.text;
                                    }
                                }
                                if (onUpdate) onUpdate(fullResponseAccumulator);
                            }
                        } catch (e) {
                            // Malformed JSON, continue trying to parse
                        }
                        
                        processedIndex = objectEndIndex + 1;
                    } else {
                        break;
                    }
                }

                if (done) {
                    buffer = ''; 
                    processedIndex = 0;
                    break;
                }
            }
            return fullResponseAccumulator;
        } catch (error) {
            if (onError) onError(error);
            throw error;
        }
    }

    /**
     * Generates content using the Gemini model. For 'generate' mode, the prompt is expected
     * to have all context inlined by AIManager._getContextualPrompt.
     * @param {string} prompt - The user's prompt (with context inlined).
     * @param {object} callbacks - An object with callback functions.
     */
    async generate(prompt, callbacks = {}) {
        const { onStart, onError, onDone, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            const contentsToSend = [{ role: "user", parts: [{ text: prompt }] }];

            // Note: _countTokens expects internal message format, so convert
            const currentTokens = await this._countTokens([{ role: "user", content: prompt }]);
            const contextRatio = currentTokens / this.MAX_CONTEXT_TOKENS;

            if (onContextRatioUpdate) {
                onContextRatioUpdate(contextRatio);
            }

            const response = await fetch(this._streamApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contents: contentsToSend }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();
            const fullResponse = await this._processApiResponseStream(reader, callbacks);
            
            // Recalculate context after response if needed, for more accurate final ratio
            const finalTokens = await this._countTokens([{ role: "user", content: prompt }, { role: "model", content: fullResponse }]);
            const finalContextRatio = finalTokens / this.MAX_CONTEXT_TOKENS;

            if (onDone) onDone(fullResponse, Math.round(finalContextRatio * 100));

        } catch (error) {
            if (onError) onError(error);
        }
    }

    /**
     * Manages a chat conversation with the Gemini model.
     * Accepts a pre-filtered array of messages (chat history + current context items + user prompt).
     * @param {Array<Object>} messages - The prepared array of messages for this turn.
     * @param {object} callbacks - An object with callback functions.
     */
    async chat(messages, callbacks = {}) {
        const { onStart, onError, onDone, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            const contentsToSend = this._toGeminiContents(messages);

            const currentTokens = await this._countTokens(messages);
            const contextRatio = currentTokens / this.MAX_CONTEXT_TOKENS;

            if (onContextRatioUpdate) {
                onContextRatioUpdate(contextRatio);
            }

            const response = await fetch(this._streamApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contents: contentsToSend }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();
            const fullResponse = await this._processApiResponseStream(reader, callbacks);
            
            // Add the model's response to the messages array (for final token calculation)
            messages.push({ role: "model", content: fullResponse });

            const finalTokens = await this._countTokens(messages);
            const finalContextRatio = finalTokens / this.MAX_CONTEXT_TOKENS;
            if (onContextRatioUpdate) {
                onContextRatioUpdate(finalContextRatio);
            }

            if (onDone) {
                onDone(fullResponse, Math.round(finalContextRatio * 100));
            }

        } catch (error) {
            if (onError) onError(error);
        }
    }
    
    async setOptions(newConfig, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
        // ... (No change - same as before) ...
        for (const name in newConfig) {
            this.setOption(name, newConfig[name]);
        }
        this._settingsSource = source; 

        // Update MAX_CONTEXT_TOKENS based on selected model
        const selectedModelInfo = this._settingsSchema.model.enum.find(
            model => model.value === this.config.model
        );
        if (selectedModelInfo && selectedModelInfo.maxTokens) {
            this.MAX_CONTEXT_TOKENS = selectedModelInfo.maxTokens;
        }

        // clearContext(); // AIManager will handle this

        if (this.config.apiKey) {
            if (onSuccessCallback) {
                onSuccessCallback(`Gemini settings saved. Using model: ${this.config.model}`);
            }
        } else {
            if (onErrorCallback) {
                onErrorCallback("Gemini API Key is required.");
            }
        }

        const event = new CustomEvent('setting-changed', {
            detail: {
                settingsName: 'geminiConfig', 
                settings: { ...this.config }, 
                useWorkspaceSettings: useWorkspaceSettings,
                source: this._settingsSource
            }
        });
        window.dispatchEvent(event);
    }

    clearContext() {
        // This is now effectively a no-op as AIManager manages the history
        // but keep it for consistency if a provider wants to reset internal state.
        console.log("Gemini internal context cleared (AIManager manages chat history).");
    }

    async refreshModels() {
        // ... (No change - same as before) ...
        this._settingsSchema.model.enum = await this._getAvailableModels();
    }
}

export default Gemini;

