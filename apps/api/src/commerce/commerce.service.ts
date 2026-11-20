import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Order, Payment, PaymentStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { publicListingWhere } from "../catalog/catalog.module";
import { notify } from "../engagement/notifications";
import { PrismaService } from "../prisma/prisma.module";
import {
  Outcome,
  SandboxProvider,
  VerifiedEvent,
  sandboxEnabled,
} from "./provider";

const publicOrder = {
  reference: true,
  status: true,
  amountMinor: true,
  currency: true,
  createdAt: true,
  items: {
    select: {
      title: true,
      quantity: true,
      listingReference: true,
      unitAmountMinor: true,
      currency: true,
    },
  },
  payments: {
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: {
      reference: true,
      status: true,
      amountMinor: true,
      currency: true,
      receipt: { select: { reference: true } },
      refunds: {
        orderBy: { createdAt: "desc" },
        select: {
          reference: true,
          status: true,
          amountMinor: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export const reference = (prefix: string) =>
  `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
export const jsonMoney = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as T;
export type Tx = Prisma.TransactionClient;

export async function commerceAudit(
  tx: Tx,
  orderId: string,
  action: string,
  actorId: string | null,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.commerceAudit.create({
    data: { orderId, action, actorId, metadata },
  });
}

export async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id}::uuid FOR UPDATE`;
}

async function lockKey(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

const serviceSelect = {
  slug: true,
  title: true,
  reference: true,
  priceMinor: true,
  currency: true,
  service: { select: { data: true } },
} as const;

@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SandboxProvider,
  ) {}

  private async eligible(tx: Tx, slug: string) {
    return tx.listing.findFirst({
      where: {
        slug,
        isDemo: false,
        category: "SERVICE",
        priceMinor: { gt: 0 },
        AND: [
          publicListingWhere(new Date()),
          { service: { data: { path: ["pricingModel"], equals: "FIXED" } } },
        ],
      },
      select: serviceSelect,
    });
  }

  async offer(slug: string) {
    if (!sandboxEnabled()) return { available: false };
    const listing = await this.eligible(this.prisma, slug);
    return listing
      ? {
          available: true,
          mode: "sandbox",
          amountMinor: listing.priceMinor!.toString(),
          currency: listing.currency,
        }
      : { available: false };
  }

  private async createPayment(
    tx: Tx,
    order: Order,
    key: string,
    actorId: string,
  ) {
    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        reference: reference("PAY"),
        initializeKey: key,
        provider: this.provider.name,
        ...this.provider.initialize(),
        amountMinor: order.amountMinor,
        currency: order.currency,
        expiresAt: new Date(Date.now() + 30 * 60000),
      },
    });
    await commerceAudit(tx, order.id, "PAYMENT_INITIALIZED", actorId, {
      payment: payment.reference,
    });
    return payment;
  }

  private checkoutResult(order: Order, payment: Payment) {
    return jsonMoney({
      orderReference: order.reference,
      paymentReference: payment.reference,
      status: payment.status,
      amountMinor: order.amountMinor,
      currency: order.currency,
      sandbox: true,
    });
  }

  checkout(userId: string, slug: string, key: string) {
    this.provider.requireEnabled();
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `checkout:${userId}:${key}`);
      const existing = await tx.order.findUnique({
        where: {
          customerId_checkoutKey: { customerId: userId, checkoutKey: key },
        },
      });
      if (existing) {
        if (existing.listingSlug !== slug)
          throw new ConflictException("Checkout key has already been used");
        const original = await tx.payment.findUniqueOrThrow({
          where: {
            orderId_initializeKey: { orderId: existing.id, initializeKey: key },
          },
        });
        return this.checkoutResult(existing, original);
      }
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE slug = ${slug} FOR SHARE`;
      const listing = await this.eligible(tx, slug);
      if (!listing?.priceMinor)
        throw new NotFoundException("This listing is unavailable for checkout");
      const order = await tx.order.create({
        data: {
          customerId: userId,
          checkoutKey: key,
          listingSlug: listing.slug,
          reference: reference("ORD"),
          amountMinor: listing.priceMinor,
          currency: listing.currency,
          items: {
            create: {
              listingReference: listing.reference,
              title: listing.title,
              quantity: 1,
              unitAmountMinor: listing.priceMinor,
              currency: listing.currency,
            },
          },
        },
      });
      await commerceAudit(tx, order.id, "ORDER_CREATED", userId);
      return this.checkoutResult(
        order,
        await this.createPayment(tx, order, key, userId),
      );
    });
  }

  retry(userId: string, orderRef: string, key: string) {
    this.provider.requireEnabled();
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.order.findFirst({
        where: { reference: orderRef, customerId: userId },
        select: { id: true },
      });
      if (!owner) throw new NotFoundException("Order not found");
      await lockOrder(tx, owner.id);
      const order = await tx.order.findUniqueOrThrow({
        where: { id: owner.id },
      });
      const existing = await tx.payment.findUnique({
        where: {
          orderId_initializeKey: { orderId: order.id, initializeKey: key },
        },
      });
      if (existing) return this.checkoutResult(order, existing);
      if (order.status !== "AWAITING_PAYMENT")
        throw new ConflictException("This order no longer accepts payments");
      const pending = await tx.payment.findFirst({
        where: { orderId: order.id, status: "PENDING" },
      });
      if (pending) {
        if (pending.expiresAt > new Date())
          throw new ConflictException(
            "An active payment already exists for this order",
          );
        if (
          await tx.sandboxOutcome.findUnique({
            where: { paymentId: pending.id },
          })
        )
          throw new ConflictException(
            "A pending provider result must be reconciled first",
          );
        await tx.payment.update({
          where: { id: pending.id },
          data: { status: "TIMED_OUT" },
        });
        await commerceAudit(tx, order.id, "PAYMENT_TIMED_OUT", userId, {
          payment: pending.reference,
        });
      }
      return this.checkoutResult(
        order,
        await this.createPayment(tx, order, key, userId),
      );
    });
  }

  async orders(userId: string) {
    return jsonMoney(
      await this.prisma.order.findMany({
        where: { customerId: userId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 50,
        select: publicOrder,
      }),
    ).map((order) => ({ ...order, sandboxEnabled: sandboxEnabled() }));
  }

  async payment(userId: string, ref: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference: ref, order: { customerId: userId } },
      select: {
        reference: true,
        status: true,
        expiresAt: true,
        amountMinor: true,
        currency: true,
        order: {
          select: {
            reference: true,
            status: true,
            items: { select: { title: true } },
          },
        },
        receipt: { select: { reference: true } },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return jsonMoney({ ...payment, sandboxEnabled: sandboxEnabled() });
  }

  async applyEvent({ event, digest }: VerifiedEvent) {
    return this.prisma.$transaction(async (tx) => {
      await lockKey(tx, `payment-event:${this.provider.name}:${event.id}`);
      const unique = {
        provider_providerEventId: {
          provider: this.provider.name,
          providerEventId: event.id,
        },
      };
      const previous = await tx.paymentEvent.findUnique({ where: unique });
      if (previous) {
        if (previous.digest !== digest)
          throw new ConflictException("Event identifier was already used");
        return { disposition: previous.disposition, duplicate: true };
      }

      const identified = await tx.payment.findUnique({
        where: { providerReference: event.providerReference },
        select: { id: true, orderId: true },
      });
      const log = async (disposition: string, reason?: string) => {
        await tx.paymentEvent.create({
          data: {
            paymentId: identified?.id ?? null,
            provider: this.provider.name,
            providerEventId: event.id,
            reference: event.paymentReference,
            digest,
            outcome: event.status,
            disposition,
            reason: reason ?? null,
          },
        });
        return { disposition, duplicate: false };
      };
      if (!identified) return log("REJECTED", "Unknown provider reference");
      await lockOrder(tx, identified.orderId);
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: identified.id },
        include: { order: { include: { items: true } } },
      });
      const { order } = payment;
      if (
        event.paymentReference !== payment.reference ||
        payment.provider !== this.provider.name
      )
        return log("REJECTED", "Payment reference mismatch");
      if (
        BigInt(event.amountMinor) !== payment.amountMinor ||
        event.currency !== payment.currency
      )
        return log("REJECTED", "Amount or currency mismatch");
      const occurred = new Date(event.occurredAt);
      if (
        occurred.getTime() < payment.createdAt.getTime() - 1000 ||
        occurred.getTime() > Date.now() + 300000
      )
        return log("REJECTED", "Invalid event occurrence time");
      if (event.status === payment.status) return log("NO_CHANGE");
      if (payment.status !== "PENDING" || order.status !== "AWAITING_PAYMENT")
        return log("REJECTED", "Unexpected order or payment state");
      if (event.status === "SUCCEEDED" && occurred > payment.expiresAt)
        return log("REJECTED", "Success occurred after payment expiry");

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: event.status,
          ...(event.status === "SUCCEEDED" && { confirmedAt: occurred }),
        },
      });
      await commerceAudit(tx, order.id, "PAYMENT_" + event.status, null, {
        payment: payment.reference,
        event: event.id,
      });
      if (event.status === "SUCCEEDED") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "PAID" },
        });
        const receipt = await tx.receipt.create({
          data: {
            reference: reference("RCPT"),
            paymentId: payment.id,
            orderReference: order.reference,
            itemTitle:
              order.items.length > 1
                ? `Professional services quotation ${order.items[0]?.listingReference ?? ""} (${order.items.length} lines)`
                : (order.items[0]?.title ?? "Service"),
            amountMinor: payment.amountMinor,
            currency: payment.currency,
          },
        });
        await notify(
          tx,
          order.customerId,
          "receipt:" + receipt.id,
          "Sandbox payment confirmed",
          `Receipt ${receipt.reference} is ready in your account. No funds were charged.`,
        );
      }
      return log("APPLIED");
    });
  }

  async simulate(userId: string, ref: string, status: Outcome) {
    this.provider.requireEnabled();
    const payment = await this.prisma.payment.findFirst({
      where: { reference: ref, order: { customerId: userId } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "PENDING")
      throw new ConflictException("This payment attempt has already ended");
    if (payment.expiresAt <= new Date() && status !== "TIMED_OUT")
      throw new ConflictException(
        "This payment expired. Simulate timeout before starting another attempt.",
      );
    const event = await this.provider.simulate(payment, status);
    await this.applyEvent(this.provider.signed(event));
    return this.payment(userId, ref);
  }

  async reconcile(ref: string, actorId: string) {
    this.provider.requireEnabled();
    const payment = await this.prisma.payment.findUnique({
      where: { reference: ref },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    const verified = await this.provider.verifyPayment(payment);
    const result = verified
      ? await this.applyEvent(this.provider.signed(verified))
      : undefined;
    let status: PaymentStatus = payment.status;
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, payment.orderId);
      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      status = fresh.status;
      if (
        !verified &&
        status === "PENDING" &&
        fresh.expiresAt < new Date() &&
        !(await tx.sandboxOutcome.findUnique({
          where: { paymentId: payment.id },
        }))
      ) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "TIMED_OUT" },
        });
        status = "TIMED_OUT";
      }
      await commerceAudit(tx, payment.orderId, "PAYMENT_RECONCILED", actorId, {
        payment: ref,
        providerResult: verified?.status ?? null,
        state: status,
      });
    });
    return {
      status,
      providerResult: verified?.status ?? null,
      disposition: result?.disposition ?? null,
    };
  }

  async receipt(userId: string, ref: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { reference: ref, payment: { order: { customerId: userId } } },
    });
    if (!receipt) throw new NotFoundException("Receipt not found");
    return receipt;
  }

  async reconciliation(input: {
    status?: PaymentStatus | undefined;
    page: number;
  }) {
    const [payments, exceptions] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: input.status ? { status: input.status } : {},
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * 25,
        take: 25,
        include: {
          order: {
            select: {
              reference: true,
              status: true,
              customer: { select: { email: true } },
            },
          },
        },
      }),
      this.prisma.paymentEvent.findMany({
        where: { disposition: "REJECTED" },
        take: 25,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: {
          id: true,
          reference: true,
          outcome: true,
          reason: true,
          createdAt: true,
        },
      }),
    ]);
    return jsonMoney({ payments, exceptions });
  }

  async audit(ref: string) {
    return this.prisma.commerceAudit.findMany({
      where: { order: { reference: ref } },
      take: 50,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        action: true,
        actorId: true,
        metadata: true,
        createdAt: true,
      },
    });
  }
}
