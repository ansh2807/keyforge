import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sessionSchema } from "@/lib/client-schemas";
import { authorizedFile } from "@/lib/client-features";
import { jsonError, parseJson } from "@/lib/http";
import { readManagedFile } from "@/lib/storage";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const body = await parseJson(request, sessionSchema.omit({ nonce: true }).extend({ nonce: z.string().min(12).max(200).optional() }));
    const { fileId } = await context.params;
    const result = await authorizedFile(body.appId, body.sessionToken, fileId);
    const bytes = await readManagedFile(result.file.storageKey);
    const safeName = result.file.originalName.replace(/["\r\n]/g, "_");
    return new NextResponse(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": result.file.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Digest": `sha-256=${Buffer.from(result.file.sha256, "hex").toString("base64")}`,
        "X-Keyforge-SHA256": result.file.sha256,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
