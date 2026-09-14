-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "ot_prompt_sent_at" TIMESTAMP(3),
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

