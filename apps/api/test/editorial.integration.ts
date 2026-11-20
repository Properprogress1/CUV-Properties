import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/bootstrap";
import { hashPassword } from "../src/auth/password";

test("editorial drafts stay private and reporting protects and sanitizes exports", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = "phase7_" + randomUUID().replaceAll("-", "");
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  const origin = "http://localhost:3002";
  process.env.API_ALLOWED_ORIGINS = origin;
  const directory = await mkdtemp(join(tmpdir(), "cuv-editorial-test-"));
  process.env.MEDIA_LOCAL_DIR = directory;
  const prisma = new PrismaClient();
  try {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdio: "inherit" },
    );
    execFileSync(process.execPath, ["dist/prisma/seed-demo.js"], {
      env: { ...process.env, NODE_ENV: "development" },
    });
    await prisma.listing.update({
      where: { slug: "demo-property" },
      data: { isDemo: false, title: "=2+2" },
    });
    const password = "synthetic-editorial-password";
    const passwordHash = await hashPassword(password);
    for (const [name, roleCode] of [
      ["editor", "ADMIN"],
      ["owner", "SUPER_ADMIN"],
      ["visitor", "CUSTOMER"],
    ] as const) {
      await prisma.user.create({
        data: {
          email: name + "@editorial.example.test",
          passwordHash,
          roles: { create: { roleCode } },
        },
      });
    }
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1";
      function call(
        path: string,
        method = "GET",
        body?: object,
        cookie?: string,
      ) {
        return fetch(base + path, {
          method,
          headers: {
            Origin: origin,
            ...(cookie && { Cookie: cookie }),
            ...(body && { "Content-Type": "application/json" }),
          },
          ...(body && { body: JSON.stringify(body) }),
        });
      }
      async function expect<T>(
        pending: Promise<Response>,
        status = 200,
      ): Promise<T> {
        const response = await pending;
        const text = await response.text();
        assert.equal(response.status, status, text);
        return text ? (JSON.parse(text) as T) : (undefined as T);
      }
      async function login(name: string) {
        const response = await call("/auth/login", "POST", {
          email: name + "@editorial.example.test",
          password,
        });
        assert.equal(response.status, 200);
        return response.headers.get("set-cookie")?.split(";")[0] ?? "";
      }
      const editor = await login("editor");
      const owner = await login("owner");
      const visitor = await login("visitor");
      const draft = {
        title: "About CUV",
        body: "Published copy.",
        summary: "",
        linkLabel: "",
        linkHref: "",
        seoTitle: "",
        seoDescription: "",
      };
      await expect(
        call(
          "/admin/content",
          "POST",
          { slug: "about", kind: "ABOUT", draft },
          visitor,
        ),
        403,
      );
      await expect(
        call(
          "/admin/content",
          "POST",
          {
            slug: "about",
            kind: "ABOUT",
            draft: {
              ...draft,
              linkLabel: "Link",
              linkHref: "//external.example",
            },
          },
          editor,
        ),
        400,
      );
      await expect(
        call(
          "/admin/content",
          "POST",
          { slug: "about", kind: "ABOUT", draft },
          editor,
        ),
        201,
      );
      await expect(call("/content/about"), 404);
      const publish = (version: number, action: string) =>
        call(
          "/admin/content/about/publication",
          "POST",
          { version, action },
          editor,
        );
      await expect(publish(0, "publish"));
      await expect(
        call(
          "/admin/content/about",
          "PATCH",
          { version: 1, draft: { ...draft, body: "Unpublished draft." } },
          editor,
        ),
      );
      await expect(publish(1, "publish"), 409);
      const publicPage = await expect<{ content: { body: string } }>(
        call("/content/about"),
      );
      assert.equal(publicPage.content.body, "Published copy.");
      assert.doesNotMatch(JSON.stringify(publicPage), /draft|Unpublished/);
      await expect(publish(2, "unpublish"));
      await expect(call("/content/about"), 404);
      for (const event of [
        { event: "VIEW", slug: "demo-property" },
        { event: "VIEW", slug: "demo-property" },
        { event: "CONTACT", slug: "demo-property" },
        { event: "VIEW", slug: "demo-land" },
        { event: "ZERO_RESULTS", category: "LAND" },
      ]) {
        await expect(call("/analytics/events", "POST", event), 204);
      }
      await expect(
        call("/analytics/events", "POST", {
          event: "SEARCH",
          query: "personal data",
        }),
        400,
      );
      await expect(call("/admin/reports", "GET", undefined, visitor), 403);
      await expect(
        call("/admin/reports?from=2026-02-30", "GET", undefined, editor),
        400,
      );
      const report = await expect<{
        traffic: { event: string; category: string; _sum: { count: number } }[];
      }>(call("/admin/reports", "GET", undefined, editor));
      assert.deepEqual(
        report.traffic
          .map(({ category, event, _sum }) => [category, event, _sum.count])
          .sort(),
        [
          ["LAND", "ZERO_RESULTS", 1],
          ["PROPERTY", "CONTACT", 1],
          ["PROPERTY", "VIEW", 2],
        ],
      );
      await expect(
        call("/admin/reports/summary.csv", "GET", undefined, editor),
        403,
      );
      const reportExport = await call(
        "/admin/reports/summary.csv",
        "GET",
        undefined,
        owner,
      );
      assert.equal(reportExport.status, 200);
      assert.match(
        await reportExport.text(),
        /"traffic","PROPERTY","VIEW","2"/,
      );
      const exportResult = await call(
        "/admin/reports/inventory.csv?category=PROPERTY",
        "GET",
        undefined,
        owner,
      );
      assert.equal(exportResult.status, 200);
      const csv = await exportResult.text();
      assert.match(csv, /"'=2\+2"/);
      assert.doesNotMatch(csv, /email|@editorial|VIN|Hillside/i);
      assert.equal(await prisma.editorialAudit.count(), 6);
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
