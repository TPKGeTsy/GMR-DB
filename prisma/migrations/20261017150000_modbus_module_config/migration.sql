-- CreateTable
CREATE TABLE "modbus_module_config" (
    "module_index" INTEGER NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 502,
    "unit_id" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modbus_module_config_pkey" PRIMARY KEY ("module_index")
);
