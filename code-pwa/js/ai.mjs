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

	// Removed _readFile and fileReader properties/setters, as they are not needed for current scope.

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
				return { source: "selection", type: "code", language: language, content: fileContent };
			} else {
				const filename = this.editor?.tabs?.activeTab?.config?.name || "unknown"; 
				return { source: filename, type: "file", language: language, content: fileContent };
			}
		}
		return;
	}

    // REVISED AGAIN: _readOpenBuffers using editor.tabs.tabs (unchanged from last iteration)
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
                    openFilesContent.push({ source: filename, type: "file", language: language, content: content });
                }
            } catch (e) {
                console.error("Error reading content from an open editor tab:", tabInfo, e);
            }
        }
        return openFilesContent;
    }


	async _getContextualPrompt(prompt) {
        let fullPrompt = prompt;
		if (this.editor && prompt.match(/\@/i)) { 
			
            // Handle @code and @current - both use _readEditor
			if (prompt.includes("@code") || prompt.includes("@current")) {
				const item = await this._readEditor();
				if (item) {
                    const { source, type, language, content } = item;
                    const codeBlock = "\n\n ```"+language+"\n"+content+"\n``` ";
                    fullPrompt = fullPrompt.replace(/@code/ig, codeBlock);
                    fullPrompt = fullPrompt.replace(/@current/ig, codeBlock);
                }
			}

            // Handle @open
            if (prompt.includes("@open")) {
                const openFiles = await this._readOpenBuffers();
                let openFilesContentString = "";
                if (openFiles.length > 0) {
                    openFiles.forEach(item => {
                        const { source, type, language, content } = item;
                        openFilesContentString += `\n\n--- File: ${source} ---\n`;
                        openFilesContentString += "\n```"+language+"\n"+content+"\n```\n";
                    });
                } else {
                    openFilesContentString = "\n\n(No open files found or available via editor API)\n\n";
                }
                fullPrompt = fullPrompt.replace(/@open/ig, openFilesContentString);
            }
		}
        return fullPrompt;
    }

	generate(prompt, callbacks) {
		throw new Error("Not implemented");
	}

	chat(prompt, callbacks) {
		throw new Error("Not implemented");
	}
}
