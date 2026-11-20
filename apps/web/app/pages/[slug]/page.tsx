import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentPage } from "../../../src/editorial";

type Props = { params: Promise<{ slug: string }> };

async function entry(slug: string) {
  const result = await contentPage(slug);
  if (!result || result.kind === "HOME" || result.kind === "BANNER") notFound();
  return result;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { content } = await entry(slug);
  return {
    title: content.seoTitle || content.title,
    description: content.seoDescription || content.summary,
    alternates: { canonical: "/pages/" + slug },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const { content } = await entry(slug);
  return (
    <article className="wrap account-page cuv-document editorial-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/pages">Marketplace information</Link>
      </nav>
      <header className="cuv-document-head">
        <h1>{content.title}</h1>
        {content.summary && <p>{content.summary}</p>}
      </header>
      <div className="description cuv-article-copy">{content.body}</div>
      {content.linkHref && (
        <Link className="button button-dark" href={content.linkHref}>
          {content.linkLabel}
        </Link>
      )}
    </article>
  );
}
