"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  loginAction,
  setupAction,
  verifyEmailOtpLoginAction,
  type AuthActionState,
} from "@/app/actions/auth-actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialState);
  const [emailState, emailAction] = useActionState(verifyEmailOtpLoginAction, initialState);
  const [method, setMethod] = useState<"totp" | "email">("totp");

  if (state.stage === "email-code" && state.challengeToken) {
    return (
      <form action={emailAction} className="form-stack">
        <input type="hidden" name="challengeToken" value={state.challengeToken} />
        {(emailState.error || state.error) && <div className="alert error" role="alert">{emailState.error || state.error}</div>}
        <div className="delivery-notice">
          <strong>Check your email</strong>
          <span>Code sent to {state.emailHint}. It expires in {state.expiresInMinutes} minutes.</span>
        </div>
        <div className="field">
          <label htmlFor="email-code">Six-digit email code</label>
          <input
            className="input mono otp-input"
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
          />
        </div>
        <SubmitButton pendingLabel="Verifying...">Verify and sign in</SubmitButton>
        <a href="/login" className="button secondary">Return to password</a>
      </form>
    );
  }

  return (
    <form action={action} className="form-stack">
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <fieldset className="mfa-methods">
        <legend>Verification method</legend>
        <div className="mfa-method-grid">
          <label className={method === "totp" ? "mfa-method active" : "mfa-method"}>
            <input type="radio" name="method" value="totp" checked={method === "totp"} onChange={() => setMethod("totp")} />
            <span><strong>Authenticator app</strong><small>Works offline</small></span>
          </label>
          <label className={method === "email" ? "mfa-method active" : "mfa-method"}>
            <input type="radio" name="method" value="email" checked={method === "email"} onChange={() => setMethod("email")} />
            <span><strong>Email code</strong><small>Sent after password</small></span>
          </label>
        </div>
      </fieldset>
      {method === "totp" ? (
        <div className="field">
          <label htmlFor="totp">Authenticator code</label>
          <input
            className="input mono otp-input"
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            aria-describedby="totp-help"
          />
          <p className="helper" id="totp-help">Leave blank when two-factor authentication has not been enabled.</p>
        </div>
      ) : (
        <p className="method-helper">After your password is verified, we will send a single-use code to your administrator email.</p>
      )}
      <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
      <Link href="/" className="button secondary">Return home</Link>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupAction, initialState);
  return (
    <form action={action} className="form-stack">
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input className="input" id="name" name="name" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="organization">Organization</label>
        <input className="input" id="organization" name="organization" autoComplete="organization" required />
      </div>
      <div className="field">
        <label htmlFor="email">Owner email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Owner password</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          minLength={15}
          maxLength={200}
          autoComplete="new-password"
          required
          aria-describedby="password-help"
        />
        <p className="helper" id="password-help">Use a unique passphrase with at least 15 characters.</p>
      </div>
      <SubmitButton pendingLabel="Initializing...">Initialize Keyforge</SubmitButton>
    </form>
  );
}
