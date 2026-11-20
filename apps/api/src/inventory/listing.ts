import {
  Category,
  detailSchemas,
  Listing,
  ListingInput,
} from "@marketplace/inventory";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const listingInclude = {
  property: true,
  land: true,
  vehicle: true,
  service: true,
  location: { select: { id: true, country: true, region: true, city: true } },
  media: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      contentType: true,
      state: true,
      alt: true,
      cover: true,
      position: true,
    },
  },
} satisfies Prisma.ListingInclude;
export type ListingRecord = Prisma.ListingGetPayload<{
  include: typeof listingInclude;
}>;

export const detailRelation = {
  PROPERTY: "property",
  LAND: "land",
  VEHICLE: "vehicle",
  SERVICE: "service",
} as const satisfies Record<Category, keyof ListingRecord>;

export function serialize(row: ListingRecord): Listing {
  return {
    id: row.id,
    reference: row.reference,
    slug: row.slug,
    version: row.version,
    status: row.status,
    category: row.category,
    details: row[detailRelation[row.category]]?.data ?? {},
    title: row.title,
    description: row.description,
    currency: row.currency,
    priceMinor: row.priceMinor?.toString() ?? null,
    locationId: row.locationId,
    location: row.location,
    featured: row.featured,
    verificationScope: row.verificationScope,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    media: row.media,
  } as Listing;
}

export function requirePublishable(listing: Listing) {
  const fields: Record<string, string> = {};
  const details = detailSchemas[listing.category].safeParse(listing.details);
  if (!details.success) {
    for (const issue of details.error.issues)
      fields[`details.${issue.path.join(".")}`] = issue.message;
  }
  if (!listing.description) fields.description = "Enter a description";
  if (!listing.locationId) fields.locationId = "Select a location";
  const quoted =
    listing.category === "SERVICE" && listing.details.pricingModel === "QUOTE";
  if (quoted && listing.priceMinor !== null)
    fields.priceMinor = "Clear the price for quote-only services";
  if (!quoted && (listing.priceMinor === null || listing.priceMinor === "0"))
    fields.priceMinor = "Enter a positive price";
  if (listing.expiresAt && Date.parse(listing.expiresAt) <= Date.now())
    fields.expiresAt = "Choose a future expiry";
  if (
    !listing.media.some(
      ({ kind, state, cover }) =>
        kind === "IMAGE" && state === "READY" && cover,
    )
  )
    fields.media = "Choose a ready cover image";
  if (listing.media.some(({ state, alt }) => state === "READY" && !alt.trim()))
    fields.mediaAlt = "Provide alternative text for every ready file";
  if (Object.keys(fields).length)
    throw new BadRequestException({
      message: "Listing is not ready to publish",
      fields,
    });
}

export function listingData(input: ListingInput) {
  return {
    title: input.title,
    description: input.description,
    locationId: input.locationId,
    priceMinor: input.priceMinor === null ? null : BigInt(input.priceMinor),
    currency: input.currency,
    featured: input.featured,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    verificationScope: input.verificationScope,
  };
}
