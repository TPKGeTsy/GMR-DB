-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "awaiting_ot_reason" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "confidence" DROP NOT NULL;
