import assert from "node:assert/strict";
import { test } from "node:test";
import { parseServerEnv } from "./env.ts";

test("accepts local service URLs and defaults the environment", () => {
  const config = parseServerEnv({
    DATABASE_URL: "postgresql://localhost/marketplace",
    REDIS_URL: "redis://localhost:6379",
  });
  assert.equal(config.NODE_ENV, "development");
});

test("reports invalid and missing URL fields without echoing values", () => {
  assert.throws(
    () => parseServerEnv({ DATABASE_URL: "https://test-value.invalid" }),
    {
      message: "Invalid server environment variables: DATABASE_URL, REDIS_URL",
    },
  );
});
