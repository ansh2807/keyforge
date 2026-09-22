import "server-only";
import { AdminEmailOtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { getMasterKey } from "@/lib/env";
import { hashToken, randomToken } from "@/lib/crypto";
import {
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_TTL_MINUTES,
  generateEmailOtpCode,
  hashEmailOtpCode,
  maskEmailAddress,
  verifyEmailOtpCode,
} from "@/lib/email-otp-code";
import { sendAdminEmailOtp } from "@/lib/email";

const SEND_WINDOW_MINUTES = 15;
const SEND_LIMIT = 3;

export async function createAdminEmailOtpChallenge(input: {
  user: { id: string; email: string; name: string };
  purpose: AdminEmailOtpPurpose;
}): Promise<{ challengeToken: string; emailHint: string; expiresInMinutes: number }> {
  const now = new Date();
  const sentSince = new Date(now.getTime() - SEND_WINDOW_MINUTES * 60_000);
  const recentCount = await db.adminEmailOtpChallenge.count({
    where: {
      userId: input.user.id,
      purpose: input.purpose,
      createdAt: { gte: sentSince },
    },
  });
  if (recentCount >= SEND_LIMIT) {
    throw new ApiError(
      "email_otp_rate_limited",
      `Too many email codes were requested. Try again in ${SEND_WINDOW_MINUTES} minutes.`,
      429,
    );
  }

  await db.adminEmailOtpChallenge.updateMany({
    where: { userId: input.user.id, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: now },
  });
  await db.adminEmailOtpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
  });

  const challengeToken = randomToken(32);
  const code = generateEmailOtpCode();
  const challenge = await db.adminEmailOtpChallenge.create({
    data: {
      userId: input.user.id,
      purpose: input.purpose,
      tokenHash: hashToken(challengeToken),
      codeHash: hashEmailOtpCode(challengeToken, code, getMasterKey()),
      expiresAt: new Date(now.getTime() + EMAIL_OTP_TTL_MINUTES * 60_000),
    },
  });

  try {
    await sendAdminEmailOtp({
      to: input.user.email,
      name: input.user.name,
      code,
      purpose: input.purpose,
    });
  } catch {
    await db.adminEmailOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    throw new ApiError(
      "email_delivery_failed",
      "The verification email could not be sent. Check the SMTP configuration and try again.",
      503,
    );
  }

  return {
    challengeToken,
    emailHint: maskEmailAddress(input.user.email),
    expiresInMinutes: EMAIL_OTP_TTL_MINUTES,
  };
}

export async function verifyAdminEmailOtpChallenge(input: {
  challengeToken: string;
  code: string;
  purpose: AdminEmailOtpPurpose;
  expectedUserId?: string;
}): Promise<{ id: string; email: string }> {
  const challenge = await db.adminEmailOtpChallenge.findUnique({
    where: { tokenHash: hashToken(input.challengeToken) },
    include: { user: true },
  });
  if (
    !challenge ||
    challenge.purpose !== input.purpose ||
    challenge.consumedAt ||
    challenge.attempts >= EMAIL_OTP_MAX_ATTEMPTS ||
    (input.expectedUserId && challenge.userId !== input.expectedUserId)
  ) {
    throw new ApiError("invalid_email_otp", "That email code is invalid. Start again.", 401);
  }
  if (challenge.expiresAt <= new Date()) {
    await db.adminEmailOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    throw new ApiError("expired_email_otp", "That email code has expired. Request a new one.", 401);
  }

  const valid = verifyEmailOtpCode(
    input.challengeToken,
    input.code,
    challenge.codeHash,
    getMasterKey(),
  );
  if (!valid) {
    const attempts = challenge.attempts + 1;
    await db.adminEmailOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts,
        consumedAt: attempts >= EMAIL_OTP_MAX_ATTEMPTS ? new Date() : null,
      },
    });
    const remaining = Math.max(0, EMAIL_OTP_MAX_ATTEMPTS - attempts);
    throw new ApiError(
      "invalid_email_otp",
      remaining ? `That email code is incorrect. ${remaining} attempt(s) remain.` : "Too many incorrect codes. Start again.",
      401,
    );
  }

  const consumed = await db.adminEmailOtpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new ApiError("invalid_email_otp", "That email code has already been used.", 401);
  }
  return { id: challenge.user.id, email: challenge.user.email };
}
