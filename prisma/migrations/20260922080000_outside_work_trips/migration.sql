-- AlterTable
ALTER TABLE "check_ins" ADD COLUMN     "ot_nudge_sent_at" TIMESTAMP(3),
ADD COLUMN     "trip_id" TEXT;

-- CreateTable
CREATE TABLE "outside_work_trips" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outside_work_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outside_work_trip_members" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "check_in_id" TEXT,

    CONSTRAINT "outside_work_trip_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_pending_outside_trips" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "location" TEXT,
    "headcount" INTEGER,
    "selected_user_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_pending_outside_trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outside_work_trip_members_trip_id_user_id_key" ON "outside_work_trip_members"("trip_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "line_pending_outside_trips_line_user_id_key" ON "line_pending_outside_trips"("line_user_id");

-- AddForeignKey
ALTER TABLE "outside_work_trips" ADD CONSTRAINT "outside_work_trips_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_work_trip_members" ADD CONSTRAINT "outside_work_trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "outside_work_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outside_work_trip_members" ADD CONSTRAINT "outside_work_trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
