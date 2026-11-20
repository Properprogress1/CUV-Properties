import { z } from "zod";

function connectionUrl(protocols: readonly string[]) {
  return z
    .string()
    .url()
    .refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return Boolean(url.hostname) && protocols.includes(url.protocol);
    }, "Unexpected connection URL scheme or missing host");
}

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: connectionUrl(["postgresql:", "postgres:"]),
  REDIS_URL: connectionUrl(["redis:", "rediss:"]),
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid server environment variables: ${fields.join(", ")}`,
    );
  }
  return parsed.data;
}
