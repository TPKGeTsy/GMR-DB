-- AlterTable
ALTER TABLE "steel_plan_parts" ADD COLUMN "source_file" TEXT,
ADD COLUMN "base_quantity" INTEGER,
ADD COLUMN "rounds" INTEGER NOT NULL DEFAULT 1;
