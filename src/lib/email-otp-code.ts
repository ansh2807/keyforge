import { randomInt } from "node:crypto";
import { constantTimeEqual, keyedHash } from "@/lib/crypto";

export const EMAIL_OTP_TTL_MINUTES = 10;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

export function generateEmailOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashEmailOtpCode(token: string, code: string, key: Buffer): string {
  return keyedHash(`admin-email-otp:${token}:${code}`, key);
}

export function verifyEmailOtpCode(
  token: string,
  code: string,
  expectedHash: string,
  key: Buffer,
): boolean {
  return constantTimeEqual(hashEmailOtpCode(token, code, key), expectedHash);
}

export function maskEmailAddress(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your administrator email";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}
