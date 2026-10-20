ALTER TABLE "seller_orders" ADD COLUMN "completed_at" TIMESTAMPTZ(3);

ALTER TABLE "ledger_entries" ADD COLUMN "payout_id" UUID;

CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payouts_amount_positive" CHECK ("amount_minor" > 0)
);

CREATE INDEX "seller_orders_status_completed_at_idx" ON "seller_orders"("status", "completed_at");

CREATE INDEX "ledger_entries_payout_id_idx" ON "ledger_entries"("payout_id");

CREATE INDEX "ledger_entries_seller_id_payout_id_idx" ON "ledger_entries"("seller_id", "payout_id");

CREATE INDEX "payouts_seller_id_created_at_idx" ON "payouts"("seller_id", "created_at");

CREATE INDEX "payouts_created_at_idx" ON "payouts"("created_at");

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
