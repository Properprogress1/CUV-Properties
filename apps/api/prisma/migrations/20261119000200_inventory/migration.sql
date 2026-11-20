BEGIN;

-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('PROPERTY', 'LAND', 'VEHICLE', 'SERVICE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'RESERVED', 'SOLD', 'RENTED', 'COMPLETED', 'ARCHIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaState" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "locationId" UUID,
    "currency" CHAR(3) NOT NULL,
    "priceMinor" BIGINT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "verificationScope" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "publishedById" UUID,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDetails" (
    "listingId" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "PropertyDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "LandDetails" (
    "listingId" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "LandDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "VehicleDetails" (
    "listingId" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "VehicleDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "ServiceDetails" (
    "listingId" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ServiceDetails_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "ListingMedia" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "state" "MediaState" NOT NULL DEFAULT 'PROCESSING',
    "alt" TEXT NOT NULL,
    "cover" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAudit" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_key_key" ON "Location"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_reference_key" ON "Listing"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE INDEX "Listing_status_category_updatedAt_idx" ON "Listing"("status", "category", "updatedAt");

-- CreateIndex
CREATE INDEX "Listing_locationId_idx" ON "Listing"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingMedia_objectKey_key" ON "ListingMedia"("objectKey");

-- CreateIndex
CREATE INDEX "ListingMedia_listingId_position_idx" ON "ListingMedia"("listingId", "position");

-- CreateIndex
CREATE INDEX "ListingAudit_listingId_createdAt_idx" ON "ListingAudit"("listingId", "createdAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDetails" ADD CONSTRAINT "PropertyDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandDetails" ADD CONSTRAINT "LandDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDetails" ADD CONSTRAINT "VehicleDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDetails" ADD CONSTRAINT "ServiceDetails_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAudit" ADD CONSTRAINT "ListingAudit_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAudit" ADD CONSTRAINT "ListingAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE UNIQUE INDEX "ListingMedia_one_cover" ON "ListingMedia" ("listingId") WHERE "cover";
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_price_nonnegative" CHECK ("priceMinor" >= 0);
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_cover_image" CHECK (NOT "cover" OR ("kind" = 'IMAGE' AND "state" = 'READY'));

INSERT INTO "Permission" ("code") VALUES ('inventory:read'), ('inventory:write'), ('inventory:publish'), ('inventory:media'), ('inventory:audit');
INSERT INTO "RolePermission" ("roleCode", "permissionCode")
SELECT roles.code, permissions.code
FROM (VALUES ('ADMIN'), ('SUPER_ADMIN')) AS roles(code)
CROSS JOIN (VALUES ('inventory:read'), ('inventory:write'), ('inventory:publish'), ('inventory:media'), ('inventory:audit')) AS permissions(code);

COMMIT;
