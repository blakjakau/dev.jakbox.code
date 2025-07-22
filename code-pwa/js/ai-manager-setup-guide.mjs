export default `
# Welcome to AI Integration!

**To get started, please configure an AI provider in the settings panel.**

---

## Getting Setup

### Gemini AI Integration (Google)

1.  **Get Your Gemini API Key:**
    *   Visit [aistudio.google.com](https://aistudio.google.com/).
    *   Sign in, then create or copy an API key. **Keep it secure!**
2.  **Configure Gemini in the AI Panel:**
    *   Open the AI Panel (AI icon in sidebar, or \`Alt+A\` / \`Option+A\`).
    *   Click the **Settings** (gear) icon.
    *   Select **Gemini** from the "AI Provider" dropdown.
    *   Paste your API key into the "Gemini API Key" field.
    *   Choose your desired Gemini model (e.g., Gemini Flash for speed, Gemini Pro for power).
    *   Click **Save Settings**.

### Ollama AI Integration (Local models)

1.  **Download and Setup Ollama:**
    *   Visit [ollama.com](https://ollama.com/).
    *   Download and install Ollama for your operating system.
    *   **Pull a Model:** Open your terminal and run \`ollama pull <model_name>\` (e.g., \`ollama pull codegemma:7b\`). See available models at [ollama.com/library](https://ollama.com/library).
2.  **Configure Ollama in the AI Panel:**
    *   Open the AI Panel (AI icon in sidebar, or \`Alt+A\` / \`Option+A\`).
    *   Click the **Settings** (gear) icon.
    *   Select **Ollama** from the "AI Provider" dropdown.
    *   Ensure the "Ollama Server" address is correct (default is \`http://localhost:11434\`).
    *   Choose the Ollama model you downloaded (e.g., \`codegemma:7b\`).
    *   Click **Save Settings**.

---

## Using the AI Panel

Once set up, use the AI panel for your coding needs:

*   **Prompting:** Type your questions or instructions in the text area at the bottom. Press **Enter** to send. Use **Shift+Enter** for new lines.
*   **Including Code/Files:**
    *   Type \`@code\` or \`@current\` to include the code from your active editor pane (file content or selection).
    *   Type \`@open\` to include all currently open files.
    *   *(These tags are processed and appear as separate context items in your chat history).*
*   **History & Context Management:**
    *   Your conversation history appears above the prompt area.
    *   A **progress bar** indicates context window usage. It will change color (yellow, orange, red) as the limit is approached.
    *   The AI can **automatically summarize** older conversation parts to stay within the context limit. You can also manually trigger summarization using the **Summarize** button (compress icon).
    *   **Delete prompts** (and their corresponding AI responses) using the trash icon next to your prompt in the history.
*   **Clearing:** Click **Clear** to reset the AI's memory and start a fresh conversation.

You're all set! Start chatting with AI for coding help, explanations, and more.
`;
