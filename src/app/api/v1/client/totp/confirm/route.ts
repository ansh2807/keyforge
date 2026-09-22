import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { totpConfirmSchema } from "@/lib/client-schemas";
import { requireProductUser } from "@/lib/client-features";
import { verifyTotp } from "@/lib/totp";
import { decryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, totpConfirmSchema);
    const result = await requireProductUser(body.appId, body.sessionToken);
    if (!result.user.totpSecret) throw new ApiError("totp_not_started", "Start authenticator setup first.", 400);
    const secret = decryptSecret(result.user.totpSecret, getMasterKey());
    if (!verifyTotp(secret, body.token)) throw new ApiError("invalid_mfa", "The authenticator code is invalid.", 401);
    await db.endUser.update({ where: { id: result.user.id }, data: { totpEnabled: true } });
    const data = { nonce: body.nonce, serverTime: new Date().toISOString(), enabled: true };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
