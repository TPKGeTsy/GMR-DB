-- AlterTable
ALTER TABLE "outside_labor_hires" ADD COLUMN     "contract_type" TEXT NOT NULL DEFAULT 'FIXED_TERM';

-- CreateIndex
CREATE INDEX "outside_labor_hires_vendor_name_idx" ON "outside_labor_hires"("vendor_name");
