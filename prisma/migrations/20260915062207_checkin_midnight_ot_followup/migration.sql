-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "midnight_ot_prompt_sent_at" TIMESTAMP(3),
ADD COLUMN     "ot_confirmed_at" TIMESTAMP(3);
