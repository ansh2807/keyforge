import { NextRequest } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { signedClientResponse } from "@/lib/app-signing";
import { verifyPasskeyRegistration } from "@/lib/passkeys";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

const schema = z.object({
  appId: z.string().min(12).max(100),
  sessionToken: z.string().min(30).max(200),
  nonce: z.string().min(12).max(200),
  name: z.string().trim().min(1).max(80),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, schema);
    const result = await verifyPasskeyRegistration({
      appId: body.appId,
      sessionToken: body.sessionToken,
      name: body.name,
      response: body.response as unknown as RegistrationResponseJSON,
    });
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      registered: true,
      passkey: { id: result.passkey.id, name: result.passkey.name, createdAt: result.passkey.createdAt.toISOString() },
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
