import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/auth/password";

const settings = z.object({
  NODE_ENV: z.literal("development"),
  SEED_ADMIN_EMAIL: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(128),
});

async function seed() {
  const config = settings.safeParse(process.env);
  if (!config.success) {
    throw new Error(
      "Seed requires NODE_ENV=development, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12–128 characters)",
    );
  }
  const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } =
    config.data;
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { roles: { select: { roleCode: true } } },
    });
    if (existing) {
      if (!existing.roles.some(({ roleCode }) => roleCode === "SUPER_ADMIN"))
        throw new Error("Seed email already belongs to another account");
      console.log("Development admin already exists");
      return;
    }
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        roles: { create: { roleCode: "SUPER_ADMIN" } },
      },
    });
    console.log("Development admin created");
  } finally {
    await prisma.$disconnect();
  }
}

void seed().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    /^(Seed requires |Seed email already )/.test(error.message)
      ? error.message
      : "Development seed failed";
  console.error(message);
  process.exitCode = 1;
});
