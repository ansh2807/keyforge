import { ResellerForm, TeamInviteForm } from "@/components/team-forms";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dashboard-data";
import { removeTeamMemberAction, revokeResellerAction, revokeTeamInviteAction } from "@/app/actions/team-actions";

export default async function TeamPage() {
  const auth = await requireAdmin();
  const [members, invites, applications, resellers] = await Promise.all([
    db.membership.findMany({ where: { organizationId: auth.organization.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.teamInvite.findMany({ where: { organizationId: auth.organization.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    db.application.findMany({ where: { organizationId: auth.organization.id, status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.reseller.findMany({ where: { organizationId: auth.organization.id }, include: { application: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <main className="page">
      <div className="page-heading"><div><h1>Team</h1><p>Invite administrators and analysts without sharing the owner account.</p></div><span className="badge good">{members.length} members</span></div>
      <section className="panel">
        <div className="panel-header"><div><h2 className="panel-title">Invite a teammate</h2><p className="panel-copy">Invite links are single-use and expire after seven days.</p></div></div>
        <div className="panel-body"><TeamInviteForm /></div>
      </section>
      <section className="panel section-gap">
        <div className="panel-header"><div><h2 className="panel-title">Members</h2><p className="panel-copy">Role-based access is enforced again inside every management action.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.user.name}</strong><br /><span className="helper">{member.user.email}</span></td><td><span className="badge">{member.role}</span></td><td>{formatDate(member.createdAt)}</td><td>{auth.membership.role === "OWNER" && member.role !== "OWNER" && member.userId !== auth.user.id ? <form action={removeTeamMemberAction}><input type="hidden" name="membershipId" value={member.id} /><SubmitButton className="button secondary small" pendingLabel="Removing...">Remove</SubmitButton></form> : <span className="helper">Protected</span>}</td></tr>)}</tbody></table></div>
      </section>
      {invites.length > 0 && <section className="panel section-gap"><div className="panel-header"><div><h2 className="panel-title">Pending invitations</h2><p className="panel-copy">Unaccepted links that still have access to this workspace.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Action</th></tr></thead><tbody>{invites.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td><span className="badge">{invite.role}</span></td><td>{formatDate(invite.expiresAt)}</td><td><form action={revokeTeamInviteAction}><input type="hidden" name="inviteId" value={invite.id} /><SubmitButton className="button secondary small" pendingLabel="Revoking...">Revoke</SubmitButton></form></td></tr>)}</tbody></table></div></section>}
      <section className="panel section-gap"><div className="panel-header"><div><h2 className="panel-title">Resellers</h2><p className="panel-copy">Credit-limited application credentials can list and issue licenses through the seller API.</p></div></div><div className="panel-body">{applications.length ? <ResellerForm applications={applications} /> : <p className="helper">Create an application before adding a reseller.</p>}</div>{resellers.length > 0 && <div className="table-wrap"><table className="data-table"><thead><tr><th>Reseller</th><th>Application</th><th>Credits</th><th>Status</th><th>Action</th></tr></thead><tbody>{resellers.map((reseller) => <tr key={reseller.id}><td><strong>{reseller.name}</strong><br /><span className="helper mono">{reseller.prefix}…</span></td><td>{reseller.application?.name || "All applications"}</td><td className="mono">{reseller.credits}</td><td><span className={`badge ${reseller.active ? "good" : "bad"}`}>{reseller.active ? "Active" : "Revoked"}</span></td><td>{reseller.active ? <form action={revokeResellerAction}><input type="hidden" name="resellerId" value={reseller.id} /><SubmitButton className="button secondary small" pendingLabel="Revoking...">Revoke</SubmitButton></form> : <span className="helper">Revoked</span>}</td></tr>)}</tbody></table></div>}</section>
    </main>
  );
}
