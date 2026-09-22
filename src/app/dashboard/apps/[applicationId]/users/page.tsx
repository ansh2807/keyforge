import { ApplicationHeading } from "@/components/application-heading";
import { db } from "@/lib/db";
import { requireApplication, formatDate, statusBadge } from "@/lib/dashboard-data";
import { updateEndUserStatusAction } from "@/app/actions/dashboard-actions";

export default async function UsersPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const users = await db.endUser.findMany({
    where: { applicationId },
    include: { plan: true, license: true, _count: { select: { sessions: true, subscriptions: true } } },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
  return (
    <main className="page">
      <ApplicationHeading application={application} />
      <section className="panel">
        <div className="panel-header"><div><h2 className="panel-title">Product users</h2><p className="panel-copy">Accounts created through the public registration endpoint.</p></div><span className="badge">{users.length} shown</span></div>
        {users.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>User</th><th>Status</th><th>Plan</th><th>License</th><th>Subscriptions</th><th>Sessions</th><th>Last login</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.username}</strong><br /><span className="helper">{user.email || "No email"}</span></td><td><span className={`badge ${statusBadge(user.status)}`}>{user.status}</span></td><td>{user.plan.name}</td><td className="mono">{user.license ? `${user.license.keyPrefix}...${user.license.keyLastFour}` : "None"}</td><td className="mono">{user._count.subscriptions}</td><td className="mono">{user._count.sessions}</td><td>{formatDate(user.lastLoginAt)}</td><td><form action={updateEndUserStatusAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} /><button className="button secondary small" type="submit">{user.status === "ACTIVE" ? "Suspend" : "Restore"}</button></form></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No registered users</h3><p>Users appear after a customer registers a license through your product.</p></div>}
      </section>
    </main>
  );
}
