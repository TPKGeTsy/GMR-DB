-- CreateTable
CREATE TABLE "steel_plan_images" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_plan_images_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "steel_plan_images" ADD CONSTRAINT "steel_plan_images_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "steel_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
