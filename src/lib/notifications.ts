import "server-only";
import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { assertSafeWebhookUrl } from "@/lib/safe-url";

export async function emitNotifications(input: {
  applicationId: string;
  eventType: string;
  data: Prisma.InputJsonValue;
}): Promise<void> {
  const channels = await db.notificationChannel.findMany({
    where: {
      applicationId: input.applicationId,
      active: true,
      OR: [{ events: { has: input.eventType } }, { events: { has: "*" } }],
    },
  });
  await Promise.allSettled(channels.map(async (channel) => {
    const endpoint = await assertSafeWebhookUrl(decryptSecret(channel.endpoint, getMasterKey()));
    const genericPayload = {
      type: input.eventType,
      createdAt: new Date().toISOString(),
      data: input.data,
    };
    const summary = `Keyforge ${input.eventType}\n${JSON.stringify(input.data).slice(0, 1500)}`;
    const payload = channel.kind === "DISCORD"
      ? { content: summary }
      : channel.kind === "TELEGRAM"
        ? { text: summary, disable_web_page_preview: true }
        : genericPayload;
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "Keyforge-Notifications/1.0" };
    if (channel.secret) {
      const secret = decryptSecret(channel.secret, getMasterKey());
      headers["X-Keyforge-Signature"] = `v1=${createHmac("sha256", secret).update(body).digest("hex")}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(endpoint, { method: "POST", headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }));
}
