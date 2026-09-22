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
    activation: {
        id: string;
    };
    user: {
        username: string;
        email?: string | null;
        subscriptions?: Array<{
            plan: string;
            status: string;
            expiresAt: string | null;
        }>;
    } | null;
};
export type RuntimeConfiguration = {
    nonce: string;
    serverTime: string;
    variables: Record<string, string>;
    variableMetadata: Array<{
        key: string;
        visibility: string;
        updatedAt: string;
    }>;
    builds: Array<{
        version: string;
        platform: string;
        sha256: string;
        downloadUrl: string | null;
        updatedAt: string;
    }>;
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
export declare class KeyforgeError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number);
}
export declare class KeyforgeClient {
    private readonly options;
    private sessionToken;
    constructor(options: {
        baseUrl: string;
        appId: string;
        publicKeyPem: string;
        installationId: string;
        installationLabel?: string;
        clientVersion?: string;
        fetch?: typeof globalThis.fetch;
    });
    private nonce;
    private requireSession;
    restoreSession(sessionToken: string): void;
    private post;
    activate(licenseKey: string): Promise<SessionData>;
    register(input: {
        licenseKey: string;
        username: string;
        email?: string;
        password: string;
    }): Promise<SessionData>;
    login(username: string, password: string, totp?: string): Promise<SessionData>;
    validate(): Promise<SessionData>;
    heartbeat(): Promise<SessionData>;
    configuration(): Promise<RuntimeConfiguration>;
    callFunction<TResponse = unknown>(name: string, input?: unknown): Promise<TResponse>;
    files(): Promise<ManagedFile[]>;
    downloadFile(file: ManagedFile): Promise<Uint8Array>;
    getUserVariable(key: string): Promise<string | null>;
    setUserVariable(key: string, value: string): Promise<string>;
    chat(channel: string, options?: {
        message?: string;
        after?: string;
    }): Promise<ChatMessage[]>;
    beginTotp(): Promise<{
        uri: string;
        secret: string;
    }>;
    confirmTotp(token: string): Promise<void>;
    customerPortalUrl(): Promise<{
        url: string;
        expiresAt: string;
    }>;
    deactivate(): Promise<void>;
}
