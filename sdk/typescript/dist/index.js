import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
function sortJson(value) {
    if (Array.isArray(value))
        return value.map(sortJson);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, nested]) => [key, sortJson(nested)]));
    }
    return value;
}
function canonicalJson(value) {
    return JSON.stringify(sortJson(value));
}
export class KeyforgeError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "KeyforgeError";
    }
}
export class KeyforgeClient {
    options;
    sessionToken = null;
    constructor(options) {
        this.options = options;
    }
    nonce() {
        return randomBytes(24).toString("base64url");
    }
    requireSession() {
        if (!this.sessionToken)
            throw new KeyforgeError("missing_session", "No client session is active.", 400);
        return this.sessionToken;
    }
    restoreSession(sessionToken) {
        if (sessionToken.length < 30)
            throw new KeyforgeError("invalid_session", "The session token is malformed.", 400);
        this.sessionToken = sessionToken;
    }
    async post(path, body) {
        const expectedNonce = typeof body.nonce === "string" ? body.nonce : undefined;
        const fetcher = this.options.fetch || globalThis.fetch;
        const response = await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appId: this.options.appId, ...body }),
        });
        const result = (await response.json());
        if (!result.success) {
            throw new KeyforgeError(result.error.code, result.error.message, response.status);
        }
        if (result.algorithm !== "Ed25519") {
            throw new KeyforgeError("invalid_signature_algorithm", "The response algorithm is not supported.", 502);
        }
        const signedBytes = Buffer.from(result.signedPayload, "base64url");
        const valid = verify(null, signedBytes, createPublicKey(this.options.publicKeyPem), Buffer.from(result.signature, "base64url"));
        if (!valid)
            throw new KeyforgeError("invalid_signature", "The server response signature is invalid.", 502);
        let signedData;
        try {
            signedData = JSON.parse(signedBytes.toString("utf8"));
        }
        catch {
            throw new KeyforgeError("invalid_signed_payload", "The signed response payload is invalid.", 502);
        }
        if (canonicalJson(signedData) !== canonicalJson(result.data)) {
            throw new KeyforgeError("signed_payload_mismatch", "The response data does not match its signed payload.", 502);
        }
        if (expectedNonce && result.data.nonce !== expectedNonce) {
            throw new KeyforgeError("nonce_mismatch", "The server response did not match this request.", 502);
        }
        return result.data;
    }
    async activate(licenseKey) {
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/activate", {
            licenseKey,
            installationId: this.options.installationId,
            installationLabel: this.options.installationLabel,
            clientVersion: this.options.clientVersion,
            nonce,
        });
        this.sessionToken = data.sessionToken;
        return data;
    }
    async register(input) {
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/register", {
            ...input,
            installationId: this.options.installationId,
            installationLabel: this.options.installationLabel,
            clientVersion: this.options.clientVersion,
            nonce,
        });
        this.sessionToken = data.sessionToken;
        return data;
    }
    async login(username, password, totp) {
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/login", {
            username,
            password,
            totp,
            installationId: this.options.installationId,
            installationLabel: this.options.installationLabel,
            clientVersion: this.options.clientVersion,
            nonce,
        });
        this.sessionToken = data.sessionToken;
        return data;
    }
    async validate() {
        this.requireSession();
        const nonce = this.nonce();
        return this.post("/api/v1/client/validate", { sessionToken: this.sessionToken, nonce });
    }
    async heartbeat() {
        this.requireSession();
        const nonce = this.nonce();
        return this.post("/api/v1/client/heartbeat", { sessionToken: this.sessionToken, nonce });
    }
    async configuration() {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        return this.post("/api/v1/client/config", { sessionToken, nonce });
    }
    async callFunction(name, input) {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        const data = await this.post(`/api/v1/client/functions/${encodeURIComponent(name)}`, { sessionToken, nonce, input });
        return data.response;
    }
    async files() {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/files", { sessionToken, nonce });
        return data.files;
    }
    async downloadFile(file) {
        const sessionToken = this.requireSession();
        const fetcher = this.options.fetch || globalThis.fetch;
        const response = await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${file.downloadPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appId: this.options.appId, sessionToken, nonce: this.nonce() }),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => null);
            throw new KeyforgeError(error?.error.code || "download_failed", error?.error.message || "The protected file download failed.", response.status);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== file.sha256.toLowerCase())
            throw new KeyforgeError("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502);
        return bytes;
    }
    async getUserVariable(key) {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/user-variables", { sessionToken, nonce, key });
        return data.value;
    }
    async setUserVariable(key, value) {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/user-variables", { sessionToken, nonce, key, value });
        return data.value;
    }
    async chat(channel, options = {}) {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        const data = await this.post("/api/v1/client/chat", { sessionToken, nonce, channel, ...options });
        return data.messages;
    }
    async beginTotp() {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        return this.post("/api/v1/client/totp/begin", { sessionToken, nonce });
    }
    async confirmTotp(token) {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        await this.post("/api/v1/client/totp/confirm", { sessionToken, nonce, token });
    }
    async customerPortalUrl() {
        const sessionToken = this.requireSession();
        const nonce = this.nonce();
        return this.post("/api/v1/client/login-token", { sessionToken, nonce });
    }
    async deactivate() {
        if (!this.sessionToken)
            return;
        const token = this.sessionToken;
        this.sessionToken = null;
        const fetcher = this.options.fetch || globalThis.fetch;
        await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}/api/v1/client/deactivate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appId: this.options.appId, sessionToken: token }),
        });
    }
}
