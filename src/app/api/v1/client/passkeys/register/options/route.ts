import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { registrationOptions } from "@/lib/passkeys";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await registrationOptions(body.appId, body.sessionToken);
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      options: result.options,
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
