import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="auth-main" style={{ minHeight: "100dvh" }}>
      <div className="auth-card">
        <Brand />
        <h2 style={{ marginTop: 40 }}>Page not found</h2>
        <p>The requested application or page does not exist.</p>
        <Link className="button" href="/dashboard">Open dashboard</Link>
      </div>
    </main>
  );
}
