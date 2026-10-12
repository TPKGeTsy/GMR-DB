-- CreateTable
CREATE TABLE "outside_labor_hires" (
    "id" TEXT NOT NULL,
    "date_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "project_id" TEXT,
    "responsible_id" TEXT NOT NULL,
    "technician_count" INTEGER NOT NULL DEFAULT 0,
    "laborer_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outside_labor_hires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outside_labor_hires_date_key_idx" ON "outside_labor_hires"("date_key");

-- AddForeignKey
ALTER TABLE "outside_labor_hires" ADD CONSTRAINT "outside_labor_hires_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_labor_hires" ADD CONSTRAINT "outside_labor_hires_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_labor_hires" ADD CONSTRAINT "outside_labor_hires_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
