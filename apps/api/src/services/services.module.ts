import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthModule } from "../auth/auth.module";
import { AuthRequest, SessionGuard, StaffGuard } from "../auth/auth.guard";
import { validate } from "../inventory/inventory.schemas";
import {
  messageInput,
  milestoneInput,
  quoteInput,
  requestFilters,
  requestInput,
  ServicesService,
  triageInput,
} from "./services.service";

@ApiTags("Professional services")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("account/services")
class CustomerServicesController {
  constructor(private readonly services: ServicesService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  mine(@Req() request: AuthRequest) {
    return this.services.mine(request.principal.id);
  }
  @Post()
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.services.create(
      request.principal.id,
      validate(requestInput, body),
    );
  }
  @Post(":ref/replies")
  reply(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.services.reply(
      ref,
      request.principal.id,
      validate(messageInput, body).message,
    );
  }
  @Post(":ref/quotes/:quote/decision")
  decide(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Param("quote") quote: string,
    @Body() body: unknown,
  ) {
    return this.services.decide(
      ref,
      quote,
      request.principal.id,
      validate(
        z.object({ action: z.enum(["accept", "reject"]) }).strict(),
        body,
      ).action,
    );
  }
}

@ApiTags("Staff professional services")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin/services")
class StaffServicesController {
  constructor(private readonly services: ServicesService) {}
  private actor(request: AuthRequest) {
    if (!request.principal.permissions.includes("services:manage"))
      throw new ForbiddenException();
    return request.principal.id;
  }
  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthRequest, @Query() query: unknown) {
    this.actor(request);
    return this.services.staff(validate(requestFilters, query));
  }
  @Patch(":ref")
  triage(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.services.triage(
      ref,
      this.actor(request),
      validate(triageInput, body),
    );
  }
  @Post(":ref/quotes")
  quote(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.services.quote(
      ref,
      this.actor(request),
      validate(quoteInput, body),
    );
  }
  @Post(":ref/milestones")
  create(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Body() body: unknown,
  ) {
    return this.services.milestone(
      ref,
      this.actor(request),
      validate(milestoneInput, body),
    );
  }
  @Patch(":ref/milestones/:id")
  update(
    @Req() request: AuthRequest,
    @Param("ref") ref: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.services.milestone(
      ref,
      this.actor(request),
      validate(milestoneInput, body),
      id,
    );
  }
}
@Module({
  imports: [AuthModule],
  controllers: [CustomerServicesController, StaffServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
