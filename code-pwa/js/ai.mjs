// ai.mjs
export default class AI {
	constructor() {
		this._editor = null;
		this.config = {}; // Internal configuration object
		this._settingsSchema = {}; // Schema for settings metadata
        this._settingsSource = 'global'; // 'global' or 'workspace'
	}
	
	async init() {
		
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

	isConfigured() { 
		return false
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

	async _readEditor(){
		if (!this.editor) return;
		// read  either the selection, or the full text
		const selection = this.editor.getSelectionRange();
		const selectedText = this.editor.session.getTextRange(selection);
		const fileContent = selectedText || this.editor.getValue();

		// get the current mode and code language
		const mode = this.editor.getOption("mode"); // e.g., "ace/mode/javascript"
		const language = mode.split('/').pop(); // e.g., "javascript"

		if (fileContent) {
			const config = this.editor?.tabs?.activeTab?.config;
			const filename = config?.name || "unknown"; 
			const path = config?.path || filename;

			if (selectedText) {
				return { source: "selection", path: `selection:${path}`, type: "code", language: language, content: fileContent, isSelection: true };
			} else {
				return { source: filename, path: path, type: "file", language: language, content: fileContent, isSelection: false };
			}
		}
		return;
	}

    // Existing _readOpenBuffers (no change needed as _getTabSessionByPath is more direct for apply diff)
    async _readOpenBuffers() {
        const openFilesContent = [];
        const allTabs = this._getAllOpenTabs(); // Use the new helper

        for (const tabInfo of allTabs) {
            try {
                if (!tabInfo.config || !tabInfo.config.session) continue;

                const filename = tabInfo.config.name;
                const path = tabInfo.config.path;
                const session = tabInfo.config.session;
                const content = session.getValue();
                const modeId = session.$modeId; 
                const language = modeId ? modeId.split('/').pop() : 'text'; 

                if (content && filename !== 'untitled' && path) {
                    openFilesContent.push({ 
                        source: filename, 
                        path: path, 
                        type: "file", 
                        language: language, 
                        content: content, 
                        isSelection: false 
                    });
                }
            } catch (e) {
                console.error("Error reading content from an open editor tab:", tabInfo, e);
            }
        }
        return openFilesContent;
    }

    // NEW METHOD: Helper to get all open tabs regardless of pane
    _getAllOpenTabs() {
        const allTabs = [];
        if (window.ui && window.ui.leftTabs && window.ui.leftTabs.tabs) {
            allTabs.push(...window.ui.leftTabs.tabs);
        }
        if (window.ui && window.ui.rightTabs && window.ui.rightTabs.tabs) {
            allTabs.push(...window.ui.rightTabs.tabs);
        }
        // Ensure uniqueness by path, preferring left over right if path duplicates
        const uniqueTabsMap = new Map();
        for (const tab of allTabs) {
            if (tab.config && tab.config.path && !uniqueTabsMap.has(tab.config.path)) {
                uniqueTabsMap.set(tab.config.path, tab);
            }
        }
        return Array.from(uniqueTabsMap.values());
    }

    // NEW METHOD: Finds an open tab's full info object by its file path
    async _getTabSessionByPath(targetPath) {
        const openTabs = this._getAllOpenTabs();
        for (const tabInfo of openTabs) {
            if (tabInfo.config && tabInfo.config.path === targetPath && tabInfo.config.session) {
                return tabInfo; // Return the full tabInfo object (which contains config.session)
            }
        }
        return null;
    }
	/**
	 * Finds a file's data from the workspace index by its path.
	 * It prioritizes exact matches but can also find files based on partial end paths.
	 * @param {string} targetPath - The path (or partial path) of the file to find.
	 * @returns {object|null} The file data object from the index or null if not found.
	 */
	_findFileByPath(targetPath) {
		if (!window.ui?.fileList?.index?.files) return null;
		const files = window.ui.fileList.index.files;
		// Normalize targetPath to remove leading '@' or '/' for matching
		const normalizedTargetPath = targetPath.replace(/^[@/]+/, '');
		// 1. Prioritize exact match on full path
		let foundFile = files.find(f => f.path === normalizedTargetPath);
		if (foundFile) return foundFile;
		// 2. If not, find a file that *ends with* the provided path.
		foundFile = files.find(f => f.path.endsWith(normalizedTargetPath));
		if (foundFile) return foundFile;
		
		// 3. Final fallback: check just by filename
		foundFile = files.find(f => f.name === normalizedTargetPath);
		return foundFile || null;
	}
	/**
	 * Simplifies a full file path to the shortest possible unique path within the workspace.
	 * @param {string} fullPath - The complete path of the file.
	 * @param {Array<string>} allFilePaths - An array of all file paths in the workspace.
	 * @returns {string} The simplified, unique path.
	 */
	_simplifyPath(fullPath, allFilePaths) {
		const pathParts = fullPath.split('/').filter(p => p);
		const filename = pathParts[pathParts.length - 1];
		if (!filename) return fullPath;
		// Check if the filename alone is unique
		const filesWithSameName = allFilePaths.filter(p => p.endsWith(`/${filename}`));
		if (filesWithSameName.length <= 1) {
			return filename;
		}
		// If not unique, add parent directories one by one until it is unique
		for (let i = pathParts.length - 2; i >= 0; i--) {
			const simplified = pathParts.slice(i).join('/');
			const filesWithSameSimplifiedPath = allFilePaths.filter(p => p.endsWith(`/${simplified}`));
			if (filesWithSameSimplifiedPath.length <= 1) {
				return simplified;
			}
		}
		// If all else fails, return the full path (but without any pesky leading slash)
		return fullPath.startsWith('/') ? fullPath.substring(1) : fullPath;
	}
	/**
	 * Processes the user's prompt to extract `@` tags for context inclusion.
	 * Returns the prompt with tags either inlined (for 'generate' mode)
	 * or removed and stored as structured objects (for 'chat' mode).
	 * @param {string} prompt The original user prompt.
	 * @param {'chat' | 'generate'} runMode The current run mode.
	 * Returns the prompt with tags removed and stored as structured context items.
	 * @param {string} prompt - The original user prompt.
	 * @param {'chat'} runMode - The current run mode.
	 * @returns {Promise<{processedPrompt: string, contextItems: Array<Object>}>}
	 */
	async _getContextualPrompt(prompt, runMode) {
        let processedPrompt = prompt;
        const contextItems = [];
		const allFilePaths = window.ui?.fileList?.index?.files.map(f => f.path) || [];
		const processedPaths = new Set();
		if (this.editor && prompt.includes("@")) {
			// --- Phase 1: Handle @/path/to/file.ext tags ---
			// Regex to find any @-mention followed by non-space characters.
			const fileTagRegex = /@(\S+)/g;
			let match;
			while ((match = fileTagRegex.exec(prompt)) !== null) {
				const fullTag = match[0]; // e.g., "@src/main.mjs"
				const pathString = match[1]; // e.g., "src/main.mjs"

				// Skip if it's a known keyword like @code or @open, which are handled in Phase 2
				if (['code', 'current', 'open'].includes(pathString)) {
					continue;
				}

				if (processedPaths.has(pathString)) continue;
				processedPaths.add(pathString);
				const fileData = this._findFileByPath(pathString);
				if (!fileData) continue;
				let tab = await this._getTabSessionByPath(fileData.path);
				if (!tab && window.ui?.fileList?.open) {
					await window.ui.fileList.open(fileData);
					tab = await this._getTabSessionByPath(fileData.path);
				}
				if (tab) {
					contextItems.push({
						type: "file_context",
						id: fileData.path,
						filename: fileData.name,
						language: tab.config.mode.name || 'text',
						content: tab.config.session.getValue(),
						isSelection: false
					});
					const simplifiedPath = this._simplifyPath(fileData.path, allFilePaths);
					const tagToReplaceRegex = new RegExp(fullTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
					processedPrompt = processedPrompt.replace(tagToReplaceRegex, `\`${simplifiedPath}\``);
				}
			}
			// --- Phase 2: Handle keyword tags like @code and @open ---
			// Note: This operates on the already-modified `processedPrompt`.
			const keywords = [
				{ tag: "@code", handler: async () => [await this._readEditor()] },
				{ tag: "@current", handler: async () => [await this._readEditor()] },
				{ tag: "@open", handler: async () => await this._readOpenBuffers() }
			];
			for (const { tag, handler } of keywords) {
				if (processedPrompt.includes(tag)) {
					const items = await handler();
					if (items && items.length > 0) {
						items.forEach(item => {
							if (item && item.path) { // Ensure item is valid
								contextItems.push({
									type: "file_context",
									id: item.path,
									filename: item.source,
									language: item.language,
									content: item.content,
									isSelection: item.isSelection
								});
							}
						});
					}
					processedPrompt = processedPrompt.replace(new RegExp(tag, "ig"), "");
				}
			}
			// Deprecated fallback for original generate mode.
			if (runMode === "generate") {
				const item = await this._readEditor();
				if (item) {
                    openFilesContentString = "\n\n(No open files found or available via editor API)\n\n";
                }
                
                if (runMode === "generate") {
                    processedPrompt = processedPrompt.replace(/@open/ig, openFilesContentString);
                }
            }
            
            // Clean up all tags for chat mode after processing
            if (runMode === "chat") {
                processedPrompt = processedPrompt.replace(/@(code|current|open)/ig, "");
            }
            // If after processing tags, the prompt is just whitespace, set a default message
            if (runMode === "chat" && processedPrompt.trim() === "" && contextItems.length > 0) {
                // do nothing!
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
                    // This estimation should match how _prepareMessagesForAI formats file_context for AI (using the full path from msg.id)
                    const fileContentForAI = `--- File: ${msg.id} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``;
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

