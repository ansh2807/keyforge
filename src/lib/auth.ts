import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { decryptSecret, hashToken, keyedHash, randomToken } from "@/lib/crypto";
import { getMasterKey, getSessionDays } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit, recordAuthAttempt } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";

export const ADMIN_COOKIE = "kf_admin_session";

export async function getRequestMetadata(): Promise<{
  ipAddress: string;
  userAgent: string;
}> {
  const requestHeaders = await headers();
  return {
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      "unknown",
    userAgent: requestHeaders.get("user-agent") || "unknown",
  };
}

export async function createAdminSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const days = getSessionDays();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const metadata = await getRequestMetadata();
  await db.adminSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (token) {
    await db.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(ADMIN_COOKIE);
}

export async function getCurrentAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await db.adminSession.delete({ where: { id: session.id } });
    }
    return null;
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await getCurrentAdmin();
  if (!user) {
    redirect("/login");
  }
  const membership = user.memberships[0];
  if (!membership) {
    throw new Error("The administrator is not assigned to an organization.");
  }
  return { user, membership, organization: membership.organization };
}

export async function hasCompletedSetup(): Promise<boolean> {
  return (await db.adminUser.count()) > 0;
}

function adminAuthenticationBucket(email: string, ipAddress: string): string {
  return `admin:${keyedHash(`${email}:${ipAddress}`, getMasterKey())}`;
}

export async function authenticateAdminPassword(input: {
  email: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const metadata = await getRequestMetadata();
  const bucket = adminAuthenticationBucket(email, metadata.ipAddress);
  await enforceRateLimit(bucket, { limit: 8, windowSeconds: 15 * 60 });
  const user = await db.adminUser.findUnique({ where: { email } });
  const passwordValid = user ? await verifyPassword(user.passwordHash, input.password) : false;
  if (!user || !passwordValid) {
    await recordAuthAttempt(bucket, false);
    throw new ApiError("invalid_credentials", "The email or password is incorrect.", 401);
  }
  return user;
}

export async function verifyAdminTotp(
  user: { email: string; totpEnabled: boolean; totpSecret: string | null },
  token?: string,
): Promise<void> {
  const metadata = await getRequestMetadata();
  const bucket = adminAuthenticationBucket(user.email, metadata.ipAddress);
  const valid = Boolean(
    user.totpEnabled &&
    user.totpSecret &&
    token &&
    verifyTotp(decryptSecret(user.totpSecret, getMasterKey()), token),
  );
  if (!valid) {
    await recordAuthAttempt(bucket, false);
    throw new ApiError("invalid_totp", "The authenticator code is incorrect.", 401);
  }
}

export async function completeAdminAuthentication(user: { id: string; email: string }): Promise<void> {
  const metadata = await getRequestMetadata();
  const bucket = adminAuthenticationBucket(user.email, metadata.ipAddress);
  await Promise.all([
    recordAuthAttempt(bucket, true),
    db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
}

export async function authenticateAdmin(input: {
  email: string;
  password: string;
  totp?: string;
}): Promise<{ id: string }> {
  const user = await authenticateAdminPassword(input);
  if (user.totpEnabled) {
    await verifyAdminTotp(user, input.totp);
  } else if (user.emailOtpEnabled) {
    throw new ApiError("email_otp_required", "Choose email verification to receive a sign-in code.", 401);
  }
  await completeAdminAuthentication(user);
  return { id: user.id };
}

export function requireRole(role: string, allowed: string[]): void {
  if (!allowed.includes(role)) {
    throw new ApiError("forbidden", "Your role does not allow this action.", 403);
  }
}
