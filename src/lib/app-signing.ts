import "server-only";
import type { Application } from "@prisma/client";
import { canonicalJson, decryptSecret, signPayload } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";

export function signedClientResponse(application: Application, data: unknown) {
  const privateKey = decryptSecret(application.signingPrivateKey, getMasterKey());
  return {
    success: true as const,
    data,
    signedPayload: Buffer.from(canonicalJson(data), "utf8").toString("base64url"),
    signature: signPayload(data, privateKey),
    keyId: application.signingKeyId,
    algorithm: "Ed25519" as const,
  };
}
