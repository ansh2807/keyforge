import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { chatSchema } from "@/lib/client-schemas";
import { requireProductUser } from "@/lib/client-features";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/crypto";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, chatSchema);
    const result = await requireProductUser(body.appId, body.sessionToken);
    const channel = await db.chatChannel.findFirst({
      where: { applicationId: result.session.applicationId, name: body.channel, active: true },
    });
    if (!channel) throw new ApiError("channel_not_found", "The chat channel does not exist.", 404);
    if (body.message) {
      await enforceRateLimit(`chat:${hashToken(`${result.user.id}:${channel.id}`)}`, {
        limit: Math.max(1, Math.floor(60 / channel.delaySeconds)),
        windowSeconds: 60,
      });
      await db.chatMessage.create({
        data: {
          channelId: channel.id,
          userId: result.user.id,
          authorType: "USER",
          authorName: result.user.username,
          body: body.message,
        },
      });
    }
    const messages = await db.chatMessage.findMany({
      where: {
        channelId: channel.id,
        ...(body.after ? { createdAt: { gt: new Date(body.after) } } : {}),
      },
      select: { id: true, authorType: true, authorName: true, body: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      channel: channel.name,
      delaySeconds: channel.delaySeconds,
      messages: messages.reverse().map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
