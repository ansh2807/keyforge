import { z } from "zod";

const appId = z.string().min(12).max(100);
const nonce = z.string().min(12).max(200);
const installationId = z.string().min(12).max(500);

export const activationSchema = z.object({
  appId,
  licenseKey: z.string().min(12).max(200),
  installationId,
  installationLabel: z.string().trim().min(1).max(120).optional(),
  installationPublicKey: z.string().max(2000).optional(),
  clientVersion: z.string().trim().min(1).max(40).optional(),
  nonce,
});

export const registerSchema = z.object({
  appId,
  licenseKey: z.string().min(12).max(200),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/),
  email: z.email().max(254).optional(),
  password: z.string().min(12).max(200),
  installationId,
  installationLabel: z.string().trim().min(1).max(120).optional(),
  installationPublicKey: z.string().max(2000).optional(),
  clientVersion: z.string().trim().min(1).max(40).optional(),
  nonce,
});

export const clientLoginSchema = z.object({
  appId,
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
  totp: z.string().trim().regex(/^\d{6}$/).optional(),
  installationId,
  installationLabel: z.string().trim().min(1).max(120).optional(),
  installationPublicKey: z.string().max(2000).optional(),
  clientVersion: z.string().trim().min(1).max(40).optional(),
  nonce,
});

export const sessionSchema = z.object({
  appId,
  sessionToken: z.string().min(30).max(200),
  nonce,
});

export const deactivateSchema = z.object({
  appId,
  sessionToken: z.string().min(30).max(200),
});

export const sessionActionSchema = sessionSchema.extend({
  action: z.string().trim().min(1).max(80).optional(),
  input: z.unknown().optional(),
});

export const userVariableSchema = sessionSchema.extend({
  key: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  value: z.string().max(10000).optional(),
});

export const chatSchema = sessionSchema.extend({
  channel: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  message: z.string().trim().min(1).max(1000).optional(),
  after: z.iso.datetime().optional(),
});

export const totpConfirmSchema = sessionSchema.extend({
  token: z.string().trim().regex(/^\d{6}$/),
});
