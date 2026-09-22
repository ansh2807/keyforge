# Keyforge — Differentiation Plan
## How to become the best and most defensible licensing platform, not just a better KeyAuth

**Companion document to** `PRODUCTION-PLAN.md` (which covers correctness and operability).
This document covers **what makes Keyforge unique** and how to build it.

---

## 0. Honest competitive landscape

Beating KeyAuth is not an ambitious goal. KeyAuth is a PHP monolith with a public breach
history, no response signing, and unscoped seller keys. Keyforge already beats it on
architecture. The real benchmark is higher.

| Competitor | Position | What they do well | Where they're open |
|---|---|---|---|
| **KeyAuth** | Free/cheap, gray-market tooling | Distribution, free tier, SDK breadth, Discord-native community | Security, reliability, trust, API design |
| **Keygen.sh** | Professional API-first licensing, open source | Cryptographic license files, machine fingerprinting, entitlements, heartbeats, excellent docs | Price, no tamper analytics, no verifiable audit, no KeyAuth migration path |
| **Cryptolens** | .NET-centric, SMB | Offline activation, .NET DX | Modern API, breadth, self-hosting |
| **LicenseSpring** | Mid-market commercial | Enterprise features, support | Cost, closed, developer experience |
| **FlexNet / Sentinel** | Legacy enterprise | Compliance, procurement inertia | Everything else — cost, DX, modernity |
| **Paddle / Lemon Squeezy** | Commerce-first | Payments, tax, checkout | Licensing is a thin bolt-on |

**Where Keyforge actually sits:** between KeyAuth (insecure, free, huge user base) and
Keygen (solid, expensive, professional). That gap is real and worth owning — but only if
you attack it with something neither side has, rather than duplicating both.

**Features that are NOT unique** (build them, but do not market them as differentiators —
Keygen already ships all of these): offline license files, machine fingerprinting,
heartbeats, entitlements, webhooks, scoped API keys, self-hosting, an open-source core.

---

## 1. The positioning thesis

Every product in this market makes the same implicit promise: *"we will stop people from
using your software without paying."* That promise is false, everyone in the industry
knows it is false, and pretending otherwise is why the category has no trust.

**Keyforge's thesis is different:**

> A license authority's job is not to be unbreakable. It is to be **provable, available
> offline, and aware of its own compromise.**

Three properties, each of which is verifiable rather than aspirational:

- **Provable** — every response is signed, and every administrative action is entered into
  a tamper-evident log a customer can independently verify. You do not have to trust
  Keyforge, or even trust yourself, about what happened to a license.
- **Offline** — entitlements are compiled into short-lived signed grants that work with no
  network at all. Air-gapped, on a plane, behind a hostile firewall.
- **Aware** — when a client *is* patched, the platform detects it, scores it, and tells you.
  Detection and attribution instead of a prevention fantasy.

**Tagline candidates:** *"The license authority you can prove."* /
*"Provable. Offline. Aware."*

This positioning is honest, technically defensible, demonstrable in a live demo, and it is
the direct antidote to KeyAuth's reputation problem. Nobody else in the category can claim
it without building what follows.

---

## 2. The six pillars

Ranked by defensibility × effort. Pillars 1–3 are the moat; 4–6 are the table that has to
be set for the moat to matter.

| # | Pillar | Unique vs KeyAuth | Unique vs Keygen | Effort |
|---|---|---|---|---|
| 1 | Tamper telemetry ("Integrity Intelligence") | Yes | **Yes** | 4–6 wks |
| 2 | Verifiable transparency log | Yes | **Yes** | 2–3 wks |
| 3 | Offline grants + CDN revocation sets | Yes | Partly (revocation sets are novel) | 4–5 wks |
| 4 | Entitlements as policy-as-code | Yes | Partly (deeper than theirs) | 3–4 wks |
| 5 | Developer experience that embarrasses the category | Yes | **Yes** | 4–6 wks |
| 6 | Adversarial transparency & migration wedge | Yes | **Yes** | 2–3 wks |

---

## Pillar 1 — Integrity Intelligence (the commercial moat)

**The insight:** everyone accepts that a determined attacker patches the binary. Nobody
sells the obvious consequence — *if you can't prevent it, instrument it.* This is the
single most commercially unique thing you can build, and no competitor markets it.

### Signals to collect

**a. Signed monotonic counters.** Each installation maintains a counter, incremented and
sent with every heartbeat, signed by the installation's key (the schema already has
`Activation.installationPublicKey` — currently stored and unused). The server tracks the
high-water mark.
- Counter goes *backwards* → state rollback, VM snapshot replay, or cloned install.
- Counter jumps → concurrent use of the same installation identity.
- Counter stalls while sessions continue → heartbeat responses are being replayed.

**b. Honeypot entitlements.** Define entitlements that a legitimate client never requests
because the real SDK never asks for them. A patched client that force-enables all features
will request them. This is a near-zero-false-positive crack signal, and it is genuinely
novel — nobody in this market ships it.

**c. Build attestation drift.** `BuildArtifact` already stores per-platform SHA-256. Have
the SDK report the hash of its own loaded image. A hash that matches no published build is
a modified binary. Track the *population* of unknown hashes — one is noise, four hundred
identical unknown hashes is a cracked build in circulation, and you now have its
fingerprint.

**d. Clock manipulation.** Client-reported time vs server time. Systematic backwards drift
on expiry boundaries is trial-reset behaviour.

**e. Activation-graph anomalies.**
- One installation ID across many distinct licenses → key-sharing harness.
- One license across geographically impossible session sequences.
- Registration bursts sharing infrastructure signals.
- A license whose activation pattern diverges sharply from its plan's population baseline.

**f. Response-replay detection.** The nonce is already echoed in signed responses. Track
nonce reuse per installation: a local proxy replaying a captured success response is
detectable server-side because the nonce will not advance.

### Product surface

A dedicated **Integrity** tab, per application:
- Risk-scored installations and licenses, not a raw event firehose. Score = weighted signal
  combination, with the contributing evidence shown for every score.
- Population view: "412 installations report build hash `a3f1…`, which matches no published
  release." Cracked builds become a tracked object with a first-seen date and a spread curve.
- Configurable response ladder per signal: **observe → alert → degrade → require re-auth →
  revoke.** Default to observe. Never auto-revoke out of the box.
- Webhook events (`integrity.signal`, `integrity.score_changed`) so customers can route it
  into their own systems.

### Design constraints — non-negotiable

- **Advisory by default.** Automated revocation on a heuristic will burn legitimate
  customers on VM migrations, dual-boot setups, and corporate imaging. Ship every automated
  response off by default and require explicit opt-in per signal.
- **Every score is explainable.** No opaque numbers. If you cannot show the evidence, do not
  show the score.
- **Document the false-positive modes** in the customer-facing docs. VMs, container images,
  disk cloning, and system restores all produce integrity signals from honest users.
- **Data minimisation.** Collect integrity signals, not user behaviour. No file paths, no
  process lists, no screenshots, no keystroke data. Publish exactly what the SDK sends and
  make it inspectable — the SDK is open source, so this is verifiable rather than a promise.
  This is the line between a licensing SDK and spyware, and staying clearly on the right
  side of it is itself a competitive advantage in a market where that trust is scarce.

### Why it's defensible

It requires signed client responses to work at all (KeyAuth structurally cannot), it
requires the installation-key infrastructure Keyforge already has, and its value compounds
with data — the population baselines get better the more customers you have. That is a real
network effect in a category that has none.

---

## Pillar 2 — Verifiable transparency log

**The insight:** borrow Certificate Transparency's design. Make the audit log
*independently verifiable*, so a customer never has to take your word — or their own
admin's word — for what happened to a license.

### Design (RFC 6962-style, deliberately conventional)

Extend `AuditEvent` with `seq BIGINT`, `leafHash BYTEA`, `treeSize BIGINT`.

- **Leaf:** `SHA-256(0x00 || canonicalJson(event))` — reuse the existing `canonicalJson()`
  from `src/lib/crypto.ts`.
- **Merkle tree** over leaves in sequence order, computed incrementally.
- **Signed Tree Head (STH)** published every 60 seconds: `{treeSize, rootHash, timestamp}`
  signed with a dedicated org-level Ed25519 log key (separate from application signing keys).
- **Endpoints:**
  - `GET /.well-known/keyforge-log/sth` — current signed tree head
  - `GET /api/v1/log/proof/inclusion?leaf=<hash>&size=<n>` — inclusion proof
  - `GET /api/v1/log/proof/consistency?from=<n>&to=<m>` — append-only proof between heads
  - `GET /api/v1/log/entries?start=&end=` — range download for auditors
- **External anchoring:** publish each hourly STH hash to a location outside your control —
  a public Git repository, or a mutual-anchoring agreement with another Keyforge deployment.
  Without external anchoring the log proves internal consistency but not that you didn't
  rewrite history wholesale; with it, tampering requires compromising two independent systems.
- **`keyforge-verify` CLI** — a standalone open-source tool that fetches an STH, verifies
  proofs, checks consistency across a history of STHs, and exits non-zero on any failure.
  Ship it as a separate repo so it is obviously not colluding with the server.

### Why it matters commercially

- **Reseller disputes.** "You revoked my licenses and edited the log." Now unprovable-by-
  assertion becomes provable-by-mathematics.
- **Enterprise procurement.** Security questionnaires ask about audit-log integrity. Every
  competitor answers "we have an audit log." You answer with a proof and a verification tool.
- **Self-hosted trust.** For self-hosters, this protects against a compromised *own* admin —
  a real scenario in reseller-heavy businesses.

Two to three weeks of work for a permanent, checkable, category-first claim.

---

## Pillar 3 — Offline grants and CDN revocation sets

Offline license files are not unique — Keygen has them. **Going further is.**

### Grant format

Compact binary, not JSON. COSE_Sign1 (RFC 9052) over a CBOR payload, serialised as
`kfg1.<base64url payload>.<base64url signature>`:

```
{
  v:   1,                     // format version
  kid: "sig_...",             // signing key id, for rotation
  aid: "app_...",             // application public id
  lid: "...",                 // license id
  iid: <32 bytes>,            // installation binding (keyed hash)
  iat, nbf, exp,              // short-lived: 24h – 30d, configurable per app
  ent: { ... },               // fully evaluated entitlements — no client-side policy logic
  ph:  <32 bytes>,            // policy hash, so drift is detectable
  re:  <uint>                 // revocation epoch
}
```

**Design decisions that matter:**
- Entitlements are **pre-evaluated server-side**. The client never runs policy logic — it
  reads a decided answer. This removes an entire class of client-side bypass.
- **Installation-bound.** A grant lifted from one machine fails verification on another.
- **Short TTL with a configurable grace window.** Default 7-day exp, 3-day grace with
  degraded functionality. The customer chooses the availability/revocation tradeoff
  explicitly, and the doc states the tradeoff plainly instead of hiding it.
- **Clock-skew tolerance** with monotonic-clock cross-checks, so a clock change is a signal
  (Pillar 1) rather than an exploit.

### CDN revocation sets — the genuinely novel part

The classic objection to offline licensing: *you can't revoke.* Standard answers are short
TTLs (hurts availability) or online checks (defeats the purpose). Borrow **CRLite**:

- Compile all revoked license IDs for an application into a **cascading Bloom filter** — a
  structure with **zero false negatives** (a revoked license is never wrongly allowed) and
  a tiny false-positive rate resolved by a single online check.
- Publish it signed at a CDN URL with an incrementing epoch. Typical size: **tens of
  kilobytes for a million licenses.**
- SDKs fetch opportunistically whenever a network is available and cache locally.
- Result: **near-real-time revocation for fully offline clients**, with no per-launch
  server call.

Nobody in this category ships this. It directly resolves the offline/revocation tradeoff
that every competitor either hand-waves or eats.

### SDK behaviour contract

Every SDK, in every language, must: verify signature → check `kid` against pinned keys →
check `exp`/`nbf` with skew tolerance → check installation binding → check the revocation
set if cached → fail **closed** on signature failure and **configurably** on staleness.
This contract is published, versioned, and enforced by the conformance suite (Pillar 5).

---

## Pillar 4 — Entitlements as policy-as-code

Today: `Plan.entitlements Json`. That's a bag of values. Turn it into a real entitlement
system and Keyforge stops being a *license server* and becomes an *entitlement platform* —
a larger and more defensible category.

### Model

Typed features rather than free-form JSON:
- `boolean` — feature on/off
- `limit` — maximum concurrent value (e.g. 5 seats, 3 projects)
- `quota` — N per period with a reset rule (e.g. 10,000 renders/month)
- `tier` — ordered enum supporting `>=` comparisons (`basic < pro < enterprise`)
- `config` — typed scalar value delivered to the client

Each feature carries an optional policy expression in **CEL** (Common Expression Language —
sandboxed, non-Turing-complete, well-specified, existing implementations). **Do not invent
a language.** Example:

```cel
license.plan.tier >= "pro"
  && subscription.status == "ACTIVE"
  && install.count <= license.maxDevices
```

### Surfaces

- `POST /api/v1/client/entitlements/evaluate` — online evaluation with full context
- Evaluated results compiled into offline grants (Pillar 3)
- `POST /api/v1/client/usage` — metered usage reporting with **idempotency keys**, aggregated
  server-side, feeding quota enforcement and usage-based billing
- Dashboard: a policy editor with a live evaluator ("test this policy against this license")
  and a diff view showing which licenses change outcome before you publish

### Why it compounds

Usage metering is the input to usage-based pricing, which is where this market is heading
and where seat-based competitors cannot easily follow. It also makes Keyforge relevant to
SaaS and API products, not only desktop software — a materially larger market than the one
KeyAuth serves.

---

## Pillar 5 — Developer experience that embarrasses the category

DX is not a differentiator anyone defends well, which is precisely why it wins. In this
category the bar is genuinely low.

### Five-minute integration

```bash
npx @keyforge/cli init
```
Authenticates, creates an application, generates keys, writes a config file, prints a
working code snippet for the detected language, and runs a live verification round-trip.
**Target: from zero to a verified activation in under five minutes.** Instrument this
funnel in the dashboard and treat regressions as bugs.

### `keyforge dev` — local mock authority

A local server with deterministic keys, seeded licenses, and no database required. Lets a
developer build and test the integration — including expiry, revocation, and device-limit
paths — with no account, no network, and no risk. **No competitor offers this.** It is also
the best possible top-of-funnel: people integrate before they ever sign up.

### Generated SDKs, not hand-written ones

Five hand-written SDKs already exist and *will* drift. Write an **OpenAPI 3.1 spec** as the
source of truth, generate transport layers for 10+ languages (TS, Python, C#, Java, C++,
Rust, Go, PHP, Lua, Swift, Kotlin, Delphi), and hand-write only the thin crypto-verification
layer per language. This turns SDK breadth — KeyAuth's main remaining advantage — from a
maintenance treadmill into a build step.

### Published adversarial conformance suite

A public repo of hostile test vectors every SDK must pass: forged signatures, replayed
nonces, algorithm downgrade, expired grants, wrong-installation grants, truncated payloads,
malformed CBOR, clock manipulation. Publish a pass/fail matrix.
**"The only licensing SDKs with a published adversarial test suite"** is a claim nobody can
copy without doing the work.

### Errors that teach

Every error response carries `code`, human-readable `message`, `request_id`, and `docs_url`.
Every error code gets a documentation page explaining cause and fix. The current `ApiError`
shape is already close — extend it and never regress.

---

## Pillar 6 — Adversarial transparency and the migration wedge

### Radical honesty as strategy

This market's defining characteristic is broken trust. Compete on the opposite:

- **Publish the threat model**, including a plain-language section titled *"What Keyforge
  cannot protect you from."* Local binary patching, memory editing, a user with kernel
  access. Say it directly. Every competitor implies otherwise and every competent buyer
  knows they are being sold a fiction; being the one vendor that doesn't is memorable.
- **Publish pentest results**, including findings, with remediation dates.
- **Public incident history and status page** with real uptime figures.
- **`SECURITY.md`** with a disclosure policy and a response SLA. Run a bounty once Phase 0–3
  of `PRODUCTION-PLAN.md` are complete.
- **Publish exactly what the SDK transmits**, field by field. The SDK is open source, so
  this is verifiable rather than asserted.

### The migration wedge — your fastest growth lever

KeyAuth has a large, unhappy, captive user base. `/api/1.3` already lets them switch
endpoints **without recompiling their product**. Complete the wedge:

1. **`keyforge migrate keyauth`** — one command importing applications, users, licenses,
   subscriptions, variables, files, and blacklists.
2. **Dual-run mode** — Keyforge shadows a live KeyAuth deployment, mirrors state, and reports
   divergence, so migration can be verified before cutover.
3. **A published compatibility matrix** — which KeyAuth calls are supported, which are
   intentionally not, and what to use instead.
4. **A migration guide framed by outcome**, not features: "your existing binaries keep
   working; change one URL; here is what you gain."

Then publish the demo that makes the whole thesis concrete: **MITM both platforms with a
local proxy returning a forged success response.** KeyAuth accepts it. Keyforge rejects it
on signature verification. Record it, put it on the landing page, keep it reproducible in
a public repo. That thirty-second demo is worth more than any feature table.

---

## 3. What NOT to build

Scope discipline is what makes the above achievable. Explicitly decline:

- **Your own obfuscator or packer.** Commodity, adjacent, endless, and it would undercut the
  honesty positioning. Integrate with existing tools instead.
- **Kernel-mode anti-cheat or drivers.** Different product, different liability, different
  company. This is the boundary that separates a licensing platform from something that
  will get you removed from app stores and distrusted by security teams.
- **A payments stack.** Integrate Stripe/Paddle. Do not become a merchant of record.
- **A general-purpose identity provider.** You are not Auth0. Product-user auth exists to
  serve licensing.
- **A custom policy language.** Use CEL.
- **Hand-written SDK number eleven.** Generate them.
- **Blockchain anything.** The transparency log is a Merkle tree with external anchoring.
  That is the correct, boring, respected design. Do not reach for a token.

---

## 4. Build sequence

Interleaves with `PRODUCTION-PLAN.md`. **Nothing here ships before Phases 0–3 of that
document are complete** — differentiation built on a platform that cannot rate-limit or
recover an account is worthless.

| Stage | Weeks | Ships | Why this order |
|---|---|---|---|
| **D0** | 1–2 | OpenAPI 3.1 spec as source of truth | Everything downstream generates from it |
| **D1** | 2–4 | `keyforge dev` + CLI `init` + generated SDKs (10 langs) | Top-of-funnel; unblocks all SDK work |
| **D2** | 3–5 | Transparency log + `keyforge-verify` CLI | Small, self-contained, permanent claim |
| **D3** | 5–9 | Entitlements as policy-as-code + usage metering | Prerequisite for grants; unlocks pricing |
| **D4** | 8–13 | Offline grants (COSE) + CDN revocation sets | Depends on D3's evaluated entitlements |
| **D5** | 12–18 | Integrity Intelligence | Needs grants + counters; most valuable, so highest quality bar |
| **D6** | 14–17 | Migration wedge + adversarial conformance suite + MITM demo | Growth push once the product is worth switching to |
| **D7** | 16–20 | Threat model, pentest publication, bounty, status page | Trust surface, timed with commercial launch |

**~5 months of focused engineering** on top of production readiness. Stages D0–D2 are
independently valuable and shippable, so there is a credible story at every milestone rather
than a single distant launch.

---

## 5. Risks and honest mitigations

| Risk | Reality | Mitigation |
|---|---|---|
| Integrity signals produce false positives | Certain. VMs, cloning, corporate imaging, and system restores all trigger them | Advisory by default; explainable scores; documented FP modes; opt-in enforcement only |
| Offline grants weaken revocation | Genuinely true | CDN revocation sets + short TTL + explicit, documented customer-chosen tradeoff |
| Transparency log has thin near-term demand | Likely — few will ask for it in year one | Cheap (2–3 wks), permanent, and disproportionately valuable in enterprise procurement and disputes |
| Integrity Intelligence reads as surveillance | A fair concern and worth taking seriously | Strict data minimisation; publish every transmitted field; open-source SDK makes it verifiable; never collect user behaviour |
| SDK matrix becomes a treadmill | Certain if hand-written | Generate from OpenAPI; hand-write only the crypto layer |
| Keygen ships something similar | Possible, they execute well | Integrity Intelligence and the KeyAuth migration wedge are the hardest for them to copy — the first compounds with data, the second is a market they don't serve |
| Scope sprawl | The most likely failure mode by a wide margin | Section 3 is a commitment, not a suggestion. Six pillars, nothing else |

---

## 6. The one-paragraph pitch

> Keyforge is a self-hosted licensing and entitlement platform built on a different premise
> than the rest of the category. Every response your software receives is Ed25519-signed and
> nonce-bound, so a local proxy cannot forge a successful authentication — the attack that
> defeats most licensing systems in a single afternoon. Entitlements compile into short-lived
> signed grants that work fully offline, with CDN-distributed revocation sets that revoke a
> license within minutes even on machines that never call home. Every administrative action
> enters a tamper-evident transparency log you can verify yourself with an independent tool.
> And when a client *is* patched — because eventually one will be — Keyforge detects it,
> scores it, shows you the evidence, and lets you decide what to do. We do not claim to make
> your software uncrackable. We make your license authority provable, your entitlements
> available offline, and your compromises visible.

---

## 7. Immediate next actions

1. **Decide the license.** AGPL-3.0 core plus a commercial exception. Every item in this
   document is downstream of that choice, and it is the direct counter to KeyAuth's
   obfuscated self-hosted build.
2. **Write the OpenAPI 3.1 spec** (D0). It is the foundation for generated SDKs, generated
   docs, and the conformance suite — three pillars depend on it.
3. **Build the MITM demo now**, against the current code. It already works, it takes about a
   day, and it is the single most persuasive asset you will ever have.
4. **Prototype the honeypot entitlement.** Small, and it will tell you within a week whether
   the Integrity Intelligence signal quality is real before you commit six weeks to it.
5. **Finish Phases 0–3 of `PRODUCTION-PLAN.md` first.** None of this matters on a platform
   whose rate limiter does not fire.
