import {
  Action,
  availableActions,
  ListingInput,
  transitions,
} from "@marketplace/inventory";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.module";
import { bulk, filters, location } from "./inventory.schemas";
import {
  detailRelation,
  listingData,
  listingInclude,
  ListingRecord,
  requirePublishable,
  serialize,
} from "./listing";

export type Tx = Prisma.TransactionClient;

export function audit(
  tx: Tx,
  listingId: string,
  actorId: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  return tx.listingAudit.create({
    data: { listingId, actorId, action, metadata },
  });
}

export async function findListing(tx: Tx, id: string): Promise<ListingRecord> {
  const listing = await tx.listing.findUnique({
    where: { id },
    include: listingInclude,
  });
  if (!listing) throw new NotFoundException("Listing not found");
  return listing;
}

export async function lockListing(tx: Tx, id: string, version: number) {
  const updated = await tx.listing.updateMany({
    where: { id, version },
    data: { version: { increment: 1 } },
  });
  if (!updated.count) {
    if (!(await tx.listing.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException("Listing not found");
    throw new ConflictException("Listing changed. Reload before trying again.");
  }
  return findListing(tx, id);
}

export function requireEditable(status: ListingRecord["status"]) {
  if (
    !["DRAFT", "PUBLISHED", "UNPUBLISHED", "RESERVED", "EXPIRED"].includes(
      status,
    )
  ) {
    throw new ConflictException("This listing is closed to edits");
  }
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: z.infer<typeof filters>) {
    const { category, status, q, page, pageSize, locationId, featured } =
      filter;
    const where: Prisma.ListingWhereInput = {
      ...(category && { category }),
      ...(status && { status }),
      ...(locationId && { locationId }),
      ...(featured !== undefined && { featured }),
      ...(q && {
        OR: ["title", "reference"].map((field) => ({
          [field]: { contains: q, mode: "insensitive" },
        })),
      }),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.listing.findMany({
          where,
          include: listingInclude,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.listing.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return { items: rows.map(serialize), total, page, pageSize };
  }

  async get(id: string) {
    return serialize(await findListing(this.prisma, id));
  }

  locations() {
    return this.prisma.location.findMany({
      orderBy: [{ country: "asc" }, { region: "asc" }, { city: "asc" }],
      select: { id: true, country: true, city: true, region: true },
    });
  }

  createLocation(input: z.infer<typeof location>) {
    const key = JSON.stringify([
      input.country,
      input.region.toLowerCase(),
      input.city.toLowerCase(),
    ]);
    return this.prisma.location.upsert({
      where: { key },
      create: { ...input, key },
      update: {},
      select: { id: true, country: true, city: true, region: true },
    });
  }

  private async checkLocation(tx: Tx, id: string | null) {
    if (
      id &&
      !(await tx.location.findUnique({ where: { id }, select: { id: true } }))
    )
      throw new NotFoundException("Location not found");
  }

  async create(input: ListingInput, actorId: string) {
    const prefix = {
      PROPERTY: "PROP",
      LAND: "LAND",
      VEHICLE: "VEH",
      SERVICE: "SVC",
    }[input.category];
    const slugBase =
      input.title
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 85)
        .replace(/^-|-$/g, "") || input.category.toLowerCase();
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = randomBytes(3).toString("hex");
      try {
        return await this.prisma.$transaction(async (tx) => {
          await this.checkLocation(tx, input.locationId);
          const listing = await tx.listing.create({
            data: {
              ...listingData(input),
              category: input.category,
              createdById: actorId,
              reference: `${prefix}-${year}-${suffix.toUpperCase()}`,
              slug: `${slugBase}-${year}-${suffix}`,
              [detailRelation[input.category]]: {
                create: { data: input.details },
              },
            },
            include: listingInclude,
          });
          await audit(tx, listing.id, actorId, "CREATE");
          return serialize(listing);
        });
      } catch (error) {
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
        )
          throw error;
      }
    }
    throw new ConflictException(
      "Could not allocate a unique listing reference. Please retry.",
    );
  }

  update(id: string, input: ListingInput, version: number, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await lockListing(tx, id, version);
      requireEditable(previous.status);
      if (previous.category !== input.category)
        throw new ConflictException("Listing category is fixed after creation");
      await this.checkLocation(tx, input.locationId);
      const row = await tx.listing.update({
        where: { id },
        data: {
          ...listingData(input),
          [detailRelation[input.category]]: { update: { data: input.details } },
        },
        include: listingInclude,
      });
      const listing = serialize(row);
      if (row.status === "PUBLISHED" || row.status === "RESERVED")
        requirePublishable(listing);
      await audit(tx, id, actorId, "UPDATE", {
        previousPriceMinor: previous.priceMinor?.toString() ?? null,
        priceMinor: listing.priceMinor,
        previousCurrency: previous.currency,
        currency: listing.currency,
        featured: listing.featured,
      });
      return listing;
    });
  }

  private async applyAction(
    tx: Tx,
    row: ListingRecord,
    action: Action | "feature" | "unfeature",
    actorId: string,
  ) {
    if (action === "feature" || action === "unfeature") {
      requireEditable(row.status);
      await tx.listing.update({
        where: { id: row.id },
        data: { featured: action === "feature" },
      });
      await audit(tx, row.id, actorId, action.toUpperCase());
    } else {
      const listing = serialize(row);
      if (!availableActions(listing).includes(action))
        throw new ConflictException(
          `Cannot ${action} a ${row.status.toLowerCase()} ${row.category.toLowerCase()}`,
        );
      if (action === "publish" || action === "release" || action === "reserve")
        requirePublishable(listing);
      const status = transitions[action].to;
      await tx.listing.update({
        where: { id: row.id },
        data: {
          status,
          ...(action === "publish" && {
            publishedAt: new Date(),
            publishedById: actorId,
          }),
        },
      });
      await audit(tx, row.id, actorId, action.toUpperCase(), {
        before: row.status,
        after: status,
      });
    }
  }

  change(id: string, action: Action, version: number, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.applyAction(
        tx,
        await lockListing(tx, id, version),
        action,
        actorId,
      );
      return serialize(await findListing(tx, id));
    });
  }

  bulk(input: z.infer<typeof bulk>, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        for (const { id, version } of [...input.listings].sort((a, b) =>
          a.id.localeCompare(b.id),
        )) {
          await this.applyAction(
            tx,
            await lockListing(tx, id, version),
            input.action,
            actorId,
          );
        }
        return { count: input.listings.length };
      },
      { timeout: 15_000 },
    );
  }

  async auditLog(id: string) {
    if (
      !(await this.prisma.listing.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Listing not found");
    return this.prisma.listingAudit.findMany({
      where: { listingId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }
}
