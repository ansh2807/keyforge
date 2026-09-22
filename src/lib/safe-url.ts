import "server-only";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { ApiError } from "@/lib/api-error";
import { isUnsafeNetworkAddress } from "@/lib/network";

export async function assertSafeWebhookUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("invalid_webhook_url", "The webhook URL is invalid.", 400);
  }
  const allowedProtocols = process.env.NODE_ENV === "production" ? ["https:"] : ["https:", "http:"];
  if (!allowedProtocols.includes(url.protocol) || url.username || url.password) {
    throw new ApiError(
      "invalid_webhook_url",
      process.env.NODE_ENV === "production"
        ? "Webhook URLs must use HTTPS and cannot contain credentials."
        : "Webhook URLs must use HTTP or HTTPS and cannot contain credentials.",
      400,
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") {
    throw new ApiError("unsafe_webhook_url", "Webhook URLs cannot target local services.", 400);
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length) {
    throw new ApiError("unresolved_webhook_url", "The webhook host could not be resolved.", 400);
  }
  if (addresses.some(({ address }) => isUnsafeNetworkAddress(address))) {
    throw new ApiError("unsafe_webhook_url", "Webhook URLs cannot target private network addresses.", 400);
  }
  return url;
}
