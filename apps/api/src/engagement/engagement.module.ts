import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  AuthRequest,
  readSessionToken,
  SessionGuard,
  StaffGuard,
} from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { validate } from "../inventory/inventory.schemas";
import { AccountService } from "./account.service";
import { EngagementService } from "./engagement.service";
import {
  appointmentFilters,
  askAppointment,
  changeAppointment,
  email,
  enquiry,
  enquiryFilters,
  profile,
  saveSearch,
  staffEnquiry,
  tokenInput,
  version,
} from "./input";

@ApiTags("Engagement")
@Controller("enquiries")
class EnquiryController {
  constructor(
    private readonly service: EngagementService,
    private readonly auth: AuthService,
  ) {}
  @Post()
  async submit(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = validate(enquiry, body);
    const token = readSessionToken(request);
    const principal = token
      ? await this.auth.authenticate(token).catch((error: unknown) => {
          if (error instanceof UnauthorizedException) return undefined;
          throw error;
        })
      : undefined;
    return this.service.submitEnquiry(input, principal);
  }
}

@ApiTags("Customer account")
@Controller("account")
class AccountController {
  constructor(
    private readonly service: EngagementService,
    private readonly links: AccountService,
  ) {}

  @Get("profile")
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @UseGuards(SessionGuard)
  profile(@Req() r: AuthRequest) {
    return this.service.profile(r.principal.id);
  }

  @Patch("profile")
  @ApiCookieAuth()
  @UseGuards(SessionGuard)
  updateProfile(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.updateProfile(r.principal.id, validate(profile, body));
  }

  @Post("forgot-password")
  @HttpCode(204)
  forgot(@Body() body: unknown) {
    const input = validate(z.object({ email }).strict(), body);
    return this.links.send(input.email, "RESET_PASSWORD");
  }

  @Post("reset-password")
  @HttpCode(204)
  reset(@Body() body: unknown) {
    const input = validate(
      tokenInput.extend({ password: z.string().min(12).max(128) }),
      body,
    );
    return this.links.consume(input.token, "RESET_PASSWORD", input.password);
  }

  @Post("send-verification")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  sendVerification(@Req() r: AuthRequest) {
    return this.links.send(r.principal.email, "VERIFY_EMAIL");
  }

  @Post("verify-email")
  @HttpCode(204)
  verify(@Body() body: unknown) {
    return this.links.consume(validate(tokenInput, body).token, "VERIFY_EMAIL");
  }
}

@ApiTags("Customer engagement")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("account")
class CustomerController {
  constructor(private readonly service: EngagementService) {}
  @Get("favourites")
  @Header("Cache-Control", "no-store")
  favourites(@Req() r: AuthRequest) {
    return this.service.favourites(r.principal.id);
  }

  @Put("favourites/:slug")
  @HttpCode(204)
  favourite(@Req() r: AuthRequest, @Param("slug") slug: string) {
    return this.service.favourite(r.principal.id, slug);
  }

  @Delete("favourites/:slug")
  @HttpCode(204)
  removeFavourite(@Req() r: AuthRequest, @Param("slug") slug: string) {
    return this.service.removeFavourite(r.principal.id, slug);
  }

  @Get("saved-searches")
  @Header("Cache-Control", "no-store")
  searches(@Req() r: AuthRequest) {
    return this.service.searches(r.principal.id);
  }

  @Post("saved-searches")
  saveSearch(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.saveSearch(r.principal.id, validate(saveSearch, body));
  }

  @Delete("saved-searches/:id")
  @HttpCode(204)
  removeSearch(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.removeSearch(r.principal.id, id);
  }

  @Get("enquiries")
  @Header("Cache-Control", "no-store")
  enquiries(@Req() r: AuthRequest) {
    return this.service.enquiries(r.principal.id);
  }

  @Get("appointments")
  @Header("Cache-Control", "no-store")
  appointments(@Req() r: AuthRequest) {
    return this.service.appointments(r.principal.id);
  }

  @Post("appointments")
  requestAppointment(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.requestAppointment(
      r.principal.id,
      validate(askAppointment, body),
    );
  }

  @Post("appointments/:id/cancel")
  @HttpCode(200)
  cancel(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.changeAppointment(
      id,
      {
        status: "CANCELLED",
        version: validate(z.object({ version }).strict(), body).version,
      },
      r.principal.id,
      true,
    );
  }

  @Get("notifications")
  @Header("Cache-Control", "no-store")
  inbox(@Req() r: AuthRequest) {
    return this.service.inbox(r.principal.id);
  }

  @Patch("notifications/:id/read")
  @HttpCode(204)
  read(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.markRead(r.principal.id, id);
  }
}

@ApiTags("Staff engagement")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin")
class StaffController {
  constructor(private readonly service: EngagementService) {}

  private authorize(r: AuthRequest, permission: string) {
    if (!r.principal.permissions.includes("engagement:" + permission))
      throw new ForbiddenException();
    return r.principal.id;
  }
  @Get("enquiries")
  @Header("Cache-Control", "no-store")
  enquiries(@Req() r: AuthRequest, @Query() query: unknown) {
    this.authorize(r, "crm");
    return this.service.staffEnquiries(validate(enquiryFilters, query));
  }
  @Patch("enquiries/:id")
  updateEnquiry(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.changeEnquiry(
      id,
      validate(staffEnquiry, body),
      this.authorize(r, "crm"),
    );
  }
  @Get("appointments")
  @Header("Cache-Control", "no-store")
  appointments(@Req() r: AuthRequest, @Query() query: unknown) {
    this.authorize(r, "bookings");
    return this.service.staffAppointments(validate(appointmentFilters, query));
  }
  @Patch("appointments/:id")
  updateAppointment(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.changeAppointment(
      id,
      validate(changeAppointment, body),
      this.authorize(r, "bookings"),
    );
  }
}

@Module({
  imports: [AuthModule],
  controllers: [
    EnquiryController,
    AccountController,
    CustomerController,
    StaffController,
  ],
  providers: [EngagementService, AccountService],
})
export class EngagementModule {}
