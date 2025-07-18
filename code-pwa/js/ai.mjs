export default class AI {
	constructor() {
		this.editor = null;
		this.fileReader = null;
		this.settings = {};
	}

	set editor(editor) {
		this._editor = editor;
	}

	get editor() {
		return this._editor;
	}

	get settings() {
		return this.config;
	}

	set settings(newConfig) {
		this.config = { ...this.config, ...newConfig };
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
				if (item) contextItems.push(item);
				prompt = prompt.replace(/@code/ig, "code");
			}
			const m = prompt.match(/\@(^code)/gi);
			if (m) {
				// TODO prompt includes other @ tags
				console.log(m);
			}

			if (contextItems.length > 0) {
				for (const item of contextItems) {
					const { source, type, language, content } = item;
					fullPrompt += `\n\n// ${type} context: ${language}\n\n${content}\n// end of ${type} context`;
				}
			}
		}
        return fullPrompt;
    }

	generate(prompt, callbacks) {
		throw new Error("Not implemented");
	}
}