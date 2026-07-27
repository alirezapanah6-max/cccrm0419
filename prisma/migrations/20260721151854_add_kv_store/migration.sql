-- AlterTable
ALTER TABLE "calls" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "kv_store" (
    "key" VARCHAR(500) NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kv_store_pkey" PRIMARY KEY ("key")
);

-- RenameIndex
ALTER INDEX "idx_call_logs_call" RENAME TO "call_logs_call_id_idx";

-- RenameIndex
ALTER INDEX "idx_calls_agent" RENAME TO "calls_agent_id_idx";

-- RenameIndex
ALTER INDEX "idx_calls_created_at" RENAME TO "calls_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_calls_date" RENAME TO "calls_date_idx";

-- RenameIndex
ALTER INDEX "idx_calls_followup_root" RENAME TO "calls_followup_root_id_idx";

-- RenameIndex
ALTER INDEX "idx_calls_phone" RENAME TO "calls_phone_idx";

-- RenameIndex
ALTER INDEX "idx_calls_request_id" RENAME TO "calls_request_id_idx";

-- RenameIndex
ALTER INDEX "idx_calls_status" RENAME TO "calls_status_idx";

-- RenameIndex
ALTER INDEX "idx_categories_parent" RENAME TO "categories_parent_id_idx";
