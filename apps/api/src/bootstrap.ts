import "reflect-metadata";
import { parseServerEnv } from "@marketplace/config";
import { ConsoleLogger, LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { z } from "zod";
import { AppModule } from "./app.module";
import { productionSessionCookie, sessionCookie } from "./auth/auth.service";
import { validateSandboxConfiguration } from "./commerce/provider";
import { ApiExceptionFilter, requestMiddleware } from "./http";

const origin = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && url.origin === value;
});

const apiEnv = z.object({
  MARKETPLACE_SITE_URL: origin.default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_ALLOWED_ORIGINS: z
    .string()
    .transform((value) => value.split(",").map((entry) => entry.trim()))
    .pipe(z.array(origin).nonempty()),
});

export async function createApp(logLevels?: LogLevel[] | false) {
  const server = parseServerEnv(process.env);
  const env = apiEnv.safeParse(process.env);
  if (!env.success) {
    throw new Error(
      `Invalid API environment variables: ${env.error.issues.map((issue) => issue.path[0]).join(", ")}`,
    );
  }
  const origins = env.data.API_ALLOWED_ORIGINS;
  if (
    server.NODE_ENV === "production" &&
    [...origins, env.data.MARKETPLACE_SITE_URL].some(
      (value) => !value.startsWith("https://"),
    )
  ) {
    throw new Error(
      "Production API_ALLOWED_ORIGINS and MARKETPLACE_SITE_URL must use HTTPS",
    );
  }

  validateSandboxConfiguration();
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    abortOnError: false,
    logger: logLevels ?? new ConsoleLogger({ json: true }),
  });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(requestMiddleware(origins));
  app.enableCors({
    origin: origins,
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix("api/v1");

  if (server.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("CUV Marketplace API")
      .setVersion("1")
      .addCookieAuth(sessionCookie)
      .build();
    SwaggerModule.setup("api/docs", app, () =>
      SwaggerModule.createDocument(app, config),
    );
  }

  return {
    app,
    port: env.data.API_PORT,
    cookieName:
      server.NODE_ENV === "production"
        ? productionSessionCookie
        : sessionCookie,
  };
}
