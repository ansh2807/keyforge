import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatchWebhook } from "@/lib/webhooks";
import { jsonError, noStoreJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

export async function POST(request: NextRequest) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "webhooks:write");
    const deliveries = await db.webhookDelivery.findMany({
      where: {
        endpoint: { applicationId: apiKey.applicationId, active: true },
        status: "FAILED",
        attempts: { lt: 8 },
        nextAttemptAt: { lte: new Date() },
      },
      select: { id: true },
      orderBy: { nextAttemptAt: "asc" },
      take: 25,
    });
    const results = await Promise.allSettled(
      deliveries.map((delivery) => dispatchWebhook(delivery.id)),
    );
    return noStoreJson({
      success: true,
      data: {
        attempted: results.length,
        completed: results.filter((result) => result.status === "fulfilled").length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
