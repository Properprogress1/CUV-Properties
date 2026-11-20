BEGIN;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "checkoutKey" UUID NOT NULL,
    "listingSlug" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "listingReference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "initializeKey" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxOutcome" (
    "paymentId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SandboxOutcome_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "orderReference" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerReference" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceAudit" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_checkoutKey_key" ON "Order"("customerId", "checkoutKey");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");

-- CreateIndex
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_initializeKey_key" ON "Payment"("orderId", "initializeKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_disposition_createdAt_idx" ON "PaymentEvent"("disposition", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxOutcome_eventId_key" ON "SandboxOutcome"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_reference_key" ON "Receipt"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_reference_key" ON "Refund"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerReference_key" ON "Refund"("providerReference");

-- CreateIndex
CREATE INDEX "Refund_paymentId_status_idx" ON "Refund"("paymentId", "status");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_requestKey_key" ON "Refund"("paymentId", "requestKey");

-- CreateIndex
CREATE INDEX "CommerceAudit_orderId_createdAt_idx" ON "CommerceAudit"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxOutcome" ADD CONSTRAINT "SandboxOutcome_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceAudit" ADD CONSTRAINT "CommerceAudit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceAudit" ADD CONSTRAINT "CommerceAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "Order" ADD CONSTRAINT "Order_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_positive_amount" CHECK ("unitAmountMinor" > 0 AND "quantity" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_positive_amount" CHECK ("amountMinor" > 0);
CREATE UNIQUE INDEX "Payment_one_pending_per_order" ON "Payment" ("orderId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "Payment_one_capture_per_order" ON "Payment" ("orderId") WHERE "status" = 'SUCCEEDED';
CREATE FUNCTION prevent_commerce_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Commerce snapshots are immutable';
END;
$$;
CREATE TRIGGER "OrderItem_immutable" BEFORE UPDATE OR DELETE ON "OrderItem"
FOR EACH ROW EXECUTE FUNCTION prevent_commerce_snapshot_change();
CREATE TRIGGER "Receipt_immutable" BEFORE UPDATE OR DELETE ON "Receipt"
FOR EACH ROW EXECUTE FUNCTION prevent_commerce_snapshot_change();
INSERT INTO "Permission" ("code") VALUES ('commerce:reconcile'), ('commerce:refund'), ('commerce:refund-approve'), ('commerce:refund-process');
INSERT INTO "RolePermission" ("roleCode","permissionCode") VALUES
  ('ADMIN','commerce:reconcile'), ('ADMIN','commerce:refund'),
  ('SUPER_ADMIN','commerce:reconcile'), ('SUPER_ADMIN','commerce:refund'),
  ('SUPER_ADMIN','commerce:refund-approve'), ('SUPER_ADMIN','commerce:refund-process');
COMMIT;
