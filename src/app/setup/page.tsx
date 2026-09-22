import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { SetupForm } from "@/components/auth-form";
import { hasCompletedSetup } from "@/lib/auth";

export const metadata: Metadata = { title: "Initialize" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasCompletedSetup()) redirect("/login");
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link href="/"><Brand /></Link>
        <div>
          <h1>Establish your authority.</h1>
          <p>Create the first owner and organization. This route locks itself after initialization.</p>
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <h2>Initialize Keyforge</h2>
          <p>Set up the owner account for this installation.</p>
          <SetupForm />
        </div>
      </section>
    </main>
  );
}
