import { NextRequest } from "next/server";
import { signedClientResponse } from "@/lib/app-signing";
import { userVariableSchema } from "@/lib/client-schemas";
import { requireProductUser } from "@/lib/client-features";
import { db } from "@/lib/db";
import { jsonError, noStoreJson, parseJson } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request, userVariableSchema);
    const result = await requireProductUser(body.appId, body.sessionToken);
    const variable = body.value === undefined
      ? await db.userVariable.findUnique({ where: { userId_key: { userId: result.user.id, key: body.key } } })
      : await db.userVariable.upsert({
          where: { userId_key: { userId: result.user.id, key: body.key } },
          create: { userId: result.user.id, key: body.key, value: body.value },
          update: { value: body.value },
        });
    const data = {
      nonce: body.nonce,
      serverTime: new Date().toISOString(),
      key: body.key,
      value: variable?.value ?? null,
      updatedAt: variable?.updatedAt.toISOString() ?? null,
    };
    return noStoreJson(signedClientResponse(result.session.application, data));
  } catch (error) {
    return jsonError(error);
  }
}
