"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireRole } from "@/lib/auth";
import { ApiError, asApiError } from "@/lib/api-error";
import { accessValueHash, accessValuePreview } from "@/lib/access-control";
import { deleteManagedFile, storeManagedFile } from "@/lib/storage";
import { encryptSecret, keyedHash, randomToken } from "@/lib/crypto";
import { assertSafeWebhookUrl } from "@/lib/safe-url";
import { getMasterKey } from "@/lib/env";
import { writeAuditEvent } from "@/lib/audit";
import type { SecretActionState } from "@/app/actions/dashboard-actions";

async function ownedApplication(applicationId: string) {
  const auth = await requireAdmin();
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const application = await db.application.findFirst({
    where: { id: applicationId, organizationId: auth.organization.id },
  });
  if (!application) throw new ApiError("application_not_found", "The application does not exist.", 404);
  return { ...auth, application };
}

function refresh(applicationId: string): void {
  revalidatePath(`/dashboard/apps/${applicationId}/features`);
}

export async function createVariableAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    value: z.string().max(10000),
    visibility: z.enum(["PUBLIC", "AUTHENTICATED", "SERVER"]),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  await db.applicationVariable.upsert({
    where: { applicationId_key: { applicationId: input.applicationId, key: input.key } },
    create: input,
    update: { value: input.value, visibility: input.visibility, active: true },
  });
  refresh(input.applicationId);
}

export async function createBuildAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    version: z.string().trim().min(1).max(40),
    platform: z.string().trim().min(1).max(80),
    sha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/),
    downloadUrl: z.union([z.url(), z.literal("")]),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  await db.buildArtifact.upsert({
    where: { applicationId_version_platform: {
      applicationId: input.applicationId,
      version: input.version,
      platform: input.platform,
    } },
    create: { ...input, downloadUrl: input.downloadUrl || null },
    update: { sha256: input.sha256, downloadUrl: input.downloadUrl || null, active: true },
  });
  refresh(input.applicationId);
}

export async function uploadManagedFileAction(formData: FormData): Promise<void> {
  const applicationId = z.string().min(1).parse(formData.get("applicationId"));
  const auth = await ownedApplication(applicationId);
  const name = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/).parse(formData.get("name"));
  const planId = z.string().optional().parse(String(formData.get("planId") || "")) || null;
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ApiError("file_required", "Choose a file to upload.", 400);
  if (planId) {
    const plan = await db.plan.findFirst({ where: { id: planId, applicationId } });
    if (!plan) throw new ApiError("plan_not_found", "The selected plan does not exist.", 404);
  }
  const stored = await storeManagedFile(file);
  try {
    const existing = await db.managedFile.findUnique({ where: { applicationId_name: { applicationId, name } } });
    await db.managedFile.upsert({
      where: { applicationId_name: { applicationId, name } },
      create: { applicationId, planId, name, ...stored },
      update: { planId, ...stored, active: true },
    });
    if (existing) await deleteManagedFile(existing.storageKey);
    await writeAuditEvent({
      organizationId: auth.organization.id,
      applicationId,
      actorUserId: auth.user.id,
      action: "managed_file.uploaded",
      targetType: "managed_file",
      metadata: { name, size: stored.size, sha256: stored.sha256 },
    });
  } catch (error) {
    await deleteManagedFile(stored.storageKey);
    throw error;
  }
  refresh(applicationId);
}

export async function createAccessRuleAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    effect: z.enum(["ALLOW", "DENY"]),
    subject: z.enum(["IP", "INSTALLATION", "USERNAME", "LICENSE"]),
    value: z.string().trim().min(1).max(500),
    reason: z.string().trim().max(250).optional(),
    expiresAt: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  await db.accessRule.upsert({
    where: { applicationId_effect_subject_valueHash: {
      applicationId: input.applicationId,
      effect: input.effect,
      subject: input.subject,
      valueHash: accessValueHash(input.subject, input.value),
    } },
    create: {
      applicationId: input.applicationId,
      effect: input.effect,
      subject: input.subject,
      valueHash: accessValueHash(input.subject, input.value),
      valuePreview: accessValuePreview(input.subject, input.value),
      reason: input.reason || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    update: {
      valuePreview: accessValuePreview(input.subject, input.value),
      reason: input.reason || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      active: true,
    },
  });
  refresh(input.applicationId);
}

export async function createRemoteFunctionAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    requiredPlanId: z.string().optional(),
    response: z.string().trim().min(1).max(100000),
    rateLimitPerMinute: z.coerce.number().int().min(1).max(10000),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  let response: unknown;
  try {
    response = JSON.parse(input.response);
  } catch {
    throw new ApiError("invalid_json", "The remote function response must be valid JSON.", 400);
  }
  await db.remoteFunction.upsert({
    where: { applicationId_name: { applicationId: input.applicationId, name: input.name } },
    create: {
      applicationId: input.applicationId,
      name: input.name,
      requiredPlanId: input.requiredPlanId || null,
      response: response as object,
      rateLimitPerMinute: input.rateLimitPerMinute,
    },
    update: {
      requiredPlanId: input.requiredPlanId || null,
      response: response as object,
      rateLimitPerMinute: input.rateLimitPerMinute,
      active: true,
    },
  });
  refresh(input.applicationId);
}

export async function createChatChannelAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    delaySeconds: z.coerce.number().int().min(1).max(3600),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  await db.chatChannel.upsert({
    where: { applicationId_name: { applicationId: input.applicationId, name: input.name } },
    create: input,
    update: { delaySeconds: input.delaySeconds, active: true },
  });
  refresh(input.applicationId);
}

export async function createNotificationChannelAction(formData: FormData): Promise<void> {
  const input = z.object({
    applicationId: z.string().min(1),
    kind: z.enum(["DISCORD", "TELEGRAM", "GENERIC"]),
    name: z.string().trim().min(2).max(80),
    endpoint: z.url().max(2000),
    secret: z.string().max(500).optional(),
    events: z.string().trim().min(1).max(1000),
  }).parse(Object.fromEntries(formData));
  await ownedApplication(input.applicationId);
  await assertSafeWebhookUrl(input.endpoint);
  await db.notificationChannel.upsert({
    where: { applicationId_name: { applicationId: input.applicationId, name: input.name } },
    create: {
      applicationId: input.applicationId,
      kind: input.kind,
      name: input.name,
      endpoint: encryptSecret(input.endpoint, getMasterKey()),
      secret: input.secret ? encryptSecret(input.secret, getMasterKey()) : null,
      events: input.events.split(",").map((event) => event.trim()).filter(Boolean),
    },
    update: {
      kind: input.kind,
      endpoint: encryptSecret(input.endpoint, getMasterKey()),
      secret: input.secret ? encryptSecret(input.secret, getMasterKey()) : null,
      events: input.events.split(",").map((event) => event.trim()).filter(Boolean),
      active: true,
    },
  });
  refresh(input.applicationId);
}

export async function deleteFeatureAction(formData: FormData): Promise<void> {
  const applicationId = z.string().min(1).parse(formData.get("applicationId"));
  const id = z.string().min(1).parse(formData.get("id"));
  const type = z.enum(["variable", "build", "file", "rule", "function", "channel", "notification"]).parse(formData.get("type"));
  await ownedApplication(applicationId);
  if (type === "variable") await db.applicationVariable.deleteMany({ where: { id, applicationId } });
  if (type === "build") await db.buildArtifact.deleteMany({ where: { id, applicationId } });
  if (type === "rule") await db.accessRule.deleteMany({ where: { id, applicationId } });
  if (type === "function") await db.remoteFunction.deleteMany({ where: { id, applicationId } });
  if (type === "channel") await db.chatChannel.deleteMany({ where: { id, applicationId } });
  if (type === "notification") await db.notificationChannel.deleteMany({ where: { id, applicationId } });
  if (type === "file") {
    const file = await db.managedFile.findFirst({ where: { id, applicationId } });
    if (file) {
      await db.managedFile.delete({ where: { id: file.id } });
      await deleteManagedFile(file.storageKey);
    }
  }
  refresh(applicationId);
}

export async function enableCompatibilityAction(
  _state: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const applicationId = z.string().min(1).parse(formData.get("applicationId"));
    await ownedApplication(applicationId);
    const name = z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/).parse(formData.get("name"));
    const ownerId = z.string().trim().min(5).max(80).regex(/^[a-zA-Z0-9_-]+$/).parse(formData.get("ownerId"));
    const secret = randomToken(32);
    await db.application.update({
      where: { id: applicationId },
      data: {
        compatEnabled: true,
        compatName: name,
        compatOwnerId: ownerId,
        compatSecretHash: keyedHash(secret, getMasterKey()),
      },
    });
    refresh(applicationId);
    return { secret, success: "Compatibility API enabled. Copy this application secret now." };
  } catch (error) {
    return { error: asApiError(error).message };
  }
}
