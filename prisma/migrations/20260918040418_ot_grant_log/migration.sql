-- CreateTable
CREATE TABLE "ot_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ot_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_pending_ot_grants" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_pending_ot_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_pending_ot_grants_line_user_id_key" ON "line_pending_ot_grants"("line_user_id");

-- AddForeignKey
ALTER TABLE "ot_grants" ADD CONSTRAINT "ot_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_grants" ADD CONSTRAINT "ot_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_pending_ot_grants" ADD CONSTRAINT "line_pending_ot_grants_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
