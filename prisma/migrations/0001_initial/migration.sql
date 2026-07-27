-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: categories
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "parent_id" UUID,
    "level" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: calls
CREATE TABLE "calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "phone" VARCHAR(11) NOT NULL,
    "customer_name" VARCHAR(200),
    "status" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "category_name" VARCHAR(200),
    "sub_category_id" UUID,
    "sub_category_name" VARCHAR(200),
    "sub_sub_category_id" UUID,
    "sub_sub_category_name" VARCHAR(200),
    "agent_id" UUID NOT NULL,
    "agent_name" VARCHAR(200) NOT NULL,
    "followup_root_id" UUID,
    "linked_to_id" UUID,
    "closed_by_call_id" UUID,
    "resolved_by_id" UUID,
    "resolved_by_name" VARCHAR(200),
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable: call_logs
CREATE TABLE "call_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "call_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "details" JSONB,
    "user_id" UUID NOT NULL,
    "user_name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_categories_parent" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "calls_request_id_key" ON "calls"("request_id");

-- CreateIndex
CREATE INDEX "idx_calls_phone" ON "calls"("phone");

-- CreateIndex
CREATE INDEX "idx_calls_date" ON "calls"("date");

-- CreateIndex
CREATE INDEX "idx_calls_agent" ON "calls"("agent_id");

-- CreateIndex
CREATE INDEX "idx_calls_status" ON "calls"("status");

-- CreateIndex
CREATE INDEX "idx_calls_followup_root" ON "calls"("followup_root_id");

-- CreateIndex
CREATE INDEX "idx_calls_request_id" ON "calls"("request_id");

-- CreateIndex
CREATE INDEX "idx_calls_created_at" ON "calls"("created_at");

-- CreateIndex
CREATE INDEX "idx_call_logs_call" ON "call_logs"("call_id");

-- AddForeignKey: categories self-reference
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> users (agent)
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: calls -> users (resolved_by)
ALTER TABLE "calls" ADD CONSTRAINT "calls_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> categories (category)
ALTER TABLE "calls" ADD CONSTRAINT "calls_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> categories (sub_category)
ALTER TABLE "calls" ADD CONSTRAINT "calls_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> categories (sub_sub_category)
ALTER TABLE "calls" ADD CONSTRAINT "calls_sub_sub_category_id_fkey" FOREIGN KEY ("sub_sub_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> calls (followup_root)
ALTER TABLE "calls" ADD CONSTRAINT "calls_followup_root_id_fkey" FOREIGN KEY ("followup_root_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> calls (linked_to)
ALTER TABLE "calls" ADD CONSTRAINT "calls_linked_to_id_fkey" FOREIGN KEY ("linked_to_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: calls -> calls (closed_by)
ALTER TABLE "calls" ADD CONSTRAINT "calls_closed_by_call_id_fkey" FOREIGN KEY ("closed_by_call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: call_logs -> calls
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: call_logs -> users
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
