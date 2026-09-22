"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AppWindow,
  Gauge,
  Scroll,
  SignOut,
  UsersThree,
  UserCircle,
} from "@phosphor-icons/react";
import { logoutAction } from "@/app/actions/auth-actions";
import { Brand } from "@/components/brand";

const links = [
  { href: "/dashboard", label: "Overview", icon: Gauge },
  { href: "/dashboard/apps", label: "Applications", icon: AppWindow },
  { href: "/dashboard/audit", label: "Audit log", icon: Scroll },
  { href: "/dashboard/team", label: "Team", icon: UsersThree },
  { href: "/dashboard/account", label: "Account", icon: UserCircle },
];

export function DashboardNav({
  organization,
  user,
}: {
  organization: string;
  user: { name: string; email: string };
}) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/dashboard" aria-label="Keyforge dashboard"><Brand /></Link>
      <p className="workspace-label">{organization}</p>
      <nav className="sidebar-nav" aria-label="Dashboard navigation">
        {links.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link className={`sidebar-link${active ? " active" : ""}`} href={item.href} key={item.href}>
              <Icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <form action={logoutAction}>
          <button className="button secondary small" type="submit">
            <SignOut size={17} aria-hidden="true" /> <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileTopbar() {
  return (
    <div className="mobile-topbar">
      <Link href="/dashboard" aria-label="Dashboard"><Brand /></Link>
      <Link className="button secondary small" href="/dashboard/account">Account</Link>
    </div>
  );
}
