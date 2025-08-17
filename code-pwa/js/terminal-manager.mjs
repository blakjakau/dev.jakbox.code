import { Button, Icon } from "./elements.mjs";
import { loadScript, addStylesheet } from "./elements/utils.mjs";
import { TabBar } from "./elements/tabbar.mjs";
import { SettingsPanel } from "./elements/settings-panel.mjs";
import { TabItem } from "./elements/tabitem.mjs";
import conduitSetupGuide from './conduit-setup-guide.mjs';

// The URL for the backend WebSocket server
const TERMINAL_WEBSOCKET_URL = `ws://localhost:3022/terminal`;
const CONDUIT_RELEASE_TAG = "v0.0.11";
const CONDUIT_DOWNLOAD_PATH = `https://github.com/blakjakau/dev.jakbox.conduit/releases/download/${CONDUIT_RELEASE_TAG}`
const CONDUIT_UP_URL = `http://localhost:3022/up`;
const CONDUIT_INSTALL_URL = `http://localhost:3022/install-user`;
const CONDUIT_UNINSTALL_URL = `http://localhost:3022/uninstall`;
const CONDUIT_KILL_URL = `http://localhost:3022/kill`;
const CONDUIT_PROTOCOL_URL = 'conduit://';

class TerminalManager {
	constructor() {
		this._initialized = false;
		this.setupGuideElement = null;
		this.settingsPanel = null;
		this.settingsButton = null;
		this.conduitStatus = { isRunning: false, isInstalled: false, version: 'N/A' };
		this.config = { autoLaunch: true, keepAlive: false }; // Let's default to true, it's a better experience
		this.isPolling = false;
		this.keepAliveIntervalId = null;

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
		this._loadSettings();
		this._updateKeepAlive();

		this.panel = panel;
		this.panel.classList.add('terminal-panel-container'); // Add a class for specific styling if needed

		// Create TabBar for managing terminal sessions
		this.sessionTabBar = new TabBar();
		this.sessionTabBar.setAttribute("slim", "");
		this.sessionTabBar.classList.add("terminal-session-tabs");
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

		this.settingsButton = new Button("");
		this.settingsButton.icon = "settings";
		this.settingsButton.classList.add("settings-button");
		this.settingsButton.onclick = () => this.toggleSettingsPanel();
		this.sessionTabBar.append(newTerminalButton, this.settingsButton);

		// Wrapper for individual terminal instance containers
		this.terminalContainersWrapper = document.createElement("div");
		this.terminalContainersWrapper.classList.add("terminal-containers-wrapper");
		
		// NEW: Create elements for loading and empty states
		this._loadingStateElement = this._createLoadingStateElement();
		this._emptyStateElement = this._createEmptyStateElement();
		this.terminalContainersWrapper.append(this._loadingStateElement, this._emptyStateElement);

		this.settingsPanel = this._createSettingsPanel();

		// Append UI elements. The containing panel should use flexbox to manage layout.
		this.panel.append(this.terminalContainersWrapper, this.settingsPanel, this.sessionTabBar);

		// ResizeObserver to fit the *active* terminal when its container (this panel) resizes
		const resizeObserver = new ResizeObserver(() => this.fit());
		resizeObserver.observe(this.panel);
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
		// Hide the empty state message now that we have a session
		if (this._emptyStateElement) this._emptyStateElement.style.display = 'none';

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
			// If this was the last session, show the empty state message
			if (this._sessions.size === 0 && this.conduitStatus.isRunning) {
				this._emptyStateElement.style.display = 'flex';
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
		// 1. Show loading spinner state
		this._removeSetupGuide();
		this.settingsPanel.style.display = 'none';
		this._emptyStateElement.style.display = 'none';
		this.terminalContainersWrapper.style.display = 'block'; // Show parent wrapper
		this._sessions.forEach(session => session.containerElement.style.display = 'none'); // Hide instances
		this._loadingStateElement.style.display = 'flex';
		this.sessionTabBar.style.display = 'flex';
		// 2. Perform checks
		
		// Use a client-side flag to decide if we should attempt auto-launching.
		const clientThinksInstalled = localStorage.getItem('conduitInstalled') === 'true';

		// If not running, but auto-launch is on, try to start it.
		if (!this.conduitStatus.isRunning && this.config.autoLaunch && clientThinksInstalled) {
			await this._launchConduitViaProtocol();
			await this._checkConduitStatus(); // Check status again after the launch attempt.
		}
		// 3. Hide loading spinner
		this._loadingStateElement.style.display = 'none';
		// 4. Decide final UI state
		if (this.conduitStatus.isRunning) { // This now covers both installed and temporary runners
			if (this.conduitStatus.isInstalled) {
				this._removeSetupGuide();
				if (this._sessions.size === 0) {
					this._emptyStateElement.style.display = 'flex'; // Show empty state
				} else {
					// A session exists, ensure it's visible
					const activeSession = this._sessions.get(this._activeSessionId) || this._sessions.values().next().value;
					if (activeSession?.tabItem) activeSession.tabItem.click();
				}
			} else {
				this._showSetupGuide('install', { showLaunchButton: false });
			}
		} else {
			this._showSetupGuide('download', { showLaunchButton: true });
		}
	}

	/**
	 * Loads settings from localStorage.
	 */
	_loadSettings() {
		const storedAutoLaunch = localStorage.getItem('conduitAutoLaunch');
		// Only override the default if a value is explicitly stored.
		if (storedAutoLaunch !== null) {
			this.config.autoLaunch = storedAutoLaunch === 'true';
		}
		const storedKeepAlive = localStorage.getItem('conduitKeepAlive');
		if (storedKeepAlive !== null) {
			this.config.keepAlive = storedKeepAlive === 'true';
		}
	}

	/**
	 * Saves settings to localStorage.
	 */
	_saveSettings() {
		localStorage.setItem('conduitAutoLaunch', this.config.autoLaunch);
		localStorage.setItem('conduitKeepAlive', this.config.keepAlive);
		this._updateKeepAlive();
	}

	_updateKeepAlive() {
		if (this.keepAliveIntervalId) {
			clearInterval(this.keepAliveIntervalId);
			this.keepAliveIntervalId = null;
		}
		if (this.config.keepAlive) {
			this.keepAliveIntervalId = setInterval(async () => {
				// Only ping if the panel is visible and conduit is running.
				if (this.panel.offsetParent && this.conduitStatus.isRunning) {
					try {
						// Use a short timeout to prevent hanging requests
						await fetch(CONDUIT_UP_URL, { signal: AbortSignal.timeout(500) });
						console.debug('Conduit keep-alive ping sent.');
					} catch (e) {
						console.debug('Keep-alive ping failed, conduit might be down.');
					}
				}
			}, 10000); // every 60 seconds
		}
	}

	/**
	 * Checks if the Conduit backend service is running and updates internal status.
	 */
	async _checkConduitStatus() {
		// Reset status before check, but preserve version info if server goes down.
		this.conduitStatus.isRunning = false;
		// Do not reset isInstalled here; we want to preserve the last known state if the server is down.
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 200); // Short timeout
		try {
			const response = await fetch(CONDUIT_UP_URL, { signal: controller.signal });
			clearTimeout(timeoutId);

			if (response.ok) { // Server is up, get authoritative status.
				const data = await response.json();
				this.conduitStatus.isRunning = true;
				this.conduitStatus.isInstalled = data.is_installed || false;
				this.conduitStatus.version = data.version || 'N/A';
			} else { // Server is up but returned an error. Treat as not running.
				this.conduitStatus.isRunning = false;
			}
		} catch (error) {
			clearTimeout(timeoutId);
			this.conduitStatus.isRunning = false;
		}
	}

	/**
	 * Determines the correct Conduit download link based on user's platform.
	 * @returns {{primary: Array, other: Array}}
	 */
	_getDownloadLinks() {
		const ua = navigator.userAgent.toLowerCase();
		const platform = navigator.platform.toLowerCase();
		const isArm = ua.includes('aarch64') || ua.includes('arm64');

		const allDownloads = [
			{ name: 'macOS (Apple Silicon)', filename: 'conduit-macos-arm64', platformTest: p => p.includes('mac') },
			{ name: 'macOS (Intel)', filename: 'conduit-macos-x64', platformTest: p => p.includes('mac') },
			{ name: 'Windows (x64)', filename: 'conduit-windows-x64.exe', platformTest: p => p.includes('win') },
			{ name: 'Linux (x64)', filename: 'conduit-linux-x64', platformTest: p => p.includes('linux') && !isArm },
			{ name: 'Linux (ARM64)', filename: 'conduit-linux-arm64', platformTest: p => p.includes('linux') && isArm }
		].map(d => ({ ...d, url: `${CONDUIT_DOWNLOAD_PATH}/${d.filename}` }));

		const primary = allDownloads.filter(d => d.platformTest(platform));
		const primaryFilenames = new Set(primary.map(p => p.filename));
		const other = allDownloads.filter(d => !primaryFilenames.has(d.filename));

		return { primary, other };
	}

	_showSetupGuide(step = 'download', options = { showLaunchButton: false }) {
		if (!this.setupGuideElement) {
			this.setupGuideElement = document.createElement('div');
			this.setupGuideElement.className = 'conduit-setup-guide';
			this.panel.prepend(this.setupGuideElement);
		}

		const platform = navigator.platform.toLowerCase();

		this.sessionTabBar.style.display = 'none';
		this.terminalContainersWrapper.style.display = 'none';
		this.settingsPanel.style.display = 'none';
		this.setupGuideElement.style.display = 'block';
		this.setupGuideElement.innerHTML = ''; // Clear previous content

		const guideContent = document.createElement('div');
		// New logic to handle platform-specific instructions
		let finalGuideContent = conduitSetupGuide;
		let platformInstructions = '';
		if (step === 'download' && (platform.includes('mac') || platform.includes('linux'))) {
			const { primary } = this._getDownloadLinks();
			const primaryFilename = primary.length > 0 ? primary[0].filename : 'conduit-binary';
			platformInstructions = `
				<div class="platform-instructions">
					<p>On macOS and Linux, you may need to make the downloaded file executable. Open your terminal, navigate to the download directory, and run the following command:</p>
					<pre><code>chmod u+x ${primaryFilename}</code></pre>
					<p>Afterward, you can launch it for the first time by running:</p>
					<pre><code>./${primaryFilename}</code></pre>
				</div>
			`;
		}
		finalGuideContent = finalGuideContent.replace('{{PLATFORM_INSTRUCTIONS}}', platformInstructions);
		guideContent.innerHTML = finalGuideContent
			.replace(/^# (.*$)/gm, "<h2>$1</h2>")
			.replace(/^## (.*$)/gm, "<h3>$1</h3>")
			.replace(/\*\*(.*)\*\*/g, "<strong>$1</strong>")
			.replace(/`(.*?)`/g, "<code>$1</code>")
			.replace(/---/g, "<hr>");
		this.setupGuideElement.append(guideContent);
		
		const downloadContainer = this.setupGuideElement.querySelector('#conduit-download-section');
		const launchContainer = this.setupGuideElement.querySelector('#conduit-launch-section');

		if(downloadContainer) downloadContainer.innerHTML = '';
		if(launchContainer) launchContainer.innerHTML = '';

		if (step === 'download') {
			const { primary, other } = this._getDownloadLinks();

			if (primary.length > 0) {
				primary.forEach(info => {
					const link = document.createElement('a');
					link.href = info.url;
					link.textContent = `Download for ${info.name}`;
					link.className = 'themed';
					link.setAttribute('target', '_blank');
					link.setAttribute('download', info.filename);
					downloadContainer.append(link);
					downloadContainer.append(document.createElement("br"));
				});
			}
			
			downloadContainer.append(document.createElement("br"));
			downloadContainer.innerHTML = "<p>"+downloadContainer.innerHTML+"</p>"
			
			if (other.length > 0) {
				const details = document.createElement('details');
				details.className = 'other-platforms-details';
				const summary = document.createElement('summary');
				summary.textContent = 'Show other platforms';
				details.append(summary);
				const otherList = document.createElement('div');
				otherList.className = 'other-platforms-list';
				other.forEach(info => {
					const link = document.createElement('a');
					link.href = info.url;
					link.textContent = info.name;
					link.className = 'themed';
					link.setAttribute('target', '_blank');
					link.setAttribute('download', info.filename);
					otherList.append(link);
					otherList.append(document.createElement("br"));
				});
				details.append(otherList);
				downloadContainer.append(details);
			} else if (primary.length === 0) {
				downloadContainer.textContent = "Sorry, your platform is not currently supported.";
			}

			if (options.showLaunchButton) {
				const preamble = document.createElement('p');
				preamble.textContent = 'Already installed Conduit?';
				preamble.style.marginTop = '1.5em';
				preamble.style.marginBottom = '0.5em';

				const launchButton = new Button("Launch Conduit Helper");
				launchButton.classList.add('themed', 'launch-button');
				launchButton.onclick = () => {
					this._launchConduitViaProtocol();
					this._startPollingConduit();
				};
				launchContainer.append(preamble, launchButton);
			}

			this._startPollingConduit(); // Start polling in the background immediately
		} else if (step === 'install' && !options.showLaunchButton) {
			// This step only has one set of actions, so they'll go in the first container.
			const { primary } = this._getDownloadLinks();
			const primaryDownload = primary[0];
			const cliCommand = primaryDownload ? `\`./${primaryDownload.filename} --install-user\`` : 'the CLI';
			const preamble = document.createElement('p');
			preamble.innerHTML = `Excellent! The Conduit helper is running. For the best experience, click below to complete the one-time installation. This allows the app to launch the helper automatically.<br><br>You can also skip this and install later from the settings panel or by running ${cliCommand} in your terminal.`;
			preamble.style.marginBottom = '1em';

			const installButton = new Button("Install Conduit Helper");
			installButton.classList.add('themed');
			installButton.onclick = () => this._installConduit(installButton);

			const skipButton = new Button("Skip For Now");
			skipButton.onclick = async () => {
				this._removeSetupGuide();
				if (this._sessions.size === 0) {
					await this.createNewTerminalSession();
				}
			};

			const buttonGroup = document.createElement('div');
			buttonGroup.className = 'button-group';
			buttonGroup.append(installButton, skipButton);
			downloadContainer.append(preamble, buttonGroup);
		}
	}

	_removeSetupGuide() {
		if (this.setupGuideElement) {
			this.setupGuideElement.style.display = 'none';
		}
		this.sessionTabBar.style.display = 'flex';
		this.terminalContainersWrapper.style.display = 'block';
		this._stopPollingConduit();
	}

	_startPollingConduit() {
		if (this.isPolling) return;
		this.isPolling = true;
		
		this._pollingIntervalId = setInterval(async () => {
			// Stop if panel is hidden
			if (!this.panel.offsetParent) return this._stopPollingConduit();
			
			await this._checkConduitStatus();
			if (this.conduitStatus.isRunning) {
				this._stopPollingConduit();
				this.toggleSettingsPanel(false);
				
				// Now that it's running, re-run the full connection logic.
				this.connect();
			}
		}, 2000); // Poll every 2 seconds
	}

	_stopPollingConduit() {
		if (this._pollingIntervalId) {
			clearInterval(this._pollingIntervalId);
			this._pollingIntervalId = null;
		}
		this.isPolling = false;
	}

	async _installConduit(button) {
		button.textContent = 'Installing...';
		button.disabled = true;
		const downloadContainer = this.setupGuideElement.querySelector('#conduit-download-section');
		const actionsContainer = this.setupGuideElement?.querySelector('#conduit-actions-section');
		try {
			const response = await fetch(CONDUIT_INSTALL_URL);
			const outputText = await response.text();
			
			if (downloadContainer) { // Use the download container to show output
				let outputPre = actionsContainer.querySelector('.install-output');
				if (!outputPre) {
					outputPre = document.createElement('pre');
					outputPre.className = 'install-output';
					actionsContainer.append(outputPre);
				}
				outputPre.textContent = outputText;
			}
			if (!response.ok) {
				throw new Error(`Installation failed. Server responded with ${response.status}`);
			}
			
			button.textContent = 'Restarting Conduit...';
			localStorage.setItem('conduitInstalled', 'true'); // Set client-side flag
			this.config.autoLaunch = true;
			this._saveSettings();
			
			try { await fetch(CONDUIT_KILL_URL); } catch (e) { /* Expected */ }
			await this._launchConduitViaProtocol();
			button.textContent = 'Waiting for restart...';
			this._startPollingConduit(); // Polling will detect the new instance and call connect().

		} catch (error) {
			console.error("Conduit installation failed:", error);
			button.textContent = 'Installation Failed (Retry)';
			button.disabled = false;
		}
	}

	/**
	 * Launches the Conduit helper via its protocol URL using a temporary iframe.
	 * This is async and includes a delay to allow the OS to process the request.
	 */
	async _launchConduitViaProtocol() {
		const iframe = document.createElement('iframe');
		iframe.style.display = 'none';
		document.body.appendChild(iframe);
		iframe.src = CONDUIT_PROTOCOL_URL;
		// The iframe is removed after a short delay to ensure the protocol launch is triggered.
		// await new Promise(resolve => setTimeout(() => { iframe.remove(); resolve(); }, 500));
		iframe.addEventListener("loaded", ()=>{ 
			console.debug("conduit:// loaded via iframe")
			iframe.remove()
		})
	}

	async _uninstallConduit(button) {
		button.textContent = 'Uninstalling...';
		button.disabled = true;

		// Terminate all open terminal sessions before uninstalling
		for (const [sessionId, session] of this._sessions.entries()) {
			this.deleteTerminalSession(sessionId, session.tabItem);
		}

		try {
			const response = await fetch(CONDUIT_UNINSTALL_URL);
			if (!response.ok) throw new Error(`Server responded with ${response.status}`);
			
			localStorage.removeItem('conduitInstalled'); // Clear client-side flag
			this.conduitStatus.isInstalled = false; // Update local state immediately
			try { await fetch(CONDUIT_KILL_URL); } catch(e) { /* Expected to fail if server is already gone */ }
			
			alert("Conduit has been uninstalled and all terminal sessions have been closed.");
			this.toggleSettingsPanel(false); // Hide settings panel
			this._showSetupGuide('download', { showLaunchButton: true }); // Show setup guide again

		} catch (error) {
			console.error("Conduit uninstallation failed:", error);
			alert(`Uninstallation failed: ${error.message}`);
			button.textContent = 'Uninstall Conduit';
			button.disabled = false;
		}
	}

	_createSettingsPanel() {
		const panel = document.createElement("div")
		panel.className = "settings-panel-container" // Wrapper
		panel.style.display = 'none'; // Initially hidden

		const settingsContent = new SettingsPanel()
		panel.append(settingsContent)

		settingsContent.on("settings-saved", (e) => {
			this.config.autoLaunch = e.detail["conduit-auto-launch"]
			this.config.keepAlive = e.detail["conduit-keep-alive"];
			this._saveSettings()
			this.toggleSettingsPanel(false); // Close the settings panel after saving
		})

		settingsContent.on("install-conduit", (e) => this._installConduit(e.detail.element))
		settingsContent.on("uninstall-conduit", (e) => {
			if (
				confirm(
					"Are you sure you want to uninstall the Conduit helper? This will close all active terminal sessions and stop the helper process."
				)
			) {
				this._uninstallConduit(e.detail.element)
			}
		})

		return panel;
	}

	async _renderSettingsPanel() {
		await this._checkConduitStatus(); // Get latest status

		const schema = [
			{
				type: "info",
				content: `Conduit Status: <strong class="${this.conduitStatus.isRunning ? "success" : "error"}">${
					this.conduitStatus.isRunning ? "Running" : "Not Running"
				}</strong> (v${this.conduitStatus.version})`,
			},
			{ type: "checkbox", id: "conduit-auto-launch", label: "Auto-launch", text: "Automatically try to launch Conduit helper on startup" },
			{ type: "checkbox", id: "conduit-keep-alive", label: "Keep-alive", text: "Send periodic pings to prevent Conduit from closing" },
		]

		if (this.conduitStatus.isInstalled) {
			schema.push({
				type: "button",
				id: "uninstall-btn",
				label: "Uninstall",
				text: "Uninstall Conduit",
				className: "themed cancel",
				onClickEvent: "uninstall-conduit",
				help: "Remove the app and disable the protocol handler."
			})
		} else if (this.conduitStatus.isRunning) {
			schema.push({ type: "button", id: "install-btn", label: "Install Conduit", className: "themed", onClickEvent: "install-conduit" })
		}

		const values = {
			"conduit-auto-launch": this.config.autoLaunch,
			"conduit-keep-alive": this.config.keepAlive
		}

		const panelContent = this.settingsPanel.querySelector("ui-settings-panel")
		panelContent.render(schema, values)
	}
	_createLoadingStateElement() {
		const el = document.createElement('div');
		el.className = 'terminal-background-element';
		el.innerHTML = `
			<div class="spinner-container">
				<div class="loading-spinner"></div>
			</div>
			<div class="caption">Connecting to Conduit...</div>
		`;
		el.style.display = 'none';
		return el;
	}
	_createEmptyStateElement() {
		const el = document.createElement('div');
		el.className = 'terminal-background-element';
		el.innerHTML = `
			<ui-icon style="font-size: 48px; opacity: 0.5;">terminal</ui-icon>
			<div class="caption">Connected to Conduit<br/>Press Ctrl+N to create a new terminal session.</div>
		`;
		el.style.display = 'none';
		return el;
	}
	toggleSettingsPanel(forceState=undefined) {
		const isHidden = this.settingsPanel.style.display === 'none';
		if (isHidden && (forceState===true || forceState!==false)) {
			// Show settings
			this.terminalContainersWrapper.style.display = 'none';
			if (this.setupGuideElement) this.setupGuideElement.style.display = 'none'; // Hide setup guide if visible
			this._renderSettingsPanel(); // Populate with fresh data
			this.settingsPanel.style.display = 'flex';
		} else {
			// Hide settings
			this.settingsPanel.style.display = 'none';
			// Rerun the connection logic to determine if we should show the
			// terminal sessions or the setup guide.
			this.connect();
			// If we have sessions, ensure the active one is resized properly.
			if (this._sessions.size > 0) {
				this.fit();
			}
		}
	}
}

export default new TerminalManager();
