BEGIN;
-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('HOME', 'BANNER', 'FAQ', 'ABOUT', 'CONTACT', 'BLOG', 'LEGAL');

-- CreateTable
CREATE TABLE "ContentEntry" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialAudit" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogMetric" (
    "key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CatalogMetric_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentEntry_slug_key" ON "ContentEntry"("slug");

-- CreateIndex
CREATE INDEX "ContentEntry_kind_publishedAt_idx" ON "ContentEntry"("kind", "publishedAt");

-- CreateIndex
CREATE INDEX "EditorialAudit_createdAt_idx" ON "EditorialAudit"("createdAt");

-- CreateIndex
CREATE INDEX "CatalogMetric_day_event_idx" ON "CatalogMetric"("day", "event");

INSERT INTO "Permission" ("code") VALUES ('content:manage'), ('analytics:read'), ('analytics:export');
INSERT INTO "RolePermission" ("roleCode", "permissionCode") VALUES
  ('ADMIN', 'content:manage'), ('ADMIN', 'analytics:read'),
  ('SUPER_ADMIN', 'content:manage'), ('SUPER_ADMIN', 'analytics:read'), ('SUPER_ADMIN', 'analytics:export');
COMMIT;
