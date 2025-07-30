import { Button, Icon } from "./elements.mjs";
import { loadScript, addStylesheet, isFunction } from "./elements/utils.mjs";
import { TabBar } from "./elements/tabbar.mjs";
import { TabItem } from "./elements/tabitem.mjs";

// The URL for the backend WebSocket server
const TERMINAL_WEBSOCKET_URL = `ws://${window.location.hostname}:3022/terminal`;

class TerminalManager {
	constructor() {
		this._initialized = false;
		this._sessions = new Map(); // Map: sessionId -> { term, fitAddon, ws, containerElement, tabItem }
		this._activeSessionId = null;
		this._nextSessionId = 1; // Simple counter for session IDs

		this.panel = null; // Reference to the SidebarPanel that hosts this manager's UI
	}

    /**
     * Initializes the TerminalManager and creates its UI within the provided panel.
     * This method is called once when the UI is created.
     * @param {HTMLElement} panel - The SidebarPanel instance that will host the terminal UI.
     */
	async init(panel) {
		this.panel = panel;
		this.panel.classList.add('terminal-panel-container'); // Add a class for specific styling if needed

		// Create TabBar for managing terminal sessions
		this.sessionTabBar = new TabBar();
		this.sessionTabBar.setAttribute("slim", "");
		this.sessionTabBar.classList.add("tabs-inverted");
		this.sessionTabBar.exclusiveDropType = "terminal-tab";
		this.sessionTabBar.click = (e) => this.switchTerminalSession(e.tab.config.id);
		this.sessionTabBar.close = (e) => this.deleteTerminalSession(e.tab.config.id, e.tab);

		// Button to create a new terminal session
		const newTerminalButton = new Button(""); // No text
		newTerminalButton.icon = "add_circle";
		newTerminalButton.classList.add("new-terminal-button");
		newTerminalButton.onclick = () => this.createNewTerminalSession();
		newTerminalButton.showClose = false; // Hide close button for 'New Terminal' button
		this.sessionTabBar.append(newTerminalButton);

		// Wrapper for individual terminal instance containers
		this.terminalContainersWrapper = document.createElement("div");
		this.terminalContainersWrapper.classList.add("terminal-containers-wrapper");
  
        // Append order changed: content wrapper first, then tab bar at the bottom
        this.panel.append(this.terminalContainersWrapper, this.sessionTabBar);
  
  		// ResizeObserver to fit the *active* terminal when its container (this panel) resizes
		const resizeObserver = new ResizeObserver(() => this.fit());
		resizeObserver.observe(this.panel); // Observe the hosting panel
	}

	/**
	 * Loads xterm.js scripts/styles (only once) and creates a new xterm.js instance.
	 * @param {HTMLElement} containerElement - The DOM element to open the terminal in.
	 * @returns {Promise<{term: Terminal, fitAddon: FitAddon}|null>} Object with xterm instance and fit addon, or null if loading fails.
	 */
	async _createTerminalInstance(containerElement) {
		// Load xterm.js and addons from CDN only once
		if (!this._initialized) {
			try {
				await addStylesheet("https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css");
				await loadScript("https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js");
				await loadScript("https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js");
				await loadScript("https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.8.0/lib/xterm-addon-web-links.min.js"); // Load WebLinksAddon
				this._initialized = true; // Mark scripts loaded
			} catch (error) {
				this.panel.textContent = "Error loading terminal scripts."; // Display error on the panel
				console.error(error);
				return null; // Return null if script loading fails
			}
		}

		// Create a new xterm.js instance
		const term = new window.Terminal({
			cursorBlink: true,
			fontFamily: "monospace",
			fontSize: 13,
			cursorStyle: 'bar', // Set cursor style to thin bar
			theme: {
				background: '#1e1e1e',
				foreground: '#d4d4d4',
				selectionBackground: '#5c5c5c',
			},
		});

		// Load the fit addon for this specific terminal instance
		const fitAddon = new window.FitAddon.FitAddon();
		term.loadAddon(fitAddon);

		// Load the weblinks addon for this specific terminal instance
		const webLinksAddon = new window.WebLinksAddon.WebLinksAddon();
		term.loadAddon(webLinksAddon);
		// Open the terminal in the provided container
		term.open(containerElement);

		return { term, fitAddon };
	}

	/**
	 * Establishes a WebSocket connection for a given xterm.js instance and sets up event listeners.
	 * @param {string} sessionId - The ID of the session this WebSocket belongs to.
	 * @param {Terminal} term - The xterm.js instance to connect.
	 * @returns {WebSocket} The established WebSocket instance.
	 */
	_connectWebSocket(sessionId, term) {
		const ws = new WebSocket(TERMINAL_WEBSOCKET_URL);
		ws.onopen = () => {
			term.clear();
			term.writeln(`Connected to terminal session: ${sessionId}\r\n`);
			this.fit(); // Fit immediately after connection is established
		};
		ws.onmessage = (event) => {
			// Write data received from the server (PTY) to the terminal
			const CWD_UPDATE_REGEX = /\x1b]9;9;([^\x1b]*)\x1b\\/g; // OSC 9;9;path followed by String Terminator (ST)
			let messageHandled = false;
			let rawData = event.data;
			// First, try to parse as a JSON control message (like "terminalInfo")
			try {
				const msg = JSON.parse(rawData);
				if (msg.type === "terminalInfo") {
					const session = this._sessions.get(sessionId);
					if (session) {
						session.hostname = msg.hostname;
						session.cwd = msg.cwd;
						this._updateTerminalTabName(sessionId);
					}
					messageHandled = true;
				}
			} catch (e) {
				// Not a JSON message, or parse error. Treat as raw terminal data.
			}
			// If not a JSON control message, check for CWD update escape sequence
			let match;
			while ((match = CWD_UPDATE_REGEX.exec(rawData)) !== null) {
				const newCwd = match[1];
				const session = this._sessions.get(sessionId);
				if (session) {
					session.cwd = newCwd;
					this._updateTerminalTabName(sessionId);
				}
				// Remove the escape sequence from the data written to xterm.js
				rawData = rawData.replace(match[0], '');
			}

			if (!messageHandled) {
				term.write(rawData); // Write the (potentially modified) raw data to the terminal
			}
		};
		ws.onerror = (error) => {
			console.error(`WebSocket Error for session ${sessionId}:`, error);
			term.writeln(`\r\n\n[Connection Error for session ${sessionId}: Could not connect to terminal server or connection lost.]\r\n[Please ensure the Node.js backend server is running on ws://${window.location.hostname}:3001/terminal]\r\n`);
			const session = this._sessions.get(sessionId);
			if (session && session.ws === ws) {
				this.deleteTerminalSession(sessionId, session.tabItem);
			}
		};

		ws.onclose = () => {
			const session = this._sessions.get(sessionId);
			if (session && session.ws === ws) {
				console.log(`WebSocket closed for session ${sessionId}.`);
				if(session.term) term.writeln("\r\n\n[Disconnected from terminal server.]\r\n");
				this.deleteTerminalSession(sessionId, session.tabItem);
			}
		};
		// Relay data typed into xterm.js to the WebSocket (to the PTY)
		term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "data", content: data }));
			}
		});
		// Handle terminal resize events and send new dimensions to the PTY
		term.onResize(({ cols, rows }) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "resize", cols, rows }));
			}
		});
		return ws;
	}

	/**
	 * Helper to clean up a specific session's associated resources (WebSocket, xterm.js instance).
	 * Does NOT remove DOM elements or tab items, as those are handled by deleteTerminalSession.
	 * @param {string} sessionId - The ID of the session to disconnect.
	 */
	_disconnectSession(sessionId) {
		const session = this._sessions.get(sessionId);
		if (session) {
			if (session.ws) {
                // Remove handlers to prevent re-entrant calls when we manually close the socket.
                session.ws.onclose = null;
                session.ws.onerror = null;
                if (session.ws.readyState === WebSocket.OPEN) {
				    session.ws.close();
                }
			}
			if (session.term) {
				session.term.dispose(); // Dispose the xterm.js instance
			}
		}
	}

	/**
	 * Creates a new terminal session, including a new tab, xterm.js instance, and WebSocket connection.
	 */
	async createNewTerminalSession() {
		// Ensure xterm.js scripts are loaded globally first
		if (!this._initialized) {
			// Attempt to load scripts by creating a dummy instance if needed
			await this._createTerminalInstance(document.createElement("div"));
			if (!this._initialized) {
				console.error("Failed to load xterm.js scripts. Cannot create new terminal session.");
				return;
			}
		}
		const sessionId = `term-${this._nextSessionId++}`;
		const sessionName = `Terminal ${this._nextSessionId - 1}`;
		// Create a dedicated container for this new terminal instance
		const terminalContainer = document.createElement("div");
		terminalContainer.classList.add("terminal-instance-container");
		terminalContainer.style.display = "none"; // Initially hidden
		this.terminalContainersWrapper.append(terminalContainer);
		// Create the xterm.js instance and its fit addon
		const { term, fitAddon } = await this._createTerminalInstance(terminalContainer);
		if (!term) {
			terminalContainer.remove(); // Clean up if terminal creation failed
			return;
		}
		// Establish WebSocket connection for this terminal
		const ws = this._connectWebSocket(sessionId, term);
		// Create a new tab item for this session
		const tab = this.sessionTabBar.add({ name: sessionName, id: sessionId });
		tab.config.id = sessionId; // Ensure config has the session ID
		// Store all relevant data for this new session
		const sessionData = {
			term,
			fitAddon,
			ws,
			containerElement: terminalContainer,
			tabItem: tab,
		};
		this._sessions.set(sessionId, sessionData);
		sessionData.tabItem.click(); // Activate the tab which triggers switchTerminalSession
		sessionData.term.focus(); // Focus the new terminal for immediate typing after tab activation
	}

	/**
	 * Switches the active terminal session. Hides all other terminal containers and shows the selected one.
	 * @param {string} sessionId - The ID of the terminal session to switch to.
	 */
	switchTerminalSession(sessionId) {
		if (this._activeSessionId === sessionId) {
			// If already active, ensure it's visible and fitted, then return
			if (this._sessions.has(sessionId)) {
				const session = this._sessions.get(sessionId);
				if (session.containerElement.style.display === "none") {
					session.containerElement.style.display = "block"; // Only make content visible
				}
				this.fit();
				session.term.focus(); // Focus the terminal
			}
			return;
		}
		this._sessions.forEach((session) => {
			session.containerElement.style.display = "none";
		});
		// Show the selected terminal container and update active session
		const newSession = this._sessions.get(sessionId);
		if (newSession) {
			newSession.containerElement.style.display = "block";
			this._activeSessionId = sessionId; // Update internal active session ID
			this.fit(); // Fit the newly visible terminal (before focusing)
		} else {
			console.warn(`Attempted to switch to non-existent session: ${sessionId}`);
			this._activeSessionId = null; // Clear active session if not found
		}
	}

	/**
	 * Deletes a terminal session, closing its WebSocket, disposing the xterm.js instance,
	 * and removing its associated DOM elements and tab.
	 * @param {string} sessionId - The ID of the session to delete.
	 * @param {TabItem} tab - The TabItem associated with the session.
	 */
	deleteTerminalSession(sessionId, tab) {
		const session = this._sessions.get(sessionId);
		if (session) {
			this._disconnectSession(sessionId); // Close WebSocket and dispose xterm.js
			session.containerElement.remove(); // Remove its dedicated DOM container
			this._sessions.delete(sessionId); // Remove from our internal map

			if (tab) {
				this.sessionTabBar.remove(tab); // Remove its tab from the TabBar
			}

			// If the deleted session was the active one, switch to another session
			if (this._activeSessionId === sessionId) {
				// The TabBar's remove method should handle activating the next tab,
				// which will then call switchTerminalSession and set the new active ID.
				// We just need to clear the old one here.
				this._activeSessionId = null;
			}
		} else {
			console.warn(`Attempted to delete non-existent session: ${sessionId}`);
		}
	}

	/**
	 * Fits the currently active xterm.js terminal to its container.
	 * Should be called when the container size changes or visibility changes.
	 */
	fit() {
		if (this._activeSessionId && this._sessions.has(this._activeSessionId)) {
			const activeSession = this._sessions.get(this._activeSessionId);
			// Only attempt to fit if the terminal instance and fit addon exist,
			// and its container is actually rendered (has an offsetParent).
			if (activeSession.term && activeSession.fitAddon && activeSession.containerElement.offsetParent !== null) {
				activeSession.fitAddon.fit();
			}
		}
	}

	/**
	 * Updates the name of a terminal tab based on the session's hostname and CWD.
	 * @param {string} sessionId - The ID of the session whose tab name needs updating.
	 */
	_updateTerminalTabName(sessionId) {
		const session = this._sessions.get(sessionId);
		if (session && session.tabItem) {
			let tabDisplayName = `Terminal ${sessionId.split('-')[1]}`; // Default name
			let fullPathTooltip = '';

			if (session.hostname && session.cwd) {
				const pathSegments = session.cwd.split(/[\\/]/).filter(s => s !== ''); // Split by / or \ and remove empty
				if (pathSegments.length > 2) {
					tabDisplayName = `(${session.hostname}): .../${pathSegments[pathSegments.length - 2]}/${pathSegments[pathSegments.length - 1]}`;
				} else {
					tabDisplayName = `(${session.hostname}):${session.cwd}`;
				}
				fullPathTooltip = `(${session.hostname}):${session.cwd}`;
			}
			// Update the tab item's display name
			session.tabItem.name = tabDisplayName;
			session.tabItem.setAttribute('title', fullPathTooltip); // Add full path as a title attribute (tooltip)
		}
	}

	/**
	 * Initializes the terminal panel. If no sessions exist, it creates the first one.
	 * If sessions exist, it ensures the currently active one is displayed and fitted.
	 * This method is intended to be called when the terminal sidebar panel becomes active.
	 */
	async connect() {
		if (this._sessions.size === 0) {
			// If no terminal sessions exist yet, create the very first one
			await this.createNewTerminalSession();
		} else {
			// If sessions already exist, just ensure the currently selected one is visible and fitted
			let targetSession = this._sessions.get(this._activeSessionId);
			if (!targetSession && this._sessions.size > 0) {
				// Fallback if _activeSessionId is null or invalid (e.g., after refresh, not persisted)
				targetSession = this._sessions.values().next().value; // Get the first session
				this._activeSessionId = targetSession.tabItem.config.id; // Update active ID
			}

			if (targetSession && targetSession.tabItem) {
				// Click the tab, which will trigger switchTerminalSession via TabBar's click handler
				targetSession.tabItem.click();
			} else {
				console.warn("TerminalManager: No valid session to activate.");
				// Fallback: If no sessions could be found/activated, ensure one is created
				await this.createNewTerminalSession();
			}
		}
	}
}

export default new TerminalManager();
