import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { hashToken } from "@/lib/crypto";
import { loginEndUserWithPasskey } from "@/lib/licenses";
import { signedClientResponse } from "@/lib/app-signing";
import { clientIp, jsonError, noStoreJson, parseJson } from "@/lib/http";

const schema = z.object({
  appId: z.string().min(12).max(100),
  loginToken: z.string().min(30).max(200),
  installationId: z.string().min(12).max(500),
  installationLabel: z.string().trim().min(1).max(120).optional(),
  nonce: z.string().min(12).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, schema);
    const application = await db.application.findUnique({ where: { publicId: body.appId } });
    if (!application) throw new ApiError("application_not_found", "The application ID is invalid.", 404);
    const token = await db.productLoginToken.findUnique({ where: { tokenHash: hashToken(body.loginToken) } });
    if (!token || token.applicationId !== application.id || token.usedAt || token.expiresAt <= new Date()) {
      throw new ApiError("invalid_login_token", "The login link is invalid or expired.", 401);
    }
    const claimed = await db.productLoginToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ApiError("invalid_login_token", "The login link has already been used.", 401);
    const result = await loginEndUserWithPasskey({
      appId: body.appId,
      userId: token.userId,
      activation: {
        installationId: body.installationId,
        installationLabel: body.installationLabel,
        nonce: body.nonce,
        ipAddress: clientIp(request),
      },
    });
    return noStoreJson(signedClientResponse(result.application, result.payload));
  } catch (error) {
    return jsonError(error);
  }
}
