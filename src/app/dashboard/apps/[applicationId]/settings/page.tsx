import { ApplicationHeading } from "@/components/application-heading";
import { ApiKeyForm, WebhookForm } from "@/components/secret-forms";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { requireApplication, formatDate, statusBadge } from "@/lib/dashboard-data";
import {
  createPlanAction,
  revokeApiKeyAction,
  toggleWebhookAction,
  updateApplicationAction,
} from "@/app/actions/dashboard-actions";

export default async function ApplicationSettingsPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const [plans, apiKeys, webhooks] = await Promise.all([
    db.plan.findMany({ where: { applicationId }, orderBy: { createdAt: "asc" } }),
    db.apiKey.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
    db.webhookEndpoint.findMany({ where: { applicationId }, include: { _count: { select: { deliveries: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <main className="page">
      <ApplicationHeading application={application} />
      <section className="panel">
        <div className="panel-header"><div><h2 className="panel-title">Runtime settings</h2><p className="panel-copy">Changes apply to new requests immediately.</p></div></div>
        <div className="panel-body">
          <form action={updateApplicationAction} className="form-stack">
            <input type="hidden" name="applicationId" value={applicationId} />
            <div className="form-grid">
              <div className="field"><label htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={application.name} maxLength={80} required /></div>
              <div className="field"><label htmlFor="version">Version</label><input className="input mono" id="version" name="version" defaultValue={application.version} maxLength={40} required /></div>
              <div className="field"><label htmlFor="status">Status</label><select className="select" id="status" name="status" defaultValue={application.status}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option></select></div>
              <div className="field"><label htmlFor="downloadUrl">Download URL</label><input className="input" id="downloadUrl" name="downloadUrl" type="url" defaultValue={application.downloadUrl || ""} placeholder="https://downloads.example.com/latest" /></div>
              <div className="field"><label htmlFor="maxDevicesDefault">Default device limit</label><input className="input mono" id="maxDevicesDefault" name="maxDevicesDefault" type="number" min={1} max={50} defaultValue={application.maxDevicesDefault} required /></div>
              <div className="field"><label htmlFor="sessionMinutes">Session minutes</label><input className="input mono" id="sessionMinutes" name="sessionMinutes" type="number" min={5} max={1440} defaultValue={application.sessionMinutes} required /></div>
              <div className="field"><label htmlFor="heartbeatSeconds">Heartbeat seconds</label><input className="input mono" id="heartbeatSeconds" name="heartbeatSeconds" type="number" min={15} max={3600} defaultValue={application.heartbeatSeconds} required /></div>
            </div>
            <label className="checkbox-field"><input type="checkbox" name="allowUserRegistration" defaultChecked={application.allowUserRegistration} /><span>Allow customers to create product users with an unused license.</span></label>
            <SubmitButton pendingLabel="Saving...">Save runtime settings</SubmitButton>
          </form>
        </div>
      </section>

      <div className="split-panels" style={{ marginTop: 20 }}>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Create plan</h2><p className="panel-copy">Plans group duration and entitlement claims.</p></div></div>
          <div className="panel-body">
            <form action={createPlanAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="field"><label htmlFor="plan-name">Name</label><input className="input" id="plan-name" name="name" maxLength={80} required /></div>
              <div className="field"><label htmlFor="plan-description">Description</label><input className="input" id="plan-description" name="description" maxLength={250} /></div>
              <div className="field"><label htmlFor="plan-days">Duration days</label><input className="input mono" id="plan-days" name="durationDays" type="number" min={1} max={3650} placeholder="No expiry" /></div>
              <div className="field"><label htmlFor="plan-entitlements">Entitlements JSON</label><textarea className="textarea" id="plan-entitlements" name="entitlements" defaultValue={'{\n  "product": true\n}'} required /></div>
              <SubmitButton pendingLabel="Creating...">Create plan</SubmitButton>
            </form>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Existing plans</h2><p className="panel-copy">Current claims available for issuance.</p></div></div>
          <div className="audit-list">{plans.map((plan) => <div className="audit-item" key={plan.id}><strong>{plan.name}</strong><span>{plan.durationDays ? `${plan.durationDays} days` : "No expiry"} / {JSON.stringify(plan.entitlements)}</span></div>)}</div>
        </section>
      </div>

      <div className="split-panels" style={{ marginTop: 20 }}>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Seller API keys</h2><p className="panel-copy">Scoped credentials for trusted server automation.</p></div></div>
          <div className="panel-body"><ApiKeyForm applicationId={applicationId} /></div>
          {apiKeys.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Key</th><th>Status</th><th>Last used</th><th>Action</th></tr></thead><tbody>{apiKeys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong><br /><span className="mono helper">{key.prefix}...</span></td><td><span className={`badge ${key.revokedAt ? "bad" : "good"}`}>{key.revokedAt ? "Revoked" : "Active"}</span></td><td>{formatDate(key.lastUsedAt)}</td><td>{!key.revokedAt && <form action={revokeApiKeyAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="keyId" value={key.id} /><button className="button secondary small" type="submit">Revoke</button></form>}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Webhooks</h2><p className="panel-copy">Signed event delivery to your systems.</p></div></div>
          <div className="panel-body"><WebhookForm applicationId={applicationId} /></div>
          {webhooks.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Endpoint</th><th>Status</th><th>Deliveries</th><th>Action</th></tr></thead><tbody>{webhooks.map((webhook) => <tr key={webhook.id}><td><strong>{webhook.description || "Webhook"}</strong><br /><span className="helper">{webhook.url}</span></td><td><span className={`badge ${webhook.active ? "good" : "warn"}`}>{webhook.active ? "Active" : "Paused"}</span></td><td className="mono">{webhook._count.deliveries}</td><td><form action={toggleWebhookAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="webhookId" value={webhook.id} /><input type="hidden" name="active" value={webhook.active ? "false" : "true"} /><button className="button secondary small" type="submit">{webhook.active ? "Pause" : "Enable"}</button></form></td></tr>)}</tbody></table></div>}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header"><div><h2 className="panel-title">Signing identity</h2><p className="panel-copy">The private key is encrypted. Only the public key is exposed.</p></div><span className={`badge ${statusBadge(application.status)}`}>{application.status}</span></div>
        <div className="details-grid"><div className="detail"><span>Key ID</span><strong>{application.signingKeyId}</strong></div><div className="detail"><span>Created</span><strong>{formatDate(application.createdAt)}</strong></div><div className="detail" style={{ gridColumn: "1 / -1" }}><span>Public key</span><strong style={{ whiteSpace: "pre-wrap" }}>{application.signingPublicKey}</strong></div></div>
      </section>
    </main>
  );
}
