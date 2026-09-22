import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { issueLicenses } from "@/lib/licenses";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";
import { writeAuditEvent } from "@/lib/audit";
import { sellerAuditMetadata } from "@/lib/audit-events";

const createSchema = z.object({
  planId: z.string().min(1),
  count: z.number().int().min(1).max(1000).default(1),
  durationDays: z.number().int().min(1).max(3650).nullable().optional(),
  maxDevices: z.number().int().min(1).max(50).default(1),
  customerEmail: z.email().max(254).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "licenses:read");
    const status = request.nextUrl.searchParams.get("status");
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || "50") || 50, 100);
    const licenses = await db.license.findMany({
      where: {
        applicationId: apiKey.applicationId,
        ...(status && ["UNUSED", "ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"].includes(status)
          ? { status: status as "UNUSED" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED" }
          : {}),
      },
      include: { plan: { select: { name: true } }, _count: { select: { activations: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return noStoreJson({
      success: true,
      data: licenses.map((license) => ({
        id: license.id,
        key: `${license.keyPrefix}...${license.keyLastFour}`,
        status: license.status,
        plan: license.plan.name,
        expiresAt: license.expiresAt,
        maxDevices: license.maxDevices,
        activeDevices: license._count.activations,
        customerEmail: license.customerEmail,
        note: license.note,
        createdAt: license.createdAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "licenses:write");
    const body = await parseJson(request, createSchema);
    const issue = (transaction?: Prisma.TransactionClient) => issueLicenses({
        applicationId: apiKey.applicationId,
        planId: body.planId,
        count: body.count,
        durationDays: body.durationDays,
        maxDevices: body.maxDevices,
        customerEmail: body.customerEmail,
        note: body.note,
        transaction,
      });
    const keys = apiKey.kind === "reseller"
      ? await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Reseller" WHERE "id" = ${apiKey.id} FOR UPDATE`;
          const reseller = await tx.reseller.findUnique({ where: { id: apiKey.id } });
          if (!reseller || reseller.credits < body.count) {
            throw new ApiError("insufficient_credits", "The reseller does not have enough issuance credits.", 403);
          }
          const issued = await issue(tx);
          await tx.reseller.update({ where: { id: reseller.id }, data: { credits: { decrement: body.count } } });
          return issued;
        })
      : await issue();
    await writeAuditEvent({
      organizationId: apiKey.application.organizationId,
      applicationId: apiKey.applicationId,
      action: "license.issued",
      targetType: "license",
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      metadata: sellerAuditMetadata(apiKey, { count: keys.length, planId: body.planId }),
    });
    return noStoreJson({ success: true, data: { keys } }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
