import { Action, listingInput } from "@marketplace/inventory";
import {
  BadRequestException,
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
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthRequest, SessionGuard, StaffGuard } from "../auth/auth.guard";
import { AuthModule } from "../auth/auth.module";
import {
  bulk,
  filters,
  gallery,
  listingAction,
  location,
  upload,
  validate,
  version,
} from "./inventory.schemas";
import { InventoryService } from "./inventory.service";
import { maxFileSize, MediaService } from "./media.service";

function requirePermission(request: AuthRequest, permission: string) {
  if (!request.principal.permissions.includes(`inventory:${permission}`))
    throw new ForbiddenException();
  return request.principal.id;
}

function actionPermission(action: Action | "feature" | "unfeature") {
  return action === "feature" || action === "unfeature" ? "write" : "publish";
}

@ApiTags("Inventory")
@ApiCookieAuth()
@UseGuards(SessionGuard, StaffGuard)
@Controller("admin")
class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly media: MediaService,
  ) {}

  @Get("locations")
  @Header("Cache-Control", "no-store")
  locations(@Req() request: AuthRequest) {
    requirePermission(request, "read");
    return this.inventory.locations();
  }

  @Post("locations")
  createLocation(@Req() request: AuthRequest, @Body() body: unknown) {
    requirePermission(request, "write");
    return this.inventory.createLocation(validate(location, body));
  }

  @Get("listings")
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthRequest, @Query() query: unknown) {
    requirePermission(request, "read");
    return this.inventory.list(validate(filters, query));
  }

  @Post("listings")
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    const actor = requirePermission(request, "write");
    return this.inventory.create(validate(listingInput, body), actor);
  }

  @Post("listings/bulk")
  @HttpCode(200)
  bulk(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = validate(bulk, body);
    return this.inventory.bulk(
      input,
      requirePermission(request, actionPermission(input.action)),
    );
  }

  @Get("listings/:id")
  @Header("Cache-Control", "no-store")
  get(@Req() request: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    requirePermission(request, "read");
    return this.inventory.get(id);
  }

  @Patch("listings/:id")
  update(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const actor = requirePermission(request, "write");
    const input = validate(
      z.object({ listing: listingInput, version }).strict(),
      body,
    );
    return this.inventory.update(id, input.listing, input.version, actor);
  }

  @Post("listings/:id/actions")
  @HttpCode(200)
  change(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const actor = requirePermission(request, "publish");
    const input = validate(listingAction, body);
    return this.inventory.change(id, input.action, input.version, actor);
  }

  @Get("listings/:id/audit")
  @Header("Cache-Control", "no-store")
  audit(@Req() request: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    requirePermission(request, "audit");
    return this.inventory.auditLog(id);
  }

  @Post("listings/:id/media")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: maxFileSize, files: 1, fields: 2, fieldSize: 1_024 },
    }),
  )
  upload(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    const actor = requirePermission(request, "media");
    const input = validate(upload, body);
    if (!file?.buffer) throw new BadRequestException("Choose a file");
    return this.media.upload(id, input.version, input.alt, file.buffer, actor);
  }

  @Patch("listings/:id/media")
  editMedia(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const actor = requirePermission(request, "media");
    return this.media.edit(id, validate(gallery, body), actor);
  }

  @Get("listings/:id/media/:mediaId")
  @Header("Cache-Control", "private, no-store")
  async file(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
  ) {
    requirePermission(request, "read");
    const result = await this.media.file(id, mediaId);
    return new StreamableFile(result.buffer, { type: result.type });
  }

  @Delete("listings/:id/media/:mediaId")
  deleteMedia(
    @Req() request: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("mediaId", ParseUUIDPipe) mediaId: string,
    @Body() body: unknown,
  ) {
    const actor = requirePermission(request, "media");
    return this.media.delete(
      id,
      mediaId,
      validate(z.object({ version }).strict(), body).version,
      actor,
    );
  }
}

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, MediaService],
  exports: [MediaService],
})
export class InventoryModule {}
