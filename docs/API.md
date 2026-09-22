# Keyforge API

All native endpoints use JSON except seller file uploads and protected binary downloads. Successful client responses include `data`, a base64url canonical JSON `signedPayload`, and an Ed25519 `signature` over those exact payload bytes. Native SDKs verify the signature, confirm `signedPayload` decodes to `data`, and check the echoed one-use nonce before returning data.

## Client authentication

### Activate a license

`POST /api/v1/client/activate`

```json
{
  "appId": "app_public_id",
  "licenseKey": "KF-7M3PX-VG6LQ-R9CTW-4H2ZN-B8YKS",
  "installationId": "persistent-random-installation-id",
  "installationLabel": "Primary workstation",
  "clientVersion": "1.0.0",
  "nonce": "one-use-client-nonce"
}
```

### Register a product user

`POST /api/v1/client/register` accepts the activation fields plus `username`, optional `email`, and a password of at least 12 characters.

### Log in a product user

`POST /api/v1/client/login` accepts the activation fields plus `username`, `password`, and optional six-digit `totp`. When TOTP is enabled and the code is absent, the endpoint returns `mfa_required`.

### Session operations

These endpoints accept `appId`, `sessionToken`, and a nonce:

- `POST /api/v1/client/validate`: verify without extending the session.
- `POST /api/v1/client/heartbeat`: enforce current state and extend the session.
- `POST /api/v1/client/config`: signed runtime variables and build hashes.
- `POST /api/v1/client/files`: entitlement-filtered protected-file metadata.
- `POST /api/v1/client/functions/:name`: invoke a rate-limited, plan-gated server-defined JSON response.
- `POST /api/v1/client/user-variables`: get a variable by key or set it by including `value`.
- `POST /api/v1/client/chat`: list or send messages with `channel`, optional `message`, and optional ISO `after` cursor.
- `POST /api/v1/client/totp/begin`: create a TOTP setup URI and seed.
- `POST /api/v1/client/totp/confirm`: verify a six-digit token and enable TOTP.
- `POST /api/v1/client/login-token`: create a five-minute, single-use customer-panel login URL.

`POST /api/v1/client/login-token/exchange` consumes that token once and returns a signed product session. This supports web-loader flows without putting a password or license key in the URL.

`POST /api/v1/client/files/:fileId` returns binary content after session and plan authorization. Verify the `X-Keyforge-SHA256` header or the hash returned by the files endpoint.

`POST /api/v1/client/deactivate` accepts `appId` and `sessionToken`, revokes the session, and is idempotent.

## Passkeys

- `POST /api/v1/client/passkeys/register/options`: authenticated registration options.
- `POST /api/v1/client/passkeys/register/verify`: authenticated attestation verification and credential storage.
- `POST /api/v1/client/passkeys/login/options`: accepts `appId` and `username`.
- `POST /api/v1/client/passkeys/login/verify`: accepts the WebAuthn response plus activation fields and returns a signed client session.

Challenges expire after five minutes, are single-use, require user verification, and are bound to `KEYFORGE_RP_ID` and `KEYFORGE_RP_ORIGIN`.

## Public application identity

`GET /api/v1/client/apps/:appId/keys` returns the application name, key ID, algorithm, and Ed25519 public key. Pin this public key in distributed products; do not fetch and trust a replacement key during every authentication request.

`GET /api/v1/client/apps/:appId/config?nonce=<value>` returns signed public variables and build metadata without a license session.

The hosted customer panel is `/portal/:appId`.

## Seller API

Send `Authorization: Bearer kf_live_<secret>` for an application seller key or `Authorization: Bearer kf_res_<secret>` for a credit-limited reseller credential.

- `GET /api/v1/admin/licenses`: list licenses; scope `licenses:read`.
- `POST /api/v1/admin/licenses`: issue licenses; scope `licenses:write`.
- `PATCH /api/v1/admin/licenses/:licenseId`: change status, expiry, device limit, or note; scope `licenses:write`.
- `GET /api/v1/admin/users`: list product users; scope `users:read`.
- `GET /api/v1/admin/subscriptions`: list subscriptions; scope `users:read`.
- `POST /api/v1/admin/subscriptions`: add a user plan subscription; scope `users:write`.
- `PATCH /api/v1/admin/subscriptions/:subscriptionId`: update status or expiry; scope `users:write`.
- `GET /api/v1/admin/features`: list variables, builds, access policies, remote functions, chat channels, protected files, and notifications; scope `features:read`.
- `POST /api/v1/admin/features`: upsert a resource selected by `resource`; scope `features:write`.
- `DELETE /api/v1/admin/features/:resource/:id`: delete a feature; scope `features:write`, plus `files:write` for files.
- `POST /api/v1/admin/files`: multipart upload with `name`, optional `planId`, and `file`; scope `files:write`.
- `POST /api/v1/admin/webhooks/retry`: retry due deliveries; scope `webhooks:write`.
- `POST /api/v1/admin/maintenance`: retry deliveries and remove expired artifacts; scope `webhooks:write`.

Reseller credentials are application-specific. Each license issued atomically consumes one credit; listing users or licenses does not consume credits.

## KeyAuth compatibility

Enable the compatibility adapter from an application's Features page. `GET` and form or JSON `POST` requests to `/api/1.3` support these request types:

- `init`
- `license`
- `register`
- `login`
- `check`
- `var`
- `chatget`
- `chatsend`
- `logout`

Use the generated compatibility secret once in the trusted application configuration. The adapter provides the common KeyAuth JSON contract so products can migrate incrementally. Native Keyforge SDKs provide signed responses, protected files, subscriptions, TOTP, passkeys, and stricter nonce handling and are preferred for new integrations.

## Error contract

Native API errors use an appropriate HTTP status and this shape:

```json
{
  "success": false,
  "error": {
    "code": "machine_readable_code",
    "message": "Human-readable description."
  }
}
```

Compatibility errors return HTTP 200 with `success: false` because existing KeyAuth client wrappers expect that behavior.
