"use client";

import { useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

type SessionData = {
  sessionToken: string;
  sessionExpiresAt: string;
  application: { name: string; version: string; heartbeatSeconds: number };
  license: { plan: string; expiresAt: string | null; entitlements: unknown };
  user: { username: string; email?: string | null } | null;
};

type Signed<T> = { success: true; data: T };
type Failure = { success: false; error?: { message?: string }; message?: string };

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x");
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const request = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await request.json() as Signed<T> | Failure;
  if (!result.success) throw new Error(result.error?.message || result.message || "The request failed.");
  return result.data;
}

export function CustomerPortal({
  appId,
  appName,
  allowRegistration,
  loginToken,
}: {
  appId: string;
  appName: string;
  allowRegistration: boolean;
  loginToken?: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [installationId] = useState(() => {
    if (typeof window === "undefined") return "server-render-installation";
    const key = `keyforge-installation-${appId}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  });
  const [session, setSession] = useState<SessionData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [totpUri, setTotpUri] = useState("");

  useEffect(() => {
    if (!loginToken || !installationId || session) return;
    let active = true;
    post<SessionData>("/api/v1/client/login-token/exchange", {
      appId,
      loginToken,
      installationId,
      installationLabel: navigator.userAgent.slice(0, 120),
      nonce: nonce(),
    }).then((data) => {
      if (!active) return;
      setSession(data);
      setMessage(`Signed in as ${data.user?.username}.`);
      history.replaceState({}, "", `/portal/${appId}`);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "The login link is invalid.");
    });
    return () => { active = false; };
  }, [appId, installationId, loginToken, session]);

  async function authenticate(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const path = mode === "login" ? "/api/v1/client/login" : "/api/v1/client/register";
      const data = await post<SessionData>(path, {
        appId,
        username: String(form.get("username") || ""),
        password: String(form.get("password") || ""),
        ...(mode === "register" ? { licenseKey: String(form.get("licenseKey") || ""), email: String(form.get("email") || "") || undefined } : { totp: String(form.get("totp") || "") || undefined }),
        installationId,
        installationLabel: navigator.userAgent.slice(0, 120),
        nonce: nonce(),
      });
      setSession(data);
      setMessage(`Signed in as ${data.user?.username || "licensed device"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function passkeyLogin(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const username = String(form.get("username") || "");
      const optionData = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/v1/client/passkeys/login/options", { appId, username });
      const credential = await startAuthentication({ optionsJSON: optionData.options });
      const data = await post<SessionData>("/api/v1/client/passkeys/login/verify", {
        appId,
        username,
        installationId,
        installationLabel: navigator.userAgent.slice(0, 120),
        nonce: nonce(),
        response: credential,
      });
      setSession(data);
      setMessage(`Signed in with a passkey as ${data.user?.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskey() {
    if (!session) return;
    setBusy(true);
    setMessage("");
    try {
      const requestNonce = nonce();
      const optionData = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/v1/client/passkeys/register/options", { appId, sessionToken: session.sessionToken, nonce: requestNonce });
      const credential = await startRegistration({ optionsJSON: optionData.options });
      await post("/api/v1/client/passkeys/register/verify", { appId, sessionToken: session.sessionToken, nonce: nonce(), name: "My passkey", response: credential });
      setMessage("Passkey registered successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function beginTotp() {
    if (!session) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await post<{ uri: string }>("/api/v1/client/totp/begin", { appId, sessionToken: session.sessionToken, nonce: nonce() });
      setTotpUri(data.uri);
      setMessage("Add the setup URI to your authenticator, then confirm a code.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authenticator setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(form: FormData) {
    if (!session) return;
    setBusy(true);
    try {
      await post("/api/v1/client/totp/confirm", { appId, sessionToken: session.sessionToken, nonce: nonce(), token: String(form.get("token") || "") });
      setTotpUri("");
      setMessage("Authenticator protection is enabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (session) await fetch("/api/v1/client/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId, sessionToken: session.sessionToken }) });
    setSession(null);
    setTotpUri("");
    setMessage("Signed out.");
  }

  if (session) {
    return (
      <div className="portal-stack">
        {message && <div className="alert success" role="status">{message}</div>}
        <div className="portal-summary">
          <div><span>User</span><strong>{session.user?.username || "License-only session"}</strong></div>
          <div><span>Plan</span><strong>{session.license.plan}</strong></div>
          <div><span>Expires</span><strong>{session.license.expiresAt ? new Date(session.license.expiresAt).toLocaleString() : "No expiry"}</strong></div>
          <div><span>Session</span><strong>{new Date(session.sessionExpiresAt).toLocaleTimeString()}</strong></div>
        </div>
        <section className="portal-tools">
          <div><h3>Passkeys</h3><p>Use Windows Hello, Touch ID, a phone, or a security key.</p><button className="button secondary" type="button" onClick={registerPasskey} disabled={busy || !session.user}>Add passkey</button></div>
          <div><h3>Authenticator app</h3><p>Require a six-digit code when signing in with a password.</p><button className="button secondary" type="button" onClick={beginTotp} disabled={busy || !session.user}>Set up authenticator</button></div>
        </section>
        {totpUri && <form className="form-stack portal-totp" action={confirmTotp}><div className="field"><label>Setup URI</label><textarea className="textarea" value={totpUri} readOnly /></div><div className="field"><label htmlFor="portal-code">Six-digit code</label><input className="input mono" id="portal-code" name="token" inputMode="numeric" pattern="[0-9]{6}" required /></div><button className="button" type="submit" disabled={busy}>Confirm authenticator</button></form>}
        <button className="button secondary" type="button" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="portal-stack">
      <div className="portal-switch" role="tablist" aria-label="Authentication mode">
        <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>Sign in</button>
        {allowRegistration && <button className={mode === "register" ? "active" : ""} type="button" onClick={() => setMode("register")}>Register</button>}
      </div>
      {message && <div className={message.toLowerCase().includes("signed in") ? "alert success" : "alert error"} role="status">{message}</div>}
      <form action={authenticate} className="form-stack">
        <div className="field"><label htmlFor="portal-username">Username or email</label><input className="input" id="portal-username" name="username" autoComplete="username webauthn" required /></div>
        {mode === "register" && <div className="field"><label htmlFor="portal-email">Email</label><input className="input" id="portal-email" name="email" type="email" autoComplete="email" /></div>}
        {mode === "register" && <div className="field"><label htmlFor="portal-license">License key</label><input className="input mono" id="portal-license" name="licenseKey" autoComplete="off" required /></div>}
        <div className="field"><label htmlFor="portal-password">Password</label><input className="input" id="portal-password" name="password" type="password" minLength={mode === "register" ? 12 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} required /></div>
        {mode === "login" && <div className="field"><label htmlFor="portal-totp">Authenticator code</label><input className="input mono" id="portal-totp" name="totp" inputMode="numeric" pattern="[0-9]{6}" /></div>}
        <button className="button" type="submit" disabled={busy || !installationId}>{busy ? "Working…" : mode === "login" ? "Sign in" : `Register for ${appName}`}</button>
      </form>
      {mode === "login" && <form action={passkeyLogin} className="form-stack passkey-login"><input type="hidden" name="username" value="" /><button className="button secondary" type="button" disabled={busy} onClick={() => { const username = document.querySelector<HTMLInputElement>("#portal-username")?.value || ""; const data = new FormData(); data.set("username", username); void passkeyLogin(data); }}>Sign in with a passkey</button></form>}
    </div>
  );
}
