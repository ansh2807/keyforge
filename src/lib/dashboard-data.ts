import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function requireApplication(applicationId: string) {
  const auth = await requireAdmin();
  const application = await db.application.findFirst({
    where: { id: applicationId, organizationId: auth.organization.id },
  });
  if (!application) notFound();
  return { ...auth, application };
}

export function formatDate(date: Date | null): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function statusBadge(status: string): string {
  if (["ACTIVE", "SUCCEEDED"].includes(status)) return "good";
  if (["UNUSED", "PENDING", "PAUSED", "SUSPENDED"].includes(status)) return "warn";
  return "bad";
}
