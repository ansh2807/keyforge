import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { validateClientSession } from "@/lib/licenses";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await validateClientSession({
      appId: body.appId,
      sessionToken: body.sessionToken,
      nonce: body.nonce,
      ipAddress: clientIp(request),
    });
    return noStoreJson(signedClientResponse(result.application, result.payload));
  } catch (error) {
    return jsonError(error);
  }
}
