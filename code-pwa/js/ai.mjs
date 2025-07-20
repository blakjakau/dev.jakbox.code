// ai.mjs
export default class AI {
	constructor() {
		this._editor = null;
		this.config = {}; // Internal configuration object
		this._settingsSchema = {}; // Schema for settings metadata
        this._settingsSource = 'global'; // 'global' or 'workspace'
	}

	set editor(editor) {
		this._editor = editor;
	}

	get editor() {
		return this._editor;
	}

	get settingsSource() {
		return this._settingsSource;
	}

	// Public interface for settings
	getOption(name) {
		const setting = this._settingsSchema[name];
		if (!setting) return undefined;
		return { ...setting, value: this.config[name] };
	}

	async getOptions() {
		const options = {};
		for (const name in this._settingsSchema) {
			const setting = this._settingsSchema[name];
			let enumValues = setting.enum;
			if (setting.lookupCallback) {
				enumValues = await setting.lookupCallback();
			}
			options[name] = { ...setting, value: this.config[name], enum: enumValues };
		}
		return options;
	}

	setOption(name, value) {
		if (this._settingsSchema[name]) {
			this.config[name] = value;
			return true;
		}
		return false;
	}

	setOptions(newConfig) {
		for (const name in newConfig) {
			this.setOption(name, newConfig[name]);
		}
	}

    saveSettings(newConfig, useWorkspaceSettings, appConfig, workspaceConfig) {
        throw new Error("saveSettings must be implemented by subclass");
    }

	async _readEditor() {
		if (!this.editor) return;
		// read  either the selection, or the full text
		const selection = this.editor.getSelectionRange();
		const selectedText = this.editor.session.getTextRange(selection);
		const fileContent = selectedText || this.editor.getValue();

		// get the current mode and code language
		const mode = this.editor.getOption("mode"); // e.g., "ace/mode/javascript"
		const language = mode.split('/').pop(); // e.g., "javascript"

		if (fileContent) {
			if (selectedText) {
				return { source: "selection", type: "code", language: language, content: fileContent, isSelection: true };
			} else {
				const filename = this.editor?.tabs?.activeTab?.config?.name || "unknown"; 
				return { source: filename, type: "file", language: language, content: fileContent, isSelection: false };
			}
		}
		return;
	}

    async _readOpenBuffers() {
        if (!this.editor || !this.editor.tabs || !Array.isArray(this.editor.tabs.tabs)) {
            console.warn("Editor.tabs.tabs not available. Cannot read open buffers.");
            return [];
        }

        const openFilesContent = [];
        const openTabs = this.editor.tabs.tabs; 

        for (const tabInfo of openTabs) {
            try {
                const filename = tabInfo.config.name;
                const session = tabInfo.config.session;
                const content = session.getValue();
                const modeId = session.$modeId; 
                const language = modeId.split('/').pop(); 

                if (content) {
                    openFilesContent.push({ source: filename, type: "file", language: language, content: content, isSelection: false });
                }
            } catch (e) {
                console.error("Error reading content from an open editor tab:", tabInfo, e);
            }
        }
        return openFilesContent;
    }

	/**
	 * Processes the user's prompt to extract `@` tags for context inclusion.
	 * Returns the prompt with tags either inlined (for 'generate' mode)
	 * or removed and stored as structured objects (for 'chat' mode).
	 * @param {string} prompt The original user prompt.
	 * @param {'chat' | 'generate'} runMode The current run mode.
	 * @returns {Promise<{processedPrompt: string, contextItems: Array<Object>}>}
	 */
	async _getContextualPrompt(prompt, runMode) {
        let processedPrompt = prompt;
        const contextItems = [];

		if (this.editor && prompt.match(/@/i)) { 
			// Handle @code and @current - both use _readEditor
			if (prompt.includes("@code") || prompt.includes("@current")) {
				const item = await this._readEditor();
				if (item) {
                    const { source, type, language, content, isSelection } = item;
                    const contextId = isSelection ? `selection:${language}` : `current_file:${language}:${source}`;
                    const codeBlock = "\n\n ```"+language+"\n"+content+"\n``` ";
                    
                    if (runMode === "chat") {
                        contextItems.push({ 
                            type: "file_context", 
                            id: contextId,
                            filename: source, 
                            language: language, 
                            content: content,
                            isSelection: isSelection
                        });
                        processedPrompt = processedPrompt.replace(/@code/ig, "");
                        processedPrompt = processedPrompt.replace(/@current/ig, "");
                    } else { // generate mode, inline
                        processedPrompt = processedPrompt.replace(/@code/ig, codeBlock);
                        processedPrompt = processedPrompt.replace(/@current/ig, codeBlock);
                    }
                }
			}

            // Handle @open
            if (prompt.includes("@open")) {
                const openFiles = await this._readOpenBuffers();
                let openFilesContentString = ""; // For generate mode inlining

                if (openFiles.length > 0) {
                    openFiles.forEach(item => {
                        const { source, type, language, content, isSelection } = item;
                        if (runMode === "chat") {
                            contextItems.push({ 
                                type: "file_context", 
                                id: `open_file:${language}:${source}`,
                                filename: source, 
                                language: language, 
                                content: content,
                                isSelection: isSelection
                            });
                        } else { // generate mode, inline
                            openFilesContentString += `\n\n--- File: ${source} ---\n`;
                            openFilesContentString += "\n```"+language+"\n"+content+"\n```\n";
                        }
                    });
                } else {
                    if (runMode === "generate") {
                        openFilesContentString = "\n\n(No open files found or available via editor API)\n\n";
                    }
                }
                
                if (runMode === "chat") {
                    processedPrompt = processedPrompt.replace(/@open/ig, "");
                } else { // generate mode, inline
                    processedPrompt = processedPrompt.replace(/@open/ig, openFilesContentString);
                }
            }
		}
        processedPrompt = processedPrompt.trim(); // Clean up any extra whitespace from replacements
        return { processedPrompt, contextItems };
    }

	/**
     * Estimates the token count for a given text or array of messages.
     * This is a very rough character-based estimate (e.g., 1 token per 4 characters)
     * used when a precise token counting API is not available.
     * @param {string | Array<Object>} messages The text string or array of messages.
     * @returns {number} Estimated token count.
     */
    estimateTokens(messages) {
        if (typeof messages === 'string') {
            return Math.ceil(messages.length / 4);
        } else if (Array.isArray(messages)) {
            let totalLength = 0;
            for (const msg of messages) {
                // IMPORTANT: Only count content that would be sent to the AI
                // The `type: 'error'` or `type: 'system_message'` should not contribute to AI tokens.
                if (msg.role === 'user' || msg.role === 'model') {
                    totalLength += (msg.content || '').length;
                } else if (msg.type === 'file_context' && msg.content) {
                    // Include context messages, also consider the "framing" text like filename and code block markers
                    // This estimation should match how _prepareMessagesForAI formats file_context for AI
                    const fileContentForAI = `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``;
                    totalLength += fileContentForAI.length;
                }
            }
            return Math.ceil(totalLength / 4);
        }
        return 0;
    }

	generate(messages, callbacks) {
		throw new Error("Not implemented");
	}

	chat(messages, callbacks) {
		throw new Error("Not implemented");
	}
}

