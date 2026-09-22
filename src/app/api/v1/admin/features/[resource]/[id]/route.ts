import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deleteManagedFile } from "@/lib/storage";
import { ApiError } from "@/lib/api-error";
import { jsonError, noStoreJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "features:write");
    const { resource, id } = await context.params;
    const where = { id, applicationId: apiKey.applicationId };
    if (resource === "variables") await db.applicationVariable.deleteMany({ where });
    else if (resource === "builds") await db.buildArtifact.deleteMany({ where });
    else if (resource === "access-rules") await db.accessRule.deleteMany({ where });
    else if (resource === "functions") await db.remoteFunction.deleteMany({ where });
    else if (resource === "chat-channels") await db.chatChannel.deleteMany({ where });
    else if (resource === "notifications") await db.notificationChannel.deleteMany({ where });
    else if (resource === "files") {
      await requireSellerKey(request.headers.get("authorization"), "files:write");
      const file = await db.managedFile.findFirst({ where });
      if (file) {
        await db.managedFile.delete({ where: { id: file.id } });
        await deleteManagedFile(file.storageKey);
      }
    } else throw new ApiError("invalid_resource", "The feature resource is invalid.", 400);
    return noStoreJson({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
