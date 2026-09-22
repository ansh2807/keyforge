# Keyforge — Executable Build Prompt Pack

**Companions:** `PRODUCTION-PLAN.md` (what's broken) · `DIFFERENTIATION-PLAN.md` (what's unique)
**This document:** every task as a copy-pasteable prompt, ordered, dependency-tracked, from
today's codebase to commercial launch.

**51 prompts · 8 phases · ~9 engineer-months**

---

## How to use this

1. **One prompt per agent session.** Each is self-contained; sessions start cold.
2. **Always prepend the Standing Context block** (§A) and the **Guardrails** (§B).
3. **Verify before advancing.** Every prompt has Definition of Done. Do not start a
   dependent prompt until its dependencies' DoD passes in CI.
4. **One prompt = one PR.** If a prompt produces more than ~800 changed lines, split it.
5. **Track progress in §C.** Update the status column as you go.

**Order matters.** KF-01 through KF-22 are prerequisites for everything else. Differentiation
work (KF-31+) built on a platform that cannot rate-limit or recover an account is wasted.

---

## §A — Standing Context (prepend to every prompt)

```
PROJECT CONTEXT — Keyforge

Keyforge is a self-hosted software licensing and product-authentication platform.
Repo root: the directory containing package.json with "name": "keyforge".

Stack: Next.js 16 (App Router, React 19, server actions), TypeScript 5.9 strict,
Prisma 6 + PostgreSQL, Zod 4, Argon2id (@node-rs/argon2), node:crypto (Ed25519 +
AES-256-GCM), SimpleWebAuthn, Vitest, pnpm 11, Node 22+.

Layout:
  src/app/api/v1/client/**   public product-client API (signed responses)
  src/app/api/v1/admin/**    seller/reseller API (bearer keys, scoped)
  src/app/api/1.3/route.ts   KeyAuth compatibility adapter
  src/app/dashboard/**       admin control plane (server components)
  src/app/actions/**         server actions
  src/lib/**                 domain layer — all business logic lives here
  prisma/schema.prisma       data model
  sdk/{typescript,python,csharp,java,cpp}  client SDKs
  docs/                      API, ARCHITECTURE, SECURITY, DEPLOYMENT + the three plans
  tests/                     Vitest

Key conventions:
- Domain logic in src/lib, imported by routes/actions. Routes stay thin.
- Every lib module that touches the DB or secrets starts with: import "server-only";
- Errors: throw ApiError(code, message, status) from src/lib/api-error.ts;
  routes catch with jsonError() from src/lib/http.ts.
- All request input validated with Zod at the boundary.
- Secrets encrypted at rest via encryptSecret/decryptSecret (src/lib/crypto.ts) under
  KEYFORGE_MASTER_KEY. License keys and access-rule values stored as keyedHash (HMAC).
- Client responses wrapped by signedClientResponse() (src/lib/app-signing.ts):
  Ed25519 over canonicalJson(data), with a client nonce echoed inside data.
- Prose style in code comments and docs: plain, declarative, no marketing language.
```

---

## §B — Guardrails (prepend to every prompt)

```
GUARDRAILS

1. NEVER break the /api/v1 client contract. Compiled customer binaries depend on it and
   cannot be updated. Additive changes only. Breaking changes require /api/v2.
2. NEVER weaken an existing security control to make a task easier. If a control blocks
   you, say so and stop.
3. Migrations must be expand/contract and backward-compatible for one release. Never
   write a destructive migration without an explicit separate contract step.
4. No new runtime dependency without justifying it in the PR description. Prefer the
   standard library and what is already in package.json.
5. Do not log secrets, license keys, tokens, session values, or password hashes. When
   logging errors, redact before serialising.
6. Every new endpoint must be rate-limited, validated with Zod, and covered by a test.
7. Do not commit build artifacts, .env files, or generated SDK output that CI can rebuild.
8. If you find a security defect outside the task's scope, report it in the PR description
   rather than silently fixing it or ignoring it.
9. If a task's premise appears wrong given the actual code, say so before implementing.
10. Report honestly. If tests fail or a step was skipped, state it plainly with output.
```

---

## §C — Progress tracker

| ID | Task | Phase | Depends | Status |
|---|---|---|---|---|
| KF-01 | Rate limiter rewrite | 0 | — | ☐ |
| KF-02 | Middleware + trusted-proxy IP | 0 | — | ☐ |
| KF-03 | SSRF redirect fix | 0 | — | ☐ |
| KF-04 | Webhooks off the request path | 0 | — | ☐ |
| KF-05 | CSP nonces, body limits, error redaction | 0 | KF-02 | ☐ |
| KF-06 | Access-rule indexing + data retention | 0 | — | ☐ |
| KF-07 | Session cap, idempotency, key cache | 0 | — | ☐ |
| KF-08 | Testcontainers harness | 1 | — | ☐ |
| KF-09 | Auth-flow integration tests | 1 | KF-08 | ☐ |
| KF-10 | Authorization matrix + concurrency | 1 | KF-08 | ☐ |
| KF-11 | SDK conformance suite | 1 | KF-08 | ☐ |
| KF-12 | Coverage gates in CI | 1 | KF-09,10,11 | ☐ |
| KF-13 | OpenTelemetry + structured logs | 2 | KF-02 | ☐ |
| KF-14 | Durable queue + worker process | 2 | KF-04 | ☐ |
| KF-15 | S3 storage driver | 2 | — | ☐ |
| KF-16 | Retention jobs + health checks | 2 | KF-14,15 | ☐ |
| KF-17 | Backup/restore drill | 2 | — | ☐ |
| KF-18 | Dashboards + alerts | 2 | KF-13 | ☐ |
| KF-19 | Admin recovery | 3 | KF-01 | ☐ |
| KF-20 | End-user verification + reset | 3 | KF-01 | ☐ |
| KF-21 | Session/device management UI | 3 | KF-07 | ☐ |
| KF-22 | Login hardening | 3 | KF-01,02 | ☐ |
| KF-23 | Access rules: CIDR/country/ASN | 4 | KF-06 | ☐ |
| KF-24 | Session-hijack detection | 4 | KF-23 | ☐ |
| KF-25 | Client application logs | 4 | KF-14 | ☐ |
| KF-26 | Subscription tiers | 4 | — | ☐ |
| KF-27 | Full customer portal | 4 | KF-20,21 | ☐ |
| KF-28 | Bulk ops + cursor pagination | 4 | — | ☐ |
| KF-29 | Dashboard analytics | 4 | KF-13 | ☐ |
| KF-30 | Discord bot | 4 | KF-31 | ☐ |
| KF-31 | OpenAPI 3.1 spec | 5/D0 | KF-12 | ☐ |
| KF-32 | `keyforge dev` + CLI init | 5/D1 | KF-31 | ☐ |
| KF-33 | Generated SDKs | 5/D1 | KF-31 | ☐ |
| KF-34 | Transparency log | 5/D2 | — | ☐ |
| KF-35 | `keyforge-verify` CLI | 5/D2 | KF-34 | ☐ |
| KF-36 | Entitlements policy-as-code | 5/D3 | — | ☐ |
| KF-37 | Usage metering | 5/D3 | KF-36 | ☐ |
| KF-38 | Offline grants (COSE) | 5/D4 | KF-36 | ☐ |
| KF-39 | CDN revocation sets | 5/D4 | KF-38 | ☐ |
| KF-40 | Integrity signal collection | 5/D5 | KF-38 | ☐ |
| KF-41 | Integrity dashboard + ladder | 5/D5 | KF-40 | ☐ |
| KF-42 | KeyAuth migration wedge | 5/D6 | KF-31 | ☐ |
| KF-43 | Adversarial conformance suite | 5/D6 | KF-33,38 | ☐ |
| KF-44 | MITM comparison demo | 5/D6 | — | ☐ |
| KF-45 | Multi-org hardening | 6 | — | ☐ |
| KF-46 | Billing (Stripe) | 6 | KF-45,37 | ☐ |
| KF-47 | Signup + free tier + quotas | 6 | KF-46 | ☐ |
| KF-48 | Status page + trust surface | 6 | KF-18 | ☐ |
| KF-49 | Threat model + SECURITY.md | 7 | — | ☐ |
| KF-50 | Load testing + capacity | 7 | KF-13 | ☐ |
| KF-51 | License + release engineering | 7 | — | ☐ |

---

# PHASE 0 — Stop the bleeding

> These fix live security defects found in audit. Do them first, in any order.

---

### KF-01 · Rate limiter rewrite

**Depends:** none · **Fixes:** P0-1, P0-2 · **Size:** M

```
Rewrite Keyforge's rate limiting. It is currently non-functional on five endpoints.

THE BUG
src/lib/rate-limit.ts:10-12 — enforceRateLimit() counts only AuthAttempt rows where
success=false. Rows are written only by recordAuthAttempt(). These call sites invoke the
limiter but never record an attempt, so the count is permanently zero and the limit can
never fire:
  - src/app/api/1.3/route.ts:71 (the whole KeyAuth compat surface)
  - src/app/api/v1/client/functions/[name]/route.ts:17 (also called AFTER the DB work)
  - src/app/api/v1/client/chat/route.ts:20
  - src/app/api/v1/client/passkeys/login/options/route.ts:17
  - src/app/actions/team-actions.ts:67

Additionally these endpoints have no limiting at all: heartbeat, validate, config, files,
files/[fileId], user-variables, deactivate. heartbeat performs two DB writes per call.

BUILD
1. Replace src/lib/rate-limit.ts with a sliding-window counter that counts EVERY request,
   not just failures. Remove the success boolean from the limiting decision entirely.
2. Primary backend: Redis (add ioredis; new env KEYFORGE_REDIS_URL). Fallback backend:
   PostgreSQL, used when the URL is unset, so single-node self-hosting still works. Put
   both behind one interface in src/lib/rate-limit.ts.
3. Support two independent dimensions per call: per-IP and per-principal (session token
   hash, license hash, or API key id). Both must pass.
4. Keep recordAuthAttempt() as a SEPARATE concern for brute-force lockout on credential
   endpoints. Do not couple it to the limiter.
5. Apply limits to every client, admin, and compat endpoint. Table the chosen limits in
   docs/API.md. Enforce BEFORE any database work in each handler.
6. Return 429 with a Retry-After header and the standard ApiError JSON shape.
7. For remote functions, enforce RemoteFunction.rateLimitPerMinute before executing.

DONE WHEN
- Every enforceRateLimit call site is paired with real counting; no dead limiter remains.
- A test floods /api/1.3 and receives 429 with Retry-After.
- A test proves heartbeat is limited per session token.
- A test proves the Postgres fallback limits correctly with KEYFORGE_REDIS_URL unset.
- A test proves remote-function limits fire before executeRemoteFunction runs.
- pnpm check passes.
```

---

### KF-02 · Middleware and trusted-proxy IP resolution

**Depends:** none · **Fixes:** P0-3 · **Size:** M

```
Keyforge trusts X-Forwarded-For unconditionally, so every IP-keyed control is bypassable
with a forged header.

THE BUG
src/lib/http.ts:5-8 (clientIp) and src/lib/auth.ts:22-24 (getRequestMetadata) take the
first XFF value with no trusted-proxy configuration. This defeats: rate-limit buckets,
IP access rules (src/lib/access-control.ts), admin login throttling, and audit accuracy.

BUILD
1. New src/lib/client-address.ts exporting resolveClientAddress(headers).
   - New env KEYFORGE_TRUSTED_PROXY_HOPS (integer, default 0).
   - With 0 hops, ignore XFF entirely and use the socket address.
   - With N hops, take the (N+1)th value from the RIGHT of the XFF chain — never the left.
   - Validate the result is a well-formed IP; return null, never the string "unknown",
     when it cannot be established. Callers must handle null explicitly.
   - Support Forwarded (RFC 7239) as well as X-Forwarded-For.
2. Rewrite clientIp() and getRequestMetadata() to delegate to it. Find and update every
   caller.
3. Create src/middleware.ts:
   - Generate a request ID (crypto.randomUUID), expose it as x-request-id on every response
     and via a header the route handlers can read.
   - Global per-IP rate limit as a backstop (uses KF-01's limiter).
   - Reject requests whose Content-Length exceeds a per-route-class ceiling.
   - Keep security headers in next.config.ts; do not duplicate them here.
4. Document KEYFORGE_TRUSTED_PROXY_HOPS in .env.example, docs/DEPLOYMENT.md, and
   docs/SECURITY.md, with the Caddy/nginx/Cloudflare values for each.

DONE WHEN
- A test proves a forged XFF header cannot reset a rate-limit bucket at hops=0.
- A test proves hops=1 reads the correct value from the right of the chain.
- A test proves a spoofed XFF cannot evade an IP DENY access rule.
- Every response carries x-request-id.
- pnpm check passes.
```

---

### KF-03 · SSRF redirect fix

**Depends:** none · **Fixes:** P0-4 · **Size:** S

```
Keyforge screens webhook URLs against private ranges, then follows redirects unscreened.

THE BUG
src/lib/safe-url.ts correctly resolves DNS and rejects private/loopback/link-local
addresses. But src/lib/webhooks.ts:60 and src/lib/notifications.ts:44 call fetch() with
default redirect handling. A registered endpoint returning
  302 Location: http://169.254.169.254/latest/meta-data/
is followed with no screening. The DNS check is also TOCTOU-vulnerable to rebinding.

BUILD
1. Set redirect: "manual" on both fetch calls.
2. Treat any 3xx as a delivery failure by default. Add an opt-in per-endpoint setting
   allowing at most 1 redirect; when enabled, re-run assertSafeWebhookUrl on the Location
   value before following, and require the same protocol.
3. Close the DNS-rebinding window: resolve the hostname once, validate the addresses, then
   pin the connection to a validated address (custom undici Agent with a fixed lookup, or
   connect by IP with the Host header and TLS servername preserved).
4. Cap response body reads at 64 KB.
5. Add a per-application allowlist/denylist of webhook hostnames, off by default.
6. Extend tests/network.test.ts and add tests/safe-url.test.ts.

DONE WHEN
- A test spins up a local server returning 302 to 169.254.169.254 and delivery is refused
  with a clear error.
- A test proves a DNS-rebinding response (public A record, then private on re-resolve)
  cannot reach the private address.
- Existing webhook delivery still works against a normal 200 endpoint.
- pnpm check passes.
```

---

### KF-04 · Webhooks off the request path

**Depends:** none · **Fixes:** P0-5 · **Size:** S

```
Webhook delivery blocks license activation.

THE BUG
src/lib/webhooks.ts:41 — emitWebhook awaits Promise.allSettled(dispatchWebhook) before
returning, and src/app/api/v1/client/activate/route.ts:26 awaits emitWebhook before
responding. Each delivery has a 5s timeout, so three slow customer endpoints add 15s to a
license activation. Retries only happen when someone manually POSTs the maintenance
endpoint.

BUILD (interim — KF-14 replaces this with a durable queue)
1. Split emitWebhook into enqueueWebhook (writes WebhookDelivery rows, returns immediately)
   and the existing dispatchWebhook.
2. Dispatch after the response using Next's after() from next/server. Every caller of
   emitWebhook must return without waiting on network I/O.
3. Same treatment for emitNotifications (src/lib/notifications.ts).
4. Add exponential backoff with jitter to nextAttemptAt: 1m, 5m, 25m, 2h, 12h, 24h, capped
   at 8 attempts (the existing maintenance query already filters attempts < 8).
5. Add a delivery-failure metric hook (a no-op function for now; KF-13 wires it up).

DONE WHEN
- A test with an endpoint that sleeps 10s proves activation still responds in under 500ms.
- A test proves the delivery row is created and eventually dispatched.
- Backoff intervals are asserted by a test.
- pnpm check passes.
```

---

### KF-05 · CSP nonces, body limits, error redaction

**Depends:** KF-02 · **Fixes:** P1-5, P1-6, P1-7, part of P0-7 · **Size:** M

```
Three hardening items and one information-disclosure fix.

THE BUGS
1. next.config.ts:5 — production CSP allows script-src 'unsafe-inline'.
2. next.config.ts:11 — serverActions.bodySizeLimit is 50mb for EVERY action, not just
   uploads.
3. src/lib/api-error.ts:14 — asApiError() console.errors the raw error object, which will
   print connection strings and query parameters on a Prisma error.
4. No Retry-After on 429 responses.

BUILD
1. Nonce-based CSP: generate a per-request nonce in src/middleware.ts, pass it through to
   the root layout, apply it to script tags, and replace 'unsafe-inline' in script-src with
   'nonce-<value>' in production. Keep style-src 'unsafe-inline' (Radix requires it) and
   note why in a comment.
2. Reduce the global server-action body limit to 1mb. Route protected-file uploads through
   a dedicated API route with its own explicit limit driven by KEYFORGE_MAX_UPLOAD_MB.
3. Add src/lib/redact.ts: a serialiser that strips DATABASE_URL, any key matching
   /password|secret|token|key|hash|authorization/i, and truncates strings over 500 chars.
   Use it in asApiError() and everywhere errors are logged. Include the request ID from
   KF-02 in the logged record.
4. Add Retry-After to all 429 responses (jsonError should set it when ApiError carries a
   retryAfterSeconds field).

DONE WHEN
- A test asserts the production CSP contains no 'unsafe-inline' in script-src.
- The dashboard renders and functions with the nonce CSP (verify manually and note it).
- A test proves a Prisma error with a connection string in it is redacted before logging.
- A 429 response carries Retry-After.
- pnpm check passes.
```

---

### KF-06 · Access-rule indexing and data retention

**Depends:** none · **Fixes:** P1-2, P1-3, P1-4 · **Size:** M

```
Two scaling defects and one DoS vector.

THE BUGS
1. src/lib/access-control.ts:78-84 — enforceApplicationAccess loads EVERY active rule for
   the application on every authentication, then filters in JS. With 50k blacklist entries
   that is a table scan per login. The schema already has a unique index on
   (applicationId, effect, subject, valueHash).
2. Unbounded growth with no retention: AuthAttempt (one row per attempt, forever, and it is
   what the limiter counts on every request), AuditEvent, WebhookDelivery, ChatMessage,
   CompatibilitySession. src/app/api/v1/admin/maintenance/route.ts cleans sessions,
   challenges, and login tokens but NOT AuthAttempt.
3. src/app/api/1.3/route.ts:90-97 — compat `init` creates a CompatibilitySession row with
   24h expiry per unauthenticated call. Combined with KF-01's bug this was a disk-fill DoS.

BUILD
1. Rewrite enforceApplicationAccess: compute candidate hashes first, then a single query
   with valueHash IN (...) restricted to the application. Preserve exact DENY-then-ALLOW
   precedence — DENY always wins, and a non-empty ALLOW set requires a match.
2. Add a fast path: if the application has zero rules, skip the query. Cache the
   has-any-rules boolean per application in Redis with a 60s TTL, invalidated on rule write.
3. Add src/lib/retention.ts with configurable windows (new env vars, documented defaults):
   AuthAttempt 7d, WebhookDelivery 30d, expired ClientSession 30d, CompatibilitySession on
   expiry, ProductAuthChallenge on expiry, ChatMessage 90d. AuditEvent: NEVER auto-delete;
   provide an export-then-archive path instead and document why.
   Delete in bounded batches so a large backlog cannot lock the table.
4. Wire retention into the maintenance endpoint now; KF-16 moves it to a scheduled worker.
5. Require the compat secret before creating a CompatibilitySession — verify credentials
   first, then write the row. Cap concurrent unexpired compat sessions per application.

DONE WHEN
- A benchmark test with 50,000 access rules shows authentication latency unchanged versus
  10 rules.
- Precedence tests: DENY beats ALLOW; empty ALLOW set permits; non-empty ALLOW set denies
  non-members.
- A test proves AuthAttempt rows past the window are pruned in batches.
- A test proves compat init with a wrong secret creates no row.
- pnpm check passes.
```

---

### KF-07 · Session lifetime cap, idempotency, signing-key cache

**Depends:** none · **Fixes:** P1-1, P1-9, P1-10, P1-11 · **Size:** M

```
Four correctness and performance items.

THE BUGS
1. src/lib/licenses.ts:459-461 — validateClientSession extends expiresAt on every heartbeat
   with no absolute cap. A stolen session token is valid forever as long as it heartbeats.
2. No idempotency on seller-API license issuance. A retried POST /api/v1/admin/licenses
   double-issues keys and double-debits reseller credits.
3. src/lib/app-signing.ts:8 — the application private key is AES-decrypted on every single
   signed response.
4. src/lib/licenses.ts:570-571 — keyPrefix (8 chars) + keyLastFour stores 13 of 25 license
   key characters in cleartext.

BUILD
1. Add ClientSession.absoluteExpiresAt (migration, default now + 30 days, new env
   KEYFORGE_SESSION_ABSOLUTE_DAYS). Heartbeat extends expiresAt but never past
   absoluteExpiresAt. When the absolute cap is hit, return a distinct error code
   (session_reauth_required) so SDKs can re-authenticate cleanly rather than treating it as
   revocation.
2. Add an IdempotencyKey model (key, applicationId, requestHash, responseBody, statusCode,
   createdAt, unique on (applicationId, key), 24h retention). Support the Idempotency-Key
   header on POST /api/v1/admin/licenses and POST /api/v1/admin/subscriptions. Replaying a
   key with the same body returns the stored response; a different body returns 422.
3. Add an LRU cache in src/lib/app-signing.ts keyed by signingKeyId, 5-minute TTL, holding
   the decrypted key object. Invalidate on application update. Cap entries so a many-app
   deployment cannot exhaust memory.
4. Reduce license cleartext exposure to 4 leading + 4 trailing characters. Write a
   migration that recomputes keyPrefix for existing rows (it is derived, not authoritative).
   Update the dashboard and seller API display accordingly.

DONE WHEN
- A test proves heartbeats cannot extend a session past the absolute cap and that the
  distinct error code is returned.
- A test proves a replayed Idempotency-Key issues no additional licenses and debits no
  additional reseller credits.
- A benchmark shows reduced per-request signing cost.
- pnpm check passes.
```

---

# PHASE 1 — Test the security core

> 10k lines of authentication code currently have five unit-test files covering none of the
> security-critical flows.

---

### KF-08 · Testcontainers harness

**Depends:** none · **Size:** M

```
Keyforge has no integration test infrastructure. Build it.

BUILD
1. Add @testcontainers/postgresql and @testcontainers/redis as dev dependencies.
2. Create tests/support/harness.ts:
   - Boots Postgres and Redis containers once per Vitest run (globalSetup).
   - Applies prisma migrate deploy against the container.
   - Per test file: a fresh schema (or a transaction rolled back per test) so tests are
     isolated and can run in parallel.
   - Exports a typed factory API: createOrganization, createApplication, createPlan,
     createLicense, createEndUser, createApiKey, createReseller. Factories must produce
     valid, minimal objects with sensible overrides.
   - Exports callRoute(handler, {method, body, headers, params}) that invokes a Next route
     handler directly with a real NextRequest and returns the parsed response, so tests
     exercise routes without an HTTP server.
   - Exports a signature verifier so tests can assert responses are correctly signed and
     that the nonce is echoed.
3. Add a vitest workspace or project split so unit tests stay fast and containers boot only
   for the integration project. Add scripts: test:unit, test:integration, test:all.
4. Update .github/workflows/ci.yml to run both. Keep the existing Postgres service for the
   migration step or replace it with the container, whichever is simpler — state which.
5. Document the harness in tests/README.md with a worked example.

DONE WHEN
- pnpm test:integration boots containers, applies migrations, and runs a smoke test that
  activates a license end to end and verifies the response signature.
- Tests are isolated: running the suite twice in a row passes both times.
- CI green, total runtime under 10 minutes.
```

---

### KF-09 · Authentication flow integration tests

**Depends:** KF-08 · **Size:** L

```
Write integration tests for every authentication and licensing flow. These are the tests
that should have existed before any of this shipped.

COVER (src/lib/licenses.ts and the routes that call it)
1. activate: valid key; unknown key; revoked; suspended; expired-by-date; expired-by-status;
   inactive application; device limit reached; revoked device; re-activation of an existing
   installation updates rather than duplicating; expiry is computed from durationDays on
   first activation and not recomputed on later ones.
2. register: success; registration disabled; duplicate username; duplicate email; license
   already bound to a user; unusable license; the subscription row is created.
3. login: success; wrong password; unknown user; suspended user; banned user; TOTP required;
   TOTP wrong; TOTP correct; user with no license.
4. passkey register/login: full WebAuthn round trip with a software authenticator; challenge
   expiry; challenge single-use; counter regression rejected.
5. validate vs heartbeat: heartbeat extends, validate does not; both enforce revocation,
   suspension, expiry, device revocation, and user status; absolute cap from KF-07.
6. deactivate: revokes; is idempotent; a revoked session fails validate.
7. login-token: issue, exchange once, second exchange fails, expiry.
8. Response signing: every successful client response verifies against the application
   public key, the nonce is echoed exactly, and signedPayload base64url-decodes to
   canonicalJson(data).

RULES
- Assert error CODES, not messages. Codes are the API contract; messages are not.
- No mocking of src/lib. Test the real code against the real database.
- Each test independent and order-free.

DONE WHEN
- Every listed case has a test.
- src/lib/licenses.ts line coverage is 100%.
- Suite is green and deterministic across three consecutive runs.
```

---

### KF-10 · Authorization matrix and concurrency tests

**Depends:** KF-08 · **Size:** L

```
Test the authorization boundaries and the concurrency-sensitive paths.

AUTHORIZATION MATRIX (src/lib/seller-auth.ts and src/app/api/v1/admin/**)
1. For every admin endpoint × every scope: assert 403 when the scope is absent and success
   when present. Generate the matrix from a table so a new endpoint without a test is
   obvious.
2. Cross-application isolation: an API key for app A must not read, mutate, or enumerate any
   resource of app B. Test every list and mutate endpoint. This is the highest-value test
   in the suite.
3. Revoked key; expired key; malformed key; wrong prefix; reseller key with no application;
   inactive reseller.
4. Dashboard RBAC (src/app/actions/**): OWNER, ADMIN, and ANALYST against every server
   action. ANALYST must not mutate. Non-members must not reach another organization's data.

CONCURRENCY (the code most likely to be subtly wrong)
5. Device limit under concurrency: fire N+1 simultaneous activations for distinct
   installation IDs against a license with maxDevices=N. Exactly N must succeed. This
   exercises the SELECT ... FOR UPDATE in activateCore (src/lib/licenses.ts:55) — if it is
   wrong, this test is how you find out.
6. Reseller credits under concurrency: fire simultaneous issuance requests exceeding
   available credits. Credits must never go negative and issued count must equal debited
   credits exactly.
7. Simultaneous register with the same username: exactly one succeeds, the other gets
   user_exists (not a raw Prisma error).
8. Simultaneous heartbeats on one session do not corrupt expiry.

DONE WHEN
- The matrix has no untested cell.
- Concurrency tests run with real parallel connections (not sequential awaits) and pass
  100 consecutive iterations.
- Any defect found is reported in the PR description before being fixed.
```

---

### KF-11 · SDK conformance suite

**Depends:** KF-08 · **Size:** L

```
Five SDKs exist and none is tested. Build a conformance suite every SDK must pass.

BUILD
1. Create conformance/vectors.json — language-agnostic test vectors, each with an input
   response document and an expected accept/reject outcome with a reason code:
   - valid signed response (accept)
   - signature bytes flipped (reject)
   - signature valid but signed by a different application key (reject)
   - algorithm field changed to "none" / "HS256" / absent (reject)
   - nonce not echoed / echoed with a different value (reject)
   - signedPayload does not decode to canonicalJson(data) (reject)
   - data mutated after signing (reject)
   - truncated or non-base64url signature (reject)
   - unknown keyId (reject)
   - success:false with an error body (reject, surfaced as the error code)
   Generate the valid vectors with the real signing code so they cannot drift.
2. Create conformance/run/<lang>/ — a small runner per SDK (typescript, python, csharp,
   java, cpp) that feeds each vector to the SDK's verification path and prints a
   machine-readable result line per vector.
3. Fix any SDK that fails. Report each failure in the PR description — an SDK that accepts
   a forged signature is a critical finding, not a routine fix.
4. Add a conformance job to .github/workflows/ci.yml running all five, publishing a
   pass/fail matrix as a job summary.
5. Document the SDK verification contract in docs/API.md: verify signature, check keyId
   against pinned keys, confirm signedPayload decodes to data, check the echoed nonce, and
   fail closed.

DONE WHEN
- All five SDKs pass every vector.
- CI fails if any SDK fails any vector.
- Adding a vector requires no per-language changes.
```

---

### KF-12 · Coverage gates

**Depends:** KF-09, KF-10, KF-11 · **Size:** S

```
Lock in the Phase 1 work so it cannot regress.

BUILD
1. Enable Vitest coverage (v8 provider). Configure thresholds in vitest.config.ts:
   - global: 80% lines, 75% branches
   - src/lib/**: 90% lines
   - src/lib/licenses.ts, access-control.ts, seller-auth.ts, crypto.ts, rate-limit.ts,
     safe-url.ts, app-signing.ts: 100% lines, 95% branches
2. Fail CI below threshold. Add coverage reporting to the PR summary.
3. Add a CI check that every route file under src/app/api/** is referenced by at least one
   integration test — a simple script comparing the route file list against test imports.
   Fail with a clear message naming untested routes.
4. Add to .github/workflows/ci.yml: pnpm audit --audit-level=high, a secret scan
   (gitleaks), and a SAST pass (semgrep with the default TypeScript + security rulesets).
   Triage existing findings and either fix or document each in the PR.
5. Update the CI job to run: lint → typecheck → test:unit → test:integration → conformance
   → coverage gate → build → container build + boot + health check.

DONE WHEN
- CI fails on a deliberate coverage drop (prove it with a scratch commit, then revert).
- CI fails if a new route is added without a test.
- All security scans pass or have documented, justified exceptions.
```

---

# PHASE 2 — Operability

---

### KF-13 · OpenTelemetry, structured logging, error reporting

**Depends:** KF-02 · **Fixes:** P0-7 · **Size:** L

```
Keyforge has zero observability. No logs, metrics, traces, or error reporting. It cannot be
operated in production.

BUILD
1. Add @opentelemetry/sdk-node and the Next.js instrumentation hook (instrumentation.ts).
   Configure an OTLP exporter behind env vars, disabled by default so self-hosters are not
   forced into it.
2. Traces: every API route, every server action, every Prisma query (Prisma OTel
   integration), and outbound webhook/notification calls. Span attributes must include
   request id, organization id, application id, and route — never secrets or license keys.
   Reuse src/lib/redact.ts from KF-05 on any attribute that could carry user input.
3. Metrics (RED per endpoint plus domain counters):
   - http.server.duration histogram by route and status
   - auth outcomes by result code (activate, login, register, heartbeat)
   - rate_limit.tripped by bucket class
   - webhook.delivery by outcome; webhook.queue.depth
   - db.pool.in_use / waiting
   - license.activated, license.revoked, session.created
4. Structured JSON logging: replace every console.* with a logger (src/lib/log.ts) emitting
   level, timestamp, request id, org id, message, and redacted context. Sampling for
   high-volume paths.
5. Error reporting: Sentry (or an OTLP-compatible alternative) behind an env var. Attach
   request id. Scrub PII and secrets in beforeSend.
6. Document every new env var in .env.example and docs/DEPLOYMENT.md, including how to run
   with observability fully disabled.

DONE WHEN
- A local OTel collector receives traces, metrics, and logs from a real activation.
- No log line or span attribute contains a secret, token, or license key — assert this with
  a test that runs a full activation and greps the emitted telemetry.
- Everything is off by default and the app runs unchanged with no collector configured.
```

---

### KF-14 · Durable queue and worker process

**Depends:** KF-04 · **Size:** L

```
Replace KF-04's interim after() dispatch with a real job system, and split the worker out
of the web process.

BUILD
1. Add a durable queue. Prefer pg-boss (PostgreSQL-backed, no new infrastructure for
   self-hosters) unless Redis is already mandatory by this point — justify the choice in
   the PR.
2. Create a worker entrypoint (worker.ts + a pnpm worker script + a Docker service in
   docker-compose.yml). It must run independently of the web process and scale separately.
3. Move onto the queue: webhook delivery, notification delivery, retention sweeps, expiry
   sweeps, and data exports.
4. Job requirements: at-least-once delivery, idempotent handlers, exponential backoff with
   jitter, a dead-letter queue after max attempts, per-job timeouts, and graceful shutdown
   that finishes in-flight jobs.
5. Dashboard: a Deliveries view showing pending/failed/dead-lettered jobs with the failure
   reason and a manual replay button (owner/admin only, audited).
6. Keep POST /api/v1/admin/maintenance working as a manual trigger that enqueues rather
   than executing inline.

DONE WHEN
- Killing the worker mid-delivery loses no event; it is retried on restart.
- A test proves a handler that runs twice produces one logical delivery.
- Dead-lettered jobs appear in the dashboard and replay successfully.
- Web and worker run as separate containers in docker-compose.
```

---

### KF-15 · S3-compatible storage driver

**Depends:** none · **Fixes:** P0-8 · **Size:** M

```
Protected files are on local disk, which blocks horizontal scaling and breaks
/api/health/ready on any instance with a detached volume.

BUILD
1. Extract the current src/lib/storage.ts into a StorageDriver interface:
   put(bytes, meta) -> {storageKey, sha256, size}, get(storageKey) -> stream,
   delete(storageKey), presignedUrl(storageKey, ttl) -> string | null, healthCheck().
2. Implement LocalDiskDriver (existing behaviour, remains the default for single-node
   self-hosting) and S3Driver (@aws-sdk/client-s3, works with S3, R2, MinIO, B2).
   Select via KEYFORGE_STORAGE_DRIVER.
3. For S3, serve downloads via short-lived presigned URLs rather than proxying bytes
   through the app. Keep the SHA-256 header contract from the current
   /api/v1/client/files/[fileId] route intact — the SDKs verify it, so it must not change.
   Where a presigned redirect is used, return the hash in the metadata response the SDK
   already reads.
4. Stream uploads and downloads. Do not buffer whole files in memory — the current
   implementation calls file.arrayBuffer() and must be fixed.
5. Add a migration command that copies existing local files into the configured bucket and
   verifies each by hash.
6. Update /api/health/ready to call driver.healthCheck().

DONE WHEN
- Both drivers pass an identical test suite (upload, hash, download, delete, missing file).
- A 200 MB upload completes without proportional memory growth.
- Two app instances sharing one bucket both serve the same file.
- The SDK download path and hash verification are unchanged — proven by the conformance
  suite from KF-11.
```

---

### KF-16 · Retention jobs and health checks

**Depends:** KF-14, KF-15 · **Size:** S

```
Move retention onto the scheduler and make health checks tell the truth.

BUILD
1. Move src/lib/retention.ts (from KF-06) onto the queue as recurring jobs with configurable
   cron expressions. Add: expired-license status reconciliation (licenses past expiresAt
   still marked ACTIVE should become EXPIRED), orphaned-activation cleanup, and
   dead-lettered-job pruning.
2. Rewrite /api/health/ready to check database, Redis (if configured), storage driver, and
   queue connectivity — each reported independently with its own status so a partial outage
   is diagnosable. Keep /api/health/live cheap and dependency-free.
3. Remove the local-disk write probe from readiness when the S3 driver is active (it
   currently writes a marker file on every check).
4. Emit a metric per retention run: rows examined, rows deleted, duration.
5. Add a startup self-check that logs a clear, actionable error and exits non-zero on
   misconfiguration (bad master key length, unreachable DB, unwritable storage).

DONE WHEN
- Retention runs on schedule and is observable in metrics.
- Readiness returns a per-dependency breakdown and 503 when any hard dependency is down.
- Misconfiguration produces a clear startup error rather than a runtime failure later.
```

---

### KF-17 · Backup and restore verification

**Depends:** none · **Size:** M

```
Backup scripts exist (scripts/backup-linux.sh, backup.ps1, restore.ps1) but no restore is
ever verified. An unverified backup is not a backup.

BUILD
1. Rewrite the backup scripts to produce a consistent, timestamped, compressed pg_dump plus
   a manifest recording schema version, row counts per table, and a checksum.
2. Add scripts/verify-restore.sh: restore the newest backup into a scratch database, apply
   migrations, run row-count and checksum assertions against the manifest, run a smoke query
   set, then drop the scratch database. Exit non-zero on any mismatch.
3. Add a weekly scheduled CI job that creates a seeded database, backs it up, restores it,
   and verifies — proving the whole path works on every dependency update.
4. Document in docs/DEPLOYMENT.md: RPO/RTO targets, the exact restore runbook, how to
   restore protected files alongside the database, and the master-key recovery procedure.
   State explicitly that losing KEYFORGE_MASTER_KEY makes encrypted signing keys
   unrecoverable and that it must be backed up separately.
5. Add object-storage backup guidance for the S3 driver (versioning + lifecycle rules).

DONE WHEN
- verify-restore.sh passes locally and in CI.
- The runbook has been executed by a human once, end to end, and any gap found is fixed.
- The weekly CI job is green.
```

---

### KF-18 · Dashboards and alerts

**Depends:** KF-13 · **Size:** M

```
Turn the KF-13 telemetry into something an on-call human can act on.

BUILD
1. Ship dashboards as code (Grafana JSON in deploy/observability/):
   - Service health: request rate, error rate, latency p50/p95/p99 by route
   - Authentication: activation/login/register success and failure by error code
   - Abuse: rate-limit trips, auth failure spikes, access-rule denials
   - Async: queue depth, job latency, failure rate, dead-letter count
   - Data: DB pool saturation, slow queries, table growth by retention target
2. Alert rules with explicit thresholds and a documented rationale for each:
   - 5xx rate > 1% over 5m (page)
   - activate p99 > 2s over 10m (page)
   - readiness failing on any instance > 2m (page)
   - queue depth growing 15m consecutively (ticket)
   - auth failure rate > 3× the 7-day baseline (ticket — possible credential attack)
   - dead-letter count > 0 (ticket)
   - backup job failed or verify-restore failed (page)
3. Write docs/RUNBOOK.md: one section per alert with symptom, likely causes, diagnostic
   queries, and remediation steps. An alert without a runbook entry is not finished.
4. Add a synthetic probe hitting activate + heartbeat against a canary application every
   60s, alerting on failure or latency regression.

DONE WHEN
- Dashboards import cleanly from the committed JSON.
- Every alert has a runbook section.
- The synthetic probe runs and has been verified to fire by breaking something deliberately.
```

---

# PHASE 3 — Account lifecycle

---

### KF-19 · Admin account recovery

**Depends:** KF-01 · **Fixes:** P0-6 · **Size:** M

```
There is no password reset for administrators. A locked-out owner needs direct database
access to recover. This is disqualifying for a paying customer.

BUILD
1. Password reset: POST request with an email, always returning the same response whether
   or not the account exists (no enumeration). Store only a hash of a single-use token with
   a 15-minute expiry (mirror the AdminEmailOtpChallenge pattern already in src/lib/
   admin-email-otp.ts). On successful reset: rotate the password hash, delete every
   AdminSession for that user, write an audit event, and email a confirmation to the old
   address.
2. Recovery codes: 10 single-use codes generated at TOTP enrolment, shown exactly once,
   stored as Argon2id hashes. Accept one in place of a TOTP code. Show remaining count in
   the account UI and allow regeneration (which invalidates the old set).
3. Break-glass: scripts/recover-owner.ts, runnable only with direct server access, which
   resets the owner's password and clears MFA. It must print a loud warning, require an
   explicit --confirm flag, and write an audit event marked as break-glass.
4. Rate-limit reset requests per email and per IP (KF-01's limiter). Cap outstanding
   challenges per account.
5. Handle the no-SMTP case explicitly: if email delivery is unconfigured, the reset
   endpoint must say so clearly in the server logs and the UI must direct the operator to
   the break-glass script rather than silently failing.

DONE WHEN
- Full reset flow works end to end against a test SMTP server.
- A test proves reset tokens are single-use, expire, and invalidate all sessions.
- A test proves the response is identical for existing and non-existent emails.
- The break-glass script is documented in docs/DEPLOYMENT.md and has been run once.
```

---

### KF-20 · End-user email verification and password reset

**Depends:** KF-01 · **Fixes:** P0-6 · **Size:** M

```
Product end users cannot verify an email or reset a password. Every customer of a Keyforge
user will demand this.

BUILD
1. Migration: EndUser.emailVerifiedAt, plus an EndUserToken model (userId, purpose enum
   [VERIFY_EMAIL, RESET_PASSWORD], tokenHash, expiresAt, consumedAt) with the same
   single-use, hashed, expiring pattern used elsewhere.
2. Client API (additive to /api/v1 — do not change existing shapes):
   - POST /api/v1/client/email/verify/request
   - POST /api/v1/client/email/verify/confirm
   - POST /api/v1/client/password/reset/request
   - POST /api/v1/client/password/reset/confirm
   All signed responses, nonce-echoed, rate-limited, enumeration-safe.
3. Portal UI at /portal/[appId]: request and confirm flows for both.
4. Per-application settings: require verified email before login (default off, so existing
   integrations are unaffected), and a customisable email sender name and template.
5. On password reset: revoke all ClientSessions for that user and emit a webhook
   (user.password_reset).
6. Emails are sent through the queue (KF-14), never inline.

DONE WHEN
- Both flows work end to end from the portal.
- Tests prove single-use, expiry, enumeration safety, and session revocation on reset.
- The require-verified-email setting gates login only when enabled.
- No existing /api/v1 response shape changed — proven by the conformance suite.
```

---

### KF-21 · Session and device management UI

**Depends:** KF-07 · **Size:** M

```
Neither admins nor end users can see or revoke their own sessions and devices.

BUILD
1. Admin account page (src/app/dashboard/account/page.tsx): list active AdminSessions with
   created, last seen, IP, user agent, and a current-session marker. Revoke individually or
   revoke all others. Audit every revocation.
2. Application sessions page (src/app/dashboard/apps/[applicationId]/sessions/page.tsx):
   improve the existing view with filtering by license, user, and installation; show
   absolute expiry from KF-07; bulk revoke.
3. Device management: per-license activation list with label, first/last seen, IP, first
   seen date, and per-device revoke. Distinguish revoked from expired clearly.
4. End-user portal: the user's own devices and sessions, with self-service revoke. This is
   the feature that reduces support load more than any other, because "I got a new laptop"
   is the single most common support ticket in this category.
5. Emit webhooks: session.revoked, device.revoked.
6. Every revocation path must take effect on the next heartbeat — add tests proving it.

DONE WHEN
- All four surfaces work and are covered by tests.
- Revocation propagates on the next heartbeat, proven by an integration test.
- Every revocation writes an audit event with the actor.
```

---

### KF-22 · Login hardening

**Depends:** KF-01, KF-02 · **Fixes:** P1-8 · **Size:** M

```
Admin login allows 8 attempts per 15 minutes per (email, IP). With KF-02 done, IP rotation
is harder — but this is still weak for a control plane.

BUILD
1. Progressive delay: after 3 failures for an identity, add an increasing artificial delay
   (0.5s, 1s, 2s, 4s, capped at 8s) before responding. Apply it to both success and failure
   responses at that attempt count so it cannot be used as an oracle.
2. CAPTCHA after N failures: pluggable provider (Turnstile or hCaptcha) behind env vars,
   disabled by default so self-hosters are not forced into a third party. When enabled,
   require a token on admin login and end-user register/login.
3. Account lockout with self-service unlock via the KF-19 email flow — never a permanent
   lock that requires support.
4. New-device and new-location notification emails for admin logins, with a
   "this wasn't me" link that revokes all sessions and forces a password reset.
5. Constant-time behaviour on the login path: a request for a non-existent email must take
   the same time as one for an existing email. Run a dummy Argon2id verify when the user is
   not found. Add a timing test with a generous but meaningful threshold.
6. Show the last successful login time and IP on the dashboard after sign-in.

DONE WHEN
- A test proves the timing difference between existing and non-existent accounts is within
  the threshold.
- Progressive delay and lockout are covered by tests.
- CAPTCHA is fully optional and the app works identically with it disabled.
```

---

# PHASE 4 — KeyAuth parity

---

### KF-23 · Access rules: CIDR, country, ASN, VPN detection

**Depends:** KF-06 · **Size:** M

```
KeyAuth supports region blocking; Keyforge supports only exact-value rules on IP,
installation, username, and license.

BUILD
1. Extend AccessRuleSubject with IP_RANGE, COUNTRY, ASN, and NETWORK_TYPE.
   IP_RANGE stores a CIDR (not a hash — ranges must be range-matched, so store it in
   cleartext and document that this is deliberate and why it differs from exact-value rules,
   which stay hashed).
2. Add a pluggable IP intelligence provider interface (src/lib/ip-intel.ts) with:
   - MaxMind GeoLite2 local database (default, no external calls, self-hoster friendly)
   - an optional commercial provider for VPN/proxy/datacenter/Tor detection
   Cache lookups in Redis with a long TTL.
3. Evaluate ranges efficiently: load CIDR rules per application into an in-memory radix
   trie cached with a short TTL and invalidated on write. Do not query per request.
4. Preserve exact DENY-then-ALLOW precedence across all subject types.
5. Dashboard: a rule builder with country multi-select, CIDR validation, network-type
   toggles, an expiry field, and a "test this context" evaluator showing which rule matched.
6. Ship the GeoLite2 database as an optional download with a documented update job — do not
   commit it.

DONE WHEN
- All new subject types are enforced and tested, including precedence interactions.
- CIDR matching is correct for IPv4 and IPv6 edge cases (/0, /32, /128, mapped addresses).
- Benchmark: 10,000 CIDR rules add no measurable authentication latency.
- The app works fully with no IP intelligence provider configured.
```

---

### KF-24 · Session-hijack detection

**Depends:** KF-23 · **Size:** M

```
A stolen session token is currently usable from anywhere with no signal.

BUILD
1. Record the IP and derived country/ASN on ClientSession creation. On each heartbeat,
   compare against the current request.
2. Detect and score: country change mid-session; ASN change; impossible travel (distance
   over elapsed time exceeding a configurable threshold); network-type change
   (residential -> datacenter).
3. Per-application configurable response ladder: observe (log only), alert (webhook),
   require re-authentication (return a distinct error code the SDK handles), or revoke.
   Default to observe. Never revoke by default.
4. Emit session.anomaly webhooks carrying the signal type and evidence.
5. Surface anomalies in the sessions dashboard with the evidence that produced them.
6. Document the false-positive modes prominently: mobile network handoff, corporate VPN,
   travel, and CGNAT all produce these signals from honest users.

DONE WHEN
- Each signal type has a test with a synthetic session.
- The response ladder is configurable per application and defaults to observe.
- False-positive modes are documented in docs/API.md and the dashboard help text.
```

---

### KF-25 · Client application logs

**Depends:** KF-14 · **Size:** M

```
KeyAuth has client-pushed application logs; Keyforge has none.

BUILD
1. Migration: ApplicationLog (applicationId, userId?, licenseId?, activationId?, level,
   message, metadata Json, ipAddress, createdAt) with indexes for time-range and
   application filtering. Consider partitioning by month given expected volume.
2. POST /api/v1/client/log — session-authenticated, signed response, aggressively
   rate-limited per session, message capped at 2000 chars, metadata capped in size and
   depth. Batch submission (up to 50 entries) to avoid chattiness.
3. Writes go through the queue (KF-14) — never block the client.
4. Dashboard: a searchable log view with filters for level, user, license, time range, and
   full-text search on the message. Cursor pagination.
5. Retention: default 30 days, configurable, enforced by the KF-16 retention job.
6. Redact aggressively on ingest — reuse src/lib/redact.ts. Customers WILL log secrets by
   accident; make that safe by default and say so in the docs.

DONE WHEN
- Batch submission works and is rate-limited.
- The dashboard view handles 1M rows with acceptable latency (measure and state it).
- A test proves a submitted log line containing a token-shaped string is redacted at rest.
```

---

### KF-26 · Subscription tiers

**Depends:** none · **Size:** M

```
Plans exist but are unordered, so "pro or better" cannot be expressed.

BUILD
1. Add Plan.tier (integer, default 0) and Plan.tierName. Enforce uniqueness of tier per
   application. Ordering enables >= comparisons.
2. Upgrade/downgrade API and dashboard action: change a user's subscription plan with a
   documented proration policy hook (a function that computes the new expiry, with
   strategies: keep-expiry, extend-proportionally, reset). Emit
   subscription.upgraded / subscription.downgraded webhooks.
3. Multiple concurrent subscriptions already exist (UserSubscription). Define and document
   effective-entitlement resolution when they overlap: highest tier wins, and for quota-type
   entitlements the values sum. Implement it in one place so KF-36 can build on it.
4. Update the client session payload to include the effective tier — additive field only.
5. Dashboard: plan ordering UI with drag-to-reorder, and a preview of which users are
   affected by a tier change before it is applied.

DONE WHEN
- Tier comparison works in entitlement checks.
- Upgrade/downgrade with each proration strategy is tested.
- Overlapping-subscription resolution is documented and tested.
- No existing client payload field changed shape.
```

---

### KF-27 · Full customer portal

**Depends:** KF-20, KF-21 · **Size:** L

```
/portal/[appId] is basic. Make it a self-service surface that removes support load.

BUILD
1. Account: profile, email change with re-verification, password change, TOTP enrol/disable,
   passkey add/remove/rename, recovery codes.
2. Devices: list activations with label, last seen, and location; self-service revoke with a
   configurable per-period limit (per application) so it cannot be abused to defeat device
   limits. Make the limit visible to the user.
3. Subscriptions: current plan, tier, expiry, history, and a redeem-a-license-key form to
   extend or upgrade.
4. Downloads: entitlement-filtered protected files with sizes and SHA-256 hashes displayed.
5. Support: a link-out or a simple contact form, configurable per application.
6. Branding: per-application logo, colour, product name, and support URL, so the portal
   looks like the customer's product and not like Keyforge.
7. Fully responsive, keyboard-navigable, and WCAG 2.1 AA. Respect prefers-reduced-motion
   and prefers-color-scheme.
8. Portal sessions are separate from client sessions and must not be usable against
   /api/v1/client endpoints. Verify this with a test.

DONE WHEN
- Every listed surface works end to end.
- Branding is configurable per application and applied.
- An accessibility audit passes at AA.
- A test proves portal session tokens are rejected by the client API.
```

---

### KF-28 · Bulk operations and cursor pagination

**Depends:** none · **Fixes:** P2 pagination · **Size:** M

```
No list endpoint paginates properly (take: limit, capped at 100, no cursor), and there are
no bulk operations. Both block real-scale use.

BUILD
1. Cursor pagination on every list endpoint (seller API and dashboard): opaque cursor,
   configurable page size with a hard cap, stable ordering with a tiebreaker on id, and a
   nextCursor in the response. Keep the existing response shape working — add fields, do not
   change them.
2. Bulk operations, all transactional, audited, and idempotent (reuse KF-07's
   Idempotency-Key):
   - bulk license status change (revoke/suspend/reactivate) by filter or id list
   - bulk device reset
   - bulk user status change
   Cap batch size and run large batches through the queue with progress reporting.
3. CSV export for licenses, users, subscriptions, and audit events. Generate through the
   queue, deliver via a time-limited signed download URL. Never build a large export in a
   request handler.
4. CSV import for licenses (pre-generated keys) and users, with a dry-run mode that reports
   what would change before anything is written.
5. Dashboard: multi-select with a bulk action bar, a confirmation dialog stating exactly how
   many records are affected, and a progress view for queued batches.

DONE WHEN
- Pagination is stable across concurrent inserts (test it).
- Bulk operations are transactional and audited, with one audit event per affected record.
- A 100,000-row export completes without exhausting memory.
- Import dry-run accurately predicts the result.
```

---

### KF-29 · Dashboard analytics

**Depends:** KF-13 · **Size:** M

```
The dashboard shows current state but no trends. Operators cannot see whether things are
getting better or worse.

BUILD
1. Add a rollup table (DailyApplicationStat) populated by a queue job: activations, unique
   active installations, new users, new licenses, revocations, failed authentications,
   sessions created, by application and day. Do not compute charts from raw tables at read
   time.
2. Dashboard views per application:
   - Activations and active installations over time
   - Daily/monthly active installations
   - License lifecycle funnel: issued -> activated -> active -> expired/revoked
   - Failed authentication reasons, broken down by error code
   - Geographic distribution (requires KF-23)
   - Plan and tier distribution
3. Organization-level rollup across applications.
4. Date-range selection, comparison against the previous period, and CSV export of any chart's
   underlying data.
5. Charts must be readable in both light and dark themes, have accessible colour contrast,
   and degrade to a data table for screen readers. Do not use colour alone to encode meaning.
6. Backfill the rollup table from existing data on first deploy.

DONE WHEN
- Charts render from rollups, not raw scans — verify the query plan.
- Backfill completes on a dataset with 1M activations.
- Every chart has an accessible table equivalent.
```

---

### KF-30 · Discord bot

**Depends:** KF-31 · **Size:** M

```
KeyAuth's Discord integration is a real distribution advantage in its market. Match it.

BUILD
1. A separate deployable service (apps/discord-bot or a sibling package) using the generated
   SDK from KF-33 — it must not import Keyforge internals or touch the database directly.
2. Slash commands, all permission-gated by Discord role:
   /license lookup <key>       - masked status, plan, expiry, device count
   /license issue <plan> <n>   - issue keys, DM the result, never post in channel
   /license revoke <key>       - revoke with a required reason
   /user lookup <username>     - status, plan, last login
   /stats                      - application summary
3. Authentication: a per-guild scoped API key stored encrypted, configured through the
   Keyforge dashboard, with an explicit guild-to-application binding.
4. Every mutating command writes an audit event recording the Discord user id and guild id
   as the actor context.
5. Never post a full license key in a channel. DM only, and say so in the command response.
6. Rate-limit per guild and per user.

DONE WHEN
- All commands work against a test guild.
- Permission gating is enforced and tested.
- No secret or full license key can reach a public channel — prove it with a test.
- The bot is optional and deployable independently.
```

---

# PHASE 5 — Differentiation

> From `DIFFERENTIATION-PLAN.md`. Do not start before Phases 0–3 are complete.

---

### KF-31 · OpenAPI 3.1 specification

**Depends:** KF-12 · **Stage:** D0 · **Size:** L

```
Create an OpenAPI 3.1 spec as the single source of truth for the API. Generated SDKs,
generated docs, and the conformance suite all depend on it.

BUILD
1. openapi/keyforge.yaml covering every endpoint under /api/v1/client and /api/v1/admin.
   Document /api/1.3 separately as legacy — do not model the KeyAuth shape in OpenAPI.
2. Derive schemas from the existing Zod schemas where possible. Add a build step that
   generates OpenAPI components from src/lib/client-schemas.ts so the spec cannot drift from
   validation. If a Zod-to-OpenAPI conversion is used, pin it and test the output.
3. Document for every endpoint: auth scheme, all request fields, all response shapes, EVERY
   error code with its meaning and remediation, rate limits, and idempotency support.
4. Add a CI check that fails if a route exists without a spec entry, or a spec entry exists
   without a route.
5. Add contract tests: for each endpoint, assert real responses validate against the spec
   schema. This is what stops the spec from becoming a lie.
6. Generate and publish reference docs from the spec (Scalar or Redoc), served at /docs/api,
   with runnable examples.
7. Version the spec alongside the API. /api/v1 is frozen — the spec documents it, it does
   not redefine it.

DONE WHEN
- The spec validates against the OpenAPI 3.1 meta-schema.
- Contract tests pass for every endpoint against real responses.
- CI fails on a route/spec mismatch.
- The rendered docs site is live and examples execute successfully.
```

---

### KF-32 · `keyforge dev` and CLI init

**Depends:** KF-31 · **Stage:** D1 · **Size:** L

```
Build the developer experience that no competitor offers: integrate before you sign up.

BUILD
1. A new package (packages/cli, published as @keyforge/cli) with:

   keyforge dev
     - Starts a local mock license authority on a chosen port.
     - Deterministic Ed25519 keys derived from a fixed seed, so test fixtures are stable.
     - No database and no account required — everything in memory, seeded from a config file.
     - Seeds licenses in every state: unused, active, expired, revoked, suspended,
       device-limited.
     - Implements the full /api/v1/client surface with correct signing, so an SDK cannot
       tell it apart from production.
     - Control endpoints for testing: force a license into any state, expire a session,
       trip a device limit, simulate latency, simulate a 500, simulate an offline network.
     - Request log printed to the console in a readable format.

   keyforge init
     - Detects the project language.
     - Authenticates against a real Keyforge instance (or offers --local for dev mode).
     - Creates an application, generates keys, writes config, prints a working snippet.
     - Runs a live verification round trip and prints a clear success or failure.

   keyforge login / apps / licenses / logs   - everyday operations against a real instance.

2. Target: zero to a verified activation in under five minutes. Time it and state the number
   in the README.
3. Instrument the funnel: track (with explicit opt-in telemetry, off by default) how long
   init-to-first-activation takes. Treat regressions as bugs.

DONE WHEN
- keyforge dev runs with no account, no database, and no network.
- All five existing SDKs work against it unmodified.
- The full test matrix (expired, revoked, device-limited, offline) is reachable via control
  endpoints.
- A new developer reaches a verified activation in under five minutes — measured with a real
  person, not estimated.
```

---

### KF-33 · Generated SDKs

**Depends:** KF-31 · **Stage:** D1 · **Size:** L

```
Five hand-written SDKs will drift. Generate the transport layer; hand-write only crypto.

BUILD
1. Generate transport/model code from openapi/keyforge.yaml for: TypeScript, Python, C#,
   Java, C++, Rust, Go, PHP, Swift, Kotlin. Use openapi-generator or a per-language
   equivalent — justify the choice.
2. Hand-write ONLY the verification layer per language, implementing the published contract:
   verify Ed25519 signature -> check keyId against pinned keys -> confirm signedPayload
   decodes to canonicalJson(data) -> check the echoed nonce -> fail closed.
   Keep this layer small, auditable, and identical in behaviour across languages.
3. Preserve the existing five SDKs' public APIs where reasonable. Where a break is
   unavoidable, ship a major version with a migration note — customers have compiled
   binaries and cannot be surprised.
4. Per SDK: README with a five-minute quickstart, a runnable example, and installation via
   the language's standard package manager.
5. CI: build and test every SDK, run the KF-11 conformance suite against all of them, and
   publish to package registries on tagged release.
6. Do not commit generated output. Generate in CI. Remove the currently committed
   sdk/csharp/bin, sdk/csharp/obj, and __pycache__ directories and gitignore them.

DONE WHEN
- All ten SDKs generate, build, and pass the conformance suite in CI.
- Regenerating produces no diff when the spec is unchanged.
- Each SDK publishes to its registry from a tagged release.
- No generated artifacts are committed.
```

---

### KF-34 · Transparency log

**Depends:** none · **Stage:** D2 · **Size:** L

```
Make the audit log independently verifiable. No competitor in this category has this.

Design deliberately conventional — RFC 6962 (Certificate Transparency) style. Do not invent
a scheme, and do not use a blockchain.

BUILD
1. Migration: AuditEvent gains seq BIGSERIAL, leafHash BYTEA, treeSize BIGINT.
   Leaf = SHA-256(0x00 || canonicalJson(event)) using the existing canonicalJson from
   src/lib/crypto.ts.
2. src/lib/merkle.ts: incremental Merkle tree with inclusion and consistency proofs.
   Pure, dependency-free, exhaustively unit-tested against known RFC 6962 vectors.
3. Signed Tree Head published every 60 seconds by a queue job: {treeSize, rootHash,
   timestamp}, signed with a dedicated organization-level Ed25519 log key, separate from
   application signing keys and separately rotatable.
4. Endpoints:
   GET /.well-known/keyforge-log/sth
   GET /api/v1/log/proof/inclusion?leaf=<hash>&size=<n>
   GET /api/v1/log/proof/consistency?from=<n>&to=<m>
   GET /api/v1/log/entries?start=&end=       (paginated, for auditors)
   All public and cacheable — the log's value depends on anyone being able to check it.
5. External anchoring: publish each hourly STH hash to a location outside the server's
   control (a public Git repository by default, configurable). Without this, the log proves
   internal consistency but not that history was not rewritten wholesale. Document that
   distinction honestly.
6. Enforce append-only at the database level: a trigger rejecting UPDATE and DELETE on
   AuditEvent. Today it is append-only by convention only.
7. Dashboard: an audit view showing each event's sequence number and a "verify" action
   returning the inclusion proof.

DONE WHEN
- Merkle implementation passes RFC 6962 test vectors.
- Inclusion and consistency proofs verify for randomly chosen events across 100k entries.
- The database trigger blocks UPDATE and DELETE — proven by a test.
- External anchoring publishes and is retrievable.
- Proof endpoints stay under 100ms at 1M entries.
```

---

### KF-35 · `keyforge-verify` CLI

**Depends:** KF-34 · **Stage:** D2 · **Size:** M

```
Ship an independent verifier. It must be obviously not colluding with the server — that is
the entire point.

BUILD
1. A SEPARATE repository and package (keyforge-verify), with no dependency on the Keyforge
   codebase. Reimplement Merkle verification from the specification, not by importing
   src/lib/merkle.ts. An independent implementation is what makes the verification
   meaningful.
2. Commands:
   keyforge-verify sth <url>                          - fetch and verify signature
   keyforge-verify inclusion <url> <event-file>       - verify an event is in the log
   keyforge-verify consistency <url> --from --to      - verify append-only between heads
   keyforge-verify monitor <url> --interval           - poll, store STH history, alert on
                                                        any consistency violation
   keyforge-verify anchor <url> <anchor-url>          - verify STHs match external anchors
   Exit non-zero on any verification failure.
3. Ship a single static binary per platform (Go or Rust) so running it requires no toolchain.
4. Document the verification protocol fully in the repo, so a third party could write their
   own verifier from the document alone.
5. Include a deliberately tampered log fixture in the test suite and prove the tool detects
   it.

DONE WHEN
- The tool verifies a real Keyforge log and rejects a tampered fixture.
- It shares no code with the Keyforge repository.
- Static binaries build for Linux, macOS, and Windows.
- The protocol document is complete enough for an independent reimplementation.
```

---

### KF-36 · Entitlements as policy-as-code

**Depends:** none · **Stage:** D3 · **Size:** L

```
Plan.entitlements is a JSON bag. Turn it into a typed entitlement system with policies.
This is what makes Keyforge an entitlement platform rather than a license server.

BUILD
1. Migration: a Feature model per application (key, name, type, defaultValue, description)
   with types: boolean, limit (max concurrent value), quota (N per period with a reset rule),
   tier (ordered enum), config (typed scalar).
   A PlanFeature model binding plan -> feature -> value -> optional policy expression.
   Keep Plan.entitlements working, populated from the new model, so no existing client breaks.
2. Policy expressions in CEL (Common Expression Language). DO NOT invent a language. Use an
   existing CEL implementation, sandboxed, with an execution timeout and no I/O.
   Evaluation context: license, plan, subscription(s), user, installation, request time.
   Example: license.plan.tier >= "pro" && subscription.status == "ACTIVE"
3. src/lib/entitlements.ts — one evaluation engine used by every caller: the client API,
   offline grants (KF-38), and the dashboard preview. Exactly one implementation, so a
   policy can never mean two different things.
4. POST /api/v1/client/entitlements/evaluate — signed, returns all evaluated entitlements
   with values and the reason each resolved as it did.
5. Overlapping subscriptions resolve per KF-26: highest tier wins; quota values sum.
6. Dashboard: a feature editor, a policy editor with syntax checking, a live evaluator
   ("test this policy against this license"), and a diff view showing which licenses change
   outcome before publishing. Publishing a policy is an audited event.

DONE WHEN
- All five feature types evaluate correctly, with tests for each.
- CEL evaluation is sandboxed with an enforced timeout — proven with a hostile expression.
- Existing Plan.entitlements consumers are unaffected.
- The dashboard diff view accurately predicts affected licenses.
```

---

### KF-37 · Usage metering

**Depends:** KF-36 · **Stage:** D3 · **Size:** M

```
Quota entitlements need usage tracking. Usage tracking is also the input to usage-based
pricing, which is where this market is heading.

BUILD
1. Migration: UsageRecord (applicationId, licenseId, userId?, featureKey, quantity,
   idempotencyKey, occurredAt, periodKey) plus a UsageAggregate rollup by
   (license, feature, period). Unique on (applicationId, idempotencyKey).
2. POST /api/v1/client/usage — session-authenticated, signed, batched (up to 100 records),
   REQUIRES an idempotency key per record. Clients retry; double-counting a customer's quota
   is unacceptable.
3. Quota enforcement in the KF-36 engine: reading a quota entitlement returns limit, used,
   and remaining. Configurable behaviour at limit: block, allow-and-flag, or allow-and-bill.
4. Period handling: calendar month, rolling 30 days, or billing-cycle-aligned. Reset via a
   queue job. Handle timezones explicitly and document the choice.
5. Aggregation runs on the queue, not at read time.
6. Dashboard: usage per license and per feature over time, with over-limit highlighting.
7. Webhooks: usage.threshold_reached at configurable percentages (80%, 100%).

DONE WHEN
- Duplicate idempotency keys never double-count — proven under concurrent submission.
- Quota reads are fast at 10M usage records (measure and state it).
- Period reset is correct across month boundaries and DST transitions.
```

---

### KF-38 · Offline grants

**Depends:** KF-36 · **Stage:** D4 · **Size:** L

```
Compile evaluated entitlements into short-lived signed grants that verify with zero network.

BUILD
1. Format: COSE_Sign1 (RFC 9052) over a CBOR payload, serialised as
   kfg1.<base64url payload>.<base64url signature>
   Payload: v (version), kid (signing key id), aid (application public id), lid (license id),
   iid (installation binding, 32-byte keyed hash), iat, nbf, exp, ent (fully evaluated
   entitlements), ph (policy hash), re (revocation epoch).
2. Entitlements are evaluated SERVER-SIDE and embedded as decided values. The client never
   runs policy logic — this removes an entire class of client-side bypass. Non-negotiable.
3. Installation-bound: a grant lifted to another machine fails verification.
4. Configurable per application: TTL (default 7 days, range 1 hour to 90 days) and grace
   window (default 3 days) during which an expired grant still functions in a degraded mode
   the customer defines.
5. POST /api/v1/client/grant — issue; POST /api/v1/client/grant/refresh — renew before
   expiry using a valid session or an unexpired grant.
6. Clock handling: tolerate configurable skew; cross-check the monotonic clock; report
   backwards movement as an integrity signal (feeds KF-40) rather than treating it as an
   exploit path.
7. SDK verification in all ten languages (KF-33): parse COSE -> verify signature against the
   pinned public key -> check kid -> check exp/nbf with skew -> check installation binding ->
   check the cached revocation set (KF-39) -> fail closed on signature failure, and
   configurably on staleness.
8. Document the availability/revocation tradeoff plainly in docs/API.md. Do not hide it.

DONE WHEN
- A grant verifies fully offline in all ten SDKs, with the network disabled.
- A grant from machine A fails on machine B.
- Expiry, grace, and skew tolerance behave as specified, with tests.
- Grant size stays under 2 KB for a typical entitlement set — measure and state it.
- The tradeoff is documented.
```

---

### KF-39 · CDN revocation sets

**Depends:** KF-38 · **Stage:** D4 · **Size:** L

```
Solve the offline-revocation problem properly. Nobody in this category ships this.

Approach: CRLite-style cascading Bloom filters — zero false negatives (a revoked license is
NEVER wrongly allowed), with a small false-positive rate resolved by one online check.

BUILD
1. src/lib/revocation-set.ts: build a cascading Bloom filter over revoked license ids for an
   application. Zero false negatives is a correctness requirement, not a target — assert it
   in tests over the full revoked set on every build.
2. Queue job rebuilding the set on revocation (debounced) and on a schedule. Increment the
   epoch each build. Sign the serialised set with the application's signing key.
3. Publish at a stable, cacheable, CDN-friendly URL:
   GET /api/v1/client/revocations/<appId>?epoch=<n>
   with strong ETag and Cache-Control. Support delta updates between adjacent epochs.
4. SDK integration: fetch opportunistically whenever a network is available, cache locally
   with the epoch, verify the signature before use, check every grant against the cached set,
   and treat a Bloom hit as "check online" rather than "revoked" — never revoke on a
   probabilistic hit alone.
5. Target size: under 100 KB for one million licenses with a 1% false-positive rate. Measure
   at 10k, 100k, and 1M and publish the numbers.
6. Staleness policy: configurable maximum set age before the SDK degrades or requires an
   online check.

DONE WHEN
- Zero false negatives verified over the complete revoked set at every tested scale.
- Size targets met and published.
- A revoked license is rejected by a fully offline SDK within one set-refresh interval.
- Delta updates work and are smaller than full downloads.
- The signature on the set is verified before the SDK trusts it.
```

---

### KF-40 · Integrity signal collection

**Depends:** KF-38 · **Stage:** D5 · **Size:** L

```
The commercial moat. Everyone accepts binaries get patched; nobody sells the consequence —
instrument it.

READ FIRST: docs/DIFFERENTIATION-PLAN.md, Pillar 1. The design constraints there are
requirements, not suggestions.

BUILD
1. Signed monotonic counters. Activation.installationPublicKey already exists and is
   currently stored but unused. Have the SDK sign each heartbeat with the installation key,
   including an incrementing counter. Server tracks the high-water mark and detects:
   counter regression (VM snapshot restore, cloned install), counter jumps (concurrent use
   of one identity), and stalled counters with live sessions (response replay).
2. Honeypot entitlements. Features the real SDK never requests. A patched client that
   force-enables everything will request them. Near-zero false positives — this is the
   highest-confidence signal available. The honeypot set must not be discoverable from the
   public API or any client-visible response.
3. Build-hash attestation. BuildArtifact already stores per-platform SHA-256. Have the SDK
   report the hash of its loaded image. Track the POPULATION of unknown hashes: one is
   noise; four hundred identical unknown hashes is a cracked build in circulation with a
   fingerprint and a first-seen date.
4. Clock manipulation: client time vs server time, plus monotonic cross-check from KF-38.
   Systematic backwards drift near expiry boundaries is trial-reset behaviour.
5. Activation-graph anomalies: one installation across many licenses; one license across
   impossible session geography; registration bursts sharing infrastructure signals; a
   license whose pattern diverges sharply from its plan's population baseline.
6. Nonce-replay detection: nonces are already echoed in signed responses. Track reuse per
   installation — a local proxy replaying a captured success is detectable because the nonce
   will not advance.
7. Migration: IntegritySignal (applicationId, licenseId?, activationId?, signalType,
   severity, evidence Json, createdAt) and IntegrityScore (subject, score, contributing
   signals, updatedAt). Ingest through the queue, never inline.

DATA MINIMISATION — REQUIRED
Collect integrity signals only. No file paths, no process lists, no screenshots, no
keystroke data, no user behaviour. Publish every transmitted field in docs/API.md. The SDK
is open source so this is verifiable rather than asserted. This line is what separates a
licensing SDK from spyware; a violation of it is a critical defect, not a feature request.

DONE WHEN
- Each signal type is detected and tested with a synthetic scenario.
- The honeypot set is not discoverable from any client-visible surface — prove it.
- Signal ingestion adds no measurable latency to heartbeat.
- The complete transmitted field list is documented.
- A test asserts no field outside that documented list is ever collected.
```

---

### KF-41 · Integrity dashboard and response ladder

**Depends:** KF-40 · **Stage:** D5 · **Size:** L

```
Turn raw signals into something an operator can act on without burning honest customers.

BUILD
1. Scoring: weighted combination of KF-40 signals into a risk score per installation and per
   license. Every score MUST be explainable — show the contributing signals with their
   evidence and weight. No opaque numbers. If you cannot show why, do not show the score.
2. Integrity dashboard tab:
   - Risk-ranked installations and licenses with the evidence inline
   - Population view: unknown build hashes with install counts, first-seen dates, and a
     spread curve, so a cracked build becomes a tracked object
   - Signal timeline per installation
   - Filters by signal type, severity, and time range
3. Response ladder, configurable per application PER SIGNAL TYPE:
   observe -> alert -> degrade entitlements -> require re-authentication -> revoke.
   DEFAULT TO OBSERVE FOR EVERY SIGNAL. Automated revocation must be explicitly enabled per
   signal, with a confirmation dialog stating the false-positive modes for that signal.
4. Webhooks: integrity.signal, integrity.score_changed, integrity.action_taken.
5. Documentation, prominent and customer-facing: the false-positive modes for every signal.
   VMs, disk cloning, corporate imaging, system restore, and dual-boot all produce these
   signals from entirely honest users. State it plainly in the dashboard help text, not only
   in the docs.
6. An appeal path: mark an installation as reviewed-and-trusted, suppressing future signals
   for it with an audited reason.

DONE WHEN
- Every score displays its contributing evidence.
- Every automated response defaults to off and requires explicit per-signal opt-in.
- False-positive modes appear in the UI at the point of enabling enforcement, not buried.
- The trusted-installation suppression path works and is audited.
```

---

### KF-42 · KeyAuth migration wedge

**Depends:** KF-31 · **Stage:** D6 · **Size:** L

```
The fastest growth lever available. KeyAuth has a large, captive, unhappy user base, and
/api/1.3 already lets them switch endpoints without recompiling their product.

BUILD
1. keyforge migrate keyauth (in the KF-32 CLI):
   - Connects to a KeyAuth deployment (seller API and/or a database dump).
   - Imports applications, users, licenses, subscriptions, variables, files, chat channels,
     and blacklists.
   - Maps KeyAuth concepts to Keyforge: subscription levels -> plans and tiers, HWID ->
     installation id, blacklist -> access rules.
   - Preserves license keys where possible so existing customers are not disrupted; where
     format prevents it, generates a mapping table and a customer-notification export.
   - Dry-run mode by default. Nothing writes without --confirm.
   - A full report: imported, skipped, and why.
2. Dual-run mode: Keyforge shadows a live KeyAuth deployment, mirrors state changes, and
   reports divergence — so a customer can verify correctness before cutting over.
3. A published compatibility matrix in docs/: every KeyAuth API call, its Keyforge status
   (supported / intentionally unsupported / superseded), and what to use instead. Be honest
   about gaps — a discovered gap after migration costs more trust than a documented one.
4. docs/MIGRATING-FROM-KEYAUTH.md framed by outcome: "your existing binaries keep working,
   change one URL, here is what you gain, here is what changes."
5. A rollback path: exports back out, so migration is not a one-way door. Say so prominently
   — reversibility is what makes people willing to try.

DONE WHEN
- A full migration from a seeded KeyAuth instance completes and verifies.
- Dry-run accurately predicts the outcome.
- Dual-run detects an injected divergence.
- The compatibility matrix covers every /api/1.3 type the adapter handles.
- Rollback export has been tested.
```

---

### KF-43 · Adversarial conformance suite (public)

**Depends:** KF-33, KF-38 · **Stage:** D6 · **Size:** M

```
Extend KF-11 into a public, adversarial test suite covering the full trust surface. The
claim "the only licensing SDKs with a published adversarial test suite" is not copyable
without doing the work.

BUILD
1. A public repository (keyforge-conformance) with vectors covering:
   - all KF-11 response-signature cases
   - offline grants: forged signature, wrong kid, expired, not-yet-valid, wrong installation
     binding, truncated CBOR, malformed COSE, downgraded algorithm, policy-hash mismatch
   - revocation sets: unsigned, wrongly signed, stale epoch, tampered filter
   - replay: reused nonce, replayed response, replayed grant
   - clock: skewed forward, skewed backward, non-monotonic
   - protocol: unexpected fields, missing fields, type confusion, oversized payloads,
     deeply nested JSON
2. Runners for all ten SDKs, emitting a machine-readable result per vector.
3. A published pass/fail matrix, updated on every release, linked from the docs site.
4. CI gate: no SDK ships with a failing vector.
5. An open contribution process for new vectors, including from security researchers. Credit
   contributors.
6. Document the threat model each vector class defends against, so the suite reads as
   reasoning rather than a list.

DONE WHEN
- All ten SDKs pass all vectors.
- The public matrix is live and automatically updated.
- Adding a vector requires no per-language change.
- The threat-model mapping is documented.
```

---

### KF-44 · MITM comparison demo

**Depends:** none · **Stage:** D6 · **Size:** S

```
The single most persuasive asset available. It works against the CURRENT code and takes
about a day.

BUILD
1. demo/mitm/ — a reproducible harness:
   - A local intercepting proxy returning a forged success response.
   - A sample client integrated with Keyforge, and an equivalent integrated with a
     KeyAuth-compatible endpoint (use the /api/1.3 adapter with signature verification
     disabled to represent the unsigned case — do NOT attack a live third-party service).
   - Run both through the proxy. The unsigned client accepts the forged response and
     unlocks. The Keyforge client rejects it on signature verification and refuses.
2. A scripted 30-second recording with clear on-screen output showing exactly what happened.
3. A written walkthrough explaining the mechanism: why signing plus a nonce defeats this,
   and — stated plainly — what it does NOT defeat (a patched binary that skips verification
   entirely). Overclaiming here would undermine the honesty positioning that the whole
   product rests on.
4. Fully reproducible by a reader in under ten minutes from the repo.

ETHICAL BOUNDARY
Demonstrate against your own instances only. Do not attack, probe, or record any live
third-party service. The comparison is between architectures, illustrated locally — not an
attack on a competitor's production system.

DONE WHEN
- The demo runs reproducibly from a clean checkout.
- The recording is under 60 seconds and legible without narration.
- The walkthrough states the limitation as clearly as the capability.
```

---

# PHASE 6 — Commercial

---

### KF-45 · Multi-organization hardening

**Depends:** none · **Size:** L

```
Organizations exist in the schema, but requireAdmin() (src/lib/auth.ts:98) takes
memberships[0] — a single admin effectively has one organization. Multi-tenancy is not real
yet.

BUILD
1. Organization switching: a selector in the dashboard, the active org stored in the session,
   and every query scoped by it. Audit every switch.
2. Rewrite requireAdmin() to resolve the active organization explicitly rather than taking
   the first membership. Find and fix every caller assuming a single org.
3. A tenant-isolation test suite: for every dashboard action and every admin API endpoint,
   prove that a member of org A cannot read or mutate anything in org B. This is the single
   most important test suite in the commercial phase — a leak here ends the business.
4. Per-organization quotas: applications, licenses, users, storage, API requests, log
   retention. Enforced at write time with clear over-quota errors that name the limit and
   how to raise it.
5. Noisy-neighbour protection: per-organization rate limits in addition to per-IP and
   per-principal; per-organization queue concurrency caps.
6. Organization settings: name, slug, billing contact, security defaults (required MFA,
   session length, IP allowlist for the dashboard).
7. Organization deletion with a grace period, a full export first, and irreversible purge
   after — required for GDPR and basic decency.

DONE WHEN
- The isolation suite covers every action and endpoint, with zero cross-tenant leaks.
- Quotas enforce and report clearly.
- Org switching works and is audited.
- Deletion exports, then purges, and is tested.
```

---

### KF-46 · Billing

**Depends:** KF-45, KF-37 · **Size:** L

```
Add Stripe billing. Integrate — do not become a merchant of record.

BUILD
1. Stripe integration: products, prices, subscriptions, customer portal, and tax via Stripe
   Tax. Use Stripe Checkout and the Stripe customer portal rather than building payment UI.
   Never handle card data.
2. Plan model: free, then usage-tiered on the metrics that actually cost you — applications,
   monthly active installations, API requests, storage. Reuse the KF-37 metering pipeline for
   metered components.
3. Webhook handling: signature-verified, idempotent, queued (KF-14), with full reconciliation
   against Stripe as the source of truth for subscription state. Never trust local state
   alone.
4. Entitlement enforcement: over-quota behaviour must degrade gracefully, never abruptly
   break a customer's production licensing. Grace periods, warning emails at 80% and 100%,
   and a hard stop only after explicit notice. A licensing platform that cuts off a paying
   customer's users without warning is worse than no platform.
5. Dunning: retry schedule, warning emails, downgrade-to-free rather than delete, and a
   documented data-retention window after downgrade.
6. Self-hosted deployments must be entirely unaffected — billing code must be behind a flag
   and completely absent from the self-hosted path.

DONE WHEN
- Full lifecycle works against Stripe test mode: signup, upgrade, downgrade, cancel,
  reactivate, failed payment, dunning, recovery.
- Webhooks are idempotent under replay — proven with a test.
- Over-quota degrades gracefully with prior warning.
- Self-hosted runs with no billing code active.
```

---

### KF-47 · Signup, free tier, quotas

**Depends:** KF-46 · **Size:** M

```
There is no signup — only a first-run /setup route. Build the hosted funnel.

BUILD
1. Self-serve signup: email verification, organization creation, and immediate access to a
   free tier. No sales call, no waiting.
2. Free tier sized to be genuinely useful — KeyAuth's free tier is its distribution engine
   and must be matched. Include signed responses in the free tier: that framing alone
   converts security-conscious users, and gating the core security property would contradict
   the entire positioning.
3. Onboarding: a guided path from signup to first verified activation, using the KF-32 CLI.
   Track the funnel and the time-to-first-activation metric.
4. Abuse prevention: email verification required, disposable-domain blocking, per-signup
   rate limits, and a review queue for suspicious patterns. This market attracts abuse —
   plan for it rather than reacting.
5. An acceptable-use policy and enforcement tooling: suspend, warn, and terminate, each
   audited, each with a documented appeal path.
6. Keep /setup working unchanged for self-hosted first-run.

DONE WHEN
- Signup to first verified activation works end to end in under ten minutes.
- Abuse controls are active and tested.
- The free tier's limits are enforced by KF-45 quotas.
- Self-hosted first-run is unaffected.
```

---

### KF-48 · Status page and trust surface

**Depends:** KF-18 · **Size:** M

```
The direct counter to KeyAuth's reputation. In a market defined by broken trust, verifiable
operational honesty is a competitive asset.

BUILD
1. A public status page, hosted independently of the main infrastructure (a status page that
   goes down with the service is worse than none). Per-component status, driven by the KF-18
   synthetic probes, with real historical uptime — not a hand-edited banner.
2. Incident management: a documented process, public incident pages with live updates, and
   published postmortems for anything customer-affecting. Commit to a timeline for
   postmortem publication and meet it.
3. A trust page: security architecture in plain language, the response-signing explanation,
   subprocessor list, data-handling and retention policy, and links to the transparency log
   (KF-34), the verifier (KF-35), and the conformance matrix (KF-43).
4. Publish the KF-49 threat model, including the "what Keyforge cannot protect you from"
   section, prominently rather than buried.
5. Subscribable status notifications: email, RSS, and webhook.
6. Publish real uptime figures. If they are not good, fix the service rather than the page.

DONE WHEN
- The status page is hosted independently and driven by real probes.
- An incident has been run through the full process once as a drill.
- The trust page links to every verifiable artifact.
- Uptime history is real and automatically maintained.
```

---

# PHASE 7 — Assurance

---

### KF-49 · Threat model and security disclosure

**Depends:** none · **Size:** M

```
Publish the reasoning, not just the result. Radical honesty is the positioning.

BUILD
1. docs/THREAT-MODEL.md — STRIDE analysis over the trust boundaries already described in
   docs/ARCHITECTURE.md. For each boundary: assets, adversaries, threats, existing controls,
   residual risk. Be specific; a generic threat model is worse than none.
2. A prominent section titled "What Keyforge cannot protect you from." State plainly: local
   binary patching, memory editing, a user with kernel access, and a determined attacker
   with physical access to the machine. Every competitor implies otherwise, every competent
   buyer knows it is a fiction, and being the one vendor that says it directly is memorable.
3. SECURITY.md: disclosure policy, contact, PGP key, response SLA (acknowledge in 48h,
   triage in 5 days), safe-harbour language, and a scope statement.
4. Publish exactly what each SDK transmits, field by field, cross-referenced with KF-40's
   documented field list. The SDK is open source, so make this verifiable.
5. A security advisory process: GitHub Security Advisories, CVE assignment where applicable,
   and a customer notification path.
6. Launch a bug bounty once Phases 0–3 are complete and an external pentest has been
   remediated. Do not open a bounty on a platform with known unfixed P0s.

DONE WHEN
- The threat model covers every boundary in ARCHITECTURE.md.
- The limitations section is honest and specific.
- SECURITY.md is live with a monitored contact.
- The transmitted-field documentation matches what the code actually sends — verify with a
  test, not by reading.
```

---

### KF-50 · Load testing and capacity

**Depends:** KF-13 · **Size:** M

```
Declare a capacity number and prove it. "It scales" is not a claim.

BUILD
1. k6 scenarios in loadtest/ modelling realistic traffic:
   - heartbeat-dominant steady state (the real production shape — most traffic is heartbeat)
   - activation burst (a product launch)
   - mixed read/write seller API
   - offline grant issuance and refresh
2. Run against a production-shaped environment. Measure p50/p95/p99 latency, throughput,
   error rate, and resource usage per component. Find the actual breaking point and record
   what breaks first.
3. Establish and document capacity per instance: activations/sec, heartbeats/sec, and the
   database connection ceiling. Publish these numbers.
4. Tune what the tests reveal: connection pooling, query plans, index gaps, N+1 patterns,
   cache hit rates. Re-measure after each change and record the delta.
5. Add a CI performance regression gate on the critical paths (activate, heartbeat, grant
   issue) with a tolerance band, so a slow query cannot land unnoticed.
6. Document horizontal scaling in docs/DEPLOYMENT.md with the measured numbers, replacing
   the current qualitative description.

DONE WHEN
- Capacity numbers are measured, published, and reproducible.
- The performance gate is in CI and has been proven to fail on a deliberate regression.
- Scaling guidance is based on measurement, not estimation.
```

---

### KF-51 · License and release engineering

**Depends:** none · **Size:** M

```
README.md still says the software license is unresolved. Everything commercial is downstream
of that decision.

BUILD
1. Apply the license. Recommended: AGPL-3.0 for the core plus a commercial exception — this
   keeps the platform genuinely open (the direct counter to KeyAuth's obfuscated self-hosted
   build) while preserving a commercial path. Add LICENSE, per-file headers where
   conventional, a CLA or DCO for contributors, and a clear statement of what the commercial
   exception covers.
   State the decision explicitly in README.md and docs/.
2. Release engineering:
   - Semantic versioning, with the /api/v1 contract versioned independently and frozen
   - Automated changelog from conventional commits
   - Signed release artifacts and signed container images (cosign)
   - SBOM generated and published per release
   - A published support policy: v1 supported for a minimum of 24 months, with dates
3. Upgrade path: documented per-version upgrade notes, migration guides, and a tested
   rollback procedure including migration reversal.
4. CONTRIBUTING.md: development setup, testing, the PR process, and the security-issue path
   (which must route to SECURITY.md, never to a public issue).
5. Repository hygiene: remove committed build artifacts (sdk/csharp/bin, sdk/csharp/obj,
   __pycache__, tsconfig.tsbuildinfo) and extend .gitignore.
6. A public roadmap, so customers can see where this is going.

DONE WHEN
- The license is applied and stated unambiguously.
- Releases are automated, signed, and produce an SBOM.
- The upgrade and rollback path has been tested between two real versions.
- The repository contains no committed build output.
```

---

## §D — Verification loop (run between every prompt)

```bash
pnpm lint && pnpm test:all && pnpm build
```

Then confirm, honestly:

1. Does the Definition of Done pass in full — not partially?
2. Did anything in `/api/v1` change shape? If yes, revert it.
3. Are new endpoints rate-limited, Zod-validated, and tested?
4. Does any log line or telemetry attribute contain a secret?
5. Is the migration backward-compatible for one release?
6. Were any security defects found outside scope? Record them, do not silently fix.

---

## §E — Sequencing

| Phase | Prompts | Weeks | Milestone |
|---|---|---|---|
| 0 | KF-01…07 | 1–2 | No known live security defects |
| 1 | KF-08…12 | 2–4 | Security core actually tested |
| 2 | KF-13…18 | 4–8 | Operable and horizontally scalable |
| 3 | KF-19…22 | 8–10 | **Production-ready for self-hosting** |
| 4 | KF-23…30 | 10–17 | KeyAuth parity reached |
| 5 | KF-31…44 | 17–35 | **Differentiated — the moat is built** |
| 6 | KF-45…48 | 30–42 | Commercially launchable |
| 7 | KF-49…51 | 40–46 | **GA** |

Phases 5 and 6 overlap. Phase 7 items should start early and finish last — KF-51 in
particular (the license decision) gates everything commercial and should be resolved in
week one regardless of where it sits in this table.

**Start now:** KF-01, KF-02, KF-03 in parallel. They are independent, they fix live defects,
and together they take about a week.
