CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED', 'EXPIRED');
CREATE TYPE "VariableVisibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'SERVER');
CREATE TYPE "AccessRuleEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "AccessRuleSubject" AS ENUM ('IP', 'INSTALLATION', 'USERNAME', 'LICENSE');
CREATE TYPE "ChallengeKind" AS ENUM ('PASSKEY_REGISTRATION', 'PASSKEY_AUTHENTICATION');
CREATE TYPE "NotificationChannelKind" AS ENUM ('DISCORD', 'TELEGRAM', 'GENERIC');

ALTER TABLE "Application" ADD COLUMN "compatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "compatName" TEXT,
ADD COLUMN "compatOwnerId" TEXT,
ADD COLUMN "compatSecretHash" TEXT;

ALTER TABLE "EndUser" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "totpSecret" TEXT;

CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "licenseId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationVariable" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "visibility" "VariableVisibility" NOT NULL DEFAULT 'AUTHENTICATED',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationVariable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserVariable" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserVariable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BuildArtifact" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuildArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManagedFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "planId" TEXT,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagedFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessRule" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "effect" "AccessRuleEffect" NOT NULL,
    "subject" "AccessRuleSubject" NOT NULL,
    "valueHash" TEXT NOT NULL,
    "valuePreview" TEXT NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RemoteFunction" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requiredPlanId" TEXT,
    "name" TEXT NOT NULL,
    "response" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RemoteFunction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "delaySeconds" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT,
    "authorType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EndUserPasskey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "EndUserPasskey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductAuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ChallengeKind" NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductLoginToken" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'web_loader',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductLoginToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "NotificationChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "secret" TEXT,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['licenses:read', 'licenses:write', 'users:read']::TEXT[],
    "credits" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompatibilitySession" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompatibilitySession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");
CREATE INDEX "TeamInvite_organizationId_email_idx" ON "TeamInvite"("organizationId", "email");
CREATE INDEX "TeamInvite_expiresAt_idx" ON "TeamInvite"("expiresAt");
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");
CREATE INDEX "UserSubscription_planId_status_idx" ON "UserSubscription"("planId", "status");
CREATE INDEX "UserSubscription_expiresAt_idx" ON "UserSubscription"("expiresAt");
CREATE INDEX "ApplicationVariable_applicationId_visibility_active_idx" ON "ApplicationVariable"("applicationId", "visibility", "active");
CREATE UNIQUE INDEX "ApplicationVariable_applicationId_key_key" ON "ApplicationVariable"("applicationId", "key");
CREATE INDEX "UserVariable_userId_idx" ON "UserVariable"("userId");
CREATE UNIQUE INDEX "UserVariable_userId_key_key" ON "UserVariable"("userId", "key");
CREATE INDEX "BuildArtifact_applicationId_active_idx" ON "BuildArtifact"("applicationId", "active");
CREATE UNIQUE INDEX "BuildArtifact_applicationId_version_platform_key" ON "BuildArtifact"("applicationId", "version", "platform");
CREATE UNIQUE INDEX "ManagedFile_storageKey_key" ON "ManagedFile"("storageKey");
CREATE INDEX "ManagedFile_applicationId_active_idx" ON "ManagedFile"("applicationId", "active");
CREATE INDEX "ManagedFile_planId_idx" ON "ManagedFile"("planId");
CREATE UNIQUE INDEX "ManagedFile_applicationId_name_key" ON "ManagedFile"("applicationId", "name");
CREATE INDEX "AccessRule_applicationId_active_expiresAt_idx" ON "AccessRule"("applicationId", "active", "expiresAt");
CREATE UNIQUE INDEX "AccessRule_applicationId_effect_subject_valueHash_key" ON "AccessRule"("applicationId", "effect", "subject", "valueHash");
CREATE INDEX "RemoteFunction_applicationId_active_idx" ON "RemoteFunction"("applicationId", "active");
CREATE UNIQUE INDEX "RemoteFunction_applicationId_name_key" ON "RemoteFunction"("applicationId", "name");
CREATE INDEX "ChatChannel_applicationId_active_idx" ON "ChatChannel"("applicationId", "active");
CREATE UNIQUE INDEX "ChatChannel_applicationId_name_key" ON "ChatChannel"("applicationId", "name");
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");
CREATE UNIQUE INDEX "EndUserPasskey_credentialId_key" ON "EndUserPasskey"("credentialId");
CREATE INDEX "EndUserPasskey_userId_idx" ON "EndUserPasskey"("userId");
CREATE UNIQUE INDEX "ProductAuthChallenge_challenge_key" ON "ProductAuthChallenge"("challenge");
CREATE INDEX "ProductAuthChallenge_userId_kind_expiresAt_idx" ON "ProductAuthChallenge"("userId", "kind", "expiresAt");
CREATE INDEX "ProductAuthChallenge_expiresAt_idx" ON "ProductAuthChallenge"("expiresAt");
CREATE UNIQUE INDEX "ProductLoginToken_tokenHash_key" ON "ProductLoginToken"("tokenHash");
CREATE INDEX "ProductLoginToken_applicationId_expiresAt_idx" ON "ProductLoginToken"("applicationId", "expiresAt");
CREATE INDEX "ProductLoginToken_userId_expiresAt_idx" ON "ProductLoginToken"("userId", "expiresAt");
CREATE INDEX "NotificationChannel_applicationId_active_idx" ON "NotificationChannel"("applicationId", "active");
CREATE UNIQUE INDEX "NotificationChannel_applicationId_name_key" ON "NotificationChannel"("applicationId", "name");
CREATE UNIQUE INDEX "Reseller_keyHash_key" ON "Reseller"("keyHash");
CREATE INDEX "Reseller_organizationId_active_idx" ON "Reseller"("organizationId", "active");
CREATE INDEX "Reseller_applicationId_active_idx" ON "Reseller"("applicationId", "active");
CREATE UNIQUE INDEX "CompatibilitySession_tokenHash_key" ON "CompatibilitySession"("tokenHash");
CREATE INDEX "CompatibilitySession_applicationId_expiresAt_idx" ON "CompatibilitySession"("applicationId", "expiresAt");
CREATE INDEX "CompatibilitySession_expiresAt_idx" ON "CompatibilitySession"("expiresAt");
CREATE UNIQUE INDEX "Application_organizationId_compatName_key" ON "Application"("organizationId", "compatName");
CREATE UNIQUE INDEX "Application_compatOwnerId_compatName_key" ON "Application"("compatOwnerId", "compatName");

ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationVariable" ADD CONSTRAINT "ApplicationVariable_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserVariable" ADD CONSTRAINT "UserVariable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildArtifact" ADD CONSTRAINT "BuildArtifact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedFile" ADD CONSTRAINT "ManagedFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedFile" ADD CONSTRAINT "ManagedFile_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteFunction" ADD CONSTRAINT "RemoteFunction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RemoteFunction" ADD CONSTRAINT "RemoteFunction_requiredPlanId_fkey" FOREIGN KEY ("requiredPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EndUserPasskey" ADD CONSTRAINT "EndUserPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAuthChallenge" ADD CONSTRAINT "ProductAuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLoginToken" ADD CONSTRAINT "ProductLoginToken_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLoginToken" ADD CONSTRAINT "ProductLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EndUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompatibilitySession" ADD CONSTRAINT "CompatibilitySession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
