-- Existing duplicate keys, if any, must be reviewed before this constraint is applied.
CREATE UNIQUE INDEX "Purchase_organizationId_accessKey_key" ON "Purchase"("organizationId", "accessKey");
CREATE INDEX "Product_organizationId_barcode_idx" ON "Product"("organizationId", "barcode");

CREATE TABLE "SupplierProductCode" (
  "organizationId" TEXT NOT NULL,
  "supplierDocument" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "unitsPerPackage" INTEGER NOT NULL CHECK ("unitsPerPackage" BETWEEN 1 AND 1000000),
  CONSTRAINT "SupplierProductCode_pkey" PRIMARY KEY ("organizationId", "supplierDocument", "code", "unit"),
  CONSTRAINT "SupplierProductCode_organizationId_productId_fkey"
    FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupplierProductCode_organizationId_productId_idx" ON "SupplierProductCode"("organizationId", "productId");
ALTER TABLE "SupplierProductCode" ENABLE ROW LEVEL SECURITY;
