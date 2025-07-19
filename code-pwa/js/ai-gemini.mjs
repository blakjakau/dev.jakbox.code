import AI from './ai.mjs';

class Gemini extends AI {
    constructor() {
        super();
        this.config = {
            apiKey: "",
            model: "gemini-2.5-flash", // Default Gemini model
            server: "https://generativelanguage.googleapis.com", // Default Gemini API endpoint
            system: "You are a helpful AI assistant.",
        };
        this.messages = [];

        this._settingsSchema = {
            apiKey: { type: "string", label: "Gemini API Key", default: "", secret: true },
            server: { type: "string", label: "Gemini API Server", default: "https://generativelanguage.googleapis.com" },
            model: { type: "enum", label: "Model", default: "gemini-pro", lookupCallback: this._getAvailableModels.bind(this) },
            system: { type: "string", label: "System Prompt", default: "You are a helpful AI assistant.", multiline: true },
        };
    }

    async _getAvailableModels() {
        // This is a placeholder. In a real scenario, you'd query the Gemini API
        // to get a list of available models. For now, we'll hardcode some common ones.
        return ["gemini-2.5-pro", "gemini-2.5-flash"];
    }

    async init() {
        // No specific initialization needed for Gemini beyond what's in constructor
        // unless we want to validate API key or fetch models on init.
        // For now, we'll assume settings are loaded and validated on setOptions.
    }
    
    get apiUrl() {
    	return `${this.config.server}/v1beta/models/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}`
    }

    async generate(prompt, callbacks) {
	    const { onUpdate, onError, onDone } = callbacks;
        const fullPrompt = await this._getContextualPrompt(prompt);
	
	    let buffer = '';
	    const decoder = new TextDecoder('utf-8');
	    let fullResponseAccumulator = ''; // To accumulate the full text response
	
	    try {
            const response = await fetch(this.apiUrl, {
	            method: 'POST',
	            headers: {
	                'Content-Type': 'application/json',
	            },
	            body: JSON.stringify({
	                contents: [{
	                    parts: [{
	                        text: fullPrompt
	                    }]
	                }]
	            }),
	        });
	
	        if (!response.ok) {
	            const errorText = await response.text();
	            const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
	            onError(httpError);
	            return; // Exit if initial response is not OK
	        }
	
	        const reader = response.body.getReader();
			
			const processBuffer = () => {
				while (true) {
					let braceCount = 0;
					let objectStartIndex = -1;
					let objectEndIndex = -1;
			
					for (let i = 0; i < buffer.length; i++) {
						if (buffer[i] === '{') {
							if (braceCount === 0) {
								objectStartIndex = i;
							}
							braceCount++;
						} else if (buffer[i] === '}') {
							braceCount--;
							if (braceCount === 0 && objectStartIndex !== -1) {
								objectEndIndex = i;
								break; 
							}
						}
					}
			
					if (objectEndIndex !== -1) {
						const jsonString = buffer.substring(objectStartIndex, objectEndIndex + 1);
						buffer = buffer.substring(objectEndIndex + 1); // Remove the parsed object
			
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
							console.error('Error parsing JSON object from stream:', e, jsonString);
						}
					} else {
						break; // No complete object found, wait for more data
					}
				}
			};
			
	
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    processBuffer();
                    if (onDone) onDone();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                processBuffer();
            }

        } catch (error) {
            console.error("Error calling Gemini API (generate):", error);
            if (callbacks.onError) callbacks.onError(error);
        }
    }

    async chat(prompt, callbacks) {
        const fullPrompt = await this._getContextualPrompt(prompt);
        this.messages.push({ role: "user", parts: [{ text: fullPrompt }] });
        await this._handleStream(callbacks);
    }

	async _handleStream(callbacks) {
	    const { onUpdate, onError, onDone } = callbacks;
	
	    const decoder = new TextDecoder('utf-8');
	    let buffer = '';
	    let fullResponseAccumulator = '';
	    let processedIndex = 0;
	
	    try {
	        const response = await fetch(this.apiUrl, {
	            method: 'POST',
	            headers: {
	                'Content-Type': 'application/json',
	            },
	            body: JSON.stringify({ contents: this.messages }),
	        });
	
	        if (!response.ok) {
	            const errorText = await response.text();
	            const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
	            if (onError) onError(httpError);
	            return;
	        }
	
	        const reader = response.body.getReader();
	
	        while (true) {
	            const { done, value } = await reader.read();
	
	            if (done) {
	                this.messages.push({ role: "model", parts: [{ text: fullResponseAccumulator }] });
	                if (onDone) onDone();
	                break;
	            }
	
	            buffer += decoder.decode(value, { stream: false });
	
	            while (true) {
	                const objectStartIndex = buffer.indexOf('{', processedIndex);
	                if (objectStartIndex === -1) {
	                    break;
	                }
	
	                let braceCount = 0;
	                let objectEndIndex = -1;
	                // ✨ STATE-AWARE PARSING LOGIC STARTS HERE ✨
	                let inString = false; 
	
	                for (let i = objectStartIndex; i < buffer.length; i++) {
	                    const char = buffer[i];
	                    
	                    // Toggle inString state if we find a quote that isn't escaped
	                    if (char === '"' && buffer[i - 1] !== '\\') {
	                        inString = !inString;
	                    }
	
	                    // Only count braces if we're NOT inside a string
	                    if (!inString) {
	                        if (char === '{') {
	                            braceCount++;
	                        } else if (char === '}') {
	                            braceCount--;
	                        }
	                    }
	
	                    // If braceCount is zero, we've found the end of our object
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
	                        // This might still fail if our simple tokenizer is fooled, but it's much more robust.
	                        console.error('Error parsing JSON object from stream:', e, jsonString);
	                    }
	                    
	                    processedIndex = objectEndIndex + 1;
	                } else {
	                    break;
	                }
	            }
	        }
	    } catch (error) {
	        console.error("Error calling Gemini API:", error);
	        if (onError) onError(error);
	    }
	}
    async ___handleStream(callbacks) {
        const { onUpdate, onError, onDone } = callbacks;

        let buffer = '';
        const decoder = new TextDecoder('utf-8');
        let fullResponseAccumulator = '';

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contents: this.messages }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new Error(`HTTP error! Status: ${response.status}, Message: ${errorText}`);
                if (onError) onError(httpError);
                return;
            }

            const reader = response.body.getReader();

			const processBuffer = () => {
				while (true) {
					let braceCount = 0;
					let objectStartIndex = -1;
					let objectEndIndex = -1;
			
					for (let i = 0; i < buffer.length; i++) {
						if (buffer[i] === '{') {
							if (braceCount === 0) {
								objectStartIndex = i;
							}
							braceCount++;
						} else if (buffer[i] === '}') {
							braceCount--;
							if (braceCount === 0 && objectStartIndex !== -1) {
								objectEndIndex = i;
								break;
							}
						}
					}
			
					if (objectEndIndex !== -1) {
						const jsonString = buffer.substring(objectStartIndex, objectEndIndex + 1);
						buffer = buffer.substring(objectEndIndex + 1); // Remove the parsed object
			
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
							console.error('Error parsing JSON object from stream:', e, jsonString);
						}
					} else {
						break; // No complete object found, wait for more data
					}
				}
			};

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    processBuffer();
                    this.messages.push({ role: "model", parts: [{ text: fullResponseAccumulator }] });
                    if (onDone) onDone();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                processBuffer();
            }
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            if (onError) onError(error);
        }
    }

    setOptions(newConfig, onErrorCallback, onSuccessCallback, useWorkspaceSettings, source = 'global') {
        for (const name in newConfig) {
            this.setOption(name, newConfig[name]);
        }
        this._settingsSource = source; // Set the source of these settings
        this.clearContext();

        // In a real scenario, you might want to validate the API key here
        // by making a small test call to the Gemini API.
        // For now, we'll just assume success if the key is present.
        if (this.config.apiKey) {
            if (onSuccessCallback) {
                onSuccessCallback(`Gemini settings saved. Using model: ${this.config.model}`);
            }
        } else {
            if (onErrorCallback) {
                onErrorCallback("Gemini API Key is required.");
            }
        }

        // Dispatch event for persistence
        const event = new CustomEvent('setting-changed', {
            detail: {
                settingsName: 'geminiConfig', // Unique name for Gemini settings
                settings: { ...this.config }, // Pass a copy of the current config
                useWorkspaceSettings: useWorkspaceSettings,
                source: this._settingsSource
            }
        });
        window.dispatchEvent(event);
    }

    clearContext() {
        this.messages = [];
    }

    async refreshModels() {
        // For Gemini, refreshing models might involve a network call to list available models.
        // For now, we rely on the hardcoded list in _getAvailableModels.
        // If _getAvailableModels were to fetch from an API, this would trigger a re-fetch.
        console.log("Refreshing Gemini models (currently using hardcoded list).");
    }
}

export default Gemini;
