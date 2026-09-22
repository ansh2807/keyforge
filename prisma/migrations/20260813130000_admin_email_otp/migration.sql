CREATE TYPE "AdminEmailOtpPurpose" AS ENUM ('LOGIN', 'ENABLE_MFA');

ALTER TABLE "AdminUser"
ADD COLUMN "emailOtpEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AdminEmailOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AdminEmailOtpPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminEmailOtpChallenge_tokenHash_key"
ON "AdminEmailOtpChallenge"("tokenHash");

CREATE INDEX "AdminEmailOtpChallenge_userId_purpose_createdAt_idx"
ON "AdminEmailOtpChallenge"("userId", "purpose", "createdAt");

CREATE INDEX "AdminEmailOtpChallenge_expiresAt_idx"
ON "AdminEmailOtpChallenge"("expiresAt");

ALTER TABLE "AdminEmailOtpChallenge"
ADD CONSTRAINT "AdminEmailOtpChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AdminUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
