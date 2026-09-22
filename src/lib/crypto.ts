import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";

const BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomReadable(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += BASE32_ALPHABET[bytes[index] % BASE32_ALPHABET.length];
  }
  return result;
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function keyedHash(value: string, key: Buffer): string {
  return createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptSecret(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(value: string, key: Buffer): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Encrypted secret has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function generateSigningKeys(): {
  keyId: string;
  publicKey: string;
  privateKey: string;
} {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId: `sig_${randomToken(9)}`,
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signPayload(payload: unknown, privateKeyPem: string): string {
  return sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKeyPem).toString("base64url");
}

export function verifyPayload(payload: unknown, signature: string, publicKeyPem: string): boolean {
  return verify(
    null,
    Buffer.from(canonicalJson(payload), "utf8"),
    publicKeyPem,
    Buffer.from(signature, "base64url"),
  );
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateLicenseKey(): string {
  const body = randomReadable(25);
  const groups = body.match(/.{1,5}/g) ?? [body];
  return `KF-${groups.join("-")}`;
}

export function generatePublicId(): string {
  return `app_${randomToken(18)}`;
}

export function generateApiKey(): string {
  return `kf_live_${randomToken(30)}`;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomToken(30)}`;
}
