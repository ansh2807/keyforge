import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

const db = new PrismaClient();

function currentMasterKey(): Buffer {
  const encodedCurrent = process.env.KEYFORGE_MASTER_KEY?.trim();
  if (!encodedCurrent) throw new Error("KEYFORGE_MASTER_KEY is required.");
  const key = Buffer.from(encodedCurrent, "base64");
  if (key.length !== 32) throw new Error("KEYFORGE_MASTER_KEY must be exactly 32 random bytes encoded as base64.");
  return key;
}

if (!process.argv.includes("--confirm")) {
  throw new Error("Pass --confirm after stopping every Keyforge application instance and taking a verified backup.");
}

const encoded = process.env.KEYFORGE_NEW_MASTER_KEY?.trim();
if (!encoded) throw new Error("KEYFORGE_NEW_MASTER_KEY is required.");
const nextKey = Buffer.from(encoded, "base64");
if (nextKey.length !== 32) throw new Error("KEYFORGE_NEW_MASTER_KEY must be exactly 32 random bytes encoded as base64.");
const currentKey = currentMasterKey();
if (currentKey.equals(nextKey)) throw new Error("The new master key must differ from the current master key.");

await db.$transaction(async (tx) => {
  const [applications, webhooks, admins, users, channels] = await Promise.all([
    tx.application.findMany({ select: { id: true, signingPrivateKey: true } }),
    tx.webhookEndpoint.findMany({ select: { id: true, secret: true } }),
    tx.adminUser.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } }),
    tx.endUser.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } }),
    tx.notificationChannel.findMany({ where: { secret: { not: null } }, select: { id: true, secret: true } }),
  ]);
  for (const item of applications) await tx.application.update({ where: { id: item.id }, data: { signingPrivateKey: encryptSecret(decryptSecret(item.signingPrivateKey, currentKey), nextKey) } });
  for (const item of webhooks) await tx.webhookEndpoint.update({ where: { id: item.id }, data: { secret: encryptSecret(decryptSecret(item.secret, currentKey), nextKey) } });
  for (const item of admins) await tx.adminUser.update({ where: { id: item.id }, data: { totpSecret: encryptSecret(decryptSecret(item.totpSecret!, currentKey), nextKey) } });
  for (const item of users) await tx.endUser.update({ where: { id: item.id }, data: { totpSecret: encryptSecret(decryptSecret(item.totpSecret!, currentKey), nextKey) } });
  for (const item of channels) await tx.notificationChannel.update({ where: { id: item.id }, data: { secret: encryptSecret(decryptSecret(item.secret!, currentKey), nextKey) } });
  const endpoints = await tx.notificationChannel.findMany({ select: { id: true, endpoint: true } });
  for (const item of endpoints) await tx.notificationChannel.update({ where: { id: item.id }, data: { endpoint: encryptSecret(decryptSecret(item.endpoint, currentKey), nextKey) } });
}, { timeout: 120_000 });

const fingerprint = createHash("sha256").update(nextKey).digest("hex").slice(0, 16);
console.log(`Master-key rotation completed. Configure the new key on every instance before restart. New key fingerprint: ${fingerprint}`);
await db.$disconnect();
