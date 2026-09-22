import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { requireProductUser } from "@/lib/client-features";
import { createTotpSecret } from "@/lib/totp";
import { encryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { db } from "@/lib/db";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await requireProductUser(body.appId, body.sessionToken);
    const setup = createTotpSecret(result.user.email || result.user.username);
    await db.endUser.update({
      where: { id: result.user.id },
      data: { totpSecret: encryptSecret(setup.secret, getMasterKey()), totpEnabled: false },
    });
    const data = { nonce: body.nonce, serverTime: new Date().toISOString(), uri: setup.uri, secret: setup.secret };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
