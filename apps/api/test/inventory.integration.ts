import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Listing, ListingInput, Location } from "@marketplace/inventory";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { hashPassword } from "../src/auth/password";
import { createApp } from "../src/bootstrap";

const origin = "http://localhost:3002";
const password = "disposable-inventory-password";

test("staff manage audited inventory and private media through the migrated API", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase2_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = origin;
  const directory = await mkdtemp(join(tmpdir(), "cuv-media-test-"));
  process.env.MEDIA_LOCAL_DIR = directory;

  const prisma = new PrismaClient();
  try {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "inherit" },
    );
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1";
      const passwordHash = await hashPassword(password);
      await prisma.user.createMany({
        data: [
          { email: "staff@example.test", passwordHash },
          { email: "customer@example.test", passwordHash },
        ],
      });
      const staff = await prisma.user.findUniqueOrThrow({
        where: { email: "staff@example.test" },
      });
      await prisma.userRole.create({
        data: { userId: staff.id, roleCode: "ADMIN" },
      });

      function request(
        path: string,
        method = "GET",
        data?: object,
        cookie = "",
      ) {
        const headers: Record<string, string> = { Origin: origin };
        if (cookie) headers.Cookie = cookie;
        if (data && !(data instanceof FormData))
          headers["Content-Type"] = "application/json";
        const body =
          data instanceof FormData ? data : data && JSON.stringify(data);
        return fetch(base + path, {
          method,
          headers,
          ...(body ? { body } : {}),
        });
      }

      async function expect<T>(
        pending: Promise<Response>,
        status: number,
      ): Promise<T> {
        const response = await pending;
        const body = await response.json();
        assert.equal(response.status, status, JSON.stringify(body));
        return body as T;
      }

      async function login(email: string) {
        const response = await request("/auth/login", "POST", {
          email,
          password,
        });
        assert.equal(response.status, 200);
        return response.headers.get("set-cookie")?.split(";")[0] ?? "";
      }

      const staffCookie = await login("staff@example.test");
      const customerCookie = await login("customer@example.test");
      const listingRoot = "/admin/listings";
      const blank: ListingInput = {
        category: "PROPERTY",
        details: {},
        title: "Phase 2 test property",
        description: "",
        currency: "NGN",
        priceMinor: null,
        locationId: null,
        featured: false,
        expiresAt: null,
        verificationScope: "",
      };
      await expect(request(listingRoot, "POST", blank), 401);
      await expect(request(listingRoot, "POST", blank, customerCookie), 403);
      await expect(
        request(
          listingRoot,
          "POST",
          { ...blank, details: { vin: "unexpected" } },
          staffCookie,
        ),
        400,
      );
      const place = await expect<Location>(
        request(
          "/admin/locations",
          "POST",
          { country: "ng", region: "Lagos", city: "Ikeja" },
          staffCookie,
        ),
        201,
      );
      const draft = await expect<Listing>(
        request(listingRoot, "POST", blank, staffCookie),
        201,
      );
      const path = `${listingRoot}/${draft.id}`;
      assert.match(draft.reference, /^PROP-\d{4}-[A-F0-9]{6}$/);
      await expect(
        request(
          path + "/actions",
          "POST",
          { action: "publish", version: draft.version },
          staffCookie,
        ),
        400,
      );
      const input = {
        ...blank,
        description: "A synthetic property for HTTP tests.",
        locationId: place.id,
        priceMinor: "999999999999999",
        details: { propertyType: "RESIDENTIAL", offer: "RENT", bedrooms: 2 },
      };
      const ready = await expect<Listing>(
        request(
          path,
          "PATCH",
          { version: draft.version, listing: input },
          staffCookie,
        ),
        200,
      );
      assert.equal(ready.priceMinor, input.priceMinor);
      await expect(
        request(
          path,
          "PATCH",
          { version: draft.version, listing: input },
          staffCookie,
        ),
        409,
      );

      function upload(bytes: Uint8Array, version: number, alt: string) {
        const form = new FormData();
        form.set(
          "file",
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          "fixture.png",
        );
        form.set("version", String(version));
        form.set("alt", alt);
        return request(path + "/media", "POST", form, staffCookie);
      }
      await expect(
        upload(Buffer.from("not an image"), ready.version, "Invalid file"),
        400,
      );
      const png = await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#30554a" },
      })
        .png()
        .toBuffer();
      const first = await expect<Listing>(
        upload(png, ready.version, "First photo"),
        201,
      );
      const cover = first.media[0];
      assert.ok(cover?.cover);
      const second = await expect<Listing>(
        upload(png, first.version, "Second photo"),
        201,
      );
      const other = second.media[1];
      assert.ok(other);
      const ordered = await expect<Listing>(
        request(
          path + "/media",
          "PATCH",
          {
            version: second.version,
            items: [
              { id: other.id, cover: true, alt: "New cover" },
              { id: cover.id, cover: false, alt: "First photo" },
            ],
          },
          staffCookie,
        ),
        200,
      );
      assert.equal(ordered.media[0]?.id, other.id);
      await expect(
        request(path + "/media/" + other.id, "GET", undefined, customerCookie),
        403,
      );
      const file = await request(
        path + "/media/" + other.id,
        "GET",
        undefined,
        staffCookie,
      );
      assert.equal(file.headers.get("content-type"), "image/webp");
      assert.equal(
        (await sharp(Buffer.from(await file.arrayBuffer())).metadata()).width,
        4,
      );

      const published = await expect<Listing>(
        request(
          path + "/actions",
          "POST",
          { action: "publish", version: ordered.version },
          staffCookie,
        ),
        200,
      );
      assert.equal(published.status, "PUBLISHED");
      await expect(
        request(
          path + "/media/" + other.id,
          "DELETE",
          { version: published.version },
          staffCookie,
        ),
        400,
      );
      await expect(
        request(
          path + "/actions",
          "POST",
          { action: "sell", version: published.version },
          staffCookie,
        ),
        409,
      );
      const secondDraft = await expect<Listing>(
        request(
          listingRoot,
          "POST",
          {
            ...blank,
            category: "SERVICE",
            details: { pricingModel: "QUOTE" },
            title: "Phase 2 test service",
          },
          staffCookie,
        ),
        201,
      );
      await expect(
        request(
          listingRoot + "/bulk",
          "POST",
          {
            action: "archive",
            listings: [
              { id: published.id, version: published.version },
              { id: secondDraft.id, version: secondDraft.version + 1 },
            ],
          },
          staffCookie,
        ),
        409,
      );
      const stillPublished = await expect<Listing>(
        request(path, "GET", undefined, staffCookie),
        200,
      );
      assert.equal(stillPublished.status, "PUBLISHED");
      await expect(
        request(
          listingRoot + "/bulk",
          "POST",
          {
            action: "feature",
            listings: [{ id: published.id, version: published.version }],
          },
          staffCookie,
        ),
        200,
      );
      const filtered = await expect<{ total: number; items: Listing[] }>(
        request(
          listingRoot +
            "?category=PROPERTY&status=PUBLISHED&featured=true&q=phase",
          "GET",
          undefined,
          staffCookie,
        ),
        200,
      );
      assert.equal(filtered.total, 1);
      assert.equal(filtered.items[0]?.id, draft.id);
      const history = await expect<Array<{ action: string; actorId: string }>>(
        request(path + "/audit", "GET", undefined, staffCookie),
        200,
      );
      assert.deepEqual(history.map(({ action }) => action).sort(), [
        "CREATE",
        "FEATURE",
        "MEDIA_REORDER",
        "MEDIA_UPLOAD",
        "MEDIA_UPLOAD",
        "PUBLISH",
        "UPDATE",
      ]);
      assert.ok(history.every(({ actorId }) => actorId === staff.id));
      await prisma.rolePermission.delete({
        where: {
          roleCode_permissionCode: {
            roleCode: "ADMIN",
            permissionCode: "inventory:write",
          },
        },
      });
      await expect(request(listingRoot, "POST", blank, staffCookie), 403);
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
