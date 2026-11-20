import { argv, env, loadEnvFile } from "node:process";
import { fileURLToPath, URL } from "node:url";

try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

env.NODE_ENV = argv[2] === "dev" ? "development" : "production";
await import("next/dist/bin/next");
