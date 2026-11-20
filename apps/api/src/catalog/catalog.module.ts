import {
  CatalogQuery,
  catalogQuery,
  PublicListing,
} from "@marketplace/inventory";
import {
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { InventoryModule } from "../inventory/inventory.module";
import { validate } from "../inventory/inventory.schemas";
import {
  detailRelation,
  listingInclude,
  ListingRecord,
} from "../inventory/listing";
import { MediaService } from "../inventory/media.service";
import { PrismaService } from "../prisma/prisma.module";

const publicFields = {
  PROPERTY: [
    "propertyType",
    "offer",
    "bedrooms",
    "bathrooms",
    "toilets",
    "parking",
    "buildingAreaSqm",
    "landAreaSqm",
    "furnishing",
    "amenities",
    "yearBuilt",
  ],
  LAND: [
    "landUse",
    "area",
    "areaUnit",
    "dimensions",
    "zoning",
    "terrain",
    "roadAccess",
    "utilities",
    "titleType",
    "titleVerification",
    "estate",
  ],
  VEHICLE: [
    "make",
    "model",
    "year",
    "mileageKm",
    "transmission",
    "fuel",
    "bodyType",
    "engineCapacityCc",
    "color",
    "condition",
    "registration",
    "disclosures",
  ],
  SERVICE: [
    "serviceType",
    "scope",
    "pricingModel",
    "deliverables",
    "areaServed",
    "duration",
    "requirements",
  ],
} as const;

export function publicListingWhere(now: Date): Prisma.ListingWhereInput {
  return {
    status: "PUBLISHED",
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    ...(process.env.NODE_ENV === "production" && { isDemo: false }),
  };
}

function project(row: ListingRecord): PublicListing {
  const data = row[detailRelation[row.category]]?.data;
  const details: PublicListing["details"] = {};
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const name of publicFields[row.category]) {
      const value = data[name];
      if (typeof value === "string" || typeof value === "number")
        details[name] = value;
    }
  }
  return {
    reference: row.reference,
    slug: row.slug,
    category: row.category,
    title: row.title,
    description: row.description,
    currency: row.currency,
    priceMinor: row.priceMinor?.toString() ?? null,
    featured: row.featured,
    isDemo: row.isDemo,
    verificationScope: row.verificationScope,
    location: row.location && {
      country: row.location.country,
      region: row.location.region,
      city: row.location.city,
    },
    publishedAt: row.publishedAt!.toISOString(),
    details,
    media: row.media
      .filter((item) => item.state === "READY")
      .map(({ id, kind, alt, cover }) => ({ id, kind, alt, cover })),
  };
}

function filters(input: CatalogQuery): Prisma.ListingWhereInput[] {
  const where: Prisma.ListingWhereInput[] = [];
  if (input.category) where.push({ category: input.category });
  if (input.city)
    where.push({
      location: { city: { equals: input.city, mode: "insensitive" } },
    });
  if (input.minPrice || input.maxPrice || input.sort.startsWith("price-")) {
    where.push({ currency: input.currency });
    where.push({
      priceMinor: {
        ...(input.minPrice ? { gte: BigInt(input.minPrice) } : {}),
        ...(input.maxPrice ? { lte: BigInt(input.maxPrice) } : {}),
      },
    });
  }
  if (input.q) {
    const search = input.q;
    const text = { contains: search, mode: "insensitive" } as const;
    const structured = [
      ...["propertyType", "offer", "furnishing", "amenities"].map((key) => ({
        property: {
          data: {
            path: [key],
            string_contains: search,
            mode: "insensitive" as const,
          },
        },
      })),
      ...["landUse", "zoning", "estate"].map((key) => ({
        land: {
          data: {
            path: [key],
            string_contains: search,
            mode: "insensitive" as const,
          },
        },
      })),
      ...["make", "model", "transmission", "fuel"].map((key) => ({
        vehicle: {
          data: {
            path: [key],
            string_contains: search,
            mode: "insensitive" as const,
          },
        },
      })),
      ...["serviceType", "scope", "areaServed"].map((key) => ({
        service: {
          data: {
            path: [key],
            string_contains: search,
            mode: "insensitive" as const,
          },
        },
      })),
    ];
    where.push({
      OR: [
        { title: text },
        { reference: text },
        { description: text },
        {
          location: {
            OR: [{ city: text }, { region: text }, { country: text }],
          },
        },
        ...structured,
      ],
    });
  }
  const equal = (field: string, value: string) => ({
    path: [field],
    equals: value,
  });
  const contains = (field: string, value: string) => ({
    path: [field],
    string_contains: value,
    mode: "insensitive" as const,
  });
  if (input.offer)
    where.push({ property: { data: equal("offer", input.offer) } });
  if (input.propertyType)
    where.push({
      property: { data: equal("propertyType", input.propertyType) },
    });
  if (input.bedrooms !== undefined)
    where.push({
      property: { data: { path: ["bedrooms"], gte: input.bedrooms } },
    });
  if (input.landUse)
    where.push({ land: { data: contains("landUse", input.landUse) } });
  if (input.areaUnit)
    where.push({ land: { data: equal("areaUnit", input.areaUnit) } });
  if (input.minArea !== undefined)
    where.push({ land: { data: { path: ["area"], gte: input.minArea } } });
  if (input.make)
    where.push({ vehicle: { data: contains("make", input.make) } });
  if (input.transmission)
    where.push({
      vehicle: { data: contains("transmission", input.transmission) },
    });
  if (input.serviceType)
    where.push({
      service: { data: contains("serviceType", input.serviceType) },
    });
  if (input.pricingModel)
    where.push({
      service: { data: equal("pricingModel", input.pricingModel) },
    });
  return where;
}

@Injectable()
class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: CatalogQuery) {
    const orderBy: Prisma.ListingOrderByWithRelationInput[] = [];
    if (input.sort === "featured") orderBy.push({ featured: "desc" });
    if (input.sort.startsWith("price-"))
      orderBy.push({
        priceMinor: {
          sort: input.sort === "price-low" ? "asc" : "desc",
          nulls: "last",
        },
      });
    orderBy.push({ publishedAt: "desc" }, { id: "asc" });
    const where = { AND: [publicListingWhere(new Date()), ...filters(input)] };
    const { page, pageSize } = input;
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.listing.findMany({
          where,
          include: listingInclude,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.listing.count({ where }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return { items: rows.map(project), total, page, pageSize };
  }

  async detail(slug: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { slug, ...publicListingWhere(new Date()) },
      include: listingInclude,
    });
    if (!listing) throw new NotFoundException("Listing unavailable");
    return project(listing);
  }

  async mediaOwner(slug: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        slug,
        ...publicListingWhere(new Date()),
        media: { some: { id, state: "READY" } },
      },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException("Media unavailable");
    return listing.id;
  }
}

@ApiTags("Public catalog")
@Controller("listings")
class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Query() query: unknown) {
    return this.catalog.list(validate(catalogQuery, query));
  }

  @Get(":slug")
  @Header("Cache-Control", "no-store")
  detail(@Param("slug") slug: string) {
    return this.catalog.detail(slug);
  }

  @Get(":slug/media/:id")
  @Header("Cache-Control", "no-store")
  async file(
    @Param("slug") slug: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const listingId = await this.catalog.mediaOwner(slug, id);
    const file = await this.media.file(listingId, id);
    return new StreamableFile(file.buffer, { type: file.type });
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
