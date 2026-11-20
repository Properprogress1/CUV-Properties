import { z } from "zod";

export const categories = ["PROPERTY", "LAND", "VEHICLE", "SERVICE"] as const;
export const statuses = [
  "DRAFT",
  "PUBLISHED",
  "UNPUBLISHED",
  "RESERVED",
  "SOLD",
  "RENTED",
  "COMPLETED",
  "ARCHIVED",
  "EXPIRED",
] as const;
export const actions = [
  "publish",
  "unpublish",
  "reserve",
  "release",
  "sell",
  "rent",
  "complete",
  "expire",
  "archive",
] as const;
export type Category = (typeof categories)[number];
export type Status = (typeof statuses)[number];
export type Action = (typeof actions)[number];

const text = z.string().trim().min(1).max(200);
const whole = z.number().int().min(0).max(10_000_000);
const quantity = z.number().positive().max(1_000_000_000);
const field = {
  PROPERTY: z
    .object({
      propertyType: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
      offer: z.enum(["SALE", "RENT"]),
      bedrooms: whole.optional(),
      bathrooms: whole.optional(),
      toilets: whole.optional(),
      parking: whole.optional(),
      buildingAreaSqm: quantity.optional(),
      landAreaSqm: quantity.optional(),
      furnishing: text.optional(),
      amenities: text.optional(),
      yearBuilt: z.number().int().min(1800).max(2100).optional(),
    })
    .strict(),
  LAND: z
    .object({
      landUse: text,
      area: quantity,
      areaUnit: z.enum(["SQM", "HECTARE", "ACRE"]),
      dimensions: text.optional(),
      zoning: text.optional(),
      terrain: text.optional(),
      roadAccess: text.optional(),
      utilities: text.optional(),
      titleType: text,
      titleVerification: z.enum(["UNVERIFIED", "DOCUMENT_REVIEWED"]),
      estate: text.optional(),
    })
    .strict(),
  VEHICLE: z
    .object({
      make: text,
      model: text,
      year: z.number().int().min(1886).max(2100),
      mileageKm: whole,
      transmission: text,
      fuel: text,
      bodyType: text.optional(),
      engineCapacityCc: whole.optional(),
      color: text.optional(),
      condition: text,
      registration: text.optional(),
      disclosures: text.optional(),
      vin: z
        .string()
        .trim()
        .regex(/^[A-HJ-NPR-Z0-9]{17}$/i)
        .transform((value) => value.toUpperCase())
        .optional(),
    })
    .strict(),
  SERVICE: z
    .object({
      serviceType: text,
      scope: text,
      pricingModel: z.enum(["FIXED", "STARTING", "QUOTE"]),
      deliverables: text.optional(),
      areaServed: text,
      duration: text.optional(),
      requirements: text.optional(),
    })
    .strict(),
};

const common = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(12_000),
  locationId: z.string().uuid().nullable(),
  priceMinor: z
    .string()
    .regex(/^(0|[1-9]\d{0,14})$/)
    .nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  featured: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  verificationScope: z.string().trim().max(300),
});

export const detailSchemas = field;
export const listingInput = z.discriminatedUnion("category", [
  common
    .extend({
      category: z.literal("PROPERTY"),
      details: field.PROPERTY.partial(),
    })
    .strict(),
  common
    .extend({ category: z.literal("LAND"), details: field.LAND.partial() })
    .strict(),
  common
    .extend({
      category: z.literal("VEHICLE"),
      details: field.VEHICLE.partial(),
    })
    .strict(),
  common
    .extend({
      category: z.literal("SERVICE"),
      details: field.SERVICE.partial(),
    })
    .strict(),
]);
export type ListingInput = z.infer<typeof listingInput>;
export type Listing = ListingInput & {
  id: string;
  reference: string;
  slug: string;
  version: number;
  status: Status;
  updatedAt: string;
  publishedAt: string | null;
  media: ListingMedia[];
  location: Location | null;
};
export type Location = {
  id: string;
  country: string;
  region: string;
  city: string;
};
export type ListingMedia = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  contentType: string;
  state: "PROCESSING" | "READY" | "FAILED";
  alt: string;
  cover: boolean;
  position: number;
};

export const transitions: Record<
  Action,
  { from: readonly Status[]; to: Status }
> = {
  publish: { from: ["DRAFT", "UNPUBLISHED", "EXPIRED"], to: "PUBLISHED" },
  unpublish: { from: ["PUBLISHED", "RESERVED"], to: "UNPUBLISHED" },
  reserve: { from: ["PUBLISHED"], to: "RESERVED" },
  release: { from: ["RESERVED"], to: "PUBLISHED" },
  sell: { from: ["PUBLISHED", "RESERVED"], to: "SOLD" },
  rent: { from: ["PUBLISHED", "RESERVED"], to: "RENTED" },
  complete: { from: ["PUBLISHED", "RESERVED"], to: "COMPLETED" },
  expire: { from: ["PUBLISHED", "RESERVED"], to: "EXPIRED" },
  archive: {
    from: [
      "DRAFT",
      "PUBLISHED",
      "UNPUBLISHED",
      "RESERVED",
      "SOLD",
      "RENTED",
      "COMPLETED",
      "EXPIRED",
    ],
    to: "ARCHIVED",
  },
};

export function availableActions(
  listing: Pick<ListingInput, "category" | "details"> & { status: Status },
) {
  return actions.filter((action) => {
    if (!transitions[action].from.includes(listing.status)) return false;
    const offer =
      "offer" in listing.details ? listing.details.offer : undefined;
    if (action === "sell")
      return (
        listing.category === "VEHICLE" ||
        listing.category === "LAND" ||
        offer === "SALE"
      );
    if (action === "rent")
      return listing.category === "PROPERTY" && offer === "RENT";
    if (action === "complete") return listing.category === "SERVICE";
    return true;
  });
}

export const catalogSorts = [
  "featured",
  "newest",
  "price-low",
  "price-high",
] as const;
export const catalogQuery = z
  .object({
    category: z.enum(categories).optional(),
    q: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("NGN"),
    minPrice: z
      .string()
      .regex(/^\d{1,15}$/)
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d{1,15}$/)
      .optional(),
    offer: z.enum(["SALE", "RENT"]).optional(),
    propertyType: z.enum(["RESIDENTIAL", "COMMERCIAL"]).optional(),
    bedrooms: z.coerce.number().int().min(0).max(100).optional(),
    landUse: z.string().trim().max(200).optional(),
    areaUnit: z.enum(["SQM", "HECTARE", "ACRE"]).optional(),
    minArea: z.coerce.number().positive().max(1_000_000_000).optional(),
    make: z.string().trim().max(100).optional(),
    transmission: z.string().trim().max(100).optional(),
    serviceType: z.string().trim().max(100).optional(),
    pricingModel: z.enum(["FIXED", "STARTING", "QUOTE"]).optional(),
    sort: z.enum(catalogSorts).default("newest"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.minPrice &&
      input.maxPrice &&
      Number(input.minPrice) > Number(input.maxPrice)
    ) {
      context.addIssue({
        code: "custom",
        path: ["maxPrice"],
        message: "Maximum price must be at least the minimum price",
      });
    }
    if (input.minArea && !input.areaUnit) {
      context.addIssue({
        code: "custom",
        path: ["areaUnit"],
        message: "Select an area unit for minimum area",
      });
    }
    const groups = {
      PROPERTY: ["offer", "propertyType", "bedrooms"],
      LAND: ["landUse", "areaUnit", "minArea"],
      VEHICLE: ["make", "transmission"],
      SERVICE: ["serviceType", "pricingModel"],
    } as const;
    for (const [category, keys] of Object.entries(groups)) {
      if (input.category === category) continue;
      for (const key of keys)
        if (input[key] !== undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Choose the matching category for this filter",
          });
        }
    }
  });
export type CatalogQuery = z.infer<typeof catalogQuery>;
export type PublicListing = {
  reference: string;
  slug: string;
  category: Category;
  title: string;
  description: string;
  currency: string;
  priceMinor: string | null;
  featured: boolean;
  isDemo: boolean;
  verificationScope: string;
  location: Omit<Location, "id"> | null;
  publishedAt: string;
  details: Record<string, string | number>;
  media: Pick<ListingMedia, "id" | "kind" | "alt" | "cover">[];
};
export type CatalogPage = {
  items: PublicListing[];
  page: number;
  pageSize: number;
  total: number;
};
