"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ApplicationTabs({ applicationId }: { applicationId: string }) {
  const pathname = usePathname();
  const root = `/dashboard/apps/${applicationId}`;
  const tabs = [
    { href: root, label: "Overview", exact: true },
    { href: `${root}/licenses`, label: "Licenses" },
    { href: `${root}/users`, label: "Users" },
    { href: `${root}/sessions`, label: "Sessions" },
    { href: `${root}/features`, label: "Features" },
    { href: `${root}/settings`, label: "Settings" },
  ];
  return (
    <nav className="app-tabs" aria-label="Application navigation">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link className={`app-tab${active ? " active" : ""}`} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
