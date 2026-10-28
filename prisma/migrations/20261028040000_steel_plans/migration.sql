-- CreateTable
CREATE TABLE "steel_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "kerf" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "new_bar_length" DOUBLE PRECISION NOT NULL DEFAULT 6000,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "steel_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steel_plan_parts" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "steel_type" TEXT NOT NULL,
    "section_x" DOUBLE PRECISION NOT NULL,
    "section_y" DOUBLE PRECISION,
    "cut_length" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steel_plan_stock" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "steel_type" TEXT NOT NULL,
    "section_x" DOUBLE PRECISION NOT NULL,
    "section_y" DOUBLE PRECISION,
    "length" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_stock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "steel_plans" ADD CONSTRAINT "steel_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steel_plans" ADD CONSTRAINT "steel_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steel_plan_parts" ADD CONSTRAINT "steel_plan_parts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "steel_plan_stock" ADD CONSTRAINT "steel_plan_stock_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
