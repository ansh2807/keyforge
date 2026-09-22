import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { CustomerPortal } from "@/components/customer-portal";
import { db } from "@/lib/db";

export default async function CustomerPortalPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ loginToken?: string }> }) {
  const { appId } = await params;
  const { loginToken } = await searchParams;
  const application = await db.application.findUnique({ where: { publicId: appId } });
  if (!application || application.status !== "ACTIVE") notFound();
  return (
    <main className="auth-page portal-page">
      <aside className="auth-aside"><Brand /><div><p className="eyebrow">Customer access</p><h1>{application.name}</h1><p>Manage your product login, license subscription, passkeys, and authenticator security.</p></div></aside>
      <section className="auth-main"><div className="auth-card portal-card"><h2>{application.name}</h2><p>Secure customer panel · version {application.version}</p><CustomerPortal appId={application.publicId} appName={application.name} allowRegistration={application.allowUserRegistration} loginToken={loginToken} /></div></section>
    </main>
  );
}
