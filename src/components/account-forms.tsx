"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  beginTotpAction,
  beginEmailOtpSetupAction,
  changePasswordAction,
  disableEmailOtpAction,
  enableEmailOtpAction,
  enableTotpAction,
  type EmailOtpActionState,
  type TotpActionState,
} from "@/app/actions/account-actions";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";

const initialState: TotpActionState = {};

export function TotpSetupForm() {
  const [beginState, beginAction] = useActionState(beginTotpAction, initialState);
  const [verifyState, verifyAction] = useActionState(enableTotpAction, initialState);
  if (!beginState.qrCode || !beginState.secret) {
    return (
      <form action={beginAction} className="form-stack">
        {beginState.error && <div className="alert error" role="alert">{beginState.error}</div>}
        <p className="helper">Use any TOTP-compatible authenticator. Setup replaces an unfinished secret.</p>
        <SubmitButton pendingLabel="Preparing...">Begin setup</SubmitButton>
      </form>
    );
  }
  return (
    <div className="form-stack">
      <Image src={beginState.qrCode} alt="Two-factor authentication QR code" width={240} height={240} unoptimized style={{ borderRadius: 10 }} />
      <div className="secret-box"><span className="secret-value">{beginState.secret}</span><CopyButton value={beginState.secret} /></div>
      <form action={verifyAction} className="form-stack">
        {verifyState.error && <div className="alert error" role="alert">{verifyState.error}</div>}
        {verifyState.success && <div className="alert success" role="status">{verifyState.success}</div>}
        <div className="field"><label htmlFor="totp-verify">Six-digit code</label><input className="input mono" id="totp-verify" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></div>
        <SubmitButton pendingLabel="Verifying...">Verify and enable</SubmitButton>
      </form>
    </div>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialState);
  return (
    <form action={action} className="form-stack">
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {state.success && <div className="alert success" role="status">{state.success}</div>}
      <div className="field"><label htmlFor="current-password">Current password</label><input className="input" id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
      <div className="field"><label htmlFor="new-password">New password</label><input className="input" id="new-password" name="newPassword" type="password" minLength={15} maxLength={200} autoComplete="new-password" required /><p className="helper">Use at least 15 characters. All existing sessions will be ended.</p></div>
      <SubmitButton pendingLabel="Changing...">Change password</SubmitButton>
    </form>
  );
}

const initialEmailState: EmailOtpActionState = {};

export function EmailOtpSetupForm({
  configured,
  email,
  enabled,
}: {
  configured: boolean;
  email: string;
  enabled: boolean;
}) {
  const [beginState, beginAction] = useActionState(beginEmailOtpSetupAction, initialEmailState);
  const [verifyState, verifyAction] = useActionState(enableEmailOtpAction, initialEmailState);
  const [disableState, disableAction] = useActionState(disableEmailOtpAction, initialEmailState);

  if (enabled) {
    return (
      <form action={disableAction} className="form-stack">
        <div className="alert success">Email codes are active for {email}.</div>
        {disableState.error && <div className="alert error" role="alert">{disableState.error}</div>}
        {disableState.success && <div className="alert success" role="status">{disableState.success}</div>}
        <div className="field">
          <label htmlFor="disable-email-password">Current password</label>
          <input className="input" id="disable-email-password" name="password" type="password" autoComplete="current-password" required />
          <p className="helper">Your password is required to remove this sign-in method.</p>
        </div>
        <SubmitButton pendingLabel="Disabling..." className="button secondary">Disable email verification</SubmitButton>
      </form>
    );
  }

  if (!configured) {
    return (
      <div className="form-stack">
        <div className="alert error">Email delivery is not configured on this server.</div>
        <p className="helper">Add Gmail SMTP settings to the production environment, then return here to verify {email}.</p>
      </div>
    );
  }

  if (!beginState.challengeToken || !beginState.emailHint) {
    return (
      <form action={beginAction} className="form-stack">
        {beginState.error && <div className="alert error" role="alert">{beginState.error}</div>}
        <p className="helper">We will send a one-time code to {email}. The method is enabled only after that code is verified.</p>
        <SubmitButton pendingLabel="Sending...">Send verification code</SubmitButton>
      </form>
    );
  }

  if (verifyState.success) {
    return <div className="alert success" role="status">{verifyState.success} Refresh this page to see the active status.</div>;
  }

  return (
    <form action={verifyAction} className="form-stack">
      <input type="hidden" name="challengeToken" value={beginState.challengeToken} />
      {(verifyState.error || beginState.error) && <div className="alert error" role="alert">{verifyState.error || beginState.error}</div>}
      <div className="delivery-notice"><strong>Code sent</strong><span>{beginState.emailHint} · expires in {beginState.expiresInMinutes} minutes</span></div>
      <div className="field">
        <label htmlFor="enable-email-code">Six-digit email code</label>
        <input className="input mono otp-input" id="enable-email-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
      </div>
      <SubmitButton pendingLabel="Verifying...">Verify and enable</SubmitButton>
    </form>
  );
}
