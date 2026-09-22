import { disableTotpAction } from "@/app/actions/account-actions";
import { EmailOtpSetupForm, PasswordForm, TotpSetupForm } from "@/components/account-forms";
import { requireAdmin } from "@/lib/auth";
import { isEmailDeliveryConfigured } from "@/lib/email";

export default async function AccountPage() {
  const { user, membership } = await requireAdmin();
  const hasMfa = user.totpEnabled || user.emailOtpEnabled;
  return (
    <main className="page">
      <div className="page-heading"><div><h1>Account security</h1><p>Protect administrative access to the license authority.</p></div><span className={`badge ${hasMfa ? "good" : "warn"}`}>{hasMfa ? "MFA enabled" : "MFA required"}</span></div>
      <div className="security-method-grid">
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Two-factor authentication</h2><p className="panel-copy">TOTP adds a second credential to owner login.</p></div></div>
          <div className="panel-body">
            {user.totpEnabled ? (
              <form action={disableTotpAction} className="form-stack">
                <div className="alert success">Two-factor authentication is active.</div>
                <div className="field"><label htmlFor="disable-token">Current authentication code</label><input className="input mono" id="disable-token" name="token" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></div>
                <button className="button secondary" type="submit">Disable two-factor authentication</button>
              </form>
            ) : <TotpSetupForm />}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2 className="panel-title">Email verification</h2><p className="panel-copy">Receive a short-lived sign-in code at your administrator email.</p></div><span className={`badge ${user.emailOtpEnabled ? "good" : "warn"}`}>{user.emailOtpEnabled ? "Enabled" : "Optional"}</span></div>
          <div className="panel-body">
            <EmailOtpSetupForm
              configured={isEmailDeliveryConfigured()}
              email={user.email}
              enabled={user.emailOtpEnabled}
            />
          </div>
        </section>
        <section className="panel password-panel">
          <div className="panel-header"><div><h2 className="panel-title">Password</h2><p className="panel-copy">Changing it invalidates every admin session.</p></div></div>
          <div className="panel-body"><PasswordForm /></div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header"><div><h2 className="panel-title">Identity</h2><p className="panel-copy">Current administrative membership.</p></div><span className="badge good">{membership.role}</span></div>
        <div className="details-grid"><div className="detail"><span>Name</span><strong>{user.name}</strong></div><div className="detail"><span>Email</span><strong>{user.email}</strong></div></div>
      </section>
    </main>
  );
}
