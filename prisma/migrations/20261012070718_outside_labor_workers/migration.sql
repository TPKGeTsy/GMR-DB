/*
  Warnings:

  - You are about to drop the column `worker_names` on the `outside_labor_hires` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "outside_labor_hires" DROP COLUMN "worker_names";

-- CreateTable
CREATE TABLE "outside_labor_workers" (
    "id" TEXT NOT NULL,
    "hire_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "daily_rate" INTEGER,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outside_labor_workers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outside_labor_workers_hire_id_idx" ON "outside_labor_workers"("hire_id");

-- CreateIndex
CREATE INDEX "outside_labor_workers_name_key_idx" ON "outside_labor_workers"("name_key");

-- AddForeignKey
ALTER TABLE "outside_labor_workers" ADD CONSTRAINT "outside_labor_workers_hire_id_fkey" FOREIGN KEY ("hire_id") REFERENCES "outside_labor_hires"("id") ON DELETE CASCADE ON UPDATE CASCADE;
