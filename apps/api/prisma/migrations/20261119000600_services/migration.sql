BEGIN;
-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'REVIEWING', 'NEEDS_INFORMATION', 'QUOTED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ServiceQuoteStatus" AS ENUM ('SENT', 'SUPERSEDED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "assigneeId" UUID,
    "listingId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "timeline" TEXT,
    "budgetMinor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUpdate" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuote" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "ServiceQuoteStatus" NOT NULL DEFAULT 'SENT',
    "currency" CHAR(3) NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "terms" TEXT NOT NULL,
    "timeline" TEXT NOT NULL,
    "validUntil" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "orderId" UUID,

    CONSTRAINT "ServiceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuoteLine" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmountMinor" BIGINT NOT NULL,

    CONSTRAINT "ServiceQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProject" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMilestone" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "evidence" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServiceMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_reference_key" ON "ServiceRequest"("reference");

-- CreateIndex
CREATE INDEX "ServiceRequest_customerId_createdAt_idx" ON "ServiceRequest"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_updatedAt_idx" ON "ServiceRequest"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_listingId_idx" ON "ServiceRequest"("listingId");

-- CreateIndex
CREATE INDEX "ServiceRequest_assigneeId_idx" ON "ServiceRequest"("assigneeId");

-- CreateIndex
CREATE INDEX "ServiceUpdate_requestId_createdAt_idx" ON "ServiceUpdate"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_reference_key" ON "ServiceQuote"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_orderId_key" ON "ServiceQuote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_requestId_revision_key" ON "ServiceQuote"("requestId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuoteLine_quoteId_position_key" ON "ServiceQuoteLine"("quoteId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceProject_requestId_key" ON "ServiceProject"("requestId");

-- CreateIndex
CREATE INDEX "ServiceMilestone_projectId_dueAt_idx" ON "ServiceMilestone"("projectId", "dueAt");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUpdate" ADD CONSTRAINT "ServiceUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuoteLine" ADD CONSTRAINT "ServiceQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ServiceQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProject" ADD CONSTRAINT "ServiceProject_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceMilestone" ADD CONSTRAINT "ServiceMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ServiceProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ServiceQuote_one_sent" ON "ServiceQuote" ("requestId") WHERE "status" = 'SENT';
CREATE UNIQUE INDEX "ServiceQuote_one_accepted" ON "ServiceQuote" ("requestId") WHERE "status" = 'ACCEPTED';
ALTER TABLE "ServiceQuoteLine" ADD CHECK ("quantity" > 0 AND "unitAmountMinor" > 0);
ALTER TABLE "ServiceQuote" ADD CHECK ("totalMinor" > 0);
CREATE TRIGGER "ServiceQuoteLine_immutable" BEFORE UPDATE OR DELETE ON "ServiceQuoteLine"
FOR EACH ROW EXECUTE FUNCTION prevent_commerce_snapshot_change();
INSERT INTO "Permission" ("code") VALUES ('services:manage');
INSERT INTO "RolePermission" ("roleCode", "permissionCode") VALUES ('ADMIN', 'services:manage'), ('SUPER_ADMIN', 'services:manage');
COMMIT;
