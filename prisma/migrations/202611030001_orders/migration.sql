ALTER TABLE "Product" ADD COLUMN "reserved" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "product_reservation" CHECK ("reserved" >= 0 AND "reserved" <= "stock");
ALTER TABLE "Sale"
  ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "completedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expectedDate" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "deliveryNotes" TEXT,
  ADD COLUMN "agreementNotes" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
-- Todas as vendas legadas já baixaram estoque. Não criar movimentos nessa migração.
UPDATE "Sale" SET "completedAt" = "createdAt";
ALTER TABLE "Sale" ADD CONSTRAINT "fulfillment_state" CHECK (
  "version" > 0 AND "fulfillmentMode" IN ('IMMEDIATE','DELIVERY','PICKUP') AND
  (("fulfillmentStatus" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR
   ("fulfillmentStatus" = 'PENDING' AND "completedAt" IS NULL AND "fulfillmentMode" <> 'IMMEDIATE'))
);
CREATE TABLE "Installment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "received" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dueDate" TEXT,
  CONSTRAINT "installment_amounts" CHECK ("position" > 0 AND "amount" > 0 AND "received" >= 0 AND "received" <= "amount"),
  CONSTRAINT "Installment_sale_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Installment_organizationId_saleId_position_key" ON "Installment"("organizationId", "saleId", "position");
