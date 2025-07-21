// ai-manager-history.mjs

import { Block, Button } from "./elements.mjs"
export const MAX_RECENT_MESSAGES_TO_PRESERVE = 5

class AIManagerHistory {
	constructor(aiManager) {
		this.manager = aiManager // Reference to the main AIManager
		this.chatHistory = []
		this.md = window.markdownit()
	}

	get ai() {
		return this.manager.ai
	}



	get conversationArea() {
		return this.manager.conversationArea
	}

	clear() {
		this.chatHistory = []
		this.ai.clearContext()
		this.manager._dispatchContextUpdate("clear")
		this.render()
	}

	addMessage(message) {
		this.chatHistory.push(message)
		this.render()
		// Dispatching update will be handled by AIManager after calling this
	}



	addContextFile(item) {
		// Remove invalidated copies of the same file first
		this.chatHistory = this.chatHistory.filter(
			(oldItem) => !(oldItem.type === "file_context" && oldItem.id === item.id)
		)
		this.chatHistory.push({
			type: "file_context",
			id: item.id,
			filename: item.filename,
			language: item.language,
			content: item.content,
			timestamp: Date.now(),
		})
	}

	loadHistory(history, autoScroll=false) {
		if (Array.isArray(history)) {
			this.chatHistory = history
			this.render()
			// NEW: Dispatch an update to ensure the UI (progress bar, etc.) reflects the loaded state.
			this.manager._dispatchContextUpdate("history_loaded")
			
			if(autoScroll) {
				setTimeout(()=>{
					this.conversationArea.scrollTop = this.conversationArea.scrollHeight;
				}, 250)
			}
		}
	}

	render() {
		if (!this.conversationArea) return
		this.conversationArea.innerHTML = "" // Clear existing UI

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
					// Render user prompt without a delete button (it's the last message)
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
	 * @param {number} userPromptIndex - The index in chatHistory of the user prompt to remove.
	 */
	_handleDeleteHistoryItem(userPromptIndex) {
		// We are guaranteed that a model response exists at the next index
		// because the delete button is only rendered when this is true.
		this.chatHistory.splice(userPromptIndex, 2) // Removes 2 items: the user prompt and the model response

		// Re-render the UI to reflect the change
		this.render()

		// Dispatch an update so the AIManager can update the progress bar and button states
		this.manager._dispatchContextUpdate("delete_item")
	}

	/**
	 * NEW: Handles the deletion of a file context item from the history.
	 * @param {string} fileId - The unique ID of the file context item to remove.
	 */
	_handleDeleteFileContextItem(fileId) {
		// Filter out the specific file context item by its unique ID
		this.chatHistory = this.chatHistory.filter(
			(item) => !(item.type === "file_context" && item.id === fileId)
		);

		// Re-render the UI to reflect the change
		this.render();

		// Dispatch an update so the AIManager can update the progress bar
		this.manager._dispatchContextUpdate("delete_item");
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

		// Removed the timestampSpan section entirely
		// const timestampSpan = document.createElement("span")
		// timestampSpan.classList.add("timestamp")
		// timestampSpan.textContent = new Date(fileContext.timestamp).toLocaleTimeString()
		// header.appendChild(timestampSpan)

		fileBlock.append(header)
		wrapperBlock.append(fileBlock)

		// NEW: Add a remove button instead of copy/insert
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

		this.manager._isProcessing = true
		this.manager._setButtonsDisabledState(true)

		try {
			// Step 1: Find the starting point of the actual conversation, skipping all initial file contexts.
			const firstConversationIndex = this.chatHistory.findIndex((msg) => msg.type !== "file_context")

			// If there's no conversation yet (e.g., only files have been added), we can't summarize.
			if (firstConversationIndex === -1) {
				console.info("No conversational messages found to summarize.")
				return // Exit gracefully. The 'finally' block will re-enable buttons.
			}

			// Step 2: Create a contiguous block of the entire conversation to date.
			// This block is guaranteed to start with a user/model message.
			const conversationBlock = this.chatHistory.slice(firstConversationIndex)

			// Step 3: From this block, get only the messages that are part of the dialogue (user/model).
			// This neatly filters out any UI-only 'system_message' entries that might be inside the block.
			const eligibleMessages = conversationBlock.filter((msg) => msg.type === "user" || msg.type === "model")

			// Step 4: Determine how many of the OLDEST eligible messages we should summarize.
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

			// Step 5: Identify the exact block in the original history that needs to be replaced.
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

			// Step 6: Perform the AI call using the original promise/callback structure.
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

			// Step 7: If we got a summary, replace the old history with the new summary.
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

				this.chatHistory.splice(spliceStartIndex, spliceCount, summaryMessage, systemMessage)

				this.render()
				this.manager._dispatchContextUpdate("summarize", {
					summaryDetails: { tokensBefore: tokensBeforeSummary, tokensAfter: tokensAfterSummary },
				})
			}
		} catch (error) {
			console.error("Error during summarization:", error)
			this.addMessage({
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
		let prunableHistory = [...this.chatHistory]
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
