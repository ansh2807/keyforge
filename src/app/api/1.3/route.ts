import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, asApiError } from "@/lib/api-error";
import { activateLicense, loginEndUser, registerEndUser } from "@/lib/licenses";
import { clientIp } from "@/lib/http";
import { getMasterKey } from "@/lib/env";
import { hashToken, keyedHash, randomToken } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";

type Parameters = Record<string, string>;

function response(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

async function parameters(request: NextRequest): Promise<Parameters> {
  const values: Parameters = Object.fromEntries(request.nextUrl.searchParams.entries());
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json() as Record<string, unknown>;
      for (const [key, value] of Object.entries(json)) values[key] = String(value ?? "");
    } else {
      const form = await request.formData();
      for (const [key, value] of form.entries()) values[key] = String(value);
    }
  }
  return values;
}

async function applicationSession(sessionId: string) {
  const session = await db.compatibilitySession.findUnique({
    where: { tokenHash: hashToken(sessionId) },
    include: {
      application: true,
      clientSession: { include: { user: true, license: { include: { plan: true } } } },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.application.compatEnabled) {
    throw new ApiError("invalid_session", "Invalid session. Reinitialize the application.", 401);
  }
  return session;
}

function userInfo(result: {
  user: { username: string; createdAt: Date };
  license: { expiresAt: Date | null; plan: { name: string } };
  payload: { license: { expiresAt: string | null } };
}, ip: string, hwid: string, key = "") {
  const expiry = result.payload.license.expiresAt ? Math.floor(new Date(result.payload.license.expiresAt).getTime() / 1000) : 0;
  return {
    username: result.user.username,
    subscriptions: [{
      subscription: result.license.plan.name,
      key,
      expiry: String(expiry),
      timeleft: expiry ? Math.max(0, expiry - Math.floor(Date.now() / 1000)) : 0,
    }],
    ip,
    hwid,
    createdate: String(Math.floor(result.user.createdAt.getTime() / 1000)),
    lastlogin: String(Math.floor(Date.now() / 1000)),
  };
}

async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    const input = await parameters(request);
    const ip = clientIp(request);
    const type = (input.type || "").toLowerCase();
    await enforceRateLimit(`compat:${keyedHash(`${ip}:${type}`, getMasterKey())}`, {
      limit: type === "init" || type === "login" || type === "license" ? 30 : 120,
      windowSeconds: 60,
    });

    if (type === "init") {
      const application = await db.application.findFirst({
        where: { compatName: input.name, compatOwnerId: input.ownerid, compatEnabled: true },
      });
      if (!application || !application.compatSecretHash || keyedHash(input.secret || "", getMasterKey()) !== application.compatSecretHash) {
        throw new ApiError("invalid_application", "Application credentials are invalid.", 401);
      }
      if (input.ver && input.ver !== application.version) {
        return response({
          success: false,
          message: "Application update required.",
          download: application.downloadUrl || "",
        });
      }
      const sessionId = randomToken(32);
      await db.compatibilitySession.create({
        data: {
          applicationId: application.id,
          tokenHash: hashToken(sessionId),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const [numUsers, numOnline, numKeys] = await Promise.all([
        db.endUser.count({ where: { applicationId: application.id } }),
        db.clientSession.count({ where: { applicationId: application.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
        db.license.count({ where: { applicationId: application.id } }),
      ]);
      return response({
        success: true,
        message: "Initialized",
        sessionid: sessionId,
        appinfo: {
          numUsers: String(numUsers),
          numOnline: String(numOnline),
          numKeys: String(numKeys),
          version: application.version,
          customerPanelLink: "",
          downloadLink: application.downloadUrl || "",
        },
        newSession: true,
      });
    }

    const compatibility = await applicationSession(input.sessionid || "");
    const installationId = input.hwid || `compat-${keyedHash(ip, getMasterKey()).slice(0, 32)}`;
    const nonce = randomToken(18);

    if (type === "license") {
      const result = await activateLicense(compatibility.application.publicId, input.key || "", {
        installationId,
        installationLabel: "KeyAuth compatibility client",
        clientVersion: input.ver,
        nonce,
        ipAddress: ip,
      });
      await db.compatibilitySession.update({
        where: { id: compatibility.id },
        data: { clientSessionId: result.payload.sessionId },
      });
      return response({
        success: true,
        message: "Successfully validated license",
        info: {
          username: input.key?.slice(0, 8) || "license-user",
          subscriptions: [{
            subscription: result.license.plan.name,
            key: input.key || "",
            expiry: result.payload.license.expiresAt ? String(Math.floor(new Date(result.payload.license.expiresAt).getTime() / 1000)) : "0",
            timeleft: result.payload.license.expiresAt ? Math.max(0, Math.floor((new Date(result.payload.license.expiresAt).getTime() - Date.now()) / 1000)) : 0,
          }],
          ip,
          hwid: installationId,
          createdate: String(Math.floor(result.license.createdAt.getTime() / 1000)),
          lastlogin: String(Math.floor(Date.now() / 1000)),
        },
      });
    }

    if (type === "register") {
      const result = await registerEndUser({
        appId: compatibility.application.publicId,
        licenseKey: input.key || "",
        username: input.username || "",
        email: input.email || undefined,
        password: input.pass || "",
        activation: {
          installationId,
          installationLabel: "KeyAuth compatibility client",
          clientVersion: input.ver,
          nonce,
          ipAddress: ip,
        },
      });
      await db.compatibilitySession.update({ where: { id: compatibility.id }, data: { clientSessionId: result.payload.sessionId } });
      return response({ success: true, message: "Successfully registered", info: userInfo(result, ip, installationId, input.key) });
    }

    if (type === "login") {
      const result = await loginEndUser({
        appId: compatibility.application.publicId,
        username: input.username || "",
        password: input.pass || "",
        totp: input.code || input.totp || undefined,
        activation: {
          installationId,
          installationLabel: "KeyAuth compatibility client",
          clientVersion: input.ver,
          nonce,
          ipAddress: ip,
        },
      });
      await db.compatibilitySession.update({ where: { id: compatibility.id }, data: { clientSessionId: result.payload.sessionId } });
      return response({ success: true, message: "Successfully logged in", info: userInfo(result, ip, installationId) });
    }

    if (type === "check") {
      const valid = Boolean(
        compatibility.clientSession &&
        !compatibility.clientSession.revokedAt &&
        compatibility.clientSession.expiresAt > new Date(),
      );
      return response({ success: valid, message: valid ? "Session is valid" : "Session is invalid" });
    }

    if (type === "var") {
      const variable = await db.applicationVariable.findFirst({
        where: {
          applicationId: compatibility.applicationId,
          key: input.varid || input.var || "",
          active: true,
          visibility: { in: ["PUBLIC", "AUTHENTICATED"] },
        },
      });
      if (!variable) throw new ApiError("variable_not_found", "Variable not found.", 404);
      return response({ success: true, message: variable.value, response: variable.value });
    }

    if (type === "chatget") {
      const channel = await db.chatChannel.findFirst({
        where: { applicationId: compatibility.applicationId, name: input.channel || "", active: true },
      });
      if (!channel) throw new ApiError("channel_not_found", "Channel not found.", 404);
      const messages = await db.chatMessage.findMany({ where: { channelId: channel.id }, orderBy: { createdAt: "desc" }, take: 100 });
      return response({
        success: true,
        messages: messages.reverse().map((message) => ({
          message: message.body,
          author: message.authorName,
          timestamp: String(Math.floor(message.createdAt.getTime() / 1000)),
        })),
      });
    }

    if (type === "chatsend") {
      const clientSession = compatibility.clientSession;
      if (!clientSession?.user) throw new ApiError("user_required", "Log in before sending chat messages.", 403);
      const channel = await db.chatChannel.findFirst({
        where: { applicationId: compatibility.applicationId, name: input.channel || "", active: true },
      });
      if (!channel) throw new ApiError("channel_not_found", "Channel not found.", 404);
      const message = (input.message || "").trim();
      if (!message || message.length > 1000) throw new ApiError("invalid_message", "Message must be 1 to 1000 characters.", 400);
      await db.chatMessage.create({
        data: {
          channelId: channel.id,
          userId: clientSession.user.id,
          authorType: "USER",
          authorName: clientSession.user.username,
          body: message,
        },
      });
      return response({ success: true, message: "Message sent" });
    }

    if (type === "logout") {
      if (compatibility.clientSessionId) {
        await db.clientSession.updateMany({ where: { id: compatibility.clientSessionId }, data: { revokedAt: new Date() } });
      }
      await db.compatibilitySession.delete({ where: { id: compatibility.id } });
      return response({ success: true, message: "Logged out" });
    }

    throw new ApiError("unsupported_type", "This compatibility request type is not supported.", 400);
  } catch (error) {
    const problem = asApiError(error);
    return response({ success: false, message: problem.message });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
