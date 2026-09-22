# Keyforge — Production Readiness & Competitive Plan

**Audit date:** 2026-08-13
**Codebase reviewed:** ~9,700 LOC across `src/`, `sdk/`, `prisma/`, `docs/`, `tests/`
**Target:** production-grade, and materially better than KeyAuth (github.com/keyauth, keyauth.cc)

---

## 0. Executive verdict

Keyforge is **architecturally ahead of KeyAuth already**. The design decisions that matter
most — Ed25519 response signing with nonce echo, Argon2id, HMAC-hashed license keys,
envelope-encrypted signing keys, scoped seller credentials, an append-only audit trail,
RBAC teams, and SSRF-screened webhooks — are things KeyAuth either never had or bolted on
badly. That is the hard part and it is done well.

What Keyforge is **not** yet is production-ready. The gap is not features; it is
**operational maturity**: the rate limiter is silently non-functional on five endpoints,
webhook delivery blocks the login hot path, protected files pin you to a single machine,
there is no account recovery for anyone, and 10k lines of authentication code are covered
by five unit-test files that test none of the security-critical flows.

**Honest scoring against KeyAuth today:**

| Dimension | Keyforge | KeyAuth | Notes |
|---|---|---|---|
| Cryptographic design | **A** | D | Signed responses + nonce is the single biggest differentiator |
| Secret handling at rest | **A−** | D | KeyAuth has a public breach history |
| API design & typing | **A−** | C− | KeyAuth returns HTTP 200 for errors |
| Feature breadth | B+ | **A−** | KeyAuth still wins on integrations & SDK count |
| Rate limiting / abuse | **D** | C | See P0-1 — Keyforge's is partially dead code |
| Scalability | **D+** | B | Local-disk files, inline webhooks, no cache |
| Observability | **F** | C | Nothing. No logs, metrics, traces, or error tracking |
| Account recovery | **F** | B | No password reset for admins or end users |
| Test coverage | **D−** | ? | No test touches activation, device limits, or revocation |
| Docs & DX | B+ | B | Good prose docs; no OpenAPI, no quickstart-in-5-min |
| Commercial readiness | **F** | A | No billing, no plans, no signup, no status page |

**Time to production-ready (self-hosted, single-tenant):** ~6–8 engineer-weeks.
**Time to "clearly better than KeyAuth" as a hosted product:** ~5–6 engineer-months.

---

## Part 1 — Audit findings

Ordered by severity. File references are `path:line`.

### P0 — Ship blockers

**P0-1. Five rate limiters are dead code and never fire.**

`enforceRateLimit()` counts only rows where `success: false`
(`src/lib/rate-limit.ts:10-12`). Rows are written exclusively by `recordAuthAttempt()`.
These call sites invoke the limiter but **never record an attempt**, so the count is
permanently zero and the limit can never trigger:

- `src/app/api/1.3/route.ts:71` — the entire KeyAuth compatibility surface (`init`,
  `license`, `register`, `login`, `var`, `chatsend`) is completely unlimited.
- `src/app/api/v1/client/functions/[name]/route.ts:17` — remote functions unlimited.
  Also called *after* `executeRemoteFunction()` has already done its DB work, so even if
  it worked it would not protect the expensive path.
- `src/app/api/v1/client/chat/route.ts:20` — chat flood unlimited.
- `src/app/api/v1/client/passkeys/login/options/route.ts:17` — user enumeration oracle.
- `src/app/actions/team-actions.ts:67` — invite-email spam unlimited.

**P0-2. Six client endpoints have no rate limiting at all.**

`heartbeat`, `validate`, `config`, `files`, `files/[fileId]`, `user-variables`,
`deactivate`. `heartbeat` performs two DB writes per call with no ceiling. A single
leaked session token is an unbounded write amplifier against PostgreSQL.

**P0-3. `clientIp()` trusts `X-Forwarded-For` unconditionally.**

`src/lib/http.ts:5-8` and `src/lib/auth.ts:22-24` take the first XFF value with no
trusted-proxy configuration. Every IP-keyed control is therefore bypassable by sending
a forged header: activation/login/register rate-limit buckets, IP access rules
(`src/lib/access-control.ts`), audit `ipAddress`, and admin login throttling. Attacker
rotates a header value and all IP-based defenses evaporate.

**P0-4. SSRF via HTTP redirect in webhook and notification dispatch.**

`assertSafeWebhookUrl()` (`src/lib/safe-url.ts`) correctly resolves DNS and rejects
private ranges — then `fetch()` is called with default redirect following
(`src/lib/webhooks.ts:60`, `src/lib/notifications.ts:44`). A registered endpoint can
return `302 → http://169.254.169.254/latest/meta-data/` and the runtime follows it,
unscreened. The DNS check is also TOCTOU-vulnerable to rebinding.
**Fix:** `redirect: "manual"`, plus re-validation on any `Location`, plus pinning the
connection to the validated IP.

**P0-5. Webhook delivery runs inline in the authentication request path.**

`emitWebhook()` awaits `Promise.allSettled(dispatchWebhook)` before returning
(`src/lib/webhooks.ts:41`), and `activate` awaits `emitWebhook` before responding
(`src/app/api/v1/client/activate/route.ts:26`). Each delivery has a 5s timeout. Three
slow customer endpoints add up to 15s to a license activation. Retries only occur when
someone manually POSTs `/api/v1/admin/maintenance`.

**P0-6. No account recovery for anyone.**

No password reset, no forgot-password, no recovery codes for admins; no password reset
or email verification for product end users. A locked-out owner has no path back in
short of direct DB surgery. This is disqualifying for any paying customer.

**P0-7. Zero observability.**

No structured logging, no metrics, no tracing, no error reporting. `asApiError()`
`console.error`s the raw error object (`src/lib/api-error.ts:14`), which will print
secrets on a Prisma error. You cannot operate this: there is no way to answer
"is it down", "how slow", "who is being attacked", or "what broke".

**P0-8. Protected file storage is local disk only.**

`src/lib/storage.ts` + `getStorageDirectory()`. `docs/ARCHITECTURE.md` admits this blocks
horizontal scaling. Also means `/api/health/ready` fails on any instance whose volume is
detached, and there is no CDN path for large binaries.

**P0-9. Security-critical logic is untested.**

`tests/` covers crypto primitives, schemas, OTP codes, IP ranges, and audit naming. It
does **not** cover: activation, device-limit enforcement, the `FOR UPDATE` concurrency
path, revocation propagation, expiry, session validation, scope enforcement, reseller
credit atomicity, access rules, or the compat adapter. The device-limit race in
`activateCore()` is exactly the code that needs a concurrency test and has none.

### P1 — Correctness and hardening

- **P1-1. Sessions live forever.** `validateClientSession()` extends `expiresAt` on every
  heartbeat (`src/lib/licenses.ts:459-461`) with no absolute lifetime cap. A stolen
  session token is valid indefinitely as long as it heartbeats. Add `absoluteExpiresAt`.
- **P1-2. Access rules are a full table scan per authentication.**
  `enforceApplicationAccess()` loads *every* active rule for the app
  (`src/lib/access-control.ts:78-84`) then filters in JS. With 50k blacklist entries this
  is a scan on every login. Query by `valueHash IN (...)` instead — the unique index
  already supports it.
- **P1-3. Unbounded table growth, no retention.** `AuthAttempt` (one row per auth attempt,
  forever), `AuditEvent`, `WebhookDelivery`, `ChatMessage`, `CompatibilitySession`. The
  maintenance endpoint (`src/app/api/v1/admin/maintenance/route.ts`) cleans sessions,
  challenges, and login tokens — but **not** `AuthAttempt`, which is the fastest-growing
  table and the one the rate limiter counts on every request.
- **P1-4. Compat `init` is an unauthenticated row-creation primitive.**
  `src/app/api/1.3/route.ts:90-97` writes a `CompatibilitySession` with 24h expiry per
  call. Combined with P0-1 (no working limit) and P0-3 (spoofable IP), this is a trivial
  disk-fill DoS.
- **P1-5. CSP allows `'unsafe-inline'` for scripts in production** (`next.config.ts:5`).
  Move to nonce-based CSP; it is the difference between "an XSS is contained" and "an XSS
  takes the control plane".
- **P1-6. Server Action body limit is 50 MB** (`next.config.ts:11`). Every action, not just
  uploads. Scope this to the upload route.
- **P1-7. No `Retry-After` header** on 429 responses. SDKs cannot back off intelligently.
- **P1-8. No CAPTCHA / progressive delay** on admin login. 8 attempts per 15 min per
  (email, IP) is weak given P0-3 makes the IP component free to rotate.
- **P1-9. License plaintext leakage in DB.** `keyPrefix` (8 chars) + `keyLastFour` = 13 of
  25 key characters stored in cleartext (`src/lib/licenses.ts:570-571`). Still far better
  than KeyAuth's full plaintext, but reduce to 4+4.
- **P1-10. No idempotency keys** on seller-API license issuance. A retried POST double-issues
  and double-debits reseller credits.
- **P1-11. Signing key decrypted per request** (`src/lib/app-signing.ts:8`). Add an LRU
  cache keyed by `signingKeyId` with a short TTL.
- **P1-12. `.env` with a live `KEYFORGE_MASTER_KEY` sits in the working tree.** It is
  gitignored, so this is a local-hygiene issue, not a leak — but move to a secret manager
  before any shared environment.

### P2 — Quality and DX

- No OpenAPI/JSON-Schema spec; SDKs are hand-written and will drift.
- No `middleware.ts` at all — no request ID, no global limits, no body-size guard.
- No pagination on any list endpoint (`take: limit` capped at 100, no cursor).
- No bulk operations (bulk revoke, bulk issue, CSV export/import).
- `AuditEvent` is append-only by convention, not by database constraint.
- No i18n. No dark/light toggle (dark only). No mobile-responsive audit of the dashboard.
- No `SECURITY.md`, no `CONTRIBUTING.md`, no license file (README flags this).
- Committed build artifacts: `sdk/csharp/bin/`, `sdk/csharp/obj/`, `__pycache__/`,
  `tsconfig.tsbuildinfo`, `.next/`.

---

## Part 2 — Competitive gap vs KeyAuth

### Where Keyforge already wins (protect these — they are the pitch)

1. **Signed responses.** Every successful client response is Ed25519-signed over canonical
   JSON with an echoed one-use nonce. The single most common KeyAuth defeat — proxying the
   auth server and returning `{"success":true}` — does not work against Keyforge. This is
   the headline.
2. **No plaintext secrets.** License keys HMAC-hashed; signing keys, TOTP seeds, webhook
   secrets, and notification endpoints AES-256-GCM encrypted under a master key with a
   working rotation script.
3. **Scoped credentials.** KeyAuth seller keys are all-or-nothing. Keyforge has per-scope
   API keys plus credit-limited reseller keys with atomic decrement under row lock.
4. **Audit trail + RBAC.** Owner/Admin/Analyst, team invites, attributed append-only events.
   KeyAuth has essentially none of this.
5. **Passkeys.** WebAuthn for end users with expiring single-use challenges. KeyAuth has
   nothing comparable.
6. **Real migrations, real types, real transactions.** `FOR UPDATE` on the activation path;
   Prisma migrations; Zod at every boundary.
7. **Self-hosted and genuinely open.** KeyAuth's self-hosted build is obfuscated and
   licensed. Ship yours readable under a real license.

### Parity gaps to close

| KeyAuth capability | Keyforge status | Action |
|---|---|---|
| Region/country blocking | Missing | Add `COUNTRY` + `ASN` + CIDR access-rule subjects |
| VPN/proxy/datacenter detection | Missing | IP intelligence provider integration |
| Session-hijack / concurrent-IP detection | Missing | Flag session IP drift, configurable action |
| App logs (client-pushed) | Missing | `POST /client/log`, retained + searchable |
| Discord bot integration | Missing | Bot for license lookup/issuance from a server |
| Web loader / login-via-web | Partial (`login-token`) | Finish the hosted flow + UI |
| SDK breadth (12 languages) | 5 (TS, Py, C#, Java, C++) | Add Rust, Go, PHP, Lua, Delphi, VB |
| Anti-debug / integrity helpers | Partial (`BuildArtifact` hashes) | Ship an SDK-side integrity module |
| Subscription "levels"/tiers | Partial (plans) | Add ordered tiers + upgrade/downgrade |
| Customer self-service panel | Basic (`/portal/[appId]`) | Full panel: devices, subs, resets, downloads |
| Hosted signup / billing | Missing | See Part 6 |

### Where you can go beyond KeyAuth (the moat)

1. **Offline license tokens.** Ed25519-signed, time-boxed license grants the SDK verifies
   with zero network. KeyAuth cannot do this at all — it has no signing infrastructure.
   You already have the keys. This is the highest-leverage feature on this list.
2. **Key transparency / verifiable audit log.** Merkle-chain the `AuditEvent` table and
   publish signed checkpoints. "Prove your provider didn't tamper with your license data."
   Nobody in this market has it.
3. **Machine-fingerprint policies, not HWID strings.** Weighted, multi-signal device
   identity with configurable drift tolerance, instead of one spoofable string.
4. **Entitlements as a first-class API.** You already have JSON entitlements on plans —
   expose a real feature-flag/entitlement evaluation API. Turns a license server into an
   entitlement platform, which is a bigger, more defensible category.
5. **SDK-verified everything.** Publish a conformance test suite proving each SDK rejects
   forged signatures, replayed nonces, and downgraded algorithms.
6. **Operational transparency.** Status page, published uptime, incident history, and a
   real `SECURITY.md` with a disclosure process. This is the direct counter to KeyAuth's
   reputation.

---

## Part 3 — Target architecture

```
                    ┌──────────────┐
   product client → │ edge / WAF   │ → TLS, DDoS, geo, bot
                    └──────┬───────┘
                           │
                  ┌────────▼─────────┐        ┌──────────────┐
                  │ Next.js app (N×) │◄──────►│ Redis        │ rate limits,
                  │  middleware:     │        │              │ nonce replay,
                  │  reqid, ratelimit│        └──────────────┘ signing-key cache
                  │  trusted proxy   │
                  └────┬────────┬────┘
                       │        │
          ┌────────────▼──┐  ┌──▼──────────────┐
          │ PostgreSQL    │  │ S3-compatible   │ protected files
          │ (+ replica)   │  │ object storage  │ + CDN
          └───────────────┘  └─────────────────┘
                       │
              ┌────────▼─────────┐
              │ worker process   │ webhooks, notifications,
              │ (queue consumer) │ retention, expiry, exports
              └──────────────────┘
                       │
              ┌────────▼─────────┐
              │ OTel collector   │ → logs, metrics, traces, errors
              └──────────────────┘
```

**Key changes from today:** Redis for limits and caching; S3 for files; a separate worker
process draining a durable queue; OpenTelemetry throughout; a real middleware layer.

---

## Part 4 — Phased execution plan

Each phase has deliverables and **exit criteria**. Do not start the next phase until the
current one's exit criteria pass in CI.

### Phase 0 — Stop the bleeding (week 1) · P0 security

**Deliverables**
1. Rewrite `src/lib/rate-limit.ts` as a real sliding-window/token-bucket limiter that
   counts **all** requests, not just failures. Redis-backed with a Postgres fallback.
   Audit every call site; delete the `success` boolean from the limiting decision.
2. Add `src/middleware.ts`: request ID, global per-IP limit, body-size guard, security
   headers, and a trusted-proxy hop count (`KEYFORGE_TRUSTED_PROXY_HOPS`) feeding a new
   `clientIp()` that ignores untrusted XFF hops.
3. Rate-limit the six unprotected client endpoints. Return `Retry-After` on all 429s.
4. Fix SSRF: `redirect: "manual"` in `webhooks.ts` and `notifications.ts`, re-validate any
   `Location`, cap redirect depth at 0, and pin the socket to the validated address.
5. Move `emitWebhook` out of the request path (interim: `after()`/`waitUntil`; permanent in
   Phase 2).
6. Scope the 50 MB body limit to uploads; move script CSP to nonces.
7. Redact the error object in `asApiError()` before logging.
8. Add `AuthAttempt` pruning to the maintenance job.

**Exit criteria** — an integration test proves each of: forged XFF does not reset a limit;
the compat endpoint 429s under flood; a redirect to 169.254.169.254 is refused; activation
p99 does not move when a webhook endpoint hangs.

### Phase 1 — Test the security core (weeks 1–2)

**Deliverables**
1. Testcontainers-backed Postgres in Vitest; per-test schema isolation.
2. Integration suites for: activate (incl. **concurrent** activation against the device
   limit — the `FOR UPDATE` path), register, login, TOTP, passkey, heartbeat/validate,
   revocation propagation, expiry, deactivate.
3. Authorization matrix tests: every seller/reseller scope × every admin endpoint, asserting
   403 on missing scope and cross-application isolation.
4. Reseller credit atomicity under concurrency.
5. Access-rule allow/deny precedence tests.
6. Compat adapter contract tests against recorded KeyAuth client request shapes.
7. SDK conformance suite: each of the 5 SDKs must reject a forged signature, a replayed
   nonce, and an algorithm downgrade. Wire into the `native-sdks` CI job.
8. Coverage gate at 80% on `src/lib/**`, 100% on `licenses.ts`, `access-control.ts`,
   `seller-auth.ts`, `crypto.ts`.

**Exit criteria** — gate passes; CI runs the full suite in under 10 minutes.

### Phase 2 — Operability (weeks 2–4)

**Deliverables**
1. OpenTelemetry: traces on every route and DB call; RED metrics per endpoint; structured
   JSON logs with request ID and organization ID; error reporting (Sentry or equivalent).
2. Golden-signal dashboards + alerts: auth failure rate, activation p99, webhook backlog
   depth, DB pool saturation, 5xx rate, rate-limit trip rate.
3. Durable job queue + separate worker process. Move webhooks, notifications, retention,
   expiry sweeps, and exports onto it. Exponential backoff with jitter; dead-letter queue;
   a dashboard view of failed deliveries with manual replay.
4. Replace the manual maintenance endpoint with scheduled worker jobs (keep the endpoint
   as a manual trigger).
5. Retention policies with configurable windows for `AuthAttempt`, `AuditEvent`,
   `WebhookDelivery`, `ChatMessage`, expired sessions.
6. S3-compatible storage driver behind the existing `storage.ts` interface; keep local disk
   as the single-node default. Signed time-boxed download URLs.
7. `/api/health/ready` checks DB + Redis + object storage.
8. Backup verification: nightly restore-into-scratch drill, in CI weekly.

**Exit criteria** — kill a worker mid-delivery and no event is lost; run two app instances
behind a load balancer sharing S3 and Redis and pass the full Phase 1 suite.

### Phase 3 — Account lifecycle (weeks 4–5)

**Deliverables**
1. Admin password reset (signed, single-use, 15-min token, invalidates all sessions),
   recovery codes for TOTP, and an owner-recovery break-glass procedure documented.
2. End-user email verification and password reset via the client API + portal.
3. Session management UI: list and revoke admin sessions and device activations.
4. Absolute session lifetime cap (`absoluteExpiresAt`) alongside the sliding window.
5. Email deliverability: DKIM/SPF/DMARC guidance, provider abstraction (SMTP + a
   transactional API provider), bounce handling.
6. Progressive login delay + CAPTCHA after N failures; new-device and new-location
   notification emails.

**Exit criteria** — a full lockout-and-recovery drill passes for an owner with no DB access.

### Phase 4 — Parity features (weeks 5–9)

**Deliverables**
1. Access rules extended: CIDR ranges, country, ASN, VPN/datacenter detection.
2. Session-hijack detection: IP/geo drift on an active session, configurable to warn,
   re-auth, or revoke.
3. Client application logs: `POST /client/log`, retained, searchable in the dashboard.
4. Subscription tiers with ordering, upgrade/downgrade, proration hooks.
5. Full customer portal: devices, subscriptions, downloads, password/TOTP/passkey
   management, invoice history.
6. Bulk operations + CSV import/export for licenses and users.
7. Cursor pagination and filtering across all list endpoints.
8. Discord bot for license lookup and issuance.
9. Dashboard analytics: activations over time, DAU, license conversion, revocation rate,
   geography, top errors.

**Exit criteria** — the parity table in Part 2 has no "Missing" rows.

### Phase 5 — The moat (weeks 9–16)

**Deliverables**
1. **Offline license tokens.** Signed, time-boxed, entitlement-bearing grants; SDK-side
   verification with zero network; configurable grace window and clock-skew tolerance;
   revocation via short TTL + refresh. Ship SDK support in all languages.
2. **Verifiable audit log.** Merkle-chain `AuditEvent`; publish signed checkpoints;
   `GET /api/v1/audit/proof/:eventId` returns an inclusion proof. Add a `verify` CLI.
3. **Entitlements API.** First-class evaluation endpoint over plan JSON entitlements with
   per-feature limits, quotas, and usage metering.
4. **Fingerprint policies.** Multi-signal weighted device identity with drift tolerance,
   replacing single-string HWID matching.
5. SDK expansion: Rust, Go, PHP, Lua. Autogenerate from an OpenAPI spec so they cannot
   drift.
6. Public API documentation site generated from OpenAPI, with runnable examples.

**Exit criteria** — offline tokens work airplane-mode in all SDKs; audit proofs verify
against a published checkpoint from an independent tool.

### Phase 6 — Commercial (weeks 12–24, parallel)

See Part 6.

### Phase 7 — Assurance (before GA)

1. Independent penetration test scoped to the client API, seller API, and dashboard.
2. Threat model document (STRIDE over the trust boundaries already in `ARCHITECTURE.md`).
3. Public `SECURITY.md` with a disclosure policy and response SLA; consider a bug bounty.
4. SOC 2 Type I readiness if selling to businesses (Type II is a 6–12 month observation
   window — start the clock early).
5. Load test to a declared capacity number and publish it.
6. Choose and apply a license (README still flags this as unresolved). AGPL-3.0 for the
   open core plus a commercial exception is the standard play here and directly counters
   KeyAuth's obfuscated self-hosted build.

---

## Part 5 — Test & release strategy

**Test pyramid:** unit (pure functions, current tests) → integration (Testcontainers
Postgres + Redis, the bulk of new work) → contract (SDK conformance, compat adapter) →
E2E (Playwright over the dashboard's critical paths) → load (k6 against activate/heartbeat).

**Required CI gates:** lint, typecheck, unit, integration, SDK conformance, coverage
threshold, `pnpm build`, container build + boot + migrate + health check, dependency audit,
secret scan, SAST.

**Release process:** trunk-based; semantic versioning on the public API contract; migrations
must be backward-compatible for one release (expand/contract); canary one instance before
fleet rollout; documented rollback including the migration-reversal path.

**API versioning:** `/api/v1` is your contract with compiled binaries you cannot update.
Never break it. Introduce `/api/v2` for breaking changes and support v1 for a published
minimum of 24 months — this is a genuine differentiator against KeyAuth's history of
breaking clients.

---

## Part 6 — Commercial readiness

If the goal is to beat keyauth.cc and not just the GitHub repo, these are required:

1. **Hosted signup, plans, and billing.** Stripe: self-serve signup, metered plans by
   application count and monthly active installs, invoices, dunning, tax handling.
2. **Multi-tenant hardening.** Organizations exist in the schema but a single admin has one
   membership in practice (`requireAdmin()` takes `memberships[0]`). Add org switching,
   per-org quotas, and noisy-neighbour isolation.
3. **Free tier.** KeyAuth's free tier is its distribution engine. Match it, with signed
   responses included — that framing alone converts security-conscious users.
4. **Migration tooling.** A one-command KeyAuth importer (apps, users, licenses,
   subscriptions, blacklists). The `/api/1.3` adapter already lets them switch endpoints
   without recompiling; make the data move equally cheap. This is your fastest growth lever.
5. **Trust surface.** Status page with real uptime history, public incident postmortems,
   `SECURITY.md`, and a security page explaining response signing in plain language.
   KeyAuth's breach history is your opening.
6. **Support.** Documented SLA, ticketing, and a community Discord.
7. **Positioning.** Lead with *"Your license server can't be spoofed by a local proxy."*
   That is the concrete, demonstrable claim KeyAuth cannot make. Publish a demo that
   MITMs both and shows Keyforge rejecting the forged response.

---

## Part 7 — Sequencing summary

| Phase | Weeks | Focus | Gate |
|---|---|---|---|
| 0 | 1 | P0 security fixes | Forged XFF / SSRF / flood tests pass |
| 1 | 1–2 | Test the security core | 80% coverage, 100% on auth libs |
| 2 | 2–4 | Observability, queue, S3 | Two instances behind an LB pass suite |
| 3 | 4–5 | Account lifecycle | Lockout-recovery drill passes |
| 4 | 5–9 | KeyAuth parity | No "Missing" rows in parity table |
| 5 | 9–16 | Differentiation | Offline tokens + audit proofs verified |
| 6 | 12–24 | Commercial | Paid signup end-to-end |
| 7 | pre-GA | Assurance | Clean pentest, license applied |

**Minimum viable production (self-hosted, your own products):** Phases 0–3, ~5 weeks.
**Credible KeyAuth competitor:** through Phase 5, ~4 months.
**Hosted commercial product:** through Phase 7, ~6 months.

---

## Immediate next actions

1. Fix P0-1. It is a one-file change and it is currently the largest live risk.
2. Add `src/middleware.ts` with trusted-proxy IP resolution (P0-3).
3. Add `redirect: "manual"` to both `fetch` call sites (P0-4).
4. Stand up Testcontainers and write the concurrent device-limit test — it will tell you
   immediately whether the `FOR UPDATE` path actually holds.
5. Decide the license. Everything commercial is downstream of that choice.
