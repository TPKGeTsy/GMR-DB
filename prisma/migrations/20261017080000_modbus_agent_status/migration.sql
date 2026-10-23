-- CreateTable
CREATE TABLE "modbus_agent_status" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "states" BOOLEAN[],
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modbus_agent_status_pkey" PRIMARY KEY ("id")
);
