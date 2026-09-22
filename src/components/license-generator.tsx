"use client";

import { useActionState } from "react";
import { generateLicensesAction, type SecretActionState } from "@/app/actions/dashboard-actions";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";

const initialState: SecretActionState = {};

export function LicenseGenerator({
  applicationId,
  plans,
  defaultDevices,
}: {
  applicationId: string;
  plans: { id: string; name: string; durationDays: number | null }[];
  defaultDevices: number;
}) {
  const [state, action] = useActionState(generateLicensesAction, initialState);
  const joined = state.secrets?.join("\n") || "";
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="applicationId" value={applicationId} />
      {state.error && <div className="alert error" role="alert">{state.error}</div>}
      {state.success && <div className="alert success" role="status">{state.success}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="planId">Plan</label>
          <select className="select" id="planId" name="planId" required>
            {plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}{plan.durationDays ? ` / ${plan.durationDays} days` : " / no expiry"}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="count">Number of keys</label>
          <input className="input mono" id="count" name="count" type="number" min={1} max={100} defaultValue={1} required />
        </div>
        <div className="field">
          <label htmlFor="durationDays">Duration override</label>
          <input className="input mono" id="durationDays" name="durationDays" type="number" min={1} max={3650} placeholder="Use plan default" />
        </div>
        <div className="field">
          <label htmlFor="maxDevices">Device limit</label>
          <input className="input mono" id="maxDevices" name="maxDevices" type="number" min={1} max={50} defaultValue={defaultDevices} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="customerEmail">Customer email</label>
        <input className="input" id="customerEmail" name="customerEmail" type="email" placeholder="Optional" />
      </div>
      <div className="field">
        <label htmlFor="note">Internal note</label>
        <input className="input" id="note" name="note" maxLength={500} placeholder="Order, customer, or campaign reference" />
      </div>
      <SubmitButton pendingLabel="Generating...">Generate licenses</SubmitButton>
      {state.secrets && state.secrets.length > 0 && (
        <div className="secret-box">
          <div className="inline-actions">
            <strong>Plaintext keys</strong>
            <CopyButton value={joined} label="Copy all" />
          </div>
          <p className="helper">These values are shown once. Keyforge stores only keyed hashes.</p>
          <div className="secret-list">
            {state.secrets.map((secret) => <span className="secret-value" key={secret}>{secret}</span>)}
          </div>
        </div>
      )}
    </form>
  );
}
