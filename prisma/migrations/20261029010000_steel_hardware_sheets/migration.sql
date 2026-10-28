-- CreateTable
CREATE TABLE "steel_plan_hardware" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "item_no" INTEGER,
    "part_number" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_hardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steel_plan_sheet_parts" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "thickness" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "geometry" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_sheet_parts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "steel_plan_hardware" ADD CONSTRAINT "steel_plan_hardware_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steel_plan_sheet_parts" ADD CONSTRAINT "steel_plan_sheet_parts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
