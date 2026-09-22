import "server-only";
import type { Application, License, Plan, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import {
  generateLicenseKey,
  hashToken,
  keyedHash,
  normalizeLicenseKey,
  randomToken,
  decryptSecret,
} from "@/lib/crypto";
import { getMasterKey } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { enforceApplicationAccess } from "@/lib/access-control";
import { verifyTotp } from "@/lib/totp";

type ActivationInput = {
  installationId: string;
  installationLabel?: string;
  installationPublicKey?: string;
  clientVersion?: string;
  nonce: string;
  ipAddress?: string;
};

type LicenseWithPlan = License & { plan: Plan };

function ensureApplicationActive(application: Application): void {
  if (application.status !== "ACTIVE") {
    throw new ApiError("application_unavailable", "This application is not accepting logins.", 403);
  }
}

function ensureLicenseUsable(license: LicenseWithPlan): void {
  if (license.status === "REVOKED") {
    throw new ApiError("license_revoked", "This license has been revoked.", 403);
  }
  if (license.status === "SUSPENDED") {
    throw new ApiError("license_suspended", "This license is suspended.", 403);
  }
  if (license.status === "EXPIRED" || (license.expiresAt && license.expiresAt <= new Date())) {
    throw new ApiError("license_expired", "This license has expired.", 403);
  }
}

async function activateCore(
  tx: Prisma.TransactionClient,
  application: Application,
  license: LicenseWithPlan,
  input: ActivationInput,
  userId?: string,
) {
  ensureApplicationActive(application);
  await tx.$queryRaw`SELECT "id" FROM "License" WHERE "id" = ${license.id} FOR UPDATE`;
  const lockedLicense = await tx.license.findUnique({
    where: { id: license.id },
    include: { plan: true },
  });
  if (!lockedLicense) {
    throw new ApiError("invalid_license", "The license key is invalid.", 401);
  }
  ensureLicenseUsable(lockedLicense);
  const now = new Date();
  const durationDays = lockedLicense.durationDays ?? lockedLicense.plan.durationDays;
  const expiresAt =
    lockedLicense.expiresAt ??
    (durationDays ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000) : null);
  const installationIdHash = keyedHash(
    `${application.publicId}:${input.installationId}`,
    getMasterKey(),
  );
  let activation = await tx.activation.findUnique({
    where: { licenseId_installationIdHash: { licenseId: lockedLicense.id, installationIdHash } },
  });
  if (activation?.revokedAt) {
    throw new ApiError("device_revoked", "This installation has been revoked.", 403);
  }
  if (!activation) {
    const activeDevices = await tx.activation.count({
      where: { licenseId: lockedLicense.id, revokedAt: null },
    });
    if (activeDevices >= lockedLicense.maxDevices) {
      throw new ApiError(
        "device_limit_reached",
        `This license allows ${lockedLicense.maxDevices} active device(s).`,
        403,
      );
    }
    activation = await tx.activation.create({
      data: {
        licenseId: lockedLicense.id,
        installationIdHash,
        installationLabel: input.installationLabel?.slice(0, 120),
        installationPublicKey: input.installationPublicKey?.slice(0, 2000),
        firstIp: input.ipAddress,
        lastIp: input.ipAddress,
      },
    });
  } else {
    activation = await tx.activation.update({
      where: { id: activation.id },
      data: {
        lastSeenAt: now,
        lastIp: input.ipAddress,
        installationLabel: input.installationLabel?.slice(0, 120) ?? activation.installationLabel,
        installationPublicKey:
          input.installationPublicKey?.slice(0, 2000) ?? activation.installationPublicKey,
      },
    });
  }
  await tx.license.update({
    where: { id: lockedLicense.id },
    data: {
      status: "ACTIVE",
      activatedAt: lockedLicense.activatedAt ?? now,
      expiresAt,
    },
  });
  const rawSessionToken = randomToken(32);
  const sessionExpiresAt = new Date(now.getTime() + application.sessionMinutes * 60 * 1000);
  const session = await tx.clientSession.create({
    data: {
      applicationId: application.id,
      licenseId: lockedLicense.id,
      activationId: activation.id,
      userId,
      tokenHash: hashToken(rawSessionToken),
      expiresAt: sessionExpiresAt,
    },
  });
  return {
    rawSessionToken,
    session,
    activation,
    expiresAt,
    activatedAt: lockedLicense.activatedAt ?? now,
  };
}

function sessionPayload(input: {
  application: Application;
  license: LicenseWithPlan;
  rawSessionToken: string;
  sessionId: string;
  sessionExpiresAt: Date;
  activationId: string;
  licenseExpiresAt: Date | null;
  nonce: string;
  username?: string;
  subscriptions?: Array<{ plan: { name: string }; status: string; expiresAt: Date | null }>;
}) {
  return {
    sessionToken: input.rawSessionToken,
    sessionId: input.sessionId,
    sessionExpiresAt: input.sessionExpiresAt.toISOString(),
    serverTime: new Date().toISOString(),
    nonce: input.nonce,
    application: {
      id: input.application.publicId,
      name: input.application.name,
      version: input.application.version,
      downloadUrl: input.application.downloadUrl,
      heartbeatSeconds: input.application.heartbeatSeconds,
    },
    license: {
      id: input.license.id,
      status: "ACTIVE",
      expiresAt: input.licenseExpiresAt?.toISOString() ?? null,
      maxDevices: input.license.maxDevices,
      plan: input.license.plan.name,
      entitlements: input.license.plan.entitlements,
    },
    activation: { id: input.activationId },
    user: input.username ? {
      username: input.username,
      subscriptions: input.subscriptions?.map((subscription) => ({
        plan: subscription.plan.name,
        status: subscription.status,
        expiresAt: subscription.expiresAt?.toISOString() ?? null,
      })) ?? [],
    } : null,
  };
}

export async function activateLicense(
  appId: string,
  licenseKey: string,
  input: ActivationInput,
) {
  const application = await db.application.findUnique({ where: { publicId: appId } });
  if (!application) {
    throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  }
  ensureApplicationActive(application);
  await enforceApplicationAccess(application.id, {
    ip: input.ipAddress,
    installationId: input.installationId,
    licenseKey,
  });
  const keyHash = keyedHash(normalizeLicenseKey(licenseKey), getMasterKey());
  const license = await db.license.findFirst({
    where: { applicationId: application.id, keyHash },
    include: { plan: true },
  });
  if (!license) {
    throw new ApiError("invalid_license", "The license key is invalid.", 401);
  }
  const result = await db.$transaction((tx) => activateCore(tx, application, license, input));
  return {
    application,
    license,
    payload: sessionPayload({
      application,
      license,
      rawSessionToken: result.rawSessionToken,
      sessionId: result.session.id,
      sessionExpiresAt: result.session.expiresAt,
      activationId: result.activation.id,
      licenseExpiresAt: result.expiresAt,
      nonce: input.nonce,
    }),
  };
}

export async function registerEndUser(input: {
  appId: string;
  licenseKey: string;
  username: string;
  email?: string;
  password: string;
  activation: ActivationInput;
}) {
  const application = await db.application.findUnique({ where: { publicId: input.appId } });
  if (!application) {
    throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  }
  if (!application.allowUserRegistration) {
    throw new ApiError("registration_disabled", "Registration is disabled for this application.", 403);
  }
  await enforceApplicationAccess(application.id, {
    ip: input.activation.ipAddress,
    installationId: input.activation.installationId,
    username: input.username,
    licenseKey: input.licenseKey,
  });
  const license = await db.license.findFirst({
    where: {
      applicationId: application.id,
      keyHash: keyedHash(normalizeLicenseKey(input.licenseKey), getMasterKey()),
    },
    include: { plan: true, user: true },
  });
  if (!license) {
    throw new ApiError("invalid_license", "The license key is invalid.", 401);
  }
  if (license.user) {
    throw new ApiError("license_already_registered", "This license already belongs to a user.", 409);
  }
  ensureLicenseUsable(license);
  const passwordHash = await hashPassword(input.password);
  const username = input.username.trim();
  const email = input.email?.trim().toLowerCase() || null;
  try {
    const result = await db.$transaction(async (tx) => {
      const user = await tx.endUser.create({
        data: {
          applicationId: application.id,
          planId: license.planId,
          licenseId: license.id,
          username,
          email,
          passwordHash,
        },
      });
      await tx.userSubscription.create({
        data: {
          userId: user.id,
          planId: license.planId,
          licenseId: license.id,
          expiresAt: license.expiresAt,
        },
      });
      const activation = await activateCore(tx, application, license, input.activation, user.id);
      return { user, activation };
    });
    return {
      application,
      license,
      user: result.user,
      payload: sessionPayload({
        application,
        license,
        rawSessionToken: result.activation.rawSessionToken,
        sessionId: result.activation.session.id,
        sessionExpiresAt: result.activation.session.expiresAt,
        activationId: result.activation.activation.id,
        licenseExpiresAt: result.activation.expiresAt,
        nonce: input.activation.nonce,
        username: result.user.username,
        subscriptions: [{ plan: license.plan, status: "ACTIVE", expiresAt: result.activation.expiresAt }],
      }),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new ApiError("user_exists", "That username or email is already registered.", 409);
    }
    throw error;
  }
}

export async function loginEndUser(input: {
  appId: string;
  username: string;
  password: string;
  totp?: string;
  activation: ActivationInput;
}) {
  const application = await db.application.findUnique({ where: { publicId: input.appId } });
  if (!application) {
    throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  }
  const username = input.username.trim();
  const user = await db.endUser.findFirst({
    where: {
      applicationId: application.id,
      OR: [{ username }, { email: username.toLowerCase() }],
    },
    include: { license: { include: { plan: true } }, subscriptions: { include: { plan: true } } },
  });
  const passwordValid = user ? await verifyPassword(user.passwordHash, input.password) : false;
  if (!user || !passwordValid) {
    throw new ApiError("invalid_credentials", "The username or password is incorrect.", 401);
  }
  if (user.status !== "ACTIVE") {
    throw new ApiError("user_unavailable", "This user account is not active.", 403);
  }
  await enforceApplicationAccess(application.id, {
    ip: input.activation.ipAddress,
    installationId: input.activation.installationId,
    username: user.username,
  });
  if (user.totpEnabled) {
    if (!input.totp || !user.totpSecret) {
      throw new ApiError("mfa_required", "A six-digit authenticator code is required.", 401);
    }
    const secret = decryptSecret(user.totpSecret, getMasterKey());
    if (!verifyTotp(secret, input.totp)) {
      throw new ApiError("invalid_mfa", "The authenticator code is invalid.", 401);
    }
  }
  if (!user.license) {
    throw new ApiError("license_missing", "This user does not have an assigned license.", 403);
  }
  const license = user.license;
  const result = await db.$transaction(async (tx) => {
    const activation = await activateCore(tx, application, license, input.activation, user.id);
    await tx.endUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return activation;
  });
  return {
    application,
    license,
    user,
    payload: sessionPayload({
      application,
      license,
      rawSessionToken: result.rawSessionToken,
      sessionId: result.session.id,
      sessionExpiresAt: result.session.expiresAt,
      activationId: result.activation.id,
      licenseExpiresAt: result.expiresAt,
      nonce: input.activation.nonce,
      username: user.username,
      subscriptions: user.subscriptions,
    }),
  };
}

export async function loginEndUserWithPasskey(input: {
  appId: string;
  userId: string;
  activation: ActivationInput;
}) {
  const application = await db.application.findUnique({ where: { publicId: input.appId } });
  if (!application) {
    throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  }
  const user = await db.endUser.findFirst({
    where: { id: input.userId, applicationId: application.id },
    include: { license: { include: { plan: true } }, subscriptions: { include: { plan: true } } },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new ApiError("user_unavailable", "This user account is not active.", 403);
  }
  if (!user.license) {
    throw new ApiError("license_missing", "This user does not have an assigned license.", 403);
  }
  await enforceApplicationAccess(application.id, {
    ip: input.activation.ipAddress,
    installationId: input.activation.installationId,
    username: user.username,
  });
  const license = user.license;
  const result = await db.$transaction(async (tx) => {
    const activation = await activateCore(tx, application, license, input.activation, user.id);
    await tx.endUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return activation;
  });
  return {
    application,
    license,
    user,
    payload: sessionPayload({
      application,
      license,
      rawSessionToken: result.rawSessionToken,
      sessionId: result.session.id,
      sessionExpiresAt: result.session.expiresAt,
      activationId: result.activation.id,
      licenseExpiresAt: result.expiresAt,
      nonce: input.activation.nonce,
      username: user.username,
      subscriptions: user.subscriptions,
    }),
  };
}

export async function validateClientSession(input: {
  appId: string;
  sessionToken: string;
  nonce: string;
  heartbeat?: boolean;
  ipAddress?: string;
}) {
  const session = await db.clientSession.findUnique({
    where: { tokenHash: hashToken(input.sessionToken) },
    include: {
      application: true,
      license: { include: { plan: true } },
      activation: true,
      user: { include: { subscriptions: { include: { plan: true } } } },
    },
  });
  if (!session || session.application.publicId !== input.appId || session.revokedAt) {
    throw new ApiError("invalid_session", "The client session is invalid.", 401);
  }
  ensureApplicationActive(session.application);
  ensureLicenseUsable(session.license);
  if (session.user && session.user.status !== "ACTIVE") {
    throw new ApiError("user_unavailable", "This user account is not active.", 403);
  }
  if (session.activation.revokedAt) {
    throw new ApiError("device_revoked", "This installation has been revoked.", 403);
  }
  if (session.expiresAt <= new Date()) {
    throw new ApiError("session_expired", "The client session has expired.", 401);
  }
  const nextExpiry = input.heartbeat
    ? new Date(Date.now() + session.application.sessionMinutes * 60 * 1000)
    : session.expiresAt;
  if (input.heartbeat) {
    await db.$transaction([
      db.clientSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: nextExpiry },
      }),
      db.activation.update({
        where: { id: session.activation.id },
        data: { lastSeenAt: new Date(), lastIp: input.ipAddress },
      }),
    ]);
  }
  const payload = {
    valid: true,
    sessionId: session.id,
    sessionExpiresAt: nextExpiry.toISOString(),
    serverTime: new Date().toISOString(),
    nonce: input.nonce,
    application: {
      id: session.application.publicId,
      name: session.application.name,
      version: session.application.version,
      downloadUrl: session.application.downloadUrl,
      heartbeatSeconds: session.application.heartbeatSeconds,
    },
    license: {
      id: session.license.id,
      status: session.license.status,
      expiresAt: session.license.expiresAt?.toISOString() ?? null,
      maxDevices: session.license.maxDevices,
      plan: session.license.plan.name,
      entitlements: session.license.plan.entitlements,
    },
    activation: { id: session.activation.id },
    user: session.user ? {
      username: session.user.username,
      email: session.user.email,
      subscriptions: session.user.subscriptions.map((subscription) => ({
        plan: subscription.plan.name,
        status: subscription.status,
        expiresAt: subscription.expiresAt?.toISOString() ?? null,
      })),
    } : null,
  };
  return { application: session.application, license: session.license, payload };
}

export async function resolveClientSession(appId: string, sessionToken: string) {
  const session = await db.clientSession.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: {
      application: true,
      license: { include: { plan: true } },
      activation: true,
      user: { include: { subscriptions: { include: { plan: true } } } },
    },
  });
  if (!session || session.application.publicId !== appId || session.revokedAt) {
    throw new ApiError("invalid_session", "The client session is invalid.", 401);
  }
  ensureApplicationActive(session.application);
  ensureLicenseUsable(session.license);
  if (session.expiresAt <= new Date()) {
    throw new ApiError("session_expired", "The client session has expired.", 401);
  }
  if (session.activation.revokedAt) {
    throw new ApiError("device_revoked", "This installation has been revoked.", 403);
  }
  if (session.user && session.user.status !== "ACTIVE") {
    throw new ApiError("user_unavailable", "This user account is not active.", 403);
  }
  return session;
}

export async function deactivateClientSession(appId: string, sessionToken: string): Promise<void> {
  const session = await db.clientSession.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: { application: true },
  });
  if (!session || session.application.publicId !== appId) {
    return;
  }
  await db.clientSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
}

export async function issueLicenses(input: {
  applicationId: string;
  planId: string;
  count: number;
  durationDays?: number | null;
  maxDevices: number;
  customerEmail?: string | null;
  note?: string | null;
  transaction?: Prisma.TransactionClient;
}): Promise<string[]> {
  const store = input.transaction || db;
  const plan = await store.plan.findFirst({
    where: { id: input.planId, applicationId: input.applicationId },
  });
  if (!plan) {
    throw new ApiError("plan_not_found", "The selected plan does not exist.", 404);
  }
  const keys = Array.from({ length: input.count }, () => generateLicenseKey());
  await store.license.createMany({
    data: keys.map((key) => ({
      applicationId: input.applicationId,
      planId: input.planId,
      keyHash: keyedHash(normalizeLicenseKey(key), getMasterKey()),
      keyPrefix: key.slice(0, 8),
      keyLastFour: key.slice(-4),
      durationDays: input.durationDays ?? plan.durationDays,
      maxDevices: input.maxDevices,
      customerEmail: input.customerEmail?.trim().toLowerCase() || null,
      note: input.note?.trim() || null,
    })),
  });
  return keys;
}
