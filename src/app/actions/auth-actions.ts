"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AdminEmailOtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import {
  authenticateAdminPassword,
  completeAdminAuthentication,
  createAdminSession,
  destroyAdminSession,
  hasCompletedSetup,
  verifyAdminTotp,
} from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { slugify } from "@/lib/slug";
import { asApiError } from "@/lib/api-error";
import {
  createAdminEmailOtpChallenge,
  verifyAdminEmailOtpChallenge,
} from "@/lib/admin-email-otp";
import { isEmailDeliveryConfigured } from "@/lib/email";

export type AuthActionState = {
  error?: string;
  stage?: "credentials" | "email-code";
  challengeToken?: string;
  emailHint?: string;
  expiresInMinutes?: number;
};

const setupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.email("Enter a valid email address.").max(254),
  organization: z.string().trim().min(2, "Enter an organization name.").max(100),
  password: z
    .string()
    .min(15, "Use at least 15 characters for the owner password.")
    .max(200),
});

export async function setupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    if (await hasCompletedSetup()) {
      return { error: "Keyforge has already been initialized." };
    }
    const input = setupSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      organization: formData.get("organization"),
      password: formData.get("password"),
    });
    const passwordHash = await hashPassword(input.password);
    const email = input.email.toLowerCase();
    const organizationSlug = slugify(input.organization) || "workspace";
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.adminUser.create({
        data: { name: input.name, email, passwordHash },
      });
      const organization = await tx.organization.create({
        data: { name: input.organization, slug: organizationSlug },
      });
      await tx.membership.create({
        data: {
          userId: createdUser.id,
          organizationId: organization.id,
          role: "OWNER",
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: createdUser.id,
          action: "organization.initialized",
          targetType: "organization",
          targetId: organization.id,
        },
      });
      return createdUser;
    });
    await createAdminSession(user.id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message || "Check the form and try again." };
    }
    return { error: asApiError(error).message };
  }
  redirect("/dashboard");
}

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  totp: z.string().trim().max(12).optional(),
  method: z.enum(["totp", "email"]).default("totp"),
});

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let signedIn = false;
  try {
    const input = loginSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
      totp: formData.get("totp") || undefined,
      method: formData.get("method") || "totp",
    });
    const user = await authenticateAdminPassword(input);
    if (!user.totpEnabled && !user.emailOtpEnabled) {
      await completeAdminAuthentication(user);
      await createAdminSession(user.id);
      signedIn = true;
    } else if (input.method === "email") {
      if (!user.emailOtpEnabled) {
        return { error: "Email verification is not enabled for this account." };
      }
      if (!isEmailDeliveryConfigured()) {
        return { error: "Email delivery is not configured on this server." };
      }
      const challenge = await createAdminEmailOtpChallenge({
        user,
        purpose: AdminEmailOtpPurpose.LOGIN,
      });
      return { stage: "email-code", ...challenge };
    } else {
      if (!user.totpEnabled) {
        return { error: "Authenticator verification is not enabled. Choose email verification." };
      }
      await verifyAdminTotp(user, input.totp);
      await completeAdminAuthentication(user);
      await createAdminSession(user.id);
      signedIn = true;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: "Enter a valid email address and password." };
    }
    return { error: asApiError(error).message };
  }
  if (signedIn) redirect("/dashboard");
  return { error: "Sign-in could not be completed." };
}

const emailOtpLoginSchema = z.object({
  challengeToken: z.string().min(30).max(200),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function verifyEmailOtpLoginAction(
  previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  let signedIn = false;
  try {
    const input = emailOtpLoginSchema.parse({
      challengeToken: formData.get("challengeToken"),
      code: formData.get("code"),
    });
    const user = await verifyAdminEmailOtpChallenge({
      challengeToken: input.challengeToken,
      code: input.code,
      purpose: AdminEmailOtpPurpose.LOGIN,
    });
    await completeAdminAuthentication(user);
    await createAdminSession(user.id);
    signedIn = true;
  } catch (error) {
    return {
      stage: "email-code",
      challengeToken: previousState.challengeToken,
      emailHint: previousState.emailHint,
      expiresInMinutes: previousState.expiresInMinutes,
      error: error instanceof z.ZodError
        ? "Enter the six-digit code from the email."
        : asApiError(error).message,
    };
  }
  if (signedIn) redirect("/dashboard");
  return { error: "Sign-in could not be completed." };
}

export async function logoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect("/login");
}
