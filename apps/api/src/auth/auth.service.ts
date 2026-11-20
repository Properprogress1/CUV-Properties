import {
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.module";
import { hashPassword, verifyPassword } from "./password";

export const sessionLifetime = 8 * 60 * 60 * 1000;
export const sessionCookie = "marketplace_session";
export const productionSessionCookie = "__Host-marketplace_session";
export const staffAccess = "staff:access";

export interface Principal {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  private activePasswordJobs = 0;

  constructor(private readonly prisma: PrismaService) {}

  private async runPasswordJob<T>(work: () => Promise<T>): Promise<T> {
    if (this.activePasswordJobs >= 2)
      throw new HttpException("Too many authentication attempts", 429);
    this.activePasswordJobs++;
    try {
      return await work();
    } finally {
      this.activePasswordJobs--;
    }
  }

  encodePassword(password: string) {
    return this.runPasswordJob(() => hashPassword(password));
  }

  async register(email: string, password: string) {
    const passwordHash = await this.encodePassword(password);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          roles: { create: { roleCode: "CUSTOMER" } },
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("This email address is already registered");
      }
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const matches = await this.runPasswordJob(() =>
      verifyPassword(password, user?.passwordHash),
    );
    if (!user?.active || !matches)
      throw new UnauthorizedException("Invalid credentials");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionLifetime);
    const session = await this.prisma.$transaction(async (tx) => {
      const matching = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "User" WHERE id = ${user.id}::uuid AND "passwordHash" = ${user.passwordHash} AND active FOR UPDATE`;
      if (!matching.length)
        throw new UnauthorizedException("Invalid credentials");
      return tx.session.create({
        data: { userId: user.id, tokenHash: tokenHash(token), expiresAt },
        select: { id: true },
      });
    });
    return { token, expiresAt, sessionId: session.id };
  }

  async authenticate(token: string | undefined): Promise<Principal> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException();
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: tokenHash(token),
        expiresAt: { gt: new Date() },
        user: { active: true },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            roles: {
              select: {
                role: {
                  select: {
                    code: true,
                    permissions: { select: { permissionCode: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session) throw new UnauthorizedException();
    const { id, email, roles } = session.user;
    return {
      id,
      email,
      roles: roles.map(({ role }) => role.code),
      permissions: [
        ...new Set(
          roles.flatMap(({ role }) =>
            role.permissions.map(({ permissionCode }) => permissionCode),
          ),
        ),
      ],
    };
  }

  async logout(token: string | undefined) {
    if (token)
      await this.prisma.session.deleteMany({
        where: { tokenHash: tokenHash(token) },
      });
  }

  async revokeOwnedSession(userId: string, id: string) {
    const result = await this.prisma.session.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }
}
