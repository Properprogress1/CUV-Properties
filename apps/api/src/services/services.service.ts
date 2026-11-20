import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ServiceRequestStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { publicListingWhere } from "../catalog/catalog.module";
import {
  commerceAudit,
  jsonMoney,
  lockOrder,
  reference,
  type Tx,
} from "../commerce/commerce.service";
import { money, sandboxEnabled } from "../commerce/provider";
import { notify } from "../engagement/notifications";
import { PrismaService } from "../prisma/prisma.module";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
export const requestInput = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,140}$/),
    scope: text(20, 5000),
    location: text(2, 200),
    timeline: text(2, 250).nullable(),
    budgetMinor: money.nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export const messageInput = z.object({ message: text(5, 2500) }).strict();
export const triageInput = z
  .object({
    version: z.number().int().min(0).max(2147483646),
    status: z.enum(["REVIEWING", "NEEDS_INFORMATION", "CLOSED"]),
    assigneeEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .nullable(),
    message: text(0, 2500),
  })
  .strict()
  .refine(
    (input) =>
      input.status !== "NEEDS_INFORMATION" || input.message.length >= 5,
    "Provide the question for the customer",
  );
export const quoteInput = z
  .object({
    version: z.number().int().min(0).max(2147483646),
    currency: z.string().regex(/^[A-Z]{3}$/),
    terms: text(5, 5000),
    timeline: text(2, 250),
    validUntil: instant,
    lines: z
      .array(
        z
          .object({
            title: text(2, 160),
            quantity: z.number().int().min(1).max(1000),
            unitAmountMinor: money,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();
export const milestoneInput = z
  .object({
    version: z.number().int().min(0).max(2147483646),
    title: text(2, 160),
    dueAt: instant,
    status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]),
    evidence: text(2, 2000).nullable(),
  })
  .strict()
  .refine(
    (input) => input.status !== "COMPLETED" || input.evidence !== null,
    "Provide evidence of completion",
  );
export const requestFilters = z
  .object({
    status: z.nativeEnum(ServiceRequestStatus).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();

const include = {
  listing: { select: { slug: true, title: true, reference: true } },
  updates: {
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      author: true,
      kind: true,
      message: true,
      createdAt: true,
    },
  },
  quotes: {
    orderBy: { revision: "desc" },
    take: 30,
    select: {
      reference: true,
      revision: true,
      status: true,
      currency: true,
      totalMinor: true,
      terms: true,
      timeline: true,
      validUntil: true,
      lines: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          quantity: true,
          unitAmountMinor: true,
        },
      },
      order: {
        select: {
          reference: true,
          status: true,
          payments: {
            where: { status: "PENDING" },
            take: 1,
            select: { reference: true },
          },
        },
      },
    },
  },
  project: {
    select: {
      id: true,
      milestones: { orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 100 },
    },
  },
} satisfies Prisma.ServiceRequestInclude;

function customerView(
  row: Prisma.ServiceRequestGetPayload<{ include: typeof include }>,
) {
  const {
    customerId: _customer,
    assigneeId: _assignee,
    listingId: _listing,
    ...value
  } = row;
  void [_customer, _assignee, _listing];
  return jsonMoney({ ...value, sandboxEnabled: sandboxEnabled() });
}

async function lockRequest(tx: Tx, ref: string, userId?: string) {
  const row = await tx.serviceRequest.findFirst({
    where: { reference: ref, ...(userId && { customerId: userId }) },
    select: { id: true },
  });
  if (!row) throw new NotFoundException("Service request not found");
  await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${row.id}::uuid FOR UPDATE`;
  return tx.serviceRequest.findUniqueOrThrow({ where: { id: row.id } });
}

function checkVersion(previous: number, submitted: number) {
  if (previous !== submitted)
    throw new ConflictException("Request changed. Reload and try again.");
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: z.infer<typeof requestInput>) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findFirst({
        where: {
          slug: input.slug,
          category: "SERVICE",
          isDemo: false,
          AND: [publicListingWhere(new Date())],
        },
        select: { id: true },
      });
      if (!listing)
        throw new NotFoundException("Service listing is unavailable");
      const row = await tx.serviceRequest.create({
        data: {
          reference: reference("SRV"),
          customerId: userId,
          listingId: listing.id,
          scope: input.scope,
          location: input.location,
          timeline: input.timeline,
          budgetMinor: input.budgetMinor ? BigInt(input.budgetMinor) : null,
          currency: input.currency,
        },
        select: { reference: true },
      });
      await notify(
        tx,
        userId,
        "service:" + row.reference,
        "Service request received",
        `Service request ${row.reference} is ready for review.`,
      );
      return row;
    });
  }

  async mine(userId: string) {
    return (
      await this.prisma.serviceRequest.findMany({
        where: { customerId: userId },
        include,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 30,
      })
    ).map(customerView);
  }

  async staff(input: z.infer<typeof requestFilters>) {
    return jsonMoney(
      await this.prisma.serviceRequest.findMany({
        where: input.status ? { status: input.status } : {},
        include: {
          ...include,
          customer: { select: { email: true } },
          assignee: { select: { email: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * 25,
        take: 25,
      }),
    );
  }

  triage(ref: string, actorId: string, input: z.infer<typeof triageInput>) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockRequest(tx, ref);
      checkVersion(row.version, input.version);
      if (
        row.status === "CLOSED" ||
        (row.status === "ACCEPTED" && input.status !== "REVIEWING")
      )
        throw new ConflictException("Request cannot move to this status");
      const assignee = input.assigneeEmail
        ? await tx.user.findFirst({
            where: {
              email: input.assigneeEmail,
              active: true,
              roles: {
                some: {
                  role: {
                    permissions: {
                      some: { permissionCode: "services:manage" },
                    },
                  },
                },
              },
            },
            select: { id: true },
          })
        : null;
      if (input.assigneeEmail && !assignee)
        throw new BadRequestException(
          "Assign an active staff member with service permissions",
        );
      const status = row.status === "ACCEPTED" ? row.status : input.status;
      if (row.status !== "ACCEPTED")
        await tx.serviceQuote.updateMany({
          where: { requestId: row.id, status: "SENT" },
          data: { status: "SUPERSEDED" },
        });
      await tx.serviceRequest.update({
        where: { id: row.id },
        data: {
          status,
          assigneeId: assignee?.id ?? null,
          version: { increment: 1 },
        },
      });
      if (input.message)
        await tx.serviceUpdate.create({
          data: {
            requestId: row.id,
            author: "STAFF",
            actorId,
            kind: status,
            message: input.message,
          },
        });
      await notify(
        tx,
        row.customerId,
        `service:${ref}:${row.version + 1}`,
        "Service request updated",
        `There is an update to ${ref} in your account.`,
      );
      return { reference: ref, status };
    });
  }

  reply(ref: string, userId: string, message: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockRequest(tx, ref, userId);
      if (row.status === "CLOSED")
        throw new ConflictException("Request is closed");
      await tx.serviceUpdate.create({
        data: {
          requestId: row.id,
          actorId: userId,
          author: "CUSTOMER",
          kind: "REPLY",
          message,
        },
      });
      await tx.serviceRequest.update({
        where: { id: row.id },
        data: {
          ...(row.status === "NEEDS_INFORMATION" && { status: "REVIEWING" }),
          version: { increment: 1 },
        },
      });
      return { reference: ref };
    });
  }

  quote(ref: string, actorId: string, input: z.infer<typeof quoteInput>) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockRequest(tx, ref);
      checkVersion(row.version, input.version);
      if (row.status === "ACCEPTED" || row.status === "CLOSED")
        throw new ConflictException("This request is closed to new quotations");
      if (input.validUntil <= new Date())
        throw new BadRequestException("Quote expiry must be in the future");
      const totalMinor = input.lines.reduce(
        (total, line) =>
          total + BigInt(line.unitAmountMinor) * BigInt(line.quantity),
        0n,
      );
      if (totalMinor > 999999999999999n)
        throw new BadRequestException("Quote total is too large");
      const latest = await tx.serviceQuote.findFirst({
        where: { requestId: row.id },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      await tx.serviceQuote.updateMany({
        where: { requestId: row.id, status: "SENT" },
        data: { status: "SUPERSEDED" },
      });
      const quote = await tx.serviceQuote.create({
        data: {
          requestId: row.id,
          reference: reference("QUO"),
          revision: (latest?.revision ?? 0) + 1,
          totalMinor,
          currency: input.currency,
          terms: input.terms,
          timeline: input.timeline,
          validUntil: input.validUntil,
          lines: {
            create: input.lines.map((line, position) => ({
              ...line,
              position,
              unitAmountMinor: BigInt(line.unitAmountMinor),
            })),
          },
        },
        select: { reference: true, revision: true },
      });
      await tx.serviceRequest.update({
        where: { id: row.id },
        data: { status: "QUOTED", version: { increment: 1 } },
      });
      await tx.serviceUpdate.create({
        data: {
          requestId: row.id,
          actorId,
          author: "STAFF",
          kind: "QUOTE_SENT",
          message: `Quotation ${quote.reference} revision ${quote.revision} was sent.`,
        },
      });
      await notify(
        tx,
        row.customerId,
        "quote:" + quote.reference,
        "New service quotation",
        `Review quotation ${quote.reference} in your account.`,
      );
      return quote;
    });
  }

  decide(
    ref: string,
    quoteRef: string,
    userId: string,
    action: "accept" | "reject",
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockRequest(tx, ref, userId);
      const quote = await tx.serviceQuote.findFirst({
        where: { requestId: row.id, reference: quoteRef },
        include: {
          lines: { orderBy: { position: "asc" } },
          order: { select: { reference: true } },
        },
      });
      if (!quote) throw new NotFoundException("Quotation not found");
      if (action === "accept" && quote.status === "ACCEPTED")
        return { orderReference: quote.order?.reference ?? null };
      if (action === "reject" && quote.status === "REJECTED")
        return { orderReference: null };
      if (
        quote.status !== "SENT" ||
        row.status === "CLOSED" ||
        row.status === "ACCEPTED"
      )
        throw new ConflictException("This quotation is no longer available");
      if (quote.validUntil <= new Date())
        throw new ConflictException("This quotation has expired");
      const status = action === "accept" ? "ACCEPTED" : "REJECTED";
      const listing = await tx.listing.findUniqueOrThrow({
        where: { id: row.listingId },
        select: { slug: true },
      });
      const order =
        action === "accept"
          ? await tx.order.create({
              data: {
                customerId: userId,
                checkoutKey: randomUUID(),
                reference: reference("ORD"),
                listingSlug: listing.slug,
                amountMinor: quote.totalMinor,
                currency: quote.currency,
                items: {
                  create: quote.lines.map((line) => ({
                    listingReference: quote.reference,
                    title: line.title,
                    quantity: line.quantity,
                    unitAmountMinor: line.unitAmountMinor,
                    currency: quote.currency,
                  })),
                },
              },
            })
          : null;
      if (order) {
        await commerceAudit(tx, order.id, "QUOTE_ORDER_CREATED", userId, {
          quote: quote.reference,
        });
        await tx.serviceProject.create({ data: { requestId: row.id } });
      }
      await tx.serviceQuote.update({
        where: { id: quote.id },
        data: { status, decidedAt: new Date(), orderId: order?.id ?? null },
      });
      await tx.serviceRequest.update({
        where: { id: row.id },
        data: {
          status: order ? "ACCEPTED" : "REVIEWING",
          version: { increment: 1 },
        },
      });
      await tx.serviceUpdate.create({
        data: {
          requestId: row.id,
          actorId: userId,
          author: "CUSTOMER",
          kind: "QUOTE_" + status,
          message: `Quotation ${quote.reference} was ${status.toLowerCase()}.`,
        },
      });
      await notify(
        tx,
        userId,
        `quote:${quote.reference}:${status}`,
        "Quotation " + status.toLowerCase(),
        order
          ? `Order ${order.reference} is ready.`
          : `Quotation ${quote.reference} was declined.`,
      );
      return { orderReference: order?.reference ?? null };
    });
  }

  milestone(
    ref: string,
    actorId: string,
    input: z.infer<typeof milestoneInput>,
    id?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await lockRequest(tx, ref);
      const { version, ...details } = input;
      checkVersion(row.version, version);
      const project = await tx.serviceProject.findUnique({
        where: { requestId: row.id },
        select: { id: true, _count: { select: { milestones: true } } },
      });
      if (!project) throw new NotFoundException("Project not found");
      const quote = await tx.serviceQuote.findFirstOrThrow({
        where: { requestId: row.id, status: "ACCEPTED" },
        select: { orderId: true },
      });
      if (!quote.orderId)
        throw new ConflictException("Accepted quotation has no order");
      await lockOrder(tx, quote.orderId);
      const order = await tx.order.findUniqueOrThrow({
        where: { id: quote.orderId },
        select: { status: true },
      });
      if (
        input.status !== "PLANNED" &&
        order.status !== "PAID" &&
        order.status !== "PARTIALLY_REFUNDED"
      )
        throw new ConflictException("Confirm payment before starting work");
      const existing = id
        ? await tx.serviceMilestone.findFirst({
            where: { id, projectId: project.id },
          })
        : null;
      if (id && !existing) throw new NotFoundException("Milestone not found");
      if (!existing && project._count.milestones >= 100)
        throw new ConflictException("Project milestone limit reached");
      if (existing?.status === "COMPLETED" && input.status !== "COMPLETED")
        throw new ConflictException("Completed milestones cannot be reopened");
      const item = existing
        ? await tx.serviceMilestone.update({
            where: { id: existing.id },
            data: details,
          })
        : await tx.serviceMilestone.create({
            data: { projectId: project.id, ...details },
          });
      await tx.serviceRequest.update({
        where: { id: row.id },
        data: { version: { increment: 1 } },
      });
      await tx.serviceUpdate.create({
        data: {
          requestId: row.id,
          actorId,
          author: "STAFF",
          kind: "MILESTONE",
          message: `${item.title} is ${item.status.toLowerCase().replaceAll("_", " ")}.`,
        },
      });
      await notify(
        tx,
        row.customerId,
        `milestone:${item.id}:${row.version + 1}`,
        "Project milestone updated",
        `See the latest progress for ${ref}.`,
      );
      return item;
    });
  }
}
