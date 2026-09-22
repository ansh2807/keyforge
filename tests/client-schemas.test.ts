import { describe, expect, it } from "vitest";
import { activationSchema, registerSchema, sessionSchema } from "@/lib/client-schemas";

const base = {
  appId: "app_123456789012345678",
  installationId: "installation_123456789",
  nonce: "nonce_123456789",
};

describe("client request schemas", () => {
  it("accepts a complete activation", () => {
    expect(
      activationSchema.parse({ ...base, licenseKey: "KF-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY" }),
    ).toMatchObject(base);
  });

  it("requires strong registration passwords", () => {
    expect(() =>
      registerSchema.parse({
        ...base,
        licenseKey: "KF-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
        username: "avery.stone",
        email: "avery@example.com",
        password: "short",
      }),
    ).toThrow();
  });

  it("requires a nonce for session validation", () => {
    expect(() =>
      sessionSchema.parse({ appId: base.appId, sessionToken: "x".repeat(32) }),
    ).toThrow();
  });
});
