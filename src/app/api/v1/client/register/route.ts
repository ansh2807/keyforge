import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { registerSchema } from "@/lib/client-schemas";
import { registerEndUser } from "@/lib/licenses";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { enforceRateLimit, recordAuthAttempt } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { emitWebhook } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  let bucket = "client-register:unknown";
  try {
    const body = await parseJson(request, registerSchema);
    bucket = `client-register:${keyedHash(`${body.appId}:${clientIp(request)}`, getMasterKey())}`;
    await enforceRateLimit(bucket, { limit: 10, windowSeconds: 15 * 60 });
    const result = await registerEndUser({
      appId: body.appId,
      licenseKey: body.licenseKey,
      username: body.username,
      email: body.email,
      password: body.password,
      activation: {
        installationId: body.installationId,
        installationLabel: body.installationLabel,
        installationPublicKey: body.installationPublicKey,
        clientVersion: body.clientVersion,
        nonce: body.nonce,
        ipAddress: clientIp(request),
      },
    });
    await recordAuthAttempt(bucket, true);
    await emitWebhook({
      applicationId: result.application.id,
      eventType: "user.created",
      data: {
        userId: result.user.id,
        licenseId: result.license.id,
        username: result.user.username,
        occurredAt: new Date().toISOString(),
      },
    });
    return noStoreJson(signedClientResponse(result.application, result.payload), 201);
  } catch (error) {
    await recordAuthAttempt(bucket, false).catch(() => undefined);
    return jsonError(error);
  }
}
