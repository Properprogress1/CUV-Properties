import type { Category } from "@marketplace/inventory";
import { ArrowRight, Bookmark, SearchX, SlidersHorizontal } from "lucide-react";
import { collections } from "./collections";
import { FilterDrawer } from "./filter-drawer";
import Link from "next/link";
import { CatalogSignal } from "./catalog-signal";
import { SaveSearch } from "./listing-engagement";
import { Cards } from "./cards";
import {
  browsePath,
  catalog,
  SearchParams,
  searchQuery,
  verticals,
} from "./catalog";

const selects: Partial<
  Record<Category, Array<[string, string, Record<string, string>]>>
> = {
  PROPERTY: [
    ["offer", "Offer", { SALE: "For sale", RENT: "For rent" }],
    [
      "propertyType",
      "Property type",
      { RESIDENTIAL: "Residential", COMMERCIAL: "Commercial" },
    ],
  ],
  LAND: [
    [
      "areaUnit",
      "Area unit",
      { SQM: "Square metres", HECTARE: "Hectares", ACRE: "Acres" },
    ],
  ],
  SERVICE: [
    [
      "pricingModel",
      "Pricing",
      { FIXED: "Fixed", STARTING: "Starting price", QUOTE: "By quotation" },
    ],
  ],
};
const extras: Record<Category, Array<[string, string, string?]>> = {
  PROPERTY: [["bedrooms", "Minimum bedrooms", "number"]],
  LAND: [
    ["landUse", "Land use"],
    ["minArea", "Minimum area", "number"],
  ],
  VEHICLE: [
    ["make", "Make"],
    ["transmission", "Transmission"],
  ],
  SERVICE: [["serviceType", "Service type"]],
};

export async function Browse({
  raw,
  category,
}: {
  raw: SearchParams;
  category?: Category;
}) {
  const parsed = searchQuery(raw, category);
  const path = browsePath(category);
  const title = category ? verticals[category].name : "Browse listings";
  const selected = (name: string) =>
    typeof raw[name] === "string" ? raw[name] : undefined;
  const params = new URLSearchParams();
  let result;
  let unavailable = false;
  if (parsed.success) {
    for (const [key, value] of Object.entries(parsed.data))
      if (value !== undefined && value !== "") params.set(key, String(value));
    try {
      result = await catalog(params);
    } catch {
      unavailable = true;
    }
  }
  function pageHref(page: number) {
    const query = new URLSearchParams(params);
    if (category) query.delete("category");
    query.delete("pageSize");
    query.set("page", String(page));
    return path + "?" + query;
  }
  const filterForm = (
    <form className="filters cuv-filter-form" action={path}>
      {!category && parsed.success && parsed.data.category && (
        <input type="hidden" name="category" value={parsed.data.category} />
      )}
      {parsed.success && parsed.data.currency !== "NGN" && (
        <input type="hidden" name="currency" value={parsed.data.currency} />
      )}
      <label>
        Search
        <input
          name="q"
          type="search"
          maxLength={120}
          defaultValue={selected("q")}
          placeholder="Title, location or reference"
        />
      </label>
      <label>
        City
        <input
          name="city"
          maxLength={100}
          defaultValue={selected("city")}
          placeholder="e.g. Lekki"
        />
      </label>
      <label>
        Minimum price (kobo)
        <input
          name="minPrice"
          inputMode="numeric"
          pattern="[0-9]{1,15}"
          defaultValue={selected("minPrice")}
        />
      </label>
      <label>
        Maximum price (kobo)
        <input
          name="maxPrice"
          inputMode="numeric"
          pattern="[0-9]{1,15}"
          defaultValue={selected("maxPrice")}
        />
      </label>
      {category &&
        selects[category]?.map(([name, label, options]) => (
          <label key={name}>
            {label}
            <select name={name} defaultValue={selected(name) ?? ""}>
              <option value="">Any</option>
              {Object.entries(options).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
      {category &&
        extras[category].map(([name, label, type]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              type={type ?? "text"}
              min={type ? 0 : undefined}
              step={name === "minArea" ? "any" : undefined}
              defaultValue={selected(name)}
            />
          </label>
        ))}
      <label>
        Sort
        <select name="sort" defaultValue={selected("sort") ?? "newest"}>
          <option value="newest">Newest</option>
          <option value="featured">Featured</option>
          <option value="price-low">Lowest price (NGN)</option>
          <option value="price-high">Highest price (NGN)</option>
        </select>
      </label>
      <div className="filter-actions">
        <button className="button button-dark">Apply filters</button>
        <Link href={path}>Clear</Link>
      </div>
    </form>
  );
  return (
    <div className="wrap browse lux-browse">
      <section
        className={
          category
            ? "cuv-catalog-hero " + collections[category].theme
            : "cuv-catalog-hero cuv-catalog-all"
        }
      >
        {category && (
          <img
            src={collections[category].image}
            alt=""
            width={752}
            height={500}
          />
        )}
        <div>
          <p className="cuv-crumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            {title}
          </p>
          <h1>{title}</h1>
          <p>
            {category
              ? collections[category].introduction
              : "Search properties, land, vehicles and professional services in one place."}
          </p>
        </div>
      </section>
      <nav className="category-tabs" aria-label="Listing categories">
        <Link href="/browse" aria-current={category ? undefined : "page"}>
          All listings
        </Link>
        {Object.values(verticals).map((entry) => (
          <Link
            key={entry.slug}
            href={"/browse/" + entry.slug}
            aria-current={path.endsWith("/" + entry.slug) ? "page" : undefined}
          >
            {entry.name}
          </Link>
        ))}
      </nav>

      <div className="cuv-discovery">
        <aside className="cuv-filter-sidebar">
          <h2>
            <SlidersHorizontal size={18} aria-hidden="true" /> Filters
          </h2>
          {filterForm}
        </aside>
        <div className="cuv-results">
          <div className="cuv-result-actions">
            <FilterDrawer>{filterForm}</FilterDrawer>
            {parsed.success && (
              <details className="cuv-save-search">
                <summary>
                  <Bookmark size={16} aria-hidden="true" /> Save search
                </summary>
                <SaveSearch filters={parsed.data} />
              </details>
            )}
          </div>
          {!parsed.success && (
            <div className="state" role="alert">
              <strong>Check your filters.</strong>{" "}
              {parsed.error.issues.map((issue) => issue.message).join(" · ")}
            </div>
          )}
          {unavailable && (
            <div className="state" role="alert">
              Listings are temporarily unavailable.{" "}
              <Link href={path + (params.size ? "?" + params : "")}>
                Try again
              </Link>
            </div>
          )}
          {result && (
            <>
              {parsed.success && parsed.data.q && (
                <CatalogSignal
                  key={parsed.data.q + "|" + (category ?? "ALL")}
                  event={result.total ? "SEARCH" : "ZERO_RESULTS"}
                  {...(category && { category })}
                />
              )}
              <div className="section-head result-head">
                <h2>
                  {result.total} {result.total === 1 ? "listing" : "listings"}
                </h2>
              </div>
              {result.items.length ? (
                <Cards items={result.items} />
              ) : (
                <div className="state cuv-empty">
                  <SearchX size={26} aria-hidden="true" />
                  <p>No listings match your filters.</p>
                  <Link href={path}>
                    Clear filters <ArrowRight size={16} />
                  </Link>
                </div>
              )}
              {result.total > result.pageSize && (
                <nav className="pagination" aria-label="Results pages">
                  {result.page > 1 && (
                    <Link href={pageHref(result.page - 1)}>← Previous</Link>
                  )}
                  <span>
                    Page {result.page} of{" "}
                    {Math.ceil(result.total / result.pageSize)}
                  </span>
                  {result.page * result.pageSize < result.total && (
                    <Link href={pageHref(result.page + 1)}>Next →</Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
