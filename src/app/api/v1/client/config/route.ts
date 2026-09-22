import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { sessionSchema } from "@/lib/client-schemas";
import { clientConfiguration } from "@/lib/client-features";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, sessionSchema);
    const result = await clientConfiguration(body.appId, body.sessionToken);
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      variables: Object.fromEntries(result.variables.map((item) => [item.key, item.value])),
      variableMetadata: result.variables.map((item) => ({
        key: item.key,
        visibility: item.visibility,
        updatedAt: item.updatedAt.toISOString(),
      })),
      builds: result.builds.map((build) => ({
        ...build,
        updatedAt: build.updatedAt.toISOString(),
      })),
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
