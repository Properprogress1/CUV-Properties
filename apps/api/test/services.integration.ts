import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/bootstrap";
import { hashPassword } from "../src/auth/password";

const origin = "http://localhost:3000";
const password = "disposable-services-password";

test("service quotes are versioned and owner-scoped, and projects reuse verified checkout", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase6_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = origin;
  process.env.PAYMENT_SANDBOX_ENABLED = "true";
  process.env.PAYMENT_SANDBOX_SECRET = randomBytes(32).toString("hex");
  const directory = await mkdtemp(join(tmpdir(), "cuv-services-test-"));
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
      where: { slug: "demo-service" },
      data: { isDemo: false },
    });
    const passwordHash = await hashPassword(password);
    for (const [name, roleCode] of [
      ["owner", "CUSTOMER"],
      ["other", "CUSTOMER"],
      ["staff", "ADMIN"],
    ] as const) {
      await prisma.user.create({
        data: {
          email: `${name}-service@example.test`,
          passwordHash,
          roles: { create: { roleCode } },
        },
      });
    }
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1";
      const customer = "/account/services";
      const staffRoute = "/admin/services";
      function request(
        path: string,
        method = "GET",
        data?: object,
        cookie = "",
      ) {
        return fetch(base + path, {
          method,
          headers: {
            Origin: origin,
            ...(cookie && { Cookie: cookie }),
            ...(data && { "Content-Type": "application/json" }),
          },
          ...(data && { body: JSON.stringify(data) }),
        });
      }
      async function expect<T>(
        promise: Promise<Response>,
        status = 200,
      ): Promise<T> {
        const response = await promise;
        const text = await response.text();
        assert.equal(response.status, status, text);
        return JSON.parse(text) as T;
      }
      async function login(name: string) {
        const response = await request("/auth/login", "POST", {
          email: `${name}-service@example.test`,
          password,
        });
        assert.equal(response.status, 200);
        return response.headers.get("set-cookie")?.split(";")[0] ?? "";
      }
      const owner = await login("owner");
      const other = await login("other");
      const staff = await login("staff");
      const data = {
        slug: "demo-service",
        scope:
          "Prepare a planning feasibility review for an illustrative site.",
        location: "Lagos",
        timeline: "Within two months",
        budgetMinor: "100000",
        currency: "NGN",
      };
      await expect(request(customer, "POST", data), 401);
      await expect(
        request(customer, "POST", { ...data, slug: "demo-property" }, owner),
        404,
      );
      const created = await expect<{ reference: string }>(
        request(customer, "POST", data, owner),
        201,
      );
      const ownerPath = customer + "/" + created.reference;
      const staffPath = staffRoute + "/" + created.reference;
      await expect(request(staffRoute, "GET", undefined, owner), 403);
      assert.deepEqual(
        await expect(request(customer, "GET", undefined, other)),
        [],
      );
      await expect(
        request(
          ownerPath + "/replies",
          "POST",
          { message: "Cross-user test" },
          other,
        ),
        404,
      );
      await expect(
        request(
          staffPath,
          "PATCH",
          {
            version: 0,
            status: "NEEDS_INFORMATION",
            message: "Please describe the site access.",
            assigneeEmail: "staff-service@example.test",
          },
          staff,
        ),
      );
      await expect(
        request(
          ownerPath + "/replies",
          "POST",
          { message: "Road access is available." },
          owner,
        ),
        201,
      );
      const terms = {
        version: 2,
        currency: "NGN",
        terms: "Initial review and a written report.",
        timeline: "Two weeks",
        validUntil: new Date(Date.now() + 4 * 86400000).toISOString(),
        lines: [
          { title: "Survey review", quantity: 2, unitAmountMinor: "24000" },
          {
            title: "Feasibility report",
            quantity: 1,
            unitAmountMinor: "32000",
          },
        ],
      };
      type Quote = { reference: string; revision: number };
      await expect(
        request(
          staffPath + "/quotes",
          "POST",
          { ...terms, validUntil: new Date(0).toISOString() },
          staff,
        ),
        400,
      );
      const first = await expect<Quote>(
        request(staffPath + "/quotes", "POST", terms, staff),
        201,
      );
      await expect(request(staffPath + "/quotes", "POST", terms, staff), 409);
      const put = (quote: Quote, action: "reject" | "accept", cookie = owner) =>
        request(
          ownerPath + "/quotes/" + quote.reference + "/decision",
          "POST",
          { action },
          cookie,
        );
      const second = await expect<Quote>(
        request(staffPath + "/quotes", "POST", { ...terms, version: 3 }, staff),
        201,
      );
      assert.equal(second.revision, 2);
      await expect(put(first, "accept"), 409);
      await expect(put(second, "reject"), 201);
      const third = await expect<Quote>(
        request(staffPath + "/quotes", "POST", { ...terms, version: 5 }, staff),
        201,
      );
      await prisma.serviceQuote.update({
        where: { reference: third.reference },
        data: { validUntil: new Date(0) },
      });
      await expect(put(third, "accept"), 409);
      const fourth = await expect<Quote>(
        request(staffPath + "/quotes", "POST", { ...terms, version: 6 }, staff),
        201,
      );
      await expect(put(fourth, "accept", other), 404);
      const decisions = await Promise.all([
        put(fourth, "accept"),
        put(fourth, "accept"),
      ]);
      const [accepted, duplicate] = await Promise.all(
        decisions.map((response) =>
          expect<{ orderReference: string }>(Promise.resolve(response), 201),
        ),
      );
      assert.ok(accepted?.orderReference);
      assert.equal(accepted.orderReference, duplicate?.orderReference);
      const order = await prisma.order.findUniqueOrThrow({
        where: { reference: accepted.orderReference },
        include: { items: true },
      });
      assert.equal(order.amountMinor, 80000n);
      assert.equal(order.items.length, 2);
      assert.equal(await prisma.order.count(), 1);
      assert.equal(await prisma.serviceProject.count(), 1);
      const milestone = {
        title: "Scope review",
        dueAt: terms.validUntil,
        status: "PLANNED",
        evidence: null,
        version: 8,
      };
      await expect(
        request(
          staffPath + "/milestones",
          "POST",
          { ...milestone, status: "IN_PROGRESS" },
          staff,
        ),
        409,
      );
      const planned = await expect<{ id: string }>(
        request(staffPath + "/milestones", "POST", milestone, staff),
        201,
      );

      const paymentPath = "/commerce/orders/" + order.reference + "/payments";
      await expect(
        request(paymentPath, "POST", { key: randomUUID() }, other),
        404,
      );
      const payment = await expect<{ paymentReference: string }>(
        request(paymentPath, "POST", { key: randomUUID() }, owner),
        201,
      );
      await expect(
        request(
          "/commerce/sandbox/" + payment.paymentReference + "/outcome",
          "POST",
          { outcome: "SUCCEEDED" },
          owner,
        ),
      );
      const milestonePath = staffPath + "/milestones/" + planned.id;
      await expect(
        request(
          milestonePath,
          "PATCH",
          { ...milestone, status: "COMPLETED", version: 9 },
          staff,
        ),
        400,
      );
      await expect(
        request(
          milestonePath,
          "PATCH",
          {
            ...milestone,
            status: "COMPLETED",
            version: 9,
            evidence: "Review delivered to the customer.",
          },
          staff,
        ),
      );
      await expect(
        request(
          milestonePath,
          "PATCH",
          { ...milestone, status: "PLANNED", version: 10 },
          staff,
        ),
        409,
      );
      const record = await expect(request(customer, "GET", undefined, owner));
      const json = JSON.stringify(record);
      assert.match(json, /Review delivered to the customer/);
      assert.match(json, /Please describe the site access/);
      assert.doesNotMatch(json, /customerId|assigneeId|actorId|passwordHash/);
      assert.equal(
        (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
          .status,
        "PAID",
      );
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
