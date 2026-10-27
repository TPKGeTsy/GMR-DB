-- CreateTable
CREATE TABLE "intern_grade_changes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "effective_from" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intern_grade_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intern_grade_changes_user_id_effective_from_key" ON "intern_grade_changes"("user_id", "effective_from");

-- AddForeignKey
ALTER TABLE "intern_grade_changes" ADD CONSTRAINT "intern_grade_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
