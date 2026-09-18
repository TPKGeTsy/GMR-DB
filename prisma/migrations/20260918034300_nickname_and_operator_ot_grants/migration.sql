-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "ot_granted_at" TIMESTAMP(3),
ADD COLUMN     "ot_granted_by_id" TEXT,
ADD COLUMN     "ot_granted_hours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nickname" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ot_granted_by_id_fkey" FOREIGN KEY ("ot_granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
