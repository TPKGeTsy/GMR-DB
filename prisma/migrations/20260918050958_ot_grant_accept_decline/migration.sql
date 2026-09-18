-- AlterTable
ALTER TABLE "ot_grants" ADD COLUMN     "check_in_id" TEXT,
ADD COLUMN     "decline_reason" TEXT,
ADD COLUMN     "responded_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "work_schedule_id" TEXT;
