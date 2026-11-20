import { ContactActions } from "../../../src/contact-actions";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  browsePath,
  catalog,
  human,
  listing,
  mediaUrl,
  price,
  siteOrigin,
  verticals,
} from "../../../src/catalog";
import {
  ListingEngagement,
  SaveListing,
} from "../../../src/listing-engagement";
import { ServiceRequestForm } from "../../../src/service-requests";
import { CatalogSignal } from "../../../src/catalog-signal";
import { CheckoutOffer } from "../../../src/commerce";
import { Gallery, Share } from "../../../src/gallery";
import { Cards } from "../../../src/cards";

export const dynamic = "force-dynamic";
const load = cache(listing);
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) notFound();
  const cover = item.media.find((media) => media.cover);
  const description = item.description.slice(0, 155);
  return {
    title: item.title,
    description,
    alternates: { canonical: "/listings/" + slug },
    openGraph: {
      title: item.title,
      description,
      ...(cover && {
        images: [{ url: mediaUrl(slug, cover.id), alt: cover.alt }],
      }),
    },
    ...(item.isDemo && { robots: { index: false, follow: true } }),
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const item = await load(slug);
  if (!item) notFound();
  const related = await catalog(
    new URLSearchParams({
      category: item.category,
      pageSize: "4",
    }),
  )
    .then(({ items }) =>
      items
        .filter((other) => other.slug !== slug && other.isDemo === item.isDemo)
        .slice(0, 3),
    )
    .catch(() => []);
  const amenities =
    item.category === "PROPERTY" ? item.details.amenities : undefined;
  const specs = Object.entries(item.details).filter(
    ([key]) => key !== "amenities" || !amenities,
  );
  const label = verticals[item.category].name;
  const url = new URL("/listings/" + slug, siteOrigin).href;
  const images = [...item.media]
    .sort((a, b) => Number(b.cover) - Number(a.cover))
    .map((media) => ({ ...media, src: mediaUrl(slug, media.id) }));
  return (
    <div className="wrap detail cuv-detail-page">
      {!item.isDemo && <CatalogSignal event="VIEW" slug={slug} />}
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link> /{" "}
        <Link href={browsePath(item.category)}>{label}</Link> /{" "}
        <span>{item.reference}</span>
      </nav>
      <div className="page-head detail-head cuv-detail-head">
        <h1>{item.title}</h1>
        {item.location && (
          <p className="cuv-location">
            <MapPin size={18} aria-hidden="true" />
            {item.location.city}, {item.location.region}
          </p>
        )}
      </div>
      {item.isDemo && (
        <p className="state demo-state">
          Demo listing with synthetic details and imagery.
        </p>
      )}
      <div className="detail-grid cuv-detail-grid">
        <div className="cuv-detail-gallery">
          <Gallery items={images} />
        </div>
        <div className="cuv-detail-body">
          <section className="detail-section">
            <h2>Overview</h2>
            <p className="description">{item.description}</p>
          </section>
          <section className="detail-section">
            <h2>Specifications</h2>
            <dl className="specs">
              {specs.map(([key, value]) => (
                <div key={key}>
                  <dt>{human(key)}</dt>
                  <dd>
                    {typeof value === "string" && /^[A-Z_]+$/.test(value)
                      ? human(value)
                      : value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {amenities && (
            <section className="detail-section">
              <h2>Amenities</h2>
              <p className="description">{amenities}</p>
            </section>
          )}
          {item.location && (
            <section className="detail-section lux-listing-location">
              <MapPin size={22} aria-hidden="true" />
              <div>
                <h2>Location</h2>
                <p>
                  {item.location.city}, {item.location.region}
                </p>
                <Link
                  className="text-link cuv-link"
                  href={
                    browsePath(item.category) +
                    "?city=" +
                    encodeURIComponent(item.location.city)
                  }
                >
                  Explore nearby listings{" "}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </section>
          )}
          {item.verificationScope && (
            <section className="detail-section">
              <h2>Verification scope</h2>
              <p>{item.verificationScope}</p>
            </section>
          )}
        </div>
        <aside
          className="detail-aside cuv-detail-summary"
          aria-label="Listing summary"
        >
          <p className="detail-price">{price(item)}</p>
          <p>
            Published{" "}
            {new Intl.DateTimeFormat("en-NG", {
              dateStyle: "medium",
              timeZone: "Africa/Lagos",
            }).format(new Date(item.publishedAt))}
          </p>
          {item.isDemo ? (
            <Link
              href={browsePath(item.category)}
              className="button button-dark"
            >
              Browse similar listings{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <a
              href="#engagement"
              data-analytics-contact
              className="button button-dark"
            >
              Enquire or book <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          )}
          {!item.isDemo && (
            <ContactActions listing={{ reference: item.reference, url }} />
          )}
          <SaveListing slug={slug} />
          <Share title={item.title} url={url} />
        </aside>
      </div>
      {!item.isDemo && item.category === "SERVICE" && (
        <ServiceRequestForm slug={slug} />
      )}
      {!item.isDemo &&
        item.category === "SERVICE" &&
        item.details.pricingModel === "FIXED" && <CheckoutOffer slug={slug} />}
      {!item.isDemo && <ListingEngagement slug={slug} />}
      {related.length > 0 && (
        <section className="section lux-related">
          <div className="section-head">
            <h2>
              {item.category === "PROPERTY"
                ? "Related properties"
                : "Related listings"}
            </h2>
            <Link
              className="text-link cuv-link"
              href={browsePath(item.category)}
            >
              Browse more <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <Cards items={related} />
        </section>
      )}
    </div>
  );
}
