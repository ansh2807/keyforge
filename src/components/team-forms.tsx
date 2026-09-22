"use client";

import { useActionState } from "react";
import { createResellerAction, createTeamInviteAction } from "@/app/actions/team-actions";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";

export function TeamInviteForm() {
  const [state, action] = useActionState(createTeamInviteAction, {});
  return (
    <form action={action} className="form-stack">
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {state.secret && (
        <div className="secret-box">
          <div className="alert success" role="status">{state.success}</div>
          <span className="secret-value">{state.secret}</span>
          <CopyButton value={state.secret} />
        </div>
      )}
      <div className="form-grid">
        <div className="field"><label htmlFor="invite-email">Email</label><input className="input" id="invite-email" name="email" type="email" required /></div>
        <div className="field"><label htmlFor="invite-role">Role</label><select className="select" id="invite-role" name="role"><option value="ADMIN">Administrator</option><option value="ANALYST">Analyst</option></select></div>
      </div>
      <SubmitButton pendingLabel="Creating...">Create invite link</SubmitButton>
    </form>
  );
}

export function ResellerForm({ applications }: { applications: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createResellerAction, {});
  return (
    <form action={action} className="form-stack">
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {state.secret && <div className="secret-box"><div className="alert success" role="status">{state.success}</div><span className="secret-value">{state.secret}</span><CopyButton value={state.secret} /></div>}
      <div className="form-grid"><div className="field"><label htmlFor="reseller-name">Name</label><input className="input" id="reseller-name" name="name" required /></div><div className="field"><label htmlFor="reseller-app">Application</label><select className="select" id="reseller-app" name="applicationId" required>{applications.map((application) => <option key={application.id} value={application.id}>{application.name}</option>)}</select></div></div>
      <div className="form-grid"><div className="field"><label htmlFor="reseller-credits">Issuance credits</label><input className="input mono" id="reseller-credits" name="credits" type="number" min={0} max={1000000} defaultValue={100} required /></div><div className="field"><label htmlFor="reseller-expiry">Expires</label><input className="input" id="reseller-expiry" name="expiresAt" type="datetime-local" /></div></div>
      <SubmitButton pendingLabel="Creating...">Create reseller credential</SubmitButton>
    </form>
  );
}
