ALTER TABLE "FiscalDocument" ADD COLUMN "activeRequestId" TEXT;
ALTER TABLE "FiscalDocument" DROP CONSTRAINT "fiscal_status";
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "fiscal_status" CHECK ("status" IN ('PENDING','ISSUED','AUTHORIZED','REJECTED','CANCELLED','READY','SENDING','PROCESSING','UNKNOWN','CANCEL_REQUESTED','ERROR'));
CREATE UNIQUE INDEX "FiscalDocument_organizationId_id_key" ON "FiscalDocument"("organizationId", "id");
CREATE TABLE "FiscalRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "model" TEXT NOT NULL CHECK ("model" IN ('55', '65')),
  "environment" TEXT NOT NULL DEFAULT 'homologacao' CHECK ("environment" = 'homologacao'),
  "reference" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY' CHECK ("status" IN ('READY','SENDING','PROCESSING','AUTHORIZED','REJECTED','UNKNOWN','CANCEL_REQUESTED','CANCELLED','ERROR')),
  "providerId" TEXT,
  "accessKey" TEXT,
  "protocol" TEXT,
  "message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalRequest_document_fkey" FOREIGN KEY ("organizationId","documentId") REFERENCES "FiscalDocument"("organizationId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FiscalRequest_organizationId_id_key" ON "FiscalRequest"("organizationId","id");
CREATE INDEX "FiscalRequest_status_leaseUntil_idx" ON "FiscalRequest"("status","leaseUntil");
CREATE UNIQUE INDEX "FiscalRequest_number_key" ON "FiscalRequest" (
 "organizationId", "environment", "model", ("payload"->'infNFe'->'ide'->>'serie'), ("payload"->'infNFe'->'ide'->>'nNF')
) WHERE "status" <> 'REJECTED';
