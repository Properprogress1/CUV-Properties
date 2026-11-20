import { Logger } from "@nestjs/common";
import { createApp } from "./bootstrap";

async function main() {
  const { app, port } = await createApp();
  app.enableShutdownHooks();
  try {
    await app.listen(port);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    /^Invalid (server|API) environment variables:|^Production API_ALLOWED_ORIGINS/.test(
      error.message,
    )
      ? error.message
      : "API initialization failed";
  Logger.error(message, "Bootstrap");
  process.exitCode = 1;
});
