import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

const schema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELED", "EXPIRED"]).optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
}).refine((body) => Object.keys(body).length > 0, "At least one field is required.");

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const principal = await requireSellerKey(request.headers.get("authorization"), "users:write");
    const body = await parseJson(request, schema);
    const { subscriptionId } = await context.params;
    const existing = await db.userSubscription.findFirst({
      where: { id: subscriptionId, user: { applicationId: principal.applicationId } },
    });
    if (!existing) throw new ApiError("subscription_not_found", "The subscription does not exist.", 404);
    const subscription = await db.userSubscription.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        expiresAt: body.expiresAt === null ? null : body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });
    if (body.status && body.status !== "ACTIVE") {
      await db.clientSession.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return noStoreJson({ success: true, data: subscription });
  } catch (error) {
    return jsonError(error);
  }
}
