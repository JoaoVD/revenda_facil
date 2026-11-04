ALTER TABLE "Installment" ADD COLUMN "planVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("planVersion" > 0);
ALTER TABLE "Installment" ADD COLUMN "supersededAt" TIMESTAMP(3);
DROP INDEX "Installment_organizationId_saleId_position_key";
CREATE UNIQUE INDEX "Installment_organizationId_saleId_planVersion_position_key" ON "Installment"("organizationId", "saleId", "planVersion", "position");
CREATE TABLE "OrderChange" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "saleId" TEXT NOT NULL,
 "type" TEXT NOT NULL CHECK ("type" IN ('EDIT','REFUND_CANCEL')), "version" INTEGER NOT NULL CHECK ("version" > 1),
 "requestHash" TEXT NOT NULL, "payload" JSONB NOT NULL, "before" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "OrderChange_organizationId_saleId_version_key" ON "OrderChange"("organizationId", "saleId", "version");
ALTER TABLE "Payment" DROP CONSTRAINT "payment_target";
ALTER TABLE "Payment" ADD CONSTRAINT "payment_target" CHECK (
 ("saleId" IS NOT NULL AND "purchaseId" IS NULL AND "expenseId" IS NULL AND "direction" IN ('IN','OUT'))
 OR ("direction"='OUT' AND "saleId" IS NULL AND (("purchaseId" IS NOT NULL AND "expenseId" IS NULL) OR ("purchaseId" IS NULL AND "expenseId" IS NOT NULL)))
);
