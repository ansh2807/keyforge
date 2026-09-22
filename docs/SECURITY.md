# Security model

## Secrets

- Generate `KEYFORGE_MASTER_KEY` with 32 random bytes and encode it as base64.
- Never place seller, reseller, compatibility, webhook, notification, database, or master-key secrets inside browser bundles.
- Rotate seller API keys and webhook secrets from the dashboard after suspected exposure.
- Back up the master key separately from the database. Losing it makes encrypted signing keys unrecoverable.

## Passwords and sessions

- Passwords use Argon2id with memory-hard parameters.
- Admin and client sessions are opaque random values. Only SHA-256 hashes are stored.
- Admin cookies are HTTP-only, same-site strict, path scoped, and secure in production.
- Authentication endpoints use database-backed attempt throttling.
- Enable both TOTP and email OTP for administrative accounts so an SMTP outage does not remove the offline authenticator fallback.
- Administrator email codes are generated with a cryptographic random source, stored only as master-keyed hashes, expire after ten minutes, allow five attempts, and are consumed atomically after use.
- Email OTP is sent only after a correct password. Use a dedicated SMTP credential and rotate it after suspected disclosure; never use a normal mailbox password.
- Customer TOTP seeds are encrypted with the master key. WebAuthn passkey private keys remain in authenticators; the database stores credential public keys and monotonic counters.
- WebAuthn challenges expire after five minutes, are single-use, and require user verification against the configured relying-party ID and origin.

## Client response integrity

- Each application has a distinct Ed25519 key pair. The private key is encrypted; products embed only the public key.
- Successful native client responses sign canonical JSON and echo a one-use nonce.
- SDKs reject an unexpected algorithm, invalid signature, or nonce mismatch.
- Protected-file metadata is signed and SDKs verify the downloaded content's SHA-256 hash.

TLS is still mandatory. Response signing does not hide requests, protect passwords in transit, or replace certificate validation.

## Network boundaries

- Webhook and notification endpoints require HTTPS and are resolved against blocked loopback, private, link-local, and metadata address ranges before dispatch.
- PostgreSQL must not be internet-accessible. The production Compose file binds it to loopback.
- Trust `X-Forwarded-For` only when Keyforge receives traffic exclusively from the controlled reverse proxy.

## Licensing boundary

Keyforge establishes server truth for licenses and entitlements. It does not make a desktop binary impossible to patch. Keep high-value operations and protected data behind server-side authorization. Treat device identifiers as rate-limiting signals, not permanent proof of a physical machine.

## Deployment checklist

- Terminate TLS at the reverse proxy and redirect HTTP to HTTPS.
- Set a unique PostgreSQL password and restrict database network access.
- Set `KEYFORGE_BASE_URL` to the public HTTPS origin.
- Run database backups and restore tests.
- Send application logs to durable storage and alert on repeated authentication failures.
- Review audit events and webhook failures.
- Run the authenticated maintenance endpoint and verify protected-file storage remains writable.
- Back up PostgreSQL, protected files, and the master key in separate encrypted locations; exercise restoration.
- Commission an external security review before accepting sensitive production traffic.
