import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard-data";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const { organization } = await requireAdmin();
  const query = await searchParams;
  const events = await db.auditEvent.findMany({
    where: { organizationId: organization.id, ...(query.app ? { applicationId: query.app } : {}) },
    include: { actor: { select: { name: true, email: true } }, application: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    <main className="page">
      <div className="page-heading"><div><h1>Audit log</h1><p>Attributed administrative changes across {organization.name}.</p></div><span className="badge">{events.length} shown</span></div>
      <section className="panel">
        {events.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Action</th><th>Application</th><th>Actor</th><th>Target</th><th>IP</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td className="mono">{event.action}</td><td>{event.application?.name || "Organization"}</td><td>{event.actor?.name || "System"}<br /><span className="helper">{event.actor?.email || "Automated event"}</span></td><td>{event.targetType}<br /><span className="helper mono">{event.targetId || "None"}</span></td><td className="mono">{event.ipAddress || "Unknown"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No matching events</h3><p>Administrative actions will appear here.</p></div>}
      </section>
    </main>
  );
}
