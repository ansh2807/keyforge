import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionActionSchema } from "@/lib/client-schemas";
import { executeRemoteFunction } from "@/lib/client-features";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/crypto";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  try {
    const body = await parseJson(request, sessionActionSchema);
    const { name } = await context.params;
    const result = await executeRemoteFunction(body.appId, body.sessionToken, name, body.input);
    await enforceRateLimit(`remote-function:${hashToken(`${body.sessionToken}:${name}`)}`, {
      limit: result.rateLimitPerMinute,
      windowSeconds: 60,
    });
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      name: result.name,
      response: result.response,
      request: result.request,
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
