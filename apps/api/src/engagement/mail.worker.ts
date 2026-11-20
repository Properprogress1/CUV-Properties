import { randomUUID } from "node:crypto";
import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

type Job = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
};

async function deliver(directory: string, job: Job) {
  const destination = join(directory, job.id + ".json");
  const temporary = join(directory, "." + randomUUID());
  await writeFile(
    temporary,
    JSON.stringify(
      { to: job.recipient, subject: job.subject, body: job.body },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  try {
    await link(temporary, destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Production mail delivery adapter is not configured");
  const directory = resolve(process.env.MAIL_LOCAL_DIR || ".local-mail");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const prisma = new PrismaClient();
  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      running = false;
    });
  try {
    while (running) {
      const processed = await prisma.$transaction(async (tx) => {
        const [job] = await tx.$queryRaw<Job[]>`
          SELECT id, recipient, subject, body, attempts FROM "MailJob"
          WHERE "sentAt" IS NULL AND "failedAt" IS NULL AND "readyAt" <= now()
          ORDER BY "readyAt", id LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!job) return false;
        const attempts = job.attempts + 1;
        try {
          await deliver(directory, job);
        } catch {
          await tx.mailJob.update({
            where: { id: job.id },
            data:
              attempts >= 5
                ? { attempts, failedAt: new Date(), body: "" }
                : {
                    attempts,
                    readyAt: new Date(Date.now() + 1000 * 2 ** attempts),
                  },
          });
          return true;
        }
        await tx.mailJob.update({
          where: { id: job.id },
          data: { attempts, sentAt: new Date(), body: "" },
        });
        return true;
      });
      if (!processed && process.argv.includes("--once")) break;
      if (!processed) await sleep(1000);
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith("Production mail")
      ? error.message
      : "Mail worker failed",
  );
  process.exitCode = 1;
});
