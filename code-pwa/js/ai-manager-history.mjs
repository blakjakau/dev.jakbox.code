// js/ai-manager-history.mjs

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
		this.manager._resetProgressBar()
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

	loadHistory(history) {
		if (Array.isArray(history)) {
			this.chatHistory = history
			this.render()
		}
	}

	render() {
		if (!this.conversationArea) return
		this.conversationArea.innerHTML = "" // Clear existing UI
		this.chatHistory.forEach((message) => {
			if (message.type === "user") {
				const messageBlock = new Block()
				messageBlock.classList.add("prompt-pill")
				messageBlock.innerHTML = this.md.render(message.content)
				this.conversationArea.append(messageBlock)
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
		})
		this.conversationArea.scrollTop = this.conversationArea.scrollHeight
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

		const timestampSpan = document.createElement("span")
		timestampSpan.classList.add("timestamp")
		timestampSpan.textContent = new Date(fileContext.timestamp).toLocaleTimeString()
		header.appendChild(timestampSpan)

		fileBlock.append(header)
		wrapperBlock.append(fileBlock)

		const copyButton = new Button()
		copyButton.icon = "content_copy"
		copyButton.title = "Copy Content"
		copyButton.classList.add("context-file-action-button")
		copyButton.on("click", () => {
			navigator.clipboard.writeText(fileContext.content)
			copyButton.icon = "done"
			setTimeout(() => (copyButton.icon = "content_copy"), 1000)
		})

		const insertButton = new Button()
		insertButton.icon = "input"
		insertButton.title = "Insert into Editor"
		insertButton.classList.add("context-file-action-button")
		insertButton.on("click", () => {
			const event = new CustomEvent("insert-snippet", { detail: fileContext.content })
			window.dispatchEvent(event)
			insertButton.icon = "done"
			setTimeout(() => (insertButton.icon = "input"), 1000)
		})

		wrapperBlock.append(copyButton, insertButton)
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
