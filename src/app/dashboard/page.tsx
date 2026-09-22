import Link from "next/link";
import { ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function DashboardPage() {
  const { organization } = await requireAdmin();
  const [applications, totalLicenses, activeLicenses, onlineSessions, recentAudit] = await Promise.all([
    db.application.findMany({
      where: { organizationId: organization.id, status: { not: "ARCHIVED" } },
      include: {
        _count: { select: { licenses: true, users: true } },
        clientSessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.license.count({ where: { application: { organizationId: organization.id } } }),
    db.license.count({
      where: {
        application: { organizationId: organization.id },
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
    db.clientSession.count({
      where: {
        application: { organizationId: organization.id },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
    db.auditEvent.findMany({
      where: { organizationId: organization.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Control plane</h1>
          <p>Current access state across every product in {organization.name}.</p>
        </div>
        <Link className="button" href="/dashboard/apps/new"><Plus size={17} /> New application</Link>
      </div>

      <section className="stats-grid" aria-label="Organization statistics">
        <div className="stat"><span>Applications</span><strong>{applications.length}</strong></div>
        <div className="stat"><span>Total licenses</span><strong>{totalLicenses}</strong></div>
        <div className="stat"><span>Active licenses</span><strong>{activeLicenses}</strong></div>
        <div className="stat"><span>Online sessions</span><strong>{onlineSessions}</strong></div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><h2 className="panel-title">Applications</h2><p className="panel-copy">Products governed by this authority.</p></div>
            <Link className="button secondary small" href="/dashboard/apps">View all</Link>
          </div>
          {applications.length ? (
            <div className="application-list">
              {applications.map((application) => (
                <Link className="application-row" href={`/dashboard/apps/${application.id}`} key={application.id}>
                  <div><strong>{application.name}</strong><span className="mono">{application.publicId}</span></div>
                  <div className="app-metric"><span>Licenses</span><span className="metric">{application._count.licenses}</span></div>
                  <div className="app-metric"><span>Users</span><span className="metric">{application._count.users}</span></div>
                  <div className="app-metric"><span>Online</span><span className="metric">{application.clientSessions.length}</span></div>
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state"><h3>No applications yet</h3><p>Create an application to get an isolated signing key, plan, and API identity.</p><Link className="button small" href="/dashboard/apps/new">Create application</Link></div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Recent audit</h2><p className="panel-copy">Latest administrative events.</p></div></div>
          {recentAudit.length ? (
            <div className="audit-list">
              {recentAudit.map((event) => (
                <div className="audit-item" key={event.id}>
                  <strong>{event.action}</strong>
                  <span>{event.actor?.name || "System"} / {timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state"><h3>No audit events</h3><p>Administrative changes will appear here.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
