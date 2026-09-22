import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";
import { emitWebhook } from "@/lib/webhooks";
import { writeAuditEvent } from "@/lib/audit";
import { licenseMutationAction, sellerAuditMetadata } from "@/lib/audit-events";

const updateSchema = z
  .object({
    status: z.enum(["UNUSED", "ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"]).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    maxDevices: z.number().int().min(1).max(50).optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ licenseId: string }> },
) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "licenses:write");
    const { licenseId } = await context.params;
    const body = await parseJson(request, updateSchema);
    const existing = await db.license.findFirst({
      where: { id: licenseId, applicationId: apiKey.applicationId },
    });
    if (!existing) {
      throw new ApiError("license_not_found", "The license does not exist.", 404);
    }
    const license = await db.$transaction(async (tx) => {
      const updated = await tx.license.update({
        where: { id: existing.id },
        data: {
          status: body.status,
          expiresAt: body.expiresAt === null ? null : body.expiresAt ? new Date(body.expiresAt) : undefined,
          maxDevices: body.maxDevices,
          note: body.note,
        },
      });
      if (body.status && ["SUSPENDED", "REVOKED", "EXPIRED"].includes(body.status)) {
        await tx.clientSession.updateMany({
          where: { licenseId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
    await writeAuditEvent({
      organizationId: apiKey.application.organizationId,
      applicationId: apiKey.applicationId,
      action: licenseMutationAction(body.status),
      targetType: "license",
      targetId: license.id,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      metadata: sellerAuditMetadata(apiKey, {
        previousStatus: existing.status,
        currentStatus: license.status,
      }),
    });
    if (body.status) {
      await emitWebhook({
        applicationId: apiKey.applicationId,
        eventType: `license.${body.status.toLowerCase()}`,
        data: { licenseId: license.id, status: license.status },
      });
    }
    return noStoreJson({ success: true, data: license });
  } catch (error) {
    return jsonError(error);
  }
}
