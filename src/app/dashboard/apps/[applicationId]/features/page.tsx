import { ApplicationHeading } from "@/components/application-heading";
import { CompatibilityForm } from "@/components/compatibility-form";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/lib/db";
import { formatDate, requireApplication } from "@/lib/dashboard-data";
import {
  createAccessRuleAction,
  createBuildAction,
  createChatChannelAction,
  createNotificationChannelAction,
  createRemoteFunctionAction,
  createVariableAction,
  deleteFeatureAction,
  uploadManagedFileAction,
} from "@/app/actions/feature-actions";

function DeleteFeature({ applicationId, id, type }: { applicationId: string; id: string; type: string }) {
  return (
    <form action={deleteFeatureAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="type" value={type} />
      <button className="button secondary small" type="submit">Delete</button>
    </form>
  );
}

export default async function ApplicationFeaturesPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const [plans, variables, builds, files, rules, functions, channels, notifications] = await Promise.all([
    db.plan.findMany({ where: { applicationId }, orderBy: { name: "asc" } }),
    db.applicationVariable.findMany({ where: { applicationId }, orderBy: { key: "asc" } }),
    db.buildArtifact.findMany({ where: { applicationId }, orderBy: { updatedAt: "desc" } }),
    db.managedFile.findMany({ where: { applicationId }, include: { plan: true }, orderBy: { updatedAt: "desc" } }),
    db.accessRule.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } }),
    db.remoteFunction.findMany({ where: { applicationId }, include: { requiredPlan: true }, orderBy: { name: "asc" } }),
    db.chatChannel.findMany({ where: { applicationId }, include: { _count: { select: { messages: true } } }, orderBy: { name: "asc" } }),
    db.notificationChannel.findMany({ where: { applicationId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <main className="page">
      <ApplicationHeading application={application} />

      <div className="split-panels">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Runtime variables</h2><p className="panel-copy">Signed values delivered by the config API.</p></div></div>
          <div className="panel-body">
            <form action={createVariableAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="variable-key">Key</label><input className="input mono" id="variable-key" name="key" required /></div><div className="field"><label htmlFor="variable-visibility">Visibility</label><select className="select" id="variable-visibility" name="visibility"><option value="AUTHENTICATED">Authenticated</option><option value="PUBLIC">Public</option><option value="SERVER">Server only</option></select></div></div>
              <div className="field"><label htmlFor="variable-value">Value</label><textarea className="textarea" id="variable-value" name="value" required /></div>
              <SubmitButton pendingLabel="Saving...">Save variable</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{variables.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.key}</strong><span>{item.visibility} / {item.value.slice(0, 100)}</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="variable" /></div>)}</div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Build integrity</h2><p className="panel-copy">Publish platform hashes and trusted downloads.</p></div></div>
          <div className="panel-body">
            <form action={createBuildAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="build-version">Version</label><input className="input mono" id="build-version" name="version" required /></div><div className="field"><label htmlFor="build-platform">Platform</label><input className="input" id="build-platform" name="platform" defaultValue="windows-x64" required /></div></div>
              <div className="field"><label htmlFor="build-hash">SHA-256</label><input className="input mono" id="build-hash" name="sha256" minLength={64} maxLength={64} required /></div>
              <div className="field"><label htmlFor="build-url">Download URL</label><input className="input" id="build-url" name="downloadUrl" type="url" /></div>
              <SubmitButton pendingLabel="Publishing...">Publish build</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{builds.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.version} / {item.platform}</strong><span className="mono">{item.sha256.slice(0, 18)}… / {formatDate(item.updatedAt)}</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="build" /></div>)}</div>
        </section>
      </div>

      <div className="split-panels section-gap">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Protected files</h2><p className="panel-copy">Session-authenticated binary delivery with plan gates and hashes.</p></div></div>
          <div className="panel-body">
            <form action={uploadManagedFileAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="file-name">API name</label><input className="input mono" id="file-name" name="name" required /></div><div className="field"><label htmlFor="file-plan">Required plan</label><select className="select" id="file-plan" name="planId"><option value="">All plans</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div></div>
              <div className="field"><label htmlFor="managed-file">File</label><input className="input" id="managed-file" name="file" type="file" required /></div>
              <SubmitButton pendingLabel="Uploading...">Upload protected file</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{files.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.name}</strong><span>{item.originalName} / {(item.size / 1024).toFixed(1)} KB / {item.plan?.name || "All plans"}</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="file" /></div>)}</div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Access policies</h2><p className="panel-copy">Hashed deny rules and allowlists for devices, users, IPs, or licenses.</p></div></div>
          <div className="panel-body">
            <form action={createAccessRuleAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="rule-effect">Effect</label><select className="select" id="rule-effect" name="effect"><option value="DENY">Deny</option><option value="ALLOW">Allowlist</option></select></div><div className="field"><label htmlFor="rule-subject">Subject</label><select className="select" id="rule-subject" name="subject"><option value="IP">IP address</option><option value="INSTALLATION">Installation</option><option value="USERNAME">Username</option><option value="LICENSE">License key</option></select></div></div>
              <div className="field"><label htmlFor="rule-value">Exact value</label><input className="input mono" id="rule-value" name="value" required /></div>
              <div className="form-grid"><div className="field"><label htmlFor="rule-reason">Reason</label><input className="input" id="rule-reason" name="reason" /></div><div className="field"><label htmlFor="rule-expiry">Expires</label><input className="input" id="rule-expiry" name="expiresAt" type="datetime-local" /></div></div>
              <SubmitButton pendingLabel="Saving...">Add access rule</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{rules.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.effect} {item.subject}: {item.valuePreview}</strong><span>{item.reason || "No reason"} / expires {formatDate(item.expiresAt)}</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="rule" /></div>)}</div>
        </section>
      </div>

      <div className="split-panels section-gap">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Remote functions</h2><p className="panel-copy">Signed server-defined JSON responses, optionally plan restricted.</p></div></div>
          <div className="panel-body">
            <form action={createRemoteFunctionAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="function-name">Name</label><input className="input mono" id="function-name" name="name" required /></div><div className="field"><label htmlFor="function-plan">Required plan</label><select className="select" id="function-plan" name="requiredPlanId"><option value="">All plans</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div></div>
              <div className="field"><label htmlFor="function-response">Response JSON</label><textarea className="textarea" id="function-response" name="response" defaultValue={'{"enabled":true}'} required /></div>
              <div className="field"><label htmlFor="function-rate">Calls per minute</label><input className="input mono" id="function-rate" name="rateLimitPerMinute" type="number" min={1} max={10000} defaultValue={60} required /></div>
              <SubmitButton pendingLabel="Saving...">Save remote function</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{functions.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.name}</strong><span>{item.requiredPlan?.name || "All plans"} / {item.rateLimitPerMinute} calls per minute</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="function" /></div>)}</div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Product chat</h2><p className="panel-copy">Authenticated user channels with configurable pacing.</p></div></div>
          <div className="panel-body">
            <form action={createChatChannelAction} className="form-stack">
              <input type="hidden" name="applicationId" value={applicationId} />
              <div className="form-grid"><div className="field"><label htmlFor="channel-name">Channel</label><input className="input mono" id="channel-name" name="name" defaultValue="general" required /></div><div className="field"><label htmlFor="channel-delay">Delay seconds</label><input className="input mono" id="channel-delay" name="delaySeconds" type="number" min={1} max={3600} defaultValue={3} required /></div></div>
              <SubmitButton pendingLabel="Creating...">Create channel</SubmitButton>
            </form>
          </div>
          <div className="audit-list">{channels.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>#{item.name}</strong><span>{item.delaySeconds}s delay / {item._count.messages} messages</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="channel" /></div>)}</div>
        </section>
      </div>

      <section className="panel section-gap">
        <div className="panel-header"><div><h2 className="panel-title">Discord, Telegram, and notification bots</h2><p className="panel-copy">Send selected application events to an encrypted outbound endpoint. Generic channels can include an HMAC signing secret.</p></div></div>
        <div className="panel-body">
          <form action={createNotificationChannelAction} className="form-stack">
            <input type="hidden" name="applicationId" value={applicationId} />
            <div className="form-grid"><div className="field"><label htmlFor="notification-name">Name</label><input className="input" id="notification-name" name="name" required /></div><div className="field"><label htmlFor="notification-kind">Type</label><select className="select" id="notification-kind" name="kind"><option value="DISCORD">Discord webhook</option><option value="TELEGRAM">Telegram bot endpoint</option><option value="GENERIC">Generic JSON</option></select></div></div>
            <div className="field"><label htmlFor="notification-endpoint">HTTPS endpoint</label><input className="input" id="notification-endpoint" name="endpoint" type="url" required /></div>
            <div className="form-grid"><div className="field"><label htmlFor="notification-events">Events</label><input className="input mono" id="notification-events" name="events" defaultValue="license.activated,user.created" required /></div><div className="field"><label htmlFor="notification-secret">Generic HMAC secret</label><input className="input mono" id="notification-secret" name="secret" type="password" /></div></div>
            <SubmitButton pendingLabel="Saving...">Save notification channel</SubmitButton>
          </form>
        </div>
        <div className="audit-list">{notifications.map((item) => <div className="audit-item feature-row" key={item.id}><div><strong>{item.name}</strong><span>{item.kind} / {item.events.join(", ")}</span></div><DeleteFeature applicationId={applicationId} id={item.id} type="notification" /></div>)}</div>
      </section>

      <section className="panel section-gap">
        <div className="panel-header"><div><h2 className="panel-title">KeyAuth-compatible API</h2><p className="panel-copy">Migration endpoint for KeyAuth-style init, license, register, login, check, var, chatget, and chatsend calls.</p></div><span className={`badge ${application.compatEnabled ? "good" : "warn"}`}>{application.compatEnabled ? "Enabled" : "Disabled"}</span></div>
        <div className="panel-body"><CompatibilityForm applicationId={applicationId} defaultName={application.compatName || application.slug} defaultOwnerId={application.compatOwnerId || application.organizationId.slice(0, 12)} /></div>
      </section>
    </main>
  );
}
