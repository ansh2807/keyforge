import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { InviteAcceptanceForm } from "@/components/invite-acceptance-form";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.teamInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: true },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) notFound();
  return (
    <main className="auth-page">
      <aside className="auth-aside"><Brand /><div><h1>Join the control plane.</h1><p>{invite.organization.name} invited you as {invite.role.toLowerCase()}.</p></div></aside>
      <section className="auth-main"><div className="auth-card"><h2>Accept invitation</h2><p>Create your administrator login or confirm your existing password.</p><InviteAcceptanceForm token={token} email={invite.email} /></div></section>
    </main>
  );
}
