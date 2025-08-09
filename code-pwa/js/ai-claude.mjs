// ai-claude.mjs
import AI from './ai.mjs';
import systemPrompt from "./claudeSystemPrompt.mjs";

// Fallback static list of common Claude models with their context window sizes.
// Used when the API endpoint is unavailable or fails.
const fallbackClaudeModels = [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (200k)", maxTokens: 200000 },
    { value: "claude-sonnet-4-20250514", label: "Claude 4 Sonnet (200k)", maxTokens: 200000 },
    { value: "claude-opus-4-1-20250805", label: "Claude 4.1 Opus (200k)", maxTokens: 200000 },
    
];

let claudeModels = [...fallbackClaudeModels]; // Start with fallback models


class Claude extends AI {
    constructor() {
        super();
        this.config = {
            apiKey: "",
            model: "claude-3-5-sonnet-20240620", 
            server: "https://api.anthropic.com", 
            system: systemPrompt,
        };
        // Default to the max tokens for the default model. This will be updated in init().
        this.MAX_CONTEXT_TOKENS = 200000;

        this._settingsSchema = {
            apiKey: { type: "string", label: "Anthropic API Key", default: "" },
            server: { type: "string", label: "Anthropic API Server", default: "https://api.anthropic.com" },
            model: { 
                type: "enum", 
                label: "Model", 
                default: "claude-3-5-sonnet-20240620", 
                enum: claudeModels,
                lookupCallback: this._getAvailableModels.bind(this) 
            },
        };
    }
    
    isConfigured() {
    	return this.config.apiKey !== "" && this.config.model !== "";
    }

    async _getAvailableModels() {
        // Try to fetch models from the API, fall back to static list if it fails
        try {
            const response = await fetch(`${this.config.server}/v1/models`, {
                method: 'GET',
                headers: {
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
            });

            if (response.ok) {
                const data = await response.json();
                if (data.data && Array.isArray(data.data)) {
                    // Transform API response to our format
                    const apiModels = data.data
                        .filter(model => model.id && model.id.startsWith('claude'))
                        .map(model => {
                            // Try to extract context size from model name or use default
                            let maxTokens = 200000; // Default context size
                            let label = model.id;
                            
                            // Generate a more readable label
                            if (model.display_name) {
                                label = model.display_name;
                            } else {
                                // Prettify the model ID
                                label = model.id
                                    .replace(/-/g, ' ')
                                    .replace(/\b\w/g, c => c.toUpperCase())
                                    .replace(/(\d+)/, ' $1');
                            }
                            
                            // Add context size to label if not already present
                            if (!label.includes('k')) {
                                label += ` (${maxTokens / 1000}k)`;
                            }
                            
                            return { value: model.id, label, maxTokens };
                        });
                    
                    claudeModels = apiModels.length > 0 ? apiModels : fallbackClaudeModels;
                    console.log(`[Claude] Fetched ${apiModels.length} models from API`);
                    return apiModels;
                }
            }
        } catch (error) {
            console.log("[Claude] Could not fetch models from API, using fallback list:", error.message);
        }
        
        return fallbackClaudeModels;
    }
    
    async init() {
        await super.init(); 
        
        // Ensure the initial MAX_CONTEXT_TOKENS is set correctly based on the loaded config.
        const selectedModelInfo = claudeModels.find(
            model => model.value === this.config.model
        );
        if (selectedModelInfo) {
            this.MAX_CONTEXT_TOKENS = selectedModelInfo.maxTokens;
        } else {
            // Fallback if the configured model isn't in our list (e.g., from old settings).
            const defaultModel = claudeModels.find(m => m.value === this._settingsSchema.model.default);
            this.MAX_CONTEXT_TOKENS = defaultModel?.maxTokens || 200000;
        }
        console.log(`[Claude] Initialized with model: '${this.config.model}', MAX_CONTEXT_TOKENS: ${this.MAX_CONTEXT_TOKENS}`);
    }
    
    get _apiUrl() {
        return `${this.config.server}/v1/messages`;
    }

    // Transforms internal message format to Claude's format.
    // Anthropic's API requires that consecutive messages from the same role be merged,
    // which this function handles for 'user' messages.
    _toClaudeMessages(messages) {
        const claudeMessages = [];
        for (const msg of messages) {
            const role = (msg.role === 'model') ? 'assistant' : 'user';

            if (msg.type === 'file_context') {
                const fileContent = `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``;
                if (claudeMessages.length > 0 && claudeMessages[claudeMessages.length - 1].role === 'user') {
                    claudeMessages[claudeMessages.length - 1].content.push({ type: 'text', text: fileContent });
                } else {
                    claudeMessages.push({ role: 'user', content: [{ type: 'text', text: fileContent }] });
                }
            } else if (role === 'user' || role === 'assistant') {
                if (role === 'user' && claudeMessages.length > 0 && claudeMessages[claudeMessages.length - 1].role === 'user') {
                    claudeMessages[claudeMessages.length - 1].content.push({ type: 'text', text: msg.content });
                } else {
                    claudeMessages.push({ role, content: [{ type: 'text', text: msg.content }] });
                }
            }
        }
        return claudeMessages;
    }

    async _countTokens(messages) {
        // Anthropic has no public token counting endpoint, so we use the base class estimation.
        return this.estimateTokens(messages);
    }

    async _processApiResponseStream(reader, callbacks) {
        const { onUpdate, onError } = callbacks;
        let buffer = '';
        const decoder = new TextDecoder('utf-8');
        let fullResponseAccumulator = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep potentially incomplete last line for the next chunk.

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const jsonString = line.substring(5).trim();
                        if (!jsonString) continue;
                        try {
                            const parsed = JSON.parse(jsonString);
                            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                                fullResponseAccumulator += parsed.delta.text;
                                if (onUpdate) onUpdate(fullResponseAccumulator);
                            }
                        } catch (e) {
                            console.warn("[Claude] Failed to parse stream JSON object:", jsonString, e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("[Claude] Error processing API response stream:", error);
            if (onError) onError(error);
            throw error;
        }

        return fullResponseAccumulator;
    }

    async generate(prompt, callbacks = {}) {
        // This method is maintained for API consistency, but AIManager primarily uses chat().
        const messages = [{ role: "user", type: "user", content: prompt }];
        return this.chat(messages, callbacks);
    }
    
    async chat(messages, callbacks = {}) {
        const { onStart, onError, onDone, onContextRatioUpdate } = callbacks;
        if (onStart) onStart();

        try {
            const claudeMessages = this._toClaudeMessages(messages);
            
            const requestBody = {
                model: this.config.model,
                messages: claudeMessages,
                stream: true,
                max_tokens: 4096 // A required parameter for the Anthropic Messages API
            };

            if (this.config.system && this.config.system.trim() !== '') {
                requestBody.system = this.config.system;
            }

            const currentTokens = await this._countTokens(messages);
            const contextRatio = currentTokens / this.MAX_CONTEXT_TOKENS;

            if (onContextRatioUpdate) {
                onContextRatioUpdate(contextRatio);
            }

            const response = await fetch(this._apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
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
            console.error("[Claude] Error in chat:", error);
            if (onError) onError(error);
        }
    }
    
    async setOptions(newSettings, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
	    let changesApplied = false;
        let modelChanged = false;
	    for (const key in newSettings) {
	        if (newSettings.hasOwnProperty(key)) {
	            if (this.config[key] !== newSettings[key]) {
	                this.config[key] = newSettings[key];
	                changesApplied = true;
                    if(key === 'model') modelChanged = true;
	            }
	        }
	    }
	
        if (modelChanged) {
            const selectedModelInfo = claudeModels.find(
                model => model.value === this.config.model
            );
            if (selectedModelInfo) {
                this.MAX_CONTEXT_TOKENS = selectedModelInfo.maxTokens;
                console.log(`[Claude] Model changed. New MAX_CONTEXT_TOKENS: ${this.MAX_CONTEXT_TOKENS}`);
            }
        }
	
	    if (changesApplied) {
	    	if("function" == typeof onSuccessCallback) {
	        	onSuccessCallback("Settings saved successfully.");
	    	}
	        const event = new CustomEvent('setting-changed', {
	            detail: {
	                settingsName: 'claudeConfig', 
	                settings: { ...this.config }, 
	                useWorkspaceSettings: useWorkspaceSettings,
	                source: this._settingsSource
	            }
	        });
	        window.dispatchEvent(event);
	    }
    }

    clearContext() {
        // AIManager manages history, so this is a no-op, but good to have for interface consistency.
        console.log("Claude internal context cleared (AIManager manages chat history).");
    }

    async refreshModels() {
        // Try to fetch fresh models from the API
        const freshModels = await this._getAvailableModels();
        if (freshModels && freshModels.length > 0) {
            claudeModels = freshModels;
            this._settingsSchema.model.enum = freshModels;
            console.log(`[Claude] Refreshed models list with ${freshModels.length} models.`);
        } else {
            console.log("[Claude] Using fallback models list.");
        }
    }
}

export default Claude;
