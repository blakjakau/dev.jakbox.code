// /code-pwa/js/conduit-client.mjs

/**
 * A client for interacting with the Conduit API (both REST and WebSocket).
 * This class manages connections, authentication, and API calls.
 * It also acts as a simple event emitter for WebSocket messages.
 * @example
 * import conduit from './conduit-client.mjs';
 * conduit.on('list', ({ path, data }) => console.log(`Files in ${path}:`, data));
 * conduit.on('notify', ({ path, data }) => console.log(`File change in ${path}:`, data));
 * conduit.connect();
 * conduit.wsList('.');
 * conduit.wsWatch('.');
 */
class ConduitClient {
    constructor() {
        this.host = 'localhost';
        this.port = 3022;
        this.apiKey = null;
        this.ws = null;
        this.isConnecting = false;
        this.isConnected = false;
        this.messageQueue = [];
        this.eventListeners = new Map();
        this.requestIdCounter = 0;
        this.pendingRequests = new Map(); // For tracking responses to specific requests
    }

    // --- Configuration ---
    configure({ host, port, apiKey }) {
        this.host = host || this.host;
        this.port = port || this.port;
        this.apiKey = apiKey || this.apiKey;
    }

    get baseUrl() {
        return `http://${this.host}:${this.port}`;
    }

    get wsUrl() {
        let url = `ws://${this.host}:${this.port}/files`;
        if (this.apiKey) {
            url += `?key=${this.apiKey}`;
        }
        return url;
    }

    // --- Event Emitter ---
    on(eventName, listener) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(listener);
    }

    off(eventName, listener) {
        if (!this.eventListeners.has(eventName)) return;
        const listeners = this.eventListeners.get(eventName);
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    emit(eventName, ...args) {
        if (!this.eventListeners.has(eventName)) return;
        this.eventListeners.get(eventName).forEach(listener => listener(...args));
    }

    // --- REST API Methods ---
    async list(path) {
        const url = new URL(`${this.baseUrl}/files`);
        url.searchParams.set('path', path);
        const headers = {};
        if (this.apiKey) headers['X-Conduit-Key'] = this.apiKey;

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.action !== 'list') throw new Error('Expected list action from server');
        return data;
    }

    async read(path) {
        const url = new URL(`${this.baseUrl}/files`);
        url.searchParams.set('path', path);
        const headers = {};
        if (this.apiKey) headers['X-Conduit-Key'] = this.apiKey;

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.action !== 'read') throw new Error('Expected read action from server');
        // Decode base64 content
        data.content = atob(data.data);
        return data;
    }

    async write(path, content) {
        const url = new URL(`${this.baseUrl}/files`);
        url.searchParams.set('path', path);
        const headers = {};
        if (this.apiKey) headers['X-Conduit-Key'] = this.apiKey;
        headers['Content-Type'] = 'application/octet-stream';

        const response = await fetch(url, { method: 'POST', headers, body: content });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.status === 201;
    }

    // --- WebSocket ---
    connect() {
        if (this.isConnected || this.isConnecting) return;

        this.isConnecting = true;
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => this._handleWsOpen();
        this.ws.onmessage = (event) => this._handleWsMessage(event);
        this.ws.onclose = () => this._handleWsClose();
        this.ws.onerror = (error) => this._handleWsError(error);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    _handleWsOpen() {
        console.log('[Conduit] WebSocket connected.');
        this.isConnecting = false;
        this.isConnected = true;
        this.emit('connect');

        // Send any queued messages
        this.messageQueue.forEach(msg => this.ws.send(JSON.stringify(msg)));
        this.messageQueue = [];
    }

    _handleWsMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.debug('[Conduit] Received:', message);

            if (message.requestId && this.pendingRequests.has(message.requestId)) {
                const { resolve, reject } = this.pendingRequests.get(message.requestId);
                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message);
                }
                this.pendingRequests.delete(message.requestId);
            }

            this.emit(message.action, message); // e.g., emit('list', { path, data, error })
            if (message.error) {
                this.emit('error', message);
            }
        } catch (e) {
            console.error('[Conduit] Error parsing message:', e);
            this.emit('error', { error: 'Invalid JSON message from server' });
        }
    }

    _handleWsClose() {
        console.warn('[Conduit] WebSocket disconnected.');
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        this.emit('disconnect');

        // Reject all pending requests
        this.pendingRequests.forEach(({ reject }) => reject(new Error('WebSocket disconnected')));
        this.pendingRequests.clear();
    }

    _handleWsError(error) {
        console.error('[Conduit] WebSocket error:', error);
        this.emit('error', { error: 'WebSocket connection error' });
        this._handleWsClose(); // Treat error as a close event
    }

    _send(payload) {
        return new Promise((resolve, reject) => {
            const requestId = ++this.requestIdCounter;
            const message = { ...payload, requestId };
            this.pendingRequests.set(requestId, { resolve, reject });

            const sender = () => {
                try {
                    console.debug('[Conduit] Sending:', message);
                    this.ws.send(JSON.stringify(message));
                } catch (e) {
                    reject(e);
                    this.pendingRequests.delete(requestId);
                }
            };

            if (this.isConnected) {
                sender();
            } else {
                const connectHandler = () => {
                    sender();
                    this.off('connect', connectHandler);
                    this.off('disconnect', disconnectHandler);
                };
                const disconnectHandler = () => {
                    reject(new Error('Failed to connect to WebSocket'));
                    this.off('connect', connectHandler);
                    this.off('disconnect', disconnectHandler);
                };
                this.on('connect', connectHandler);
                this.on('disconnect', disconnectHandler);
                if (!this.isConnecting) this.connect();
            }

            // Timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    reject(new Error(`Request ${requestId} timed out`));
                    this.pendingRequests.delete(requestId);
                }
            }, 10000); // 10 second timeout
        });
    }

    // --- WebSocket Actions (Promise-based) ---
    wsList(path) {
        return this._send({ action: 'list', path });
    }

    wsRead(path) {
        return this._send({ action: 'read', path });
    }

    wsWrite(path, base64Content) {
        return this._send({ action: 'write', path, content: base64Content });
    }

    // Watch is fire-and-forget, it just sends the command.
    wsWatch(path) {
        const message = { action: 'watch', path };
        if (this.isConnected) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.messageQueue.push(message);
            if (!this.isConnecting) this.connect();
        }
        return Promise.resolve();
    }
}

const conduitClient = new ConduitClient();
// For easy debugging from the console
window.conduit = conduitClient;

export default conduitClient;
