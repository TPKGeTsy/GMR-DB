-- CreateTable
CREATE TABLE "steel_plan_nest_done" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "steel_plan_nest_done_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "steel_plan_nest_done_plan_id_signature_key" ON "steel_plan_nest_done"("plan_id", "signature");

-- AddForeignKey
ALTER TABLE "steel_plan_nest_done" ADD CONSTRAINT "steel_plan_nest_done_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
