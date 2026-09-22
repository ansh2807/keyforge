import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";

export type SignedResponse<T> = {
  success: true;
  data: T;
  signedPayload: string;
  signature: string;
  keyId: string;
  algorithm: "Ed25519";
};

export type SessionData = {
  sessionToken: string;
  sessionId: string;
  sessionExpiresAt: string;
  serverTime: string;
  nonce: string;
  application: {
    id: string;
    name: string;
    version: string;
    downloadUrl: string | null;
    heartbeatSeconds: number;
  };
  license: {
    id: string;
    status: string;
    expiresAt: string | null;
    maxDevices: number;
    plan: string;
    entitlements: unknown;
  };
  activation: { id: string };
  user: {
    username: string;
    email?: string | null;
    subscriptions?: Array<{ plan: string; status: string; expiresAt: string | null }>;
  } | null;
};

export type RuntimeConfiguration = {
  nonce: string;
  serverTime: string;
  variables: Record<string, string>;
  variableMetadata: Array<{ key: string; visibility: string; updatedAt: string }>;
  builds: Array<{ version: string; platform: string; sha256: string; downloadUrl: string | null; updatedAt: string }>;
};

export type ManagedFile = {
  id: string;
  name: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  updatedAt: string;
  downloadPath: string;
};

export type ChatMessage = {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type ErrorResponse = {
  success: false;
  error: { code: string; message: string };
};

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export class KeyforgeError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "KeyforgeError";
  }
}

export class KeyforgeClient {
  private sessionToken: string | null = null;

  constructor(
    private readonly options: {
      baseUrl: string;
      appId: string;
      publicKeyPem: string;
      installationId: string;
      installationLabel?: string;
      clientVersion?: string;
      fetch?: typeof globalThis.fetch;
    },
  ) {}

  private nonce(): string {
    return randomBytes(24).toString("base64url");
  }

  private requireSession(): string {
    if (!this.sessionToken) throw new KeyforgeError("missing_session", "No client session is active.", 400);
    return this.sessionToken;
  }

  restoreSession(sessionToken: string): void {
    if (sessionToken.length < 30) throw new KeyforgeError("invalid_session", "The session token is malformed.", 400);
    this.sessionToken = sessionToken;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const expectedNonce = typeof body.nonce === "string" ? body.nonce : undefined;
    const fetcher = this.options.fetch || globalThis.fetch;
    const response = await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: this.options.appId, ...body }),
    });
    const result = (await response.json()) as SignedResponse<T> | ErrorResponse;
    if (!result.success) {
      throw new KeyforgeError(result.error.code, result.error.message, response.status);
    }
    if (result.algorithm !== "Ed25519") {
      throw new KeyforgeError("invalid_signature_algorithm", "The response algorithm is not supported.", 502);
    }
    const signedBytes = Buffer.from(result.signedPayload, "base64url");
    const valid = verify(
      null,
      signedBytes,
      createPublicKey(this.options.publicKeyPem),
      Buffer.from(result.signature, "base64url"),
    );
    if (!valid) throw new KeyforgeError("invalid_signature", "The server response signature is invalid.", 502);
    let signedData: unknown;
    try {
      signedData = JSON.parse(signedBytes.toString("utf8"));
    } catch {
      throw new KeyforgeError("invalid_signed_payload", "The signed response payload is invalid.", 502);
    }
    if (canonicalJson(signedData) !== canonicalJson(result.data)) {
      throw new KeyforgeError("signed_payload_mismatch", "The response data does not match its signed payload.", 502);
    }
    if (expectedNonce && (result.data as { nonce?: string }).nonce !== expectedNonce) {
      throw new KeyforgeError("nonce_mismatch", "The server response did not match this request.", 502);
    }
    return result.data;
  }

  async activate(licenseKey: string): Promise<SessionData> {
    const nonce = this.nonce();
    const data = await this.post<SessionData>("/api/v1/client/activate", {
      licenseKey,
      installationId: this.options.installationId,
      installationLabel: this.options.installationLabel,
      clientVersion: this.options.clientVersion,
      nonce,
    });
    this.sessionToken = data.sessionToken;
    return data;
  }

  async register(input: { licenseKey: string; username: string; email?: string; password: string }): Promise<SessionData> {
    const nonce = this.nonce();
    const data = await this.post<SessionData>("/api/v1/client/register", {
      ...input,
      installationId: this.options.installationId,
      installationLabel: this.options.installationLabel,
      clientVersion: this.options.clientVersion,
      nonce,
    });
    this.sessionToken = data.sessionToken;
    return data;
  }

  async login(username: string, password: string, totp?: string): Promise<SessionData> {
    const nonce = this.nonce();
    const data = await this.post<SessionData>("/api/v1/client/login", {
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

  async validate(): Promise<SessionData> {
    this.requireSession();
    const nonce = this.nonce();
    return this.post<SessionData>("/api/v1/client/validate", { sessionToken: this.sessionToken, nonce });
  }

  async heartbeat(): Promise<SessionData> {
    this.requireSession();
    const nonce = this.nonce();
    return this.post<SessionData>("/api/v1/client/heartbeat", { sessionToken: this.sessionToken, nonce });
  }

  async configuration(): Promise<RuntimeConfiguration> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    return this.post<RuntimeConfiguration>("/api/v1/client/config", { sessionToken, nonce });
  }

  async callFunction<TResponse = unknown>(name: string, input?: unknown): Promise<TResponse> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    const data = await this.post<{ response: TResponse }>(`/api/v1/client/functions/${encodeURIComponent(name)}`, { sessionToken, nonce, input });
    return data.response;
  }

  async files(): Promise<ManagedFile[]> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    const data = await this.post<{ files: ManagedFile[] }>("/api/v1/client/files", { sessionToken, nonce });
    return data.files;
  }

  async downloadFile(file: ManagedFile): Promise<Uint8Array> {
    const sessionToken = this.requireSession();
    const fetcher = this.options.fetch || globalThis.fetch;
    const response = await fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${file.downloadPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: this.options.appId, sessionToken, nonce: this.nonce() }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as ErrorResponse | null;
      throw new KeyforgeError(error?.error.code || "download_failed", error?.error.message || "The protected file download failed.", response.status);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== file.sha256.toLowerCase()) throw new KeyforgeError("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502);
    return bytes;
  }

  async getUserVariable(key: string): Promise<string | null> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    const data = await this.post<{ value: string | null }>("/api/v1/client/user-variables", { sessionToken, nonce, key });
    return data.value;
  }

  async setUserVariable(key: string, value: string): Promise<string> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    const data = await this.post<{ value: string }>("/api/v1/client/user-variables", { sessionToken, nonce, key, value });
    return data.value;
  }

  async chat(channel: string, options: { message?: string; after?: string } = {}): Promise<ChatMessage[]> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    const data = await this.post<{ messages: ChatMessage[] }>("/api/v1/client/chat", { sessionToken, nonce, channel, ...options });
    return data.messages;
  }

  async beginTotp(): Promise<{ uri: string; secret: string }> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    return this.post<{ uri: string; secret: string }>("/api/v1/client/totp/begin", { sessionToken, nonce });
  }

  async confirmTotp(token: string): Promise<void> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    await this.post("/api/v1/client/totp/confirm", { sessionToken, nonce, token });
  }

  async customerPortalUrl(): Promise<{ url: string; expiresAt: string }> {
    const sessionToken = this.requireSession();
    const nonce = this.nonce();
    return this.post<{ url: string; expiresAt: string }>("/api/v1/client/login-token", { sessionToken, nonce });
  }

  async deactivate(): Promise<void> {
    if (!this.sessionToken) return;
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
