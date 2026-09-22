-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "early_ot_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "ot_start_override" TIMESTAMP(3);
