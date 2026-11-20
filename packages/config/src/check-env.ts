import { parseServerEnv } from "./env.ts";

try {
  parseServerEnv(process.env);
  console.log("Server environment is valid.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid server environment.",
  );
  process.exitCode = 1;
}
