import { NextRequest } from "next/server";
import { deactivateSchema } from "@/lib/client-schemas";
import { deactivateClientSession } from "@/lib/licenses";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, deactivateSchema);
    await deactivateClientSession(body.appId, body.sessionToken);
    return noStoreJson({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
