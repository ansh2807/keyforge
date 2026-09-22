import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { accessValueHash, accessValuePreview } from "@/lib/access-control";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";
import { encryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { assertSafeWebhookUrl } from "@/lib/safe-url";

const schema = z.discriminatedUnion("resource", [
  z.object({
    resource: z.literal("variable"),
    key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    value: z.string().max(10000),
    visibility: z.enum(["PUBLIC", "AUTHENTICATED", "SERVER"]).default("AUTHENTICATED"),
  }),
  z.object({
    resource: z.literal("build"),
    version: z.string().trim().min(1).max(40),
    platform: z.string().trim().min(1).max(80),
    sha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/),
    downloadUrl: z.url().max(2000).nullable().optional(),
  }),
  z.object({
    resource: z.literal("access_rule"),
    effect: z.enum(["ALLOW", "DENY"]),
    subject: z.enum(["IP", "INSTALLATION", "USERNAME", "LICENSE"]),
    value: z.string().trim().min(1).max(500),
    reason: z.string().trim().max(250).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  }),
  z.object({
    resource: z.literal("function"),
    name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    requiredPlanId: z.string().nullable().optional(),
    response: z.unknown(),
    rateLimitPerMinute: z.number().int().min(1).max(10000).default(60),
  }),
  z.object({
    resource: z.literal("chat_channel"),
    name: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
    delaySeconds: z.number().int().min(1).max(3600).default(3),
  }),
  z.object({
    resource: z.literal("notification"),
    kind: z.enum(["DISCORD", "TELEGRAM", "GENERIC"]),
    name: z.string().trim().min(2).max(80),
    endpoint: z.url().max(2000),
    secret: z.string().max(500).nullable().optional(),
    events: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "features:read");
    const [variables, builds, accessRules, remoteFunctions, chatChannels, files, notifications] = await Promise.all([
      db.applicationVariable.findMany({ where: { applicationId: apiKey.applicationId }, orderBy: { key: "asc" } }),
      db.buildArtifact.findMany({ where: { applicationId: apiKey.applicationId }, orderBy: { updatedAt: "desc" } }),
      db.accessRule.findMany({ where: { applicationId: apiKey.applicationId }, orderBy: { createdAt: "desc" } }),
      db.remoteFunction.findMany({ where: { applicationId: apiKey.applicationId }, orderBy: { name: "asc" } }),
      db.chatChannel.findMany({ where: { applicationId: apiKey.applicationId }, orderBy: { name: "asc" } }),
      db.managedFile.findMany({ where: { applicationId: apiKey.applicationId }, select: { id: true, name: true, originalName: true, contentType: true, size: true, sha256: true, planId: true, active: true, updatedAt: true }, orderBy: { name: "asc" } }),
      db.notificationChannel.findMany({ where: { applicationId: apiKey.applicationId }, select: { id: true, kind: true, name: true, events: true, active: true, createdAt: true, updatedAt: true }, orderBy: { name: "asc" } }),
    ]);
    return noStoreJson({ success: true, data: { variables, builds, accessRules, remoteFunctions, chatChannels, files, notifications } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "features:write");
    const body = await parseJson(request, schema);
    let result: unknown;
    if (body.resource === "variable") {
      result = await db.applicationVariable.upsert({
        where: { applicationId_key: { applicationId: apiKey.applicationId, key: body.key } },
        create: { applicationId: apiKey.applicationId, key: body.key, value: body.value, visibility: body.visibility },
        update: { value: body.value, visibility: body.visibility, active: true },
      });
    }
    if (body.resource === "build") {
      result = await db.buildArtifact.upsert({
        where: { applicationId_version_platform: { applicationId: apiKey.applicationId, version: body.version, platform: body.platform } },
        create: { applicationId: apiKey.applicationId, version: body.version, platform: body.platform, sha256: body.sha256, downloadUrl: body.downloadUrl },
        update: { sha256: body.sha256, downloadUrl: body.downloadUrl, active: true },
      });
    }
    if (body.resource === "access_rule") {
      const valueHash = accessValueHash(body.subject, body.value);
      result = await db.accessRule.upsert({
        where: { applicationId_effect_subject_valueHash: { applicationId: apiKey.applicationId, effect: body.effect, subject: body.subject, valueHash } },
        create: { applicationId: apiKey.applicationId, effect: body.effect, subject: body.subject, valueHash, valuePreview: accessValuePreview(body.subject, body.value), reason: body.reason, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
        update: { active: true, reason: body.reason, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
      });
    }
    if (body.resource === "function") {
      if (body.requiredPlanId) {
        const plan = await db.plan.findFirst({ where: { id: body.requiredPlanId, applicationId: apiKey.applicationId } });
        if (!plan) throw new ApiError("plan_not_found", "The required plan does not exist.", 404);
      }
      result = await db.remoteFunction.upsert({
        where: { applicationId_name: { applicationId: apiKey.applicationId, name: body.name } },
        create: { applicationId: apiKey.applicationId, name: body.name, requiredPlanId: body.requiredPlanId, response: body.response as object, rateLimitPerMinute: body.rateLimitPerMinute },
        update: { requiredPlanId: body.requiredPlanId, response: body.response as object, rateLimitPerMinute: body.rateLimitPerMinute, active: true },
      });
    }
    if (body.resource === "chat_channel") {
      result = await db.chatChannel.upsert({
        where: { applicationId_name: { applicationId: apiKey.applicationId, name: body.name } },
        create: { applicationId: apiKey.applicationId, name: body.name, delaySeconds: body.delaySeconds },
        update: { delaySeconds: body.delaySeconds, active: true },
      });
    }
    if (body.resource === "notification") {
      await assertSafeWebhookUrl(body.endpoint);
      result = await db.notificationChannel.upsert({
        where: { applicationId_name: { applicationId: apiKey.applicationId, name: body.name } },
        create: { applicationId: apiKey.applicationId, kind: body.kind, name: body.name, endpoint: encryptSecret(body.endpoint, getMasterKey()), secret: body.secret ? encryptSecret(body.secret, getMasterKey()) : null, events: body.events },
        update: { kind: body.kind, endpoint: encryptSecret(body.endpoint, getMasterKey()), secret: body.secret ? encryptSecret(body.secret, getMasterKey()) : null, events: body.events, active: true },
        select: { id: true, kind: true, name: true, events: true, active: true, createdAt: true, updatedAt: true },
      });
    }
    return noStoreJson({ success: true, data: result }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
