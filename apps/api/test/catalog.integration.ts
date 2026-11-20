import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { CatalogPage, PublicListing } from "@marketplace/inventory";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/bootstrap";

test("public catalog exposes only approved active inventory and scoped media", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase3_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = "http://localhost:3000";
  const directory = await mkdtemp(join(tmpdir(), "cuv-catalog-test-"));
  process.env.MEDIA_LOCAL_DIR = directory;
  const prisma = new PrismaClient();
  try {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "inherit" },
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, ["dist/prisma/seed-demo.js"], {
        env: { ...process.env, NODE_ENV: "development" },
        stdio: "inherit",
      });
    }
    const vehicle = await prisma.listing.findUniqueOrThrow({
      where: { slug: "demo-vehicle" },
      include: { vehicle: true },
    });
    await prisma.vehicleDetails.update({
      where: { listingId: vehicle.id },
      data: {
        data: {
          ...(vehicle.vehicle?.data as Record<string, string | number>),
          vin: "SECRET12345",
          adminMemo: "Internal-only",
        },
      },
    });
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1/listings";
      const get = (path = "") => fetch(base + path);
      async function expect<T>(path = "", status = 200): Promise<T> {
        const response = await get(path);
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
        return body as T;
      }
      const all = await expect<CatalogPage>();
      assert.equal(all.total, 4);
      assert.equal(new Set(all.items.map(({ category }) => category)).size, 4);
      assert.ok(all.items.every(({ isDemo }) => isDemo));
      assert.equal(
        (await expect<CatalogPage>("?q=EXAMPLE%20MOTORS")).items[0]?.slug,
        "demo-vehicle",
      );
      assert.equal((await expect<CatalogPage>("?q=SECRET12345")).total, 0);
      assert.equal(
        (
          await expect<CatalogPage>(
            "?category=PROPERTY&city=lekki&bedrooms=4&offer=SALE",
          )
        ).total,
        1,
      );
      assert.equal(
        (await expect<CatalogPage>("?category=PROPERTY&bedrooms=5")).total,
        0,
      );
      assert.equal(
        (await expect<CatalogPage>("?category=LAND&areaUnit=SQM&minArea=820"))
          .total,
        1,
      );
      assert.equal(
        (await expect<CatalogPage>("?category=SERVICE&pricingModel=QUOTE"))
          .total,
        1,
      );
      assert.equal(
        (
          await expect<CatalogPage>(
            "?sort=price-low&minPrice=2000000000&maxPrice=3000000000",
          )
        ).items[0]?.slug,
        "demo-vehicle",
      );
      const first = await expect<CatalogPage>("?pageSize=1&sort=featured");
      const next = await expect<CatalogPage>(
        "?pageSize=1&sort=featured&page=2",
      );
      assert.equal(first.items.length, 1);
      assert.notEqual(first.items[0]?.slug, next.items[0]?.slug);
      assert.equal(first.items[0]?.featured, true);
      await expect("?category=LAND&bedrooms=3", 400);
      await expect("?minPrice=100&maxPrice=50", 400);
      await expect("?pageSize=999", 400);
      const detail = await expect<PublicListing>("/demo-vehicle");
      assert.equal("vin" in detail.details, false);
      assert.equal("adminMemo" in detail.details, false);
      for (const field of ["id", "version", "createdById", "publishedById"])
        assert.equal(field in detail, false);
      const cover = detail.media[0];
      assert.ok(cover);
      const asset = await get("/demo-vehicle/media/" + cover.id);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get("content-type"), "image/webp");
      assert.match(asset.headers.get("cache-control") ?? "", /no-store/);
      await asset.arrayBuffer();
      await expect("/demo-property/media/" + cover.id, 404);
      await prisma.listing.update({
        where: { slug: "demo-vehicle" },
        data: { status: "RESERVED" },
      });
      await prisma.listing.update({
        where: { slug: "demo-property" },
        data: { expiresAt: new Date(0) },
      });
      await prisma.listing.update({
        where: { slug: "demo-land" },
        data: { publishedAt: new Date(Date.now() + 3600000) },
      });
      await expect("/demo-vehicle", 404);
      await expect("/demo-property", 404);
      await expect("/demo-land", 404);
      await expect("/demo-vehicle/media/" + cover.id, 404);
      assert.equal((await expect<CatalogPage>()).total, 1);
      process.env.NODE_ENV = "production";
      try {
        assert.equal((await expect<CatalogPage>()).total, 0);
        await expect("/demo-service", 404);
      } finally {
        process.env.NODE_ENV = "test";
      }
      for (const status of ["DRAFT", "UNPUBLISHED", "ARCHIVED"] as const) {
        await prisma.listing.update({
          where: { slug: "demo-service" },
          data: { status },
        });
        await expect("/demo-service", 404);
        assert.equal((await expect<CatalogPage>()).total, 0);
      }
    } finally {
      await app.close();
    }
  } finally {
    try {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
    } finally {
      await prisma.$disconnect();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
