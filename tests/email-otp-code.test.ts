import { describe, expect, it } from "vitest";
import {
  generateEmailOtpCode,
  hashEmailOtpCode,
  maskEmailAddress,
  verifyEmailOtpCode,
} from "@/lib/email-otp-code";

describe("administrator email OTP primitives", () => {
  it("generates fixed-width numeric codes, including leading zeroes when needed", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateEmailOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  it("binds a code hash to both the challenge token and master key", () => {
    const masterKey = Buffer.alloc(32, 9);
    const hash = hashEmailOtpCode("challenge-a", "123456", masterKey);
    expect(verifyEmailOtpCode("challenge-a", "123456", hash, masterKey)).toBe(true);
    expect(verifyEmailOtpCode("challenge-a", "654321", hash, masterKey)).toBe(false);
    expect(verifyEmailOtpCode("challenge-b", "123456", hash, masterKey)).toBe(false);
    expect(verifyEmailOtpCode("challenge-a", "123456", hash, Buffer.alloc(32, 8))).toBe(false);
  });

  it("masks administrator email addresses without losing the destination domain", () => {
    expect(maskEmailAddress("anshkirankalra@gmail.com")).toBe("an••••••••@gmail.com");
    expect(maskEmailAddress("a@example.com")).toBe("a•••@example.com");
    expect(maskEmailAddress("invalid-address")).toBe("your administrator email");
  });
});
