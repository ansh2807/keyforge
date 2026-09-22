import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, asApiError } from "@/lib/api-error";

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "invalid_request",
          message: error.issues[0]?.message || "The request is invalid.",
        },
      },
      { status: 400 },
    );
  }
  const apiError = asApiError(error);
  return NextResponse.json(
    {
      success: false,
      error: { code: apiError.code, message: apiError.message },
    },
    { status: apiError.status },
  );
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("invalid_json", "The request body must be valid JSON.", 400);
  }
  return schema.parse(body);
}

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
