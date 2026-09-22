import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

export async function GET(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "users:read");
    const users = await db.endUser.findMany({
      where: { applicationId: apiKey.applicationId },
      include: {
        plan: { select: { name: true } },
        license: { select: { keyPrefix: true, keyLastFour: true, expiresAt: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return noStoreJson({
      success: true,
      data: users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        plan: user.plan.name,
        license: user.license
          ? `${user.license.keyPrefix}...${user.license.keyLastFour}`
          : null,
        licenseExpiresAt: user.license?.expiresAt ?? null,
        sessionCount: user._count.sessions,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
