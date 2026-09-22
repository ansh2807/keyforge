export function licenseMutationAction(status?: string): string {
  return status ? `license.${status.toLowerCase()}` : "license.updated";
}

export function sellerAuditMetadata(
  apiKey: { id: string; name: string },
  details: Record<string, string | number | boolean | null> = {},
) {
  return {
    source: "seller_api",
    apiKeyId: apiKey.id,
    apiKeyName: apiKey.name,
    ...details,
  };
}
