import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

const schema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
  licenseId: z.string().nullable().optional(),
  startsAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELED", "EXPIRED"]).default("ACTIVE"),
});

export async function GET(request: NextRequest) {
  try {
    const principal = await requireSellerKey(request.headers.get("authorization"), "users:read");
    const userId = request.nextUrl.searchParams.get("userId");
    const subscriptions = await db.userSubscription.findMany({
      where: {
        user: { applicationId: principal.applicationId },
        ...(userId ? { userId } : {}),
      },
      include: { user: { select: { username: true, email: true } }, plan: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 250,
    });
    return noStoreJson({ success: true, data: subscriptions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requireSellerKey(request.headers.get("authorization"), "users:write");
    const body = await parseJson(request, schema);
    const [user, plan, license] = await Promise.all([
      db.endUser.findFirst({ where: { id: body.userId, applicationId: principal.applicationId } }),
      db.plan.findFirst({ where: { id: body.planId, applicationId: principal.applicationId } }),
      body.licenseId ? db.license.findFirst({ where: { id: body.licenseId, applicationId: principal.applicationId } }) : null,
    ]);
    if (!user) throw new ApiError("user_not_found", "The product user does not exist.", 404);
    if (!plan) throw new ApiError("plan_not_found", "The plan does not exist.", 404);
    if (body.licenseId && !license) throw new ApiError("license_not_found", "The license does not exist.", 404);
    const subscription = await db.userSubscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        licenseId: license?.id,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        status: body.status,
      },
    });
    return noStoreJson({ success: true, data: subscription }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
