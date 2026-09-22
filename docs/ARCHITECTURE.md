# Keyforge architecture

Keyforge is a single deployable Next.js application backed by PostgreSQL. The browser dashboard, administrative server actions, public client API, seller API, and webhook dispatcher share one typed domain layer.

## Trust boundaries

1. Dashboard administrators authenticate with an opaque, hashed session cookie.
2. Seller API callers authenticate with scoped API keys. Only the hash is stored.
3. Product clients authenticate with a license key, application user credentials plus optional TOTP, or a verified WebAuthn passkey. License keys are hashed before storage.
4. Successful client responses are signed with an application-specific Ed25519 key. The client embeds only the public key.
5. Application signing private keys, TOTP seeds, webhook secrets, and notification endpoints are encrypted at rest with `KEYFORGE_MASTER_KEY`.
6. Access policies compare keyed hashes of exact client identities, so stored rules do not disclose license keys or installation identifiers.

## Product request flow

1. A product sends its public application ID, license key, installation ID, and a one-use nonce to `/api/v1/client/activate`.
2. Keyforge validates application state, key state, expiration, and device limits in a database transaction.
3. Keyforge creates an opaque client session, stores only its SHA-256 hash, and signs the response payload.
4. The product calls `/api/v1/client/heartbeat` at the configured interval. Revocation and expiry are enforced on every heartbeat.
5. The active license plan and user subscriptions authorize protected files and remote functions.
6. Administrative changes are recorded in the append-only audit event table and can emit signed webhooks or encrypted notification-channel deliveries.

## Scaling

The web process is stateless except for the protected-file directory. Multiple instances can share PostgreSQL and must also share durable object storage or a network filesystem for protected files. Run webhook retries and expiry cleanup from a scheduled job that calls the maintenance endpoint with a scoped seller key. For high request volume, move delivery and audit export to a durable queue without changing the public API contract.
