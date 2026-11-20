import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/auth/password";

test("password hashes are salted and verify only the matching password", async () => {
  const password = "test-password-for-scrypt";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("different-password", first), false);
  assert.equal(await verifyPassword(password), false);
});
