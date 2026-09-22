import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { requireProductUser } from "@/lib/client-features";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/env";
import { hashToken, randomToken } from "@/lib/crypto";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await requireProductUser(body.appId, body.sessionToken);
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.productLoginToken.create({
      data: {
        applicationId: result.session.applicationId,
        userId: result.user.id,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      url: `${getBaseUrl()}/portal/${body.appId}?loginToken=${encodeURIComponent(token)}`,
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
