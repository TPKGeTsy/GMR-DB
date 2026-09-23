-- CreateTable
CREATE TABLE "wage_grades" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "onsite_rate" INTEGER NOT NULL,
    "outside_rate" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wage_grades_code_key" ON "wage_grades"("code");

-- Seed the original fixed A/B/C grades as starting rows, carrying over
-- whatever rates were saved in the old wage_settings singleton (if the
-- admin had already adjusted them) — falling back to the original
-- hardcoded defaults if that row was never created.
INSERT INTO "wage_grades" ("id", "code", "onsite_rate", "outside_rate", "sort_order", "updated_at")
SELECT 'wgrade_a', 'A', grade_a_rate, grade_a_rate + grade_a_outside_allowance, 1, now() FROM "wage_settings" WHERE id = 1
UNION ALL
SELECT 'wgrade_b', 'B', grade_b_rate, outside_flat_rate, 2, now() FROM "wage_settings" WHERE id = 1
UNION ALL
SELECT 'wgrade_c', 'C', grade_c_rate, outside_flat_rate, 3, now() FROM "wage_settings" WHERE id = 1;

INSERT INTO "wage_grades" ("id", "code", "onsite_rate", "outside_rate", "sort_order", "updated_at")
SELECT 'wgrade_a', 'A', 300, 300, 1, now() WHERE NOT EXISTS (SELECT 1 FROM "wage_grades" WHERE code = 'A');
INSERT INTO "wage_grades" ("id", "code", "onsite_rate", "outside_rate", "sort_order", "updated_at")
SELECT 'wgrade_b', 'B', 250, 300, 2, now() WHERE NOT EXISTS (SELECT 1 FROM "wage_grades" WHERE code = 'B');
INSERT INTO "wage_grades" ("id", "code", "onsite_rate", "outside_rate", "sort_order", "updated_at")
SELECT 'wgrade_c', 'C', 150, 300, 3, now() WHERE NOT EXISTS (SELECT 1 FROM "wage_grades" WHERE code = 'C');

-- DropTable
DROP TABLE "wage_settings";
