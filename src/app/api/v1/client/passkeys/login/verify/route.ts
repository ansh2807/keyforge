import { NextRequest } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyPasskeyAuthentication } from "@/lib/passkeys";
import { loginEndUserWithPasskey } from "@/lib/licenses";
import { signedClientResponse } from "@/lib/app-signing";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { enforceRateLimit, recordAuthAttempt } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";

const schema = z.object({
  appId: z.string().min(12).max(100),
  username: z.string().trim().min(1).max(254),
  installationId: z.string().min(12).max(500),
  installationLabel: z.string().trim().min(1).max(120).optional(),
  installationPublicKey: z.string().max(2000).optional(),
  clientVersion: z.string().trim().min(1).max(40).optional(),
  nonce: z.string().min(12).max(200),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  let bucket = "passkey-login:unknown";
  try {
    const body = await parseJson(request, schema);
    bucket = `passkey-login:${keyedHash(`${body.appId}:${clientIp(request)}`, getMasterKey())}`;
    await enforceRateLimit(bucket, { limit: 20, windowSeconds: 10 * 60 });
    const user = await verifyPasskeyAuthentication({
      appId: body.appId,
      username: body.username,
      response: body.response as unknown as AuthenticationResponseJSON,
    });
    const result = await loginEndUserWithPasskey({
      appId: body.appId,
      userId: user.id,
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
