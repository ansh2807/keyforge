import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { assertSafeWebhookUrl } from "@/lib/safe-url";
import { emitNotifications } from "@/lib/notifications";

export async function emitWebhook(input: {
  applicationId: string;
  eventType: string;
  data: Prisma.InputJsonValue;
}): Promise<void> {
  const endpoints = await db.webhookEndpoint.findMany({
    where: {
      applicationId: input.applicationId,
      active: true,
      OR: [{ events: { has: input.eventType } }, { events: { has: "*" } }],
    },
  });
  const eventId = randomUUID();
  const payload = {
    id: eventId,
    type: input.eventType,
    createdAt: new Date().toISOString(),
    data: input.data,
  } satisfies Prisma.InputJsonValue;
  const deliveries = await Promise.all(
    endpoints.map((endpoint) =>
      db.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          eventType: input.eventType,
          eventId,
          payload,
        },
      }),
    ),
  );
  await Promise.allSettled(deliveries.map((delivery) => dispatchWebhook(delivery.id)));
  await emitNotifications(input);
}

export async function dispatchWebhook(deliveryId: string): Promise<void> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || !delivery.endpoint.active) {
    return;
  }
  const body = JSON.stringify(delivery.payload);
  const safeUrl = await assertSafeWebhookUrl(delivery.endpoint.url);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = decryptSecret(delivery.endpoint.secret, getMasterKey());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(safeUrl, {
      method: "POST",
      body,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Keyforge-Webhooks/1.0",
        "X-Keyforge-Event": delivery.eventType,
        "X-Keyforge-Delivery": delivery.id,
        "X-Keyforge-Timestamp": timestamp,
        "X-Keyforge-Signature": `v1=${signature}`,
      },
    });
    const responseBody = (await response.text()).slice(0, 2000);
    const succeeded = response.ok;
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: succeeded ? "SUCCEEDED" : "FAILED",
        attempts: { increment: 1 },
        responseCode: response.status,
        responseBody,
        deliveredAt: succeeded ? new Date() : null,
        nextAttemptAt: succeeded ? null : new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  } catch (error) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        responseBody: error instanceof Error ? error.message.slice(0, 2000) : "Delivery failed",
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
