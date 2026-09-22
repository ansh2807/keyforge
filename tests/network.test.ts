import { describe, expect, it } from "vitest";
import { isUnsafeNetworkAddress } from "@/lib/network";

describe("webhook network boundaries", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "192.168.10.8",
    "::1",
    "::ffff:7f00:1",
    "fc00::1",
    "fe80::1",
  ])("blocks non-public address %s", (address) => {
    expect(isUnsafeNetworkAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isUnsafeNetworkAddress(address)).toBe(false);
    },
  );
});
