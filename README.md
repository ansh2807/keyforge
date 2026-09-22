<p align="center">
  <img src="assets/hero.svg" alt="Keyforge" width="100%">
</p>

<h1 align="center">Keyforge</h1>

<p align="center">
  <b>A self-hosted software-licensing and product-authentication platform.</b><br>
  Licenses, devices, subscriptions, signed responses, and SDKs — on your own infrastructure.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/self--hosted-f5a623?style=for-the-badge&logo=serverfault&logoColor=black" alt="self-hosted">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma">
  <img src="https://img.shields.io/badge/Ed25519_signed-6f42c1?style=for-the-badge&logo=letsencrypt&logoColor=white" alt="Ed25519">
</p>

---

## 🔑 What it is

Keyforge is a complete control plane for licensing and authenticating your software: a public client API, a customer panel, seller/reseller APIs, an admin dashboard, per-application **Ed25519** signing, and hardened auth (**Argon2id**, TOTP, passkeys). It ships a **KeyAuth-style `/api/1.3` compatibility adapter** so you can migrate incrementally.

## 🧩 Included

| Area | Capabilities |
|---|---|
| **Licensing** | Plans with JSON entitlements · one-time plaintext license generation · activation, suspension, revocation, expiration, device reset |
| **Client runtime** | Opaque renewable sessions with heartbeat enforcement · Ed25519-signed responses · client nonce echo · build-hash & integrity metadata |
| **Product users** | Registration/login · multiple subscriptions · entitlement-gated resources · TOTP & WebAuthn passkeys |
| **Delivery** | Protected files with plan authorization + SHA-256 verification · runtime variables · remote JSON functions · product chat |
| **Access control** | Hashed deny rules & allowlists for IP, installation, username, and license identity |
| **Sellers & teams** | Scoped seller API keys · credit-limited resellers · team invites with owner / admin / analyst roles |
| **Integrations** | Discord, Telegram & generic notifications · signed webhooks with retry state |
| **Security** | Argon2id passwords · admin TOTP or email OTP · DB-backed login throttling · append-only audit trail |
| **SDKs** | TypeScript, Python, .NET, Java, and C++ — each with signature & nonce verification |

## ⚙️ Requirements

- **Node.js 22+** · **pnpm 11** · **PostgreSQL 14+** · Docker (optional)

## 🚀 Local setup

```bash
cp .env.example .env
pnpm key:generate        # generate the encryption key
pnpm install
pnpm prisma migrate deploy
pnpm dev
```

Full production notes, hardening, and recovery steps live in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## 🏗️ Stack

**Next.js** control plane · **Prisma** + **PostgreSQL** schema and migrations · encrypted application signing keys and webhook secrets · Docker image + Compose stack · test suite and deployment guidance included.

## 🔐 Security notes

- `.env`, `data/`, and `backups/` are git-ignored — no live credentials or database dumps are in this repo. Only `.env.example` (placeholders) and CI/doc examples ship.
- Every successful client response is Ed25519-signed; application signing keys and webhook secrets are stored encrypted at rest.

---

<p align="center"><sub>A self-hostable alternative to hosted licensing SaaS — you own the keys, the data, and the audit trail.</sub></p>
