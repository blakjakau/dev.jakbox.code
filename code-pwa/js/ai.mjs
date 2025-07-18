export default class AI {
	constructor() {
		this.editor = null;
		this.fileReader = null;
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

	set fileReader(fileReader) {
		// TODO recieve a custom fileReader object
		// asign to a local variable and implement usage in this._readFile(filename)
	}

	async _readFile(filename) {
		// TODO pass filename to the fileReader.readFile()
		// if a filename and content is returned, it should be passed back to the calling function
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
				return { source: "selection", type: "code", language: language, content: fileContent };
			} else {
				const filename = this.editor?.tabs?.activeTab?.config?.name || "unknown";
				return { source: filename, type: "file", language: language, content: fileContent };
			}
		}
		return;
	}

	async _getContextualPrompt(prompt) {
        let fullPrompt = prompt;
		if (this.editor && prompt.match(/\@/i)) {
			const contextItems = [];
			if (prompt.includes("@code")) {
				const item = await this._readEditor();
				if (item) {
                    const { source, type, language, content } = item;
                    const codeBlock = "\n\n ```"+language+"\n"+content+"\n``` ";
                    fullPrompt = fullPrompt.replace(/@code/ig, codeBlock);
                }
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