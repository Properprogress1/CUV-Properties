import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  MapPin,
  Search,
} from "lucide-react";
import { collections } from "../src/collections";
import Link from "next/link";
import type { Metadata } from "next";
import { contentList, contentPage } from "../src/editorial";
import { Cards } from "../src/cards";
import { catalog, verticals } from "../src/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const home = (await contentPage("home").catch(() => null))?.content;
  return {
    ...(home?.seoTitle && { title: home.seoTitle }),
    ...(home?.seoDescription && { description: home.seoDescription }),
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const results = await Promise.allSettled([
    catalog(
      new URLSearchParams({
        category: "PROPERTY",
        sort: "featured",
        pageSize: "3",
      }),
    ),
    catalog(new URLSearchParams({ category: "SERVICE", pageSize: "4" })),
    contentList(),
    contentPage("home"),
  ]);
  const featured =
    results[0]?.status === "fulfilled" ? results[0].value.items : undefined;
  const services =
    results[1]?.status === "fulfilled"
      ? results[1].value.items.slice(0, 2)
      : undefined;
  const entries = results[2]?.status === "fulfilled" ? results[2].value : [];
  const home =
    results[3]?.status === "fulfilled" ? results[3].value?.content : undefined;
  const about = entries.find(({ kind }) => kind === "ABOUT")?.content;
  const locations = [
    ...new Set(
      (featured ?? []).flatMap(({ isDemo, location }) =>
        !isDemo && location ? [location.city] : [],
      ),
    ),
  ];
  const banners = entries.filter((item) => item.kind === "BANNER").slice(0, 3);
  return (
    <>
      {banners.map(({ slug, content }) => (
        <section className="wrap state editorial-banner" key={slug}>
          <strong>{content.title}</strong>
          <p className="description">{content.body}</p>
          {content.linkHref && (
            <Link href={content.linkHref}>{content.linkLabel}</Link>
          )}
        </section>
      ))}
      <section className="cuv-hero wrap lux-hero">
        <picture>
          <source
            media="(max-width: 42rem)"
            srcSet="/cuv-residence-mobile.webp"
          />
          <img
            src="/cuv-residence.webp"
            alt=""
            fetchPriority="high"
            width={1536}
            height={1024}
          />
        </picture>
        <div className="cuv-hero-copy">
          <p className="lux-kicker">
            <Building2 size={16} aria-hidden="true" /> CUV Properties
          </p>
          <h1>
            {home?.title || (
              <>
                Find a place
                <br />
                <em>worth calling yours.</em>
              </>
            )}
          </h1>
          <p>
            {home?.body ||
              "Discover homes, land and the professional expertise to help you take your next step across Nigeria."}
          </p>
          <div className="lux-actions">
            <Link className="button button-dark" href="/browse/properties">
              Explore properties <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <Link className="button button-light" href="/contact">
              Talk to our team
            </Link>
          </div>
          {home?.linkHref && (
            <Link className="cuv-hero-link" href={home.linkHref}>
              {home.linkLabel} <ArrowRight size={16} />
            </Link>
          )}
        </div>
        <span className="cuv-image-credit">Illustrative image</span>
      </section>
      <section className="wrap lux-search-section" aria-label="Find a listing">
        <div>
          <h2>Find your next listing</h2>
          <Link className="text-link" href="/browse/properties">
            Property filters <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <form className="cuv-search" action="/browse">
          <label className="cuv-search-category">
            <span>Category</span>
            <select name="category">
              <option value="">All categories</option>
              {Object.entries(verticals).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cuv-search-input">
            <span>What are you looking for?</span>
            <input name="q" placeholder="Try Lekki or SUV" maxLength={120} />
          </label>
          <button type="submit" className="button button-dark">
            <Search size={18} aria-hidden="true" />
            Search
          </button>
        </form>
      </section>
      <section className="wrap section cuv-collections">
        <div className="section-head">
          <h2>Browse by category</h2>
          <Link href="/browse" className="text-link cuv-link">
            Explore all listings <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="cuv-collection-grid">
          {Object.entries(verticals).map(([key, entry]) => (
            <Link
              className="cuv-collection"
              key={key}
              href={"/browse/" + entry.slug}
            >
              <img
                src={collections[key as keyof typeof collections].image}
                alt=""
                width={752}
                height={500}
                loading="lazy"
              />
              <span>
                <strong>{entry.name}</strong>
                <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="wrap section lux-featured">
        <div className="section-head">
          <h2>Featured properties</h2>
          <Link className="text-link" href="/browse/properties">
            View all properties ↗
          </Link>
        </div>
        {featured?.length ? (
          <Cards items={featured} />
        ) : (
          <p className="state">
            {featured
              ? "Published listings will appear here."
              : "Listings are temporarily unavailable."}
          </p>
        )}
      </section>
      <section className="lux-editorial-band">
        <div className="wrap lux-editorial-inner">
          <img
            src="/collections/service.webp"
            width={752}
            height={500}
            loading="lazy"
            alt=""
          />
          <div>
            <p className="lux-kicker">Professional services</p>
            <h2>Expertise for what comes next.</h2>
            <p>
              Find planning, design and development services, and request a
              quotation for your project.
            </p>
            <Link className="button lux-gold-button" href="/browse/services">
              Explore services <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            {services?.length ? (
              <ul className="lux-service-links">
                {services.map((entry) => (
                  <li key={entry.slug}>
                    <Link href={"/listings/" + entry.slug}>
                      {entry.title}
                      {entry.isDemo && " · Demo listing"}{" "}
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
      <section className="wrap section lux-about-home">
        <div>
          <p className="lux-kicker">About CUV Properties</p>
          <h2>{about?.title || "A clearer way to explore property."}</h2>
          <p>
            {about?.summary ||
              "Compare homes, commercial property and land by location and price. When a listing interests you, enquire directly or request a viewing."}
          </p>
          <Link className="text-link cuv-link" href="/about">
            About us <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className="lux-about-note">
          <MapPin size={24} aria-hidden="true" />
          <h3>
            {locations.length ? "Explore by location" : "Start with a location"}
          </h3>
          {locations.length > 0 && (
            <ul className="lux-location-links">
              {locations.map((city) => (
                <li key={city}>
                  <Link
                    href={"/browse/properties?city=" + encodeURIComponent(city)}
                  >
                    {city} <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p>
            Search the marketplace by city, property type or listing reference.
          </p>
          <Link className="text-link cuv-link" href="/browse/properties">
            Browse properties <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
