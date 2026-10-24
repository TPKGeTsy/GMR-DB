-- CreateTable
CREATE TABLE "modbus_schedules" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "time" TEXT NOT NULL,
    "days" INTEGER[],
    "action" TEXT NOT NULL,
    "channels" INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_date_key" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modbus_schedules_pkey" PRIMARY KEY ("id")
);
