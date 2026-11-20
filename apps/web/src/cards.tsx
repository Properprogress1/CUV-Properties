import type { PublicListing } from "@marketplace/inventory";
import { ArrowUpRight, MapPin } from "lucide-react";
import Link from "next/link";
import { human, mediaUrl, price, verticals } from "./catalog";

export function Cards({ items }: { items: PublicListing[] }) {
  return (
    <div className="cards">
      {items.map((item) => {
        const cover = item.media.find((media) => media.cover);
        const detail = item.details;
        const summary =
          item.category === "PROPERTY"
            ? [
                detail.bedrooms === undefined
                  ? null
                  : `${detail.bedrooms} beds`,
                detail.offer,
              ]
            : item.category === "LAND"
              ? [
                  detail.area === undefined
                    ? null
                    : `${detail.area} ${detail.areaUnit === "SQM" ? "m²" : String(detail.areaUnit).toLowerCase()}`,
                  detail.landUse,
                ]
              : item.category === "VEHICLE"
                ? [detail.year, detail.transmission]
                : [detail.serviceType, detail.areaServed];
        return (
          <article
            className={"card cuv-card cuv-card-" + item.category.toLowerCase()}
            key={item.slug}
          >
            <Link href={"/listings/" + item.slug}>
              <div className="card-photo">
                {cover ? (
                  <img
                    src={mediaUrl(item.slug, cover.id)}
                    alt={cover.alt}
                    loading="lazy"
                    width={640}
                    height={420}
                  />
                ) : (
                  <span>No image available</span>
                )}
                {item.isDemo && (
                  <span className="demo-photo">Demo listing</span>
                )}
              </div>
              <div className="card-content">
                <p className="card-kind">
                  {verticals[item.category].name}
                  {item.featured && " · Featured"}
                </p>
                <h3>{item.title}</h3>
                <p className="card-location">
                  <MapPin size={14} aria-hidden="true" />
                  {item.location
                    ? `${item.location.city}, ${item.location.region}`
                    : "Location unavailable"}
                </p>
                <p className="card-spec">
                  {summary
                    .filter((part) => part !== null && part !== undefined)
                    .map((part) =>
                      typeof part === "string" && /^[A-Z_]+$/.test(part)
                        ? human(part)
                        : part,
                    )
                    .join(" · ")}
                </p>
                <p className="card-price">
                  {price(item)} <ArrowUpRight size={18} aria-hidden="true" />
                </p>
              </div>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
