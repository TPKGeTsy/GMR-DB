-- CreateTable
CREATE TABLE "steel_type_aliases" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "steel_type" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "steel_type_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "steel_type_aliases_keyword_key" ON "steel_type_aliases"("keyword");
