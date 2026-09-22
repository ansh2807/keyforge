import "server-only";
import type { AccessRuleSubject } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { getMasterKey } from "@/lib/env";
import { keyedHash, normalizeLicenseKey } from "@/lib/crypto";

export type AccessContext = {
  ip?: string;
  installationId?: string;
  username?: string;
  licenseKey?: string;
};

export function normalizeAccessValue(subject: AccessRuleSubject, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError("invalid_access_rule", "An access-rule value is required.", 400);
  switch (subject) {
    case "IP":
      return normalized.toLowerCase();
    case "INSTALLATION":
      return normalized;
    case "USERNAME":
      return normalized.toLowerCase();
    case "LICENSE":
      return normalizeLicenseKey(normalized);
  }
}

export function accessValueHash(subject: AccessRuleSubject, value: string): string {
  return keyedHash(`${subject}:${normalizeAccessValue(subject, value)}`, getMasterKey());
}

export function accessValuePreview(subject: AccessRuleSubject, value: string): string {
  const normalized = normalizeAccessValue(subject, value);
  if (subject === "IP" || subject === "USERNAME") return normalized.slice(0, 80);
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 7)}...${normalized.slice(-4)}`;
}

function contextEntries(context: AccessContext): Array<[AccessRuleSubject, string]> {
  return [
    ["IP", context.ip || ""],
    ["INSTALLATION", context.installationId || ""],
    ["USERNAME", context.username || ""],
    ["LICENSE", context.licenseKey || ""],
  ].filter((entry): entry is [AccessRuleSubject, string] => Boolean(entry[1]));
}

export async function enforceApplicationAccess(
  applicationId: string,
  context: AccessContext,
): Promise<void> {
  const now = new Date();
  const rules = await db.accessRule.findMany({
    where: {
      applicationId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (!rules.length) return;

  const candidateHashes = new Set(
    contextEntries(context).map(([subject, value]) => accessValueHash(subject, value)),
  );
  const denied = rules.find((rule) => rule.effect === "DENY" && candidateHashes.has(rule.valueHash));
  if (denied) {
    throw new ApiError("access_denied", denied.reason || "This client is blocked by an access policy.", 403);
  }

  const allowRules = rules.filter((rule) => rule.effect === "ALLOW");
  if (allowRules.length && !allowRules.some((rule) => candidateHashes.has(rule.valueHash))) {
    throw new ApiError("access_not_whitelisted", "This client is not included in the application allowlist.", 403);
  }
}
