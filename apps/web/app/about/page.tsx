import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { contentPage } from "../../src/editorial";

export async function generateMetadata(): Promise<Metadata> {
  const entry = await contentPage("about").catch(() => null);
  return {
    title: entry?.content.seoTitle || "About CUV Properties",
    description:
      entry?.content.seoDescription ||
      entry?.content.summary ||
      "Learn about CUV Properties and explore the marketplace.",
    alternates: { canonical: "/about" },
  };
}

export default async function About() {
  const entry = await contentPage("about").catch(() => null);
  const content = entry?.kind === "ABOUT" ? entry.content : undefined;
  return (
    <div className="wrap cuv-document lux-about">
      <div className="lux-about-intro">
        <header className="cuv-document-head">
          <p className="lux-kicker">About us</p>
          <h1>{content?.title || "About CUV Properties"}</h1>
          <p>
            {content?.summary ||
              "A place to explore properties, land, vehicles and professional services across Nigeria."}
          </p>
        </header>
        <img src="/collections/property.webp" width={752} height={500} alt="" />
      </div>
      {content?.body && (
        <p className="description cuv-article-copy">{content.body}</p>
      )}
      <div className="lux-actions">
        {content?.linkHref && (
          <Link className="button button-dark" href={content.linkHref}>
            {content.linkLabel}
          </Link>
        )}
        <Link className="button button-light" href="/browse/properties">
          Explore properties <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
        <Link className="button button-light" href="/contact">
          Contact us
        </Link>
      </div>
    </div>
  );
}
