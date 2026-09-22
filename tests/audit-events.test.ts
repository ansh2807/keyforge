import { describe, expect, it } from "vitest";
import { licenseMutationAction, sellerAuditMetadata } from "@/lib/audit-events";

describe("audit event helpers", () => {
  it("names status changes and ordinary updates distinctly", () => {
    expect(licenseMutationAction("REVOKED")).toBe("license.revoked");
    expect(licenseMutationAction("SUSPENDED")).toBe("license.suspended");
    expect(licenseMutationAction()).toBe("license.updated");
  });

  it("records seller identity without copying credential material", () => {
    const richApiKey = {
      id: "key_123",
      name: "Billing automation",
      keyHash: "must-not-leak",
      prefix: "kf_live_secret",
    };
    const metadata = sellerAuditMetadata(
      richApiKey,
      { currentStatus: "REVOKED" },
    );

    expect(metadata).toEqual({
      source: "seller_api",
      apiKeyId: "key_123",
      apiKeyName: "Billing automation",
      currentStatus: "REVOKED",
    });
    expect(JSON.stringify(metadata)).not.toContain("must-not-leak");
    expect(JSON.stringify(metadata)).not.toContain("kf_live_secret");
  });
});
