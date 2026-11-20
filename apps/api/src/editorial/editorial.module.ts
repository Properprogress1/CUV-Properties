import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { AuthModule } from "../auth/auth.module";
import { AuthRequest, SessionGuard, StaffGuard } from "../auth/auth.guard";
import { validate } from "../inventory/inventory.schemas";
import {
  changeEntry,
  EditorialService,
  editorialFilters,
  inventoryFilters,
  metricInput,
  newEntry,
  publication,
  range,
  slug,
} from "./editorial.service";

@ApiTags("Editorial content")
@Controller("content")
class PublicContentController {
  constructor(private readonly editorial: EditorialService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list() {
    return this.editorial.publicContent();
  }
  @Get(":slug")
  @Header("Cache-Control", "no-store")
  page(@Param("slug") value: string) {
    return this.editorial.page(validate(slug, value));
  }
}

@ApiTags("Analytics")
@Controller("analytics")
class AnalyticsController {
  constructor(private readonly editorial: EditorialService) {}
  @Post("events")
  @HttpCode(204)
  track(@Body() body: unknown) {
    return this.editorial.metric(validate(metricInput, body));
  }
}

function download(body: string, filename: string) {
  return new StreamableFile(Buffer.from(body), {
    type: "text/csv; charset=utf-8",
    disposition: 'attachment; filename="' + filename + '"',
  });
}

@ApiTags("Staff editorial and analytics")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin")
class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  private actor(request: AuthRequest, ...permissions: string[]) {
    if (
      !permissions.every((permission) =>
        request.principal.permissions.includes(permission),
      )
    )
      throw new ForbiddenException();
    return request.principal.id;
  }
  @Get("content")
  @Header("Cache-Control", "private, no-store")
  list(@Req() r: AuthRequest, @Query() query: unknown) {
    this.actor(r, "content:manage");
    return this.editorial.list(validate(editorialFilters, query));
  }
  @Post("content")
  create(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.editorial.create(
      this.actor(r, "content:manage"),
      validate(newEntry, body),
    );
  }
  @Patch("content/:slug")
  change(
    @Req() r: AuthRequest,
    @Param("slug") value: string,
    @Body() body: unknown,
  ) {
    return this.editorial.mutate(
      this.actor(r, "content:manage"),
      validate(slug, value),
      validate(changeEntry, body),
    );
  }
  @Post("content/:slug/publication")
  @HttpCode(200)
  publish(
    @Req() r: AuthRequest,
    @Param("slug") value: string,
    @Body() body: unknown,
  ) {
    return this.editorial.mutate(
      this.actor(r, "content:manage"),
      validate(slug, value),
      validate(publication, body),
    );
  }
  @Get("reports")
  @Header("Cache-Control", "private, no-store")
  report(@Req() r: AuthRequest, @Query() query: unknown) {
    this.actor(r, "analytics:read");
    return this.editorial.report(validate(range, query));
  }
  @Get("reports/summary.csv")
  @Header("Cache-Control", "private, no-store")
  async reportCsv(@Req() r: AuthRequest, @Query() query: unknown) {
    return download(
      await this.editorial.exportReport(
        this.actor(r, "analytics:read", "analytics:export"),
        validate(range, query),
      ),
      "marketplace-summary.csv",
    );
  }
  @Get("reports/inventory.csv")
  @Header("Cache-Control", "private, no-store")
  async inventoryCsv(@Req() r: AuthRequest, @Query() query: unknown) {
    return download(
      await this.editorial.exportInventory(
        this.actor(r, "inventory:read", "analytics:export"),
        validate(inventoryFilters, query),
      ),
      "marketplace-inventory.csv",
    );
  }
}

@Module({
  imports: [AuthModule],
  controllers: [
    PublicContentController,
    AnalyticsController,
    EditorialController,
  ],
  providers: [EditorialService],
})
export class EditorialModule {}
