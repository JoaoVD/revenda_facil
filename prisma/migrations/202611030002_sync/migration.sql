CREATE TABLE "SyncCommand" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dependencies" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "message" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_state" CHECK ("status" IN ('PENDING','WAITING','APPLIED','ATTENTION') AND "contractVersion" = 1)
);
CREATE INDEX "SyncCommand_organizationId_userId_status_idx" ON "SyncCommand"("organizationId", "userId", "status");
