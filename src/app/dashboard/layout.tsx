import type { Metadata } from "next";
import { DashboardNav, MobileTopbar } from "@/components/dashboard-nav";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Control plane" };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await requireAdmin();
  return (
    <div className="app-shell">
      <DashboardNav
        organization={organization.name}
        user={{ name: user.name, email: user.email }}
      />
      <div className="content-shell">
        <MobileTopbar />
        <header className="topbar">
          <div className="topbar-context">
            <strong>{organization.name}</strong>
            <span>License operations</span>
          </div>
          <span className="badge good">Operational</span>
        </header>
        {children}
      </div>
    </div>
  );
}
