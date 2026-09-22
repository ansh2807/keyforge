import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticationOptions } from "@/lib/passkeys";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { keyedHash } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";

const schema = z.object({
  appId: z.string().min(12).max(100),
  username: z.string().trim().min(1).max(254),
});

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, schema);
    await enforceRateLimit(
      `passkey-options:${keyedHash(`${body.appId}:${clientIp(request)}`, getMasterKey())}`,
      { limit: 20, windowSeconds: 10 * 60 },
    );
    const options = await authenticationOptions(body.appId, body.username);
    return noStoreJson({ success: true, data: { options } });
  } catch (error) {
    return jsonError(error);
  }
}
