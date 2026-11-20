import type { Metadata } from "next";
import Link from "next/link";
import { contentList } from "../../src/editorial";

export const metadata: Metadata = {
  title: "Marketplace information",
  alternates: { canonical: "/pages" },
};

export default async function Page() {
  const entries = (await contentList()).filter(
    (entry) => entry.kind !== "HOME" && entry.kind !== "BANNER",
  );
  const groups = [
    ["Marketplace", ["ABOUT", "CONTACT"]],
    ["Frequently asked questions", ["FAQ"]],
    ["Articles", ["BLOG"]],
    ["Legal information", ["LEGAL"]],
  ] as const;
  return (
    <div className="wrap account-page cuv-document">
      <header className="cuv-document-head">
        <h1>Marketplace information</h1>
      </header>
      {!entries.length && (
        <div className="account-panel cuv-info-empty">
          <p>No information pages are published yet.</p>
          <Link className="button button-dark" href="/browse">
            Browse listings
          </Link>
        </div>
      )}
      {groups.map(([heading, kinds]) => {
        const items = entries.filter((entry) =>
          (kinds as readonly string[]).includes(entry.kind),
        );
        return items.length ? (
          <section key={heading} className="detail-section">
            <h2>{heading}</h2>
            <ul className="account-panel cuv-info-list">
              {items.map((entry) => (
                <li key={entry.slug}>
                  <Link className="text-link" href={"/pages/" + entry.slug}>
                    {entry.content.title}
                  </Link>
                  {entry.content.summary && <p>{entry.content.summary}</p>}
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}
