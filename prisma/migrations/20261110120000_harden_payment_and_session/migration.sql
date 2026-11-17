-- Fail loudly instead of silently failing to add the constraint when duplicate
-- gateway references already exist. Payment.orderId @unique is the primary
-- idempotency guard; this is defense in depth against a gateway reusing a
-- transaction id across two orders.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    GROUP BY "gatewayReference"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique constraint on Payment.gatewayReference: duplicate values exist';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayReference_key" ON "Payment"("gatewayReference");

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
