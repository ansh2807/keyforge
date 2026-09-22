import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { deleteManagedFile, storeManagedFile } from "@/lib/storage";
import { jsonError, noStoreJson } from "@/lib/http";
import { requireSellerKey } from "@/lib/seller-auth";

export async function POST(request: NextRequest) {
  let newStorageKey: string | null = null;
  try {
    const apiKey = await requireSellerKey(request.headers.get("authorization"), "files:write");
    const form = await request.formData();
    const name = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/).parse(form.get("name"));
    const planId = z.string().optional().parse(String(form.get("planId") || "")) || null;
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("file_required", "A multipart file field is required.", 400);
    if (planId) {
      const plan = await db.plan.findFirst({ where: { id: planId, applicationId: apiKey.applicationId } });
      if (!plan) throw new ApiError("plan_not_found", "The selected plan does not exist.", 404);
    }
    const stored = await storeManagedFile(file);
    newStorageKey = stored.storageKey;
    const existing = await db.managedFile.findUnique({ where: { applicationId_name: { applicationId: apiKey.applicationId, name } } });
    const saved = await db.managedFile.upsert({
      where: { applicationId_name: { applicationId: apiKey.applicationId, name } },
      create: { applicationId: apiKey.applicationId, planId, name, ...stored },
      update: { planId, ...stored, active: true },
      select: { id: true, name: true, originalName: true, contentType: true, size: true, sha256: true, planId: true, active: true, updatedAt: true },
    });
    if (existing) await deleteManagedFile(existing.storageKey);
    newStorageKey = null;
    return noStoreJson({ success: true, data: saved }, 201);
  } catch (error) {
    if (newStorageKey) await deleteManagedFile(newStorageKey).catch(() => undefined);
    return jsonError(error);
  }
}
