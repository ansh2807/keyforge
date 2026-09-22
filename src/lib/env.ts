import "server-only";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Copy .env.example to .env and set it.`);
  }
  return value;
}

export function getBaseUrl(): string {
  return (process.env.KEYFORGE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function getSessionDays(): number {
  const parsed = Number(process.env.KEYFORGE_SESSION_DAYS || "7");
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
}

export function getMasterKey(): Buffer {
  const encoded = required("KEYFORGE_MASTER_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("KEYFORGE_MASTER_KEY must be exactly 32 random bytes encoded as base64.");
  }
  return key;
}

export function isDemoMode(): boolean {
  return process.env.KEYFORGE_DEMO_MODE === "true";
}

export function getStorageDirectory(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.KEYFORGE_STORAGE_DIR || path.join(process.cwd(), "data", "files"));
}

export function getMaximumUploadBytes(): number {
  const parsed = Number(process.env.KEYFORGE_MAX_UPLOAD_MB || "50");
  const megabytes = Number.isFinite(parsed) && parsed >= 1 && parsed <= 1024 ? parsed : 50;
  return Math.floor(megabytes * 1024 * 1024);
}

export function getWebAuthnConfig(): { rpId: string; rpName: string; origin: string } {
  const baseUrl = new URL(getBaseUrl());
  return {
    rpId: process.env.KEYFORGE_RP_ID?.trim() || baseUrl.hostname,
    rpName: process.env.KEYFORGE_RP_NAME?.trim() || "Keyforge",
    origin: process.env.KEYFORGE_RP_ORIGIN?.trim().replace(/\/$/, "") || baseUrl.origin,
  };
}

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    process.env.KEYFORGE_SMTP_HOST?.trim() &&
    process.env.KEYFORGE_SMTP_USER?.trim() &&
    process.env.KEYFORGE_SMTP_PASSWORD &&
    process.env.KEYFORGE_SMTP_FROM?.trim(),
  );
}

export function getSmtpConfiguration(): SmtpConfiguration {
  const host = required("KEYFORGE_SMTP_HOST");
  const user = required("KEYFORGE_SMTP_USER");
  const password = required("KEYFORGE_SMTP_PASSWORD");
  const from = required("KEYFORGE_SMTP_FROM");
  const parsedPort = Number(process.env.KEYFORGE_SMTP_PORT || "465");
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error("KEYFORGE_SMTP_PORT must be a valid TCP port.");
  }
  const secureValue = process.env.KEYFORGE_SMTP_SECURE?.trim().toLowerCase();
  return {
    host,
    port: parsedPort,
    secure: secureValue ? secureValue === "true" : parsedPort === 465,
    user,
    password,
    from,
  };
}
