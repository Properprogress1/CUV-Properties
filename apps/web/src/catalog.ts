import {
  catalogQuery,
  categories,
  type CatalogPage,
  type Category,
  type PublicListing,
} from "@marketplace/inventory";

export const verticals = {
  PROPERTY: {
    slug: "properties",
    name: "Properties",
    subtitle: "Homes and commercial spaces",
    icon: "⌂",
  },
  LAND: {
    slug: "land",
    name: "Land",
    subtitle: "Plots and development sites",
    icon: "◇",
  },
  VEHICLE: {
    slug: "vehicles",
    name: "Vehicles",
    subtitle: "Cars and utility vehicles",
    icon: "↗",
  },
  SERVICE: {
    slug: "services",
    name: "Services",
    subtitle: "Planning and professional expertise",
    icon: "✳",
  },
} as const;

export function browsePath(category?: Category) {
  return category ? "/browse/" + verticals[category].slug : "/browse";
}

export function resolveCategory(slug: string) {
  return categories.find((category) => verticals[category].slug === slug);
}

export const apiOrigin = (
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001"
).replace(/\/$/, "");
export const siteOrigin =
  process.env.MARKETPLACE_SITE_URL || "http://localhost:3000";
const dataOrigin = (
  process.env.MARKETPLACE_INTERNAL_API_ORIGIN || apiOrigin
).replace(/\/$/, "");

export function mediaUrl(slug: string, id: string) {
  return (
    apiOrigin +
    "/api/v1/listings/" +
    encodeURIComponent(slug) +
    "/media/" +
    encodeURIComponent(id)
  );
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function searchQuery(raw: SearchParams, category?: Category) {
  return catalogQuery.safeParse({
    ...Object.fromEntries(
      Object.entries(raw).filter(
        ([, value]) => value !== "" && value !== undefined,
      ),
    ),
    ...(category && { category }),
  });
}

export async function catalog(query: URLSearchParams): Promise<CatalogPage> {
  const response = await fetch(dataOrigin + "/api/v1/listings?" + query, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Catalog request failed");
  return response.json();
}

export async function listing(slug: string): Promise<PublicListing | null> {
  const response = await fetch(
    dataOrigin + "/api/v1/listings/" + encodeURIComponent(slug),
    { cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Listing request failed");
  return response.json();
}

export function price(listing: Pick<PublicListing, "priceMinor" | "currency">) {
  if (listing.priceMinor === null) return "Price on request";
  const formatter = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: listing.currency,
  });
  const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(Number(listing.priceMinor) / 10 ** decimals);
}

export function human(text: string) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
}
