import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password";
import { createApp } from "../src/bootstrap";

const origin = "http://localhost:3000";
const password = "disposable-commerce-password";

test("verified payments settle once, issue owner-only receipts and reconcile refunds", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase5_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = origin;
  const directory = await mkdtemp(join(tmpdir(), "cuv-commerce-test-"));
  process.env.MEDIA_LOCAL_DIR = directory;
  const secret = randomBytes(32).toString("hex");
  process.env.PAYMENT_SANDBOX_ENABLED = "true";
  process.env.PAYMENT_SANDBOX_SECRET = secret;
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
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { slug: "demo-service" },
      include: { service: true },
    });
    const details = listing.service?.data as Record<string, string>;
    const slug = "sandbox-fixed-service";
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        slug,
        isDemo: false,
        priceMinor: 100000n,
        title: "Sandbox planning service",
        service: { update: { data: { ...details, pricingModel: "FIXED" } } },
      },
    });
    const passwords = await hashPassword(password);
    for (const [email, roleCode] of [
      ["cuv-commerce-owner@example.test", "CUSTOMER"],
      ["cuv-commerce-other@example.test", "CUSTOMER"],
      ["cuv-commerce-admin@example.test", "ADMIN"],
      ["cuv-commerce-super@example.test", "SUPER_ADMIN"],
    ] as const) {
      await prisma.user.create({
        data: {
          email,
          passwordHash: passwords,
          roles: { create: { roleCode } },
        },
      });
    }
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1";
      const endpoint = "/commerce";
      const staffPath = "/admin/commerce";
      const request = (
        path: string,
        method = "GET",
        body?: object,
        cookie = "",
      ) =>
        fetch(base + path, {
          method,
          headers: {
            Origin: origin,
            ...(cookie && { Cookie: cookie }),
            ...(body && { "Content-Type": "application/json" }),
          },
          ...(body && { body: JSON.stringify(body) }),
        });
      async function check<T>(
        pending: Promise<Response>,
        status = 200,
      ): Promise<T> {
        const response = await pending;
        const text = await response.text();
        assert.equal(response.status, status, text);
        return text ? (JSON.parse(text) as T) : (undefined as T);
      }
      async function login(account: string) {
        const result = await request("/auth/login", "POST", {
          email: "cuv-commerce-" + account + "@example.test",
          password,
        });
        assert.equal(result.status, 200);
        return (result.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      }
      const owner = await login("owner");
      const other = await login("other");
      const admin = await login("admin");
      const superAdmin = await login("super");
      const readiness = await check<{ available: boolean }>(
        request(endpoint + "/offers/" + slug),
      );
      assert.equal(readiness.available, true);
      assert.equal(
        (
          await check<{ available: boolean }>(
            request(endpoint + "/offers/demo-land"),
          )
        ).available,
        false,
      );
      await check(
        request(endpoint + "/checkout", "POST", { slug, key: randomUUID() }),
        401,
      );
      await check(
        request(
          endpoint + "/checkout",
          "POST",
          { slug, key: randomUUID(), amountMinor: "1" },
          owner,
        ),
        400,
      );
      await check(
        request(
          endpoint + "/checkout",
          "POST",
          { slug: "demo-land", key: randomUUID() },
          owner,
        ),
        404,
      );

      type Checkout = {
        orderReference: string;
        paymentReference: string;
        amountMinor: string;
      };
      type Status = { status: string; receipt: { reference: string } | null };
      const checkout = (key: string = randomUUID()) =>
        check<Checkout>(
          request(endpoint + "/checkout", "POST", { slug, key }, owner),
          201,
        );
      const key = randomUUID();
      const [first, repeated] = await Promise.all([
        checkout(key),
        checkout(key.toUpperCase()),
      ]);
      assert.equal(first.paymentReference, repeated.paymentReference);
      assert.equal(first.amountMinor, "100000");
      await assert.rejects(
        prisma.orderItem.updateMany({
          where: { order: { reference: first.orderReference } },
          data: { title: "Attempted snapshot edit" },
        }),
        /Commerce snapshots are immutable/,
      );
      await prisma.listing.update({
        where: { id: listing.id },
        data: { priceMinor: 150000n, title: "Changed service name" },
      });
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { reference: first.paymentReference },
      });
      const paymentPath = endpoint + "/payments/" + first.paymentReference;
      await check(request(paymentPath, "GET", undefined, other), 404);
      await check(
        request(
          endpoint + "/sandbox/" + first.paymentReference + "/outcome",
          "POST",
          { outcome: "SUCCEEDED" },
          other,
        ),
        404,
      );
      const outcome = (ref: string, result: string) =>
        check<Status>(
          request(
            endpoint + "/sandbox/" + ref + "/outcome",
            "POST",
            { outcome: result },
            owner,
          ),
        );
      assert.equal(
        (await outcome(first.paymentReference, "PENDING")).receipt,
        null,
      );
      const event = {
        id: randomUUID(),
        providerReference: payment.providerReference,
        paymentReference: payment.reference,
        status: "SUCCEEDED",
        amountMinor: "100000",
        currency: "NGN",
        occurredAt: new Date().toISOString(),
      };
      function webhook(
        payload: typeof event,
        opts: { bogus?: boolean; stale?: boolean } = {},
      ) {
        const raw = JSON.stringify(payload);
        const timestamp = String(
          Math.floor(Date.now() / 1000) - (opts.stale ? 601 : 0),
        );
        const signature = opts.bogus
          ? "0".repeat(64)
          : createHmac("sha256", secret)
              .update(timestamp + "." + raw)
              .digest("hex");
        return fetch(base + "/payments/webhook/sandbox", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Timestamp": timestamp,
            "X-Payment-Signature": signature,
          },
          body: raw,
        });
      }
      await check(webhook(event, { bogus: true }), 401);
      await check(webhook(event, { stale: true }), 401);
      for (const detail of [
        { amountMinor: "1" },
        { currency: "USD" },
        { paymentReference: "PAY-2026-0000000000000000" },
      ]) {
        assert.equal(
          (
            await check<{ disposition: string }>(
              webhook({ ...event, ...detail, id: randomUUID() }),
            )
          ).disposition,
          "REJECTED",
        );
      }
      assert.equal(
        (await check<Status>(request(paymentPath, "GET", undefined, owner)))
          .status,
        "PENDING",
      );
      const delivered = await Promise.all(
        [webhook(event), webhook(event)].map((response) =>
          check<{ duplicate: boolean }>(response),
        ),
      );
      assert.deepEqual(delivered.map(({ duplicate }) => duplicate).sort(), [
        false,
        true,
      ]);
      await check(webhook({ ...event, amountMinor: "120000" }), 409);
      const settled = await check<Status>(
        request(paymentPath, "GET", undefined, owner),
      );
      assert.equal(settled.status, "SUCCEEDED");
      assert.ok(settled.receipt);
      assert.equal(await prisma.receipt.count(), 1);
      const receiptPath =
        endpoint + "/receipts/" + settled.receipt.reference + ".pdf";
      await check(request(receiptPath, "GET", undefined, other), 404);
      const receipt = await request(receiptPath, "GET", undefined, owner);
      assert.equal(receipt.status, 200);
      assert.equal(receipt.headers.get("content-type"), "application/pdf");
      const pdf = await receipt.text();
      assert.match(pdf, /^%PDF-1\.4/);
      assert.match(pdf, /Sandbox planning service/);
      assert.match(pdf, /NGN 100000 minor units/);
      assert.match(pdf, /no funds were charged/);

      const failed = await checkout();
      assert.equal(failed.amountMinor, "150000");
      assert.equal(
        (await outcome(failed.paymentReference, "FAILED")).status,
        "FAILED",
      );
      const second = await check<Checkout>(
        request(
          endpoint + "/orders/" + failed.orderReference + "/payments",
          "POST",
          { key: randomUUID() },
          owner,
        ),
        201,
      );
      assert.equal(
        (await outcome(second.paymentReference, "CANCELLED")).status,
        "CANCELLED",
      );
      const timeout = await checkout();
      const timeoutRow = await prisma.payment.findUniqueOrThrow({
        where: { reference: timeout.paymentReference },
      });
      await prisma.payment.update({
        where: { id: timeoutRow.id },
        data: { expiresAt: new Date(0) },
      });
      assert.equal(
        (await outcome(timeout.paymentReference, "TIMED_OUT")).status,
        "TIMED_OUT",
      );
      const unreconciled = await checkout();
      const stranded = await prisma.payment.findUniqueOrThrow({
        where: { reference: unreconciled.paymentReference },
      });
      await prisma.sandboxOutcome.create({
        data: {
          paymentId: stranded.id,
          eventId: randomUUID(),
          status: "SUCCEEDED",
        },
      });
      await check(
        request(staffPath + "/payments", "GET", undefined, owner),
        403,
      );
      const report = await check<{ exceptions: unknown[] }>(
        request(staffPath + "/payments", "GET", undefined, admin),
      );
      assert.equal(report.exceptions.length, 3);
      const reconcile = await check<{ status: string }>(
        request(
          staffPath +
            "/payments/" +
            unreconciled.paymentReference +
            "/reconcile",
          "POST",
          undefined,
          admin,
        ),
      );
      assert.equal(reconcile.status, "SUCCEEDED");

      const refund = (amountMinor: string, actor = owner, key = randomUUID()) =>
        request(
          paymentPath + "/refunds",
          "POST",
          { key, amountMinor, reason: "Synthetic refund request" },
          actor,
        );
      await check(refund("40000", other), 404);
      await check(refund("100001"), 400);
      const refundKey = randomUUID();
      const partial = await check<{ reference: string }>(
        refund("40000", owner, refundKey),
        201,
      );
      assert.equal(
        (
          await check<{ reference: string }>(
            refund("40000", owner, refundKey),
            201,
          )
        ).reference,
        partial.reference,
      );
      const action = (
        ref: string,
        action: string,
        cookie: string,
        sandboxOutcome?: string,
      ) =>
        request(
          staffPath + "/refunds/" + ref + "/actions",
          "POST",
          { action, ...(sandboxOutcome && { sandboxOutcome }) },
          cookie,
        );
      await check(action(partial.reference, "approve", admin), 403);
      await check(action(partial.reference, "process", superAdmin), 409);
      await check(action(partial.reference, "approve", superAdmin));
      assert.equal(
        (
          await check<{ status: string }>(
            action(partial.reference, "process", superAdmin),
          )
        ).status,
        "SUCCEEDED",
      );
      const remaining = await check<{ reference: string }>(
        refund("60000"),
        201,
      );
      await check(action(remaining.reference, "approve", superAdmin));
      assert.equal(
        (
          await check<{ status: string }>(
            action(remaining.reference, "process", superAdmin, "FAILED"),
          )
        ).status,
        "FAILED",
      );
      const full = await check<{ reference: string }>(refund("60000"), 201);
      await check(action(full.reference, "approve", superAdmin));
      await check(action(full.reference, "process", superAdmin));
      await check(action(full.reference, "process", superAdmin));
      assert.equal(
        (
          await prisma.order.findUniqueOrThrow({
            where: { reference: first.orderReference },
          })
        ).status,
        "REFUNDED",
      );
      assert.equal(
        (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
          .status,
        "SUCCEEDED",
      );
      assert.equal(
        (
          await check<unknown[]>(
            request(endpoint + "/orders", "GET", undefined, other),
          )
        ).length,
        0,
      );
      const history = await check(
        request(endpoint + "/orders", "GET", undefined, owner),
      );
      assert.doesNotMatch(
        JSON.stringify(history),
        /checkoutKey|initializeKey|digest|requestedById/,
      );
      assert.ok(
        (await prisma.commerceAudit.count({
          where: { action: "REFUND_SUCCEEDED" },
        })) === 2,
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
