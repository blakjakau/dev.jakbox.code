// ai-manager-history.mjs

import { Block, Button } from "./elements.mjs"
import DEFAULT_WELCOME_MESSAGE_MARKDOWN from "./ai-manager-setup-guide.mjs"
export const MAX_RECENT_MESSAGES_TO_PRESERVE = 5

class AIManagerHistory {
	constructor(aiManager) {
		this.manager = aiManager // Reference to the main AIManager
		// REMOVED: this.chatHistory = [] // History is now owned by AIManager's activeSession
		
		if(window.markdownit) {
			this.md = window.markdownit()
	        // Pre-render the welcome message HTML
	        this._defaultWelcomeMessageHtml = this.md.render(DEFAULT_WELCOME_MESSAGE_MARKDOWN);
		}
	}

	get ai() {
		return this.manager.ai
	}

	get conversationArea() {
		return this.manager.conversationArea
	}

	// NEW: Getter to always return the messages of the currently active session
	get chatHistory() {
		return this.manager.activeSession?.messages || [];
	}

	clear() {
		if (this.manager.activeSession) {
			this.manager.activeSession.messages = []; // Clear the active session's messages
			this.manager.activeSession.promptInput = ""; // Clear its current prompt input
			this.manager.activeSession.promptHistory = []; // Clear its command history
			this.manager.promptArea.value = ""; // Clear the UI prompt area
			this.manager.promptIndex = -1; // Reset prompt history index
			this.manager._resizePromptArea(); // Resize prompt area after clearing
		}
		this.render(); // Re-render to show empty state/welcome message
		this.manager._dispatchContextUpdate("clear_active_session"); // Dispatch update to save changes
	}

	addMessage(message) {
		// AIManager's `generate` method now directly adds messages to `manager.activeSession.messages`.
		// This method is now primarily for adding system messages (e.g., AI provider switch).
		// It simply pushes the message and then calls render.
		if (this.manager.activeSession) {
			this.manager.activeSession.messages.push(message);
		}
		this.render();
		// The dispatch is handled by AIManager's `generate` or `_dispatchContextUpdate` after message addition.
	}

	addContextFile(item) {
		// This method is conceptually no longer needed here as AIManager.generate
		// directly adds context files to manager.activeSession.messages.
		// If you intend for it to be callable, it should modify `this.manager.activeSession.messages`.
		// For clarity, let's assume `AIManager.generate` directly handles it.
		console.warn("AIManagerHistory.addContextFile should ideally not be called directly. Context files are managed by AIManager.");
		if (this.manager.activeSession) {
			// Remove invalidated copies of the same file first if re-adding
			this.manager.activeSession.messages = this.manager.activeSession.messages.filter(
				(oldItem) => !(oldItem.type === "file_context" && oldItem.id === item.id)
			);
			this.manager.activeSession.messages.push({
				type: "file_context",
				id: item.id,
				filename: item.filename,
				language: item.language,
				content: item.content,
				timestamp: Date.now(),
			});
			this.render();
			// No dispatch here, it will be part of the generate flow's overall dispatch.
		}
	}

	// RENAMED: from loadHistory to loadSessionMessages, as it loads for the active session.
	loadSessionMessages(messagesArray, autoScroll=false) {
		// This method is now solely responsible for telling the UI to render
		// the messages of the *newly active* session. `this.chatHistory` getter
		// already points to the correct place.
		this.render();
		// Dispatch an update to ensure the UI (progress bar, etc.) reflects the loaded state.
		this.manager._dispatchContextUpdate("session_messages_loaded");
		
		if(autoScroll) {
			setTimeout(()=>{
				this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
			}, 250)
		}
	}

    // Method to display the default welcome message
    _showDefaultWelcomeMessage() {
        if (this.conversationArea) {
            this.conversationArea.innerHTML = this._defaultWelcomeMessageHtml;
        }
    }

	render() {
		if (!this.conversationArea) return
		this.conversationArea.innerHTML = "" // Clear existing UI

        // Check if chat history is empty AND AI is not configured
        // If no active session OR active session has no messages AND AI is not configured
        if ((!this.manager.activeSession || this.chatHistory.length === 0) && (!this.manager.ai || !this.manager.ai.isConfigured())) {
            this._showDefaultWelcomeMessage();
            return; // Stop rendering actual history if welcome message is shown
        }

        // If history is empty but AI is configured, just show empty chat, no welcome guide
        if (this.chatHistory.length === 0) {
            return; 
        }

		// Use a standard for loop to get index access
		for (let i = 0; i < this.chatHistory.length; i++) {
			const message = this.chatHistory[i]

			if (message.type === "user") {
				// Check if this user prompt is followed by a model response
				const nextMessageIsModel = i + 1 < this.chatHistory.length && this.chatHistory[i + 1].type === "model"

				if (nextMessageIsModel) {
					// Create a wrapper to contain the pill and the delete button
					const wrapper = new Block()
					wrapper.classList.add("prompt-pill-wrapper")

					const messageBlock = new Block()
					messageBlock.classList.add("prompt-pill")
					messageBlock.innerHTML = this.md.render(message.content)
					wrapper.append(messageBlock)

					// Create the delete button
					const deleteButton = new Button()
					deleteButton.classList.add("delete-history-button")
					deleteButton.icon = "delete"
					deleteButton.title = "Delete this prompt and response"
					deleteButton.on("click", () => this._handleDeleteHistoryItem(i))
					wrapper.append(deleteButton)

					this.conversationArea.append(wrapper)
				} else {
					// Render user prompt without a delete button (it's the last message, or not part of a pair)
					const messageBlock = new Block()
					messageBlock.classList.add("prompt-pill")
					messageBlock.innerHTML = this.md.render(message.content)
					// It's not in a wrapper, so it needs its own alignment and margin
					messageBlock.style.alignSelf = "flex-end"
					messageBlock.style.maxWidth = "80%"
					messageBlock.style.marginBottom = "8px"
					this.conversationArea.append(messageBlock)
				}
			} else if (message.type === "model") {
				const messageBlock = new Block()
				messageBlock.classList.add("response-block")
				messageBlock.innerHTML = this.md.render(message.content)
				this.conversationArea.append(messageBlock)
				this.manager._addCodeBlockButtons(messageBlock)
			} else if (message.type === "file_context") {
				this._appendFileContextUI(message)
			} else if (message.type === "system_message") {
				const messageBlock = new Block()
				messageBlock.classList.add("system-message-block")
				messageBlock.innerHTML = this.md.render(message.content)
				this.conversationArea.append(messageBlock)
			}
		}
		// this.conversationArea.scrollTop = this.conversationArea.scrollHeight
	}

	/**
	 * Handles the deletion of a user prompt and its subsequent model response.
	 * Directly modifies the active session's messages.
	 * @param {number} userPromptIndex - The index in the active session's messages of the user prompt to remove.
	 */
	_handleDeleteHistoryItem(userPromptIndex) {
		if (!this.manager.activeSession) return;
		// We are guaranteed that a model response exists at the next index
		// because the delete button is only rendered when this is true.
		this.manager.activeSession.messages.splice(userPromptIndex, 2); // Removes 2 items

		// Update lastModified timestamp for the session
		this.manager.activeSession.lastModified = Date.now();

		this.render(); // Re-render the UI to reflect the change
		this.manager._dispatchContextUpdate("delete_item"); // Dispatch update to save changes
	}

	/**
	 * Handles the deletion of a file context item from the history.
	 * Directly modifies the active session's messages.
	 * @param {string} fileId - The unique ID of the file context item to remove.
	 */
	_handleDeleteFileContextItem(fileId) {
		if (!this.manager.activeSession) return;
		// Filter out the specific file context item by its unique ID
		this.manager.activeSession.messages = this.manager.activeSession.messages.filter(
			(item) => !(item.type === "file_context" && item.id === fileId)
		);

		// Update lastModified timestamp for the session
		this.manager.activeSession.lastModified = Date.now();

		this.render(); // Re-render the UI to reflect the change
		this.manager._dispatchContextUpdate("delete_item"); // Dispatch update to save changes
	}

	_appendFileContextUI(fileContext) {
		const wrapperBlock = new Block()
		wrapperBlock.classList.add("context-file-wrapper")

		const fileBlock = new Block()
		fileBlock.classList.add("prompt-pill", "context-file-pill")
		fileBlock.dataset.fileId = fileContext.id

		const lines = fileContext.content.split("\n")
		const truncatedContent = lines.length > 7 ? lines.slice(0, 7).join("\n") + "\n..." : fileContext.content
		fileBlock.setAttribute("title", truncatedContent)

		const header = document.createElement("div")
		header.classList.add("context-file-header")
		const filenameText = document.createElement("p")
		filenameText.textContent = `Included File: ${fileContext.filename || fileContext.id}`
		header.appendChild(filenameText)

		const fileSize = fileContext.content.length
		let sizeText = fileSize < 1024 ? `${fileSize} B` : `${(fileSize / 1024).toFixed(1)} KB`
		const fileSizeSpan = document.createElement("span")
		fileSizeSpan.classList.add("file-size")
		fileSizeSpan.textContent = ` (${sizeText})`
		filenameText.appendChild(fileSizeSpan)

		fileBlock.append(header)
		wrapperBlock.append(fileBlock)

		// Add a remove button instead of copy/insert
		const removeButton = new Button()
		removeButton.icon = "delete"
		removeButton.title = "Remove file from context"
		removeButton.classList.add("delete-history-button") // Reuse existing style
		removeButton.on("click", () => this._handleDeleteFileContextItem(fileContext.id))
		wrapperBlock.append(removeButton)

		this.conversationArea.append(wrapperBlock)
	}

	async performSummarization() {
		if (this.manager._isProcessing) {
			console.warn("AI is currently processing or summarizing. Please wait.")
			return
		}
        // Do not summarize if AI is not configured or no active session
        if (!this.manager.ai || !this.manager.ai.isConfigured() || !this.manager.activeSession) {
            console.warn("AI is not configured or no active session. Cannot perform summarization.");
            this.addMessage({
                type: "system_message",
                content: `AI is not configured or no active session. Cannot perform summarization. Please set up your AI provider in the settings or create a new chat.`,
                timestamp: Date.now(),
            });
            return;
        }

		this.manager._isProcessing = true
		this.manager._setButtonsDisabledState(true)

		try {
			// All operations now directly on this.manager.activeSession.messages.
            const conversationMessages = this.manager.activeSession.messages;
            
			// Find the starting point of the actual conversation, skipping all initial file contexts.
			const firstConversationIndex = conversationMessages.findIndex((msg) => msg.type !== "file_context")

			// If there's no conversation yet (e.g., only files have been added), we can't summarize.
			if (firstConversationIndex === -1) {
				console.info("No conversational messages found to summarize.")
				return // Exit gracefully. The 'finally' block will re-enable buttons.
			}

			// Create a contiguous block of the entire conversation to date.
			// This block is guaranteed to start with a user/model message.
			const conversationBlock = conversationMessages.slice(firstConversationIndex)

			// From this block, get only the messages that are part of the dialogue (user/model).
			// This neatly filters out any UI-only 'system_message' entries that might be inside the block.
			const eligibleMessages = conversationBlock.filter((msg) => msg.type === "user" || msg.type === "model")

			// Determine how many of the OLDEST eligible messages we should summarize.
			const targetPercentage = this.manager.config.summarizeTargetPercentage / 100
			const totalEligible = eligibleMessages.length

			// Calculate how many messages we could possibly summarize without touching the most recent ones.
			const maxPossibleToSummarize = Math.max(0, totalEligible - MAX_RECENT_MESSAGES_TO_PRESERVE)
			// Calculate the number of messages our percentage setting is targeting.
			const numberToTargetForSummarization = Math.floor(totalEligible * targetPercentage)
			// The final number to summarize is the smaller of the two, ensuring we never touch the preserved messages.
			const finalNumberToSummarize = Math.min(numberToTargetForSummarization, maxPossibleToSummarize)

			if (finalNumberToSummarize < 2) {
				// Need at least a user/model back-and-forth to be meaningful.
				console.info("Not enough old messages to create a meaningful summary.")
				return
			}

			// Identify the exact block in the original history that needs to be replaced.
			// We do this by finding the index of the Nth eligible message within our conversationBlock.
			let eligibleCount = 0
			let endIndexInConversationBlock = -1
			for (let i = 0; i < conversationBlock.length; i++) {
				if (conversationBlock[i].type === "user" || conversationBlock[i].type === "model") {
					eligibleCount++
				}
				if (eligibleCount === finalNumberToSummarization) {
					endIndexInConversationBlock = i
					break
				}
			}

			// This slice now correctly includes any interspersed 'system_message' entries that will be removed.
			const actualMessagesToReplace = conversationBlock.slice(0, endIndexInConversationBlock + 1)
			const tokensBeforeSummary = this.ai.estimateTokens(actualMessagesToReplace)

			// Create the clean prompt content using only the eligible messages from the block we're replacing.
			const summarizationPromptContent = actualMessagesToReplace
				.filter((msg) => msg.type === "user" || msg.type === "model")
				.map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
				.join("\n\n")

			const summarizationPrompt = `Please summarize the following conversation very concisely, focusing on key topics, questions, and outcomes. Do not add any new information or conversational filler. Just the summary.\n\n${summarizationPromptContent}`
			const internalMessagesForAI = [{ role: "user", content: summarizationPrompt }]

			// Perform the AI call using the original promise/callback structure.
			let summaryResponse = ""
			await new Promise((resolve, reject) => {
				this.ai.chat(internalMessagesForAI, {
					onUpdate: (response) => {
						summaryResponse = response // Capture streaming response
					},
					onDone: () => resolve(), // Resolve the promise when AI is finished
					onError: (error) => reject(error), // Reject the promise on error
				})
			})

			// If we got a summary, replace the old history with the new summary.
			if (summaryResponse) {
				const summaryMessage = {
					role: "model",
					type: "model",
					content: `**Summary of prior conversation:**\n\n${summaryResponse}`,
					timestamp: Date.now(),
				}
				const tokensAfterSummary = this.ai.estimateTokens([summaryMessage])

				const systemMessage = {
					type: "system_message",
					content: `History summarized: **${tokensBeforeSummary}** tokens condensed to **${tokensAfterSummary}** tokens.`,
					timestamp: Date.now(),
				}

				// The splice operation is now simpler and more robust.
				const spliceStartIndex = firstConversationIndex
				const spliceCount = actualMessagesToReplace.length

				// Modify the active session's messages directly
				this.manager.activeSession.messages.splice(spliceStartIndex, spliceCount, summaryMessage, systemMessage)
				this.manager.activeSession.lastModified = Date.now(); // Update last modified timestamp for the session

				this.render()
				this.manager._dispatchContextUpdate("summarize", {
					summaryDetails: { tokensBefore: tokensBeforeSummary, tokensAfter: tokensAfterSummary },
				})
			}
		} catch (error) {
			console.error("Error during summarization:", error)
			this.addMessage({ // Use addMessage as it will then trigger render
				type: "system_message",
				content: `Error during summarization: ${error.message}`,
				timestamp: Date.now(),
			})
			this.manager._dispatchContextUpdate("summarize_error")
		} finally {
			this.manager._isProcessing = false
			this.manager._setButtonsDisabledState(false)
		}
	}

	prepareMessagesForAI() {
		// Now directly use the active session's messages
		let prunableHistory = [...(this.manager.activeSession?.messages || [])]; 
		
		prunableHistory = prunableHistory.filter(
			(msg) => msg.type !== "system_message" && msg.role !== "temp_ai_response"
		)

		const maxTokens = this.ai.MAX_CONTEXT_TOKENS || 4096
		let currentTokens = this.ai.estimateTokens(prunableHistory)
		const minimumMessagesToKeep = 1

		let oldestMessageIndex = 0
		while (currentTokens > maxTokens && oldestMessageIndex < prunableHistory.length - minimumMessagesToKeep) {
			const messageToRemove = prunableHistory[oldestMessageIndex]
			if (messageToRemove.type === "user" || messageToRemove.type === "model") {
				prunableHistory.splice(oldestMessageIndex, 1)
				currentTokens = this.ai.estimateTokens(prunableHistory)
			} else {
				oldestMessageIndex++
			}
		}

		oldestMessageIndex = 0
		while (currentTokens > maxTokens && oldestMessageIndex < prunableHistory.length - minimumMessagesToKeep) {
			prunableHistory.splice(oldestMessageIndex, 1)
			currentTokens = this.ai.estimateTokens(prunableHistory)
		}

		if (currentTokens > maxTokens) {
			console.warn(
				`Context window exceeded even after aggressive pruning. Estimated tokens: ${currentTokens}, Max: ${maxTokens}`
			)
		}

		return prunableHistory.map((msg) => {
			if (msg.type === "file_context") {
				return {
					role: "user",
					content: `--- File: ${msg.filename} ---\n\`\`\`${msg.language}\n${msg.content}\n\`\`\``,
				}
			}
			return { role: msg.role, content: msg.content }
		})
	}
}

export default AIManagerHistory
