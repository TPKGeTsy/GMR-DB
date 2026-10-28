-- CreateTable
CREATE TABLE "steel_plan_bars" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "steel_type" TEXT NOT NULL,
    "section_x" DOUBLE PRECISION NOT NULL,
    "section_y" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "length" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_bars_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "steel_plan_bars" ADD CONSTRAINT "steel_plan_bars_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
