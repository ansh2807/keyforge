import Link from "next/link";
import { ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export default async function ApplicationsPage() {
  const { organization } = await requireAdmin();
  const applications = await db.application.findMany({
    where: { organizationId: organization.id },
    include: {
      _count: { select: { licenses: true, users: true, clientSessions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    <main className="page">
      <div className="page-heading">
        <div><h1>Applications</h1><p>Each product has independent keys, plans, customers, and sessions.</p></div>
        <Link className="button" href="/dashboard/apps/new"><Plus size={17} /> New application</Link>
      </div>
      <section className="panel">
        {applications.length ? (
          <div className="application-list">
            {applications.map((application) => (
              <Link className="application-row" href={`/dashboard/apps/${application.id}`} key={application.id}>
                <div><strong>{application.name}</strong><span className="mono">{application.publicId}</span></div>
                <div className="app-metric"><span>Licenses</span><span className="metric">{application._count.licenses}</span></div>
                <div className="app-metric"><span>Users</span><span className="metric">{application._count.users}</span></div>
                <div className="app-metric"><span>Sessions</span><span className="metric">{application._count.clientSessions}</span></div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state"><h3>No applications yet</h3><p>Create your first product authority to begin issuing licenses.</p><Link className="button small" href="/dashboard/apps/new">Create application</Link></div>
        )}
      </section>
    </main>
  );
}
