# @keyforge/client

Node.js and Electron client for Keyforge. It verifies Ed25519 response signatures and one-use nonces before returning data to your product.

```ts
import { KeyforgeClient } from "@keyforge/client";

const keyforge = new KeyforgeClient({
  baseUrl: "https://licenses.example.com",
  appId: process.env.KEYFORGE_APP_ID!,
  publicKeyPem: process.env.KEYFORGE_PUBLIC_KEY!,
  installationId: loadOrCreateRandomInstallationId(),
  installationLabel: "Primary workstation",
  clientVersion: "1.0.0",
});

const session = await keyforge.activate(customerLicenseKey);
console.log(session.license.entitlements);
const runtime = await keyforge.configuration();
const protectedFiles = await keyforge.files();
if (protectedFiles[0]) {
  const verifiedBytes = await keyforge.downloadFile(protectedFiles[0]);
  console.log(verifiedBytes.byteLength);
}

setInterval(() => {
  keyforge.heartbeat().catch(() => stopProtectedFeatures());
}, session.application.heartbeatSeconds * 1000);
```

Generate a random installation ID once and persist it in your application's protected data directory. Do not use invasive hardware fingerprinting as an identity primitive.
