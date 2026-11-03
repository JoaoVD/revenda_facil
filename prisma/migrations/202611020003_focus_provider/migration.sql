ALTER TABLE "FiscalRequest"
 ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'ACBR' CHECK ("provider" IN ('ACBR','FOCUS')),
 ADD COLUMN "fiscalSeries" INTEGER,
 ADD COLUMN "fiscalNumber" INTEGER;
UPDATE "FiscalRequest" SET
 "fiscalSeries" = ("payload"->'infNFe'->'ide'->>'serie')::integer,
 "fiscalNumber" = ("payload"->'infNFe'->'ide'->>'nNF')::integer;
ALTER TABLE "FiscalRequest" ADD CONSTRAINT "focus_number_required" CHECK (
 "provider" <> 'FOCUS' OR ("fiscalSeries" IS NOT NULL AND "fiscalNumber" IS NOT NULL AND "fiscalNumber" > 0)
);
DROP INDEX "FiscalRequest_number_key";
CREATE UNIQUE INDEX "FiscalRequest_number_key" ON "FiscalRequest" (
 "organizationId", "environment", "model", "fiscalSeries", "fiscalNumber"
) WHERE "status" <> 'REJECTED';
