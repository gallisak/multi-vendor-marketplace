CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID');

ALTER TABLE "payouts"
  ADD COLUMN "status" "PayoutStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "paid_at" TIMESTAMPTZ(3),
  ALTER COLUMN "provider_ref" DROP NOT NULL;

UPDATE "payouts" SET "paid_at" = "created_at";

ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'PENDING';
