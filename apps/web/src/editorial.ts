import { cache } from "react";
import { apiOrigin } from "./catalog";

const source = (
  process.env.MARKETPLACE_INTERNAL_API_ORIGIN || apiOrigin
).replace(/\/$/, "");

export type EditorialEntry = {
  slug: string;
  kind: "HOME" | "BANNER" | "FAQ" | "ABOUT" | "CONTACT" | "BLOG" | "LEGAL";
  publishedAt: string;
  content: {
    title: string;
    body: string;
    summary: string;
    linkLabel: string;
    linkHref: string;
    seoTitle: string;
    seoDescription: string;
  };
};

export const contentList = cache(async (): Promise<EditorialEntry[]> => {
  const result = await fetch(source + "/api/v1/content", { cache: "no-store" });
  if (!result.ok) throw new Error("Content is unavailable");
  return result.json();
});
export const contentPage = cache(
  async (slug: string): Promise<EditorialEntry | null> => {
    const result = await fetch(
      source + "/api/v1/content/" + encodeURIComponent(slug),
      { cache: "no-store" },
    );
    if (result.status === 404) return null;
    if (!result.ok) throw new Error("Content is unavailable");
    return result.json();
  },
);
