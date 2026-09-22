import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatchWebhook } from "@/lib/webhooks";
import { jsonError, noStoreJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

export async function POST(request: NextRequest) {
  try {
    const principal = await requireSellerKey(request.headers.get("authorization"), "webhooks:write");
    const now = new Date();
    const stale = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deliveries = await db.webhookDelivery.findMany({
      where: {
        endpoint: { applicationId: principal.applicationId, active: true },
        status: "FAILED",
        attempts: { lt: 8 },
        nextAttemptAt: { lte: now },
      },
      select: { id: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 50,
    });
    const retryResults = await Promise.allSettled(deliveries.map((delivery) => dispatchWebhook(delivery.id)));
    const [sessions, compatibilitySessions, challenges, loginTokens] = await db.$transaction([
      db.clientSession.deleteMany({ where: { applicationId: principal.applicationId, expiresAt: { lt: stale } } }),
      db.compatibilitySession.deleteMany({ where: { applicationId: principal.applicationId, expiresAt: { lt: now } } }),
      db.productAuthChallenge.deleteMany({ where: { user: { applicationId: principal.applicationId }, expiresAt: { lt: now } } }),
      db.productLoginToken.deleteMany({ where: { applicationId: principal.applicationId, expiresAt: { lt: now } } }),
    ]);
    return noStoreJson({
      success: true,
      data: {
        webhooksAttempted: retryResults.length,
        webhooksCompleted: retryResults.filter((result) => result.status === "fulfilled").length,
        deleted: {
          sessions: sessions.count,
          compatibilitySessions: compatibilitySessions.count,
          challenges: challenges.count,
          loginTokens: loginTokens.count,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
