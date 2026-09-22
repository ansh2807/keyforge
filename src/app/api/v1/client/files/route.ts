import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { availableFiles } from "@/lib/client-features";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await availableFiles(body.appId, body.sessionToken);
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      files: result.files.map((file) => ({
        ...file,
        updatedAt: file.updatedAt.toISOString(),
        downloadPath: `/api/v1/client/files/${file.id}`,
      })),
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
