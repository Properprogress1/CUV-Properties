import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Payment, Prisma, RefundStatus } from "@prisma/client";
import { notify } from "../engagement/notifications";
import { PrismaService } from "../prisma/prisma.module";
import {
  commerceAudit,
  jsonMoney,
  lockOrder,
  reference,
} from "./commerce.service";
import { SandboxProvider } from "./provider";

const held: RefundStatus[] = ["REQUESTED", "APPROVED", "SUCCEEDED"];

@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: SandboxProvider,
  ) {}

  request(
    paymentRef: string,
    actorId: string,
    input: { key: string; amountMinor: string; reason: string },
    staff = false,
  ) {
    this.provider.requireEnabled();
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: {
          reference: paymentRef,
          ...(!staff && { order: { customerId: actorId } }),
        },
      });
      if (!payment) throw new NotFoundException("Payment not found");
      await lockOrder(tx, payment.orderId);
      const amountMinor = BigInt(input.amountMinor);
      const existing = await tx.refund.findUnique({
        where: {
          paymentId_requestKey: {
            paymentId: payment.id,
            requestKey: input.key,
          },
        },
      });
      if (existing) {
        if (
          existing.amountMinor !== amountMinor ||
          existing.reason !== input.reason
        )
          throw new ConflictException("Refund key has already been used");
        return jsonMoney(existing);
      }
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      if (current.status !== "SUCCEEDED")
        throw new ConflictException("This payment is not refundable");
      await this.checkBalance(tx, current, amountMinor, held);
      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          reference: reference("RFD"),
          requestedById: actorId,
          requestKey: input.key,
          amountMinor,
          currency: payment.currency,
          reason: input.reason,
        },
      });
      await commerceAudit(tx, payment.orderId, "REFUND_REQUESTED", actorId, {
        refund: refund.reference,
        amountMinor: input.amountMinor,
      });
      return jsonMoney(refund);
    });
  }

  private async checkBalance(
    tx: Prisma.TransactionClient,
    payment: Payment,
    amount: bigint,
    statuses: RefundStatus[],
    except?: string,
  ) {
    const result = await tx.refund.aggregate({
      where: {
        paymentId: payment.id,
        status: { in: statuses },
        ...(except && { id: { not: except } }),
      },
      _sum: { amountMinor: true },
    });
    const allocated = result._sum.amountMinor ?? 0n;
    if (allocated + amount > payment.amountMinor)
      throw new BadRequestException(
        "Refund exceeds the remaining refundable amount",
      );
    return allocated + amount;
  }

  change(
    ref: string,
    action: "approve" | "reject" | "process",
    actorId: string,
    sandboxOutcome?: "SUCCEEDED" | "FAILED",
  ) {
    this.provider.requireEnabled();
    return this.prisma.$transaction(async (tx) => {
      const identified = await tx.refund.findUnique({
        where: { reference: ref },
        select: { id: true, payment: { select: { orderId: true } } },
      });
      if (!identified) throw new NotFoundException("Refund not found");
      const orderId = identified.payment.orderId;
      await lockOrder(tx, orderId);
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: identified.id },
        include: { payment: { include: { order: true } } },
      });
      let status: RefundStatus;
      let providerReference: string | undefined;
      const payment = refund.payment;
      if (action === "process") {
        if (refund.status === "SUCCEEDED" || refund.status === "FAILED")
          return jsonMoney(refund);
        if (refund.status !== "APPROVED")
          throw new ConflictException(
            "Approve the refund before processing it",
          );
        const total = await this.checkBalance(tx, payment, refund.amountMinor, [
          "SUCCEEDED",
        ]);
        const verified = this.provider.verifyRefund(
          refund.reference,
          refund.amountMinor,
          refund.currency,
          sandboxOutcome,
        );
        if (
          verified.amountMinor !== refund.amountMinor ||
          verified.currency !== refund.currency
        )
          throw new ConflictException("Refund verification mismatch");
        status = verified.status;
        providerReference = verified.reference;
        if (status === "SUCCEEDED") {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status:
                total === payment.amountMinor
                  ? "REFUNDED"
                  : "PARTIALLY_REFUNDED",
            },
          });
        }
      } else {
        status = action === "approve" ? "APPROVED" : "REJECTED";
        if (refund.status === status) return jsonMoney(refund);
        if (
          refund.status !== "REQUESTED" &&
          !(action === "reject" && refund.status === "APPROVED")
        )
          throw new ConflictException(
            "Refund state does not permit this action",
          );
        if (action === "approve")
          await this.checkBalance(
            tx,
            payment,
            refund.amountMinor,
            held,
            refund.id,
          );
      }
      const updated = await tx.refund.update({
        where: { id: refund.id },
        data: { status, ...(providerReference && { providerReference }) },
      });
      await commerceAudit(tx, orderId, "REFUND_" + status, actorId, {
        refund: ref,
        amountMinor: refund.amountMinor.toString(),
      });
      await notify(
        tx,
        payment.order.customerId,
        `refund:${refund.id}:${status}`,
        "Sandbox refund updated",
        `Sandbox refund ${ref} is now ${status.toLowerCase()}. No funds were moved.`,
      );
      return jsonMoney(updated);
    });
  }

  async list(input: { status?: RefundStatus | undefined; page: number }) {
    return jsonMoney(
      await this.prisma.refund.findMany({
        where: input.status ? { status: input.status } : {},
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (input.page - 1) * 25,
        take: 25,
        include: {
          payment: {
            select: { reference: true, order: { select: { reference: true } } },
          },
        },
      }),
    );
  }
}
