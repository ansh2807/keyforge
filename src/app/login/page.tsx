import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth-form";
import { getCurrentAdmin, hasCompletedSetup } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentAdmin()) redirect("/dashboard");
  if (!(await hasCompletedSetup())) redirect("/setup");
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link href="/"><Brand /></Link>
        <div>
          <h1>Operate your license authority.</h1>
          <p>Manage product access, customer accounts, devices, sessions, webhooks, and audit evidence.</p>
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p>Sign in to the Keyforge control plane.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
