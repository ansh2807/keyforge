import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { clientLoginSchema } from "@/lib/client-schemas";
import { loginEndUser } from "@/lib/licenses";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { enforceRateLimit, recordAuthAttempt } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";

export async function POST(request: NextRequest) {
  let bucket = "client-login:unknown";
  try {
    const body = await parseJson(request, clientLoginSchema);
    bucket = `client-login:${keyedHash(
      `${body.appId}:${body.username.toLowerCase()}:${clientIp(request)}`,
      getMasterKey(),
    )}`;
    await enforceRateLimit(bucket, { limit: 8, windowSeconds: 15 * 60 });
    const result = await loginEndUser({
      appId: body.appId,
      username: body.username,
      password: body.password,
      totp: body.totp,
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
    return noStoreJson(signedClientResponse(result.application, result.payload));
  } catch (error) {
    await recordAuthAttempt(bucket, false).catch(() => undefined);
    return jsonError(error);
  }
}
