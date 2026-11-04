ALTER TABLE "SyncCommand" ADD COLUMN "resolvedPayload" JSONB;
ALTER TABLE "SyncCommand" ADD COLUMN "resolutionVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("resolutionVersion" >= 0);
CREATE UNIQUE INDEX "SyncCommand_organizationId_userId_id_key" ON "SyncCommand"("organizationId", "userId", "id");
CREATE TABLE "SyncResolution" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "commandId" TEXT NOT NULL,
 "version" INTEGER NOT NULL CHECK ("version" > 0), "action" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "payload" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("organizationId", "userId", "commandId") REFERENCES "SyncCommand"("organizationId", "userId", "id") ON DELETE RESTRICT,
 CHECK ("action" IN ('RETRY','ORDER_PRICES','DELIVERY_VERSION','PAYMENT_TARGET','CUSTOMER_CURRENT'))
);
CREATE UNIQUE INDEX "SyncResolution_organizationId_userId_commandId_version_key" ON "SyncResolution"("organizationId", "userId", "commandId", "version");
