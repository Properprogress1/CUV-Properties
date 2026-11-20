import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { PaymentStatus, RefundStatus } from "@prisma/client";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { AuthRequest, SessionGuard, StaffGuard } from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";
import { validate } from "../inventory/inventory.schemas";
import { CommerceService } from "./commerce.service";
import { money, SandboxProvider, statuses } from "./provider";
import { receiptPdf } from "./receipt";
import { RefundService } from "./refund.service";

const key = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const slug = z.string().regex(/^[a-z0-9-]{1,140}$/);
const refundInput = z
  .object({
    key,
    amountMinor: money,
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();
const page = z.coerce.number().int().min(1).max(1000).default(1);

@ApiTags("Commerce")
@Controller("commerce")
class OfferController {
  constructor(private readonly commerce: CommerceService) {}

  @Get("offers/:slug")
  @Header("Cache-Control", "no-store")
  offer(@Param("slug") value: string) {
    return this.commerce.offer(validate(slug, value));
  }
}

@ApiTags("Payment webhooks")
@Controller("payments/webhook")
class PaymentWebhookController {
  constructor(
    private readonly provider: SandboxProvider,
    private readonly commerce: CommerceService,
  ) {}

  @Post("sandbox")
  @HttpCode(200)
  webhook(
    @Req() request: RawBodyRequest<IncomingMessage>,
    @Headers("x-payment-timestamp") timestamp: string | undefined,
    @Headers("x-payment-signature") signature: string | undefined,
  ) {
    if (!request.rawBody || request.rawBody.length > 8192)
      throw new BadRequestException("Invalid payment payload");
    return this.commerce.applyEvent(
      this.provider.verifyWebhook(
        request.rawBody,
        timestamp ?? "",
        signature ?? "",
      ),
    );
  }
}

@ApiTags("Commerce")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("commerce")
class CustomerCommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly refunds: RefundService,
  ) {}

  @Post("checkout")
  checkout(@Req() r: AuthRequest, @Body() body: unknown) {
    const input = validate(z.object({ slug, key }).strict(), body);
    return this.commerce.checkout(r.principal.id, input.slug, input.key);
  }

  @Post("orders/:ref/payments")
  retry(
    @Req() r: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.commerce.retry(
      r.principal.id,
      ref,
      validate(z.object({ key }).strict(), body).key,
    );
  }

  @Get("orders")
  @Header("Cache-Control", "no-store")
  orders(@Req() r: AuthRequest) {
    return this.commerce.orders(r.principal.id);
  }

  @Get("payments/:ref")
  @Header("Cache-Control", "no-store")
  payment(@Req() r: AuthRequest, @Param("ref") ref: string) {
    return this.commerce.payment(r.principal.id, ref);
  }

  @Post("sandbox/:ref/outcome")
  @HttpCode(200)
  simulate(
    @Req() r: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.commerce.simulate(
      r.principal.id,
      ref,
      validate(z.object({ outcome: z.enum(statuses) }).strict(), body).outcome,
    );
  }

  @Get("receipts/:ref.pdf")
  @Header("Cache-Control", "private, no-store")
  async receipt(@Req() r: AuthRequest, @Param("ref") ref: string) {
    const receipt = await this.commerce.receipt(r.principal.id, ref);
    return new StreamableFile(receiptPdf(receipt), {
      type: "application/pdf",
      disposition: `attachment; filename="${receipt.reference}.pdf"`,
    });
  }

  @Post("payments/:ref/refunds")
  refund(
    @Req() r: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.refunds.request(
      ref,
      r.principal.id,
      validate(refundInput, body),
    );
  }
}

@ApiTags("Staff commerce")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin/commerce")
class StaffCommerceController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly refunds: RefundService,
  ) {}

  private authorize(r: AuthRequest, permission: string) {
    if (!r.principal.permissions.includes("commerce:" + permission))
      throw new ForbiddenException();
    return r.principal.id;
  }

  @Get("payments")
  @Header("Cache-Control", "no-store")
  payments(@Req() r: AuthRequest, @Query() query: unknown) {
    this.authorize(r, "reconcile");
    return this.commerce.reconciliation(
      validate(
        z
          .object({ page, status: z.nativeEnum(PaymentStatus).optional() })
          .strict(),
        query,
      ),
    );
  }

  @Post("payments/:ref/reconcile")
  @HttpCode(200)
  reconcile(@Req() r: AuthRequest, @Param("ref") ref: string) {
    return this.commerce.reconcile(ref, this.authorize(r, "reconcile"));
  }

  @Get("orders/:ref/audit")
  @Header("Cache-Control", "no-store")
  audit(@Req() r: AuthRequest, @Param("ref") ref: string) {
    this.authorize(r, "reconcile");
    return this.commerce.audit(ref);
  }

  @Get("refunds")
  @Header("Cache-Control", "no-store")
  listRefunds(@Req() r: AuthRequest, @Query() query: unknown) {
    this.authorize(r, "refund");
    return this.refunds.list(
      validate(
        z
          .object({ page, status: z.nativeEnum(RefundStatus).optional() })
          .strict(),
        query,
      ),
    );
  }

  @Post("payments/:ref/refunds")
  requestRefund(
    @Req() r: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.refunds.request(
      ref,
      this.authorize(r, "refund"),
      validate(refundInput, body),
      true,
    );
  }

  @Post("refunds/:ref/actions")
  @HttpCode(200)
  changeRefund(
    @Req() r: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    const input = validate(
      z
        .object({
          action: z.enum(["approve", "reject", "process"]),
          sandboxOutcome: z.enum(["SUCCEEDED", "FAILED"]).optional(),
        })
        .strict(),
      body,
    );
    if (input.sandboxOutcome && input.action !== "process")
      throw new BadRequestException(
        "Sandbox outcomes apply only to processing",
      );
    const actor = this.authorize(
      r,
      input.action === "process" ? "refund-process" : "refund-approve",
    );
    return this.refunds.change(ref, input.action, actor, input.sandboxOutcome);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [
    OfferController,
    PaymentWebhookController,
    CustomerCommerceController,
    StaffCommerceController,
  ],
  providers: [CommerceService, RefundService, SandboxProvider],
})
export class CommerceModule {}
