"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { AdminEmailOtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestMetadata, requireAdmin } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createTotpSecret, verifyTotp } from "@/lib/totp";
import { asApiError } from "@/lib/api-error";
import {
  createAdminEmailOtpChallenge,
  verifyAdminEmailOtpChallenge,
} from "@/lib/admin-email-otp";
import { isEmailDeliveryConfigured } from "@/lib/email";
import { writeAuditEvent } from "@/lib/audit";

export type TotpActionState = {
  error?: string;
  success?: string;
  qrCode?: string;
  secret?: string;
};

export type EmailOtpActionState = {
  error?: string;
  success?: string;
  challengeToken?: string;
  emailHint?: string;
  expiresInMinutes?: number;
};

export async function beginTotpAction(
  _previousState: TotpActionState,
  _formData: FormData,
): Promise<TotpActionState> {
  void _previousState;
  void _formData;
  try {
    const auth = await requireAdmin();
    const setup = createTotpSecret(auth.user.email);
    await db.adminUser.update({
      where: { id: auth.user.id },
      data: {
        totpSecret: encryptSecret(setup.secret, getMasterKey()),
        totpEnabled: false,
      },
    });
    return {
      qrCode: await QRCode.toDataURL(setup.uri, { width: 280, margin: 2 }),
      secret: setup.secret,
    };
  } catch (error) {
    return { error: asApiError(error).message };
  }
}

export async function enableTotpAction(
  _previousState: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  try {
    const auth = await requireAdmin();
    const token = z.string().trim().regex(/^\d{6}$/).parse(formData.get("token"));
    const freshUser = await db.adminUser.findUnique({ where: { id: auth.user.id } });
    if (!freshUser?.totpSecret) {
      return { error: "Start two-factor setup before verifying a code." };
    }
    const secret = decryptSecret(freshUser.totpSecret, getMasterKey());
    if (!verifyTotp(secret, token)) {
      return { error: "That authentication code is not valid." };
    }
    await db.adminUser.update({
      where: { id: auth.user.id },
      data: { totpEnabled: true },
    });
    revalidatePath("/dashboard/account");
    return { success: "Two-factor authentication is enabled." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Enter the six-digit code from your authenticator app." };
    }
    return { error: asApiError(error).message };
  }
}

export async function disableTotpAction(formData: FormData): Promise<void> {
  const auth = await requireAdmin();
  const token = z.string().trim().regex(/^\d{6}$/).parse(formData.get("token"));
  const freshUser = await db.adminUser.findUnique({ where: { id: auth.user.id } });
  if (!freshUser?.totpSecret) {
    return;
  }
  const secret = decryptSecret(freshUser.totpSecret, getMasterKey());
  if (!verifyTotp(secret, token)) {
    throw new Error("The authentication code is not valid.");
  }
  await db.adminUser.update({
    where: { id: auth.user.id },
    data: { totpEnabled: false, totpSecret: null },
  });
  revalidatePath("/dashboard/account");
}

export async function beginEmailOtpSetupAction(
  _previousState: EmailOtpActionState,
  _formData: FormData,
): Promise<EmailOtpActionState> {
  void _previousState;
  void _formData;
  try {
    const auth = await requireAdmin();
    if (auth.user.emailOtpEnabled) {
      return { error: "Email verification is already enabled." };
    }
    if (!isEmailDeliveryConfigured()) {
      return { error: "Email delivery is not configured on this server yet." };
    }
    return await createAdminEmailOtpChallenge({
      user: auth.user,
      purpose: AdminEmailOtpPurpose.ENABLE_MFA,
    });
  } catch (error) {
    return { error: asApiError(error).message };
  }
}

export async function enableEmailOtpAction(
  previousState: EmailOtpActionState,
  formData: FormData,
): Promise<EmailOtpActionState> {
  try {
    const auth = await requireAdmin();
    const input = z.object({
      challengeToken: z.string().min(30).max(200),
      code: z.string().trim().regex(/^\d{6}$/),
    }).parse({
      challengeToken: formData.get("challengeToken"),
      code: formData.get("code"),
    });
    await verifyAdminEmailOtpChallenge({
      challengeToken: input.challengeToken,
      code: input.code,
      purpose: AdminEmailOtpPurpose.ENABLE_MFA,
      expectedUserId: auth.user.id,
    });
    const metadata = await getRequestMetadata();
    await db.adminUser.update({
      where: { id: auth.user.id },
      data: { emailOtpEnabled: true },
    });
    await writeAuditEvent({
      organizationId: auth.organization.id,
      actorUserId: auth.user.id,
      action: "account.email_otp_enabled",
      targetType: "admin_user",
      targetId: auth.user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    revalidatePath("/dashboard/account");
    return { success: "Email verification is enabled." };
  } catch (error) {
    return {
      challengeToken: previousState.challengeToken,
      emailHint: previousState.emailHint,
      expiresInMinutes: previousState.expiresInMinutes,
      error: error instanceof z.ZodError
        ? "Enter the six-digit code from the email."
        : asApiError(error).message,
    };
  }
}

export async function disableEmailOtpAction(
  _previousState: EmailOtpActionState,
  formData: FormData,
): Promise<EmailOtpActionState> {
  try {
    const auth = await requireAdmin();
    const password = z.string().min(1).max(200).parse(formData.get("password"));
    const freshUser = await db.adminUser.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!(await verifyPassword(freshUser.passwordHash, password))) {
      return { error: "The current password is incorrect." };
    }
    await db.$transaction([
      db.adminUser.update({
        where: { id: auth.user.id },
        data: { emailOtpEnabled: false },
      }),
      db.adminEmailOtpChallenge.updateMany({
        where: { userId: auth.user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
    ]);
    const metadata = await getRequestMetadata();
    await writeAuditEvent({
      organizationId: auth.organization.id,
      actorUserId: auth.user.id,
      action: "account.email_otp_disabled",
      targetType: "admin_user",
      targetId: auth.user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    revalidatePath("/dashboard/account");
    return { success: "Email verification is disabled." };
  } catch (error) {
    return {
      error: error instanceof z.ZodError
        ? "Enter your current password."
        : asApiError(error).message,
    };
  }
}

export async function changePasswordAction(
  _previousState: TotpActionState,
  formData: FormData,
): Promise<TotpActionState> {
  try {
    const auth = await requireAdmin();
    const input = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(15).max(200),
      })
      .parse({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
      });
    const freshUser = await db.adminUser.findUniqueOrThrow({ where: { id: auth.user.id } });
    if (!(await verifyPassword(freshUser.passwordHash, input.currentPassword))) {
      return { error: "The current password is incorrect." };
    }
    await db.$transaction([
      db.adminUser.update({
        where: { id: auth.user.id },
        data: { passwordHash: await hashPassword(input.newPassword) },
      }),
      db.adminSession.deleteMany({
        where: { userId: auth.user.id },
      }),
    ]);
    return { success: "Password changed. Sign in again on your next request." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Check the password fields." };
    }
    return { error: asApiError(error).message };
  }
}
