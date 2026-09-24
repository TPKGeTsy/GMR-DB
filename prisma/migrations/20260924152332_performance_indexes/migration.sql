-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "check_ins_user_id_created_at_idx" ON "check_ins"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "check_ins_created_at_idx" ON "check_ins"("created_at");

-- CreateIndex
CREATE INDEX "check_ins_trip_id_idx" ON "check_ins"("trip_id");

-- CreateIndex
CREATE INDEX "outside_work_trips_created_at_idx" ON "outside_work_trips"("created_at");
