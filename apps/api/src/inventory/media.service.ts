import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.module";
import { gallery } from "./inventory.schemas";
import {
  audit,
  findListing,
  lockListing,
  requireEditable,
} from "./inventory.service";
import { requirePublishable, serialize } from "./listing";

export const maxFileSize = 8 * 1024 * 1024;
const maxPixels = 16_000_000;

function isMp4(buffer: Buffer) {
  const boxes = new Set<string>();
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (size < 8 || size > buffer.length - offset) return false;
    if (
      offset === 0 &&
      (type !== "ftyp" ||
        size < 16 ||
        !/^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(
          buffer.toString("ascii", 8, 12),
        ))
    )
      return false;
    if (size > 8) boxes.add(type);
    offset += size;
  }
  return (
    offset === buffer.length &&
    ["ftyp", "moov", "mdat"].every((type) => boxes.has(type))
  );
}

function imageFormat(buffer: Buffer) {
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a")
    return "png";
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "jpeg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return undefined;
}

async function inspect(buffer: Buffer) {
  if (buffer.length === 0 || buffer.length > maxFileSize)
    throw new BadRequestException("File must be between 1 byte and 8 MB");
  if (isMp4(buffer))
    return { kind: "VIDEO" as const, type: "video/mp4", contents: buffer };
  try {
    const signature = imageFormat(buffer);
    if (!signature) throw new Error();
    const input = sharp(buffer, {
      limitInputPixels: maxPixels,
      failOn: "warning",
    });
    const { format, width, height, pages } = await input.metadata();
    if (!width || !height || (pages ?? 1) !== 1 || format !== signature)
      throw new Error();
    const contents = await input.rotate().webp({ quality: 88 }).toBuffer();
    if (contents.length > maxFileSize) throw new Error();
    return { kind: "IMAGE" as const, type: "image/webp", contents };
  } catch {
    throw new BadRequestException(
      "Upload a valid JPEG, PNG, WebP, or MP4 file. Images must be at most 16 megapixels.",
    );
  }
}

function root() {
  if (process.env.NODE_ENV === "production")
    throw new ServiceUnavailableException("Media storage is not configured");
  return resolve(process.env.MEDIA_LOCAL_DIR || ".local-media");
}

function filePath(key: string) {
  if (!z.string().uuid().safeParse(key).success)
    throw new NotFoundException("Media not found");
  return resolve(root(), key);
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    id: string,
    version: number,
    alt: string,
    buffer: Buffer,
    actorId: string,
  ) {
    const directory = root();
    const existing = await findListing(this.prisma, id);
    requireEditable(existing.status);
    if (existing.media.length >= 24)
      throw new BadRequestException("A listing can contain up to 24 files");
    const file = await inspect(buffer);
    const objectKey = randomUUID();
    const path = filePath(objectKey);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path, file.contents, { flag: "wx", mode: 0o600 });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const listing = await lockListing(tx, id, version);
        requireEditable(listing.status);
        if (listing.media.length >= 24)
          throw new BadRequestException("A listing can contain up to 24 files");
        const media = await tx.listingMedia.create({
          data: {
            listingId: id,
            objectKey,
            kind: file.kind,
            contentType: file.type,
            state: "READY",
            alt,
            cover:
              file.kind === "IMAGE" &&
              !listing.media.some(({ cover }) => cover),
            position:
              Math.max(-1, ...listing.media.map(({ position }) => position)) +
              1,
          },
        });
        const result = serialize(await findListing(tx, id));
        if (result.status === "PUBLISHED" || result.status === "RESERVED")
          requirePublishable(result);
        await audit(tx, id, actorId, "MEDIA_UPLOAD", {
          mediaId: media.id,
          kind: media.kind,
        });
        return result;
      });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }

  async file(id: string, mediaId: string) {
    const stored = await this.prisma.listingMedia.findFirst({
      where: { listingId: id, id: mediaId, state: "READY" },
    });
    if (!stored) throw new NotFoundException("Media not found");
    try {
      return {
        buffer: await readFile(filePath(stored.objectKey)),
        type: stored.contentType,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new NotFoundException("Media file is unavailable");
      throw error;
    }
  }

  edit(id: string, input: z.infer<typeof gallery>, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await lockListing(tx, id, input.version);
      requireEditable(listing.status);
      const media = new Map(listing.media.map((item) => [item.id, item]));
      if (
        input.items.length !== media.size ||
        input.items.some((item) => !media.has(item.id))
      )
        throw new BadRequestException(
          "The order must contain every item in this listing",
        );
      if (
        input.items.some(
          (item) =>
            item.cover &&
            (media.get(item.id)?.kind !== "IMAGE" ||
              media.get(item.id)?.state !== "READY"),
        )
      ) {
        throw new BadRequestException("The cover must be a ready image");
      }
      await tx.listingMedia.updateMany({
        where: { listingId: id, cover: true },
        data: { cover: false },
      });
      for (const [position, item] of input.items.entries()) {
        await tx.listingMedia.update({
          where: { id: item.id },
          data: { position, alt: item.alt, cover: item.cover },
        });
      }
      const result = serialize(await findListing(tx, id));
      if (result.status === "PUBLISHED" || result.status === "RESERVED")
        requirePublishable(result);
      await audit(tx, id, actorId, "MEDIA_REORDER", {
        order: input.items.map((item) => item.id),
        cover: input.items.find((item) => item.cover)?.id ?? null,
      });
      return result;
    });
  }

  async delete(id: string, mediaId: string, version: number, actorId: string) {
    root();
    const { result, key } = await this.prisma.$transaction(async (tx) => {
      const listing = await lockListing(tx, id, version);
      requireEditable(listing.status);
      const media = await tx.listingMedia.findFirst({
        where: { id: mediaId, listingId: id },
      });
      if (!media) throw new NotFoundException("Media not found");
      await tx.listingMedia.delete({ where: { id: mediaId } });
      const result = serialize(await findListing(tx, id));
      if (result.status === "PUBLISHED" || result.status === "RESERVED")
        requirePublishable(result);
      await audit(tx, id, actorId, "MEDIA_DELETE", { mediaId });
      return { result, key: media.objectKey };
    });
    await unlink(filePath(key)).catch(() => undefined);
    return result;
  }
}
