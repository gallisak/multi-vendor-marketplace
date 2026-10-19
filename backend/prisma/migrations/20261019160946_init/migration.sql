CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SELLER', 'ADMIN');

CREATE TYPE "SellerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE "ProductType" AS ENUM ('FIXED_PRICE', 'AUCTION');

CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'ACTIVE', 'REJECTED', 'SOLD_OUT', 'ARCHIVED');

CREATE TYPE "AuctionStatus" AS ENUM ('ACTIVE', 'AWAITING_CHECKOUT', 'SOLD', 'UNSOLD', 'CANCELLED');

CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_COMPLETED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "SellerOrderStatus" AS ENUM ('NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'COMMISSION', 'REFUND', 'COMMISSION_REVERSAL', 'CANCELLATION', 'COMMISSION_CANCELLATION', 'PAYOUT');

CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED_FOR_BUYER', 'RESOLVED_FOR_SELLER', 'CLOSED');

CREATE TYPE "IdempotencyScope" AS ENUM ('CHECKOUT', 'BID', 'REFUND');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "rotated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seller_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "store_name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SellerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "store_name" TEXT NOT NULL,
    "description" TEXT,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'FIXED_PRICE',
    "status" "ProductStatus" NOT NULL DEFAULT 'PENDING_MODERATION',
    "price_minor" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "moderation_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auctions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "start_price_minor" INTEGER NOT NULL,
    "bid_step_minor" INTEGER NOT NULL,
    "current_price_minor" INTEGER,
    "leader_id" UUID,
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "winner_id" UUID,
    "checkout_deadline" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bids" (
    "id" UUID NOT NULL,
    "auction_id" UUID NOT NULL,
    "bidder_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "total_minor" BIGINT NOT NULL,
    "commission_minor" BIGINT NOT NULL,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seller_orders" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "status" "SellerOrderStatus" NOT NULL DEFAULT 'NEW',
    "subtotal_minor" BIGINT NOT NULL,
    "commission_rate_bps" INTEGER NOT NULL,
    "commission_minor" BIGINT NOT NULL,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "cancel_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seller_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "title_snapshot" TEXT NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refunded_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" BIGINT NOT NULL,
    "provider_ref" TEXT,
    "fail_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "commission_reversal_minor" BIGINT NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_order_id" UUID,
    "refund_id" UUID,
    "type" "LedgerEntryType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "seller_order_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","event_id")
);

CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" "IdempotencyScope" NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_daily" (
    "day" DATE NOT NULL,
    "seller_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "units_sold" INTEGER NOT NULL DEFAULT 0,
    "gross_minor" BIGINT NOT NULL DEFAULT 0,
    "commission_minor" BIGINT NOT NULL DEFAULT 0,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sales_daily_pkey" PRIMARY KEY ("day","seller_id","product_id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

CREATE INDEX "seller_applications_status_created_at_idx" ON "seller_applications"("status", "created_at");

CREATE INDEX "seller_applications_user_id_idx" ON "seller_applications"("user_id");

CREATE UNIQUE INDEX "sellers_user_id_key" ON "sellers"("user_id");

CREATE UNIQUE INDEX "sellers_store_name_key" ON "sellers"("store_name");

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

CREATE INDEX "products_seller_id_status_idx" ON "products"("seller_id", "status");

CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

CREATE INDEX "products_status_created_at_idx" ON "products"("status", "created_at");

CREATE INDEX "products_title_trgm_idx" ON "products" USING GIN ("title" gin_trgm_ops);

CREATE UNIQUE INDEX "auctions_product_id_key" ON "auctions"("product_id");

CREATE INDEX "auctions_status_ends_at_idx" ON "auctions"("status", "ends_at");

CREATE INDEX "auctions_status_checkout_deadline_idx" ON "auctions"("status", "checkout_deadline");

CREATE INDEX "bids_auction_id_amount_minor_idx" ON "bids"("auction_id", "amount_minor" DESC);

CREATE INDEX "bids_bidder_id_created_at_idx" ON "bids"("bidder_id", "created_at");

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

CREATE INDEX "cart_items_product_id_idx" ON "cart_items"("product_id");

CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

CREATE INDEX "orders_buyer_id_created_at_idx" ON "orders"("buyer_id", "created_at");

CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

CREATE INDEX "seller_orders_seller_id_status_created_at_idx" ON "seller_orders"("seller_id", "status", "created_at");

CREATE INDEX "seller_orders_status_created_at_idx" ON "seller_orders"("status", "created_at");

CREATE UNIQUE INDEX "seller_orders_order_id_seller_id_key" ON "seller_orders"("order_id", "seller_id");

CREATE INDEX "order_items_seller_order_id_idx" ON "order_items"("seller_order_id");

CREATE INDEX "order_items_product_id_created_at_idx" ON "order_items"("product_id", "created_at");

CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

CREATE INDEX "refunds_seller_order_id_idx" ON "refunds"("seller_order_id");

CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at");

CREATE INDEX "ledger_entries_seller_id_created_at_idx" ON "ledger_entries"("seller_id", "created_at");

CREATE INDEX "ledger_entries_type_created_at_idx" ON "ledger_entries"("type", "created_at");

CREATE INDEX "ledger_entries_seller_order_id_idx" ON "ledger_entries"("seller_order_id");

CREATE INDEX "ledger_entries_refund_id_idx" ON "ledger_entries"("refund_id");

CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

CREATE INDEX "reviews_product_id_created_at_idx" ON "reviews"("product_id", "created_at");

CREATE UNIQUE INDEX "reviews_product_id_author_id_key" ON "reviews"("product_id", "author_id");

CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");

CREATE INDEX "disputes_seller_order_id_idx" ON "disputes"("seller_order_id");

CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

CREATE UNIQUE INDEX "idempotency_keys_user_id_scope_key_key" ON "idempotency_keys"("user_id", "scope", "key");

CREATE INDEX "sales_daily_seller_id_day_idx" ON "sales_daily"("seller_id", "day");

CREATE INDEX "sales_daily_product_id_day_idx" ON "sales_daily"("product_id", "day");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auctions" ADD CONSTRAINT "auctions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auctions" ADD CONSTRAINT "auctions_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auctions" ADD CONSTRAINT "auctions_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seller_orders" ADD CONSTRAINT "seller_orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_seller_order_id_fkey" FOREIGN KEY ("seller_order_id") REFERENCES "seller_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0),
  ADD CONSTRAINT "products_price_positive" CHECK ("price_minor" > 0);

ALTER TABLE "auctions"
  ADD CONSTRAINT "auctions_start_price_positive" CHECK ("start_price_minor" > 0),
  ADD CONSTRAINT "auctions_bid_step_positive" CHECK ("bid_step_minor" > 0),
  ADD CONSTRAINT "auctions_ends_after_start" CHECK ("ends_at" > "starts_at");

ALTER TABLE "bids"
  ADD CONSTRAINT "bids_amount_positive" CHECK ("amount_minor" > 0);

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_minor" >= 0),
  ADD CONSTRAINT "order_items_refunded_le_quantity"
    CHECK ("refunded_quantity" >= 0 AND "refunded_quantity" <= "quantity");

ALTER TABLE "seller_orders"
  ADD CONSTRAINT "seller_orders_commission_rate_range"
    CHECK ("commission_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "seller_orders_refunded_le_subtotal"
    CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "subtotal_minor");

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount_minor" > 0);

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

CREATE UNIQUE INDEX "seller_applications_one_pending_per_user"
  ON "seller_applications" ("user_id") WHERE "status" = 'PENDING';

CREATE INDEX "outbox_events_unpublished_idx"
  ON "outbox_events" ("created_at") WHERE "published_at" IS NULL;
