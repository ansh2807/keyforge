"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireRole, getRequestMetadata } from "@/lib/auth";
import { asApiError, ApiError } from "@/lib/api-error";
import {
  encryptSecret,
  generateApiKey,
  generatePublicId,
  generateSigningKeys,
  generateWebhookSecret,
  keyedHash,
} from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { slugify } from "@/lib/slug";
import { issueLicenses } from "@/lib/licenses";
import { writeAuditEvent } from "@/lib/audit";
import { assertSafeWebhookUrl } from "@/lib/safe-url";

export type SecretActionState = {
  error?: string;
  secret?: string;
  secrets?: string[];
  success?: string;
};

async function ownedApplication(applicationId: string) {
  const auth = await requireAdmin();
  const application = await db.application.findFirst({
    where: { id: applicationId, organizationId: auth.organization.id },
  });
  if (!application) {
    throw new ApiError("application_not_found", "The application does not exist.", 404);
  }
  return { ...auth, application };
}

export async function createApplicationAction(formData: FormData): Promise<void> {
  const auth = await requireAdmin();
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      version: z.string().trim().min(1).max(40).default("1.0.0"),
    })
    .parse({ name: formData.get("name"), version: formData.get("version") || "1.0.0" });
  const baseSlug = slugify(input.name) || "application";
  const existing = await db.application.count({
    where: { organizationId: auth.organization.id, slug: { startsWith: baseSlug } },
  });
  const slug = existing ? `${baseSlug}-${existing + 1}` : baseSlug;
  const keys = generateSigningKeys();
  const application = await db.application.create({
    data: {
      organizationId: auth.organization.id,
      name: input.name,
      slug,
      publicId: generatePublicId(),
      version: input.version,
      signingKeyId: keys.keyId,
      signingPublicKey: keys.publicKey,
      signingPrivateKey: encryptSecret(keys.privateKey, getMasterKey()),
      plans: {
        create: {
          name: "Standard",
          description: "Default product access",
          durationDays: 30,
          entitlements: { product: true },
        },
      },
    },
  });
  const metadata = await getRequestMetadata();
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId: application.id,
    actorUserId: auth.user.id,
    action: "application.created",
    targetType: "application",
    targetId: application.id,
    ipAddress: metadata.ipAddress,
  });
  redirect(`/dashboard/apps/${application.id}`);
}

export async function createPlanAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(250).optional(),
      durationDays: z.coerce.number().int().min(1).max(3650).optional(),
      entitlements: z.string().trim().max(10000).default("{}"),
    })
    .parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      durationDays: formData.get("durationDays") || undefined,
      entitlements: formData.get("entitlements") || "{}",
    });
  let entitlements: unknown;
  try {
    entitlements = JSON.parse(input.entitlements);
  } catch {
    throw new ApiError("invalid_entitlements", "Entitlements must be valid JSON.", 400);
  }
  await db.plan.create({
    data: {
      applicationId,
      name: input.name,
      description: input.description,
      durationDays: input.durationDays,
      entitlements: entitlements as object,
    },
  });
  revalidatePath(`/dashboard/apps/${applicationId}/settings`);
}

export async function generateLicensesAction(
  _previousState: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const input = z
      .object({
        applicationId: z.string().min(1),
        planId: z.string().min(1),
        count: z.coerce.number().int().min(1).max(100),
        durationDays: z.coerce.number().int().min(1).max(3650).optional(),
        maxDevices: z.coerce.number().int().min(1).max(50),
        customerEmail: z.union([z.email(), z.literal("")]).optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse({
        applicationId: formData.get("applicationId"),
        planId: formData.get("planId"),
        count: formData.get("count"),
        durationDays: formData.get("durationDays") || undefined,
        maxDevices: formData.get("maxDevices"),
        customerEmail: formData.get("customerEmail") || "",
        note: formData.get("note") || undefined,
      });
    const auth = await ownedApplication(input.applicationId);
    requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
    const keys = await issueLicenses({
      applicationId: input.applicationId,
      planId: input.planId,
      count: input.count,
      durationDays: input.durationDays,
      maxDevices: input.maxDevices,
      customerEmail: input.customerEmail || null,
      note: input.note || null,
    });
    await writeAuditEvent({
      organizationId: auth.organization.id,
      applicationId: input.applicationId,
      actorUserId: auth.user.id,
      action: "license.issued",
      targetType: "license",
      metadata: { count: keys.length, planId: input.planId },
    });
    revalidatePath(`/dashboard/apps/${input.applicationId}/licenses`);
    return { secrets: keys, success: `${keys.length} license key(s) created. Copy them now.` };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Check the license fields." };
    }
    return { error: asApiError(error).message };
  }
}

export async function updateLicenseStatusAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const licenseId = String(formData.get("licenseId") || "");
  const status = z
    .enum(["ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"])
    .parse(formData.get("status"));
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const license = await db.license.findFirst({ where: { id: licenseId, applicationId } });
  if (!license) {
    throw new ApiError("license_not_found", "The license does not exist.", 404);
  }
  await db.$transaction([
    db.license.update({ where: { id: licenseId }, data: { status } }),
    db.clientSession.updateMany({
      where: { licenseId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId,
    actorUserId: auth.user.id,
    action: `license.${status.toLowerCase()}`,
    targetType: "license",
    targetId: licenseId,
  });
  revalidatePath(`/dashboard/apps/${applicationId}/licenses`);
}

export async function resetActivationsAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const licenseId = String(formData.get("licenseId") || "");
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const license = await db.license.findFirst({ where: { id: licenseId, applicationId } });
  if (!license) {
    throw new ApiError("license_not_found", "The license does not exist.", 404);
  }
  await db.$transaction([
    db.clientSession.updateMany({
      where: { licenseId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.activation.updateMany({
      where: { licenseId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId,
    actorUserId: auth.user.id,
    action: "license.activations_reset",
    targetType: "license",
    targetId: licenseId,
  });
  revalidatePath(`/dashboard/apps/${applicationId}/licenses`);
}

export async function updateApplicationAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      version: z.string().trim().min(1).max(40),
      downloadUrl: z.union([z.url(), z.literal("")]),
      maxDevicesDefault: z.coerce.number().int().min(1).max(50),
      sessionMinutes: z.coerce.number().int().min(5).max(1440),
      heartbeatSeconds: z.coerce.number().int().min(15).max(3600),
      status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
      allowUserRegistration: z.boolean(),
    })
    .parse({
      name: formData.get("name"),
      version: formData.get("version"),
      downloadUrl: formData.get("downloadUrl") || "",
      maxDevicesDefault: formData.get("maxDevicesDefault"),
      sessionMinutes: formData.get("sessionMinutes"),
      heartbeatSeconds: formData.get("heartbeatSeconds"),
      status: formData.get("status"),
      allowUserRegistration: formData.get("allowUserRegistration") === "on",
    });
  await db.application.update({
    where: { id: applicationId },
    data: {
      name: input.name,
      version: input.version,
      downloadUrl: input.downloadUrl || null,
      maxDevicesDefault: input.maxDevicesDefault,
      sessionMinutes: input.sessionMinutes,
      heartbeatSeconds: input.heartbeatSeconds,
      status: input.status,
      allowUserRegistration: input.allowUserRegistration,
    },
  });
  if (input.status !== "ACTIVE") {
    await db.clientSession.updateMany({
      where: { applicationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  revalidatePath(`/dashboard/apps/${applicationId}/settings`);
  revalidatePath(`/dashboard/apps/${applicationId}`);
}

export async function createApiKeyAction(
  _previousState: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const applicationId = String(formData.get("applicationId") || "");
    const auth = await ownedApplication(applicationId);
    requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
    const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
    const rawKey = generateApiKey();
    const apiKey = await db.apiKey.create({
      data: {
        applicationId,
        name,
        prefix: rawKey.slice(0, 14),
        keyHash: keyedHash(rawKey, getMasterKey()),
      },
    });
    const metadata = await getRequestMetadata();
    await writeAuditEvent({
      organizationId: auth.organization.id,
      applicationId,
      actorUserId: auth.user.id,
      action: "api_key.created",
      targetType: "api_key",
      targetId: apiKey.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: { name },
    });
    revalidatePath(`/dashboard/apps/${applicationId}/settings`);
    return { secret: rawKey, success: "Seller API key created. Copy it now." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Enter a key name." };
    }
    return { error: asApiError(error).message };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const keyId = String(formData.get("keyId") || "");
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  await db.apiKey.updateMany({
    where: { id: keyId, applicationId },
    data: { revokedAt: new Date() },
  });
  const metadata = await getRequestMetadata();
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId,
    actorUserId: auth.user.id,
    action: "api_key.revoked",
    targetType: "api_key",
    targetId: keyId,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });
  revalidatePath(`/dashboard/apps/${applicationId}/settings`);
}

export async function createWebhookAction(
  _previousState: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const applicationId = String(formData.get("applicationId") || "");
    const auth = await ownedApplication(applicationId);
    requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
    const input = z
      .object({
        url: z.url().max(2000),
        description: z.string().trim().max(120).optional(),
        events: z.string().trim().min(1).max(1000),
      })
      .parse({
        url: formData.get("url"),
        description: formData.get("description") || undefined,
        events: formData.get("events"),
      });
    const secret = generateWebhookSecret();
    await assertSafeWebhookUrl(input.url);
    await db.webhookEndpoint.create({
      data: {
        applicationId,
        url: input.url,
        description: input.description,
        events: input.events.split(",").map((event) => event.trim()).filter(Boolean),
        secret: encryptSecret(secret, getMasterKey()),
      },
    });
    revalidatePath(`/dashboard/apps/${applicationId}/settings`);
    return { secret, success: "Webhook created. Copy the signing secret now." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Check the webhook fields." };
    }
    return { error: asApiError(error).message };
  }
}

export async function toggleWebhookAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const webhookId = String(formData.get("webhookId") || "");
  const active = formData.get("active") === "true";
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  await db.webhookEndpoint.updateMany({
    where: { id: webhookId, applicationId },
    data: { active },
  });
  revalidatePath(`/dashboard/apps/${applicationId}/settings`);
}

export async function updateEndUserStatusAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const userId = String(formData.get("userId") || "");
  const status = z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).parse(formData.get("status"));
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const user = await db.endUser.findFirst({ where: { id: userId, applicationId } });
  if (!user) throw new ApiError("user_not_found", "The product user does not exist.", 404);
  await db.$transaction([
    db.endUser.update({ where: { id: userId }, data: { status } }),
    ...(status === "ACTIVE"
      ? []
      : [
          db.clientSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]),
  ]);
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId,
    actorUserId: auth.user.id,
    action: `user.${status.toLowerCase()}`,
    targetType: "end_user",
    targetId: userId,
  });
  revalidatePath(`/dashboard/apps/${applicationId}/users`);
}

export async function revokeClientSessionAction(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") || "");
  const sessionId = String(formData.get("sessionId") || "");
  const auth = await ownedApplication(applicationId);
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  await db.clientSession.updateMany({
    where: { id: sessionId, applicationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditEvent({
    organizationId: auth.organization.id,
    applicationId,
    actorUserId: auth.user.id,
    action: "session.revoked",
    targetType: "client_session",
    targetId: sessionId,
  });
  revalidatePath(`/dashboard/apps/${applicationId}/sessions`);
}
