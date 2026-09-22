import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import { resolveClientSession } from "@/lib/licenses";

export async function clientConfiguration(appId: string, sessionToken: string) {
  const session = await resolveClientSession(appId, sessionToken);
  const [variables, builds] = await Promise.all([
    db.applicationVariable.findMany({
      where: {
        applicationId: session.applicationId,
        active: true,
        visibility: { in: ["PUBLIC", "AUTHENTICATED"] },
      },
      select: { key: true, value: true, visibility: true, updatedAt: true },
      orderBy: { key: "asc" },
    }),
    db.buildArtifact.findMany({
      where: { applicationId: session.applicationId, active: true },
      select: { version: true, platform: true, sha256: true, downloadUrl: true, updatedAt: true },
      orderBy: [{ platform: "asc" }, { updatedAt: "desc" }],
    }),
  ]);
  return { session, variables, builds };
}

export async function availableFiles(appId: string, sessionToken: string) {
  const session = await resolveClientSession(appId, sessionToken);
  const entitledPlanIds = entitledPlans(session);
  const files = await db.managedFile.findMany({
    where: {
      applicationId: session.applicationId,
      active: true,
      OR: [{ planId: null }, { planId: { in: entitledPlanIds } }],
    },
    select: {
      id: true,
      name: true,
      originalName: true,
      contentType: true,
      size: true,
      sha256: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
  });
  return { session, files };
}

export async function authorizedFile(appId: string, sessionToken: string, fileId: string) {
  const session = await resolveClientSession(appId, sessionToken);
  const entitledPlanIds = entitledPlans(session);
  const file = await db.managedFile.findFirst({
    where: {
      id: fileId,
      applicationId: session.applicationId,
      active: true,
      OR: [{ planId: null }, { planId: { in: entitledPlanIds } }],
    },
  });
  if (!file) throw new ApiError("file_not_found", "The requested file is unavailable.", 404);
  return { session, file };
}

export async function executeRemoteFunction(
  appId: string,
  sessionToken: string,
  name: string,
  input: unknown,
) {
  const session = await resolveClientSession(appId, sessionToken);
  const remoteFunction = await db.remoteFunction.findFirst({
    where: { applicationId: session.applicationId, name, active: true },
  });
  if (!remoteFunction) {
    throw new ApiError("function_not_found", "The remote function does not exist.", 404);
  }
  if (remoteFunction.requiredPlanId && !entitledPlans(session).includes(remoteFunction.requiredPlanId)) {
    throw new ApiError("function_not_entitled", "The current plan cannot call this function.", 403);
  }
  return {
    session,
    name: remoteFunction.name,
    response: remoteFunction.response,
    request: input ?? null,
    rateLimitPerMinute: remoteFunction.rateLimitPerMinute,
  };
}

function entitledPlans(session: Awaited<ReturnType<typeof resolveClientSession>>): string[] {
  const now = new Date();
  return Array.from(new Set([
    session.license.planId,
    ...(session.user?.subscriptions
      .filter((subscription) => subscription.status === "ACTIVE" && (!subscription.expiresAt || subscription.expiresAt > now))
      .map((subscription) => subscription.planId) ?? []),
  ]));
}

export async function requireProductUser(appId: string, sessionToken: string) {
  const session = await resolveClientSession(appId, sessionToken);
  if (!session.user) {
    throw new ApiError("user_required", "This operation requires a signed-in product user.", 403);
  }
  return { session, user: session.user };
}
