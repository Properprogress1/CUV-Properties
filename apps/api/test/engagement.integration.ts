import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/bootstrap";
import { hashPassword } from "../src/auth/password";

const origin = "http://localhost:3000";
const password = "disposable-phase4-password";

test("customer engagement protects ownership and serializes competing bookings", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase4_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = origin;
  const directory = await mkdtemp(join(tmpdir(), "cuv-engagement-test-"));
  process.env.MEDIA_LOCAL_DIR = join(directory, "media");
  process.env.MAIL_LOCAL_DIR = join(directory, "mail");
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
      data: { isDemo: false },
    });
    const staffEmail = "staff-engagement@example.test";
    const aliceEmail = "alice-engagement@example.test";
    const bobEmail = "bob-engagement@example.test";
    const passwordHash = await hashPassword(password);
    for (const [email, roleCode] of [
      [staffEmail, "ADMIN"],
      [aliceEmail, "CUSTOMER"],
      [bobEmail, "CUSTOMER"],
    ] as const) {
      await prisma.user.create({
        data: { email, passwordHash, roles: { create: { roleCode } } },
      });
    }
    const { app } = await createApp(false);
    try {
      await app.listen(0, "127.0.0.1");
      const base = (await app.getUrl()) + "/api/v1";
      const request = (
        path: string,
        method = "GET",
        data?: object,
        cookie = "",
      ) =>
        fetch(base + path, {
          method,
          headers: {
            Origin: origin,
            ...(cookie && { Cookie: cookie }),
            ...(data && { "Content-Type": "application/json" }),
          },
          ...(data && { body: JSON.stringify(data) }),
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
      async function login(email: string, candidate = password) {
        const response = await request("/auth/login", "POST", {
          email,
          password: candidate,
        });
        assert.equal(response.status, 200);
        return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      }

      const alice = await login(aliceEmail);
      const bob = await login(bobEmail);
      const staff = await login(staffEmail);
      const endpoint = "/account";
      await check(
        request(
          endpoint + "/profile",
          "PATCH",
          { displayName: "Alice Test", phone: null, emailUpdates: false },
          alice,
        ),
      );
      assert.equal(
        (
          await check<{ displayName: string }>(
            request(endpoint + "/profile", "GET", undefined, alice),
          )
        ).displayName,
        "Alice Test",
      );
      assert.equal(
        (
          await check<{ displayName: string | null }>(
            request(endpoint + "/profile", "GET", undefined, bob),
          )
        ).displayName,
        null,
      );
      for (let i = 0; i < 2; i++)
        await check(
          request(
            endpoint + "/favourites/demo-property",
            "PUT",
            undefined,
            alice,
          ),
          204,
        );
      assert.equal(
        (
          await check<unknown[]>(
            request(endpoint + "/favourites", "GET", undefined, alice),
          )
        ).length,
        1,
      );
      assert.equal(
        (
          await check<unknown[]>(
            request(endpoint + "/favourites", "GET", undefined, bob),
          )
        ).length,
        0,
      );
      const saved = await check<{ id: string }>(
        request(
          endpoint + "/saved-searches",
          "POST",
          {
            name: "Lekki homes",
            filters: { category: "PROPERTY", bedrooms: 3, page: 3 },
          },
          alice,
        ),
        201,
      );
      await check(
        request(
          endpoint + "/saved-searches/" + saved.id,
          "DELETE",
          undefined,
          bob,
        ),
        404,
      );

      const input = {
        slug: "demo-property",
        name: "Alice Test",
        email: bobEmail,
        channel: "EMAIL",
        message: "Can you share more about this listing?",
        consent: true,
      };
      await check(
        request("/enquiries", "POST", { ...input, consent: false }),
        400,
      );
      await check(
        request("/enquiries", "POST", { ...input, slug: "demo-land" }),
        404,
      );
      const signedLead = await check<{ reference: string }>(
        request("/enquiries", "POST", input, alice),
        201,
      );
      const guestLead = await check<{ reference: string }>(
        request("/enquiries", "POST", input),
        201,
      );
      assert.notEqual(signedLead.reference, guestLead.reference);
      for (let i = 0; i < 2; i++)
        await check(request("/enquiries", "POST", input), i === 0 ? 201 : 429);

      assert.equal(
        (
          await check<unknown[]>(
            request(endpoint + "/enquiries", "GET", undefined, bob),
          )
        ).length,
        0,
      );
      await check(request("/admin/enquiries", "GET", undefined, alice), 403);
      const leads = await check<
        Array<{ id: string; reference: string; email: string; version: number }>
      >(request("/admin/enquiries", "GET", undefined, staff));
      const lead = leads.find(
        (item) => item.reference === signedLead.reference,
      );
      assert.equal(lead?.email, aliceEmail);
      assert.ok(lead);
      const patch = {
        version: lead.version,
        status: "CONTACTED",
        assigneeEmail: staffEmail,
        followUpAt: new Date(Date.now() + 86400000).toISOString(),
        privateNote: "Internal follow-up note",
      };
      const changed = await check(
        request("/admin/enquiries/" + lead.id, "PATCH", patch, staff),
      );
      assert.match(JSON.stringify(changed), /Internal follow-up note/);
      await check(
        request("/admin/enquiries/" + lead.id, "PATCH", patch, staff),
        409,
      );
      const customerLeads = await check(
        request(endpoint + "/enquiries", "GET", undefined, alice),
      );
      assert.doesNotMatch(
        JSON.stringify(customerLeads),
        /Internal follow-up note|assigneeId|activity/,
      );

      const start = new Date(Date.now() + 2 * 86400000);
      const end = new Date(start.getTime() + 3600000);
      const slot = {
        slug: "demo-property",
        notes: "Synthetic viewing request",
        window: {
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          timeZone: "Africa/Lagos",
        },
      };
      type Appointment = { id: string; version: number; status: string };
      await check(
        request(
          endpoint + "/appointments",
          "POST",
          { ...slot, window: { ...slot.window, endsAt: start.toISOString() } },
          alice,
        ),
        400,
      );
      const a = await check<Appointment>(
        request(endpoint + "/appointments", "POST", slot, alice),
        201,
      );
      const b = await check<Appointment>(
        request(endpoint + "/appointments", "POST", slot, bob),
        201,
      );
      await check(
        request(
          endpoint + "/appointments/" + a.id + "/cancel",
          "POST",
          { version: a.version },
          bob,
        ),
        404,
      );
      const attempts = await Promise.all(
        [a, b].map((item) =>
          request(
            "/admin/appointments/" + item.id,
            "PATCH",
            {
              version: item.version,
              status: "CONFIRMED",
              assigneeEmail: staffEmail,
            },
            staff,
          ),
        ),
      );
      assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 409]);
      const aWon = attempts[0]?.status === 200;
      const winner = aWon ? a : b;
      const loser = aWon ? b : a;
      await check(
        request(
          endpoint + "/appointments/" + winner.id + "/cancel",
          "POST",
          { version: winner.version + 1 },
          aWon ? alice : bob,
        ),
      );
      await check(
        request(
          "/admin/appointments/" + loser.id,
          "PATCH",
          {
            version: loser.version,
            status: "CONFIRMED",
            assigneeEmail: staffEmail,
          },
          staff,
        ),
      );
      const inbox = await check<{
        unread: number;
        items: Array<{ id: string }>;
      }>(request(endpoint + "/notifications", "GET", undefined, alice));
      const first = inbox.items[0];
      assert.ok(first && inbox.unread > 0);
      await check(
        request(
          endpoint + "/notifications/" + first.id + "/read",
          "PATCH",
          undefined,
          bob,
        ),
        404,
      );
      await check(
        request(
          endpoint + "/notifications/" + first.id + "/read",
          "PATCH",
          undefined,
          alice,
        ),
        204,
      );
      assert.equal(
        (
          await check<{ unread: number }>(
            request(endpoint + "/notifications", "GET", undefined, alice),
          )
        ).unread,
        inbox.unread - 1,
      );

      await check(
        request(endpoint + "/send-verification", "POST", {}, alice),
        204,
      );
      await check(
        request(endpoint + "/forgot-password", "POST", { email: aliceEmail }),
        204,
      );
      await check(
        request(endpoint + "/forgot-password", "POST", {
          email: "unknown@example.test",
        }),
        204,
      );
      await check(
        request(endpoint + "/forgot-password", "POST", { email: aliceEmail }),
        204,
      );
      assert.equal(await prisma.mailJob.count(), 2);
      const runWorker = () =>
        execFileSync(
          process.execPath,
          ["dist/src/engagement/mail.worker.js", "--once"],
          { stdio: "inherit" },
        );
      await mkdir(process.env.MAIL_LOCAL_DIR);
      runWorker();
      runWorker();
      const names = await readdir(process.env.MAIL_LOCAL_DIR);
      assert.equal(names.length, 2);
      const messages = await Promise.all(
        names.map(
          async (name) =>
            JSON.parse(
              await readFile(join(directory, "mail", name), "utf8"),
            ) as { body: string; to: string },
        ),
      );
      assert.ok(messages.every((item) => item.to === aliceEmail));
      const token = (kind: string) =>
        messages
          .map(
            ({ body }) =>
              body.match(new RegExp("#" + kind + "=([A-Za-z0-9_-]{43})"))?.[1],
          )
          .find(Boolean);
      await check(
        request(endpoint + "/verify-email", "POST", { token: token("verify") }),
        204,
      );
      await check(
        request(endpoint + "/verify-email", "POST", { token: token("verify") }),
        400,
      );
      const newPassword = "new-disposable-phase4-password";
      await check(
        request(endpoint + "/reset-password", "POST", {
          token: token("reset"),
          password: newPassword,
        }),
        204,
      );
      await check(request(endpoint + "/profile", "GET", undefined, alice), 401);
      await check(
        request("/auth/login", "POST", { email: aliceEmail, password }),
        401,
      );
      const renewed = await login(aliceEmail, newPassword);
      assert.ok(
        (
          await check<{ emailVerifiedAt: string }>(
            request(endpoint + "/profile", "GET", undefined, renewed),
          )
        ).emailVerifiedAt,
      );
      assert.equal(
        await prisma.mailJob.count({
          where: { body: "", sentAt: { not: null } },
        }),
        2,
      );
      await check(
        request(endpoint + "/forgot-password", "POST", { email: aliceEmail }),
        204,
      );
      const expiredJob = await prisma.mailJob.findFirstOrThrow({
        where: { sentAt: null },
        select: { body: true },
      });
      const expiredToken = expiredJob.body.match(
        /#reset=([A-Za-z0-9_-]{43})/,
      )?.[1];
      assert.ok(expiredToken);
      await prisma.accountToken.updateMany({
        where: { kind: "RESET_PASSWORD", usedAt: null },
        data: { expiresAt: new Date(0) },
      });
      await check(
        request(endpoint + "/reset-password", "POST", {
          token: expiredToken,
          password,
        }),
        400,
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
