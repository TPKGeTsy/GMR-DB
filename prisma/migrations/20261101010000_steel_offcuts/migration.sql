-- CreateTable
CREATE TABLE "steel_offcuts" (
    "id" TEXT NOT NULL,
    "steel_type" TEXT NOT NULL,
    "section_x" DOUBLE PRECISION NOT NULL,
    "section_y" DOUBLE PRECISION,
    "thickness" DOUBLE PRECISION,
    "length" DOUBLE PRECISION NOT NULL,
    "source_plan_id" TEXT,
    "source_name" TEXT,
    "reserved_plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_offcuts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "steel_offcuts_steel_type_section_x_idx" ON "steel_offcuts"("steel_type", "section_x");

-- CreateIndex
CREATE INDEX "steel_offcuts_reserved_plan_id_idx" ON "steel_offcuts"("reserved_plan_id");
