import { ApplicationHeading } from "@/components/application-heading";
import { LicenseGenerator } from "@/components/license-generator";
import { db } from "@/lib/db";
import { requireApplication, formatDate, statusBadge } from "@/lib/dashboard-data";
import { resetActivationsAction, updateLicenseStatusAction } from "@/app/actions/dashboard-actions";

export default async function LicensesPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const { application } = await requireApplication(applicationId);
  const [plans, licenses] = await Promise.all([
    db.plan.findMany({ where: { applicationId }, orderBy: { name: "asc" } }),
    db.license.findMany({
      where: { applicationId },
      include: { plan: true, _count: { select: { activations: true, sessions: true } } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);
  return (
    <main className="page">
      <ApplicationHeading application={application} />
      <div className="split-panels">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Generate licenses</h2><p className="panel-copy">Plaintext keys are returned once and never stored.</p></div></div>
          <div className="panel-body"><LicenseGenerator applicationId={applicationId} plans={plans} defaultDevices={application.maxDevicesDefault} /></div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Plans</h2><p className="panel-copy">Entitlements attached to issued access.</p></div></div>
          {plans.length ? <div className="audit-list">{plans.map((plan) => <div className="audit-item" key={plan.id}><strong>{plan.name}</strong><span>{plan.durationDays ? `${plan.durationDays} days` : "No automatic expiry"} / {plan.description || "No description"}</span></div>)}</div> : <div className="empty-state"><h3>No plans</h3><p>Create a plan from application settings.</p></div>}
        </section>
      </div>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header"><div><h2 className="panel-title">License registry</h2><p className="panel-copy">Most recent 250 records. Search and export can be added when volume requires it.</p></div><span className="badge">{licenses.length} shown</span></div>
        {licenses.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>License</th><th>Status</th><th>Plan</th><th>Customer</th><th>Devices</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id}>
                    <td><span className="mono">{license.keyPrefix}...{license.keyLastFour}</span><br /><span className="helper">{license.note || "No note"}</span></td>
                    <td><span className={`badge ${statusBadge(license.status)}`}>{license.status}</span></td>
                    <td>{license.plan.name}</td>
                    <td>{license.customerEmail || "Unassigned"}</td>
                    <td className="mono">{license._count.activations}/{license.maxDevices}</td>
                    <td>{license.expiresAt ? formatDate(license.expiresAt) : "No expiry"}</td>
                    <td>
                      <div className="inline-actions">
                        {license.status === "SUSPENDED" ? (
                          <form action={updateLicenseStatusAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="licenseId" value={license.id} /><input type="hidden" name="status" value="ACTIVE" /><button className="button secondary small" type="submit">Restore</button></form>
                        ) : license.status !== "REVOKED" ? (
                          <form action={updateLicenseStatusAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="licenseId" value={license.id} /><input type="hidden" name="status" value="SUSPENDED" /><button className="button secondary small" type="submit">Suspend</button></form>
                        ) : null}
                        <form action={resetActivationsAction}><input type="hidden" name="applicationId" value={applicationId} /><input type="hidden" name="licenseId" value={license.id} /><button className="button secondary small" type="submit">Reset devices</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state"><h3>No licenses issued</h3><p>Use the generator above to create your first license.</p></div>}
      </section>
    </main>
  );
}
