import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BracketsCurly,
  Fingerprint,
  Key,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { Brand } from "@/components/brand";

export default function HomePage() {
  return (
    <main className="public-shell">
      <nav className="public-nav" aria-label="Primary navigation">
        <Link href="/" aria-label="Keyforge home">
          <Brand />
        </Link>
        <div className="public-links">
          <a href="#capabilities">Capabilities</a>
          <a href="#architecture">Architecture</a>
          <Link className="button small" href="/login">
            Open control plane
          </Link>
        </div>
      </nav>

      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="eyebrow">Self-hosted license authority</p>
          <h1>Control who runs your software.</h1>
          <p>Issue licenses, bind devices, revoke access, and verify signed sessions from infrastructure you own.</p>
          <div className="hero-actions">
            <Link className="button" href="/login">
              Open control plane <ArrowRight size={17} weight="bold" />
            </Link>
            <a className="button secondary" href="#architecture">
              Inspect architecture
            </a>
          </div>
        </div>
        <Image
          className="hero-art"
          src="/keyforge-vault.png"
          alt="Precision-machined vault core representing cryptographic access control"
          fill
          priority
          sizes="(max-width: 720px) 110vw, 68vw"
        />
      </section>

      <section className="trust-strip" aria-label="Security properties">
        <div className="trust-item">
          <ShieldCheck size={21} aria-hidden="true" />
          <strong>Ed25519 signed</strong>
          <span>Every successful client response</span>
        </div>
        <div className="trust-item">
          <Key size={21} aria-hidden="true" />
          <strong>Hashed secrets</strong>
          <span>Keys are never stored in plaintext</span>
        </div>
        <div className="trust-item">
          <Fingerprint size={21} aria-hidden="true" />
          <strong>Device aware</strong>
          <span>Configurable installation limits</span>
        </div>
        <div className="trust-item">
          <BracketsCurly size={21} aria-hidden="true" />
          <strong>API first</strong>
          <span>Client and seller contracts included</span>
        </div>
      </section>

      <section className="public-section" id="capabilities">
        <h2>One control plane. Every product.</h2>
        <p>
          Each application gets isolated users, plans, licenses, signing keys, seller keys, webhooks, sessions, and audit history.
        </p>
        <div className="feature-layout">
          <article className="feature-primary">
            <div>
              <h3>Server truth, verified locally</h3>
              <p>
                Product clients verify signed responses with a public key. Private signing material never leaves your server.
              </p>
            </div>
            <pre className="code-block" aria-label="Client response example">{`{
  "success": true,
  "data": {
    "license": {
      "status": "ACTIVE",
      "plan": "Standard"
    },
    "nonce": "client-nonce"
  },
  "algorithm": "Ed25519",
  "signature": "base64url-signature"
}`}</pre>
          </article>
          <article className="feature-secondary">
            <div>
              <h3>Immediate enforcement</h3>
              <p>Suspension and revocation terminate active sessions. Heartbeats re-check server state.</p>
            </div>
            <span className="badge good">Revocation aware</span>
          </article>
          <article className="feature-secondary">
            <div>
              <h3>Operational evidence</h3>
              <p>Administrative changes are attributed and recorded with request metadata.</p>
            </div>
            <span className="badge">Append-only audit</span>
          </article>
          <article className="feature-primary" id="architecture">
            <div>
              <h3>Portable by design</h3>
              <p>Run one stateless web service against PostgreSQL. Scale horizontally when product traffic grows.</p>
            </div>
            <pre className="code-block" aria-label="Deployment architecture">{`product client
      |
      | HTTPS + nonce
      v
Keyforge API  --> PostgreSQL
      |
      | signed webhook
      v
your operations stack`}</pre>
          </article>
        </div>
      </section>

      <footer className="public-footer">
        <Brand />
        <span>Self-hosted software licensing and authentication.</span>
      </footer>
    </main>
  );
}
