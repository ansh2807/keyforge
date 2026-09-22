"use client";

import { useActionState } from "react";
import {
  createApiKeyAction,
  createWebhookAction,
  type SecretActionState,
} from "@/app/actions/dashboard-actions";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";

const initialState: SecretActionState = {};

function SecretResult({ state }: { state: SecretActionState }) {
  if (state.error) return <div className="alert error" role="alert">{state.error}</div>;
  if (!state.secret) return null;
  return (
    <div className="secret-box">
      <div className="alert success" role="status">{state.success}</div>
      <span className="secret-value">{state.secret}</span>
      <CopyButton value={state.secret} />
    </div>
  );
}

export function ApiKeyForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState(createApiKeyAction, initialState);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="applicationId" value={applicationId} />
      <SecretResult state={state} />
      <div className="field"><label htmlFor="api-key-name">Key name</label><input className="input" id="api-key-name" name="name" placeholder="Production automation" maxLength={80} required /></div>
      <SubmitButton pendingLabel="Creating...">Create seller key</SubmitButton>
    </form>
  );
}

export function WebhookForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState(createWebhookAction, initialState);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="applicationId" value={applicationId} />
      <SecretResult state={state} />
      <div className="field"><label htmlFor="webhook-url">Endpoint URL</label><input className="input" id="webhook-url" name="url" type="url" placeholder="https://example.com/webhooks/keyforge" required /></div>
      <div className="field"><label htmlFor="webhook-description">Description</label><input className="input" id="webhook-description" name="description" maxLength={120} placeholder="Billing and fulfillment" /></div>
      <div className="field"><label htmlFor="webhook-events">Events</label><input className="input mono" id="webhook-events" name="events" defaultValue="license.activated,user.created" required aria-describedby="events-help" /><p className="helper" id="events-help">Comma-separated event names. Use * for every event.</p></div>
      <SubmitButton pendingLabel="Creating...">Create webhook</SubmitButton>
    </form>
  );
}
