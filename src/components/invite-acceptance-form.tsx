"use client";

import { useActionState } from "react";
import { acceptTeamInviteAction } from "@/app/actions/team-actions";
import { SubmitButton } from "@/components/submit-button";

export function InviteAcceptanceForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptTeamInviteAction, {});
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="token" value={token} />
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      <div className="field"><label>Email</label><input className="input" value={email} disabled /></div>
      <div className="field"><label htmlFor="invite-name">Your name</label><input className="input" id="invite-name" name="name" minLength={2} maxLength={80} required /></div>
      <div className="field"><label htmlFor="invite-password">Password</label><input className="input" id="invite-password" name="password" type="password" minLength={12} maxLength={200} required aria-describedby="invite-password-help" /><p className="helper" id="invite-password-help">Use at least 12 characters. Existing administrators must enter their current password.</p></div>
      <SubmitButton pendingLabel="Joining...">Join workspace</SubmitButton>
    </form>
  );
}
