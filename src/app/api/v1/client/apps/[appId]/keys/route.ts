import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { ApiError } from "@/lib/api-error";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  try {
    const { appId } = await context.params;
    const application = await db.application.findUnique({ where: { publicId: appId } });
    if (!application || application.status === "ARCHIVED") {
      throw new ApiError("application_not_found", "The application ID is invalid.", 404);
    }
    return noStoreJson({
      success: true,
      data: {
        appId: application.publicId,
        name: application.name,
        keyId: application.signingKeyId,
        algorithm: "Ed25519",
        publicKey: application.signingPublicKey,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
