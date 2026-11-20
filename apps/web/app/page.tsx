import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
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
    catalog(new URLSearchParams({ sort: "featured", pageSize: "4" })),
    catalog(new URLSearchParams({ category: "SERVICE", pageSize: "2" })),
    contentList(),
    contentPage("home"),
  ]);
  const featured =
    results[0]?.status === "fulfilled" ? results[0].value.items : undefined;
  const services =
    results[1]?.status === "fulfilled" ? results[1].value.items : undefined;
  const entries = results[2]?.status === "fulfilled" ? results[2].value : [];
  const home =
    results[3]?.status === "fulfilled" ? results[3].value?.content : undefined;
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
      <section className="cuv-hero wrap">
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
          <h1>
            {home?.title || (
              <>
                Find your
                <br />
                <em>next move.</em>
              </>
            )}
          </h1>
          <p>
            {home?.body ||
              "Exceptional places, vehicles and professional expertise across Nigeria."}
          </p>
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
          {home?.linkHref && (
            <Link className="cuv-hero-link" href={home.linkHref}>
              {home.linkLabel} <ArrowRight size={16} />
            </Link>
          )}
        </div>
        <span className="cuv-image-credit">Illustrative image</span>
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
      <section className="wrap section">
        <div className="section-head">
          <h2>Featured listings</h2>
          <Link className="text-link" href="/browse">
            View all listings ↗
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
      {services && services.length > 0 && (
        <section className="wrap section">
          <div className="section-head">
            <h2>Professional services</h2>
            <Link className="text-link" href="/browse/services">
              Browse services ↗
            </Link>
          </div>
          <Cards items={services} />
        </section>
      )}
    </>
  );
}
