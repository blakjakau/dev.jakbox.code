// ai-manager-history.mjs

import { Block, Button } from "./elements.mjs"
import DEFAULT_WELCOME_MESSAGE_MARKDOWN from "./ai-manager-setup-guide.mjs"
export const MAX_RECENT_MESSAGES_TO_PRESERVE = 5

class AIManagerHistory {
	constructor(aiManager) {
		this.manager = aiManager // Reference to the main AIManager
		// REMOVED: this.chatHistory = [] // History is now owned by AIManager's activeSession
		
		if(window.markdownit) {
			this.md = aiManager.md
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
			this.manager.promptEditor.setValue(""); // Clear the UI prompt area via ACE API
			this.manager.promptIndex = 0; // Reset prompt history index to the "new prompt" line
			this.manager._unsentPromptBuffer = null; // Also clear the unsent prompt buffer
			this.manager._resizePromptArea(); // Resize prompt area after clearing
		}
		this.manager.fileBar.clear(); // Clear the file context bar
		this.render(); // Re-render to show empty state/welcome message
		this.manager._dispatchContextUpdate("clear_active_session"); // Dispatch update to save changes
	}

	// REWRITTEN addMessage() to dynamically append new system messages.
	loadSessionMessages(messagesArray, autoScroll=false) {
		// This method is now solely responsible for telling the UI to render
		// the messages of the *newly active* session. `this.chatHistory` getter
		// already points to the correct place.
		this.render();
		// Dispatch an update to ensure the UI (progress bar, etc.) reflects the loaded state.
		this.manager._dispatchContextUpdate("session_messages_loaded");
		
		// if(autoScroll) {
		// 	setTimeout(()=>{
		// 		this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
		// 	}, 50)
		// }
	}

	/**
	 * Adds a message object to the active session's history and re-renders the UI.
	 * @param {Object} messageObject - The message to add (e.g., {type: "system_message", content: "..."}).
	 * @param {boolean} [autoScroll=true] - Whether to automatically scroll to the bottom.
	 */
	addMessage(messageObject, autoScroll = true) { // Default remains true for other message types
		if (this.manager.activeSession) {
			// New logic: System messages should never cause an auto-scroll.
			if (messageObject.type === 'system_message') {
				autoScroll = false;
			}

			this.manager.activeSession.messages.push(messageObject);
			this.manager.activeSession.lastModified = Date.now(); // Update last modified timestamp
			this.appendMessageElement(messageObject); // Append the new message directly
			if (this.conversationArea && autoScroll) { // Scroll only if requested and not a system message
				this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
			}
			this.manager._dispatchContextUpdate("add_message", { messageType: messageObject.type });
		}
	}

    // Method to display the default welcome message
    _showDefaultWelcomeMessage() {
        if (this.conversationArea) {
            this.conversationArea.innerHTML = this._defaultWelcomeMessageHtml;
        }
    }

	/**
	 * Populates the FileBar with chips representing file_context messages.
	 */
	populateFileBar() {
		if (!this.manager.fileBar) return;
		this.manager.fileBar.clear();
		for (const message of this.chatHistory) {
			if (message.type === 'file_context') {
				this.manager.fileBar.add(message);
			}
		}
	}

	/**
	 * The main render method, used when loading a full session history.
	 * Clears the existing UI and rebuilds it from the current chatHistory.
	 */
	render({ isNewMessage = false } = {}) {
		if (!this.conversationArea) return
		this.conversationArea.innerHTML = "" // Clear existing UI

		// Populate the file context bar separately
		this.populateFileBar();

        // If history is empty, but AI is configured (which implies chatContainer is visible),
        // just leave the chat area blank. The welcome message is handled by AIManager._checkAndDisplayWelcomeOrChat
        // when the AI is not configured, which hides the chatContainer itself.
        if (this.chatHistory.length === 0) {
            return;
        }

		// Use the new element factory for each message in the history
		for (let i = 0; i < this.chatHistory.length; i++) {
			const message = this.chatHistory[i];
			// Skip file_context messages as they are only in the fileBar for initial render
			if (message.type === 'file_context') continue;
			const element = this._createMessageElement(message, i); // No isNewMessage for full render
			if (element) this.conversationArea.append(element);
		}
	}

	/**
	 * NEW: Dynamically creates and appends a single message element to the DOM.
	 * This is used for new incoming messages (user prompts, model responses, system messages, file contexts).
	 * @param {Object} message - The message object to append.
	 */
	appendMessageElement(message) {
		if (!this.conversationArea) return;

		// If the welcome message is currently displayed, clear it before appending real content.
		// We check for the specific h1 content and if the history size is small (e.g., this is the first real message).
		if (this.chatHistory.length === 1 && message.type !== 'system_message') { // If this is the first "real" message
			const firstChild = this.conversationArea.firstElementChild;
			if (firstChild && firstChild.classList.contains('response-block')) {
				const h1 = firstChild.querySelector('h1');
				if (h1 && h1.textContent.includes("Welcome to the AI Assistant")) {
					this.conversationArea.innerHTML = ""; // Clear the welcome message
				}
			}
		}
		
		// Find the index of the message within the chatHistory array.
		// This is important for _createMessageElement to determine if a delete button should be added.
		const index = this.chatHistory.findIndex(m => m.id === message.id);

		const element = this._createMessageElement(message, index, true); // Always new when appended
		if (element) {
			this.conversationArea.append(element);
		}
		return element;
	}

	/**
	 * NEW: Factory method to create a DOM element for any given message object.
	 * This centralizes UI creation logic for individual messages.
	 * @param {Object} message The message object from the chat history.
	 * @param {number} index The message's index in the chat history array (needed for delete button logic).
	 * @returns {HTMLElement|null} The generated DOM element or null if message is invalid.
	 */
	_createMessageElement(message, index, isNew = false) { // Add isNew parameter here
		if (!message.id) { // If message doesn't have an ID (e.g., loaded from old session data)
			message.id = crypto.randomUUID(); // Assign a new one
		}

		let element;

		if (message.type === "user") {
			// Check if this user prompt is followed by a model response.
			// We only add the delete button if the pair exists.
			const nextMessageIsModel = index >= 0 && (index + 1) < this.chatHistory.length && this.chatHistory[index + 1].type === "model";
			
			const wrapper = new Block();
			wrapper.classList.add("prompt-pill-wrapper");
			wrapper.dataset.messageId = message.id; // Store message ID on the wrapper

			const messageBlock = new Block();
			messageBlock.classList.add("prompt-pill");
			messageBlock.innerHTML = this.md.render(message.content);
			wrapper.append(messageBlock);

			if (nextMessageIsModel) {
				const deleteButton = this._createDeleteButton(message.id);
				wrapper.append(deleteButton);
			}
			element = wrapper;

		} else if (message.type === "model" || message.type === "error") {
			element = new Block();
			element.classList.add("response-block");
			if (message.type === "error") element.classList.add("error-block"); // Add a specific class for error styling
			element.dataset.messageId = message.id; // Store message ID on the response block
			element.innerHTML = this.md.render(message.content); // Render content
			if (message.type === "model") this.manager._addCodeBlockButtons(element, message); // Add buttons for model messages, passing the message object

		} else if (message.type === "system_message") {
			element = new Block();
			element.classList.add("system-message-block");
			element.dataset.messageId = message.id; // Store message ID on system message
			element.innerHTML = this.md.render(message.content);

			// If this render was triggered by a new message, and this is that new message, make it sticky.
			if (isNew && message.type === 'system_message' && index === this.chatHistory.length - 1) {
				element.classList.add("system-message-sticky-fade");
				// When the animation completes, remove the class to revert its position.
				element.addEventListener('animationend', () => {
					element.classList.remove('system-message-sticky-fade');
				}, { once: true });
				// Also add a click listener to dismiss the notice immediately.
				element.addEventListener('click', () => {
					element.classList.remove('system-message-sticky-fade');
				}, { once: true });
			}
		}

		return element;
	}

	/**
	 * NEW: Helper to consistently create a delete button for a user/model message pair.
	 * This button's click handler will use the message's actual index for deletion.
	 * @param {number} userPromptIndex - The index of the user prompt in the `chatHistory` array.
	 * @returns {Button} The configured delete button element.
	 */
	_createDeleteButton(userMessageId) {
		const deleteButton = new Button();
		deleteButton.classList.add("delete-history-button");
		deleteButton.icon = "delete";
		deleteButton.title = "Delete this prompt and response";
		deleteButton.on("click", () => this._handleDeleteHistoryItem(userMessageId));
		return deleteButton;
	}

	/**
	 * Handles the deletion of a user prompt and its subsequent model response.
	 * This now uses the message ID to find the item dynamically, preventing issues with stale indices.
	 * @param {string} userMessageId - The ID of the user prompt to remove.
	 */
	_handleDeleteHistoryItem(userMessageId) {
		if (!this.manager.activeSession) return;

		// Dynamically find the index of the message at click time to avoid stale references.
		const userPromptIndex = this.chatHistory.findIndex(msg => msg.id === userMessageId);
		if (userPromptIndex === -1) {
			console.warn(`Attempted to delete a message with ID ${userMessageId} that was not found.`);
			return;
		}

		// Get the IDs of the messages to remove from the DOM
		const userMessage = this.chatHistory[userPromptIndex];
		const modelMessage = this.chatHistory[userPromptIndex + 1]; // Guaranteed to exist by _createMessageElement logic

		if (userMessage?.id) {
			const userElement = this.conversationArea.querySelector(`[data-message-id="${userMessage.id}"]`);
			if (userElement) userElement.remove();
		}
		if (modelMessage?.id) {
			const modelElement = this.conversationArea.querySelector(`[data-message-id="${modelMessage.id}"]`);
			if (modelElement) modelElement.remove();
		}

		// Now update the data array
		this.manager.activeSession.messages.splice(userPromptIndex, 2); // Removes 2 items
		this.manager.activeSession.lastModified = Date.now(); // Update last modified timestamp
		
		// Re-enable buttons state as history has changed
		this.manager._setButtonsDisabledState(this.manager._isProcessing);
		this.manager._dispatchContextUpdate("delete_item"); // Dispatch update to save changes
	}

	/**
	 * Handles the deletion of a file context item from the history.
	 * REWRITTEN to perform direct DOM removal before modifying the active session's messages.
	 * @param {string} fileId - The unique ID of the file context item to remove.
	 */
	_handleDeleteFileContextItem(fileId) {
		if (!this.manager.activeSession) return;

		// Remove the chip from the FileBar UI
		this.manager.fileBar.remove(fileId);

		// Then update the data array
		this.manager.activeSession.messages = this.manager.activeSession.messages.filter(
			(item) => item.id !== fileId
		);

		this.manager.activeSession.lastModified = Date.now(); // Update last modified timestamp
		
		// Re-enable buttons state as history has changed
		this.manager._setButtonsDisabledState(this.manager._isProcessing);
		this.manager._dispatchContextUpdate("delete_item"); // Dispatch update to save changes
	}

	// OLD addContextFile is removed as AIManager.generate handles it directly.
	// OLD _appendFileContextUI is replaced by _createFileContextElement and appendMessageElement.

	/**
	 * NEW: Method to add a delete button to the last user message after a model response is received.
	 * This function ensures the delete button appears for full conversation turns.
	 */
	addInteractionToLastUserMessage(userMessage) {
		if (!userMessage || !userMessage.id) return;

		// Find the user message element in the DOM
		const userElement = this.conversationArea.querySelector(`[data-message-id="${userMessage.id}"]`);
		if (userElement && userElement.classList.contains("prompt-pill-wrapper")) {
			// Check if a delete button already exists to prevent duplicates on re-renders
			if (!userElement.querySelector(".delete-history-button")) {
				const userPromptIndex = this.chatHistory.findIndex(msg => msg.id === userMessage.id);
				if (userPromptIndex !== -1) { // Check that message is still in history
					const deleteButton = this._createDeleteButton(userMessage.id);
					userElement.append(deleteButton);
				}
			}
		}
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

		const summarizeButton = this.manager.summarizeButton;
		let originalButtonContent = '';

		try {
			// Replace button content with a spinner
			if (summarizeButton) {
				originalButtonContent = summarizeButton.innerHTML;
				summarizeButton.innerHTML = '<div class="button-spinner"></div>';
				summarizeButton.classList.add('loading');
			}

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
				if (eligibleCount === finalNumberToSummarize) {
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
					id: crypto.randomUUID(),
					role: "model",
					type: "model",
					content: `**Summary of prior conversation:**\n\n${summaryResponse}`,
					timestamp: Date.now(),
				}
				const tokensAfterSummary = this.ai.estimateTokens([summaryMessage])

				const systemMessage = {
					id: crypto.randomUUID(),
					type: "system_message",
					content: `History summarized: **${tokensBeforeSummary}** tokens condensed to **${tokensAfterSummary}** tokens.`,
					timestamp: Date.now(),
				}

				// The splice operation is now simpler and more robust.
				const spliceStartIndex = firstConversationIndex
				const spliceCount = actualMessagesToReplace.length

				// Modify the active session's messages directly
				this.manager.activeSession.messages.splice(spliceStartIndex, spliceCount, summaryMessage); // Insert summary at the top
				this.manager.activeSession.messages.push(systemMessage); // Append system message to the end
				this.manager.activeSession.lastModified = Date.now(); // Update last modified timestamp for the session

				this.render({ isNewMessage: true }); // Render with the new summary and flag the last message as new and sticky
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
			// Restore button content and remove spinner
			if (summarizeButton) {
				summarizeButton.innerHTML = originalButtonContent;
				summarizeButton.classList.remove('loading');
			}
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
