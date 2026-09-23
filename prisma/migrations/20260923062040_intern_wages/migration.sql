-- AlterTable
ALTER TABLE "users" ADD COLUMN     "intern_grade" TEXT;

-- CreateTable
CREATE TABLE "wage_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "grade_a_rate" INTEGER NOT NULL DEFAULT 300,
    "grade_b_rate" INTEGER NOT NULL DEFAULT 250,
    "grade_c_rate" INTEGER NOT NULL DEFAULT 150,
    "outside_flat_rate" INTEGER NOT NULL DEFAULT 300,
    "grade_a_outside_allowance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_settings_pkey" PRIMARY KEY ("id")
);
