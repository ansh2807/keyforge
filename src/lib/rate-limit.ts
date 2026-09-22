import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";

export async function enforceRateLimit(
  bucket: string,
  options: { limit: number; windowSeconds: number },
): Promise<void> {
  const since = new Date(Date.now() - options.windowSeconds * 1000);
  const attempts = await db.authAttempt.count({
    where: { bucket, createdAt: { gte: since }, success: false },
  });
  if (attempts >= options.limit) {
    throw new ApiError(
      "rate_limited",
      `Too many attempts. Try again in ${Math.ceil(options.windowSeconds / 60)} minute(s).`,
      429,
    );
  }
}

export async function recordAuthAttempt(bucket: string, success: boolean): Promise<void> {
  await db.authAttempt.create({ data: { bucket, success } });
}
