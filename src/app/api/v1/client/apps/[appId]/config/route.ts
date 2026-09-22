import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { signedClientResponse } from "@/lib/app-signing";
import { jsonError, noStoreJson } from "@/lib/http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ appId: string }> },
) {
  try {
    const { appId } = await context.params;
    const application = await db.application.findUnique({ where: { publicId: appId } });
    if (!application || application.status !== "ACTIVE") throw new ApiError("application_not_found", "The application ID is invalid.", 404);
    const [variables, builds] = await Promise.all([
      db.applicationVariable.findMany({ where: { applicationId: application.id, visibility: "PUBLIC", active: true }, select: { key: true, value: true, updatedAt: true }, orderBy: { key: "asc" } }),
      db.buildArtifact.findMany({ where: { applicationId: application.id, active: true }, select: { version: true, platform: true, sha256: true, downloadUrl: true, updatedAt: true }, orderBy: [{ platform: "asc" }, { updatedAt: "desc" }] }),
    ]);
    const data = {
      nonce: request.nextUrl.searchParams.get("nonce") || null,
      serverTime: new Date().toISOString(),
      application: { id: application.publicId, name: application.name, version: application.version },
      variables: Object.fromEntries(variables.map((variable) => [variable.key, variable.value])),
      builds: builds.map((build) => ({ ...build, updatedAt: build.updatedAt.toISOString() })),
    };
    return noStoreJson(signedClientResponse(application, data));
  } catch (error) {
    return jsonError(error);
  }
}
