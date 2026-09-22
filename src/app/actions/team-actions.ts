"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createAdminSession, getRequestMetadata, requireAdmin, requireRole } from "@/lib/auth";
import { asApiError, ApiError } from "@/lib/api-error";
import { getBaseUrl, getMasterKey } from "@/lib/env";
import { hashToken, keyedHash, randomToken } from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { SecretActionState } from "@/app/actions/dashboard-actions";

export async function createTeamInviteAction(
  _state: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const auth = await requireAdmin();
    requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
    const input = z.object({
      email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
      role: z.enum(["ADMIN", "ANALYST"]),
    }).parse(Object.fromEntries(formData));
    const existingMember = await db.membership.findFirst({
      where: { organizationId: auth.organization.id, user: { email: input.email } },
    });
    if (existingMember) throw new ApiError("already_member", "That email is already a team member.", 409);
    const rawToken = randomToken(32);
    await db.teamInvite.updateMany({
      where: { organizationId: auth.organization.id, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await db.teamInvite.create({
      data: {
        organizationId: auth.organization.id,
        invitedByUserId: auth.user.id,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    revalidatePath("/dashboard/team");
    return {
      secret: `${getBaseUrl()}/invite/${rawToken}`,
      success: "Invite created. Share this one-time link securely; it expires in seven days.",
    };
  } catch (error) {
    return { error: asApiError(error).message };
  }
}

export type InviteActionState = { error?: string };

export async function acceptTeamInviteAction(
  _state: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  let userId: string;
  try {
    const token = z.string().min(30).max(200).parse(formData.get("token"));
    const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
    const password = z.string().min(12).max(200).parse(formData.get("password"));
    const metadata = await getRequestMetadata();
    await enforceRateLimit(`team-invite:${keyedHash(metadata.ipAddress, getMasterKey())}`, {
      limit: 10,
      windowSeconds: 15 * 60,
    });
    const invite = await db.teamInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) {
      throw new ApiError("invalid_invite", "This team invitation is invalid or expired.", 400);
    }
    const existing = await db.adminUser.findUnique({ where: { email: invite.email } });
    if (existing && !(await verifyPassword(existing.passwordHash, password))) {
      throw new ApiError("invalid_credentials", "The password for this administrator account is incorrect.", 401);
    }
    const passwordHash = existing ? existing.passwordHash : await hashPassword(password);
    userId = await db.$transaction(async (tx) => {
      const user = existing || await tx.adminUser.create({
        data: { email: invite.email, name, passwordHash },
      });
      await tx.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: invite.organizationId } },
        create: { userId: user.id, organizationId: invite.organizationId, role: invite.role },
        update: { role: invite.role },
      });
      await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return user.id;
    });
  } catch (error) {
    return { error: asApiError(error).message };
  }
  await createAdminSession(userId);
  redirect("/dashboard");
}

export async function revokeTeamInviteAction(formData: FormData): Promise<void> {
  const auth = await requireAdmin();
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const inviteId = z.string().min(1).parse(formData.get("inviteId"));
  await db.teamInvite.updateMany({
    where: { id: inviteId, organizationId: auth.organization.id, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/dashboard/team");
}

export async function removeTeamMemberAction(formData: FormData): Promise<void> {
  const auth = await requireAdmin();
  requireRole(auth.membership.role, ["OWNER"]);
  const membershipId = z.string().min(1).parse(formData.get("membershipId"));
  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: auth.organization.id },
  });
  if (!membership) throw new ApiError("membership_not_found", "The team member does not exist.", 404);
  if (membership.userId === auth.user.id) throw new ApiError("cannot_remove_self", "Transfer ownership before removing yourself.", 400);
  if (membership.role === "OWNER") throw new ApiError("cannot_remove_owner", "The organization owner cannot be removed.", 400);
  await db.membership.delete({ where: { id: membership.id } });
  await db.adminSession.deleteMany({ where: { userId: membership.userId } });
  revalidatePath("/dashboard/team");
}

export async function createResellerAction(
  _state: SecretActionState,
  formData: FormData,
): Promise<SecretActionState> {
  try {
    const auth = await requireAdmin();
    requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
    const input = z.object({
      applicationId: z.string().min(1),
      name: z.string().trim().min(2).max(80),
      credits: z.coerce.number().int().min(0).max(1_000_000),
      expiresAt: z.string().optional(),
    }).parse(Object.fromEntries(formData));
    const application = await db.application.findFirst({ where: { id: input.applicationId, organizationId: auth.organization.id } });
    if (!application) throw new ApiError("application_not_found", "The selected application does not exist.", 404);
    const secret = `kf_res_${randomToken(32)}`;
    await db.reseller.create({
      data: {
        organizationId: auth.organization.id,
        applicationId: application.id,
        name: input.name,
        prefix: secret.slice(0, 16),
        keyHash: keyedHash(secret, getMasterKey()),
        credits: input.credits,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        scopes: ["licenses:read", "licenses:write", "users:read"],
      },
    });
    revalidatePath("/dashboard/team");
    return { secret, success: "Reseller credential created. Copy it now; it will not be shown again." };
  } catch (error) {
    return { error: asApiError(error).message };
  }
}

export async function revokeResellerAction(formData: FormData): Promise<void> {
  const auth = await requireAdmin();
  requireRole(auth.membership.role, ["OWNER", "ADMIN"]);
  const resellerId = z.string().min(1).parse(formData.get("resellerId"));
  await db.reseller.updateMany({ where: { id: resellerId, organizationId: auth.organization.id }, data: { active: false } });
  revalidatePath("/dashboard/team");
}
