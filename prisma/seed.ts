import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

function masterKey(): Buffer {
  const value = process.env.KEYFORGE_MASTER_KEY;
  if (!value) throw new Error("Set KEYFORGE_MASTER_KEY before seeding.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("KEYFORGE_MASTER_KEY must decode to 32 bytes.");
  return key;
}

function keyedHash(value: string, key: Buffer): string {
  return createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function randomReadable(length: number): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function licenseKey(): string {
  const body = randomReadable(25);
  return `KF-${body.match(/.{1,5}/g)?.join("-")}`;
}

async function main() {
  const key = masterKey();
  const password = process.env.KEYFORGE_SEED_PASSWORD || "replace-this-demo-passphrase";
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
  const signing = await import("node:crypto").then(({ generateKeyPairSync }) =>
    generateKeyPairSync("ed25519"),
  );
  const owner = await db.adminUser.upsert({
    where: { email: "owner@northstar.test" },
    update: { passwordHash },
    create: { name: "Avery Stone", email: "owner@northstar.test", passwordHash },
  });
  const organization = await db.organization.upsert({
    where: { slug: "northstar-labs" },
    update: {},
    create: { name: "Northstar Labs", slug: "northstar-labs" },
  });
  await db.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: organization.id } },
    update: { role: "OWNER" },
    create: { userId: owner.id, organizationId: organization.id, role: "OWNER" },
  });
  let application = await db.application.findUnique({ where: { publicId: "app_demo_northstar_desktop" } });
  if (!application) {
    application = await db.application.create({
      data: {
        organizationId: organization.id,
        name: "Northstar Desktop",
        slug: "northstar-desktop",
        publicId: "app_demo_northstar_desktop",
        version: "1.0.0",
        signingKeyId: `sig_${randomBytes(9).toString("base64url")}`,
        signingPublicKey: signing.publicKey.export({ type: "spki", format: "pem" }).toString(),
        signingPrivateKey: encrypt(
          signing.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          key,
        ),
      },
    });
  }
  const plan = await db.plan.upsert({
    where: { applicationId_name: { applicationId: application.id, name: "Professional" } },
    update: {},
    create: {
      applicationId: application.id,
      name: "Professional",
      description: "Full desktop product access",
      durationDays: 30,
      entitlements: { exports: true, cloudSync: true, seats: 1 },
    },
  });
  const keys: string[] = [];
  if ((await db.license.count({ where: { applicationId: application.id } })) === 0) {
    for (let index = 0; index < 5; index += 1) {
      const raw = licenseKey();
      keys.push(raw);
      await db.license.create({
        data: {
          applicationId: application.id,
          planId: plan.id,
          keyHash: keyedHash(raw, key),
          keyPrefix: raw.slice(0, 8),
          keyLastFour: raw.slice(-4),
          durationDays: 30,
          maxDevices: 2,
          note: "Seeded development license",
        },
      });
    }
  }
  process.stdout.write("Keyforge seed complete.\n");
  process.stdout.write("Owner: owner@northstar.test\n");
  process.stdout.write(`Password: ${password}\n`);
  if (keys.length) process.stdout.write(`Licenses:\n${keys.join("\n")}\n`);
}

main().finally(() => db.$disconnect());
