-- CreateTable
CREATE TABLE "modbus_relay_states" (
    "channel" INTEGER NOT NULL,
    "is_on" BOOLEAN NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modbus_relay_states_pkey" PRIMARY KEY ("channel")
);
