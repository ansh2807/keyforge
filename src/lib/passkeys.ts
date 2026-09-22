import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { getWebAuthnConfig } from "@/lib/env";
import { requireProductUser } from "@/lib/client-features";

const challengeLifetimeMs = 5 * 60 * 1000;

export async function registrationOptions(appId: string, sessionToken: string) {
  const { session, user } = await requireProductUser(appId, sessionToken);
  const passkeys = await db.endUserPasskey.findMany({ where: { userId: user.id } });
  const config = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: user.username,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.username,
    attestationType: "none",
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
  await db.$transaction([
    db.productAuthChallenge.updateMany({
      where: { userId: user.id, kind: "PASSKEY_REGISTRATION", usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.productAuthChallenge.create({
      data: {
        userId: user.id,
        kind: "PASSKEY_REGISTRATION",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + challengeLifetimeMs),
      },
    }),
  ]);
  return { session, options };
}

export async function verifyPasskeyRegistration(input: {
  appId: string;
  sessionToken: string;
  name: string;
  response: RegistrationResponseJSON;
}) {
  const { session, user } = await requireProductUser(input.appId, input.sessionToken);
  const challenge = await db.productAuthChallenge.findFirst({
    where: {
      userId: user.id,
      kind: "PASSKEY_REGISTRATION",
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new ApiError("challenge_expired", "The passkey challenge has expired.", 400);
  const config = getWebAuthnConfig();
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new ApiError("passkey_verification_failed", "The passkey response could not be verified.", 401);
  }
  const info = verification.registrationInfo;
  const passkey = await db.$transaction(async (tx) => {
    await tx.productAuthChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    return tx.endUserPasskey.create({
      data: {
        userId: user.id,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name: input.name.trim().slice(0, 80),
      },
    });
  });
  return { session, passkey };
}

export async function authenticationOptions(appId: string, username: string) {
  const application = await db.application.findUnique({ where: { publicId: appId } });
  if (!application) throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  const user = await db.endUser.findFirst({
    where: {
      applicationId: application.id,
      OR: [{ username: username.trim() }, { email: username.trim().toLowerCase() }],
      status: "ACTIVE",
    },
    include: { passkeys: true },
  });
  if (!user || !user.passkeys.length) {
    throw new ApiError("passkey_unavailable", "No passkey is available for this account.", 404);
  }
  const config = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: user.passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: "required",
  });
  await db.$transaction([
    db.productAuthChallenge.updateMany({
      where: { userId: user.id, kind: "PASSKEY_AUTHENTICATION", usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.productAuthChallenge.create({
      data: {
        userId: user.id,
        kind: "PASSKEY_AUTHENTICATION",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + challengeLifetimeMs),
      },
    }),
  ]);
  return options;
}

export async function verifyPasskeyAuthentication(input: {
  appId: string;
  username: string;
  response: AuthenticationResponseJSON;
}) {
  const application = await db.application.findUnique({ where: { publicId: input.appId } });
  if (!application) throw new ApiError("application_not_found", "The application ID is invalid.", 404);
  const user = await db.endUser.findFirst({
    where: {
      applicationId: application.id,
      OR: [{ username: input.username.trim() }, { email: input.username.trim().toLowerCase() }],
    },
  });
  if (!user) throw new ApiError("invalid_credentials", "The passkey login is invalid.", 401);
  const [challenge, passkey] = await Promise.all([
    db.productAuthChallenge.findFirst({
      where: {
        userId: user.id,
        kind: "PASSKEY_AUTHENTICATION",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.endUserPasskey.findUnique({ where: { credentialId: input.response.id } }),
  ]);
  if (!challenge || !passkey || passkey.userId !== user.id) {
    throw new ApiError("invalid_passkey", "The passkey login is invalid or expired.", 401);
  }
  const config = getWebAuthnConfig();
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpId,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new ApiError("invalid_passkey", "The passkey login failed.", 401);
  await db.$transaction([
    db.productAuthChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } }),
    db.endUserPasskey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    }),
  ]);
  return user;
}
