import { BadRequestException, Injectable } from "@nestjs/common";
import { AccountTokenKind, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.module";
import { queueMail } from "./notifications";

const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const invalid = () =>
  new BadRequestException("This account link is invalid or expired");

async function lockAccount(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${"account-token:" + userId}, 0))`;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async send(email: string, kind: AccountTokenKind) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, active: true, emailVerifiedAt: true },
    });
    if (!user?.active || (kind === "VERIFY_EMAIL" && user.emailVerifiedAt))
      return;
    const site = new URL(
      process.env.MARKETPLACE_SITE_URL || "http://localhost:3000",
    );
    if (process.env.NODE_ENV === "production" && site.protocol !== "https:")
      throw new Error("Account links require HTTPS in production");
    const token = randomBytes(32).toString("base64url");
    const hash = digest(token);
    const mode = kind === "VERIFY_EMAIL" ? "verify" : "reset";
    const link = new URL("/account#" + mode + "=" + token, site);
    const now = new Date();
    const duration = kind === "VERIFY_EMAIL" ? 24 * 3600000 : 30 * 60000;
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, user.id);
      const recent = await tx.accountToken.findFirst({
        where: {
          userId: user.id,
          kind,
          usedAt: null,
          expiresAt: { gt: new Date(now.getTime() + duration - 120000) },
        },
        select: { id: true },
      });
      if (recent) return;
      await tx.accountToken.updateMany({
        where: { userId: user.id, kind, usedAt: null },
        data: { usedAt: now },
      });
      await tx.accountToken.create({
        data: {
          userId: user.id,
          kind,
          digest: hash,
          expiresAt: new Date(now.getTime() + duration),
        },
      });
      const subject =
        kind === "VERIFY_EMAIL"
          ? "Verify your CUV Marketplace email"
          : "Reset your CUV Marketplace password";
      await queueMail(
        tx,
        `account:${hash}`,
        email,
        subject,
        `${subject}\n\n${link.href}\n\nIf this was not requested, ignore this email.`,
      );
    });
  }

  async consume(token: string, kind: AccountTokenKind, password?: string) {
    const hash = digest(token);
    const where = {
      digest: hash,
      kind,
      usedAt: null,
      expiresAt: { gt: new Date() },
      user: { active: true },
    };
    const record = await this.prisma.accountToken.findFirst({
      where,
      select: { userId: true },
    });
    if (!record) throw invalid();
    const passwordHash =
      password === undefined
        ? undefined
        : await this.auth.encodePassword(password);
    await this.prisma.$transaction(async (tx) => {
      await lockAccount(tx, record.userId);
      const now = new Date();
      const changed = await tx.accountToken.updateMany({
        where: { ...where, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!changed.count) throw invalid();
      await tx.accountToken.updateMany({
        where: { userId: record.userId, kind, usedAt: null },
        data: { usedAt: now },
      });
      if (kind === "VERIFY_EMAIL") {
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        });
      } else if (passwordHash) {
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash },
        });
        await tx.session.deleteMany({ where: { userId: record.userId } });
      }
    });
  }
}
