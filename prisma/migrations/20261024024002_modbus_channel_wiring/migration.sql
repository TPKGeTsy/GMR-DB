-- CreateTable
CREATE TABLE "modbus_channel_wiring" (
    "channel" INTEGER NOT NULL,
    "module_index" INTEGER NOT NULL,
    "address" INTEGER NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modbus_channel_wiring_pkey" PRIMARY KEY ("channel")
);
