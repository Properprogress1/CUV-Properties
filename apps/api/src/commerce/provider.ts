import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Payment } from "@prisma/client";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.module";

export const statuses = [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
] as const;
export const webhookPath = "/api/v1/payments/webhook/sandbox";
export const money = z.string().regex(/^[1-9]\d{0,14}$/);
export const sandboxEvent = z
  .object({
    id: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    providerReference: z.string().regex(/^SBX-[a-f0-9-]{36}$/),
    paymentReference: z.string().regex(/^PAY-\d{4}-[A-F0-9]{16}$/),
    status: z.enum(statuses),
    amountMinor: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    occurredAt: z.string().datetime(),
  })
  .strict();
export type ProviderEvent = z.infer<typeof sandboxEvent>;
export type VerifiedEvent = { event: ProviderEvent; digest: string };
export type Outcome = ProviderEvent["status"];

export interface PaymentProvider {
  readonly name: string;
  initialize(): { providerReference: string };
  verifyWebhook(
    raw: Buffer,
    timestamp: string,
    signature: string,
  ): VerifiedEvent;
  verifyPayment(payment: Payment): Promise<ProviderEvent | null>;
  verifyRefund(
    reference: string,
    amountMinor: bigint,
    currency: string,
    simulation?: "SUCCEEDED" | "FAILED",
  ): {
    reference: string;
    status: "SUCCEEDED" | "FAILED";
    amountMinor: bigint;
    currency: string;
  };
}

export function sandboxEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_SANDBOX_ENABLED === "true" &&
    Buffer.byteLength(process.env.PAYMENT_SANDBOX_SECRET ?? "") >= 32
  );
}

export function validateSandboxConfiguration() {
  if (process.env.PAYMENT_SANDBOX_ENABLED === "true" && !sandboxEnabled()) {
    throw new Error(
      "Invalid API environment variables: PAYMENT_SANDBOX_ENABLED, PAYMENT_SANDBOX_SECRET",
    );
  }
}

@Injectable()
export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  constructor(private readonly prisma: PrismaService) {}

  requireEnabled() {
    if (!sandboxEnabled())
      throw new ServiceUnavailableException("Sandbox payments are unavailable");
  }

  initialize() {
    this.requireEnabled();
    return { providerReference: "SBX-" + randomUUID() };
  }

  private mac(timestamp: string, raw: Buffer) {
    this.requireEnabled();
    return createHmac("sha256", process.env.PAYMENT_SANDBOX_SECRET!)
      .update(timestamp)
      .update(".")
      .update(raw)
      .digest();
  }

  verifyWebhook(
    raw: Buffer,
    timestamp: string,
    signature: string,
  ): VerifiedEvent {
    this.requireEnabled();
    if (
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new UnauthorizedException("Invalid payment signature");
    if (
      !timingSafeEqual(this.mac(timestamp, raw), Buffer.from(signature, "hex"))
    )
      throw new UnauthorizedException("Invalid payment signature");
    let input: unknown;
    try {
      input = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new BadRequestException("Invalid payment event");
    }
    const parsed = sandboxEvent.safeParse(input);
    if (!parsed.success) throw new BadRequestException("Invalid payment event");
    return {
      event: parsed.data,
      digest: createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex"),
    };
  }

  signed(event: ProviderEvent) {
    const raw = Buffer.from(JSON.stringify(event));
    const timestamp = String(Math.floor(Date.now() / 1000));
    return this.verifyWebhook(
      raw,
      timestamp,
      this.mac(timestamp, raw).toString("hex"),
    );
  }

  private event(
    payment: Payment,
    id: string,
    status: Outcome,
    date: Date,
  ): ProviderEvent {
    return {
      id,
      status,
      providerReference: payment.providerReference,
      paymentReference: payment.reference,
      amountMinor: payment.amountMinor.toString(),
      currency: payment.currency,
      occurredAt: date.toISOString(),
    };
  }

  async simulate(payment: Payment, status: Outcome) {
    this.requireEnabled();
    if (status === "PENDING")
      return this.event(payment, randomUUID(), status, new Date());
    await this.prisma.sandboxOutcome.createMany({
      data: { paymentId: payment.id, eventId: randomUUID(), status },
      skipDuplicates: true,
    });
    const result = await this.prisma.sandboxOutcome.findUniqueOrThrow({
      where: { paymentId: payment.id },
    });
    return this.event(payment, result.eventId, result.status, result.updatedAt);
  }

  async verifyPayment(payment: Payment) {
    this.requireEnabled();
    const row = await this.prisma.sandboxOutcome.findUnique({
      where: { paymentId: payment.id },
    });
    return row
      ? this.event(payment, row.eventId, row.status, row.updatedAt)
      : null;
  }

  verifyRefund(
    reference: string,
    amountMinor: bigint,
    currency: string,
    simulation: "SUCCEEDED" | "FAILED" = "SUCCEEDED",
  ) {
    this.requireEnabled();
    return {
      reference: "SBX-" + reference,
      amountMinor,
      currency,
      status: simulation,
    };
  }
}
