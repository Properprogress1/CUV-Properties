BEGIN;
ALTER TABLE "Listing" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Listing_public_feed" ON "Listing" ("category", "publishedAt" DESC, "id") WHERE "status" = 'PUBLISHED';
COMMIT;
