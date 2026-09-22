import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  decryptSecret,
  encryptSecret,
  generateLicenseKey,
  generateSigningKeys,
  normalizeLicenseKey,
  signPayload,
  verifyPayload,
} from "@/lib/crypto";

describe("cryptographic primitives", () => {
  it("encrypts and decrypts application secrets", () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptSecret("private signing material", key);
    expect(encrypted).not.toContain("private signing material");
    expect(decryptSecret(encrypted, key)).toBe("private signing material");
  });

  it("rejects encrypted data when the key is wrong", () => {
    const encrypted = encryptSecret("private signing material", Buffer.alloc(32, 7));
    expect(() => decryptSecret(encrypted, Buffer.alloc(32, 8))).toThrow();
  });

  it("canonicalizes nested JSON independently of key order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe(
      canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
    );
  });

  it("signs and verifies client payloads", () => {
    const pair = generateSigningKeys();
    const payload = { license: { status: "ACTIVE" }, nonce: "request-123456" };
    const signature = signPayload(payload, pair.privateKey);
    expect(verifyPayload(payload, signature, pair.publicKey)).toBe(true);
    expect(verifyPayload({ ...payload, nonce: "changed" }, signature, pair.publicKey)).toBe(false);
  });

  it("generates readable normalized license keys", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^KF-(?:[23456789A-HJ-NP-Z]{5}-){4}[23456789A-HJ-NP-Z]{5}$/);
    expect(normalizeLicenseKey(`  ${key.toLowerCase()}  `)).toBe(key);
  });
});
