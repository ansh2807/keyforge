import { ApplicationHeading } from "@/components/application-heading";
import { db } from "@/lib/db";
import { requireApplication, formatDate, statusBadge } from "@/lib/dashboard-data";
import { revokeClientSessionAction } from "@/app/actions/dashboard-actions";

export default async function SessionsPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const sessions = await db.clientSession.findMany({
    where: { applicationId },
    include: { user: true, license: true, activation: true },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  const now = new Date();
  return (
    <main className="page">
      <ApplicationHeading application={application} />
      <section className="panel">
        <div className="panel-header"><div><h2 className="panel-title">Client sessions</h2><p className="panel-copy">Opaque product sessions and their latest heartbeat state.</p></div><span className="badge">{sessions.length} shown</span></div>
        {sessions.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Session</th><th>Status</th><th>User</th><th>License</th><th>Device</th><th>Last seen</th><th>Expires</th><th>Action</th></tr></thead><tbody>{sessions.map((session) => {
          const status = session.revokedAt ? "REVOKED" : session.expiresAt <= now ? "EXPIRED" : "ACTIVE";
          return <tr key={session.id}><td className="mono">{session.id.slice(0, 12)}...</td><td><span className={`badge ${statusBadge(status)}`}>{status}</span></td><td>{session.user?.username || "License only"}</td><td className="mono">{session.license.keyPrefix}...{session.license.keyLastFour}</td><td>{session.activation.installationLabel || session.activation.id.slice(0, 10)}</td><td>{formatDate(session.lastSeenAt)}</td><td>{formatDate(session.expiresAt)}</td><td>{status === "ACTIVE" && <form action={revokeClientSessionAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="sessionId" value={session.id} /><button className="button secondary small" type="submit">Revoke</button></form>}</td></tr>;
        })}</tbody></table></div> : <div className="empty-state"><h3>No client sessions</h3><p>Sessions appear after a successful activation or login.</p></div>}
      </section>
    </main>
  );
}
