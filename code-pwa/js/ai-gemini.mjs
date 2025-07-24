// ai-gemini.mjs
import AI from './ai.mjs';
import systemPrompt from "./geminiSystemPrompt.mjs"

class Gemini extends AI {
    constructor() {
        super();
        this.config = {
            apiKey: "",
            model: "", 
            server: "https://generativelanguage.googleapis.com", 
            system: systemPrompt,
        };
        this.MAX_CONTEXT_TOKENS = 32768; 

        this._settingsSchema = {
            apiKey: { type: "string", label: "Gemini API Key", default: "" },
            server: { type: "string", label: "Gemini API Server", default: "https://generativelanguage.googleapis.com" },
            model: { 
                type: "enum", 
                label: "Model", 
                default: "gemini-2.5-flash", 
                lookupCallback: this._getAvailableModels.bind(this) 
            },
            //system: { type: "string", label: "System Prompt", default: systemPrompt, multiline: true },
        };
    }

    // Helper to strip the "models/" prefix
    _stripModelPrefix(modelName) {
        if (modelName && modelName.startsWith("models/")) {
            return modelName.substring("models/".length);
        }
        return modelName;
    }
    
    isConfigured() {
    	return this.config.apiKey != "" && this.config.model != ""
    }

    async _getAvailableModels() {
        const fallbackModels = [
            { value: "gemini-2.5-pro", label: "Gemini Pro (1M)", maxTokens: 1048576 },
            { value: "gemini-2.5-flash", label: "Gemini Flash (1M)", maxTokens: 1048576 },
            { value: "gemini-2.5-flash-lite-preview-06-17", label: "Gemini Flash Lite (Preview, 1M)", maxTokens: 1000000 },
        ]; 

        if (!this.config.apiKey) {
            console.warn("[Gemini] API Key not set. Using fallback models.");
            const strippedFallbacks = fallbackModels.map(m => ({ ...m, value: this._stripModelPrefix(m.value) }));
            this._settingsSchema.model.enum = strippedFallbacks;
            if (this._settingsSchema.model.default.startsWith("models/")) {
                this._settingsSchema.model.default = this._stripModelPrefix(this._settingsSchema.model.default);
            }
            return strippedFallbacks;
        }

        const modelsApiUrl = `${this.config.server}/v1beta/models?key=${this.config.apiKey}`;

        try {
            console.log(`[Gemini] Fetching models from: ${modelsApiUrl}`);
            const response = await fetch(modelsApiUrl);

            if (!response.ok) {
                console.warn(`[Gemini] Failed to fetch models (Status: ${response.status}). Using fallback models. Response:`, response.statusText);
                const strippedFallbacks = fallbackModels.map(m => ({ ...m, value: this._stripModelPrefix(m.value) }));
                this._settingsSchema.model.enum = strippedFallbacks;
                 if (this._settingsSchema.model.default.startsWith("models/")) {
                    this._settingsSchema.model.default = this._stripModelPrefix(this._settingsSchema.model.default);
                }
                return strippedFallbacks;
            }

            const data = await response.json();
            
            if (!data.models || !Array.isArray(data.models)) {
                console.warn("[Gemini] API returned unexpected data format. Using fallback models.", data);
                const strippedFallbacks = fallbackModels.map(m => ({ ...m, value: this._stripModelPrefix(m.value) }));
                this._settingsSchema.model.enum = strippedFallbacks;
                 if (this._settingsSchema.model.default.startsWith("models/")) {
                    this._settingsSchema.model.default = this._stripModelPrefix(this._settingsSchema.model.default);
                }
                return strippedFallbacks;
            }

            // Removed detailed logging of raw models
            // console.log(`[Gemini] Raw models from API (${data.models.length} found):`, data.models.map(m => ({ name: m.name, displayName: m.displayName, supportedMethods: m.supportedGenerationMethods, tokenLimit: m.inputTokenLimit })));

            const capableModels = data.models
                .filter(model => 
                    model.supportedGenerationMethods && 
                    model.supportedGenerationMethods.includes("generateContent") &&
                    model.inputTokenLimit > 0 
                )
                .map(model => ({
                    value: this._stripModelPrefix(model.name), 
                    label: `${model.displayName || model.name} (${model.inputTokenLimit >= 1000 ? Math.round(model.inputTokenLimit / 1000) + 'k' : model.inputTokenLimit + ' tokens'})`,
                    maxTokens: model.inputTokenLimit
                }));
            
            // Removed detailed logging of filtered models
            // console.log(`[Gemini] Models passing capability filters (${capableModels.length} found):`, capableModels);

            const uniqueCapableModelsMap = new Map(capableModels.map(m => [m.value, m]));
            const finalModels = [];

            const processedFallbacks = fallbackModels.map(m => ({ ...m, value: this._stripModelPrefix(m.value) }));

            for (const fallbackModel of processedFallbacks) {
                if (uniqueCapableModelsMap.has(fallbackModel.value)) {
                    finalModels.push(uniqueCapableModelsMap.get(fallbackModel.value));
                    uniqueCapableModelsMap.delete(fallbackModel.value); 
                } else {
                    finalModels.push(fallbackModel);
                }
            }

            for (const model of uniqueCapableModelsMap.values()) {
                finalModels.push(model);
            }
            
            // Removed detailed logging of final models
            // console.log(`[Gemini] Final models for settings dropdown (${finalModels.length} found):`, finalModels);

            this._settingsSchema.model.enum = finalModels;

            if (this._settingsSchema.model.default.startsWith("models/")) {
                 this._settingsSchema.model.default = this._stripModelPrefix(this._settingsSchema.model.default);
            }
            const defaultModelExists = finalModels.some(m => m.value === this._settingsSchema.model.default);
            if (!defaultModelExists) {
                console.warn(`[Gemini] Default model '${this._settingsSchema.model.default}' not found or not capable. Resetting default.`);
                this._settingsSchema.model.default = finalModels[0]?.value || "gemini-2.5-flash";
                if (this.aiProvider === this._settingsSchema.model.default) { 
                    this.aiProvider = this._settingsSchema.model.default; 
                }
                console.log(`[Gemini] New default model set to: ${this._settingsSchema.model.default}`);
            }

            return finalModels;

        } catch (error) {
            console.error("[Gemini] Error fetching models:", error);
            const strippedFallbacks = fallbackModels.map(m => ({ ...m, value: this._stripModelPrefix(m.value) }));
            this._settingsSchema.model.enum = strippedFallbacks;
            if (this._settingsSchema.model.default.startsWith("models/")) {
                this._settingsSchema.model.default = this._stripModelPrefix(this._settingsSchema.model.default);
            }
            return strippedFallbacks; 
        }
    }

	async init() {
        await super.init(); 
        
        await this._getAvailableModels(); 

        const selectedModelInfo = this._settingsSchema.model.enum.find(
            model => model.value === this.config.model
        );
        if (selectedModelInfo && selectedModelInfo.maxTokens) {
            this.MAX_CONTEXT_TOKENS = selectedModelInfo.maxTokens;
        } else {
            const defaultModelInfo = this._settingsSchema.model.enum.find(m => m.value === this._settingsSchema.model.default);
            if (defaultModelInfo && defaultModelInfo.maxTokens) {
                this.MAX_CONTEXT_TOKENS = defaultModelInfo.maxTokens;
            } else {
                this.MAX_CONTEXT_TOKENS = 32768; 
            }
        }
        console.log(`[Gemini] Initialized with model: '${this.config.model}', MAX_CONTEXT_TOKENS: ${this.MAX_CONTEXT_TOKENS}`);
    }
    
    get _streamApiUrl() {
        return `${this.config.server}/v1beta/models/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}`;
    }

    get _countTokensApiUrl() {
        return `${this.config.server}/v1beta/models/${this.config.model}:countTokens?key=${this.config.apiKey}`;
    }

    _toGeminiContents(messages) {
        const contents = [];
        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'model') {
                contents.push({ role: msg.role, parts: [{ text: msg.content }] });
            } else if (msg.type === 'file_context') {
                const fileContent = `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``;
                if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
                    contents[contents.length - 1].parts.push({ text: fileContent });
                } else {
                    contents.push({ role: 'user', parts: [{ text: fileContent }] });
                }
            }
        }
        return contents;
    }

    async _countTokens(messages) {
        if (!this.config.apiKey) {
            return 0;
        }
        try {
            const contents = this._toGeminiContents(messages);
            const requestBody = { contents };
            if (this.config.system) {
                requestBody.systemInstruction = { parts: [{ text: this.config.system }] };
            }

            const response = await fetch(this._countTokensApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`Gemini API Error (countTokens): ${response.status} ${response.statusText} - ${errorBody.error?.message || JSON.stringify(errorBody)}`);
            }

            const data = await response.json();
            console.log(`[Gemini] Token count for ${this.config.model}: ${data.totalTokens} tokens`);
            return data.totalTokens || 0;
        } catch (error) {
            console.error("[Gemini] Error in _countTokens:", error);
            return this.estimateTokens(messages); 
        }
    }

    async _processApiResponseStream(reader, callbacks) {
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
            console.error("[Gemini] Error processing API response stream:", error);
            if (onError) onError(error);
            throw error;
        }
    }

    async generate(prompt, callbacks = {}) {
        const { onStart, onError, onDone, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            const contents = [{ role: "user", parts: [{ text: prompt }] }];
            const requestBody = { contents };
            if (this.config.system) {
                requestBody.systemInstruction = { parts: [{ text: this.config.system }] };
            }

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
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();
            const fullResponse = await this._processApiResponseStream(reader, callbacks);
            
            const finalTokens = await this._countTokens([{ role: "user", content: prompt }, { role: "model", content: fullResponse }]);
            const finalContextRatio = finalTokens / this.MAX_CONTEXT_TOKENS;

            if (onDone) {
                onDone(fullResponse, Math.round(finalContextRatio * 100));
            }

        } catch (error) {
            console.error("[Gemini] Error in generate:", error);
            if (onError) onError(error);
        }
    }

    async chat(messages, callbacks = {}) {
        const { onStart, onError, onDone, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            const contents = this._toGeminiContents(messages);
            const requestBody = { contents };
            if (this.config.system) {
                requestBody.systemInstruction = { parts: [{ text: this.config.system }] };
            }


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
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();
            const fullResponse = await this._processApiResponseStream(reader, callbacks);
            
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
            console.error("[Gemini] Error in chat:", error);
            if (onError) onError(error);
        }
    }
    
    async setOptions(newSettings, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
	    let changesApplied = false;
	    for (const key in newSettings) {
	        if (newSettings.hasOwnProperty(key)) {
                if (key === 'model' && typeof newSettings[key] === 'string' && newSettings[key].startsWith("models/")) {
                    newSettings[key] = this._stripModelPrefix(newSettings[key]);
                }

	            if (this.config[key] !== newSettings[key]) {
	                this.config[key] = newSettings[key];
	                changesApplied = true;
	            }
	        }
	    }
	
	    const selectedModelInfo = this._settingsSchema.model.enum.find(
            model => model.value === this.config.model
        );
        if (selectedModelInfo && selectedModelInfo.maxTokens) {
            this.MAX_CONTEXT_TOKENS = selectedModelInfo.maxTokens;
        } else {
            const defaultModelInfo = this._settingsSchema.model.enum.find(m => m.value === this._settingsSchema.model.default);
            if (defaultModelInfo && defaultModelInfo.maxTokens) {
                this.MAX_CONTEXT_TOKENS = defaultModelInfo.maxTokens;
            } else {
                this.MAX_CONTEXT_TOKENS = 32768; 
            }
        }
	
	    if (changesApplied) {
	    	if("function" == typeof onSuccessCallback) {
	        	onSuccessCallback("Settings saved successfully.");
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
    }

    clearContext() {
        console.log("Gemini internal context cleared (AIManager manages chat history).");
    }

    async refreshModels() {
        const freshModels = await this._getAvailableModels();
        this._settingsSchema.model.enum = freshModels; 

        const currentModelValid = freshModels.some(m => m.value === this.config.model);
        if (!currentModelValid) {
            console.warn(`[Gemini] Current model '${this.config.model}' is no longer available or valid. Resetting.`);
            const newDefault = this._settingsSchema.model.default; 
            this.config.model = newDefault; 
            
            const defaultModelInfo = freshModels.find(m => m.value === newDefault);
            if (defaultModelInfo && defaultModelInfo.maxTokens) {
                this.MAX_CONTEXT_TOKENS = defaultModelInfo.maxTokens;
            } else {
                this.MAX_CONTEXT_TOKENS = 32768; 
            }
            
            console.log(`[Gemini] Model reset to default: '${this.config.model}' with MAX_CONTEXT_TOKENS: ${this.MAX_CONTEXT_TOKENS}`);

            window.dispatchEvent(new CustomEvent('setting-changed', {
                detail: {
                    settingsName: 'geminiConfig', 
                    settings: { ...this.config }, 
                    source: this._settingsSource
                }
            }));
        } else {
            console.log(`[Gemini] Refreshed models. Current model '${this.config.model}' remains valid.`);
        }
    }
}

export default Gemini;
