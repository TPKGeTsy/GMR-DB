-- CreateTable
CREATE TABLE "modbus_web_activity" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modbus_web_activity_pkey" PRIMARY KEY ("id")
);
