ALTER TABLE "CompatibilitySession" ADD COLUMN "clientSessionId" TEXT;

CREATE UNIQUE INDEX "CompatibilitySession_clientSessionId_key" ON "CompatibilitySession"("clientSessionId");

ALTER TABLE "CompatibilitySession"
ADD CONSTRAINT "CompatibilitySession_clientSessionId_fkey"
FOREIGN KEY ("clientSessionId") REFERENCES "ClientSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
