import Link from "next/link";
import { createApplicationAction } from "@/app/actions/dashboard-actions";
import { SubmitButton } from "@/components/submit-button";

export default function NewApplicationPage() {
  return (
    <main className="page">
      <div className="page-heading">
        <div><h1>New application</h1><p>Create an isolated authority for one software product.</p></div>
      </div>
      <section className="panel" style={{ maxWidth: 680 }}>
        <div className="panel-header"><div><h2 className="panel-title">Product identity</h2><p className="panel-copy">Keyforge generates the public ID and signing key pair.</p></div></div>
        <div className="panel-body">
          <form action={createApplicationAction} className="form-stack">
            <div className="field">
              <label htmlFor="name">Application name</label>
              <input className="input" id="name" name="name" placeholder="Orbit Desktop" required maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="version">Current version</label>
              <input className="input mono" id="version" name="version" defaultValue="1.0.0" required maxLength={40} />
            </div>
            <div className="inline-actions">
              <SubmitButton pendingLabel="Creating...">Create application</SubmitButton>
              <Link className="button secondary" href="/dashboard/apps">Cancel</Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
