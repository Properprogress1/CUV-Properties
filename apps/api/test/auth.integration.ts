import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/bootstrap";
import { hashPassword } from "../src/auth/password";

const origin = "http://localhost:3000";
const password = "disposable-test-password";

test("migrated API validates credentials, enforces permissions and isolates sessions", async (context) => {
  assert.equal(process.env.NODE_ENV, "test");
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  const schema = `phase1_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  process.env.API_ALLOWED_ORIGINS = origin;

  const prisma = new PrismaClient();
  context.after(async () => {
    try {
      await prisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
    } finally {
      await prisma.$disconnect();
    }
  });
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "inherit" },
  );

  const { app } = await createApp(false);
  context.after(() => app.close());
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  function request(path: string, options?: RequestInit) {
    return fetch(`${base}/api/v1${path}`, options);
  }
  function post(path: string, body: object, host = origin, cookie?: string) {
    return request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: host,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  async function login(email: string) {
    const response = await post("/auth/login", { email, password });
    assert.equal(response.status, 200);
    const header = response.headers.get("set-cookie") ?? "";
    assert.match(header, /; HttpOnly; SameSite=Lax/);
    const cookie = header.split(";")[0] ?? "";
    const payload = (await response.json()) as { sessionId: string };
    assert.equal(Object.hasOwn(payload, "token"), false);
    return { cookie, sessionId: payload.sessionId };
  }

  const health = await request("/health");
  assert.equal(health.status, 200);
  assert.match(health.headers.get("x-request-id") ?? "", /^[\da-f-]{36}$/);
  const spec = await fetch(`${base}/api/docs-json`);
  assert.equal(spec.status, 200);
  assert.ok((await spec.json()).paths["/api/v1/auth/login"]);

  const preflight = await request("/auth/login", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(
    preflight.headers.get("access-control-allow-credentials"),
    "true",
  );

  assert.equal((await request("/auth/login", { method: "POST" })).status, 403);
  assert.equal((await request("/admin/access")).status, 401);
  assert.equal(
    (
      await post(
        "/auth/register",
        { email: "alpha@example.test", password },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("/auth/register", { email: "invalid", password: "short" }))
      .status,
    400,
  );
  assert.equal(
    (
      await post("/auth/register", {
        email: " ALPHA@example.test ",
        password,
        role: "ADMIN",
      })
    ).status,
    400,
  );
  const registration = await post("/auth/register", {
    email: " ALPHA@example.test ",
    password,
  });
  assert.equal(registration.status, 201);
  const registered = (await registration.json()) as {
    id: string;
    email: string;
  };
  assert.equal(registered.email, "alpha@example.test");
  assert.equal(Object.hasOwn(registered, "passwordHash"), false);
  assert.equal(
    (await post("/auth/register", { email: "alpha@example.test", password }))
      .status,
    409,
  );
  assert.equal(
    (
      await post("/auth/login", {
        email: "alpha@example.test",
        password: "incorrect",
      })
    ).status,
    401,
  );

  const customer = await login("alpha@example.test");
  const customerHeaders = { Cookie: customer.cookie };
  const me = await request("/users/me", { headers: customerHeaders });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), registered);
  assert.equal(
    (await request("/admin/access", { headers: customerHeaders })).status,
    403,
  );

  const staffUser = await prisma.user.create({
    data: {
      email: "staff@example.test",
      passwordHash: await hashPassword(password),
      roles: { create: { roleCode: "ADMIN" } },
    },
  });
  const staff = await login(staffUser.email);
  const staffHeaders = { Cookie: staff.cookie };
  assert.equal(
    (await request("/admin/access", { headers: staffHeaders })).status,
    200,
  );
  await prisma.userRole.delete({
    where: { userId_roleCode: { userId: staffUser.id, roleCode: "ADMIN" } },
  });
  assert.equal(
    (await request("/admin/access", { headers: staffHeaders })).status,
    403,
  );

  const revoke = (sessionId: string, cookie: string) =>
    request(`/auth/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Origin: origin, Cookie: cookie },
    });
  assert.equal((await revoke(staff.sessionId, customer.cookie)).status, 404);
  assert.equal(
    (await request("/auth/me", { headers: staffHeaders })).status,
    200,
  );
  assert.equal((await revoke(customer.sessionId, customer.cookie)).status, 204);
  assert.equal(
    (await request("/auth/me", { headers: customerHeaders })).status,
    401,
  );

  const stored = await prisma.session.findUniqueOrThrow({
    where: { id: staff.sessionId },
  });
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.ok(!staff.cookie.includes(stored.tokenHash));
  assert.equal(
    (await post("/auth/logout", {}, "https://untrusted.example", staff.cookie))
      .status,
    403,
  );
  assert.equal(
    (await request("/auth/me", { headers: staffHeaders })).status,
    200,
  );
  assert.equal(
    (await post("/auth/logout", {}, origin, staff.cookie)).status,
    204,
  );
  assert.equal(
    (await request("/auth/me", { headers: staffHeaders })).status,
    401,
  );

  const expiring = await login(staffUser.email);
  await prisma.session.update({
    where: { id: expiring.sessionId },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(
    (await request("/auth/me", { headers: { Cookie: expiring.cookie } }))
      .status,
    401,
  );
  await prisma.user.update({
    where: { id: staffUser.id },
    data: { active: false },
  });
  assert.equal(
    (await post("/auth/login", { email: staffUser.email, password })).status,
    401,
  );
  let throttled = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await post("/auth/login", {});
    if (response.status === 429) {
      assert.ok(response.headers.get("retry-after"));
      throttled = true;
      break;
    }
    assert.equal(response.status, 400);
  }
  assert.equal(throttled, true);
});
