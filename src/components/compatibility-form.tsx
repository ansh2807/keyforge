"use client";

import { useActionState } from "react";
import { enableCompatibilityAction } from "@/app/actions/feature-actions";
import { SubmitButton } from "@/components/submit-button";
import { CopyButton } from "@/components/copy-button";

export function CompatibilityForm({
  applicationId,
  defaultName,
  defaultOwnerId,
}: {
  applicationId: string;
  defaultName: string;
  defaultOwnerId: string;
}) {
  const [state, action] = useActionState(enableCompatibilityAction, {});
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="applicationId" value={applicationId} />
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {state.secret && (
        <div className="secret-box">
          <div className="alert success" role="status">{state.success}</div>
          <span className="secret-value">{state.secret}</span>
          <CopyButton value={state.secret} />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="compat-name">Compatibility name</label>
          <input className="input mono" id="compat-name" name="name" defaultValue={defaultName} required />
        </div>
        <div className="field">
          <label htmlFor="compat-owner">Owner ID</label>
          <input className="input mono" id="compat-owner" name="ownerId" defaultValue={defaultOwnerId} required />
        </div>
      </div>
      <SubmitButton pendingLabel="Generating...">Enable or rotate compatibility secret</SubmitButton>
    </form>
  );
}
