-- AlterTable
ALTER TABLE "outside_labor_hires" ADD COLUMN     "days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "hire_type" TEXT NOT NULL DEFAULT 'COMPANY',
ADD COLUMN     "laborer_rate" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "paid_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paid_date_key" TEXT,
ADD COLUMN     "rate_mode" TEXT NOT NULL DEFAULT 'LUMP_SUM',
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "technician_rate" INTEGER,
ADD COLUMN     "trade" TEXT,
ADD COLUMN     "vendor_name" TEXT,
ADD COLUMN     "vendor_phone" TEXT,
ADD COLUMN     "worker_names" TEXT;
