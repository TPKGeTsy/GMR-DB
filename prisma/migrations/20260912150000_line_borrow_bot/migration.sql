-- AlterTable
ALTER TABLE "users" ADD COLUMN     "line_user_id" TEXT;

-- CreateTable
CREATE TABLE "line_pending_borrows" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_pending_borrows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_pending_borrows_line_user_id_key" ON "line_pending_borrows"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_line_user_id_key" ON "users"("line_user_id");

-- AddForeignKey
ALTER TABLE "line_pending_borrows" ADD CONSTRAINT "line_pending_borrows_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

