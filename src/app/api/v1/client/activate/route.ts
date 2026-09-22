import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { activationSchema } from "@/lib/client-schemas";
import { activateLicense } from "@/lib/licenses";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { enforceRateLimit, recordAuthAttempt } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { emitWebhook } from "@/lib/webhooks";

export async function POST(request: NextRequest) {
  let bucket = "client-activate:unknown";
  try {
    const body = await parseJson(request, activationSchema);
    bucket = `client-activate:${keyedHash(`${body.appId}:${clientIp(request)}`, getMasterKey())}`;
    await enforceRateLimit(bucket, { limit: 20, windowSeconds: 10 * 60 });
    const result = await activateLicense(body.appId, body.licenseKey, {
      installationId: body.installationId,
      installationLabel: body.installationLabel,
      installationPublicKey: body.installationPublicKey,
      clientVersion: body.clientVersion,
      nonce: body.nonce,
      ipAddress: clientIp(request),
    });
    await recordAuthAttempt(bucket, true);
    await emitWebhook({
      applicationId: result.application.id,
      eventType: "license.activated",
      data: {
        licenseId: result.license.id,
        activationId: result.payload.activation.id,
        occurredAt: new Date().toISOString(),
      },
    });
    return noStoreJson(signedClientResponse(result.application, result.payload));
  } catch (error) {
    await recordAuthAttempt(bucket, false).catch(() => undefined);
    return jsonError(error);
  }
}
