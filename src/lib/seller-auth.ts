import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { getMasterKey } from "@/lib/env";
import { keyedHash } from "@/lib/crypto";

export async function requireSellerKey(
  authorization: string | null,
  requiredScope: string,
) {
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError("missing_api_key", "A seller API key is required.", 401);
  }
  const rawKey = authorization.slice("Bearer ".length).trim();
  if (!rawKey.startsWith("kf_live_") && !rawKey.startsWith("kf_res_")) {
    throw new ApiError("invalid_api_key", "The seller API key is invalid.", 401);
  }
  const keyHash = keyedHash(rawKey, getMasterKey());
  if (rawKey.startsWith("kf_live_")) {
    const apiKey = await db.apiKey.findUnique({ where: { keyHash }, include: { application: true } });
    if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt <= new Date())) {
      throw new ApiError("invalid_api_key", "The seller API key is invalid or expired.", 401);
    }
    if (!apiKey.scopes.includes(requiredScope)) {
      throw new ApiError("insufficient_scope", `This key requires the ${requiredScope} scope.`, 403);
    }
    await db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });
    return { ...apiKey, kind: "api_key" as const };
  }
  const reseller = await db.reseller.findUnique({ where: { keyHash }, include: { application: true } });
  if (!reseller || !reseller.active || !reseller.application || (reseller.expiresAt && reseller.expiresAt <= new Date())) {
    throw new ApiError("invalid_api_key", "The reseller key is invalid or expired.", 401);
  }
  const application = reseller.application;
  if (!reseller.scopes.includes(requiredScope)) {
    throw new ApiError("insufficient_scope", `This key requires the ${requiredScope} scope.`, 403);
  }
  await db.reseller.update({ where: { id: reseller.id }, data: { lastUsedAt: new Date() } });
  return {
    ...reseller,
    application,
    applicationId: application.id,
    kind: "reseller" as const,
  };
}
