import { SidebarPanel } from './sidebar-panel.mjs';
import { loadScript, addStylesheet } from './utils.mjs';

// The URL for the backend WebSocket server
const TERMINAL_WEBSOCKET_URL = `ws://${window.location.hostname}:3001/terminal`;

export class TerminalPanel extends SidebarPanel {
    constructor() {
        super();
        this.classList.add('terminal-panel');
        this._initialized = false;
        this._connected = false;
        this._term = null;
        this._ws = null;
        this._fitAddon = null;
    }

    async _initializeTerminal() {
        if (this._initialized) return;

        // Load xterm.js and addons from CDN
        try {
            await addStylesheet('https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css'); // Load xterm.js CSS
            await loadScript('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js');
            await loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js');

        } catch (error) {
            this.textContent = 'Error loading terminal scripts.';
            console.error(error);
            return;
        }
        
        // Create an xterm.js instance
        this._term = new window.Terminal({
            cursorBlink: true,
            fontFamily: "roboto mono, monospace",
            fontSize: 13,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
            }
        });
        
        // Load the fit addon
        this._fitAddon = new window.FitAddon.FitAddon();
        this._term.loadAddon(this._fitAddon);

        // Create a container for the terminal and open it
        const terminalContainer = document.createElement('div');
        terminalContainer.style.width = '100%';
        terminalContainer.style.height = '100%';
        this.append(terminalContainer);
        this._term.open(terminalContainer);
        
        // Relay data from xterm.js to the WebSocket
        this._term.onData(data => {
            if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                this._ws.send(JSON.stringify({ type: 'data', content: data }));
            }
        });

        // Handle resize events
        this._term.onResize(({ cols, rows }) => {
            if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                this._ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        });
        
        // Use ResizeObserver to fit terminal on container resize
        const resizeObserver = new ResizeObserver(() => this.fit());
        resizeObserver.observe(this);

        this._initialized = true;
    }

    async connect() {
        if (this._connected || this.active === false) return;
        await this._initializeTerminal();
        if (!this._term) return; // Initialization failed

        this._term.writeln('Connecting to terminal server...');

        this._ws = new WebSocket(TERMINAL_WEBSOCKET_URL);

        this._ws.onopen = () => {
            this._connected = true;
            this._term.clear();
            this.fit(); // Fit after connection is established
        };

        this._ws.onmessage = (event) => {
            // Write data from server to the terminal
            this._term.write(event.data);
        };

        this._ws.onerror = (error) => {
            this._connected = false;
             console.error('WebSocket Error:', error);
            if (this._term) {
                this._term.writeln(`\r\n\n[Connection Error: Could not connect to terminal server or connection lost.]\r\n[Please ensure the Node.js backend server is running on ws://${window.location.hostname}:3001/terminal]\r\n`);
            }
            this._ws.close();
        };
        
        // Handle WebSocket closure
        this._ws.onclose = () => {
            this._connected = false;
            if (this._term && this._ws?.readyState !== WebSocket.OPEN) { // Only write if not already actively connected
                 this._term.writeln('\r\n\n[Disconnected from terminal server.]\r\n');
            }
            this._ws = null;
        };
    }
    // Fit the terminal to its container
    fit() {
        if (this._term && this._fitAddon) {
            this._fitAddon.fit();
        }
    }
}
customElements.define('ui-terminal-panel', TerminalPanel);