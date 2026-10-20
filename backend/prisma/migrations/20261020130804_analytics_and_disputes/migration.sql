CREATE TABLE "cart_activity" (
    "day" DATE NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "cart_activity_pkey" PRIMARY KEY ("day","user_id")
);

CREATE INDEX "cart_activity_user_id_idx" ON "cart_activity"("user_id");

ALTER TABLE "cart_activity" ADD CONSTRAINT "cart_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "disputes_one_open_per_seller_order"
  ON "disputes" ("seller_order_id") WHERE "status" = 'OPEN';
