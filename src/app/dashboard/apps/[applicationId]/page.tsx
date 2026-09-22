import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ApplicationHeading } from "@/components/application-heading";
import { db } from "@/lib/db";
import { requireApplication, formatDate, statusBadge } from "@/lib/dashboard-data";

export default async function ApplicationOverviewPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const [licenseCount, activeLicenses, userCount, onlineSessions, recentEvents] = await Promise.all([
    db.license.count({ where: { applicationId } }),
    db.license.count({ where: { applicationId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    db.endUser.count({ where: { applicationId } }),
    db.clientSession.count({ where: { applicationId, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.auditEvent.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" }, take: 7 }),
  ]);
  return (
    <main className="page">
      <ApplicationHeading application={application} />
      <section className="stats-grid" aria-label="Application statistics">
        <div className="stat"><span>Total licenses</span><strong>{licenseCount}</strong></div>
        <div className="stat"><span>Active licenses</span><strong>{activeLicenses}</strong></div>
        <div className="stat"><span>Registered users</span><strong>{userCount}</strong></div>
        <div className="stat"><span>Online sessions</span><strong>{onlineSessions}</strong></div>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Integration details</h2><p className="panel-copy">Public values safe to embed in your product client.</p></div></div>
          <div className="details-grid">
            <div className="detail"><span>Application ID</span><strong>{application.publicId}</strong></div>
            <div className="detail"><span>Signing key ID</span><strong>{application.signingKeyId}</strong></div>
            <div className="detail"><span>Version</span><strong>{application.version}</strong></div>
            <div className="detail"><span>Heartbeat</span><strong>{application.heartbeatSeconds}s</strong></div>
          </div>
          <div className="panel-body">
            <p className="helper">Retrieve the public verification key from <span className="mono">/api/v1/client/apps/{application.publicId}/keys</span>.</p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Recent events</h2><p className="panel-copy">Latest changes to this application.</p></div><Link href={`/dashboard/audit?app=${application.id}`}><ArrowRight size={17} /></Link></div>
          {recentEvents.length ? <div className="audit-list">{recentEvents.map((event) => <div className="audit-item" key={event.id}><strong>{event.action}</strong><span>{formatDate(event.createdAt)}</span></div>)}</div> : <div className="empty-state"><h3>No events yet</h3><p>License and settings changes will appear here.</p></div>}
        </section>
      </div>
      <div style={{ marginTop: 20 }} className="panel">
        <div className="panel-header"><div><h2 className="panel-title">Runtime policy</h2><p className="panel-copy">Enforcement settings currently served to clients.</p></div><span className={`badge ${statusBadge(application.status)}`}>{application.status}</span></div>
        <div className="details-grid">
          <div className="detail"><span>Session duration</span><strong>{application.sessionMinutes} minutes</strong></div>
          <div className="detail"><span>Default device limit</span><strong>{application.maxDevicesDefault}</strong></div>
          <div className="detail"><span>User registration</span><strong>{application.allowUserRegistration ? "Enabled" : "Disabled"}</strong></div>
          <div className="detail"><span>Created</span><strong>{formatDate(application.createdAt)}</strong></div>
        </div>
      </div>
    </main>
  );
}
