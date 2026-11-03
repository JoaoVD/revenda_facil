ALTER TABLE "FiscalSettings" ADD COLUMN "emitter" JSONB;
ALTER TABLE "Product" ADD COLUMN "fiscalData" JSONB;
ALTER TABLE "Customer" ADD COLUMN "fiscalAddress" JSONB;
ALTER TABLE "FiscalRequest" ADD COLUMN "cancelReason" TEXT,
 ADD COLUMN "cancelAttemptId" TEXT,
 ADD COLUMN "cancelEventId" TEXT,
 ADD COLUMN "cancelPhase" TEXT,
 ADD COLUMN "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "xmlArchivedAt" TIMESTAMP(3),
 ADD COLUMN "pdfArchivedAt" TIMESTAMP(3),
 ADD COLUMN "cancelXmlArchivedAt" TIMESTAMP(3);
CREATE INDEX "FiscalRequest_nextPollAt_idx" ON "FiscalRequest"("nextPollAt");
